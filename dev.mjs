// Dev server: serves this folder on :3001 (Unhooded's takes :3000) and live-reloads open pages on any change.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = 3001;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.md': 'text/plain' };
const clients = new Set();
// Injected into served HTML: reload on change, turning the demo's measure mode back on if it was on.
const client = `<script>
if (sessionStorage.mzOn) { sessionStorage.removeItem('mzOn'); addEventListener('load', () => document.querySelector('.try')?.click()); }
new EventSource('/__reload').onmessage = () => {
  if (document.body.classList.contains('measuring')) sessionStorage.mzOn = 1;
  location.reload();
};
</script>`;

http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/__reload') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (path.split('/').some(p => p.startsWith('.'))) return res.writeHead(404).end(); // no .git, .claude
  const file = join('.', normalize(path === '/' ? '/index.html' : path));
  try {
    let body = await readFile(file);
    const type = types[extname(file)] || 'application/octet-stream';
    if (type === 'text/html') body = body.toString().replace(/<\/body>|$/, m => client + m);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`Port ${PORT} is already in use. Another dev server is probably running; stop it first.`);
  process.exit(1);
}).listen(PORT, () => console.log(`Mezur dev server: http://localhost:${PORT}`));

// File events arrive in bursts (editors save in several steps), so reload once things settle.
let t;
watch('.', { recursive: true }, (_, name) => {
  if (!name || name.startsWith('.')) return;
  clearTimeout(t);
  t = setTimeout(() => { for (const c of clients) c.write('data: reload\n\n'); }, 150);
});
