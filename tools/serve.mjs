#!/usr/bin/env node
// ============================================================
//  Tiny static file server for local dev and the test harness (no dependencies).
//  Serves ./public by default — the exact folder Netlify publishes.
//
//    node tools/serve.mjs                 → http://127.0.0.1:8123/
//    node tools/serve.mjs --port 9000 --root .   (serve the repo root, e.g. for dev/face-lab)
// ============================================================
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg',
};

/** Start a server. Returns { url, port, close() }. port 0 = pick a free port. */
export function serve({ root = path.join(REPO, 'public'), port = 8123, host = '127.0.0.1', quiet = true } = {}) {
  const base = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      let p = decodeURIComponent(u.pathname);
      let file = path.normalize(path.join(base, p));
      if (!file.startsWith(base)) { res.writeHead(403).end('forbidden'); return; }       // no ../ escapes
      let st = await stat(file).catch(() => null);
      if (st?.isDirectory()) { file = path.join(file, 'index.html'); st = await stat(file).catch(() => null); }
      if (!st) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + p); return; }
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',                       // tests must always see the latest files
        'service-worker-allowed': '/',
      });
      res.end(body);
      if (!quiet) console.log(req.method, p);
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const { port: real } = server.address();
      resolve({ url: `http://${host}:${real}/`, port: real, close: () => new Promise(r => server.close(() => r())) });
    });
  });
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const root = path.resolve(REPO, arg('--root', 'public'));
  const s = await serve({ root, port: +arg('--port', 8123), host: arg('--host', '127.0.0.1'), quiet: !process.argv.includes('--log') });
  console.log(`serving ${path.relative(REPO, root) || '.'} at ${s.url}`);
  console.log(`  guest   ${s.url}index.html?demo=1\n  kiosk   ${s.url}kiosk.html?demo=1\n  village ${s.url}village.html?demo=1&seed=12\n  admin   ${s.url}admin.html?demo=1`);
}
