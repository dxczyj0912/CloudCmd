/* ==========================================================================
   assets/js/store.js · 本地存储（进度 / 收藏 / 主题）
   全部读写都在 try/catch 内，隐私模式下静默降级，不阻断页面
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'cloudcmd.v1';
  var LEGACY_PRACTICE_KEY = 'cloudcmd.practice.v1';
  var storageError = '';

  var state = {
    mastered: {},   /* { commandId: true } */
    favorites: {},  /* { commandId: true } */
    stages: {},     /* { stageId: true } */
    lessons: {},    /* { lessonId: true } */
    lessonEvidence: {}, /* { lessonId: true } 课程目标输出已在步骤中观察到 */
    steps: {},      /* { 'lessonId#0': true } 步骤完成状态 */
    theme: 'auto',  /* 'auto' | 'light' | 'dark' */
    /* 每日一练的间隔重复状态：{ cardId: {ease, interval, due, reps, lapses, last} }
       due / last 用 YYYYMMDD 整数，便于跨天比较且不受时区影响 */
    srs: {},
    drill: { lastDone: 0, streak: 0, best: 0, totalDays: 0, reviews: 0, dailyDate: 0, dailyReviewed: 0, rounds: 0 }
  };

  function mergeBucket(target, source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    for (var k in source) if (Object.prototype.hasOwnProperty.call(source, k) &&
        k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && source[k]) target[k] = source[k];
  }

  function notifyStorageError(message) {
    storageError = message;
    if (typeof window.CustomEvent === 'function' && window.dispatchEvent) {
      window.dispatchEvent(new window.CustomEvent('cc:storage-error', { detail: message }));
    }
  }

  function validateImport(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('备份必须是 JSON 对象');
    var buckets = ['mastered', 'favorites', 'stages', 'lessons', 'lessonEvidence', 'steps', 'srs'];
    var found = false;
    buckets.forEach(function (name) {
      if (!Object.prototype.hasOwnProperty.call(obj, name)) return;
      found = true;
      var bucket = obj[name];
      if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) throw new Error(name + ' 格式不正确');
      Object.keys(bucket).forEach(function (id) {
        if (!id || id === '__proto__' || id === 'constructor' || id === 'prototype') throw new Error('备份包含非法 ID');
        var value = bucket[id];
        if (name === 'srs') {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('复习记录格式不正确：' + id);
          Object.keys(value).forEach(function (field) {
            if (['ease', 'interval', 'due', 'reps', 'lapses', 'last'].indexOf(field) === -1 ||
                typeof value[field] !== 'number' || !isFinite(value[field]) || value[field] < 0) {
              throw new Error('复习记录字段不正确：' + id + '.' + field);
            }
          });
        } else if (value !== true) throw new Error(name + ' 中的完成状态必须为 true');
      });
    });
    if (Object.prototype.hasOwnProperty.call(obj, 'drill')) {
      found = true;
      if (!obj.drill || typeof obj.drill !== 'object' || Array.isArray(obj.drill)) throw new Error('练习统计格式不正确');
      Object.keys(obj.drill).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(state.drill, key) ||
            typeof obj.drill[key] !== 'number' || !isFinite(obj.drill[key]) || obj.drill[key] < 0) {
          throw new Error('练习统计字段不正确：' + key);
        }
      });
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'theme')) {
      found = true;
      if (['auto', 'light', 'dark'].indexOf(obj.theme) === -1) throw new Error('主题设置不正确');
    }
    if (!found) throw new Error('备份中没有可识别的学习进度');
  }

  function applyObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    mergeBucket(state.mastered, obj.mastered);
    mergeBucket(state.favorites, obj.favorites);
    mergeBucket(state.stages, obj.stages);
    mergeBucket(state.lessons, obj.lessons);
    mergeBucket(state.lessonEvidence, obj.lessonEvidence);
    mergeBucket(state.steps, obj.steps);
    if (obj.theme) state.theme = obj.theme;
    mergeBucket(state.srs, obj.srs);
    if (obj.drill && typeof obj.drill === 'object') {
      for (var dk in obj.drill) if (Object.prototype.hasOwnProperty.call(state.drill, dk) &&
          Object.prototype.hasOwnProperty.call(obj.drill, dk)) state.drill[dk] = obj.drill[dk];
    }
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        validateImport(saved);
        applyObject(saved);
      }
      /* 一次性迁移实验台旧进度，避免两页互相显示不同完成度。 */
      var legacy = window.localStorage.getItem(LEGACY_PRACTICE_KEY);
      if (legacy) {
        var old = JSON.parse(legacy);
        validateImport(old);
        applyObject(old);
        window.localStorage.removeItem(LEGACY_PRACTICE_KEY);
        save();
      }
    } catch (e) { notifyStorageError('学习进度读取失败，请从备份恢复：' + e.message); }
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      storageError = '';
      return true;
    } catch (e) {
      notifyStorageError('学习进度未能保存，请导出备份：' + e.message);
      return false;
    }
  }

  function toggle(bucket, id) {
    var b = state[bucket];
    if (b[id]) { delete b[id]; } else { b[id] = true; }
    save();
    return !!b[id];
  }

  window.CC_STORE = {
    load: load,
    key: KEY,
    storageError: function () { return storageError; },

    /* ---- 主题 ---- */
    getTheme: function () { return state.theme; },
    setTheme: function (t) { state.theme = t; save(); },

    /* ---- 已掌握 ---- */
    isMastered: function (id) { return !!state.mastered[id]; },
    toggleMastered: function (id) { return toggle('mastered', id); },
    masteredCount: function () { return Object.keys(state.mastered).length; },
    isStageDone: function (id) { return !!state.stages[id]; },
    toggleStage: function (id) { return toggle('stages', id); },

    /* ---- 收藏 ---- */
    isFavorite: function (id) { return !!state.favorites[id]; },
    toggleFavorite: function (id) { return toggle('favorites', id); },
    favoritesCount: function () { return Object.keys(state.favorites).length; },

    /* ---- 练习完成状态 ---- */
    isLessonDone: function (id) { return !!state.lessons[id]; },
    addLessonDone: function (id) { state.lessons[id] = true; save(); },
    lessonsDoneCount: function () { return Object.keys(state.lessons).length; },
    hasLessonEvidence: function (id) { return !!state.lessonEvidence[id]; },
    addLessonEvidence: function (id) { state.lessonEvidence[id] = true; save(); },

    /* ---- 步骤完成状态（实验台右侧的编号步骤） ---- */
    isStepDone: function (id) { return !!state.steps[id]; },
    addStepDone: function (id) { state.steps[id] = true; save(); },
    stepsDoneCount: function () { return Object.keys(state.steps).length; },

    /* ---- 每日一练：间隔重复 ----
       每张卡记住 {ease, interval, due, reps, lapses, last}。
       due 是 YYYYMMDD 整数：跨天比较不需要处理时区，也不用 Date 对象。 */
    srsOf: function (cardId) { return state.srs[cardId] || null; },
    srsAll: function () { return state.srs; },
    srsPut: function (cardId, rec) { state.srs[cardId] = rec; save(); },
    srsCount: function () { return Object.keys(state.srs).length; },
    drillStats: function () { return state.drill; },
    drillSave: function (patch) {
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) state.drill[k] = patch[k];
      save();
    },
    srsReset: function () { state.srs = {}; state.drill = { lastDone: 0, streak: 0, best: 0, totalDays: 0, reviews: 0, dailyDate: 0, dailyReviewed: 0, rounds: 0 }; save(); },

    /* 导入时只合并已存在的桶，不能用外部 JSON 覆盖整份状态。 */
    importJSON: function (raw) {
      var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      validateImport(obj);
      var before = JSON.stringify(state);
      applyObject(obj);
      if (!save()) {
        state = JSON.parse(before);
        throw new Error('进度未能写入本机存储，导入已取消');
      }
      return true;
    },

    /* ---- 导出 / 清空 ---- */
    exportJSON: function () {
      return JSON.stringify(state, null, 2);
    },
    clear: function () {
      state.mastered = {};
      state.favorites = {};
      state.stages = {};
      state.lessons = {};
      state.lessonEvidence = {};
      state.steps = {};
      state.srs = {};
      state.drill = { lastDone: 0, streak: 0, best: 0, totalDays: 0, reviews: 0, dailyDate: 0, dailyReviewed: 0, rounds: 0 };
      save();
    }
  };

  /* 其它标签页的修改在当前页面立即可见；忽略损坏或未知 key。 */
  if (window.addEventListener) window.addEventListener('storage', function (event) {
    if (event.key !== KEY || !event.newValue) return;
    try {
      var incoming = JSON.parse(event.newValue);
      validateImport(incoming);
      applyObject(incoming);
    } catch (e) { return; }
    if (window.dispatchEvent && typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('cc:progress-sync'));
  });

  load();
})();
