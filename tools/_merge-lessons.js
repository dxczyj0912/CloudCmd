/* tools/_merge-lessons.js · 把片段里的课程合并进课程数据文件
   --------------------------------------------------------------------------
   用法：node tools/_merge-lessons.js <片段文件> <目标数据文件>
   片段文件是一个 CommonJS 模块（`module.exports = [ {课程对象}, … ]`），
   在 Node 里能 require 就能合并 —— 这样内容可以用普通 JS 写，不必手工拼进数组。

   **为什么要有这个脚本**：往 `CC_LESSONS.push(…, …)` 追加记录时，
   上一段的结尾有时带逗号、有时不带 —— 片段自带逗号会变成 `},,`，不带就变成 `} {`。
   **本项目在这一点上踩过四次**，所以这里两边都做归一化：
   剥掉片段开头的逗号，再看插入点前一个非空字符是不是 `}`，是就补一个。
   **幂等**：已存在的 id 直接跳过，重复运行不会产生重复课程。

   ⚠️ 这个脚本必须**精确复刻课程文件的书写风格**，否则会静默失效：
   项目的 `wire-continuity` / `hint-check` / `about-leak-check` 都是**按行正则**扫描的，
   它们假定"一个步骤 = 一行、字段顺序是 title → about → cmd → ref → hint → note"。
   第一版用 JSON.stringify 序列化，输出变成了多行对象 + 双引号键 ——
   语法没问题、站点也能渲染，但**三个校验器一个步骤都扫不到**，
   课程数涨了、步骤数纹丝不动。**"能跑"不等于"校验器认"**，这类差异必须逐字对齐。

   风格要素：键不加引号；字符串优先用单引号；字符串里有单引号时改用双引号；
   换行写成 \n；步骤压成一行；正则必须序列化成字面量（第一版把它变成空对象，
   `expect` 全废 —— 那一版被 `shell-check` 的 `l.expect.test is not a function` 抓住）。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const [snippetRel, targetRel] = process.argv.slice(2);
if (!snippetRel || !targetRel) {
  console.error('用法：node tools/_merge-lessons.js <片段文件> <目标数据文件>');
  process.exit(1);
}

const snippet = require(path.join(ROOT, snippetRel));
const targetPath = path.join(ROOT, targetRel);
let text = fs.readFileSync(targetPath, 'utf8');

const existingIds = new Set();
const idRe = /id:\s*'([^']+)'/g;
let m;
while ((m = idRe.exec(text))) existingIds.add(m[1]);

const fresh = snippet.filter((l) => !existingIds.has(l.id));
if (!fresh.length) {
  console.log('（' + targetRel + '）没有新课程需要合并 —— 全部已存在');
  process.exit(0);
}

/* 序列化统一走 _lesson-serialize.js ——
   见该文件头部关于「正则被 JSON 化」的说明：同一个坑在同一轮里踩过两次，
   所以把序列化收拢到一处，谁都不许再自己写一份。 */
const { serBlock } = require('./_lesson-serialize');

const closeIdx = text.lastIndexOf('\n  );');
if (closeIdx === -1) {
  console.error('!! 找不到数组收尾 —— 目标文件结构与预期不符，未改动');
  process.exit(1);
}

const chunk = fresh.map((l) => '      ' + serBlock(l, 6)).join(',\n\n');

let head = text.slice(0, closeIdx);
const tail = text.slice(closeIdx);

/* 逗号归一化：剥掉片段开头的逗号；看 head 末尾是否需要补一个 */
head = head.replace(/,\s*$/, '');
const lastCh = head.replace(/\s+$/, '').slice(-1);
if (lastCh === '}') head += ',';

text = head + '\n\n' + chunk + '\n' + tail;
fs.writeFileSync(targetPath, text, 'utf8');
console.log('（' + targetRel + '）已合并 ' + fresh.length + ' 节：' + fresh.map((l) => l.id).join(', '));
