/* tools/_lesson-serialize.js · 把课程对象序列化成"课程文件风格"的源码
   --------------------------------------------------------------------------
   抽成独立模块的原因：`_merge-lessons.js` 与 `_merge-l1.js` 都要用它。
   第一版让 `_merge-l1.js` 用 `JSON.stringify` 转手中数据 —— **正则被序列化成 `{}`**，
   于是 8 节新课的 `expect` 全部变成空对象，`shell-check` 直接报
   `l.expect.test is not a function`。**同一个坑在同一轮里踩了两次**
   （第一次是 `_merge-lessons.js` 自己），所以这次把序列化收拢到一处，谁都不许再自己写。

   风格要素（必须逐字对齐，因为校验器是按行正则扫的）：
     键不加引号；字符串优先单引号（含单引号时改双引号）；换行写成 \n；
     步骤压成一行；**正则写成字面量**。
   ========================================================================== */
'use strict';

function q(s) {
  const t = String(s);
  if (t.indexOf("'") === -1) {
    return "'" + t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n') + "'";
  }
  return '"' + t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}
function key(k) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : q(k); }
function isPlain(v) { return v === null || typeof v !== 'object'; }

function serPlain(v) {
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof RegExp) return v.toString();
  return q(v);
}
function serInlineDeep(v) {
  if (v instanceof RegExp) return v.toString();
  if (Array.isArray(v)) return '[' + v.map(serInlineDeep).join(', ') + ']';
  if (isPlain(v)) return serPlain(v);
  return serInlineObj(v);
}
function serInlineObj(o) {
  return '{ ' + Object.keys(o).map((k) => {
    const v = o[k];
    if (v instanceof RegExp) return key(k) + ': ' + v.toString();
    if (Array.isArray(v)) return key(k) + ': [' + v.map(serInlineDeep).join(', ') + ']';
    if (isPlain(v)) return key(k) + ': ' + serPlain(v);
    return key(k) + ': ' + serInlineObj(v);
  }).join(', ') + ' }';
}
function serBlock(v, indent) {
  const pad = ' '.repeat(indent);
  if (v instanceof RegExp) return v.toString();
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return '[\n' + v.map((x) => pad + '  ' + serBlock(x, indent + 2)).join(',\n') + '\n' + pad + ']';
  }
  if (isPlain(v)) return serPlain(v);
  /* 步骤对象（有 title + cmd）压成一行 —— 校验器按行扫 */
  if (v.title !== undefined && v.cmd !== undefined) return serInlineObj(v);
  return '{\n' + Object.keys(v).map((k) => pad + '  ' + key(k) + ': ' + serBlock(v[k], indent + 2)).join(',\n') + '\n' + pad + '}';
}

module.exports = { q, key, isPlain, serPlain, serInlineDeep, serInlineObj, serBlock };
