/* 学习进度备份：纯本地操作，浏览器与 Android WebView 都能复制/粘贴 JSON。 */
(function () {
  'use strict';
  var store = window.CC_STORE;
  var trigger = document.getElementById('btn-progress-transfer');
  if (!store || !trigger) return;

  var overlay = document.createElement('div');
  overlay.className = 'progress-transfer-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'progress-transfer-title');
  overlay.innerHTML =
    '<div class="progress-transfer-panel">' +
      '<div class="progress-transfer-head"><h2 id="progress-transfer-title">学习进度备份与恢复</h2>' +
      '<button class="progress-transfer-close" type="button" data-close aria-label="关闭">×</button></div>' +
      '<p>进度默认保存在本机；配置同步服务后，可在网页、手机浏览器和 App 之间合并进度。</p>' +
      '<label class="progress-transfer-label" for="progress-export">当前进度备份</label>' +
      '<textarea id="progress-export" readonly spellcheck="false" aria-label="当前进度备份 JSON"></textarea>' +
      '<div class="progress-transfer-actions"><button type="button" data-copy>复制备份</button>' +
      '<button type="button" data-download>下载 JSON</button></div>' +
      '<label class="progress-transfer-label" for="progress-import">恢复进度</label>' +
      '<p>粘贴备份或选取 JSON 文件。导入会合并进度，不会清空当前记录。</p>' +
      '<textarea id="progress-import" spellcheck="false" placeholder="在此粘贴备份 JSON"></textarea>' +
      '<div class="progress-transfer-actions"><label class="progress-transfer-file">选取 JSON 文件' +
      '<input type="file" data-file accept=".json,application/json" aria-label="选取进度备份 JSON 文件"></label>' +
      '<button class="primary" type="button" data-import>导入并恢复</button></div>' +
      '<div class="progress-sync-section"><h3>跨设备同步</h3>' +
      '<label class="progress-transfer-label" for="progress-sync-api">同步服务地址</label>' +
      '<input id="progress-sync-api" class="progress-sync-input" type="url" data-sync-api placeholder="例如 https://learn.example.com">' +
      '<label class="progress-transfer-label" for="progress-sync-code">同步码</label>' +
      '<input id="progress-sync-code" class="progress-sync-input progress-sync-code" type="text" data-sync-code inputmode="text" autocomplete="off" spellcheck="false" placeholder="创建或输入 12 位同步码" maxlength="20">' +
      '<div class="progress-transfer-actions"><button type="button" data-sync-create>新建同步码</button>' +
      '<button type="button" data-sync-connect>连接同步</button>' +
      '<button type="button" data-sync-now>立即同步</button>' +
      '<button type="button" data-sync-disconnect>断开</button></div>' +
      '<div class="progress-sync-status" role="status" aria-live="polite"></div></div>' +
      '<div class="progress-transfer-status" role="status" aria-live="polite"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  var exportArea = overlay.querySelector('#progress-export');
  var importArea = overlay.querySelector('#progress-import');
  var status = overlay.querySelector('.progress-transfer-status');
  var syncApi = overlay.querySelector('[data-sync-api]');
  var syncCode = overlay.querySelector('[data-sync-code]');
  var syncStatus = overlay.querySelector('.progress-sync-status');
  var sync = window.CC_SYNC;
  var refreshOnClose = false;

  function say(message, error) {
    status.textContent = message;
    status.classList.toggle('is-error', !!error);
  }
  function updateWarning() {
    var error = store.storageError();
    trigger.classList.toggle('has-storage-error', !!error);
    trigger.title = error || '备份或恢复学习进度';
    if (error && !overlay.hidden) say(error, true);
  }
  function updateSyncStatus(value) {
    if (!syncStatus) return;
    syncStatus.textContent = value && value.message ? value.message : '未连接同步服务';
    syncStatus.classList.toggle('is-error', !!(value && value.level === 'error'));
  }
  function syncConfig() {
    if (!sync || !sync.getConfig) return;
    var value = sync.getConfig();
    syncApi.value = value.api || '';
    syncCode.value = value.code || '';
    updateSyncStatus(sync.getStatus && sync.getStatus());
  }
  function open() {
    exportArea.value = store.exportJSON();
    importArea.value = '';
    syncConfig();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    say(store.storageError() || '备份包含收藏、课程、步骤和每日一练进度。', !!store.storageError());
    overlay.querySelector('[data-close]').focus();
  }
  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    trigger.focus();
    if (refreshOnClose) window.location.reload();
  }
  trigger.addEventListener('click', open);
  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    var items = overlay.querySelectorAll('button,textarea,input[type="file"]');
    var first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  overlay.querySelector('[data-copy]').addEventListener('click', function () {
    exportArea.value = store.exportJSON();
    function fallback() {
      exportArea.focus(); exportArea.select();
      try {
        if (document.execCommand('copy')) { say('备份已复制。请保存到安全位置。'); return; }
      } catch (ignore) { /* 允许手动复制 */ }
      say('自动复制不可用，已选中备份内容，请手动复制。', true);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(exportArea.value).then(function () { say('备份已复制。请保存到安全位置。'); }, fallback);
    } else fallback();
  });
  overlay.querySelector('[data-download]').addEventListener('click', function () {
    exportArea.value = store.exportJSON();
    try {
      var url = URL.createObjectURL(new Blob([exportArea.value], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = 'cloudcmd-progress-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      say('已发起下载。如果 App 不支持下载，请使用“复制备份”。');
    } catch (error) { say('此环境无法下载，请使用“复制备份”。', true); }
  });
  overlay.querySelector('[data-file]').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { say('备份文件超过 2 MB，请确认选取的是进度 JSON。', true); return; }
    var reader = new FileReader();
    reader.onload = function () { importArea.value = String(reader.result || ''); say('文件已载入，请点击“导入并恢复”。'); };
    reader.onerror = function () { say('读取文件失败，请改用粘贴备份。', true); };
    reader.readAsText(file, 'utf-8');
  });
  overlay.querySelector('[data-import]').addEventListener('click', function () {
    if (!importArea.value.trim()) { say('请先粘贴备份或选取 JSON 文件。', true); return; }
    if (importArea.value.length > 2 * 1024 * 1024) { say('备份超过 2 MB，导入已取消。', true); return; }
    try {
      store.importJSON(importArea.value);
      exportArea.value = store.exportJSON();
      refreshOnClose = true;
      say('进度已恢复。关闭窗口后页面会刷新，显示最新进度。');
    } catch (error) { say('导入失败：' + error.message, true); }
    updateWarning();
  });
  overlay.querySelector('[data-sync-create]').addEventListener('click', function () {
    if (!sync) { updateSyncStatus({ level: 'error', message: '当前版本没有同步服务模块' }); return; }
    sync.create(syncApi.value, function (error, value) {
      if (!error && value) { syncCode.value = value.code || ''; say('同步码已创建：' + value.code + '，在另一台设备输入同一同步码即可连接。'); }
      else if (error) updateSyncStatus({ level: 'error', message: error.message });
    });
  });
  overlay.querySelector('[data-sync-connect]').addEventListener('click', function () {
    if (!sync) { updateSyncStatus({ level: 'error', message: '当前版本没有同步服务模块' }); return; }
    sync.connect(syncApi.value, syncCode.value, function (error) {
      if (error) updateSyncStatus({ level: 'error', message: error.message });
      else say('同步已连接；另一台设备的进度会自动合并。');
    });
  });
  overlay.querySelector('[data-sync-now]').addEventListener('click', function () {
    if (!sync) { updateSyncStatus({ level: 'error', message: '当前版本没有同步服务模块' }); return; }
    sync.syncNow(function (error) { if (error) updateSyncStatus({ level: 'error', message: error.message }); else say('已完成一次同步。'); });
  });
  overlay.querySelector('[data-sync-disconnect]').addEventListener('click', function () {
    if (sync) sync.disconnect();
    syncConfig();
  });
  if (sync && sync.onStatus) sync.onStatus(updateSyncStatus);
  window.addEventListener('cc:storage-error', updateWarning);
  updateWarning();
})();
