/**
 * 视觉巡检 —— 提交前必跑（本地）。
 * 用本机 Chrome headless 打开关键页面，注入探针读真实渲染结果，对照规则表检查。
 * 规则来自实际踩过的坑。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

const PROBE = `(() => {
  const out = { issues: [], info: {} };
  const all = Array.from(document.querySelectorAll('body *'));
  const vis = all.filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.textContent.trim().length > 0;
  });

  const small = {};
  vis.forEach((el) => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < 12) {
      const key = el.tagName + '.' + String(el.className).split(' ').slice(0,2).join('.');
      small[key] = (small[key] || 0) + 1;
    }
  });
  if (Object.keys(small).length) out.issues.push({ type: 'tiny-font', detail: Object.entries(small).slice(0,5) });
  out.info.minFont = vis.length ? Math.min(...vis.map((el) => parseFloat(getComputedStyle(el).fontSize))) : 0;

  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    const bad = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > de.clientWidth + 2 || r.left < -2)) {
        bad.push(el.tagName + '.' + String(el.className).slice(0,40));
      }
    });
    out.issues.push({ type: 'overflow', detail: { w: de.scrollWidth, cw: de.clientWidth, els: bad.slice(0,5) } });
  }

  const cards = document.querySelectorAll('.card, .stack-card, article');
  let hidden = 0;
  cards.forEach((c) => { if (parseFloat(getComputedStyle(c).opacity) < 0.05) hidden++; });
  if (hidden) out.issues.push({ type: 'invisible-cards', detail: hidden + '/' + cards.length });
  out.info.cards = cards.length;

  const imgs = Array.from(document.images);
  const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
  if (broken.length) out.issues.push({ type: 'broken-img', detail: broken.map((i) => i.currentSrc || i.src).slice(0,5) });
  out.info.imgs = imgs.length;
  out.info.brokenImgs = broken.length;

  const vtn = Array.from(document.querySelectorAll('*'))
    .map((el) => getComputedStyle(el).viewTransitionName)
    .filter((v) => v && v !== 'none');
  const vcount = {};
  vtn.forEach((v) => { vcount[v] = (vcount[v] || 0) + 1; });
  const vdup = Object.entries(vcount).filter(([, n]) => n > 1);
  if (vdup.length) out.issues.push({ type: 'dup-view-transition-name', detail: vdup.slice(0,5) });

  const links = Array.from(document.querySelectorAll('[data-key]')).map((e) => e.getAttribute('href') || '');
  const lcount = {};
  links.forEach((k) => { lcount[k] = (lcount[k] || 0) + 1; });
  const ldup = Object.entries(lcount).filter(([, n]) => n > 1);
  if (ldup.length) out.issues.push({ type: 'dup-card', detail: ldup.slice(0,5) });
  out.info.dataKeys = links.length;

  let nested = 0;
  document.querySelectorAll('a').forEach((a) => { if (a.querySelector('a')) nested++; });
  if (nested) out.issues.push({ type: 'nested-anchor', detail: nested });

  const gray = imgs.filter((i) => {
    const f = getComputedStyle(i).filter || '';
    const idx = f.indexOf('grayscale');
    if (idx < 0) return false;
    const m = f.slice(idx).match(/[0-9.]+/);
    return !!m && parseFloat(m[0]) >= 0.5;
  });
  if (gray.length) out.issues.push({ type: 'grayscale-img', detail: gray.map((i) => i.src).slice(0,5) });

  out.info.consoleErrors = 0;
  return JSON.stringify(out);
})()`;

const PAGES = [
  { path: '/', name: '首页' },
  { path: '/people/', name: '人物画廊' },
  { path: '/u/alchaincyf/', name: '人物档案' },
  { path: '/works/', name: '作品总览' },
  { path: '/works/skills/', name: '作品分类' },
  { path: '/compare/', name: '横向对比' },
  { path: '/research/', name: '研究索引' },
  { path: '/platforms/', name: '标准专题' },
  { path: '/about/', name: '关于' },
];

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  return null;
}

async function serveDist() {
  const { createServer } = await import('node:http');
  const { stat } = await import('node:fs/promises');
  const mime = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
    '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  };
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, 'dist', p);
    try {
      const s = await stat(file);
      if (s.isDirectory()) throw new Error('dir');
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

async function probePage(chrome, url, port, profileDir) {
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: 'ignore' });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    await wait(300);
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch {}
  }
  if (!wsUrl) { proc.kill(); throw new Error('无法连接 Chrome DevTools'); }

  const sock = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id; pending.set(mid, resolve);
    sock.send(JSON.stringify({ id: mid, method, params }));
  });
  const errors = [];
  sock.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params?.exceptionDetails?.exception?.description || 'exception');
    }
  });
  await new Promise((r) => sock.addEventListener('open', r));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await wait(2500);

  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: true });
  sock.close(); proc.kill(); await wait(200);
  if (r?.exceptionDetails) throw new Error('探针异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  if (!r?.result?.value) throw new Error('探针未返回结果');
  const data = JSON.parse(r.result.value);
  if (errors.length) {
    data.info.consoleErrors = errors.length;
    data.issues.push({ type: 'console-error', detail: errors.slice(0, 3) });
  }
  return data;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.error('✗ 找不到 Chrome/Edge，跳过视觉巡检'); process.exit(2); }

  let server = null;
  let base = urlArg;
  if (!base) { const s = await serveDist(); server = s.server; base = s.base; }

  const profileDir = mkdtempSync(path.join(tmpdir(), 'starbook-probe-'));
  const results = [];
  let port = 9400;

  for (const pg of PAGES) {
    const url = base.replace(/\/$/, '') + pg.path;
    try {
      const data = await probePage(chrome, url, port++, profileDir);
      results.push({ ...pg, url, ...data });
    } catch (e) {
      results.push({ ...pg, url, error: e.message, issues: [{ type: 'probe-failed', detail: e.message }] });
    }
  }

  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  if (server) server.close();

  let bad = 0;
  const lines = [];
  for (const r of results) {
    const issues = r.issues || [];
    if (issues.length) bad++;
    lines.push(`${issues.length ? '✗' : '✓'} ${r.name.padEnd(6)} ${r.path}`);
    if (r.info) {
      lines.push(
        `    字号≥${r.info.minFont}px  卡片${r.info.cards}  图${r.info.imgs}(坏${r.info.brokenImgs})  data-key${r.info.dataKeys}  报错${r.info.consoleErrors || 0}`
      );
    }
    for (const is of issues) lines.push(`    ⚠ ${is.type}: ${JSON.stringify(is.detail)}`);
  }
  if (jsonOut) console.log(JSON.stringify({ results, failed: bad }, null, 2));
  else {
    console.log(lines.join('\n'));
    console.log(bad === 0 ? '\n✓ 全部通过' : `\n✗ ${bad} 个页面有问题`);
  }
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
