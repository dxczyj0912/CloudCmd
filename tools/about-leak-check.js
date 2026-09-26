// tools/about-leak-check.js · 课程步骤的 about 不许把命令写出来
/* --------------------------------------------------------------------------
   讲义里每一步显示的是：标题 + about + 命令块。
   练习模式会把命令块模糊掉，让学员自己敲 —— 可如果 about 里已经写着
   `helm list -A`、`git push -u origin <分支>`，那这一层就白做了。

   所以规则是：**about 说"这一步要达成什么/要看哪一列"，不说"敲什么命令"。**
   判定：about 里出现 cmd 的第一个词（后跟空格）或前两个 token，即视为泄露。

   确实需要提命令名才能说清楚的地方，写进 tools/about-leak-allow.txt
   （一行一条 lessonId，`#` 开头是注释）。

   用法：node tools/about-leak-check.js

   2026-xx 修：本文件原来只用「单行正则」`/^\s*\{\s*title:.*\bcmd:\s*['"]/` 找步骤，
   多行写法（title 一行、cmd 另一行）的步骤会被整份跳过，而工具照样打印"全部通过"。
   `hint-check` 踩过同一个坑（报 286/286，实际 23 个步骤一行都没看）。
   现在与 `hint-check` 共用 tools/_stepscan.js，扫描逻辑只留一份。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = require('./_lessonlist').filter((f) => f !== 'data/lessons.js' && f !== 'data/zz-lesson-assertions.js');
const SCAN = require('./_stepscan');

const ALLOW = (() => {
  const p = path.join(ROOT, 'tools/about-leak-allow.txt');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && l.charAt(0) !== '#');
})();

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let total = 0;
const leaks = [];
const missing = [];

/* 取 `about:` 的值（可能是 '…' 或 "…"；也可能整步没有 about）。 */
function fieldOf(text, name) {
  const m = text.match(new RegExp('\\b' + name + ':\\s*(\'((?:[^\'\\\\]|\\\\.)*)\'|"((?:[^"\\\\]|\\\\.)*)")'));
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3];
}

FILES.forEach((rel) => {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = src.split('\n');
  SCAN.stepRecords(src).forEach((rec) => {
    const cmd = fieldOf(rec.text, 'cmd');
    if (cmd === null) return;                     /* 不是带命令的步骤（如纯说明步骤）不计入 */
    total++;
    /* 所属课程：本步骤之前最近的一个 id（按行向前找，不依赖"上一行恰好是 id"）。 */
    let lesson = '';
    for (let i = rec.line - 1; i >= 0; i--) {
      const lm = lines[i].match(/^\s*id:\s*'([^']+)'/);
      if (lm) { lesson = lm[1]; break; }
    }
    const about = fieldOf(rec.text, 'about');
    if (about === null || about === '') { missing.push(rel + ' ' + rec.line + ' [' + lesson + '] 没有 about'); return; }
    const toks = cmd.trim().split(/\s+/);
    const head = toks[0] || '';
    const two = toks.slice(0, 2).join(' ');
    const leak1 = head.length > 1 && new RegExp('(^|[^A-Za-z0-9_.-])' + esc(head) + '\\s').test(about);
    const leak2 = two.length > 3 && about.indexOf(two) !== -1;
    if ((leak1 || leak2) && ALLOW.indexOf(lesson) === -1) {
      leaks.push({ rel: rel, line: rec.line, lesson: lesson, about: about, cmd: cmd });
    }
  });
});

console.log('='.repeat(74));
console.log('步骤 about 泄露检查');
console.log('='.repeat(74));
console.log('课程步骤 ' + total + ' 个，其中 about 写出了命令的：' + leaks.length + ' 处');
if (missing.length) {
  console.log('\n缺 about 的步骤 ' + missing.length + ' 处：');
  missing.slice(0, 10).forEach((m) => console.log('  · ' + m));
}
if (leaks.length) {
  console.log('');
  leaks.forEach((l) => {
    console.log('  [' + l.lesson + '] ' + l.rel + ':' + l.line);
    console.log('      about: ' + l.about);
    console.log('      cmd  : ' + l.cmd);
  });
  console.log('\n改法：about 只写"这一步要达成什么 / 要看哪一列 / 为什么必须先做它"，');
  console.log('      不写命令名与选项。例如：');
  console.log('        helm list -A            → 列出所有命名空间里的 release');
  console.log('        tar -czf 一步完成归档   → 一步完成归档与压缩');
  console.log('        git push -u origin <分支> → 把分支推上去并建立跟踪关系');
} else {
  console.log('\n全部通过：没有哪一步的 about 把命令写出来了。');
}
process.exit(leaks.length || missing.length ? 1 : 0);
