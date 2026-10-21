// 部署到 GitHub Pages —— 自动选择可用路径并输出权限诊断
// 用法：node scripts/deploy.mjs [repo] [branch]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

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
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
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
await probe('读 repo', '/');
await probe('读 contents', '/contents/package.json');
const w = await probe('写 contents', '/contents/_probe.txt', 'PUT', { message: 'probe', content: 'cHJvYmU=', branch: BRANCH });
const canWrite = w.status < 400;

if (!canWrite) {
  console.log('');
  console.log('[deploy] ✗ token 没有 Contents 写权限，无法推送。');
  console.log('');
  console.log('  修复：打开 https://github.com/settings/personal-access-tokens');
  console.log('  找到本 token → Edit → Repository permissions → Contents');
  console.log('  把 Read 改成 Read and write → Save');
  console.log('  （若列表里没有本仓库，需在 Repository access 里 Add 选中它）');
  console.log('');
  console.log('  另外注意：fine-grained PAT 的「Account permissions → Create repositories」');
  console.log('  是创建新仓用的，与推送内容无关。');
  process.exit(2);
}

// ---- 确保仓库存在 ----
const repoRes = await api('/');
if (repoRes.status === 404) {
  console.log('[deploy] 创建仓库…');
  const created = await api('/user/repos', 'POST', { name, description: 'Git 用户深度画像与高星 Skill 复用库', private: false, auto_init: false });
  if (created.status >= 400) { console.error(created.text.slice(0, 200)); process.exit(1); }
  console.log(`  已创建 ${created.json.html_url}`);
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
