/* CloudCmd 跨设备进度同步：同步码配对 + SSE 实时通知，失败时保留本地进度。 */
(function () {
  'use strict';
  var KEY = 'cloudcmd.sync.config';
  var config = { api: '', code: '' };
  var revision = 0;
  var stream = null;
  var pollTimer = null;
  var pushTimer = null;
  var pushing = false;
  var pushAgain = false;
  var applying = false;
  var listeners = [];
  var current = { level: 'idle', message: '未连接同步服务', connected: false, code: '', revision: 0 };

  function readConfig() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          config.api = typeof saved.api === 'string' ? saved.api : '';
          config.code = typeof saved.code === 'string' ? saved.code.toUpperCase() : '';
        }
      }
    } catch (ignore) { /* 私密模式下仍可手动连接 */ }
  }
  function saveConfig() {
    try { window.localStorage.setItem(KEY, JSON.stringify(config)); } catch (ignore) { /* 忽略 */ }
  }
  function normalizeApi(value) {
    var api = String(value || '').trim().replace(/\/+$/, '');
    if (/\/api$/i.test(api)) api = api.slice(0, -4);
    return api;
  }
  function defaultApi() {
    if (window.CC_SYNC_API) return normalizeApi(window.CC_SYNC_API);
    if (window.location && /^https?:$/.test(window.location.protocol)) return window.location.origin;
    return '';
  }
  function apiBase() { return normalizeApi(config.api) || defaultApi(); }
  function say(level, message, extra) {
    current = { level: level, message: message, connected: !!(extra && extra.connected), code: config.code || '', revision: revision };
    listeners.slice().forEach(function (fn) { try { fn(current); } catch (ignore) { /* 单个监听器不能阻断同步 */ } });
    if (window.dispatchEvent && typeof window.CustomEvent === 'function') window.dispatchEvent(new window.CustomEvent('cc:sync-status', { detail: current }));
  }
  function request(method, url, body, done) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    if (body != null) { xhr.setRequestHeader('Content-Type', 'application/json'); xhr.send(JSON.stringify(body)); }
    else xhr.send();
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var value = null;
      try { value = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch (ignore) { /* 下面给出统一错误 */ }
      if (xhr.status >= 200 && xhr.status < 300) done(null, value);
      else done(new Error(value && value.error ? value.error : '同步服务请求失败（HTTP ' + xhr.status + '）'), value);
    };
    xhr.onerror = function () { done(new Error('无法连接同步服务，请检查地址和网络')); };
    xhr.ontimeout = function () { done(new Error('同步服务响应超时')); };
    xhr.timeout = 12000;
  }
  function closeStream() {
    if (stream) { stream.close(); stream = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  function applyRemote(state) {
    if (!state || !window.CC_STORE) return;
    applying = true;
    try { window.CC_STORE.importJSON(state); } catch (error) { say('error', '远端进度无法合并：' + error.message, { connected: true }); }
    applying = false;
  }
  function pull(done) {
    if (!config.code || !apiBase()) { if (done) done(new Error('尚未配置同步地址或同步码')); return; }
    request('GET', apiBase() + '/api/sync/sessions/' + encodeURIComponent(config.code), null, function (error, value) {
      if (error) { say('error', error.message, { connected: false }); if (done) done(error); return; }
      revision = Math.max(revision, Number(value.revision || 0));
      applyRemote(value.state);
      say('ok', '已同步到第 ' + revision + ' 版', { connected: true });
      if (done) done(null, value);
    });
  }
  function push(done) {
    if (pushing) { pushAgain = true; if (done) done(null); return; }
    if (!config.code || !apiBase() || !window.CC_STORE) { if (done) done(null); return; }
    pushing = true;
    request('PUT', apiBase() + '/api/sync/sessions/' + encodeURIComponent(config.code), {
      revision: revision,
      state: JSON.parse(window.CC_STORE.exportJSON())
    }, function (error, value) {
      pushing = false;
      if (pushAgain) { pushAgain = false; schedulePush(); }
      if (error) { say('error', error.message, { connected: false }); if (done) done(error); return; }
      revision = Number(value.revision || revision);
      applyRemote(value.state);
      say('ok', '已实时同步（第 ' + revision + ' 版）', { connected: true });
      if (done) done(null, value);
    });
  }
  function schedulePush() {
    if (applying || !config.code) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushTimer = null; push(); }, 700);
  }
  function startStream() {
    closeStream();
    if (!config.code || !apiBase()) return;
    if (window.EventSource) {
      stream = new window.EventSource(apiBase() + '/api/sync/sessions/' + encodeURIComponent(config.code) + '/events');
      stream.onopen = function () { say('ok', '同步服务已连接', { connected: true }); };
      /* 服务端发送具名 progress 事件；onmessage 只接收未命名事件。 */
      stream.addEventListener('progress', function () { pull(); });
      stream.onerror = function () { say('error', '同步连接暂时中断，正在重试', { connected: false }); };
    }
    pollTimer = setInterval(function () { pull(); }, 60000);
  }
  function connect(api, code, done) {
    config.api = normalizeApi(api || config.api || defaultApi());
    config.code = String(code || config.code || '').trim().toUpperCase();
    if (!config.api || !/^[A-Z2-9]{10,20}$/.test(config.code)) {
      say('error', '请输入同步服务地址和 12 位同步码', { connected: false });
      if (done) done(new Error('同步地址或同步码格式不正确'));
      return;
    }
    saveConfig();
    say('pending', '正在读取远端进度…', { connected: false });
    pull(function (error) {
      if (error) { if (done) done(error); return; }
      startStream();
      push(function (pushError) { if (done) done(pushError || null); });
    });
  }
  function create(api, done) {
    var endpoint = normalizeApi(api || config.api || defaultApi());
    if (!endpoint || !window.CC_STORE) { if (done) done(new Error('请输入同步服务地址')); return; }
    say('pending', '正在创建同步码…', { connected: false });
    request('POST', endpoint + '/api/sync/sessions', { state: JSON.parse(window.CC_STORE.exportJSON()) }, function (error, value) {
      if (error) { say('error', error.message, { connected: false }); if (done) done(error); return; }
      config.api = endpoint; config.code = String(value.code || '').toUpperCase(); revision = Number(value.revision || 1); saveConfig();
      startStream();
      say('ok', '同步码已创建：' + config.code, { connected: true });
      if (done) done(null, value);
    });
  }
  function disconnect() {
    closeStream();
    config.code = ''; revision = 0; saveConfig();
    say('idle', '已断开同步；本机进度仍保留', { connected: false });
  }
  readConfig();
  if (window.addEventListener) window.addEventListener('cc:progress-local-change', schedulePush);
  window.CC_SYNC = {
    getConfig: function () { return { api: config.api || defaultApi(), code: config.code, revision: revision }; },
    getStatus: function () { return current; },
    onStatus: function (fn) { if (typeof fn === 'function') listeners.push(fn); return function () { listeners = listeners.filter(function (item) { return item !== fn; }); }; },
    create: create,
    connect: connect,
    disconnect: disconnect,
    syncNow: function (done) { pull(function (error) { if (error) { if (done) done(error); return; } push(done); }); },
    apiBase: apiBase
  };
  if (config.code && apiBase()) connect(config.api, config.code, function () {});
})();
