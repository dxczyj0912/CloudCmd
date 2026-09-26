/* ==========================================================================
   assets/js/router.js · hash 路由
   #/                      首页
   #/c/<catId>             分类列表
   #/c/<catId>/<cmdId>     分类列表并展开某条命令
   #/cmd/<cmdId>           命令独立详情页
   #/search?q=xxx          搜索结果
   #/favorites             我的收藏
   #/roadmap               学习路线图
   #/cheat                 故障速查
   #/practice[/<lessonId>]  实时练习 → 交给独立的练习平台 academy-lab.html
   ========================================================================== */
(function () {
  'use strict';

  /* ── 实时练习已经搬到独立页面 academy-lab.html（左终端 + 右讲义的实验台）。
        主站这边只保留入口：命中 #/practice 或 #/practice/<id> 就整页跳过去，
        课程 id 带过去（academy-lab 用 #/lab/<id> 寻址）。 ── */
  var ACADEMY = 'academy-lab.html';
  var redirecting = false;

  function academyUrl(lessonId) {
    return ACADEMY + '#/lab/' + encodeURIComponent(lessonId || 'builtin-6-7');
  }

  function toAcademy(lessonId) {
    if (redirecting) return true;
    redirecting = true;
    window.location.replace(academyUrl(lessonId));
    return true;
  }

  /* 当前 hash 是不是练习路由？是就立刻整页跳到练习平台，返回 true。
     app.js 在 boot 与 hashchange 都先问它一句，命中就不渲染主站视图。 */
  function academyRedirect() {
    var loc = parse(window.location.hash);
    if (loc.name !== 'practice') return false;
    return toAcademy(loc.lessonId ? 'cc-' + loc.lessonId : '');
  }

  function parse(hash) {
    var raw = String(hash || '').replace(/^#/, '');
    if (!raw) return { name: 'home' };

    var qIdx = raw.indexOf('?');
    var query = {};
    if (qIdx !== -1) {
      var qs = raw.slice(qIdx + 1).split('&');
      for (var i = 0; i < qs.length; i++) {
        if (!qs[i]) continue;
        var kv = qs[i].split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      }
      raw = raw.slice(0, qIdx);
    }

    var parts = raw.split('/').filter(function (p) { return p !== ''; });

    if (!parts.length) return { name: 'home' };
    if (parts[0] === 'c') return { name: 'category', catId: parts[1] || '', cmdId: parts[2] || '' };
    if (parts[0] === 'cmd') return { name: 'command', cmdId: parts[1] || '' };
    if (parts[0] === 'search') return { name: 'search', q: query.q || '' };
    if (parts[0] === 'favorites') return { name: 'favorites' };
    if (parts[0] === 'roadmap') return { name: 'roadmap' };
    if (parts[0] === 'cheat') return { name: 'cheat' };
    if (parts[0] === 'drill') return { name: 'drill' };
    /* 知识库：#/kb/<concepts|errors|versions|cert> */
    if (parts[0] === 'kb') return { name: 'kb', kind: parts[1] || 'concepts' };
    if (parts[0] === 'practice') {
      /* #/practice/c/<catId> = 某分类的练习列表（留在主站）
         #/practice[/<lessonId>] = 直接进练习平台 */
      if (parts[1] === 'c') return { name: 'practiceList', catId: parts[2] || '' };
      return { name: 'practice', lessonId: parts[1] || '' };
    }
    return { name: 'notfound' };
  }

  function resolve(loc) {
    var V = window.CC_VIEW;
    switch (loc.name) {
      case 'home':      return { html: V.viewHome(), active: '' };
      case 'category':  return { html: V.viewCategory(loc.catId, { openId: loc.cmdId }), active: loc.catId };
      case 'command':   return { html: V.viewCommand(loc.cmdId), active: '' };
      case 'search':    return { html: V.viewSearch(loc.q), active: '' };
      case 'favorites': return { html: V.viewFavorites(), active: '__favorites' };
      case 'roadmap':   return { html: V.viewRoadmap(), active: '__roadmap' };
      case 'cheat':     return { html: V.viewCheat(), active: '__cheat' };
      case 'drill':     return { html: V.viewDrill(), active: '__drill' };
      case 'kb':        return { html: V.viewKb(loc.kind), active: '__kb-' + loc.kind };
      case 'practiceList':
        return { html: window.CC_TERM.viewPracticeCards(loc.catId), active: loc.catId || '__practice' };
      case 'practice':
        /* 这里不会再渲染任何练习界面：整页交给 academy-lab.html */
        toAcademy(loc.lessonId ? 'cc-' + loc.lessonId : '');
        return { html: '<div class="empty-state"><b>正在打开练习平台…</b>' +
                       '<p>实时练习已经独立成页（左侧终端 + 右侧讲义）。' +
                       '如果浏览器没有自动跳转，请点 <a href="' + academyUrl(loc.lessonId ? 'cc-' + loc.lessonId : '') + '">这里</a>。</p></div>',
                 active: '__practice' };
      default:          return { html: V.viewNotFound('页面不存在'), active: '' };
    }
  }

  var current = null;

  function render() {
    var loc = parse(window.location.hash);
    current = loc;
    var out = resolve(loc);

    var main = document.getElementById('main');
    if (main) {
      main.innerHTML = out.html;
      main.scrollTop = 0;
    }
    window.scrollTo(0, 0);

    /* 高亮侧栏 */
    var nav = document.getElementById('nav');
    if (nav) nav.innerHTML = window.CC_VIEW.renderNav(out.active);

    /* 文档标题 */
    var titles = { home: '首页', roadmap: '学习路线图', cheat: '故障速查', favorites: '我的收藏', search: '搜索', practice: '实时练习', practiceList: '实时练习',
      kb: ({ concepts: '概念词典', errors: '报错速查', versions: '版本差异', cert: '认证对照' })[loc.kind] || '知识库' };
    var t = titles[loc.name] || (loc.name === 'category' ? (window.CC_CATS_META.byId(loc.catId) || {}).name : '') || '';
    document.title = (t ? t + ' · ' : '') + 'CloudCmd 云计算命令手册';

    /* 通知 app 层绑定交互 */
    document.dispatchEvent(new CustomEvent('cc:rendered', { detail: loc }));
  }

  window.CC_ROUTER = {
    parse: parse,
    render: render,
    current: function () { return current; },
    /** 练习平台地址（其他模块要做「去练习」链接时统一走这里） */
    academyUrl: academyUrl,
    /** hash 命中练习路由就整页跳走；返回是否已跳 */
    academyRedirect: academyRedirect,
    /** 分类页内联切换（同页状态变化，不重建视图） */
    go: function (hash) {
      if (window.location.hash === hash) render();
      else window.location.hash = hash;
    }
  };
})();
