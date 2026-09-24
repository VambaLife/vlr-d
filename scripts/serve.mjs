import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '4173', 10);
const mimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8']
]);

function safeFilePath(requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname); }
  catch (_) { return null; }
  pathname = pathname.replaceAll('\\', '/');
  const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const candidate = path.resolve(root, `.${relative}`);
  const relativeCandidate = path.relative(root, candidate);
  if (relativeCandidate.startsWith('..') || path.isAbsolute(relativeCandidate)) return null;
  if (relativeCandidate.split(path.sep).includes('.git')) return null;
  return candidate;
}

const server = http.createServer(async function (request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method Not Allowed');
    return;
  }
  const filePath = safeFilePath(request.url || '/');
  if (!filePath) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad Request');
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Length': info.size,
      'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    };
    response.writeHead(200, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch (_) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  }
});

server.listen(port, host, function () {
  process.stdout.write(`Local preview: http://${host}:${port}/\n`);
});

function shutdown() {
  server.close(function () { process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
