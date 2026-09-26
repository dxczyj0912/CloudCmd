// tools/continuity-check.js · 学习连贯性的体检报告
/* --------------------------------------------------------------------------
   「连贯性」不是感觉，是能被数出来的东西：

     路线图阶段 → 分类 → 命令条目 → 课程步骤 → 卡片 → 每日一练

   一个环节断了，学员就会在某个点上"不知道为什么在学这个"。这个工具把
   每一段连接数出来，并区分两类问题：

     硬约束（破坏就非零退出）—— 引用断链、课程不属于任何阶段、卡片没有关联命令
     软指标（只报告 + 给目标）—— 孤儿命令、没有被任何课程教过的卡片、提示覆盖率

   用法：
     node tools/continuity-check.js            完整报告
     node tools/continuity-check.js --brief    只看汇总
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRIEF = process.argv.indexOf('--brief') !== -1;
const JSON_MODE = process.argv.indexOf('--json') !== -1;

global.window = { CC_CATS: {}, CC_DATA: {}, CC_CARDS: [] };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };

const load = (f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
load('data/_registry.js');
const CATS = Object.keys(window.CC_CATS);
CATS.forEach((id) => load('data/' + id + '.js'));
['cards.js', 'cards-linux.js', 'cards-container.js', 'cards-data.js', 'cards-cloud.js', 'cards-gaps.js', 'cards-learning-chain.js', 'cards-practice-paths.js'].forEach((f) => load('data/' + f));
require('./_lessonlist').forEach((f) => load(f));
load('data/roadmap.js');
load('data/cheat.js');
load('data/termfs.js');
load('assets/js/store.js');
load('assets/js/shell.js');
require('./_cmdlist').forEach((f) => load(f));

const DATA = window.CC_DATA;
const CARDS = window.CC_CARDS;
const LESSONS = window.CC_LESSONS;
const ROADMAP = window.CC_ROADMAP;
const IMPL = new Set(window.CC_SHELL.commands);

const hard = [];
const soft = [];

/* ── 建立索引 ───────────────────────────────────────────────────────────── */
const byId = new Map();
const perCat = {};
CATS.forEach((cat) => {
  perCat[cat] = { total: 0, runnable: 0, taught: 0, quizzed: 0, orphan: 0, recipes: 0 };
  (DATA[cat] || []).forEach((rec) => {
    byId.set(rec.id, { rec: rec, cat: cat });
    perCat[cat].total++;
    if (rec.kind === 'recipe') perCat[cat].recipes++;
    if (IMPL.has(rec.name.trim().split(/\s+/)[0])) perCat[cat].runnable++;
  });
});

/* 课程教了哪些命令（步骤的 ref） */
const taughtIds = new Set();
const taughtByLesson = new Map();   /* 命令 id → 教它的课 */
const stepCount = {};
let stepsTotal = 0, stepsWithHint = 0, refBroken = 0;
LESSONS.forEach((l) => {
  stepCount[l.id] = 0;
  (l.steps || []).forEach((s) => {
    stepsTotal++;
    stepCount[l.id]++;
    if (Array.isArray(s.hint) && s.hint.length === 2) stepsWithHint++;
    if (!s.ref) { hard.push('课程 ' + l.id + ' 的步骤「' + s.title + '」缺 ref（无法回指命令手册）'); return; }
    if (!byId.has(s.ref)) { refBroken++; hard.push('课程 ' + l.id + ' 的 ref 断链: ' + s.ref); return; }
    taughtIds.add(s.ref);
    if (!taughtByLesson.has(s.ref)) taughtByLesson.set(s.ref, []);
    taughtByLesson.get(s.ref).push(l.id);
  });
});

/* 卡片练了哪些命令 */
const quizzedIds = new Set();
let cardsNoCmdIds = 0, cardsNoTaught = 0, cardsNoRunnable = 0;
CARDS.forEach((c) => {
  const ids = c.cmdIds || [];
  if (!ids.length) { cardsNoCmdIds++; hard.push('卡片 ' + c.id + ' 没有 cmdIds（无法回指命令手册与课程）'); return; }
  let anyKnown = false, anyTaught = false, anyRunnable = false;
  ids.forEach((id) => {
    if (byId.has(id)) { anyKnown = true; quizzedIds.add(id); }
    if (taughtIds.has(id)) anyTaught = true;
    const hit = byId.get(id);
    if (hit && IMPL.has(hit.rec.name.trim().split(/\s+/)[0])) anyRunnable = true;
  });
  if (!anyKnown) hard.push('卡片 ' + c.id + ' 的 cmdIds 全部断链: ' + ids.join(', '));
  if (!anyTaught) cardsNoTaught++;
  if (!anyRunnable) cardsNoRunnable++;
});

/* 分类是否在路线图里 */
const catStage = {};
ROADMAP.forEach((st) => (st.catIds || []).forEach((c) => { catStage[c] = st; }));
CATS.forEach((c) => { if (!catStage[c]) hard.push('分类 ' + c + ' 不属于任何路线图阶段'); });

/* 每个阶段的课程数 */
const stageStats = ROADMAP.map((st) => {
  const cats = st.catIds || [];
  let cmds = 0, runnable = 0, recipes = 0, cards = 0, lessons = 0, steps = 0, hinted = 0;
  cats.forEach((c) => {
    cmds += perCat[c] ? perCat[c].total : 0;
    runnable += perCat[c] ? perCat[c].runnable : 0;
    recipes += perCat[c] ? perCat[c].recipes : 0;
    cards += CARDS.filter((x) => x.cat === c).length;
  });
  LESSONS.filter((l) => cats.indexOf(l.cat) !== -1).forEach((l) => {
    lessons++;
    steps += (l.steps || []).length;
    hinted += (l.steps || []).filter((s) => Array.isArray(s.hint) && s.hint.length === 2).length;
  });
  return { st: st, cats: cats, cmds: cmds, runnable: runnable, recipes: recipes, cards: cards,
           lessons: lessons, steps: steps, hinted: hinted, prereq: st.prereq };
});

/* 分类级连贯性 */
CATS.forEach((cat) => {
  Object.keys(perCat[cat]).forEach(() => {});
  (DATA[cat] || []).forEach((rec) => {
    const t = taughtIds.has(rec.id), q = quizzedIds.has(rec.id);
    if (t) perCat[cat].taught++;
    if (q) perCat[cat].quizzed++;
    if (!t && !q) perCat[cat].orphan++;
  });
});

/* ── 软指标 ─────────────────────────────────────────────────────────────── */
let orphanTotal = 0, taughtTotal = 0, quizzedTotal = 0;
const orphanIds = [];
CATS.forEach((c) => { orphanTotal += perCat[c].orphan; taughtTotal += perCat[c].taught; quizzedTotal += perCat[c].quizzed; });
CATS.forEach((c) => {
  if (!LESSONS.some((l) => l.cat === c)) soft.push('分类 ' + c + '（' + (window.CC_CATS[c].name || '') + '）还没有任何课程');
});
byId.forEach((hit, id) => { if (!taughtIds.has(id) && !quizzedIds.has(id)) orphanIds.push({ id: id, cat: hit.cat, name: hit.rec.name }); });
ROADMAP.forEach((st) => {
  if (st.prereq && !ROADMAP.some((x) => x.id === st.prereq)) hard.push('阶段 ' + st.id + ' 的 prereq 断链: ' + st.prereq);
});

/* ── 输出 ───────────────────────────────────────────────────────────────── */
const L = [];
function line(s) { L.push(s); }

line('='.repeat(84));
line('学习连贯性体检');
line('='.repeat(84));
line('');
line('内容规模：命令条目 ' + byId.size + '（其中配方 ' + CATS.reduce((a, c) => a + perCat[c].recipes, 0) + '）'
  + ' | 课程 ' + LESSONS.length + ' 节 / ' + stepsTotal + ' 步'
  + ' | 卡片 ' + CARDS.length + ' 张'
  + ' | 引擎实现 ' + IMPL.size + ' 条命令');
line('');
line('── 一、路线图 → 分类 → 课程 ──');
line('阶段  课程  步数  提示  分类数  命令  可跑  配方  卡片  前置');
stageStats.forEach((s) => {
  line(String(s.st.no).padStart(3) + '  ' +
    String(s.lessons).padStart(4) + '  ' +
    String(s.steps).padStart(4) + '  ' +
    String(s.hinted).padStart(4) + '  ' +
    String(s.cats.length).padStart(6) + '  ' +
    String(s.cmds).padStart(4) + '  ' +
    String(s.runnable).padStart(4) + '  ' +
    String(s.recipes).padStart(4) + '  ' +
    String(s.cards).padStart(4) + '  ' +
    (s.prereq || '—'));
});
line('');
line('── 二、分类级「被教 / 被练」覆盖 ──');
line('分类                条目  可跑  配方  被课教  被卡练  孤儿');
CATS.forEach((c) => {
  const p = perCat[c];
  const name = (window.CC_CATS[c].name || c).slice(0, 10);
  line(c.padEnd(16) + String(p.total).padStart(5) + String(p.runnable).padStart(6) +
    String(p.recipes).padStart(6) + String(p.taught).padStart(8) + String(p.quizzed).padStart(8) +
    String(p.orphan).padStart(6) + '   ' + name);
});
line('');
line('合计：被课程教过 ' + taughtTotal + ' / ' + byId.size +
  '（' + Math.round(taughtTotal / byId.size * 100) + '%）' +
  ' | 被卡片练过 ' + quizzedTotal +
  ' | **孤儿（既没课教也没卡练） ' + orphanTotal + '**');
line('');
line('── 三、卡片的可追溯性（练过的必须能追到课） ──');
line('卡片总数 ' + CARDS.length +
  ' | 至少有一条命令被课程教过 ' + (CARDS.length - cardsNoTaught) + '（' + Math.round((CARDS.length - cardsNoTaught) / CARDS.length * 100) + '%）' +
  ' | 至少有一条命令能在终端跑 ' + (CARDS.length - cardsNoRunnable) + '（' + Math.round((CARDS.length - cardsNoRunnable) / CARDS.length * 100) + '%）' +
  ' | 缺 cmdIds ' + cardsNoCmdIds);
line('');
line('── 四、渐进式提示 ──');
line('步骤 ' + stepsTotal + ' 个，带两级提示 ' + stepsWithHint + ' 个（' + Math.round(stepsWithHint / stepsTotal * 100) + '%）');

/* ── 故障剧本（cheat.js）：连贯性的最后一环 ─────────────────────────────
   路线图 → 课程 → 命令 → 卡片 → 配方 → **故障剧本**。
   此前这一段完全没人管：链路里的命令只是纯文本，点不进手册，
   也没人验证过它们有没有条目、在模拟终端里跑不跑得起来。
   接上 cmdIds 之后（tools/wire-cheat.js），这里做**硬约束**校验。 */
line('');
line('── 四之二、故障剧本 → 命令条目 ──');
const CHEAT = window.CC_CHEAT || [];
let cheatLinked = 0, cheatLines = 0, cheatNoIds = 0, cheatNotImpl = 0;
const cheatSkip = ['#', 'if', 'for', 'while', 'case', 'echo', 'export', 'cd', 'set'];
CHEAT.forEach((e) => {
  if (!(e.cmdIds || []).length) cheatNoIds++;
  (e.cmdIds || []).forEach((id) => { if (!byId.has(id)) hard.push('故障剧本 ' + e.id + ' 的 cmdIds 指向不存在的条目: ' + id); });
  (e.chain || []).forEach((line2) => {
    const head = String(line2).trim().split(/\s+/)[0];
    if (!head || cheatSkip.indexOf(head) !== -1) return;
    cheatLines++;
    if (IMPL.has(head)) cheatLinked++; else cheatNotImpl++;
  });
});
line('剧本 ' + CHEAT.length + ' 个 ｜ 链上命令 ' + cheatLines + ' 条 ｜ 模拟终端可跑 ' + cheatLinked
  + '（' + Math.round(cheatLinked / cheatLines * 100) + '%）｜ 仅真机 ' + cheatNotImpl + ' 条');
if (cheatNoIds) hard.push('故障剧本缺 cmdIds 的有 ' + cheatNoIds + ' 个（重跑 node tools/wire-cheat.js）');
if (!CHEAT.length) hard.push('没有加载到 CC_CHEAT —— continuity-check 的 load 列表漏了 data/cheat.js');

if (!BRIEF) {
  const orphanByCat = CATS.map((c) => ({ c: c, n: perCat[c].orphan, name: (window.CC_CATS[c].name || '') }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  line('');
  line('── 五、孤儿命令最多的分类（这些条目只能靠搜索找到） ──');
  orphanByCat.slice(0, 12).forEach((x) => line('  ' + x.c.padEnd(16) + String(x.n).padStart(4) + '   ' + x.name));
}
line('');
line('='.repeat(84));
if (hard.length) {
  line('硬约束失败 ' + hard.length + ' 处：');
  hard.slice(0, 25).forEach((h) => line('  ✗ ' + h));
  if (hard.length > 25) line('  … 还有 ' + (hard.length - 25) + ' 处');
} else {
  line('硬约束全部通过：引用无断链、课程都归属阶段、卡片都有关联命令。');
}
if (soft.length) {
  line('');
  line('软指标提醒 ' + soft.length + ' 条（不阻断，但都是该补的内容）：');
  soft.slice(0, 15).forEach((s) => line('  · ' + s));
  if (soft.length > 15) line('  … 还有 ' + (soft.length - 15) + ' 条');
}
console.log(L.join('\n'));
if (JSON_MODE) {
  console.log(JSON.stringify({
    commands: byId.size,
    lessons: LESSONS.length,
    steps: stepsTotal,
    hints: stepsWithHint,
    cards: CARDS.length,
    taught: taughtTotal,
    quizzed: quizzedTotal,
    orphan: orphanTotal,
    orphanIds: orphanIds
  }));
}
process.exit(hard.length ? 1 : 0);
