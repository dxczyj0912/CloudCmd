/* ==========================================================================
   assets/js/app.js · 入口：初始化、事件绑定、快捷键、复制、主题
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 复制（file:// 下必须降级） ---------------- */

  function copyFallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(copyFallback(text)); }
      );
    } else {
      done(copyFallback(text));
    }
  }

  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  /* ---------------- 主题 ---------------- */

  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme() {
    var mode = window.CC_STORE.getTheme();
    var eff = mode;
    if (mode === 'auto') eff = (mql && mql.matches) ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', eff);
  }

  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var cur = window.CC_STORE.getTheme();
    var next = order[(order.indexOf(cur) + 1) % order.length];
    window.CC_STORE.setTheme(next);
    applyTheme();
    var names = { auto: '跟随系统', light: '浅色', dark: '深色' };
    toast('主题：' + names[next]);
  }

  /* ---------------- 抽屉（移动端） ---------------- */

  function closeDrawer() {
    document.body.classList.remove('nav-open');
    var bd = document.getElementById('backdrop');
    if (bd) bd.hidden = true;
  }
  function openDrawer() {
    document.body.classList.add('nav-open');
    var bd = document.getElementById('backdrop');
    if (bd) bd.hidden = false;
  }

  /* ---------------- 搜索 ---------------- */

  var searchInput = null, debounceTimer = null;

  function doSearch(q) {
    var target = '#/search?q=' + encodeURIComponent(q);
    if (window.location.hash === target) {
      /* hash 没变时手动重渲染 */
      window.CC_ROUTER.render();
    } else {
      window.location.hash = target;
    }
  }

  function bindSearch() {
    searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', function () {
      var v = searchInput.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        if (v) doSearch(v);
        else if (window.CC_ROUTER.parse(window.location.hash).name === 'search') {
          window.location.hash = '#/';
        }
      }, 140);
    });

    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var v = searchInput.value.trim();
        if (!v) return;
        e.preventDefault();
        var results = window.CC_SEARCH.query(v, 1);
        if (results.length) {
          window.location.hash = '#/cmd/' + results[0].entry.id;
        } else {
          doSearch(v);
        }
      } else if (e.key === 'Escape') {
        searchInput.value = '';
        searchInput.blur();
        if (window.CC_ROUTER.parse(window.location.hash).name === 'search') {
          window.location.hash = '#/';
        }
      }
    });
  }

  /* 全局快捷键：/ 或 Ctrl+K 聚焦搜索 */
  function bindHotkeys() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);

      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (searchInput) { searchInput.focus(); searchInput.select(); }
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        if (searchInput) { searchInput.focus(); searchInput.select(); }
        closeDrawer();
      }
    });
  }

  /* 打印前自动展开所有命令详情，打印后恢复原状 */
  function bindPrint() {
    if (!window.matchMedia) return;
    var mqlPrint = window.matchMedia('print');
    var wasOpen = [];
    var handler = function (mql) {
      var cards = document.querySelectorAll('.cmd-card');
      if (mql.matches) {
        wasOpen = [];
        for (var i = 0; i < cards.length; i++) {
          var body = cards[i].querySelector('.cmd-body');
          wasOpen.push(body ? !body.hidden : false);
          if (body) body.hidden = false;
        }
      } else {
        for (var j = 0; j < cards.length; j++) {
          var b = cards[j].querySelector('.cmd-body');
          if (b) b.hidden = !wasOpen[j];
        }
      }
    };
    if (mqlPrint.addEventListener) {
      mqlPrint.addEventListener('change', handler);
    } else if (window.onbeforeprint !== undefined) {
      window.addEventListener('beforeprint', function () { handler({ matches: true }); });
      window.addEventListener('afterprint', function () { handler({ matches: false }); });
    }
  }

  /* ---------------- 视图交互（事件委托） ---------------- */

  function bindDelegates() {
    document.addEventListener('click', function (e) {
      var t = e.target;

      /* 复制按钮 */
      var copyBtn = t.closest ? t.closest('[data-copy]') : null;
      if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        var text = copyBtn.getAttribute('data-copy');
        copyText(text, function (ok) {
          if (ok) {
            copyBtn.classList.add('done');
            var label = copyBtn.querySelector('span');
            var old = label ? label.textContent : '';
            if (label) label.textContent = '已复制';
            toast('已复制到剪贴板');
            setTimeout(function () {
              copyBtn.classList.remove('done');
              if (label) label.textContent = old || '复制';
            }, 1500);
          } else {
            toast('复制失败，请手动选中复制');
          }
        });
        return;
      }

      /* 收藏 */
      var favBtn = t.closest ? t.closest('[data-fav]') : null;
      if (favBtn) {
        e.preventDefault();
        e.stopPropagation();
        var fid = favBtn.getAttribute('data-fav');
        var on = window.CC_STORE.toggleFavorite(fid);
        favBtn.classList.toggle('on', on);
        favBtn.innerHTML = on ? ICON_STAR_ON : ICON_STAR;
        toast(on ? '已加入收藏' : '已取消收藏');
        refreshProgress();
        refreshSidebarCounts();
        return;
      }

      /* 已掌握 */
      var mBtn = t.closest ? t.closest('[data-master]') : null;
      if (mBtn) {
        e.preventDefault();
        e.stopPropagation();
        var mid = mBtn.getAttribute('data-master');
        var mon = window.CC_STORE.toggleMastered(mid);
        mBtn.classList.toggle('on', mon);
        /* 注意要取 .mt-label：按钮里第一个 span 是图标容器，
           早先这里写 querySelector('span') 会把勾图标整个换成文字。 */
        var label = mBtn.querySelector('.mt-label');
        if (label) label.textContent = mon ? '已掌握' : '标记为已掌握';
        mBtn.setAttribute('aria-pressed', mon ? 'true' : 'false');
        mBtn.setAttribute('title', mon ? '已掌握 · 点击可取消标记' : '标记为已掌握，首页进度与「只看未掌握」筛选会同步');
        var card = mBtn.closest('.cmd-card');
        if (card) card.classList.toggle('mastered', mon);
        toast(mon ? '已标记为掌握' : '已取消标记');
        refreshProgress();
        applyFilter();
        return;
      }

      /* 阶段完成 */
      var sBtn = t.closest ? t.closest('[data-stage-done]') : null;
      if (sBtn) {
        e.preventDefault();
        var sid = sBtn.getAttribute('data-stage-done');
        var son = window.CC_STORE.toggleStage(sid);
        sBtn.classList.toggle('on', son);
        sBtn.textContent = son ? '✓ 已完成' : '标记完成';
        var stage = sBtn.closest('.stage');
        if (stage) stage.classList.toggle('done', son);
        return;
      }

      /* 难度筛选 */
      var seg = t.closest ? t.closest('.seg [data-lv]') : null;
      if (seg) {
        e.preventDefault();
        var box = seg.closest('.seg');
        var btns = box.querySelectorAll('[data-lv]');
        for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', 'false');
        seg.setAttribute('aria-pressed', 'true');
        applyFilter();
        return;
      }

      /* 展开/收起命令 */
      var toggle = t.closest ? t.closest('[data-toggle]') : null;
      if (toggle && !t.closest('a[href]')) {
        var cardEl = toggle.closest('.cmd-card');
        if (cardEl) { e.preventDefault(); toggleCard(cardEl); }
        return;
      }

      /* 展开全部 */
      var expandAll = t.closest ? t.closest('[data-expand-all]') : null;
      if (expandAll) {
        e.preventDefault();
        var cards = document.querySelectorAll('.cmd-card');
        var anyClosed = false;
        for (var c = 0; c < cards.length; c++) {
          if (cards[c].querySelector('.cmd-body').hidden) { anyClosed = true; break; }
        }
        for (var d = 0; d < cards.length; d++) {
          setCardOpen(cards[d], anyClosed);
        }
        expandAll.textContent = anyClosed ? '⤡' : '⤢';
        expandAll.title = anyClosed ? '收起全部' : '展开全部';
        return;
      }

      /* 分类链接：补充标记 open，避免视图重建后丢失 */
      var navA = t.closest ? t.closest('.nav-link, .cat-card, .stage-links a') : null;
      if (navA) closeDrawer();
    });

    /* 排序切换：重新渲染分类页并保持排序选择 */
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches && t.matches('[data-sort]')) {
        var bar = t.closest('.toolbar');
        var cat = bar ? bar.getAttribute('data-cat') : '';
        if (!cat) return;
        currentSort = t.value;
        var mainEl = document.getElementById('main');
        if (mainEl) mainEl.innerHTML = window.CC_VIEW.viewCategory(cat, { sort: currentSort });
        else return;
        /* 重渲染后恢复控件状态 */
        var sel = mainEl.querySelector('.toolbar select[data-sort]');
        if (sel) sel.value = currentSort;
        var todo = mainEl.querySelector('[data-only-todo]');
        if (todo) todo.checked = onlyTodoState;
        applyFilter();
        return;
      }
      if (t.matches && t.matches('[data-only-todo]')) {
        onlyTodoState = t.checked;
        applyFilter();
      }
    });
  }

  var ICON_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
  var ICON_STAR_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  var currentSort = 'default';
  var onlyTodoState = false;

  function setCardOpen(card, open) {
    var body = card.querySelector('.cmd-body');
    var btn = card.querySelector('.cmd-head-actions .icon-btn');
    if (!body) return;
    body.hidden = !open;
    card.classList.toggle('open', open);
    if (btn) {
      var wrap = btn.querySelector('span');
      if (wrap) wrap.style.transform = open ? 'rotate(90deg)' : 'none';
    }
  }

  function toggleCard(card) {
    var body = card.querySelector('.cmd-body');
    if (!body) return;
    setCardOpen(card, body.hidden);
  }

  /* 难度 + 只看未掌握 过滤 */
  function applyFilter() {
    var toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    var seg = toolbar.querySelector('.seg [aria-pressed="true"]');
    var lv = seg ? seg.getAttribute('data-lv') : 'all';
    var onlyTodo = toolbar.querySelector('[data-only-todo]');
    onlyTodo = onlyTodo ? onlyTodo.checked : false;

    var cards = document.querySelectorAll('#cmd-list .cmd-card');
    var visible = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var okLv = (lv === 'all') || (card.getAttribute('data-level') === lv);
      var okTodo = !onlyTodo || !card.classList.contains('mastered');
      var show = okLv && okTodo;
      card.hidden = !show;
      if (show) visible++;
    }
    var emptyEl = document.getElementById('filter-empty');
    if (emptyEl) emptyEl.hidden = visible !== 0;
  }

  function refreshProgress() {
    var box = document.getElementById('progress-box');
    if (box) box.innerHTML = window.CC_VIEW.renderProgress();
  }

  function refreshSidebarCounts() {
    var loc = window.CC_ROUTER.current() || {};
    var active = loc.name === 'favorites' ? '__favorites' :
                 loc.name === 'roadmap' ? '__roadmap' :
                 loc.name === 'practice' ? '__practice' :
                 loc.name === 'practiceList' ? (loc.catId || '__practice') :
                 loc.name === 'cheat' ? '__cheat' : (loc.catId || '');
    var nav = document.getElementById('nav');
    if (nav) nav.innerHTML = window.CC_VIEW.renderNav(active);
  }

  /* ---------------- 临时 Shell 窗口 ----------------
     按顶栏的终端按钮（或 ` 键）打开，停在页面右侧空白处，边看文档边敲命令。
     复用同一个模拟 shell 引擎；面板里的会话不算练习课，避免影响步骤判定。 */
  var SHELL_KEY = 'cloudcmd.shellPanel';
  var SHELL_WIDTH_KEY = 'cloudcmd.shellWidth';
  var shellPanelOpen = false;
  var shellPanelResized = false;
  var shellPanelWidth = 400;
  var SHELL_MIN_WIDTH = 320;

  function shellPanelWantOpen() {
    try { return localStorage.getItem(SHELL_KEY) === '1'; } catch (e) { return false; }
  }

  function shellWidthLimits() {
    var mobile = window.matchMedia && window.matchMedia('(max-width: 899.98px)').matches;
    var max = Math.min(1400, window.innerWidth - (mobile ? 24 : 420));
    return { min: SHELL_MIN_WIDTH, max: Math.max(SHELL_MIN_WIDTH, max) };
  }

  function clampShellWidth(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = shellPanelWidth || 400;
    var limits = shellWidthLimits();
    return Math.max(limits.min, Math.min(limits.max, n));
  }

  function shellPanelStoredWidth() {
    try {
      var raw = localStorage.getItem(SHELL_WIDTH_KEY);
      return raw === null ? null : clampShellWidth(raw);
    } catch (e) { return null; }
  }

  function shellChevron(expanded) {
    var d = expanded ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function refreshShellResizeControls() {
    var root = document.documentElement;
    var resizer = document.getElementById('shell-resizer');
    var collapse = document.getElementById('shell-collapse');
    var limits = shellWidthLimits();

    shellPanelWidth = clampShellWidth(shellPanelWidth);
    root.setAttribute('data-shell-resized', shellPanelResized ? '1' : '0');
    if (shellPanelResized) root.style.setProperty('--shell-w', shellPanelWidth + 'px');
    else root.style.removeProperty('--shell-w');

    if (resizer) {
      resizer.setAttribute('aria-valuemin', String(limits.min));
      resizer.setAttribute('aria-valuemax', String(limits.max));
      resizer.setAttribute('aria-valuenow', String(shellPanelWidth));
      resizer.setAttribute('aria-valuetext', shellPanelWidth + ' 像素');
    }
    if (collapse) {
      collapse.setAttribute('aria-pressed', shellPanelResized ? 'true' : 'false');
      collapse.setAttribute('aria-label', shellPanelResized ? '恢复铺满右侧' : '收缩临时 Shell');
      collapse.title = shellPanelResized ? '恢复铺满右侧' : '收缩到窄栏';
      collapse.innerHTML = shellChevron(shellPanelResized);
    }
  }

  function setShellPanelWidth(width, persist) {
    shellPanelResized = true;
    shellPanelWidth = clampShellWidth(width);
    refreshShellResizeControls();
    if (persist) {
      try { localStorage.setItem(SHELL_WIDTH_KEY, String(shellPanelWidth)); } catch (e) { /* 忽略 */ }
    }
  }

  function resetShellPanelWidth() {
    shellPanelResized = false;
    refreshShellResizeControls();
    try { localStorage.removeItem(SHELL_WIDTH_KEY); } catch (e) { /* 忽略 */ }
  }

  function toggleShellPanelSize() {
    if (shellPanelResized) {
      resetShellPanelWidth();
    } else {
      var limits = shellWidthLimits();
      setShellPanelWidth(Math.min(420, limits.max), true);
    }
  }

  function bindShellResizer() {
    var resizer = document.getElementById('shell-resizer');
    var panel = document.getElementById('shell-panel');
    if (!resizer || !panel) return;

    var dragging = false;
    var startX = 0;
    var startWidth = 0;

    function stopDrag(e) {
      if (!dragging) return;
      dragging = false;
      document.documentElement.classList.remove('shell-resizing');
      try { resizer.releasePointerCapture(e.pointerId); } catch (ignore) { /* ignore */ }
      try { localStorage.setItem(SHELL_WIDTH_KEY, String(shellPanelWidth)); } catch (ignore2) { /* ignore */ }
    }

    resizer.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      var rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startWidth = rect.width;
      dragging = true;
      setShellPanelWidth(startWidth, false);
      document.documentElement.classList.add('shell-resizing');
      try { resizer.setPointerCapture(e.pointerId); } catch (ignore) { /* ignore */ }
    });
    resizer.addEventListener('pointermove', function (e) {
      if (dragging) setShellPanelWidth(startWidth - (e.clientX - startX), false);
    });
    resizer.addEventListener('pointerup', stopDrag);
    resizer.addEventListener('pointercancel', stopDrag);
    resizer.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setShellPanelWidth(shellPanelWidth + (e.key === 'ArrowLeft' ? 32 : -32), true);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setShellPanelWidth(shellWidthLimits().min, true);
      } else if (e.key === 'End') {
        e.preventDefault();
        setShellPanelWidth(shellWidthLimits().max, true);
      }
    });
  }

  function renderShellPanel() {
    var host = document.getElementById('shell-body');
    if (!host || host.getAttribute('data-ready') === '1') return;
    host.innerHTML = window.CC_TERM.terminalHtml({
      compact: true,
      free: true,
      title: 'student@web-prod-01 · 临时会话',
      placeholder: '敲命令试试，例如 ls -lh /var/log/nginx'
    });
    host.setAttribute('data-ready', '1');
    window.CC_TERM.bindPanel(host);
  }

  /* 面板默认在 .layout 里（fixed/hidden），打开时挪进 .content，
     与文档并排成"左文档 + 右终端"，这样文档不会被盖住 */
  function mountShellPanel() {
    var panel = document.getElementById('shell-panel');
    var content = document.querySelector('.content');
    if (!panel || !content || panel.parentNode === content) return;
    var main = document.getElementById('main');
    if (main && main.parentNode === content) content.insertBefore(panel, main.nextSibling);
    else content.appendChild(panel);
  }

  function unmountShellPanel() {
    var panel = document.getElementById('shell-panel');
    var layout = document.querySelector('.layout');
    if (panel && layout && panel.parentNode !== layout) layout.appendChild(panel);
  }

  function toggleShellPanel(on, why) {
    var panel = document.getElementById('shell-panel');
    var fab = document.getElementById('shell-fab');
    var btn = document.getElementById('btn-shell');
    if (!panel) return;
    shellPanelOpen = typeof on === 'boolean' ? on : !shellPanelOpen;
    panel.hidden = !shellPanelOpen;
    if (fab) fab.hidden = shellPanelOpen;
    if (btn) {
      btn.setAttribute('aria-pressed', shellPanelOpen ? 'true' : 'false');
      btn.classList.toggle('is-on', shellPanelOpen);
      btn.title = shellPanelOpen
        ? '关闭临时 Shell 窗口（Esc）'
        : '临时 Shell 窗口：边看文档边练（快捷键 `）';
      btn.setAttribute('aria-label', shellPanelOpen ? '关闭临时 Shell 窗口' : '打开临时 Shell 窗口');
    }
    document.documentElement.setAttribute('data-shell', shellPanelOpen ? 'on' : 'off');
    try { localStorage.setItem(SHELL_KEY, shellPanelOpen ? '1' : '0'); } catch (e) { /* 忽略 */ }
    console.log('[CloudCmd] 临时 Shell → ' + (shellPanelOpen ? '打开' : '关闭') + (why ? '（' + why + '）' : ''));
    if (shellPanelOpen) {
      mountShellPanel();
      renderShellPanel();
      var input = panel.querySelector('.term-input');
      if (input) setTimeout(function () { input.focus(); }, 40);
    } else {
      unmountShellPanel();
      if (document.activeElement && panel.contains(document.activeElement)) document.activeElement.blur();
    }
  }

  function bindShellPanel() {
    var panel = document.getElementById('shell-panel');
    if (!panel) return;

    var btn = document.getElementById('btn-shell');
    if (btn) btn.addEventListener('click', function () { toggleShellPanel(undefined, '顶栏按钮'); });
    var fab = document.getElementById('shell-fab');
    if (fab) fab.addEventListener('click', function () { toggleShellPanel(true, '悬浮按钮'); });
    var close = document.getElementById('shell-close');
    if (close) close.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleShellPanel(false, '面板上的关闭按钮');
    });
    var collapse = document.getElementById('shell-collapse');
    if (collapse) collapse.addEventListener('click', toggleShellPanelSize);
    bindShellResizer();

    var storedWidth = shellPanelStoredWidth();
    if (storedWidth !== null) {
      shellPanelResized = true;
      shellPanelWidth = storedWidth;
    }
    refreshShellResizeControls();

    /* 兜底：抽屉模式下点面板外面也能关（宽屏并排模式不启用，免得误关） */
    document.addEventListener('mousedown', function (e) {
      if (!shellPanelOpen) return;
      if (panel.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      if (document.documentElement.getAttribute('data-shell-drawer') === '1') {
        toggleShellPanel(false, '点击面板外');
      }
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === '`' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleShellPanel(undefined, 'Ctrl+反引号'); return; }
      /* 面板开着时 Esc 一律关闭（哪怕光标在终端输入框里） */
      if (e.key === 'Escape' && shellPanelOpen) {
        e.preventDefault();
        toggleShellPanel(false, 'Esc');
      }
    });

    /* 抽屉模式下打个标记，给"点外面关闭"用 */
    function syncDrawerFlag() {
      document.documentElement.setAttribute('data-shell-drawer',
        window.matchMedia('(max-width: 899.98px)').matches ? '1' : '0');
      refreshShellResizeControls();
    }
    syncDrawerFlag();
    window.addEventListener('resize', syncDrawerFlag);

    /* 记住上次的开合状态 */
    if (shellPanelWantOpen()) toggleShellPanel(true, '上次的状态');
  }

  /* 每次视图渲染后：绑定终端、应用筛选、滚动到目标命令、刷新进度 */
  function bindAfterRender() {
    var loc = window.CC_ROUTER.current() || {};

    /* 实时练习已迁到独立页面 academy-lab.html，这里只剩跳转占位，无需绑定终端 */
    if (loc.name === 'practice') return;

    /* 每日一练：卡片状态是"一次会话"的，所以每次渲染都重新绑；
       离开这个路由时要把登记撤掉，否则旧实例还会响应键盘 */
    if (loc.name === 'drill') { bindDrill(); return; }
    drillActive = null;

    /* 知识库：按分类筛选是纯前端状态，不重建视图（和分类页的筛选一个思路） */
    if (loc.name === 'kb') { bindKbFilter(); return; }

    if (loc.name === 'category') {
      currentSort = 'default';
      applyFilter();
      if (loc.cmdId) {
        var el = document.getElementById('cmd-' + loc.cmdId);
        if (el) {
          setCardOpen(el, true);
          setTimeout(function () {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 60);
        }
      }
    }
    refreshProgress();
  }

  /* ---------------- 知识库筛选 ---------------- */

  /* 分类筛选按钮：只切 class，不重新渲染 —— 重新渲染会丢滚动位置，
     而知识库条目很长，用户正看到一半。 */
  function bindKbFilter() {
    var box = document.querySelector('.kb-filter');
    var list = document.getElementById('kb-list');
    if (!box || !list) return;
    var btns = box.querySelectorAll('.kb-filter-btn');
    function apply(cat) {
      var cards = list.querySelectorAll('.kb-card');
      for (var i = 0; i < cards.length; i++) {
        var id = cards[i].getAttribute('data-kb-id');
        var rec = findKbRec(id);
        var keep = !cat || (rec && rec.cat === cat);
        cards[i].style.display = keep ? '' : 'none';
      }
      for (var b = 0; b < btns.length; b++) {
        btns[b].classList.toggle('active', btns[b].getAttribute('data-kb-cat') === cat);
      }
    }
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var cat = this.getAttribute('data-kb-cat');
        var wasActive = this.classList.contains('active');
        apply(wasActive ? '' : cat);
      });
    }
  }

  function findKbRec(id) {
    var pools = [window.CC_CONCEPTS, window.CC_ERRORS, window.CC_VERSIONS, window.CC_CERT];
    for (var p = 0; p < pools.length; p++) {
      var arr = pools[p] || [];
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    }
    return null;
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    applyTheme();
    if (mql && mql.addEventListener) {
      mql.addEventListener('change', function () {
        if (window.CC_STORE.getTheme() === 'auto') applyTheme();
      });
    }

    window.CC_SEARCH.build();

    var btnTheme = document.getElementById('btn-theme');
    if (btnTheme) btnTheme.addEventListener('click', cycleTheme);

    var btnMenu = document.getElementById('btn-menu');
    if (btnMenu) btnMenu.addEventListener('click', function () {
      if (document.body.classList.contains('nav-open')) closeDrawer(); else openDrawer();
    });

    var backdrop = document.getElementById('backdrop');
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    var stat = document.getElementById('stat-total');
    if (stat) {
      stat.textContent = window.CC_SEARCH.size() + ' 条命令 · ' +
        Object.keys(window.CC_DATA).length + ' 个分类已上线';
    }

    bindSearch();
    bindHotkeys();
    bindDelegates();
    bindPrint();
    bindShellPanel();
    bindDrillKeys();

    /* 实时练习已独立成页（academy-lab.html）：命中 #/practice 直接跳，
       不先渲染主站的练习视图（避免闪一下再换页）。 */
    window.CC_ROUTER.academyRedirect();

    window.addEventListener('hashchange', function () {
      if (window.CC_ROUTER.academyRedirect()) { closeDrawer(); return; }
      window.CC_ROUTER.render();
      closeDrawer();
    });
    window.addEventListener('cc:progress-sync', function () {
      window.CC_ROUTER.render();
    });
    document.addEventListener('cc:rendered', bindAfterRender);

    window.CC_ROUTER.render();

    /* 首屏：若 hash 带 q，把关键词回填到搜索框 */
    var loc = window.CC_ROUTER.parse(window.location.hash);
    if (loc.name === 'search' && loc.q && searchInput) searchInput.value = loc.q;

    console.log('[CloudCmd] 已加载 ' + window.CC_SEARCH.size() + ' 条命令');
    console.log('[CloudCmd] build 20260924e · 临时 Shell：默认铺满右侧，可拖动左边缘收缩；Esc / 顶栏按钮 / 面板「关闭」/ 点面板外 都能关');
  }

  /* 对外只暴露两件事：打开临时 Shell 面板、往面板里送一条命令。
     每日一练卡片的「送进终端跑一遍」靠它 —— 复用同一个面板会话，
     所以卡片里连着跑几条命令时状态是连续的（cd 会保留）。 */
  window.CC_APP = {
    openShell: function () { toggleShellPanel(true, '每日一练'); },
    closeShell: function () { toggleShellPanel(false, '每日一练'); },
    runInShell: function (cmd) {
      toggleShellPanel(true, '每日一练');
      /* 面板刚打开时 renderShellPanel 会同步建好会话，所以可以直接送 */
      return window.CC_TERM.runInPanel(cmd);
    },
    isShellOpen: function () { return !!shellPanelOpen; },
    /* 供测试用：离开每日一练后这里必须是 false，否则旧实例还会响应键盘 */
    drillMounted: function () { return !!drillActive; }
  };

  /* 当前挂载的每日一练实例。键盘监听只在 boot 里注册**一次**，
     转发给它 —— 否则每渲染一次就多一个 document 级监听，
     几个旧闭包会各自拿着自己的队列去改 SRS 记录（踩过）。 */
  var drillActive = null;

  function bindDrill() {
    var stage = document.getElementById('drill-stage');
    var cardEl = document.getElementById('drill-card');
    if (!stage || !cardEl || !window.CC_DRILL) return;

    var qEl = document.getElementById('drill-queue');
    var queue = [];
    try { queue = JSON.parse(qEl ? qEl.textContent : '[]') || []; } catch (e) { queue = []; }
    if (!queue.length) return;

    var total = queue.length;
    var doneCount = 0;
    var idx = 0;
    var flipped = false;
    var requeued = {};      /* "不会"的卡本场只回炉一次，避免死循环 */
    if (window.CC_DRILL.recordRound) window.CC_DRILL.recordRound();

    var elKind = document.getElementById('dc-kind');
    var elCat = document.getElementById('dc-cat');
    var elIdx = document.getElementById('dc-idx');
    var elFront = document.getElementById('dc-front');
    var elBack = document.getElementById('dc-back');
    var elActions = document.getElementById('drill-actions');
    var elBar = document.getElementById('drill-progress-bar');
    var elDone = document.getElementById('drill-done');

    var KIND_LABEL = { diagnose: '现象 → 命令', distinguish: '辨析', syntax: '参数填空' };

    function catName(id) {
      var meta = window.CC_CATS_META;
      var c = meta && meta.byId ? meta.byId(id) : null;
      return c ? c.name : id;
    }

    function currentCard() { return window.CC_DRILL.byId(queue[idx]); }

    function paint() {
      var card = currentCard();
      if (!card) return finish();
      flipped = false;
      cardEl.classList.remove('is-flipped');
      cardEl.setAttribute('data-card', card.id);

      elKind.textContent = KIND_LABEL[card.kind] || card.kind;
      elCat.textContent = catName(card.cat);
      elIdx.textContent = (doneCount + 1) + ' / ' + total;
      if (elBar) elBar.style.width = Math.round(doneCount / total * 100) + '%';
      if (elDone) elDone.textContent = String(doneCount);

      var front = '<div class="dc-q">' + window.CC_VIEW.mdInline(card.front).replace(/\n/g, '<br>') + '</div>';
      if (card.hint) {
        front += '<div class="dc-hint" id="dc-hint" hidden><b>提示</b>' +
          window.CC_VIEW.mdInline(card.hint) + '</div>' +
          '<button class="dc-hint-btn" id="dc-hint-btn" type="button">卡住了？看提示</button>';
      }
      elFront.innerHTML = front;

      /* 背面：命令 + 判据 + 反向排除 + 送进终端。
         顺序是刻意的 —— 先给"敲什么"，再给"凭什么"，最后给"不是它的时候往哪想"。 */
      var back = '<div class="dc-answer"><code>' + window.CC_VIEW.esc(card.answer) + '</code></div>';
      back += '<div class="dc-block"><span class="dc-label">判据</span>' +
        window.CC_VIEW.mdInline(card.why) + '</div>';
      if (card.contrast) {
        back += '<div class="dc-block dc-contrast"><span class="dc-label">如果不是这样</span>' +
          window.CC_VIEW.mdInline(card.contrast) + '</div>';
      }
      var links = [];
      if (card.cmdIds && card.cmdIds.length) {
        links.push('<a href="#/cmd/' + encodeURIComponent(card.cmdIds[0]) + '">看命令详情</a>');
      }
      if (card.lesson) {
        links.push('<a href="academy-lab.html#/lab/cc-' + encodeURIComponent(card.lesson) + '">去练一遍</a>');
      }
      links.push('<a href="#/practice">练习课列表</a>');
      back += '<div class="dc-links">' + links.join('') + '</div>';
      elBack.innerHTML = back;

      renderActions();
    }

    function renderActions() {
      if (!flipped) {
        elActions.innerHTML =
          '<button class="btn-primary dc-flip" id="dc-flip" type="button">翻面看答案 <kbd>空格</kbd></button>';
        return;
      }
      var card = currentCard();
      var runBtn = card && card.run
        ? '<button class="btn-ghost dc-run" id="dc-run" type="button">▶ 送进终端跑一遍</button>'
        : '<span class="dc-norun">这张卡的命令模拟引擎还没实现，所以没有"跑一遍"</span>';
      elActions.innerHTML =
        '<div class="dc-runrow">' + runBtn + '</div>' +
        '<div class="dc-grades">' +
        '<button class="dc-grade g-again" data-grade="again" type="button">不会<kbd>1</kbd></button>' +
        '<button class="dc-grade g-hard"  data-grade="hard"  type="button">模糊<kbd>2</kbd></button>' +
        '<button class="dc-grade g-good"  data-grade="good"  type="button">会了<kbd>3</kbd></button>' +
        '</div>';
    }

    function flip() {
      if (flipped) return;
      flipped = true;
      cardEl.classList.add('is-flipped');
      renderActions();
    }

    function finish() {
      window.CC_DRILL.touchStreak();
      var st = window.CC_DRILL.stats();
      var more = window.CC_DRILL.extraQueue(1).length;
      stage.innerHTML =
        '<div class="drill-done"><div class="dd-emoji">🎉</div>' +
        '<h2>今天练完了 ' + doneCount + ' 张</h2>' +
        '<p>本轮 ' + doneCount + ' 张 ｜ 今日累计 ' + (st.dailyReviewed || doneCount) + ' 张 ｜ 连续 ' + st.streak + ' 天</p>' +
        '<div class="dd-actions">' +
        '<a class="btn-ghost" href="#/practice">趁热去练习课敲一遍</a>' +
        (more ? '<a class="btn-ghost" href="#/drill?extra=1">再练 5 张新卡</a>' : '') +
        '<a class="btn-ghost" href="#/drill">再来一轮</a>' +
        '</div>' +
        '<p class="dd-note">这里的进度只说明"记住了"。真实能力看练习课完成度 —— 卡片只是帮你记住。</p>' +
        '</div>';
    }

    function answer(g) {
      var card = currentCard();
      if (!card || !flipped) return;
      window.CC_DRILL.grade(card.id, g);
      if (window.CC_DRILL.recordReview) window.CC_DRILL.recordReview();
      window.CC_STORE.drillSave({ reviews: (window.CC_STORE.drillStats().reviews || 0) + 1 });

      if (g === 'again' && !requeued[card.id]) {
        requeued[card.id] = true;
        queue.push(card.id);        /* 本场回炉一次：今天之内再见一面 */
        total = queue.length;
      }
      doneCount++;
      if (doneCount >= total) return finish();
      idx++;
      paint();
    }

    /* 事件全部委托到 stage 上：卡片内容每次重绘，直接绑在按钮上会绑丢 */
    stage.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('#dc-flip')) { flip(); return; }
      if (t.closest('#dc-hint-btn')) {
        var hint = document.getElementById('dc-hint');
        if (hint) hint.hidden = false;
        var b = document.getElementById('dc-hint-btn');
        if (b) b.hidden = true;
        return;
      }
      if (t.closest('.dc-front') || t.closest('.dc-meta')) { flip(); return; }
      var run = t.closest('#dc-run');
      if (run) {
        var card = currentCard();
        if (card && card.run && window.CC_APP) {
          window.CC_APP.runInShell(card.run);
          run.textContent = '▶ 再跑一遍';
        }
        return;
      }
      var g = t.closest('[data-grade]');
      if (g) { answer(g.getAttribute('data-grade')); return; }
    });

    /* 把自己登记为"当前实例"，键盘事件由 boot 里那个唯一监听转发过来 */
    drillActive = {
      key: function (k) {
        if (k === ' ' || k === 'Enter') { if (!flipped) flip(); return; }
        if (!flipped) return;
        if (k === '1') answer('again');
        else if (k === '2') answer('hard');
        else if (k === '3') answer('good');
      },
      flip: flip,
      answer: answer,
      state: function () { return { idx: idx, done: doneCount, total: total, flipped: flipped }; }
    };

    paint();
  }

  /* 键盘只在 boot 里注册一次，转发给当前实例 —— 见 drillActive 的注释 */
  function bindDrillKeys() {
    document.addEventListener('keydown', function (e) {
      if (!drillActive) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ([' ', 'Enter', '1', '2', '3'].indexOf(e.key) === -1) return;
      e.preventDefault();
      drillActive.key(e.key);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
