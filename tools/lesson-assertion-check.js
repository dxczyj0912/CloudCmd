#!/usr/bin/env node
/* 所有新增步骤断言必须在逐课执行时成立，且不能靠模拟器免责声明获得成功。 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = { CC_CATS: {}, CC_DATA: {}, CC_CARDS: [], CC_LESSONS: [] };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };
function load(f) { require(path.join(ROOT, f)); }
['data/_registry.js', 'data/termfs.js', 'assets/js/shell.js', 'assets/js/lesson-judge.js'].forEach(load);
require('./_lessonlist').forEach(load);
require('./_cmdlist').forEach(load);
let checked = 0;
const errors = [];
const mock = /教学环境|教学提示|模拟环境|模拟成功|不会真的|只展示归档清单示例|真机上这些改动/;
window.CC_LESSONS.forEach(l => {
  const shell = window.CC_SHELL.create();
  l.steps.forEach((s, i) => {
    const result = shell.exec(s.cmd);
    if (s.expect == null && s.state == null) return;
    checked++;
    const outcome = window.CC_LESSON_JUDGE.check(s, s.cmd, result, shell);
    if (!outcome.ok) errors.push(l.id + '#' + (i + 1) + ' ' + outcome.reason);
    if ((window.CC_NEW_LESSON_ASSERTIONS || []).includes(l.id + '#' + (i + 1)) && mock.test((result.out || []).concat(result.err || []).join('\n'))) errors.push(l.id + '#' + (i + 1) + ' 命中了模拟器免责声明');
  });
});
if (checked < window.CC_LESSON_ASSERTION_COUNT) errors.push('新增断言计数异常');
console.log('逐课验证 ' + checked + ' 个步骤级断言（新增 ' + window.CC_LESSON_ASSERTION_COUNT + '）');
errors.forEach(e => console.error('✗ ' + e));
process.exit(errors.length ? 1 : 0);
