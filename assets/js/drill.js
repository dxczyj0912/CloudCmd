/* ==========================================================================
   assets/js/drill.js · 每日一练（间隔重复）
   --------------------------------------------------------------------------
   这不是"背命令名"。卡片正面一律是**现象或辨析点**，背面是
   「该敲什么 + 判据 + 反向排除」，并且能把命令**送进模拟终端真跑一遍**。
   卡片数据契约见 data/cards.js 顶部注释。

   算法：简化版 SM-2。
     每张卡记 {ease, interval, due, reps, lapses, last}
     三档反馈：
       不会 again → reps 归零、ease 降 0.20、今天再来一次
       模糊 hard  → interval 只涨 1.2 倍、ease 降 0.15
       会了 good  → reps++；第 1 次 1 天、第 2 次 3 天、之后 interval × ease
     ease 夹在 [1.3, 2.8]，interval 上限 180 天。
     due / last 用 YYYYMMDD 整数：跨天比较不涉及时区，也不用 Date 运算。

   队列怎么排（这是"每日一练"好不好用的关键）：
     1. 到期的卡（due <= 今天），按到期先后
     2. 不够就补：收藏的 > 标记"未掌握"的 > 练习课里做错的 > 从没见过的
     3. 从没见过的按 level 从低到高，并且**按分类轮转** ——
        否则一上来就是十几张 Linux 基础，很劝退
     4. 一天最多 12 张（可调）。宁可少而每天来，不要一次刷到吐。

   ⚠️ 一条刻意的设计：卡片**不产生"总进度"**。
   真实进度以练习课的完成度为准，这里只显示"今天做了几张 + 连续天数"。
   刷卡的满足感和真的会在服务器上排障是两件事，UI 上不该混为一谈。
   ========================================================================== */
(function () {
  'use strict';

  var DAILY_DEFAULT = 12;
  var INTERVAL_MAX = 180;
  var EASE_MIN = 1.3, EASE_MAX = 2.8;

  /* ---------- 日期：YYYYMMDD 整数 ---------- */
  function today(offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  /* 两个 YYYYMMDD 相差几天 */
  function daysBetween(a, b) {
    function toDate(n) { return new Date(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100); }
    return Math.round((toDate(b) - toDate(a)) / 86400000);
  }
  function addDays(ymd, n) {
    var d = new Date(Math.floor(ymd / 10000), Math.floor(ymd / 100) % 100 - 1, ymd % 100);
    d.setDate(d.getDate() + n);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  /* ---------- 卡片索引 ---------- */
  function allCards() {
    var list = window.CC_CARDS || [];
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || !c.id || seen[c.id]) continue;
      /* 必填字段不全的卡直接跳过：宁可少一张，也不要在页面上崩掉 */
      if (!c.front || !c.answer) continue;
      seen[c.id] = 1;
      out.push(c);
    }
    return out;
  }

  function byId(id) {
    var list = allCards();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- 队列 ---------- */
  function dailyLimit() {
    var n = parseInt(window.CC_STORE.drillStats().limit, 10);
    return n > 0 && n <= 60 ? n : DAILY_DEFAULT;
  }

  function dailyProgress() {
    var d = window.CC_STORE.drillStats();
    var T = today();
    return d.dailyDate === T ? d : { dailyDate: T, dailyReviewed: 0, rounds: 0 };
  }

  function recordReview() {
    var d = dailyProgress();
    window.CC_STORE.drillSave({ dailyDate: today(), dailyReviewed: (d.dailyReviewed || 0) + 1 });
    return window.CC_STORE.drillStats();
  }

  function recordRound() {
    var d = dailyProgress();
    window.CC_STORE.drillSave({ dailyDate: today(), rounds: (d.rounds || 0) + 1 });
    return window.CC_STORE.drillStats();
  }

  /* 练习课里"做过但没完成"的课对应的分类，算作薄弱分类 */
  function weakCats() {
    var weak = {};
    (window.CC_LESSONS || []).forEach(function (l) {
      var steps = l.steps || [];
      if (!steps.length) return;
      var done = 0;
      for (var i = 0; i < steps.length; i++) if (window.CC_STORE.isStepDone(l.id + '#' + i)) done++;
      if (done > 0 && done < steps.length) weak[l.cat] = (weak[l.cat] || 0) + (steps.length - done);
    });
    return weak;
  }

  /** 今天的队列。返回 {list:[card], due:n, fresh:n, review:n}
   *  opts.freshOnly = true 时只取没见过的卡（「再练 5 张新卡」用） */
  function buildQueue(limit, opts) {
    opts = opts || {};
    var T = today();
    var cards = allCards();
    var srs = window.CC_STORE.srsAll();
    var weak = weakCats();

    if (opts.freshOnly) {
      var unseen = cards.filter(function (c) { return !srs[c.id]; });
      limit = limit || 5;
      return {
        list: unseen.slice(0, limit),
        due: 0, review: 0, fresh: Math.min(unseen.length, limit),
        totalCards: cards.length, remaining: 0, freshOnly: true, roundLimit: limit,
        dailyReviewed: dailyProgress().dailyReviewed || 0
      };
    }

    limit = limit || dailyLimit();

    var due = [], fresh = [], favNew = [], weakNew = [];
    cards.forEach(function (c) {
      var rec = srs[c.id];
      if (rec) {
        if (rec.due <= T) due.push(c);
        return;                                  /* 见过但没到期：今天不出现 */
      }
      if (window.CC_STORE.isFavorite(c.id)) favNew.push(c);
      else if (weak[c.cat]) weakNew.push(c);
      else fresh.push(c);
    });
    due.sort(function (a, b) { return srs[a.id].due - srs[b.id].due; });

    /* 新卡按 level 升序，再**按分类轮转**取 —— 避免一上来全是同一个分类 */
    function rotate(list) {
      var buckets = {};
      list.forEach(function (c) { (buckets[c.cat] = buckets[c.cat] || []).push(c); });
      Object.keys(buckets).forEach(function (k) {
        buckets[k].sort(function (a, b) { return (a.level || 2) - (b.level || 2); });
      });
      var keys = Object.keys(buckets), out = [], more = true, round = 0;
      while (more && round < 400) {
        more = false;
        for (var i = 0; i < keys.length; i++) {
          var b = buckets[keys[i]];
          if (round < b.length) { out.push(b[round]); more = true; }
        }
        round++;
      }
      return out;
    }

    var list = due.slice(0, limit);
    var pool = rotate(favNew).concat(rotate(weakNew)).concat(rotate(fresh));
    for (var i = 0; i < pool.length && list.length < limit; i++) list.push(pool[i]);

    return {
      list: list,
      due: Math.min(due.length, limit),
      review: due.length,
      fresh: list.length - Math.min(due.length, limit),
      totalCards: cards.length,
      remaining: Math.max(0, due.length - limit), roundLimit: limit,
      dailyReviewed: dailyProgress().dailyReviewed || 0
    };
  }

  /* ---------- SM-2 ---------- */
  /**
   * @param {string} cardId
   * @param {'again'|'hard'|'good'} grade
   * @returns {object} 更新后的记录
   */
  function grade(cardId, g) {
    var T = today();
    var rec = window.CC_STORE.srsOf(cardId) || { ease: 2.5, interval: 0, due: T, reps: 0, lapses: 0, last: 0 };
    var ease = rec.ease || 2.5;
    var interval = rec.interval || 0;
    var reps = rec.reps || 0;

    if (g === 'again') {
      rec.lapses = (rec.lapses || 0) + 1;
      reps = 0;
      ease = Math.max(EASE_MIN, ease - 0.20);
      interval = 0;                     /* 今天还要再来一次 */
    } else if (g === 'hard') {
      ease = Math.max(EASE_MIN, ease - 0.15);
      interval = Math.max(1, Math.round((interval || 1) * 1.2));
      reps = reps + 1;
    } else {
      reps = reps + 1;
      if (reps === 1) interval = 1;
      else if (reps === 2) interval = 3;
      else interval = Math.max(1, Math.round((interval || 1) * ease));
      ease = Math.min(EASE_MAX, ease + 0.05);
    }
    interval = Math.min(INTERVAL_MAX, interval);

    rec.ease = Math.round(ease * 100) / 100;
    rec.interval = interval;
    rec.reps = reps;
    rec.last = T;
    /* interval 0 = 今天内还要再见一次：把 due 设成今天，队列重建时会再出现 */
    rec.due = interval === 0 ? T : addDays(T, interval);
    window.CC_STORE.srsPut(cardId, rec);
    return rec;
  }

  /* ---------- 连续天数 ---------- */
  function touchStreak() {
    var T = today();
    var d = window.CC_STORE.drillStats();
    if (d.lastDone === T) return d;                    /* 今天已经记过 */
    var streak = 1;
    if (d.lastDone && daysBetween(d.lastDone, T) === 1) streak = (d.streak || 0) + 1;
    var patch = {
      lastDone: T,
      streak: streak,
      best: Math.max(d.best || 0, streak),
      totalDays: (d.totalDays || 0) + 1
    };
    window.CC_STORE.drillSave(patch);
    return window.CC_STORE.drillStats();
  }

  /* ---------- 统计（给页面顶部用） ---------- */
  function stats() {
    var T = today();
    var cards = allCards();
    var srs = window.CC_STORE.srsAll();
    var n = { learned: 0, due: 0, young: 0, mature: 0, lapsed: 0 };
    cards.forEach(function (c) {
      var r = srs[c.id];
      if (!r) return;
      n.learned++;
      if (r.due <= T) n.due++;
      if ((r.interval || 0) >= 21) n.mature++; else n.young++;
      if ((r.lapses || 0) > 0) n.lapsed++;
    });
    var d = window.CC_STORE.drillStats();
    var doneToday = d.lastDone === T;
    return {
      cards: cards.length, learned: n.learned, due: n.due, young: n.young, mature: n.mature, lapsed: n.lapsed,
      streak: doneToday ? (d.streak || 0) : 0,
      best: d.best || 0, totalDays: d.totalDays || 0, reviews: d.reviews || 0,
      doneToday: doneToday
      ,dailyReviewed: dailyProgress().dailyReviewed || 0
    };
  }

  /* ---------- 复习提醒 ---------- */
  function dueLine() {
    var s = stats();
    if (s.doneToday) return '今天已经练过了 · 连续 ' + s.streak + ' 天';
    if (s.due > 0) return '有 ' + s.due + ' 张到期该复习了';
    if (s.learned === 0) return '还没开始 · 今天是第一次';
    return '今天没有到期的卡，可以练新卡';
  }

  /** 额外再练：只取从没见过的卡，忽略每日上限（"再练 5 张"按钮用） */
  function extraQueue(n) {
    n = n || 5;
    var srs = window.CC_STORE.srsAll();
    var out = [];
    allCards().forEach(function (c) { if (!srs[c.id] && out.length < n) out.push(c); });
    return out;
  }

  window.CC_DRILL = {
    all: allCards,
    byId: byId,
    buildQueue: buildQueue,
    extraQueue: extraQueue,
    grade: grade,
    touchStreak: touchStreak,
    stats: stats,
    dueLine: dueLine,
    today: today,
    addDays: addDays,
    daysBetween: daysBetween,
    dailyProgress: dailyProgress,
    recordReview: recordReview,
    recordRound: recordRound,
    DAILY_DEFAULT: DAILY_DEFAULT
  };
})();
