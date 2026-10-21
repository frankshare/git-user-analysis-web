// 文件级全量：把所有 skill 仓里的每一个 SKILL.md 都取回来，解析 name/description 原文
// 目的：验证「格式趋同之后，写法是否也趋同」
// 用法：$env:GH_TOKEN='...'; node scripts/collect-skill-descriptions.mjs
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('需要 GH_TOKEN'); process.exit(1); }
const DATA_DIR = 'D:/Obsidian/MyVault/5-Git用户分析/_data';
const OUT = 'D:/Documents/deepseek-harness/default-workspace/_gh/skill-descriptions.json';

const headers = { 'User-Agent': 'git-user-analysis-desc', 'Accept': 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}` };
let calls = 0; const errs = [];
async function api(p) {
  for (let i = 0; i < 4; i++) {
    calls++;
    try {
      const res = await fetch(`https://api.github.com/${p}`, { headers });
      if (res.status === 404) return null;
      if (res.status === 403) { await new Promise(r => setTimeout(r, 3000 * (i + 1))); continue; }
      if (res.status === 200) return await res.json();
      if (res.status === 409) return null;
    } catch (e) { errs.push(e.message); await new Promise(r => setTimeout(r, 1500)); }
  }
  return null;
}

// 轻量 YAML frontmatter 解析：够用即可（标量、引号、折叠块、列表）
function parseFm(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const body = m[1];
  const lines = body.split(/\r?\n/);
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const km = line.match(/^([A-Za-z][A-Za-z0-9_.-]*):(?:\s*(.*))?$/);
    if (!km) { i++; continue; }
    const key = km[1].toLowerCase();
    let val = (km[2] || '').trim();
    if (val === '>' || val === '|' || val === '>-' || val === '|-') {
      const buf = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
        buf.push(lines[i].replace(/^\s{2,4}/, ''));
        i++;
      }
      val = buf.join(' ').replace(/\s+/g, ' ').trim();
      out[key] = val;
      continue;
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
    i++;
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

const all = [];
for (const [i, t] of uniq.entries()) {
  const tree = await api(`repos/${t.login}/${t.repo}/git/trees/HEAD?recursive=1`);
  if (!tree?.tree) { console.log(`  ! ${t.login}/${t.repo} tree 失败`); continue; }
  const hits = tree.tree.filter(x => x.type === 'blob' && /(^|\/)SKILL\.md$/i.test(x.path));
  if (!hits.length) { console.log(`  - ${t.login}/${t.repo} 无 SKILL.md`); continue; }
  // blob 批量取：git/blobs/{sha} 支持 1 次 1 个，但 contents API 也 1 次 1 个；用 blob sha 更省
  for (const b of hits) {
    const blob = await api(`repos/${t.login}/${t.repo}/git/blobs/${b.sha}`);
    if (!blob?.content) continue;
    const content = Buffer.from(blob.content, 'base64').toString('utf-8');
    const fm = parseFm(content);
    all.push({
      login: t.login, repo: t.repo, path: b.path,
      hasFm: !!fm,
      name: fm?.name ?? null,
      description: fm?.description ?? null,
      fields: fm ? Object.keys(fm) : [],
      descLen: fm?.description ? fm.description.length : 0,
      raw: content.length,
    });
  }
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${uniq.length} 累积 ${all.length} 个 SKILL.md (api ${calls})`);
}
fs.writeFileSync(OUT, JSON.stringify(all, null, 2), 'utf-8');
console.log(`\n完成：${all.length} 个 SKILL.md，来自 ${new Set(all.map(x => x.login + '/' + x.repo)).size} 个仓，API ${calls} 次`);
if (errs.length) console.log('网络错误', errs.length, errs.slice(0, 3));
