// 零依赖静态文件服务器：用于本地预览部署产物
// 用法：node scripts/serve.mjs [port] [root]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 4322);
const root = path.resolve(process.argv[3] || 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(root)) {
  console.error(`[serve] 根目录不存在：${root}`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }

  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // 防目录穿越
  const filePath = path.join(root, path.normalize(urlPath).replace(/^(\.\.[\\/])+/, ''));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA 回退
  const fallback = path.join(root, 'index.html');
  if (fs.existsSync(fallback)) {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    fs.createReadStream(fallback).pipe(res);
  } else {
    res.writeHead(404).end('not found');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[serve] ${root}`);
  console.log(`[serve] 本机   http://localhost:${port}/`);
  console.log(`[serve] 局域网 http://192.168.1.2:${port}/`);
});
