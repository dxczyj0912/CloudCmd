/* ==========================================================================
   assets/js/search.js · 搜索引擎
   一次性构建内存索引；中文无需分词，直接子串匹配
   打分：命令名 > 别名 > 标签 > summary > desc > 参数 > 示例
   ========================================================================== */
(function () {
  'use strict';

  var index = [];        /* 扁平化后的可搜索条目 */
  var byId = {};         /* commandId -> 条目（供 related 查询） */
  var built = false;

  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }

  /* 轻量归一化：全角转半角 + 去多余空白，让 "ｄｏｃｋｅｒ　ｒｕｎ" 也能搜到 */
  function norm(s) {
    return lc(s)
      .replace(/[\uFF01-\uFF5E]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function build() {
    if (built) return;
    index = [];
    byId = {};

    var cats = window.CC_CATS_META ? window.CC_CATS_META.list : [];
    var catMap = {};
    for (var c = 0; c < cats.length; c++) catMap[cats[c].id] = cats[c];

    for (var catId in window.CC_DATA) {
      if (!Object.prototype.hasOwnProperty.call(window.CC_DATA, catId)) continue;
      var list = window.CC_DATA[catId] || [];
      var cat = catMap[catId] || { id: catId, name: catId, icon: '' };

      for (var i = 0; i < list.length; i++) {
        var cmd = list[i];
        if (!cmd || !cmd.id) continue;

        var exCmds = [], pFlags = [];
        if (cmd.examples) {
          for (var e = 0; e < cmd.examples.length; e++) exCmds.push(cmd.examples[e].cmd || '');
        }
        if (cmd.params) {
          for (var p = 0; p < cmd.params.length; p++) pFlags.push(cmd.params[p].flag || '');
        }

        var entry = {
          id: cmd.id,
          catId: catId,
          catName: cat.name,
          catIcon: cat.icon || '',
          name: cmd.name || '',
          nameN: norm(cmd.name),
          aliasN: cmd.alias ? norm(' ' + cmd.alias.join(' ') + ' ') : '',
          tagN: cmd.tags ? norm(' ' + cmd.tags.join(' ') + ' ') : '',
          sumN: norm(cmd.summary),
          descN: norm(cmd.desc),
          notesN: cmd.notes ? norm(cmd.notes.join(' ')) : '',
          paramN: norm(pFlags.join(' ')),
          exN: norm(exCmds.join(' ')),
          level: cmd.level || 1,
          summary: cmd.summary || '',
          cmd: cmd
        };
        // 全局大字段，用于"全都要匹配"的兜底搜索
        entry.allN = entry.nameN + ' ' + entry.aliasN + ' ' + entry.tagN + ' ' +
                     entry.sumN + ' ' + entry.descN + ' ' + entry.notesN + ' ' +
                     entry.paramN + ' ' + entry.exN;

        index.push(entry);
        byId[cmd.id] = entry;
      }
    }
    built = true;
  }

  function hit(hay, q, w) {
    if (!hay || !q) return 0;
    if (hay.indexOf(q) === -1) return 0;
    return w;
  }

  /* 转义正则元字符，用于按词边界匹配 */
  function reEsc(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* 分词：英文/数字按非字母数字切分，中文按单字切分；丢弃单字符的词 */
  function tokenize(str) {
    var trimmed = str.trim();
    if (!trimmed) return [];
    var parts = trimmed.split(/[^0-9a-z\u4e00-\u9fa5]+/);
    var tokens = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      if (/^[0-9a-z]+$/.test(p)) {
        if (p.length >= 2) tokens.push(p);
      } else {
        /* 含中文：拆成单字后合并为 2 字词组，避免单字命中过多 */
        for (var j = 0; j < p.length - 1; j++) tokens.push(p.slice(j, j + 2));
      }
    }
    return tokens;
  }

  function scoreOf(entry, q) {
    var s = 0;

    /* 命令名 */
    if (entry.nameN === q) s += 200;
    else if (entry.nameN.indexOf(q) === 0) s += 120;
    else if (entry.nameN.indexOf(q) !== -1) s += 80;

    s += hit(entry.aliasN, q, 45);
    s += hit(entry.tagN, q, 38);
    s += hit(entry.sumN, q, 28);
    s += hit(entry.descN, q, 14);
    s += hit(entry.notesN, q, 13);
    s += hit(entry.paramN, q, 12);
    s += hit(entry.exN, q, 10);

    /* 兜底：整个查询串没命中时，尝试"所有词都命中"的乱序匹配
       （支持 "run docker" 这种输入）。命中过少说明是噪声，直接判定不匹配 */
    if (s === 0) {
      var tokens = tokenize(q);
      if (tokens.length > 1) {
        var matched = 0;
        for (var i = 0; i < tokens.length; i++) {
          var t = tokens[i];
          var boundary = new RegExp('(^|[^0-9a-z])' + reEsc(t), 'i');
          if (boundary.test(entry.nameN) || boundary.test(entry.aliasN) || boundary.test(entry.tagN)) {
            matched++;
          }
        }
        /* 至少 2 个词且覆盖一半以上，才算有效命中 */
        if (matched >= 2 && matched / tokens.length >= 0.5) {
          s += 30 * matched;
        }
      }
    }

    if (s === 0) return 0;

    /* 难度低的更常用，轻微加权；同时让结果更稳定 */
    s += (5 - Math.min(entry.level, 4)) * 2;

    return s;
  }

    /* 分词回退打分：统计命中的词数与总权重
       只保留"至少命中 2 个词"且"命中词权重合计 ≥ 2"的结果，滤掉只命中噪音词的条目 */
    function tokenScore(entry, tokens) {
      var matched = 0, weight = 0;
      for (var t = 0; t < tokens.length; t++) {
        var token = tokens[t];
        if (entry.nameN.indexOf(token) !== -1) { matched++; weight += 3; continue; }
        if (entry.aliasN.indexOf(token) !== -1 || entry.tagN.indexOf(token) !== -1) { matched++; weight += 2; continue; }
        if (entry.sumN.indexOf(token) !== -1) { matched++; weight += 1; }
      }
      if (matched < 2 || weight < 2) return 0;
      return matched * 8 + weight * 6;
    }

  window.CC_SEARCH = {
    build: build,

    /* 返回 [{entry, score}]，已排序，最多 limit 条
       opts.tokens = true 时启用"长查询分词回退"（用于自然语言式提问） */
    query: function (rawQ, limit, opts) {
      build();
      var q = norm(rawQ);
      if (!q) return [];

      var i, s;
      var scored = [];    /* 精确打分命中 */
      var tokenHits = []; /* 分词回退命中 */

      var tokens = null;
      if (opts && opts.tokens) {
        var tk = tokenize(q);
        if (tk.length >= 2) tokens = tk;
      }

      for (i = 0; i < index.length; i++) {
        s = scoreOf(index[i], q);
        if (s > 0) scored.push({ entry: index[i], score: s });
        if (tokens) {
          var ts = tokenScore(index[i], tokens);
          if (ts > 0) tokenHits.push({ entry: index[i], score: ts, soft: scored.length === 0 });
        }
      }

      /* 有精确命中就只用精确命中；精确命中严格少于 3 条时并入分词结果补足 */
      var out;
      if (scored.length >= (tokens ? 3 : 1)) {
        out = scored;
      } else if (tokens && tokenHits.length) {
        out = tokenHits;
      } else {
        out = scored;
      }

      out.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (a.entry.level !== b.entry.level) return a.entry.level - b.entry.level;
        return a.entry.name < b.entry.name ? -1 : 1;
      });
      return typeof limit === 'number' ? out.slice(0, limit) : out;
    },

    norm: norm,
    tokenize: tokenize,
    get: function (id) { build(); return byId[id] || null; },
    size: function () { build(); return index.length; }
  };
})();
