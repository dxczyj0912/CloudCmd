// tools/insert-record.js · 往 data/<分类>.js 里插一条命令记录，并自动维护编号
/* --------------------------------------------------------------------------
   这些数据文件里有两套人工编号，插一条就会全乱：

     每条记录上方的序号注释：  形如 横线 7 / 46 横线
     分组标题里的条数：        形如 A. 容量查看与排查（10 条）

   这个工具负责把两套编号重新算对，插完就一致 —— 手改必然漏。

   用法：
     node tools/insert-record.js --file data/monitor.js --after mo-uptime --snippet /tmp/rec.txt
     node tools/insert-record.js --file data/monitor.js --end --snippet /tmp/rec.txt
     node tools/insert-record.js --check            校验所有分类的编号是否自洽
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const CHECK = ARGV.indexOf('--check') !== -1;

function arg(name, def) {
  const i = ARGV.indexOf('--' + name);
  return i === -1 ? def : ARGV[i + 1];
}

/* 逐字符数括号找记录块（跳过字符串），与 wire-continuity.js 同源 */
function recordBlocks(src) {
  const lines = src.split('\n');
  const blocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === "'" || ch === '"' || ch === '`') {
        const q = ch; j++;
        while (j < line.length && lines[i][j] !== q) { if (lines[i][j] === '\\') j++; j++; }
        continue;
      }
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
      else if (ch === '{') { depth++; if (depth === 2 && line.trim() === '{') start = i; }
      else if (ch === '}') { depth--; if (depth === 1 && start !== -1) { blocks.push([start, i]); start = -1; } }
    }
  }
  return blocks;
}

function recordId(lines, block) {
  const body = lines.slice(block[0], block[1] + 1).join('\n');
  const m = body.match(/^\s*id:\s*'([^']+)'/m);
  return m ? m[1] : null;
}

/* ── 编号维护 ───────────────────────────────────────────────────────────── */
function renumber(src) {
  /* GitHub 的 Windows checkout 会把仓库里的 LF 转成 CRLF。先按统一换行
     计算编号，再恢复原换行；否则 --check 会把每行的 \r 误判为内容差异。 */
  const eol = src.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  src = src.replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const blocks = recordBlocks(src);
  const total = blocks.length;

  /* 1. 每条记录前的序号注释归位；没有的补上 */
  /* 记录前的注释行形如 `    /* ---------- 3 / 40 ---------- *\/`，位于块起始行的上一行 */
  const seqLines = new Set();
  lines.forEach((l, i) => { if (/^\s*\/\* -+ \d+ \/ \d+ -+ \*\/\s*$/.test(l)) seqLines.add(i); });

  /* 每条记录要么上一行是序号注释，要么补一行 */
  const inserts = [];
  blocks.forEach((b, idx) => {
    const prev = b[0] - 1;
    if (seqLines.has(prev)) return;
    inserts.push({ line: b[0], text: '    /* ---------- ' + (idx + 1) + ' / ' + total + ' ---------- */' });
  });
  inserts.sort((a, b) => b.line - a.line).forEach((ins) => lines.splice(ins.line, 0, ins.text));

  /* 补行之后重新扫一遍块位置，再统一改序号 */
  let out = lines.join('\n');
  const blocks2 = recordBlocks(out);
  const outLines = out.split('\n');
  const seqAt = [];
  outLines.forEach((l, i) => { if (/^\s*\/\* -+ \d+ \/ \d+ -+ \*\/\s*$/.test(l)) seqAt.push(i); });
  blocks2.forEach((b, idx) => {
    const prev = b[0] - 1;
    if (seqAt.indexOf(prev) !== -1) outLines[prev] = '    /* ---------- ' + (idx + 1) + ' / ' + total + ' ---------- */';
  });

  /* 2b. 记录之间的逗号：最后一条不带逗号，其余必须带 ——
     插一条新记录最容易漏的就是这个逗号（漏了整份数据文件语法就废了）。 */
  blocks2.forEach((b, idx) => {
    const close = outLines[b[1]];
    if (!/^\s*\},?\s*$/.test(close)) return;
    const wantComma = idx < total - 1;
    const has = /,\s*$/.test(close);
    if (wantComma && !has) outLines[b[1]] = close.replace(/\}\s*$/, '},');
    else if (!wantComma && has) outLines[b[1]] = close.replace(/,\s*$/, '');
  });

  /* 3. 分组标题里的条数：按下一个分组标题之前的记录数重算 */
  const groupRe = /^(\s*\/\* =+ [A-Z]\.\s.*?)（(\d+) 条）( =+ \*\/)\s*$/;
  const groupIdx = [];
  outLines.forEach((l, i) => { if (groupRe.test(l)) groupIdx.push(i); });
  groupIdx.forEach((gi, k) => {
    const end = k + 1 < groupIdx.length ? groupIdx[k + 1] : outLines.length;
    const n = blocks2.filter((b) => b[0] > gi && b[0] < end).length;
    outLines[gi] = outLines[gi].replace(groupRe, (m, a, _old, c) => a + '（' + n + ' 条）' + c);
  });

  return { text: outLines.join('\n').replace(/\n/g, eol), total: total, groups: groupIdx.length };
}

/* ── 校验模式 ───────────────────────────────────────────────────────────── */
if (CHECK || ARGV.indexOf('--fix') !== -1) {
  const dir = path.join(ROOT, 'data');
  const files = fs.readdirSync(dir).filter((f) => /\.js$/.test(f) && f !== '_registry.js');
  let bad = 0, checked = 0;
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (src.indexOf('CC_DATA') === -1) return;
    checked++;
    const fixed = renumber(src).text;
    if (fixed !== src) {
      bad++;
      const a = src.split('\n'), b = fixed.split('\n');
      const diff = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff.push('第 ' + (i + 1) + ' 行: ' + (a[i] || '').trim() + '  →  ' + (b[i] || '').trim());
      console.log((CHECK ? '✗ ' : '✓ 修正 ') + f + '（' + diff.length + ' 处）');
      diff.slice(0, 6).forEach((d) => console.log('    ' + d));
      if (!CHECK) fs.writeFileSync(path.join(dir, f), fixed, 'utf8');
    }
  });
  console.log('检查 ' + checked + ' 个数据文件，' + bad + ' 个需要修正' + (CHECK ? '' : '（已写入）'));
  process.exit(CHECK && bad ? 1 : 0);
}

/* ── 写入模式 ───────────────────────────────────────────────────────────── */
const file = arg('file');
const snippetPath = arg('snippet');
if (!file || !snippetPath) {
  console.error('用法: node tools/insert-record.js --file data/xxx.js (--after <id> | --end) --snippet <文件>');
  process.exit(2);
}

const full = path.join(ROOT, file);
const src = fs.readFileSync(full, 'utf8');
const snippet = fs.readFileSync(path.resolve(snippetPath), 'utf8').replace(/^\uFEFF/, '').replace(/\s+$/, '');
const sid = (snippet.match(/^\s*id:\s*'([^']+)'/m) || [])[1];
if (!sid) { console.error('✗ 片段里找不到 id'); process.exit(2); }

const lines = src.split('\n');
const blocks = recordBlocks(src);
const ids = blocks.map((b) => recordId(lines, b));
if (ids.indexOf(sid) !== -1) { console.log('已存在 ' + sid + '，无需插入'); process.exit(0); }

const afterId = arg('after');
let at;
if (afterId) {
  const idx = ids.indexOf(afterId);
  if (idx === -1) { console.error('✗ 找不到锚点记录 ' + afterId + '（可选: ' + ids.slice(0, 8).join(', ') + ' …）'); process.exit(2); }
  at = blocks[idx][1] + 1;            /* 锚点记录的结束行之后 */
} else {
  /* --end：插在数组最后一个记录之后，闭合 `);` 之前 */
  const close = lines.findIndex((l, i) => i > blocks[blocks.length - 1][1] && /^\s*\);/.test(l));
  at = close === -1 ? blocks[blocks.length - 1][1] + 1 : close;
}

/* ⚠️ 缩进要**按文件现有的记录对齐**，不能无脑 `'    ' + l`。
   数据文件里的记录统一是 4 空格起（`    {` ），字段 6 空格（`      id:`）。
   片段文件的作者可能正好写成 4 空格起 —— 再补 4 格就变成 8/10 空格，
   页面照常工作，但 `tools/apk-check.js` 的 countSourceCommands() 是按
   `^\s{6}id: '` 数条数的，于是**新增的记录会被漏数**，报出
   "APK 里的数据与源码不一致"这种看起来像 APK 坏了的假失败。
   （这个坑真实发生过：插入 5 条记录后 apk-check 报 825 ≠ 830。）
   做法：先算出片段自身的**最小缩进**，把它归一化到 4 空格。 */
const snipLines = snippet.split('\n');
const indents = snipLines.filter((l) => l.trim() !== '')
  .map((l) => (l.match(/^[ \t]*/) || [''])[0].length);
const minIndent = indents.length ? Math.min.apply(null, indents) : 0;
const body = snipLines.map((l) => {
  if (l.trim() === '') return l;
  return '    ' + l.slice(Math.min(minIndent, (l.match(/^[ \t]*/) || [''])[0].length));
});
lines.splice(at, 0, ...body);

const out = renumber(lines.join('\n'));
fs.writeFileSync(full, out.text, 'utf8');
console.log('✓ ' + file + ' 插入 ' + sid + '（' + (afterId ? '在 ' + afterId + ' 之后' : '末尾') + '），现有 ' + out.total + ' 条记录，' + out.groups + ' 个分组编号已重算');
