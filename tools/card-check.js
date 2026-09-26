#!/usr/bin/env node
/* ==========================================================================
   tools/card-check.js · 每日一练卡片校验
   --------------------------------------------------------------------------
   卡片和命令数据不一样：命令的"正确性"是字段齐全，卡片的"正确性"是
   **背面那条命令真的跑得通、而且真的能说明白问题**。所以这里除了结构校验，
   还会把每张卡的 run 字段丢进模拟引擎真跑一遍。

   校验项：
     1. 结构：id / cat / kind / level / front / answer / why 齐全
     2. id 全局唯一、kebab-case、card- 前缀
     3. cat 必须是 _registry.js 里存在的分类
     4. kind ∈ diagnose | distinguish | syntax
     5. run 里的命令必须能在模拟引擎里跑通（退出码 0）—— 这是卡片的价值所在
     6. cmdIds 引用的命令、lesson 引用的练习课必须真实存在
     7. 质量红线：front 里不该出现 answer 的命令名（否则成了认字，不是判断）
     8. 重复 front（不同 id 说同一件事）

   用法：
     node tools/card-check.js
     node tools/card-check.js --json
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const AS_JSON = process.argv.indexOf('--json') !== -1;

/* 模拟浏览器全局环境（与 shell-check.js 一致） */
global.window = { CC_CATS: {}, CC_DATA: {}, CC_CARDS: [], CC_LESSONS: [], CC_ROADMAP: [], CC_CHEAT: [] };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  documentElement: { setAttribute() {}, getAttribute() { return 'light'; } },
  addEventListener() {}, getElementById: () => null, querySelectorAll: () => []
};

const loadErrors = [];
fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.js')).sort()
  .forEach(f => { try { require(path.join(DATA_DIR, f)); } catch (e) { loadErrors.push(f + ': ' + e.message); } });

/* 引擎不在 data/ 下，单独加载（run 字段要靠它真跑） */
try {
  require(path.join(ROOT, 'assets/js/shell.js'));
  require('./_cmdlist').forEach(function (f) { require(path.join(ROOT, f)); });
} catch (e) { loadErrors.push('assets/js/shell.js: ' + e.message); }

const CARDS = global.window.CC_CARDS || [];
const CATS = global.window.CC_CATS_META ? global.window.CC_CATS_META.list : [];
const CAT_IDS = CATS.map(c => c.id);
const LESSONS = global.window.CC_LESSONS || [];

/* 命令索引：id → 命令对象 */
const CMDS = Object.create(null);
Object.keys(global.window.CC_DATA).forEach(cid => {
  (global.window.CC_DATA[cid] || []).forEach(c => { CMDS[c.id] = c; });
});
const LESSON_IDS = LESSONS.map(l => l.id);

const KINDS = ['diagnose', 'distinguish', 'syntax'];
const problems = [];
const warnings = [];
const seenIds = Object.create(null);
const seenFront = Object.create(null);

/* 引擎（有就用；没有就跳过 run 校验并说明原因） */
let shell = null;
try {
  if (global.window.CC_SHELL) shell = global.window.CC_SHELL.create();
} catch (e) { /* ignore */ }

const kindCount = { diagnose: 0, distinguish: 0, syntax: 0 };
const catCount = Object.create(null);
let runChecked = 0, runFailed = 0, noRun = 0;

CARDS.forEach((card, i) => {
  const where = '卡片[' + i + '] ' + (card && card.id ? card.id : '(无 id)');

  ['id', 'cat', 'kind', 'level', 'front', 'answer', 'why'].forEach(f => {
    if (card[f] === undefined || card[f] === null || card[f] === '') problems.push(where + ' 缺必填字段 ' + f);
  });
  if (!card.id) return;

  if (seenIds[card.id]) problems.push('卡片 id 重复：' + card.id);
  else seenIds[card.id] = true;

  if (!/^card-[a-z0-9-]+$/.test(card.id)) warnings.push(where + ' 的 id 不是 card- 前缀的 kebab-case');
  if (KINDS.indexOf(card.kind) === -1) problems.push(where + ' 的 kind 非法：' + card.kind);
  else kindCount[card.kind]++;
  if (!CAT_IDS.length || CAT_IDS.indexOf(card.cat) === -1) problems.push(where + ' 的 cat 不存在于注册表：' + card.cat);
  else catCount[card.cat] = (catCount[card.cat] || 0) + 1;
  if (card.level !== undefined && [1, 2, 3, 4].indexOf(card.level) === -1) {
    problems.push(where + ' 的 level 非法：' + card.level);
  }

  /* ---- 质量红线 1：front 里出现答案的命令名，就成了认字而不是判断 ----
     只对"答案确实是一条命令"的卡生效：辨析卡的 answer 可能是
     「单引号 = 原样，双引号 = 允许展开」这种结论，不该拿它去比对。 */
  if (card.front && card.answer && card.kind === 'diagnose') {
    const head = String(card.answer).trim().split(/\s+/)[0];
    if (/^[a-z][a-z0-9._-]*$/.test(head) && card.front.indexOf(head) !== -1) {
      warnings.push(where + ' 的 front 里出现了答案命令「' + head + '」，卡片会退化成认字');
    }
  }

  /* ---- 质量红线 2：重复 front ---- */
  if (card.front) {
    const key = String(card.front).replace(/\s+/g, '').slice(0, 24);
    if (seenFront[key]) warnings.push(where + ' 的 front 与 ' + seenFront[key] + ' 高度重复');
    else seenFront[key] = card.id;
  }

  /* ---- 引用完整性 ---- */
  (card.cmdIds || []).forEach(id => {
    if (!CMDS[id]) problems.push(where + ' 的 cmdIds 引用了不存在的命令：' + id);
  });
  if (card.lesson && LESSON_IDS.indexOf(card.lesson) === -1) {
    problems.push(where + ' 的 lesson 引用了不存在的练习课：' + card.lesson);
  }

  /* ---- run 必须真能跑通 ---- */
  if (!card.run) {
    noRun++;
  } else if (shell) {
    const r = shell.exec(card.run);
    runChecked++;
    if (r.code !== 0) {
      runFailed++;
      problems.push(where + ' 的 run 跑不通（退出码 ' + r.code + '）：' + card.run +
        '  → ' + ((r.err || []).join(' ') || '(无错误输出)').slice(0, 120));
    }
  }

  /* ---- why 不能是空话 ---- */
  if (card.why && String(card.why).length < 25) {
    warnings.push(where + ' 的 why 只有 ' + String(card.why).length + ' 字，判据写得太薄');
  }
  /* ---- contrast 才是卡片最值钱的部分 ---- */
  if (!card.contrast) warnings.push(where + ' 没写 contrast（反向排除），卡片价值会打折');
});

/* ---------- 输出 ---------- */
if (AS_JSON) {
  console.log(JSON.stringify({
    total: CARDS.length, kindCount, catCount,
    runChecked, runFailed, noRun, problems, warnings
  }, null, 2));
} else {
  console.log('\n' + '='.repeat(64));
  console.log('每日一练卡片校验');
  console.log('='.repeat(64));
  console.log('\n卡片总数：' + CARDS.length);
  console.log('  卡型分布：' +
    KINDS.map(k => k + ' ' + (kindCount[k] || 0)).join(' ｜ '));
  console.log('  分类覆盖：' + Object.keys(catCount).length + ' / ' + CAT_IDS.length +
    (Object.keys(catCount).length < CAT_IDS.length
      ? '（还缺：' + CAT_IDS.filter(c => !catCount[c]).join('、') + '）' : ' ✓'));
  console.log('  run 校验：' + runChecked + ' 条真跑通 / ' + runFailed + ' 条跑不通 ｜ ' + noRun + ' 张卡没写 run');
  if (!shell) console.log('  ⚠ 未加载到 CC_SHELL，run 校验已跳过');

  if (warnings.length) {
    console.log('\n--- 建议改进（不阻断）---');
    warnings.slice(0, 25).forEach(w => console.log('  ! ' + w));
    if (warnings.length > 25) console.log('  ...还有 ' + (warnings.length - 25) + ' 条');
  }
  if (problems.length) {
    console.log('\n--- 错误 ---');
    problems.forEach(p => console.log('  ✗ ' + p));
  }
  console.log('\n' + '='.repeat(64));
  console.log(problems.length
    ? '❌ ' + problems.length + ' 个错误（' + warnings.length + ' 条建议）'
    : '✅ 卡片校验通过（' + warnings.length + ' 条建议）');
}

process.exit(problems.length ? 1 : 0);
