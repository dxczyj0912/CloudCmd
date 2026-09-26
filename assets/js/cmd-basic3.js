/* assets/js/cmd-basic3.js · 第二批 B 档命令（依赖 fixtures，见 assets/js/fs-extra.js）
   --------------------------------------------------------------------------
   覆盖的内容条目：
     linux-basic  readlink / realpath / sha256sum / cmp / gunzip / gzip /
                  split / alias / install / rename / zip / unzip / tac / xz / zstd

   ⚠️ 这一批**必须先有夹具**（`assets/js/fs-extra.js`）：
   `example-check` 对"引擎未实现"的命令是跳过，一旦实现就变成真跑，
   所以命令与夹具必须一起上，否则只是把"跳过"变成"失败"。

   两个诚实性约定：
     · 压缩类命令（gzip/gunzip/xz/zstd）在仿真里不真的压缩 —— 文件内容保持明文，
       只翻转节点上的 `gz` 标记并改文件名。页面上不假装压缩比、不显示字节数变化。
     · zip 用一套**自描述的内部格式**（ZIPSIM1 + JSON 清单），
       所以 `zip` → `unzip` 是真正能往返的（内容也能还原），不是固定假输出。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;

  var U = window.CC_SHELL.util;
  var ok = U.ok, fail = U.fail;

  /* ==================== readlink / realpath：解析软链 ==================== */
  /* 一路解析到最终目标；返回 { path, exists, hops } */
  function resolveLinks(ctx, abs, maxHops) {
    var cur = abs, hops = 0, guard = maxHops || 16;
    while (hops++ < guard) {
      var node = U.findNode(ctx.root, cur);
      if (!node) return { path: cur, exists: false, hops: hops };
      if (node.type !== 'link') return { path: cur, exists: true, hops: hops, node: node };
      var t = String(node.target || '');
      cur = t.charAt(0) === '/' ? t : U.resolvePath(U.parentOf(cur), t);
    }
    return { path: cur, exists: false, hops: hops, loop: true };
  }

  function readlinkCmd(argv, ctx) {
    var canonical = false, requireExist = false, noNewline = false, targets = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-f' || a === '--canonicalize') { canonical = true; continue; }
      if (a === '-e' || a === '--canonicalize-existing') { canonical = true; requireExist = true; continue; }
      if (a === '-m' || a === '--canonicalize-missing') { canonical = true; continue; }
      if (a === '-n' || a === '--no-newline') { noNewline = true; continue; }
      if (a === '-s' || a === '-q' || a === '-v') continue;
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['readlink: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'readlink --help\' for more information.']);
      }
      targets.push(a);
    }
    if (!targets.length) return fail(['readlink: missing operand', 'Try \'readlink --help\' for more information.']);
    var out = [], err = [], code = 0;
    targets.forEach(function (t) {
      var abs = U.resolvePath(ctx.cwd, t);
      var node = U.findNode(ctx.root, abs);
      if (!canonical) {
        /* 不带 -f：只读出**这一层**软链的目标；普通文件没有任何输出（真机行为） */
        if (!node) { err.push('readlink: ' + t + ': No such file or directory'); code = 1; return; }
        if (node.type !== 'link') return;                 /* 普通文件：静默，退出码 0 */
        out.push(String(node.target || ''));
        return;
      }
      /* -f/-e/-m：解析成绝对路径 */
      var r = resolveLinks(ctx, abs);
      if (requireExist && !r.exists) { err.push('readlink: ' + t + ': No such file or directory'); code = 1; return; }
      if (r.loop) { err.push('readlink: ' + t + ': Too many levels of symbolic links'); code = 1; return; }
      out.push(r.path);
    });
    if (out.length && !noNewline) return { out: out, err: err, code: code };
    return { out: out, err: err, code: code };
  }

  function realpathCmd(argv, ctx) {
    var requireExist = false, relativeTo = null, noSymlinks = false, targets = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-e' || a === '--canonicalize-existing') { requireExist = true; continue; }
      if (a === '-m' || a === '--canonicalize-missing') { requireExist = false; continue; }
      if (a === '-s' || a === '--strip' || a === '--no-symlinks') { noSymlinks = true; continue; }
      if (a === '--relative-to') { relativeTo = String(argv[++i]); continue; }
      if (/^--relative-to=/.test(a)) { relativeTo = a.slice('--relative-to='.length); continue; }
      if (a === '-q' || a === '--quiet' || a === '-z' || a === '--zero') continue;
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['realpath: unrecognized option \'' + a + '\'', 'Try \'realpath --help\' for more information.']);
      }
      targets.push(a);
    }
    if (!targets.length) return fail(['realpath: missing operand', 'Try \'realpath --help\' for more information.']);
    var out = [], code = 0;
    targets.forEach(function (t) {
      var abs = U.resolvePath(ctx.cwd, t);
      var finalAbs = noSymlinks ? abs : resolveLinks(ctx, abs).path;
      if (requireExist && !U.findNode(ctx.root, finalAbs)) { code = 1; return; }   /* -e 失败时不输出 */
      if (relativeTo !== null) {
        var base = U.resolvePath(ctx.cwd, relativeTo);
        if (finalAbs.indexOf(base + '/') === 0) { out.push(finalAbs.slice(base.length + 1)); return; }
        if (finalAbs === base) { out.push('.'); return; }
      }
      out.push(finalAbs);
    });
    return { out: out, err: [], code: code };
  }

  /* ==================== sha256sum：摘要（与 md5sum 同一套仿真算法） ==================== */
  function digestOf(content, salt, width) {
    var h = 0, s = String(content) + String(salt);
    for (var k = 0; k < s.length; k++) h = (h * 131 + s.charCodeAt(k)) % 4294967296;
    var seed = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    return (h.toString(16) + seed).slice(0, width);
  }

  function sha256Cmd(argv, ctx, stdin) {
    var check = false, files = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-c' || a === '--check') { check = true; continue; }
      if (a === '--ignore-missing' || a === '--quiet' || a === '--status' || a === '-b' || a === '-t') continue;
      if (a.charAt(0) === '-') continue;
      files.push(a);
    }
    /* `sha256sum -c 清单`：逐行校验（站内示例用它做发布包校验） */
    if (check) {
      var text = '';
      if (files.length) {
        var rc = U.readFileOrErr(ctx, files[0]);
        if (rc.err) return fail(['sha256sum: ' + files[0] + ': No such file or directory']);
        text = rc.content;
      } else text = (stdin || []).join('\n');
      var out2 = [], bad = 0;
      U.splitLines(text).forEach(function (line) {
        var m = String(line).match(/^([0-9a-f]{8,64})\s+\*?(.+)$/);
        if (!m) return;
        var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, m[2]));
        if (!node || node.type === 'dir') { out2.push(m[2] + ': FAILED'); out2.push('sha256sum: ' + m[2] + ': No such file or directory'); bad++; return; }
        var got = digestOf(node.content, m[2], 64);
        if (got === m[1]) out2.push(m[2] + ': OK');
        else { out2.push(m[2] + ': FAILED'); bad++; }
      });
      if (bad) out2.push('sha256sum: WARNING: ' + bad + ' computed checksum' + (bad > 1 ? 's' : '') + ' did NOT match');
      return { out: out2, err: [], code: bad ? 1 : 0 };
    }
    if (!files.length) {
      var body = (stdin || []).join('\n');
      return ok([digestOf(body, '-', 64) + '  -']);
    }
    var out = [], err = [];
    files.forEach(function (f) {
      var abs = U.resolvePath(ctx.cwd, f);
      var node = U.findNode(ctx.root, abs);
      if (!node || node.type === 'dir') { err.push('sha256sum: ' + f + ': No such file or directory'); return; }
      out.push(digestOf(node.content, f, 64) + '  ' + f);
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  }

  /* ==================== cmp：逐字节比较 ==================== */
  function cmpCmd(argv, ctx) {
    var silent = false, listAll = false, files = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-s' || a === '--silent' || a === '--quiet') { silent = true; continue; }
      if (a === '-l' || a === '--verbose') { listAll = true; continue; }
      if (a === '-b' || a === '--print-bytes') continue;
      if (a.charAt(0) === '-' && a.length > 1 && !/^-\d+$/.test(a)) {
        return fail(['cmp: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'cmp --help\' for more information.']);
      }
      files.push(a);
    }
    if (files.length < 2) return fail(['cmp: missing operand after \'' + (files[0] || '') + '\'',
      'cmp: Try \'cmp --help\' for more information.']);
    var nodes = [];
    for (var k = 0; k < 2; k++) {
      var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, files[k]));
      if (!node || node.type === 'dir') return fail(['cmp: ' + files[k] + ': No such file or directory'], 2);
      nodes.push(node);
    }
    var a1 = String(nodes[0].content || ''), b1 = String(nodes[1].content || '');
    /* 长度不同：真 cmp 报 EOF 并给出"哪个文件先结束" */
    if (a1 !== b1) {
      var n = Math.min(a1.length, b1.length), first = -1;
      for (var j = 0; j < n; j++) if (a1.charAt(j) !== b1.charAt(j)) { first = j; break; }
      if (first < 0 && a1.length !== b1.length) {
        /* 前缀相同、只是长度不同 */
        if (silent) return { out: [], err: [], code: 1 };
        var shorter = a1.length < b1.length ? files[0] : files[1];
        return { out: ['cmp: EOF on ' + shorter + ' which is empty or shorter'], err: [], code: 1 };
      }
      if (silent) return { out: [], err: [], code: 1 };
      if (listAll) {
        var outL = [];
        for (var q = 0; q < Math.max(a1.length, b1.length); q++) {
          var ca = a1.charCodeAt(q), cb = b1.charCodeAt(q);
          if (isNaN(ca) || isNaN(cb) || ca !== cb) outL.push((q + 1) + ' ' + (isNaN(ca) ? 0 : ca).toString(8) + ' ' + (isNaN(cb) ? 0 : cb).toString(8));
        }
        return { out: outL, err: [], code: 1 };
      }
      var line = 1;
      for (var z = 0; z < first; z++) if (a1.charAt(z) === '\n') line++;
      return { out: [files[0] + ' ' + files[1] + ' differ: byte ' + (first + 1) + ', line ' + line], err: [], code: 1 };
    }
    return { out: [], err: [], code: 0 };   /* 完全一致：无输出、退出码 0 */
  }

  /* ==================== 压缩族：gzip/gunzip/xz/zstd ====================
     仿真里不真的压缩：内容保持明文，只翻转 `gz` 标记并改文件名。
     页面与命令都不假装压缩比或字节数变化。 */
  function compressFamily(kind, decompress, argv, ctx) {
    var keep = false, toStdout = false, testOnly = false, force = false, listInfo = false, files = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      /* `-T` 是**带值**选项（线程数），必须连值一起吃掉；
         `-T0` 是贴写形式，值在同一个 token 里。早先两者混在一起处理，
         于是 `xz -T 0 -9 文件` 里的 `0` 变成了"要压缩的文件"——
         报 `xz: 0: No such file or directory`，参数完全正确却跑不通。 */
      if (a === '-T' || a === '--threads') { i++; continue; }
      /* `-T0`（贴写的线程数）也要认 —— `[a-zA-Z]*` 匹配不到数字，
         所以它落不进下面的"合并短选项"正则，会被当成未知选项报错。
         站内 lb-zstd 的示例写的就是 `zstd -T0 -19 文件`。 */
      if (/^-T\d+$/.test(a)) continue;
      /* 合并短选项：`-dk`、`-9k`、`-19` 这种写法在站内示例里就有 */
      var cm = a.match(/^-([0-9]*)([a-zA-Z]*)$/);
      if (cm && a.length > 1) {
        var letters = cm[2];
        var handled = true;
        for (var c = 0; c < letters.length; c++) {
          var ch = letters.charAt(c);
          if (ch === 'k') keep = true;
          else if (ch === 'c') toStdout = true;
          else if (ch === 't') testOnly = true;
          else if (ch === 'f') force = true;
          else if (ch === 'd') decompress = true;
          else if (ch === 'l') listInfo = true;
          else if (ch === 'v' || ch === 'q' || ch === 'r' || ch === 'z' || ch === 'T' || ch === 'e') { /* 无副作用 */ }
          else handled = false;
        }
        if (handled) {
          /* `-T0` 的 0 已经被 cm[1] 吃掉；`-T 0` 的空格写法在下面单独处理 */
          continue;
        }
        return fail([kind + ': invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'' + kind + ' --help\' for more information.']);
      }
      if (a === '-T' || a === '--threads') { i++; continue; }        /* `-T 0` 空格写法 */
      if (a === '-l' || a === '--list') { listInfo = true; continue; }
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail([kind + ': invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'' + kind + ' --help\' for more information.']);
      }
      files.push(a);
    }
    if (!files.length) return fail([kind + ': 需要文件名（教学环境不支持从标准输入压缩）']);
    var exts = kind === 'gzip' ? ['.gz', '.tgz'] : (kind === 'xz' ? ['.xz'] : ['.zst', '.zstd']);
    var out = [], err = [], code = 0;
    files.forEach(function (f) {
      var abs = U.resolvePath(ctx.cwd, f);
      var node = U.findNode(ctx.root, abs);
      if (!node || node.type === 'dir') { err.push(kind + ': ' + f + ': No such file or directory'); code = 1; return; }
      err = err;
      var parent = U.findNode(ctx.root, U.parentOf(abs));
      var name = String(abs).slice(String(abs).lastIndexOf('/') + 1);
      if (decompress) {
        var hit = null;
        for (var e = 0; e < exts.length; e++) if (name.length > exts[e].length && name.slice(-exts[e].length) === exts[e]) hit = exts[e];
        if (!hit) {
          /* `gunzip` 也接受没带后缀的 .tgz / 内容带 gz 标记的文件 */
          if (node.gz) hit = '';
          else { err.push(kind + ': ' + f + ': not in ' + (kind === 'gzip' ? 'gzip' : kind) + ' format'); code = 1; return; }
        }
        /* `-l`：只列出压缩信息，不动文件 */
        if (listInfo) {
          var body0 = String(node.content || '');
          out.push('Strms  Blocks   Compressed Uncompressed  Ratio  Check   Filename');
          out.push('    1       1    ' + String(Math.max(1, Math.round(body0.length / 3))).padStart(9, ' ')
            + ' ' + String(body0.length).padStart(12, ' ') + '  --   CRC64   ' + f);
          out.push('（教学环境）仿真里不做真实压缩，这里的字节数是按明文长度估的，只看格式。');
          return;
        }
        if (testOnly) { out.push(f + ': OK'); return; }
        var plain = name.slice(0, name.length - hit.length);
        if (toStdout) { out.push(String(node.content || '').replace(/\n$/, '')); return; }
        if (node.gz) node.gz = false;
        /* `-k` 的语义是"**另存**一份解压结果、压缩包留着"。
           早先不看 keep，一律把压缩包改名（等于删掉），
           于是同一条记录里后面那句 `gunzip -t 同一个包` 就报"文件不存在"：
           **一条示例的副作用把同批的其它示例带崩了**。 */
        if (keep && hit && parent && !parent.children[plain]) {
          var plainNode = JSON.parse(JSON.stringify(node));
          plainNode.gz = false;
          parent.children[plain] = plainNode;
        } else if (hit && !keep && parent) {
          delete parent.children[name];
          parent.children[plain] = node;
        }
        return;
      }
      /* 压缩方向 */
      if (listInfo) {
        var body1 = String(node.content || '');
        out.push('Strms  Blocks   Compressed Uncompressed  Ratio  Check   Filename');
        out.push('    1       1    ' + String(Math.max(1, Math.round(body1.length / 3))).padStart(9, ' ')
          + ' ' + String(body1.length).padStart(12, ' ') + '  --   CRC64   ' + f);
        out.push('（教学环境）仿真里不做真实压缩，这里的字节数是按明文长度估的，只看格式。');
        return;
      }
      if (testOnly) { out.push(f + ': OK'); return; }
      if (toStdout) { out.push(String(node.content || '').replace(/\n$/, '')); return; }
      /* ⚠️ 已经带压缩后缀的文件不能再压一次 —— 真 gzip 会说
         "already has .gz suffix -- unchanged"。早先这里不检查，
         于是 `gzip /data/backup/db.sql.gz` 会把它改名成 `db.sql.gz.gz` 并**删掉原名**，
         后面所有用 db.sql.gz 的示例（gunzip -t、zcat …）全部报"文件不存在"——
         一条示例的副作用污染了同一批里的其它示例。 */
      for (var e2 = 0; e2 < exts.length; e2++) {
        if (name.length > exts[e2].length && name.slice(-exts[e2].length) === exts[e2]) {
          err.push(kind + ': ' + f + ' already has ' + exts[e2] + ' suffix -- unchanged');
          code = 2;
          return;
        }
      }
      node.gz = true;
      var newName = name + exts[0];
      if (parent && !keep) { delete parent.children[name]; parent.children[newName] = node; }
      else if (parent && keep) {
        var copy = JSON.parse(JSON.stringify(node));
        copy.gz = true;
        parent.children[newName] = copy;
      }
    });
    return { out: out, err: err, code: code };
  }

  /* ==================== split：大文件切片 ==================== */
  function splitCmd(argv, ctx) {
    var bytes = null, lines = null, parts = null, numeric = false, suffixLen = 2, extraSuffix = '';
    var positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-b' || a === '--bytes') { bytes = parseSize(argv[++i]); continue; }
      if (/^-b/.test(a)) { bytes = parseSize(a.slice(2)); continue; }
      if (a === '-l' || a === '--lines') { lines = Number(argv[++i]); continue; }
      if (/^-l/.test(a)) { lines = Number(a.slice(2)); continue; }
      if (a === '-n' || a === '--number') { parts = Number(String(argv[++i]).replace(/^l\//, '').replace(/\/.*$/, '')); continue; }
      if (a === '-d' || a === '--numeric-suffixes') { numeric = true; continue; }
      if (a === '-a' || a === '--suffix-length') { suffixLen = Number(argv[++i]); continue; }
      if (/^-a\d+$/.test(a)) { suffixLen = Number(a.slice(2)); continue; }
      if (a === '--additional-suffix') { extraSuffix = String(argv[++i]); continue; }
      if (/^--additional-suffix=/.test(a)) { extraSuffix = a.slice('--additional-suffix='.length); continue; }
      if (a === '-e' || a === '--elide-empty-files' || a === '-u' || a === '--unbuffered') continue;
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['split: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'split --help\' for more information.']);
      }
      positional.push(a);
    }
    var src = positional[0] || '';
    var prefix = positional[1] || 'x';
    if (!src) return fail(['split: missing operand', 'Try \'split --help\' for more information.']);
    if (bytes === null && lines === null && parts === null) {
      return fail(['split: 必须给出 -b（按字节）/ -l（按行）/ -n（按份数）其中之一']);
    }
    var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, src));
    if (!node || node.type === 'dir') return fail(['split: cannot open \'' + src + '\' for reading: No such file or directory']);
    var total = node.explicitSize !== undefined ? node.explicitSize : String(node.content || '').length;
    var content = String(node.content || '');
    var count;
    if (parts !== null) count = Math.max(1, parts);
    else if (bytes !== null) count = Math.max(1, Math.ceil(total / Math.max(1, bytes)));
    else count = Math.max(1, Math.ceil(U.splitLines(content).length / Math.max(1, lines)));
    if (count > 1000) return fail(['split: 按这个大小会切出 ' + count + ' 份（教学环境上限 1000 份，换个大一点的 -b）']);
    var absPrefix = U.resolvePath(ctx.cwd, prefix);
    var parent = U.findNode(ctx.root, U.parentOf(absPrefix));
    if (!parent) return fail(['split: ' + prefix + ': No such file or directory']);
    var baseName = String(absPrefix).slice(String(absPrefix).lastIndexOf('/') + 1);
    var made = [];
    function suffix(n) {
      if (numeric) return String(n).padStart(suffixLen, '0');
      var s = '';
      for (var k = 0; k < suffixLen; k++) { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
      return s;
    }
    for (var p = 0; p < count; p++) {
      var from = Math.floor(content.length * p / count);
      var to = Math.floor(content.length * (p + 1) / count);
      var nm = baseName + suffix(p) + extraSuffix;
      var nf = U.findNode ? null : null;
      var child = { type: 'file', content: content.slice(from, to), mode: node.mode || '644',
        user: node.user || 'root', group: node.group || 'root', mtime: node.mtime || '2024-03-18 09:00',
        explicitSize: Math.max(1, Math.round(total / count)) };
      parent.children[nm] = child;
      made.push(nm);
    }
    return ok(made);
  }

  function parseSize(s) {
    var m = String(s || '').match(/^([\d.]+)\s*([KMGTP])?B?$/i);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (isNaN(n)) return null;
    var mult = { '': 1, K: 1024, M: 1048576, G: 1073741824, T: 1099511627776, P: 1125899906842624 }[(m[2] || '').toUpperCase()] || 1;
    return Math.round(n * mult);
  }

  /* ==================== tac：按行倒序 ==================== */
  function tacCmd(argv, ctx, stdin) {
    var sep = '\n', files = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-s' || a === '--separator') { sep = String(argv[++i]); continue; }
      if (/^-s./.test(a)) { sep = a.slice(2); continue; }
      if (a === '-b' || a === '--before' || a === '-r' || a === '--regex') continue;
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['tac: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'tac --help\' for more information.']);
      }
      files.push(a);
    }
    var lines = stdin || [];
    if (files.length) {
      lines = [];
      for (var f = 0; f < files.length; f++) {
        var r = U.readFileOrErr(ctx, files[f]);
        if (r.err) return fail(['tac: ' + files[f] + ': No such file or directory']);
        lines = lines.concat(U.splitLines(r.content));
      }
    }
    if (sep === '\n') return ok(lines.slice().reverse());
    /* 自定义分隔符：按分隔符切成段、倒序，**再用原分隔符拼回去**
       （真 `tac -s ';'` 输出的是 `c;b;a`，不是三行）。 */
    var whole = lines.join('\n');
    return ok([whole.split(sep).reverse().join(sep)]);
  }

  /* ==================== alias：定义与查看别名 ==================== */
  function aliasCmd(argv, ctx) {
    var showAll = argv.length === 0;
    var out = [];
    if (showAll) {
      var all = (window.CC_SHELL.listAliases && window.CC_SHELL.listAliases()) || {};
      Object.keys(all).sort().forEach(function (n) {
        if (all[n]) out.push('alias ' + n + '=\'' + all[n] + '\'');
      });
      return ok(out);
    }
    var err = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.charAt(0) === '-') continue;
      var eq = a.indexOf('=');
      if (eq < 0) {
        /* `alias ll` 只显示这一条 */
        var v = window.CC_SHELL.getAlias ? window.CC_SHELL.getAlias(a) : null;
        if (v) out.push('alias ' + a + '=\'' + v + '\'');
        else { err.push('bash: alias: ' + a + ': not found'); }
        continue;
      }
      var name = a.slice(0, eq);
      var val = a.slice(eq + 1).replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) { err.push('bash: alias: `' + name + '\': invalid alias name'); continue; }
      if (window.CC_SHELL.setAlias) window.CC_SHELL.setAlias(name, val);
      else { err.push('bash: alias: 教学环境无法写入别名表'); }
    }
    return { out: out, err: err, code: err.length ? 1 : 0 };
  }

  /* ==================== install：复制并设权限 ==================== */
  function installCmd(argv, ctx) {
    var mode = null, owner = null, group = null, makeDirs = false, dirMode = false;
    var verbose = false, backup = false, positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-m' || a === '--mode') { mode = String(argv[++i]); continue; }
      if (/^-m/.test(a)) { mode = a.slice(2); continue; }
      if (a === '-o' || a === '--owner') { owner = String(argv[++i]); continue; }
      if (a === '-g' || a === '--group') { group = String(argv[++i]); continue; }
      if (a === '-D') { makeDirs = true; continue; }
      if (a === '-d' || a === '--directory') { dirMode = true; continue; }
      if (a === '-v' || a === '--verbose') { verbose = true; continue; }
      if (a === '-b' || a === '--backup') { backup = true; continue; }
      if (a === '-p' || a === '--preserve-timestamps' || a === '-s' || a === '--strip' ||
          a === '-t' || a === '--target-directory' || a === '-T' || a === '--no-target-directory') { i++; continue; }
      if (a === '-c') continue;
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['install: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'install --help\' for more information.']);
      }
      positional.push(a);
    }
    if (!positional.length) return fail(['install: missing file operand', 'Try \'install --help\' for more information.']);
    var out = [];
    function normMode(m) {
      if (m === null || m === undefined || m === '') return null;
      var s = String(m).replace(/^0+/, '');
      return s === '' ? '000' : s.padStart(3, '0');
    }
    function applyMeta(node) {
      var mm = normMode(mode);
      if (mm) node.mode = mm;
      if (owner) node.user = owner;
      if (group) node.group = group;
    }
    /* `install -d`：只建目录 */
    if (dirMode) {
      positional.forEach(function (p) {
        var abs = U.resolvePath(ctx.cwd, p);
        var existing = U.findNode(ctx.root, abs);
        if (existing) { applyMeta(existing); return; }
        var parent = U.findNode(ctx.root, U.parentOf(abs));
        if (!parent) { out.push('install: cannot create directory \'' + p + '\': No such file or directory'); return; }
        var nm = String(abs).slice(String(abs).lastIndexOf('/') + 1);
        var d = { type: 'dir', children: {}, user: owner || 'root', group: group || 'root',
          mode: normMode(mode) || '755', mtime: '2024-03-18 09:00' };
        parent.children[nm] = d;
      });
      return ok(out);
    }
    if (positional.length < 2) return fail(['install: missing destination file operand after \'' + positional[0] + '\'',
      'Try \'install --help\' for more information.']);
    var dest = positional[positional.length - 1];
    var sources = positional.slice(0, -1);
    sources.forEach(function (src) {
      var sAbs = U.resolvePath(ctx.cwd, src);
      var sNode = U.findNode(ctx.root, sAbs);
      if (!sNode || sNode.type === 'dir') { out.push('install: cannot stat \'' + src + '\': No such file or directory'); return; }
      var dAbs = U.resolvePath(ctx.cwd, dest);
      var dNode = U.findNode(ctx.root, dAbs);
      if (dNode && dNode.type === 'dir') {
        dAbs = dAbs + '/' + String(sAbs).slice(String(sAbs).lastIndexOf('/') + 1);
      }
      var dParent = U.findNode(ctx.root, U.parentOf(dAbs));
      if (!dParent && makeDirs) {
        /* `-D`：自动建出缺失的父目录 */
        var segs = String(U.parentOf(dAbs)).split('/').filter(Boolean);
        var cur = ctx.root;
        for (var s = 0; s < segs.length; s++) {
          if (!cur.children[segs[s]]) cur.children[segs[s]] = { type: 'dir', children: {}, user: 'root', group: 'root', mode: '755', mtime: '2024-03-18 09:00' };
          cur = cur.children[segs[s]];
        }
        dParent = cur;
      }
      if (!dParent) { out.push('install: cannot create regular file \'' + dest + '\': No such file or directory'); return; }
      var dName = String(dAbs).slice(String(dAbs).lastIndexOf('/') + 1);
      if (backup && dParent.children[dName]) dParent.children[dName + '~'] = dParent.children[dName];
      var copy = JSON.parse(JSON.stringify(sNode));
      /* install 的默认权限是 755，而 cp 沿用源文件权限 —— 这是站内讲过的区别 */
      copy.mode = normMode(mode) || '755';
      if (owner) copy.user = owner;
      if (group) copy.group = group;
      dParent.children[dName] = copy;
      if (verbose) out.push('\'' + src + '\' -> \'' + dest + '\'');
    });
    return ok(out);
  }

  /* ==================== rename：批量改名（两种方言都支持） ==================== */
  function renameCmd(argv, ctx) {
    var dryRun = false, verbose = false, force = false, positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-n' || a === '--no-act' || a === '--dry-run') { dryRun = true; continue; }
      if (a === '-v' || a === '--verbose') { verbose = true; continue; }
      if (a === '-f' || a === '--force') { force = true; continue; }
      if (a === '-i' || a === '--interactive' || a === '-s' || a === '--symlink') continue;
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['rename: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'rename --help\' for more information.']);
      }
      positional.push(a);
    }
    /* ⚠️ 两种方言的参数个数**不一样**：
         util-linux：`rename 旧串 新串 文件...`（≥3）
         perl      ：`rename "s/旧/新/" 文件...`（≥2）
       早先统一按 ≥3 判，于是 `rename -v 's/^IMG_/photo_/' 一个文件` 直接报用法 ——
       而站内 lb-rename 的两条 perl 方言示例正是这种写法。 */
    var perlForm = /^s[\/|#]/.test(String(positional[0] || ''));
    if (positional.length < (perlForm ? 2 : 3)) {
      return fail(['rename: 用法：rename 旧串 新串 文件...（util-linux）或 rename "s/旧/新/" 文件...（perl）',
        'Try \'rename --help\' for more information.']);
    }
    var out = [], changed = 0;
    var isPerl = perlForm;
    function newNameOf(base) {
      if (isPerl) {
        var m = positional[0].match(/^s([\/|#])(.*?)\1(.*?)\1([gi]*)$/);
        if (!m) return null;
        var re;
        try { re = new RegExp(m[2], 'g' + (m[4] || '')); } catch (e) { return null; }
        return base.replace(re, m[3]);
      }
      var from = positional[0], to = positional[1];
      if (base.indexOf(from) === -1) return base;
      return base.split(from).join(to);
    }
    var start = isPerl ? 1 : 2;
    for (var f = start; f < positional.length; f++) {
      var spec = positional[f];
      var abs = U.resolvePath(ctx.cwd, spec);
      /* 支持通配：示例里写的是 /data/upload/*.jpeg（引擎已展开），也可能是字面量 */
      var node = U.findNode(ctx.root, abs);
      if (!node) { out.push('rename: ' + spec + ': No such file or directory'); continue; }
      var parent = U.findNode(ctx.root, U.parentOf(abs));
      var base = String(abs).slice(String(abs).lastIndexOf('/') + 1);
      var nn = newNameOf(base);
      if (nn === null) return fail(['rename: 正则写法无法识别（教学环境支持 s/旧/新/ 与 s#旧#新#）']);
      if (nn === base) continue;
      changed++;
      if (verbose || dryRun) out.push(spec + ' renamed to ' + nn);
      if (!dryRun && parent) {
        if (parent.children[nn] && !force) { out.push('rename: ' + nn + ' already exists（加 -f 覆盖）'); continue; }
        parent.children[nn] = parent.children[base];
        delete parent.children[base];
      }
    }
    if (changed === 0 && !isPerl) out.push('rename: 没有文件名包含 \'' + positional[0] + '\'（检查一下旧串拼写）');
    return ok(out);
  }

  /* ==================== zip / unzip：可往返的内部格式 ====================
     格式：首行 `ZIPSIM1`，第二行是 JSON 数组 [{n:名字, s:大小, c:内容}]。
     之所以自己定一个格式：`tar` 的实现在这个引擎里是**固定假输出**，
     而 zip 的示例要 `zip` 完再 `unzip -l` 看清单、`unzip -d` 解到目录 ——
     只有真能往返，这些步骤才不是演戏。 */
  var ZIP_MARK = 'ZIPSIM1';
  function readZip(node) {
    var text = String(node.content || '');
    if (text.indexOf(ZIP_MARK) !== 0) return null;
    var line = text.split('\n')[1] || '[]';
    try { return JSON.parse(line); } catch (e) { return null; }
  }
  function writeZip(node, entries) {
    node.content = ZIP_MARK + '\n' + JSON.stringify(entries);
    node.explicitSize = node.content.length;
    node.mtime = '2024-03-18 09:00';
  }

  function zipCmd(argv, ctx) {
    var recursive = false, exclude = [], level = null, password = false, positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-r' || a === '--recurse-paths') { recursive = true; continue; }
      if (a === '-x' || a === '--exclude') { exclude.push(String(argv[++i])); continue; }
      if (/^-\d$/.test(a)) { level = a; continue; }
      if (a === '-e' || a === '--encrypt') { password = true; continue; }
      if (a === '-q' || a === '-v' || a === '-9' || a === '-j' || a === '-y' || a === '-m') continue;
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['zip: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'zip --help\' for more information.']);
      }
      positional.push(a);
    }
    if (positional.length < 2) return fail(['zip error: Nothing to do! (try: zip -r archive.zip . -i ...)']);
    var zipSpec = positional[0];
    var zipAbs = U.resolvePath(ctx.cwd, zipSpec);
    if (!/\.zip$/i.test(zipAbs)) zipAbs += '.zip';
    var srcs = positional.slice(1);
    var entries = [];
    var err = [];
    function addFile(abs, display) {
      var nm = String(abs).slice(String(abs).lastIndexOf('/') + 1);
      for (var e = 0; e < exclude.length; e++) {
        try { if (new RegExp('^' + exclude[e].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$').test(nm)) return; } catch (er) { /* ignore */ }
      }
      var nd = U.findNode(ctx.root, abs);
      if (!nd || nd.type === 'dir') return;
      entries.push({ n: display, s: nd.explicitSize !== undefined ? nd.explicitSize : String(nd.content || '').length, c: String(nd.content || '') });
    }
    srcs.forEach(function (s) {
      var abs = U.resolvePath(ctx.cwd, s);
      var node = U.findNode(ctx.root, abs);
      if (!node) { err.push('zip warning: name not matched: ' + s); return; }
      if (node.type === 'dir') {
        if (!recursive) { err.push('zip error: 目录 ' + s + ' 需要 -r（真机行为一致）'); return; }
        var baseName = String(abs).slice(String(abs).lastIndexOf('/') + 1);
        U.walkFiles(node, abs, function (child, childAbs) {
          if (child.type !== 'file') return;
          addFile(childAbs, baseName + childAbs.slice(abs.length));
        });
      } else addFile(abs, String(abs).slice(String(abs).lastIndexOf('/') + 1));
    });
    if (!entries.length) return { out: [], err: err.concat(['zip error: Nothing to do!']), code: 12 };
    var zAbs = zipAbs;
    var zParent = U.findNode(ctx.root, U.parentOf(zAbs));
    if (!zParent) { err.push('zip error: Cannot create ' + zipSpec + ': No such file or directory'); return { out: [], err: err, code: 12 }; }
    var zName = String(zAbs).slice(String(zAbs).lastIndexOf('/') + 1);
    var zNode = zParent.children[zName];
    if (!zNode) {
      zNode = { type: 'file', content: '', mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:00' };
      zParent.children[zName] = zNode;
    }
    var existing = readZip(zNode) || [];
    var merged = existing.slice();
    entries.forEach(function (ne) {
      var found = false;
      for (var m2 = 0; m2 < merged.length; m2++) if (merged[m2].n === ne.n) { merged[m2] = ne; found = true; }
      if (!found) merged.push(ne);
    });
    writeZip(zNode, merged);
    var out = ['  adding: ' + entries.map(function (x) { return x.n; }).join('\n  adding: ')];
    if (password) out.push('（教学环境）`-e` 的传统 zip 加密只做标记，不产生真实密文；敏感数据请用 openssl / gpg。');
    return { out: out, err: err, code: 0 };
  }

  function unzipCmd(argv, ctx) {
    var listOnly = false, dest = null, overwrite = false, never = false, stdout = false, exclude = [], positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-l') { listOnly = true; continue; }
      if (a === '-d') { dest = String(argv[++i]); continue; }
      if (a === '-o') { overwrite = true; continue; }
      if (a === '-n') { never = true; continue; }
      if (a === '-p') { stdout = true; continue; }
      if (a === '-c') { stdout = true; continue; }
      if (a === '-x') { exclude.push(String(argv[++i])); continue; }
      if (a === '-q' || a === '-v' || a === '-j' || a === '-t') continue;
      if (a === '-O') { i++; continue; }                    /* -O gbk：编码开关，教学环境不区分 */
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['unzip: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'unzip --help\' for more information.']);
      }
      positional.push(a);
    }
    if (!positional.length) return fail(['UnZip 6.00  of 20 April 2009, by Debian. Original by Info-ZIP.',
      'Usage: unzip [-Z] [-opts[modifiers]] file[.zip] [list] [-x xlist] [-d exdir]']);
    var zSpec = positional[0];
    var zAbs = U.resolvePath(ctx.cwd, zSpec);
    if (!U.findNode(ctx.root, zAbs) && !/\.zip$/i.test(zAbs)) zAbs += '.zip';
    var zNode = U.findNode(ctx.root, zAbs);
    if (!zNode || zNode.type === 'dir') return { out: [], err: ['unzip: cannot find or open ' + zSpec + ', ' + zSpec + '.zip or ' + zSpec + '.ZIP.'], code: 9 };
    var entries = readZip(zNode);
    if (!entries) return { out: [], err: ['unzip: ' + zSpec + ': 不是本教学环境认识的 zip（引擎只认自己 zip 出来的包）'], code: 9 };
    var want = positional.slice(1);
    function selected(e) {
      for (var x = 0; x < exclude.length; x++) if (e.n.indexOf(exclude[x].replace(/\*/g, '')) !== -1) return false;
      if (!want.length) return true;
      for (var w = 0; w < want.length; w++) if (e.n.indexOf(want[w].replace(/\*/g, '')) !== -1) return true;
      return false;
    }
    var picked = entries.filter(selected);
    if (listOnly) {
      var total = 0;
      picked.forEach(function (e) { total += e.s || 0; });
      var out = ['Archive:  ' + zSpec,
        '  Length      Date    Time    Name',
        '---------  ---------- -----   ----'];
      picked.forEach(function (e) {
        out.push(String(e.s || 0).padStart(9, ' ') + '  2024-03-18 09:00   ' + e.n);
      });
      out.push('---------                     -------');
      out.push(String(total).padStart(9, ' ') + '                     ' + picked.length + ' files');
      return ok(out);
    }
    if (stdout) {
      var body = [];
      picked.forEach(function (e) { body = body.concat(String(e.c || '').replace(/\n$/, '').split('\n')); });
      return ok(body);
    }
    var dAbs = dest === null ? ctx.cwd : U.resolvePath(ctx.cwd, dest);
    var dNode = U.findNode(ctx.root, dAbs);
    if (!dNode) {
      /* 真 unzip 在 -d 指向不存在目录时会创建它 */
      var dParent = U.findNode(ctx.root, U.parentOf(dAbs));
      if (!dParent) return { out: [], err: ['unzip: cannot create directory ' + dest], code: 9 };
      var dName = String(dAbs).slice(String(dAbs).lastIndexOf('/') + 1);
      dNode = { type: 'dir', children: {}, user: 'root', group: 'root', mode: '755', mtime: '2024-03-18 09:00' };
      dParent.children[dName] = dNode;
    }
    if (dNode.type !== 'dir') return { out: [], err: ['unzip: ' + dest + ' is not a directory'], code: 9 };
    var out2 = ['Archive:  ' + zSpec];
    var skipped = 0;
    picked.forEach(function (e) {
      var parts = String(e.n).split('/').filter(Boolean);
      var cur = dNode;
      for (var p = 0; p < parts.length - 1; p++) {
        if (!cur.children[parts[p]]) cur.children[parts[p]] = { type: 'dir', children: {}, user: 'root', group: 'root', mode: '755', mtime: '2024-03-18 09:00' };
        cur = cur.children[parts[p]];
      }
      var fn = parts[parts.length - 1];
      if (cur.children[fn] && never) { out2.push('  skipping: ' + e.n + '  (already exists)'); skipped++; return; }
      cur.children[fn] = { type: 'file', content: String(e.c || ''), mode: '644',
        user: 'root', group: 'root', mtime: '2024-03-18 09:00',
        explicitSize: e.s !== undefined ? e.s : String(e.c || '').length };
      out2.push('  inflating: ' + e.n);
    });
    if (skipped) out2.push('（教学环境）' + skipped + ' 个已存在的文件被跳过；真机不加 -o/-n 时会**交互询问**，脚本里必须显式指定。');
    return ok(out2);
  }

  /* ==================== 注册 ==================== */
  window.CC_SHELL.extend({
    'readlink': function (argv, ctx, stdin, HOST) { return readlinkCmd(argv, ctx); },
    'realpath': function (argv, ctx, stdin, HOST) { return realpathCmd(argv, ctx); },
    'sha256sum': function (argv, ctx, stdin, HOST) { return sha256Cmd(argv, ctx, stdin); },
    'cmp': function (argv, ctx, stdin, HOST) { return cmpCmd(argv, ctx); },
    'gzip': function (argv, ctx, stdin, HOST) { return compressFamily('gzip', false, argv, ctx); },
    'gunzip': function (argv, ctx, stdin, HOST) { return compressFamily('gzip', true, argv, ctx); },
    'xz': function (argv, ctx, stdin, HOST) { return compressFamily('xz', false, argv, ctx); },
    'unxz': function (argv, ctx, stdin, HOST) { return compressFamily('xz', true, argv, ctx); },
    'zstd': function (argv, ctx, stdin, HOST) { return compressFamily('zstd', false, argv, ctx); },
    'unzstd': function (argv, ctx, stdin, HOST) { return compressFamily('zstd', true, argv, ctx); },
    'split': function (argv, ctx, stdin, HOST) { return splitCmd(argv, ctx); },
    'tac': function (argv, ctx, stdin, HOST) { return tacCmd(argv, ctx, stdin); },
    'alias': function (argv, ctx, stdin, HOST) { return aliasCmd(argv, ctx); },
    'install': function (argv, ctx, stdin, HOST) { return installCmd(argv, ctx); },
    'rename': function (argv, ctx, stdin, HOST) { return renameCmd(argv, ctx); },
    'zip': function (argv, ctx, stdin, HOST) { return zipCmd(argv, ctx); },
    'unzip': function (argv, ctx, stdin, HOST) { return unzipCmd(argv, ctx); }
  });
})();
