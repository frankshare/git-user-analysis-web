// GitHub OAuth Device Flow —— 绕开 gh 的本地回调端口限制
// 用法：node scripts/gh-device-login.mjs
// 会在控制台打印一次性 code 与验证 URL，验证成功后把 token 写入 gh 凭据存储
import { execFileSync } from 'node:child_process';

const CLIENT_ID = process.env.GH_CLIENT_ID || 'Iv1.b231c327f1eaa229';
const SCOPES = 'repo workflow admin:public_key';

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'git-user-analysis-deploy',
};

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body).toString(),
  });
  return { status: res.status, json: await res.json() };
}

async function get(url, token) {
  const res = await fetch(url, {
    headers: { ...headers, Authorization: `Bearer ${token}` },
  });
  return { status: res.status, json: await res.json() };
}

// 1. 申请 device code
console.log('[auth] 申请 device code…');
const dev = await post('https://github.com/login/device/code', {
  client_id: CLIENT_ID,
  scope: SCOPES,
});
if (dev.status !== 200) {
  console.error(`[auth] 申请失败：${JSON.stringify(dev.json).slice(0, 300)}`);
  process.exit(1);
}

console.log('');
console.log('============================================================');
console.log('  请在浏览器打开下面的地址，登录 GitHub 后输入一次性代码：');
console.log('');
console.log(`  ${dev.json.verification_uri_complete}`);
console.log('');
console.log(`  若上面的地址不自动带上代码，手动打开 ${dev.json.verification_uri}`);
console.log(`  然后输入代码：${dev.json.user_code}`);
console.log('');
console.log('  本脚本会持续等待，完成后自动保存凭据。');
console.log('============================================================');
console.log('');

// 2. 轮询 token
const interval = (dev.json.interval || 5) * 1000;
const deadline = Date.now() + (dev.json.expires_in || 900) * 1000;

while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, interval));
  const tok = await post('https://github.com/login/oauth/access_token', {
    client_id: CLIENT_ID,
    device_code: dev.json.device_code,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });

  if (tok.status === 200 && tok.json.access_token) {
    const token = tok.json.access_token;
    const who = await get('https://api.github.com/user', token);
    const login = who.json.login || 'unknown';
    const scopes = tok.json.scope || '';

    console.log(`[auth] 成功！账号：${login}`);
    console.log(`[auth] 授权范围：${scopes}`);

    // 写回 gh 的 hosts.yml
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const dir = path.join(os.homedir(), 'AppData', 'Roaming', 'GitHub CLI');
    fs.mkdirSync(dir, { recursive: true });
    const hostsPath = path.join(dir, 'hosts.yml');
    fs.writeFileSync(
      hostsPath,
      `github.com:\n    users:\n        ${login}:\n    user: ${login}\n    oauth_token: ${token}\n`,
      'utf-8'
    );
    console.log(`[auth] 凭据已写入 ${hostsPath}`);

    // 顺带写 git 凭据，让 git push 也能用
    try {
      execFileSync('cmd.exe', ['/c', `git config --global credential.helper store`], { stdio: 'ignore' });
      const credPath = path.join(os.homedir(), '.git-credentials');
      fs.writeFileSync(credPath, `https://${login}:${token}@github.com\n`, 'utf-8');
      console.log('[auth] git 凭据已配置');
    } catch (e) {
      console.log('[auth] git 凭据配置跳过（不影响 gh 使用）');
    }

    console.log('');
    console.log('接下来可以执行：node scripts/deploy-pages.mjs');
    process.exit(0);
  }

  if (tok.json.error === 'authorization_pending') {
    process.stdout.write('.');
    continue;
  }
  if (tok.json.error === 'slow_down') {
    await new Promise(r => setTimeout(r, 5000));
    continue;
  }
  console.error(`\n[auth] 失败：${tok.json.error} ${tok.json.error_description || ''}`);
  process.exit(1);
}

console.error('\n[auth] 超时，device code 已过期');
process.exit(1);
