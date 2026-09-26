// tools/hint-check.js · 渐进式提示的验收闸门
/* --------------------------------------------------------------------------
   每个步骤配两级提示，第三级直接显示 cmd 本身（不需要数据）：

     hint[0]  概念提示 —— 点破思路/判据，**不给命令**
     hint[1]  命令骨架 —— 结构与 cmd 完全一致，只把"这一步的关键那一段"换成 ____

   为什么骨架必须是 cmd 的严格变形：如果骨架随手写，学员照着填完跑不通，
   提示就变成了新的坑。所以这里用机器校验：
     · 骨架必须含至少一个 ____
     · 把 ____ 换成通配后必须能匹配 cmd（结构一致、只mask了关键部分）
     · 概念提示里不许出现命令本身，也不许出现 ____

   用法：
     node tools/hint-check.js            全量校验（有缺失或违规就非零退出）
     node tools/hint-check.js --stat     只看覆盖统计
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STAT_ONLY = process.argv.indexOf('--stat') !== -1;
const FILES = require('./_lessonlist').filter((f) => f !== 'data/lessons.js' && f !== 'data/zz-lesson-assertions.js');

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const problems = [];
const stats = [];

/* ⚠️ 步骤对象**可能是多行的**（`title:` 一行、`cmd:`/`hint:` 各占一行）。
   早先这个工具只用一行正则去匹配 `{ title: … cmd: …`，
   于是多行写法的课程**被整份跳过**：它照样报「286/286 全部通过」，
   实际上一行都没检查 —— 这正是本项目最忌讳的"假绿"。
   现在按大括号配平把每个步骤对象拼成一段逻辑文本再校验，两种写法都能覆盖。 */
function stepRecords(src) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\{\s*title:/.test(lines[i])) continue;
    let depth = 0, buf = [], j = i;
    for (; j < lines.length; j++) {
      buf.push(lines[j]);
      const s = lines[j];
      for (let k = 0; k < s.length; k++) {
        const ch = s[k];
        if (ch === "'" || ch === '"') {           /* 跳过字符串，别把里面的括号算进去 */
          const q = ch; k++;
          while (k < s.length && s[k] !== q) { if (s[k] === '\\') k++; k++; }
          continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth <= 0 && j >= i) break;
    }
    out.push({ text: buf.join(' '), line: i + 1 });
    i = j;
  }
  return out;
}

/* 取 `hint: [ ... ]` 里的内容。
   ⚠️ 不能用 `/\bhint:\s*\[(.*?)\]/` —— 非贪婪匹配会在**骨架里的第一个 `]`** 就停下，
   而骨架经常含 `[ -f … ]`（这一条正是 sh-stderr-log 被误报的原因）。
   这里按引号与括号配平往后扫，取真正配对的那个 `]`。 */
function hintArrayText(line) {
  const at = line.indexOf('hint:');
  if (at === -1) return null;
  const open = line.indexOf('[', at);
  if (open === -1) return null;
  let depth = 0, q = null;
  for (let k = open; k < line.length; k++) {
    const ch = line[k];
    if (q) {
      if (ch === '\\') { k++; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === "'" || ch === '"') { q = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return line.slice(open + 1, k); }
  }
  return null;
}

FILES.forEach((rel) => {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = src.split('\n');
  let lesson = '';
  let total = 0, withHint = 0;
  let cursor = 0;
  stepRecords(src).forEach((rec) => {
    /* 课号取该步骤之前最近的一个 id: */
    for (; cursor < rec.line && cursor < lines.length; cursor++) {
      const lm = lines[cursor].match(/^\s*id:\s*'([^']+)'/);
      if (lm) lesson = lm[1];
    }
    const line = rec.text;
    const i = rec.line - 1;
    total++;
    const where = rel + ' 第 ' + (i + 1) + ' 行 [' + lesson + ']';
    const cm = line.match(/\bcmd:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/);
    /* ⚠️ cmd 与 hint 必须用**同一套反转义规则**，否则任何含反斜杠的命令都会被误报。
       早先这里只处理 `\'` 与 `\"`，而下面的 hints 解析会把 `\\` 还原成 `\` ——
       于是源码里写着 `{"\\t"}` 的 jsonpath 模板，
       cmd 拿到 `\\t`（两个反斜杠）、骨架拿到 `\t`（一个），
       比较时必然不相等，报"骨架与 cmd 结构不一致"。
       受影响的命令类型：jsonpath 模板、awk 的 `\t`、sed 的 `\s`、正则里的 `\d` …
       （这与 example-check 那两处 firstToken 误判是同一类问题：**检查器自身的不一致**。） */
    const unesc = (s) => String(s).replace(/\\\\/g, '\\').replace(/\\'/g, "'").replace(/\\"/g, '"');
    const cmd = unesc(cm ? (cm[1] !== undefined ? cm[1] : cm[2]) : '');
    const rawHint = hintArrayText(line);
    if (rawHint === null) { problems.push(where + ' 缺 hint（两级提示）'); return; }
    withHint++;

    /* 解析 ['a', 'b'] —— 提示里可能含转义引号，按引号切 */
    const raw = rawHint;
    const parts = [];
    let cur = '', q = null;
    for (let k = 0; k < raw.length; k++) {
      const ch = raw[k];
      if (q) {
        if (ch === '\\') { cur += raw[k + 1]; k++; continue; }
        if (ch === q) { q = null; continue; }
        cur += ch;
        continue;
      }
      if (ch === "'" || ch === '"') { q = ch; continue; }
      if (ch === ',') { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim() !== '') parts.push(cur);
    const hints = parts.map((p) => p.trim()).filter((p) => p !== '');
    if (hints.length !== 2) {
      problems.push(where + ' hint 应为 2 条，实际 ' + hints.length + ' 条');
      return;
    }
    const [concept, skeleton] = hints;
    if (concept.length < 10 || concept.length > 90) {
      problems.push(where + ' 概念提示长度 ' + concept.length + ' 字（应在 10~90 之间）');
    }
    if (concept.indexOf('____') !== -1) problems.push(where + ' 概念提示里不该出现 ____');
    if (skeleton.indexOf('____') === -1) problems.push(where + ' 命令骨架里没有 ____（没有留空就不叫骨架）');
    const firstTok = cmd.trim().split(/\s+/)[0];
    if (firstTok && concept.indexOf(firstTok + ' ') !== -1) {
      problems.push(where + ' 概念提示里直接写出了命令（' + firstTok + '）');
    }
    if (concept.indexOf(cmd) !== -1 && cmd.length > 6) {
      problems.push(where + ' 概念提示里出现了完整命令');
    }
    /* 骨架必须能匹配 cmd */
    if (skeleton.indexOf('____') !== -1) {
      const re = new RegExp('^' + escapeRe(skeleton).split('____').join('.+?') + '$');
      if (!re.test(cmd)) {
        problems.push(where + ' 命令骨架与 cmd 结构不一致\n        骨架: ' + skeleton + '\n        命令: ' + cmd);
      }
    }
  });
  stats.push({ file: rel, total: total, withHint: withHint });
});

console.log('='.repeat(74));
console.log('渐进式提示校验');
console.log('='.repeat(74));
let t = 0, h = 0;
stats.forEach((s) => {
  t += s.total; h += s.withHint;
  const pct = s.total ? Math.round((s.withHint / s.total) * 100) : 0;
  console.log('  ' + s.file.padEnd(28) + String(s.withHint).padStart(3) + ' / ' + String(s.total).padEnd(3) + ' 步（' + pct + '%）');
});
console.log('  合计 ' + h + ' / ' + t + ' 步有提示');
if (STAT_ONLY) { console.log(''); process.exit(h === t ? 0 : 1); }
if (problems.length) {
  console.log('\n问题 ' + problems.length + ' 处：');
  problems.slice(0, 40).forEach((p) => console.log('  ✗ ' + p));
  if (problems.length > 40) console.log('  … 还有 ' + (problems.length - 40) + ' 处');
} else {
  console.log('\n全部通过：两级提示齐全，骨架与命令结构一致。');
}
process.exit(problems.length ? 1 : 0);
