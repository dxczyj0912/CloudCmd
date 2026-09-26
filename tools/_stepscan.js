// tools/_stepscan.js · 把课程文件里的「步骤对象」扫出来（供各校验器共用）
/* --------------------------------------------------------------------------
   为什么要有这个公共模块：`title:` / `cmd:` / `hint:` **可能不在同一行** ——
   有的作者写成一行，有的写成多行。校验器如果只用"单行正则"去找步骤，
   多行写法的课程会被**整份跳过**，而工具照样打印"全部通过"。
   这个坑已经真实发生过一次（`hint-check` 报 286/286 通过，实际 23 个步骤
   一行都没看；改成这里的扫描方式后总数立刻变成 309/309，并当场抓出一处真缺陷）。
   所以扫描逻辑只留这一份，两个校验器都从这里取。
   -------------------------------------------------------------------------- */
'use strict';

/* 返回 [{ text, line }]：text 是把该步骤对象的多行拼成的一段逻辑文本，
   line 是它在源文件里的起始行号（1 基）。 */
function stepRecords(src) {
  const lines = String(src).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\{\s*title:/.test(lines[i])) continue;
    let depth = 0, buf = [], j = i;
    for (; j < lines.length; j++) {
      buf.push(lines[j]);
      const s = lines[j];
      for (let k = 0; k < s.length; k++) {
        const ch = s[k];
        if (ch === "'" || ch === '"') {          /* 跳过字符串，别把里面的括号算进去 */
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

/* 取 `hint: [ ... ]` 的内容 —— 用括号配平找真正配对的那个 `]`。
   不能用非贪婪正则：骨架常含 `[ -f … ]`，会在第一个 `]` 就停下。 */
function hintArrayText(text) {
  const at = String(text).indexOf('hint:');
  if (at === -1) return null;
  const open = String(text).indexOf('[', at);
  if (open === -1) return null;
  const line = String(text);
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

/* 把 `['a', 'b']` 切成两条 —— 提示里可能含转义引号或逗号，按引号切。 */
function splitHints(raw) {
  const parts = [];
  let cur = '', q = null;
  const s = String(raw);
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (q) {
      if (ch === '\\') { cur += s[k + 1]; k++; continue; }
      if (ch === q) { q = null; continue; }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { q = ch; continue; }
    if (ch === ',') { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

module.exports = { stepRecords, hintArrayText, splitHints };
