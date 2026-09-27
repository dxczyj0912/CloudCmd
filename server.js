#!/usr/bin/env node
/* CloudCmd 部署服务：静态站点、进度同步 API、实时内容版本检查。 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.CLOUDCMD_DATA_DIR || path.join(ROOT, 'server-data'));
const SESSION_FILE = path.join(DATA_DIR, 'sync-sessions.json');
const CORS_ORIGIN = process.env.CLOUDCMD_CORS_ORIGIN || '*';
const MAX_BODY = 3 * 1024 * 1024;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const sessions = new Map();
const streams = new Map();
let versionCache = null;
let apkCache = null;

function fail(message, status) {
  const error = new Error(message);
  error.statusCode = status || 400;
  throw error;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Vary': 'Origin'
  });
  res.end(body);
}

function sendError(res, error) {
  sendJson(res, error.statusCode || 500, { error: error.message || '服务器错误' });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeBucket(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;
  Object.keys(source).forEach(function (key) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
    if (source[key] === true) target[key] = true;
  });
}

function validState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('state 必须是 JSON 对象');
  const encoded = JSON.stringify(value);
  if (encoded.length > 2 * 1024 * 1024) fail('进度数据超过 2 MB');
  ['mastered', 'favorites', 'stages', 'lessons', 'lessonEvidence', 'steps'].forEach(function (bucket) {
    if (value[bucket] != null && (typeof value[bucket] !== 'object' || Array.isArray(value[bucket]))) {
      fail(bucket + ' 格式不正确');
    }
  });
  if (value.srs != null && (typeof value.srs !== 'object' || Array.isArray(value.srs))) fail('srs 格式不正确');
  if (value.drill != null && (typeof value.drill !== 'object' || Array.isArray(value.drill))) fail('drill 格式不正确');
  return value;
}

/* 进度是可合并集合；并发设备提交时保留双方已经完成的项目。 */
function mergeState(current, incoming) {
  const result = clone(current || {});
  ['mastered', 'favorites', 'stages', 'lessons', 'lessonEvidence', 'steps'].forEach(function (bucket) {
    result[bucket] = result[bucket] || {};
    mergeBucket(result[bucket], incoming[bucket]);
  });
  result.srs = result.srs || {};
  if (incoming.srs && typeof incoming.srs === 'object') {
    Object.keys(incoming.srs).forEach(function (id) {
      const next = incoming.srs[id];
      const prev = result.srs[id];
      if (!prev || Number(next && next.last || 0) >= Number(prev.last || 0)) result.srs[id] = clone(next);
    });
  }
  if (incoming.drill && typeof incoming.drill === 'object') {
    result.drill = result.drill || {};
    Object.keys(incoming.drill).forEach(function (key) {
      const next = Number(incoming.drill[key]);
      const prev = Number(result.drill[key]);
      if (Number.isFinite(next) && (!Number.isFinite(prev) || next > prev)) result.drill[key] = next;
    });
  }
  if (incoming.theme === 'light' || incoming.theme === 'dark' || incoming.theme === 'auto') result.theme = incoming.theme;
  return result;
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const value = {};
  sessions.forEach(function (session, code) { value[code] = session; });
  fs.writeFileSync(SESSION_FILE + '.tmp', JSON.stringify(value, null, 2) + '\n', 'utf8');
  try { fs.rmSync(SESSION_FILE, { force: true }); } catch (ignore) { /* Windows 下目标可能尚未存在 */ }
  fs.renameSync(SESSION_FILE + '.tmp', SESSION_FILE);
}

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    Object.keys(saved).forEach(function (code) {
      if (!/^[A-Z2-9]{10,20}$/.test(code) || !saved[code]) return;
      sessions.set(code, saved[code]);
    });
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[CloudCmd] 同步数据读取失败，将从空库启动：' + error.message);
  }
}

function newCode() {
  let code = '';
  do {
    const bytes = crypto.randomBytes(12);
    for (let i = 0; i < 12; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  } while (sessions.has(code));
  return code;
}

function getSession(code) {
  if (!/^[A-Z2-9]{10,20}$/.test(code)) fail('同步码格式不正确', 400);
  const session = sessions.get(code);
  if (!session) fail('同步码不存在或已失效', 404);
  return session;
}

function broadcast(code, session) {
  const list = streams.get(code) || [];
  const packet = 'event: progress\ndata: ' + JSON.stringify({ revision: session.revision, updatedAt: session.updatedAt }) + '\n\n';
  list.slice().forEach(function (res) {
    try { res.write(packet); } catch (error) { /* 断开的客户端由 close 事件清理 */ }
  });
}

function bodyJson(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('请求体超过 3 MB'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (error) { reject(Object.assign(new Error('请求体不是有效 JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function walkVersion(dir, files) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walkVersion(file, files);
    else {
      const stat = fs.statSync(file);
      files.push(String(stat.mtimeMs) + ':' + path.relative(ROOT, file));
    }
  });
}

function contentVersion() {
  const now = Date.now();
  if (versionCache && now - versionCache.at < 2000) return versionCache.value;
  const files = [];
  ['index.html', 'academy-lab.html', 'assets', 'data'].forEach(function (item) {
    const file = path.join(ROOT, item);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) walkVersion(file, files);
    else if (fs.existsSync(file)) files.push(String(fs.statSync(file).mtimeMs) + ':' + item);
  });
  files.sort();
  const hash = crypto.createHash('sha1').update(files.join('|')).digest('hex').slice(0, 12);
  versionCache = { at: now, value: hash };
  return hash;
}

function compareVersionNames(left, right) {
  const a = String(left || '').split('.').map(function (part) { return Number(part) || 0; });
  const b = String(right || '').split('.').map(function (part) { return Number(part) || 0; });
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
}

/* APK 可以随部署目录一起发布，也可以放在对象存储/CDN，通过 URL 提供下载。 */
function appVersion() {
  const externalUrl = String(process.env.CLOUDCMD_APK_URL || '').trim();
  const configured = String(process.env.CLOUDCMD_APK_FILE || '').trim();
  let file = null;
  let relative = '';
  let release = null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apk', 'release.json'), 'utf8'));
    if (/^CloudCmd-[0-9]+(?:\.[0-9]+){1,3}\.apk$/.test(manifest.file) &&
        manifest.versionName === manifest.file.slice(9, -4) &&
        Number.isSafeInteger(manifest.versionCode) && manifest.versionCode > 0 &&
        fs.existsSync(path.join(ROOT, 'apk', manifest.file))) {
      release = manifest;
    }
  } catch (error) { /* 尚未发布 APK 时使用目录扫描 */ }
  if (configured) {
    const candidate = path.resolve(ROOT, configured);
    const candidateRelative = path.relative(ROOT, candidate);
    if (!candidateRelative || candidateRelative.startsWith('..') || path.isAbsolute(candidateRelative)) {
      fail('CLOUDCMD_APK_FILE 必须位于部署目录内', 500);
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      file = candidate;
      relative = candidateRelative;
    }
  } else if (release) {
    relative = path.join('apk', release.file);
    file = path.join(ROOT, relative);
  } else if (fs.existsSync(ROOT)) {
    const candidates = fs.readdirSync(ROOT).filter(function (name) { return /^CloudCmd-.+\.apk$/i.test(name); });
    const apkDir = path.join(ROOT, 'apk');
    if (fs.existsSync(apkDir)) fs.readdirSync(apkDir).filter(function (name) { return /^CloudCmd-.+\.apk$/i.test(name); })
      .forEach(function (name) { candidates.push(path.join('apk', name)); });
    candidates.sort(function (left, right) {
      return compareVersionNames(path.basename(right).replace(/^CloudCmd-|\.apk$/gi, ''), path.basename(left).replace(/^CloudCmd-|\.apk$/gi, ''));
    });
    if (candidates.length) {
      relative = candidates[0];
      file = path.join(ROOT, relative);
    }
  }
  const versionMatch = path.basename(relative).match(/^CloudCmd-(.+)\.apk$/i);
  const versionName = String(process.env.CLOUDCMD_APP_VERSION || (versionMatch && versionMatch[1]) || '').trim();
  const manifestCode = release && relative === path.join('apk', release.file) ? release.versionCode : 0;
  const versionCode = Number(process.env.CLOUDCMD_APP_VERSION_CODE || manifestCode || 0) || 0;
  const signature = file ? String(fs.statSync(file).mtimeMs) + ':' + String(fs.statSync(file).size) + ':' + versionName + ':' + versionCode : externalUrl + ':' + versionName + ':' + versionCode;
  if (apkCache && apkCache.signature === signature) return apkCache.value;
  const value = {
    available: !!(externalUrl || file),
    versionName: versionName,
    versionCode: versionCode,
    apkUrl: externalUrl || (file ? '/' + relative.split(path.sep).map(encodeURIComponent).join('/') : ''),
    size: file ? fs.statSync(file).size : 0,
    generatedAt: new Date().toISOString()
  };
  apkCache = { signature: signature, value: value };
  return value;
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
    '.apk': 'application/vnd.android.package-archive'
  })[ext] || 'application/octet-stream';
}

function appVersionForRequest(req) {
  const value = appVersion();
  if (!value.apkUrl || !value.apkUrl.startsWith('/')) return value;
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const scheme = req.socket.encrypted || forwarded === 'https' ? 'https' : 'http';
  const host = req.headers.host || 'localhost';
  return Object.assign({}, value, { apkUrl: new URL(value.apkUrl, scheme + '://' + host).href });
}

function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (error) { return sendJson(res, 400, { error: '路径编码不正确' }); }
  if (decoded === '/') decoded = '/index.html';
  const publicFile = decoded === '/index.html' || decoded === '/academy-lab.html' ||
    decoded.startsWith('/assets/') || decoded.startsWith('/data/') ||
    /^\/(?:apk\/)?CloudCmd-[0-9A-Za-z.-]+\.apk$/i.test(decoded);
  if (!publicFile || decoded.split('/').some(function (part) { return part.startsWith('.'); })) {
    return sendJson(res, 404, { error: '找不到资源' });
  }
  const file = path.resolve(ROOT, '.' + decoded);
  const relative = path.relative(ROOT, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative === 'server-data' || relative.startsWith('server-data' + path.sep)) {
    return sendJson(res, 404, { error: '找不到资源' });
  }
  fs.stat(file, function (error, stat) {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: '找不到资源' });
    /* 内容文件可能在部署目录中被替换；版本提示出现后刷新必须拿到新 JS/CSS/数据。
       图片等不可变资源继续长缓存，减少重复传输。 */
    const longCache = /\.(?:png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$/i.test(file);
    const headers = {
      'Content-Type': contentType(file),
      'Cache-Control': longCache ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    if (/\.apk$/i.test(file)) headers['Content-Disposition'] = 'attachment; filename="' + path.basename(file).replace(/[^\x20-\x7E]/g, '_') + '"';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': CORS_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }); res.end(); return; }
  if (url.pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'cloudcmd', now: new Date().toISOString() });
  if (url.pathname === '/api/version' && req.method === 'GET') return sendJson(res, 200, { version: contentVersion(), generatedAt: new Date().toISOString() });
  if (url.pathname === '/api/app-version' && req.method === 'GET') return sendJson(res, 200, appVersionForRequest(req));

  const match = url.pathname.match(/^\/api\/sync\/sessions\/([^/]+)(\/events)?$/);
  if (!match) return sendJson(res, 404, { error: '找不到 API' });
  const code = decodeURIComponent(match[1]).toUpperCase();
  if (match[2] === '/events' && req.method === 'GET') {
    const session = getSession(code);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.write('event: ready\ndata: ' + JSON.stringify({ revision: session.revision }) + '\n\n');
    const list = streams.get(code) || [];
    list.push(res); streams.set(code, list);
    const timer = setInterval(function () { try { res.write(': ping\n\n'); } catch (error) { clearInterval(timer); } }, 25000);
    req.on('close', function () { clearInterval(timer); const current = streams.get(code) || []; streams.set(code, current.filter(function (item) { return item !== res; })); });
    return;
  }
  if (req.method === 'GET') {
    const session = getSession(code);
    return sendJson(res, 200, { code: code, revision: session.revision, updatedAt: session.updatedAt, state: session.state });
  }
  if (req.method !== 'PUT') return sendJson(res, 405, { error: '只支持 GET、PUT' });
  const session = getSession(code);
  const body = await bodyJson(req);
  validState(body.state);
  const merged = mergeState(session.state, body.state);
  session.state = merged;
  session.revision += 1;
  session.updatedAt = new Date().toISOString();
  persist();
  broadcast(code, session);
  return sendJson(res, 200, { code: code, revision: session.revision, updatedAt: session.updatedAt, state: session.state });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/sync/sessions' && req.method === 'POST') {
      const body = await bodyJson(req);
      const state = validState(body.state || {});
      const code = newCode();
      const session = { code: code, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), state: state };
      sessions.set(code, session); persist();
      return sendJson(res, 201, { code: code, revision: session.revision, updatedAt: session.updatedAt, state: session.state });
    }
    return handleApi(req, res, url);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: '只支持 GET' });
  return serveStatic(req, res, url.pathname);
}

load();
const server = http.createServer(function (req, res) {
  handle(req, res).catch(function (error) { console.error('[CloudCmd] 请求失败：', error); if (!res.headersSent) sendError(res, error); else res.destroy(); });
});
server.listen(PORT, HOST, function () { console.log('CloudCmd 已启动：http://127.0.0.1:' + PORT); console.log('同步数据：' + SESSION_FILE); });
