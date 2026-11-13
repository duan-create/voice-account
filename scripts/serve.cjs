const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { join, extname } = require('node:path');
const root = join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!/^(index\.html|capacitor\.js(?:\.map)?|manifest\.json|sw\.js|(?:css|js|icons)\/[a-zA-Z0-9/_\-.]+)$/.test(path) || path.split('/').includes('..')) return res.writeHead(404).end();
  try { const data = await readFile(join(root, path)); res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); }
  catch { res.writeHead(404).end(); }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${process.env.PORT || 4173}`));
