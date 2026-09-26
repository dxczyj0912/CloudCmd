/* ==========================================================================
   data/cards-data.js · 每日一练卡片 · **服务与数据**部分
   --------------------------------------------------------------------------
   负责三个分类：middleware（中间件）/ db-cache（数据库与缓存）/ monitor（监控与日志）
   卡片契约与质量线见 data/cards.js 顶部注释，本文件照它的标准写。

   本文件的写法约定：
   1. `run` 里的命令全部在 assets/js/shell.js 的模拟引擎里**真跑通过**（tools/card-check.js 会复验）。
      引擎实现了 mysql / redis-cli / nginx 三个真实现家族，以及通用 Linux 命令；
      Tomcat、HAProxy、Keepalived、etcdctl、psql、mongosh、Kafka 脚本、rabbitmqctl、
      promtool、jstat、sar、dmesg 引擎都没有实现 —— 这些卡**故意不写 run**，
      理由逐张写在该卡的注释里，而不是编一条跑不通的命令糊弄过去。
   2. 命令参数与环境严格对齐 data/termfs.js 的虚拟环境：
      主机 web-prod-01 / 10.0.1.23，库 db-prod-01 / 10.0.2.15，业务库 orders，
      容器 web / mysql8 / redis / old-web / debug-tmp，
      日志 /data/app/logs/app.log 与 /var/log/nginx/{access,error}.log，
      Redis 种子 key（big:cache:report:2024Q1、session:*、cache:* 等）。
      学员点「送进终端跑一遍」不会看到 command not found。
   3. `front` 里不出现答案的命令名（认字 vs 判断），`why` 必须有可验证判据，
      `contrast` 负责反向排除 —— 现象不是这样时该往哪想。
   ========================================================================== */
(function () {
  'use strict';

  window.CC_CARDS = window.CC_CARDS || [];

  window.CC_CARDS.push(

    /* ==================================================================
       A. 中间件 middleware（19 张）
       ================================================================== */

    /* ---- 反向代理：改配置前的拦截 ---- */
    {
      id: 'card-mw-emerg-upstream-name',
      cat: 'middleware',
      kind: 'diagnose',
      level: 3,
      front: '同事只把反向代理里 upstream 块的名字改了，`proxy_pass` 那一行没动。你要在他重载之前就拦下这份配置。',
      hint: '有一类检查能在不碰运行中进程的前提下，把整份配置连同 include 进来的文件全部解析一遍。',
      answer: 'nginx -t',
      why: '`-t` 会把主配置与所有 `include` 的文件全部解析，并对 `proxy_pass` 里的 upstream 引用做名字校验：名字对不上会直接报 `nginx: [emerg] host not found in upstream "app_backend" in /etc/nginx/nginx.conf:24`，退出码非 0。判据就是这条 emerg —— 看到它就别重载。',
      contrast: '`-t` 说 successful 也不代表业务正常：它**不检查后端端口是否在监听**。真实 502 要靠 `/var/log/nginx/error.log` 区分 `connect() failed`（连不上）与 `upstream timed out`（连上了但慢），两个方向的处置完全不同。',
      run: 'nginx -t',
      cmdIds: ['mw-nginx-test', 'mw-nginx-upstream', 'mw-nginx-proxy-pass'],
      lesson: 'mw-nginx-bad-conf',
      tags: ['Nginx', '配置', '校验']
    },

    {
      id: 'card-mw-unknown-directive-module',
      cat: 'middleware',
      kind: 'diagnose',
      level: 2,
      front: '你在配置里加了一行 `http2 on;`，进程起不来，日志只丢下一句 `unknown directive "http2"`。你想先确认这份二进制到底有没有把那个模块编进去。',
      hint: '版本号不够用 —— 要看编译时定下来的那份参数清单。',
      answer: 'nginx -V',
      why: '`-V`（大写）除了版本号还会打印整行 `configure arguments:`，判据就是那行里有没有 `--with-http_v2_module`。本站仿真的 `-V` 输出里有它，所以 `unknown directive "http2"` 的根因不是"模块缺失"，而是**语法与版本不匹配**：`http2 on;` 这种写法要 1.25.1 以上，而本站是 1.20.1，老版本只能写 `listen 443 ssl http2;`。',
      contrast: '`-v`（小写）只给版本号，排模块必须用大写。反过来，如果编译参数里**确实没有**那个模块，`-t` 也只会含糊地报 `unknown directive`、不会说"模块缺失"，只能自己拿 `-V` 对照。容器场景要在容器内执行，宿主机上看到的是宿主机的二进制。',
      run: 'nginx -V',
      cmdIds: ['mw-nginx-version', 'mw-nginx-test'],
      lesson: 'mw-nginx-test-reload',
      tags: ['Nginx', '模块', '版本']
    },

    {
      id: 'card-mw-413-body-size',
      cat: 'middleware',
      kind: 'diagnose',
      level: 3,
      front: '生产上上传 20M 的附件立刻返回 `413 Request Entity Too Large`，可应用日志里连这条请求都找不到。',
      hint: '请求还没进到应用就被挡回来了 —— 挡它的那一层有自己的体积上限，而且能在三个层级分别改写。',
      answer: 'nginx -T',
      why: '`-T` 把合并后的完整配置打印出来，用来确认 `client_max_body_size` 到底有没有被谁设过。这个指令的默认值是 **1m**，可以写在 `http`、`server`、`location` 三个层级且内层覆盖外层；本站 `/etc/nginx/nginx.conf` 里一处都没写，于是 20M 的请求在代理这一层就被拒了 —— 这就是"应用日志里什么都没有"的原因。',
      contrast: '如果**应用日志里有**这条请求，413 就不是代理层返回的，而是应用框架自己的上传上限（如 Spring 的 `spring.servlet.multipart.max-file-size`）。两者都可能返 413，**日志里有没有记录**就是分辨点；先分清是哪一层拒绝的，再去改对应配置。',
      run: 'nginx -T',
      cmdIds: ['mw-nginx-body-size', 'mw-nginx-dump', 'mw-nginx-log'],
      lesson: 'mw-nginx-504-upstream-timeout',
      tags: ['Nginx', '413', '上传']
    },

    /* ---- 高可用：VIP 与 VRRP ---- */
    {
      id: 'card-mw-vip-which-node',
      cat: 'middleware',
      kind: 'diagnose',
      level: 3,
      front: '两台机器做了主备，你要确认那个对外的虚拟 IP 现在挂在谁身上 —— 这是"切换成功没有"最直接的证据。',
      hint: '它不是配置文件里的静态地址，而是守护进程当上主机之后动态加上去的。',
      answer: 'ip addr show eth0',
      why: 'Keepalived 成为 MASTER 时用 `ip addr add` 把 VIP 加到网卡上，所以它会以 secondary 地址的形式出现在地址列表里（通常还带 `label eth0:1` 别名）。判据：本机地址里**看得到** VIP = 本机是 MASTER，看不到 = 本机是 BACKUP。用 `grep -w <VIP>` 精确匹配，避免误匹配同前缀的地址。',
      contrast: '**两台都能看到 VIP 就是双主**：优先怀疑 `priority` 写成了相同值（模板默认常是 100），或 `virtual_router_id` 与同广播域里另一组高可用撞车。切换成功但业务仍不通，要往上游交换机的 ARP 缓存与安全组方向查，而不是继续折腾本机配置。',
      run: 'ip addr show eth0',
      cmdIds: ['mw-keepalive-vip', 'mw-keepalive-conf', 'mw-keepalive-troubleshoot'],
      tags: ['Keepalived', 'VIP', '高可用']
    },

    {
      id: 'card-mw-vrrp-no-advert',
      cat: 'middleware',
      kind: 'diagnose',
      level: 3,
      front: '备机就是不接管，你怀疑它压根没收到主的 VRRP 通告。',
      hint: 'VRRP 既不是 TCP 也不是 UDP —— 它没有端口。',
      answer: 'tcpdump -i eth0 -nn vrrp',
      why: 'VRRP 是 IP 协议号 **112** 的独立协议，所以过滤表达式只能写 `vrrp`（等价于 `ip proto 112`），写 `port 112` 什么也抓不到。MASTER 默认每 1 秒向多播地址 `224.0.0.18` 发一个通告，在备机上**一个包都抓不到**就是通告没到；加 `-vv` 还能核对报文里的 `vrid` 与 `priority` 是否与配置一致。',
      contrast: '"抓不到"要分三种原因查：防火墙要按**协议**放行（`firewall-cmd --add-protocol=vrrp`，按端口放行无效）、云上 VPC 默认不转发 VRRP 多播（得改 `unicast_peer` 单播）、对端进程根本没起来。反过来，如果抓到**两台都在发**且 priority 相同，那就是双主的现场证据。',
      run: 'tcpdump -i eth0 -nn vrrp',
      cmdIds: ['mw-keepalive-tcpdump', 'mw-keepalive-troubleshoot', 'mw-keepalive-conf'],
      tags: ['Keepalived', 'VRRP', '抓包']
    },

    /* ---- 负载均衡与 etcd ---- */
    {
      id: 'card-mw-haproxy-check-before-reload',
      cat: 'middleware',
      kind: 'diagnose',
      level: 3,
      front: '改完负载均衡的配置文件直接重载，结果整个入口都不可用了。下次你要在重载之前先离线验一遍。',
      hint: '这个软件有一个"只解析、不启动"的参数。',
      answer: 'haproxy -c -f /etc/haproxy/haproxy.cfg',
      run: 'haproxy -c -f /etc/haproxy/haproxy.cfg',
      why: '`-c` 让 HAProxy 只做配置解析与校验，输出 `Configuration file is valid` 并且退出码为 0 才算通过；`bind` 端口冲突、`balance` 算法名写错、`server` 行语法问题都会在这一步报出来。判据就是这行 valid —— 没有它就别重载，因为负载均衡器是所有流量的单点，它挂掉比后端挂一台严重得多。',
      contrast: '校验通过但业务还是不通，方向要换成**后端被健康检查摘掉了**：用运行时统计（`echo "show stat" | socat stdio /var/run/haproxy.sock`）看每台 server 的 status 列是不是 `DOWN`，别再去改 frontend 的转发规则。',
      cmdIds: ['mw-haproxy-check', 'mw-haproxy-config', 'mw-haproxy-stats'],
      lesson: 'mw-haproxy-validate-before-reload',
      tags: ['HAProxy', '配置', '负载均衡']
    },

    {
      id: 'card-mw-etcd-quota-readonly',
      cat: 'middleware',
      kind: 'diagnose',
      level: 4,
      front: '集群里所有资源都创建不了了，报错里有一句 `mvcc: database space exceeded`。',
      hint: '这不是编排层的问题，是它底下那套键值存储把自己的配额写满了。',
      answer: 'etcdctl endpoint status --cluster -w table --endpoints=https://10.0.1.11:2379',
      run: 'etcdctl endpoint status --cluster -w table --endpoints=https://10.0.1.11:2379',
      why: '判据是 `DB SIZE` 列逼近默认 2GiB 配额（`--quota-backend-bytes`）：写满后集群进入**只读**，所有写操作失败，上层表现就是"什么都建不出来"。`DB SIZE IN USE` 远小于 `DB SIZE` 说明大头是历史版本与碎片，恢复顺序是 `compact` 压缩历史版本 → `defrag` 整理碎片，且 **defrag 必须逐节点做、期间该节点不可读写**。',
      contrast: '如果 `DB SIZE` 明明很小却报同样的错，方向要换成**磁盘真的满了或 inode 耗尽**（写 WAL 失败），这时清理键值数据毫无用处。如果只有部分节点不健康，先看 `IS LEADER` 与 `RAFT INDEX` 是否明显落后 —— 那是同步问题，不是容量问题，处理方式完全不同。',
      cmdIds: ['mw-etcd-status', 'mw-etcd-health', 'mw-etcd-snapshot'],
      lesson: 'mw-etcd-cluster-health',
      tags: ['etcd', '容量', '只读']
    },

    {
      id: 'card-mw-etcd-member-not-started',
      cat: 'middleware',
      kind: 'diagnose',
      level: 4,
      front: '一台节点重装后进程起来了，但集群里好像没有它 —— 你分不清是"成员登记了却没起来"还是"压根没加入"。',
      hint: '成员清单里能看到的比"一个名字列表"多得多。',
      answer: 'etcdctl member list -w table',
      run: 'etcdctl member list -w table',
      why: '成员清单每行有 ID、`started`、`isLearner`、名称与 peerURLs。判据分两种：**有 ID 但 `started` 为 false** = 成员已登记、进程没起来（或端口/证书不对，去看它的日志）；**清单里根本没有这个 ID** = 需要 `member add` 才能真正加入集群。两种情况的处置完全不同，所以必须先看这一列。',
      contrast: '`endpoint health --cluster` 只探测成员清单里**已经登记过**的节点 —— 一个被 `member remove` 移出、进程却还在跑的"幽灵节点"它完全发现不了，而那个节点还在向其他成员发 raft 消息，是集群不稳的隐蔽原因。要发现它只能靠成员清单加各节点日志。',
      cmdIds: ['mw-etcd-member-list', 'mw-etcd-health', 'mw-etcd-env'],
      lesson: 'mw-etcd-cluster-health',
      tags: ['etcd', '集群', '扩容']
    },

    {
      id: 'card-mw-too-many-open-files',
      cat: 'middleware',
      kind: 'diagnose',
      level: 3,
      front: '压测一上来，错误日志里就刷 `accept4() failed (24: Too many open files)`，可连接数上限明明配了 10240。',
      hint: '"连接数上限"和"进程能打开多少文件"是两个不同层级的天花板。',
      answer: 'grep -nE "worker_connections|worker_rlimit_nofile" /etc/nginx/nginx.conf',
      why: '`worker_connections` 是每个 worker 能同时打开的连接数，但真正的天花板是**进程的文件句柄上限** —— 报错里的 `24` 就是 `EMFILE`。判据是三层取最小值：`worker_connections` ≤ `worker_rlimit_nofile` ≤ 系统 `ulimit -n`。本站 `nginx.conf` 里只有 `worker_connections 10240;` 而没有 `worker_rlimit_nofile`，句柄数会退回系统默认值（常见 1024），10240 根本用不上。',
      contrast: '`Too many open files` 也可能是**句柄泄漏**（到后端的连接没复用、日志句柄没关），这种情况调大上限只是把崩溃时间往后推：用 `ls /proc/<master pid>/fd | wc -l` 看它是否随时间单调上涨。反过来，如果日志里是 `worker_connections are not enough`，那才是配置本身不够，把 `worker_connections` 调大再重载即可。',
      run: 'grep -nE "worker_connections|worker_rlimit_nofile" /etc/nginx/nginx.conf',
      cmdIds: ['mw-nginx-test', 'mw-nginx-signal', 'mw-nginx-limit'],
      lesson: 'mw-nginx-config-review',
      tags: ['Nginx', '句柄', '压测']
    },

    /* ---- 辨析：容易搞混的成对用法 ---- */
    {
      id: 'card-mw-t-vs-uppercase-t',
      cat: 'middleware',
      kind: 'distinguish',
      level: 2,
      front: '你改了一份子配置，重载没报错，但行为一点没变。要判断**这份文件到底有没有被加载**，`-t` 和 `-T` 该用哪个？',
      hint: '其中一个会把整份生效配置原样打出来，另一个只回两行。',
      answer: 'nginx -T',
      why: '`-t` 只回 `syntax is ok` 与 `test is successful` 两行，看不出到底读了哪些文件；`-T` 是 `-t` 的超集：先校验，再把主配置与**所有被 include 的文件**按加载顺序整份打印，每段前带 `# configuration file /etc/nginx/...` 头。判据：输出里出现 `# configuration file /etc/nginx/conf.d/xxx.conf` 才说明它真的生效了。',
      contrast: '如果文件确实被加载、配置也对，但行为还是旧的，那是**改完没有重载** —— `-T` 读的是磁盘上的文件，不能证明运行中的 worker 已经换了新配置。反过来，重载报 emerg 时新 worker 起不来，老进程继续用上一份配置跑，这时先看 error.log 比继续改配置有用。',
      run: 'nginx -T',
      cmdIds: ['mw-nginx-dump', 'mw-nginx-test'],
      lesson: 'mw-nginx-test-reload',
      tags: ['Nginx', '配置', '排查']
    },

    {
      id: 'card-mw-reload-vs-restart',
      cat: 'middleware',
      kind: 'distinguish',
      level: 2,
      front: '想让新配置生效，又不希望正在下载大文件的用户被掐断 —— "平滑重载"和"重启服务"差在哪？',
      hint: '一个像让老板换掉手下，另一个像先把人全辞了再重新招。',
      answer: 'nginx -s reload',
      why: '`-s reload` 本质是给 master 进程发 `HUP`：先校验配置，再起一批新 worker，老 worker 把手上的请求处理完才退出，**连接不断**。判据很反直觉：重载成功时**没有任何输出** —— 没有输出就是成功，失败才会打 `nginx: [emerg] ...`。',
      contrast: '重载也有做不到的事：改了 `user`、`pid`、`worker_processes` 这类 master 启动时就定下的指令，重载不生效，必须重启；升级了二进制同理。而且重载前永远先跑一次 `-t`，否则新 worker 起不来、老进程带病继续跑，你看到的只有 error.log 里的一行 emerg。',
      run: 'nginx -s reload',
      cmdIds: ['mw-nginx-signal', 'mw-nginx-test'],
      lesson: 'mw-nginx-test-reload',
      tags: ['Nginx', '重载']
    },

    {
      id: 'card-mw-quit-vs-stop',
      cat: 'middleware',
      kind: 'distinguish',
      level: 2,
      front: '停机维护要停掉反向代理，`-s stop` 和 `-s quit` 该选哪个？',
      hint: '一个等请求做完，一个当场掐断。',
      answer: 'nginx -s quit',
      why: '`quit` 对应 `SIGQUIT`，是**优雅退出**：不再接受新连接，把正在处理的请求做完再退，停机维护用它。`stop` 对应 `SIGTERM`，立即退出，正在上传/下载的连接被直接掐断，用户侧看到的是连接重置。判据：`stop` 之后 pid 文件被删掉，再执行重载会报 `invalid PID number "" in "/run/nginx.pid"`，那时只能靠 `systemctl start` 重新拉起。',
      contrast: '要**立刻腾出 80 端口**（比如换别的服务顶上）只能用 `stop` 再手工清 pid；只是让配置生效根本不需要停服务，`-t` 加重载就够了。另外老 worker 迟迟不退，说明有长连接或大文件传输卡着，`worker_shutdown_timeout` 可以设一个兜底时间。',
      run: 'nginx -s quit',
      cmdIds: ['mw-nginx-signal', 'mw-nginx-test'],
      lesson: 'mw-nginx-config-review',
      tags: ['Nginx', '停机', '优雅退出']
    },

    {
      id: 'card-mw-upstream-keepalive-conditions',
      cat: 'middleware',
      kind: 'distinguish',
      level: 3,
      front: '后端抱怨"每分钟几千个新连接、TIME_WAIT 堆满"，可上游配置里明明写了 `keepalive 32`。',
      hint: '这个参数生效还需要两行"配套"的指令，缺一个就等于没写。',
      answer: '还要同时写 proxy_http_version 1.1 与 proxy_set_header Connection ""',
      why: '`upstream` 块里的 `keepalive 32` 指的是**每个 worker 对每台后端保留的空闲长连接数**，但它必须同时满足两个条件才生效：`proxy_http_version 1.1;`（HTTP/1.0 默认每次关闭）与 `proxy_set_header Connection "";`（清掉客户端传来的 `Connection: close`）。缺任何一个，代理仍然每个请求新建一条 TCP 连接，后端自然看到大量 TIME_WAIT。',
      contrast: '另一个高频错法是**位置写错**：`keepalive` 只能写在 `upstream` 块内，写到 `server` 块里 `-t` 会报 `"keepalive" directive is not allowed here`。还要注意 `keepalive_requests`（默认 1000）：压测时一条长连接跑满 1000 个请求就被正常关闭，看起来像"长连接没生效"，其实是在按设计回收。',
      run: 'grep -n "keepalive" /etc/nginx/nginx.conf',
      cmdIds: ['mw-nginx-upstream', 'mw-nginx-proxy-pass'],
      lesson: 'mw-nginx-504-upstream-timeout',
      tags: ['Nginx', '长连接', '上游']
    },

    {
      id: 'card-mw-tomcat-thread-vs-queue',
      cat: 'middleware',
      kind: 'distinguish',
      level: 3,
      front: 'Tomcat 顶不住并发，把线程数上限从 200 加到 800 反而更慢了。',
      hint: '连接先被"接住"，再进队列，最后才轮到工作线程。',
      answer: '依次看 maxConnections → acceptCount → maxThreads',
      why: '三个数生效顺序固定：连接先占 `maxConnections`（NIO 默认 10000），超出的进 `acceptCount` 长度的等待队列（默认 100），队列也满了新连接直接被拒（客户端看到 connection reset）；`maxThreads`（默认 200）决定**同时干活的请求数**。判据：若线程都被下游（数据库、第三方接口）拖住，加线程只会让更多请求一起排队、上下文切换更凶，吞吐不升反降。',
      contrast: '判断"线程不够"还是"线程被卡住"，看线程栈比看数字有用：大量线程停在同一把锁或同一个下游调用上，那是**阻塞**而不是并发不足，方向是加超时、加缓存、加连接池。反过来，如果 CPU 已经打满、栈里都在算，那才该扩 CPU 或加实例。',
      cmdIds: ['mw-tomcat-serverxml', 'mw-tomcat-context'],
      tags: ['Tomcat', '并发', '调优']
    },

    {
      id: 'card-mw-catalina-run-vs-start',
      cat: 'middleware',
      kind: 'distinguish',
      level: 3,
      front: '同一个 Tomcat，用 `startup.sh` 起在虚机上一切正常，做成容器后却不停 `Exited (0)`。',
      hint: '容器只认一件事：1 号进程还活着吗。',
      answer: 'catalina.sh run',
      why: '`startup.sh` 是 fork 一个后台 JVM 然后**自己退出** —— 在容器里 1 号进程一退，容器就被判定结束，于是反复重启且退出码是 0（看着像"正常退出"，最容易误判成应用没问题）。`catalina.sh run` 让 Tomcat 在前台跑，日志直接进 stdout 能被日志驱动收走，`docker stop` 发的 SIGTERM 也能传到 JVM 做优雅停机。',
      contrast: '如果容器退出码是 **137** 而不是 0，方向完全不同：137 = 128 + 9 是被 SIGKILL 杀掉（内存超限触发 OOM Killer，或 stop 超时被强杀），要去查内存限额而不是改启动脚本。把 `catalina.out` 软链到 `/dev/stdout` 那种补丁治标不治本 —— 信号仍然到不了 JVM。',
      cmdIds: ['mw-tomcat-catalina', 'mw-tomcat-log'],
      tags: ['Tomcat', '容器', '启动']
    },

    {
      id: 'card-mw-etcd-health-vs-status',
      cat: 'middleware',
      kind: 'distinguish',
      level: 3,
      front: '两个都带 `--cluster` 的子命令：一个只回"健不健康"，另一个给一堆数字。排障该先用哪个？',
      hint: '一个回答"能不能写"，另一个回答"写了多少、谁是主"。',
      answer: 'endpoint health 判可用性，endpoint status 看容量与 raft 进度',
      why: '`endpoint health` 会对每个节点发一次**带写探测**的请求，通过时输出 `is healthy: successfully committed proposal`；`endpoint status` 才给 `DB SIZE`、`IS LEADER`、`RAFT TERM/INDEX`、`ERRORS` 这些可比较的数值。判据：health 报 `is unhealthy: failed to commit proposal: context deadline exceeded`，说明节点**连得上却提交不了**（磁盘 IO 太慢或与多数派失联），这时必须靠 status 看 `RAFT INDEX` 是否落后。',
      contrast: '单节点健康不等于集群健康：三节点挂一个仍在 quorum 内可写，挂两个就整体只读。所以两个命令都要带 `--cluster` 一次看全 —— 一个个节点试，还会因为"试到哪个节点"得出不一样的结论。',
      cmdIds: ['mw-etcd-health', 'mw-etcd-status'],
      lesson: 'mw-etcd-cluster-health',
      tags: ['etcd', '健康检查', 'raft']
    },

    /* ---- 参数填空 ---- */
    {
      id: 'card-mw-proxy-pass-trailing-slash',
      cat: 'middleware',
      kind: 'syntax',
      level: 3,
      front: '想让 `/api/orders` 到达后端时变成 `/orders`：\n\n  location /api/ {\n      proxy_pass http://app_backend____\n  }\n\n横线处填什么？',
      hint: '关键在于"后面带不带 URI"这件事，而不在于斜杠好不好看。',
      answer: '/（写成 proxy_pass http://app_backend/;）',
      why: '`proxy_pass` 后面**带 URI**（哪怕只有一个 `/`）时，代理会把 location 匹配到的那段前缀**替换**成这个 URI：`/api/orders` 变成 `/orders`；不带 URI 时原样透传完整路径，后端收到 `/api/orders`。判据：路径改错的典型现象是后端日志里全是 404，而 access.log 里状态码也是 **404 而不是 502** —— 连接完全正常，只是路径不对。',
      contrast: '如果看到 502/504，方向就完全变了：那是连接或超时问题，跟路径改写无关，先去 error.log 分辨 `connect() failed` 与 `upstream timed out`。另外改这类规则前先用 `-T` 确认线上真正生效的是哪一版 `proxy_pass`，多份子配置里可能有旧规则在覆盖。',
      run: 'grep -n "proxy_pass" /etc/nginx/nginx.conf',
      cmdIds: ['mw-nginx-proxy-pass', 'mw-nginx-location', 'mw-nginx-rewrite'],
      tags: ['Nginx', '路径改写']
    },

    {
      id: 'card-mw-etcd-snapshot-restore-datadir',
      cat: 'middleware',
      kind: 'syntax',
      level: 4,
      front: '要从快照恢复一套集群：\n\n  etcdctl snapshot restore snapshot.db ____\n\n横线处那个参数决定了"恢复到哪"，该写什么？',
      hint: '恢复出来的数据不能覆盖正在运行的那个节点目录。',
      answer: '--data-dir=/var/lib/etcd-restore',
      why: '`snapshot restore` 不是"把文件解回原位"，而是按快照**重建一个新的数据目录**并生成新的 member ID，所以必须指向一个与节点正在使用的目录**不同**的路径。指到 `/var/lib/etcd` 会让新数据与现有集群 ID 冲突，节点起不来甚至污染现场。判据：恢复成功会打印 `Member ... restored` 与新的 member ID —— 新 ID 意味着必须整集群一起恢复（各节点 restore 同一份快照后用新 ID 重建集群）。',
      contrast: '如果只是想找回被误删的**一个 key**，不要动整个集群：把快照恢复到一个离线目录、单独起一个临时实例把 key 读出来再写回生产，风险小几个数量级。另外快照是定时的、不是"任意时间点"，要精确回退得配合 WAL 日志。',
      cmdIds: ['mw-etcd-snapshot', 'mw-etcd-status', 'mw-etcd-kv'],
      lesson: 'mw-etcd-cluster-health',
      tags: ['etcd', '备份恢复']
    },

    {
      id: 'card-mw-log-upstream-addr',
      cat: 'middleware',
      kind: 'syntax',
      level: 3,
      front: '自定义日志格式，想在**多台后端**的情况下从一行日志里看出这次请求落到了哪台：\n\n  log_format main \'$remote_addr - $remote_user [$time_local] "$request" \'\n                   \'$status $body_bytes_sent "$http_referer" "$http_user_agent" ____\';\n\n横线处该填哪个变量？',
      hint: '这个名字里带"上游"的意思，发生重试时它会给出多个地址。',
      answer: '$upstream_addr',
      why: '`$upstream_addr` 记录本次请求实际转发到的上游地址；有上游重试时会给出一串**逗号分隔**的地址（如 `10.0.1.31:8080, 10.0.1.32:8080`），一眼看出第一次打给了谁。配套的 `$upstream_status` 给出各次尝试的状态码、`$upstream_response_time` 给出后端耗时。判据：把 `$upstream_response_time` 与 `$request_time` 相减，差值大说明时间花在代理内部排队等待、而不是后端处理上。',
      contrast: '如果这一列是**空的**，说明这个请求根本没走 `proxy_pass` —— 可能命中了静态文件、被 `return` 直接应答、或者 `try_files` 落到了本地文件。空值本身就是"请求到底有没有到后端"的证据，比猜配置可靠得多。',
      run: 'grep -n "access_log" /etc/nginx/nginx.conf',
      cmdIds: ['mw-nginx-log', 'mw-nginx-upstream'],
      lesson: 'mw-nginx-504-upstream-timeout',
      tags: ['Nginx', '日志', '负载均衡']
    },


    /* ==================================================================
       B. 数据库与缓存 db-cache（28 张）
       ================================================================== */

    /* ---- MySQL ---- */
    {
      id: 'card-db-processlist-full-vs-plain',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 2,
      front: '同事发来一张 `SHOW PROCESSLIST` 的截图，`Info` 列里的 SQL 正好截在 `...where o.created_at >= \'20` 就断了，你要完整语句。',
      hint: '有个关键字专门用来放开这一列的长度限制。',
      answer: 'mysql -uroot -p -e "SHOW FULL PROCESSLIST;"',
      why: '不加 `FULL` 时 `Info` 列只显示**前 100 个字符**，长 SQL 一律被切断（本站仿真里 ID=5 那条四表 join 就会被切）；加 `FULL` 才给完整文本，判据就是截断位置正好卡在 100 字符处。会话很多时 `FULL` 会返回巨量文本，可以改用 `SELECT id,user,time,state,left(info,80) FROM information_schema.processlist WHERE command<>\'Sleep\' ORDER BY time DESC` 只取需要的列。',
      contrast: '如果 `Info` 是 `NULL` 而 `Command` 是 `Sleep`，那不是被截断 —— 这条连接空闲着没跑任何语句，`Time` 大只说明它**空闲了很久**（连接池白占连接）。把它当慢查询处理，就会去优化一条根本不存在的 SQL。',
      run: 'mysql -uroot -p -e "SHOW FULL PROCESSLIST;"',
      cmdIds: ['db-mysql-processlist', 'db-mysql-connect-timeout'],
      lesson: 'db-conn-pool-exhausted',
      tags: ['MySQL', '会话', '排错']
    },

    {
      id: 'card-db-processlist-sort-by-time',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: '业务高峰期数据库里挂着上百个会话，你要**一眼**看到当前持续最久、最可疑的那几个，而不是在整屏结果里翻。',
      hint: '这张会话列表其实也能当表来查，能排序、能过滤。',
      answer: 'mysql -uroot -p -e "SELECT ID,USER,TIME,STATE,INFO FROM information_schema.processlist WHERE COMMAND <> \'Sleep\' ORDER BY TIME DESC;"',
      why: '把它当**表**查就能排序与过滤：滤掉空闲的 `Sleep` 再按 `TIME` 倒序，剩下的就是"已经跑了最久"的活儿。判据要连着 `USER`/`COMMAND` 一起读 —— 本站仿真里排第一的是 `event_scheduler`（Daemon，4120 秒）、第二是 `repl` 的 `Binlog Dump GTID`（3120 秒），它们 TIME 天然很大却都不是故障；真正的线索在后面两行：`Sending data`（312 秒，四表 join 在扫数据）与 `Waiting for table metadata lock`（287 秒，DDL 在等元数据锁）。',
      contrast: '如果最久的是大量 `Sleep`，那是**连接池把连接占着不用**（应用侧最大连接数配得比数据库上限还大，或连接没归还），要调连接池而不是杀查询。如果 `STATE` 是 `Waiting for table metadata lock`，还得继续往上找**持有元数据锁的未提交事务**，先解决它 DDL 才能往前走；`KILL QUERY <Id>` 只杀语句、连接保留，`KILL <Id>` 直接断连接、应用会重连。',
      run: 'mysql -uroot -p -e "SELECT ID,USER,TIME,STATE,INFO FROM information_schema.processlist WHERE COMMAND <> \'Sleep\' ORDER BY TIME DESC;"',
      cmdIds: ['db-mysql-processlist', 'db-mysql-innodb-status'],
      lesson: 'db-metadata-lock-wait',
      tags: ['MySQL', '阻塞', '长事务']
    },

    {
      id: 'card-db-max-connections-limit',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 2,
      front: '应用侧开始零星报"连不上数据库"，你想先确认服务端的连接数上限到底是多少。',
      hint: '这是一个纯数字的配置项，可以在不登录交互式客户端的情况下取到。',
      answer: 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'max_connections\';"',
      why: '判据是上限值本身：本站仿真 `max_connections` = 1000。真机上打满时的报错特征非常明确 —— `ERROR 1040 (HY000): Too many connections`（记住 1040 这个编号），而且这时**连 root 都可能挤不进去**，只能靠预留给管理员的额外连接额度，或先杀掉一批 Sleep 会话。',
      contrast: '如果连得上、只是变慢，问题通常不在上限，而在**连接被 Sleep 占满**：查 `wait_timeout`（本站 28800 秒 = 8 小时）是不是太长，以及应用连接池的最大连接数是不是比数据库上限还大。反过来，如果报的是 `connect timeout` / `Connection timed out`，那是网络层的事（云上安全组没放行、或只监听在 127.0.0.1），跟连接数毫无关系。',
      run: 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'max_connections\';"',
      cmdIds: ['db-mysql-connect-timeout', 'db-mysql-mysqladmin', 'db-mysql-client'],
      lesson: 'db-conn-pool-exhausted',
      tags: ['MySQL', '连接数']
    },

    {
      id: 'card-db-slowlog-empty-not-no-slow',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: '应用报了 5 秒超时，你打开慢查询日志却发现**里面一条都没有**，差点得出"没有慢 SQL"的结论。',
      hint: '问题可能出在"多慢才算慢"这个阈值上，而不是日志本身。',
      answer: 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'slow_query_log\'; SHOW VARIABLES LIKE \'long_query_time\';"',
      why: '判据是两个值一起看：本站仿真是 `slow_query_log=ON` 但 `long_query_time=5.000000` —— **只有超过 5 秒的语句才记**，而应用第 5 秒就超时并把语句取消了，于是慢日志永远是空的。所以"慢日志为空"不等于"没有慢 SQL"，必须先看阈值再下结论。',
      contrast: '要抓这种踩在阈值边缘的语句，把阈值降下来才看得见（`SET GLOBAL long_query_time=1`，**新连接才生效**，现有连接要重连）。如果 `slow_query_log=OFF`，那这台实例根本没开慢日志，得先打开。阈值调低后量太大时，再用 `pt-query-digest` 做聚合，别硬翻文本。',
      run: 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'slow_query_log\'; SHOW VARIABLES LIKE \'long_query_time\';"',
      cmdIds: ['db-mysql-slowlog', 'db-mysql-pt-query-digest', 'db-mysql-explain'],
      lesson: 'db-mysql-slow-query',
      tags: ['MySQL', '慢查询', '阈值']
    },

    {
      id: 'card-db-table-size-evidence',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: '你要用数据说明"这张流水表到底多大"，好决定是加索引、归档还是分区。',
      hint: '有一张系统视图专门描述所有库表的规模，可以直接当普通表来查和排序。',
      answer: 'mysql -uroot -p -e "SELECT TABLE_NAME,TABLE_ROWS,DATA_LENGTH,TABLE_COMMENT FROM information_schema.tables WHERE TABLE_SCHEMA=\'orders\' ORDER BY DATA_LENGTH DESC;"',
      why: '判据来自 `information_schema.TABLES` 的两列：`DATA_LENGTH` 是数据字节数（本站仿真 `order_items` 8589934592 ≈ 8GiB、`order_status_log` 6657199308 ≈ 6.2GiB 排在前面），`TABLE_ROWS` 是行数。而 `TABLE_COMMENT` 直接写着"状态流水：只增不改，没有索引" —— 5200 万行加零索引，正是应用报 `query timeout after 5000ms` 的根因候选。',
      contrast: '`TABLE_ROWS` 对 InnoDB 是**采样估算值**，不能当账目数字（要精确只能 `count(*)`，大表上很贵）。另外 `DATA_LENGTH` 不含索引与碎片：`DATA_FREE` 大说明碎片多、整理才有意义；如果数据量本身不大却查询慢，方向要换成**索引缺失或选择性差**，看执行计划而不是继续加资源。',
      run: 'mysql -uroot -p -e "SELECT TABLE_NAME,TABLE_ROWS,DATA_LENGTH,TABLE_COMMENT FROM information_schema.tables WHERE TABLE_SCHEMA=\'orders\' ORDER BY DATA_LENGTH DESC;"',
      cmdIds: ['db-mysql-information-schema', 'db-mysql-optimize-table', 'db-mysql-slowlog'],
      lesson: 'db-slow-query-triage',
      tags: ['MySQL', '容量', 'information_schema']
    },

    {
      id: 'card-db-wait-timeout-param',
      cat: 'db-cache',
      kind: 'syntax',
      level: 3,
      front: '想让**服务端**把空闲连接最多挂 10 分钟就踢掉：\n\n  SET GLOBAL ____ = 600;\n\n横线处填哪个参数？',
      hint: '它管的是"非交互"连接；还有一个管交互式客户端的孪生参数。',
      answer: 'wait_timeout',
      why: '`wait_timeout` 管**非交互**连接的空闲超时（默认 28800 秒 = 8 小时）；交互式客户端由 `interactive_timeout` 管，两个都设才不会出现"改了没生效"。判据是连接池报的那句经典错误：`The last packet successfully received from the server was 28,800,000 milliseconds ago` —— 连接池以为连接还活着，实际早被服务端踢掉了。',
      contrast: '客户端侧的 `maxLifetime`/`maxIdleTime` **必须比服务端 `wait_timeout` 小**，否则连接池永远在拿即将过期的连接去用。反过来，把服务端超时调得很小却不调连接池，会变成连接频繁重建、TPS 抖动 —— 这类参数永远要两端成对地改。',
      run: 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'wait_timeout\';"',
      cmdIds: ['db-mysql-connect-timeout', 'db-mysql-client'],
      lesson: 'db-mysql-params',
      tags: ['MySQL', '连接池', '参数']
    },

    {
      id: 'card-db-mysqldump-single-transaction',
      cat: 'db-cache',
      kind: 'syntax',
      level: 3,
      front: '要在**不锁表**的前提下导出一致性快照：\n\n  mysqldump -uroot -p --____ --source-data=2 orders > orders.sql\n\n横线处填什么？',
      hint: '靠一个"可重复读"的事务拿到快照，而不是靠锁。',
      answer: 'single-transaction',
      why: '`--single-transaction` 会先开一个 REPEATABLE READ 事务拿到一致性快照再导出，全程不锁表。判据在它的**适用边界**上：只对 **InnoDB** 有效，库里混着 MyISAM 表时那些表照样被锁。`--source-data=2`（旧名 `--master-data=2`）把当前 binlog 位点以注释写进 dump 头部，是之后做时间点恢复（PITR）的锚点。',
      contrast: '如果库里有长事务在跑，`--single-transaction` 拿不到干净快照，导出可能长时间不结束甚至卡在元数据锁上 —— 这时该去看会话列表找出那个长事务，而不是换参数硬扛。另外大库上逻辑备份恢复极慢，几百 G 以上应该换物理备份，但要注意物理备份**不能跨大版本**。',
      cmdIds: ['db-mysql-mysqldump', 'db-mysql-restore', 'db-mysql-xtrabackup'],
      tags: ['MySQL', '备份', '一致性']
    },

    /* ---- Redis ---- */
    {
      id: 'card-db-redis-maxmemory-zero',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: 'Redis 的内存一直在涨，但 `evicted_keys` 是 0，一个被淘汰的 key 都没有。',
      hint: '先确认这台实例到底有没有设过内存上限 —— 一个特殊的值表示"不限制"。',
      answer: 'redis-cli config get maxmemory',
      why: '判据就是这个返回值：`maxmemory` 为 **0 表示不限制内存**，一个字节都不会被淘汰，`evicted_keys` 自然恒为 0。真到把机器吃爆时，写命令直接返回 `OOM command not allowed when used memory > \'maxmemory\'`，读命令却还能用 —— 业务表现是"查得到、写不进"。本站仿真的 `maxmemory_policy` 是 `noeviction`，两者合起来就是"写满即报错"。',
      contrast: '如果 `maxmemory` 已经设了（比如 2gb）内存却仍超过它，要分清 `used_memory` 与 `used_memory_rss`：RSS 远大于 used_memory 是**内存碎片**（本站仿真 `mem_fragmentation_ratio` 1.87），调大上限解决不了，得靠重启或碎片整理。如果 used_memory 自己在涨，那是 key 只增不减，去查大 key 与没设过期时间的 key。',
      run: 'redis-cli config get maxmemory',
      cmdIds: ['db-redis-ops', 'db-redis-info', 'db-redis-memory-usage'],
      lesson: 'db-redis-slow-and-bigkey',
      tags: ['Redis', '内存', '淘汰']
    },

    {
      id: 'card-db-redis-ttl-minus-one-vs-minus-two',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 2,
      front: '`TTL` 返回 `-1` 和 `-2`，哪个表示"这个 key 永远不会过期"？',
      hint: '一个是"存在但没设过期"，一个是"根本不存在"。',
      answer: 'TTL 的三个返回值：-1 无过期时间（永生）、-2 key 不存在、正数是剩余秒数',
      why: '三个值含义完全不能混：`-1` 是 **key 存在但没设过期时间**（内存泄漏的头号嫌疑），`-2` 是 **key 不存在**（已过期或被删）。判据：本站仿真里 `cache:home:top` 返回 `-1`（永不过期的缓存 key），而 `cache:order:8812` 返回 `1800`（还剩 30 分钟），两者都是"存在"，处理方式却天差地别。',
      contrast: '监控脚本里把 `-1` 和 `-2` 都当"已过期"处理，内存告警就永远解释不清 —— 真正要盯的是 `-1` 的数量。要批量抽查就用 `--scan` 取 key 再逐个查（`KEYS` 会阻塞，见另一张卡）。另外 Redis 的过期是**惰性删除 + 定时采样**，到点的 key 内存不一定立刻释放，`DBSIZE` 与 `used_memory` 会滞后，别拿它们当实时值。',
      run: 'redis-cli ttl cache:home:top',
      cmdIds: ['db-redis-ttl', 'db-redis-scan'],
      tags: ['Redis', '过期', '内存泄漏']
    },

    {
      id: 'card-db-redis-bigkey-exact-memory',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: '大 key 扫描已经点名了那个 1MB 的字符串，但你要知道它**实际占了多少内存**，好判断是拆还是留。',
      hint: '要的是"这个 key 的成本"，比值的长度多出一些固定开销。',
      answer: 'redis-cli memory usage big:cache:report:2024Q1',
      why: '`MEMORY USAGE` 给的是这个 key 的**真实内存成本**（值 + key 名 + 对象开销）。本站仿真里大 key 扫描报的值长度是 `1048576 bytes`，而 `MEMORY USAGE` 返回 `1048655`，差的 79 字节正是固定开销。判据：返回值到了 MB 级、又只集中在一两个 key 上，就该拆（按业务维度打散）或压缩值。',
      contrast: '如果它很小、可 `INFO memory` 的 `used_memory` 很大，那内存不是被大 key 吃掉的，而是**海量小 key 的固定开销**（每 key 几十字节乘以几十万个）—— 方向是"减少 key 数量"，看 `DBSIZE` 与 `INFO keyspace`，这时候拆大 key 一点用都没有。',
      run: 'redis-cli memory usage big:cache:report:2024Q1',
      cmdIds: ['db-redis-memory-usage', 'db-redis-bigkeys', 'db-redis-dbsize'],
      lesson: 'db-redis-bigkeys',
      tags: ['Redis', '大key', '内存']
    },

    {
      id: 'card-db-redis-dbsize-vs-keyspace',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 2,
      front: '要确认"到底哪个库的 key 在膨胀"，只看当前库的计数命令给不出答案。',
      hint: '有一个分段输出能一次列出所有库，还带上"多少个 key 设了过期时间"。',
      answer: 'redis-cli info keyspace',
      why: '只报当前库的那条命令（O(1)，读的是计数器）在多库混用时极容易看错；`INFO keyspace` 一次列全部：本站仿真是 `db0:keys=13,expires=5`、`db1:keys=3,expires=0`、`db2:keys=1,expires=1`。判据：`expires=0` 的库意味着**整个库的 key 都没有过期时间**，比逐个抽查快得多。',
      contrast: '两者统计的都包含"已过期但还没被清理"的 key（惰性删除），数字会略大于真实有效 key 数；要按前缀精确统计只能 `--scan --pattern` 过滤。另外要内存不要数量：这两个命令都不给内存信息，内存得看 `INFO memory`。',
      run: 'redis-cli info keyspace',
      cmdIds: ['db-redis-dbsize', 'db-redis-info'],
      tags: ['Redis', 'keyspace', '巡检']
    },

    {
      id: 'card-db-redis-save-config-vs-persistence',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 3,
      front: '`CONFIG GET save` 返回 `3600 1 300 100 60 10000` —— 这能证明"这台实例不会丢数据"吗？',
      hint: '这一串数字是"什么时候存"，不是"存成功了没有"。',
      answer: '不能；持久化的真实状态要看 INFO persistence',
      why: '`save` 只是**自动 RDB 的触发条件**（60 秒内 1 万个 key 变化才存一次），低峰期可能几小时都不触发，所以它既不能证明"刚存过"，也不能说明"丢得少"。判据在 `INFO persistence`：`rdb_last_bgsave_status:ok` 表示最近一次保存成功（失败会是 `err`），`aof_enabled:0` 表示这台实例**没开 AOF**（本站仿真就是 0），而 `rdb_last_save_time` 与当前时间的差值就是"多久没落盘"。',
      contrast: '要接近"不丢数据"必须开 AOF（`appendonly yes` + `appendfsync everysec`），代价是写放大与重写开销。反过来，看到 `rdb_bgsave_in_progress:1` 时**不要再手工触发保存**、也不要在这时重启实例 —— fork 加写时复制期间内存可能接近翻倍。',
      run: 'redis-cli info persistence',
      cmdIds: ['db-redis-info', 'db-redis-ops'],
      tags: ['Redis', '持久化', 'RDB']
    },

    {
      id: 'card-db-redis-bigkeys-vs-hotkeys',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 3,
      front: '大 key 扫描和热 key 扫描都能"找出问题 key"，它们找的是同一类东西吗？',
      hint: '一个按"占多少内存"排，另一个按"被访问多少次"排，而且后者有前置条件。',
      answer: '不是：一个找占内存多的，一个找被访问最频繁的（且需要 LFU 策略）',
      why: '大 key 扫描底层用 SCAN 采样每个 key 的**大小**（string 看字节、list/hash/set/zset 看元素个数），没有任何前置条件；热 key 扫描依赖每个对象的 **LFU 访问计数**，必须先把淘汰策略设成 LFU 类（如 `allkeys-lfu`）并**运行一段时间积累计数**，否则报错或给出无意义结果。判据：本站仿真的策略是 `noeviction`，此时热 key 扫描拿不到有效数据。',
      contrast: '两类 key 的危害方向相反：大 key 的危害是**内存倾斜 + 删除时阻塞主线程**（`DEL` 一个大 hash 会卡住单线程实例，要用 `UNLINK` 异步删）；热 key 的危害是**单分片 QPS 打满**（集群里某个节点忙死、其他节点闲着），解法是本地缓存或把 key 打散，而不是拆内存。',
      run: 'redis-cli --bigkeys',
      cmdIds: ['db-redis-bigkeys', 'db-redis-type', 'db-redis-ops'],
      lesson: 'db-redis-bigkeys',
      tags: ['Redis', '大key', '热key']
    },

    {
      id: 'card-db-redis-select-vs-n',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 2,
      front: '代码里 `SELECT 1` 之后写进去的缓存，你用客户端怎么都读不到。',
      hint: '选库这件事，只在同一条连接里有效 —— 而命令行客户端每次都开新连接。',
      answer: 'redis-cli -n 1 get cache:cfg:app',
      why: '`SELECT` 只对**当前这条连接**有效，而命令行客户端**每次执行都是一条新连接**并默认连 0 号库，所以上一条命令里的 `SELECT 1` 对下一条命令毫无影响。判据是数量对不上：本站仿真 `redis-cli -n 1 dbsize` 返回 3，而不带 `-n` 的 `dbsize` 返回 13。',
      contrast: '生产上更该少用多库：**Cluster 模式只有 0 号库**，依赖 `SELECT` 的代码迁到集群会直接报错；而且多个库共用同一份内存与同一个 `maxmemory`，做不到资源隔离，真要隔离得拆实例。',
      run: 'redis-cli -n 1 get cache:cfg:app',
      cmdIds: ['db-redis-db-select', 'db-redis-cli'],
      lesson: 'db-redis-bigkeys',
      tags: ['Redis', '多库', '连接']
    },

    {
      id: 'card-db-redis-hit-rate-section',
      cat: 'db-cache',
      kind: 'syntax',
      level: 2,
      front: '要算缓存命中率，需要 `keyspace_hits` 与 `keyspace_misses` 两个数：\n\n  redis-cli info ____\n\n横线处填哪个分段名？',
      hint: '这两个字段属于"统计"那一段，不在内存段里。',
      answer: 'stats',
      why: '命中率 = `keyspace_hits / (keyspace_hits + keyspace_misses)`，这两个字段在 `# Stats` 段里；本站仿真 `842913 / (842913 + 1204)` ≈ 99.9%，说明缓存本身非常有效。分段取比整份 `INFO`（十几个段、几百行）快得多，也更容易喂给脚本。',
      contrast: '在 `INFO memory` 段里永远找不到命中率 —— 那一段只有内存与淘汰策略。另外命中率要结合业务看：写多读少的场景天然偏低；真正要警觉的是 `keyspace_misses` 与 `expired_keys` **同时猛涨**，那多半是缓存穿透或 key 命名不一致，而不是缓存被挤掉（`evicted_keys` 才是被挤掉的证据）。',
      run: 'redis-cli info stats',
      cmdIds: ['db-redis-info', 'db-redis-ops'],
      tags: ['Redis', '命中率', 'INFO']
    },

    {
      id: 'card-db-redis-save-vs-bgsave',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 3,
      front: '要立刻把内存里的数据落一份到磁盘，`SAVE` 和 `BGSAVE` 差在哪？',
      hint: '一个在主线程里干，一个 fork 出去干。',
      answer: 'BGSAVE',
      why: '`SAVE` 在**主线程**里做全量 RDB，写完之前所有客户端命令全部阻塞（大实例上几十秒到几分钟），生产环境等于自杀 —— 这是单线程模型决定的，没有任何办法绕过。`BGSAVE` 是 fork 一个子进程写盘，主线程继续服务。判据：`INFO persistence` 里 `rdb_bgsave_in_progress:1` 表示子进程正在写，`rdb_last_bgsave_status` 是结果，`latest_fork_usec` 记录 fork 本身的耗时（本站仿真 812 微秒）。',
      contrast: '`BGSAVE` 也不是免费：fork 会触发**写时复制**，写多的实例内存可能接近翻倍、`mem_fragmentation_ratio` 上升，所以内存已经吃紧时别手工触发。另外 `rdb_changes_since_last_save` 告诉你距上次保存又改了多少 key，是判断"这次崩了会丢多少"的直接依据。',
      run: 'redis-cli info persistence',
      cmdIds: ['db-redis-ops', 'db-redis-info', 'db-redis-monitor'],
      tags: ['Redis', '持久化', '阻塞']
    },

    {
      id: 'card-db-redis-config-get-glob',
      cat: 'db-cache',
      kind: 'syntax',
      level: 2,
      front: '想一次把和内存上限有关的所有配置项都取出来：\n\n  redis-cli config get "____"\n\n横线处填什么？',
      hint: '这个命令的参数支持通配符，但通配符要写在引号里。',
      answer: 'maxmemory*',
      why: '`CONFIG GET` 支持 glob 模式，`maxmemory*` 会同时返回 `maxmemory` 与 `maxmemory-policy`（返回值是"名、值"交替的编号数组，要配对读）；写死 `maxmemory` 只会返回一项，很容易漏掉策略那一项 —— 而"有没有设上限"和"满了怎么淘汰"必须一起看才有意义。',
      contrast: '别把返回的字符串当成多个配置项：`CONFIG GET save` 的值是**一整条** `3600 1 300 100 60 10000`，按空格切开当多项就错了。线上更推荐精确写参数名（7.0 起 `CONFIG GET` 才支持一次传多个参数名），`*` 通配要遍历全部配置项，在配置项很多的实例上并不是免费的。',
      run: 'redis-cli config get "maxmemory*"',
      cmdIds: ['db-redis-ops', 'db-redis-info'],
      tags: ['Redis', 'CONFIG', '参数']
    },

    {
      id: 'card-db-redis-monitor-timeboxed',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: '线上突然冒出一批来路不明的写命令，你要抓出**是谁、什么时候**发的，但又不能挂在那里不走。',
      hint: '有一个能把每条命令实时打出来的调试命令，代价很大，所以必须限时。',
      answer: 'timeout 10 redis-cli monitor',
      run: 'timeout 10 redis-cli monitor',
      why: '`MONITOR` 会把实例收到的**每一条**命令实时打出来，每行带时间戳与客户端地址（形如 `[0 127.0.0.1:44882]`），能直接定位到哪台机器、哪条连接。判据：必须**限时**用 —— 官方明确说明它会显著降低吞吐，自身也要占用可观的 CPU 与带宽，所以配 `timeout 10` 并在输出里筛目标 key，绝不能常驻。',
      contrast: '要找"哪个命令、哪个 key 最慢"，不该用 `MONITOR`，该用 `SLOWLOG GET`（只记录超过 `slowlog-log-slower-than` 的命令，开销极小）；要找热 key 用 `--hotkeys`（需 LFU 策略）。MONITOR 是最后手段，不是巡检工具。',
      cmdIds: ['db-redis-monitor', 'db-redis-slowlog', 'db-redis-bigkeys'],
      lesson: 'db-redis-slow-and-bigkey',
      tags: ['Redis', 'MONITOR', '抓现场']
    },

    {
      id: 'card-db-redis-maxmemory-policy-volatile',
      cat: 'db-cache',
      kind: 'syntax',
      level: 3,
      front: '内存满了要淘汰最久未使用的 key，但**只淘汰设了过期时间的那些**：\n\n  redis-cli config set maxmemory-policy ____\n\n横线处填什么？',
      hint: '策略名由"范围前缀 + 算法后缀"两段拼成。',
      answer: 'volatile-lru',
      why: '策略名由两部分拼成：前缀 `volatile-` 表示**只淘汰设了 TTL 的 key**，`allkeys-` 才对所有 key 生效；后缀是算法（`lru` 最近最少使用、`lfu` 最少访问频率、`random`、`ttl` 优先淘汰快过期的）。判据：设完且 `maxmemory` 有上限之后，`INFO stats` 的 `evicted_keys` 开始增长才说明淘汰真的发生了；本站仿真 `maxmemory=0` + `noeviction`，`evicted_keys` 恒为 0。',
      contrast: '用 `volatile-*` 而业务 key 大多没设 TTL，等于**没配淘汰** —— 内存照样写满并报 OOM；`allkeys-lru` 更安全，但会淘汰"热却没设 TTL"的数据，前提是缓存随时能重建。另外改策略**不会立刻回收内存**，必须同时给 `maxmemory` 设一个上限，这一条才有意义。',
      run: 'redis-cli config get maxmemory-policy',
      cmdIds: ['db-redis-ops', 'db-redis-info', 'db-redis-ttl'],
      tags: ['Redis', '淘汰策略', 'OOM']
    },

    /* ---- PostgreSQL ---- */
    {
      id: 'card-db-pg-wait-event-diagnosis',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 4,
      front: 'PostgreSQL 上一条 DDL 卡住了，随后所有查询都在排队，你要看**谁在等谁、在等什么**。',
      hint: '有一张活动会话视图会给每个会话标出明确的"等待原因分类"。',
      answer: 'SELECT pid,state,wait_event_type,wait_event,query FROM pg_stat_activity WHERE state <> \'idle\' ORDER BY query_start;',
      why: '判据在 `wait_event_type` 与 `wait_event` 的组合上：`Lock` + `relation` 表示在等表锁（DDL 要的 `AccessExclusiveLock` 会和一切冲突），`Client` + `ClientRead` 是客户端没继续发数据（最常见的"假活跃"），`IO` + `DataFileRead` 才是真在等磁盘。同时必须看 `state`：`idle in transaction` 表示开着事务却不干活，它就是锁的元凶。',
      contrast: '`state = idle` 的会话不占锁但占连接（默认上限 100），连接满时报 `FATAL: sorry, too many clients already`；而 `idle in transaction` 危险得多 —— 它**持有着事务里已经拿到的锁**，还会阻止 vacuum 回收死元组。另外 `pg_stat_activity.query` 只有**当前或最后一条**语句，要看历史累计耗时得靠 `pg_stat_statements`。',
      cmdIds: ['db-pg-stat-activity', 'db-pg-psql', 'db-pg-meta'],
      tags: ['PostgreSQL', '锁等待', '会话']
    },

    {
      id: 'card-db-pg-explain-analyze-buffers',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 3,
      front: 'PostgreSQL 上 `EXPLAIN` 和 `EXPLAIN ANALYZE` 只差一个词，什么时候必须用后者？',
      hint: '一个只看规划器的估计，另一个真的把语句跑一遍 —— 所以还要想清楚副作用。',
      answer: 'EXPLAIN (ANALYZE, BUFFERS) <SQL>',
      why: '`EXPLAIN` 只给规划器的**估算**（`rows` 是估计值，语句不执行）；`EXPLAIN ANALYZE` **真的执行**并给出每一步的 `actual time` 与 `actual rows`。判据：某一步 `rows=1` 而 `actual rows=100000` 这种数量级偏差，说明统计信息过期，先 `ANALYZE <表>` 再看计划。PG 特有的关键是加 `BUFFERS`：`shared hit/read` 中 `read` 很大说明缓存没命中、在真读磁盘。',
      contrast: '`ANALYZE` 放在 `EXPLAIN` 里是"执行并统计"，对 `UPDATE`/`DELETE` 会**真改数据**，要包在事务里回滚；而单独一条 `ANALYZE 表名` 是"更新统计信息"，两者同名不同事，别搞混。另外别在高峰期对大表做 `EXPLAIN ANALYZE`，它真的会把语句跑完。',
      cmdIds: ['db-pg-explain', 'db-pg-stat-activity'],
      tags: ['PostgreSQL', '执行计划', '统计信息']
    },

    {
      id: 'card-db-pg-connection-occupancy',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: '应用报 `FATAL: sorry, too many clients already`，你要先弄清连接都被谁占着。',
      hint: '连接是"进程"，所以数量可以直接按状态分组数出来。',
      answer: 'SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY count DESC;',
      why: 'PostgreSQL 是**进程模型**（每个连接一个 backend 进程），连接上限由 `max_connections` 决定，而实际占用就是活动会话视图的行数。判据：`idle` 占比高说明连接被池子占着不用（客户端连接池上限设得比数据库大，或应用没归还连接）；`idle in transaction` 有值就更危险 —— 它既占连接又占锁，还挡住 vacuum。',
      contrast: '调大 `max_connections` 不是好解法：每连接一个进程，内存与上下文切换成本线性上涨，几百以上就该上连接池（PgBouncer 的事务级池化），让几百个应用连接复用几十个数据库连接。另外新版本有 `idle_session_timeout` 可以自动清理空闲连接，适合用来兜底。',
      cmdIds: ['db-pg-stat-activity', 'db-pg-psql'],
      tags: ['PostgreSQL', '连接数', '连接池']
    },

    {
      id: 'card-db-pg-vacuum-vs-full',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 4,
      front: 'PostgreSQL 里删掉了几百万行，磁盘占用一点没降 —— `VACUUM` 和 `VACUUM FULL` 到底谁能让空间还给操作系统？',
      hint: '一个只把空间标成"自己还能用"，另一个重写整张表。',
      answer: 'VACUUM FULL（但会排他锁表，且需要约等于表大小的额外空间）',
      why: 'PostgreSQL 的 MVCC 不原地更新/删除：`DELETE` 只是把元组标记成死元组（`pg_stat_user_tables.n_dead_tup`），普通 `VACUUM` 只把空间标成**表内可复用**，文件不缩小、操作系统看不到空间释放；只有 `VACUUM FULL` 会重写整张表并把多余空间真正还回去。判据：`n_dead_tup` 大而 `last_autovacuum` 很旧，说明自动清理没跟上。',
      contrast: '如果 `last_autovacuum` 是最近的、死元组也不多，那磁盘没降属**正常**（空间在表内可复用），别急着 `VACUUM FULL`。真正要警惕的是**长事务**：一个开了很久的事务会让 vacuum 无法回收任何比它更晚的死元组，这是 PG 表膨胀与磁盘暴涨最常见的原因 —— 去看活动会话里 `xact_start` 很早的那个。',
      cmdIds: ['db-pg-meta', 'db-pg-stat-activity'],
      tags: ['PostgreSQL', 'MVCC', '膨胀']
    },

    /* ---- MongoDB ---- */
    {
      id: 'card-db-mongo-stats-three-sizes',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 3,
      front: 'MongoDB 一个集合的磁盘占用远超预期，几个"大小"字段分别说明什么？',
      hint: '要分清逻辑数据量、实际占用、以及索引各自占了多少。',
      answer: 'size 是逻辑数据量，storageSize 是实际占用（含压缩），totalIndexSize 是索引占用',
      why: '判据是三者的大小关系：`storageSize` 远大于 `size` 说明**碎片**多（大量删除或更新造成），要靠 compact 回收；`totalIndexSize` 接近甚至超过 `size` 说明索引建多了，每个索引都该单独核算；`avgObjSize` 很大而文档数不多，则是**文档模型**的问题。',
      contrast: '如果三个数都不大但查询还是慢，方向不是空间而是**索引没被用上**：看执行统计里"检查了多少文档"与"返回了多少文档"的比值，越接近 1 越高效。另外单文档有 16MB 上限 —— 把明细数组塞进一个文档会让它无限增长，该拆成独立集合。',
      cmdIds: ['db-mongo-stats', 'db-mongo-find', 'db-mongo-shell'],
      tags: ['MongoDB', '容量', '索引']
    },

    {
      id: 'card-db-mongo-explain-collscan',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 3,
      front: 'MongoDB 的查询"看起来用了索引"，怎么确认它真的没做全集合扫描？',
      hint: '要看执行计划里那个 stage 字段，以及"检查文档数"与"返回文档数"的比值。',
      answer: 'db.orders.find({...}).explain("executionStats")',
      why: '判据是 `winningPlan.stage`：`COLLSCAN` = 全集合扫描（没索引或没用上），`IXSCAN` = 走索引。再配合执行统计里的两个数 —— 检查文档数与返回文档数的比值越接近 1 越好；检查数比返回数大几十倍，说明索引选择性太差或扫描方向不对，等于白建。',
      contrast: '`IXSCAN` 用上了还是很慢，就看扫了多少**索引键**、以及计划里有没有内存排序阶段：扫了很多索引键通常是**复合索引字段顺序**不对（遵循最左前缀，等值条件该排在范围条件之前）；出现内存排序说明排序没走索引，而内存排序超过 100MB 会直接报错。',
      cmdIds: ['db-mongo-find', 'db-mongo-stats'],
      tags: ['MongoDB', '执行计划', '索引']
    },

    /* ---- Kafka 与消息队列 ---- */
    {
      id: 'card-db-kafka-consumer-lag',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 4,
      front: '消费端说"消息处理有延迟"，你要用一个数字说清**积压了多少、压在哪个分区**。',
      hint: '有一个按消费组维度的命令，输出的每一行就是一个分区。',
      answer: 'kafka-consumer-groups.sh --bootstrap-server kafka-broker-01:9092 --describe --group order-consumer',
      why: '`--describe` 每行是一个分区，关键三列：`CURRENT-OFFSET`（消费到哪）、`LOG-END-OFFSET`（写到哪）、`LAG`（差额）。判据：**LAG 是按分区给的**，所以能分清"所有分区均匀积压"（消费能力不足，加消费者实例）还是"只有某几个分区积压"（分区键选得不好、数据倾斜）。`CONSUMER-ID` 为空表示该分区**当前没有消费者**（消费者掉了，或消费者数少于分区数）。',
      contrast: 'LAG 不涨但业务报错，那不是积压而是**消费失败重试**（反复拉取到同一条消息），要去应用日志里找。如果命令直接报消费组不存在，说明位点已过期被清理（`offsets.retention.minutes`），消费者下次会按 `auto.offset.reset` 从头或从尾开始 —— 这正是"消息重复消费/丢消息"的经典根因。',
      cmdIds: ['db-kafka-consumer-groups', 'db-kafka-topics-describe', 'db-kafka-console-consumer'],
      lesson: 'db-kafka-consumer-lag',
      tags: ['Kafka', '积压', '消费组']
    },

    {
      id: 'card-db-kafka-partition-skew',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 4,
      front: 'Kafka 的一个主题建了 12 个分区，但数据几乎只落在 3 个分区里。',
      hint: '有两件事要分开看：数据为什么集中，以及副本是不是都在同步。',
      answer: 'kafka-topics.sh --bootstrap-server kafka-broker-01:9092 --describe --topic order-events',
      why: '`--describe` 逐分区给出 `Leader`、`Replicas`、`Isr`。判据：数据集中在少数分区 = 生产者用了显式分区号，或按 key 哈希分布不均（只有 `key=null` 时新版本才做粘性轮转）；`Isr` 比 `Replicas` 少说明**有副本落后**，配合 `acks=all` 与 `min.insync.replicas=2` 会直接影响可用性；`Leader` 为 -1 表示该分区没有 leader，生产和消费都会失败。',
      contrast: '"分区数不够、单分区吞吐打满"确实该加分区，但**加分区会改变 key 的哈希目标分区** —— 同一个 key 的前后消息可能落到不同分区，顺序性保证当场失效。有顺序要求的业务不能随便加分区，得先停写或改 key 设计；只是副本落后的话，方向是查那个 broker 的磁盘与网络，而不是动分区数。',
      cmdIds: ['db-kafka-topics-describe', 'db-kafka-topics-create', 'db-kafka-topics-list'],
      lesson: 'db-kafka-consumer-lag',
      tags: ['Kafka', '分区', '副本']
    },

    {
      id: 'card-db-rabbit-ready-vs-unacked',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: '消息队列的管理页面上"就绪消息"不多，消费者进程也在，但队列就是不见消化。',
      hint: '要同时看四个数：总量、就绪、已投未确认、在线消费者数。',
      answer: 'rabbitmqctl list_queues name messages messages_ready messages_unacknowledged consumers',
      run: 'rabbitmqctl list_queues name messages messages_ready messages_unacknowledged consumers',
      why: '判据是把四个数一起看：`messages_ready` 大而 `consumers` 为 0 = **没有消费者在线**（进程挂了，或队列没绑上正确的路由键）；`messages_unacknowledged` 大 = 消息已经投给消费者但没被确认（消费逻辑卡住，或预取数太大把消息全推给了同一个消费者）。`messages` 是两者之和，只看它无法区分这两种情况。',
      contrast: '如果消费者数正常、未确认数也不高，但消息持续增长，那是**生产速率大于消费速率**，要加消费者或优化消费逻辑。还有一种"看着像消费不动"的情况：连接被流控阻塞（内存或磁盘水位告警触发），这时看连接列表能看到连接状态，日志里会有对应的水位告警 —— 要先去降水位，加消费者没有任何用。',
      cmdIds: ['db-rabbit-list-queues', 'db-rabbit-connections', 'db-rabbit-status'],
      tags: ['RabbitMQ', '队列', '消费']
    },


    /* ==================================================================
       C. 监控与日志 monitor（17 张）
       ================================================================== */

    {
      id: 'card-mon-journalctl-priority-vs-unit',
      cat: 'monitor',
      kind: 'distinguish',
      level: 2,
      front: '凌晨告警了，你要一眼捞出**所有服务**里错误级别以上的日志，而不是一个服务一个服务地翻。',
      hint: '过滤维度有两个：按来源，或按严重程度。',
      answer: 'journalctl -p err -n 50（-p 按优先级，-u 按服务）',
      why: '`-p` 接受 `emerg/alert/crit/err/warning/notice/info/debug` 或 0~7，含义是**该级别及以上**（`-p err` 也包含 crit/alert/emerg）；`-u` 只按单元过滤，别的服务的日志照样混进来。判据：`-p err` 的输出行首是优先级别名，`-u` 的输出是某个服务自己的 stdout/stderr（本站 `journalctl -u myapp` 里就是 Spring Boot 的启动行）。',
      contrast: '两个维度可以叠加（`-u myapp -p err --since "10 min ago"`）。另外 `-p` 依赖日志带 `PRIORITY` 字段：程序直接 `echo` 到 stdout 的内容会被记成 info，`-p err` 永远捞不到，这种情况只能靠文本特征去筛。还要注意日志能不能跨重启保留，取决于 journald 是否开了持久化存储（`/var/log/journal` 存在才会留），只查本次启动加 `-b`、查上一次加 `-b -1`。',
      run: 'journalctl -u myapp -n 20',
      cmdIds: ['mo-log-journalctl', 'mo-log-var-log', 'mo-log-tail'],
      tags: ['日志', 'journald', '优先级']
    },

    {
      id: 'card-mon-truncate-busy-log',
      cat: 'monitor',
      kind: 'diagnose',
      level: 3,
      front: '`/data` 分区已经 100%，其中日志目录一个就占 157M。你要**不重启应用、也不丢正在写的日志**，先把空间腾出来。',
      hint: '要让文件"还在原地、内容归零"，而不是让它从目录里消失。',
      answer: 'truncate -s 0 /data/app/logs/app.log',
      why: '日志文件必须**原地清空**（`truncate -s 0` 或 `> 文件`），因为应用还持着这个 inode 的写句柄；`rm` 之后文件从目录里消失、句柄却不释放，`df` 里的空间一点不还，反而更难排查（只有 `lsof +L1` 看得见）。判据：清空后 `df -h` 的 `Avail` 立刻变化，而 `ls -l` 里文件**还在**、大小变成 0。',
      contrast: '如果清空后空间没释放，说明还有别的进程占着已删除的文件（`lsof +L1` 一查便知）。如果 `/data` 的 **inode 也是 100%**（本站仿真就是，13107200 个用满），那根因是海量小文件而不是大日志 —— 清空日志只治标，得去 `find /data -type f | wc -l` 数文件、找小文件来源。',
      run: 'du -sh /data/app/logs',
      cmdIds: ['mo-log-disk-full', 'mo-lsof', 'mo-log-logrotate', 'ls9-du'],
      lesson: 'mon-io-bottleneck',
      tags: ['磁盘满', '日志', '应急']
    },

    {
      id: 'card-mon-iostat-util-vs-await',
      cat: 'monitor',
      kind: 'distinguish',
      level: 3,
      front: '磁盘监控里 `%util` 已经 99%，可同事说"机械盘就这样，没事"。到底哪个数才是"盘扛不住"的判据？',
      hint: '一个说"队列一直是满的"，另一个说"每次 IO 要等多久"。',
      answer: 'iostat -x 1 2（%util 看队列占用，await 看单次 IO 延迟，两个都要看）',
      why: '`%util` 接近 100 说明设备队列几乎一直是满的；`await` 是平均每次 IO 的等待毫秒数，本站仿真 `/data` 所在的 vdb 是 `%util 99.41` 加 `w_await 42.18` —— 机械盘正常值在 20ms 以内，42ms 说明后端存储确实吃紧；`aqu-sz`（平均队列深度）大于 1 表示请求在排队。判据：三个数一起看，`%util` 高但 `await` 很低通常是**小 IO 打满**，可以靠合并写优化；`await` 高才是真的慢。',
      contrast: '**`iostat` 的第一行是自开机以来的平均值**，判断当前状况必须看后面按间隔采样的行 —— 所以写 `iostat -x 1 2` 而不是 `iostat -x`，这是最容易踩的坑。另外 `%util` 很低却依然慢，说明瓶颈不在本地磁盘：可能是网络存储的延迟，或者根本是**单次 IO 延迟高而不是带宽不足**。',
      run: 'iostat -x 1 2',
      cmdIds: ['mo-iostat', 'mo-vmstat', 'ls9-iostat'],
      lesson: 'mon-io-bottleneck',
      tags: ['IO', '性能', '磁盘']
    },

    {
      id: 'card-mon-oomkilled-exit-137',
      cat: 'monitor',
      kind: 'diagnose',
      level: 3,
      front: '一个容器反复重启，退出码是 137。你要确认它是被内存限制杀掉的，还是应用自己退出的。',
      hint: '137 只说明"被 SIGKILL 了"，还得看另一个布尔字段才能定罪。',
      answer: 'docker inspect -f "{{.State.OOMKilled}}" debug-tmp',
      why: '退出码 137 = 128 + 9，就是收到了 SIGKILL；但 SIGKILL 也可能是 `docker stop` 超时之后被强杀，所以必须看 `.State.OOMKilled`：**true** 才证明是内核 OOM Killer 干的（本站仿真 `debug-tmp` 就是 `Exited (137)` 加 `OOMKilled: true`）。判据是两者同时成立：`ExitCode=137` 且 `OOMKilled=true`。',
      contrast: '容器级 OOM 与宿主机级 OOM 是两回事：容器设了内存限制时是 cgroup OOM，只杀容器内进程；宿主机内存耗尽时内核会挑一个"分数最高"的进程杀，可能杀掉完全无关的业务，而**容器侧一点痕迹都没有** —— 那种现场只在宿主机的 `dmesg -T` 里。另外 `docker stats --no-stream` 里 `MEM USAGE / LIMIT` 已经超过限额（本站仿真 web 容器 612.4MiB / 512MiB = 119.61%）就是即将被杀的信号。',
      run: 'docker inspect -f "{{.State.OOMKilled}}" debug-tmp',
      cmdIds: ['dk-troubleshoot-restart', 'dk-inspect', 'mo-dmesg'],
      lesson: 'mon-process-vanished',
      tags: ['容器', 'OOM', '退出码']
    },

    {
      id: 'card-mon-sort-before-uniq',
      cat: 'monitor',
      kind: 'syntax',
      level: 2,
      front: '要数出同一类错误各出现多少次：\n\n  grep ERROR /data/app/logs/app.log | ____ | uniq -c | sort -rn\n\n横线处填什么？',
      hint: '有一个命令只合并"挨在一起"的重复行。',
      answer: 'sort',
      why: '`uniq` 只合并**相邻**的重复行：日志里同类错误往往不挨着（中间夹着 INFO），不先排序就会得到一堆计数为 1 的行。判据很直观：如果结果里大部分行的计数都是 1，就是漏了这一步。完整顺序是 `sort` → `uniq -c` → `sort -rn`（最后一步才按次数排）。',
      contrast: '如果分组键不是整行（按分钟、按客户端地址统计），直接对整行排序反而不对 —— 要先用 `cut` 或 `awk` 把分组键取出来再排序计数。另外 `sort -u` 与 `uniq` 不等价：`sort -u` 会丢掉"出现次数"这个关键信息。',
      run: 'grep ERROR /data/app/logs/app.log | sort | uniq -c | sort -rn',
      cmdIds: ['lt-uniq', 'lt-sort-column', 'lt-grep'],
      lesson: 'awk-topip',
      tags: ['日志', '统计', '管道']
    },

    {
      id: 'card-mon-logrotate-old-file-growing',
      cat: 'monitor',
      kind: 'distinguish',
      level: 3,
      front: '日志切割之后 `ls -l` 发现"老日志"还在变大，磁盘占用也没降。',
      hint: '切割只动了目录里的名字，进程手里的句柄并没有跟着换。',
      answer: '默认是重命名 + 新建，必须配 postrotate 发信号让进程重新打开文件；不想动进程就用 copytruncate',
      why: '默认方式是把日志重命名成 `.1` 再建一个新的，但应用仍持着**旧 inode** 的句柄，于是继续往改名后的文件里写 —— 现象就是"切过的文件还在涨"。判据：切割后老文件大小持续增长，就说明没配 `postrotate` 或信号发错了（本站条目里的做法是给服务发信号让它重新打开日志文件）。',
      contrast: '`copytruncate` 是先拷贝再原地截断，进程不用重新打开文件、也无需 reload，代价是拷贝与截断之间**可能丢一小段日志**。另外容器场景别用切割工具：容器日志要靠 Docker 的限制策略（本站 `/etc/docker/daemon.json` 里就是 `max-size: 10m`、`max-file: 3`），容器里通常收不到 postrotate 的信号。',
      cmdIds: ['mo-log-logrotate', 'mo-log-var-log', 'mw-nginx-signal'],
      lesson: 'mon-logrotate-disk-full',
      tags: ['日志', '切割', 'logrotate']
    },

    {
      id: 'card-mon-sar-history-after-incident',
      cat: 'monitor',
      kind: 'distinguish',
      level: 3,
      front: '用户报"昨天下午三点特别慢"，你现在才登录机器 —— 那些看瞬时值的工具还帮得上忙吗？',
      hint: '要区分"现在这一刻"和"当时那一刻"，后者需要有人提前把数据存下来。',
      answer: 'sar -u -s 15:00:00 -e 15:30:00（故障过去后只能靠历史采集）',
      why: '`top`/`vmstat`/`iostat`/`free` 给的都是**瞬时值或短窗口采样**，故障过去之后什么都看不到；`sar` 读的是 sysstat 定时采集到 `/var/log/sa/saXX` 的历史文件，能按任意时间段回看 CPU（`-u`）、内存（`-r`）、磁盘（`-d`）、网络（`-n DEV`）。判据：先确认采集服务在跑且那个时段有文件，否则只会回 `Cannot open /var/log/sa/sa18: No such file or directory`。',
      contrast: '机器上没装、或没开采集，历史数据就真的没有了 —— 这正是"监控要先建后查"的原因；云上可以用云监控的指标回看，`from`/`to` 两个参数就是为这种事准备的。另外 `sar` 默认 10 分钟一个采样点，**抓不到几秒级的尖刺**，看尖刺得靠 15 秒粒度的指标系统或当时的告警记录。',
      cmdIds: ['mo-sar', 'mo-top', 'mo-hcloud-ces'],
      lesson: 'mon-look-back-yesterday',
      tags: ['历史数据', '性能', 'sysstat']
    },

    {
      id: 'card-mon-promtool-check-vs-query',
      cat: 'monitor',
      kind: 'distinguish',
      level: 4,
      front: '改完监控系统的抓取配置，你既想"别把服务改挂"，又想确认"目标真的被抓到了"。这两件事分别用什么？',
      hint: '一个离线校验文件，一个在线问服务端要数据。',
      answer: 'promtool check config 校验配置；promtool query instant 直接问服务端当前值',
      why: '`promtool check config` 会同时校验主配置与所有规则文件，逐项打印 SUCCESS，YAML 缩进错或 PromQL 写错都会带行号报出来 —— 判据就是输出里有没有 `FAILED`，有就别重载（重载失败时服务继续用旧配置跑，你以为改了其实没改）。抓取是否正常则要问服务端：`promtool query instant http://localhost:9090 up`，返回 0 的实例就是抓取失败的那个。',
      contrast: '配置校验通过 ≠ 抓取正常：最常见的"指标没上来"是目标的 `/metrics` 路径不对或网络不通，要去服务端的 `/targets` 页面看 `State` 是不是 DOWN 以及 `Error` 列的具体报错。另外在线重载接口通常需要启动时显式开启，没开就只能发信号或重启。',
      cmdIds: ['mo-promtool-check', 'mo-promtool-query', 'mo-promql'],
      lesson: 'mon-promtool-validate',
      tags: ['Prometheus', '配置', '校验']
    },

    {
      id: 'card-mon-jstat-vs-jmap-jstack',
      cat: 'monitor',
      kind: 'distinguish',
      level: 4,
      front: '线上 Java 服务偶尔卡顿，你想先看 GC 情况，又**不敢**做任何可能让进程停一下的操作。',
      hint: '同族的工具里，有的只读计数器，有的会触发一次完整回收。',
      answer: 'jstat -gcutil 18442 1000 10',
      run: 'jstat -gcutil 18442 1000 10',
      why: '`jstat -gcutil <pid> <间隔毫秒> <次数>` 只是按间隔读 JVM 内部的 GC 计数器，开销极小、不加停顿；输出的 `YGC/YGCT`（新生代回收次数与总耗时）、`FGC/FGCT`（完整回收）是关键。判据：**两次采样之间 FGC 涨了**就说明这段时间发生了完整回收；`O`（老年代使用率）长期贴着 100% 说明老年代不够或有内存泄漏。',
      contrast: '同族另两个工具的代价完全不同：`jmap -dump:live` 与 `jmap -histo:live` 都会**触发一次完整回收**（生产慎用），看线程栈相对轻量但也要等一个安全点。而且它们回答的问题不一样：线程栈看的是"是不是都卡在同一把锁或同一个下游调用上"，跟 GC 是两条独立线索 —— 卡顿既可能来自 GC 也可能来自锁竞争，别用一个工具去解释另一类问题。',
      cmdIds: ['mo-jvm-jstat', 'mo-jvm-jps', 'mo-jvm-jstack', 'mo-jvm-jmap'],
      lesson: 'mon-jvm-gc-pause',
      tags: ['JVM', 'GC', '无侵入']
    },

    {
      id: 'card-mon-ces-metric-query',
      cat: 'monitor',
      kind: 'diagnose',
      level: 4,
      front: '你要在脚本里取某台云主机过去一小时的 CPU 平均使用率，而不是登控制台截图。',
      hint: '云监控的接口有固定的命名空间、维度与聚合粒度，参数写错不会报错、只会返回空数据。',
      answer: 'hcloud CES ShowMetricData/v1 --cli-region=cn-north-4 --project_id=<项目ID> --namespace=SYS.ECS --metric_name=cpu_util --dim.0="instance_id,<实例ID>" --filter=average --period=300 --from=<起始毫秒> --to=<结束毫秒>',
      why: '四个参数最容易写错：`namespace` 必须是 `SYS.ECS` 这种**服务命名空间**（不是 `ECS`）；`dim.0` 的格式是「维度键,维度值」用**英文逗号**连接；`period` 只能取 1/60/300/1200/3600/14400/86400 秒；`from`/`to` 是**毫秒**时间戳且 `from` 必须小于 `to`。判据：返回的数据点数组为空时，最常见原因不是"没数据"，而是 `from` 距当前太近、聚合周期还没算完 —— 官方建议 from 至少向前偏移一个 `period`。',
      contrast: '调参数时先加 `--dryrun`（只打印请求报文不真正调用），能省掉大量试错。另一个高频失败是**指标名用了别的服务的叫法**（比如把 `cpu_util` 写成 `cpu_usage`）：接口不报错，只返回空数据，得回去查"支持监控的服务列表"确认命名空间与指标名的搭配。批量巡检还要注意接口限流，脚本必须做退避重试。',
      cmdIds: ['mo-hcloud-ces', 'mo-promql', 'mo-zabbix-get'],
      tags: ['华为云', '云监控', 'KooCLI']
    },

    {
      id: 'card-mon-lts-cross-host-search',
      cat: 'monitor',
      kind: 'diagnose',
      level: 4,
      front: '同一套应用有三台机器，要找出**哪台**在报 `query timeout`，但不想一台台登上去翻文件。',
      hint: '云日志服务支持关键词检索，还支持按结构化字段过滤主机。',
      answer: 'hcloud LTS ListLogs --cli-region=cn-north-4 --project_id=<项目ID> --log_group_id=<日志组ID> --log_stream_id=<日志流ID> --start_time=<起始毫秒> --end_time=<结束毫秒> --keywords="query timeout" --is_desc=true --limit=100',
      why: '`keywords` 做关键词精确搜索、结构化字段过滤可以按主机名收窄，一次就能跨主机定位；`start_time`/`end_time` 是**毫秒**时间戳、闭区间、单次跨度上限 180 天且两者不能相等。判据：返回的每条日志都带结构化字段，按主机名字段分组就知道是哪台在报错；要只看量级可以打开"返回总数"的开关。',
      contrast: '开启**分析查询**后，除起止时间以外的其他查询参数**全部失效**（条数、排序、分页都要写进分析语句里），这是"改了参数没反应"最常见的原因。另外结构化字段过滤依赖日志流已经建好索引，未索引的字段过滤不出任何结果，别误判成"没有日志"；单次条数有上限，翻页要用返回里的游标。',
      cmdIds: ['mo-hcloud-lts', 'mo-log-journalctl', 'mo-log-tail'],
      tags: ['华为云', '日志检索', 'KooCLI']
    },

    {
      id: 'card-mon-metric-then-log',
      cat: 'monitor',
      kind: 'distinguish',
      level: 3,
      front: '云监控的使用率曲线和云日志服务里的日志，排障时谁先谁后？',
      hint: '一个回答"什么时候出的问题"，另一个回答"出了什么问题"。',
      answer: '先看指标确定时间窗，再用日志找文本证据',
      why: '告警本身是由**指标**触发的，它只能告诉你"3:12 磁盘使用率到了 100%"，回答不了"是谁把盘写满的"；把那个时间窗拿去检索**日志**（关键词或聚合查询）才能拿到文本证据。判据：指标返回的是时间戳加数值，日志的每条也带时间戳，两者能按时间戳对齐到分钟级 —— 用指标给出的时间点前后各留一个采集周期作为日志查询的起止时间，就能精确锁定那几分钟。',
      contrast: '只查日志不建指标，会出现"能解释已经发生的故障、却预测不了下一次"；反过来只有指标没有日志，就只能看到曲线掉下去而不知道为什么。完整做法还有第三层 —— **调用链**：指标发现异常 → 日志看到报错 → 链路定位到具体服务与接口，三者缺一个都会在某个环节卡住。',
      cmdIds: ['mo-hcloud-ces', 'mo-hcloud-lts', 'mo-promql'],
      tags: ['监控', '日志', '排障顺序']
    },

    {
      id: 'card-mon-journald-maxuse',
      cat: 'monitor',
      kind: 'diagnose',
      level: 3,
      front: '持久化的系统日志目录涨到几个 G，手工清理一次，过几天又回来了。',
      hint: '清理只是治标 —— 要先找到那个"没有上限"的配置项。',
      answer: 'journalctl --vacuum-size=500M（治标）+ 在 journald 配置里设 SystemMaxUse=500M（治本）',
      why: '清理只是把已有日志删掉，**根因是 journald 默认不限制持久化日志的占用**：`/var/log/journal` 存在就持久化，不存在就只放内存。判据：用 `journalctl --disk-usage` 看当前占用，真正的上限在 `/etc/systemd/journald.conf` 的 `SystemMaxUse=`（或 `SystemKeepFree=`）；`Storage=` 决定持久化与否。改完要重启 journald 服务。',
      contrast: 'journald 只管 systemd 收到的日志，`/var/log/nginx/*.log` 这类应用自己写的文件它**一点不管**（那要靠切割工具）—— 磁盘满时两个来源都要查。容器日志又在两者之外：Docker 的 json 日志要用 `daemon.json` 的限制项控制。三个来源、三套机制，别用一个办法去治全部。',
      run: 'du -sh /var/log',
      cmdIds: ['mo-log-journald-conf', 'mo-log-var-log', 'mo-log-logrotate', 'mo-log-disk-full'],
      lesson: 'mon-logrotate-disk-full',
      tags: ['日志', 'journald', '磁盘']
    },

    {
      id: 'card-mon-ps-sort-cpu-top3',
      cat: 'monitor',
      kind: 'diagnose',
      level: 2,
      front: '机器整体变慢，你要先确认**是哪个进程在吃 CPU**，并且只要前三名。',
      hint: '排序方向由一个符号决定，写错了看到的是最闲的那几个。',
      answer: 'ps aux --sort=-%cpu | head -4',
      why: '`--sort=-%cpu` 里的**减号表示降序** —— 不加减号是升序，看到的是最闲的几个进程，很多人第一次用就踩这个坑；`head -4` 是为了连表头一起留一行。判据：本站仿真里排第一的是 `/usr/bin/java -jar /opt/myapp/app.jar`（68.4% CPU），而 `mysqld` 只有 2.1% 却占 **22.8% 内存** —— 数据一眼说明当前瓶颈是应用 CPU，不是数据库。',
      contrast: '高 CPU 本身不是结论，要分清**业务在干活**（吞吐同步上涨，属于扩容场景）还是**空转**（吞吐没涨、CPU 打满，多半是 GC 或死循环）。Java 应用下一步是按线程看谁最忙再反查栈；而如果高的是 IO 等待而不是用户态，那根本不是 CPU 问题，要回到磁盘那条线去查。',
      run: 'ps aux --sort=-%cpu | head -4',
      cmdIds: ['mo-ps', 'mo-top', 'mo-pidstat', 'mo-pgrep'],
      lesson: 'mon-find-the-noisy-process',
      tags: ['进程', 'CPU', '排序']
    },

    {
      id: 'card-mon-count-error-first',
      cat: 'monitor',
      kind: 'diagnose',
      level: 2,
      front: '一天的日志几十万行，你要**先量化**"到底报了多少次错"，再决定要不要细看。',
      hint: '有个选项让它只回一个数字，而不是把匹配到的行全部刷出来。',
      answer: 'grep -c ERROR /data/app/logs/app.log',
      why: '`-c` 只输出匹配行数、不刷屏，是给故障定级的第一步。判据：本站仿真 `/data/app/logs/app.log` 里 ERROR 正好 3 行，全是 `query timeout after 5000ms` —— 量级不大，但**每一行都对应一次用户请求失败**，数量少不等于不重要。拿到行号（`grep -n`）之后用 `sed -n \'2,4p\' /data/app/logs/app.log` 把上下文一起看，就能看到 `caused by: java.sql.SQLTimeoutException` 这个根异常。',
      contrast: '如果 ERROR 计数是 0 但业务确实在报错，先确认**日志级别**（生产常配成只打 WARN 以上）和**日志写去了哪里**：本站应用配置里日志写到文件，而同一批报错在容器 `web` 的 `docker logs web` 里也有一份 —— 容器场景 stdout 与文件可能不是同一个地方，两边都要看。另外日志有切割，历史文件里的错误不在这个计数里。',
      run: 'grep -c ERROR /data/app/logs/app.log',
      cmdIds: ['mo-log-tail', 'mo-log-var-log', 'lt-grep'],
      lesson: 'lt-log-status-distribution',
      tags: ['日志', '定级', 'grep']
    },

    {
      id: 'card-mon-journalctl-since',
      cat: 'monitor',
      kind: 'syntax',
      level: 2,
      front: '只想看最近 10 分钟的日志：\n\n  journalctl -u myapp ____ -n 50\n\n横线处填什么？',
      hint: '它接受的是人能读懂的时间写法，不是时间戳。',
      answer: '--since "10 min ago"',
      why: '`--since`/`--until` 接受 `"10 min ago"`、`"2024-03-18 09:40:00"`、`"yesterday"` 这类人类可读时间（由 systemd 自己解析）。判据：不加时间范围时 `-n 50` 只是"最后 50 行"，如果这 50 行恰好全是启动日志，就会得出"最近没有报错"的错误结论 —— 时间范围与行数限制两个条件都写才可靠。',
      contrast: '`--since` 是按**本机时区**解释的：服务器跑 UTC、你人在东八区就会差 8 小时，跨时区排障直接写绝对时间并带上时区偏移。另外 `-n` 与 `--since` 是"与"的关系（该时间之后的最多 N 行），而 `-f` 会持续跟踪、不会自己退出，两者别混用。',
      run: 'journalctl -u myapp --since "10 min ago" -n 50',
      cmdIds: ['mo-log-journalctl', 'mo-log-tail'],
      tags: ['日志', 'journald', '时间范围']
    },

    {
      id: 'card-mon-promql-rate-window',
      cat: 'monitor',
      kind: 'syntax',
      level: 3,
      front: '算 5 分钟的平均每秒请求数：\n\n  rate(http_requests_total____)\n\n横线处填什么？',
      hint: '这个函数只接受"一段时间里的多个样本"，所以指标后面必须跟方括号。',
      answer: '[5m]',
      why: '`rate()` 只接受**范围向量**，所以指标后面必须带 `[窗口]`。窗口至少要覆盖两个采样点（抓取间隔 15 秒时 `[1m]` 是下限），实践上取 `[5m]` 让曲线更平滑。判据：窗口太小时查询会出现断点或剧烈锯齿；返回空结果也多半是窗口太短，或者指标名与标签写错了。',
      contrast: '`[5m]` 是**滑动窗口**，不是"每 5 分钟算一次" —— 要按固定周期聚合成新指标，得用记录规则。另外 `rate` 只能吃**计数器**类型（只增不减的那类指标），对"当前可用内存字节数"这种瞬时值指标用 `rate` 得到的是毫无意义的数字，应该直接用原值或取时间平均。',
      cmdIds: ['mo-promql', 'mo-promtool-query', 'mo-node-exporter'],
      tags: ['PromQL', 'rate', '指标类型']
    }

  );
})();
