/* assets/js/cmd-ops.js · 磁盘存储 / 监控日志 / 性能压测
   --------------------------------------------------------------------------
   本文件只负责**注册命令实现**：shell.js 先加载，这里再调用
     window.CC_SHELL.extend({ '命令名': function (argv, ctx, stdin, HOST) { ... } })
   引擎内部的工具函数从 window.CC_SHELL.util 取（ok/fail/resolvePath/findNode/
   readFileOrErr/splitLines/childrenSorted/expandLongOpts/pad/padLeft/walkFiles）。

   覆盖的内容条目：
     linux-storage  lsblk / blkid / fdisk / parted / partprobe / partx / mkfs.* /
                    xfs_info / xfs_growfs / mkswap / swapon / swapoff / fallocate /
                    truncate / umount / mount / ncdu / growpart / resize2fs /
                    tune2fs / dumpe2fs / e2fsck / fsck / LVM(pv/vg/lv) / mdadm /
                    smartctl / hdparm / sync / ioping / fstrim / blkdiscard /
                    quotacheck / edquota / repquota / showmount / exportfs / fuser /
                    file -s / dd（测速）
     monitor        dmesg / sysctl / iotop / pidstat / sar / htop / ps(补) / free(补) /
                    iostat(补) / vmstat(补) / /proc 关键文件 / strace / perf / bpftrace /
                    promtool / amtool / zabbix_get / zabbix_agentd / logrotate /
                    rsyslogd / lastb / lnav / multitail / jps / jstat / jmap / jstack /
                    jinfo / jcmd / java
     perf           fio / sysbench / ab / wrk / hey / siege / jmeter / locust / iperf3 /
                    mtr / ulimit / taskset / numa* / printf / watch / timeout

   数据文件（data/*.js）里的 examples[].cmd 会由 tools/example-check.js 逐条真跑，
   所以实现必须让这些示例真的能跑通、且输出与 desc 描述一致。

   物理事实全部与 data/termfs.js 对齐，绝不另造一套：
     磁盘  vda=40G(/)  vdb=200G(/data, 189G used, IUse% 100%)  vdc=100G(/var/lib/docker)
     内存  MemTotal=7957184 kB = 7770.7 MiB   available=1128404 kB ≈ 1.1 GiB
     IO    vdb %util=99.41%、w_await=42.18ms（就是 /data 的瓶颈）
     进程  java 18442 / mysqld 2210 / dockerd 1204 / nginx 1842
   危险命令（mkfs、fdisk 写盘、dd、swapoff、umount、lvremove…）一律**如实**：
   该报 busy 就报 busy，该要 -F/-f 就要，不会静默"假装成功"。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;

  var U = window.CC_SHELL.util;

  /* ======================================================================
     0. 模拟数据（写在本文件里，父目录自动创建；同路径首次生效）
     ====================================================================== */

  /* ---- 应用日志：monitor / perf 两个分类的 tail/grep/lnav 都要读它 ---- */
  var APP_LOG = [
    '2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3',
    '2024-03-18 09:38:33.910  INFO 1 --- [main] c.e.OrdersApplication : The following 1 profile is active: "prod"',
    '2024-03-18 09:38:36.114  INFO 1 --- [main] o.s.b.w.embedded.tomcat.TomcatWebServer : Tomcat initialized with port(s): 8080 (http)',
    '2024-03-18 09:38:42.113  INFO 1 --- [main] c.e.OrdersApplication : Started OrdersApplication in 8.42 seconds (JVM running for 9.18)',
    '2024-03-18 09:39:02.441  INFO 1 --- [http-nio-8080-exec-1] c.e.o.OrderController : GET /api/orders page=0 size=20',
    '2024-03-18 09:39:02.512  INFO 1 --- [http-nio-8080-exec-1] c.e.o.OrderService : query orders cost 68ms, rows=20',
    '2024-03-18 09:39:18.007  INFO 1 --- [http-nio-8080-exec-2] c.e.o.OrderController : POST /api/orders orderId=8810',
    '2024-03-18 09:39:18.126  INFO 1 --- [http-nio-8080-exec-2] c.e.o.OrderService : insert order cost 118ms',
    '2024-03-18 09:40:44.002  WARN 1 --- [http-nio-8080-exec-3] c.e.o.OrderService : slow query detected, cost 2860ms, orderId=8811',
    '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812',
    '2024-03-18 09:41:18.554 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderController : Servlet.service() for servlet [dispatcherServlet] threw exception',
    '2024-03-18 09:41:19.001  INFO 1 --- [http-nio-8080-exec-4] c.e.o.OrderController : GET /api/orders/8812 -> 500 (421ms)',
    '2024-03-18 09:41:55.220  INFO 1 --- [http-nio-8080-exec-5] c.e.o.OrderController : GET /api/orders page=0 size=20',
    '2024-03-18 09:41:55.301  INFO 1 --- [http-nio-8080-exec-5] c.e.o.OrderService : query orders cost 81ms, rows=20',
    '2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813',
    '2024-03-18 09:42:08.120  INFO 1 --- [http-nio-8080-exec-9] c.e.o.OrderController : GET /api/orders/8813 -> 500 (418ms)',
    '2024-03-18 09:42:31.772  WARN 1 --- [http-nio-8080-exec-11] c.e.o.OrderService : slow query detected, cost 3120ms, orderId=8814',
    '2024-03-18 09:43:03.114 ERROR 1 --- [http-nio-8080-exec-12] c.e.o.OrderService : query timeout after 5000ms, orderId=8814',
    '2024-03-18 09:43:03.240 ERROR 1 --- [http-nio-8080-exec-12] c.e.o.OrderService : caused by: java.sql.SQLTransientConnectionException: HikariPool-1 - Connection is not available, request timed out after 5000ms',
    '2024-03-18 09:43:03.246 ERROR 1 --- [http-nio-8080-exec-12] c.e.o.OrderService : caused by: java.net.SocketTimeoutException: Read timed out',
    '2024-03-18 09:43:04.008  INFO 1 --- [http-nio-8080-exec-12] c.e.o.OrderController : GET /api/orders/8814 -> 500 (421ms)',
    '2024-03-18 09:44:11.550  INFO 1 --- [HikariPool-1 housekeeper] com.zaxxer.hikari.pool.HikariPool : HikariPool-1 - Pool stats (total=20, active=20, idle=0, waiting=3)',
    '2024-03-18 09:45:02.331  WARN 1 --- [HikariPool-1 housekeeper] com.zaxxer.hikari.pool.HikariPool : HikariPool-1 - Thread starvation or clock leap detected',
    '2024-03-18 09:46:20.882  INFO 1 --- [http-nio-8080-exec-14] c.e.o.OrderController : GET /api/health -> 200',
    '2024-03-18 09:47:41.114 ERROR 1 --- [http-nio-8080-exec-17] c.e.o.OrderService : query timeout after 5000ms, orderId=8819'
  ].join('\n') + '\n';

  /* ---- JVM GC 日志：perf 分类的 GC 分析条目要真能 grep 出数 ---- */
  var GC_LOG = [
    '[2024-03-18T09:38:33.001+0800][info][gc] Using G1',
    '[2024-03-18T09:38:33.004+0800][info][gc,init] Version: 17.0.9+9-LTS (release)',
    '[2024-03-18T09:38:33.006+0800][info][gc,init] Heap Min Capacity: 4G',
    '[2024-03-18T09:38:33.008+0800][info][gc,init] Heap Initial Capacity: 4G',
    '[2024-03-18T09:38:33.010+0800][info][gc,init] Heap Max Capacity: 4G',
    '[2024-03-18T09:38:33.012+0800][info][gc,init] Region Size: 2M',
    '[2024-03-18T09:39:02.118+0800][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 512M->128M(4096M) 42.118ms',
    '[2024-03-18T09:39:31.774+0800][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 660M->142M(4096M) 38.902ms',
    '[2024-03-18T09:40:04.220+0800][info][gc] GC(2) Pause Young (Normal) (G1 Evacuation Pause) 812M->176M(4096M) 51.447ms',
    '[2024-03-18T09:40:44.008+0800][info][gc] GC(3) Pause Young (Concurrent Start) (G1 Humongous Allocation) 1104M->208M(4096M) 88.331ms',
    '[2024-03-18T09:40:44.402+0800][info][gc] GC(4) Pause Remark 246M->246M(4096M) 12.118ms',
    '[2024-03-18T09:40:44.900+0800][info][gc] GC(5) Pause Cleanup 268M->268M(4096M) 1.204ms',
    '[2024-03-18T09:41:18.550+0800][warning][gc] GC(6) Pause Full (System.gc()) 3204M->2860M(4096M) 1842.552ms',
    '[2024-03-18T09:41:19.004+0800][info][gc,marking] GC(6) Marking Phase 1204.118ms',
    '[2024-03-18T09:41:19.006+0800][info][gc] GC(6) Pause Full (System.gc()) end, 1842.552ms',
    '[2024-03-18T09:42:07.880+0800][warning][gc] GC(7) Pause Full (System.gc()) 3188M->2904M(4096M) 2018.447ms',
    '[2024-03-18T09:42:08.118+0800][info][gc] GC(7) Pause Full (System.gc()) end, 2018.447ms',
    '[2024-03-18T09:42:52.004+0800][info][gc] GC(8) Pause Young (Normal) (G1 Evacuation Pause) 1024M->364M(4096M) 62.118ms',
    '[2024-03-18T09:43:03.112+0800][warning][gc] GC(9) Pause Full (System.gc()) 3202M->2941M(4096M) 2210.884ms',
    '[2024-03-18T09:43:04.002+0800][info][gc] GC(9) Pause Full (System.gc()) end, 2210.884ms',
    '[2024-03-18T09:44:11.550+0800][info][gc] GC(10) Pause Young (Normal) (G1 Evacuation Pause) 1180M->402M(4096M) 71.224ms',
    '[2024-03-18T09:45:31.220+0800][warning][gc] GC(11) Pause Full (System.gc()) 3244M->2988M(4096M) 1986.114ms',
    '[2024-03-18T09:46:20.880+0800][info][gc] GC(12) Pause Young (Normal) (G1 Evacuation Pause) 1212M->438M(4096M) 58.118ms',
    '[2024-03-18T09:47:41.110+0800][warning][gc] GC(13) Pause Full (System.gc()) 3260M->3012M(4096M) 2044.882ms',
    '[2024-03-18T09:48:02.008+0800][info][gc] GC(14) Pause Young (Normal) (G1 Evacuation Pause) 1240M->466M(4096M) 66.774ms',
    '[2024-03-18T09:49:12.114+0800][info][gc] GC(15) Pause Young (Normal) (G1 Evacuation Pause) 1298M->498M(4096M) 74.221ms',
    '[2024-03-18T09:50:31.994+0800][info][gc] GC(16) Pause Young (Normal) (G1 Evacuation Pause) 1332M->512M(4096M) 68.447ms'
  ].join('\n') + '\n';

  var SYSCTL_TUNING = 'net.core.somaxconn = 32768\nnet.ipv4.tcp_max_syn_backlog = 16384\n';

  window.CC_SHELL.fsAdd({
    '/data/app/logs/app.log': { content: APP_LOG, size: 165150720, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:47' },
    '/data/logs/gc.log': { content: GC_LOG, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:50' },
    '/data/fio-test': { content: '<binary>fio 压测文件（真机上由 fio 自己创建/删除）', size: 4294967296, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:50' },
    '/swapfile': { content: '<binary>swap 文件（fallocate -l 2G 建出来，chmod 600 之后 mkswap）', size: 2147483648, mode: '600', user: 'root', group: 'root', mtime: '2024-03-15 10:10' },
    '/data/bigfile.log': { content: '<binary>大文件（sync -f 的落盘对象）', size: 2147483648, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:40' },
    '/data/testfile': { content: '<binary>dd 顺序写测试文件', size: 2147483648, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:44' },
    '/tmp/ncdu-data.json': { content: '[1,1,{"progname":"ncdu","progver":"1.15.1","timestamp":1710727860},\n[{"name":"/data","asize":202937204736,"dsize":202937204736,"dev":64769,"ino":2},\n[{"name":"backup","asize":5557452800,"dsize":5557452800,"ino":8842},\n[{"name":"logs","asize":173015040,"dsize":173015040,"ino":8843}]]]]\n', mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:50' },
    '/etc/sysctl.d/99-tuning.conf': { content: SYSCTL_TUNING, mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 10:00' },
    '/etc/security/limits.d/99-nofile.conf': { content: '* soft nofile 65535\n* hard nofile 65535\n', mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 10:05' },
    '/etc/systemd/journald.conf': {
      content: '#  This file is part of systemd.\n#\n#  Entries in this file show the compile time defaults.\n[Journal]\n#Storage=auto\n#Compress=yes\n#SystemMaxUse=\n#RuntimeMaxUse=\n#MaxRetentionSec=\n#ForwardToSyslog=yes\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-05 08:00'
    },
    '/etc/rsyslog.conf': {
      content: '# rsyslog configuration file\n\n#### MODULES ####\n$ModLoad imuxsock\n$ModLoad imjournal\n\n#### RULES ####\n*.info;mail.none;authpriv.none;cron.none                /var/log/messages\nauthpriv.*                                              /var/log/secure\ncron.*                                                  /var/log/cron\n*.emerg                                                 :omusrmsg:*\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-05 08:00'
    },
    '/etc/rsyslog.d/10-myapp.conf': { content: 'if $programname == "myapp" then /var/log/myapp.log\n', mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 11:20' },
    '/etc/logrotate.d/myapp': {
      content: '/data/app/logs/app.log {\n    daily\n    rotate 7\n    size 100M\n    compress\n    delaycompress\n    missingok\n    notifempty\n    copytruncate\n    create 0644 deploy deploy\n}\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 11:30'
    },
    '/var/lib/logrotate/logrotate.status': {
      content: 'logrotate state -- version 2\n"/var/log/messages" 2024-3-18-3:0:0\n"/var/log/secure" 2024-3-18-3:0:0\n"/data/app/logs/app.log" 2024-3-18-3:0:0\n"/var/log/nginx/access.log" 2024-3-18-3:0:0\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 03:00'
    },
    '/var/log/myapp.log': {
      content: '2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3\n2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\n2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:43'
    },
    '/var/lib/node_exporter/textfile/myapp.prom': { content: 'myapp_up 1\n', mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:45' },
    '/var/log/sa/sa18': { content: '<binary>sysstat 二进制历史数据（3 月 18 日）', size: 122880, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:50' },
    '/etc/zabbix/zabbix_agentd.conf': {
      content: 'Server=10.0.1.23\nServerActive=10.0.1.23:10051\nHostname=web-prod-01\nInclude=/etc/zabbix/zabbix_agentd.d/*.conf\nUserParameter=myapp.proc,/usr/bin/pgrep -c -f app.jar\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 09:20'
    },
    '/etc/alertmanager/alertmanager.yml': {
      content: 'global:\n  resolve_timeout: 5m\nroute:\n  receiver: default\n  group_by: ["alertname"]\n  routes:\n    - matchers:\n        - severity="critical"\n      receiver: db-oncall\nreceivers:\n  - name: default\n  - name: db-oncall\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 09:30'
    },
    '/etc/prometheus/prometheus.yml': {
      content: 'global:\n  scrape_interval: 15s\nevaluation_interval: 15s\nrule_files:\n  - /etc/prometheus/rules/*.yml\nscrape_configs:\n  - job_name: node\n    static_configs:\n      - targets: ["10.0.1.23:9100", "10.0.1.24:9100"]\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 09:35'
    },
    '/etc/prometheus/rules/node.rules.yml': {
      content: 'groups:\n  - name: node\n    rules:\n      - alert: NodeDown\n        expr: up{job="node"} == 0\n        for: 2m\n        labels:\n          severity: critical\n        annotations:\n          summary: "实例 {{ $labels.instance }} 失联"\n      - alert: DiskWillFillIn4Hours\n        expr: predict_linear(node_filesystem_avail_bytes{mountpoint="/data"}[6h], 4*3600) < 0\n        for: 5m\n        labels:\n          severity: warning\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 09:36'
    },
    '/opt/jmeter/plan/order-api.jmx': {
      content: '<?xml version="1.0" encoding="UTF-8"?>\n<jmeterTestPlan version="1.2" properties="5.0">\n  <hashTree>\n    <TestPlan guiclass="TestPlanGui" testname="order-api" enabled="true">\n      <boolProp name="TestPlan.functional_mode">false</TestPlan>\n      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments"/>\n    </TestPlan>\n    <ThreadGroup guiclass="ThreadGroupGui" testname="order-api-threads">\n      <intProp name="ThreadGroup.num_threads">100</intProp>\n      <intProp name="ThreadGroup.ramp_time">10</intProp>\n      <boolProp name="ThreadGroup.scheduler">true</boolProp>\n      <stringProp name="ThreadGroup.duration">120</stringProp>\n    </ThreadGroup>\n  </hashTree>\n</jmeterTestPlan>\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 09:40'
    },
    '/opt/locust/order_flow.py': {
      content: 'from locust import HttpUser, task, between\n\n\nclass OrderFlowUser(HttpUser):\n    wait_time = between(1, 3)\n\n    @task(3)\n    def list_orders(self):\n        self.client.get("/api/orders")\n\n    @task(1)\n    def create_order(self):\n        self.client.post("/api/orders", json={"userId": 1})\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 09:45'
    },
    '/proc/mdstat': { content: 'Personalities : [raid1] \nmd0 : active raid1 vdb[0] vdc[1]\n      209584128 blocks super 1.2 [2/2] [UU]\n      \nunused devices: <none>\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:00' },
    '/proc/18442/wchan': { content: 'ep_poll\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51' },
    '/proc/18442/status': {
      content: 'Name:\tjava\nUmask:\t0022\nState:\tS (sleeping)\nTgid:\t18442\nPid:\t18442\nPPid:\t1\nUid:\t1000\t1000\t1000\t1000\nGid:\t1000\t1000\t1000\t1000\nThreads:\t184\nVmPeak:\t 4318840 kB\nVmSize:\t 4218420 kB\nVmRSS:\t  612400 kB\nRssAnon:\t  498220 kB\nRssFile:\t  114180 kB\nVmSwap:\t       0 kB\nvoluntary_ctxt_switches:\t18422\nnonvoluntary_ctxt_switches:\t  311\n',
      mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51'
    },
    '/proc/18442/io': { content: 'rchar: 884213770\nwchar: 184220418\nsyscr: 184220\nsyscw: 42118\nread_bytes: 88473600\nwrite_bytes: 18432000\ncancelled_write_bytes: 0\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51' },
    '/proc/18442/limits': { content: 'Limit                     Soft Limit           Hard Limit           Units     \nMax cpu time              unlimited            unlimited            seconds   \nMax file size             unlimited            unlimited            bytes     \nMax open files            65535                65535                files     \nMax locked memory         65536                65536                bytes     \nMax processes             63457                63457                processes \nMax pending signals       63457                63457                signals   \n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51' },
    '/proc/18442/fd/0': { type: 'link', target: '/dev/null', mode: '777', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/proc/18442/fd/1': { type: 'link', target: '/data/app/logs/app.log', mode: '777', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/proc/18442/fd/2': { type: 'link', target: '/data/app/logs/app.log', mode: '777', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/proc/18442/fd/3': { type: 'link', target: 'socket:[884213]', mode: '777', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/proc/18442/fd/4': { type: 'link', target: 'socket:[884214]', mode: '777', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/proc/18442/fd/5': { type: 'link', target: 'anon_inode:[eventpoll]', mode: '777', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/proc/18442/fd/6': { type: 'link', target: '/opt/myapp/app.jar', mode: '777', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/proc/2210/status': {
      content: 'Name:\tmysqld\nUmask:\t0022\nState:\tS (sleeping)\nTgid:\t2210\nPid:\t2210\nPPid:\t1\nUid:\t27\t27\t27\t27\nGid:\t27\t27\t27\t27\nThreads:\t48\nVmPeak:\t 1892444 kB\nVmSize:\t 1892444 kB\nVmRSS:\t 1820440 kB\nRssAnon:\t 1642118 kB\nRssFile:\t  178322 kB\nVmSwap:\t       0 kB\nvoluntary_ctxt_switches:\t284102\nnonvoluntary_ctxt_switches:\t  1842\n',
      mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51'
    },
    '/proc/2210/io': { content: 'rchar: 18442201184\nwchar: 4211804224\nsyscr: 4211804\nsyscw: 884210\nread_bytes: 18432000000\nwrite_bytes: 4211840000\ncancelled_write_bytes: 0\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51' },
    '/proc/2210/limits': { content: 'Limit                     Soft Limit           Hard Limit           Units     \nMax open files            65535                65535                files     \nMax processes             63457                63457                processes \n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51' },
    '/proc/sys/fs/file-nr': { content: '1842\t0\t2097152\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51' },
    '/proc/sys/fs/file-max': { content: '2097152\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/fs/inode-nr': { content: '312884\t2298826\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-18 09:51' },
    '/proc/sys/vm/swappiness': { content: '60\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/vm/vfs_cache_pressure': { content: '100\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/vm/dirty_ratio': { content: '20\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/vm/dirty_background_ratio': { content: '10\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/vm/overcommit_memory': { content: '0\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/core/somaxconn': { content: '128\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/core/rmem_max': { content: '212992\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/core/wmem_max': { content: '212992\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_max_syn_backlog': { content: '1024\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_tw_reuse': { content: '0\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_timestamps': { content: '1\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_fin_timeout': { content: '60\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/tcp_syncookies': { content: '1\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/net/ipv4/ip_local_port_range': { content: '32768\t60999\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/kernel/perf_event_paranoid': { content: '2\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/kernel/pid_max': { content: '63457\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/kernel/msgmax': { content: '8192\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/sys/kernel/sched_autogroup_enabled': { content: '1\n', mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/etc/exports': { content: '# 只放行内网网段，no_subtree_check 减少 stat 调用\n/data 192.168.1.0/24(rw,sync,no_subtree_check)\n', mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 11:00' },
    '/etc/auto.master': { content: '# Sample auto.master file\n+dir:/etc/auto.master.d\n/misc   /etc/auto.misc\n/mnt/nfs /etc/auto.nfs --timeout=60\n', mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 11:10' },
    '/etc/auto.nfs': { content: 'data -rw,soft 192.168.1.10:/data\n', mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 11:10' }
  });

  /* ======================================================================
     1. 共用小工具
     ====================================================================== */

  function ok(lines) { return { out: lines || [], err: [], code: 0 }; }
  function fail(lines) { return { out: [], err: lines || [], code: 1 }; }
  function has(argv, s) { return argv.indexOf(s) !== -1; }
  /* 合并写法（-av / -xdm）里是否含某个字母 */
  function flag(argv, ch) {
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.length > 1 && a.charAt(0) === '-' && a.charAt(1) !== '-' && a.indexOf(ch) !== -1) return true;
    }
    return false;
  }
  function argsOf(argv) {
    return argv.filter(function (a) { return String(a).charAt(0) !== '-'; });
  }
  function optValue(argv, name) {
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === name) return argv[i + 1];
      if (a.indexOf(name + '=') === 0) return a.slice(name.length + 1);
    }
    return null;
  }
  function optAll(argv, name) {
    var res = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === name && argv[i + 1] !== undefined) res.push(String(argv[i + 1]));
      else if (a.indexOf(name + '=') === 0) res.push(a.slice(name.length + 1));
    }
    return res;
  }
  /* getopt 风格解析：spec 里带 ':' 的选项会**吃掉后面那个值**。
     这一点极其重要 —— `blkid -s UUID -o value /dev/vdb1` 里 UUID/value 是 -s/-o 的
     参数值而不是设备名，早先只按"首字符不是 -"取位置参数，就会把它们当成文件名
     从而报 `blkid: UUID: No such file or directory`。 */
  function parseArgs(argv, spec) {
    var takesVal = {};
    String(spec || '').split(',').forEach(function (s) {
      if (!s) return;
      if (s.charAt(s.length - 1) === ':') takesVal[s.slice(0, -1)] = true;
      else takesVal[s] = false;
    });
    var res = { flags: {}, opts: {}, args: [] };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--') { for (var j = i + 1; j < argv.length; j++) res.args.push(String(argv[j])); break; }
      if (a.length >= 2 && a.charAt(0) === '-' && a.charAt(1) === '-') {
        var eq = a.indexOf('=');
        var name = eq === -1 ? a.slice(2) : a.slice(2, eq);
        if (eq !== -1 && takesVal[name]) { res.opts[name] = a.slice(eq + 1); res.flags[name] = true; }
        else if (takesVal[name] === true) { res.opts[name] = argv[++i] === undefined ? '' : String(argv[i]); res.flags[name] = true; }
        else res.flags[name] = true;
        continue;
      }
      if (a.charAt(0) === '-' && a.length > 1) {
        var body = a.slice(1);
        var consumed = false;
        for (var k = 0; k < body.length; k++) {
          var ch = body.charAt(k);
          res.flags[ch] = true;
          if (takesVal[ch]) {
            var rest = body.slice(k + 1);
            if (rest) res.opts[ch] = rest;
            else { res.opts[ch] = argv[i + 1] === undefined ? '' : String(argv[++i]); }
            consumed = true;
            break;
          }
        }
        if (consumed) continue;
        continue;
      }
      res.args.push(a);
    }
    return res;
  }
  function mkTarget(ctx, name) { return String(name).replace(/\/+$/, '') || '/'; }
  /* 单横杠短选项取值：`lvextend -L +50G dev` 里 +50G 是 -L 的值。
     不能用通用解析器——它会把 `-L` 当成布尔开关 a、把 `+50G` 当成设备名；
     也不能用 optValue()——它的匹配方式是完整字符串比较，认不出 `-L` 就是 `-L:` 的短写法。 */
  function shortOpt(argv, ch) {
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (!a || a.charAt(0) !== '-' || a.charAt(1) === '-') continue;
      if (a === '-' + ch) return argv[i + 1] === undefined ? null : String(argv[i + 1]);
      if (a.charAt(1) === ch && a.length > 2) return a.slice(2);
    }
    return null;
  }
  /* 目录占用：与 shell.js 的 du -s 同一套口径（4096 的目录本身 + 所有叶子） */
  function dirSize(node) {
    if (!node) return 0;
    if (node.type !== 'dir') return node.explicitSize !== undefined ? node.explicitSize : String(node.content || '').length;
    var total = 4096;
    Object.keys(node.children).forEach(function (k) { total += dirSize(node.children[k]); });
    return total;
  }

  function hostOf(ctx, HOST) { return HOST || (ctx && ctx.host) || U.baseHost; }  function hostname(ctx, HOST) { var h = hostOf(ctx, HOST); return h.hostname || 'web-prod-01'; }
  function kernel(ctx, HOST) { var h = hostOf(ctx, HOST); return h.kernel || '5.10.0-60.18.0.50.oe2203.x86_64'; }
  function nicName(ctx, HOST) { var h = hostOf(ctx, HOST); return (h.nic && h.nic.name) || 'eth0'; }

  function bar() { /* 分隔行，保持输出可读 */ return ''; }
  function note(lines, text) { lines.push(''); lines.push('提示：' + text); return lines; }
  function teaching(lines, text) { lines.push(''); lines.push('（教学环境：' + text + '）'); return lines; }

  /* 稳定伪随机：让"采样"类输出每次一致，便于断言与教学复现 */
  function rng(seed) {
    var s = 0;
    String(seed).split('').forEach(function (c) { s = (s * 131 + c.charCodeAt(0)) % 2147483647; });
    if (!s) s = 12345;
    return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  }
  function jitter(seed, base, pct, idx) {
    var r = rng(seed + '#' + idx);
    return (base * (1 + (r() * 2 - 1) * pct / 100));
  }

  /* ---- 16 进制 UUID：同一个设备每次都给同一个值，且与 termfs 里 /etc/fstab 写的一致 ---- */
  var KNOWN_UUID = {
    '/dev/vda1': '8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88',
    '/dev/vdb1': 'b41d9e05-2c7a-4f38-8a61-5d0e2f9b7c31'
  };
  function uuidOf(dev) {
    if (KNOWN_UUID[dev]) return KNOWN_UUID[dev];
    var h = 0, i;
    for (i = 0; i < dev.length; i++) h = (h * 131 + dev.charCodeAt(i)) % 4294967296;
    var hex = '';
    for (i = 0; i < 8; i++) { h = (h * 1103515245 + 12345) % 4294967296; hex += ('0000000' + h.toString(16)).slice(-8); }
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
  }

  /* ======================= 磁盘 / 分区 / 文件系统模型 =======================
     与 termfs 的 DISK_USAGE 完全同源：
       vda1 /            ext4  40G   已用 12G  可用 26G   32%
       vdb1 /data        ext4  200G  已用 189G 可用 1.2G  100%（inode 也用满）
       vdc1 /var/lib/docker ext4 100G 已用 18G 可用 77G   19%
     vdd 是后加的云盘（判题/扩容练习用），默认未分区。 */
  var DISKS = [
    { name: 'vda', major: 253, minor: 0, size: '40G', model: 'Virtual Disk', ro: 0, parts: [
      { name: 'vda1', major: 253, minor: 1, size: '40G', fstype: 'ext4', label: '', mount: '/', uuid: KNOWN_UUID['/dev/vda1'], boot: true }
    ] },
    { name: 'vdb', major: 253, minor: 16, size: '200G', model: 'Virtual Disk', ro: 0, parts: [
      { name: 'vdb1', major: 253, minor: 17, size: '200G', fstype: 'ext4', label: 'data', mount: '/data', uuid: KNOWN_UUID['/dev/vdb1'], boot: false }
    ] },
    { name: 'vdc', major: 253, minor: 32, size: '100G', model: 'Virtual Disk', ro: 0, parts: [
      { name: 'vdc1', major: 253, minor: 33, size: '100G', fstype: 'ext4', label: 'docker', mount: '/var/lib/docker', uuid: uuidOf('/dev/vdc1'), boot: false }
    ] },
    { name: 'vdd', major: 253, minor: 48, size: '500G', model: 'Virtual Disk', ro: 0, parts: [] }
  ];
  /* 用 /dev/vdb、/dev/vdc 之类的整盘名取盘 */
  function findDisk(name) {
    var n = String(name).replace('/dev/', '');
    for (var i = 0; i < DISKS.length; i++) if (DISKS[i].name === n) return DISKS[i];
    return null;
  }
  function allDevs() {
    var list = [];
    DISKS.forEach(function (d) {
      list.push({ dev: '/dev/' + d.name, disk: d, part: null, size: d.size });
      d.parts.forEach(function (p) { list.push({ dev: '/dev/' + p.name, disk: d, part: p, size: p.size }); });
    });
    return list;
  }
  /* 供 df / mount 等引用：与 termfs 数值一致的四舍五入版本 */
  function kvToHuman(kb) {
    if (kb >= 1073741824) return (kb / 1073741824).toFixed(1) + 'T';
    if (kb >= 1048576) return (kb / 1048576).toFixed(1) + 'G';
    if (kb >= 1024) return Math.round(kb / 1024) + 'M';
    return kb + 'K';
  }
  function sizeToBytes(s) {
    var m = String(s).match(/^([\d.]+)\s*([KMGTP]?)B?$/i);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    var mult = { '': 1, K: 1024, M: 1048576, G: 1073741824, T: 1099511627776, P: 1125899906842624 };
    return Math.round(n * (mult[m[2].toUpperCase()] || 1));
  }
  function sizeToKb(s) { return Math.round(sizeToBytes(s) / 1024); }
  function bytesToHuman(b) {
    var units = ['B', 'K', 'M', 'G', 'T'];
    var v = b, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? String(v) : v.toFixed(1)) + units[i];
  }
  /* 与 termfs.DISK_USAGE 一一对应，扩展列也不另造数字 */
  var FSROWS = [
    { dev: '/dev/vda1', mount: '/', fstype: 'ext4', sizeKb: 40 * 1048576, usedKb: 12582912, availKb: 27262976, pct: '32%', inodes: 2621440, iused: 312884, ifree: 2308556, ipct: '12%' },
    { dev: '/dev/vdb1', mount: '/data', fstype: 'ext4', sizeKb: 200 * 1048576, usedKb: 198180864, availKb: 1258291, pct: '100%', inodes: 13107200, iused: 13098233, ifree: 8967, ipct: '100%' },
    { dev: 'tmpfs', mount: '/dev/shm', fstype: 'tmpfs', sizeKb: 3978604, usedKb: 0, availKb: 3978604, pct: '0%', inodes: 1942620, iused: 1, ifree: 1942619, ipct: '1%' },
    { dev: '/dev/vdc1', mount: '/var/lib/docker', fstype: 'ext4', sizeKb: 100 * 1048576, usedKb: 18874368, availKb: 80740352, pct: '19%', inodes: 6553600, iused: 84210, ifree: 6469390, ipct: '2%' }
  ];
  function fsByDevOrMount(s) {
    if (!s) return null;
    var n = String(s);
    for (var i = 0; i < FSROWS.length; i++) if (FSROWS[i].dev === n || FSROWS[i].mount === n) return FSROWS[i];
    return null;
  }

  /* 内核日志（dmesg 的唯一数据源）：与 load=0.42/0.68/0.71、vdb %util 99.4%、
     mysqld 1.8G 内存、inode 100% 都是同一条故事线 */
  var KTIME = '1283' ;  /* 开机秒数前缀，配合下面的固定行 */
  var DMESG = [
    { t: 'Mon Mar 11 08:02:11 2024', l: 'Linux version 5.10.0-60.18.0.50.oe2203.x86_64 (abuild@euleros) (gcc version 10.3.1) #1 SMP Wed Mar 22 03:16:53 UTC 2023' },
    { t: 'Mon Mar 11 08:02:11 2024', l: 'Command line: BOOT_IMAGE=/vmlinuz-5.10.0-60.18.0.50.oe2203.x86_64 root=UUID=8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88 ro crashkernel=auto' },
    { t: 'Mon Mar 11 08:02:12 2024', l: '[    0.184220] Memory: 7c8a4c8K/8388608K available (14339K kernel code, 2048K rwdata, 5120K rodata, 2048K init)' },
    { t: 'Mon Mar 11 08:02:12 2024', l: '[    0.184442] smpboot: Total of 2 processors activated (10400.00 BogoMIPS)' },
    { t: 'Mon Mar 11 08:02:13 2024', l: '[    1.421880] virtio_blk virtio1: [vda] 83886080 512-byte logical blocks (42.9 GB/40.0 GiB)' },
    { t: 'Mon Mar 11 08:02:13 2024', l: '[    1.422114] virtio_blk virtio2: [vdb] 419430400 512-byte logical blocks (214 GB/200 GiB)' },
    { t: 'Mon Mar 11 08:02:13 2024', l: '[    1.422318] virtio_blk virtio3: [vdc] 209715200 512-byte logical blocks (107 GB/100 GiB)' },
    { t: 'Mon Mar 11 08:02:14 2024', l: '[    1.884210] EXT4-fs (vda1): mounted filesystem with ordered data mode. Opts: (null)' },
    { t: 'Mon Mar 11 08:02:15 2024', l: '[    2.118420] EXT4-fs (vdb1): mounted filesystem with ordered data mode. Opts: noatime' },
    { t: 'Mon Mar 11 08:02:15 2024', l: '[    2.184220] EXT4-fs (vdc1): mounted filesystem with ordered data mode. Opts: (null)' },
    { t: 'Mon Mar 11 08:02:18 2024', l: '[    5.184220] systemd[1]: Detected virtualization kvm.' },
    { t: 'Mon Mar 11 08:02:26 2024', l: '[   13.422118] IPv6: ADDRCONF(NETDEV_CHANGE): eth0: link becomes ready' },
    { t: 'Mon Mar 18 03:00:04 2024', l: '[1282901.184220] systemd[1]: Starting Daily Backup...' },
    { t: 'Mon Mar 18 03:12:49 2024', l: '[1283666.884210] systemd[1]: backup.service: Succeeded.' },
    { t: 'Mon Mar 18 08:12:03 2024', l: '[1282024.118420] audit: type=1006 audit(1710724323.114:8842): pid=18442 uid=0 old-auid=4294967295 auid=1000 tty=(none) ses=2 comm="sshd" exe="/usr/sbin/sshd" key="deploy"' },
    { t: 'Mon Mar 18 09:02:33 2024', l: '[1285054.224118] audit: type=1326 audit(1710727353.220:9218): auid=4294967295 uid=0 gid=0 ses=4294967295 pid=19009 comm="sshd" exe="/usr/sbin/sshd" sig=31 arch=c000003e' },
    { t: 'Mon Mar 18 09:41:12 2024', l: '[1283947.420000] docker0: port 3(veth9c1a2b) entered forwarding state' },
    { t: 'Mon Mar 18 09:41:18 2024', l: '[1287395.442118] vdb: 4 callbacks suppressed' },
    { t: 'Mon Mar 18 09:41:18 2024', l: '[1287395.442220] blk_update_request: I/O error, dev vdb, sector 184221184 op WRITE' },
    { t: 'Mon Mar 18 09:41:19 2024', l: '[1287396.118420] EXT4-fs warning (device vdb1): ext4_end_bio:344: I/O error 10 writing to inode 8842133 (offset 418418688 size 4096 starting block 5284184)' },
    { t: 'Mon Mar 18 09:42:07 2024', l: '[1287444.884220] EXT4-fs warning (device vdb1): ext4_dx_add_entry:2374: Directory (ino: 5284184) index full, will not add new entry' },
    { t: 'Mon Mar 18 09:43:03 2024', l: '[1287500.224118] EXT4-fs warning (device vdb1): ext4_iget:4873: inode #13098234: comm java: deleted inode referenced: 5284184' },
    { t: 'Mon Mar 18 09:45:12 2024', l: '[1287629.118420] TCP: request_sock_TCP: Possible SYN flooding on port 8080. Sending cookies.  Check SNMP counters.' },
    { t: 'Mon Mar 18 09:46:31 2024', l: '[1287708.442118] VFS: file-max limit 2097152 reached' },
    { t: 'Mon Mar 18 09:47:41 2024', l: '[1287778.118220] Out of memory: Killed process 2210 (mysqld) total-vm:1892444kB, anon-rss:1820440kB, file-rss:0kB, shmem-rss:0kB, UID:27 pgtables:3764kB oom_score_adj:0' },
    { t: 'Mon Mar 18 09:47:41 2024', l: '[1287778.220118] oom-kill:constraint=CONSTRAINT_NONE,nodemask=(null),cpuset=/,mems_allowed=0,global_oom,task_memcg=/system.slice/mysqld.service,task=mysqld,pid=2210,uid=27' },
    { t: 'Mon Mar 18 09:49:02 2024', l: '[1287859.884220] TCP: eth0: Driver has suspect GRO implementation, TCP performance may be compromised.' }
  ];

  /* /proc/meminfo 的真实值（termfs 里那份的完全一致副本，用于 free/vmstat 推算） */
  var MEM = { total: 7957184, free: 412036, avail: 1128404, buffers: 128764, cached: 1820440, swapTotal: 2097148, swapFree: 2097148 };

  /* 进程表：与 shell.js 里 ps/top/pgrep 共用的那一份保持一致（同一台机器只有一个事实） */
  var PROCS = [
    { user: 'root', pid: 1, ppid: 0, cpu: 0.0, mem: 0.1, rss: 13924, threads: 1, cmd: '/usr/lib/systemd/systemd --switched-root --system --deserialize 18', name: 'systemd' },
    { user: 'root', pid: 1180, ppid: 1, cpu: 0.0, mem: 0.1, rss: 11204, threads: 1, cmd: '/usr/sbin/sshd -D', name: 'sshd' },
    { user: 'root', pid: 1204, ppid: 1, cpu: 0.7, mem: 1.8, rss: 142804, threads: 18, cmd: '/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock', name: 'dockerd' },
    { user: 'root', pid: 1842, ppid: 1, cpu: 0.3, mem: 0.2, rss: 18604, threads: 1, cmd: 'nginx: master process /usr/sbin/nginx -c /etc/nginx/nginx.conf', name: 'nginx' },
    { user: 'nginx', pid: 1843, ppid: 1842, cpu: 0.4, mem: 0.2, rss: 18420, threads: 1, cmd: 'nginx: worker process', name: 'nginx' },
    { user: 'root', pid: 2210, ppid: 1, cpu: 2.1, mem: 22.8, rss: 1820440, threads: 48, cmd: '/usr/sbin/mysqld --defaults-file=/etc/my.cnf', name: 'mysqld' },
    { user: 'redis', pid: 3390, ppid: 1, cpu: 0.2, mem: 0.4, rss: 32884, threads: 6, cmd: '/usr/bin/redis-server 127.0.0.1:6379', name: 'redis-server' },
    { user: 'deploy', pid: 18442, ppid: 1, cpu: 68.4, mem: 7.7, rss: 612400, threads: 184, cmd: '/usr/bin/java -jar /opt/myapp/app.jar', name: 'java' },
    { user: 'root', pid: 4102, ppid: 1, cpu: 0.1, mem: 0.2, rss: 16420, threads: 8, cmd: '/usr/local/bin/node_exporter', name: 'node_exporter' },
    { user: 'root', pid: 88231, ppid: 88012, cpu: 0.0, mem: 0.0, rss: 4180, threads: 1, cmd: 'ps aux', name: 'ps' }
  ];
  function procByPid(pid) {
    var n = Number(pid);
    for (var i = 0; i < PROCS.length; i++) if (PROCS[i].pid === n) return PROCS[i];
    return null;
  }
  function procRows() {
    return PROCS.map(function (r) {
      var c = {};
      for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) c[k] = r[k];
      return c;
    });
  }
  var JVM_PID = 18442;

  /* 某个进程的 14 个线程（jstack / top -H / pidstat -t 共用同一组 TID） */
  var THREADS = [
    { tid: 18443, name: 'main', cpu: 0.1, state: 'WAITING', nid: '0x480b', top: false },
    { tid: 18445, name: 'Reference Handler', cpu: 0.0, state: 'WAITING', nid: '0x480d', top: false },
    { tid: 18447, name: 'G1 Young RemSet', cpu: 0.2, state: 'RUNNABLE', nid: '0x480f', top: false },
    { tid: 18449, name: 'http-nio-8080-exec-1', cpu: 1.4, state: 'RUNNABLE', nid: '0x4811', top: false },
    { tid: 18451, name: 'http-nio-8080-exec-4', cpu: 4.2, state: 'TIMED_WAITING', nid: '0x4813', top: false },
    { tid: 18453, name: 'http-nio-8080-exec-9', cpu: 2.8, state: 'RUNNABLE', nid: '0x4815', top: false },
    { tid: 18455, name: 'http-nio-8080-exec-12', cpu: 1.1, state: 'BLOCKED', nid: '0x4817', top: false },
    { tid: 18459, name: 'HikariPool-1 housekeeper', cpu: 0.6, state: 'TIMED_WAITING', nid: '0x481b', top: false },
    { tid: 18463, name: 'mysql-cj-abandoned-connection-cleanup', cpu: 0.0, state: 'TIMED_WAITING', nid: '0x481f', top: false },
    { tid: 18473, name: 'pool-2-thread-1', cpu: 31.2, state: 'RUNNABLE', nid: '0x4829', top: true },
    { tid: 18477, name: 'G1 Conc#1', cpu: 12.4, state: 'RUNNABLE', nid: '0x482d', top: false },
    { tid: 18481, name: 'VM Thread', cpu: 8.9, state: 'RUNNABLE', nid: '0x4831', top: false },
    { tid: 18485, name: 'C2 CompilerThread0', cpu: 5.2, state: 'RUNNABLE', nid: '0x4835', top: false },
    { tid: 18491, name: 'Service Thread', cpu: 0.3, state: 'RUNNABLE', nid: '0x483b', top: false }
  ];

  /* ======================= 已注册的命令（只在缺的时候补，绝不覆盖） =======================
     说明：extend() 对已存在的命令名静默跳过，所以这里显式列出 shell.js 已有的命令，
     避免"两边各写一份、行为还不一样"。 */
  var OPS = {};

  /* ---------- watcher / timeout / printf：示例里的通用外壳 ---------- */

  /* watch：真机是循环重画。教学终端里只跑第一次并说明 —— 但**必须真跑**，
     否则 `watch -n 5 cat /proc/mdstat` 这种示例会变成空输出。 */
  OPS.watch = function (argv, ctx, stdin, HOST) {
    var rest = [], interval = 2, i;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-n') { interval = Number(argv[++i]) || 2; continue; }
      var m = a.match(/^-n(\d+)$/);
      if (m) { interval = Number(m[1]); continue; }
      if (/^-[dtex]+$/.test(a) || a === '--color' || a === '--no-title') continue;
      rest.push(argv[i]);
    }
    if (!rest.length) return fail(['watch: no command specified', 'usage: watch [-n seconds] command']);
    if (!ctx || !ctx.shell || !ctx.shell.exec) return fail(['watch: 教学环境无法再次执行命令']);
    var r = ctx.shell.exec(rest.join(' '));
    var out = (r.out || []).slice();
    teaching(out, '真机上 watch 每 ' + interval + ' 秒重画一屏，Ctrl+C 结束；这里只执行了第一次');
    return { out: out, err: r.err || [], code: r.code };
  };

  /* timeout：把内层命令取出来执行 —— 教学环境没有真实计时器，
     但**不能**因此让 `timeout 10 strace ...` 整条变成 bash: timeout: command not found。 */
  OPS.timeout = function (argv, ctx, stdin, HOST) {
    var rest = [], i = 0;
    for (; i < argv.length; i++) {
      var a = String(argv[i]);
      if (/^-?\d+(\.\d+)?[smhd]?$/.test(a) && rest.length === 0) continue;
      /* ⚠️ `-s` / `--signal` 与 `-k` / `--kill-after` 是**带值选项**，必须连它的值一起吃掉。
         早先只把 `-s` 本身跳过去，于是 `timeout -s KILL 10 cmd` 里的 `KILL`
         被当成了要执行的命令 —— 报 `bash: KILL: command not found`，
         而 `timeout -s KILL` 恰好是"强杀挂死进程"最常用的写法。
         带值选项必须在"合并字母选项"之前判断，否则 `-s` 会被 `^-[ksv]+$` 抢先匹配。 */
      if (a === '-s' || a === '--signal' || a === '-k' || a === '--kill-after') { i++; continue; }
      if (/^-s.+/.test(a) || /^-k.+/.test(a)) continue;     /* `-sKILL` / `-k5` 贴写形式 */
      if (/^-[ksv]+$/.test(a)) continue;
      if (a === '--preserve-status' || a === '--foreground') continue;
      rest.push(a);
    }
    if (!rest.length) return fail(['timeout: missing operand', 'Try \'timeout --help\' for more information.']);
    if (!ctx || !ctx.shell || !ctx.shell.exec) return fail(['timeout: 教学环境无法再次执行命令']);
    return ctx.shell.exec(rest.join(' '));
  };

  /* printf：siege / sysctl / bpftrace 那几处的示例都靠它造文件 */
  OPS.printf = function (argv, ctx, stdin, HOST) {
    if (!argv.length) return fail(['printf: usage: printf format [arguments]']);
    var fmt = String(argv[0]);
    var rest = argv.slice(1);
    var out = '';
    var argi = 0;
    var i = 0;
    function nextArg() { return argi < rest.length ? rest[argi++] : ''; }
    while (i < fmt.length) {
      var ch = fmt.charAt(i);
      if (ch === '\\') {
        var nx = fmt.charAt(i + 1);
        if (nx === 'n') { out += '\n'; i += 2; continue; }
        if (nx === 't') { out += '\t'; i += 2; continue; }
        if (nx === 'r') { out += '\r'; i += 2; continue; }
        if (nx === '\\') { out += '\\'; i += 2; continue; }
        if (nx === '"') { out += '"'; i += 2; continue; }
        if (nx === '0') { out += '\0'; i += 2; continue; }
        out += nx; i += 2; continue;
      }
      if (ch === '%') {
        var spec = fmt.slice(i + 1).match(/^[-+ #0]*\d*(?:\.\d+)?[diouxXeEfgGsc%]/);
        if (!spec) { out += ch; i++; continue; }
        var s = spec[0];
        i += 1 + s.length;
        var conv = s.charAt(s.length - 1);
        if (conv === '%') { out += '%'; continue; }
        var val = nextArg();
        if (conv === 'd' || conv === 'i') out += String(parseInt(val, 10) || 0);
        else if (conv === 'x') out += (parseInt(val, 10) || 0).toString(16);
        else if (conv === 'X') out += (parseInt(val, 10) || 0).toString(16).toUpperCase();
        else if (conv === 'o') out += (parseInt(val, 10) || 0).toString(8);
        else if (conv === 'u') out += String(parseInt(val, 10) || 0);
        else if (conv === 'f' || conv === 'g' || conv === 'e') out += String(parseFloat(val) || 0);
        else out += String(val);
        continue;
      }
      out += ch; i++;
    }
    var lines = out.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return ok(lines);
  };

  /* ======================================================================
     2. 磁盘与存储
     ====================================================================== */

  /* ---------- lsblk：树状列块设备（shell.js 里的版本只认无参形态，这里补齐 -f/-o/-dp/设备名） ---------- */
  OPS.lsblk = function (argv, ctx, stdin, HOST) {
    /* ⚠ 不能用通用的 argsOf()：`lsblk -o NAME,SIZE /dev/vdb` 里 NAME,SIZE 是
       -o 的参数值，不是设备名。早先按"首字符不是 -"取值，于是 -o/-f/-t 的值
       全被当成设备，输出静默变成"什么都没过滤、列也没变"。 */
    var P = parseArgs(argv, 'o:,I:,e:,i:,n:,p:,x:,w:,f,m,p,d,a,b,D,E,J,N,S,T,V,h');
    var wantFs = !!P.flags.f;
    var pairs = !!P.flags.p;
    var noTree = !!P.flags.d;
    var only = P.args.filter(function (a) { return /^\/dev\//.test(String(a)); });
    var cols = P.opts.o || P.opts.I;
    if (only.length) {
      var unknown = only.filter(function (o) { return !findDisk(o); })[0];
      if (unknown) {
        return fail(['lsblk: ' + unknown + ': 没有这个块设备',
                     '（认盘用 `lsblk` 看全部，或 `grep -i vd /proc/partitions`；' +
                     '新挂的云盘如果不在列表里，先在控制台确认已挂载到这台机器）']);
      }
    }
    var out = [];
    if (cols) {
      var names = cols.split(',').map(function (s) { return s.trim().toUpperCase(); });
      var pick = function (d, p) {
        var vals = names.map(function (n) {
          switch (n) {
            case 'NAME': return (pairs ? '/dev/' : '') + (p ? p.name : d.name);
            case 'MAJ:MIN': return (p || d).major + ':' + (p || d).minor;
            case 'RM': return String(d.ro || 0);
            case 'SIZE': return p ? p.size : d.size;
            case 'RO': return '0';
            case 'TYPE': return p ? 'part' : 'disk';
            case 'MOUNTPOINT': return p ? (p.mount || '') : '';
            case 'MODEL': return d.model || '';
            case 'FSTYPE': return p ? (p.fstype || '') : '';
            case 'UUID': return p ? (p.uuid || '') : '';
            case 'LABEL': return p ? (p.label || '') : '';
            default: return '';
          }
        });
        return vals;
      };
      var widths = names.map(function (n) { return n.length + 2; });
      DISKS.forEach(function (d) {
        if (only.length && only.indexOf('/dev/' + d.name) === -1) return;
        [null].concat(noTree ? [] : d.parts).forEach(function (p) {
          var vals = pick(d, p);
          vals.forEach(function (v, i) { if (String(v).length + 1 > widths[i]) widths[i] = String(v).length + 1; });
        });
      });
      out.push(names.map(function (n, i) { return U.pad(n, widths[i]); }).join('').replace(/\s+$/, ''));
      DISKS.forEach(function (d) {
        if (only.length && only.indexOf('/dev/' + d.name) === -1) return;
        [null].concat(noTree ? [] : d.parts).forEach(function (p) {
          var vals = pick(d, p);
          var line = vals.map(function (v, i) { return U.pad(v, widths[i]); }).join('').replace(/\s+$/, '');
          out.push(p ? '└─' + line : line);
        });
        if (P.flags.m) out.push('');
      });
      return ok(out);
    }
    if (wantFs) {
      out.push('NAME   FSTYPE FSVER LABEL  UUID                                 FSAVAIL FSUSE% MOUNTPOINT');
      DISKS.forEach(function (d) {
        if (only.length && only.indexOf('/dev/' + d.name) === -1) return;
        out.push(U.pad(d.name, 7) + U.pad('', 7) + U.pad('', 6) + U.pad('', 7) + U.pad('', 37) + U.pad('', 9) + U.pad('', 7));
        d.parts.forEach(function (p) {
          var fs = fsByDevOrMount('/dev/' + p.name);
          var avail = fs ? bytesToHuman(fs.availKb * 1024) : '';
          var use = fs ? fs.pct : '';
          out.push('└─' + U.pad(p.name, 5) + U.pad(p.fstype || '', 7) + U.pad('1.0', 6) + U.pad(p.label || '', 7) + U.pad(p.uuid || '', 37) + U.pad(avail, 9) + U.pad(use, 7) + (p.mount || ''));
        });
      });
      return ok(out);
    }
    out.push('NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT');
    DISKS.forEach(function (d) {
      if (only.length && only.indexOf('/dev/' + d.name) === -1) return;
      out.push(U.pad(d.name, 7) + U.pad(d.major + ':' + d.minor, 7) + U.pad(String(d.ro), 3) + U.pad(d.size, 5) + U.pad('0', 3) + U.pad('disk', 5) + (noTree ? '' : ''));
      if (noTree) { if (P.flags.m) out.push(''); return; }
      d.parts.forEach(function (p) {
        out.push('└─' + U.pad(p.name, 5) + U.pad(p.major + ':' + p.minor, 7) + U.pad('0', 3) + U.pad(p.size, 5) + U.pad('0', 3) + U.pad('part', 5) + (p.mount || ''));
      });
      if (P.flags.m) out.push('');
    });
    return ok(out);
  };

  /* ---------- blkid：UUID / TYPE / LABEL ---------- */
  OPS.blkid = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 's:,o:,t:,l:,u:,g:');
    var field = P.opts.s || P.opts.l;
    var outMode = P.opts.o;
    var tagFilter = String(P.opts.t || '').trim();
    var targets = P.args;
    var rows = [];
    allDevs().forEach(function (e) {
      if (!e.part) return;
      if (targets.length && targets.indexOf(e.dev) === -1) return;
      if (tagFilter) {
        var m = tagFilter.match(/^([A-Z]+)=?(.*)$/);
        if (m && m[1]) {
          var v = m[1] === 'TYPE' ? e.part.fstype : (m[1] === 'LABEL' ? e.part.label : (m[1] === 'UUID' ? e.part.uuid : ''));
          if (m[2] === '') { if (!v) return; } else if (v !== m[2]) return;
        }
      }
      rows.push(e);
    });
    if (!targets.length && !tagFilter && !outMode) {
      /* 无参 = 列出所有已知文件系统的设备（真机行为） */
    }
    if (targets.length) {
      targets.forEach(function (t) {
        if (!allDevs().some(function (e) { return e.dev === t && e.part; })) {
          var bad = findDisk(t);
          if (bad) rows.push({ dev: t, disk: bad, part: { name: bad.name, fstype: '', label: '', uuid: '', mount: '' } });
          else rows.push({ dev: t, disk: null, part: null });
        } else if (!rows.some(function (r) { return r.dev === t; })) {
          rows.push(allDevs().filter(function (e) { return e.dev === t; })[0]);
        }
      });
    }
    var out = [], err = [];
    rows.forEach(function (e) {
      if (!e.part) { err.push('blkid: ' + e.dev + ': No such file or directory'); return; }
      if (!e.part.uuid && !e.part.fstype) {
        err.push('blkid: ' + e.dev + ': 设备上没有已知的文件系统（先 mkfs 再 blkid）');
        return;
      }
      if (outMode === 'value') {
        if (field === 'UUID') out.push(e.part.uuid);
        else if (field === 'TYPE') out.push(e.part.fstype);
        else if (field === 'LABEL') out.push(e.part.label || '');
        else out.push(e.part.uuid);
        return;
      }
      if (outMode === 'list' || outMode === 'full') out.push(e.dev + ': UUID="' + e.part.uuid + '" TYPE="' + e.part.fstype + '"');
      else {
        var line = e.dev + ': ' + (field && field !== 'UUID' ? '' : 'UUID="' + e.part.uuid + '" ') +
          (field && field !== 'TYPE' ? '' : 'TYPE="' + e.part.fstype + '"') +
          (e.part.label ? ' LABEL="' + e.part.label + '"' : '');
        out.push(line.replace(/\s+/g, ' '));
      }
    });
    if (err.length) return { out: out, err: err, code: 2 };
    return ok(out);
  };

  /* ---------- file -s：读裸设备的超级块信息 ---------- */
  var FILE_S = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, '-');
    var targets = P.args;
    if (!targets.length) return fail(['Usage: file [-bchikLlNnprsvz0] [--mime-encoding] [--mime-type] [-e testname] [-F separator] [-f namefile] [-m magicfiles] file ...']);
    var out = [], err = [];
    targets.forEach(function (t) {
      var d = findDisk(t);
      if (d) {
        var e0 = allDevs().filter(function (x) { return x.dev === t; })[0];
        if (e0 && e0.part && d.parts.length === 1) {
          out.push(t + ': Linux rev 1.0 ext4 filesystem data, UUID=' + e0.part.uuid +
            ', volume name "' + (e0.part.label || '') + '" (extents) (64bit) (large files) (huge files)');
          return;
        }
        out.push(t + ': block special');
        return;
      }
      if (/^\/dev\//.test(t)) {
        var e = allDevs().filter(function (x) { return x.dev === t; })[0];
        if (e && e.part) {
          if (e.part.fstype === 'swap') { out.push(t + ': Linux swap file, 4k page size, little endian, ...'); return; }
          out.push(t + ': Linux rev 1.0 ext4 filesystem data, UUID=' + e.part.uuid + ' (extents) (64bit) (large files) (huge files)');
          return;
        }
        err.push(t + ': cannot open `' + t + "' (No such file or directory)");
        return;
      }
      var abs = U.resolvePath(ctx.cwd, t);
      var node = U.findNode(ctx.root, abs);
      if (!node) { err.push(t + ': cannot open `' + t + "' (No such file or directory)"); return; }
      out.push(t + ': ASCII text');
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  /* ---------- fdisk：交互式分区工具（教学环境打印真实格式，但**不真的写盘**） ---------- */
  function fdiskTable(d, withParts) {
    var out = [];
    var sectors = sizeToBytes(d.size) / 512;
    out.push('Disk /dev/' + d.name + ': ' + d.size + ', ' + sectors + ' bytes, ' + (sectors / 2048) + ' sectors');
    out.push('Units: sectors of 1 * 512 = 512 bytes');
    out.push('Sector size (logical/physical): 512 bytes / 512 bytes');
    out.push('I/O size (minimum/optimal): 512 bytes / 512 bytes');
    out.push('Disklabel type: gpt');
    out.push('Disk identifier: 8842D1A8-4C1E-4C7B-9A21-0F3E6B8D51A4');
    out.push('');
    if (withParts) {
      if (!d.parts.length) {
        out.push('（该盘当前没有分区表条目 —— 新盘在 `fdisk -l` 里就是这样）');
        return out;
      }
      out.push('Device       Start       End   Sectors  Size Type');
      d.parts.forEach(function (p, i) {
        var start = 2048 + i * 4194304;
        var secs = Math.round(sizeToBytes(p.size) / 512);
        out.push(U.pad(p.name, 12) + U.padLeft(String(start), 11) + U.padLeft(String(start + secs - 1), 10) + U.padLeft(String(secs), 9) + U.padLeft(p.size, 6) + ' Linux filesystem');
      });
    }
    return out;
  }
  OPS.fdisk = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'b:,C:,H:,S:,u:,l,s,c,v,h,V');
    var list = !!P.flags.l;
    var targets = P.args.filter(function (a) { return /^\/dev\//.test(String(a)); });
    var out = [];
    /* 位置参数可以是整盘，也可以是分区（`fdisk -l /dev/vda1` 真机会打印它所属的整盘表） */
    var disks = targets.map(function (t) { return findDisk(t) || (findDisk(String(t).replace(/\d+$/, '')) || null); }).filter(Boolean);
    var uniq = [];
    disks.forEach(function (d) { if (uniq.indexOf(d) === -1) uniq.push(d); });
    if (list || !uniq.length) {
      var show = uniq.length ? uniq : DISKS;
      if (targets.length && !uniq.length) return fail(['fdisk: cannot open ' + targets[0] + ': No such file or directory']);
      show.forEach(function (d, i) {
        if (i) out.push('');
        fdiskTable(d, true).forEach(function (l) { out.push(l); });
      });
      return ok(out);
    }
    var dev = '/dev/' + uniq[0].name;
    var d = uniq[0];
    /* 交互模式：`echo -e "g\nn\n1\n\n\nw" | fdisk /dev/vdb` 这种写法必须给出与真机一致的提示语。
       ⚠ 这里是**高风险命令**：真机上 w 会立刻改写分区表。教学环境如实说明"模拟了什么、
       真机会发生什么"，绝不允许静默返回一个假的分区表。 */
    if (d) {
      out.push('Welcome to fdisk (util-linux 2.37.4).');
      out.push('Changes will remain in memory only, until you decide to write them.');
      out.push('Be careful before using the write command.');
      out.push('');
      out.push('Device does not contain a recognized partition table.');
      out.push('Created a new DOS disklabel with disk identifier 0x8842d1a8.');
      out.push('');
      out.push('Command (m for help): ');
      out.push('（教学环境不回放交互过程：真机上这里等你输入 n/p/w 等命令，');
      out.push('  输入 w 会**立即改写 ' + dev + ' 的分区表**。本站不模拟写盘，');
      out.push('  所以下面这些都不算数：磁盘 ' + dev + ' 现在仍是 ' + d.size + '，');
      out.push('  已有分区 ' + (d.parts.length ? d.parts.map(function (p) { return p.name; }).join(',') : '（无）') + ' 没有被改动）');
      out.push('');
      out.push('（批量初始化脚本请用 `parted -s ' + dev + ' mklabel gpt && parted -s ' + dev + ' mkpart data ext4 0% 100%`，');
      out.push('  或者先 `fdisk -l ' + dev + '` 看清盘再动手；写完必须 partprobe 让内核重读分区表）');
      return ok(out);
    }
    return fail(['fdisk: cannot open ' + dev + ': No such file or directory']);
  };

  /* ---------- parted：支持 GPT/MBR，2T 以上大云盘首选 ---------- */
  OPS.parted = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'a:,s,m,u:,l,f,h,V');
    var script = !!P.flags.s;
    var targets = P.args.filter(function (a) { return /^\/dev\//.test(String(a)); });
    if (!targets.length) return fail(['parted: 需要指定设备，例如 parted /dev/vdb print']);
    var dev = targets[0];
    var d = findDisk(dev);
    if (!d) return fail(['Error: Could not stat device ' + dev + ' - No such file or directory.']);
    var rest = P.args.filter(function (a) { return String(a) !== dev; });
    var cmd = rest[0] || 'print';
    var out = [];
    if (cmd === 'mklabel' || cmd === 'mktable') {
      var label = rest[1] || 'msdos';
      if (label !== 'gpt' && label !== 'msdos') return fail(['Error: Invalid partition table type "' + label + '" (gpt / msdos)']);
      /* 真机上 mklabel 就是"重写分区表"= 清空全盘分区；教学环境不模拟写盘。
         空盘：按真机语义成功；已有分区：如实拒绝（这是会毁数据的操作）。 */
      if (d.parts.length) {
        return fail(['Error: Partition(s) on ' + dev + ' are being used.',
                     '（' + dev + ' 上已经有分区 ' + d.parts.map(function (p) { return p.name; }).join(',') + '，',
                     '  `parted ' + dev + ' mklabel ' + label + '` 会**清空整块盘的分区表**；',
                     '  教学环境如实拒绝执行。真要重做请先 umount 并确认数据已备份）']);
      }
      out.push('Information: You may need to update /etc/fstab.');
      teaching(out, dev + ' 本来就是空盘，mklabel ' + label + ' 按真机语义成功；教学环境不写盘');
      return ok(out);
    }
    if (cmd === 'mkpart') {
      var fsT = rest[2] || 'ext4';
      var start = rest[3] || '0%', end = rest[4] || '100%';
      if (d.parts.length) {
        teaching(out, dev + ' 上已经有 ' + d.parts.map(function (p) { return p.name; }).join(',') +
          '，真机上再 mkpart 会多一个分区；教学环境的盘位是固定的，不新增设备节点');
        return ok(out);
      }
      teaching(out, '真机上这里会新建一个 ' + fsT + ' 分区覆盖 ' + start + '~' + end +
        '；教学环境不真的写分区表，' + dev + ' 仍是一块空盘');
      return ok(out);
    }
    if (cmd === 'rm') {
      var n = Number(rest[1]);
      if (!d.parts.length) return fail(['Error: Partition ' + n + ' does not exist on ' + dev + '.']);
      return fail(['Error: Partition(s) on ' + dev + ' are being used.',
                   '（rm 会删除分区条目 ' + dev + (n || '') + '，教学环境如实拒绝：先 umount、确认数据已备份再动手）']);
    }
    if (cmd === 'print' || cmd === 'p' || cmd === 'unit') {
      out.push('Model: Virtio Block Device (virtblk)');
      out.push('Disk ' + dev + ': ' + d.size);
      out.push('Sector size (logical/physical): 512B/512B');
      out.push('Partition Table: gpt');
      out.push('Disk Flags: ');
      out.push('');
      out.push('Number  Start   End     Size    File system  Name  Flags');
      if (!d.parts.length) out.push('（没有分区）');
      d.parts.forEach(function (p, i) {
        var startB = 1048576 + i * 4294967296;
        out.push(' ' + (i + 1) + '      ' + bytesToHuman(startB) + 'B  ' + bytesToHuman(startB + sizeToBytes(p.size)) + 'B  ' + p.size + '  ' + (p.fstype || '') + '      ' + (p.label || 'data') + (p.boot ? '  boot, esp' : ''));
      });
      return ok(out);
    }
    if (cmd === 'resizepart') {
      teaching(out, '真机上把分区 ' + (rest[1] || '') + ' 扩大到 ' + (rest[2] || '100%') + ' 后还要 resize2fs/xfs_growfs 扩文件系统');
      return ok(out);
    }
    return fail(['parted: invalid command \'' + cmd + '\'', "（支持的教学子命令：mklabel / mkpart / rm / print / resizepart）"]);
  };

  /* ---------- partprobe / partx：通知内核重读分区表 ---------- */
  OPS.partprobe = function (argv, ctx, stdin, HOST) {
    var summary = flag(argv, 's');
    var targets = argsOf(argv);
    var out = [];
    if (summary || !targets.length) {
      DISKS.forEach(function (d) {
        out.push('/dev/' + d.name + ': ' + (d.parts.length ? d.parts.map(function (p) { return p.name; }).join(' ') : '（无分区）'));
      });
      return ok(out);
    }
    targets.forEach(function (t) {
      var d = findDisk(t);
      if (!d) { out.push('Error: Invalid partition table on ' + t + ' -- wrong signature 0.'); return; }
      out.push('/dev/' + d.name + ': ' + (d.parts.length ? d.parts.map(function (p) { return p.name; }).join(' ') : '（无分区）'));
    });
    return ok(out);
  };
  OPS.partx = function (argv, ctx, stdin, HOST) {
    var del = flag(argv, 'd');
    var update = flag(argv, 'u');
    var show = flag(argv, 's') || flag(argv, 'l');
    var targets = argsOf(argv);
    if (!targets.length) return fail(['partx: 需要指定设备，例如 partx -u /dev/vdb']);
    var out = [], err = [];
    targets.forEach(function (t) {
      var d = findDisk(t);
      if (!d) { err.push('partx: ' + t + ': 无法读取分区表 (No such file or directory)'); return; }
      if (show) {
        out.push('# 1: 2048-419430399 (419428352 sectors, 200G)');
        d.parts.forEach(function (p, i) { out.push('# ' + (i + 1) + ': 2048-419430399 (419428352 sectors, ' + p.size + ')'); });
        return;
      }
      if (del) {
        err.push('partx: ' + t + ': 教学环境不会真的删除内核分区视图（' + d.parts.map(function (p) { return p.name; }).join(',') + ' 仍在）');
        return;
      }
      out.push('（教学环境：' + t + ' 的内核分区视图已是最新，' + (update ? 'partx -u' : 'partx') + ' 按真机语义成功）');
    });
    return err.length ? { out: out, err: err, code: 1 } : ok(out);
  };

  /* ---------- mkfs.ext4 / mkfs.xfs / mkswap：格式化类，全部按"危险命令"处理 ---------- */
  function mkfsLike(argv, ctx, kind) {
    var P = parseArgs(argv, 'L:,l:,m:,b:,I:,O:,E:,t:,n:,i:,F,f');
    var force = !!P.flags.F || !!P.flags.f;
    var label = shortOpt(argv, 'L') || shortOpt(argv, 'l') || P.opts.L || P.opts.l;
    var reserved = shortOpt(argv, 'm') || P.opts.m;
    var targets = P.args;
    if (!targets.length) return fail([kind + ': 需要指定设备，例如 ' + kind + ' /dev/vdb1']);
    var dev = targets[targets.length - 1];
    var d = findDisk(dev);
    var e = allDevs().filter(function (x) { return x.dev === dev; })[0];
    if (!d && !e) return fail([kind + ': cannot open ' + dev + ': No such file or directory']);
    /* ⚠ 必须用 `!e.part` 而不是 `!e`：整盘（如没分区的 /dev/vdd）在 allDevs() 里
       是一条 part=null 的记录，truthy 但 part 是 null —— 早先这里写成 `!e`，
       于是 mkfs /dev/vdd 直接抛 TypeError（命令抛异常 = 引擎 bug，绝不允许）。 */
    if ((!e || !e.part) && !force) {
      return fail([kind + ': ' + dev + ' is entire device, not just one partition!',
                   'Proceed anyway? (y,N) （教学环境不会在没有 -F/-f 的情况下格式化整盘；',
                   '  真机上对整盘 mkfs 会**清掉盘上所有分区的数据**，请先分区：' +
                   'parted -s ' + dev + ' mklabel gpt && parted -s ' + dev + ' mkpart data ext4 0% 100% && partprobe ' + dev + '）']);
    }
    /* 带 -F/-f 格式化整盘：真机允许，教学环境按同一语义构造一份"整盘"视图 */
    if (!e) e = { dev: dev, disk: d, part: { name: String(dev).replace('/dev/', ''), size: d.size, fstype: '', label: '', uuid: uuidOf(dev), mount: '' } };
    var existing = e.part.fstype;
    if (existing && !force) {
      return fail([kind + ': ' + dev + ' contains a ' + existing + ' file system',
                   'Proceed anyway? (y,N)  —— 需要显式加 ' + (kind === 'mkfs.ext4' ? '-F' : '-f') + ' 才会覆盖',
                   '（' + dev + ' 当前挂着 ' + (e.part.mount || '（未挂载）') + '，上面的数据会被全部清掉）']);
    }
    if (e.part.mount) {
      return fail([kind + ': ' + dev + ' is mounted at ' + e.part.mount + '; will not make a filesystem here!',
                   '（教学环境如实拒绝：真机上 mkfs 一个已挂载的设备会毁掉正在使用的文件系统）']);
    }
    var out = [];
    if (kind === 'mkfs.ext4') {
      var inodes = 13107200;
      out.push('mke2fs 1.46.4 (18-Aug-2021)');
      out.push('Creating filesystem with ' + Math.round(sizeToBytes(e.part.size) / 4096) + ' 4k blocks and ' + inodes + ' inodes');
      out.push('Filesystem UUID: ' + uuidOf(dev));
      out.push('Superblock backups stored on blocks: ');
      out.push('\t32768, 98304, 163840, 229376, 294912, 819200, 884736, 1605632, 2654208');
      out.push('');
      if (reserved) out.push('Reserving ' + reserved + '% of the filesystem for the super-user.');
      out.push('Allocating group tables: done                            ');
      out.push('Writing inode tables: done                            ');
      out.push('Creating journal (65536 blocks): done');
      out.push('Writing superblocks and filesystem accounting information: done');
      out.push('');
      teaching(out, '真机上这条命令已经**清空 ' + dev + ' 并写入新的 ext4 文件系统**；教学环境不写盘，' +
        (label ? '卷标 ' + label + ' ' : '') + '只是按格式回显');
      return ok(out);
    }
    if (kind === 'mkfs.xfs') {
      var ftype = has(argv, '-n') ? 'ftype=1' : 'ftype=0';
      var agcount = 8;
      out.push('meta-data=/dev/' + (e.part ? e.part.name : '') + '           isize=512    agcount=' + agcount + ', agsize=' + Math.round(sizeToBytes(e.part.size) / agcount / 1048576) + ' blks');
      out.push('         =                       sectsz=512   attr=2, projid32bit=1');
      out.push('         =                       crc=1        finobt=1, sparse=1, rmapbt=0');
      out.push('         =                       reflink=1    bigtime=0 inobtcount=0');
      out.push('data     =                       bsize=4096   blocks=' + Math.round(sizeToBytes(e.part.size) / 4096) + ', imaxpct=25');
      out.push('         =                       sunit=0      swidth=0 blks');
      out.push('naming   =version 2              bsize=4096   ascii-ci=0, ' + ftype);
      out.push('log      =internal log           bsize=4096   blocks=25600, version=2');
      out.push('         =                       sectsz=512   sunit=0 blks, lazy-count=1');
      out.push('realtime =none                   extsz=4096   blocks=0, rtextents=0');
      teaching(out, '真机上这条命令已经**清空 ' + dev + ' 并写入新的 XFS**；教学环境不写盘' +
        (label ? '（-L ' + label + ' 只是回显）' : ''));
      return ok(out);
    }
    return fail([kind + ': 教学环境未实现该文件系统类型']);
  }
  OPS['mkfs.ext4'] = function (argv, ctx, stdin, HOST) { return mkfsLike(argv, ctx, 'mkfs.ext4'); };
  OPS['mkfs.xfs'] = function (argv, ctx, stdin, HOST) { return mkfsLike(argv, ctx, 'mkfs.xfs'); };
  OPS.mke2fs = function (argv, ctx, stdin, HOST) { return mkfsLike(argv, ctx, 'mkfs.ext4'); };

  OPS.mkswap = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'L:,U:,p:,c:,v:,f');
    var label = shortOpt(argv, 'L') || P.opts.L;
    var uuid = shortOpt(argv, 'U') || P.opts.U;
    var targets = P.args;
    if (!targets.length) return fail(['mkswap: 需要指定设备或文件，例如 mkswap /dev/vdc1']);
    var t = targets[targets.length - 1];
    var d = findDisk(t);
    var e = allDevs().filter(function (x) { return x.dev === t; })[0];
    var out = [];
    if (d && !e) {
      return fail(['mkswap: ' + t + ': 需要是一个分区或文件，不能是整块盘（真机上 ' + t + ' 上已有分区表）']);
    }
    if (e && e.part && e.part.mount) {
      return fail(['mkswap: ' + t + ' 已挂载在 ' + e.part.mount + '，真机上这样做会毁掉文件系统；教学环境如实拒绝']);
    }
    var sizeKb = e ? sizeToKb(e.part.size) : 0;
    if (!e) {
      var abs = U.resolvePath(ctx.cwd, t);
      var node = U.findNode(ctx.root, abs);
      if (!node) return fail(['mkswap: cannot open ' + t + ': No such file or directory',
                              '（先用 fallocate -l 2G ' + t + ' && chmod 600 ' + t + ' 建出 swapfile）']);
      sizeKb = Math.max(1, Math.floor((node.explicitSize || String(node.content || '').length) / 1024));
    }
    out.push('Setting up swapspace version 1, size = ' + sizeKb + ' KiB');
    out.push('no label, UUID=' + (uuid || uuidOf(t + ':swap')));
    teaching(out, '真机上 mkswap 会**清掉 ' + t + ' 上的原有数据**并把开头写成 swap 签名；教学环境不写盘');
    return ok(out);
  };

  /* ---------- swapon / swapoff：swap 状态 ---------- */
  var SWAPS = [
    { filename: '/dev/vdc1', type: 'partition', size: 2097148, used: 0, prio: -2 },
    { filename: '/swapfile', type: 'file', size: 2097148, used: 0, prio: -3 }
  ];
  function swapRows() {
    return SWAPS.slice().sort(function (a, b) { return a.prio - b.prio; });
  }
  OPS.swapon = function (argv, ctx, stdin, HOST) {
    var show = has(argv, '-s') || has(argv, '--show') || has(argv, '--summary') || argv.length === 0;
    if (show) {
      var out = ['NAME      TYPE       SIZE USED PRIO'];
      swapRows().forEach(function (s) {
        out.push(U.pad(s.filename, 10) + U.pad(s.type, 11) + U.pad((s.size / 1048576).toFixed(1) + 'G', 5) + U.pad(String(s.used), 5) + s.prio);
      });
      out.push('');
      out.push('合计：' + (SWAPS.reduce(function (a, s) { return a + s.size; }, 0) / 1024 / 1024).toFixed(1) + ' GiB（/proc/meminfo 里 SwapTotal: ' + MEM.swapTotal + ' kB）');
      return ok(out);
    }
    var targets = argsOf(argv);
    if (has(argv, '-a')) {
      if (!has(argv, '--noheadings') && !has(argv, '-e')) {
        teaching([], '');
      }
      return ok([]);
    }
    if (!targets.length) return fail(['swapon: 需要指定设备/文件，或用 swapon --show / swapon -a']);
    var e = allDevs().filter(function (x) { return x.dev === targets[0]; })[0];
    if (e && e.part && e.part.fstype !== 'swap') {
      return fail(['swapon: ' + targets[0] + ': read swap header failed',
                   '（该分区现在是 ' + e.part.fstype + '，真机上要先 mkswap ' + targets[0] + '；',
                   '  对已挂载文件系统的分区执行 mkswap 会毁数据）']);
    }
    if (!e && targets[0] !== '/swapfile') {
      return fail(['swapon: ' + targets[0] + ': 找不到这个设备或文件']);
    }
    return ok([]);
  };
  OPS.swapoff = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (has(argv, '-a')) {
      return ok(['（教学环境：已按 fstab 关闭全部 swap。注意真机上 swapoff -a 会把已换出的页全部读回内存，',
                 '  内存不够时这一步会直接触发 OOM；Kubernetes 节点初始化前要求这么做）']);
    }
    if (!targets.length) return fail(['swapoff: 需要指定设备/文件，或用 swapoff -a']);
    if (targets[0] === '/data') {
      return fail(['swapoff: /data: 不是交换空间（/data 是 ext4 数据盘）']);
    }
    if (targets[0] === '/dev/vdb1') {
      return fail(['swapoff: /dev/vdb1: 不是交换空间（vdb1 是挂载在 /data 的 ext4）']);
    }
    if (targets[0] === '/swapfile' || targets[0] === '/dev/vdc1') {
      return ok(['（教学环境：' + targets[0] + ' 已关闭。真机上关闭前请确认剩余内存 > 已换出量）']);
    }
    return fail(['swapoff: ' + targets[0] + ': 找不到该交换设备']);
  };

  /* ---------- fallocate / truncate ---------- */
  OPS.fallocate = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'l:,o:,n:,p:,t:,x:,c:,z:,d:,w:,v,f');
    var len = P.opts.l;
    var useZero = !!P.flags.z;
    var targets = P.args;
    if (!len) return fail(['fallocate: no length specified', 'Try \'fallocate --help\' for more information.']);
    if (!targets.length) return fail(['fallocate: no filename specified']);
    var f = targets[targets.length - 1];
    if (f === '/swapfile') return fail(['fallocate: /swapfile: 文件不存在', '（先 fallocate -l 2G /swapfile 建出来，再 chmod 600 与 mkswap）']);
    var abs = U.resolvePath(ctx.cwd, f);
    var dir = U.findNode(ctx.root, U.parentOf(abs));
    if (!dir) return fail(['fallocate: ' + f + ': No such file or directory']);
    if (U.findNode(ctx.root, abs)) {
      if (useZero) return ok([]);
      return fail(['fallocate: ' + f + ': 文件已存在', '（fallocate 不会覆盖已有文件，先 rm 或换名字）']);
    }
    return ok([]);
  };
  OPS.truncate = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 's:,r:,o:');
    var size = P.opts.s || P.opts.r;
    var targets = P.args;
    if (!size) return fail(['truncate: 需要 -s 指定大小，例如 truncate -s 0 /data/app/logs/app.log']);
    if (!targets.length) return fail(['truncate: missing file operand']);
    var out = [];
    targets.forEach(function (f) {
      var abs = U.resolvePath(ctx.cwd, f);
      var node = U.findNode(ctx.root, abs);
      var kb = sizeToKb(size);
      if (/^\d+$/.test(String(size)) && size === '0') kb = 0;
      if (!node) {
        var dir = U.findNode(ctx.root, U.parentOf(abs));
        if (!dir || dir.type !== 'dir') { out.push('truncate: cannot open \'' + f + '\' for writing: No such file or directory'); return; }
        var nf = { type: 'file', name: U.baseName(abs), children: null, content: '', mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:51', target: null, explicitSize: kb * 1024 };
        dir.children[U.baseName(abs)] = nf;
        return;
      }
      if (node.type === 'dir') { out.push('truncate: cannot open \'' + f + '\' for writing: Is a directory'); return; }
      node.explicitSize = kb * 1024;
      node.mtime = '2024-03-18 09:51';
      if (kb === 0) node.content = '';
    });
    if (out.length) return { out: [], err: out, code: 1 };
    return ok([]);
  };

  /* ---------- mount：shell.js 里已有骨架；这里补齐 -t/-o/源目配对与"占位提示" ---------- */
  OPS.mount = function (argv, ctx, stdin, HOST) {
    /* 同样不能用 argsOf()：`mount -t iso9660 -o loop /tmp/x.iso /mnt/iso` 里
       iso9660 / loop 是选项值，不是设备名。 */
    var P = parseArgs(argv, 't:,o:,L:,U:,O:,T:,l,f,v,n,r,w,a,h,V');
    var opts = P.opts.o || '';
    var fsType = P.opts.t;
    var targets = P.args;
    if (!argv.length || P.flags.l) {
      return ok([
        '/dev/vda1 on / type ext4 (rw,relatime)',
        '/dev/vdb1 on /data type ext4 (rw,noatime)',
        '/dev/vdc1 on /var/lib/docker type ext4 (rw,relatime)',
        'proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)',
        'sysfs on /sys type sysfs (rw,nosuid,nodev,noexec,relatime)',
        'tmpfs on /dev/shm type tmpfs (rw,nosuid,nodev)',
        'sunrpc on /var/lib/nfs/rpc_pipefs type rpc_pipefs (rw,relatime)'
      ]);
    }
    if (P.flags.a) return ok([]);
    /* mount /dev/vdb1 /data */
    if (targets.length >= 2) {
      var src = targets[0], dst = targets[1];
      var e = allDevs().filter(function (x) { return x.dev === src; })[0];
      if (e && e.part && e.part.mount === dst && !/^remount/.test(opts)) {
        return fail(['mount: ' + dst + ': /dev/' + e.part.name + ' already mounted on ' + dst + '.']);
      }
      if (!e && /^\/dev\//.test(src)) return fail(['mount: ' + src + ': can\'t read superblock']);
      var dnode = U.findNode(ctx.root, U.resolvePath(ctx.cwd, dst));
      if (!dnode && !/^\/dev\//.test(src) && !/:/.test(src)) {
        return fail(['mount: ' + dst + ': mount point does not exist.']);
      }
      if (fsType === 'nfs' || fsType === 'nfs4' || /:/.test(src)) {
        return ok(['（教学环境：NFS 挂载需要真实网络。真机上这条命令把 ' + src + ' 挂到 ' + dst + '，',
                   '  fstab 里的持久化写法要带 _netdev,nofail，否则网络没起来会卡在开机）']);
      }
      if (/loop/.test(opts) || /\.iso$/.test(src)) {
        return ok(['（教学环境：loop 挂载 ISO 需要真实块设备。真机上 ' + dst + ' 里就能看到镜像内容了；',
                   '  做本地 yum 源时很常用，用完记得 umount ' + dst + '）']);
      }
      return ok([]);
    }
    if (/^remount/.test(opts)) return ok([]);
    if (targets.length === 1) {
      var one = targets[0];
      var r = fsByDevOrMount(String(one).replace(/\/+$/, '') || '/') || fsByDevOrMount(one);
      if (!r) {
        var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, one));
        if (node && node.type === 'dir') {
          return fail(['mount: ' + one + ': can\'t find in /etc/fstab.']);
        }
        return fail(['mount: ' + one + ': can\'t find in /etc/fstab.']);
      }
      return ok([r.dev + ' on ' + r.mount + ' type ' + r.fstype + ' (rw,relatime)']);
    }
    return fail(['mount: 参数不完整', 'usage: mount [-t fstype] [-o options] device dir']);
  };

  /* ---------- umount：busy 场景必须如实 ---------- */
  OPS.umount = function (argv, ctx, stdin, HOST) {
    var lazy = flag(argv, 'l');
    var force = flag(argv, 'f');
    var targets = argsOf(argv);
    if (!targets.length) return fail(['umount: bad usage', 'Try \'umount --help\' for more information.']);
    var t = targets[0];
    var key = t.replace(/\/+$/, '') || '/';
    var row = fsByDevOrMount(key);
    var busy = { '/data': true, '/': true, '/var/lib/docker': true };
    if (key === '/' || key === '/dev/vda1') {
      return fail(['umount: /: target is busy.',
                   '       (In some cases useful info about processes that',
                   '        use the device is found by lsof(8) or fuser(1).)',
                   '',
                   '（根文件系统无法卸载 —— 真机上唯一办法是进救援模式或重启）']);
    }
    if (busy[key]) {
      if (lazy) {
        return ok(['（教学环境：已执行 lazy 卸载。真机上 `umount -l ' + key + '` 只是把挂载点从目录树摘掉，',
                   '  占用的进程还能继续写旧盘，直到最后一个句柄关闭 —— 排障兜底可以，长期用会踩坑）']);
      }
      return fail(['umount: ' + key + ': target is busy.',
                   '        (In some cases useful info about processes that',
                   '         use the device is found by lsof(8) or fuser(1).)',
                   '',
                   '（在真机上要先找出占用者：',
                   '   fuser -m -v ' + key + '     看是哪些 PID',
                   '   lsof +D ' + key + '        看是哪些文件',
                   '   停掉服务或用 `umount -l ' + key + '` 做 lazy 卸载）']);
    }
    if (row) {
      if (!force) return ok([]);
      return fail(['umount: ' + key + ': 强制卸载仍然失败（正被 ' + (key === '/var/lib/docker' ? 'dockerd' : '进程') + ' 占用）']);
    }
    return fail(['umount: ' + t + ': not mounted.']);
  };

  /* ---------- ncdu：交互式占用分析（教学环境给出可读的扫描结论） ---------- */
  OPS.ncdu = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'o:,f:,e:,x,v,q,0,1,2');
    var exportFile = P.opts.o;
    var importFile = P.opts.f;
    var oneFs = !!P.flags.x;
    var targets = P.args;
    if (importFile) {
      var n = U.findNode(ctx.root, U.resolvePath(ctx.cwd, importFile));
      if (!n) return fail(['ncdu: ' + importFile + ': No such file or directory']);
      return ok(['ncdu 1.15.1 ~ Use the arrow keys to navigate',
                 '--- ' + importFile + ' ---',
                 '  189.0 GiB [##########] /data',
                 '   12.0 GiB [          ] /var',
                 '    8.8 GiB [          ] /usr',
                 '（教学环境：真机上这里进入可交互界面，↑↓ 选择、回车进入、d 删除、q 退出）']);
    }
    var dir = targets[0] || '.';
    var abs = U.resolvePath(ctx.cwd, dir);
    var node = U.findNode(ctx.root, abs);
    if (!node) return fail(['ncdu: ' + dir + ': No such file or directory']);
    if (exportFile) {
      /* -o 把扫描结果写成 JSON 文件（真机行为），这样 `ncdu -o f && ncdu -f f` 真能串起来 */
      var eAbs = U.resolvePath(ctx.cwd, exportFile);
      var eDir = U.findNode(ctx.root, U.parentOf(eAbs));
      if (!eDir || eDir.type !== 'dir') return fail(['ncdu: ' + exportFile + ': No such file or directory']);
      var total0 = dirSize(node);
      var payload = '[1,1,{"progname":"ncdu","progver":"1.15.1","timestamp":1710727860},\n' +
        '[{"name":"' + abs + '","asize":' + total0 + ',"dsize":' + total0 + ',"dev":64769,"ino":2}]]\n';
      var target = U.findNode(ctx.root, eAbs);
      if (target && target.type === 'file') { target.content = payload; target.mtime = '2024-03-18 09:51'; }
      else {
        var nf = { type: 'file', name: U.baseName(eAbs), children: null, content: payload, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:51', target: null };
        eDir.children[U.baseName(eAbs)] = nf;
      }
      return ok([]);
    }
    var lines = ['ncdu 1.15.1 ~ Use the arrow keys to navigate', '--- ' + abs + ' ---'];
    var rows = [];
    U.childrenSorted(node).forEach(function (name) {
      var c = node.children[name];
      var sz = c.type === 'dir' ? dirSize(c) : (c.explicitSize !== undefined ? c.explicitSize : String(c.content || '').length);
      rows.push([sz, name, c]);
    });
    rows.sort(function (a, b) { return b[0] - a[0]; });
    var total = rows.reduce(function (a, r) { return a + r[0]; }, 0) || 1;
    rows.slice(0, 10).forEach(function (r) {
      var pct = Math.round(r[0] / total * 100);
      var bars = Math.round(pct / 5);
      lines.push(U.padLeft(bytesToHuman(r[0]), 10) + ' [' + U.pad(new Array(bars + 1).join('#'), 20) + '] /' + r[1]);
    });
    lines.push('');
    lines.push('Total disk usage: ' + bytesToHuman(total) + '   Apparent size: ' + bytesToHuman(total) + '   Items: ' + rows.length);
    teaching(lines, oneFs ? '真机上 -x 保证不跨文件系统统计；这里进入可交互界面（↑↓ 选择、回车进入、d 删除、q 退出）'
      : '真机上这里是全屏可交互界面；教学环境用文本列出同一份扫描结果');
    return ok(lines);
  };

  /* ---------- growpart / resize2fs / xfs_growfs / xfs_info：扩容链路 ---------- */
  OPS.growpart = function (argv, ctx, stdin, HOST) {
    var dryRun = flag(argv, 'N') || has(argv, '--dry-run');
    var targets = argsOf(argv);
    if (targets.length < 2 && !has(argv, '--dry-run')) {
      return fail(['growpart: 用法：growpart <disk> <partition-number> 例如 growpart /dev/vdb 1']);
    }
    var dev = targets[0] || '/dev/vdb';
    var num = targets[1] || '1';
    var d = findDisk(dev);
    if (!d) return fail(['FAILED: /dev/.' + dev + ': 找不到该盘', 'growpart: 只有云盘支持在线扩容，先确认 lsblk 里能看到它']);
    if (!d.parts.length) return fail(['FAILED: ' + dev + ' 上没有分区表，请先 parted/mkfs']);
    var p = d.parts[Number(num) - 1];
    if (!p) return fail(['FAILED: ' + dev + ' 上没有第 ' + num + ' 个分区']);
    if (p.size === d.size) {
      return fail(['NOCHANGE: partition ' + num + ' is already the largest possible size (' + p.size +
                   '). The partition table has not been changed.']);
    }
    if (dryRun) return ok(['CHANGE: partition=1 start=2048 old: size=' + p.size + ' end=' + (sizeToBytes(d.size) / 512)]);
    p.size = d.size;
    var out = ['CHANGE: partition=1 start=2048 old: size=419428352 end=419430399',
               'CHANGED: partition=1 start=2048 old: size=419428352 end=' + (sizeToBytes(d.size) / 512 - 1) + ' new: size=' + (sizeToBytes(d.size) / 512 - 2048) + ' end=' + (sizeToBytes(d.size) / 512 - 1)];
    teaching(out, '真机上分区表已经改大，但**文件系统还没扩** —— 必须再 resize2fs（ext4）或 xfs_growfs（XFS）才能看到新容量');
    return ok(out);
  };
  OPS.resize2fs = function (argv, ctx, stdin, HOST) {
    var printMin = flag(argv, 'P');
    var targets = argsOf(argv);
    if (!targets.length) return fail(['resize2fs 1.46.4 (18-Aug-2021)', 'Usage: resize2fs [-d debug_flags] [-f] [-F] [-M] [-P] [-p] device [new_size]']);
    var dev = targets[0];
    var e = allDevs().filter(function (x) { return x.dev === dev; })[0];
    var isLv = /^\/dev\/vg-/.test(dev);
    if (!e && !isLv) return fail(['resize2fs: No such file or directory While opening ' + dev]);
    if (e && e.part.fstype !== 'ext4' && e.part.fstype !== 'ext2' && e.part.fstype !== 'ext3') {
      return fail(['resize2fs: Bad magic number in super-block while trying to open ' + dev,
                   '（' + dev + ' 是 ' + e.part.fstype + '，resize2fs 只能处理 ext2/3/4；XFS 用 xfs_growfs）']);
    }
    var cur = isLv ? '800G' : (e ? e.part.size : '200G');
    if (printMin) return ok(['resize2fs 1.46.4 (18-Aug-2021)', 'Estimated minimum size of the filesystem: 26112000 (4k blocks)']);
    var target = targets[1];
    if (target && sizeToBytes(target) < sizeToBytes(cur) && dev === '/dev/vdb1') {
      return fail(['resize2fs: /dev/vdb1 缩小到 ' + target + ' 属于高危操作',
                   '（真机上缩 ext4 必须：先 umount、再 e2fsck -f 强制检查、确认文件系统最小尺寸、',
                   '  顺序必须是"先缩文件系统、后缩 LV/分区"。教学环境如实拒绝，不做假的成功回显）']);
    }
    var out = ['resize2fs 1.46.4 (18-Aug-2021)'];
    if (e && e.part.mount) out.push('Filesystem at ' + dev + ' is mounted on ' + e.part.mount + '; on-line resizing required');
    out.push('old_desc_blocks = 25, new_desc_blocks = 50');
    out.push('The filesystem on ' + dev + ' is now ' + Math.round(sizeToBytes(target || cur) / 4096) + ' (4k) blocks long.');
    out.push('');
    teaching(out, '真机上到这里容量就生效了，接着 `df -h ' + (e && e.part.mount ? e.part.mount : '/data') + '` 复核；教学环境不写盘');
    return ok(out);
  };
  OPS.xfs_growfs = function (argv, ctx, stdin, HOST) {
    var dryRun = flag(argv, 'n');
    var targets = argsOf(argv);
    if (!targets.length) return fail(['xfs_growfs: 需要指定挂载点，例如 xfs_growfs /data',
                                      '（XFS 必须用挂载点而不是设备名 —— 这一点和 resize2fs 不同）']);
    var mp = targets[0];
    if (/^\/dev\//.test(mp)) {
      return fail(['xfs_growfs: ' + mp + ' is not a mounted XFS filesystem',
                   '（XFS 扩容的参数是**挂载点**：xfs_growfs /data）']);
    }
    var row = fsByDevOrMount(mp);
    if (!row) return fail(['xfs_growfs: ' + mp + ': 不是 XFS 挂载点（当前 / 与 /data 都是 ext4）']);
    if (row.mount === '/data' && row.fstype === 'ext4') {
      return fail(['xfs_growfs: ' + mp + ': 当前文件系统是 ext4，不是 XFS',
                   '（ext4 用 resize2fs；XFS 只能扩不能缩，也没有 resize2fs）']);
    }
    var out = ['meta-data=/dev/mapper/vg--data-lv--data  isize=512    agcount=8, agsize=26214400 blks',
               'data     =                       bsize=4096   blocks=' + Math.round(sizeToBytes('1T') / 4096) + ', imaxpct=25',
               'naming   =version 2              bsize=4096   ascii-ci=0, ftype=1'];
    if (dryRun) {
      out.push('');
      out.push('（-n 只预演：真机上不会做任何修改，这里显示的是扩容后的目标尺寸）');
      return ok(out);
    }
    out.push('data blocks changed from 209715200 to 262144000');
    teaching(out, '真机上 XFS 已经在线扩到新容量；教学环境不写盘');
    return ok(out);
  };
  OPS.xfs_info = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (!targets.length) return fail(['xfs_info: 需要指定挂载点，例如 xfs_info /data']);
    var mp = targets[0];
    var row = fsByDevOrMount(mp);
    if (!row) return fail(['xfs_info: ' + mp + ': 不是挂载点（No such file or directory）']);
    if (row.fstype !== 'xfs') {
      return fail(['xfs_info: ' + mp + ': 当前是 ' + row.fstype + ' 文件系统，不是 XFS',
                   '（/data 是 ext4：块信息用 `dumpe2fs -h ' + row.dev + '` 或 `tune2fs -l ' + row.dev + '` 看）']);
    }
    return ok([]);
  };

  /* ---------- tune2fs / dumpe2fs / e2fsck / fsck ---------- */
  OPS.tune2fs = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'c:,i:,m:,l:,L:,u:,g:,U:,e:,o:,O:,r:,s:,M:,C:,E:,I:,Q:,j,J:,E');
    var dev = P.args[0];
    if (!dev) return fail(['tune2fs 1.46.4 (18-Aug-2021)', 'Usage: tune2fs [-c max_mounts_count] [-i interval] [-m reserved_blocks_percent] device']);
    var e = allDevs().filter(function (x) { return x.dev === dev; })[0];
    var isLv = /^\/dev\/vg-/.test(dev);
    if (!e && !isLv) return fail(['tune2fs: No such file or directory while trying to open ' + dev]);
    if (e && e.part.fstype === 'xfs') return fail(['tune2fs: Bad magic number in super-block while trying to open ' + dev, '（XFS 不用 tune2fs）']);
    var r = P.opts.m !== undefined ? P.opts.m : null;
    var c = P.opts.c !== undefined ? P.opts.c : null;
    var iv = P.opts.i !== undefined ? P.opts.i : null;
    var out = ['tune2fs 1.46.4 (18-Aug-2021)'];
    if (r !== null) out.push('Setting reserved blocks percentage to ' + r + '% (' + Math.round(sizeToKb((e ? e.part.size : '200G')) * Number(r) / 100 * 1024 / 4096) + ' blocks)');
    if (c !== null) out.push('Setting maximal mount count to ' + c);
    if (iv !== null) out.push('Setting interval between checks to ' + (iv === '0' ? '0 seconds' : iv));
    if (out.length === 1) out.push('（没有需要修改的参数：可用 -m 调预留块、-c/-i 关自动 fsck）');
    teaching(out, '真机上这些改动已经写进 ' + dev + ' 的超级块并立即生效；教学环境不写盘');
    return ok(out);
  };
  OPS.dumpe2fs = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'b:,o:,x,h,f,i');
    var summary = !!P.flags.h;
    var targets = P.args;
    if (!targets.length) return fail(['dumpe2fs 1.46.4 (18-Aug-2021)', 'Usage: dumpe2fs [-h] device']);
    var dev = targets[0];
    var e = allDevs().filter(function (x) { return x.dev === dev; })[0];
    var isLv = /^\/dev\/vg-/.test(dev);
    if (!e && !isLv) return fail(['dumpe2fs: No such file or directory while trying to open ' + dev]);
    if (e && e.part.fstype === 'xfs') return fail(['dumpe2fs: Bad magic number in super-block while trying to open ' + dev, '（XFS 用 xfs_info，不是 dumpe2fs）']);
    var sizeBytes = sizeToBytes(e ? e.part.size : '200G');
    var blocks = Math.round(sizeBytes / 4096);
    var out = [
      'Filesystem volume name:   ' + (e && e.part.label ? e.part.label : '<none>'),
      'Last mounted on:          ' + (e && e.part.mount ? e.part.mount : '<not available>'),
      'Filesystem UUID:          ' + (e ? e.part.uuid : uuidOf(dev)),
      'Filesystem magic number:  0xEF53',
      'Filesystem state:         clean',
      'Errors behavior:          Continue',
      'Filesystem OS type:       Linux',
      'Inode count:              ' + (e && e.part.name === 'vdb1' ? 13107200 : Math.round(sizeBytes / 16384)),
      'Block count:              ' + blocks,
      'Reserved block count:     ' + Math.round(blocks * 0.05),
      'Free blocks:              ' + (e && e.part.name === 'vdb1' ? 157286 : Math.round(blocks * 0.06)),
      'Free inodes:              ' + (e && e.part.name === 'vdb1' ? 8967 : Math.round(sizeBytes / 16384 * 0.88)),
      'First block:              0',
      'Block size:               4096',
      'Filesystem flags:         signed_directory_hash ',
      'Default mount options:    user_xattr acl',
      'Filesystem features:      has_journal ext_attr resize_inode dir_index filetype extent 64bit flex_bg sparse_super large_file huge_file dir_nlink extra_isize metadata_csum',
      'Mount count:              18',
      'Maximum mount count:      -1',
      'Last checked:             Mon Mar 11 08:02:14 2024',
      'Check interval:           0 (<none>)',
      'Lifetime writes:          4 TB'
    ];
    if (!summary) {
      out.push('');
      out.push('Group 0: (Blocks 0-' + (blocks - 1) + ') [ITABLE_ZEROED]');
      out.push('  Primary superblock at 0, Group descriptors at 1-50');
      out.push('  Reserved GDT blocks at 51-561');
      out.push('  Block bitmap at 562 (+562), Inode bitmap at 578 (+578)');
      out.push('  Inode table at 594-1857 (+594)');
      out.push('');
      out.push('Backup superblock at 32768, Group descriptors at 32769-32818');
      out.push('Backup superblock at 98304, Group descriptors at 98305-98354');
      out.push('Backup superblock at 163840, Group descriptors at 163841-163890');
    }
    return ok(out);
  };
  OPS.e2fsck = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'b:,B:,C:,j:,E:,L:,z:,p,n,y,c,f,t,D,F,l');
    var backup = shortOpt(argv, 'b') || P.opts.b;
    var bs = shortOpt(argv, 'B') || P.opts.B;
    var targets = P.args;
    if (!targets.length) return fail(['e2fsck 1.46.4 (18-Aug-2021)', 'Usage: e2fsck [-pnycftD] [-b superblock] [-B blocksize] device']);
    var dev = targets[0];
    var e = allDevs().filter(function (x) { return x.dev === dev; })[0];
    var isLv = /^\/dev\/vg-/.test(dev);
    if (!e && !isLv) return fail(['e2fsck: No such file or directory while trying to open ' + dev,
                                  '（先确认设备存在：lsblk /dev/vdb）']);
    if (e && e.part.mount) {
      return fail(['e2fsck 1.46.4 (18-Aug-2021)',
                   'e2fsck: Cannot continue, aborting.',
                   '',
                   dev + ' is mounted' + (e.part.name === 'vdb1' ? ' (on ' + e.part.mount + ')' : '') + '.',
                   '（真机上对已挂载文件系统做 e2fsck 会毁数据，必须 umount 后执行；',
                   '  根分区需进救援模式或加 -f 强制只读检查）']);
    }
    if (backup && !bs) {
      return fail(['e2fsck: 用 -b 指定备用超级块时必须同时给 -B 块大小',
                   '（例：e2fsck -b 32768 -B 4096 /dev/vdb1，块大小要与 mkfs 时一致）']);
    }
    var out = ['e2fsck 1.46.4 (18-Aug-2021)'];
    if (backup) out.push(dev + ' was not cleanly unmounted, check forced.');
    out.push('Pass 1: Checking inodes, blocks, and sizes');
    out.push('Pass 2: Checking directory structure');
    out.push('Pass 3: Checking directory connectivity');
    out.push('Pass 4: Checking reference counts');
    out.push('Pass 5: Checking group summary information');
    out.push(dev + ': ' + (e ? (e.part.name === 'vdb1' ? '13098233' : '312884') : '312884') + '/' +
      (e && e.part.name === 'vdb1' ? '13107200' : '2621440') + ' files (' +
      (e && e.part.name === 'vdb1' ? '21842' : '12') + '.1% non-contiguous), ' +
      (e && e.part.name === 'vdb1' ? '129483520' : '3088384') + '/' + Math.round(sizeToBytes(e ? e.part.size : '40G') / 4096) + ' blocks');
    teaching(out, '真机上 e2fsck 会**真的修改文件系统**去修错；教学环境只做只读检查的格式回显');
    return ok(out);
  };

  /* ---------- LVM 三层：PV / VG / LV ---------- */
  var VG = { name: 'vg-data', sizeG: 1000, freeG: 200, peSize: 4, pvCount: 2 };
  var PVS = [
    { name: '/dev/vdb', vg: 'vg-data', sizeG: 800, freeG: 0, pe: 204800 },
    { name: '/dev/vdc', vg: 'vg-data', sizeG: 200, freeG: 200, pe: 51200 }
  ];
  var LVS = [
    { name: 'lv-data', vg: 'vg-data', sizeG: 800, path: '/dev/vg-data/lv-data', mount: '/data' }
  ];
  function lvRow(dev) {
    var parts = String(dev).split('/');
    if (parts.length < 4) return null;
    var vg = parts[2].replace(/^mapper$/, 'vg-data');
    var lv = parts[3];
    for (var i = 0; i < LVS.length; i++) if (LVS[i].name === lv) return LVS[i];
    return null;
  }
  OPS.pvs = function (argv, ctx, stdin, HOST) {
    var cols = optValue(argv, '-o') || optValue(argv, '--options');
    var names = cols ? cols.split(',').map(function (s) { return s.trim(); }) : ['pv_name', 'vg_name', 'pv_fmt', 'pv_size', 'pv_free'];
    var out = [names.map(function (n) { return n.toUpperCase(); }).join('  ')];
    PVS.forEach(function (pv) {
      var vals = names.map(function (n) {
        switch (n) {
          case 'pv_name': return pv.name;
          case 'vg_name': return pv.vg;
          case 'pv_fmt': return 'lvm2';
          case 'pv_size': return '<' + pv.sizeG + 'g';
          case 'pv_free': return '<' + pv.freeG + 'g';
          case 'pv_used': return '<' + (pv.sizeG - pv.freeG) + 'g';
          case 'pv_uuid': return uuidOf(pv.name).replace(/-/g, '').slice(0, 6) + '-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx';
          default: return '';
        }
      });
      out.push(vals.join('  '));
    });
    return ok(out);
  };
  OPS.pvdisplay = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (!targets.length) return fail(['pvdisplay: 需要指定 PV，例如 pvdisplay /dev/vdb']);
    var dev = targets[0];
    var pv = null;
    for (var i = 0; i < PVS.length; i++) if (PVS[i].name === dev) pv = PVS[i];
    if (!pv) return fail(['  Failed to find physical volume "' + dev + '".',
                          '（先用 pvcreate ' + dev + ' 初始化；真机上这一步会**清掉盘上的分区表**）']);
    return ok([
      '  --- Physical volume ---',
      '  PV Name               ' + pv.name,
      '  VG Name               ' + pv.vg,
      '  PV Size               ' + pv.sizeG.toFixed(2) + ' GiB / not usable 4.00 MiB',
      '  Allocatable           yes',
      '  PE Size               4.00 MiB',
      '  Total PE              ' + pv.pe,
      '  Free PE               ' + Math.round(pv.freeG * 256),
      '  Allocated PE           ' + Math.round((pv.sizeG - pv.freeG) * 256),
      '  PV UUID               ' + uuidOf(dev)
    ]);
  };
  OPS.pvcreate = function (argv, ctx, stdin, HOST) {
    var force = flag(argv, 'f') || has(argv, '--force') || has(argv, '-y') || has(argv, '--yes');
    var targets = argsOf(argv);
    if (!targets.length) return fail(['pvcreate: 需要指定设备，例如 pvcreate /dev/vdb']);
    var dev = targets[0];
    var d = findDisk(dev);
    if (!d) return fail(['  Device "' + dev + '" not found.']);
    if (d.parts.length && !force) {
      return fail(['  Can\'t initialize physical volume "' + dev + '" of volume group "vg-data" without -ff',
                   '  /dev/' + d.name + ' 上有分区 ' + d.parts.map(function (p) { return p.name; }).join(',') +
                   (d.parts[0].mount ? '（' + d.parts[0].mount + ' 正在使用）' : ''),
                   '（真机上 pvcreate 会**清掉目标上的分区表/文件系统签名**；',
                   '  确认无数据后加 -ff -y，例如 pvcreate -ff -y ' + dev + '）']);
    }
    teaching([], '');
    return ok(['  Physical volume "' + dev + '" successfully created.']);
  };
  OPS.pvremove = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (!targets.length) return fail(['pvremove: 需要指定设备']);
    var pv = null;
    for (var i = 0; i < PVS.length; i++) if (PVS[i].name === targets[0]) pv = PVS[i];
    if (!pv) return fail(['  Device "' + targets[0] + '" has no lvm2 signature.']);
    if (pv.freeG !== pv.sizeG) {
      return fail(['  Can\'t pvremove "' + targets[0] + '" with allocated physical extents.',
                   '（它还在卷组 ' + pv.vg + ' 里，先 vgreduce 或 vgremove）']);
    }
    return ok(['  Labels on physical volume "' + targets[0] + '" successfully wiped.']);
  };
  OPS.vgs = function (argv, ctx, stdin, HOST) {
    var cols = optValue(argv, '-o') || optValue(argv, '--options');
    var names = cols ? cols.split(',').map(function (s) { return s.trim(); }) : ['vg_name', 'pv_count', 'lv_count', 'snap_count', 'vg_attr', 'vg_size', 'vg_free'];
    var out = [names.map(function (n) { return n.toUpperCase(); }).join('  ')];
    var vals = names.map(function (n) {
      switch (n) {
        case 'vg_name': return VG.name;
        case 'pv_count': return String(VG.pvCount);
        case 'lv_count': return String(LVS.length);
        case 'snap_count': return '0';
        case 'vg_attr': return 'wz--n-';
        case 'vg_size': return '<' + VG.sizeG + 'g';
        case 'vg_free': return '<' + VG.freeG + 'g';
        case 'vg_uuid': return uuidOf('vg:' + VG.name);
        default: return '';
      }
    });
    out.push(vals.join('  '));
    return ok(out);
  };
  OPS.lvs = function (argv, ctx, stdin, HOST) {
    var cols = optValue(argv, '-o') || optValue(argv, '--options');
    var names = cols ? cols.split(',').map(function (s) { return s.trim(); }) : ['lv_name', 'vg_name', 'lvm2_attr', 'l_size', 'pool'];
    var out = [names.map(function (n) { return n.toUpperCase(); }).join('  ')];
    LVS.forEach(function (lv) {
      var vals = names.map(function (n) {
        switch (n) {
          case 'lv_name': return lv.name;
          case 'vg_name': return lv.vg;
          case 'lv_size': return '<' + lv.sizeG + 'g';
          case 'lv_path': return lv.path;
          case 'lv_attr': case 'lvm2_attr': return '-wi-ao----';
          case 'vg_free': return '<' + VG.freeG + 'g';
          case 'lv_uuid': return uuidOf(lv.path);
          case 'pool': return '';
          case 'lv_active': return 'active';
          case 'lv_mount': return lv.mount || '';
          default: return '';
        }
      });
      out.push(vals.join('  '));
    });
    return ok(out);
  };
  OPS.vgcreate = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (targets.length < 2) return fail(['  Volume group name and physical volume(s) required.',
                                         '  用法：vgcreate vg-data /dev/vdb']);
    var name = targets[0];
    var pvs = targets.slice(1);
    if (name === VG.name) {
      return fail(['  Volume group "' + name + '" already exists in the system.',
                   '（已有卷组：' + VG.name + '，可用 vgs 查看）']);
    }
    if (!findDisk(pvs[0])) return fail(['  Device "' + pvs[0] + '" not found.']);
    var totalG = pvs.reduce(function (a, d) { var k = findDisk(d); return a + (k ? parseFloat(k.size) : 0); }, 0);
    var out = ['  Volume group "' + name + '" successfully created',
               '  WARNING: 真机上这一步会把 ' + pvs.join('、') + ' 标记为 PV；'];
    out.push('（教学环境不修改盘：已存在的卷组仍是 ' + VG.name + '，' + VG.sizeG + 'G / 剩 ' + VG.freeG + 'G）');
    return ok(out);
  };
  OPS.vgextend = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (targets.length < 2) return fail(['  Volume group name and physical volume(s) required.',
                                         '  用法：vgextend vg-data /dev/vdc']);
    if (targets[0] !== VG.name) return fail(['  Volume group "' + targets[0] + '" not found.']);
    var dev = targets[1];
    var d = findDisk(dev);
    if (!d) return fail(['  Device "' + dev + '" not found.',
                         '（先确认新盘已经被内核识别：lsblk，必要时 partprobe ' + dev + '）']);
    if (d.parts.length && !has(argv, '-f')) {
      return fail(['  Physical volume "' + dev + '" is already in volume group or has partitions.',
                   '（' + dev + ' 上有分区 ' + d.parts.map(function (p) { return p.name; }).join(',') + '，',
                   '  真机上 vgextend 要求它先是 PV：pvcreate ' + dev + '，会清掉分区表）']);
    }
    var out = ['  Volume group "' + VG.name + '" successfully extended'];
    teaching(out, '真机上 ' + VG.name + ' 已经从 ' + VG.sizeG + 'G 变成 ' + (VG.sizeG + parseFloat(d.size)) +
      'G，可用 lvextend 把它分给 LV；教学环境不修改卷组');
    return ok(out);
  };
  OPS.lvcreate = function (argv, ctx, stdin, HOST) {
    var name = shortOpt(argv, 'n') || optValue(argv, '--name');
    var extents = shortOpt(argv, 'l') || optValue(argv, '--extents');
    var size = shortOpt(argv, 'L') || optValue(argv, '--size');
    var targets = argv.filter(function (a) { return String(a).charAt(0) !== '-' && !/^\+?[\d.]+/.test(String(a)); });
    var vg = targets[targets.length - 1];
    if (!name) return fail(['  Please specify a logical volume name with -n.', '  用法：lvcreate -n lv-data -l 100%FREE vg-data']);
    if (!vg) return fail(['  Please specify a volume group.', '  用法：lvcreate -n lv-data -l 100%FREE vg-data']);
    if (vg !== VG.name && vg !== 'vg-data') return fail(['  Volume group "' + vg + '" not found.']);
    for (var i = 0; i < LVS.length; i++) {
      if (LVS[i].name === name) return fail(['  Logical Volume "' + name + '" already exists in volume group "' + vg + '".']);
    }
    var want = extents && /100%FREE/.test(extents) ? VG.freeG : (size ? parseFloat(size) : VG.freeG);
    if (want > VG.freeG) {
      return fail(['  Volume group "' + vg + '" has insufficient free space (' + VG.freeG + ' extents): ' + want + ' required.',
                   '（卷组只剩 ' + VG.freeG + 'G；先 vgextend 加盘，或把 LV 建小一点）']);
    }
    var out = ['  Logical volume "' + name + '" created.'];
    teaching(out, '真机上已经创建 ' + name + '（' + want + 'G），接着 mkfs 才能挂载；教学环境不修改卷组');
    return ok(out);
  };
  function lvResolve(dev) {
    return lvRow(dev);
  }
  OPS.lvextend = function (argv, ctx, stdin, HOST) {
    var resizefs = flag(argv, 'r') || has(argv, '--resizefs');
    var size = shortOpt(argv, 'L') || optValue(argv, '--size');
    var extents = shortOpt(argv, 'l') || optValue(argv, '--extents');
    var targets = argv.filter(function (a) { return /^\/dev\//.test(String(a)); });
    if (!targets.length) return fail(['  Please specify a logical volume with -L/-l.', '  用法：lvextend -L +50G -r /dev/vg-data/lv-data']);
    if (!size && !extents) return fail(['  Please specify either size or extents.', '  用法：lvextend -L +50G -r /dev/vg-data/lv-data']);
    var dev = targets[0];
    var lv = lvResolve(dev);
    if (!lv) {
      if (/^\/dev\/vdb/.test(dev)) {
        return fail(['  "/dev/' + dev.replace('/dev/', '') + '" is not a logical volume.',
                     '（vdb 系列是普通分区（/data 就挂在 /dev/vdb1）—— 它不能 lvextend；',
                     '  普通分区扩容走 growpart + resize2fs，LVM 才用 lvextend）']);
      }
      return fail(['  Failed to find logical volume "' + dev + '"']);
    }
    var add = 0;
    if (size) add = /^\+/.test(size) ? parseFloat(size.slice(1)) : parseFloat(size) - lv.sizeG;
    else if (extents && /^\+100%FREE/.test(extents)) add = VG.freeG;
    if (add > VG.freeG) {
      return fail(['  Insufficient free space: ' + add + ' extents needed, but only ' + VG.freeG + ' available',
                   '（卷组 ' + VG.name + ' 只剩 ' + VG.freeG + 'G。真机上的标准动作：先 vgextend 把新盘加进卷组，再 lvextend）']);
    }
    var out = ['  Size of logical volume ' + lv.vg + '/' + lv.name + ' changed from ' + lv.sizeG.toFixed(2) + ' GiB (' + (lv.sizeG * 256) + ' extents) to ' + (lv.sizeG + add).toFixed(2) + ' GiB (' + ((lv.sizeG + add) * 256) + ' extents).',
               '  Logical volume ' + lv.vg + '/' + lv.name + ' successfully resized.'];
    if (resizefs) {
      out.push('  Extending file system on ' + dev + ' ...');
      out.push('  resize2fs 1.46.4 (18-Aug-2021)');
      out.push('  The filesystem on ' + dev + ' is now ' + Math.round(sizeToBytes((lv.sizeG + add) + 'G') / 4096) + ' (4k) blocks long.');
      out.push('');
      out.push('（-r 让 lvextend 顺手把文件系统也扩了 —— 这是最不容易出错的一步到位写法）');
    } else {
      teaching(out, '真机上 LV 已经变大，但**文件系统还没扩**：ext4 要再 resize2fs ' + dev + '，XFS 要再 xfs_growfs /data');
    }
    return ok(out);
  };
  OPS.lvreduce = function (argv, ctx, stdin, HOST) {
    var size = shortOpt(argv, 'L') || optValue(argv, '--size');
    var force = flag(argv, 'f') || has(argv, '--force');
    var targets = argv.filter(function (a) { return /^\/dev\//.test(String(a)); });
    if (!targets.length || !size) return fail(['  Please specify a logical volume and size.', '  用法：lvreduce -L 50G /dev/vg-data/lv-data']);
    var lv = lvResolve(targets[0]);
    if (!lv) return fail(['  Failed to find logical volume "' + targets[0] + '"']);
    if (lv.mount) {
      return fail(['  Logical volume ' + lv.vg + '/' + lv.name + ' is in use.',
                   '（' + lv.path + ' 挂在 ' + lv.mount + ' 上。真机上缩容**顺序错就是数据全毁**：',
                   '   ① umount ' + lv.mount + '  ② e2fsck -f ' + lv.path + '  ③ resize2fs ' + lv.path + ' ' + size + '  ④ 最后才 lvreduce -L ' + size,
                   '  教学环境如实拒绝执行）']);
    }
    if (!force) {
      return fail(['  WARNING: Reducing active logical volume to ' + size,
                   '  THIS MAY DESTROY YOUR DATA (filesystem etc.)',
                   'Do you really want to reduce ' + lv.vg + '/' + lv.name + '? [y/n]: ',
                   '（需要显式同意；教学环境不会在没有 -f 的情况下缩容）']);
    }
    return ok(['  Size of logical volume ' + lv.vg + '/' + lv.name + ' changed from ' + lv.sizeG.toFixed(2) + ' GiB to ' + parseFloat(size) + '.00 GiB.']);
  };
  OPS.lvremove = function (argv, ctx, stdin, HOST) {
    var test = has(argv, '--test');
    var targets = argsOf(argv);
    if (!targets.length) return fail(['  Please specify a logical volume.', '  用法：lvremove /dev/vg-data/lv-data']);
    var lv = lvResolve(targets[0]);
    if (!lv) return fail(['  Failed to find logical volume "' + targets[0] + '"']);
    if (lv.mount && !test) {
      return fail(['  Logical volume ' + lv.vg + '/' + lv.name + ' is in use.',
                   '（' + lv.path + ' 挂在 ' + lv.mount + '：真机上必须先 umount ' + lv.mount + '，',
                   '  并注释掉 /etc/fstab 里对应的行，否则重启会因为找不到设备进 emergency mode）']);
    }
    if (test) {
      return ok(['  TEST MODE: Test mode: Skipping logical volume deactivation.',
                 '  TEST MODE: Test mode: Would remove ' + lv.vg + '/' + lv.name + '.',
                 '',
                 '（--test 只模拟不执行，确认针对的是正确的 LV 再动手）']);
    }
    return ok(['  Logical volume "' + lv.vg + '/' + lv.name + '" successfully removed.']);
  };
  OPS.vgremove = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (!targets.length) return fail(['  Please specify a volume group.', '  用法：vgremove vg-data']);
    if (targets[0] !== VG.name) return fail(['  Volume group "' + targets[0] + '" not found.']);
    if (LVS.length) {
      return fail(['  Volume group "' + VG.name + '" still contains ' + LVS.length + ' logical volume(s).',
                   '（先 lvremove /dev/vg-data/lv-data。⚠ 这一步数据全部丢失且不可恢复）']);
    }
    return ok(['  Volume group "' + VG.name + '" successfully removed']);
  };

  /* ---------- 分区表救援 / 自检类：fsck / fstrim / blkdiscard / quotacheck ---------- */
  OPS.fsck = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 't:,T:,C:,N:,a,A,r,R,f,n,p,y,v,V,l,c');
    var targets = P.args;
    if (!targets.length) return fail(['fsck from util-linux 2.37.4', 'Usage: fsck [-fny] device']);
    var dev = targets[0];
    var e = allDevs().filter(function (x) { return x.dev === dev; })[0];
    if (/^\/dev\/vg-/.test(dev)) {
      return fail(['fsck from util-linux 2.37.4',
                   'e2fsck 1.46.4 (18-Aug-2021)',
                   'e2fsck: Cannot continue, aborting.',
                   '',
                   dev + ' is mounted.',
                   '（必须先 umount /data 再检查；教学环境如实拒绝在挂载状态下跑 e2fsck）']);
    }
    if (!e) return fail(['fsck from util-linux 2.37.4', 'e2fsck: No such file or directory while trying to open ' + dev]);
    if (e.part.mount) {
      return fail(['fsck from util-linux 2.37.4',
                   'e2fsck 1.46.4 (18-Aug-2021)',
                   'e2fsck: Cannot continue, aborting.',
                   '',
                   dev + ' is mounted on ' + e.part.mount + '.',
                   '（真机上必须先 umount ' + e.part.mount + '；根分区要在救援模式下检查）']);
    }
    var readonly = flag(argv, 'n');
    var out = ['fsck from util-linux 2.37.4',
               'e2fsck 1.46.4 (18-Aug-2021)',
               'Pass 1: Checking inodes, blocks, and sizes',
               'Pass 2: Checking directory structure',
               'Pass 3: Checking directory connectivity',
               'Pass 4: Checking reference counts',
               'Pass 5: Checking group summary information',
               dev + ': clean, ' + (e.part.name === 'vdb1' ? '13098233' : '312884') + '/' +
               (e.part.name === 'vdb1' ? '13107200' : '2621440') + ' files, ' +
               (e.part.name === 'vdb1' ? '129483520' : '3088384') + '/' + Math.round(sizeToBytes(e.part.size) / 4096) + ' blocks'];
    if (readonly) out.push('（-n 只读检查：不对文件系统做任何修改）');
    return ok(out);
  };
  OPS.fstrim = function (argv, ctx, stdin, HOST) {
    var all = flag(argv, 'a');
    var verbose = flag(argv, 'v');
    var targets = argsOf(argv);
    if (!all && !targets.length) return fail(['fstrim: 需要指定挂载点，或用 fstrim -av 处理所有支持 TRIM 的文件系统']);
    var mps = all ? ['/', '/data', '/var/lib/docker'] : targets;
    var out = [];
    mps.forEach(function (m) {
      var row = fsByDevOrMount(m);
      if (!row) { out.push('fstrim: ' + m + ': not a mountpoint'); return; }
      if (verbose || all) out.push(m + ': 12.4 GiB (13316915200 bytes) trimmed on ' + row.dev);
    });
    teaching(out, '真机上 fstrim 把"已删除但闪存块未回收"的空间还给云盘（TRIM）；');
    out.push('（教学环境不真的下发 TRIM —— 对线上盘下发会瞬时抬高 IO 延迟，生产要在低峰做）');
    return ok(out);
  };
  OPS.blkdiscard = function (argv, ctx, stdin, HOST) {
    var dry = flag(argv, 'n');
    var secure = flag(argv, 's');
    var force = flag(argv, 'f');
    var targets = argsOf(argv);
    if (!targets.length) return fail(['blkdiscard: 需要指定设备，例如 blkdiscard -n /dev/vdb']);
    var dev = targets[0];
    var d = findDisk(dev);
    if (!d) return fail(['blkdiscard: cannot open ' + dev + ': No such file or directory']);
    var offset = optValue(argv, '-o') || '0';
    var length = optValue(argv, '-l') || sizeToBytes(d.size) + '';
    if (dry) {
      return ok(['blkdiscard: 预演模式（-n），将要丢弃的范围：',
                 '  device: ' + dev,
                 '  offset: ' + offset,
                 '  length: ' + length + ' bytes (' + d.size + ')',
                 '',
                 '（-n 只显示范围，不执行任何写操作。真机上不加 -n 会**立刻清空该范围内所有数据**）']);
    }
    if (d.parts.length && !force) {
      return fail(['blkdiscard: ' + dev + ': 设备上有分区 ' + d.parts.map(function (p) { return p.name; }).join(',') + '，需要 -f 强制',
                   '（教学环境不会真的丢弃：真机上 blkdiscard 会清空整块设备的数据，且**无法恢复**）']);
    }
    return fail(['blkdiscard: ' + dev + ': 教学环境如实拒绝执行',
                 '（blkdiscard' + (secure ? ' -s' : '') + ' 会一次性清空 ' + dev + ' 上全部数据，',
                 '  只在确认无数据的新盘上使用。日常回收空间请用 fstrim -av）']);
  };
  OPS.quotacheck = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (!targets.length) return fail(['quotacheck: 需要指定文件系统，例如 quotacheck -cugm /data']);
    var mp = targets[targets.length - 1];
    var row = fsByDevOrMount(mp);
    if (!row) return fail(['quotacheck: Cannot find filesystem to check or filesystem is not mounted: ' + mp]);
    var out = ['quotacheck: Your kernel probably supports journaled quota but you are not using it. Consider switching to journaled quota to avoid running quotacheck after an unclean shutdown.',
               'quotacheck: Scanning ' + row.dev + ' [' + mp + '] done',
               'quotacheck: Cannot stat old user quota file: No such file or directory',
               'quotacheck: Checked 184220 directories and 1422118 files'];
    teaching(out, '真机上这一步会在 ' + mp + ' 下写出 aquota.user / aquota.group；教学环境不写盘');
    return ok(out);
  };
  OPS.quotaon = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    if (!targets.length) return fail(['quotaon: 需要指定文件系统，例如 quotaon -ugv /data']);
    teaching([], '');
    return ok(['/dev/vdb1 [' + targets[targets.length - 1] + ']: group quotas turned on',
               '/dev/vdb1 [' + targets[targets.length - 1] + ']: user quotas turned on']);
  };
  OPS.edquota = function (argv, ctx, stdin, HOST) {
    var user = optValue(argv, '-u');
    var group = optValue(argv, '-g');
    if (!user && !group) return fail(['edquota: 需要 -u <用户> 或 -g <组>', '用法：edquota -u deploy']);
    if (user && user !== 'deploy' && user !== 'root' && user !== 'nginx') {
      return fail(['edquota: User ' + user + ' does not exist.']);
    }
    return ok(['（教学环境不打开编辑器。真机上 edquota -u ' + (user || group) + ' 会打开 vi：',
               '',
               '  Filesystem                   blocks       soft       hard    inodes     soft     hard',
               '  /dev/vdb1                     184220     524288     786432         0        0        0',
               '',
               '  改 soft/hard 两列保存即生效；软限超了只警告，硬限超了直接写失败）']);
  };
  OPS.repquota = function (argv, ctx, stdin, HOST) {
    return ok([
      '*** Report for user quotas on device /dev/vdb1',
      'Block grace time: 7days; Inode grace time: 7days',
      '                        Block limits                File limits',
      'User            used    soft    hard  grace    used  soft  hard  grace',
      '----------------------------------------------------------------------',
      'root      --  184220       0       0              12     0     0       ',
      'deploy    --  152008  524288  786432           12844     0     0       ',
      'nginx     --    4210   51200  102400             184     0     0       ',
      '',
      '*** Report for group quotas on device /dev/vdb1',
      'Group           used    soft    hard  grace    used  soft  hard  grace',
      '----------------------------------------------------------------------',
      'deploy    --  156218  524288  786432           13028     0     0       ',
      '',
      '（/data 的硬限总和远小于 200G —— 配额是防止个别账号把共享盘写满，不是扩容手段）'
    ]);
  };

  /* ---------- NFS 客户端 / 服务端 ---------- */
  OPS.showmount = function (argv, ctx, stdin, HOST) {
    var exports = flag(argv, 'e');
    var targets = argsOf(argv);
    var host = targets[0] || '192.168.1.10';
    if (host !== '192.168.1.10') {
      return fail(['clnt_create: RPC: Unable to receive',
                   '（教学环境只有 192.168.1.10 这台 NFS 服务端的模拟数据）']);
    }
    if (exports || !targets.length) {
      return ok(['Export list for ' + host + ':',
                 '/data 192.168.1.0/24',
                 '/backup 192.168.1.0/24']);
    }
    return ok(['All mount points on ' + host + ':',
               '192.168.1.20:/data',
               '192.168.1.21:/backup']);
  };
  OPS.exportfs = function (argv, ctx, stdin, HOST) {
    var relaunch = flag(argv, 'r');
    var verbose = flag(argv, 'v');
    var unexport = flag(argv, 'u');
    var all = flag(argv, 'a');
    var targets = argsOf(argv);
    if (unexport) {
      return fail(['exportfs: 取消导出会让正在挂载的客户端拿到 ESTALE',
                   '（真机上先确认没有客户端在用：showmount -a，再 exportfs -u）']);
    }
    if (all) {
      var out = ['/data\t192.168.1.0/24(rw,sync,wdelay,hide,nocrossmnt,secure,root_squash,no_all_squash,no_subtree_check,secure_locks,acl,no_pnfs,anonuid=65534,anongid=65534,sec=sys,rw,secure,root_squash,no_all_squash)'];
      if (!verbose) out = [];
      else out.push('/backup\t192.168.1.0/24(ro,sync,wdelay,hide,nocrossmnt,secure,root_squash,no_all_squash,no_subtree_check,secure_locks,acl,no_pnfs,anonuid=65534,anongid=65534,sec=sys,ro,secure,root_squash,no_all_squash)');
      return ok(out);
    }
    if (verbose) {
      return ok(['/data\t192.168.1.0/24(rw,sync,wdelay,hide,nocrossmnt,secure,root_squash,no_all_squash,no_subtree_check,secure_locks,acl,no_pnfs,anonuid=65534,anongid=65534,sec=sys,rw,secure,root_squash,no_all_squash)',
                 '/backup\t192.168.1.0/24(ro,sync,wdelay,hide,nocrossmnt,secure,root_squash,no_all_squash,no_subtree_check,secure_locks,acl,no_pnfs,anonuid=65534,anongid=65534,sec=sys,ro,secure,root_squash,no_all_squash)']);
    }
    return ok([]);
  };
  OPS.exportfs_reload = null;

  /* ---------- fuser / lsattr 一类的占用排查 ---------- */
  OPS.fuser = function (argv, ctx, stdin, HOST) {
    var mountBased = flag(argv, 'm');
    var verbose = flag(argv, 'v');
    var target = argsOf(argv)[0];
    if (!target) return fail(['fuser: 需要指定文件或挂载点，例如 fuser -m -v /data']);
    var abs = U.resolvePath(ctx.cwd, target);
    var mounted = fsByDevOrMount(abs) || fsByDevOrMount(target);
    if (!mounted) return fail(['fuser: ' + target + ': 没有这个文件或挂载点']);
    var holders = PROCS.filter(function (p) {
      return /java|mysqld|dockerd|nginx|redis-server|node_exporter/.test(p.name);
    }).slice(0, 4);
    if (verbose) {
      var out = ['                     USER        PID ACCESS COMMAND'];
      out.push(U.pad(mounted.mount + ':', 21) + U.pad('root', 12) + U.pad('kernel', 9) + 'mount  ' + 'kernel');
      holders.forEach(function (p) {
        out.push(U.pad('', 21) + U.pad(p.user, 12) + U.pad(String(p.pid), 9) + '..c..  ' + p.name);
      });
      out.push('');
      out.push('（' + mounted.mount + ' 正被上面这些进程占用 —— umount 会报 target is busy，先停服务或改句柄）');
      return ok(out);
    }
    return ok(holders.map(function (p) { return String(p.pid); }).join(''));
  };

  /* ---------- dd：裸设备测速与镜像拷贝 ---------- */
  OPS.dd = function (argv, ctx, stdin, HOST) {
    var get = function (k) { return optValue(argv, k); };
    var src = get('if'), dst = get('of');
    var bs = get('bs') || '512';
    var count = get('count');
    var progress = has(argv, 'status=progress');
    var direct = (get('oflag') || get('iflag') || '').indexOf('direct') !== -1;
    if (!src && !dst) return fail(['dd: missing operand', 'Try \'dd --help\' for more information.']);
    var out = [];
    var bsBytes = sizeToBytes(bs) || 512;
    var bytes;
    if (src === '/dev/zero') {
      bytes = count ? bsBytes * Number(count) : bsBytes;
    } else if (src === '/dev/vda' || src === '/dev/vdb') {
      var d = findDisk(src);
      bytes = d ? sizeToBytes(d.size) : bsBytes * 1024;
    } else if (src === '/dev/random' || src === '/dev/urandom') {
      bytes = count ? bsBytes * Number(count) : bsBytes;
    } else {
      var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, src));
      if (!node) return fail(['dd: failed to open \'' + src + '\': No such file or directory',
                              '（先造出源文件：dd if=/dev/zero of=' + src + ' bs=1M count=' + (count || '2048') + '）']);
      bytes = node.explicitSize !== undefined ? node.explicitSize : String(node.content || '').length;
    }
    var seconds = Math.max(0.6, bytes / (direct ? 104857600 : 524288000));
    if (progress) {
      out.push(bytes + ' bytes (' + bytesToHuman(bytes) + ') copied, ' + seconds.toFixed(6) + ' s, ' + (bytes / seconds / 1048576).toFixed(1) + ' MB/s');
    }
    out.push(fmtDdCount(bytes, bsBytes, bs) + ' records in');
    out.push(fmtDdCount(bytes, bsBytes, bs) + ' records out');
    out.push(bytes + ' bytes (' + bytesToHuman(bytes) + ') copied, ' + seconds.toFixed(6) + ' s, ' + (bytes / seconds / 1048576).toFixed(1) + ' MB/s');
    /* ⚠ dd 是最容易毁数据的命令之一：of= 指向真实设备时必须提醒 */
    var danger = dst && /^\/dev\/(vda|vdb|vdc|sd[a-z])$/.test(dst);
    if (danger) {
      out.push('');
      out.push('⚠ 危险：of=' + dst + ' 是**整块设备**。真机上这条命令会直接覆盖 ' + dst + ' 的开头，');
      out.push('  分区表与文件系统会被写坏，数据不可恢复。教学环境不真的写盘。');
      out.push('  确认目标盘的写法：先 lsblk 看清设备名，再用 `dd if=... of=' + dst + ' bs=4M status=progress`。');
    } else if (dst) {
      /* `of=` 指向**普通文件**时，真机上是真的把文件建出来的（`dd if=/dev/zero of=/tmp/x.img`
         之后 `ls -lh /tmp/x.img` 必须看得到）。早先这里只打一句"教学环境不会真的写盘"、
         不建文件，于是站内所有 `dd … && ls -lh` 的示例都坏在第二段 ——
         学员会以为 dd 没成功。这里按实际大小**登记**这个文件（内容仍不写真实字节，
         只给大小与元数据），既诚实又让后续命令说得通。 */
      var dAbs = U.resolvePath(ctx.cwd, dst);
      var dPar = U.findNode(ctx.root, U.parentOf(dAbs));
      if (dPar && dPar.type === 'dir') {
        var dBase = dAbs.slice(dAbs.lastIndexOf('/') + 1);
        var dNode = dPar.children[dBase];
        if (!dNode) {
          dNode = { type: 'file', name: dBase, children: null, content: '', mode: '644',
                    user: (HOST && HOST.user) || 'root', group: 'root', mtime: '2024-03-18 09:50', target: null };
          dPar.children[dBase] = dNode;
        }
        dNode.content = '<binary>dd 写入的 ' + bytesToHuman(bytes) + ' 数据';
        dNode.explicitSize = bytes;
        teaching(out, '已按实际大小建出 ' + dst + '（教学环境不写真实字节，只登记大小与元数据；'
          + '真机上这里会写入 ' + bytesToHuman(bytes) + ' 数据）');
      } else {
        teaching(out, '真机上这里已经写入 ' + dst + '；教学环境只做测速口径的计算（'
          + (direct ? 'oflag/iflag=direct 绕过缓存' : '走页缓存') + '），父目录不存在所以没有建文件');
      }
    } else {
      teaching(out, '真机上这里已经写入标准输出；教学环境只做测速口径的计算（'
        + (direct ? 'oflag/iflag=direct 绕过缓存' : '走页缓存') + '）');
    }
    return ok(out);
  };
  function fmtDdCount(bytes, bsBytes, bs) {
    var n = Math.max(1, Math.round(bytes / bsBytes));
    return String(n);
  }

  /* ---------- mdadm：软 RAID ---------- */
  var MD = { name: 'md0', level: 'raid1', members: '/dev/vdb', spare: '/dev/vdc', state: 'clean', size: '200G' };
  OPS.mdadm = function (argv, ctx, stdin, HOST) {
    var create = has(argv, '--create') || /^-.*C/.test(argv.join(' '));
    var detail = has(argv, '--detail') || argv.some(function (a) { return /^-[A-Za-z]*D/.test(String(a)); });
    var failFlag = has(argv, '--fail');
    var remove = has(argv, '--remove');
    var add = has(argv, '--add');
    var targets = argsOf(argv);
    if (create) {
      var level = 'raid1';
      for (var i = 0; i < argv.length; i++) {
        var m = String(argv[i]).match(/^--level=?(.*)$/);
        if (m) level = m[1] || argv[i + 1];
      }
      var devs = targets.filter(function (t) { return /^\/dev\/vd/.test(t); });
      var name = targets.filter(function (t) { return /^\/dev\/md/.test(t); })[0] || '/dev/md0';
      if (devs.length < 2) {
        return fail(['mdadm: Not enough devices to start the array.',
                     '（RAID1 至少两块盘：mdadm --create ' + name + ' --level=1 --raid-devices=2 /dev/vdb /dev/vdc）']);
      }
      for (var j = 0; j < devs.length; j++) {
        var dd = findDisk(devs[j]);
        if (!dd) return fail(['mdadm: cannot open ' + devs[j] + ': No such file or directory']);
        if (dd.parts.length) {
          return fail(['mdadm: ' + devs[j] + ' appears to contain an ext4fs file system',
                       'mdadm: Cannot use ' + devs[j] + ' as it is already in use',
                       '（真机上 mdadm --create 会**清掉成员盘的数据**。请用没分区没挂载的裸盘，',
                       '  或者先确认数据已备份并加 --force）']);
        }
      }
      return ok(['mdadm: Defaulting to version 1.2 metadata',
                 'mdadm: array ' + name + ' started.',
                 '',
                 '（教学环境不真的建阵列：真机上这一步开始同步，`cat /proc/mdstat` 能看到 resync 进度）']);
    }
    if (detail) {
      var want = targets[0] || '/dev/md0';
      if (want !== '/dev/md0' && want !== 'md0') return fail(['mdadm: cannot open ' + want + ': No such file or directory']);
      return ok([
        '/dev/md0:',
        '           Version : 1.2',
        '     Creation Time : Mon Mar 11 08:02:20 2024',
        '        Raid Level : raid1',
        '        Array Size : 209584128 (199.88 GiB 214.61 GB)',
        '     Used Dev Size : 209584128 (199.88 GiB 214.61 GB)',
        '      Raid Devices : 2',
        '     Total Devices : 2',
        '       Persistence : Superblock is persistent',
        '',
        '       Update Time : Mon Mar 18 09:41:12 2024',
        '             State : ' + MD.state,
        '    Active Devices : 2',
        '   Working Devices : 2',
        '    Failed Devices : 0',
        '     Spare Devices : 0',
        '',
        'Consistency Policy : resync',
        '',
        '              Name : web-prod-01:0',
        '              UUID : ' + uuidOf('md0'),
        '            Events : 1842',
        '',
        '    Number   Major   Minor   RaidDevice State',
        '       0     253       16        0      active sync   /dev/vdb',
        '       1     253       32        1      active sync   /dev/vdc',
        '',
        '（State: clean 才是健康；出现 degraded 说明有盘掉了，换盘：mdadm /dev/md0 --fail X --remove X && mdadm /dev/md0 --add Y）'
      ]);
    }
    if (failFlag || remove || add) {
      var dev = null;
      for (var k = 0; k < argv.length; k++) if (/^\/dev\/vd/.test(String(argv[k]))) dev = String(argv[k]);
      if (!dev) return fail(['mdadm: 需要指定成员盘，例如 mdadm /dev/md0 --fail /dev/vdc']);
      if (failFlag) return ok(['mdadm: set ' + dev + ' faulty in /dev/md0']);
      if (remove) return ok(['mdadm: hot removed ' + dev + ' from /dev/md0']);
      return ok(['mdadm: added ' + dev + '']);
    }
    return fail(['mdadm: 未识别的参数组合', '（教学环境支持：--create / --detail / --fail / --remove / --add）']);
  };

  /* ---------- smartctl / hdparm：硬件层看盘 ---------- */
  OPS.smartctl = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    var dev = targets[targets.length - 1] || '/dev/sda';
    if (!/^\/dev\/(sd|vd|nvme)/.test(dev)) return fail(['smartctl: 需要指定设备，例如 smartctl -H /dev/sda']);
    var health = flag(argv, 'H');
    var all = flag(argv, 'a') || has(argv, '-x') || has(argv, '-all');
    var selftest = flag(argv, 'l');
    var runTest = optValue(argv, '-t');
    if (runTest) {
      return ok(['=== START OF OFFLINE IMMEDIATE AND SELF-TEST SECTION ===',
                 'Sending command: "Execute SMART Short self-test routine immediately in off-line mode".',
                 'Drive command "Execute SMART Short self-test routine immediately in off-line mode" successful.',
                 'Testing has begun.',
                 'Please wait 2 minutes for test to complete.',
                 'Test will complete after Mon Mar 18 09:53:00 2024',
                 '',
                 'Use smartctl -l selftest /dev/sda to view test results',
                 '',
                 '（教学环境不真的下发自检；真机上 -t short 会占用盘几十秒，生产低峰再跑）']);
    }
    var head = [
      'smartctl 7.2 2020-12-30 r5155 [x86_64-linux-5.10.0-60.18.0.50.oe2203.x86_64] (local build)',
      'Copyright (C) 2002-20, Bruce Allen, Christian Franke, www.smartmontools.org',
      ''
    ];
    if (selftest) {
      return ok(head.concat([
        '=== START OF READ SMART DATA SECTION ===',
        'SMART Self-test log structure revision number 1',
        'Num  Test_Description    Status                  Remaining  LifeTime(hours)  LBA_of_first_error',
        '# 1  Short offline       Completed without error       00%     18422         -',
        '# 2  Short offline       Completed without error       00%     18350         -'
      ]));
    }
    var body = [
      '=== START OF INFORMATION SECTION ===',
      'Device Model:     Virtual Disk',
      'Serial Number:    0000' + uuidOf(dev).replace(/-/g, '').slice(0, 12),
      'LU WWN Device Id: 5 000c29 ' + uuidOf(dev).replace(/-/g, '').slice(0, 6),
      'Firmware Version: 1.0',
      'User Capacity:    214,748,364,800 bytes [214 GB]',
      'Sector Size:      512 bytes logical/physical',
      'Rotation Rate:    Solid State Device',
      'Device is:        Not in smartctl database [for details use: -P showall]',
      'ATA Version is:   ACS-4 (minor revision not indicated)',
      'SATA Version is:  SATA 3.1, 6.0 Gb/s (current: 6.0 Gb/s)',
      'Local Time is:    Mon Mar 18 09:51:00 2024 CST',
      'SMART support is: Available - device has SMART capability.',
      'SMART support is: Enabled'
    ];
    if (health && !all) {
      return ok(head.concat(body, ['', '=== START OF READ SMART DATA SECTION ===', 'SMART overall-health self-assessment test result: PASSED']));
    }
    return ok(head.concat(body, [
      '',
      '=== START OF READ SMART DATA SECTION ===',
      'SMART overall-health self-assessment test result: PASSED',
      '',
      'SMART Attributes Data Structure revision number: 16',
      'Vendor Specific SMART Attributes with Thresholds:',
      'ID# ATTRIBUTE_NAME          FLAG     VALUE WORST THRESH TYPE      UPDATED  WHEN_FAILED RAW_VALUE',
      '  5 Reallocated_Sector_Ct   0x0033   100   100   010    Pre-fail  Always       -       0',
      '  9 Power_On_Hours          0x0032   088   088   000    Old_age   Always       -       18422',
      ' 12 Power_Cycle_Count       0x0032   100   100   000    Old_age   Always       -       18',
      '177 Wear_Leveling_Count     0x0013   094   094   000    Pre-fail  Always       -       62',
      '179 Used_Rsvd_Blk_Cnt_Tot   0x0013   100   100   000    Pre-fail  Always       -       0',
      '187 Reported_Uncorrect      0x0032   100   100   000    Old_age   Always       -       0',
      '194 Temperature_Celsius     0x0022   068   052   000    Old_age   Always       -       32 (Min/Max 18/48)',
      '197 Current_Pending_Sector  0x0012   100   100   000    Old_age   Always       -       0',
      '198 Offline_Uncorrectable   0x0010   100   100   000    Old_age   Offline      -       0',
      '199 UDMA_CRC_Error_Count    0x003e   200   200   000    Old_age   Always       -       0',
      '202 Percentage_Used        0x0013   094   094   000    Pre-fail  Always       -       6%',
      '',
      '（Reallocated_Sector_Ct / Current_Pending_Sector 非 0 就是在走向坏盘；Percentage_Used 是 SSD 寿命消耗）'
    ]));
  };
  OPS.hdparm = function (argv, ctx, stdin, HOST) {
    var targets = argsOf(argv);
    var dev = targets[targets.length - 1] || '/dev/sda';
    if (!/^\/dev\/(sd|vd|nvme)/.test(dev)) return fail(['hdparm: 需要指定设备，例如 hdparm -Tt /dev/sda']);
    var identify = flag(argv, 'i') || flag(argv, 'I');
    var timing = flag(argv, 'T') || flag(argv, 't');
    var direct = has(argv, '--direct');
    if (identify && !timing) {
      return ok([
        '',
        dev + ':',
        ' Model=Virtual Disk, FwRev=1.0, SerialNo=0000' + uuidOf(dev).replace(/-/g, '').slice(0, 12),
        ' Config={ HardSect NotMFM HdSw>15uSec Fixed DTR>10Mbs }',
        ' RawCHS=16383/16/63, TrkSize=0, SectSize=512, ECCbytes=4',
        ' BuffType=unknown, BuffSize=256kB, MaxMultSect=16, MultSect=off',
        ' CurCHS=16383/16/63, CurSects=16514064, LBA=yes, LBAsects=419430400',
        ' IORDY=on/off, tPIO={min:120,w/IORDY:120}, tDMA={min:120,rec:120}',
        ' PIO modes:  pio0 pio1 pio2 pio3 pio4 ',
        ' DMA modes:  mdma0 mdma1 mdma2 ',
        ' UDMA modes: udma0 udma1 udma2 udma3 udma4 udma5 *udma6 ',
        '',
        '（云盘是虚拟设备：型号/序列号是仿真值，报修时真机上以控制台显示的云硬盘 ID 为准）'
      ]);
    }
    return ok([
      '',
      dev + ':',
      ' Timing cached reads:   18422 MB in  2.00 seconds = 9218.42 MB/sec',
      ' Timing buffered disk reads: 1420 MB in  3.00 seconds = 473.18 MB/sec' + (direct ? '  (O_DIRECT)' : ''),
      '',
      '（缓存读很快、缓冲读才是真实盘速；加 --direct 绕过页缓存，更接近云盘真实读性能）'
    ]);
  };

  /* ---------- sync / ioping ---------- */
  OPS.sync = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'f:,d');
    var f = P.opts.f;
    if (f) {
      var abs = U.resolvePath(ctx.cwd, f);
      if (!U.findNode(ctx.root, abs)) {
        return fail(['sync: error opening \'' + f + '\': No such file or directory',
                     '（sync -f 只对**存在的文件**做"该文件所在文件系统落盘"；整机刷盘直接用 `sync`）']);
      }
      var d = U.findNode(ctx.root, abs);
      if (d.explicitSize === undefined && String(d.content || '').length < 1048576) {
        teaching([], '真机上 sync -f 只回写该文件及其文件系统的脏页；教学环境不写盘');
      }
      return ok([]);
    }
    return ok([]);
  };
  OPS.ioping = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'c:,s:,w:,i:,q:,p:,t:,T:,A:,L:,P:,R:,D,W');
    var count = Number(P.opts.c) || 10;
    var direct = !!P.flags.D;
    var write = !!P.flags.W;
    var size = P.opts.s || '4k';
    var targets = P.args.map(function (t) { return mkTarget(ctx, t); });
    var t = targets[0] || '.';
    var blk = allDevs().filter(function (x) { return x.dev === t; })[0] || findDisk(t);
    if (blk) {
      if (!direct) {
        return fail(['ioping: ' + t + ' 是块设备，必须加 -D（直接 IO）才能测',
                     '（对裸设备做带缓存的读测出来的是内存速度，没有意义：ioping -D ' + t + '）']);
      }
    } else if (!U.findNode(ctx.root, U.resolvePath(ctx.cwd, t))) {
      return fail(['ioping: 无法打开 \'' + t + '\': No such file or directory']);
    }
    var out = [];
    var sum = 0, min = 1e9, max = 0;
    for (var i = 0; i < count; i++) {
      /* vdb 的延迟就是 iostat 里那条 w_await=42ms 的故事线：云盘在 99.4% 利用率下抖动很大 */
      var base = /^\/dev\/vdb|\/data/.test(t) ? (write ? 42.18 : 18.42) : 1.42;
      var v = jitter('ioping' + t, base, 55, i);
      sum += v; if (v < min) min = v; if (v > max) max = v;
      out.push(size + ' request=1 time=' + v.toFixed(1) + ' ms');
    }
    out.push('');
    out.push('--- ' + t + ' (' + (blk ? 'block device' : 'ext4 /dev/vdb1') + ') ioping statistics ---');
    out.push(count + ' requests completed in ' + (sum / 1000).toFixed(2) + ' s, ' + Math.round(count / (sum / 1000)) + ' iops, ' + (sizeToKb(size) * count / (sum / 1000) / 1024).toFixed(1) + ' MiB/s');
    out.push('min/avg/max/mdev = ' + (min * 1000).toFixed(0) + ' us/' + (sum / count * 1000).toFixed(0) + ' us/' + (max * 1000).toFixed(0) + ' us/' + ((max - min) * 1000).toFixed(0) + ' us');
    out.push('min/avg/max/mdev = ' + min.toFixed(1) + ' ms/' + (sum / count).toFixed(2) + ' ms/' + max.toFixed(1) + ' ms/' + (max - min).toFixed(2) + ' ms');
    out.push('');
    out.push(t + ' 在 vdb 上：平均 ' + (sum / count).toFixed(2) + ' ms、最大 ' + max.toFixed(1) + ' ms —— 和 iostat 里 vdb 的 await 是同一个数（云盘在高负载下延迟抖动明显）');
    return ok(out);
  };

  /* sleep：smartctl -t short / sysbench 那些示例里用来串流程。
     教学环境没有真实等待 —— 但**不能**让它变成 command not found，否则整条 && 链断掉。 */
  OPS.sleep = function (argv, ctx, stdin, HOST) {
    var total = 0;
    var bad = null;
    argv.forEach(function (a) {
      var m = String(a).match(/^([\d.]+)([smhd]?)$/);
      if (m) {
        var mult = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
        total += parseFloat(m[1]) * mult;
      } else bad = String(a);
    });
    if (bad !== null) return fail(['sleep: invalid time interval \'' + bad + '\'', 'Try \'sleep --help\' for more information.']);
    if (!argv.length) return fail(['sleep: missing operand', 'Try \'sleep --help\' for more information.']);
    return ok([]);
  };

  /* ======================================================================
     3. 监控与日志
     ====================================================================== */

  /* ---------- dmesg：内核环形缓冲区（-T 人类时间 / --level / -w） ---------- */
  OPS.dmesg = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'l:,L:,s:,n:,f:,T,t,w,W,H,h,e,E,k,K,u,x,c,r,d,D,S,v,V');
    var human = !!P.flags.T;
    var follow = !!P.flags.w || !!P.flags.W;
    var levelSpec = P.opts.l || P.opts.level || '';
    var wantLevels = levelSpec ? String(levelSpec).split(',').map(function (s) { return s.trim(); }) : null;
    var tailCount = P.opts.n ? Number(P.opts.n) : (P.opts.tail ? Number(P.opts.tail) : null);
    var out = [];
    var LEVEL_OF = {
      'blk_update_request': 'err',
      'EXT4-fs warning': 'warn',
      'EXT4-fs error': 'err',
      'Out of memory': 'err',
      'oom-kill': 'err',
      'VFS: file-max': 'warn',
      'TCP: request_sock_TCP': 'warn',
      'TCP: eth0': 'warn',
      'audit:': 'info',
      'docker0:': 'info'
    };
    DMESG.forEach(function (row) {
      var lvl = 'info';
      Object.keys(LEVEL_OF).forEach(function (k) { if (row.l.indexOf(k) !== -1) lvl = LEVEL_OF[k]; });
      if (wantLevels && wantLevels.indexOf(lvl) === -1) return;
      out.push((human ? '[' + row.t + '] ' : '[' + (row.l.match(/^\[\s*[\d.]+\]/) ? row.l.match(/^\[\s*([\d.]+)\]/)[1] : '0.000000') + '] ') + row.l.replace(/^\[\s*[\d.]+\]\s*/, ''));
    });
    if (tailCount !== null) out = out.slice(Math.max(0, out.length - tailCount));
    if (!out.length) {
      out.push('（按当前过滤条件，内核缓冲区里没有匹配的记录）');
    }
    if (follow) {
      out.push('');
      out.push('^C   （教学环境不追加真实新事件：真机上 dmesg -w 会持续打印新内核消息）');
    }
    return ok(out);
  };

  /* ---------- sysctl：运行时内核参数（-a / -n / -w / --system） ---------- */
  var SYSCTL = {
    'net.core.somaxconn': '128',
    'net.core.rmem_max': '212992',
    'net.core.wmem_max': '212992',
    'net.core.netdev_max_backlog': '1000',
    'net.ipv4.tcp_max_syn_backlog': '1024',
    'net.ipv4.tcp_tw_reuse': '0',
    'net.ipv4.tcp_timestamps': '1',
    'net.ipv4.tcp_fin_timeout': '60',
    'net.ipv4.tcp_syncookies': '1',
    'net.ipv4.ip_local_port_range': '32768\t60999',
    'net.ipv4.tcp_rmem': '4096\t131072\t6291456',
    'net.ipv4.tcp_wmem': '4096\t16384\t4194304',
    'net.ipv4.tcp_congestion_control': 'cubic',
    'vm.swappiness': '60',
    'vm.vfs_cache_pressure': '100',
    'vm.dirty_ratio': '20',
    'vm.dirty_background_ratio': '10',
    'vm.overcommit_memory': '0',
    'vm.max_map_count': '65530',
    'fs.file-max': '2097152',
    'fs.nr_open': '1048576',
    'fs.inotify.max_user_watches': '8192',
    'kernel.pid_max': '63457',
    'kernel.msgmax': '8192',
    'kernel.perf_event_paranoid': '2',
    'kernel.sched_autogroup_enabled': '1',
    'kernel.numa_balancing': '1'
  };
  OPS.sysctl = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'w:,p:,n,N,a,A,e:,q,b');
    var out = [], err = [];
    if (P.opts.p) {
      var f = U.findNode(ctx.root, U.resolvePath(ctx.cwd, P.opts.p));
      if (!f) return fail(['sysctl: cannot open "' + P.opts.p + '": No such file or directory']);
      var txt = String(f.content || '');
      var applied = 0;
      U.splitLines(txt).forEach(function (l) {
        var t = l.trim();
        if (!t || t.charAt(0) === '#' || t.charAt(0) === ';') return;
        var m = t.match(/^([\w.\-*]+)\s*=\s*(.*)$/);
        if (!m) return;
        SYSCTL[m[1]] = m[2].trim();
        if (!P.flags.q) out.push(m[1] + ' = ' + SYSCTL[m[1]]);
        applied++;
      });
      if (!applied) return fail(['sysctl: ' + P.opts.p + ': 里没有可用的 `key = value` 行']);
      return ok(out);
    }
    if (P.flags['system']) {
      ['/etc/sysctl.d/99-tuning.conf'].forEach(function (p) {
        var f = U.findNode(ctx.root, p);
        if (!f) return;
        U.splitLines(String(f.content || '')).forEach(function (l) {
          var m = l.trim().match(/^([\w.\-]+)\s*=\s*(.*)$/);
          if (!m) return;
          SYSCTL[m[1]] = m[2].trim();
          out.push('* Applying ' + p + ': ' + m[1] + ' = ' + SYSCTL[m[1]]);
        });
      });
      if (!out.length) out.push('* Applying /usr/lib/sysctl.d/00-system.conf ...');
      out.push('');
      out.push('（--system 会按 /etc/sysctl.d/*.conf 顺序重放所有配置并立即生效）');
      return ok(out);
    }
    if (P.opts.w) {
      var m2 = String(P.opts.w).match(/^([\w.\-]+)=(.*)$/);
      if (!m2) return fail(['sysctl: 无效的参数 "' + P.opts.w + '"', '用法：sysctl -w net.core.somaxconn=32768']);
      var key = m2[1], val = m2[2].replace(/^"|"$/g, '');
      if (SYSCTL[key] === undefined) {
        return fail(['sysctl: cannot stat /proc/sys/' + key.replace(/\./g, '/') + ': No such file or directory',
                     '（教学环境只收录了常用的那批内核参数；真机上任何 /proc/sys 下的文件都能这样改）']);
      }
      SYSCTL[key] = val;
      out.push(key + ' = ' + val);
      out.push('');
      out.push('（已经立即生效，但**重启就没了** —— 持久化要写进 /etc/sysctl.d/99-xxx.conf 再 sysctl --system）');
      return ok(out);
    }
    if (P.flags.a || P.flags.A) {
      var keys = Object.keys(SYSCTL).sort();
      if (P.opts.e) {
        var pat = String(P.opts.e);
        keys = keys.filter(function (k) { return k === pat || k.indexOf(pat + '.') === 0; });
      }
      keys.forEach(function (k) { out.push(k + ' = ' + SYSCTL[k]); });
      return ok(out);
    }
    var names = P.args;
    if (!names.length) return fail(['sysctl: 需要指定参数名或用 -a 列出全部', '用法：sysctl net.ipv4.tcp_tw_reuse / sysctl -a / sysctl -w a.b=1']);
    names.forEach(function (n) {
      if (SYSCTL[n] === undefined) {
        err.push('sysctl: cannot stat /proc/sys/' + String(n).replace(/\./g, '/') + ': No such file or directory');
        return;
      }
      if (P.flags.n) out.push(SYSCTL[n]);
      else out.push(n + ' = ' + SYSCTL[n]);
    });
    if (err.length) return { out: out, err: err, code: 1 };
    return ok(out);
  };

  /* ---------- iotop：按进程看磁盘读写（-o / -P / -b / -n / -d / -k / -u） ---------- */
  function iotopRows() {
    return [
      { pid: 2210, user: 'root', prio: 'be/4', read: 0, write: 184.22, swapin: 0, io: 99.4, cmd: '/usr/sbin/mysqld --defaults-file=/etc/my.cnf' },
      { pid: 18442, user: 'deploy', prio: 'be/4', read: 0, write: 42.18, swapin: 0, io: 22.8, cmd: '/usr/bin/java -jar /opt/myapp/app.jar' },
      { pid: 1204, user: 'root', prio: 'be/4', read: 2.18, write: 6.42, swapin: 0, io: 4.6, cmd: '/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock' },
      { pid: 1843, user: 'nginx', prio: 'be/4', read: 0.42, write: 1.18, swapin: 0, io: 0.9, cmd: 'nginx: worker process' },
      { pid: 4102, user: 'root', prio: 'be/4', read: 0.12, write: 0.08, swapin: 0, io: 0.2, cmd: '/usr/local/bin/node_exporter' }
    ];
  }
  OPS.iotop = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'd:,n:,u:,p:,P,b,o,k,t,q,a');
    var only = !!P.flags.o;
    var batch = !!P.flags.b;
    var kb = !!P.flags.k;
    var acc = !!P.flags.a;
    var count = P.opts.n ? Number(P.opts.n) : 1;
    var interval = P.opts.d ? Number(P.opts.d) : 1;
    var user = P.opts.u;
    var out = [];
    var header = U.pad('  TID', 8) + U.pad('PRIO', 6) + U.pad('USER', 10) + U.pad('DISK READ', 11) + U.pad('DISK WRITE', 12) +
      U.pad('SWAPIN', 9) + U.pad('IO>', 8) + 'COMMAND';
    function unit(v) { return kb ? String(Math.round(v * 1024)) + 'K/s' : v.toFixed(2) + ' M/s'; }
    function tick(t) {
      if (!batch) {
        out.push('Total DISK READ:         2.30 M/s | Total DISK WRITE:       234.08 M/s');
        if (acc) out.push('Actual DISK READ:        2.30 M/s | Actual DISK WRITE:       5.48 M/s');
        out.push('    TID  PRIO  USER     DISK READ  DISK WRITE  SWAPIN     IO>    COMMAND');
        out.push(header);
        out.push('');
        out.push('（教学环境是静态快照；真机上 iotop 每秒刷新一屏，按 q 退出、按 o 只看有 IO 的进程、按 a 切累计/实时）');
        out.push('');
      }
      iotopRows().forEach(function (r) {
        if (only && r.io <= 0) return;
        if (user && r.user !== user) return;
        out.push(U.padLeft(String(r.pid), 7) + ' ' + U.pad(r.prio, 6) + U.pad(r.user, 9) + U.pad(unit(r.read), 11) + U.pad(unit(r.write), 12) +
          U.pad('0.00 %', 9) + U.pad(r.io.toFixed(2) + ' %', 8) + r.cmd);
      });
    }
    for (var i = 0; i < Math.max(1, count); i++) {
      if (batch && i) out.push('');
      tick(i);
      if (!batch && i === 0 && count > 1) break;
    }
    if (user && user !== 'root' && user !== 'deploy' && user !== 'nginx') {
      return fail(['iotop: 用户 ' + user + ' 当前没有产生 IO 的进程']);
    }
    if (batch) {
      out.push('');
      out.push('（-b 批处理模式：真机上配合 -n ' + count + ' -d ' + interval + ' 抓 ' + count + ' 次快照，' +
        '常用于把故障现场存成文件留证）');
    }
    return ok(out);
  };

  /* ---------- pidstat：按进程/线程看资源 ---------- */
  OPS.pidstat = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'u,d,r,w,s,v,t,p:,C:,G:,U:,l,h,V');
    var want = P.flags.u ? 'u' : (P.flags.d ? 'd' : (P.flags.r ? 'r' : (P.flags.w ? 'w' : (P.flags.v ? 'v' : (P.flags.s ? 's' : 'u')))));
    var threads = !!P.flags.t;
    var pid = P.opts.p ? Number(P.opts.p) : null;
    var comm = P.opts.C;
    var interval = '1';
    var count = 5;
    var nums = P.args.filter(function (a) { return /^\d+$/.test(String(a)); });
    if (nums.length) { interval = nums[0]; if (nums[1]) count = Number(nums[1]); }
    var target = pid ? procByPid(pid) : null;
    if (pid && !target) return fail(['pidstat: 找不到进程 ' + pid + '（本站仿真里的应用进程是 18442，数据库是 2210）']);
    var rows = target ? [target] : PROCS.filter(function (p) {
      if (comm && p.name.indexOf(comm) === -1) return false;
      return p.cpu > 0 || p.name === 'mysqld';
    });
    var out = [];
    out.push('Linux ' + kernel(ctx, HOST) + ' (' + hostname(ctx, HOST) + ')\t03/18/2024 \t_x86_64_\t(2 CPU)');
    out.push('');
    var i, r2;
    for (i = 0; i < Math.min(count, 3); i++) {
      if (want === 'd') {
        out.push('09:5' + (1 + i) + ':00      UID       PID   kB_rd/s   kB_wr/s kB_ccwr/s iodelay  Command');
        rows.forEach(function (r) {
          var w = jitter('iotop', r.name === 'mysqld' ? 184220 : (r.name === 'java' ? 42180 : 6420), 25, i);
          out.push('09:5' + (1 + i) + ':00        0 ' + U.padLeft(String(r.pid), 9) + U.padLeft(r.name === 'mysqld' ? '0.00' : (r.name === 'java' ? '2.18' : '0.42'), 10) +
            U.padLeft(w.toFixed(2), 10) + U.padLeft('0.00', 10) + U.padLeft(r.name === 'mysqld' ? '184' : '2', 8) + '  ' + r.name);
        });
      } else if (want === 'r') {
        out.push('09:5' + (1 + i) + ':00      UID       PID  minflt/s  majflt/s     VSZ     RSS   %MEM  Command');
        rows.forEach(function (r) {
          out.push('09:5' + (1 + i) + ':00        0 ' + U.padLeft(String(r.pid), 9) + U.padLeft(r.name === 'java' ? '184.22' : '2.18', 10) + U.padLeft('0.00', 10) +
            U.padLeft(String(r.rss * 3), 8) + U.padLeft(String(r.rss), 8) + U.padLeft(r.mem.toFixed(2), 7) + '  ' + r.name);
        });
      } else if (want === 'w') {
        out.push('09:5' + (1 + i) + ':00      UID       PID   cswch/s nvcswch/s  Command');
        rows.forEach(function (r) {
          out.push('09:5' + (1 + i) + ':00        0 ' + U.padLeft(String(r.pid), 9) +
            U.padLeft(String(Math.round(jitter('csw', r.threads * 42, 20, i))), 10) +
            U.padLeft(String(Math.round(jitter('ncsw', r.name === 'java' ? 311 : 12, 30, i))), 10) + '  ' + r.name);
        });
      } else {
        out.push('09:5' + (1 + i) + ':00      UID       PID    %usr %system  %guest   %wait    %CPU   CPU  Command');
        rows.forEach(function (r) {
          var cpu = jitter('pidstat' + r.pid, r.cpu, 12, i);
          if (threads) {
            THREADS.slice(0, 6).forEach(function (t) {
              out.push('09:5' + (1 + i) + ':00        0 ' + U.padLeft(String(r.pid), 9) + U.padLeft('-', 9) +
                U.padLeft((t.cpu * 0.8).toFixed(2), 7) + U.padLeft((t.cpu * 0.2).toFixed(2), 8) + U.padLeft('0.00', 8) +
                U.padLeft('0.00', 8) + U.padLeft(t.cpu.toFixed(2), 8) + U.padLeft(String((t.tid % 2)), 6) + '  |__' + t.name);
            });
            return;
          }
          out.push('09:5' + (1 + i) + ':00        0 ' + U.padLeft(String(r.pid), 9) + U.padLeft((cpu * 0.85).toFixed(2), 9) +
            U.padLeft((cpu * 0.15).toFixed(2), 8) + U.padLeft('0.00', 8) + U.padLeft('0.00', 8) + U.padLeft(cpu.toFixed(2), 8) +
            U.padLeft(String(r.cpu > 5 ? 0 : 1), 6) + '  ' + r.name);
        });
      }
      out.push('');
    }
    if (interval !== '1' || count > 3) {
      out.push('（真机上会每秒输出一行，Ctrl+C 结束；教学环境只回放前 3 个采样点，数值按同一份进程表推算）');
    }
    if (want === 'd') out.push('提示：mysqld 的 kB_wr/s 与 iostat 里 vdb 的 wkB/s 是同一份 IO —— vdb %util 已经 99.4%。');
    return ok(out);
  };

  /* ---------- sar：既能实时采样也能回看历史 ---------- */
  function sarCpu(i) {
    var us = jitter('sar-us', 34.1, 12, i), sy = jitter('sar-sy', 3.2, 20, i), wa = jitter('sar-wa', 1.2, 40, i);
    var st = jitter('sar-st', 0.0, 1, i);
    var id = 100 - us - sy - wa - st;
    return { us: us, sy: sy, wa: wa, st: st, id: id };
  }
  OPS.sar = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'u,r,b,d,n,q,S:,s:,e:,f:,o:,i:,P:,p:,j:,v,w,x,L:,V,m:,h');
    var hist = P.opts.f;
    var since = P.opts.s;
    var until = P.opts.e;
    var netDev = '';
    var sub = 'u';
    ['u', 'r', 'b', 'd', 'q', 'w', 'W'].forEach(function (k) { if (P.flags[k]) sub = k; });
    /* -n DEV / -n EDEV：-n 的值被 parseArgs 吃了，得从原始 argv 里找回来 */
    for (var ai = 0; ai < argv.length; ai++) {
      if (String(argv[ai]) === '-n') { sub = 'n'; netDev = String(argv[ai + 1] || ''); break; }
      if (String(argv[ai]) === '-u') sub = 'u';
      if (String(argv[ai]) === '-r') sub = 'r';
      if (String(argv[ai]) === '-b') sub = 'b';
      if (String(argv[ai]) === '-q') sub = 'q';
    }
    if (P.opts.n) { sub = 'n'; netDev = P.opts.n; }
    var nums = P.args.filter(function (a) { return /^[\d.]+$/.test(String(a)); });
    var interval = nums.length ? nums[0] : '1';
    var count = nums.length > 1 ? Number(nums[1]) : 3;
    var out = [];
    out.push('Linux ' + kernel(ctx, HOST) + ' (' + hostname(ctx, HOST) + ')\t03/18/2024 \t_x86_64_\t(2 CPU)');
    out.push('');
    var i, r;
    if (sub === 'n') {
      if (/EDEV/i.test(netDev) || /EDEV/.test(argv.join(' '))) {
        out.push('09:51:0' + 0 + '     IFACE   rxerr/s   txerr/s    coll/s  rxdrop/s  txdrop/s  txcarr/s  rxfram/s  rxfifo/s  txfifo/s');
        for (i = 0; i < Math.min(count, 3); i++) {
          out.push('09:5' + (1 + i) + ':0' + i + '      eth0      0.00      0.00      0.00      0.00      0.00      0.00      0.00      0.00      0.00');
        }
        out.push('');
        out.push('（各列都是 0 = 网卡没有错误/丢包。网络抖动如果排除了这里，就往上游交换机与对端查）');
        return ok(out);
      }
      out.push('09:51:0' + 0 + '     IFACE   rxpck/s   txpck/s    rxkB/s    txkB/s   rxcmp/s   txcmp/s  rxmcst/s   %ifutil');
      for (i = 0; i < Math.min(count, 3); i++) {
        out.push('09:5' + (1 + i) + ':0' + i + '      eth0   ' + U.padLeft(jitter('sar-rx', 1842.4, 15, i).toFixed(2), 9) +
          U.padLeft(jitter('sar-tx', 1620.8, 15, i).toFixed(2), 10) + U.padLeft(jitter('sar-rxkb', 2840.2, 18, i).toFixed(2), 10) +
          U.padLeft(jitter('sar-txkb', 4218.4, 18, i).toFixed(2), 10) + U.padLeft('0.00', 10) + U.padLeft('0.00', 10) +
          U.padLeft('0.00', 10) + U.padLeft('2.31', 10));
      }
      return ok(out);
    }
    if (sub === 'r') {
      out.push('09:51:00    kbmemfree   kbavail kbmemused  %memused kbbuffers  kbcached  kbcommit   %commit  kbactive   kbinact   kbdirty');
      for (i = 0; i < Math.min(count, 3); i++) {
        out.push('09:5' + (1 + i) + ':0' + i + '       ' + U.padLeft(String(Math.round(jitter('sar-free', MEM.free, 8, i))), 11) +
          U.padLeft(String(Math.round(jitter('sar-avail', MEM.avail, 6, i))), 10) + U.padLeft(String(MEM.total - MEM.free - MEM.buffers - MEM.cached), 11) +
          U.padLeft(((MEM.total - MEM.free - MEM.buffers - MEM.cached) / MEM.total * 100).toFixed(2), 10) +
          U.padLeft(String(MEM.buffers), 11) + U.padLeft(String(MEM.cached), 10) + U.padLeft('4812844', 10) +
          U.padLeft('60.48', 9) + U.padLeft('4193.4', 10) + U.padLeft('3174.9', 10) + U.padLeft('184.20', 10));
      }
      out.push('');
      out.push('提示：%memused ≈ 54%、kbavail 只剩 1.1 GiB —— 和 free -h 的 available 是同一个值。');
      return ok(out);
    }
    if (sub === 'b') {
      out.push('09:51:00          tps      rtps      wtps      dtps   bread/s   bwrtn/s   bdscd/s');
      for (i = 0; i < Math.min(count, 3); i++) {
        out.push('09:5' + (1 + i) + ':0' + i + '        ' + (160 + i).toFixed(2) + '      0.42    160.18      0.00     12.61  18204.11      0.00');
      }
      return ok(out);
    }
    if (sub === 'q') {
      out.push('09:51:00     runq-sz  plist-sz   ldavg-1   ldavg-5  ldavg-15   blocked');
      for (i = 0; i < Math.min(count, 3); i++) {
        out.push('09:5' + (1 + i) + ':0' + i + '           1       412      0.42      0.68      0.71         2');
      }
      return ok(out);
    }
    /* -u：CPU */
    if (hist) {
      if (!U.findNode(ctx.root, U.resolvePath(ctx.cwd, hist))) {
        return fail(['Cannot open ' + hist + ': No such file or directory',
                     '（历史数据由 sysstat 服务每 10 分钟写一份到 /var/log/sa/saNN；',
                     '  N 是日期 —— 3 月 18 日就是 /var/log/sa/sa18。本站仿真的历史文件是 /var/log/sa/sa18）']);
      }
      out.push('09:00:00        CPU     %user     %nice   %system   %iowait    %steal     %idle');
      var pts = ['09:00:00', '09:10:00', '09:20:00', '09:30:00', '09:40:00', '09:50:00'];
      pts.forEach(function (p, k) {
        var c = sarCpu(k);
        out.push(p + '        all     ' + c.us.toFixed(2) + '      0.00      ' + c.sy.toFixed(2) + '      ' + c.wa.toFixed(2) + '      0.00     ' + c.id.toFixed(2));
      });
      out.push('Average:        all     28.42      0.00      3.18      1.42      0.00     66.98');
      out.push('');
      out.push('（' + (since ? since + ' ~ ' + (until || '现在') + ' 的窗口' : '全天') +
        '：09:40 之后 %iowait 抬高、%idle 下降 —— 与应用 09:41 开始报 query timeout 的时间点吻合）');
      return ok(out);
    }
    out.push('09:51:00        CPU     %user     %nice   %system   %iowait    %steal     %idle');
    for (i = 0; i < Math.min(count, 3); i++) {
      var c = sarCpu(i);
      out.push('09:5' + (1 + i) + ':0' + i + '        all     ' + c.us.toFixed(2) + '      0.00      ' + c.sy.toFixed(2) + '      ' + c.wa.toFixed(2) + '      0.00     ' + c.id.toFixed(2));
    }
    out.push('Average:        all     ' + sarCpu(9).us.toFixed(2) + '      0.00      ' + sarCpu(9).sy.toFixed(2) + '      ' + sarCpu(9).wa.toFixed(2) + '      0.00     ' + sarCpu(9).id.toFixed(2));
    out.push('');
    out.push('（%iowait 1.2% 与 vmstat 的 wa 列、iostat 里 vdb 的 %util 99.4% 是同一条线索：瓶颈在磁盘 IO）');
    return ok(out);
  };

  /* ---------- htop：top 的彩色加强版（静态快照 + 可读的界面说明） ---------- */
  OPS.htop = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'u:,p:,d:,s:,C,t,h,v');
    var user = P.opts.u;
    var pid = P.opts.p ? Number(P.opts.p) : null;
    var tree = !!P.flags.t || !!P.opts.t;
    var rows = procRows();
    if (user) rows = rows.filter(function (r) { return r.user === user; });
    if (pid) rows = rows.filter(function (r) { return r.pid === pid; });
    if (!rows.length) return fail(['htop: 没有匹配的进程（-u ' + (user || '') + (pid ? ' -p ' + pid : '') + '）']);
    var out = [];
    out.push('  0[|||||||||||||||||||||||||||||||||||||||||||||||||||86.4%]   Tasks: 118, 412 thr; 1 running');
    out.push('  1[|||||||||||||||||||||||                            42.1%]   Load average: 0.42 0.68 0.71 ');
    out.push('  Mem[|||||||||||||||||||||||||||||||||||||||   4.10G/7.59G]   Uptime: 14 days, 20:39:12');
    out.push('  Swp[                                              0K/2.00G]');
    out.push('');
    out.push('    PID USER      PRI  NI  VIRT   RES   SHR S CPU%▽ MEM%   TIME+  Command');
    if (tree) {
      out.push('      1 root       20   0  13924 11204  8420 S  0.0  0.1  0:04.18 /usr/lib/systemd/systemd --switched-root --system --deserialize 18');
      out.push('    1204 root       20   0 1428M 142M  42100 S  0.7  1.8 41:02.11 └─ /usr/bin/dockerd -H fd://');
      if (!user || user === 'root') out.push('    2210 root       20   0 1892M 1778M  9820 S  2.1 22.8 184:12.0   ├─ /usr/sbin/mysqld --defaults-file=/etc/my.cnf');
      if (!user || user === 'root' || user === 'nginx') {
        out.push('    1842 root       20   0  142M 18604  4212 S  0.3  0.2  8:12.44   ├─ nginx: master process /usr/sbin/nginx');
        out.push('    1843 nginx      20   0  142M 18420  4212 S  0.4  0.2  8:12.44   │  └─ nginx: worker process');
      }
      if (!user || user === 'deploy') out.push('   18442 deploy     20   0 4218M 612M  18204 S 68.4  7.7 12:41.22   └─ /usr/bin/java -jar /opt/myapp/app.jar');
      if (!user || user === 'root') out.push('    4102 root       20   0  16420 16420  8420 S  0.1  0.2  1:12.08      └─ /usr/local/bin/node_exporter');
    } else {
      rows.slice().sort(function (a, b) { return b.cpu - a.cpu; }).forEach(function (r) {
        out.push(U.padLeft(String(r.pid), 7) + ' ' + U.pad(r.user, 9) + '  20   0 ' +
          U.padLeft(String(Math.round(r.rss * 3)), 6) + U.padLeft(String(Math.round(r.rss / 1024)) + 'M', 6) + ' ' +
          U.padLeft('4212', 5) + ' S ' + U.padLeft(r.cpu.toFixed(1), 5) + U.padLeft(r.mem.toFixed(1), 5) + ' ' +
          U.padLeft('12:41.22', 8) + '  ' + r.cmd);
      });
    }
    out.push('');
    out.push('F1Help  F2Setup F3Search F4Filter F5Tree  F6SortBy F7Nice- F8Nice+ F9Kill  F10Quit');
    out.push('');
    out.push('（教学环境是静态快照；真机上 htop 是可交互彩色界面：F6 换排序字段、F5 树形、F9 发信号、鼠标可点）');
    return ok(out);
  };

  /* ---------- /proc 关键文件：termfs 里已有一批，缺失的在 fsAdd 里补齐 ---------- */
  OPS.procinfo = function (argv, ctx, stdin, HOST) {
    var mi = U.findNode(ctx.root, '/proc/meminfo');
    if (!mi) return fail(['/proc 未挂载']);
    return ok(U.splitLines(mi.content));
  };

  /* ---------- strace：看系统调用与耗时（-c 统计 / -e trace= / -o 写文件） ---------- */
  var STRACE_SYSCALLS = [
    { name: 'epoll_wait', calls: 18422, errors: 0, time: 4218420, us: 229.02 },
    { name: 'futex', calls: 4218, errors: 12, time: 184220, us: 43.67 },
    { name: 'read', calls: 28422, errors: 0, time: 184220, us: 6.48 },
    { name: 'write', calls: 18422, errors: 0, time: 142880, us: 7.75 },
    { name: 'sendto', calls: 8842, errors: 0, time: 88422, us: 10.00 },
    { name: 'recvfrom', calls: 8841, errors: 0, time: 92184, us: 10.42 },
    { name: 'openat', calls: 1842, errors: 0, time: 42118, us: 22.86 },
    { name: 'close', calls: 1840, errors: 0, time: 18422, us: 10.01 },
    { name: 'mmap', calls: 842, errors: 0, time: 28422, us: 33.75 },
    { name: 'clock_nanosleep', calls: 421, errors: 0, time: 421840, us: 1001.99 },
    { name: 'fsync', calls: 42, errors: 0, time: 1842200, us: 43861.90 }
  ];
  OPS.strace = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'p:,o:,e:,s:,P:,u:,f,F,t,T,t,t,t,v,x,a:,I:,X:,y,Y,k,q,qq,c,C,w,z,Z,i,b');
    var pid = P.opts.p ? Number(P.opts.p) : null;
    var pidArg = P.args.filter(function (a) { return /^\d+$/.test(String(a)); })[0];
    if (!pid && pidArg) pid = Number(pidArg);
    var outFile = P.opts.o;
    var traceOnly = P.opts.e || '';
    var summary = !!P.flags.c || !!P.flags.C;
    if (!pid) {
      return fail(['strace: 需要指定进程或要执行的命令',
                   '用法：strace -f -T -tt -p 18442 -o /tmp/strace-18442.log',
                   '（-p 后面是 PID；本站仿真的应用进程是 18442）']);
    }
    var proc = procByPid(pid);
    if (!proc) {
      return fail(['strace: Cannot attach to pid ' + pid + ': No such process',
                   '（先确认进程还在：ps -ef | grep ' + pid + '；本站仿真的应用进程是 18442）']);
    }
    var lines = [];
    var isNet = /network/i.test(traceOnly);
    var isFile = /file/i.test(traceOnly);
    if (summary) {
      lines.push('% time     seconds  usecs/call     calls    errors syscall');
      lines.push('------ ----------- ----------- --------- --------- ----------------');
      var totalUs = STRACE_SYSCALLS.reduce(function (a, s) { return a + s.time; }, 0);
      STRACE_SYSCALLS.forEach(function (s) {
        if (isNet && ['sendto', 'recvfrom', 'epoll_wait', 'futex'].indexOf(s.name) === -1) return;
        if (isFile && ['read', 'write', 'openat', 'close', 'fsync', 'mmap'].indexOf(s.name) === -1) return;
        lines.push(U.padLeft((s.time / totalUs * 100).toFixed(2), 6) + ' ' + U.padLeft((s.time / 1000000).toFixed(6), 11) + ' ' +
          U.padLeft(s.us.toFixed(0), 11) + ' ' + U.padLeft(String(s.calls), 9) + ' ' + U.padLeft(String(s.errors || ''), 9) + ' ' + s.name);
      });
      lines.push('------ ----------- ----------- --------- --------- ----------------');
      lines.push('100.00    4.984220                  69852        12 total');
      lines.push('');
      lines.push('（-c 只输出统计：epoll_wait 占了大头说明进程大部分时间在**空等**，');
      lines.push('  fsync 的 usecs/call 43861 才是最可疑的 —— 一次 fsync 要 43ms，和 vdb 的 w_await 42ms 对上了）');
    } else {
      var base = 1287778.118220;
      var seq = [
        'epoll_wait(7, [{EPOLLIN, {u32=18442, u64=18442}}], 8192, 1000) = 1 <0.998842>',
        'accept4(6, {sa_family=AF_INET, sin_port=htons(51234), sin_addr=inet_addr("203.0.113.25")}, [128 => 16], SOCK_CLOEXEC) = 184 <0.042118>',
        'read(184, "GET /api/orders/8812 HTTP/1.1\\r\\n"..., 8192) = 842 <0.018420>',
        'openat(AT_FDCWD, "/etc/my.cnf", O_RDONLY|O_CLOEXEC) = 185 <0.022118>',
        'futex(0x7f8a4c1a29d0, FUTEX_WAIT_BITSET_PRIVATE|FUTEX_CLOCK_REALTIME, 0, NULL, 0xffffffff) = 0 <0.184220>',
        'clock_nanosleep(CLOCK_MONOTONIC, 0, {tv_sec=0, tv_nsec=1000000}, NULL) = 0 <1.001842>',
        'sendto(185, "GET /api/orders/8812 HTTP/1.1\\r\\nHost"..., 128, MSG_NOSIGNAL, NULL, 0) = 128 <0.010118>',
        'recvfrom(185, 0x7f8a4c2a1000, 8192, 0, NULL, NULL) = -1 EAGAIN (Resource temporarily unavailable) <0.008842>',
        'write(1, "query timeout after 5000ms, orde"..., 68) = 68 <0.007118>',
        'fsync(186) = 0 <43.861904>',
        'close(186) = 0 <0.010118>',
        'epoll_wait(7, [], 8192, 1000) = 0 <0.998420>'
      ];
      seq.forEach(function (l, i) {
        if (isNet && !/sendto|recvfrom|epoll_wait|accept4/.test(l)) return;
        if (isFile && !/openat|read|write|close|fsync/.test(l)) return;
        lines.push('09:51:' + U.padLeft(String(10 + i), 2) + '.118220 ' + l.replace('<', '<' + (base / 1000000).toFixed(6).slice(0, 0)));
      });
    }
    var res = ok(lines);
    if (outFile) {
      /* -o 写文件：像真机一样把 strace 输出落到文件里（这样后续 grep 才有东西可查） */
      var abs = U.resolvePath(ctx.cwd, outFile);
      var dir = U.findNode(ctx.root, U.parentOf(abs));
      if (!dir || dir.type !== 'dir') return fail(['strace: Can\'t open ' + outFile + ': No such file or directory']);
      var payload = lines.join('\n') + '\n';
      var exist = U.findNode(ctx.root, abs);
      if (exist && exist.type === 'file') { exist.content = payload; exist.mtime = '2024-03-18 09:51'; }
      else {
        dir.children[U.baseName(abs)] = { type: 'file', name: U.baseName(abs), children: null, content: payload, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:51', target: null };
      }
      res = ok(['（strace 输出已写入 ' + outFile + '）',
                '（教学环境不真的 attach 进程；真机上这条命令会跟踪 ' + pid + ' 的系统调用，',
                '  -f 跟线程、-T 显示每次调用耗时、-tt 打绝对时间戳。生产上务必用 timeout 限时，' +
                'strace 会把目标进程拖慢几倍）']);
      res.stillWrite = null;
      return res;
    }
    return res;
  };

  /* ---------- perf：采样式剖析 ---------- */
  OPS.perf = function (argv, ctx, stdin, HOST) {
    var sub = argv[0] || 'top';
    var P = parseArgs(argv.slice(1), 'p:,F:,g:,e:,a:,o:,i:,s:,d:,f:,c:,C:,E:,G:,U:,u:,t:,z:,n:,v,K,k,q,b,N,I:,M:,x:,S:,D,,d');
    var targets = P.args;
    var pid = P.opts.p ? Number(P.opts.p) : null;
    var syms = [
      { s: '[kernel.kallsyms]', f: 'native_queued_spin_lock_slowpath', pct: 18.42 },
      { s: '[kernel.kallsyms]', f: 'tcp_sendmsg_locked', pct: 12.18 },
      { s: '[kernel.kallsyms]', f: 'ext4_file_write_iter', pct: 10.44 },
      { s: 'libjvm.so', f: 'G1ParScanThreadState::copy_to_survivor_space', pct: 9.82 },
      { s: 'libjvm.so', f: 'ParallelTaskTerminator::offer_termination', pct: 8.18 },
      { s: 'libc-2.28.so', f: '__memmove_avx_unaligned_erms', pct: 6.42 },
      { s: 'libjvm.so', f: 'ObjectSynchronizer::fast_enter', pct: 5.88 },
      { s: 'libmysqlclient.so', f: 'cli_read_rows', pct: 5.12 },
      { s: 'libjvm.so', f: 'JvmtiExport::post_class_load', pct: 3.44 },
      { s: '[kernel.kallsyms]', f: 'do_syscall_64', pct: 3.12 },
      { s: 'app.jar', f: 'com.example.orders.OrderService.queryOrder', pct: 2.84 },
      { s: 'libc-2.28.so', f: 'malloc', pct: 2.18 }
    ];
    if (sub === 'top') {
      var out = ['PerfTop:   18422 irqs/sec  kernel:38.4%  exact:  0.0% [4000Hz cpu-clock], (all, 2 CPU)',
                 '',
                 '    26.18%  [kernel]       [k] native_queued_spin_lock_slowpath',
                 '    12.44%  [kernel]       [k] tcp_sendmsg_locked',
                 '    10.82%  [kernel]       [k] ext4_file_write_iter',
                 '     9.18%  libjvm.so      [.] G1ParScanThreadState::copy_to_survivor_space',
                 '     7.42%  libjvm.so      [.] ObjectSynchronizer::fast_enter',
                 '     6.18%  [kernel]       [k] _raw_spin_lock_irqsave',
                 '     5.88%  libc-2.28.so   [.] __memmove_avx_unaligned_erms',
                 '     4.12%  libmysqlclient [.] cli_read_rows',
                 '     3.44%  libjvm.so      [.] JvmtiExport::post_class_load',
                 '     2.98%  app.jar        [.] com.example.orders.OrderService.queryOrder'];
      out.push('');
      out.push('（教学环境是静态采样快照；真机上 perf top 实时刷新，按 q 退出、按 E 展开调用链）');
      if (pid) {
        out.push('');
        out.push('（-p ' + pid + '：采样范围限定在 java 进程 —— 热点集中在 G1 GC 与 spinlock 竞争上，');
        out.push('  和 GC 日志里那些 Pause Full 1218~2210ms 的停顿是同一个原因）');
      }
      return ok(out);
    }
    if (sub === 'record') {
      var secs = 30;
      var si = argv.indexOf('sleep');
      if (si !== -1 && argv[si + 1]) secs = Number(argv[si + 1]);
      return ok(['[ perf record: Woken up 184 times to write data ]',
                 '[ perf record: Captured and wrote ' + Math.round(secs * 0.42) + ' MB perf.data (' + (secs * 1042) + ' samples) ]',
                 '',
                 '（教学环境不真的采样；真机上这条命令会在 ' + secs + ' 秒内记录调用栈，',
                 '  接着 `perf report --stdio` 看排序、`perf script` 导出给 FlameGraph 生成火焰图）']);
    }
    if (sub === 'report') {
      var rep = ['# To display the perf.data header info, please use --header/--header-only options.',
                 '#',
                 '# Samples: 31K of event \'cpu-clock:ppp\', Event count (approx.): 18842200000',
                 '#',
                 '# Overhead  Command   Shared Object       Symbol',
                 '# ........  ........  .................  .......................................'];
      syms.forEach(function (x) {
        rep.push('     ' + U.padLeft(x.pct.toFixed(2) + '%', 7) + '  ' + U.pad('java', 8) + '  ' + U.pad(x.s, 17) + '  ' + x.f);
      });
      rep.push('');
      rep.push('（--stdio 纯文本输出，方便管进文件；符号占比最高的就是最该优化的地方）');
      return ok(rep);
    }
    if (sub === 'script') {
      var sc = ['java 18442 1287395.442118: 188422000 cpu-clock:',
                '\t    7f8a4c1a2b18 G1ParScanThreadState::copy_to_survivor_space+0x48 (/opt/jdk/lib/libjvm.so)',
                '\t    7f8a4c1a2c40 ParallelTaskTerminator::offer_termination+0x90 (/opt/jdk/lib/libjvm.so)'];
      return ok(sc);
    }
    if (sub === 'stat') {
      return ok(['',
                 ' Performance counter stats for \'sleep 1\':',
                 '',
                 '           1001.42 msec task-clock                #    0.998 CPUs utilized',
                 '                42      context-switches          #   41.940 /sec',
                 '                 2      cpu-migrations            #    1.997 /sec',
                 '              8,842      page-faults               #    8.83 K/sec',
                 '      2,604,000,000      cycles                    #    2.600 GHz',
                 '      1,184,220,000      instructions              #    0.45  insn per cycle',
                 '',
                 '       1.003842011 seconds time elapsed',
                 '',
                 '（perf stat 看的是 IPC 与上下文切换：insn per cycle 0.45 偏低，说明 CPU 大量时间在等内存/锁）']);
    }
    if (sub === 'list') {
      return ok(['List of pre-defined events (to be used in -e):',
                 '',
                 '  cpu-clock                                          [Software event]',
                 '  task-clock                                         [Software event]',
                 '  context-switches OR cs                             [Software event]',
                 '  page-faults OR faults                              [Software event]',
                 '  cycles                                             [Hardware event]',
                 '  instructions                                       [Hardware event]',
                 '  cache-references                                   [Hardware event]',
                 '  cache-misses                                       [Hardware event]',
                 '  sched:sched_switch                                 [Tracepoint event]',
                 '  block:block_rq_issue                               [Tracepoint event]',
                 '  syscalls:sys_enter_openat                          [Tracepoint event]']);
    }
    return fail(['perf: 教学环境支持 top / record / report / script / stat / list 这几个子命令',
                 '（真机上 perf 还有 kmem / lock / sched / trace 等子命令）']);
  };

  /* ---------- bpftrace：一行式 eBPF 追踪 ---------- */
  OPS.bpftrace = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'e:,p:,c:,l:,d:,v,q,B:,I:,o:,f,b,k,dd');
    var script = P.opts.e;
    var pid = P.opts.p ? Number(P.opts.p) : null;
    var listPats = P.flags.l ? (P.args[0] || '') : null;
    if (listPats !== null) {
      var pats = [
        'tracepoint:tcp:tcp_retransmit_skb',
        'tracepoint:tcp:tcp_retransmit_synack',
        'tracepoint:tcp:tcp_send_reset',
        'tracepoint:tcp:tcp_receive_reset',
        'tracepoint:tcp:tcp_destroy_sock',
        'tracepoint:tcp:tcp_probe',
        'tracepoint:tcp:tcp_bad_csum'
      ];
      return ok(pats.filter(function (p) { return !listPats || p.indexOf(String(listPats).replace(/\*/g, '')) !== -1; }));
    }
    if (!script) {
      return fail(['bpftrace: 需要 -e 指定一行式脚本，或用 -l 列出可用的追踪点',
                   '用法：bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'']);
    }
    var s = String(script);
    var out = [];
    if (/raw_syscalls:sys_enter/.test(s) && /count\(\)/.test(s)) {
      out = ['Attaching 1 probe...',
             '^C',
             '',
             '@[mysqld]: 1842204',
             '@[java]: 884213',
             '@[dockerd]: 184220',
             '@[nginx]: 42118',
             '@[redis-server]: 18422',
             '@[node_exporter]: 8842',
             '@[sshd]: 4218',
             '@[systemd]: 1842',
             ''];
      teaching(out, '真机上 bpftrace 会一直统计到 Ctrl+C；教学环境给出的是这份仿真的计数结果');
      return ok(out);
    }
    if (/block:block_rq_issue/.test(s) && /hist/.test(s)) {
      out = ['Attaching 1 probe...',
             '^C',
             '',
             '@bytes[mysqld]:',
             '[128, 256)            42 |@@                                                  |',
             '[256, 512)           184 |@@@@@@@                                             |',
             '[512, 1K)            421 |@@@@@@@@@@@@@@@@                                    |',
             '[1K, 2K)             842 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                    |',
             '[2K, 4K)            1842 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@|',
             '[4K, 8K)             421 |@@@@@@@@@@@@@@@@                                    |',
             '[8K, 16K)             42 |@                                                   |',
             '',
             '@bytes[java]:',
             '[4K, 8K)             884 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@|',
             '[8K, 16K)            184 |@@@@@@@@@@                                          |',
             ''];
      out.push('（vdb 上 4K 随机写占绝对多数 —— 这正是 iostat 里 w/s=142、wareq-sz=128 的来源）');
      return ok(out);
    }
    if (/vfs_read/.test(s) && /hist/.test(s)) {
      out = ['Attaching 2 probes...',
             '^C',
             '',
             '@ns:',
             '[1K, 2K)            1842 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@|',
             '[2K, 4K)             421 |@@@@@@@@@@@                                         |',
             '[4K, 8K)             184 |@@@@@                                               |',
             '[8K, 16K)             42 |@                                                   |',
             '[16K, 32K)             4 |                                                    |',
             ''];
      out.push('（延迟分布明显右偏：绝大多数 read 在 2ms 内，但尾部有到 16~32ms 的 —— 云盘抖动）');
      return ok(out);
    }
    if (/sys_enter_openat/.test(s) && /printf/.test(s)) {
      out = ['Attaching 1 probe...',
             '^C',
             '',
             'java /opt/myapp/app.jar',
             'java /etc/my.cnf',
             'java /data/app/config.yaml',
             'java /opt/myapp/logs/app.log',
             ''];
      if (pid) out.splice(out.length - 1, 0, '（-p ' + pid + '：只跟踪这个进程的 openat）');
      return ok(out);
    }
    if (/tcp_retransmit_skb/.test(s)) {
      out = ['Attaching 1 probe...',
             '^C',
             '',
             '@[java]: 184',
             '@[mysqld]: 42',
             '@[nginx]: 12',
             '',
             '（TCP 重传按进程聚合：java 的重传最多 —— 它同时是 CPU 与网络的重灾区）'];
      return ok(out);
    }
    teaching(out, 'bpftrace 需要真实内核 eBPF 支持，教学环境不真的加载探针');
    out.push('（这一行脚本在真机上会持续输出，Ctrl+C 结束；脚本语法错误时 bpftrace 会在 attach 前就报出来）');
    return ok(out);
  };

  /* ---------- promtool ---------- */
  OPS.promtool = function (argv, ctx, stdin, HOST) {
    var sub = argv[0];
    var rest = argv.slice(1);
    if (sub === 'check') {
      var what = rest[0];
      var files = rest.slice(1).filter(function (a) { return String(a).charAt(0) !== '-'; });
      if (what === 'config') {
        if (!files.length) return fail(['promtool: 需要指定配置文件', '用法：promtool check config /etc/prometheus/prometheus.yml']);
        var out = [], err = [];
        files.forEach(function (f) {
          var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, f));
          if (!node) { err.push('  FAILED: 读取 ' + f + ' 失败: open ' + f + ': no such file or directory'); return; }
          var txt = String(node.content || '');
          if (!/scrape_configs\s*:/.test(txt)) {
            err.push('  FAILED: ' + f + ': 缺少 scrape_configs 段');
            return;
          }
          var jobs = (txt.match(/job_name\s*:/g) || []).length;
          out.push('Checking ' + f);
          out.push('  SUCCESS: ' + jobs + ' rule files found');
          out.push('');
          (txt.match(/rule_files:[\s\S]*?(?=\n\w|$)/) || [''])[0].split('\n').forEach(function (l) {
            var m = l.match(/-\s*(\S+)/);
            if (!m) return;
            var rn = U.findNode(ctx.root, m[1].replace('*', 'node.rules.'));
            if (rn) {
              var groups = (String(rn.content || '').match(/-\s*name\s*:/g) || []).length;
              var rules = (String(rn.content || '').match(/-\s*alert\s*:/g) || []).length +
                (String(rn.content || '').match(/-\s*record\s*:/g) || []).length;
              out.push('  SUCCESS: ' + m[1] + ': ' + groups + ' rules found');
              out.push('    ' + rules + ' rules found in ' + m[1]);
            } else {
              out.push('  SUCCESS: ' + m[1] + ': 0 rules found');
            }
          });
          out.push('');
          out.push('SUCCESS: ' + f + ' is valid prometheus config file syntax');
        });
        if (err.length) return { out: out, err: err, code: 1 };
        return ok(out);
      }
      if (what === 'rules') {
        var realFiles = files.filter(function (f) { return f.indexOf('*') === -1; });
        if (!realFiles.length && files.length) realFiles = ['/etc/prometheus/rules/node.rules.yml'];
        var ro = [], re = [];
        realFiles.forEach(function (f) {
          var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, f));
          if (!node) { re.push('  FAILED: ' + f + ': no such file or directory'); return; }
          var groups = (String(node.content || '').match(/-\s*name\s*:/g) || []).length;
          var rules = (String(node.content || '').match(/-\s*alert\s*:/g) || []).length +
            (String(node.content || '').match(/-\s*record\s*:/g) || []).length;
          ro.push('Checking ' + f);
          ro.push('  SUCCESS: ' + groups + ' rules found');
          ro.push('');
          ro.push('SUCCESS: ' + f + ' is valid prometheus rule file syntax');
        });
        if (re.length) return { out: ro, err: re, code: 1 };
        return ok(ro);
      }
      if (what === 'metrics') {
        return ok(['SUCCESS: 18422 metrics passed']);
      }
      return fail(['promtool: 未知的 check 目标 "' + (what || '') + '"', '（支持 config / rules / metrics / service-discovery）']);
    }
    if (sub === 'query') {
      var mode = rest[0] || 'instant';
      var url = null, expr = null, i;
      for (i = 1; i < rest.length; i++) {
        if (/^https?:\/\//.test(String(rest[i]))) url = rest[i];
        else if (String(rest[i]).charAt(0) !== '-') expr = rest[i];
      }
      if (!url) {
        return fail(['promtool: 需要指定 Prometheus 地址',
                     '用法：promtool query instant http://127.0.0.1:9090 \'up == 0\'',
                     '（集群内先 kubectl port-forward -n monitoring svc/prometheus-server 9090:9090 再查）']);
      }
      if (!/127\.0\.0\.1:9090|localhost:9090/.test(url)) {
        return fail(['promtool: ' + url + ' 连不上（教学环境只仿真了本机 9090 的 Prometheus）']);
      }
      if (mode === 'series' || has(rest, 'series')) {
        var matcher = optValue(argv, '--match') || '{job="node"}';
        return ok(['{__name__="up", instance="10.0.1.23:9100", job="node"}',
                   '{__name__="up", instance="10.0.1.24:9100", job="node"}',
                   '{__name__="node_load1", instance="10.0.1.23:9100", job="node"}',
                   '{__name__="node_memory_MemAvailable_bytes", instance="10.0.1.23:9100", job="node"}',
                   '{__name__="node_filesystem_avail_bytes", instance="10.0.1.23:9100", job="node", mountpoint="/data"}',
                   '',
                   '（检索条件：' + matcher + '）']);
      }
      if (mode === 'range' || has(rest, 'range')) {
        return ok(['2024-03-18T09:00:00Z  0.618',
                   '2024-03-18T09:01:00Z  0.622',
                   '2024-03-18T09:02:00Z  0.604',
                   '2024-03-18T09:03:00Z  0.588',
                   '2024-03-18T09:04:00Z  0.612',
                   '2024-03-18T09:05:00Z  0.634',
                   '',
                   '（range 查询：--start/--end/--step 控制时间窗与步长，用来复盘事故时间段）']);
      }
      if (!expr) {
        return fail(['promtool: 需要给出查询表达式', '用法：promtool query instant http://127.0.0.1:9090 \'up == 0\'']);
      }
      if (/up\s*==\s*0/.test(expr)) {
        return ok(['{} => 0 @[1710727860.000]',
                   '',
                   '（有一条 {} => 0 —— 说明有抓取目标失联；真机上再用 `up` 看是哪台）']);
      }
      if (/node_memory_MemAvailable_bytes/.test(expr)) {
        return ok(['{instance="10.0.1.23:9100", job="node"} => 1.0762 @[1710727860.000]',
                   '',
                   '（1128404 kB / 1024 / 1024 / 1024 = 1.0762 GiB —— 与 /proc/meminfo 的 MemAvailable 完全一致）']);
      }
      if (/node_filesystem_avail_bytes/.test(expr)) {
        return ok(['{device="/dev/vdb1", fstype="ext4", instance="10.0.1.23:9100", job="node", mountpoint="/data"} => 1288490188.8 @[1710727860.000]',
                   '',
                   '（/data 只剩 1.2 GB，使用率 100% —— 与 df -h 的输出对得上）']);
      }
      if (/node_load1/.test(expr)) {
        return ok(['{instance="10.0.1.23:9100", job="node"} => 0.42 @[1710727860.000]',
                   '',
                   '（node_load1 0.42 与 uptime 的第一段一致）']);
      }
      if (/rate\(node_cpu_seconds_total/.test(expr)) {
        return ok(['{instance="10.0.1.23:9100", job="node", mode="idle"} => 0.6184 @[1710727860.000]',
                   '',
                   '（idle 比例 61.84% → CPU 使用率 = 100 - 61.84 = 38.16%，与 top 的 %Cpu(s) 对得上）']);
      }
      return ok(['{} => 0 @[1710727860.000]',
                 '',
                 '（教学环境只内置了几个常用表达式的仿真结果；写告警前先用 promtool query instant 验证一遍）']);
    }
    if (sub === 'test') {
      return ok(['SUCCESS', '', '（promtool test rules 会按单元测试文件里的输入序列验证告警是否按预期触发）']);
    }
    return fail(['promtool: 未知的子命令 "' + (sub || '') + '"',
                 '（教学环境支持 check / query / test；真机上还有 tsdb、push、prometheus 等）']);
  };

  /* ---------- amtool：告警查询与静默 ---------- */
  var ALERTS = [
    { name: 'NodeDown', sev: 'critical', inst: '10.0.1.24:9100', state: 'active', sum: '实例 10.0.1.24:9100 失联', start: '2024-03-18 09:41:12' },
    { name: 'DiskWillFillIn4Hours', sev: 'warning', inst: '10.0.1.23:9100', state: 'active', sum: '/data 预计 4 小时内写满', start: '2024-03-18 09:30:04' },
    { name: 'HighIOWait', sev: 'warning', inst: '10.0.1.23:9100', state: 'active', sum: 'iowait 连续 10 分钟 > 20%', start: '2024-03-18 09:44:18' },
    { name: 'MySQLDown', sev: 'critical', inst: '10.0.1.23:9100', state: 'suppressed', sum: 'mysqld 进程不存在', start: '2024-03-18 09:47:42' },
    { name: 'HighCPU', sev: 'warning', inst: '10.0.1.23:9100', state: 'resolved', sum: 'CPU 使用率 > 80%', start: '2024-03-18 08:12:00' }
  ];
  OPS.amtool = function (argv, ctx, stdin, HOST) {
    var url = optValue(argv, '--alertmanager.url') || 'http://127.0.0.1:9093';
    var rest = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.indexOf('--alertmanager.url') === 0) { if (a.indexOf('=') === -1) i++; continue; }
      rest.push(a);
    }
    var sub = rest[0];
    if (!/127\.0\.0\.1:9093|localhost:9093/.test(url)) {
      return fail(['amtool: ' + url + ' 连不上（教学环境只仿真了本机 9093 的 Alertmanager）']);
    }
    if (sub === 'alert') {
      var what = rest[1] || 'query';
      if (what !== 'query') return fail(['amtool: 未知的 alert 子命令 "' + what + '"']);
      var activeOnly = has(rest, '--active');
      var rows = ALERTS.filter(function (a) { return !activeOnly || a.state === 'active'; });
      var out = ['Alertname                    Severity  Instance        State       Summary'];
      rows.forEach(function (a) {
        out.push(U.pad(a.name, 29) + U.pad(a.sev, 10) + U.pad(a.inst, 16) + U.pad(a.state, 12) + a.sum);
      });
      if (!activeOnly) out.push('');
      if (!activeOnly) out.push('（State: active=正在告警、suppressed=被静默、resolved=已恢复；--active 只看还没恢复的）');
      return ok(out);
    }
    if (sub === 'silence') {
      var act = rest[1] || 'add';
      if (act === 'add') {
        var dur = optValue(argv, '--duration') || '2h';
        var comment = optValue(argv, '--comment') || '';
        var matchers = rest.slice(2).filter(function (x) { return String(x).indexOf('=') !== -1 && String(x).charAt(0) !== '-'; });
        var out2 = ['Silence added:',
                    '  ID:        8842d1a8-4c1e-4c7b-9a21-0f3e6b8d51a4',
                    '  Matchers: ' + (matchers.length ? matchers.join(', ') : '（无）'),
                    '  Starts at: 2024-03-18 09:51:00 CST',
                    '  Ends at:   2024-03-18 11:51:00 CST',
                    '  Created by: root',
                    '  Comment:   ' + comment];
        out2.push('');
        out2.push('（静默窗口 ' + dur + '：维护期间不再打扰值班人。真机上 amtool silence add 会真的写进 Alertmanager）');
        return ok(out2);
      }
      if (act === 'query') {
        return ok(['ID                                    Matchers                        Ends at',
                   '8842d1a8-4c1e-4c7b-9a21-0f3e6b8d51a4  alertname=MySQLDown             2024-03-18 11:51:00']);
      }
      if (act === 'expire') return ok(['Silence expired.']);
      return fail(['amtool: 未知的 silence 子命令 "' + act + '"']);
    }
    if (sub === 'check-config') {
      var f = rest[1];
      if (!f) return fail(['amtool: 需要指定配置文件', '用法：amtool check-config /etc/alertmanager/alertmanager.yml']);
      var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, f));
      if (!node) return fail(['amtool: "open ' + f + '": no such file or directory']);
      var txt = String(node.content || '');
      var errs = [];
      if (!/route\s*:/.test(txt)) errs.push(f + ': 缺少 route 段');
      if (!/receivers\s*:/.test(txt)) errs.push(f + ': 缺少 receivers 段');
      var recvNames = (txt.match(/-\s*name:\s*(\S+)/g) || []).map(function (s) { return s.split(':')[1].trim(); });
      (txt.match(/receiver:\s*(\S+)/g) || []).forEach(function (s) {
        var n = s.split(':')[1].trim();
        if (recvNames.indexOf(n) === -1) errs.push(f + ': route 引用了不存在的 receiver "' + n + '"');
      });
      if (errs.length) return { out: ['Checking \'' + f + '\'  FAILED: ' + errs.join('; ')], err: errs, code: 1 };
      return ok(['Checking \'' + f + '\'  SUCCESS',
                 'Found:',
                 ' - global config',
                 ' - 1 route',
                 ' - ' + recvNames.length + ' receivers']);
    }
    if (sub === 'config') {
      var what2 = rest[1];
      if (what2 === 'routes') {
        var f2 = optValue(argv, '--config.file') || '/etc/alertmanager/alertmanager.yml';
        var labels = rest.slice(3).filter(function (x) { return String(x).indexOf('=') !== -1; });
        var wantSev = null;
        labels.forEach(function (l) { var m = String(l).match(/^severity=(.*)$/); if (m) wantSev = m[1]; });
        var tree = ['Matching routes:',
                    'default (receiver=default)',
                    '├── severity="critical" (receiver=db-oncall)'];
        if (wantSev === 'critical') {
          tree.push('');
          tree.push('Matched route: severity="critical" → receiver=db-oncall');
          tree.push('（验证路由树：critical 的告警会发给 db-oncall，其余落到 default）');
        } else {
          tree.push('');
          tree.push('Matched route: default → receiver=default');
        }
        if (!U.findNode(ctx.root, f2)) tree.push('', '（注意：' + f2 + ' 不存在，真机上会先报文件读不到）');
        return ok(tree);
      }
      return fail(['amtool: 未知的 config 子命令 "' + (what2 || '') + '"', '（支持 routes test）']);
    }
    return fail(['amtool: 未知的子命令 "' + (sub || '') + '"',
                 '（教学环境支持 alert query / silence add / check-config / config routes test）']);
  };

  /* ---------- zabbix_get / zabbix_agentd ---------- */
  var ZABBIX_KEYS = {
    'agent.ping': { v: '1', d: 'agent 在线（返回 1 就说明网络与 agent 都正常）' },
    'agent.version': { v: '6.0.14', d: 'agent 版本' },
    'system.cpu.load[all,avg1]': { v: '0.42', d: '1 分钟平均负载（与 uptime 第一段一致）' },
    'system.cpu.load[all,avg5]': { v: '0.68', d: '5 分钟平均负载' },
    'system.cpu.util': { v: '38.4000', d: 'CPU 使用率 %（100 - idle 61.6）' },
    'vfs.fs.size[/data,pfree]': { v: '0', d: '/data 剩余百分比 —— 0% 正好用来验证磁盘告警' },
    'vfs.fs.size[/data,free]': { v: '1288490188', d: '/data 剩余字节（1.2G）' },
    'vfs.fs.size[/data,total]': { v: '214748364800', d: '/data 总容量（200G）' },
    'vfs.fs.inode[/data,pfree]': { v: '0.0684', d: '/data inode 剩余百分比（8967/13107200）' },
    'proc.num[mysqld]': { v: '1', d: 'mysqld 进程数' },
    'proc.num[java]': { v: '1', d: 'java 进程数（应用 18442）' },
    'net.if.in[eth0]': { v: '2840192', d: 'eth0 入流量（字节/秒）' },
    'net.if.out[eth0]': { v: '4218402', d: 'eth0 出流量（字节/秒）' },
    'vm.memory.size[available]': { v: '1155485696', d: '可用内存字节（1.1 GiB）' },
    'vm.memory.size[total]': { v: '8148156416', d: '内存总量字节' },
    'system.uptime': { v: '1283947', d: '开机时长（秒）= 14 天 20 小时' },
    'system.swap.size[,free]': { v: '2147483648', d: 'swap 剩余（2G，和 free -h 的 Swap free 一致）' },
    'myapp.proc': { v: '1', d: '自定义 UserParameter：应用进程数' }
  };
  function zabbixLookup(key) {
    if (ZABBIX_KEYS[key]) return ZABBIX_KEYS[key];
    var m = String(key).match(/^vfs\.fs\.size\[(.+),pfree\]$/);
    if (m) {
      var row = fsByDevOrMount(m[1]);
      if (row) return { v: String(Math.round(parseFloat(row.pct) === 100 ? 0 : (100 - parseFloat(row.pct)))), d: m[1] + ' 剩余百分比' };
    }
    return null;
  }
  OPS.zabbix_get = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 's:,p:,k:,t:,I:,v');
    var server = P.opts.s || '127.0.0.1';
    var port = P.opts.p || '10050';
    var key = P.opts.k;
    var timeout = P.opts.t || '30';
    if (!key) return fail(['zabbix_get: 需要 -k 指定监控项 key', '用法：zabbix_get -s 10.0.1.23 -p 10050 -k "agent.ping"']);
    if (server !== '10.0.1.23' && server !== '127.0.0.1' && server !== 'localhost') {
      return fail(['zabbix_get [1710727860]: Get value error: cannot connect to [[' + server + ']:' + port + ']: [Connection refused]',
                   '（教学环境只有 10.0.1.23 这台被监控主机的仿真数据）']);
    }
    var hit = zabbixLookup(key);
    if (!hit) {
      return fail(['ZBX_NOTSUPPORTED: Unsupported item key.',
                   '（教学环境收录的 key 有限：agent.ping / system.cpu.load / vfs.fs.size / proc.num / net.if.in|out / vm.memory.size / system.uptime / system.swap.size 等。',
                   '  真机上 key 写错就是这个报错 —— 先在 agent 本机用 zabbix_agentd -t 试同一个 key）']);
    }
    return ok([hit.v, '', '（' + hit.d + '；超时设置 -t ' + timeout + 's）']);
  };
  OPS.zabbix_agentd = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'c:,t:,p:,R:,T,v,h,f:,n:,N');
    var conf = P.opts.c || '/etc/zabbix/zabbix_agentd.conf';
    var key = P.opts.t;
    var print = !!P.flags.p;
    var runtime = P.opts.R;
    var syntaxTest = !!P.flags.T;
    if (!U.findNode(ctx.root, U.resolvePath(ctx.cwd, conf))) {
      return fail(['zabbix_agentd [1710727860]: cannot open config file "' + conf + '": [2] No such file or directory']);
    }
    if (syntaxTest) {
      return ok(['zabbix_agentd [1710727860]: using config file: ' + conf,
                 'zabbix_agentd [1710727860]: config file syntax is valid']);
    }
    if (runtime) {
      if (runtime !== 'userparameter_reload') {
        return fail(['zabbix_agentd: 未知的运行时控制命令 "' + runtime + '"',
                     '（常用：userparameter_reload / log_level_increase / log_level_decrease）']);
      }
      return ok(['zabbix_agentd [1710727860]: runtime control command sent: userparameter_reload',
                 '',
                 '（改完 UserParameter 不用重启 agent，热加载即可生效）']);
    }
    if (print) {
      return ok(['agent.ping                                    [d|1]',
                 'agent.version                                 [d|6.0.14]',
                 'system.cpu.load[all,avg1]                     [d|0.42]',
                 'system.cpu.util                               [d|38.4000]',
                 'vfs.fs.size[/data,pfree]                      [d|0]',
                 'proc.num[mysqld]                              [d|1]',
                 'net.if.in[eth0]                               [d|2840192]',
                 'vm.memory.size[available]                     [d|1155485696]',
                 'myapp.proc                                    [d|1]',
                 '',
                 '（-p 列出所有已注册的 key；自定义 key 不在列表里说明 UserParameter 没生效）']);
    }
    if (!key) return fail(['zabbix_agentd: 需要 -c 配置文件与 -t <key>（或用 -p 列出所有 key）']);
    var hit = zabbixLookup(key);
    if (!hit) {
      return fail(['zabbix_agentd [1710727860]: Support for the key "' + key + '" is not present',
                   '（key 拼写或参数写错。先用 zabbix_agentd -c ' + conf + ' -p | grep 关键词 看有没有这个 key）']);
    }
    return ok([key + '                                   [d|' + hit.v + ']',
               '',
               '（[d|值] = 本机直接取值成功；[m|值] 表示来自 agent 主进程缓存）']);
  };

  /* ---------- 日志工具：logrotate / rsyslogd / lastb / lnav / multitail ---------- */
  OPS['systemd-tmpfiles'] = function (argv, ctx, stdin, HOST) {
    var create = has(argv, '--create') || has(argv, '-c');
    var prefix = optValue(argv, '--prefix') || '';
    if (create && prefix) {
      var abs = U.resolvePath(ctx.cwd, prefix);
      var dir = U.findNode(ctx.root, U.parentOf(abs));
      if (!dir || dir.type !== 'dir') {
        return fail(['Failed to create directory ' + prefix + ': No such file or directory',
                     '（先 mkdir -p ' + prefix + '，再 systemd-tmpfiles --create --prefix ' + prefix + '）']);
      }
      if (!U.findNode(ctx.root, abs)) {
        dir.children[U.baseName(abs)] = { type: 'dir', name: U.baseName(abs), children: {}, mode: '2755', user: 'root', group: 'systemd-journal', mtime: '2024-03-18 09:51', target: null };
      }
      var n = U.findNode(ctx.root, abs);
      n.user = 'root'; n.group = 'systemd-journal'; n.mode = '2755';
      return ok(['（教学环境：已按 tmpfiles.d 规则把 ' + prefix + ' 的属主与权限设成 root:systemd-journal 2755。',
                 '  真机上 systemd-tmpfiles --create 会按 /usr/lib/tmpfiles.d/*.conf 建目录/改属主/清过期文件，',
                 '  是让 journald 日志**持久化落盘**的标准三步之一（mkdir + tmpfiles + restart systemd-journald））']);
    }
    if (has(argv, '--clean')) return ok(['（教学环境：真机上 --clean 会按 Age 规则删掉超期文件，日志清理常靠它）']);
    return fail(['systemd-tmpfiles: 需要指定动作', '用法：systemd-tmpfiles --create --prefix /var/log/journal']);
  };

  OPS.logrotate = function (argv, ctx, stdin, HOST) {    var P = parseArgs(argv, 'd,v,f,s:,m:,l:,n:,w:,z,Z,state:,force');
    var dry = !!P.flags.d;
    var force = !!P.flags.f || !!P.flags.force;
    var verbose = !!P.flags.v;
    var conf = P.args[0] || '/etc/logrotate.conf';
    var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, conf));
    if (!node) return fail(['error: stat of ' + conf + ' failed: No such file or directory']);
    var txt = String(node.content || '');
    var target = (txt.match(/^(\S+)\s*\{/m) || [])[1] || '/var/log/messages';
    var out = [];
    if (dry) {
      out.push('reading config file ' + conf);
      out.push('Reading state from file: /var/lib/logrotate/logrotate.status');
      out.push('Allocating hash table for state file, size 64 entries');
      out.push('');
      out.push('Handling 1 logs');
      out.push('');
      out.push('rotating pattern: ' + target + '  after 1 days (7 rotations)');
      out.push('empty log files are not rotated, old logs are removed');
      out.push('considering log ' + target);
      out.push('  Now: 2024-03-18 09:51');
      out.push('  Last rotated at 2024-03-18 03:00');
      out.push('  log does not need rotating (log has already been rotated)');
      out.push('');
      out.push('（-d 演练模式：只打印会做什么，**一个文件都不动**；改完配置先跑它）');
      return ok(out);
    }
    if (verbose || force) {
      var t = U.findNode(ctx.root, target);
      var size = t ? (t.explicitSize || String(t.content || '').length) : 165150720;
      out.push('reading config file ' + conf);
      out.push('Reading state from file: /var/lib/logrotate/logrotate.status');
      out.push('Handling 1 logs');
      out.push('');
      out.push('rotating pattern: ' + target + '  forced from command line (7 rotations)');
      out.push('empty log files are not rotated, old logs are removed');
      out.push('considering log ' + target);
      out.push('  Now: 2024-03-18 09:51');
      out.push('  Last rotated at 2024-03-18 03:00');
      out.push('  log needs rotating');
      if (t && t.type === 'file') {
        /* createcopytruncate：真机上会把内容落到 app.log-20240318 并把原文件清零 */
        var dir = U.findNode(ctx.root, U.parentOf(target));
        var base = U.baseName(target);
        var rotated = base + '-20240318';
        if (dir && !dir.children[rotated]) {
          dir.children[rotated] = { type: 'file', name: rotated, children: null, content: t.content, mode: t.mode, user: t.user, group: t.group, mtime: '2024-03-18 09:51', target: null, explicitSize: t.explicitSize };
        }
        t.content = '';
        t.explicitSize = 0;
        t.mtime = '2024-03-18 09:51';
        out.push('rotating log ' + target + ', log->rotateCount is 7');
        out.push('dateext suffix \'-20240318\'');
        out.push('glob pattern \'-20240318\'');
        out.push('renaming ' + target + ' to ' + target + '-20240318');
        out.push('creating new ' + target + ' (copytruncate: 原文件已清空，句柄不变)');
      }
      out.push('running postrotate script');
      out.push('');
      out.push('（真机上这一步真的切了文件；教学环境按 -f 的语义改虚拟文件系统，' +
        '所以接着 `ls -l ' + (U.parentOf(target) || '/data/app/logs') + '` 能看到新文件）');
      return ok(out);
    }
    return ok([]);
  };
  OPS.rsyslogd = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'f:,i:,n:,N:,d:,v:,C:,F');
    var check = P.opts.N !== undefined || !!P.flags.N;
    var level = P.opts.N || '1';
    var forward = /@@?\d+\.\d+\.\d+\.\d+/.test(argv.join(' '));
    if (forward) {
      return fail(['rsyslogd: 这是 rsyslog.conf 里的一行转发规则，不是可以单独执行的命令',
                   '（写进 /etc/rsyslog.conf 后 `systemctl restart rsyslog` 生效：',
                   '   *.* @@10.0.1.100:514 = TCP 转发，单个 @ 是 UDP；跨机房集中日志常用它）']);
    }
    if (check) {
      if (level !== '1') {
        return fail(['rsyslogd: version 8.2102.0-7.el8, config validation run (level ' + level + '), master PID now 88422',
                     'rsyslogd: WARNING: 教学环境只做 level 1 的语法检查']);
      }
      return ok(['rsyslogd: version 8.2102.0-7.el8, config validation run (level 1), master PID now 88422',
                 'rsyslogd: End of config validation run. Bye.',
                 '',
                 '（-N1 = 只检查配置语法不启动；改完规则先跑它，通过了再 systemctl restart rsyslog）']);
    }
    return fail(['rsyslogd: 教学环境不支持在前台启动守护进程',
                 '（语法检查用 rsyslogd -N1；启停服务用 systemctl start|restart rsyslog）']);
  };
  OPS.lastb = function (argv, ctx, stdin, HOST) {
    var lines = [
      'admin    ssh:notty    198.51.100.77    Mon Mar 18 09:02   still logged in',
      'root     ssh:notty    198.51.100.77    Mon Mar 18 09:02   still logged in',
      'test     ssh:notty    198.51.100.77    Mon Mar 18 09:02   still logged in',
      'oracle   ssh:notty    198.51.100.77    Sun Mar 17 22:41 - 22:41  (00:00)',
      'postgres ssh:notty    203.0.113.91     Sun Mar 17 21:18 - 21:18  (00:00)',
      'admin    ssh:notty    198.51.100.77    Sun Mar 17 20:02 - 20:02  (00:00)',
      '',
      'btmp begins Sun Mar 17 20:02:11 2024'
    ];
    return ok(lines.slice(0, 20));
  };
  OPS.lnav = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'r,c,t:,q,h,v,V,C,I:,f:');
    var recursive = !!P.flags.r;
    var targets = P.args;
    if (!targets.length) return fail(['lnav: 需要指定日志文件或目录', '用法：lnav /data/app/logs/app.log']);
    var out = [];
    targets.forEach(function (t) {
      if (t.indexOf('*') !== -1) {
        out.push('（教学环境不做通配符展开：真机上 lnav /var/log/nginx/access.log* 会把切割过的多个文件按时间轴合并）');
        return;
      }
      var abs = U.resolvePath(ctx.cwd, t);
      var node = U.findNode(ctx.root, abs);
      if (!node) { out.push('lnav: ' + t + ': No such file or directory'); return; }
      if (node.type === 'dir') {
        var files = [];
        U.walkFiles(node, abs, function (c, p) { if (c.type === 'file') files.push(p); });
        out.push('lnav: 打开目录 ' + abs + '（' + (recursive ? '递归' : '一层') + '），发现 ' + Math.min(files.length, 8) + ' 个文件');
        files.slice(0, 8).forEach(function (p) { out.push('  ' + p); });
        return;
      }
      var text = String(node.content || '');
      var lines = U.splitLines(text);
      var errs = lines.filter(function (l) { return /ERROR|error|timeout/.test(l); }).length;
      var warns = lines.filter(function (l) { return /WARN|warn/.test(l); }).length;
      out.push('lnav ' + t + '：' + lines.length + ' 行，其中 ERROR ' + errs + ' 条、WARN ' + warns + ' 条');
      out.push('  ' + (lines[0] || ''));
      out.push('  ' + (lines[lines.length - 1] || ''));
      out.push('  时间范围：' + (lines[0] || '').slice(0, 19) + ' ~ ' + (lines[lines.length - 1] || '').slice(0, 19));
    });
    out.push('');
    out.push('（教学环境不打开全屏界面。真机上 lnav 里：按 i 看级别直方图、按 / 搜索、按 e 跳到下一条错误、按 q 退出）');
    return ok(out);
  };
  OPS.multitail = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'i:,s:,n:,c:,f:,m:,q,v,b,e:,d:,l:,w:,H,h,V');
    var files = P.args.length ? P.args : optAll(argv, '-i').length ? optAll(argv, '-i') : [];
    var list = [];
    for (var i = 0; i < argv.length; i++) {
      if (String(argv[i]) === '-i' && argv[i + 1]) list.push(String(argv[i + 1]));
    }
    if (files.length) list = list.concat(files);
    if (!list.length) return fail(['multitail: 需要 -i 指定要跟踪的日志文件', '用法：multitail -i /data/app/logs/app.log -i /var/log/nginx/error.log']);
    var out = [];
    list.forEach(function (f) {
      var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, f));
      if (!node) { out.push('[ ' + f + ' ]  No such file or directory'); return; }
      var lines = U.splitLines(String(node.content || ''));
      out.push('==> ' + f + ' <==');
      lines.slice(Math.max(0, lines.length - 4)).forEach(function (l) { out.push('  ' + l); });
      out.push('');
    });
    out.push('（教学环境不打开分屏界面。真机上 multitail 会用 ncurses 分屏同时跟踪多路日志：' +
      'Enter 放大某个窗口、b 回滚、q 退出；-s 2 是两列分屏）');
    return ok(out);
  };

  /* ---------- JVM 工具链：jps / jstat / jmap / jstack / jinfo / jcmd / java ---------- */
  var JAVA_OPTS = [
    '-XX:InitialHeapSize=4294967296', '-XX:MaxHeapSize=4294967296', '-XX:+UseG1GC',
    '-XX:MaxGCPauseMillis=200', '-XX:ParallelGCThreads=4', '-XX:ConcGCThreads=2',
    '-XX:+HeapDumpOnOutOfMemoryError', '-XX:HeapDumpPath=/data/app/logs/',
    '-Xlog:gc*:file=/data/logs/gc.log:time,uptime,level,tags:filecount=10,filesize=50M',
    '-Duser.timezone=Asia/Shanghai', '-Dfile.encoding=UTF-8', '-Dspring.profiles.active=prod'
  ];
  function jvmCmd(cmd) {
    var colon = String(cmd).indexOf(':');
    return colon === -1 ? cmd : cmd.slice(0, colon);
  }
  OPS.jps = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'q,m,l,v,V,J');
    if (P.opts.J) return fail(['jps: -J 后面跟的是传给 jps 自己 JVM 的参数，教学环境不需要']);
    var rows = [{ pid: JVM_PID, name: 'sun.tools.jps.Jps' }];
    var main = '/opt/myapp/app.jar';
    var out = [];
    if (P.flags.q) return ok([String(JVM_PID)]);
    if (P.flags.m || P.flags.l || P.flags.v) {
      var line = String(JVM_PID) + ' ' + main;
      if (P.flags.m) line += ' --spring.profiles.active=prod --server.port=8080';
      if (P.flags.v) line += ' ' + JAVA_OPTS.join(' ');
      out.push(line);
      if (P.flags.l && !P.flags.v && !P.flags.m) out.push(String(JVM_PID) + ' jdk.jcmd/sun.tools.jps.Jps');
      return ok(out);
    }
    return ok([String(JVM_PID) + ' app.jar', String(88231) + ' Jps']);
  };
  OPS.jstat = function (argv, ctx, stdin, HOST) {
    var valid = ['-gcutil', '-gc', '-gccause', '-gcnew', '-gcold', '-class', '-compiler', '-printcompilation', '-gccapacity'];
    var option = null, pid = null, interval = null, count = null, headerLines = null, showTime = false;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-t') { showTime = true; continue; }
      if (/^-h\d+$/.test(a)) { headerLines = a.slice(2); continue; }
      if (a === '-J' || a === '-J*') { i++; continue; }
      if (a.charAt(0) === '-') { if (valid.indexOf(a) !== -1 && !option) option = a; continue; }
      if (/^\d+$/.test(a)) {
        var n = Number(a);
        if (pid === null && n > 100) { pid = a; continue; }
        if (interval === null) { interval = a; continue; }
        if (count === null) { count = a; continue; }
        if (pid === null) { pid = a; continue; }
      }
    }
    if (!option) {
      return fail(['Usage: jstat -<option> [-t] [-h<lines>] <vmid> [<interval> [<count>]]',
                   '（常用：-gcutil 各区使用率 / -gc 各区容量 / -gccause 带最近一次 GC 原因）']);
    }
    if (!pid) return fail(['jstat: 需要指定 vmid（Java 进程 PID）', '用法：jstat ' + option + ' 18442 1000 10']);
    if (!procByPid(Number(pid))) {
      return fail(['jstat: 找不到进程 ' + pid + '.', '（本站仿真的应用进程是 18442；先用 jps -lvm 确认 PID）']);
    }
    var times = Math.min(Number(count) || 1, 5);
    var out = [];
    if (option === '-gcutil') {
      out.push('  S0     S1     E      O      M     CCS    YGC     YGCT    FGC    FGCT     GCT');
      for (var i = 0; i < times; i++) {
        var e = jitter('jstat-e', 62.4, 18, i) + i * 3;
        var o = jitter('jstat-o', 71.8, 6, i) + i * 1.2;
        out.push(U.padLeft(Math.max(0, 100 - e - o).toFixed(2), 6) + U.padLeft('0.00', 7) + U.padLeft(e.toFixed(2), 7) +
          U.padLeft(o.toFixed(2), 7) + U.padLeft('94.42', 7) + U.padLeft('92.18', 7) +
          U.padLeft(String(184 + i * 2), 7) + U.padLeft((18.422 + i * 0.2).toFixed(3), 9) +
          U.padLeft(String(13 + i), 7) + U.padLeft((21.842 + i * 2.1).toFixed(3), 8) + U.padLeft((40.264 + i * 2.3).toFixed(3), 9));
      }
      out.push('');
      out.push('（FGC 13 且还在涨 —— 配合 GC 日志里的 Pause Full 1218~2210ms，就是应用报 query timeout 的根因；');
      out.push('  O 区稳定在 70% 以上说明堆偏小，-Xmx4g 已经不够）');
      return ok(out);
    }
    if (option === '-gc') {
      out.push(' S0C    S1C    S0U    S1U      EC       EU        OC         OU       MC     MU    CCSC   CCSU   YGC     YGCT    FGC    FGCT     GCT');
      for (var k = 0; k < times; k++) {
        out.push(U.padLeft('0.0', 6) + U.padLeft('2048.0', 7) + U.padLeft('0.0', 7) + U.padLeft('0.0', 7) +
          U.padLeft('262144.0', 9) + U.padLeft(String(Math.round(jitter('jstat-eu', 163840, 10, k))), 9) +
          U.padLeft('2621440.0', 11) + U.padLeft(String(Math.round(jitter('jstat-ou', 1882400, 5, k))), 11) +
          U.padLeft('102400.0', 8) + U.padLeft('96568.4', 8) + U.padLeft('12800.0', 7) + U.padLeft('11799.1', 7) +
          U.padLeft(String(184 + k * 2), 6) + U.padLeft('18.422', 9) + U.padLeft(String(13 + k), 7) + U.padLeft('21.842', 8) + U.padLeft('40.264', 9));
      }
      out.push('');
      out.push('（单位 KB：EC 新生代容量 256M、OC 老年代 2.5G —— 与 -Xmx4g + G1 的默认分区比例一致）');
      return ok(out);
    }
    if (option === '-gccause') {
      out.push('  S0     S1     E      O      M     CCS    YGC     YGCT    FGC    FGCT     GCT    LGCC                 GCC');
      for (var j = 0; j < times; j++) {
        out.push(U.padLeft('0.00', 6) + U.padLeft('0.00', 7) + U.padLeft((62.4 + j * 3).toFixed(2), 7) +
          U.padLeft((71.8 + j).toFixed(2), 7) + U.padLeft('94.42', 7) + U.padLeft('92.18', 7) +
          U.padLeft(String(184 + j * 2), 7) + U.padLeft('18.422', 9) + U.padLeft(String(13 + j), 7) +
          U.padLeft('21.842', 8) + U.padLeft('40.264', 9) + '  G1 Evacuation Pause  System.gc()');
      }
      out.push('');
      out.push('（GCC 列是 System.gc() —— 代码里显式调用了 System.gc()，这是 Full GC 频繁的直接诱因，应该从代码里去掉）');
      return ok(out);
    }
    return ok(['（教学环境实现了 -gcutil / -gc / -gccause 三个最常用的选项）']);
  };
  OPS.jmap = function (argv, ctx, stdin, HOST) {
    /* jmap 的选项长这样：-heap / -histo / -histo:live / -dump:live,format=b,file=x.hprof
       —— 带冒号和逗号，不能用通用短选项解析（-histo 会被拆成 -h -i -s -t -o 五个开关） */
    var spec = argv.join(' ');
    var mode = null, live = false, dumpFile = null;
    if (/(^|\s)-heap(\s|$)/.test(spec)) mode = 'heap';
    if (/(^|\s)-histo(:live)?(\s|$)/.test(spec)) { mode = 'histo'; live = /-histo:live/.test(spec); }
    if (/(^|\s)-clstats(\s|$)/.test(spec)) mode = 'clstats';
    if (/(^|\s)-finalizerinfo(\s|$)/.test(spec)) mode = 'finalizer';
    var dm = spec.match(/-dump:([^\s]*)/);
    if (dm) {
      mode = 'dump';
      var fm2 = dm[1].match(/file=([^,\s]+)/);
      if (fm2) dumpFile = fm2[1];
      if (/live/.test(dm[1])) live = true;
    }
    var pid = null;
    argv.forEach(function (a) {
      var s = String(a);
      if (/^\d+$/.test(s) && pid === null) pid = s;
    });
    if (!pid) return fail(['jmap: 需要指定 PID', '用法：jmap -heap 18442 / jmap -histo[:live] 18442 / jmap -dump:live,format=b,file=xxx.hprof 18442']);
    if (!procByPid(Number(pid))) return fail(['jmap: 找不到进程 ' + pid + '.', '（本站仿真的应用进程是 18442）']);
    if (mode === 'heap') {
      return ok([
        'Attaching to process ID 18442, please wait...',
        'Debugger attached successfully.',
        'Server compiler detected.',
        'JVM version is 17.0.9+9-LTS',
        '',
        'using thread-local object allocation.',
        'Garbage-First (G1) GC with 4 thread(s)',
        '',
        'Heap Configuration:',
        '   MinHeapFreeRatio         = 40',
        '   MaxHeapFreeRatio         = 70',
        '   MaxHeapSize              = 4294967296 (4096.0MB)',
        '   NewSize                  = 1363144 (1.2999954223632812MB)',
        '   MaxNewSize               = 2579496960 (2460.0MB)',
        '   OldSize                  = 5452592 (5.1999969482421875MB)',
        '   NewRatio                 = 2',
        '   SurvivorRatio            = 8',
        '   MetaspaceSize            = 22020096 (21.0MB)',
        '   G1HeapRegionSize         = 2097152 (2.0MB)',
        '',
        'Heap Usage:',
        'G1 Heap:',
        '   regions  = 2048',
        '   capacity = 4294967296 (4096.0MB)',
        '   used     = 3082813440 (2940.0MB)',
        '   free     = 1212153856 (1156.0MB)',
        '   71.77734375% used',
        'G1 Young Generation:',
        'Eden Space:',
        '   regions  = 620',
        '   capacity = 1300250624 (1240.0MB)',
        '   used     = 1038090240 (990.0MB)',
        '   free     = 262160384 (250.0MB)',
        '   79.83870967741935% used',
        'G1 Old Generation:',
        '   regions  = 975',
        '   capacity = 2994733056 (2856.0MB)',
        '   used     = 2044723200 (1950.0MB)',
        '   free     = 950009856 (906.0MB)',
        '   68.27731092436975% used',
        '',
        '（老年代 1950M / 2856M：G1 已经把大部分堆给了老年代 —— 堆不够用的直接证据）'
      ]);
    }
    if (mode === 'histo') {
      var out = [' num     #instances         #bytes  class name (module)',
                 '-------------------------------------------------------'];
      var rows = [
        [1, 4218442, 674951040, '[B (java.base@17.0.9)'],
        [2, 2842201, 90950432, 'java.lang.String (java.base@17.0.9)'],
        [3, 1842204, 44212896, 'java.util.HashMap$Node (java.base@17.0.9)'],
        [4, 984220, 31495040, 'java.util.concurrent.ConcurrentHashMap$Node (java.base@17.0.9)'],
        [5, 421842, 33747360, 'com.example.orders.entity.Order (app.jar)'],
        [6, 284220, 27285120, 'java.lang.Object[] (java.base@17.0.9)'],
        [7, 184220, 14737600, 'java.lang.ref.WeakReference (java.base@17.0.9)'],
        [8, 98420, 9448320, 'java.nio.DirectByteBuffer (java.base@17.0.9)'],
        [9, 42184, 8107392, 'com.zaxxer.hikari.pool.HikariPool$PoolEntry (app.jar)'],
        [10, 18422, 2947520, 'java.lang.Thread (java.base@17.0.9)']
      ];
      rows.forEach(function (r) {
        out.push(U.padLeft(String(live ? Math.round(r[1] * 0.72) : r[1]), 8) + U.padLeft(String(live ? Math.round(r[2] * 0.78) : r[2]), 17) + '  ' + r[3]);
      });
      out.push('Total ' + (live ? 9284220 : 12942204) + ' ' + (live ? 1104228480 : 1422118400));
      out.push('');
      if (live) out.push('（-histo:live 会先触发一次 Full GC 再统计 —— 生产上要在低峰执行，它会 STW）');
      out.push('（[B 字节数组排第一：多半是 Hikari 连接池里堆积的结果集；Order 对象 421842 个也偏多）');
      return ok(out);
    }
    if (mode === 'dump') {
      var file = dumpFile || '/data/app/logs/heap-18442.hprof';
      if (file.indexOf('$(') !== -1) {
        return fail(['jmap: 文件名里的 $(date ...) 是命令替换，教学终端不支持',
                     '（直接写一个固定名字：jmap -dump:live,format=b,file=/data/app/logs/heap-18442.hprof 18442）']);
      }
      var row = fsByDevOrMount('/data');
      return ok(['Dumping heap to ' + file + ' ...',
                 'Heap dump file created [3188420418 bytes in 12.418 secs]',
                 '',
                 '（⚠ 两个代价：① 这一步会 STW，应用会卡住十几秒；② 快照 3.0 GB，',
                 '  而 /data 只剩 ' + row.avail + ' 可用 —— 生产上先确认磁盘空间，' +
                 '  否则 dump 失败还算好的，把数据盘写满才是事故。教学环境不真的写 3GB 文件）']);
    }
    if (mode === 'clstats' || mode === 'finalizer') return ok(['（教学环境未实现该选项的输出）']);
    return fail(['jmap: 需要指定选项', '用法：jmap -heap 18442 / jmap -histo[:live] 18442 / jmap -dump:live,format=b,file=xxx.hprof 18442']);
  };
  OPS.jstack = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'l,F,m,h:,J:');
    var pid = P.args[0];
    if (!pid) return fail(['jstack: 需要指定 PID', '用法：jstack -l 18442 > /tmp/jstack-18442.txt']);
    if (!procByPid(Number(pid))) {
      return fail(['jstack: 找不到进程 ' + pid + '.', '（本站仿真的应用进程是 18442；先用 jps -lvm 确认 PID）']);
    }
    var out = ['2024-03-18 09:51:00',
               'Full thread dump OpenJDK 64-Bit Server VM (17.0.9+9-LTS mixed mode, sharing):',
               ''];
    THREADS.forEach(function (t) {
      out.push('"' + t.name + '" #' + (t.tid - 18442) + ' ' +
        (t.state === 'RUNNABLE' ? 'prio=5 os_prio=0 cpu=1842.42ms elapsed=742.18s tid=' + t.tid + ' nid=' + t.nid + ' runnable' :
          (t.state === 'BLOCKED' ? 'prio=5 os_prio=0 cpu=42.18ms elapsed=742.18s tid=' + t.tid + ' nid=' + t.nid + ' waiting for monitor entry' :
            'prio=5 os_prio=0 cpu=8.42ms elapsed=742.18s tid=' + t.tid + ' nid=' + t.nid + ' waiting on condition')) +
        ' [' + (t.state === 'RUNNABLE' ? '0x00007f8a4c1a2000' : '0x00007f8a4c1a0000') + ']');
      out.push('   java.lang.Thread.State: ' + (t.state === 'RUNNABLE' ? 'RUNNABLE' : (t.state === 'BLOCKED' ? 'BLOCKED (on object monitor)' : t.state)));
      if (t.top) {
        out.push('\tat com.example.orders.OrderService.queryOrder(OrderService.java:184)');
        out.push('\t- waiting to lock <0x00000000f8842d18> (a com.zaxxer.hikari.pool.HikariPool)');
        out.push('\tat com.example.orders.OrderController.get(OrderController.java:42)');
      } else if (t.state === 'BLOCKED') {
        out.push('\tat com.example.orders.OrderService.queryOrder(OrderService.java:190)');
        out.push('\t- waiting to lock <0x00000000f8842d18> (a com.zaxxer.hikari.pool.HikariPool)');
      } else {
        out.push('\tat java.base@17.0.9/jdk.internal.misc.Unsafe.park(Native Method)');
        out.push('\tat java.base@17.0.9/java.util.concurrent.locks.LockSupport.parkNanos(LockSupport.java:252)');
      }
      out.push('');
      out.push('   Locked ownable synchronizers:');
      out.push('\t- None');
      out.push('');
    });
    out.push('Found one Java-level deadlock:');
    out.push('=============================');
    out.push('"pool-2-thread-1":');
    out.push('  waiting to lock monitor 0x00007f8a4c1a2b18 (object 0x00000000f8842d18, a com.zaxxer.hikari.pool.HikariPool),');
    out.push('  which is held by "http-nio-8080-exec-12"');
    out.push('"http-nio-8080-exec-12":');
    out.push('  waiting to lock monitor 0x00007f8a4c1a2c40 (object 0x00000000f8842e18, a com.example.orders.OrderCache),');
    out.push('  which is held by "pool-2-thread-1"');
    out.push('');
    out.push('Java stack information for the threads listed above:');
    out.push('===================================================');
    out.push('（线程栈里 nid=0x4829 就是 CPU 最高的 pool-2-thread-1（十进制 TID 18473）——',
             '  这就是"top -H 找 TID → printf %x 转十六进制 → grep nid=0x… 定位代码"的标准链路）');
    out.push('（死锁的两把锁顺序相反：OrderService 先拿连接池再拿缓存，OrderCache 回调时反过来 —— 经典 AB-BA 死锁）');
    if (P.flags.l) {
      out.push('');
      out.push('（-l 额外打印 ownable synchronizers 与锁的详细信息，排死锁必加）');
    }
    return ok(out);
  };
  OPS.jinfo = function (argv, ctx, stdin, HOST) {
    var wantFlags = false, wantSysProps = false, flagName = null, pid = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-flags') { wantFlags = true; continue; }
      if (a === '-sysprops') { wantSysProps = true; continue; }
      if (a === '-flag') { flagName = argv[i + 1] === undefined ? null : String(argv[++i]); continue; }
      if (a.indexOf('-flag') === 0 && a.length > 5) { flagName = a.slice(5); continue; }
      if (a === '-h' || a === '-help' || a === '--help') continue;
      if (/^\d+$/.test(a) && pid === null) { pid = a; continue; }
    }
    if (!pid) return fail(['jinfo: 需要指定 PID', '用法：jinfo -flags 18442 / jinfo -flag MaxHeapSize 18442 / jinfo -flag +HeapDumpOnOutOfMemoryError 18442']);
    if (!procByPid(Number(pid))) return fail(['jinfo: 找不到进程 ' + pid + '.', '（本站仿真的应用进程是 18442）']);
    if (wantFlags) {
      return ok(['Attaching to process ID 18442, please wait...',
                 'Debugger attached successfully.',
                 'Server compiler detected.',
                 'JVM version is 17.0.9+9-LTS',
                 'Non-default VM flags: ' + JAVA_OPTS.join(' '),
                 'Command line: ' + JAVA_OPTS.join(' ') + ' -jar /opt/myapp/app.jar']);
    }
    if (wantSysProps) {
      return ok(['java.vendor = Huawei Technologies Co., Ltd.',
                 'java.version = 17.0.9',
                 'java.home = /opt/jdk-17.0.9',
                 'user.timezone = Asia/Shanghai',
                 'file.encoding = UTF-8',
                 'spring.profiles.active = prod',
                 'os.arch = amd64',
                 'user.name = deploy']);
    }
    if (flagName) {
      var clean = String(flagName).replace(/^[+-]/, '');
      var KNOWN = {
        MaxHeapSize: '4294967296',
        InitialHeapSize: '4294967296',
        UseG1GC: 'true',
        MaxGCPauseMillis: '200',
        ParallelGCThreads: '4',
        HeapDumpOnOutOfMemoryError: 'false',
        UseCompressedOops: 'true',
        ThreadStackSize: '1024'
      };
      if (KNOWN[clean] === undefined) {
        return fail(['Exception in thread "main" java.lang.reflect.InvocationTargetException',
                     '（教学环境只收录了常用参数。真机上参数名写错就是这个报错；',
                     '  完整列表看 `java -XX:+PrintFlagsFinal -version`）']);
      }
      var plus = String(flagName).charAt(0) === '+';
      var minus = String(flagName).charAt(0) === '-';
      if (plus || minus) {
        /* jinfo -flag +Xxx 是"运行时打开一个可管理参数" —— 真的会改 JVM 行为 */
        if (clean === 'HeapDumpOnOutOfMemoryError') {
          return ok(['（教学环境：真机上这条命令**立即生效**，JVM 下次 OOM 时会自动 dump 堆到 -XX:HeapDumpPath；',
                     '  生产上建议开机参数就带上，而不是等出事再开）']);
        }
        return ok(['（教学环境：' + flagName + ' 属于可管理参数，真机上 jinfo 会立即改变运行中的 JVM；' +
                   '  不是所有参数都能这样改，改前先确认它是 manageable）']);
      }
      return ok([clean + '=' + KNOWN[clean]]);
    }
    return fail(['jinfo: 需要指定选项', '用法：jinfo -flags 18442 / jinfo -flag MaxHeapSize 18442 / jinfo -flag +HeapDumpOnOutOfMemoryError 18442']);
  };
  OPS.jcmd = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'l,h:,J:');
    var pid = null, cmd = null;
    var args2 = P.args.slice();
    if (P.flags.l) {
      if (!procByPid(JVM_PID)) return fail(['jcmd: 本机没有 Java 进程']);
      return ok([String(JVM_PID) + ' /usr/bin/java -jar /opt/myapp/app.jar']);
    }
    for (var i = 0; i < args2.length; i++) {
      if (/^\d+$/.test(String(args2[i])) && pid === null) pid = args2[i];
      else if (pid !== null && cmd === null) cmd = args2[i];
    }
    if (!pid) return fail(['jcmd: 需要指定 PID', '用法：jcmd 18442 GC.heap_info']);
    if (!procByPid(Number(pid))) return fail(['jcmd: 找不到进程 ' + pid + '.', '（本站仿真的应用进程是 18442）']);
    var name = jvmCmd(cmd || 'help');
    if (name === 'help' || !cmd) {
      return ok(['The following commands are available:',
                 'JFR.stop', 'JFR.start', 'JFR.dump', 'JFR.check',
                 'VM.native_memory', 'VM.check_commercial_features', 'VM.unlock_commercial_features',
                 'ManagementAgent.stop', 'ManagementAgent.start_local', 'ManagementAgent.start',
                 'GC.rotate_log', 'Thread.print', 'GC.class_histogram', 'GC.heap_dump',
                 'GC.run_finalization', 'GC.run', 'VM.uptime', 'VM.flags', 'VM.system_properties',
                 'VM.command_line', 'VM.version', 'GC.heap_info', 'VM.info', 'GC.heap_dump',
                 'PerfCounter.print', 'VM.class_hierarchy']);
    }
    if (name === 'GC.heap_info') {
      return ok(['18442:',
                 ' garbage-first heap   total 4194304K, used 2981888K [0x00000000f8000000, 0x0000000100000000)',
                 '  region size 2048K, 621 young (1271808K), 8 survivors (16384K)',
                 ' Metaspace       used 96568K, committed 102400K, reserved 1179648K',
                 '  class space    used 11799K, committed 12800K, reserved 1048576K',
                 '',
                 '（JDK 9+ 推荐的 jmap -heap 替代品：**不停顿**就能看堆的实时分布）']);
    }
    if (name === 'VM.flags') {
      return ok(['18442:',
                 ' -XX:ConcGCThreads=2 -XX:G1HeapRegionSize=2097152 -XX:+HeapDumpOnOutOfMemoryError',
                 ' -XX:HeapDumpPath=/data/app/logs/ -XX:InitialHeapSize=4294967296 -XX:MaxGCPauseMillis=200',
                 ' -XX:MaxHeapSize=4294967296 -XX:ParallelGCThreads=4 -XX:+UseG1GC']);
    }
    if (name === 'VM.version') {
      return ok(['18442:', 'OpenJDK 64-Bit Server VM version 17.0.9+9-LTS', 'JDK 17.0.9']);
    }
    if (name === 'VM.uptime') return ok(['18442:', '742.184 s']);
    if (name === 'VM.command_line') {
      return ok(['18442:', 'VM Arguments:', JAVA_OPTS.map(function (o) { return ' ' + o; }).join('\n'), ' java_command: /opt/myapp/app.jar']);
    }
    if (name === 'VM.system_properties') return OPS.jinfo(['-sysprops', pid], ctx, stdin, HOST);
    if (name === 'Thread.print') return OPS.jstack(['-l', pid], ctx, stdin, HOST);
    if (name === 'GC.class_histogram') return OPS.jmap(['-histo', pid], ctx, stdin, HOST);
    if (name === 'GC.run') {
      return ok(['18442:', 'Command executed successfully',
                 '',
                 '（⚠ GC.run 就是 System.gc()：会触发一次 Full GC。生产上除非排障，不要手动触发 ——',
                 '  本站仿真里应用频繁 Full GC 1218~2210ms，正是代码里显式调用 System.gc() 造成的）']);
    }
    if (name === 'GC.heap_dump') {
      return fail(['jcmd: GC.heap_dump 会在目标机上写出完整堆快照（本站是 3.0 GB，而 /data 只剩 1.2 GB）',
                   '（真机上要带文件名：jcmd 18442 GC.heap_dump /data/app/logs/heap.hprof）']);
    }
    if (name === 'VM.native_memory') {
      return fail(['18442:', 'Native memory tracking is not enabled',
                   '（要先用 -XX:NativeMemoryTracking=summary 启动 JVM 才能查；运行中开启不了）']);
    }
    if (name === 'VM.info') {
      return ok(['18442:', 'Java HotSpot(TM) 64-Bit Server VM (17.0.9+9-LTS) for linux-amd64 JRE (17.0.9+9-LTS), built on 2023-10-17']);
    }
    return fail(['jcmd: 未知的命令 "' + name + '"', '（执行 jcmd ' + pid + ' help 看可用命令列表）']);
  };
  OPS.java = function (argv, ctx, stdin, HOST) {
    var hasVersion = has(argv, '-version') || has(argv, '--version') || has(argv, '-fullversion');
    var printFlags = argv.some(function (a) { return /^-XX:\+PrintFlagsFinal$/.test(String(a)); });
    var printFlagsInitial = argv.some(function (a) { return /^-XX:\+PrintFlagsInitial$/.test(String(a)); });
    var jar = optValue(argv, '-jar');
    if (printFlags || printFlagsInitial) {
      var out = ['[Global flags]',
                 '     intx ActiveProcessorCount                      = -1                                  {product} {default}',
                 '     uintx AdaptiveSizeDecrementScaleFactor          = 4                                   {product} {default}',
                 '     uintx AdaptiveSizeMajorGCDecayTimeScale         = 10                                  {product} {default}',
                 '    size_t ConcGCThreads                             = 2                                   {product} {ergonomic}',
                 '     uintx G1HeapRegionSize                           = 2097152                             {product} {ergonomic}',
                 '      bool HeapDumpOnOutOfMemoryError                = true                                {manageable} {command line}',
                 '    ccstr HeapDumpPath                               = /data/app/logs/                     {manageable} {command line}',
                 '    size_t InitialHeapSize                           = 4294967296                          {product} {command line}',
                 '    size_t MaxHeapSize                               = 4294967296                          {product} {command line}',
                 '     uintx MaxGCPauseMillis                          = 200                                 {product} {command line}',
                 '     uintx ParallelGCThreads                         = 4                                   {product} {ergonomic}',
                 '      bool PrintFlagsFinal                           = true                                {product} {command line}',
                 '      bool UseG1GC                                   = true                                {product} {ergonomic}',
                 '      bool UseCompressedOops                         = true                                {product} {ergonomic}',
                 '     uintx YoungPLABSize                             = 4096                                {product} {default}'];
      if (hasVersion) {
        out.push('');
        out.push('openjdk version "17.0.9" 2023-10-17 LTS');
        out.push('OpenJDK Runtime Environment (build 17.0.9+9-LTS)');
        out.push('OpenJDK 64-Bit Server VM (build 17.0.9+9-LTS, mixed mode, sharing)');
      }
      out.push('');
      out.push('（{command line} 是启动时显式给的、{ergonomic} 是 JVM 自己算的、{manageable} 是能用 jinfo 动态改的。');
      out.push('  排查"参数到底生效没有"就看这一屏 —— 本站应用 -Xmx4g -XX:+UseG1GC -XX:+HeapDumpOnOutOfMemoryError 都生效了）');
      return ok(out);
    }
    if (hasVersion) {
      return { out: [], err: ['openjdk version "17.0.9" 2023-10-17 LTS',
                              'OpenJDK Runtime Environment (build 17.0.9+9-LTS)',
                              'OpenJDK 64-Bit Server VM (build 17.0.9+9-LTS, mixed mode, sharing)'], code: 0 };
    }
    if (/PrintFlagsFinal/.test(argv.join(' '))) {
      return OPS.java(['-XX:+PrintFlagsFinal', '-version'].concat(argv), ctx, stdin, HOST);
    }
    var gcLog = argv.map(String).filter(function (a) { return /^-Xlog:gc/.test(a); })[0];
    if (gcLog) {
      var file = (gcLog.match(/file=([^:]+)/) || [])[1];
      var out2 = ['（教学环境不真的启动 JVM。真机上这条命令会用固定堆 + 带轮转的 GC 日志启动应用：'];
      out2.push('   -Xms/-Xmx 相等 = 避免堆反复伸缩；filecount=10,filesize=50M = 最多留 10 个 50M 的日志；');
      out2.push('   -XX:+HeapDumpOnOutOfMemoryError = OOM 时自动留下堆快照）');
      if (file) {
        out2.push('');
        out2.push('（本轮仿真的 GC 日志就是 ' + file + '，可以直接 grep "Pause Full" / "Pause Young" 分析停顿）');
      }
      return ok(out2);
    }
    if (jar) {
      return ok(['（教学环境不真的启动 JVM 进程。真机上 `java -jar ' + jar + '` 会拉起应用，' +
                 '本站仿真里的应用进程是 java 18442，日志在 /data/app/logs/app.log）']);
    }
    if (has(argv, '-cp') || has(argv, '-classpath')) {
      return ok(['（教学环境不真的执行 Java 类。真机上 java -cp <路径> <主类> 用来跑类路径下的主类）']);
    }
    if (/arthas-boot\.jar/.test(argv.join(' '))) {
      var aPid = argsOf(argv).filter(function (a) { return /^\d+$/.test(a); })[0];
      return ok(['（教学环境不真的 attach。真机上 arthas-boot.jar ' + (aPid || '<PID>') + ' 会把 Arthas 挂到该 JVM 上，' +
                 '然后进入交互式命令行：dashboard 看面板、thread -n 3 看最忙线程、trace/watch 跟踪方法）']);
    }
    return fail(['Usage: java [options] <mainclass> [args...]',
                 '（教学环境不真的启动 JVM；示例里的 java 命令用于说明启动参数怎么给）']);
  };

  /* ======================================================================
     4. 性能压测与调优
     ====================================================================== */

  /* ---------- fio：磁盘 IO 压测（按参数算出真实量纲的结果） ---------- */
  OPS.fio = function (argv, ctx, stdin, HOST) {
    var opts = {};
    argv.forEach(function (a) {
      var m = String(a).match(/^--([\w\-]+)=(.*)$/);
      if (m) opts[m[1]] = m[2];
    });
    if (has(argv, '--version') || has(argv, '-v')) return ok(['fio-3.35']);
    if (!opts.name && !opts.filename) {
      return fail(['fio: 需要 --name 与 --filename', '例：fio --name=randread --filename=/data/fio-test --rw=randread --bs=4k --iodepth=32 --runtime=60 --time_based --group_reporting']);
    }
    var rw = opts.rw || 'read';
    var isRandom = /rand/.test(rw);
    var isWrite = /write/.test(rw);
    var isMix = /rw/.test(rw) && !isRandom;
    var bs = opts.bs || '4k';
    var bsBytes = sizeToBytes(bs);
    var iodepth = Number(opts.iodepth) || 1;
    var numjobs = Number(opts.numjobs) || 1;
    var runtime = Number(opts.runtime) || 1;
    var direct = opts.direct === '1';
    var size = opts.size || null;
    var json = opts['output-format'] === 'json';
    var filename = opts.filename || '/data/fio-test';
    /* /data 在 vdb 上：4K 随机 ≈ 142 IOPS/ms 的观测值（iostat w/s=142、%util=99.4%），
       这里按同一块盘的量纲推算，没有另造性能数字 */
    var baseIops = isRandom ? (bsBytes >= 1048576 ? 118 : (bsBytes >= 8192 ? 1800 : 8420)) : (bsBytes >= 1048576 ? 142 : 4200);
    var iops = baseIops * Math.pow(numjobs, 0.82) * (isMix ? 0.62 : 1);
    var bwKib = iops * bsBytes / 1024;
    var latUs = (isRandom ? 42.18 : 8.42) * (bsBytes >= 1048576 ? 8.2 : (bsBytes >= 8192 ? 1.6 : 1)) * Math.pow(iodepth, 0.42);
    var clat99 = latUs * 4.42;
    var clat999 = latUs * 12.18;
    var cpuUsr = isRandom ? 18.42 : 8.18;
    var cpuSys = isRandom ? 42.18 : 22.44;
    var ioKb = size ? sizeToKb(size) : (bwKib * runtime);
    if (json) {
      /* --output-format=json 走文件重定向，stdout 不再打表格 */
      return ok([]);
    }
    var name = opts.name || 'fio';
    var nIos = Math.round(iops * runtime / 1000);
    var out = [name + ': (g=0): rw=' + rw + ', bs=(R) ' + bs + '-' + bs + ', (W) ' + bs + '-' + bs + ', (T) ' + bs + '-' + bs,
               'fio-3.35',
               'Starting ' + numjobs + ' process' + (numjobs > 1 ? 'es' : ''),
               'Jobs: ' + numjobs + ' (f=' + numjobs + '), Cr=' + numjobs + '] [r=' + (isWrite ? 0 : 100) + '%][w=' + (isWrite ? 100 : 0) + '%][m=0]'];
    out.push(name + ' (groupid=0, jobs=' + numjobs + '): err= 0: pid=' + (isWrite ? 22104 : 18442) + ': ' + (isWrite ? 'WRITE' : 'READ') +
      ': bw=' + Math.round(bwKib) + 'KiB/s (' + (bwKib / 1024).toFixed(1) + 'MiB/s)(' + Math.round(bwKib / 1024) + 'MB/s), io=' + Math.round(ioKb) + 'KiB, run=' + (runtime * 1000) + 'msec, Submit=' + nIos + ', complete=' + nIos);
    out.push('  clat (usec): min=' + Math.round(latUs * 0.42) + ', max=' + Math.round(clat999 * 2.2) + ', avg=' + latUs.toFixed(2) + ', stdev=' + (latUs * 0.86).toFixed(2));
    out.push('   clat percentiles (usec):');
    out.push('     |  1.00th=[' + Math.round(latUs * 0.48) + '],  5.00th=[' + Math.round(latUs * 0.62) + '], 10.00th=[' + Math.round(latUs * 0.72) + '], 20.00th=[' + Math.round(latUs * 0.84) + '],');
    out.push('     | 30.00th=[' + Math.round(latUs * 0.94) + '], 40.00th=[' + Math.round(latUs * 1.02) + '], 50.00th=[' + Math.round(latUs * 1.12) + '], 60.00th=[' + Math.round(latUs * 1.24) + '],');
    out.push('     | 70.00th=[' + Math.round(latUs * 1.42) + '], 80.00th=[' + Math.round(latUs * 1.68) + '], 90.00th=[' + Math.round(latUs * 2.18) + '], 95.00th=[' + Math.round(latUs * 2.84) + '],');
    out.push('     | 99.00th=[' + Math.round(clat99) + '], 99.50th=[' + Math.round(clat99 * 1.42) + '], 99.90th=[' + Math.round(clat999) + '], 99.95th=[' + Math.round(clat999 * 1.18) + '],');
    out.push('     | 99.99th=[' + Math.round(clat999 * 2.2) + ']');
    out.push('    lat (msec)   : ' + (latUs / 1000).toFixed(2) + '=' + (100 - 4.42).toFixed(2) + '%, ' + (clat99 / 1000).toFixed(2) + '=' + (100 - 0.12).toFixed(2) + '%, ' + (clat999 / 1000).toFixed(2) + '=' + (100 - 0.02).toFixed(2) + '%');
    out.push('  cpu          : usr=' + cpuUsr.toFixed(2) + '%, sys=' + cpuSys.toFixed(2) + '%, ctx=' + Math.round(iops * 2.2) + ', majf=0, minf=18422');
    out.push('  IO depths    : 1=' + (iodepth === 1 ? '100.0' : (100 / iodepth).toFixed(1)) + '%, 2=' + (iodepth > 1 ? (100 / iodepth).toFixed(1) : '0.0') + '%, 4=' + (iodepth > 3 ? (100 / iodepth).toFixed(1) : '0.0') + '%, 8=' + (iodepth > 7 ? (100 / iodepth).toFixed(1) : '0.0') + '%, 16=' + (iodepth > 15 ? (100 / iodepth).toFixed(1) : '0.0') + '%, 32=' + (iodepth > 31 ? (100 / iodepth).toFixed(1) : '0.0') + '%, >=64=0.0%');
    out.push('     submit    : 0=' + (isRandom ? '0.0' : '100.0') + '%, 4=' + (isRandom ? '100.0' : '0.0') + '%, 8=0.0%, 16=0.0%, 32=0.0%, 64=0.0%, >=64=0.0%');
    out.push('     complete  : 0=' + (isRandom ? '0.0' : '100.0') + '%, 4=' + (isRandom ? '100.0' : '0.0') + '%, 8=0.0%, 16=0.0%, 32=0.0%, 64=0.0%, >=64=0.0%');
    out.push('     issued rwts: total=' + Math.round(ioKb / (bsBytes / 1024)) + ',0,0,0 short=0,0,0,0 dropped=0,0,0,0');
    out.push('     latency   : target=0, window=0, percentile=100.00%, depth=' + iodepth);
    out.push('');
    out.push('Run status group 0 (all jobs):');
    out.push('   ' + (isWrite ? 'WRITE' : 'READ') + ': bw=' + Math.round(bwKib) + 'KiB/s (' + (bwKib / 1024).toFixed(1) + 'MiB/s)(' + Math.round(bwKib / 1024) + 'MB/s), ' + Math.round(ioKb) + 'KiB, io=' + Math.round(ioKb) + 'KiB, run=' + (runtime * numjobs * 1000) + 'msec');
    out.push('');
    out.push('Disk stats (read/write):');
    out.push('  vdb: ios=' + nIos + '/' + (isWrite ? nIos : 0) + ', merge=0/0, ticks=' + Math.round(runtime * 0.994) + '/' + Math.round(runtime * 0.994) + ', in_queue=' + (runtime * 0.994).toFixed(2) + ', util=' + Math.min(100, 99.41 * Math.pow(numjobs, 0.1)).toFixed(2) + '%');
    out.push('');
    out.push('提示：vdb 的 %util 已经 99.4%（iostat 里同一条盘）—— 这份 IOPS/延迟就是 /data 当前的性能上限。');
    out.push('      ' + (isRandom ? '4K 随机读的瓶颈在 IOPS，加大 iodepth 收益有限；' : '顺序大 IO 的瓶颈在带宽，看 MiB/s；') +
      'P99 = ' + (clat99 / 1000).toFixed(2) + 'ms 已明显高于均值 ' + (latUs / 1000).toFixed(2) + 'ms，云盘延迟抖动大。');
    return ok(out);
  };

  /* ---------- sysbench ---------- */
  OPS.sysbench = function (argv, ctx, stdin, HOST) {
    var opts = {};
    argv.forEach(function (a) {
      var m = String(a).match(/^--([\w\-]+)=(.*)$/);
      if (m) opts[m[1]] = m[2];
    });
    if (has(argv, '--version')) return ok(['sysbench 1.0.20 (using bundled LuaJIT 2.1.0-beta2)']);
    var kind = argv.filter(function (a) { return String(a).charAt(0) !== '-'; })[0];
    var phase = argv.filter(function (a) { return /^(prepare|run|cleanup|help)$/.test(String(a)); })[0] || 'run';
    if (!kind || /^--/.test(kind)) {
      return fail(['sysbench: 需要指定测试类型', '用法：sysbench cpu --threads=4 --cpu-max-prime=20000 run',
                   '（支持 cpu / memory / fileio / threads / mutex / oltp_read_write 等）']);
    }
    var threads = Number(opts.threads) || 1;
    var out = ['sysbench 1.0.20 (using bundled LuaJIT 2.1.0-beta2)'];
    if (kind === 'fileio' && phase === 'prepare') {
      out.push('Creating file test_file.0');
      out.push('Creating file test_file.1');
      out.push('Creating file test_file.2');
      out.push('Creating file test_file.3');
      out.push(String(sizeToBytes(opts['file-total-size'] || '20G') / 1048576) + ' MiB transferred (' + (sizeToBytes(opts['file-total-size'] || '20G') / 1048576 / 4218).toFixed(2) + ' MiB/sec)');
      out.push('');
      out.push('（prepare 会按 --file-total-size 建测试文件 —— 本站仿真是 20G，而 /data 只剩 1.2G 可用，');
      out.push('  真机上必须先把 file-total-size 调小到可用空间以内，否则直接 ENOSPC）');
      return ok(out);
    }
    if (kind === 'fileio' && phase === 'cleanup') {
      return ok(['Removing test files', '', '（cleanup 会删掉 prepare 建出来的测试文件，压测完一定要跑）']);
    }
    if (kind === 'cpu') {
      var eps = 1842.42 * threads * 0.86;
      out.push('Running the test with following options:');
      out.push('Number of threads: ' + threads);
      out.push('Initializing random number generator from current time');
      out.push('');
      out.push('Prime numbers limit: ' + (opts['cpu-max-prime'] || '10000'));
      out.push('');
      out.push('Initializing worker threads...');
      out.push('');
      out.push('Threads started!');
      out.push('');
      out.push('CPU speed:');
      out.push('    events per second:  ' + eps.toFixed(2));
      out.push('');
      out.push('General statistics:');
      out.push('    total time:                          10.0002s');
      out.push('    total number of events:              ' + Math.round(eps * 10));
      out.push('');
      out.push('Latency (ms):');
      out.push('         min:                                    ' + (1000 / eps * 0.42).toFixed(2));
      out.push('         avg:                                    ' + (1000 / eps * threads).toFixed(2));
      out.push('         max:                                   ' + (1000 / eps * threads * 4.2).toFixed(2));
      out.push('         95th percentile:                       ' + (1000 / eps * threads * 1.8).toFixed(2));
      out.push('         sum:                                   ' + (1000 / eps * threads * Math.round(eps * 10) / 1000).toFixed(2));
      out.push('');
      out.push('Threads fairness:');
      out.push('    events (avg/stddev):           ' + Math.round(eps * 10 / threads) + '.0000/' + (eps * 0.02).toFixed(2));
      out.push('    execution time (avg/stddev):   10.0002/' + (0.01 * threads).toFixed(2));
      out.push('');
      out.push('提示：events per second 是横向对比不同规格实例最直接的数字（本站 2 核 = ' + eps.toFixed(0) + ' 上下）。');
      return ok(out);
    }
    if (kind === 'memory') {
      var mib = 8420.18 * threads * 0.82;
      out.push('Running the test with following options:');
      out.push('Number of threads: ' + threads);
      out.push('');
      out.push('Initializing random number generator from current time');
      out.push('');
      out.push('Running memory speed test with the following options:');
      out.push('  block size:               1KiB');
      out.push('  total size:               ' + sizeToKb(opts['memory-total-size'] || '100G') / 1024 + 'MiB');
      out.push('  operation:                ' + (opts['memory-oper'] || 'write'));
      out.push('  scope:                    global');
      out.push('');
      out.push('Initializing worker threads...');
      out.push('');
      out.push('Threads started!');
      out.push('');
      out.push('Total operations: ' + Math.round(sizeToKb(opts['memory-total-size'] || '100G')) + ' (' + (sizeToKb(opts['memory-total-size'] || '100G') / 1024).toFixed(0) + ' MiB)');
      out.push('');
      out.push(Math.round(sizeToKb(opts['memory-total-size'] || '100G') / 1024) + '.00 MiB transferred (' + (sizeToKb(opts['memory-total-size'] || '100G') / 1024 / 1024).toFixed(2) + ' MiB/sec)');
      out.push('    events per second:  ' + mib.toFixed(2));
      out.push('');
      out.push('（内存带宽受 NUMA 影响：跨节点访问会掉 30% 以上，绑核请用 numactl --cpunodebind=0 --membind=0）');
      return ok(out);
    }
    if (kind === 'fileio') {
      var iops = 1842.42;
      var bw = iops * (sizeToBytes('16K') / 1024) / 1024;
      out.push('Running the test with following options:');
      out.push('Number of threads: ' + threads);
      out.push('Extra file open flags: directio');
      out.push('');
      out.push('Initializing random number generator from current time');
      out.push('');
      out.push('Extra file open flags: directio');
      out.push('4 files, ' + (sizeToKb(opts['file-total-size'] || '20G') / 1024 / 4).toFixed(0) + 'MiB each');
      out.push('Block size 16KiB');
      out.push('Number of IO requests: 0');
      out.push('Read/Write ratio for combined random IO test: 1.50');
      out.push('Periodic FSYNC enabled, calling fsync() each 100 requests.');
      out.push('Calling fsync() at the end of test, Enabled.');
      out.push('Using synchronous I/O mode');
      out.push('Doing random r/w test');
      out.push('Initializing worker threads...');
      out.push('');
      out.push('Threads started!');
      out.push('');
      out.push('File operations:');
      out.push('    reads/s:                      ' + Math.round(iops * 0.6));
      out.push('    writes/s:                     ' + Math.round(iops * 0.4));
      out.push('    fsyncs/s:                     ' + Math.round(iops * 0.4 / 100));
      out.push('');
      out.push('Throughput:');
      out.push('    read, MiB/s:                  ' + (bw * 0.6).toFixed(2));
      out.push('    written, MiB/s:               ' + (bw * 0.4).toFixed(2));
      out.push('');
      out.push('General statistics:');
      out.push('    total time:                          ' + (Number(opts.time) || 10) + '.0012s');
      out.push('    total number of events:              ' + Math.round(iops * (Number(opts.time) || 10)));
      out.push('');
      out.push('Latency (ms):');
      out.push('         min:                                    0.28');
      out.push('         avg:                                    ' + (1000 / iops * threads * 1.42).toFixed(2));
      out.push('         max:                                   ' + (1000 / iops * threads * 42).toFixed(2));
      out.push('         95th percentile:                       ' + (1000 / iops * threads * 3.2).toFixed(2));
      return ok(out);
    }
    if (/oltp/.test(String(kind))) {
      out.push('Running the test with following options:');
      out.push('Number of threads: ' + threads);
      out.push('Report intermediate results every ' + (opts['report-interval'] || 10) + ' second(s)');
      out.push('');
      out.push('Initializing random number generator from current time');
      out.push('');
      out.push('Initializing worker threads...');
      out.push('');
      out.push('Threads started!');
      out.push('');
      if (phase === 'prepare') {
        out.push('Creating table \'sbtest1\'...');
        out.push('Creating table \'sbtest2\'...');
        out.push('Creating table \'sbtest3\'...');
        out.push('Inserting ' + (opts['table-size'] || '1000000') + ' records into \'sbtest1\'');
        out.push('');
        out.push('（prepare 会真的往库里灌数据：' + (opts.tables || '10') + ' 张表 × ' + (opts['table-size'] || '1000000') + ' 行，' +
          '准备阶段比压测本身还慢，别在生产库上跑）');
        return ok(out);
      }
      out.push('SQL statistics:');
      out.push('    queries performed:');
      out.push('        read:                            ' + Math.round(184220 * (Number(opts.time) || 60) / 60));
      out.push('        write:                           ' + Math.round(78942 * (Number(opts.time) || 60) / 60));
      out.push('        other:                           ' + Math.round(26314 * (Number(opts.time) || 60) / 60));
      out.push('        total:                           ' + Math.round(289476 * (Number(opts.time) || 60) / 60));
      out.push('    transactions:                        ' + Math.round(26314 * (Number(opts.time) || 60) / 60) + ' (' + (26314 / 60).toFixed(2) + ' per sec.)');
      out.push('    queries:                             ' + Math.round(289476 * (Number(opts.time) || 60) / 60) + ' (' + (289476 / 60).toFixed(2) + ' per sec.)');
      out.push('    ignored errors:                      0 (' + (0).toFixed(2) + ' per sec.)');
      out.push('    reconnects:                          0 (' + (0).toFixed(2) + ' per sec.)');
      out.push('');
      out.push('（压测结果要和 iostat 一起看：vdb %util 99.4% 时加大并发只会让 await 更长，不会提高 TPS）');
      return ok(out);
    }
    return ok(out.concat(['（教学环境支持 cpu / memory / fileio / oltp_read_write 四类；真机上还有 threads、mutex 等）']));
  };

  /* ---------- HTTP 压测：ab / wrk / hey / siege ---------- */
  function httpTarget(argv) {
    for (var i = argv.length - 1; i >= 0; i--) if (/^https?:\/\//.test(String(argv[i]))) return String(argv[i]);
    return null;
  }
  function latencyCurve(n, unitMs) {
    return {
      min: unitMs * 0.42, avg: unitMs, p50: unitMs * 0.92, p75: unitMs * 1.42,
      p90: unitMs * 2.42, p99: unitMs * 5.18, max: unitMs * 9.42
    };
  }
  OPS.ab = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'n:,c:,t:,p:,T:,H:,A:,k,g,Z,C,B,v,V,s:,i,S:,q,b,e,d,u,X:,y:,z:,r,R');
    var url = httpTarget(argv);
    if (!url) return fail(['ab: 需要给出 URL', '用法：ab -n 1000 -c 10 -k http://10.0.1.23/api/health']);
    var n = Number(P.opts.n) || 1;
    var c = Number(P.opts.c) || 1;
    var keepalive = !!P.flags.k;
    if (c > n) return fail(['ab: Number of requests (n) must be greater than or equal to concurrency (c)']);
    if (c > 1000) return fail(['ab: 并发 ' + c + ' 超过本机文件描述符上限（ulimit -n = 1024）',
                               '（先用 ulimit -n 65535 提高，或改用 wrk 这类多线程工具）']);
    var path = url.replace(/^https?:\/\/[^/]+/, '') || '/';
    var port = (url.match(/:(\d+)/) || [])[1] || '80';
    var perReq = keepalive ? 0.42 : 1.84;
    var conc = Math.min(c, 200);
    var tpr = perReq + (conc - 1) * 0.0142;      /* 每个请求摊到的时间 */
    var totalSec = n * tpr / 1000;
    var rps = n / totalSec;
    var lat = latencyCurve(n, perReq * (1 + (conc - 1) * 0.048));
    var out = ['This is ApacheBench, Version 2.3 <$Revision: 1879490 $>',
               'Copyright 1996 Adam Twiss, Zeus Technology Ltd, http://www.zeustech.net/',
               'Licensed to The Apache Software Foundation, http://www.apache.org/',
               '',
               'Benchmarking 10.0.1.23 (be patient)'];
    if (n > 10000) out.push('Completed 1000 requests');
    if (n > 50000) out.push('Completed 5000 requests');
    out.push('Finished ' + n + ' requests');
    out.push('');
    out.push('Server Software:        nginx/1.20.1');
    out.push('Server Hostname:        10.0.1.23');
    out.push('Server Port:            ' + port);
    out.push('');
    out.push('Document Path:          ' + path);
    out.push('Document Length:        1842 bytes');
    out.push('');
    out.push('Concurrency Level:      ' + c);
    out.push('Time taken for tests:   ' + totalSec.toFixed(3) + ' seconds');
    out.push('Complete requests:      ' + n);
    out.push('Failed requests:        0');
    out.push('Keep-Alive requests:    ' + (keepalive ? n : 0));
    out.push('Total transferred:      ' + (n * 2048) + ' bytes');
    out.push('HTML transferred:       ' + (n * 1842) + ' bytes');
    out.push('Requests per second:    ' + rps.toFixed(2) + ' [#/sec] (mean)');
    out.push('Time per request:       ' + (1000 / rps * c).toFixed(3) + ' [ms] (mean)');
    out.push('Time per request:       ' + (1000 / rps).toFixed(3) + ' [ms] (mean, across all concurrent requests)');
    out.push('Transfer rate:          ' + (n * 2048 / totalSec / 1024).toFixed(2) + ' [Kbytes/sec] received');
    out.push('');
    out.push('Connection Times (ms)');
    out.push('              min  mean[+/-sd] median   max');
    out.push('Connect:        ' + lat.min.toFixed(1) + '   ' + (lat.avg * 0.2).toFixed(1) + '   ' + (lat.avg * 0.05).toFixed(1) + '    ' + (lat.avg * 0.18).toFixed(1) + '    ' + (lat.max * 0.3).toFixed(1));
    out.push('Processing:     ' + lat.min.toFixed(1) + '   ' + lat.avg.toFixed(1) + '   ' + (lat.avg * 0.42).toFixed(1) + '    ' + lat.p50.toFixed(1) + '   ' + lat.max.toFixed(1));
    out.push('Waiting:        ' + lat.min.toFixed(1) + '   ' + (lat.avg * 0.92).toFixed(1) + '   ' + (lat.avg * 0.4).toFixed(1) + '    ' + (lat.p50 * 0.9).toFixed(1) + '   ' + (lat.max * 0.96).toFixed(1));
    out.push('Total:          ' + lat.min.toFixed(1) + '   ' + lat.avg.toFixed(1) + '   ' + (lat.avg * 0.44).toFixed(1) + '    ' + lat.p50.toFixed(1) + '   ' + lat.max.toFixed(1));
    out.push('');
    out.push('Percentage of the requests served within a certain time (ms)');
    [50, 66, 75, 80, 90, 95, 98, 99, 100].forEach(function (p, i) {
      var v = [lat.p50, lat.p50 * 1.1, lat.p75, lat.p75 * 1.15, lat.p90, lat.p90 * 1.2, lat.p99 * 0.85, lat.p99, lat.max][i];
      out.push('  ' + p + '%   ' + v.toFixed(1));
    });
    out.push('');
    out.push('（基准口径：' + (keepalive ? '-k 开了长连接' : '没开 -k，每个请求都新建连接') +
      '；' + (c > 200 ? '并发 ' + c + ' 已经超过压测机自身能力，数字会失真' : '并发 ' + c + ' 的 QPS 与 P99 就是扩容/调优的对比基线') + '）');
    out.push('（真机上 ab 是单线程的，压不到很高并发 —— 要打满请换 wrk 或 hey）');
    return ok(out);
  };
  OPS.wrk = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 't:,c:,d:,s:,H:,script:,timeout,latency,version,v');
    var url = httpTarget(argv);
    if (!url) return fail(['wrk: 需要给出 URL', '用法：wrk -t4 -c400 -d30s --latency http://10.0.1.23/api/health']);
    var threads = 0, conns = 0, dur = null;
    argv.forEach(function (a) {
      var m = String(a).match(/^-t(\d+)$/); if (m) threads = Number(m[1]);
      var m2 = String(a).match(/^-c(\d+)$/); if (m2) conns = Number(m2[1]);
      var m3 = String(a).match(/^-d(\d+)([smh])$/); if (m3) { dur = Number(m3[1]) * ({ s: 1, m: 60, h: 3600 }[m3[2]]); }
    });
    if (!threads || !conns || !dur) {
      return fail(['wrk: 缺少必需参数', '用法：wrk -t<线程> -c<连接> -d<时长> [--latency] <URL>',
                   '（-t 不给会报 "invalid number of threads"；线程数一般不超过 CPU 核数）']);
    }
    if (threads > 8) {
      return fail(['unable to create thread ' + threads + ': Resource temporarily unavailable',
                   '（本机只有 2 个 vCPU，线程数远超核数时创建线程会直接失败。压测机线程数一般不超过核数：-t2）']);
    }
    var rps = 1842.42 * (conns / 400) * 1.42;
    var out = ['Running ' + dur + 's test @ ' + url,
               '  ' + threads + ' threads and ' + conns + ' connections'];
    if (P.flags.latency) {
      out.push('  Thread Stats   Avg      Stdev     Max   +/- Stdev');
      out.push('    Latency    ' + (18.42).toFixed(2) + 'ms    ' + (12.18).toFixed(2) + 'ms  ' + (184.22).toFixed(2) + 'ms    ' + (84.18).toFixed(2) + '%');
      out.push('    Req/Sec    ' + (461.42).toFixed(2) + '    ' + (128.18).toFixed(2) + '    ' + (842.00).toFixed(2) + '     ' + (68.42).toFixed(2) + '%');
      out.push('  Latency Distribution');
      out.push('     50%    ' + (12.42).toFixed(2) + 'ms');
      out.push('     75%    ' + (18.18).toFixed(2) + 'ms');
      out.push('     90%    ' + (42.42).toFixed(2) + 'ms');
      out.push('     99%   ' + (142.18).toFixed(2) + 'ms');
    }
    out.push('  ' + Math.round(rps * dur) + ' requests in ' + dur + 's, ' + (rps * dur * 2048 / 1048576).toFixed(2) + 'MB read');
    out.push('Requests/sec:   ' + rps.toFixed(2));
    out.push('Transfer/sec:   ' + (rps * 2048 / 1048576).toFixed(2) + 'MB');
    out.push('');
    out.push('（wrk 用少量线程 + epoll 就能打出很高并发；99% 142ms 而 50% 只有 12ms ——');
    out.push('  尾部延迟来自 /data 上那条 MySQL 随机读路径，vdb %util 99.4% 时 P99 会继续恶化）');
    return ok(out);
  };
  OPS.hey = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'n:,c:,z:,q:,m:,T:,H:,d:,t:,o:,a:,h,v,disable-keepalive,disable-compression');
    var url = httpTarget(argv);
    if (!url) return fail(['hey: 需要给出 URL', '用法：hey -n 5000 -c 50 http://10.0.1.23/api/health']);
    var n = Number(P.opts.n) || 200;
    var c = Number(P.opts.c) || 50;
    var durStr = P.opts.z;
    var dur = 0;
    if (durStr) { var mm = String(durStr).match(/^(\d+)([smh])$/); if (mm) dur = Number(mm[1]) * ({ s: 1, m: 60, h: 3600 }[mm[2]]); }
    var total = 0, rps = 0;
    if (dur) { rps = 4218.42; total = rps * dur; }
    else { rps = 1842.42 + c * 8.42; total = n; }
    var secs = total / rps;
    var lat = latencyCurve(total, 18.42 + c * 0.042);
    var out = ['',
               'Summary:',
               '  Total:\t' + secs.toFixed(4) + ' secs',
               '  Slowest:\t' + (lat.max / 1000).toFixed(4) + ' secs',
               '  Fastest:\t' + (lat.min / 1000).toFixed(4) + ' secs',
               '  Average:\t' + (lat.avg / 1000).toFixed(4) + ' secs',
               '  Requests/sec:\t' + rps.toFixed(4),
               '',
               '  Total data:\t' + (total * 2048) + ' bytes',
               '  Size/request:\t2048 bytes',
               '  Size/second:\t' + Math.round(rps * 2048) + ' bytes',
               '',
               'Response time histogram:'];
    var buckets = 10;
    for (var i = 0; i < buckets; i++) {
      var lo = lat.min * Math.pow(lat.max / lat.min, i / buckets);
      var cnt = Math.round(total * Math.pow(0.62, i));
      var bars = Math.max(1, Math.round(cnt / total * 40));
      out.push('  ' + lo.toFixed(3) + '\t' + cnt + '\t|' + new Array(bars + 1).join('∎'));
    }
    out.push('');
    out.push('Latency distribution:');
    out.push('  10% in ' + (lat.avg * 0.52 / 1000).toFixed(4) + ' secs');
    out.push('  25% in ' + (lat.avg * 0.72 / 1000).toFixed(4) + ' secs');
    out.push('  50% in ' + (lat.p50 / 1000).toFixed(4) + ' secs');
    out.push('  75% in ' + (lat.p75 / 1000).toFixed(4) + ' secs');
    out.push('  90% in ' + (lat.p90 / 1000).toFixed(4) + ' secs');
    out.push('  95% in ' + (lat.p90 * 1.2 / 1000).toFixed(4) + ' secs');
    out.push('  99% in ' + (lat.p99 / 1000).toFixed(4) + ' secs');
    out.push('');
    out.push('Details (average, fastest, slowest):');
    out.push('  DNS+dialup:\t' + (lat.avg * 0.12 / 1000).toFixed(4) + ' secs, ' + (lat.min * 0.2 / 1000).toFixed(4) + ' secs, ' + (lat.p50 * 0.3 / 1000).toFixed(4) + ' secs');
    out.push('  DNS-lookup:\t0.0000 secs, 0.0000 secs, 0.0000 secs');
    out.push('  req write:\t0.0001 secs, 0.0000 secs, 0.0021 secs');
    out.push('  resp wait:\t' + (lat.avg * 0.84 / 1000).toFixed(4) + ' secs, ' + (lat.min * 0.7 / 1000).toFixed(4) + ' secs, ' + (lat.max * 0.9 / 1000).toFixed(4) + ' secs');
    out.push('  resp read:\t' + (lat.avg * 0.04 / 1000).toFixed(4) + ' secs, ' + (lat.min * 0.05 / 1000).toFixed(4) + ' secs, ' + (lat.max * 0.02 / 1000).toFixed(4) + ' secs');
    out.push('');
    out.push('Status code distribution:');
    out.push('  [200]\t' + total + ' responses');
    out.push('');
    out.push('（resp wait 占了大头：时间都花在等服务端 —— 服务端的瓶颈是 vdb 的 IO，不是网络）');
    return ok(out);
  };
  OPS.siege = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'c:,t:,r:,f:,i:,b:,q:,d:,l:,H:,A:,T:,g,z,v,V,log:,delay:,mark:,benchmark,internet,file:,concurrent:,time:,reps:');
    var url = httpTarget(argv) || P.args[0];
    var fromFile = P.opts.f || P.opts.file;
    var concurrent = Number(P.opts.c) || 25;
    var reps = Number(P.opts.r) || 0;
    var durStr = P.opts.t || P.opts.time;
    var secs = 60;
    if (durStr) { var mm = String(durStr).match(/^(\d+)([SMH])$/); if (mm) secs = Number(mm[1]) * ({ S: 1, M: 60, H: 3600 }[mm[2]]); }
    if (fromFile) {
      var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, fromFile));
      if (!node) {
        return fail(['siege: cannot open ' + fromFile + ': No such file or directory',
                     '（先用 printf 造出 URL 列表：printf "http://10.0.1.23/\\nhttp://10.0.1.23/list\\n" > ' + fromFile + '）']);
      }
      var urls = U.splitLines(String(node.content || '')).filter(Boolean);
      if (!urls.length) return fail(['siege: ' + fromFile + ' 里没有 URL']);
      url = urls[0] + ' 等 ' + urls.length + ' 条';
    }
    if (!url) {
      return fail(['siege: 需要给出 URL 或用 -f 指定 URL 文件', '用法：siege -c 50 -t 1M -b http://10.0.1.23/api/health']);
    }
    var total = reps ? reps * concurrent : Math.round(1842.42 * secs / 4);
    var rps = total / secs;
    var out = ['** SIEGE 4.0.4',
               '** Preparing ' + concurrent + ' concurrent users for battle.',
               'The server is now under siege...'];
    if (P.opts.log || P.flags.log) out.push('** Logging to ' + (P.opts.log || '/tmp/siege.log'));
    out.push('Transactions:              ' + total + ' hits');
    out.push('Availability:              100.00 %');
    out.push('Elapsed time:              ' + secs.toFixed(2) + ' secs');
    out.push('Data transferred:          ' + (total * 2048 / 1048576).toFixed(2) + ' MB');
    out.push('Response time:             ' + (0.042).toFixed(2) + ' secs');
    out.push('Transaction rate:          ' + rps.toFixed(2) + ' trans/sec');
    out.push('Throughput:                ' + (total * 2048 / 1048576 / secs).toFixed(2) + ' MB/sec');
    out.push('Concurrency:               ' + (concurrent * 0.92).toFixed(2));
    out.push('Successful transactions:   ' + total);
    out.push('Failed transactions:       0');
    out.push('Longest transaction:       ' + (1.84).toFixed(2));
    out.push('Shortest transaction:      ' + (0.008).toFixed(2));
    out.push('');
    if (P.opts.log || P.flags.log) out.push('（日志写进了 ' + (P.opts.log || '/tmp/siege.log') + '：真机上失败请求的详情都在里面，排障必看）');
    out.push('（-b 关掉了请求间随机延迟，压出来的是上限；不加 -b 的默认节奏更接近真实用户）');
    return ok(out);
  };

  /* ---------- jmeter / locust：接口级压测 ---------- */
  OPS.jmeter = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'n:,t:,l:,e,o:,j:,J:,R:,G:,g:,H:,q,r,X:,D:,L:,f');
    var plan = P.opts.t;
    var resultFile = P.opts.l;
    var htmlReport = P.flags.e || P.opts.o;
    if (!has(argv, '-n') && !has(argv, '--nongui')) {
      return fail(['jmeter: 教学环境不支持 GUI 模式', '（无界面压测要加 -n：jmeter -n -t plan.jmx -l result.jtl）']);
    }
    if (!plan) return fail(['jmeter: 需要 -t 指定测试计划', '用法：jmeter -n -t /opt/jmeter/plan/order-api.jmx -l /tmp/result.jtl -e -o /tmp/report']);
    var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, plan));
    if (!node) return fail(['Error in NonGUIDriver java.lang.IllegalArgumentException: File ' + plan + ' must exist']);
    var threads = Number(P.opts.J && /threads/.test(P.opts.J)) || 100;
    var jThreads = optValue(argv, '-Jthreads') || optValue(argv, '-J') || '100';
    if (optValue(argv, '-Jthreads')) threads = Number(optValue(argv, '-Jthreads'));
    var dist = P.opts.R;
    var out = ['Created the tree successfully using ' + plan];
    out.push('Starting standalone test @ ' + 'Mon Mar 18 09:51:00 CST 2024 (1710727860000)');
    if (dist) out.push('Remote engines: ' + dist + ' (' + dist.split(',').length + ' 台压力机)');
    out.push('Waiting for possible Shutdown/StopTestNow/HeapDump/ThreadDump message on port 4445');
    out.push('summary +      1 in 00:00:00 =    1.4/s Avg:    42 Min:    18 Max:   184 Err:     0 (0.00%) Active: ' + threads + ' Started: ' + threads + ' Finished: 0');
    out.push('summary +  18422 in 00:00:30 =  614.1/s Avg:    68 Min:    12 Max:  1842 Err:     0 (0.00%) Active: 0 Started: ' + threads + ' Finished: ' + threads);
    out.push('summary =  18423 in 00:00:30 =  614.1/s Avg:    68 Min:    12 Max:  1842 Err:     0 (0.00%)');
    out.push('Tidying up ...    @ Mon Mar 18 09:51:30 CST 2024 (1710727890000)');
    out.push('... end of run');
    if (resultFile) {
      var dir = U.findNode(ctx.root, U.parentOf(U.resolvePath(ctx.cwd, resultFile)));
      if (dir && dir.type === 'dir') {
        var csv = 'timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,sentBytes,grpThreads,allThreads,URL,Latency,IdleTime,Connect\n' +
          '1710727860118,42,GET /api/health,200,OK,order-api-threads 1-1,text,true,,2,142,1,1,http://10.0.1.23/api/health,38,0,12\n' +
          '1710727860184,68,POST /api/orders,201,Created,order-api-threads 1-2,text,true,,96,284,2,2,http://10.0.1.23/api/orders,62,0,14\n' +
          '1710727860262,1842,GET /api/orders/8812,500,Internal Server Error,order-api-threads 1-3,text,false,query timeout after 5000ms,412,142,3,3,http://10.0.1.23/api/orders/8812,1838,0,12\n';
        U.findNode(ctx.root, U.resolvePath(ctx.cwd, resultFile));
        var abs = U.resolvePath(ctx.cwd, resultFile);
        var ex = U.findNode(ctx.root, abs);
        if (ex && ex.type === 'file') { ex.content = csv; ex.mtime = '2024-03-18 09:51'; }
        else dir.children[U.baseName(abs)] = { type: 'file', name: U.baseName(abs), children: null, content: csv, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:51', target: null };
      }
    }
    if (htmlReport) {
      out.push('');
      out.push('（-e -o ' + P.opts.o + '：已经生成 HTML 报告。真机上报告里 Statistics / Response Times 两张表最该看，');
      out.push('  Errors 表里那条 query timeout after 5000ms 对应本站仿真应用的真实报错）');
    }
    if (dist) out.push('（-R 分布式压测：多台压力机一起打，突破单机端口与 CPU 瓶颈；各机 jmeter-server 要能互通 1099 端口）');
    return ok(out);
  };
  OPS.locust = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'f:,u:,r:,t:,H:,host:,headless,master,worker,csv:,expect-workers:,master-host:,master-port:,only-summary,no-web,web-host:,web-port:,loglevel:,L:,P:,autostart,autohatch,run-time,users:,spawn-rate:,expect-workers:,step-users:,step-time:,tags:,exclude-tags:,config:,skip-log-setup,print-stats,json,csv-full-history,html:,version,V');
    var f = P.opts.f;
    var host = P.opts.host || P.opts.H;
    if (!f) return fail(['locust: 需要 -f 指定压测脚本', '用法：locust -f /opt/locust/order_flow.py --headless -u 200 -r 20 -t 5m --host http://10.0.1.23']);
    var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, f));
    if (!node) return fail(['locust: 找不到 ' + f, '（真机上脚本里用 @task 描述用户行为；本站仿真的脚本是 /opt/locust/order_flow.py）']);
    var headless = !!P.flags.headless;
    var master = !!P.flags.master;
    var worker = !!P.flags.worker;
    var users = Number(P.opts.u) || 1;
    var spawn = Number(P.opts.r) || 1;
    var durStr = P.opts.t || '5m';
    var dur = 300;
    var mm = String(durStr).match(/^(\d+)([smh])$/);
    if (mm) dur = Number(mm[1]) * ({ s: 1, m: 60, h: 3600 }[mm[2]]);
    if (!host && !master && !worker) return fail(['locust: 需要 --host 指定目标地址', '用法：locust -f ' + f + ' --host http://10.0.1.23']);
    if (!headless && !worker) {
      return ok(['[2024-03-18 09:51:00,118] web-prod-01/INFO/locust.main: Starting web interface at http://0.0.0.0:8089',
                 '[2024-03-18 09:51:00,142] web-prod-01/INFO/locust.main: Starting Locust 2.20.0',
                 '',
                 '（教学环境不真的启动 Web 服务。真机上浏览器打开 8089 端口就能实时看 RPS / 响应时间曲线，' +
                 '并在页面上随时调整并发用户数）']);
    }
    var out = ['[2024-03-18 09:51:00,118] web-prod-01/INFO/locust.main: Starting Locust 2.20.0'];
    if (worker) {
      out.push('[2024-03-18 09:51:00,124] web-prod-01/INFO/locust.runners: Connecting to TCP master ' + (P.opts['master-host'] || '127.0.0.1') + ':' + (P.opts['master-port'] || '5557'));
      out.push('[2024-03-18 09:51:00,182] web-prod-01/INFO/locust.runners: Connected to master');
      out.push('[2024-03-18 09:51:00,184] web-prod-01/INFO/locust.runners: Waiting for workers to be ready');
      out.push('');
      out.push('（worker 自己不产生流量，只等 master 派活；压力机上多开几个 worker 就能线性加并发）');
      return ok(out);
    }
    if (master) {
      var expect = Number(P.opts['expect-workers']) || 1;
      out.push('[2024-03-18 09:51:00,120] web-prod-01/INFO/locust.main: Starting Locust 2.20.0');
      out.push('[2024-03-18 09:51:00,121] web-prod-01/INFO/locust.runners: Setting up distributed environment');
      out.push('[2024-03-18 09:51:00,122] web-prod-01/INFO/locust.runners: Waiting for ' + expect + ' workers to connect');
      for (var w = 1; w <= expect; w++) out.push('[2024-03-18 09:51:0' + w + ',184] web-prod-01/INFO/locust.runners: Worker 10.0.1.3' + w + ' connected');
      out.push('[2024-03-18 09:51:0' + (expect + 1) + ',184] web-prod-01/INFO/locust.runners: All workers connected');
      out.push('[2024-03-18 09:51:0' + (expect + 1) + ',186] web-prod-01/INFO/locust.runners: Hatching and swarming ' + users + ' users at the rate ' + spawn + ' users/s');
      out.push('');
      out.push('（--expect-workers 不满足会一直等，不会开始压测 —— 这是分布式压测最常见的卡点）');
      return ok(out);
    }
    var rps = users * 4.218;
    out.push('[2024-03-18 09:51:00,186] web-prod-01/INFO/locust.runners: Hatching and swarming ' + users + ' users at the rate ' + spawn + ' users/s');
    out.push('');
    out.push('Type     Name              # reqs      # fails |    Avg     Min     Max    Med |   req/s  failures/s');
    out.push('--------|----------------|-------|-------------|-------|-------|-------|-------|--------|-----------');
    out.push('GET      /api/orders        ' + U.padLeft(String(Math.round(rps * dur * 0.6)), 7) + '     0(0.00%) |   ' + (42).toFixed(0).padStart(5) + '   ' + (8).toFixed(0).padStart(5) + '   ' + (842).toFixed(0).padStart(5) + '   ' + (32).toFixed(0).padStart(5) + ' |   ' + (rps * 0.6).toFixed(2) + '      0.00');
    out.push('POST     /api/orders        ' + U.padLeft(String(Math.round(rps * dur * 0.2)), 7) + '     0(0.00%) |   ' + (68).toFixed(0).padStart(5) + '   ' + (18).toFixed(0).padStart(5) + '  ' + (1842).toFixed(0).padStart(5) + '   ' + (52).toFixed(0).padStart(5) + ' |   ' + (rps * 0.2).toFixed(2) + '      0.00');
    out.push('GET      /api/orders/8812   ' + U.padLeft(String(Math.round(rps * dur * 0.2)), 7) + '   ' + Math.round(rps * dur * 0.2 * 0.02) + '(2.00%) | ' + (1842).toFixed(0).padStart(5) + '   ' + (421).toFixed(0).padStart(5) + '  ' + (5218).toFixed(0).padStart(5) + '  ' + (1842).toFixed(0).padStart(5) + ' |   ' + (rps * 0.2).toFixed(2) + '      ' + (rps * 0.2 * 0.02).toFixed(2));
    out.push('--------|----------------|-------|-------------|-------|-------|-------|-------|--------|-----------');
    out.push('Aggregated                 ' + U.padLeft(String(Math.round(rps * dur)), 7) + '   ' + Math.round(rps * dur * 0.004) + '(0.40%) |   ' + (68).toFixed(0).padStart(5) + '   ' + (8).toFixed(0).padStart(5) + '  ' + (5218).toFixed(0).padStart(5) + '   ' + (42).toFixed(0).padStart(5) + ' |   ' + rps.toFixed(2) + '      ' + (rps * 0.004).toFixed(2));
    out.push('');
    out.push('Response time percentiles (approximated)');
    out.push('Type     Name                   50%    66%    75%    80%    90%    95%    98%    99%  99.9% 99.99%   100%');
    out.push('GET      /api/orders/8812       1   1   2   2   5   5   5   5   5   5   5');
    out.push('');
    out.push('（@task(3) 的 /api/orders 量最大；/api/orders/8812 的 2% 失败对应应用日志里的 query timeout after 5000ms）');
    if (P.opts.csv) out.push('（--csv=' + P.opts.csv + '：结果除了打屏还会落 CSV，接报表用）');
    return ok(out);
  };

  /* ---------- iperf3 / mtr：网络层压测与链路探测 ---------- */
  OPS.iperf3 = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 's,c:,p:,t:,P:,u,b:,R,J:,4,6,V,f:,i:,w:,M:,N,1,n:,B:,F,o:,d,v,h');
    if (P.flags.s) {
      return ok(['-----------------------------------------------------------',
                 'Server listening on 5201 (test #1)',
                 '-----------------------------------------------------------',
                 '',
                 '（教学环境不真的监听端口。真机上 iperf3 -s 会一直等客户端连进来，' +
                 '测完 Ctrl+C 结束；防火墙要放行 5201/tcp）']);
    }
    var server = P.opts.c;
    if (!server) return fail(['iperf3: 需要 -c 指定服务端（或用 -s 起服务端）', '用法：iperf3 -c 10.0.1.24 -t 30 -P 4']);
    if (server !== '10.0.1.24' && server !== '10.0.1.23' && server !== '127.0.0.1') {
      return fail(['iperf3: error - unable to connect to server: No route to host',
                   '（先 ping 一下确认连通性；服务端要先起 iperf3 -s，且 5201 端口未被防火墙拦）']);
    }
    var secs = Number(P.opts.t) || 10;
    var streams = Number(P.opts.P) || 1;
    var udp = !!P.flags.u;
    var reverse = !!P.flags.R;
    var json = !!P.flags.J;
    var bw = udp ? 100 * 1048576 : 941.42 * 1048576;
    if (json) {
      return ok([]);
    }
    var out = ['Connecting to host ' + server + ', port ' + (P.opts.p || '5201'),
               '[  5] local 10.0.1.23 port 44882 connected to ' + server + ' port ' + (P.opts.p || '5201'),
               '-----------------------------------------------------------',
               'ID    Interval        Transfer     Bitrate' + (udp ? '         Jitter   Lost/Total Datagrams' : '         Retr  Cwnd')];
    var shown = Math.min(secs, 3);
    for (var i = 0; i < shown; i++) {
      for (var s = 0; s < Math.min(streams, 2); s++) {
        var id = '[' + U.padLeft(String(sum(i, s) * (streams > 1 ? 5 : 4)), 3) + ']';
        var tr = (bw / streams * 1.0 / 8 * 1.0).toFixed(2);
        out.push(id + '   0.00-' + (i + 1).toFixed(2) + '   sec   ' +
          U.padLeft((bw / streams / 8 * (i + 1) / 1048576).toFixed(1) + ' MBytes', 14) + '   ' +
          U.padLeft((bw / streams / 1048576).toFixed(1) + ' Mbits/sec', 12) +
          (udp ? '   ' + U.padLeft((0.042 + s * 0.01).toFixed(3) + ' ms', 8) + '   ' + U.padLeft('0/' + Math.round(bw / 8 / 1448 * (i + 1) / 1048576 * 1024) + ' (0%)', 18)
               : '   ' + U.padLeft(String(s * 2), 4) + '  ' + U.padLeft('148 KBytes', 10)));
      }
      if (streams > 1) {
        out.push('[' + U.padLeft('SUM', 3) + ']   0.00-' + (i + 1).toFixed(2) + '   sec   ' +
          U.padLeft((bw / 8 * (i + 1) / 1048576).toFixed(1) + ' MBytes', 14) + '   ' +
          U.padLeft((bw / 1048576).toFixed(1) + ' Mbits/sec', 12) + (udp ? '   ' + U.padLeft('0.044 ms', 8) + '   ' + U.padLeft('0/' + Math.round(bw / 8 / 1448 * (i + 1) / 1048576 * 1024) + ' (0%)', 18) : '   ' + U.padLeft(String(2), 4) + '  ' + U.padLeft('296 KBytes', 10)));
      }
    }
    out.push('- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -');
    out.push('[ ID] Interval        Transfer     Bitrate' + (udp ? '         Jitter   Lost/Total Datagrams' : '         Retr'));
    for (var s2 = 0; s2 < streams; s2++) {
      var id2 = '[' + U.padLeft(String(s2 * 5 + 4), 3) + ']';
      out.push(id2 + '   0.00-' + secs.toFixed(2) + '  sec   ' + U.padLeft((bw / streams / 8 * secs / 1048576).toFixed(1) + ' MBytes', 14) + '   ' + U.padLeft((bw / streams / 1048576).toFixed(1) + ' Mbits/sec', 12) + (udp ? '   ' + U.padLeft('0.044 ms', 8) + '   ' + U.padLeft('0/' + Math.round(bw / 8 * secs / 1448) + ' (0%)', 18) : '   ' + U.padLeft(String(s2 * 2), 4)));
    }
    if (streams > 1) {
      out.push('[SUM]   0.00-' + secs.toFixed(2) + '  sec   ' + U.padLeft((bw / 8 * secs / 1048576).toFixed(1) + ' MBytes', 14) + '   ' + U.padLeft((bw / 1048576).toFixed(1) + ' Mbits/sec', 12) + (udp ? '   ' + U.padLeft('0.044 ms', 8) + '   ' + U.padLeft('0/' + Math.round(bw / 8 * secs / 1448) + ' (0%)', 18) : '   ' + U.padLeft('2', 4)));
    }
    out.push('iperf Done.');
    out.push('');
    out.push('（单向 941 Mbits/sec ≈ 千兆内网线速；' + (reverse ? '-R 反向测试：这次是服务端发、本机收 —— 两边不对称说明有一侧受限' : '加 -R 可以反向测，判断是发还是收的方向受限') + '）');
    out.push('（' + (udp ? 'UDP 模式的 Lost/Total 与 Jitter 才是重点：丢包 0%、抖动 0.04ms 说明链路很稳' : '-P 4 四条流能跑满带宽，说明瓶颈在网络不是单连接') + '）');
    return ok(out);
  };
  function sum(a, b) { return a + b; }
  OPS.mtr = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'r,c:,n,w,T,P:,s:,4,6,u,i:,f,F:,C,o:,z,b,e,g:,a:,m:');
    var targets = P.args;
    var host = targets[0];
    if (!host) return fail(['mtr: 需要指定目标主机', '用法：mtr -r -c 100 -n 119.29.29.29']);
    var report = !!P.flags.r;
    var count = Number(P.opts.c) || 10;
    var numeric = !!P.flags.n;
    var wide = !!P.flags.w;
    var tcp = !!P.flags.T;
    var psize = Number(P.opts.s) || 64;
    var known = {
      '119.29.29.29': { name: 'dns.qq.com', hops: [
        ['10.0.1.1', 0.0, 0.42, 0.18, 0.12, 0.0],
        ['100.125.1.1', 0.0, 1.84, 0.42, 0.28, 0.0],
        ['100.125.0.9', 0.0, 2.18, 0.62, 0.44, 0.0],
        ['219.158.16.1', 0.4, 8.42, 2.18, 1.42, 0.2],
        ['219.158.5.146', 0.0, 12.18, 3.42, 2.18, 0.0],
        ['202.97.12.1', 1.2, 18.42, 6.18, 4.42, 0.6],
        ['183.60.12.1', 0.0, 24.18, 8.42, 5.18, 0.0],
        ['103.235.46.102', 0.0, 28.42, 12.18, 8.42, 0.0],
        ['119.29.29.29', 0.0, 29.18, 12.42, 8.62, 0.0]
      ] },
      '10.0.2.15': { name: 'db-prod-01', hops: [
        ['10.0.1.1', 0.0, 0.42, 0.18, 0.12, 0.0],
        ['10.0.2.15', 0.0, 0.68, 0.28, 0.18, 0.0]
      ] }
    };
    var data = known[host];
    if (!data) {
      if (/^www\.huaweicloud\.com$/.test(host) || /^api\.example\.com$/.test(host)) {
        data = { name: host, hops: [
          ['10.0.1.1', 0.0, 0.42, 0.18, 0.12, 0.0],
          ['100.125.1.1', 0.0, 1.84, 0.42, 0.28, 0.0],
          ['100.125.0.9', 0.0, 2.18, 0.62, 0.44, 0.0],
          ['121.36.44.1', 0.0, 6.42, 1.84, 1.18, 0.0],
          ['121.36.44.17', 0.0, 8.18, 2.42, 1.62, 0.0]
        ] };
      } else {
        return fail(['mtr: Failed to resolve host: ' + host,
                     '（教学环境只仿真了 119.29.29.29 / 10.0.2.15 / www.huaweicloud.com / api.example.com 几条链路）']);
      }
    }
    var out = [];
    if (!report) {
      out.push('（教学环境不打开交互界面。真机上 mtr 会实时刷新每一跳的丢包与延迟；');
      out.push('  按 r 出报告、按 n 切换域名解析、按 q 退出。下面是等效的报告形式）');
      out.push('');
    }
    var header = 'Start: 2024-03-18T09:51:00+0800  Host: ' + hostname(ctx, HOST) + '   Loss%   Snt   Last   Avg  Best  Wrst StDev';
    out.push(header);
    var rows = data.hops.slice(0, wide ? 30 : 10);
    rows.forEach(function (h, i) {
      var loss = h[1], last = h[2], avg = h[3], best = h[4], wrst = h[5];
      if (/^10\.0\.1\.1$/.test(h[0]) && loss === 0) loss = 0.0;
      var name = numeric ? h[0] : (i === 0 ? 'gateway (10.0.1.1)' : (i === data.hops.length - 1 ? host : h[0]));
      if (tcp) name = numeric ? h[0] : host + ' (' + h[0] + ')';
      out.push(U.padLeft(String(i + 1) + '.|-- ', 6) + U.pad(name, 26) +
        U.padLeft(loss.toFixed(1), 7) + U.padLeft(String(count), 6) +
        U.padLeft(last.toFixed(1), 7) + U.padLeft(avg.toFixed(1), 6) + U.padLeft(best.toFixed(1), 6) +
        U.padLeft(wrst.toFixed(1), 6) + U.padLeft((wrst - best > 0 ? (wrst - best) / 2 : 0.1).toFixed(1), 6));
    });
    out.push('');
    out.push('（第 4 跳 219.158.16.1 有 0.2% 丢包并且 Avg 从 0.4ms 跳到 8.4ms —— 这是公网出口；');
    out.push('  中间跳的丢包如果**最后一跳没有丢**，通常是路由器对 ICMP 限速，不是真故障）');
    out.push('（' + (tcp ? '用 TCP 443 探测：很多中间设备屏蔽 ICMP，-T -P 443 能绕开' : '换成 -T -P 443 可以用 TCP 探测，绕开屏蔽 ICMP 的设备') + '）');
    if (psize > 1400) {
      out.push('（-s ' + psize + ' 接近 MTU 上限：如果这一档开始大量丢包而小包正常，就是路径 MTU 小于 1500）');
    }
    return ok(out);
  };

  /* ---------- ulimit / taskset / numa ---------- */
  OPS.ulimit = function (argv, ctx, stdin, HOST) {
    var LIMITS = {
      'n': ['open files', '65535', '65535', 'files'],
      'Hn': ['open files', '65535', '65535', 'files'],
      'Sn': ['open files', '65535', '65535', 'files'],
      'u': ['max user processes', '63457', '63457', 'processes'],
      'c': ['core file size', '0', 'unlimited', 'blocks'],
      's': ['stack size', '8192', 'unlimited', 'kbytes'],
      'v': ['virtual memory', 'unlimited', 'unlimited', 'kbytes'],
      'm': ['max memory size', 'unlimited', 'unlimited', 'kbytes'],
      'f': ['file size', 'unlimited', 'unlimited', 'blocks'],
      'l': ['max locked memory', '64', '64', 'kbytes'],
      'i': ['max pending signals', '63457', '63457', 'signals'],
      'q': ['POSIX message queues', '819200', '819200', 'bytes'],
      'x': ['file locks', 'unlimited', 'unlimited', 'locks'],
      'e': ['scheduling priority', '0', '0', ''],
      'r': ['real-time priority', '0', '0', ''],
      't': ['cpu time', 'unlimited', 'unlimited', 'seconds'],
      'p': ['pipe size', '8', '8', '512-byte blocks']
    };
    var opts = argv.filter(function (a) { return /^-[A-Za-z]+$/.test(String(a)); });
    if (!opts.length || (opts.length === 1 && opts[0] === '-a')) {
      /* ulimit -a：一屏看全部 */
      var out = [];
      Object.keys(LIMITS).forEach(function (k) {
        if (k.length > 1) return;
        var L = LIMITS[k];
        out.push(U.pad(L[0], 25) + '(-' + k + ') ' + U.pad(L[1], 16) + ' ' + L[3]);
      });
      out.push('');
      out.push('（-n 是排障最常看的：应用报 "Too many open files" 就是它到顶了。');
      out.push('  临时改只对本 shell 生效，持久化要写 /etc/security/limits.d/99-nofile.conf，' +
        'systemd 服务还要在 unit 里写 LimitNOFILE=65535）');
      return ok(out);
    }
    var out2 = [];
    opts.forEach(function (o) {
      var body = o.slice(1);
      var hard = false, soft = false, name = body;
      if (body.length > 1) {
        if (body.charAt(0) === 'H') { hard = true; name = body.slice(1); }
        else if (body.charAt(0) === 'S') { soft = true; name = body.slice(1); }
      }
      var L = LIMITS[body] || LIMITS[name];
      if (!L) { out2.push('ulimit: ' + o + ': invalid option'); return; }
      if (o === '-n' || o === '-Hn' || o === '-Sn') {
        /* 硬限制就用硬限制那一列 */
        out2.push(hard ? L[2] : L[1]);
        return;
      }
      out2.push(L[1]);
    });
    return ok(out2);
  };
  OPS.taskset = function (argv, ctx, stdin, HOST) {
    /* taskset 的短选项可以粘在一起：-cp 0-1 <PID>、-c0-3 cmd、-p<PID>、-p <PID>
       —— 必须手写解析：通用解析器会把 -cp 当成"标志 c + 标志 p"从而吃掉后面那个值，
       而 -c 后面到底是 CPU 列表还是子命令的参数，只能靠"像不像 CPU 列表"来判断。 */
    var cpuList = null, pid = null, wantPid = false, cmd = [];
    function looksCpu(s) { return s !== undefined && s !== null && /^\d+([,-]\d+)*$/.test(String(s)); }
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--') { for (var j = i + 1; j < argv.length; j++) cmd.push(String(argv[j])); break; }
      if (a === '--all-tasks' || a === '-a' || a === '-v' || a === '-h' || a === '-V') continue;
      if (a.indexOf('--cpu-list=') === 0) { cpuList = a.slice(11); continue; }
      if (a === '--cpu-list') { cpuList = looksCpu(argv[i + 1]) ? String(argv[++i]) : null; continue; }
      if (a.indexOf('--pid=') === 0) { wantPid = true; pid = a.slice(6); continue; }
      if (a === '--pid') {
        wantPid = true;
        if (argv[i + 1] !== undefined && /^\d+$/.test(String(argv[i + 1]))) pid = String(argv[++i]);
        continue;
      }
      if (a.charAt(0) === '-' && a.length > 1 && a.charAt(1) !== '-') {
        var body = a.slice(1);
        var ci = body.indexOf('c');
        var pi = body.indexOf('p');
        var mine = false;
        if (ci !== -1 && cpuList === null) {
          var rest = body.slice(ci + 1);
          if (looksCpu(rest)) { cpuList = rest; mine = true; }
          else if (looksCpu(argv[i + 1])) { cpuList = String(argv[++i]); mine = true; }
        }
        if (pi !== -1 && !wantPid) {
          wantPid = true; mine = true;
          var rest2 = body.slice(pi + 1);
          if (/^\d+$/.test(rest2)) pid = rest2;
          else if (argv[i + 1] !== undefined && /^\d+$/.test(String(argv[i + 1]))) pid = String(argv[++i]);
        }
        /* 已经是子命令自己的参数（如 wrk -t4 -c400 …）就交给子命令 */
        if (!mine && (cpuList !== null || wantPid)) { cmd.push(a); continue; }
        if (!mine) continue;
        continue;
      }
      cmd.push(a);
    }
    if (cpuList !== null && !/^\d+([,-]\d+)*$/.test(String(cpuList))) {
      return fail(['taskset: invalid CPU list: ' + cpuList,
                   '（CPU 列表的写法是 0 / 0,1 / 0-3 / 0,2-3）']);
    }
    /* 落单的 PID（taskset -p <PID>）会留在位置参数里 */
    if (wantPid && pid === null) {
      var nums = cmd.filter(function (x) { return /^\d+$/.test(String(x)); });
      if (nums.length) { pid = nums[nums.length - 1]; cmd = cmd.filter(function (x) { return x !== pid; }); }
    }
    /* 不指定 CPU 列表、只给 PID = 查看当前亲和性 */
    if (cpuList === null && pid !== null) {
      if (!procByPid(Number(pid))) return fail(['taskset: failed to get pid ' + pid + '\'s affinity: No such process']);
      return ok(['pid ' + pid + '\'s current affinity mask: 3',
                 '',
                 '（掩码 3 = 二进制 11 = 0~1 号核：本站 2 vCPU 的机器上进程默认可以跑在两个核上）']);
    }
    if (cpuList !== null && pid !== null) {
      if (!procByPid(Number(pid))) return fail(['taskset: failed to set pid ' + pid + '\'s affinity: No such process']);
      var mx0 = maxCpuOf(cpuList);
      if (mx0 > 1) {
        return fail(['taskset: failed to set pid ' + pid + '\'s affinity: Invalid argument',
                     '（本机只有 2 个 vCPU（0~1 号），' + cpuList + ' 里的 ' + mx0 + ' 号核不存在。',
                     '  真机上绑核前先 `lscpu | grep -E "^CPU\\(s\\)|NUMA"` 看清拓扑）']);
      }
      return ok(['pid ' + pid + '\'s current affinity list: 0-1',
                 'pid ' + pid + '\'s new affinity list: ' + cpuList,
                 '',
                 '（在线改绑不用重启进程；但网卡中断与内存分配仍可能落在别的核，' +
                 '效果要看 /proc/' + pid + '/status 的 Cpus_allowed_list）']);
    }
    if (cpuList === null) {
      return fail(['taskset: 需要 -c 指定 CPU 列表，或用 -p 查看已有进程',
                   '用法：taskset -c 0-3 /opt/myapp/bin/server   /   taskset -cp 0-1 <PID>   /   taskset -p <PID>']);
    }
    if (!cmd.length) return fail(['taskset: 缺少要运行的命令', '用法：taskset -c 0-3 /opt/myapp/bin/server']);
    var maxCpu = maxCpuOf(cpuList);
    if (maxCpu > 1) {
      return fail(['taskset: failed to set pid new\'s affinity: Invalid argument',
                   '（本机只有 2 个 vCPU（0~1 号），指到 ' + maxCpu + ' 号核不存在。',
                   '  真机上绑核方案要先 `lscpu | grep -E "^CPU\\(s\\)|NUMA"` 看清拓扑）']);
    }
    return ok(['（教学环境不真的执行 ' + cmd.join(' ') + '：真机上它会以 CPU 亲和性 ' + cpuList + ' 启动）']);
  };
  function maxCpuOf(list) {
    var max = 0;
    String(list).split(',').forEach(function (seg) {
      var m = String(seg).match(/^(\d+)-(\d+)$/);
      if (m) max = Math.max(max, Number(m[2]));
      else if (/^\d+$/.test(String(seg))) max = Math.max(max, Number(seg));
    });
    return max;
  }
  OPS.numactl = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'hardware,show,cpunodebind:,membind:,interleave:,preferred:,localalloc,physcpubind:,C:,p:,m:,N:,i:,l:,V,v');
    if (P.flags.hardware) {
      return ok([
        'available: 1 nodes (0)',
        'node 0 cpus: 0 1',
        'node 0 size: 7770 MB',
        'node 0 free: 402 MB',
        'node distances:',
        'node   0 ',
        '  0:  10 ',
        '',
        '（单 NUMA 节点：本站 2 vCPU / 7.6G 的规格就是 1 个 node。node distances 里 10 是本节点、' +
        '  20 以上是跨节点 —— 跨节点访问延迟大约翻倍）'
      ]);
    }
    if (P.flags.show) {
      return ok(['policy: default',
                 'preferred node: current',
                 'physcpubind: 0 1 ',
                 'cpubind: 0 ',
                 'nodebind: 0 ',
                 'membind: 0 ',
                 '',
                 '（--show 看的是**当前进程**的策略：什么都没绑的时候就是 default / current）']);
    }
    if (P.opts.p) {
      var target = procByPid(Number(P.opts.p));
      if (!target) return fail(['numactl: 找不到进程 ' + P.opts.p + '（本站仿真的应用进程是 18442）']);
      return ok(['Per-node process memory usage (in MBs) for PID ' + P.opts.p + ' (' + target.name + ')',
                 '                           Node 0          Total',
                 '                  --------------- ---------------',
                 'Huge                         0.00            0.00',
                 'Heap                        12.40           12.40',
                 'Stack                        0.02            0.02',
                 'Private                    598.18          598.18',
                 '----------------  --------------- ---------------',
                 'Total                      610.60          610.60',
                 '',
                 '（单节点机器上看不出跨节点访问；真机上多路服务器要盯 AnonHugePages 与 numastat -m 的 miss 列）']);
    }
    var cmd = P.args;
    if (!cmd.length && !P.opts.cpunodebind && !P.opts.membind && !P.opts.interleave) {
      return fail(['numactl: 需要指定策略或命令', '用法：numactl --hardware / numactl --show / numactl --cpunodebind=0 --membind=0 <命令>']);
    }
    if (P.opts.cpunodebind !== undefined && P.opts.cpunodebind !== '0') {
      return fail(['numactl: 无法绑定到 node ' + P.opts.cpunodebind + '：本机只有 1 个 NUMA 节点（node 0）',
                   '（真机上先 numactl --hardware 看清有几个节点再绑）']);
    }
    return ok(['（教学环境不真的执行 ' + cmd.join(' ') + '：真机上这条命令会让进程只在 ' +
      (P.opts.cpunodebind !== undefined ? 'node ' + P.opts.cpunodebind + ' 的核上跑、内存也只从该节点分配' :
        (P.opts.interleave !== undefined ? '所有节点交替分配内存（提升内存带宽利用率，数据库常用）' : '指定节点分配内存')) + '）']);
  };
  OPS.numastat = function (argv, ctx, stdin, HOST) {
    var P = parseArgs(argv, 'p:,m:,c:,s,z,v,V,h');
    if (P.opts.p) {
      var t = procByPid(Number(P.opts.p));
      if (!t) return fail(['numastat: 找不到进程 ' + P.opts.p + '']);
      return ok(['Per-node process memory usage (in MBs) for PID ' + P.opts.p + ' (' + t.name + ')',
                 '                           Node 0          Total',
                 '                  --------------- ---------------',
                 'Huge                         0.00            0.00',
                 'Heap                        12.40           12.40',
                 'Stack                        0.02            0.02',
                 'Private                    598.18          598.18',
                 '----------------  --------------- ---------------',
                 'Total                      610.60          610.60']);
    }
    if (P.flags.m) {
      return ok(['                            Node 0',
                 'MemTotal_MB                  7770.70',
                 'MemFree_MB                    392.60',
                 'FilePages_MB                 1302.10',
                 'AnonPages_MB                 4102.40',
                 'Active_MB                    4193.40',
                 'Inactive_MB                  3174.90',
                 'Unevictable_MB                  0.00']);
    }
    return ok([
      '                           Node 0          Total',
      '                  --------------- ---------------',
      'numa_hit              18422041842    18422041842',
      'numa_miss                      0               0',
      'numa_foreign                   0               0',
      'interleave_hit              18422           18422',
      'local_node            18422041842    18422041842',
      'other_node                     0               0',
      '',
      '（单节点机器 numa_miss / other_node 必然为 0；真机多路服务器上它们非 0 就说明存在跨节点访问，' +
      '  那才是性能损失来源 —— 用 numactl --cpunodebind=0 --membind=0 把进程与内存绑到同一个节点）'
    ]);
  };

  /* ---------- 兜底：教学提示型的命令（不静默，也不假装成功） ---------- */

  /* shell.js 里已经有 lsblk / mount 这两个命令名（extend() 只添加、不覆盖），
     所以完整的实现必须通过一个显式挂钩交回去 —— shell.js 里那两个函数体已经改成
     "有挂钩就走挂钩，没有就走旧的简化版"。这样"文档里的 -f/-o/-dp/指定设备"、
     "already mounted / NFS / loop" 才真的生效，而不是被一个永远打印同一屏的
     旧实现静默吃掉。 */
  window.CC_OPS_LSBLK = OPS.lsblk;
  window.CC_OPS_MOUNT = OPS.mount;

  /* perf 火焰图那条链路上的两个脚本：给出可执行的替代路径，而不是 `command not found` */
  OPS['stackcollapse-perf.pl'] = function (argv, ctx, stdin, HOST) {
    var input = argsOf(argv)[0];
    if (input) {
      var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, input));
      if (!node) return fail([input + ': No such file or directory',
                              '（先用 `perf script > ' + input + '` 把采样导出成文本）']);
    }
    return ok([
      'java;G1ParScanThreadState::copy_to_survivor_space;ParallelTaskTerminator::offer_termination 1842',
      'java;ObjectSynchronizer::fast_enter 884',
      'java;OrderService.queryOrder 421',
      'mysqld;cli_read_rows 184',
      'nginx;ngx_http_upstream_process_header 42',
      '',
      '（这是折叠栈（folded stacks）中间格式：每行"分号分隔的调用栈 + 空格 + 采样数"，' +
      '下一句 `flamegraph.pl` 把它画成 SVG。教学环境给出等价的文本，不生成假的 svg 文件）'
    ]);
  };
  OPS['flamegraph.pl'] = function (argv, ctx, stdin, HOST) {
    var lines = stdin || [];
    if (!lines.length) {
      return fail(['flamegraph.pl: 需要从标准输入读折叠栈',
                   '用法：stackcollapse-perf.pl out.perf | flamegraph.pl > flame.svg',
                   '（教学环境不生成假 svg：真机上这一步会输出 SVG 文本，用浏览器打开就是火焰图）']);
    }
    return ok(['（教学环境不输出 SVG 二进制内容。真机上 flamegraph.pl 会把 ' + lines.length + ' 行折叠栈' +
      '画成火焰图：横轴是采样占比、纵向是调用深度，最宽的栈顶就是最该优化的函数）']);
  };

  window.CC_SHELL.extend(OPS);
})();
