// 部署到 GitHub Pages —— 自动选择可用路径并输出权限诊断
// 用法：node scripts/deploy.mjs [repo] [branch]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// 注意：GitHub API 在本机**必须走系统代理**（http_proxy=127.0.0.1:7897），
// 直连会 404（被墙）。但走代理时偶发 SocketError，需要重试。
// fetch 会自动继承 http_proxy/https_proxy 环境变量，正好满足需求。

const REPO = process.argv[2] || 'frankshare/git-user-analysis-web';
const BRANCH = process.argv[3] || 'main';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const [owner, name] = REPO.split('/');

if (!TOKEN) {
  console.error('缺少 GH_TOKEN 环境变量');
  process.exit(1);
}

const API = `https://api.github.com/repos/${REPO}`;
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'git-user-analysis-deploy',
};

async function api(p, method = 'GET', body = null) {
  // 走代理时偶发 SocketError / 422（other side closed），重试即可。
  // 422 在这里不是「分支不存在」，而是连接被代理掐断的假象。
  let res;
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      res = await fetch(`${API}${p}`, {
        method,
        headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      // 422 视为瞬时故障重试（连续 5 次都 422 才当真问题）
      if (res.status === 422 && attempt < 4) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      break;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  if (!res) throw lastErr;
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// ---- 权限诊断 ----
console.log('[deploy] 诊断 token 权限…');
const probe = async (label, p, method, body) => {
  const r = await api(p, method, body);
  const ok = r.status < 400 || r.status === 404 || r.status === 422;
  console.log(`  ${label}: ${r.status} ${ok ? '' : '✗'}`);
  return r;
};
await probe('读 repo（可能 404，token 无权读元信息属正常）', '/');
await probe('读 contents', '/contents/package.json');
// 探测必须用「确定不存在」的路径。全新文件能写成功 = 权限 OK。
const probePath = `/contents/.deploy-probe-${Date.now()}`;
const w = await probe('写 contents（全新路径）', probePath, 'PUT', { message: 'probe', content: 'cHJvYmU=', branch: BRANCH });

// 权限判定：只有 401 / 403 才是真没权限。
// 404 = 路径已存在（极少见）；422 = 代理掐断（已重试过）。
if (w.status === 401 || w.status === 403) {
  console.log('');
  console.log(`[deploy] ✗ token 没有 Contents 写权限（探测返回 ${w.status}）。`);
  console.log('');
  console.log('  修复：打开 https://github.com/settings/personal-access-tokens');
  console.log('  找到本 token → Edit → Repository permissions → Contents');
  console.log('  把 Read 改成 Read and write → Save');
  console.log('  （若列表里没有本仓库，需在 Repository access 里 Add 选中它）');
  process.exit(2);
}
console.log('[deploy] 权限探测通过，继续');

// ---- 确保仓库存在 ----
const repoRes = await api('/');
// 建仓前先确认：GET repo 返回 404 有两种含义——仓库不存在，或 token 无权读该仓库元信息。
// 用「能否读 contents」做二次判断，避免把「无权读」误判成「不存在」而重复建仓。
if (repoRes.status === 404) {
  // 直接试写一个探针文件：能写说明仓库存在且有 Contents 写权限
  const probe = await api('/contents/.deploy-probe', 'PUT', {
    message: 'probe', content: 'cHJvYmU=', branch: BRANCH,
  });
  if (probe.status < 400) {
    console.log(`[deploy] 仓库已存在且可写：${REPO}`);
    // 清理探针
    const pr = await api('/contents/.deploy-probe?ref=' + BRANCH);
    if (pr.status === 200) {
      await api('/contents/.deploy-probe', 'DELETE', {
        message: 'cleanup probe', sha: pr.json.sha, branch: BRANCH,
      });
    }
  } else {
    console.log('[deploy] 仓库不存在或不可写，尝试创建…');
    const created = await api('/user/repos', 'POST', { name, description: 'Git 用户深度画像与高星 Skill 复用库', private: false, auto_init: false });
    if (created.status >= 400) {
      if (created.json?.errors?.some(e => e.code === 'already_exists' || e.message?.includes('already exists'))) {
        console.log(`  仓库已存在：${REPO}`);
      } else {
        console.error(created.text.slice(0, 200));
        console.error('  若提示 404/403，通常是 token 缺少 Account permission → Create repositories。');
        process.exit(1);
      }
    } else {
      console.log(`  已创建 ${created.json.html_url}`);
    }
  }
} else {
  console.log(`[deploy] 仓库存在 ${repoRes.json.html_url}`);
}

// ---- 上传文件（Contents API）----
function collect(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git','node_modules','dist','.astro','.pages-deploy','.apitest'].includes(e.name)) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(full, rel)); else out.push({ rel, full });
  }
  return out;
}

const files = collect(path.resolve('.'));
console.log(`[deploy] 上传 ${files.length} 个文件…`);
let ok = 0;
for (const f of files) {
  const content = fs.readFileSync(f.full).toString('base64');
  const ex = await api(`/contents/${encodeURI(f.rel)}?ref=${BRANCH}`);
  const body = { message: `deploy: ${f.rel}`, content, branch: BRANCH };
  if (ex.status === 200) body.sha = ex.json.sha;
  const r = await api(`/contents/${encodeURI(f.rel)}`, 'PUT', body);
  if (r.status >= 400) { console.error(`  ✗ ${f.rel}: ${r.text.slice(0,120)}`); process.exit(1); }
  ok++;
  if (ok % 20 === 0) console.log(`  ${ok}/${files.length}…`);
}
console.log(`[deploy] ✓ ${ok} 个文件已推送`);

// ---- 开 Pages ----
const pages = await api('/pages', 'POST', { source: { branch: BRANCH, path: '/' } });
console.log(`[deploy] Pages: ${pages.status < 400 || pages.status === 409 ? '已启用' : pages.status + ' 需手动开启'}`);
console.log(`[deploy] 站点地址：https://${owner}.github.io/${name}/`);
