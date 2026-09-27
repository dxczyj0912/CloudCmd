/* ==========================================================================
   assets/js/academy-lab.js · 实验台（练习平台）功能层
   --------------------------------------------------------------------------
   这是本项目的**练习平台本体**：主站的「实时练习」入口整页跳到这里
   （index.html#/practice[/<lessonId>]  →  academy-lab.html#/lab/<lessonId>）。
     · 终端      → 跑真正的模拟 shell（assets/js/shell.js），50+ 命令都有真实格式输出
     · 讲义      → 由课程数据生成（步骤 + 命令块 + 讲解），不是写死的 HTML
     · 打卡      → 真实步骤判定：执行某一步的命令即打勾，全部完成才显示「已打卡」
     · 课程      → 自带的 6-7 / 6-8 两节 + 主站 data/lessons.js 的 25 个排障场景
     · 寻址      → #/lab/<id> 可深链；主站练习卡片、上一节/下一节都落到这里
   零依赖，file:// 下同样可用（复制自动降级到 execCommand）。
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  /* 行内标记：`code` 与 **粗体**（先抽代码再处理粗体） */
  function md(s) {
    var codes = [];
    var out = esc(s).replace(/`([^`]+)`/g, function (m, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<em>$1</em>');
    return out.replace(/\u0000(\d+)\u0000/g, function (m, i) { return '<code>' + codes[Number(i)] + '</code>'; });
  }

  /* ───────── 模拟练习环境 ───────── */
  var LAB_HOST = {
    hostname: 'cloudcmd-lab01',
    user: 'root',
    home: '/root',
    ip: '192.168.17.10',
    gateway: '192.168.17.1',
    dns: ['114.114.114.114', '223.5.5.5'],
    nic: { name: 'ens160', mac: '00:0c:29:8f:3a:21', cidr: '192.168.17.10/24', brd: '192.168.17.255' },
    nicUuid: '8b3f2f6e-4d2a-4f19-9a0e-3f0a21c9c111'
  };

  /* ───────── 本地进度（与主站共享同一份状态） ───────── */
  var LKEY = 'cloudcmd.practice.v1';
  var local = { steps: {}, lessons: {}, lessonEvidence: {} };
  function loadLocal() {
    if (window.CC_STORE) { window.CC_STORE.load(); return; }
    try {
      var raw = localStorage.getItem(LKEY);
      if (raw) {
        var o = JSON.parse(raw);
        local.steps = o.steps || {};
        local.lessons = o.lessons || {};
        local.lessonEvidence = o.lessonEvidence || {};
      }
    } catch (e) { /* 隐私模式 */ }
  }
  function saveLocal() {
    if (window.CC_STORE) return;
    try { localStorage.setItem(LKEY, JSON.stringify(local)); } catch (e) { /* 忽略 */ }
  }
  function isStepDone(id) { return window.CC_STORE ? window.CC_STORE.isStepDone(id) : !!local.steps[id]; }
  function markStepDone(id) { if (window.CC_STORE) window.CC_STORE.addStepDone(id); else { local.steps[id] = true; saveLocal(); } }
  function isLessonDone(id) { return window.CC_STORE ? window.CC_STORE.isLessonDone(id) : !!local.lessons[id]; }
  function markLessonDone(id) { if (window.CC_STORE) window.CC_STORE.addLessonDone(id); else { local.lessons[id] = true; saveLocal(); } }
  function hasOutcome(lesson) {
    return !lesson.expect || isLessonDone(lesson.id) ||
      (window.CC_STORE ? window.CC_STORE.hasLessonEvidence(lesson.id) : !!local.lessonEvidence[lesson.id]);
  }
  function markOutcome(id) {
    if (window.CC_STORE) window.CC_STORE.addLessonEvidence(id);
    else { local.lessonEvidence[id] = true; saveLocal(); }
  }

  /* ───────── 复刻页自带的两节课（截图里的 6-7 与相邻的 6-8） ───────── */
  var BUILTIN = [
    {
      id: 'builtin-6-7',
      file: 'Linux 网络排障与路由跟踪',
      title: 'Linux 网络排障与路由跟踪',
      scene: 'Linux 网络与排障',
      lead: 'Linux 网络排障与路由跟踪',
      docs: [
        { p: '上节课我们学习了通过临时命令配置Linux IP地址，但该方法仅*临时生效*，服务器重启后配置会丢失。本节课我们将学习NetworkManager提供的两款*永久配置*IP的工具：`nmcli`、`nmtui`。' },
        { p: '在学习永久IP配置工具前，先掌握*Linux日常网络排障核心命令*，快速判断服务器网络状态、定位网络故障。' },
        { h2: '一、服务器上网必备三大核心配置' },
        { p: '服务器正常联网，必须同时满足三个条件：*IP地址、网关、DNS*，三者缺一不可。我们可以通过以下三条命令分别查看。' },
        { h3: '1. 查看服务器IP地址', p: '查看本机网卡IP、MAC地址、网卡启用状态' },
        { step: 0 },
        { h3: '2. 查看服务器网关', p: '查看本机默认路由（网关地址），确认数据包出口是否正常' },
        { step: 1 },
        { h3: '3. 查看服务器DNS', p: '查看本机 DNS 服务器地址，确认域名能否被正常解析' },
        { step: 2 },
        { h2: '二、连通性排查与路由跟踪' },
        { p: 'IP、网关、DNS 都正常但域名仍不通时，用 *host* 查解析、用 *traceroute* 看每一跳走到哪里断。' },
        { h3: '4. 判断域名解析是否正常', p: '查 DNS 解析结果与 canonical name 链' },
        { step: 3 },
        { h3: '5. 跟踪到目标的路由路径', p: '看数据包经过哪些跳、在哪一跳开始丢包' },
        { step: 4 },
        { h2: '三、用 nmcli 查看并永久生效的配置' },
        { p: '前面几条都是"查看"，配置要真正落地还得靠 NetworkManager。' },
        { h3: '6. 查看网卡的完整配置', p: 'IP、网关、DNS、MAC 一次看全' },
        { step: 5 },
        { h3: '7. 查看已保存的连接配置', p: '确认配置是否已写入（永久生效的关键）' },
        { step: 6 }
      ],
      steps: [
        { title: '查看服务器IP地址', about: '看本机网卡IP、MAC地址、网卡启用状态', cmd: 'ip addr', hint: ['要同时看到 IP、掩码、MAC 和网卡是否 UP —— 老命令 ifconfig 在新系统上已经默认不装了，现在是哪个命令？', 'ip ____'], ref: 'ln-ip-addr', note: '先确认网卡已启用，并核对地址与掩码。' },
        { title: '查看服务器网关', about: '看默认路由，确认数据包出口是否正常', cmd: 'netstat -rn', hint: ['网关就是"默认路由"的下一跳：目标地址为 0.0.0.0 的那一行。哪个命令能打印内核路由表？', 'netstat ____'], ref: 'ln-netstat', note: '`Destination 0.0.0.0` 那一行的 Gateway 就是默认网关。' },
        { title: '查看服务器DNS', about: '看 nameserver 配置', cmd: 'cat /etc/resolv.conf', hint: ['域名解析不了时，第一个要看的是系统告诉程序"去问哪台 DNS 服务器"的那个文件，它在 /etc 下。', 'cat ____'], ref: 'lb-cat', note: '解析不了域名时先看这里。' },
        { title: '判断域名解析是否正常', about: '查 canonical name 链与实际地址', cmd: 'host www.163.com', hint: ['要区分"DNS 服务器没答"和"答了但没有记录"——需要一条能同时给出 CNAME 链与 A 记录的查询命令。', 'host ____'], ref: 'ln-host', note: '输出会显示 CNAME 链与 A/AAAA 记录。' },
        { title: '跟踪到目标的路由路径', about: '看每一跳的延迟与丢包', cmd: 'traceroute -n www.baidu.com', hint: ['要知道数据包走到第几跳开始不通，就得让沿途每一跳都回一句话 —— 哪个命令做这件事？', 'traceroute ____ www.baidu.com'], ref: 'ln-traceroute', note: '`-n` 表示不做反向解析，便于直接观察路径。' },
        { title: '查看网卡的完整配置', about: 'IP、网关、DNS、MAC 一次看全', cmd: 'nmcli device show ens160', hint: ['前面几条都是"查看现状"，而配置要真正落地得靠 NetworkManager；先看某块网卡的完整配置，哪个子命令？', 'nmcli device ____ ens160'], ref: 'ln-nmcli', note: 'NetworkManager 的查看命令，配置永久生效靠它。' },
        { title: '查看已保存的连接配置', about: '确认配置是否已写入', cmd: 'nmcli con show', hint: ['`ip addr` 看到的地址可能是临时的，重启就丢；能列出"已写入磁盘的连接配置"的子命令是哪个？', 'nmcli con ____'], ref: 'ln-nmcli', note: '列出来的连接才是重启后仍然生效的。' }
      ],
      answer: 'ip addr && netstat -rn && cat /etc/resolv.conf && host www.163.com && traceroute -n www.baidu.com && nmcli device show ens160 && nmcli con show',
      teach: '排网络故障的顺序就藏在这 7 条命令里：**先看本机（ip addr）→ 再看出口（netstat -rn）→ 再看解析（resolv.conf、host）→ 再看路径（traceroute）→ 最后看谁在管配置（nmcli）**。三层（IP / 网关 / DNS）任意一层不对，域名都不通。'
    },
    {
      id: 'builtin-6-8',
      file: '6-8-linux 永久配置IP地址.md',
      title: '用 nmcli 永久配置 IP 地址',
      scene: 'Linux 网络连通性',
      lead: 'Linux 永久配置 IP 地址（nmcli）',
      docs: [
        { p: '临时 `ip addr add` 重启就丢，生产上必须用 NetworkManager 写进配置文件。' },
        { h2: '一、改配置' },
        { h3: '1. 改 IP 与掩码', p: '把地址写进连接配置' },
        { step: 0 },
        { h3: '2. 改网关与 DNS', p: '出口与解析一起配' },
        { step: 1 },
        { h2: '二、让配置生效并验证' },
        { h3: '3. 重新激活连接', p: '改动只有 up 之后才生效' },
        { step: 2 },
        { h3: '4. 验证结果', p: '回看 IP / 路由 / DNS' },
        { step: 3 }
      ],
      steps: [
        { title: '修改 IP 地址与掩码', about: '把地址写进连接配置', cmd: 'nmcli con mod ens160 ipv4.addresses 192.168.17.10/24', hint: ['临时 `ip addr add` 重启就丢，要把地址写进保存的配置里 —— 改连接配置用哪个子命令？', 'nmcli con ____ ens160 ipv4.addresses 192.168.17.10/24'], ref: 'ln-nmcli', note: '`con mod` 改的是保存的配置，不是运行时状态。' },
        { title: '修改网关与 DNS', about: '出口与解析一起配', cmd: 'nmcli con mod ens160 ipv4.gateway 192.168.17.1', hint: ['IP 改完了，但数据包出不了本机网段 —— 还要给这张连接配"出口"，那个属性叫什么？', 'nmcli con mod ens160 ipv4.____ 192.168.17.1'], ref: 'ln-nmcli', note: 'DNS 同理：`nmcli con mod ens160 ipv4.dns "114.114.114.114 223.5.5.5"`。' },
        { title: '重新激活连接', about: '改动生效', cmd: 'nmcli con up ens160', hint: ['配置写进磁盘了，但当前生效的还是旧地址 —— 需要哪个动作把配置重新加载一次？', 'nmcli con ____ ens160'], ref: 'ln-nmcli', note: '**改完不 up 等于没改** —— 这是最常被忘的一步。' },
        { title: '验证 IP 与路由', about: '回看是否真的生效', cmd: 'ip addr', hint: ['改完必须有一步"回看"：确认地址真的挂上去了。哪个命令能打印网卡上的地址？', 'ip ____'], ref: 'ln-ip-addr', note: '看到新地址才算成功；再 `netstat -rn` 确认网关。' }
      ],
      answer: 'nmcli con mod ens160 ipv4.addresses 192.168.17.10/24 && nmcli con up ens160 && ip addr',
      teach: '`nmcli con mod`（写配置）→ `nmcli con up`（让配置生效）→ `ip addr` / `netstat -rn`（验证），这个三步套路适用于绝大多数网络配置改动。'
    }
  ];

  /* 讲义头部的「场景」名。这里只保留**与注册表名字不同**的少量人工命名，
     其余分类一律回落到 data/_registry.js 里的分类名 ——
     否则每加一个分类都要回来手工补一次，漏了就显示成「综合练习」。 */
  var SCENE_OVERRIDE = {
    'linux-text': 'Linux 文本处理',
    'linux-user': 'Linux 用户与权限',
    'linux-net': 'Linux 网络连通性',
    'linux-storage': 'Linux 磁盘与存储',
    'docker': 'Docker 容器基础',
    'kubernetes': 'Kubernetes 入门'
  };

  function sceneOf(catId) {
    if (SCENE_OVERRIDE[catId]) return SCENE_OVERRIDE[catId];
    var meta = window.CC_CATS_META;
    var c = meta && meta.byId ? meta.byId(catId) : null;
    return (c && c.name) || '综合练习';
  }

  /* 把主站 data/lessons.js 里的练习全部接进来，章节号接着自带的 6-7 / 6-8 往下排，
     这样「上一节 / 下一节」读起来是连续的。 */
  function ccLessons() {
    var src = window.CC_LESSONS || [];
    return src.map(function (l, i) {
      return {
        id: 'cc-' + l.id,
        cc: l,
        file: '6-' + (9 + i) + '-' + l.title + '.md',
        title: l.title,
        scene: sceneOf(l.cat),
        steps: l.steps || [],
        answer: l.answer,
        expect: l.expect,
        teach: l.teach,
        prompt: l.prompt,
        task: l.task
      };
    });
  }

  var LESSONS = null;
  function lessons() {
    if (!LESSONS) LESSONS = BUILTIN.concat(ccLessons());
    return LESSONS;
  }
  function byId(id) {
    var all = lessons();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ───────── 终端 ───────── */
  var shell = null;
  var outEl, ghostEl, bodyEl, realInput, promptEl;
  var history = [], hi = -1, current = null;

  function shellOf() {
    if (!shell && window.CC_SHELL) shell = window.CC_SHELL.create(LAB_HOST);
    return shell;
  }

  /* 追加一行；cls 见 lab.css 的 .t-*（末尾补 \n，便于复制与 textContent 断言） */
  function line(text, cls) {
    var span = document.createElement('span');
    span.className = 'tl' + (cls ? ' ' + cls : '');
    span.textContent = text + '\n';
    outEl.appendChild(span);
    return span;
  }

  function scrollDown(force) {
    var gap = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight;
    if (force || gap < 120) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  /* 提示符取真实环境（复刻页是 root@jx-rocky-lab01:~#） */
  function promptText() {
    var sh = shellOf();
    if (!sh) return 'root@cloudcmd-lab01:~#';
    var cwd = sh.cwd === LAB_HOST.home ? '~' : sh.cwd;
    return sh.user + '@' + sh.host + ':' + cwd + '#';
  }
  function syncPrompt() {
    if (promptEl) promptEl.textContent = promptText();
  }

  /* 执行命令：走真 shell，输出按复刻页的 .t-* 类名上色 */
  function run(cmd, opts) {
    opts = opts || {};
    var c = String(cmd || '').trim();
    if (!c) return;
    if (c === 'clear') { outEl.innerHTML = ''; scrollDown(true); return; }
    var sh = shellOf();
    if (!sh) { line('bash: 模拟环境未加载', 't-warn'); return; }

    line(promptText() + ' ' + c, 't-dim');
    var res;
    try { res = sh.exec(c); }
    catch (err) { line('bash: 执行出错：' + err.message, 't-err'); scrollDown(true); return; }

    (res.out || []).forEach(function (l) {
      /* 复刻页的绿字用于"打卡 / 成功"这类强调，普通输出保持默认色 */
      line(l, /^(✓|🏆|恭喜|掌握 )/.test(l) ? 't-ok' : '');
    });
    (res.err || []).forEach(function (l) { line(l, 't-warn'); });

    if (!(res.out || []).length && !(res.err || []).length) {
      line('（命令执行成功，没有输出）', 't-muted');
    }
    scrollDown(opts.force);

    /* 步骤判定 */
    if (!opts.silent) judge(c, res);
  }

  /* ───────── 步骤判定与打卡 ───────── */
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function stepsOf(lesson) {
    if (!lesson) return [];
    return (lesson.steps || []).map(function (st, i) {
      /* hint（两级渐进提示）与 ref（回指命令手册）必须一起带上 ——
         早先这里只挑了 title/about/cmd/note 四个字段，
         于是课程数据里写好的提示在讲义上根本渲染不出来。 */
      return {
        id: lesson.id + '#' + i, index: i, title: st.title, about: st.about || '',
        cmd: st.cmd || '', note: st.note || '', hint: st.hint || null, ref: st.ref || '', expect: st.expect, state: st.state
      };
    });
  }
  function stepStats(lesson) {
    var all = stepsOf(lesson), done = 0;
    all.forEach(function (s) { if (isStepDone(s.id)) done++; });
    return { done: done, total: all.length, all: all };
  }

  function judge(cmd, res) {
    if (!current) return;
    var stats = stepStats(current), typed = norm(cmd);
    var evidenceHit = false;
    if (current.expect && !hasOutcome(current) && window.CC_LESSON_JUDGE &&
        window.CC_LESSON_JUDGE.outcomeMatches(current, res)) {
      for (var j = 0; j < stats.all.length; j++) {
        var candidate = stats.all[j];
        if (norm(candidate.cmd) !== typed) continue;
        if (!window.CC_LESSON_JUDGE.check(candidate, typed, res, shellOf()).ok) continue;
        markOutcome(current.id);
        evidenceHit = true;
        break;
      }
    }
    for (var i = 0; i < stats.all.length; i++) {
      var st = stats.all[i];
      if (isStepDone(st.id) || !st.cmd) continue;
      var verdict = window.CC_LESSON_JUDGE
        ? window.CC_LESSON_JUDGE.check(st, typed, res, shellOf())
        : { ok: res && res.code === 0 && typed === norm(st.cmd) };
      if (verdict.ok) {
        markStepDone(st.id);
        line('✓ 步骤 ' + (st.index + 1) + ' 完成：' + st.title, 't-ok');
        renderDoc();
        renderToolbar();
        maybeCheckIn();
        if (!isLessonDone(current.id) && stepStats(current).done === stats.total) {
          line('步骤已完成，但还没观察到目标结果。请核对输出并重跑对应步骤。', 't-hint');
        }
        scrollDown(true);
        return;
      }
    }
    if (evidenceHit) maybeCheckIn();
  }

  function maybeCheckIn() {
    if (!current) return;
    var st = stepStats(current);
    if (st.total && st.done === st.total && hasOutcome(current) && !isLessonDone(current.id)) {
      markLessonDone(current.id);
      line('', '');
      line('🏆恭喜！「' + current.file + '」打卡成功！', 't-ok');
      line('掌握 ' + st.total + '/' + st.total + ' 个命令（100%）', 't-ok');
      renderToolbar();
      renderDoc();
      scrollDown(true);
    }
  }

  /* ───────── 讲义渲染 ───────── */
  /* 「练习模式」：把命令先遮住，让学员自己敲。
     课程里每一步都带 hint: [概念提示, 命令骨架]，第三级就是命令本身：
       点第 1 次 → 概念提示（点破思路，不给命令）
       点第 2 次 → 命令骨架（结构与答案一致，关键那一段留空）
       点第 3 次 → 直接显示答案
     没有这一层，"跟着敲"和"自己敲"就没有区别，提示数据也白写。 */
  function practiceOn() {
    try { return localStorage.getItem('cloudcmd.lab.practice') === '1'; } catch (e) { return false; }
  }
  function setPractice(on) {
    try { localStorage.setItem('cloudcmd.lab.practice', on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function hintHtml(step) {
    var hints = (step.hint && step.hint.length) ? step.hint : null;
    if (!hints) return '';
    var btns = '';
    for (var i = 0; i < hints.length; i++) {
      btns += '<div class="cb-hint" data-hint-level="' + i + '" hidden>' +
        '<span class="cb-hint-tag">' + (i === 0 ? '提示' : '骨架') + '</span>' +
        '<span class="cb-hint-text">' + md(hints[i]) + '</span></div>';
    }
    btns += '<div class="cb-hint cb-hint-answer" data-hint-level="' + hints.length + '" hidden>' +
      '<span class="cb-hint-tag">答案</span><span class="cb-hint-text">已在上方显示</span></div>';
    return '<div class="cb-hints">' + btns + '</div>';
  }

  function cmdBlockHtml(step, idx) {
    var refLink = step.ref
      ? '<a class="cb-manual" href="index.html#/cmd/' + encodeURIComponent(step.ref) + '" target="_blank" rel="noopener" title="在命令手册里看这一条">📖 手册</a>'
      : '';
    var hintBtn = (step.hint && step.hint.length)
      ? '<button class="cb-hint-btn" type="button" data-hint="' + esc(step.id) + '">💡 提示</button>'
      : '';
    var revealBtn = (step.hint && step.hint.length)
      ? '<button class="cb-reveal" type="button" data-reveal="' + esc(step.id) + '">显示答案</button>'
      : '';
    return '<div class="cmdblock" data-cmd="' + esc(step.cmd) + '" data-step="' + esc(step.id) + '">' +
      '<div class="cmdblock-head">' +
      '<span class="cb-label">命令</span>' +
      '<span class="cb-actions">' +
      hintBtn + revealBtn + refLink +
      '<button class="cb-run" type="button" data-run="' + esc(step.cmd) + '">' +
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.2 18 12 7 18.8z"/></svg>运行</button>' +
      '<button class="cb-copy" type="button" data-copy="' + esc(step.cmd) + '">' +
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="8.6" y="8.6" width="11" height="11" rx="2"/><path d="M15.4 5.4H6.4a2 2 0 0 0-2 2v9"/></svg>复制</button>' +
      '</span></div>' +
      '<div class="cmdblock-code"><span class="cb-idx">' + String(idx + 1).padStart(2, '0') + '</span><code>' + esc(step.cmd) + '</code></div>' +
      (step.note ? '<div class="cb-note">' + md(step.note) + '</div>' : '') +
      hintHtml(step) +
      '</div>';
  }

  function renderDoc() {
    var docEl = $('#lesson-doc');
    if (!docEl || !current) return;
    var steps = stepsOf(current);
    var stats = stepStats(current);
    var h = '';

    if (current.lead) h += '<p class="ld-lead">' + esc(current.lead) + '</p>';
    if (current.prompt) h += '<p>' + md(current.prompt) + '</p>';
    if (current.task) h += '<p class="ld-goal"><em>本节目标</em>' + esc(current.task) + '</p>';

    (current.docs || []).forEach(function (item) {
      if (item.h2) h += '<h2>' + esc(item.h2) + '</h2>';
      if (item.h3) h += '<h3>' + esc(item.h3) + '</h3>';
      if (item.p) h += '<p>' + md(item.p) + '</p>';
      if (typeof item.step === 'number' && steps[item.step]) h += cmdBlockHtml(steps[item.step], item.step);
    });

    /* 没有 docs 编排的课程（来自主站 data/lessons.js 的 25 个排障场景）：
       按同一套讲义版式生成 —— 章标题 + 每条命令一个小节 + 命令块 + 要点 */
    if (!current.docs) {
      h += '<h2>本节步骤</h2>';
      h += '<p>按顺序执行下面的命令，执行对一条就自动打勾；全部完成后本节课打卡。</p>';
      steps.forEach(function (st, i) {
        h += '<h3>' + (i + 1) + '. ' + esc(st.title) + '</h3>';
        if (st.about) h += '<p>' + esc(st.about) + '</p>';
        h += cmdBlockHtml(st, i);
      });
    }

    /* 讲解：全部完成后展开 */
    if (current.teach) {
      h += '<div class="cb-teach"' + (stats.total && stats.done === stats.total ? '' : ' hidden') + '>' +
        '<b>讲解</b>' + md(current.teach) + '</div>';
    }

    h += '<div class="cb-tip">' +
      '本节共 <em>' + stats.total + ' 个步骤</em>，已完成 <em>' + stats.done + '</em> 个' +
      (stats.total && stats.done === stats.total ? '，已自动打卡。' : '，全部执行完成后自动打卡。') +
      '　终端里的命令都是真实执行（模拟机），输出为真实格式。' +
      '</div>';

    docEl.innerHTML = h;
    applyPracticeMask();
  }

  /* 练习模式遮罩：只影响"还没主动看答案"的步骤块 */
  function applyPracticeMask() {
    var on = practiceOn();
    document.body.classList.toggle('practice-mode', on);
    var blocks = document.querySelectorAll('.cmdblock');
    for (var i = 0; i < blocks.length; i++) {
      if (on) blocks[i].classList.add('masked');
      else blocks[i].classList.remove('masked');
      if (blocks[i].classList.contains('revealed')) blocks[i].classList.remove('masked');
    }
  }

  function revealStep(block) {
    block.classList.add('revealed');
    block.classList.remove('masked');
    var hints = block.querySelectorAll('.cb-hint');
    for (var i = 0; i < hints.length; i++) hints[i].hidden = false;
    var btn = block.querySelector('.cb-reveal');
    if (btn) { btn.disabled = true; btn.textContent = '已显示'; }
    var hb = block.querySelector('.cb-hint-btn');
    if (hb) hb.hidden = true;
  }

  /* 点一次给一级：先概念提示、再命令骨架、最后答案 */
  function advanceHint(btn) {
    var block = btn.closest('.cmdblock');
    if (!block) return;
    var hints = block.querySelectorAll('.cb-hint[data-hint-level]');
    var shown = 0;
    for (var i = 0; i < hints.length; i++) {
      if (hints[i].hidden) break;
      shown++;
    }
    if (shown >= hints.length) { revealStep(block); return; }
    hints[shown].hidden = false;
    /* 最后一级就是答案 —— 露出答案的同时把遮罩也解除，不然学员还得再点一次"显示答案" */
    if (shown >= hints.length - 1) { revealStep(block); return; }
    var left = hints.length - 1 - (shown + 1);
    btn.textContent = left > 0 ? '💡 再给一点（还剩 ' + left + ' 级）' : '💡 最后一级：直接看答案';
  }

  function renderToolbar() {
    var st = stepStats(current);
    var btn = $('#tb-check');
    if (btn) {
      var done = !!(st.total && st.done === st.total);
      btn.classList.toggle('is-done', done);
      btn.setAttribute('aria-disabled', done ? 'false' : 'true');
      btn.title = done ? '本节已完成 ' + st.total + '/' + st.total + ' 个步骤'
                       : '还差 ' + (st.total - st.done) + ' 个步骤：' + st.done + '/' + st.total;
      var label = $('#tb-check-label');
      if (label) label.textContent = done ? '已完成' : '未完成';
    }
    var count = $('#lesson-count');
    if (count) count.textContent = st.done + '/' + st.total + ' 个步骤';    var lh = $('.lh-title');
    if (lh && current) lh.textContent = current.title || current.file;
    /* 终端标题栏的副标题跟着当前场景走 */
    var sub = $('.term-bar-text small');
    if (sub && current) sub.textContent = (current.scene || 'Linux 网络与排障') + ' · 模拟终端';
    if (current) document.title = 'CloudCmd · ' + (current.title || 'Linux 网络排障练习');
  }

  function renderTabs() {
    var nav = $('.lesson-tabs');
    if (!nav || !current) return;

    var steps = stepsOf(current);
    var stats = stepStats(current);
    var tocHtml = '<option selected>' + esc(current.title || current.file) + '</option>';
    steps.forEach(function (st) { tocHtml += '<option>' + esc(st.title) + '</option>'; });

    nav.innerHTML = '<span class="lesson-tab-meta">本节 ' + steps.length + ' 步 · 已完成 ' + stats.done + '</span>' +
      '<button class="mini-btn practice-btn' + (practiceOn() ? ' on' : '') + '" id="btn-practice" type="button" ' +
      'data-practice-toggle="1" title="开启后先把命令遮住，自己敲；卡住了点 💡 提示，一级一级给">' +
      (practiceOn() ? '🙈 练习模式：开' : '👀 练习模式：关') + '</button>' +
      '<span class="select-wrap select-wrap-mini"><select class="tb-select select-mini" id="tb-toc" aria-label="讲义内目录">' + tocHtml + '</select>' +
      '<svg class="select-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5 12 15.5 18 9.5"/></svg></span>' +
      '<button class="mini-btn" id="btn-min" type="button" aria-label="聚焦终端" title="聚焦终端">' +
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>';

    bindMini();
  }

  /* 前后节：复刻页只实现了 6-6 / 6-7 / 6-8 这一小段，边界写实在的按钮，
     没实现的那一节做成灰掉的颜色标记（而不是点不动的链接） */
  var NEIGHBOR = {
    'builtin-6-7': {
      prevHtml: '<span class="lf-nav is-ghost" title="复刻页未收录 6-6，实际实现的是 6-8">上一节：6-6-linux 临时配置IP地址</span>',
      next: 'builtin-6-8'
    },
    'builtin-6-8': {
      prev: 'builtin-6-7',
      nextHtml: '<span class="lf-nav is-ghost" title="复刻页未收录 6-9">下一节：6-9-linux 主机名与 hosts 解析</span>'
    }
  };

  function renderFoot() {
    var foot = $('.lesson-foot');
    if (!foot) return;
    var all = lessons();
    var i = all.indexOf(current);
    var spec = NEIGHBOR[current.id] || {};
    var prev = spec.prev ? byId(spec.prev) : (spec.prevHtml ? null : all[i - 1]);
    var next = spec.next ? byId(spec.next) : (spec.nextHtml ? null : all[i + 1]);

    function label(lesson) { return lesson ? (lesson.title || lesson.file) : ''; }
    foot.innerHTML =
      (prev
        ? '<button class="lf-nav" type="button" data-open="' + esc(prev.id) + '"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>上一节：' + esc(label(prev)) + '</button>'
        : (spec.prevHtml || '<span class="lf-nav is-ghost">已是第一节</span>')) +
      (next
        ? '<button class="lf-nav" type="button" data-open="' + esc(next.id) + '">下一节：' + esc(label(next)) + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>'
        : (spec.nextHtml || '<span class="lf-nav is-ghost">已是最后一节</span>'));
  }

  /* ───────── 切换课程 ───────── */
  function open(id) {
    current = byId(id) || lessons()[0];
    renderTabs();
    renderDoc();
    renderToolbar();
    renderFoot();
    var lb = $('.lesson-body');
    if (lb) lb.scrollTop = 0;
    try { location.hash = '#/lab/' + current.id; } catch (e) { /* ignore */ }
    scrollDown(true);
  }

  /* ───────── 输入：回车 / 历史 / 清屏 ───────── */
  function syncGhost() {
    ghostEl.textContent = realInput.value;
    scrollDown(true);
  }
  function submit() {
    var v = realInput.value;
    history.push(v.trim());
    hi = history.length;
    realInput.value = '';
    syncGhost();
    if (v.trim()) run(v, { force: true });
    syncPrompt();
  }
  function focusTerm() {
    if (window.getSelection && String(window.getSelection()).length) return;
    realInput.focus({ preventScroll: true });
    bodyEl.classList.add('is-focus');
  }

  /* ───────── 桌面左右分栏 ───────── */
  function bindResizable() {
    var lab = $('.lab');
    var split = $('#lab-resizer');
    var term = $('#term');
    if (!lab || !split || !term) return;

    var leftMin = 25, leftMax = 62;
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function remember(key, value) {
      try { localStorage.setItem(key, String(value)); } catch (e) { /* file:// / 隐私模式 */ }
    }
    function read(key) {
      try {
        var raw = localStorage.getItem(key);
        var v = raw === null ? NaN : parseFloat(raw);
        return isFinite(v) ? v : null;
      } catch (e) { return null; }
    }
    function leftValue() {
      var r = lab.getBoundingClientRect();
      return r.width ? term.getBoundingClientRect().width / r.width * 100 : 38;
    }
    function setLeft(value, save) {
      var r = lab.getBoundingClientRect();
      var min = window.innerWidth > 1100 && r.width ? Math.max(leftMin, 360 / r.width * 100) : leftMin;
      var pct = clamp(Number(value) || 38, min, leftMax);
      lab.style.setProperty('--lab-left', pct.toFixed(2) + '%');
      split.setAttribute('aria-valuemin', Math.round(min));
      split.setAttribute('aria-valuenow', Math.round(pct));
      if (save) remember('cloudcmd.lab.left', pct.toFixed(2));
    }
    var savedLeft = read('cloudcmd.lab.left');
    if (savedLeft !== null) setLeft(savedLeft, false);
    else split.setAttribute('aria-valuenow', Math.round(leftValue()));

    var active = null;
    function endDrag() {
      if (!active) return;
      try { split.releasePointerCapture(active.id); } catch (e) { /* capture may already be released */ }
      split.classList.remove('is-dragging');
      lab.classList.remove('is-dragging');
      active = null;
      document.body.classList.remove('is-resizing');
    }
    split.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      active = { id: e.pointerId, x: e.clientX, start: leftValue() };
      split.classList.add('is-dragging');
      lab.classList.add('is-dragging');
      document.body.classList.add('is-resizing');
      try { split.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    split.addEventListener('pointermove', function (e) {
      if (!active || active.id !== e.pointerId) return;
      var r = lab.getBoundingClientRect();
      if (!r.width) return;
      setLeft(active.start + ((e.clientX - active.x) / r.width) * 100, false);
    });
    split.addEventListener('pointerup', function (e) { if (active && active.id === e.pointerId) { remember('cloudcmd.lab.left', parseFloat(getComputedStyle(lab).getPropertyValue('--lab-left')) || 38); endDrag(); } });
    split.addEventListener('pointercancel', function (e) { if (active && active.id === e.pointerId) endDrag(); });
    split.addEventListener('keydown', function (e) {
      var now = leftValue();
      var step = e.shiftKey ? 5 : 2;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setLeft(now - step, true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setLeft(now + step, true); }
      else if (e.key === 'Home') { e.preventDefault(); setLeft(leftMin, true); }
      else if (e.key === 'End') { e.preventDefault(); setLeft(leftMax, true); }
      else if (e.key === 'Enter') { e.preventDefault(); setLeft(Math.min(38, 680 / lab.getBoundingClientRect().width * 100), true); }
    });
  }

  /* 命令历史：键盘 ↑↓ 与手机端快捷键条的 ↑↓ 共用这一份逻辑，
     避免两处各写一遍后行为跑偏 */
  function histMove(dir) {
    if (!history.length) return;
    if (dir < 0) hi = Math.max(0, hi - 1);
    else hi = Math.min(history.length, hi + 1);
    realInput.value = history[hi] || '';
    syncGhost();
  }

  /* ═════════ 手机端：快捷键条 / 全屏终端 / 软键盘适配 ═════════
     手机上做练习有三个桌面不存在的问题：
       1. `|` `~` `$` `*` 这些字符藏在符号键盘里，方向键干脆没有 → 快捷键条
       2. 讲义与终端要同时在场（看一步 → 点运行 → 看输出），但屏幕只有 667px 高
          → 讲义占满剩余空间 + 终端贴底 40%，可一键切全屏终端
       3. 软键盘弹出会盖住半个屏幕，而 iOS 上 innerHeight 不变（只有
          visualViewport.height 变）→ 用 visualViewport 把 body 高度压下去，
          输入行自然浮在键盘之上
     ⚠️ 全部逻辑都可重入：resize 与旋转屏幕时会重新计算，不依赖"只在窄屏执行一次" */
  function bindMobile() {
    var keys = $('#term-keys');
    var fullBtn = $('#term-full');

    /* --- 快捷键条 --- */
    if (keys) {
      keys.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-k]');
        if (!btn) return;
        var k = btn.getAttribute('data-k');
        if (k === 'up') { histMove(-1); }
        else if (k === 'down') { histMove(1); }
        else if (k === 'clear') { outEl.innerHTML = ''; scrollDown(true); }
        else {
          var text = (k === 'space') ? ' ' : k;
          var v = realInput.value;
          /* 插到光标处而不是简单追加：手机上改一个字符很贵 */
          var start = realInput.selectionStart;
          var end = realInput.selectionEnd;
          if (typeof start === 'number' && typeof end === 'number') {
            realInput.value = v.slice(0, start) + text + v.slice(end);
            var pos = start + text.length;
            try { realInput.setSelectionRange(pos, pos); } catch (err) { /* ignore */ }
          } else {
            realInput.value = v + text;
          }
          syncGhost();
        }
        /* 点完按钮要把焦点还给输入框，否则下一次敲键盘没反应 */
        realInput.focus({ preventScroll: true });
        bodyEl.classList.add('is-focus');
      });
    }

    /* --- 全屏终端开关 --- */
    function setFull(on) {
      document.body.classList.toggle('term-full', !!on);
      if (fullBtn) fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      try { localStorage.setItem('cloudcmd.termFull', on ? '1' : '0'); } catch (err) { /* ignore */ }
      scrollDown(true);
    }
    if (fullBtn) {
      fullBtn.addEventListener('click', function () {
        setFull(!document.body.classList.contains('term-full'));
      });
    }
    try {
      if (localStorage.getItem('cloudcmd.termFull') === '1' && window.innerWidth <= 760) setFull(true);
    } catch (err) { /* ignore */ }

    /* --- 软键盘：把可视高度同步成 CSS 变量 --- */
    var root = document.documentElement;
    function syncViewport() {
      var vv = window.visualViewport;
      if (!vv) {
        root.style.removeProperty('--vvh');
        root.style.removeProperty('--kbd');
        return;
      }
      root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
      var kbd = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--kbd', kbd + 'px');
      document.body.classList.toggle('kb-open', kbd > 80);
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewport);
      window.visualViewport.addEventListener('scroll', syncViewport);
    }
    window.addEventListener('orientationchange', function () { setTimeout(syncViewport, 260); });
    window.addEventListener('resize', syncViewport);
    syncViewport();

    /* 聚焦输入框时确保它没被键盘盖住 */
    realInput.addEventListener('focus', function () {
      setTimeout(function () {
        syncViewport();
        try { realInput.scrollIntoView({ block: 'nearest' }); } catch (err) { /* ignore */ }
        scrollDown(true);
      }, 60);
    });
  }

  /* ───────── 复制（file:// 降级） ───────── */
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      var label = btn.lastChild;
      if (!label || label.nodeType !== 3) return;
      if (!btn.getAttribute('data-label')) btn.setAttribute('data-label', label.nodeValue);
      label.nodeValue = ' 已复制';
      setTimeout(function () { label.nodeValue = btn.getAttribute('data-label'); }, 1200);
    };
    var fb = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
      document.body.removeChild(ta);
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fb);
    } else fb();
  }

  /* ───────── 小交互（每次重渲染后需重新绑定） ───────── */
  function bindMini() {
    var minBtn = $('#btn-min');
    if (minBtn) minBtn.addEventListener('click', function () { focusTerm(); });
    var toc = $('#tb-toc');
    if (toc) toc.addEventListener('change', function () {
      var t = toc.value;
      var steps = stepsOf(current);
      for (var i = 0; i < steps.length; i++) {
        if (steps[i].title === t) {
          var el = document.querySelector('[data-step="' + steps[i].id + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      toc.blur();
    });
  }

  function bindOnce() {
    bodyEl.addEventListener('mousedown', function (e) {
      if (e.target.closest('a')) return;
      setTimeout(focusTerm, 0);
    });
    bodyEl.addEventListener('click', function (e) {
      if (!e.target.closest('a')) focusTerm();
    });
    bodyEl.addEventListener('mouseup', function () { bodyEl.classList.remove('is-focus'); });
    realInput.addEventListener('input', syncGhost);
    realInput.addEventListener('focus', function () { bodyEl.classList.add('is-focus'); });
    realInput.addEventListener('blur', function () { bodyEl.classList.remove('is-focus'); });
    realInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); histMove(-1); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); histMove(1); return; }
      if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        outEl.innerHTML = '';
        scrollDown(true);
      }
    });

    /* 讲义联动：运行 / 复制 / 上一节下一节 */
    document.addEventListener('click', function (e) {
      var runBtn = e.target.closest('[data-run]');
      if (runBtn) {
        var blk = runBtn.closest('.cmdblock');
        if (blk) { blk.classList.add('is-hot'); setTimeout(function () { blk.classList.remove('is-hot'); }, 700); }
        focusTerm();
        run(runBtn.getAttribute('data-run'), { force: true });
        return;
      }
      var copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) { copyText(copyBtn.getAttribute('data-copy'), copyBtn); return; }

      /* 渐进式提示：一次点一级，点满就显示答案 */
      var hintBtn = e.target.closest('[data-hint]');
      if (hintBtn) { advanceHint(hintBtn); return; }
      var revealBtn = e.target.closest('[data-reveal]');
      if (revealBtn) {
        var rb = revealBtn.closest('.cmdblock');
        if (rb) revealStep(rb);
        return;
      }
      /* 练习模式开关 */
      var pmBtn = e.target.closest('[data-practice-toggle]');
      if (pmBtn) {
        setPractice(!practiceOn());
        document.body.classList.toggle('practice-mode', practiceOn());
        pmBtn.classList.toggle('on', practiceOn());
        pmBtn.textContent = practiceOn() ? '🙈 练习模式：开' : '👀 练习模式：关';
        applyPracticeMask();
        return;
      }

      var jump = e.target.closest('[data-open]');
      if (jump) { open(jump.getAttribute('data-open')); return; }
    });

    /* 已打卡徽标：真实反映完成度，未完成时不去跳节，只把状态说清楚 */
    var check = $('#tb-check');    if (check) check.addEventListener('click', function () {
      var st = stepStats(current);
      var done = !!(st.total && st.done === st.total);
      var hint = document.querySelector('.sb-hint');
      if (hint) {
        hint.textContent = done
          ? '本节 ' + st.total + ' 个步骤已全部完成· 可在讲义里逐条回看'
          : '还没完成：已完成 ' + st.done + '/' + st.total + ' 个步骤，继续运行右侧命令';
      }
    });

    window.addEventListener('hashchange', function () { handleHash(); });
    window.addEventListener('resize', scrollDown);
  }

  /* ───────── 首屏：给出简短使用提示 ───────── */
  function paintInitial() {
    line('CloudCmd Linux 网络排障练习', 't-ok');
    line('按右侧步骤执行命令，或直接在这里输入。', 't-muted');
    line('', '');
  }

  function showLesson(id) {
    if (id) { open(id); }
    else { renderTabs(); renderDoc(); renderToolbar(); renderFoot(); }
  }

  function handleHash() {
    var h = String(location.hash || '');
    /* 主站练习卡片给的是 #/practice/<id>，这里也认，直接落到对应课程 */
    var mPrac = h.match(/^#\/practice(?:\/(.+))?$/);
    if (mPrac) {
      var pid = mPrac[1] ? decodeURIComponent(mPrac[1]) : '';
      showLesson(pid ? 'cc-' + pid : null);
      return;
    }
    var mLab = h.match(/^#\/lab\/(.+)$/);
    if (mLab) { showLesson(decodeURIComponent(mLab[1])); return; }
    if (h === '' || h === '#/' || h === '#/workbench') showLesson(null);
  }

  /* ───────── 启动 ───────── */
  function boot() {
    outEl = $('#term-out');
    ghostEl = $('#term-ghost');
    bodyEl = $('#term-body');
    realInput = $('#term-real-input');
    promptEl = $('.term-prompt');
    if (!outEl || !realInput) return;

    loadLocal();
    paintInitial();

    /* 默认定位：hash 指定了课程 / 手册就按它来，否则进截图那一节。
       支持 #/lab/<id>、#/practice/<id>（主站练习卡片给的形式）两种写法 */
    var want = '';
    var m = String(location.hash).match(/^#\/(?:lab|practice)\/(.+)$/);
    if (m) want = decodeURIComponent(m[1]);
    if (want && want.indexOf('cc-') !== 0 && !byId(want)) want = 'cc-' + want;
    current = byId(want) || byId('builtin-6-7') || lessons()[0];
    renderTabs();
    renderDoc();
    renderToolbar();
    renderFoot();
    bindOnce();
    bindResizable();
    bindMobile();
    handleHash();

    syncPrompt();
    scrollDown(true);
    window.addEventListener('load', function () { scrollDown(true); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.CC_LAB = {
    run: run, line: line, shell: shellOf, lessons: lessons, open: open,
    stepsOf: stepsOf, stepStats: stepStats, isStepDone: isStepDone, isLessonDone: isLessonDone,
    current: function () { return current; },
    hash: handleHash,
    /* 供测试与外部调用：手机端的全屏终端开关、快捷键条、可视高度同步 */
    fullTerm: function (on) {
      var b = document.getElementById('term-full');
      var now = document.body.classList.contains('term-full');
      var want = (on === undefined) ? !now : !!on;
      if (b && want !== now) b.click();
      return document.body.classList.contains('term-full') === want;
    },
    key: function (k) {
      var btn = document.querySelector('#term-keys [data-k="' + k + '"]');
      if (!btn) return false;
      btn.click();
      return true;
    },
    inputValue: function () { return realInput ? realInput.value : null; },
    syncViewport: function () { window.dispatchEvent(new Event('resize')); }
  };
})();
