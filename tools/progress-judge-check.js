#!/usr/bin/env node
/* 统一进度与课程判题契约回归。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const storage = { 'cloudcmd.practice.v1': JSON.stringify({ steps: { 'legacy#0': true }, lessons: { legacy: true } }) };
const events = [];
const context = {
  window: {
    localStorage: {
      getItem(k) { return storage[k] == null ? null : storage[k]; },
      setItem(k, v) { storage[k] = String(v); },
      removeItem(k) { delete storage[k]; }
    },
    addEventListener(name) { events.push(name); },
    dispatchEvent() {}
  },
  CustomEvent: function (name) { this.type = name; },
  console
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/store.js'), 'utf8'), context);
const store = context.window.CC_STORE;
const checks = [];
function ok(name, value) { checks.push({ name, value: !!value }); }
ok('旧实验台进度迁移到统一 steps', store.isStepDone('legacy#0'));
ok('旧实验台课程完成状态迁移', store.isLessonDone('legacy'));
ok('迁移后删除旧 key', storage['cloudcmd.practice.v1'] == null);
ok('统一状态写入 cloudcmd.v1', !!storage['cloudcmd.v1']);
store.addStepDone('new#1');
ok('统一状态可继续写入', store.isStepDone('new#1'));
store.addLessonEvidence('new');
ok('课程目标证据写入持久化状态', store.hasLessonEvidence('new') && JSON.parse(storage['cloudcmd.v1']).lessonEvidence.new === true);
store.clear();
ok('清空进度同时清空课程目标证据', !store.hasLessonEvidence('new') && !JSON.parse(storage['cloudcmd.v1']).lessonEvidence.new);
store.importJSON({ lessonEvidence: { imported: true } });
ok('导入进度恢复课程目标证据', store.hasLessonEvidence('imported'));
let rejectedBadJson = false;
try { store.importJSON('{"steps":[] }'); } catch (e) { rejectedBadJson = true; }
ok('导入拒绝错误的桶类型', rejectedBadJson);
let rejectedBadSrs = false;
try { store.importJSON({ srs: { card: { ease: 'fast' } } }); } catch (e) { rejectedBadSrs = true; }
ok('导入拒绝损坏的复习记录', rejectedBadSrs);

vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/lesson-judge.js'), 'utf8'), context);
const judge = context.window.CC_LESSON_JUDGE;
const step = { cmd: 'pwd', expect: /\/root/, state: { cwd: '/root' } };
ok('严格判题接受完全匹配', judge.check(step, 'pwd', { code: 0, out: ['/root'], err: [] }, { cwd: '/root' }).ok);
ok('严格判题拒绝前缀命令', !judge.check(step, 'pwd && echo extra', { code: 0, out: ['/root'], err: [] }, { cwd: '/root' }).ok);
ok('严格判题拒绝非零退出码', !judge.check(step, 'pwd', { code: 1, out: ['/root'], err: [] }, { cwd: '/root' }).ok);
ok('严格判题拒绝错误输出', !judge.check(step, 'pwd', { code: 0, out: ['/tmp'], err: [] }, { cwd: '/root' }).ok);
ok('严格判题校验状态断言', !judge.check(step, 'pwd', { code: 0, out: ['/root'], err: [] }, { cwd: '/var' }).ok);
context.window.CC_SHELL = { util: { findNode(root, path) { return root[path] || null; } } };
const fileStep = { cmd: 'touch /tmp/proof', state: { paths: [{ path: '/tmp/proof', type: 'file' }, { path: '/tmp/old', absent: true }] } };
ok('文件状态断言接受目标文件与旧路径消失', judge.check(fileStep, fileStep.cmd, { code: 0, out: [], err: [] }, { root: { '/tmp/proof': { type: 'file' } } }).ok);
ok('文件状态断言拒绝未保存的模拟副作用', !judge.check(fileStep, fileStep.cmd, { code: 0, out: [], err: [] }, { root: {} }).ok);
ok('文件状态断言拒绝旧路径仍存在', !judge.check(fileStep, fileStep.cmd, { code: 0, out: [], err: [] }, { root: { '/tmp/proof': { type: 'file' }, '/tmp/old': { type: 'file' } } }).ok);
const lesson = { expect: /target=ready/ };
ok('目标结果接受标准输出命中', judge.outcomeMatches(lesson, { code: 0, out: ['target=ready'], err: [] }));
ok('目标结果拒绝只有错误输出命中', !judge.outcomeMatches(lesson, { code: 0, out: [], err: ['target=ready'] }));
ok('目标结果拒绝非零退出码', !judge.outcomeMatches(lesson, { code: 1, out: ['target=ready'], err: [] }));
ok('目标结果拒绝无验收条件的课程', !judge.outcomeMatches({}, { code: 0, out: ['target=ready'], err: [] }));

const failed = checks.filter(x => !x.value);
checks.forEach(x => console.log((x.value ? '✓ ' : '✗ ') + x.name));
console.log('统一进度 / 严格判题：' + (checks.length - failed.length) + ' 通过 / ' + failed.length + ' 失败');
process.exit(failed.length ? 1 : 0);
