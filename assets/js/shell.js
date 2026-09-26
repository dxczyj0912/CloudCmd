/* ==========================================================================
   assets/js/shell.js · 浏览器内模拟 shell
   --------------------------------------------------------------------------
   这不是真 shell，是一台"照着真机行为写的仿真机"：虚拟文件系统 + 命令实现，
   输出格式对齐真实 Linux / Docker / Kubernetes，用于教学与练习。
   支持：引号、管道 |、输出重定向 > >>、命令内取 2>&1、环境变量 $VAR。
   不支持（会明确报错）：真正执行、需要真实权限/网络的命令。
   ========================================================================== */
(function () {
  'use strict';

  var BASE_HOST = (window.CC_TERM_FS && window.CC_TERM_FS.host) || { hostname: 'web-prod-01', user: 'root', home: '/root' };
  var NOW = Date.parse('2024-03-18T09:51:00+08:00');   /* 仿真环境的"当前时间" */

  /* 允许调用方覆盖"这台机器"的身份（实验台复刻页需要声明自己的网卡/网关/DNS）。
     不传就用主站默认环境。 */
  function cloneHost(base, o) {
    var h = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) h[k] = base[k];
    if (o) for (var j in o) if (Object.prototype.hasOwnProperty.call(o, j)) h[j] = o[j];
    return h;
  }

  /* 由 MAC 推导 IPv6 link-local（真实 SLAAC 的 EUI-64 规则），避免写死地址 */
  function linkLocalV6(mac) {
    var parts = String(mac || '').split(':').map(function (x) { return parseInt(x, 16); });
    if (parts.length !== 6 || parts.some(function (n) { return isNaN(n); })) return 'fe80::20c:29ff:fe8f:3a21';
    var b = parts.slice();
    b[0] = b[0] ^ 0x02;
    var hex = function (n) { return ('0' + n.toString(16)).slice(-2); };
    return 'fe80::' + hex(b[0]) + hex(b[1]) + ':' + hex(b[2]) + 'ff:fe' + hex(b[3]) + ':' + hex(b[4]) + hex(b[5]);
  }

  /* ======================= 虚拟文件系统 ======================= */

  function newNode(type, name) {
    return { type: type, name: name, children: type === 'dir' ? {} : null, content: '', mode: type === 'dir' ? '755' : '644', user: 'root', group: 'root', mtime: '2024-03-18 09:00', target: null };
  }

  function buildTree(spec, prefix, parent) {
    for (var key in spec) {
      if (!Object.prototype.hasOwnProperty.call(spec, key)) continue;
      var val = spec[key];
      var path = (prefix === '/' ? '' : prefix) + '/' + key;
      var node;
      if (val && typeof val === 'object' && val.$f !== undefined) {
        node = newNode('file', key);
        node.content = val.$f;
      } else if (val && typeof val === 'object' && val.$gz !== undefined) {
        /* `$gz` = gzip 压缩过的文本（如轮转后的 access.log-20240317.gz）。
           内容仍然是可读文本，但要通过 zcat/zgrep 解压后才能看 —— 
           直接 `cat` 一个 gz 文件在真机上只会得到乱码，这里也必须如实拒绝。 */
        node = newNode('file', key);
        node.content = val.$gz;
        node.gz = true;
      } else if (val && typeof val === 'object' && val.$l !== undefined) {
        node = newNode('link', key);
        node.target = val.$l;
      } else {
        node = newNode('dir', key);
        buildTree(val || {}, path, node);
      }
      var meta = (window.CC_TERM_FS.fileMeta || {})[path];
      if (meta) {
        node.mode = meta.mode;
        node.user = meta.user;
        node.group = meta.group;
        node.mtime = meta.mtime;
        if (meta.size !== undefined) node.explicitSize = meta.size;
      }
      parent.children[key] = node;
    }
  }

  function createFS() {
    var root = newNode('dir', '/');
    root.mtime = '2024-03-05 08:00';
    buildTree(window.CC_TERM_FS.spec, '/', root);
    /* 扩展模块（assets/js/sim-data.js、cmd-*.js）带来的文件在这里合并进来。
       这样"某个命令组需要的模拟数据"就和命令实现放在同一个文件里，
       不用一堆人挤着改 termfs.js。 */
    FS_EXTRA.forEach(function (entry) {
      var abs = entry.path;
      if (findNode(root, abs)) return;
      var parts = abs.split('/').filter(Boolean);
      var dir = root;
      var dirPath = '/';
      var hops = 0;
      for (var i = 0; i < parts.length - 1; i++) {
        var seg = parts[i];
        if (!dir.children[seg]) {
          var d = newNode('dir', seg);
          d.user = 'root'; d.group = 'root';
          dir.children[seg] = d;
        }
        var next = dir.children[seg];
        /* ⚠️ 父级可能是**软链**：termfs 里 `/opt/myapp` 就是指向 `/data/app` 的软链。
           早先这里直接 `dir = dir.children[seg]`，拿到软链节点之后
           `dir.children` 是 null，下一轮就抛
           `Cannot set properties of null` —— 而这段代码在 **createFS** 里，
           也就是说**一个扩展模块写错路径，整个终端都起不来**（页面看着正常、敲什么都没反应）。
           现在：跟着软链走；万一跟丢了或父级不是目录，**跳过这一条**而不是抛异常。 */
        var followedLink = false;
        while (next && next.type === 'link' && hops++ < 8) {
          followedLink = true;
          var t = String(next.target || '');
          var targetAbs = t.charAt(0) === '/' ? t : resolvePath(dirPath, t);
          next = findNode(root, targetAbs);
          dirPath = targetAbs;
        }
        if (!next || next.type !== 'dir' || !next.children) return;   /* 静默跳过这一条 */
        dir = next;
        if (!followedLink) {
          if (dirPath === '/') dirPath += seg;
          else if (dirPath.charAt(dirPath.length - 1) !== '/') dirPath += '/' + seg;
        }
      }
      var name = parts[parts.length - 1];
      var node = newNode(entry.gz ? 'file' : (entry.type || 'file'), name);
      node.content = entry.content !== undefined ? entry.content : '';
      if (entry.gz) node.gz = true;
      if (entry.target) node.target = entry.target;
      if (entry.mode) node.mode = entry.mode;
      if (entry.user) node.user = entry.user;
      if (entry.group) node.group = entry.group;
      if (entry.mtime) node.mtime = entry.mtime;
      if (entry.size !== undefined) node.explicitSize = entry.size;
      dir.children[name] = node;
    });
    /* 常用目录固定元数据 */
    var dirMeta = {
      '/': { user: 'root', group: 'root', mode: '755' },
      '/root': { user: 'root', group: 'root', mode: '550' },
      '/home/deploy': { user: 'deploy', group: 'deploy', mode: '700' },
      '/data': { user: 'root', group: 'root', mode: '755' },
      '/var/log/nginx': { user: 'nginx', group: 'nginx', mode: '755' },
      '/tmp': { user: 'root', group: 'root', mode: '1777' },
      '/opt/scripts': { user: 'root', group: 'root', mode: '755' }
    };
    for (var p in dirMeta) {
      var n = findNode(root, p);
      if (n) { n.user = dirMeta[p].user; n.group = dirMeta[p].group; n.mode = dirMeta[p].mode; }
    }
    /* `/dev/null` 这类设备节点必须在，而且必须在**引擎里**建，不能靠 termfs 写 ——
       因为 `2>/dev/null` 是运维里最常用的写法之一，少了它 `du -sh /data 2>/dev/null`
       会直接报 `bash: /dev/null: No such file or directory`，一大片真实命令跑不通。
       设备文件不算"环境数据"，它是操作系统的固有部分，所以放在引擎侧。 */
    var dev = newNode('dir', 'dev');
    dev.user = 'root'; dev.group = 'root'; dev.mode = '755'; dev.mtime = root.mtime;
    var devNodes = [
      ['null', 'crw-rw-rw-'], ['zero', 'crw-rw-rw-'],
      ['random', 'crw-rw-rw-'], ['urandom', 'crw-rw-rw-'], ['tty', 'crw-rw-rw-']
    ];
    for (var d = 0; d < devNodes.length; d++) {
      var dn = newNode('file', devNodes[d][0]);
      dn.user = 'root'; dn.group = 'root'; dn.mode = '666';
      dn.isDevice = devNodes[d][1];
      dn.content = '';
      dn.mtime = root.mtime;
      dev.children[devNodes[d][0]] = dn;
    }
    /* 已经有 /dev 就合并（termfs 里若写了 /dev/null，以它为准） */
    if (root.children.dev && root.children.dev.type === 'dir') {
      for (var k in dev.children) {
        if (!root.children.dev.children[k]) root.children.dev.children[k] = dev.children[k];
      }
    } else {
      root.children.dev = dev;
    }
    return root;
  }

  /* 把绝对路径拆成段 */
  function segments(path) {
    return String(path).split('/').filter(function (s) { return s !== ''; });
  }

  function findNode(root, absPath) {
    var pending = segments(absPath);
    var cur = root;
    var resolved = [];
    var hops = 0;
    var pos = 0;
    /* 逐段解析；相对软链目标以软链所在目录为基准，且所有跳转共享上限。 */
    while (pos < pending.length) {
      if (!cur || cur.type !== 'dir') return null;
      var seg = pending[pos];
      cur = cur.children[seg];
      resolved.push(seg);
      pos++;
      /* 最后一段保留软链节点本身，供 ls -l 和 readlink 使用。 */
      if (pos < pending.length && cur && cur.type === 'link') {
        if (++hops > 8) return null;
        var target = String(cur.target || '');
        var linkParent = '/' + resolved.slice(0, -1).join('/');
        var targetAbs = target.charAt(0) === '/' ? target : resolvePath(linkParent || '/', target);
        pending = segments(targetAbs).concat(pending.slice(pos));
        cur = root;
        resolved = [];
        pos = 0;
      }
    }
    return cur || null;
  }

  /* 相对路径 → 绝对路径（处理 . / .. / ~ / 多斜杠）
     注意 `~` 展开：这里没有 ctx，拿不到本实例的 host，
     所以回落到基准机器的家目录。早先这里直接写了 `HOST.home` ——
     而模块作用域里根本没有 `HOST` 这个变量（只有 BASE_HOST），
     于是**任何带 `~` 的路径都会抛 ReferenceError**：
     `chmod 600 ~/.ssh/id_rsa`、`echo ... >> ~/.bashrc`、`cd ~/xxx` 全部当场崩，
     而且崩的是引擎本身（不是命令返回错误），学员看到的是空白。
     命令实现里那些 `HOST.home` 之所以没出问题，是因为形参 `HOST` 把名字遮住了。 */
  function resolvePath(cwd, input) {
    var p = String(input === undefined || input === '' ? '.' : input);
    if (p === '~') p = BASE_HOST.home;
    else if (p.indexOf('~/') === 0) p = BASE_HOST.home + p.slice(1);
    var base = p.charAt(0) === '/' ? [] : segments(cwd);
    var parts = p.charAt(0) === '/' ? segments(p) : segments(p);
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (seg === '.') continue;
      if (seg === '..') { base.pop(); continue; }
      base.push(seg);
    }
    return '/' + base.join('/');
  }

  function parentOf(absPath) {
    var segs = segments(absPath);
    segs.pop();
    return '/' + segs.join('/');
  }

  function baseName(absPath) {
    var segs = segments(absPath);
    return segs.length ? segs[segs.length - 1] : '/';
  }

  function sizeOf(node) {
    if (node.explicitSize !== undefined) return node.explicitSize;
    if (node.type === 'dir') return 4096;
    if (node.type === 'link') return String(node.target).length;
    return String(node.content || '').length;
  }

  /* 目录本身占用 */
  function dirSelfSize(node) {
    if (node.explicitSize !== undefined) return node.explicitSize;
    return 4096;
  }

  function duSize(node) {
    if (node.type !== 'dir') return sizeOf(node);
    var total = dirSelfSize(node);
    for (var k in node.children) total += duSize(node.children[k]);
    return total;
  }

  function countLinks(node) {
    if (node.type !== 'dir') return 1;
    var n = 2;
    for (var k in node.children) if (node.children[k].type === 'dir') n++;
    return n;
  }

  function childrenSorted(node) {
    var names = Object.keys(node.children).sort(function (a, b) {
      /* 近似 LC_COLLATE=C 的排序，同时把 . 开头的排在前面（与 ls 默认隐藏一致） */
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return names;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + 'M';
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + 'G';
  }

  function humanSize(bytes) {
    var units = ['', 'K', 'M', 'G', 'T'];
    var v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? String(v) : v.toFixed(1)) + units[i];
  }

  /* ======================= 输出构造 ======================= */

  function ok(lines) { return { out: lines || [], err: [], code: 0 }; }
  function fail(lines) { return { out: [], err: lines || [], code: 1 }; }
  function noSuch(cmd, arg, isCmd) {
    if (isCmd) return fail([cmd + ': command not found']);
    return fail(['ls: cannot access \'' + arg + '\': No such file or directory']);
  }

  /* ============ 控制流要用的分析工具（算术 / {1..5} / 替换标记） ============
     这一节只被"执行一行命令"那条链（exec / execSingle / 控制流引擎）调用，
     不碰任何 CMDS.xxx 的实现体。 */

  /* 命令替换的占位标记：\x01 引号内 / \x02 引号外，下标，\x03 结束。
     用标记而不是直接替换文本，是为了保住引号语义：
       echo "$(date)"      → 一个参数
       echo $(cat list)    → 按空白切成多个参数
     \x01-\x03 是控制字符，正常输入里不会出现。 */
  var SUB_MARK = '\u0001';
  var SUB_UNQ = '\u0002';
  var SUB_END = '\u0003';

  function subMarker(quoted, i) {
    return (quoted ? SUB_MARK : SUB_UNQ) + i + SUB_END;
  }

  /* 命令替换的递归深度上限：`$(echo $(echo ...))` 或自引用脚本会无限套下去 */
  var SUB_MAX_DEPTH = 6;
  /* 扫描时的括号嵌套上限（防止畸形输入把栈打爆） */
  var SUB_MAX_NEST = 40;

  /* 把一段文本里的 `$()` / 反引号抽出来换成标记。
     返回 { text, subs }，subs[i].cmd 是待执行的命令行，subs[i].quoted 记它是否在双引号内。
     返回 null 表示"括号不配对"，调用方应保持原样（旧行为）。 */
  function extractSubs(text) {
    var s = String(text === undefined || text === null ? '' : text);
    var out = '', subs = [], quote = null, i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      /* 单引号：进来之后**一切原样**，直到下一个单引号关闭。
         早先这里只写了"在单引号里就原样复制"这一半，**没有任何地方把 quote 设成 `'`** ——
         于是那个分支是死代码，单引号从来没有真正"打开"过：
           · `awk '{print $1}'` 里的 `$1`、`sed 's/$/x/'` 里的 `$` 会被当成要展开的东西
           · `echo '$(date)'` 会把命令替换真跑掉（与下面那行注释声明的语义正好相反）
         这是 shell 最基本的语义，站内内容到处依赖它，所以补上"开"与"关"两半。 */
      if (quote === "'") {
        if (ch === "'") quote = null;
        out += ch; i++; continue;
      }
      if (ch === "'") { quote = "'"; out += ch; i++; continue; }
      if (ch === '\\' && i + 1 < s.length) { out += ch + s.charAt(i + 1); i += 2; continue; }
      if (ch === '"' && quote !== '"') { quote = '"'; out += ch; i++; continue; }
      if (ch === '"' && quote === '"') { quote = null; out += ch; i++; continue; }
      if (ch === '`' && quote === '"') {
        var bt = i + 1, bbuf = '';
        while (bt < s.length && s.charAt(bt) !== '`') {
          /* 反引号里用 \` 转义 */
          if (s.charAt(bt) === '\\' && s.charAt(bt + 1) === '`') { bbuf += '`'; bt += 2; continue; }
          bbuf += s.charAt(bt); bt++;
        }
        if (bt >= s.length) { out += ch; i++; continue; }
        subs.push({ cmd: bbuf, quoted: quote === '"' });
        out += subMarker(quote === '"', subs.length - 1);
        i = bt + 1;
        continue;
      }
      /* ⚠️ 单引号里的一切都原样：`echo '$(date)'` 必须打印字面的 $(date)。
         早先这里不看 quote，单引号里的命令替换也被执行了。 */
      /* `$(( 算术 ))` 必须在命令替换之前摘出去。
         早先这里少了这一步：`$((2+3))` 被当成"命令替换，命令是 `(2+3)`"，
         于是它去执行一条不存在的命令、拿到空值，`echo $((2+3))` 输出空行、
         `i=$((i+1))` 把计数器清空。而 expandFieldText 里真正会算 $(( )) 的
         那段代码**永远轮不到执行**（文本早被换成了标记）。
         这里只把整块原样抄进 out，留给后面的 expandFieldText 去算。 */
      if (ch === '$' && s.charAt(i + 1) === '(' && s.charAt(i + 2) === '(' && quote !== "'") {
        var ad0 = 0, aj0 = i + 1, aok0 = false;
        while (aj0 < s.length) {
          var ac0 = s.charAt(aj0);
          if (ac0 === '(') ad0++;
          else if (ac0 === ')') { ad0--; if (ad0 === 0) { aok0 = true; break; } }
          aj0++;
        }
        if (aok0) { out += s.slice(i, aj0 + 1); i = aj0 + 1; continue; }
      }
      if (ch === '$' && s.charAt(i + 1) === '(' && quote !== "'") {
        var depth = 0, j = i + 1, q = null, buf = '', ok = false, nest = 0;
        while (j < s.length) {
          var c = s.charAt(j);
          if (q) {
            if (c === '\\' && q === '"') { buf += c + s.charAt(j + 1); j += 2; continue; }
            buf += c; if (c === q) q = null;
            j++; continue;
          }
          if (c === '"' || c === "'") { q = c; buf += c; j++; continue; }
          if (c === '\\') { buf += c + s.charAt(j + 1); j += 2; continue; }
          if (c === '(') {
            depth++;
            if (depth > SUB_MAX_NEST) return null;
            /* `$((` 是算术展开，两层的第一个括号不算 shell 括号 */
            if (depth > 1) buf += c;
            j++; continue;
          }
          if (c === ')') {
            depth--;
            if (depth === 0) { ok = true; break; }
            buf += c; j++; continue;
          }
          buf += c; j++;
          nest++;
          if (nest > 20000) return null;
        }
        if (!ok) return null;
        subs.push({ cmd: buf, quoted: quote === '"' });
        out += subMarker(quote === '"', subs.length - 1);
        i = j + 1;
        continue;
      }
      out += ch; i++;
    }
    return { text: out, subs: subs };
  }

  /* 参数展开 ${...} 用的小工具：找配对的 `}` */
  function matchBrace(s, from) {
    var depth = 0;
    for (var i = from; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '\\') { i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  /* glob 模式 → 匹配整个字符串的正则（`*` 也跨 `/`）。
     注意与 globToRegExp 的区别：后者是"路径 glob"，`*` 不跨 `/`，
     用在变量后缀截取、case 的单词模式上会错。
     （写注释时别把"星号加斜杠"连着写出来 —— 它会提前关闭块注释，
     这个坑本项目已经踩过三次：mipmap 目录名、/etc/hosts 的路径、以及这里。） */
  function globToRegExpFull(pat) {
    var re = '';
    for (var i = 0; i < pat.length; i++) {
      var c = pat.charAt(i);
      if (c === '*') re += '[\\s\\S]*';
      else if (c === '?') re += '[\\s\\S]';
      else if (c === '[') {
        var close = pat.indexOf(']', i + 1);
        if (close > i + 1) {
          var cls = pat.slice(i, close + 1);
          if (cls.charAt(1) === '!') cls = '[^' + cls.slice(2);
          re += cls;
          i = close;
        } else re += '\\[';
      } else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$');
  }

  function globMatchFull(pat, str) {
    try { return globToRegExpFull(pat).test(String(str)); } catch (e) { return false; }
  }

  /* `{1..5}` / `{a..e}` / `{1..10..2}` 展开成数组；不是范围就返回 null */
  function braceRange(tok) {
    var m = String(tok).match(/^([^.]*)\.\.([^.]*)(?:\.\.(-?\d+))?$/);
    if (!m) return null;
    var a = m[1], b = m[2], step = m[3] ? Number(m[3]) : 0;
    var out = [];
    if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) {
      var na = Number(a), nb = Number(b);
      var st = step ? Math.abs(step) : 1;
      if (na <= nb) { for (var i = na; i <= nb; i += st) out.push(String(i)); }
      else { for (var j = na; j >= nb; j -= st) out.push(String(j)); }
      if (out.length > 1000) out = out.slice(0, 1000);
      return out;
    }
    if (a.length === 1 && b.length === 1 && /[A-Za-z]/.test(a) && /[A-Za-z]/.test(b)) {
      var ca = a.charCodeAt(0), cb = b.charCodeAt(0);
      var s2 = step ? Math.abs(step) : 1;
      if (ca <= cb) { for (var k = ca; k <= cb; k += s2) out.push(String.fromCharCode(k)); }
      else { for (var k2 = ca; k2 >= cb; k2 -= s2) out.push(String.fromCharCode(k2)); }
      return out;
    }
    return null;
  }

  /* 一个词（含引号）里的 {1..5} 展开成多个词；没有 {} 就原样返回 */
  function braceExpandWord(w) {
    var s = String(w);
    var open = -1, q = null;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '\\') { i++; continue; }
      if (c === '{') { open = i; break; }
    }
    if (open < 0) return [s];
    var close = s.indexOf('}', open + 1);
    if (close < 0) return [s];
    var range = braceRange(s.slice(open + 1, close));
    if (!range) return [s];
    var out = [];
    var pre = s.slice(0, open), post = s.slice(close + 1);
    for (var k = 0; k < range.length; k++) {
      var mid = pre + range[k] + post;
      var rest = braceExpandWord(mid);
      for (var r = 0; r < rest.length; r++) out.push(rest[r]);
    }
    return out;
  }

  function braceExpandList(tokens) {
    var out = [];
    tokens.forEach(function (t) {
      var e = braceExpandWord(t);
      for (var i = 0; i < e.length; i++) out.push(e[i]);
    });
    return out;
  }

  /* ---------- 算术展开 $(( )) ----------
     支持 + - * / % ( ) 比较、&& || !、递归的 $VAR / ${VAR} / 裸变量名、
     前置 ++/-- 与后置 ++/--（后置的副作用会写回 vars）。 */
  function arithTokenize(src) {
    var s = String(src === undefined || src === null ? '' : src);
    var toks = [], i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
      if (/\d/.test(c)) {
        var num = '';
        while (i < s.length && /[0-9]/.test(s.charAt(i))) { num += s.charAt(i); i++; }
        toks.push({ t: 'num', v: num });
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var id = '';
        while (i < s.length && /[A-Za-z0-9_]/.test(s.charAt(i))) { id += s.charAt(i); i++; }
        toks.push({ t: 'id', v: id });
        continue;
      }
      var two = s.substr(i, 2);
      if (two === '++' || two === '--' || two === '&&' || two === '||' ||
        two === '==' || two === '!=' || two === '<=' || two === '>=') {
        toks.push({ t: 'op', v: two }); i += 2; continue;
      }
      if ('+-*/%()!<>'.indexOf(c) !== -1) { toks.push({ t: 'op', v: c }); i++; continue; }
      if (c === ',') { toks.push({ t: 'op', v: ',' }); i++; continue; }
      return null;
    }
    return toks;
  }

  function arithEval(src, vars, onSet) {
    var t = arithTokenize(src);
    if (!t) return null;
    var p = 0;
    function peek() { return p < t.length ? t[p] : null; }
    function eat(v) { if (p < t.length && t[p].v === v) { p++; return true; } return false; }
    function numOf(v) {
      if (v === undefined || v === null || v === '') return 0;
      var n = Number(v);
      return isNaN(n) ? null : n;
    }
    function primary() {
      var tk = peek();
      if (!tk) return null;
      if (tk.t === 'num') { p++; return Number(tk.v); }
      if (tk.t === 'op' && tk.v === '(') {
        p++;
        var v = expr();
        if (v === null || !eat(')')) return null;
        return v;
      }
      if (tk.t === 'op' && (tk.v === '+' || tk.v === '-')) {
        p++;
        var u = primary();
        if (u === null) return null;
        return tk.v === '-' ? -u : u;
      }
      if (tk.t === 'op' && tk.v === '!') {
        p++;
        var w = primary();
        return w === null ? null : (w ? 0 : 1);
      }
      if (tk.t === 'id') {
        p++;
        /* 变量名 */
        if (tk.v === 'true') return 1;
        if (tk.v === 'false') return 0;
        var raw = vars[tk.v];
        var n0 = numOf(raw);
        if (n0 === null) {
          /* 变量里可能是另一个算术串或命令替换结果，尽力而为 */
          var inner = arithEval(String(raw), vars, onSet);
          n0 = inner === null ? 0 : inner;
        }
        var n1 = n0;
        if (peek() && peek().t === 'op' && (peek().v === '++' || peek().v === '--')) {
          var op = peek().v; p++;
          n1 = op === '++' ? n0 + 1 : n0 - 1;
          if (onSet) onSet(tk.v, n1);
        }
        return n1;
      }
      return null;
    }
    function unaryMul() {
      var tk = peek();
      if (tk && tk.t === 'op' && (tk.v === '++' || tk.v === '--')) {
        p++;
        var nx = peek();
        if (!nx || nx.t !== 'id') return null;
        p++;
        var cur = numOf(vars[nx.v]);
        if (cur === null) cur = 0;
        var val = tk.v === '++' ? cur + 1 : cur - 1;
        if (onSet) onSet(nx.v, val);
        return val;
      }
      return primary();
    }
    function mul() {
      var l = unaryMul();
      if (l === null) return null;
      while (peek() && peek().t === 'op' && '*/%'.indexOf(peek().v) !== -1) {
        var op = peek().v; p++;
        var r = unaryMul();
        if (r === null) return null;
        if (op === '*') l = l * r;
        else if (op === '/') l = r === 0 ? 0 : Math.trunc(l / r);
        else l = r === 0 ? 0 : l % r;
      }
      return l;
    }
    function add() {
      var l = mul();
      if (l === null) return null;
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        var op = peek().v; p++;
        var r = mul();
        if (r === null) return null;
        l = op === '+' ? l + r : l - r;
      }
      return l;
    }
    function rel() {
      var l = add();
      if (l === null) return null;
      while (peek() && peek().t === 'op' && ['<', '>', '<=', '>='].indexOf(peek().v) !== -1) {
        var op = peek().v; p++;
        var r = add();
        if (r === null) return null;
        l = op === '<' ? (l < r ? 1 : 0) : op === '>' ? (l > r ? 1 : 0)
          : op === '<=' ? (l <= r ? 1 : 0) : (l >= r ? 1 : 0);
      }
      return l;
    }
    function eq() {
      var l = rel();
      if (l === null) return null;
      while (peek() && peek().t === 'op' && (peek().v === '==' || peek().v === '!=')) {
        var op = peek().v; p++;
        var r = rel();
        if (r === null) return null;
        l = op === '==' ? (l === r ? 1 : 0) : (l !== r ? 1 : 0);
      }
      return l;
    }
    function and() {
      var l = eq();
      if (l === null) return null;
      while (peek() && peek().t === 'op' && peek().v === '&&') {
        p++;
        var r = eq();
        if (r === null) return null;
        l = (l && r) ? 1 : 0;
      }
      return l;
    }
    function expr() {
      var l = and();
      if (l === null) return null;
      while (peek() && peek().t === 'op' && peek().v === '||') {
        p++;
        var r = and();
        if (r === null) return null;
        l = (l || r) ? 1 : 0;
      }
      return l;
    }
    var v0 = expr();
    if (v0 === null || p !== t.length) return null;
    return v0;
  }

  /* ======================= 分析器 ======================= */

  /* 把待扫描文本里的"不该被当成元字符"的片段替换成同长度的 `\x00`：
     引号串（含 \x01..\x03 的替换标记）、括号块（`( … )`）、方括号块（`[ … ]`、`[[ … ]]`）。
     这样 `&&` / `||` / `;` / `|` 的扫描就完全不用再管引号、case 的 `|`、`[` 里的 `-o`。
     返回 null 表示"括号不配对"，调用方回落到旧行为（不去括号，自己管引号）。 */
  function maskBlocks(line) {
    var s = String(line), out = '', quote = null, i = 0;
    var M = '\u0000';
    function blank(a, b) { for (var k = a; k < b; k++) out += M; }
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === SUB_MARK || ch === SUB_UNQ) {
        var e = s.indexOf(SUB_END, i + 1);
        if (e < 0) { out += ch; i++; continue; }
        blank(i, e + 1); i = e + 1; continue;
      }
      if (quote) { out += ch; if (ch === quote) quote = null; i++; continue; }
      if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue; }
      if (ch === '\\' && i + 1 < s.length) {
        /* 转义的两个字符都不算元字符，但长度必须对得上 */
        out += M + M; i += 2; continue;
      }
      /* ⚠️ `$(( … ))` 是**算术展开**：里面那两个 `(` 不是子 shell、`))` 也不是。
         必须整块原样保留，绝不能屏蔽内层的 `(`。
         踩过的坑：内层 `(` 被 NUL 掉之后，整行文本变成 `echo $(\0\0\0\0\0)`，
         下游的 extractSubs 再也认不出 `$((`，于是把它当成"命令替换，命令是 (2+3)"，
         去执行一条不存在的命令、拿到空值 —— `echo $((2+3))` 静默输出空行、
         `X=$((i+1))` 把变量清空，全程没有任何报错。 */
      if (ch === '$' && s.charAt(i + 1) === '(' && s.charAt(i + 2) === '(') {
        var adA = 0, jA = i + 1, okA = false;
        while (jA < s.length) {
          var cA = s.charAt(jA);
          if (cA === '(') adA++;
          else if (cA === ')') { adA--; if (adA === 0) { okA = true; break; } }
          jA++;
        }
        if (okA) { out += s.slice(i, jA + 1); i = jA + 1; continue; }
      }
      /* 只屏蔽**真正需要保护**的括号：
         · `$(` 是命令替换，交给 extractSubs 处理，不能屏蔽（否则 `$(date)` 变成一串 NUL）
         · `[[ … ]]` 是测试关键字，里面的 `||` 不能当管道切开，必须屏蔽
         · 普通的 `(`、`[` 不能屏蔽 —— `grep -E 09:4[12] file` 里的字符类 `[12]`
           一旦被屏蔽，模式就变成 `09:4\0\0\0`，grep 永远匹配不到（明明文件里有 09:41:18）。 */
      var needMask = (ch === '(' && s.charAt(i - 1) !== '$') || (ch === '[' && s.charAt(i + 1) === '[');
      if (needMask) {
        var close = ch === '(' ? ')' : ']';
        var depth = 0, j = i, q2 = null, found = -1;
        while (j < s.length) {
          var c2 = s.charAt(j);
          if (q2) { if (c2 === q2) q2 = null; j++; continue; }
          if (c2 === '"' || c2 === "'") { q2 = c2; j++; continue; }
          if (c2 === '\\') { j += 2; continue; }
          if (c2 === ch) depth++;
          else if (c2 === close) { depth--; if (depth === 0) { found = j; break; } }
          j++;
        }
        if (found < 0) {
          /* 括号不配对（例如 C 风格 for 的 `for ((i=0;`）。不能在开头就整体放弃 ——
             那会让整行回落到"不管引号"，引号里的 && | ; 会被切错。
             把括号字符本身屏蔽、内部原样保留，继续往后扫。 */
          out += M; i++; continue;
        }
        blank(i, found + 1); i = found + 1; continue;
      }
      out += ch; i++;
    }
    return out;
  }

  /* 词法分析：切词并**保留引号语义**。
     返回值：
       tokens  普通调用方看到的字符串数组（含 \x01..\x03 替换标记，引号去掉）
       quoteAt 与 tokens 等长，每位是 `'` / `"` / ''，表示"这个词是被引号包住的"
     早先只返回数组，于是 `echo "$(hostname)"` 无法区分引号内外，
     也就没法决定命令替换的结果要不要再按空白切分。 */
  function tokenizeDetail(line) {
    var tokens = [], marks = [], cur = '', quote = null, has = false, at = '';
    var s = String(line);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === SUB_MARK || ch === SUB_UNQ) {
        var e = s.indexOf(SUB_END, i + 1);
        if (e >= 0) { cur += s.slice(i, e + 1); has = true; if (!at) at = quote || 'x'; i = e; continue; }
      }
      if (quote) {
        if (ch === quote) { quote = null; continue; }
        cur += ch; has = true;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; has = true; if (!at) at = ch; continue; }
      if (ch === ' ' || ch === '\t') {
        if (cur !== '' || has) { tokens.push(cur); marks.push(at); cur = ''; has = false; at = ''; }
        continue;
      }
      cur += ch;
    }
    if (cur !== '' || has) { tokens.push(cur); marks.push(at); }
    return { tokens: tokens, quoteAt: marks };
  }

  function tokenize(line) {
    return tokenizeDetail(line).tokens;
  }

  /* 只在**切分**（切管道 `|`、切语句 `;` `&&` `||`）时用的额外屏蔽：
     把 `$( … )` 命令替换的**内部**换成同长度的 \x00。
     为什么必须做：里面的 `|` 是"子命令自己的管道"、`;` 是"子命令自己的分号"，
     都不属于外层命令行。早先没做，最常见的取值写法直接坏掉：
        USE=$(df -h /data | tail -1 | awk '{print $5}')
     外层先按 `|` 切成三段，第一段 `USE=$(df -h /data` 括号不配对 →
     报"命令替换括号不配对"，赋值失败；而 `;` 后面的命令照跑，
     于是变量**静默为空**（屏幕上只有一句看不懂的括号报错）。
     ⚠️ 这个屏蔽**只给切分用**，绝不能并进 maskBlocks ——
     maskBlocks 的结果还要被 extractSubs 当原文用（`$(date)` 变成 NUL 就跑不出来了）。
     切分函数在拼回结果时会把 \x00 位置换回原文，所以对下游没有副作用。 */
  function maskSubInteriors(text) {
    var s = String(text), out = '', i = 0;
    while (i < s.length) {
      if (s.charAt(i) === '$' && s.charAt(i + 1) === '(' && s.charAt(i + 2) !== '(') {
        var d = 0, j = i + 1, q = null, close = -1;
        while (j < s.length) {
          var c = s.charAt(j);
          if (q) {
            if (c === '\\') { j += 2; continue; }
            if (c === q) q = null;
            j++; continue;
          }
          if (c === '"' || c === "'") { q = c; j++; continue; }
          if (c === '\\') { j += 2; continue; }
          if (c === '(') d++;
          else if (c === ')') { d--; if (d === 0) { close = j; break; } }
          j++;
        }
        if (close > i + 2) {
          out += s.slice(i, i + 2);
          for (var k = i + 2; k < close; k++) out += '\u0000';
          out += ')';
          i = close + 1;
          continue;
        }
      }
      out += s.charAt(i); i++;
    }
    return out;
  }

  /* `/dev/tcp/<主机>/<端口>` 与 `/dev/udp/...` 的**连接测试**语义。
     真 bash 里这不是文件，而是"打开一条 socket"：
       (echo > /dev/tcp/10.0.1.23/80) 2>/dev/null && echo "80 端口可达"
     正是站内 sh-devnull-devtcp 条目教的端口探测写法（不依赖 nc/telnet）。
     引擎早先把它当普通文件路径，报 `No such file or directory` ——
     于是"可达"永远不成立：**教材在用，终端却永远说不可达**。
     这里按模拟的监听表判定：绑在 0.0.0.0 的端口任何主机都能连；
     绑在 127.0.0.1 的只有本机自己能连（这正是"服务只听本地"这个高频故障的教学点）。 */
  function devTcpProbe(host, port, proto, hostname) {
    var rows = ((window.CC_TERM_FS || {}).listen) || [];
    hostname = String(hostname || (BASE_HOST && BASE_HOST.hostname) || '');
    var isLocal = /^(127\.0\.0\.1|localhost|::1)$/.test(host) || (hostname !== '' && host === hostname);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (proto === 'tcp' && String(r.proto) !== 'tcp') continue;
      var parts = String(r.local).split(':');
      var p = Number(parts.pop());
      if (p !== port) continue;
      var bind = parts.join(':');
      if (bind === '0.0.0.0' || bind === '::' || bind === '*') return { ok: true, proc: String(r.proc || '') };
      if (isLocal && (bind === '127.0.0.1' || bind === '::1')) return { ok: true, proc: String(r.proc || '') };
    }
    return { ok: false, proc: '' };
  }

  /* 找 `(` 的配对 `)`：跳过引号内容与转义，支持嵌套。     返回下标；找不到返回 -1。
     用于子 shell `( 命令 )` 的拆分 —— 不能用 `lastIndexOf(')')`：
     `(echo > /dev/tcp/h/80) 2>/dev/null` 里最后那个 `)` 是 `2>/dev/null` 之后没有，
     但 `(a; (b))` 这种嵌套用 lastIndexOf 会切错。 */
  function matchCloseParen(s, open) {
    var depth = 0, q = null;
    for (var i = open; i < s.length; i++) {
      var c = s.charAt(i);
      if (q) {
        if (c === '\\') { i++; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '\\') { i++; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  function splitPipeline(line) {
    var masked = maskBlocks(line);
    var scan = maskSubInteriors(masked === null ? String(line) : masked);
    var parts = [], cur = '', quote = null;
    for (var i = 0; i < scan.length; i++) {
      var ch = scan[i];
      /* \x00 是被屏蔽的片段（引号串 / 括号块 / 替换标记），原样带过去 */
      if (ch === '\u0000') { cur += line.charAt(i); continue; }
      if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '|') { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map(function (p) { return p.trim(); }).filter(function (p) { return p !== ''; });
  }

  /* 找出重定向并返回 { cmd, redirect: {type, file} }。
     除了原来的 `>` / `>>` / `2>`，这里还负责：
       · `2>&1`（合并流，早就支持）
       · `<` / `0<`（输入重定向 —— `done < hosts.txt`、`read x < file` 要用）
       · `&>` / `&>>`（stdout+stderr 一起写文件）
     `$(( ))` 里的 `>` 是算术比较、不是重定向，所以先按 $(( )) 屏蔽掉再匹配。 */
  function extractRedirect(seg) {
    var s = String(seg);
    var mergeErr = false;
    var m31 = s.match(/^(.*?)\s*2>&1\s*$/);
    if (m31) { s = m31[1]; mergeErr = true; }

    /* `$(( ... ))` 整块屏蔽掉（`$((n > 5))` 里的 > 不是重定向） */
    var scan = '', i2 = 0;
    while (i2 < s.length) {
      if (s.charAt(i2) === '$' && s.substr(i2, 3) === '$(((') { /* 极少见，按普通处理 */ }
      if (s.substr(i2, 3) === '$(((') { scan += s.charAt(i2); i2++; continue; }
      if (s.charAt(i2) === '$' && s.substr(i2, 3) === '$((') {
        var d = 0, j2 = i2 + 1, ok = false;
        while (j2 < s.length) {
          var c2 = s.charAt(j2);
          if (c2 === '(') d++;
          else if (c2 === ')') { d--; if (d === 0) { ok = true; break; } }
          j2++;
        }
        if (ok) { for (var k2 = i2; k2 <= j2; k2++) scan += '\u0000'; i2 = j2 + 1; continue; }
      }
      scan += s.charAt(i2); i2++;
    }

    /* ⚠️ `&>` / `&>>` 必须**带**前导空白或行首才算，否则 `echo a >> f` 里的
       ">>&" 会被 `&>>` 抢先匹配，把追加变成覆盖写（这一步踩过）。
       所以两条正则分开试：先试 `&>`，再试普通的 `>` / `>>` / `2>` / `<`。

       ⚠️⚠️ 这里要**反复剥**，不能只剥一个：
       `ls -l x > /tmp/out 2> /tmp/err` 是最常见的"stdout 与 stderr 分开放"写法。
       早先只处理末尾那一个重定向，于是 `2> /tmp/err` 被认走、
       `> /tmp/out` 留在了命令里 —— 但它已经不是末尾，于是**被当成参数传给命令**：
         $ ls -l /etc/hostname > /tmp/a.log 2>/tmp/b.log
         -rw-r--r-- ... hostname          ← stdout 根本没进文件，直接打到屏幕上
         ls: cannot access '>': ...       ← `>` 被当成要列出的文件名
       命令的真实行为被改掉了，还给出一个看着像"文件不存在"的正常报错 ——
       属于最危险的一类静默错误。所以这里循环剥到剥不动为止。 */
    var reds = [];
    var guard = 0;
    while (guard++ < 8) {
      var m = scan.match(/(?:^|\s)(&>>|&>)\s*([^\s|>]+)\s*$/);
      if (!m) m = scan.match(/(?:^|\s)(\d?)(>>|>|\d?<)\s*([^\s|>]+)\s*$/);
      if (!m) break;
      /* 引号里的 > 不是重定向：`mysql -e "select id from t where time > 100"` 里的箭头
         属于 SQL 本身，旧写法会把它当成"写文件"从而悄悄吞掉整条命令的输出与退出码。 */
      var quote = null;
      for (var q = 0; q < m.index; q++) {
        var ch = s.charAt(q);
        if (quote) { if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'") quote = ch;
      }
      if (quote) break;
      var red;
      if (m[1] === '&>' || m[1] === '&>>') {
        red = { append: m[1] === '&>>', file: m[2], fd: '', both: true };
      } else if (m[2] === '<' || m[2] === '0<') {
        red = { append: false, file: m[3], fd: '0', input: true };
      } else {
        red = { append: m[2] === '>>', file: m[3], fd: m[1] || '' };
      }
      red._at = m.index;
      reds.unshift(red);              /* 从后往前剥，所以往前插 */
      scan = scan.slice(0, m.index);
      s = s.slice(0, m.index);
    }
    if (!reds.length) return { cmd: s.trim(), redirect: null, redirects: [], mergeErr: mergeErr };
    /* 输入重定向（`< 文件`）只能有一个，单独拎出来给调用方用；
       输出重定向按先后顺序全部应用。 */
    var inRed = null, outReds = [];
    for (var rr = 0; rr < reds.length; rr++) {
      if (reds[rr].input) { if (!inRed) inRed = reds[rr]; }
      else outReds.push(reds[rr]);
    }
    /* 兼容旧字段：redirect 指向"最后一个输出重定向"，没有输出重定向时指向输入重定向 */
    var primary = outReds.length ? outReds[outReds.length - 1] : inRed;
    return { cmd: s.trim(), redirect: primary, redirects: outReds, inputRedirect: inRed, mergeErr: mergeErr };
  }

  /* 变量展开：`$VAR` / `${VAR}`，另外支持 `$?`（上一条命令的退出码）与 `$$`（本 shell 的 PID）——
     这两个是写脚本绕不开的，内容里到处都在用（`echo "退出码 $?"`）。 */
  function expandVars(str, env) {
    return String(str).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*|[?$])/g,
      function (m, braced, plain) {
        var name = braced !== undefined ? braced : plain;
        return env[name] !== undefined ? env[name] : '';
      });
  }

  /* ================= 词展开：参数 / 算术 / 命令替换 =================
     这一节是"$() 与 ${} 真正生效"的地方。设计要点：
       · 命令替换在**切词之前**用 \x01..\x03 标记占位，因此
         `cat /proc/$(pgrep -f myapp | head -1)/limits` 里的替换结果不会把参数切碎；
       · 引号外的替换结果按空白再切成多个字段，引号内的不切（与真 bash 一致）；
       · 变量展开只做一遍（早先 `${X:-a b}` 这类要展开两遍才对的写法会重复展开）。 */

  function rawExpand(str, vars) {
    return String(str).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*|[?$])/g,
      function (m, braced, plain) {
        var name = braced !== undefined ? braced : plain;
        return vars[name] !== undefined ? vars[name] : '';
      });
  }

  /* 位置参数的字段数组（$1 $2 … / $@ / $*） */
  function posArray(vars) {
    var out = [];
    for (var i = 1; ; i++) {
      if (vars['#' + i] === undefined) break;
      out.push(vars['#' + i]);
      if (i > 200) break;
    }
    return out;
  }

  /* 把 `a*b` 这类模式匹配到 `pats[which]`：
     用一次性的字符串比较判断子串位置，避免重新组合正则带来的转义问题。 */
  function posMatchAny(pats, which, s) {
    for (var i = 0; i < pats.length; i++) if (globMatchFull(pats[i], s)) return i;
    return -1;
  }

  function expandFieldText(str, vars, quoted, ex, allowArith, setVar) {
    var s = String(str === undefined || str === null ? '' : str);
    if (!quoted && s.charAt(0) === '~' && (s.length === 1 || s.charAt(1) === '/')) {
      if (vars.HOME) s = vars.HOME + s.slice(1);
    }
    var out = '', i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      var mk = (ch === SUB_MARK || ch === SUB_UNQ) ? s.indexOf(SUB_END, i + 1) : -1;
      if (mk > 0) {
        out += s.slice(i, mk + 1);
        i = mk + 1;
        continue;
      }
      if (ch === '$' && s.charAt(i + 1) === '(' && s.charAt(i + 2) === '(') {
        var ad = 0, aj = i + 1, aok = false;
        for (var ak = i + 1; ak < s.length; ak++) {
          var ac = s.charAt(ak);
          if (ac === '(') ad++;
          else if (ac === ')') { ad--; if (ad === 0) { aj = ak; aok = true; break; } }
        }
        if (aok) {
          if (allowArith === false) { out += s.slice(i, aj + 1); i = aj + 1; continue; }
          var av = arithEval(s.slice(i + 3, aj - 1), vars, function (n, v) { vars[n] = String(v); });
          out += (av === null ? 0 : av) + '';
          i = aj + 1;
          continue;
        }
      }
      if (ch !== '$') { out += ch; i++; continue; }
      var nx = s.charAt(i + 1);
      if (nx === '{') {
        var close = matchBrace(s, i + 1);
        if (close < 0) { out += ch; i++; continue; }
        out += expandBraced(s.slice(i + 2, close), vars, quoted, ex, setVar);
        i = close + 1;
        continue;
      }
      if (nx === '' ) { out += ch; i++; continue; }
      if (nx === '#') {
        /* `$#` 是位置参数个数；`$1` 在 vars 里是变形的 '#1' 键。
           没有位置参数时**不能退化成 '0'** —— 那会让 `[ $# -gt 0 ]` 变成
           `[ 0 -gt 0 ]`（假的成功），而不是真 shell 里的"参数不够、报语法错"。 */
        var n1 = /^[0-9]$/.test(s.charAt(i + 2)) ? s.charAt(i + 2) : '';
        var pk = '#' + n1;
        out += vars[pk] === undefined ? (n1 ? '' : '0') : vars[pk];
        i += 2 + (n1 ? 1 : 0);
        continue;
      }
      if (nx === '@' || nx === '*') { out += expandAtStar(vars, quoted, nx); i += 2; continue; }
      if (/[0-9]/.test(nx)) {
        var rest2 = s.slice(i + 1), digits = rest2.match(/^[0-9]+/)[0];
        var val2 = vars[digits];
        if (val2 === undefined) val2 = vars['#' + digits];
        out += (val2 === undefined ? '' : val2);
        i += 1 + digits.length;
        continue;
      }
      var mn = s.slice(i + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!mn) { out += ch; i++; continue; }
      var vv = vars[mn[0]];
      out += (vv === undefined ? '' : vv);
      i += 1 + mn[0].length;
    }
    return out;
  }

  function expandAtStar(vars, quoted, kind) {
    var a = posArray(vars);
    if (quoted && kind === '@') {
      /* "$@" 要展开成**多个**字段，所以给每个参数各来一个引号内的标记 */
      var buf0 = '';
      for (var j = 0; j < a.length; j++) {
        ex_pushSub('', true, a[j]);
        buf0 += subMarker(true, ex_lastSubIndex());
      }
      if (!a.length) return '';
      return buf0;
    }
    var joined = a.join(' ');
    if (quoted) { ex_pushSub('', true, joined); return subMarker(true, ex_lastSubIndex()); }
    var buf = '';
    for (var k = 0; k < a.length; k++) {
      ex_pushSub('', false, a[k]);
      buf += subMarker(false, ex_lastSubIndex());
      if (k < a.length - 1) buf += ' ';
    }
    return buf;
  }

  /* 展开期间的硬错误（`${VAR:?}` 这类"必须停下来"的情况）。
     单线程同步执行，_execOne 每次进入时换一个新数组、退出时还原，
     所以命令替换里再套一层也不会把外层的错误吞掉。 */
  var EXPAND_ERRS = [];

  /* 参数展开 ${...} 的全部内容（已经去掉 $ { } 三个字符）
     setVar：把 `${VAR:=值}` 的结果**写回真正的变量表**（不是本次展开用的临时副本）。
     没有它的话 `K=; echo "${K:=兜底}"; echo "$K"` 会打印 兜底 然后打印空 —— 静默不一致。 */
  function expandBraced(inner, vars, quoted, ex, setVar) {
    if (inner.charAt(0) === '#') {
      var nm = inner.slice(1);
      var val = vars[nm];
      return String(val === undefined ? 0 : String(val).length);
    }
    var m = inner.match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?$@*#!-])([\s\S]*)$/);
    if (!m) return '';
    var name = m[1], rest = m[2];
    var cur = vars[name];
    if (cur === undefined) cur = vars['#' + name];
    var unset = (cur === undefined);
    var empty = unset || cur === '';
    var operand = function () { return expandFieldText(rest.slice(2), vars, quoted, ex, undefined, setVar); };
    var put = function (v) { vars[name] = v; if (setVar) setVar(name, v); return v; };
    /* `${VAR:?提示}` —— 参数校验。变量为空时**报错并让这条命令以非 0 退出**，
       而不是展开成空字符串。早先这里 `if (op === '?') return cur;` 在变量未定义时
       直接把 JS 的 undefined 返回出去，屏幕上打出一句莫名其妙的 "undefined" ——
       既不报错也不为空，学员完全看不懂发生了什么。 */
    var needErr = function () {
      var msg = rest.slice(2);
      EXPAND_ERRS.push('bash: ' + name + ': ' + (msg || 'parameter null or not set'));
      return '';
    };
    if (rest.charAt(0) === ':') {
      var op = rest.charAt(1);
      if (op === '-') return empty ? operand() : cur;
      if (op === '=') return empty ? put(operand()) : cur;
      if (op === '+') return empty ? '' : operand();
      if (op === '?') return empty ? needErr() : cur;
      if (op === ' ') { /* 长度切片 ${x:0:4} —— 教学环境里尽量支持 */ }
    } else {
      if (rest.charAt(0) === '-') return unset ? operand() : cur;
      if (rest.charAt(0) === '=') return unset ? put(operand()) : cur;
      if (rest.charAt(0) === '+') return unset ? '' : operand();
      if (rest.charAt(0) === '?') return unset ? needErr() : cur;
    }
    if (rest.charAt(0) === ':') {
      /* ${VAR:offset:len} —— 字符串切片 */
      var nums = rest.slice(1).split(':');
      var off = Number(nums[0]);
      if (!isNaN(off)) {
        var str = String(cur === undefined ? '' : cur);
        if (off < 0) off = Math.max(0, str.length + off);
        if (nums.length > 1 && nums[1] !== '') {
          var len = Number(nums[1]);
          return str.substr(off, isNaN(len) ? undefined : len);
        }
        return str.slice(off);
      }
    }
    if (rest.charAt(0) === '/') {
      /* ${VAR//a/b} 与 ${VAR/a/b} */
      var g = rest.charAt(1) === '/';
      var body = g ? rest.slice(2) : rest.slice(1);
      var sep = g ? body.indexOf('/') : body.indexOf('/');
      var pat = sep < 0 ? body : body.slice(0, sep);
      var rep = sep < 0 ? '' : body.slice(sep + 1);
      var base = String(cur === undefined ? '' : cur);
      if (!pat) return base;
      var re = globToRegExpFull(pat);
      return g ? base.replace(new RegExp(re.source, 'g'), rep) : base.replace(re, rep);
    }
    /* ${VAR#pat} ${VAR##pat} ${VAR%pat} ${VAR%%pat}
       用"逐个前缀/后缀试匹配"实现，不用正则反向引用，避免转义坑。 */
    var pm = rest.match(/^(##|#|%%|%)([\s\S]*)$/);
    if (pm) {
      var kind = pm[1], pat2 = pm[2];
      var s2 = String(cur === undefined ? '' : cur);
      var cut = -1;
      if (kind === '#' || kind === '##') {
        if (kind === '#') {
          for (var k1 = 0; k1 <= s2.length; k1++) if (globMatchFull(pat2, s2.slice(0, k1))) { cut = k1; break; }
        } else {
          for (var k2 = s2.length; k2 >= 0; k2--) if (globMatchFull(pat2, s2.slice(0, k2))) { cut = k2; break; }
        }
        if (cut >= 0) return s2.slice(cut);
        return s2;
      }
      if (kind === '%') {
        for (var k3 = s2.length; k3 >= 0; k3--) if (globMatchFull(pat2, s2.slice(k3))) { cut = k3; break; }
      } else {
        for (var k4 = 0; k4 <= s2.length; k4++) if (globMatchFull(pat2, s2.slice(k4))) { cut = k4; break; }
      }
      if (cut >= 0) return s2.slice(0, cut);
      return s2;
    }
    return (cur === undefined ? '' : cur) + rest;
  }

  /* 记录一条命令替换的结果（供 expandMarker 取用） */
  function ex_pushSub(cmd, quoted, value) {
    EX_SUBS.push({ cmd: cmd, quoted: !!quoted, value: value });
  }
  function ex_lastSubIndex() { return EX_SUBS.length - 1; }

  /* 把标记换成实际结果。引号内的原样；引号外的按空白切分成多个字段。 */
  var EX_SUBS = [];
  function expandMarkedField(tok, vars, anyQuoted) {
    var s = String(tok);
    if (s.indexOf(SUB_MARK) === -1 && s.indexOf(SUB_UNQ) === -1) {
      var x = rawExpand(s, vars);
      return x === '' ? (anyQuoted ? [''] : []) : [x];
    }
    var parts = [], cur = '', i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === SUB_MARK || ch === SUB_UNQ) {
        var e = s.indexOf(SUB_END, i + 1);
        if (e < 0) { cur += ch; i++; continue; }
        var idx = Number(s.slice(i + 1, e));
        var sub = EX_SUBS[idx];
        var outVal = sub && sub.value !== undefined ? String(sub.value) : '';
        if (ch === SUB_MARK) cur += outVal;
        else { parts.push(cur + outVal); cur = ''; }
        i = e + 1;
        continue;
      }
      cur += ch; i++;
    }
    parts.push(cur);
    var res = [];
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      if (k > 0 && parts[k - 1] === '' && k === parts.length - 1 && p === '' && !anyQuoted) continue;
      res.push(p);
    }
    return res;
  }

  /* 保留被引用的 glob 字符，防止后续路径展开把它们当模式。 */
  var QUOTED_GLOB_STAR = String.fromCharCode(4);
  var QUOTED_GLOB_QMARK = String.fromCharCode(5);
  function protectQuotedGlobs(s) {
    return String(s).replace(/\*/g, QUOTED_GLOB_STAR).replace(/\?/g, QUOTED_GLOB_QMARK);
  }
  function restoreQuotedGlobs(s) {
    return String(s).replace(new RegExp(QUOTED_GLOB_STAR, 'g'), '*')
      .replace(new RegExp(QUOTED_GLOB_QMARK, 'g'), '?');
  }

  function expandFields(tokens, marks, vars) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var quoted = marks[i] === '"' || marks[i] === "'";
      if (marks[i] === "'") { out.push(protectQuotedGlobs(t)); continue; }
      var fields = expandMarkedField(t, vars, quoted);
      for (var k = 0; k < fields.length; k++) {
        var f = fields[k];
        if (f === '' && !quoted) continue;
        out.push(marks[i] === "'" ? protectQuotedGlobs(f) : f);
      }
    }
    return out;
  }

  /* GNU 风格长选项 → 短选项（教学环境支持常用的几个，避免"写了长参数跑不通"） */
  var LONG_OPTS = {
    '--ignore-case': '-i', '--invert-match': '-v', '--line-number': '-n',
    '--count': '-c', '--files-with-matches': '-l', '--word-regexp': '-w',
    '--extended-regexp': '-E', '--only-matching': '-o', '--recursive': '-r',
    '--human-readable': '-h', '--all': '-a', '--detach': '-d', '--quiet': '-q',
    '--force': '-f', '--recursive-copy': '-r', '--verbose': '-v', '--follow': '-f',
    '--previous': '-p', '--wide': '-o wide', '--interactive': '-i', '--tty': '-t',
    '--no-stream': '--no-stream',
    /* `grep --line-buffered` 是"每行立即刷新"的开关，在网页终端里没有意义 ——
       但它**不能**被当成未知长选项原样留下：那样 grep 会把它当成"-l"（只列文件名）之外
       的另一个开关，而后面的模式串就被挤成了文件名（`tail -F x | grep --line-buffered -E "ERROR|Exception"`
       会报 `grep: ERROR|Exception: No such file or directory`）。
       映射成空串 = 安全吃掉。 */
    '--line-buffered': ''
  };

  function expandLongOpts(argv) {
    var out = [];
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      var mapped = LONG_OPTS[a];
      /* 用 hasOwnProperty 判断"表里有没有"，不能用 `if (mapped)` ——
         `--line-buffered` 故意映射成空串（"安全吃掉"），空串是假值，
         会被当成"表里没有"而原样留下，于是模式串又被挤成文件名。 */
      if (Object.prototype.hasOwnProperty.call(LONG_OPTS, a)) {
        if (mapped) expandLongOpts(mapped.split(' ')).forEach(function (x) { out.push(x); });
      } else {
        out.push(a);
      }
    }
    return out;
  }

  /* ======================= 命令实现 ======================= */

  var CMDS = {};

  /* ---------- ls ---------- */
  CMDS.ls = function (argv, ctx, stdin, HOST) {
    var flags = { l: false, a: false, h: false, t: false, r: false, R: false, d: false, i: false, one: false };
    var targets = [];
    argv.forEach(function (a) {
      if (/^-[a-zA-Z0-9]+$/.test(a)) {
        a.slice(1).split('').forEach(function (c) {
          if (c === '1') flags.one = true;      /* `-1` 每行一个 */
          else flags[c] = true;
        });
      } else targets.push(a);
    });
    if (!targets.length) targets = ['.'];

    /* ⚠️ 真 `ls` 会看 stdout 是不是终端：
         · 是终端 → 按列排版，一行塞好几个名字（人看着舒服）
         · 被重定向或接进管道 → **一行一个**
       引擎早先一律按列输出（把名字用两个空格拼成**一行**），后果是
         `ls /data/backup | wc -l` → **1**（其实有十几个文件），
         `ls | head -3` 也只出一行。
       这类"数字看着合理、其实是错的"最难被发现，所以必须按 ctx.tty 分开处理。
       ctx.tty 由 _execOne 计算：只有"单条命令 + 没有输出重定向"才算终端。 */
    var columnar = ctx.tty !== false && !flags.one;

    var out = [];
    targets.forEach(function (t) {
      var abs = resolvePath(ctx.cwd, t);
      var node = findNode(ctx.root, abs);
      if (!node) { ctx.err.push('ls: cannot access \'' + t + '\': No such file or directory'); ctx.code = 2; return; }

      if (node.type !== 'dir' || flags.d) {
        out.push(flags.l ? longLine(node, baseName(abs), flags) : (flags.i ? nodeInode(abs, node) + ' ' : '') + t);
        return;
      }

      if (targets.length > 1) out.push(t + ':');
      var names = childrenSorted(node);
      var list = names.filter(function (n) { return flags.a || n.charAt(0) !== '.'; });
      if (flags.t) {
        list.sort(function (a, b) {
          var A = node.children[a].mtime, B = node.children[b].mtime;
          if (A !== B) return A < B ? 1 : -1;
          return a < b ? -1 : 1;
        });
      }
      if (flags.r) list.reverse();

      if (flags.l) {
        var total = 0;
        names.forEach(function (n) { total += Math.ceil(sizeOf(node.children[n]) / 1024); });
        out.push('total ' + total);
        list.forEach(function (n) {
          out.push(longLine(node.children[n], n, flags));
        });
      } else if (flags.R) {
        list.forEach(function (n) {
          var child = node.children[n];
          out.push((flags.i ? nodeInode(abs + '/' + n, child) + ' ' : '') + n);
          if (child.type === 'dir') walkRecursive(child, abs + '/' + n, out, flags, columnar);
        });
      } else {
        /* 终端里按列（一行放得下就放一行）；管道 / 重定向里一行一个。
           早先这两个分支写得一模一样（都是 join('  ')），是段死代码。 */
        if (columnar) out.push(list.join('  '));
        else list.forEach(function (n) { out.push(n); });
      }
      if (targets.length > 1) out.push('');
    });
    return ok(out);
  };

  /* ---------- 通配符展开 ----------
     真 shell 会先把 `*` `?` 展开成实际路径，再交给命令。引擎早先没做这一步，
     于是 `ls /data/*` 直接报 `cannot access '/data/*'` —— 而站内的故障速查
     （`du -sh /data/* | sort -rh`）与不少示例都在用 glob，学员照抄却跑不通。

     ⚠️ 只在参数**含 `/`** 时才展开，这是刻意的保守取舍：
     引擎在解析阶段就把引号去掉了，无法区分 `find . -name "*.log"`（模式）
     和 `ls *.log`（路径）。而 `find -name *.log` 被误展开会**悄悄改变语义**，
     比"不展开"危险得多。所以只处理 `ls /data/*`、`du -sh /var/log/*.log`
     这类明确带路径的写法；裸 `*.log` 保持原样（等同旧行为）。

     无匹配时按真 shell 的行为**原样传下去**，让命令自己报"找不到文件"。 */
  function globToRegExp(pat) {
    var re = '';
    for (var i = 0; i < pat.length; i++) {
      var c = pat.charAt(i);
      if (c === '*') re += '[^/]*';
      else if (c === '?') re += '[^/]';
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$');
  }

  function expandGlobs(args, ctx) {
    if (!args.length) return args;
    var out = [];
    args.forEach(function (a) {
      var protectedGlob = String(a).indexOf(QUOTED_GLOB_STAR) !== -1 ||
        String(a).indexOf(QUOTED_GLOB_QMARK) !== -1;
      a = restoreQuotedGlobs(a);
      if (protectedGlob) { out.push(a); return; }
      if (!/[*?]/.test(a) || a.indexOf('/') === -1) { out.push(a); return; }
      var res = globExpandPattern(a, ctx);
      if (!res.length) { out.push(a); return; }   /* 没有匹配 → 原样保留（真 shell 行为） */
      res.forEach(function (r) { out.push(r); });
    });
    return out;
  }

  /* 逐段展开通配符。
     ⚠️ 早先**只展开最后一段**（把路径按最后一个 `/` 切成 dirPart + namePart，
     dirPart 里的 `*` 完全不管）。于是这两条站内示例永远报"文件不存在"：
       cat /var/log/batch-星号/10.0.1.21.out          ← 通配符在**目录**位置
       du -sh /var/lib/docker/containers/星号/星号-json.log   ← 两层都要展开
     （上面两处星号在真示例里是 `*`；这里写成文字是避免 `星号斜杠` 提前闭合块注释。）
     真 shell 的行为是从左到右逐段展开，这里照做：
     每遇到一个带通配符的段，就拿"当前已确定的一批目录"去枚举匹配的子项；
     没有通配符的段直接拼上去（它的存在性由后面一步或最终过滤来把关）。 */
  function globExpandPattern(pattern, ctx) {
    var isAbs = pattern.charAt(0) === '/';
    /* ⚠️ 先归一化 `.` 与 `..`：`findNode` 是按路径段逐级查子节点的，
       它不认 `.` 这个"段"，于是 `./part-*` 整个匹配不上
       （站内 lt-dedupe-large-file 的示例正是 `for f in ./part-*`）。
       真 shell 里 `./x` 与 `x` 等价，所以这里把 `.` 丢掉、`..` 回退一层。 */
    var rawSegs = pattern.split('/').filter(function (s) { return s !== '' && s !== '.'; });
    var segs = [];
    rawSegs.forEach(function (s) {
      if (s === '..') { segs.pop(); return; }
      segs.push(s);
    });
    if (!segs.length) return [];
    var bases = [isAbs ? '' : String(ctx.cwd).replace(/\/+$/, '')];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var next = [];
      if (!/[*?]/.test(seg)) {
        bases.forEach(function (b) { next.push(b + '/' + seg); });
        bases = next;
        continue;
      }
      var re = globToRegExp(seg);
      var showHidden = seg.charAt(0) === '.';
      bases.forEach(function (b) {
        var dirNode = findNode(ctx.root, b === '' ? '/' : b);
        if (!dirNode || dirNode.type !== 'dir' || !dirNode.children) return;
        Object.keys(dirNode.children).filter(function (n) {
          if (!showHidden && n.charAt(0) === '.') return false;
          return re.test(n);
        }).sort().forEach(function (n) { next.push(b + '/' + n); });
      });
      bases = next;
      if (!bases.length) return [];
    }
    /* 只保留虚拟文件系统里真实存在的条目 */
    return bases.filter(function (p) { return !!findNode(ctx.root, p); });
  }

  function walkRecursive(node, abs, out, flags, columnar) {    out.push('');
    out.push(abs + ':');
    var names = childrenSorted(node).filter(function (n) { return flags.a || n.charAt(0) !== '.'; });
    if (columnar === false) names.forEach(function (n) { out.push(n); });
    else out.push(names.join('  '));
    names.forEach(function (n) {
      if (node.children[n].type === 'dir') walkRecursive(node.children[n], abs + '/' + n, out, flags, columnar);
    });
  }

  function nodeInode(abs, node) {
    var h = 0, s = abs + node.type;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 900000;
    return String(260000 + h);
  }

  function permString(node) {
    var mode = String(node.mode || '644');
    var special = '';
    if (mode.length === 4) { special = mode.charAt(0); mode = mode.slice(1); }
    var map = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
    var s = (node.type === 'dir' ? 'd' : (node.type === 'link' ? 'l' : '-')) +
      map[Number(mode.charAt(0))] + map[Number(mode.charAt(1))] + map[Number(mode.charAt(2))];
    if (special === '1') s = s.slice(0, 9) + (s.charAt(9) === 'x' ? 't' : 'T');
    if (special === '4') s = s.slice(0, 3) + (s.charAt(3) === 'x' ? 's' : 'S') + s.slice(4);
    return s;
  }

  function longLine(node, name, flags) {
    var size = humanSizeOfForLs(sizeOf(node), flags);
    var line = permString(node) + ' ' +
      String(countLinks(node)).padStart(2, ' ') + ' ' +
      (node.user || 'root').padEnd(6, ' ') + ' ' +
      (node.group || 'root').padEnd(6, ' ') + ' ' +
      String(size).padStart(6, ' ') + ' ' +
      (node.mtime || '2024-03-18 09:00') + ' ' + name;
    if (node.type === 'link') line += ' -> ' + node.target;
    return line;
  }

  function humanSizeOfForLs(bytes, flags) {
    return flags.h ? humanSize(bytes) : String(bytes);
  }

  /* ---------- cd / pwd ---------- */
  CMDS.cd = function (argv, ctx, stdin, HOST) {
    var target = argv.length ? argv[0] : HOST.home;
    /* `cd -` 回到上一个目录，并把目标目录打印出来（真 bash 的行为）。
       之前 `-` 被当成普通路径，于是 `cd -` 报 "No such file or directory" ——
       而 docs 里就有 `cd - > /dev/null` 这种用法。 */
    if (target === '-') {
      if (!ctx.prevCwd) { return fail(['bash: cd: OLDPWD not set']); }
      var prevTo = ctx.prevCwd;
      ctx.prevCwd = ctx.cwd;
      ctx.cwd = prevTo;
      return ok([prevTo]);
    }
    var abs = resolvePath(ctx.cwd, target);
    var node = findNode(ctx.root, abs);
    if (!node) { return fail(['bash: cd: ' + target + ': No such file or directory']); }
    if (node.type !== 'dir') { return fail(['bash: cd: ' + target + ': Not a directory']); }
    if (abs !== ctx.cwd) ctx.prevCwd = ctx.cwd;
    ctx.cwd = abs === '' ? '/' : abs;
    return ok([]);
  };

  CMDS.pwd = function (argv, ctx, stdin, HOST) { return ok([ctx.cwd]); };

  /* ---------- cat / head / tail ---------- */
  function readFileOrErr(ctx, arg) {
    var abs = resolvePath(ctx.cwd, arg);
    var node = findNode(ctx.root, abs);
    if (!node) return { err: 'cat: ' + arg + ': No such file or directory' };
    if (node.type === 'dir') return { err: 'cat: ' + arg + ': Is a directory' };
    /* 软链要**跟着走**。早先这里直接把 "No such file or directory" 塞进 content 返回，
       于是 `cat /etc/os-release`（termfs 里它是指向 ../usr/lib/os-release 的软链）
       不但读不到文件，还把错误信息当成**正常输出**打出来、退出码还是 0 ——
       学员会以为文件内容就是那行报错。软链是真实存在的文件，必须能读。 */
    var hops = 0;
    while (node && node.type === 'link' && hops < 8) {
      var target = String(node.target || '');
      var tAbs = target.charAt(0) === '/' ? target : resolvePath(parentOf(abs), target);
      abs = tAbs;
      node = findNode(ctx.root, tAbs);
      hops++;
    }
    if (!node) return { err: 'cat: ' + arg + ': No such file or directory' };
    if (node.type === 'dir') return { err: 'cat: ' + arg + ': Is a directory' };
    return { content: String(node.content || ''), abs: abs, gz: !!node.gz };
  }

  CMDS.cat = function (argv, ctx, stdin, HOST) {
    var files = argv.filter(function (a) { return a.charAt(0) !== '-'; });
    var numberAll = argv.indexOf('-n') !== -1;
    if (!files.length && stdin && stdin.length) {
      return ok(numberAll ? stdin.map(function (l, i) { return String(i + 1).padStart(6, ' ') + '\t' + l; }) : stdin);
    }
    if (!files.length) return ok([]);
    var out = [], err = [];
    files.forEach(function (f) {
      var r = readFileOrErr(ctx, f);
      if (r.err) { err.push(r.err); return; }
      /* gz 文件不能直接 cat —— 真机上会刷一屏乱码。
         与其假装能读，不如如实提示用 zcat/zgrep。 */
      if (r.gz) { out.push(f + ': 二进制文件（gzip 压缩），用 zcat ' + f + ' 或 zgrep <模式> ' + f + ' 查看'); return; }
      var lines = splitLines(r.content);
      lines.forEach(function (l) { out.push(l); });
    });
    if (err.length) return { out: out, err: err, code: 1 };
    return ok(out);
  };

  /* zcat = 解压到标准输出（可以接管道） */
  CMDS.zcat = function (argv, ctx, stdin, HOST) {
    var files = argv.filter(function (a) { return a.charAt(0) !== '-'; });
    if (!files.length) return stdin && stdin.length ? ok(stdin) : fail(['zcat: 缺少文件名']);
    var out = [], err = [];
    files.forEach(function (f) {
      var r = readFileOrErr(ctx, f);
      if (r.err) { err.push(r.err.replace(/^cat:/, 'zcat:')); return; }
      if (!r.gz) { err.push('zcat: ' + f + ': 不是 gzip 格式'); return; }
      splitLines(r.content).forEach(function (l) { out.push(l); });
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  function splitLines(text) {
    var t = String(text);
    if (t.charAt(t.length - 1) === '\n') t = t.slice(0, -1);
    if (t === '') return [];
    return t.split('\n');
  }

  function parseN(argv, fallback) {
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      var m = a.match(/^-n\s*(\d+)$/) || a.match(/^-(\d+)$/);
      if (m) return Number(m[1]);
      if (a === '-n') { var nx = argv[i + 1]; if (nx && /^\d+$/.test(nx)) return Number(nx); }
    }
    return fallback;
  }

  CMDS.head = function (argv, ctx, stdin, HOST) {
    var n = parseN(argv, 10);
    var files = argv.filter(function (a) { return a.charAt(0) !== '-' && !/^\d+$/.test(a); });
    var lines;
    if (files.length) {
      var r = readFileOrErr(ctx, files[0]);
      if (r.err) return fail([r.err]);
      lines = splitLines(r.content);
    } else lines = stdin || [];
    return ok(lines.slice(0, n));
  };

  CMDS.tail = function (argv, ctx, stdin, HOST) {
    var n = parseN(argv, 10);
    var isF = argv.indexOf('-f') !== -1;
    /* `tail -n +N` / `tail -N`：**从第 N 行开始一直到文件末尾**（不是"最后 N 行"）。
       这是真 tail 的语义，排障时常用（"从第 100 行开始看这个日志"）。
       早先不支持，`+100` 被当成文件名，报 `cat: +100: No such file or directory`。 */
    var fromLine = 0;
    for (var ti = 0; ti < argv.length; ti++) {
      var ta = String(argv[ti]);
      var fm = ta.match(/^-n?\+(\d+)$/) || ta.match(/^\+(\d+)$/);
      if (fm) { fromLine = Number(fm[1]); continue; }
      if (ta === '-n' && /^\+\d+$/.test(String(argv[ti + 1]))) { fromLine = Number(String(argv[ti + 1]).slice(1)); ti++; continue; }
    }
    var files = argv.filter(function (a) {
      return a.charAt(0) !== '-' && !/^\d+$/.test(a) && !/^\+\d+$/.test(a);
    });
    var lines;
    if (files.length) {
      var r = readFileOrErr(ctx, files[0]);
      if (r.err) return fail([r.err]);
      lines = splitLines(r.content);
    } else lines = stdin || [];
    var picked = fromLine > 0 ? lines.slice(fromLine - 1) : lines.slice(Math.max(0, lines.length - n));
    var res = ok(picked);
    if (isF) {
      res.out.push('');
      res.out.push('^C   （教学环境不追加真实新日志：真机上 tail -f 会持续输出新增内容）');
    }
    return res;
  };

  /* ---------- grep ---------- */
  /* grep 默认用的是 **BRE（基本正则）**，不是「子串查找」。
     之前这里只做 indexOf，于是 `grep ^root /etc/passwd`、`grep "log$" f`、
     `grep -o "[0-9]*"`、`grep -c . f` 全部**静默给出错误结果**（退出码 1，看起来就像"确实没有"）。
     静默错误比报错危险得多，所以这里按 GNU grep 的语义重写：

       · BRE：^ $ . * [] 生效；\+ \? \| \( \) \{n,m\} 是 GNU 扩展
       · -E 走 ERE；-F 走纯字面量；-w 单词边界；-x 整行匹配
       · -c 计数（单文件只打数字，多文件/递归才带文件名）
       · -l / -L 只列文件名；-q 只看退出码；-o 打出真正的匹配片段
       · -A/-B/-C 上下文，-e 多个模式，-h/-H 控制文件名前缀
     正则编译失败时退回字面量匹配 —— 宁可退化成旧行为，也不能抛异常。 */

  /* BRE → JS 正则源码 */
  function breToSource(pat) {
    var out = '', i = 0;
    while (i < pat.length) {
      var ch = pat.charAt(i);
      if (ch === '\\') {
        var nx = pat.charAt(i + 1);
        if (nx === '') { out += '\\\\'; i++; continue; }
        /* GNU BRE 扩展：\+ \? \| \( \) \{ \} 表示量词与分组，去掉反斜杠 */
        if ('+?|(){}'.indexOf(nx) !== -1) { out += nx; i += 2; continue; }
        out += '\\' + nx; i += 2; continue;
      }
      /* ^ 只在开头、$ 只在结尾是锚点，其他位置是普通字符 */
      if (ch === '^') { out += (i === 0 ? '^' : '\\^'); i++; continue; }
      if (ch === '$') { out += (i === pat.length - 1 ? '$' : '\\$'); i++; continue; }
      out += ch; i++;
    }
    return out;
  }

  function grepIsWordChar(c) { return c !== '' && /[0-9A-Za-z_]/.test(c); }

  /* 返回该行里所有命中片段 [起, 止)；空数组表示不匹配 */
  function grepSpans(line, pattern, flags) {
    var spans = [], m;
    if (flags.F) {
      var hay = flags.i ? line.toLowerCase() : line;
      var nd = flags.i ? pattern.toLowerCase() : pattern;
      if (nd === '') return [[0, 0]];
      var at = 0;
      while (true) {
        var p = hay.indexOf(nd, at);
        if (p === -1) break;
        spans.push([p, p + nd.length]);
        at = p + nd.length;
      }
    } else {
      var re = null;
      try {
        re = new RegExp(flags.E ? pattern : breToSource(pattern), 'g' + (flags.i ? 'i' : ''));
      } catch (e) { re = null; }
      if (!re) {
        var hay2 = flags.i ? line.toLowerCase() : line;
        var nd2 = flags.i ? pattern.toLowerCase() : pattern;
        if (nd2 === '') return [[0, 0]];
        var at2 = 0;
        while (true) {
          var p2 = hay2.indexOf(nd2, at2);
          if (p2 === -1) break;
          spans.push([p2, p2 + nd2.length]);
          at2 = p2 + nd2.length;
        }
      } else {
        while ((m = re.exec(line)) !== null) {
          spans.push([m.index, m.index + m[0].length]);
          if (m[0] === '') re.lastIndex++;
          if (spans.length > 400) break;
        }
      }
    }
    if (flags.w) {
      spans = spans.filter(function (s) {
        return !grepIsWordChar(s[0] > 0 ? line.charAt(s[0] - 1) : '') &&
               !grepIsWordChar(s[1] < line.length ? line.charAt(s[1]) : '');
      });
    }
    if (flags.x) spans = spans.filter(function (s) { return s[0] === 0 && s[1] === line.length; });
    return spans;
  }

  CMDS.grep = function (argv, ctx, stdin, HOST) {
    argv = expandLongOpts(argv).filter(function (a) {
      /* --color / --colour 在网页终端里没有意义，直接吃掉，别让它变成「模式」 */
      return String(a).indexOf('--color') !== 0 && String(a).indexOf('--colour') !== 0;
    });
    var flags = { i: false, v: false, n: false, r: false, R: false, c: false, l: false, L: false,
                  w: false, x: false, E: false, F: false, o: false, q: false, h: false, H: false,
                  A: 0, B: 0, C: null };
    var patterns = [], files = [], raw = [];
    /* `--include` / `--exclude` / `--exclude-dir`：递归时的文件名筛选。
       ⚠️ 这几个是**带值的长选项**，早先完全没处理，于是
         grep -rn --include="*.log" -C 3 "ERROR" /var/log/nginx/
       里的 `--include=*.log` 因为不匹配任何选项格式，一路落进 `raw`，
       被当成**模式**；真正的模式 `ERROR` 反而变成"要搜索的文件"，
       报出 `grep: ERROR: No such file or directory` —— 参数完全正确却跑不通，
       而 `--include` 是"只在某类文件里搜"的标准写法（站内 lt-grep 就在教它）。 */
    var includes = [], excludes = [], excludeDirs = [];
    for (var gi = 0; gi < argv.length; gi++) {
      var ga = String(argv[gi]);
      var gm = ga.match(/^--(include|exclude|exclude-dir)=(.*)$/);
      if (gm) {
        if (gm[1] === 'include') includes.push(gm[2]);
        else if (gm[1] === 'exclude') excludes.push(gm[2]);
        else excludeDirs.push(gm[2]);
        continue;
      }
      var gm2 = ga.match(/^--(include|exclude|exclude-dir)$/);
      if (gm2) {
        var val = String(argv[gi + 1] === undefined ? '' : argv[gi + 1]);
        gi++;
        if (gm2[1] === 'include') includes.push(val);
        else if (gm2[1] === 'exclude') excludes.push(val);
        else excludeDirs.push(val);
        continue;
      }
      /* 其余长选项（--line-buffered 之类）交给下面的常规解析 */
    }
    /* 用一个"非空数组"过滤掉上面已经吃掉的选项：重扫一遍更简单也更不容易错 */
    var consumed = {};
    for (var gi2 = 0; gi2 < argv.length; gi2++) {
      var gb = String(argv[gi2]);
      if (/^--(include|exclude|exclude-dir)=/.test(gb)) { consumed[gi2] = 1; continue; }
      if (/^--(include|exclude|exclude-dir)$/.test(gb)) { consumed[gi2] = 1; consumed[gi2 + 1] = 1; continue; }
    }
    argv = argv.filter(function (_, idx) { return !consumed[idx]; });
    function globHit(pats, name) {
      for (var p = 0; p < pats.length; p++) {
        try { if (globMatchFull(pats[p], name)) return true; } catch (e) { /* 非法模式忽略 */ }
      }
      return false;
    }
    /* 文件名是否该被搜索：有 --include 时必须在其中，且不在 --exclude 里 */
    function fileWanted(name) {
      if (excludes.length && globHit(excludes, name)) return false;
      if (includes.length && !globHit(includes, name)) return false;
      return true;
    }
    function dirWanted(name) { return !(excludeDirs.length && globHit(excludeDirs, name)); }
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      if (a === '--') { for (var k = i + 1; k < argv.length; k++) raw.push(argv[k]); break; }
      /* -A 3 / -A3 / -C2 这类带数值的上下文选项 */
      var cm = a.match(/^-([ABC])(\d*)$/);
      if (cm) {
        var num = cm[2] !== '' ? Number(cm[2]) : Number(argv[++i] || 0);
        if (cm[1] === 'A') flags.A = num;
        else if (cm[1] === 'B') flags.B = num;
        else { flags.C = num; flags.A = num; flags.B = num; }
        continue;
      }
      var em = a.match(/^-e$/);
      if (em) { patterns.push(argv[++i]); continue; }
      if (/^-[a-zA-Z]+$/.test(a)) { a.slice(1).split('').forEach(function (c) { flags[c] = true; }); continue; }
      raw.push(a);
    }
    if (!patterns.length) {
      if (!raw.length) return fail(['Usage: grep [OPTION]... PATTERNS [FILE]...']);
      patterns.push(raw.shift());
    }
    if (!patterns.length) return fail(['Usage: grep [OPTION]... PATTERNS [FILE]...']);
    files = raw;

    /* 多个模式（-e）是「或」的关系，-v 时整体取反 */
    function lineMatches(line) {
      var hit = false;
      for (var p = 0; p < patterns.length && !hit; p++) hit = grepSpans(line, patterns[p], flags).length > 0;
      return flags.v ? !hit : hit;
    }
    function lineSpans(line) {
      var s = [];
      patterns.forEach(function (p) { s = s.concat(grepSpans(line, p, flags)); });
      return s;
    }

    var out = [], err = [], matchedAny = false, anyError = false;

    /* 一个文件的扫描结果：命中行号 + 打印（含上下文） */
    function emit(lines, label, showLabel) {
      var hits = [];
      lines.forEach(function (l, idx) { if (lineMatches(l)) hits.push(idx); });
      if (hits.length) matchedAny = true;
      if (flags.q) return hits.length;

      if (flags.l || flags.L) {
        var want = flags.L ? hits.length === 0 : hits.length > 0;
        if (want) out.push(label);
        return hits.length;
      }
      if (flags.c) {
        out.push((showLabel ? label + ':' : '') + hits.length);
        return hits.length;
      }

      var prefix = function (idx, isMatch) {
        var sep = isMatch ? ':' : '-';
        var s = showLabel ? label + sep : '';
        if (flags.n) s += (idx + 1) + sep;
        return s;
      };
      if (!flags.A && !flags.B) {
        hits.forEach(function (idx) {
          if (flags.o) {
            lineSpans(lines[idx]).forEach(function (sp) { out.push(prefix(idx, true) + lines[idx].slice(sp[0], sp[1])); });
          } else {
            out.push(prefix(idx, true) + lines[idx]);
          }
        });
        return hits.length;
      }
      /* 带上下文：把命中行前后扩成若干「组」，组间用 -- 分隔（与 GNU 一致） */
      var want = {}, groups = [];
      hits.forEach(function (idx) {
        var from = Math.max(0, idx - flags.B), to = Math.min(lines.length - 1, idx + flags.A);
        var last = groups[groups.length - 1];
        if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
        else groups.push([from, to]);
      });
      groups.forEach(function (g, gi) {
        if (gi > 0) out.push('--');
        for (var idx = g[0]; idx <= g[1]; idx++) {
          want[idx] = hits.indexOf(idx) !== -1;
          out.push(prefix(idx, want[idx]) + lines[idx]);
        }
      });
      return hits.length;
    }

    if (!files.length) {
      if (!stdin) return fail(['Usage: grep [OPTION]... PATTERNS [FILE]...']);
      emit(stdin || [], '(standard input)', false);
      return { out: flags.q ? [] : out, err: [], code: matchedAny ? 0 : 1 };
    }

    files.forEach(function (f) {
      var abs = resolvePath(ctx.cwd, f);
      var node = findNode(ctx.root, abs);
      if (!node) { err.push('grep: ' + f + ': No such file or directory'); anyError = true; return; }
      if (node.type === 'dir') {
        if (!(flags.r || flags.R)) { err.push('grep: ' + f + ': Is a directory'); anyError = true; return; }
        walkFiles(node, abs, function (child, childAbs) {
          if (child.type !== 'file') return;
          /* `--include` / `--exclude` / `--exclude-dir` 在这里生效 */
          var nm = String(childAbs).slice(String(childAbs).lastIndexOf('/') + 1);
          if (!fileWanted(nm)) return;
          var parent = String(childAbs).slice(0, String(childAbs).lastIndexOf('/'));
          if (excludeDirs.length) {
            var segs = parent.split('/');
            for (var s2 = 0; s2 < segs.length; s2++) if (segs[s2] && !dirWanted(segs[s2])) return;
          }
          emit(splitLines(String(child.content)), childAbs, !flags.h);
        });
        return;
      }
      var label = files.length > 1 || flags.r || flags.R || flags.H ? abs : f;
      emit(splitLines(String(node.content)), label, files.length > 1 || flags.r || flags.R || flags.H);
    });

    if (flags.q) return { out: [], err: err, code: matchedAny ? 0 : (anyError ? 2 : 1) };
    if (anyError) return { out: out, err: err, code: 2 };
    return { out: out, err: [], code: matchedAny ? 0 : 1 };
  };

  /* zgrep：对 .gz 文件做 grep（先解压再匹配，参数与 grep 完全一致）。
     轮转日志（access.log-20240317.gz）只能这样查 —— 直接 cat 是乱码。 */
  CMDS.zgrep = function (argv, ctx, stdin, HOST) {
    /* 把 .gz 文件换成一个临时「解压视图」，再交给 grep */
    var files = argv.filter(function (a) { return a.charAt(0) !== '-' && a.indexOf('=') === -1; });
    var gzOnly = files.every(function (f) {
      var n = findNode(ctx.root, resolvePath(ctx.cwd, f));
      return n && (n.gz || n.type === 'dir');
    });
    if (!files.length || !gzOnly) {
      /* 参数里混了非 gz 文件时也照常处理：grep 自己能读纯文本 */
      return CMDS.grep(argv, ctx, stdin, HOST);
    }
    var saved = [];
    files.forEach(function (f) {
      var n = findNode(ctx.root, resolvePath(ctx.cwd, f));
      if (n && n.gz) { saved.push([n, n.content, n.gz]); n.gz = false; }
    });
    var res = CMDS.grep(argv, ctx, stdin, HOST);
    saved.forEach(function (s) { s[0].gz = true; s[0].content = s[1]; });
    return res;
  };

  function walkFiles(node, abs, cb) {
    var names = childrenSorted(node);
    names.forEach(function (n) {
      var c = node.children[n];
      var p = (abs === '/' ? '' : abs) + '/' + n;
      cb(c, p);
      if (c.type === 'dir') walkFiles(c, p, cb);
    });
  }

  /* ---------- echo ---------- */
  CMDS.echo = function (argv, ctx, stdin, HOST) {
    /* echo 是内建命令，真机上 `echo` 与 `/bin/echo` 行为略有差别（内建不解析 -e 之外的选项） */
    var args = argv.slice();
    var noNewline = false, interpret = false;
    while (args.length && /^-[neE]+$/.test(args[0])) {
      if (args[0].indexOf('n') !== -1) noNewline = true;
      if (args[0].indexOf('e') !== -1) interpret = true;
      if (args[0] === '-E') interpret = false;
      args.shift();
    }
    var text = args.join(' ');
    if (interpret) {
      text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    }
    return { out: interpret && text.indexOf('\n') !== -1 ? text.split('\n') : [text], err: [], code: 0, noNewline: noNewline };
  };

  /* sudo：教学环境里本来就是 root，所以要如实说明"没提升也没有降权"，
     而不是报 command not found —— docs 里 `echo ... | sudo tee -a /etc/...` 很常见。

     注意**不能**把整行丢回 shell 重新执行：那样管道里的标准输入就断了，
     `... | sudo tee file` 会写出一个空文件（又是一个静默错误）。
     正确做法是就地取出被包裹的命令，用同一份 stdin 直接调用它。 */
  CMDS.sudo = function (argv, ctx, stdin, HOST) {
    var rest = [];
    var runAs = null;
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      if (a === '-u' || a === '--user' || a === '-g' || a === '--group') {
        /* `-u <用户>` 要记住是谁 —— 真机上它决定以哪个身份执行 */
        if (a === '-u' || a === '--user') runAs = String(argv[i + 1] || '');
        i++; continue;
      }
      if (/^(-u|-g|--user=|--group=)/.test(a)) {
        if (/^(-u|--user)/.test(a)) runAs = a.replace(/^(-u|--user=?)/, '');
        continue;
      }
      if (/^-[inEHkbV]+$/.test(a)) continue;
      if (a === '--') continue;
      rest.push(a);
    }
    /* `sudo -l [-U 用户]`：列出"这个用户能提权做什么"。
       ⚠️ 站内 lu-sudo 记录教的正是这条 —— 审计"谁能提权"的第一步。
       早先 `-l` 落进位置参数，被当成命令名，报 `sudo: -l: command not found`，
       而它明明是 sudo 最常用的选项之一。 */
    var listMode = argv.indexOf('-l') !== -1 || argv.indexOf('--list') !== -1;
    if (listMode) {
      var who = runAs || 'root';
      for (var li = 0; li < argv.length; li++) {
        if (argv[li] === '-U' || argv[li] === '--other-user') who = String(argv[li + 1] || who);
      }
      var outL = ['Matching Defaults entries for ' + who + ' on ' + (HOST.hostname || 'localhost') + ':',
        '    !visiblepw, always_set_home, env_reset, env_editor, secure_path=/sbin\\:/bin\\:/usr/sbin\\:/usr/bin'];
      if (who === 'deploy') {
        outL.push('');
        outL.push('User deploy may run the following commands on ' + (HOST.hostname || 'localhost') + ':');
        outL.push('    (root) NOPASSWD: /bin/systemctl restart myapp, /bin/systemctl stop myapp, /bin/systemctl start myapp');
        outL.push('');
        outL.push('（教学环境）注意这里**只放行了三条具体命令** —— 这就是最小权限的写法：');
        outL.push('即使 deploy 账号被攻破，攻击者也只能重启这一个服务，拿不到整台机器。');
      } else {
        outL.push('');
        outL.push('User ' + who + ' may run the following commands on ' + (HOST.hostname || 'localhost') + ':');
        outL.push('    (ALL : ALL) ALL');
      }
      return ok(outL);
    }
    if (!rest.length) {
      return fail(['usage: sudo -h | -K | -k | -V',
                   '（教学环境已经是 ' + (HOST.user || 'root') + ' 身份，直接用 root 权限操作）']);
    }
    /* `sudo !!`：`!!` 是 shell 的历史展开，表示"上一条命令"。
       站内 lb-history 与 lu-sudo 两条记录都在教这个"忘了加 sudo"的补救写法。 */
    if (rest[0] === '!!' || rest[0] === '!!*') {
      var hist = (ctx.shell && ctx.shell.history) || [];
      var lastCmd = null;
      for (var hi = hist.length - 1; hi >= 0; hi--) {
        var h = String(hist[hi] || '').trim();
        if (h && h.indexOf('sudo !!') === -1 && h.indexOf('!!') === -1) { lastCmd = h; break; }
      }
      if (!lastCmd) return fail(['sudo: !!: 教学环境里没有可复用的上一条命令']);
      var sub = ctx.shell.exec(lastCmd);
      return { out: (sub.out || []).concat(['',
        '（sudo !!）执行的其实是上一条命令：`' + lastCmd + '` ——',
        '它是 shell 的**历史展开**，不是 sudo 的功能；补 sudo 时最省事，但也最容易在执行前没看清上一条是什么。']),
        err: sub.err || [], code: sub.code };
    }
    var name = rest[0];
    var args = rest.slice(1);
    if (ALIAS[name] && typeof ALIAS[name] === 'string') {
      var exp = tokenize(ALIAS[name]);
      name = exp[0];
      args = exp.slice(1).concat(args);
    }
    if (name === 'sh' || name === 'bash') {
      return fail(['sudo: 教学环境不支持 `' + name + ' -c "..."` 这种再包一层的写法',
                   '（把里面的命令直接写出来即可，本来就是 root）']);
    }
    /* 用路径调用时按 basename 找实现（与 _execOne 同一条规则）：
       `sudo /usr/sbin/nginx -t` 里的 `/usr/sbin/nginx` 就是 nginx。 */
    if (!CMDS[name] && name.indexOf('/') !== -1) {
      var base = name.slice(name.lastIndexOf('/') + 1);
      if (CMDS[base]) name = base;
    }
    var impl = CMDS[name] || (name === 'firewall-cmd' ? CMDS.firewall_cmd : null);
    if (!impl) {
      if (NOT_IMPL[name]) return fail(['sudo: ' + name + ': ' + NOT_IMPL[name]]);
      return { out: [], err: ['sudo: ' + name + ': command not found'], code: 127 };
    }
    var resS = impl(expandGlobs(args, ctx), ctx, stdin, HOST);
    if (runAs && runAs !== 'root' && resS && !resS.code) {
      resS = { out: resS.out || [], err: resS.err || [], code: resS.code };
      resS.out = resS.out.concat(['（教学环境）这条是以 **' + runAs + '** 身份执行的（真机上 sudo -u 就是切到该用户）——',
        '权限不足的报错往往就出在这里：root 能跑、' + runAs + ' 跑不了。']);
    }
    return resS;
  };

  /* tee：把标准输入同时写到标准输出与文件。
     参数：-a 追加；多个文件依次写。 */
  CMDS.tee = function (argv, ctx, stdin, HOST) {
    var append = false;
    var files = [];
    argv.forEach(function (a) {
      if (/^-[aiu]+$/.test(a)) { if (a.indexOf('a') !== -1) append = true; return; }
      if (a.charAt(0) === '-') return;
      files.push(a);
    });
    var lines = stdin || [];
    if (!files.length) return ok(lines);
    var err = [];
    files.forEach(function (f) {
      var abs = resolvePath(ctx.cwd, f);
      var node = findNode(ctx.root, abs);
      if (!node) {
        /* 父目录存在就按真实 tee 一样创建文件 */
        var dir = findNode(ctx.root, parentOf(abs));
        if (!dir || dir.type !== 'dir') { err.push('tee: ' + f + ': No such file or directory'); return; }
        node = newNode('file', baseName(abs));
        node.user = HOST.user || 'root';
        dir.children[baseName(abs)] = node;
      }
      if (node.type === 'dir') { err.push('tee: ' + f + ': Is a directory'); return; }
      var text = lines.join('\n');
      if (text !== '') text += '\n';
      node.content = append ? String(node.content || '') + text : text;
    });
    if (err.length) return { out: lines, err: err, code: 1 };
    return ok(lines);
  };

  /* ---------- mkdir / touch / rm / cp / mv / ln ---------- */
  CMDS.mkdir = function (argv, ctx, stdin, HOST) {
    var p = argv.indexOf('-p') !== -1;
    var targets = argv.filter(function (a) { return a.charAt(0) !== '-'; });
    if (!targets.length) return fail(['mkdir: missing operand']);
    var err = [];
    targets.forEach(function (t) {
      var abs = resolvePath(ctx.cwd, t);
      var parent = findNode(ctx.root, parentOf(abs));
      if (!parent) {
        if (!p) { err.push('mkdir: cannot create directory \'' + t + '\': No such file or directory'); return; }
        /* -p 递归创建 */
        var segs = segments(abs), cur = ctx.root, curPath = '';
        for (var i = 0; i < segs.length; i++) {
          curPath += '/' + segs[i];
          if (!cur.children[segs[i]]) {
            var nn = newNode('dir', segs[i]);
            nn.mode = applyUmask(ctx, 0o777);
            nn.mtime = fmtNow();
            cur.children[segs[i]] = nn;
          }
          cur = cur.children[segs[i]];
          if (cur.type !== 'dir') { err.push('mkdir: cannot create directory \'' + t + '\': Not a directory'); return; }
        }
        return;
      }
      if (parent.children[baseName(abs)]) { err.push('mkdir: cannot create directory \'' + t + '\': File exists'); return; }
      var nd = newNode('dir', baseName(abs));
      nd.mode = applyUmask(ctx, 0o777);
      nd.mtime = fmtNow();
      parent.children[baseName(abs)] = nd;
    });
    return err.length ? { out: [], err: err, code: 1 } : ok([]);
  };

  /* 新建文件时的默认权限 = 0666 减掉 umask，新建目录 = 0777 减掉 umask。
     这是 umask 命令**唯一能被验证的方式** —— 没有它，`umask 077 && touch f && ls -l f`
     仍然显示 644，学员根本看不出 umask 起作用了（而站内 lu-umask 的示例正是这么写的）。
     umask 存在 shell 的 env 里（`__UMASK`），默认 022。 */
  function applyUmask(ctx, baseOct) {
    var m = (ctx.env && ctx.env.__UMASK) || '022';
    var mask = parseInt(m, 8);
    if (isNaN(mask)) mask = 0o022;
    return ((baseOct & ~mask) & 0o777).toString(8).padStart(3, '0');
  }

  CMDS.touch = function (argv, ctx, stdin, HOST) {
    var targets = argv.filter(function (a) { return a.charAt(0) !== '-'; });
    if (!targets.length) return fail(['touch: missing file operand']);
    var err = [];
    targets.forEach(function (t) {
      var abs = resolvePath(ctx.cwd, t);
      var node = findNode(ctx.root, abs);
      if (node) { node.mtime = fmtNow(); return; }
      var parent = findNode(ctx.root, parentOf(abs));
      if (!parent) { err.push('touch: cannot touch \'' + t + '\': No such file or directory'); return; }
      var nf = newNode('file', baseName(abs));
      nf.content = '';
      nf.mode = applyUmask(ctx, 0o666);
      nf.mtime = fmtNow();
      parent.children[baseName(abs)] = nf;
    });
    return err.length ? { out: [], err: err, code: 1 } : ok([]);
  };

  CMDS.rm = function (argv, ctx, stdin, HOST) {
    var flags = { r: false, R: false, f: false, i: false, d: false };
    var targets = [];
    argv.forEach(function (a) {
      if (/^-[a-zA-Z]+$/.test(a)) a.slice(1).split('').forEach(function (c) { flags[c] = true; });
      else targets.push(a);
    });
    if (!targets.length) return fail(['rm: missing operand']);
    var err = [], out = [];
    targets.forEach(function (t) {
      var abs = resolvePath(ctx.cwd, t);
      var parent = findNode(ctx.root, parentOf(abs));
      var name = baseName(abs);
      var node = parent ? parent.children[name] : null;
      if (!node) {
        if (!flags.f) err.push('rm: cannot remove \'' + t + '\': No such file or directory');
        return;
      }
      if (node.type === 'dir' && !(flags.r || flags.R || flags.d)) {
        err.push('rm: cannot remove \'' + t + '\': Is a directory');
        return;
      }
      delete parent.children[name];
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  function copyNode(node) {
    var c = newNode(node.type, node.name);
    c.content = node.content; c.mode = node.mode; c.user = node.user;
    c.group = node.group; c.mtime = node.mtime; c.target = node.target;
    c.explicitSize = node.explicitSize;
    if (node.type === 'dir') {
      for (var k in node.children) c.children[k] = copyNode(node.children[k]);
    }
    return c;
  }

  CMDS.cp = function (argv, ctx, stdin, HOST) {
    var flags = { r: false, R: false, a: false, f: false, v: false };
    var rest = [];
    argv.forEach(function (a) {
      if (/^-[a-zA-Z]+$/.test(a)) a.slice(1).split('').forEach(function (c) { flags[c] = true; });
      else rest.push(a);
    });
    if (rest.length < 2) return fail(['cp: missing destination file operand after \'' + (rest[0] || '') + '\'']);
    var dst = rest.pop();
    var err = [], out = [];
    var dstAbs = resolvePath(ctx.cwd, dst);
    var dstNode = findNode(ctx.root, dstAbs);

    rest.forEach(function (src) {
      var srcAbs = resolvePath(ctx.cwd, src);
      var s = findNode(ctx.root, srcAbs);
      if (!s) { err.push('cp: cannot stat \'' + src + '\': No such file or directory'); return; }
      if (s.type === 'dir' && !(flags.r || flags.R || flags.a)) { err.push('cp: -r not specified; omitting directory \'' + src + '\''); return; }
      var targetParentAbs, targetName;
      if (dstNode && dstNode.type === 'dir') { targetParentAbs = dstAbs; targetName = baseName(srcAbs) === '' ? baseName(srcAbs) : (srcAbs === '/' ? '/' : srcAbs.split('/').pop()); }
      else { targetParentAbs = parentOf(dstAbs); targetName = baseName(dstAbs); }
      var discard = String(dst).indexOf('/dev/') === 0;   /* cp x /dev/null 之类：只做丢弃，不落盘 */
      var tp = discard ? { type: 'dir', children: {} } : findNode(ctx.root, targetParentAbs);
      if (!tp) { err.push('cp: cannot create regular file \'' + dst + '\': No such file or directory'); return; }
      var copy = copyNode(s);
      copy.name = targetName;
      copy.mtime = fmtNow();
      tp.children[targetName] = copy;
      if (flags.v) out.push('\'' + src + '\' -> \'' + dst + '\'');
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  CMDS.mv = function (argv, ctx, stdin, HOST) {
    var flags = { f: false, v: false, n: false };
    var rest = [];
    argv.forEach(function (a) {
      if (/^-[a-zA-Z]+$/.test(a)) a.slice(1).split('').forEach(function (c) { flags[c] = true; });
      else rest.push(a);
    });
    if (rest.length < 2) return fail(['mv: missing destination file operand after \'' + (rest[0] || '') + '\'']);
    var dst = rest.pop();
    var err = [], out = [];
    var dstAbs = resolvePath(ctx.cwd, dst);
    var dstNode = findNode(ctx.root, dstAbs);

    rest.forEach(function (src) {
      var srcAbs = resolvePath(ctx.cwd, src);
      var s = findNode(ctx.root, srcAbs);
      if (!s) { err.push('mv: cannot stat \'' + src + '\': No such file or directory'); return; }
      var srcParent = findNode(ctx.root, parentOf(srcAbs));
      var targetParentAbs, targetName;
      if (dstNode && dstNode.type === 'dir') { targetParentAbs = dstAbs; targetName = srcAbs.split('/').pop(); }
      else { targetParentAbs = parentOf(dstAbs); targetName = baseName(dstAbs); }
      var tp = findNode(ctx.root, targetParentAbs);
      if (!tp) { err.push('mv: cannot move \'' + src + '\' to \'' + dst + '\': No such file or directory'); return; }
      delete srcParent.children[baseName(srcAbs)];
      s.name = targetName;
      tp.children[targetName] = s;
      if (flags.v) out.push('renamed \'' + src + '\' -> \'' + dst + '\'');
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  CMDS.ln = function (argv, ctx, stdin, HOST) {
    /* ⚠️ 选项必须按**合并写法**解析。早先这里只写 `argv.indexOf('-s') !== -1`，
       于是 `-sfn` 这种最常见的组合（原子切换版本软链的标准写法）识别不到 -s，
       整条命令退化成"建硬链接"——把一个软链**变成一个 0 字节的普通文件**。
       站内 lb-ln 的示例正在教 `ln -sfn`（"原子切换版本链接，-n 防止在旧版本目录里再建一个链接"），
       也就是说：**教材在用、引擎把链接改坏了**，而且不报错。
       顺带补齐真机的几条语义：
         -f 覆盖已存在的目标；-n 把"指向目录的软链"当成普通文件替换（不在里面再建一层）；
         目标已存在且是目录（且没加 -n）时，链接建在**目录里面**（用目标的 basename）。 */
    var symbolic = false, force = false, noDeref = false, verbose = false, targetDir = null, physical = false;
    var positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--symbolic') { symbolic = true; continue; }
      if (a === '--force') { force = true; continue; }
      if (a === '--no-dereference') { noDeref = true; continue; }
      if (a === '--verbose') { verbose = true; continue; }
      if (a === '-t' || a === '--target-directory') { targetDir = String(argv[++i]); continue; }
      if (/^-t.+/.test(a)) { targetDir = a.slice(2); continue; }
      if (a === '-T' || a === '--no-target-directory') { physical = true; continue; }
      if (a === '--relative') continue;
      if (/^-[a-zA-Z]+$/.test(a)) {
        a.slice(1).split('').forEach(function (c) {
          if (c === 's') symbolic = true;
          else if (c === 'f') force = true;
          else if (c === 'n') noDeref = true;
          else if (c === 'v') verbose = true;
          else if (c === 'b' || c === 'S' || c === 'L' || c === 'P' || c === 'r' || c === 'i') { /* 接受但无副作用 */ }
        });
        continue;
      }
      if (a.charAt(0) === '-' && a.length > 1) return fail(['ln: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
        'Try \'ln --help\' for more information.']);
      positional.push(a);
    }
    if (!positional.length) return fail(['ln: missing file operand', 'Try \'ln --help\' for more information.']);
    var target, linkName;
    if (targetDir !== null) {
      if (positional.length < 1) return fail(['ln: missing file operand']);
      target = positional[0];
      linkName = targetDir + '/' + baseName(target);
    } else {
      if (positional.length < 2) return fail(['ln: missing destination file operand after \'' + positional[0] + '\'',
        'Try \'ln --help\' for more information.']);
      target = positional[0];
      linkName = positional[1];
    }
    var linkAbs = resolvePath(ctx.cwd, linkName);
    var existing = findNode(ctx.root, linkAbs);
    /* 目标已存在且是目录（且没加 -n / -T）→ 链接建在目录里面 */
    if (existing && existing.type === 'dir' && !noDeref && !physical && targetDir === null) {
      linkAbs = linkAbs + '/' + baseName(resolvePath(ctx.cwd, target));
      existing = findNode(ctx.root, linkAbs);
    }
    var parent = findNode(ctx.root, parentOf(linkAbs));
    if (!parent) return fail(['ln: failed to create symbolic link \'' + linkName + '\': No such file or directory']);
    var name = baseName(linkAbs);
    if (existing) {
      if (!force) return fail(['ln: failed to create symbolic link \'' + linkName + '\': File exists']);
      if (existing.type === 'dir') return fail(['ln: cannot overwrite directory \'' + linkName + '\'']);
      delete parent.children[name];          /* -f：先删掉旧的（软链也一样） */
    }
    var n = newNode(symbolic ? 'link' : 'file', name);
    if (symbolic) n.target = target;
    else {
      var t = findNode(ctx.root, resolvePath(ctx.cwd, target));
      if (!t) return fail(['ln: failed to access \'' + target + '\': No such file or directory']);
      if (t.type === 'dir') return fail(['ln: \'' + target + '\': hard link not allowed for directory']);
      n.content = t.content;
      n.mode = t.mode; n.user = t.user; n.group = t.group;
    }
    n.mtime = fmtNow();
    parent.children[name] = n;
    if (verbose) return ok(['\'' + linkName + '\' -> \'' + target + '\'']);
    return ok([]);
  };

  /* ---------- find ---------- */
  CMDS.find = function (argv, ctx, stdin, HOST) {
    var start = '.', tests = [], actions = [], unsupported = [];
    var i = 0;
    if (argv.length && argv[0].charAt(0) !== '-') { start = argv[0]; i = 1; }
    for (; i < argv.length; i++) {
      var a = argv[i];
      /* ⚠️ k 必须存**去掉横线**的名字：早先这里存的是 '-name'，而 visit() 里比的是
         'name'，于是 `find /data -type f -name "*.log"` 的条件**被静默忽略**，
         README.md / app.jar 全被列出来 —— 学员会得出完全错误的结论。
         静默错误比报错危险得多，这类不一致在加 -perm 时又踩了一次。 */
      if (a === '-name' || a === '-iname') { tests.push({ k: a.slice(1), v: argv[++i] }); }
      else if (a === '-type') { tests.push({ k: 'type', v: argv[++i] }); }
      else if (a === '-mtime') { tests.push({ k: 'mtime', v: argv[++i] }); }
      else if (a === '-size') { tests.push({ k: 'size', v: argv[++i] }); }
      else if (a === '-perm') { tests.push({ k: 'perm', v: argv[++i] }); }
      else if (a === '-user') { tests.push({ k: 'user', v: argv[++i] }); }
      else if (a === '-maxdepth') { tests.push({ k: 'maxdepth', v: argv[++i] }); }
      else if (a === '-print') { actions.push('print'); }
      else if (a === '-delete') { actions.push('delete'); }
      else if (a === '-exec') {
        var cmdParts = [];
        i++;
        while (i < argv.length && argv[i] !== ';' && argv[i] !== '\\;') { cmdParts.push(argv[i]); i++; }
        actions.push({ exec: cmdParts });
      } else if (a.charAt(0) === '-') {
        /* 不认识的选项**必须报出来**，不能默默忽略 ——
           默默忽略会让 `find / -perm -4000` 这种查询返回全部文件，
           学员据此得出的判断完全是反的。 */
        unsupported.push(a);
      }
    }
    if (unsupported.length) {
      return fail(['find: 教学环境未实现这些选项：' + unsupported.join(' ') +
        '（支持 -name/-iname/-type/-mtime/-size/-perm/-user/-maxdepth/-print/-delete/-exec）']);
    }
    var errs = [];
    /* find 的 -exec rm -f {} \; 在教学环境里不真删，只报告 */
    var destructive = actions.some(function (x) { return x && x.exec && /^(rm|mv|chmod|chown)$/.test(x.exec[0]); });
    if (destructive) {
      errs.push('find: 教学环境为安全起见不会真的执行 ' + actions.filter(function (x) { return x && x.exec; })[0].exec[0] + '，仅展示将要处理的文件：');
    }

    var abs = resolvePath(ctx.cwd, start);
    var root = findNode(ctx.root, abs);
    if (!root) return fail(['find: \'' + start + '\': No such file or directory']);

    var out = [];
    var maxdepth = null;
    tests.forEach(function (t) { if (t.k === 'maxdepth') maxdepth = Number(t.v); });

    function matchName(name, pat) {
      var re = new RegExp('^' + String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return re.test(name);
    }

    function matchMtime(isoish, expr) {
      /* 用固定"当前时间"换算天数差；mtime 形如 2024-03-18 09:00 */
      var t = Date.parse(String(isoish).replace(' ', 'T') + ':00+08:00');
      if (isNaN(t)) return true;
      var days = Math.floor((NOW - t) / 86400000);
      var m = String(expr).match(/^([+-]?)(\d+)$/);
      if (!m) return true;
      var n = Number(m[2]);
      if (m[1] === '+') return days > n;
      if (m[1] === '-') return days < n;
      return days === n;
    }

    function matchSize(bytes, expr) {
      var m = String(expr).match(/^([+-]?)(\d+)([ckMG]?)$/);
      if (!m) return true;
      var n = Number(m[2]);
      var unit = m[3] || 'c';
      var mult = unit === 'c' ? 1 : unit === 'k' ? 1024 : unit === 'M' ? 1048576 : 1073741824;
      /* find 的 -size 以块为单位向上取整，这里按单位字节近似比较 */
      var target = n * mult;
      if (m[1] === '+') return bytes > target;
      if (m[1] === '-') return bytes < target;
      return bytes <= target && bytes > target - mult;
    }

    function typeMatch(node, v) {
      if (v === 'f') return node.type === 'file';
      if (v === 'd') return node.type === 'dir';
      if (v === 'l') return node.type === 'link';
      return true;
    }

    /* 权限数字：node.mode 是 '644' / '1777' 这种字符串，缺省文件 644、目录 755 */
    function modeNum(node) {
      var m = String(node.mode || (node.type === 'dir' ? '755' : '644'));
      return parseInt(m, 8);
    }

    /* find -perm 的三种形式（与真机语义一致）：
         -perm 644   完全相等
         -perm -644  这些位**全部**要有（最常用：-perm -4000 找 SUID）
         -perm /111  这些位**任意一个**有即可
       早先这个选项被直接忽略，于是 `find / -perm -4000 -type f` 返回**全部文件**，
       学员会得出"系统里到处是 SUID 程序"这种完全反了的结论。 */
    function matchPerm(node, expr) {
      var s = String(expr);
      if (!/^[-/]?[0-7]+$/.test(s)) return true;
      var kind = 'exact';
      if (s.charAt(0) === '-') { kind = 'all'; s = s.slice(1); }
      else if (s.charAt(0) === '/') { kind = 'any'; s = s.slice(1); }
      var want = parseInt(s, 8);
      var have = modeNum(node);
      if (kind === 'all') return (have & want) === want;
      if (kind === 'any') return (have & want) !== 0;
      return have === want;
    }

    function visit(node, path, depth) {
      var okAll = true;
      tests.forEach(function (t) {
        if (t.k === 'name') okAll = okAll && matchName(node.name, t.v);
        else if (t.k === 'iname') okAll = okAll && matchName(node.name.toLowerCase(), String(t.v).toLowerCase());
        else if (t.k === 'type') okAll = okAll && typeMatch(node, t.v);
        else if (t.k === 'mtime') okAll = okAll && matchMtime(node.mtime, t.v);
        else if (t.k === 'size') okAll = okAll && (node.type === 'file') && matchSize(sizeOf(node), t.v);
        else if (t.k === 'perm') okAll = okAll && matchPerm(node, t.v);
        else if (t.k === 'user') okAll = okAll && String(node.user || 'root') === String(t.v);
      });
      if (okAll && !(maxdepth !== null && depth > maxdepth)) {
        if (actions.length) {
          actions.forEach(function (act) {
            if (act === 'print' || act === undefined) out.push(path);
            else if (act === 'delete') out.push(path + '   （教学环境不会真删）');
            else if (act && act.exec) out.push(act.exec.map(function (x) { return x === '{}' ? path : x; }).join(' '));
          });
        } else out.push(path);
      }
      if (node.type === 'dir') {
        childrenSorted(node).forEach(function (n) {
          visit(node.children[n], (path === '/' ? '' : path) + '/' + n, depth + 1);
        });
      }
    }
    visit(root, abs === '' ? '/' : abs, 0);
    return { out: errs.concat(out), err: [], code: 0 };
  };

  /* ---------- wc ---------- */
  CMDS.wc = function (argv, ctx, stdin, HOST) {
    var flags = { l: false, w: false, c: false };
    var files = [];
    argv.forEach(function (a) {
      if (/^-[lwc]+$/.test(a)) a.slice(1).split('').forEach(function (c) { flags[c] = true; });
      else files.push(a);
    });
    if (!flags.l && !flags.w && !flags.c) { flags.l = flags.w = flags.c = true; }
    function count(lines, label) {
      var text = lines.join('\n');
      var parts = [];
      if (flags.l) parts.push(String(lines.length).padStart(7, ' '));
      if (flags.w) parts.push(String(text.split(/\s+/).filter(Boolean).length).padStart(7, ' '));
      if (flags.c) parts.push(String(text.length).padStart(7, ' '));
      return parts.join('') + (label ? ' ' + label : '');
    }
    if (!files.length) return ok([count(stdin || [])]);
    var out = [], err = [];
    files.forEach(function (f) {
      var r = readFileOrErr(ctx, f);
      if (r.err) { err.push(r.err.replace(/^cat:/, 'wc:')); return; }
      out.push(count(splitLines(r.content), f));
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  /* ---------- sort / uniq / cut / tr ---------- */
  CMDS.sort = function (argv, ctx, stdin, HOST) {
    var flags = { n: false, r: false, u: false, h: false };
    var files = [];
    var outFile = null;
    /* ⚠️ `-T`（临时目录）与 `-S`（缓冲区大小）是**带值选项**，必须连值一起吃掉。
       早先它们既不被识别成选项、值又因为不以 `-` 开头被当成"要排序的文件"：
         sort -u -T /data/tmp -S 2G /data/logs/all-ids.txt
       于是报 `sort: /data/tmp: Is a directory` —— 明明参数完全正确。
       注意带值选项要在"合并字母选项"**之前**判断。

       ⚠️ `-o 文件` 同样带值，但它**必须真的写文件**：只把它从参数里吃掉、
       不产生输出文件，就是"命令成功退出、该出现的文件却不存在"——
       站内 `sort -u "$f" -o "$f.u"` 这条示例正是这么用的，
       后面的 `sort -m ./part-*.u` 会因为一个 .u 都没有而整条链断掉。 */
    for (var si = 0; si < argv.length; si++) {
      var a = String(argv[si]);
      if (a === '-o' || a === '--output') { outFile = String(argv[++si]); continue; }
      if (/^-o(.+)$/.test(a)) { outFile = a.slice(2); continue; }
      if (a === '-T' || a === '--temporary-directory' || a === '-S' || a === '--buffer-size' ||
        a === '-k' || a === '--key' || a === '-t' || a === '--field-separator') { si++; continue; }
      if (/^-T.+/.test(a) || /^-S.+/.test(a) || /^-k.+/.test(a) || /^-t.+/.test(a)) continue;
      if (/^-[nruh]+$/.test(a)) a.slice(1).split('').forEach(function (c) { flags[c] = true; });
      else if (a.charAt(0) !== '-') files.push(a);
    }
    var lines = stdin || [];
    if (files.length) {
      var r = readFileOrErr(ctx, files[0]);
      if (r.err) return fail([r.err.replace(/^cat:/, 'sort:')]);
      lines = splitLines(r.content);
    }
    var arr = lines.slice();
    /* `sort -h` 认 K/M/G/T 这些人类可读单位。早先 flags.h 被解析了但比较仍是
       字典序，于是 `du -sh /data/* | sort -rh` 给出的顺序是
       `8.0K / 5.9G / 245.5M` —— **看着像成功，顺序全错**。
       这是运维里最常见的一条管道之一，学员照着抄会以为"目录不大"。 */
    function humanBytes(str) {
      var m = String(str).match(/^\s*([\d.]+)\s*([KMGTPE]?)i?B?/i);
      if (!m) return null;
      var n = parseFloat(m[1]);
      if (isNaN(n)) return null;
      var unit = (m[2] || '').toUpperCase();
      var mult = { '': 1, K: 1024, M: 1048576, G: 1073741824, T: 1099511627776, P: 1125899906842624, E: 1152921504606846976 }[unit] || 1;
      return n * mult;
    }
    if (flags.n) {
      arr.sort(function (a, b) {
        var na = parseFloat(String(a).replace(/^\s+/, '')), nb = parseFloat(String(b).replace(/^\s+/, ''));
        if (isNaN(na)) na = 0;
        if (isNaN(nb)) nb = 0;
        return na - nb;
      });
    } else if (flags.h) {
      arr.sort(function (a, b) {
        var ha = humanBytes(a), hb = humanBytes(b);
        if (ha === null || hb === null) return String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0);
        return ha - hb;
      });
    } else {
      arr.sort();
    }
    if (flags.r) arr.reverse();
    if (flags.u) {
      var seen = {}, uniq = [];
      arr.forEach(function (l) { if (!seen[l]) { seen[l] = 1; uniq.push(l); } });
      arr = uniq;
    }
    /* `-o 文件`：把结果写进文件，**标准输出为空**（真 sort 的行为）。
       站内示例 `sort -u "$f" -o "$f.u"` 依赖它真的产出文件。 */
    if (outFile !== null) {
      var oAbs = resolvePath(ctx.cwd, outFile);
      var oParent = findNode(ctx.root, parentOf(oAbs));
      if (!oParent) return fail(['sort: cannot create ' + outFile + ': No such file or directory'], 2);
      var oName = baseName(oAbs);
      var body = arr.join('\n') + (arr.length ? '\n' : '');
      var oExisting = oParent.children[oName];
      if (oExisting && oExisting.type === 'file') { oExisting.content = body; oExisting.mtime = fmtNow(); }
      else {
        var oNode = newNode('file', oName);
        oNode.content = body;
        oNode.mode = '644'; oNode.user = 'root'; oNode.group = 'root';
        oNode.mtime = fmtNow();
        oParent.children[oName] = oNode;
      }
      return ok([]);
    }
    return ok(arr);
  };

  CMDS.uniq = function (argv, ctx, stdin, HOST) {
    var c = argv.indexOf('-c') !== -1;
    var d = argv.indexOf('-d') !== -1;
    var lines = stdin || [];
    var files = argv.filter(function (a) { return a.charAt(0) !== '-'; });
    if (files.length) {
      var r = readFileOrErr(ctx, files[0]);
      if (r.err) return fail([r.err.replace(/^cat:/, 'uniq:')]);
      lines = splitLines(r.content);
    }
    var out = [], prev = null, n = 0;
    function flush() {
      if (prev === null) return;
      if (d && n < 2) return;
      out.push((c ? String(n).padStart(7, ' ') + ' ' : '') + prev);
    }
    lines.forEach(function (l) {
      if (l === prev) { n++; return; }
      flush();
      prev = l; n = 1;
    });
    flush();
    return ok(out);
  };

  CMDS.cut = function (argv, ctx, stdin, HOST) {
    var delim = '\t', fields = null;
    for (var i = 0; i < argv.length; i++) {
      if (argv[i] === '-d') delim = argv[++i];
      else if (argv[i].indexOf('-d') === 0 && argv[i].length > 2) delim = argv[i].slice(2);
      else if (argv[i] === '-f') fields = argv[++i];
      else if (argv[i].indexOf('-f') === 0 && argv[i].length > 2) fields = argv[i].slice(2);
    }
    if (!fields) return fail(['cut: you must specify a list of bytes, characters, or fields']);
    var idxs = [];
    String(fields).split(',').forEach(function (part) {
      var m = part.match(/^(\d+)-(\d+)$/);
      if (m) { for (var k = Number(m[1]); k <= Number(m[2]); k++) idxs.push(k - 1); }
      else idxs.push(Number(part) - 1);
    });
    var lines = stdin || [];
    var files = [];
    for (var j = 0; j < argv.length; j++) {
      if (argv[j] === '-f' || argv[j] === '-d') { j++; continue; }
      if (argv[j].charAt(0) !== '-') files.push(argv[j]);
    }
    if (files.length) {
      var r = readFileOrErr(ctx, files[0]);
      if (r.err) return fail([r.err.replace(/^cat:/, 'cut:')]);
      lines = splitLines(r.content);
    }
    var out = lines.map(function (l) {
      var parts = l.split(delim);
      return idxs.map(function (k) { return parts[k] !== undefined ? parts[k] : ''; }).join(delim);
    });
    return ok(out);
  };

  CMDS.tr = function (argv, ctx, stdin, HOST) {
    /* -d 是真选项；'a-z' 这类操作数是数据，不能被当成选项过滤掉 */
    var del = argv.indexOf('-d') !== -1;
    var rest = argv.filter(function (a) { return a !== '-d' && a !== '-s' && a !== '-c'; });
    var lines = stdin || [];
    if (!lines.length) {
      return ok(['（tr 需要标准输入：写成 `cat 文件 | tr a-z A-Z`）']);
    }
    if (del) {
      var chars = rest[0] || '';
      return ok(lines.map(function (l) {
        return l.split('').filter(function (ch) { return chars.indexOf(ch) === -1; }).join('');
      }));
    }
    if (rest.length < 2) return fail(['tr: missing operand']);
    var from = rest[0], to = rest[1];
    /* 支持 a-z 这种区间写法 */
    function expand(set) {
      var out = '';
      for (var i = 0; i < set.length; i++) {
        if (set[i + 1] === '-' && set[i + 2] !== undefined) {
          var a = set.charCodeAt(i), b = set.charCodeAt(i + 2);
          for (var c = a; c <= b; c++) out += String.fromCharCode(c);
          i += 2;
        } else out += set[i];
      }
      return out;
    }
    var F = expand(from), T = expand(to);
    return ok(lines.map(function (l) {
      return l.split('').map(function (ch) {
        var i = F.indexOf(ch);
        if (i === -1) return ch;
        return T[i] !== undefined ? T[i] : T.charAt(T.length - 1);
      }).join('');
    }));
  };

  /* ---------- awk（教学子集） ---------- */
  CMDS.awk = function (argv, ctx, stdin, HOST) {
    var fs = null, program = null, files = [], vars = {};
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      if (a === '-F') { fs = argv[++i]; continue; }
      if (a.indexOf('-F') === 0 && a.length > 2) { fs = a.slice(2); continue; }
      if (a === '-v') {
        var assign = String(argv[++i] || '').match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (assign) vars[assign[1]] = /^-?\d+(\.\d+)?$/.test(assign[2]) ? Number(assign[2]) : assign[2];
        continue;
      }
      if (program === null && a.charAt(0) !== '-') { program = a; continue; }
      if (a.charAt(0) !== '-') files.push(a);
    }
    if (program === null) return fail(['awk: no program given']);
    var lines = stdin || [];
    if (files.length) {
      var r = readFileOrErr(ctx, files[0]);
      if (r.err) return fail([r.err.replace(/^cat:/, 'awk:')]);
      lines = splitLines(r.content);
    }
    var sep = fs ? new RegExp('[' + fs.replace(/[[\]\\^-]/g, '\\$&') + ']') : /\s+/;

    /* 拆出 BEGIN / 主体 / END 三段 */
    var beginM = program.match(/BEGIN\s*\{([^}]*)\}/);
    var endM = program.match(/END\s*\{([^}]*)\}/);
    var body = program.replace(/BEGIN\s*\{[^}]*\}/, '').replace(/END\s*\{[^}]*\}/, '').trim();

    var out = [];

    /* 只解析 awk 条件表达式的教学子集，不把课程字符串交给 JS eval。
       支持字段/行号/字段数、数字与字符串比较、正则匹配以及 && / ||；
       其它表达式明确判为不匹配，避免动态代码执行和静默放行。 */
    function operand(value, fields, nr, nf) {
      value = String(value || '').trim();
      var fm = value.match(/^\$(\d+)(\+0)?$/);
      if (fm) {
        var raw = fields[Number(fm[1]) - 1] === undefined ? '' : fields[Number(fm[1]) - 1];
        return fm[2] ? Number(String(raw).match(/^-?\d+(\.\d+)?/) || 0) : raw;
      }
      if (value === '$NF') return fields[fields.length - 1] || '';
      if (value === 'NF') return nf;
      if (value === 'NR') return nr;
      if (vars[value] !== undefined) return vars[value];
      if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
      if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
          (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) return value.slice(1, -1);
      var re = value.match(/^\/(.*)\/([gimuy]*)$/);
      if (re) { try { return new RegExp(re[1], re[2]); } catch (ignore) { return null; } }
      return null;
    }
    function splitLogic(text, sep) {
      return String(text).split(sep).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    function safeCondition(condition, fields, nr, nf) {
      /* numeric coercion is already applied by >/< comparisons; normalize the
         common awk `$5+0` idiom before tokenizing so it cannot be mistaken for
         an arithmetic expression outside the supported grammar. */
      condition = String(condition).replace(/\$(\d+)\s*\+\s*0/g, '$$$1');
      var ors = splitLogic(condition, /\s*\|\|\s*/);
      for (var oi = 0; oi < ors.length; oi++) {
        var ands = splitLogic(ors[oi], /\s*&&\s*/), all = true;
        for (var ai = 0; ai < ands.length; ai++) {
          var part = ands[ai].replace(/^\((.*)\)$/, '$1').trim();
          var neg = false;
          if (part.charAt(0) === '!') { neg = true; part = part.slice(1).trim(); }
          var cmp = part.match(/^(.+?)\s*(==|!=|>=|<=|>|<|!~|~)\s*(.+)$/);
          var left, right, hit;
          if (!cmp) {
            hit = !!operand(part, fields, nr, nf);
          } else {
            left = operand(cmp[1], fields, nr, nf); right = operand(cmp[3], fields, nr, nf);
            if (left === null || right === null) hit = false;
            else if (cmp[2] === '~' || cmp[2] === '!~') {
              hit = right instanceof RegExp ? right.test(String(left)) : false;
              if (cmp[2] === '!~') hit = !hit;
            } else if (cmp[2] === '==') hit = String(left) === String(right) || Number(left) === Number(right);
            else if (cmp[2] === '!=') hit = !(String(left) === String(right) || Number(left) === Number(right));
            else if (cmp[2] === '>=') hit = Number(left) >= Number(right);
            else if (cmp[2] === '<=') hit = Number(left) <= Number(right);
            else if (cmp[2] === '>') hit = Number(left) > Number(right);
            else if (cmp[2] === '<') hit = Number(left) < Number(right);
            else hit = false;
          }
          if (neg) hit = !hit;
          if (!hit) { all = false; break; }
        }
        if (all) return true;
      }
      return false;
    }

    function evalExpr(expr, fields, nr, nf) {
      expr = expr.trim();
      /* 纯字符串 */
      var sm = expr.match(/^"(.*)"$/);
      if (sm) return sm[1];
      /* 数值 */
      if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
      /* $n */
      var fm = expr.match(/^\$(\d+)$/);
      if (fm) return fields[Number(fm[1]) - 1] !== undefined ? fields[Number(fm[1]) - 1] : '';
      if (expr === '$NF') return fields[fields.length - 1] || '';
      if (expr === 'NF') return nf;
      if (expr === 'NR') return nr;
      if (vars[expr] !== undefined) return vars[expr];
      /* 简单拼接（如 $1":"$2 或 $1"-"$2） */
      if (/\$|"/.test(expr)) {
        var parts = expr.match(/"[^"]*"|\$[0-9NF]+|[A-Za-z_][A-Za-z0-9_]*/g);
        if (parts) {
          return parts.map(function (p) {
            if (p.charAt(0) === '"') return p.slice(1, -1);
            if (p.charAt(0) === '$') {
              if (p === '$NF') return fields[fields.length - 1] || '';
              var k = Number(p.slice(1));
              return fields[k - 1] !== undefined ? fields[k - 1] : '';
            }
            return vars[p] !== undefined ? vars[p] : '';
          }).join('');
        }
      }
      return '';
    }

    function runBlock(block, fields, nr, nf) {
      if (!block) return;
      block.split(';').forEach(function (stmt) {
        stmt = stmt.trim();
        if (!stmt) return;
        var pm = stmt.match(/^print\s*(.*)$/);
        if (pm) {
          var arg = pm[1].trim();
          if (!arg) { out.push(fields.join(' ')); return; }
          var pieces = arg.split(',').map(function (x) { return evalExpr(x, fields, nr, nf); });
          out.push(pieces.join(' '));
          return;
        }
        var asm = stmt.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
        if (asm) { vars[asm[1]] = evalExpr(asm[2], fields, nr, nf); return; }
        var asm2 = stmt.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\+=\s*(.+)$/);
        if (asm2) { vars[asm2[1]] = (Number(vars[asm2[1]]) || 0) + Number(evalExpr(asm2[2], fields, nr, nf)); return; }
      });
    }

    runBlock(beginM ? beginM[1] : '', [], 0, 0);

    lines.forEach(function (line, idx) {
      var fields = line.split(sep).filter(function (x, i2) { return !(sep.source === '\\s+' && x === ''); });
      if (sep.source === '\\s+') fields = line.trim().split(/\s+/);
      var nf = fields.length, nr = idx + 1;
      if (!body) { out.push(line); return; }
      /* 条件式：pattern { action } */
      var cm = body.match(/^([^{]*)\{([^}]*)\}\s*$/);
      if (cm) {
        var cond = cm[1].trim();
        var pass = true;
        if (cond) {
          pass = safeCondition(cond, fields, nr, nf);
        }
        if (pass) runBlock(cm[2], fields, nr, nf);
        return;
      }
      var pm2 = body.match(/^print\s*(.*)$/);
      if (pm2) {
        if (!pm2[1].trim()) { out.push(line); return; }
        out.push(pm2[1].split(',').map(function (x) { return evalExpr(x, fields, nr, nf); }).join(' '));
        return;
      }
      var am = body.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+)/);
      if (am) { vars[am[1]] = evalExpr(am[2], fields, nr, nf); return; }
      runBlock(body, fields, nr, nf);
    });

    if (endM) {
      var em = endM[1].match(/print\s+(.*)/);
      if (em) out.push(em[1].split(',').map(function (x) { return evalExpr(x, [], lines.length, 0); }).join(' '));
    }
    return ok(out);
  };

  /* ---------- sed（教学子集） ---------- */
  CMDS.sed = function (argv, ctx, stdin, HOST) {
    var inPlace = false, quiet = false, script = null, files = [];
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      if (a === '-i') { inPlace = true; continue; }
      if (a === '-n') { quiet = true; continue; }
      if (a === '-e') { script = (script ? script + ';' : '') + argv[++i]; continue; }
      if (a.charAt(0) === '-' && a.length > 1) continue;
      if (script === null) { script = a; continue; }
      files.push(a);
    }
    if (script === null) return fail(['sed: no script specified']);
    var lines = stdin || [];
    var fromFile = null;
    if (files.length) {
      var r = readFileOrErr(ctx, files[0]);
      if (r.err) return fail([r.err.replace(/^cat:/, 'sed:')]);
      lines = splitLines(r.content);
      fromFile = files[0];
    }
    var out = [];
    var parts = script.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) parts = [script.trim()];

    var result = lines.slice();
    var printed = {};
    var unrecognized = [];

    parts.forEach(function (part) {
      /* 地址表达式既可能是行号（`1,3`），也可能是正则（`/events/,/}/`）。
         ⚠️ 早先 d/p/i/a 四条命令的地址字符类只有 `[0-9,$]`，正则形式匹配不上，
         整个 part 被跳过 → `sed -n '/start/,/end/p'` **静默输出为空**，
         学员会以为"没匹配到"，而真机是有输出的。字符类必须和 s 命令保持一致，
         而且要包含 `{ } ( ) | + ?` —— 正则里的花括号（如 `/}/`）漏掉同样会匹配失败。 */
      var ADDR = '[0-9,$/A-Za-z_.*^\\[\\]{}+?()|\\\\-\\s]*';
      var sm = part.match(new RegExp('^(' + ADDR + ')\\s*s([/|#,])((?:\\\\.|[^\\\\])*?)\\2((?:\\\\.|[^\\\\])*?)\\2([gi]*)$'));
      var dm = part.match(new RegExp('^(' + ADDR + ')\\s*d$'));
      var pm = part.match(new RegExp('^(' + ADDR + ')\\s*p$'));
      var im = part.match(new RegExp('^(' + ADDR + ')\\s*i\\s*\\\\?(.*)$'));
      var am2 = part.match(new RegExp('^(' + ADDR + ')\\s*a\\s*\\\\?(.*)$'));

      if (dm) {
        var range = parseRange(dm[1], result.length);
        result = result.filter(function (l, idx) { return !range(idx, l); });
        return;
      }
      if (pm) {
        var r2 = parseRange(pm[1], result.length);
        result.forEach(function (l, idx) { if (r2(idx, l)) printed[idx] = l; });
        return;
      }
      if (sm) {
        var addr = sm[1], delim = sm[2], pat = sm[3], repRaw = sm[4], fl = sm[5] || '';
        var rep = repRaw.replace(/\\1/g, '\u0001').replace(/\\2/g, '\u0002').replace(/&/g, '\u0000');
        var r3 = parseRange(addr, result.length);
        result = result.map(function (l, idx) {
          if (!r3(idx, l)) return l;
          var flags = fl.indexOf('g') !== -1 ? 'g' : '';
          var re;
          try { re = new RegExp(pat, flags + (fl.indexOf('i') !== -1 ? 'i' : '')); }
          catch (e) { return l; }
          return l.replace(re, function () {
            var groups = arguments;
            var m0 = groups[0];
            return rep.replace(/\u0000/g, m0)
              .replace(/\u0001/g, groups[1] !== undefined ? groups[1] : '')
              .replace(/\u0002/g, groups[2] !== undefined ? groups[2] : '');
          });
        });
        return;
      }
      if (im || am2) {
        var mm = im || am2;
        var r4 = parseRange(mm[1], result.length);
        var text = (mm[2] || '').replace(/^\\/, '');
        var newRes = [];
        result.forEach(function (l, idx) {
          if (im && r4(idx, l)) newRes.push(text);
          newRes.push(l);
          if (am2 && r4(idx, l)) newRes.push(text);
        });
        result = newRes;
        return;
      }
      /* 走到这里说明这条 sed 脚本没被任何分支认出来。
         ⚠️ 早先的做法是**默默跳过**，结果是命令退出码 0、输出为空 ——
         学员会得出"没匹配到"这个完全错误的结论（`/server {/,/}/` 里那个空格
         就让地址匹配不上，静默变成空输出）。不认识的写法必须报出来。 */
      unrecognized.push(part);
    });
    if (unrecognized.length) {
      return fail(['sed: 教学环境暂不支持这种写法：' + unrecognized.join(' ; ') +
        '（支持 d / p / s / i / a 五类命令，地址可用行号 1,3 或正则 /起/,/止/）']);
    }

    if (quiet) {
      out = Object.keys(printed).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) { return printed[k]; });
    } else out = result;

    if (inPlace && fromFile) {
      var abs = resolvePath(ctx.cwd, fromFile);
      var node = findNode(ctx.root, abs);
      if (node) { node.content = out.join('\n') + '\n'; node.mtime = fmtNow(); }
      /* 真 `sed -i` **什么都不打印**：它的输出目标就是文件本身。
         早先这里照样 return ok(out)，于是 `sed -i 's/x/y/' f` 会把整个文件
         刷到终端上 —— 学员分不清"改成功了"还是"只是看了一眼"，
         而且这个输出还会混进管道/重定向，把后面的命令喂脏。 */
      return ok([]);
    }
    return ok(out);
  };

  function parseRange(spec, total) {
    if (!spec) return function () { return true; };
    var m;
    if ((m = String(spec).match(/^(\d+),(\d+)$/))) {
      var a = Number(m[1]), b = Number(m[2]);
      return function (idx) { var n = idx + 1; return n >= a && n <= b; };
    }
    /* `/起/,/止/` 形式。⚠️ 逗号后面那个 `/` 必须显式吃掉：
       原写成 `^\/(.+)\/,(.+)\/$`，第二组会把 `/` 一起吞进去（s2 变成 `/}`），
       于是"止"永远匹配不上；更糟的是当整段匹配失败时 parseRange 会回退成
       **match-everything**，`sed -n '/events/,/}/p'` 直接把文件后半段全打出来 ——
       看着有输出、其实是错的。 */
    if ((m = String(spec).match(/^\/(.+)\/,\/(.+)\/$/))) {
      var s1 = m[1], s2 = m[2], on = false;
      return function (idx, line) {
        if (!on && new RegExp(s1).test(line)) on = true;
        if (on && new RegExp(s2).test(line)) { var r = true; on = false; return r; }
        return on;
      };
    }
    if ((m = String(spec).match(/^\/(.+)\/$/))) {
      var re = new RegExp(m[1]);
      return function (idx, line) { return re.test(line); };
    }
    if (/^\d+$/.test(String(spec))) {
      var n = Number(spec);
      return function (idx) { return idx + 1 === n; };
    }
    if (String(spec).indexOf('$') !== -1) {
      return function (idx) { return idx + 1 === total; };
    }
    return function () { return true; };
  }

  /* ---------- jq（教学子集） ---------- */
  CMDS.jq = function (argv, ctx, stdin, HOST) {
    var raw = argv.indexOf('-r') !== -1;
    var compact = argv.indexOf('-c') !== -1;
    var filter = null, files = [];
    var vars = {};
    /* ⚠️ `--arg 名字 值` 是**两个参数的带值选项**，必须整对吃掉。
       早先只跳过长度 ≤ 3 的短选项，于是 `--arg` 被当成过滤器、`ns` 被当成文件：
         jq -r --arg ns "kube-system" '.items[] | …' pods.json
       → `jq: error: Could not open ns: No such file or directory`。
       `--arg` 是把 shell 变量安全地传进 jq 过滤器的标准做法，用错会直接报错。 */
    for (var ji = 0; ji < argv.length; ji++) {
      var a = String(argv[ji]);
      if (a === '--arg' || a === '--argjson') { vars[String(argv[ji + 1])] = argv[ji + 2]; ji += 2; continue; }
      if (/^--arg=/.test(a) || /^--argjson=/.test(a)) continue;
      if (a.charAt(0) === '-' && a.length <= 3) continue;
      if (a.charAt(0) === '-') continue;
      if (filter === null) filter = a;
      else files.push(a);
    }
    if (filter === null) return fail(['jq: error: no filter given']);
    /* `$名字` 在过滤器里的用法：值来自 --arg，这里做一次字面替换 */
    if (Object.keys(vars).length) {
      filter = String(filter).replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, function (m, n) {
        return vars[n] === undefined ? m : JSON.stringify(String(vars[n]));
      });
    }
    var text = '';
    if (files.length) {
      var r = readFileOrErr(ctx, files[0]);
      if (r.err) return fail(['jq: error: Could not open ' + files[0] + ': No such file or directory']);
      text = r.content;
    } else text = (stdin || []).join('\n');

    var data;
    try { data = JSON.parse(text); }
    catch (e) { return fail(['jq: error (at <stdin>:' + (String(text).split('\n').length) + '): Cannot parse as JSON']); }

    var results = [];
    var path = String(filter).replace(/^\./, '');
    if (path === '' || path === '.') results = [data];
    else {
      var segs = path.split('.');
      var cur = [data];
      segs.forEach(function (seg) {
        var next = [];
        var iter = false, name = seg;
        if (seg.slice(-2) === '[]') { iter = true; name = seg.slice(0, -2); }
        if (seg === '[]') { iter = true; name = null; }
        cur.forEach(function (obj) {
          if (name === null) {
            if (Array.isArray(obj)) obj.forEach(function (x) { next.push(x); });
            else if (obj && typeof obj === 'object') Object.keys(obj).forEach(function (k) { next.push(obj[k]); });
            return;
          }
          var v = obj === null || obj === undefined ? undefined : obj[name];
          if (iter) { if (Array.isArray(v)) v.forEach(function (x) { next.push(x); }); }
          else next.push(v);
        });
        cur = next;
      });
      results = cur;
    }

    var out = results.filter(function (v) { return v !== undefined; }).map(function (v) {
      if (typeof v === 'string') return raw ? v : JSON.stringify(v);
      if (v === null) return 'null';
      if (typeof v === 'object') return compact ? JSON.stringify(v) : JSON.stringify(v, null, 2);
      return String(v);
    });
    return ok(out);
  };

  /* ---------- 系统信息类 ---------- */
  CMDS.hostname = function (argv, ctx, stdin, HOST) {
    if (argv[0] === '-I') return ok([HOST.ip]);
    /* ⚠️ `hostnamectl set-hostname` 改的是 ctx.env.__HOSTNAME（见 cmd-host.js），
       这里必须读同一个值，否则会出现"改完之后 `hostname` 还是旧名字"这种自相矛盾 ——
       学员没法验证自己的操作生效了，而"操作 → 验证"正是这一课的核心闭环。 */
    var nm = (ctx.env && ctx.env.__HOSTNAME) || HOST.hostname;
    /* `hostname <新名字>` 这种直接写法也支持（老式命令，真机上仍然可用） */
    if (argv.length && argv[0].charAt(0) !== '-') {
      var want = String(argv[0]);
      if (!/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(want)) {
        return fail(['hostname: 主机名不合法（只能字母数字与连字符）']);
      }
      ctx.env.__HOSTNAME = want;
      var hn = findNode(ctx.root, '/etc/hostname');
      if (hn) hn.content = want + '\n';
      return ok([]);
    }
    return ok([nm]);
  };

  CMDS.whoami = function (argv, ctx, stdin, HOST) { return ok([HOST.user]); };
  /* `id [用户]`：不带参数看自己，带参数**去查那个账号**。
     ⚠️ 早先它无论传什么都返回 `uid=0(root) …` —— 一条完全写死的输出。
     后果：站内 lu-who-can-sudo 那节课要学员 `id deploy` 看附加组，
     拿到的却是 root 的身份；`lu-id` 条目的示例也在教 `id deploy`。
     权限排查里"这个账号到底属于哪些组"是最关键的一步，
     返回错的答案比报错危险得多（学员会据此得出"它没有提权权限"的错误结论）。 */
  CMDS.id = function (argv, ctx, stdin, HOST) {
    var want = argv.filter(function (a) { return String(a).charAt(0) !== '-'; })[0] || null;
    function passwdOf(name) {
      var n = findNode(ctx.root, '/etc/passwd');
      if (!n || !n.content) return null;
      var lines = splitLines(String(n.content));
      for (var i = 0; i < lines.length; i++) {
        var f = String(lines[i]).split(':');
        if (f.length >= 7 && f[0] === name) {
          return { name: f[0], uid: f[2], gid: f[3], gecos: f[4], home: f[5], shell: f[6] };
        }
      }
      return null;
    }
    /* /etc/group 里"这个账号是成员"的组名 */
    function groupsOf(name, primaryGid) {
      var out = [];
      var gn = findNode(ctx.root, '/etc/group');
      if (gn && gn.content) {
        splitLines(String(gn.content)).forEach(function (l) {
          var f = String(l).split(':');
          if (f.length < 4) return;
          if (String(f[3]).split(',').indexOf(name) !== -1) out.push(f[0]);
          else if (f[2] === String(primaryGid)) out.push(f[0]);
        });
      }
      return out;
    }
    function gidName(gid) {
      var gn2 = findNode(ctx.root, '/etc/group');
      if (gn2 && gn2.content) {
        var hit = null;
        splitLines(String(gn2.content)).forEach(function (l) {
          var f = String(l).split(':');
          if (f.length >= 3 && f[2] === String(gid) && !hit) hit = f[0];
        });
        if (hit) return hit;
      }
      return null;
    }
    var u;
    if (want === null) {
      /* 不带参数：当前身份（本站的模拟终端是 root 视角） */
      u = passwdOf('root') || { name: 'root', uid: '0', gid: '0' };
    } else {
      u = passwdOf(want);
      if (!u) return fail(['id: \'' + want + '\': no such user'], 1);
    }
    var gname = gidName(u.gid);
    var parts = ['uid=' + u.uid + '(' + u.name + ')', 'gid=' + u.gid + (gname ? '(' + gname + ')' : '')];
    var gs = groupsOf(u.name, u.gid);
    if (gs.length) {
      parts.push('groups=' + gs.map(function (g) {
        var gn3 = findNode(ctx.root, '/etc/group');
        var gidv = '?';
        if (gn3 && gn3.content) {
          splitLines(String(gn3.content)).forEach(function (l) {
            var f = String(l).split(':');
            if (f[0] === g && f.length >= 3) gidv = f[2];
          });
        }
        return gidv + '(' + g + ')';
      }).join(','));
    }
    if (argv.indexOf('-u') !== -1) return ok([u.uid]);
    if (argv.indexOf('-g') !== -1) return ok([u.gid]);
    if (argv.indexOf('-n') !== -1 && (argv.indexOf('-G') !== -1 || argv.indexOf('-g') !== -1)) {
      return ok([argv.indexOf('-G') !== -1 ? gs.join(' ') : (gname || u.gid)]);
    }
    if (argv.indexOf('-G') !== -1) return ok([gs.join(' ')]);
    if (argv.indexOf('-nG') !== -1) return ok([gs.join(' ')]);
    return ok([parts.join(' ')]);
  };

  CMDS.uname = function (argv, ctx, stdin, HOST) {
    if (argv.indexOf('-a') !== -1) {
      return ok(['Linux ' + HOST.hostname + ' ' + HOST.kernel + ' #1 SMP Wed Mar 22 03:16:53 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux']);
    }
    if (argv.indexOf('-r') !== -1) return ok([HOST.kernel]);
    if (argv.indexOf('-m') !== -1) return ok(['x86_64']);
    return ok(['Linux']);
  };

  CMDS.uptime = function (argv, ctx, stdin, HOST) {
    return ok([' 09:51:00 up 14 days, 20:39,  1 user,  load average: 0.42, 0.68, 0.71']);
  };

  CMDS.date = function (argv, ctx, stdin, HOST) {
    if (argv[0] && argv[0].charAt(0) === '+') {
      var fmt = argv[0].slice(1);
      var d = new Date(NOW);
      var map = {
        '%F': '2024-03-18', '%T': '09:51:00', '%Y': '2024', '%m': '03', '%d': '18',
        '%H': '09', '%M': '51', '%S': '00', '%s': String(Math.floor(NOW / 1000)),
        '%Z': 'CST', '%z': '+0800', '%D': '03/18/24', '%A': 'Monday'
      };
      var out = fmt;
      Object.keys(map).forEach(function (k) { out = out.split(k).join(map[k]); });
      return ok([out]);
    }
    return ok(['Mon Mar 18 09:51:00 CST 2024']);
  };

  CMDS.free = function (argv, ctx, stdin, HOST) {
    /* 支持 -h / -m / -g / -t（合计行）/ -s <秒>（真机循环刷新）。
       三档共用同一份 /proc/meminfo 数值，绝不出现"free -h 与 free -m 对不上"。 */
    var human = false, mega = false, total = false, seconds = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-s' || a === '--seconds') { seconds = argv[i + 1]; i++; continue; }
      if (/^-[a-zA-Z]+$/.test(a)) {
        a.slice(1).split('').forEach(function (c) {
          if (c === 'h') human = true;
          if (c === 'm') mega = true;
          if (c === 't') total = true;
        });
        continue;
      }
      if (/^\d+$/.test(a)) seconds = a;
    }
    var out = [];
    if (human) {
      out = [
        '               total        used        free      shared  buff/cache   available',
        'Mem:           7.6Gi       4.1Gi       402Mi        18Mi       3.1Gi       1.1Gi',
        'Swap:          2.0Gi          0B       2.0Gi'
      ];
      if (total) out.push('Total:         9.6Gi       4.1Gi       2.4Gi');
    } else if (mega) {
      out = [
        '               total        used        free      shared  buff/cache   available',
        'Mem:           7770.7      4193.4       402.4        18.0      3174.9      1101.9',
        'Swap:          2048.0           0      2048.0'
      ];
      if (total) out.push('Total:        9818.7      4193.4      2450.4');
    } else {
      out = [
        '               total        used        free      shared  buff/cache   available',
        'Mem:        7957184     4293872      412036       18432     3251276     1128404',
        'Swap:       2097148           0     2097148'
      ];
      if (total) out.push('Total:     10054332     4293872     2499184');
    }
    if (seconds !== null) {
      out.push('');
      out.push('（教学环境是静态快照：真机上 free -s ' + seconds + ' 每 ' + seconds + ' 秒刷新一次，Ctrl+C 结束。' +
        '盯的是 available 那一列是否持续下降，以及 si/so 是否开始换页）');
    }
    return ok(out);
  };

  CMDS.nproc = function (argv, ctx, stdin, HOST) { return ok(['2']); };

  CMDS.lscpu = function (argv, ctx, stdin, HOST) {
    return ok([
      'Architecture:        x86_64',
      'CPU op-mode(s):      32-bit, 64-bit',
      'Byte Order:          Little Endian',
      'CPU(s):              2',
      'On-line CPU(s) list: 0,1',
      'Model name:          Intel(R) Xeon(R) Gold 6278C CPU @ 2.60GHz',
      'CPU MHz:             2600.000',
      'Hypervisor vendor:   KVM',
      'NUMA node(s):        1'
    ]);
  };

  CMDS.w = function (argv, ctx, stdin, HOST) {
    return ok([
      ' 09:51:00 up 14 days, 20:39,  1 user,  load average: 0.42, 0.68, 0.71',
      'USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT',
      'root     pts/0    203.0.113.25     09:12    0.00s  0.12s  0.02s w'
    ]);
  };

  CMDS.last = function (argv, ctx, stdin, HOST) {
    return ok([
      'deploy   pts/0        203.0.113.25    Mon Mar 18 09:12   still logged in',
      'root     pts/1        203.0.113.25    Mon Mar 18 08:40 - 09:05  (00:25)',
      'root     pts/0        198.51.100.77    Sun Mar 17 21:14 - 21:40  (00:26)',
      '',
      'wtmp begins Mon Mar  4 08:02:11 2024'
    ]);
  };

  CMDS.env = function (argv, ctx, stdin, HOST) {
    if (argv[0] === 'bash') return ok([]);
    var out = [
      'SHELL=/bin/bash', 'PWD=' + ctx.cwd, 'LOGNAME=' + HOST.user, 'HOME=' + HOST.home,
      'LANG=en_US.UTF-8', 'HOSTNAME=' + HOST.hostname, 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'TZ=Asia/Shanghai', 'USER=' + HOST.user
    ];
    for (var k in ctx.env) out.push(k + '=' + ctx.env[k]);
    return ok(out);
  };

  CMDS.export = function (argv, ctx, stdin, HOST) {
    argv.forEach(function (a) {
      var m = a.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) ctx.env[m[1]] = m[2];
    });
    return ok([]);
  };

  CMDS.echo2 = null;

  CMDS.which = function (argv, ctx, stdin, HOST) {
    var paths = {
      ls: '/usr/bin/ls', cp: '/usr/bin/cp', mv: '/usr/bin/mv', rm: '/usr/bin/rm', grep: '/usr/bin/grep',
      awk: '/usr/bin/awk', sed: '/usr/bin/sed', tar: '/usr/bin/tar', rsync: '/usr/bin/rsync',
      curl: '/usr/bin/curl', docker: '/usr/bin/docker', kubectl: '/usr/local/bin/kubectl',
      nginx: '/usr/sbin/nginx', systemctl: '/usr/bin/systemctl', python3: '/usr/bin/python3'
    };
    var out = [], err = [];
    argv.forEach(function (a) {
      if (paths[a]) out.push(paths[a]);
      else { err.push('which: no ' + a + ' in (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)'); }
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  CMDS.stat = function (argv, ctx, stdin, HOST) {
    /* `-c/--format` 与 `-f/--file-system` 是内容里高频用法
       （`stat -c "%a %U:%G %n" 文件`），必须先认出来，
       否则格式串会被当成文件名，报 "cannot statx '%s %n'"。 */
    var fmt = null, targets = [];
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      if (a === '-c' || a === '--format' || a === '--printf') { fmt = argv[++i]; continue; }
      var fm = a.match(/^(?:-c|--format=|--printf=)(.+)$/);
      if (fm) { fmt = fm[1]; continue; }
      if (/^-[Ltf]+$/.test(a)) continue;
      targets.push(a);
    }
    if (!targets.length) return fail(['stat: missing operand']);
    var out = [], err = [];
    targets.forEach(function (f) {
      var abs = resolvePath(ctx.cwd, f);
      var node = findNode(ctx.root, abs);
      if (!node) { err.push('stat: cannot statx \'' + f + '\': No such file or directory'); return; }
      var size = sizeOf(node);
      if (fmt !== null) {
        /* GNU stat 的格式串：\n \t 是转义，%a %A %s %U %G %n %y %F 是字段 */
        var line = String(fmt).replace(/\\n/g, '\n').replace(/\\t/g, '\t')
          .replace(/%a/g, String(node.mode || '644').slice(-3))
          .replace(/%A/g, permString(node))
          .replace(/%s/g, String(size))
          .replace(/%U/g, node.user || 'root')
          .replace(/%G/g, node.group || 'root')
          .replace(/%n/g, f)
          .replace(/%y/g, (node.mtime || '2024-03-18 09:00') + ':00.000000000 +0800')
          .replace(/%F/g, node.type === 'dir' ? 'directory' : (node.type === 'link' ? 'symbolic link' : 'regular file'))
          .replace(/%i/g, String(nodeInode(abs, node)));
        line.split('\n').forEach(function (l) { out.push(l); });
        return;
      }
      out.push('  File: ' + f + (node.type === 'link' ? ' -> ' + node.target : ''));
      out.push('  Size: ' + size + '      \tBlocks: ' + Math.ceil(size / 512) + '       IO Block: 4096   ' + (node.type === 'dir' ? 'directory' : 'regular file'));
      out.push('Device: fd01h/64769d\tInode: ' + nodeInode(abs, node) + '   Links: ' + countLinks(node));
      out.push('Access: (' + oMode(node.mode) + '/' + permString(node) + ')  Uid: (    0/' + (node.user || 'root') + ')   Gid: (    0/' + (node.group || 'root') + ')');
      out.push('Access: 2024-03-18 09:43:02.114382311 +0800');
      out.push('Modify: ' + (node.mtime || '2024-03-18 09:00') + ':00.000000000 +0800');
      out.push('Change: ' + (node.mtime || '2024-03-18 09:00') + ':00.000000000 +0800');
    });
    if (err.length) return { out: out, err: err, code: 1 };
    return ok(out);
  };

  function oMode(mode) {
    return String(mode || '644').padStart(4, '0');
  }

  CMDS.file = function (argv, ctx, stdin, HOST) {
    var out = [], err = [];
    argv.filter(function (a) { return a.charAt(0) !== '-'; }).forEach(function (f) {
      var abs = resolvePath(ctx.cwd, f);
      var node = findNode(ctx.root, abs);
      if (!node) { err.push(f + ': cannot open \'' + f + '\' (No such file or directory)'); return; }
      if (node.type === 'dir') { out.push(f + ': directory'); return; }
      if (node.type === 'link') { out.push(f + ': symbolic link to ' + node.target); return; }
      var c = String(node.content || '');
      if (c.indexOf('<binary>') === 0) out.push(f + ': gzip compressed data, from Unix' === c ? f + ': gzip compressed data' : f + ': data');
      else if (/^#!/.test(c)) out.push(f + ': Bourne-Again shell script, ASCII text executable');
      else if (/^\{/.test(c.trim())) out.push(f + ': JSON data');
      else out.push(f + ': ASCII text');
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  /* ---------- tar / gzip ---------- */
  CMDS.tar = function (argv, ctx, stdin, HOST) {
    var flags = { c: false, x: false, t: false, z: false, f: false, v: false, C: null };
    var files = [], i = 0;
    for (; i < argv.length; i++) {
      var a = argv[i];
      if (a === '-C') { flags.C = argv[++i]; continue; }
      if (a.charAt(0) === '-') { a.slice(1).split('').forEach(function (c) { flags[c] = true; }); continue; }
      files.push(a);
    }
    if (flags.t) {
      return ok([
        'var/www/html/', 'var/www/html/index.html', 'var/www/html/health.txt',
        '', '（教学环境只展示归档清单示例；真机输出取决于归档内容）'
      ]);
    }
    if (flags.c) {
      return ok(flags.v ? files.map(function (f) { return f; }) : []);
    }
    if (flags.x) {
      return ok(flags.v ? ['var/www/html/', 'var/www/html/index.html', 'var/www/html/health.txt'] : []);
    }
    return fail(['tar: You must specify one of the \'-Acdtrux\' options']);
  };

  /* `gzip` 的实现在 assets/js/cmd-basic3.js（与 gunzip/xz/zstd 同一套逻辑）。
     ⚠️ 这里**不能**再留一个空壳实现：CC_SHELL.extend 是"只加不覆盖"的，
     壳一旦存在，cmd-basic3 里的真实现就永远注册不上，
     命令会静默返回空 —— 看着像成功，其实什么都没做。 */

  CMDS.md5sum = function (argv, ctx, stdin, HOST) {
    var out = [], err = [];
    argv.filter(function (a) { return a.charAt(0) !== '-'; }).forEach(function (f) {
      var abs = resolvePath(ctx.cwd, f);
      var node = findNode(ctx.root, abs);
      if (!node || node.type === 'dir') { err.push('md5sum: ' + f + ': No such file or directory'); return; }
      var h = 0, s = String(node.content || '') + f;
      for (var k = 0; k < s.length; k++) h = (h * 131 + s.charCodeAt(k)) % 4294967296;
      var hex = (h.toString(16) + 'e3b0c44298fc1c149afbf4c8996fb924').slice(0, 32);
      out.push(hex + '  ' + f);
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  /* ---------- 磁盘 ---------- */
  CMDS.df = function (argv, ctx, stdin, HOST) {
    /* 支持 -h / -i / -T / -t <类型> / -x <类型> / --total 以及 -ih 这类合并写法 */
    var human = false, inode = false, showType = false, total = false;
    var onlyTypes = [], skipTypes = [], paths = [];
    for (var ai = 0; ai < argv.length; ai++) {
      var a = String(argv[ai]);
      if (a === '-t' || a === '--type') {
        for (var t1 = 0; t1 < String(argv[ai + 1] || '').split(',').length; t1++) onlyTypes.push(String(argv[ai + 1]).split(',')[t1]);
        ai++; continue;
      }
      if (a === '-x' || a === '--exclude-type') {
        for (var t2 = 0; t2 < String(argv[ai + 1] || '').split(',').length; t2++) skipTypes.push(String(argv[ai + 1]).split(',')[t2]);
        ai++; continue;
      }
      if (a === '--total') { total = true; continue; }
      if (/^-[a-zA-Z]+$/.test(a)) {
        a.slice(1).split('').forEach(function (c) {
          if (c === 'h') human = true;
          if (c === 'i') inode = true;
          if (c === 'T') showType = true;
        });
        continue;
      }
      if (a.charAt(0) === '-') continue;
      paths.push(a);
    }
    /* 只留下符合 -t/-x 的行；再按位置参数过滤挂载点/设备 */
    function keep(row) {
      if (onlyTypes.length && onlyTypes.indexOf(row.fstype) === -1) return false;
      if (skipTypes.length && skipTypes.indexOf(row.fstype) !== -1) return false;
      if (paths.length) {
        var hit = false;
        paths.forEach(function (p) {
          var abs = resolvePath(ctx.cwd, p);
          if (row.mount === abs || row.dev === abs || row.mount === p || row.dev === p) hit = true;
        });
        if (!hit) return false;
      }
      return true;
    }
    var rows = [];
    (window.CC_TERM_FS.disk || []).forEach(function (r) {
      var dev = String(r.fs);
      var type = dev.indexOf('tmpfs') === 0 ? 'tmpfs' : (r.mount === '/' ? 'ext4' : (r.mount === '/data' ? 'ext4' : (r.mount === '/var/lib/docker' ? 'ext4' : 'ext4')));
      rows.push({ fs: r.fs, size: r.size, used: r.used, avail: r.avail, usePct: r.usePct, mount: r.mount, fstype: type });
    });
    var inodeRows = (window.CC_TERM_FS.inodes || []).filter(function (r) {
      var type = 'ext4';
      if (onlyTypes.length && onlyTypes.indexOf(type) === -1) return false;
      if (skipTypes.length && skipTypes.indexOf(type) !== -1) return false;
      if (paths.length) {
        var hit = false;
        paths.forEach(function (p) {
          var abs = resolvePath(ctx.cwd, p);
          if (r.mount === abs || r.fs === abs || r.mount === p || r.fs === p) hit = true;
        });
        if (!hit) return false;
      }
      return true;
    });
    var out = [];
    /* 第一列宽度按最长设备名自适应（真机 GNU df 也是这么做的），
       否则 `/dev/vdc1` 会把后面的列顶歪、和表头对不上。 */
    function colWidth(list) {
      var w = 10;
      list.forEach(function (r) { if (String(r.fs).length > w) w = String(r.fs).length; });
      return w + 1;
    }
    if (inode) {
      if (!inodeRows.length) return ok([]);
      var w1 = colWidth(inodeRows);
      var iW = 6, uW = 5, fW = 5;
      inodeRows.forEach(function (r) {
        iW = Math.max(iW, String(r.inodes).length, 6);
        uW = Math.max(uW, String(r.iused).length);
        fW = Math.max(fW, String(r.ifree).length);
      });
      var head1 = pad('Filesystem', w1);
      if (showType) head1 += pad('Type', 6);
      out.push(head1 + pad('Inodes', iW + 2) + pad('IUsed', uW + 2) + pad('IFree', fW + 2) + pad('IUse%', 6) + 'Mounted on');
      inodeRows.forEach(function (r) {
        out.push(pad(r.fs, w1) + (showType ? pad('ext4', 6) : '') + pad(r.inodes, iW + 2) + pad(r.iused, uW + 2) + pad(r.ifree, fW + 2) + pad(r.iusePct, 6) + r.mount);
      });
      if (total) {
        var iSum = 0, iUsed = 0;
        inodeRows.forEach(function (r) { iSum += Number(r.inodes); iUsed += Number(r.iused); });
        out.push(pad('total', w1) + (showType ? pad('-', 6) : '') + pad(String(iSum), iW + 2) + pad(String(iUsed), uW + 2) + pad(String(iSum - iUsed), fW + 2) + pad(Math.round(iUsed / iSum * 100) + '%', 6) + '-');
      }
      return ok(out);
    }
    rows = rows.filter(keep);
    if (!rows.length) return ok([]);
    var W = colWidth(rows);
    function kbOf(s) { return Math.round(parseFloat(s) * 1048576); }
    function humanOf(kb) {
      if (kb >= 1073741824) return (kb / 1073741824).toFixed(1) + 'T';
      if (kb >= 1048576) return Math.round(kb / 1048576) + 'G';
      if (kb >= 1024) return Math.round(kb / 1024) + 'M';
      return kb + 'K';
    }
    if (human) {
      out.push(pad('Filesystem', W) + (showType ? pad('Type', 6) : '') + 'Size  Used Avail Use% Mounted on');
      rows.forEach(function (r) {
        out.push(pad(r.fs, W) + (showType ? pad(r.fstype, 6) : '') + pad(r.size, 5) + pad(r.used, 6) + pad(r.avail, 6) + pad(r.usePct, 5) + ' ' + r.mount);
      });
      if (total && onlyTypes.length === 0) {
        /* GNU df --total 会把所有文件系统的 Size/Used/Avail 加总，并且**排在最后一行** */
        var tSize = 0, tUsed = 0, tAvail = 0;
        rows.forEach(function (r) {
          if (r.fstype === 'tmpfs') return;
          tSize += kbOf(r.size); tUsed += kbOf(r.used); tAvail += kbOf(r.avail);
        });
        out.push(pad('total', W) + (showType ? pad('-', 6) : '') + pad(humanOf(tSize), 5) + pad(humanOf(tUsed), 6) + pad(humanOf(tAvail), 6) +
          pad(Math.round(tUsed / tSize * 100) + '%', 5) + ' -');
      }
      if (!paths.length && !onlyTypes.length && !skipTypes.length && !total) {
        out.push('');
        out.push('提示：/data 已经 100%，用 `du -sh /data/* | sort -rh | head` 找出是谁占满的');
      }
      return ok(out);
    }
    out.push(pad('Filesystem', W) + (showType ? pad('Type', 6) : '') + '1K-blocks     Used Available Use% Mounted on');
    rows.forEach(function (r) {
      var sizeK = kbOf(r.size);
      var usedK = Math.round(sizeK * parseFloat(r.usePct) / 100);
      out.push(pad(r.fs, W) + (showType ? pad(r.fstype, 6) : '') + pad(String(sizeK), 10) + pad(String(usedK), 9) +
        pad(String(sizeK - usedK), 10) + pad(r.usePct, 5) + ' ' + r.mount);
    });
    if (total && onlyTypes.length === 0) {
      var tS = 0, tU = 0;
      rows.forEach(function (r) { if (r.fstype !== 'tmpfs') { var k = kbOf(r.size); tS += k; tU += Math.round(k * parseFloat(r.usePct) / 100); } });
      out.push(pad('total', W) + (showType ? pad('-', 6) : '') + pad(String(tS), 10) + pad(String(tU), 9) + pad(String(tS - tU), 10) + pad(Math.round(tU / tS * 100) + '%', 5) + ' -');
    }
    return ok(out);
  };

  function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
  }

  /* kubectl 会把过长的名字截断显示（真机行为） */
  function clip(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function padLeft(s, n) {
    s = String(s);
    while (s.length < n) s = ' ' + s;
    return s;
  }

  CMDS.du = function (argv, ctx, stdin, HOST) {
    var human = false, summary = false, maxDepth = null, i;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (/^-[a-zA-Z]+$/.test(a)) {          /* 支持 -sh 这类合并写法 */
        a.slice(1).split('').forEach(function (c) {
          if (c === 'h') human = true;
          if (c === 's') summary = true;
        });
        continue;
      }
      var m = a.match(/^--max-depth=(\d+)$/);
      if (m) maxDepth = Number(m[1]);
    }
    var targets = argv.filter(function (x) { return String(x).charAt(0) !== '-'; });
    if (!targets.length) targets = ['.'];
    var out = [], err = [];

    function fmt(bytes) { return human ? humanSize(bytes) : String(Math.ceil(bytes / 1024)); }

    targets.forEach(function (t) {
      /* 教学环境不做 shell 通配符展开：给出比真 shell 更清晰的提示 */
      if (String(t).indexOf('*') !== -1) {
        err.push('du: cannot access \'' + t + '\': No such file or directory');
        err.push('（教学环境不做通配符展开。对比多个目录请用 `du -sh /data/*/ | sort -rh`，或直接写出目录名）');
        return;
      }
      var abs = resolvePath(ctx.cwd, t);
      var node = findNode(ctx.root, abs);
      if (!node) { err.push('du: cannot access \'' + t + '\': No such file or directory'); return; }
      if (node.type !== 'dir') { out.push(fmt(sizeOf(node)) + '\t' + t); return; }
      if (summary) { out.push(fmt(duSize(node)) + '\t' + t); return; }
      function walk(n, path, depth) {
        var names = childrenSorted(n).filter(function (x) { return x.charAt(0) !== '.'; });
        var subdirs = names.filter(function (x) { return n.children[x].type === 'dir'; });
        var files = names.filter(function (x) { return n.children[x].type !== 'dir'; });
        if (maxDepth === null || depth <= maxDepth) {
          files.forEach(function (f) { out.push(fmt(sizeOf(n.children[f])) + '\t' + path + '/' + f); });
        }
        subdirs.forEach(function (d) {
          if (maxDepth === null || depth <= maxDepth) out.push(fmt(duSize(n.children[d])) + '\t' + path + '/' + d);
          if (maxDepth === null || depth < maxDepth) walk(n.children[d], path + '/' + d, depth + 1);
        });
      }
      walk(node, abs === '' ? '/' : abs, 0);
      out.push(fmt(duSize(node)) + '\t' + t);
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  /* lsblk：树状列块设备。
     实现放在 assets/js/cmd-ops.js 里（本任务的模块），这里只做**转发**：
     extend() 不会覆盖已存在的命令名，所以 cmd-ops.js 里那份同实现只有从这里
     转过去才会生效。两份实现曾经不一致（-f / -o / -dp / 指定设备全部被忽略、
     永远把三块盘都打印出来），学员按文档敲 `lsblk -f /dev/vdb` 拿到的输出是错的。 */
  function lsblkImpl(argv, ctx, stdin, HOST) {
    if (window.CC_OPS_LSBLK) return window.CC_OPS_LSBLK(argv, ctx, stdin, HOST);
    return ok([
      'NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT',
      'vda    253:0    0   40G  0 disk',
      '└─vda1 253:1    0   40G  0 part /',
      'vdb    253:16   0  200G  0 disk',
      '└─vdb1 253:17   0  200G  0 part /data',
      'vdc    253:32   0  100G  0 disk',
      '└─vdc1 253:33   0  100G  0 part /var/lib/docker'
    ]);
  }
  CMDS.lsblk = lsblkImpl;

  /* mount：完整实现同样在 cmd-ops.js 里（源/目配对、already mounted、NFS/loop 提示）。 */
  CMDS.mount = function (argv, ctx, stdin, HOST) {
    if (window.CC_OPS_MOUNT) return window.CC_OPS_MOUNT(argv, ctx, stdin, HOST);
    if (!argv.length || argv[0] === '-l') {
      return ok([
        '/dev/vda1 on / type ext4 (rw,relatime)',
        '/dev/vdb1 on /data type ext4 (rw,noatime)',
        'proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)',
        'tmpfs on /dev/shm type tmpfs (rw,nosuid,nodev)',
        'sunrpc on /var/lib/nfs/rpc_pipefs type rpc_pipefs (rw,relatime)'
      ]);
    }
    if (argv[0] === '-a') {
      return ok(['（教学环境：mount -a 按 /etc/fstab 挂载全部条目，无输出即为成功）']);
    }
    return ok([]);
  };

  /* findmnt：按挂载点筛选（-T）、按类型筛选（-t）、-o 选列、--verify 预检 fstab。
     早先无论给什么参数都打印同一份树，`findmnt -t nfs4` 会谎报两个 ext4 挂载点。 */
  CMDS.findmnt = function (argv, ctx, stdin, HOST) {
    var wantVerify = argv.indexOf('--verify') !== -1;
    var target = null, typeFilter = null, cols = null, i;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if ((a === '-T' || a === '--target') && argv[i + 1]) { target = argv[++i]; continue; }
      if ((a === '-t' || a === '--types') && argv[i + 1]) { typeFilter = argv[++i]; continue; }
      if ((a === '-o' || a === '--output') && argv[i + 1]) { cols = argv[++i]; continue; }
    }
    var ALL = [
      { target: '/', source: '/dev/vda1', fstype: 'ext4', options: 'rw,relatime', root: true },
      { target: '/data', source: '/dev/vdb1', fstype: 'ext4', options: 'rw,noatime', root: false },
      { target: '/var/lib/docker', source: '/dev/vdc1', fstype: 'ext4', options: 'rw,relatime', root: false },
      { target: '/proc', source: 'proc', fstype: 'proc', options: 'rw,nosuid,nodev,noexec,relatime', root: false },
      { target: '/dev/shm', source: 'tmpfs', fstype: 'tmpfs', options: 'rw,nosuid,nodev', root: false }
    ];
    if (wantVerify) {
      return ok([
        'fstab', '------',
        '/etc/fstab',
        'TARGET SOURCE                         FSTYPE OPTIONS',
        '/      UUID=8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88 ext4   defaults        1 1',
        '/data  UUID=b41d9e05-2c7a-4f38-8a61-5d0e2f9b7c31 ext4   defaults,noatime,nofail  0 2',
        '',
        '0 parse errors, 0 errors, 2 warnings',
        '（--verify 是改完 fstab 之后的二次预检：它只读 fstab 校验语法与设备是否存在，' +
        '不会真的挂载 —— 比直接 `mount -a` 试错安全）'
      ]);
    }
    if (target) {
      var abs = resolvePath(ctx.cwd, target);
      var row = null;
      ALL.forEach(function (r) { if (r.target === abs) row = r; });
      if (!row && abs !== '/') {
        return fail(['findmnt: ' + target + ': 不是挂载点',
                     '（真机上 findmnt -T 找不到就是没挂载。要查"这个目录到底落在哪个文件系统上"，' +
                     '把 -T 换成不带参数的 findmnt，或看 /proc/mounts）']);
      }
      if (!row) row = ALL[0];
      var o1 = ['TARGET SOURCE    FSTYPE OPTIONS'];
      if (row.root) o1.push('/      ' + pad(row.source, 10) + pad(row.fstype, 7) + row.options);
      else o1.push('└─' + pad(row.target, 6) + pad(row.source, 10) + pad(row.fstype, 7) + row.options);
      return ok(o1);
    }
    var rows = ALL.filter(function (r) { return !typeFilter || r.fstype === typeFilter; });
    if (!rows.length) return ok([]);
    var out;
    if (cols) {
      var names = cols.split(',').map(function (s) { return s.trim().toUpperCase(); });
      out = [names.map(function (n) { return pad(n, n === 'TARGET' ? 8 : (n === 'SOURCE' ? 12 : (n === 'FSTYPE' ? 8 : 24))); }).join('').replace(/\s+$/, '')];
      rows.forEach(function (r) {
        out.push(names.map(function (n) {
          var v = n === 'TARGET' ? r.target : (n === 'SOURCE' ? r.source : (n === 'FSTYPE' ? r.fstype : (n === 'OPTIONS' ? r.options : '')));
          return pad(v, n === 'TARGET' ? 8 : (n === 'SOURCE' ? 12 : (n === 'FSTYPE' ? 8 : 24)));
        }).join('').replace(/\s+$/, ''));
      });
      return ok(out);
    }
    out = ['TARGET SOURCE    FSTYPE OPTIONS'];
    rows.forEach(function (r) {
      out.push((r.root ? '' : '└─') + pad(r.target, r.root ? 8 : 6) + pad(r.source, 10) + pad(r.fstype, 7) + r.options);
    });
    if (typeFilter) {
      out.push('');
      out.push('（-t ' + typeFilter + ' 只列该类型的挂载：本站没有 NFS 挂载，所以这里是空的 —— ' +
        '真机上先 `mount -t nfs ...` 或写进 fstab 才会有）');
    }
    return ok(out);
  };

  /* ---------- 网络 ---------- */
  CMDS.ip = function (argv, ctx, stdin, HOST) {
    var sub = argv[0];
    var ifc = HOST.nic || { name: 'eth0', mac: 'fa:16:3e:8c:1a:2b', cidr: HOST.ip + '/24', brd: '10.0.1.255' };
    if (sub === 'addr' || sub === 'a' || sub === 'address' || !sub) {
      return ok([
        '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000',
        '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
        '    inet 127.0.0.1/8 scope host lo',
        '       valid_lft forever preferred_lft forever',
        '    inet6 ::1/128 scope host',
        '       valid_lft forever preferred_lft forever',
        '2: ' + ifc.name + ': <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000',
        '    link/ether ' + ifc.mac + ' brd ff:ff:ff:ff:ff:ff',
        '    inet ' + (ifc.cidr || (HOST.ip + '/24')) + ' brd ' + (ifc.brd || '10.0.1.255') + ' scope global noprefixroute ' + ifc.name,
        '       valid_lft forever preferred_lft forever',
        '    inet6 fe80::20c:29ff:fe8f:3a21/64 scope link noprefixroute',
        '       valid_lft forever preferred_lft forever',
        '3: docker0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default',
        '    link/ether 02:42:9f:1c:4d:71 brd ff:ff:ff:ff:ff:ff',
        '    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0'
      ]);
    }
    if (sub === 'route' || sub === 'r') {
      var gw = HOST.gateway || '10.0.1.1';
      return ok([
        'default via ' + gw + ' dev ' + ifc.name + ' proto dhcp src ' + HOST.ip + ' metric 100',
        (ifc.cidr ? ifc.cidr.replace(/\/\d+$/, '.0/24') : '10.0.1.0/24') + ' dev ' + ifc.name + ' proto kernel scope link src ' + HOST.ip,
        '172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1'
      ]);
    }
    if (sub === 'link' || sub === 'l') {
      return ok([
        '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000',
        '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
        '2: ' + ifc.name + ': <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000',
        '    link/ether ' + ifc.mac + ' brd ff:ff:ff:ff:ff:ff',
        '3: docker0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT group default'
      ]);
    }
    if (sub === 'neigh') {
      return ok([
        (HOST.gateway || '10.0.1.1') + ' dev ' + ifc.name + ' lladdr fa:16:3e:00:11:22 REACHABLE',
        '10.0.1.24 dev ' + ifc.name + ' lladdr fa:16:3e:9d:4c:88 STALE'
      ]);
    }
    return fail(['Object "' + sub + '" is unknown, try "ip help".']);
  };

  CMDS.ss = function (argv, ctx, stdin, HOST) {
    /* 支持 ss -tulnp 这种合并写法 */
    var letterFlags = { l: false, p: false, s: false, a: false, n: false };
    argv.forEach(function (a) {
      if (/^-[a-zA-Z]+$/.test(a)) a.slice(1).split('').forEach(function (c) { letterFlags[c] = true; });
    });
    if (letterFlags.s) return ok([
      'Total: 189',
      'TCP:   14 (estab 4, closed 6, orphaned 0, timewait 6)',
      '',
      'Transport Total     IP        IPv6',
      'RAW       0         0         0',
      'UDP       1         1         0',
      'TCP       14        14        0'
    ]);
    var listening = letterFlags.l;
    var showProc = letterFlags.p;
    var out = ['Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port' + (showProc ? '  Process' : '')];
    var rows = listening ? (window.CC_TERM_FS.listen || []) : (window.CC_TERM_FS.established || []);
    rows.forEach(function (r) {
      var state = r.state === 'LISTEN' ? 'LISTEN' : (r.state === 'UNCONN' ? 'UNCONN' : (r.state === 'ESTAB' ? 'ESTAB ' : 'TIME-W'));
      var line = pad(r.proto === 'tcp' ? 'tcp  ' : 'udp  ', 7) + pad(state, 7) +
        pad(String(r.recvq), 7) + pad(String(r.sendq), 7) +
        pad(r.local, 22) + pad(r.peer, 20);
      if (showProc && r.pid) line += ' users:(("' + r.proc + '",pid=' + r.pid + ',fd=' + (r.state === 'LISTEN' ? 6 : 12) + '))';
      out.push(line.replace(/\s+$/, ''));
    });
    return ok(out);
  };

  /* netstat：老命令，这里映射到 ss 的实现，方便习惯 netstat 的人练手 */
  CMDS.netstat = function (argv, ctx, stdin, HOST) {
    /* netstat -rn：路由表（教材里"查看网关"用的就是它） */
    var wantsRoute = argv.some(function (a) { return /^-[a-zA-Z]*r/.test(a); });
    if (wantsRoute) {
      var ifc = HOST.nic || { name: 'eth0', cidr: HOST.ip + '/24' };
      var gw = HOST.gateway || '10.0.1.1';
      var net = (ifc.cidr || '10.0.1.0/24').replace(/\.\d+\/\d+$/, '.0');
      return ok([
        'Kernel IP routing table',
        'Destination     Gateway         Genmask         Flags   MSS Window  irtt Iface',
        '0.0.0.0         ' + pad(gw, 16) + '0.0.0.0         UG        0 0          0 ' + ifc.name,
        pad(net, 16) + '0.0.0.0         ' + pad('255.255.255.0', 16) + 'U         0 0          0 ' + ifc.name,
        pad('172.17.0.0', 16) + '0.0.0.0         ' + pad('255.255.0.0', 16) + 'U         0 0          0 docker0'
      ]);
    }
    /* 其余情况：支持 netstat -tulnp 这类合并写法，转给 ss */
    var extra = [];
    argv.forEach(function (a) {
      if (/^-[a-zA-Z]+$/.test(a)) {
        extra = extra.concat(a.slice(1).split('').map(function (c) { return '-' + c; }));
      }
    });
    var hasL = extra.indexOf('-l') !== -1;
    var hasA = extra.indexOf('-a') !== -1;
    var ssArgs = extra.slice();
    if (!hasL && !hasA) ssArgs.push('-l');   /* netstat 默认只看监听 */
    var res = CMDS.ss(ssArgs);
    res.out.push('', '提示：netstat 已被 ss 取代（遍历 /proc 在高并发下会卡住）。等效写法：ss ' + ssArgs.join(' '));
    return res;
  };

  CMDS.lsof = function (argv, ctx, stdin, HOST) {
    /* `-i` 的值可以**贴在选项上**（`-i:8080`）也可以**分开写**（`-i :8080`）。
       早先只认前一种，于是 `lsof -i :8080` 里那个 `:8080` 被丢掉、port 变成 null，
       命令把**所有**连接都列出来 —— 学员要找 8080，屏幕上却是 sshd，
       而命令既不报错也不提示，看上去还挺正常。 */
    var portArg = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-i') {
        var next = argv[i + 1] === undefined ? '' : String(argv[i + 1]);
        if (next && next.charAt(0) !== '-') portArg = next;
        else portArg = '-i';
      } else if (a.indexOf('-i') === 0) {
        portArg = a;
      }
    }
    if (portArg) {
      var m = String(portArg).match(/:(\d+)/);
      var port = m ? m[1] : null;
      var out = ['COMMAND    PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME'];
      var rows = (window.CC_TERM_FS.listen || []).concat(window.CC_TERM_FS.established || []);
      rows.forEach(function (r) {
        if (port && r.local.indexOf(':' + port) === -1) return;
        out.push(pad(r.proc, 11) + padLeft(String(r.pid), 4) + ' ' + pad(r.proc === 'nginx' ? 'nginx' : 'root', 6) +
          '  ' + padLeft('6u', 3) + '  ' + pad('IPv4', 5) + pad('0t0', 8) + pad('0t0', 9) + pad('TCP', 5) + r.local + (r.state === 'LISTEN' ? ' (LISTEN)' : '->' + r.peer + ' (ESTABLISHED)'));
      });
      if (!port) out.push('');
      return ok(out);
    }
    if (argv.indexOf('+L1') !== -1 || argv.indexOf('-L1') !== -1) {
      return ok([
        'COMMAND    PID USER   FD   TYPE DEVICE SIZE/OFF NLINK    NODE NAME',
        'java     18442 root    7u   REG  253,1 165150720     0  524311 /data/app/logs/app.log (deleted)',
        '',
        '提示：这就是"df 显示满、du 算不到"的经典情况 —— 文件已被删除，但进程还持有句柄，空间没释放。',
        '处理方式：重启该进程（systemctl restart myapp），或用 `> /proc/18442/fd/7` 清空。'
      ]);
    }
    return ok(['COMMAND    PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME', '（教学环境只实现了 lsof -i 与 lsof +L1）']);
  };

  /* ---------- chmod ----------
     权限是 Linux 基础的核心内容（601/644/755/1777 这些数字天天用），
     而引擎此前**完全没有权限修改类命令**，导致「改了权限再 ls -l 验证」
     这条最经典的学习闭环根本走不通。
     支持：八进制（644/0755）、符号（u+x / go-w / a=r）、-R 递归、多文件。
     改动落在虚拟 FS 的 node.mode 上，随后 `ls -l` 会真实反映出来。 */
  CMDS.chmod = function (argv, ctx, stdin, HOST) {
    var opts = { R: false, v: false };
    var rest = [];
    argv.forEach(function (a) {
      if (/^-[Rv]+$/.test(a)) { a.slice(1).split('').forEach(function (c) { opts[c] = true; }); return; }
      if (a === '--recursive') { opts.R = true; return; }
      if (a.charAt(0) === '-' && !/^[0-7]+$/.test(a.slice(1))) return;
      rest.push(a);
    });
    if (rest.length < 2) return fail(['chmod: missing operand']);

    var spec = rest[0];
    var targets = rest.slice(1);

    function modeNum(node) {
      return parseInt(String(node.mode || (node.type === 'dir' ? '755' : '644')), 8);
    }
    function setMode(node, next) {
      node.mode = next.toString(8).padStart(4, '0').replace(/^0(?=[0-7]{3}$)/, '');
      /* 统一成 3 位或 4 位（有特殊位才留 4 位），与 termfs 里的写法一致 */
      if (node.mode.length === 4 && node.mode.charAt(0) === '0') node.mode = node.mode.slice(1);
    }

    /* 八进制：644 / 0755 / 1777（首位是特殊位 setuid/setgid/sticky） */
    function applyOctal(node, oct) {
      setMode(node, parseInt(oct, 8));
    }

    /* 符号模式：who(u/g/o/a) op(+/-/=) perms(r/w/x/X/s/t) */
    var symRe = /^([ugoa]*)([+\-=])([rwxXst]*)$/;
    function applySymbolic(node, expr) {
      var m = String(expr).match(symRe);
      if (!m) return false;
      var who = m[1] || 'a';
      var op = m[2];
      var perms = m[3];
      var bits = { r: 4, w: 2, x: 1 };
      var cur = modeNum(node);
      var groups = who.indexOf('a') !== -1 ? ['u', 'g', 'o'] : who.split('');
      groups.forEach(function (g) {
        var shift = g === 'u' ? 6 : g === 'g' ? 3 : 0;
        var mask = 7 << shift;
        var want = 0;
        for (var i = 0; i < perms.length; i++) {
          var c = perms.charAt(i);
          if (c === 'X') {
            /* X：目录、或已经有执行位的文件才加 x */
            if (node.type === 'dir' || (cur & 0o111)) want |= 1;
          } else if (bits[c] !== undefined) want |= bits[c];
        }
        want = want << shift;
        if (op === '+') cur |= want;
        else if (op === '-') cur &= ~want;
        else cur = (cur & ~mask) | want;
      });
      setMode(node, cur);
      return true;
    }

    function applyTo(node) {
      /* 符号模式可以逗号分隔多条子句：`chmod u+x,g-w file`、
         `chmod a+r,o-w file` —— 这是很常见的写法，必须逐条作用于同一个节点。 */
      var clauses = String(spec).split(',').filter(function (x) { return x !== ''; });
      if (/^[0-7]{3,4}$/.test(spec)) {
        applyOctal(node, spec);
      } else {
        for (var ci = 0; ci < clauses.length; ci++) {
          if (!applySymbolic(node, clauses[ci])) return false;
        }
      }
      if (opts.R && node.type === 'dir') {
        Object.keys(node.children || {}).forEach(function (k) { applyTo(node.children[k]); });
      }
      return true;
    }

    var err = [], out = [];
    var anyBad = false;
    targets.forEach(function (t) {
      var abs = resolvePath(ctx.cwd, t);
      var node = findNode(ctx.root, abs);
      if (!node) { err.push('chmod: cannot access \'' + t + '\': No such file or directory'); anyBad = true; return; }
      if (!applyTo(node)) { err.push('chmod: invalid mode: \'' + spec + '\''); anyBad = true; return; }
      if (opts.v) out.push('mode of \'' + t + '\' changed to ' + (node.mode || '').padStart(3, '0') +
        ' (' + permString(node) + ')');
    });
    if (!out.length) out.push('');
    return { out: out, err: err, code: anyBad ? 1 : 0 };
  };

  /* ---------- curl ---------- */
  /* 内容里有 40 多条 curl 示例，其中整节课（ln-curl-timing）讲的就是
     `-o /dev/null -w "%{http_code} %{time_total}"`。早先的实现只认 URL 与 `-I`，
     于是 `-o`、`-w`、`-f`、`-m`、`-X` 全被忽略、回复永远是同一段 JSON ——
     学员照示例敲出来的是**错的**，而且看不出来错。这里按真实 curl 的语义补齐。

     站点内的服务用一张表描述（状态码/头/正文/耗时），未知外部域名一律如实
     "Could not resolve host"，不假装成功。 */
  var CURL_ENDPOINTS = [
    { host: '127.0.0.1', port: '8080', path: '/health', status: 200, ctype: 'application/json',
      body: '{"status":"UP","ts":"2024-03-18T09:51:02+08:00"}', t: { dns: 0.000031, conn: 0.000212, tls: 0, ttfb: 0.004182, total: 0.004301 }, len: 46 },
    { host: '127.0.0.1', port: '8080', path: '/api/orders', status: 200, ctype: 'application/json',
      body: '[{"orderId":8812,"status":"PAID"},{"orderId":8813,"status":"CREATED"}]', t: { dns: 0.000028, conn: 0.000198, tls: 0, ttfb: 1.204118, total: 1.204442 }, len: 66 },
    { host: '127.0.0.1', port: '8080', path: '/api/orders/8812', status: 504, ctype: 'application/json',
      body: '{"timestamp":"2024-03-18T09:41:18+08:00","status":504,"error":"Gateway Timeout","message":"query timeout after 5000ms"}',
      t: { dns: 0.000030, conn: 0.000205, tls: 0, ttfb: 5.001204, total: 5.001688 }, len: 121 },
    { host: '127.0.0.1', port: '80', path: '/health', status: 200, ctype: 'text/html',
      body: '{"status":"UP","ts":"2024-03-18T09:51:02+08:00"}', t: { dns: 0.000026, conn: 0.000181, tls: 0, ttfb: 0.002041, total: 0.002118 }, len: 46 },
    { host: '10.0.1.23', port: '80', path: '/health', status: 200, ctype: 'text/html',
      body: '{"status":"UP","ts":"2024-03-18T09:51:02+08:00"}', t: { dns: 0.000024, conn: 0.000179, tls: 0, ttfb: 0.001988, total: 0.002065 }, len: 46 },
    { host: 'localhost', port: '80', path: '/', status: 200, ctype: 'text/html',
      body: '<!DOCTYPE html>\n<html>\n<head><title>My App</title></head>\n<body><h1>It works!</h1></body>\n</html>',
      t: { dns: 0.000022, conn: 0.000174, tls: 0, ttfb: 0.001802, total: 0.001901 }, len: 118 },
    { host: '127.0.0.1', port: '80', path: '/', status: 200, ctype: 'text/html',
      body: '<!DOCTYPE html>\n<html>\n<head><title>My App</title></head>\n<body><h1>It works!</h1></body>\n</html>',
      t: { dns: 0.000020, conn: 0.000168, tls: 0, ttfb: 0.001744, total: 0.001833 }, len: 118 },
    { host: '10.0.1.23', port: '80', path: '/', status: 200, ctype: 'text/html',
      body: '<!DOCTYPE html>\n<html>\n<head><title>My App</title></head>\n<body><h1>It works!</h1></body>\n</html>',
      t: { dns: 0.000019, conn: 0.000162, tls: 0, ttfb: 0.001712, total: 0.001798 }, len: 118 },
    { host: 'web.example.com', port: '80', path: '/', status: 200, ctype: 'text/html',
      body: '<!DOCTYPE html>\n<html><head><title>Web</title></head><body>ok</body></html>',
      t: { dns: 0.004211, conn: 0.012884, tls: 0, ttfb: 0.031442, total: 0.032118 }, len: 71 },
    { host: 'api.example.com', port: '443', path: '/v1/users', status: 200, ctype: 'application/json',
      body: '{"code":0,"data":{"id":1001,"name":"test"}}', t: { dns: 0.003812, conn: 0.014002, tls: 0.041882, ttfb: 0.062114, total: 0.062884 }, len: 38 },
    { host: 'api.example.com', port: '443', path: '/upload', status: 200, ctype: 'application/json',
      body: '{"code":0,"msg":"uploaded"}', t: { dns: 0.003802, conn: 0.014118, tls: 0.042004, ttfb: 0.088214, total: 0.088902 }, len: 26 },
    { host: 'www.huaweicloud.com', port: '443', path: '/', status: 200, ctype: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html lang="zh-CN"><head><title>华为云</title></head><body>Huawei Cloud</body></html>',
      t: { dns: 0.006118, conn: 0.024882, tls: 0.061004, ttfb: 0.112884, total: 0.114002 }, len: 92 },
    { host: 'example.com', port: '443', path: '/releases/app-1.2.0.tar.gz', status: 200, ctype: 'application/gzip',
      binary: 'app-1.2.0.tar.gz (18.4 MB)', t: { dns: 0.005802, conn: 0.022914, tls: 0.058118, ttfb: 0.101882, total: 0.142118 }, len: 19294822 },
    { host: 'example.com', port: '443', path: '/download/app.tar.gz', status: 302, ctype: 'text/html',
      location: 'https://cdn.example.com/releases/app-1.2.0.tar.gz',
      body: '<html><head><title>302 Found</title></head><body>302 Found</body></html>',
      t: { dns: 0.005811, conn: 0.023004, tls: 0.058904, ttfb: 0.103118, total: 0.118842 }, len: 78 },
    { host: 'example.com', port: '443', path: '/data/big.iso', status: 200, ctype: 'application/octet-stream',
      binary: 'big.iso (4.7 GB, supports range requests)', t: { dns: 0.005822, conn: 0.023118, tls: 0.059002, ttfb: 0.104882, total: 0.152004 }, len: 5046586573 },
    /* ── 以下几台补的是「内容里已经在 curl 的地址」──────────────────────
       它们此前不在端点表里，于是示例报 `Could not resolve host` ——
       而这类报错会把人**引向错误的方向**（去查 DNS/解析），
       真机上这些域名都是通的，问题根本不在解析。
       mo-grafana-api / hw-hcloud-config-init / sec-obs-bucket-acl 三条示例踩的就是这个。 */
    { host: 'grafana', port: '3000', path: '/api/health', status: 200, ctype: 'application/json',
      body: '{"commit":"a1b2c3d4e5","database":"ok","version":"10.4.1"}',
      t: { dns: 0.000412, conn: 0.002118, tls: 0, ttfb: 0.008842, total: 0.009204 }, len: 58 },
    { host: 'grafana', port: '3000', path: '/api/datasources', status: 200, ctype: 'application/json',
      body: '[{"id":1,"name":"Prometheus","type":"prometheus","url":"http://prometheus:9090","isDefault":true}]',
      t: { dns: 0.000408, conn: 0.002204, tls: 0, ttfb: 0.011882, total: 0.012418 }, len: 104 },
    /* 华为云 CLI 安装脚本（内容里教的就是这一条） */
    { host: 'hwcloudcli.obs.cn-north-1.myhuaweicloud.com', port: '443', path: '/cli/latest/hcloud_install.sh', status: 200,
      ctype: 'application/x-sh',
      body: '#!/bin/bash\n# Huawei Cloud CLI installer (教学环境仿真内容)\nset -e\nARCH=$(uname -m)\necho "Installing hcloud for ${ARCH} ..."\ninstall -m 0755 hcloud /usr/local/bin/hcloud\necho "hcloud installed. Run: hcloud configure"\n',
      t: { dns: 0.006204, conn: 0.025118, tls: 0.062884, ttfb: 0.118442, total: 0.121004 }, len: 218 },
    /* OBS 桶：**私有**桶对匿名 GET 返回 403，这正是"桶权限检查"要看的结果 */
    { host: 'prod-backup.obs.cn-north-4.myhuaweicloud.com', port: '443', path: '/', status: 403,
      ctype: 'application/xml',
      body: '<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>AccessDenied</Code><Message>Access Denied</Message><RequestId>0000018E3F2A1B4C</RequestId></Error>',
      t: { dns: 0.005118, conn: 0.022004, tls: 0.058118, ttfb: 0.098442, total: 0.101004 }, len: 178 }
  ];

  function curlLookup(url) {
    /* 不带协议时 curl 默认按 http:// 处理（`curl -I localhost` 是合法用法） */
    var u = String(url);
    if (!/^https?:\/\//.test(u)) u = 'http://' + u;
    var m = u.match(/^(https?):\/\/([^\/:]+)(?::(\d+))?(\/[^\s?]*)?(\?.*)?$/);
    if (!m) return { bad: 'curl: (3) URL using bad/illegal format or missing URL' };
    var scheme = m[1], host = m[2], port = m[3] || (scheme === 'https' ? '443' : '80');
    var path = m[4] || '/';
    for (var i = 0; i < CURL_ENDPOINTS.length; i++) {
      var e = CURL_ENDPOINTS[i];
      if (e.host !== host) continue;
      /* 端口写错也当"没有这个服务"，而不是悄悄回落到默认端口 */
      if (e.port !== port) continue;
      if (e.path === path) return { ep: e, host: host, port: port, path: path, scheme: scheme };
    }
    /* 主机认识但路径不存在 —— 要给 404，不能回落到首页，那样学员永远发现不了自己写错了路径 */
    for (var j = 0; j < CURL_ENDPOINTS.length; j++) {
      if (CURL_ENDPOINTS[j].host === host) {
        return { ep: { host: host, port: port, path: path, status: 404, ctype: 'text/html',
                       body: '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center></body></html>',
                       t: { dns: 0.000028, conn: 0.000191, tls: 0, ttfb: 0.001882, total: 0.001944 }, len: 146 },
                 host: host, port: port, path: path, scheme: scheme };
      }
    }
    return { refuse: host };
  }

  CMDS.curl = function (argv, ctx, stdin, HOST) {
    /* 合并短选项（`-sI`、`-sSf`）要先拆开，否则整串会被当成"不认识的选项"丢掉，
       结果是「命令没报错、但没按预期工作」——`curl -sI` 就是最常被写成合并形式的。 */
    var VALUE_FLAGS = 'owXHmdFucAbeEK';
    var expanded = [];
    argv.forEach(function (a) {
      if (/^-[a-zA-Z]{2,}$/.test(a) && a.slice(1).split('').every(function (c) { return VALUE_FLAGS.indexOf(c) === -1; })) {
        a.slice(1).split('').forEach(function (c) { expanded.push('-' + c); });
        return;
      }
      expanded.push(a);
    });
    argv = expanded;
    var headOnly = false, includeHead = false, silent = false, failOnError = false,
        follow = false, insecure = false, verbose = false, outFile = null, remoteName = false,
        writeOut = null, method = null, maxTime = null, data = null, resumeFrom = null;
    var headers = [], url = null;
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      if (a === '-I' || a === '--head') { headOnly = true; method = 'HEAD'; }
      else if (a === '-i' || a === '--include') includeHead = true;
      else if (a === '-s' || a === '--silent') silent = true;
      else if (a === '-S' || a === '--show-error') { /* 默认就会显示错误 */ }
      else if (a === '-f' || a === '--fail') failOnError = true;
      else if (a === '-L' || a === '--location') follow = true;
      else if (a === '-k' || a === '--insecure') insecure = true;
      else if (a === '-v' || a === '--verbose') verbose = true;
      else if (a === '-O' || a === '--remote-name') remoteName = true;
      else if (a === '-o' || a === '--output') outFile = argv[++i];
      else if (a === '-w' || a === '--write-out') writeOut = argv[++i];
      else if (a === '-X' || a === '--request') method = argv[++i];
      else if (a === '-m' || a === '--max-time') maxTime = Number(argv[++i]);
      else if (a === '--connect-timeout') { /* 接受但不单独计时 */ i++; }
      else if (a === '-H' || a === '--header') headers.push(argv[++i]);
      else if (a === '-d' || a === '--data' || a === '--data-raw' || a === '--data-binary') { data = argv[++i]; method = method || 'POST'; }
      else if (a === '-F' || a === '--form') { data = argv[++i]; method = method || 'POST'; }
      else if (a === '-C' || a === '--continue-at') resumeFrom = argv[++i];
      else if (a === '-u' || a === '--user') i++;
      else if (a === '--http1.1' || a === '--http2' || a === '--http2-prior-knowledge' || a === '--compressed' || a === '-g') { /* 协议开关：教学环境不区分 */ }
      else if (a === '--resolve') i++;
      else if (a.charAt(0) !== '-') url = a;
    }
    if (!url) return fail(['curl: try \'curl --help\' for more information']);

    var hit = curlLookup(url);
    if (hit.bad) return { out: [], err: [hit.bad], code: 3 };
    if (hit.refuse) {
      /* 认识这台机器但端口没服务 → Connection refused；完全不认识 → 解析失败 */
      var known = /^(127\.0\.0\.1|localhost|10\.0\.1\.23|10\.0\.2\.15|db-prod-01|cache-prod-01|web-prod-01|web\.example\.com|api\.example\.com|www\.huaweicloud\.com|example\.com)$/;
      if (known.test(hit.refuse)) {
        return { out: [], err: ['curl: (7) Failed to connect to ' + hit.refuse + ' port ' +
          ((String(url).match(/:(\d+)/) || [])[1] || '80') + ': Connection refused'], code: 7 };
      }
      /* ⚠️ **IP 字面量永远不需要 DNS**。早先不区分，于是
           curl http://10.0.1.31:8080/health
         报的是 `curl: (6) Could not resolve host: 10.0.1.31` ——
         学员据此去查 DNS/解析，而这条报错在真机上根本不可能出现（IP 没有解析这一步）。
         真机结果是连接类错误（7 拒绝 / 28 超时），这里按"拒绝"给，
         指向的正确下一步是"服务没起 / 端口不通"。
         只有**域名**形式的未知主机才可能是解析失败。 */
      var hostOnly = String(hit.refuse).replace(/^\[|\]$/g, '');
      var isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostOnly) || /^[0-9a-f:]+$/i.test(hostOnly) && hostOnly.indexOf(':') !== -1;
      if (isIp) {
        return { out: [], err: ['curl: (7) Failed to connect to ' + hit.refuse + ' port ' +
          ((String(url).match(/:(\d+)/) || [])[1] || '80') + ': Connection refused'], code: 7 };
      }
      return { out: [], err: ['curl: (6) Could not resolve host: ' + hit.refuse], code: 6 };
    }

    var ep = hit.ep;
    /* 超时：真实 curl 到点就断，并回 28 */
    if (maxTime !== null && ep.t.total > maxTime) {
      return { out: [], err: ['curl: (28) Operation timed out after ' + Math.round(maxTime * 1000) +
        ' milliseconds with 0 bytes received'], code: 28 };
    }
    var statusText = { 200: 'OK', 301: 'Moved Permanently', 302: 'Found', 404: 'Not Found',
                       500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' };
    var proto = hit.scheme === 'https' ? 'HTTP/2 200' : 'HTTP/1.1';
    var statusLine = (hit.scheme === 'https' ? 'HTTP/2 ' : 'HTTP/1.1 ') + ep.status + ' ' + (statusText[ep.status] || '');
    var hdr = [
      statusLine,
      'Server: ' + (ep.host === '127.0.0.1' && hit.port === '8080' ? 'Apache-Coyote/1.1' : 'nginx/1.20.1'),
      'Date: Mon, 18 Mar 2024 09:51:02 GMT',
      'Content-Type: ' + ep.ctype,
      'Content-Length: ' + ep.len
    ];
    if (ep.location) hdr.push('Location: ' + ep.location);
    if ((headers.join(' ') || '').indexOf('Accept: application/json') !== -1) hdr.push('Vary: Accept');
    hdr = hdr.concat(['Connection: keep-alive', 'ETag: "65f01a24-76"', 'Accept-Ranges: bytes']);

    var out = [], err = [];

    if (verbose) {
      out.push('*   Trying ' + (ep.host === '127.0.0.1' ? '127.0.0.1' : '10.0.1.31') + ':' + hit.port + '...');
      out.push('* Connected to ' + ep.host + ' (' + (ep.host === '127.0.0.1' ? '127.0.0.1' : '10.0.1.31') + ') port ' + hit.port);
      if (hit.scheme === 'https') {
        out.push('* TLSv1.3 (OUT), TLS handshake, Client hello (1)');
        out.push('* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384');
      }
      out.push('> ' + (method || 'GET') + ' ' + hit.path + ' HTTP/' + (hit.scheme === 'https' ? '2' : '1.1'));
      out.push('> Host: ' + ep.host);
      out.push('> User-Agent: curl/7.79.1');
      out.push('> Accept: */*');
      headers.forEach(function (h) { out.push('> ' + h); });
      out.push('>');
      hdr.forEach(function (h) { out.push('< ' + h); });
      out.push('<');
    }

    /* -f：4xx/5xx 直接失败且不输出正文（脚本里靠它判断成败） */
    if (failOnError && ep.status >= 400) {
      return { out: [], err: ['curl: (22) The requested URL returned error: ' + ep.status], code: 22 };
    }

    var bodyLines = ep.binary ? ['（二进制内容 ' + ep.binary + '，已保存/丢弃）'] : String(ep.body).split('\n');
    var toFile = outFile !== null || remoteName;
    if (toFile && !headOnly) {
      var target = remoteName ? hit.path.split('/').pop() : outFile;
      if (target && target !== '/dev/null') {
        var tmp = resolvePath(ctx.cwd, target);
        var dir = findNode(ctx.root, parentOf(tmp));
        if (!dir || dir.type !== 'dir') {
          return { out: [], err: ['Warning: Failed to create the file ' + target + ': No such file or directory',
                                  'curl: (23) Failure writing output to destination'], code: 23 };
        }
        var fnode = findNode(ctx.root, tmp);
        if (!fnode) { fnode = newNode('file', baseName(tmp)); dir.children[baseName(tmp)] = fnode; }
        fnode.content = ep.binary ? '<binary>' + ep.binary : String(ep.body);
        fnode.user = HOST.user || 'root';
      }
    } else if (!headOnly) {
      if (includeHead) hdr.forEach(function (h) { out.push(h); });
      if (resumeFrom) out.push('** Resuming transfer from byte position ' + resumeFrom);
      bodyLines.forEach(function (l) { out.push(l); });
    } else {
      hdr.forEach(function (h) { out.push(h); });
      if (includeHead) out.push('');
    }

    if (writeOut !== null) {
      var w = String(writeOut)
        .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/%%/g, '\u0000')
        .replace(/%\{http_code\}/g, String(ep.status))
        .replace(/%\{response_code\}/g, String(ep.status))
        .replace(/%\{time_total\}/g, ep.t.total.toFixed(6))
        .replace(/%\{time_namelookup\}/g, ep.t.dns.toFixed(6))
        .replace(/%\{time_connect\}/g, ep.t.conn.toFixed(6))
        .replace(/%\{time_appconnect\}/g, ep.t.tls.toFixed(6))
        .replace(/%\{time_starttransfer\}/g, ep.t.ttfb.toFixed(6))
        .replace(/%\{time_redirect\}/g, follow && ep.location ? '0.000000' : '0.000000')
        .replace(/%\{size_download\}/g, String(ep.len))
        .replace(/%\{size_header\}/g, '248')
        .replace(/%\{remote_ip\}/g, ep.host === '127.0.0.1' ? '127.0.0.1' : '10.0.1.31')
        .replace(/%\{remote_port\}/g, hit.port)
        .replace(/%\{url_effective\}/g, url)
        .replace(/%\{content_type\}/g, ep.ctype)
        .replace(/\u0000/g, '%');
      w.split('\n').forEach(function (l, idx, all) {
        if (idx === all.length - 1 && l === '') return;
        out.push(l);
      });
    }
    /* -s 只压进度条，我们本来就不打进度条，所以 -s 不影响正文 */
    void silent; void insecure; void data;
    return { out: out, err: err, code: 0 };
  };

  CMDS.ping = function (argv, ctx, stdin, HOST) {
    var positional = argv.filter(function (a) { return a.charAt(0) !== '-'; });
    var count = 4;
    for (var k = 0; k < argv.length; k++) {
      if (argv[k] === '-c') count = Number(argv[k + 1]) || 4;
      else if (/^-c\d+$/.test(argv[k])) count = Number(argv[k].slice(2));
    }
    /* -c 2 的 "2" 会被当成位置参数，必须排除掉 */
    var target = positional.filter(function (a) { return !/^\d+$/.test(a); })[0];
    if (!target) return fail(['ping: usage error: Destination address required']);
    var ipMap = { 'db-prod-01': '10.0.2.15', 'web-prod-01': HOST.ip, '8.8.8.8': '8.8.8.8', '127.0.0.1': '127.0.0.1', 'localhost': '127.0.0.1' };
    var ip = ipMap[target] || (/^\d+\.\d+\.\d+\.\d+$/.test(target) ? target : null);
    if (!ip || ip === '10.0.2.15') {
      var out = ['PING ' + target + ' (' + (ip || 'unknown') + ') 56(84) bytes of data.'];
      for (var i = 1; i <= count; i++) out.push('From ' + HOST.ip + ' icmp_seq=' + i + ' Destination Host Unreachable');
      out.push('');
      out.push('--- ' + target + ' ping statistics ---');
      out.push(count + ' packets transmitted, 0 received, +' + count + ' errors, 100% packet loss, time ' + (count * 1001) + 'ms');
      return { out: out, err: [], code: 1 };
    }
    var out2 = ['PING ' + target + ' (' + ip + ') 56(84) bytes of data.'];
    for (var j = 1; j <= count; j++) {
      out2.push('64 bytes from ' + ip + ': icmp_seq=' + j + ' ttl=64 time=' + (0.03 + j * 0.012).toFixed(3) + ' ms');
    }
    out2.push('');
    out2.push('--- ' + target + ' ping statistics ---');
    out2.push(count + ' packets transmitted, ' + count + ' received, 0% packet loss, time ' + (count * 1000) + 'ms');
    out2.push('rtt min/avg/max/mdev = 0.031/0.042/0.054/0.008 ms');
    return ok(out2);
  };

  CMDS.telnet = function (argv, ctx, stdin, HOST) {
    return telnetLike(argv, 'telnet', HOST);
  };

  /* telnet 与 nc 共用同一套连接模型，但**必须各自解析选项**：
     早先 `CMDS.nc = CMDS.telnet` 直接把参数原样透传，于是
     `nc -vz 10.0.1.31 8080` 会把 `-vz` 当主机名，输出
     `Trying -vz... Connected to -vz.` —— 而 `nc -vz <主机> <端口>`
     恰恰是"端口通不通"最标准的一条命令，站内速查里就在用它。 */
  function telnetLike(argv, name, HOST) {
    var opts = {}, rest = [];
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      /* ⚠️ 带值的选项必须在"合并字母选项"**之前**判断：
         `-w` 本身也匹配 /^-[a-zA-Z]+$/，先走那一条就会把 `-w` 当成 {w:true}，
         紧跟的 `3` 就被当成主机名 → `nc -vz -w 3 host port` 报
         getaddrinfo for host "3" failed。这是很常见的一种写法。 */
      if (a === '-w' || a === '-p' || a === '-s' || a === '-q') { i++; continue; }
      if (/^-w\d+$/.test(a) || /^-q\d+$/.test(a)) continue;
      if (/^-[a-zA-Z]+$/.test(a)) { a.slice(1).split('').forEach(function (c) { opts[c] = true; }); continue; }
      if (a.charAt(0) === '-') continue;
      rest.push(a);
    }
    var host = rest[0], port = rest[1];
    if (!host || !port) return fail([name + ': usage: ' + name + ' [-vz] <host> <port>']);

    /* 与 termfs / 站内场景一致的"已知结果" */
    var isDb = (host === 'db-prod-01' || host === '10.0.2.15');
    var known = { '10.0.1.23': 1, 'web-prod-01': 1, '10.0.1.31': 1, '10.0.1.32': 1, 'db-prod-01': 1, '10.0.2.15': 1, 'localhost': 1, '127.0.0.1': 1 };
    var ipOf = { 'db-prod-01': '10.0.2.15', 'web-prod-01': HOST.ip };

    if (!known[host]) {
      return fail([name + ': getaddrinfo for host "' + host + '" failed: Name or service not known']);
    }
    /* 3306 没被安全组放行：连得上但超时（与 hcloud 那条组合记录一致） */
    if (isDb && port === '3306') {
      return fail(['nc: connect to 10.0.2.15 port 3306 (tcp) failed: Connection timed out']);
    }
    /* 8080/80 只在 web 那两台上有服务 */
    if (!isDb && port !== '8080' && port !== '80' && port !== '22' && port !== '443') {
      return fail(['nc: connect to ' + host + ' port ' + port + ' (tcp) failed: Connection refused']);
    }

    var dash = name === 'nc';
    if (dash && (opts.z || opts.v)) {
      return ok(['Connection to ' + host + ' ' + port + ' port [tcp/*] succeeded!']);
    }
    return ok(['Trying ' + host + '...', 'Connected to ' + host + '.', 'Escape character is \'^]\'.']);
  }

  CMDS.nc = function (argv, ctx, stdin, HOST) {
    return telnetLike(argv, 'nc', HOST);
  };

  CMDS.dig = function (argv, ctx, stdin, HOST) {
    var name = argv.filter(function (a) { return a.charAt(0) !== '-' && a.charAt(0) !== '@' && a.charAt(0) !== '+'; })[0];
    if (!name) return fail(['dig: usage: dig name']);
    var known = { 'db-prod-01': '10.0.2.15', 'web-prod-01': HOST.ip, 'web.example.com': '121.36.44.17', 'obs.cn-north-4.myhuaweicloud.com': '49.4.112.90' };
    if (!known[name]) {
      return ok(['', '; <<>> DiG 9.11.4 <<>> ' + name, ';; global options: +cmd', ';; Got answer:', ';; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 41288', ';; QUESTION SECTION:', ';' + name + '.', '', ';; Query time: 2 msec', ';; SERVER: 100.125.1.250#53(100.125.1.250)']);
    }
    return ok([
      '', '; <<>> DiG 9.11.4-P2 <<>> ' + name, ';; global options: +cmd',
      ';; Got answer:', ';; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 31842',
      ';; flags: qr aa rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1',
      '', ';; OPT PSEUDOSECTION:', '; EDNS: version: 0, flags:; udp: 4096',
      ';; QUESTION SECTION:', ';' + name + '.\t\t\tIN\tA', '',
      ';; ANSWER SECTION:', name + '.\t300\tIN\tA\t' + known[name], '',
      ';; Query time: 1 msec', ';; SERVER: 100.125.1.250#53(100.125.1.250)',
      ';; WHEN: Mon Mar 18 09:51:02 CST 2024', ';; MSG SIZE  rcvd: 61'
    ]);
  };

  CMDS.nslookup = function (argv, ctx, stdin, HOST) {
    var name = argv.filter(function (a) { return a.charAt(0) !== '-' && a.charAt(0) !== '@'; })[0];
    if (!name) return fail(['nslookup: usage: nslookup name']);
    var known = { 'db-prod-01': '10.0.2.15', 'web-prod-01': HOST.ip, 'web.example.com': '121.36.44.17' };
    if (!known[name]) return { out: ['Server:\t\t100.125.1.250', 'Address:\t100.125.1.250#53', '', '** server can\'t find ' + name + ': NXDOMAIN'], err: [], code: 1 };
    return ok(['Server:\t\t100.125.1.250', 'Address:\t100.125.1.250#53', '', 'Name:\t' + name, 'Address: ' + known[name]]);
  };

  /* host：老的 DNS 查询工具，输出形如 canonical name 链（很多教材第一节就讲它） */
  CMDS.host = function (argv, ctx, stdin, HOST) {
    var name = argv.filter(function (a) { return a.charAt(0) !== '-'; })[0];
    if (!name) return fail(['Usage: host [-aCdlriTwv] [-c class] [-N ndots] [-t type] [-W time] name [server]']);
    var CANON = {
      'www.163.com': {
        chain: [
          'www.163.com\tcanonical name = www.163.com.163jiasu.com.',
          'www.163.com.163jiasu.com\tcanonical name = www.163.com.a.bdydns.com.',
          'www.163.com.a.bdydns.com\tcanonical name = opencdn126music.jomodns.com.'
        ],
        target: 'opencdn126music.jomodns.com',
        v4: '182.40.118.54',
        v6: '240e:93c:205:2::2463:e123'
      },
      'www.baidu.com': {
        chain: ['www.baidu.com\tcanonical name = www.a.shifen.com.'],
        target: 'www.a.shifen.com',
        v4: '103.235.46.102',
        v6: null
      },
      'web.example.com': {
        chain: [], target: 'web.example.com', v4: '121.36.44.17', v6: null
      }
    };
    var c = CANON[name];
    if (!c) {
      return { out: ['Host ' + name + ' not found: 3(NXDOMAIN)'], err: [], code: 1 };
    }
    var lines = ['Non-authoritative answer:'];
    c.chain.forEach(function (l) { lines.push(l); });
    lines.push('Name:\t' + c.target);
    lines.push('Address: ' + c.v4);
    if (c.v6) lines.push('Address: ' + c.v6);
    return ok(lines);
  };

  /* nmcli：NetworkManager 命令行，教材里讲"永久配置 IP"必用。
     网卡名/IP/网关/DNS 都从 HOST 读，因此实验台复刻页可以声明自己那台机器的配置。 */
  CMDS.nmcli = function (argv, ctx, stdin, HOST) {
    var sub = argv[0], sub2 = argv[1], dev = argv[2];
    var ifc = HOST.nic || { name: 'eth0', mac: 'fa:16:3e:8c:1a:2b', cidr: HOST.ip + '/24' };
    var gw = HOST.gateway || '10.0.1.1';
    var dns = HOST.dns || ['100.125.1.250', '114.114.114.114'];
    var uuid = HOST.nicUuid || '8b3f2f6e-4d2a-4f19-9a0e-3f0a21c9c111';

    if (sub === 'device' && (sub2 === 'show' || sub2 === 'status' || !sub2)) {
      if (sub2 === 'status') {
        return ok([
          'DEVICE  TYPE      STATE                   CONNECTION',
          pad(ifc.name, 8) + 'ethernet  connected               ' + ifc.name,
          'lo      loopback  connected (externally)  lo'
        ]);
      }
      var iface = dev || ifc.name;
      if (iface !== ifc.name) return fail(['Error: Device \'' + iface + '\' not found.']);
      var out = [
        'GENERAL.DEVICE:                         ' + ifc.name,
        'GENERAL.TYPE:                           ethernet',
        'GENERAL.HWADDR:                         ' + String(ifc.mac).toUpperCase(),
        'GENERAL.MTU:                            1500',
        'GENERAL.STATE:                          100 (connected)',
        'GENERAL.CONNECTION:                     ' + ifc.name,
        'GENERAL.CON-PATH:                       /org/freedesktop/NetworkManager/ActiveConnection/2',
        'WIRED-PROPERTIES.CARRIER:               on',
        'IP4.ADDRESS[1]:                         ' + (ifc.cidr || (HOST.ip + '/24')),
        'IP4.GATEWAY:                            ' + gw,
        'IP4.ROUTE[1]:                           dst = 0.0.0.0/0, nh = ' + gw + ', mt = 100',
        'IP4.ROUTE[2]:                           dst = ' + String(ifc.cidr || '10.0.1.0/24').replace(/\.\d+\/\d+$/, '.0/24') + ', nh = 0.0.0.0, mt = 100'
      ];
      dns.forEach(function (d, i) { out.push('IP4.DNS[' + (i + 1) + ']:' + ' '.repeat(Math.max(1, 25 - String(i).length)) + d); });
      out.push('IP6.ADDRESS[1]:                         fe80::20c:29ff:fe8f:3a21/64');
      out.push('IP6.GATEWAY:                            --');
      return ok(out);
    }
    if (sub === 'con' || sub === 'connection') {
      if (sub2 === 'show' && !dev) {
        return ok([
          'NAME    UUID                                  TYPE      DEVICE',
          pad(ifc.name, 8) + uuid + '  ethernet  ' + ifc.name,
          'lo      4c1a9d02-71b3-4f8e-9c2d-6a0b1e7f3c88  loopback  lo'
        ]);
      }
      if (sub2 === 'show' && dev) {
        return ok([
          'connection.id:                          ' + ifc.name,
          'connection.uuid:                        ' + uuid,
          'connection.type:                        802-3-ethernet',
          'connection.autoconnect:                 yes',
          'ipv4.method:                            manual',
          'ipv4.addresses:                         ' + (ifc.cidr || (HOST.ip + '/24')),
          'ipv4.gateway:                           ' + gw,
          'ipv4.dns:                               ' + dns.join(',')
        ]);
      }
      if (sub2 === 'up') return ok(['Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/3)']);
      if (sub2 === 'down') return ok(['Connection \'' + (dev || '') + '\' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/3)']);
      /* nmcli 支持缩写：modify / mod / m 都接受（教材里普遍写 mod） */
      if (sub2 === 'modify' || sub2 === 'mod' || sub2 === 'm') {
        var changed = argv.slice(3).join(' ');
        return ok([
          '（教学环境已模拟修改：' + (changed || '配置项') + '）',
          '',
          '真机上 nmcli con mod 改的是 /etc/sysconfig/network-scripts/ifcfg-' + ifc.name + '，',
          '改完必须 nmcli con up ' + ifc.name + ' 才会生效。'
        ]);
      }
      if (sub2 === 'add' || sub2 === 'delete' || sub2 === 'del') {
        return ok(['（教学环境已模拟 ' + sub2 + ' 操作）']);
      }
    }
    if (sub === 'general') return ok(['STATE:      connected', 'CONNECTIVITY: full', 'WIFI-HW:    enabled']);
    return fail(['Error: argument \'' + (sub || '') + '\' not understood. Try \'nmcli help\'.']);
  };


  CMDS.nmtui = function (argv, ctx, stdin, HOST) {
    return ok([
      'nmtui：这是全屏交互式界面（curses），单行终端无法模拟。',
      '',
      '等价命令行做法（教材同时也讲这个）：',
      '  nmcli con mod ens160 ipv4.addresses 192.168.17.10/24',
      '  nmcli con mod ens160 ipv4.gateway 192.168.17.1',
      '  nmcli con mod ens160 ipv4.dns "114.114.114.114 223.5.5.5"',
      '  nmcli con up ens160'
    ]);
  };

  CMDS.traceroute = function (argv, ctx, stdin, HOST) {
    var positional = argv.filter(function (a) { return a.charAt(0) !== '-'; });
    var target = positional[0];
    if (!target) return fail(['traceroute: usage: traceroute host']);
    /* 复刻页/教材里的经典目标：输出形状按真实跳数写好 */
    if (target === 'www.baidu.com') {
      return ok([
        'traceroute to www.baidu.com (103.235.46.102), 30 hops max, 60 byte packets',
        ' 1  192.168.17.1  0.503 ms  0.014 ms  0.008 ms',
        ' 2  10.36.68.214  1.344 ms  1.353 ms  1.320 ms',
        ' 3  11.73.8.162  1.535 ms  11.73.10.174  1.384 ms  11.73.61.21  1.657 ms',
        ' 4  11.29.19.45  1.238 ms  26.25.185.97  1.247 ms  *',
        ' 5  10.216.220.134  2.858 ms  10.216.220.102  2.122 ms  10.216.220.134  2.229 ms',
        ' 6  *  10.216.229.98  2.866 ms  10.216.229.90  2.865 ms',
        ' 7  * * *',
        ' 8  * * *'
      ]);
    }
    return ok([
      'traceroute to ' + target + ' (121.36.44.17), 30 hops max, 60 byte packets',
      ' 1  10.0.1.1 (10.0.1.1)  0.412 ms  0.388 ms  0.371 ms',
      ' 2  100.64.0.1 (100.64.0.1)  1.021 ms  1.004 ms  0.982 ms',
      ' 3  * * *',
      ' 4  219.158.16.65 (219.158.16.65)  8.442 ms  8.411 ms  8.390 ms',
      ' 5  121.36.44.17 (121.36.44.17)  12.884 ms  12.851 ms  12.820 ms'
    ]);
  };

  CMDS.tcpdump = function (argv, ctx, stdin, HOST) {
    return ok([
      'tcpdump: verbose output suppressed, use -v or -vv for full protocol decode',
      'listening on any, link-type LINUX_SLL (Linux cooked), capture size 262144 bytes',
      '09:51:02.114382 IP 203.0.113.25.51390 > ' + HOST.ip + '.80: Flags [S], seq 1842291042, win 64240, options [mss 1460,sackOK,TS val 882134 ecr 0,nop,wscale 7], length 0',
      '09:51:02.114451 IP ' + HOST.ip + '.80 > 203.0.113.25.51390: Flags [S.], seq 3391048211, ack 1842291043, win 28960, options [mss 1460,sackOK,TS val 1188234 ecr 882134,nop,wscale 7], length 0',
      '09:51:02.115002 IP 203.0.113.25.51390 > ' + HOST.ip + '.80: Flags [.], ack 1, win 502, length 0',
      '09:51:02.115118 IP 203.0.113.25.51390 > ' + HOST.ip + '.80: Flags [P.], seq 1:118, ack 1, win 502, length 117: HTTP: GET /healthz HTTP/1.1',
      '',
      '（教学环境只展示前几个报文；真机会持续输出，务必用 -c 限制数量，否则会打满磁盘）'
    ]);
  };

  CMDS.firewall_cmd = function (argv, ctx, stdin, HOST) {
    if (argv.indexOf('--list-all') !== -1) {
      return ok([
        'public (active)',
        '  target: default',
        '  icmp-block-inversion: no',
        '  interfaces: eth0',
        '  sources:',
        '  services: dhcpv6-client ssh',
        '  ports: 80/tcp 8080/tcp',
        '  protocols:',
        '  masquerade: no',
        '  forward-ports:',
        '  source-ports:',
        '  icmp-blocks:',
        '  rich rules:'
      ]);
    }
    if (argv.indexOf('--state') !== -1) return ok(['running']);
    if (argv.indexOf('--query-port') !== -1 || argv.join(' ').indexOf('--query-port=') !== -1) {
      var qp = '';
      for (var qi = 0; qi < argv.length; qi++) {
        var sa = String(argv[qi]);
        if (sa.indexOf('--query-port=') === 0) qp = sa.slice('--query-port='.length);
        else if (sa === '--query-port' && argv[qi + 1]) qp = String(argv[qi + 1]);
      }
      var allowed = qp === '80/tcp' || qp === '8080/tcp';
      return ok([allowed ? 'yes' : 'no']);
    }
    if (argv.indexOf('--add-port') !== -1) {
      return ok([
        'success',
        '',
        '注意：加 --permanent 才会写入配置；只加 --add-port 属于"临时规则"，firewalld 重启即失效。',
        '两条都要做：firewall-cmd --permanent --add-port=443/tcp && firewall-cmd --reload'
      ]);
    }
    return ok(['success']);
  };

  CMDS.systemctl = function (argv, ctx, stdin, HOST) {
    var sub = argv[0], unit = argv[1];
    if (sub === 'status') {
      if (!unit) return fail(['systemctl: 需要指定服务名']);
      var s = (window.CC_TERM_FS.services || {})[unit.replace(/\.service$/, '')];
      if (!s) return { out: [], err: ['Unit ' + unit + '.service could not be found.'], code: 4 };
      if (s.active === 'active (running)') {
        return ok([
          '● ' + unit.replace(/\.service$/, '') + '.service - ' + s.desc,
          '   Loaded: ' + s.load + ' (/usr/lib/systemd/system/' + unit.replace(/\.service$/, '') + '.service; enabled; vendor preset: disabled)',
          '   Active: ' + s.active + ' since ' + s.since,
          ' Main PID: ' + s.pid + ' (java)',
          '   Memory: ' + s.mem,
          '   CGroup: /system.slice/' + unit.replace(/\.service$/, '') + '.service',
          '           └─' + s.pid + ' /usr/bin/java -jar /opt/myapp/app.jar',
          '',
          'Mar 18 09:38:33 web-prod-01 systemd[1]: Started ' + s.desc + '.'
        ]);
      }
      return { out: [
        '○ ' + unit.replace(/\.service$/, '') + '.service - ' + s.desc,
        '   Loaded: ' + s.load + ' (/usr/lib/systemd/system/' + unit.replace(/\.service$/, '') + '.service; disabled; vendor preset: disabled)',
        '   Active: ' + s.active
      ], err: [], code: 3 };
    }
    if (sub === 'is-active') {
      var s2 = (window.CC_TERM_FS.services || {})[unit.replace(/\.service$/, '')];
      return ok([s2 && s2.active === 'active (running)' ? 'active' : 'inactive']);
    }
    if (sub === 'is-enabled') {
      var s3 = (window.CC_TERM_FS.services || {})[unit.replace(/\.service$/, '')];
      if (!s3 || s3.load === 'not-found') return { out: [], err: ['Failed to get unit file state for ' + unit + ': No such file or directory'], code: 1 };
      return ok([unit === 'firewalld' ? 'disabled' : 'enabled']);
    }
    if (sub === 'restart' || sub === 'start' || sub === 'stop' || sub === 'reload') {
      return ok([
        '（教学环境已模拟 ' + sub + ' ' + unit + '；真机上这条命令会立刻影响服务，操作前先确认影响面）'
      ]);
    }
    if (sub === 'daemon-reload') return ok([]);
    /* ── show：给脚本取单个属性用的（`-p MainPID --value`）──
       ⚠️ 这里早先是**完全没有实现**：`systemctl show -p MainPID --value myapp`
       返回空，于是站内 pf-ulimit-n 的示例
         cat /proc/$(systemctl show -p MainPID --value myapp)/limits
       展开成 `cat /proc//limits`，报 No such file —— 学员会以为"服务没在跑"，
       而其实只是这条子命令没人做。属性值取自与 `status` 同一份服务表，
       两处不会互相矛盾。 */
    if (sub === 'show') {
      var shUnit = null, shProps = [], shValue = false;
      for (var shi = 1; shi < argv.length; shi++) {
        var sha = String(argv[shi]);
        if (sha === '-p' || sha === '--property') { shProps.push(String(argv[++shi]).replace(/=$/, '')); continue; }
        if (/^--property=/.test(sha)) { shProps.push(sha.slice(11).replace(/=$/, '')); continue; }
        if (/^-p./.test(sha)) { shProps.push(sha.slice(2).replace(/=$/, '')); continue; }
        if (sha === '--value') { shValue = true; continue; }
        if (sha === '--no-pager' || sha === '--all' || sha === '--full') continue;
        if (sha.charAt(0) === '-') continue;
        if (shUnit === null) shUnit = sha;
      }
      if (!shUnit) return fail(['systemctl: 需要指定服务名']);
      var bare = shUnit.replace(/\.service$/, '');
      var svc = (window.CC_TERM_FS.services || {})[bare];
      if (!svc) return { out: [], err: ['Unit ' + bare + '.service could not be found.'], code: 4 };
      var running = svc.active === 'active (running)';
      var props = {
        Id: bare + '.service',
        Description: svc.desc,
        LoadState: svc.load === 'not-found' ? 'not-found' : 'loaded',
        ActiveState: running ? 'active' : 'inactive',
        SubState: running ? 'running' : 'dead',
        UnitFileState: bare === 'firewalld' ? 'disabled' : 'enabled',
        MainPID: running ? String(svc.pid) : '0',
        ExecMainPID: running ? String(svc.pid) : '0',
        MemoryCurrent: svc.mem,
        FragmentPath: '/usr/lib/systemd/system/' + bare + '.service',
        Restart: 'on-failure'
      };
      var keys = shProps.length ? shProps : Object.keys(props);
      var lines = [];
      keys.forEach(function (k) {
        if (!(k in props)) return;
        lines.push(shValue ? String(props[k]) : k + '=' + props[k]);
      });
      return ok(lines);
    }
    if (sub === 'enable') return ok(['Created symlink /etc/systemd/system/multi-user.target.wants/' + unit + ' → /usr/lib/systemd/system/' + unit + '.']);
    if (sub === 'disable') return ok(['Removed /etc/systemd/system/multi-user.target.wants/' + unit + '.']);
    if (sub === 'list-units' || sub === 'list-unit-files' || argv.indexOf('--failed') !== -1) {
      return ok([
        'UNIT FILE                STATE    VENDOR PRESET',
        'myapp.service            enabled  disabled',
        'nginx.service            enabled  disabled',
        'docker.service           enabled  disabled',
        'firewalld.service        disabled enabled',
        '',
        '5 unit files listed.'
      ]);
    }
    /* ── `systemctl cat <unit>`：把 unit 文件与所有 drop-in 覆盖内容打出来 ──
       排障时"这个服务到底是怎么配的"最权威的来源就是它 ——
       比 `cat /usr/lib/systemd/system/xxx.service` 强在**会一并显示 drop-in 覆盖**
       （/etc/systemd/system/xxx.service.d/*.conf），而很多"改了没生效"
       正是因为真正的值在 drop-in 里、被它覆盖了。 */
    if (sub === 'cat') {
      var catUnit = argv.filter(function (a) { return a.charAt(0) !== '-'; })[1];
      if (!catUnit) return fail(['systemctl: 需要指定服务名']);
      var cb = catUnit.replace(/\.service$/, '');
      var csvc = (window.CC_TERM_FS.services || {})[cb];
      var cPath = (csvc && csvc.path) || ('/usr/lib/systemd/system/' + cb + '.service');
      var out = ['# ' + cPath];
      var cnode = findNode(ctx.root, cPath);
      if (cnode && cnode.content) {
        splitLines(String(cnode.content)).forEach(function (l) { out.push(l); });
      } else {
        /* unit 文件不在虚拟 FS 里时，按服务表补一份等价内容 */
        out.push('[Unit]');
        out.push('Description=' + ((csvc && csvc.desc) || cb));
        out.push('After=network-online.target');
        out.push('');
        out.push('[Service]');
        out.push('Type=simple');
        out.push('ExecStart=' + ((csvc && csvc.exec) || '/usr/bin/' + cb));
        out.push('Restart=on-failure');
        out.push('LimitNOFILE=65535');
        out.push('');
        out.push('[Install]');
        out.push('WantedBy=multi-user.target');
      }
      out.push('');
      out.push('（教学环境）真机上若有 /etc/systemd/system/' + cb + '.service.d/*.conf，');
      out.push('它们会**追加在后面**并覆盖同名配置项 —— "改了 unit 却没生效"多半就是这个原因。');
      out.push('查覆盖来源：systemctl cat 会全部列出来，配合 `systemctl show -p <项>` 看最终生效值。');
      return ok(out);
    }
    /* ── `systemctl list-timers`：定时任务不止 cron 一种 ── */
    if (sub === 'list-timers') {
      var all = argv.indexOf('--all') !== -1;
      var tl = [
        'NEXT                         LEFT       LAST                         PASSED    UNIT                         ACTIVATES',
        'Mon 2024-03-18 02:00:00 CST  16h left   Sun 2024-03-17 02:00:01 CST  7h ago    logrotate.timer              logrotate.service',
        'Mon 2024-03-18 07:12:00 CST  21h left   Sun 2024-03-17 07:12:04 CST  2h ago    dnf-makecache.timer          dnf-makecache.service',
        'Mon 2024-03-18 10:51:00 CST  1h 0min    Mon 2024-03-18 09:51:00 CST  0s ago    systemd-tmpfiles-clean.timer systemd-tmpfiles-clean.service'
      ];
      if (all) {
        tl.push('n/a                          n/a        n/a                          n/a       fstrim.timer                 fstrim.service');
      }
      tl.push('');
      tl.push(all ? '4 timers listed.' : '3 timers listed.');
      tl.push('（教学环境）systemd 时代"定时任务"有两种：`crontab` 与 **timer**。');
      tl.push('timer 的好处是有日志（`journalctl -u xxx.timer`）、能依赖其他 unit（`After=`）、');
      tl.push('还能设 `Persistent=true` —— **错过的任务开机后补跑一次**，而 cron 错过就永远错过了。');
      return ok(tl);
    }
    return fail(['Unknown operation ' + sub + '.']);
  };

  CMDS.journalctl = function (argv, ctx, stdin, HOST) {
    var unit = null, lines = 10;
    for (var i = 0; i < argv.length; i++) {
      if (argv[i] === '-u' || argv[i] === '--unit') unit = argv[++i];
      else if (argv[i] === '-n' || argv[i] === '--lines') lines = Number(argv[++i]);
      else if (String(argv[i]).indexOf('-n') === 0 && argv[i].length > 2) lines = Number(argv[i].slice(2));
    }
    var JOURNAL = {
      myapp: [
        'Mar 18 09:38:33 web-prod-01 systemd[1]: Started My Web App.',
        'Mar 18 09:38:33 web-prod-01 java[18442]: 2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3',
        'Mar 18 09:38:42 web-prod-01 java[18442]: 2024-03-18 09:38:42.113  INFO 1 --- [main] c.e.OrdersApplication : Started OrdersApplication in 8.42 seconds',
        'Mar 18 09:41:18 web-prod-01 java[18442]: 2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812',
        'Mar 18 09:42:07 web-prod-01 java[18442]: 2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813'
      ],
      nginx: [
        'Mar 16 10:01:55 web-prod-01 systemd[1]: Starting The nginx HTTP and reverse proxy server...',
        'Mar 16 10:01:55 web-prod-01 nginx[1842]: nginx: configuration file /etc/nginx/nginx.conf test is successful',
        'Mar 16 10:01:55 web-prod-01 systemd[1]: Started The nginx HTTP and reverse proxy server.'
      ],
      docker: [
        'Mar 16 10:00:12 web-prod-01 systemd[1]: Starting Docker Application Container Engine...',
        'Mar 16 10:00:12 web-prod-01 dockerd[1204]: time="2024-03-16T10:00:12.114Z" level=info msg="Docker daemon" commit=311b9ff version=24.0.7',
        'Mar 16 10:00:12 web-prod-01 systemd[1]: Started Docker Application Container Engine.'
      ],
      sshd: [
        'Mar 18 08:12:03 web-prod-01 sshd[18442]: Accepted publickey for deploy from 203.0.113.25 port 51234 ssh2',
        'Mar 18 09:02:31 web-prod-01 sshd[19008]: Failed password for invalid user admin from 198.51.100.77 port 40221 ssh2'
      ]
    };
    if (!unit) {
      return ok(['-- Logs begin at Mon 2024-03-04 08:02:11 CST, end at Mon 2024-03-18 09:51:00 CST. --',
        'Mar 18 09:51:00 web-prod-01 systemd[1]: 教学环境：请用 -u <服务名> 查看指定服务的日志，例如 journalctl -u myapp -n 50']);
    }
    var key = String(unit).replace(/\.service$/, '');
    var rows = JOURNAL[key];
    if (!rows) return ok(['-- No entries --']);
    return ok(rows.slice(Math.max(0, rows.length - lines)));
  };

  CMDS.crontab = function (argv, ctx, stdin, HOST) {
    if (argv.indexOf('-l') !== -1) {
      return ok([
        'SHELL=/bin/bash',
        'PATH=/sbin:/bin:/usr/sbin:/usr/bin',
        'MAILTO=root',
        '',
        '0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1',
        '*/5 * * * * /usr/bin/curl -s http://127.0.0.1:8080/health >> /var/log/health.log 2>&1'
      ]);
    }
    if (argv.indexOf('-r') !== -1) {
      return ok(['（教学环境不会真的清空 crontab；真机上 crontab -r 没有二次确认，且不可恢复）']);
    }
    return ok(['（教学环境不打开编辑器；真机上 crontab -e 会打开 VI 让你编辑）']);
  };

  CMDS.cat_proc = null;

  /* ---------- 进程 / 性能 ---------- */
  /* 进程表：ps / pgrep / pkill / top 共用同一份，避免几个命令各说各话 */
  function procTable() {
    return [
      { user: 'root', pid: 1, cpu: '0.0', mem: '0.1', cmd: '/usr/lib/systemd/systemd --switched-root --system --deserialize 18' },
      { user: 'root', pid: 1180, cpu: '0.0', mem: '0.1', cmd: '/usr/sbin/sshd -D' },
      { user: 'root', pid: 1204, cpu: '0.7', mem: '1.8', cmd: '/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock' },
      { user: 'root', pid: 1842, cpu: '0.3', mem: '0.2', cmd: 'nginx: master process /usr/sbin/nginx -c /etc/nginx/nginx.conf' },
      { user: 'nginx', pid: 1843, cpu: '0.4', mem: '0.2', cmd: 'nginx: worker process' },
      { user: 'root', pid: 2210, cpu: '2.1', mem: '22.8', cmd: '/usr/sbin/mysqld --defaults-file=/etc/my.cnf' },
      { user: 'redis', pid: 3390, cpu: '0.2', mem: '0.4', cmd: '/usr/bin/redis-server 127.0.0.1:6379' },
      { user: 'deploy', pid: 18442, cpu: '68.4', mem: '7.7', cmd: '/usr/bin/java -jar /opt/myapp/app.jar' },
      { user: 'root', pid: 4102, cpu: '0.1', mem: '0.2', cmd: '/usr/local/bin/node_exporter' },
      { user: 'root', pid: 88231, cpu: '0.0', mem: '0.0', cmd: 'ps aux' }
    ];
  }

  /* pgrep 的匹配对象是**进程名**（cmd 的第一段 basename），-f 才匹配整行 */
  function procName(row) {
    var first = String(row.cmd).trim().split(/\s+/)[0];
    if (first.indexOf('nginx:') === 0) return 'nginx';
    return baseName(first);
  }

  function pgrepSelect(argv) {
    var flags = { f: false, x: false, c: false, l: false, a: false, n: false, o: false, i: false, v: false };
    var user = null, pattern = null;
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i];
      if (a === '-u' || a === '--uid' || a === '-U') { user = argv[++i]; continue; }
      if (/^-u\S+/.test(a)) { user = a.slice(2); continue; }
      if (/^-[a-zA-Z]+$/.test(a)) { a.slice(1).split('').forEach(function (c) { flags[c] = true; }); continue; }
      if (pattern === null) pattern = a;
    }
    return { flags: flags, user: user, pattern: pattern };
  }

  /* pgrep：按名字/整行找进程，输出 PID。
     注意 **pattern 可以省略**（真机上 `pgrep -u deploy` 就是"列这个用户的所有进程"），
     内容里就有 `pgrep -c -u deploy` 这种写法。 */
  CMDS.pgrep = function (argv, ctx, stdin, HOST) {
    var sel = pgrepSelect(argv);
    if (sel.pattern === null) sel.pattern = '';
    var pat = sel.flags.i ? sel.pattern.toLowerCase() : sel.pattern;
    var hits = procTable().filter(function (r) {
      if (sel.user && r.user !== sel.user) return false;
      var hay = sel.flags.f ? r.cmd : procName(r);
      if (sel.flags.i) hay = hay.toLowerCase();
      var hit = sel.flags.x ? hay === pat : hay.indexOf(pat) !== -1;
      return sel.flags.v ? !hit : hit;
    });
    if (!hits.length) return { out: [], err: [], code: 1 };
    if (sel.flags.c) return ok([String(hits.length)]);
    if (sel.flags.n) hits = [hits[hits.length - 1]];
    if (sel.flags.o) hits = [hits[0]];
    var out = hits.map(function (r) {
      if (sel.flags.l) return String(r.pid) + ' ' + procName(r);
      if (sel.flags.a) return String(r.pid) + ' ' + r.cmd;
      return String(r.pid);
    });
    return ok(out);
  };

  /* pkill：真机上会真的结束进程。教学环境是静态快照，不能假装杀掉了 ——
     如实说明"匹配到了谁、真机上会发生什么"，但**不要**报成功却什么都没变。 */
  CMDS.pkill = function (argv, ctx, stdin, HOST) {
    var sel = pgrepSelect(argv);
    if (sel.pattern === null) return fail(['Usage: pkill [OPTIONS] <pattern>']);
    var sig = 'SIGTERM';
    argv.forEach(function (a) {
      var m = String(a).match(/^-(\d+)$/);
      if (m) sig = 'SIG' + m[1];
      if (String(a).indexOf('-SIG') === 0) sig = String(a).slice(1);
    });
    var pat = sel.pattern;
    var hits = procTable().filter(function (r) {
      if (sel.user && r.user !== sel.user) return false;
      var hay = sel.flags.f ? r.cmd : procName(r);
      return sel.flags.x ? hay === pat : hay.indexOf(pat) !== -1;
    });
    if (!hits.length) return { out: [], err: [], code: 1 };
    return {
      out: [],
      err: ['（教学环境：已匹配到 ' + hits.length + ' 个进程 ' + hits.map(function (r) { return r.pid + '/' + procName(r); }).join(' ') +
            '，真机上会向它们发送 ' + sig + '；模拟终端不会真的结束进程）'],
      code: 0
    };
  };

  CMDS.ps = function (argv, ctx, stdin, HOST) {
    var wantAll = argv.indexOf('aux') !== -1 || argv.indexOf('-ef') !== -1 || argv.indexOf('-e') !== -1 || argv.indexOf('auxf') !== -1;
    var sortBy = null;
    var m = argv.join(' ').match(/--sort=(-?)(%\w+)/);
    if (m) sortBy = { desc: m[1] === '-', field: m[2] };
    var rows = procTable();
    if (sortBy) {
      rows = rows.slice().sort(function (a, b) {
        var av = parseFloat(a[sortBy.field === '%cpu' ? 'cpu' : 'mem']);
        var bv = parseFloat(b[sortBy.field === '%cpu' ? 'cpu' : 'mem']);
        return sortBy.desc ? bv - av : av - bv;
      });
    }
    if (argv.indexOf('-eo') !== -1 || argv.join(' ').indexOf('--sort') !== -1) {
      var out = ['    PID  PPID %CPU %MEM CMD'];
      rows.forEach(function (r) {
        out.push(padLeft(String(r.pid), 7) + padLeft('1', 6) + padLeft(r.cpu, 5) + padLeft(r.mem, 5) + ' ' + r.cmd);
      });
      return ok(out);
    }
    if (!wantAll) rows = rows.slice(0, 4);
    var out2 = ['USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND'];
    rows.forEach(function (r) {
      out2.push(pad(r.user, 9) + padLeft(String(r.pid), 5) + padLeft(r.cpu, 5) + padLeft(r.mem, 5) +
        padLeft('4218420', 8) + padLeft('612400', 6) + ' ?        Ss   09:38   0:12 ' + r.cmd);
    });
    return ok(out2);
  };

  CMDS.top = function (argv, ctx, stdin, HOST) {
    /* -H 线程视图 / -p <PID> 只看某个进程 / -b 批处理 / -o <字段> 排序。
       线程视图的 TID 与 jstack / pidstat -t 用的是同一组，不能各说各话。 */
    var threads = false, pid = null, i;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-p') { pid = argv[i + 1]; i++; continue; }
      if (a === '-o') { i++; continue; }
      if (/^-[a-zA-Z%]+$/.test(a)) {
        a.slice(1).split('').forEach(function (c) { if (c === 'H') threads = true; });
      }
    }
    var head = [
      'top - 09:51:12 up 14 days, 20:39,  1 user,  load average: 0.42, 0.68, 0.71',
      'Tasks: 118 total,   1 running, 117 sleeping,   0 stopped,   0 zombie',
      '%Cpu(s): 34.1 us,  3.2 sy,  0.0 ni, 61.4 id,  1.2 wa,  0.0 hi,  0.1 si,  0.0 st',
      'MiB Mem :   7770.7 total,    402.4 free,   4193.4 used,   3174.9 buff/cache',
      'MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   1101.9 avail Mem',
      ''
    ];
    if (threads && String(pid) === '18442') {
      /* java 进程 18442 的线程：TID 与 jstack 里的 nid 一一对应
         （18473 = 十六进制 0x4829 就是 CPU 最高的那条，示例里靠它串起整条定位链路） */
      return ok(head.concat([
        '    PID USER      PR  NI    VIRT    RES    SHR S %CPU %MEM     TIME+ COMMAND',
        '  18473 deploy    20   0 4218420 612400  18204 R 31.2  7.7   4:12.44 pool-2-thread-1',
        '  18477 deploy    20   0 4218420 612400  18204 S 12.4  7.7   1:42.18 G1 Conc#1',
        '  18481 deploy    20   0 4218420 612400  18204 S  8.9  7.7   2:08.42 VM Thread',
        '  18485 deploy    20   0 4218420 612400  18204 S  5.2  7.7   0:58.11 C2 CompilerThread0',
        '  18451 deploy    20   0 4218420 612400  18204 S  4.2  7.7   0:41.08 http-nio-8080-exec-4',
        '  18453 deploy    20   0 4218420 612400  18204 S  2.8  7.7   0:28.42 http-nio-8080-exec-9',
        '  18449 deploy    20   0 4218420 612400  18204 S  1.4  7.7   0:14.18 http-nio-8080-exec-1',
        '  18455 deploy    20   0 4218420 612400  18204 S  1.1  7.7   0:11.42 http-nio-8080-exec-12',
        '  18459 deploy    20   0 4218420 612400  18204 S  0.6  7.7   0:06.18 HikariPool-1 housekeeper',
        '  18491 deploy    20   0 4218420 612400  18204 S  0.3  7.7   0:03.08 Service Thread',
        '  18447 deploy    20   0 4218420 612400  18204 S  0.2  7.7   0:02.18 G1 Young RemSet',
        '  18443 deploy    20   0 4218420 612400  18204 S  0.1  7.7   0:01.42 main',
        '',
        '（top -H 显示的是线程：TID 18473 的十六进制是 0x4829，' +
        '接着 `printf "%x\\n" 18473` 转成 0x4829，再去 jstack 输出里 grep "nid=0x4829" 就能定位到那段代码）'
      ]));
    }
    if (threads && String(pid) === '2210') {
      return ok(head.concat([
        '    PID USER      PR  NI    VIRT    RES    SHR S %CPU %MEM     TIME+ COMMAND',
        '   2231 mysql     20   0 1892444 1.8g    9820 S  1.4 22.8 184:12.08 mysqld',
        '   2232 mysql     20   0 1892444 1.8g    9820 S  0.4 22.8  41:02.11 mysqld',
        '   2233 mysql     20   0 1892444 1.8g    9820 S  0.2 22.8  18:42.44 mysqld',
        '',
        '（mysqld 是 C++ 多线程程序，线程名都叫 mysqld；要看它在干什么得结合 performance_schema）'
      ]));
    }
    if (pid) {
      var all = [
        { pid: 18442, user: 'deploy', cpu: '68.4', mem: '7.7', time: '12:41.22', cmd: 'java' },
        { pid: 2210, user: 'root', cpu: '2.1', mem: '22.8', time: '184:12.08', cmd: 'mysqld' },
        { pid: 1204, user: 'root', cpu: '0.7', mem: '1.8', time: '41:02.11', cmd: 'dockerd' },
        { pid: 1843, user: 'nginx', cpu: '0.4', mem: '0.2', time: '8:12.44', cmd: 'nginx' }
      ];
      var rows = all.filter(function (r) { return String(r.pid) === String(pid); });
      if (!rows.length) return fail(['top: 找不到进程 ' + pid + '（本站仿真的进程：18442 java / 2210 mysqld / 1204 dockerd）']);
      var o = head.concat(['    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND']);
      rows.forEach(function (r) {
        o.push(padLeft(String(r.pid), 7) + ' ' + pad(r.user, 9) + '  20   0 ' + padLeft('4218420', 8) + padLeft('612400', 7) + padLeft('18204', 6) +
          ' S ' + padLeft(r.cpu, 5) + padLeft(r.mem, 6) + padLeft(r.time, 10) + ' ' + r.cmd);
      });
      return ok(o);
    }
    return ok(head.concat([
      '    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND',
      '  18442 deploy    20   0 4218420 612400  18204 S  68.4   7.7  12:41.22 java',
      '   2210 root      20   0 1892444 1.8g    9820 S   2.1  22.8 184:12.08 mysqld',
      '   1204 root      20   0 1428812 142804  42100 S   0.7   1.8  41:02.11 dockerd',
      '   1843 nginx     20   0  142880 18604   4212 S   0.4   0.2   8:12.44 nginx',
      '',
      '（教学环境是静态快照；真机上 top 每秒刷新，按 P 按 CPU 排序、按 M 按内存排序、按 q 退出）'
    ]));
  };

  CMDS.tail_f = null;

  CMDS.iostat = function (argv, ctx, stdin, HOST) {
    /* -z 只显示有 IO 的设备 / -p 按分区 / -m 以 MB/s 计 / -y 跳过开机均值 / -d 只看磁盘。
       数值与 termfs 的磁盘事实一致：vdb %util 99.41%、w_await 42.18ms。 */
    var zero = false, perPart = false, mega = false, onlyDev = null, i;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-p' || a === '--pretty') {
        var nxt = argv[i + 1];
        if (nxt !== undefined && /^[a-z]/.test(String(nxt))) { perPart = true; onlyDev = String(argv[++i]); }
        else perPart = true;
        continue;
      }
      if (/^-[a-zA-Z]+$/.test(a)) {
        a.slice(1).split('').forEach(function (c) {
          if (c === 'z') zero = true;
          if (c === 'm') mega = true;
          if (c === 'p') perPart = true;
        });
      }
    }
    var dev = { vda: [0.42, 1.18, 12.61, 48.22, 0.00, 0.31, 0.00, 20.81, 0.88, 2.14, 0.00, 30.0, 40.9, 0.42, 0.07],
                vdb: [18.42, 142.18, 1420.44, 18204.11, 0.12, 18.42, 0.65, 11.47, 18.42, 42.18, 2.41, 77.1, 128.0, 0.62, 99.41],
                vdc: [2.18, 4.42, 64.22, 184.11, 0.00, 1.02, 0.00, 18.75, 1.42, 3.18, 0.01, 29.5, 41.6, 0.18, 1.20] };
    var ORDER = ['vda', 'vdb', 'vdc'].filter(function (d) { return !onlyDev || d === onlyDev; });
    if (onlyDev && !dev[onlyDev]) {
      return fail(['iostat: ' + onlyDev + ': No such file or directory',
                   '（本站仿真的磁盘只有 vda / vdb / vdc；先 lsblk 确认设备名）']);
    }
    var out = [
      'Linux 5.10.0-60.18.0.50.oe2203.x86_64 (web-prod-01) \t03/18/2024 \t_x86_64_\t(2 CPU)',
      ''
    ];
    var colW = [8, 8, 10, 10, 9, 9, 7, 7, 8, 8, 7, 9, 9, 7, 7];
    var heads = ['r/s', 'w/s', mega ? 'rMB/s' : 'rkB/s', mega ? 'wMB/s' : 'wkB/s', 'rrqm/s', 'wrqm/s', '%rrqm', '%wrqm', 'r_await', 'w_await', 'aqu-sz', 'rareq-sz', 'wareq-sz', 'svctm', '%util'];
    out.push(pad('Device', 11) + heads.map(function (h, i) { return padLeft(h, colW[i]); }).join(''));
    Object.keys(dev).forEach(function (d) {
      if (ORDER.indexOf(d) === -1) return;
      var v = dev[d].slice();
      if (mega) { v[2] = Number((v[2] / 1024).toFixed(2)); v[3] = Number((v[3] / 1024).toFixed(2)); }
      if (zero && v[14] < 0.1) return;
      out.push(pad(d, 11) + v.map(function (x, idx) {
        return padLeft(typeof x === 'number' ? String(x) : x, colW[idx]);
      }).join(''));
      if (perPart) {
        var partRows = { vda: ['vda1'], vdb: ['vdb1'], vdc: ['vdc1'] }[d] || [];
        partRows.forEach(function (pp) {
          out.push(pad(pp, 11) + v.map(function (x, idx) {
            return padLeft(typeof x === 'number' ? String(Number((x * 0.98).toFixed(2))) : x, colW[idx]);
          }).join(''));
        });
      }
    });
    out.push('');
    out.push('提示：vdb 的 %util 已经 99.4%，w_await 42ms —— /data 这块盘的 IO 是当前瓶颈。');
    if (zero) out.push('（-z 只显示有 IO 活动的设备：本例里 vda（%util 0.07）会被过滤掉）');
    if (mega) out.push('（-m 把吞吐换成 MB/s：vdb 写 ' + (18204.11 / 1024).toFixed(1) + ' MB/s，看着不高但 %util 已经满了 —— 小 IO 把队列占死了）');
    if (perPart) out.push('（-p 按分区展开：vdb1 就是 /data 所在分区，它的 IO 全算在 vdb 头上）');
    return ok(out);
  };

  CMDS.vmstat = function (argv, ctx, stdin, HOST) {
    /* -s 累计统计 / -d 磁盘统计 / -w 宽输出 —— 三档都从同一份快照推出来，
       数值与 free / iostat / top 完全对得上（MemFree 412036 kB、vdb %util 99.4%） */
    var summary = false, disk = false, wide = false, i;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (/^-[a-zA-Z]+$/.test(a)) {
        a.slice(1).split('').forEach(function (c) {
          if (c === 's') summary = true;
          if (c === 'd') disk = true;
          if (c === 'w') wide = true;
        });
      }
    }
    if (summary) {
      return ok([
        '      7957184 K total memory',
        '      4293872 K used memory',
        '      4193400 K active memory',
        '      3174908 K inactive memory',
        '       412036 K free memory',
        '       128764 K buffer memory',
        '      3251276 K swap cache',
        '      2097148 K total swap',
        '            0 K used swap',
        '      2097148 K free swap',
        '     184220418 non-nice user cpu ticks',
        '        421842 nice user cpu ticks',
        '      4211804 system cpu ticks',
        '   84220418842 idle cpu ticks',
        '       184220 IO-wait cpu ticks',
        '         4218 IRQ cpu ticks',
        '        18422 softirq cpu ticks',
        '            0 stolen cpu ticks',
        '   18422041884 pages paged in',
        '    4211804422 pages paged out',
        '            0 pages swapped in',
        '            0 pages swapped out',
        '   18422041842 interrupts',
        '    4211804422 CPU context switches',
        '   1710724321 boot time',
        '         1842 forks',
        '',
        '（-s 是开机以来的累计值：pages swapped in/out 都是 0 = 从没换过页；' +
        '  irq/softirq 很高时要看 /proc/interrupts 是不是某块网卡在刷中断）'
      ]);
    }
    if (disk) {
      return ok([
        'disk-version 6.0.0',
        'disk   reads   read sectors  writes    requested writes',
        'vda      18422     1420418      42118      1842204',
        'vdb     884220    88422040    4211804    184220418',
        'vdc      42118     1842204      88422      4211804',
        'md0          0           0          0            0',
        '',
        '（vdb 的 requested writes 是 vda 的 100 倍 —— /data 上那块盘就是全机的写入热点，' +
        '  和 iostat 里 vdb %util 99.4% 是同一个事实）'
      ]);
    }
    if (wide) {
      return ok([
        'procs -----------------------memory---------------------- ---swap-- -----io---- -system-- --------cpu--------',
        ' r  b         swpd         free         buff        cache   si   so    bi    bo   in   cs  us  sy  id  wa  st',
        ' 1  2            0       412036       128764      3251276    0    0  1420 18204  812 1842  34   3  61   1   0',
        '',
        '（-w 只是把列拉宽，数值与 vmstat 1 5 完全一样；远程终端或窄窗口下更好读）'
      ]);
    }
    return ok([
      'procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----',
      ' r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st',
      ' 1  2      0 412036 128764 3251276    0    0  1420 18204  812 1842 34  3 61  1  0',
      '',
      '提示：b=2 表示有 2 个进程处于不可中断睡眠（等 IO），wa=1 说明有 IO 等待。'
    ]);
  };

  CMDS.kill = function (argv, ctx, stdin, HOST) {
    var sig = '15';
    var pids = [];
    argv.forEach(function (a) {
      if (/^-\d+$/.test(a)) sig = a.slice(1);
      else if (/^-[A-Z]+$/.test(a)) sig = a.slice(1);
      else pids.push(a);
    });
    if (!pids.length) return fail(['kill: usage: kill [-s sigspec | -n signum | -sigspec] pid']);
    if (sig === '9' || sig === 'KILL') {
      return ok(['（教学环境不会真的杀进程；SIGKILL=9 无法被程序捕获，进程没有机会做清理，优先用默认的 SIGTERM=15）']);
    }
    return ok([]);
  };

  /* ---------- Docker ---------- */
  /* 网络 ID：由网络名确定性算出来（同一名字每次同一个 ID，便于 `ls` 与 `inspect` 对照） */
  function netIdOf(name) {
    var h = 0, s = String(name);
    for (var i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 4294967296;
    var hex = (h.toString(16) + '7fca8b1d4e20a1c9d7e4b832a1c9d7e4b832a1c9d7e4b832a1c9d7e4b83').slice(0, 64);
    return hex;
  }
  CMDS.docker = function (argv, ctx, stdin, HOST) {
    var D = window.CC_TERM_FS.docker;
    var sub = argv[0], sub2 = argv[1];

    function fmtPorts(c) { return c.ports || ''; }

    if (sub === 'ps') {
      var all = argv.indexOf('-a') !== -1 || argv.indexOf('--all') !== -1;
      var quiet = argv.indexOf('-q') !== -1;
      var rows = D.containers.filter(function (c) { return all || c.state === 'running'; });
      if (quiet) return ok(rows.map(function (c) { return c.id; }));
      var out = ['CONTAINER ID   IMAGE                                                        COMMAND                  CREATED         STATUS                      PORTS                      NAMES'];
      rows.forEach(function (c) {
        out.push(pad(c.id, 15) + pad(c.image, 61) + pad('"' + c.command + '"', 25) + pad(c.created, 16) + pad(c.status, 28) + pad(fmtPorts(c), 27) + c.name);
      });
      return ok(out);
    }

    if (sub === 'images') {
      var quiet = argv.indexOf('-q') !== -1 || argv.indexOf('--quiet') !== -1;
      var filter = '', imgFmt = '';
      for (var ii = 0; ii < argv.length; ii++) {
        if (argv[ii] === '-f' || argv[ii] === '--filter') { filter = argv[ii + 1] || ''; continue; }
        if (/^--filter=/.test(argv[ii])) { filter = argv[ii].slice(9); continue; }
        if (argv[ii] === '--format') { imgFmt = argv[ii + 1] || ''; continue; }
        if (/^--format=/.test(argv[ii])) { imgFmt = argv[ii].slice(9); continue; }
      }
      var list = D.images.filter(function (i) {
        if (!filter) return true;
        var kv = filter.split('=');
        if (kv[0] === 'dangling') return kv[1] === 'true' ? i.repo === '<none>' : i.repo !== '<none>';
        if (kv[0] === 'reference') {
          /* 真机 docker 的 reference 匹配是**子串**（`reference=web` 能命中
             `swr.../myorg/web`），不是前缀 —— 写成前缀会让 `-q -f reference=web`
             静默返回空表，而"批量删除拿到空参数"是最难发现的一类错。 */
          var want = kv.slice(1).join('=');
          return (i.repo + ':' + i.tag).indexOf(want) !== -1;
        }
        if (kv[0] === 'label') return false;
        return true;
      });
      if (imgFmt) {
        /* Go 模板 `{{.字段}}`：与 `docker inspect -f` 用同一套替换规则，
           认得的字段名就是列表头的驼峰写法（.Repository/.Tag/.ID/.Size/.CreatedSince）。
           认不出的字段替换成空串 —— 真机行为也是如此。 */
        var imgFields = { Repository: 'repo', Tag: 'tag', ID: 'id', Size: 'size', CreatedSince: 'created', CreatedAt: 'created' };
        return ok(list.map(function (i) {
          return imgFmt.replace(/\{\{\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function (m0, f) {
            var k = imgFields[f];
            return k === undefined ? '' : String(i[k]);
          });
        }));
      }
      if (quiet) return ok(list.map(function (i) { return i.id; }));
      var repoW = 12;
      list.forEach(function (i) { if (i.repo.length > repoW) repoW = i.repo.length; });
      var out2 = [pad('REPOSITORY', repoW + 2) + pad('TAG', 13) + pad('IMAGE ID', 15) + pad('CREATED', 16) + 'SIZE'];
      list.forEach(function (i) {
        out2.push(pad(i.repo, repoW + 2) + pad(i.tag, 13) + pad(i.id, 15) + pad(i.created, 16) + i.size);
      });
      if (filter) out2.push('', '（按 ' + filter + ' 过滤后的结果）');
      return ok(out2);
    }

    if (sub === 'logs') {
      var name = argv.filter(function (a) { return a.charAt(0) !== '-'; }).slice(1).filter(function (a) {
        return !/^\d+$/.test(a);
      })[0];
      var tailN = 100;
      var m = argv.join(' ').match(/--tail[= ](\d+)/);
      if (m) tailN = Number(m[1]);
      var prev = argv.indexOf('--previous') !== -1 || argv.indexOf('-p') !== -1;
      var c = null;
      var targetId = argv.filter(function (a) { return a.charAt(0) !== '-' && !/^\d+$/.test(a); })[1];
      D.containers.forEach(function (x) { if (x.name === targetId || x.id === targetId) c = x; });
      if (!c) return fail(['Error response from daemon: No such container: ' + (targetId || '(未指定容器名)')]);
      var lines = prev ? (c.prevLogs || c.logs) : c.logs;
      var res = ok(lines.slice(Math.max(0, lines.length - tailN)));
      if (prev) res.out.push('', '（--previous 看的是"上一个已终止容器实例"的日志，容器反复重启时它是唯一线索）');
      return res;
    }

    if (sub === 'inspect') {
      var fmtArg = null, target = null;
      for (var i = 0; i < argv.length; i++) {
        if (argv[i] === '-f' || argv[i] === '--format') { fmtArg = argv[++i]; continue; }
        if (argv[i].charAt(0) !== '-') target = target || argv[i];
      }
      var targets = argv.filter(function (a) { return a.charAt(0) !== '-' && !/^\{/.test(a); }).slice(1);
      var cname = targets[0];
      var cc = null;
      D.containers.forEach(function (x) { if (x.name === cname || x.id === cname) cc = x; });
      if (!cc) return fail(['Error: No such object: ' + (cname || '(未指定)')]);
      if (fmtArg) {
        var replaced = fmtArg
          .replace(/\{\{\s*\.State\.ExitCode\s*\}\}/g, String(cc.exitCode))
          .replace(/\{\{\s*\.State\.OOMKilled\s*\}\}/g, String(cc.oomKilled))
          .replace(/\{\{\s*\.RestartCount\s*\}\}/g, String(cc.restartCount))
          .replace(/\{\{\s*\.State\.Error\s*\}\}/g, cc.error || '')
          .replace(/\{\{\s*\.Name\s*\}\}/g, '/' + cc.name);
        return ok([replaced]);
      }
      return ok([
        '[',
        '    {',
        '        "Id": "' + cc.id + 'f8a71b3d05e9c4a2b7d1e6f8a3c5b9d2e4f7a1c8b5d3e9f2a6c4b8d1e7f3a9c5",',
        '        "Created": "2024-03-18T01:38:41.882134921Z",',
        '        "Path": "' + String(cc.command).split(' ')[0] + '",',
        '        "Args": ' + JSON.stringify(String(cc.command).split(' ').slice(1)) + ',',
        '        "State": {',
        '            "Status": "' + (cc.state === 'running' ? 'running' : 'exited') + '",',
        '            "Running": ' + (cc.state === 'running') + ',',
        '            "Paused": false,',
        '            "Restarting": false,',
        '            "OOMKilled": ' + cc.oomKilled + ',',
        '            "Dead": false,',
        '            "Pid": ' + (cc.state === 'running' ? 28412 : 0) + ',',
        '            "ExitCode": ' + cc.exitCode + ',',
        '            "Error": "' + (cc.error || '') + '",',
        '            "StartedAt": "' + cc.startedAt + '",',
        '            "FinishedAt": "' + (cc.state === 'running' ? '0001-01-01T00:00:00Z' : '2024-03-18T06:42:11.002114Z') + '"',
        '        },',
        '        "Image": "sha256:8a3c5b9d2e4f7a1c8b5d3e9f2a6c4b8d1e7f3a9c5b2d6e8f1a4c7b0d3e6f9a2c5",',
        '        "Name": "/' + cc.name + '",',
        '        "RestartCount": ' + cc.restartCount + ',',
        '        "HostConfig": {',
        '            "RestartPolicy": { "Name": "' + (cc.restartCount ? 'always' : 'unless-stopped') + '", "MaximumRetryCount": 0 },',
        '            "PortBindings": ' + (cc.ports ? '{ "8080/tcp": [ { "HostIp": "0.0.0.0", "HostPort": "8080" } ] }' : '{}') + ',',
        '            "Memory": 536870912,',
        '            "NanoCpus": 1000000000',
        '        }',
        '    }',
        ']'
      ]);
    }

    if (sub === 'stats') {
      var noStream = argv.indexOf('--no-stream') !== -1;
      var out3 = ['CONTAINER ID   NAME        CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O         PIDS'];
      D.containers.filter(function (c) { return c.state === 'running'; }).forEach(function (c) {
        var cpu = c.name === 'web' ? '12.42%' : (c.name === 'mysql8' ? '2.18%' : '0.31%');
        var mem = c.name === 'web' ? '612.4MiB / 512MiB' : (c.name === 'mysql8' ? '1.82GiB / 2GiB' : '18.4MiB / 256MiB');
        var pct = c.name === 'web' ? '119.61%' : (c.name === 'mysql8' ? '91.02%' : '7.19%');
        out3.push(pad(c.id, 15) + pad(c.name, 12) + pad(cpu, 10) + pad(mem, 22) + pad(pct, 10) + pad('1.42MB / 882kB', 18) + pad('18.4MB / 0B', 18) + '3');
      });
      if (!noStream) out3.push('', '（教学环境是静态快照；真机上 docker stats 会持续刷新，加 --no-stream 只打印一次）');
      return ok(out3);
    }

    if (sub === 'exec') {
      var cname2 = argv.filter(function (a) { return a.charAt(0) !== '-'; }).slice(1)[0];
      var ccx = null;
      D.containers.forEach(function (x) { if (x.name === cname2) ccx = x; });
      if (!ccx) return fail(['Error response from daemon: No such container: ' + (cname2 || '(未指定)')]);
      if (ccx.name === 'old-web' || ccx.state === 'exited') {
        return fail(['Error response from daemon: Container ' + ccx.id + ' is not running']);
      }
      return ok([
        '（教学环境不提供交互式 shell —— 真机上 `docker exec -it ' + cname2 + ' sh` 会给你一个容器内的终端）',
        '',
        '可以练的等价命令：',
        '  docker exec ' + cname2 + ' env                    查看环境变量',
        '  docker exec ' + cname2 + ' cat /etc/resolv.conf   查看容器内 DNS 配置',
        '  docker exec ' + cname2 + ' ls /app                查看容器内文件'
      ]);
    }

    if (sub === 'exec-cat') return ok([]);

    if (sub === 'volume') {
      if (sub2 === 'ls') {
        var out4 = ['DRIVER    VOLUME NAME'];
        D.volumes.forEach(function (v) { out4.push(pad(v.driver, 10) + v.name); });
        return ok(out4);
      }
      if (sub2 === 'inspect') {
        /* ⚠️ `docker volume inspect` 必须认两样东西：
             ① **卷名**（早先无论传什么名字都返回 D.volumes[0]）
             ② `-f/--format "{{.字段}}"` 模板
           站内示例 `du -sh $(docker volume inspect -f "{{.Mountpoint}}" mysqldata)`
           依赖的就是 ② —— 早先 `-f` 被整个忽略、把整段 JSON 灌进了命令替换，
           于是 du 收到 `[`、`{`、`CreatedAt:` 这些"文件名"，报一堆
           `cannot access '['`。这类"参数被静默忽略"的缺陷比报错更难发现。 */
        var vName = null, vFmt = null;
        var vRest = argv.slice(2);
        for (var vi = 0; vi < vRest.length; vi++) {
          var va = String(vRest[vi]);
          if (va === '-f' || va === '--format') { vFmt = String(vRest[++vi]); continue; }
          if (/^--format=/.test(va)) { vFmt = va.slice(9); continue; }
          if (/^-f./.test(va)) { vFmt = va.slice(2); continue; }
          if (va.charAt(0) === '-') continue;
          if (vName === null) vName = va;
        }
        var v = null;
        D.volumes.forEach(function (x) { if (vName === null || x.name === vName) { if (!v) v = x; } });
        if (!v) return fail(['Error response from daemon: get ' + vName + ': no such volume']);
        var vObj = {
          CreatedAt: '2024-03-16T02:02:11Z', Driver: v.driver, Labels: null,
          Mountpoint: v.mountpoint, Name: v.name, Options: null, Scope: 'local'
        };
        if (vFmt !== null) {
          /* Go 模板的 `{{.字段}}`：只认字段取值，够用于站内示例 */
          var rendered = vFmt.replace(/\{\{\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function (m0, field) {
            return vObj[field] === undefined || vObj[field] === null ? '' : String(vObj[field]);
          });
          return ok(rendered === '' ? [] : [rendered]);
        }
        return ok(['[', '    {', '        "CreatedAt": "' + vObj.CreatedAt + '",', '        "Driver": "' + v.driver + '",',
          '        "Labels": null,', '        "Mountpoint": "' + v.mountpoint + '",', '        "Name": "' + v.name + '",',
          '        "Options": null,', '        "Scope": "local"', '    }', ']']);
      }
      if (sub2 === 'rm' || sub2 === 'prune') {
        return ok(['（教学环境不会真的删除数据卷；真机上 volume prune 会删掉所有"未被容器使用"的卷，数据不可恢复）']);
      }
      return ok(['Usage: docker volume COMMAND']);
    }

    if (sub === 'network') {
      if (sub2 === 'ls' || !sub2) {
        var out5 = ['NETWORK ID     NAME      DRIVER    SCOPE'];
        var ids = ['7fca8b1d4e20', '2a1c9d7e4b83', 'b5e2f8a1c904', 'c8d4e1b7a235'];
        D.networks.forEach(function (n, i) { out5.push(pad(ids[i] || 'ffffffffffff', 15) + pad(n.name, 10) + pad(n.driver, 10) + n.scope); });
        return ok(out5);
      }
      if (sub2 === 'inspect') {
        var nm = argv.filter(function (a) { return a.charAt(0) !== '-'; })[2] || 'mynet';
        var net = D.networks.filter(function (n) { return n.name === nm; })[0] || D.networks[3];
        return ok(['[', '    {', '        "Name": "' + net.name + '",', '        "Id": "7fca8b1d4e20a1c9d7e4b832a1c9d7e4b832a1c9d7e4b832a1c9d7e4b832a1c9",',
          '        "Created": "2024-03-16T02:01:40.114382Z",', '        "Scope": "local",', '        "Driver": "' + net.driver + '",',
          '        "IPAM": { "Driver": "default", "Config": [ { "Subnet": "' + net.subnet + '", "Gateway": "' + (net.subnet === '-' ? '' : net.subnet.replace('0.0/16', '0.1')) + '" } ] },',
          '        "Containers": {', net.containers ? '            "c9f2a71b3d05e9c4a2b7d1e6f8a3c5b9d2e4f7a1c8b5d3e9f2a6c4b8d1e7f3a9c5": { "Name": "web", "EndpointID": "9f1c4e7a2b5d8", "MacAddress": "02:42:ac:14:00:02", "IPv4Address": "172.20.0.2/16" },' : '', '        }', '    }', ']']);
      }
      /* `docker network create / connect / disconnect / rm`
         ⚠️ 这四个此前一律回落到 `Usage: docker network COMMAND`，等于**没实现**。
         而手册里 dk-network-create / dk-network-connect 两条记录教的正是它们，
         "容器之间连不上"又是容器网络最高频的故障 —— 没有这几个动作，
         那一整类排查（创建自定义网络 → 把容器接进去 → 用别名互访）就演示不了。
         实现方式是改 `D.networks` 这张表本身：create 追加、connect/disconnect 改 members，
         这样 `docker network ls` / `inspect` 随后就能看到变化（**操作与验证闭环**）。 */
      if (sub2 === 'create') {
        var cnName = null, cnSubnet = null, cnInternal = argv.indexOf('--internal') !== -1;
        for (var ci2 = 2; ci2 < argv.length; ci2++) {
          var ca2 = String(argv[ci2]);
          if (ca2 === '-d' || ca2 === '--driver' || ca2 === '--subnet' || ca2 === '--gateway' || ca2 === '--label') {
            if (ca2 === '--subnet') cnSubnet = String(argv[ci2 + 1] || '');
            ci2++; continue;
          }
          if (/^--subnet=/.test(ca2)) { cnSubnet = ca2.slice(9); continue; }
          if (ca2.charAt(0) === '-') continue;
          if (cnName === null) cnName = ca2;
        }
        if (!cnName) return fail(['"docker network create" requires exactly 1 argument.']);
        var netExist = null;
        D.networks.forEach(function (n) { if (n.name === cnName) netExist = n; });
        if (netExist) return fail(['Error response from daemon: network with name ' + cnName + ' already exists']);
        D.networks.push({
          name: cnName, driver: cnInternal ? 'bridge' : 'bridge',
          scope: 'local', subnet: cnSubnet || '172.21.0.0/16',
          internal: !!cnInternal, members: []
        });
        /* 真机回显是 64 位网络 ID（一行） */
        return ok([netIdOf(cnName)]);
      }
      if (sub2 === 'connect' || sub2 === 'disconnect') {
        var netArg = null, ctrArg = null, aliasArg = null;
        for (var ni = 2; ni < argv.length; ni++) {
          var na = String(argv[ni]);
          if (na === '--alias') { aliasArg = String(argv[ni + 1] || ''); ni++; continue; }
          if (/^--alias=/.test(na)) { aliasArg = na.slice(8); continue; }
          if (na.charAt(0) === '-') continue;
          if (netArg === null) netArg = na; else if (ctrArg === null) ctrArg = na;
        }
        if (!netArg || !ctrArg) return fail(['"docker network ' + sub2 + '" requires 2 arguments.']);
        var tnet = null;
        D.networks.forEach(function (n) { if (n.name === netArg) tnet = n; });
        if (!tnet) return fail(['Error response from daemon: network ' + netArg + ' not found']);
        var tctr = null;
        D.containers.forEach(function (x) { if (x.name === ctrArg || x.id === ctrArg) tctr = x; });
        if (!tctr) return fail(['Error response from daemon: No such container: ' + ctrArg]);
        tnet.members = tnet.members || [];
        var idxM = -1;
        tnet.members.forEach(function (m, k) { if (m.name === tctr.name) idxM = k; });
        if (sub2 === 'connect') {
          if (idxM !== -1) return fail(['Error response from daemon: endpoint with name ' + tctr.name + ' already exists in network ' + netArg]);
          tnet.members.push({ name: tctr.name, alias: aliasArg || tctr.name, ip: '172.21.0.' + (tnet.members.length + 2) });
          return ok([]);
        }
        if (idxM === -1) return fail(['Error response from daemon: container ' + tctr.name + ' is not connected to network ' + netArg]);
        tnet.members.splice(idxM, 1);
        return ok([]);
      }
      if (sub2 === 'rm') {
        var rmName = null;
        for (var ri = 2; ri < argv.length; ri++) {
          var ra = String(argv[ri]);
          if (ra.charAt(0) === '-') continue;
          if (rmName === null) rmName = ra;
        }
        var hitN = -1;
        D.networks.forEach(function (n, k) { if (n.name === rmName) hitN = k; });
        if (hitN === -1) return fail(['Error response from daemon: network ' + rmName + ' not found']);
        if ((D.networks[hitN].members || []).length) {
          return fail(['Error response from daemon: network ' + rmName + ' has active endpoints',
            '（真机也一样：网络里还有容器连着就删不掉，先 disconnect 或删容器）']);
        }
        D.networks.splice(hitN, 1);
        return ok([rmName]);
      }
      if (sub2 === 'prune') {
        return ok(['（教学环境不会真的清理网络；真机上它只删"没有任何容器连接"的自定义网络，bridge/host/none 三个内置网络永远保留）']);
      }
      return ok(['Usage: docker network COMMAND']);
    }

    if (sub === 'system') {
      if (argv.indexOf('df') !== -1) {
        var du = D.diskUsage;
        return ok([
          'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE',
          'Images          7         5         ' + pad(du.images, 10) + '1.35GB (83%)',
          'Containers      5         3         268MB     268MB (100%)',
          'Local Volumes   2         2         ' + pad(du.volumes, 10) + '0B (0%)',
          'Build Cache     42        0         892MB     892MB'
        ]);
      }
      if (argv.indexOf('prune') !== -1) {
        return ok([
          '（教学环境不会真的清理；真机上 `docker system prune -a` 会删掉所有未被容器使用的镜像，生产环境务必先 `docker system df -v` 确认）'
        ]);
      }
      return ok(['Usage: docker system COMMAND']);
    }

    if (sub === 'info') {
      return ok([
        'Client: Docker Engine - Community',
        ' Version:           24.0.7',
        ' Context:           default',
        ' Debug Mode:        false',
        '',
        'Server: Docker Engine - Community',
        ' Engine:',
        '  Version:          24.0.7',
        '  Storage Driver:   overlay2',
        '  Logging Driver:   json-file',
        '  Cgroup Driver:    systemd',
        '  Cgroup Version:   1',
        ' Containers: 5',
        '  Running: 3',
        '  Paused: 0',
        '  Stopped: 2',
        ' Images: 7',
        ' Server Version: 24.0.7',
        ' Storage Driver: overlay2',
        '  Backing Filesystem: extfs',
        '  Supports d_type: true',
        ' Docker Root Dir: /data/docker',
        ' Registry Mirrors:',
        '  https://docker.mirrors.example.com/',
        ' Live Restore Enabled: false'
      ]);
    }

    if (sub === 'pull') {
      var img = argv[1] || '';
      if (img.indexOf('swr.') === 0) {
        return ok(['1.2.3: Pulling from myorg/web', 'Digest: sha256:3e7a9b1c5d84f2a6c4b8d1e7f3a9c5b2d6e8f1a4c7b0d3e6f9a2c5b8d1e7f3a9', 'Status: Downloaded newer image for ' + img]);
      }
      if (img.indexOf('nginx') === 0 || img.indexOf('mysql') === 0 || img.indexOf('redis') === 0) {
        return ok(['Status: Image is up to date for ' + img]);
      }
      return fail(['Error response from daemon: pull access denied for ' + img + ', repository does not exist or may require \'docker login\'']);
    }

    if (sub === 'login') {
      return ok(['Authenticating with existing credentials...', 'WARNING! Your password will be stored unencrypted in /root/.docker/config.json.', 'Login Succeeded']);
    }

    if (sub === 'version') {
      return ok(['Client: Docker Engine - Community', ' Version:           24.0.7', 'Server: Docker Engine - Community', ' Engine:', '  Version:          24.0.7']);
    }

    if (sub === 'tag') return ok([]);
    if (sub === 'push') {
      var img2 = argv[1] || '';
      if (img2.indexOf('swr.') !== 0) {
        return fail(['The push refers to repository [docker.io/' + img2 + ']', 'denied: requested access to the resource is denied',
          '', '提示：推送到华为云 SWR 时，镜像名必须是完整的 SWR 域名格式：',
          '  docker tag web:1.2.3 swr.cn-north-4.myhuaweicloud.com/<组织名>/web:1.2.3',
          '  docker push swr.cn-north-4.myhuaweicloud.com/<组织名>/web:1.2.3']);
      }
      return ok(['The push refers to repository [' + img2 + ']', '1.2.3: digest: sha256:8a3c5b9d2e4f7a1c8b5d3e9f2a6c4b8d sized 1368', '（教学环境模拟推送成功）']);
    }
    if (sub === 'build') {
      return ok([
        '（教学环境不真的构建镜像）',
        '真机输出形如：',
        '  [1/4] FROM docker.io/library/eclipse-temurin:17-jre',
        '  [2/4] COPY app.jar /opt/app/app.jar',
        '  [3/4] EXPOSE 8080',
        '  [4/4] ENTRYPOINT ["java","-jar","/opt/app/app.jar"]',
        '  => => naming to docker.io/library/web:1.2.3'
      ]);
    }
    if (sub === 'rm' || sub === 'rmi' || sub === 'stop' || sub === 'start' || sub === 'restart' || sub === 'kill') {
      return ok(['（教学环境不会真的改动容器状态；这类命令在生产上会直接影响服务）']);
    }
    if (sub === 'events') {
      return ok([
        '2024-03-18T09:38:41.882134921+08:00 container create c9f2a71b3d05 (image=swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3, name=web)',
        '2024-03-18T09:38:41.914382114+08:00 container start c9f2a71b3d05 (image=swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3, name=web)',
        '2024-03-18T09:38:42.002114882+08:00 network connect 7fca8b1d4e20 (container=c9f2a71b3d05, name=mynet, type=bridge)'
      ]);
    }
    if (sub === 'port') {
      var cn = argv[1];
      var ccc = null;
      D.containers.forEach(function (x) { if (x.name === cn) ccc = x; });
      if (!ccc) return fail(['Error: No such container: ' + (cn || '')]);
      return ok(ccc.ports ? ['8080/tcp -> 0.0.0.0:8080'] : []);
    }
    if (sub === 'compose') {
      var act = argv[1];
      if (act === 'ps') {
        return ok([
          'NAME                IMAGE                                                          COMMAND                  SERVICE   CREATED         STATUS         PORTS',
          'myapp-web-1         swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3               "java -jar app.jar"      web       12 minutes ago  Up 12 minutes  0.0.0.0:8080->8080/tcp',
          'myapp-mysql-1       mysql:8.0                                                      "docker-entrypoint.s…"   mysql     2 days ago      Up 2 days      0.0.0.0:3306->3306/tcp',
          'myapp-redis-1       redis:7.2-alpine                                               "docker-entrypoint.s…"   redis     2 days ago      Up 2 days      0.0.0.0:6379->6379/tcp'
        ]);
      }
      if (act === 'config') {
        return ok(['name: myapp', 'services:', '  web:', '    image: swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3',
          '    ports:', '    - published: "8080"', '      target: 8080', '    depends_on:', '      mysql:', '        condition: service_healthy',
          '  mysql:', '    image: mysql:8.0', '    volumes:', '    - type: volume', '      source: mysqldata', '      target: /var/lib/mysql']);
      }
      if (act === 'up') {
        return ok(['[+] Running 4/4', ' ✔ Network myapp_default  Created    0.1s', ' ✔ Container myapp-mysql-1  Started   0.4s', ' ✔ Container myapp-redis-1  Started   0.3s', ' ✔ Container myapp-web-1    Started   1.2s']);
      }
      if (act === 'down') {
        return ok(['[+] Running 4/4', ' ✔ Container myapp-web-1    Removed   0.3s', ' ✔ Container myapp-redis-1  Removed   0.2s', ' ✔ Container myapp-mysql-1  Removed   0.4s', ' ✔ Network myapp_default    Removed   0.1s']);
      }
      if (act === 'logs') return CMDS.docker(['logs', 'web'], ctx);
      return ok(['（教学环境实现了 docker compose 的 ps / config / up / down / logs）']);
    }

    if (sub === 'container') {
      /* docker container ls/ps 是新写法，等价于 docker ps */
      var rest = argv.slice(1);
      if (rest[0] === 'ls' || rest[0] === 'ps') {
        var fmt = null;
        for (var ci = 0; ci < rest.length; ci++) {
          if ((rest[ci] === '--format' || rest[ci] === '-f') && rest[ci + 1]) fmt = rest[ci + 1];
          else if (String(rest[ci]).indexOf('--format=') === 0) fmt = String(rest[ci]).slice(9);
        }
        if (fmt) {
          /* 极简模板渲染：支持 {{.Names}} / {{.Status}} / {{.Image}} / {{.ID}} 与 \t \n */
          var list = CMDS.docker(['ps'].concat(rest.filter(function (x) { return x !== '-a' && x !== '--all'; })), ctx);
          var containers = window.CC_TERM_FS.docker.containers.filter(function (c) {
            return rest.indexOf('-a') !== -1 || rest.indexOf('--all') !== -1 || c.state === 'running';
          });
          var tpl = fmt.replace(/^table\s+/, '');
          var lines = [];
          if (/^table\s/.test(fmt)) {
            lines.push(tpl.replace(/\{\{[^}]+\}\}/g, function (m) { return m.replace(/[{}.\s]/g, '').toUpperCase().padEnd(12, ' '); }).replace(/\\t/g, ''));
          }
          containers.forEach(function (c) {
            lines.push(tpl.replace(/\{\{\.Names?\}\}/g, c.name)
              .replace(/\{\{\.Status\}\}/g, c.status)
              .replace(/\{\{\.Image\}\}/g, c.image)
              .replace(/\{\{\.ID\}\}/g, c.id)
              .replace(/\{\{\.Ports\}\}/g, c.ports || '')
              .replace(/\\t/g, '    ').replace(/\\n/g, '\n'));
          });
          return ok(lines);
        }
        return CMDS.docker(['ps'].concat(rest.slice(1)), ctx);
      }
      if (rest[0] === 'rm') return CMDS.docker(['rm'].concat(rest.slice(1)), ctx);
      return ok(['（教学环境实现了 docker container ls / rm，其余请用 docker <子命令>）']);
    }

    return fail(['docker: \'' + (sub || '') + '\' is not a docker command.', 'See \'docker --help\'']);
  };

  /* ---------- kubectl ---------- */
  CMDS.kubectl = function (argv, ctx, stdin, HOST) {
    var K = window.CC_TERM_FS.k8s;
    /* ⚠️ 全局选项可以出现在子命令**之前**：
         `kubectl --kubeconfig=./cce-kubeconfig.yaml get nodes -o wide`
       真 kubectl 完全支持这种写法（CCE 的文档里几乎都这么写）。
       早先直接把 argv[0] 当子命令，于是 `--kubeconfig=...` 被当成命令名，
       报 `error: unknown command "--kubeconfig=./cce-kubeconfig.yaml"`。
       这里先把开头的全局选项剥掉，让 argv 从子命令开始 —— 两条分派路径
       （下面的内置实现与 CC_K8S_EXTRA）拿到的都是"子命令在首位"的形态。 */
    var VALUE_OPTS = ['-n', '--namespace', '--kubeconfig', '--context', '-o', '--output',
      '--server', '--token', '--user', '--cluster', '--request-timeout', '--as', '--as-group',
      '--field-manager', '--subresource', '-v', '--v', '--cache-dir'];
    var skip = 0;
    while (skip < argv.length && String(argv[skip]).charAt(0) === '-') {
      var ga = String(argv[skip]);
      if (ga.indexOf('=') !== -1) { skip++; continue; }          /* --flag=value 自带值 */
      if (VALUE_OPTS.indexOf(ga) !== -1) { skip += 2; continue; } /* --flag value 吃掉下一个 */
      skip++;                                                     /* 布尔开关 */
    }
    if (skip) argv = argv.slice(skip);
    var sub = argv[0];

    /* ---------- 扩展子命令入口（实现在 assets/js/cmd-k8s.js） ----------
       kubectl 的子命令太多，create/debug/auth/label/patch/diff/cp/annotate/taint/
       replace/run/edit/expose/api-resources/exec 这些放在命令模块里维护，避免这个
       函数继续膨胀。约定：
         window.CC_K8S_EXTRA[子命令](argv, ctx, stdin, HOST, sub)
       第一个参数是 **kubectl 之后的原始 argv**（含子命令本身）。
       返回非空对象表示已处理；返回 null/undefined 就继续走下面的内置实现。
       这样"补一个子命令"不必再改动 shell.js。 */
    var kx = (ctx && ctx.shell && ctx.shell.k8sExtra) || window.CC_K8S_EXTRA;
    if (sub && kx && typeof kx[sub] === 'function') {
      var ext = kx[sub](argv, ctx, stdin, HOST, sub);
      if (ext) return ext;
    }

    /* 取 kubectl 的位置参数（丢掉 -n/-o/--tail 这类"带值选项"及其值）。
       为什么需要它：`kubectl logs` 此前用 `argv.filter(a => a[0] !== '-')[1]` 取 Pod 名，
       而 `-n` 的值 `my-app` 不以 `-` 开头，会被当成第一个位置参数 ——
       于是 **`kubectl logs -n my-app <pod>` 报 `pods "my-app" not found`**，
       而 `kubectl logs <pod> -n my-app` 却正常。同一个命令换个参数顺序就换了个结果，
       是最容易被误判成"我记错了语法"的一类错。 */
    function kubectlPos(argv) {
      var VALUE_FLAGS = ['-n', '--namespace', '-o', '--output', '-c', '--container', '--tail',
        '-l', '--selector', '--field-selector', '--sort-by', '--since', '--max-log-requests'];
      var out = [];
      for (var i = 0; i < argv.length; i++) {
        var a = String(argv[i]);
        if (VALUE_FLAGS.indexOf(a) !== -1) { i++; continue; }
        if (a.charAt(0) === '-') continue;
        out.push(a);
      }
      return out;
    }

    function flagsOf(list) {
      /* 默认命名空间跟随 kubeconfig 当前上下文（真机就是这个行为） */
      var f = { ns: K.contextNs || 'default', all: false, wide: false, output: null, watch: false, previous: false, container: null, tail: null, sortBy: null, fieldSelector: null, follow: false, labels: false };
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        /* 支持 -n my-app / -n=my-app / --namespace=my-app 三种写法 */
        if (a === '-n' || a === '--namespace') f.ns = list[++i];
        else if (a.indexOf('--namespace=') === 0) f.ns = a.slice(12);
        else if (/^-n=/.test(a)) f.ns = a.slice(3);
        else if (a === '-A' || a === '--all-namespaces') { f.all = true; }
        else if (a === '-o' || a === '--output') f.output = list[++i];
        else if (a.indexOf('--output=') === 0) f.output = a.slice(9);
        else if (a === '-w' || a === '--watch') f.watch = true;
        else if (a === '--previous' || a === '-p') f.previous = true;
        else if (a === '-c' || a === '--container') f.container = list[++i];
        else if (a === '--tail') f.tail = Number(list[++i]);
        else if (a.indexOf('--tail=') === 0) f.tail = Number(a.slice(7));
        else if (a === '-f' || a === '--follow') f.follow = true;
        else if (a.indexOf('--sort-by=') === 0) f.sortBy = a.slice(10);
        else if (a === '--sort-by') f.sortBy = list[++i];
        else if (a.indexOf('--field-selector=') === 0) f.fieldSelector = a.slice(17);
        else if (a === '--field-selector') f.fieldSelector = list[++i];
        else if (a === '--show-labels') f.labels = true;
      }
      return f;
    }

    /* 把 descriptor 形式统一成纯名字：pod/web-x、po/web-x、deploy/web → web-x */
    function stripKind(arg) {
      if (!arg) return arg;
      var m = String(arg).match(/^[a-z.]+[a-z0-9]*\/(.+)$/i);
      return m ? m[1] : arg;
    }

    /* 按名字取资源，默认优先当前命名空间 */
    function pickPod(name, ns, all) {
      for (var i = 0; i < K.pods.length; i++) {
        var p = K.pods[i];
        if (p.name === name && (all || p.ns === ns)) return p;
      }
      /* 名字唯一但不在目标命名空间时，也允许命中（贴近真机的模糊体验） */
      if (!all) {
        for (var j = 0; j < K.pods.length; j++) if (K.pods[j].name === name) return K.pods[j];
      }
      return null;
    }

    if (sub === 'config') {
      if (argv[1] === 'current-context') return ok([K.context]);
      if (argv[1] === 'get-contexts') {
        return ok([
          'CURRENT   NAME                    CLUSTER                 AUTHINFO                NAMESPACE',
          '*         ' + K.context + '   cce-cn-north-4-8f3c1a  user-cce-cn-north-4     my-app',
          '          cce-cn-north-4-test     cce-cn-north-4-2b1c9d  user-cce-test           default'
        ]);
      }
      return ok(['（教学环境实现了 kubectl config current-context / get-contexts / use-context）']);
    }

    if (sub === 'cluster-info') {
      return ok(['Kubernetes control plane is running at https://10.0.1.11:5443', 'CoreDNS is running at https://10.0.1.11:5443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy', '', 'To further debug and diagnose cluster problems, use \'kubectl cluster-info dump\'.']);
    }

    if (sub === 'version') {
      return ok(['Client Version: v1.27.5-r0-CCE22.9.1', 'Kustomize Version: v4.5.7', 'Server Version: v1.27.5-r0-CCE22.9.1']);
    }

    if (sub === 'get') {
      var f = flagsOf(argv);
      var kind = argv[1];
      var nameArg = argv[2] && argv[2].charAt(0) !== '-' ? argv[2] : null;
      var pods = K.pods.filter(function (p) { return f.all || p.ns === f.ns; });

      if (kind === 'nodes' || kind === 'node' || kind === 'no') {
        if (f.output === 'wide') {
          var o = ['NAME        STATUS   ROLES           AGE   VERSION                INTERNAL-IP   EXTERNAL-IP   OS-IMAGE              KERNEL-VERSION              CONTAINER-RUNTIME'];
          K.nodeList.forEach(function (n) {
            o.push(pad(n.name, 12) + pad(n.status, 9) + pad(n.role, 16) + pad(n.age, 6) + pad(n.version, 23) + pad(n.ip, 14) + pad('<none>', 14) + pad(n.os, 22) + pad('5.10.0-60.18.0.50.oe2203.x86_64', 28) + n.runtime);
          });
          return ok(o);
        }
        var o2 = ['NAME        STATUS   ROLES           AGE   VERSION'];
        K.nodeList.forEach(function (n) { o2.push(pad(n.name, 12) + pad(n.status, 9) + pad(n.role, 16) + pad(n.age, 6) + n.version); });
        return ok(o2);
      }

      if (kind === 'pods' || kind === 'pod' || kind === 'po') {
        var podName = stripKind(nameArg);
        if (podName) {
          var pod = pickPod(podName, f.ns, f.all);
          if (!pod) return fail(['Error from server (NotFound): pods "' + podName + '" not found']);
          var single = ok([
            'NAME                    READY   STATUS             RESTARTS   AGE',
            pad(pod.name, 24) + pad(pod.ready, 8) + pad(pod.status, 19) + pad(String(pod.restarts), 11) + pod.age,
            '', '（完整信息用 kubectl get pod ' + pod.name + ' -o yaml；排错建议 kubectl describe pod ' + pod.name + '）'
          ]);
          return single;
        }
        var nsCol = !!(f.all || f.output === 'wide');
        if (f.output === 'wide') {
          var o3 = [pad(nsCol ? 'NAMESPACE' : '', 12) + 'NAME                          READY   STATUS             RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES'];
          pods.forEach(function (p) {
            o3.push(pad(nsCol ? p.ns : '', 12) + pad(clip(p.name, 29), 30) + pad(p.ready, 8) + pad(p.status, 19) +
              pad(String(p.restarts), 11) + pad(p.age, 6) + pad(p.ip, 14) + pad(p.node, 12) + pad('<none>', 17) + '<none>');
          });
          return ok(o3);
        }
        if (f.output === 'jsonpath') {
          return ok(pods.map(function (p) { return p.name + '\t' + p.status; }));
        }
        var o4 = [pad(nsCol ? 'NAMESPACE' : '', 12) + 'NAME                          READY   STATUS             RESTARTS   AGE'];
        pods.forEach(function (p) {
          o4.push(pad(nsCol ? p.ns : '', 12) + pad(clip(p.name, 29), 30) + pad(p.ready, 8) + pad(p.status, 19) + pad(String(p.restarts), 11) + p.age);
        });
        if (!f.all) o4.push('', '（当前上下文默认命名空间是 ' + K.contextNs + '；看全部命名空间用 -A）');
        if (pods.some(function (p) { return p.status === 'Pending'; })) {
          o4.push('提示：有 Pod 处于 Pending，用 `kubectl describe pod <名字>` 看 Events 里的 FailedScheduling 原因。');
        }
        if (pods.some(function (p) { return p.status === 'CrashLoopBackOff'; })) {
          o4.push('提示：CrashLoopBackOff 要抓 `kubectl logs <名字> --previous`，那是崩溃前的输出。');
        }
        return ok(o4);
      }

      if (kind === 'deployments' || kind === 'deploy' || kind === 'deployment') {
        var o5 = ['NAME      READY   UP-TO-DATE   AVAILABLE   AGE'];
        K.deployments.filter(function (d) { return f.all || d.ns === f.ns; }).forEach(function (d) {
          o5.push(pad(d.name, 10) + pad(d.ready, 8) + pad(String(d.upToDate), 13) + pad(String(d.available), 12) + d.age);
        });
        return ok(o5);
      }

      if (kind === 'services' || kind === 'svc' || kind === 'service') {
        var o6 = ['NAME           TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)          AGE'];
        K.services.filter(function (s) { return f.all || s.ns === f.ns; }).forEach(function (s) {
          o6.push(pad(s.name, 15) + pad(s.type, 15) + pad(s.clusterIP, 15) + pad(s.externalIP, 16) + pad(s.ports, 17) + s.age);
        });
        return ok(o6);
      }

      if (kind === 'endpoints' || kind === 'ep') {
        var o7 = ['NAME           ENDPOINTS'];
        K.endpoints.filter(function (e) { return f.all || e.ns === f.ns; }).forEach(function (e) {
          o7.push(pad(e.name, 15) + e.endpoints);
        });
        o7.push('', '提示：endpoints 为 <none> 说明 Service 没匹配到 Ready 的 Pod —— 这是"Service 不通"的第一嫌疑。');
        return ok(o7);
      }

      if (kind === 'pvc' || kind === 'persistentvolumeclaims') {
        var o8 = ['NAME        STATUS    VOLUME                   CAPACITY   ACCESS MODES   STORAGECLASS   AGE'];
        K.pvcs.filter(function (p) { return f.all || p.ns === f.ns; }).forEach(function (p) {
          o8.push(pad(p.name, 12) + pad(p.status, 10) + pad(p.volume || '-', 25) + pad(p.capacity || '-', 11) + pad(p.accessModes, 15) + pad(p.storageClass, 15) + p.age);
        });
        return ok(o8);
      }

      if (kind === 'namespaces' || kind === 'ns') {
        var o9 = ['NAME              STATUS   AGE'];
        K.namespaces.forEach(function (n) { o9.push(pad(n, 18) + pad('Active', 9) + '42d'); });
        return ok(o9);
      }

      if (kind === 'events') {
        var ev = K.events.slice();
        if (f.fieldSelector && f.fieldSelector.indexOf('Warning') !== -1) {
          ev = ev.filter(function (e) { return e.type === 'Warning'; });
        }
        var o10 = ['LAST SEEN   TYPE      REASON               OBJECT                             MESSAGE'];
        ev.forEach(function (e) {
          o10.push(pad(e.time, 12) + pad(e.type, 10) + pad(e.reason, 21) + pad(e.obj, 35) + e.msg);
        });
        if (f.sortBy) o10.push('', '（已按 .lastTimestamp 排序 —— 不加这个参数时事件顺序是乱的）');
        return ok(o10);
      }

      if (kind === 'all') {
        return ok([
          'NAME                          READY   STATUS             RESTARTS   AGE',
          'pod/web-7d9c4b8f5-2xk9p       1/1     Running            0          12m',
          'pod/web-7d9c4b8f5-9q4zw       1/1     Running            0          12m',
          'pod/worker-6b8f7c9d4-m2vqt    0/1     CrashLoopBackOff   7          26m',
          '',
          'NAME              TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)          AGE',
          'service/web       ClusterIP      10.247.13.88   <none>          80/TCP           30d',
          'service/web-lb    LoadBalancer   10.247.13.95   121.36.44.17    80:30112/TCP     6d',
          '',
          'NAME                    READY   UP-TO-DATE   AVAILABLE   AGE',
          'deployment.apps/web     2/2     2            2           12m',
          'deployment.apps/worker  0/1     1            0           26m',
          '',
          '注意：kubectl get all 不包含 Ingress、PVC、ConfigMap、Secret、ServiceAccount，别以为它真的"全"了。'
        ]);
      }

      if (kind === 'api-resources') {
        return ok([
          'NAME          SHORTNAMES   APIVERSION   NAMESPACED   KIND',
          'pods          po           v1           true         Pod',
          'services      svc          v1           true         Service',
          'deployments   deploy       apps/v1      true         Deployment',
          'nodes         no           v1           false        Node',
          'persistentvolumeclaims pvc  v1           true         PersistentVolumeClaim',
          'ingresses     ing          networking.k8s.io/v1  true  Ingress',
          'events        ev           v1           true         Event'
        ]);
      }
      return fail(['error: the server doesn\'t have a resource type "' + kind + '"']);
    }

    if (sub === 'describe') {
      var kind2 = argv[1];
      var nm = argv[2] && argv[2].charAt(0) !== '-' ? argv[2] : null;
      var f2 = flagsOf(argv);
      if (nm) nm = stripKind(nm);
      /* 支持 kind/name 写法：kubectl describe pod/web-x */
      if (kind2 && kind2.indexOf('/') !== -1) {
        var sp = kind2.split('/');
        kind2 = sp[0];
        nm = sp[1];
      }
      if (/^pods?$|^po$/.test(kind2 || '')) {
        var p2 = K.pods.filter(function (p) { return p.name === nm; })[0];
        if (!p2) return fail(['Error from server (NotFound): pods "' + nm + '" not found']);
        var out = [
          'Name:             ' + p2.name,
          'Namespace:        ' + p2.ns,
          'Priority:         0',
          'Service Account:  default',
          'Node:             ' + p2.node + '/10.0.1.23',
          'Start Time:       Mon, 18 Mar 2024 09:38:32 +0800',
          'Labels:           app=' + (p2.name.indexOf('web') === 0 ? 'web' : p2.name.split('-')[0]),
          '                  pod-template-hash=7d9c4b8f5',
          'Status:           ' + p2.status,
          'IP:               ' + p2.ip,
          'Controlled By:    ReplicaSet/' + p2.name.replace(/-[a-z0-9]{5}$/, ''),
          'Containers:',
          '  ' + p2.containers[0] + ':',
          '    Image:          ' + p2.images,
          '    Port:           8080/TCP',
          '    State:          ' + (p2.status === 'CrashLoopBackOff'
            ? 'Waiting\n      Reason:       CrashLoopBackOff\n      Last State:   Terminated\n      Reason:       Error\n      Exit Code:    1\n      Started:      Mon, 18 Mar 2024 09:20:10 +0800\n      Finished:     Mon, 18 Mar 2024 09:20:11 +0800'
            : (p2.status === 'Pending' ? 'Waiting' : 'Running\n      Started:      Mon, 18 Mar 2024 09:38:41 +0800')),
          '    Ready:          ' + (p2.ready === '1/1' ? 'True' : 'False'),
          '    Restart Count:  ' + p2.restarts,
          '    Limits:',
          '      cpu:     500m',
          '      memory:  512Mi',
          '    Requests:',
          '      cpu:        200m',
          '      memory:     256Mi',
          '    Liveness:     http-get http://:8080/healthz delay=10s timeout=1s period=10s #success=1 #failure=3',
          '    Readiness:    http-get http://:8080/healthz delay=5s timeout=1s period=10s',
          '    Environment:  <none>',
          '    Mounts:',
          '      /var/run/secrets/kubernetes.io/serviceaccount from kube-api-access-8x2kq (ro)',
          'Conditions:',
          '  Type              Status',
          '  Initialized       True',
          '  Ready             ' + (p2.ready === '1/1' ? 'True' : 'False'),
          '  ContainersReady   ' + (p2.ready === '1/1' ? 'True' : 'False'),
          '  PodScheduled      ' + (p2.status === 'Pending' ? 'False' : 'True'),
          'Volumes:',
          '  kube-api-access-8x2kq:',
          '    Type:  Projected (a volume that contains injected data from multiple sources)',
          'Events:'
        ];
        var events = p2.events || [{ type: 'Normal', reason: 'Scheduled', msg: 'Successfully assigned ' + p2.ns + '/' + p2.name + ' to ' + p2.node }];
        (out).push('  Type     Reason            Age   From               Message');
        (out).push('  ----     ------            ----  ----               -------');
        events.forEach(function (e) {
          out.push('  ' + pad(e.type, 9) + pad(e.reason, 18) + pad('2m', 6) + pad('kubelet', 19) + e.msg);
        });
        return ok(out);
      }
      if (/^nodes?$|^no$/.test(kind2 || '')) {
        return ok([
          'Name:               ' + nm,
          'Roles:              worker',
          'Labels:             beta.kubernetes.io/arch=amd64',
          '                    beta.kubernetes.io/os=linux',
          '                    kubernetes.io/hostname=' + nm,
          'Annotations:        node.alpha.kubernetes.io/ttl: 0',
          'CreationTimestamp:  Sun, 04 Feb 2024 10:12:11 +0800',
          'Taints:             <none>',
          'Unschedulable:      false',
          'Conditions:',
          '  Type             Status  LastHeartbeatTime                 Reason',
          '  MemoryPressure   False   Mon, 18 Mar 2024 09:50:41 +0800   KubeletHasSufficientMemory',
          '  DiskPressure     False   Mon, 18 Mar 2024 09:50:41 +0800   KubeletHasNoDiskPressure',
          '  PIDPressure      False   Mon, 18 Mar 2024 09:50:41 +0800   KubeletHasSufficientPID',
          '  Ready            True    Mon, 18 Mar 2024 09:50:41 +0800   KubeletReady',
          'Addresses:',
          '  InternalIP:  ' + nm,
          '  Hostname:    ' + nm,
          'Capacity:',
          '  cpu:                8',
          '  memory:             16417632Ki',
          '  pods:               110',
          'Allocatable:',
          '  cpu:                7900m',
          '  memory:             15222432Ki',
          'Allocated resources:',
          '  Resource           Requests      Limits',
          '  cpu                3120m (39%)   4500m (56%)',
          '  memory             8214Mi (54%)  10240Mi (67%)',
          'Events:              <none>'
        ]);
      }
      if (/^pvc$|^persistentvolumeclaims?$/.test(kind2 || '')) {
        var pv = K.pvcs.filter(function (x) { return x.name === nm; })[0];
        if (!pv) return fail(['Error from server (NotFound): persistentvolumeclaims "' + nm + '" not found']);
        return ok([
          'Name:          ' + pv.name,
          'Namespace:     ' + pv.ns,
          'StorageClass:  ' + pv.storageClass,
          'Status:        ' + pv.status,
          'Volume:        ' + (pv.volume || ''),
          'Labels:        <none>',
          'Annotations:   volume.beta.kubernetes.io/storage-provisioner: everest-csi-provisioner',
          'Finalizers:    [kubernetes.io/pvc-protection]',
          'Capacity:      ' + (pv.capacity || ''),
          'Access Modes:  ' + pv.accessModes,
          'VolumeMode:    Filesystem',
          'Events:',
          '  Type     Reason              Age   From                         Message',
          '  ----     ------              ----  ----                         -------',
          pv.status === 'Pending'
            ? '  Warning  ProvisioningFailed  8m    everest-csi-provisioner      failed to provision volume with StorageClass "csi-nas": no available NAS mount point'
            : '  Normal   ProvisioningSucceeded  30d  everest-csi-provisioner      Successfully provisioned volume ' + pv.volume
        ]);
      }
      if (/^svc$|^services?$/.test(kind2 || '')) {
        var sv = K.services.filter(function (x) { return x.name === nm; })[0];
        if (!sv) return fail(['Error from server (NotFound): services "' + nm + '" not found']);
        var ep = K.endpoints.filter(function (x) { return x.name === nm; })[0];
        return ok([
          'Name:                     ' + sv.name,
          'Namespace:                ' + sv.ns,
          'Labels:                   app=' + sv.selector.split('=')[1],
          'Selector:                 ' + sv.selector,
          'Type:                     ' + sv.type,
          'IP Family Policy:         SingleStack',
          'IP Families:              IPv4',
          'IP:                       ' + sv.clusterIP,
          'IPs:                      ' + sv.clusterIP,
          'Port:                     http  80/TCP',
          'TargetPort:               8080/TCP',
          'Endpoints:                ' + (ep ? ep.endpoints : '<none>'),
          'Session Affinity:         None',
          'External Traffic Policy:  Cluster',
          'Events:                   <none>'
        ]);
      }
      return fail(['（教学环境实现了 describe pod / node / pvc / svc）']);
    }

    if (sub === 'logs') {
      var f3 = flagsOf(argv);
      var podName = kubectlPos(argv)[1];
      var pod3 = K.pods.filter(function (p) { return p.name === podName; })[0];
      if (!pod3) return fail(['Error from server (NotFound): pods "' + (podName || '') + '" not found']);
      var lines = f3.previous ? (pod3.prevLogs || pod3.logs) : pod3.logs;
      if (!lines || !lines.length) return ok(['（该 Pod 当前没有日志输出）']);
      var res = ok(lines.slice(0, f3.tail || lines.length));
      if (f3.previous) res.out.push('', '（--previous 取的是上一个已终止容器实例的日志；Pod 重建后 kubectl logs 只能看到当前与上一次）');
      return res;
    }

    if (sub === 'top') {
      var kind3 = argv[1];
      if (kind3 === 'node' || kind3 === 'nodes') {
        var o11 = ['NAME        CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%'];
        K.nodeList.forEach(function (n) {
          o11.push(pad(n.name, 12) + pad(n.cpuUsed.replace('m', 'm'), 13) + pad(n.cpuPct, 7) + pad(n.memUsed, 16) + n.memPct);
        });
        return ok(o11);
      }
      var o12 = ['NAME                          CPU(cores)   MEMORY(bytes)'];
      o12.push('web-7d9c4b8f5-2xk9p           124m         612Mi');
      o12.push('web-7d9c4b8f5-9q4zw           98m          588Mi');
      o12.push('worker-6b8f7c9d4-m2vqt        4m           42Mi');
      o12.push('mysql-0                       218m         1824Mi');
      return ok(o12);
    }

    if (sub === 'apply') {
      var fileArg = null;
      for (var i = 0; i < argv.length; i++) if (argv[i] === '-f') fileArg = argv[++i];
      if (!fileArg) return fail(['error: must specify one of -f and -k']);
      return ok([
        'deployment.apps/web configured',
        '',
        '（教学环境模拟 apply 成功；真机上要跟 `kubectl rollout status deploy/web` 确认是否真的滚完）'
      ]);
    }

    if (sub === 'rollout') {
      var act = argv[1];
      if (act === 'status') return ok(['deployment "web" successfully rolled out']);
      if (act === 'history') {
        return ok([
          'REVISION  CHANGE-CAUSE',
          '1         <none>',
          '2         <none>',
          '3         <none>',
          '', '提示：用 `kubectl rollout undo deploy/web --to-revision=2` 回滚到第 2 版。'
        ]);
      }
      if (act === 'undo') return ok(['deployment.apps/web rolled back']);
      if (act === 'restart') return ok(['deployment.apps/web restarted']);
      return ok(['（教学环境实现了 rollout status / history / undo / restart）']);
    }

    if (sub === 'scale') return ok(['deployment.apps/web scaled']);
    if (sub === 'port-forward') {
      return ok([
        'Forwarding from 127.0.0.1:3306 -> 3306',
        'Forwarding from [::1]:3306 -> 3306',
        '',
        '（教学环境不会真的建立隧道；真机上这条命令会一直占用当前终端，Ctrl+C 才断开）'
      ]);
    }
    if (sub === 'auth') {
      if (argv[1] === 'can-i') {
        if (argv.indexOf('--list') !== -1) {
          return ok([
            'Resources                                       Non-Resource URLs   Resource Names   Verbs',
            'pods                                            []                  []               [get list watch create delete]',
            'deployments.apps                                []                  []               [get list watch update patch]',
            'services                                        []                  []               [get list watch]',
            'secrets                                         []                  []               [get list]',
            'events                                          []                  []               [get list watch]'
          ]);
        }
        return ok(['yes']);
      }
    }
    if (sub === 'cordon') return ok(['node/' + (argv[1] || '') + ' cordoned']);
    if (sub === 'uncordon') return ok(['node/' + (argv[1] || '') + ' uncordoned']);
    if (sub === 'drain') {
      return ok([
        'node/' + (argv[1] || '') + ' cordoned',
        'evicting pod my-app/web-7d9c4b8f5-2xk9p',
        'evicting pod my-app/worker-6b8f7c9d4-m2vqt',
        'pod/web-7d9c4b8f5-2xk9p evicted',
        '（教学环境模拟驱逐；真机上还会受 PDB 限制，有状态服务的 Pod 可能驱逐失败）'
      ]);
    }
    if (sub === 'exec') {
      return ok([
        '（教学环境不提供交互式 shell —— 真机上 `kubectl exec -it <pod> -- bash` 会进容器）',
        '',
        '可以练的等价命令：',
        '  kubectl exec <pod> -- env',
        '  kubectl exec <pod> -- cat /etc/resolv.conf'
      ]);
    }
    if (sub === 'delete') {
      return ok(['（教学环境不会真的删除资源；真机上删除 LoadBalancer 类型的 Service 会连带删掉云上的负载均衡器）']);
    }
    if (sub === 'set') return ok(['deployment.apps/web image updated']);
    if (sub === 'explain') {
      return ok([
        'KIND:     Pod',
        'VERSION:  v1',
        '',
        'FIELD:    resources <Object>',
        '',
        'DESCRIPTION:',
        '     Compute Resources required by this container. Cannot be updated.',
        '',
        'FIELDS:',
        '   limits       <map[string]string>',
        '   requests     <map[string]string>'
      ]);
    }
    return fail(['error: unknown command "' + (sub || '') + '" for "kubectl"']);
  };

  /* ---------- 华为云 CLI（教学子集） ---------- */
  CMDS.hcloud = function (argv, ctx, stdin, HOST) {
    if (!argv.length) return fail(['hcloud: missing command']);
    var svc = argv[0], act = argv[1];
    if (svc === 'configure') {
      if (act === 'list' || !act) {
        return ok([
          'profile      access-key                  region       mode',
          'default      9J**************Q2          cn-north-4   AK/SK'
        ]);
      }
      if (act === 'init') return ok(['（教学环境不进入交互式配置；真机上 hcloud configure init 会依次问你要 AK、SK、region）']);
      return ok([]);
    }
    if (svc === 'ECS' || svc === 'ecs') {
      if (act === 'ListServersDetails') {
        return ok([
          '{',
          '  "count": 2,',
          '  "servers": [',
          '    {',
          '      "id": "8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88",',
          '      "name": "web-prod-01",',
          '      "status": "ACTIVE",',
          '      "flavor": { "id": "s6.large.2", "name": "s6.large.2" },',
          '      "addresses": { "0e5b1c8a-4f21-4a1e-9d3c-6b2f8e7a1c05": [ { "addr": "10.0.1.23", "version": 4, "OS-EXT-IPS:type": "fixed" }, { "addr": "121.36.44.17", "version": 4, "OS-EXT-IPS:type": "floating" } ] },',
          '      "key_name": "prod-key",',
          '      "created": "2024-02-04T10:12:11Z",',
          '      "availability_zone": "cn-north-4a"',
          '    },',
          '    {',
          '      "id": "b41d9e05-2c7a-4f38-8a61-5d0e2f9b7c31",',
          '      "name": "db-prod-01",',
          '      "status": "ACTIVE",',
          '      "flavor": { "id": "s6.xlarge.4", "name": "s6.xlarge.4" },',
          '      "addresses": { "0e5b1c8a-4f21-4a1e-9d3c-6b2f8e7a1c05": [ { "addr": "10.0.2.15", "version": 4, "OS-EXT-IPS:type": "fixed" } ] },',
          '      "created": "2024-02-04T10:20:44Z",',
          '      "availability_zone": "cn-north-4a"',
          '    }',
          '  ]',
          '}'
        ]);
      }
      if (act === 'BatchStartServers' || act === 'BatchStopServers' || act === 'BatchRebootServers') {
        return ok(['（教学环境不会真的开关机；这类批量操作在生产上会影响业务，务必先确认实例清单）']);
      }
    }
    if (svc === 'VPC' || svc === 'vpc') {
      if (act === 'ListSecurityGroups') {
        return ok([
          '{',
          '  "security_groups": [',
          '    { "id": "8a2c5b9d-2e4f-4a1c-8b5d-3e9f2a6c4b8d", "name": "sg-web", "description": "web 层安全组",',
          '      "security_group_rules": [',
          '        { "direction": "ingress", "protocol": "tcp", "port_range_min": 80, "port_range_max": 80, "remote_ip_prefix": "0.0.0.0/0" },',
          '        { "direction": "ingress", "protocol": "tcp", "port_range_min": 22, "port_range_max": 22, "remote_ip_prefix": "203.0.113.0/24" },',
          '        { "direction": "ingress", "protocol": "tcp", "port_range_min": 8080, "port_range_max": 8080, "remote_ip_prefix": "10.0.0.0/16" }',
          '      ] }',
          '  ]',
          '}',
          '',
          '提示：3306 不在入方向规则里 —— 这就是 db-prod-01 连不上的原因（安全组没放行）。'
        ]);
      }
    }
    if (svc === 'OBS' || svc === 'obs') {
      return ok(['（教学环境实现了 ECS / VPC / configure 子集；OBS 建议用 obsutil：obsutil ls obs://prod-backup）']);
    }
    /* ⚠️ 其余服务（ELB / RDS / EVS / CES / IAM / CCE / IMS / EIP…）交给
       assets/js/cmd-cloud.js —— 手册里这些服务各有 2~8 条记录，
       如果引擎只会 ECS/VPC，那些记录的示例就只能全部标"未实现"，
       而它们讲的恰恰是**云上排查最常用的那几步**（看负载均衡后端健康、
       查有没有没挂载的云盘、看监控指标、查密钥）。
       用一个扩展钩子而不是把所有服务塞进这个函数：
       `hcloud` 的服务面很宽，数据放独立模块更好维护。 */
    if (window.CC_CLOUD_EXTRA && typeof window.CC_CLOUD_EXTRA.handle === 'function') {
      var extRes = window.CC_CLOUD_EXTRA.handle(svc, act, argv, ctx, ok, fail);
      if (extRes) return extRes;
    }
    return fail(['hcloud: unsupported service "' + svc + '" in this teaching environment']);
  };

  /* OBS 桶里到底有什么 —— 这些对象要给 obsutil ls / stat / sign / rm 用。
     数据与站内课程对齐：prod-static 放前端产物（web/）、prod-backup 放备份与报表。 */
  var OBS_BUCKETS = {
    'prod-static': {
      storageClass: 'STANDARD',
      objects: [
        { key: 'index.html', size: 2841, mtime: '2024-03-18 09:12:04', acl: 'public-read', type: 'text/html' },
        { key: 'health.txt', size: 12, mtime: '2024-03-18 09:12:04', acl: 'public-read', type: 'text/plain' },
        { key: 'web/index.html', size: 2841, mtime: '2024-03-18 09:12:04', acl: 'public-read', type: 'text/html' },
        { key: 'web/app.9f3c1a72.js', size: 428190, mtime: '2024-03-18 09:12:05', acl: 'public-read', type: 'application/javascript' },
        { key: 'web/app.9f3c1a72.css', size: 38120, mtime: '2024-03-18 09:12:05', acl: 'public-read', type: 'text/css' },
        { key: 'web/2024/old-index.html', size: 2701, mtime: '2024-01-09 03:20:11', acl: 'public-read', type: 'text/html' },
        { key: 'report/2025-01.xlsx', size: 184320, mtime: '2024-02-01 10:00:00', acl: 'private', type: 'application/vnd.ms-excel' },
        { key: 'report/2025-01.csv', size: 92160, mtime: '2024-02-01 10:00:02', acl: 'private', type: 'text/csv' }
      ]
    },
    'prod-backup': {
      storageClass: 'STANDARD',
      objects: [
        { key: 'db-20240317.sql.gz', size: 524288000, mtime: '2024-03-17 02:04:11', acl: 'private', type: 'application/gzip' },
        { key: 'db-20240318.sql.gz', size: 526385152, mtime: '2024-03-18 02:03:58', acl: 'private', type: 'application/gzip' },
        { key: 'web/2024/access-2024-01-09.log.gz', size: 10485760, mtime: '2024-01-10 03:00:00', acl: 'private', type: 'application/gzip' },
        { key: 'archive/2024-backup.tar.gz', size: 10737418240, mtime: '2024-01-01 00:30:00', acl: 'private', type: 'application/gzip', storageClass: 'Archive' },
        { key: 'report/2025-01.xlsx', size: 184320, mtime: '2024-02-01 10:00:00', acl: 'private', type: 'application/vnd.ms-excel' }
      ]
    }
  };
  function obsBucketOf(p) {
    var m = String(p).match(/^obs:\/\/([^\/]+)/);
    return m ? m[1] : null;
  }
  function fmtSize(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + 'MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + 'KB';
    return n + 'B';
  }
  CMDS.obsutil = function (argv, ctx, stdin, HOST) {
    var sub = argv[0];
    var pos = argv.filter(function (a) { return String(a).charAt(0) !== '-'; });
    function optOf(name) {
      for (var i = 0; i < argv.length; i++) {
        if (argv[i] === name) return argv[i + 1];
        if (String(argv[i]).indexOf(name + '=') === 0) return String(argv[i]).slice(name.length + 1);
      }
      return null;
    }
    function objLine(b, o) {
      return pad(o.key, 42) + pad(fmtSize(o.size), 11) + pad(o.mtime, 21)
        + pad(o.storageClass || b.storageClass, 11) + o.type;
    }
    if (sub === 'ls') {
      var target = pos[1] || null;
      /* `obsutil ls` 不带参数 → 列桶；带 `obs://桶/前缀` → 列对象。
         ⚠️ 早先无论带不带参数都只打印那张"桶清单"，于是
         `obsutil ls obs://prod-backup` 的输出和 `obsutil ls` 一模一样 ——
         学员按示例敲完，看到的是桶名列表而不是桶里的对象，
         会以为"这个桶是空的"。 */
      if (!target) {
        var bl = ['Bucket list:'];
        Object.keys(OBS_BUCKETS).forEach(function (k, i) { bl.push('[' + (i + 1) + '] obs://' + k); });
        bl.push('');
        bl.push('说明：obsutil ls obs://prod-backup 可以列出桶内对象。');
        return ok(bl);
      }
      var bname = obsBucketOf(target);
      var bucket = OBS_BUCKETS[bname];
      if (!bucket) return fail(['obsutil: bucket [' + (bname || '') + '] does not exist'], 1);
      var prefix = String(target).replace(/^obs:\/\/[^\/]+\/?/, '');
      var limit = Number(optOf('-limit') || 1000);
      var hit = bucket.objects.filter(function (o) { return prefix === '' || o.key.indexOf(prefix) === 0; });
      if (!hit.length) return ok(['List objects successfully, ' + bname + ' has no object with prefix [' + prefix + ']']);
      var out = ['Bucket: ' + bname + '   Prefix: ' + (prefix || '(none)'),
        pad('Key', 42) + pad('Size', 11) + pad('LastModified', 21) + pad('StorageClass', 11) + 'ContentType'];
      hit.slice(0, limit).forEach(function (o) { out.push(objLine(bucket, o)); });
      out.push('');
      out.push('Total: ' + hit.length + ' objects' + (hit.length > limit ? '（只显示前 ' + limit + ' 条，用 -limit 调整）' : ''));
      return ok(out);
    }
    if (sub === 'stat') {
      var st = obsBucketOf(pos[1]);
      var sfx = String(pos[1] || '').replace(/^obs:\/\/[^\/]+\/?/, '');
      var sb = OBS_BUCKETS[st];
      if (!sb) return fail(['obsutil: bucket [' + (st || '') + '] does not exist'], 1);
      if (!sfx) {
        return ok([
          'Bucket: ' + st,
          'StorageClass: ' + sb.storageClass,
          'Objects: ' + sb.objects.length,
          'TotalSize: ' + fmtSize(sb.objects.reduce(function (a, o) { return a + o.size; }, 0)),
          'Location: cn-north-4',
          'RequestId: 0000018E3F2A1B4C00000001'
        ]);
      }
      var so = null;
      sb.objects.forEach(function (o) { if (o.key === sfx) so = o; });
      if (!so) return fail(['obsutil: object [' + pos[1] + '] does not exist'], 1);
      return ok([
        'Key: ' + so.key,
        'Size: ' + fmtSize(so.size) + ' (' + so.size + ' bytes)',
        'LastModified: ' + so.mtime,
        'ETag: "' + obsEtag(so.key) + '"',
        'ContentType: ' + so.type,
        'ACL: ' + so.acl,
        'StorageClass: ' + (so.storageClass || sb.storageClass),
        'RequestId: 0000018E3F2A1B4C00000002'
      ]);
    }
    if (sub === 'sign') {
      var sg = obsBucketOf(pos[1]);
      var gk = String(pos[1] || '').replace(/^obs:\/\/[^\/]+\/?/, '');
      var gb = OBS_BUCKETS[sg];
      if (!gb) return fail(['obsutil: bucket [' + (sg || '') + '] does not exist'], 1);
      var exists = gb.objects.some(function (o) { return o.key === gk; });
      if (!exists) return fail(['obsutil: object [' + pos[1] + '] does not exist'], 1);
      var days = Number(optOf('-days') || 7);
      return ok([
        'Generating temporary signature url ...',
        'https://' + sg + '.obs.cn-north-4.myhuaweicloud.com/' + gk
          + '?AccessKeyId=9J**************Q2&Expires=' + (1711000000 + days * 86400)
          + '&Signature=' + obsEtag(gk + days) + '%3D',
        '',
        '（教学环境）签名链接 = 把"临时授权"编码进 URL，**不用把 AK/SK 给对方**。',
        '有效期由 -days 控制（默认 7 天）；-e 可以精确到秒。'
      ]);
    }
    if (sub === 'cp' || sub === 'sync') {
      /* 预演（-dryRun）只报告不改动 —— 这是发布前最重要的一道闸 */
      var dry = argv.some(function (a) { return /^-d?ryRun$/i.test(String(a)) || String(a).toLowerCase() === '-dryrun'; });
      var lines = ['Start at 2024-03-18 09:51:02.114382 +0800 CST'];
      if (dry) {
        lines.push('Dry run: the following operations will be performed:');
        lines.push('  Upload 1842 objects (12.6GB) to obs://prod-static/web/');
        lines.push('  Skip 0 objects (same size and last modified time)');
        lines.push('  Delete 0 objects (no -delete specified)');
        lines.push('');
        lines.push('（-dryRun）**没有真的上传**。发布前先跑它，确认目标桶、数量、体积都符合预期 ——');
        lines.push('传错桶与误删是发布类操作最常见的两起事故。');
      } else {
        lines.push('Upload successfully, 1842 files, 12.6GB, cost 812s, avg speed 15.9MB/s');
        lines.push('Task id: 8f3c1a724d5e4b919c2a1e7d6b0c4f88');
      }
      return ok(lines);
    }
    if (sub === 'rm') {
      return ok([
        'Deleting objects ...',
        'Delete successfully, 3 objects, cost 0.412s',
        '',
        '（教学环境不会真的删对象；真机上 `obsutil rm obs://桶/前缀/ -r -f` 会**递归删除**，',
        '且 OBS 没有回收站 —— 删之前先 `obsutil ls` 确认前缀范围。）'
      ]);
    }
    if (sub === 'mb') {
      return ok(['Create bucket [' + (obsBucketOf(pos[1]) || '') + '] successfully, cost 1.204s']);
    }
    if (sub === 'restore') {
      return ok([
        'Restore object request submitted.',
        'Object: ' + (pos[1] || ''),
        'Days: ' + (optOf('-days') || 1),
        '',
        '（教学环境）归档存储（Archive）**不能直接下载**，要先 restore 解冻；',
        '解冻本身要几分钟到几小时，且**另计费用** —— 这就是"归档便宜但有代价"的地方。'
      ]);
    }
    if (sub === 'chattri') {
      var chOut = ['Set object acl successfully.'];
      /* 设 public-read 是静态托管必须的，也是对全网开放 —— 两句都要说 */
      if (argv.some(function (a) { return String(a).indexOf('-acl=') === 0; })) {
        chOut.push('（教学环境）把对象设为 public-read 就等于**对全网开放**：');
        chOut.push('静态托管必须这么做，但**别把数据库备份、报表这类私有文件一起放进来**。');
      }
      return ok(chOut);
    }
    if (sub === 'config') return ok(['Config file is saved successfully.']);
    return ok(['（教学环境实现了 obsutil 的 ls / stat / cp / sync / rm / mb / restore / sign / chattri / config）']);
  };
  /* 给对象算一个确定性 ETag（同一对象每次一致，方便核对） */
  function obsEtag(seed) {
    var h = 0, s = String(seed);
    for (var i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 4294967296;
    return (h.toString(16) + 'e3b0c44298fc1c149afbf4c8996fb924').slice(0, 32);
  }

  /* ======================= 每实例一份的仿真状态 =======================
     mysql / redis / git / nginx 有些数据会被命令改写（SET 一个 key、commit 一次、
     nginx -s stop），这类状态必须跟着 Shell 实例走：主站与练习平台是两台机器，
     同一台机器的两个标签页也不该互相污染。
     挂在虚拟文件系统的根节点上最省事 —— 所有命令只遍历 root.children，这个附加属性
     对它们完全不可见；shell.reset() 换掉 root 时状态也就一起清零了。 */
  function stateOf(root, key, init) {
    var k = '$cc_' + key;
    if (!root[k]) root[k] = init;
    return root[k];
  }

  /* 读虚拟文件系统里的一个文件（不存在/是目录都返回 null） */
  function readNode(ctx, abs) {
    var n = findNode(ctx.root, abs);
    return n && n.type === 'file' ? String(n.content === undefined ? '' : n.content) : null;
  }

  /* 建目录（逐级补全），返回目录节点 */
  function ensureDir(ctx, abs) {
    var segs = segments(abs), cur = ctx.root, path = '';
    for (var i = 0; i < segs.length; i++) {
      path += '/' + segs[i];
      if (!cur.children[segs[i]]) {
        var nd = newNode('dir', segs[i]);
        nd.mtime = fmtNow();
        cur.children[segs[i]] = nd;
      }
      cur = cur.children[segs[i]];
    }
    return cur;
  }

  /* 写文件（不存在就建），返回文件节点 */
  function ensureFile(ctx, abs, text) {
    var parent = ensureDir(ctx, parentOf(abs));
    var name = baseName(abs);
    if (!parent.children[name] || parent.children[name].type !== 'file') {
      parent.children[name] = newNode('file', name);
    }
    parent.children[name].content = text;
    parent.children[name].mtime = fmtNow();
    return parent.children[name];
  }

  /* /etc/hosts 解析成 { 名字: IP }。mysql/redis 判断"这台机器能不能连上"要用它：
     练习平台换了主机名/IP 之后（HOST 形参），这里出来的结果依然是对的。 */
  function hostMap(ctx, HOST) {
    var m = { 'localhost': '127.0.0.1', 'localhost.localdomain': '127.0.0.1' };
    if (HOST.hostname && HOST.ip) m[HOST.hostname] = HOST.ip;
    var txt = readNode(ctx, '/etc/hosts') || '';
    txt.split('\n').forEach(function (line) {
      var parts = String(line).replace(/#.*$/, '').trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) return;
      for (var i = 1; i < parts.length; i++) m[parts[i]] = parts[0];
    });
    return m;
  }

  /* 是不是"本机"（本机可以走 socket / 回环，不受网络策略影响） */
  function isLocalHost(name, HOST) {
    if (!name) return true;
    if (name === 'localhost' || name === '127.0.0.1' || name === '::1') return true;
    if (HOST.hostname && name === HOST.hostname) return true;
    if (HOST.ip && name === HOST.ip) return true;
    return false;
  }

  /* redis 的命令行模式匹配（* ? [..]）—— KEYS / --scan --pattern 都用它 */
  function globToRe(pat) {
    var out = '^';
    for (var i = 0; i < pat.length; i++) {
      var ch = pat.charAt(i);
      if (ch === '*') out += '.*';
      else if (ch === '?') out += '.';
      else if (ch === '[') {
        var j = pat.indexOf(']', i);
        if (j > i) { out += pat.slice(i, j + 1); i = j; } else out += '\\[';
      } else if ('\\^$.|+(){}'.indexOf(ch) !== -1) out += '\\' + ch;
      else out += ch;
    }
    return new RegExp(out + '$');
  }

  /* SQL 的 LIKE 用 % 和 _ 当通配符（和 redis 的 glob 不是一套，别混用） */
  function likeToRe(pat) {
    var out = '^';
    for (var i = 0; i < pat.length; i++) {
      var ch = pat.charAt(i);
      if (ch === '%') out += '.*';
      else if (ch === '_') out += '.';
      else if ('\\^$.|+(){}*?[]'.indexOf(ch) !== -1) out += '\\' + ch;
      else out += ch;
    }
    return new RegExp(out + '$', 'i');
  }

  /* 按分隔符切分，但跳过引号里的（SQL / SQL 字符串要用） */
  function splitTop(str, sep) {
    var parts = [], cur = '', quote = null;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === sep) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map(function (x) { return x.trim(); }).filter(function (x) { return x !== ''; });
  }

  /* 去掉一行的引号（'abc' → abc） */
  function unquote(v) {
    var s = String(v).trim();
    if ((s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") || (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"')) {
      return s.slice(1, -1);
    }
    return s;
  }

  /* ======================= mysql（客户端子集） =======================
     输出是真算出来的：库表结构来自下面的仿真目录，服务器版本读 mysql8 容器的启动
     日志，默认库读 /data/app/config.yaml 的 JDBC URL，客户端 IP 读形参 HOST
     （主站 10.0.1.23 / 练习台 192.168.17.10 各自正确，不写死）。
     交互式客户端无法在单行终端里模拟，统一用 -e "SQL" 执行。 */

  var MYSQL_DBS = {
    information_schema: { comment: '元数据库：描述所有库表', tables: ['CHARACTER_SETS', 'COLUMNS', 'ENGINES', 'INNODB_TRX', 'PROCESSLIST', 'SCHEMATA', 'TABLES', 'USER_PRIVILEGES'] },
    mysql: { comment: '系统库：账号与权限', tables: ['columns_priv', 'db', 'engine_cost', 'gtid_executed', 'help_category', 'proxies_priv', 'role_edges', 'tables_priv', 'time_zone', 'user'] },
    orders: { comment: '订单业务库（/data/app/config.yaml 里的 datasource 指向它）', tables: ['order_items', 'order_status_log', 'orders', 'payments', 'users'] },
    performance_schema: { comment: '性能视图', tables: ['events_statements_summary_by_digest', 'global_status', 'replication_applier_status_by_worker', 'session_variables', 'threads'] },
    sys: { comment: '把 performance_schema 包装成人话的视图', tables: ['innodb_lock_waits', 'processlist', 'schema_table_statistics', 'session', 'statements_with_full_table_scans'] }
  };

  /* 行数/体积按"订单查询变慢"的真实处境给：order_status_log 已经 5200 万行、
     又只增不改没有索引 —— 慢查询的根因就在这里，和 SHOW PROCESSLIST 对得上 */
  var MYSQL_TABLE_STATS = {
    orders: [
      { TABLE_NAME: 'order_items', ENGINE: 'InnoDB', TABLE_ROWS: 42118330, DATA_LENGTH: 8589934592, TABLE_COMMENT: '订单明细' },
      { TABLE_NAME: 'order_status_log', ENGINE: 'InnoDB', TABLE_ROWS: 52118330, DATA_LENGTH: 6657199308, TABLE_COMMENT: '状态流水：只增不改，没有索引' },
      { TABLE_NAME: 'orders', ENGINE: 'InnoDB', TABLE_ROWS: 18204412, DATA_LENGTH: 4398046511, TABLE_COMMENT: '订单主表' },
      { TABLE_NAME: 'payments', ENGINE: 'InnoDB', TABLE_ROWS: 9120441, DATA_LENGTH: 2147483648, TABLE_COMMENT: '支付流水' },
      { TABLE_NAME: 'users', ENGINE: 'InnoDB', TABLE_ROWS: 982140, DATA_LENGTH: 193986560, TABLE_COMMENT: '用户资料' }
    ]
  };

  /* MySQL 8.0 的常见参数（教学环境只列这些高频的） */
  var MYSQL_VARS = {
    'character_set_server': 'utf8mb4',
    'collation_server': 'utf8mb4_0900_ai_ci',
    'datadir': '/var/lib/mysql/',
    'innodb_buffer_pool_size': '2147483648',
    'innodb_flush_log_at_trx_commit': '1',
    'innodb_log_file_size': '1073741824',
    'long_query_time': '5.000000',
    'max_allowed_packet': '67108864',
    'max_connections': '1000',
    'max_execution_time': '0',
    'slow_query_log': 'ON',
    'slow_query_log_file': '/var/lib/mysql/slow.log',
    'sync_binlog': '1',
    'transaction_isolation': 'READ-COMMITTED',
    'wait_timeout': '28800'
  };

  /* 账号密码是"这台仿真库"的数据，不是机器身份；-p 不带值时教学环境跳过交互提示 */
  var MYSQL_PASSWORDS = { root: 'Root@2024', app: 'App@2024' };

  function mysqlServerVersion() {
    var list = (((window.CC_TERM_FS || {}).docker || {}).containers) || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.state !== 'running' || !/mysql/i.test(String(c.image))) continue;
      var logs = c.logs || [];
      for (var j = 0; j < logs.length; j++) {
        var m = String(logs[j]).match(/Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
        if (m) return m[1];
      }
    }
    return '8.0.36';
  }

  /* 应用连的是哪台库、哪个库名 —— 从 /data/app/config.yaml 的 JDBC URL 里读出来 */
  function mysqlAppServer(ctx) {
    var txt = readNode(ctx, '/data/app/config.yaml') || '';
    var m = txt.match(/jdbc:mysql:\/\/([^\/:?]+)(?::(\d+))?\/([A-Za-z0-9_$]+)/);
    return m ? { host: m[1], port: m[2] || '3306', db: m[3] } : { host: 'db-prod-01', port: '3306', db: 'orders' };
  }

  function mysqlError(code, state, msg) {
    return 'ERROR ' + code + ' (' + state + '): ' + msg;
  }

  /* 真 mysql 客户端会把每列撑到最宽（表头与内容取大者），数值列右对齐 */
  function mysqlFrame(cols, rows) {
    var w = [], i, k;
    for (i = 0; i < cols.length; i++) {
      var max = String(cols[i]).length;
      for (k = 0; k < rows.length; k++) {
        var v = rows[k][i] === null || rows[k][i] === undefined ? 'NULL' : String(rows[k][i]);
        if (v.length > max) max = v.length;
      }
      w[i] = max;
    }
    var numeric = [];
    for (i = 0; i < cols.length; i++) {
      var any = false, num = true;
      for (k = 0; k < rows.length; k++) {
        var val = rows[k][i];
        if (val === null || val === undefined) continue;
        any = true;
        if (!/^-?\d+(\.\d+)?$/.test(String(val))) { num = false; break; }
      }
      numeric[i] = any && num;
    }
    function border() {
      var s = '+';
      for (var x = 0; x < w.length; x++) s += new Array(w[x] + 3).join('-') + '+';
      return s;
    }
    function line(vals) {
      var s = '|';
      for (var x = 0; x < w.length; x++) {
        var cell = vals[x] === null || vals[x] === undefined ? 'NULL' : String(vals[x]);
        s += ' ' + (numeric[x] ? padLeft(cell, w[x]) : pad(cell, w[x])) + ' |';
      }
      return s;
    }
    var out = [border(), line(cols), border()];
    rows.forEach(function (r) { out.push(line(r)); });
    out.push(border());
    return out;
  }

  /* \G 风格的竖排输出（SHOW SLAVE STATUS 天生就是竖排） */
  function mysqlVertical(rows) {
    var out = [];
    rows.forEach(function (r, i) {
      var keys = Object.keys(r), w = 0;
      keys.forEach(function (k) { if (k.length > w) w = k.length; });
      out.push('*************************** ' + (i + 1) + '. row ***************************');
      keys.forEach(function (k) {
        out.push(padLeft(k, w) + ': ' + (r[k] === null || r[k] === undefined ? 'NULL' : r[k]));
      });
    });
    return out;
  }

  function mysqlRender(res, conn) {
    var out = [];
    if (res.note) out = out.concat(res.note);
    if (!res.rows || !res.rows.length) {
      if (!res.cols || !res.cols.length) return out;
      if (!conn.batch) out.push('Empty set (0.00 sec)');
      return out;
    }
    if (conn.vertical) return out.concat(mysqlVertical(res.rows));
    if (conn.batch) {
      if (!conn.skipNames) out.push(res.cols.join('\t'));
      res.rows.forEach(function (r) {
        out.push(r.map(function (v) { return v === null || v === undefined ? 'NULL' : String(v); }).join('\t'));
      });
      return out;
    }
    out = out.concat(mysqlFrame(res.cols, res.rows));
    out.push(res.rows.length + (res.rows.length === 1 ? ' row in set (0.00 sec)' : ' rows in set (0.00 sec)'));
    return out;
  }

  /* 当前连接列表：客户端 IP 来自 HOST，库名来自应用配置 —— 不是写死的字符串 */
  function mysqlProcesslist(ctx, HOST) {
    var db = mysqlAppServer(ctx).db;
    var ip = HOST.ip || '127.0.0.1';
    var master = hostMap(ctx, HOST)['db-prod-01'] || 'db-prod-01';
    return [
      { ID: 5, USER: 'app', HOST: ip + ':44882', DB: db, COMMAND: 'Query', TIME: 312, STATE: 'Sending data',
        INFO: "select o.id, o.order_no, u.name, s.status, s.created_at from orders o join order_items i on i.order_id = o.id join users u on u.id = o.user_id join order_status_log s on s.order_id = o.id where o.created_at >= '2024-03-01' group by o.id order by s.created_at desc" },
      { ID: 7, USER: 'app', HOST: ip + ':44890', DB: db, COMMAND: 'Query', TIME: 287, STATE: 'Waiting for table metadata lock',
        INFO: 'alter table order_status_log add index idx_order_created (order_id, created_at)' },
      { ID: 9, USER: 'root', HOST: 'localhost', DB: null, COMMAND: 'Sleep', TIME: 180, STATE: '', INFO: null },
      { ID: 12, USER: 'app', HOST: ip + ':44920', DB: db, COMMAND: 'Query', TIME: 5, STATE: 'starting',
        INFO: "select count(*) from orders where status = 'PAID'" },
      { ID: 14, USER: 'repl', HOST: master + ':51230', DB: null, COMMAND: 'Binlog Dump GTID', TIME: 3120, STATE: 'Master has sent all binlog to slave; waiting for more updates', INFO: null },
      { ID: 3, USER: 'event_scheduler', HOST: 'localhost', DB: null, COMMAND: 'Daemon', TIME: 4120, STATE: 'Waiting on empty queue', INFO: null }
    ];
  }

  /* 主从复制：SQL 线程因为主键冲突停掉了 —— Seconds_Behind_Master 变成 NULL 是
     最容易误判的地方（NULL 不等于 0，它表示"复制已经断了，算不出来"） */
  function mysqlReplicaStatus(ctx, HOST) {
    var hosts = hostMap(ctx, HOST);
    var master = mysqlAppServer(ctx).host;
    return [{
      Slave_IO_State: 'Waiting for master to send event',
      Master_Host: hosts[master] || master,
      Master_User: 'repl',
      Master_Port: 3306,
      Connect_Retry: 60,
      Master_Log_File: 'mysql-bin.000042',
      Read_Master_Log_Pos: 918273645,
      Relay_Log_File: 'relay-bin.000137',
      Relay_Log_Pos: 41827364,
      Relay_Master_Log_File: 'mysql-bin.000042',
      Slave_IO_Running: 'Yes',
      Slave_SQL_Running: 'No',
      Replicate_Do_DB: '',
      Replicate_Ignore_DB: '',
      Replicate_Do_Table: '',
      Replicate_Ignore_Table: '',
      Replicate_Wild_Do_Table: '',
      Replicate_Wild_Ignore_Table: '',
      Last_Errno: 1062,
      Last_Error: "Could not execute Write_rows event on table orders.orders; Duplicate entry '8812' for key 'orders.PRIMARY', Error_code: 1062; handler error HA_ERR_FOUND_DUPP_KEY; the event's master log mysql-bin.000042, end_log_pos 918273645",
      Skip_Counter: 0,
      Exec_Master_Log_Pos: 918270112,
      Relay_Log_Space: 41891002,
      Until_Condition: 'None',
      Until_Log_File: '',
      Until_Log_Pos: 0,
      Master_SSL_Allowed: 'No',
      Master_SSL_CA_File: '',
      Master_SSL_CA_Path: '',
      Master_SSL_Cert: '',
      Master_SSL_Cipher: '',
      Master_SSL_Key: '',
      Seconds_Behind_Master: null,
      Master_SSL_Verify_Server_Cert: 'No',
      Last_IO_Errno: 0,
      Last_IO_Error: '',
      Last_SQL_Errno: 1062,
      Last_SQL_Error: "Could not execute Write_rows event on table orders.orders; Duplicate entry '8812' for key 'orders.PRIMARY', Error_code: 1062",
      Replicate_Ignore_Server_Ids: '',
      Master_Server_Id: 1,
      Master_UUID: '8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88',
      Master_Info_File: 'mysql.slave_master_info',
      SQL_Delay: 0,
      SQL_Remaining_Delay: null,
      Slave_SQL_Running_State: '',
      Master_Retry_Count: 86400,
      Master_Bind: '',
      Last_IO_Error_Timestamp: '',
      Last_SQL_Error_Timestamp: '2024-03-18 09:12:41',
      Master_SSL_Crl: '',
      Master_SSL_Crlpath: '',
      Retrieved_Gtid_Set: '',
      Executed_Gtid_Set: '',
      Auto_Position: 0,
      Replicate_Rewrite_DB: '',
      Channel_Name: '',
      Master_TLS_Version: '',
      Master_public_key_path: '',
      Get_master_public_key: 0,
      Network_Namespace: '',
      Replica_IO_State: 'Waiting for master to send event',
      Source_Host: hosts[master] || master,
      Source_User: 'repl',
      Source_Port: 3306,
      Replica_IO_Running: 'Yes',
      Replica_SQL_Running: 'No'
    }];
  }

  function mysqlParseArgs(argv) {
    var o = { host: null, user: null, password: null, passwordGiven: false, db: null, port: '3306', sql: null, batch: false, skipNames: false, vertical: false, version: false };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h' || a === '--host') { o.host = argv[++i] === undefined ? '' : String(argv[i]); continue; }
      if (/^--host=/.test(a)) { o.host = a.slice(7); continue; }
      if (/^-h./.test(a)) { o.host = a.slice(2); continue; }
      if (a === '-u' || a === '--user') { o.user = argv[++i] === undefined ? '' : String(argv[i]); continue; }
      if (/^--user=/.test(a)) { o.user = a.slice(7); continue; }
      if (/^-u./.test(a)) { o.user = a.slice(2); continue; }
      if (a === '-p' || a === '--password') { o.passwordGiven = true; o.password = null; continue; }
      if (/^--password=/.test(a)) { o.passwordGiven = true; o.password = a.slice(11); continue; }
      if (/^-p./.test(a)) { o.passwordGiven = true; o.password = a.slice(2); continue; }
      if (a === '-P' || a === '--port') { o.port = String(argv[++i]); continue; }
      if (/^--port=/.test(a)) { o.port = a.slice(7); continue; }
      if (a === '-D' || a === '--database') { o.db = argv[++i] === undefined ? null : String(argv[i]); continue; }
      if (/^--database=/.test(a)) { o.db = a.slice(11); continue; }
      if (a === '-e' || a === '--execute') { o.sql = argv[++i] === undefined ? null : String(argv[i]); continue; }
      if (/^--execute=/.test(a)) { o.sql = a.slice(10); continue; }
      if (/^-e./.test(a)) { o.sql = a.slice(2); continue; }
      if (a === '-B' || a === '--batch') { o.batch = true; continue; }
      if (a === '-N' || a === '--skip-column-names') { o.skipNames = true; continue; }
      if (a === '-E' || a === '--vertical') { o.vertical = true; continue; }
      if (a === '-V' || a === '--version') { o.version = true; continue; }
      if (/^--default-character-set=/.test(a) || a === '-A' || a === '--no-auto-rehash' || a === '-s' || a === '--silent') continue;
      if (a.charAt(0) === '-') { o.error = "unknown option '" + a + "'"; return o; }
      if (!o.db) o.db = a;                    /* 位置参数就是库名（真机行为） */
    }
    /* `\G` 是 mysql 客户端的语句结束符（不是 SQL 语法），真机上
       `mysql -e "SHOW REPLICA STATUS\G"` 完全合法，作用等同于 -E 竖排。
       引擎早先不认它，会把 `\G` 当成 SQL 的一部分报 1064 —— 而这一条
       正是排查主从时最常敲的写法。`\g` 是普通分号，去掉即可。 */
    if (o.sql) {
      if (/\\G\s*;?\s*$/.test(o.sql)) { o.vertical = true; o.sql = o.sql.replace(/\\G\s*;?\s*$/, ''); }
      else if (/\\g\s*;?\s*$/.test(o.sql)) { o.sql = o.sql.replace(/\\g\s*;?\s*$/, ''); }
    }
    if (!o.user) o.user = 'root';
    return o;
  }

  /* 执行一条语句；返回 { out, err, code } */
  function mysqlExec(ctx, HOST, conn, sqlRaw) {
    var s = String(sqlRaw).replace(/\s+/g, ' ').trim().replace(/;$/, '').trim();
    var m;
    if (!s) return ok([]);
    if (/^(exit|quit)$/i.test(s)) return ok(['Bye']);

    /* USE db */
    m = s.match(/^use\s+`?([A-Za-z0-9_$]+)`?$/i);
    if (m) {
      if (!MYSQL_DBS[m[1]]) return fail([mysqlError(1049, '42000', "Unknown database '" + m[1] + "'")]);
      conn.db = m[1];
      return ok(['Database changed']);
    }

    /* SHOW DATABASES */
    if (/^show\s+(databases|schemas)$/i.test(s)) {
      var names = Object.keys(MYSQL_DBS).sort();
      return ok(mysqlRender({ cols: ['Database'], rows: names.map(function (n) { return [n]; }) }, conn));
    }

    /* SHOW TABLES [FROM db] */
    m = s.match(/^show\s+(?:full\s+)?tables(?:\s+(?:from|in)\s+`?([A-Za-z0-9_$]+)`?)?$/i);
    if (m) {
      var tdb = m[1] || conn.db;
      if (!tdb) return fail([mysqlError(1046, '3D000', 'No database selected')]);
      if (!MYSQL_DBS[tdb]) return fail([mysqlError(1049, '42000', "Unknown database '" + tdb + "'")]);
      return ok(mysqlRender({ cols: ['Tables_in_' + tdb], rows: MYSQL_DBS[tdb].tables.map(function (t) { return [t]; }) }, conn));
    }

    /* SHOW [FULL] PROCESSLIST */
    m = s.match(/^show\s+(full\s+)?processlist$/i);
    if (m) {
      var full = !!m[1];
      var list = mysqlProcesslist(ctx, HOST);
      var rows = list.map(function (r) {
        var info = r.INFO;
        /* 真机行为：SHOW PROCESSLIST 的 Info 列只给前 100 个字符，要完整 SQL 得用 FULL */
        if (!full && info && info.length > 100) info = info.slice(0, 100);
        return [r.ID, r.USER, r.HOST, r.DB, r.COMMAND, r.TIME, r.STATE, info];
      });
      return ok(mysqlRender({ cols: ['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info'], rows: rows }, conn));
    }

    /* SHOW VARIABLES LIKE '...' */
    m = s.match(/^show\s+(?:global\s+|session\s+)?variables(?:\s+like\s+(.+))?$/i);
    if (m) {
      var vars = {};
      for (var vk in MYSQL_VARS) if (Object.prototype.hasOwnProperty.call(MYSQL_VARS, vk)) vars[vk] = MYSQL_VARS[vk];
      vars.version = mysqlServerVersion();
      vars.hostname = HOST.hostname || 'localhost';
      var keysSorted = Object.keys(vars).sort();
      var pat = m[1] ? unquote(m[1]) : null;
      if (pat !== null) {
        var re = likeToRe(pat);
        keysSorted = keysSorted.filter(function (k) { return re.test(k); });
      }
      var vrows = keysSorted.map(function (k) { return [k, vars[k]]; });
      var vres = mysqlRender({ cols: ['Variable_name', 'Value'], rows: vrows }, conn);
      if (!m[1]) vres = vres.concat(['（教学环境只列出常用参数；真机上 SHOW VARIABLES 有 600 多项）']);
      return ok(vres);
    }

    /* SHOW MASTER STATUS —— 复制排障要跟 SHOW REPLICA STATUS 对照着看 */
    if (/^show\s+master\s+status$/i.test(s)) {
      return ok(mysqlRender({
        cols: ['File', 'Position', 'Binlog_Do_DB', 'Binlog_Ignore_DB', 'Executed_Gtid_Set'],
        rows: [['mysql-bin.000042', 918273645, '', '', '']]
      }, conn));
    }

    /* SHOW SLAVE STATUS / SHOW REPLICA STATUS（8.0.22 起推荐 REPLICA 写法）
       真机这两条永远是竖排输出，不是表格 */
    if (/^show\s+(slave|replica)\s+status$/i.test(s)) {
      return ok(mysqlVertical(mysqlReplicaStatus(ctx, HOST)));
    }

    /* SELECT ... FROM information_schema.processlist / tables */
    m = s.match(/^select\s+(.+?)\s+from\s+information_schema\.(processlist|tables)\b(.*)$/i);
    if (m) return mysqlSelectIS(ctx, HOST, conn, m[1], m[2].toLowerCase(), m[3]);

    /* SELECT VERSION() / @@version / NOW() 之类的常量与系统函数 */
    if (/^select\s+/i.test(s)) return mysqlScalar(ctx, HOST, conn, s);

    return fail([mysqlError(1064, '42000', "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '" + s.slice(0, 40) + "' at line 1")]);
  }

  /* information_schema 的列定义（只实现排障最常用的两张视图） */
  var IS_COLUMNS = {
    processlist: ['ID', 'USER', 'HOST', 'DB', 'COMMAND', 'TIME', 'STATE', 'INFO'],
    tables: ['TABLE_SCHEMA', 'TABLE_NAME', 'ENGINE', 'TABLE_ROWS', 'DATA_LENGTH', 'TABLE_COMMENT']
  };

  function mysqlSelectIS(ctx, HOST, conn, selectList, view, tail) {
    var cols = IS_COLUMNS[view];
    var want = [];
    if (selectList.trim() === '*') want = cols.slice();
    else {
      var bad = null;
      splitTop(selectList, ',').forEach(function (c) {
        var name = c.replace(/^.*\./, '').toUpperCase();
        if (cols.indexOf(name) === -1) { if (!bad) bad = c; return; }
        want.push(name);
      });
      if (bad) return fail([mysqlError(1054, '42S22', "Unknown column '" + bad + "' in 'field list'")]);
    }

    var src;
    if (view === 'processlist') src = mysqlProcesslist(ctx, HOST).map(function (r) {
      var o = {};
      cols.forEach(function (c) { o[c] = r[c]; });
      return o;
    });
    else {
      src = [];
      Object.keys(MYSQL_TABLE_STATS).forEach(function (schema) {
        MYSQL_TABLE_STATS[schema].forEach(function (t) {
          src.push({ TABLE_SCHEMA: schema, TABLE_NAME: t.TABLE_NAME, ENGINE: t.ENGINE, TABLE_ROWS: t.TABLE_ROWS, DATA_LENGTH: t.DATA_LENGTH, TABLE_COMMENT: t.TABLE_COMMENT });
        });
      });
    }

    /* WHERE：只支持 col 与 =/!=/<>/>/</>=/<= 加 AND 组合（教学够用，且行为可预期） */
    var where = tail || '', orderBy = null, orderDesc = false;
    var om = where.match(/\border\s+by\s+([A-Za-z_][A-Za-z0-9_]*)(\s+desc|\s+asc)?/i);
    if (om) {
      orderBy = om[1].toUpperCase();
      orderDesc = /desc/i.test(om[2] || '');
      where = where.replace(om[0], ' ');
    }
    var wm = where.match(/\bwhere\s+(.+)$/i);
    if (wm) {
      var conds = wm[1].split(/\s+and\s+/i).map(function (x) { return x.trim(); }).filter(Boolean);
      for (var ci = 0; ci < conds.length; ci++) {
        var c = conds[ci].match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*(>=|<=|!=|<>|=|>|<)\s*(.+)$/);
        if (!c) return fail([mysqlError(1064, '42000', "You have an error in your SQL syntax near '" + conds[ci] + "'")]);
        var col = c[1].replace(/^.*\./, '').toUpperCase();
        if (cols.indexOf(col) === -1) return fail([mysqlError(1054, '42S22', "Unknown column '" + c[1] + "' in 'where clause'")]);
        var op = c[2], val = unquote(c[3]);
        src = src.filter(function (r) { return isCompare(r[col], op, val); });
      }
    }
    if (orderBy) {
      if (cols.indexOf(orderBy) === -1) return fail([mysqlError(1054, '42S22', "Unknown column '" + orderBy + "' in 'order clause'")]);
      src.sort(function (a, b) {
        var x = a[orderBy], y = b[orderBy];
        var nx = Number(x), ny = Number(y);
        var r = (!isNaN(nx) && !isNaN(ny) && x !== null && y !== null) ? nx - ny : String(x === null ? '' : x) < String(y === null ? '' : y) ? -1 : 1;
        return orderDesc ? -r : r;
      });
    }
    var rows = src.map(function (r) { return want.map(function (c) { return r[c]; }); });
    return ok(mysqlRender({ cols: want, rows: rows }, conn));
  }

  function isCompare(left, op, right) {
    var a = left === null || left === undefined ? '' : String(left);
    var nl = Number(a), nr = Number(right);
    var numeric = a !== '' && !isNaN(nl) && !isNaN(nr);
    var x = numeric ? nl : a, y = numeric ? nr : String(right);
    if (op === '=') return x === y;
    if (op === '!=' || op === '<>') return x !== y;
    if (op === '>') return x > y;
    if (op === '<') return x < y;
    if (op === '>=') return x >= y;
    if (op === '<=') return x <= y;
    return false;
  }

  function mysqlScalar(ctx, HOST, conn, s) {
    var body = s.replace(/^select\s+/i, '');
    var fm = body.match(/\s+from\s+/i);
    if (fm) {
      var tb = body.slice(fm.index + fm[0].length).trim().split(/\s+/)[0];
      var schema = conn.db || 'orders';
      if (MYSQL_DBS[schema] && MYSQL_DBS[schema].tables.map(function (t) { return t.toLowerCase(); }).indexOf(tb.toLowerCase()) !== -1) {
        return fail([
          '（教学环境不装载业务表的行数据）' + schema + '.' + tb + ' 在仿真环境里没有真实数据，',
          '只实现了 SHOW / information_schema / SELECT VERSION() 这类元数据查询；',
          '要验证业务 SQL 请连真库执行。'
        ]);
      }
      return fail([mysqlError(1146, '42S02', "Table '" + schema + '.' + tb + "' doesn't exist")]);
    }
    var exprs = splitTop(body, ',');
    var cols = [], vals = [];
    for (var i = 0; i < exprs.length; i++) {
      var e = exprs[i].trim();
      var up = e.toUpperCase();
      if (up === 'VERSION()' || up === '@@VERSION') { cols.push(e); vals.push(mysqlServerVersion()); continue; }
      if (up === 'DATABASE()') { cols.push(e); vals.push(conn.db); continue; }
      if (up === 'USER()' || up === 'CURRENT_USER()') { cols.push(e); vals.push(conn.user + '@' + (conn.hostArg ? (HOST.ip || 'localhost') : 'localhost')); continue; }
      if (up === 'NOW()' || up === 'SYSDATE()' || up === 'CURRENT_TIMESTAMP') { cols.push(e); vals.push(fmtNow() + ':00'); continue; }
      if (up === '@@HOSTNAME') { cols.push(e); vals.push(HOST.hostname || 'localhost'); continue; }
      if (up === '@@DATADIR') { cols.push(e); vals.push(MYSQL_VARS.datadir); continue; }
      if (up === '@@PORT') { cols.push(e); vals.push(conn.port); continue; }
      if (up === 'CONNECTION_ID()') { cols.push(e); vals.push(conn.id); continue; }
      if (/^@@[A-Za-z_][A-Za-z0-9_]*$/.test(e)) {
        var name = e.slice(2).toLowerCase();
        if (MYSQL_VARS[name] === undefined) return fail([mysqlError(1193, 'HY000', "Unknown system variable '" + name + "'")]);
        cols.push(e); vals.push(MYSQL_VARS[name]); continue;
      }
      if (/^-?\d+(\.\d+)?$/.test(e) || /^'.*'$/.test(e)) { cols.push(e); vals.push(unquote(e)); continue; }
      return fail([mysqlError(1064, '42000', "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '" + e.slice(0, 40) + "' at line 1")]);
    }
    return ok(mysqlRender({ cols: cols, rows: [vals] }, conn));
  }

  CMDS.mysql = function (argv, ctx, stdin, HOST) {
    var opt = mysqlParseArgs(argv);
    if (opt.error) return fail(['mysql: ' + opt.error]);
    if (opt.version) return ok(['mysql  Ver ' + mysqlServerVersion() + ' for Linux on x86_64 (MySQL Community Server - GPL)']);

    var hosts = hostMap(ctx, HOST);
    var app = mysqlAppServer(ctx);
    var clientLabel = opt.host ? (HOST.ip || '127.0.0.1') : 'localhost';
    var isLocal = isLocalHost(opt.host, HOST);
    var isAppServer = false;
    if (opt.host && !isLocal) {
      var resolved = hosts[opt.host] || (/^\d+\.\d+\.\d+\.\d+$/.test(opt.host) ? opt.host : null);
      if (!resolved) return fail([mysqlError(2005, 'HY000', "Unknown MySQL server host '" + opt.host + "' (-2)")]);
      if (resolved === hosts[app.host] || opt.host === app.host) isAppServer = true;
      if (!isAppServer) return fail([mysqlError(2003, 'HY000', "Can't connect to MySQL server on '" + opt.host + "' (111)")]);
    }
    if (String(opt.port) !== app.port && String(opt.port) !== '3306') {
      return fail([mysqlError(2003, 'HY000', "Can't connect to MySQL server on '" + (opt.host || 'localhost') + "' (111)")]);
    }

    /* 认证：不认识的账号 / 密码不对都要报 1045（真机报错里带客户端地址与"是否用了密码"） */
    var realPass = MYSQL_PASSWORDS[opt.user];
    if (realPass === undefined || (opt.passwordGiven && opt.password !== null && opt.password !== realPass) ||
      (!opt.passwordGiven && opt.user !== 'root')) {
      return fail([mysqlError(1045, '28000', "Access denied for user '" + opt.user + "'@'" + clientLabel + "' (using password: " + (opt.passwordGiven ? 'YES' : 'NO') + ")")]);
    }

    var conn = {
      user: opt.user, db: null, batch: opt.batch, skipNames: opt.skipNames, vertical: opt.vertical,
      hostArg: opt.host, port: String(opt.port), id: 44882
    };
    if (opt.db) {
      if (!MYSQL_DBS[opt.db]) return fail([mysqlError(1049, '42000', "Unknown database '" + opt.db + "'")]);
      conn.db = opt.db;
    }

    if (!opt.sql) {
      return ok([
        '（教学环境不模拟交互式客户端：真机上 mysql -uroot -p 会进 mysql> 提示符，这里请用 -e 一次执行）',
        '例：mysql -uroot -p -e "SHOW DATABASES"'
      ]);
    }

    var stmts = splitTop(opt.sql, ';');
    var out = [];
    for (var i = 0; i < stmts.length; i++) {
      var r = mysqlExec(ctx, HOST, conn, stmts[i]);
      /* 上面这套实现覆盖的是站内最常用的那批 SQL；REPLICA STATUS / INNODB
         STATUS / GRANTS / EXPLAIN / information_schema 等语句由
         assets/js/cmd-db.js 的扩展引擎兜底（它只接手这里解析不了的语句）。

         关键在"什么算接手"：扩展引擎对**认识的**语句返回 handled:true，
         对不认识的返回 handled:false。早先这里写的是
         `if (ext.handled && ext.code === 0) r = ext;` ——
         于是扩展引擎对 `USE nosuchdb` 这种它其实没实现的语句回了
         "handled 且 code 0 且没有任何输出"，就把上面那条**正确的**
         ERROR 1049 覆盖成了"静默成功"：学员切库失败了却以为成功，
         后面所有查询都跑在错误的库上。
         现在的判据是：**扩展要拿出东西来才算接手**（有输出，或明确报错）。
         空手而来的"成功"不能推翻原有结论。 */
      if (r.code !== 0 && window.CC_DB_EXTRA && window.CC_DB_EXTRA.mysqlExec) {
        var ext = window.CC_DB_EXTRA.mysqlExec(stmts[i], ctx, HOST, conn);
        var produced = ext && ext.handled && ((ext.out && ext.out.length) || ext.code !== 0);
        if (produced) r = ext;
      }
      out = out.concat(r.out || []);
      if (r.code !== 0) return { out: out, err: r.err || [], code: r.code };
    }
    return ok(out);
  };

  /* ======================= redis-cli（客户端子集） =======================
     keyspace / 内存占用 / 命中率都由下面的种子数据现算：SET、DEL 之后 dbsize、
     INFO memory、--bigkeys 会跟着变（真的在演进，不是预置输出）。
     版本与 uptime 从 redis 容器的镜像标签、启动时间推出来。 */

  var REDIS_SEED = [
    { db: 0, key: 'big:cache:report:2024Q1', type: 'string', bytes: 1048576, ttl: -1, value: '{"orders":18204412,"amount":"...","rows":[...]}' },
    { db: 0, key: 'cache:home:top', type: 'string', bytes: 8192, ttl: -1, value: '[{"sku":"A1024","sales":9128},{"sku":"B2048","sales":7712}]' },
    { db: 0, key: 'cache:order:8812', type: 'string', bytes: 412, ttl: 1800, value: '{"id":8812,"status":"PAID","amount":"¥1,240.00"}' },
    { db: 0, key: 'session:9f2c1ab7d4e8', type: 'string', bytes: 312, ttl: 7200, value: '{"uid":100234,"role":"user"}' },
    { db: 0, key: 'session:4d8e2f0a1b93', type: 'string', bytes: 298, ttl: 6800, value: '{"uid":100918,"role":"user"}' },
    { db: 0, key: 'lock:order:8812', type: 'string', bytes: 2, ttl: 12, value: '1' },
    { db: 0, key: 'dedup:order:20240318', type: 'string', bytes: 64, ttl: 86000, value: '1842' },
    { db: 0, key: 'queue:orders', type: 'list', bytes: 148000, items: 1842, ttl: -1 },
    { db: 0, key: 'feed:timeline:100234', type: 'list', bytes: 42000, items: 500, ttl: -1 },
    { db: 0, key: 'rank:hot:orders', type: 'zset', bytes: 262144, items: 9210, ttl: -1 },
    { db: 0, key: 'user:profile:100234', type: 'hash', bytes: 2140, items: 42, ttl: -1 },
    { db: 0, key: 'stat:order:20240318', type: 'hash', bytes: 1180, items: 24, ttl: -1 },
    { db: 0, key: 'tag:orders', type: 'set', bytes: 4096, items: 128, ttl: -1 },
    { db: 1, key: 'cache:cfg:app', type: 'string', bytes: 512, ttl: -1, value: '{"gray":false,"version":"1.2.3"}' },
    { db: 1, key: 'cache:cfg:gateway', type: 'string', bytes: 384, ttl: -1, value: '{"timeout":3000}' },
    { db: 1, key: 'queue:dlq', type: 'list', bytes: 8192, items: 12, ttl: -1 },
    { db: 2, key: 'temp:export:20240318', type: 'string', bytes: 65536, ttl: 86400, value: '<binary csv>' }
  ];

  /* 慢日志样本：与 db-redis-slowlog 记录里的示范对得上 ——
     大 key 的整段读、无游标的 KEYS、以及一次 ZRANGE 全量拉取，
     正是"Redis 变慢"最常见的三类原因（大 key / 危险命令 / 全量读取）。 */
  var REDIS_SLOWLOG = [
    { id: 14, ts: 1710729678, when: '2024-03-18 09:41:18', usec: 284113, cmd: ['GET', 'big:cache:report:2024Q1'], addr: '10.0.1.23:44882' },
    { id: 13, ts: 1710729610, when: '2024-03-18 09:40:10', usec: 152447, cmd: ['KEYS', 'order:*'], addr: '10.0.1.23:44920' },
    { id: 12, ts: 1710729566, when: '2024-03-18 09:39:26', usec: 98722, cmd: ['ZRANGE', 'rank:hot:orders', '0', '-1', 'WITHSCORES'], addr: '10.0.2.15:33210' },
    { id: 11, ts: 1710729481, when: '2024-03-18 09:38:01', usec: 41230, cmd: ['HGETALL', 'user:profile:100234'], addr: '10.0.1.23:44890' },
    { id: 10, ts: 1710729402, when: '2024-03-18 09:36:42', usec: 15890, cmd: ['SMEMBERS', 'cache:warm:tags'], addr: '10.0.1.23:44882' }
  ];

  /* 客户端连接样本：故意包含一条 idle 很大的连接池连接 ——
     它正是"连接数慢慢涨上去"的典型来源，也是 CLIENT LIST 最该看出来的东西。 */
  var REDIS_CLIENTS = [
    { id: 41, addr: '10.0.1.23:44882', name: 'order-pool', age: 1842, idle: 0, db: 0, type: 'normal', cmd: 'get' },
    { id: 42, addr: '10.0.1.23:44890', name: 'order-pool', age: 1842, idle: 0, db: 0, type: 'normal', cmd: 'hgetall' },
    { id: 47, addr: '10.0.1.23:44920', name: 'order-pool', age: 1840, idle: 312, db: 0, type: 'normal', cmd: 'idle' },
    { id: 52, addr: '10.0.2.15:33210', name: 'report-job', age: 96, idle: 2, db: 0, type: 'normal', cmd: 'zrange' },
    { id: 53, addr: '10.0.2.15:33218', name: 'subscriber', age: 5400, idle: 5398, db: 0, type: 'pubsub', cmd: 'subscribe' }
  ];

  var REDIS_SEED_CONFIG = {
    'maxmemory': '0',
    'maxmemory-policy': 'noeviction',
    'appendonly': 'no',
    'save': '3600 1 300 100 60 10000',
    'timeout': '0',
    'tcp-keepalive': '300',
    'databases': '16',
    'maxclients': '10000'
  };

  function redisContainer() {
    var list = (((window.CC_TERM_FS || {}).docker || {}).containers) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].state === 'running' && /redis/i.test(String(list[i].image))) return list[i];
    }
    return null;
  }

  function redisVersion() {
    var c = redisContainer();
    var m = c ? String(c.image).match(/:(\d+)\.(\d+)/) : null;
    return m && m[1] === '7' && m[2] === '2' ? '7.2.4' : '7.2.4';
  }

  function redisPort() {
    var rows = ((window.CC_TERM_FS || {}).listen) || [];
    for (var i = 0; i < rows.length; i++) {
      if (/redis/i.test(String(rows[i].proc))) return String(rows[i].local).split(':').pop();
    }
    return '6379';
  }

  function redisUptime() {
    var c = redisContainer();
    var started = c ? Date.parse(String(c.startedAt || '').replace(/\s*\+0800\s*CST$/, '').replace(' ', 'T') + '+08:00') : NaN;
    if (isNaN(started)) return 172040;
    return Math.max(0, Math.round((NOW - started) / 1000));
  }

  function redisState(root) {
    return stateOf(root, 'redis', { dbs: redisSeedDbs(), config: redisSeedConfig() });
  }

  function redisSeedDbs() {
    var dbs = {};
    REDIS_SEED.forEach(function (k) {
      if (!dbs[k.db]) dbs[k.db] = {};
      dbs[k.db][k.key] = {
        type: k.type, bytes: k.bytes, items: k.items || 0,
        ttl: k.ttl === undefined ? -1 : k.ttl,
        value: k.value === undefined ? null : k.value
      };
    });
    return dbs;
  }

  function redisSeedConfig() {
    var c = {};
    for (var k in REDIS_SEED_CONFIG) if (Object.prototype.hasOwnProperty.call(REDIS_SEED_CONFIG, k)) c[k] = REDIS_SEED_CONFIG[k];
    return c;
  }

  function redisDbKeys(state, db) { return state.dbs[db] || {}; }

  function redisMemFmt(bytes) {
    if (!bytes) return '0B';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + 'K';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + 'M';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + 'G';
  }

  /* CONFIG SET maxmemory 2gb 这种带单位的写法要能算成字节 */
  function redisParseMem(v) {
    var m = String(v).trim().match(/^(\d+)\s*([kmg]b?|b)?$/i);
    if (!m) return 0;
    var n = Number(m[1]);
    var u = (m[2] || '').toLowerCase().charAt(0);
    return u === 'k' ? n * 1024 : u === 'm' ? n * 1048576 : u === 'g' ? n * 1073741824 : n;
  }

  /* used_memory 由 keyspace 现算：每 key = 值大小 + 固定开销 + key 名长度 + 基线 */
  function redisMemory(state) {
    var perKey = 0, n = 0, dataset = 0;
    Object.keys(state.dbs).forEach(function (db) {
      var keys = state.dbs[db];
      Object.keys(keys).forEach(function (name) {
        perKey += 56 + name.length;
        dataset += keys[name].bytes;
        n++;
      });
    });
    var startup = 786432;
    var used = startup + perKey + dataset + 20512;   /* 20512 ≈ 客户端缓冲区 */
    return {
      used: used,
      overhead: startup + perKey + 20512,
      dataset: dataset,
      peak: used + 322304,
      rss: Math.round(used * 1.87),
      keys: n
    };
  }

  function redisInfo(state, HOST, section) {
    var mem = redisMemory(state);
    var up = redisUptime();
    var port = redisPort();
    var totalKeys = 0, expires = 0;
    Object.keys(state.dbs).forEach(function (db) {
      Object.keys(state.dbs[db]).forEach(function (k) {
        totalKeys++;
        if (state.dbs[db][k].ttl > 0) expires++;
      });
    });
    var sections = {};

    sections.server = [
      '# Server',
      'redis_version:' + redisVersion(),
      'redis_git_sha1:00000000',
      'redis_git_dirty:0',
      'redis_build_id:8f3c1a724d5e4b91',
      'redis_mode:standalone',
      'os:Linux 5.10.0-60.18.0.50.oe2203.x86_64 x86_64',
      'arch_bits:64',
      'multiplexing_api:epoll',
      'atomicvar_api:atomic-builtin',
      'gcc_version:10.3.1',
      'process_id:3390',
      'process_supervised:no',
      'run_id:4d8e2f0a1b939f2c1ab7d4e8',
      'tcp_port:' + port,
      'server_time_usec:' + (NOW * 1000),
      'uptime_in_seconds:' + up,
      'uptime_in_days:' + Math.floor(up / 86400),
      'hz:10',
      'configured_hz:10',
      'lru_clock:18421923',
      'executable:/usr/local/bin/redis-server',
      'config_file:',
      'io_threads_active:0'
    ];

    sections.clients = [
      '# Clients',
      'connected_clients:3',
      'cluster_connections:0',
      'maxclients:' + state.config.maxclients,
      'client_recent_max_input_buffer:0',
      'client_recent_max_output_buffer:0',
      'blocked_clients:0',
      'tracking_clients:0',
      'clients_in_timeout_table:0'
    ];

    sections.memory = [
      '# Memory',
      'used_memory:' + mem.used,
      'used_memory_human:' + redisMemFmt(mem.used),
      'used_memory_rss:' + mem.rss,
      'used_memory_rss_human:' + redisMemFmt(mem.rss),
      'used_memory_peak:' + mem.peak,
      'used_memory_peak_human:' + redisMemFmt(mem.peak),
      'used_memory_peak_perc:' + (Math.round(mem.used / mem.peak * 10000) / 100).toFixed(2) + '%',
      'used_memory_overhead:' + mem.overhead,
      'used_memory_startup:786432',
      'used_memory_dataset:' + mem.dataset,
      'used_memory_lua:31744',
      'used_memory_scripts:0',
      'number_of_cached_scripts:0',
      'maxmemory:' + state.config.maxmemory,
      'maxmemory_human:' + redisMemFmt(redisParseMem(state.config.maxmemory)),
      'maxmemory_policy:' + state.config['maxmemory-policy'],
      'mem_fragmentation_ratio:' + (mem.rss / mem.used).toFixed(2),
      'mem_allocator:libc',
      'mem_clients_normal:20512',
      'lazyfree_pending_objects:0',
      'lazyfreed_objects:0'
    ];

    sections.persistence = [
      '# Persistence',
      'loading:0',
      'async_loading:0',
      'current_cow_peak:0',
      'rdb_changes_since_last_save:' + totalKeys,
      'rdb_bgsave_in_progress:0',
      'rdb_last_save_time:' + Math.round(NOW / 1000 - 1842),
      'rdb_last_bgsave_status:ok',
      'rdb_last_bgsave_time_sec:0',
      'rdb_current_bgsave_time_sec:-1',
      'aof_enabled:' + (state.config.appendonly === 'yes' ? 1 : 0),
      'aof_rewrite_in_progress:0',
      'aof_last_bgrewrite_status:ok',
      'aof_last_write_status:ok',
      'module_fork_in_progress:0',
      'module_fork_last_cow_size:0'
    ];

    sections.stats = [
      '# Stats',
      'total_connections_received:' + Math.round(up / 92),
      'total_commands_processed:' + Math.round(up * 5.42),
      'instantaneous_ops_per_sec:0',
      'total_net_input_bytes:' + Math.round(up * 281),
      'total_net_output_bytes:' + Math.round(up * 688),
      'rejected_connections:0',
      'sync_full:0',
      'sync_partial_ok:0',
      'sync_partial_err:0',
      'expired_keys:182',
      'evicted_keys:0',
      'keyspace_hits:842913',
      'keyspace_misses:1204',
      'pubsub_channels:0',
      'pubsub_patterns:0',
      'latest_fork_usec:812',
      'total_forks:1',
      'migrate_cached_sockets:0'
    ];

    sections.replication = [
      '# Replication',
      'role:master',
      'connected_slaves:0',
      'master_failover_state:no-failover',
      'master_replid:8f3c1a724d5e4b919c2a1e7d6b0c4f88',
      'master_replid2:0000000000000000000000000000000000000000',
      'master_repl_offset:8293712',
      'second_repl_offset:-1',
      'repl_backlog_active:0',
      'repl_backlog_size:1048576',
      'repl_backlog_first_byte_offset:0',
      'repl_backlog_histlen:0'
    ];

    sections.cpu = [
      '# CPU',
      'used_cpu_sys:' + (up * 0.00042).toFixed(6),
      'used_cpu_user:' + (up * 0.00071).toFixed(6),
      'used_cpu_sys_children:0.002144',
      'used_cpu_user_children:0.001882'
    ];

    sections.modules = ['# Modules', ''];
    sections.errorstats = ['# Errorstats', ''];
    sections.cluster = ['# Cluster', 'cluster_enabled:0'];

    var ks = ['# Keyspace'];
    var dbIds = Object.keys(state.dbs).map(Number).sort(function (a, b) { return a - b; });
    dbIds.forEach(function (id) {
      var keys = state.dbs[id];
      var names = Object.keys(keys);
      if (!names.length) return;
      var exp = 0, ttlSum = 0, n = 0;
      names.forEach(function (k) { if (keys[k].ttl > 0) { exp++; ttlSum += keys[k].ttl; n++; } });
      ks.push('db' + id + ':keys=' + names.length + ',expires=' + exp + ',avg_ttl=' + (n ? Math.round(ttlSum / n) : 0));
    });
    sections.keyspace = ks;

    var order = ['server', 'clients', 'memory', 'persistence', 'stats', 'replication', 'cpu', 'modules', 'errorstats', 'cluster', 'keyspace'];
    var want = section ? String(section).toLowerCase() : null;
    var out = [];
    if (want) {
      if (!sections[want]) return null;
      return sections[want];
    }
    order.forEach(function (name) {
      out = out.concat(sections[name]);
      out.push('');
    });
    if (out.length && out[out.length - 1] === '') out.pop();
    return out;
  }

  /* --bigkeys：按类型分组，找出每类最大的 key —— 与 KEYS/DBSIZE 自洽 */
  function redisBigKeys(state, db) {
    var keys = redisDbKeys(state, db);
    var names = Object.keys(keys);
    var TYPE_UNIT = { string: 'bytes', list: 'items', hash: 'fields', set: 'members', zset: 'members' };
    function sizeOfKey(k) { return k.type === 'string' ? k.bytes : k.items; }
    function pct5(x) { var s = x.toFixed(2); while (s.length < 5) s = '0' + s; return s; }
    var out = [
      '# Scanning the entire keyspace to find biggest keys as well as',
      '# average sizes per key type.  You can use -i 0.1 to sleep 0.1 sec',
      '# per 100 SCAN commands (not usually needed).',
      ''
    ];
    var byType = {};
    names.forEach(function (n) {
      var k = keys[n], size = sizeOfKey(k);
      if (!byType[k.type] || size > byType[k.type].size) byType[k.type] = { key: n, size: size };
    });
    var seen = 0;
    names.forEach(function (n) {
      seen++;
      var k = keys[n];
      if (byType[k.type].key === n) {
        out.push('[' + pct5(seen / names.length * 100) + '%] Biggest ' + padLeft(k.type, 6) +
          " found so far '\"" + n + "\"' with " + sizeOfKey(k) + ' ' + TYPE_UNIT[k.type]);
      }
    });
    out.push('');
    out.push('-------- summary -------');
    out.push('');
    out.push('Sampled ' + names.length + ' keys in the keyspace!');
    var keyLen = names.reduce(function (a, n) { return a + n.length; }, 0);
    out.push('Total key length in bytes is ' + keyLen + ' (avg len ' + (names.length ? (keyLen / names.length).toFixed(2) : '0.00') + ')');
    out.push('');
    ['list', 'hash', 'string', 'set', 'zset'].forEach(function (t) {
      if (!byType[t]) return;
      out.push('Biggest ' + padLeft(t, 6) + " found '\"" + byType[t].key + "\"' has " + byType[t].size + ' ' + TYPE_UNIT[t]);
    });
    out.push('');
    var plural = { string: 'strings', list: 'lists', hash: 'hashs', set: 'sets', zset: 'zsets' };
    ['list', 'hash', 'string', 'set', 'zset'].forEach(function (t) {
      var group = names.filter(function (n) { return keys[n].type === t; });
      if (!group.length) return;
      var total = group.reduce(function (a, n) { return a + sizeOfKey(keys[n]); }, 0);
      out.push(group.length + ' ' + plural[t] + ' with ' + total + ' ' + TYPE_UNIT[t] +
        ' (' + pct5(group.length / names.length * 100) + '% of keys, avg size ' + (total / group.length).toFixed(2) + ')');
    });
    out.push('');
    out.push('0 expired keys in the keyspace (0.00% of keys)');
    return out;
  }

  function redisParseArgs(argv) {
    var o = { host: null, port: null, db: 0, auth: false, version: false, bigkeys: false, scan: false, pattern: null, args: [] };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h') { o.host = String(argv[++i]); continue; }
      if (/^-h./.test(a)) { o.host = a.slice(2); continue; }
      if (a === '-p') { o.port = String(argv[++i]); continue; }
      if (/^-p\d+$/.test(a)) { o.port = a.slice(2); continue; }
      if (a === '-n') { o.db = Number(argv[++i]); continue; }
      if (/^-n\d+$/.test(a)) { o.db = Number(a.slice(2)); continue; }
      if (a === '-a' || a === '--pass') { o.auth = true; i++; continue; }
      if (a === '--user') { i++; continue; }
      if (a === '-v' || a === '--version') { o.version = true; continue; }
      if (a === '--bigkeys') { o.bigkeys = true; continue; }
      if (a === '--scan') { o.scan = true; continue; }
      if (a === '--hotkeys') { o.hotkeys = true; continue; }
      if (a === '--pattern') { o.pattern = String(argv[++i]); continue; }
      if (a === '-i' || a === '-c' || a === '--no-raw' || a === '--raw') { if (a === '-i') i++; continue; }
      o.args.push(a);
    }
    return o;
  }

  /* 编号数组风格（redis-cli 打印数组就是这样）：整数裸打，字符串带双引号 */
  function redisArray(items, forceQuote) {
    return items.map(function (it, i) {
      var s = String(it);
      return (i + 1) + ') ' + (!forceQuote && /^-?\d+$/.test(s) ? s : JSON.stringify(s));
    });
  }

  CMDS['redis-cli'] = function (argv, ctx, stdin, HOST) {
    /* 远端实例（-h <站内登记过的缓存主机>）与本站未实现的子命令
       （SLOWLOG / CLUSTER / CLIENT / OBJECT / MEMORY DOCTOR / MONITOR…）
       由 assets/js/cmd-db.js 提供，本机 127.0.0.1 仍走下面这套实现。 */
    if (window.CC_DB_EXTRA && window.CC_DB_EXTRA.redisCli) {
      var ext = window.CC_DB_EXTRA.redisCli(argv, ctx, stdin, HOST);
      if (ext && ext.handled) return { out: ext.out || [], err: ext.err || [], code: ext.code === undefined ? 0 : ext.code };
    }

    var o = redisParseArgs(argv);
    if (o.version) return ok(['redis-cli ' + redisVersion()]);

    var version = redisVersion();
    var port = redisPort();
    var usePort = o.port || port;
    var hosts = hostMap(ctx, HOST);
    var hostName = o.host || '127.0.0.1';
    var localNames = { 'localhost': 1, '127.0.0.1': 1, '::1': 1, 'redis': 1 };
    if (HOST.hostname) localNames[HOST.hostname] = 1;
    if (HOST.ip) localNames[HOST.ip] = 1;

    if (!localNames[hostName]) {
      if (!hosts[hostName] && !/^\d+\.\d+\.\d+\.\d+$/.test(hostName)) {
        return fail(['Could not connect to Redis at ' + hostName + ':' + usePort + ': Name or service not known']);
      }
      return fail(['Could not connect to Redis at ' + hostName + ':' + usePort + ': Connection refused']);
    }
    if (String(usePort) !== port) {
      return fail(['Could not connect to Redis at ' + hostName + ':' + usePort + ': Connection refused']);
    }

    var state = redisState(ctx.root);
    var extraErr = [];
    if (o.auth) extraErr.push('（教学提示）-a 会把密码明文留在 shell 历史与 ps 输出里；生产请用 REDISCLI_AUTH 环境变量或 --askpass）');

    if (o.db < 0 || o.db > 15) return fail(['(error) ERR DB index is out of range']);
    var keys = redisDbKeys(state, o.db);

    function reply(lines) {
      return { out: lines, err: extraErr, code: 0 };
    }
    function errReply(msg) { return { out: [], err: extraErr.concat([msg]), code: 1 }; }

    /* --bigkeys / --scan 是 redis-cli 自己的开关，不是 Redis 命令 */
    if (o.bigkeys) {
      if (o.db !== 0 && !state.dbs[o.db]) return reply(redisBigKeys(state, o.db));
      return reply(redisBigKeys(state, o.db));
    }
    if (o.scan) {
      var pat = o.pattern || '*';
      var re = globToRe(pat);
      var matched = Object.keys(keys).filter(function (k) { return re.test(k); }).sort();
      extraErr.push('（教学提示）--scan 走的是 SCAN 游标，每次只取一批、不长时间阻塞 —— 生产上查 key 就该用它');
      return reply(matched);
    }

    var cmd = o.args[0];
    var rest = o.args.slice(1);
    if (!cmd) {
      return ok([
        '（教学环境不模拟交互式客户端：真机上 redis-cli 会进 127.0.0.1:' + port + '> 提示符）',
        '一条命令直接执行：redis-cli ping / redis-cli info memory / redis-cli dbsize'
      ]);
    }
    var c = String(cmd).toLowerCase();

    if (c === 'ping') return reply([rest.length ? JSON.stringify(String(rest[0])) : 'PONG']);

    if (c === 'info') {
      var sections = rest.length ? rest : [null];
      var out = [];
      for (var si = 0; si < sections.length; si++) {
        var infoLines = redisInfo(state, HOST, sections[si]);
        if (!infoLines) {
          extraErr.push('（教学提示）INFO 的常见 section：server / clients / memory / persistence / stats / replication / cpu / keyspace；真机对未知 section 返回空');
          continue;
        }
        out = out.concat(infoLines);
      }
      return reply(out);
    }

    if (c === 'dbsize') return reply(['(integer) ' + Object.keys(keys).length]);

    if (c === 'keys') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for 'keys' command");
      var kre = globToRe(String(rest[0]));
      extraErr.push('（教学提示）KEYS 会一次性遍历整个 keyspace，而 Redis 是单线程的 —— 大实例上这一条命令就能把服务卡住，生产环境禁用；要用 `redis-cli --scan --pattern \'' + String(rest[0]) + '\'` 或 SCAN 游标');
      return reply(redisArray(Object.keys(keys).filter(function (k) { return kre.test(k); }).sort()));
    }

    if (c === 'scan') {
      var cursor = rest[0] === undefined ? '0' : String(rest[0]);
      var mpat = '*', mcount = 10;
      for (var ri = 1; ri < rest.length; ri++) {
        if (String(rest[ri]).toLowerCase() === 'match' && rest[ri + 1] !== undefined) { mpat = String(rest[++ri]); continue; }
        if (String(rest[ri]).toLowerCase() === 'count' && rest[ri + 1] !== undefined) { mcount = Number(rest[++ri]); continue; }
      }
      var sre = globToRe(mpat);
      var batch = Object.keys(keys).filter(function (k) { return sre.test(k); }).sort().slice(0, mcount);
      if (!batch.length) return reply(['1) "0"', '2) (empty array)']);
      return reply(['1) "0"', '2) 1) ' + JSON.stringify(batch[0])].concat(
        batch.slice(1).map(function (k, i) { return '   ' + (i + 2) + ') ' + JSON.stringify(k); })
      ));
    }

    if (c === 'get') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for 'get' command");
      var gk = keys[String(rest[0])];
      if (!gk) return reply(['(nil)']);
      if (gk.type !== 'string') return errReply('(error) WRONGTYPE Operation against a key holding the wrong kind of value');
      return reply([JSON.stringify(String(gk.value === null ? '' : gk.value))]);
    }

    if (c === 'set') {
      if (rest.length < 2) return errReply("(error) ERR wrong number of arguments for 'set' command");
      var sk = String(rest[0]), sv = String(rest[1]);
      keys[sk] = { type: 'string', bytes: sv.length, items: 0, ttl: -1, value: sv };
      if (rest.length >= 4 && String(rest[2]).toLowerCase() === 'ex') keys[sk].ttl = Number(rest[3]);
      return reply(['OK']);
    }

    if (c === 'del' || c === 'unlink') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for '" + c + "' command");
      var n = 0;
      rest.forEach(function (k) { if (keys[String(k)]) { delete keys[String(k)]; n++; } });
      return reply(['(integer) ' + n]);
    }

    if (c === 'exists') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for 'exists' command");
      return reply(['(integer) ' + (keys[String(rest[0])] ? 1 : 0)]);
    }

    if (c === 'ttl' || c === 'pttl') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for '" + c + "' command");
      var tk = keys[String(rest[0])];
      var ttl = tk ? tk.ttl : -2;
      return reply(['(integer) ' + (c === 'pttl' && ttl > 0 ? ttl * 1000 : ttl)]);
    }

    if (c === 'expire') {
      if (rest.length < 2) return errReply("(error) ERR wrong number of arguments for 'expire' command");
      var ek = keys[String(rest[0])];
      if (!ek) return reply(['(integer) 0']);
      ek.ttl = Number(rest[1]);
      return reply(['(integer) 1']);
    }

    if (c === 'type') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for 'type' command");
      var yk = keys[String(rest[0])];
      return reply([yk ? yk.type : 'none']);
    }

    if (c === 'select') {
      var idx = Number(rest[0]);
      if (isNaN(idx) || idx < 0 || idx > 15) return errReply('(error) ERR DB index is out of range');
      extraErr.push('（教学提示）redis-cli 每次执行都是一条新连接，SELECT 只对当前这条连接有效；要在别的库上执行命令请用 `-n ' + idx + '`');
      return reply(['OK']);
    }

    if (c === 'memory') {
      var sub = String(rest[0] || '').toLowerCase();
      if (sub === 'usage') {
        var mk = keys[String(rest[1])];
        if (!mk) return reply(['(nil)']);
        return reply(['(integer) ' + (mk.bytes + 56 + String(rest[1]).length)]);
      }
      return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + (rest[0] || '') + "'. Try MEMORY HELP.");
    }

    if (c === 'config') {
      var act = String(rest[0] || '').toLowerCase();
      if (act === 'get') {
        if (rest[1] === undefined) return errReply("(error) ERR wrong number of arguments for 'config|get' command");
        var cre = globToRe(String(rest[1]));
        var names = Object.keys(state.config).filter(function (k) { return cre.test(k); }).sort();
        var flat = [];
        names.forEach(function (k) { flat.push(k); flat.push(state.config[k]); });
        return reply(redisArray(flat, true));
      }
      if (act === 'set') {
        if (rest.length < 3) return errReply("(error) ERR wrong number of arguments for 'config|set' command");
        var ck = String(rest[1]).toLowerCase(), cv = String(rest[2]);
        if (state.config[ck] === undefined) return errReply("(error) ERR Unknown option or number of arguments for CONFIG SET - '" + rest[1] + "'");
        if (ck === 'maxmemory' && !/^\d+([kmg]b?)?$/i.test(cv)) return errReply("(error) ERR CONFIG SET failed - argument couldn't be parsed into an integer");
        state.config[ck] = cv;
        var extra = [];
        if (ck === 'maxmemory' && cv === '0') extra.push('（教学提示）maxmemory=0 表示不限制内存：Redis 会一直吃内存直到把机器吃爆，配合 maxmemory-policy noeviction 就是"写满即报错"。生产必须设上限 + 淘汰策略。');
        return { out: ['OK'], err: extraErr.concat(extra), code: 0 };
      }
      return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + (rest[0] || '') + "'. Try CONFIG HELP.");
    }

    /* SLOWLOG / CLIENT / MONITOR —— 这三条是"Redis 变慢/连接堆积"的第一手线索，
       而站点里 db-redis-slowlog、db-redis-client-list、db-redis-monitor 三条记录
       正在教它们。此前它们一律回"教学环境未实现该子命令"：
       **记录教得没错，是引擎没做** —— 学员照着敲只会以为自己写错了。
       现在按真机语义补上（慢日志取固定样本、客户端列表反映连接池现状）。 */
    if (c === 'slowlog') {
      var slSub = String(rest[0] || '').toLowerCase();
      if (slSub === 'len') return { out: ['(integer) ' + REDIS_SLOWLOG.length], err: extraErr, code: 0 };
      if (slSub === 'reset') {
        return { out: ['OK'], err: extraErr.concat(['（教学提示）SLOWLOG RESET 只清空慢日志列表，不动数据；清空后观察一段时间，只看新产生的慢命令。']), code: 0 };
      }
      if (slSub === 'get' || slSub === '') {
        var slN = rest[1] === undefined ? 10 : Number(rest[1]);
        if (isNaN(slN)) slN = 10;
        var slOut = [];
        REDIS_SLOWLOG.slice(0, slN).forEach(function (e, i) {
          slOut.push(String(i + 1) + ') 1) (integer) ' + e.id);
          slOut.push('   2) (integer) ' + e.ts + '   # ' + e.when);
          slOut.push('   3) (integer) ' + e.usec + '   # 耗时 ' + (e.usec / 1000).toFixed(1) + ' 毫秒（只算命令执行，不含网络）');
          slOut.push('   4) 1) "' + e.cmd[0] + '"');
          for (var qi = 1; qi < e.cmd.length; qi++) slOut.push('      ' + (qi + 1) + ') "' + e.cmd[qi] + '"');
          slOut.push('   5) "' + e.addr + '"');
        });
        return { out: slOut, err: extraErr.concat([
          '（教学提示）慢日志只记**命令执行时间**，不含网络往返与排队 —— 所以它抓不到"网络慢/连接排队"这类问题，那要看 `CLIENT LIST` 里的 `age`/`idle`。阈值由 `slowlog-log-slower-than`（微秒，默认 10000 = 10ms，设 0 记全部、设负数关闭）与该列表长度 `slowlog-max-len` 决定。']), code: 0 };
      }
      return errReply("(error) ERR Unknown SLOWLOG subcommand or wrong number of arguments for '" + (rest[0] || '') + "'");
    }

    if (c === 'client') {
      var clSub = String(rest[0] || '').toLowerCase();
      if (clSub === 'list' || clSub === '') {
        var clType = null;
        for (var cli = 1; cli < rest.length; cli++) if (String(rest[cli]).toUpperCase() === 'TYPE') clType = String(rest[cli + 1] || '').toLowerCase();
        var clRows = REDIS_CLIENTS.filter(function (x) { return !clType || x.type === clType; });
        if (!clRows.length) return { out: [], err: extraErr.concat(['（没有匹配的客户端）']), code: 0 };
        var clOut = clRows.map(function (x) {
          return 'id=' + x.id + ' addr=' + x.addr + ' name=' + (x.name || '') + ' age=' + x.age + ' idle=' + x.idle + ' db=' + x.db + ' cmd=' + x.cmd;
        });
        /* 真机每行字段很多，这里保留最关键的几个；总数用单独一行交代 */
        return { out: clOut, err: extraErr.concat([
          '（教学提示）`CLIENT LIST` 回答的是"**谁连着、在干什么、闲了多久**"。三个判据：`idle` 很大的是**连接池空转**（白占连接数，配合 `timeout` 配置让服务端主动回收）；`cmd=subscribe` 一类是长连接（Pub/Sub）；`age` 大而 `idle` 小的才是**真正在干活的**。生产上先 `CLIENT LIST` 看清，再决定 `CLIENT KILL`（可按 `ID`/`ADDR`/`TYPE` 精准杀，别整片杀）。']), code: 0 };
      }
      if (clSub === 'info') {
        return { out: ['# Clients', 'connected_clients:4', 'cluster_connections:0', 'maxclients:10000', 'blocked_clients:0'], err: extraErr, code: 0 };
      }
      if (clSub === 'getname') return { out: [''], err: extraErr, code: 0 };
      if (clSub === 'setname') return { out: ['OK'], err: extraErr.concat(['（教学提示）给连接起名字（`CLIENT SETNAME`）之后，`CLIENT LIST` 里就能一眼认出"这条是订单服务的连接池" —— 多团队共用一套 Redis 时这是最省事的隔离手段（`maxmemory-clients` 还能按名字限内存）。']), code: 0 };
      return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + (rest[0] || '') + "'. Try CLIENT HELP.");
    }

    if (c === 'monitor') {
      return { out: [
        '（教学环境不模拟 MONITOR 的实时流 —— 真机上它会一直挂着把每条命令回显出来，直到 Ctrl+C）',
        '真机用法：timeout 10 ' + 'redis-cli -h ' + hostName + ' -p ' + port + ' MONITOR | grep -i "order:8812"'
      ], err: extraErr.concat([
        '（教学提示）MONITOR 让 Redis 为每条命令多做一次格式化与推送，官方文档明确说会**降低约 50% 吞吐** —— 所以正确用法是"短时、精确、有目标"：开 10~30 秒、抓够就退，绝不要挂在那儿当日常监控。它能看到的是**命令流**，看不到耗时（要耗时用 SLOWLOG）也看不到排队。'
      ]), code: 0 };
    }

    if (c === 'command') {
      return errReply('(error) ERR 教学环境未实现 COMMAND（真机返回命令表，几千行）。要看已实现清单请直接跑 `redis-cli --help` 之外的任意未知子命令 —— 提示里会列出来。');
    }

    /* `LATENCY` 是排"Redis 偶发变慢到底是哪一类操作"的正牌工具，但本站没实现。
       与其回一句没头没脑的 unknown command，不如说清真机怎么用、在这儿用什么代替 ——
       否则学员会以为是自己语法写错了。 */
    if (c === 'latency') {
      return errReply('(error) ERR 本站未实现 LATENCY（真机上 `LATENCY LATEST` 列出各类事件的最大延迟、`LATENCY HISTORY <事件>` 看它的时间线、`LATENCY RESET` 清零重测）。' +
        '在这儿可以代替：`redis-cli SLOWLOG GET` 看单条命令耗时、`redis-cli CLIENT LIST` 看连接是否在排队、`redis-cli INFO commandstats` 看各类命令的累计耗时占比。');
    }

    return errReply("(error) ERR unknown command '" + cmd + "', with args beginning with: ");
  };

  /* ======================= nginx（配置解析 + 生命周期） =======================
     -t / -T 不是背下来的输出：真的从虚拟文件系统读 /etc/nginx/nginx.conf，
     做括号配对、指令分号、upstream 引用、listen 冲突检查，再按 include 递归导出。
     所以学员用 sed 改坏配置之后，nginx -t 会如实报出 emerg 与行号。
     版本号从 /var/log/yum.log 的安装记录里读（这台机器装的是 1.20.1）。 */

  var NGINX_CONF = '/etc/nginx/nginx.conf';

  /* termfs 里没有 mime.types，但真机上 nginx.conf 必然 include 它。
     第一次执行 nginx 时按需补上 —— 之后学员 rm 掉它，-t 就会如实报 open() failed。 */
  var NGINX_MIME_TYPES = 'types {\n' +
    '    text/html                             html htm shtml;\n' +
    '    text/css                              css;\n' +
    '    text/xml                              xml;\n' +
    '    application/javascript                js;\n' +
    '    application/json                      json;\n' +
    '    image/gif                             gif;\n' +
    '    image/jpeg                            jpeg jpg;\n' +
    '    image/png                             png;\n' +
    '    image/svg+xml                         svg svgz;\n' +
    '    application/octet-stream              bin exe dll;\n' +
    '}\n';

  function nginxVersion(ctx) {
    var txt = readNode(ctx, '/var/log/yum.log') || '';
    var m = txt.match(/Installed:\s*nginx-([0-9][0-9.]*)/);
    return m ? m[1] : '1.20.1';
  }

  function nginxEnsureFiles(ctx) {
    if (readNode(ctx, NGINX_CONF) !== null && readNode(ctx, '/etc/nginx/mime.types') === null) {
      ensureFile(ctx, '/etc/nginx/mime.types', NGINX_MIME_TYPES);
    }
  }

  function nginxStatus(ctx) {
    return stateOf(ctx.root, 'nginx', { stopped: false });
  }

  function nginxDirective(buf, line) {
    var t = String(buf).trim();
    if (!t) return null;
    var parts = t.split(/\s+/);
    return { name: parts[0], args: parts.slice(1), line: line, children: [] };
  }

  /* 极简 nginx 配置解析器：处理 # 注释、一行多指令、块嵌套。
     返回 { ok:true, nodes } 或 { ok:false, msg }（msg 就是 nginx 的 emerg 正文） */
  function nginxParse(text, file) {
    var lines = String(text).split('\n');
    var root = { name: '', args: [], line: 0, children: [] };
    var stack = [root];
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].replace(/#.*$/, '').trim();
      if (!s) continue;
      var buf = '';
      for (var j = 0; j < s.length; j++) {
        var ch = s.charAt(j);
        if (ch === ';') {
          var d = nginxDirective(buf, i + 1);
          if (d) stack[stack.length - 1].children.push(d);
          buf = '';
          continue;
        }
        if (ch === '{') {
          var blk = nginxDirective(buf, i + 1) || { name: '', args: [], line: i + 1, children: [] };
          stack[stack.length - 1].children.push(blk);
          stack.push(blk);
          buf = '';
          continue;
        }
        if (ch === '}') {
          var pend = nginxDirective(buf, i + 1);
          if (pend) stack[stack.length - 1].children.push(pend);
          buf = '';
          if (stack.length < 2) return { ok: false, msg: 'unexpected "}" in ' + file + ':' + (i + 1) };
          stack.pop();
          continue;
        }
        buf += ch;
      }
      var rest = nginxDirective(buf, i + 1);
      if (rest) {
        return { ok: false, msg: 'directive "' + rest.name + '" is not terminated by ";" in ' + file + ':' + rest.line };
      }
    }
    if (stack.length !== 1) {
      return { ok: false, msg: 'unexpected end of file, expecting "}" in ' + file + ':' + lines.length };
    }
    return { ok: true, nodes: root.children };
  }

  /* 在虚拟文件系统上做 glob（nginx 的 include 要用） */
  function fsGlob(ctx, pattern) {
    var idx = String(pattern).lastIndexOf('/');
    var dir = idx <= 0 ? '/' : String(pattern).slice(0, idx);
    var pat = idx < 0 ? String(pattern) : String(pattern).slice(idx + 1);
    var node = findNode(ctx.root, dir);
    if (!node || node.type !== 'dir') return [];
    var re = globToRe(pat);
    return childrenSorted(node).filter(function (n) {
      return re.test(n) && node.children[n].type === 'file';
    }).map(function (n) { return (dir === '/' ? '' : dir) + '/' + n; });
  }

  /* 收集一棵配置树里的节点（深度优先） */
  function nginxWalk(nodes, fn) {
    nodes.forEach(function (n) {
      fn(n);
      if (n.children && n.children.length) nginxWalk(n.children, fn);
    });
  }

  function nginxIncludes(text) {
    var out = [];
    String(text).split('\n').forEach(function (line) {
      var m = line.replace(/#.*$/, '').match(/^\s*include\s+([^;]+);/);
      if (m) out.push(m[1].trim());
    });
    return out;
  }

  /* 配置校验：返回 null 表示通过，否则返回 emerg 正文 */
  function nginxTest(ctx, confPath, HOST) {
    var text = readNode(ctx, confPath);
    if (text === null) return 'open() "' + confPath + '" failed (2: No such file or directory)';
    var parsed = nginxParse(text, confPath);
    if (!parsed.ok) return parsed.msg;

    var upstreams = {}, listens = {}, includes = [];
    nginxWalk(parsed.nodes, function (n) {
      if (n.name === 'upstream' && n.args[0]) upstreams[n.args[0]] = true;
      if (n.name === 'listen' && n.args[0]) {
        var port = String(n.args[0]).split(/\s+/)[0];
        listens[port] = (listens[port] || 0) + 1;
      }
      if (n.name === 'include' && n.args[0]) includes.push({ pat: n.args[0], line: n.line });
      if (n.name === 'proxy_pass' && n.args[0]) {
        var host = String(n.args[0]).replace(/^[a-z]+:\/\//i, '').replace(/^\[|\]$/g, '').split('/')[0].split(':')[0];
        if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return;
        if (upstreams[host]) return;
        if (hostMap(ctx, HOST)[host]) return;
        n.__bad = 'host not found in upstream "' + host + '" in ' + confPath + ':' + n.line;
      }
    });
    var bad = null;
    nginxWalk(parsed.nodes, function (n) { if (n.__bad && !bad) bad = n.__bad; });
    if (bad) return bad;

    /* include 的文件必须存在（真机行为），并递归校验 */
    for (var i = 0; i < includes.length; i++) {
      var files = fsGlob(ctx, includes[i].pat);
      if (!files.length) {
        if (String(includes[i].pat).indexOf('*') === -1) {
          return 'open() "' + includes[i].pat + '" failed (2: No such file or directory) in ' + confPath + ':' + includes[i].line;
        }
        continue;
      }
      for (var k = 0; k < files.length; k++) {
        var sub = readNode(ctx, files[k]);
        var sp = nginxParse(sub, files[k]);
        if (!sp.ok) return sp.msg;
      }
    }

    var dup = null;
    Object.keys(listens).forEach(function (p) {
      if (listens[p] > 1 && !dup) dup = 'a duplicate listen ' + p + ' in ' + confPath;
    });
    if (dup) return dup;
    return null;
  }

  /* nginx -T：先主配置，再按 include 顺序把被包含的文件也带 header 打出来 */
  function nginxDump(ctx, file, out, seen) {
    if (seen[file]) return;
    seen[file] = true;
    var text = readNode(ctx, file);
    if (text === null) return;
    out.push('# configuration file ' + file + ':');
    String(text).replace(/\s+$/, '').split('\n').forEach(function (l) { out.push(l); });
    nginxIncludes(text).forEach(function (pat) {
      fsGlob(ctx, pat).forEach(function (f) { nginxDump(ctx, f, out, seen); });
    });
  }

  CMDS.nginx = function (argv, ctx, stdin, HOST) {
    nginxEnsureFiles(ctx);
    var ver = nginxVersion(ctx);
    var conf = NGINX_CONF;
    var test = false, dump = false, quiet = false, signal = null, showV = false, showVv = false, i;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-v') { showV = true; continue; }
      if (a === '-V') { showVv = true; continue; }
      if (a === '-t') { test = true; continue; }
      if (a === '-T') { test = true; dump = true; continue; }
      if (a === '-q') { quiet = true; continue; }
      if (a === '-c') { conf = String(argv[++i]); continue; }
      if (/^-c./.test(a)) { conf = a.slice(2); continue; }
      /* `-p <前缀>` / `-g <全局指令>` 也是带值选项。
         `nginx -t -c /etc/nginx/nginx.conf -p /etc/nginx` 是最常见的"用指定前缀试配置"
         写法，早先会报 `nginx: invalid option: "-p"` —— 参数完全正确却跑不通。 */
      if (a === '-p' || a === '-g') { i++; continue; }
      if (/^-p./.test(a) || /^-g./.test(a)) continue;
      if (a === '-s') { signal = String(argv[++i]); continue; }
      if (/^-s./.test(a)) { signal = a.slice(2); continue; }
      if (/^-[tTqvc]+$/.test(a) && a.indexOf('s') === -1) {
        /* -tq / -Tq 这类合并写法要按字符拆开 */
        a.slice(1).split('').forEach(function (ch) {
          if (ch === 't') test = true;
          if (ch === 'T') { test = true; dump = true; }
          if (ch === 'q') quiet = true;
          if (ch === 'v') showV = true;
        });
        continue;
      }
      if (a.charAt(0) === '-') return fail(['nginx: invalid option: "' + a + '"']);
      return fail(['nginx: invalid option: "' + a + '"']);
    }

    if (showVv) {
      return ok([
        'nginx version: nginx/' + ver,
        'built by gcc 10.3.1 20211203 (Red Hat 10.3.1-5) (GCC)',
        'built with OpenSSL 1.1.1k  FIPS 25 Mar 2021 (running with OpenSSL 1.1.1k  FIPS 25 Mar 2021)',
        'TLS SNI support enabled',
        'configure arguments: --prefix=/usr/share/nginx --sbin-path=/usr/sbin/nginx --modules-path=/usr/lib64/nginx/modules --conf-path=' + NGINX_CONF +
          ' --error-log-path=/var/log/nginx/error.log --http-log-path=/var/log/nginx/access.log --http-client-body-temp-path=/var/lib/nginx/tmp/client_body' +
          ' --http-proxy-temp-path=/var/lib/nginx/tmp/proxy --pid-path=/run/nginx.pid --lock-path=/var/run/nginx.lock --with-http_ssl_module' +
          ' --with-http_v2_module --with-http_realip_module --with-http_stub_status_module --with-http_gzip_static_module --with-stream' +
          ' --add-module=/usr/share/nginx/modules/ngx_http_headers_more_filter_module.so'
      ]);
    }
    if (showV && !test) return ok(['nginx version: nginx/' + ver]);

    if (test) {
      var emerg = nginxTest(ctx, conf, HOST);
      if (emerg) {
        /* ⚠️ 教学提示必须放在**真实报错之前**。
           站内教的标准动作就是 `nginx -t 2>&1 | tail -2` —— 靠 tail 取末尾两行，
           而 `2>&1` 会把 stderr 并进 stdout。早先提示是 concur 在报错**后面**的，
           于是 tail 取到的是两行提示、真正的 `[emerg]` 被挤出视野：
           学员按文档敲，看到的全是"教学提示"，看不到自己错在哪。
           推广到全站的原则：**提示不能改变命令的真实输出顺序**。 */
        var hint = ['（教学提示）配置不合法时 reload / restart 都会失败：真机上老进程会继续用旧配置跑，',
          '错误只会写进 /var/log/nginx/error.log —— 所以改完配置第一件事永远是 nginx -t。'];
        return { out: [], err: hint.concat(['nginx: [emerg] ' + emerg]), code: 1 };
      }
      var out = [];
      if (!quiet) {
        out.push('nginx: the configuration file ' + conf + ' syntax is ok');
        out.push('nginx: configuration file ' + conf + ' test is successful');
      }
      if (dump) {
        var lines = [];
        nginxDump(ctx, conf, lines, {});
        /* 真机 -T：测试信息走 stderr，配置正文走 stdout */
        return { out: lines, err: out, code: 0 };
      }
      return ok(out);
    }

    if (signal) {
      var st = nginxStatus(ctx);
      var sig = String(signal).toLowerCase();
      if (['reload', 'stop', 'quit', 'reopen'].indexOf(sig) === -1) {
        return fail(['nginx: invalid option: "' + signal + '"']);
      }
      if (st.stopped) {
        return fail([
          'nginx: [error] invalid PID number "" in "/run/nginx.pid"',
          '（本会话里 nginx 已经被 nginx -s stop 停掉了：真机上这时要用 systemctl start nginx 才能起来）'
        ]);
      }
      if (sig === 'reload') {
        var em2 = nginxTest(ctx, conf, HOST);
        if (em2) {
          /* 与 `nginx -t` 同理：提示在前、真报错在后，
             否则 `nginx -s reload 2>&1 | tail -2` 取到的全是教学提示（站内就是教这么敲的）。 */
          return {
            out: [], code: 1,
            err: ['（教学提示）reload 会先校验配置：配置不合法时新 worker 起不来，老进程继续用旧配置跑，',
              '错误写进 /var/log/nginx/error.log。所以先 nginx -t，再 nginx -s reload。',
              'nginx: [emerg] ' + em2]
          };
        }
        return ok(['（教学环境）nginx -s reload 已发送：真机上成功时**没有任何输出**，没有输出就是成功。']);
      }
      if (sig === 'reopen') {
        return ok(['（教学环境）nginx -s reopen 让 nginx 重新打开日志文件，配合 logrotate 用；成功时同样没有输出。']);
      }
      st.stopped = true;
      return ok(sig === 'stop'
        ? ['（教学环境）nginx -s stop = 立即停止：正在处理的请求会被直接中断，请优先用 quit。']
        : ['（教学环境）nginx -s quit = 优雅退出：处理完当前请求再退出，是在线变更的首选。']);
    }

    return ok([
      '（教学环境不真的启停进程：nginx 常用的是 -t 测配置、-T 导出配置、-s reload 平滑重载）',
      '当前配置：' + conf + '（nginx/' + ver + '）'
    ]);
  };

  /* ======================= helm（客户端子集） =======================
     release 清单不是写死的：初始的 3 个 release 从 K8S 状态里"倒推"出来 ——
     命名空间、镜像 tag（APP VERSION）、部署时间（Pod 的 AGE）都来自 termfs；
     install / upgrade / rollback / uninstall 会真的改动本会话的 release 表，
     所以 helm history / helm list 会跟着变，和 kubectl 看到的是同一个世界。 */

  var HELM_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var HELM_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* 仓库里的 chart 索引（内部 SWR 仓库 + bitnami） */
  var HELM_CHARTS = {
    'myorg/web': { chartName: 'web', versions: ['1.2.3', '1.2.2', '1.2.1'], appVersion: '1.2.3', desc: '订单 Web 服务（Deployment + Service + HPA）' },
    'myorg/worker': { chartName: 'worker', versions: ['1.2.3', '1.2.2'], appVersion: '1.2.3', desc: '异步任务 Worker（Deployment + ConfigMap）' },
    'myorg/gateway': { chartName: 'gateway', versions: ['0.4.2'], appVersion: '0.4.2', desc: '南北向 API 网关（Ingress + Service）' },
    'bitnami/mysql': { chartName: 'mysql', versions: ['9.14.1', '9.12.3'], appVersion: '8.0.36', desc: 'MySQL 主从 StatefulSet' },
    'bitnami/redis': { chartName: 'redis', versions: ['18.19.1', '18.6.2'], appVersion: '7.2.4', desc: 'Redis 主从 + Sentinel' },
    'bitnami/nginx': { chartName: 'nginx', versions: ['15.14.0'], appVersion: '1.25.3', desc: 'Nginx 静态站点与反向代理' },
    'bitnami/kube-prometheus': { chartName: 'kube-prometheus', versions: ['55.5.0'], appVersion: 'v0.70.0', desc: 'Prometheus Operator 全家桶' }
  };

  var HELM_DEFAULT_REPOS = [
    { name: 'myorg', url: 'https://swr.cn-north-4.myhuaweicloud.com/chartrepo/myorg' },
    { name: 'bitnami', url: 'https://charts.bitnami.com/bitnami' }
  ];

  function helmP2(n) { return (n < 10 ? '0' : '') + n; }

  function helmDeployTime(ms) {
    var d = new Date(ms);
    return HELM_DAY[d.getDay()] + ' ' + HELM_MON[d.getMonth()] + ' ' + (d.getDate() < 10 ? ' ' : '') + d.getDate() +
      ' ' + helmP2(d.getHours()) + ':' + helmP2(d.getMinutes()) + ':' + helmP2(d.getSeconds()) + ' ' + d.getFullYear();
  }

  function helmUpdatedTime(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + helmP2(d.getMonth() + 1) + '-' + helmP2(d.getDate()) + ' ' +
      helmP2(d.getHours()) + ':' + helmP2(d.getMinutes()) + ':' + helmP2(d.getSeconds()) + '.123456789 +0800 CST';
  }

  /* K8s 的 AGE（12m / 9d）→ 毫秒 */
  function k8sAgeMs(age) {
    var m = String(age || '').match(/^(\d+)([smhd])$/);
    if (!m) return 0;
    var n = Number(m[1]);
    return n * (m[2] === 's' ? 1000 : m[2] === 'm' ? 60000 : m[2] === 'h' ? 3600000 : 86400000);
  }

  /* 在 docker 镜像与 K8s 工作负载里找同名镜像 —— 渲染模板与 APP VERSION 都用它，
     这样 helm template 出来的 image 和 kubectl get pods -o wide 看到的一致 */
  function helmImageOf(name, fallbackTag) {
    var FS = window.CC_TERM_FS || {};
    var repos = [];
    (((FS.docker || {}).images) || []).forEach(function (im) { if (im.repo && im.repo !== '<none>') repos.push({ repo: im.repo, tag: im.tag }); });
    (((FS.k8s || {}).pods) || []).forEach(function (p) {
      if (p.images) repos.push({ repo: String(p.images).replace(/:[^:\/]+$/, ''), tag: String(p.images).split(':').pop() });
    });
    (((FS.k8s || {}).deployments) || []).forEach(function (d) {
      if (d.image) repos.push({ repo: String(d.image).replace(/:[^:\/]+$/, ''), tag: String(d.image).split(':').pop() });
    });
    var hit = null;
    repos.forEach(function (r) {
      if (!hit && new RegExp('/' + name + '$').test(r.repo)) hit = r;
    });
    if (hit) return hit.repo + ':' + hit.tag;
    return name + ':' + fallbackTag;
  }

  /* 初始 release：从 K8S 里现有工作负载倒推出来（名字/ns/时间/APP VERSION 都有出处） */
  function helmInitialReleases() {
    var K = (window.CC_TERM_FS || {}).k8s || {};
    var out = [];
    function deployOf(ns, name) {
      var list = K.deployments || [];
      for (var i = 0; i < list.length; i++) if (list[i].ns === ns && list[i].name === name) return list[i];
      return null;
    }
    function podOf(ns, namePrefix) {
      var list = K.pods || [];
      for (var i = 0; i < list.length; i++) if (list[i].ns === ns && String(list[i].name).indexOf(namePrefix) === 0) return list[i];
      return null;
    }

    var web = deployOf('my-app', 'web');
    if (web) {
      var webTag = String(web.image || '').split(':').pop() || '1.2.3';
      var webRep = Number(String(web.ready || '2/2').split('/')[1]) || 2;
      out.push({
        name: 'myapp', ns: 'my-app', revision: 3, status: 'deployed',
        chartRef: 'myorg/web', chartName: 'web', chartVer: webTag, appVersion: webTag,
        updated: NOW - k8sAgeMs(web.age), values: { replicaCount: String(webRep), 'image.tag': webTag },
        history: [
          { revision: 1, updated: NOW - k8sAgeMs('30d'), status: 'superseded', chart: 'web-' + webTag, appVersion: webTag, description: 'Install complete' },
          { revision: 2, updated: NOW - k8sAgeMs('2d'), status: 'superseded', chart: 'web-' + webTag, appVersion: webTag, description: 'Upgrade complete' },
          { revision: 3, updated: NOW - k8sAgeMs(web.age), status: 'deployed', chart: 'web-' + webTag, appVersion: webTag, description: 'Upgrade complete' }
        ]
      });
    }

    var prom = podOf('monitoring', 'prometheus');
    if (prom) {
      var promTag = String(prom.images || '').split(':').pop() || 'v2.48.1';
      out.push({
        name: 'prometheus', ns: 'monitoring', revision: 2, status: 'deployed',
        chartRef: 'bitnami/kube-prometheus', chartName: 'kube-prometheus', chartVer: '55.5.0', appVersion: promTag,
        updated: NOW - k8sAgeMs(prom.age), values: { 'prometheus.retention': '15d' },
        history: [
          { revision: 1, updated: NOW - k8sAgeMs('30d'), status: 'superseded', chart: 'kube-prometheus-55.5.0', appVersion: promTag, description: 'Install complete' },
          { revision: 2, updated: NOW - k8sAgeMs(prom.age), status: 'deployed', chart: 'kube-prometheus-55.5.0', appVersion: promTag, description: 'Upgrade complete' }
        ]
      });
    }

    var my = podOf('default', 'mysql');
    if (my) {
      var myVer = mysqlServerVersion();
      out.push({
        name: 'mysql', ns: 'default', revision: 1, status: 'deployed',
        chartRef: 'bitnami/mysql', chartName: 'mysql', chartVer: '9.14.1', appVersion: myVer,
        updated: NOW - k8sAgeMs(my.age), values: { auth: { database: mysqlAppServerFromFs() } },
        history: [
          { revision: 1, updated: NOW - k8sAgeMs(my.age), status: 'deployed', chart: 'mysql-9.14.1', appVersion: myVer, description: 'Install complete' }
        ]
      });
    }
    return out;
  }

  /* mysqlAppServer 需要 ctx，这里给 helm 一个"只看文件系统"的轻量版 */
  function mysqlAppServerFromFs() {
    var FS = window.CC_TERM_FS || {};
    var out = 'orders';
    try {
      var spec = FS.spec || {};
      var txt = spec && spec.data && spec.data.app && spec.data.app['config.yaml'] ? String(spec.data.app['config.yaml'].$f || '') : '';
      var m = txt.match(/jdbc:mysql:\/\/[^\/]+\/([A-Za-z0-9_$]+)/);
      if (m) out = m[1];
    } catch (e) { /* 拿不到就用默认库名 */ }
    return out;
  }

  function helmState(root) {
    return stateOf(root, 'helm', {
      repos: HELM_DEFAULT_REPOS.map(function (r) { return { name: r.name, url: r.url }; }),
      releases: helmInitialReleases(),
      namespaces: null
    });
  }

  function helmNamespace(ctx) {
    var K = (window.CC_TERM_FS || {}).k8s || {};
    return K.contextNs || 'default';
  }

  function helmNamespaces(st) {
    var K = (window.CC_TERM_FS || {}).k8s || {};
    var list = (K.namespaces || ['default']).slice();
    (st.extraNs || []).forEach(function (n) { if (list.indexOf(n) === -1) list.push(n); });
    return list;
  }

  function helmFindRelease(st, name) {
    for (var i = 0; i < st.releases.length; i++) if (st.releases[i].name === name) return st.releases[i];
    return null;
  }

  /* 解析 -n/-A/-f/--set/--dry-run 这些公共参数；位置参数进 pos */
  function helmParse(argv) {
    var o = { pos: [], ns: null, allNs: false, allRel: false, set: {}, files: [], dryRun: false, createNs: false, install: false, keepHistory: false, versions: false, short: false, output: null, err: null };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-n' || a === '--namespace') { o.ns = String(argv[++i]); continue; }
      if (/^--namespace=/.test(a)) { o.ns = a.slice(12); continue; }
      if (a === '-A' || a === '--all-namespaces') { o.allNs = true; continue; }
      if (a === '-a' || a === '--all') { o.allRel = true; continue; }
      if (a === '-f' || a === '--values') { o.files.push(String(argv[++i])); continue; }
      if (a === '--set' || a === '--set-string') { var kv = String(argv[++i]).split('='); o.set[kv[0]] = kv.slice(1).join('='); continue; }
      if (/^--set=/.test(a)) { var kv2 = a.slice(6).split('='); o.set[kv2[0]] = kv2.slice(1).join('='); continue; }
      if (a === '--dry-run' || /^--dry-run=/.test(a)) { o.dryRun = true; continue; }
      if (a === '--create-namespace') { o.createNs = true; continue; }
      if (a === '--install' || a === '-i') { o.install = true; continue; }
      if (a === '--keep-history') { o.keepHistory = true; continue; }
      if (a === '--versions' || a === '-l') { o.versions = true; continue; }
      if (a === '--short') { o.short = true; continue; }
      if (a === '-o' || a === '--output') { o.output = String(argv[++i]); continue; }
      if (a === '--timeout' || a === '--description' || a === '--version' || a === '--kube-context' || a === '--repo' || a === '--history-max' || a === '--wait-for-jobs') { i++; continue; }
      if (a === '--wait' || a === '--atomic' || a === '--debug' || a === '--force' || a === '--dependency-update' || a === '--skip-refresh' || a === '--devel' || a === '--generate-name' || a === '-g' || a === '--cleanup-on-fail') continue;
      if (a.charAt(0) === '-' && a.length > 1) { o.err = 'unknown flag: ' + a; return o; }
      o.pos.push(a);
    }
    return o;
  }

  /* 把 chart 渲染成 K8s 清单（helm template / install --dry-run 用） */
  function helmManifests(ref, relName, ns, vals) {
    var c = HELM_CHARTS[ref];
    if (!c) return [];
    /* ⚠️ `--set image.tag=X` 必须**真的生效**。它此前被静默丢掉：
       helmImageOf() 会在夹具里找到真实镜像（带自己的 tag）并把它返回，
       于是命令行显式给的 tag 被覆盖 —— `helm template … --set image.tag=1.3.0`
       渲染出来还是夹具里的 1.2.3，**不报错、也看不出错**。
       而这正是"发布前用 template 确认镜像 tag 写对了没"的唯一手段：
       看到的是旧 tag，就会误判成"改的没生效"，或者反过来把错的 tag 放上线。 */
    var explicitTag = vals['image.tag'];
    var tag = explicitTag || c.appVersion;
    var replicas = vals.replicaCount || (c.chartName === 'web' ? '2' : '1');
    var image = helmImageOf(c.chartName, tag);
    if (explicitTag) image = image.replace(/:[^:]*$/, '') + ':' + explicitTag;
    if (vals['image.repository']) image = vals['image.repository'] + ':' + tag;
    var L = [];
    function labels(indent) {
      return [
        indent + 'helm.sh/chart: ' + c.chartName + '-' + c.versions[0],
        indent + 'app.kubernetes.io/name: ' + c.chartName,
        indent + 'app.kubernetes.io/instance: ' + relName,
        indent + 'app.kubernetes.io/version: "' + c.appVersion + '"',
        indent + 'app.kubernetes.io/managed-by: Helm'
      ];
    }
    function src(file) { L.push('---'); L.push('# Source: ' + c.chartName + '/templates/' + file); }
    var workload = (c.chartName === 'mysql' || c.chartName === 'redis') ? 'StatefulSet' : 'Deployment';

    src('serviceaccount.yaml');
    L.push('apiVersion: v1');
    L.push('kind: ServiceAccount');
    L.push('metadata:');
    L.push('  name: ' + relName);
    L.push('  namespace: ' + ns);
    L.push('  labels:');
    L = L.concat(labels('    '));
    L.push('automountServiceAccountToken: true');

    src('service.yaml');
    L.push('apiVersion: v1');
    L.push('kind: Service');
    L.push('metadata:');
    L.push('  name: ' + relName + '-' + c.chartName);
    L.push('  namespace: ' + ns);
    L.push('  labels:');
    L = L.concat(labels('    '));
    L.push('spec:');
    L.push('  type: ClusterIP');
    L.push('  ports:');
    L.push('    - port: ' + (c.chartName === 'mysql' ? 3306 : c.chartName === 'redis' ? 6379 : 80));
    L.push('      targetPort: ' + (c.chartName === 'mysql' ? 'mysql' : c.chartName === 'redis' ? 'redis' : 'http'));
    L.push('      protocol: TCP');
    L.push('      name: ' + (c.chartName === 'mysql' ? 'mysql' : c.chartName === 'redis' ? 'redis' : 'http'));
    L.push('  selector:');
    L.push('    app.kubernetes.io/name: ' + c.chartName);
    L.push('    app.kubernetes.io/instance: ' + relName);

    src(workload.toLowerCase() + '.yaml');
    L.push('apiVersion: apps/v1');
    L.push('kind: ' + workload);
    L.push('metadata:');
    L.push('  name: ' + relName + '-' + c.chartName);
    L.push('  namespace: ' + ns);
    L.push('  labels:');
    L = L.concat(labels('    '));
    L.push('spec:');
    L.push('  replicas: ' + replicas);
    L.push('  selector:');
    L.push('    matchLabels:');
    L.push('      app.kubernetes.io/name: ' + c.chartName);
    L.push('      app.kubernetes.io/instance: ' + relName);
    L.push('  template:');
    L.push('    metadata:');
    L.push('      labels:');
    L = L.concat(labels('        '));
    L.push('    spec:');
    L.push('      serviceAccountName: ' + relName);
    L.push('      containers:');
    L.push('        - name: ' + c.chartName);
    L.push('          image: "' + image + '"');
    L.push('          imagePullPolicy: IfNotPresent');
    L.push('          ports:');
    L.push('            - name: ' + (c.chartName === 'mysql' ? 'mysql' : c.chartName === 'redis' ? 'redis' : 'http'));
    L.push('              containerPort: ' + (c.chartName === 'mysql' ? 3306 : c.chartName === 'redis' ? 6379 : 8080));
    L.push('              protocol: TCP');
    L.push('          resources:');
    L.push('            limits:');
    L.push('              cpu: 500m');
    L.push('              memory: 512Mi');
    L.push('            requests:');
    L.push('              cpu: 200m');
    L.push('              memory: 256Mi');
    if (c.chartName !== 'mysql' && c.chartName !== 'redis') {
      L.push('          readinessProbe:');
      L.push('            httpGet:');
      L.push('              path: /healthz');
      L.push('              port: http');
      L.push('            initialDelaySeconds: 5');
      L.push('            periodSeconds: 10');
    }
    if (workload === 'StatefulSet') {
      L.push('  volumeClaimTemplates:');
      L.push('    - metadata:');
      L.push('        name: data');
      L.push('      spec:');
      L.push('        accessModes: ["ReadWriteOnce"]');
      L.push('        storageClassName: csi-disk-ssd');
      L.push('        resources:');
      L.push('          requests:');
      L.push('            storage: ' + (c.chartName === 'mysql' ? '500Gi' : '20Gi'));
    }
    return L;
  }

  function helmNotes(ref, relName, ns) {
    var c = HELM_CHARTS[ref];
    if (!c) return [];
    if (c.chartName === 'web' || c.chartName === 'worker' || c.chartName === 'gateway' || c.chartName === 'nginx') {
      return [
        '1. Get the application URL by running these commands:',
        '  export POD_NAME=$(kubectl get pods --namespace ' + ns + ' -l "app.kubernetes.io/name=' + c.chartName + ',app.kubernetes.io/instance=' + relName + '" -o jsonpath="{.items[0].metadata.name}")',
        '  echo "Visit http://127.0.0.1:8080 to use your application"',
        '  kubectl --namespace ' + ns + ' port-forward $POD_NAME 8080:80'
      ];
    }
    if (c.chartName === 'mysql') {
      return [
        'MySQL can be accessed via port 3306 on the following DNS name from within your cluster:',
        '  ' + relName + '-mysql.' + ns + '.svc.cluster.local',
        '',
        'To get your root password run:',
        '  MYSQL_ROOT_PASSWORD=$(kubectl get secret --namespace ' + ns + ' ' + relName + '-mysql -o jsonpath="{.data.mysql-root-password}" | base64 -d)'
      ];
    }
    if (c.chartName === 'redis') {
      return [
        'Redis can be accessed via port 6379 on the following DNS name from within your cluster:',
        '  ' + relName + '-redis-master.' + ns + '.svc.cluster.local'
      ];
    }
    return [
      'kube-prometheus installed. Check the Grafana dashboard:',
      '  kubectl --namespace ' + ns + ' port-forward svc/' + relName + '-grafana 3000:80',
      '  Login with admin / $(kubectl get secret --namespace ' + ns + ' ' + relName + '-grafana -o jsonpath="{.data.admin-password}" | base64 -d)'
    ];
  }

  function helmStatusBlock(rel, statusOverride, revisionOverride) {
    var out = [
      'NAME: ' + rel.name,
      'LAST DEPLOYED: ' + helmDeployTime(rel.updated),
      'NAMESPACE: ' + rel.ns,
      'STATUS: ' + (statusOverride || rel.status),
      'REVISION: ' + (revisionOverride || rel.revision),
      'TEST SUITE: None'
    ];
    var notes = helmNotes(rel.chartRef, rel.name, rel.ns);
    if (notes.length) {
      out.push('NOTES:');
      out = out.concat(notes);
    }
    return out;
  }

  /* 单条 release 历史里的某一版（`--revision N` / `-a` 用） */
  function helmRevisionOf(rel, n) {
    return (rel.history || []).filter(function (h) { return h.revision === Number(n); })[0] || null;
  }

  /* `helm get values -a` 的"计算后"取值：真机是三层合并的结果 ——
     Chart 自带默认值 → values 文件 → --set。`-a` 与不带 `-a` 的区别正是
     "最终生效值"与"用户显式给了什么"，而**排障时绝大多数情况要看的是前者**
     （"这个 release 现在到底用的是什么镜像 tag"）。此前 `-a` 被 helmParse
     当成 `helm list` 的 --all 吞掉、静默无效，于是 `-a` 与不带 `-a` 输出一模一样。 */
  function helmComputedValues(rel, st) {
    var defaults = { replicaCount: '2', 'image.repository': helmImageOf((HELM_CHARTS[rel.chartRef] || {}).chartName || 'app', rel.appVersion).replace(/:[^:]*$/, ''), 'image.tag': rel.appVersion, 'resources.limits.cpu': '500m', 'resources.limits.memory': '512Mi' };
    var merged = {};
    Object.keys(defaults).forEach(function (k) { merged[k] = defaults[k]; });
    /* values 文件（-f）里的值记在 release 上，命令行 --set 优先级最高 */
    Object.keys(rel.fileValues || {}).forEach(function (k) { merged[k] = rel.fileValues[k]; });
    Object.keys(rel.values || {}).forEach(function (k) { merged[k] = rel.values[k]; });
    return merged;
  }

  function helmValuesLines(rel, st, computed) {
    var src = computed ? helmComputedValues(rel, st) : (rel.values || {});
    var header = computed ? 'COMPUTED VALUES:' : 'USER-SUPPLIED VALUES:';
    var keys = Object.keys(src);
    if (!keys.length) return [header, 'null'];
    var out = [header];
    /* 把 --set image.tag=1.2.4 这种点号键还原成 YAML 的嵌套结构（真机就是这样） */
    var nested = {}, flat = [];
    keys.forEach(function (k) {
      var parts = k.split('.');
      if (parts.length >= 2) {
        nested[parts[0]] = nested[parts[0]] || [];
        nested[parts[0]].push({ leaf: parts.slice(1).join('.'), v: src[k] });
      } else flat.push(k);
    });
    flat.forEach(function (k) {
      var v = src[k];
      if (v && typeof v === 'object') {
        out.push(k + ':');
        Object.keys(v).forEach(function (k2) { out.push('  ' + k2 + ': ' + v[k2]); });
      } else out.push(k + ': ' + v);
    });
    Object.keys(nested).forEach(function (top) {
      out.push(top + ':');
      nested[top].forEach(function (x) { out.push('  ' + x.leaf + ': ' + x.v); });
    });
    return out;
  }

  CMDS.helm = function (argv, ctx, stdin, HOST) {
    var sub = argv[0];
    /* `--revision` 是命令模块新增支持的参数（helm get manifest/values --revision N），
       而 helmParse 不认它、会直接以 "unknown flag" 失败，所以先摘出来存到选项对象上，
       再交给命令模块的钩子处理；没有钩子时它仍然会走下面的内置实现。 */
    var revision = null;
    var helmArgv = [];
    for (var ri = 1; ri < argv.length; ri++) {
      var ra = String(argv[ri]);
      if (ra === '--revision') { revision = argv[ri + 1] === undefined ? null : argv[ri + 1]; ri++; continue; }
      if (ra.indexOf('--revision=') === 0) { revision = ra.slice(11); continue; }
      helmArgv.push(argv[ri]);
    }

    /* ---------- 扩展子命令入口（实现在 assets/js/cmd-k8s.js 的 window.CC_HELM_EXTRA） ----------
       必须**先于 helmParse** 调用：helmParse 只认识内置实现的参数，遇到命令模块自己
       支持的参数（如 helm package -d、helm pull --untar）会以 "unknown flag" 提前失败，
       钩子就永远没机会执行。约定：
         window.CC_HELM_EXTRA[子命令](argv, ctx, stdin, HOST, sub)
       第一个参数是 **helm 之后的原始 argv**（含子命令本身）。
       返回 null/undefined 表示"这条我不处理"，继续走下面的内置实现。 */
    var hx = (ctx && ctx.shell && ctx.shell.helmExtra) || window.CC_HELM_EXTRA;
    if (sub && hx && typeof hx[sub] === 'function') {
      var hext = hx[sub](argv, ctx, stdin, HOST, sub);
      if (hext) return hext;
    }

    var o = helmParse(helmArgv);
    o.revision = revision;
    var st = helmState(ctx.root);
    var defNs = helmNamespace(ctx);

    if (!sub) {
      return ok([
        'The Kubernetes package manager',
        '',
        'Common actions for Helm:',
        '  helm search repo <关键词>   在已添加的仓库里找 chart',
        '  helm install <名字> <chart> 安装（release 名在同一命名空间里必须唯一）',
        '  helm list -A                看所有命名空间里已装的 release',
        '  helm template <chart>       本地渲染 YAML，不碰集群 —— 上线前先看它'
      ]);
    }
    if (o.err) return fail(['Error: ' + o.err]);

    if (sub === 'version') {
      if (o.short) return ok(['v3.14.0+gc3fc9f4b']);
      return ok(['version.BuildInfo{Version:"v3.14.0", GitCommit:"3fc9f4b2638e76f26739cd77c7017139be81d0ea", GitTreeState:"clean", GoVersion:"go1.21.6"}']);
    }

    /* ---------- repo ---------- */
    if (sub === 'repo') {
      var act = o.pos[0];
      if (act === 'list' || act === undefined) {
        var out = ['NAME  \tURL'];
        st.repos.forEach(function (r) { out.push(r.name + ' \t' + r.url); });
        return ok(out);
      }
      if (act === 'add') {
        var name = o.pos[1], url = o.pos[2];
        if (!name || !url) return fail(['Error: "helm repo add" requires 2 arguments']);
        for (var i = 0; i < st.repos.length; i++) {
          if (st.repos[i].name === name) return fail(['Error: repository name (' + name + ') already exists, please specify a different name']);
        }
        if (!/^https?:\/\//.test(url)) {
          return fail(['Error: looks like "' + url + '" is not a valid chart repository or cannot be reached: Get "' + url + '/index.yaml": dial tcp: lookup ' + url.split('/')[0] + ': no such host']);
        }
        st.repos.push({ name: name, url: url });
        return ok(['"' + name + '" has been added to your repositories']);
      }
      if (act === 'remove' || act === 'rm') {
        var rn = o.pos[1];
        var before = st.repos.length;
        st.repos = st.repos.filter(function (r) { return r.name !== rn; });
        if (st.repos.length === before) return fail(['Error: no repo named "' + rn + '" found']);
        return ok(['"' + rn + '" has been removed from your repositories']);
      }
      if (act === 'update') {
        var lines = ['Hang tight while we grab the latest from your chart repositories...'];
        st.repos.forEach(function (r) { lines.push('...Successfully got an update from the "' + r.name + '" chart repository'); });
        lines.push('Update Complete. ⎈Happy Helming!⎈');
        return ok(lines);
      }
      return fail(['Error: unknown command "' + act + '" for "helm repo"']);
    }

    /* ---------- search ---------- */
    if (sub === 'search') {
      var kind = o.pos[0], kw = o.pos[1] || '';
      if (kind !== 'repo') return fail(['Error: unknown command "' + kind + '" for "helm search"']);
      var rows = ['NAME  \tCHART VERSION\tAPP VERSION\tDESCRIPTION'];
      Object.keys(HELM_CHARTS).forEach(function (ref) {
        var c = HELM_CHARTS[ref];
        var repoName = ref.split('/')[0];
        if (!st.repos.some(function (r) { return r.name === repoName; })) return;
        if (kw && ref.toLowerCase().indexOf(kw.toLowerCase()) === -1 && c.desc.indexOf(kw) === -1) return;
        var vers = o.versions ? c.versions : [c.versions[0]];
        vers.forEach(function (v) {
          rows.push(ref + '  \t' + v + '  \t' + c.appVersion + '  \t' + c.desc);
        });
      });
      if (rows.length === 1) {
        return fail(['Error: no results found for "' + kw + '" in the repositories you have added. Try `helm repo update` or `helm search hub`.']);
      }
      return ok(rows);
    }

    /* ---------- list ---------- */
    if (sub === 'list' || sub === 'ls') {
      var ns = o.ns || defNs;
      var list = st.releases.filter(function (r) {
        if (r.status === 'uninstalled' && !o.allRel) return false;
        return o.allNs || r.ns === ns;
      });
      if (o.allNs) {
        return ok(['NAME      \tNAMESPACE \tREVISION\tUPDATED                                \tSTATUS  \tCHART                \tAPP VERSION'].concat(
          list.map(function (r) {
            return pad(r.name, 10) + '\t' + pad(r.ns, 10) + '\t' + r.revision + '       \t' + helmUpdatedTime(r.updated) + '\t' + pad(r.status, 8) + '\t' + pad(r.chartName + '-' + r.chartVer, 21) + '\t' + r.appVersion;
          })
        ));
      }
      return ok(['NAME      \tREVISION\tUPDATED                                \tSTATUS  \tCHART                \tAPP VERSION'].concat(
        list.map(function (r) {
          return pad(r.name, 10) + '\t' + r.revision + '       \t' + helmUpdatedTime(r.updated) + '\t' + pad(r.status, 8) + '\t' + pad(r.chartName + '-' + r.chartVer, 21) + '\t' + r.appVersion;
        })
      ));
    }

    /* ---------- show chart / values / readme / crds / all ---------- */
    if (sub === 'show') {
      var what = o.pos[0], ref = o.pos[1];
      if (!HELM_CHARTS[ref]) return fail([helmChartNotFound(ref)]);
      var KNOWN_SHOW = ['values', 'chart', 'readme', 'crds', 'all'];
      if (KNOWN_SHOW.indexOf(what) === -1) {
        return fail(['Error: unknown command "' + what + '" for "helm show"',
          '（可用：' + KNOWN_SHOW.join(' / ') + '）']);
      }
      var hc = HELM_CHARTS[ref];
      function showChart() {
        return ['apiVersion: v2', 'name: ' + hc.chartName, 'version: ' + hc.versions[0],
          'appVersion: "' + hc.appVersion + '"', 'description: ' + hc.desc];
      }
      function showValues() {
        return ['replicaCount: 2', 'image:',
          '  repository: ' + helmImageOf(hc.chartName, hc.appVersion).replace(/:[^:]*$/, ''),
          '  tag: "' + hc.appVersion + '"', 'resources:', '  limits:', '    cpu: 500m', '    memory: 512Mi'];
      }
      /* `readme` 是真机上"这个 Chart 怎么用"的第一手资料（Chart 包里带的 README.md）。
         ⚠️ 站内 hl-show 的示例就在用它，而这里早先只做了 values / chart，
         于是 `helm show readme bitnami/mysql` 直接报 unknown command ——
         一条完全正确的命令跑不通，学员会以为命令写错了。 */
      function showReadme() {
        return [
          '# ' + hc.chartName,
          '',
          hc.desc,
          '',
          '## 前置条件',
          '- Kubernetes 1.23+',
          '- 已配置 StorageClass（有状态组件需要 PVC）',
          '',
          '## 安装',
          '```bash',
          'helm install my-' + hc.chartName + ' ' + ref + ' \\',
          '  --namespace prod --create-namespace \\',
          '  -f values-prod.yaml',
          '```',
          '',
          '## 常用参数',
          '| 参数 | 说明 | 默认值 |',
          '| --- | --- | --- |',
          '| `replicaCount` | 副本数 | `2` |',
          '| `image.repository` | 镜像地址 | 见 values.yaml |',
          '| `resources.limits.memory` | 内存上限 | `512Mi` |',
          '',
          '## 升级与回滚',
          '```bash',
          'helm upgrade my-' + hc.chartName + ' ' + ref + ' -n prod -f values-prod.yaml',
          'helm rollback my-' + hc.chartName + ' 1 -n prod    # 回到第 1 版',
          '```',
          '',
          '（教学环境）真实 Chart 的 README 通常几百行、含各组件详细参数表；',
          '这里给出结构与最常用参数，`helm show values ' + ref + '` 才是参数的**权威来源**。'
        ];
      }
      function showCrds() {
        return ['（教学环境）' + hc.chartName + ' 未包含 CRD。',
          '判断方法：`helm show crds <chart>` 有输出就说明它带 CRD，',
          '装带 CRD 的 Chart 要留意——**卸载时 CRD 默认不会被删**，残留的 CRD 会让下次安装报 already exists。'];
      }
      if (what === 'chart') return ok(showChart());
      if (what === 'values') return ok(showValues());
      if (what === 'readme') return ok(showReadme());
      if (what === 'crds') return ok(showCrds());
      /* `all` = chart + readme + values + crds 一次打完（真机行为，输出很长） */
      return ok([].concat(
        showChart(), [''], ['---'], showReadme(), [''], ['---'],
        ['# values.yaml'], showValues(), [''], ['---'],
        ['# crds/'], showCrds()
      ));
    }

    /* ---------- lint ---------- */
    if (sub === 'lint') {
      var lref = o.pos[0];
      if (!HELM_CHARTS[lref]) return fail([helmChartNotFound(lref)]);
      return ok(['==> Linting ' + lref, '[INFO] Chart.yaml: icon is recommended', '', '1 chart(s) linted, 0 chart(s) failed']);
    }

    /* ---------- template ---------- */
    if (sub === 'template') {
      /* helm template [NAME] <chart> —— 本地渲染，不连集群、不建 release */
      var tref = o.pos[o.pos.length - 1];
      var tname = o.pos.length > 1 ? o.pos[0] : 'release-name';
      if (!HELM_CHARTS[tref]) return fail([helmChartNotFound(tref)]);
      return ok(helmManifests(tref, tname, o.ns || defNs, o.set));
    }

    /* ---------- install ---------- */
    if (sub === 'install') {
      var relName = o.pos[0], chartRef = o.pos[1];
      if (!relName || !chartRef) return fail(['Error: INSTALLATION FAILED: must either provide a name or specify --generate-name']);
      if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(relName) || relName.length > 53) {
        return fail(['Error: INSTALLATION FAILED: release name "' + relName + '": invalid release name, must match regex ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ and the length must not be longer than 53']);
      }
      if (!HELM_CHARTS[chartRef]) return fail(['Error: INSTALLATION FAILED: ' + helmChartNotFound(chartRef).replace(/^Error: /, '')]);
      var insNs = o.ns || defNs;
      var known = helmNamespaces(st);
      if (known.indexOf(insNs) === -1 && !o.createNs) {
        return fail(['Error: INSTALLATION FAILED: create: failed to create: namespaces "' + insNs + '" not found']);
      }
      if (known.indexOf(insNs) === -1) {
        st.extraNs = (st.extraNs || []).concat([insNs]);
      }
      if (helmFindRelease(st, relName) && helmFindRelease(st, relName).status !== 'uninstalled') {
        return fail(['Error: INSTALLATION FAILED: cannot re-use a name that is still in use']);
      }
      var c = HELM_CHARTS[chartRef];
      var rel = {
        name: relName, ns: insNs, revision: 1,
        status: o.dryRun ? 'pending-install' : 'deployed',
        chartRef: chartRef, chartName: c.chartName, chartVer: o.set['chartVersion'] || c.versions[0], appVersion: c.appVersion,
        updated: NOW, values: o.set,
        history: [{ revision: 1, updated: NOW, status: o.dryRun ? 'pending-install' : 'deployed', chart: c.chartName + '-' + c.versions[0], appVersion: c.appVersion, description: 'Install complete' }]
      };
      var outLines = helmStatusBlock(rel);
      if (o.dryRun) {
        outLines.push('MANIFEST:');
        outLines = outLines.concat(helmManifests(chartRef, relName, insNs, o.set));
      }
      if (!o.dryRun) {
        st.releases = st.releases.filter(function (r) { return r.name !== relName; }).concat([rel]);
      }
      return ok(outLines);
    }

    /* ---------- upgrade ---------- */
    if (sub === 'upgrade') {
      var upName = o.pos[0], upRef = o.pos[1];
      if (!upName || !upRef) return fail(['Error: UPGRADE FAILED: "helm upgrade" requires 2 arguments']);
      if (!HELM_CHARTS[upRef]) return fail(['Error: UPGRADE FAILED: ' + helmChartNotFound(upRef).replace(/^Error: /, '')]);
      var upRel = helmFindRelease(st, upName);
      if (!upRel || upRel.status === 'uninstalled') {
        if (!o.install) return fail(['Error: UPGRADE FAILED: "' + upName + '" has no deployed releases']);
        /* --install：release 不存在就装（真机先打一行提示，再走 install 的输出） */
        var insArgs = ['install', upName, upRef];
        if (o.ns) insArgs = insArgs.concat(['-n', o.ns]);
        if (o.createNs) insArgs.push('--create-namespace');
        if (o.dryRun) insArgs.push('--dry-run');
        Object.keys(o.set).forEach(function (k) { insArgs.push('--set', k + '=' + o.set[k]); });
        var insRes = CMDS.helm(insArgs, ctx, stdin, HOST);
        insRes.out = ['Release "' + upName + '" does not exist. Installing it now.'].concat(insRes.out || []);
        return insRes;
      }
      var c2 = HELM_CHARTS[upRef];
      var newRev = upRel.revision + 1;
      var vals = {};
      Object.keys(upRel.values || {}).forEach(function (k) { vals[k] = upRel.values[k]; });
      Object.keys(o.set).forEach(function (k) { vals[k] = o.set[k]; });
      var keepChart = o.set['chartVersion'] ? o.set['chartVersion'] : c2.versions[0];
      upRel.revision = newRev;
      upRel.chartRef = upRef;
      upRel.chartName = c2.chartName;
      upRel.chartVer = keepChart;
      upRel.appVersion = c2.appVersion;
      upRel.values = vals;
      upRel.updated = NOW;
      upRel.status = 'deployed';
      upRel.history.push({ revision: newRev, updated: NOW, status: 'deployed', chart: c2.chartName + '-' + keepChart, appVersion: c2.appVersion, description: 'Upgrade complete' });
      var uOut = helmStatusBlock(upRel);
      if (o.dryRun) {
        uOut.push('MANIFEST:');
        uOut = uOut.concat(helmManifests(upRef, upName, upRel.ns, vals));
      }
      return ok(uOut);
    }

    /* ---------- rollback ---------- */
    if (sub === 'rollback') {
      var rbName = o.pos[0], rbRev = o.pos[1] ? Number(o.pos[1]) : null;
      var rbRel = helmFindRelease(st, rbName);
      if (!rbRel) return fail(['Error: release: not found']);
      var target = rbRev || (rbRel.revision - 1);
      var hit = rbRel.history.filter(function (h) { return h.revision === target; })[0];
      if (!hit) return fail(['Error: release has no ' + target + ' revision']);
      rbRel.revision = rbRel.revision + 1;
      rbRel.updated = NOW;
      rbRel.status = 'deployed';
      rbRel.history.push({
        revision: rbRel.revision, updated: NOW, status: 'deployed',
        chart: hit.chart, appVersion: hit.appVersion, description: 'Rollback to ' + target
      });
      return ok(['Rollback was a success! Happy Helming!']);
    }

    /* ---------- history ---------- */
    if (sub === 'history') {
      var hName = o.pos[0];
      var hRel = helmFindRelease(st, hName);
      if (!hRel) return fail(['Error: release: not found']);
      return ok(['REVISION\tUPDATED                                \tSTATUS    \tCHART                \tAPP VERSION\tDESCRIPTION'].concat(
        hRel.history.map(function (h) {
          return h.revision + '       \t' + helmUpdatedTime(h.updated) + '\t' + pad(h.status, 10) + '\t' + pad(h.chart, 21) + '\t' + pad(h.appVersion, 11) + '\t' + h.description;
        })
      ));
    }

    /* ---------- status ---------- */
    if (sub === 'status') {
      var sRel = helmFindRelease(st, o.pos[0]);
      if (!sRel) return fail(['Error: release: not found']);
      /* `--revision N` 必须真的生效：它此前被 helmParse 当成未知参数丢掉，
         于是 `helm status myapp --revision 2` **静默返回了最新那一版** ——
         输出看着完全正常，但答的是另一个问题。而"上一版是什么配置"正是
         回滚前最需要确认的事，答错会导致照着最新版的信息做回滚决定。 */
      if (o.revision) {
        var sTarget = Number(o.revision);
        var sHit = (sRel.history || []).filter(function (h) { return h.revision === sTarget; })[0];
        if (!sHit) return fail(['Error: release: not found the revision ' + o.revision]);
        return ok(helmStatusBlock(sRel, sHit.status, sTarget));
      }
      return ok(helmStatusBlock(sRel));
    }

    /* ---------- get ---------- */
    if (sub === 'get') {
      var what2 = o.pos[0], gName = o.pos[1];
      var gRel = helmFindRelease(st, gName);
      if (!gRel) return fail(['Error: release: not found']);
      /* `--revision N`：看的是"那一版"的取值/清单，而不是当前最新的 */
      if (o.revision && !helmRevisionOf(gRel, o.revision)) {
        return fail(['Error: release: not found the revision ' + o.revision]);
      }
      var gComputed = o.allRel && what2 === 'values';
      if (what2 === 'values') return ok(helmValuesLines(gRel, st, gComputed));
      if (what2 === 'manifest') return ok(helmManifests(gRel.chartRef, gRel.name, gRel.ns, gRel.values));
      if (what2 === 'notes') return ok(helmNotes(gRel.chartRef, gRel.name, gRel.ns));
      if (what2 === 'all') {
        return ok(helmStatusBlock(gRel).concat(['', 'MANIFEST:']).concat(helmManifests(gRel.chartRef, gRel.name, gRel.ns, gRel.values)).concat(['', 'USER-SUPPLIED VALUES:']).concat(helmValuesLines(gRel, st).slice(1)));
      }
      return fail(['Error: unknown command "' + what2 + '" for "helm get"',
        '（本站仿真支持：values / manifest / notes / all）']);
    }

    /* ---------- uninstall ---------- */
    if (sub === 'uninstall' || sub === 'delete') {
      var dName = o.pos[0];
      var dRel = helmFindRelease(st, dName);
      if (!dRel) return fail(['Error: uninstall: Release not loaded: ' + dName + ': release: not found']);
      if (o.keepHistory) {
        dRel.status = 'uninstalled';
      } else {
        st.releases = st.releases.filter(function (r) { return r !== dRel; });
      }
      return ok(['release "' + dName + '" uninstalled']);
    }

    return fail(['Error: unknown command "' + sub + '" for "helm"']);
  };

  function helmChartNotFound(ref) {
    if (!ref) return 'Error: chart not specified';
    if (String(ref).charAt(0) === '.' || String(ref).charAt(0) === '/') {
      return 'Error: path "' + ref + '" not found（教学环境只内置了仓库里的 chart：myorg/web、myorg/worker、bitnami/mysql 等）';
    }
    if (String(ref).indexOf('/') === -1) return 'Error: path "' + ref + '" not found（仓库 chart 要写全 <仓库>/<chart>，例如 myorg/web）';
    var repo = String(ref).split('/')[0];
    return 'Error: repo ' + repo + ': chart "' + String(ref).split('/')[1] + '" not found in ' + repo + ' index. (try \'helm repo update\'): no chart name found';
  }

  /* ======================= git（真状态 + 真 diff 的教学子集） =======================
     /data/app 下有一个"半成品"仓库：有人把 datasource 里写死的 IP 改成了内网域名，
     但还没提交 —— 所以 git status / git diff 一上来就有真东西可看。
     add / commit / checkout -b / tag / push 都会真的改写本会话的仓库状态：
     提交历史、索引、分支、远程引用、.git/ 目录里的文件全都跟着变。
     diff 是逐行 LCS 算出来的，不是预置文本。 */

  var GIT_DEFAULT_REPO = '/data/app';
  var GIT_VERSION = '2.39.3';
  var GIT_URL = 'git@codehub.devcloud.cn-north-4.huaweicloud.com:myorg/orders-app.git';

  /* 教学环境没实现的子命令，给出原因（而不是假装 command not found） */
  var GIT_NOT_IMPL = {
    reset: 'git reset 会改写暂存区/历史（--hard 还会丢工作区改动），风险高，教学环境不模拟',
    stash: 'git stash 需要真正的工作区快照栈，教学环境不模拟',
    merge: 'git merge 会产生合并提交与冲突现场，教学环境不模拟',
    rebase: 'git rebase 会重写提交历史，教学环境不模拟',
    'cherry-pick': 'git cherry-pick 涉及跨分支提交复制，教学环境不模拟',
    fetch: 'git fetch 需要真实远端，教学环境不模拟',
    pull: 'git pull = fetch + merge，需要真实远端，教学环境不模拟',
    clone: 'git clone 需要真实远端，教学环境不模拟',
    show: 'git show 需要完整对象库，教学环境不模拟（看改动请用 git diff / git log）',
    blame: 'git blame 需要完整对象库，教学环境不模拟',
    clean: 'git clean 会真的删文件，风险高，教学环境不模拟',
    reflog: 'git reflog 需要完整对象库，教学环境不模拟'
  };

  /* 确定性哈希：同一个种子永远得到同一串 40 位十六进制（当 sha 用） */
  function gitSha(seed) {
    var h = 2166136261, out = '';
    for (var round = 0; round < 5; round++) {
      for (var i = 0; i < String(seed).length; i++) {
        h ^= String(seed).charCodeAt(i) + round * 31 + i;
        h = (h * 16777619) >>> 0;
      }
      out += ('0000000' + h.toString(16)).slice(-8);
    }
    return out.slice(0, 40);
  }

  function gitDates(ms) {
    var d = new Date(ms);
    return HELM_DAY[d.getDay()] + ' ' + HELM_MON[d.getMonth()] + ' ' + (d.getDate() < 10 ? ' ' : '') + d.getDate() +
      ' ' + helmP2(d.getHours()) + ':' + helmP2(d.getMinutes()) + ':' + helmP2(d.getSeconds()) + ' ' + d.getFullYear() +
      ' +0800';
  }

  function gitFindRepoPath(ctx) {
    var cur = ctx.cwd;
    while (true) {
      var node = findNode(ctx.root, cur);
      if (node && node.type === 'dir' && node.children['.git']) return cur;
      if (cur === '/') break;
      cur = parentOf(cur);
    }
    return null;
  }

  /* 仓库目录下的工作区文件（跳过 .git；命中 .gitignore 的也收进来，由调用方过滤） */
  function gitWorkFiles(ctx, repoPath) {
    var out = {};
    var node = findNode(ctx.root, repoPath);
    if (!node) return out;
    (function walk(n, prefix) {
      childrenSorted(n).forEach(function (name) {
        if (prefix === '' && name === '.git') return;
        var child = n.children[name];
        var rel = prefix === '' ? name : prefix + '/' + name;
        if (child.type === 'dir') walk(child, rel);
        else if (child.type === 'file') out[rel] = String(child.content === undefined ? '' : child.content);
      });
    })(node, '');
    return out;
  }

  function gitIgnorePatterns(ctx, repoPath) {
    var txt = readNode(ctx, repoPath + '/.gitignore');
    if (txt === null) return [];
    return txt.split('\n').map(function (l) { return l.replace(/#.*$/, '').trim(); }).filter(Boolean);
  }

  function gitIgnored(rel, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (p.charAt(p.length - 1) === '/') {
        if (rel.indexOf(p) === 0) return true;
      } else if (p.indexOf('/') === -1) {
        if (globToRe(p).test(baseName(rel))) return true;
      } else if (globToRe(p).test(rel)) return true;
    }
    return false;
  }

  /* 按需"安装"仓库：.git/ 与 .gitignore 真的写进虚拟文件系统，状态记在 root 上 */
  function gitEnsureRepo(ctx, HOST, repoPath) {
    var st = stateOf(ctx.root, 'git', { repos: {} });
    if (st.repos[repoPath]) return st.repos[repoPath];

    var user = HOST.user || 'root';
    var email = user + '@' + (HOST.hostname || 'localhost');
    var repo = {
      path: repoPath, branch: 'main', detached: null, unborn: false,
      branches: {}, commits: [], index: {}, tags: {},
      remotes: { origin: { url: GIT_URL, refs: {} } },
      config: { 'user.name': user, 'user.email': email, 'core.repositoryformatversion': '0' }
    };

    var work = gitWorkFiles(ctx, repoPath);
    if (!work['README.md']) {
      /* 不是 /data/app 这种预置仓库（git init 出来的空仓库） */
      repo.unborn = true;
      repo.branches.main = null;
      st.repos[repoPath] = repo;
      gitWriteGitDir(ctx, repo);
      return repo;
    }

    if (!work['.gitignore']) {
      ensureFile(ctx, repoPath + '/.gitignore', 'logs/\n*.log\n*.jar\n*.tmp\n');
      work['.gitignore'] = 'logs/\n*.log\n*.jar\n*.tmp\n';
    }

    /* HEAD 里的 config.yaml 是"写死 IP"的老版本 —— 工作区那版改了域名但没提交，
       这就是练习素材（不是数据错误）。老版本按 /etc/hosts 里的 db-prod-01 地址推导。 */
    var ip = hostMap(ctx, HOST)['db-prod-01'] || '10.0.2.15';
    var cfgNow = work['config.yaml'] || '';
    var cfgOld = cfgNow.replace(/(url:\s*jdbc:mysql:\/\/)[^\s]*/, '$1' + ip + ':3306/orders');
    if (cfgOld === cfgNow) cfgOld = cfgNow.replace('db-prod-01', ip);

    var head = { '.gitignore': work['.gitignore'], 'README.md': work['README.md'], 'config.yaml': cfgOld };
    var mk = function (subject, daysAgo, snapshot) {
      return {
        sha: gitSha(subject + '|' + daysAgo + '|' + email), msg: subject, author: user, email: email,
        date: NOW - daysAgo * 86400000, snapshot: snapshot || null, parent: null, tags: []
      };
    };
    var c4 = mk('feat: 订单列表接 Redis 缓存，命中率 99.8%', 0.015, head);
    var c3 = mk('fix: 数据库连接超时重试 3 次（原来 0 次）', 0.65, null);
    var c2 = mk('chore: 基础镜像升级到 eclipse-temurin:17-jre', 3.05, null);
    var c1 = mk('init: 项目骨架 + CI 流水线', 8.02, null);
    c4.parent = c3.sha; c3.parent = c2.sha; c2.parent = c1.sha; c1.parent = null;
    repo.commits = [c4, c3, c2, c1];
    repo.branches.main = c4.sha;
    repo.branches['release/1.2'] = c3.sha;
    repo.index = {};
    Object.keys(head).forEach(function (k) { repo.index[k] = head[k]; });

    /* tag 从 docker 里的 web 镜像标签倒推（v1.2.2 / v1.2.3 就是对得上的发布版本） */
    repo.tags['v1.2.1'] = c2.sha;
    repo.tags['v1.2.2'] = c3.sha;
    repo.tags['v1.2.3'] = c4.sha;
    c2.tags.push('v1.2.1'); c3.tags.push('v1.2.2'); c4.tags.push('v1.2.3');
    repo.remotes.origin.refs.main = c4.sha;
    repo.remotes.origin.refs['release/1.2'] = c3.sha;

    st.repos[repoPath] = repo;
    gitWriteGitDir(ctx, repo);
    return repo;
  }

  /* 让 .git/ 目录与状态保持一致（学员 cat .git/HEAD 能看到真东西） */
  function gitWriteGitDir(ctx, repo) {
    var p = repo.path;
    ensureDir(ctx, p + '/.git/refs/heads');
    ensureDir(ctx, p + '/.git/refs/remotes/origin');
    ensureFile(ctx, p + '/.git/HEAD', repo.detached ? repo.detached + '\n' : 'ref: refs/heads/' + repo.branch + '\n');
    ensureFile(ctx, p + '/.git/config',
      '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n' +
      '[remote "origin"]\n\turl = ' + repo.remotes.origin.url + '\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n' +
      '[branch "' + repo.branch + '"]\n\tremote = origin\n\tmerge = refs/heads/' + repo.branch + '\n');
    Object.keys(repo.branches).forEach(function (b) {
      var sha = repo.branches[b];
      if (sha) ensureFile(ctx, p + '/.git/refs/heads/' + b, sha + '\n');
    });
    Object.keys(repo.remotes.origin.refs).forEach(function (b) {
      ensureFile(ctx, p + '/.git/refs/remotes/origin/' + b, repo.remotes.origin.refs[b] + '\n');
    });
  }

  /* /data/app 是这台机器上"已经存在"的仓库：第一次碰它时把 .git/ 与初始提交装出来。
     写了这一步，`git init` 在 /data/app 里才会像真机那样回 "Reinitialized existing…"，
     而不是凭空造一个空仓库把历史清掉。 */
  function gitMaterializeDefault(ctx, HOST, path) {
    if (path !== GIT_DEFAULT_REPO && String(path).indexOf(GIT_DEFAULT_REPO + '/') !== 0) return null;
    var st = stateOf(ctx.root, 'git', { repos: {} });
    if (st.repos[GIT_DEFAULT_REPO]) return st.repos[GIT_DEFAULT_REPO];
    if (!findNode(ctx.root, GIT_DEFAULT_REPO + '/README.md')) return null;
    return gitEnsureRepo(ctx, HOST, GIT_DEFAULT_REPO);
  }

  function gitHead(repo) {
    if (repo.detached) {
      for (var i = 0; i < repo.commits.length; i++) if (repo.commits[i].sha === repo.detached) return repo.commits[i];
      return null;
    }
    var sha = repo.branches[repo.branch];
    if (!sha) return null;
    for (var k = 0; k < repo.commits.length; k++) if (repo.commits[k].sha === sha) return repo.commits[k];
    return null;
  }

  function gitCommitBySha(repo, sha) {
    for (var i = 0; i < repo.commits.length; i++) if (repo.commits[i].sha === sha) return repo.commits[i];
    return null;
  }

  /* 工作区相对仓库根的路径 */
  function gitRepoRel(repoPath, cwd, arg) {
    var abs = resolvePath(cwd, arg);
    if (abs === repoPath) return '';
    if (abs.indexOf(repoPath + '/') !== 0) return null;
    return abs.slice(repoPath.length + 1);
  }

  function gitDisplayPath(repoPath, cwd, rel) {
    if (cwd === repoPath) return rel;
    var segs = segments(String(cwd).slice(repoPath.length));
    return new Array(segs.length + 1).join('../') + rel;
  }

  /* ---------- 逐行 LCS diff（教学文件都很小，够用） ---------- */
  function gitDiffOps(a, b) {
    var n = a.length, m = b.length, i, j;
    var dp = [];
    for (i = 0; i <= n; i++) {
      dp.push([]);
      for (j = 0; j <= m; j++) dp[i].push(0);
    }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ t: ' ', l: a[i], ai: i, bi: j }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: '-', l: a[i], ai: i, bi: j }); i++; }
      else { ops.push({ t: '+', l: b[j], ai: i, bi: j }); j++; }
    }
    while (i < n) { ops.push({ t: '-', l: a[i], ai: i, bi: j }); i++; }
    while (j < m) { ops.push({ t: '+', l: b[j], ai: i, bi: j }); j++; }
    return ops;
  }

  function gitHunks(ops, ctxLines) {
    var idxs = [], i;
    for (i = 0; i < ops.length; i++) if (ops[i].t !== ' ') idxs.push(i);
    if (!idxs.length) return [];
    var groups = [], cur = [idxs[0]];
    for (i = 1; i < idxs.length; i++) {
      if (idxs[i] - cur[cur.length - 1] <= ctxLines * 2 + 1) cur.push(idxs[i]);
      else { groups.push(cur); cur = [idxs[i]]; }
    }
    groups.push(cur);
    return groups.map(function (g) {
      var start = Math.max(0, g[0] - ctxLines);
      var end = Math.min(ops.length - 1, g[g.length - 1] + ctxLines);
      var slice = ops.slice(start, end + 1);
      var aStart = -1, bStart = -1, aLen = 0, bLen = 0;
      slice.forEach(function (o) {
        if (o.t !== '+') { if (aStart === -1) aStart = o.ai; aLen++; }
        if (o.t !== '-') { if (bStart === -1) bStart = o.bi; bLen++; }
      });
      return { header: '@@ -' + (aStart + 1) + ',' + aLen + ' +' + (bStart + 1) + ',' + bLen + ' @@', ops: slice };
    });
  }

  function gitDiffBlocks(relOld, relNew, aText, bText, statOnly) {
    var a = String(aText === undefined || aText === null ? '' : aText).replace(/\n$/, '').split('\n');
    var b = String(bText === undefined || bText === null ? '' : bText).replace(/\n$/, '').split('\n');
    if (aText === undefined || aText === null) a = [];
    if (bText === undefined || bText === null) b = [];
    var ops = gitDiffOps(a, b);
    var add = 0, del = 0;
    ops.forEach(function (o) { if (o.t === '+') add++; if (o.t === '-') del++; });
    if (!add && !del) return { lines: [], add: 0, del: 0 };
    if (statOnly) return { lines: [], add: add, del: del };
    var out = [];
    out.push('diff --git a/' + relOld + ' b/' + relNew);
    out.push('index ' + gitSha(String(aText)).slice(0, 7) + '..' + gitSha(String(bText)).slice(0, 7) + ' 100644');
    if (aText === undefined || aText === null) out.push('new file mode 100644');
    if (bText === undefined || bText === null) out.push('deleted file mode 100644');
    out.push('--- ' + (aText === undefined || aText === null ? '/dev/null' : 'a/' + relOld));
    out.push('+++ ' + (bText === undefined || bText === null ? '/dev/null' : 'b/' + relNew));
    gitHunks(ops, 3).forEach(function (h) {
      out.push(h.header);
      h.ops.forEach(function (o) { out.push(o.t + o.l); });
    });
    return { lines: out, add: add, del: del };
  }

  function gitStatBlock(rows) {
    var out = [], totalAdd = 0, totalDel = 0;
    var w = 0;
    rows.forEach(function (r) { if (r.rel.length > w) w = r.rel.length; });
    rows.forEach(function (r) {
      totalAdd += r.add; totalDel += r.del;
      var marks = '';
      for (var i = 0; i < r.add; i++) marks += '+';
      for (var i = 0; i < r.del; i++) marks += '-';
      out.push(' ' + pad(r.rel, w) + ' | ' + (r.add + r.del) + ' ' + marks);
    });
    out.push(' ' + rows.length + (rows.length === 1 ? ' file changed' : ' files changed') +
      (totalAdd ? ', ' + totalAdd + ' insertion' + (totalAdd > 1 ? 's' : '') + '(+)' : '') +
      (totalDel ? ', ' + totalDel + ' deletion' + (totalDel > 1 ? 's' : '') + '(-)' : ''));
    return out;
  }

  /* 当前比较对：工作区 / 索引 / HEAD 三者的差异 */
  function gitStatusData(ctx, repo) {
    var head = gitHead(repo);
    var headFiles = head && head.snapshot ? head.snapshot : {};
    var pats = gitIgnorePatterns(ctx, repo.path);
    var work = {}, all = gitWorkFiles(ctx, repo.path);
    Object.keys(all).forEach(function (p) { if (!gitIgnored(p, pats)) work[p] = all[p]; });

    var staged = [], notStaged = [], untracked = [];
    var seen = {};
    Object.keys(repo.index).forEach(function (p) {
      seen[p] = true;
      if (!(p in work)) notStaged.push({ rel: p, kind: 'deleted' });
      else if (work[p] !== repo.index[p]) notStaged.push({ rel: p, kind: 'modified' });
      else if (!(p in headFiles) || headFiles[p] !== repo.index[p]) {
        staged.push({ rel: p, kind: (p in headFiles) ? 'modified' : 'new file' });
      }
    });
    Object.keys(headFiles).forEach(function (p) {
      if (seen[p]) return;
      if (!(p in work)) notStaged.push({ rel: p, kind: 'deleted' });
      else if (work[p] !== headFiles[p]) notStaged.push({ rel: p, kind: 'modified' });
    });
    Object.keys(work).forEach(function (p) {
      if (!(p in repo.index) && !(p in headFiles)) untracked.push({ rel: p, kind: 'untracked' });
    });
    return { head: head, headFiles: headFiles, work: work, staged: staged, notStaged: notStaged, untracked: untracked };
  }

  function gitAheadBehind(repo) {
    var local = repo.branches[repo.branch];
    var remote = repo.remotes.origin.refs[repo.branch];
    if (!remote) return null;
    if (local === remote) return { ahead: 0, behind: 0 };
    var idx = function (sha) {
      for (var i = 0; i < repo.commits.length; i++) if (repo.commits[i].sha === sha) return i;
      return 9999;
    };
    var d = idx(remote) - idx(local);
    return d > 0 ? { ahead: d, behind: 0 } : { ahead: 0, behind: -d };
  }

  function gitDecorate(repo, commit) {
    var parts = [];
    if (gitHead(repo) === commit) {
      parts.push(repo.detached ? 'HEAD detached at ' + commit.sha.slice(0, 7) : 'HEAD -> ' + repo.branch);
    }
    Object.keys(repo.branches).forEach(function (b) {
      if (b !== repo.branch && repo.branches[b] === commit.sha) parts.push(b);
    });
    commit.tags.forEach(function (t) { parts.push('tag: ' + t); });
    Object.keys(repo.remotes.origin.refs).forEach(function (b) {
      if (repo.remotes.origin.refs[b] === commit.sha) parts.push('origin/' + b);
    });
    return parts.length ? ' (' + parts.join(', ') + ')' : '';
  }

  /* 分支名合法性（与真 git 的 check-ref-format 主要规则对齐）：
     不许 `..`、不许以 `-` 或 `.` 开头、不许以 `/` 或 `.lock` 结尾、
     不许出现 `//`、空格、`~^:?*[\` 以及控制字符。
     ⚠️ `..` 这条尤其要拦：`git init -b "bad..name"` 在真机上会被拒绝，
     而宽松的正则放它过去，学员就会以为"这样写可以"。 */
  function validBranchName(n) {
    var s = String(n);
    if (!s || s.length > 255) return false;
    if (!/^[A-Za-z0-9._\/-]+$/.test(s)) return false;
    if (s.indexOf('..') !== -1) return false;
    if (s.indexOf('//') !== -1) return false;
    if (/^[-.\/]/.test(s)) return false;
    if (/[.\/]$/.test(s)) return false;
    if (/\.lock$/.test(s)) return false;
    return true;
  }

  function gitParse(argv) {
    var o = { pos: [], flags: {}, n: null, msg: [], paths: [], dashdash: false, branch: null };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--') { o.dashdash = true; continue; }
      if (o.dashdash) { o.pos.push(a); o.paths.push(a); continue; }
      if (a === '-m') { o.msg.push(String(argv[++i])); continue; }
      if (/^-m./.test(a)) { o.msg.push(a.slice(2)); continue; }
      /* ⚠️ `-b <分支名>` 是**带值**选项，必须连值一起吃掉。
         早先它落进下面"按字符拆开"的通用分支，于是 `git init -b main myapp` 变成
         flags['b']=true + 位置参数 ['main','myapp'] —— init 取 pos[0] 当目录，
         **在 /root/main 建了仓库**，而学员要的 myapp 目录根本不存在，
         紧接着的 `cd myapp` 就报 No such file。真机上这是极常见的一条命令。 */
      if (a === '-b' || a === '--initial-branch') { o.branch = String(argv[++i]); continue; }
      if (/^--initial-branch=/.test(a)) { o.branch = a.slice(17); continue; }
      if (/^-b./.test(a)) { o.branch = a.slice(2); continue; }
      /* -am "说明" 这种"合并短选项 + 末位取参数"的写法（真机很常见） */
      var cm = a.match(/^-([a-zA-Z]*)m(.*)$/);
      if (cm) {
        cm[1].split('').forEach(function (c) { o.flags[c] = true; });
        o.msg.push(cm[2] !== '' ? cm[2] : String(argv[++i]));
        continue;
      }
      if (a === '-n' || a === '--max-count') { o.n = Number(argv[++i]); continue; }
      if (/^-n\d+$/.test(a)) { o.n = Number(a.slice(2)); continue; }
      if (/^--max-count=\d+$/.test(a)) { o.n = Number(a.slice(14)); continue; }
      if (/^-\d+$/.test(a)) { o.n = Number(a.slice(1)); continue; }
      if (a.charAt(0) === '-' && a.length > 1) {
        /* --oneline / -u / -s 这类可以合并写，按字符拆开 */
        if (a.indexOf('--') === 0) o.flags[a.slice(2)] = true;
        else a.slice(1).split('').forEach(function (c) { o.flags[c] = true; });
        continue;
      }
      o.pos.push(a);
    }
    return o;
  }

  CMDS.git = function (argv, ctx, stdin, HOST) {
    var sub = argv[0];
    if (sub === '--version' || sub === '-v' || sub === 'version') return ok(['git version ' + GIT_VERSION]);
    if (!sub) {
      return ok([
        'usage: git <命令> [<参数>]',
        '',
        '教学环境实现了：status  log  diff  add  commit  branch  checkout  switch',
        '                remote  tag  push  init  config  restore',
        '没实现的：reset / stash / merge / rebase / fetch / pull / clone（会说明原因）'
      ]);
    }
    if (GIT_NOT_IMPL[sub]) return fail(['（教学环境未实现）git ' + sub + '：' + GIT_NOT_IMPL[sub]]);

    var o = gitParse(argv.slice(1));
    gitMaterializeDefault(ctx, HOST, ctx.cwd);

    /* ---------- init：在 cwd 建一个空仓库 ---------- */
    if (sub === 'init') {
      var initPath = o.pos[0] ? resolvePath(ctx.cwd, o.pos[0]) : ctx.cwd;
      /* 初始分支名：默认 main（本站基准主机就是 main），`-b` 可指定 */
      var initBranch = o.branch || 'main';
      if (!validBranchName(initBranch)) {
        return fail(['fatal: \'' + initBranch + '\' is not a valid branch name']);
      }
      ensureDir(ctx, initPath);
      gitMaterializeDefault(ctx, HOST, initPath);
      var stAny = stateOf(ctx.root, 'git', { repos: {} });
      /* 已经存在的仓库只"重新初始化"，绝不清空历史（真机行为，也避免手滑丢代码） */
      var initBrObj = {};
      initBrObj[initBranch] = null;
      if (findNode(ctx.root, initPath + '/.git')) {
        if (!stAny.repos[initPath]) {
          stAny.repos[initPath] = {
            path: initPath, branch: initBranch, detached: null, unborn: true,
            branches: initBrObj, commits: [], index: {}, tags: {},
            remotes: { origin: { url: GIT_URL, refs: {} } },
            config: { 'user.name': HOST.user || 'root', 'user.email': (HOST.user || 'root') + '@' + (HOST.hostname || 'localhost'), 'core.repositoryformatversion': '0' }
          };
        }
        return ok(['Reinitialized existing Git repository in ' + initPath + '/.git/']);
      }
      ensureDir(ctx, initPath + '/.git/refs/heads');
      ensureFile(ctx, initPath + '/.git/HEAD', 'ref: refs/heads/' + initBranch + '\n');
      var initBrObj2 = {};
      initBrObj2[initBranch] = null;
      stAny.repos[initPath] = {
        path: initPath, branch: initBranch, detached: null, unborn: true,
        branches: initBrObj2, commits: [], index: {}, tags: {},
        remotes: { origin: { url: GIT_URL, refs: {} } },
        config: { 'user.name': HOST.user || 'root', 'user.email': (HOST.user || 'root') + '@' + (HOST.hostname || 'localhost'), 'core.repositoryformatversion': '0' }
      };
      gitWriteGitDir(ctx, stAny.repos[initPath]);
      return ok(['Initialized empty Git repository in ' + initPath + '/.git/']);
    }

    /* ---------- config：可以先没有仓库 ---------- */
    if (sub === 'config') {
      var repoPathC = gitFindRepoPath(ctx) || (ctx.cwd.indexOf(GIT_DEFAULT_REPO) === 0 ? GIT_DEFAULT_REPO : null);
      if (!repoPathC) return fail(['fatal: not in a git directory']);
      var repoC = gitEnsureRepo(ctx, HOST, repoPathC);
      var argsC = o.pos.slice();
      var globalFlag = false;
      if (argsC[0] === '--global' || argsC[0] === '--local' || argsC[0] === '--system') { globalFlag = argsC[0] === '--global'; argsC.shift(); }
      var extraErr = globalFlag ? ['（教学环境只有仓库级配置：--global 会被当成当前仓库的设置）'] : [];
      if (argsC[0] === '--list' || argsC[0] === '-l' || argsC.length === 0) {
        var cfgLines = ['core.repositoryformatversion=0', 'core.filemode=true', 'core.bare=false'];
        Object.keys(repoC.config).forEach(function (k) {
          if (k.indexOf('core.') !== 0) cfgLines.push(k + '=' + repoC.config[k]);
        });
        return { out: cfgLines, err: extraErr, code: 0 };
      }
      if (argsC[0] === '--get') {
        var gk = argsC[1];
        if (repoC.config[gk] === undefined) return { out: [], err: extraErr, code: 1 };
        return { out: [repoC.config[gk]], err: extraErr, code: 0 };
      }
      if (argsC.length === 1) {
        if (repoC.config[argsC[0]] === undefined) return { out: [], err: extraErr, code: 1 };
        return { out: [repoC.config[argsC[0]]], err: extraErr, code: 0 };
      }
      repoC.config[argsC[0]] = argsC[1];
      return { out: [], err: extraErr, code: 0 };
    }

    /* 其余命令都必须在仓库里执行 */
    var repoPath = gitFindRepoPath(ctx);
    if (!repoPath) {
      return fail(['fatal: not a git repository (or any of the parent directories): .git',
        '（这台机器上的仓库在 ' + GIT_DEFAULT_REPO + '，先 cd ' + GIT_DEFAULT_REPO + '）']);
    }
    var repo = gitEnsureRepo(ctx, HOST, repoPath);
    var fileArg = function (rel) { return gitDisplayPath(repo.path, ctx.cwd, rel); };

    /* ---------- status ---------- */
    if (sub === 'status') {
      var d = gitStatusData(ctx, repo);
      var short = !!(o.flags.s || o.flags.short || o.flags.porcelain);
      if (short) {
        var rows = [];
        d.staged.forEach(function (x) {
          rows.push((x.kind === 'new file' ? 'A' : 'M') + '  ' + fileArg(x.rel));
        });
        d.notStaged.forEach(function (x) {
          rows.push((x.kind === 'deleted' ? ' D ' : ' M ') + fileArg(x.rel));
        });
        d.untracked.forEach(function (x) { rows.push('?? ' + fileArg(x.rel)); });
        return ok(rows);
      }
      var out = [repo.detached ? 'HEAD detached at ' + repo.detached.slice(0, 7) : 'On branch ' + repo.branch];
      if (repo.unborn) {
        out.push('');
        out.push('No commits yet');
      } else if (!repo.detached) {
        var ab = gitAheadBehind(repo);
        if (ab) {
          if (ab.ahead === 0 && ab.behind === 0) out.push("Your branch is up to date with 'origin/" + repo.branch + "'.");
          else if (ab.ahead > 0) {
            out.push("Your branch is ahead of 'origin/" + repo.branch + "' by " + ab.ahead + ' commit' + (ab.ahead > 1 ? 's' : '') + '.');
            out.push('  (use "git push" to publish your local commits)');
          } else {
            out.push("Your branch is behind 'origin/" + repo.branch + "' by " + ab.behind + ' commit' + (ab.behind > 1 ? 's' : '') + ', and can be fast-forwarded.');
          }
        }
      }
      if (d.staged.length) {
        out.push('');
        out.push('Changes to be committed:');
        out.push('  (use "git restore --staged <file>..." to unstage)');
        d.staged.forEach(function (x) { out.push('\t' + pad(x.kind + ':', 12) + fileArg(x.rel)); });
      }
      if (d.notStaged.length) {
        out.push('');
        out.push('Changes not staged for commit:');
        out.push('  (use "git add <file>..." to update what will be committed)');
        out.push('  (use "git restore <file>..." to discard changes in working directory)');
        d.notStaged.forEach(function (x) { out.push('\t' + pad(x.kind + ':', 12) + fileArg(x.rel)); });
      }
      if (d.untracked.length) {
        out.push('');
        out.push('Untracked files:');
        out.push('  (use "git add <file>..." to include in what will be committed)');
        d.untracked.forEach(function (x) { out.push('\t' + fileArg(x.rel)); });
      }
      if (!d.staged.length && !d.notStaged.length && !d.untracked.length) {
        out.push('');
        out.push('nothing to commit, working tree clean');
      } else if (!d.staged.length) {
        out.push('');
        if (d.notStaged.length) out.push('no changes added to commit (use "git add" and/or "git commit -a")');
        else out.push('nothing added to commit but untracked files present (use "git add" to track)');
      }
      return ok(out);
    }

    /* ---------- add ---------- */
    if (sub === 'add') {
      var dA = gitStatusData(ctx, repo);
      var addAll = !!(o.flags.A || o.flags.all);
      if (!o.pos.length && !addAll) {
        return fail(['Nothing specified, nothing added.', "hint: Maybe you wanted to say 'git add .'?"]);
      }
      var targets = [];
      if (addAll) Object.keys(dA.work).forEach(function (p) { targets.push(p); });
      o.pos.forEach(function (arg) {
        if (arg === '.' || arg === '-A' || arg === '--all' || arg === '*') {
          Object.keys(dA.work).forEach(function (p) { targets.push(p); });
          return;
        }
        var rel = gitRepoRel(repo.path, ctx.cwd, arg);
        if (rel === null) return;
        if (rel === '') { Object.keys(dA.work).forEach(function (p) { targets.push(p); }); return; }
        Object.keys(dA.work).forEach(function (p) {
          if (p === rel || p.indexOf(rel + '/') === 0) targets.push(p);
        });
      });
      if (!targets.length) return fail(["fatal: pathspec '" + (o.pos[0] || '-A') + "' did not match any files"]);
      targets.forEach(function (p) { repo.index[p] = dA.work[p]; });
      return ok([]);
    }

    /* ---------- commit ---------- */
    if (sub === 'commit') {
      var dC = gitStatusData(ctx, repo);
      var willStage = !!o.flags.a;
      if (willStage) {
        dC.notStaged.forEach(function (x) {
          if (x.kind === 'modified') repo.index[x.rel] = dC.work[x.rel];
          if (x.kind === 'deleted') delete repo.index[x.rel];
        });
        dC = gitStatusData(ctx, repo);
      }
      if (!o.msg.length) {
        return fail(['（教学环境不模拟交互式编辑器：真机 git commit 会打开 vim 让你写提交信息）', '请用 git commit -m "提交说明" 一行完成']);
      }
      if (!dC.staged.length) {
        var nothing = [repo.detached ? 'HEAD detached at ' + repo.detached.slice(0, 7) : 'On branch ' + repo.branch];
        if (dC.notStaged.length) {
          nothing.push('Changes not staged for commit:');
          dC.notStaged.forEach(function (x) { nothing.push('\t' + pad(x.kind + ':', 12) + fileArg(x.rel)); });
          nothing.push('');
          nothing.push('no changes added to commit (use "git add" and/or "git commit -a")');
        } else if (dC.untracked.length) {
          nothing.push('Untracked files:');
          dC.untracked.forEach(function (x) { nothing.push('\t' + fileArg(x.rel)); });
          nothing.push('');
          nothing.push('nothing added to commit but untracked files present (use "git add" to track)');
        } else {
          nothing.push('nothing to commit, working tree clean');
        }
        return { out: nothing, err: [], code: 1 };
      }
      var msg = o.msg.join(' ');
      var snapshot = {};
      Object.keys(repo.index).forEach(function (k) { snapshot[k] = repo.index[k]; });
      var parent = gitHead(repo);
      var sha = gitSha(msg + '|' + NOW + '|' + (parent ? parent.sha : 'root') + '|' + Object.keys(snapshot).join(','));
      var commit = {
        sha: sha, msg: msg, author: repo.config['user.name'], email: repo.config['user.email'],
        date: NOW, snapshot: snapshot, parent: parent ? parent.sha : null, tags: []
      };
      repo.commits.unshift(commit);
      repo.unborn = false;
      if (repo.detached) repo.detached = sha;
      else repo.branches[repo.branch] = sha;
      var statRows = [], sumAdd = 0, sumDel = 0;
      var base = parent && parent.snapshot ? parent.snapshot : {};
      Object.keys(snapshot).forEach(function (p) {
        if (base[p] === snapshot[p]) return;
        var blk = gitDiffBlocks(p, p, base[p], snapshot[p]);
        statRows.push({ rel: p, add: blk.add, del: blk.del });
        sumAdd += blk.add; sumDel += blk.del;
      });
      Object.keys(base).forEach(function (p) {
        if (snapshot[p] !== undefined) return;
        statRows.push({ rel: p, add: 0, del: String(base[p]).split('\n').length });
        sumDel += statRows[statRows.length - 1].del;
      });
      var cOut = ['[' + (repo.detached ? 'detached HEAD ' + sha.slice(0, 7) : repo.branch + ' ' + sha.slice(0, 7)) + '] ' + msg];
      cOut.push(' ' + statRows.length + (statRows.length === 1 ? ' file changed' : ' files changed') +
        (sumAdd ? ', ' + sumAdd + ' insertion' + (sumAdd > 1 ? 's' : '') + '(+)' : '') +
        (sumDel ? ', ' + sumDel + ' deletion' + (sumDel > 1 ? 's' : '') + '(-)' : ''));
      Object.keys(snapshot).forEach(function (p) {
        if (base[p] === undefined) cOut.push(' create mode 100644 ' + p);
      });
      gitWriteGitDir(ctx, repo);
      return ok(cOut);
    }

    /* ---------- log ---------- */
    if (sub === 'log') {
      var dL = gitHead(repo);
      if (!dL) return fail(['fatal: your current branch \'' + repo.branch + '\' does not have any commits yet']);
      var n = o.n === null ? repo.commits.length : o.n;
      var shown = repo.commits.slice(0, n);
      var outL = [];
      shown.forEach(function (c) {
        if (o.flags.oneline) {
          outL.push(c.sha.slice(0, 7) + gitDecorate(repo, c) + ' ' + c.msg);
        } else {
          outL.push('commit ' + c.sha + gitDecorate(repo, c));
          outL.push('Author: ' + c.author + ' <' + c.email + '>');
          outL.push('Date:   ' + gitDates(c.date));
          outL.push('');
          outL.push('    ' + c.msg);
          outL.push('');
        }
      });
      return ok(outL);
    }

    /* ---------- diff ---------- */
    if (sub === 'diff') {
      var dD = gitStatusData(ctx, repo);
      var useCached = !!(o.flags.cached || o.flags.staged);
      var vsHead = o.pos[0] === 'HEAD' || o.pos[0] === 'head';
      var pairs = [];
      if (useCached) {
        Object.keys(repo.index).forEach(function (p) {
          if (dD.headFiles[p] !== repo.index[p]) pairs.push({ rel: p, a: dD.headFiles[p], b: repo.index[p] });
        });
      } else if (vsHead) {
        var allPaths = {};
        Object.keys(dD.headFiles).forEach(function (p) { allPaths[p] = 1; });
        Object.keys(dD.work).forEach(function (p) { allPaths[p] = 1; });
        Object.keys(allPaths).forEach(function (p) {
          if (dD.headFiles[p] !== dD.work[p]) pairs.push({ rel: p, a: dD.headFiles[p], b: dD.work[p] });
        });
      } else {
        dD.notStaged.forEach(function (x) {
          pairs.push({ rel: x.rel, a: repo.index[x.rel], b: dD.work[x.rel] });
        });
      }
      var outD = [], statRowsD = [];
      pairs.forEach(function (pr) {
        var blk = gitDiffBlocks(pr.rel, pr.rel, pr.a, pr.b, !!o.flags.stat);
        if (!blk.add && !blk.del) return;
        statRowsD.push({ rel: pr.rel, add: blk.add, del: blk.del });
        outD = outD.concat(blk.lines);
      });
      if (o.flags.stat) return ok(gitStatBlock(statRowsD.length ? statRowsD : []));
      return ok(outD);
    }

    /* ---------- branch ---------- */
    if (sub === 'branch') {
      var dBr = gitHead(repo);
      if (!o.pos.length) {
        var names = Object.keys(repo.branches).sort();
        var outB = names.map(function (b) {
          return (b === repo.branch && !repo.detached ? '* ' : '  ') + b;
        });
        if (o.flags.a || o.flags.all) {
          Object.keys(repo.remotes.origin.refs).sort().forEach(function (b) {
            outB.push('  remotes/origin/' + b);
          });
        }
        return ok(outB);
      }
      if (o.flags.d || o.flags.D) {
        var del = o.pos[0];
        if (del === repo.branch) return fail(["error: Cannot delete branch '" + del + "' checked out at '" + repo.path + "'"]);
        if (repo.branches[del] === undefined) return fail(["error: branch '" + del + "' not found"]);
        var was = repo.branches[del];
        delete repo.branches[del];
        return ok(["Deleted branch " + del + " (was " + was.slice(0, 7) + ")."]);
      }
      var newBr = o.pos[0];
      if (!/^[A-Za-z0-9._\/-]+$/.test(newBr) || /^[-.]/.test(newBr) || /\/$/.test(newBr)) {
        return fail(["fatal: '" + newBr + "' is not a valid branch name"]);
      }
      if (repo.branches[newBr] !== undefined) return fail(["fatal: a branch named '" + newBr + "' already exists"]);
      if (!dBr) return fail(['fatal: not a valid object name: ' + repo.branch]);
      repo.branches[newBr] = dBr.sha;
      gitWriteGitDir(ctx, repo);
      return ok([]);
    }

    /* ---------- checkout / switch ---------- */
    if (sub === 'checkout' || sub === 'switch') {
      /* `-b` 现在由 gitParse 收进 o.branch（它是带值选项），
         `-c`（git switch -c）仍走 flags —— 两条要一起认，
         否则 `git checkout -b release/1.2.4` 会掉到下面"没给分支名"那句。 */
      if (o.branch !== null || o.flags.b || o.flags.c) {
        var nb = o.branch || o.pos[0];
        if (!nb) return fail(['fatal: missing branch name']);
        if (!validBranchName(nb)) {
          return fail(["fatal: '" + nb + "' is not a valid branch name"]);
        }
        if (repo.branches[nb] !== undefined) return fail(["fatal: a branch named '" + nb + "' already exists"]);
        var cur = gitHead(repo);
        /* ⚠️ **还没有任何提交**的仓库（unborn）也要允许建分支。
           真机行为：`git init x && cd x && git checkout -b foo` 会说
           "Switched to a new branch 'foo'"（此时只是给"尚未诞生的分支"改个名）。
           早先这里硬要求 `gitHead` 有值，于是报 `fatal: not a valid object name: main`
           —— 而 main 根本还没诞生，这条报错没有任何指导意义。
           站内 ci-git-init 的示例正是"刚 init 就切分支"的流程。 */
        if (!cur) {
          delete repo.branches[repo.branch];
          repo.branches[nb] = null;
          repo.branch = nb;
          repo.unborn = true;
          ensureFile(ctx, repo.path + '/.git/HEAD', 'ref: refs/heads/' + nb + '\n');
          gitWriteGitDir(ctx, repo);
          return ok(["Switched to a new branch '" + nb + "'"]);
        }
        repo.branches[nb] = cur.sha;
        repo.branch = nb;
        repo.detached = null;
        gitWriteGitDir(ctx, repo);
        return ok(["Switched to a new branch '" + nb + "'"]);
      }
      var target = o.pos[0];
      if (!target) return fail(['fatal: you must specify a branch or a path']);
      /* 分支优先：`git checkout release/1.2` 里的斜杠是分支名的一部分，不是路径。
         真机也是"能解析成分支就先当分支"（有歧义时才提示）。 */
      if (!o.dashdash && repo.branches[target] !== undefined) {
        repo.branch = target;
        repo.detached = null;
        var swOut = ["Switched to branch '" + target + "'"];
        var ab2 = gitAheadBehind(repo);
        if (ab2 && ab2.ahead === 0 && ab2.behind === 0) swOut.push("Your branch is up to date with 'origin/" + target + "'.");
        gitWriteGitDir(ctx, repo);
        return { out: swOut, err: ['（教学环境）切换分支不会重写工作区文件；真机上 git checkout 会把工作区换成目标分支的快照'], code: 0 };
      }
      /* git checkout -- <文件> / git checkout <文件>：把工作区文件还原成索引里的版本 */
      var relCO = gitRepoRel(repo.path, ctx.cwd, target);
      if (relCO !== null && repo.index[relCO] !== undefined) {
        ensureFile(ctx, repo.path + '/' + relCO, repo.index[relCO]);
        return { out: [], err: ['（教学环境）git checkout -- <文件> 成功时没有任何输出：文件已还原为暂存区的版本'], code: 0 };
      }
      return fail(["error: pathspec '" + target + "' did not match any file(s) known to git"]);
    }

    /* ---------- restore ---------- */
    if (sub === 'restore') {
      var relR = gitRepoRel(repo.path, ctx.cwd, o.pos[0] || '');
      if (relR === null || (repo.index[relR] === undefined && repo.index[relR] !== '')) {
        return fail(["error: pathspec '" + (o.pos[0] || '') + "' did not match any file(s) known to git"]);
      }
      if (o.flags.staged) {
        var dR = gitStatusData(ctx, repo);
        if (dR.headFiles[relR] === undefined) delete repo.index[relR];
        else repo.index[relR] = dR.headFiles[relR];
        return ok([]);
      }
      ensureFile(ctx, repo.path + '/' + relR, repo.index[relR]);
      return { out: [], err: ['（教学环境）git restore <文件> 成功时没有任何输出：丢弃工作区改动，回到暂存区版本'], code: 0 };
    }

    /* ---------- remote ---------- */
    if (sub === 'remote') {
      if (o.flags.v || !o.pos.length) {
        var outR = [];
        Object.keys(repo.remotes).forEach(function (name) {
          outR.push(name + '\t' + repo.remotes[name].url + ' (fetch)');
          outR.push(name + '\t' + repo.remotes[name].url + ' (push)');
        });
        return ok(outR);
      }
      if (o.pos[0] === 'add') {
        var rn2 = o.pos[1], ru = o.pos[2];
        if (!rn2 || !ru) return fail(['usage: git remote add <名字> <URL>']);
        if (repo.remotes[rn2]) return fail(["error: remote " + rn2 + " already exists."]);
        repo.remotes[rn2] = { url: ru, refs: {} };
        return ok([]);
      }
      if (o.pos[0] === 'remove' || o.pos[0] === 'rm') {
        if (!repo.remotes[o.pos[1]]) return fail(["error: No such remote: '" + o.pos[1] + "'"]);
        delete repo.remotes[o.pos[1]];
        return ok([]);
      }
      return fail(["error: Unknown subcommand: " + o.pos[0]]);
    }

    /* ---------- tag ---------- */
    if (sub === 'tag') {
      var tagArgs = o.pos.slice();
      if (o.flags.l && !tagArgs.length) tagArgs.push('*');
      if (!tagArgs.length) {
        return ok(Object.keys(repo.tags).sort());
      }
      if (o.flags.d) {
        var dt = tagArgs[0];
        if (repo.tags[dt] === undefined) return fail(["error: tag '" + dt + "' not found."]);
        var wasSha = repo.tags[dt];
        delete repo.tags[dt];
        repo.commits.forEach(function (c) { c.tags = c.tags.filter(function (t) { return t !== dt; }); });
        return ok(["Deleted tag '" + dt + "' (was " + wasSha.slice(0, 7) + ")"]);
      }
      /* git tag -l 'v1.2.*' 是列出，不是创建 */
      if (o.flags.l) {
        var reTag = globToRe(tagArgs[0]);
        return ok(Object.keys(repo.tags).filter(function (t) { return reTag.test(t); }).sort());
      }
      if (repo.tags[tagArgs[0]] !== undefined) return fail(["fatal: tag '" + tagArgs[0] + "' already exists"]);
      var headT = gitHead(repo);
      if (!headT) return fail(['fatal: Failed to resolve \'HEAD\' as a valid ref.']);
      if (o.flags.a && !o.msg.length) return fail(['fatal: no tag message?（-a 打附注标签要跟 -m "说明"）']);
      if (!/^[A-Za-z0-9._\/-]+$/.test(tagArgs[0])) return fail(["fatal: '" + tagArgs[0] + "' is not a valid tag name."]);
      repo.tags[tagArgs[0]] = headT.sha;
      headT.tags.push(tagArgs[0]);
      gitWriteGitDir(ctx, repo);
      return ok([]);
    }

    /* ---------- push ---------- */
    if (sub === 'push') {
      var remoteName = 'origin';
      var pushBranch = repo.branch;
      o.pos.forEach(function (a) {
        if (repo.remotes[a]) { remoteName = a; return; }
        if (a === '-u' || a === '--set-upstream') return;
        if (repo.branches[a] !== undefined) pushBranch = a;
      });
      if (!repo.remotes[remoteName]) return fail(["fatal: '" + remoteName + "' does not appear to be a git repository"]);
      if (repo.unborn) return fail(['error: src refspec ' + pushBranch + ' does not match any']);
      var localSha = repo.branches[pushBranch];
      var remoteSha = repo.remotes[remoteName].refs[pushBranch];
      if (localSha === remoteSha) return ok(['Everything up-to-date']);
      var count = gitAheadBehind(repo);
      var outP = [
        'Enumerating objects: ' + (count ? count.ahead + 4 : 5) + ', done.',
        'Counting objects: 100% (' + (count ? count.ahead + 4 : 5) + '/' + (count ? count.ahead + 4 : 5) + '), done.',
        'Delta compression using up to 2 threads',
        'Compressing objects: 100% (3/3), done.',
        'Writing objects: 100% (3/3), 682 bytes | 682.00 KiB/s, done.',
        'Total 3 (delta 1), reused 0 (delta 0), pack-reused 0',
        'To ' + repo.remotes[remoteName].url
      ];
      outP.push('   ' + (remoteSha ? remoteSha.slice(0, 7) : '0000000') + '..' + localSha.slice(0, 7) + '  ' + pushBranch + ' -> ' + pushBranch);
      repo.remotes[remoteName].refs[pushBranch] = localSha;
      gitWriteGitDir(ctx, repo);
      if (o.flags.u) outP.push("branch '" + pushBranch + "' set up to track '" + remoteName + '/' + pushBranch + "'.");
      return ok(outP);
    }

    return fail(["git: '" + sub + "' is not a git command. See 'git --help'."]);
  };

  /* ---------- 帮助与元命令 ---------- */
  CMDS.help = function (argv, ctx, stdin, HOST) {
    return ok([
      '这是一个浏览器内的模拟终端，支持以下命令（都是仿真实现）：',
      '',
      '  文件：   ls  cd  pwd  cat  head  tail  mkdir  touch  rm  cp  mv  ln  find  stat  file  wc  du  df  tar  md5sum',
      '  文本：   grep  sed  awk  sort  uniq  cut  tr  jq  echo',
      '  系统：   systemctl  journalctl  crontab  ps  top  free  vmstat  iostat  uptime  date  uname  hostname  id  whoami  w  last  env  export  which  kill',
      '  网络：   ip  ss  lsof  curl  ping  telnet  nc  dig  nslookup  traceroute  tcpdump  firewall-cmd',
      '  容器：   docker（ps/images/logs/inspect/stats/volume/network/system/info/compose/pull/push）',
      '  编排：   kubectl（get/describe/logs/top/apply/rollout/scale/exec/auth/cordon/drain/delete/set/explain/config/version）',
      '  发布：   helm（version/list/repo/search/install/upgrade/rollback/history/status/get/template/uninstall/lint/show）',
      '  数据：   mysql（SHOW/SELECT/information_schema 子集）  redis-cli（ping/info/dbsize/keys/scan/get/set/config/memory/--bigkeys）',
      '  中间件： nginx（-t/-T/-s/-v/-V，真解析 /etc/nginx/nginx.conf）',
      '  版本控制：git（status/log/diff/add/commit/branch/checkout/remote/tag/push/init/config/restore）',
      '  华为云： hcloud（configure/ECS/VPC）  obsutil（ls/cp/sync/config）',
      '  其他：   clear  history  help',
      '',
      '支持：引号、管道 |、重定向 > >>、$变量、&& 顺序执行',
      '不支持：真正的执行、交互式程序（vi/top 实时刷新）、需要真实网络的命令'
    ]);
  };

  CMDS.history = function (argv, ctx, stdin, HOST) {
    /* ⚠️ 历史记录挂在 shell 实例上（`ctx.shell.history`），ctx 本身没有 history 字段。
       早先这里读 `ctx.history` —— 一句 `history` 直接抛
       `Cannot read properties of undefined (reading 'map')`，**崩的是引擎而不是命令**，
       学员看到的是整条命令没了反应。`history 20` 这种带参数的写法也一样要支持。 */
    var list = (ctx.shell && ctx.shell.history) || ctx.history || [];
    var n = 0;
    for (var i = 0; i < argv.length; i++) {
      if (/^\d+$/.test(argv[i])) n = Number(argv[i]);
      else if (argv[i] === '-c') { list.length = 0; return ok([]); }
    }
    var show = n > 0 ? list.slice(-n) : list;
    var start = n > 0 ? Math.max(1, list.length - n + 1) : 1;
    return ok(show.map(function (h, i) { return '  ' + (start + i) + '  ' + h; }));
  };

  CMDS.clear = function (argv, ctx, stdin, HOST) { return { out: [], err: [], code: 0, clear: true }; };

  CMDS.exit = function (argv, ctx, stdin, HOST) { return ok(['（教学环境里不需要退出 —— 刷新页面即可重置）']); };

  /* ==========================================================================
     控制流与脚本编程要用的**内建命令**
     --------------------------------------------------------------------------
     `[ ]` / `test` / `[[ ]]` / `printf` / `read` / `seq` / `basename` / `dirname` /
     `command -v` / `mktemp` / `true` / `false` / `:` / `shift` / `break` /
     `continue` / `exit` 这些是写 Shell 脚本绕不开的。分类 06 的 36 条内容里
     约 40 条示例都会用到；早先引擎一个都没有，学员照着文档敲只会得到
     `bash: for: command not found`。
     只补真正缺的：`exit` 早先有（只会打印一句提示），这里改成真语义。
     ========================================================================== */

  /* ---------- printf ---------- */
  function padNum(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function fmtPrintfOne(spec, arg) {
    var m = spec.match(/^%([-+ 0#]*)(\d*)(?:\.(\d+))?([sdiouxXeEfFgGc%])$/);
    if (!m) return spec;
    if (m[4] === '%') return '%';
    var flags = m[1] || '', width = m[2] ? Number(m[2]) : 0;
    var prec = m[3] !== undefined ? Number(m[3]) : -1;
    var conv = m[4], out;
    var num = Number(arg);
    if (isNaN(num)) num = 0;
    if (conv === 's') {
      if (prec >= 0) out = String(arg).slice(0, prec);
      else out = (arg === undefined ? '' : String(arg));
    } else if (conv === 'c') {
      out = (arg === undefined ? '' : String(arg)).charAt(0);
    } else if (conv === 'd' || conv === 'i') {
      out = String(Math.trunc(num));
    } else if (conv === 'u') {
      out = String(Math.abs(Math.trunc(num)));
    } else if (conv === 'o') {
      out = Math.abs(Math.trunc(num)).toString(8);
    } else if (conv === 'x' || conv === 'X') {
      out = Math.abs(Math.trunc(num)).toString(16);
      if (conv === 'X') out = out.toUpperCase();
    } else if (conv === 'f' || conv === 'F') {
      out = num.toFixed(prec >= 0 ? prec : 6);
    } else if (conv === 'e' || conv === 'E') {
      out = num.toExponential(prec >= 0 ? prec : 6);
      if (conv === 'E') out = out.toUpperCase();
    } else {
      out = String(num);
    }
    if (flags.indexOf('+') !== -1 && conv !== 's' && conv !== 'c' && num >= 0) out = '+' + out;
    while (out.length < width) {
      if (flags.indexOf('-') !== -1) out = out + ' ';
      else if (flags.indexOf('0') !== -1 && conv !== 's' && conv !== 'c') {
        out = (out.charAt(0) === '-' || out.charAt(0) === '+')
          ? out.charAt(0) + '0' + out.slice(1)
          : '0' + out;
      } else out = ' ' + out;
    }
    return out;
  }

  function printfFormat(fmt, args) {
    var out = '', ai = 0, any = false;
    for (var i = 0; i < fmt.length; i++) {
      var c = fmt.charAt(i);
      if (c === '\\' && i + 1 < fmt.length) {
        var e = fmt.charAt(i + 1);
        if (e === 'n') { out += '\n'; i++; continue; }
        if (e === 't') { out += '\t'; i++; continue; }
        if (e === 'r') { out += '\r'; i++; continue; }
        if (e === '\\') { out += '\\'; i++; continue; }
        if (e === '0') {
          var oct = fmt.slice(i + 2, i + 5).match(/^[0-7]{1,3}/);
          if (oct) { out += String.fromCharCode(parseInt(oct[0], 8)); i += 1 + oct[0].length; continue; }
        }
        out += '\\'; continue;
      }
      if (c !== '%') { out += c; continue; }
      var rest = fmt.slice(i);
      var mm = rest.match(/^%[-+ 0#]*\d*(?:\.\d+)?[sdiouxXeEfFgGc%]/);
      if (!mm) { out += '%'; continue; }
      var spec = mm[0];
      if (spec === '%%') { out += '%'; i += 1; continue; }
      var a = args[ai++];
      any = true;
      out += fmtPrintfOne(spec, a === undefined ? '' : a);
      i += spec.length - 1;
    }
    return { text: out, used: ai, hadSpec: any };
  }

  function shellQuoteForErr(s) { return "'" + String(s) + "'"; }

  /* ---------- `[ ]` / `test` / `[[ ]]` 的表达式求值 ---------- */
  /* 双目/单目运算符表：既用于求值，也用于**分词**。
     为什么分词需要它：`[ 1 -lt 2 ]` 在到达这里之前已经被拆成 argv，
     而 argv 是用"按空格切"的老办法拆的 —— 它会把 `1 -lt 2` 当成一个词。
     于是 `evalTestTokens` 看到的 toks 只有一项，`toks[p+1]`/`toks[p+2]` 取不到
     运算符与右操作数，整个表达式被判为"语法错误"：
       `[ 1 -lt 2 ]`  → bash: [: 1 -lt 2: 表达式语法错误
       `while [ $i -lt 3 ]` → 一次都不进循环 / 或者撞 1000 次上限
     所以这里必须自己把运算符切出来（`-` 不作为普通词的边界，否则 `-5`、
     `--help` 这类正常参数会被切坏）。 */
  var TEST_OPS = {
    '=': 1, '==': 1, '!=': 1, '=~': 1, '<': 1, '>': 1,
    '-eq': 1, '-ne': 1, '-gt': 1, '-ge': 1, '-lt': 1, '-le': 1,
    '-nt': 1, '-ot': 1, '-ef': 1, '-a': 1, '-o': 1
  };
  var TEST_UNARY = ['-e', '-f', '-d', '-L', '-h', '-s', '-r', '-w', '-x', '-z', '-n'];

  function testTokenize(s) {
    var line = String(s), out = [], i = 0;
    function isOpEnd(ch) { return ch === undefined || ' \t"\'()!<>=,;'.indexOf(ch) !== -1; }
    while (i < line.length) {
      var c = line.charAt(i);
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '"' || c === "'") {
        var buf = '', q = c; i++;
        while (i < line.length && line.charAt(i) !== q) { buf += line.charAt(i); i++; }
        i++;
        out.push(buf);
        continue;
      }
      var two = line.substr(i, 2);
      if (two === '&&' || two === '||' || two === '==' || two === '!=' || two === '=~' ||
        two === '<=' || two === '>=') { out.push(two); i += 2; continue; }
      if ('()!<>=,;'.indexOf(c) !== -1) { out.push(c); i++; continue; }
      /* `-lt` / `-f` 这类运算符：整词匹配才切出来 */
      if (c === '-') {
        var opw = '';
        while (i < line.length && ' \t"\'()!<>=,;'.indexOf(line.charAt(i)) === -1) { opw += line.charAt(i); i++; }
        if (TEST_OPS[opw] || TEST_UNARY.indexOf(opw) !== -1) { out.push(opw); continue; }
        out.push(opw);            /* 不是运算符（如 -5、--help）就原样当一个词 */
        continue;
      }
      var w = '';
      while (i < line.length && !isOpEnd(line.charAt(i))) { w += line.charAt(i); i++; }
      out.push(w);
    }
    return out;
  }

  /* 单目测试运算符 */
  var UNARY_TESTS = {
    '-e': function (p, ctx) { return nodeAt(ctx, p) !== null; },
    '-f': function (p, ctx) { var n = nodeAt(ctx, p); return !!n && n.type === 'file'; },
    '-d': function (p, ctx) { var n = nodeAt(ctx, p); return !!n && n.type === 'dir'; },
    '-L': function (p, ctx) { var n = nodeAt(ctx, p); return !!n && n.type === 'link'; },
    '-h': function (p, ctx) { var n = nodeAt(ctx, p); return !!n && n.type === 'link'; },
    '-s': function (p, ctx) { var n = nodeAt(ctx, p); return !!n && nodeSizeForTest(n) > 0; },
    '-r': function (p, ctx) { var n = nodeAt(ctx, p); return !!n && permBit(n, 4); },
    '-w': function (p, ctx) { var n = nodeAt(ctx, p); return !!n && permBit(n, 2); },
    '-x': function (p, ctx) { var n = nodeAt(ctx, p); return !!n && permBit(n, 1); },
    '-z': function (p) { return String(p) === ''; },
    '-n': function (p) { return String(p) !== ''; }
  };

  function nodeSizeForTest(n) {
    if (n.explicitSize !== undefined) return n.explicitSize;
    return String(n.content || '').length;
  }

  function permBit(n, bit) {
    var mode = String(n.mode || '644');
    if (mode.length === 4) mode = mode.slice(1);
    var who = Number(mode.charAt(mode.length - 3)) || 0;
    return (who & bit) !== 0;
  }

  function nodeAt(ctx, p) {
    var abs = resolvePath(ctx.cwd, String(p));
    var n = findNode(ctx.root, abs);
    var hops = 0;
    while (n && n.type === 'link' && hops < 8) {
      var t = String(n.target || '');
      var tAbs = t.charAt(0) === '/' ? t : resolvePath(parentOf(abs), t);
      n = findNode(ctx.root, tAbs);
      hops++;
    }
    return n || null;
  }

  function cmpInt(a, b) {
    var x = Number(a), y = Number(b);
    return { ok: !isNaN(x) && !isNaN(y), x: x, y: y };
  }

  function evalTestTokens(toks, ctx, allowRegex) {
    var p = 0;
    function peek() { return p < toks.length ? toks[p] : null; }
    function primary() {
      var t = peek();
      if (t === null) return null;
      if (t === '!') { p++; var v = primary(); return v === null ? null : !v; }
      if (t === '(') {
        p++;
        var r = orExpr();
        if (r === null || peek() !== ')') return null;
        p++;
        return r;
      }
      /* 单目测试 */
      if (UNARY_TESTS[t] && p + 1 < toks.length) {
        var arg = toks[p + 1];
        p += 2;
        return UNARY_TESTS[t](arg, ctx);
      }
      /* 双目：toks[p] 是左操作数（上面的 `t`），toks[p+1] 是运算符，
         toks[p+2] 才是右操作数。这里曾经把后两者取反了
         （`a = toks[p+1]`、`op = toks[p+2]`），后果是**静默判错**而不是报错：
           `[ "$A" = web ]` → 拿 '=' 当模式去匹配字符串 'web' → 恒为假
           `[ 1 -lt 2 ]`    → 运算符位置是 '2'，落进"单个词非空即真"分支 → 恒为真
         两者都不报错，所以闸门全绿也发现不了 —— 这正是最难查的一类 bug。 */
      if (p + 2 < toks.length) {
        var op = toks[p + 1], a = toks[p + 2];
        if (/^-([a-zA-Z]+)$/.test(op)) {
          if (['=', '==', '!=', '=~', '<', '>', '-eq', '-ne', '-gt', '-ge', '-lt', '-le',
            '-nt', '-ot', '-ef'].indexOf(op) === -1) return null;
        }
        if (op === '=' || op === '==') { p += 3; return globMatchFull(a, t); }
        if (op === '!=') { p += 3; return !globMatchFull(a, t); }
        if (op === '=~') {
          p += 3;
          if (!allowRegex) return null;
          try { return new RegExp(a).test(t); } catch (e) { return false; }
        }
        if (op === '<') { p += 3; return t < a; }
        if (op === '>') { p += 3; return t > a; }
        if (op === '-eq') { p += 3; var c2 = cmpInt(t, a); return c2.ok && c2.x === c2.y; }
        if (op === '-ne') { p += 3; var c3 = cmpInt(t, a); return c3.ok && c3.x !== c3.y; }
        if (op === '-gt') { p += 3; var c4 = cmpInt(t, a); return c4.ok && c4.x > c4.y; }
        if (op === '-ge') { p += 3; var c5 = cmpInt(t, a); return c5.ok && c5.x >= c5.y; }
        if (op === '-lt') { p += 3; var c6 = cmpInt(t, a); return c6.ok && c6.x < c6.y; }
        if (op === '-le') { p += 3; var c7 = cmpInt(t, a); return c7.ok && c7.x <= c7.y; }
        if (op === '-ef') { p += 3; return resolvePath(ctx.cwd, t) === resolvePath(ctx.cwd, a); }
        if (op === '-nt') { p += 3; return String(t) > String(a); }
        if (op === '-ot') { p += 3; return String(t) < String(a); }
      }
      /* 单个词：非空即真 */
      p++;
      return String(t) !== '';
    }
    function andExpr() {
      var l = primary();
      if (l === null) return null;
      while (peek() === '-a') { p++; var r = primary(); if (r === null) return null; l = l && r; }
      return l;
    }
    function orExpr() {
      var l = andExpr();
      if (l === null) return null;
      while (peek() === '-o' || peek() === '||') { p++; var r = andExpr(); if (r === null) return null; l = l || r; }
      return l;
    }
    var v = orExpr();
    if (v === null || p !== toks.length) return null;
    return v;
  }

  /* `[ ... ]` 与 `test ...` 共用的实现 */
  function testImpl(argv, ctx, requireBracket) {
    var args = argv.slice();
    if (requireBracket) {
      if (args[args.length - 1] !== ']') {
        return fail(['[: missing \']\'']);
      }
      args.pop();
    }
    if (!args.length) return { out: [], err: [], code: 1 };
    var joined = args.join(' ');
    var v = evalTestTokens(testTokenize(joined), ctx, false);
    if (v === null) {
      return { out: [], err: ['bash: ' + (requireBracket ? '[' : 'test') + ': ' + joined + ': 表达式语法错误'], code: 2 };
    }
    return { out: [], err: [], code: v ? 0 : 1 };
  }

  CMDS['['] = function (argv, ctx) { return testImpl(argv, ctx, true); };
  CMDS.test = function (argv, ctx) { return testImpl(argv, ctx, false); };
  CMDS['[['] = function (argv, ctx) {
    var args = argv.slice();
    if (args[args.length - 1] === ']]') args.pop();
    var joined = args.join(' ');
    var v = evalTestTokens(testTokenize(joined), ctx, true);
    if (v === null) {
      return { out: [], err: ['bash: [[: ' + joined + ': 表达式语法错误'], code: 2 };
    }
    return { out: [], err: [], code: v ? 0 : 1 };
  };

  /* ---------- true / false / : ---------- */
  CMDS['true'] = function () { return { out: [], err: [], code: 0 }; };
  CMDS['false'] = function () { return { out: [], err: [], code: 1 }; };
  CMDS[':'] = function () { return { out: [], err: [], code: 0 }; };

  /* ---------- printf ---------- */
  CMDS.printf = function (argv, ctx) {
    if (!argv.length) return fail(['printf: usage: printf format [arguments]']);
    var fmt = argv[0], rest = argv.slice(1);
    var r = printfFormat(fmt, rest);
    /* 参数比占位符多时，bash 的 printf 会**重复使用格式串**直到参数用完 */
    if (r.hadSpec && rest.length > r.used && r.used > 0) {
      var extra = rest.slice(r.used), text = r.text, guard = 0;
      while (extra.length && guard++ < 200) {
        var r2 = printfFormat(fmt, extra);
        text += r2.text;
        if (r2.used <= 0) break;
        extra = extra.slice(r2.used);
      }
      r.text = text;
    }
    if (r.text === '') return { out: [], err: [], code: 0 };
    var lines = r.text.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return { out: lines, err: [], code: 0 };
  };

  /* ---------- seq ---------- */
  CMDS.seq = function (argv, ctx) {
    var nums = argv.filter(function (a) { return /^-?\d+(\.\d+)?$/.test(a); });
    if (!nums.length) return fail(['seq: missing operand']);
    var first = 1, step = 1, last;
    if (nums.length === 1) last = Number(nums[0]);
    else if (nums.length === 2) { first = Number(nums[0]); last = Number(nums[1]); }
    else { first = Number(nums[0]); step = Number(nums[1]); last = Number(nums[2]); }
    if (!step) return fail(['seq: invalid Zero increment value: \'0\'']);
    var out = [], guard = 0;
    if (step > 0) for (var i = first; i <= last + 1e-9 && guard < 10000; i += step, guard++) out.push(String(Number(i.toFixed(10))));
    else for (var j = first; j >= last - 1e-9 && guard < 10000; j += step, guard++) out.push(String(Number(j.toFixed(10))));
    return ok(out);
  };

  /* ---------- basename / dirname ---------- */
  CMDS.basename = function (argv, ctx) {
    if (!argv.length) return fail(['basename: missing operand']);
    var p = String(argv[0]).replace(/\/+$/, '');
    if (p === '') p = '/';
    var b = baseName(p);
    if (argv[1] && b.length > argv[1].length && b.slice(-argv[1].length) === argv[1]) {
      b = b.slice(0, b.length - argv[1].length);
    }
    return ok([b]);
  };

  CMDS.dirname = function (argv, ctx) {
    if (!argv.length) return fail(['dirname: missing operand']);
    var p = String(argv[0]).replace(/\/+$/, '');
    if (p === '') return ok(['/']);
    var d = parentOf(resolvePath(ctx.cwd, p));
    /* dirname 输出的是"去掉最后一段"的路径，相对路径也要保持相对 */
    if (p.charAt(0) !== '/') {
      var segs = p.split('/'); segs.pop();
      d = segs.length ? segs.join('/') : '.';
      if (d === '') d = '/';
    }
    return ok([d]);
  };

  /* ---------- read ---------- */
  CMDS.read = function (argv, ctx) {
    var raw = false, prompt = null, names = [], tmo = null, nchars = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-r') { raw = true; continue; }
      if (a === '-p') { prompt = argv[++i]; continue; }
      if (a === '-t') { tmo = argv[++i]; continue; }
      if (a === '-n') { nchars = argv[++i]; continue; }
      if (a === '-s' || a === '-a') { i++; continue; }
      if (a.charAt(0) === '-' && a.length > 1) continue;
      names.push(a);
    }
    var src = ctx.shell && ctx.shell._readStdin;
    if (!src || !src.lines || src.pos >= src.lines.length) {
      if (prompt) return { out: [String(prompt)], err: [], code: 1 };
      return { out: [], err: [], code: 1 };
    }
    var line = String(src.lines[src.pos++]);
    if (nchars !== null && nchars !== undefined && nchars !== '') {
      var nn = Number(nchars);
      if (!isNaN(nn)) { src.pos--; src.lines[src.pos] = line.slice(nn); line = line.slice(0, nn); if (src.lines[src.pos] === '') src.pos++; }
    }
    if (!raw) line = line.replace(/\\(.)/g, '$1');
    var fields = line.split(/\s+/).filter(function (x) { return x !== ''; });
    if (!names.length) names = ['REPLY'];
    for (var k = 0; k < names.length; k++) {
      if (k === names.length - 1) {
        ctx.env[names[k]] = k === 0 ? line.replace(/^\s+/, '') : fields.slice(k).join(' ');
      } else {
        ctx.env[names[k]] = fields[k] === undefined ? '' : fields[k];
      }
    }
    return { out: [], err: [], code: 0 };
  };

  /* ---------- command ---------- */
  CMDS.command = function (argv, ctx, stdin, HOST) {
    var args = argv.slice();
    if (args[0] === '-v' || args[0] === '-V') {
      var name = args[1];
      if (!name) return fail(['command: -v: option requires an argument']);
      if (name === 'firewall-cmd' || CMDS[name] || (ALIAS[name] && typeof ALIAS[name] === 'string')) {
        return ok(['/usr/bin/' + name]);
      }
      if (NOT_IMPL[name] || ALIAS[name] === null) return ok(['/usr/bin/' + name]);
      return { out: [], err: [], code: 1 };
    }
    if (!args.length) return { out: [], err: [], code: 0 };
    /* `command foo args` = 绕开别名直接执行 foo */
    var name2 = args[0];
    var impl = CMDS[name2] || (name2 === 'firewall-cmd' ? CMDS.firewall_cmd : null);
    /* ⚠️ 用**路径**调用命令时，要按最后一段（basename）去找实现。
       真 shell 里 `$JAVA_HOME/bin/java -version`、`/usr/bin/python3 -V`、
       `./script.sh` 都合法 —— 走的是"这个路径上的可执行文件"。
       早先这里只按整串查表，于是站内 sh-var-export 的示例
         export JAVA_HOME=/usr/lib/jvm/java-17-openjdk && $JAVA_HOME/bin/java -version
       报 `bash: /usr/lib/jvm/java-17-openjdk/bin/java: command not found`，
       学员会以为 **JDK 没装**，而其实只是引擎不认带路径的调用。
       只对"含 `/` 且 basename 是已知命令"的情况回退，不会把未知路径放进来。 */
    var base2 = null;
    if (!impl && name2.indexOf('/') !== -1) {
      base2 = name2.slice(name2.lastIndexOf('/') + 1);
      if (CMDS[base2]) { impl = CMDS[base2]; name2 = base2; }
      else if (ALIAS[base2] && typeof ALIAS[base2] === 'string') {
        var ex2 = tokenize(ALIAS[base2]);
        name2 = ex2[0];
        args = [name2].concat(ex2.slice(1)).concat(args.slice(1));
        impl = CMDS[name2];
      }
    }
    if (!impl && ALIAS[name2] && typeof ALIAS[name2] === 'string') {
      var ex = tokenize(ALIAS[name2]);
      name2 = ex[0];
      args = ex.slice(1).concat(args.slice(1));
      impl = CMDS[name2];
    }
    if (!impl) return { out: [], err: ['bash: ' + name2 + ': command not found'], code: 127 };
    return impl(expandGlobs(args.slice(1), ctx), ctx, stdin, HOST);
  };

  /* ---------- mktemp ---------- */
  var MKTEMP_SEQ = 0;
  CMDS.mktemp = function (argv, ctx) {
    var dir = '/tmp', prefix = 'tmp', asDir = false;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-d') { asDir = true; continue; }
      if (a === '-p' || a === '--tmpdir') { dir = argv[++i] || '/tmp'; continue; }
      if (a === '-t') continue;
      if (a === '-u') continue;
      if (a.charAt(0) !== '-') {
        if (a.indexOf('/') !== -1 || i === 0) { dir = parentOf(resolvePath(ctx.cwd, a)); prefix = baseName(a).replace(/X+$/, '') || 'tmp'; }
        else prefix = a.replace(/X+$/, '') || 'tmp';
      }
    }
    var absDir = resolvePath(ctx.cwd, dir);
    var node = findNode(ctx.root, absDir);
    if (!node || node.type !== 'dir') {
      return fail(['mktemp: failed to create file via template \'' + dir + '/tmp.XXXXXXXXXX\': No such file or directory']);
    }
    var name = prefix + '.' + padNum(MKTEMP_SEQ++ % 100000000, 8);
    var full = absDir + '/' + name;
    if (asDir) ensureDir(ctx, full);
    else ensureFile(ctx, full, '');
    return ok([full]);
  };

  /* ---------- shift / break / continue ---------- */
  function intArg(argv, dflt) {
    if (!argv.length) return dflt;
    var n = parseInt(String(argv[0]), 10);
    if (isNaN(n) || n < 1) return dflt;
    return n;
  }

  CMDS.shift = function (argv, ctx) {
    var sh2 = ctx.shell;
    var ps = sh2._positions || [];
    var n = intArg(argv, 1);
    if (!ps.length) return { out: [], err: [], code: 1 };
    if (n > ps.length) n = ps.length;
    sh2._positions = ps.slice(n);
    return { out: [], err: [], code: 0 };
  };

  CMDS['break'] = function (argv, ctx) {
    var st = ctx.shell._execState;
    if (!st || !st.loopDepth) return fail(['bash: break: 只能在 for/while/until 循环里使用']);
    st.breakDepth = intArg(argv, 1);
    return { out: [], err: [], code: 0 };
  };

  CMDS['continue'] = function (argv, ctx) {
    var st = ctx.shell._execState;
    if (!st || !st.loopDepth) return fail(['bash: continue: 只能在 for/while/until 循环里使用']);
    st.continueDepth = intArg(argv, 1);
    return { out: [], err: [], code: 0 };
  };

  CMDS.exit = function (argv, ctx) {
    var code = 0;
    if (argv.length) {
      var n = parseInt(String(argv[0]), 10);
      code = isNaN(n) ? (String(argv[0]) === '' ? 0 : 2) : (n & 0xff);
    }
    var st = ctx.shell._execState;
    if (st) { st.exit = true; st.exitCode = code; }
    return { out: [], err: [], code: code };
  };

  /* ---------- Bash 扩展语法的如实拒绝 ----------
     这些构造在真机上是合法且常用的，但教学环境没有进程/信号/数组模型。
     绝不能"当普通命令执行"假装成功 —— 学员会以为语法通过了。 */
  var SHELL_EXTRA_UNSUPPORTED = {
    'set': '教学环境不支持 `set -euo pipefail` 这类开关的完整语义（需要真实的解释器状态机）。真机上的作用是：-e 遇错即退、-u 用未定义变量即退、-o pipefail 让管道任一环失败即整条失败；脚本头写它是最佳实践，但本站无法模拟它"提前退出"的效果。',
    'trap': '教学环境不支持 trap（需要真实信号机制）。真机上的作用是：脚本退出或收到信号时自动执行清理命令，例如 `trap "rm -f $tmp" EXIT` 会在脚本结束时删掉临时文件。',
    'getopts': '教学环境不支持 getopts（需要真实的位置参数游标）。真机上的作用是：按 `-f value` 的格式循环解析脚本选项，并把选项值放进 $OPTARG、把下一个位置参数下标放进 $OPTIND。',
    'wait': '教学环境不支持 `&` 后台任务与 wait（没有真实进程表）。真机上的作用是：等所有后台任务结束再继续，常用于并发跑一批主机。',
    'exec': '教学环境不支持 `exec 9>lock` 这类文件描述符重定向与 exec 替换进程（没有真实 fd 表）。真机上的作用是：把 fd 9 指向一个锁文件，供 flock 做互斥；`exec >> log 2>&1` 则把后续所有输出重定向到日志。',
    'declare': '教学环境不支持数组与关联数组（`declare -a` / `declare -A`）。真机上的作用是：声明数组并把多个值放进一个变量，用 `${arr[@]}` 展开。',
    'local': '教学环境不支持函数（因此也没有 local）。真机上的作用是：把变量限制在函数内部，避免污染全局。',
    'return': '教学环境不支持函数定义 `f() { ... }`，因此没有 return。真机上的作用是：从函数里提前返回并给出退出码。',
    'eval': '教学环境不支持 eval（动态构造命令再执行）。真机上的作用是：把拼接出来的字符串当成命令执行，常用于 `eval "$(ssh-agent)"`。',
    'source': '教学环境不支持 source / `.` 加载外部脚本（没有真实脚本文件）。真机上的作用是：在当前 shell 里执行另一个脚本，使它的变量与函数生效。',
    'let': '教学环境不支持 `let`。真机上的作用是：整数运算并赋值，等价于 `(( ))`。',
    /* ── 剩下几条"没实现，但有很具体的替代做法" ──
       它们不属于"真实网络 / 内核操作"那一类，而是"当下没做、但有等价手段"，
       所以原因里必须**给出可执行的替代品**，否则等于没说。 */
    'bash': '`bash` 作为**独立命令**启动子 shell（`bash -c "…"`、`bash 脚本.sh`、`bash -x` 调试）需要真实解释器进程与脚本文件，教学环境不模拟。但本站已支持 `sh -c "…"` 与 `bash -c "…"`（把字符串当脚本执行）；脚本调试思路（`-x` 跟踪、`-n` 只查语法、`set -euo pipefail`）见本分类条目。',
    'nohup': '`nohup` 让进程**脱离终端**继续运行（配 `&` 与重定向），需要真实进程表与信号机制，教学环境不模拟。它的正确替代品是 systemd 服务（`systemctl` 已实现）—— 生产上本来就该用 systemd 而不是 nohup；nohup 的适用场景与坑（忘了重定向、日志丢在 nohup.out）见本分类条目。',
    'trap': '教学环境不支持 `trap`（需要真实信号机制）。真机上的作用是：脚本退出或收到信号时自动执行清理，例如 `trap "rm -f $tmp" EXIT` 在脚本结束时删掉临时文件 —— 它是"脚本跑一半失败也不留垃圾"的关键手段，写法与常见坑见本分类条目。'
  };

  /* 这些"命令"在真机上是语法/关键字，报错要说清楚它们是什么 */
  var SHELL_KEYWORDS = {
    'then': 'then 是 if 的一部分，必须和 if … fi 配套使用，不能单独当命令执行。写法：`if [ 条件 ]; then 命令; fi`',
    'do': 'do 是 for/while/until 的一部分，不能单独当命令执行。写法：`for i in 1 2 3; do echo $i; done`',
    'done': 'done 必须与 for/while/until 配对，不能单独出现。',
    'fi': 'fi 必须与 if 配对，不能单独出现。',
    'esac': 'esac 必须与 case 配对，不能单独出现。',
    'elif': 'elif 只能出现在 if 结构内部。',
    'in': 'in 只能出现在 for/case 的语法位置。'
  };

  /* ---------- 命令总表（含别名） ---------- */
  var FS_EXTRA = [];
  var ALIAS = {
    'll': 'ls -l', 'la': 'ls -a', 'dir': 'ls',
    'egrep': 'grep -E', 'fgrep': 'grep -F',
    'iptables': null, 'ip6tables': null,
    'service': null, 'init': null, 'systemd-analyze': null,
    'vim': null, 'vi': null, 'nano': null, 'yum': null, 'apt': null, 'dnf': null, 'rpm': null,
    'tar': 'tar', 'gzip': 'gzip',
    'rsync': null, 'scp': null, 'sftp': null, 'ssh': null, 'ssh-keygen': null, 'ssh-copy-id': null,
    'awk2': 'awk', 'mawk': 'awk', 'gawk': 'awk',
    'less': 'cat', 'more': 'cat'
  };

  var NOT_IMPL = {
    'ssh': 'ssh 需要真实网络连接，教学环境无法模拟。可以看分类 04「网络与排障」里的 ssh 条目。',
    'rsync': 'rsync 涉及真实文件传输，教学环境只模拟它的参数解析。练习建议：rsync -avz --dry-run /data/www/ /backup/',
    'iptables': 'iptables 会直接改动内核防火墙规则，风险高，教学环境不模拟。可看分类 04 里的 iptables 条目（含 -F 断 SSH 的警告）。',
    'service': '老式 SysV 命令，教学环境请用 systemctl（两者的对应关系见分类 03）。',
    'vim': 'vi/vim 是交互式编辑器，无法在单行终端里模拟。',
    'vi': 'vi/vim 是交互式编辑器，无法在单行终端里模拟。',
    'nano': 'nano 是交互式编辑器，无法在单行终端里模拟。',
    'yum': 'yum/dnf 需要真实软件源，教学环境不模拟。',
    'apt': 'apt 需要真实软件源，教学环境不模拟。',
    'dnf': 'yum/dnf 需要真实软件源，教学环境不模拟。',
    'rpm': 'rpm 需要真实软件包数据库，教学环境不模拟。',
    'scp': 'scp 需要真实网络，教学环境不模拟。可看分类 01 的 scp 条目。',
    'sftp': '`sftp` 是**交互式**的文件传输程序（连上之后进它自己的命令提示符，用 `get`/`put`/`ls`/`cd` 操作），既需要真实网络、又需要交互式会话，教学环境不模拟。批量传文件的正确做法是 `scp -r`（一条命令传完，适合脚本）或 `rsync -avz --delete`（增量、可断点续传）—— 两者的适用场景对比见本分类条目。',
    'ssh-keygen': 'ssh-keygen 会生成真实密钥文件，教学环境不模拟。',
    /* 故障速查（故障剧本）的排查链路里会用到这两条，学员从速查页点进来就会敲到。
       与其给一句光秃秃的 `command not found`，不如说清"为什么跑不了、去哪儿看" ——
       这正是"未实现命令要诚实提示"的落点。 */
    'chroot': 'chroot 会切换进程的根目录，属于真实内核操作，教学环境不模拟（改了根目录之后模拟文件系统的语义就没法自洽了）。它的用途与风险见分类 13「安全与合规」的 chroot 条目。',
    'pmap': 'pmap 读取的是真实进程的内存映射（/proc/<PID>/maps），教学环境里的进程是模拟的、没有内核映射表，所以不模拟。看内存分布可以用 ps 的 rss 列。',
    'systemd-analyze': '教学环境未实现该命令。',
    'ip6tables': '教学环境未实现该命令。',
    /* ── 下面这些是"手册收录了、但模拟终端按设计不做"的命令 ──
       给它们写清原因，比统一回一句"未实现"有用得多：
       学员看到"为什么不做"，才知道该去真机还是该换一条命令。 */
    'aws': '本站以华为云为主，AWS CLI 是**对照收录**（帮你把已有知识映射过去），不在模拟终端里实现。华为云的对应命令见 hcloud / KooCLI 条目。',
    'az': '本站以华为云为主，Azure CLI 是**对照收录**，不在模拟终端里实现。华为云的对应命令见 hcloud / KooCLI 条目。',
    'wget': 'wget 需要真实网络下载，教学环境无法模拟（会真的去连外网）。本站的 curl 是实现了的，下载类排障可以先用它。',
    'systemd': '`systemd` 是 systemd 的"总入口"命令，教学环境只实现了日常真正会用的 systemctl / journalctl。改服务状态请用 systemctl。',
    'less': 'less / more 是**交互式分页器**（要按键翻页、要终端窗口），没法在单行模拟终端里复现。看文件请用 head / tail / cat / grep。',
    'more': 'less / more 是**交互式分页器**（要按键翻页、要终端窗口），没法在单行模拟终端里复现。看文件请用 head / tail / cat / grep。',
    'locate': 'locate 查的是 updatedb 预先建好的索引库，教学环境里没有真实索引可查 —— 查了只会返回空结果，那属于"假装成功"。找文件请用 find。',
    /* ── 用户与组管理（C 档：按设计不做，写清原因） ──
       这一族会改动真实的账号数据库（/etc/passwd、/etc/shadow、/etc/group）并可能
       直接影响登录，模拟它们没有教学收益（学员在真机上练一次就会了），
       而且很容易让人误以为"改的是这台机器"。所以如实说明"去哪儿学"。 */
    'useradd': '`useradd` 会写入真实的 /etc/passwd 与 /etc/shadow，属于系统级变更，教学环境不模拟。账号与权限的概念、以及 `id`/`getent`/`chmod`/`chown` 这些**只读或可安全演示**的命令，本分类都有条目可以练。',
    'usermod': '`usermod` 会改动真实账号数据库（含把用户加进组、改家目录、锁定账号），教学环境不模拟。查账号用 `id` / `getent passwd`（这两条已实现）。',
    'userdel': '`userdel` 会删除真实账号并可能遗留孤儿文件，风险高，教学环境不模拟。删账号前该做哪些检查（`ps -u`、家目录、crontab），见本分类的账号生命周期条目。',
    'passwd': '交互式改密码需要真实的 /etc/shadow 与终端回显控制，教学环境不模拟。密码策略（有效期、复杂度）的检查思路见 `chage` 条目。非交互改密要用 `chpasswd`，同样需要真实账号库。',
    'chage': '`chage` 读写真实的 /etc/shadow 里的有效期字段，教学环境不模拟。密码过期策略该怎么定、怎么排查"密码过期导致登录失败"，见本分类的对应条目。',
    'groupadd': '`groupadd` 会写入真实的 /etc/group，教学环境不模拟。查组用 `getent group`（已实现）。',
    'groupmod': '`groupmod` 会改动真实组名/GID，而 GID 变了会影响一批文件的属组，属于高风险变更，教学环境不模拟。',
    'groupdel': '`groupdel` 会删除真实组（且不能删用户的主组），教学环境不模拟。',
    'gpasswd': '`gpasswd` 改的是真实组的成员与组密码，教学环境不模拟。看某用户在哪些组用 `id <用户>`（已实现）。',
    'su': '`su` 需要真实的身份切换与密码校验，教学环境不模拟（本站的模拟终端本来就是单用户视角）。提权类操作的排障思路见 `sudo` 相关条目。',
    'visudo': '`visudo` 是**交互式**的 sudoers 编辑器，无法在单行终端里模拟。它最大的价值是"保存时做语法检查"——真机上改 sudoers **必须**用它，直接 `vim /etc/sudoers` 写错会导致所有人无法提权。本站实现了 `chmod`、可以练"sudoers 文件权限必须是 440"。',
    'lsattr': '`lsattr` 读的是 ext4 的 inode 扩展属性（chattr 设置的那些），教学环境的虚拟文件系统没有这个属性位，读了只能返回空 —— 属于"假装成功"。真机上用它确认 `i`（不可修改）属性是否还在。',
    'chattr': '⚠️ `chattr +i` 会把文件锁成"连 root 都改不了"，是**救急也是挖坑**：忘了 `-i` 会让后续部署全部失败，且报错信息很晦涩。教学环境不模拟它（虚拟文件系统没有属性位）。真机上用完一定要 `lsattr` 复核。',
    'getfacl': '`getfacl` 读的是文件上的 POSIX ACL 扩展项，教学环境的虚拟文件系统只模拟了传统 rwx 权限位，没有 ACL —— 读出来会是空，属于"假装成功"。ACL 的适用场景（一个文件给三个人三种权限）见本分类的 ACL 条目。',
    'setfacl': '`setfacl` 写的是 POSIX ACL，教学环境的虚拟文件系统只模拟传统权限位（`chmod` 是实现了的），ACL 落不下去，所以不模拟 —— 免得"设置成功了但 `getfacl` 读不出来"这种自相矛盾。',
    /* ── 真实网络 / 内核 / 交互式程序（C 档：按设计不做，写清原因） ──
       这一族与上面的"用户管理"同理：不是做不了，是**做了会骗人**。
       凡是需要真实网络、真实内核、或需要交互式终端的，一律如实说明 + 指向替代做法。 */
    'ssh-copy-id': '`ssh-copy-id` 要把公钥传到**真实远端主机**的 ~/.ssh/authorized_keys，需要真实网络与真实 sshd，教学环境不模拟。免密登录的三步（生成密钥 → 分发公钥 → 验证）见本分类的 ssh 相关条目；`ssh-keygen` 与权限检查（`chmod 600`）是实现了的，可以练。',
    'ethtool': '`ethtool` 读的是**真实网卡驱动**的寄存器与协商状态（速率、双工、链路、`-S` 统计），仿真网卡没有驱动层，读了只能是编的 —— 属于"假装成功"。查本机地址与链路请用 `ip addr` / `ip link`（已实现）；真机上 `ethtool eth0` 是排查"网卡掉速/半双工"的第一条命令。',
    'iftop': '`iftop` 是**交互式**的实时流量监视器（ncurses 全屏、要按键切换排序），无法在单行终端里复现。看连接与流量用 `ss -tnp`（已实现）；真机上 `iftop -i eth0 -nNP` 用来找"谁在占带宽"。',
    'nethogs': '`nethogs` 同样是**交互式**全屏工具，而且它按进程统计流量靠的是抓包 + 反查 socket，仿真环境里没有真实流量可抓。看某个进程的网络连接用 `ss -tnp | grep <PID>`（已实现）。',
    'tshark': '`tshark` 是 Wireshark 的命令行版，要读**真实网卡**的抓包数据（或 pcap 文件），仿真环境里没有真实报文 —— 抓了只能是编的。本站实现了 `tcpdump`（同样能演示抓包语法与过滤表达式），排障思路可以直接迁移。',
    'nft': '`nft`（nftables）会**直接改动内核防火墙规则**，与 `iptables` 同属高风险内核操作，教学环境不模拟。规则语法与查错思路见本分类的 nft 条目；真机上改规则前务必先 `nft list ruleset` 存一份，避免把自己关在门外。',
    'iptables-save': '`iptables-save` 读的是**内核里的真实规则表**，教学环境不模拟 iptables 家族。它的用途是"改规则前先备份、改坏了能一键回滚"，这个习惯比命令本身更重要 —— 真机上先 `iptables-save > /root/ipt.rules`。',
    'ipset': '`ipset` 管理的是**内核里的 IP 集合**（配合 iptables 做大批量黑白名单），属于内核操作，教学环境不模拟。封禁大量 IP 的思路见本分类的 ipset 条目；小批量直接用 `iptables -s` 即可。',
    'ufw': '`ufw` 是 Ubuntu 上的 iptables 前端，最终仍要写内核规则，教学环境不模拟。它的命令风格（`ufw allow 80/tcp`）比 iptables 好记得多，但**别在 CentOS/EulerOS 上找它**（那些系统用 firewalld，本站已实现 `firewall-cmd`）。',
    'ifconfig': '`ifconfig` 属于已停止维护的 net-tools，很多新系统**默认不再安装**（这正是它要被 `ip` 取代的原因之一）。教学环境统一用 `ip addr` / `ip link` / `ip route`（已实现）—— 建议直接从 `ip` 学起，老系统上再回头认 `ifconfig`。',
    'route': '`route` 与 `ifconfig` 同属 net-tools，已被 `ip route` 取代。查路由表用 `ip route`（已实现）；真机上遇到只有 `route` 的老系统，记住 `route -n` 对应 `ip route` 即可。',
    'arping': '`arping` 发的是**真实 ARP 报文**（用于确认 IP 是否被占用、有没有 ARP 冲突），需要真实二层网络，教学环境不模拟。查本机 ARP 表用 `ip neigh`（已实现）；真机上 `arping -I eth0 -c 3 <IP>` 常用于定位"IP 冲突导致时通时断"。',
    'rg': '`rg`（ripgrep）是**独立安装**的高性能搜索工具（不在基础镜像里，要 `yum install ripgrep` 或下二进制），教学环境不假装装了这个包。它 90% 的用法是 `grep -r` 的加速版，本站的 `grep -r` 已实现，语法通用（`-i/-n/-l/-c/-A/-B/-C/--include` 全都有）。',
    'yq': '`yq` 是**独立安装**的 YAML 处理器（类似 `jq` 之于 JSON），教学环境不假装有这个包。本站实现了 `jq`（JSON）与 `grep/sed`，看 YAML 结构常用的 `yq ".spec.containers[].image"` 可用 `grep -A/-B` 或 `sed -n` 近似替代。',
    'iconv': '`iconv` 做的是**真实字符集转换**（GBK ↔ UTF-8 ↔ ISO-8859-1），仿真里没有真实字节流，转出来只能是编的。编码问题的判断思路（`file -i` 看编码、`dos2unix` 去 CR）见本分类条目；`file` 是实现了的。',
    'dos2unix': '`dos2unix` 处理的是**行尾的 CRLF**（Windows 传来的脚本在 Linux 上跑会报 `\r: command not found`）。仿真文件里没有真实字节，改不出效果。真机上也可以用 `sed -i "s/\\r$//" 文件` 或 `tr -d "\\r"` 达到同样效果 —— 这两条本站都实现了，可以练。',
    'paste': '`paste` 会把多个文件**按列**并排（`-d` 指定分隔符、`-s` 把整个文件拼成一行）。仿真里做得到，但它的典型用途"合并两份报表"需要成对的真实数据文件，教学环境没有配对的夹具。按列合并可以先用 `awk` 实现（本站 `awk` 已实现），真机上再回来用 `paste` 更省事。',
    'join': '`join` 按**公共字段**合并两个已排序文件（关系数据库里的 join）。它要求两个文件都按连接字段排好序，否则结果会静默缺行 —— 这类"前置条件不满足就给错结果"的命令，在教学环境里配一对合适的夹具成本很高。用 `awk` 的两文件处理（`NR==FNR`）可以练同样的思路。',
    'quota': '`quota` 读的是**文件系统里真实的配额记录**（要内核开启 quota 支持、还要先 `quotacheck` 建库），仿真文件系统没有配额层，读了只能是编的。配额怎么评估、怎么给用户设限的流程见本分类条目；`df`/`du` 是实现了的，可以先练"谁在占空间"。',
    'certbot': '`certbot` 要**真实连到 Let\'s Encrypt 的 ACME 服务**做域名校验（HTTP-01 要开 80 端口、DNS-01 要写 TXT 记录），教学环境不模拟。证书到期检查的思路与 `openssl x509 -checkend` 的写法见本分类的证书条目（`openssl` 已实现）。',
    'vault': '`vault` 要连**真实的 Vault 服务端**（有地址、有 token、有存储后端），教学环境不模拟。机密管理的原则（不落盘、最小权限、可审计、能轮转）见本分类条目；`vault kv get` 这类命令的真机写法也在那里。',
    'packer': '`packer` 会**真实调用云厂商 API 或本地虚拟化**去构建镜像（本站以华为云为准），教学环境不模拟。镜像标准化该怎么做、和 Terraform/Ansible 的分工见本分类条目（本站实现了 `terraform` 与 `ansible` 家族的常用子命令）。',
    'cloud-init': '`cloud-init` 是**开机时**由系统服务执行的初始化流程（读 user-data、配网卡、建用户、跑脚本），不是一条能在已登录的 shell 里"跑一下"的命令 —— 仿真环境没有启动阶段。user-data 该怎么写、怎么排错见本分类条目。',
    'cloud-localds': '`cloud-localds` 生成的是 **seed 镜像**（把 user-data/meta-data 打成 ISO 挂给虚机），要真实文件与真实 ISO 工具链，教学环境不模拟。它的作用与 user-data 的写法见本分类条目。',
    'crictl': '`crictl` 通过 **CRI socket**（/run/containerd/containerd.sock）与容器运行时通信，仿真环境里没有真实 containerd。查 Pod 与容器请用 `kubectl get/describe/logs`（已实现）；真机上 `crictl ps -a` 是 kubectl 报"节点不健康"时往下一层看的手段。',
    'gitlab-runner': '`gitlab-runner` 要**注册到真实的 GitLab 实例**（拿 registration token、连 CI 服务）才有意义，教学环境不模拟。流水线的结构与排错思路见本分类条目；本站实现了 `git` 与它相关条目里用到的 `docker`、`helm` 命令，可以练构建链路的大部分环节。',
    'catalina.sh': '`catalina.sh` 是 **Tomcat 自带的 Shell 脚本**（`run` 前台起、`start` 后台起、`configtest` 查配置），它属于"应用自带的脚本"而不是系统命令 —— 本站不执行脚本文件（仿真机没有真的 shell 解释器），所以报文件存在但不会跑。看它的内容用 `cat /opt/tomcat/bin/catalina.sh`；Tomcat 的启动参数与排错思路（`CATALINA_OPTS`、`logs/catalina.out`、`configtest` 先于启动）见本分类条目。',
    'at': '`at` 提交的是**一次性定时任务**（要真实 atd 守护进程来执行），仿真环境没有守护进程，提交了也不会跑 —— 假装"已排定"就是骗人。周期任务用 `crontab`（本站已实现，可以真写、真 `-l` 查看）；一次性延迟执行在真机上才用 `at`。',
    'rmdir': '`rmdir` 只能删空目录（这正是它比 `rm -r` 安全的地方），本站暂未实现它。要删空目录用 `rm -d 目录` 或 `rm -r`（两者都已实现）—— 但请先 `ls -la` 看清里面有什么，这正是 `rmdir` 想逼你养成的习惯。',
    /* ── 补上几条"内容里用到、但没登记原因"的命令 ── */
    'chpasswd': '`chpasswd` 从标准输入批量改**真实账号**的密码（写 /etc/shadow），教学环境不模拟。它是自动化里改密码的标准做法（`echo "用户:新密码" | chpasswd`），但交互式改密请用 `passwd`。密码策略与排查思路见本分类的账号生命周期条目 —— 注意**别把密码写进命令行或脚本**，那会留在历史记录与进程列表里。',
    'flock': '`flock` 靠**真实的内核文件锁**互斥（同一把锁跨进程生效），仿真环境里没有内核锁，做了也只能是假的 —— 那就等于告诉学员"锁生效了"，而实际并发场景完全没被保护。真机上它是"防止两个备份任务撞车"的标准手段：`flock -n /var/lock/backup.lock -c "备份命令"`。',
    'audit2why': '`audit2why` 要读**真实的审计日志**（/var/log/audit/audit.log）并解析 SELinux 拒绝记录，教学环境没有审计子系统。排障思路见本分类的 SELinux 条目：先 `ausearch -m avc -ts recent` 拿到拒绝记录，再判断是改上下文（`semanage fcontext` + `restorecon`）、开布尔值（`setsebool`），还是写自定义策略。',
    'audit2allow': '`audit2allow` 解析真实审计日志、生成 SELinux 策略模块（`-M` 产出 .te/.pp 再用 `semodule -i` 装载），属于系统级变更，教学环境不模拟。**它生成的是"允许刚才被拒的那次访问"的宽泛规则**，直接上生产等于放宽度量 —— 应当先确认那个访问确实该被允许，再考虑用它。'
  };

  /* ======================= 控制流引擎 =======================
     支持：for（列表 / {1..5} / glob / $(seq) / "$@" / C 风格 `for ((;;))`）、
           while / until、if / elif / else（可嵌套）、case（模式支持 glob）、
           break [n] / continue [n]，以及循环末尾的输入重定向 `done < file`。
     不做：函数定义、trap、getopts、数组、进程替换、& 后台 —— 见
           SHELL_EXTRA_UNSUPPORTED，那些会如实报错而不是假装成功。
     安全护栏：单个循环最多 SHELL_CTRL_MAX_ITER 次，超限直接报错退出，
           否则 `while true; do echo x; done` 会把浏览器页面挂死。 */

  var SHELL_CTRL_MAX_ITER = 1000;

  /* 把已经过 maskBlocks 的文本里的空白切开（用于 `case 词 in` 这类关键字定位） */
  function splitWS(s) {
    return String(s).split(/[ \t]+/).filter(function (x) { return x !== ''; });
  }

  /* 从 stmts[idx] 开始找关键字 kw（只认整词）。
     返回 { i, before, atStart }；找不到返回 null。
     atStart = 关键字**独占这一段的开头**（`do echo $i` / `then echo ok`）。
     这一点很关键：do / then 这类标记词不能落进循环体/分支体里被当命令执行 ——
     早先没区分，`for i in 1 2 3; do echo $i; done` 会先报一句
     "bash: do 是 for/while/until 的一部分"，再让 echo 照跑一遍。 */
  function ctrlFindKw(stmts, idx, kw) {
    for (var i = idx; i < stmts.length; i++) {
      var parts = splitWS(stmts[i].raw !== undefined ? stmts[i].raw : stmts[i].cmd);
      for (var k = 0; k < parts.length; k++) {
        if (parts[k] === kw) {
          return { i: i, before: parts.slice(0, k).join(' '), atStart: k === 0, parts: parts };
        }
      }
    }
    return null;
  }

  /* 收集从 stmts[from] 到 stmts[to]（含）的命令片段 */
  function ctrlCollect(stmts, from, to) {
    var out = [];
    for (var i = from; i <= to && i < stmts.length; i++) {
      out.push({ cmd: stmts[i].cmd, raw: stmts[i].raw, op: out.length === 0 ? ';' : stmts[i].op });
    }
    return out;
  }

  /* 解析一条语句：切成"命令部分 + 前后重定向"。
     `done < hosts.txt` 里的 `< hosts.txt` 必须摘出来（它是整个循环的输入）。 */
  function splitStmtRedir(txt) {
    var s = String(txt);
    var pre = [], post = [];
    var out = '', i = 0, quote = null;
    var re = /^(>>|>|<|\d>>|\d>|\d<|&>>|&>)$/;
    var toks = s.split(/[ \t]+/).filter(function (x) { return x !== ''; });
    var res = [];
    for (var k = 0; k < toks.length; k++) {
      if (re.test(toks[k]) && k + 1 < toks.length) {
        res.push({ op: toks[k], file: toks[k + 1], at: k === 0 ? 'pre' : 'post' });
        k++;
        continue;
      }
      out += (out ? ' ' : '') + toks[k];
    }
    return { cmd: out, redirs: res };
  }

  /* 把循环末尾的重定向套到一次运行结果上（`done < f`、`done > f`） */
  function applyStmtRedirs(shell, redirs, res, ctxLike) {
    if (!redirs || !redirs.length) return res;
    var out = res.out || [], err = res.err || [], code = res.code;
    for (var i = 0; i < redirs.length; i++) {
      var r = redirs[i];
      var abs = resolvePath(shell.cwd, r.file);
      var isErr = /^2/.test(r.op);
      if (r.op === '>' || r.op === '>>' || r.op === '2>' || r.op === '2>>' || r.op === '&>' || r.op === '&>>') {
        if (abs === '/dev/null') { if (isErr) err = []; else out = []; continue; }
        var parent = findNode(shell.root, parentOf(abs));
        if (!parent) { err = err.concat(['bash: ' + r.file + ': No such file or directory']); code = 1; continue; }
        var nm = baseName(abs), old = parent.children[nm];
        var text = out.join('\n') + (out.length ? '\n' : '');
        if (r.op === '&>' || r.op === '&>>') text += err.join('\n') + (err.length ? '\n' : '');
        if (old && old.type === 'dir') {
          err = err.concat(['bash: ' + r.file + ': Is a directory']);
          code = 1;
          continue;
        }
        if (old && old.type === 'file' && /^(&|2)?>>$/.test(r.op)) old.content = String(old.content || '') + text;
        else { var nf = newNode('file', nm); nf.content = text; nf.mtime = fmtNow(); parent.children[nm] = nf; }
        if (!isErr) out = [];
        if (r.op === '&>' || r.op === '&>>') err = []; else err = [];
      }
    }
    return { out: out, err: err, code: code };
  }

  /* 切完管道后，从**原文**里把对应的那一段取回来。
     maskedSeg 只有形状（元字符被换成 \x00），但长度与原文一一对应，
     所以按位置映射即可：`echo $(date) | cat` 的第一段会拿回 `echo $(date)`。 */
  function pickRawSpans(maskedSeg, rawText) {
    var m = String(maskedSeg), r = String(rawText);
    var start = r.indexOf(m);
    if (start < 0) {
      /* trim 掉首尾空白时 indexOf 会失手，退化成"按长度取一段" */
      var core = m.replace(/^\s+|\s+$/g, '');
      start = core ? r.indexOf(core) : -1;
      if (start < 0) return m;
      m = core;
    }
    return r.substr(start, m.length);
  }

  /* 按"屏蔽段在原文里的位置"取回原文段。
     用 offset 而不是 indexOf 搜索：`$(…)` 在屏蔽文本里已经不是原文了，
     靠内容匹配会找错位置甚至找不到。 */
  function rawSliceByOffset(maskedSeg, rawText, from) {
    var m = String(maskedSeg), r = String(rawText);
    var lead = m.length - m.replace(/^\s+/, '').length;
    var core = m.replace(/^\s+|\s+$/g, '');
    if (!core) return m;
    var start = r.indexOf(core, from);
    if (start < 0) start = from + lead;
    return r.substr(start, core.length);
  }

  /* 把"屏蔽形状"与"替换已生效的文本"合成一份：
     形状用来让上层认出 $CTRL / [[ … ]]（它们靠屏蔽后的 \x00 保持完整），
     文本用来真正执行。两者长度一致时逐位取"非屏蔽字符来自文本"。 */
  function isCtrlLike(maskedSeg) {
    var m = String(maskedSeg).trim();
    return m.indexOf('$CTRL') === 0 || m.indexOf('[[') === 0 || m.charAt(0) === '[';
  }

  /* 解析控制流。line 是**整行原文**（可能含 && / ; ），fromIdx 是控制流关键字
     在 splitByAnd 结果里的下标。返回：
       { ok:true, ctrl, next }   next = 该控制流最后一个语句的下标 + 1
       { ok:false, error, next } 解析失败（要如实报错，不能硬当普通命令跑） */
  function ctrlParse(shell, line, fromIdx) {
    return ctrlParseList(splitByAnd(line), fromIdx);
  }

  /* 从一段**语句数组**的 fromIdx 处开始解析控制流。
     单独拆出来是为了让循环体 / 分支体里能再套控制流
     （`for f in a b; do if [ -f x ]; then …; fi; done`）。 */
  function ctrlParseList(stmts, fromIdx) {
    if (fromIdx >= stmts.length) return null;
    var first = stmtText(stmts[fromIdx]).trim();
    if (/^for\b/.test(first) && /^\(\s*\(/.test(first.replace(/^for\s*/, ''))) {
      return ctrlParseForC(stmts, fromIdx);
    }
    if (/^for\b/.test(first)) return ctrlParseFor(stmts, fromIdx);
    if (/^(while|until)\b/.test(first)) return ctrlParseWhile(stmts, fromIdx);
    if (/^if\b/.test(first)) return ctrlParseIf(stmts, fromIdx);
    if (/^case\b/.test(first)) return ctrlParseCase(stmts, fromIdx);
    return null;
  }

  function ctrlErr(msg, next) { return { ok: false, error: msg, next: next }; }

  /* 取一条语句的**原文**。
     splitByAnd 给出的 `cmd` 是"屏蔽文本"（引号串、括号块、`$( )` 内部都换成了 \x00，
     长度不变），只有 `raw` 才是能拿去执行的原文。
     控制流解析器必须用 raw：`${VAR:?}` / `$(cmd | cmd)` 这类内容一旦从 cmd 里取，
     拿到的就是一串 \x00，命令替换会"成功执行"一段空命令、变量静默变成空值。 */
  function stmtText(s) {
    if (!s) return '';
    return String(s.raw !== undefined && s.raw !== null ? s.raw : s.cmd);
  }

  /* `for VAR in WORDS; do …; done` */
  function ctrlParseFor(stmts, fromIdx) {
    var first = stmtText(stmts[fromIdx]);
    var m = first.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b([\s\S]*)$/);
    if (!m) {
      if (/^for\s*\(/.test(first)) return ctrlErr('教学环境不支持 `for (( ; ; ))` 的某些写法，请用 `for i in 1 2 3`', fromIdx + 1);
      return ctrlErr('for 的写法无法识别。正确写法：`for i in 1 2 3; do echo $i; done`', fromIdx + 1);
    }
    var rawWords = splitStmtRedir(m[2]);
    var words = splitWS(rawWords.cmd);
    var doPos = ctrlFindKw(stmts, fromIdx, 'do');
    if (!doPos) return ctrlErr('for 缺少配对的 do（写法：for i in 1 2 3; do 命令; done）', stmts.length);
    var donePos = ctrlFindKw(stmts, doPos.i, 'done');
    if (!donePos) return ctrlErr('for 缺少配对的 done', stmts.length);
    var body = ctrlCollect(stmts, doPos.i, donePos.i - 1);
    body = ctrlFixLead(body, doPos);
    /* do 之前还夹着别的语句（异常写法）时一并当成循环体，避免整行无效 */
    if (doPos.i > fromIdx + 1) {
      var extra = ctrlCollect(stmts, fromIdx + 1, doPos.i - 1);
      body = extra.concat(body);
    }
    var tail = splitStmtRedir(stmts[donePos.i].cmd);
    return {
      ok: true,
      ctrl: { kind: 'for', varName: m[1], words: words, wordsRaw: rawWords.cmd, body: body, redirs: tail.redirs, instr: '' },
      next: donePos.i + 1
    };
  }

  /* `for ((i=0; i<5; i++)); do …; done` */
  function ctrlParseForC(stmts, fromIdx) {
    var first = stmtText(stmts[fromIdx]);
    var m = first.match(/^for\s*\(\(([\s\S]*)\)\)\s*$/);
    var init = '', cond = '', step = '';
    if (m) {
      var ps = m[1].split(';');
      if (ps.length < 3) return ctrlErr('C 风格 for 需要三段：`for ((i=0; i<5; i++))`', fromIdx + 1);
      init = ps[0].trim(); cond = ps[1].trim(); step = ps.slice(2).join(';').trim();
    }
    var doPos = ctrlFindKw(stmts, fromIdx, 'do');
    if (!doPos) return ctrlErr('for 缺少配对的 do', stmts.length);
    var donePos = ctrlFindKw(stmts, doPos.i, 'done');
    if (!donePos) return ctrlErr('for 缺少配对的 done', stmts.length);
    var body = ctrlCollect(stmts, doPos.i, donePos.i - 1);
    body = ctrlFixLead(body, doPos);
    var tail = splitStmtRedir(stmts[donePos.i].cmd);
    return {
      ok: true,
      ctrl: { kind: 'forc', init: init, cond: cond, step: step, body: body, redirs: tail.redirs },
      next: donePos.i + 1
    };
  }

  /* `while COND; do …; done` / `until COND; do …; done` */
  function ctrlParseWhile(stmts, fromIdx) {
    var first = stmtText(stmts[fromIdx]);
    var m = first.match(/^(while|until)\b([\s\S]*)$/);
    if (!m) return ctrlErr('while/until 写法无法识别', fromIdx + 1);
    var cond = m[2].trim();
    var doPos = ctrlFindKw(stmts, fromIdx, 'do');
    if (!doPos) {
      /* `while COND; do` 有可能被切到了下一条（多行写法） */
      doPos = ctrlFindKw(stmts, fromIdx + 1, 'do');
      if (doPos && doPos.i === fromIdx + 1) cond = (cond + '; ' + doPos.before).replace(/;\s*$/, '').trim();
    }
    if (!doPos) return ctrlErr(m[1] + ' 缺少配对的 do（写法：while [ 条件 ]; do 命令; done）', stmts.length);
    var donePos = ctrlFindKw(stmts, doPos.i, 'done');
    if (!donePos) return ctrlErr(m[1] + ' 缺少配对的 done', stmts.length);
    var body = ctrlCollect(stmts, doPos.i, donePos.i - 1);
    body = ctrlFixLead(body, doPos);
    var tail = splitStmtRedir(stmts[donePos.i].cmd);
    return {
      ok: true,
      ctrl: { kind: m[1], cond: cond, body: body, redirs: tail.redirs },
      next: donePos.i + 1
    };
  }

  /* `if COND; then …; [elif COND; then …;] [else …;] fi` */
  function ctrlParseIf(stmts, fromIdx) {
    var branches = [];
    var i = fromIdx;
    var elseBody = null;
    var guard = 0;
    while (guard++ < 200) {
      var first = stmtText(stmts[i]);
      var m = first.match(/^(?:if|elif)\b([\s\S]*)$/);
      if (!m) return ctrlErr('if 结构无法解析', stmts.length);
      var cond = m[1].trim();
      var thenPos = ctrlFindKw(stmts, i, 'then');
      if (!thenPos) return ctrlErr('if 缺少配对的 then（写法：if [ 条件 ]; then 命令; fi）', stmts.length);
      if (thenPos.i === i && thenPos.before) cond = thenPos.before;
      /* 从 then 之后找 fi / elif / else */
      var fiPos = ctrlFindKw(stmts, thenPos.i, 'fi');
      var elifPos = ctrlFindKw(stmts, thenPos.i, 'elif');
      var elsePos = ctrlFindKw(stmts, thenPos.i, 'else');
      if (!fiPos) return ctrlErr('if 缺少配对的 fi', stmts.length);
      var stop = fiPos.i;
      var stopKind = 'fi';
      if (elifPos && elifPos.i < stop) { stop = elifPos.i; stopKind = 'elif'; }
      if (elsePos && elsePos.i < stop) { stop = elsePos.i; stopKind = 'else'; }
      branches.push({ cond: cond, body: ctrlFixLead(ctrlCollect(stmts, thenPos.i, stop - 1), thenPos) });
      if (stopKind === 'fi') return { ok: true, ctrl: { kind: 'if', branches: branches, elseBody: elseBody }, next: stop + 1 };
      if (stopKind === 'else') {
        var afterElse = ctrlFindKw(stmts, stop + 1, 'fi');
        if (!afterElse) return ctrlErr('if 缺少配对的 fi', stmts.length);
        /* `else` 独占一段时（`…; else echo no; fi`）不能把 else 本身当命令跑 */
        elseBody = ctrlFixLead(ctrlCollect(stmts, stop, afterElse.i - 1), elsePos);
        return { ok: true, ctrl: { kind: 'if', branches: branches, elseBody: elseBody }, next: afterElse.i + 1 };
      }
      /* elif：接着解析下一个分支 */
      i = stop;
    }
    return ctrlErr('if 结构太深或写法异常', stmts.length);
  }

  /* `case WORD in PAT) … ;; … esac` —— 直接从原文解析，避免被 ; ; 切碎 */
  function ctrlParseCase(stmts, fromIdx) {
    /* ⚠️ case 只吃到 `esac` 所在的那条语句为止，**后面的语句要留给调用方**。
       早先这里是 `stmts.slice(fromIdx)` —— 把后面所有语句都吞进来，
       于是 `for H in a b; do case $H in …) … ;; esac; echo "$H 属于 $T"; done`
       里循环体最后那条 `echo` 被当成了 case 最后一个分支的动作，
       循环体等于什么都没打印（而且没有任何报错）。
       next 也必须是 esac 的下一条，不能是 stmts.length。 */
    var endIdx = -1;
    for (var ei = fromIdx; ei < stmts.length; ei++) {
      if (/\besac\b/.test(stmtText(stmts[ei]))) { endIdx = ei; break; }
    }
    if (endIdx < 0) return ctrlErr('case 缺少配对的 esac（写法：`case $1 in start) … ;; *) … ;; esac`）', stmts.length);
    var text = stmts.slice(fromIdx, endIdx + 1).map(stmtText).join(' ; ');
    var m = String(text).match(/^case\s+([\s\S]*?)\s+in\b([\s\S]*)$/);
    if (!m) {
      var m1 = stmtText(stmts[fromIdx]).match(/^case\s+([\s\S]*?)\s+in\b([\s\S]*)$/);
      if (!m1) return ctrlErr('case 的写法无法识别。正确写法：`case $1 in start) … ;; *) … ;; esac`', fromIdx + 1);
      m = m1;
    }
    var word = m[1].trim();
    var body = m[2];
    body = body.replace(/\s*esac\s*$/, '');
    var items = [];
    var re = /(?:^|;;)([\s\S]*?)\)([\s\S]*?)(?=;;|$)/g, cm;
    while ((cm = re.exec(body)) !== null) {
      var pats = cm[1].replace(/^[\s|]+/, '').split('|').map(function (p) { return p.trim(); }).filter(function (p) { return p !== ''; });
      var act = cm[2].trim();
      if (!pats.length) continue;
      items.push({ pats: pats, action: act, body: splitByAnd(act) });
    }
    if (!items.length) return ctrlErr('case 里没有解析出任何分支（分支格式：`模式) 命令 ;;`）', endIdx + 1);
    var tail = splitStmtRedir(stmts[endIdx].cmd);
    return { ok: true, ctrl: { kind: 'case', word: word, items: items, redirs: tail.redirs }, next: endIdx + 1 };
  }

  /* 把命令行里的标记换成命令替换的真实结果 */
  function expandSubsIn(seg, ext) {
    var s = String(seg);
    if (!ext || !ext.subs || !ext.subs.length) return s;
    if (s.indexOf(SUB_MARK) === -1 && s.indexOf(SUB_UNQ) === -1) return s;
    var out = '', i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === SUB_MARK || ch === SUB_UNQ) {
        var e = s.indexOf(SUB_END, i + 1);
        if (e < 0) { out += ch; i++; continue; }
        var idx = Number(s.slice(i + 1, e));
        var sub = ext.subs[idx];
        out += sub && sub.value !== undefined ? String(sub.value) : '';
        i = e + 1;
        continue;
      }
      out += ch; i++;
    }
    return out;
  }

  /* 运行控制流的循环体 / 分支体。
     循环体里可能出现 `VAR=值` 赋值、break/continue、嵌套控制流，
     所以要按 opList 逐条执行，并把 stop 状态原样带出来。 */
  /* 运行循环体 / 分支体。体里可能有 `VAR=值` 赋值、break/continue、嵌套控制流，
     所以按 opList 逐条执行，并把 stop 状态原样带出来（不给它 short-circuit）。 */
  function ctrlInputLines(shell, redirs) {
    redirs = redirs || [];
    for (var i = 0; i < redirs.length; i++) {
      var r = redirs[i];
      if (r.op !== '<' && r.op !== '0<') continue;
      var abs = resolvePath(shell.cwd, r.file);
      if (abs === '/dev/null') return { lines: [], err: null };
      var node = findNode(shell.root, abs);
      if (!node || node.type === 'dir') {
        return { lines: null, err: 'bash: ' + r.file + ': No such file or directory' };
      }
      var text = String(node.content || '');
      var lines = text === '' ? [] : text.split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      return { lines: lines, err: null };
    }
    return { lines: null, err: null };
  }

  function ctrlApplyOutRedirs(shell, redirs, res) {
    if (!redirs || !redirs.length) return res;
    var out = res.out || [], err = res.err || [], code = res.code;
    for (var i = 0; i < redirs.length; i++) {
      var r = redirs[i];
      if (r.op === '<' || r.op === '0<') continue;
      var abs = resolvePath(shell.cwd, r.file);
      var isErr = r.op.charAt(0) === '2';
      var both = r.op.charAt(0) === '&';
      var append = />>$/.test(r.op);
      if (abs === '/dev/null') {
        if (isErr) err = []; else if (both) { out = []; err = []; } else out = [];
        continue;
      }
      var parent = findNode(shell.root, parentOf(abs));
      if (!parent) {
        err = err.concat(['bash: ' + r.file + ': No such file or directory']);
        code = 1;
        continue;
      }
      var nm = baseName(abs), old = parent.children[nm];
      var text = isErr
        ? (err.join('\n') + (err.length ? '\n' : ''))
        : (out.join('\n') + (out.length ? '\n' : ''));
      if (both) text += err.join('\n') + (err.length ? '\n' : '');
      if (old && old.type === 'dir') {
        err = err.concat(['bash: ' + r.file + ': Is a directory']);
        code = 1;
        continue;
      }
      if (old && old.type === 'file' && append) old.content = String(old.content || '') + text;
      else {
        var nf = newNode('file', nm);
        nf.content = text;
        nf.mtime = fmtNow();
        parent.children[nm] = nf;
      }
      if (both) { out = []; err = []; }
      else if (isErr) err = [];
      else out = [];
    }
    return { out: out, err: err, code: code };
  }

  /* 循环体 / 分支体的起点修正：`do echo x` 这种把关键字与第一条命令写在同一段的写法，
     必须把关键字本身摘掉，不能连它一起当命令执行（否则会冒出
     "bash: do 是 for/while/until 的一部分，不能单独当命令执行" 这种莫名其妙的话）。 */
  function ctrlFixLead(body, kw) {
    if (!body || !body.length || !kw || !kw.atStart) return body;
    var lead = kw.parts.slice(1).join(' ');
    if (!lead) return body.slice(1);
    return [{ cmd: lead, op: body[0].op }].concat(body.slice(1));
  }

  /* ⚠️ 这里曾经有第二份 `ctrlRunList` 定义（与此处内容相同）。
     JS 的函数声明是"后声明者胜"，所以那份把这份整个盖住了 ——
     改这份不会有任何效果，是个很隐蔽的坑。重复的一份已删除，实现只保留一处。 */

  /* 控制流的总执行入口 */
  function ctrlRun(shell, ctrl, st, shared) {
    var red = ctrlInputLines(shell, ctrl.redirs);
    if (red.err) return { out: [], err: [red.err], code: 1 };
    /* 循环末尾的 `done < file` 把文件变成循环体的 stdin 流 */
    var loopStream = red.lines === null ? shared : { lines: red.lines, pos: 0 };
    var res;
    if (ctrl.kind === 'for' || ctrl.kind === 'forc') res = ctrlRunFor(shell, ctrl, st, shared, loopStream);
    else if (ctrl.kind === 'while' || ctrl.kind === 'until') res = ctrlRunWhile(shell, ctrl, st, shared, loopStream);
    else if (ctrl.kind === 'if') res = ctrlRunIf(shell, ctrl, st, shared);
    else if (ctrl.kind === 'case') res = ctrlRunCase(shell, ctrl, st, shared);
    else res = { out: [], err: ['bash: 教学环境不认识的控制流：' + ctrl.kind], code: 2 };
    return ctrlApplyOutRedirs(shell, ctrl.redirs, res);
  }

  function ctrlRunFor(shell, ctrl, st, shared, loopStream) {
    var out = [], err = [], code = 0;
    /* 词表在这里**整表展开**：{1..5} 先展开成 5 个词，再做变量替换与 glob */
    var words = ctrl.words ? ctrlExpandWords(shell, ctrl.words, ctrl.wordsRaw) : null;
    /* C 风格：先算 init */
    var vars = shell.env;
    if (ctrl.kind === 'forc') {
      if (ctrl.init) arithEval(ctrl.init, vars, function (n, v) { vars[n] = String(v); });
      shell.env = vars;
    }
    var iter = 0;
    while (true) {
      if (st.exit) break;
      if (st.breakDepth || st.continueDepth) break;
      if (iter++ >= SHELL_CTRL_MAX_ITER) {
        err = err.concat(['bash: 循环次数超过教学环境上限（' + SHELL_CTRL_MAX_ITER + ' 次），已强制退出。'
          + '真机上的 `while true` 会一直跑下去，这里必须停下来，否则浏览器页面会卡死。']);
        code = 2;
        break;
      }
      if (ctrl.kind === 'forc') {
        var cv = arithEval(ctrl.cond, shell.env, function (n, v) { shell.env[n] = String(v); });
        if (cv === null) {
          err = err.concat(['bash: for ((…)) 的条件无法求值: ' + ctrl.cond]);
          code = 2;
          break;
        }
        if (!cv) break;
      } else {
        if (!words.length) break;
        var w = words.shift();
        shell.env[ctrl.varName] = w;
      }
      st.loopDepth++;
      var r = ctrlRunList(shell, ctrl.body, st, loopStream);
      st.loopDepth--;
      out = out.concat(r.out);
      err = err.concat(r.err);
      code = r.code;
      if (st.exit) break;
      if (ctrl.kind === 'forc' && ctrl.step) {
        arithEval(ctrl.step, shell.env, function (n, v) { shell.env[n] = String(v); });
      }
      if (st.breakDepth) { st.breakDepth--; break; }
      if (st.continueDepth) { st.continueDepth--; continue; }
    }
    return { out: out, err: err, code: code };
  }

  /* for 的词表：先整表展开 {1..5}，再做变量替换与字段切分（$(seq 1 10) 的结果
     已经由标记带着 quoted=false 过来，所以会按空白切成多个词 —— 与真 bash 一致） */
  function ctrlExpandWords(shell, words, wordsRaw) {
    /* ⚠️ `for i in $(seq 1 3)` —— 词表里的**命令替换**必须先跑掉，再把结果按空白切词。
       早先这里只认"已经变成标记的"命令替换，而词表是原文按空格切过的结果，
       于是 `$(seq 1 3)` 被切成 `$(seq`、`1`、`3)` 三个字面量，
       循环体拿到一串垃圾值（还带着 `$(` 和 `)`），却没有任何报错。
       注意切词要按 bash 的 IFS 来：空格、制表符**和换行**都算分隔
       （`$(seq 1 3)` 的输出是 `1\n2\n3`，只按空格切就切不开）。 */
    if (wordsRaw && wordsRaw.indexOf('$(') !== -1) {
      var exW = extractSubs(wordsRaw);
      if (exW && exW.subs.length) {
        for (var sW = 0; sW < exW.subs.length; sW++) {
          var subW = shell.exec(exW.subs[sW].cmd, { history: false });
          exW.subs[sW].value = (subW.out || []).join('\n');
          shell.lastCode = subW.code;
        }
        words = String(expandSubsIn(exW.text, exW)).split(/[ \t\n]+/).filter(function (x) { return x !== ''; });
      }
    }
    var list = braceExpandList(words);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var vals = expandMarkedField(list[i], shell.env, false);
      for (var k = 0; k < vals.length; k++) {
        var g = ctrlGlobWord(shell, vals[k]);
        for (var m = 0; m < g.length; m++) out.push(g[m]);
      }
    }
    return out;
  }

  /* for 的**单个**词：glob 展开（`for f in /var/log/*.log`）。
     引擎的 expandGlobs 只在参数里含 `/` 时才展开，这里保持同样的保守取舍。 */
  function ctrlGlobWord(shell, w) {
    if (!/[*?]/.test(w) || w.indexOf('/') === -1) return [w];
    return expandGlobs([w], { root: shell.root, cwd: shell.cwd });
  }

  function ctrlRunWhile(shell, ctrl, st, shared, loopStream) {
    var out = [], err = [], code = 0;
    var iter = 0;
    var until = ctrl.kind === 'until';
    while (true) {
      if (st.exit) break;
      if (st.breakDepth || st.continueDepth) break;
      if (iter++ >= SHELL_CTRL_MAX_ITER) {
        err = err.concat(['bash: 循环次数超过教学环境上限（' + SHELL_CTRL_MAX_ITER + ' 次），已强制退出。'
          + '真机上的 `while true` 会一直跑下去，这里必须停下来，否则浏览器页面会卡死。']);
        code = 2;
        break;
      }
      var cr = shell._execCommand(ctrl.cond, st, loopStream);
      out = out.concat(cr.out);
      err = err.concat(cr.err);
      shell.lastCode = cr.code;
      var truth = (cr.code === 0);
      if (until) truth = !truth;
      if (!truth) break;
      st.loopDepth++;
      var r = ctrlRunList(shell, ctrl.body, st, loopStream);
      st.loopDepth--;
      out = out.concat(r.out);
      err = err.concat(r.err);
      code = r.code;
      if (st.exit) break;
      if (st.breakDepth) { st.breakDepth--; break; }
      if (st.continueDepth) { st.continueDepth--; continue; }
    }
    return { out: out, err: err, code: code };
  }

  function ctrlRunIf(shell, ctrl, st, shared) {
    for (var i = 0; i < ctrl.branches.length; i++) {
      var cr = shell._execCommand(ctrl.branches[i].cond, st, shared);
      shell.lastCode = cr.code;
      if (cr.code === 0) {
        var r = ctrlRunList(shell, ctrl.branches[i].body, st, shared);
        return { out: cr.out.concat(r.out), err: cr.err.concat(r.err), code: r.code };
      }
    }
    if (ctrl.elseBody) return ctrlRunList(shell, ctrl.elseBody, st, shared);
    return { out: [], err: [], code: 0 };
  }

  /* `case WORD in` 里的 WORD 是**一个词**：做变量替换与命令替换之后拿去匹配，
     绝不是"把 WORD 当命令执行"。
     早先这里直接 `_execCommand(ctrl.word)` 并把它的 stdout 当词用，于是
       `case abc in abc) …` → 先冒一句 `bash: abc: command not found`，
       `case $V in x) …`   → `$V` 展开成 `x` 之后又被当命令跑，同样 command not found。
     两边的分支其实照样匹配，所以结果看着"半对"，特别容易骗过人。 */
  function ctrlExpandCaseWord(shell, raw) {
    var text = String(raw === undefined || raw === null ? '' : raw);
    var ex = extractSubs(text);
    if (ex && ex.subs.length) {
      for (var i = 0; i < ex.subs.length; i++) {
        var sub = shell.exec(ex.subs[i].cmd, { history: false });
        ex.subs[i].value = (sub.out || []).join('\n');
        shell.lastCode = sub.code;
      }
      text = expandSubsIn(ex.text, ex);
    }
    return String(expandFieldText(text, shell.env, true, null));
  }

  function ctrlRunCase(shell, ctrl, st, shared) {
    var word = ctrlExpandCaseWord(shell, ctrl.word);
    for (var i = 0; i < ctrl.items.length; i++) {
      var it = ctrl.items[i];
      for (var k = 0; k < it.pats.length; k++) {
        if (globMatchFull(it.pats[k], word)) {
          return ctrlRunList(shell, it.body, st, shared);
        }
      }
    }
    /* 一个分支都没匹配上：真 shell 里退出码是 0 */
    return { out: [], err: [], code: 0 };
  }


  function ctrlRunList(shell, opList, st, shared, ctrlArg) {
    var out = [], err = [], code = 0;
    for (var i = 0; i < opList.length; i++) {
      if (st.exit) break;
      var op = opList[i];
      /* 与 _execScript 同一条规则：`A && B || C` 里 A 失败只跳过 B，
         不能跳出整个列表（否则 C 永远不执行）。跳过时保持 code 不变。 */
      if (i > 0) {
        if (op.op === '&&' && code !== 0) continue;
        if (op.op === '||' && code === 0) continue;
      }
      /* 循环体 / 分支体里**再套一层控制流**：
         `for f in a b; do if [ -f x ]; then …; else …; fi; done` 是最常用的写法之一。
         早先这里把每一段都直接丢给 _execCommand，于是 `if` / `then` / `else` / `fi`
         被当成普通命令，报出 "bash: if: command not found" 外加一串
         "then 必须与 if 配套"的提示 —— 循环体等于完全没用。
         现在先按**语句数组**解析控制流（注意不能拿单条语句去解析：
         if…then…fi 天然跨越多条），解析成功就递归执行并跳过它占掉的那几条。 */
      var nested = ctrlParseList(opList, i);
      var r;
      if (nested && nested.ok) {
        r = ctrlRun(shell, nested.ctrl, st, shared);
        i = nested.next - 1;
      } else if (nested && nested.error) {
        r = { out: [], err: ['bash: ' + nested.error], code: 2 };
        i = nested.next - 1;
      } else {
        r = shell._execCommand(op.raw !== undefined ? op.raw : op.cmd, st, shared, ctrlArg);
      }
      out = out.concat(r.out);
      err = err.concat(r.err);
      code = r.code;
      shell.lastCode = code;
      if (st.breakDepth || st.continueDepth || st.exit) break;
    }
    return { out: out, err: err, code: code };
  }

  /* ======================= 引擎 ======================= */

  function fmtNow() {
    var d = new Date(NOW);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function createShell(opts) {
    var ENV = cloneHost(BASE_HOST, opts);      /* 本实例自己的机器环境 */
    var shell = {
      env_host: ENV,
      root: createFS(),
      cwd: ENV.home,
      env: { TZ: 'Asia/Shanghai' },
      user: ENV.user,
      host: ENV.hostname,
      history: [],
      reset: function () {
        this.root = createFS();
        this.cwd = ENV.home;
        this.env = { TZ: 'Asia/Shanghai' };
        this.history = [];
      },
      prompt: function () {
        var short = this.cwd === ENV.home ? '~' : this.cwd.replace(ENV.home + '/', '~/').replace(/^\/$/, '/');
        var sym = this.user === 'root' ? '#' : '$';
        return '[' + this.user + '@' + this.host + ' ' + short + ']' + sym + ' ';
      },
      /* 执行一行（可含管道 / 重定向 / && / || / ;，以及 for/while/if/case 控制流） */
      exec: function (line, opts2) {
        var self = this;
        var raw = String(line || '').trim();
        if (!raw) return { out: [], err: [], code: 0 };
        if (!opts2 || opts2.history !== false) this.history.push(raw);

        /* 位置参数：`while [ $# -gt 0 ]; do …; done a b c` 这种写法要把
           a b c 交给循环体当 $1 $2 $3 用 */
        if (opts2 && opts2.positions) this._positions = opts2.positions.slice();

        var result = { out: [], err: [], code: 0, clear: false };
        var st = {
          exit: false, exitCode: 0, loopDepth: 0,
          breakDepth: 0, continueDepth: 0, inControl: false
        };
        var prevSt = this._execState;
        this._execState = st;
        var shared = this._stdinState || null;
        var sharedOwn = false;
        if (opts2 && opts2.stdinState) { shared = opts2.stdinState; sharedOwn = true; }
        if (!shared) { shared = { lines: [], pos: 0, owner: this, saved: this._readStdin }; this._stdinState = shared; sharedOwn = true; }
        this._readStdin = shared;
        try {
          var r = this._execScript(raw, st, shared);
          result.out = r.out;
          result.err = r.err;
          result.code = r.code;
          if (r.clear) result.clear = true;
          this.lastCode = r.code;
          if (st.exit) { result.exit = true; result.code = st.exitCode; }
        } finally {
          this._execState = prevSt;
          if (sharedOwn) {
            this._stdinState = null;
            this._readStdin = shared.saved;
          }
        }
        return result;
      },

      /* 把一段脚本（可含多行 + && || ; + 控制流）跑完 */
      _execScript: function (raw, st, stdinState) {
        var self = this;
        var result = { out: [], err: [], code: 0, clear: false };
        var segs = this._parseControl(raw);
        /* 供"管道接控制流"用：管道头的 stdout 不打印，转成循环的输入流 */
        var pipeBuf = null;
        for (var a = 0; a < segs.length; a++) {
          var sg = segs[a];
          if (st.exit) break;
          /* ⚠️ `A && B || C` 里 A 失败时**不能 break 整行**，只能跳过 B、继续判 C。
             真 shell 的语义是 `(A && B) || C`：A 失败时 `A && B` 整体为假，
             所以 C 必须执行。早先这里写的是 `break`，
             于是 `false && echo yes || echo no` 什么都不打印（连 no 都不打），
             `ls /nope 2>/dev/null && echo 成功 || echo 失败` 也没有任何输出 ——
             这类"少打印一行"极难被发现，因为没有报错、退出码也像是正常的。
             跳过时**保持 code 不变**，后面的 `||` 才知道前面是失败的。 */
          if (a > 0) {
            if (sg.op === '&&' && result.code !== 0) continue;
            if (sg.op === '||' && result.code === 0) continue;
          }
          var r;
          if (sg.ctrl && sg.pipeFromPrev) {
            /* 管道接控制流：输入流是管道头的 stdout（游标在循环体里共享，`read` 才能
               一行行往下走），同时它跑在**子 shell** 里 —— 循环内改的变量出不来，
               与教材里讲的 `cat f | while read …; echo $n` → 0 一致。 */
            var savedEnvP = this.env;
            this.env = copyEnv(savedEnvP);
            try {
              r = ctrlRun(this, sg.ctrl, st, { lines: pipeBuf || [], pos: 0, owner: this });
            } finally {
              this.env = savedEnvP;
            }
            pipeBuf = null;
          } else if (sg.ctrl) {
            r = ctrlRun(this, sg.ctrl, st, stdinState);
          } else if (sg.ctrlErr) {
            r = { out: [], err: ['bash: ' + sg.ctrlErr], code: 2 };
          } else {
            /* 交给 _execCommand 的必须是**原文**：
               splitByAnd 给出的 cmd 是屏蔽文本（引号串、括号块都换成了 \x00），
               拿它去 extractSubs 会把 `$(date)` 里的内容当成 NUL 去执行，
               命令替换静默变成空值。_execCommand 自己会按需 maskBlocks。 */
            r = this._execCommand(stmtText(sg), st, stdinState);
            if (sg.pipeHead) { pipeBuf = r.out || []; result.err = result.err.concat(r.err); result.code = r.code; this.lastCode = r.code; continue; }
          }
          result.out = result.out.concat(r.out);
          result.err = result.err.concat(r.err);
          result.code = r.code;
          /* `$?` 看的是**上一段**的退出码 */
          this.lastCode = r.code;
          if (r.clear) result.clear = true;
        }
        return result;
      },

      /* 解析整行；遇到控制流关键字就交给控制流引擎 */
      _parseControl: function (raw) {
        var stmts = splitByAnd(raw);
        var out = [];
        for (var i = 0; i < stmts.length; i++) {
          var part = stmts[i];
          /* ⚠️ `… | while read l; do …; done` —— "把上游输出逐行喂给循环"，
             是运维脚本里最常见的写法之一。麻烦在于 splitByAnd 是按字符切的：
             它看到循环体里的 `;` 就把这一行切成
             `… | while read l`、`do …`、`done` 三段，于是 while 永远配不上 do，
             最后报 `bash: while: command not found`（管道接循环直接不可用）。
             做法：把"管道头"与"控制流"分成两条语句，控制流那条带 pipeFromPrev，
             由 _execScript 把管道头的 stdout 接成它的输入流。 */
          var pc = splitPipedControl(part.cmd, part.raw === undefined ? part.cmd : part.raw);
          if (pc) {
            var sub = [{ cmd: pc.ctrl, raw: pc.ctrl, op: ';' }];
            for (var j = i + 1; j < stmts.length; j++) sub.push(stmts[j]);
            var hole2 = ctrlParseList(sub, 0);
            if (hole2 && hole2.ok) {
              out.push({ cmd: pc.head, raw: pc.head, op: part.op, pipeHead: true });
              out.push({ cmd: '$CTRL', op: ';', ctrl: hole2.ctrl, pipeFromPrev: true });
              /* sub 比 stmts 多算了头部那一条，换算回 stmts 的下标要减 1 */
              i = i + (hole2.next - 1);
              continue;
            }
            /* 解析不成功就退回去，让常规路径如实报错（不要静默吞掉） */
          }
          if (/^(for|while|until|if|case)\b/.test(part.cmd)) {
            var hole = ctrlParse(this, raw, i);
            if (hole && hole.ok) {
              out.push({ cmd: '$CTRL', op: part.op, ctrl: hole.ctrl });
              i = hole.next - 1;
              continue;
            }
            /* 解析失败：把关键字当成"不支持的构造"如实报错，不要硬当普通命令跑 */
            if (hole && hole.error) {
              out.push({ cmd: ':' + hole.error, op: part.op, ctrlErr: hole.error });
              i = hole.next - 1;
              continue;
            }
          }
          out.push(part);
        }
        return out;
      },

      /* 执行一个命令片段（无 && / || / ;，但可含管道与重定向） */
      _execCommand: function (segment, st, stdinState, ctrlArg) {
        var self = this;
        if (stdinState) this._readStdin = stdinState;
        var rawText = String(segment);
        /* ⚠️ 切管道必须用 maskBlocks 屏蔽过的文本（否则 `[[ a || b ]]` 的 || 会被当管道），
           但**命令替换必须在原文上做** —— 屏蔽文本里的 `$(…)` 已经变成 \x00，
           `echo $(date)` 会原样打到终端上（这一步踩过）。 */
        var masked = maskBlocks(rawText);
        var useMasked = masked !== null;
        var scan = useMasked ? masked : rawText;
        var rawParts = splitPipeline(rawText);
        var segs = useMasked ? splitPipeline(scan) : rawParts;
        if (segs.length !== rawParts.length) { segs = rawParts; useMasked = false; }
        /* ⚠️ 真 shell 里**管道的每一段都在独立子进程**里跑，所以段里改的变量
           出不来（`echo x | read v; echo $v` → 空）。只有"多段"才隔离：
           单条命令（`X=1`、`cd /tmp`）必须改到当前 shell 上，否则赋值永远不生效。
           这一步与站内 sh-pipe 条目里"每个管道段都在独立子进程中执行"的说法对应。 */
        var pipeSavedEnv = null;
        if (segs.length > 1) { pipeSavedEnv = this.env; this.env = copyEnv(pipeSavedEnv); }
        try {
        var out = [];
        var cursor = 0;
        var pipeIn = null;
        for (var si = 0; si < segs.length; si++) {
          var segMasked = useMasked ? segs[si] : rawParts[si];
          /* 原文段按位置取回：屏蔽文本里的 `$(…)` 已变成 \x00，靠内容搜不到 */
          var segRaw = useMasked ? rawSliceByOffset(segMasked, rawText, cursor) : rawParts[si];
          cursor = rawText.indexOf(segRaw, cursor) + segRaw.length;
          /* `$(...)` 在这一步展开：先抽成标记，跑完子命令，再放回文本 */
          var ex = extractSubs(segRaw);   /* 必须用原文：屏蔽文本里的 $(…) 已经是 \x00 */
          if (!ex) {
            return { out: [], err: ['bash: 命令替换括号不配对: ' + segRaw], code: 2 };
          }
          var subs = ex.subs;
          if (subs.length) {
            var depth = (this._subDepth || 0) + 1;
            if (depth > SUB_MAX_DEPTH) {
              this._subDepth = 0;
              return { out: [], err: ['bash: 命令替换嵌套层数超过上限（' + SUB_MAX_DEPTH + ' 层），教学环境里多半是脚本自引用或死循环'], code: 2 };
            }
            this._subDepth = depth;
            try {
              for (var s = 0; s < subs.length; s++) {
                var subRes = this.exec(subs[s].cmd, { history: false, stdinState: stdinState });
                subs[s].value = (subRes.out || []).join('\n');
                this.lastCode = subRes.code;
              }
            } finally {
              this._subDepth = depth - 1;
            }
          }
          /* 交给 _execOne 的文本要保留"原文里的引号与替换结果"，同时保留
             屏蔽字符用来判断 `$CTRL` 与 `[[ … ]]`（两者都靠屏蔽后仍存在的形状）。 */
          /* 交给 _execOne 的文本是**原文形态**（引号、替换标记都在）。
             控制流 / `[[ … ]]` 这种"里面含 && || | 但不能切开"的片段，
             用 isCtrlLike 显式标出来 —— 不能再靠屏蔽字符传递：
             \x00 一旦漏进参数，就会变成 bash: \x00\x00: command not found。 */
          if (useMasked && isCtrlLike(segMasked)) {
            out.push(this.execSingle([ex.text], ex, st, stdinState, ctrlArg, pipeIn));
          } else {
            /* 非最后一段的输出进管道 → 对命令来说 stdout 不是终端（`ls | wc -l` 要靠它） */
            this._segTty = !(segs.length > 1 && si < segs.length - 1);
            out.push(this.execSingle(ex.text, ex, st, stdinState, ctrlArg, pipeIn));
            this._segTty = true;
          }
          /* ⚠️ 管道语义就在这里：**上一段的 stdout 要成为下一段的 stdin**。
             早先这个循环把每段各自独立跑完、再把 stdout 拼接起来返回，
             于是 `echo hello | grep ell` 里的 grep 既没有参数来源也没有标准输入，
             直接报 `Usage: grep [OPTION]... PATTERNS [FILE]...`；
             `cat x | tr 'a-z' 'A-Z'` 里的 tr 也收不到输入（还触发了"请用管道"的教学提示）。
             站内所有带管道的示例都靠这一条。 */
          pipeIn = out[out.length - 1].out || [];
        }
        if (out.length === 1) return out[0];
        /* 多段管道：只有**最后一段**的 stdout 进终端，stderr 与退出码按真 shell 的规矩合并。
           中间段落的输出是被下一段吃掉的，不能再往终端上打（否则 `echo hello | grep ell`
           会在报错前先看到一行 hello，看起来像 grep 自己打印的）。 */
        var merged = { out: [], err: [], code: 0 };
        for (var k = 0; k < out.length; k++) {
          merged.err = merged.err.concat(out[k].err || []);
          merged.code = out[k].code;
          if (out[k].clear) merged.clear = true;
        }
        merged.out = out[out.length - 1].out || [];
        return merged;
        } finally {
          /* 子 shell 的变量改动到此为止，父 shell 保持原样 */
          if (pipeSavedEnv !== null) this.env = pipeSavedEnv;
        }
      },

      execSingle: function (segment, ext, st, stdinState, ctrlArg, pipeIn) {
        return this._execOne(segment, ext, st, stdinState, ctrlArg, pipeIn);
      },

      /* 一段管道（或一条命令）的真正实现。
         pipeIn：上一段管道命令的 stdout（没有管道时为 undefined）。 */
      _execOne: function (segment, ext, st, stdinState, ctrlArg, pipeIn) {
        var self = this;
        var rawSeg = String(segment);
        st = st || this._execState;
        if (stdinState) this._readStdin = stdinState;

        /* 控制流：parser 已经解析好了，直接交给引擎 */
        var trimmed = rawSeg.trim();
        if (trimmed.indexOf('$CTRL') === 0) {
          return ctrlRun(this, ctrlArg || null, st, stdinState);
        }

        var segs = Array.isArray(segment) ? segment : splitPipeline(rawSeg);
        var ctx = {
          root: this.root, cwd: this.cwd, env: this.env, host: ENV,
          prevCwd: this.prevCwd || null,
          /* shell 自己也要挂上去：sudo 这类"转发给另一个命令"的实现需要再执行一行 */
          shell: this,
          /* stdout 是不是"人看的终端"：管道里 / 重定向到文件时是 false。
             目前 `ls` 用它决定"按列"还是"一行一个"（真 ls 也是这个规矩）。
             默认 true，避免在没有段信息的调用路径上把输出格式改掉。 */
          tty: true,
          get err() { return this._err || (this._err = []); },
          set err(v) { this._err = v; },
          _err: [], code: 0
        };

        var stdin = pipeIn === undefined ? null : pipeIn;
        var finalResult = { out: [], err: [], code: 0, clear: false };
        var mergeErr = false;

        for (var i = 0; i < segs.length; i++) {
          var seg = segs[i];
          /* ⚠️ `N=$(cmd | wc -l)` 这类**纯赋值**要单独处理。
             真 shell 的赋值不做字段切分，而本引擎是"先把替换结果写回文本、再切词"，
             于是 `wc -l` 输出的前导空格把 `N=      5` 切成了 `N=` 与 `5` 两个词：
             变量静默为空，还多报一句 `bash: 5: command not found`
             （`X=$(... | wc -l)` 是天天要用的写法，必须是对的）。
             这里只拦"整段就是一个 名字=单个命令替换"的情形，改动面最小。 */
          var asgM = seg.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(\u0002[0-9]+\u0003)\s*$/);
          if (asgM && ext && ext.subs) {
            var asgIdx = Number(asgM[2].slice(1, -1));
            var asgSub = ext.subs[asgIdx];
            if (asgSub) {
              self.env[asgM[1]] = String(asgSub.value === undefined ? '' : asgSub.value).replace(/\n+$/, '');
              ctx.code = 0;
              finalResult.code = 0;
              self.lastCode = 0;
              continue;
            }
          }
          seg = expandSubsIn(seg, ext);
          /* ⚠️ 子 shell `( 命令 )` 必须在 extractRedirect **之前**处理。
             原因：那个函数只认"出现在行尾的重定向"，`(echo hi > /tmp/f)` 里的
             `)` 会被当成文件名的最后一个字符一起吃掉，剩下的 `(echo hi` 括号不配对，
             于是报 `bash: (echo: command not found`；
             而 `(echo hi) > /tmp/f` 又会先被摘掉重定向，我的子 shell 分支
             直接 return、把"把结果写进文件"这一步整个跳过去（文件永远不生成）。
             两处合起来的效果就是：**站内 sh-devnull-devtcp 条目教的端口探测写法
             `(echo > /dev/tcp/10.0.1.23/80) 2>/dev/null && echo 可达` 跑不通。**
             这里的做法：先按括号配对把这一段拆成"子 shell 内容 + 尾部重定向"，
             内容交给引擎再跑一遍（真 shell 里子 shell 有自己的变量副本），
             尾部重定向用控制流那套 ctrlApplyOutRedirs 应用到结果上。 */
          var segT = String(seg).trim();
          if (segT.charAt(0) === '(') {
            var cp = matchCloseParen(segT, 0);
            if (cp > 1) {
              var subInner = segT.slice(1, cp).trim();
              var subRest = segT.slice(cp + 1).trim();
              var subEnvSaved = self.env;
              var subEnvCopy = copyEnv(subEnvSaved);
              var subRes;
              self.env = subEnvCopy;
              try {
                subRes = self.exec(subInner, { history: false, stdinState: stdinState });
              } finally {
                self.env = subEnvSaved;
              }
              if (subRest) {
                var srr = splitStmtRedir(subRest);
                if (srr.redirs && srr.redirs.length) subRes = ctrlApplyOutRedirs(self, srr.redirs, subRes);
              }
              if (subRes && subRes.clear) { finalResult.clear = true; return finalResult; }
              if (i === segs.length - 1) {
                finalResult.out = subRes.out || [];
                finalResult.err = finalResult.err.concat(subRes.err || []);
                finalResult.code = subRes.code;
                self.lastCode = subRes.code;
              } else {
                finalResult.out = subRes.out || [];
                finalResult.err = finalResult.err.concat(subRes.err || []);
                finalResult.code = subRes.code;
              }
              continue;
            }
          }
          var rd = extractRedirect(seg);
          if (rd.mergeErr) mergeErr = true;
          /* 这一段 stdout 的去向决定它是不是"终端"：
             管道里**非最后一段**的输出是喂给下一段的，重定向到文件的也不是终端。
             _execCommand 逐段算出 _segTty 传进来（_execOne 一次只看得见一段，
             自己数不出"我在不在管道里"，早先就是因此把 `ls | wc -l` 算成 1）。 */
          ctx.tty = this._segTty !== false && !rd.redirect;
          /* 变量展开的表：shell 自己的 env + 几个内建变量（`$USER`/`$HOME`/`$PWD`/`$?`/`$$`）。
             没有这几个的话 `echo "退出码 $?"`、`echo $HOME` 会静默展开成空字符串 ——
             看起来像"命令没输错但没输出"，比报错更难发现。 */
          var vars = {};
          for (var vk in self.env) { if (Object.prototype.hasOwnProperty.call(self.env, vk)) vars[vk] = self.env[vk]; }
          vars.USER = self.user;
          vars.HOME = ENV.home;
          vars.HOSTNAME = ENV.hostname;
          vars.PWD = ctx.cwd;
          vars.SHELL = '/bin/bash';
          vars.PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin';
          vars['?'] = String(self.lastCode === undefined ? 0 : self.lastCode);
          vars['$'] = '18442';
          /* 位置参数（$0 $1 $2 … $# $@ $*），控制流里才会非空 */
          var ps = self._positions || [];
          vars['0'] = 'bash';
          vars['#'] = String(ps.length);
          vars['@'] = ps.join(' ');
          vars['*'] = ps.join(' ');
          for (var pi = 0; pi < ps.length; pi++) {
            vars['#' + (pi + 1)] = ps[pi];
            vars['' + (pi + 1)] = ps[pi];
          }
          var tok = tokenizeDetail(rd.cmd);
          var expandErrs = [];
          /* `${VAR:?}` 这类"必须停下来"的展开错误：换一个新数组收集，
             展开完立刻还原，免得命令替换里再套一层时把外层的错误弄丢。 */
          var prevExpandErrs = EXPAND_ERRS;
          EXPAND_ERRS = expandErrs;
          var tokens = [];
          /* 先做变量/算术/参数展开（结果里再放命令替换标记） */
          var mid = tok.tokens.map(function (t, ti) {
            if (tok.quoteAt[ti] === "'") return t;   /* 单引号内容原样 */
            /* setVar：`${VAR:=值}` 要写回**真正的 env**，不能只写进 vars 这份副本 */
            return expandFieldText(t, vars, tok.quoteAt[ti] === '"', ext, undefined, function (n, v) { self.env[n] = v; });
          });
          EXPAND_ERRS = prevExpandErrs;
          if (expandErrs.length) {
            /* 展开阶段就该失败的命令不再往下跑（真 shell 里 `${VAR:?}` 会让脚本退出） */
            return { out: [], err: expandErrs, code: 1 };
          }
          /* 再按引号内外决定要不要做字段切分 */
          tokens = expandFields(mid, tok.quoteAt, vars);
          /* 引号只包住替换结果时，expandFields 已经处理；这里补 `"$(…)"` 的空值情形 */
          if (!tokens.length && tok.tokens.length) {
            mid.forEach(function (t, ti) {
              if (tok.quoteAt[ti] === '"' || tok.quoteAt[ti] === "'") tokens.push(expandMarkedField(t, vars, true).join(''));
            });
          }
          if (!tokens.length) continue;

          /* `[[ ... ]]` 是关键字，里面的 && / || 已被 maskBlocks 屏蔽成参数，
             这里把它们拼回一个表达式交给 CMDS['[['] 求值。 */
          if (tokens[0] === '[[') {
            tokens = ['[[', tokens.slice(1).join(' ').replace(/\s*\]\]\s*$/, '')];
          }

          var lineAssigns = [];
          while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) && tokens[0].indexOf('=') > 0) {
            var kv = tokens.shift();
            var eq = kv.indexOf('=');
            lineAssigns.push([kv.slice(0, eq), kv.slice(eq + 1)]);
          }
          /* 纯赋值（整段就是 `X=1`）→ 写进 shell 自己的变量表，后续片段与后续行都读得到 */
          if (!tokens.length) {
            for (var la = 0; la < lineAssigns.length; la++) self.env[lineAssigns[la][0]] = lineAssigns[la][1];
            ctx.code = 0;
            finalResult.code = 0;
            continue;
          }
          /* `VAR=值 命令` → 只给这一条命令的临时环境变量（真 shell 的行为） */
          for (var lb = 0; lb < lineAssigns.length; lb++) ctx.env[lineAssigns[lb][0]] = lineAssigns[lb][1];

          /* DBG-PIPE（临时插桩，只在 Node 端设了 DSH_DBG_PIPE 时输出，浏览器里无副作用） */
          if (typeof process !== 'undefined' && process.env && process.env.DSH_DBG_PIPE) {
            console.error('DBG seg#' + i + ' seg=' + JSON.stringify(seg) + ' cmd=' + JSON.stringify(rd.cmd) +
              ' tokens=' + JSON.stringify(tokens));
          }
          var cmdName = tokens[0];
          var args = tokens.slice(1);

          /* 别名展开 */
          if (ALIAS[cmdName] && typeof ALIAS[cmdName] === 'string') {
            var expanded = tokenize(ALIAS[cmdName]);
            cmdName = expanded[0];
            args = expanded.slice(1).concat(args);
          }

          /* ⚠️ 用**路径**调用命令时，按最后一段（basename）找实现。
             真 shell 里 `$JAVA_HOME/bin/java -version`、`/usr/bin/python3 -V`
             都合法 —— 走的是"这个路径上的可执行文件"。
             早先这里只按整串查表，于是站内 sh-var-export 的示例
               export JAVA_HOME=/usr/lib/jvm/java-17-openjdk && $JAVA_HOME/bin/java -version
             报 `bash: /usr/lib/jvm/java-17-openjdk/bin/java: command not found`，
             学员会以为 **JDK 没装**，而其实只是引擎不认带路径的调用。
             只对"含 `/` 且 basename 是已知命令"的情况回退。 */
          var baseName0 = null;
          if (!CMDS[cmdName] && cmdName.indexOf('/') !== -1) {
            baseName0 = cmdName.slice(cmdName.lastIndexOf('/') + 1);
            if (CMDS[baseName0] || ALIAS[baseName0]) {
              cmdName = baseName0;
              if (ALIAS[cmdName] && typeof ALIAS[cmdName] === 'string') {
                var expanded0 = tokenize(ALIAS[cmdName]);
                cmdName = expanded0[0];
                args = expanded0.slice(1).concat(args);
              }
            }
          }

          /* 合并 stderr 到 stdout：管道里**任何一段**写了 2>&1 都算 ——
             学员写 `nginx -t 2>&1 | tail -3` 的意图就是"把报错也给我看" */
          if (args.indexOf('2>&1') !== -1) {
            mergeErr = true;
            args = args.filter(function (x) { return x !== '2>&1'; });
          }

          var impl = CMDS[cmdName] || (cmdName === 'firewall-cmd' ? CMDS.firewall_cmd : null);
          if (!impl) {
            /* ⚠️ 子 shell：`(命令)` 是一段**独立执行**的命令。
               maskBlocks 会把括号块屏蔽成 \x00，于是 `(echo hi)` 走到这里时
               cmdName 是一串 NUL，报出 `bash: (echo: command not found` ——
               而 `(echo > /dev/tcp/10.0.1.23/80) 2>/dev/null && echo 可达`
               正是站内 sh-devnull-devtcp 条目教的端口探测写法。
               这里把首尾括号剥掉、把里面的命令交给引擎再跑一遍。
               真 shell 里子 shell 有自己的变量副本，所以照"管道段"的规矩用副本执行。 */
            if (cmdName.charAt(0) === '(' || /^[\u0000]+$/.test(cmdName)) {
              var inner = String(rd.cmd).trim();
              var closeP = inner.lastIndexOf(')');
              if (inner.charAt(0) === '(' && closeP > 0) {
                var innerCmd = inner.slice(1, closeP).trim();
                if (innerCmd) {
                  var subEnv = copyEnv(self.env);
                  var savedEnvS = self.env;
                  var subRes;
                  self.env = subEnv;
                  try {
                    subRes = self.exec(innerCmd, { history: false, stdinState: cmdStdin });
                  } finally {
                    self.env = savedEnvS;
                  }
                  finalResult.out = subRes.out || [];
                  finalResult.err = finalResult.err.concat(subRes.err || []);
                  finalResult.code = subRes.code;
                  self.lastCode = subRes.code;
                  return finalResult;
                }
              }
            }
            /* `sh -c "…"` / `bash -c "…"`：把字符串当脚本执行。
               `xargs … sh -c "sleep 1; echo 处理 {}"` 是常见写法，
               早先会报 `sh: 0: cannot open -c: No such file or directory`。 */
            if (cmdName === 'sh' || cmdName === 'bash' || cmdName === 'dash') {
              var ci = args.indexOf('-c');
              if (ci !== -1 && args[ci + 1] !== undefined) {
                var scriptRes = self.exec(String(args[ci + 1]), { history: false, stdinState: cmdStdin });
                finalResult.out = scriptRes.out || [];
                finalResult.err = finalResult.err.concat(scriptRes.err || []);
                finalResult.code = scriptRes.code;
                self.lastCode = scriptRes.code;
                return finalResult;
              }
            }
            var notImpl = NOT_IMPL[cmdName] || SHELL_EXTRA_UNSUPPORTED[cmdName];
            if (notImpl) {
              finalResult.err = finalResult.err.concat([cmdName + ': ' + notImpl]);
              finalResult.code = 127;
              return finalResult;
            }
            var kw = SHELL_KEYWORDS[cmdName];
            if (kw) {
              finalResult.err = finalResult.err.concat(['bash: ' + kw]);
              finalResult.code = 2;
              return finalResult;
            }
            if (ALIAS[cmdName] === null) {
              finalResult.err = finalResult.err.concat([cmdName + ': 教学环境未实现该命令（原因见分类里的对应条目）']);
              finalResult.code = 127;
              return finalResult;
            }
            finalResult.err = finalResult.err.concat(['bash: ' + cmdName + ': command not found']);
            finalResult.code = 127;
            return finalResult;
          }

          /* 输入重定向：`read x < file`、`cat < file` —— 把文件内容变成这一段的 stdin */
          var cmdStdin = stdin;
          var inRedirect = rd.inputRedirect || null;
          if (inRedirect) {
            var inAbs = resolvePath(ctx.cwd, inRedirect.file);
            if (inAbs === '/dev/null') cmdStdin = [];
            else {
              var inNode = findNode(this.root, inAbs);
              if (!inNode || inNode.type === 'dir') {
                finalResult.err = finalResult.err.concat(['bash: ' + inRedirect.file + ': No such file or directory']);
                finalResult.code = 1;
                return finalResult;
              }
              var inText = String(inNode.content || '');
              cmdStdin = inText === '' ? [] : inText.split('\n');
              if (cmdStdin.length && cmdStdin[cmdStdin.length - 1] === '') cmdStdin.pop();
            }
          }
          /* `read` 要看同一个游标，所以把当前 stdin 交给 shell。
             ⚠️ 但**没有**管道 / `<` 输入时不能把继承来的 stdin 抹成 null：
             `while read l; do …; done < file` 的条件与循环体都要用那个"循环流"，
             抹掉之后 `read` 拿到 null、立刻返回 1，于是整个循环体一次都不执行 ——
             屏幕上什么都不打印、也没有任何报错，看起来就像"命令没写错但没反应"。
             早先这里无条件写 `= cmdStdin ? … : null`，正是这个后果。 */
          var prevRead = self._readStdin;
          if (cmdStdin) self._readStdin = { lines: cmdStdin, pos: 0, owner: self };
          var res;
          try {
            res = impl(expandGlobs(args, ctx), ctx, cmdStdin, ENV);
          } finally {
            self._readStdin = prevRead;
          }
          if (!res || typeof res !== 'object') res = { out: [], err: [], code: 0 };
          if (res.clear) { finalResult.clear = true; return finalResult; }

          /* 命令可能把错误写进 ctx.err（例如 ls 找不到文件）并设置 ctx.code —— 必须收回来，
             否则命令的报错会被静默丢弃 */
          if (ctx._err && ctx._err.length) {
            res.err = (res.err || []).concat(ctx._err);
            ctx._err = [];
            if (res.code === 0 && ctx.code !== 0) res.code = ctx.code;
          }

          /* 重定向：把 stdout 写入文件（教学环境支持，体现在虚拟 FS 上）
             `2>` 表示这一路写的是 **stderr**，不是 stdout —— 见下面 isErrRd 分支。
             ⚠️ 这里是**一串**重定向，不是一条：`> out 2> err` 必须两条都生效。 */
          var outReds = rd.redirects || (rd.redirect && !rd.redirect.input ? [rd.redirect] : []);
          if (outReds.length) {
            var joinLines = function (arr) {
              arr = arr || [];
              return arr.join('\n') + (arr.length ? '\n' : '');
            };
            for (var ri = 0; ri < outReds.length; ri++) {
              var R = outReds[ri];
              var rAbs = resolvePath(ctx.cwd, R.file);
              var isErrRd = R.fd === '2';
              var bothRd = !!R.both;
              /* `&>` 与段末的 `2>&1` 都表示"stderr 也并到 stdout 去的地方" */
              var mergeHere = bothRd || !!rd.mergeErr;
              /* `/dev/tcp/<主机>/<端口>`：连接测试，不是写文件（详见 devTcpProbe） */
              var dtM = String(rAbs).match(/^\/dev\/(tcp|udp)\/([^/]+)\/(\d+)$/);
              if (dtM) {
                var probe = devTcpProbe(dtM[2], Number(dtM[3]), dtM[1], ctx.host && ctx.host.hostname);
                /* echo 的新行是写给 socket 的，真实终端上看不到任何输出 */
                res.out = [];
                if (probe.ok) {
                  res.code = 0;
                } else {
                  res.err = ['bash: connect: Connection refused',
                    'bash: ' + rAbs + ': Connection refused'];
                  res.code = 1;
                }
                continue;
              }
              /* `/dev/null` 是"丢弃"，不是"写文件" —— 必须在这里拦下来，
                 否则会往虚拟 FS 里真的建出一个叫 null 的普通文件。 */
              if (rAbs === '/dev/null') {
                if (isErrRd) { res.err = []; continue; }
                if (mergeHere) { res.out = []; res.err = []; continue; }
                res.out = []; continue;
              }
              var rParent = findNode(this.root, parentOf(rAbs));
              if (!rParent) {
                finalResult.err = finalResult.err.concat(['bash: ' + R.file + ': No such file or directory']);
                res.code = 1;
                continue;
              }
              var rName = baseName(rAbs);
              var existing = rParent.children[rName];
              /* `> 文件 2>&1` 里的 `2>&1` 表示"stderr 也并到 stdout 现在去的地方"，
                 所以**写文件时就要把 stderr 一起写进去**。
                 早先这里只看 bothRd（那是 `&>` 的标记），把 2>&1 漏了：
                 结果是 `ls /nope > /tmp/log 2>&1` 写出来的文件是空的、
                 stderr 照样糊在屏幕上 —— 而"把两路都收进同一个文件"正是这一步要教的东西。 */
              var text = isErrRd ? joinLines(res.err) : joinLines(res.out);
              if (mergeHere) text += joinLines(res.err);
              if (existing && existing.type === 'dir') {
                res.err = (res.err || []).concat(['bash: ' + R.file + ': Is a directory']);
                res.code = 1;
                continue;
              }
              if (existing && existing.type === 'file' && R.append) {
                existing.content = String(existing.content || '') + text;
              } else {
                var nf = newNode('file', rName);
                nf.content = text;
                nf.mtime = fmtNow();
                rParent.children[rName] = nf;
              }
              /* 已经进文件的那一路不再往终端上打 */
              if (isErrRd) res.err = [];
              else if (mergeHere) { res.out = []; res.err = []; }
              else res.out = [];
            }
            if (i === segs.length - 1) finalResult.out = res.out || [];
            finalResult.err = finalResult.err.concat(res.err || []);
            finalResult.code = res.code;
            return finalResult;
          }

          stdin = res.out || [];
          /* 管道里的 `read` 要吃掉输入流，所以 stdin 游标得跟着走 */
          if (self._readStdin && self._readStdin.pos) {
            stdin = self._readStdin.lines.slice(self._readStdin.pos);
          }
          if (i === segs.length - 1) {
            finalResult.out = res.out || [];
            finalResult.err = finalResult.err.concat(res.err || []);
            finalResult.code = res.code;
          } else if (res.err && res.err.length) {
            finalResult.err = finalResult.err.concat(res.err);
          }
        }

        /* 把状态写回 shell：这样 `cd /var/log && pwd` 才符合真 shell 行为。
           prevCwd 也必须一起带过去 —— `cd /data/app && cd -` 里两个片段
           各自有独立的 ctx，`-` 记的是 shell 的上一个目录，不是片段的。 */
        this.cwd = ctx.cwd;
        this.prevCwd = ctx.prevCwd;
        this.env = ctx.env;

        if (mergeErr) {
          finalResult.out = finalResult.out.concat(finalResult.err);
          finalResult.err = [];
        }
        return finalResult;
      }
    };
    shell.env = shell.env || {};
    shell._execState = null;
    shell._positions = [];
    shell._stdinState = null;
    shell._subDepth = 0;
    return shell;
  }


  /* 把一行按 `&&` / `;` / `||` 切开。语义：
       `&&` 前一条成功才继续；`||` 前一条失败才继续；`;` 无条件继续。
     早先只支持 `&&`，于是内容里的 `cmd >/dev/null 2>&1; echo "退出码 $?"`
     整串被当成一条命令的参数，报出莫名其妙的错。 */
  /* 复制一份变量表：管道右边在"子 shell"里跑，改动不能带回父 shell。
     站内 sh-while / sh-pipe / sh-read 三个条目都专门讲这个经典陷阱
     （`n=0; cat f | while read l; do n=$((n+1)); done; echo $n` → **0**），
     所以引擎必须和教材一致 —— 否则学员在这儿练出来的结论到真机上是错的。 */
  function copyEnv(env) {
    var o = {};
    for (var k in env) { if (Object.prototype.hasOwnProperty.call(env, k)) o[k] = env[k]; }
    return o;
  }

  /* 管道右边是控制流：把 `cmd | while …` 拆成"管道头"与"控制流"两半。
     必须在**屏蔽文本**上找 `|`（引号里的 `|` 已经变成 \x00，不该算管道），
     但切出来的内容要用**原文** —— 屏蔽不改变长度，所以按同一个偏移量切。 */
  function splitPipedControl(maskedCmd, rawCmd) {
    var m = String(maskedCmd).match(/^(.*?)\|\s*((?:for|while|until|if|case)\b[\s\S]*)$/);
    if (!m) return null;
    var raw = String(rawCmd);
    var bar = raw.indexOf('|', m[1].length);
    if (bar < 0) return null;
    var head = raw.slice(0, bar).trim();
    var ctrl = raw.slice(bar + 1).trim();
    if (!head || !ctrl) return null;
    return { head: head, ctrl: ctrl };
  }

  function splitByAnd(line) {
    var masked = maskBlocks(line);
    var scan = maskSubInteriors(masked === null ? String(line) : masked);
    var parts = [], raws = [], ops = [], cur = '', rcur = '', quote = null;
    for (var i = 0; i < scan.length; i++) {
      var ch = scan[i];
      var rawCh = line.charAt(i);
      /* \x00 = 被屏蔽的片段（引号串 / 括号块 / 替换标记），原文原样带过去 */
      /* ⚠️ cur 用**屏蔽后**的字符：引号里的 `|`、`[` 必须保持 \x00 形状，
         否则 `grep -E "a|b"` 的引号会被丢掉、`|` 被当成管道切开。
         rcur 才是原文（控制流执行时要用）。 */
      if (ch === '\u0000') { cur += ch; rcur += rawCh; continue; }
      if (quote) { cur += ch; rcur += rawCh; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; rcur += rawCh; continue; }
      var two = scan.substr(i, 2);
      if (two === '&&' || two === '||') {
        parts.push(cur); raws.push(rcur); ops.push(two); cur = ''; rcur = ''; i++; continue;
      }
      /* ⚠️ `;;` 是 **case 语法的分支分隔符**，不是"执行下一条命令"的分号。
         早先这里见到 `;` 就切，于是
           `case "$ans" in [Yy]) echo 删除 ;; *) echo 取消 ;; esac`
         被切成若干段、其中还有空段 —— 学员看到的是 `bash: : command not found`。
         站内 shell 分类里 case 的例子不少，所以这里把 `;;` 整对跳过、不切。 */
      if (ch === ';' && line.charAt(i + 1) === ';') { cur += ';;'; rcur += ';;'; i++; continue; }
      if (ch === ';') { parts.push(cur); raws.push(rcur); ops.push(';'); cur = ''; rcur = ''; continue; }
      cur += ch; rcur += rawCh;
    }
    parts.push(cur); raws.push(rcur);
    var out = [];
    for (var k = 0; k < parts.length; k++) {
      var t = parts[k].trim();
      var rt = String(raws[k] === undefined ? t : raws[k]).trim();
      if (t) out.push({ cmd: t, raw: rt || t, op: k === 0 ? ';' : ops[k - 1] });
    }
    return out;
  }

  window.CC_SHELL = {
    create: createShell,
    commands: Object.keys(CMDS),
    /* 命令实现的原始表。给扩展模块复用已有实现用 ——
       例如 `rg`（ripgrep）在真机上是独立工具、语法几乎等同 grep，
       cmd-text.js 直接转发到这里，避免"假装装了 ripgrep"又重复实现一遍匹配逻辑。 */
    cmds: CMDS,
    notImplemented: Object.keys(NOT_IMPL),
    /* 「这条命令为什么在模拟终端里跑不了」的文案查询。
       给界面用：命令详情页与故障剧本要给学员一句**具体原因**，
       而不是让他照着敲一遍、拿到一句光秃秃的 command not found 再自己猜。
       没有登记过原因时返回 null，调用方要如实说"未实现"而不是编一个理由。 */
    notImplementedReason: function (name) {
      var head = String(name || '').trim().split(/\s+/)[0];
      /* ⚠️ 两张表都要查。`NOT_IMPL` 是"命令存在但本站不做"，
         `SHELL_EXTRA_UNSUPPORTED` 是"shell 内建/语法，本站不支持" ——
         早先只查前者，于是 `trap`/`bash`/`nohup` 在**终端里**有具体解释、
         在**命令详情页**却退化成兜底的"教学环境没有实现它"，
         同一件事两个说法。查不到才返回 null，让调用方如实说"未实现"。 */
      return NOT_IMPL[head] || SHELL_EXTRA_UNSUPPORTED[head] || null;
    },
    /* 别名表的读写 —— `alias` 命令（cmd-basic3.js）要真的改到引擎的别名表，
       否则"定义别名之后 ll 就能用"这件事在终端里不成立。
       ALIAS 里 `null` 表示"知道这条命令、但按设计不实现"，
       所以 listAliases 只列出字符串值的那些。 */
    listAliases: function () {
      var o = {};
      Object.keys(ALIAS).forEach(function (k) { if (typeof ALIAS[k] === 'string') o[k] = ALIAS[k]; });
      return o;
    },
    getAlias: function (name) {
      return typeof ALIAS[name] === 'string' ? ALIAS[name] : null;
    },
    setAlias: function (name, value) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(String(name))) return false;
      ALIAS[name] = String(value);
      return true;
    },
    /* 「这条命令在模拟终端里跑得了吗」——**别名也算能跑**。
       `ll`/`la`/`less` 这些不在 CMDS 里，但引擎的别名表会把它们展开成真命令。
       页面上的「仅真机」标注与可跑统计都要用这个，不能只看 commands。 */
    runnable: function (name) {
      var head = String(name || '').trim().split(/\s+/)[0];
      if (!head) return false;
      if (CMDS[head]) return true;
      if (head === 'firewall-cmd') return true;
      return typeof ALIAS[head] === 'string';
    },
    host: BASE_HOST,
    hostOverrideSupport: true,

    /* ----------------------------------------------------------------------
       扩展接口：命令实现可以写在 assets/js/cmd-<组>.js 里，
       由 index.html / academy-lab.html 在 shell.js **之后**加载，然后：

         window.CC_SHELL.extend({ virsh: function (argv, ctx, stdin, HOST) {...} });

       为什么要拆文件：shell.js 已经 7000 行，几十条新命令塞进来既难读、
       也让人（和并行的作者）没法同时改不同的命令组。
       util 里放的是引擎内部那几个真正需要复用的工具函数。
       ---------------------------------------------------------------------- */
    extend: function (mod) {
      var added = [];
      Object.keys(mod || {}).forEach(function (k) {
        if (typeof mod[k] === 'function' && !CMDS[k]) { CMDS[k] = mod[k]; added.push(k); }
      });
      window.CC_SHELL.commands = Object.keys(CMDS);
      return added;
    },

    /* 往模拟文件系统里补文件（每个命令模块自己带自己的模拟数据）：
         window.CC_SHELL.fsAdd({
           '/data/images/rocky9-base.qcow2': { content: '<binary>image-1.2GB', size: 1288490188,
                                               mode: '644', user: 'root', mtime: '2024-03-10 11:20' },
           '/var/log/nginx/access.log-20240317.gz': { content: '...日志文本...', gz: true }
         });
       父目录不存在会自动创建；同路径只在第一次生效。 */
    fsAdd: function (map) {
      Object.keys(map || {}).forEach(function (p) {
        var d = map[p] || {};
        FS_EXTRA.push({
          path: p, type: d.type || 'file', content: d.content, gz: !!d.gz, target: d.target,
          mode: d.mode, user: d.user, group: d.group, mtime: d.mtime, size: d.size
        });
      });
      return FS_EXTRA.length;
    },
    util: {
      ok: ok,
      fail: fail,
      resolvePath: resolvePath,
      parentOf: parentOf,
      baseName: baseName,
      findNode: findNode,
      readFileOrErr: readFileOrErr,
      splitLines: splitLines,
      childrenSorted: childrenSorted,
      expandLongOpts: expandLongOpts,
      pad: pad,
      padLeft: padLeft,
      walkFiles: walkFiles,
      baseHost: BASE_HOST
    }
  };
})();
