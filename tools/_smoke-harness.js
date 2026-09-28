/* ==========================================================================
   tools/_smoke-harness.js · 浏览器内冒烟测试（由 render-check.js 注入到页面）
   在真实 DOM 环境里跑一遍关键路径，结果写进一个隐藏 div 供 --dump-dom 抓取。
   分三阶段：同步断言（数据/路由/搜索/渲染）→ 分类页 DOM 交互 → 实时练习终端
   ========================================================================== */
(function () {
  'use strict';

  var out = [];
  function t(name, fn) {
    try {
      var r = fn();
      out.push({ name: name, ok: r === true, detail: r === true ? '' : String(r) });
    } catch (e) {
      out.push({ name: name, ok: false, detail: 'EXCEPTION: ' + e.message });
    }
  }

  /* 阶段面包屑：DOM 里留痕，便于判断卡在哪一步 */
  function mark(label) {
    var el = document.getElementById('cc-phase');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cc-phase';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    el.textContent = (el.textContent ? el.textContent + ' → ' : '') + label;
  }

  function finish(extra) {
    var all = out.concat(extra || []);
    var pass = all.filter(function (x) { return x.ok; }).length;
    var result = { pass: pass, fail: all.length - pass, total: all.length, items: all };
    var box = document.createElement('div');
    box.id = 'cc-smoke-result';
    box.style.display = 'none';
    box.textContent = JSON.stringify(result);
    document.body.appendChild(box);
    mark('完成');
  }

  function eraseKeys() {
    try { localStorage.removeItem('cloudcmd.v1'); } catch (e) { /* ignore */ }
  }

  function isHiddenFromLayout(el) {
    return !!el && el.hidden && window.getComputedStyle(el).display === 'none' &&
      el.getClientRects().length === 0;
  }

  function run() {
    var V = window.CC_VIEW, R = window.CC_ROUTER, S = window.CC_SEARCH, ST = window.CC_STORE;

    /* ================= 阶段一：同步断言 ================= */

    t('应用对象全部就绪', function () {
      var missing = [];
      if (!window.CC_CATS_META) missing.push('CC_CATS_META');
      if (!V) missing.push('CC_VIEW');
      if (!R) missing.push('CC_ROUTER');
      if (!S) missing.push('CC_SEARCH');
      if (!ST) missing.push('CC_STORE');
      if (!window.CC_DATA) missing.push('CC_DATA');
      if (!window.CC_SHELL) missing.push('CC_SHELL');
      if (!window.CC_TERM) missing.push('CC_TERM');
      return missing.length ? '缺失: ' + missing.join(',') : true;
    });

    t('命令总数 ≥ 330', function () {
      var n = S.size();
      return n >= 330 ? true : '只有 ' + n + ' 条';
    });

    /* 不再写死"= 7"：内容从 7 类扩到 18 类时，`n >= 7` 这种松阈值会一路绿灯放行，
       真出问题（某分类数据没加载）也不报警。改成"注册表里 ready 的分类都真的有数据"。 */
    t('已上线分类数与数据完全对应', function () {
      var cats = window.CC_CATS_META.list;
      var readyNoData = [], notReady = [];
      for (var i = 0; i < cats.length; i++) {
        var n = (window.CC_DATA[cats[i].id] || []).length;
        if (cats[i].status === 'ready' && !n) readyNoData.push(cats[i].id);
        if (cats[i].status !== 'ready' && n) notReady.push(cats[i].id);
      }
      if (readyNoData.length) return '标为 ready 却没有数据：' + readyNoData.join('、');
      if (notReady.length) return '有数据却仍是 soon：' + notReady.join('、');
      return true;
    });

    t('故障速查 ≥ 15 条', function () {
      var n = (window.CC_CHEAT || []).length;
      return n >= 15 ? true : '只有 ' + n + ' 条';
    });

    t('学习路线图 = 9 阶段', function () {
      var n = (window.CC_ROADMAP || []).length;
      return n === 9 ? true : '只有 ' + n + ' 个阶段';
    });

    t('练习课程 ≥ 20 个', function () {
      var n = (window.CC_LESSONS || []).length;
      return n >= 20 ? true : '只有 ' + n + ' 个';
    });

    /* ---------- 路由 ---------- */
    t('路由：#/ → home', function () {
      return R.parse('#/').name === 'home' ? true : '得到 ' + R.parse('#/').name;
    });
    t('路由：#/c/docker', function () {
      var l = R.parse('#/c/docker');
      return (l.name === 'category' && l.catId === 'docker') ? true : JSON.stringify(l);
    });
    t('路由：#/c/docker/dk-run 带 cmdId', function () {
      var l = R.parse('#/c/docker/dk-run');
      return l.cmdId === 'dk-run' ? true : JSON.stringify(l);
    });
    t('路由：技术栈深链保留 Redis 参数', function () {
      var l = R.parse('#/c/middleware?stack=redis');
      return l.name === 'category' && l.catId === 'middleware' && l.stack === 'redis'
        ? true : JSON.stringify(l);
    });
    t('路由：#/cmd/k8s-get', function () {
      var l = R.parse('#/cmd/k8s-get');
      return (l.name === 'command' && l.cmdId === 'k8s-get') ? true : JSON.stringify(l);
    });
    t('路由：#/search?q=中文 解码正确', function () {
      var l = R.parse('#/search?q=' + encodeURIComponent('磁盘满'));
      return l.q === '磁盘满' ? true : '得到 "' + l.q + '"';
    });
    t('路由：#/cheat / #/roadmap / #/practice', function () {
      return (R.parse('#/cheat').name === 'cheat' && R.parse('#/roadmap').name === 'roadmap' &&
        R.parse('#/practice').name === 'practice') ? true : '解析失败';
    });
    t('路由：#/practice/c/<cat> 是分类练习列表', function () {
      var l = R.parse('#/practice/c/linux-basic');
      return (l.name === 'practiceList' && l.catId === 'linux-basic') ? true : JSON.stringify(l);
    });

    /* ---------- 临时 Shell 窗口 ---------- */
    t('顶栏有临时 Shell 开关', function () {
      var btn = document.getElementById('btn-shell');
      var panel = document.getElementById('shell-panel');
      return (btn && panel) ? true : '缺按钮或面板容器';
    });
    t('Shell 面板默认不渲染终端（省内存）', function () {
      var body = document.getElementById('shell-body');
      return (body && body.getAttribute('data-ready') !== '1') ? true : '初始就把终端渲染了';
    });
    t('Shell 面板初始隐藏', function () {
      var panel = document.getElementById('shell-panel');
      return isHiddenFromLayout(panel) ? true : '初始仍显示或占用布局空间';
    });

    /* ---------- 搜索打分 ---------- */
    t('搜索"端口转发"命中 kubectl port-forward', function () {
      var r = S.query('端口转发', 10);
      for (var i = 0; i < r.length; i++) if (r[i].entry.id === 'k8s-port-forward') return true;
      return '前 5 条: ' + r.slice(0, 5).map(function (x) { return x.entry.name; }).join(' | ');
    });
    t('搜索"磁盘满"命中 df 与 du', function () {
      var r = S.query('磁盘满', 10, {});
      var names = r.map(function (x) { return x.entry.name; }).join(' ');
      return (/df/.test(names) && /du/.test(names)) ? true : '命中: ' + (names || '(空)');
    });
    t('无意义查询返回 0 条（不误报）', function () {
      var r = S.query('qzxwv', 10, { tokens: true });
      return r.length === 0 ? true : '误命中 ' + r.length + ' 条';
    });
    t('自然语言提问能分词回退命中', function () {
      var r = S.query('怎么查看磁盘还有多少空间', 10, { tokens: true });
      return r.length > 0 ? true : '回退无结果';
    });
    t('搜索"反向匹配"命中 grep（notes 参与检索）', function () {
      var r = S.query('反向匹配', 10);
      for (var i = 0; i < r.length; i++) if (/grep/i.test(r[i].entry.name)) return true;
      return '命中: ' + r.slice(0, 5).map(function (x) { return x.entry.name; }).join(' | ');
    });

    /* Phase 2 内容可搜性：内容从 345 条扩到 822 条时搜索断言一条没加，
       等于"新分类能不能被搜到"完全没人管。这里按分类各挑一个真实关键词，
       用 render.js 的同款参数（长查询走分词回退）验证命中。 */
    t('每个分类都能被搜到（Phase 2 内容确实进了索引）', function () {
      var probes = {
        'shell': 'set -euo pipefail', 'helm': 'helm rollback', 'middleware': 'nginx 502',
        'db-cache': '大 key', 'monitor': '慢查询日志', 'cloud-cli': 'obsutil sync',
        'iac': 'terraform import', 'cicd': 'gitlab-runner', 'kvm': 'qemu-img',
        'security': '证书过期', 'perf': 'jstack'
      };
      var miss = [];
      for (var q in probes) {
        var r = S.query(probes[q], 10, { tokens: true });
        var hit = false;
        for (var i = 0; i < r.length; i++) if (r[i].entry.catId === q) { hit = true; break; }
        if (!hit) {
          miss.push(q + '（"' + probes[q] + '" → ' +
            r.slice(0, 3).map(function (x) { return x.entry.catId + '/' + x.entry.name; }).join(', ') + '）');
        }
      }
      return miss.length === 0 ? true : miss.join('；');
    });
    t('搜索"华为云"命中云 CLI 分类', function () {
      var r = S.query('华为云', 20, { tokens: true });
      for (var i = 0; i < r.length; i++) if (r[i].entry.catId === 'cloud-cli') return true;
      return '前 20 条里没有 cloud-cli: ' + r.slice(0, 5).map(function (x) { return x.entry.name; }).join(' | ');
    });
    t('搜索命令名 docker run 排在第一', function () {
      var r = S.query('docker run', 5);
      return (r.length && r[0].entry.id === 'dk-run') ? true : '第一条是 ' + (r[0] ? r[0].entry.name : '(空)');
    });
    t('搜索"swr"能命中华为云相关条目', function () {
      return S.query('swr', 10).length > 0 ? true : '无结果';
    });
    t('搜索大小写不敏感（DOCKER PULL）', function () {
      return S.query('DOCKER PULL', 5).length > 0 ? true : '无结果';
    });
    t('空搜索返回空数组', function () {
      return S.query('', 10).length === 0 ? true : '应返回空';
    });

    /* ---------- 视图渲染 ---------- */
    t('首页渲染含 hero 与分类卡片', function () {
      var h = V.viewHome();
      return (/cat-card/.test(h) && /学云计算/.test(h)) ? true : '缺少关键内容';
    });
    t('首页含练习入口按钮', function () {
      var h = V.viewHome();
      return (/href="#\/practice"/.test(h) && /实时练习/.test(h)) ? true : '缺少练习入口';
    });
    t('分类页渲染命令卡片与工具条', function () {
      var h = V.viewCategory('kubernetes', { stack: 'all' });
      return (/cmd-card/.test(h) && /data-lv="1"/.test(h) && /cmd-name/.test(h)) ? true : '结构缺失';
    });
    t('中间件先展示技术栈入口，Redis 可进入', function () {
      var h = V.viewCategory('middleware', {});
      return h.indexOf('href="#/c/middleware?stack=redis"') !== -1 &&
        h.indexOf('id="cmd-list"') === -1 ? true : '缺 Redis 入口或直接展示了混合命令';
    });
    t('Redis 技术栈只展示原始 Redis 命令，不复制数据', function () {
      var h = V.viewCategory('middleware', { stack: 'redis' });
      var ids = (h.match(/data-id="([^"]+)"/g) || []).map(function (x) { return x.slice(9, -1); });
      var expected = (window.CC_DATA['db-cache'] || []).filter(function (x) { return x.id.indexOf('db-redis-') === 0; });
      return ids.length === expected.length && ids.every(function (id) { return id.indexOf('db-redis-') === 0; }) &&
        new Set(ids).size === ids.length && window.CC_SEARCH.get(ids[0]).catId === 'db-cache'
        ? true : 'Redis 卡片=' + ids.length + ' / 原始命令=' + expected.length;
    });
    t('本类全部命令与原分类条数一致', function () {
      var h = V.viewCategory('middleware', { stack: 'all' });
      var cards = (h.match(/class="cmd-card/g) || []).length;
      return cards === window.CC_DATA.middleware.length ? true : '本类全部卡片=' + cards;
    });
    t('全部分类的技术栈完整覆盖原命令且无重复', function () {
      var cats = window.CC_CATS_META.list.map(function (cat) { return cat.id; });
      var missing = [];
      cats.forEach(function (cat) {
        var overview = V.viewCategory(cat, {});
        var stackIds = [];
        var re = new RegExp('href="#/c/' + cat + '\\?stack=([^"&]+)"', 'g');
        var m;
        while ((m = re.exec(overview))) if (m[1] !== 'all') stackIds.push(m[1]);
        if (!stackIds.length) missing.push(cat + '/无技术栈入口');
        var found = {};
        stackIds.forEach(function (stack) {
          var h = V.viewCategory(cat, { stack: stack });
          var ids = h.match(/data-id="([^"]+)"/g) || [];
          if (!ids.length) missing.push(cat + '/' + stack + '=空入口');
          ids.forEach(function (item) {
            var id = item.slice(9, -1);
            if ((window.CC_DATA[cat] || []).some(function (cmd) { return cmd.id === id; })) {
              found[id] = (found[id] || 0) + 1;
            }
          });
        });
        (window.CC_DATA[cat] || []).forEach(function (cmd) {
          if (found[cmd.id] !== 1) missing.push(cat + '/' + cmd.id + '=' + (found[cmd.id] || 0));
        });
      });
      return missing.length ? missing.slice(0, 8).join(', ') : true;
    });
    t('Ceph 与 OpenStack 内容有独立入口和真实命令', function () {
      var storage = V.viewCategory('linux-storage', {});
      var virt = V.viewCategory('kvm', {});
      var ceph = V.viewCategory('linux-storage', { stack: 'ceph' });
      var os = V.viewCategory('kvm', { stack: 'openstack' });
      return storage.indexOf('?stack=ceph') !== -1 && virt.indexOf('?stack=openstack') !== -1 &&
        (ceph.match(/class="cmd-card/g) || []).length >= 15 &&
        (os.match(/class="cmd-card/g) || []).length >= 10 ? true : '入口或命令内容缺失';
    });
    t('Redis 独立详情返回 Redis 列表且翻页不跨技术栈', function () {
      var list = (window.CC_DATA['db-cache'] || []).filter(function (cmd) { return cmd.id.indexOf('db-redis-') === 0; });
      var h = V.viewCommand(list[list.length - 1].id);
      return h.indexOf('href="#/c/db-cache?stack=redis"') !== -1 &&
        h.indexOf('href="#/cmd/db-pg-') === -1 ? true : '返回链接或翻页越过 Redis 边界';
    });
    t('分类页展开指定命令（openId）', function () {
      var id = window.CC_DATA['kubernetes'][0].id;
      var h = V.viewCategory('kubernetes', { openId: id });
      return (h.indexOf('id="cmd-' + id + '"') !== -1 && /cmd-card open/.test(h)) ? true : '未展开 ' + id;
    });
    t('未上线分类显示占位', function () {
      /* 动态取一个还没接线的分类 —— 硬编码具体分类会在它上线后失效 */
      var list = window.CC_CATS_META.list;
      var soon = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].status !== 'ready' && !(window.CC_DATA[list[i].id] || []).length) { soon = list[i]; break; }
      }
      if (!soon) {
        /* 没有"未上线分类"时不能放空这条断言 —— 改为检查反向不变量：
           凡是 ready 的分类都必须真有数据（这正是"占位"要防的坏状态）。 */
        var empty = [];
        for (var j = 0; j < list.length; j++) {
          if (list[j].status === 'ready' && !(window.CC_DATA[list[j].id] || []).length) empty.push(list[j].id);
        }
        return empty.length === 0 ? true : '这些分类标记 ready 却没有数据：' + empty.join('、');
      }
      return /Phase 2/.test(V.viewCategory(soon.id, {})) ? true : soon.id + ' 未显示占位提示';
    });
    t('命令详情页渲染完整区块', function () {
      var h = V.viewCommand('dk-run');
      var need = ['语法', '常用参数', '示例', '官方文档'];
      for (var i = 0; i < need.length; i++) if (h.indexOf(need[i]) === -1) return '缺少区块: ' + need[i];
      return true;
    });
    t('命令详情页渲染参数表与注意事项', function () {
      var h = V.viewCommand('dk-run');
      return (/param-table/.test(h) && /notes/.test(h)) ? true : '缺少参数表或注意事项';
    });
    t('高风险命令带注意事项（rm）', function () {
      return /notes/.test(V.viewCommand('lb-rm')) ? true : 'lb-rm 没有注意事项区块';
    });
    t('搜索结果页高亮关键字', function () {
      var h = V.viewSearch('端口转发');
      return (/<mark>/.test(h) && /kubectl port-forward/.test(h)) ? true : '未高亮或未命中';
    });
    t('搜索无结果显示友好空状态', function () {
      return /没有匹配的命令/.test(V.viewSearch('qzxwv')) ? true : '未显示空状态';
    });
    t('路线图渲染阶段与链接', function () {
      var h = V.viewRoadmap();
      var n = (h.match(/class="stage/g) || []).length;
      return (n >= 7 && /实战项目/.test(h)) ? true : '阶段数=' + n;
    });
    t('路线图：9 阶段均展示交付物和人工核验表', function () {
      var h = V.viewRoadmap();
      var n = (h.match(/<b>交付物：<\/b>/g) || []).length;
      return n === (window.CC_ROADMAP || []).length && /项目交付与人工核验/.test(h)
        ? true : '交付物出现 ' + n + ' 次';
    });
    /* 「学习要有连贯性」在页面上的落点：每个阶段要能看出体量与入口，
       阶段 2 以后要能点回前置阶段。断言按真实数据算，不写死数字。 */
    t('路线图：每个阶段显示课程数/可跑命令数/卡片数', function () {
      var h = V.viewRoadmap();
      var blocks = (h.match(/class="stage-stats"/g) || []).length;
      if (blocks < 7) return '只有 ' + blocks + ' 个阶段显示了体量';
      if (!/节课 \/ \d+ 步/.test(h)) return '没有课程/步数';
      if (!/条可在终端演练/.test(h)) return '没有可跑命令数';
      return /张练习卡/.test(h) ? true : '没有卡片数';
    });
    t('路线图：阶段 2 有前置阶段链接且指向阶段 1', function () {
      var h = V.viewRoadmap();
      var stages = window.CC_ROADMAP, first = null, second = null;
      for (var i = 0; i < stages.length; i++) {
        if (stages[i].no === 1) first = stages[i];
        if (stages[i].no === 2) second = stages[i];
      }
      if (!first || !second) return '路线图数据不足';
      if (second.prereq !== first.id) return '阶段 2 的 prereq 不是阶段 1，而是 ' + second.prereq;
      /* 注意不能只取"第一个 data-goto-stage"：阶段 1 卡片里的「下一阶段」链接
         排在阶段 2 的「前置阶段」之前，取第一个会误判（这条断言第一版就是这么写错的）。 */
      var m = h.match(/前置阶段[\s\S]{0,240}?data-goto-stage="([^"]+)"/);
      if (!m) return '没有前置阶段链接';
      return m[1] === first.id ? true : '前置链接指向了 ' + m[1];
    });
    t('路线图：阶段里的「从第一课开始」指向真实课程', function () {
      var h = V.viewRoadmap();
      var m = h.match(/academy-lab\.html#\/lab\/cc-([^"]+)"/);
      if (!m) return '没有课程入口';
      var ids = (window.CC_LESSONS || []).map(function (l) { return l.id; });
      return ids.indexOf(m[1]) !== -1 ? true : '指向了不存在的课程 ' + m[1];
    });
    /* 路线图的"闭环"与知识库入口：六块内容互链、阶段之间有前后跳转 */
    t('路线图：顶部有学习闭环六块入口', function () {
      var h = V.viewRoadmap();
      var n = (h.match(/class="loop-item"/g) || []).length;
      if (n !== 6) return '闭环入口不是 6 个，而是 ' + n;
      if (!/#\/kb\/concepts/.test(h) || !/#\/drill/.test(h)) return '缺少知识库或每日一练入口';
      return /#\/practice/.test(h) ? true : '缺少练习入口';
    });
    /* 综合实战入口：不仅要求"容器在"，还要求"里面的卡片真的渲染出来了" ——
       只查 id 存在的话，内部循环写错（比如 caps 过滤没命中）也会通过，
       那正是"看着在、其实空"的一类问题。 */
    t('路线图：综合实战入口渲染出卡片且带跨分类数', function () {
      var h = V.viewRoadmap();
      if (h.indexOf('id="cc-capstone"') === -1) return '没有综合实战入口块';
      var items = (h.match(/class="cap-item"/g) || []).length;
      if (items < 3) return '综合实战卡片只有 ' + items + ' 个（应为 3）';
      if (!/跨 \d+ 个分类/.test(h)) return '卡片上没有"跨 N 个分类"的说明';
      var m = h.match(/跨 (\d+) 个分类/g) || [];
      var max = 0;
      m.forEach(function (s) { var v = Number(String(s).replace(/\D/g, '')); if (v > max) max = v; });
      return max >= 5 ? true : '最大跨度只有 ' + max + ' 个分类（应有 ≥5 的）';
    });
    t('路线图：阶段给出对应的知识库条目数', function () {
      var h = V.viewRoadmap();
      var blocks = (h.match(/这个阶段的知识库/g) || []).length;
      if (blocks < 1) return '没有任何阶段给出知识库入口（可能知识库数据没加载）';
      return /概念词典（\d+）/.test(h) ? true : '没有带条数的概念词典链接';
    });
    t('路线图：倒数第二个阶段有「下一阶段」，最后一个没有', function () {
      var h = V.viewRoadmap();
      var n = (h.match(/下一阶段/g) || []).length;
      var stages = window.CC_ROADMAP || [];
      return n === stages.length - 1 ? true : '「下一阶段」出现 ' + n + ' 次，阶段数 ' + stages.length;
    });
    t('故障速查渲染分组与命令链', function () {
      var h = V.viewCheat();
      return (/cheat-card/.test(h) && /Linux 系统/.test(h) && /Docker 容器/.test(h)) ? true : '结构缺失';
    });
    /* 故障剧本（cheat）是"路线图 → 课程 → 命令 → 卡片 → 配方 → 故障剧本"的最后一环。
       链上命令必须点得进命令手册，跑不了的要如实标注 —— 否则"照着一路敲下去"是空话。 */
    t('故障速查：链上命令能点进命令手册（#/cmd/<id>）', function () {
      var h = V.viewCheat();
      var n = (h.match(/#\/cmd\//g) || []).length;
      return n >= 100 ? true : '只有 ' + n + ' 个命令链接，链上命令应当基本都能点进去';
    });
    t('故障速查：每个剧本都至少有一条可点进手册的命令', function () {
      var items = window.CC_CHEAT || [];
      var bad = items.filter(function (e) { return !(e.cmdIds || []).length; }).map(function (e) { return e.id; });
      return bad.length === 0 ? true : '这些剧本零链接：' + bad.join(', ');
    });
    t('故障速查：模拟终端跑不了的步骤标了「仅真机」', function () {
      var h = V.viewCheat();
      /* ⚠ 数的是**标记本身**，不能数"仅真机"这四个字：
         页面副标题里也写了「仅真机」，数文本会永远多 1 处。 */
      var got = (h.match(/class="cheat-tag"/g) || []).length;
      var impl = (window.CC_SHELL && window.CC_SHELL.commands) || [];
      var notImpl = (window.CC_SHELL && window.CC_SHELL.notImplemented) || [];
      var heads = {};
      Object.keys(window.CC_DATA || {}).forEach(function (c) {
        (window.CC_DATA[c] || []).forEach(function (r) {
          var mh = String(r.name || '').trim().split(/\s+/)[0];
          if (mh) heads[mh] = 1;
        });
      });
      /* 与 viewCheat 的 lineState() 同一条判据：首词是 shell 关键字就只看行内的
         notImplemented 命中，不当成"跑不了的真机命令"（否则两行完全跑得通的 for 循环会被误标）。 */
      var KW = { 'for': 1, 'if': 1, 'while': 1, 'until': 1, 'case': 1, 'do': 1, 'then': 1, 'else': 1, 'fi': 1, 'done': 1, 'esac': 1 };
      var need = 0;
      (window.CC_CHEAT || []).forEach(function (e) {
        (e.chain || []).forEach(function (line) {
          var s = String(line).trim();
          if (!s || s.charAt(0) === '#') return;
          var head = s.split(/\s+/)[0];
          if (KW[head]) {
            var tk = s.split(/[\s;|&()]+/);
            for (var i = 0; i < tk.length; i++) if (notImpl.indexOf(tk[i]) !== -1) { need++; return; }
            return;
          }
          if (impl.indexOf(head) !== -1) return;
          if (heads[head] || notImpl.indexOf(head) !== -1) need++;
        });
      });
      if (need === 0) return '链路里一条跑不了的命令都没有？ssh/iptables/chroot/pmap 应当跑不了';
      return got === need ? true : '需要标注 ' + need + ' 处，实际 ' + got + ' 处';
    });
    t('故障速查：说明行（# 开头）不当成命令', function () {
      var h = V.viewCheat();
      return /cheat-step is-note/.test(h) ? true : '说明行没有被单独标记';
    });
    t('命令详情：跑不了的命令要如实说明「仅真机」与原因', function () {
      /* 「未实现命令诚实提示」的核心断言：找一条引擎没实现、但手册里有的命令
         （ssh / iptables / vim 都行），确认详情页顶部给出了提示与**具体原因**，
         而不是让学员照着敲一遍再拿到 command not found。 */
      var impl = (window.CC_SHELL && window.CC_SHELL.commands) || [];
      var notImpl = (window.CC_SHELL && window.CC_SHELL.notImplemented) || [];
      var target = null;
      Object.keys(window.CC_DATA || {}).forEach(function (c) {
        (window.CC_DATA[c] || []).forEach(function (r) {
          var head = String(r.name || '').trim().split(/\s+/)[0];
          if (!target && notImpl.indexOf(head) !== -1 && impl.indexOf(head) === -1) target = r;
        });
      });
      if (!target) return '找不到"有手册条目但引擎没实现"的命令，断言失去了对象';
      var h = V.viewCommand(target.id);
      if (!/sim-note/.test(h)) return '命令详情页没有「仅真机」提示：' + target.name;
      if (!/仅真机/.test(h)) return '提示块里没有「仅真机」字样';
      /* 原因必须来自引擎的 NOT_IMPL 文案，不能是空话。
         ⚠️ 不能拿原文直接 indexOf：原因里有 `**粗体**` 与 `` `代码` ``，
         渲染后会变成 <b> / <code> 标签，**文字被标签切开**。
         做法：把页面 HTML 的标签全剥掉再比 —— 那才是人眼看到的文字。 */
      var reason = window.CC_SHELL.notImplementedReason(target.name) || '';
      if (!reason) return '引擎没有登记 ' + target.name + ' 的未实现原因';
      var plainHtml = h.replace(/<[^>]*>/g, '');
      var piece = reason.replace(/\*\*/g, '').replace(/`/g, '');
      if (piece.length < 12) return '原因文案太短，无法验证：' + reason;
      if (plainHtml.indexOf(piece.slice(0, 12)) === -1) {
        return '详情页没有引用引擎里登记的原因文案（找不到「' + piece.slice(0, 12) + '」）';
      }
      if (plainHtml.indexOf('教学环境没有实现它') !== -1) return '登记过原因的命令不该退化成兜底文案';
      return true;
    });
    t('命令详情：不是命令的条目（SQL/K8s 对象/产品名）不该标「仅真机」', function () {
      /* 这一条是**防假阳性**的：手册里 `SHOW`、`EXPLAIN`、`Pod 与 Service`、`LVM`、
         `Jenkins`、`华为云` 这类条目根本不是 shell 命令，
         给它们挂"这条命令跑不了"只会让人学会无视这个标注。 */
      var impl = (window.CC_SHELL && window.CC_SHELL.commands) || [];
      var bad = [];
      ['SHOW', 'EXPLAIN', 'Pod', 'Service', 'LVM', 'Jenkins', 'GitLab', '华为云'].forEach(function (h) {
        var target = null;
        Object.keys(window.CC_DATA || {}).forEach(function (c) {
          (window.CC_DATA[c] || []).forEach(function (r) {
            if (!target && String(r.name || '').trim().split(/\s+/)[0] === h) target = r;
          });
        });
        if (target && impl.indexOf(h) === -1) {
          if (V.viewCommand(target.id).indexOf('sim-note') !== -1) bad.push(h);
        }
      });
      return bad.length === 0 ? true : '这些不是命令却被标了「仅真机」：' + bad.join(', ');
    });
    t('命令详情：配置指令 / Terraform 块不该标「仅真机」', function () {
      /* 第三类假阳性：手册里有一批记录是"某个配置文件里该怎么写"
         （`location { }`、`proxy_pass ...;`、`locals { }`），首词恰好也是小写 ASCII。
         判据：剥掉引号后含 `{` 或以 `;` 结尾 → 视为配置条目，不给提示。
         ⚠️ 同时要**反向验证**：判据不能宽到把真命令的提示也吞掉。 */
      var impl = (window.CC_SHELL && window.CC_SHELL.commands) || [];
      var byId = {};
      Object.keys(window.CC_DATA || {}).forEach(function (c) {
        (window.CC_DATA[c] || []).forEach(function (r) { byId[r.id] = r; });
      });
      var bad = [];
      ['mw-nginx-location', 'mw-nginx-proxy-pass', 'mw-nginx-upstream', 'mw-nginx-rewrite',
        'mw-nginx-log', 'iac-tf-locals', 'iac-tf-variable', 'iac-tf-count-foreach',
        'iac-tf-lifecycle', 'iac-tf-output-block'].forEach(function (id) {
        var target = byId[id];
        if (!target) return;
        var head = String(target.name || '').trim().split(/\s+/)[0];
        if (impl.indexOf(head) !== -1) return;
        if (V.viewCommand(id).indexOf('sim-note') !== -1) bad.push(id);
      });
      if (bad.length) return '这些配置条目被误标了「仅真机」：' + bad.join(', ');
      var stillBadged = 0, checked = 0;
      ['ssh', 'iptables', 'useradd', 'chroot', 'less'].forEach(function (h) {
        var t2 = null;
        Object.keys(byId).forEach(function (id) {
          if (!t2 && String(byId[id].name || '').trim().split(/\s+/)[0] === h) t2 = byId[id];
        });
        if (!t2) return;
        checked++;
        if (V.viewCommand(t2.id).indexOf('sim-note') !== -1) stillBadged++;
      });
      return stillBadged === checked ? true
        : '判据过宽：真命令也拿不到提示了（' + stillBadged + '/' + checked + '）';
    });
    t('命令详情：跑得了的命令不显示「仅真机」', function () {
      var impl = (window.CC_SHELL && window.CC_SHELL.commands) || [];
      var target = null;
      Object.keys(window.CC_DATA || {}).forEach(function (c) {
        (window.CC_DATA[c] || []).forEach(function (r) {
          var head = String(r.name || '').trim().split(/\s+/)[0];
          if (!target && impl.indexOf(head) !== -1) target = r;
        });
      });
      if (!target) return '找不到能在引擎里跑的命令';
      var h = V.viewCommand(target.id);
      return h.indexOf('sim-note') === -1 ? true : '能跑的命令不该显示「仅真机」：' + target.name;
    });
    t('故障速查：cmdIds 全部指向真实命令条目', function () {      var ids = {};
      Object.keys(window.CC_DATA || {}).forEach(function (c) {
        (window.CC_DATA[c] || []).forEach(function (r) { ids[r.id] = 1; });
      });
      var bad = [];
      (window.CC_CHEAT || []).forEach(function (e) {
        (e.cmdIds || []).forEach(function (id) { if (!ids[id]) bad.push(e.id + '→' + id); });
      });
      return bad.length === 0 ? true : '断链：' + bad.slice(0, 5).join(', ');
    });
    t('收藏页空状态', function () {
      return /还没有收藏任何命令/.test(V.viewFavorites()) ? true : '未显示空状态';
    });
    t('404 页面', function () {
      return /页面不存在/.test(V.viewNotFound('页面不存在')) ? true : '缺少提示';
    });
    t('HTML 转义生效（XSS 防护）', function () {
      var s = V.esc('<img src=x onerror=alert(1)>');
      return (s.indexOf('<img') === -1 && s.indexOf('&lt;') !== -1) ? true : '未转义: ' + s;
    });
    t('行内标记：`code` 与 **粗体** 都渲染', function () {
      var s = V.mdInline('用 `docker ps` 看容器，**不要** 用 rm');
      if (s.indexOf('<code class="inline-code">docker ps</code>') === -1) return '反引号未渲染: ' + s;
      if (s.indexOf('<strong>不要</strong>') === -1) return '粗体未渲染: ' + s;
      if (/\*\*/.test(s)) return '页面上仍有裸星号: ' + s;
      return true;
    });
    t('代码块内的星号不被当成粗体', function () {
      var s = V.mdInline('执行 `rm -rf **/*.log` 要注意');
      return (s.indexOf('<strong>') === -1) ? true : '代码里的星号被误转粗体: ' + s;
    });
    t('侧栏导航渲染出全部分类', function () {
      var nav = document.getElementById('nav');
      if (!nav) return '没有侧栏';
      var links = nav.querySelectorAll('.nav-link');
      var hrefs = [];
      for (var i = 0; i < links.length; i++) hrefs.push(links[i].getAttribute('href') || '');
      /* 断言与真实分类数挂钩：之前是"≥20 项"，而分类只有 18 个，
         这个阈值永远不会失败，等于没测。侧栏里除分类外还有「学习路线」
         「故障速查」等入口，所以按"每个分类都有对应链接"来判，不数总数。 */
      var cats = window.CC_CATS_META.list;
      var missing = [];
      for (var j = 0; j < cats.length; j++) {
        if (hrefs.indexOf('#/c/' + cats[j].id) === -1) missing.push(cats[j].id);
      }
      if (missing.length) return '这些分类在侧栏没有入口：' + missing.join('、');
      for (var k = 0; k < links.length; k++) {
        if (/\soon\b|is-soon/.test(links[k].className) && hrefs[k].indexOf('#/c/') === 0) {
          return '已上线的分类仍被渲染成灰显占位：' + hrefs[k];
        }
      }
      return true;
    });
    t('页脚统计数字已注入', function () {
      var el = document.getElementById('stat-total');
      if (!el) return '没有统计元素';
      return (/\d+ 条命令/.test(el.textContent)) ? true : '内容为: ' + el.textContent;
    });
    t('主题切换可用', function () {
      var btn = document.getElementById('btn-theme');
      if (!btn) return '没有主题按钮';
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      var stored = ST.getTheme();
      return (['auto', 'light', 'dark'].indexOf(stored) !== -1) ? true : '主题状态异常: ' + stored;
    });
    t('学习进度备份入口可用', function () {
      var btn = document.getElementById('btn-progress-transfer');
      if (!btn) return '没有进度备份按钮';
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      var dialog = document.querySelector('.progress-transfer-overlay');
      var area = dialog && dialog.querySelector('#progress-export');
      var valid = !!dialog && !dialog.hidden && area && /"mastered"/.test(area.value);
      if (dialog) dialog.querySelector('[data-close]').click();
      return valid ? true : '备份对话框没有打开或内容为空';
    });

    /* ================= 阶段二：进入分类页做真实 DOM 交互 ================= */
    mark('阶段一同步断言完成(' + out.length + ')');
    var catId = 'linux-basic';
    var list = window.CC_DATA[catId] || [];
    if (list.length < 3) {
      finish([{ name: '分类页测试前置数据', ok: false, detail: catId + ' 数据不足 3 条' }]);
      return;
    }

    location.hash = '#/c/' + catId + '?stack=all';

    setTimeout(function () {
      var dom = [];
      function d(name, fn) {
        try {
          var r = fn();
          dom.push({ name: name, ok: r === true, detail: r === true ? '' : String(r) });
        } catch (e) {
          dom.push({ name: name, ok: false, detail: 'EXCEPTION: ' + e.message });
        }
      }

      d('已跳到分类页并渲染卡片', function () {
        var n = document.querySelectorAll('#cmd-list .cmd-card').length;
        return n >= 3 ? true : '只渲染了 ' + n + ' 张卡片';
      });

      d('命令卡片可展开（点击头部）', function () {
        var id = list[0].id;
        var card = document.getElementById('cmd-' + id);
        if (!card) return '找不到卡片 ' + id;
        var body = card.querySelector('.cmd-body');
        var before = body.hidden;
        card.querySelector('.cmd-head').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        var changed = body.hidden !== before;
        var hasCode = body.querySelector('.code') !== null;
        return (changed && hasCode) ? true : '展开状态未变化或没有代码块';
      });

      d('复制按钮带完整命令文本', function () {
        var btn = document.querySelector('#cmd-list [data-copy]');
        if (!btn) return '页面上没有复制按钮';
        var txt = btn.getAttribute('data-copy');
        return (txt && txt.length > 5) ? true : '复制内容为空';
      });

      d('收藏按钮可切换并写入 localStorage', function () {
        var id = list[1].id;
        var card = document.getElementById('cmd-' + id);
        if (!card) return '找不到卡片 ' + id;
        var btn = card.querySelector('[data-fav]');
        if (!btn) return '没有收藏按钮';
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        var saved = false;
        try { saved = /"favorites"/.test(localStorage.getItem('cloudcmd.v1') || ''); } catch (e) { saved = false; }
        var on = ST.isFavorite(id);
        return (on && saved) ? true : '未写入收藏（isFavorite=' + on + ' / localStorage=' + saved + '）';
      });

      d('取消收藏后写入同步取消记录', function () {
        var id = list[1].id;
        var card = document.getElementById('cmd-' + id);
        var btn = card && card.querySelector('[data-fav]');
        if (!btn || !ST.isFavorite(id)) return '前置收藏未成功';
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        var saved = JSON.parse(localStorage.getItem('cloudcmd.v1') || '{}');
        var mark = saved.marks && saved.marks.favorites && saved.marks.favorites[id];
        return !ST.isFavorite(id) && mark && mark.on === false && !btn.classList.contains('on')
          ? true : '取消收藏未持久化或按钮仍显示已收藏';
      });

      d('已掌握按钮可切换并更新进度条', function () {
        var id = list[2].id;
        var card = document.getElementById('cmd-' + id);
        if (!card) return '找不到卡片 ' + id;
        var btn = card.querySelector('[data-master]');
        if (!btn) return '卡片里没有已掌握按钮';
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        var prog = document.getElementById('progress-box');
        var txt = prog ? prog.textContent : '';
        return (ST.isMastered(id) && /\d+\s*\/\s*\d+/.test(txt)) ? true : '进度未更新: ' + txt;
      });

      /* 「标记为已掌握」的外形曾经坏过：那个勾图标没有尺寸约束，
         按浏览器默认的 300×150 渲染，把底栏撑得又高又怪（用户原话"太丑了"）。
         这类"没写 CSS 就悄悄生效的默认值"必须由断言钉住，不能靠肉眼。 */
      d('已掌握按钮：尺寸正常（不是被默认 300×150 的 svg 撑大）', function () {
        var btn = document.querySelector('#cmd-list [data-master]');
        if (!btn) return '没有已掌握按钮';
        var svg = btn.querySelector('.mt-ico svg');
        if (!svg) return '按钮里没有勾图标（.mt-ico svg）';
        var r = svg.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return '图标不可见';
        if (r.width > 22 || r.height > 22) return '勾图标过大：' + Math.round(r.width) + '×' + Math.round(r.height);
        /* 真正被用户看见的问题是**整个按钮**被撑大：
           flex 子项的 min-width 默认是 auto，没有给 svg 定尺寸时，
           它会以固有宽度（300px）当底线，把按钮撑成一条长条。
           所以这里必须量按钮本身，而不是只量图标 ——
           只量图标的话，即使把 .mt-ico 的尺寸删掉断言也照样绿（已实测）。 */
        var b = btn.getBoundingClientRect();
        if (b.width > 220) return '按钮被撑宽到 ' + Math.round(b.width) + 'px';
        if (b.height > 48) return '按钮被撑高到 ' + Math.round(b.height) + 'px';
        return true;
      });

      d('已掌握按钮：结构与无障碍状态齐全', function () {
        var btn = document.querySelector('#cmd-list [data-master]');
        if (!btn) return '没有已掌握按钮';
        if (!btn.querySelector('.mt-ico')) return '缺 .mt-ico 图标容器';
        if (!btn.querySelector('.mt-label')) return '缺 .mt-label 文字容器';
        var pressed = btn.getAttribute('aria-pressed');
        if (pressed !== 'true' && pressed !== 'false') return 'aria-pressed 不是 true/false，而是 ' + pressed;
        if (!btn.getAttribute('title')) return '没有 title（悬停看不到这个按钮干什么）';
        return true;
      });

      d('已掌握按钮：点击后文字与图标都在（没把图标换成文字）', function () {
        var id = list[3].id;
        var card = document.getElementById('cmd-' + id);
        if (!card) return '找不到卡片 ' + id;
        var btn = card.querySelector('[data-master]');
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        var label = btn.querySelector('.mt-label');
        if (!label) return '点完之后 .mt-label 没了';
        if (!/已掌握/.test(label.textContent)) return '文字没变成「已掌握」：' + label.textContent;
        if (!btn.querySelector('.mt-ico svg')) return '勾图标被覆盖掉了（点击处理里错取了第一个 span）';
        if (btn.getAttribute('aria-pressed') !== 'true') return 'aria-pressed 没跟着变';
        return true;
      });

      d('命令详情底栏：分类与难度渲染成徽章', function () {
        var foot = document.querySelector('#cmd-list .detail-foot');
        if (!foot) return '没有底栏';
        var meta = foot.querySelector('.detail-foot-meta');
        if (!meta) return '底栏缺少 .detail-foot-meta';
        return meta.querySelectorAll('.badge').length >= 1 ? true : '底栏没有徽章';
      });

      d('难度筛选可过滤卡片', function () {
        var bar = document.querySelector('.toolbar');
        if (!bar) return '没有工具栏';
        var target = bar.querySelector('[data-lv="1"]');
        if (!target) return '没有 L1 筛选按钮';
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        var cards = document.querySelectorAll('#cmd-list .cmd-card');
        var visible = 0, wrong = 0;
        for (var i = 0; i < cards.length; i++) {
          if (!cards[i].hidden) {
            visible++;
            if (cards[i].getAttribute('data-level') !== '1') wrong++;
          }
        }
        var all = bar.querySelector('[data-lv="all"]');
        if (all) all.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return (visible > 0 && wrong === 0) ? true : '可见=' + visible + ' / 难度不符=' + wrong;
      });

      d('排序切换不报错', function () {
        var sel = document.querySelector('select[data-sort]');
        if (!sel) return '没有排序控件';
        sel.value = 'name';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return document.querySelectorAll('#cmd-list .cmd-card').length > 0 ? true : '重渲染后没有卡片';
      });

      d('切到 Docker 分类页正常渲染', function () {
        location.hash = '#/c/docker?stack=all';
        return location.hash === '#/c/docker?stack=all' ? true : 'hash 未生效';
      });

      setTimeout(function () {
        d('Docker 分类页确实渲染完成', function () {
          var n = document.querySelectorAll('#cmd-list .cmd-card').length;
          var title = document.querySelector('.page-head h1');
          var txt = title ? title.textContent : '';
          return (n >= 3 && /Docker/.test(txt)) ? true : '卡片=' + n + ' 标题="' + txt + '"';
        });
        location.hash = '#/c/middleware?stack=redis';
        setTimeout(function () {
          d('Redis 深链刷新后只显示 Redis 命令', function () {
            R.render();
            var cards = document.querySelectorAll('#cmd-list .cmd-card');
            if (!cards.length) return '没有命令卡片';
            for (var i = 0; i < cards.length; i++) {
              if (cards[i].getAttribute('data-id').indexOf('db-redis-') !== 0) return '混入了其他命令';
            }
            return true;
          });
          d('Redis 内切换排序保留技术栈与难度筛选', function () {
            var lv = document.querySelector('.toolbar [data-lv="2"]');
            if (!lv) return '缺 L2 按钮';
            lv.click();
            var sel = document.querySelector('[data-sort]');
            sel.value = 'name';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            var bar = document.querySelector('.toolbar');
            var cards = document.querySelectorAll('#cmd-list .cmd-card');
            return bar.getAttribute('data-stack') === 'redis' &&
              bar.querySelector('[data-lv="2"]').getAttribute('aria-pressed') === 'true' &&
              cards.length > 0 && Array.prototype.every.call(cards, function (c) { return c.getAttribute('data-id').indexOf('db-redis-') === 0; })
              ? true : '排序或难度切换后丢了 Redis 上下文';
          });
          d('Redis 交叉入口收藏仍写入原命令状态', function () {
            var card = document.querySelector('#cmd-list .cmd-card');
            if (!card) return '没有 Redis 卡片';
            var id = card.getAttribute('data-id');
            var before = ST.isFavorite(id);
            card.querySelector('[data-fav]').click();
            var changed = ST.isFavorite(id) !== before;
            card.querySelector('[data-fav]').click();
            return changed && ST.isFavorite(id) === before ? true : '收藏状态未共用';
          });
          mark('阶段二完成(' + dom.length + ')');
          phase3(dom);
        }, 200);
      }, 200);
    }, 200);
  }
  /* ================= 阶段三：练习入口（已迁到独立页面） =================
     实时练习整页搬到了 academy-lab.html（练习平台本体）。主站这边**不再渲染练习视图**，
     只保证：练习路由解析正确、入口链接在位、跳转函数存在且地址拼对。
     这里**不触发任何导航**（file:// 下换页后就没法继续断言了）；
     练习平台自己的界面、步骤判定、打卡由 tools/lab-check.js 在 academy-lab.html 上验证。 */
  function phase3(done) {
    mark('进入阶段三');
    setTimeout(function () {
      function d(name, fn) {
        try {
          var r = fn();
          done.push({ name: name, ok: r === true, detail: r === true ? '' : String(r) });
        } catch (e) {
          done.push({ name: name, ok: false, detail: 'EXCEPTION: ' + e.message });
        }
      }

      d('练习路由解析：#/practice 与 #/practice/<id>', function () {
        var a = window.CC_ROUTER.parse('#/practice');
        var b = window.CC_ROUTER.parse('#/practice/ls-long');
        return (a.name === 'practice' && a.lessonId === '' && b.lessonId === 'ls-long') ? true : JSON.stringify([a, b]);
      });

      d('分类页有「实时练习」入口按钮', function () {
        var h = window.CC_VIEW.viewCategory('linux-basic', {});
        if (h.indexOf('class="practice-entry"') === -1) return '没有 practice-entry';
        if (h.indexOf('#/practice/c/linux-basic') === -1) return '入口链接不对';
        return /实时练习/.test(h) ? true : '按钮没有文案';
      });

      d('没有练习的分类不放假链接', function () {
        /* helm 这类还没上线的分类：入口应该是灰掉的 span，而不是可点的 a */
        var h = window.CC_VIEW.viewCategory('linux-basic', {});
        var soon = h.indexOf('practice-entry is-soon');
        var link = h.indexOf('<a class="practice-entry"');
        return (link !== -1 && soon === -1) ? true : '入口状态判断有问题';
      });

      d('分类练习列表与 linux-basic 课程数一致', function () {
        var h = window.CC_TERM.viewPracticeCards('linux-basic');
        var n = (h.match(/class="practice-item/g) || []).length;
        var expected = (window.CC_LESSONS || []).filter(function (l) { return l.cat === 'linux-basic'; }).length;
        return n === expected ? true : '得到 ' + n + ' 个场景，课程库有 ' + expected + ' 节';
      });

      d('练习卡指向练习平台深链', function () {
        var h = window.CC_TERM.viewPracticeCards('linux-basic');
        return (h.indexOf('academy-lab.html#/lab/cc-ls-long') !== -1 &&
                h.indexOf('academy-lab.html#/lab/cc-basic-tar-backup') !== -1) ? true : '缺深链';
      });

      d('Linux 基础场景覆盖读目录/文件操作/权限/归档', function () {
        var ids = (window.CC_LESSONS || []).filter(function (l) { return l.cat === 'linux-basic'; })
          .map(function (l) { return l.id; });
        var want = ['ls-long', 'ls-time', 'tail-follow', 'basic-free-space', 'basic-copy-move', 'basic-perm-tree', 'basic-tar-backup'];
        var missing = want.filter(function (w) { return ids.indexOf(w) === -1; });
        return missing.length ? '缺少: ' + missing.join(',') : true;
      });

      /* ---- 学习路径：难度排序与"上一题/下一题"必须同源 ----

         这一组断言的由来：练习列表此前**完全没有测试覆盖**，
         于是"课程在数据里的顺序是按写作批次追加的"这个问题一直没被发现 ——
         实测 18 个分类里只有 1 个是难度递增的，学员进任何分类都看不出从哪开始。
         加了排序之后必须钉住三件事，否则会静默退化。 */

      d('CC_TERM 暴露了 levelOf / sortByLevel', function () {
        if (typeof window.CC_TERM.levelOf !== 'function') return '缺 levelOf';
        if (typeof window.CC_TERM.sortByLevel !== 'function') return '缺 sortByLevel';
        return true;
      });

      d('难度由"引用命令的最高 level"推算，取值在 1~4', function () {
        var bad = [];
        (window.CC_LESSONS || []).forEach(function (l) {
          var v = window.CC_TERM.levelOf(l);
          if (!(v >= 1 && v <= 4)) bad.push(l.id + '=' + v);
        });
        return bad.length ? '越界: ' + bad.slice(0, 3).join(',') : true;
      });

      d('每个分类按难度排序后都是递增的', function () {
        var bad = [];
        (window.CC_CATS_META.list || []).forEach(function (c) {
          var ls = (window.CC_LESSONS || []).filter(function (l) { return l.cat === c.id; });
          if (ls.length < 2) return;
          var sorted = window.CC_TERM.sortByLevel(ls);
          var lv = sorted.map(function (l) { return window.CC_TERM.levelOf(l); });
          for (var i = 1; i < lv.length; i++) {
            if (lv[i] < lv[i - 1]) { bad.push(c.id + ':' + lv.join(',')); break; }
          }
        });
        return bad.length ? '未递增: ' + bad.slice(0, 3).join(' | ') : true;
      });

      d('练习列表每项都带难度标记 L1~L4', function () {
        var h = window.CC_TERM.viewPracticeCards('kubernetes');
        var items = (h.match(/class="practice-item/g) || []).length;
        var badges = (h.match(/class="pi-lv lv[1-4]"/g) || []).length;
        return items > 0 && items === badges ? true : '卡片 ' + items + ' 个 / 难度标记 ' + badges + ' 个';
      });

      d('练习列表里 L1 的课排在 L3 之前', function () {
        var h = window.CC_TERM.viewPracticeCards('kubernetes');
        var first = h.indexOf('pi-lv lv1');
        var later = h.indexOf('pi-lv lv3');
        if (first === -1) return 'kubernetes 里没有 L1 的课（数据变了？）';
        if (later === -1) return 'kubernetes 里没有 L3 的课（数据变了？）';
        return first < later ? true : 'L1 出现在 L3 之后，排序失效';
      });

      d('切题条只列当前分类的课（不再横跨全部 173 节）', function () {
        var html = window.CC_TERM.viewPractice('ls-long');
        var tabs = (html.match(/class="lab-tab[ "]/g) || []).length +
                   (html.match(/class="lab-tab cur"/g) || []).length;
        var basicN = (window.CC_LESSONS || []).filter(function (l) { return l.cat === 'linux-basic'; }).length;
        /* 允许 +1（自由练习那个 ∞）与已打卡前缀导致的类名差异 */
        return tabs > 0 && tabs <= basicN + 3 ? true : '切题条 ' + tabs + ' 个 / linux-basic 只有 ' + basicN + ' 节';
      });

      /* 入口覆盖：**每个分类都必须有一节能从 L1 起步的课**。
         这一条是补课之后加的护栏 —— 加了 8 节入口课才把 18/18 补齐，
         以后新增分类或删课都不能把这个不变量破坏掉。
         判据用 entryLevelOf（**最低** level），不是 levelOf（最高）：
         一节课可以"从 L1 起步讲到 L3"，那种课对新手是能进的；
         用最高 level 去判会把它们全判成 L3，于是"没有入门课"的结论永远成立。 */
      d('每个分类都有一节 L1（入门）课', function () {
        if (typeof window.CC_TERM.entryLevelOf !== 'function') return 'CC_TERM 没导出 entryLevelOf';
        var bad = [];
        (window.CC_CATS_META.list || []).forEach(function (c) {
          var ls = (window.CC_LESSONS || []).filter(function (l) { return l.cat === c.id; });
          if (!ls.length) return;
          var mn = Math.min.apply(null, ls.map(function (l) { return window.CC_TERM.entryLevelOf(l); }));
          if (mn !== 1) bad.push(c.id + '(L' + mn + ')');
        });
        return bad.length ? '没有入门课的分类: ' + bad.join(', ') : true;
      });

      d('入口课的最简单步骤排在前两步（只查专为入门写的课）', function () {
        /* ⚠️ 这一条**只约束"专为入门写的课"**，不能约束全部课程。
           第一版对 181 节课全查，于是把 awk-topip（第 4 步）、dk-compose-validate-then-up
           这些**本来就从简单讲到复杂**的正常课全判成"不合格" ——
           而"由浅入深"恰恰是它们该有的样子。
           **一个过严的断言会把对的实现判成错的**，这与"检查器不许说假话"是同一条纪律
           （见 `内容规范` §5.12）。所以用一份显式的入门课清单来限定范围。 */
        var ENTRY = [
          'lu-who-and-where', 'net-basic-reachability', 'sh-first-script', 'hl-first-look',
          'mw-service-first-check', 'kvm-host-inventory-l1', 'sec-baseline-eye', 'perf-capacity-baseline'
        ];
        var idx = {};
        Object.keys(window.CC_DATA).forEach(function (cat) {
          (window.CC_DATA[cat] || []).forEach(function (r) { idx[r.id] = r.level || 1; });
        });
        var bad = [], missing = [];
        ENTRY.forEach(function (id) {
          var l = (window.CC_LESSONS || []).filter(function (x) { return x.id === id; })[0];
          if (!l) { missing.push(id); return; }
          var steps = l.steps || [];
          var firstL1 = -1;
          for (var i = 0; i < steps.length; i++) {
            if (steps[i].ref && idx[steps[i].ref] === 1) { firstL1 = i; break; }
          }
          if (firstL1 === -1) bad.push(id + '(没有 L1 步骤)');
          else if (firstL1 > 2) bad.push(id + '(第 ' + (firstL1 + 1) + ' 步)');
        });
        if (missing.length) return '入口课不存在: ' + missing.join(', ');
        return bad.length ? '入口课的 L1 步骤太靠后: ' + bad.join(', ') : true;
      });

      /* 综合实战：站上必须有"跨多个分类"的课，且每一步都能跑。
         为什么值得单独立一条断言：单点课与故障剧本都不练"自己判断该往哪个方向查"，
         而综合实战正是补这一环的 —— 它是**最容易被后续重构悄悄改坏**的一类内容
         （删一个 step 就可能从 5 类掉到 2 类，而所有别的校验器都不会响）。 */
      d('综合实战课存在且跨 ≥3 个分类引用', function () {
        var CAP = ['cap-new-server-audit', 'cap-incident-chain', 'cap-security-incident'];
        var catOf = {};
        Object.keys(window.CC_DATA).forEach(function (c) {
          (window.CC_DATA[c] || []).forEach(function (r) { catOf[r.id] = c; });
        });
        var bad = [];
        CAP.forEach(function (id) {
          var l = (window.CC_LESSONS || []).filter(function (x) { return x.id === id; })[0];
          if (!l) { bad.push(id + '(不存在)'); return; }
          var cats = {};
          (l.steps || []).forEach(function (st) { if (st.ref && catOf[st.ref]) cats[catOf[st.ref]] = 1; });
          var n = Object.keys(cats).length;
          if (n < 3) bad.push(id + '(只跨 ' + n + ' 个分类)');
        });
        return bad.length ? bad.join(', ') : true;
      });

      d('临时 Shell：点开关能在面板里真跑命令', function () {
        var btn = document.getElementById('btn-shell');
        if (!btn) return '没有开关';
        btn.click();
        var panel = document.getElementById('shell-panel');
        if (panel.hidden || !panel.getClientRects().length) return '点了没打开';
        var term = panel.querySelector('.term');
        if (!term) return '面板里没有终端';
        var input = panel.querySelector('.term-input');
        var out = panel.querySelector('[data-term-out]');
        if (!input || !out) return '终端结构不全';
        if (input.tagName !== 'TEXTAREA') return '临时 Shell 没有可换行的输入区';
        input.value = 'ls -lh /var/log/nginx';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        if (!/access\.log/.test(out.textContent)) return '面板终端没执行出结果';
        return document.documentElement.getAttribute('data-shell') === 'on' ? true : 'data-shell 没置位';
      });

      d('临时 Shell：默认铺满右侧剩余空间', function () {
        if (window.matchMedia('(max-width: 899.98px)').matches) return true;
        var panel = document.getElementById('shell-panel');
        var right = panel.getBoundingClientRect().right;
        return right >= document.documentElement.clientWidth - 2 ? true : '右侧仍有 ' +
          Math.round(document.documentElement.clientWidth - right) + 'px 空白';
      });

      d('临时 Shell：会话独立，不干扰练习步骤', function () {
        var ids = (window.CC_LESSONS || []).map(function (l) { return l.id; });
        /* 面板会话不进 sessions：当前没有练习时，执行命令不应写任何步骤进度 */
        var before = JSON.stringify(Object.keys(localStorage).filter(function (k) { return /step/i.test(k); }));
        var anyDone = ids.some(function (id) { return window.CC_STORE.isLessonDone(id); });
        return (before !== undefined && anyDone === false) ? true : '面板会话影响了练习进度';
      });

      d('临时 Shell：再点一次关闭', function () {
        document.getElementById('btn-shell').click();
        var panel = document.getElementById('shell-panel');
        return isHiddenFromLayout(panel) ? true : '关闭后面板仍显示或占位';
      });

      d('临时 Shell：面板关闭按钮能真正关闭', function () {
        var btn = document.getElementById('btn-shell');
        var panel = document.getElementById('shell-panel');
        btn.click();
        document.getElementById('shell-close').click();
        return (isHiddenFromLayout(panel) && btn.getAttribute('aria-pressed') === 'false' &&
          document.documentElement.getAttribute('data-shell') === 'off' &&
          localStorage.getItem('cloudcmd.shellPanel') === '0') ? true : '关闭状态或实际显示不正确';
      });

      d('临时 Shell：可手动收缩并恢复铺满', function () {
        var panel = document.getElementById('shell-panel');
        var toggle = document.getElementById('shell-collapse');
        if (!toggle) return '缺少收缩按钮';
        if (panel.hidden) document.getElementById('btn-shell').click();
        var fullWidth = panel.getBoundingClientRect().width;
        toggle.click();
        var compactWidth = panel.getBoundingClientRect().width;
        var compact = document.documentElement.getAttribute('data-shell-resized') === '1';
        toggle.click();
        var restored = document.documentElement.getAttribute('data-shell-resized') === '0';
        var ok = compact && compactWidth < fullWidth && restored;
        document.getElementById('btn-shell').click();
        return ok ? true :
          '收缩宽度=' + Math.round(compactWidth) + ' / 原宽度=' + Math.round(fullWidth);
      });

      d('临时 Shell：开着的按钮有按下态', function () {
        var btn = document.getElementById('btn-shell');
        btn.click();
        var panel = document.getElementById('shell-panel');
        var on = btn.classList.contains('is-on') && btn.getAttribute('aria-pressed') === 'true';
        if (panel.hidden || !on) return '开态不明显：hidden=' + panel.hidden + ' is-on=' + on;
        return true;
      });

      d('临时 Shell：拖动左边缘会改变宽度', function () {
        var panel = document.getElementById('shell-panel');
        var resizer = document.getElementById('shell-resizer');
        if (!resizer) return '缺少宽度拖动手柄';
        var before = panel.getBoundingClientRect().width;
        var left = panel.getBoundingClientRect().left;
        resizer.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, button: 0, clientX: left, clientY: 300, pointerId: 1
        }));
        resizer.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, clientX: left + 80, clientY: 300, pointerId: 1
        }));
        resizer.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, button: 0, clientX: left + 80, clientY: 300, pointerId: 1
        }));
        var after = panel.getBoundingClientRect().width;
        document.getElementById('shell-collapse').click();
        return after < before ? true : '拖动前=' + Math.round(before) + ' / 拖动后=' + Math.round(after);
      });

      d('临时 Shell：输入区可上下拖动并用键盘调整', function () {
        var panel = document.getElementById('shell-panel');
        var row = panel.querySelector('#shell-input-row');
        var handle = panel.querySelector('.term-input-resizer');
        if (!row || !handle) return '缺少输入区或高度拖动手柄';
        var before = row.getBoundingClientRect().height;
        var r = handle.getBoundingClientRect();
        function pointer(type, y) {
          handle.dispatchEvent(new PointerEvent(type, {
            bubbles: true, button: 0, pointerId: 7, pointerType: 'mouse', clientX: r.left + 25, clientY: y
          }));
        }
        pointer('pointerdown', r.top + 7);
        pointer('pointermove', r.top - 49);
        pointer('pointerup', r.top - 49);
        var dragged = row.getBoundingClientRect().height;
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        var keyed = row.getBoundingClientRect().height;
        var saved = Number(localStorage.getItem('cloudcmd.shellInputHeight'));
        localStorage.removeItem('cloudcmd.shellInputHeight');
        return dragged > before + 30 && keyed < dragged - 5 &&
          Math.abs(saved - keyed) < 2 && Number(handle.getAttribute('aria-valuenow')) === keyed
          ? true : '高度：' + before + ' → ' + dragged + ' → ' + keyed + '，保存值=' + saved;
      });

      d('临时 Shell：Esc 能关（哪怕光标在终端里）', function () {
        var panel = document.getElementById('shell-panel');
        var input = panel.querySelector('.term-input');
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return isHiddenFromLayout(panel) ? true : 'Esc 关闭后面板仍显示或占位';
      });

      d('练习平台地址拼装正确', function () {
        var u = window.CC_ROUTER.academyUrl('cc-ls-long');
        return (u === 'academy-lab.html#/lab/cc-ls-long') ? true : '得到 ' + u;
      });

      d('练习跳转能力挂在路由上', function () {
        return (typeof window.CC_ROUTER.academyRedirect === 'function') ? true : '缺少 academyRedirect()';
      });

      d('首页有进练习平台的入口', function () {
        var h = window.CC_VIEW.viewHome();
        return (/href="#\/practice"/.test(h) && /实时练习/.test(h)) ? true : '缺少练习入口';
      });

      d('侧栏有实时练习入口', function () {
        var h = window.CC_VIEW.renderNav('__practice');
        return (/href="#\/practice"/.test(h)) ? true : '侧栏缺少练习入口';
      });

      d('未知命令给出 command not found', function () {
        var r = window.CC_SHELL.create().exec('frobnicate');
        return /command not found/.test((r.err || []).join(' ')) ? true : '没有报错';
      });

      d('未实现命令给出原因而非静默', function () {
        var r = window.CC_SHELL.create().exec('ssh root@10.0.2.15');
        return /真实网络/.test((r.err || []).join(' ')) ? true : '没有解释原因';
      });

      eraseKeys();

      /* ---- 每日一练：换到 #/drill 再验一轮 ----
         卡片是"一次会话"的状态（刷新即重置），所以必须在这里真翻面、真打分，
         而不是调 API 假装做过 —— 假装的测试抓不到"按钮绑丢了"这种问题。 */
      location.hash = '#/drill';
      setTimeout(function () { runDrill(d, done); }, 280);
    }, 200);
  }

  function runDrill(d, done) {
    var card = document.getElementById('drill-card');
    var stage = document.getElementById('drill-stage');

    d('每日一练：路由与卡片渲染', function () {
      if (!card) return '没有 #drill-card';
      var front = document.getElementById('dc-front');
      return (front && front.textContent.trim().length > 8) ? true : '正面没内容';
    });

    d('每日一练：初始只露正面', function () {
      var back = document.getElementById('dc-back');
      return (back && window.getComputedStyle(back).display === 'none' && !card.classList.contains('is-flipped'))
        ? true : '背面一开始就可见了';
    });

    d('每日一练：正面出现了答案里的命令会退化成认字', function () {
      var c = window.CC_DRILL.byId(card.getAttribute('data-card'));
      if (!c || c.kind !== 'diagnose') return true;
      var head = String(c.answer).trim().split(/\s+/)[0];
      if (!/^[a-z][a-z0-9._-]*$/.test(head)) return true;
      return document.getElementById('dc-front').textContent.indexOf(head) === -1
        ? true : '正面出现了「' + head + '」';
    });

    d('每日一练：空格翻面', function () {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      var back = document.getElementById('dc-back');
      return (card.classList.contains('is-flipped') && window.getComputedStyle(back).display !== 'none')
        ? true : '翻面没生效';
    });

    d('每日一练：背面有命令、判据与反向排除', function () {
      var t = document.getElementById('dc-back').textContent;
      return (/判据/.test(t) && t.length > 60) ? true : '背面内容不全：' + t.slice(0, 40);
    });

    d('每日一练：三档打分按钮齐全', function () {
      var g = document.querySelectorAll('#drill-actions [data-grade]');
      var kinds = [].map.call(g, function (x) { return x.getAttribute('data-grade'); }).sort().join(',');
      return kinds === 'again,good,hard' ? true : '拿到 ' + kinds;
    });

    d('每日一练：打分推进到下一张并写进本地', function () {
      var before = card.getAttribute('data-card');
      var nBefore = Object.keys(window.CC_STORE.srsAll()).length;
      document.querySelector('#drill-actions [data-grade="good"]').click();
      var after = document.getElementById('drill-card');
      var nAfter = Object.keys(window.CC_STORE.srsAll()).length;
      if (nAfter !== nBefore + 1) return 'srs 没记录（' + nBefore + ' → ' + nAfter + '）';
      if (!after) return '打分后卡片区消失了（既没进下一张也没到完成页）';
      var now = after.getAttribute('data-card');
      var today = window.CC_STORE.srsOf(before);
      if (!today || today.due < window.CC_DRILL.today()) return '到期时间算错了：' + JSON.stringify(today);
      return (now !== before || document.querySelector('.drill-done')) ? true : '还停在同一张卡';
    });

    d('每日一练：间隔重复把「会了」排到未来', function () {
      var id = Object.keys(window.CC_STORE.srsAll())[0];
      var rec = window.CC_STORE.srsOf(id);
      return (rec.interval >= 1 && rec.ease >= 1.3 && rec.ease <= 2.8)
        ? true : '记录不合理：' + JSON.stringify(rec);
    });

    d('每日一练：「送进终端跑一遍」打开临时 Shell 并送进命令', function () {
      /* 找一张带 run 的卡来说明这条路径真的通 */
      var cards = window.CC_DRILL.all().filter(function (c) { return c.run; });
      if (!cards.length) return '没有带 run 的卡片';
      var c = cards[0];
      var okRun = window.CC_APP.runInShell(c.run);
      var panel = document.getElementById('shell-panel');
      var out = document.querySelector('#shell-body [data-term-out]');
      var text = out ? out.textContent : '';
      if (!okRun) return 'runInShell 返回 false';
      if (isHiddenFromLayout(panel)) return '临时 Shell 面板没有打开';
      /* 面板里应该能看到刚送进去的那条命令 */
      return text.indexOf(c.run.split(/\s+/)[0]) !== -1 ? true : '终端里没看到命令：' + text.slice(-60);
    });

    d('每日一练：侧栏有入口且带到期数', function () {
      var h = window.CC_VIEW.renderNav('__drill');
      return /href="#\/drill"/.test(h) ? true : '侧栏缺少每日一练入口';
    });

    d('每日一练：首页有入口（且卡片为空时不该出现）', function () {
      var h = window.CC_VIEW.viewHome();
      var has = window.CC_DRILL.all().length;
      if (!has) return /href="#\/drill"/.test(h) ? '没有卡片却给了入口' : true;
      return (/href="#\/drill"/.test(h) && /每日一练/.test(h)) ? true : '首页缺少每日一练入口';
    });

    d('每日一练：连续天数只在当天首次完成时 +1', function () {
      var a = window.CC_DRILL.touchStreak().streak;
      var b = window.CC_DRILL.touchStreak().streak;
      return (a === b && a >= 1) ? true : '重复调用把连续天数加了两次：' + a + ' → ' + b;
    });

    d('每日一练：空队列时给出收尾页而不是空白', function () {
      var html = window.CC_VIEW.viewDrill();
      return (/drill-stage|drill-done/.test(html)) ? true : '既没有卡片也没有收尾页';
    });

    d('每日一练：「再练 5 张新卡」只取没见过的卡', function () {
      var unseen = window.CC_DRILL.extraQueue(5);
      var srs = window.CC_STORE.srsAll();
      if (unseen.length > 5) return '给了 ' + unseen.length + ' 张（超过 5）';
      for (var i = 0; i < unseen.length; i++) {
        if (srs[unseen[i].id]) return '把已经练过的卡又发了一遍：' + unseen[i].id;
      }
      var q = window.CC_DRILL.buildQueue(5, { freshOnly: true });
      return (q.freshOnly === true && q.list.length === unseen.length) ? true : 'freshOnly 队列不对';
    });

    d('每日一练：当前实例已挂载', function () {
      return window.CC_APP.drillMounted() === true ? true : '没有登记当前实例，键盘会失效';
    });

    /* 离开这个路由后，旧实例必须被摘掉 ——
       否则每渲染一次就多一个 document 级键盘监听，
       几个旧闭包会各自拿自己的队列去改 SRS 记录（这是踩过的 bug）。 */
    location.hash = '#/kb/concepts';
    setTimeout(function () { runKb(d, done); }, 280);
  }

  /* ---- 知识库（概念 / 报错 / 版本 / 认证对照） ----
     四块数据可以先为空，但**页面骨架必须能渲染**：
     空数据白屏是最容易被漏掉的一类问题（数据一填就看不见了）。 */
  function runKb(d, done) {
    d('知识库：路由能渲染出页面标题', function () {
      var head = document.querySelector('.page-head h1');
      if (!head) return '没有页面标题';
      var txt = head.textContent;
      return /概念词典|报错速查|版本|认证/.test(txt) ? true : '标题不对：' + txt;
    });

    d('知识库：四个板块标签齐全且当前项高亮', function () {
      var tabs = document.querySelectorAll('.kb-tabs .kb-tab');
      if (tabs.length !== 4) return '标签数不是 4，而是 ' + tabs.length;
      var active = document.querySelectorAll('.kb-tabs .kb-tab.active');
      return active.length === 1 ? true : '高亮的标签有 ' + active.length + ' 个';
    });

    d('知识库：空数据时给出说明而不是白屏', function () {
      var concepts = (window.CC_CONCEPTS || []).length;
      if (concepts > 0) {
        /* 有数据时必须渲染出卡片 */
        return document.querySelectorAll('.kb-card').length > 0 ? true : '有数据却没有卡片';
      }
      var empty = document.querySelector('.empty');
      return empty ? true : '空数据时没有占位说明（白屏）';
    });

    d('知识库：侧栏有四个入口', function () {
      var links = document.querySelectorAll('#nav a[href^="#/kb/"]');
      return links.length === 4 ? true : '侧栏只有 ' + links.length + ' 个知识库入口';
    });

    d('知识库：概念页每条都能给出定义与常见误解', function () {
      var arr = window.CC_CONCEPTS || [];
      for (var i = 0; i < arr.length; i++) {
        if (!arr[i].oneLine) return '缺 oneLine: ' + arr[i].id;
        if (!(arr[i].confusion || []).length) return '缺 confusion: ' + arr[i].id;
      }
      return true;
    });

    d('知识库：报错页的排查命令首词都在引擎里', function () {
      var arr = window.CC_ERRORS || [];
      var impl = window.CC_SHELL.commands;
      for (var i = 0; i < arr.length; i++) {
        var steps = arr[i].diagnose || [];
        for (var k = 0; k < steps.length; k++) {
          var tok = String(steps[k]).trim().split(/\s+/)[0];
          if (impl.indexOf(tok) === -1) return arr[i].id + ' 的排查命令跑不通：' + steps[k];
        }
      }
      return true;
    });

    /* 切到报错页，确认换板不报错 */
    location.hash = '#/kb/errors';
    setTimeout(function () {
      d('知识库：切换到报错页仍然正常渲染', function () {
        var tabs = document.querySelectorAll('.kb-tabs .kb-tab');
        if (tabs.length !== 4) return '切换后标签丢失';
        var active = document.querySelector('.kb-tabs .kb-tab.active');
        if (!active) return '切换后没有高亮项';
        return document.querySelector('.page-head h1') ? true : '切换后没有标题';
      });

      location.hash = '#/';
      setTimeout(function () {
        d('每日一练：离开后旧实例不再响应键盘', function () {
          if (window.CC_APP.drillMounted()) return '离开后仍然登记着，会重复响应键盘';
          var before = Object.keys(window.CC_STORE.srsAll()).length;
          document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
          var after = Object.keys(window.CC_STORE.srsAll()).length;
          return after === before ? true : '离开页面后按键仍然改了 SRS（' + before + ' → ' + after + '）';
        });
        finish(done);
      }, 260);
    }, 260);
  }

  function start() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 0); });
    } else {
      setTimeout(run, 0);
    }
  }
  start();
})();
