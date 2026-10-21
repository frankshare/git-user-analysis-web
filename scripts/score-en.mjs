// 从英文圈策展清单中提取候选作者，按 skill 工程相关性打分
// 用法：node scripts/score-en.mjs <enDir> <outFile>
import fs from 'node:fs';
import path from 'node:path';

const [enDir, outFile] = process.argv.slice(2);

// 策展清单本身的 owner（不是被收录的作者）
const CURATORS = new Set([
  'vivy-yi', 'scienceaix', 'itgoyo', 'obviousworks', 'modstart-lib', 'travisvn',
  'awesome-skills', 'agentskills', 'skillcreatorai', 'skills-directory', 'aiskillstore',
  'github', 'anthropics', 'obra', 'op7418', 'wong2', 'wshuyi',
]);

// skill 工程强信号：仓库名直接表明是 skill 集合/工具/规范
const SKILL_STRONG = /(^|[-_])(skills?|claude-skills|agent-skills)([-_]|$)|skill[-_]?(pack|collection|creator|builder|forge|lab|hub|market|store|dir|directory|registry|manifest|spec|schema|template|framework|kit|factory|studio)/i;
// 弱信号
const SKILL_WEAK = /skill|claude|agent|mcp|prompt/i;

const repos = new Map(); // owner -> Set(repo)
for (const file of fs.readdirSync(enDir).filter(f => f.endsWith('.md'))) {
  const t = fs.readFileSync(path.join(enDir, file), 'utf-8');
  for (const m of t.matchAll(/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]{1,38})\/([A-Za-z0-9][A-Za-z0-9_.-]{1,80})/g)) {
    const owner = m[1], repo = m[2];
    if (CURATORS.has(owner)) continue;
    if (!repos.has(owner)) repos.set(owner, new Set());
    repos.get(owner).add(repo);
  }
}

const rows = [];
for (const [owner, repoSet] of repos) {
  const list = [...repoSet];
  const strong = list.filter(r => SKILL_STRONG.test(r));
  const weak = list.filter(r => SKILL_WEAK.test(r));
  if (strong.length === 0 && weak.length === 0) continue;
  rows.push({
    owner,
    repos: list.length,
    strong: strong.length,
    weak: weak.length,
    strongRepos: strong.slice(0, 6),
    weakRepos: weak.filter(r => !SKILL_STRONG.test(r)).slice(0, 4),
  });
}

rows.sort((a, b) => b.strong - a.strong || b.weak - a.weak);
fs.writeFileSync(outFile, JSON.stringify(rows, null, 2), 'utf-8');

console.log(`候选 ${rows.length} 人`);
console.log('\n=== 强信号（skill 集合/工厂/规范类仓库）===');
for (const r of rows.filter(r => r.strong > 0).slice(0, 40)) {
  console.log(`${r.owner.padEnd(26)} strong=${r.strong} weak=${r.weak} :: ${r.strongRepos.join(', ')}`);
}
console.log('\n=== 仅弱信号（前 20）===');
for (const r of rows.filter(r => r.strong === 0).slice(0, 20)) {
  console.log(`${r.owner.padEnd(26)} weak=${r.weak} :: ${r.weakRepos.join(', ')}`);
}
