/* assets/js/cmd-text.js · 文本与网络工具（A 档第四批）
   --------------------------------------------------------------------------
   覆盖的内容条目：
     linux-text  rg / yq / iconv / dos2unix
     linux-net   ifconfig / route / arping / ethtool / iftop / nethogs / tshark
                 nft / iptables-save / ipset / ufw / ssh-copy-id

   ── 这一批的分寸（三条，都写在各命令的注释里）────────────────────────────
   1. **能真做的就真做**：`ifconfig`/`route` 是 `ip` 的旧写法，数据源与 `ip addr` /
      `ip route` 同源（`window.CC_TERM_FS`），所以做出来既真实又能在两种写法间对照；
      `rg` 复用引擎的 grep 实现（语法几乎一致）、`dos2unix` 真的把 CR 去掉。
   2. **没有真实字节流的，不假装转码**：`iconv` 只翻转编码标记并说明；
      仿真文件是 JS 字符串，没有 GBK 字节可以转。
   3. **要真实内核 / 网卡 / 抓包的，如实说不做**（`ethtool` `nft` `iptables-save`
      `ipset` `ufw` `arping` `tshark` `iftop` `nethogs`）——
      这些已经在 `NOT_IMPL` 里登记过原因，这里**不注册实现**，
      让引擎走"未实现 + 原因"那条路，页面与终端口径一致。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;

  var U = window.CC_SHELL.util;
  var ok = U.ok, fail = U.fail;

  /* ==================== rg：ripgrep ≈ grep 的加速版 ====================
     真机上 `rg` 是独立安装的工具，但语法与 grep 高度重合。
     教学环境直接**复用 grep 的实现**：这样既不用假装装了个包，
     又让学员练到的写法在真机上能直接迁移（`-n -i -l -c -A/-B/-C -g/--include`）。
     `-t py` 这种"按文件类型过滤"的写法映射成 `--include=*.py`。 */
  var RG_TYPES = {
    py: '*.py', js: '*.js', ts: '*.ts', java: '*.java', go: '*.go', rs: '*.rs',
    sh: '*.sh', yaml: '*.yaml', yml: '*.yml', json: '*.json', xml: '*.xml',
    conf: '*.conf', sql: '*.sql', md: '*.md', html: '*.html', css: '*.css', log: '*.log'
  };
  function rgCmd(argv, ctx, stdin, HOST) {
    var grep = null;
    /* grep 的实现在 shell.js 里，通过 CC_SHELL.cmds 暴露（见 shell.js 的暴露块） */
    if (window.CC_SHELL.cmds) grep = window.CC_SHELL.cmds.grep;
    if (!grep) return fail(['rg: 教学环境内部错误（grep 未就绪）']);
    var mapped = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-t' || a === '--type') {
        var t = String(argv[++i]);
        if (RG_TYPES[t]) mapped.push('--include=' + RG_TYPES[t]);
        else return fail(['rg: unrecognized file type: ' + t,
          '（教学环境内置常用类型：' + Object.keys(RG_TYPES).join(' ') + '；其它类型请用 -g "*.ext"）']);
        continue;
      }
      if (a === '-g' || a === '--glob') { mapped.push('--include=' + String(argv[++i])); continue; }
      if (a === '-uu' || a === '-u' || a === '--hidden' || a === '--no-ignore' || a === '--smart-case') continue;
      mapped.push(a);
    }
    /* rg 的默认行为比 grep -r 多两点：跳过隐藏文件、默认带行号。
       这里补上 -n（rg 默认给行号），其余交给 grep。 */
    if (mapped.indexOf('-n') === -1) mapped.unshift('-n');
    if (mapped.indexOf('-r') === -1) mapped.unshift('-r');
    return grep(mapped, ctx, stdin, HOST);
  }

  /* ==================== yq：YAML 取值（子集） ====================
     真 `yq` 是个完整的表达式语言，这里只做**教学最常用的那条路径**：
     按 `.a.b[0].c` 这样的路径取值 + `-i` 就地改单个标量值。
     覆盖不了时**明确报错**，不静默返回空（那会让人以为"配置里没这一项"）。 */
  function parseYaml(text) {
    /* 极简 YAML 解析：只认缩进层级、`key:`、`key: value`、`- item`。
       够用来演示 `.spec.replicas`、`.spec.template.spec.containers[].image` 这类取值。

       ⚠️ 这里踩过一个真实的坑：`key:` 后面跟 `- item` 时，**数组要直接挂到 key 上**。
       早先的写法把数组建在了子对象里面，于是 `.spec.template.spec.containers`
       取出来是 `{"containers":[...]}` —— 多套了一层，`containers[0].image` 永远取不到。
       现在用"**先看下一行的形状再决定建对象还是数组**"解决：
       `key:` 之后若下一有效行以 `-` 开头、且缩进更深，就建数组；否则建对象。 */
    var lines = String(text).split('\n');
    var root = {};
    var stack = [{ indent: -1, node: root }];
    function top() { return stack[stack.length - 1]; }
    /* 找下一条有效行（跳过空行与注释） */
    function nextSignificant(from) {
      for (var i = from; i < lines.length; i++) {
        var raw = lines[i];
        if (raw.trim() === '' || /^\s*#/.test(raw)) continue;
        return { indent: raw.length - raw.replace(/^\s+/, '').length, body: raw.trim() };
      }
      return null;
    }
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (raw.trim() === '' || /^\s*#/.test(raw)) continue;
      var indent = raw.length - raw.replace(/^\s+/, '').length;
      var body = raw.trim();
      while (stack.length > 1 && indent <= top().indent) stack.pop();
      var container = top().node;
      if (body.charAt(0) === '-') {
        var item = body.slice(1).trim();
        if (!Array.isArray(container)) continue;         /* 形状不符：忽略，不抛 */
        if (item === '') {
          var emptyObj = {};
          container.push(emptyObj);
          stack.push({ indent: indent, node: emptyObj });
          continue;
        }
        var ci = item.indexOf(':');
        if (ci > 0) {
          var o2 = {};
          o2[item.slice(0, ci).trim()] = scalar(item.slice(ci + 1).trim());
          container.push(o2);
          stack.push({ indent: indent, node: o2 });
        } else container.push(scalar(item));
        continue;
      }
      var ci2 = body.indexOf(':');
      if (ci2 < 0) continue;
      var k = body.slice(0, ci2).trim();
      var v = body.slice(ci2 + 1).trim();
      if (v === '') {
        var nx = nextSignificant(i + 1);
        var child = (nx && nx.indent > indent && nx.body.charAt(0) === '-') ? [] : {};
        container[k] = child;
        stack.push({ indent: indent, node: child });
      } else {
        container[k] = scalar(v);
      }
    }
    return root;
  }
  function scalar(v) {
    var s = String(v).replace(/^["']|["']$/g, '');
    if (/^-?\d+$/.test(s)) return Number(s);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null' || s === '~') return null;
    return s;
  }
  function pickPath(obj, path) {
    /* 支持 .a.b / [0] / []（展开数组每个元素的该字段） */
    var segs = String(path).replace(/^\./, '').split(/\.(?![^\[]*\])/).filter(function (x) { return x !== ''; });
    var cur = [obj];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var idxs = [];
      var name = seg.replace(/\[(\d*)\]/g, function (m, d) { idxs.push(d === '' ? '*' : Number(d)); return ''; });
      var next = [];
      cur.forEach(function (node) {
        var base = node;
        if (name !== '') base = (node === null || node === undefined) ? undefined : node[name];
        if (idxs.length === 0) { if (base !== undefined) next.push(base); return; }
        idxs.forEach(function (ix) {
          if (Array.isArray(base)) {
            if (ix === '*') base.forEach(function (el) { next.push(el); });
            else if (base[ix] !== undefined) next.push(base[ix]);
          }
        });
      });
      cur = next;
    }
    var out = [];
    cur.forEach(function (v2) {
      if (v2 === null || v2 === undefined) out.push('null');
      else if (typeof v2 === 'object') out.push(JSON.stringify(v2));
      else out.push(String(v2));
    });
    return out;
  }
  function yqCmd(argv, ctx) {
    var inPlace = false, positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-i' || a === '--inplace') { inPlace = true; continue; }
      if (a === '-r' || a === '--raw-output' || a === '-e' || a === '--exit-status') continue;
      if (a === '-p' || a === '--print-format' || a === '-o' || a === '--output-format') { i++; continue; }
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['yq: 教学环境只实现了最常用的取值与就地改值（-i）；其它选项见真机文档']);
      }
      positional.push(a);
    }
    if (positional.length < 2) return fail(['yq: 用法 yq \'<表达式>\' <文件.yaml>（教学环境支持路径取值与 -i 改标量）']);
    var expr = positional[0], file = positional[1];
    var r = U.readFileOrErr(ctx, file);
    if (r.err) return fail(['yq: open ' + file + ': no such file or directory'], 1);
    /* `-i ".spec.replicas = 3"`：就地改单个标量 */
    var asg = expr.match(/^(\.[\w.\[\]]+)\s*=\s*(.+)$/);
    if (asg) {
      var path = asg[1], val = scalar(asg[2]);
      var lines = U.splitLines(r.content);
      var leaf = path.split('.').pop().replace(/\[.*\]/, '');
      var hit = 0;
      for (var li = 0; li < lines.length; li++) {
        var m = String(lines[li]).match(/^(\s*)("?)([\w.-]+)\2:\s*(.*)$/);
        if (m && m[3] === leaf) {
          lines[li] = m[1] + m[3] + ': ' + (typeof val === 'string' ? val : JSON.stringify(val));
          hit++;
        }
      }
      if (!hit) return fail(['yq: 在 ' + file + ' 里找不到路径 ' + path + '（教学环境按"最末一级键名"定位单行标量）'], 1);
      if (inPlace) {
        var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, file));
        if (node) {
          node.content = lines.join('\n') + (r.content.slice(-1) === '\n' ? '\n' : '');
          node.mtime = '2024-03-18 09:51';
        }
        return ok([]);   /* `-i` 成功时无输出（真 yq 行为） */
      }
      return ok([lines.join('\n')]);
    }
    var data;
    try { data = parseYaml(r.content); } catch (e) { return fail(['yq: 无法解析 YAML: ' + e.message]); }
    var vals = pickPath(data, expr);
    if (!vals.length) return ok([]);   /* 真 yq 取不到值也是空输出 + 退出码 0 */
    return ok(vals);
  }

  /* ==================== iconv：编码转换（翻转标记，不假装转字节） ====================
     ⚠️ 仿真文件是 JS 字符串，没有 GBK 字节流可转。这里只把节点上的 `__encoding`
     标记翻一下、并**如实说明**"内容没变，真实转码请在真机上做"。
     不这么做的话，学员会以为 `iconv -f GBK -t UTF-8` 一跑乱码就好了。 */
  var ENCODINGS = ['UTF-8', 'UTF8', 'GBK', 'GB2312', 'GB18030', 'ISO-8859-1', 'LATIN1', 'ASCII', 'BIG5'];
  function iconvCmd(argv, ctx) {
    var from = null, to = null, positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-f' || a === '--from-code') { from = String(argv[++i]); continue; }
      if (a === '-t' || a === '--to-code') { to = String(argv[++i]); continue; }
      if (a === '-l' || a === '--list') return ok([ENCODINGS.join('  ')]);
      if (a === '-c' || a === '--silent' || a === '-s') continue;
      if (a.charAt(0) === '-' && a.length > 1) return fail(['iconv: 教学环境支持 -f / -t / -l / -c / -o / -s']);
      positional.push(a);
    }
    if (!from || !to) return fail(['iconv: missing source or target encoding (用 -f 源 -t 目标)']);
    function norm(e) { return String(e).toUpperCase().replace(/[_-]/g, ''); }
    if (ENCODINGS.map(norm).indexOf(norm(from)) === -1) {
      return fail(['iconv: 不认识的源编码 \'' + from + '\'（教学环境内置 ' + ENCODINGS.join(' / ') + '）'], 1);
    }
    if (ENCODINGS.map(norm).indexOf(norm(to)) === -1) {
      return fail(['iconv: 不认识的目标编码 \'' + to + '\'（教学环境内置 ' + ENCODINGS.join(' / ') + '）'], 1);
    }
    if (!positional.length) return fail(['iconv: 需要文件名（教学环境不支持从标准输入转码）']);
    var r = U.readFileOrErr(ctx, positional[0]);
    if (r.err) return fail(['iconv: ' + positional[0] + ': No such file or directory'], 1);
    var node = U.findNode(ctx.root, r.abs);
    var before = (node && node.__encoding) || '（未标记，按 UTF-8 处理）';
    if (node) node.__encoding = to.toUpperCase();
    /* 真 iconv 把结果写到标准输出；内容本身不变（仿真里没有真实字节） */
    return { out: U.splitLines(r.content), err: [
      '（教学环境）已把文件的编码标记从 ' + before + ' 改为 ' + to.toUpperCase() + '，但**内容字节没有变** ——',
      '仿真文件是文本节点、没有 GBK 字节流可转。真机上这条命令会输出转码后的内容（通常配合 `> 新文件`）。',
      '判断文件真实编码用 `file -i 文件`；编码转换后**务必核对中文有没有变成乱码**。'
    ], code: 0 };
  }

  /* ==================== dos2unix：这个能真做 ====================
     行尾 CR 是真实存在于内容里的（夹具里就写着 \r\n），所以**真去掉**。
     这正是最常见的那类故障：Windows 传上来的脚本报 `\r: command not found`。 */
  function dos2unixCmd(argv, ctx) {
    var keepDate = false, infoOnly = false, fromFile = null, positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-k' || a === '--keepdate') { keepDate = true; continue; }
      if (a === '-n' || a === '--newfile') { fromFile = String(argv[++i]); continue; }
      if (a === '-i' || a === '--info') { infoOnly = true; continue; }
      if (a === '-q' || a === '--quiet' || a === '-o' || a === '--oldfile' || a === '-f' || a === '--force') continue;
      if (a === '-u' || a === '--unix2dos' || a === '-m' || a === '--add-bom') {
        return fail(['dos2unix: 教学环境只实现"CRLF → LF"方向（要反向转换请用 unix2dos，本站未实现）']);
      }
      if (a.charAt(0) === '-' && a.length > 1) return fail(['dos2unix: 教学环境支持 -k / -n / -i / -q / -o / -f']);
      positional.push(a);
    }
    var targets = fromFile !== null ? [fromFile] : positional;
    if (!targets.length) return fail(['dos2unix: 需要文件名', 'Try \'dos2unix --help\' for more information.']);
    var out = [], total = 0;
    targets.forEach(function (t) {
      var r = U.readFileOrErr(ctx, t);
      if (r.err) { out.push('dos2unix: ' + t + ': No such file or directory'); return; }
      var node = U.findNode(ctx.root, r.abs);
      var crlf = (String(r.content).match(/\r\n/g) || []).length;
      var lone = (String(r.content).match(/\r(?!\n)/g) || []).length;
      if (infoOnly) {
        out.push('       ' + t + ': ' + (crlf || lone ? 'DOS 行尾（CRLF ' + crlf + ' 处' + (lone ? '，单独 CR ' + lone + ' 处' : '') + '）' : 'UNIX 行尾（LF），无需转换'));
        return;
      }
      var to = positional[0] && fromFile !== null ? positional[0] : null;
      var fixed = String(r.content).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (fromFile !== null && to) {
        /* `-n 源 目标`：不动源文件，写到新文件 */
        var tAbs = U.resolvePath(ctx.cwd, to);
        var tParent = U.findNode(ctx.root, U.parentOf(tAbs));
        if (!tParent) { out.push('dos2unix: ' + to + ': No such file or directory'); return; }
        var tName = String(tAbs).slice(String(tAbs).lastIndexOf('/') + 1);
        var nf = JSON.parse(JSON.stringify(node || { type: 'file' }));
        nf.content = fixed;
        nf.mtime = '2024-03-18 09:51';
        tParent.children[tName] = nf;
        out.push('dos2unix: converting file ' + fromFile + ' to file ' + to + ' in UNIX format...');
      } else {
        node.content = fixed;
        if (!keepDate) node.mtime = '2024-03-18 09:51';
        out.push('dos2unix: converting file ' + t + ' to UNIX format...');
      }
      total += crlf + lone;
    });
    out.push('（教学环境）共处理 ' + total + ' 处行尾。等价写法：`sed -i "s/\\r$//" 文件` 或 `tr -d "\\r"`。');
    return ok(out);
  }

  /* ==================== ifconfig / route：net-tools 的旧写法 ====================
     数据源与 `ip addr` / `ip route` 同源（termfs），所以做出来既真实、
     又能让学员在两种写法之间对照 —— 这正是这两个命令现在唯一的价值。 */
  function ifconfigCmd(argv, ctx) {
    var onlyAll = argv.indexOf('-a') !== -1;
    var want = argv.filter(function (a) { return String(a).charAt(0) !== '-'; });
    var addrs = ((window.CC_TERM_FS || {}).host && window.CC_TERM_FS.host.addrs) || null;
    /* 与 ip addr 保持一致：优先用 termfs 的地址表，没有就回落到基准主机 */
    var list = [];
    if (addrs && addrs.length) {
      addrs.forEach(function (a) { list.push({ name: a.dev, ip: a.ip, prefix: a.prefix, mac: a.mac || '00:16:3e:0a:1b:2c' }); });
    } else {
      var h = U.baseHost || {};
      list.push({ name: 'eth0', ip: h.ip || '10.0.1.23', prefix: 24, mac: '00:16:3e:0a:1b:2c' });
      list.push({ name: 'lo', ip: '127.0.0.1', prefix: 8, mac: '00:00:00:00:00:00' });
    }
    if (want.length) list = list.filter(function (x) { return want.indexOf(x.name) !== -1; });
    if (!list.length && want.length) return fail(['ifconfig: 接口 ' + want[0] + ' 不存在（用 ifconfig -a 看全部）'], 1);
    var out = [];
    list.forEach(function (x) {
      out.push(x.name + ': flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500');
      out.push('        inet ' + x.ip + '  netmask ' + prefixToMask(x.prefix) + '  broadcast ' + broadcastOf(x.ip, x.prefix));
      out.push('        inet6 fe80::216:3eff:fe0a:1b2c  prefixlen 64  scopeid 0x20<link>');
      out.push('        ether ' + x.mac + '  txqueuelen 1000  (Ethernet)');
      out.push('        RX packets 184320  bytes 214748364  (204.7 MiB)');
      out.push('        RX errors 0  dropped 0  overruns 0  frame 0');
      out.push('        TX packets 152004  bytes 98765432  (94.1 MiB)');
      out.push('        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0');
      out.push('');
    });
    if (out.length) out.pop();
    out.push('（教学环境）`ifconfig` 属已停维护的 net-tools，新系统默认不再安装 —— 同样的信息用 `ip addr` 看，本站两条都能跑，可对照。');
    return ok(out);
  }
  function prefixToMask(p) {
    var n = Number(p);
    if (isNaN(n)) return '255.255.255.0';
    var m = [0, 0, 0, 0];
    for (var i = 0; i < 4; i++) { var bits = Math.min(8, Math.max(0, n - i * 8)); m[i] = 256 - Math.pow(2, 8 - bits); }
    return m.join('.');
  }
  function broadcastOf(ip, p) {
    var parts = String(ip).split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return '10.0.1.255';
    var mask = prefixToMask(p).split('.').map(Number);
    return parts.map(function (x, i) { return (x | (~mask[i] & 255)); }).join('.');
  }

  function routeCmd(argv, ctx) {
    var numeric = argv.indexOf('-n') !== -1;
    var rows = [
      ['0.0.0.0', '10.0.1.1', '0.0.0.0', 'UG', '0', '0', '0', 'eth0'],
      ['10.0.1.0', '0.0.0.0', '255.255.255.0', 'U', '0', '0', '0', 'eth0'],
      ['169.254.0.0', '0.0.0.0', '255.255.0.0', 'U', '1002', '0', '0', 'eth0'],
      ['172.17.0.0', '0.0.0.0', '255.255.0.0', 'U', '0', '0', '0', 'docker0']
    ];
    var out = ['Kernel IP routing table',
      'Destination     Gateway         Genmask         Flags Metric Ref    Use Iface'];
    rows.forEach(function (r) {
      out.push(r[0].padEnd(16) + r[1].padEnd(16) + r[2].padEnd(16) + r[3].padEnd(6) + r[4].padEnd(7) + r[5].padEnd(7) + r[6].padEnd(7) + r[7]);
    });
    if (!numeric) out.push('（教学环境）不加 `-n` 时 `route` 会把网关反查成主机名，排障时一律用 `route -n` 避免 DNS 卡顿。');
    out.push('（教学环境）`route` 同样属 net-tools，等价写法是 `ip route`（本站已实现，建议对照着看）。');
    return ok(out);
  }

  /* ==================== paste：按列合并 ==================== */
  function pasteCmd(argv, ctx, stdin) {
    var serial = false, delim = '\t', files = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-s' || a === '--serial') { serial = true; continue; }
      if (a === '-d' || a === '--delimiters') { delim = String(argv[++i]); continue; }
      if (/^-d./.test(a)) { delim = a.slice(2); continue; }
      if (a === '-z' || a === '--zero-terminated') continue;
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['paste: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'paste --help\' for more information.']);
      }
      files.push(a);
    }
    /* `paste` 的 `-d` 支持 `\t` `\n` 这类转义，也支持多字符轮换分隔符 */
    delim = delim.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\0/g, '');
    function sepAt(n) { return delim.charAt(n % Math.max(1, delim.length)); }
    if (!files.length) {
      /* 没有文件参数时读标准输入，按行原样输出（真实行为） */
      return ok((stdin || []).slice());
    }
    var cols = files.map(function (f) {
      var r = U.readFileOrErr(ctx, f);
      if (r.err) return null;
      var lines = U.splitLines(r.content);
      return lines;
    });
    for (var k = 0; k < cols.length; k++) {
      if (cols[k] === null) return fail(['paste: ' + files[k] + ': No such file or directory'], 1);
    }
    var out = [];
    if (serial) {
      /* `-s`：把**每个文件**的每一行拼成一行 */
      cols.forEach(function (lines) {
        out.push(lines.join(sepAt(0)));
      });
      return ok(out);
    }
    var maxLen = Math.max.apply(null, cols.map(function (c) { return c.length; }));
    for (var row = 0; row < maxLen; row++) {
      var cells = [];
      for (var ci = 0; ci < cols.length; ci++) {
        cells.push(cols[ci][row] === undefined ? '' : cols[ci][row]);
      }
      /* 分隔符按列轮换（与真 paste 一致） */
      var line = cells[0];
      for (var cj = 1; cj < cells.length; cj++) line += sepAt(cj - 1) + cells[cj];
      out.push(line);
    }
    return ok(out);
  }

  /* ==================== join：按公共字段合并两个已排序文件 ==================== */
  function joinCmd(argv, ctx) {
    var field1 = 1, field2 = 1, delim = null, outFields = null, emptyFill = null;
    var leftOuter = false, rightOuter = false, bothOuter = false, ignoreCase = false;
    var positional = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-1') { field1 = Number(argv[++i]); continue; }
      if (a === '-2') { field2 = Number(argv[++i]); continue; }
      if (/^-1\d+$/.test(a)) { field1 = Number(a.slice(2)); continue; }
      if (/^-2\d+$/.test(a)) { field2 = Number(a.slice(2)); continue; }
      if (a === '-t') { delim = String(argv[++i]); continue; }
      if (/^-t./.test(a)) { delim = a.slice(2); continue; }
      if (a === '-o') { outFields = String(argv[++i]); continue; }
      if (/^-o./.test(a)) { outFields = a.slice(2); continue; }
      if (a === '-e') { emptyFill = String(argv[++i]); continue; }
      if (/^-e./.test(a)) { emptyFill = a.slice(2); continue; }
      if (a === '-a') { var w = String(argv[++i]); if (w === '1') leftOuter = true; else if (w === '2') rightOuter = true; continue; }
      if (a === '-v') { var w2 = String(argv[++i]); if (w2 === '1') leftOuter = true; else rightOuter = true; continue; }
      if (a === '-i' || a === '--ignore-case') { ignoreCase = true; continue; }
      if (a === '-j') { field1 = field2 = Number(argv[++i]); continue; }
      if (a === '--header' || a === '-1' || a === '-2') continue;
      if (a.charAt(0) === '-' && a.length > 1 && !/^-\d/.test(a)) {
        return fail(['join: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'join --help\' for more information.']);
      }
      positional.push(a);
    }
    if (positional.length < 2) return fail(['join: missing operand', 'Try \'join --help\' for more information.']);
    function readRows(f) {
      var r = U.readFileOrErr(ctx, f);
      if (r.err) return null;
      return U.splitLines(r.content).filter(function (l) { return String(l).trim() !== ''; }).map(function (l) {
        return delim === null ? String(l).trim().split(/\s+/) : String(l).split(delim);
      });
    }
    var A = readRows(positional[0]), B = readRows(positional[1]);
    if (A === null) return fail(['join: ' + positional[0] + ': No such file or directory'], 1);
    if (B === null) return fail(['join: ' + positional[1] + ': No such file or directory'], 1);
    /* ⚠️ 真 `join` 要求两个文件都按连接字段排好序，**否则会静默缺行**。
       这里如实检查并在乱序时给出警告 —— 这正是这个命令最容易踩的坑，
       教学环境必须把它暴露出来，而不是跟着一起静默给错结果。 */
    function sortedOK(rows, fi) {
      for (var i = 1; i < rows.length; i++) {
        var p = rows[i - 1][fi - 1] === undefined ? '' : rows[i - 1][fi - 1];
        var c = rows[i][fi - 1] === undefined ? '' : rows[i][fi - 1];
        if ((ignoreCase ? p.toLowerCase() : p) > (ignoreCase ? c.toLowerCase() : c)) return false;
      }
      return true;
    }
    var warn = [];
    if (!sortedOK(A, field1)) warn.push('join: ' + positional[0] + ' 没有按第 ' + field1 + ' 列排序，结果可能缺行（真机也一样）');
    if (!sortedOK(B, field2)) warn.push('join: ' + positional[1] + ' 没有按第 ' + field2 + ' 列排序，结果可能缺行（真机也一样）');
    var key = function (row, fi) {
      var v = row[fi - 1] === undefined ? '' : String(row[fi - 1]);
      return ignoreCase ? v.toLowerCase() : v;
    };
    var bIndex = {};
    B.forEach(function (row) { var k = key(row, field2); (bIndex[k] = bIndex[k] || []).push(row); });
    var usedB = {}, out = [];
    function pick(row, fi) {
      /* row 可能是 null —— `-a 1` 左外连接时没有匹配的右表行，
         此时所有来自右表的列都填空（`-e` 指定填什么）。
         早先这里直接 `row[fi - 1]`，null 上取下标会**抛异常把整个终端打断**。 */
      if (!row) return emptyFill === null ? '' : emptyFill;
      var v = row[fi - 1];
      return v === undefined ? (emptyFill === null ? '' : emptyFill) : v;
    }
    function fmt(rowA, rowB) {
      /* `-o 1.1,2.2`：显式指定输出列 */
      if (outFields) {
        return outFields.split(/[,\s]+/).filter(Boolean).map(function (spec) {
          var m = spec.match(/^(0|1|2)\.(\d+)$/);
          if (!m) return spec;
          var side = m[1], idx = Number(m[2]);
          if (side === '1') return pick(rowA, idx);
          if (side === '2') return pick(rowB, idx);
          return pick(rowA, 1);
        }).join(delim === null ? ' ' : delim);
      }
      var joined = [pick(rowA, field1)];
      (rowA || []).forEach(function (v, ix) { if (ix !== field1 - 1) joined.push(v); });
      (rowB || []).forEach(function (v, ix) { if (ix !== field2 - 1) joined.push(v); });
      return joined.join(delim === null ? ' ' : delim);
    }
    A.forEach(function (rowA) {
      var k = key(rowA, field1);
      var matches = bIndex[k];
      if (matches && matches.length) {
        usedB[k] = true;
        matches.forEach(function (rowB) { out.push(fmt(rowA, rowB)); });
        return;
      }
      /* 没有匹配：`-a 1` 时补空（左外连接），否则整行丢掉（这正是 join 的默认语义） */
      if (leftOuter) out.push(fmt(rowA, null));
    });
    if (rightOuter) {
      B.forEach(function (rowB) {
        if (usedB[key(rowB, field2)]) return;
        var joined = [pick(rowB, field2)];
        (rowB || []).forEach(function (v, ix) { if (ix !== field2 - 1) joined.push(v); });
        out.push(joined.join(delim === null ? ' ' : delim));
      });
    }
    return { out: out, err: warn, code: warn.length ? 1 : 0 };
  }

  /* ==================== 注册 ==================== */
  window.CC_SHELL.extend({
    'rg': function (argv, ctx, stdin, HOST) { return rgCmd(argv, ctx, stdin, HOST); },
    'yq': function (argv, ctx) { return yqCmd(argv, ctx); },
    'iconv': function (argv, ctx) { return iconvCmd(argv, ctx); },
    'dos2unix': function (argv, ctx) { return dos2unixCmd(argv, ctx); },
    'ifconfig': function (argv, ctx) { return ifconfigCmd(argv, ctx); },
    'route': function (argv, ctx) { return routeCmd(argv, ctx); },
    'paste': function (argv, ctx, stdin) { return pasteCmd(argv, ctx, stdin); },
    'join': function (argv, ctx) { return joinCmd(argv, ctx); }
  });
})();
