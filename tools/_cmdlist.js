// tools/_cmdlist.js · 引擎命令模块清单（浏览器端与 Node 测试端必须一致）
/* --------------------------------------------------------------------------
   命令实现拆在 assets/js/cmd-*.js 里，由 shell.js 之后的 script 标签加载。
   index.html / academy-lab.html 里的 <script> 顺序必须与本文件一致；
   tools/build-apk.js 也会把这里的文件打进 APK。

   ── 为什么要在这里做一次语法预检 ────────────────────────────────────────
   浏览器里，一个 <script> 语法错只会让**那一个**模块失效，页面照常工作；
   但 Node 端这些工具是逐个 `eval`/`require` 的，遇到语法错会**整个进程崩掉**，
   于是 10 个检查脚本一起报"引擎加载失败"，看起来像遍地是 bug，
   实际只有一个字符写错 —— 并行开发时这个假象会拖住所有人。

   所以：这里对每个模块先做一次 `new vm.Script()` 预检，
   **跳过写坏的那个模块并大声警告**，让其余检查继续跑得下去。
   注意这不是"容忍语法错"：`tools/syntax-check.js`（check-all 的第一道闸门）
   仍然会把它判为失败，而且这条警告会打在每个工具的输出最前面。
   -------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ALL = [
  'assets/js/sim-data.js',
  'assets/js/cmd-k8s.js',
  'assets/js/cmd-virt.js',
  'assets/js/cmd-iac.js',
  'assets/js/cmd-sec.js',
  'assets/js/cmd-db.js',
  'assets/js/cmd-ops.js',
  'assets/js/cmd-basic2.js',
  'assets/js/fs-extra.js',
  'assets/js/cmd-basic3.js',
  'assets/js/cmd-host.js',
  'assets/js/cmd-text.js',
  'assets/js/cmd-cloud.js',
];

const broken = [];
const usable = ALL.filter(function (rel) {
  try {
    new vm.Script(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), { filename: rel });
    return true;
  } catch (e) {
    broken.push(rel + ' → ' + e.message);
    return false;
  }
});

if (broken.length) {
  console.error('');
  console.error('⚠️  有 ' + broken.length + ' 个引擎模块语法有误，本次检查将**跳过**它们：');
  broken.forEach((b) => console.error('     · ' + b));
  console.error('   这些模块里的命令会表现为 "command not found"，由此产生的失败不算内容缺陷。');
  console.error('   先跑 `node tools/syntax-check.js` 定位到行，再跑 `node tools/check-all.js`。');
  console.error('');
}

module.exports = usable;
module.exports.broken = broken;
