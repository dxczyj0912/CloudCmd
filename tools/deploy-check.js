#!/usr/bin/env node
/* Deployment contract: health, signed-APK metadata and public-file boundary. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

function freePort() {
  return new Promise(function (resolve, reject) {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', function () {
      const port = socket.address().port;
      socket.close(function () { resolve(port); });
    });
  });
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcmd-deploy-check-'));
  let child;
  try {
    fs.copyFileSync(path.join(__dirname, '..', 'server.js'), path.join(dir, 'server.js'));
    fs.writeFileSync(path.join(dir, 'index.html'), 'CloudCmd test');
    fs.writeFileSync(path.join(dir, '.env'), 'SHOULD_NOT_BE_PUBLIC=1');
    fs.mkdirSync(path.join(dir, 'apk'));
    fs.writeFileSync(path.join(dir, 'apk', 'CloudCmd-0.0.1.apk'), 'test APK');
    fs.writeFileSync(path.join(dir, 'apk', 'release.json'), JSON.stringify({
      versionName: '0.0.1', versionCode: 9, file: 'CloudCmd-0.0.1.apk'
    }));
    const port = await freePort();
    child = spawn(process.execPath, [path.join(dir, 'server.js')], {
      cwd: dir,
      env: Object.assign({}, process.env, {
        PORT: String(port), HOST: '127.0.0.1', CLOUDCMD_DATA_DIR: path.join(dir, 'private')
      }),
      stdio: 'ignore'
    });
    const base = 'http://127.0.0.1:' + port;
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        const response = await fetch(base + '/api/health');
        if (response.ok) { ready = true; break; }
      } catch (error) { /* wait for the child to listen */ }
      await new Promise(function (resolve) { setTimeout(resolve, 100); });
    }
    if (!ready) throw new Error('Server did not become healthy');

    const version = await (await fetch(base + '/api/app-version')).json();
    if (version.versionName !== '0.0.1' || version.versionCode !== 9 ||
        version.apkUrl !== base + '/apk/CloudCmd-0.0.1.apk') {
      throw new Error('APK update metadata is incorrect: ' + JSON.stringify(version));
    }
    const legacy = await (await fetch(base + '/api/app-version', {
      headers: { 'User-Agent': 'CloudCmdApp/1.3.4' }
    })).json();
    if (legacy.versionName !== '1.3.5' || legacy.actualVersionName !== '0.0.1' ||
        legacy.apkUrl !== version.apkUrl) {
      throw new Error('Legacy APK update bridge is incorrect: ' + JSON.stringify(legacy));
    }
    const modern = await (await fetch(base + '/api/app-version', {
      headers: { 'User-Agent': 'CloudCmdApp/0.0.1 CloudCmdCode/9' }
    })).json();
    if (modern.versionName !== '0.0.1' || modern.versionCode !== 9) {
      throw new Error('Modern APK update metadata is incorrect: ' + JSON.stringify(modern));
    }
    for (const [url, expected] of [
      ['/', 200], ['/apk/CloudCmd-0.0.1.apk', 200],
      ['/.env', 404], ['/server.js', 404], ['/apk/release.json', 404],
      ['/assets/../.env', 404]
    ]) {
      const response = await fetch(base + url);
      if (response.status !== expected) throw new Error(url + ': expected ' + expected + ', got ' + response.status);
    }
    console.log('Deployment server contract passed');
  } finally {
    if (child) {
      child.kill();
      await new Promise(function (resolve) {
        if (child.exitCode !== null) return resolve();
        const timer = setTimeout(resolve, 2000);
        child.once('exit', function () { clearTimeout(timer); resolve(); });
      });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(function (error) { console.error(error); process.exitCode = 1; });
