// 全量普查：所有创作者 skill 仓的 SKILL.md（用 git trees 一次定位，避免逐路径探测）
// 用法：$env:GH_TOKEN='...'; node scripts/verify-skill-format-full.mjs
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('需要 GH_TOKEN'); process.exit(1); }
const DATA_DIR = 'D:/Obsidian/MyVault/5-Git用户分析/_data';
const OUT = 'D:/Documents/deepseek-harness/default-workspace/_gh/skill-format-full.json';

const headers = { 'User-Agent': 'git-user-analysis-full', 'Accept': 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}` };
let calls = 0;
const errs = [];
async function api(p) {
  for (let i = 0; i < 4; i++) {
    calls++;
    try {
      const res = await fetch(`https://api.github.com/${p}`, { headers });
      if (res.status === 404) return null;
      if (res.status === 403) { await new Promise(r => setTimeout(r, 3000 * (i + 1))); continue; }
      if (res.status === 200) return await res.json();
      if (res.status === 409) return null;
    } catch (e) {
      errs.push(e.message);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return null;
}

const targets = [];
for (const f of fs.readdirSync(DATA_DIR).filter(x => x.endsWith('.json') && !['convergence.json', 'format-adoption.json'].includes(x))) {
  const login = f.replace('.json', '');
  const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
  for (const s of d.skills?.items || []) {
    if (s.repo && s.repo !== login) targets.push({ login, repo: s.repo });
  }
}
// 去重
const seen = new Set(); const uniq = [];
for (const t of targets) { const k = t.login + '/' + t.repo; if (!seen.has(k)) { seen.add(k); uniq.push(t); } }
console.log(`待普查 ${uniq.length} 个 skill 仓`);

// 自检：先探 1 个仓，确认 API 通路与 SKILL.md 定位逻辑可用，否则直接中止（避免静默 0 结果）
{
  const t0 = uniq[0];
  const tree0 = await api(`repos/${t0.login}/${t0.repo}/git/trees/HEAD?recursive=1`);
  if (!tree0?.tree) {
    console.error('[自检失败] 拿不到 git tree，API 通路有问题。错误样本:', errs.slice(0, 3));
    process.exit(1);
  }
  const probe = tree0.tree.filter(x => x.type === 'blob' && /(^|\/)SKILL\.md$/i.test(x.path));
  console.log(`[自检] ${t0.login}/${t0.repo} tree=${tree0.tree.length} 项, SKILL.md 命中 ${probe.length} 个`);
  if (errs.length) console.error('注意：已有网络错误样本', errs.slice(0, 3));
}

const results = [];
for (const [i, t] of uniq.entries()) {
  const tree = await api(`repos/${t.login}/${t.repo}/git/trees/HEAD?recursive=1`);
  let skillPath = null;
  if (tree?.tree) {
    const hits = tree.tree.filter(x => x.type === 'blob' && /(^|\/)SKILL\.md$/i.test(x.path));
    if (hits.length) {
      // 优先级：根目录 > 浅层 > 含 skill 字样
      hits.sort((a, b) => {
        const dep = p => p.split('/').length;
        const sa = /skill/i.test(a.path) ? 0 : 1, sb = /skill/i.test(b.path) ? 0 : 1;
        return dep(a.path) - dep(b.path) || sa - sb || a.path.localeCompare(b.path);
      });
      skillPath = hits[0].path;
    }
  }
  if (!skillPath) { results.push({ ...t, found: false }); }
  else {
    const blob = await api(`repos/${t.login}/${t.repo}/contents/${skillPath.split('/').map(encodeURIComponent).join('/')}`);
    let content = '';
    if (blob?.content) content = Buffer.from(blob.content, 'base64').toString('utf-8');
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let desc = null, name = null;
    if (fm) {
      const body = fm[1];
      const dm = body.match(/^description:\s*(.*)$/m);
      if (dm) desc = dm[1].trim().replace(/^["']|["']$/g, '');
      if (desc && /[>|]/.test(desc)) desc = desc.replace(/[>|]/g, '').trim(); // 折叠/块标量的首行
      const nm = body.match(/^name:\s*(.*)$/m);
      if (nm) name = nm[1].trim().replace(/^["']|["']$/g, '');
    }
    const fields = fm ? [...fm[1].matchAll(/^([A-Za-z][A-Za-z0-9_-]*):/gm)].map(m => m[1].toLowerCase()) : [];
    results.push({ ...t, found: true, path: skillPath, hasFm: !!fm, fields, name, description: desc, len: content.length });
  }
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${uniq.length} (api calls ${calls})`);
}
fs.writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf-8');
const found = results.filter(r => r.found);
console.log(`\n找到 SKILL.md：${found.length}/${results.length}，API 调用 ${calls}`);
const n = found.length;
for (const [k, label] of [['hasFm','有 frontmatter'],['fields','name'],['description','有 description']]) {
  const c = k === 'fields' ? found.filter(r => r.fields.includes('name')).length : found.filter(r => r[k]).length;
  console.log(`${label.padEnd(20)} ${c}/${n}`);
}
