/**
 * 静态巡检 —— 不需要浏览器，CI 里也能跑。
 * 检查：字号下限、重复作品链接、重复 view-transition-name、嵌套 <a>、死链、img 缺 alt、硬编码旧色值。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');

if (!existsSync(DIST)) {
  console.error('✗ 找不到 dist/，先运行 npm run build');
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (f.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(DIST);
const problems = [];
const add = (file, type, detail) => problems.push({ file: path.relative(DIST, file), type, detail });

const HARD_CODED = ['#b23a2b','#f6efdf','#fbf5e7','#f2e9d6','#efe6d2','#17140f','#d8c9a9','#cbbb95','#d5c6a6','#d3c6a5','#cfbd97','#e9dfc9'];

const known = new Set(files.map((f) => '/' + path.relative(DIST, f).split(path.sep).join('/').replace(/index[.]html$/, '')));

for (const f of files) {
  const html = readFileSync(f, 'utf-8');

  for (const m of html.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    if (parseFloat(m[1]) < 12) add(f, 'tiny-font', 'text-[' + m[1] + 'px]');
  }

  const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*data-key="[^"]*"/g)].map(m => m[1]);
  const hc = {};
  hrefs.forEach(h => { hc[h] = (hc[h] || 0) + 1; });
  for (const [h, n] of Object.entries(hc)) if (n > 1) add(f, 'dup-card', h + ' x' + n);

  const vtn = [...html.matchAll(/view-transition-name:\s*([\w-]+)/g)].map(m => m[1]);
  const vc = {};
  vtn.forEach(v => { vc[v] = (vc[v] || 0) + 1; });
  for (const [v, n] of Object.entries(vc)) if (n > 1) add(f, 'dup-view-transition-name', v + ' x' + n);

  let depth = 0, maxDepth = 0;
  for (const m of html.matchAll(/<a\b[^>]*>|<\/a>/g)) {
    if (m[0] === '</a>') depth = Math.max(0, depth - 1);
    else { depth++; maxDepth = Math.max(maxDepth, depth); }
  }
  if (maxDepth > 1) add(f, 'nested-anchor', 'max depth ' + maxDepth);

  for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const link = m[1];
    if (link.startsWith('/_astro/') || link === '/favicon.svg') continue;
    if (!known.has(link) && !existsSync(path.join(DIST, link.replace(/^\//, '')))) add(f, 'dead-link', link);
  }

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) add(f, 'img-no-alt', m[0].slice(0, 70));
  }

  for (const c of HARD_CODED) {
    const n = html.split(c).length - 1;
    if (n > 0) add(f, 'hardcoded-color', c + ' x' + n);
  }
}

const byType = {};
for (const p of problems) { byType[p.type] = byType[p.type] || []; byType[p.type].push(p); }

if (problems.length === 0) {
  console.log('✓ 静态巡检通过（' + files.length + ' 个页面）');
  process.exit(0);
}
console.log('✗ 静态巡检发现 ' + problems.length + ' 个问题（' + files.length + ' 个页面）\n');
for (const [type, list] of Object.entries(byType)) {
  console.log('  ' + type + ' x' + list.length);
  list.slice(0, 5).forEach(p => console.log('    ' + p.file + '  ' + JSON.stringify(p.detail)));
  if (list.length > 5) console.log('    … 还有 ' + (list.length - 5) + ' 条');
  console.log('');
}
process.exit(1);
