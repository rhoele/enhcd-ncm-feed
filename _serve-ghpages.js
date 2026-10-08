const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname);
const PORT = 9016;
const M = {
  '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml',
  '.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','':'text/html; charset=utf-8'
};
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // 模拟 GitHub Pages 的 404 → 404.html 行为：找不到文件就回 404.html 内容 200（SPA 兼容）
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  let fp = path.normalize(path.join(ROOT, filePath));
  const tryFiles = [fp];
  // /<repo>/test → 也当成 /test.html 回退（简化真实 repo 前缀在本地模拟）
  const noLeading = urlPath.replace(/^\/[^/]+\//, '/');
  if (noLeading !== urlPath) tryFiles.push(path.normalize(path.join(ROOT, noLeading === '/' ? '/index.html' : noLeading)));
  let found = null;
  for (const f of tryFiles) {
    if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) { found = f; break; }
  }
  if (!found) {
    // SPA 404 回退
    const f404 = path.join(ROOT, '404.html');
    if (fs.existsSync(f404)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      fs.createReadStream(f404).pipe(res);
      return;
    }
    res.writeHead(404); return res.end('404 ' + urlPath);
  }
  const ext = path.extname(found).toLowerCase();
  res.writeHead(200, { 'Content-Type': M[ext] || M[''], 'Cache-Control':'no-store' });
  fs.createReadStream(found).pipe(res);
});
server.listen(PORT, '127.0.0.1', () => console.log('GH-PAGES style server: http://127.0.0.1:' + PORT + '/  (ROOT=' + ROOT + ')'));
