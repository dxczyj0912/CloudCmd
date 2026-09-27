#!/usr/bin/env node
/* 校验真实环境验收证据清单；只读文件，不执行清单里的命令。 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const arg = process.argv.find(x => x.indexOf('--manifest=') === 0);
if (!arg) {
  console.error('用法：node tools/real-lab-check.js --manifest=docs/真实环境验收模板.json');
  process.exit(2);
}

const manifestPath = path.resolve(ROOT, arg.slice('--manifest='.length));
if (!fs.existsSync(manifestPath)) {
  console.error('验收清单不存在：' + manifestPath);
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error('验收清单不是有效 JSON：' + err.message);
  process.exit(1);
}

const errors = [];
const required = (obj, fields, label) => fields.forEach(field => {
  if (!obj || typeof obj[field] !== 'string' || !obj[field].trim()) errors.push(label + ' 缺少 ' + field);
});
const isIso = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));
const underRoot = file => {
  if (typeof file !== 'string' || !file.trim() || path.isAbsolute(file)) return false;
  const target = path.resolve(ROOT, file);
  const relative = path.relative(ROOT, target);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

required(manifest, ['project', 'version'], '清单');
const environment = manifest && manifest.environment;
required(environment, ['name', 'kind', 'operator', 'checkedAt', 'rollbackPlan'], 'environment');
if (environment && !isIso(environment.checkedAt)) errors.push('environment.checkedAt 必须是 UTC ISO 8601 时间');
if (!manifest || !Array.isArray(manifest.evidence) || manifest.evidence.length === 0) {
  errors.push('evidence 必须是非空数组');
}

const ids = new Set();
(manifest.evidence || []).forEach((item, index) => {
  const label = 'evidence[' + index + ']';
  required(item, ['id', 'area', 'command', 'result', 'checkedAt', 'status'], label);
  if (item && item.id) {
    if (ids.has(item.id)) errors.push(label + '.id 重复：' + item.id);
    ids.add(item.id);
  }
  if (item && !isIso(item.checkedAt)) errors.push(label + '.checkedAt 必须是 UTC ISO 8601 时间');
  if (item && item.status && !['passed', 'failed', 'blocked'].includes(item.status)) {
    errors.push(label + '.status 只能是 passed、failed 或 blocked');
  }
  if (item && item.artifact != null && !underRoot(item.artifact)) {
    errors.push(label + '.artifact 必须是仓库内的相对路径');
  }
});

const text = JSON.stringify(manifest);
const secretPatterns = [
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:access[_ -]?key|secret[_ -]?key|ak|sk|password|passwd|token)\s*[:=]\s*["']?[^\s,"'}]+/i
];
if (secretPatterns.some(pattern => pattern.test(text))) {
  errors.push('清单疑似包含 AK/SK、密码、token 或私钥内容；请改为脱敏占位符');
}

if (errors.length) {
  errors.forEach(error => console.error('✗ ' + error));
  process.exit(1);
}

console.log('真实环境验收清单通过：' + manifest.evidence.length + ' 条证据，未执行任何用户命令。');
