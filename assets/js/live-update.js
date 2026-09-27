/* 部署版内容热更新提示：检测 data/assets 版本变化后提示刷新，不打断当前输入。 */
(function () {
  'use strict';
  /* Android APK 里的页面是 file://；用户配置了同步地址后仍应检查内容版本。
     地址可能在页面启动后才填写，所以每次检查都动态读取。 */
  var localPage = window.location && window.location.protocol === 'file:';
  if (!/^https?:$/.test(window.location.protocol) && !localPage) return;
  var version = '';
  var timer = null;
  var appUpdateShown = false;
  function apiBase() {
    return window.CC_SYNC && window.CC_SYNC.apiBase ? window.CC_SYNC.apiBase() : '';
  }
  function show(next) {
    var bar = document.getElementById('live-update-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'live-update-bar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = '<span>内容有新版本</span><button type="button">刷新页面</button>';
      bar.style.cssText = 'position:fixed;left:50%;top:12px;z-index:120;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #9db7ff;border-radius:8px;background:#eef3ff;color:#163b8f;box-shadow:0 8px 24px rgba(15,35,80,.18);font:600 13px/1.2 system-ui,sans-serif';
      bar.querySelector('button').style.cssText = 'border:1px solid #2f6bff;border-radius:6px;padding:5px 9px;background:#2f6bff;color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer';
      bar.querySelector('button').addEventListener('click', function () { window.location.reload(); });
      document.body.appendChild(bar);
    }
    bar.dataset.version = next;
  }
  function currentAppVersion() {
    if (window.CC_APP_VERSION) return String(window.CC_APP_VERSION);
    var match = String(window.navigator && window.navigator.userAgent || '').match(/CloudCmdApp\/([^\s]+)/i);
    return match ? match[1] : '';
  }
  function compareVersion(left, right) {
    var a = String(left || '').split('.').map(function (part) { return Number(part) || 0; });
    var b = String(right || '').split('.').map(function (part) { return Number(part) || 0; });
    var length = Math.max(a.length, b.length);
    for (var i = 0; i < length; i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
    }
    return 0;
  }
  function downloadUrl(value) {
    var raw = String(value || '').trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!/^\//.test(raw)) return '';
    var api = apiBase();
    if (!/^https?:\/\//i.test(api)) return '';
    var a = document.createElement('a');
    a.href = api.replace(/\/+$/, '') + raw;
    return a.href;
  }
  function showAppUpdate(value) {
    var current = currentAppVersion();
    var target = value && downloadUrl(value.apkUrl);
    if (appUpdateShown || !current || !value || !value.available || !value.versionName || !target || compareVersion(value.versionName, current) <= 0) return;
    appUpdateShown = true;
    var bar = document.getElementById('app-update-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'app-update-bar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = '<span>发现 CloudCmd 新版本 <b></b></span><button type="button">下载更新</button>';
      bar.style.cssText = 'position:fixed;left:50%;top:58px;z-index:120;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #b9e0c2;border-radius:8px;background:#effbf1;color:#155724;box-shadow:0 8px 24px rgba(15,80,35,.18);font:600 13px/1.2 system-ui,sans-serif';
      bar.querySelector('button').style.cssText = 'border:1px solid #218838;border-radius:6px;padding:5px 9px;background:#218838;color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer';
      document.body.appendChild(bar);
    }
    bar.querySelector('b').textContent = value.versionName;
    bar.querySelector('button').addEventListener('click', function () {
      window.location.href = target;
    });
  }
  function checkApp(api) {
    if (!currentAppVersion()) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', api + '/api/app-version?t=' + Date.now(), true);
    xhr.timeout = 8000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || xhr.status < 200 || xhr.status >= 300) return;
      try { showAppUpdate(JSON.parse(xhr.responseText || '{}')); } catch (ignore) { /* 更新检查失败不影响使用 */ }
    };
    xhr.send();
  }
  function check() {
    var api = apiBase();
    if (!api) return;
    checkApp(api);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', api + '/api/version?t=' + Date.now(), true);
    xhr.timeout = 8000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || xhr.status < 200 || xhr.status >= 300) return;
      try {
        var value = JSON.parse(xhr.responseText || '{}');
        if (!version) version = value.version || '';
        else if (value.version && value.version !== version) show(value.version);
      } catch (ignore) { /* 更新检查失败不影响使用 */ }
    };
    xhr.send();
  }
  check();
  timer = setInterval(check, 30000);
  if (window.addEventListener) window.addEventListener('cc:sync-status', check);
  window.CC_LIVE_UPDATE = { check: check, stop: function () { if (timer) clearInterval(timer); } };
})();
