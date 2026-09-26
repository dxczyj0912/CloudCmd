#!/usr/bin/env node
/* 构建安全闸门：仓库不能携带 APK 私钥或固定签名密码。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const build = fs.readFileSync(path.join(ROOT, 'tools/build-apk.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, value) { if (value) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
check('APK 构建从环境变量读取签名凭证', /CLOUDCMD_KEYSTORE_PASS/.test(build) && /CLOUDCMD_KEY_PASS/.test(build));
check('APK 构建不再生成固定密码 keystore', !/storepass['\s,]+['"]cloudcmd['"]/.test(build) && !/pass:cloudcmd/.test(build));
check('仓库没有 cloudcmd.jks 私钥文件', !fs.existsSync(path.join(ROOT, 'android', 'keystore', 'cloudcmd.jks')));
check('构建脚本支持显式 --no-sign 调试构建', /--no-sign/.test(build));
console.log('安全构建检查：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
