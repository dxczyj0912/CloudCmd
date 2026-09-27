/* ==========================================================================
   assets/js/terminal.js · 实验台界面：左侧大终端 + 右侧带步骤的讲解面板
   --------------------------------------------------------------------------
   布局参考在线实验平台（终端在左、讲义在右）：
     左：全宽终端，占主要视觉面积
     右上：讲义标题栏（方案名 + 步骤进度 + 全部完成徽标）
     右下：可折叠的编号步骤卡片，每步带命令与「复制 / 去执行」
   步骤由 lessons.js 的 steps 字段给出；没写则从 answer 自动推导（按管道/&& 拆解）。
   ========================================================================== */
(function () {
  'use strict';

  var shell = null;
  var sessions = [];        /* { id, el, input, out, lesson, history, hi } */
  var cmdIndex = [];
  var lab = { active: null, ti: 0, steps: [] };

  function esc(s) { return window.CC_VIEW.esc(s); }
  function md(s) { return window.CC_VIEW.mdInline(s); }

  function getShell() {
    if (!shell && window.CC_SHELL) shell = window.CC_SHELL.create();
    return shell;
  }

  function registerSession(s) {
    sessions.push(s);
    if (s.lesson) {
      s.index = cmdIndex.length;
      cmdIndex.push(s.lesson.answer);
    } else {
      s.index = -1;
    }
  }

  function findLesson(id) {
    var arr = window.CC_LESSONS || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  /* ---------------- 课程难度与学习顺序 ----------------

     **难度信息一直在数据里，只是从没展示过**：每条命令记录有 `level`（1~4），
     而一节课的难度可以由"它引用的命令里最高的那个 level"推出来。
     实测 173 节课的分布是 L1=30 / L2=73 / L3=57 / L4=13。
     但课程在数据文件里的顺序是"按写作批次追加"的 —— 实测 18 个分类里
     **只有 1 个是难度递增的**，其余全是混合（例如 linux-storage 是
     [2,1,3,2,3,1,2,2,3,3,3,3,2]，第 2 节比第 1 节难，第 6 节又比第 2 节简单）。
     结果是：新手进一个分类，看到一堆并列的课，**没有任何线索告诉他从哪开始**。

     所以这里做两件事：
       ① `sortByLevel()` 按难度重排**显示顺序**（不动数据文件的物理顺序，
          每个分类内部排序，同难度保持原有相对次序 —— 稳定排序）
       ② `levelOf()` 给出 L1~L4，供列表显示难度标记

     为什么排序放在渲染层而不是改数据文件：数据文件的顺序还被
     `shell-check` / `wire-continuity` 等按行扫描的校验器依赖，
     物理重排风险高、收益只是"看起来整齐"。渲染层排序同样能让学员
     按难度递进地学，而且随时可回退。 */
  var _lvlCache = null;
  function levelIndex() {
    if (_lvlCache) return _lvlCache;
    var m = {};
    var D = window.CC_DATA || {};
    Object.keys(D).forEach(function (cat) {
      (D[cat] || []).forEach(function (r) { if (r.id) m[r.id] = r.level || 1; });
    });
    _lvlCache = m;
    return m;
  }
  /* 一节课的难度 = 它引用过的命令里最高的 level（没有引用就算 1） */
  function levelOf(lesson) {
    var idx = levelIndex(), max = 0;
    (lesson.steps || []).forEach(function (st) {
      var v = st.ref ? idx[st.ref] : 0;
      if (v && v > max) max = v;
    });
    return max || 1;
  }
  /* 「有没有 L1 入口」用的判据与上面**不同**，这一点必须分清：
       `levelOf` 取的是**最高** level —— 代表"这节课最深讲到哪"，用于显示难度徽章；
       `entryLevelOf` 取的是**最低** level —— 代表"从哪个水平就能开始学"。
     为什么要两个：一节课完全可以"从 L1 起步、讲到 L3"（本站的入口课就是这样设计的），
     这种课对新手是**可以进的**，但用最高 level 去判"有没有入口"就会把它判成 L3，
     于是"这个分类没有入门课"的结论就永远成立。**判"有没有入口"看起点，不看终点。** */
  function entryLevelOf(lesson) {
    var idx = levelIndex(), min = 0;
    (lesson.steps || []).forEach(function (st) {
      var v = st.ref ? idx[st.ref] : 0;
      if (v && (min === 0 || v < min)) min = v;
    });
    return min || 1;
  }
  /* 按难度升序重排（稳定：同难度保持原顺序） */
  function sortByLevel(lessons) {
    return lessons.map(function (l, i) { return { l: l, i: i, lv: levelOf(l) }; })
      .sort(function (a, b) { return a.lv - b.lv || a.i - b.i; })
      .map(function (x) { return x.l; });
  }

  /* 一个分类内的学习顺序 —— **列表显示与「上一题/下一题」必须用同一份**，
     否则会出现"列表里第 3 节，点下一题却跳到别的分类"这种前后不一致。
     放在分类内而不是全局，是因为"下一节"对学员来说应该是同一主题的下一课。 */
  function orderedInCat(catId) {
    if (!catId) return sortByLevel((window.CC_LESSONS || []).slice());
    return sortByLevel((window.CC_LESSONS || []).filter(function (l) { return l.cat === catId; }));
  }

  /* ---------------- 步骤推导 ---------------- */

  /* 从答案命令里切出「可执行的最小片段」：按管道与 && 拆，保留重定向 */
  function splitStages(cmd) {
    var parts = [], cur = '', quote = null;
    var s = String(cmd);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '|') { parts.push(cur); cur = ''; continue; }
      if (ch === '&' && s[i + 1] === '&') { parts.push(cur); cur = ''; i++; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map(function (p) { return p.trim(); }).filter(Boolean);
  }

  /* 自动推导步骤：单命令就是一步，多段就逐段列出来 */
  function deriveSteps(lesson) {
    if (lesson.steps && lesson.steps.length) return lesson.steps;
    var stages = splitStages(lesson.answer);
    if (stages.length <= 1) {
      return [{ title: lesson.task, cmd: lesson.answer }];
    }
    return stages.map(function (seg, i) {
      return {
        title: seg,
        cmd: seg,
        note: i === 0 ? '从这一步开始，一步一步接下去' : '接上一步的结果'
      };
    });
  }

  /* ---------------- 输出渲染 ---------------- */

  function innerOf(s) {
    var inner = s.out.querySelector('.term-out-inner');
    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'term-out-inner';
      while (s.out.firstChild) inner.appendChild(s.out.firstChild);
      s.out.appendChild(inner);
    }
    return inner;
  }

  function appendOut(s, res) {
    var lines = [];
    (res.out || []).forEach(function (l) { lines.push('<span class="t-out">' + esc(l) + '</span>'); });
    (res.err || []).forEach(function (l) { lines.push('<span class="t-err">' + esc(l) + '</span>'); });
    if (!lines.length) lines.push('<span class="t-out t-dim">（命令执行成功，没有输出 —— Linux 里"没有消息就是好消息"）</span>');

    var html = '<div class="term-line">' +
      '<span class="t-prompt">' + esc(shell.prompt()) + '</span>' +
      '<span class="t-cmd">' + esc(s.lastInput) + '</span>' +
      '</div>' + lines.join('\n');
    innerOf(s).insertAdjacentHTML('beforeend', html);
    s.out.scrollTop = s.out.scrollHeight;
  }

  function appendRaw(s, html) {
    innerOf(s).insertAdjacentHTML('beforeend', html);
    s.out.scrollTop = s.out.scrollHeight;
  }

  /* ---------------- 步骤判定 ---------------- */

  /* 归一化：去掉多余空格，便于比对学员敲的命令与参考命令 */
  function normalizeCmd(c) {
    return String(c).replace(/\s+/g, ' ').trim();
  }

  function stepsOf(lessonId) {
    var out = [];
    (window.CC_LESSONS || []).forEach(function (l) {
      if (l.id !== lessonId) return;
      deriveSteps(l).forEach(function (st, i) {
        /* hint / ref 必须带上：终端面板里的步骤同样要给"卡住了怎么办"的抓手 */
        out.push({ id: lessonId + '#' + i, index: i, title: st.title, cmd: st.cmd || '', note: st.note || '',
                   hint: st.hint || null, ref: st.ref || '', expect: st.expect, state: st.state, lessonId: lessonId });
      });
    });
    return out;
  }

  function markStepDone(stepId) {
    window.CC_STORE.addStepDone(stepId);
    var card = document.querySelector('[data-step-card="' + stepId + '"]');
    if (card) {
      card.classList.add('done');
      var no = card.querySelector('.lab-step-no');
      if (no) no.textContent = '✓';
    }
    updateStepProgress();
  }

  /* 执行的命令是否正好完成某一步 */
  function checkSteps(s, res, input) {
    if (!s.lesson || res.code !== 0) return null;
    var steps = stepsOf(s.lesson.id);
    var typed = normalizeCmd(input);
    for (var i = 0; i < steps.length; i++) {
      if (window.CC_STORE.isStepDone(steps[i].id)) continue;
      var want = normalizeCmd(steps[i].cmd);
      if (!want) continue;
      var verdict = window.CC_LESSON_JUDGE
        ? window.CC_LESSON_JUDGE.check(steps[i], typed, res, getShell())
        : { ok: typed === want && res.code === 0 };
      if (verdict.ok) {
        markStepDone(steps[i].id);
        return steps[i];
      }
    }
    return null;
  }

  function hasOutcome(lesson) {
    if (!lesson) return false;
    return !lesson.expect || window.CC_STORE.isLessonDone(lesson.id) ||
      (window.CC_STORE.hasLessonEvidence && window.CC_STORE.hasLessonEvidence(lesson.id));
  }

  function recordOutcome(s, res, input) {
    if (!s.lesson || !s.lesson.expect || hasOutcome(s.lesson) ||
        !window.CC_LESSON_JUDGE || !window.CC_LESSON_JUDGE.outcomeMatches(s.lesson, res)) return false;
    var typed = normalizeCmd(input);
    var steps = stepsOf(s.lesson.id);
    for (var i = 0; i < steps.length; i++) {
      if (normalizeCmd(steps[i].cmd) !== typed) continue;
      if (!window.CC_LESSON_JUDGE.check(steps[i], typed, res, getShell()).ok) continue;
      window.CC_STORE.addLessonEvidence(s.lesson.id);
      return true;
    }
    return false;
  }

  function updateStepProgress() {
    var all = stepsOf(lab.active);
    var done = 0;
    all.forEach(function (st) { if (window.CC_STORE.isStepDone(st.id)) done++; });
    var el = document.getElementById('lab-progress');
    if (el) el.innerHTML = '已完成 <b>' + done + '</b>/' + all.length;
    var badge = document.getElementById('lab-all-done');
    if (badge) badge.hidden = !(all.length && done === all.length && (!lab.active || hasOutcome(findLesson(lab.active))));
    var bar = document.querySelector('[data-lab-progress]');
    if (bar && all.length) bar.style.width = Math.round(done / all.length * 100) + '%';
  }

  /* 全部步骤完成 → 整题完成 */
  function settleLesson(s) {
    if (!s.lesson || s.lesson.done) return;
    var steps = stepsOf(s.lesson.id);
    var done = steps.filter(function (st) { return window.CC_STORE.isStepDone(st.id); }).length;
    if (steps.length && done === steps.length && hasOutcome(s.lesson)) {
      s.lesson.done = true;
      window.CC_STORE.addLessonDone(s.lesson.id);
      if (s.card) s.card.classList.add('done');
      appendRaw(s, '<div class="term-line term-ok">✓ 全部步骤完成！' + (s.lesson.teach ? ' 讲解已展开。' : '') + '</div>');
      var ans = document.querySelector('[data-answer-box]');
      if (ans) ans.hidden = false;
      var link = document.querySelector('[data-lab-task="' + s.lesson.id + '"]');
      if (link) {
        link.classList.add('done');
        var no = link.querySelector('.lab-task-no');
        if (no) no.textContent = '✓';
      }
      var st = document.querySelector('[data-lesson-state]');
      if (st) { st.textContent = '✓ 已完成'; st.className = 'badge lv1'; }
      updateStepProgress();
    }
  }

  /* ---------------- 执行 ---------------- */

  function run(s, line) {
    var sh = getShell();
    var input = String(line || '').trim();
    if (!input) return;
    s.lastInput = input;
    s.history.push(input);
    s.hi = s.history.length;

    var res = sh.exec(input);
    if (res.clear) {
      s.out.innerHTML = '';
      innerOf(s);
      return;
    }
    appendOut(s, res);

    if (!s.lesson) return;

    var outcomeHit = recordOutcome(s, res, input);

    /* 命中某一步 */
    var hitStep = checkSteps(s, res, input);
    if (hitStep) {
      appendRaw(s, '<div class="term-line term-ok">✓ 步骤 ' + (hitStep.index + 1) + ' 完成</div>');
      /* 顺带命中整题的 expect 时给更强反馈 */
      if (outcomeHit || (s.lesson.expect && hasOutcome(s.lesson) && window.CC_LESSON_JUDGE.outcomeMatches(s.lesson, res))) {
        appendRaw(s, '<div class="term-line term-ok">✓ 结果正确</div>');
      }
      settleLesson(s);
      if (!s.lesson.done && stepsOf(s.lesson.id).every(function (st) { return window.CC_STORE.isStepDone(st.id); })) {
        appendRaw(s, '<div class="term-line term-hint">步骤已完成，但还没观察到目标结果。请按讲义核对输出，再运行对应步骤。</div>');
      }
      return;
    }

    /* 没命中步骤时给方向性提示 */
    if (outcomeHit) {
      appendRaw(s, '<div class="term-line term-ok">✓ 目标结果已验证</div>');
      settleLesson(s);
    } else {
      appendRaw(s, '<div class="term-line term-hint">命令跑通了，但不是这一步要的结果。对照右侧步骤里的命令，或点「看提示」。</div>');
    }
  }

  /* 面板里点「去执行」：把命令填进去并执行 */
  function runStep(stepId) {
    var s = sessions[0];
    if (!s) return;
    var all = stepsOf(lab.active);
    for (var i = 0; i < all.length; i++) {
      if (all[i].id !== stepId) continue;
      if (!all[i].cmd) return;
      s.input.value = all[i].cmd;
      run(s, all[i].cmd);
      s.input.value = '';
      s.input.focus();
      return;
    }
  }

  /* ---------------- 视图 ---------------- */

  function terminalHtml(opts) {
    opts = opts || {};
    var sh = getShell();
    return '<div class="term' + (opts.compact ? ' term-compact' : '') + '" data-term>' +
      '<div class="term-bar">' +
      '<i class="dot r"></i><i class="dot y"></i><i class="dot g"></i>' +
      '<span class="term-title">' + esc(opts.title || (sh.user + '@' + sh.host)) + '</span>' +
      '<span class="term-badge">模拟环境</span>' +
      '<button class="term-reset" type="button" data-lab-reset title="重置这台机器（清空你新建的文件与目录）">重置</button>' +
      '</div>' +
      '<div class="term-out" data-term-out>' +
      '<div class="term-out-inner">' +
      '<span class="t-dim">CloudCmd 模拟终端 · 输出是照着真机格式写的仿真结果，用于学习，不能替代真机验证。</span>\n' +
      '<span class="t-dim">输入 </span><span class="t-cmd">help</span><span class="t-dim"> 看支持的命令，输入 </span><span class="t-cmd">ls</span><span class="t-dim"> 开始探索。</span>' +
      '</div>' +
      '</div>' +
      (opts.resizableInput
        ? '<div class="term-input-resizer" role="separator" tabindex="0" aria-orientation="horizontal" ' +
          'aria-valuemin="64" aria-valuemax="240" aria-valuenow="64" aria-controls="shell-input-row" ' +
          'aria-label="调整临时 Shell 输入区高度" title="拖动调整输入区高度"><span aria-hidden="true"></span></div>'
        : '') +
      '<div class="term-input-row"' + (opts.resizableInput ? ' id="shell-input-row"' : '') + '>' +
      '<span class="t-prompt" data-term-prompt>' + esc(sh.prompt()) + '</span>' +
      (opts.resizableInput
        ? '<textarea class="term-input" rows="1" wrap="soft" spellcheck="false" autocomplete="off" ' +
          'placeholder="' + esc(opts.placeholder || '在这里输入命令，回车执行') + '" aria-label="命令输入"></textarea>'
        : '<input class="term-input" type="text" spellcheck="false" autocomplete="off" ' +
          'placeholder="' + esc(opts.placeholder || '在这里输入命令，回车执行') + '" aria-label="命令输入">') +
      '</div>' +
      '</div>';
  }

  /* 右侧：讲义面板（标题栏 + 步骤列表） */
  function labPanelHtml(lesson) {
    if (!lesson) {
      var freeCmds = ['ls -lh /var/log/nginx', 'grep -i error /var/log/nginx/error.log', 'df -h', 'docker ps -a', 'kubectl get pods -n my-app'];
      return '<div class="lab-right" data-lab-main data-lab-lesson="">' +
        '<div class="lab-head">' +
        '<div class="lab-head-top"><h2>自由练习</h2>' +
        '<span class="badge tag">不受任务约束</span>' +
        '<span class="lab-progress" id="lab-progress">随便敲</span>' +
        '</div>' +
        '<p class="lab-desc">左边终端是一台模拟机，命令输出与练习里完全一致。可以从下面这些命令开始，也可以直接敲 <code class="inline-code">help</code>。</p>' +
        '</div>' +
        '<div class="lab-steps-wrap">' +
        '<div class="lab-steps">' +
        freeCmds.map(function (c, i) {
          return '<div class="lab-step">' +
            '<div class="lab-step-head"><span class="lab-step-no">' + (i + 1) + '</span>' +
            '<span class="lab-step-title">' + esc(c) + '</span></div>' +
            '<div class="lab-step-body">' +
            '<div class="lab-cmd"><code title="' + esc(c) + '">' + esc(c) + '</code>' +
            '<span class="lab-cmd-btns">' +
            '<button type="button" class="lab-cmd-btn" data-copy="' + esc(c) + '">复制</button>' +
            '<button type="button" class="lab-cmd-btn primary" data-quick="' + esc(c) + '">去执行</button>' +
            '</span></div>' +
            '</div></div>';
        }).join('') +
        '</div>' +
        '<div class="lab-foot-note">模拟环境 · 输出为仿真结果，<b>不能替代真机验证</b></div>' +
        '</div>' +
        '</div>';
    }

    var cat = window.CC_CATS_META.byId(lesson.cat);
    var steps = stepsOf(lesson.id);
    var doneN = steps.filter(function (st) { return window.CC_STORE.isStepDone(st.id); }).length;
    var allDone = steps.length > 0 && doneN === steps.length && hasOutcome(lesson);

    var h = '<div class="lab-right" data-lab-main data-lab-lesson="' + esc(lesson.id) + '">';
    h += '<div class="lab-head">' +
      '<div class="lab-head-top">' +
      '<h2>' + esc(lesson.title) + '</h2>' +
      (cat ? '<span class="badge cat">' + esc(cat.name) + '</span>' : '') +
      '<span class="lab-progress" id="lab-progress">已完成 <b>' + doneN + '</b>/' + steps.length + '</span>' +
      '<span class="lab-all-done" id="lab-all-done"' + (allDone ? '' : ' hidden') + '>✓ 全部完成</span>' +
      '</div>' +
      '<p class="lab-desc">' + esc(lesson.prompt) + '</p>' +
      '<div class="lab-goal"><b>目标</b>' + esc(lesson.task) + '</div>' +
      '</div>';

    h += '<div class="lab-steps-wrap"><div class="lab-steps">';
    steps.forEach(function (st, i) {
      var done = window.CC_STORE.isStepDone(st.id);
      h += '<div class="lab-step' + (done ? ' done' : '') + '" data-step-card="' + esc(st.id) + '">' +
        '<div class="lab-step-head" data-step-toggle="' + esc(st.id) + '">' +
        '<span class="lab-step-no">' + (done ? '✓' : (i + 1)) + '</span>' +
        '<span class="lab-step-title">' + esc(st.title) + '</span>' +
        '<span class="lab-step-caret">▾</span>' +
        '</div>' +
        '<div class="lab-step-body">' +
        (st.cmd
          ? '<div class="lab-cmd"><code title="' + esc(st.cmd) + '">' + esc(st.cmd) + '</code>' +
            '<span class="lab-cmd-btns">' +
            '<button type="button" class="lab-cmd-btn" data-copy="' + esc(st.cmd) + '">复制</button>' +
            '<button type="button" class="lab-cmd-btn primary" data-run-step="' + esc(st.id) + '">去执行</button>' +
            '</span></div>'
          : '') +
        (st.about ? '<div class="lab-step-about">' + esc(st.about) + '</div>' : '') +
        (st.note ? '<div class="lab-step-note">' + md(st.note) + '</div>' : '') +
        '</div></div>';
    });
    h += '</div>';

    h += '<div class="lab-foot">' +
      '<button type="button" class="btn-ghost" data-hint="' + esc(lesson.id) + '">看提示</button>' +
      '<button type="button" class="btn-ghost" data-reveal="' + esc(lesson.id) + '">看答案</button>' +
      '<button type="button" class="btn-ghost" data-nav="prev"' + (lab.ti <= 0 ? ' disabled' : '') + '>← 上一题</button>' +
      '<button type="button" class="btn-ghost" data-nav="next">下一题 →</button>' +
      '</div>';

    h += '<div class="lesson-hint" data-hint-box hidden></div>';
    h += '<div class="lesson-answer" data-answer-box' + (allDone ? '' : ' hidden') + '>' +
      '<div class="block-title">参考答案</div>' +
      window.CC_VIEW.codeBlock(lesson.answer, { label: 'bash' }) +
      (lesson.teach ? '<div class="lesson-teach"><b>讲解</b>' + md(lesson.teach) + '</div>' : '') +
      '</div>';

    h += '<div class="lab-foot-note">模拟环境 · 输出为仿真结果，<b>不能替代真机验证</b></div>';
    h += '</div></div>';
    return h;
  }

  function viewPractice(lessonId) {
    var lessons = window.CC_LESSONS || [];
    var active = null;
    for (var i = 0; i < lessons.length; i++) {
      if (lessons[i].id === lessonId) { active = lessons[i]; lab.ti = i; break; }
    }
    if (!active) lab.ti = 0;
    lab.active = active ? active.id : null;
    lab.steps = active ? stepsOf(active.id) : [];

    var cat = active ? window.CC_CATS_META.byId(active.cat) : null;
    var stepsAll = active ? stepStats(active.id) : { done: 0, total: 0 };

    var h = '<div class="lab">';

    /* 顶部实验条：题目信息 + 状态 + 主操作（对齐在线实验平台的工具条） */
    h += '<div class="lab-bar">' +
      '<span class="lab-bar-brand"><img src="assets/img/cloudcmd-mark.png?v=0.0.1" alt="">CloudCmd 0.0.1 云计算命令手册</span>' +
      '<span class="lab-bar-sep">/</span>' +
      '<span class="lab-bar-bc">实时练习' + (cat ? ' / ' + esc(cat.name) : '') + '</span>' +
      '<span class="lab-bar-spacer"></span>' +
      '<span class="lab-bar-title">' + (active ? esc(active.title) : '自由练习') + '</span>' +
      '<span class="lab-bar-state">' + (active
        ? (stepsAll.done === stepsAll.total && stepsAll.total
            ? '<span class="lab-bar-done">✓ 已完成</span>'
            : '进行中')
        : '不受任务约束') + '</span>' +
      '<button type="button" class="lab-cta" data-lab-focus>实时练习</button>' +
      '</div>';

    /* 题目切换条：**只列当前分类的课**。
       此前列的是全部课程 —— 173 节课（kubernetes 一个分类就 27 节）
       全挤在一条横向滚动条里，"第几题"也就失去了意义。
       现在用与列表、上一题/下一题同一份顺序（orderedInCat），
       并把难度标在序号旁，学员一眼能看出这条路径的坡度。 */
    h += '<div class="lab-tabs" role="tablist">';
    h += '<span class="lab-tabs-label">' + (cat ? esc(cat.name) : '讲义') + '</span>';
    var tabs = active ? orderedInCat(active.cat) : [];
    tabs.forEach(function (l, i) {
      var done = window.CC_STORE.isLessonDone(l.id);
      h += '<a class="lab-tab' + (l.id === lab.active ? ' cur' : '') + (done ? ' done' : '') + '" ' +
        'href="#/practice/' + esc(l.id) + '" title="' + esc(l.title) + '（L' + levelOf(l) + '）">' +
        (done ? '✓ ' : '') + (i + 1) +
        '<i class="lab-tab-lv lv' + levelOf(l) + '">L' + levelOf(l) + '</i></a>';
    });
    h += '<a class="lab-tab lab-tab-free' + (!lab.active ? ' cur' : '') + '" href="#/practice" title="自由练习">∞</a>';
    h += '<span class="lab-tabs-spacer"></span>';
    h += '<span class="lab-tabs-hint">快捷键 <kbd>←</kbd><kbd>→</kbd> 切题</span>';
    h += '</div>';

    /* 主体：左终端 + 右讲义 */
    h += '<div class="lab-body">';
    h += '<div class="lab-left">' +
      terminalHtml({ placeholder: active ? '按右侧步骤执行命令，回车运行' : '在这里输入命令，回车执行' }) +
      '</div>';
    h += labPanelHtml(active);
    h += '</div>';

    h += '</div>';
    return h;
  }

  function stepStats(lessonId) {
    var all = stepsOf(lessonId);
    var done = 0;
    all.forEach(function (st) { if (window.CC_STORE.isStepDone(st.id)) done++; });
    return { done: done, total: all.length };
  }

  /* ---------------- 绑定 ---------------- */

  function bind(root) {
    try {
      bindInner(root);
    } catch (e) {
      var main = document.getElementById('main');
      if (main) {
        main.insertAdjacentHTML('afterbegin',
          '<div class="callout" style="border-left-color:var(--err)"><b>终端初始化出错：</b>' +
          esc(e.message) + '<br>请刷新页面重试；若持续出现请反馈。</div>');
      }
      throw e;
    }
  }

  /* 临时 Shell 面板里的会话单独绑定：它不属于任何练习课，
     所以不进 sessions / cmdIndex，也不会干扰步骤判定与上一题下一题。 */
  function bindPanel(root) {
    root = root || document;
    var terms = root.querySelectorAll('[data-term]');
    for (var i = 0; i < terms.length; i++) {
      (function (termEl) {
        if (termEl.getAttribute('data-panel-bound') === '1') return;
        termEl.setAttribute('data-panel-bound', '1');
        var session = {
          id: -1, el: termEl, card: null, lesson: null,
          input: termEl.querySelector('.term-input'),
          out: termEl.querySelector('[data-term-out]'),
          promptEl: termEl.querySelector('[data-term-prompt]'),
          history: [], hi: 0, lastInput: ''
        };
        /* 挂到元素上，供 runInPanel 从外部把命令送进来（每日一练的「送进终端跑一遍」） */
        termEl.__ccSession = session;
        bindInput(session);
      })(terms[i]);
    }
    /* 面板里的「重置」也要能用（不重置主终端的会话） */
    root.querySelectorAll('[data-lab-reset], [data-term-reset]').forEach(function (btn) {
      if (btn.getAttribute('data-panel-bound') === '1') return;
      btn.setAttribute('data-panel-bound', '1');
      btn.addEventListener('click', function () {
        if (!window.confirm('重置模拟机器？你新建的文件/目录会清空，练习与步骤进度保留。')) return;
        getShell().reset();
        var out = root.querySelector('[data-term-out]');
        if (out) out.innerHTML = '<div class="term-out-inner"><span class="t-dim">已重置。当前目录 ' +
          esc(getShell().cwd) + '，输入 </span><span class="t-cmd">ls</span><span class="t-dim"> 继续。</span></div>';
        var input = root.querySelector('.term-input');
        if (input) input.focus();
      });
    });
  }

  function bindInner(root) {
    root = root || document;
    sessions = [];
    cmdIndex = [];

    var terms = root.querySelectorAll('[data-term]');
    for (var i = 0; i < terms.length; i++) {
      (function (termEl, idx) {
        /* 终端在左栏、讲义在右栏，两者是兄弟节点 —— 必须往上找到整个实验台再取练习 id */
        var scope = termEl.closest('[data-lab-lesson]') ||
                    termEl.closest('.lesson-card') ||
                    termEl.closest('.lab');
        var lessonId = scope ? (scope.getAttribute('data-lab-lesson') || scope.getAttribute('data-lesson')) : null;
        if (!lessonId) {
          var holder = document.querySelector('[data-lab-lesson]');
          lessonId = holder ? holder.getAttribute('data-lab-lesson') : null;
        }
        var lesson = lessonId ? findLesson(lessonId) : null;
        var session = {
          id: idx, el: termEl, card: scope, lesson: lesson,
          input: termEl.querySelector('.term-input'),
          out: termEl.querySelector('[data-term-out]'),
          promptEl: termEl.querySelector('[data-term-prompt]'),
          history: [], hi: 0, lastInput: ''
        };
        registerSession(session);
        bindInput(session);
      })(terms[i], i);
    }

    /* 步骤：展开/收起 */
    root.querySelectorAll('[data-step-toggle]').forEach(function (head) {
      head.addEventListener('click', function () {
        var card = head.closest('.lab-step');
        if (card) card.classList.toggle('collapsed');
      });
    });

    /* 步骤：去执行 */
    root.querySelectorAll('[data-run-step]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        runStep(btn.getAttribute('data-run-step'));
      });
    });

    /* 自由练习的快捷命令 */
    root.querySelectorAll('[data-quick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var s = sessions[0];
        if (!s) return;
        s.input.value = btn.getAttribute('data-quick');
        s.input.focus();
        run(s, s.input.value);
        s.input.value = '';
      });
    });

    root.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-nav') === 'prev') goPrev(); else goNext();
      });
    });

    root.querySelectorAll('[data-hint]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var l = findLesson(btn.getAttribute('data-hint'));
        var box = document.querySelector('[data-hint-box]');
        if (!box) return;
        box.hidden = false;
        box.innerHTML = '<b>提示</b>' + hintFor(l);
      });
    });

    root.querySelectorAll('[data-reveal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = document.querySelector('[data-answer-box]');
        if (!box) return;
        box.hidden = false;
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    root.querySelectorAll('[data-lab-reset], [data-term-reset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!window.confirm('重置模拟机器？你新建的文件/目录会清空，练习与步骤进度保留。')) return;
        getShell().reset();
        sessions.forEach(function (s) {
          s.out.innerHTML = '';
          innerOf(s).innerHTML = '<span class="t-dim">已重置。当前目录 ' + esc(shell.cwd) + '，输入 </span><span class="t-cmd">ls</span><span class="t-dim"> 继续。</span>';
          updatePrompt(s);
        });
        if (sessions[0]) sessions[0].input.focus();
      });
    });

    /* 顶部主操作按钮：聚焦终端输入（对齐参考图的绿色主按钮） */
    var cta = root.querySelector('[data-lab-focus]');
    if (cta) {
      cta.addEventListener('click', function () {
        var s = sessions[0];
        if (s && s.input) s.input.focus();
      });
    }

    /* 进入练习后先自动跑一遍第一步，让学生立刻看到这条命令到底输出了什么。
       第一步同时标记为已完成（右侧打勾），从第二步开始自己敲。 */
    var auto = sessions[0];
    if (auto && auto.lesson) {
      var firstStep = stepsOf(auto.lesson.id)[0];
      if (firstStep && firstStep.cmd && !window.CC_STORE.isStepDone(firstStep.id)) {
        setTimeout(function () {
          appendRaw(auto,
            '<div class="term-line t-dim">—— 先自动跑一遍第 1 步，看看它会输出什么 ——</div>');
          run(auto, firstStep.cmd);
          auto.input.value = '';
          updatePrompt(auto);
        }, 260);
      }
    }

    updateStepProgress();
    var first = sessions[0];
    if (first) setTimeout(function () { first.input.focus(); }, 60);
    var curTab = document.querySelector('.lab-tab.cur');
    if (curTab && curTab.scrollIntoView) setTimeout(function () { curTab.scrollIntoView({ block: 'nearest', inline: 'center' }); }, 80);
  }

  function sessionForLesson(id) {
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].lesson && sessions[i].lesson.id === id) return sessions[i];
    }
    return sessions[0] || null;
  }

  function goToLesson(idx) {
    var lessons = window.CC_LESSONS || [];
    if (idx < 0 || idx >= lessons.length) return;
    window.location.hash = '#/practice/' + lessons[idx].id;
  }
  function goNext() {
    var active = findLesson(lab.active);
    if (!active) return;
    var lessons = orderedInCat(active.cat);
    var i = -1;
    for (var k = 0; k < lessons.length; k++) if (lessons[k].id === lab.active) i = k;
    if (i < 0) return;
    goToLesson(Math.min(lessons.length - 1, i + 1));
  }
  function goPrev() {
    var active = findLesson(lab.active);
    if (!active) return;
    var lessons = orderedInCat(active.cat);
    var i = 0;
    for (var k = 0; k < lessons.length; k++) if (lessons[k].id === lab.active) i = k;
    goToLesson(Math.max(0, i - 1));
  }

  function hintFor(l) {
    if (!l) return '';
    var stages = splitStages(l.answer);
    var hints = [];
    hints.push('要用的命令是 <code class="inline-code">' + esc(stages[0].split(' ')[0]) + '</code>');
    var flags = l.answer.match(/(^|\s)(-[a-zA-Z]{1,4})(\s|$)/g);
    if (flags) {
      var fs = flags.map(function (f) { return f.trim(); }).filter(function (f, i, a) { return a.indexOf(f) === i; });
      hints.push('需要用到的选项：' + fs.map(function (f) { return '<code class="inline-code">' + esc(f) + '</code>'; }).join(' '));
    }
    if (stages.length > 1) hints.push('这是一条管道，需要 ' + stages.length + ' 个命令串联');
    hints.push('右侧步骤里已经给出每一段的命令，点「去执行」可以直接看效果');
    return '<ul class="hint-list">' + hints.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
  }

  function updatePrompt(s) {
    if (s.promptEl) s.promptEl.textContent = shell.prompt();
  }

  function bindInput(s) {
    s.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var v = s.input.value;
        run(s, v);
        s.input.value = '';
        updatePrompt(s);
        return;
      }
      if (e.key === 'ArrowLeft' && s.input.value === '') {
        if (document.querySelector('[data-nav="prev"]')) { e.preventDefault(); goPrev(); }
        return;
      }
      if (e.key === 'ArrowRight' && s.input.value === '') {
        if (document.querySelector('[data-nav="next"]')) { e.preventDefault(); goNext(); }
        return;
      }
      if (e.key === 'ArrowUp') {
        if (!s.history.length) return;
        e.preventDefault();
        s.hi = Math.max(0, s.hi - 1);
        s.input.value = s.history[s.hi] || '';
        return;
      }
      if (e.key === 'ArrowDown') {
        if (!s.history.length) return;
        e.preventDefault();
        s.hi = Math.min(s.history.length, s.hi + 1);
        s.input.value = s.history[s.hi] || '';
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        var v2 = s.input.value;
        var m = v2.match(/^(\S+)$/);
        if (m) {
          var candidates = (window.CC_SHELL.commands || []).filter(function (c) { return c.indexOf(m[1]) === 0; });
          if (candidates.length === 1) s.input.value = candidates[0] + ' ';
          else if (candidates.length > 1) {
            appendRaw(s, '<div class="term-line"><span class="t-dim">' + esc(candidates.join('  ')) + '</span></div>');
          }
        }
        return;
      }
      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        s.out.innerHTML = '';
        innerOf(s);
        return;
      }
    });
  }

  /* 练习列表：不传 catId = 全部场景；传了只列该分类（分类页「实时练习」按钮的落点）。
     每张卡显示目标、步数与进度，点「开始 / 继续」进练习平台 academy-lab.html#/lab/cc-<id>。 */
  function viewPracticeCards(catId) {
    var cat = catId ? window.CC_CATS_META.byId(catId) : null;
    /* 与「上一题/下一题」共用同一份顺序（见 orderedInCat） */
    var lessons = orderedInCat(catId);

    var allSteps = 0, doneSteps = 0, doneLessons = 0;
    lessons.forEach(function (l) {
      var st = stepsOf(l.id);
      allSteps += st.length;
      st.forEach(function (s) { if (window.CC_STORE.isStepDone(s.id)) doneSteps++; });
      if (window.CC_STORE.isLessonDone(l.id)) doneLessons++;
    });

    var title = cat ? cat.icon + ' ' + cat.name + ' · 实时练习' : '⌨️ 实时练习';
    var h = '<div class="wrap">';
    h += window.CC_VIEW.breadcrumb(cat
      ? [['#/', '首页'], ['#/c/' + catId, cat.name], [null, '实时练习']]
      : [['#/', '首页'], [null, '实时练习']]);
    h += '<div class="page-head"><h1>' + esc(title) + '</h1>' +
      '<div class="page-sub">' + (cat ? '一步一步复习这个分类：' : '') +
      '每节拆成可勾选的小步，执行命令就自动打勾，全部完成即打卡并展开讲解。</div></div>';

    if (!lessons.length) {
      h += '<div class="empty"><span class="big">🚧</span><p>这个分类的练习还在整理中。</p></div></div>';
      return h;
    }

    h += '<div class="practice-sum">' +
      '<b>' + lessons.length + '</b> 个场景　·　<b>' + allSteps + '</b> 个步骤　·　已完成 <b>' + doneSteps + '</b> 步' +
      (doneLessons ? '　·　已打卡 <b>' + doneLessons + '</b> 节' : '') +
      '</div>';

    h += '<div class="practice-list">';
    lessons.forEach(function (l, i) {
      var steps = stepsOf(l.id);
      var done = steps.filter(function (s) { return window.CC_STORE.isStepDone(s.id); }).length;
      var allDone = window.CC_STORE.isLessonDone(l.id) || (steps.length > 0 && done === steps.length);
      var pct = steps.length ? Math.round(done / steps.length * 100) : 0;
      var lv = levelOf(l);
      h += '<a class="practice-item' + (allDone ? ' is-done' : '') + '" href="academy-lab.html#/lab/cc-' + esc(l.id) + '">' +
        '<span class="pi-no">' + (i + 1) +
        '<i class="pi-lv lv' + lv + '" title="难度 L' + lv + '（按本节引用的命令等级推算）">L' + lv + '</i></span>' +
        '<span class="pi-main">' +
        '<span class="pi-title">' + esc(l.title) + (allDone ? '<i class="pi-done">✓ 已打卡</i>' : '') + '</span>' +
        '<span class="pi-task">' + esc(l.task || l.prompt || '') + '</span>' +
        '<span class="pi-meta"><span class="pi-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="pi-num">' + done + '/' + steps.length + ' 步</span>' +
        '<span class="pi-cmd">' + esc((steps[0] && steps[0].cmd) || '') + '</span></span>' +
        '</span>' +
        '<span class="pi-go">' + (done ? '继续' : '开始') + ' →</span>' +
        '</a>';
    });
    h += '</div></div>';
    return h;
  }

  window.CC_TERM = {
    levelOf: levelOf,
    entryLevelOf: entryLevelOf,
    sortByLevel: sortByLevel,
    viewPractice: viewPractice,
    viewPracticeCards: viewPracticeCards,
    terminalHtml: terminalHtml,
    bind: bind,
    bindPanel: bindPanel,
    shell: getShell,
    stepsOf: stepsOf,
    /* 把一条命令送进**临时 Shell 面板**执行并在面板里打印结果。
       每日一练卡片的「送进终端跑一遍」走这条路 —— 复用同一个会话，
       所以卡片里跑的几条命令之间状态是连续的（cd 会保留）。 */
    runInPanel: function (cmd) {
      var termEl = document.querySelector('#shell-body [data-term]');
      if (!termEl || !termEl.__ccSession) return false;
      var s = termEl.__ccSession;
      s.lastInput = String(cmd);
      s.history.push(String(cmd));
      s.hi = s.history.length;
      run(s, cmd);
      updatePrompt(s);
      if (s.input) { s.input.value = ''; }
      if (s.out) s.out.scrollTop = s.out.scrollHeight;
      return true;
    }
  };
})();
