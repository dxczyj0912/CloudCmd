// tools/check-all.js · 一把跑完所有检查
/* --------------------------------------------------------------------------
   站点的验证器有十来个，逐个记、逐个跑很容易漏。这里是唯一入口：

     node tools/check-all.js            跑全部（失败即非零退出）
     node tools/check-all.js --quick    跳过需要起浏览器的（渲染/实验台/APK）
     node tools/check-all.js --list     只列出会跑哪些检查

   约定：每个检查脚本自己负责打印细节，并且**失败时非零退出**。
   这里只汇总"通过 / 失败"和耗时。
   ========================================================================== */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const QUICK = ARGV.indexOf('--quick') !== -1;

/* need: 'node' 纯 Node；'browser' 需要无头 Chrome */
const CHECKS = [
  { name: '语法体检', file: 'syntax-check.js', need: 'node', desc: '所有 JS 文件的语法（错了会直接白屏，必须最先跑）' },
  { name: '数据契约校验', file: 'validate-data.js', need: 'node', desc: '字段、id 唯一、占位符、路线图与速查引用' },
  { name: '数据文件编号', file: 'insert-record.js', args: ['--check'], need: 'node', desc: '每条记录的序号注释与分组条数是否自洽' },
  { name: '连贯性骨架', file: 'wire-continuity.js', args: ['--check'], need: 'node', desc: '课程步骤 ↔ 命令条目的回指是否齐全、有无断链' },
  { name: '故障剧本接线', file: 'wire-cheat.js', args: ['--check'], need: 'node', desc: '故障速查的排查链路 ↔ 命令条目（连贯性的最后一环）' },
  { name: '渐进式提示', file: 'hint-check.js', need: 'node', desc: '每步两级提示，骨架必须是命令的严格变形' },
  { name: '步骤 about 泄露', file: 'about-leak-check.js', need: 'node', desc: '讲义里 about 不许把命令写出来（练习模式会被架空）' },
  { name: '终端行为', file: 'shell-check.js', need: 'node', desc: '引擎命令行为与课程答案' },
  { name: 'Shell 回归', file: 'regression-shell-fixes.js', need: 'node', desc: '重定向、引用 glob、软链接边界回归' },
  { name: '示例可执行性', file: 'example-check.js', need: 'node', desc: '3000+ 条示例逐条真跑' },
  { name: '卡片', file: 'card-check.js', need: 'node', desc: '卡片结构、引用、以及每张卡的 run 能否跑通' },
  { name: '知识库', file: 'kb-check.js', need: 'node', desc: '概念词典 / 报错速查 / 版本差异 / 认证对照' },
  { name: '版本来源台账', file: 'content-review-check.js', need: 'node', desc: '版本差异一手来源或待复核期限' },
  { name: '连贯性体检', file: 'continuity-check.js', need: 'node', desc: '教/练覆盖、孤儿条目、卡片可追溯性' },
  { name: '覆盖率报告', file: 'coverage-report.js', need: 'node', desc: '生成可审计的命令/课程/卡片覆盖率 JSON' },
  { name: '进度与判题契约', file: 'progress-judge-check.js', need: 'node', desc: '统一进度迁移、严格命令/退出码/状态判定' },
  { name: '步骤级证据', file: 'lesson-assertion-check.js', need: 'node', desc: '逐课验证输出/文件状态断言，不把模拟说明当证据' },
  { name: '课程结果可达性', file: 'lesson-outcome-audit.js', need: 'node', desc: '逐步执行课程时必须能观察到目标结果' },
  { name: '安全构建', file: 'security-check.js', need: 'node', desc: '签名凭证外置且仓库不含私钥' },
  { name: '渲染与交互', file: 'render-check.js', need: 'browser', desc: '主站页面与交互（无头 Chrome）' },
  { name: '练习平台与移动端', file: 'lab-check.js', need: 'browser', desc: '实验台、手机竖屏/横屏' },
  { name: 'APK 一致性', file: 'apk-check.js', need: 'browser', desc: 'APK 里的 www 与源码逐字节一致 + 真机尺寸渲染' }
];

if (ARGV.indexOf('--list') !== -1) {
  console.log('检查项（' + CHECKS.length + ' 个）：');
  CHECKS.forEach((c) => console.log('  ' + (c.need === 'browser' ? '[浏览器]' : '[Node]  ') + c.file.padEnd(22) + c.desc));
  process.exit(0);
}

const results = [];
CHECKS.forEach((c) => {
  if (QUICK && c.need === 'browser') {
    results.push({ name: c.name, file: c.file, status: 'skip', ms: 0, tail: '（--quick 跳过）' });
    return;
  }
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', c.file)].concat(c.args || []), {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  const ms = Date.now() - started;
  const out = ((r.stdout || '') + (r.stderr || '')).trimEnd();
  /* 失败时只看末尾几行往往看不到关键结论（很多脚本把明细打在中间），
     所以失败时多留一些上下文。 */
  const tailLines = r.status === 0 ? 8 : 30;
  const tail = out.split('\n').slice(-tailLines).join('\n');
  results.push({ name: c.name, file: c.file, status: r.status === 0 ? 'ok' : 'fail', ms: ms, tail: tail, code: r.status });
});

console.log('='.repeat(80));
console.log('全量检查（' + (QUICK ? 'quick' : '完整') + '）');
console.log('='.repeat(80));
results.forEach((r) => {
  const mark = r.status === 'ok' ? '✅' : (r.status === 'skip' ? '⏭️ ' : '❌');
  console.log(mark + ' ' + r.name.padEnd(18) + r.file.padEnd(22) + String((r.ms / 1000).toFixed(1)).padStart(6) + 's   ' + r.status);
});

const failed = results.filter((r) => r.status === 'fail');
if (failed.length) {
  console.log('\n' + '─'.repeat(80));
  failed.forEach((r) => {
    console.log('\n【失败】' + r.name + '（' + r.file + '，退出码 ' + r.code + '）—— 输出末尾：');
    console.log(r.tail.split('\n').map((l) => '    ' + l).join('\n'));
  });
}
const okCount = results.filter((r) => r.status === 'ok').length;
console.log('\n' + '='.repeat(80));
console.log(okCount + ' 通过 / ' + failed.length + ' 失败 / ' + results.filter((r) => r.status === 'skip').length + ' 跳过');
process.exit(failed.length ? 1 : 0);
