/* tools/_drop-lesson.js · 按 id 删除一节课（支持删最后一节）
   --------------------------------------------------------------------------
   用法：node tools/_drop-lesson.js <目标数据文件> <课程id>
   `_merge-lessons.js` 的反操作。删条目比追加更容易出错的地方在**逗号**：
   删掉中间一节要保留前一节的逗号，删掉**最后一节**则要把前一节结尾的逗号去掉 ——
   这个脚本两种情况都处理（先剥尾逗号，看前一个非空字符是不是 `}`，是就补一个）。
   幂等：id 不存在时提示并正常退出。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const rel = process.argv[2];
const id = process.argv[3];
if (!rel || !id) { console.error('用法：node tools/_drop-lesson.js <文件> <id>'); process.exit(1); }
const p = path.join(ROOT, rel);
let t = fs.readFileSync(p, 'utf8');
const marker = "        id: '" + id + "'";
const at = t.indexOf(marker);
if (at < 0) { console.log('未找到 ' + id + '（可能已删）'); process.exit(0); }
const start = t.lastIndexOf('\n      {\n', at);
if (start < 0) { console.log('定位起点失败'); process.exit(1); }
/* 结束点：下一个同级 `      },` 或（若是最后一节）数组收尾 `\n  );` */
const nextEnd = t.indexOf('\n      },\n', at);
const closeIdx = t.lastIndexOf('\n  );');
let end;
if (nextEnd > 0 && (closeIdx < 0 || nextEnd < closeIdx)) end = nextEnd + '\n      },\n'.length;
else { end = closeIdx; }
let head = t.slice(0, start);
const tail = t.slice(end);
head = head.replace(/,\s*$/, '');
const lastCh = head.replace(/\s+$/, '').slice(-1);
if (lastCh === '}') head += ',';
fs.writeFileSync(p, head + tail, 'utf8');
console.log('已删除 ' + id + '（' + (end - start) + ' 字符）');
