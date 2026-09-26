/* assets/js/cmd-basic2.js · 常用文件/文本/权限命令（第二批）
   --------------------------------------------------------------------------
   本文件只负责**注册命令实现**：shell.js 先加载，这里再调用
     window.CC_SHELL.extend({ '命令名': function (argv, ctx, stdin, HOST) { ... } })

   ── 这一批是怎么挑出来的 ────────────────────────────────────────────────
   它们是 `tools/_probe-plan.js` 算出来的「A 档」：**示例不依赖任何缺失的夹具路径**，
   所以实现完就能让示例从"跳过"直接变成"真跑"。
   （B 档那些命令的示例引用了 termfs 里不存在的文件，必须先补夹具，
   否则实现命令只会把"跳过"变成"失败"。）

   覆盖的内容条目：
     linux-basic  tree / nl / whereis / type / chgrp / chown / getent
     linux-text   egrep / fgrep / column
   物理事实与 data/termfs.js 对齐，不另造一套。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;

  var U = window.CC_SHELL.util;
  var ok = U.ok, fail = U.fail;

  /* ==================== tree：树状展示目录 ==================== */
  function treeWalk(node, prefix, out, depth, maxDepth, onlyDir, excludes) {
    if (maxDepth !== null && depth >= maxDepth) return;
    var names = U.childrenSorted(node).filter(function (n) {
      if (n.charAt(0) === '.' && !treeWalk.showHidden) return false;
      if (onlyDir && node.children[n].type !== 'dir') return false;
      for (var e = 0; e < excludes.length; e++) {
        try { if (new RegExp(excludes[e]).test(n)) return false; } catch (err) { /* 非法正则忽略 */ }
      }
      return true;
    });
    for (var i = 0; i < names.length; i++) {
      var isLast = i === names.length - 1;
      var child = node.children[names[i]];
      out.push(prefix + (isLast ? '└── ' : '├── ') + names[i]);
      if (child.type === 'dir') {
        treeWalk(child, prefix + (isLast ? '    ' : '│   '), out, depth + 1, maxDepth, onlyDir, excludes);
      }
    }
  }

  function treeCmd(argv, ctx) {
    var maxDepth = null, onlyDir = false, excludes = [];
    treeWalk.showHidden = false;
    var targets = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-L' || a === '--level') { maxDepth = Number(argv[++i]); continue; }
      if (/^-L\d+$/.test(a)) { maxDepth = Number(a.slice(2)); continue; }
      if (a === '-d') { onlyDir = true; continue; }
      if (a === '-a') { treeWalk.showHidden = true; continue; }
      if (a === '-I' || a === '--ignore') { excludes.push(String(argv[++i])); continue; }
      if (a === '-f' || a === '-i' || a === '-p' || a === '-u' || a === '-g' || a === '-s' || a === '-h') continue;
      if (a.charAt(0) === '-') return fail(['tree: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
        'Try \'tree --help\' for more information.']);
      targets.push(a);
    }
    if (!targets.length) targets = ['.'];
    var out = [];
    for (var t = 0; t < targets.length; t++) {
      var abs = U.resolvePath(ctx.cwd, targets[t]);
      var node = U.findNode(ctx.root, abs);
      if (!node) return fail(['tree: ' + targets[t] + ': No such file or directory']);
      if (node.type !== 'dir') { out.push(targets[t]); continue; }
      var before = out.length;
      out.push(targets[t]);
      treeWalk(node, '', out, 0, maxDepth, onlyDir, excludes);
      out.push('');
      out.push((out.length - before - 2) + ' directories, 0 files');
    }
    return ok(out);
  }

  /* ==================== nl：带行号输出 ==================== */
  function nlCmd(argv, ctx, stdin) {
    var body = 't';            /* 默认 -b t：只给非空行编号 */
    var width = 6, sep = '\t', start = 1, numFmt = 'rn';
    var files = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-b') { body = String(argv[++i]); continue; }
      if (/^-b./.test(a)) { body = a.slice(2); continue; }
      if (a === '-w') { width = Number(argv[++i]); continue; }
      if (/^-w\d+$/.test(a)) { width = Number(a.slice(2)); continue; }
      if (a === '-s') { sep = String(argv[++i]); continue; }
      if (/^-s./.test(a)) { sep = a.slice(2); continue; }
      if (a === '-v') { start = Number(argv[++i]); continue; }
      if (/^-v-?\d+$/.test(a)) { start = Number(a.slice(2)); continue; }
      if (a === '-n') { numFmt = String(argv[++i]); continue; }
      if (a.charAt(0) === '-') continue;
      files.push(a);
    }
    var lines = stdin || [];
    if (files.length) {
      var r = U.readFileOrErr(ctx, files[0]);
      if (r.err) return fail(['nl: ' + files[0] + ': No such file or directory']);
      lines = U.splitLines(r.content);
    }
    var out = [], n = start;
    for (var k = 0; k < lines.length; k++) {
      var text = String(lines[k]);
      var blank = text === '';
      var numbered = (body === 'a') || (body === 't' && !blank);
      if (!numbered) { out.push(text); continue; }
      var label = numFmt === 'ln' ? String(n).padStart(width, '0') : String(n).padStart(width, ' ');
      out.push(label + sep + text);
      n++;
    }
    /* 真 nl 对空输入没有任何输出（不报错） */
    return ok(out);
  }

  /* ==================== whereis：在固定系统目录里找二进制与手册 ==================== */
  var WHEREIS_DIRS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin', '/usr/local/bin', '/usr/local/sbin'];
  function whereisCmd(argv, ctx) {
    var onlyBin = false, onlyMan = false, names = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-b') { onlyBin = true; continue; }
      if (a === '-m') { onlyMan = true; continue; }
      if (a === '-s' || a === '-B' || a === '-M' || a === '-f') continue;
      if (a.charAt(0) === '-') continue;
      names.push(a);
    }
    if (!names.length) return fail(['whereis: too few arguments', 'Try \'whereis --help\' for more information.']);
    var impl = window.CC_SHELL.commands || [];
    var out = [];
    names.forEach(function (n) {
      var found = [];
      /* 二进制：虚拟 FS 里真实存在 /usr/bin 下的同名文件，或引擎实现了这个命令 */
      var hitBin = WHEREIS_DIRS.some(function (d) { return U.findNode(ctx.root, d + '/' + n) !== null; });
      if (!hitBin && impl.indexOf(n) !== -1) hitBin = true;
      if (hitBin) found.push('/usr/bin/' + n);
      var man = U.findNode(ctx.root, '/usr/share/man/man1/' + n + '.1');
      if (man) found.push('/usr/share/man/man1/' + n + '.1');
      if (onlyBin) found = found.filter(function (x) { return x.indexOf('/man/') === -1; });
      if (onlyMan) found = found.filter(function (x) { return x.indexOf('/man/') !== -1; });
      out.push(found.length ? n + ': ' + found.join(' ') : n + ':');
    });
    return ok(out);
  }

  /* ==================== type：判断名字的类型 ==================== */
  var BUILTINS = ['cd', 'echo', 'export', 'read', 'set', 'unset', 'alias', 'type', 'test', 'printf',
    'pwd', 'exit', 'break', 'continue', 'shift', 'source', 'eval', 'true', 'false', 'umask'];
  function typeCmd(argv, ctx) {
    var all = false, typeOnly = false, pathOnly = false, names = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-a') { all = true; continue; }
      if (a === '-t') { typeOnly = true; continue; }
      if (a === '-p' || a === '-P') { pathOnly = true; continue; }
      if (a.charAt(0) === '-') continue;
      names.push(a);
    }
    if (!names.length) return fail(['type: usage: type [-afptP] name [name ...]']);
    var impl = window.CC_SHELL.commands || [];
    var out = [], code = 0;
    names.forEach(function (n) {
      /* 站内预置别名（ll / la 之类）与引擎里的别名表都算别名 */
      var alias = (window.CC_SHELL.alias && window.CC_SHELL.alias[n]) || null;
      if (n === 'll') alias = 'ls -alh';
      if (n === 'la') alias = 'ls -A';
      var kind = null, desc = '';
      if (alias) { kind = 'alias'; desc = n + ' is aliased to `' + alias + '`'; }
      else if (BUILTINS.indexOf(n) !== -1) { kind = 'builtin'; desc = n + ' is a shell builtin'; }
      else if (U.findNode(ctx.root, '/usr/bin/' + n) !== null || impl.indexOf(n) !== -1) {
        kind = 'file'; desc = n + ' is /usr/bin/' + n;
      }
      if (!kind) {
        code = 1;
        if (typeOnly) out.push(''); else out.push('bash: type: ' + n + ': not found');
        return;
      }
      if (typeOnly) { out.push(kind); return; }
      if (pathOnly) { out.push(kind === 'file' ? '/usr/bin/' + n : ''); return; }
      out.push(desc);
      if (all && kind === 'builtin' && impl.indexOf(n) !== -1) out.push(n + ' is /usr/bin/' + n);
    });
    while (out.length && out[out.length - 1] === '') out.pop();
    return { out: out, err: [], code: code };
  }

  /* ==================== egrep / fgrep：grep 的两种经典写法 ==================== */
  /* 真机上它们是脚本（等价 grep -E / grep -F），这里直接把选项补上再转交 grep。
     注意不能只做字符串替换 —— `egrep 'a|b' f` 里 `|` 是**模式**，不是管道。 */
  function grepAlias(flag, argv, ctx, stdin, HOST) {
    var cmds = window.CC_SHELL && window.CC_SHELL.cmds;
    var grep = (cmds && cmds.grep) || (window.CC_SHELL.grep);
    if (!grep) return fail([flag + ': 教学环境内部错误（grep 未就绪）']);
    return grep([flag].concat(argv), ctx, stdin, HOST);
  }

  /* ==================== column：把输入排成表格 ==================== */
  function columnCmd(argv, ctx, stdin) {
    var table = false, delim = null, names = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-t' || a === '--table') { table = true; continue; }
      if (a === '-s' || a === '--separator') { delim = String(argv[++i]); continue; }
      if (/^-s./.test(a)) { delim = a.slice(2); continue; }
      if (a === '-c' || a === '-x' || a === '-o') { i++; continue; }
      if (a.charAt(0) === '-') continue;
      names.push(a);
    }
    var lines = stdin || [];
    if (names.length) {
      var r = U.readFileOrErr(ctx, names[0]);
      if (r.err) return fail(['column: ' + names[0] + ': No such file or directory']);
      lines = U.splitLines(r.content);
    }
    if (!table) return ok(lines);
    var rows = lines.map(function (l) {
      var s = String(l);
      if (delim !== null) return s.split(delim);
      return s.trim().split(/\s+/);
    }).filter(function (r) { return r.length && r[0] !== ''; });
    if (!rows.length) return ok([]);
    var width = [];
    rows.forEach(function (r) {
      for (var c = 0; c < r.length; c++) width[c] = Math.max(width[c] || 0, String(r[c]).length);
    });
    var out = rows.map(function (r) {
      var cells = r.map(function (v, c) {
        return c === r.length - 1 ? String(v) : String(v).padEnd(width[c], ' ');
      });
      return cells.join('  ').replace(/\s+$/, '');
    });
    return ok(out);
  }

  /* ==================== chown / chgrp：改属主属组 ==================== */
  /* ⚠️ 这两个是 linux-user 分类做练习课的**前置条件** ——
     `chmod` 早就实现了，而没有 `chown` 就没法演示"拷回来的数据目录属主不对、MySQL 起不来"
     这条最经典的恢复流程（站内 db-cache 的 xtrabackup --copy-back 示例正是这么写的）。 */
  function chownLike(kind, argv, ctx) {
    var recursive = false, verbose = false, targets = [], fromSpec = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-R' || a === '--recursive') { recursive = true; continue; }
      if (a === '-v' || a === '--verbose') { verbose = true; continue; }
      if (a === '-h' || a === '--no-dereference' || a === '-f' || a === '--silent' || a === '--quiet') continue;
      /* `--from=旧属主:旧属组`：只改"当前属主匹配"的文件。
         站内 lu-chown 的示例就在用它（`chown -R --from=root:root deploy:deploy /data/app`），
         早先不认这个选项，整条命令报 invalid option。 */
      if (/^--from=/.test(a)) { fromSpec = a.slice(7); continue; }
      if (a === '--from') { fromSpec = String(argv[++i]); continue; }
      if (/^--reference=/.test(a)) continue;
      if (a === '--reference') { i++; continue; }
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail([kind + ': invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'' + kind + ' --help\' for more information.']);
      }
      targets.push(a);
    }
    if (targets.length < 2) return fail([kind + ': missing operand',
      'Try \'' + kind + ' --help\' for more information.']);
    var spec = targets.shift();
    if (kind === 'chown') {
      /* 属主[:属组] —— 只校验格式，不校验真实用户库（教学环境没有 /etc/passwd 之外的账号） */
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*(:[A-Za-z_][A-Za-z0-9_.-]*)?$/.test(spec) && !/^[0-9]+(:[0-9]+)?$/.test(spec)) {
        return fail(['chown: invalid user: \'' + spec + '\'']);
      }
    } else if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(spec) && !/^[0-9]+$/.test(spec)) {
      return fail(['chgrp: invalid group: \'' + spec + '\'']);
    }
    var out = [], err = [], changed = 0, skipped = 0;
    /* `--from=属主:属组`：只改当前匹配的那些（真 chown 的语义） */
    function fromMatches(node) {
      if (fromSpec === null) return true;
      var fp = String(fromSpec).split(':');
      if (fp[0] && String(node.user || '') !== fp[0]) return false;
      if (fp.length > 1 && fp[1] && String(node.group || '') !== fp[1]) return false;
      return true;
    }
    function apply(node, display) {
      if (!fromMatches(node)) { skipped++; return; }
      if (kind === 'chown') {
        var parts = spec.split(':');
        node.user = parts[0];
        if (parts.length > 1) node.group = parts[1];
      } else node.group = spec;
      changed++;
      if (verbose) out.push(kind === 'chown'
        ? 'changed ownership of \'' + display + '\' to ' + spec
        : 'changed group of \'' + display + '\' to ' + spec);
    }
    targets.forEach(function (t) {
      var abs = U.resolvePath(ctx.cwd, t);
      var node = U.findNode(ctx.root, abs);
      if (!node) { err.push(kind + ': cannot access \'' + t + '\': No such file or directory'); return; }
      apply(node, t);
      if (recursive && node.type === 'dir') {
        U.walkFiles(node, abs, function (child, cabs) { apply(child, cabs); });
      }
    });
    if (verbose) out.push('（教学环境）共 ' + changed + ' 个对象；属主属组已落在虚拟文件系统上，`ls -l` 能看到');
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  }

  /* ==================== getent：查系统数据库 ==================== */
  function getentCmd(argv, ctx) {
    var args = argv.filter(function (a) { return String(a).charAt(0) !== '-'; });
    var db = String(args[0] || '');
    var key = args[1];
    if (!db) return fail(['getent: usage: getent database [key ...]']);
    var USERS = [
      ['root', 'x', '0', '0', 'root', '/root', '/bin/bash'],
      ['nginx', 'x', '988', '984', 'Nginx web server', '/var/lib/nginx', '/sbin/nologin'],
      ['mysql', 'x', '27', '27', 'MySQL Server', '/var/lib/mysql', '/bin/false'],
      ['tomcat', 'x', '53', '53', 'Apache Tomcat', '/opt/tomcat', '/sbin/nologin'],
      ['deploy', 'x', '1000', '1000', 'deploy', '/home/deploy', '/bin/bash']
    ];
    var GROUPS = [['root', 'x', '0'], ['nginx', 'x', '984'], ['mysql', 'x', '27'],
      ['tomcat', 'x', '53'], ['docker', 'x', '991'], ['wheel', 'x', '10']];
    var out = [];
    if (db === 'passwd') {
      USERS.forEach(function (u) {
        if (key && u[0] !== key) return;
        /* 整条或按 uid 查都支持 */
        if (key && /^[0-9]+$/.test(key) && u[2] !== key) return;
        out.push(u.join(':'));
      });
    } else if (db === 'group') {
      GROUPS.forEach(function (g) {
        if (key && g[0] !== key) return;
        out.push(g.join(':') + ':');
      });
    } else if (db === 'hosts') {
      var HOSTS = [['10.0.1.23', 'web-prod-01'], ['10.0.1.21', 'db-prod-01'],
        ['10.0.1.22', 'cache-prod-01'], ['127.0.0.1', 'localhost localhost.localdomain']];
      HOSTS.forEach(function (h) {
        if (key && h[0] !== key && h[1].split(' ')[0] !== key) return;
        out.push(h[0] + '  ' + h[1]);
      });
    } else if (db === 'services') {
      var SVC = [['ssh', '22/tcp'], ['http', '80/tcp'], ['https', '443/tcp'],
        ['mysql', '3306/tcp'], ['redis', '6379/tcp'], ['postgresql', '5432/tcp']];
      SVC.forEach(function (s) {
        if (key && s[0] !== key && s[1] !== key) return;
        out.push(s[0] + '  ' + s[1]);
      });
    } else {
      return fail(['getent: 教学环境只支持 passwd / group / hosts / services 四个库（真机还有 aliases / netgroup / protocols 等）'], 2);
    }
    if (!out.length) return { out: [], err: [], code: 2 };   /* 真 getent 查不到返回 2 */
    return ok(out);
  }

  /* ==================== 注册 ==================== */
  window.CC_SHELL.extend({
    'tree': function (argv, ctx, stdin, HOST) { return treeCmd(argv, ctx, stdin, HOST); },
    'nl': function (argv, ctx, stdin, HOST) { return nlCmd(argv, ctx, stdin, HOST); },
    'whereis': function (argv, ctx, stdin, HOST) { return whereisCmd(argv, ctx, stdin, HOST); },
    'type': function (argv, ctx, stdin, HOST) { return typeCmd(argv, ctx, stdin, HOST); },
    'egrep': function (argv, ctx, stdin, HOST) { return grepAlias('-E', argv, ctx, stdin, HOST); },
    'fgrep': function (argv, ctx, stdin, HOST) { return grepAlias('-F', argv, ctx, stdin, HOST); },
    'column': function (argv, ctx, stdin, HOST) { return columnCmd(argv, ctx, stdin, HOST); },
    'chown': function (argv, ctx, stdin, HOST) { return chownLike('chown', argv, ctx, stdin, HOST); },
    'chgrp': function (argv, ctx, stdin, HOST) { return chownLike('chgrp', argv, ctx, stdin, HOST); },
    'getent': function (argv, ctx, stdin, HOST) { return getentCmd(argv, ctx, stdin, HOST); }
  });
})();
