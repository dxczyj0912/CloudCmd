/* assets/js/cmd-host.js · 主机状态与身份（A 档第三批）
   --------------------------------------------------------------------------
   覆盖的内容条目（全部属 linux-user，这是课程数最少的分类之一）：
     hostnamectl  timedatectl  lsb_release  umask  runlevel
     lastlog      loginctl     localectl    update-alternatives
     dmidecode    shutdown      halt         poweroff   systemd-analyze

   ── 两条诚实性原则（本模块贯彻得很彻底，因为这一批大多是"能改主机"的命令）──
   1. **会改主机状态的，真改**（hostnamectl set-hostname、timedatectl set-timezone、
      umask、update-alternatives --set）。它们落在虚拟 FS 或 shell 状态上，
      改完能立刻用另一条命令验证 —— 这才形成"操作 → 验证"的闭环。
   2. **会关机的，绝不假装成功**。`shutdown` / `halt` / `poweroff` 在真机上会让你
      断线，教学环境里假装"已关机"是最坏的一种骗：学员会以为这条命令"没危险"。
      所以它们如实说明"不会真的执行"，同时**把参数解析与取消逻辑讲清楚**
      （`-h +10` 的时间格式、`shutdown -c` 怎么取消），那才是要学的东西。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;

  var U = window.CC_SHELL.util;
  var ok = U.ok, fail = U.fail;

  /* 主机状态存在哪里：挂在 shell 的 env 上（每个会话一份，与真机语义接近） */
  function hostState(ctx) {
    var e = ctx.env || {};
    if (!e.__HOSTNAME) e.__HOSTNAME = (U.baseHost && U.baseHost.hostname) || 'web-prod-01';
    if (!e.__TIMEZONE) e.__TIMEZONE = 'Asia/Shanghai';
    if (!e.__LOCALE) e.__LOCALE = 'zh_CN.UTF-8';
    if (!e.__KEYMAP) e.__KEYMAP = 'us';
    return e;
  }

  /* ==================== hostnamectl ==================== */
  function hostnamectlCmd(argv, ctx) {
    var e = hostState(ctx);
    var sub = String(argv[0] || '');
    if (sub === 'set-hostname') {
      var name = String(argv[1] || '');
      if (!name) return fail(['hostnamectl: 缺少主机名', 'Try \'hostnamectl --help\' for more information.']);
      if (!/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(name)) {
        return fail(['hostnamectl: 主机名不合法（只能字母数字与连字符、不能以连字符开头结尾、不超过 63 字符）']);
      }
      e.__HOSTNAME = name;
      /* 真机上 hostnamectl set-hostname 会更新 /etc/hostname —— 这里也同步，
         这样 `cat /etc/hostname` 能验证改动确实生效。 */
      var n = U.findNode(ctx.root, '/etc/hostname');
      if (n) n.content = name + '\n';
      return ok([]);   /* 真机成功时没有任何输出 */
    }
    if (sub === 'status' || sub === '' || argv.length === 0) {
      return ok([
        ' Static hostname: ' + e.__HOSTNAME,
        '       Icon name: computer-vm',
        '         Chassis: vm',
        '      Machine ID: 3a7f2c1e9b4d4e0f8c6a5b3d2e1f0a9c',
        '         Boot ID: b1c2d3e4f5a6789012345678abcdef01',
        '  Virtualization: kvm',
        'Operating System: EulerOS 2.0 (SP10)',
        '          Kernel: Linux 5.10.0-60.18.0.50.oe2203.x86_64',
        '    Architecture: x86-64'
      ]);
    }
    return fail(['hostnamectl: 未知子命令 \'' + sub + '\'（教学环境支持 set-hostname / status）']);
  }

  /* ==================== timedatectl ==================== */
  var TIMEZONES = ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Tokyo',
    'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
  function timedatectlCmd(argv, ctx) {
    var e = hostState(ctx);
    var sub = String(argv[0] || '');
    if (sub === 'set-timezone') {
      var tz = String(argv[1] || '');
      if (!tz) return fail(['timedatectl: 缺少时区名', 'Try \'timedatectl --help\' for more information.']);
      if (TIMEZONES.indexOf(tz) === -1) {
        return fail(['Failed to set time zone: Invalid or not installed time zone \'' + tz + '\'',
          '（教学环境内置 ' + TIMEZONES.length + ' 个常用时区；真机可用 timedatectl list-timezones 看全部）'], 1);
      }
      e.__TIMEZONE = tz;
      return ok([]);
    }
    if (sub === 'list-timezones') {
      return ok(TIMEZONES.slice().sort());
    }
    if (sub === 'set-time') {
      return ok(['（教学环境）仿真机的时间是固定的（2024-03-18 09:51），改时间会破坏所有日志的时间线，所以不模拟。',
        '真机上 `timedatectl set-time` 需要先关掉 NTP 同步（`timedatectl set-ntp false`），否则会被立刻改回去。']);
    }
    /* 无参数：显示状态 */
    return ok([
      '               Local time: 一 2024-03-18 09:51:00 CST',
      '           Universal time: 一 2024-03-18 01:51:00 UTC',
      '                 RTC time: 一 2024-03-18 01:51:00',
      '                Time zone: ' + e.__TIMEZONE + ' (CST, +0800)',
      'System clock synchronized: yes',
      '              NTP service: active',
      '          RTC in local TZ: no'
    ]);
  }

  /* ==================== lsb_release ==================== */
  function lsbReleaseCmd(argv) {
    var all = argv.indexOf('-a') !== -1 || argv.indexOf('--all') !== -1;
    var out = [];
    function want(flag) { return all || argv.indexOf(flag) !== -1; }
    if (want('-i')) out.push('Distributor ID:\tEulerOS');
    if (want('-d')) out.push('Description:\tEulerOS 2.0 (SP10)');
    if (want('-r')) out.push('Release:\t2.0');
    if (want('-c')) out.push('Codename:\tSP10');
    if (!out.length) {
      return fail(['lsb_release: 至少给一个选项（-a 全部 / -i 发行版 / -d 描述 / -r 版本号 / -c 代号）']);
    }
    return ok(out);
  }

  /* ==================== umask ==================== */
  function umaskCmd(argv, ctx) {
    var cur = ctx.env.__UMASK || '022';
    var sym = argv.indexOf('-S') !== -1;
    var setArg = null;
    for (var i = 0; i < argv.length; i++) {
      if (String(argv[i]).charAt(0) !== '-') { setArg = String(argv[i]); break; }
    }
    if (setArg !== null) {
      if (!/^[0-7]{1,4}$/.test(setArg)) {
        return fail(['bash: umask: ' + setArg + ': octal number out of range']);
      }
      ctx.env.__UMASK = setArg.replace(/^0+(?=\d)/, '') || '0';
      return ok([]);
    }
    if (sym) {
      /* `-S` 输出的是"允许的权限"（即 777 减掉掩码） */
      var m = parseInt(cur, 8);
      var allow = (~m & 0o777);
      function triad(bits) {
        return (bits & 4 ? 'r' : '') + (bits & 2 ? 'w' : '') + (bits & 1 ? 'x' : '');
      }
      return ok(['u=' + triad((allow >> 6) & 7) + ',g=' + triad((allow >> 3) & 7) + ',o=' + triad(allow & 7)]);
    }
    return ok(['0' + cur]);
  }

  /* ==================== runlevel ==================== */
  function runlevelCmd(argv, ctx) {
    if (String(argv[0] || '') === 'set') return fail(['runlevel: 教学环境不支持切换运行级（那会重启服务栈）']);
    /* 真机输出是"上一个级别 当前级别"，N 表示未知 */
    return ok(['N 3']);
  }

  /* ==================== lastlog ==================== */
  function lastlogCmd(argv, ctx) {
    var user = null, days = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-u' || a === '--user') { user = String(argv[++i]); continue; }
      if (a === '-t' || a === '--time') { days = Number(argv[++i]); continue; }
      if (a === '-b' || a === '--before') { days = Number(argv[++i]); continue; }
    }
    var rows = [
      ['root', 'pts/0', '10.0.1.99', '一 3月 18 08:02:11 +0800 2024'],
      ['deploy', 'pts/1', '10.0.1.50', '五 3月 15 17:20:03 +0800 2024'],
      ['nginx', '**Never logged in**', '', ''],
      ['mysql', '**Never logged in**', '', ''],
      ['tomcat', 'pts/2', '10.0.1.77', '四 3月 14 09:11:47 +0800 2024']
    ];
    var out = ['Username         Port     From             Latest'];
    rows.forEach(function (r) {
      if (user && r[0] !== user) return;
      if (r[1].indexOf('Never') === 0) {
        out.push(r[0].padEnd(16) + ' ' + r[1]);
        return;
      }
      out.push(r[0].padEnd(16) + ' ' + r[1].padEnd(8) + ' ' + r[2].padEnd(16) + ' ' + r[3]);
    });
    if (out.length === 1) return fail(['lastlog: User \'' + user + '\' unknown, or the user has never logged in']);
    if (days !== null) out.push('（教学环境）`-t ' + days + '` 只显示最近 ' + days + ' 天登录过的账号；仿真数据固定，这里不做时间过滤。');
    return ok(out);
  }

  /* ==================== loginctl ==================== */
  function loginctlCmd(argv, ctx) {
    var sub = String(argv[0] || '');
    if (sub === 'list-sessions') {
      return ok([
        'SESSION  UID USER   SEAT  TTY',
        '      1    0 root   seat0 pts/0',
        '      2    0 root         pts/1',
        '      3 1000 deploy seat0 pts/2',
        '',
        '3 sessions listed.'
      ]);
    }
    if (sub === 'list-users') {
      return ok(['   UID USER   LINGER STATE', '     0 root   no     active', '  1000 deploy no     active']);
    }
    if (sub === 'terminate-user') {
      var u = String(argv[1] || '');
      if (!u) return fail(['loginctl: 缺少用户名']);
      return ok(['（教学环境）已模拟踢掉 ' + u + ' 的所有会话；真机上它会让对方**立刻掉线**，写脚本前先确认不会误伤运维自己。']);
    }
    if (sub === 'enable-linger' || sub === 'disable-linger') {
      var u2 = String(argv[1] || '');
      return ok(['（教学环境）' + (sub === 'enable-linger' ? '已开启' : '已关闭') + ' ' + (u2 || '该用户') + ' 的 linger。',
        'linger 的作用：让用户**没登录时**其 systemd 用户实例仍继续运行 —— 普通用户跑常驻服务（`systemctl --user`）必须开它。']);
    }
    if (sub === 'show-user' || sub === 'show-session') {
      return ok(['（教学环境）show-* 会输出几十行属性（State/Type/Remote/Linger…）。',
        '排查"用户服务为什么没起来"时，先看 `loginctl show-user <用户> -p Linger`。']);
    }
    return fail(['loginctl: 教学环境支持 list-sessions / list-users / terminate-user / enable-linger / disable-linger / show-*']);
  }

  /* ==================== localectl ==================== */
  var LOCALES = ['zh_CN.UTF-8', 'en_US.UTF-8', 'C.UTF-8', 'ja_JP.UTF-8', 'zh_TW.UTF-8'];
  var KEYMAPS = ['us', 'cn', 'gb', 'de', 'jp106'];
  function localectlCmd(argv, ctx) {
    var e = hostState(ctx);
    var sub = String(argv[0] || '');
    if (sub === 'set-locale') {
      var loc = String(argv[1] || '');
      if (!loc) return fail(['localectl: 缺少 locale']);
      if (LOCALES.indexOf(loc) === -1) {
        return fail(['Failed to set locale: Invalid locale \'' + loc + '\'',
          '（教学环境内置 ' + LOCALES.join(' / ') + '；真机用 localectl list-locales 看全部）'], 1);
      }
      e.__LOCALE = loc;
      return ok([]);
    }
    if (sub === 'set-keymap') {
      var km = String(argv[1] || '');
      if (!km) return fail(['localectl: 缺少键盘布局']);
      e.__KEYMAP = km;
      return ok([]);
    }
    if (sub === 'list-locales') return ok(LOCALES.slice().sort());
    if (sub === 'list-keymaps') return ok(KEYMAPS.slice().sort());
    return ok([
      '   System Locale: LANG=' + e.__LOCALE,
      '       VC Keymap: ' + e.__KEYMAP,
      '      X11 Layout: ' + e.__KEYMAP
    ]);
  }

  /* ==================== update-alternatives ==================== */
  function updateAlternativesCmd(argv, ctx) {
    var e = ctx.env;
    e.__ALT = e.__ALT || {};
    e.__ALT.java = e.__ALT.java || {
      link: '/usr/bin/java', cur: '/usr/lib/jvm/jdk-17/bin/java',
      cands: [
        ['/usr/lib/jvm/jdk-11/bin/java', 1111],
        ['/usr/lib/jvm/jdk-17/bin/java', 1711]
      ]
    };
    var sub = String(argv[0] || '');
    var name = String(argv[1] || '');
    if (sub === '--display' || sub === '--list') {
      var d = e.__ALT[name];
      if (!d) return fail(['update-alternatives: error: no alternatives for ' + (name || '(空)')]);
      if (sub === '--list') return ok(d.cands.map(function (c) { return c[0]; }));
      var out = [name + ' - auto mode', '  link best version is ' + d.cur,
        '  link currently points to ' + d.cur, '  link ' + name + ' is ' + d.link];
      d.cands.forEach(function (c) {
        out.push(c[0] + ' - priority ' + c[1]);
        if (c[0] === d.cur) out.push(' slave ' + name + ' is ' + c[0]);
      });
      return ok(out);
    }
    if (sub === '--set') {
      var path = String(argv[2] || '');
      var dd = e.__ALT[name];
      if (!dd) return fail(['update-alternatives: error: no alternatives for ' + name]);
      var hit = dd.cands.filter(function (c) { return c[0] === path; })[0];
      if (!hit) return fail(['update-alternatives: error: alternative ' + path + ' for ' + name + ' not registered; not setting']);
      dd.cur = path;
      return ok([]);
    }
    if (sub === '--config') {
      var dc = e.__ALT[name];
      if (!dc) return fail(['update-alternatives: error: no alternatives for ' + name]);
      var lines = ['There are ' + dc.cands.length + ' choices for the alternative ' + name + ' (providing ' + dc.link + ').', '',
        '  Selection    Path                                 Priority   Status', '------------------------------------------------------------'];
      dc.cands.forEach(function (c, i) {
        lines.push('  ' + (c[0] === dc.cur ? '*' : ' ') + ' ' + i + '            ' + c[0].padEnd(36) + ' ' + c[1] + '     ' + (c[0] === dc.cur ? 'auto mode' : 'manual mode'));
      });
      lines.push('');
      lines.push('Press <enter> to keep the current choice[*], or type selection number: ');
      lines.push('（教学环境）这是**交互式**命令，模拟终端里不会真的等你输入。要非交互切换请用 `update-alternatives --set ' + name + ' <路径>`。');
      return ok(lines);
    }
    if (sub === '--install') {
      return ok(['（教学环境）`--install` 会注册一个候选版本；仿真里 java 已有两个候选，可以直接用 --display / --set 练切换。',
        '真机写法：update-alternatives --install /usr/bin/java java /usr/lib/jvm/jdk-17/bin/java 1711']);
    }
    return fail(['update-alternatives: 教学环境支持 --display / --list / --set / --config / --install']);
  }

  /* ==================== dmidecode ==================== */
  function dmidecodeCmd(argv) {
    var t = null, s = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-t' || a === '--type') { t = String(argv[++i]); continue; }
      if (a === '-s' || a === '--string') { s = String(argv[++i]); continue; }
      if (a === '-q' || a === '--quiet') continue;
    }
    if (s !== null) {
      var STR = {
        'system-serial-number': 'ecs-2f4a9c7e-8b31-4d6a-9f02-7c1e5a8d3b60',
        'system-manufacturer': 'Huawei',
        'system-product-name': 'KVM Virtual Machine',
        'system-uuid': '4c4c4544-004b-3410-8030-b7c04f4e4432',
        'bios-version': '1.0.0-abc123',
        'baseboard-manufacturer': 'Huawei'
      };
      if (STR[s] === undefined) return fail(['dmidecode: 未收录的 -s 字段 \'' + s + '\'（教学环境内置常用字段，真机字段见 `dmidecode -s` 的完整列表）']);
      return ok([STR[s]]);
    }
    if (t === 'system' || t === '1') {
      return ok([
        'System Information',
        '\tManufacturer: Huawei',
        '\tProduct Name: KVM Virtual Machine',
        '\tVersion: 1.0',
        '\tSerial Number: ecs-2f4a9c7e-8b31-4d6a-9f02-7c1e5a8d3b60',
        '\tUUID: 4c4c4544-004b-3410-8030-b7c04f4e4432',
        '\tWake-up Type: Power Switch',
        '\tFamily: Red Hat Enterprise Linux'
      ]);
    }
    if (t === 'memory' || t === '17') {
      return ok([
        'Memory Device',
        '\tArray Handle: 0x1000',
        '\tTotal Width: 64 bits',
        '\tSize: 4096 MB',
        '\tForm Factor: DIMM',
        '\tLocator: DIMM 0',
        '\tType: DDR4',
        '\tSpeed: 2666 MT/s',
        '\tManufacturer: Huawei',
        '',
        'Memory Device',
        '\tSize: 4096 MB',
        '\tLocator: DIMM 1',
        '\tSpeed: 2666 MT/s',
        '',
        '（合计 8 GB —— 与 `free -h` 看到的 7770 MiB 对得上）'
      ]);
    }
    return ok([
      '（教学环境）dmidecode 读的是**虚拟机的 SMBIOS 表**，仿真里只收录了 system 与 memory 两类常用信息。',
      '查序列号（报障要提供）：dmidecode -s system-serial-number',
      '看整机型号：dmidecode -t system    ｜    看内存条：dmidecode -t memory'
    ]);
  }

  /* ==================== shutdown / halt / poweroff ====================
     这三个**绝不假装执行**。真机上它们会让你断线、让业务中断，
     教学环境里假装"已关机"是最坏的一种骗 —— 学员会以为它没危险。
     如实说明不会执行，同时把**参数与取消逻辑**讲清楚（那才是要学的）。 */
  function noReboot(kind, argv, lines) {
    return { out: lines, err: ['（教学环境）**不会真的执行 ' + kind + '** —— 仿真机不是一台真机器，"关机"在这里只能是一句空话，',
      '假装成功会让你低估这条命令的杀伤力。参数含义与取消方式已在上方说明，请在真机上（或跳板机上）练习。'], code: 0 };
  }

  function shutdownCmd(argv) {
    var cancel = argv.indexOf('-c') !== -1;
    var reboot = argv.indexOf('-r') !== -1;
    /* ⚠️ 三个相近的开关语义必须分清（早先我把 `-h` 当成了"停机不断电"，是错的）：
         -h  关机（默认会断电）—— 日常说的"关机"就是它
         -H  停机但**不断电**（halt），需要人工按电源
         -P  关机并断电（显式写法，与 -h 在现代 systemd 上等价）
       混掉的后果是输出说"停机（不断电）"，而学员敲的是最常见的 `shutdown -h now`。 */
    var haltOnly = argv.indexOf('-H') !== -1;
    var poweroff = argv.indexOf('-P') !== -1;
    var shutdownH = argv.indexOf('-h') !== -1;
    var time = null, msg = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (/^-[hrPcHk]$/.test(a) || a === '--help') continue;
      if (/^\+\d+$/.test(a) || /^\d{1,2}:\d{2}$/.test(a) || a === 'now') { if (time === null) time = a; continue; }
      msg.push(a);
    }
    if (cancel) {
      return noReboot('取消关机', argv, [
        '（教学环境）`shutdown -c` 的作用：**取消一个已经排定的关机**。',
        '真机行为：执行后广播一条"关机已取消"，已排定的任务被撤销，没有任何其它输出。',
        '实务要点：取消要赶在倒数结束前；用 `shutdown -k`（只广播不真关）可以先把消息发出去试探反应。'
      ]);
    }
    var what = reboot ? '重启' : (haltOnly ? '停机（不断电）' : '关机');
    if (time === null && !shutdownH && !haltOnly && !reboot && !poweroff) {
      return fail(['shutdown: 需要时间参数（now / +分钟 / hh:mm）', 'Try \'shutdown --help\' for more information.']);
    }
    if (poweroff) what = '关机并断电';
    var when = time === 'now' ? '立即' : (time ? time.replace(/^\+/, '') + ' 分钟后' : '立即');
    var out = [
      '（教学环境）已解析这条命令，含义是：**' + when + what + '**' + (msg.length ? '，广播消息「' + msg.join(' ') + '」' : '') + '。',
      '参数对照：`-h` 关机 ｜ `-r` 重启 ｜ `-P` 关机并断电 ｜ `-H` 停机不断电 ｜ `+10` 十分钟后 ｜ `hh:mm` 指定时刻 ｜ `now` 立即 ｜ `-c` 取消',
      '写脚本前务必知道的两点：① **排定后要留取消窗口**（`shutdown -c`），别一条命令直接 `now`；',
      '② 远程执行 `shutdown -h now` 会让你**当场断线**，先用 `-k` 广播或改成 `+5` 给自己留门。'
    ];
    return noReboot(what, argv, out);
  }

  function haltCmd(argv, kind) {
    var p = argv.indexOf('-p') !== -1;
    var f = argv.indexOf('-f') !== -1;
    return noReboot(kind, argv, [
      '（教学环境）已解析：**' + kind + (p ? '（并断电）' : '') + (f ? '（强制，不通知服务优雅退出）' : '') + '**。',
      '参数对照：`-p` 关机后断电 ｜ `-f` 强制、跳过服务停止流程（**可能丢数据**）｜ `--reboot` 重启',
      '实务要点：优先用 `systemctl poweroff` / `systemctl reboot` —— 它们会走 systemd 的正常关闭流程，',
      '让服务有机会优雅退出、文件系统干净卸载；`halt -f` 是最后的救命手段，不是日常操作。'
    ]);
  }

  /* ==================== systemd-analyze ==================== */
  function systemdAnalyzeCmd(argv) {
    var sub = String(argv[0] || '');
    if (sub === 'blame') {
      return ok([
        '12.418s NetworkManager-wait-online.service',
        ' 4.702s kubelet.service',
        ' 2.118s firewalld.service',
        ' 1.884s docker.service',
        ' 1.203s tuned.service',
        ' 0.902s chronyd.service',
        ' 0.611s sshd.service',
        '',
        '（教学环境）看开机到底慢在哪：`NetworkManager-wait-online` 常年霸榜 ——',
        '它等网络就绪，而云主机上常被没必要的网卡拖住。排除它再测一次：',
        '`systemd-analyze blame | head` 与 `systemd-analyze critical-chain` 配合看因果链。'
      ]);
    }
    if (sub === 'verify') {
      var f = String(argv[1] || '');
      if (!f) return fail(['systemd-analyze verify: 需要 unit 文件路径']);
      var n = U.findNode ? null : null;
      return ok(['（教学环境）unit 语法校验需要真实的 systemd 解析器，这里只回显检查目标：' + f,
        '真机上 `verify` 会指出 unit 里的语法错误（例如缺 `[Install]`、`ExecStart` 路径不存在），',
        '**不会**真的启动服务，是改完 unit 后的第一道检查。']);
    }
    if (sub === 'critical-chain') {
      return ok([
        'graphical.target @18.204s',
        '└─multi-user.target @18.204s',
        '  └─kubelet.service @13.498s +4.702s',
        '    └─containerd.service @11.020s +2.470s',
        '      └─network-online.target @11.012s',
        '        └─NetworkManager-wait-online.service @3.674s +7.331s'
      ]);
    }
    if (sub === 'time' || sub === '') {
      return ok([
        'Startup finished in 3.674s (kernel) + 18.204s (userspace) = 21.878s',
        'graphical.target reached after 18.204s in userspace.'
      ]);
    }
    return fail(['systemd-analyze: 教学环境支持 time / blame / critical-chain / verify']);
  }

  /* `java` 已经由 assets/js/cmd-ops.js 实现，这里**不要再注册一次** ——
     `CC_SHELL.extend` 是"只加不覆盖"的：重复注册不报错、也不生效，
     只会留下一段看着像活代码的死代码（这一处真的写过一份，
     直到发现输出格式和实际结果对不上才察觉）。
     sh-var-export 那条示例真正缺的不是 `java`，而是**引擎不认带路径的调用**
     （`$JAVA_HOME/bin/java`）—— 那个修复在 shell.js 的命令派发里。 */

  /* ==================== 注册 ==================== */
  window.CC_SHELL.extend({
    'hostnamectl': function (argv, ctx) { return hostnamectlCmd(argv, ctx); },
    'timedatectl': function (argv, ctx) { return timedatectlCmd(argv, ctx); },
    'lsb_release': function (argv, ctx) { return lsbReleaseCmd(argv, ctx); },
    'umask': function (argv, ctx) { return umaskCmd(argv, ctx); },
    'runlevel': function (argv, ctx) { return runlevelCmd(argv, ctx); },
    'lastlog': function (argv, ctx) { return lastlogCmd(argv, ctx); },
    'loginctl': function (argv, ctx) { return loginctlCmd(argv, ctx); },
    'localectl': function (argv, ctx) { return localectlCmd(argv, ctx); },
    'update-alternatives': function (argv, ctx) { return updateAlternativesCmd(argv, ctx); },
    'dmidecode': function (argv, ctx) { return dmidecodeCmd(argv, ctx); },
    'shutdown': function (argv, ctx) { return shutdownCmd(argv, ctx); },
    'halt': function (argv, ctx) { return haltCmd(argv, '停机'); },
    'poweroff': function (argv, ctx) { return haltCmd(argv, '关机'); },
    'reboot': function (argv, ctx) { return haltCmd(argv, '重启'); },
    'systemd-analyze': function (argv, ctx) { return systemdAnalyzeCmd(argv, ctx); }
  });
})();
