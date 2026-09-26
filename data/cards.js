/* ==========================================================================
   data/cards.js · 每日一练卡片的**样板与契约**
   --------------------------------------------------------------------------
   ⚠️ 这个文件同时是卡片的数据契约文档。扩写卡片前请先读它，并照抄质量线。

   为什么不做"命令名 → 中文"的单词卡：
   单词是「符号 ↔ 含义」的映射，记住就等于学会；命令不是。
   「du → 查看目录占用」刷三遍就永远不会忘，但它**不会让你在磁盘满的时候
   想起 du -sh ***。真正要练的是**判断**：什么现象该用哪条命令、为什么不是
   另一条、参数差在哪。所以本文件里的卡片**没有一张**是"名字→释义"。

   三种卡型（kind）：
     diagnose    症状 → 命令    正面是现象，背面是"该敲什么 + 判据 + 反向排除"
     distinguish 辨析         正面是一组容易搞混的用法/参数，背面说清分界
     syntax      参数填空     正面留空，背面给答案 + 为什么是这个参数

   字段：
     id        必填 全局唯一，card- 前缀，kebab-case
     cat       必填 分类 id（决定它算进哪个分类的掌握度）
     kind      必填 diagnose | distinguish | syntax
     level     必填 1~4，与命令条目的 level 对齐
     front     必填 卡片正面。症状卡用**用户的话**说现象，不要出现命令名
     hint      可选 模糊时给的**方向性**提示，绝不能直接给命令
     answer    必填 背面的第一行：要敲的命令（syntax 卡就是那个被挖掉的参数）
     why       必填 判据 —— 为什么是它。**这一句决定卡片有没有价值**
     contrast  可选 反向排除：如果输出不是这样，该往哪想
     run       可选 能被模拟引擎真跑的命令。**有就一定填**（见下）
     cmdIds    可选 关联的命令条目 id（站内真实存在）
     lesson    可选 关联的练习课 id（不带 cc- 前缀）
     tags      可选 2~4 个标签

   ★ run 字段是这个项目相对 Anki / 百词斩 的唯一优势：
     背单词 app 只能在背面给你"释义"，这里能让你**把命令送进模拟终端跑一遍**
     看到真实输出。凡是引擎实现过的命令，run 一定要填。
     引擎目前 265 个命令覆盖站内条目（CMDS 表共 338 个命令名），清单见 docs/内容规范.md §5.3。

   质量红线（写卡前默念一遍）：
     1. 背面**不许抄 summary**。summary 是"这命令干嘛的"，卡片背面要回答
        "为什么现在该用这条、而不是旁边那条"。
     2. front 里**尽量不出现答案里的命令名**，否则就成了认字。
     3. why 里要有**可验证的判据**（某个字段的值、某个报错的特征），
        不要写"这样更方便"这种没有信息量的话。
     4. contrast 才是卡片最值钱的部分 —— 它练的是"分诊"能力。
     5. run 必须是引擎真能跑通的命令（写完用 tools/card-check.js 验）。
   ========================================================================== */
(function () {
  'use strict';

  window.CC_CARDS = window.CC_CARDS || [];

  /* ==================== 磁盘与存储 ==================== */
  window.CC_CARDS.push(

    {
      id: 'card-disk-full-no-bigfile',
      cat: 'linux-storage',
      kind: 'diagnose',
      level: 3,
      front: '同事说 /data 满了，可你把目录翻了一遍，`du` 加起来远远不到分区大小。',
      hint: '同一个文件，为什么两个命令会给出两个答案？',
      answer: 'lsof +L1',
      why: '有进程还占着**已经被删除**的文件句柄 —— 文件在目录里看不见（`du` 算不到），但空间没还给文件系统（`df` 照算）。`lsof +L1` 列出所有链接数为 0、却仍被打开的文件及其进程。判据就是 **`df` 满而 `du` 小**。',
      contrast: '如果 `du` 也能找到对应大小的大文件，那就是真有大文件，直接 `du -sh /data/* | sort -rh | head` 定位，不用查句柄。',
      run: 'lsof +L1',
      cmdIds: ['ln-lsof', 'ls9-df'],
      lesson: 'du-culprit',
      tags: ['磁盘', '句柄泄漏']
    },

    {
      id: 'card-df-i-vs-df-h',
      cat: 'linux-storage',
      kind: 'distinguish',
      level: 2,
      front: '`df -h` 显示还有 20G 可用，但新建文件报 `no space left on device`。',
      hint: '空间和"能放多少个文件"是两件事。',
      answer: 'df -i',
      why: '`df -h` 看的是**块空间**，`df -i` 看的是 **inode 数量**。小文件极多时 inode 会先耗尽 —— 此时块还剩一大截，但一个新文件都建不出来。判据：`df -i` 的 `IUse%` 到 100% 而 `df -h` 还很空。',
      contrast: '如果 `df -i` 也正常，再依次查：挂载点是不是被重挂成只读（`mount | grep 挂载点`）、有没有 quota 超限、有没有被 `lsof +L1` 那种句柄泄漏占着。',
      run: 'df -i',
      cmdIds: ['ls9-df', 'ls9-du'],
      lesson: 'df-inode',
      tags: ['磁盘', 'inode']
    },

    {
      id: 'card-du-sort-blank',
      cat: 'linux-storage',
      kind: 'syntax',
      level: 2,
      front: '把 /data 下各目录的占用从大到小排，取前 10：\n\n  du -sh /data/* | ____ -rh | head\n\n横线处该填什么？',
      hint: '`du -sh` 吐出来的是"大小 + 路径"两列。',
      answer: 'sort',
      why: '`du -sh` 输出的是「大小 路径」，要按大小排序就得先 `sort`。关键是 `-h`：它认得 `K/M/G` 这类人类可读单位；不加 `-h` 会按**字符串**排，于是 `10M` 会排在 `2G` 后面。`-r` 是倒序（大的在前）。',
      contrast: '`sort -n` 只认纯数字，遇到 `1.2G` 会当成 `1` —— 所以带单位的大小**必须**用 `-h` 而不是 `-n`。',
      run: 'du -sh /data/* | sort -rh | head',
      cmdIds: ['ls9-du', 'lt-sort-column'],
      lesson: 'du-culprit',
      tags: ['磁盘', '管道', 'sort']
    },

    {
      id: 'card-find-big-file',
      cat: 'linux-storage',
      kind: 'diagnose',
      level: 2,
      front: '分区快满了，你想先找出**单个**超过 100M 的文件，而不是一层层看目录。',
      hint: '按"大小"这个属性去找，而不是先列出来再筛。',
      answer: 'find /data -type f -size +100M',
      why: '`find` 能按属性直接过滤，`-type f` 排除目录、`-size +100M` 是大于 100M（`+` 是大于、`-` 是小于）。注意 `-size` 默认单位是 **512 字节的块**，所以写 `+100M` 时必须带单位字母，只写 `+100` 是"大于 100 个块"（约 50KB），完全不是你的意思。',
      contrast: '要看"哪个目录吃空间"用 `du`；要找"哪个文件特别大"用 `find`。两者解决的问题不同 —— 日志目录里往往是一个滚了几十 G 的 `app.log`，`du` 只能告诉你目录大，`find` 才能点到那个文件。',
      run: 'find /data -type f -size +100M',
      cmdIds: ['lb-find'],
      tags: ['磁盘', 'find']
    },

    /* ==================== 网络与排障 ==================== */
    {
      id: 'card-port-unreachable-nc',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 2,
      front: '应用连不上 `10.0.1.31` 的 8080，你要**先确认端口本身通不通**，再决定往哪查。',
      hint: '只测连接，不建立会话 —— 有个选项专门干这个。',
      answer: 'nc -vz 10.0.1.31 8080',
      why: '`-z` 是"只扫描不发送数据"，`-v` 是显示过程。通了会打印 `Connection to 10.0.1.31 8080 port [tcp/*] succeeded!`。它比 `telnet` 好在**不进入交互**，适合脚本和快速判断。',
      contrast: '三种结果指向三个方向：`Connection refused` = 包到了机器但没人监听（查服务是否启动、`ss -lntp`）；`Connection timed out` = 包根本没回来（查安全组、防火墙、路由）；`Name or service not known` = DNS 没解析出来。**先分清是哪一种，再往下查**。',
      run: 'nc -vz 10.0.1.31 8080',
      cmdIds: ['ln-nc', 'ln-troubleshoot-connect-refused'],
      tags: ['网络', '端口', 'nc']
    },

    {
      id: 'card-dns-dig-vs-nslookup',
      cat: 'linux-net',
      kind: 'distinguish',
      level: 2,
      front: '要判断"解析慢"到底慢在哪一段，`nslookup` 已经不够用了。',
      hint: '需要看到查询耗时和服务器的应答细节。',
      answer: 'dig www.example.com',
      why: '`dig` 会打印 `Query time`、`SERVER`（实际问的是哪台 DNS）、`status`（NOERROR / NXDOMAIN / SERVFAIL）和完整的 ANSWER 段；`nslookup` 只给结果。判据：`Query time` 几百毫秒以上说明 DNS 本身慢；`status: SERVFAIL` 是上游解析失败，不是"域名不存在"（那是 NXDOMAIN）。',
      contrast: '`nslookup` 适合"能不能解析"这种是/否问题；要**诊断**就用 `dig`，或者 `dig +trace` 从根域一路跟下去看断在哪一级。',
      run: 'dig www.example.com',
      cmdIds: ['ln-dig', 'ln-nslookup', 'ln-troubleshoot-dns'],
      lesson: 'net-dns-resolution-wrong',
      tags: ['网络', 'DNS']
    },

    {
      id: 'card-ss-vs-netstat',
      cat: 'linux-net',
      kind: 'distinguish',
      level: 1,
      front: '想看哪些端口在监听、分别是哪个进程占的 —— 该用 `netstat -tulnp` 还是别的？',
      hint: '其中一条已经被官方标记为过时了。',
      answer: 'ss -tulnp',
      why: '`ss` 是 `netstat` 的替代品（net-tools 已停止维护），在连接数多的时候快一个数量级。`-t` TCP、`-u` UDP、`-l` 只看监听、`-n` 不做反解（避免卡在 DNS 上）、`-p` 带进程。',
      contrast: '**`-n` 很容易忘**：不加它，`ss` 会尝试把每个地址反解成域名，连接一多就卡住，看着像"命令没反应"，其实是在等 DNS。排障时永远带上 `-n`。',
      run: 'ss -tulnp',
      cmdIds: ['ln-ss', 'ln-netstat'],
      lesson: 'ss-listen',
      tags: ['网络', '端口']
    },

    /* ==================== 系统与进程 ==================== */
    {
      id: 'card-load-vs-cpu',
      cat: 'monitor',
      kind: 'distinguish',
      level: 2,
      front: '监控报警说负载（load average）到了 8，但 CPU 使用率只有 12%。',
      hint: 'load 统计的进程里，有一类根本不占 CPU。',
      answer: 'vmstat 1 3',
      why: 'load average 统计的是「可运行 **+ 不可中断睡眠（D 状态）**」的进程数 —— 等磁盘 IO 的进程也算进去。所以 load 高而 CPU 闲，第一嫌疑是 **IO 瓶颈**。判据看 `vmstat` 的 `b` 列（不可中断睡眠进程数）和 `wa` 列（IO 等待占比）：`b > 0` 且 `wa` 明显，就是 IO。',
      contrast: '如果 `b` 和 `wa` 都接近 0，那 load 高更可能是**内存不足导致换页**（看 `si`/`so` 是否非 0）或 NFS/NAS 挂载点无响应（进程卡在 D 状态但本地磁盘不忙）。另外别忘了 load 要**除以核数**才有意义：`nproc` 是 2 的话，8 就是 4 倍超载。',
      run: 'vmstat 1 3',
      cmdIds: ['mo-vmstat', 'mo-uptime', 'mo-iostat'],
      lesson: 'mon-io-bottleneck',
      tags: ['性能', '负载', 'IO']
    },

    {
      id: 'card-free-vs-available',
      cat: 'monitor',
      kind: 'distinguish',
      level: 2,
      front: '`free -h` 里 `free` 只剩 400Mi，眼看要 OOM 了 —— 但这个判断错在哪？',
      hint: '有一列内存是"可以随时要回来"的。',
      answer: 'free -h',
      why: 'Linux 会把空闲内存拿去做页缓存（`buff/cache`），这部分**随时可以回收**给应用用。所以判断内存够不够要看 **`available`** 这一列，不是 `free`。盯着 `free` 看只会天天误报。',
      contrast: '真正危险的是另外两个信号：**swap 开始被大量使用**（`si`/`so` 非 0），以及 `available` 掉到总内存的几个百分点。`free` 低但 `available` 健康，属于正常的高效利用。',
      run: 'free -h',
      cmdIds: ['mo-free'],
      lesson: 'mon-free-vs-available',
      tags: ['内存', '监控']
    },

    {
      id: 'card-journalctl-unit',
      cat: 'linux-user',
      kind: 'diagnose',
      level: 1,
      front: '一个 systemd 服务起不来，你要看**这个服务自己的**日志，而不是整机的。',
      hint: '知道服务名之后，按 unit 过滤。',
      answer: 'journalctl -u nginx -n 50',
      why: '`-u` 按 unit 过滤，`-n` 限制行数。不加 `-u` 会把整机日志倒出来，几十万行里找目标服务几乎不可能。排查服务启动失败时通常再加 `--since "10 min ago"` 把范围压到本次启动。',
      contrast: '`journalctl -xe` 是很多人习惯的写法，但它是"最近日志 + 解释"，**不按服务过滤**；出问题时你以为在看 nginx，其实混进了别的服务。要精确定位就老老实实 `-u`。',
      run: 'journalctl -u nginx -n 20',
      cmdIds: ['lu-journalctl'],
      lesson: 'systemctl-status',
      tags: ['systemd', '日志']
    },

    /* ==================== 容器与编排 ==================== */
    {
      id: 'card-kubectl-logs-previous',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 2,
      front: '一个 Pod 在 `CrashLoopBackOff` 反复重启，`logs` 只能看到"启动中"那几行。',
      hint: '你要看的日志，在**上一个已经死掉的容器实例**里。',
      answer: 'kubectl logs <Pod名> --previous -n <命名空间>',
      why: '`--previous`（简写 `-p`）读的是**上一个已终止实例**的日志。CrashLoopBackOff 的当前容器刚起来就又挂了，自己还没来得及输出任何东西 —— 崩溃现场只存在于上一个实例。',
      contrast: '如果 `--previous` 也没有有用信息，说明容器根本没进到业务代码（镜像 entrypoint 就失败了），这时要看 `kubectl describe pod` 末尾的 Events，以及 `kubectl get pod -o yaml` 里的 `lastState.terminated.reason`。',
      run: 'kubectl logs worker-6b8f7c9d4-m2vqt --previous -n my-app',
      cmdIds: ['k8s-logs', 'k8s-troubleshoot-crashloop'],
      lesson: 'k8s-logs-prev',
      tags: ['K8s', '排错']
    },

    {
      id: 'card-k8s-endpoints-none',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '访问一个 Service 完全不通，`get svc` 看着一切正常，端口也对。',
      hint: 'Service 只是个转发规则，真正决定"有没有后端"的是另一个对象。',
      answer: 'kubectl get endpoints -n <命名空间>',
      why: 'Service 靠 **selector 匹配 Pod** 来生成 endpoints。如果 endpoints 是 `<none>`，说明一个 Ready 的 Pod 都没匹配上 —— Service 配置再对也没用。判据就是 endpoints 那一列为 `<none>`。',
      contrast: 'endpoints 有值却还是不通，问题就不在这一层了：查 NetworkPolicy 是否拦了、Pod 的 readiness 探针是否把流量摘掉了、以及 `targetPort` 是否写成了容器里**真实监听**的端口。',
      run: 'kubectl get endpoints -n my-app',
      cmdIds: ['k8s-endpointslices', 'k8s-service'],
      lesson: 'k8s-endpoints',
      tags: ['K8s', 'Service']
    },

    {
      id: 'card-docker-exec-vs-attach',
      cat: 'docker',
      kind: 'distinguish',
      level: 2,
      front: '要在**正在运行**的容器里执行一条命令、看它的文件系统，`docker exec` 和 `docker attach` 该用哪个？',
      hint: '其中一个会把你的终端接到容器的标准输入上。',
      answer: 'docker exec -it <容器> bash',
      why: '`exec` 是**在容器里新起一个进程**（通常是 shell），所以你能自由敲命令、退出也不影响容器。`-it` 是"分配伪终端 + 保持 stdin 打开"，少了 `-t` 就没有提示符，少了 `-i` 敲进去没反应。',
      contrast: '`docker attach` 是**接管容器的主进程**，也就是 PID 1 的 stdin/stdout。危险点：你按 `Ctrl+C` 会把主进程一起杀掉，容器就退了。而且 `exit` 不等于退出 shell —— 它可能直接停掉服务。所以交互排查一律用 `exec`。',
      run: 'docker exec -it web bash',
      cmdIds: ['dk-exec', 'dk-compose-exec'],
      lesson: 'dk-inspect-net',
      tags: ['Docker', '排错']
    },

    /* ==================== 中间件与数据库 ==================== */
    {
      id: 'card-nginx-502-vs-504',
      cat: 'middleware',
      kind: 'distinguish',
      level: 3,
      front: 'Nginx 返回 **502** 和 **504**，处置方向完全不同 —— 怎么一眼分清？',
      hint: '一个字是"连不上"，另一个字是"连上了但等太久"。',
      answer: 'tail -f /var/log/nginx/error.log',
      why: '**502 Bad Gateway** = Nginx **连不上**后端（error.log 里是 `connect() failed` 或 `no live upstreams`）。**504 Gateway Time-out** = 连接建立了，但 `proxy_read_timeout`（默认 60s）内后端一直没吐数据（`upstream timed out`）。所以要做的第一件事是**看 error.log 里是哪一种**，而不是直接去调超时。',
      contrast: '还有一种容易被误判的 **499**：那是 Nginx 自定义码，表示**客户端先断开**了（用户刷新、APP 端超时短于后端处理时间）。它不代表后端故障，但大量 499 通常说明后端确实变慢。把 502/504/499 混为一谈，就会去修错的地方。',
      run: 'nginx -t',
      cmdIds: ['mw-nginx-502-504-499', 'mw-nginx-log'],
      lesson: 'mw-nginx-504-upstream-timeout',
      tags: ['Nginx', '排错', '502']
    },

    {
      id: 'card-mysql-keys-vs-scan',
      cat: 'db-cache',
      kind: 'distinguish',
      level: 2,
      front: '要在 Redis 里找出 `session:*` 这批 key —— 为什么不能直接用 `KEYS`？',
      hint: '想一想 Redis 是几个线程在跑命令。',
      answer: 'redis-cli --scan --pattern "session:*"',
      why: 'Redis 是**单线程**处理命令的，`KEYS` 会一次性遍历整个 keyspace 并且**阻塞其他所有请求** —— 大实例上这一条命令就能把线上服务卡住，所以生产环境禁用。`--scan` 底层是 `SCAN` 游标，每次只返回一小批，不阻塞。',
      contrast: '`SCAN` 的代价是**不保证完整**：遍历期间新增/删除的 key 可能漏掉或重复。要精确统计数量用 `DBSIZE`（它只返回总数，也不遍历）；要做严谨的全量遍历就得自己循环游标直到返回 0。',
      run: 'redis-cli --scan --pattern "session:*"',
      cmdIds: ['db-redis-scan', 'db-redis-ops'],
      lesson: 'db-redis-keys-vs-scan',
      tags: ['Redis', '性能', '红线']
    },

    {
      id: 'card-mysql-repl-lag',
      cat: 'db-cache',
      kind: 'diagnose',
      level: 3,
      front: '从库数据比主库慢了好几分钟，你要先判断是**复制断了**还是**只是回放慢**。',
      hint: '看两个线程各自的状态，而不是只看延迟秒数。',
      answer: 'mysql -e "SHOW REPLICA STATUS\\G"',
      why: '关键看两行：`Replica_IO_Running` 和 `Replica_SQL_Running`。两个都 `Yes` 但 `Seconds_Behind_Source` 大 = **回放跟不上**（从库磁盘慢或有大事务）。有一个是 `No` = **复制断了**，具体原因看 `Last_IO_Error` / `Last_SQL_Error`。用 `\\G` 竖排输出，否则这一百多个字段横着排根本没法读。',
      contrast: '`Seconds_Behind_Source` 本身会骗人：IO 线程断了的时候它可能显示 0 或 NULL（因为压根没在算）。所以**永远先看两个线程状态，再看延迟数字**，顺序反了就会得出"延迟正常"的错误结论。',
      run: 'mysql -uroot -p -e "SHOW REPLICA STATUS\\G"',
      cmdIds: ['db-mysql-replication-lag', 'db-mysql-show-replica-status'],
      lesson: 'db-mysql-replica-broken',
      tags: ['MySQL', '主从', '排错']
    },

    /* ==================== 云平台 ==================== */
    {
      id: 'card-hw-sg-3306',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 3,
      front: '应用连不上云上数据库：机器在跑、`ss` 看到 3306 也在监听，但从应用侧连就是超时。',
      hint: '问题可能不在机器上，而在机器**外面**那一层。',
      answer: 'hcloud VPC ListSecurityGroups --cli-region=cn-north-4',
      why: '**安全组是白名单：没写进去的端口一律拒绝**。这跟 iptables 不一样，安全组没有"默认全通"这回事。判据：规则列表里只有 80/22/8080 而没有 3306，那这就是根因。云上"端口不通"的固定排查顺序是**安全组 → 网络 ACL → 系统防火墙 → 服务是否监听**，少了任何一层都会白折腾。',
      contrast: '如果 `nc` 的结果是 `Connection refused` 而不是 `timed out`，方向就完全不同了：拒绝说明**包已经到了机器**、只是没人监听（服务没起或监听在 127.0.0.1），这时候查安全组是白费功夫。',
      run: 'hcloud VPC ListSecurityGroups',
      cmdIds: ['hw-vpc-sg-list', 'hw-vpc-troubleshoot-port'],
      lesson: 'hw-sg-3306',
      tags: ['华为云', '安全组', '网络']
    },

    {
      id: 'card-hcloud-region-mismatch',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 2,
      front: '同事让你查一台机器，你敲完 `hcloud ECS ListServersDetails` 却返回**空列表**，也不报错。',
      hint: '没报错不代表命令对了。',
      answer: 'hcloud configure list',
      why: 'KooCLI 的每个请求都要带 region，**配置里写错 region 时不会报错，只会返回空列表** —— 这是最容易踩的坑，因为"查不到"看起来像"没权限"或"机器没了"。先 `hcloud configure list` 确认当前 profile 指向哪个区域。',
      contrast: '另外还有一个高频原因是 **`project_id` 与 `region` 不匹配**：两者必须属于同一区域。量产脚本里一律显式写 `--cli-region=`，不要依赖默认值 —— 默认值会随 `hcloud configure set` 被别人改掉。',
      run: 'hcloud configure list',
      cmdIds: ['hw-hcloud-config-list', 'hw-ecs-list'],
      lesson: 'hw-cli-profile',
      tags: ['华为云', 'KooCLI']
    },

    /* ==================== Shell 与自动化 ==================== */
    {
      id: 'card-shell-quote-single-double',
      cat: 'shell',
      kind: 'distinguish',
      level: 2,
      front: "`awk '{print $1}'` 用单引号，而 `echo \"总共 $((1+1)) 个\"` 用双引号 —— 它们什么时候不能互换？",
      hint: '只看一件事：**谁负责展开变量**。',
      answer: '单引号 = 原样，双引号 = 允许展开',
      why: "单引号里**一切原样传递**，`$1` 就是两个字符；双引号里 `$变量`、`$(命令)`、反引号都会被 shell 先展开。`awk '{print $1}'` 必须用单引号，否则 `$1` 会被 shell 换成脚本的第一个参数，awk 收到的是个空串或别的东西 —— **命令不报错，结果悄悄错**。",
      contrast: '反过来，`echo "现在时间 $(date)"` 要的就是展开，用单引号会原样打印 `$(date)`。要"大部分展开、局部原样"，就在双引号里给那个 `$` 加反斜杠：`echo "\\$HOME 是字面量"`。',
      run: 'echo "共 $(nproc) 核"',
      cmdIds: ['sh-quotes', 'sh-var-export'],
      lesson: 'sh-timestamp-filename',
      tags: ['Shell', '引号']
    },

    {
      id: 'card-crontab-not-running',
      cat: 'shell',
      kind: 'diagnose',
      level: 3,
      front: '写了条定时任务，手动执行完全正常，但到点就是没跑。',
      hint: 'cron 的环境和你登录时的环境不是同一个。',
      answer: 'crontab -l',
      why: 'cron 用的是**极简环境**：`PATH` 通常只有 `/usr/bin:/bin`，没有你 `.bashrc` 里的别名和变量。所以第一嫌疑是**命令用了绝对路径之外的东西找不到**（自己写的脚本、`/usr/local/bin` 下的程序）。先 `crontab -l` 确认任务真的写进去了、时间字段没写错（五个字段：分 时 日 月 周）。',
      contrast: '如果任务确实跑了但脚本失败，去看日志：`journalctl -u crond`（或 `/var/log/cron`），以及脚本自己重定向出来的输出。**cron 不会把脚本的错误发给你** —— 邮件没配就直接丢掉，所以脚本里要显式 `>> /var/log/xxx.log 2>&1`。',
      run: 'crontab -l',
      cmdIds: ['lu-crontab'],
      tags: ['Shell', 'cron']
    }

  );
})();
