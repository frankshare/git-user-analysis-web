// 文件级全量 v2：每仓 1 次 tarball 请求（codeload），本地解析全部 SKILL.md
// 比 v1（逐 blob）省 100 倍配额
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('需要 GH_TOKEN'); process.exit(1); }
const DATA_DIR = 'D:/Obsidian/MyVault/5-Git用户分析/_data';
const OUT = 'D:/Documents/deepseek-harness/default-workspace/_gh/skill-descriptions.json';
const TMP = 'E:/tmp/ghfmt/tar';

const targets = [];
for (const f of fs.readdirSync(DATA_DIR).filter(x => x.endsWith('.json') && !['convergence.json', 'format-adoption.json'].includes(x))) {
  const login = f.replace('.json', '');
  const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
  for (const s of d.skills?.items || []) if (s.repo && s.repo !== login) targets.push({ login, repo: s.repo });
}
const seen = new Set(); const uniq = [];
for (const t of targets) { const k = t.login + '/' + t.repo; if (!seen.has(k)) { seen.add(k); uniq.push(t); } }
console.log(`待采集 ${uniq.length} 个仓（每仓 1 次 tarball）`);

function parseFm(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const out = {}; let i = 0;
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

fs.mkdirSync(TMP, { recursive: true });
const all = []; let ok = 0, fail = 0;
for (const [i, t] of uniq.entries()) {
  const tar = path.join(TMP, `${t.login}__${t.repo}.tar.gz`);
  let got = false;
  try {
    execFileSync('curl', ['-sSL', '--max-time', '60', '-H', `Authorization: Bearer ${TOKEN}`,
      '-o', tar, `https://codeload.github.com/${t.login}/${t.repo}/tar.gz/HEAD`], { stdio: 'pipe' });
    if (fs.existsSync(tar) && fs.statSync(tar).size > 100) got = true;
  } catch { }
  if (!got) { fail++; console.log(`  ! ${t.login}/${t.repo} 下载失败`); continue; }
  ok++;
  // 列出 SKILL.md
  let names = [];
  try {
    const out = execFileSync('tar', ['--force-local', '-tzf', tar], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    names = out.split('\n').filter(x => /(^|\/)SKILL\.md$/i.test(x));
  } catch (e) { console.log(`  ! ${t.login}/${t.repo} 解包失败`); continue; }
  for (const n of names) {
    let content = '';
    try {
      content = execFileSync('tar', ['--force-local', '-xzOf', tar, n], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    } catch { continue; }
    const fm = parseFm(content);
    all.push({
      login: t.login, repo: t.repo, path: n.replace(/^[^/]+\//, ''),
      hasFm: !!fm, name: fm?.name ?? null, description: fm?.description ?? null,
      fields: fm ? Object.keys(fm) : [],
      descLen: fm?.description ? fm.description.length : 0,
      bytes: content.length,
    });
  }
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${uniq.length} 成功${ok} 失败${fail} 累积 ${all.length} 个 SKILL.md`);
  try { fs.unlinkSync(tar); } catch { }
}
fs.writeFileSync(OUT, JSON.stringify(all, null, 2), 'utf-8');
console.log(`\n完成：${all.length} 个 SKILL.md，来自 ${ok} 个仓（失败 ${fail}）`);
