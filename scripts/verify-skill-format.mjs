// 严格验证：抓取各创作者 skill 仓的真实 SKILL.md，检查 frontmatter 字段
// 用法：node scripts/verify-skill-format.mjs
// 依赖：GH_TOKEN（认证 API，限流 5000/小时）
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('需要 GH_TOKEN');
  process.exit(1);
}

const DATA_DIR = 'D:\\Obsidian\\MyVault\\5-Git用户分析\\_data';
const headers = {
  'User-Agent': 'git-user-analysis-verify',
  'Accept': 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
};

async function api(p) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`https://api.github.com${p}`, { headers });
      if (res.status === 404) return null;
      if (res.status === 403) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return await res.json();
    } catch { await new Promise(r => setTimeout(r, 1500)); }
  }
  return null;
}

// 从各创作者的 skills.items 里取出 (user, repo) 对
const targets = [];
for (const f of fs.readdirSync(DATA_DIR).filter(x => x.endsWith('.json') && x !== 'convergence.json')) {
  const login = f.replace('.json', '');
  const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
  for (const s of d.skills?.items || []) {
    if (s.repo && s.repo !== login) targets.push({ login, repo: s.repo });
  }
}

console.log(`待验证 ${targets.length} 个 skill 仓…\n`);

const results = [];
for (const t of targets) {
  // 找 SKILL.md：优先 skills/<name>/SKILL.md，再退到根目录
  const candidates = [
    `repos/${t.login}/${t.repo}/contents/SKILL.md`,
    `repos/${t.login}/${t.repo}/contents/skills/SKILL.md`,
  ];
  let content = null;
  let pathUsed = '';
  for (const c of candidates) {
    const r = await api(c);
    if (r && r.content) {
      content = Buffer.from(r.content, 'base64').toString('utf-8');
      pathUsed = r.path;
      break;
    }
  }
  if (!content) {
    // 尝试列出仓库根目录找 skill 子目录
    const root = await api(`repos/${t.login}/${t.repo}/contents/`);
    if (root && Array.isArray(root)) {
      const skillDirs = root.filter(x => x.type === 'dir' && /skill/i.test(x.name)).slice(0, 3);
      for (const d of skillDirs) {
        const r = await api(`repos/${t.login}/${t.repo}/contents/${d.name}/SKILL.md`);
        if (r && r.content) {
          content = Buffer.from(r.content, 'base64').toString('utf-8');
          pathUsed = r.path;
          break;
        }
      }
    }
  }
  if (!content) { results.push({ ...t, found: false }); continue; }

  // 解析 frontmatter
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fields = [];
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):/);
      if (m) fields.push(m[1].toLowerCase());
    }
  }
  results.push({
    ...t, found: true, path: pathUsed,
    hasFm: !!fm, fields,
    hasName: fields.includes('name'),
    hasDesc: fields.includes('description'),
    hasLicense: fields.includes('license'),
    hasAllowed: fields.includes('allowed-tools') || fields.includes('allowed_tools'),
    hasMeta: fields.includes('metadata'),
    hasCompat: fields.includes('compatibility'),
    len: content.length,
  });
}

fs.writeFileSync(
  'D:\\Documents\\deepseek-harness\\default-workspace\\_gh\\skill-format-check.json',
  JSON.stringify(results, null, 2), 'utf-8'
);

const found = results.filter(r => r.found);
console.log(`找到 SKILL.md：${found.length}/${results.length}\n`);
console.log('user'.padEnd(18), 'repo'.padEnd(28), 'fm', 'name', 'desc', 'lic', 'allow', 'meta', 'compat');
for (const r of found.slice(0, 40)) {
  const y = b => b ? ' ✓ ' : ' · ';
  console.log(
    r.login.padEnd(18), r.repo.slice(0, 27).padEnd(28),
    y(r.hasFm), y(r.hasName), y(r.hasDesc), y(r.hasLicense), y(r.hasAllowed), y(r.hasMeta), y(r.hasCompat)
  );
}

console.log('\n=== 汇总 ===');
const n = found.length;
if (n) {
  for (const [k, label] of [
    ['hasFm', '有 frontmatter'],
    ['hasName', '有 name 字段'],
    ['hasDesc', '有 description 字段'],
    ['hasLicense', '有 license 字段'],
    ['hasAllowed', '有 allowed-tools 字段'],
    ['hasMeta', '有 metadata 字段'],
    ['hasCompat', '有 compatibility 字段'],
  ]) {
    const c = found.filter(r => r[k]).length;
    console.log(`${label.padEnd(26)} ${c}/${n}  (${Math.round(c / n * 100)}%)`);
  }
  console.log('\n--- 实际字段名分布 ---');
  const all = {};
  for (const r of found) for (const f of r.fields) all[f] = (all[f] || 0) + 1;
  Object.entries(all).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(`  ${f.padEnd(18)} ${c}`));
}
