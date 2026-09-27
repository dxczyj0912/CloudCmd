/* ==========================================================================
   assets/js/render.js · 视图渲染层
   只负责"数据 → HTML 字符串"与视图级交互绑定，不关心路由
   ========================================================================== */
(function () {
  'use strict';

  var LEVEL_NAMES = { 1: '入门', 2: '进阶', 3: '高级', 4: '专家' };

  /* ---------------- 基础工具 ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 行内标记：`code` → <code>，**粗体** → <strong>
     先抽出代码片段再做粗体，避免星号出现在代码里被误处理 */
  var CODE_SLOT = '\u0000C';
  function mdInline(s) {
    var codes = [];
    var out = esc(s).replace(/`([^`]+)`/g, function (m, code) {
      codes.push(code);
      return CODE_SLOT + (codes.length - 1) + '\u0000';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(new RegExp(CODE_SLOT + '(\\d+)\u0000', 'g'), function (m, i) {
      return '<code class="inline-code">' + codes[Number(i)] + '</code>';
    });
    return out;
  }

  /* 把查询词在原文本里高亮（大小写不敏感，保留原文大小写） */
  function hl(text, q) {
    var out = esc(text);
    if (!q || q.length < 2) return out;
    var t = String(text);
    var tl = t.toLowerCase(), ql = q.toLowerCase();
    var pos = tl.indexOf(ql);
    if (pos === -1) return out;
    var res = '', i = 0;
    while (pos !== -1) {
      res += esc(t.slice(i, pos)) + '<mark>' + esc(t.slice(pos, pos + ql.length)) + '</mark>';
      i = pos + ql.length;
      pos = tl.indexOf(ql, i);
    }
    res += esc(t.slice(i));
    return res;
  }

  var ICONS = {
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 012-2h8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    starOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function levelBadge(lv) {
    lv = Math.min(Math.max(lv || 1, 1), 4);
    return '<span class="badge lv' + lv + '">L' + lv + ' ' + LEVEL_NAMES[lv] + '</span>';
  }

  function codeBlock(cmd, opts) {
    opts = opts || {};
    var label = opts.label || 'bash';
    var head = opts.head === false ? '' :
      '<div class="code-head"><span class="lang">' + esc(label) + '</span>' +
      '<button class="copy-btn" type="button" data-copy="' + esc(cmd) + '">' +
      ICONS.copy + '<span>复制</span></button></div>';
    return '<div class="code' + (opts.head === false ? ' single' : '') + '">' + head +
           '<pre><code>' + esc(cmd) + '</code></pre></div>';
  }

  /* 计数：某分类当前实际命令数 */
  function countOf(catId) {
    return (window.CC_DATA[catId] || []).length;
  }

  function totalCount() {
    var n = 0;
    for (var k in window.CC_DATA) {
      if (Object.prototype.hasOwnProperty.call(window.CC_DATA, k)) n += window.CC_DATA[k].length;
    }
    return n;
  }

  /* ---------------- 侧栏导航 ---------------- */

  function renderNav(activeCatId) {
    var meta = window.CC_CATS_META;
    if (!meta) return '';
    var html = '';

    html += '<div class="nav-group">' +
      navLink('#/drill', '🎴', '每日一练', (window.CC_DRILL ? window.CC_DRILL.stats().due : '') || '', activeCatId === '__drill') +
      navLink('#/practice', '⌨️', '实时练习', (window.CC_LESSONS || []).length || '', activeCatId === '__practice') +
      navLink('#/', '🗺️', '学习路线图', '', activeCatId === '__roadmap') +
      navLink('#/cheat', '🚑', '故障速查', window.CC_CHEAT ? window.CC_CHEAT.length : '', activeCatId === '__cheat') +
      '</div>';

    /* 知识库：命令手册之外的"为什么 / 报错在说什么 / 版本差异 / 认证缺口" */
    var kbCount = function (g) { return (window[g] || []).length; };
    html += '<div class="nav-group"><div class="nav-group-title">知识库</div>' +
      navLink('#/kb/concepts', '📖', '概念词典', kbCount('CC_CONCEPTS') || '', activeCatId === '__kb-concepts') +
      navLink('#/kb/errors', '🧯', '报错速查', kbCount('CC_ERRORS') || '', activeCatId === '__kb-errors') +
      navLink('#/kb/versions', '🔀', '版本差异', kbCount('CC_VERSIONS') || '', activeCatId === '__kb-versions') +
      navLink('#/kb/cert', '🎓', '认证对照', kbCount('CC_CERT') || '', activeCatId === '__kb-cert') +
      '</div>';
    html += '<div class="nav-group">' +
      navLink('#/favorites', '⭐', '我的收藏', window.CC_STORE.favoritesCount() || '', activeCatId === '__favorites') +
      '</div>';

    for (var d = 0; d < meta.domainOrder.length; d++) {
      var domain = meta.domainOrder[d];
      var rows = '';
      for (var i = 0; i < meta.list.length; i++) {
        var cat = meta.list[i];
        if (cat.domain !== domain) continue;
        var n = countOf(cat.id);
        var soon = cat.status !== 'ready' || n === 0;
        rows += navLink(
          soon ? '#' : '#/c/' + cat.id,
          cat.icon, cat.name,
          soon ? '待上线' : String(n),
          activeCatId === cat.id,
          soon
        );
      }
      if (rows) {
        html += '<div class="nav-group"><div class="nav-group-title">' + esc(domain) + '</div>' + rows + '</div>';
      }
    }
    return html;
  }

  function navLink(href, icon, name, count, active, soon) {
    var cls = 'nav-link' + (active ? ' active' : '') + (soon ? ' soon' : '');
    var countHtml = count === '' ? '' :
      '<span class="nav-count">' + esc(count) + '</span>';
    return '<a class="' + cls + '" href="' + href + '"' + (soon ? ' aria-disabled="true"' : '') + '>' +
      '<span class="nav-icon">' + icon + '</span>' +
      '<span class="nav-name">' + esc(name) + '</span>' + countHtml + '</a>';
  }

  function renderProgress() {
    var total = totalCount();
    var done = window.CC_STORE.masteredCount();
    var pct = total ? Math.round(done / total * 100) : 0;
    return '<div class="progress-head"><span>学习进度</span><b>' + done + ' / ' + total + '</b></div>' +
      '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
  }

  /* ---------------- 首页 ---------------- */

  function viewHome() {
    var meta = window.CC_CATS_META;
    var total = totalCount();
    var readyCats = 0;
    for (var i = 0; i < meta.list.length; i++) {
      if (countOf(meta.list[i].id) > 0) readyCats++;
    }

    var html = '';
    html += '<div class="wrap">';
    html += '<div class="hero">' +
      '<div class="hero-kicker">CLOUDCMD · 随查随练</div>' +
      '<h1>学云计算，从敲对第一条命令开始</h1>' +
      '<p>云计算命令按知识体系整理，查得到、敲得动。离线可用，示例可复制，练习有即时反馈。</p>' +
      '<div class="hero-cta">' +
      '<a class="btn-primary" href="#/practice">⌨️ 进实时练习终端</a>' +
      (function () {
        /* 每日一练的入口只在真有卡片时才出现 —— 点了进空页面比没有入口更糟 */
        var n = window.CC_DRILL ? window.CC_DRILL.all().length : 0;
        if (!n) return '';
        return '<a class="btn-ghost hero-drill" href="#/drill">每日一练</a>';
      })() +
      '</div>' +
      '<p class="hero-cta-note">' + (window.CC_LESSONS || []).length + ' 个实战场景 · ' +
      (window.CC_DRILL && window.CC_DRILL.all().length
        ? window.CC_DRILL.all().length + ' 张复习卡'
        : '敲完立刻看到输出') + '</p>' +
      '<div class="hero-stats">' +
      '<div class="hero-stat"><b>' + readyCats + '</b><span>已上线分类</span></div>' +
      '<div class="hero-stat"><b>' + total + '</b><span>条命令</span></div>' +
      '<div class="hero-stats-sep"></div>' +
      '<div class="hero-stat"><b>' + window.CC_STORE.masteredCount() + '</b><span>已掌握</span></div>' +
      '<div class="hero-stat"><b>' + window.CC_STORE.favoritesCount() + '</b><span>已收藏</span></div>' +
      '</div>' +
      '</div>';

    /* 按领域分组展示分类卡片 */
    for (var d = 0; d < meta.domainOrder.length; d++) {
      var domain = meta.domainOrder[d];
      var cards = '';
      for (var j = 0; j < meta.list.length; j++) {
        var cat = meta.list[j];
        if (cat.domain !== domain) continue;
        var n = countOf(cat.id);
        var soon = n === 0;
        var doneN = 0, list = window.CC_DATA[cat.id] || [];
        for (var k = 0; k < list.length; k++) {
          if (window.CC_STORE.isMastered(list[k].id)) doneN++;
        }
        var pct = n ? Math.round(doneN / n * 100) : 0;

        cards += '<a class="cat-card' + (soon ? ' soon' : '') + '" href="' +
          (soon ? '#' : '#/c/' + cat.id) + '">' +
          '<span class="cat-card-top"><span class="emoji">' + cat.icon + '</span>' +
          '<strong>' + esc(cat.name) + '</strong>' +
          '<span class="count">' + (soon ? '待上线' : n + ' 条') + '</span></span>' +
          '<p>' + esc(cat.tagline || '') + '</p>' +
          (soon ? '' : '<span class="cat-bar"><i style="width:' + pct + '%"></i></span>') +
          '</a>';
      }
      if (cards) {
        html += '<h2 class="section-title">' + esc(domain) + '</h2><div class="grid">' + cards + '</div>';
      }
    }

    html += '<h2 class="section-title">快捷键</h2>' +
      '<div class="kbd-list">' +
      '<div><kbd>/</kbd> 或 <kbd>Ctrl</kbd>+<kbd>K</kbd><span>聚焦搜索框</span></div>' +
      '<div><kbd>Esc</kbd><span>清空搜索 / 收起当前展开的命令</span></div>' +
      '<div><kbd>Enter</kbd><span>跳转到搜索结果第一条</span></div>' +
      '</div>';

    html += '</div>';
    return html;
  }

  /* ---------------- 分类列表页 ---------------- */

  function viewCategory(catId, opts) {
    opts = opts || {};
    var cat = window.CC_CATS_META.byId(catId);
    if (!cat) return viewNotFound('分类不存在');
    var list = (window.CC_DATA[catId] || []).slice();

    if (!list.length) {
      return '<div class="wrap"><div class="page-head"><h1>' + cat.icon + ' ' + esc(cat.name) + '</h1></div>' +
        '<div class="empty"><span class="big">🚧</span><p>这个分类还在整理中，计划在 Phase 2 上线。</p></div></div>';
    }

    /* 排序：默认按原始顺序（作者编排顺序，由易到难），可选按难度/字母 */
    var sortBy = opts.sort || 'default';
    if (sortBy === 'level') {
      list.sort(function (a, b) { return (a.level || 1) - (b.level || 1) || (a.name < b.name ? -1 : 1); });
    } else if (sortBy === 'name') {
      list.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    }

    var html = '<div class="wrap">';
    html += breadcrumb([['#/', '首页'], [null, cat.name]]);
    html += '<div class="page-head"><div class="page-head-row">' +
      '<h1><span class="emoji">' + cat.icon + '</span>' + esc(cat.name) + '</h1>' +
      practiceEntry(catId) +
      '</div><div class="page-sub">' + esc(cat.tagline || '') + '　·　共 ' + list.length + ' 条命令</div></div>';

    html += '<div class="toolbar" data-cat="' + esc(catId) + '">' +
      '<span class="toolbar-label">难度</span>' +
      '<div class="seg" data-filter="level">' +
      segBtn('all', '全部', true) + segBtn('1', 'L1') + segBtn('2', 'L2') +
      segBtn('3', 'L3') + segBtn('4', 'L4') +
      '</div>' +
      '<span class="toolbar-label">排序</span>' +
      '<select data-sort>' +
      selOpt('default', '默认（推荐顺序）', sortBy) +
      selOpt('level', '按难度', sortBy) +
      selOpt('name', '按名称', sortBy) +
      '</select>' +
      '<span class="toolbar-spacer"></span>' +
      '<label class="chk"><input type="checkbox" data-only-todo> 只看未掌握</label>' +
      '<button class="icon-btn" type="button" data-expand-all aria-label="展开全部" title="展开全部">⤢</button>' +
      '</div>';

    html += '<div class="cmd-list" id="cmd-list">';
    for (var i = 0; i < list.length; i++) {
      html += cmdCard(list[i], cat, { open: opts.openId === list[i].id });
    }
    html += '</div>';
    html += '<div class="empty" id="filter-empty" hidden><span class="big">🔍</span><p>当前筛选条件下没有命令。</p></div>';
    html += '</div>';
    return html;
  }

  function segBtn(val, label, active) {
    return '<button type="button" data-lv="' + val + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + label + '</button>';
  }
  function selOpt(val, label, cur) {
    return '<option value="' + val + '"' + (val === cur ? ' selected' : '') + '>' + label + '</option>';
  }

  /* 分类页标题右侧的「实时练习」入口：
     有练习就进该分类的练习列表（#/practice/c/<catId>），没有就说明还在整理 */
  function practiceEntry(catId) {
    var lessons = (window.CC_LESSONS || []).filter(function (l) { return l.cat === catId; });
    if (!lessons.length) {
      return '<span class="practice-entry is-soon" title="这个分类的练习还在整理中">' +
        '<span class="pe-icon">⌨️</span><span class="pe-text"><b>实时练习</b><small>整理中</small></span></span>';
    }
    var steps = 0, done = 0;
    lessons.forEach(function (l) {
      var st = window.CC_TERM ? window.CC_TERM.stepsOf(l.id) : (l.steps || []);
      steps += st.length;
      if (window.CC_STORE.isLessonDone(l.id)) done++;
    });
    return '<a class="practice-entry" href="#/practice/c/' + esc(catId) + '" title="一步一步复习这个分类">' +
      '<span class="pe-icon">⌨️</span>' +
      '<span class="pe-text"><b>实时练习</b><small>' + lessons.length + ' 个场景 · ' + steps + ' 步' +
      (done ? ' · 已完成 ' + done + '/' + lessons.length : '') + '</small></span>' +
      '<span class="pe-go" aria-hidden="true">→</span></a>';
  }

  /* ---------------- 命令卡片 ---------------- */

  function cmdCard(cmd, cat, opts) {
    opts = opts || {};
    var open = !!opts.open;
    var mastered = window.CC_STORE.isMastered(cmd.id);
    var fav = window.CC_STORE.isFavorite(cmd.id);

    var h = '<article class="cmd-card' + (open ? ' open' : '') + (mastered ? ' mastered' : '') +
      '" id="cmd-' + esc(cmd.id) + '" data-id="' + esc(cmd.id) + '" data-level="' + (cmd.level || 1) + '">';

    /* 头部 */
    h += '<header class="cmd-head" data-toggle>' +
      '<div class="cmd-head-main">' +
      '<div class="cmd-name-row"><span class="cmd-name">' + esc(cmd.name) + '</span>' + levelBadge(cmd.level) + '</div>' +
      '<div class="cmd-summary">' + mdInline(cmd.summary) + '</div>' +
      '</div>' +
      '<div class="cmd-head-actions">' +
      '<button class="star-btn' + (fav ? ' on' : '') + '" type="button" data-fav="' + esc(cmd.id) + '" ' +
      'aria-label="收藏" title="收藏">' + (fav ? ICONS.starOn : ICONS.star) + '</button>' +
      '<button class="icon-btn" type="button" data-toggle aria-label="展开详情" title="展开详情">' +
      '<span style="display:inline-flex;transition:transform .18s' + (open ? ';transform:rotate(90deg)' : '') + '">' +
      ICONS.chevron + '</span></button>' +
      '</div></header>';

    /* 详情体 */
    h += '<div class="cmd-body"' + (open ? '' : ' hidden') + '>';
    h += cmdDetail(cmd, cat);
    h += '</div>';

    h += '</article>';
    return h;
  }

  /* 命令详情（分类页内嵌 & 独立详情页共用） */
  /* 一条命令在当前模拟终端里的可执行状态 → 一段提示 HTML（能跑则返回空串）。
     三种情况分开说，不合并成一句含糊的"部分支持"：
       · 跑得了          → 不提示（默认就是能跑）
       · 跑不了但有原因  → 说明原因（引擎的 NOT_IMPL 表里就是为此写的文案）
       · 跑不了且没登记  → 老实说"未实现"，并提示可以用真机验证

     ⚠️ 必须先把"不是命令的条目"排除掉。手册里有一批条目名是 **SQL 关键字 / K8s 对象 /
     产品名 / 中文概念**（`SHOW`、`EXPLAIN`、`Pod 与 Service`、`LVM`、`Jenkins`、
     `AK/SK`、`华为云`…），它们本来就不是 shell 命令。
     早先按"首词不在实现表里就提示"，会给这些条目也挂上"这条命令跑不了" ——
     又是一次假阳性。判据改成：**首词得像一条命令**（全小写 ASCII 字母开头、
     不含空格与中文）才提示。 */
  function runnability(cmd) {
    var name = cmd && cmd.name;
    var head = String(name || '').trim().split(/\s+/)[0];
    if (!head) return '';
    var impl = (window.CC_SHELL && window.CC_SHELL.commands) || [];
    if (impl.indexOf(head) !== -1) return '';
    /* 不像命令名的（大写缩写、中文、含路径分隔符的产品名）一律不提示 */
    if (!/^[a-z][a-z0-9._+-]*$/.test(head)) return '';
    if (head.length < 2) return '';
    /* ⚠️⚠️ 第二道防假阳性：手册里有一批条目**根本不是命令** ——
       Ansible 模块与关键字（`copy`/`template`/`when`/`register`/`handlers`/`become`）、
       Terraform 关键字（`region`/`variable`/`locals`/`count`/`depends_on`）、
       配置文件（`daemon.json`/`compose.yaml`/`values.yaml`/`haproxy.cfg`/`journald.conf`）、
       sysctl 键（`net.core.somaxconn`）、监控视图（`pg_stat_activity`）、
       systemd unit / cron 字段这类"概念条目"。
       它们的 `name` 恰好也是小写 ASCII，于是会被前一道判据放行，
       然后在页面上挂一句"这条命令在模拟终端里跑不了" —— 又一次假阳性（实测 42 条）。
       最终判据用**数据自己说话**：`syntax` 的首词必须与 `name` 的首词一致，
       才说明这条记录描述的是一条命令行（`tree [选项] [目录]` ✓；
       `region = "cn-north-4"` ✗、`- ansible.builtin.copy: {...}` ✗）。 */
    var syn = String((cmd && cmd.syntax) || '').trim();
    if (!syn) return '';
    if (syn.split(/\s+/)[0] !== head) return '';
    /* 判据（先剥掉引号内容，避免 JSON 参数里的 `{` 误伤 hcloud 这类真命令；
       再剥掉 `#` 注释，避免 `client_max_body_size <大小>;   # 可写在 http 块`
       这种"syntax 里带说明注释"的配置条目漏网）：
         · 含块语法 `{`      → 配置块
         · 以 `;` 结尾       → 配置语句 / SQL
       已实现的命令不受影响 —— 本函数对它们在前面就返回了。 */
    var bare = '';
    var q = null;
    for (var si = 0; si < syn.length; si++) {
      var sc = syn.charAt(si);
      if (q) { if (sc === '\\') { si++; continue; } if (sc === q) q = null; continue; }
      if (sc === '"' || sc === "'") { q = sc; continue; }
      bare += sc;
    }
    bare = bare.replace(/#[^\n]*/g, '').replace(/\s+$/, '');
    if (bare.indexOf('{') !== -1) return '';
    if (/;\s*$/.test(bare)) return '';
    var reasons = (window.CC_SHELL && window.CC_SHELL.notImplemented) || [];
    var reason = null;
    if (reasons.indexOf(head) !== -1 && window.CC_SHELL.notImplementedReason) {
      reason = window.CC_SHELL.notImplementedReason(head);
    }
    return '<div class="sim-note">' +
      '<span class="sim-note-tag">仅真机</span>' +
      '<span class="sim-note-text">这条命令在**本站模拟终端**里跑不了 —— ' +
      (reason ? mdInline(reason) : '教学环境没有实现它（`' + esc(head) + '`），请在真机上验证。') +
      ' 本站模拟终端只覆盖能在浏览器里安全复现的部分，跑不了的命令我们**不假装成功**。</span>' +
      '</div>';
  }

  function cmdDetail(cmd, cat) {
    var h = '';

    /* 模拟终端能不能跑 —— 放在最前面说清楚。
       这是「未实现命令诚实提示」的落点：学员在点开一条命令时就知道它能不能在
       本站的模拟终端里演练；不能跑的**说明原因**（真实网络 / 内核操作 / 需要软件源…），
       而不是让他照着敲一遍、拿到一句光秃秃的 command not found 再自己猜。
       判据只有一条：命令名首词在窗口 CC_SHELL.commands 里就是能跑。 */
    var runNote = runnability(cmd);
    if (runNote) h += runNote;

    /* 语法 */
    h += '<div class="block"><div class="block-title">语法</div>' +
      codeBlock(cmd.syntax, { label: 'syntax' }) + '</div>';

    /* 说明 */
    if (cmd.desc) {
      h += '<div class="block"><div class="block-title">说明</div>' +
        '<p style="font-size:13.5px;color:var(--text-dim)">' + mdInline(cmd.desc) + '</p></div>';
    }

    /* 常用参数 */
    if (cmd.params && cmd.params.length) {
      h += '<div class="block"><div class="block-title">常用参数</div>' +
        '<table class="param-table"><thead><tr><th>参数</th><th>说明</th></tr></thead><tbody>';
      for (var i = 0; i < cmd.params.length; i++) {
        h += '<tr><td>' + esc(cmd.params[i].flag) + '</td><td>' + mdInline(cmd.params[i].desc) + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }

    /* 示例 */
    if (cmd.examples && cmd.examples.length) {
      h += '<div class="block"><div class="block-title">示例</div>';
      for (var e = 0; e < cmd.examples.length; e++) {
        var ex = cmd.examples[e];
        h += '<div class="ex">';
        if (ex.desc) h += '<div class="ex-desc"><b>' + (e + 1) + '.</b>' + mdInline(ex.desc) + '</div>';
        h += codeBlock(ex.cmd, { label: 'bash' });
        h += '</div>';
      }
      h += '</div>';
    }

    /* 注意事项 */
    if (cmd.notes && cmd.notes.length) {
      h += '<div class="block"><div class="block-title">注意事项</div><ul class="notes">';
      for (var n = 0; n < cmd.notes.length; n++) h += '<li>' + mdInline(cmd.notes[n]) + '</li>';
      h += '</ul></div>';
    }

    /* 标签 */
    if (cmd.tags && cmd.tags.length) {
      h += '<div class="block"><div class="block-title">标签</div><div class="related">';
      for (var t = 0; t < cmd.tags.length; t++) {
        h += '<a href="#/search?q=' + encodeURIComponent(cmd.tags[t]) + '">' + esc(cmd.tags[t]) + '</a>';
      }
      h += '</div></div>';
    }

    /* 相关命令 */
    if (cmd.related && cmd.related.length) {
      var links = '';
      for (var r = 0; r < cmd.related.length; r++) {
        var rid = cmd.related[r];
        var hit = window.CC_SEARCH.get(rid);
        if (hit) {
          links += '<a href="#/cmd/' + esc(rid) + '">' + esc(hit.cmd.name) + '</a>';
        } else {
          links += '<span class="badge tag">' + esc(rid) + '</span>';
        }
      }
      h += '<div class="block"><div class="block-title">相关命令</div><div class="related">' + links + '</div></div>';
    }

    /* 学习链路：命令详情是最稳定的汇合点，反向接回课程、复习卡和故障剧本。 */
    var linkedLessons = (window.CC_LESSONS || []).filter(function (lesson) {
      return (lesson.steps || []).some(function (step) { return step.ref === cmd.id; });
    });
    var linkedCards = (window.CC_CARDS || []).filter(function (card) {
      return (card.cmdIds || []).indexOf(cmd.id) !== -1;
    });
    var linkedCheats = (window.CC_CHEAT || []).filter(function (cheat) {
      return (cheat.cmdIds || []).indexOf(cmd.id) !== -1;
    });
    if (linkedLessons.length || linkedCards.length || linkedCheats.length) {
      var learning = '';
      if (linkedLessons.length) {
        learning += '<div class="learning-group"><b>实时练习</b>';
        linkedLessons.slice(0, 6).forEach(function (lesson) {
          learning += '<a href="academy-lab.html#/lab/cc-' + encodeURIComponent(lesson.id) + '">' +
            esc(lesson.title || lesson.id) + '</a>';
        });
        if (linkedLessons.length > 6) learning += '<span class="learning-more">还有 ' + (linkedLessons.length - 6) + ' 节</span>';
        learning += '</div>';
      }
      if (linkedCards.length) {
        learning += '<div class="learning-group"><b>每日一练</b>';
        linkedCards.slice(0, 6).forEach(function (card) {
          learning += '<a href="#/drill?card=' + encodeURIComponent(card.id) + '">' +
            esc(card.front || card.id).slice(0, 42) + '</a>';
        });
        if (linkedCards.length > 6) learning += '<span class="learning-more">还有 ' + (linkedCards.length - 6) + ' 张</span>';
        learning += '</div>';
      }
      if (linkedCheats.length) {
        learning += '<div class="learning-group"><b>故障速查</b>';
        linkedCheats.slice(0, 4).forEach(function (cheat) {
          learning += '<a href="#/cheat">' + esc(cheat.title || cheat.name || cheat.id) + '</a>';
        });
        if (linkedCheats.length > 4) learning += '<span class="learning-more">还有 ' + (linkedCheats.length - 4) + ' 条</span>';
        learning += '</div>';
      }
      h += '<div class="block"><div class="block-title">学习链路</div><div class="learning-links">' + learning + '</div></div>';
    }

    /* 官方文档 */
    if (cmd.docs) {
      h += '<div class="block"><div class="block-title">官方文档</div>' +
        '<a href="' + esc(cmd.docs) + '" target="_blank" rel="noopener noreferrer">' +
        esc(cmd.docs) + '</a></div>';
    }

    /* 底部操作 */
    var mastered = window.CC_STORE.isMastered(cmd.id);
    var lv = cmd.level || 1;
    h += '<div class="detail-foot">' +
      '<button class="master-toggle' + (mastered ? ' on' : '') + '" type="button" data-master="' + esc(cmd.id) + '"' +
        ' aria-pressed="' + (mastered ? 'true' : 'false') + '"' +
        ' title="' + (mastered ? '已掌握 · 点击可取消标记' : '标记为已掌握，首页进度与「只看未掌握」筛选会同步') + '">' +
        '<span class="mt-ico" aria-hidden="true">' + ICONS.check + '</span>' +
        '<span class="mt-label">' + (mastered ? '已掌握' : '标记为已掌握') + '</span>' +
      '</button>' +
      '<span class="detail-foot-meta">' +
        (cat ? '<span class="badge cat">' + esc((cat.icon || '') + ' ' + cat.name) + '</span>' : '') +
        '<span class="badge lv' + lv + '">L' + lv + ' ' + esc(LEVEL_NAMES[lv] || '') + '</span>' +
      '</span>' +
      '</div>';

    return h;
  }

  /* ---------------- 命令独立详情页 ---------------- */

  function viewCommand(cmdId) {
    var hit = window.CC_SEARCH.get(cmdId);
    if (!hit) return viewNotFound('找不到这条命令');

    var list = window.CC_DATA[hit.catId] || [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === cmdId) { idx = i; break; } }
    var prev = idx > 0 ? list[idx - 1] : null;
    var next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

    var h = '<div class="wrap">';
    h += breadcrumb([['#/', '首页'], ['#/c/' + hit.catId, hit.catName], [null, hit.cmd.name]]);
    h += '<div class="page-head"><h1><span class="cmd-name" style="font-size:22px">' + esc(hit.cmd.name) + '</span>' +
      levelBadge(hit.cmd.level) + '</h1>' +
      '<div class="page-sub">' + mdInline(hit.cmd.summary) + '</div></div>';

    h += '<div class="cmd-card open" style="border-color:var(--accent)">' +
      '<div class="cmd-body" style="border-top:0">' + cmdDetail(hit.cmd, null) + '</div></div>';

    h += '<div class="detail-foot"><div class="pager">' +
      (prev ? '<a href="#/cmd/' + esc(prev.id) + '">← ' + esc(prev.name) + '</a>' : '') +
      (next ? '<a href="#/cmd/' + esc(next.id) + '">' + esc(next.name) + ' →</a>' : '') +
      '</div><a href="#/c/' + esc(hit.catId) + '">返回分类</a></div>';

    h += '</div>';
    return h;
  }

  /* ---------------- 搜索结果页 ---------------- */

  function viewSearch(q) {
    /* 长查询（自然语言式提问）启用分词回退，短查询保持精确匹配 */
    var useTokens = window.CC_SEARCH.norm(q).length >= 4;
    var results = window.CC_SEARCH.query(q, 120, { tokens: useTokens });
    var h = '<div class="wrap">';

    if (!q) {
      h += '<div class="page-head"><h1>搜索</h1></div>' +
        '<div class="empty"><span class="big">⌨️</span><p>输入关键字开始搜索，例如「端口转发」「磁盘满」「grep 反向匹配」「k8s 日志」。</p></div></div>';
      return h;
    }

    h += '<div class="page-head"><h1>搜索：' + esc(q) + '</h1></div>';
    h += '<div class="search-meta">找到 <b>' + results.length + '</b> 条结果' +
      (results.length >= 120 ? '（仅显示前 120 条，请缩小关键词）' : '') + '</div>';

    if (!results.length) {
      h += '<div class="empty"><span class="big">🤔</span><p>没有匹配的命令。试试更短的关键词，或者用英文命令名搜索。</p>' +
        '<p style="margin-top:10px"><a href="#/">← 回到首页按分类浏览</a></p></div></div>';
      return h;
    }

    h += '<div class="cmd-list">';
    for (var i = 0; i < results.length; i++) {
      /* 注意：CC_SEARCH.query 返回的是 {entry, score}，不是命令本身 */
      var e = results[i].entry;
      h += '<article class="cmd-card" data-id="' + esc(e.id) + '">' +
        '<a class="cmd-head" href="#/cmd/' + esc(e.id) + '" style="color:inherit">' +
        '<div class="cmd-head-main">' +
        '<div class="cmd-name-row"><span class="cmd-name">' + hl(e.name, q) + '</span>' +
        levelBadge(e.level) +
        '<span class="badge cat">' + e.catIcon + ' ' + esc(e.catName) + '</span></div>' +
        '<div class="cmd-summary">' + hl(e.summary, q) + '</div>' +
        '</div>' +
        '<div class="cmd-head-actions">' + ICONS.chevron + '</div>' +
        '</a></article>';
    }
    h += '</div></div>';
    return h;
  }

  /* ---------------- 收藏页 ---------------- */

  function viewFavorites() {
    var h = '<div class="wrap">';
    h += '<div class="page-head"><h1>⭐ 我的收藏</h1><div class="page-sub">收藏保存在本机；连接同步服务后会同步到配对设备。</div></div>';

    var ids = [], all = window.CC_SEARCH;
    /* 从索引里按收藏顺序取 */
    var found = [];
    for (var catId in window.CC_DATA) {
      if (!Object.prototype.hasOwnProperty.call(window.CC_DATA, catId)) continue;
      var list = window.CC_DATA[catId] || [];
      for (var i = 0; i < list.length; i++) {
        if (window.CC_STORE.isFavorite(list[i].id)) {
          found.push({ cmd: list[i], cat: window.CC_CATS_META.byId(catId) });
        }
      }
    }

    if (!found.length) {
      h += '<div class="empty"><span class="big">⭐</span><p>还没有收藏任何命令。在命令卡片右上角点星标即可收藏。</p></div></div>';
      return h;
    }

    h += '<div class="cmd-list">';
    for (var f = 0; f < found.length; f++) {
      h += cmdCard(found[f].cmd, found[f].cat, {});
    }
    h += '</div></div>';
    return h;
  }

  /* ---------------- 学习路线图 ---------------- */

  function stageReady(s) {
    var cats = s.catIds || [];
    return cats.some(function (cat) {
      return (window.CC_DATA[cat] || []).length > 0 &&
        (window.CC_LESSONS || []).some(function (l) { return l.cat === cat && (l.steps || []).length; });
    });
  }

  function viewRoadmap() {
    var stages = window.CC_ROADMAP || [];
    var h = '<div class="wrap">';
    h += '<div class="page-head"><h1>🗺️ 云计算学习路线图</h1>' +
      '<div class="page-sub">9 个阶段，从操作系统地基到云原生与可观测。每阶段给出目标、关键命令、实战项目与验收标准，' +
      '并直接标出这个阶段有多少内容、多少能在终端里演练。</div></div>';

    if (!stages.length) {
      h += '<div class="empty"><span class="big">🚧</span><p>路线图数据加载中…</p></div></div>';
      return h;
    }

    var recommended = null;
    for (var ri = 0; ri < stages.length; ri++) {
      if (stageReady(stages[ri]) && !window.CC_STORE.isStageDone(stages[ri].id)) { recommended = stages[ri]; break; }
    }
    if (recommended) {
      h += '<div class="roadmap-next"><b>下一步建议</b><span>先完成「' + esc(recommended.title) + '」的练习，再进入后续阶段。</span>' +
        '<a href="#stage-' + esc(recommended.id) + '" data-goto-stage="' + esc(recommended.id) + '">查看阶段 →</a></div>';
    }

    /* 综合实战入口：三节跨分类的实战课（各跨 3~6 个分类）。
       挂在路线图页顶部 —— 这一页回答的正是「我该学什么、学到什么程度」。
       为什么要有这个入口：单点课与故障剧本都不练「自己判断该往哪个方向查」，
       而综合实战正是补这一环的；没有入口的话学员根本不知道它存在。 */
    (function () {
      var caps = (window.CC_LESSONS || []).filter(function (l) {
        return String(l.id).indexOf('cap-') === 0;
      });
      if (!caps.length) return;
      var rows = caps.map(function (l) {
        var cats = {};
        (l.steps || []).forEach(function (st) {
          if (!st.ref) return;
          Object.keys(window.CC_DATA).forEach(function (c) {
            (window.CC_DATA[c] || []).forEach(function (r) { if (r.id === st.ref) cats[c] = 1; });
          });
        });
        var n = Object.keys(cats).length;
        return '<a class="cap-item" href="' + window.CC_ROUTER.academyUrl('cc-' + l.id) + '">' +
          '<span class="cap-title">' + esc(l.title) + '</span>' +
          '<span class="cap-meta">' + (l.steps || []).length + ' 步 · 跨 ' + n + ' 个分类</span>' +
          '<span class="cap-task">' + esc(l.task || '') + '</span>' +
          '<span class="cap-go">去做 →</span></a>';
      }).join('');
      h += '<div class="cap-box" id="cc-capstone">' +
        '<div class="cap-head"><b>🎯 综合实战</b>' +
        '<span>把多个分类串起来用 —— 真实问题不会告诉你该往哪个方向查。</span></div>' +
        '<div class="cap-list">' + rows + '</div></div>';
    })();

    /* 学习闭环：站内六块内容各自解决一个问题，按这个顺序用，才不会"学完就忘" */
    var loop = [
      { icon: '🗺️', name: '路线图', desc: '知道自己现在在哪一阶段', href: '#/' },
      { icon: '⌨️', name: '练习课', desc: '跟着步骤在模拟终端里敲，做对自动打勾', href: '#/practice' },
      { icon: '📖', name: '命令手册', desc: '离开课程后查参数、查等价写法', href: '#/c/linux-basic' },
      { icon: '💡', name: '渐进提示', desc: '卡住时先给思路、再给骨架，最后才是答案', href: '#/practice' },
      { icon: '🎴', name: '每日一练', desc: '按遗忘曲线复习，练的是"分诊"不是背命令', href: '#/drill' },
      { icon: '🧯', name: '知识库', desc: '概念为什么这样、报错在说什么、版本差异', href: '#/kb/concepts' }
    ];
    h += '<div class="loop-strip"><div class="loop-title">学习闭环：每一步都知道下一步去哪</div><div class="loop-items">';
    loop.forEach(function (it) {
      h += '<a class="loop-item" href="' + it.href + '"><b>' + it.icon + ' ' + esc(it.name) + '</b><span>' + esc(it.desc) + '</span></a>';
    });
    h += '</div></div>';

    h += '<div class="roadmap">';
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      var done = window.CC_STORE.isStageDone(s.id);
      var placeholder = !stageReady(s);
      var locked = !!(s.prereq && !window.CC_STORE.isStageDone(s.prereq));

      h += '<div class="stage' + (done ? ' done' : '') + '" data-stage="' + esc(s.id) + '">' +
        '<div class="stage-card"><div class="stage-head">' +
        '<span class="stage-no">阶段 ' + s.no + '</span>' +
        '<h3>' + (s.icon || '') + ' ' + esc(s.title) + '</h3>' +
        '<span class="stage-meta">' + esc(s.duration || '') + '</span>' +
        (placeholder ? '<span class="badge tag">内容整理中</span>' :
          '<button class="stage-done-btn' + (done ? ' on' : '') + '" type="button" data-stage-done="' + esc(s.id) + '">' +
          (done ? '✓ 已完成' : '标记完成') + '</button>') +
        '</div><div class="stage-body">';

      if (s.goal) h += '<div class="stage-sec"><h4>学习目标</h4><div class="stage-goal">' + mdInline(s.goal) + '</div></div>';

      /* 连贯性：这一阶段到底"有多少东西可学、多少能练"。
         以前只有目标与关键命令，学员看不出这个阶段的体量与缺口。 */
      var stat = stageStat(s);
      h += '<div class="stage-sec"><h4>这个阶段有什么</h4><div class="stage-stats">' +
        '<span>📚 <b>' + stat.lessons + '</b> 节课 / ' + stat.steps + ' 步</span>' +
        '<span>⌨️ <b>' + stat.cmds + '</b> 条命令，其中 <b>' + stat.runnable + '</b> 条可在终端演练</span>' +
        '<span>🎴 <b>' + stat.cards + '</b> 张练习卡</span>' +
        '<span>💡 步骤提示覆盖 <b>' + stat.hintPct + '%</b></span>' +
        '</div>';
      if (stat.first) {
        h += '<div class="stage-actions">' +
          '<a class="stage-start" href="' + window.CC_ROUTER.academyUrl('cc-' + stat.first.id) + '">从第一课开始：' + esc(stat.first.title) + ' →</a>' +
          '</div>';
      }
      h += '</div>';

      /* 知识库入口：这一阶段涉及的概念 / 报错 / 版本差异各有多少条。
         "为什么是这样"和"报错在说什么"和命令手册是两回事，
         以前学员得自己想到去侧栏找，现在从阶段卡片直接进。 */
      var kb = stageKbCounts(s);
      var kbLinks = '';
      if (kb.concepts) kbLinks += '<a href="#/kb/concepts">📖 概念词典（' + kb.concepts + '）</a>';
      if (kb.errors) kbLinks += '<a href="#/kb/errors">🧯 报错速查（' + kb.errors + '）</a>';
      if (kb.versions) kbLinks += '<a href="#/kb/versions">🔀 版本差异（' + kb.versions + '）</a>';
      if (kbLinks) h += '<div class="stage-sec"><h4>这个阶段的知识库</h4><div class="stage-links">' + kbLinks + '</div></div>';

      /* 前置阶段：让"顺序"变成可点的路径，而不是靠读者自己猜 */
      if (s.prereq) {
        var prev = null;
        for (var pi = 0; pi < stages.length; pi++) if (stages[pi].id === s.prereq) prev = stages[pi];
        if (prev) {
          h += '<div class="stage-sec"><h4>前置阶段</h4><div class="stage-links">' +
            '<a href="#stage-' + esc(prev.id) + '" data-goto-stage="' + esc(prev.id) + '">← 阶段 ' + prev.no + ' · ' + esc(prev.title) + (locked ? '（建议先完成）' : '') + '</a>' +
            '</div></div>';
        }
      }
      if (i + 1 < stages.length) {
        h += '<div class="stage-sec"><h4>下一阶段</h4><div class="stage-links">' +
          '<a href="#stage-' + esc(stages[i + 1].id) + '" data-goto-stage="' + esc(stages[i + 1].id) + '">阶段 ' + stages[i + 1].no + ' · ' + esc(stages[i + 1].title) + ' →</a>' +
          '</div></div>';
      }

      if (s.keys && s.keys.length) {
        h += '<div class="stage-sec"><h4>关键命令</h4><ul>';
        for (var k = 0; k < s.keys.length; k++) h += '<li>' + mdInline(s.keys[k]) + '</li>';
        h += '</ul></div>';
      }

      if (s.catIds && s.catIds.length) {
        var links = '';
        for (var c = 0; c < s.catIds.length; c++) {
          var cat = window.CC_CATS_META.byId(s.catIds[c]);
          if (cat && countOf(cat.id) > 0) {
            links += '<a href="#/c/' + esc(cat.id) + '">' + cat.icon + ' ' + esc(cat.name) + '（' + countOf(cat.id) + '）</a>';
          }
        }
        if (links) h += '<div class="stage-sec"><h4>对应分类</h4><div class="stage-links">' + links + '</div></div>';
      }

      if (s.project) h += '<div class="stage-sec"><h4>实战项目</h4><div class="stage-goal">' + mdInline(s.project) + '</div></div>';

      if (s.acceptance) {
        h += '<div class="stage-sec"><h4>项目交付与人工核验</h4><div class="stage-goal"><b>交付物：</b>' + esc(s.acceptance.artifact) + '</div><ul>';
        (s.acceptance.verify || []).forEach(function (item) { h += '<li>' + mdInline(item) + '</li>'; });
        h += '</ul></div>';
      }

      if (s.check && s.check.length) {
        h += '<div class="stage-sec"><h4>验收标准</h4><ul>';
        for (var ck = 0; ck < s.check.length; ck++) h += '<li>' + mdInline(s.check[ck]) + '</li>';
        h += '</ul></div>';
      }

      h += '</div></div></div>';
    }
    h += '</div></div>';
    return h;
  }

  /* 一个阶段里的内容体量：课程、步骤、可跑命令、卡片、提示覆盖率。
     路线图页用它把"连贯性"显示出来 —— 学员一眼能看到这个阶段有多少能练。 */
  function stageStat(s) {
    var cats = s.catIds || [];
    var impl = (window.CC_SHELL && window.CC_SHELL.commands) || [];
    var cmds = 0, runnable = 0, cards = 0;
    for (var i = 0; i < cats.length; i++) {
      var arr = window.CC_DATA[cats[i]] || [];
      cmds += arr.length;
      for (var j = 0; j < arr.length; j++) {
        var tok = String(arr[j].name).trim().split(/\s+/)[0];
        if (impl.indexOf(tok) !== -1) runnable++;
      }
    }
    cards = (window.CC_CARDS || []).filter(function (c) { return cats.indexOf(c.cat) !== -1; }).length;
    var lessons = (window.CC_LESSONS || []).filter(function (l) { return cats.indexOf(l.cat) !== -1; });
    var steps = 0, hinted = 0;
    lessons.forEach(function (l) {
      (l.steps || []).forEach(function (st) {
        steps++;
        if (st.hint && st.hint.length === 2) hinted++;
      });
    });
    return {
      cmds: cmds, runnable: runnable, cards: cards,
      lessons: lessons.length, steps: steps, hinted: hinted,
      hintPct: steps ? Math.round(hinted / steps * 100) : 0,
      first: lessons[0] || null
    };
  }

  /* 一个阶段相关的知识库条目数（按该阶段的分类过滤），
     用于在路线图上直接给出"为什么 / 报错 / 版本"的入口。 */
  function stageKbCounts(s) {
    var cats = s.catIds || [];
    function count(list) {
      var n = 0;
      (list || []).forEach(function (it) { if (cats.indexOf(it.cat) !== -1) n++; });
      return n;
    }
    return {
      concepts: count(window.CC_CONCEPTS),
      errors: count(window.CC_ERRORS),
      versions: count(window.CC_VERSIONS)
    };
  }

  /* ---------------- 故障速查 ---------------- */

  /* ---------------- 故障速查（故障剧本） ----------------

     每条是"一个现象 → 一条按排查顺序排好的命令链"。两个要点：
       · 链上每条命令尽量**点得进命令手册**（`cmdIds` 由 tools/wire-cheat.js 解析并校验），
         这样"照着链路一路敲下去"不是空话 —— 卡住哪一条就点进去看那一条；
       · 命令在**模拟终端里跑得了跑不了**要如实标出来。链路里本来就有
         `ssh`/`iptables`/`chroot` 这类真实网络与内核操作，
         标一个"仅真机"比让学员敲下去看到 command not found 诚实得多。 */
  function viewCheat() {
    var items = window.CC_CHEAT || [];
    var h = '<div class="wrap">';
    h += '<div class="page-head"><h1>🚑 故障速查</h1>' +
      '<div class="page-sub">按「现象」找「命令组合」。每条链路按排查顺序排列，' +
      '可以点进命令手册看细节；标「仅真机」的步骤在模拟终端里跑不了。</div></div>';

    if (!items.length) {
      h += '<div class="empty"><span class="big">🚧</span><p>速查数据加载中…</p></div></div>';
      return h;
    }

    var impl = (window.CC_SHELL && window.CC_SHELL.commands) || [];
    var notImpl = (window.CC_SHELL && window.CC_SHELL.notImplemented) || [];
    /* 手册里出现过的命令名（首词）——用来区分"真命令但没实现"与"shell 关键字" */
    var manualHeads = {};
    for (var mc in window.CC_DATA) {
      if (!Object.prototype.hasOwnProperty.call(window.CC_DATA, mc)) continue;
      var mArr = window.CC_DATA[mc] || [];
      for (var mi = 0; mi < mArr.length; mi++) {
        var mh = String(mArr[mi].name || '').trim().split(/\s+/)[0];
        if (mh) manualHeads[mh] = 1;
      }
    }
    var KW = { 'for': 1, 'if': 1, 'while': 1, 'until': 1, 'case': 1, 'do': 1, 'then': 1, 'else': 1, 'fi': 1, 'done': 1, 'esac': 1 };
    /* 一条链路步骤在模拟终端里的状态：
         note   —— `#` 开头的说明行，不是命令
         ok     —— 跑得了
         real   —— 跑不了，而且是**真命令**（要标「仅真机」）
       判据刻意排除 shell 关键字：`for h in …; do openssl …; done` 这种复合行的首词是
       `for`，它本身不是"跑不了的真机命令" —— 早先按"首词不在实现表里"一刀切，
       把两行完全跑得通的 for 循环也标成了「仅真机」。
       **一个会产生假阳性的标注，等于没有标注**（学员会学会无视它）。
       复合行改为检查行内有没有出现在 notImplemented 表里的真命令。 */
    function lineState(line) {
      var s = String(line).trim();
      if (!s.charAt(0) || s.charAt(0) === '#') return 'note';
      var head = s.split(/\s+/)[0];
      if (KW[head]) {
        var toks2 = s.split(/[\s;|&()]+/);
        for (var i2 = 0; i2 < toks2.length; i2++) if (notImpl.indexOf(toks2[i2]) !== -1) return 'real';
        return 'ok';
      }
      if (impl.indexOf(head) !== -1) return 'ok';
      var isRealCmd = manualHeads[head] || notImpl.indexOf(head) !== -1;
      return isRealCmd ? 'real' : 'ok';
    }
    /* 链上命令 → 条目 id：按出现顺序一一对应，由 wire-cheat.js 写入并校验 */
    function idForLine(it, line, seenIdx) {
      var ids = it.cmdIds || [];
      var head = String(line).trim().split(/\s+/)[0];
      var hit = null;
      for (var i = 0; i < ids.length; i++) {
        var rec = findCmd(ids[i]);
        if (rec && String(rec.name).trim().split(/\s+/)[0] === head) { hit = ids[i]; break; }
      }
      return hit;
    }
    function findCmd(id) {
      for (var c in window.CC_DATA) {
        if (!Object.prototype.hasOwnProperty.call(window.CC_DATA, c)) continue;
        var arr = window.CC_DATA[c] || [];
        for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
      }
      return null;
    }

    /* 按领域分组 */
    var groups = {}, order = [];
    for (var i = 0; i < items.length; i++) {
      var g = items[i].group || '通用';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(items[i]);
    }

    for (var o = 0; o < order.length; o++) {
      h += '<h2 class="section-title">' + esc(order[o]) + '</h2><div class="cheat">';
      var arr = groups[order[o]];
      for (var j = 0; j < arr.length; j++) {
        var it = arr[j];
        var chain = '';
        for (var c = 0; c < it.chain.length; c++) {
          var line = it.chain[c];
          if (c) chain += '<span class="arrow">→</span>';
          var st = lineState(line);
          var isNote = st === 'note';
          var id = isNote ? null : idForLine(it, line);
          var head = String(line).trim().split(/\s+/)[0];
          var cls = 'cheat-step';
          if (isNote) cls += ' is-note';
          else if (st === 'real') cls += ' not-runnable';
          var tip = isNote ? '这是说明，不是命令'
            : (st === 'real' ? '`' + head + '` 在模拟终端里跑不了（真实网络 / 内核操作），需要在真机上执行'
              : (id ? '点开命令手册：' + head : head + '（手册暂未收录）'));
          var inner = esc(line);
          if (id) inner = '<a href="#/cmd/' + id + '" title="' + esc(tip) + '">' + inner + '</a>';
          chain += '<span class="' + cls + '" title="' + esc(tip) + '">' + inner + '</span>' +
            (st === 'real' ? '<span class="cheat-tag">仅真机</span>' : '');
        }
        h += '<div class="cheat-card">' +
          '<h3><span class="sym">' + (it.sym || '🔧') + '</span>' + esc(it.title) + levelBadge(it.level) + '</h3>' +
          '<div class="cheat-chain">' + chain + '</div>' +
          (it.note ? '<div class="ex-desc" style="margin-top:8px">' + mdInline(it.note) + '</div>' : '') +
          '<div style="margin-top:8px">' + codeBlock(it.chain.join('  # → 然后\n'), { label: '排查链路' }) + '</div>' +
          '</div>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------------- 知识库（概念 / 报错 / 版本 / 认证对照） ----------------

     四块内容结构差别很大，但"列表 + 展开详情 + 按分类筛选"的壳是一样的，
     所以只写一个 viewKb(kind)，靠 KB_META 描述各自怎么渲染。
     数据分别是 window.CC_CONCEPTS / CC_ERRORS / CC_VERSIONS / CC_CERT。 */

  var KB_META = {
    concepts: { icon: '📖', nav: '概念词典', title: '📖 概念词典',
      sub: '命令手册解决「怎么敲」，这里解决「到底是什么、为什么是这样」。每条都带一个常见误解。',
      target: 'CC_CONCEPTS', empty: '概念数据加载中…' },
    errors: { icon: '🧯', nav: '报错速查', title: '🧯 报错速查',
      sub: '排障最难的不是「怎么修」，而是「这句英文在说什么」。按报错原文找含义、原因与排查命令。',
      target: 'CC_ERRORS', empty: '报错数据加载中…' },
    versions: { icon: '🔀', nav: '版本差异', title: '🔀 版本与弃用差异',
      sub: '同一件事，老版本和新版本写法不同 —— 这是「文档看着对、执行就报错」的头号来源。',
      target: 'CC_VERSIONS', empty: '版本数据加载中…' },
    cert: { icon: '🎓', nav: '认证对照', title: '🎓 认证与岗位对照',
      sub: '把站内内容对到真实认证大纲上，覆盖到什么程度、缺口在哪，一眼可见。',
      target: 'CC_CERT', empty: '认证数据加载中…' }
  };

  /* 命令条目索引：id → 记录。知识库与课程都要按 id 反查命令名。 */
  var CMD_INDEX = null;
  function cmdById(id) {
    if (!CMD_INDEX) {
      CMD_INDEX = {};
      for (var cat in window.CC_DATA) {
        if (!Object.prototype.hasOwnProperty.call(window.CC_DATA, cat)) continue;
        var arr = window.CC_DATA[cat] || [];
        for (var i = 0; i < arr.length; i++) CMD_INDEX[arr[i].id] = arr[i];
      }
    }
    return CMD_INDEX[id] || null;
  }

  /* 命令条目链接：找不到就退回纯文本，绝不产出死链 */
  function cmdChips(ids, label) {
    var list = ids || [];
    if (!list.length) return '';
    var h = '<div class="kb-refs"><span class="kb-refs-label">' + esc(label || '相关命令') + '</span>';
    for (var i = 0; i < list.length; i++) {
      var id = list[i];
      var rec = cmdById(id);
      if (rec) h += '<a class="kb-chip" href="#/cmd/' + encodeURIComponent(id) + '">' + esc(rec.name) + '</a>';
      else h += '<span class="kb-chip dim">' + esc(id) + '</span>';
    }
    return h + '</div>';
  }

  function lessonChips(ids) {
    var list = ids || [];
    if (!list.length) return '';
    var byId = {};
    (window.CC_LESSONS || []).forEach(function (l) { byId[l.id] = l; });
    var h = '<div class="kb-refs"><span class="kb-refs-label">相关课程</span>';
    for (var i = 0; i < list.length; i++) {
      var l = byId[list[i]];
      if (l) h += '<a class="kb-chip" href="' + window.CC_ROUTER.academyUrl('cc-' + l.id) + '">' + esc(l.title) + '</a>';
      else h += '<span class="kb-chip dim">' + esc(list[i]) + '</span>';
    }
    return h + '</div>';
  }

  function catChips(ids) {
    var list = ids || [];
    if (!list.length) return '';
    var meta = window.CC_CATS_META;
    var h = '<div class="kb-refs"><span class="kb-refs-label">对应分类</span>';
    for (var i = 0; i < list.length; i++) {
      var c = meta && meta.byId(list[i]);
      if (c) h += '<a class="kb-chip" href="#/c/' + encodeURIComponent(list[i]) + '">' + esc(c.icon + ' ' + c.name) + '</a>';
      else h += '<span class="kb-chip dim">' + esc(list[i]) + '</span>';
    }
    return h + '</div>';
  }

  function kbCard(kind, it) {
    var h = '<article class="kb-card" data-kb-id="' + esc(it.id) + '">';
    if (kind === 'concepts') {
      h += '<h3>' + esc(it.term) + (it.en ? '<span class="kb-en">' + esc(it.en) + '</span>' : '') + levelBadge(it.level) + '</h3>';
      h += '<p class="kb-oneline">' + mdInline(it.oneLine) + '</p>';
      h += '<div class="kb-body">' + mdInline(it.why) + '</div>';
      if ((it.confusion || []).length) {
        h += '<div class="kb-confusion"><div class="kb-sub">容易搞混的地方</div>';
        it.confusion.forEach(function (q) {
          h += '<div class="kb-qa"><div class="kb-q">Q：' + mdInline(q.q) + '</div><div class="kb-a">A：' + mdInline(q.a) + '</div></div>';
        });
        h += '</div>';
      }
      h += cmdChips(it.related) + lessonChips(it.lessons);
    } else if (kind === 'errors') {
      h += '<h3>' + esc(it.where || it.msg.slice(0, 30)) + '</h3>';
      h += codeBlock(it.msg, { label: '报错原文' });
      h += '<div class="kb-body"><span class="kb-sub">这句在说什么</span>' + mdInline(it.meaning) + '</div>';
      if ((it.causes || []).length) {
        h += '<div class="kb-sub">常见原因（按概率从高到低）</div><ol class="kb-causes">';
        it.causes.forEach(function (c) { h += '<li>' + mdInline(c) + '</li>'; });
        h += '</ol>';
      }
      if ((it.diagnose || []).length) h += codeBlock(it.diagnose.join('\n'), { label: '排查命令' });
      if (it.fix) h += '<div class="kb-body"><span class="kb-sub">怎么修</span>' + mdInline(it.fix) + '</div>';
      h += cmdChips(it.related);
    } else if (kind === 'versions') {
      h += '<h3>' + esc(it.topic) + '</h3>';
      h += '<div class="kb-diff"><div><span class="kb-sub old">老写法</span>' + codeBlock(it.then, { head: false }) + '</div>' +
           '<div><span class="kb-sub new">新写法</span>' + codeBlock(it.now, { head: false }) + '</div></div>';
      if (it.since) h += '<div class="kb-body kb-since">' + mdInline(it.since) + '</div>';
      h += '<div class="kb-body"><span class="kb-sub">为什么变</span>' + mdInline(it.why) + '</div>';
      h += '<div class="kb-body kb-risk"><span class="kb-sub">生产上踩到会怎样</span>' + mdInline(it.risk) + '</div>';
      h += cmdChips(it.related);
      if (it.docs) h += '<div class="kb-refs"><a class="kb-chip" href="' + esc(it.docs) + '" target="_blank" rel="noopener">官方文档 ↗</a></div>';
    } else if (kind === 'cert') {
      h += '<h3>' + esc(it.name) + '<span class="kb-en">' + esc(it.vendor) + '</span></h3>';
      if (it.note) h += '<p class="kb-oneline">' + mdInline(it.note) + '</p>';
      var sum = { high: 0, partial: 0, gap: 0 };
      (it.domains || []).forEach(function (d) { sum[d.covered] = (sum[d.covered] || 0) + 1; });
      h += '<div class="kb-cover"><span class="cover-high">覆盖较好 ' + sum.high + '</span>' +
           '<span class="cover-partial">部分覆盖 ' + sum.partial + '</span>' +
           '<span class="cover-gap">缺口 ' + sum.gap + '</span></div>';
      h += '<table class="kb-table"><thead><tr><th>知识域</th><th>权重</th><th>本站覆盖</th><th>说明</th></tr></thead><tbody>';
      (it.domains || []).forEach(function (d) {
        var label = { high: '✅ 较好', partial: '🟡 部分', gap: '⛔ 缺口' }[d.covered] || d.covered;
        h += '<tr><td>' + esc(d.name) + (d.catIds && d.catIds.length ? '<div class="kb-td-refs">' + catChips(d.catIds) + '</div>' : '') + '</td>' +
             '<td>' + esc(d.weight || '—') + '</td><td class="cov-' + esc(d.covered) + '">' + label + '</td>' +
             '<td>' + mdInline(d.note) + (d.lessons && d.lessons.length ? lessonChips(d.lessons) : '') + '</td></tr>';
      });
      h += '</tbody></table>';
    }
    return h + '</article>';
  }

  function viewKb(kind) {
    var meta = KB_META[kind] || KB_META.concepts;
    var items = window[meta.target] || [];
    var h = '<div class="wrap">';
    h += '<div class="page-head"><h1>' + esc(meta.title) + '</h1><div class="page-sub">' + esc(meta.sub) + '</div></div>';

    /* 同类导航 */
    h += '<div class="kb-tabs">';
    Object.keys(KB_META).forEach(function (k) {
      var m = KB_META[k];
      var n = (window[m.target] || []).length;
      h += '<a class="kb-tab' + (k === kind ? ' active' : '') + '" href="#/kb/' + k + '">' +
        m.icon + ' ' + esc(m.nav) + '<span class="nav-count">' + (n || '') + '</span></a>';
    });
    h += '</div>';

    if (!items.length) {
      h += '<div class="empty"><span class="big">🚧</span><p>' + esc(meta.empty) + '</p>' +
        '<p class="dim">（数据骨架已经就位，内容正在补：见 tools/kb-check.js 的目标条数）</p></div></div>';
      return h;
    }

    /* 按分类筛选 */
    var byCat = {}, order = [];
    items.forEach(function (it) {
      var c = it.cat || '__none';
      if (!byCat[c]) { byCat[c] = 0; order.push(c); }
      byCat[c]++;
    });
    var meta2 = window.CC_CATS_META;
    h += '<div class="kb-filter">';
    order.sort(function (a, b) { return byCat[b] - byCat[a]; }).forEach(function (c) {
      var cm = meta2 && meta2.byId(c);
      h += '<button type="button" class="kb-filter-btn" data-kb-cat="' + esc(c) + '">' +
        esc(cm ? cm.name : '通用') + '<span class="nav-count">' + byCat[c] + '</span></button>';
    });
    h += '</div>';

    h += '<div class="kb-list" id="kb-list">';
    items.forEach(function (it) { h += kbCard(kind, it); });
    h += '</div></div>';
    return h;
  }

  /* ---------------- 404 ---------------- */

  function viewNotFound(msg) {
    return '<div class="wrap"><div class="empty"><span class="big">🧭</span>' +
      '<p>' + esc(msg || '页面不存在') + '</p>' +
      '<p style="margin-top:10px"><a href="#/">← 回到首页</a></p></div></div>';
  }

  function breadcrumb(items) {
    var h = '<div class="breadcrumb">';
    for (var i = 0; i < items.length; i++) {
      if (i) h += '<span class="sep">/</span>';
      h += items[i][0] ? '<a href="' + items[i][0] + '">' + esc(items[i][1]) + '</a>' : esc(items[i][1]);
    }
    return h + '</div>';
  }

  /* ---------------- 每日一练 ---------------- */

  /* 卡片正面 / 背面共用的渲染。整张卡"翻面"由 app.js 切 .is-flipped 控制，
     这里只出内容、不做状态 —— 状态在 DOM 上，刷新页面就重置。 */
  function viewDrill(opts) {
    opts = opts || {};
    var h = '<div class="wrap drill-wrap">';
    h += '<div class="page-head"><h1>🎴 每日一练</h1>' +
      '<div class="page-sub">正面给现象，背面给命令和判据。把命令送进模拟终端跑一遍，比读十遍释义管用。' +
      '<br>这里的进度只表示"记住了没有"；<a href="#/practice">真实的动手进度看练习课</a>。</div></div>';

    var cards = window.CC_DRILL ? window.CC_DRILL.all() : [];
    if (!cards.length) {
      h += '<div class="empty"><span class="big">🎴</span><p>还没有卡片数据。</p></div></div>';
      return h;
    }

    /* #/drill?extra=1 表示"今天练完了，再要 5 张新卡" ——
       用 URL 表达而不是塞一个全局标志，这样刷新/分享都不会错乱 */
    var extraOnly = opts.extra === true || /[?&]extra=1/.test(String(location.hash));
    var q = window.CC_DRILL.buildQueue(extraOnly ? 5 : undefined, { freshOnly: extraOnly });
    if (!extraOnly && opts.cardId) {
      var requested = window.CC_DRILL.byId(opts.cardId);
      if (requested) {
        q.list = [requested].concat(q.list.filter(function (card) { return card.id !== requested.id; })).slice(0, q.roundLimit);
        q.roundLimit = q.list.length;
      }
    }
    var st = window.CC_DRILL.stats();

    /* 顶部状态条。⚠️ 刻意**不**显示"总掌握率"这种像成绩单的数字 —— 见 drill.js 顶部注释 */
    h += '<div class="drill-bar">' +
      '<div class="drill-stat"><b id="drill-done">0</b><span>本轮 / ' + q.roundLimit + ' 张</span></div>' +
      '<div class="drill-stat"><b id="drill-streak">' + (st.streak || 0) + '</b><span>连续天数</span></div>' +
      '<div class="drill-stat"><b>' + (st.dailyReviewed || 0) + '</b><span>今日累计</span></div>' +
      '<div class="drill-stat"><b>' + st.learned + '</b><span>已见过 / ' + st.cards + ' 张</span></div>' +
      '<div class="drill-stat"><b>' + st.due + '</b><span>今天到期</span></div>' +
      '</div>';

    if (!q.list.length) {
      var moreNew = window.CC_DRILL.extraQueue(1).length;
      h += '<div class="drill-done">' +
        '<div class="dd-emoji">✅</div>' +
        '<h2>' + (extraOnly ? '没有没见过的新卡了' : '今天的都练完了') + '</h2>' +
        '<p>' + esc(drillRestLine(st, q)) + '</p>' +
        '<div class="dd-actions">' +
        (moreNew ? '<a class="btn-ghost" href="#/drill?extra=1">再练 5 张新卡</a>' : '') +
        '<a class="btn-ghost" href="#/practice">去做练习课</a>' +
        '</div></div></div>';
      return h;
    }

    h += '<div class="drill-stage" id="drill-stage">' +
      '<div class="drill-progress"><span id="drill-progress-bar" style="width:0%"></span></div>' +
      '<div class="drill-card" id="drill-card" data-card="' + esc(q.list[0].id) + '">' +
      '<div class="dc-meta"><span class="dc-kind" id="dc-kind"></span><span class="dc-cat" id="dc-cat"></span>' +
      '<span class="dc-idx" id="dc-idx">1 / ' + q.list.length + '</span></div>' +
      '<div class="dc-face dc-front" id="dc-front"></div>' +
      '<div class="dc-face dc-back" id="dc-back"></div>' +
      '</div>' +
      '<div class="drill-actions" id="drill-actions"></div>' +
      '</div>';

    /* 队列以 JSON 塞进 DOM，app.js 读它 —— 避免把同一份状态复制两遍。
       ⚠️ `<script>` 的内容是 raw text，**不能做 HTML 转义**：
       转义成 &quot; 之后 JSON.parse 会直接抛错（踩过）。
       只需要防住 `</script>` 提前闭合，所以把 `<` 写成 \u003c。 */
    var queueJson = JSON.stringify(q.list.map(function (c) { return c.id; })).replace(/</g, '\\u003c');
    h += '<script type="application/json" id="drill-queue">' + queueJson + '<\/script>';

    h += '</div>';
    return h;
  }

  function drillRestLine(st, q) {
    if (q.remaining > 0) return '卡库里还有 ' + q.remaining + ' 张到期，明天继续。';
    if (st.learned < st.cards) return '还剩 ' + (st.cards - st.learned) + ' 张没见过的，明天会补进来。';
    return '全部卡片都在复习循环里了，明天见。';
  }

  window.CC_VIEW = {
    esc: esc, mdInline: mdInline, codeBlock: codeBlock, levelBadge: levelBadge,
    breadcrumb: breadcrumb,
    renderNav: renderNav, renderProgress: renderProgress,
    viewHome: viewHome, viewCategory: viewCategory, viewCommand: viewCommand,
    viewSearch: viewSearch, viewFavorites: viewFavorites,
    viewRoadmap: viewRoadmap, viewCheat: viewCheat, viewDrill: viewDrill, viewNotFound: viewNotFound,
    viewKb: viewKb,
    totalCount: totalCount, countOf: countOf
  };
})();
