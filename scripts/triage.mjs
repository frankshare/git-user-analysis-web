// 候选初筛：按 skill 相关度与资产规模自动分档
// 用法：node scripts/triage.mjs <candDir> <outFile>
import fs from 'node:fs';
import path from 'node:path';

const [candDir, outFile] = process.argv.slice(2);
if (!candDir || !outFile) {
  console.error('usage: node triage.mjs <candDir> <outFile>');
  process.exit(1);
}

// 已有深度档用户
const DEEP = new Set(['alchaincyf', 'obra', 'op7418', 'mcncarl', 'yaojingang']);

// skill 相关判定：仓库名或描述命中
const SKILL_RE = /skill|agent|mcp|prompt|claude|codex|workflow|orchestr|rule|guard|gate|hook|copilot|cursor|gemini|qwen|trae|windsurf/i;

const rows = [];
for (const file of fs.readdirSync(candDir).filter(f => f.endsWith('.json'))) {
  const user = file.replace('.json', '');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(candDir, file), 'utf-8'));
  } catch {
    continue;
  }
  // 抓取脚本在只有 1 个仓库时输出对象而非数组；0 仓库时输出空文件
  const raw = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
  const own = raw.filter(r => !r.fork);
  if (own.length === 0) {
    rows.push({ user, tier: 'D', reason: '无自有仓库', repos: 0, stars: 0, skillRepos: 0, skillTop: 0, descHit: 0, top: [] });
    continue;
  }
  const stars = own.map(r => Number(r.stars) || 0).sort((a, b) => b - a);
  const sum = stars.reduce((a, b) => a + b, 0);
  const skillRepos = own.filter(r => SKILL_RE.test(`${r.name} ${r.description || ''}`));
  const descHit = own.filter(r => /skill|agent|MCP|prompt|Claude|Codex/i.test(r.description || ''));
  const skillTop = skillRepos.length ? Math.max(...skillRepos.map(r => Number(r.stars) || 0)) : 0;

  // 分档规则
  let tier, reason;
  if (DEEP.has(user)) {
    tier = 'A'; reason = '已完成深度档';
  } else if (skillRepos.length >= 4 && skillTop >= 300) {
    tier = 'A'; reason = `skill 仓库 ${skillRepos.length} 个，最高 ${skillTop} 星`;
  } else if (skillRepos.length >= 2 && skillTop >= 100) {
    tier = 'B'; reason = `skill 仓库 ${skillRepos.length} 个，最高 ${skillTop} 星`;
  } else if (skillRepos.length >= 1 && sum >= 500) {
    tier = 'B'; reason = `skill 仓库 ${skillRepos.length} 个，总星 ${sum}`;
  } else if (own.length >= 8 && sum >= 200) {
    tier = 'C'; reason = `有资产但 skill 弱：${own.length} 仓 ${sum} 星，skill 仓库 ${skillRepos.length}`;
  } else {
    tier = 'D'; reason = `规模不足：${own.length} 仓 ${sum} 星，skill 仓库 ${skillRepos.length}`;
  }

  const top = own.slice(0, 3).map(r => ({ name: r.name, stars: Number(r.stars) || 0, desc: (r.description || '').slice(0, 70) }));
  rows.push({ user, tier, reason, repos: own.length, stars: sum, skillRepos: skillRepos.length, skillTop, descHit: descHit.length, top });
}

rows.sort((a, b) => {
  const t = { A: 0, B: 1, C: 2, D: 3 };
  if (t[a.tier] !== t[b.tier]) return t[a.tier] - t[b.tier];
  return b.skillTop - a.skillTop;
});

fs.writeFileSync(outFile, JSON.stringify(rows, null, 2), 'utf-8');

const byTier = {};
for (const r of rows) (byTier[r.tier] ||= []).push(r.user);
for (const t of ['A', 'B', 'C', 'D']) {
  console.log(`${t} (${(byTier[t] || []).length}): ${(byTier[t] || []).join(' ')}`);
}
console.log(`\n总计 ${rows.length} 人 -> ${outFile}`);
