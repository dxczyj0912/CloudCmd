#!/usr/bin/env node
/* ==========================================================================
   tools/build-apk.js · 把整个网站打成 Android APK
   --------------------------------------------------------------------------
   ★ 这个脚本**不用 Gradle**。整个项目从第一天起就是"零依赖零构建、
     双击 index.html 就能用"，APK 只是多一个分发形态，不该为此引入一套
     构建系统（Gradle 还要从 Maven 拉 AGP + AndroidX，几百 MB，且容易断）。

   所以这里直接用 SDK 自带的命令行工具串起来：

     aapt2 compile   编译 res/              → res.zip
     aapt2 link      链接资源 + manifest
                     + assets/www/          → base.apk（有资源、没代码）
     javac + d8      编译 Java → classes.dex
     自写的 zip.js   把 classes.dex 塞进 base.apk
                     （不用 `jar uf`：它会把 resources.arsc 重新压缩，
                       而 Android 11+ 要求它必须是未压缩的，否则装不上）
     zipalign        4 字节对齐
     apksigner       签名（自签名，边载安装用）

   前置：先跑一次 tools/android/setup-toolchain.ps1 装 JDK + SDK。

   用法：
     node tools/build-apk.js                 # 使用外部签名凭证构建
     node tools/build-apk.js --version-code 2 --version-name 1.1
     node tools/build-apk.js --no-sign       # 只产未签名包（调试构建流程用）

   签名凭证必须通过 CLOUDCMD_KEYSTORE、CLOUDCMD_KEY_ALIAS、
   CLOUDCMD_KEYSTORE_PASS、CLOUDCMD_KEY_PASS 环境变量提供；脚本不会生成
   或保存私钥。私钥应放在仓库外的密钥管理目录或 CI secret 中。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const zip = require('./android/zip.js');
const icons = require('./android/icons.js');

const ROOT = path.resolve(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');

/* ⚠️ 中间产物必须放在**纯 ASCII 路径**下。
   项目目录名是中文（E:\云计算-DS），而 aapt2 是 C++ 程序，在 Windows 上按
   系统 ANSI 代码页解析路径参数 —— 中文路径会让它直接报
   "failed to open directory: 系统找不到指定的文件"，且看不出是编码问题。
   所以：在系统的临时目录里构建，最后只把 APK 拷回项目根。 */
const NATIVE_OK = /^[\x20-\x7E]+$/.test(ROOT);
const BUILD = NATIVE_OK
  ? path.join(ROOT, 'build-apk')
  : path.join(require('os').tmpdir(), 'cloudcmd-apk-build');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => {
  const a = argv.find(x => x.startsWith(f + '='));
  return a ? a.slice(f.length + 1) : d;
};

const VERSION_CODE = parseInt(val('--version-code', '1'), 10);
const VERSION_NAME = val('--version-name', '1.0');
const NO_SIGN = has('--no-sign');
const SIGNING = {
  keystore: process.env.CLOUDCMD_KEYSTORE || '',
  alias: process.env.CLOUDCMD_KEY_ALIAS || '',
  storepass: process.env.CLOUDCMD_KEYSTORE_PASS || '',
  keypass: process.env.CLOUDCMD_KEY_PASS || ''
};
const MIN_SDK = 24;
const TARGET_SDK = 34;

/* ---------- 0. 找工具链 ---------- */
const LOCAL = process.env.LOCALAPPDATA || '';
const JAVA_HOME = process.env.JAVA_HOME || path.join(LOCAL, 'Android', 'jdk');
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(LOCAL, 'Android', 'Sdk');
const BT = path.join(SDK, 'build-tools', '34.0.0');
const ANDROID_JAR = path.join(SDK, 'platforms', `android-${TARGET_SDK}`, 'android.jar');

const TOOLS = {
  java: path.join(JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
  javac: path.join(JAVA_HOME, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac'),
  jar: path.join(JAVA_HOME, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar'),
  keytool: path.join(JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool'),
  aapt2: path.join(BT, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'),
  zipalign: path.join(BT, process.platform === 'win32' ? 'zipalign.exe' : 'zipalign'),
  aapt: path.join(BT, process.platform === 'win32' ? 'aapt.exe' : 'aapt'),
  /* ⚠️ 刻意不用 d8.bat / apksigner.bat：Node 20 起禁止直接 spawn .bat/.cmd
     （CVE-2024-27980 之后的限制），会报 `spawnSync d8.bat EINVAL`。
     直接调它们背后的 jar 更干净，也顺带避开 cmd.exe 的引号与代码页问题。 */
  d8Jar: path.join(BT, 'lib', 'd8.jar'),
  apksignerJar: path.join(BT, 'lib', 'apksigner.jar'),
};

function die(msg) {
  console.error('\n✗ ' + msg);
  process.exit(1);
}

const missing = Object.keys(TOOLS).filter(k => k !== 'aapt' && !fs.existsSync(TOOLS[k]));
if (!fs.existsSync(ANDROID_JAR)) missing.push(ANDROID_JAR);
if (missing.length) {
  die('缺少构建工具：\n  ' + missing.join('\n  ') +
    '\n\n先运行一次：\n  powershell -ExecutionPolicy Bypass -File tools/android/setup-toolchain.ps1');
}

/* 跑 SDK 里的 Java 工具（d8 / apksigner 的 jar） */
function javaTool(jar, mainClass, args) {
  const base = mainClass ? ['-cp', jar, mainClass] : ['-jar', jar];
  return run(TOOLS.java, base.concat(args));
}

function run(cmd, args, opts) {
  const r = execFileSync(cmd, args, Object.assign({
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  }, opts || {}));
  return r || '';
}
function step(n, total, label) { console.log(`[${n}/${total}] ${label}`); }
const TOTAL = 8;

/* ---------- 1. 准备构建目录 ---------- */
fs.rmSync(BUILD, { recursive: true, force: true });
for (const d of ['assets/www', 'res', 'compiled', 'gen', 'classes', 'dex', 'out']) {
  fs.mkdirSync(path.join(BUILD, d), { recursive: true });
}
step(1, TOTAL, '准备构建目录' + (NATIVE_OK ? '' : '（项目路径含非 ASCII 字符，改在 ' + BUILD + ' 里构建）'));

/* ---------- 2. 把网站拷进 assets/www ---------- */
function copyInto(src, destRel) {
  const dest = path.join(BUILD, 'assets', 'www', destRel);
  fs.cpSync(src, dest, { recursive: true });
}
['index.html', 'academy-lab.html'].forEach(f => copyInto(path.join(ROOT, f), f));
['assets', 'data'].forEach(d => copyInto(path.join(ROOT, d), d));
/* 参考截图不参与运行，不进包（省 200KB） */
fs.rmSync(path.join(BUILD, 'assets/www/assets/ref'), { recursive: true, force: true });

let assetBytes = 0, assetFiles = 0;
(function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    if (e.isDirectory()) walk(f);
    else { assetBytes += fs.statSync(f).size; assetFiles++; }
  }
})(path.join(BUILD, 'assets/www'));
step(2, TOTAL, `拷贝网站资源：${assetFiles} 个文件 / ${(assetBytes / 1048576).toFixed(1)} MB`);

/* ---------- 3. 资源 + 图标 ---------- */
fs.cpSync(path.join(ANDROID, 'res'), path.join(BUILD, 'res'), { recursive: true });
/* API 26 以下没有自适应图标，用代码生成 PNG 兜底（不往仓库里塞二进制） */
const pngCount = icons.generate(path.join(BUILD, 'res'));
step(3, TOTAL, `资源就绪（含生成的 ${pngCount} 个 PNG 图标）`);

/* ---------- 4. aapt2 compile + link ---------- */
try {
  run(TOOLS.aapt2, ['compile', '--dir', path.join(BUILD, 'res'), '-o', path.join(BUILD, 'compiled/res.zip')]);
} catch (e) {
  die('aapt2 compile 失败：\n' + (e.stderr || e.stdout || e.message));
}
const baseApk = path.join(BUILD, 'out/base.apk');
try {
  run(TOOLS.aapt2, [
    'link',
    '-o', baseApk,
    '-I', ANDROID_JAR,
    '--manifest', path.join(ANDROID, 'AndroidManifest.xml'),
    '-A', path.join(BUILD, 'assets'),
    '--java', path.join(BUILD, 'gen'),
    '--min-sdk-version', String(MIN_SDK),
    '--target-sdk-version', String(TARGET_SDK),
    '--version-code', String(VERSION_CODE),
    '--version-name', VERSION_NAME,
    '--no-version-vectors',
    path.join(BUILD, 'compiled/res.zip'),
  ]);
} catch (e) {
  die('aapt2 link 失败：\n' + (e.stderr || e.stdout || e.message));
}
step(4, TOTAL, 'aapt2 编译资源并链接出 base.apk');

/* ---------- 5. javac → d8 ---------- */
const javaSrc = path.join(ANDROID, 'java/com/cloudcmd/handbook/MainActivity.java');
try {
  run(TOOLS.javac, [
    '-source', '8', '-target', '8',
    '-bootclasspath', ANDROID_JAR,
    '-encoding', 'UTF-8',
    '-d', path.join(BUILD, 'classes'),
    '-sourcepath', path.join(ANDROID, 'java'),
    javaSrc,
    path.join(BUILD, 'gen/com/cloudcmd/handbook/R.java'),
  ]);
} catch (e) {
  die('javac 失败：\n' + (e.stderr || e.stdout || e.message));
}
const classJar = path.join(BUILD, 'classes.jar');
run(TOOLS.jar, ['cf', classJar, '-C', path.join(BUILD, 'classes'), '.']);
try {
  javaTool(TOOLS.d8Jar, 'com.android.tools.r8.D8', [
    '--min-api', String(MIN_SDK),
    '--lib', ANDROID_JAR,
    '--output', path.join(BUILD, 'dex'),
    classJar,
  ]);
} catch (e) {
  die('d8 失败：\n' + (e.stderr || e.stdout || e.message));
}
const dex = path.join(BUILD, 'dex/classes.dex');
if (!fs.existsSync(dex)) die('d8 没有产出 classes.dex');
step(5, TOTAL, `javac + d8 编出 classes.dex（${(fs.statSync(dex).size / 1024).toFixed(1)} KB）`);

/* ---------- 6. 把 dex 合进 APK ---------- */
/* 用自写的 zip 重打包，而不是 `jar uf`：后者会把 resources.arsc 重新压缩，
   而 Android 11+ 要求它是**未压缩**的，否则装不上。

   重打包时顺手修掉 aapt2 在 Windows 上的两个坑（都会被自检抓出来）：
     ① **asset 名字用了反斜杠**：aapt2 在 Windows 上按本机路径分隔符写 ZIP 条目名，
        产出 `assets/www\index.html`。APK 是 ZIP，名字里的分隔符必须是 `/`，
        否则 `file:///android_asset/www/index.html` 根本解析不到 —— 装上就是白屏。
     ② **压缩方式会被丢掉**：不显式传 store 的话，我的 writer 会把所有条目都 deflate，
       包括本该 STORED 的 resources.arsc。 */
const entries = zip.readZip(baseApk);
if (!entries.some(e => e.name === 'resources.arsc')) die('base.apk 里没有 resources.arsc，aapt2 行为异常');

const fixedBackslash = entries.filter(e => e.name.indexOf('\\') !== -1).length;
const normalized = entries.map(e => ({
  name: e.name.replace(/\\/g, '/'),
  data: e.data,
  store: e.method === 0,
  externalAttrs: e.externalAttrs,
}));

const merged = path.join(BUILD, 'out/merged.apk');
zip.writeZip(merged, normalized.concat([{
  name: 'classes.dex',
  data: fs.readFileSync(dex),
  store: false,
}]));
step(6, TOTAL, '合并 classes.dex' +
  (fixedBackslash ? `，并修正 ${fixedBackslash} 个反斜杠条目名` : '') +
  '（resources.arsc 保持未压缩）');

/* ---------- 7. zipalign ---------- */
const aligned = path.join(BUILD, 'out/aligned.apk');
try {
  /* -p：把 .so / resources.arsc 按页对齐（APK 的硬要求） */
  run(TOOLS.zipalign, ['-f', '-p', '4', merged, aligned]);
} catch (e) {
  die('zipalign 失败：\n' + (e.stderr || e.stdout || e.message));
}
step(7, TOTAL, 'zipalign 4 字节对齐');

/* ---------- 8. 签名 ---------- */
const finalName = `CloudCmd-${VERSION_NAME}.apk`;
const finalPath = path.join(ROOT, finalName);
if (NO_SIGN) {
  fs.copyFileSync(aligned, finalPath);
  step(8, TOTAL, '跳过签名（--no-sign）');
} else {
  const missingSigning = Object.keys(SIGNING).filter(k => !SIGNING[k]);
  if (missingSigning.length) die('缺少签名环境变量：' + missingSigning.map(k => ({
    keystore: 'CLOUDCMD_KEYSTORE', alias: 'CLOUDCMD_KEY_ALIAS',
    storepass: 'CLOUDCMD_KEYSTORE_PASS', keypass: 'CLOUDCMD_KEY_PASS'
  }[k])).join(', ') + '\n如只需验证构建流程，请显式使用 --no-sign。');
  if (!fs.existsSync(SIGNING.keystore)) die('签名 keystore 不存在：' + SIGNING.keystore);
  try {
    javaTool(TOOLS.apksignerJar, null, [
      'sign',
      '--ks', SIGNING.keystore, '--ks-key-alias', SIGNING.alias,
      '--ks-pass', 'pass:' + SIGNING.storepass, '--key-pass', 'pass:' + SIGNING.keypass,
      '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
      /* 关掉 v4：它会在 APK 旁边多生成一个 .idsig 文件，只对
         `adb install --incremental` 有用，边载分发用不上，留着是噪音 */
      '--v4-signing-enabled', 'false',
      '--out', finalPath, aligned,
    ]);
    javaTool(TOOLS.apksignerJar, null, ['verify', '--print-certs', finalPath]);
  } catch (e) {
    die('apksigner 失败：\n' + (e.stderr || e.stdout || e.message));
  }
  step(8, TOTAL, '签名并验证');
}

/* ---------- 汇总 ---------- */
const sizeMB = (fs.statSync(finalPath).size / 1048576).toFixed(2);
console.log('\n' + '='.repeat(60));
console.log('  APK：' + finalPath);
console.log('  大小：' + sizeMB + ' MB ｜ versionCode ' + VERSION_CODE + ' ｜ versionName ' + VERSION_NAME);
console.log('  minSdk ' + MIN_SDK + ' ｜ targetSdk ' + TARGET_SDK + ' ｜ 包名 com.cloudcmd.handbook');
console.log('  权限：无');
console.log('='.repeat(60));

/* ---------- 自检 ----------
   注意：aapt 是 C++ 程序，在 Windows 上按 ANSI 代码页解析参数 —— 和 aapt2 一样，
   它**打不开中文路径**。所以先把成品复制到构建目录（纯 ASCII）再验，
   否则会看到 "Illegal byte sequence" 这种与包本身无关的报错。 */
const verifyApk = path.join(BUILD, 'out/verify.apk');
fs.copyFileSync(finalPath, verifyApk);

console.log('\n包内容自检：');
const finalEntries = zip.readZip(verifyApk);
const names = finalEntries.map(e => e.name);
const need = [
  'AndroidManifest.xml', 'classes.dex', 'resources.arsc',
  'assets/www/index.html', 'assets/www/academy-lab.html',
  'assets/www/assets/js/shell.js',
  'assets/www/assets/js/cmd-k8s.js', 'assets/www/assets/js/cmd-virt.js',
  'assets/www/assets/js/cmd-iac.js', 'assets/www/assets/js/cmd-sec.js',
  'assets/www/assets/js/cmd-db.js', 'assets/www/assets/js/cmd-ops.js',
  'assets/www/assets/js/drill.js',
  'assets/www/data/cards.js',
];
let ok = true;
for (const n of need) {
  const e = finalEntries.find(x => x.name === n);
  if (!e) { ok = false; console.log('  [MISS] ' + n); }
  else console.log('  [OK  ] ' + n + '  (' + (e.data.length / 1024).toFixed(1) + ' KB, ' +
    (e.method === 0 ? 'stored' : 'deflated') + ')');
}
const arscEntry = finalEntries.find(e => e.name === 'resources.arsc');
const arscStored = arscEntry && arscEntry.method === 0;
if (!arscStored) { ok = false; console.log('  [BAD ] resources.arsc 被压缩了 —— Android 11+ 会装不上'); }
else console.log('  [OK  ] resources.arsc 未压缩（Android 11+ 的硬要求）');

/* APK 是 ZIP，条目名必须用正斜杠。aapt2 在 Windows 上会写成反斜杠，
   那样 file:///android_asset/... 解析不到，装上就是白屏。这条断言值千金。 */
const backslash = finalEntries.filter(e => e.name.indexOf('\\') !== -1);
if (backslash.length) {
  ok = false;
  console.log('  [BAD ] ' + backslash.length + ' 个条目名含反斜杠，例如 ' + backslash[0].name);
} else {
  console.log('  [OK  ] 条目名全部是正斜杠（AssetManager 才能按路径找到）');
}

const webFiles = names.filter(n => n.startsWith('assets/www/')).length;
console.log('  · 站内文件共 ' + webFiles + ' 个');
console.log('  · 包内条目共 ' + finalEntries.length + ' 个');

if (fs.existsSync(TOOLS.aapt)) {
  try {
    const badging = run(TOOLS.aapt, ['dump', 'badging', verifyApk]);
    const pick = /^(package|launchable-activity|sdkVersion|targetSdkVersion|application-label|uses-permission|application-icon-320)/m;
    console.log('\naapt dump badging（对 ASCII 副本执行）：');
    badging.split('\n').filter(l => pick.test(l)).forEach(l => console.log('  ' + l));
    if (/uses-permission/.test(badging)) { ok = false; console.log('  [BAD ] 竟然声明了权限'); }
    else console.log('  [OK  ] 未声明任何权限');
  } catch (e) {
    console.log('（aapt 自检失败：' + String(e.stderr || e.message).split('\n')[0] + '）');
  }
}

/* 签名验证（apksigner 是 Java 写的，中文路径没问题，但对副本更省事） */
if (!NO_SIGN) {
  try {
    const out = javaTool(TOOLS.apksignerJar, null, ['verify', '--verbose', verifyApk]);
    const line = out.split('\n').filter(l => /Verified using|Number of signers/.test(l)).join(' / ');
    console.log('\n签名：' + (line || '已通过 apksigner verify'));
  } catch (e) {
    ok = false;
    console.log('\n签名验证失败：' + (e.stderr || e.message));
  }
}

console.log('\n' + (ok ? '✅ APK 构建完成并通过自检' : '❌ 自检发现问题，见上面 [MISS]/[BAD]'));
process.exit(ok ? 0 : 1);
