// 抽样采集：只取筛选后的仓，且每仓按优先级取有限个 SKILL.md（不搬全量）
// 筛选：A 高星>=2000 / B 近120天更新且>=200星 / C flagship 层
// 单仓上限 6 个：根目录 > 路径最短 > 含 flagship/skill 关键字
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('需要 GH_TOKEN'); process.exit(1); }
const WS = 'D:/Documents/deepseek-harness/default-workspace/_gh';
const OUT = `${WS}/skill-descriptions.json`;
const headers = { 'User-Agent': 'gpa-sample', Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}` };
const CAP = 6;

let apiCalls = 0, rawCalls = 0; const errs = [];
async function api(p) {
  for (let i = 0; i < 4; i++) {
    apiCalls++;
    try {
      const r = await fetch(`https://api.github.com/${p}`, { headers });
      if (r.status === 200) return await r.json();
      if (r.status === 404 || r.status === 409) return null;
      if (r.status === 403) { await new Promise(x => setTimeout(x, 4000 * (i + 1))); continue; }
      return null;
    } catch (e) { errs.push('api:' + e.message); await new Promise(x => setTimeout(x, 2000)); }
  }
  return null;
}
// raw.githubusercontent.com 在本机被 reset，改走 git/blobs API（每个文件 1 次调用）
async function blobText(login, repo, sha) {
  const j = await api(`repos/${login}/${repo}/git/blobs/${sha}`);
  if (!j?.content) return null;
  return Buffer.from(j.content, 'base64').toString('utf-8');
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

const meta = JSON.parse(fs.readFileSync(`${WS}/repo-filter-meta.json`, 'utf-8'));
const keep = fs.readFileSync(`${WS}/repo-keep.txt`, 'utf-8').split('\n').map(s => s.trim()).filter(Boolean);
console.log(`抽样采集 ${keep.length} 个仓（每仓最多 ${CAP} 个 SKILL.md）`);

const all = [];
for (const [i, k] of keep.entries()) {
  const [login, repo] = k.split('/');
  const m = meta[k] || {};
  const tree = await api(`repos/${login}/${repo}/git/trees/HEAD?recursive=1`);
  if (!tree?.tree) { console.log(`  ! ${k} tree 失败`); continue; }
  let hits = tree.tree.filter(x => x.type === 'blob' && /(^|\/)SKILL\.md$/i.test(x.path));
  if (!hits.length) { console.log(`  - ${k} 无 SKILL.md`); continue; }
  const totalHits = hits.length;
  // 优先级排序后截断
  hits.sort((a, b) => {
    const d = p => p.path.split('/').length;
    const rootA = d(a) === 1 ? 0 : 1, rootB = d(b) === 1 ? 0 : 1;
    if (rootA !== rootB) return rootA - rootB;
    if (d(a) !== d(b)) return d(a) - d(b);
    return a.path.localeCompare(b.path);
  });
  const picked = hits.slice(0, CAP);
  for (const b of picked) {
    const p = b.path;
    const content = await blobText(login, repo, b.sha);
    if (!content) continue;
    const fm = parseFm(content);
    all.push({
      login, repo, path: p,
      stars: m.stars ?? 0, days_since_update: m.days ?? null, layer: m.layer ?? null,
      repo_skill_files: totalHits, sampled: picked.length,
      hasFm: !!fm, name: fm?.name ?? null, description: fm?.description ?? null,
      fields: fm ? Object.keys(fm) : [],
      descLen: fm?.description ? fm.description.length : 0,
      bytes: content.length,
    });
  }
  console.log(`  ${i + 1}/${keep.length} ${k} (${picked.length}/${totalHits}) 累积 ${all.length}`);
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2), 'utf-8'); // 每仓落盘，随时可续
}
const repos = new Set(all.map(x => x.login + '/' + x.repo));
console.log(`\n完成：${all.length} 个 SKILL.md，来自 ${repos.size} 仓（api ${apiCalls}, raw ${rawCalls}）`);
if (errs.length) console.log('错误', errs.length, errs.slice(0, 3));
