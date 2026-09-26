/* assets/js/cmd-virt.js · 虚拟化与镜像
   --------------------------------------------------------------------------
   本文件只负责**注册命令实现**：shell.js 先加载，这里再调用
     window.CC_SHELL.extend({ '命令名': function (argv, ctx, stdin, HOST) { ... } })
   引擎内部的工具函数从 window.CC_SHELL.util 取（ok/fail/resolvePath/findNode/
   readFileOrErr/splitLines/childrenSorted/expandLongOpts/pad/padLeft/walkFiles）。

   覆盖的内容条目：virsh、qemu-img、virt-install、virt-customize、guestfish、vagrant
   数据文件（data/*.js）里的 examples[].cmd 会由 tools/example-check.js 逐条真跑，
   所以实现必须让这些示例真的能跑通、且输出与 desc 描述一致。

   ══ 设计说明（为什么这么写） ══════════════════════════════════════════════

   1) 每实例一份的模拟状态
      libvirt 的域名 / 网络 / 存储池 / 镜像元数据都挂在**虚拟文件系统根节点**上
      （ctx.root.$cc_virt，与 shell.js 里 $cc_ 系列状态同一套做法）：
      主站与练习平台是两台机器，同一台机器的两个标签页也不该互相污染，
      shell.reset() 换掉 root 时状态自然清零。磁盘文件本身仍然是真的文件节点，
      所以 `ls -l`、`du`、`stat` 看到的容量与 `qemu-img info` 报的容量始终一致。

   2) 能模拟的必须真算，不能模拟的必须说清楚
      - 真能算的：域名清单与状态机、XML 定义、快照列表、镜像格式/虚拟大小/实际占用、
        差分链、内部快照、growpart 的分区表算术、sysctl 读写 /proc/sys……
        这些一律**由状态现算**，绝不预置假文本。
      - 真做不到的：启动 QEMU 进程、真正跑起安装程序、把虚拟串口接到浏览器、
        打开 $EDITOR、进救援 shell、真连 SSH、真正读写 qcow2 内部结构。
        这些一律输出**诚实提示**（说明真机行为 + 教学环境做了什么），
        绝不假装成功、也绝不静默给错结果。

   3) 状态不匹配时的处理（本文件反复出现的 "（教学提示：…）"）
      示例是按文档顺序逐条跑的，有些示例的前提在真机上并不成立
      （例如对已经 shut off 的虚机再发一次 shutdown）。真机 virsh 会报
      "Requested operation is not valid"，但那样会让示例看起来是坏的。
      这里沿用 shell.js 里 nginx -s stop 的做法：**按请求推进状态 + 用一行提示
      说明真机会报什么错**，学员既拿到了可继续的结果，也知道真实差异在哪。

   4) 为什么这个文件里还有 sleep / wait / sysctl
      data/kvm.js 的示例里有 `virsh shutdown x && sleep 30 && virsh domstate x`
      与 `ip addr show virbr0 && sysctl net.ipv4.ip_forward` 这类写法：
      只要 virsh 一实现，这两条就会真的执行到 sleep / sysctl，而引擎里没有它们，
      于是示例会以 "command not found" 收场。补上这几个最小实现（行为与真机一致），
      示例才真正可用；growpart 链上的 resize2fs / xfs_growfs / pvresize / lvextend
      同理（`growpart /dev/vda 1 && resize2fs /dev/vda1 && df -h`）。
      这是「补齐示例引用到的命令」而不是抢别的分类的活：
      全部实现都只依赖本文件里的模拟状态，不改引擎、不改数据。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;
  var U = window.CC_SHELL.util;   /* ok / fail / resolvePath / findNode / readFileOrErr / ... */

  /* ======================= 0. 小工具 ======================= */

  var G = 1073741824, M = 1048576, K = 1024;
  var NOW_DATE = '2024-03-18';              /* 仿真环境的"今天"（与 shell.js 的 NOW 一致） */
  var NOW_STAMP = '2024-03-18 09:51';       /* 仿真环境的"现在" */

  function note(text) { return '（教学提示：' + text + '）'; }

  /* 4 位有效数字的容量（qemu-img 风格：40 GiB / 6.2 GiB / 360 KiB） */
  function hSize(bytes) {
    var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    var v = Number(bytes) || 0, i = 0;
    while (v >= 1024 && i < units.length - 1) { v = v / 1024; i++; }
    if (i === 0) return String(v) + ' B';
    var s = String(Number(v.toPrecision(3)));
    return s + ' ' + units[i];
  }
  /* GiB/MiB，两位小数（virsh pool-info / virt-df 风格：199.50 GiB） */
  function hSize2(bytes) {
    var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    var v = Number(bytes) || 0, i = 0;
    while (v >= 1024 && i < units.length - 1) { v = v / 1024; i++; }
    if (i === 0) return String(v) + ' B';
    return v.toFixed(2) + ' ' + units[i];
  }
  /* 把 40G / 200GiB / 512M / +20G 解析成字节（负数表示缩小） */
  function parseSize(text) {
    var m = /^([+-]?)(\d+(?:\.\d+)?)\s*([KMGT]?)(i?B?)$/i.exec(String(text).trim());
    if (!m) return null;
    var n = parseFloat(m[2]);
    var unit = (m[3] || '').toUpperCase();
    var mul = 1;
    if (unit === 'K') mul = 1024;
    else if (unit === 'M') mul = M;
    else if (unit === 'G') mul = G;
    else if (unit === 'T') mul = 1024 * G;
    else if (unit !== '') return null;
    var bytes = Math.round(n * mul);
    return m[1] === '-' ? -bytes : bytes;
  }
  function baseNameOf(p) { return U.baseName(p); }

  /* 参数解析：--long / --long=value / -x / -abc / 位置参数。
     这里**不用** util.expandLongOpts —— 它把 --all 映射成 -a、--force 映射成 -f，
     那是 grep/du 那套命令的约定；virsh/qemu-img 的同名长选项含义完全不同。 */
  function parseArgv(argv, valueShorts, valueLongs) {
    var r = { opts: {}, longs: {}, args: [] };
    var vs = valueShorts || '', vl = valueLongs || [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      var ml = /^--([A-Za-z0-9][A-Za-z0-9-]*)(?:=(.*))?$/.exec(a);
      if (ml) {
        if (ml[2] === undefined && vl.indexOf(ml[1]) !== -1) r.longs[ml[1]] = String(argv[++i] === undefined ? '' : argv[i]);
        else r.longs[ml[1]] = ml[2] === undefined ? true : ml[2];
        continue;
      }
      var ms = /^-([A-Za-z])(.*)$/.exec(a);
      if (ms) {
        var ch = ms[1], tail = ms[2];
        if (vs.indexOf(ch) !== -1) {
          r.opts[ch] = tail ? tail.replace(/^=/, '') : String(argv[++i] === undefined ? '' : argv[i]);
          continue;
        }
        r.opts[ch] = true;
        tail.split('').forEach(function (c) { if (c) r.opts[c] = true; });
        continue;
      }
      r.args.push(a);
    }
    r.has = function (name) { return r.longs[name] !== undefined || r.opts[name] !== undefined; };
    return r;
  }
  /* virsh 的选项：-c <uri> / --connect <uri> 带值，--mode <acpi|agent> 带值，
     --devname <设备名> 带值；其余（--all/--details/--live/--config/--graceful…）都是开关。
     必须把带值选项的值吃掉，否则 `virsh shutdown --mode agent web-prod-01` 会把 agent 当域名。 */
  function virshArgs(argv) {
    return parseArgv(argv, 'c', ['connect', 'mode', 'devname', 'live-path']);
  }
  /* 取短选项值：-o xxx / -oxxx / -o=xxx */
  function shortValue(argv, ch) {
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-' + ch) return argv[i + 1] === undefined ? null : String(argv[i + 1]);
      if (a.indexOf('-' + ch) === 0 && a.length > 2) return a.slice(2).replace(/^=/, '');
    }
    return null;
  }
  function hasShort(argv, ch) {
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (/^-[A-Za-z]+$/.test(a) && a.indexOf(ch) !== -1) return true;
    }
    return false;
  }

  /* ======================= 1. 模拟文件系统补充数据 =======================
     父目录会自动创建；size 会体现在 ls -l / du / stat 里，
     所以这里的容量必须与 qemu-img info 报的"实际占用（disk size）"一致。 */
  window.CC_SHELL.fsAdd({
    /* ---- 基础镜像（云镜像制作的输入） ---- */
    '/data/images/rocky9-base.qcow2': { content: '<binary:qcow2>', size: 1288490188, mode: '644', user: 'root', mtime: '2024-03-10 11:20' },
    '/data/images/Rocky-9-GenericCloud.qcow2': { content: '<binary:qcow2>', size: 1288490188, mode: '644', user: 'root', mtime: '2024-03-10 11:18' },
    '/data/images/rocky9.raw': { content: '<binary:raw>', size: 42949672960, mode: '644', user: 'root', mtime: '2024-03-09 16:40' },
    '/data/images/rocky9.qcow2': { content: '<binary:qcow2>', size: 452984832, mode: '644', user: 'root', mtime: '2024-03-09 17:02' },
    '/data/images/cloud-base.raw': { content: '<binary:raw>', size: 21474836480, mode: '644', user: 'root', mtime: '2024-03-08 10:05' },
    '/data/images/cloud-base.qcow2': { content: '<binary:qcow2>', size: 15461882265, mode: '644', user: 'root', mtime: '2024-03-08 10:22' },
    '/data/images/app.qcow2': { content: '<binary:qcow2>', size: 9019431321, mode: '644', user: 'root', mtime: '2024-03-11 14:30' },
    '/data/export/app.vmdk': { content: '<binary:vmdk>', size: 9470402887, mode: '644', user: 'root', mtime: '2024-03-11 14:52' },
    '/data/iso/Rocky-9.3-x86_64-dvd.iso': { content: '<binary:iso9660>', size: 9663676416, mode: '644', user: 'root', mtime: '2024-03-05 09:12' },
    /* ---- 差分盘的基础镜像 ---- */
    '/data/base/rocky9-base.qcow2': { content: '<binary:qcow2>', size: 1288490188, mode: '644', user: 'root', mtime: '2024-03-10 11:20' },
    /* ---- vmstore 存储池（生产虚机磁盘 + 种子盘） ---- */
    '/data/vmstore/web-prod-01.qcow2': { content: '<binary:qcow2>', size: 6657199308, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-18 09:30' },
    '/data/vmstore/web-prod-01-compact.qcow2': { content: '<binary:qcow2>', size: 5583457484, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-17 22:10' },
    '/data/vmstore/web-prod-02.qcow2': { content: '<binary:qcow2>', size: 1492501135, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-16 20:41' },
    '/data/vmstore/vm-03.qcow2': { content: '<binary:qcow2>', size: 335544320, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-15 11:02' },
    '/data/vmstore/db.qcow2': { content: '<binary:qcow2>', size: 94489280512, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-18 08:12' },
    '/data/vmstore/app-03.qcow2': { content: '<binary:qcow2>', size: 1395864371, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-17 19:26' },
    '/data/vmstore/broken-vm.qcow2': { content: '<binary:qcow2>', size: 5476083302, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-14 03:55' },
    '/data/vmstore/web-prod-02-seed.img': { content: '<binary:iso9660:cidata>', size: 368640, mode: '644', user: 'root', mtime: '2024-03-16 20:38' },
    /* ---- 默认存储池 /var/lib/libvirt/images ---- */
    '/var/lib/libvirt/images/db-prod-01.qcow2': { content: '<binary:qcow2>', size: 94489280512, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-18 08:10' },
    '/var/lib/libvirt/images/db-test-01.qcow2': { content: '<binary:qcow2>', size: 12884901888, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-12 15:20' },
    '/var/lib/libvirt/images/win-test-01.qcow2': { content: '<binary:qcow2>', size: 36507222016, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-13 10:41' },
    '/var/lib/libvirt/images/legacy-erp.qcow2': { content: '<binary:qcow2>', size: 22548578304, mode: '600', user: 'qemu', group: 'qemu', mtime: '2024-03-14 22:03' },
    /* ---- 虚机 XML 定义（dumpxml 的备份 / define 的输入 / domxml-to-native） ---- */
    /* 虚机 XML 定义：由域名记录现算（dumpxml 的输出与它逐字一致，
       所以 `virsh dumpxml > 备份.xml` 再 `virsh define 备份.xml` 能真正还原） */
    '/opt/kvm/xml/web-prod-01.xml': { content: domainXml(initDomains()[0], {}).join('\n') + '\n', mode: '644', user: 'root', mtime: '2024-03-12 09:30' },
    '/opt/kvm/xml/web-prod-01-2024-03-18.xml': { content: domainXml(initDomains()[0], {}).join('\n') + '\n', mode: '644', user: 'root', mtime: '2024-03-18 09:20' },
    /* ---- cloud-init 的两个日志（排障第一步就要看它们） ----
       cloud-init.log 是 cloud-init 自己的调试日志，cloud-init-output.log 是
       runcmd/bootcmd 里用户脚本的 stdout/stderr（脚本报错看后者）。 */
    '/var/log/cloud-init.log': {
      content: [
        '2024-03-18 09:38:31,004 - util.py[DEBUG]: Cloud-init v. 23.4-7.el9 running \'init-local\' at Mon, 18 Mar 2024 09:38:31 +0000. Up 8.21 seconds.',
        '2024-03-18 09:38:31,120 - stages.py[INFO]: Loaded config from /etc/cloud/cloud.cfg',
        '2024-03-18 09:38:31,882 - DataSourceNoCloud.py[DEBUG]: Attempting to read from /dev/sr0',
        '2024-03-18 09:38:31,905 - DataSourceNoCloud.py[DEBUG]: Using data from /dev/sr0 (label=cidata)',
        '2024-03-18 09:38:32,014 - handlers.py[DEBUG]: start: init-local/check-cache: attempting to read from cache',
        '2024-03-18 09:38:32,102 - handlers.py[DEBUG]: finish: init-local/check-cache: SUCCESS',
        '2024-03-18 09:38:33,220 - util.py[DEBUG]: Reading from /etc/hostname (quiet=False)',
        '2024-03-18 09:38:33,240 - cc_set_hostname.py[DEBUG]: Setting the hostname to web-prod-02',
        '2024-03-18 09:38:35,912 - cc_ssh.py[DEBUG]: Applying ssh credentials',
        '2024-03-18 09:38:36,004 - cc_ssh.py[DEBUG]: authorized_keys already exists, leaving alone',
        '2024-03-18 09:38:41,118 - stages.py[INFO]: Applying network configuration from /run/cloud-init/network-config.json',
        '2024-03-18 09:38:41,900 - cc_growpart.py[DEBUG]: "/" not a partitioned device, skipping growpart',
        '2024-03-18 09:38:42,110 - cc_resizefs.py[DEBUG]: resize /dev/sda2 with resize2fs: done',
        '2024-03-18 09:38:43,002 - cc_package_update_upgrade_install.py[DEBUG]: Installing packages: [\'nginx\', \'chrony\']',
        '2024-03-18 09:39:02,551 - cc_runcmd.py[DEBUG]: Running command [\'systemctl\', \'enable\', \'--now\', \'nginx\']',
        '2024-03-18 09:39:03,120 - util.py[DEBUG]: Cloud-init v. 23.4-7.el9 finished at Mon, 18 Mar 2024 09:39:03 +0000. Datasource DataSourceNoCloud [seed=/dev/sr0][dsmode=net]'
      ].join('\n') + '\n', mode: '640', user: 'root', group: 'adm', mtime: '2024-03-18 09:39' },
    '/var/log/cloud-init-output.log': {
      content: [
        'Cloud-init v. 23.4-7.el9 running \'modules:final\' at Mon, 18 Mar 2024 09:38:41 +0000. Up 18.42 seconds.',
        'Last metadata expiration check: 0:00:12 ago on Mon 18 Mar 2024 09:38:29 AM UTC.',
        'Dependencies resolved.',
        '================================================================================',
        ' Package          Arch       Version                  Repository          Size',
        '================================================================================',
        'Installing:',
        ' nginx            x86_64     1:1.20.1-14.el9          appstream          1.7 M',
        ' chrony           x86_64     4.2-1.el9                baseos             283 k',
        'Installing dependencies:',
        ' rocky-logos-httpd  noarch   90.5-1.el9               baseos              29 k',
        '',
        'Transaction Summary',
        '================================================================================',
        'Install  3 Packages',
        '',
        'Downloading Packages:',
        '(1/3): chrony-4.2-1.el9.x86_64.rpm                1.4 MB/s | 283 kB     00:00',
        '(2/3): rocky-logos-httpd-90.5-1.el9.noarch.rpm   612 kB/s |  29 kB     00:00',
        '(3/3): nginx-1.20.1-14.el9.x86_64.rpm            8.1 MB/s | 1.7 MB     00:00',
        '--------------------------------------------------------------------------------',
        'Total                                            9.0 MB/s | 2.0 MB     00:00',
        'Running transaction check',
        'Transaction check succeeded.',
        'Running transaction test',
        'Transaction test succeeded.',
        'Running transaction',
        '  Preparing        :                                                        1/1',
        '  Installing       : chrony-4.2-1.el9.x86_64                                1/3',
        '  Installing       : rocky-logos-httpd-90.5-1.el9.noarch                    2/3',
        '  Installing       : nginx-1:1.20.1-14.el9.x86_64                           3/3',
        '  Running scriptlet: nginx-1:1.20.1-14.el9.x86_64                           3/3',
        '  Verifying        : chrony-4.2-1.el9.x86_64                                1/3',
        '  Verifying        : nginx-1:1.20.1-14.el9.x86_64                           2/3',
        '  Verifying        : rocky-logos-httpd-90.5-1.el9.noarch                    3/3',
        '',
        'Installed:',
        '  chrony-4.2-1.el9.x86_64        nginx-1:1.20.1-14.el9.x86_64',
        '  rocky-logos-httpd-90.5-1.el9.noarch',
        '',
        'Complete!',
        'Created symlink /etc/systemd/system/multi-user.target.wants/nginx.service -> /usr/lib/systemd/system/nginx.service.',
        'Cloud-init v. 23.4-7.el9 finished at Mon, 18 Mar 2024 09:39:03 +0000. Datasource DataSourceNoCloud [seed=/dev/sr0][dsmode=net].  Up 40.11 seconds'
      ].join('\n') + '\n', mode: '640', user: 'root', group: 'adm', mtime: '2024-03-18 09:39' },
    /* ---- NoCloud 数据源（user-data / meta-data / network-config） ---- */
    '/tmp/user-data': {
      content: [
        '#cloud-config',
        'hostname: web-prod-02',
        'users:',
        '  - name: ops',
        '    sudo: ALL=(ALL) NOPASSWD:ALL',
        '    ssh_authorized_keys:',
        '      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey ops@example.com',
        'packages:',
        '  - nginx',
        '  - chrony',
        'runcmd:',
        '  - systemctl enable --now nginx'
      ].join('\n') + '\n', mode: '600', user: 'root', mtime: '2024-03-16 20:30' },
    '/tmp/user-data-script': {
      content: ['#!/bin/bash',
                'echo "初始化开始 $(date)" >> /var/log/boot-init.log',
                'dnf install -y nginx'].join('\n') + '\n',
      mode: '600', user: 'root', mtime: '2024-03-16 20:31' },
    '/tmp/meta-data': {
      content: ['instance-id: iid-web-0002', 'local-hostname: web-prod-02'].join('\n') + '\n',
      mode: '600', user: 'root', mtime: '2024-03-16 20:30' },
    '/tmp/network-config': {
      content: [
        'version: 2',
        'ethernets:',
        '  eth0:',
        '    dhcp4: false',
        '    addresses:',
        '      - 192.168.122.20/24',
        '    routes:',
        '      - to: default',
        '        via: 192.168.122.1',
        '    nameservers:',
        '      addresses: [114.114.114.114, 223.5.5.5]'
      ].join('\n') + '\n', mode: '600', user: 'root', mtime: '2024-03-16 20:30' },
    '/tmp/verify-seed.img': { content: '<binary:iso9660:cidata>', size: 368640, mode: '644', user: 'root', mtime: '2024-03-18 09:44' },
    '/tmp/rescue-logs': { type: 'dir', mode: '755', user: 'root', mtime: '2024-03-18 09:12' },
    /* ---- virt-customize --copy-in 的宿主机源目录 ---- */
    '/opt/app/config/app.yml': {
      content: [
        'server:',
        '  port: 8080',
        '  workers: 4',
        'logging:',
        '  level: info',
        '  path: /data/app/logs/app.log',
        'database:',
        '  host: db-prod-01',
        '  port: 3306',
        '  name: orders'
      ].join('\n') + '\n', mode: '644', user: 'root', mtime: '2024-03-11 17:20' },
    /* ---- packer 模板（HCL2） ---- */
    '/opt/packer/rocky9-base.pkr.hcl': {
      content: [
        'packer {',
        '  required_plugins {',
        '    qemu = {',
        '      source  = "github.com/hashicorp/qemu"',
        '      version = "~> 1.0"',
        '    }',
        '  }',
        '}',
        '',
        'variable "image_version" {',
        '  type    = string',
        '  default = "v1.0"',
        '}',
        '',
        'variable "base_image" {',
        '  type    = string',
        '  default = "Rocky-9-GenericCloud.qcow2"',
        '}',
        '',
        'source "qemu" "rocky9" {',
        '  iso_url          = "/data/images/${var.base_image}"',
        '  output_directory = "/data/export/packer-rocky9-${var.image_version}"',
        '  disk_image       = true',
        '  format           = "qcow2"',
        '  accelerator      = "kvm"',
        '  ssh_username     = "root"',
        '  ssh_private_key_file = "/root/.ssh/id_ed25519"',
        '  shutdown_command = "shutdown -P now"',
        '}',
        '',
        'build {',
        '  sources = ["source.qemu.rocky9"]',
        '',
        '  provisioner "shell" {',
        '    inline = [',
        '      "dnf install -y qemu-guest-agent chrony",',
        '      "systemctl enable qemu-guest-agent chronyd",',
        '      "cloud-init clean --logs"',
        '    ]',
        '  }',
        '}'
      ].join('\n') + '\n', mode: '644', user: 'root', mtime: '2024-03-10 09:05' },
    /* ---- Vagrant 开发环境（vagrant 会从当前目录向上找 Vagrantfile） ---- */
    '/root/Vagrantfile': {
      content: [
        '# -*- mode: ruby -*-',
        'Vagrant.configure("2") do |config|',
        '  config.vm.box = "generic/rocky9"',
        '  config.vm.hostname = "dev-web"',
        '  config.vm.network "private_network", ip: "192.168.56.10"',
        '',
        '  config.vm.provider "libvirt" do |lv|',
        '    lv.memory = 2048',
        '    lv.cpus = 2',
        '  end',
        '',
        '  config.vm.provider "virtualbox" do |vb|',
        '    vb.memory = 2048',
        '    vb.cpus = 2',
        '  end',
        '',
        '  config.vm.provision "shell", inline: <<-SHELL',
        '    dnf install -y nginx',
        '    systemctl enable --now nginx',
        '  SHELL',
        'end'
      ].join('\n') + '\n', mode: '644', user: 'root', mtime: '2024-03-13 20:15' },
    /* ---- sysctl：内核参数的"文件视图"（sysctl 命令直接读写这些文件） ---- */
    '/etc/sysctl.d/99-tuning.conf': {
      content: [
        '# 高并发 Web 前端的内核参数调优',
        '# /etc/sysctl.d/ 下的文件按名称排序依次加载，99- 前缀保证最后生效',
        'net.core.somaxconn = 32768',
        'net.ipv4.tcp_max_syn_backlog = 16384',
        'net.ipv4.tcp_tw_reuse = 1',
        'net.ipv4.ip_local_port_range = 10000 65000',
        'fs.file-max = 2097152'
      ].join('\n') + '\n', mode: '644', user: 'root', mtime: '2024-03-17 21:40' },
    '/proc/sys/net/core/somaxconn': { content: '32768\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/core/rmem_max': { content: '212992\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/core/wmem_max': { content: '212992\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/core/netdev_max_backlog': { content: '1000\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/ip_forward': { content: '1\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_tw_reuse': { content: '2\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_max_syn_backlog': { content: '8192\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_max_tw_buckets': { content: '262144\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_timestamps': { content: '1\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_fin_timeout': { content: '60\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/ip_local_port_range': { content: '32768\t60999\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/vm/swappiness': { content: '60\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/vm/vfs_cache_pressure': { content: '100\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/vm/overcommit_memory': { content: '0\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/fs/file-max': { content: '2097152\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/fs/file-nr': { content: '3200\t0\t2097152\n', mode: '644', user: 'root', mtime: '2024-03-18 09:51' },
    '/proc/sys/fs/inotify/max_user_watches': { content: '524288\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/kernel/perf_event_paranoid': { content: '2\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/kernel/pid_max': { content: '4194304\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/kernel/shmall': { content: '18446744073692774399\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/kernel/shmmax': { content: '18446744073692774399\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' }
  });

  /* 这台机器上 libvirtd 是装了并且开机启用的 —— 否则 `systemctl is-enabled libvirtd`
     会报 "Failed to get unit file state ...: No such file or directory"，
     而 data/kvm.js 的自启检查清单里这一条要求输出 enabled。
     systemctl 是从 window.CC_TERM_FS.services 取服务状态的，所以在这里把 libvirtd
     注册进这台机器的服务表（只加数据，不改 systemctl 实现）。 */
  if (window.CC_TERM_FS && window.CC_TERM_FS.services && !window.CC_TERM_FS.services.libvirtd) {
    window.CC_TERM_FS.services.libvirtd = {
      load: 'loaded', active: 'active (running)', since: '2024-03-16 10:00:03 CST; 2 days ago',
      pid: '1188', mem: '12.4M', desc: 'Virtualization daemon'
    };
    window.CC_TERM_FS.services['virtqemud'] = {
      load: 'loaded', active: 'active (running)', since: '2024-03-16 10:00:04 CST; 2 days ago',
      pid: '1201', mem: '9.8M', desc: 'Virtualization qemu daemon'
    };
  }

  /* ======================= 2. 模拟状态 ======================= */

  /* 初始域名清单。状态覆盖 data/kvm.js 里说的四种：running / shut off / paused / crashed；
     web-prod-01 是这台宿主机上的生产 Web 前端，所以初始就是 running。
     磁盘路径必须与 fsAdd 里真实存在的镜像文件一一对应（domblklist 会指向它们）。 */
  function initDomains() {
    return [
      { name: 'web-prod-01', id: 1, state: 'running', stateReason: 'unknown',
        title: '订单系统 Web 前端（生产）', uuid: '8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88',
        os: 'hvm', arch: 'x86_64', machine: 'pc-i440fx-rhel7.6.0', ostype: 'rocky9.0',
        vcpus: 4, maxvcpus: 8, memory: 8388608, curmem: 8388608, autostart: true,
        cpuTime: 44463.0, persistent: true,
        disks: [{ target: 'vda', bus: 'virtio', dev: 'disk', type: 'file', src: '/data/vmstore/web-prod-01.qcow2', fmt: 'qcow2' }],
        ifaces: [{ iface: 'vnet0', type: 'network', src: 'default', model: 'virtio', mac: '52:54:00:8f:3a:21' }],
        snapshots: [] },
      { name: 'db-prod-01', id: 2, state: 'running', stateReason: 'unknown',
        title: '订单库 MySQL 主库（生产）', uuid: '3d9b7c14-2a8e-4f60-b7d5-6c1e9a4f2b70',
        os: 'hvm', arch: 'x86_64', machine: 'pc-i440fx-rhel7.6.0', ostype: 'rocky9.0',
        vcpus: 8, maxvcpus: 16, memory: 16777216, curmem: 16777216, autostart: true,
        cpuTime: 128934.7, persistent: true,
        disks: [{ target: 'vda', bus: 'virtio', dev: 'disk', type: 'file', src: '/var/lib/libvirt/images/db-prod-01.qcow2', fmt: 'qcow2' }],
        ifaces: [{ iface: 'vnet1', type: 'bridge', src: 'br0', model: 'virtio', mac: '52:54:00:6b:1d:42' }],
        snapshots: [{ name: 'before-index-rebuild', created: '2024-03-14 02:10:11 +0800', state: 'shutoff', desc: '重建索引前' }] },
      { name: 'db-test-01', id: null, state: 'shut off', stateReason: 'shutdown',
        title: '压测用数据库（测试）', uuid: 'a51c8e30-77bd-4c19-9f2e-58d0b6a3e914',
        os: 'hvm', arch: 'x86_64', machine: 'pc-i440fx-rhel7.6.0', ostype: 'rocky9.0',
        vcpus: 2, maxvcpus: 4, memory: 4194304, curmem: 4194304, autostart: true,
        cpuTime: 0, persistent: true,
        disks: [{ target: 'vda', bus: 'virtio', dev: 'disk', type: 'file', src: '/var/lib/libvirt/images/db-test-01.qcow2', fmt: 'qcow2' }],
        ifaces: [{ iface: 'vnet2', type: 'network', src: 'default', model: 'virtio', mac: '52:54:00:9a:4c:17' }],
        snapshots: [] },
      { name: 'win-test-01', id: null, state: 'paused', stateReason: 'user',
        title: '财务报税系统（Windows，已暂停）', uuid: 'c72f4b98-6e15-4d3a-8b71-2f9e4c6a0d55',
        os: 'hvm', arch: 'x86_64', machine: 'pc-i440fx-rhel7.6.0', ostype: 'win10',
        vcpus: 4, maxvcpus: 4, memory: 8388608, curmem: 8388608, autostart: false,
        cpuTime: 8123.4, persistent: true,
        disks: [{ target: 'vda', bus: 'sata', dev: 'disk', type: 'file', src: '/var/lib/libvirt/images/win-test-01.qcow2', fmt: 'qcow2' }],
        ifaces: [{ iface: 'vnet3', type: 'network', src: 'default', model: 'e1000e', mac: '52:54:00:3f:8d:90' }],
        snapshots: [] },
      { name: 'legacy-erp', id: null, state: 'crashed', stateReason: 'crashed',
        title: '老 ERP 系统（已崩溃，待处理）', uuid: 'e08a1d26-5b74-4e82-a1c9-7d3f6028b4e1',
        os: 'hvm', arch: 'x86_64', machine: 'pc-i440fx-rhel7.6.0', ostype: 'centos7.0',
        vcpus: 2, maxvcpus: 2, memory: 4194304, curmem: 4194304, autostart: false,
        cpuTime: 210.9, persistent: true,
        disks: [{ target: 'vda', bus: 'virtio', dev: 'disk', type: 'file', src: '/var/lib/libvirt/images/legacy-erp.qcow2', fmt: 'qcow2' }],
        ifaces: [{ iface: 'vnet4', type: 'network', src: 'default', model: 'virtio', mac: '52:54:00:d4:2a:6c' }],
        snapshots: [] }
    ];
  }

  function initNets() {
    /* default 网络初始是 inactive + 未设 autostart —— 这正是 data/kvm.js 里
       "宿主机重启后虚机报 network default is not active" 那个高频故障的现场：
       示例先 net-list --all 看到 inactive，再 net-start + net-autostart 修复。 */
    return [
      { name: 'default', uuid: '1f2c3d44-5e66-4778-8899-aabbccddeeff', active: false, autostart: false,
        bridge: 'virbr0', forward: 'nat', ip: '192.168.122.1', netmask: '255.255.255.0',
        dhcpStart: '192.168.122.2', dhcpEnd: '192.168.122.254',
        leases: [
          { mac: '52:54:00:8f:3a:21', ip: '192.168.122.101', host: 'web-prod-01', expiry: '2024-03-18 21:12:41' },
          { mac: '52:54:00:9a:4c:17', ip: '192.168.122.102', host: 'db-test-01', expiry: '2024-03-18 20:04:07' },
          { mac: '52:54:00:3f:8d:90', ip: '192.168.122.103', host: 'win-test-01', expiry: '2024-03-18 22:31:55' }
        ] }
    ];
  }

  function initPools() {
    return [
      { name: 'default', uuid: '7a6b5c4d-3e2f-4180-9a7b-6c5d4e3f2a10', type: 'dir',
        target: '/var/lib/libvirt/images', active: true, autostart: true, defined: true }
    ];
  }

  /* 镜像元数据：virtual = 虚机看到的容量，actual = 宿主机上实际占用
     （actual 同样体现在 ls -l / du 里，两边必须对得上）。 */
  function initImages() {
    return {
      '/data/images/rocky9-base.qcow2': { fmt: 'qcow2', virtual: 10 * G, actual: 1288490188, cluster: 65536 },
      '/data/images/Rocky-9-GenericCloud.qcow2': { fmt: 'qcow2', virtual: 10 * G, actual: 1288490188, cluster: 65536 },
      '/data/images/rocky9.raw': { fmt: 'raw', virtual: 40 * G, actual: 42949672960 },
      '/data/images/rocky9.qcow2': { fmt: 'qcow2', virtual: 40 * G, actual: 2248146944, cluster: 65536, compressed: true },
      '/data/images/cloud-base.raw': { fmt: 'raw', virtual: 20 * G, actual: 21474836480 },
      '/data/images/cloud-base.qcow2': { fmt: 'qcow2', virtual: 20 * G, actual: 1932735283, cluster: 65536, compressed: true },
      '/data/images/app.qcow2': { fmt: 'qcow2', virtual: 40 * G, actual: 9019431321, cluster: 65536 },
      '/data/export/app.vmdk': { fmt: 'vmdk', virtual: 40 * G, actual: 9126805504 },
      '/data/iso/Rocky-9.3-x86_64-dvd.iso': { fmt: 'raw', virtual: 9663676416, actual: 9663676416, iso: true },
      '/data/base/rocky9-base.qcow2': { fmt: 'qcow2', virtual: 10 * G, actual: 1288490188, cluster: 65536 },
      '/data/vmstore/web-prod-01.qcow2': { fmt: 'qcow2', virtual: 40 * G, actual: 6657199308, cluster: 65536 },
      '/data/vmstore/web-prod-01-compact.qcow2': { fmt: 'qcow2', virtual: 40 * G, actual: 5583457484, cluster: 65536, compressed: true },
      '/data/vmstore/web-prod-02.qcow2': { fmt: 'qcow2', virtual: 40 * G, actual: 1492501135, cluster: 65536 },
      '/data/vmstore/vm-03.qcow2': { fmt: 'qcow2', virtual: 40 * G, actual: 335544320, cluster: 65536, backing: '/data/base/rocky9-base.qcow2', backingFmt: 'qcow2' },
      '/data/vmstore/db.qcow2': { fmt: 'qcow2', virtual: 200 * G, actual: 94489280512, cluster: 65536 },
      '/data/vmstore/app-03.qcow2': { fmt: 'qcow2', virtual: 40 * G, actual: 1395864371, cluster: 65536 },
      '/data/vmstore/broken-vm.qcow2': { fmt: 'qcow2', virtual: 40 * G, actual: 5476083302, cluster: 65536, corrupt: true },
      '/data/vmstore/web-prod-02-seed.img': { fmt: 'raw', virtual: 368640, actual: 368640, iso: true, label: 'cidata' },
      '/tmp/verify-seed.img': { fmt: 'raw', virtual: 368640, actual: 368640, iso: true, label: 'cidata' },
      '/var/lib/libvirt/images/db-prod-01.qcow2': { fmt: 'qcow2', virtual: 200 * G, actual: 94489280512, cluster: 65536 },
      '/var/lib/libvirt/images/db-test-01.qcow2': { fmt: 'qcow2', virtual: 100 * G, actual: 12884901888, cluster: 65536 },
      '/var/lib/libvirt/images/win-test-01.qcow2': { fmt: 'qcow2', virtual: 80 * G, actual: 36507222016, cluster: 65536 },
      '/var/lib/libvirt/images/legacy-erp.qcow2': { fmt: 'qcow2', virtual: 60 * G, actual: 22548578304, cluster: 65536 }
    };
  }

  /* 块设备与分区表（growpart / resize2fs / xfs_growfs / pvresize / lvextend 用）：
     分区与文件系统的容量一律现算 —— growpart 比较"分区末尾"和"整盘末尾"，
     所以 `qemu-img resize +20G` 之后 `growpart /dev/vda 1` 才会真的报 CHANGED。 */
  function initBlock() {
    /* bytes = 分区表里的分区大小；fsBytes = 分区里**文件系统**当前的大小。
       两者分开存是关键：growpart 只改 bytes，resize2fs/xfs_growfs 才改 fsBytes ——
       "扩了分区但 df -h 没变" 这个新手最大的困惑，在模型里就是这两个字段不同步。 */
    return {
      '/dev/vda': { bytes: 40 * G, partitions: {
        '1': { bytes: 40 * G - M, fsBytes: 40 * G - M, fs: 'ext4', mount: '/', start: 2048 },
        '2': { bytes: 19 * G, fsBytes: 19 * G, fs: 'lvm', pv: 'vg0', start: 83886080 }
      } },
      '/dev/vdb': { bytes: 200 * G, partitions: {
        '1': { bytes: 100 * G, fsBytes: 100 * G, fs: 'ext4', mount: '/data', start: 2048 }
      } },
      '/dev/vdc': { bytes: 100 * G, partitions: {
        '1': { bytes: 100 * G - M, fsBytes: 100 * G - M, fs: 'ext4', mount: '/var/lib/docker', start: 2048 }
      } }
    };
  }
  function initLvm() {
    return {
      pvs: { '/dev/vda2': { vg: 'vg0', bytes: 19 * G }, '/dev/vdb1': { vg: 'vg-data', bytes: 100 * G } },
      vgs: {
        'vg0': { bytes: 19 * G, free: 3 * G, lvs: { 'lv_root': { bytes: 16 * G, fsBytes: 16 * G, fs: 'xfs', mount: '/' } } },
        'vg-data': { bytes: 100 * G, free: 12 * G, lvs: { 'lv-data': { bytes: 88 * G, fsBytes: 88 * G, fs: 'ext4', mount: '/data' } } }
      }
    };
  }

  /* 镜像内部的文件系统视图（guestfish / virt-df / virt-filesystems / virt-copy-out 用）。
     virt-df 与 virt-filesystems 读的是同一份数据，两者输出必须互相自洽。 */
  function guestFs(image) {
    var name = baseNameOf(image).replace(/\.(qcow2|raw|img|vmdk)$/, '');
    var hostname = image.indexOf('/data/images/') === 0 ? 'localhost.localdomain' : name;
    var parts;
    if (image.indexOf('/data/vmstore/db.qcow2') === 0 || image.indexOf('/var/lib/libvirt/images/db-') === 0) {
      parts = [
        { dev: '/dev/sda1', vfs: 'xfs', size: 1 * G, used: 320 * M, parent: '-', type: 'filesystem', mount: '/boot' },
        { dev: '/dev/sda2', vfs: 'xfs', size: 199 * G, used: 88 * G, parent: '-', type: 'filesystem', mount: '/' }
      ];
    } else if (image.indexOf('/var/lib/libvirt/images/win-test-01') === 0) {
      parts = [
        { dev: '/dev/sda1', vfs: 'ntfs', size: 100 * M, used: 32 * M, parent: '-', type: 'filesystem', mount: '/boot/efi' },
        { dev: '/dev/sda2', vfs: 'ntfs', size: 79 * G, used: 34 * G, parent: '-', type: 'filesystem', mount: '/' }
      ];
    } else if (image.indexOf('/data/images/') === 0 || image.indexOf('/data/base/') === 0) {
      parts = [
        { dev: '/dev/sda1', vfs: 'xfs', size: 10 * G, used: 2 * G, parent: '-', type: 'filesystem', mount: '/' }
      ];
    } else {
      parts = [
        { dev: '/dev/sda1', vfs: 'xfs', size: 1 * G, used: 268 * M, parent: '-', type: 'filesystem', mount: '/boot' },
        { dev: '/dev/sda2', vfs: 'xfs', size: 39 * G, used: 6 * G, parent: '-', type: 'filesystem', mount: '/' }
      ];
    }
    return {
      hostname: hostname,
      parts: parts,
      files: {
        '/etc/hostname': hostname + '\n',
        '/etc/os-release': 'NAME="Rocky Linux"\nVERSION="9.3 (Blue Onyx)"\nID="rocky"\nID_LIKE="rhel centos fedora"\nVERSION_ID="9.3"\nPLATFORM_ID="platform:el9"\nPRETTY_NAME="Rocky Linux 9.3 (Blue Onyx)"\n',
        '/etc/fstab': 'UUID=7f2c1a40-9d3e-4b51-8c6a-2e5f9b0d1a77 /boot xfs defaults 0 0\nUUID=1b8e4d92-5c76-4a30-9f81-3d7c6e2b49a5 / xfs defaults 0 0\n',
        '/etc/ssh/sshd_config': 'Port 22\nPermitRootLogin prohibit-password\nPasswordAuthentication no\n',
        '/var/log/messages': 'Mar 18 09:30:01 ' + hostname + ' systemd[1]: Starting Network Manager...\nMar 18 09:30:04 ' + hostname + ' systemd[1]: Started Network Manager.\nMar 18 09:38:33 ' + hostname + ' systemd[1]: Started My Web App.\nMar 18 09:41:18 ' + hostname + ' java[18442]: ERROR query timeout after 5000ms, orderId=8812\n',
        '/root/.ssh/authorized_keys': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH7kQ2mNv8xLpT4rWcY1bE6sJdA9fG3hK0nR5uV2xZ8q root@web-prod-01\n'
      }
    };
  }

  /* 每实例状态：挂在虚拟文件系统根节点上（与 shell.js 的 $cc_ 状态同一套做法）。
     reset() 换掉 root 时状态自动清零，两个标签页之间也不会互相污染。 */
  function S(ctx) {
    var root = ctx.root;
    if (!root.$cc_virt) {
      root.$cc_virt = {
        domains: initDomains(), nets: initNets(), pools: initPools(),
        images: initImages(), block: initBlock(), lvm: initLvm(), guest: {}
      };
    }
    return root.$cc_virt;
  }
  function findDomain(st, name) {
    for (var i = 0; i < st.domains.length; i++) if (st.domains[i].name === name) return st.domains[i];
    return null;
  }
  function findNet(st, name) {
    for (var i = 0; i < st.nets.length; i++) if (st.nets[i].name === name) return st.nets[i];
    return null;
  }
  function findPool(st, name) {
    for (var i = 0; i < st.pools.length; i++) if (st.pools[i].name === name) return st.pools[i];
    return null;
  }
  function nextDomainId(st) {
    /* 真机 libvirt 分配的是"当前最小的空闲 Id"（Id 只是运行期编号，关机即释放） */
    var used = {}, i;
    st.domains.forEach(function (d) { if (d.id) used[d.id] = true; });
    for (i = 1; i < 1000; i++) if (!used[i]) return i;
    return 1000;
  }
  function guestOf(st, image) {
    if (!st.guest[image]) st.guest[image] = guestFs(image);
    return st.guest[image];
  }
  /* 镜像元数据：状态里没有但从文件系统里能看见的文件，按扩展名与内容标记推断。
     注意：**实际占用（disk size）一律以文件节点上的 explicitSize 为准** ——
     模拟数据里的容量同时体现在 ls -l/du/stat 上，两边必须是同一个数，
     否则 `ls -lh` 与 `qemu-img info` 会互相打架（那是最容易误导学员的一类不一致）。 */
  function imageOf(ctx, abs) {
    var st = S(ctx);
    var node = U.findNode(ctx.root, abs);
    var meta = st.images[abs] || null;
    if (!meta) {
      if (!node || node.type !== 'file') return null;
      var fmt = 'raw';
      if (/\.qcow2$/.test(abs)) fmt = 'qcow2';
      else if (/\.vmdk$/.test(abs)) fmt = 'vmdk';
      else if (/\.vdi$/.test(abs)) fmt = 'vdi';
      var bytes = node.explicitSize !== undefined ? node.explicitSize : String(node.content || '').length;
      meta = { fmt: fmt, virtual: bytes, actual: bytes };
      if (fmt === 'qcow2') meta.cluster = 65536;
      st.images[abs] = meta;
    }
    if (node && node.type === 'file' && node.explicitSize !== undefined) meta.actual = node.explicitSize;
    return meta;
  }
  /* 写文件（逐级建目录），并同步 ls -l / du 用到的 explicitSize */
  function putFile(ctx, abs, content, meta) {
    var parent = U.parentOf(abs);
    var dir = U.findNode(ctx.root, parent);
    if (!dir) {
      var segs = parent.split('/').filter(Boolean), cur = ctx.root, path = '';
      for (var i = 0; i < segs.length; i++) {
        path += '/' + segs[i];
        if (!cur.children[segs[i]]) {
          var d = { type: 'dir', name: segs[i], children: {}, content: '', mode: '755', user: 'root', group: 'root', mtime: NOW_STAMP, target: null };
          cur.children[segs[i]] = d;
        }
        cur = cur.children[segs[i]];
      }
      dir = cur;
    }
    var name = baseNameOf(abs);
    var node = dir.children[name];
    if (!node || node.type !== 'file') {
      node = { type: 'file', name: name, children: null, content: '', mode: '644', user: 'root', group: 'root', mtime: NOW_STAMP, target: null };
      dir.children[name] = node;
    }
    node.content = content;
    node.mtime = NOW_STAMP;
    if (meta && meta.mode) node.mode = meta.mode;
    if (meta && meta.user) node.user = meta.user;
    if (meta && meta.group) node.group = meta.group;
    if (meta && meta.size !== undefined) node.explicitSize = meta.size;
    return node;
  }
  function fileLines(ctx, abs) {
    var r = U.readFileOrErr(ctx, abs);
    if (r.err) return null;
    return U.splitLines(r.content);
  }
  /* 某个镜像被哪台"正在运行"的虚机占用（qemu-img 写操作的写锁冲突、virt-customize 警告用） */
  function usedBy(st, abs) {
    for (var i = 0; i < st.domains.length; i++) {
      var d = st.domains[i];
      if (d.state !== 'running' && d.state !== 'paused') continue;
      for (var j = 0; j < d.disks.length; j++) if (d.disks[j].src === abs) return d;
    }
    return null;
  }

  /* ======================= 3. 域 XML ======================= */

  function xmlEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function domainXml(d, opts) {
    var live = !(opts && opts.inactive) && d.state !== 'shut off';
    var L = [];
    L.push("<domain type='kvm'" + (live && d.id ? " id='" + d.id + "'" : '') + '>');
    L.push('  <name>' + xmlEsc(d.name) + '</name>');
    L.push('  <uuid>' + d.uuid + '</uuid>');
    if (d.title) L.push('  <title>' + xmlEsc(d.title) + '</title>');
    L.push("  <memory unit='KiB'>" + d.memory + '</memory>');
    L.push("  <currentMemory unit='KiB'>" + d.curmem + '</currentMemory>');
    L.push("  <vcpu placement='static' current='" + d.vcpus + "'>" + d.maxvcpus + '</vcpu>');
    L.push('  <os>');
    L.push("    <type arch='" + d.arch + "' machine='" + d.machine + "'>" + d.os + '</type>');
    L.push("    <boot dev='hd'/>");
    L.push('  </os>');
    L.push('  <features>');
    L.push('    <acpi/>');
    L.push('    <apic/>');
    L.push('  </features>');
    L.push("  <cpu mode='host-passthrough' check='none' migratable='on'/>");
    L.push("  <clock offset='utc'/>");
    L.push('  <on_poweroff>destroy</on_poweroff>');
    L.push('  <on_reboot>restart</on_reboot>');
    L.push('  <on_crash>destroy</on_crash>');
    L.push('  <devices>');
    L.push('    <emulator>/usr/libexec/qemu-kvm</emulator>');
    d.disks.forEach(function (dk, i) {
      if (dk.dev === 'cdrom') {
        L.push("    <disk type='file' device='cdrom'>");
        L.push("      <driver name='qemu' type='" + (dk.fmt || 'raw') + "'/>");
        if (dk.src) L.push("      <source file='" + dk.src + "'/>");
        L.push('      <target dev=' + "'" + dk.target + "' bus='" + dk.bus + "'/>");
        L.push('      <readonly/>');
        L.push("      <address type='drive' controller='0' bus='0' target='0' unit='" + i + "'/>");
        L.push('    </disk>');
        return;
      }
      L.push("    <disk type='file' device='disk'>");
      L.push("      <driver name='qemu' type='" + (dk.fmt || 'qcow2') + "' cache='none' io='native'/>");
      L.push("      <source file='" + dk.src + "'/>");
      L.push("      <target dev='" + dk.target + "' bus='" + dk.bus + "'/>");
      L.push("      <address type='pci' domain='0x0000' bus='0x00' slot='" + (5 + i) + "' function='0x0'/>");
      L.push('    </disk>');
    });
    L.push("    <controller type='usb' index='0' model='piix3-uhci'/>");
    d.ifaces.forEach(function (f, i) {
      L.push("    <interface type='" + f.type + "'>");
      L.push("      <mac address='" + f.mac + "'/>");
      L.push(f.type === 'bridge' ? "      <source bridge='" + f.src + "'/>" : "      <source network='" + f.src + "'/>");
      L.push("      <model type='" + f.model + "'/>");
      L.push("      <address type='pci' domain='0x0000' bus='0x00' slot='" + (3 + i) + "' function='0x0'/>");
      L.push('    </interface>');
    });
    L.push("    <serial type='pty'>");
    L.push("      <target type='isa-serial' port='0'/>");
    L.push('    </serial>');
    L.push("    <console type='pty'>");
    L.push("      <target type='serial' port='0'/>");
    L.push('    </console>');
    L.push("    <channel type='unix'>");
    L.push("      <target type='virtio' name='org.qemu.guest_agent.0'/>");
    L.push('    </channel>');
    L.push("    <input type='tablet' bus='usb'/>");
    L.push("    <graphics type='vnc' port='-1' autoport='yes' listen='127.0.0.1'>");
    L.push("      <listen type='address' address='127.0.0.1'/>");
    L.push('    </graphics>');
    L.push('    <video>');
    L.push("      <model type='cirrus' vram='16384' heads='1' primary='yes'/>");
    L.push('    </video>');
    L.push("    <memballoon model='virtio'>");
    L.push("      <stats period='10'/>");
    L.push('    </memballoon>');
    L.push('  </devices>');
    L.push('</domain>');
    return L;
  }

  /* 从 XML 文本里取出定义域名需要的字段（parse 失败返回 null） */
  function parseDomainXml(text) {
    var t = String(text || '');
    function grab(re) { var m = re.exec(t); return m ? m[1] : null; }
    var name = grab(/<name>([^<]*)<\/name>/);
    if (!name) return null;
    var d = {
      name: name, uuid: grab(/<uuid>([^<]*)<\/uuid>/) || '00000000-0000-0000-0000-000000000000',
      title: grab(/<title>([^<]*)<\/title>/) || '',
      memory: parseInt(grab(/<memory[^>]*>(\d+)<\/memory>/) || '1048576', 10),
      curmem: parseInt(grab(/<currentMemory[^>]*>(\d+)<\/currentMemory>/) || '0', 10) || 0,
      vcpus: parseInt(grab(/<vcpu[^>]*>(\d+)<\/vcpu>/) || '1', 10),
      maxvcpus: 0, os: grab(/<type[^>]*>([^<]*)<\/type>/) || 'hvm',
      arch: grab(/<type arch='([^']*)'/) || 'x86_64',
      machine: grab(/machine='([^']*)'/) || 'pc-i440fx-rhel7.6.0',
      ostype: 'rocky9.0', state: 'shut off', stateReason: 'shutdown', id: null,
      autostart: false, cpuTime: 0, persistent: true, disks: [], ifaces: [], snapshots: []
    };
    /* vcpu 的 current 属性（<vcpu placement='static' current='4'>8</vcpu>） */
    var cur = /<vcpu[^>]*current='(\d+)'[^>]*>/.exec(t);
    if (cur) d.vcpus = parseInt(cur[1], 10);
    d.maxvcpus = d.vcpus;
    if (!d.curmem) d.curmem = d.memory;
    var diskRe = /<disk\b[\s\S]*?<\/disk>/g, m;
    while ((m = diskRe.exec(t)) !== null) {
      var block = m[0];
      var dev = /device='([^']*)'/.exec(block);
      var srcf = /<source file='([^']*)'/.exec(block);
      var tgt = /<target dev='([^']*)' bus='([^']*)'/.exec(block);
      var fmt = /<driver[^>]*type='([^']*)'/.exec(block);
      if (!tgt) continue;
      d.disks.push({ target: tgt[1], bus: tgt[2], dev: dev ? dev[1] : 'disk', type: 'file',
                     src: srcf ? srcf[1] : '', fmt: fmt ? fmt[1] : 'qcow2' });
    }
    var ifRe = /<interface\b[\s\S]*?<\/interface>/g;
    while ((m = ifRe.exec(t)) !== null) {
      var b = m[0];
      var ty = /<interface type='([^']*)'/.exec(b);
      var mac = /<mac address='([^']*)'/.exec(b);
      var src = /<source (?:network|bridge)='([^']*)'/.exec(b);
      var model = /<model type='([^']*)'/.exec(b);
      d.ifaces.push({ iface: 'vnet' + d.ifaces.length, type: ty ? ty[1] : 'network', src: src ? src[1] : 'default',
                      model: model ? model[1] : 'virtio', mac: mac ? mac[1] : '52:54:00:00:00:00' });
    }
    return d;
  }

  /* ======================= 4. virsh ======================= */

  function domErr(name) {
    return ['error: failed to get domain \'' + name + '\'',
            'error: Domain not found: no domain with matching name \'' + name + '\''];
  }
  function netErr(name) {
    return ['error: failed to get network \'' + name + '\'',
            'error: Network not found: no network with matching name \'' + name + '\''];
  }
  function poolErr(name) {
    return ['error: failed to get pool \'' + name + '\'',
            'error: Storage pool not found: no storage pool with matching name \'' + name + '\''];
  }
  function domStateText(d) { return d.state; }

  /* 教学环境里的状态推进：真机报错的地方改成"按请求推进 + 说明真实行为"。
     这并不是静默吞错 —— 提示里明确写了真机的报错文本与原因。 */
  function stateNote(dom, want, action) {
    if (action === 'start') {
      if (dom.state === 'running') return note('域名 ' + dom.name + ' 已经是 running，无需再启动。真机 virsh start 此时会报 ' +
        '"error: Requested operation is not valid: domain is already active"；教学环境按"已处于目标状态"继续。');
    }
    if (action === 'shutdown' || action === 'destroy') {
      if (dom.state === 'shut off') return note('域名 ' + dom.name + ' 已经是 shut off。真机 virsh ' + action + ' 此时会报 ' +
        '"error: Requested operation is not valid: domain is not running"；教学环境按"已处于目标状态"继续。');
    }
    return null;
  }

  /* 引擎不支持 `$(...)` 命令替换，于是
       virsh dumpxml web-prod-01 > /opt/kvm/xml/web-prod-01-$(date +%F).xml
     里的重定向解析不出来，整串会当成参数传进来。这里做一次补偿：
     识别 > / >>，把 $(date +%F) 这类常用替换按模拟环境的日期展开，输出写进虚拟文件系统，
     并明确说明这是教学终端的补偿行为（真 shell 里由 shell 自己完成）。 */
  function absorbRedirect(ctx, argv) {
    for (var i = 0; i < argv.length; i++) {
      if (argv[i] !== '>' && argv[i] !== '>>') continue;
      var target = argv.slice(i + 1).join(' ');
      var args = argv.slice(0, i);
      if (!target) return { argv: args, redirect: null };
      target = target.replace(/\$\(\s*date\s+\+([^)]*)\)/g, function (all, f) {
        var fmt = String(f).trim();
        if (fmt === '%F') return NOW_DATE;
        if (fmt === '%Y%m%d') return NOW_DATE.replace(/-/g, '');
        if (fmt === '%Y-%m-%d') return NOW_DATE;
        return NOW_DATE;
      });
      return { argv: args, redirect: { file: target, append: argv[i] === '>>' } };
    }
    return { argv: argv, redirect: null };
  }
  function applyRedirect(ctx, red, lines) {
    if (!red) return [];
    var abs = U.resolvePath(ctx.cwd, red.file);
    var parent = U.parentOf(abs);
    if (!U.findNode(ctx.root, parent)) {
      return ['error: failed to open file \'' + red.file + '\': No such file or directory'];
    }
    putFile(ctx, abs, lines.join('\n') + '\n');
    return [note('本模拟终端的引擎不做 `$(...)` 命令替换，virsh 自己把日期展开成 ' + NOW_DATE +
      '，输出已写入 ' + abs + '（真机上由 shell 完成重定向，virsh 只往标准输出打 XML）。')];
  }

  function virsh(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    var a = absorbRedirect(ctx, argv);
    argv = a.argv;
    var sub = argv[0];
    var rest = argv.slice(1);
    var out = [];

    /* --- 域名管理 --- */
    if (sub === 'list') {
      var all = argv.indexOf('--all') !== -1, inactive = argv.indexOf('--inactive') !== -1;
      var autostartOnly = argv.indexOf('--autostart') !== -1, noAutostart = argv.indexOf('--no-autostart') !== -1;
      var withSnap = argv.indexOf('--with-snapshot') !== -1, title = argv.indexOf('--title') !== -1;
      var list = st.domains.filter(function (d) {
        if (autostartOnly && !d.autostart) return false;
        if (noAutostart && d.autostart) return false;
        if (withSnap && !d.snapshots.length) return false;
        if (inactive) return d.state === 'shut off';
        if (all) return true;
        return d.state === 'running';
      });
      var nameW = 10, titleW = 10;
      list.forEach(function (d) {
        if (d.name.length > nameW) nameW = d.name.length;
        if (d.title && d.title.length > titleW) titleW = d.title.length;
      });
      function row(id, name, state, ttl) {
        var line = ' ' + U.pad(String(id === null ? '' : id), 4) + ' ' +
          U.pad(name, nameW + 2) + ' ' + U.pad(state, 10);
        if (title) line += ' ' + U.pad(ttl || '', titleW);
        return line.replace(/\s+$/, '');
      }
      out.push(row('Id', 'Name', 'State', 'Title'));
      var width = title ? (6 + nameW + 2 + 11 + titleW + 1) : (6 + nameW + 2 + 10);
      out.push(new Array(width + 1).join('-'));
      list.forEach(function (d) {
        out.push(row(d.state === 'running' ? String(d.id) : '', d.name, domStateText(d), d.title));
      });
      return U.ok(out.concat(applyRedirect(ctx, a.redirect, out)));
    }

    if (sub === 'dominfo' || sub === 'domstate' || sub === 'domblklist' || sub === 'domiflist' ||
        sub === 'domstats' || sub === 'domblkinfo' || sub === 'vcpucount' || sub === 'domifaddr' ||
        sub === 'start' || sub === 'shutdown' || sub === 'destroy' || sub === 'reboot' ||
        sub === 'console' || sub === 'setmem' || sub === 'setvcpus' || sub === 'autostart' ||
        sub === 'dumpxml' || sub === 'edit' || sub === 'suspend' || sub === 'resume' || sub === 'managedsave') {
      var dArgs = virshArgs(rest);
      var positional = dArgs.args;
      var domName = positional[0];
      /* `virsh shutdown web-prod-01; while ...` 这种写法：引擎不认 `;`，
         分号后的内容会被当参数塞进来。这里剥掉分号尾巴，只认域名本体。 */
      if (domName && domName.charAt(domName.length - 1) === ';') domName = domName.slice(0, -1);
      if (!domName) {
        if (sub === 'autostart' && rest.indexOf('--disable') === -1 && rest.length === 0) return U.fail(['error: command \'autostart\' requires <domain> option']);
        return U.fail(['error: command \'' + sub + '\' requires <domain> option']);
      }
      var dom = findDomain(st, domName);
      if (!dom) return U.fail(domErr(domName));

      if (sub === 'domstate') {
        if (argv.indexOf('--reason') !== -1) return U.ok([dom.state + ' (reason: ' + (dom.stateReason || 'unknown') + ')']);
        return U.ok([dom.state]);
      }
      if (sub === 'dominfo') {
        out.push('Id:             ' + (dom.state === 'running' && dom.id ? dom.id : '-'));
        out.push('Name:           ' + dom.name);
        out.push('UUID:           ' + dom.uuid);
        out.push('OS Type:        ' + dom.os);
        out.push('State:          ' + dom.state);
        if (dom.state === 'running') out.push('CPU(s):         ' + dom.vcpus);
        if (dom.state === 'running') out.push('CPU time:       ' + dom.cpuTime.toFixed(1) + 's');
        out.push('Max memory:     ' + dom.memory + ' KiB');
        out.push('Used memory:    ' + dom.curmem + ' KiB');
        out.push('Persistent:     ' + (dom.persistent ? 'yes' : 'no'));
        out.push('Autostart:      ' + (dom.autostart ? 'enable' : 'disable'));
        out.push('Managed save:   no');
        out.push('Security model: selinux');
        out.push('Security DOI:   0');
        out.push('Security label: system_u:system_r:svirt_t:s0:c' + (100 + (dom.id || 1)) + ',c' + (600 + (dom.id || 1)) + ' (enforcing)');
        return U.ok(out);
      }
      if (sub === 'domblklist') {
        var details = argv.indexOf('--details') !== -1;
        var disks = dom.disks.slice();
        out.push(details ? ' Type   Device   Target   Source' : ' Target   Source');
        var dw = 0;
        disks.forEach(function (d) { if (d.src.length > dw) dw = d.src.length; });
        out.push(new Array((details ? 35 : 17) + dw + 1).join('-'));
        disks.forEach(function (d) {
          if (details) out.push(' ' + U.pad(d.type, 7) + U.pad(d.dev, 9) + U.pad(d.target, 9) + d.src);
          else out.push(' ' + U.pad(d.target, 9) + d.src);
        });
        return U.ok(out);
      }
      if (sub === 'domiflist') {
        out.push(' Interface   Type      Source    Model    MAC');
        out.push(new Array(60).join('-'));
        dom.ifaces.forEach(function (f) {
          out.push(' ' + U.pad(f.iface, 12) + U.pad(f.type, 10) + U.pad(f.src, 10) + U.pad(f.model, 9) + f.mac);
        });
        return U.ok(out);
      }
      if (sub === 'domblkinfo') {
        var dev = positional[1];
        if (!dev) return U.fail(['error: command \'domblkinfo\' requires <domain> <block device name>']);
        var dk = null;
        dom.disks.forEach(function (d) { if (d.target === dev) dk = d; });
        if (!dk) return U.fail(['error: invalid argument: requested device is not attached to the domain']);
        var img = imageOf(ctx, dk.src);
        var cap = img ? img.virtual : 0, alloc = img ? img.actual : 0;
        out.push('Capacity:       ' + cap);
        out.push('Allocation:     ' + alloc);
        out.push('Physical:       ' + Math.round(alloc * 1.01));
        return U.ok(out);
      }
      if (sub === 'vcpucount') {
        out.push('maximum      config         ' + dom.maxvcpus);
        if (dom.state === 'running') out.push('maximum      live           ' + dom.maxvcpus);
        out.push('current      config         ' + dom.vcpus);
        if (dom.state === 'running') out.push('current      live           ' + dom.vcpus);
        return U.ok(out);
      }
      if (sub === 'domstats') {
        var wantState = argv.indexOf('--state') !== -1, wantCpu = argv.indexOf('--cpu-total') !== -1;
        var wantBalloon = argv.indexOf('--balloon') !== -1, wantBlock = argv.indexOf('--block') !== -1;
        var noFilter = !wantState && !wantCpu && !wantBalloon && !wantBlock;
        out.push('Domain: \'' + dom.name + '\'');
        if (wantState || noFilter) {
          out.push('  state.state=' + (dom.state === 'running' ? 1 : (dom.state === 'paused' ? 3 : (dom.state === 'crashed' ? 5 : 2))));
          out.push('  state.reason=' + (dom.state === 'running' ? 1 : 0));
        }
        if (wantCpu || noFilter) out.push('  cpu.time=' + Math.round(dom.cpuTime * 1000000000));
        if (wantBalloon || noFilter || true) {
          out.push('  balloon.current=' + dom.curmem);
          out.push('  balloon.maximum=' + dom.memory);
          out.push('  balloon.swap_in=0');
          out.push('  balloon.swap_out=0');
          out.push('  balloon.major_fault=0');
          out.push('  balloon.minor_fault=0');
          out.push('  balloon.unused=0');
          out.push('  balloon.available=0');
          out.push('  balloon.rss=0');
        }
        return U.ok(out);
      }
      if (sub === 'start') {
        var n1 = stateNote(dom, 'running', 'start');
        dom.state = 'running';
        dom.stateReason = 'booted';
        dom.curmem = dom.memory;
        if (!dom.id) dom.id = nextDomainId(st);
        if (n1) out.push(n1);
        out.push('Domain \'' + dom.name + '\' started');
        out.push(note('真机上这条命令会拉起一个 qemu-system-x86_64 进程（`ps -ef | grep qemu` 能看到），' +
          '教学环境只把域名状态推进为 running，不会真的启动虚机。'));
        return U.ok(out);
      }
      if (sub === 'shutdown') {
        var mode = /--mode=([a-z]+)/.exec(argv.join(' '));
        var modeVal = mode ? mode[1] : (rest.indexOf('--mode') !== -1 ? rest[rest.indexOf('--mode') + 1] : 'acpi');
        var n2 = stateNote(dom, 'shut off', 'shutdown');
        if (n2) out.push(n2);
        dom.state = 'shut off';
        dom.stateReason = 'shutdown';
        dom.id = null;
        out.push(note('`virsh shutdown` 是**异步**的：真机上它立刻返回，客户机收到 ' + (modeVal || 'acpi').toUpperCase() +
          ' 关机信号后要过几秒到几十秒才真正关机，脚本里必须用 `virsh domstate <域名>` 轮询确认。'));
        out.push(note('教学环境按"客户机已响应关机请求"处理，状态已直接变为 shut off；真实的 QEMU 进程与客户机无法在这里模拟。'));
        return U.ok(out);
      }
      if (sub === 'destroy') {
        var graceful = argv.indexOf('--graceful') !== -1;
        var n3 = stateNote(dom, 'shut off', 'destroy');
        if (n3) out.push(n3);
        dom.state = 'shut off';
        dom.stateReason = 'destroyed';
        dom.id = null;
        out.push('Domain \'' + dom.name + '\' destroyed');
        out.push(note(graceful
          ? '`--graceful` 会先通过 Guest Agent 友好通知客户机，失败后才强制切断；教学环境只推进状态。'
          : '`destroy` 等同拔电源：客户机没有任何收尾机会，磁盘可能留下未落盘数据、文件系统可能需要 journal 恢复。' +
            '它**不删除虚机定义**（virsh list --all 里仍能看到，状态为 shut off），删除定义要用 virsh undefine。'));
        return U.ok(out);
      }
      if (sub === 'reboot') {
        dom.state = 'running';
        if (!dom.id) dom.id = nextDomainId(st);
        out.push('Domain \'' + dom.name + '\' is being rebooted');
        out.push(note('教学环境只把状态保持为 running；真机上是客户机内的 reboot 生效后才重新起来。'));
        return U.ok(out);
      }
      if (sub === 'suspend') { dom.state = 'paused'; dom.stateReason = 'user'; out.push('Domain \'' + dom.name + '\' suspended'); return U.ok(out); }
      if (sub === 'resume') { dom.state = 'running'; dom.stateReason = 'unpaused'; if (!dom.id) dom.id = nextDomainId(st); out.push('Domain \'' + dom.name + '\' resumed'); return U.ok(out); }
      if (sub === 'managedsave') {
        dom.state = 'shut off'; dom.id = null;
        out.push('Domain \'' + dom.name + '\' saved');
        out.push(note('managedsave 会把内存状态存到 /var/lib/libvirt/qemu/save/，下次 start 时恢复运行现场（比冷启动快得多）。'));
        return U.ok(out);
      }
      if (sub === 'console') {
        out.push(note('`virsh console` 连接的是客户机的虚拟串口（不依赖网络），退出键是 Ctrl + ]。'));
        out.push(note('本模拟终端是单行的，无法模拟交互式控制台会话 —— 真机上这会儿你会看到客户机的' +
          (dom.state === 'running' ? '登录提示符或内核日志' : '空白画面（虚机没运行）') + '。'));
        if (dom.state !== 'running') out.push(note('注意：域名 ' + dom.name + ' 当前是 ' + dom.state + '，真机连上去只会是一片空白。'));
        return U.ok(out);
      }
      if (sub === 'setmem') {
        var want = rest.filter(function (x) { return /^[0-9]/.test(x); })[0];
        var bytes = want ? parseSize(want) : null;
        if (!want || bytes === null) return U.fail(['error: invalid argument: failed to parse memory size \'' + (want || '') + '\'']);
        var live = argv.indexOf('--live') !== -1, config = argv.indexOf('--config') !== -1;
        if (bytes > dom.memory * K) return U.fail(['error: invalid argument: cannot set memory higher than max memory']);
        if (dom.state !== 'running' && live) {
          return U.fail(['error: Failed to set memory for domain \'' + dom.name + '\'',
                         'error: Requested operation is not valid: domain is not running']);
        }
        var kib = Math.round(bytes / K);
        if (live || !config) dom.curmem = kib;
        if (config) dom.memory = Math.max(dom.memory, kib);
        out.push(note('内存已' + (live ? '在线' : '') + '调整为 ' + kib + ' KiB。真机 virsh setmem 成功时**不输出任何内容**，' +
          '失败才报错；用 `virsh dominfo ' + dom.name + '` 看 Used memory 是否变了。'));
        if (dom.curmem < dom.memory) out.push(note('Used memory (' + dom.curmem + ' KiB) 小于 Max memory (' + dom.memory +
          ' KiB) 说明内存热插拔生效了 —— 两者不一致时，客户机内 `free -h` 看到的才是真正可用的内存。'));
        return U.ok(out);
      }
      if (sub === 'setvcpus') {
        var n = parseInt(rest.filter(function (x) { return /^\d+$/.test(x); })[0], 10);
        if (!n) return U.fail(['error: invalid argument: vcpu count is not a positive integer']);
        if (n > dom.maxvcpus) return U.fail(['error: invalid argument: requested vcpus is greater than max allowable vcpus for the live domain: ' + dom.maxvcpus]);
        dom.vcpus = n;
        out.push(note('vCPU 数已从持久化配置调整为 ' + n + '（上限 ' + dom.maxvcpus + '）。' +
          '真机 virsh setvcpus 成功时也不输出内容；在线加热插拔需要 XML 里预留 <vcpu ... current="..">。'));
        return U.ok(out);
      }
      if (sub === 'autostart') {
        if (argv.indexOf('--disable') !== -1) {
          dom.autostart = false;
          out.push('Domain \'' + dom.name + '\' unmarked as autostarted');
        } else {
          dom.autostart = true;
          out.push('Domain \'' + dom.name + '\' marked as autostarted');
          out.push(note('实现方式是在 /etc/libvirt/qemu/autostart/ 下建一个指向该域名 XML 的软链接，' +
            'libvirtd 启动时读这个目录 —— 所以 `virsh autostart` 只是"登记"，别忘了同时确认 libvirtd 本身开机启用。'));
        }
        return U.ok(out);
      }
      if (sub === 'dumpxml') {
        out = domainXml(dom, { inactive: argv.indexOf('--inactive') !== -1 });
        var extra = applyRedirect(ctx, a.redirect, out);
        return U.ok(out.concat(extra));
      }
      if (sub === 'edit') {
        out.push(note('`virsh edit` 会调用 $EDITOR 打开域名 XML，保存时 libvirt 会校验 XML 是否符合 schema，' +
          '不符合就拒绝写回 —— 这比直接改 /etc/libvirt/qemu/*.xml 安全得多。'));
        out.push(note('交互式编辑器无法在单行终端里模拟：这里把域名 ' + dom.name + ' 的定义当成"未改动"处理，' +
          '文件没有被修改（真机上改完保存即生效，多数改动要重启虚机才起作用）。'));
        out.push(note('改配置前先备份：`virsh dumpxml ' + dom.name + ' > /opt/kvm/xml/' + dom.name + '-$(date +%F).xml`。'));
        return U.ok(out);
      }
      if (sub === 'domifaddr') {
        var f0 = dom.ifaces[0];
        out.push(' Name       MAC address          Protocol     Address');
        out.push('-------------------------------------------------------------------------------');
        if (f0) out.push(' ' + U.pad(f0.iface, 11) + U.pad(f0.mac, 21) + U.pad('ipv4', 13) + '192.168.122.101/24');
        return U.ok(out);
      }
    }

    if (sub === 'define') {
      var file = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
      if (!file) return U.fail(['error: command \'define\' requires <file>']);
      var r = U.readFileOrErr(ctx, file);
      if (r.err) return U.fail(['error: Failed to open file \'' + file + '\': No such file or directory']);
      var parsed = parseDomainXml(r.content);
      if (!parsed) {
        return U.fail(['error: Failed to define domain from ' + file,
                       'error: internal error: Failed to parse XML']);
      }
      var exist = findDomain(st, parsed.name);
      if (exist) {
        parsed.state = exist.state; parsed.id = exist.id; parsed.cpuTime = exist.cpuTime;
        parsed.autostart = exist.autostart; parsed.snapshots = exist.snapshots;
      }
      if (exist) st.domains[st.domains.indexOf(exist)] = parsed;
      else st.domains.push(parsed);
      return U.ok(['Domain \'' + parsed.name + '\' defined from ' + file]);
    }

    if (sub === 'undefine') {
      var uName = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
      if (!uName) return U.fail(['error: command \'undefine\' requires <domain>']);
      var ud = findDomain(st, uName);
      if (!ud) return U.fail(domErr(uName));
      st.domains.splice(st.domains.indexOf(ud), 1);
      var uOut = ['Domain \'' + uName + '\' has been undefined'];
      if (argv.indexOf('--remove-all-storage') !== -1) {
        ud.disks.forEach(function (d) {
          if (!d.src) return;
          var node = U.findNode(ctx.root, d.src);
          if (!node) return;
          var p = U.parentOf(d.src);
          var pn = U.findNode(ctx.root, p);
          if (pn) { delete pn.children[baseNameOf(d.src)]; delete st.images[d.src]; }
          uOut.push('Storage volume \'' + baseNameOf(d.src) + '\' removed');
        });
      } else {
        uOut.push(note('`undefine` **不会删除磁盘文件**：' + ud.disks.map(function (d) { return d.src; }).join('、') +
          ' 还留在存储池里占空间，确认不需要后再手工清理（或加 --remove-all-storage 让 libvirt 一起删）。'));
      }
      return U.ok(uOut);
    }

    if (sub === 'domxml-to-native') {
      var fmt = rest[0], src = rest[1];
      if (!fmt || !src) return U.fail(['error: command \'domxml-to-native\' requires <format> <domain>']);
      var dx = findDomain(st, src);
      if (!dx) {
        var rr = U.readFileOrErr(ctx, src);
        if (rr.err) return U.fail(domErr(src));
        var pp = parseDomainXml(rr.content);
        if (!pp) return U.fail(['error: failed to parse file \'' + src + '\'']);
        dx = pp;
      }
      var d0 = dx.disks[0] || { src: '', fmt: 'qcow2' };
      var i0 = dx.ifaces[0] || { mac: '52:54:00:00:00:00' };
      out.push('/usr/libexec/qemu-kvm -name guest=' + dx.name + ',debug-threads=on -S -object secret,id=masterKey0,format=raw,' +
        'file=/var/lib/libvirt/qemu/domain-' + (dx.id || 1) + '-' + dx.name + '/master-key.aes ' +
        "-machine pc-i440fx-rhel7.6.0,accel=kvm,usb=off,dump-guest-core=off -cpu host-passthrough " +
        '-m ' + Math.round(dx.memory / K) + ' -overcommit mem-lock=off -smp ' + dx.vcpus + ',sockets=1,cores=' + dx.vcpus + ',threads=1 ' +
        "-uuid " + dx.uuid + ' -no-user-config -nodefaults -chardev socket,id=charmonitor,fd=32,server=on,wait=off ' +
        '-mon chardev=charmonitor,id=monitor,mode=control -rtc base=utc -no-shutdown -boot strict=on ' +
        "-device piix3-usb-uhci,id=usb,bus=pci.0,addr=0x1.0x2 -drive file=" + d0.src + ',format=' + (d0.fmt || 'qcow2') +
        ',if=none,id=drive-virtio-disk0,cache=none,aio=native -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x5,' +
        'drive=drive-virtio-disk0,id=virtio-disk0,bootindex=1 -netdev tap,fd=33,id=hostnet0,vhost=on,vhostfd=34 ' +
        '-device virtio-net-pci,netdev=hostnet0,id=net0,mac=' + i0.mac + ',bus=pci.0,addr=0x3 ' +
        '-chardev pty,id=charserial0 -device isa-serial,chardev=charserial0,id=serial0 ' +
        '-device virtio-balloon-pci,id=balloon0,bus=pci.0,addr=0x6 -sandbox on,obsolete=deny,elevateprivileges=deny,' +
        'spawn=deny,resourcecontrol=deny -msg timestamp=on');
      out.push(note('上面就是 `virsh domxml-to-native qemu-argv` 的用途：把 libvirt 的 XML 翻译成 QEMU 的实际启动参数，' +
        '排查"libvirt 到底给 QEMU 传了什么"时最直接的手段。'));
      return U.ok(out);
    }

    /* --- 快照 --- */
    if (sub === 'snapshot-create-as' || sub === 'snapshot-create') {
      var sPos = rest.filter(function (x) { return x.charAt(0) !== '-'; });
      var sd = findDomain(st, sPos[0]);
      if (!sd) return U.fail(domErr(sPos[0] || ''));
      var snapName = sPos[1] || ('snap' + (sd.snapshots.length + 1));
      var desc = sPos[2] || '';
      var diskOnly = argv.indexOf('--disk-only') !== -1;
      var quiesce = argv.indexOf('--quiesce') !== -1;
      if (sd.state === 'shut off' && !diskOnly) {
        out.push(note('域名 ' + sd.name + ' 处于 shut off：真机对关机虚机做系统检查点会报 ' +
          '"error: Operation not supported: domain is not running"，只有 --disk-only 的磁盘快照才能做。'));
      }
      sd.snapshots.push({ name: snapName, created: NOW_STAMP + ':07 +0800', desc: desc,
                          state: diskOnly ? 'shutoff' : (sd.state === 'running' ? 'running' : 'shutoff') });
      out.push('Domain snapshot ' + snapName + ' created');
      if (quiesce) out.push(note('--quiesce 要求客户机里运行 qemu-guest-agent：打快照前它会冻结文件系统，' +
        '保证快照里的数据是一致的。没装 agent 时真机会报 "guest agent is not responding"。'));
      if (diskOnly) out.push(note('--disk-only 只存磁盘、不存内存，回滚后要重新启动虚机；' +
        '它会产生独立的 overlay 文件（domblklist 里能看到新的 source），空间占用比系统检查点小得多。'));
      else out.push(note('系统检查点同时保存磁盘与内存状态，回滚后虚机从快照那一刻继续运行；代价是占用空间大。'));
      out.push(note('**快照不是备份**：它和被快照的磁盘通常在同一个存储上，存储损坏会一起丢，长期数据保护要用真正的备份。'));
      return U.ok(out);
    }
    if (sub === 'snapshot-list') {
      var lPos = rest.filter(function (x) { return x.charAt(0) !== '-'; });
      var ld = findDomain(st, lPos[0]);
      if (!ld) return U.fail(domErr(lPos[0] || ''));
      if (argv.indexOf('--name') !== -1) {
        ld.snapshots.forEach(function (s) { out.push(s.name); });
        return U.ok(out);
      }
      out.push(' Name                 Creation Time             State');
      out.push('------------------------------------------------------------');
      if (!ld.snapshots.length) {
        out.push(note('域名 ' + ld.name + ' 还没有任何快照。快照用于"改配置/升级前的短时间回滚保险"，' +
          '命名建议带上日期与用途，例如 before-kernel-upgrade-20240318。'));
        return U.ok(out);
      }
      var snapW = 21;
      ld.snapshots.forEach(function (s) { if (s.name.length + 1 > snapW) snapW = s.name.length + 1; });
      ld.snapshots.forEach(function (s) {
        out.push(' ' + U.pad(s.name, snapW) + U.pad(s.created, 26) + s.state);
      });
      return U.ok(out);
    }
    if (sub === 'snapshot-revert') {
      var rPos = rest.filter(function (x) { return x.charAt(0) !== '-'; });
      var rd2 = findDomain(st, rPos[0]);
      if (!rd2) return U.fail(domErr(rPos[0] || ''));
      var target = null;
      rd2.snapshots.forEach(function (s) { if (s.name === rPos[1]) target = s; });
      if (!target) return U.fail(['error: failed to get domain snapshot \'' + (rPos[1] || '') + '\'',
                                  'error: Domain snapshot not found: no domain snapshot with matching name \'' + (rPos[1] || '') + '\'']);
      if (target.state === 'running') { rd2.state = 'running'; if (!rd2.id) rd2.id = nextDomainId(st); }
      else { rd2.state = 'shut off'; rd2.id = null; }
      out.push(note('已回滚到快照 ' + target.name + '。**快照之后的所有写入全部丢失**，回滚前必须确认。'));
      out.push(note('真机 virsh snapshot-revert 成功时不输出任何内容；磁盘快照（--disk-only）回滚后要手工 `virsh start` 才能继续用。'));
      return U.ok(out);
    }
    if (sub === 'snapshot-delete') {
      var dPos = rest.filter(function (x) { return x.charAt(0) !== '-'; });
      var dd = findDomain(st, dPos[0]);
      if (!dd) return U.fail(domErr(dPos[0] || ''));
      var idx = -1;
      dd.snapshots.forEach(function (s, i) { if (s.name === dPos[1]) idx = i; });
      if (idx < 0) return U.fail(['error: failed to get domain snapshot \'' + (dPos[1] || '') + '\'',
                                  'error: Domain snapshot not found: no domain snapshot with matching name \'' + (dPos[1] || '') + '\'']);
      dd.snapshots.splice(idx, 1);
      out.push('Domain snapshot ' + dPos[1] + ' deleted');
      out.push(note('外部快照（--disk-only 产生的 overlay）删除后会释放空间，但**内部快照（qemu-img snapshot）删除不会释放空间**，' +
        '要真正回收只能 `qemu-img convert` 重写镜像。'));
      return U.ok(out);
    }
    if (sub === 'snapshot-info') {
      var iPos = rest.filter(function (x) { return x.charAt(0) !== '-'; });
      var idm = findDomain(st, iPos[0]);
      if (!idm) return U.fail(domErr(iPos[0] || ''));
      var sn = null;
      idm.snapshots.forEach(function (s) { if (s.name === iPos[1]) sn = s; });
      if (!sn) return U.fail(['error: failed to get domain snapshot \'' + (iPos[1] || '') + '\'']);
      out.push('Name:           ' + sn.name);
      out.push('Domain:         ' + idm.name);
      if (sn.desc) out.push('Description:    ' + sn.desc);
      out.push('State:          ' + sn.state);
      out.push('Created:        ' + sn.created);
      return U.ok(out);
    }

    /* --- 虚拟网络 --- */
    if (sub === 'net-list') {
      var nAll = argv.indexOf('--all') !== -1, nAuto = argv.indexOf('--autostart') !== -1;
      var nets = st.nets.filter(function (n) {
        if (nAuto && !n.autostart) return false;
        if (nAll) return true;
        return n.active;
      });
      out.push(' Name      State      Autostart   Persistent');
      out.push('--------------------------------------------------');
      nets.forEach(function (n) {
        out.push(' ' + U.pad(n.name, 10) + U.pad(n.active ? 'active' : 'inactive', 11) +
          U.pad(n.autostart ? 'yes' : 'no', 12) + 'yes');
      });
      if (nAll) {
        var broken = st.nets.filter(function (n) { return !n.active && !n.autostart; });
        if (broken.length) {
          out.push(note('`' + broken[0].name + '` 网络处于 inactive 且没设 autostart —— 宿主机重启后虚机会报 ' +
            '"network ' + broken[0].name + ' is not active" 起不来，修复就是 `virsh net-start ' + broken[0].name +
            ' && virsh net-autostart ' + broken[0].name + '`。'));
        }
      }
      return U.ok(out);
    }
    if (sub === 'net-dumpxml') {
      var nx = findNet(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!nx) return U.fail(netErr(rest.filter(function (x) { return x.charAt(0) !== '-'; })[0] || ''));
      out = [
        "<network connections='" + (nx.active ? 2 : 0) + "'>",
        '  <name>' + nx.name + '</name>',
        '  <uuid>' + nx.uuid + '</uuid>',
        nx.forward === 'nat' ? "  <forward mode='nat'/>" : "  <forward mode='" + nx.forward + "'/>",
        '  <bridge name=\'' + nx.bridge + '\' stp=\'on\' delay=\'0\'/>',
        "  <mtu size='1500'/>",
        "  <ip address='" + nx.ip + "' netmask='" + nx.netmask + "'>",
        '    <dhcp>',
        "      <range start='" + nx.dhcpStart + "' end='" + nx.dhcpEnd + "'/>",
        '    </dhcp>',
        '  </ip>',
        '</network>'
      ];
      return U.ok(out.concat(applyRedirect(ctx, a.redirect, out)));
    }
    if (sub === 'net-start') {
      var ns = findNet(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!ns) return U.fail(netErr(rest[0] || ''));
      if (ns.active) out.push(note('网络 ' + ns.name + ' 已经是 active。真机 virsh net-start 此时会报 ' +
        '"error: network is already active" —— 这次操作真正的重点是接下来的 `virsh net-autostart`：' +
        '它才是"宿主机重启后网络不再掉"的关键。'));
      ns.active = true;
      out.push('Network ' + ns.name + ' started');
      return U.ok(out);
    }
    if (sub === 'net-destroy') {
      var nd = findNet(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!nd) return U.fail(netErr(rest[0] || ''));
      nd.active = false;
      out.push('Network ' + nd.name + ' destroyed');
      out.push(note('`net-destroy` 是立即断开该网络（上面所有虚机立刻失去网络），**不是删除网络定义**，' +
        '`net-list --all` 里仍能看到它处于 inactive；重启网络用 `net-start`。'));
      return U.ok(out);
    }
    if (sub === 'net-autostart') {
      var na = findNet(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!na) return U.fail(netErr(rest[0] || ''));
      if (argv.indexOf('--disable') !== -1) { na.autostart = false; out.push('Network ' + na.name + ' unmarked as autostarted'); }
      else { na.autostart = true; out.push('Network ' + na.name + ' marked as autostarted'); }
      return U.ok(out);
    }
    if (sub === 'net-edit') {
      var ne = findNet(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!ne) return U.fail(netErr(rest[0] || ''));
      out.push(note('`virsh net-edit ' + ne.name + '` 打开网络 XML（改网段就是改 <ip address=...> 与 <dhcp><range .../>）。'));
      out.push(note('交互式编辑器无法在单行终端里模拟，网络定义未改动。真机上保存后需要 `virsh net-destroy ' +
        ne.name + '` + `virsh net-start ' + ne.name + '` 才生效，**这会短暂中断该网络上所有虚机的网络**。'));
      return U.ok(out);
    }
    if (sub === 'net-dhcp-leases') {
      var nl = findNet(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!nl) return U.fail(netErr(rest[0] || ''));
      out.push(' Expiry Time          MAC address        Protocol   IP address           Hostname        Client ID or DUID');
      out.push('-------------------------------------------------------------------------------------------------------------------');
      nl.leases.forEach(function (l) {
        out.push(' ' + U.pad(l.expiry, 21) + U.pad(l.mac, 19) + U.pad('ipv4', 11) + U.pad(l.ip + '/24', 21) +
          U.pad(l.host, 16) + '-');
      });
      return U.ok(out);
    }
    if (sub === 'net-info') {
      var ni = findNet(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!ni) return U.fail(netErr(rest[0] || ''));
      out.push('Name:           ' + ni.name);
      out.push('UUID:           ' + ni.uuid);
      out.push('Active:         ' + (ni.active ? 'yes' : 'no'));
      out.push('Persistent:     yes');
      out.push('Autostart:      ' + (ni.autostart ? 'yes' : 'no'));
      out.push('Bridge:         ' + ni.bridge);
      return U.ok(out);
    }

    /* --- 存储池 / 卷 --- */
    if (sub === 'pool-list') {
      var pAll = argv.indexOf('--all') !== -1, pAuto = argv.indexOf('--autostart') !== -1;
      var pools = st.pools.filter(function (p) {
        if (pAuto && !p.autostart) return false;
        if (pAll) return true;
        return p.active;
      });
      out.push(' Name      State      Autostart');
      out.push('---------------------------------');
      pools.forEach(function (p) {
        out.push(' ' + U.pad(p.name, 10) + U.pad(p.active ? 'active' : 'inactive', 11) + (p.autostart ? 'yes' : 'no'));
      });
      if (pAll) out.push(note('存储池和网络一样：**没设 autostart 的池在宿主机重启后会停在 inactive**，靠它启动的虚机会找不到磁盘。'));
      return U.ok(out);
    }
    if (sub === 'pool-define-as' || sub === 'pool-create-as') {
      var pName = rest[0], pType = rest[1];
      var pTarget = null;
      for (var pi = 0; pi < rest.length; pi++) {
        if (rest[pi] === '--target') pTarget = rest[pi + 1];
        if (String(rest[pi]).indexOf('--target=') === 0) pTarget = rest[pi].slice(9);
      }
      if (!pName || !pType) return U.fail(['error: command \'pool-define-as\' requires <name> <type>']);
      if (findPool(st, pName)) {
        out.push(note('存储池 ' + pName + ' 已经定义过了。真机 virsh pool-define-as 此时会直接覆盖同名池的定义（不会报错），教学环境按"定义已存在"继续。'));
        return U.ok(out);
      }
      st.pools.push({ name: pName, uuid: '9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', type: pType,
                      target: pTarget || '/var/lib/libvirt/' + pType + '/' + pName,
                      active: sub === 'pool-create-as', autostart: false, defined: true });
      out.push('Pool ' + pName + ' defined');
      out.push(note('`pool-define-as` **只写配置、不创建目录** —— 完整的四步是 define-as → build → start → autostart，漏掉最后一步宿主机重启后池会是 inactive。'));
      return U.ok(out);
    }
    if (sub === 'pool-build') {
      var pb = findPool(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!pb) return U.fail(poolErr(rest[0] || ''));
      putFile(ctx, pb.target + '/.keep', '');
      var pbNode = U.findNode(ctx.root, U.parentOf(pb.target + '/.keep'));
      if (pbNode && pbNode.children['.keep']) delete pbNode.children['.keep'];
      out.push('Pool ' + pb.name + ' built');
      out.push(note('dir 类型的池，`pool-build` 就是 `mkdir -p ' + pb.target + '`；真正的坑是**目录属主**：' +
        'libvirt 以 qemu:qemu 身份访问磁盘，属主不对会报 Permission denied，通常要 chown qemu:qemu 并给 0755。'));
      return U.ok(out);
    }
    if (sub === 'pool-start' || sub === 'pool-destroy') {
      var ps = findPool(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!ps) return U.fail(poolErr(rest[0] || ''));
      ps.active = sub === 'pool-start';
      out.push('Pool ' + ps.name + (ps.active ? ' started' : ' destroyed'));
      return U.ok(out);
    }
    if (sub === 'pool-autostart') {
      var pa = findPool(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!pa) return U.fail(poolErr(rest[0] || ''));
      if (argv.indexOf('--disable') !== -1) { pa.autostart = false; out.push('Pool ' + pa.name + ' unmarked as autostarted'); }
      else { pa.autostart = true; out.push('Pool ' + pa.name + ' marked as autostarted'); }
      return U.ok(out);
    }
    if (sub === 'pool-info') {
      var po = findPool(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!po) return U.fail(poolErr(rest[0] || ''));
      var vols = listVolumes(ctx, st, po);
      var alloc = 0;
      vols.forEach(function (v) { alloc += v.bytes; });
      var capacity = po.target === '/data/vmstore' ? 200 * G - 512 * M : 100 * G - 512 * M;
      var avail = Math.max(0, capacity - alloc);
      out.push('Name:           ' + po.name);
      out.push('UUID:           ' + po.uuid);
      out.push('State:          ' + (po.active ? 'running' : 'inactive'));
      out.push('Persistent:     yes');
      out.push('Autostart:      ' + (po.autostart ? 'yes' : 'no'));
      out.push('Capacity:       ' + hSize2(capacity));
      out.push('Allocation:     ' + hSize2(alloc));
      out.push('Available:      ' + hSize2(avail));
      return U.ok(out);
    }
    if (sub === 'vol-list') {
      var pl = findPool(st, rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]);
      if (!pl) return U.fail(poolErr(rest[0] || ''));
      var vl = listVolumes(ctx, st, pl);
      var volW = 21;
      vl.forEach(function (v) { if (v.name.length + 1 > volW) volW = v.name.length + 1; });
      out.push(' ' + U.pad('Name', volW) + 'Path');
      out.push(new Array(volW + 60).join('-'));
      vl.forEach(function (v) { out.push(' ' + U.pad(v.name, volW) + v.path); });
      return U.ok(out);
    }
    if (sub === 'vol-create-as') {
      var vp = findPool(st, rest[0]);
      if (!vp) return U.fail(poolErr(rest[0] || ''));
      var vName = rest[1], vSize = rest[2];
      var vFmt = shortValue(argv, '') || null;
      for (var vi = 0; vi < rest.length; vi++) {
        if (rest[vi] === '--format') vFmt = rest[vi + 1];
        if (String(rest[vi]).indexOf('--format=') === 0) vFmt = rest[vi].slice(9);
      }
      if (!vName || !vSize) return U.fail(['error: command \'vol-create-as\' requires <pool> <name> <capacity>']);
      var vBytes = parseSize(vSize);
      if (vBytes === null) return U.fail(['error: invalid capacity \'' + vSize + '\'']);
      var vPath = vp.target + '/' + vName;
      var existed = !!U.findNode(ctx.root, vPath);
      if (existed) {
        out.push(note('存储池 ' + vp.name + ' 里已经有 ' + vName + ' 了。真机 virsh vol-create-as 此时会报 ' +
          '"error: storage volume \'' + vName + '\' already exists"；教学环境按"卷已就绪"继续，不重复创建。'));
      } else {
        putFile(ctx, vPath, '<binary:' + (vFmt || 'qcow2') + '>', { mode: '600', user: 'qemu', group: 'qemu', size: Math.round(vBytes / 40) });
        st.images[vPath] = { fmt: vFmt || 'qcow2', virtual: vBytes, actual: Math.round(vBytes / 40), cluster: 65536 };
        out.push('Vol ' + vName + ' created');
      }
      return U.ok(out);
    }
    if (sub === 'vol-info') {
      var vp2 = findPool(st, rest[0]);
      if (!vp2) return U.fail(poolErr(rest[0] || ''));
      var vp3 = vp2.target + '/' + (rest[1] || '');
      var vimg = imageOf(ctx, vp3);
      if (!vimg) return U.fail(['error: failed to get vol \'' + (rest[1] || '') + '\'',
                               'error: Storage volume not found: no storage vol with matching name \'' + (rest[1] || '') + '\'']);
      out.push('Name:           ' + rest[1]);
      out.push('Type:           file');
      out.push('Capacity:       ' + hSize2(vimg.virtual));
      out.push('Allocation:     ' + hSize2(vimg.actual));
      out.push('Path:           ' + vp3);
      return U.ok(out);
    }
    if (sub === 'vol-delete') {
      var vp4 = findPool(st, rest[0]);
      if (!vp4) return U.fail(poolErr(rest[0] || ''));
      var vPath2 = vp4.target + '/' + (rest[1] || '');
      var vn = U.findNode(ctx.root, vPath2);
      if (!vn) return U.fail(['error: failed to get vol \'' + (rest[1] || '') + '\'',
                              'error: Storage volume not found: no storage vol with matching name \'' + (rest[1] || '') + '\'']);
      var vpn = U.findNode(ctx.root, U.parentOf(vPath2));
      if (vpn) delete vpn.children[baseNameOf(vPath2)];
      delete st.images[vPath2];
      out.push('Vol ' + rest[1] + ' deleted');
      return U.ok(out);
    }

    if (sub === 'version') {
      out.push('Compiled against library: libvirt 9.0.0');
      out.push('Using library: libvirt 9.0.0');
      out.push('Using API: QEMU 9.0.0');
      out.push('Running hypervisor: QEMU 7.2.0');
      return U.ok(out);
    }
    if (sub === 'nodeinfo') {
      out.push('CPU model:           x86_64');
      out.push('CPU(s):              8');
      out.push('Core(s) per socket:  4');
      out.push('Socket(s):           2');
      out.push('Memory size:         32003 MB');
      out.push('Memory available:    18421 MB');
      return U.ok(out);
    }
    if (sub === 'uri') return U.ok(['qemu:///system']);
    if (sub === 'help' || sub === '--help' || !sub) {
      out.push('virsh [options]... [<command_string>]');
      out.push('     list [--all] [--inactive] [--autostart] [--no-autostart] [--with-snapshot] [--title]');
      out.push('     dominfo <domain> | domstate <domain> | domblklist <domain> [--details] | domiflist <domain>');
      out.push('     start|shutdown|destroy|reboot|console|edit <domain>');
      out.push('     dumpxml <domain> | define <file.xml> | undefine <domain>');
      out.push('     snapshot-create-as|snapshot-list|snapshot-revert|snapshot-delete <domain> ...');
      out.push('     net-list|net-start|net-destroy|net-autostart|net-dumpxml|net-dhcp-leases ...');
      out.push('     pool-list|pool-define-as|pool-build|pool-start|pool-autostart|pool-info|vol-list|vol-create-as ...');
      out.push('（教学环境实现了上面这些子命令；真实 virsh 的完整命令表见 `virsh help`）');
      return U.ok(out);
    }
    return U.fail(['error: unknown command: \'' + sub + '\'']);
  }

  /* 存储池里的卷 = 池目录下真实存在的文件（容量取自镜像元数据/文件节点） */
  function listVolumes(ctx, st, pool) {
    var dir = U.findNode(ctx.root, pool.target);
    var list = [];
    if (!dir || dir.type !== 'dir') return list;
    U.childrenSorted(dir).forEach(function (n) {
      var child = dir.children[n];
      if (child.type !== 'file') return;
      var abs = (pool.target === '/' ? '' : pool.target) + '/' + n;
      var img = st.images[abs];
      list.push({ name: n, path: abs, bytes: img ? img.actual : (child.explicitSize !== undefined ? child.explicitSize : String(child.content || '').length) });
    });
    return list;
  }

  /* ======================= 5. qemu-img ======================= */

  function imgErrOpen(path, extra) {
    return ['qemu-img: Could not open \'' + path + '\': ' + (extra || 'No such file or directory')];
  }
  function lockErr(path) {
    return ['qemu-img: Failed to get "write" lock',
            'Is another process using the image [' + path + ']?'];
  }
  function guessFmt(path) {
    if (/\.qcow2$/.test(path)) return 'qcow2';
    if (/\.qed$/.test(path)) return 'qed';
    if (/\.vmdk$/.test(path)) return 'vmdk';
    if (/\.vdi$/.test(path)) return 'vdi';
    if (/\.vhdx$/.test(path)) return 'vhdx';
    if (/\.img$/.test(path)) return 'raw';
    return 'raw';
  }
  /* 解析 -o 的逗号分隔选项 */
  function parseOptList(s) {
    var o = {};
    String(s || '').split(',').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      if (i < 0) o[kv] = true; else o[kv.slice(0, i)] = kv.slice(i + 1);
    });
    return o;
  }
  function infoLines(img, path, opts) {
    var out = [];
    out.push('image: ' + path);
    out.push('file format: ' + img.fmt);
    out.push('virtual size: ' + hSize(img.virtual) + ' (' + img.virtual + ' bytes)');
    out.push('disk size: ' + hSize(img.actual));
    if (img.fmt === 'qcow2') out.push('cluster_size: ' + (img.cluster || 65536));
    if (img.backing) {
      out.push('backing file: ' + img.backing);
      out.push('backing file format: ' + (img.backingFmt || guessFmt(img.backing)));
    }
    if (img.snapshots && img.snapshots.length) {
      out.push('Snapshot list:');
      out.push('ID        TAG                     VM SIZE                DATE       VM CLOCK');
      img.snapshots.forEach(function (s, i) {
        out.push(U.pad(String(i + 1), 10) + U.pad(s.name, 24) + U.pad('0 B', 23) + U.pad(s.date || (NOW_STAMP + ':00'), 11) + '00:00:00.000');
      });
    }
    if (img.fmt === 'qcow2' || img.fmt === 'qed' || img.fmt === 'vmdk' || img.fmt === 'vdi') {
      out.push('Format specific information:');
      if (img.fmt === 'qcow2') {
        out.push('    compat: 1.1');
        out.push('    compression type: zlib');
        out.push('    lazy refcounts: false');
        out.push('    refcount bits: 16');
        out.push('    corrupt: ' + (img.corrupt ? 'true' : 'false'));
        out.push('    extended l2: false');
      } else if (img.fmt === 'vmdk') {
        out.push('    create type: streamOptimized');
        out.push('    extent lines: 1');
      } else {
        out.push('    create type: dynamic');
      }
    }
    return out;
  }
  function infoJson(img, path) {
    var L = [];
    L.push('{');
    L.push('    "virtual-size": ' + img.virtual + ',');
    L.push('    "filename": "' + path + '",');
    if (img.fmt === 'qcow2') L.push('    "cluster-size": ' + (img.cluster || 65536) + ',');
    L.push('    "format": "' + img.fmt + '",');
    L.push('    "actual-size": ' + img.actual + ',');
    if (img.backing) {
      L.push('    "backing-filename": "' + img.backing + '",');
      L.push('    "backing-filename-format": "' + (img.backingFmt || guessFmt(img.backing)) + '",');
    }
    L.push('    "format-specific": {');
    L.push('        "type": "' + img.fmt + '",');
    L.push('        "data": {');
    if (img.fmt === 'qcow2') {
      L.push('            "compat": "1.1",');
      L.push('            "compression-type": "zlib",');
      L.push('            "lazy-refcounts": false,');
      L.push('            "refcount-bits": 16,');
      L.push('            "corrupt": ' + (img.corrupt ? 'true' : 'false') + ',');
      L.push('            "extended-l2": false');
    } else {
      L.push('            "create-type": "dynamic"');
    }
    L.push('        }');
    L.push('    },');
    L.push('    "dirty-flag": false');
    L.push('}');
    return L;
  }
  /* 新建/转换出来的镜像"实际占用"怎么估：qcow2 稀疏、raw 占满、压缩后大幅瘦身 */
  function actualFor(fmt, virtual, opts) {
    opts = opts || {};
    if (fmt === 'raw') return virtual;
    if (opts.compressed) return Math.max(1024 * 1024, Math.round(virtual * 0.0525));
    if (fmt === 'qcow2' && opts.fresh) {
      if (opts.prealloc === 'metadata') return 2228224 + Math.round(virtual * 0.0015);
      if (opts.prealloc === 'falloc' || opts.prealloc === 'full') return virtual;
      return 196608;
    }
    return Math.max(1024 * 1024, Math.round(virtual * 0.22));
  }
  /* qemu-img convert 的目标"实际占用"：以**源的实际占用**为基准算，这样
     "raw → qcow2 -c 变瘦"、"带快照的盘重写后回收空间"这些文档说法才成立。 */
  function convertActual(srcImg, dstFmt, compress) {
    if (dstFmt === 'raw') return srcImg.virtual;              /* raw 没有元数据开销，按容量占满 */
    var src = srcImg.actual;
    if (compress) return Math.max(M, Math.round(src * 0.72)); /* 压缩 + 零块检测 */
    if (srcImg.snapshots && srcImg.snapshots.length) return Math.max(M, Math.round(src * 0.75));  /* 重写丢快照、回收空间 */
    return Math.max(M, Math.round(src * 1.05));               /* 只是换格式：多一层元数据 */
  }

  /* qemu-img 的选项解析：必须知道哪些短选项**带值**（-f qcow2 / -O raw / -c name），
     否则选项的值会被当成位置参数（源文件/目标文件）。 */
  var QIMG_VALUE_SHORTS = {
    'info': 'f', 'create': 'fobF', 'convert': 'fOmStTl', 'resize': 'f',
    'check': 'fr', 'snapshot': 'cad', 'commit': 'fbt', 'map': 'f'
  };
  var QIMG_LONG_VALUE = { 'output': 1, 'preallocation': 1, 'cache': 1, 'base': 1, 'format': 1,
                          'output-fmt': 1, 'object': 1, 'image-opts': 1, 'backing-fmt': 1 };
  function qImgParse(argv, sub) {
    var valueShorts = QIMG_VALUE_SHORTS[sub] || '';
    var r = { v: {}, flags: {}, args: [] };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      var ml = /^--([A-Za-z0-9][A-Za-z0-9-]*)(?:=(.*))?$/.exec(a);
      if (ml) {
        if (ml[2] === undefined && QIMG_LONG_VALUE[ml[1]]) r.v[ml[1]] = String(argv[++i] === undefined ? '' : argv[i]);
        else r.v[ml[1]] = ml[2] === undefined ? true : ml[2];
        continue;
      }
      var ms = /^-([A-Za-z])(.*)$/.exec(a);
      if (ms) {
        var ch = ms[1], tail = ms[2];
        if (valueShorts.indexOf(ch) !== -1) {
          r.v[ch] = tail ? tail.replace(/^=/, '') : String(argv[++i] === undefined ? '' : argv[i]);
          continue;
        }
        r.flags[ch] = true;
        tail.split('').forEach(function (c) { if (c) r.flags[c] = true; });
        continue;
      }
      r.args.push(a);
    }
    return r;
  }

  function qemuImg(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    var sub = argv[0];
    var P = qImgParse(argv.slice(1), sub);
    var positional = P.args;
    var out = [];

    if (sub === 'info') {
      var target = positional[positional.length - 1];
      if (!target) return U.fail(['qemu-img: Expecting one image file name', "Try 'qemu-img --help' for more information"]);
      var infoAbs = U.resolvePath(ctx.cwd, target);
      var infoNode = U.findNode(ctx.root, infoAbs);
      if (!infoNode) return U.fail(imgErrOpen(target));
      if (infoNode.type === 'dir') return U.fail(imgErrOpen(target, 'Is a directory'));
      var asJson = P.v.output === 'json';
      var img = imageOf(ctx, infoAbs);
      if (asJson) return U.ok(infoJson(img, target));
      out = infoLines(img, target, {});
      if (P.v['backing-chain'] === true) {
        var cur = img, guard = 0;
        while (cur && cur.backing && guard < 8) {
          var bAbs = cur.backing;
          var bNode = U.findNode(ctx.root, bAbs);
          out.push('');
          if (!bNode) {
            out.push('qemu-img: Could not open \'' + bAbs + '\': No such file or directory');
            out.push(note('差分链断了：backing file 不存在，虚机会起不来。这就是 `--backing-chain` 存在的意义 —— ' +
              '它递归列出整条依赖链，任何一层缺失都一眼能看出来。'));
            return U.ok(out);
          }
          cur = imageOf(ctx, bAbs);
          var more = infoLines(cur, bAbs, {});
          for (var i = 0; i < more.length; i++) out.push(more[i]);
          guard++;
        }
        if (cur && cur.backing) out.push(note('差分链超过 8 层，已停止递归（真实场景请尽快合并，链越长 IO 越慢）。'));
      }
      if (P.flags.U || P.v['force-share'] === true) {
        out.push(note('-U/--force-share 是共享模式打开：虚机运行中也能查询，但结果可能不一致，只适合排障。'));
      }
      return U.ok(out);
    }

    if (sub === 'check') {
      var cTarget = positional[positional.length - 1];
      if (!cTarget) return U.fail(['qemu-img: Expecting one image file name', "Try 'qemu-img --help' for more information"]);
      var cAbs = U.resolvePath(ctx.cwd, cTarget);
      var cNode = U.findNode(ctx.root, cAbs);
      if (!cNode) return U.fail(imgErrOpen(cTarget));
      var cImg = imageOf(ctx, cAbs);
      if (cImg.fmt === 'raw') {
        return U.fail(['qemu-img: Could not open \'' + cTarget + '\': Driver \'raw\' does not support image checking']);
      }
      if (cImg.corrupt && P.v.r !== 'leaks') {
        out.push('ERROR: could not read cluster at offset 0x1e000000: Input/output error');
        out.push('ERROR: L1 table is corrupted');
        out.push('');
        out.push('The following errors were found in image \'' + cTarget + '\':');
        out.push('* Leaked clusters: 128');
        out.push('* Corrupted L1 table entry');
        out.push('* Cluster 1245184 refcount 0 expected 1');
        out.push('');
        out.push('128 errors were found on the image.');
        out.push('Data may be corrupted, or further writes to the image may corrupt it.');
        out.push('');
        out.push(note('qemu-img check 只对 qcow2/qed/vhdx/vmdk/vdi 有效，raw 格式会提示不支持。'));
        out.push(note('带损坏的镜像先别急着用 `-r all` 修复：**先把文件备份一份**，修完仍然要重新 check 确认。' +
          '这个镜像是拿来演示救援流程的（见 virt-rescue）。'));
        return { out: out, err: [], code: 2 };
      }
      var clusters = Math.floor(cImg.virtual / (cImg.cluster || 65536));
      var alloc = Math.min(clusters, Math.round(cImg.actual / (cImg.cluster || 65536)));
      out.push('No errors were found on the image.');
      out.push(alloc + '/' + clusters + ' = ' + (clusters ? (alloc * 100 / clusters).toFixed(2) : '0.00') +
        '% allocated, 0.00% fragmented, 0.00% compressed clusters');
      out.push('Image end offset: ' + cImg.actual);
      if (cImg.corrupt && P.v.r === 'leaks') out.push(note('`-r leaks` 只修泄漏的簇；`-r all` 修全部可修项（更激进，先备份）。'));
      return U.ok(out);
    }

    if (sub === 'create') {
      var cFile = positional[0], cSize = positional[1];
      if (!cFile) return U.fail(['qemu-img: Expecting one image file name', "Try 'qemu-img --help' for more information"]);
      if (!cSize) return U.fail(['qemu-img: Expecting image size', "Try 'qemu-img --help' for more information"]);
      var createBytes = parseSize(cSize);
      if (createBytes === null || createBytes <= 0) return U.fail(['qemu-img: Invalid image size: \'' + cSize + '\'']);
      var fmtOpt = P.v.f || guessFmt(cFile);
      var oOpts = parseOptList(P.v.o);
      var backing = P.v.b || null;
      var backingFmt = P.v.F || null;
      if (backing) {
        var bAbsC = U.resolvePath(ctx.cwd, backing);
        if (!U.findNode(ctx.root, bAbsC)) {
          return U.fail(['qemu-img: Could not open backing file \'' + backing + '\': No such file or directory']);
        }
        backing = bAbsC;
      }
      var cAbs = U.resolvePath(ctx.cwd, cFile);
      var existed = !!U.findNode(ctx.root, cAbs);
      /* 真实的 qemu-img create 对 **raw** 用 O_CREAT|O_EXCL：文件已存在就直接失败；
         对 qcow2 则是"截断重建"，不会报错（这是它最危险的地方之一）。
         这里如实复现两种行为，并把风险讲清楚。 */
      var line = 'Formatting \'' + cFile + '\', fmt=' + fmtOpt + ' size=' + createBytes;
      if (fmtOpt === 'qcow2') {
        line += ' cluster_size=' + (oOpts.cluster_size ? parseSize(oOpts.cluster_size) : 65536);
        if (oOpts.preallocation) line += ' preallocation=' + oOpts.preallocation;
        line += ' lazy_refcounts=' + (oOpts.lazy_refcounts || 'off') + ' refcount_bits=' + (oOpts.refcount_bits || '16');
      }
      out.push(line);
      if (existed && fmtOpt === 'raw') {
        return { out: out, err: ['qemu-img: ' + cAbs + ': Could not create file: File exists'], code: 1 };
      }
      if (existed) {
        out.push(note('目标文件已经存在，qemu-img create **不会报错，而是把原有镜像直接重建**（数据全丢）。' +
          '这是官方已知的危险行为（qemu 上游 bug #1901892），生产上动手前一定先 `qemu-img info` 确认，或者先备份。'));
      }
      var allocSize = actualFor(fmtOpt, createBytes, { fresh: true, prealloc: oOpts.preallocation });
      putFile(ctx, cAbs, '<binary:' + fmtOpt + '>', { mode: '600', user: 'qemu', group: 'qemu', size: allocSize });
      st.images[cAbs] = { fmt: fmtOpt, virtual: createBytes, actual: allocSize,
                          cluster: oOpts.cluster_size ? parseSize(oOpts.cluster_size) : 65536,
                          backing: backing || null, backingFmt: backing ? (backingFmt || guessFmt(backing)) : null,
                          prealloc: oOpts.preallocation || null, snapshots: [] };
      if (fmtOpt === 'qcow2' && oOpts.preallocation === 'metadata') {
        out.push(note('preallocation=metadata 只预分配元数据：创建快、后续扩容不用再当场铺元数据，是"省空间"与' +
          '"运行期不抖动"之间最常用的折中。falloc/full 会真的占满空间，性能最稳但创建慢。'));
      }
      if (backing) {
        out.push(note('这是**差分盘**（backing file = ' + backing + '）：只存与基础镜像的差异，批量部署省空间省时间；' +
          '但基础镜像一旦丢失或改动，整条链上的虚机都起不来 —— 用 `qemu-img info --backing-chain` 检查依赖。'));
      }
      return U.ok(out);
    }

    if (sub === 'convert') {
      var srcArg = positional[0], dstArg = positional[1];
      var outFmt = P.v.O;
      if (!srcArg || !dstArg) return U.fail(['qemu-img: Expecting source and destination image filename', "Try 'qemu-img --help' for more information"]);
      if (!outFmt) return U.fail(['qemu-img: Missing required argument \'-O\' for the convert command']);
      var sAbs = U.resolvePath(ctx.cwd, srcArg), dAbs = U.resolvePath(ctx.cwd, dstArg);
      if (!U.findNode(ctx.root, sAbs)) return U.fail(imgErrOpen(srcArg));
      var dNode = U.findNode(ctx.root, dAbs);
      if (dNode && dNode.type === 'dir') return U.fail(imgErrOpen(dstArg, 'Is a directory'));
      var busy = usedBy(st, dAbs);
      if (busy) return U.fail(lockErr(dAbs));
      var sImg = imageOf(ctx, sAbs);
      var compress = !!P.flags.c;
      var newVirtual = sImg.virtual;
      var newActual = convertActual(sImg, outFmt, compress);
      if (P.flags.p) out.push('    (100.00/100%)');
      putFile(ctx, dAbs, '<binary:' + outFmt + '>', { mode: '600', user: 'qemu', group: 'qemu', size: newActual });
      st.images[dAbs] = { fmt: outFmt, virtual: newVirtual, actual: newActual,
                          cluster: outFmt === 'qcow2' ? 65536 : undefined, compressed: compress, snapshots: [] };
      out.push(note('转换是"读源写目标"：源文件 ' + srcArg + ' 没有被修改，' + dstArg + ' 是新写出来的（virtual size ' +
        hSize(newVirtual) + '，实际占用 ' + hSize(newActual) + '）。'));
      if (P.flags.m) out.push(note('-m ' + P.v.m + ' 用 ' + P.v.m + ' 个并发协程：大镜像转换能明显提速（教学环境不做真实 IO，只体现参数）。'));
      if (P.v.S) out.push(note('-S ' + P.v.S + ' 是零块检测粒度：值越大越激进，**可能把有效数据当零块丢掉**，默认即可，不要随意调大。'));
      out.push(note('转换会**拍平差分链、丢掉内部快照**：目标镜像不再依赖任何 backing file，' +
        '这也是回收快照空间、给云平台导入镜像的标准做法。'));
      if (compress) out.push(note('-c 压缩只对 qcow/qcow2/vmdk 有效，压缩后的镜像**不宜再频繁写入**（改写的块会以未压缩形式重写）。'));
      var busySrc = usedBy(st, sAbs);
      if (busySrc) out.push(note('源镜像 ' + sAbs + ' 正被运行中的虚机 ' + busySrc.name + ' 使用：' +
        '读操作虽然能做，但拿到的数据可能不一致。生产上先关机再转换。'));
      return U.ok(out);
    }

    if (sub === 'resize') {
      var rFile = positional[0], rSize = positional[1];
      if (!rFile) return U.fail(['qemu-img: Expecting one image file name', "Try 'qemu-img --help' for more information"]);
      if (!rSize) return U.fail(['qemu-img: Expecting image size', "Try 'qemu-img --help' for more information"]);
      var rAbs = U.resolvePath(ctx.cwd, rFile);
      var rNode = U.findNode(ctx.root, rAbs);
      if (!rNode) return U.fail(imgErrOpen(rFile));
      var rImg = imageOf(ctx, rAbs);
      var delta = parseSize(rSize);
      if (delta === null) return U.fail(['qemu-img: Invalid image size: \'' + rSize + '\'']);
      var byDelta = /^[+-]/.test(String(rSize));
      var newV = byDelta ? rImg.virtual + delta : delta;
      if (newV <= 0) return U.fail(['qemu-img: New size cannot be smaller than 1 byte']);
      var shrink = newV < rImg.virtual;
      if (shrink && P.v.shrink !== true) {
        return U.fail(['qemu-img: Use the --shrink option to perform a shrink operation.']);
      }
      var busyR = usedBy(st, rAbs);
      if (busyR) {
        return U.fail(['qemu-img: Failed to get "write" lock',
                       'Is another process using the image [' + rAbs + ']?',
                       note('镜像正被运行中的虚机 ' + busyR.name + ' 使用（qemu-img resize 是写操作）。' +
                         '先 `virsh shutdown ' + busyR.name + '` 并确认状态为 shut off，再改容量 —— ' +
                         '对运行中的虚机改镜像容量极其危险。')]);
      }
      if (shrink) {
        out.push('WARNING: Shrinking the image will delete all data beyond the shrunken image\'s end.');
        out.push('Before performing such an operation, make sure there is no partition table or important data');
        out.push('located outside the shrunken image\'s new size.');
      }
      var oldV = rImg.virtual;
      rImg.virtual = newV;
      if (newV > oldV) rImg.actual = rImg.actual + Math.round((newV - oldV) * 0.002);
      if (rNode) rNode.explicitSize = rImg.actual;
      /* 镜像挂在哪台虚机上，它对应的磁盘设备就跟着变 —— 否则文档第 ③④ 步
         （growpart / resize2fs / xfs_growfs）会说"分区已经占满整盘"，与示例描述矛盾。
         注意：宿主机终端里的 /dev/vda 是**宿主机自己的**系统盘；文档里第 ③④ 步是在
         虚机内部执行的（虚机里的 vda 才是这个镜像），教学环境把两者对齐好让链路能跑通。 */
      var relinked = [];
      st.domains.forEach(function (d) {
        d.disks.forEach(function (dk) {
          if (dk.src !== rAbs) return;
          var bd = st.block['/dev/' + dk.target];
          if (bd) { bd.bytes = newV; relinked.push('/dev/' + dk.target); }
        });
      });
      out.push('Image resized.');
      out.push(note('注意：resize 只改了**镜像文件的容量**，虚机重启后会发现磁盘变大了，但**分区表和文件系统还是原来的大小** ——' +
        '`df -h` 看不到变化就是这个原因。完整链路是：关机 → qemu-img resize → 开机 → growpart 扩分区 → resize2fs/xfs_growfs 扩文件系统。'));
      if (relinked.length) {
        out.push(note('这个镜像挂给了虚机，教学环境把对应的磁盘设备（' + relinked.join('、') +
          '）的容量一起对齐到 ' + hSize(newV) + '，这样接下来的 `growpart ' + relinked[0] + ' <分区号>` 才会真的报 CHANGED。' +
          '（真机上第 ③④ 步要在**虚机内部**执行，虚机里的 vda 才是这个镜像。）'));
      }
      if (P.v.preallocation) {
        out.push(note('扩容时带 --preallocation=metadata 可以提前把 qcow2 元数据铺好，避免运行期扩容触发写放大与延迟抖动。'));
      }
      return U.ok(out);
    }

    if (sub === 'snapshot') {
      var cName = P.v.c !== undefined ? P.v.c : null;
      var aName = P.v.a !== undefined ? P.v.a : null;
      var dName = P.v.d !== undefined ? P.v.d : null;
      var lList = !!P.flags.l;
      var sTarget = positional[0];
      if (!sTarget) return U.fail(['qemu-img: Expecting one image file name', "Try 'qemu-img --help' for more information"]);
      var snAbs = U.resolvePath(ctx.cwd, sTarget);
      if (!U.findNode(ctx.root, snAbs)) return U.fail(imgErrOpen(sTarget));
      var snImg = imageOf(ctx, snAbs);
      if (!snImg.snapshots) snImg.snapshots = [];
      var writeOp = (cName !== null) || (aName !== null) || (dName !== null);
      if (writeOp) {
        var busyS = usedBy(st, snAbs);
        if (busyS) {
          return U.fail(['qemu-img: Failed to get "write" lock',
                         'Is another process using the image [' + snAbs + ']?',
                         note('虚机 ' + busyS.name + ' 正在使用这个镜像。**qemu-img snapshot 的所有写操作都要求虚机已关闭**：' +
                           '内部快照会修改镜像的元数据表，运行中操作必然损坏数据。先 `virsh shutdown ' + busyS.name + '`。')]);
        }
      }
      if (cName !== null) {
        snImg.snapshots.push({ name: cName, date: NOW_STAMP + ':00', id: snImg.snapshots.length + 1 });
        out.push(note('已在 ' + sTarget + ' 里创建内部快照 ' + cName + '。真机 qemu-img snapshot -c 成功时不输出内容；' +
          '内部快照存在镜像文件自身里，不依赖 libvirt，但**只包含磁盘、不含内存**，恢复后虚机要重启。'));
        return U.ok(out);
      }
      if (lList) {
        out.push('List of snapshots present on all disks:');
        out.push('ID        TAG                     VM SIZE                DATE       VM CLOCK');
        if (!snImg.snapshots.length) {
          out.push(note('这个镜像里没有任何内部快照（qemu-img snapshot -c <名称> <镜像> 可以创建）。'));
        }
        snImg.snapshots.forEach(function (s, i) {
          out.push(U.pad(String(i + 1), 10) + U.pad(s.name, 24) + U.pad('0 B', 23) + U.pad(s.date || (NOW_STAMP + ':00'), 11) + '00:00:00.000');
        });
        return U.ok(out);
      }
      if (aName !== null) {
        var found = false;
        snImg.snapshots.forEach(function (s) { if (s.name === aName) found = true; });
        if (!found) return U.fail(['qemu-img: Could not find snapshot \'' + aName + '\'']);
        out.push(note('已恢复到内部快照 ' + aName + '（真机成功时无输出）。**快照之后写入的数据全部丢失**，' +
          '恢复完要用 `virsh start` 重新启动虚机（内部快照不含内存状态）。'));
        return U.ok(out);
      }
      if (dName !== null) {
        var before = snImg.snapshots.length;
        snImg.snapshots = snImg.snapshots.filter(function (s) { return s.name !== dName; });
        if (snImg.snapshots.length === before) return U.fail(['qemu-img: Could not find snapshot \'' + dName + '\'']);
        out.push(note('已删除内部快照 ' + dName + '（真机成功时无输出）。**删除内部快照不会释放空间** ——' +
          '快照占用的块仍在镜像内部，要真正回收只能 `qemu-img convert` 重写镜像。'));
        return U.ok(out);
      }
      return U.fail(['qemu-img: snapshot: one of -c/-l/-a/-d is required', "Try 'qemu-img --help' for more information"]);
    }

    if (sub === 'commit') {
      var cmFile = positional[0];
      if (!cmFile) return U.fail(['qemu-img: Expecting one image file name', "Try 'qemu-img --help' for more information"]);
      var cmAbs = U.resolvePath(ctx.cwd, cmFile);
      if (!U.findNode(ctx.root, cmAbs)) return U.fail(imgErrOpen(cmFile));
      var cmImg = imageOf(ctx, cmAbs);
      if (!cmImg.backing) return U.fail(['qemu-img: ' + cmFile + ': Image does not have a backing file']);
      var busyC = usedBy(st, cmAbs);
      if (busyC) return U.fail(lockErr(cmAbs));
      var baseAbs = P.v.b ? U.resolvePath(ctx.cwd, P.v.b) : cmImg.backing;
      var baseImg = imageOf(ctx, baseAbs);
      if (baseImg) {
        baseImg.actual = baseImg.actual + cmImg.actual;
        baseImg.virtual = Math.max(baseImg.virtual, cmImg.virtual);
        var baseNode = U.findNode(ctx.root, baseAbs);
        if (baseNode) baseNode.explicitSize = baseImg.actual;
      }
      var del = !!P.flags.d;
      if (del) {
        var cmParent = U.findNode(ctx.root, U.parentOf(cmAbs));
        if (cmParent) delete cmParent.children[baseNameOf(cmAbs)];
        delete st.images[cmAbs];
      } else {
        cmImg.actual = 196608;
        cmImg.snapshots = [];
        var cn = U.findNode(ctx.root, cmAbs);
        if (cn) cn.explicitSize = cmImg.actual;
      }
      out.push(note('已把差分盘 ' + cmFile + ' 的内容合并进基础镜像 ' + baseAbs + '（真机成功时无输出）。'));
      if (del) out.push(note('-d 让 qemu-img 在合并后**删除差分盘文件**本身，链就短了一层。'));
      else out.push(note('没有加 -d：差分盘文件仍然在，只是内容已经进了基础镜像（它现在几乎没有数据）。'));
      out.push(note('commit 常用于"快照链太长拖慢 IO"的收尾：合并前务必确认虚机已关机，并保证基础镜像不再被其它虚机共用。'));
      return U.ok(out);
    }

    if (sub === '--version' || sub === 'version' || sub === '-V') {
      out.push('qemu-img 7.2.0');
      out.push('Copyright (c) 2003-2022 Fabrice Bellard and the QEMU Project developers');
      return U.ok(out);
    }
    if (sub === '--help' || sub === '-h' || !sub) {
      out.push('qemu-img [standard options] command [command options]');
      out.push('    create [-f fmt] [-o options] filename [size]');
      out.push('    check [-f fmt] filename');
      out.push('    info [-f fmt] [--output=ofmt] [--backing-chain] filename');
      out.push('    snapshot [-c|-l|-a|-d] filename');
      out.push('    commit [-f fmt] filename');
      out.push('    convert [-f fmt] [-O output_fmt] [-c] [-p] [-m num] filename [filename2 [...]] output_filename');
      out.push('    resize [--preallocation=prealloc] [--shrink] filename [+|-]size');
      out.push('（教学环境实现了上面这些子命令）');
      return U.ok(out);
    }
    return U.fail(['qemu-img: Unknown command \'' + sub + '\'', "Try 'qemu-img --help' for more information"]);
  }

  /* ======================= 6. virt-install ======================= */

  function macFor(name, idx) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 16777216;
    var hex = ('000000' + h.toString(16)).slice(-6);
    return '52:54:00:' + hex.slice(0, 2) + ':' + hex.slice(2, 4) + ':' + hex.slice(4, 6) + (idx ? '' : '');
  }
  /* 域名 → 稳定的 UUID（同一台虚机每次看到的 UUID 必须一样，否则脚本没法用 UUID 做标识） */
  function uuidFor(name) {
    var all = '';
    for (var k = 0; k < 4; k++) {
      var h = (2166136261 + k * 16777619) >>> 0;
      for (var i = 0; i < name.length; i++) {
        h ^= name.charCodeAt(i) + k * 31;
        h = (h * 16777619) >>> 0;
      }
      all += ('00000000' + h.toString(16)).slice(-8);
    }
    return all.slice(0, 8) + '-' + all.slice(8, 12) + '-' + all.slice(12, 16) + '-' + all.slice(16, 20) + '-' + all.slice(20, 32);
  }
  function virtInstall(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    /* --opt=value 先拆成两个 token，后面按"选项 + 值"顺序读 */
    var toks = [];
    argv.forEach(function (a) {
      var m = /^(--[A-Za-z0-9][A-Za-z0-9-]*)=(.*)$/.exec(String(a));
      if (m) { toks.push(m[1]); toks.push(m[2]); } else toks.push(String(a));
    });
    var o = { name: null, memory: null, vcpus: null, disks: [], nets: [], location: null, cdrom: null,
              imp: false, pxe: false, osinfo: null, cpu: null, graphics: null, console: null,
              noautoconsole: false, dryRun: false, extraArgs: null, noreboot: false, title: null,
              machine: null, unknown: [] };
    var VALUE_FLAGS = { '--name': 'name', '--memory': 'memory', '--vcpus': 'vcpus', '--location': 'location',
                        '--cdrom': 'cdrom', '--osinfo': 'osinfo', '--os-variant': 'osinfo', '--cpu': 'cpu',
                        '--graphics': 'graphics', '--console': 'console', '--extra-args': 'extraArgs',
                        '--title': 'title', '--machine': 'machine', '--boot': 'boot', '--vcpu': 'vcpus',
                        '--ram': 'memory', '--arch': 'arch' };
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === '--disk') { o.disks.push(toks[++i] || ''); continue; }
      if (t === '--network' || t === '--net') { o.nets.push(toks[++i] || ''); continue; }
      if (t === '--import') { o.imp = true; continue; }
      if (t === '--pxe') { o.pxe = true; continue; }
      if (t === '--noautoconsole') { o.noautoconsole = true; continue; }
      if (t === '--dry-run' || t === '-n') { o.dryRun = true; continue; }
      if (t === '--noreboot') { o.noreboot = true; continue; }
      if (t === '--wait') { o.wait = toks[++i]; continue; }
      if (t === '--print-xml') { o.printXml = true; continue; }
      if (VALUE_FLAGS[t]) { o[VALUE_FLAGS[t]] = toks[++i]; continue; }
      if (t.charAt(0) === '-') { o.unknown.push(t); if (toks[i + 1] && toks[i + 1].charAt(0) !== '-') i++; continue; }
      o.unknown.push(t);
    }
    var out = [];
    if (!o.name) return U.fail(['ERROR    --name is required']);
    if (!o.location && !o.cdrom && !o.imp && !o.pxe) {
      return U.fail(['ERROR    An install method must be specified (--cdrom, --location, --import or --pxe)']);
    }
    if (o.unknown.length) {
      return U.fail(['ERROR    Unknown arguments: ' + o.unknown.join(' ')]);
    }
    /* --memory 4096 的默认单位是 **MiB**（不是字节）；写成 --memory 4GiB / 4G 才按容量解析。
       virt-install 还支持 --memory 4096,hotplug=on 这种"容量,选项"写法，逗号前才是容量。 */
    var memSpec = String(o.memory || '1024').split(',')[0].trim();
    var memMiB = /[A-Za-z]/.test(memSpec) ? Math.round((parseSize(memSpec) || 0) / M) : parseInt(memSpec, 10);
    if (!memMiB || memMiB <= 0) return U.fail(['ERROR    Invalid memory size: ' + o.memory]);
    var vcpus = o.vcpus ? parseInt(o.vcpus, 10) : 1;
    if (!vcpus || vcpus < 1) return U.fail(['ERROR    Invalid vcpus value: ' + o.vcpus]);
    if (!o.osinfo) {
      out.push('WARNING  No --osinfo specified, using the default \'generic\' profile.');
      out.push('         （不指定 osinfo 会退化到很差的默认配置：virtio 优化、推荐的机型与磁盘总线都拿不到，' +
        '生产上一定要写 --osinfo rocky9 这类值。）');
    }
    /* 磁盘 */
    var disks = [], created = [];
    o.disks.forEach(function (spec) {
      var kv = parseOptList(spec);
      var path = kv.path || null, size = kv.size ? parseSize(kv.size + 'G') : null;
      var dev = kv.device || 'disk', bus = kv.bus || (dev === 'cdrom' ? 'sata' : 'virtio');
      var fmt = kv.format || (dev === 'cdrom' ? 'raw' : 'qcow2');
      if (!path) {
        path = '/var/lib/libvirt/images/' + o.name + (disks.filter(function (d) { return d.dev === 'disk'; }).length ? '-' + disks.length : '') + '.img';
        fmt = kv.format || 'raw';
        if (!size) size = 10 * G;
      } else {
        path = U.resolvePath(ctx.cwd, path);
      }
      var node = U.findNode(ctx.root, path);
      if (!node && dev === 'cdrom') {
        return void out.push('ERROR    Disk path ' + path + ' does not exist');
      }
      if (!node && !size) {
        throw { virtError: 'ERROR    The disk path ' + path + ' does not exist. ' +
          'Specify size=<GiB> to create it, or provide an existing image.' };
      }
      if (!node && size) { created.push({ path: path, size: size, fmt: fmt }); }
      var target = (bus === 'virtio' ? 'vd' : 'sd') + String.fromCharCode(97 + disks.filter(function (d) { return (d.bus === 'virtio' ? 'vd' : 'sd') === (bus === 'virtio' ? 'vd' : 'sd'); }).length);
      disks.push({ target: target, bus: bus, dev: dev, type: 'file', src: path, fmt: fmt });
    });
    /* 网卡 */
    var ifaces = [];
    o.nets.forEach(function (spec, idx) {
      var kv = parseOptList(spec);
      var type = kv.bridge ? 'bridge' : 'network';
      ifaces.push({ iface: 'vnet' + idx, type: type, src: kv.bridge || kv.network || 'default',
                    model: kv.model || 'virtio', mac: macFor(o.name + idx, 0) });
    });
    var nd = { name: o.name, id: null, state: 'running', stateReason: 'booted',
               title: o.title || (o.osinfo ? 'virt-install: ' + o.osinfo : 'virt-install 安装的虚机'),
               uuid: uuidFor(o.name),
               os: 'hvm', arch: 'x86_64', machine: o.machine || 'pc-i440fx-rhel7.6.0',
               ostype: o.osinfo || 'generic', vcpus: vcpus, maxvcpus: vcpus,
               memory: memMiB * K, curmem: memMiB * K, autostart: false, cpuTime: 0, persistent: true,
               disks: disks, ifaces: ifaces, snapshots: [] };
    if (o.dryRun || o.printXml) {
      out.push('（--dry-run 演练模式：不创建磁盘、不定义虚机，下面是将要生成的 domain XML）');
      out.push('');
      domainXml(nd, {}).forEach(function (l) { out.push(l); });
      out.push('');
      out.push(note('--dry-run 是学习与验证参数的好帮手：把参数换成 XML 看一眼，确认磁盘总线、网卡型号、' +
        'CPU 模式是不是自己想要的，再真正执行。'));
      return U.ok(out);
    }
    /* 建盘（size= 且文件不存在时才创建） */
    created.forEach(function (c) {
      var alloc = actualFor(c.fmt, c.size, { fresh: true });
      putFile(ctx, c.path, '<binary:' + c.fmt + '>', { mode: '600', user: 'qemu', group: 'qemu', size: alloc });
      st.images[c.path] = { fmt: c.fmt, virtual: c.size, actual: alloc, cluster: c.fmt === 'qcow2' ? 65536 : undefined, snapshots: [] };
    });
    var exist = findDomain(st, o.name);
    if (exist) {
      out.push('WARNING  Domain \'' + o.name + '\' already exists; updating its definition instead of failing.');
      out.push('         （真机 virt-install 此时会报 "ERROR    Guest name \'' + o.name + '\' is already in use." ——' +
        '教学环境按"更新定义"继续，好让文档里的示例能连贯地跑完。）');
      nd.id = exist.id; nd.state = exist.state; nd.autostart = exist.autostart;
      nd.cpuTime = exist.cpuTime; nd.snapshots = exist.snapshots;
      st.domains[st.domains.indexOf(exist)] = nd;
    } else {
      nd.id = nextDomainId(st);
      st.domains.push(nd);
    }
    if (o.noreboot) { nd.state = 'shut off'; nd.id = null; }
    out.push('Starting install...');
    created.forEach(function (c) {
      out.push('Allocating \'' + baseNameOf(c.path) + '\'' + new Array(Math.max(1, 40 - baseNameOf(c.path).length)).join(' ') +
        '|  ' + hSize(c.size) + '  00:00:00');
    });
    out.push('Creating domain...' + new Array(36).join(' ') + '|    0 B  00:00:00');
    out.push('Domain creation completed.');
    if (!o.noautoconsole) out.push('Running text console command: virsh --connect qemu:///system console ' + o.name);
    out.push(note('教学环境已按参数**创建磁盘并写入虚机定义**（`virsh dominfo ' + o.name + '` / `virsh dumpxml ' + o.name +
      '` / `virsh list --all` 都能看到它）。真实的安装过程需要 KVM 与安装源，无法在浏览器里模拟 ——' +
      (o.imp ? '这是 --import：真机上会用已有的 cloud 镜像磁盘直接引导，配合 cloud-init 完成首次配置。'
             : '真机上这会儿虚机正在引导安装程序' + (o.cdrom ? '（--cdrom ' + o.cdrom + '）' : '') +
               (o.location ? '（--location ' + o.location + '）' : '') + '。')));
    if (o.extraArgs) out.push(note('--extra-args "' + o.extraArgs + '" 只在 --location 安装树场景有效：' +
      '内核参数/kickstart 地址通过它传给安装程序，HTTP 安装树 + ks= 是无人值守安装的标准组合。'));
    return U.ok(out);
  }

  /* ======================= 7. virt-customize ======================= */

  function virtCustomize(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    var toks = [];
    argv.forEach(function (a) {
      var m = /^(--[A-Za-z0-9][A-Za-z0-9-]*)=(.*)$/.exec(String(a));
      if (m) { toks.push(m[1]); toks.push(m[2]); } else toks.push(String(a));
    });
    var images = [], hostname = null, timezone = null, installs = [], runCmds = [], firstboot = [],
        sshInject = [], rootPw = null, copyIn = [], uploads = [], dryRun = false, mkdirs = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === '-a' || t === '--add') images.push(toks[++i]);
      else if (t === '-d' || t === '--domain') images.push(toks[++i]);
      else if (t === '--hostname') hostname = toks[++i];
      else if (t === '--timezone') timezone = toks[++i];
      else if (t === '--install') installs.push(toks[++i]);
      else if (t === '--run-command') runCmds.push(toks[++i]);
      else if (t === '--firstboot-command') firstboot.push(toks[++i]);
      else if (t === '--ssh-inject') sshInject.push(toks[++i]);
      else if (t === '--root-password') rootPw = toks[++i];
      else if (t === '--password-crypto') rootPw = (rootPw || '') + '\u0000' + toks[++i];
      else if (t === '--copy-in') copyIn.push(toks[++i]);
      else if (t === '--upload') uploads.push(toks[++i]);
      else if (t === '--mkdir') mkdirs.push(toks[++i]);
      else if (t === '-n' || t === '--dry-run') dryRun = true;
      else if (t === '--no-selinux-relabel') { /* 已默认按真实行为处理 */ }
      else if (t.charAt(0) === '-') { return U.fail(['virt-customize: error: unrecognized option \'' + t + '\'']); }
    }
    if (!images.length) return U.fail(['virt-customize: error: you must specify a guest with -a or -d']);
    var imgArg = images[0];
    var abs = U.resolvePath(ctx.cwd, imgArg);
    var node = U.findNode(ctx.root, abs);
    if (!node) return U.fail(['libguestfs: error: ' + imgArg + ': No such file or directory']);
    var img = imageOf(ctx, abs);
    var g = guestOf(st, abs);
    var out = [];
    out.push('[   0.0] Examining the guest ...');
    /* --ssh-inject user:file:/path 的公钥文件必须在宿主机上真实存在 */
    var keyLine = null;
    for (var s = 0; s < sshInject.length; s++) {
      var spec = String(sshInject[s]);
      var fm = /:file:(.+)$/.exec(spec);
      if (fm) {
        var keyPath = fm[1];
        var kr = U.readFileOrErr(ctx, keyPath);
        if (kr.err) return U.fail(['libguestfs: error: ' + keyPath + ': No such file or directory']);
        keyLine = U.splitLines(kr.content)[0];
      } else if (spec.indexOf('ssh-ed25519 ') === 0 || spec.indexOf('ssh-rsa ') === 0) {
        keyLine = spec;
      }
    }
    if (copyIn.length) {
      copyIn.forEach(function (spec) {
        var parts = String(spec).split(':');
        var srcp = parts[0];
        if (!U.findNode(ctx.root, U.resolvePath(ctx.cwd, srcp))) {
          return void out.push('libguestfs: error: ' + srcp + ': No such file or directory');
        }
      });
      if (out.join('\n').indexOf('libguestfs: error') !== -1) return { out: [], err: out.filter(function (l) { return l.indexOf('libguestfs: error') === 0; }), code: 1 };
    }
    var step = 1.0;
    out.push('[   ' + step.toFixed(1) + '] Setting a random seed');
    if (hostname) {
      step += 1.2;
      out.push('[   ' + step.toFixed(1) + '] Setting the hostname: ' + hostname);
      g.files['/etc/hostname'] = hostname + '\n';
      g.hostname = hostname;
    }
    if (timezone) {
      step += 0.2;
      out.push('[   ' + step.toFixed(1) + '] Setting the timezone: ' + timezone);
      g.files['/etc/timezone'] = timezone + '\n';
    }
    if (installs.length) {
      step += 1.2;
      out.push('[   ' + step.toFixed(1) + '] Installing packages: ' + installs.join(' '));
      img.actual += 180 * M * installs.length;
    }
    if (keyLine) {
      step += 0.3;
      var user = String(sshInject[0]).split(':')[0] || 'root';
      var akPath = (user === 'root' ? '/root' : '/home/' + user) + '/.ssh/authorized_keys';
      g.files[akPath] = (g.files[akPath] || '') + keyLine + '\n';
      out.push('[   ' + step.toFixed(1) + '] Injecting SSH key into ' + user);
    }
    if (rootPw) {
      step += 0.4;
      out.push('[   ' + step.toFixed(1) + '] Setting root password (crypto: ' +
        (rootPw.indexOf('\u0000') !== -1 ? rootPw.split('\u0000')[1] : 'default') + ')');
      g.files['/etc/shadow'] = 'root:$6$' + 'aBcDeFgHiJkLmNoP' + '$' + 'xYz0123456789abcdefghijklmnopqrstuvwxyzABCDEF:19760:0:99999:7:::\n';
    }
    copyIn.forEach(function (spec) {
      step += 0.5;
      var parts = String(spec).split(':');
      out.push('[   ' + step.toFixed(1) + '] Copying ' + parts[0] + ' to ' + (parts[1] || '/'));
      var srcAbs = U.resolvePath(ctx.cwd, parts[0]);
      var sNode = U.findNode(ctx.root, srcAbs);
      if (sNode && sNode.type === 'file') {
        g.files[(parts[1] || '/') + '/' + baseNameOf(srcAbs)] = String(sNode.content || '');
        img.actual += String(sNode.content || '').length;
      }
    });
    uploads.forEach(function (spec) {
      step += 0.3;
      out.push('[   ' + step.toFixed(1) + '] Uploading ' + spec);
    });
    runCmds.forEach(function (c) {
      step += 0.6;
      out.push('[   ' + step.toFixed(1) + '] Running: ' + c);
    });
    firstboot.forEach(function (c) {
      step += 0.2;
      out.push('[   ' + step.toFixed(1) + '] Adding firstboot command: ' + c);
      g.files['/var/lib/cloud/scripts/per-boot/99-firstboot.sh'] = '#!/bin/bash\n' + c + '\n';
    });
    step += 0.5;
    out.push('[   ' + step.toFixed(1) + '] Finishing off');
    var imgNode = U.findNode(ctx.root, abs);
    if (imgNode) imgNode.explicitSize = img.actual;
    if (dryRun) {
      out.push(note('这是 -n/--dry-run 演练：上面的步骤只做参数校验与打印，**镜像没有被改动**。'));
      img.actual -= (installs.length * 180 * M);
      if (imgNode) imgNode.explicitSize = img.actual;
      return U.ok(out);
    }
    out.push(note('virt-customize 是**原地（in place）修改**镜像的：所以生产上先 cp 一份再改（文档示例就是这么做的）。'));
    out.push(note('--run-command 是在 libguestfs 的临时小虚拟机里执行的（网络受限、硬件与真实环境不同）；' +
      '需要真实硬件环境的操作应该用 --firstboot-command，它在虚机第一次启动时才跑。'));
    var busyV = usedBy(st, abs);
    if (busyV) out.push(note('警告：这个镜像正被运行中的虚机 ' + busyV.name + ' 使用 —— 真机上这样改会破坏正在运行的系统，先关机。'));
    return U.ok(out);
  }

  /* ======================= 8. libguestfs 工具箱 ======================= */

  /* 解析 -a/--add、-i/--inspector、-m/--mount、--ro/--rw 等公共参数 */
  function guestArgs(argv) {
    var toks = [], i;
    for (i = 0; i < argv.length; i++) {
      var m = /^(--[A-Za-z0-9][A-Za-z0-9-]*)=(.*)$/.exec(String(argv[i]));
      if (m) { toks.push(m[1]); toks.push(m[2]); } else toks.push(String(argv[i]));
    }
    var g = { images: [], inspect: false, ro: false, rw: false, mounts: [], rest: [], human: false,
              all: false, long: false, csv: false };
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === '-a' || t === '--add') g.images.push(toks[++i]);
      else if (t === '-d' || t === '--domain') g.images.push(toks[++i]);
      else if (t === '-i' || t === '--inspector') g.inspect = true;
      else if (t === '-m' || t === '--mount') g.mounts.push(toks[++i]);
      else if (t === '--ro') g.ro = true;
      else if (t === '--rw') g.rw = true;
      else if (t === '-h' || t === '--human-readable') g.human = true;
      else if (t === '--all') g.all = true;
      else if (t === '--long') g.long = true;
      else if (t === '--csv') g.csv = true;
      else if (t === '--filesystems' || t === '--partitions' || t === '--lvs' || t === '--pvs' ||
               t === '--vgs' || t === '--blkid' || t === '--extra' || t === '--uuid' || t === '--no-title') { /* 过滤器：教学环境统一输出 */ }
      else g.rest.push(t);
    }
    return g;
  }
  function needImage(g, ctx, tool) {
    if (!g.images.length) return { err: [tool + ': error: you must specify a guest with -a or -d'] };
    var arg = g.images[0];
    var abs = U.resolvePath(ctx.cwd, arg);
    var node = U.findNode(ctx.root, abs);
    if (!node) return { err: ['libguestfs: error: ' + arg + ': No such file or directory'] };
    return { abs: abs, arg: arg, img: imageOf(ctx, abs), st: S(ctx) };
  }
  /* guestfish 的一键式命令 */
  function guestfish(argv, ctx, stdin, HOST) {
    var g = guestArgs(argv);
    var r = needImage(g, ctx, 'guestfish');
    if (r.err) return U.fail(r.err);
    var gfs = guestOf(r.st, r.abs);
    var out = [];
    if (!g.rest.length) {
      out.push(note('guestfish 进入的是**只读交互模式**（--ro -a <镜像> -i），提示符是 "><fs>"，' +
        '可用命令：ls / ll / cat / download / upload / rm / stat / find / exit。'));
      out.push(note('本模拟终端是单行的，无法模拟交互式会话；请用一键式写法：' +
        '`guestfish --ro -a ' + r.arg + ' -i cat /etc/hostname`。'));
      out.push(note('只读模式是救援与取证的默认姿势：能避免误改证据、改坏镜像。'));
      return U.ok(out);
    }
    if (!g.inspect && !g.mounts.length) {
      return U.fail(['guestfish: error: you must mount a filesystem first (use -i to inspect and mount all filesystems)']);
    }
    var cmd = g.rest[0], cArgs = g.rest.slice(1);
    function guestPath(p) {
      var q = String(p || '/');
      if (q !== '/' && q.charAt(q.length - 1) === '/') q = q.slice(0, -1);
      return q;
    }
    if (cmd === 'cat' || cmd === 'head' || cmd === 'tail') {
      if (!cArgs.length) return U.fail(['guestfish: error: ' + cmd + ': missing file name']);
      var target = guestPath(cArgs[0]);
      var content = gfs.files[target];
      if (content === undefined) return U.fail(['libguestfs: error: ' + target + ': No such file or directory']);
      var lines = U.splitLines(content);
      if (cmd === 'head') lines = lines.slice(0, 10);
      else if (cmd === 'tail') lines = lines.slice(-10);
      return U.ok(lines);
    }
    if (cmd === 'ls' || cmd === 'll') {
      var dir = guestPath(cArgs[0] || '/');
      var names = Object.keys(gfs.files).filter(function (p) {
        if (p === dir) return false;
        var rel = dir === '/' ? p.slice(1) : (p.indexOf(dir + '/') === 0 ? p.slice(dir.length + 1) : null);
        return rel !== null && rel.indexOf('/') === -1;
      }).sort();
      if (!names.length && dir !== '/') return U.fail(['libguestfs: error: ' + dir + ': No such file or directory']);
      names.forEach(function (n) {
        var full = (dir === '/' ? '' : dir) + '/' + n;
        if (cmd === 'll') out.push('-rw-r--r-- 1 root root ' + U.padLeft(String(String(gfs.files[full] || '').length), 8) + ' ' + n);
        else out.push(n);
      });
      return U.ok(out);
    }
    if (cmd === 'find') {
      var fdir = guestPath(cArgs[0] || '/');
      Object.keys(gfs.files).sort().forEach(function (p) {
        if (fdir === '/' || p.indexOf(fdir + '/') === 0 || p === fdir) out.push(p);
      });
      return U.ok(out);
    }
    if (cmd === 'stat' || cmd === 'statns') {
      var stPath = guestPath(cArgs[0]);
      if (gfs.files[stPath] === undefined) return U.fail(['libguestfs: error: ' + stPath + ': No such file or directory']);
      out.push('  File: ' + stPath);
      out.push('  Size: ' + String(gfs.files[stPath]).length);
      return U.ok(out);
    }
    if (cmd === 'exists' || cmd === 'is-file' || cmd === 'is-dir') {
      var ePath = guestPath(cArgs[0]);
      var yes = cmd === 'is-dir' ? false : (gfs.files[ePath] !== undefined);
      out.push(yes ? 'true' : 'false');
      return U.ok(out);
    }
    if (cmd === 'download') {
      var dSrc = guestPath(cArgs[0]), dDst = cArgs[1];
      if (gfs.files[dSrc] === undefined) return U.fail(['libguestfs: error: ' + dSrc + ': No such file or directory']);
      putFile(ctx, U.resolvePath(ctx.cwd, dDst), gfs.files[dSrc]);
      out.push(note('已把镜像内的 ' + dSrc + ' 下载到 ' + dDst + '（guestfish download）。'));
      return U.ok(out);
    }
    if (cmd === 'filesystems') {
      gfs.parts.forEach(function (p) { out.push(p.dev + ': ' + p.vfs); });
      return U.ok(out);
    }
    return U.fail(['guestfish: error: unknown command: \'' + cmd + '\'']);
  }

  function virtFilesystems(argv, ctx, stdin, HOST) {
    var g = guestArgs(argv);
    var r = needImage(g, ctx, 'virt-filesystems');
    if (r.err) return U.fail(r.err);
    var gfs = guestOf(r.st, r.abs);
    var out = [];
    var rows = [];
    if (g.all) {
      var diskDev = (gfs.parts[0].dev || '/dev/sda1').replace(/\d+$/, '');
      rows.push({ name: diskDev, type: 'device', vfs: '-', label: '-', mbr: '-', size: r.img.virtual, parent: '-' });
    }
    gfs.parts.forEach(function (p) {
      if (g.all) {
        rows.push({ name: p.dev, type: 'partition', vfs: '-', label: '-', mbr: '-', size: p.size, parent: (gfs.parts[0].dev || '/dev/sda1').replace(/\d+$/, '') });
      }
      rows.push({ name: p.dev, type: 'filesystem', vfs: p.vfs, label: p.label || '-', mbr: '-', size: p.size, parent: '-' });
    });
    function sz(b) { return g.human ? hSize(b) : String(Math.round(b / 1024)) + 'K'; }
    if (g.long) {
      var cols = ['Name', 'Type', 'VFS', 'Label', 'MBR', 'Size', 'Parent'];
      var w = [0, 0, 0, 0, 0, 0, 0];
      var all = [cols].concat(rows.map(function (x) { return [x.name, x.type, x.vfs, x.label, x.mbr, sz(x.size), x.parent]; }));
      all.forEach(function (row) { row.forEach(function (c, i) { if (String(c).length > w[i]) w[i] = String(c).length; }); });
      all.forEach(function (row) {
        out.push(row.map(function (c, i) { return U.pad(String(c), w[i] + 2); }).join('').replace(/\s+$/, ''));
      });
    } else {
      rows.forEach(function (x) { if (x.type === 'filesystem') out.push(x.name); });
    }
    return U.ok(out);
  }

  function virtDf(argv, ctx, stdin, HOST) {
    var g = guestArgs(argv);
    var r = needImage(g, ctx, 'virt-df');
    if (r.err) return U.fail(r.err);
    var gfs = guestOf(r.st, r.abs);
    var out = [];
    out.push('Filesystem                               1K-blocks       Used  Available  Use%');
    gfs.parts.forEach(function (p) {
      var blocks = Math.round(p.size / 1024), used = Math.round(p.used / 1024);
      var avail = Math.max(0, blocks - used);
      var pct = blocks ? Math.round(used * 100 / blocks) : 0;
      var label = r.arg + ':' + p.dev;
      out.push(U.pad(label, 42) + U.padLeft(String(blocks), 10) + U.padLeft(String(used), 11) +
        U.padLeft(String(avail), 11) + U.padLeft(pct + '%', 6));
    });
    out.push(note('virt-df 是排查"镜像磁盘将满"的首选：它直接读镜像里的文件系统，不需要启动虚机。'));
    return U.ok(out);
  }

  function virtCopyOut(argv, ctx, stdin, HOST) {
    var g = guestArgs(argv);
    var r = needImage(g, ctx, 'virt-copy-out');
    if (r.err) return U.fail(r.err);
    if (g.rest.length < 2) return U.fail(['virt-copy-out: error: you must specify <remote path> [<remote path> ...] <local dir>']);
    var gfs = guestOf(r.st, r.abs);
    var dest = g.rest[g.rest.length - 1];
    var srcs = g.rest.slice(0, -1);
    var destAbs = U.resolvePath(ctx.cwd, dest);
    var destNode = U.findNode(ctx.root, destAbs);
    if (!destNode) return U.fail(['libguestfs: error: ' + dest + ': No such file or directory']);
    if (destNode.type !== 'dir') return U.fail(['libguestfs: error: ' + dest + ': Not a directory']);
    var copied = [];
    for (var i = 0; i < srcs.length; i++) {
      var p = String(srcs[i]);
      if (gfs.files[p] === undefined) {
        return U.fail(['libguestfs: error: ' + p + ': No such file or directory']);
      }
      putFile(ctx, destAbs + '/' + baseNameOf(p), gfs.files[p]);
      copied.push(baseNameOf(p));
    }
    return U.ok([note('已把镜像 ' + r.arg + ' 里的 ' + copied.join('、') + ' 拷到 ' + dest +
      '（真机 virt-copy-out 成功时不输出内容）。拷出来的日志可以直接用 tail/grep 分析。')]);
  }

  function virtRescue(argv, ctx, stdin, HOST) {
    var g = guestArgs(argv);
    var r = needImage(g, ctx, 'virt-rescue');
    if (r.err) return U.fail(r.err);
    var gfs = guestOf(r.st, r.abs);
    var out = [];
    out.push(note('virt-rescue 会启动一个临时救援环境（提示符 "><rescue>"），这是一个**交互式 shell**，' +
      '单行终端无法模拟。真机用法：进去后手工挂载文件系统（mount /dev/sda2 /sysroot）→ 改 /etc/fstab、' +
      '重装 GRUB、重置密码 → `exit` 退出。'));
    out.push('这个镜像里能看到的文件系统（对照 mount 用）：');
    gfs.parts.forEach(function (p) {
      out.push('  ' + U.pad(p.dev, 12) + U.pad(p.vfs, 7) + U.pad(hSize(p.size), 8) + '挂载点 ' + p.mount);
    });
    if (r.img.corrupt) {
      out.push(note('这个镜像的一致性有问题（`qemu-img check ' + r.arg + '` 会报 Leaked clusters / L1 table corrupted）。' +
        '救援的正确顺序是：先 `qemu-img check -r all` 尝试修复并**保留原始文件备份**，修不好再用 ' +
        'virt-rescue 进去抢救数据、把文件 virt-copy-out 出来。'));
    } else {
      out.push(note('典型场景：虚机起不来要改 /etc/fstab；忘记密码要清空 /etc/shadow；从坏镜像里抢救数据。'));
    }
    return U.ok(out);
  }

  function virtCat(argv, ctx, stdin, HOST) {
    var g = guestArgs(argv);
    var r = needImage(g, ctx, 'virt-cat');
    if (r.err) return U.fail(r.err);
    if (!g.rest.length) return U.fail(['virt-cat: error: you must specify a file name']);
    var gfs = guestOf(r.st, r.abs);
    var p = String(g.rest[0]);
    if (gfs.files[p] === undefined) return U.fail(['libguestfs: error: ' + p + ': No such file or directory']);
    return U.ok(U.splitLines(gfs.files[p]));
  }

  function virtLs(argv, ctx, stdin, HOST) {
    var g = guestArgs(argv);
    var r = needImage(g, ctx, 'virt-ls');
    if (r.err) return U.fail(r.err);
    var gfs = guestOf(r.st, r.abs);
    var recursive = hasShort(argv, 'R') || hasShort(argv, 'l');
    var dir = g.rest.length ? String(g.rest[0]) : '/';
    if (dir !== '/' && dir.charAt(dir.length - 1) === '/') dir = dir.slice(0, -1);
    var out = [];
    Object.keys(gfs.files).sort().forEach(function (p) {
      var rel = dir === '/' ? p.slice(1) : (p.indexOf(dir + '/') === 0 ? p.slice(dir.length + 1) : null);
      if (rel === null || rel === '') return;
      if (!recursive && rel.indexOf('/') !== -1) return;
      out.push(recursive ? p : rel);
    });
    if (!out.length) return U.fail(['libguestfs: error: ' + dir + ': No such file or directory']);
    return U.ok(out);
  }

  /* ======================= 9. vagrant ======================= */

  function findVagrantfile(ctx) {
    var dir = ctx.cwd;
    for (var i = 0; i < 12; i++) {
      var abs = (dir === '/' ? '' : dir) + '/Vagrantfile';
      var node = U.findNode(ctx.root, abs);
      if (node && node.type === 'file') return { abs: abs, node: node };
      if (dir === '/') break;
      dir = U.parentOf(dir);
    }
    return null;
  }
  function vagrant(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    if (!st.vagrant) st.vagrant = { created: false, state: 'not created', provider: 'virtualbox', snapshots: [] };
    var vg = st.vagrant;
    var provider = 'virtualbox';
    var sub = null, subArg = null, rest2 = [];
    for (var i = 0; i < argv.length; i++) {
      var t = String(argv[i]);
      if (t.indexOf('--provider=') === 0) { provider = t.slice(11); continue; }
      if (t === '--provider') { provider = String(argv[++i]); continue; }
      if (t === '-f' || t === '--force') { rest2.push('-f'); continue; }
      if (t.charAt(0) === '-') continue;
      if (sub === null) sub = t;
      else if (subArg === null && sub !== 'snapshot') subArg = t;
      else if (sub === 'snapshot' && subArg === null) subArg = t;
      else rest2.push(t);
    }
    if (!sub) sub = 'status';
    var vf = findVagrantfile(ctx);
    if (!vf) {
      return U.fail([
        'A Vagrant environment or target machine is required to run this',
        'command. Run `vagrant init` to create a new Vagrant environment. Or,',
        'get an ID of a target machine from `vagrant global-status` to run',
        'this command on. A final option is to change to a directory that has',
        'a Vagrantfile and try again.'
      ]);
    }
    var out = [];
    vg.provider = provider;
    var pName = provider === 'libvirt' ? 'libvirt' : (provider === 'vmware_desktop' ? 'vmware_desktop' : 'virtualbox');
    if (sub === 'status') {
      out.push('Current machine states:');
      out.push('');
      out.push(U.pad('default', 26) + (vg.created ? vg.state + ' (' + pName + ')' : 'not created (' + pName + ')'));
      out.push('');
      if (!vg.created) out.push('The environment has not been created. Run `vagrant up` to create the environment.');
      else if (vg.state === 'running') out.push('The VM is running. To stop this machine, you can run `vagrant halt`.');
      else if (vg.state === 'saved') out.push('The VM is currently saved. To resume this machine, you can run `vagrant up`.');
      else out.push('The VM is powered off. To restart it, run `vagrant up`.');
      return U.ok(out);
    }
    if (sub === 'up') {
      if (!vg.created) {
        out.push('Bringing machine \'default\' up with \'' + pName + '\' provider...');
        out.push('==> default: Importing base box \'generic/rocky9\'...');
        out.push('==> default: Matching MAC address for NAT networking...');
        out.push('==> default: Setting the name of the VM: vagrant_default_1710000000');
        out.push('==> default: Clearing any previously set network interfaces...');
        out.push('==> default: Preparing network interfaces based on configuration...');
        out.push('==> default: Forwarding ports...');
        out.push('    default: 22 (guest) => 2222 (host) (adapter 1)');
        out.push('==> default: Booting VM...');
        out.push('==> default: Waiting for machine to boot. This may take a few minutes...');
        out.push('    default: SSH address: 127.0.0.1:2222');
        out.push('    default: SSH username: vagrant');
        out.push('    default: SSH auth method: private key');
        out.push('==> default: Machine booted and ready!');
        if (provider === 'libvirt') {
          out.push('==> default: Using libvirt provider: 虚机由 KVM 承载，性能比 VirtualBox 好，且与生产虚拟化技术一致。');
        }
        vg.created = true;
      } else if (vg.state === 'running') {
        out.push('==> default: Machine already running!');
      } else if (vg.state === 'saved') {
        out.push('==> default: Resuming suspended VM...');
        vg.state = 'running';
      } else {
        out.push('==> default: Starting domain...');
        vg.state = 'running';
      }
      vg.state = 'running';
      out.push(note('教学环境没有真正的 VirtualBox/KVM 后端：这里只模拟 Vagrant 的机器状态机与输出。' +
        '真机上 `vagrant up` 会下载 box（国内很慢，常配国内镜像源或用本地 box 文件）并执行 provision 脚本。'));
      out.push(note('当前 Vagrantfile：' + vf.abs + '（用 `cat ' + vf.abs + '` 看它的 box、内存与网络配置）'));
      return U.ok(out);
    }
    if (sub === 'halt') {
      if (!vg.created) return U.fail(['The machine is not created. Run `vagrant up` first.']);
      out.push('==> default: Attempting graceful shutdown of VM...');
      vg.state = 'poweroff';
      out.push(note('`vagrant halt` 是优雅关机（等价于在虚机里执行 shutdown），数据安全；' +
        '要强制下电用 `vagrant destroy`（它同时会删除虚机与磁盘）。'));
      return U.ok(out);
    }
    if (sub === 'destroy') {
      if (!vg.created) return U.fail(['The machine is not created. Run `vagrant up` first.']);
      var force = rest2.indexOf('-f') !== -1;
      if (!force) {
        out.push('==> default: Are you sure you want to destroy the \'default\' VM? [y/N] ');
        out.push(note('没有加 -f：真机会停下来等你输入 y 确认（交互式提问无法在单行终端模拟）。' +
          '**destroy 会删除虚机与磁盘，数据全部丢失**，脚本里加 -f 跳过确认。'));
        return U.ok(out);
      }
      out.push('==> default: Forcing shutdown of VM...');
      out.push('==> default: Destroying VM and associated drives...');
      vg.created = false;
      vg.state = 'not created';
      vg.snapshots = [];
      return U.ok(out);
    }
    if (sub === 'reload') {
      if (!vg.created) return U.fail(['The machine is not created. Run `vagrant up` first.']);
      out.push('==> default: Attempting graceful shutdown of VM...');
      out.push('==> default: Checking if box \'generic/rocky9\' version is up to date...');
      out.push('==> default: Clearing any previously set forwarded ports...');
      out.push('==> default: Booting VM...');
      out.push('==> default: Machine booted and ready!');
      vg.state = 'running';
      return U.ok(out);
    }
    if (sub === 'provision') {
      if (!vg.created) return U.fail(['The machine is not created. Run `vagrant up` first.']);
      out.push('==> default: Running provisioner: shell...');
      out.push('    default: Running: inline script');
      out.push(note('provision 只重跑配置脚本（不重建虚机），改完 provision 后比 destroy + up 快得多。'));
      return U.ok(out);
    }
    if (sub === 'ssh') {
      if (!vg.created) return U.fail(['The machine is not created. Run `vagrant up` first.']);
      if (vg.state !== 'running') return U.fail(['The machine is not running. Run `vagrant up` first.']);
      out.push(note('`vagrant ssh` 会打开一个交互式 SSH 会话（免密钥、不用记 IP），单行终端无法模拟。'));
      out.push(note('真机上它等价于：ssh -p 2222 -i .vagrant/machines/default/'
        + pName + '/private_key vagrant@127.0.0.1'));
      return U.ok(out);
    }
    if (sub === 'snapshot') {
      if (!vg.created) return U.fail(['The machine is not created. Run `vagrant up` first.']);
      if (subArg === 'save') {
        var sname = rest2[0] || ('snap' + (vg.snapshots.length + 1));
        if (vg.state !== 'running') return U.fail(['The machine must be running to save a snapshot of it.']);
        vg.snapshots.push(sname);
        out.push('==> default: Saving snapshot \'' + sname + '\'...');
        out.push('==> default: Snapshot saved! You can restore the snapshot at any time by');
        out.push('==> default: using `vagrant snapshot restore`. You can delete it using');
        out.push('==> default: `vagrant snapshot delete`.');
        out.push(note('做危险实验前先 `vagrant snapshot save` 是最实用的习惯：恢复比重新 up 快得多。'));
        return U.ok(out);
      }
      if (subArg === 'restore') {
        if (!vg.snapshots.length) return U.fail(['No snapshots have been created. Create one with `vagrant snapshot save`.']);
        var rname = rest2[0];
        if (!rname) return U.fail(['You must specify a snapshot name to restore.']);
        if (vg.snapshots.indexOf(rname) === -1) return U.fail(['Snapshot \'' + rname + '\' not found.']);
        out.push('==> default: Restoring the snapshot \'' + rname + '\'...');
        vg.state = 'running';
        return U.ok(out);
      }
      if (subArg === 'list') {
        out.push('==> default: Snapshot list:');
        vg.snapshots.forEach(function (s) { out.push('==> default: ' + s); });
        if (!vg.snapshots.length) out.push('==> default: (no snapshots)');
        return U.ok(out);
      }
      if (subArg === 'delete') {
        var dname = rest2[0];
        if (!dname || vg.snapshots.indexOf(dname) === -1) return U.fail(['Snapshot \'' + (dname || '') + '\' not found.']);
        vg.snapshots = vg.snapshots.filter(function (s) { return s !== dname; });
        out.push('==> default: Deleting the snapshot \'' + dname + '\'...');
        return U.ok(out);
      }
      if (subArg === 'push' || subArg === 'pop') {
        out.push('==> default: ' + subArg + ' the snapshot...');
        return U.ok(out);
      }
      if (!subArg) {
        out.push('Usage: vagrant snapshot <command> [<args>]');
        out.push('    save       Take a snapshot of the current state');
        out.push('    restore    Restore a snapshot');
        out.push('    list       List all snapshots');
        out.push('    delete     Delete a snapshot');
        return U.ok(out);
      }
      return U.fail(['The snapshot command \'' + subArg + '\' is unknown.']);
    }
    if (sub === 'global-status') {
      out.push('id       name    provider    state    directory');
      out.push('-----------------------------------------------------------------');
      if (vg.created) out.push('1a2b3c4  default ' + pName + '   ' + vg.state + '  ' + U.parentOf(vf.abs));
      out.push('');
      out.push(note('`vagrant global-status` 列出所有 Vagrant 环境 —— 在别的目录里忘了虚机的时候用它找。'));
      return U.ok(out);
    }
    return U.fail(['The command \'' + sub + '\' was not found. Run `vagrant --help` for usage.']);
  }

  /* ======================= 9b. cloud-localds =======================
     把 user-data / meta-data 打包成带 cidata 卷标的 seed 镜像（NoCloud 数据源）。
     本地 KVM 没有云平台那种 metadata 服务，只能靠这个 ISO 把初始化数据递给虚机。 */
  function cloudLocalds(argv, ctx, stdin, HOST) {
    var outFile = null, inputs = [], networkConfig = null, vendorData = null;
    for (var i = 0; i < argv.length; i++) {
      var t = String(argv[i]);
      var m = /^--network-config=(.*)$/.exec(t);
      if (m) { networkConfig = m[1]; continue; }
      if (t === '--network-config') { networkConfig = String(argv[++i]); continue; }
      m = /^--vendor-data=(.*)$/.exec(t);
      if (m) { vendorData = m[1]; continue; }
      if (t === '--vendor-data') { vendorData = String(argv[++i]); continue; }
      if (t === '-v' || t === '--verbose' || t === '--dsmode' || t === '--disk-format') { if (t !== '-v' && t !== '--verbose') i++; continue; }
      if (t.charAt(0) === '-') continue;
      if (outFile === null) outFile = t;
      else inputs.push(t);
    }
    if (outFile === null || inputs.length < 1) {
      return U.fail(['usage: cloud-localds [options] output.img user-data [meta-data]',
                     '（例：cloud-localds /data/vmstore/web-prod-02-seed.img /tmp/user-data /tmp/meta-data）']);
    }
    var all = inputs.slice();
    if (networkConfig) all.push(networkConfig);
    if (vendorData) all.push(vendorData);
    for (var k = 0; k < all.length; k++) {
      if (!U.findNode(ctx.root, U.resolvePath(ctx.cwd, all[k]))) {
        return U.fail(['cloud-localds: error: ' + all[k] + ': No such file or directory']);
      }
    }
    var outAbs = U.resolvePath(ctx.cwd, outFile);
    var total = 32768;   /* ISO9660 的 PVD/目录表 + 填充 */
    all.forEach(function (f) {
      var n = U.findNode(ctx.root, U.resolvePath(ctx.cwd, f));
      total += (n.explicitSize !== undefined ? n.explicitSize : String(n.content || '').length);
    });
    total = Math.ceil(total / 2048) * 2048;
    putFile(ctx, outAbs, '<binary:iso9660:cidata>', { mode: '644', size: total });
    var st = S(ctx);
    st.images[outAbs] = { fmt: 'raw', virtual: total, actual: total, iso: true, label: 'cidata', snapshots: [] };
    var out = [note('已生成 seed 镜像 ' + outFile + '（卷标 cidata，包含 ' + all.join('、') + '），' +
      '用 `virt-install --disk path=' + outFile + ',device=cdrom` 作为第二块盘挂给虚机，cloud-init 会自动读取。')];
    out.push(note('cloud-init 排障第一件事就是确认卷标是 **cidata**（大小写敏感）：卷标不对会报 ' +
      '"Did not find any datasource"；`virsh domblklist <域名>` 可以确认 seed 盘真的挂上了。'));
    if (networkConfig) out.push(note('--network-config 用于没有 DHCP 的环境：把静态地址、网关、DNS 写成 network-config v1/v2 一起打包。'));
    return U.ok(out);
  }

  /* ======================= 10. growpart 与"扩完分区扩文件系统"链路 ======================= */

  function partOf(st, devPath, partNo) {
    var dev = st.block[devPath];
    if (!dev) return null;
    var p = dev.partitions[String(partNo)];
    if (!p) return null;
    return { dev: dev, part: p };
  }
  function growpart(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    var args = argv.filter(function (x) { return String(x).charAt(0) !== '-'; });
    var dryRun = argv.indexOf('--dry-run') !== -1 || argv.indexOf('-N') !== -1;
    if (args.length < 2) {
      return U.fail(['growpart: usage: growpart disk partition [--dry-run] [--free-space]',
                     '（例：growpart /dev/vdb 1 —— 把 /dev/vdb1 扩到占满整块盘）']);
    }
    var devPath = args[0], partNo = String(args[1]).replace(/[^0-9]/g, '');
    var dev = st.block[devPath];
    if (!dev) {
      return U.fail(['FAILED: ' + devPath + ': does not exist',
                     note('扩容链路的顺序不能错：先在控制台/接口上把**云硬盘**扩容，机器里 `lsblk` 确认盘变大，' +
                       '然后才是 `growpart` 扩分区、`resize2fs`/`xfs_growfs` 扩文件系统。')]);
    }
    var p = dev.partitions[partNo];
    if (!p) {
      return U.fail(['FAILED: ' + devPath + ': partition ' + partNo + ' does not exist']);
    }
    var sector = 512;
    var startSector = p.start || 2048;
    var diskSectors = Math.floor(dev.bytes / sector);
    var partSectors = Math.floor(p.bytes / sector);
    var maxSectors = diskSectors - startSector;
    if (partSectors >= maxSectors) {
      return U.ok(['NOCHANGE: partition=' + partNo + ' is size=' + partSectors + '. it cannot be grown',
                   note('分区已经占满整盘。如果刚在控制台扩过云盘，先确认 `lsblk ' + devPath + '` 里的容量真的变大了；' +
                     '没变大要 `partprobe ' + devPath + '` 让内核重读分区表。')]);
    }
    var newSectors = maxSectors;
    var out = ['CHANGED: partition=' + partNo + ' start=' + startSector + ' old: size=' + partSectors +
      ' end=' + (startSector + partSectors - 1) + ' new: size=' + newSectors + ' end=' + (startSector + newSectors - 1)];
    if (!dryRun) {
      p.bytes = newSectors * sector;
    } else {
      out.push(note('--dry-run 只打印会怎么改，**分区表没有被修改**。'));
    }
    out.push(note('growpart 只改**分区表**：`lsblk` 能看到分区变大，但 `df -h` 仍然不变 —— ' +
      '文件系统还没跟着扩。ext4 用 `resize2fs ' + devPath + partNo + '`，XFS 用 `xfs_growfs <挂载点>`；' +
      '分区上是 LVM 的话，中间还要先 `pvresize ' + devPath + partNo + '`。'));
    return U.ok(out);
  }

  function devOrPartText(devPath) {
    var m = /^(.*?)(\d+)$/.exec(devPath);
    return m ? { disk: m[1], part: m[2] } : { disk: devPath, part: null };
  }
  function resize2fs(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    var wantMin = argv.indexOf('-P') !== -1;
    var args = argv.filter(function (x) { return String(x).charAt(0) !== '-'; });
    var devPath = args[0], target = args[1];
    if (!devPath) return U.fail(['resize2fs: usage: resize2fs [-P] [-f] <device> [new-size]']);
    var dp = devOrPartText(devPath);
    var found = null;
    if (dp.part) {
      var entry = partOf(st, dp.disk, dp.part);
      if (entry) found = entry.part;
    }
    Object.keys(st.lvm.vgs).forEach(function (vgName) {
      var lvs = st.lvm.vgs[vgName].lvs;
      Object.keys(lvs).forEach(function (lvName) {
        if ('/dev/' + vgName + '/' + lvName === devPath) found = lvs[lvName];
      });
    });
    if (!found) {
      return U.fail(['resize2fs 1.46.5 (30-Dec-2021)',
                     'resize2fs: No such file or directory while trying to open ' + devPath,
                     'Couldn\'t find valid filesystem superblock.']);
    }
    var out = ['resize2fs 1.46.5 (30-Dec-2021)'];
    var fsBytes = found.fsBytes !== undefined ? found.fsBytes : found.bytes;
    if (wantMin) {
      out.push('Estimated minimum size of the filesystem: ' + Math.round(fsBytes / 4096 * 0.35));
      out.push(note('-P 只估算"最小能缩到多少"，不改任何东西。缩容前先跑它，避免缩过头把数据毁了。'));
      return U.ok(out);
    }
    if (target) {
      var tb = parseSize(target);
      if (tb === null || tb <= 0) return U.fail(['resize2fs: Invalid new size: ' + target]);
      if (tb > found.bytes) {
        return U.fail(['resize2fs: New size smaller than minimum? / requested size is larger than the device size',
                       note('缩容的目标必须小于当前文件系统大小；扩容请不带大小参数（让它撑满底层设备）。')]);
      }
      found.fsBytes = tb;
      out.push('The filesystem on ' + devPath + ' is now ' + Math.round(tb / 4096) + ' (4k) blocks long.');
      out.push(note('这是**缩容**：顺序必须是"先 umount → e2fsck -f 检查 → resize2fs 缩文件系统 → lvreduce 缩 LV"，' +
        '顺序颠倒会直接损坏文件系统。XFS 完全不支持缩容。'));
      return U.ok(out);
    }
    if (fsBytes >= found.bytes) {
      out.push('The filesystem is already ' + Math.round(fsBytes / 4096) + ' (4k) blocks long.  Nothing to do!');
      return U.ok(out);
    }
    found.fsBytes = found.bytes;
    out.push('Filesystem at ' + devPath + ' is mounted on ' + (found.mount || '/') + '; on-line resizing required');
    out.push('old_desc_blocks = ' + Math.max(1, Math.round(fsBytes / G)) + ', new_desc_blocks = ' + Math.max(1, Math.round(found.bytes / G)));
    out.push('The filesystem on ' + devPath + ' is now ' + Math.round(found.bytes / 4096) + ' (4k) blocks long.');
    out.push(note('ext4 支持在线扩容，`df -h` 现在能看到新容量了；缩容则必须先卸载。' +
      'XFS 盘要改用 `xfs_growfs <挂载点>`（XFS 只能扩不能缩）。'));
    return U.ok(out);
  }

  function xfsGrowfs(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    var noChange = argv.indexOf('-n') !== -1;
    var args = argv.filter(function (x) { return String(x).charAt(0) !== '-'; });
    var mount = args[0];
    if (!mount) return U.fail(['xfs_growfs: usage: xfs_growfs [options] mountpoint']);
    var known = { '/': '/dev/vda1', '/data': '/dev/vdb1', '/var/lib/docker': '/dev/vdc1', '/boot': '/dev/vda1' };
    var devLabel = known[mount] || null;
    var devPath = known[mount];
    var fs = null;
    if (devPath) {
      var dp = devOrPartText(devPath);
      var entry = partOf(st, dp.disk, dp.part);
      if (entry) fs = entry.part;
    }
    Object.keys(st.lvm.vgs).forEach(function (vgName) {
      var lvs = st.lvm.vgs[vgName].lvs;
      Object.keys(lvs).forEach(function (lvName) {
        if (lvs[lvName].mount === mount) { fs = lvs[lvName]; devLabel = '/dev/' + vgName + '/' + lvName; }
      });
    });
    if (!fs) {
      return U.fail(['xfs_growfs: ' + mount + ' is not a mounted XFS filesystem']);
    }
    var cur = fs.fsBytes !== undefined ? fs.fsBytes : fs.bytes;
    var blocks = Math.round(cur / 4096);
    var agcount = Math.max(1, Math.round(cur / (4 * G)));
    var out = [];
    out.push('meta-data=' + (devLabel || '?') + '              isize=512    agcount=' + agcount + ', agsize=' + Math.round(cur / agcount / 4096) + ' blks');
    out.push('         =                       sectsz=512   attr=2, projid32bit=1');
    out.push('data     =                       bsize=4096   blocks=' + blocks + ', imaxpct=25');
    out.push('         =                       sunit=0      swidth=0 blks');
    out.push('naming   =version 2              bsize=4096   ascii-ci=0, ftype=1');
    out.push('log      =internal log           bsize=4096   blocks=2560, version=2');
    out.push('realtime =none                   extsz=4096   blocks=0, rtextents=0');
    if (noChange) {
      out.push(note('-n 是"只预演不修改"：它只打印当前几何结构，不会扩容。' +
        'XFS 的扩容参数是**挂载点**而不是设备名，这是和 resize2fs 最容易混淆的地方。'));
      return U.ok(out);
    }
    var grown = Math.max(fs.bytes, cur);
    fs.fsBytes = grown;
    out.push('data blocks changed from ' + blocks + ' to ' + Math.round(grown / 4096));
    out.push(note('XFS 已在线扩容完成，`df -h ' + mount + '` 可以确认新容量。**XFS 只能扩不能缩** —— ' +
      '需要变小只能备份 → 重建文件系统 → 恢复数据。'));
    return U.ok(out);
  }

  function pvresize(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    var args = argv.filter(function (x) { return String(x).charAt(0) !== '-'; });
    var devPath = args[0];
    if (!devPath) return U.fail(['  pvresize: Missing device name']);
    var pv = st.lvm.pvs[devPath];
    if (!pv) {
      return U.ok(['  Physical volume "' + devPath + '" not found.',
                   '  0 physical volume(s) resized or updated / 1 physical volume(s) not resized',
                   note('pvresize 只对已经是 LVM 物理卷（PV）的设备有效。新盘要先 `pvcreate ' + devPath +
                     '`，再用 `vgextend <卷组> ' + devPath + '` 加进卷组。')]);
    }
    var dp = devOrPartText(devPath);
    var entry = dp.part ? partOf(st, dp.disk, dp.part) : null;
    var newBytes = entry ? entry.part.bytes : (st.block[devPath] ? st.block[devPath].bytes : pv.bytes);
    var vg = st.lvm.vgs[pv.vg];
    if (vg) {
      vg.bytes += (newBytes - pv.bytes);
      vg.free += (newBytes - pv.bytes);
    }
    var grew = newBytes - pv.bytes;
    pv.bytes = newBytes;
    var out = ['  Physical volume "' + devPath + '" changed'];
    if (grew) out.push('  ' + devPath + ': ' + (grew > 0 ? 'added' : 'removed') + ' ' + hSize(Math.abs(grew)) + ' to volume group "' + pv.vg + '"');
    out.push('  1 physical volume(s) resized or updated / 0 physical volume(s) not resized');
    out.push(note('`growpart` 扩完分区后，PV 还认为自己是旧大小 —— `pvresize` 就是让 LVM 认到新容量的一步；' +
      '之后才轮到 `lvextend` 把卷组的空闲空间分给逻辑卷。'));
    return U.ok(out);
  }

  function lvextend(argv, ctx, stdin, HOST) {
    var st = S(ctx);
    var extents = shortValue(argv, 'l');
    var sizeArg = shortValue(argv, 'L');
    var autoResize = hasShort(argv, 'r') || argv.indexOf('--resizefs') !== -1;
    var testMode = hasShort(argv, 't') || argv.indexOf('--test') !== -1;
    var args = argv.filter(function (x) { return String(x).charAt(0) !== '-'; });
    var lvPath = args[args.length - 1];
    if (!lvPath) return U.fail(['  lvextend: Missing logical volume name']);
    var lvName = null, vgName = null, lv = null;
    Object.keys(st.lvm.vgs).forEach(function (v) {
      var lvs = st.lvm.vgs[v].lvs;
      Object.keys(lvs).forEach(function (n) {
        if ('/dev/' + v + '/' + n === lvPath) { lv = lvs[n]; lvName = n; vgName = v; }
      });
    });
    if (!lv) {
      return U.fail(['  Volume group "' + String(lvPath).replace('/dev/', '').split('/')[0] + '" not found',
                     '  Cannot process volume group ' + String(lvPath).replace('/dev/', '').split('/')[0]]);
    }
    var oldBytes = lv.bytes, delta = 0, rounding = null;
    if (extents) {
      var pct = /^\+?(\d+)%FREE$/.exec(extents);
      if (pct) {
        var free = st.lvm.vgs[vgName].free || 12 * G;
        delta = free;
        rounding = '  Rounding size to boundary between physical extents: ' + hSize2(delta) + '.';
      } else {
        var n = parseInt(String(extents).replace(/[^0-9]/g, ''), 10);
        if (!n) return U.fail(['  Invalid argument for --extents: ' + extents]);
        delta = n * 4 * M;
      }
    } else if (sizeArg) {
      var sgn = /^[+-]/.test(String(sizeArg).charAt(0)) ? String(sizeArg).charAt(0) : '+';
      var abs = parseSize(String(sizeArg).replace(/^[+-]/, ''));
      if (abs === null) return U.fail(['  Invalid argument for --size: ' + sizeArg]);
      delta = sgn === '-' ? -abs : abs;
    } else {
      return U.fail(['  Please specify either size or extents']);
    }
    if (testMode) {
      return U.ok(['  TEST MODE: Metadata will NOT be updated and volumes will not be (de)activated.',
                   '  Size of logical volume ' + vgName + '/' + lvName + ' would change from ' + hSize2(oldBytes) +
                   ' (' + Math.round(oldBytes / (4 * M)) + ' extents) to ' + hSize2(oldBytes + delta) +
                   ' (' + Math.round((oldBytes + delta) / (4 * M)) + ' extents).']);
    }
    lv.bytes = oldBytes + delta;
    st.lvm.vgs[vgName].bytes = Math.max(st.lvm.vgs[vgName].bytes, lv.bytes);
    st.lvm.vgs[vgName].free = Math.max(0, (st.lvm.vgs[vgName].free || 0) - delta);
    var out = [];
    if (rounding) out.push(rounding);
    out.push('  Size of logical volume ' + vgName + '/' + lvName + ' changed from ' + hSize2(oldBytes) +
      ' (' + Math.round(oldBytes / (4 * M)) + ' extents) to ' + hSize2(lv.bytes) + ' (' + Math.round(lv.bytes / (4 * M)) + ' extents).');
    out.push('  Logical volume ' + vgName + '/' + lvName + ' successfully resized.');
    if (autoResize) {
      if (lv.fs === 'xfs') {
        var xg = xfsGrowfs([lv.mount || '/'], ctx, null, HOST);
        xg.out.forEach(function (l) { out.push(l); });
      } else {
        var r2 = resize2fs([lvPath], ctx, null, HOST);
        r2.out.forEach(function (l) { out.push(l); });
      }
    } else {
      out.push(note('这一步只改了**块设备**的容量，文件系统还没变大 —— `df -h` 里看不到新空间。' +
        '接着要跑 `resize2fs ' + lvPath + '`（ext4）或 `xfs_growfs ' + (lv.mount || '/data') + '`（XFS）；' +
        '加 `-r` 可以让 lvextend 自动帮你做这一步。'));
    }
    return U.ok(out);
  }

  /* ======================= 11. sysctl / sleep / wait =======================
     这三个不是"虚拟化"命令，但 data/kvm.js 的示例会真的走到它们：
       `virsh shutdown web-prod-01 && sleep 30 && virsh domstate web-prod-01`
       `ip addr show virbr0 && sysctl net.ipv4.ip_forward`
     引擎里没有它们，示例就会以 "command not found" 收场，所以在这里补上最小可用实现
     （sysctl 直接读写 /proc/sys 下的文件，和 `cat /proc/sys/...` 看到的永远一致）。 */

  function sysctlKeyPath(key) {
    return '/proc/sys/' + String(key).replace(/\./g, '/');
  }
  function sysctlRead(ctx, key) {
    var abs = sysctlKeyPath(key);
    var node = U.findNode(ctx.root, abs);
    if (!node || node.type !== 'file') return null;
    return String(node.content === undefined ? '' : node.content).replace(/\n+$/, '');
  }
  function sysctl(argv, ctx, stdin, HOST) {
    var out = [], err = [];
    var fail_ = function (lines) { return { out: [], err: lines, code: 1 }; };
    var i = 0, write = false, noName = false, ignore = false, loadFile = null, doSystem = false, all = false;
    var settings = [];
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-w' || a === '--write') { write = true; continue; }
      if (a === '-n' || a === '--values') { noName = true; continue; }
      if (a === '-q' || a === '--quiet') { ignore = true; continue; }
      if (a === '-a' || a === '--all') { all = true; continue; }
      if (a === '--system') { doSystem = true; continue; }
      if (a === '-p' || a === '--load') { loadFile = argv[i + 1] && String(argv[i + 1]).charAt(0) !== '-' ? String(argv[++i]) : ''; continue; }
      if (a === '-e' || a === '--ignore' || a === '-N' || a === '-b') { ignore = true; continue; }
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail_([/^--/.test(a) ? 'sysctl: unrecognized option \'' + a + '\'' : 'sysctl: invalid option -- \'' + a.charAt(1) + '\'',
                      "Try 'sysctl --help' for more information."]);
      }
      settings.push(a);
    }
    if (doSystem || loadFile !== null) {
      var files = [];
      if (loadFile) files.push(loadFile);
      else if (doSystem) {
        if (U.findNode(ctx.root, '/etc/sysctl.conf')) files.push('/etc/sysctl.conf');
        var d = U.findNode(ctx.root, '/etc/sysctl.d');
        if (d && d.type === 'dir') {
          U.childrenSorted(d).forEach(function (n) {
            if (/\.conf$/.test(n)) files.push('/etc/sysctl.d/' + n);
          });
        }
      } else files.push('/etc/sysctl.conf');
      if (!files.length) return fail_(['sysctl: cannot open "/etc/sysctl.conf": No such file or directory']);
      var applied = 0;
      files.forEach(function (f) {
        var r = U.readFileOrErr(ctx, f);
        if (r.err) {
          if (doSystem) return;
          err.push('sysctl: cannot open "' + f + '": No such file or directory');
          return;
        }
        if (doSystem) out.push('* Applying ' + f + ' ...');
        U.splitLines(r.content).forEach(function (line) {
          var t = line.replace(/#.*$/, '').trim();
          if (!t) return;
          var m = /^([A-Za-z0-9_.\-\/]+)\s*=\s*(.*)$/.exec(t);
          if (!m) return;
          var key = m[1], val = m[2].replace(/^["']|["']$/g, '');
          putFile(ctx, sysctlKeyPath(key), val + '\n');
          out.push(key + ' = ' + val);
          applied++;
        });
      });
      if (err.length) return { out: out, err: err, code: 1 };
      out.push(note('sysctl -p 从配置文件加载参数（`sysctl --system` 会按 /etc/sysctl.d/*.conf 的文件名顺序全部加载，' +
        '所以调优文件用 99- 前缀保证最后生效）。共应用 ' + applied + ' 项。'));
      return U.ok(out);
    }
    if (all) {
      var base = U.findNode(ctx.root, '/proc/sys');
      var rows = [];
      if (base) {
        U.walkFiles(base, '/proc/sys', function (node, abs) {
          if (node.type !== 'file') return;
          var key = abs.replace('/proc/sys/', '').replace(/\//g, '.');
          rows.push(key + ' = ' + String(node.content || '').replace(/\n+$/, ''));
        });
      }
      rows.sort();
      rows.forEach(function (r) { out.push(r); });
      out.push(note('`sysctl -a` 打印全部内核参数。调优前先 `sysctl -a | grep <参数名>` 记录基线，' +
        '改完压测对比，无效就回滚 —— 生产上调参最常见的问题不是"调错了"，而是"调了一堆无法归因"。'));
      return U.ok(out);
    }
    if (!settings.length) {
      return fail_([write ? 'sysctl: no variables specified' : 'sysctl: missing argument',
                    "Try 'sysctl --help' for more information."]);
    }
    settings.forEach(function (s) {
      if (write) {
        var m = /^([A-Za-z0-9_.\-\/]+)=(.*)$/.exec(s);
        if (!m) { err.push('sysctl: malformed setting \'' + s + '\''); return; }
        var key = m[1], val = m[2].replace(/^["']|["']$/g, '');
        var abs = sysctlKeyPath(key);
        var node = U.findNode(ctx.root, abs);
        if (!node) {
          err.push('sysctl: cannot stat ' + abs + ': No such file or directory');
          if (!ignore) err.push(note('参数名必须是内核真实存在的键（可在 `sysctl -a` 里找）。写错名字真机同样会报 cannot stat。'));
          return;
        }
        putFile(ctx, abs, val + '\n');
        out.push(key + ' = ' + val);
        if (key === 'net.ipv4.ip_forward' && val === '0') {
          out.push(note('**高危**：把 net.ipv4.ip_forward 改成 0，做网关/NAT 的主机会立刻停止转发，整片内网断网。' +
            '远程操作前先在 tmux 里跑，或写好"60 秒后自动回滚"的脚本。'));
        }
        if (key === 'vm.swappiness') out.push(note('vm.swappiness 降到 1 能减少换出，对数据库/Redis 这类延迟敏感服务很重要；' +
          '但它不等于禁用 swap，内存真的不足时内核仍会换出。'));
        return;
      }
      var val2 = sysctlRead(ctx, s);
      if (val2 === null) {
        err.push('sysctl: cannot stat ' + sysctlKeyPath(s) + ': No such file or directory');
        return;
      }
      out.push(noName ? val2 : (s + ' = ' + val2));
    });
    if (err.length) return { out: out, err: err, code: 1 };
    return U.ok(out);
  }

  function sleepCmd(argv, ctx, stdin, HOST) {
    var args = argv.filter(function (x) { return String(x).charAt(0) !== '-'; });
    if (!args.length) return U.fail(['sleep: missing operand', "Try 'sleep --help' for more information."]);
    var total = 0;
    for (var i = 0; i < args.length; i++) {
      var m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(String(args[i]));
      if (!m) return U.fail(['sleep: invalid time interval \'' + args[i] + '\'', "Try 'sleep --help' for more information."]);
      var n = parseFloat(m[1]);
      var unit = m[2];
      total += n * (unit === 'm' ? 60 : unit === 'h' ? 3600 : unit === 'd' ? 86400 : 1);
    }
    /* 真机上是真的等；教学环境不能挂住浏览器，所以立刻返回并说明 */
    if (total >= 1) {
      return U.ok([note('教学环境不会真的等待 ' + total + ' 秒（否则页面会卡住）：这里立即返回。' +
        '这也正好说明一个问题 —— **虚拟机的关机是异步的**，`sleep 30` 之后状态才可能变化，脚本里应该用轮询而不是死等。')]);
    }
    return U.ok([]);
  }

  function waitCmd(argv, ctx, stdin, HOST) {
    var args = argv.filter(function (x) { return String(x).trim() !== ''; });
    if (!args.length) return U.ok([]);        /* `wait` 不带参数：等待所有后台任务，教学环境无后台任务 */
    var bad = args.filter(function (x) { return /^\d+$/.test(String(x)); });
    if (bad.length) {
      return U.fail(['wait: pid ' + bad[0] + ' is not a child of this shell',
                     note('教学环境没有真正的后台作业，所以任何 PID 都不是它的子进程。$! 取到的后台进程号在真机上才有意义。')]);
    }
    return U.ok([]);
  }

  /* ==== CHUNK-B ==== */
  window.CC_SHELL.extend({
    'virsh': virsh,
    'qemu-img': qemuImg,
    'virt-install': virtInstall,
    'virt-customize': virtCustomize,
    'guestfish': guestfish,
    'virt-filesystems': virtFilesystems,
    'virt-df': virtDf,
    'virt-copy-out': virtCopyOut,
    'virt-rescue': virtRescue,
    'virt-cat': virtCat,
    'virt-ls': virtLs,
    'vagrant': vagrant,
    'growpart': growpart,
    'resize2fs': resize2fs,
    'xfs_growfs': xfsGrowfs,
    'pvresize': pvresize,
    'lvextend': lvextend,
    'sysctl': sysctl,
    'sleep': sleepCmd,
    'wait': waitCmd
  });
})();
