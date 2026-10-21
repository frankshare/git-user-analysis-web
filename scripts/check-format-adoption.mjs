// 验证假设：平台定义的 SKILL.md 格式是否成为个人创作者的默认格式
// 用法：node scripts/check-format-adoption.mjs
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = 'D:\\Obsidian\\MyVault\\5-Git用户分析\\_data';
const users = fs.readdirSync(DATA_DIR)
  .filter(f => f.endsWith('.json') && f !== 'convergence.json')
  .map(f => ({ login: f.replace('.json', ''), data: JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')) }));

// SKILL.md frontmatter 的标准字段（Anthropic Agent Skills 规范）
const CANON_FIELDS = ['name', 'description'];
const OPTIONAL_FIELDS = ['license', 'allowed-tools', 'version', 'metadata', 'compatibility'];

console.log('=== 各创作者收录 skill 的字段线索（从 analysis 的 summary/mechanism 文本里找）===\n');

const rows = [];
for (const u of users) {
  const skills = u.data.skills?.items || [];
  const analyses = u.data.skill_analyses || [];
  const all = [...skills, ...analyses];
  const joined = JSON.stringify(all).toLowerCase();

  const hasSkillMd = /skill\.md/.test(joined);
  const hasFrontmatter = /frontmatter|前置元数据|yaml front/.test(joined);
  const hasNameDesc = /name.{0,5}description|description.{0,20}触发|触发词|触发条件/.test(joined);
  const hasAllowedTools = /allowed-tools|allowed_tools/.test(joined);
  const hasLicense = /license|许可/.test(joined);
  const hasVersion = /版本|version/.test(joined);
  const hasInstallProtocol = /安装协议|安装流程|npx skills|clone|安装后校验/.test(joined);
  const hasRefDir = /references\//.test(joined);
  const hasScriptsDir = /scripts\//.test(joined);

  rows.push({
    login: u.login,
    skills: skills.length,
    analyses: analyses.length,
    skillMd: hasSkillMd,
    frontmatter: hasFrontmatter,
    nameDesc: hasNameDesc,
    allowedTools: hasAllowedTools,
    license: hasLicense,
    version: hasVersion,
    install: hasInstallProtocol,
    refs: hasRefDir,
    scripts: hasScriptsDir,
  });
}

console.log('user'.padEnd(20), 'sk', 'an', ' SKILL.md', 'front', 'nm/desc', 'allow', 'lic', 'ver', 'inst', 'refs', 'scr');
for (const r of rows) {
  const y = b => b ? '  ✓  ' : '  ·  ';
  console.log(
    r.login.padEnd(20),
    String(r.skills).padStart(2), String(r.analyses).padStart(2),
    y(r.skillMd), y(r.frontmatter), y(r.nameDesc), y(r.allowedTools),
    y(r.license), y(r.version), y(r.install), y(r.refs), y(r.scripts)
  );
}

console.log('\n=== 汇总 ===');
const total = rows.length;
for (const [key, label] of [
  ['skillMd', '提到 SKILL.md'],
  ['frontmatter', '提到 frontmatter'],
  ['nameDesc', '有 name/description 或触发词概念'],
  ['allowedTools', '提到 allowed-tools'],
  ['license', '提到 license/许可'],
  ['version', '提到版本'],
  ['install', '有安装协议'],
  ['refs', '有 references/ 目录'],
  ['scripts', '有 scripts/ 目录'],
]) {
  const c = rows.filter(r => r[key]).length;
  console.log(`${label.padEnd(34)} ${c}/${total}  (${Math.round(c / total * 100)}%)`);
}

console.log('\n注意：这是从 analysis/summary 文本反推的信号，不是逐个打开 SKILL.md 验证的。');
console.log('严格验证需要抓每个 skill 仓的 SKILL.md 头部 —— 那是下一步。');
