/* data/lessons-perf.js · 性能压测与调优（练习课）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。每节课的 steps[].cmd 必须是**引擎真能跑通**的
   命令（tools/shell-check.js 会把每节课的 answer/alt 逐条执行验证），
   每步都要有 ref（回指命令手册条目 id）与两级 hint。

   本文件的场景与站内剧情一致：
     · web-prod-01 是 2 核 / 7.6G 的机器，load average 0.42 0.68 0.71
     · /data 挂在 vdb 上，vdb 的 %util 已经 99.4%，分区已用 100%
     · mysqld(PID 2210) 在疯狂写盘，Java 应用是 PID 18442（-Xmx4g，G1）
     · 所有数字都是引擎现场算出来的，不是编的
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

      /* ================= 1. 上线前量基线 ================= */
      {
        id: 'perf-baseline-http',
        cat: 'perf',
        title: '上线前先量个基线：这台机器到底能扛多少',
        prompt: '下周新版本要上线，领导问"这台 2 核的 web-prod-01 到底能扛多少并发"。你手上只有一台 SSH、没有监控面板，得先量出一组能对比的基线数字。',
        task: '先量出这台机器的资源上限，再打出一组可对比的基线（每秒请求数 + 尾部延迟）',
        steps: [
          { title: '先看进程能开多少句柄', about: '这个进程能同时打开多少文件与连接', cmd: 'ulimit -n', ref: 'pf-ulimit-n', hint: ['压测最常见的假瓶颈就是它：并发一上去先报 Too many open files，你量到的是这个上限而不是机器能力。', 'ulimit -____'], note: '本站是 65535；真机默认常见 1024，压测前必须先调大' },
          { title: '确认有几个核能干活', about: '这台机器能同时干活的核数', cmd: 'nproc', ref: 'pf-taskset', hint: ['并发能力的第一约束是核数：它决定压测线程开几个，也决定服务端到底有多少算力可以分。', 'n____'], note: '2 核 —— 后面所有数字都要按这个规格来解读' },
          { title: '看内核给连接排队留了多长', about: '全连接队列的长度上限', cmd: 'sysctl -n net.core.somaxconn', ref: 'pf-somaxconn', hint: ['高并发时连接被丢，常常不是服务处理不过来，而是内核接受队列太短；先看现值再决定要不要调。', 'sysctl -n net.core.____'], note: '32768 够用；真机默认常见 128~1024，队列满了客户端看到的就是连接超时' },
          { title: '打一组小并发基线', about: '低并发下的每秒请求数与尾部延迟', cmd: 'ab -n 1000 -c 10 -k http://10.0.1.23/api/health', ref: 'pf-ab', hint: ['先拿一条干净的基线：并发低时几乎不排队，这时百分比分布里的 99% 才代表服务本身的水平。', 'ab -n 1000 -c ____ -k http://10.0.1.23/api/health'], note: 'QPS 1825、P50 0.6ms、P99 3.1ms —— 这条基线是之后所有对比的参照物' },
          { title: '把并发抬十倍看拐点', about: '并发升高后每秒请求数是升还是降', cmd: 'ab -n 10000 -c 100 -k http://10.0.1.23/api/orders', ref: 'pf-ab', hint: ['同样的接口把并发抬十倍：如果每秒请求数不升反降、尾部延迟翻了几倍，说明已经越过容量拐点。', 'ab -n ____ -c 100 -k http://10.0.1.23/api/orders'], note: 'QPS 从 1825 掉到 547、P99 从 3.1ms 涨到 12.5ms —— 拐点就在这两次之间' },
          { title: '补一条只跟算力有关的基准', about: '换规格时能直接横向对比的算力数字', cmd: 'sysbench cpu --threads=2 --cpu-max-prime=20000 run', ref: 'pf-sysbench', hint: ['接口数字受代码和数据库影响，换台机器就不可比；要一条只跟算力有关的数字才能横比不同规格。', 'sysbench cpu --threads=____ --cpu-max-prime=20000 run'], note: '2 核 3169 events/sec —— 采购新实例时拿它做对比最干净' }
        ],
        answer: 'ulimit -n && nproc && sysctl -n net.core.somaxconn && ab -n 1000 -c 10 -k http://10.0.1.23/api/health && ab -n 10000 -c 100 -k http://10.0.1.23/api/orders && sysbench cpu --threads=2 --cpu-max-prime=20000 run',
        alt: ['ulimit -n && nproc && cat /proc/sys/net/core/somaxconn && ab -n 1000 -c 10 -k http://10.0.1.23/api/health && ab -n 10000 -c 100 -k http://10.0.1.23/api/orders'],
        expect: /Requests per second/,
        teach: '压测前先量三样：核数（决定压测线程开几个）、文件句柄上限（决定能不能打到高并发）、内核队列长度（决定连接会不会在排队时被丢）。然后才是压测本身：小并发拿基线、逐步加并发找拐点 —— QPS 不再上升而 P99 陡增的那个点，才是"这台机器能扛多少"的答案。两个最常见的假瓶颈要记住：句柄满了（Too many open files）和压测机自己先跑满，它们都会让你得出"机器不行"的错误结论。'
      },

      /* ================= 2. 压测结果怎么读 ================= */
      {
        id: 'perf-result-longtail',
        cat: 'perf',
        title: '同事的报告只写了一行平均值，你自己复现一遍',
        prompt: '同事发来的压测报告写着"QPS 2616，平均延迟 18ms，结论：性能达标"。业务方却在投诉接口偶尔卡两秒。你要在同一个接口上复现一次，并说清楚那个平均值掩盖了什么。',
        task: '用几种不同口径的压测工具拿同一接口的数据，把尾部延迟摊开看',
        steps: [
          { title: '小并发基线：先看干净的分位数', about: '并发低时的每秒请求数与 99% 分位', cmd: 'ab -n 1000 -c 10 -k http://10.0.1.23/api/health', ref: 'pf-ab', hint: ['报告里的平均值最会骗人，先看百分比分布那一栏：并发低时几乎没有排队，99% 分位接近真实水平。', 'ab -n 1000 -c ____ -k http://10.0.1.23/api/health'], note: 'P50 0.6ms、P99 3.1ms —— 两者差 5 倍，长尾从这时就已经存在' },
          { title: '把并发抬到 100 再看一遍', about: '并发升高后每秒请求数有没有跟着涨', cmd: 'ab -n 10000 -c 100 -k http://10.0.1.23/api/orders', ref: 'pf-ab', hint: ['同样的接口把并发抬上去：每秒请求数掉了一半、99% 分位涨到 12.5 毫秒，这就是排队开始出现的信号。', 'ab -n 10000 -c ____ -k http://10.0.1.23/api/orders'], note: 'QPS 547（比并发 10 时更低）、P99 12.5ms —— 平均值 2.4ms 依然好看，但它已经骗人了' },
          { title: '换成能给完整分布的工具', about: '50%、75%、90%、99% 四个分位一次看清', cmd: 'wrk -t4 -c400 -d30s --latency http://10.0.1.23/api/health', ref: 'pf-wrk', hint: ['要一眼看清长尾得换多线程压测：它能把四个关键分位一次打出来，而不是只给你一个平均值。', 'wrk -t4 -c400 -d30s ____ http://10.0.1.23/api/health'], note: '平均 18.42ms、P50 12.42ms、P99 142.18ms —— 在这组数据面前"平均延迟 18ms"毫无意义' },
          { title: '再换一个工具看直方图', about: '请求时间都堆在哪个区间', cmd: 'hey -n 5000 -c 50 http://10.0.1.23/api/health', ref: 'pf-hey', hint: ['换一种呈现方式交叉验证：横条越往右越长，说明有相当一部分请求被拖慢了。', 'hey -n 5000 -c ____ http://10.0.1.23/api/health'], note: '一半请求 18.9ms 上下，但 99% 到了 106ms —— 直方图右边那截长尾才是用户抱怨的部分' },
          { title: '交叉验证：换一个口径再压一次', about: '事务速率、成功率与最长事务', cmd: 'siege -c 50 -t 1M -b http://10.0.1.23/api/health', ref: 'pf-siege', hint: ['工具之间的数字对不上时先怀疑压测机自己到了瓶颈；再用一个口径不同的工具做交叉验证。', 'siege -c 50 -t 1M ____ http://10.0.1.23/api/health'], note: '事务速率 460.60/sec、可用性 100%、最长事务 1.84s —— 最长事务那一行才是业务方感知到的东西' }
        ],
        answer: 'ab -n 1000 -c 10 -k http://10.0.1.23/api/health && ab -n 10000 -c 100 -k http://10.0.1.23/api/orders && wrk -t4 -c400 -d30s --latency http://10.0.1.23/api/health && hey -n 5000 -c 50 http://10.0.1.23/api/health && siege -c 50 -t 1M -b http://10.0.1.23/api/health',
        alt: ['ab -n 1000 -c 10 -k http://10.0.1.23/api/health && wrk -t4 -c400 -d30s --latency http://10.0.1.23/api/health && siege -c 50 -t 1M -b http://10.0.1.23/api/health'],
        expect: /Latency Distribution/,
        teach: '平均值是最会骗人的一个数字：它把 1% 的慢请求摊进 99% 的快请求里，看上去一切正常，而用户抱怨的恰恰是那 1%。容量评估一律以 P99 为准；同时记住不同工具的口径不同（是否复用连接、事务怎么算、采样窗口多长），混着比就会得出互相矛盾的结论 —— 要么同一把尺子量到底，要么把差异说清楚。'
      },

      /* ================= 3. CPU 不忙但机器卡 ================= */
      {
        id: 'perf-io-bottleneck',
        cat: 'perf',
        title: 'CPU 还有六成空闲，可机器就是卡：把瓶颈钉在盘上',
        prompt: '监控群里在说接口越来越慢，可 top 里 CPU 有 60% 是空闲的。领导第一反应是"是不是内存不够、要不要加内存"，你要先证明瓶颈到底在哪。',
        task: '用观测工具把瓶颈定位到 /data 那块盘的 IO 上，并用标准负载量化它的上限',
        steps: [
          { title: '先看有没有进程在等盘', about: '多少进程卡在等 IO、CPU 有多少时间在等盘', cmd: 'vmstat 1 5', ref: 'pf-swappiness', hint: ['先看两个信号：有没有进程处于不可中断睡眠（等 IO），以及 CPU 有多少比例耗在等待磁盘上。', 'vmstat 1 ____'], note: 'b=2（两个进程在等 IO）、wa=1 —— CPU 不满，是因为活都堵在盘上' },
          { title: '指认是哪块盘', about: '每块盘的利用率与平均等待时间', cmd: 'iostat -x 1 3', ref: 'pf-fio', hint: ['要指认哪块设备有问题，就看每块盘的利用率百分比和平均等待毫秒数：接近 100% 的那块就是嫌疑人。', 'iostat -x 1 ____'], note: 'vdb 的 %util 99.41%、w_await 42.18ms —— /data 挂的正是这块盘' },
          { title: '按进程找出谁在写盘', about: '每个进程每秒读写多少字节、等多久', cmd: 'pidstat -d 1 3', ref: 'pf-fio', hint: ['盘忙不等于你的服务在写盘：要按进程列出每秒读写字节数，找出真正的写入方再谈优化。', 'pidstat -d 1 ____'], note: 'mysqld 每秒写 20 万 KB、java 每秒写 4.7 万 KB —— 应用的时间花在等 MySQL 落盘' },
          { title: '量一次不做并发的往返延迟', about: '单次读写要等多久，业务方能听懂的数字', cmd: 'ioping -c 5 /data', ref: 'pf-fio', hint: ['再看最朴素的一次往返：不做并发、只发几个请求，单次读写要等多久 —— 这个数字最能让人理解"卡"。', 'ioping -c 5 ____'], note: '平均 21.43ms、最大 26ms —— 单次 4K 读要等 20 毫秒以上，业务侧就是"接口变慢"' },
          { title: '用标准负载量化这块盘的上限', about: '4K 随机读下的吞吐与 99 分位延迟', cmd: 'fio --name=randread4k --filename=/data/fio-test --rw=randread --bs=4k --iodepth=32 --numjobs=4 --direct=1 --ioengine=libaio --runtime=60 --time_based --group_reporting', ref: 'pf-fio', hint: ['最后用标准负载把这块盘的天花板量出来：4K 随机读、多队列深度，看吞吐与 99 分位延迟。', 'fio --name=randread4k --filename=/data/fio-test --rw=randread --bs=4k --iodepth=32 --numjobs=4 ____=1 --ioengine=libaio --runtime=60 --time_based --group_reporting'], note: '102.5MiB/s、P99 799us、util 100% —— 这就是 /data 现在的天花板，换更高 IOPS 的云盘前拿它立项' }
        ],
        answer: 'vmstat 1 5 && iostat -x 1 3 && pidstat -d 1 3 && ioping -c 5 /data && fio --name=randread4k --filename=/data/fio-test --rw=randread --bs=4k --iodepth=32 --numjobs=4 --direct=1 --ioengine=libaio --runtime=60 --time_based --group_reporting',
        alt: ['vmstat 1 5 && iostat -x 1 3 && pidstat -d 1 3 && ioping -c 5 /data'],
        expect: /99\.41/,
        teach: '排"CPU 不满但很卡"的固定顺序：先看有没有进程卡在不可中断睡眠、CPU 有多少时间在等盘；再逐块盘看利用率，接近 100% 的那块就是嫌疑人；然后按进程找出谁在写盘；最后用一次不做并发的往返延迟让业务方理解"卡"，并用标准负载把上限量出来。要注意 %util 表达的是"设备有多忙"而不是"还有多少余量"——云盘在 99% 之后延迟会成倍恶化，这也是为什么 4K 随机读的 P99 会明显高于均值。'
      },

      /* ================= 4. JVM 的固定套路 ================= */
      {
        id: 'perf-jvm-gc',
        cat: 'perf',
        title: 'Java 应用报 query timeout：先看 GC 频率，再决定要不要 dump',
        prompt: '订单应用（PID 18442）在报 query timeout，同事张口就是"先 dump 一份堆下来给我"。你知道 dump 会让应用停几十秒，得先花两分钟确认这到底是不是内存问题。',
        task: '按固定套路确认 GC 现状与堆的构成，再决定要不要做重量级动作',
        steps: [
          { title: '先拿到进程号', about: '从进程列表里筛出跑 jar 的那个进程', cmd: 'ps -ef | grep java | grep -v grep', ref: 'pf-jstack-cpu', hint: ['所有 JVM 工具都要先拿到进程号：从进程列表里筛出那个跑 jar 的进程，顺便把启动参数记下来。', 'ps -ef | grep ____ | grep -v grep'], note: 'PID 18442，启动方式是 /usr/bin/java -jar /opt/myapp/app.jar' },
          { title: '每秒采一次 GC 数据', about: '回收次数与各代使用率的变化趋势', cmd: 'jstat -gcutil 18442 1000 5', ref: 'pf-jstat', hint: ['不用重启也不用装 Agent：每秒采一次，盯 FGC 那一列涨得多快、老年代是不是一直挂在 70% 以上。', 'jstat -gcutil 18442 1000 ____'], note: '5 秒里 Full GC 从 13 次涨到 17 次、老年代常驻 70%+ —— GC 确实有问题，但还要看是谁触发的' },
          { title: '看是谁触发的回收', about: '多一列触发原因，指向责任方', cmd: 'jstat -gccause 18442 1000 3', ref: 'pf-jstat', hint: ['频次只说明严重程度，触发原因才指向责任方：是分配失败，还是代码里有人手动要求回收。', 'jstat -gccause 18442 1000 ____'], note: 'GCC 列写着 System.gc() —— 显式调用触发的 Full GC，先去代码里删掉它，比加内存有用' },
          { title: '下沉到线程看谁最热', about: '哪个线程最吃 CPU、线程号是多少', cmd: 'top -H -p 18442', ref: 'pf-jstack-cpu', hint: ['进程级看够了就下沉到线程：加一个选项把该进程的每个线程单独列出来，记下 CPU 最高的那个线程号。', 'top ____ -p 18442'], note: '最热的是业务线程 pool-2-thread-1（TID 18473），比 GC 线程更吃 CPU —— 不只是内存问题' },
          { title: '再看函数级热点在哪', about: '这个进程的时间都花在哪些函数上', cmd: 'perf top -p 18442', ref: 'pf-perf', hint: ['线程级之后是函数级：采样几秒就能看到时间耗在哪些符号上，是自旋锁、内存拷贝还是垃圾回收。', 'perf ____ -p 18442'], note: '前三名是内核自旋锁 26.18%、tcp_sendmsg 12.44%、ext4 写入 10.82% —— 和 GC 日志里的长停顿是同一个原因' },
          { title: '真要动堆之前先看对象构成', about: '堆里都是什么对象、谁占得最多', cmd: 'jmap -histo:live 18442 | head -20', ref: 'pf-gc-log', hint: ['动手之前先用一份轻量直方图看对象构成：它比完整堆快照便宜得多，但同样会触发停顿，别在高峰期做。', 'jmap -histo:live 18442 | head ____'], note: '字节数组 5.26 亿字节排第一、Order 对象 30 万个 —— 堆积的结果集，回到连接池与查询逻辑去查' }
        ],
        answer: 'ps -ef | grep java | grep -v grep && jstat -gcutil 18442 1000 5 && jstat -gccause 18442 1000 3 && top -H -p 18442 && perf top -p 18442',
        alt: ['ps -ef | grep java | grep -v grep && jstat -gcutil 18442 1000 5 && jstat -gccause 18442 1000 3 && jmap -histo:live 18442 | head -20'],
        expect: /FGC/,
        teach: 'JVM 性能问题的固定套路：先拿到 PID → 用轻量采样看 GC 频率和触发原因 → 用线程视图找热点 → 再下沉到函数级采样确认热点到底在哪 → 最后才动堆直方图、堆快照这类重量级动作。顺序反过来（一上来就 dump）会在业务高峰期制造一次几十秒的停顿，而且 dump 下来的文件未必指向真正的问题。要更细的调用栈就用 perf record -F 99 -p <PID> -g -- sleep 30 采样，再用 perf report --stdio 排序。另一个经验：GCC 列出现 System.gc() 时先改代码，那不是内存不够，是有人在替 JVM 做决定。'
      },

      /* ================= 5. 内核参数与持久化 ================= */
      {
        id: 'perf-kernel-tuning',
        cat: 'perf',
        title: '内核参数改完就生效了？不落盘，重启全白调',
        prompt: '压测时客户端开始零星报连接超时，运维在群里说"把内核参数调一下"。上个月有人只改了运行时值，机器一重启又全回到默认，复盘时谁都说不出改过什么。',
        task: '先看清现在生效的值，再把参数落到开机加载的配置文件里，最后验收一遍',
        steps: [
          { title: '把关键参数的现状记下来', about: '队列长度、换页倾向、系统级句柄上限', cmd: 'sysctl -a | grep -E "somaxconn|swappiness|file-max"', ref: 'pf-sysctl', hint: ['调参之前先记现状：队列长度、换页倾向、系统级句柄上限，这三个数就是日后回滚和对比的依据。', 'sysctl -a | grep -E "____|swappiness|file-max"'], note: 'somaxconn 32768、swappiness 60、file-max 2097152 —— 先截图存档，调完要拿这三个数对比' },
          { title: '先改一次运行时值', about: '把全连接队列上限抬到 65535，立刻生效', cmd: 'sysctl -w net.core.somaxconn=65535', ref: 'pf-somaxconn', hint: ['改运行时值只影响当前内核，机器一重启就回到默认 —— 这一步只是让你看到改动确实立刻生效。', 'sysctl -w net.core.somaxconn=____'], note: '立刻生效，但没有落盘 —— 重启就没了，这就是"白调"的来源' },
          { title: '确认运行时值真的变了', about: '再取一次值，做最小验收', cmd: 'sysctl -n net.core.somaxconn', ref: 'pf-somaxconn', hint: ['别相信"改完就完了"：再取一次值确认它真的变了，这一步是所有调参动作的验收动作。', 'sysctl -n net.core.____'], note: '65535 已生效；但换一个登录会话（等价于重启）再看，它已经回到 32768 —— 因为它只活在运行时' },
          { title: '写进配置文件并立即加载', about: '让参数活过重启，并让内核重新读一遍', cmd: 'echo "net.core.somaxconn = 65535" > /etc/sysctl.d/99-tuning.conf && echo "fs.file-max = 4194304" >> /etc/sysctl.d/99-tuning.conf && sysctl --system', ref: 'pf-sysctl', hint: ['要让它活过重启，就得落成一个配置文件，再让内核按目录里的文件重新读一遍。', 'echo "net.core.somaxconn = 65535" > /etc/sysctl.d/99-tuning.conf && echo "fs.file-max = 4194304" >> /etc/sysctl.d/99-tuning.conf && sysctl ____'], note: 'sysctl --system 会把 /etc/sysctl.d/*.conf 按文件名顺序全部加载 —— 同名参数由排在最后的文件说了算' },
          { title: '验收文件里的另一项', about: '确认从文件加载的系统级句柄上限', cmd: 'sysctl -n fs.file-max', ref: 'pf-file-max', hint: ['同一个文件里不止一项，逐项验收：文件写了不等于生效，同名项被别的文件覆盖是最常见的坑。', 'sysctl -n fs.____'], note: '4194304 已生效（基线是 2097152）—— 这一次是配置文件带来的，重启后依然在' },
          { title: '留档：把配置文件读出来', about: '这台机器被改过什么，一眼能看全', cmd: 'cat /etc/sysctl.d/99-tuning.conf', ref: 'pf-sysctl', hint: ['最后把配置文件读出来存档：出了事故要能一眼看出这台机器被谁改过什么参数。', 'cat /etc/sysctl.d/____'], note: '两行参数就是本次变更记录 —— 贴进变更单，比在群里说一句"我调过了"强得多' }
        ],
        answer: 'sysctl -a | grep -E "somaxconn|swappiness|file-max" && sysctl -w net.core.somaxconn=65535 && sysctl -n net.core.somaxconn && echo "net.core.somaxconn = 65535" > /etc/sysctl.d/99-tuning.conf && echo "fs.file-max = 4194304" >> /etc/sysctl.d/99-tuning.conf && sysctl --system && sysctl -n fs.file-max && cat /etc/sysctl.d/99-tuning.conf',
        alt: ['sysctl -n net.core.somaxconn && sysctl -w net.core.somaxconn=65535 && echo "net.core.somaxconn = 65535" > /etc/sysctl.d/99-tuning.conf && sysctl -p /etc/sysctl.d/99-tuning.conf && sysctl -n net.core.somaxconn'],
        expect: /net\.core\.somaxconn = 65535/,
        teach: 'sysctl -w 只改当前运行时的值，重启就回到默认 —— 这就是"调完白调"的来源。要活过重启必须落成配置文件（/etc/sysctl.d/ 下的 *.conf），再用 sysctl --system 或 sysctl -p 加载一次，而且**加载之后必须再验收一遍生效值**。还有一个容易吃亏的细节：这个目录是按文件名顺序加载的，同名参数由排在最后的文件说了算 —— 新建调优文件时名字要排到后面，否则你写了也不生效（生产上更稳的做法是别动别人已有的文件，自己新建一个序号更大的）。'
      },

      /* ================= 6. 压测侧的假瓶颈 ================= */
      {
        id: 'perf-client-side',
        cat: 'perf',
        title: 'QPS 卡在 2600 上不去：先排除压测机自己的问题',
        prompt: '这台 2 核机器既跑业务又当压测机：接口每秒请求数怎么调都卡在 2600，top 里 CPU 只用了 34%。领导准备批预算扩容，你先得证明锅不在链路和压测机上。',
        task: '依次排除链路、连接数与 CPU 争抢三类压测侧因素，再决定要不要扩容',
        steps: [
          { title: '先看这条内网链路的基本质量', about: '同可用区目标主机是否可达、往返多少毫秒', cmd: 'ping -c 2 10.0.1.24', ref: 'pf-iperf3', hint: ['压测前先确认目标可达：同可用区内的往返延迟应该是零点几毫秒，这个数不正常后面所有数字都不用看。', 'ping -c ____ 10.0.1.24'], note: '平均 0.042ms —— 同可用区，链路本身没有问题' },
          { title: '量一次真实带宽', about: '两台主机之间到底能跑多少兆比特每秒', cmd: 'iperf3 -c 10.0.1.24 -t 30 -P 4', ref: 'pf-iperf3', hint: ['接口请求数上不去，先确认管道有多粗：多流并发压 30 秒，看合计带宽是不是已经接近网卡线速。', 'iperf3 -c 10.0.1.24 -t 30 ____ 4'], note: '四条流合计 941.4 Mbits/sec ≈ 千兆线速，说明瓶颈不在网络这一段' },
          { title: '看对公网的下游链路质量', about: '逐跳的丢包率与延迟跳变发生在哪一跳', cmd: 'mtr -r -c 100 -n 119.29.29.29', ref: 'pf-mtr', hint: ['订单要调外部支付网关，公网这一段也得量：跑 100 次看每一跳的丢包率与延迟，确认问题出在哪一段。', 'mtr -r -c ____ -n 119.29.29.29'], note: '第 4 跳起延迟从 0.4ms 跳到 8.4ms（公网出口）；中间跳 0.4%/1.2% 丢包、末跳不丢 —— 属于正常的 ICMP 限速' },
          { title: '看连接状态汇总', about: '已建立连接与待回收连接各有多少', cmd: 'ss -s', ref: 'pf-ss-summary', hint: ['再看连接侧：已建立的有多少、处在待回收状态的有多少 —— 短连接压测时后者堆积会吃掉本地端口。', 'ss ____'], note: 'established 4、timewait 6 —— 连接数远没到瓶颈，端口也没被耗尽' },
          { title: '把待回收连接精确数一遍', about: '短连接压测最容易堆起来的那些连接', cmd: 'ss -tan state time-wait | wc -l', ref: 'pf-tcp-tw-reuse', hint: ['汇总里那一类连接要单独数：短连接压测时它会堆到几万，最后表现为本地端口被耗尽。', 'ss -tan state time-wait | ____ -l'], note: '只有 7 行（还含一行表头）—— 这台机器现在没有端口耗尽风险，写脚本统计时记得把表头减掉' },
          { title: '看业务进程占着哪几个核', about: '进程当前的 CPU 亲和性掩码', cmd: 'taskset -p 18442', ref: 'pf-taskset', hint: ['最后一条线索在 CPU 侧：进程默认可以在全部核上跑，压测工具和业务抢同一批核，两边都会变慢。', 'taskset -p ____'], note: '掩码 3 = 0~1 号核，也就是两个核都能用 —— 2 核机器既跑业务又压测，这里才是真正的瓶颈' }
        ],
        answer: 'ping -c 2 10.0.1.24 && iperf3 -c 10.0.1.24 -t 30 -P 4 && mtr -r -c 100 -n 119.29.29.29 && ss -s && ss -tan state time-wait | wc -l && taskset -p 18442',
        alt: ['ping -c 2 10.0.1.24 && iperf3 -c 10.0.1.24 -t 30 -P 4 && ss -s && taskset -p 18442'],
        expect: /941\.4/,
        teach: '压测数字上不去时，先排除压测侧的三件事：链路（带宽到底有多少、丢包在哪一跳）、连接（待回收连接与本地端口够不够）、CPU（压测工具和业务进程是不是在抢同一批核）。这三件事都不查就断言"服务只能扛这么多"，扩容和加机器都是在花冤枉钱。反过来也一样：真到了要扩容的时候，你得先能证明瓶颈在服务端，否则新机器上线后数字不会变。'
      },

      {
        id: 'perf-capacity-baseline',
        cat: 'perf',
        title: '这台机器扛不扛得住：先量出它的"额定值"',
        prompt: '业务要上线，问你"这台 2 核 8G 的机器够不够"。**拍脑袋答"应该够"是不负责任的。** 你手上没有压测工具也没关系 —— **先把这台机器的"额定值"量出来，后面才有对比的基准。**',
        task: '量出 CPU 核数、负载、内存真实余量，并看当前最耗资源的进程是谁',
        steps: [
          { title: '先看有几个核', about: '负载必须与核数一起看', cmd: 'nproc', ref: 'mo-nproc', hint: ['第一件事量"额定值"：这台机器有几个 CPU 核 —— **负载数字只有配上核数才有意义**', '____'], note: '**2 核意味着"负载 2.0 就是满载"** —— 脱离核数谈负载高低是没有意义的' },
          { title: '看当前负载', about: '1/5/15 分钟三个数各有含义', cmd: 'uptime', ref: 'mo-top', hint: ['接着看负载：三个数字分别是 1、5、15 分钟的平均值 —— **单看第一个会被瞬时抖动骗到**', '____'], note: '`load average: 0.42, 0.68, 0.71` —— **三个数都低于核数（2）说明还很闲**；如果 1 分钟远高于 15 分钟，说明负载正在爬升' },
          { title: '看内存的真实余量', about: 'available 才是可用内存', cmd: 'free -h', ref: 'mo-free', hint: ['第三个额定值：内存 —— **注意列名：`free` 与 `available` 是完全不同的两个数**', 'free ____'], note: '`free 402Mi` 看着快满了，但 **`available 1.1Gi` 才是"还能给新进程用多少"** —— buff/cache 是可以随时回收的' },
          { title: '看最耗 CPU 的进程', about: '负载高时先找谁在吃', cmd: 'top -bn1 | head -5', ref: 'mo-top', hint: ['`-b` 是批处理模式（不进入交互界面）、`-n1` 只采一次 —— 这样就能在脚本里用；先看头部几行', 'top -bn1 | ____ -5'], note: '**`%Cpu(s)` 那行拆得很细**：`us` 用户态、`sy` 内核态、`wa` 等 IO、`id` 空闲 —— **`wa` 高说明瓶颈在磁盘而不是 CPU**' },
          { title: '看谁在吃内存', about: '与 CPU 视角不同', cmd: 'ps aux --sort=-%mem | head -5', ref: 'mo-ps', hint: ['换个维度：按内存占用倒序排前几名 —— **CPU 高与内存高的往往不是同一个进程**', 'ps aux ____=-%mem | head -5'], note: '**`--sort=-%mem` 前面的减号表示降序**（`+` 是升序）；`RSS` 列是实际占用的物理内存' }
        ],
        answer: 'uptime && free -h',
        alt: [
          'uptime && free -h',
          'nproc && uptime'
        ],
        expect: /load average|Mem:|MiB/,
        teach: '**容量评估的第一步是"量出额定值"，而不是直接压测 —— 因为没有基准的压测结果无法解读。** **三个额定值**：**CPU 核数（`nproc`）**、**内存总量与可用量（`free -h`）**、**磁盘容量与 IO 能力（`df -h` / `iostat`）**。**负载必须与核数一起看**：`load average` 是"处于可运行状态 + 等待 IO 的进程数"的移动平均，**负载 4.0 在 4 核上是满载、在 16 核上只到 1/4** —— 所以"负载高不高"这个问题本身不成立，要问"相对核数高不高"。**1/5/15 三个数的读法**：**只看 1 分钟会被抖动骗**（备份脚本跑一下就冲高）；**15 分钟高而 1 分钟低说明系统正在恢复**（之前的压力退了）；**1 分钟高而 15 分钟低说明压力刚来** —— 后者才是要警惕的。**内存那两列的区别是本节最实用的知识点**：**`free` 是"完全没被用"的内存，`available` 是"新进程能要到多少"** —— Linux 会把空闲内存拿去做文件缓存（`buff/cache`），**这部分随时可回收**，所以 `free` 很小完全正常。**看到 `free` 小就"内存不足"是最常见的误判**；真正该看的是 **`available` 逼近 0、或 `swap` 在被大量使用**（后者意味着物理内存确实不够，性能会断崖下跌）。**`top` 头部那行 `%Cpu(s)` 是排方向的利器**：**`us` 高** = 应用在算（优化代码或加 CPU）；**`sy` 高** = 系统调用多（常与 IO、网络、容器相关）；**`wa` 高** = **CPU 在等磁盘**（瓶颈是磁盘，加 CPU 没用）；**`st`（steal）高** = **虚拟机被宿主抢了 CPU**（云主机性能不稳定的常见原因，宿主超卖）。**最后一条与"够不够"直接相关的方法**：**先量额定值 → 再用压测找拐点 → 再乘上安全系数**。经验上单机长期负载控制在 **70% 以内**比较稳（留出突发与故障转移余量）；而**真正的结论必须来自压测**：本站 `perf` 分类有专门一课讲怎么用 `ab` 找拐点 —— 那一课之所以是 L3，就是因为它需要先有这里的基准概念。'
      }

  );
})();
