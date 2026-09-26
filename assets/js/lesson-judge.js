/* assets/js/lesson-judge.js
   Shared lesson grading contract.  A lesson step is complete only when the
   submitted command matches the declared command, the simulator exits cleanly,
   and any declared output/state assertion passes. */
(function () {
  'use strict';

  function normalize(command) {
    return String(command == null ? '' : command).replace(/\s+/g, ' ').trim();
  }

  function textOf(result) {
    var out = result && Array.isArray(result.out) ? result.out : [];
    var err = result && Array.isArray(result.err) ? result.err : [];
    return out.concat(err).join('\n');
  }

  function matches(value, text) {
    if (value == null) return true;
    if (Object.prototype.toString.call(value) === '[object RegExp]') {
      value.lastIndex = 0;
      return value.test(text);
    }
    return text.indexOf(String(value)) !== -1;
  }

  function stateMatches(assertion, shell) {
    if (!assertion) return true;
    if (!shell || typeof assertion !== 'object') return false;
    if (assertion.cwd != null && shell.cwd !== assertion.cwd) return false;
    if (assertion.user != null && shell.user !== assertion.user) return false;
    if (assertion.host != null && shell.host !== assertion.host) return false;
    if (assertion.env) {
      for (var key in assertion.env) {
        if (Object.prototype.hasOwnProperty.call(assertion.env, key) && String((shell.env || {})[key]) !== String(assertion.env[key])) return false;
      }
    }
    if (assertion.paths) {
      var findNode = window.CC_SHELL && window.CC_SHELL.util && window.CC_SHELL.util.findNode;
      if (typeof findNode !== 'function' || !shell.root) return false;
      for (var i = 0; i < assertion.paths.length; i++) {
        var wanted = assertion.paths[i];
        if (!wanted || !/^\//.test(wanted.path || '')) return false;
        var node = findNode(shell.root, wanted.path);
        if (wanted.absent) { if (node) return false; continue; }
        if (!node) return false;
        if (wanted.type && node.type !== wanted.type) return false;
        if (wanted.mode && node.mode !== wanted.mode) return false;
        if (wanted.minSize != null && Number(node.explicitSize != null ? node.explicitSize : String(node.content || '').length) < Number(wanted.minSize)) return false;
        if (wanted.contentIncludes != null && String(node.content || '').indexOf(String(wanted.contentIncludes)) === -1) return false;
      }
    }
    return true;
  }

  function check(step, typed, result, shell) {
    step = step || {};
    if (normalize(typed) !== normalize(step.cmd)) return { ok: false, reason: 'command' };
    if (!result || result.code !== 0) return { ok: false, reason: 'exit', code: result && result.code };
    var text = textOf(result);
    if (!matches(step.expect, text)) return { ok: false, reason: 'expect' };
    if (!stateMatches(step.state, shell)) return { ok: false, reason: 'state' };
    return { ok: true, text: text };
  }

  function outcomeMatches(lesson, result) {
    if (!lesson || !lesson.expect || !result || result.code !== 0) return false;
    var out = Array.isArray(result.out) ? result.out.join('\n') : '';
    return matches(lesson.expect, out);
  }

  window.CC_LESSON_JUDGE = {
    normalize: normalize,
    textOf: textOf,
    check: check,
    outcomeMatches: outcomeMatches,
    stateMatches: stateMatches
  };
})();
