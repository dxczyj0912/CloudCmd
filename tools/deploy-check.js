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
    fs.mkdirSync(path.join(dir, 'assets', 'js'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '..', 'assets', 'js', 'sync-marks.js'), path.join(dir, 'assets', 'js', 'sync-marks.js'));
    fs.writeFileSync(path.join(dir, 'index.html'), 'CloudCmd test');
    fs.writeFileSync(path.join(dir, '.env'), 'SHOULD_NOT_BE_PUBLIC=1');
    fs.mkdirSync(path.join(dir, 'apk'));
    fs.writeFileSync(path.join(dir, 'apk', 'CloudCmd-0.0.2.apk'), 'test APK');
    fs.writeFileSync(path.join(dir, 'apk', 'release.json'), JSON.stringify({
      versionName: '0.0.2', versionCode: 10, file: 'CloudCmd-0.0.2.apk'
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
    if (version.versionName !== '0.0.2' || version.versionCode !== 10 ||
        version.apkUrl !== base + '/apk/CloudCmd-0.0.2.apk') {
      throw new Error('APK update metadata is incorrect: ' + JSON.stringify(version));
    }
    const legacy = await (await fetch(base + '/api/app-version', {
      headers: { 'User-Agent': 'CloudCmdApp/1.3.4' }
    })).json();
    if (legacy.versionName !== '1.3.5' || legacy.actualVersionName !== '0.0.2' ||
        legacy.apkUrl !== version.apkUrl) {
      throw new Error('Legacy APK update bridge is incorrect: ' + JSON.stringify(legacy));
    }
    const modern = await (await fetch(base + '/api/app-version', {
      headers: { 'User-Agent': 'CloudCmdApp/0.0.1 CloudCmdCode/9' }
    })).json();
    if (modern.versionName !== '0.0.2' || modern.versionCode !== 10) {
      throw new Error('Modern APK update metadata is incorrect: ' + JSON.stringify(modern));
    }
    const created = await (await fetch(base + '/api/sync/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: { favorites: { sample: true } } })
    })).json();
    const syncUrl = base + '/api/sync/sessions/' + created.code;
    async function update(state) {
      const response = await fetch(syncUrl, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state })
      });
      if (!response.ok) throw new Error('Sync PUT failed: ' + response.status);
      return (await response.json()).state;
    }
    const removed = await update({ favorites: {}, marks: { favorites: {
      sample: { on: false, at: 1, actor: 'new-device' }
    } } });
    if (removed.favorites.sample || removed.marks.favorites.sample.on !== false) {
      throw new Error('Canceling a synced favorite did not persist');
    }
    const stale = await update({ favorites: { sample: true } });
    if (stale.favorites.sample || stale.marks.favorites.sample.on !== false) {
      throw new Error('Legacy device resurrected a canceled favorite');
    }
    const addedAgain = await update({ favorites: { sample: true }, marks: { favorites: {
      sample: { on: true, at: 2, actor: 'other-device' }
    } } });
    if (!addedAgain.favorites.sample) throw new Error('Newer favorite change was lost');
    for (const [url, expected] of [
      ['/', 200], ['/apk/CloudCmd-0.0.2.apk', 200],
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
