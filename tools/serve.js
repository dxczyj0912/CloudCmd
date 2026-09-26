/* tools/serve.js · 零依赖静态服务器（给本地预览用；不引入任何 npm 包）
   为什么需要它：这个工作区目前没有任何 HTTP 服务（43120 是 DSH 自己的 GUI API，对本目录返回 403），
   所以练习平台 academy-lab.html 与主站 index.html 都只能靠 file:// 双击打开。
   file:// 下站点本身没问题（这是项目的立身之本），但把链接贴给别人、或想在浏览器里
   直接跳到某一节课时，file:// 的长路径很难用 —— 这个服务器就是为这两种场景准备的。

   用法：node tools/serve.js [端口]
   默认 8899。只监听 127.0.0.1（不对外暴露）。 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || 8899);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const full = path.join(ROOT, rel);
  /* 只服务项目目录内的文件，挡掉 ../ 穿越 */
  if (!full.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(full).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('CloudCmd 预览服务已启动：');
  console.log('  主站        http://127.0.0.1:' + PORT + '/index.html');
  console.log('  练习平台    http://127.0.0.1:' + PORT + '/academy-lab.html');
  console.log('');
  console.log('三节综合实战：');
  console.log('  ① http://127.0.0.1:' + PORT + '/academy-lab.html#/lab/cc-cap-new-server-audit');
  console.log('  ② http://127.0.0.1:' + PORT + '/academy-lab.html#/lab/cc-cap-incident-chain');
  console.log('  ③ http://127.0.0.1:' + PORT + '/academy-lab.html#/lab/cc-cap-security-incident');
});
