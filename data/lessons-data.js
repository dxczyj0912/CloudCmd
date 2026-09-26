/* data/lessons-data.js · 数据与可观测（数据库缓存 / 中间件 / 监控）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。这里只放课程数据。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

      {
        id: 'mon-load-vs-cores',
        cat: 'monitor',
        title: '负载 0.42 到底算不算高',
        prompt: '告警群里贴了一张图：这台机器 load average 0.42。有人说"快 1 了，要炸"，你说得先看核数才能判断。',
        task: '确认这台机器有几个 CPU 核，才能判断负载是否偏高',
        steps: [
          { title: '看负载', about: '1/5/15 分钟三个值', cmd: 'uptime', hint: ['负载有三个数：1 分钟、5 分钟、15 分钟各一个。要判断“现在到底忙不忙”该看哪一个 —— 最短的那个还是最长的那个？', '____'], ref: 'mo-uptime', note: 'load average: 0.42, 0.68, 0.71 —— 三个值都在 1 以下' },
          { title: '看核数', about: '判断负载的分母', cmd: 'nproc', hint: ['负载本身没有绝对高低，它得除以一个分母才有意义。先把这台机器能同时干活的核数拿出来。', '____'], ref: 'mo-nproc', note: '2 核 —— 分母是 2，不是 1' },
          { title: '看清 CPU 在忙什么', about: 'us/sy/id/wa 各占多少', cmd: 'top', hint: ['CPU 忙不忙要看空闲那一列还剩多少；如果空闲不少、IO 等待那一列却在涨，说明活没压在 CPU 上。', '____'], ref: 'mo-top', note: 'id 61.4 说明 CPU 还有余量；wa 1.2 有轻微 IO 等待' }
        ],
        answer: 'nproc',
        alt: ['nproc --all', 'lscpu', 'grep -c processor /proc/cpuinfo'],
        expect: /2|CPU/,
        teach: '**load average 必须除以核数才有意义**：2 核上 0.42 相当于 21% 的负载，非常健康；8 核上跑到 8 才是满载。而且 load 统计的是"可运行 + 不可中断睡眠"的进程数，**它高不一定是 CPU 忙** —— 大量进程卡在磁盘 IO 上同样会把 load 顶起来，这时要看 `wa`。'
      },

      {
        id: 'mon-io-bottleneck',
        cat: 'monitor',
        title: 'CPU 不忙，但机器很卡',
        prompt: '业务反馈"系统很慢"，可 CPU 使用率只有 34%。你怀疑瓶颈在磁盘。',
        task: '找出到底是哪块磁盘成了瓶颈',
        steps: [
          { title: '先看内存够不够', about: '排除内存导致的换页', cmd: 'free -h', hint: ['先排除内存：如果交换分区被大量使用、内存反复换进换出，磁盘自然会被拖慢。确认 swap 几乎没动。', '____ -h'], ref: 'mo-free', note: 'swap 用了 0B —— 不是内存不够导致的换页' },
          { title: '看有没有进程卡在 IO', about: '重点看 b 列与 wa 列', cmd: 'vmstat 1 3', hint: ['这个视图里有两列直接对应磁盘阻塞：一列是被阻塞而不可中断的进程数，另一列是 CPU 花在等 IO 上的比例。', '____ 1 3'], ref: 'mo-vmstat', note: 'b=2（2 个进程不可中断睡眠）、wa=1 —— 有 IO 等待' },
          { title: '定位到具体磁盘', about: '看哪块盘的 %util 满了', cmd: 'iostat -x 1 2', hint: ['看每块设备的利用率与平均等待时间：利用率接近 100% 的那块就是瓶颈，等待时间越长说明响应越慢。', '____ -x 1 2'], ref: 'mo-iostat', note: 'vdb 的 %util 99.41%、w_await 42ms —— 就是它' }
        ],
        answer: 'iostat -x 1 2',
        alt: ['iostat -x', 'iostat -x 1', 'iostat -xz 1 2'],
        expect: /%util|vdb/,
        teach: '**"卡"要先分清是 CPU 卡、内存卡还是 IO 卡**。判断链条是：`uptime` 看 load → `vmstat` 看 `b`（不可中断睡眠进程数）和 `wa`（IO 等待占比）→ `iostat -x` 看哪块盘 `%util` 接近 100%。`%util` 99% 的 vdb 就是 `/data` 那块盘，接下来才轮到查是哪个进程在写。'
      },

      {
        id: 'mon-free-vs-available',
        cat: 'monitor',
        title: '内存到底还剩多少',
        prompt: 'free 显示只剩 412Mi，眼看要 OOM 了；但同事说这台机器一直这么显示，跑得好好的。谁对？',
        task: '看清这台机器的真实可用内存',
        steps: [
          { title: '看内存总览', about: '先看清总览里各列分别代表什么', cmd: 'free -h', hint: ['这个视图有好几列：一列是完全没人用的内存，还有一列是算上可回收缓存后应用真正还能拿到的量。先看清全景。', '____ -h'], ref: 'mo-free', note: 'free 只剩 412Mi，看着很吓人' },
          { title: '看真正该看的列', about: 'available 才是可用内存', cmd: 'free -h', hint: ['页缓存是可回收的，所以判断够不够不能盯着那一列数字最小的地方看 —— 该看的是把缓存算进去之后还能用的那列。', '____ -h'], ref: 'mo-free', note: 'available 还有 1.1Gi；3.2Gi 在 buff/cache 里，是**可回收**的' },
          { title: '找出吃内存的进程', about: '谁占得最多', cmd: 'top', hint: ['光知道还剩多少没用，得落到进程上：哪一列是按进程实际占用的物理内存排序，谁排最前面谁就是大头。', '____'], ref: 'mo-top', note: 'mysqld RES 1.8g（22.8%）是大头，但它本来就该占这么多' }
        ],
        answer: 'free -h',
        alt: ['free', 'free -h -w'],
        expect: /available|Mem:/,
        teach: '**判断内存够不够要看 `available`，不是 `free`**。Linux 会把空闲内存拿去做页缓存（buff/cache），这部分随时可以回收给应用用；盯着 `free` 看只会天天误报。真正危险的两个信号是：**swap 开始被大量使用**、以及 `available` 掉到总内存的几个百分点。'
      },

      {
        id: 'db-mysql-slow-query',
        cat: 'db-cache',
        title: '找出正在拖慢 MySQL 的那条慢查询',
        prompt: '应用一直报 `query timeout after 5000ms`，Nginx 的 error.log 里全是 upstream timed out。机器不忙、磁盘不满，你怀疑是数据库里有条 SQL 卡住了。',
        task: '连上库，从当前连接列表里找出跑得最久、状态是 Sending data 的那条查询',
        steps: [
          { title: '先把库清单看清楚', about: 'SHOW DATABASES 从元数据开始', cmd: 'mysql -uroot -p -e "SHOW DATABASES"', hint: ['连上实例后别急着查业务表。先看看实例里到底有哪些库、名字怎么写、业务连的是哪一个 —— 别名写错后面全白干。', 'mysql -uroot -p -e "SHOW ____"'], ref: 'db-mysql-client', note: '`orders` 就是应用 config.yaml 里连的业务库' },
          { title: '看当前连接都在干什么', about: 'SHOW PROCESSLIST 是排障第一站', cmd: 'mysql -uroot -p -e "SHOW PROCESSLIST"', hint: ['排障第一站是当前所有连接在干什么：每行都带已运行秒数、当前状态、以及它正在执行的语句。注意默认只给前 100 个字符。', 'mysql -uroot -p -e "SHOW ____"'], ref: 'db-mysql-client', note: 'Info 列只给了 100 个字符 —— 真机就是这个行为，SQL 被截断了' },
          { title: '看完整 SQL', about: 'FULL 关键字给出完整语句', cmd: 'mysql -uroot -p orders -e "SHOW FULL PROCESSLIST"', hint: ['上一步的语句被截断了，看不到完整的 WHERE 与 JOIN。同一组关键词前加一个修饰词就能拿到完整语句 —— 顺便注意要连业务库。', 'mysql -uroot -p ____ -e "SHOW FULL PROCESSLIST"'], ref: 'db-mysql-client', note: '盯住 Time=312、State=Sending data 那条：它 join 了 order_status_log' },
          { title: '确认它扫的是哪张表', about: 'information_schema.tables 看行数', cmd: "mysql -uroot -p orders -e \"SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = 'orders' ORDER BY table_rows DESC\"", hint: ['怀疑某条语句在扫大表，就去元数据里按行数从大到小排一遍同名库下的表 —— 行数最大的那张基本就是元凶。', 'mysql -uroot -p orders -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = \'____\' ORDER BY table_rows DESC"'], ref: 'db-mysql-client', note: 'order_status_log 5200 万行，join 它基本等于全表扫描' }
        ],
        answer: 'mysql -uroot -p orders -e "SHOW FULL PROCESSLIST"',
        alt: [
          'mysql -uroot -p orders -e "SHOW PROCESSLIST"',
          "mysql -uroot -p orders -B -N -e \"SELECT id,user,time,state,info FROM information_schema.processlist WHERE command != 'Sleep' ORDER BY time DESC\""
        ],
        expect: /Sending data/,
        teach: '**`SHOW PROCESSLIST` 是 MySQL 排障的"top"**。三个关键列：`Time`（这条语句已经跑了多少秒）、`State`（正在做什么，`Sending data` 通常意味着在扫数据、`Waiting for table metadata lock` 意味着被别的 DDL 挡住了）、`Info`（SQL 本身，但只有 `SHOW FULL PROCESSLIST` 才给完整语句，普通模式截断到 100 字符）。找到慢 SQL 之后的顺序是：`EXPLAIN` 看执行计划 → 看有没有走索引 → 决定加索引或改写 SQL。注意上面 `Id=7` 那条 `alter table ... add index` 正卡在 metadata lock 上：**大表加索引要在业务低峰做，或者用 gh-ost / pt-online-schema-change**，否则它会把所有查询一起拖住。'
      },

      {
        id: 'db-mysql-replica-broken',
        cat: 'db-cache',
        title: '主从复制断了：从 SHOW REPLICA STATUS 看起',
        prompt: '你接手一台只读从库。业务反馈"报表数据不更新了"，但库还在、连接也正常。你要在几分钟内判断复制是断了还是只是慢。',
        task: '用复制状态视图判断 IO/SQL 两个线程是否正常，并定位到最后一次错误',
        steps: [
          { title: '看复制状态', about: 'SHOW REPLICA STATUS（老写法 SHOW SLAVE STATUS 等价）', cmd: 'mysql -uroot -p -e "SHOW REPLICA STATUS"', hint: ['复制状态是竖排的几十个字段，先别逐行读。找那个能一次交代“两个线程在不在跑、延迟多少、最后一条错是什么”的语句。', 'mysql -uroot -p -e "SHOW ____"'], ref: 'db-mysql-client', note: '竖排输出字段很多，先只找关键几行' },
          { title: '只看两个线程与延迟', about: 'IO 线程管拉日志，SQL 线程管回放', cmd: 'mysql -uroot -p -e "SHOW REPLICA STATUS" | grep -E "Running|Seconds_Behind_Master"', hint: ['输出太长就要过滤：拉日志的线程和回放的线程名字里都含同一个词，延迟字段的分母又是秒。把这几行挑出来看。', 'mysql -uroot -p -e "SHOW REPLICA STATUS" | grep ____'], ref: 'lt-grep', note: 'IO=Yes 说明能拉到 binlog；SQL=No 说明回放已经停了' },
          { title: '看最后一次错误', about: 'Last_SQL_Error 会指出是哪条语句', cmd: 'mysql -uroot -p -e "SHOW REPLICA STATUS" | grep Last_SQL_Error', hint: ['两个线程里回放那个停了。真正的原因藏在“最后一条回放失败”的字段里，字段名本身就带 Last 和 Error 字样。', 'mysql -uroot -p -e "SHOW REPLICA STATUS" | ____'], ref: 'lt-grep', note: '1062 主键冲突 —— 从库上已经有这条数据了' },
          { title: '对照主库位点', about: 'SHOW MASTER STATUS 看 binlog 文件与位点', cmd: 'mysql -uroot -p -e "SHOW MASTER STATUS"', hint: ['知道从库断在哪个错误之后，还要拿主库当前写到哪个日志文件、哪个位置来对照 —— 这是判断积压多少的基准。', 'mysql -uroot -p -e "SHOW ____"'], ref: 'db-mysql-client', note: 'Exec_Master_Log_Pos 落后 Read_Master_Log_Pos 就是在积压' }
        ],
        answer: 'mysql -uroot -p -e "SHOW REPLICA STATUS" | grep -E "Slave_SQL_Running|Seconds_Behind_Master"',
        alt: [
          'mysql -uroot -p -e "SHOW SLAVE STATUS" | grep Seconds_Behind_Master',
          'mysql -uroot -p -e "SHOW REPLICA STATUS" | grep -E "Running|Seconds_Behind_Master"'
        ],
        expect: /Seconds_Behind_Master: NULL/,
        teach: '**`Seconds_Behind_Master: NULL` 不等于 0，它表示"复制已经断了、延迟算不出来"** —— 这是最容易被误读的一个字段：0 是"跟得上"，NULL 是"根本没在跑"。判断顺序固定为：`Replica_IO_Running`（能不能拉到 binlog）→ `Replica_SQL_Running`（能不能回放）→ `Last_IO_Errno`/`Last_SQL_Errno` + `Last_SQL_Error`（断在哪）。上面是典型的 **1062 主键冲突**（主库插入了从库已存在的行，常见于有人在从库上写了数据）。处理原则：先在从库上核对并修掉冲突数据，再 `START REPLICA`；**不要一上来就 `SET GLOBAL SQL_SLAVE_SKIP_COUNTER=1` 跳过事务** —— 那是在制造主从数据不一致。MySQL 8.0.22 起官方推荐用 `SHOW REPLICA STATUS` / `START REPLICA` 这套新词，老写法仍可用。'
      },

      {
        id: 'db-mysql-params',
        cat: 'db-cache',
        title: '上线前给数据库做一次参数体检',
        prompt: '新库马上要接生产流量。你不想等出事再查，要先把几个决定性参数确认一遍：连接数够不够、慢查询有没有记录、缓冲池给了多大。',
        task: '用 SHOW VARIABLES LIKE 一次查清慢查询与缓冲池相关参数',
        steps: [
          { title: '确认最大连接数', about: 'max_connections 决定能扛多少并发连接', cmd: "mysql -uroot -p -e \"SHOW VARIABLES LIKE 'max_connections'\"", hint: ['上线体检第一项：这个实例最多允许多少个并发连接。它一旦被打满，应用侧报的就是 Too many connections。', 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'____\'"'], ref: 'db-mysql-client', note: '1000 是默认值；应用连接池总和不能超过它，否则会出现 Too many connections' },
          { title: '确认慢查询日志开着', about: '慢查询日志是事后复盘的唯一证据', cmd: "mysql -uroot -p -e \"SHOW VARIABLES LIKE 'slow_query%'\"", hint: ['没开慢日志就永远没有事后证据。要一次确认这类参数的开与关状态、以及超过多少秒才记 —— 用百分号通配能一次带出几个。', 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'____\'"'], ref: 'db-mysql-client', note: 'slow_query_log=ON 才有得查；long_query_time=5 秒太松了' },
          { title: '确认缓冲池大小', about: 'innodb_buffer_pool_size 是 MySQL 最重要的参数', cmd: "mysql -uroot -p -e \"SHOW VARIABLES LIKE 'innodb_buffer_pool%'\"", hint: ['最影响读性能的一个参数：缓冲池能开多大。热数据装不装得进内存全看它，同样用通配一次看全相关项。', 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'____\'"'], ref: 'db-mysql-client', note: '2G：热数据能不能装进内存，直接决定慢不慢' },
          { title: '顺手记下版本与实例名', about: '排查问题时报版本号是基本礼貌', cmd: 'mysql -uroot -p -e "SELECT VERSION(), @@hostname"', hint: ['排查问题时报版本号是基本礼貌：不同大版本的参数名和默认值都不一样。顺手把实例主机名也记下来。', 'mysql -uroot -p -e "SELECT ____"'], ref: 'db-mysql-client', note: '8.0.36 —— 参数名与 5.7 有差异，别抄错文档' }
        ],
        answer: "mysql -uroot -p -e \"SHOW VARIABLES LIKE 'slow_query%'\"",
        alt: [
          "mysql -uroot -p -e \"SHOW VARIABLES LIKE 'slow_query_log'\"",
          "mysql -uroot -p -B -N -e \"SHOW VARIABLES LIKE 'slow_query%'\"",
          'mysql -uroot -p -e "SELECT @@slow_query_log, @@long_query_time"'
        ],
        expect: /slow_query_log/,
        teach: '**`SHOW VARIABLES LIKE` 是"读参数"，`SET GLOBAL` 是"改参数"，两者都要谨慎**。上线前至少要确认这四组：`max_connections`（连接池总和留 20% 余量）、`slow_query_log` + `long_query_time`（线上建议 0.5~1 秒起，5 秒会漏掉大量"慢性病"）、`innodb_buffer_pool_size`（专用库建议给到内存的 50%~70%）、`transaction_isolation`（互联网业务常用 READ-COMMITTED，而不是默认的 REPEATABLE-READ）。注意两点：**8.0 的参数名与 5.7 不完全一样**（如 `query_cache_size` 已被移除），网上抄来的 my.cnf 常常直接让实例起不来；`SET GLOBAL` 只对之后的新连接生效，且**重启就丢**，要持久化得改配置文件。'
      },

      {
        id: 'db-redis-bigkeys',
        cat: 'db-cache',
        title: '用 --bigkeys 揪出 Redis 里的大 key',
        prompt: '缓存实例的内存一周涨了 1G，还没到 OOM，但你知道再不管就要出事了。你要先找出到底是哪些 key 在吃内存。',
        task: '扫描整个 keyspace 找出每类最大的 key，再确认那个大 key 到底占多少字节',
        steps: [
          { title: '先看内存水位', about: 'used_memory 与 maxmemory', cmd: 'redis-cli info memory', hint: ['先看两个数字：现在到底用掉多少内存、以及有没有设置上限。上限为 0 意味着数据能一直涨到把机器撑爆 —— 这比大 key 更危险。', 'redis-cli info ____'], ref: 'db-redis-cli', note: 'maxmemory:0 表示不限制 —— 这是比大 key 更危险的事' },
          { title: '按类型扫出大 key', about: '--bigkeys 逐个类型找最大的', cmd: 'redis-cli --bigkeys', hint: ['要在一整个 keyspace 里找“最大的 key”，按数据类型逐个扫比漫无目的地翻高效得多。这个长选项就是干这个的。', 'redis-cli ____'], ref: 'db-redis-cli', note: 'summary 段给出每类最大的 key 与平均大小' },
          { title: '量出精确占用', about: 'memory usage 给出单个 key 的字节数', cmd: 'redis-cli memory usage big:cache:report:2024Q1', hint: ['summary 只告诉你谁最大，不告诉你它占多少字节。要精确量单个 key 得用 memory 下面的子命令再加 key 名。', 'redis-cli memory ____ big:cache:report:2024Q1'], ref: 'db-redis-cli', note: '1048655 字节 ≈ 1MB，一个 key 顶一千个普通 key' },
          { title: '看看 keyspace 有多少 key', about: 'dbsize 数当前库', cmd: 'redis-cli dbsize', hint: ['再看一眼当前库总共有多少个 key。只有十来个 key 却吃掉 1G 内存，说明问题就集中在那一个超大对象上。', 'redis-cli ____'], ref: 'db-redis-cli', note: '13 个 key 里有一个 1MB 的 —— 这就是内存涨的原因' }
        ],
        answer: 'redis-cli --bigkeys',
        alt: [
          'redis-cli --bigkeys -i 0.1',
          'redis-cli info memory && redis-cli --bigkeys'
        ],
        expect: /big:cache:report:2024Q1/,
        teach: '**大 key 的三宗罪**：① 单线程模型下，读写一个 1MB 的 string 会让其他命令排队等待；② 一次 `GET` 就是 1MB 流量，千兆网卡上几十个并发就能打满；③ 主从复制与持久化都会被它拖慢。找大 key 的三种手段：`redis-cli --bigkeys`（按类型扫，**要在从节点或低峰期跑**）、`redis-cli --scan --pattern "x*"` + 逐个 `memory usage`、以及 `redis-cli --hotkeys`（找热点而非大 key）。处理手段：拆分成多个 key（分片）、改用 hash 存结构化数据、设置 `maxmemory` + `maxmemory-policy allkeys-lru` 兜底。**不要用 `KEYS *` 去找大 key** —— 它自己就是一次事故。'
      },

      {
        id: 'db-redis-keys-vs-scan',
        cat: 'db-cache',
        title: '查 key 别用 KEYS：换成 SCAN 渐进遍历',
        prompt: '你要清点所有会话 key。同事说"`redis-cli keys \'session:*\'` 一行就完了"，但这台 Redis 是生产实例，单线程的它经不起一次全量遍历。',
        task: '先用 KEYS 看清风险提示，再用生产可用的 SCAN 方式拿到同样的结果',
        steps: [
          { title: '先看 KEYS 的代价', about: '能出结果，但会遍历整个 keyspace', cmd: 'redis-cli keys session:*', hint: ['这个写法能立刻给结果，代价却是一次全量遍历：单线程实例会被整段占住。先看清这条命令的形态与它自带的风险提示。', 'redis-cli ____ session:*'], ref: 'db-redis-cli', note: '输出下面那行提示就是这条命令的红线：生产禁用' },
          { title: '换成 --scan', about: '改成游标式分批遍历，不要一次锁住主线程', cmd: 'redis-cli --scan --pattern session:*', hint: ['要拿到同样一批 key 又不长时间占住主线程，就改用游标式遍历：每批只扫一部分。匹配模式要单独用一个选项传进去。', 'redis-cli ____ --pattern session:*'], ref: 'db-redis-cli', note: '同样的结果，但每次只取一批，不长时间占住主线程' },
          { title: '看 SCAN 的原生形式', about: '返回"下一个游标 + 一批 key"', cmd: 'redis-cli scan 0 match session:* count 100', hint: ['把上一步的封装写法还原成原生形态：它要一个起始游标、一个匹配模式、一个每批大小的提示值。返回值里第一个数就是下一个游标。', 'redis-cli scan ____ match session:* count 100'], ref: 'db-redis-cli', note: '返回的游标为 0 表示遍历结束；它不保证不重复，也不保证完整' },
          { title: '确认 keyspace 规模', about: 'dbsize 数一数', cmd: 'redis-cli dbsize', hint: ['最后量一下 keyspace 规模。十几个 key 时那条全量命令根本看不出问题，上百万 key 时它就是一次故障。', 'redis-cli ____'], ref: 'db-redis-cli', note: '13 个 key 时 KEYS 看不出问题；百万级时它就是事故' }
        ],
        answer: 'redis-cli --scan --pattern session:*',
        alt: [
          'redis-cli --scan --pattern "session:*"',
          'redis-cli --scan'
        ],
        expect: /session:9f2c1ab7d4e8/,
        teach: '**`KEYS` 是 O(N) 且会阻塞 Redis 的单线程**：N 是全部 key 的数量，不是匹配上的数量 —— 一个百万 key 的实例上执行 `KEYS session:*`，其它所有请求都会卡住，监控上表现为"响应时间毛刺 + 超时"。生产上正确的姿势是 `SCAN` 游标（`--scan` 是它的命令行封装）：每次只返回一小批（`COUNT` 只是提示，不是精确值），服务不会被卡住。要记住 SCAN 的三个特性：**可能返回重复 key**（调用方要去重）、**遍历期间新增/删除的 key 不保证出现**、**游标为 0 才表示结束**。另外 `--bigkeys`、`--hotkeys` 内部也是 SCAN，但同样建议在从节点或业务低峰跑。'
      },

      {
        id: 'mw-nginx-test-reload',
        cat: 'middleware',
        title: '改完 Nginx 配置：先 nginx -t，再 reload',
        prompt: '群里刚出事：有人直接 `nginx -s reload` 把站点 reload 挂了。现在轮到你调整 upstream，你要按纪律来 —— 先测配置，再平滑重载。',
        task: '确认版本与配置语法、看清真正生效的配置，最后平滑重载',
        steps: [
          { title: '先看是哪版 nginx', about: '-v 只给版本，-V 给编译参数', cmd: 'nginx -v', hint: ['动手改配置之前先认清手头这个二进制：小写选项只报版本、大写选项连编译进哪些模块一起报。哪些指令能用取决于这个。', 'nginx ____'], ref: 'mw-nginx-version', note: '版本与模块决定了哪些指令能用（比如 stream 模块）' },
          { title: '测配置', about: '只做语法校验，先不碰运行中的进程', cmd: 'nginx -t', hint: ['配置写错了不该等到 reload 才发现。有一个动作只做解析校验、完全不碰运行中的进程，随时可以跑。', 'nginx ____'], ref: 'mw-nginx-test', note: 'syntax is ok + test is successful 两条都出现才算过' },
          { title: '看清真正生效的配置', about: '-T 把 include 的文件一起导出', cmd: 'nginx -T | head -25', hint: ['你以为改的那个文件未必是真正生效的那个：主配置里 include 进来的 vhost 最容易漏。要有一个选项把合并后的全量配置打出来。', 'nginx ____ | head -25'], ref: 'mw-nginx-dump', note: 'upstream app_backend 指向 10.0.1.31/32:8080，和 error.log 里的上游对得上' },
          { title: '平滑重载', about: '-s reload 不中断已有连接', cmd: 'nginx -s reload', hint: ['平滑生效靠给 master 进程发信号：老 worker 把手上的连接处理完才退，新 worker 用新配置顶上。成功时它一句话都不说。', 'nginx ____ reload'], ref: 'mw-nginx-signal', note: '真机上成功时**没有任何输出** —— 没有输出就是成功' }
        ],
        answer: 'nginx -t && nginx -s reload',
        alt: [
          'nginx -T | head -3 && nginx -t && nginx -s reload',
          'nginx -T | head -2 && nginx -t && nginx -s reload'
        ],
        expect: /test is successful/,
        teach: '**`nginx -t` 是改配置的唯一安全阀**：它只解析配置、不碰运行中的进程，所以可以在任何时间随便跑。而 `reload` 会先校验配置，校验不过时**新 worker 起不来、老进程继续用旧配置跑**，错误只写进 `/var/log/nginx/error.log` —— 这也是"明明 reload 了却没生效"的最常见原因。`reload` 与 `restart` 的区别：reload 是 master 不变、平滑替换 worker，已有连接处理完才退出（**线上变更首选**）；restart 会断开所有连接。要确认"我以为改了"和"实际生效"是否一致，用 `nginx -T`（大写的 T）把主配置与 `include` 进来的所有文件一起打出来 —— `conf.d/*.conf` 里的 vhost 最容易漏。'
      },

      {
        id: 'mw-nginx-bad-conf',
        cat: 'middleware',
        title: '配置写坏了：用 nginx -t 定位到行',
        prompt: '有人手滑把 `/etc/nginx/nginx.conf` 改坏了，站点还没重启所以暂时没挂。你要在下次 reload 之前把问题找出来，并且知道错在第几行。',
        task: '制造两种典型配置错误，用 nginx -t 定位到行号，再从备份还原',
        steps: [
          { title: '先建立基线', about: '改之前先测一遍', cmd: 'nginx -t', hint: ['要定位错误得先有一个“干净时该长什么样”的基线：先把健康的校验结果记下来，报错时才分得清哪行是异常。', 'nginx ____'], ref: 'mw-nginx-test', note: '没坏的时候长这样：记住这两行输出' },
          { title: '改之前先备份', about: '动手之前，先留一份原样的备份', cmd: 'cp /etc/nginx/nginx.conf /tmp/nginx.conf.bak', hint: ['动线上配置前手里必须有退路：把当前文件原样复制一份到临时目录。文件名自己起、路径随便挑。', '____ /etc/nginx/nginx.conf /tmp/nginx.conf.bak'], ref: 'lb-cp', note: '手上有备份，才敢动线上配置' },
          { title: '制造一个语法错误', about: '删掉右大括号', cmd: "sed -i 's/^}$//' /etc/nginx/nginx.conf", hint: ['制造一个低级但最常见的错误：让大括号不配对。做法是把配置文件里单独成行的右大括号删掉。', '____'], ref: 'lt-sed-i', note: '大括号不配对是最常见的低级错误' },
          { title: '看报错并定位行号', about: '2>&1 把 stderr 并进来，tail 取最后几行', cmd: 'nginx -t 2>&1 | tail -2', hint: ['解析器的报错走的是标准错误，直接看会漏掉；把它并进标准输出再只取末尾几行，文件名与行号就在里面。末尾取几行是个数字。', 'nginx -t 2>&1 | tail ____'], ref: 'mw-nginx-test', note: 'emerg 后面就是文件名与行号' },
          { title: '还原并复验', about: '从备份恢复再测一次', cmd: 'cp /tmp/nginx.conf.bak /etc/nginx/nginx.conf && nginx -t', hint: ['文件内容从备份还原只完成了还原的一半：还得再验一次配置，确认它真的能过，才算这件事收尾。', '____'], ref: 'mw-nginx-test', note: '恢复后必须再测一遍才算完' },
          { title: '再来一种：改了 upstream 名字', about: 'proxy_pass 找不到目标', cmd: "sed -i 's/app_backend {/app_backend_v2 {/' /etc/nginx/nginx.conf && nginx -t 2>&1 | tail -2", hint: ['第二种高频错误是改了名字却漏改引用：upstream 换了名，代理转发还指着旧名，报 host not found。改完必须立刻验一次。', '____'], ref: 'mw-nginx-test', note: 'host not found in upstream —— 这种错误 reload 前必须发现' },
          { title: '再还原一次', about: '养成"改完必测"的肌肉记忆', cmd: 'cp /tmp/nginx.conf.bak /etc/nginx/nginx.conf && nginx -t', hint: ['最后把文件还原并再验一遍。养成“改完必测”的肌肉记忆，比记住任何一个报错都值钱 —— 这一步的形状和前面还原那次一样。', '____'], ref: 'mw-nginx-test', note: '配置管理工具（Ansible/Git）能避免手工改坏' }
        ],
        answer: "sed -i 's/^}$//' /etc/nginx/nginx.conf && nginx -t 2>&1 | tail -2",
        alt: [
          "sed -i 's/^}$//' /etc/nginx/nginx.conf && nginx -t 2>&1 | tail -3"
        ],
        expect: /\[emerg\] unexpected end of file, expecting "}"/,
        teach: '`nginx -t` 的三种高频报错，认准它们能省下大量时间：**`unexpected end of file, expecting "}"`**（大括号不配对，包括注释掉了半行的情况）、**`directive "xxx" is not terminated by ";"`**（少写分号，注意行号指向的是**指令所在行**而不是文件末尾）、**`host not found in upstream "xxx"`**（`proxy_pass` 指向了不存在的 upstream，或改了 upstream 名字忘了改引用）。报错的行号来自 nginx 的配置解析器，它会告诉你"读到哪个 token 时发现不对"，所以行号可能比真正的错误位置**晚一行**。改配置的标准流程：**备份 → 改 → `nginx -t` → `reload` → 看 `error.log`**。注意 `nginx -t` 会把错误写到 stderr，脚本里判断要用退出码而不是抓 stdout。'
      },

      /* ══════════════════════════════════════════════════════════════════
         下面几节补 monitor 的空白：42 条记录原先只有 3 节课。
         选题都是"线上说不清、必须靠数据回答"的那几类。
         ══════════════════════════════════════════════════════════════════ */

      {
        id: 'mon-look-back-yesterday',
        cat: 'monitor',
        title: '用户说"昨晚九点特别慢"，可现在是好的',
        prompt: '业务反馈昨晚九点前后接口很慢，但你此刻登机器看 `top`、`free` 一切正常。**偶发问题的证据只在历史数据里** —— 你要回答的是"那个时间点发生了什么"，而不是"现在怎么样"。',
        task: '先看当前的 CPU 与内存基线，再回看昨天那个时段的历史采样',
        steps: [
          { title: '看当前 CPU 基线', about: '先建立"正常长什么样"', cmd: 'sar -u 1 5', ref: 'mo-sar', hint: ['要判断"昨晚异常"，得先知道"平时正常是多少"：连续采几次看 CPU 各项占比，建立基线', 'sar -____ 1 5'], note: '%idle 很高 —— 说明现在确实没问题，基线有了' },
          { title: '看内存基线', about: '内存与 CPU 往往不同步异常', cmd: 'sar -r 1 5', ref: 'mo-sar', hint: ['CPU 正常不代表没出事：内存是另一条独立曲线，换个维度再采一次基线', 'sar -____ 1 5'], note: 'kbmemfree 与 %memused 两列是重点 —— **看趋势而不是绝对值**' },
          { title: '回看昨天那个时段', about: '从历史采样文件里取指定时间窗', cmd: 'sar -u -s 09:00:00 -e 10:00:00 -f /var/log/sa/sa18', ref: 'mo-sar', hint: ['关键一步：从**历史采样文件**里取指定时间窗 —— 要指定起点、终点和那个文件', 'sar -u ____ 09:00:00 -e 10:00:00 -f /var/log/sa/sa18'], note: '这才是"昨晚九点"的真实数据 —— 有历史才能回答偶发问题' },
          { title: '看网络这一层', about: 'CPU 内存都正常时往网络看', cmd: 'sar -n DEV 1 5', ref: 'mo-sar', hint: ['CPU 与内存都正常，怀疑就转到网络上：按设备维度看收发速率与丢包', 'sar -n ____ 1 5'], note: 'rxkB/s 与 txkB/s 是速率、rxdrop/s 是丢包 —— 丢包比带宽更能解释"慢"' }
        ],
        answer: 'sar -u -s 09:00:00 -e 10:00:00 -f /var/log/sa/sa18',
        alt: [
          'sar -u -s 09:00:00 -e 10:00:00 -f /var/log/sa/sa18',
          'sar -n DEV 1 5'
        ],
        expect: /%idle|IFACE|rxkB/,
        teach: '**偶发问题要用时间序列回答，不能用当前快照回答。** 登机器敲 `top` 看到的是"此刻"，而用户抱怨的是"昨晚九点" —— 这时候唯一的证据是**监控留存的历史数据**。Linux 上这套数据由 `sysstat` 提供：`sar` 读的是 `/var/log/sa/sa<日>`（二进制采样文件，默认每 10 分钟一次、保留约一个月），所以 `sar -u -s 09:00:00 -e 10:00:00 -f /var/log/sa/sa18` 能精确回放那一天那个小时。三个实务要点：**先在正常时段采一份基线**（否则看到 60% 也不知道算高还是低）；**看曲线不看单点**（平均值 60% 但每秒冲到 100%，体感就是卡 —— 所以要同时看 `%iowait`、`%steal` 这些细分项）；**确认采样本身在跑**（`systemctl status sysstat`，很多机器装完没启用，出事时才发现"没有历史"）。要看更长时间、跨机器的趋势，就得靠 Prometheus 这类时序数据库（本分类有对应条目）——**`sar` 是单机的短期历史，监控系统是长期与全局历史**，两者互补。最后：`sar` 的字段中 `%steal` 特别值得记住 —— **它是"虚拟机被宿主机抢走的 CPU"**，云上"CPU 不高但就是慢"经常出在这一项上。'
      },

      {
        id: 'mon-find-the-noisy-process',
        cat: 'monitor',
        title: '系统很卡，但不知道是哪个进程',
        prompt: '`uptime` 的 load average 到了 12，可 `top` 里没有一个进程的 CPU 特别高。这种时候光看瞬时 CPU 是找不到元凶的 —— 要找的是**持续消耗**，而且 CPU、磁盘 IO、内存要分开看。',
        task: '按 CPU、磁盘 IO、线程三个维度分别定位消耗最高的进程',
        steps: [
          { title: '按 CPU 维度采一轮', about: '每个进程的持续 CPU 占用', cmd: 'pidstat -u 1 5', ref: 'mo-pidstat', hint: ['瞬时快照会漏掉间歇性消耗：要按"每秒采一次、采若干次"的方式统计每个进程的平均占用', 'pidstat -____ 1 5'], note: '%CPU 是这一轮采样的平均值 —— 比 top 的瞬时值可靠' },
          { title: '按磁盘 IO 维度采一轮', about: 'load 高也可能是 IO 等待', cmd: 'pidstat -d 1 5', ref: 'mo-pidstat', hint: ['load 高不等于 CPU 忙：换一个维度看每个进程的磁盘读写速率', 'pidstat -____ 1 5'], note: 'kB_rd/s 与 kB_wr/s 两列 —— **IO 等待的进程在 top 里 CPU 反而不高**' },
          { title: '看线程级细分', about: '定位到进程里的哪个线程', cmd: 'pidstat -t -p 18442 1 5', ref: 'mo-pidstat', hint: ['锁定了进程还不够：加一个选项把统计粒度下到**线程**，看是哪一个线程在忙', 'pidstat -____ -p 18442 1 5'], note: 'TID 就是线程号 —— 排查 Java 高 CPU 时，下一步是把它转成十六进制去 jstack 里找' },
          { title: '只看某个进程的上下文切换', about: '上下文切换过多也会拖慢系统', cmd: 'pidstat -w -C java 1 5', ref: 'mo-pidstat', hint: ['还有一种"看不见的消耗"：进程频繁让出/抢回 CPU。按命令名筛出那类进程，看它的自愿与非自愿切换次数', 'pidstat -w -C ____ 1 5'], note: 'cswch/s 与 nvcswch/s —— **非自愿切换高说明 CPU 争抢严重**，是"锁竞争/线程过多"的信号' }
        ],
        answer: 'pidstat -u 1 5',
        alt: [
          'pidstat -u 1 5',
          'pidstat -d 1 5'
        ],
        expect: /UID|PID|%CPU|kB_rd/,
        teach: '**`pidstat` 相对 `top` 的关键区别是"按时间维度采平均"。** `top` 给的是瞬时值，一个每秒醒来一次、每次跑 200ms 的进程，在 `top` 里可能一闪而过，但它实际吃掉了 20% 的 CPU —— **间歇性消耗只能用采样统计抓**。四个维度要分开看，因为它们对应完全不同的根因：**`-u` CPU**（算得太多）；**`-d` 磁盘 IO**（`load` 高但 CPU 不高多半是它，进程卡在 IO 等待上，`top` 显示 %CPU 很低）；**`-r` 内存**（内存泄漏或频繁缺页）；**`-w` 上下文切换**（锁竞争、线程数过多、`cswch/s` 异常高）。两个进阶要点：**`-t` 下到线程级**——Java 应用里"进程 CPU 高"必须定位到具体线程，做法是 `pidstat -t -p <PID>` 找到 TID、把它转成十六进制（`printf "%x\n" <TID>`），再去 `jstack` 输出里搜 `nid=0x...`；**`-C <命令名>` 按名字筛**，比记 PID 方便。最后一条判读经验：**`load average` 包含 IO 等待**（Linux 的 load 是"运行中 + 不可中断睡眠"的进程数），所以 load 高而 CPU 低是**完全正常**的组合，此时该查磁盘而不是 CPU。'
      },

      {
        id: 'mon-strace-stuck-process',
        cat: 'monitor',
        title: '进程"没反应"，但它也不报错',
        prompt: '应用进程还在、端口也在监听，但请求进来就挂住不返回，日志里一个字都没有。这种"卡住但不崩"的状态，**唯一的证据是它此刻停在哪个系统调用上**。',
        task: '查看进程当前停在什么状态，并统计它把时间花在哪些系统调用上',
        steps: [
          { title: '先看它停在哪个内核函数', about: '零成本的第一步', cmd: 'cat /proc/18442/wchan', ref: 'mo-strace', hint: ['最轻量的第一步：内核为每个进程记着"它正在等什么"，这个值在一个 proc 文件里，直接读出来', 'cat /proc/18442/____'], note: '如果是 futex / epoll_wait 之类，说明在等锁或等事件 —— 方向立刻清楚' },
          { title: '统计系统调用的时间分布', about: '不打印每一条，只给汇总', cmd: 'timeout 5 strace -c -p 18442', ref: 'mo-strace', hint: ['不想看几万行调用细节，只要一张"哪个调用最费时间"的汇总表：用统计模式挂上去采几秒', 'timeout 5 strace -____ -p 18442'], note: '% time 那一列就是"时间花在哪" —— 比读代码猜快得多' },
          { title: '只盯网络相关的调用', about: '缩小到某一类调用', cmd: 'timeout 10 strace -f -e trace=network -p 18442', ref: 'mo-strace', hint: ['怀疑卡在网络时就不用看全部调用：用过滤器只留某一类，再加上跟踪子进程', 'timeout 10 strace -f -e trace=____ -p 18442'], note: '只看 socket/connect/recvfrom —— "连不上又不报错"多半卡在 connect 或 recv' }
        ],
        answer: 'cat /proc/18442/wchan',
        alt: [
          'cat /proc/18442/wchan',
          'timeout 5 strace -c -p 18442'
        ],
        expect: /ep_poll|epoll|futex|% time|syscall/,
        teach: '**"进程卡住"和"进程崩了"是两类问题，证据来源完全不同**：崩了看日志与退出码；卡住要看**它此刻停在哪** —— 而日志往往是空的，因为它根本没走到打日志那一步。排查阶梯由轻到重：**① `/proc/<PID>/wchan`**（零成本，一个词告诉你它在等什么：`futex` 等锁、`epoll_wait` 等事件、`nanosleep` 定时等待）；**② `/proc/<PID>/stack`**（内核态调用栈，需 root）；**③ `strace -c -p`**（统计各系统调用耗时占比，**开销相对小**）；**④ `strace -f -e trace=<类别> -p`**（只跟某一类，如网络/文件，避免输出爆炸）；**⑤ `perf top` / 火焰图**（用户态热点，开销更低、更适合生产）。**生产上必须知道的代价**：`strace` 会把进程**暂停**在每次系统调用上，让它**慢几倍到几十倍** —— 所以**一定要用 `timeout` 包住**（本课示例都写了），并且在业务低峰做；高 QPS 服务上优先用 `perf` 或 `bpftrace` 这类基于内核采样的工具。还有一个最容易被忽略的前提：**容器里的 PID 与宿主机不同**，`strace -p` 要进对命名空间（`kubectl debug` / `nsenter`），否则会报"no such process"。'
      },

      {
        id: 'mon-jvm-gc-pause',
        cat: 'monitor',
        title: 'Java 应用"一阵一阵"卡：先看 GC',
        prompt: 'Java 服务每隔几分钟出现一次几百毫秒的响应尖刺，CPU 与内存看着都不高。这种**周期性**的卡顿，第一嫌疑是 **GC 停顿** —— 它不需要看代码，看几个数字就能确认。',
        task: '用 GC 统计确认回收频率、各代占用与触发原因',
        steps: [
          { title: '看各代占用与回收次数', about: '每秒采样一次，看趋势', cmd: 'jstat -gcutil 18442 1000 10', ref: 'mo-jvm-jstat', hint: ['要判断"GC 是否频繁"，看的是各代使用率**随时间的变化**：按固定间隔连续采若干次', 'jstat -gcutil 18442 ____ 10'], note: 'E 是 Eden、O 是老年代；YGC/YGCT 是年轻代次数与总耗时、FGC/FGCT 是 Full GC —— **FGC 只要在涨就要警惕**' },
          { title: '看更细的分代容量', about: '容量与使用量（KB）', cmd: 'jstat -gc 18442', ref: 'mo-jvm-jstat', hint: ['百分比看不出"到底多大"，换一种输出把各代的**容量与已用量**都打出来', 'jstat -____ 18442'], note: 'S0C/S1C/EC/OC 是容量、S0U/S1U/EU/OU 是已用 —— 用来确认堆大小是否符合预期' },
          { title: '看最近一次 GC 的原因', about: '触发原因比次数更能说明问题', cmd: 'jstat -gccause 18442 2000 5', ref: 'mo-jvm-jstat', hint: ['次数本身不说明原因：要问"最近一次回收是被什么触发的" —— 有一个专门的输出项', 'jstat -____ 18442 2000 5'], note: 'LGCC 是"上次原因"、GCC 是"当前原因" —— Allocation Failure 是正常的，**Metadata/System.gc() 才是要查的**' }
        ],
        answer: 'jstat -gcutil 18442 1000 10',
        alt: [
          'jstat -gcutil 18442 1000 10',
          'jstat -gcutil 18442 1000 | head -20'
        ],
        expect: /YGC|S0|FGC/,
        teach: '**周期性尖刺 + CPU 不高 = 先怀疑 GC**，因为 GC 停顿是"世界暂停"（Stop-The-World），且与分配速率强相关。看 GC 只要记住四组数字：**`YGC`/`YGCT`**（年轻代次数与总耗时）、**`FGC`/`FGCT`**（Full GC 次数与总耗时，**这两个是重点**）、**`GCT`**（总停顿）、以及 `-gccause` 的 **`LGCC`**（最近一次触发原因）。判读标准（经验值，需按业务校准）：**FGC 长期为 0 是健康的**；**FGC 在持续增长**说明老年代在积累（内存泄漏或堆偏小）；**单次 FGC 超过 1 秒**对延迟敏感服务就是事故。触发原因里的关键词：**`Allocation Failure`** 是正常的新生代满了；**`Metadata GC Threshold`** 是元空间（类加载）满了 —— 常见于频繁热部署；**`System.gc()`** 说明**有人显式调用了它**（框架或代码里，应当去掉）。三个配套动作：**先把 GC 日志打开**（`-Xlog:gc*:file=...:time,uptime`，JDK 9+；JDK 8 是 `-XX:+PrintGCDetails`）——`jstat` 只能看当下，日志才能回溯；**堆大小要设 `-Xms` 与 `-Xmx` 相等**，避免动态扩缩带来的额外停顿；**怀疑内存泄漏时下一步是 `jmap -dump` 拿堆快照**，再用 MAT 分析支配树 —— 但注意 **`jmap -dump` 会暂停应用**，生产上优先用 `-XX:+HeapDumpOnOutOfMemoryError` 让它在 OOM 时自己落盘。'
      },

      {
        id: 'mon-process-vanished',
        cat: 'monitor',
        title: '进程"突然没了"，日志里什么都没有',
        prompt: '一个服务进程半夜消失了，**它自己没打任何日志**，应用日志停在几小时前。你怀疑是内存超了被系统杀掉的 —— 但应用的日志里不可能有这条记录，因为**杀它的不是应用，是内核**。',
        task: '从内核日志里确认是否发生过 OOM 击杀，并核对目标进程还在不在',
        steps: [
          { title: '看内核报的错误与警告', about: '这里记着应用看不到的事', cmd: 'dmesg -T --level=err,warn | tail -50', ref: 'mo-dmesg', hint: ['应用日志之外还有一层：**内核自己会记日志**（进程被杀、硬件报错、文件系统异常都在那里）。按级别筛出错误与警告，并带上人类可读的时间戳', 'dmesg -____ --level=err,warn | tail -50'], note: '`-T` 把内核的相对时间戳换算成可读时间 —— **不带它你没法与应用的故障时间对齐**' },
          { title: '实时盯内核错误', about: '复现时跟着看', cmd: 'dmesg -Tw --level=err', ref: 'mo-dmesg', hint: ['如果是"偶发消失"、想抓现行：加上持续跟随的选项，只留错误级别', 'dmesg -Tw --level=____'], note: '`-w` 是持续跟随 —— 与 `tail -f` 类似，但跟的是内核环形缓冲区' },
          { title: '确认目标进程还在不在', about: '按命令行特征找', cmd: 'pgrep -af "app.jar"', ref: 'mo-pgrep', hint: ['回到进程本身：按**完整命令行**里的特征去匹配（比记住 PID 实用得多），并把匹配到的命令行一起打出来', 'pgrep ____ "app.jar"'], note: '`-a` 显示完整命令行、`-f` 匹配整条命令行 —— **不加 `-f` 只能匹配进程名（截断到 15 字符）**，这是 pgrep 最常见的误用' },
          { title: '按用户统计还在跑的进程数', about: '快速判断影响面', cmd: 'pgrep -c -u deploy', ref: 'mo-pgrep', hint: ['要快速知道"这个账号下的进程还剩几个"（判断是单个进程挂了还是整批）：按用户筛并只输出计数', 'pgrep -____ -u deploy'], note: '`-c` 只给数量 —— 脚本里用它做健康检查比解析 ps 输出可靠' }
        ],
        answer: 'dmesg -T --level=err,warn | tail -50',
        alt: [
          'dmesg -T --level=err,warn | tail -50',
          'pgrep -af "app.jar"'
        ],
        expect: /oom|killed|Out of memory|app\.jar|\d/,
        teach: '**"进程消失但没日志"几乎只有三种可能，而它们都不在应用日志里**：**① 被内核 OOM Killer 杀掉**（内存超限时内核会选一个"最该杀"的进程 —— 判据在 `dmesg` 里，关键词是 `Out of memory` / `oom-kill` / `Killed process`；**这就是为什么一定要给容器和 JVM 设内存上限** —— 不设的话，被杀的可能不是吃内存的那个，而是别的无辜进程）；**② 被 `SIGKILL` 强杀**（`kill -9`、`docker stop` 超时后的强杀、K8s 驱逐 —— 信号无法被捕获，所以进程没机会记日志）；**③ 段错误崩了**（`Segmentation fault`，内核会记在 `dmesg` 里，也可能生成 core dump）。**排查顺序是"内核日志 → 容器/服务管理器的事件 → 应用日志"** —— 大多数人只查最后那个，所以永远找不到。`dmesg` 的三个实用选项：**`-T`**（人类可读时间戳 —— **内核默认给的是"开机后多少秒"，不与墙上时间对齐就没法排查**）、**`-w`**（持续跟随，抓现行）、**`--level=err,warn`**（按级别筛，把正常启动信息滤掉）。两个注意点：**`dmesg` 是环形缓冲区**（默认几百 KB，老消息会被覆盖 —— 所以**要用 `-T > 文件` 定期留存**，或者让 rsyslog 把内核日志写进 `/var/log/messages`）；**容器里的 `dmesg` 看到的是宿主机的内核日志**（容器共享内核），这也意味着**容器里看到的 OOM 记录可能不是本容器的** —— 要结合 cgroup 的内存事件（`memory.events`）确认。'
      },

      {
        id: 'mon-logrotate-disk-full',
        cat: 'monitor',
        title: '日志把磁盘吃满了，轮转却"没生效"',
        prompt: '`/var/log` 涨到几十 G，磁盘告警了。你配过 `logrotate`，可它好像没起作用 —— **要么规则写错了，要么根本没被触发，要么轮转后老文件还在**。要判断是哪一种，不能靠猜。',
        task: '先干跑看轮转规则会做什么，再核对轮转状态记录',
        steps: [
          { title: '干跑一遍轮转规则', about: '不真的动文件，只报告', cmd: 'logrotate -d /etc/logrotate.d/myapp', ref: 'mo-log-logrotate', hint: ['`logrotate` 有一条"只输出将要做什么、不真的轮转"的调试选项 —— 改完配置先跑它', 'logrotate -____ /etc/logrotate.d/myapp'], note: '输出里会逐条说明"这个文件会不会轮转、为什么"—— **大多数"没生效"在这里就能看出原因**（如 `log does not need rotating`）' },
          { title: '强制轮转一次并看细节', about: '真跑，但只跑一次', cmd: 'logrotate -vf /etc/logrotate.d/myapp', ref: 'mo-log-logrotate', hint: ['要真的验证一次：加上"强制"与"详细输出"两个选项，跳过"时间没到就不轮转"的判断', 'logrotate -____ /etc/logrotate.d/myapp'], note: '`-f` 忽略时间条件强制轮转、`-v` 打印每一步 —— 排查配置问题时的标准组合' },
          { title: '看轮转状态记录', about: '上次轮转是什么时候', cmd: 'cat /var/lib/logrotate/logrotate.status | grep myapp', ref: 'mo-log-logrotate', hint: ['`logrotate` 靠一个状态文件记住"每个日志上次轮转的时间"：去那里核对它到底认不认你这条规则', 'cat /var/lib/logrotate/logrotate.____ | grep myapp'], note: '**如果这里没有你的日志路径，说明规则压根没被读到** —— 那问题在文件名或配置语法，不在轮转逻辑' }
        ],
        answer: 'logrotate -d /etc/logrotate.d/myapp',
        alt: [
          'logrotate -d /etc/logrotate.d/myapp',
          'cat /var/lib/logrotate/logrotate.status | grep myapp'
        ],
        expect: /rotating|log needs|log does not|myapp|considering/,
        teach: '**日志吃满磁盘是运维里最"低级"但也最高频的事故**，而 `logrotate` 的"没生效"有五种完全不同的原因，排查顺序是固定的：**① 配置没被读到**（`/etc/logrotate.d/` 下的文件名**不能有 `.`** —— 带点的会被忽略，这是最经典的坑）；**② 时间条件没满足**（`daily`/`weekly` 是按 cron 触发时间算的，不是按自然日 —— 想立刻验证就 `-f`）；**③ `size` 与时间条件冲突**（同时写 `daily` 和 `size 100M` 时，两个条件都要满足才轮转）；**④ 轮转后老文件没删**（`rotate N` 决定保留几份 —— **只轮转不删除，磁盘照样满**；要压缩得写 `compress`）；**⑤ 应用没重开日志文件**（轮转是把当前文件改名、再建一个新的，**但应用还攥着旧文件的句柄**，继续往已改名的文件里写 —— 必须配 `postrotate` 里 `kill -USR1` 或 `systemctl reload` 让应用重开）。判断"卡在哪一种"的工具就是 **`logrotate -d`（干跑）与状态文件**：干跑告诉你规则解析成了什么，状态文件告诉你"上次轮转是什么时候、它认不认这条规则"。三个实务要点：**新配的规则一定先 `-d` 再等定时任务**（别等一周后才发现没生效）；**`copytruncate` 是给"不支持重开日志"的应用准备的备选**（它先复制再清空原文件，代价是有丢日志的窗口）；**日志目录本身要能被写入**（`logrotate` 以 root 跑，但 `create` 出来的新文件属主会按配置给 —— 权限配错会导致应用写不进去）。'
      },

      {
        id: 'mon-java-thread-stuck',
        cat: 'monitor',
        title: 'Java 应用卡住了：看线程栈',
        prompt: 'Java 服务响应越来越慢，CPU 却不高。日志里没有异常，GC 也正常。**这种"没报错但不干活"的状态，答案在 Java 的线程栈里** —— 你能看到每个线程此刻正卡在哪一行代码。',
        task: '找出最占 CPU 的线程号，把它换算成十六进制，再到线程栈里定位',
        steps: [
          { title: '找出最忙的线程', about: '从进程下钻到线程', cmd: 'top -H -p 18442 -b -n 1 | head -15', ref: 'mo-jvm-jstack', hint: ['进程 CPU 不高但应用不干活，也可能是**个别线程**在忙：用只看线程的方式列出该进程下的线程（批量模式跑一次）', 'top ____ -p 18442 -b -n 1 | head -15'], note: '`-H` 按**线程**显示 —— 注意这一列给的是**十进制**线程号，下一步要换算' },
          { title: '把线程号换算成十六进制', about: 'jstack 里用的是十六进制', cmd: 'printf "%x\n" 18473', ref: 'mo-jvm-jstack', hint: ['要在线程栈里搜到这个线程，得先换进制：Java 的线程栈用**十六进制**标线程号，而 top 给的是十进制', 'printf "____\\n" 18473'], note: '这一步是**最容易漏的一步** —— 直接拿十进制去搜永远搜不到' },
          { title: '在线程栈里定位这个线程', about: '看它卡在哪一行', cmd: 'grep -A 25 "nid=0x4829" /tmp/jstack-18442.txt', ref: 'mo-jvm-jstack', hint: ['在线程栈文件里按换算后的线程号搜（格式是 `nid=0x…`），并往后带若干行看完整调用栈', 'grep -A 25 "____=0x4829" /tmp/jstack-18442.txt'], note: '能看到它当前停在哪个类的哪一行方法上 —— **这就是"卡在哪"的直接答案**' }
        ],
        answer: 'top -H -p 18442 -b -n 1 | head -15',
        alt: [
          'top -H -p 18442 -b -n 1 | head -15',
          'printf "%x\\n" 18473'
        ],
        expect: /1847|PID|%CPU|4829/,
        teach: '**Java 排障有一个"三件套"的组合拳，缺一步都定位不到**：**① `top -H -p <PID>`** 找出最占 CPU 的**线程号**（`-H` 是关键 —— 不加它看到的是整个进程）；**② `printf "%x\\n" <十进制线程号>`** 换算成**十六进制**（线程栈里用十六进制标 `nid`，**跳过这一步是新手最常犯的错**）；**③ `grep -A 25 "nid=0x<十六进制>" /tmp/jstack.txt`** 在 `jstack` 输出里搜到那个线程，看它的完整调用栈。三种"卡住"的形态要能分辨：**`RUNNABLE` 且栈顶是自己写的业务方法**（真的在算 —— 算法问题或死循环）；**`BLOCKED`**（等锁 —— 说明有别的线程攥着锁不放，搜 `waiting to lock` 找锁的持有者，或直接搜 `Found one Java-level deadlock`）；**`WAITING` / `TIMED_WAITING` 且栈里有 socket read / 数据库调用**（**等外部资源 —— 这才是"CPU 不高但很慢"最常见的原因**，问题不在 Java 而在下游）。三个实务要点：**`jstack` 要多抓几次**（间隔几秒抓 3 次，**多次都停在同一个方法上**才说明是卡住，只抓一次可能只是恰好路过）；**`jstack -l` 会额外打印锁的持有关系**（排查死锁必须加）；**生产上要能"一键抓"**（把 `jstack`/`jmap`/`top -H` 打包成一个脚本，故障时人往往没心思拼命令）。容器里还要注意：**`jstack` 要在容器内执行**（或用 `kubectl exec`），宿主机的 `jstack` 看不到容器里的 JVM 命名空间。'
      },

      {
        id: 'mon-java-heap-where',
        cat: 'monitor',
        title: 'Java 内存去哪了：看堆与被谁占',
        prompt: 'JVM 的内存一路涨到 `-Xmx` 就被 OOM 杀掉，但你不确定**是堆本身太小、还是某个对象在疯长**。`jstat` 只能告诉你"老年代满了"，要说清"被什么占满"，得看**堆里的直方图**。',
        task: '看清堆的配置与实际占用，再按类统计对象占用排名',
        steps: [
          { title: '看堆的整体配置与占用', about: '各代的容量与使用量', cmd: 'jmap -heap 18442', ref: 'mo-jvm-jmap', hint: ['先看清堆是怎么配的、现在用了多少：各代的容量、已用量、GC 算法都在这一份输出里', 'jmap ____ 18442'], note: '注意 **MaxHeapSize 与你设的 `-Xmx` 是否一致** —— 不一致说明启动参数没生效（被别的参数覆盖了）' },
          { title: '按类看对象占用排名', about: '被哪个类占满了', cmd: 'jmap -histo 18442 | head -30', ref: 'mo-jvm-jmap', hint: ['要看"哪个类的对象最多、占了多少字节"：用直方图模式，按占用排序取前若干行', 'jmap ____ 18442 | head -30'], note: '`[C` 是 char 数组、`[B` 是 byte 数组、`[I` 是 int 数组 —— **这些"看不见的类"往往才是大户**（大字符串、大缓冲）' },
          { title: '只看存活对象', about: '排除待回收的干扰', cmd: 'jmap -histo:live 18442 | head -30', ref: 'mo-jvm-jmap', hint: ['上一步会把"等着被回收的垃圾"也算进来：加上"只看存活对象"的限定（注意它会触发一次 Full GC）', 'jmap -histo:____ 18442 | head -30'], note: '**`:live` 会触发 Full GC** —— 生产上慎用，它会停顿应用；但它给的数据才是"真正的泄漏源"' },
          { title: '用 jcmd 拿一份更轻的摘要', about: '侵入性更小的替代', cmd: 'jcmd 18442 GC.heap_info', ref: 'mo-jvm-jmap', hint: ['有一组更"现代化"的诊断命令（JDK 自带、侵入性更小）：用它的 GC 子命令拿堆摘要', '____ 18442 GC.heap_info'], note: '与 `jmap -heap` 信息相近但**不触发 STW** —— 生产环境优先用它' }
        ],
        answer: 'jmap -histo 18442 | head -30',
        alt: [
          'jmap -histo 18442 | head -30',
          'jcmd 18442 GC.heap_info'
        ],
        expect: /num|instances|bytes|class|garbage-first|heap/,
        teach: '**"Java 内存高"要分三层看，混起来会修错地方**：**① 堆（Heap）** —— `-Xmx` 限制的那部分，`jmap -heap` / `jcmd GC.heap_info` 看容量与占用，`jmap -histo` 看被哪个类占满；**② 堆外（Off-Heap）** —— 直接内存（`-XX:MaxDirectMemorySize`，NIO/Netty 用）、元空间（`-XX:MaxMetaspaceSize`，类加载）、线程栈（`-Xss × 线程数`）、JIT 代码缓存；**③ 进程整体的 RSS** —— `ps` 看到的，**它通常大于堆 + 堆外之和**（还有 JVM 自身的结构、glibc 的 arena 碎片等）。所以"`-Xmx` 设了 4G，进程却吃了 8G"是**可能且正常**的 —— 要逐层排：先确认堆没超，再看元空间与直接内存（`jcmd <PID> VM.native_memory summary` 需要启动时开 `-XX:NativeMemoryTracking`），最后看线程数（线程栈也会吃内存）。**定位"被谁占满"的工具选择**：**`jmap -histo`**（快、会 STW 但很短、包含垃圾）、**`jmap -histo:live`**（准、**会触发 Full GC**、生产慎用）、**`jmap -dump` 拿堆快照 + MAT 分析支配树**（能回答"是谁持有这些对象"—— **这是唯一能定位泄漏根因的手段**，但 dump 期间应用会暂停，大堆可能几十秒）。三条纪律：**别在生产上随手 `jmap -dump`**（优先用 `-XX:+HeapDumpOnOutOfMemoryError` 让它在 OOM 时自己落盘，或先 `-histo` 缩小范围）；**dump 文件很大**（与堆同量级，**别往本来就快满的盘上写**）；**histo 的排名要连续几次对比看**（某类对象数量持续单调增长才是泄漏，单次排名第一可能只是正常的缓存）。'
      },

      {
        id: 'mon-cpu-hotspot-flame',
        cat: 'monitor',
        title: 'CPU 高，但代码看不出问题',
        prompt: '一个服务 CPU 长期 90%，代码评审看不出明显问题。**你需要让 profiler 告诉你"时间到底花在哪个函数上"** —— 而不是靠读代码猜。',
        task: '先看实时热点函数，再采样记录并查看报告',
        steps: [
          { title: '实时看热点函数', about: '不用重启就能看', cmd: 'perf top -p 18442', ref: 'mo-perf', hint: ['最直接的一步：让 profiler 实时显示"当前哪个内核/用户态函数最热"，并且只盯那个进程', 'perf ____ -p 18442'], note: '第一列是符号名、第二列是占用百分比 —— **这是采样得到的统计值，不需要改代码或重启**' },
          { title: '采样记录一段时间', about: '拿到可分析的原始数据', cmd: 'perf record -F 99 -p 18442 -g -- sleep 30', ref: 'mo-perf', hint: ['实时看只能看个大概，要做成报告得先采样：按固定频率采、记录调用关系（调用图），持续一段时间', 'perf record -F 99 -p 18442 ____ -- sleep 30'], note: '`-F 99` 是每秒 99 次采样（**避开 100 这个整数，防止与定时器同频导致采样偏差**）、`-g` 记录调用栈' },
          { title: '看采样报告', about: '自顶向下找瓶颈', cmd: 'perf report --stdio | head -40', ref: 'mo-perf', hint: ['采样完看报告：按占用排序列出函数，并展开调用关系（没有调用图的采样用处有限）', 'perf ____ --stdio | head -40'], note: '看 `Overhead` 那一列 —— **占比最高的那个函数就是优化目标**，而它下面缩进的那几行是"被谁调用"' }
        ],
        answer: 'perf top -p 18442',
        alt: [
          'perf top -p 18442',
          'perf report --stdio | head -40'
        ],
        expect: /Overhead|Samples|perf|%|Symbol/,
        teach: '**性能优化有一条铁律：先测量、再优化 —— 凭直觉优化的方向往往错**（而且会把代码改复杂）。profiler 的原理是**采样**（每隔固定时间中断一次，记录当前执行到哪个函数），所以它给出的是**统计意义上的时间分布**，开销很小（通常 1~5%），适合生产。工具有两档：**`perf top`**（实时看，找感觉）、**`perf record` + `perf report`**（采样一段、离线分析，能出调用图与火焰图 —— **这才是能定位根因的方式**）。看懂报告的要点：**`Overhead` 是时间占比**（先看最高的那几个）；**符号名里 `[k]` 是内核态、`[.]` 是用户态**（**"用户态 CPU 不高但系统 CPU 高"的答案往往在内核符号上**，如 `sys_read`、`memcpy`）；**没有符号名（显示地址）说明缺少调试符号**（安装 `-debuginfo` 包或至少保证二进制没被 strip）；**`Children` 与 `Self` 的区别**（前者含被调用者、后者只有自己 —— 找"自己就很耗"的函数看 Self）。三条实务要点：**`perf` 需要权限**（`perf_event_paranoid` 内核参数，容器里还要加 `CAP_PERFMON` 或 `--privileged`）；**采样频率别设太高**（`-F 99` 是经验值，`-F 999` 在高频服务上自身开销就不可忽视）；**容器里采样的是宿主机内核视角**（符号解析可能不全，`--buildid` 或直接在容器内采更准）。除了 `perf`，**Java 应用优先用 async-profiler 或 JFR**（它们懂 JVM 语义，能看到 Java 方法名与 safepoint，比 `perf` 直接采 JIT 代码友好得多）。'
      },

      {
        id: 'mon-promtool-validate',
        cat: 'monitor',
        title: '改完监控配置，先校验再重载',
        prompt: '你加了一条告警规则，直接 `systemctl reload prometheus`。结果 Prometheus 起不来了 —— **配置语法错了，而它选择拒绝启动而不是带着错配置跑**。这个坑可以完全避免：**改完先校验**。',
        task: '校验监控主配置与告警规则文件，再核对规则内容',
        steps: [
          { title: '校验主配置', about: '语法与引用对不对', cmd: 'promtool check config /etc/prometheus/prometheus.yml', ref: 'mo-promtool-check', hint: ['改完配置先别重载：用官方校验工具检查主配置文件的语法与内部引用', 'promtool check ____ /etc/prometheus/prometheus.yml'], note: '它会同时检查 `rule_files` 里引用的规则文件 —— **一处错就整份配置不可用**' },
          { title: '单独校验规则文件', about: '定位到具体哪条规则', cmd: 'promtool check rules /etc/prometheus/rules/*.yml', ref: 'mo-promtool-check', hint: ['主配置通过不代表规则没问题：把规则文件单独再校验一遍，它会逐条报出问题所在行', 'promtool check ____ /etc/prometheus/rules/*.yml'], note: '能精确指出"第几行、哪个表达式解析失败" —— 比看 Prometheus 的启动日志清楚得多' }
        ],
        answer: 'promtool check config /etc/prometheus/prometheus.yml',
        alt: [
          'promtool check config /etc/prometheus/prometheus.yml',
          'promtool check rules /etc/prometheus/rules/*.yml'
        ],
        expect: /SUCCESS|SUCCESS|0 error|rule/i,
        teach: '**"改配置 → 校验 → 重载"是监控系统的标准流程，跳过中间那步就是把监控自己变成故障源** —— 而且监控挂了往往比业务挂了更麻烦：**你对系统的可见性一并消失**，出问题时连"哪里不对"都看不到。各家监控都有自己的校验工具，名字不同但作用一致：**Prometheus 的 `promtool check config` / `check rules`**、**Alertmanager 的 `amtool check-config`**、**Nginx 的 `nginx -t`**、**HAProxy 的 `haproxy -c`**、**etcd 的 `etcdctl`**、**systemd 的 `systemd-analyze verify`**。校验能抓住的东西比你想的多：**语法错误**（缩进、括号）、**引用不存在**（`rule_files` 指向的文件没了）、**表达式非法**（PromQL 写错函数名或聚合语法）、**规则缺字段**（`alert` 没有 `expr`、`for` 格式不对）。除了校验，还有两条更重要的纪律：**重载要用"优雅重载"而不是重启**（Prometheus 是 `SIGHUP` 或 `/-/reload`、Nginx 是 `reload`、HAProxy 要配 `master-worker` 模式 —— **重启会丢历史内存数据并有采集空窗**）；**要有回滚路径**（配置进版本控制，出错能立刻 `git checkout` 回去；**改配置前先备份**）。最后一条经验：**监控配置本身也要有监控** —— 用一个外部探针（或另一套独立通道）定期检查"Prometheus 还活着吗、规则还是不是最新"，否则"监控挂了没人知道"是必然的。'
      },

      {
        id: 'mon-alert-silence',
        cat: 'monitor',
        title: '告警太多：用一个静默窗口',
        prompt: '数据库要停机升级两小时，**这两小时里相关的告警会疯狂刷屏**，值班的人会被淹没、甚至因此错过真正的新故障。正确做法不是"关掉告警"，而是**给这次维护开一个有时限的静默**。',
        task: '查看当前告警与告警配置，并为维护窗口添加一条定时静默',
        steps: [
          { title: '看当前有哪些告警', about: '先摸清现状', cmd: 'amtool --alertmanager.url=http://127.0.0.1:9093 alert query', ref: 'mo-amtool', hint: ['动手前先看清「现在有哪些告警在响」：指定告警管理器地址，把告警查出来', 'amtool --alertmanager.url=http://127.0.0.1:9093 alert ____'], note: '输出里有告警名、状态与标签 —— **静默时要按标签匹配，所以先看标签**' },
          { title: '只看正在触发的', about: '滤掉已解决的', cmd: 'amtool --alertmanager.url=http://127.0.0.1:9093 alert query --active', ref: 'mo-amtool', hint: ['历史告警会混进来：只筛"还在触发中"的那些', 'amtool --alertmanager.url=http://127.0.0.1:9093 alert query --____'], note: '这才是"此刻需要处理"的清单' },
          { title: '添加一条定时静默', about: '按标签匹配、带注释、有时限', cmd: 'amtool silence add --duration=2h --comment="数据库升级维护窗口" alertname=MySQLDown --alertmanager.url=http://127.0.0.1:9093', ref: 'mo-amtool', expect: /Silence added:[\s\S]*Matchers: alertname=MySQLDown[\s\S]*Ends at:/, hint: ['关键动作：添加一条**有时限、有注释、按标签匹配**的静默 —— 时长、说明、告警名三个都要给', 'amtool silence add --duration=2h --____="数据库升级维护窗口" alertname=MySQLDown --alertmanager.url=http://127.0.0.1:9093'], note: '**`--duration` 是安全阀**：哪怕忘了删除，它也会自己过期 —— 手写静默一定要带时长' },
          { title: '校验告警配置', about: '改路由/模板后必做', cmd: 'amtool check-config /etc/alertmanager/alertmanager.yml', ref: 'mo-amtool', hint: ['如果顺手改了告警路由或模板，重载前必须校验配置文件 —— 与 Prometheus 那边的校验是同一套纪律', 'amtool ____ /etc/alertmanager/alertmanager.yml'], note: '配置错了告警管理器会拒绝启动 —— **那意味着所有告警都发不出去**，比不告警更危险' }
        ],
        answer: 'amtool --alertmanager.url=http://127.0.0.1:9093 alert query --active',
        alt: [
          'amtool --alertmanager.url=http://127.0.0.1:9093 alert query --active',
          'amtool check-config /etc/alertmanager/alertmanager.yml'
        ],
        expect: /Alertname|Summary|State|SUCCESS|alertname/,
        teach: '**告警治理的核心矛盾是"既要响得准、又不能淹没人"** —— 而"告警太多导致值班的人麻木"是比"漏报"更常见的真实故障原因（**告警疲劳**）。三种抑制手段要分清：**静默（Silence）** 是**人工、有时限、按标签匹配**的屏蔽（维护窗口用 —— **一定要带 `--duration`**，否则忘记删除就是永久静默，那比不告警更糟）；**抑制（Inhibit）** 是**配置化的"高级别告警压住低级别"**（如"整个机房不可达"时应抑制该机房所有主机的告警 —— 这是**根治告警风暴**的手段，不是临时措施）；**分组（Group）与聚合（Aggregate）** 是把同类告警合并成一条通知（配置里的 `group_by` / `repeat_interval`）。三条实务纪律：**每次静默都要有注释与工单号**（`--comment` 里写清"为什么、谁批的、什么时候恢复" —— 事后审计与交接全靠它）；**静默范围要尽可能窄**（按 `alertname` + 具体实例标签匹配，**千万别用"匹配全部"** —— 那等于把监控关了）；**维护结束后主动确认静默已过期**（`amtool silence query` 能看到还剩多久）。再往上一个层次是**告警分级**：**P0 立刻打电话**（业务完全不可用）、**P1 工作时间内处理**（有影响但有兜底）、**P2 只进日报**（趋势性问题）。分级清晰之后，"告警多"就不再是问题 —— 因为**需要人立刻响应的其实很少**，其余都该走通知而不是叫醒人。'
      },

      {
        id: 'db-conn-pool-exhausted',
        cat: 'db-cache',
        title: '应用报"连接数满了"：先分清连接是"躺着"还是"在干活"',
        prompt: '业务开始零星报 `Too many connections`。你登进数据库看 `Threads_connected` 是 182，而 `max_connections` 是 1000 —— **离上限还远，可应用就是连不上**。问题到底在哪？',
        task: '从连接总数、运行中线程、空闲连接三个口径定位"连接到底被谁占着"',
        steps: [
          { title: '先看当前连接总数', about: '离上限还有多远', cmd: 'mysqladmin extended-status | grep -E "Threads_connected|Threads_running|Max_used_connections"', ref: 'db-mysql-processlist', hint: ['看连接不能只看一个数：当前连接数、**正在执行**的线程数、以及历史峰值，三个放一起才有判断依据 —— 用扩展正则把三个名字一次筛出来', 'mysqladmin extended-status | grep -E "Threads_connected|Threads_running|____"'], note: '182 个连接里只有 **3 个在跑** —— 其余 179 个都是闲置的，这就是关键线索' },
          { title: '看上限是多少', about: '确认天花板', cmd: "mysql -e \"SHOW VARIABLES LIKE 'max_connections'\"", ref: 'db-mysql-connect-timeout', hint: ['要判断"还有多少余量"，得先知道上限 —— 查这个参数就是查天花板', "mysql -e \"SHOW VARIABLES LIKE '____'\""], note: '1000 —— 所以 182 并不算高；**报"连接满"往往不是真的到上限**，而是连接池被占满或短连接风暴' },
          { title: '把连接逐条列出来', about: '看清每条连接在干什么', cmd: 'mysql -e "SHOW FULL PROCESSLIST"', ref: 'db-mysql-processlist', hint: ['要从"数字"下钻到"是谁"：把每条连接的用户、来源、状态、以及正在执行的 SQL 都列出来', 'mysql -e "SHOW ____ PROCESSLIST"'], note: '注意第 7 条的 State 是 `Waiting for table metadata lock`，第 9 条是 `Sleep` —— **两种"占着不放"**' },
          { title: '数一数有多少条在睡', about: 'Sleep 就是连接池的空转', cmd: "mysql -e \"SHOW FULL PROCESSLIST\" | awk '$6 == \"Sleep\" {print}'", ref: 'db-mysql-processlist', hint: ['把状态列等于空闲的那些挑出来 —— 状态列是第 6 个字段，用 awk 按它筛', "mysql -e \"SHOW FULL PROCESSLIST\" | awk '$6 == \"____\" {print}'"], note: '`Sleep` 且 Time 很大的连接**白占名额**：它们什么也不做，但 `max_connections` 的坑被占着' },
          { title: '看服务端会不会主动回收空闲连接', about: 'wait_timeout 决定睡多久', cmd: "mysql -e \"SHOW VARIABLES LIKE 'wait_timeout'\"", ref: 'db-mysql-connect-timeout', hint: ['空闲连接不会自己消失，服务端靠一个超时参数回收它们 —— 查这个参数就知道睡着的连接能挂多久', "mysql -e \"SHOW VARIABLES LIKE '____'\""], note: '默认 28800 秒（8 小时）—— **这意味着一条睡着的连接能占坑到下班**，连接池配置必须小于它' }
        ],
        answer: 'mysql -e "SHOW FULL PROCESSLIST"',
        alt: [
          'mysql -e "SHOW FULL PROCESSLIST"',
          "mysqladmin extended-status | grep -E \"Threads_connected|Threads_running\""
        ],
        expect: /Threads_connected|Threads_running|Sleep|Command/,
        teach: '**"连接满"有三个完全不同的含义，处置方式也完全不同。** **① 服务端到顶**：`Threads_connected` 逼近 `max_connections`（本站 1000）—— 这时新连接被拒，报 `Too many connections`；要看的是 `Max_used_connections`（历史峰值）判断是不是长期偏紧。**② 连接池被占满**：服务端数字不高，但应用侧池子满了 —— 因为**慢查询把连接占住了**：`Threads_running` 才是真正干活的数（本站只有 3），而 `Threads_connected` 里绝大多数是 `Sleep`。**判据很简单：`Threads_connected` 高而 `Threads_running` 低 = 连接在空转；两个都高 = 真的有慢查询在压**。**③ 短连接风暴**：应用每次请求都新建连接，`Aborted_connects` 与 `Max_used_connections` 会异常高，正确做法是改用连接池。三个必须知道的参数：**`max_connections`**（上限，调大要同时看内存 —— 每条连接都要占会话缓冲）、**`wait_timeout`**（服务端回收空闲连接的秒数，本站 28800 = 8 小时，**连接池的 `maxIdleTime` 必须小于它**，否则会拿到已被服务端关闭的死连接报 `Communications link failure`）、**`max_user_connections`**（单用户上限，多租户时用来防一个应用吃光全部）。**排查顺序固定成三步**：先看 `Threads_running` 与 `Slow_queries` 确认有没有慢查询在拖 → 再 `SHOW FULL PROCESSLIST` 看是谁（`Host` 列区分应用与来源机器）→ 最后才谈调参数。**反过来做（先调大 `max_connections`）是最常见的错误**：连接泄漏或慢查询没解决，调大只是把故障推迟几小时。'
      },

      {
        id: 'db-replica-sql-thread-stopped',
        cat: 'db-cache',
        title: '主从断了：IO 线程正常但 SQL 线程停了',
        prompt: '从库数据比主库少了一天的数据。你 `SHOW REPLICA STATUS` 一看：**`Slave_IO_Running: Yes`、`Slave_SQL_Running: No`** —— 一边正常一边停，而 `Seconds_Behind_Master` 显示 `NULL`。**"落后多少秒"都答不上来，这是最容易被误判成"网络问题"的一种断链。**',
        task: '分清 IO 与 SQL 两个线程的分工，从 Last_Error 读出真正的失败原因',
        steps: [
          { title: '看两个线程各自的运行状态', about: 'IO 拉日志、SQL 放日志，是两条独立链路', cmd: 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Slave_IO_Running|Slave_SQL_Running|Seconds_Behind"', ref: 'db-mysql-show-replica-status', hint: ['第一个判据不是"落后多少"，而是**两个线程各自活着没有** —— 它们一个负责从主库拉 binlog、一个负责执行：只筛这两个线程状态字段，再加一个落后秒数', 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Slave_IO_Running|____|Seconds_Behind"'], note: '**IO=Yes 说明网络与主库都没问题；SQL=No 才是真故障** —— 而且 `Seconds_Behind_Master` 变成了 `NULL`（因为复制已经不在推进，算不出秒数）' },
          { title: '读出真正的失败原因', about: 'Last_Error 是唯一权威', cmd: 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Last_Error|Last_SQL_Error"', ref: 'db-mysql-replication-lag', hint: ['线程停了，原因就写在它留下的错误字段里 —— 把带 Last_Error 的行筛出来读原文', 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "____"'], note: "`Duplicate entry '8812'` —— **主键冲突**：主库上这条数据早就有了，从库重放时插不进去" },
          { title: '确认冲突的错误号', about: '错误号决定处置方式', cmd: 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Last_SQL_Errno|Last_Errno"', ref: 'db-mysql-replication-lag', hint: ['不能只信错误文字，要看**错误号** —— 1062 与 1032 是两类不同的问题；把这两个字段筛出来', 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Last_SQL_Errno|____"'], note: '错误号 1062（重复键）—— **这类错误不会自愈**，必须人工决定是跳过还是补齐数据' },
          { title: '看复制到底停在哪一步', about: 'Relay_Master_Log_File 定位断点', cmd: 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Relay_Master_Log_File|Exec_Master_Log_Pos|Read_Master_Log_Pos"', ref: 'db-mysql-replication-lag', hint: ['要修就得知道"停在哪条日志的哪个位置"：筛出已读位置与已执行位置这几个字段对照着看 —— 这三个字段名都以 Relay_ / Exec_ / Read_ 开头', 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Relay_Master_Log_File|Exec_Master_Log_Pos|____"'], note: '**Read_Master_Log_Pos 领先 Exec_Master_Log_Pos** —— 日志已经拉到了，只是执行卡住了，进一步坐实"不是网络问题"' },
          { title: '确认这个错误会不会反复出现', about: '看它重试了几次', cmd: 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Last_SQL_Errno|Last_Errno|Skip_Counter"', ref: 'db-mysql-replication-lag', hint: ['同一个错误如果一直在重试，说明它是**持续性的**（数据冲突）而不是偶发抖动 —— 把错误号与跳过计数筛出来', 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Last_SQL_Errno|Last_Errno|____"'], note: '错误号 1062（重复键）—— **这类错误不会自愈**，必须人工决定是跳过还是补齐数据' }
        ],
        answer: 'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Slave_IO_Running|Slave_SQL_Running|Last_Error"',
        alt: [
          'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Slave_IO_Running|Slave_SQL_Running|Last_Error"',
          'mysql -e "SHOW REPLICA STATUS\\G" | grep -E "Seconds_Behind|Last_SQL_Errno"'
        ],
        expect: /Slave_IO_Running|Slave_SQL_Running|Last_Error|1062/,
        teach: '**MySQL 复制是两条独立的线程链路，排障必须分开看 —— 这是本节最重要的一句话。** **IO 线程**负责连主库、把 binlog 拉到本地 relay log；**SQL 线程**负责把 relay log 里的event 重放成数据。所以 `Slave_IO_Running: Yes` 只证明"网络通、主库活着、账号有权限"，**完全不能证明数据在同步**；`Slave_SQL_Running: No` 才是"数据已经停止变化"。**为什么 `Seconds_Behind_Master` 会是 `NULL`**：这个值算的是"SQL 线程执行的最后一个 event 的时间戳与当前时间之差"，SQL 线程停了就没有"最后一个 event"，于是返回 `NULL` —— **它不是"0 秒"也不是"无穷大"，而是"不知道"**，很多监控把它当 0 处理，于是从库停了一整天都没告警。**Last_Error 里的错误号直接指向处置方式**：**1062 重复键 / 1032 找不到行** 属于**数据不一致**（有人直连从库写、或主从切换后旧主写回来），**这类不会自愈**，要在"跳过这个 event（`SET GLOBAL SQL_SLAVE_SKIP_COUNTER=1`，风险是两边数据永远不一致）"与"重建从库"之间做选择 —— **生产上推荐后者**，因为跳过会让不一致持续累积；**1053 主库宕机 / 2013 连接丢失** 属于**暂时性故障**，`START SLAVE` 通常能自己恢复。**两个配套动作**：修之前先记下 `Relay_Master_Log_File` 与 `Exec_Master_Log_Pos`（这是断点位置，也是"从库到底同步到哪"的证据）；修之后必须回头看 `Seconds_Behind_Master` 是否从 `NULL` 变回数字、并且**在收敛**。最后一条监控建议：**告警要盯 `Slave_SQL_Running` 与 `Slave_IO_Running` 两个布尔值，不要只盯 `Seconds_Behind_Master`** —— 后者在断链时是 `NULL`，恰恰是最不敏感的那个。'
      },

      {
        id: 'db-metadata-lock-wait',
        cat: 'db-cache',
        title: '改表卡住了：一条 DDL 把全库拖慢',
        prompt: '你要给一张 500 万行的表加个索引，`ALTER TABLE` 敲下去就卡住不动。**几分钟后业务开始大面积超时**，可那条 ALTER 本身什么也没做。**一条 DDL 是怎么把整个库拖垮的？**',
        task: '从进程列表与 InnoDB 状态里找出"谁在等谁"，并确认这是元数据锁而不是行锁',
        steps: [
          { title: '看进程列表里谁在等', about: 'State 列直接写着等什么', cmd: 'mysql -e "SHOW FULL PROCESSLIST"', ref: 'db-mysql-processlist', hint: ['先看全貌：把所有连接的 State 列读一遍 —— 卡住的连接会明说自己在等什么', 'mysql -e "SHOW ____ PROCESSLIST"'], note: '`Waiting for table metadata lock` —— **注意是 metadata lock（元数据锁），不是行锁**，这两个的排查思路完全不同' },
          { title: '确认是哪条语句引起的', about: 'Info 列里就是那条 ALTER', cmd: "mysql -e \"SHOW FULL PROCESSLIST\" | awk '$6 == \"Sleep\" {print}'", ref: 'db-mysql-processlist', hint: ['要看清"谁拿着锁不放"：先把空闲连接列出来 —— 元数据锁最典型的元凶就是一条什么都不干却开着事务的连接', "mysql -e \"SHOW FULL PROCESSLIST\" | awk '$6 == \"____\" {print}'"], note: '有一条 `Sleep` 且 Time 很大 —— **它没在执行任何语句，但它的事务没提交，元数据锁就一直被它握着**' },
          { title: '看事务与锁的等待关系', about: 'InnoDB 状态里的 TRANSACTIONS 段', cmd: 'mysql -e "SHOW ENGINE INNODB STATUS\\G" | grep -A 12 "TRANSACTIONS"', ref: 'db-mysql-innodb-status', hint: ['进程列表只说"在等"，谁等谁要看 InnoDB 自己的报告 —— 它有专门一段列事务与锁', 'mysql -e "SHOW ENGINE INNODB STATUS\\G" | grep -A 12 "____"'], note: '`History list length` 很高说明有**长事务**积压 —— 长事务正是元数据锁被长期持有的根源' },
          { title: '看有没有已经死锁', about: '死锁是另一种"卡住"', cmd: 'mysql -e "SHOW ENGINE INNODB STATUS\\G" | grep -A 8 "LATEST DETECTED DEADLOCK"', ref: 'db-mysql-innodb-status', hint: ['"卡住"还有一种成因是死锁（两个事务互相等）—— InnoDB 会把最近一次死锁的现场记下来，直接把它读出来', 'mysql -e "SHOW ENGINE INNODB STATUS\\G" | grep -A 8 "LATEST DETECTED ____"'], note: '现场里有两条 `UPDATE orders` 互相等对方持有的行 —— **死锁是元数据锁之外的另一类"卡住"**，成因与处置都不同' },
          { title: '确认没有长期没提交的事务', about: '长事务是元数据锁的温床', cmd: 'mysql -e "SHOW ENGINE INNODB STATUS\\G" | grep -E "History list length|ACTIVE [0-9]+ sec"', ref: 'db-mysql-innodb-status', hint: ['把"跑了多久还没结束的事务"和"回滚段积压量"这两个信号一起筛出来 —— 它们一起说明"有事务开了没关"', 'mysql -e "SHOW ENGINE INNODB STATUS\\G" | grep -E "History list length|ACTIVE [0-9]+ ____"'], note: '`ACTIVE 1842 sec` —— **一个开了半小时还没提交的事务**，它就是那条 DDL 等不到锁的原因' }
        ],
        answer: 'mysql -e "SHOW FULL PROCESSLIST"',
        alt: [
          'mysql -e "SHOW FULL PROCESSLIST"',
          'mysql -e "SHOW ENGINE INNODB STATUS\\G" | grep -E "History list length|ACTIVE [0-9]+ sec"'
        ],
        expect: /Waiting for table metadata lock|History list length|ACTIVE \d+ sec/,
        teach: '**`Waiting for table metadata lock` 是 DDL 把库拖垮的经典形态，它的传播链条值得完整记住：** 一条 `ALTER TABLE` 需要的**不是行锁，而是表级的元数据锁（MDL）**；MDL 与"有没有事务开着"直接相关 —— **只要有一个事务访问过这张表又没提交，DDL 就得排队等它**。更糟的是**MDL 的排队是"插队式阻塞"**：DDL 一旦进入等待队列，**它后面的所有查询（哪怕只是 SELECT）也要跟着排队** —— 这就是为什么"一条 ALTER 卡住"会迅速演变成"整个库变慢"。这也解释了为什么 `SHOW PROCESSLIST` 里会看到**一堆 `Waiting for table metadata lock` 的普通查询**，而罪魁祸首往往是那条 **`Sleep` 状态、Time 很大**的连接。**三条处置原则**：**① 改表前先确认没有长事务**（`information_schema.innodb_trx` 按 `trx_started` 排序，或看 InnoDB 状态里的 `ACTIVE <秒数> sec`）；**② DDL 要设等待超时**（MySQL 8.0 支持 `ALTER TABLE … , LOCK_WAIT_TIMEOUT=3`，等不到就自己放弃，**不要去阻塞别人的查询**）；**③ 大表加索引用在线 DDL**（`ALGORITHM=INPLACE, LOCK=NONE`，或 `pt-online-schema-change` / `gh-ost` —— 原理是建影子表+触发器同步，代价是磁盘与主从延迟）。**别忘了主从这一层**：DDL 在从库上是**单线程重放**的，主库上跑 10 分钟的 ALTER，从库可能要跑更久，期间 `Seconds_Behind_Master` 会一路涨 —— **大表 DDL 之前要先看从库延迟，最好在低峰做**。最后一条：`History list length` 高不只是"有长事务"，它还会让 purge 跟不上、undo 空间膨胀 —— **长事务的代价从来不止是锁**。'
      },

      {
        id: 'db-slow-query-triage',
        cat: 'db-cache',
        title: '慢查询日志里一堆 SQL，先优化哪条',
        prompt: '慢查询日志开了几天，攒了几百条。**你不可能全优化，业务也在催。** 手上有 `mysqldumpslow` 这一个工具 —— 怎么在五分钟内挑出"最该先动的那一条"？',
        task: '用两种排序口径看待同一份慢日志，并结合行数判断真实的优化优先级',
        steps: [
          { title: '按总耗时排序', about: '哪一种 SQL 累计吃得最多', cmd: 'mysqldumpslow -s t -t 5 /var/log/mysql/slow.log', ref: 'db-mysql-slowlog', hint: ['第一口径是"累计影响"：把同类 SQL 归一化后按**总耗时**排序，取值最大的前几条 —— 这是优先级的第一个维度', 'mysqldumpslow -s ____ -t 5 /var/log/mysql/slow.log'], note: '`Time=15.41s` 那一类排第一 —— **注意 Count 与 Time 要一起看**：它出现了 3 次、每次 5 秒多' },
          { title: '换一个口径：按出现次数排', about: '频次高但单次不慢的 SQL 也很危险', cmd: 'mysqldumpslow -s c -t 3 /var/log/mysql/slow.log', ref: 'db-mysql-slowlog', hint: ['换一个排序键：这次按**出现次数**排 —— 单次 1 秒但每分钟 600 次的 SQL，危害不亚于单次 15 秒的', 'mysqldumpslow -s ____ -t 3 /var/log/mysql/slow.log'], note: '**两个口径给出的排序不一样** —— 所以"先优化哪条"必须两个都看，只看一个会漏掉高频次的那类' },
          { title: '读 Rows 列看它扫了多少行', about: '这是"为什么慢"的直接证据', cmd: 'mysqldumpslow -s r -t 5 /var/log/mysql/slow.log', ref: 'db-mysql-slowlog', hint: ['第三个口径看"扫描行数"：慢的本质通常不是 SQL 复杂，而是**扫了太多行**', 'mysqldumpslow -s ____ -t 5 /var/log/mysql/slow.log'], note: '`Rows=1874220` —— **扫了 187 万行却只返回几行**，这是索引缺失的典型特征（没有索引就只能全表扫）' },
          { title: '看慢日志本身的设置', about: '确认统计口径是否可信', cmd: "mysql -e \"SHOW VARIABLES LIKE 'long_query_time'\"", ref: 'db-mysql-slowlog', hint: ['慢日志的"慢"是按一个阈值定义的 —— 查这个阈值，才知道这份统计覆盖了什么、漏掉了什么', "mysql -e \"SHOW VARIABLES LIKE '____'\""], note: '阈值决定"哪些被记录"：**设太大（比如 5 秒）会漏掉大量 1~2 秒的"次慢"查询**，而它们累积起来往往更致命' },
          { title: '确认归一化的代价', about: 'N 是参数占位符', cmd: 'mysqldumpslow -s t -t 5 /var/log/mysql/slow.log | head -6', ref: 'db-mysql-slowlog', hint: ['再读一遍输出，注意 SQL 里的参数值 —— 它们被替换成了同一个符号，这正是"同类合并"的实现方式', 'mysqldumpslow -s t -t 5 /var/log/mysql/slow.log | ____ -6'], note: "`user_id = N`、`created_at > 'N'` —— **参数被归一化成 N**，所以不同参数值的同类 SQL 会被合并成一条\"模板\"" }
        ],
        answer: 'mysqldumpslow -s t -t 5 /var/log/mysql/slow.log',
        alt: [
          'mysqldumpslow -s t -t 5 /var/log/mysql/slow.log',
          'mysqldumpslow -s r -t 5 /var/log/mysql/slow.log'
        ],
        expect: /Count: \d+|Time=|Rows=/,
        teach: '**挑"先优化哪条"要同时看三个维度，只看总耗时是最常见的误判。** **① 总耗时（`-s t`）** = 次数 × 单次耗时，代表"它对系统资源的累计消耗" —— 这是**优先级的第一顺位**；**② 出现次数（`-s c`）** —— 单次 0.5 秒但每分钟几百次的 SQL，会持续占用连接与 CPU，**而且它往往是"业务主链路"**（每个用户请求都要跑）；**③ 扫描行数（`-s r`）** —— 这是**"为什么慢"的直接证据**，也是**优化收益的预测器**：`Rows` 远超返回行数说明是**索引问题**（建个索引就能从秒级降到毫秒级，投入产出比最高）；如果 `Rows` 与返回行数相当，那慢的原因在别处（排序、临时表、锁等待）。**`mysqldumpslow` 的能力边界必须知道**：它把参数值归一化成 `N`（所以 `order_id = 8812` 与 `= 8814` 合并成一条），只能做**粗聚合**；它**给不出执行计划**、也**算不出响应时间占比**。要做深度分析得用 **`pt-query-digest`** —— 它能给出"这条 SQL 占总响应时间的百分比"（**比总耗时更能说明优先级**）以及样本 SQL 与执行计划。**一个容易忽略的前提**：慢日志的覆盖率由 `long_query_time` 决定（本站默认 10 秒偏大）。**阈值设太大，你会漏掉大量 1~2 秒的"次慢"查询** —— 它们单条不起眼，但乘上 QPS 后往往比偶发的 15 秒查询更耗资源。排查期建议临时调到 1 秒甚至 0.5 秒，**并同时开 `log_queries_not_using_indexes`**（没走索引的查询单独记一份，这是找缺失索引最快的路）。**最后**：优化完必须回看这份日志确认那一条真的消失了 —— **没有"优化前/优化后"两次统计的优化，等于没优化**。'
      },

      {
        id: 'db-redis-slow-and-bigkey',
        cat: 'db-cache',
        title: 'Redis 忽然变慢：慢日志、大 key、连接谁在捣乱',
        prompt: '缓存响应时间从 1ms 涨到 50ms，**而 Redis 是单线程的 —— 一条慢命令会拖慢所有人**。你要在不重启、不清库的前提下找出"是哪条命令、哪个 key、哪个客户端"干的。',
        task: '用慢日志定位命令、用内存信息定位大 key、用连接列表定位来源',
        steps: [
          { title: '先看慢日志里是哪些命令', about: 'Redis 会记下超过阈值的命令', cmd: 'redis-cli SLOWLOG GET 10', ref: 'db-redis-slowlog', hint: ['Redis 自己有一份慢日志（记录超过阈值的命令），先把最近的取出来 —— 每条的耗时单位是微秒', 'redis-cli ____ GET 10'], note: '**耗时只算命令执行，不含网络** —— 所以它抓不到"网络慢/连接排队"，那是另一个方向' },
          { title: '看慢日志攒了多少条', about: '持续性还是偶发', cmd: 'redis-cli SLOWLOG LEN', ref: 'db-redis-slowlog', hint: ['条数本身是判据：只有一两条说明是偶发抖动，攒了很多条说明是**持续性问题**', 'redis-cli SLOWLOG ____'], note: '条数持续增长 → 不是偶发，要顺着"哪类命令"往下查' },
          { title: '看谁连着、闲了多久', about: '连接池空转与来源定位', cmd: 'redis-cli CLIENT LIST', ref: 'db-redis-client-list', hint: ['慢的另一半原因常在"连接"上：把客户端列表拉出来，看每个连接的来源、名字与空闲时间', 'redis-cli ____ LIST'], note: '`idle` 很大的是**连接池空转**；`cmd=subscribe` 是长连接 —— **别把它们与"正在干活的连接"混为一谈**' },
          { title: '按来源 IP 聚合连接数', about: '一眼看出是谁在泄漏连接', cmd: "redis-cli CLIENT LIST | awk '{print $2}' | cut -d= -f2 | cut -d: -f1 | sort | uniq -c | sort -rn | head", ref: 'db-redis-client-list', hint: ['一条条看不出来，要按来源聚合：取出地址字段、砍掉端口只留 IP、再计数排序', "redis-cli CLIENT LIST | awk '{print $2}' | cut -d= -f2 | cut -d: -f1 | ____ -c | sort -rn | head"], note: '某个 IP 占了绝大多数连接 —— **这就是连接泄漏的那台机器**（应用侧池子没回收）' },
          { title: '找大 key', about: '大 key 是慢查询的头号来源', cmd: 'redis-cli --bigkeys', ref: 'db-redis-bigkeys', hint: ['另一条主线是"数据本身太大"：让客户端扫一遍全库，按类型列出每种类型里最大的 key', 'redis-cli ____'], note: '`big:cache:report:2024Q1` 一个 string 就有 1MB —— **单线程下一次读 1MB，其他请求都得排队**' },
          { title: '精确算一个大 key 占多少', about: '--bigkeys 只给近似值', cmd: 'redis-cli MEMORY USAGE big:cache:report:2024Q1', ref: 'db-redis-memory-usage', hint: ['扫描给的是近似值，要精确知道某个 key 真正占多少字节，用专门的子命令', 'redis-cli ____ big:cache:report:2024Q1'], note: '精确字节数 —— **大 key 的处置是拆分或压缩，而不是简单删掉**（删大 key 本身也是一次慢操作）' }
        ],
        answer: 'redis-cli SLOWLOG GET 10',
        alt: [
          'redis-cli SLOWLOG GET 10',
          'redis-cli --bigkeys'
        ],
        expect: /\(integer\) \d+|Biggest|1\)/,
        teach: '**Redis 变慢的排查要沿三条独立线索走，混在一起看会绕不出来。** **① 命令线索（`SLOWLOG`）**：Redis 是**单线程执行命令**的，所以"一条慢命令会阻塞后面所有请求" —— 这就是为什么 Redis 变慢往往是**阶跃式**的而不是渐进的。慢日志只记**命令执行时间**（不含网络往返与排队），阈值由 `slowlog-log-slower-than` 控制（微秒，默认 10000 = 10ms，**设 0 记全部、设负数则关闭**），条数上限是 `slowlog-max-len`。**三类最常见的慢命令**：`KEYS *`（线上绝对禁用，要用 `SCAN`）、`FLUSHALL`/`FLUSHDB`、以及对大 key 的整段读取（`GET` 一个 1MB 的 string、`HGETALL` 一个几万字段的 hash、`SMEMBERS` 一个大集合）。**② 数据线索（大 key / 热 key）**：`--bigkeys` 扫全库给近似值（**用 `-i 0.1` 在线上降低影响**），`MEMORY USAGE <key> SAMPLES 0` 给精确值。大 key 的危害不止"读它慢"：**删除它、让它过期、主从同步它、持久化它，每一次都是慢操作** —— 正确做法是**拆分**（hash 按字段分片、大 string 拆成多个）或改用别的结构，而不是直接 `DEL`。**③ 连接线索（`CLIENT LIST`）**：`idle` 很大 = 连接池空转（白占 `maxclients`）；按来源 IP 聚合能一眼看出**哪台应用泄漏了连接**。**三个容易搞混的边界**：**`MONITOR` 不要当日常监控用**（它给每条命令多做一次格式化与推送，**官方文档明确说会降约 50% 吞吐**，正确用法是"短时、精确、有目标"，比如 `timeout 10 redis-cli MONITOR | grep <热点key>`）；**慢日志抓不到网络与排队**（那是 `LATENCY` 的领域，本站未实现那一条，可以用 `CLIENT LIST` 的 `idle` 与 `INFO stats` 的 `rejected_connections` 间接判断）；**`INFO commandstats` 常被忽略但很有用** —— 它给的是**各类命令的累计耗时占比**，比单看慢日志更能回答"到底哪类操作在吃 CPU"。'
      },

      {
        id: 'db-kafka-consumer-lag',
        cat: 'db-cache',
        title: '消费积压了：LAG 涨到上万，该加消费者还是查代码',
        prompt: '下游说"数据延迟半小时"。你查消费组发现 **LAG 已经上万，而且还在涨**。第一反应是加消费者 —— **但 `orders-events` 只有 6 个分区，你已经有 6 个消费者了**。加人没用，那该查什么？',
        task: '读消费组的 LAG 分布，判断积压是"消费太慢"还是"分区不够"，再确认消息总量',
        steps: [
          { title: '看消费组的积压情况', about: '每个分区各积压多少', cmd: 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service', ref: 'db-kafka-consumer-groups', hint: ['消费积压要看**逐分区**的明细：当前位点、日志末端位点、两者之差就是 LAG', 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --____ order-service'], note: '`LAG = LOG-END-OFFSET − CURRENT-OFFSET` —— **注意 LAG 在各分区之间不均匀**（从 17817 到 802）' },
          { title: '只挑积压大的分区看', about: '把注意力放在重灾区', cmd: "kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service | awk 'NR>1 && $6+0 > 10000 {print $1, $2, $6}'", ref: 'db-kafka-consumer-groups', hint: ['按第 6 列 LAG 过滤，只留下超过一万的分区', "kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service | awk 'NR>1 && $6+0 > ____ {print $1, $2, $6}'"], note: '**积压集中在 0/1/2 三个分区** —— 而它们正是第一个消费者的分区（0-2），第二个消费者（3-5）都很轻' },
          { title: '确认这个主题有几个分区', about: '分区数决定并行度上限', cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --describe --topic orders-events', ref: 'db-kafka-topics-describe', hint: ['要判断"加消费者有没有用"，先得知道这个主题的**分区数** —— 它就是消费并行度的硬上限', 'kafka-topics.sh --bootstrap-server broker1:9092 --describe --____ orders-events'], note: '`PartitionCount: 6` —— **消费并行度最多 6**；已经有 6 个消费者时再加是白加（第 7 个会一直空闲）' },
          { title: '看主题列表确认没有别的积压', about: '顺带看有没有死信队列', cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --list', ref: 'db-kafka-topics-list', hint: ['别只盯一个主题：把集群里的主题列出来，看看有没有专门的重试/死信队列 —— 那通常意味着有消息一直在失败重投', 'kafka-topics.sh --bootstrap-server broker1:9092 --____'], note: '有 `orders-events-dlq`（死信队列）—— **积压根因可能是"部分消息一直消费失败"**，而不是吞吐不够' },
          { title: '列出所有消费组', about: '确认有没有别的组也在抢积压', cmd: 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --list', ref: 'db-kafka-consumer-groups', hint: ['看还有哪些消费组 —— 如果同一个主题被多个组消费，积压的原因可能不在你查的这个组', 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --____'], note: '多个组各自消费同一份日志 —— **Kafka 的消费组之间互不影响**，但机器资源是共享的' }
        ],
        answer: 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service',
        alt: [
          'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service',
          "kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service | awk 'NR>1 && $6+0 > 10000 {print $1, $2, $6}'"
        ],
        expect: /LAG|order-service|\d{3,}/,
        teach: '**Kafka 积压的判据是"LAG 的分布形态"，而不是 LAG 的绝对值 —— 不同的分布指向完全不同的处置。** **① 各分区 LAG 均匀上涨** → **消费能力整体不足**：要么加消费者（**上限 = 分区数**，超过就有人空闲），要么优化消费逻辑（批量提交、减少每条消息的外部调用）。**② 少数分区 LAG 极高、其余正常** → **分区倾斜**：通常是**消息 key 选得不好**（比如用订单状态做 key，导致某几个 key 的消息全落在同一个分区），解法是换 key 或扩容分区后重分布。**③ LAG 不降反升但消费者不忙** → **消费逻辑有阻塞**：某条消息处理卡住（外部接口超时、数据库锁等待），整个分区停在那儿 —— **Kafka 的消费位点是按分区顺序提交的，一条卡住后面全等**。**④ 有死信队列且 LAG 持续** → **部分消息反复失败重投**：这不是吞吐问题而是**数据问题**，加消费者只会让失败更快。**几个必须知道的机制**：**① 一个分区在同一消费组内只能被一个消费者消费**（所以并行度上限就是分区数 —— 这也是"加消费者没用"的根本原因）；**② 扩容分区不能减少分区**（Kafka 不支持缩分区），而且**加了分区之后同一个 key 可能落到不同分区**，依赖 key 顺序的业务要留意；**③ `CURRENT-OFFSET` 是"已提交的位点"而不是"已处理的位点"** —— 如果应用是处理完一批才提交，崩溃后会**重复消费**，所以消费逻辑必须幂等；**④ CONSUMER-ID 列能看出分配情况**：本站输出里 0-2 分区归 `order-service-1`、3-5 归 `order-service-2`，**如果没有 CONSUMER-ID，说明这个组当前没有活跃消费者**（位点只是历史残留）。**最后一条运维习惯**：**LAG 要看趋势而不是快照** —— 一次性 `describe` 只能看到此刻，判断"在收敛还是在恶化"必须隔几分钟再采一次，或者用 `--members` 与监控系统留下时间线。'
      }
,

      {
        id: 'mw-nginx-504-upstream-timeout',
        cat: 'middleware',
        title: '504 是谁的问题：Nginx 说是超时，但它不是元凶',
        prompt: '用户报"下单页转圈很久然后报错"。你查 Nginx 的 access.log：**有几条 500，还有几条耗时特别长**；error.log 里写着 `upstream timed out while reading response header`。**Nginx 自己很快，它在等后端。** 那到底该修哪一层？',
        task: '从 Nginx 的错误指向出发，逐层排除"后端不可达"与"后端太慢"，定位真正的责任方',
        steps: [
          { title: '先看 Nginx 自己的报错', about: '代理层的错误日志最能指方向', cmd: 'cat /var/log/nginx/error.log', ref: 'mw-nginx-log', hint: ['代理服务器出错时，第一手线索在它自己的错误日志里 —— 读原文，注意它说的是"连不上"还是"读响应超时"', 'cat /var/log/nginx/____.log'], note: '`upstream timed out … while reading response header` —— **关键词是 reading response header**：连接建立成功、请求发出去了，是**后端迟迟不返回响应头**，即后端慢，不是连不上' },
          { title: '看是哪几个请求受影响', about: '把现象落到具体接口', cmd: "awk '$9 >= 500 {print $7, $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", ref: 'mw-nginx-502-504-499', hint: ['把 Nginx 侧的 5xx 归因到具体接口 —— 状态码在第 9 列、请求路径在第 7 列，一起打出来再计数', "awk '$9 >= ____ {print $7, $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn"], note: '**只有 `/api/orders/881x` 这几个订单详情接口在报错** —— 范围立刻从"整站"缩到"某个接口"' },
          { title: '确认后端到底在哪', about: '代理指向哪几个上游', cmd: "grep -n -A 4 'upstream' /etc/nginx/nginx.conf", ref: 'mw-nginx-upstream', hint: ['要看后端是谁：把配置里的 upstream 段连同它下面几行列出来（带行号 -n、连带下文 -A）', "grep -n -A 4 '____' /etc/nginx/nginx.conf"], note: '两个后端 `10.0.1.31:8080` 与 `10.0.1.32:8080`，都有 `max_fails=3 fail_timeout=10s` —— **这两个参数决定"连续错几次就把节点摘掉、多久后重试"**' },
          { title: '确认后端端口是通的', about: '排除"连不上"这种更简单的原因', cmd: 'ss -tlnp', ref: 'ln-ss', hint: ['要排除"后端根本没监听"：把本机所有监听端口与进程列出来 —— 注意这个视图只反映**本机**，远端要另测', 'ss -____'], note: '**本机能跑 8080 的是 java（本机应用）**，而 upstream 指的是远端 10.0.1.31/32 —— **"本机在听"不等于"上游在听"**，这一步只能排除本机侧' },
          { title: '看后端应用自己的日志', about: '真正的元凶在这里', cmd: "grep -n 'ERROR' /var/log/app.log | tail -5", ref: 'lb-tail', hint: ['代理层只说"后端慢"，**为什么慢要看后端自己的日志** —— 筛出 ERROR 行读最后几条', "grep -n '____' /var/log/app.log | tail -5"], note: '应用日志里是 `query timeout after 5000ms` —— **到这里责任方才确定：不是 Nginx、也不是网络，是后端的慢查询**' }
        ],
        answer: "grep -n -A 4 'upstream' /etc/nginx/nginx.conf && cat /var/log/nginx/error.log",
        alt: [
          "grep -n -A 4 'upstream' /etc/nginx/nginx.conf && cat /var/log/nginx/error.log",
          "cat /var/log/nginx/error.log && awk '$9 >= 500 {print $7}' /var/log/nginx/access.log | sort | uniq -c"
        ],
        expect: /upstream|timed out|server 10\.0\.1/,
        teach: '**Nginx 的 502 与 504 指向完全不同的责任方，这是代理层排障的第一分界线。** **502 Bad Gateway** = **连接层面就失败了**（后端端口没开、进程挂了、被防火墙拦了，或后端主动断开了连接）—— 责任通常在"后端不在"；**504 Gateway Timeout** = **连接建立成功、请求发出去了，但后端在 `proxy_read_timeout`（默认 60 秒）内没返回响应** —— 责任在"后端太慢"。**区分它们的办法就写在 error.log 里**：`connect() failed` / `Connection refused` → 502；`upstream timed out … while reading response header` → 504；`upstream prematurely closed connection` → 后端进程中途崩了（表现常是 502）。**还有两个容易误判的**：**499** 是 Nginx 自己的状态码，表示**客户端主动断开**（用户等不及关了页面）—— 它**通常不是服务端 bug，而是服务端慢的征兆**，看到 499 要往"哪里慢"查，而不是查"谁断的"；**500** 是后端返回的，说明请求到达了应用并被处理，问题在应用内部。**排查链路固定成四步**：① 看 Nginx error.log 确定是 502 还是 504；② 用 access.log 把 5xx 归因到**具体接口**（不是"整站都错"）；③ 确认 upstream 指向哪些后端、`max_fails`/`fail_timeout` 怎么配（**连续失败达阈值后节点会被摘除 `fail_timeout` 秒** —— 这会造成"过一会儿又好了"的假象）；④ **看后端自己的日志** —— 代理层永远只能告诉你"后端慢"，**为什么慢只有后端知道**。**三个工程要点**：`proxy_read_timeout` 与后端自己的超时（数据库查询超时、HTTP 客户端超时）**必须从外到内逐层变短** —— 如果 Nginx 设 60 秒、数据库设 5 秒，那用户要等 5 秒才看到错；反过来（Nginx 更短）用户会拿到 504 而**后端还在继续跑那条慢查询**，白白消耗资源。**不要把超时调大当解决方案**：调大只是把"快错"变成"慢错"，用户等待更久、连接占用更长时间。**最后**：这类问题的根因往往在数据库（本站就是 `query timeout after 5000ms`），所以"Nginx 报错"读完就该去查慢查询与索引，而不是反复重启 Nginx。'
      },

      {
        id: 'mw-nginx-config-review',
        cat: 'middleware',
        title: '改完 Nginx 配置：先验证，再决定怎么生效',
        prompt: '你要给 Nginx 加一个 `location` 并调一个超时参数。**直接 `systemctl restart nginx`？** 线上会瞬断；而**如果新配置写错了，重启之后干脆起不来**，整站下线。**正确的顺序是什么？**',
        task: '先校验语法、再确认最终生效的配置、最后选择"不中断"的生效方式',
        steps: [
          { title: '先校验语法', about: '不改动任何东西，只检查配置', cmd: 'nginx -t', ref: 'mw-nginx-test', hint: ['改完配置的第一动作永远是"只检查、不生效" —— 一个专门的选项就是干这个的', 'nginx -____'], note: '**`-t` 只做语法与基本引用检查，不改动运行中的进程** —— 它报错时会带上文件名与行号，直接照着改' },
          { title: '看最终生效的完整配置', about: '-T 把 include 全部展开', cmd: 'nginx -T | head -20', ref: 'mw-nginx-dump', hint: ['主配置里有 include，**真正生效的规则散在多个文件里** —— 有一个选项能把它们全部展开成一份完整配置打出来', 'nginx -____ | head -20'], note: '**`-T` 会把 `include` 的内容全部展开** —— 排查"我改的这条到底生效了没"就看它，而不是去翻主配置' },
          { title: '看当前版本与编译参数', about: '确认装了哪些模块', cmd: 'nginx -V', ref: 'mw-nginx-version', hint: ['有些指令需要对应模块才能用（写进配置但模块没编进去会直接报错）—— 有一个选项列出**版本与编译参数**', 'nginx -____'], note: '**`-V` 输出的是 configure arguments** —— 加了 `--with-http_ssl_module` 之类才能用对应模块；写配置前先确认，比事后 Debug 省事' },
          { title: '确认当前进程还活着', about: '生效前先留一条退路', cmd: 'systemctl status nginx', ref: 'mw-nginx-signal', hint: ['动手前先确认服务当前是正常的 —— 这样万一新配置有问题，你知道"回到什么状态"是好的', 'systemctl ____ nginx'], note: '`active (running)` + `Main PID` —— **记下这个状态就是你的退路**：改坏了回到它' },
          { title: '用 reload 而不是 restart', about: '不中断连接地换配置', cmd: 'nginx -s reload', ref: 'mw-nginx-signal', hint: ['配置校验通过后让它生效 —— 要选**不中断已有连接**的那种方式：平滑重载而不是停掉再起', 'nginx -s ____'], note: '**`reload` 的机制**：master 进程校验新配置 → 启动新 worker → 老 worker 处理完手头请求后退出。**成功时没有任何输出** —— 没消息就是好消息' }
        ],
        answer: 'nginx -t && nginx -s reload',
        alt: [
          'nginx -t && nginx -s reload',
          'nginx -t && nginx -T | head -20'
        ],
        expect: /syntax is ok|test is successful|reload/,
        teach: '**改 Nginx 配置的正确顺序是"先验证、再展开确认、最后选择生效方式"，跳过前两步是线上事故的常见成因。** **`nginx -t`** 只做语法与引用检查（**不改动运行中的进程**），报错会带文件名与行号；**`nginx -T`** 把 `include` 全部展开成**最终生效的那一份配置** —— 这是回答"我改的规则到底有没有生效"的唯一可靠方式（多文件 include 的项目里，光看主配置经常看不出问题）；**`nginx -V`** 列出编译参数，**有些指令要对应模块才能用**，写之前确认能省一轮 Debug。**三种"让配置生效"的方式，代价完全不同**：**`restart`** 停掉全部 worker 再起 —— **正在处理的请求全部断开、连接瞬断**，只有改了 listen/worker_processes 这类**无法热加载**的项才必须用它；**`reload`**（`nginx -s reload`）master 校验配置、启动新 worker、老 worker 处理完手头请求再退出 —— **不中断连接**，是日常唯一该用的方式；**`quit`** 是"优雅退出"（处理完当前请求就整体退出），用于下线而不是换配置。**三个必须知道的细节**：**① `reload` 成功时没有任何输出** —— "没消息就是好消息"，但**这不代表配置语义正确**（`-t` 只验语法，写错 upstream 地址它照样通过）；**② reload 之前先确认服务当前是健康的** —— 否则出了问题你分不清是"新配置的锅"还是"本来就有问题"；**③ 老 worker 退出需要时间** —— 有长连接（WebSocket、SSE）时老进程可能挂很久，`ps -ef | grep nginx` 会看到 worker 数暂时翻倍，这是正常现象、不是泄漏。**容器里的 Nginx 要特别小心**：`reload` 依赖 master 进程收到 `HUP` 信号，而**如果容器里 PID 1 不是 nginx master**（比如被 shell 脚本包了一层且没用 `exec`），信号会被 shell 吃掉、reload 静默无效 —— 这是"改了配置没生效"在容器环境最常见的成因，排查方式是 `docker exec <容器> ps -ef` 看 PID 1 到底是谁。'
      },

      {
        id: 'mw-haproxy-validate-before-reload',
        cat: 'middleware',
        title: 'HAProxy 校验通过 ≠ 配置正确',
        prompt: '你改了 HAProxy 的后端地址，`haproxy -c -f …` 回了一句 `Configuration file is valid`。**于是你直接 reload 了 —— 然后流量全打到一台不存在的后端上。** 校验明明通过了，问题出在哪？',
        task: '理解配置校验的能力边界，并确认"谁来兜住校验查不出的那类错"',
        steps: [
          { title: '先做配置校验', about: '语法与结构检查', cmd: 'haproxy -c -f /etc/haproxy/haproxy.cfg', ref: 'mw-haproxy-check', hint: ['改完配置先校验：`-c` 表示只检查（check），`-f` 指定配置文件 —— 这两件事分开指定', 'haproxy -c ____ /etc/haproxy/haproxy.cfg'], note: '`Configuration file is valid` —— **但这只说明"语法没问题"**，输出里那句教学提示正是重点' },
          { title: '读清校验的边界', about: '它到底验证了什么', cmd: 'haproxy -c -f /etc/haproxy/haproxy.cfg 2>&1 | tail -4', ref: 'mw-haproxy-check', hint: ['把校验输出完整读一遍 —— 它自己会说明"通过只代表什么、不代表什么"，这一段比结果行重要', 'haproxy -c -f /etc/haproxy/haproxy.cfg 2>&1 | ____ -4'], note: '**校验不覆盖：后端 IP/端口是否可达、证书能否读取、stats socket 目录权限** —— 恰恰是最容易出问题的三类' },
          { title: '看后端到底配了谁', about: '人的复核补上工具的盲区', cmd: "grep -n -A 3 'server ' /etc/haproxy/haproxy.cfg", ref: 'mw-haproxy-config', hint: ['工具查不出的东西要靠人看：把配置里的 server 行连上下文列出来，逐条确认地址与端口是你想写的那个', "grep -n -A 3 '____ ' /etc/haproxy/haproxy.cfg"], note: '**这一步才是真正的"校验"** —— 后端地址写错时 `-c` 一样会通过，只有人能看出 `10.0.1.31` 本该是 `.32`' },
          { title: '确认平滑重载的前提', about: 'master-worker 才有 reload', cmd: "grep -n 'master-worker' /etc/haproxy/haproxy.cfg", ref: 'mw-haproxy-config', hint: ['reload 能不能"平滑"取决于一个配置项 —— 查配置里有没有开启多进程管理，没有它就等于重启、会瞬断连接', "grep -n '____' /etc/haproxy/haproxy.cfg"], note: '**有 `master-worker` 才能平滑 reload** —— 没有它时 `systemctl reload` 等价于重启，会造成连接瞬断' },
          { title: '用运行态确认结论', about: '配置对不对，最终看运行结果', cmd: 'ss -tlnp', ref: 'ln-ss', hint: ['配置文件的"意图"与进程的"实际行为"要分开看：列出本机真正在监听的端口与进程，确认代理端口确实起来了', 'ss -____'], note: '**配置 → 校验 → 重载 → 看监听端口**，这条链路走完才算真正改成功；只看校验输出是不够的' }
        ],
        answer: 'haproxy -c -f /etc/haproxy/haproxy.cfg',
        alt: [
          'haproxy -c -f /etc/haproxy/haproxy.cfg',
          "grep -n -A 3 'server ' /etc/haproxy/haproxy.cfg"
        ],
        expect: /valid|server |Configuration file/,
        teach: '**"校验通过"与"配置正确"是两件事 —— 这个区别在负载均衡上代价特别高。** `haproxy -c -f <file>` 做的是**语法与静态结构检查**：括号配平、指令名拼写、必填参数、部分取值合法性。它**不会**去连后端（那需要发真实请求）、**不会**验证证书文件能否读取、**不会**检查 stats socket 目录是否存在。所以**"通过校验"只保证"HAProxy 能启动"，不保证"流量能到达正确的后端"**。**这类"校验查不出"的错误有四类常见形态**：**① 后端地址/端口写错**（`10.0.1.31` 写成 `10.0.1.13`）—— 配置合法，但流量打到空处；**② 权重与备份标记配错**（`backup` 忘了加，两台都当主用）；**③ 健康检查指向了不存在的路径**（`option httpchk GET /healthz` 而后端没有这个路由）—— 后端会被判定为不健康并摘除，**表现为"全部 503"**，而配置完全合法；**④ 证书/ACL 引用的文件路径错**。这四类都只能靠**人复核 + 运行态验证**兜住，这也是为什么"改完配置要用运行态确认"不能省。**让配置生效的方式同样要看前提**：`systemctl reload haproxy` 的"平滑"**依赖 global 段里的 `master-worker`**（或命令行 `-W`）—— **没有它时 reload 等价于重启，会造成连接瞬断**；这一点与 Nginx 不同（Nginx 天然有 master/worker）。**一个更有力的兜底手段是"灰度重载"**：HAProxy 支持 `-c` 之外，生产上更稳的做法是**先在一台上重载、观察后端健康状态与错误率，再推其余机器**；配合 `stats socket`（`echo "show stat" | socat stdio /var/run/haproxy.sock`）能看到**每个后端的实时状态**（`UP`/`DOWN`、当前连接数、失败次数），这是"配置对不对"的最终判据。**最后一条与 Nginx 同理**：`reload` 只换配置，**换不掉已经建好的长连接与已有的会话**，所以"重载后仍然报错"时要想的是"老连接还没退完"或"根因不在代理层"。'
      },

      {
        id: 'mw-etcd-cluster-health',
        cat: 'middleware',
        title: 'etcd 集群还健康吗：三个命令看清一个 Raft 集群',
        prompt: '你的 Kubernetes 控制面开始偶发超时。**etcd 是集群唯一的事实来源，它一慢整个集群都慢。** 你要快速回答三件事：**三个节点都活着吗？谁是 leader？数据量是不是快撑爆了？**',
        task: '用 endpoint health / status / member 三条命令把 etcd 集群的状态看全',
        steps: [
          { title: '先确认节点是否可用', about: '最粗粒度的一层', cmd: 'ETCDCTL_API=3 etcdctl endpoint health --cluster', ref: 'mw-etcd-health', hint: ['第一层只有"活着还是死了"：对集群里每个节点做一次探活 —— 记着这是 v3 接口，要先声明 API 版本', 'ETCDCTL_API=3 etcdctl endpoint ____ --cluster'], note: '**`--cluster` 会遍历配置里登记的所有节点**（不写它只看一个）；返回 `is healthy` 只说明**能提交提案**，容量与 leader 要看下一步' },
          { title: '看容量与谁是 leader', about: '健康不等于宽裕', cmd: 'ETCDCTL_API=3 etcdctl endpoint status --cluster -w table', ref: 'mw-etcd-status', hint: ['第二层要"每个节点的详细状态"：输出用表格模式更易读 —— 注意看谁是 leader、以及数据库占用有多大', 'ETCDCTL_API=3 etcdctl endpoint status --cluster -w ____'], note: '`IS LEADER` 那列标出唯一的 leader；**`DB SIZE` 与 `DB SIZE IN USE` 的差距是碎片率** —— 差得越多说明需要 compact + defrag' },
          { title: '确认成员名单', about: '有没有该在的节点不在', cmd: 'ETCDCTL_API=3 etcdctl member list -w table', ref: 'mw-etcd-member-list', hint: ['第三层是"名单对不对"：列出集群登记的所有成员 —— 把 PEER 与 CLIENT 两列地址都看一遍', 'ETCDCTL_API=3 etcdctl member list -w ____'], note: '三个成员都是 `started`、地址各就各位 —— **如果某个成员的 CLIENT ADDRS 是空的，说明它是 learner（还没追上数据、不能投票）**' },
          { title: '读一个真实的键验证可读写', about: '只读探活不证明能读数据', cmd: 'ETCDCTL_API=3 etcdctl get /registry/config/redis', ref: 'mw-etcd-kv', hint: ['探活成功只说明"能提交提案"，不代表你的键能读出来 —— 顺手取一个已知存在的键，验证读写路径都通', 'ETCDCTL_API=3 etcdctl ____ /registry/config/redis'], note: '**这一步是"端到端"验证**：认证（证书/口令）、路径、序列化都对，才拿得到值' },
          { title: '确认集群节点数与预期一致', about: '防"少了一个却没告警"', cmd: 'ETCDCTL_API=3 etcdctl member list -w table | wc -l', ref: 'mw-etcd-member-list', hint: ['用一个独立方式交叉确认规模：数一下输出行数（含表头），与预期节点数对照 —— 少一个节点时 Raft 的容错能力直接减半', 'ETCDCTL_API=3 etcdctl member list -w table | ____ -l'], note: '**行数 = 节点数 + 1（表头）** —— 3 节点集群容忍 1 个节点故障；**降到 2 节点后就没有容错能力了**，这是必须立刻处理的告警' }
        ],
        answer: 'ETCDCTL_API=3 etcdctl endpoint status --cluster -w table',
        alt: [
          'ETCDCTL_API=3 etcdctl endpoint status --cluster -w table',
          'ETCDCTL_API=3 etcdctl endpoint health --cluster'
        ],
        expect: /ENDPOINT|is healthy|IS LEADER|true|false/,
        teach: '**etcd 是 Kubernetes 的"唯一事实来源"，它的健康有三个层次，缺一层都可能误判。** **① 可用性（`endpoint health`）** —— 只回答"能否提交提案"，**它不告诉你容量、不告诉你谁是 leader、也不告诉你数据能不能读出来**；**② 详细状态（`endpoint status --cluster -w table`）** —— 这是信息量最大的一条：`IS LEADER` 标出唯一的 leader、`DB SIZE` 与 `DB SIZE IN USE` 给出**容量与碎片率**、`ERRORS` 列直接列出该节点的问题；**③ 成员名单（`member list`）** —— 确认"该在的都在、不该在的没混进来"，重点看 `STATUS`（`started` / `unstarted`）与 `IS LEARNER`（learner 只同步不投票）。**必须记住的 Raft 常识**：集群**容忍 (N-1)/2 个节点故障** —— 3 节点容忍 1 个、**2 节点容忍 0 个**（所以 2 节点是最危险的配置：挂一台就整体不可写）；**leader 只有一个**，写请求全部经它；**成员数最好是奇数**（偶数不增加容错能力，只增加一致性成本）。**etcd 变慢的两个头号原因是容量与碎片**：**默认 `--quota-backend-bytes` 是 2GB（有些版本 8GB）**，超过配额后**整个集群变成只读**（`etcdserver: mvcc: database space exceeded`）—— 这是最典型的"etcd 拖垮整个 K8s"的形态；**`DB SIZE` 比 `DB SIZE IN USE` 大很多说明历史版本没被回收**，处置是 `etcdctl compact <rev>` 之后 **`etcdctl defrag`（必须逐节点做，且 defrag 期间该节点会阻塞）**。**日常维护的三件事**：**① 定期快照**（`etcdctl snapshot save`，**并且要验证快照可用** —— 没验证过的备份等于没有备份）；**② 监控 `DB SIZE` 与 leader 变更次数**（频繁换 leader 说明网络或磁盘有抖动）；**③ 关注磁盘延迟** —— etcd 对 fsync 延迟极敏感（官方建议 P99 < 25ms），**用机械盘或共享云盘做 etcd 数据盘是最常见的自伤**。**最后一条与本站其它课呼应**：`etcdctl endpoint health` 在**没有真实 etcd 的环境里会返回不健康** —— 这是本仿真的已知边界，真机排障时以 `status` 与 `member list` 为准。'
      }
,

      {
        id: 'mw-service-first-check',
        cat: 'middleware',
        title: '中间件出问题：先问服务本身活着没',
        prompt: 'Nginx 不响应了。**新手第一反应是去看配置**，但配置往往没动过。**更可能的答案是"进程根本没起来"或"起来了但配置有语法错"。** 有三条命令能在十秒内回答这件事。',
        task: '确认服务运行状态、配置语法、以及进程实际监听情况',
        steps: [
          { title: '先看服务状态', about: 'systemd 管着的服务，一眼看死活', cmd: 'systemctl status nginx', ref: 'mw-nginx-signal', hint: ['第一眼看"服务活着没"：`Active:` 那行就是判据 —— 同时注意 `Main PID` 与最近的日志行', 'systemctl ____ nginx'], note: '`Active: active (running)` 是正常；**如果是 `failed`，最后几行日志往往直接写着原因**（端口被占、配置报错、权限不足）' },
          { title: '验证配置能不能通过', about: '改过配置就必须先验', cmd: 'nginx -t', ref: 'mw-nginx-test', hint: ['第二眼看"配置合法吗"：这个选项只检查、不生效，报错会带文件名与行号', 'nginx ____'], note: '**`-t` 不改动运行中的进程** —— 它是最安全的一步，任何配置改动之后都该先跑它' },
          { title: '看进程真的在听哪个端口', about: '状态正常 ≠ 业务端口在听', cmd: 'ss -tlnp', ref: 'ln-ss', hint: ['第三眼看"进程实际监听了什么"：把 TCP 监听端口与对应进程列出来 —— **这是"服务说自己在跑"与"业务真的能连上"之间的桥**', 'ss -____'], note: '**要看的是"你要的那个端口在不在、听在哪个地址上"** —— 听在 `127.0.0.1` 上的服务从外部永远连不上' },
          { title: '看它是什么版本', about: '报障时要给出版本号', cmd: 'nginx -V', ref: 'mw-nginx-version', hint: ['第四眼看"哪个版本、带了哪些模块"：`-V` 输出的是编译参数 —— **有些指令需要对应模块才能用**', 'nginx -____'], note: '**版本号是报障与查文档的必需信息**；编译参数能解释"为什么这条指令不认"' },
          { title: '读它自己的错误日志', about: '一手线索在这里', cmd: 'tail -5 /var/log/nginx/error.log', ref: 'lb-tail', hint: ['最后看服务自己的错误日志 —— **注意区分"连不上后端"与"读响应超时"**，它们指向完全不同的责任方', 'tail -5 /var/log/nginx/____.log'], note: '`upstream timed out … while reading response header` —— **关键词是 reading：连接成功、请求发出去了，是后端慢**，不是网络不通' }
        ],
        answer: 'nginx -t',
        alt: [
          'nginx -t',
          'systemctl status nginx'
        ],
        expect: /syntax is ok|test is successful|active \(running\)/,
        teach: '**中间件排障的顺序应当是"服务 → 配置 → 端口 → 版本 → 日志"，而新手最常犯的错是直接从配置看起。** 理由很实际：**配置往往没被动过，而进程可能因为 OOM、端口冲突、依赖缺失而没起来** —— 先看服务状态能省掉大量无效翻查。**每一步回答一个独立问题，互不替代**：`systemctl status` 回答"systemd 认为它活着吗"（**注意 `active` 与"业务可用"是两件事** —— 服务可能在跑但内部线程全卡住）；`nginx -t` 回答"配置语法对吗"（**只验语法，不验语义** —— upstream 地址写错它照样通过）；`ss -tlnp` 回答"进程实际在听哪个地址端口"（**这才是"能不能连上"的直接证据**）；`nginx -V` 回答"什么版本、带了哪些模块"（报障必备）；`error.log` 给出一手线索。**`systemctl status` 的三个看点**：`Loaded:` 那行的 `enabled/disabled`（**开机自启有没有配** —— 很多人重启后发现服务没起来，就是这个）；`Active:` 的状态与时长（**`active` 但才起来 3 秒**，说明它刚崩过重启）；以及最后几行日志（**失败原因常常直接写在那儿**，不必去翻 journalctl）。**日志里两条最能定方向的英文**：**`upstream timed out`** = 后端太慢（责任在后端应用或它依赖的数据库）；**`connect() failed` / `Connection refused`** = 后端不可达（责任在"后端不在"）；**`upstream prematurely closed connection`** = 后端进程中途崩了。**最后一条与 `nginx -t` 有关的纪律**：**改配置的正确顺序是"改 → `-t` 验证 → 决定生效方式"**，而生效方式里 `reload`（不中断连接）优先于 `restart`（会瞬断）—— **`reload` 成功时没有任何输出，"没消息就是好消息"**，但也因此不能靠输出判断，要配合 `ss` 或业务请求确认。'
      }
,

      {
        id: 'cap-new-server-audit',
        cat: 'monitor',
        title: '【综合实战】接手一台新服务器：十分钟摸清它的底',
        prompt: '你刚拿到一台生产服务器的 SSH。**在动任何东西之前，必须先知道这台机器现在是什么状态** —— 有没有盘快满了、服务是不是都活着、有没有正在报错。**这十分钟做得好，能避免接下来几小时都在救火。**',
        task: '按"资源 → 磁盘 → 服务 → 端口 → 错误 → 安全"的顺序做一次全面摸查，并识别出异常项',
        steps: [
          { title: '先看整体负载与内存', about: '这台机器现在忙不忙', cmd: 'uptime && free -h', ref: 'mo-top', hint: ['接手第一眼：**这台机器累不累、内存够不够** —— 两个命令一起跑，负载与内存要合起来看', 'uptime && free ____'], note: '负载 0.42/0.68/0.71 —— 对照核数（本站 2 核）说明还很闲；**内存要看 `available` 那一列，不是 `free`**' },
          { title: '再看磁盘余量', about: '很多"服务莫名其妙挂了"其实是盘满', cmd: 'df -h', ref: 'ls9-df', hint: ['第二眼必须看磁盘 —— **很多故障的根因就在这一行里**，而且它是只读命令、零风险', 'df ____'], note: '**`/data` 已经 100%、只剩 1.2G** —— 这就是本次摸查发现的第一个异常，记下来（它就是后面一系列故障的伏笔）' },
          { title: '核对磁盘与挂载的对应关系', about: 'df 只说挂载点，不说物理盘', cmd: 'lsblk', ref: 'ls9-lsblk', hint: ['`df` 给的是"挂了什么"，但**"哪块物理盘、分了多少区"要看另一条命令** —— 扩容时缺了这层信息会动错盘', '____'], note: '`vdb` 200G 分出一个 `vdb1` 挂在 `/data` —— **`lsblk` 用树形把"盘→分区→挂载点"三层关系摆出来**，这是扩容前的必看项' },
          { title: '确认关键服务活着', about: 'systemd 眼里的状态', cmd: 'systemctl status nginx', ref: 'mw-nginx-signal', hint: ['第三眼看服务：**systemd 认为它活着吗** —— 注意 `Active:` 那行与最近几行日志', 'systemctl ____ nginx'], note: '`active (running)` —— **但注意 `Main PID` 是 java**：说明这台机器的 nginx 服务名与实际进程值得再看一眼（本站的夹具就是这样安排的）' },
          { title: '看真正在监听的端口', about: '服务状态与端口是两件事', cmd: 'ss -tlnp', ref: 'ln-ss', hint: ['第四眼："服务说自己在跑"与"端口真的在听"是两件事 —— 把监听端口与进程列出来对照', 'ss -____'], note: '22 / 80 / 8080 / 3306 都在听，**而且能看到每个端口属于哪个进程** —— 这份清单就是你后面排障的"正常基线"' },
          { title: '数一下 Web 层错误', about: '有没有正在发生的故障', cmd: "grep -cE ' (500|502|503|504) ' /var/log/nginx/access.log", ref: 'lt-nginx-status', hint: ['第五眼看"现在有没有在报错"：数一下访问日志里的 5xx 条数 —— 用扩展正则一次匹配 5xx 的几个常见码', "grep -cE ' (500|502|503|504) ' /var/log/nginx/____.log"], note: '**3 条 5xx** —— 数量不多但要留意，结合前面 `/data` 100% 的线索，可能不是巧合' },
          { title: '最后看安全基线', about: '有没有人在猜密码', cmd: "grep -c 'Failed password' /var/log/secure || echo 0", ref: 'sec-secure-log', hint: ['第六眼看安全：认证日志里的失败次数 —— **没匹配到时退出码是 1，所以要接兜底分支**', "grep -c 'Failed password' /var/log/secure ____ echo 0"], note: '**3 次认证失败** —— 次数少，但对接手一台机器来说，**任何一次失败都值得知道来源**（下一节综合实战就从这个线索展开）' }
        ],
        answer: 'df -h && ss -tlnp',
        alt: [
          'df -h && ss -tlnp',
          'uptime && free -h'
        ],
        expect: /Use%|Mounted on|LISTEN|load average|Mem:/,
        teach: '**"接手一台机器"是个可以标准化的动作，顺序不能乱 —— 因为它遵循"从全局到局部、从只读到动手"的原则。** **为什么是这个顺序**：**先看资源（`uptime`/`free -h`）** —— 如果机器本身在 swap 里挣扎，后面所有操作都会变慢甚至超时，这会影响你对"服务有问题"的判断；**再看磁盘（`df -h` + `lsblk`）** —— **磁盘满是最高频的"莫名其妙"故障根因**（日志写不进去、数据库拒绝写入、容器起不来），而且它只用一条只读命令就能排除；`lsblk` 补上 `df` 给不了的那层"盘→分区→挂载点"关系，**扩容与换盘时必须先看它**。**第三层是服务与端口（`systemctl status` + `ss -tlnp`）** —— 这里有个关键区分：**`systemctl` 说"服务活着"不等于"端口在听"**（服务可能在跑但内部出错退出循环），而 `ss` 给出的是**内核层面的客观事实**；把这份端口清单存下来，**它就是你的"正常基线"** —— 以后出问题时一对比就知道该在听而没听的端口是哪个。**第四层是错误与安全（grep 5xx + 认证失败）** —— 这两条命令都是"数一个数字"，但**数字本身不是判据，趋势与来源才是**：3 条 5xx 不多，但要结合时间线看到底是不是持续在涨；3 次认证失败很少，但**新接手的机器上出现任何失败都该查来源**。**本课真正的教学点是"把发现串起来"**：`/data` 100% + 3 条 5xx —— **一个负责任的运维会立刻怀疑这两件事有关联**（磁盘满 → 应用写不进去 → 报错），而不是把它们当成两个独立现象分别处理。**下一节综合实战就从这里接着往下查。** 最后一条纪律：**这十分钟全部用只读命令**。接手环境时最忌讳"看到问题顺手改一下" —— 你还不了解这台机器承载什么业务，**任何改动都可能成为下一次故障的原因**。'
      },

      {
        id: 'cap-incident-chain',
        cat: 'monitor',
        title: '【综合实战】一次线上变慢：从现象查到根因',
        prompt: '用户报"下单很慢，有时候直接报错"。**没有人告诉你这是网络问题、还是数据库问题。** 你要从最外层的现象一路查到根因，并且**每一步都要能说出"为什么往这个方向查"**。',
        task: '沿"系统 → Nginx → 应用 → 数据库 → 结论"五层排查，每层只取最关键的证据',
        steps: [
          { title: '第一层：系统资源有没有饱和', about: '先排除"机器本身扛不住"', cmd: 'uptime && free -h', ref: 'mo-top', hint: ['从最外层开始：**机器本身有没有被压垮** —— 负载与内存一起看。这一步能排除一大批"看起来像应用问题"的情况', 'uptime && free ____'], note: '负载不高、内存 `available` 还有 1.1G —— **系统层没有饱和**，所以问题不在"机器扛不住"，要往下走' },
          { title: '第二层：错误发生在哪一层', about: 'Nginx 自己的错误日志', cmd: 'cat /var/log/nginx/error.log', ref: 'mw-nginx-log', hint: ['代理层的错误日志最能指方向 —— **注意它说的是"连不上"还是"读响应超时"**，这两者责任方完全不同', 'cat /var/log/nginx/____.log'], note: '**`upstream timed out … while reading response header`** —— 关键词 `reading`：连接建好了、请求发出去了，**是后端迟迟不返回**，即"后端慢"而不是"网络不通"' },
          { title: '第三层：受影响的是哪个接口', about: '把现象落到具体范围', cmd: "awk '$9 >= 500 {print $7, $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", ref: 'lt-nginx-status', hint: ['把 5xx 归因到具体接口：状态码在第 9 列、路径在第 7 列，两个都打出来再计数 —— **范围越具体，越接近根因**', "awk '$9 >= ____ {print $7, $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn"], note: '**只有 `/api/orders/881x` 这几个订单详情接口报错** —— 范围从"整站慢"缩到"某个接口的某类请求"' },
          { title: '第四层：应用自己怎么说', about: '后端日志里的一手线索', cmd: "grep -n 'ERROR' /var/log/app.log | tail -3", ref: 'lb-tail', hint: ['代理层只说"后端慢"，**为什么慢要看后端自己的日志** —— 筛出 ERROR 行读最后几条', "grep -n '____' /var/log/app.log | tail -3"], note: '**`query timeout after 5000ms`** —— 应用在等数据库，5 秒超时。责任方已经落到数据库这一层' },
          { title: '第五层：数据库的慢日志', about: '根因就在这里', cmd: 'mysqldumpslow -s t -t 3 /var/log/mysql/slow.log', ref: 'db-mysql-slowlog', hint: ['数据库有自己的慢日志 —— 按**总耗时**排取前几条，看是哪种 SQL 在吃时间', 'mysqldumpslow -s t -t 3 /var/log/mysql/____.log'], note: '**`Rows=1874220`（扫了 187 万行）** —— 这是典型的**缺索引导致全表扫**。到这里根因清楚了：慢 SQL → 应用超时 → Nginx 504/500' },
          { title: '顺手确认连接有没有被拖住', about: '慢查询的连带伤害', cmd: "mysqladmin extended-status | grep -E 'Threads_connected|Threads_running'", ref: 'db-mysql-processlist', hint: ['慢查询还有个连带效应：**连接被占住不放** —— 对比"连接总数"与"正在执行数"就能看出来', "mysqladmin extended-status | grep -E '____|Threads_running'"], note: '**182 个连接里只有 3 个在跑** —— 大量连接在空转等待。**如果不解决慢查询而只是调大连接数上限，问题只会推迟爆发**' }
        ],
        answer: 'cat /var/log/nginx/error.log',
        alt: [
          'cat /var/log/nginx/error.log',
          'mysqldumpslow -s t -t 3 /var/log/mysql/slow.log'
        ],
        expect: /upstream timed out|Count: \d+/,
        teach: '**这条排查链的价值不在命令，而在"为什么是这个顺序"。** 每一层回答一个**互不重叠**的问题，跳过任何一层都会让你在错误的方向上浪费大量时间：**① 系统层（`uptime`/`free -h`）** —— "机器本身有没有饱和"。这一层的意义是**快速排除**：如果 CPU 打满或内存在 swap 里挣扎，那后面的应用层、数据库层全部会表现为"慢"，而根因根本不在它们那里。**② 代理层（`error.log`）** —— "错误是什么性质"。**`upstream timed out while reading response`** 与 **`connect() failed`** 是分水岭：前者是"后端慢"（连接成功、等不到响应），后者是"后端不在"（压根连不上）—— **一个词之差，排查方向完全相反**。**③ 范围层（access.log 归因到接口）** —— "影响面有多大"。这一步把"整站慢"这种无法行动的模糊描述，变成"只有订单详情接口报错"这种可以立刻排查的描述；**并且它常常直接暴露根因的类型**（只有某类请求慢 → 大概率是某个查询/某个外部依赖）。**④ 应用层（`app.log`）** —— "应用卡在哪一步"。**`query timeout`、`connection refused`、`read timeout` 分别指向数据库、下游服务、网络** —— 应用日志的措辞就是下一层的地图。**⑤ 数据层（慢日志）** —— 根因。**判据看 `Rows` 而不只是 `Time`**：`Rows=1874220` 说明扫了 187 万行却只返回几行，这是**索引缺失**的铁证（`Time` 只告诉你"慢"，`Rows` 才告诉你"为什么慢"）。**最后一步的"连带的伤害"同样重要**：慢查询会占住连接，`Threads_connected` 高而 `Threads_running` 低说明连接在空转 —— **这解释了为什么"数据库看起来很闲但应用连不上"**；也解释了为什么"只调大 `max_connections`"是错的处置（它把故障推迟，而不是解决）。**这套链路的通用形态**是：**系统 → 边界（代理/网关）→ 范围 → 应用 → 数据**，几乎适用于任何"服务变慢"的场景，包括 K8s（把代理层换成 Ingress 或 Service）、容器（换成容器日志与 `docker stats`）。**真正的分水岭是第 ② 步**：它用一句话把问题分到"对方慢"还是"到不了"，而这两个方向后面要走的路完全不同。'
      },

      {
        id: 'cap-security-incident',
        cat: 'security',
        title: '【综合实战】怀疑被入侵：只读取证的五步',
        prompt: '监控告警"有异常登录"。**你不知道是误报还是真被入侵了。** 这时最忌讳的是**急着删文件、封 IP、重启服务** —— 那些动作会破坏证据，让你永远搞不清对方做了什么。**先用只读命令把事实固定下来。**',
        task: '按"身份 → 密钥 → 登录历史 → 攻击来源 → 提权面"取证，全程只读',
        steps: [
          { title: '确认自己现在的身份', about: '取证前先确认权限边界', cmd: 'id', ref: 'lu-id', hint: ['第一步不是查别人而是查自己：**你现在是什么身份** —— 这决定了你能看到多少证据', '____'], note: '`uid=0(root)` —— **以 root 取证能看到全部日志**；如果是普通用户，有些日志根本读不到，要先说明这一限制' },
          { title: '检查密钥文件的权限', about: '私钥权限不对等于泄露', cmd: 'ls -l /root/.ssh/id_ed25519', ref: 'sec-ssh-keygen', hint: ['第二眼看"钥匙"：**私钥的权限位必须是最严格的** —— 权限一旦放宽，等于把钥匙放在公共目录', 'ls -l /root/.ssh/____'], note: '**`-rw-------`（600）才是正确的** —— 只有属主可读写。如果是 `644`，任何用户都能读走你的私钥' },
          { title: '看名称解析有没有被改过', about: 'hosts 是常见的持久化手法', cmd: 'cat /etc/hosts', ref: 'ln-hosts-file', hint: ['第三眼看 `/etc/hosts` —— **它是攻击者最爱的持久化位置之一**：把某个域名指到自己的机器上，就能长期截获流量，而且这条记录不会引起任何告警', 'cat /etc/____'], note: '**只有 localhost 与本网段自己的机器名** —— 这才是正常的。**出现任何陌生域名或外网 IP 都要立刻追查**（尤其是与更新源、认证服务相关的域名）' },
          { title: '看最近有谁登录过', about: '时间线是一切取证的基础', cmd: 'last | head -6', ref: 'lu-last', hint: ['第四眼建立**时间线**：最近的成功登录记录 —— 注意来源 IP 与时间，这是判断"有没有陌生登录"的基准', 'last | ____ -6'], note: '**来源 IP 只有两个网段的**：`203.0.113.25`（办公/跳板）与 `198.51.100.77` —— **后者需要立刻确认是不是自己人**，它同时也出现在认证失败记录里' },
          { title: '看失败登录的原文', about: '有没有人在猜密码', cmd: "grep 'Failed password' /var/log/secure | head -3", ref: 'sec-secure-log', hint: ['第五眼看失败记录的**原文**：不只是数字，要看清"用什么账号、从哪来、什么时候" —— 行为特征比数量更有判据价值', "grep 'Failed password' /var/log/____ | head -3"], note: '**`invalid user admin` / `root` / `test` 三个账号在一秒内被连试** —— 这是**典型的字典扫描行为**（人是不会这样试的），而且来源正是上一步那个可疑 IP' },
          { title: '看谁能提权到 root', about: '评估"如果得手了能走多远"', cmd: 'getent group wheel', ref: 'lu-id', hint: ['最后评估**提权面**：哪些组能用 `sudo` 拿到 root —— 这决定了"一旦某个账号失守，影响有多大"', 'getent group ____'], note: '`wheel:x:10:` —— **冒号后面是空的，说明这个组里当前没有成员**。这是好消息：没人能通过 `wheel` 提权；但也要记住 root 本身不受此限制' }
        ],
        answer: "grep 'Failed password' /var/log/secure | head -3",
        alt: [
          "grep 'Failed password' /var/log/secure | head -3",
          'last | head -6'
        ],
        expect: /Failed password|pts\/|logged in/,
        teach: '**安全事件的第一原则是"先固定事实，再采取动作"** —— 因为**取证是一次性的**：`rm` 掉一个可疑文件、重启一次服务、清一次日志，那些信息就永远拿不回来了。所以处置顺序必须是 **取证 → 判断 → 处置**，而取证阶段**只用只读命令**。**五步各自回答一个问题，构成一条完整证据链**：**① 身份（`id`）** —— 不只确认"我是谁"，更是确认"我能看到多少"：普通用户读不到 `/var/log/secure`，那你的结论就必须带上这个盲区。**② 密钥权限（`ls -l ~/.ssh/id_*`）** —— **权限位是最容易被忽略的入侵痕迹**：攻击者拿到 shell 后常会留下自己的公钥（`authorized_keys` 变长）或放宽私钥权限；正确状态是私钥 `600`、`authorized_keys` `600`、`.ssh` 目录 `700`。**③ 登录时间线（`last`）** —— **`last` 是"成功"记录、`lastlog` 是"每人最后一次"、`w` 是"当前在线"**，三者配合才能回答"什么时候、从哪、谁进来过"；判断"陌生登录"需要先知道"正常是什么样"，所以**接手机器时就该存一份基线**。**④ 失败来源（`/var/log/secure`）** —— **判据是行为特征而不是数量**：本课那三条日志里 `invalid user admin`、`root`、`test` **在一秒内被依次尝试**，这是自动化字典扫描的典型指纹（人类不会这样试）；再看失败与成功的时间关系 —— **如果失败之后紧跟一次成功，那就是真的被猜中了**，这比失败本身严重得多。**⑤ 提权面（`getent group wheel` / `sudo -l`）** —— 回答"失守之后能走多远"：`wheel` 组成员、`/etc/sudoers` 里的条目、以及有 SUID 位的程序，这三处构成了本机的"提权路径"。**处置动作要遵守"先断后清"**：**① 保留证据**（把相关日志与 `ps`/`netstat` 输出复制到本机之外，别在原地分析）；**② 断掉通道**（改密码、禁用密钥、封来源 IP、必要时下线改从带外管理进）；**③ 再清理**（删可疑文件、修权限、必要时重装 —— **被 root 级入侵过的机器，最可靠的做法是重装而不是"清理"**）。**最后一条与本站 `security` 分类呼应的观念**：**安全不是"装了什么工具"，而是"最小权限的持续实践"** —— 每一次加账号、加 sudo 权限、放开端口时问一句"真的需要吗"，能消灭绝大多数风险，比事后取证轻松得多。'
      }

  );
})();
