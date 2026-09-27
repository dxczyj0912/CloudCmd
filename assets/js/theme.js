/* 在样式加载前确定主题，并把网页与 Android 系统栏保持同色。 */
(function () {
  'use strict';

  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function savedMode() {
    if (window.CC_STORE && window.CC_STORE.getTheme) return window.CC_STORE.getTheme();
    try {
      var stored = JSON.parse(window.localStorage.getItem('cloudcmd.v1') || '{}');
      if (stored.theme === 'light' || stored.theme === 'dark') return stored.theme;
    } catch (ignore) { /* 离线或隐私模式下跟随系统 */ }
    return 'auto';
  }
  function apply() {
    var mode = savedMode();
    var effective = mode === 'auto' ? (media && media.matches ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', effective);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effective === 'dark' ? '#171f2b' : '#ffffff');
    if (window.CloudCmdAndroid && window.CloudCmdAndroid.setTheme) {
      window.CloudCmdAndroid.setTheme(mode, effective);
    }
    return effective;
  }

  window.CC_THEME = { apply: apply };
  if (media) {
    if (media.addEventListener) media.addEventListener('change', apply);
    else if (media.addListener) media.addListener(apply);
  }
  window.addEventListener('cc:progress-sync', apply);
  apply();
})();
