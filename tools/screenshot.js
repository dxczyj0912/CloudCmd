// tools/screenshot.js · 给页面或某个元素截图（人工核对视觉用）
/* --------------------------------------------------------------------------
   为什么留这个工具：本项目的三条方法教训里有一条是
   **「截图发现异常 → DOM 测量定位原因 → 断言锁住」** ——
   截图是第一步，缺了它就只能靠想象。

   用法：
     node tools/screenshot.js <hash> <选择器> <输出png> [宽] [高] [on]
   例：
     node tools/screenshot.js "#/c/linux-basic" ".detail-foot" out.png 1200 900
     node tools/screenshot.js "#/c/linux-basic" ".detail-foot" out.png 1200 900 on   # 先点一下「标记为已掌握」

   两个已经踩过的坑（都已修，别再改回去）：
   1. captureBeyondViewport 用**页面**坐标，而 getBoundingClientRect 给的是视口坐标 ——
      不补 scrollX/scrollY 会截到另一个位置的内容。
   2. 不先 scrollIntoView 就截图，clip 落在视口外，出来是一片空白。
   -------------------------------------------------------------------------- */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HASH = process.argv[2] || '#/';
const SEL = process.argv[3] || 'body';
const OUT = path.resolve(ROOT, process.argv[4] || 'tools/_shot.png');
const W = Number(process.argv[5] || 1280);
const H = Number(process.argv[6] || 900);
const PORT = 9411;

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!CHROME) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const userDir = path.join(require('os').tmpdir(), 'cc-shot-' + Date.now());
const child = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
  '--allow-file-access-from-files', '--hide-scrollbars', '--no-first-run',
  '--window-size=' + W + ',' + H, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(300);
    try {
      const list = await getJSON('http://127.0.0.1:' + PORT + '/json/list');
      target = list.find((t) => t.type === 'page');
    } catch (e) { /* 还没起来 */ }
  }
  if (!target) { console.error('连不上 CDP'); child.kill(); process.exit(1); }

  const WS = globalThis.WebSocket;
  if (typeof WS !== 'function') { console.error('Node 缺少内置 WebSocket（需要 Node 22+）'); child.kill(); process.exit(1); }
  const ws = new WS(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });

  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + HASH;
  await send('Page.enable');
  await send('Page.navigate', { url: url });
  await sleep(1800);
  /* 展开第一张命令卡，让底栏露出来；再把目标滚进视口 ——
     否则 clip 落在视口之外，截出来是一片空白（第一版就是这样）。
     第 7 个参数传 on 时，先点一下「标记为已掌握」，用来截"已勾选"状态。 */
  await send('Runtime.evaluate', { expression: '(function(){var c=document.querySelector("#cmd-list .cmd-head");if(c)c.click();})()' });
  await sleep(500);
  if (process.argv[7] === 'on') {
    await send('Runtime.evaluate', { expression: '(function(){var b=document.querySelector("#cmd-list [data-master]");if(b)b.click();})()' });
    await sleep(300);
  }
  await send('Runtime.evaluate', {
    expression: '(function(){var e=document.querySelector(' + JSON.stringify(SEL) + ');if(e&&e.scrollIntoView)e.scrollIntoView({block:"center"});})()'
  });
  await sleep(400);

  const box = await send('Runtime.evaluate', {
    expression: '(function(){var e=document.querySelector(' + JSON.stringify(SEL) + ');if(!e)return null;var r=e.getBoundingClientRect();' +
      /* captureBeyondViewport 用的是**页面**坐标，而 getBoundingClientRect 给的是视口坐标，
         所以要补上滚动量 —— 不补的话截出来是另一个位置的内容（上一版截到的是"语法"块）。 */
      'return JSON.stringify({x:r.x+window.scrollX,y:r.y+window.scrollY,w:r.width,h:r.height});})()',
    returnByValue: true
  });
  const raw = box.result && box.result.result && box.result.result.value;
  if (!raw) { console.error('找不到元素 ' + SEL); child.kill(); process.exit(1); }
  const r = JSON.parse(raw);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(W, r.w + 24), height: Math.max(40, r.h + 24), scale: 2 }
  });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('✓ ' + OUT + '  (' + Math.round(r.w) + '×' + Math.round(r.h) + ' 元素)');
  ws.close();
  child.kill();
  await sleep(300);
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
