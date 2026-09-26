// tools/wire-cheat.js · 给「故障速查」的每条排查链路接上命令条目（故障剧本 ↔ 命令手册）
/* --------------------------------------------------------------------------
   为什么要有这个工具：
   `data/cheat.js` 里 37 条排查链路是**学习连贯性的最后一环** ——
   路线图 → 课程 → 命令 → 卡片 → 配方 → **故障剧本**。但此前链路里的命令
   只是一串纯文本：既点不进命令手册，也没有人验证过它们到底有没有条目、
   在模拟终端里跑不跑得起来。`continuity-check` 甚至没有加载 `cheat.js`。
   于是"照着链路一路敲下去"这句话在页面上是空头支票。

   这个工具做两件事：
     1. 为每条链路解析出 `cmdIds`（链上命令 → 命令条目 id），写回 `data/cheat.js`；
     2. 如实报出**没有条目**与**模拟终端跑不了**的命令 —— 页面上要照实标注，
        不能让学员以为点了就能跑（这是 A3「未实现命令诚实提示」的落点）。

   匹配规则：**最长前缀匹配**（条目名必须是链上行的前缀，逐 token 比），
   同样长时优先 `kind: 'recipe'`（配方条目更适合"照着一路敲"）。
   整条名字都前缀命中才算，避免 `ps` 之类把 `psql` 也接上。
   兜底：只按首词命中且**候选唯一**时才接（报 `--loose` 时可以人工复核）。

   幂等：重复跑会先删掉已有的 `cmdIds` 行再按当前数据重写，不会越接越多。

   用法：
     node tools/wire-cheat.js            # 写入
     node tools/wire-cheat.js --check    # 只读校验（供 check-all / continuity-check 调用）
     node tools/wire-cheat.js --loose    # 列出"仅按首词兜底"的配对，人工复核用
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.indexOf('--check') !== -1;
const SHOW_LOOSE = process.argv.indexOf('--loose') !== -1;

global.window = { CC_CATS: {}, CC_DATA: {}, CC_CARDS: [] };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  documentElement: { setAttribute() {}, getAttribute() { return 'light'; } },
  addEventListener() {}, getElementById: () => null, querySelectorAll: () => []
};

const load = (f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
load('data/_registry.js');
const CATS = Object.keys(window.CC_CATS);
CATS.forEach((id) => load('data/' + id + '.js'));
load('data/cheat.js');
load('data/termfs.js');
load('assets/js/store.js');
load('assets/js/shell.js');
require('./_cmdlist').forEach((f) => load(f));

const CHEAT = window.CC_CHEAT || [];
const DATA = window.CC_DATA;
const IMPL = new Set((window.CC_SHELL && window.CC_SHELL.commands) || []);

/* 链路上会出现但不是"命令"的东西：注释行、shell 关键字与内建（不需要条目） */
const SKIP = ['#', 'if', 'for', 'while', 'case', 'echo', 'export', 'cd', 'set', 'then', 'do', 'done', 'else', 'fi'];

const ALL = [];
CATS.forEach((cat) => (DATA[cat] || []).forEach((r) => {
  ALL.push({ id: r.id, cat: cat, name: String(r.name || '').trim(), recipe: r.kind === 'recipe' });
}));
const nameOf = new Map(ALL.map((r) => [r.id, r.name]));

const toks = (s) => String(s).trim().split(/\s+/);

/* 链上行 → 命令条目 id */
function resolve(line) {
  const lt = toks(line);
  if (!lt.length || !lt[0]) return { id: null, why: 'empty' };
  let best = null;
  for (let i = 0; i < ALL.length; i++) {
    const r = ALL[i];
    const rt = toks(r.name);
    if (rt.length > lt.length) continue;
    let k = 0;
    while (k < rt.length && rt[k] === lt[k]) k++;
    if (k !== rt.length || k === 0) continue;      /* 条目名必须**整条**都是前缀 */
    const score = k * 100 + (r.recipe ? 10 : 0) - rt.length;
    if (!best || score > best.score) best = { r: r, score: score, k: k };
  }
  if (best) return { id: best.r.id, k: best.k, why: 'prefix' };
  /* 兜底：只按首词命中且候选唯一（`ps -eo ...` 这种选项写法与条目名不同、但确实是同一条命令） */
  const cands = ALL.filter((r) => toks(r.name)[0] === lt[0]);
  if (cands.length === 1) return { id: cands[0].id, k: 1, why: 'loose' };
  return { id: null, why: cands.length ? 'ambiguous(' + cands.length + ')' : 'no-manual' };
}

/* ── 解析全部剧本 ─────────────────────────────────────────────────────── */
const report = [];
let lineTotal = 0, lineLinked = 0, lineSkip = 0, looseCount = 0;
const noManual = new Map();      /* 命令名 → 出现次数（手册里没有任何条目） */
const notImpl = new Map();       /* 命令名 → 出现次数（有条目但模拟终端跑不了） */
const loosePairs = [];

CHEAT.forEach((e) => {
  const ids = [];
  (e.chain || []).forEach((line) => {
    lineTotal++;
    const head = toks(line)[0];
    if (!head || SKIP.indexOf(head) !== -1) { lineSkip++; return; }
    const r = resolve(line);
    if (!r.id) {
      noManual.set(head, (noManual.get(head) || 0) + 1);
      return;
    }
    lineLinked++;
    if (r.why === 'loose') { looseCount++; loosePairs.push(line + '  →  ' + r.id + ' «' + nameOf.get(r.id) + '»'); }
    if (ids.indexOf(r.id) === -1) ids.push(r.id);
    if (!IMPL.has(head)) notImpl.set(head, (notImpl.get(head) || 0) + 1);
  });
  report.push({ id: e.id, ids: ids, chainLen: (e.chain || []).length });
});

const zero = report.filter((r) => !r.ids.length);

/* ── --check：只读校验 ────────────────────────────────────────────────── */
if (CHECK) {
  const problems = [];
  const withIds = CHEAT.filter((e) => Array.isArray(e.cmdIds) && e.cmdIds.length).length;
  if (withIds !== CHEAT.length) problems.push('还有 ' + (CHEAT.length - withIds) + ' 个剧本没有 cmdIds');
  CHEAT.forEach((e) => {
    (e.cmdIds || []).forEach((id) => { if (!nameOf.has(id)) problems.push(e.id + ' 的 cmdIds 指向不存在的条目: ' + id); });
  });
  /* 解析结果必须与写进文件的 cmdIds 一致 —— 否则说明数据改过而没重跑这个工具 */
  const expect = new Map(report.map((r) => [r.id, r.ids.join(',')]));
  CHEAT.forEach((e) => {
    const got = (e.cmdIds || []).join(',');
    if (expect.get(e.id) !== got) {
      problems.push(e.id + ' 的 cmdIds 与当前数据解析结果不一致（请重跑 node tools/wire-cheat.js）');
    }
  });
  console.log('='.repeat(74));
  console.log('故障剧本连通性校验');
  console.log('='.repeat(74));
  console.log('剧本 ' + CHEAT.length + ' 个 ｜ 链上命令 ' + lineTotal + ' 条（跳过注释/内建 ' + lineSkip + '）'
    + ' ｜ 已接上条目 ' + lineLinked + ' 条');
  console.log('带 cmdIds 的剧本 ' + withIds + ' / ' + CHEAT.length + ' ｜ 零链接剧本 ' + zero.length);
  console.log('手册里没有条目的命令 ' + noManual.size + ' 个: '
    + ([...noManual.keys()].join(' ') || '（无）'));
  console.log('模拟终端跑不了的命令 ' + notImpl.size + ' 个: '
    + ([...notImpl.entries()].map((x) => x[0] + '×' + x[1]).join('  ') || '（无）'));
  if (problems.length) {
    console.log('\n问题 ' + problems.length + ' 处：');
    problems.slice(0, 20).forEach((p) => console.log('  ✗ ' + p));
    process.exit(1);
  }
  console.log('\n全部通过：每条排查链路都接上了命令条目，且与当前数据一致。');
  process.exit(0);
}

/* ── 写入 ─────────────────────────────────────────────────────────────── */
const FILE = path.join(ROOT, 'data/cheat.js');
let src = fs.readFileSync(FILE, 'utf8');

/* 先删掉已有的 cmdIds 行（幂等） */
src = src.replace(/^[ \t]*cmdIds:[ \t]*\[[^\]]*\],[ \t]*\n/gm, '');

/* 逐个剧本：在它的 id 行后面插入 cmdIds */
let inserted = 0;
const missing = [];
report.forEach((r) => {
  const re = new RegExp('(^[ \\t]*id:[ \\t]*\'' + r.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\'[^\\n]*\\n)', 'm');
  const m = src.match(re);
  if (!m) { missing.push(r.id); return; }
  const indent = (m[1].match(/^[ \t]*/) || [''])[0] + '  ';
  const list = r.ids.map((i) => '\'' + i + '\'').join(', ');
  src = src.replace(re, m[1] + indent + 'cmdIds: [' + list + '],\n');
  inserted++;
});

if (missing.length) {
  console.error('✗ 有 ' + missing.length + ' 个剧本在文件里找不到对应的 id 行，未写入：' + missing.join(', '));
  process.exit(1);
}

fs.writeFileSync(FILE, src, 'utf8');

console.log('='.repeat(74));
console.log('故障剧本 → 命令条目 接线完成');
console.log('='.repeat(74));
console.log('写入 cmdIds 的剧本 ' + inserted + ' / ' + report.length);
console.log('链上命令 ' + lineTotal + ' 条（跳过注释/内建 ' + lineSkip + '）｜ 接上条目 ' + lineLinked
  + ' 条 ｜ 仅按首词兜底 ' + looseCount + ' 条');
console.log('每个剧本接到的条目数：'
  + report.map((r) => r.id.replace('cheat-', '') + ':' + r.ids.length).join('  '));
if (noManual.size) {
  console.log('\n⚠ 手册里没有条目的命令（页面会照实标注"未收录"，不接链接）：');
  console.log('   ' + [...noManual.entries()].map((x) => x[0] + '×' + x[1]).join('  '));
}
if (notImpl.size) {
  console.log('\n⚠ 有条目但**模拟终端跑不了**的命令（页面会标"仅真机"）：');
  console.log('   ' + [...notImpl.entries()].map((x) => x[0] + '×' + x[1]).join('  '));
}
if (zero.length) console.log('\n⚠ 零链接剧本：' + zero.map((z) => z.id).join(', '));
if (SHOW_LOOSE && loosePairs.length) {
  console.log('\n仅按首词兜底的配对（请人工复核）：');
  loosePairs.forEach((p) => console.log('   ' + p));
}
