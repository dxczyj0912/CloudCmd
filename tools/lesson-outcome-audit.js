#!/usr/bin/env node
/* 检查课程整课 expect 在逐步练习流程里何时能够观察到。 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = { CC_CATS: {}, CC_DATA: {}, CC_CARDS: [], CC_LESSONS: [] };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };
function load(f) { require(path.join(ROOT, f)); }
['data/_registry.js', 'data/termfs.js', 'assets/js/shell.js'].forEach(load);
load('assets/js/lesson-judge.js');
require('./_lessonlist').forEach(load);
require('./_cmdlist').forEach(load);
const all = window.CC_LESSONS || [];
const missing = [], final = [], earlier = [];
all.forEach(l => {
  const shell = window.CC_SHELL.create();
  const matched = [];
  (l.steps || []).forEach((step, i) => {
    const result = shell.exec(step.cmd);
    if (window.CC_LESSON_JUDGE.check(step, step.cmd, result, shell).ok &&
        window.CC_LESSON_JUDGE.outcomeMatches(l, result)) matched.push(i);
  });
  if (!matched.length) missing.push(l.id);
  else if (matched.includes(l.steps.length - 1)) final.push(l.id);
  else earlier.push({ id: l.id, indexes: matched });
});
console.log('课程 ' + all.length + '：逐步执行中命中整课 expect ' + (final.length + earlier.length) +
  '；最后一步命中 ' + final.length + '；只在前面步骤命中 ' + earlier.length + '；完全未命中 ' + missing.length);
if (missing.length) console.log('完全未命中：' + missing.join('、'));
if (earlier.length) console.log('只在前面命中：' + earlier.map(x => x.id + '(' + x.indexes.join(',') + ')').join('、'));
process.exit(missing.length ? 1 : 0);
