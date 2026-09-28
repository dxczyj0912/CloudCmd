#!/usr/bin/env node
/* ==========================================================================
   tools/apk-check.js · APK 内容验证
   --------------------------------------------------------------------------
   为什么要有这个：APK 能装、能启动，不等于"里面那份网站是对的"。
   打包环节真正会出错的地方是这三类，而且都不会让 apk 安装失败：

     · assets 路径写错 / 少了文件（WebView 打开就是白屏）
     · aapt2 在 Windows 上把条目名写成反斜杠（AssetManager 找不到）
     · 打进去的是旧版本的文件（改了网站忘了重新打包）

   所以这里做两件事：
     ① 把 APK 里的 assets/www 解出来，与项目里的文件**逐字节比对**
     ② 把解出来的那份网站在无头 Chrome 里按 375x667 真渲染一遍，
        断言命令数据、侧栏、每日一练这些关键路径还在

   用法：
     node tools/apk-check.js                    # 检查 CloudCmd-1.0.apk
     node tools/apk-check.js --apk=xxx.apk
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const http = require('http');
const zip = require('./android/zip.js');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const APK = (function () {
  const a = argv.find(x => x.startsWith('--apk='));
  if (a) return path.resolve(ROOT, a.slice(6));
  const found = fs.readdirSync(ROOT).filter(f => /^CloudCmd-.*\.apk$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(ROOT, f)).mtimeMs }))
    .sort((x, y) => y.t - x.t);
  if (!found.length) { console.error('找不到 APK，先用 node tools/build-apk.js 构建'); process.exit(2); }
  return path.join(ROOT, found[0].f);
})();

if (!fs.existsSync(APK)) { console.error('APK 不存在：' + APK); process.exit(2); }

/* 源码侧的条数（用于和 APK 内的渲染结果比对）：
   解析 data/<分类>.js 里 `id: '...'` 的出现次数，不依赖任何运行时。 */
function countSourceCommands() {
  const dir = path.join(ROOT, 'data');
  let n = 0;
  fs.readdirSync(dir).filter(f => /\.js$/.test(f) && f !== '_registry.js' &&
    f.indexOf('cards') !== 0 && f.indexOf('lessons') !== 0 &&
    f !== 'cheat.js' && f !== 'roadmap.js' && f !== 'termfs.js' &&
    f.indexOf('concepts') !== 0 && f.indexOf('errors') !== 0 &&
    f.indexOf('versions') !== 0 && f.indexOf('cert') !== 0).forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    n += (src.match(/^\s{6}id: '/gm) || []).length;
  });
  return n;
}
function countSourceCards() {
  const dir = path.join(ROOT, 'data');
  const ctx = { window: { CC_CARDS: [] } };
  vm.createContext(ctx);
  fs.readdirSync(dir).filter(f => /^cards.*\.js$/.test(f)).forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  });
  return ctx.window.CC_CARDS.length;
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('== APK 内容验证 ==');
console.log('  文件：' + path.basename(APK) + '  (' + (fs.statSync(APK).size / 1048576).toFixed(2) + ' MB)\n');

/* ---------- 1. 解出 assets/www ---------- */
console.log('[1] 包结构与文件一致性');
const entries = zip.readZip(APK);
const names = entries.map(e => e.name);

ok('条目名没有反斜杠（Windows 上 aapt2 会写错，装了就是白屏）',
  names.every(n => n.indexOf('\\') === -1),
  names.filter(n => n.indexOf('\\') !== -1).slice(0, 3).join(' , '));
const arsc = entries.find(e => e.name === 'resources.arsc');
ok('resources.arsc 未压缩（Android 11+ 的硬要求）', !!arsc && arsc.method === 0);
ok('classes.dex 在', !!entries.find(e => e.name === 'classes.dex'));
ok('AndroidManifest.xml 在', !!entries.find(e => e.name === 'AndroidManifest.xml'));

const EXTRACT = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-apk-'));
let extracted = 0, bytes = 0;
for (const e of entries) {
  if (!e.name.startsWith('assets/www/')) continue;
  const rel = e.name.slice('assets/www/'.length);
  const dest = path.join(EXTRACT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, e.data);
  extracted++; bytes += e.data.length;
}
ok('站内文件全部解出', extracted > 30, '只解出 ' + extracted + ' 个');
console.log('    · ' + extracted + ' 个文件 / ' + (bytes / 1048576).toFixed(1) + ' MB → ' + EXTRACT);

/* ---------- 2. 与项目源文件逐字节比对 ---------- */
const SKIP = new Set(['assets/ref']);   /* 参考截图刻意不进包 */
const srcFiles = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (SKIP.has(r)) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else srcFiles.push(r);
  }
})(ROOT, '');
const srcSite = srcFiles.filter(r =>
  r === 'index.html' || r === 'academy-lab.html' ||
  r.startsWith('assets/') || r.startsWith('data/'));

let same = 0, diff = [], missing = [];
for (const rel of srcSite) {
  const a = path.join(ROOT, rel);
  const b = path.join(EXTRACT, rel);
  if (!fs.existsSync(b)) { missing.push(rel); continue; }
  if (Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0) same++;
  else diff.push(rel);
}
ok('包内文件与项目源文件逐字节一致（' + same + '/' + srcSite.length + '）',
  diff.length === 0 && missing.length === 0,
  [missing.length ? '缺失 ' + missing.slice(0, 3).join(', ') : '',
    diff.length ? '不一致 ' + diff.slice(0, 3).join(', ') : ''].filter(Boolean).join('；'));
ok('参考截图确实没打进包（省 200KB）',
  !fs.existsSync(path.join(EXTRACT, 'assets/ref')));

/* ---------- 3. 在无头 Chrome 里把解出来的网站真渲染一遍 ---------- */
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));

if (!CHROME) {
  console.log('\n⚠ 没找到 Chrome/Edge，跳过渲染验证');
  finish();
} else {
  console.log('\n[2] 用 APK 里那份网站在 375x667 下真渲染');
  renderCheck();
}

function getJSON(url) {
  return new Promise((res, rej) => http.get(url, r => {
    let d = ''; r.on('data', c => d += c);
    r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej));
}

function renderCheck() {
  const PORT = 9351;
  const profile = path.join(os.tmpdir(), 'cc-apkcheck-' + Date.now());
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });

  const done = () => { try { child.kill(); } catch (e) {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} };

  (async function () {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) {
      await new Promise(r => setTimeout(r, 250));
      try { targets = await getJSON('http://127.0.0.1:' + PORT + '/json/list'); } catch (e) { /* 还没起来 */ }
    }
    if (!targets) { done(); return finish('Chrome 调试端口未就绪'); }

    const sock = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      sock.addEventListener('open', res, { once: true });
      sock.addEventListener('error', rej, { once: true });
    });
    let id = 0; const pending = new Map(); const errors = [];
    sock.addEventListener('message', ev => {
      const m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params && m.params.exceptionDetails;
        errors.push((d && d.exception && d.exception.description) || (d && d.text) || 'unknown');
      }
    });
    const send = (method, params) => new Promise(res => {
      const mid = ++id; pending.set(mid, res);
      sock.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;
    const settle = ms => new Promise(r => setTimeout(r, ms || 300));

    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 3, mobile: true });
    await send('Page.navigate', { url: 'file:///' + path.join(EXTRACT, 'index.html').replace(/\\/g, '/') });
    /* CI 的 Windows runner 偶尔在 1.8 秒后仍在加载脚本；等待真正的首页就绪，
       而不是把机器慢误报成 APK 白屏。超时后仍保留失败和诊断信息。 */
    let homeReady = false;
    for (let attempt = 0; attempt < 60 && !homeReady; attempt++) {
      await settle(200);
      try {
        homeReady = await ev('document.readyState === "complete" && document.querySelector(".hero") !== null && document.body.textContent.length > 200');
      } catch (e) { /* 导航中 Runtime 暂时不可用，下一次再查 */ }
    }
    ok('375x667 下首页渲染出内容', homeReady,
      homeReady ? '' : '等待 12 秒仍未就绪；当前地址 ' + await ev('location.href'));
    /* ⚠️ 不要写死条数。这里原本断言"=== 822"，内容一涨（本会话加了 3 条）就变成假失败 ——
       它想验的是"APK 里的数据与源码一致、全都加载出来了"，所以：
       ① 先从源码侧数出真实条数（Node 端读 data/*.js），再和 APK 里的渲染结果比。
       这样内容增长时断言自动跟着走，只有真正"少加载了"才会红。 */
    const srcCmdCount = countSourceCommands();
    ok('全部命令数据都加载了（与源码一致，' + srcCmdCount + ' 条）',
      (await ev('(function(){var n=0;for(var k in window.CC_DATA)n+=window.CC_DATA[k].length;return n})()')) === srcCmdCount,
      '实际 ' + await ev('(function(){var n=0;for(var k in window.CC_DATA)n+=window.CC_DATA[k].length;return n})()'));
    const srcCardCount = countSourceCards();
    ok('每日一练的卡片数据在（与源码一致，' + srcCardCount + ' 张）',
      (await ev('(window.CC_CARDS||[]).length')) === srcCardCount,
      '实际 ' + await ev('(window.CC_CARDS||[]).length'));
    const vp = await ev(`JSON.stringify({
      innerW: window.innerWidth, innerH: window.innerHeight,
      clientW: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      screenW: screen.width, dpr: window.devicePixelRatio,
      mobileMQ: matchMedia('(max-width: 760px)').matches,
      meta: (document.querySelector('meta[name=viewport]')||{}).content || '(无)'
    })`);
    const v = JSON.parse(vp);
    ok('手机断点生效（≤760px 的布局分支被命中）', v.mobileMQ === true, vp);
    ok('布局视口就是 375（没有被内容撑宽）', v.clientW === 375, vp);
    /* ⚠️ 必须比 clientWidth 而不是 innerWidth：页面真溢出时视觉视口会被一起撑大，
       两个值同时变大，比 innerWidth 永远测不出来（顶栏溢出就是这么藏住的）。 */
    ok('没有横向溢出（scrollWidth == clientWidth）', v.scrollW <= v.clientW + 1, vp);
    ok('没有触发"缩小适应"', Math.abs(v.innerW - v.clientW) <= 1, vp);

    await ev('location.hash="#/drill"'); await settle(600);
    ok('每日一练页在 APK 里可用', await ev('document.getElementById("drill-card") !== null'));
    await ev('document.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true}))'); await settle(400);
    ok('卡片能翻面（背面有判据）', await ev(
      'document.getElementById("drill-card").classList.contains("is-flipped") && /判据/.test(document.getElementById("dc-back").textContent)'));

    await ev('location.hash="#/c/cloud-cli"'); await settle(600);
    ok('分类页先渲染技术栈入口', await ev('document.querySelectorAll(".stack-card").length') >= 3);
    await ev('location.hash="#/c/cloud-cli?stack=compute"'); await settle(600);
    ok('技术栈页渲染命令卡片', await ev('document.querySelectorAll("#cmd-list .cmd-card").length') >= 3);

    ok('渲染过程无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

    done();
    finish();
  })().catch(e => { done(); finish(e.message); });
}

function finish(err) {
  if (err) console.log('\n⚠ ' + err);
  console.log('\n' + '='.repeat(60));
  console.log(err || fail
    ? '❌ ' + pass + ' 通过 / ' + fail + ' 失败'
    : '✅ ' + pass + ' 项全部通过 —— APK 里那份网站确实是能跑的那一份');
  process.exit(fail || err ? 1 : 0);
}
