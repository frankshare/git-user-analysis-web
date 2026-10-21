// 将 _analyses/*.analyses.json 合并进 vault 里的 <user>.json（唯一事实源）
// 用法：node scripts/merge-analyses.mjs
//
// 数据流：_analyses/ 侧写文件（人工维护的拆解卡） → <user>.json（vault 里的权威数据）
//         → sync-data.mjs 复制到 src/data → Astro 构建
import fs from 'node:fs';
import path from 'node:path';

const VAULT_DATA_DIR = 'D:\\Obsidian\\MyVault\\5-Git用户分析\\_data';

if (!fs.existsSync(VAULT_DATA_DIR)) {
  // CI / 异地环境没有 vault：src/data 里已提交的版本就是最新数据，不阻断构建
  console.log('[merge] vault not found, keeping committed src/data (CI mode)');
  process.exit(0);
}

const analysesDir = path.join(VAULT_DATA_DIR, '_analyses');
if (!fs.existsSync(analysesDir)) {
  console.log('[merge] no _analyses dir, skip');
  process.exit(0);
}

const files = fs.readdirSync(analysesDir).filter(f => f.endsWith('.analyses.json'));
let changed = 0;

for (const file of files) {
  const user = file.replace('.analyses.json', '');
  const userPath = path.join(VAULT_DATA_DIR, `${user}.json`);
  if (!fs.existsSync(userPath)) {
    console.warn(`[merge] no dataset for ${user}, skip`);
    continue;
  }

  const analyses = JSON.parse(fs.readFileSync(path.join(analysesDir, file), 'utf-8'));
  const data = JSON.parse(fs.readFileSync(userPath, 'utf-8'));

  data.schema_version = '1.1';
  data.skill_analyses = analyses.analyses;

  fs.writeFileSync(userPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[merge] ${user}.json <- ${analyses.analyses.length} analyses`);
  changed++;
}

console.log(`[merge] done, ${changed} file(s) updated in vault`);
