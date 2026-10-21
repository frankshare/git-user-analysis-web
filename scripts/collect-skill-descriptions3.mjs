// 文件级全量 v3：git trees API 列全部 SKILL.md（1 call/仓）+ raw.githubusercontent 取原文（非 API 配额）
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('需要 GH_TOKEN'); process.exit(1); }
const DATA_DIR = 'D:/Obsidian/MyVault/5-Git用户分析/_data';
const OUT = 'D:/Documents/deepseek-harness/default-workspace/_gh/skill-descriptions.json';
const headers = { 'User-Agent': 'git-user-analysis-desc3', 'Accept': 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}` };

let calls = 0, rawCalls = 0; const errs = [];
async function api(p) {
  for (let i = 0; i < 4; i++) {
    calls++;
    try {
      const res = await fetch(`https://api.github.com/${p}`, { headers });
      if (res.status === 404) return null;
      if (res.status === 403) { await new Promise(r => setTimeout(r, 4000 * (i + 1))); continue; }
      if (res.status === 200) return await res.json();
      return null;
    } catch (e) { errs.push(e.message); await new Promise(r => setTimeout(r, 2000)); }
  }
  return null;
}
async function raw(login, repo, p) {
  for (let i = 0; i < 3; i++) {
    rawCalls++;
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${login}/${repo}/HEAD/${p.split('/').map(encodeURIComponent).join('/')}`);
      if (res.status === 200) return await res.text();
      if (res.status === 404) return null;
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) { errs.push(e.message); await new Promise(r => setTimeout(r, 1500)); }
  }
  return null;
}
function parseFm(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/); const out = {}; let i = 0;
  while (i < lines.length) {
    const km = lines[i].match(/^([A-Za-z][A-Za-z0-9_.-]*):(?:\s*(.*))?$/);
    if (!km) { i++; continue; }
    const key = km[1].toLowerCase(); let val = (km[2] || '').trim();
    if (/^[>|][-+]?$/.test(val)) {
      const buf = []; i++;
      while (i < lines.length && (lines[i].startsWith(' ') || lines[i].startsWith('\t') || lines[i].trim() === '')) { buf.push(lines[i].replace(/^\s{2,4}/, '')); i++; }
      out[key] = buf.join(' ').replace(/\s+/g, ' ').trim(); continue;
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val; i++;
  }
  return out;
}

const targets = [];
for (const f of fs.readdirSync(DATA_DIR).filter(x => x.endsWith('.json') && !['convergence.json', 'format-adoption.json'].includes(x))) {
  const login = f.replace('.json', '');
  const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
  for (const s of d.skills?.items || []) if (s.repo && s.repo !== login) targets.push({ login, repo: s.repo });
}
const seen = new Set(); const uniq = [];
for (const t of targets) { const k = t.login + '/' + t.repo; if (!seen.has(k)) { seen.add(k); uniq.push(t); } }
console.log(`待采集 ${uniq.length} 个仓`);

const all = []; let reposWithSkill = 0;
for (const [i, t] of uniq.entries()) {
  const tree = await api(`repos/${t.login}/${t.repo}/git/trees/HEAD?recursive=1`);
  if (!tree?.tree) { console.log(`  ! ${t.login}/${t.repo} tree 失败`); continue; }
  const hits = tree.tree.filter(x => x.type === 'blob' && /(^|\/)SKILL\.md$/i.test(x.path));
  if (!hits.length) continue;
  reposWithSkill++;
  for (const b of hits) {
    const content = await raw(t.login, t.repo, b.path);
    if (!content) continue;
    const fm = parseFm(content);
    all.push({
      login: t.login, repo: t.repo, path: b.path,
      hasFm: !!fm, name: fm?.name ?? null, description: fm?.description ?? null,
      fields: fm ? Object.keys(fm) : [],
      descLen: fm?.description ? fm.description.length : 0,
      bytes: content.length,
    });
  }
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${uniq.length} 有skill仓${reposWithSkill} 累积 ${all.length} 个 SKILL.md (api ${calls}, raw ${rawCalls})`);
  if (i % 10 === 9) fs.writeFileSync(OUT, JSON.stringify(all, null, 2), 'utf-8'); // 中途落盘
}
fs.writeFileSync(OUT, JSON.stringify(all, null, 2), 'utf-8');
console.log(`\n完成：${all.length} 个 SKILL.md，来自 ${reposWithSkill} 个仓（api ${calls}, raw ${rawCalls}）`);
if (errs.length) console.log('错误', errs.length, errs.slice(0, 3));
