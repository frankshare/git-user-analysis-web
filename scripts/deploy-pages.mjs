// 一键部署到 GitHub Pages
// 用法：
//   node scripts/deploy-pages.mjs                    # 需要已配置 GH_TOKEN 环境变量
//   $env:GH_TOKEN='ghp_xxx'; node scripts/deploy-pages.mjs
//
// 流程：构建 → 准备 gh-pages 分支 → 提交 → 推送到 GitHub
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = process.env.PAGES_REPO || 'frankshare/git-user-analysis-web';
const BRANCH = 'gh-pages';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const DIST = path.resolve('dist');
const TMP = path.resolve('.pages-deploy');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf-8',
    stdio: opts.capture ? 'pipe' : 'inherit',
    ...opts,
  });
}

function sh(cmd) { return run('cmd.exe', ['/c', cmd], { capture: true }); }

if (!TOKEN) {
  console.error('[deploy] 缺少 GH_TOKEN 环境变量。');
  console.error('[deploy] 生成方式：https://github.com/settings/tokens');
  console.error('[deploy] 需要权限：Contents(读写) + Pages(读写)；仓库需为 public。');
  process.exit(1);
}

if (!fs.existsSync(DIST)) {
  console.error('[deploy] dist/ 不存在，先跑 pnpm run build');
  process.exit(1);
}

console.log(`[deploy] 目标仓库：${REPO}（分支 ${BRANCH}）`);

// 1. 用 API 检查/创建仓库
const [owner, repo] = REPO.split('/');
const apiHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'git-user-analysis-deploy',
};

async function api(pathname, method = 'GET', body = null) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: { ...apiHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, json, text };
}

// 2. 仓库不存在就建
let repoInfo = await api(`/repos/${REPO}`);
if (repoInfo.status === 404) {
  console.log('[deploy] 仓库不存在，尝试创建…');
  const repoName = REPO.split('/')[1];
  const created = await api(`/user/repos`, 'POST', {
    name: repoName,
    description: 'Git 用户深度画像与高星 Skill 复用库 — 方法收敛簇与可执行检查清单',
    private: false,
    auto_init: false,
    has_issues: false,
    has_wiki: false,
  });
  if (created.status >= 400) {
    console.error(`[deploy] 创建仓库失败：${created.text.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[deploy] 已创建仓库 ${created.json.html_url}`);
} else if (repoInfo.status === 200) {
  console.log(`[deploy] 仓库已存在：${repoInfo.json.html_url}（private=${repoInfo.json.private}）`);
} else {
  console.error(`[deploy] 查询仓库失败：${repoInfo.text.slice(0, 300)}`);
  process.exit(1);
}

// 3. 准备 gh-pages 分支
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

// 用 token 走 https remote
const remote = `https://x-access-token:${TOKEN}@github.com/${REPO}.git`;
const env = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'echo',
  http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '',
};

function git(args, cwd = TMP) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', env, stdio: 'pipe' });
}

console.log('[deploy] 初始化 gh-pages 分支…');
run('cmd.exe', ['/c', 'git init'], { cwd: TMP, env });
try { git(['checkout', '-B', BRANCH]); } catch { /* 初始提交前无 HEAD */ }

// 4. 拷入构建产物
console.log('[deploy] 拷贝 dist/ …');
for (const entry of fs.readdirSync(DIST)) {
  fs.cpSync(path.join(DIST, entry), path.join(TMP, entry), { recursive: true });
}

// 5. .nojekyll（避免 _astro 目录被 Jekyll 忽略）
fs.writeFileSync(path.join(TMP, '.nojekyll'), '');

// 6. 提交
git(['add', '-A']);
try {
  git(['commit', '-m', `deploy: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`]);
} catch (e) {
  console.log('[deploy] 无变更可提交，跳过 commit');
}

// 7. 推送
console.log('[deploy] 推送到 GitHub…');
git(['remote', 'add', 'origin', remote]);
try {
  git(['push', '-f', 'origin', `HEAD:${BRANCH}`]);
} catch (e) {
  console.error(`[deploy] 推送失败：${e.stdout || e.message}`);
  process.exit(1);
}
console.log('[deploy] 推送完成');

// 8. 开启 Pages
console.log('[deploy] 开启 GitHub Pages…');
const pages = await api(`/repos/${REPO}/pages`, 'POST', {
  source: { branch: BRANCH, path: '/' },
});
if (pages.status >= 400 && pages.status !== 409) {
  console.log(`[deploy] Pages API 返回 ${pages.status}（可能需要手动在仓库设置里开启）：${pages.text.slice(0, 200)}`);
} else {
  console.log(`[deploy] Pages 已启用：${pages.json?.html_url || '（手动确认）'}`);
}

const siteUrl = `https://${owner}.github.io/${repo.split('/')[1]}/`;
console.log('');
console.log(`[deploy] 完成。站点地址：${siteUrl}`);
console.log('[deploy] 首次部署需 1–3 分钟生效，GitHub Actions 会跑 build & deploy。');

fs.rmSync(TMP, { recursive: true, force: true });
