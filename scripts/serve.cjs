const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 4173;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
};

http
  .createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const requestPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(root, decodeURIComponent(requestPath).replace(/^\/+/, ''));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const extension = path.extname(filePath);
      const cacheControl =
        extension === '.html' || extension === '.webmanifest' || /-sw\.js$/.test(filePath)
          ? 'no-cache'
          : 'public, max-age=3600';
      response.writeHead(200, {
        'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
        'Cache-Control': cacheControl,
      });
      response.end(data);
    });
  })
  .listen(port, '0.0.0.0', () => {
    console.log(`Pivnoy Doner demo: http://0.0.0.0:${port}`);
  });
