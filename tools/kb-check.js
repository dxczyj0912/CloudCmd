// tools/kb-check.js · 知识库四份数据（概念 / 报错 / 版本 / 认证对照）的校验
/* --------------------------------------------------------------------------
   这四块是"命令手册之外"的内容，但同样不能只靠肉眼：
     · 字段是否齐全、长度是否在区间内
     · related / lessons 引用是否断链（断链就会把学员带到空页面）
     · 报错记录的 diagnose[] 首词必须是引擎已实现的命令（写出来的排查步骤要能真跑）
     · 归类用的 cat 必须是真实分类 id
   用法：node tools/kb-check.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = { CC_CATS: {}, CC_DATA: {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };

const load = (f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
load('data/_registry.js');
Object.keys(window.CC_CATS).forEach((id) => load('data/' + id + '.js'));
require('./_lessonlist').forEach((f) => load(f));
load('data/termfs.js');
load('assets/js/store.js');
load('assets/js/shell.js');
require('./_cmdlist').forEach((f) => load(f));
require('./_kblist').forEach((f) => load(f));
/* 卡片数据：认证对照页会引用"A 张卡片"这类站内统计，要拿真值来比对 */
global.window.CC_CARDS = global.window.CC_CARDS || [];
require('fs').readdirSync(path.join(ROOT, 'data'))
  .filter((f) => /^cards.*\.js$/.test(f))
  .sort()
  .forEach((f) => load('data/' + f));

const CATS = new Set(Object.keys(window.CC_CATS));
const CMD_IDS = new Set();
Object.keys(window.CC_DATA).forEach((c) => (window.CC_DATA[c] || []).forEach((r) => CMD_IDS.add(r.id)));
const LESSON_IDS = new Set((window.CC_LESSONS || []).map((l) => l.id));
const IMPL = new Set(window.CC_SHELL.commands);

const problems = [];
const stats = [];

function need(cond, msg) { if (!cond) problems.push(msg); }
function len(v, min, max) { return typeof v === 'string' && v.length >= min && v.length <= max; }
function refsOk(list, pool, where, label) {
  (list || []).forEach((r) => need(pool.has(r), where + ' 的 ' + label + ' 断链: ' + r));
}

/* ── 概念 ─────────────────────────────────────────────────────────────── */
const CONCEPTS = window.CC_CONCEPTS || [];
const conceptIds = new Set();
CONCEPTS.forEach((c, i) => {
  const w = 'concepts[' + i + '] ' + (c.id || '(无 id)');
  need(!!c.id, w + ' 缺 id');
  need(!conceptIds.has(c.id), '概念 id 重复: ' + c.id);
  conceptIds.add(c.id);
  need(/^[a-z0-9-]+$/.test(c.id || ''), w + ' 的 id 应为 kebab-case：' + c.id);
  need(!!c.term, w + ' 缺 term');
  need(len(c.oneLine, 8, 40), w + ' 的 oneLine 应 8~40 字，实际 ' + (c.oneLine || '').length);
  need(len(c.why, 60, 400), w + ' 的 why 应 ≥60 字，实际 ' + (c.why || '').length);
  need(Array.isArray(c.confusion) && c.confusion.length >= 1, w + ' 至少要有 1 条 confusion（常见误解是这一块的核心价值）');
  (c.confusion || []).forEach((q, k) => {
    need(!!q.q && !!q.a, w + ' 的第 ' + (k + 1) + ' 条 confusion 缺 q 或 a');
    need(!/^(是|对|可以|不行)$/.test(String(q.a || '').trim()), w + ' 的第 ' + (k + 1) + ' 条答案过于草率');
  });
  need(CATS.has(c.cat), w + ' 的 cat 不是有效分类: ' + c.cat);
  need(c.level >= 1 && c.level <= 3, w + ' 的 level 应为 1~3');
  refsOk(c.related, CMD_IDS, w, 'related');
  refsOk(c.lessons, LESSON_IDS, w, 'lessons');
});
stats.push({ name: '概念词典', n: CONCEPTS.length, target: 60 });

/* ── 报错 ─────────────────────────────────────────────────────────────── */
const ERRORS = window.CC_ERRORS || [];
const errMsgs = new Set();
ERRORS.forEach((e, i) => {
  const w = 'errors[' + i + '] ' + (e.id || '(无 id)');
  need(!!e.id, w + ' 缺 id');
  need(/^[a-z0-9-]+$/.test(e.id || ''), w + ' 的 id 应为 kebab-case：' + e.id);
  need(!errMsgs.has(e.msg), '报错原文重复: ' + String(e.msg).slice(0, 50));
  errMsgs.add(e.msg);
  need(len(e.msg, 12, 200), w + ' 的 msg 应 12~200 字，实际 ' + (e.msg || '').length);
  need(len(e.meaning, 15, 300), w + ' 的 meaning 应 ≥15 字');
  need(Array.isArray(e.causes) && e.causes.length >= 2 && e.causes.length <= 5,
    w + ' 的 causes 应有 2~5 条，实际 ' + ((e.causes || []).length));
  need(Array.isArray(e.diagnose) && e.diagnose.length >= 1, w + ' 至少要有 1 条 diagnose 命令');
  (e.diagnose || []).forEach((d) => {
    const tok = String(d).trim().split(/\s+/)[0];
    need(IMPL.has(tok), w + ' 的 diagnose「' + d + '」首词 ' + tok + ' 不是引擎已实现的命令（学员点了跑不通）');
  });
  need(len(e.fix, 8, 300), w + ' 的 fix 应 ≥8 字');
  need(CATS.has(e.cat), w + ' 的 cat 不是有效分类: ' + e.cat);
  refsOk(e.related, CMD_IDS, w, 'related');
});
stats.push({ name: '报错速查', n: ERRORS.length, target: 80 });

/* ── 版本 ─────────────────────────────────────────────────────────────── */
const VERSIONS = window.CC_VERSIONS || [];
VERSIONS.forEach((v, i) => {
  const w = 'versions[' + i + '] ' + (v.id || '(无 id)');
  need(!!v.id && !!v.topic, w + ' 缺 id 或 topic');
  need(len(v.then, 3, 120), w + ' 的 then（老写法）应 3~120 字');
  need(len(v.now, 3, 120), w + ' 的 now（新写法）应 3~120 字');
  need(v.then !== v.now, w + ' 的新老写法不能一样');
  need(len(v.why, 20, 400), w + ' 的 why 应 ≥20 字');
  need(len(v.risk, 15, 400), w + ' 的 risk 应 ≥15 字（生产上踩到会怎样）');
  need(CATS.has(v.cat), w + ' 的 cat 不是有效分类: ' + v.cat);
  refsOk(v.related, CMD_IDS, w, 'related');
});
stats.push({ name: '版本差异', n: VERSIONS.length, target: 30 });

/* ── 认证对照 ─────────────────────────────────────────────────────────── */
const CERT = window.CC_CERT || [];
CERT.forEach((c, i) => {
  const w = 'cert[' + i + '] ' + (c.id || '(无 id)');
  need(!!c.id && !!c.name && !!c.vendor, w + ' 缺 id/name/vendor');
  need(len(c.note, 10, 300), w + ' 的 note 应 ≥10 字');
  need(Array.isArray(c.domains) && c.domains.length >= 3, w + ' 的 domains 应 ≥3 个（一个认证不可能只有一两个知识域）');
  (c.domains || []).forEach((d, k) => {
    const dw = w + ' 的第 ' + (k + 1) + ' 个知识域';
    need(!!d.name, dw + ' 缺 name');
    need(['high', 'partial', 'gap'].indexOf(d.covered) !== -1, dw + ' 的 covered 必须是 high/partial/gap');
    refsOk(d.catIds, CATS, dw, 'catIds');
    refsOk(d.lessons, LESSON_IDS, dw, 'lessons');
    need(len(d.note, 8, 300), dw + ' 的 note 应 ≥8 字（要说清本站覆盖到什么程度）');
  });
});
stats.push({ name: '认证对照', n: CERT.length, target: 4 });

/* ── 站内统计数字一致性 ───────────────────────────────────────────────────
   认证对照页与概念词典的文案里写着"本站 N 条命令 / M 节课 / K 张卡片"。
   这些数字是**手写的**，站点数据一变就会漂 —— 而这一页的全部价值就是
   "本站覆盖到什么程度"，数字错了等于整页在说假话，且看起来完全正常。

   真实发生过：补课把课程从 91 节做到 150 节，cert.js 里 15 处统计全部过期
   （还写着 825 条命令、48 节课、161 条命令 14 节课…），而当时的校验器
   只查字段、长度与引用，**完全不查数字**，所以一路绿灯。

   所以这里按"数字必须等于真值"来查。判据分两类：
     · 全站总量（"真实统计：N 条命令、M 节课、K 张卡片"）→ 与全站真值比
     · 分类组合（"三个分类 N 条命令、M 节课、K 张卡片"）→ 与所有分类组合的真值比
   第二类用"穷举组合真值集合"的做法：只要这对数字等于**某个**真实组合，
   就认为它自洽，不去猜它到底在说哪几个分类（猜错就是假阳性）。 */
const CARD_LIST = window.CC_CARDS || [];
/* 「引擎有多少个命令」这个数字有两个口径，必须钉死一个再用：
     · CMDS 表条数（338）—— 引擎里注册了多少个用户可见命令名
     · 数据条目首词里能跑的（263，含别名口径 265）—— **站点自己算的那个数**
   项目里过去混着用（有时写 338、有时写 339），差一个就会让断言永远红。
   这里统一用**站点口径**：数据里实际出现过、且引擎能跑的命令名 ——
   因为认证页写这个数字是给学员看"有多少条能在这儿练"，不是给引擎做统计。 */
const DATA_HEADS = new Set();
Object.keys(window.CC_DATA).forEach((c) => (window.CC_DATA[c] || []).forEach((r) => {
  const h = String(r.name || '').trim().split(/\s+/)[0];
  if (h) DATA_HEADS.add(h);
}));
const RUNNABLE_HEADS = [...DATA_HEADS].filter((h) => window.CC_SHELL.runnable(h)).length;
const statOf = (catIds) => {
  let cmds = 0, lessons = 0, cards = 0;
  catIds.forEach((c) => {
    cmds += (window.CC_DATA[c] || []).length;
    lessons += (window.CC_LESSONS || []).filter((l) => l.cat === c).length;
    cards += CARD_LIST.filter((k) => k.cat === c).length;
  });
  return { cmds, lessons, cards };
};
const ALL_CATS = Object.keys(window.CC_CATS);
const TOTAL_STAT = statOf(ALL_CATS);

/* 穷举所有分类子集的 (条数, 课数) 与 (条数, 课数, 卡数)，做成真值集合 */
const pairSet = new Set(), tripleSet = new Set();
const n = ALL_CATS.length;
for (let mask = 1; mask < (1 << n); mask++) {
  const ids = [];
  for (let i = 0; i < n; i++) if (mask & (1 << i)) ids.push(ALL_CATS[i]);
  if (ids.length > 6) continue;   /* 组合太多且无意义，认证页不会引用 6 个以上分类 */
  const s = statOf(ids);
  pairSet.add(s.cmds + '/' + s.lessons);
  tripleSet.add(s.cmds + '/' + s.lessons + '/' + s.cards);
}

let checkedStats = 0;
const statProblems = [];
function checkStatText(text, where) {
  const t = String(text || '');
  /* 全站总量：必须带"真实统计"这类自指标记，避免误伤普通叙述 */
  let m;
  const reTotal = /(\d+)\s*条命令[、，]\s*(\d+)\s*节课[、，]\s*(\d+)\s*张卡片/g;
  while ((m = reTotal.exec(t))) {
    checkedStats++;
    const got = [Number(m[1]), Number(m[2]), Number(m[3])];
    const real = [TOTAL_STAT.cmds, TOTAL_STAT.lessons, TOTAL_STAT.cards];
    const asPair = got[0] + '/' + got[1];
    const asTriple = got.join('/');
    /* 要么等于全站真值，要么等于某个真实分类组合（认证页也会用这种句式描述一块） */
    if (asTriple !== real.join('/') && !tripleSet.has(asTriple)) {
      statProblems.push(where + ' 的统计「' + m[0] + '」与站内真值不符'
        + '（全站真值 ' + real.join(' / ') + '；该组合也不等于任何真实分类组合）');
    }
  }
  const rePair = /(\d+)\s*条命令[、，]\s*(\d+)\s*节课(?!\s*[、，]\s*\d+\s*张卡片)/g;
  while ((m = rePair.exec(t))) {
    checkedStats++;
    const asPair = m[1] + '/' + m[2];
    if (asPair !== TOTAL_STAT.cmds + '/' + TOTAL_STAT.lessons && !pairSet.has(asPair)) {
      statProblems.push(where + ' 的统计「' + m[0] + '」与站内真值不符'
        + '（全站真值 ' + TOTAL_STAT.cmds + ' / ' + TOTAL_STAT.lessons + '；该组合也不等于任何真实分类组合）');
    }
  }
  /* "本站 18 个分类"这类分类数陈述 */
  const reCatNum = /(\d+)\s*个分类/g;
  while ((m = reCatNum.exec(t))) {
    checkedStats++;
    if (Number(m[1]) !== ALL_CATS.length) {
      statProblems.push(where + ' 写的「' + m[0] + '」与实际 ' + ALL_CATS.length + ' 个不符');
    }
  }
}
CERT.forEach((c, i) => {
  checkStatText(c.note, 'cert[' + i + '] ' + (c.id || '') + ' 的 note');
  (c.domains || []).forEach((d, k) => checkStatText(d.note, 'cert[' + i + '] 第 ' + (k + 1) + ' 个知识域的 note'));
});
/* 概念词典文件头的"N 条命令解决怎么敲" */
const conceptHead = fs.readFileSync(path.join(ROOT, 'data/concepts.js'), 'utf8').split('\n').slice(0, 6).join('\n');
const mh = conceptHead.match(/(\d+)\s*条命令/);
if (mh) {
  checkedStats++;
  if (Number(mh[1]) !== TOTAL_STAT.cmds) {
    statProblems.push('concepts.js 文件头写「' + mh[0] + '」，实际 ' + TOTAL_STAT.cmds + ' 条');
  }
}
const mcards = (() => {
  const f = fs.readFileSync(path.join(ROOT, 'data/cards.js'), 'utf8').split('\n').slice(0, 40).join('\n');
  const mm = f.match(/引擎目前\s*(\d+)\s*个命令/);
  return mm ? Number(mm[1]) : null;
})();
if (mcards !== null) {
  checkedStats++;
  if (mcards !== RUNNABLE_HEADS) {
    statProblems.push('cards.js 文件头写「引擎目前 ' + mcards + ' 个命令」，按站点口径（数据里出现过且能跑）实际 '
      + RUNNABLE_HEADS + ' 个（引擎 CMDS 表共 ' + IMPL.size + ' 个命令名）');
  }
}
statProblems.forEach((p) => problems.push(p));
stats.push({ name: '统计一致性', n: checkedStats, target: 0 });

/* ── 输出 ─────────────────────────────────────────────────────────────── */
console.log('='.repeat(74));
console.log('知识库校验（概念 / 报错 / 版本 / 认证对照）');
console.log('='.repeat(74));
stats.forEach((s) => {
  const pct = s.target ? Math.round((s.n / s.target) * 100) : 100;
  console.log('  ' + s.name.padEnd(12) + String(s.n).padStart(4) + ' 条（目标 ' + s.target + '，' + pct + '%）');
});
const total = stats.reduce((a, s) => a + s.n, 0);
if (total === 0) {
  console.log('\n（四份数据都是空的 —— 骨架已就位，内容待填）');
  process.exit(0);
}
if (problems.length) {
  console.log('\n问题 ' + problems.length + ' 处：');
  problems.slice(0, 40).forEach((p) => console.log('  ✗ ' + p));
  if (problems.length > 40) console.log('  … 还有 ' + (problems.length - 40) + ' 处');
} else {
  console.log('\n字段、长度、引用全部通过。');
}
process.exit(problems.length ? 1 : 0);
