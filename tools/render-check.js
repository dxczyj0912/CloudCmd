#!/usr/bin/env node
/* ==========================================================================
   tools/render-check.js · 无头浏览器冒烟测试
   做法：把 tools/_smoke-harness.js 注入 index.html 的副本，
         在 data/ 目录下生成临时测试页（用 <base> 指向站点根，file:// 下相对路径可解析），
         用 headless Chrome 跑一次并 dump DOM，从 #cc-smoke-result 读回结果。
   用法： node tools/render-check.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TMP_HTML = path.join(ROOT, 'data', '__smoke.html');   // 与站点同目录，file:// 下相对路径可解析
const HARNESS = fs.readFileSync(path.join(__dirname, '_smoke-harness.js'), 'utf8');
const WINDOW_SIZE = process.argv.find(arg => /^--window-size=[1-9]\d*,[1-9]\d*$/.test(arg)) || '--window-size=1440,900';

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

function findBrowser() {
  for (const p of BROWSERS) if (fs.existsSync(p)) return p;
  return null;
}

/* ---------- 生成注入测试脚本的页面 ---------- */
function buildTestHtml() {
  // 测试页放在 data/ 下一层，所以 base 指向上一级（站点根）
  const base = require('url').pathToFileURL(ROOT + path.sep).href;
  const bust = '?v=' + Date.now();   // file:// 下浏览器会缓存 JS，必须破坏缓存
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  html = html.replace('<meta charset="UTF-8">',
    '<meta charset="UTF-8">\n<base href="' + base + '">');

  // 给所有本地 script / link 加版本号
  html = html.replace(/(<script src=")([^"]+)(")/g, (m, a, src, c) => a + src + bust + c);
  html = html.replace(/(<link rel="stylesheet" href=")([^"]+)(")/g, (m, a, href, c) => a + href + bust + c);

  html = html.replace('</body>', '<script>\n' + HARNESS + '\n</script>\n</body>');
  return html;
}

function dumpDom(browser, url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-smoke-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--mute-audio',
    '--allow-file-access-from-files',
    WINDOW_SIZE,
    '--virtual-time-budget=20000',
    '--user-data-dir=' + profile,
    '--dump-dom', url
  ];
  const r = spawnSync(browser, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 180000 });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  return r;
}

function extractResult(dom) {
  /* 注意：测试脚本被内联进页面，源码里也含有 "cc-smoke-result" 字样，
     所以必须精确匹配真正的结果容器（带 style="display: none"），并从最后一个开始找 */
  var re = /<div id="cc-smoke-result"[^>]*style="display: none[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  var m, last = null;
  while ((m = re.exec(dom)) !== null) last = m;
  if (!last) return null;
  const raw = last[1]
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  try { return JSON.parse(raw); } catch (e) { return { parseError: e.message, raw: raw.slice(0, 400) }; }
}

function cleanup() { try { fs.unlinkSync(TMP_HTML); } catch (e) { /* ignore */ } }

function main() {
  const browser = findBrowser();
  if (!browser) {
    console.log('⚠ 未找到 Chrome/Edge，跳过浏览器冒烟测试。');
    process.exit(0);
  }

  fs.writeFileSync(TMP_HTML, buildTestHtml(), 'utf8');
  const url = require('url').pathToFileURL(TMP_HTML).href;

  console.log('浏览器：' + browser);
  console.log('测试页：' + TMP_HTML + '\n');

  const r = dumpDom(browser, url);
  const dom = r.stdout || '';

  if (!dom || dom.length < 500) {
    console.log('✗ 浏览器没有输出任何 DOM（可能被环境阻止启动）。');
    cleanup();
    process.exit(1);
  }

  const result = extractResult(dom);

  if (!result) {
    fs.writeFileSync(path.join(__dirname, '_last-dom.html'), dom, 'utf8');
    console.log('✗ 未拿到测试结果 —— 应用或测试脚本没能跑完。');
    console.log('  完整 DOM 已保存到 tools/_last-dom.html 供排查。');
    console.log('  DOM 字节数: ' + dom.length +
      ' / 含样式: ' + /cat-card/.test(dom) +
      ' / 含页脚统计: ' + /条命令/.test(dom));
    cleanup();
    process.exit(1);
  }

  cleanup();

  if (result.parseError) {
    console.log('✗ 结果 JSON 解析失败：' + result.parseError);
    console.log(result.raw);
    process.exit(1);
  }

  console.log('='.repeat(70));
  for (const it of result.items) {
    console.log((it.ok ? '  ✓ ' : '  ✗ ') + it.name + (it.ok ? '' : '\n      → ' + it.detail));
  }
  console.log('='.repeat(70));
  console.log(`浏览器内冒烟测试：${result.pass} 通过 / ${result.fail} 失败（共 ${result.total} 项）`);
  process.exit(result.fail ? 1 : 0);
}

main();
