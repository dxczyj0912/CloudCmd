// tools/syntax-check.js · 所有 JS 文件的语法体检（最先跑的那一道）
/* --------------------------------------------------------------------------
   为什么要有这一条：一次错误的对象键（`dhcpv6-client: '546/udp'` 少了引号）
   就能让整站在浏览器里白屏 —— 而且**其他检查全都跟着一起失败**，
   让人以为是十几个地方坏了。这里把语法问题单独拎出来、单独定位到行。

   覆盖 assets/js/*.js、data/*.js、tools/*.js（后者只查非下划线开头的正式工具）。

   用法：node tools/syntax-check.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  { dir: 'assets/js', filter: /\.js$/ },
  { dir: 'data', filter: /\.js$/ },
  { dir: 'tools', filter: /^[a-z][a-z0-9-]*\.js$/ }
];

const rows = [];
let bad = 0;

TARGETS.forEach((t) => {
  const dir = path.join(ROOT, t.dir);
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter((f) => t.filter.test(f)).sort().forEach((f) => {
    const rel = t.dir + '/' + f;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try {
      new vm.Script(src, { filename: rel });
      rows.push({ rel: rel, ok: true });
    } catch (e) {
      bad++;
      rows.push({ rel: rel, ok: false, err: e.message });
      console.log('✗ ' + rel + ' → ' + e.message);
      const m = /:(\d+)/.exec(String(e.stack || '').split('\n')[0] || '');
      if (m) {
        const n = Number(m[1]);
        const lines = src.split('\n');
        for (let i = Math.max(0, n - 3); i < Math.min(lines.length, n + 2); i++) {
          console.log('    ' + (i + 1) + ': ' + lines[i].slice(0, 150));
        }
      }
    }
  });
});

console.log('='.repeat(70));
console.log('语法体检：' + (rows.length - bad) + ' / ' + rows.length + ' 个文件通过');
if (bad) {
  console.log('有语法错误的文件（浏览器会直接白屏，必须先修）：');
  rows.filter((r) => !r.ok).forEach((r) => console.log('  · ' + r.rel));
} else {
  console.log('全部通过。');
}
process.exit(bad ? 1 : 0);
