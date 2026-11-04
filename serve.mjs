// Local test server for the static site: node static-site/serve.mjs [port]
// Applies the same headers as static-site/_headers (Cloudflare Pages / Netlify format).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 8099);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  const headers = {
    'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  };
  if (rel === 'meeting.html') {
    headers['Cross-Origin-Embedder-Policy'] = 'credentialless';
    headers['Permissions-Policy'] = 'camera=(self), microphone=(self), display-capture=(self)';
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`static site on http://127.0.0.1:${port}`));
