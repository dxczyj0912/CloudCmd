#!/usr/bin/env node
/* 版本结论的来源台账：缺一手链接的条目必须显式登记并有到期日。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = { CC_VERSIONS: [] };
require(path.join(ROOT, 'data/versions.js'));
const rows = global.window.CC_VERSIONS;
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/version-review.json'), 'utf8'));
const pending = new Set(ledger.pending);
const priority = new Set(ledger.priority);
const byId = new Map(rows.map(x => [x.id, x]));
const failures = [];
const today = new Date().toISOString().slice(0, 10);
function validDate(x) { return /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)); }
if (!validDate(ledger.pendingReviewDue) || !validDate(ledger.priorityReviewDue)) failures.push('复核到期日格式不正确');
for (const row of rows) {
  const hasSource = typeof row.docs === 'string' && /^https:\/\//.test(row.docs);
  if (!hasSource && !pending.has(row.id)) failures.push(row.id + ' 缺官方来源且未登记待复核');
  if (hasSource && pending.has(row.id)) failures.push(row.id + ' 已有来源链接，请移出待复核台账并核对原文');
}
for (const id of pending) {
  if (!byId.has(id)) failures.push('台账引用不存在的版本条目：' + id);
  const due = priority.has(id) ? ledger.priorityReviewDue : ledger.pendingReviewDue;
  if (validDate(due) && today > due) failures.push(id + ' 已过复核期限 ' + due);
}
for (const id of priority) if (!pending.has(id)) failures.push('高优先条目不在 pending 中：' + id);
console.log('版本来源：' + (rows.length - pending.size) + ' 条已有链接，' + pending.size + ' 条待一手来源复核（高优先 ' + priority.size + ' 条）');
for (const failure of failures) console.error('✗ ' + failure);
process.exit(failures.length ? 1 : 0);
