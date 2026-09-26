#!/usr/bin/env node
/* 本地正式发布闸门：全量检查 + 指定 APK 的逐字节一致性 + 签名验证。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const arg = process.argv.find(x => x.startsWith('--apk='));
if (!arg) { console.error('用法：node tools/release-check.js --apk=CloudCmd-版本.apk'); process.exit(2); }
const apk = path.resolve(ROOT, arg.slice(6));
if (!fs.existsSync(apk)) { console.error('APK 不存在：' + apk); process.exit(2); }
const local = process.env.LOCALAPPDATA || '';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(local, 'Android', 'Sdk');
const jdk = process.env.JAVA_HOME || path.join(local, 'Android', 'jdk');
const java = path.join(jdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
const signer = path.join(sdk, 'build-tools', '34.0.0', 'lib', 'apksigner.jar');
if (!fs.existsSync(java) || !fs.existsSync(signer)) {
  console.error('找不到 JDK 或 Android apksigner。先运行 tools/android/setup-toolchain.ps1');
  process.exit(2);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, ['tools/check-all.js']);
run(process.execPath, ['tools/apk-check.js', '--apk=' + apk]);
run(java, ['-jar', signer, 'verify', '--verbose', '--print-certs', apk]);
console.log('发布静态闸门通过：内容一致、检查全绿、签名有效。真机安装与输入法验收见 docs/发布验收.md。');
