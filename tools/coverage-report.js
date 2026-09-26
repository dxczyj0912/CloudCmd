#!/usr/bin/env node
/* 生成可提交、可比较的学习内容覆盖率报告。 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'continuity-check.js'), '--json'], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
});
const lines = String(r.stdout || '').trim().split(/\r?\n/);
let report = null;
for (let i = lines.length - 1; i >= 0; i--) {
  try { report = JSON.parse(lines[i]); break; } catch (e) { /* human report line */ }
}
if (!report) { console.error(r.stdout || r.stderr || '覆盖率报告生成失败'); process.exit(1); }
report.generatedAt = new Date().toISOString();
const out = path.join(ROOT, 'docs', 'coverage-report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('覆盖率报告：' + out);
console.log('命令 ' + report.commands + '，课程 ' + report.lessons + '，步骤 ' + report.steps + '，卡片 ' + report.cards + '，孤儿命令 ' + report.orphan);
process.exit(r.status && r.status !== 0 ? r.status : 0);
