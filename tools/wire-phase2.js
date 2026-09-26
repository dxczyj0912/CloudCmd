/* tools/wire-phase2.js · 把 Phase 2 数据文件接进站点
   --------------------------------------------------------------------------
   做三件事（缺一件新分类就不显示）：
     1. data/_registry.js 里对应分类的 status: 'soon' → 'ready'
     2. index.html 的 <script> 列表里引入新数据文件（插在 termfs.js 之前）
     3. 只处理"文件存在且条数 > 0"的分类，没写的自动跳过
   用法：node tools/wire-phase2.js            # 接线
         node tools/wire-phase2.js --check    # 只看状态，不改文件
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.indexOf('--check') !== -1;

/* 分类 id → 数据文件名（约定：id 即文件名） */
const TARGETS = [
  'shell', 'helm', 'middleware', 'db-cache', 'monitor',
  'cloud-cli', 'iac', 'cicd', 'kvm', 'security', 'perf'
];

/* ---------- 统计每个数据文件的条数 ---------- */
function countOf(catId) {
  const f = path.join(ROOT, 'data', catId + '.js');
  if (!fs.existsSync(f)) return { exists: false, count: 0 };
  global.window = { CC_DATA: {}, CC_CATS: {} };
  try {
    delete require.cache[require.resolve(f)];
    require(f);
    const n = (global.window.CC_DATA[catId] || []).length;
    return { exists: true, count: n };
  } catch (e) {
    return { exists: true, count: 0, error: e.message };
  }
}

/* ---------- 主流程 ---------- */
console.log('== Phase 2 接线状态 ==\n');
const ready = [], missing = [];
TARGETS.forEach(function (id) {
  const r = countOf(id);
  const flag = r.error ? '✗ 加载失败' : (r.count > 0 ? '✓' : '·');
  console.log('  ' + flag + ' ' + id.padEnd(12) + (r.exists ? r.count + ' 条' : '（文件不存在）') +
    (r.error ? '  ' + r.error : ''));
  if (r.count > 0) ready.push(id); else missing.push(id);
});

console.log('\n  可接线: ' + ready.length + ' 个 ｜ 待补: ' + (missing.length ? missing.join(', ') : '无'));

if (CHECK) { console.log('\n（--check 模式，未改动任何文件）'); process.exit(0); }
if (!ready.length) { console.log('\n没有可接线的分类，退出。'); process.exit(0); }

/* ---------- 1) 注册表 ---------- */
const regFile = path.join(ROOT, 'data', '_registry.js');
let reg = fs.readFileSync(regFile, 'utf8');
let flipped = 0;
/* 只在该分类自己的对象块内替换。
   ⚠ 不能用 "id: 'x'[\s\S]{0,600}?status: 'soon'" 这种正则：
   若 x 已是 ready，它会越过自己的块继续往后找，把**下一个**分类的 'soon' 改掉，
   级联下去会把根本还没写数据的分类误标成 ready。 */
function flipOne(text, id) {
  const key = "id: '" + id + "'";
  const at = text.indexOf(key);
  if (at === -1) return { text: text, state: 'missing' };
  const end = text.indexOf('\n    }', at);            /* 该分类对象的结尾 */
  const block = text.slice(at, end === -1 ? at + 600 : end);
  if (!/status: 'soon'/.test(block)) {
    return { text: text, state: /status: 'ready'/.test(block) ? 'already' : 'missing' };
  }
  const fixed = block.replace(/status: 'soon'/, "status: 'ready'");
  return { text: text.slice(0, at) + fixed + text.slice(at + block.length), state: 'flipped' };
}

ready.forEach(function (id) {
  const r = flipOne(reg, id);
  reg = r.text;
  if (r.state === 'flipped') flipped++;
  else if (r.state === 'missing') console.log('  ⚠ 注册表里没找到分类 ' + id);
});
fs.writeFileSync(regFile, reg, 'utf8');
console.log('\n  _registry.js：' + flipped + ' 个分类 status → ready');

/* ---------- 2) index.html 引入 ---------- */
const htmlFile = path.join(ROOT, 'index.html');
let html = fs.readFileSync(htmlFile, 'utf8');
const anchor = '<script src="data/termfs.js"></script>';
if (html.indexOf(anchor) === -1) { console.error('  ✗ index.html 里找不到插入锚点 termfs.js'); process.exit(1); }

const need = ready.filter(function (id) {
  return html.indexOf('data/' + id + '.js') === -1;
});
if (!need.length) {
  console.log('  index.html：已全部引入，无需改动');
} else {
  const inject = need.map(function (id) { return '<script src="data/' + id + '.js"></script>'; }).join('\n');
  html = html.replace(anchor, inject + '\n' + anchor);
  fs.writeFileSync(htmlFile, html, 'utf8');
  console.log('  index.html：新增引入 ' + need.length + ' 个 → ' + need.join(', '));
}

console.log('\n接线完成。接下来跑四套测试：');
console.log('  node tools/validate-data.js && node tools/shell-check.js && node tools/render-check.js && node tools/lab-check.js');
