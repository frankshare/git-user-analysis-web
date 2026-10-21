// 把 vault 里的数据同步到构建目录 src/data
// 用法：node scripts/sync-data.mjs
//
// 方向是单向的：vault（唯一事实源） → src/data（构建副本）
// 反向写回请用 scripts/merge-analyses.mjs（它直接改 vault）。
import fs from 'node:fs';
import path from 'node:path';

const VAULT_DATA_DIR = 'D:\\Obsidian\\MyVault\\5-Git用户分析\\_data';
const LOCAL_DATA_DIR = path.resolve('src/data');

if (!fs.existsSync(LOCAL_DATA_DIR)) {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
}

if (fs.existsSync(VAULT_DATA_DIR)) {
  const files = fs.readdirSync(VAULT_DATA_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const src = path.join(VAULT_DATA_DIR, file);
    const dest = path.join(LOCAL_DATA_DIR, file);
    fs.copyFileSync(src, dest);
    console.log(`[sync] Copied ${file} -> src/data/`);
  }

  // 拆解卡侧写文件也要同步（merge-analyses 从 vault 读它们）
  const analysesSrc = path.join(VAULT_DATA_DIR, '_analyses');
  const analysesDst = path.join(LOCAL_DATA_DIR, '_analyses');
  if (fs.existsSync(analysesSrc)) {
    fs.mkdirSync(analysesDst, { recursive: true });
    for (const file of fs.readdirSync(analysesSrc).filter(f => f.endsWith('.json'))) {
      fs.copyFileSync(path.join(analysesSrc, file), path.join(analysesDst, file));
      console.log(`[sync] Copied _analyses/${file} -> src/data/_analyses/`);
    }
  }

  // 组织型资产（平台方供给），单独一个目录
  const orgsSrc = path.join(VAULT_DATA_DIR, 'orgs');
  const orgsDst = path.join(LOCAL_DATA_DIR, 'orgs');
  if (fs.existsSync(orgsSrc)) {
    fs.mkdirSync(orgsDst, { recursive: true });
    for (const file of fs.readdirSync(orgsSrc).filter(f => f.endsWith('.json'))) {
      fs.copyFileSync(path.join(orgsSrc, file), path.join(orgsDst, file));
      console.log(`[sync] Copied orgs/${file} -> src/data/orgs/`);
    }
  }
} else {
  console.log(`[sync] Vault data dir not found, using existing local files in src/data/`);
}
