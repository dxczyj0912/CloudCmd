/* Per-item sync records. A false record is a tombstone, so an older device
   cannot restore a canceled favorite or completion mark by sending its cache. */
(function () {
  'use strict';
  var BUCKETS = ['mastered', 'favorites', 'stages', 'lessons', 'lessonEvidence', 'steps'];

  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeId(id) { return !!id && id !== '__proto__' && id !== 'constructor' && id !== 'prototype'; }
  function validRecord(value) {
    return object(value) && typeof value.on === 'boolean' &&
      Number.isSafeInteger(value.at) && value.at >= 0 &&
      typeof value.actor === 'string' && /^[A-Za-z0-9_-]{0,40}$/.test(value.actor);
  }
  function validate(state) {
    if (!object(state)) throw new Error('进度必须是对象');
    if (state.marks == null) return;
    if (!object(state.marks)) throw new Error('同步标记格式不正确');
    Object.keys(state.marks).forEach(function (bucket) {
      if (BUCKETS.indexOf(bucket) === -1 || !object(state.marks[bucket])) {
        throw new Error('同步标记分组不正确：' + bucket);
      }
      Object.keys(state.marks[bucket]).forEach(function (id) {
        if (!safeId(id) || !validRecord(state.marks[bucket][id])) {
          throw new Error('同步标记不正确：' + bucket + '.' + id);
        }
      });
    });
  }
  function compare(left, right) {
    if (left.at !== right.at) return left.at - right.at;
    if (left.actor !== right.actor) return left.actor > right.actor ? 1 : -1;
    if (left.on === right.on) return 0;
    return left.on ? -1 : 1; /* identical clock and actor: cancellation wins */
  }
  function candidates(source, bucket) {
    var result = {};
    var legacy = object(source[bucket]) ? source[bucket] : {};
    Object.keys(legacy).forEach(function (id) {
      if (safeId(id) && legacy[id] === true) result[id] = { on: true, at: 0, actor: '' };
    });
    var records = object(source.marks) && object(source.marks[bucket]) ? source.marks[bucket] : {};
    Object.keys(records).forEach(function (id) {
      if (safeId(id) && validRecord(records[id])) result[id] = records[id];
    });
    return result;
  }
  function materialize(target, bucket) {
    var visible = {};
    Object.keys(target.marks[bucket]).forEach(function (id) {
      if (target.marks[bucket][id].on) visible[id] = true;
    });
    target[bucket] = visible;
  }
  function merge(target, source) {
    if (!object(target)) target = {};
    if (!object(source)) return target;
    validate(source);
    if (!object(target.marks)) target.marks = {};
    BUCKETS.forEach(function (bucket) {
      var old = candidates(target, bucket);
      var incoming = candidates(source, bucket);
      Object.keys(incoming).forEach(function (id) {
        if (!old[id] || compare(incoming[id], old[id]) > 0) old[id] = incoming[id];
      });
      target.marks[bucket] = old;
      materialize(target, bucket);
    });
    return target;
  }
  function record(target, bucket, id, on, actor) {
    if (BUCKETS.indexOf(bucket) === -1 || !safeId(id)) throw new Error('同步标记 ID 不正确');
    merge(target, {});
    var previous = target.marks[bucket][id];
    target.marks[bucket][id] = {
      on: !!on,
      at: Math.max(Date.now(), previous ? previous.at + 1 : 1),
      actor: actor || ''
    };
    materialize(target, bucket);
  }
  var api = { buckets: BUCKETS, validate: validate, merge: merge, record: record };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CC_MARKS = api;
})();
