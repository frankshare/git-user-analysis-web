// 步骤1：列出所有 skill 仓里全部 SKILL.md 路径（1 API call / 仓），落盘
import fs from 'node:fs'; import path from 'node:path';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const DATA_DIR = 'D:/Obsidian/MyVault/5-Git用户分析/_data';
const OUT = 'D:/Documents/deepseek-harness/default-workspace/_gh/skill-paths.json';
const headers = { 'User-Agent': 'gpa-paths', Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}` };
let calls = 0;
async function api(p) {
  for (let i = 0; i < 4; i++) {
    calls++;
    try {
      const r = await fetch(`https://api.github.com/${p}`, { headers });
      if (r.status === 200) return await r.json();
      if (r.status === 404 || r.status === 409) return null;
      if (r.status === 403) { await new Promise(x => setTimeout(x, 4000 * (i + 1))); continue; }
      return null;
    } catch { await new Promise(x => setTimeout(x, 2000)); }
  }
  return null;
}
const seen = new Set(); const targets = [];
for (const f of fs.readdirSync(DATA_DIR).filter(x => x.endsWith('.json') && !['convergence.json', 'format-adoption.json'].includes(x))) {
  const login = f.replace('.json', '');
  const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
  for (const s of d.skills?.items || []) {
    if (!s.repo || s.repo === login) continue;
    const k = login + '/' + s.repo;
    if (seen.has(k)) continue; seen.add(k); targets.push({ login, repo: s.repo });
  }
}
console.log(`仓数 ${targets.length}`);
const out = {};
for (const [i, t] of targets.entries()) {
  const tree = await api(`repos/${t.login}/${t.repo}/git/trees/HEAD?recursive=1`);
  const paths = tree?.tree ? tree.tree.filter(x => x.type === 'blob' && /(^|\/)SKILL\.md$/i.test(x.path)).map(x => x.path) : [];
  out[`${t.login}/${t.repo}`] = paths;
  if ((i + 1) % 25 === 0) { console.log(`  ${i + 1}/${targets.length} (api ${calls})`); fs.writeFileSync(OUT, JSON.stringify(out, null, 2)); }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const total = Object.values(out).reduce((a, b) => a + b.length, 0);
console.log(`完成：${Object.keys(out).length} 仓，${total} 个 SKILL.md，api ${calls}`);
