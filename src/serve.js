/**
 * Zero-dependency static server for previewing the build locally.
 * Resolves `/foo/` to `dist/foo/index.html` the same way a static host will,
 * so what you see here is what ships.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  // Block traversal before touching the filesystem.
  const target = path.normalize(path.join(ROOT, clean));
  if (!target.startsWith(ROOT)) return null;

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const index = path.join(target, 'index.html');
    return fs.existsSync(index) ? index : null;
  }
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;

  const withHtml = `${target}.html`;
  if (fs.existsSync(withHtml)) return withHtml;

  return null;
}

http.createServer((req, res) => {
  const file = resolveFile(req.url || '/');

  if (!file) {
    const notFound = path.join(ROOT, '404.html');
    const body = fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found';
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  res.end(fs.readFileSync(file));
}).listen(PORT, () => {
  if (!fs.existsSync(ROOT)) {
    console.log('dist/ does not exist yet — run `npm run build` first.');
  }
  console.log(`Serving dist/ at http://localhost:${PORT}`);
});
