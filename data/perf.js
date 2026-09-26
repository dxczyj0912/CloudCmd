/* data/perf.js · 分类 18 性能压测与调优 */
(function () {
  'use strict';

  var catId = 'perf';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. 压测 ================= */

    /* ---------- 1 / 25 ---------- */
    {
      id: 'pf-ab',
      name: 'ab',
      alias: ['ApacheBench', 'ab -n -c', 'HTTP 压测'],
      level: 2,
      syntax: 'ab -n <总请求数> -c <并发数> [-k] [-T <Content-Type>] [-p <POST数据文件>] <URL>',
      summary: '最轻量的 HTTP 压测工具，快速验证接口 QPS 与响应时间基线。',
      desc: 'ab 是 Apache 自带的小工具，单命令就能给出"每秒请求数、平均响应时间、P50/P90/P99、失败请求数"，适合冒烟级别验证和回归对比。它的短板是**单进程单线程**，压测能力受自身限制：在普通 4 核虚拟机上并发到几百就很难再往上，压出来的数字往往是"压测机先到瓶颈"而不是被测服务。\n\n正确用法是"小并发看延迟、逐步加并发看拐点"：先用 `-c 10` 看单请求延迟是否正常，再以 50、100、200 递增观察 QPS 与 P99 的变化，找到 QPS 不再上升而延迟陡增的那个点，就是服务的实际容量拐点。\n\n`-k` 开启 HTTP keep-alive，能排除 TCP 握手开销，更真实地反映服务处理能力；不开启时压测结果会被三次握手摊薄，QPS 明显偏低。',
      params: [
        { flag: '-n <数值>', desc: '总请求数，压测规模，建议至少 1000 以上才有统计意义' },
        { flag: '-c <数值>', desc: '并发数，同时保持的连接数，不要超过压测机与服务端的承载能力' },
        { flag: '-k', desc: '启用 HTTP KeepAlive，去掉建连开销，测服务真实处理能力' },
        { flag: '-T <类型>', desc: '设置 Content-Type，POST 场景必须，如 `application/json`' },
        { flag: '-p <文件>', desc: 'POST 请求体文件，配合 `-T` 使用' },
        { flag: '-H "<头>"', desc: '附加请求头，如 `-H "Authorization: Bearer abc"`' },
        { flag: '-s <秒>', desc: '单请求超时时间，默认 30 秒，压测时建议调小避免长时间挂住' }
      ],
      examples: [
        { cmd: 'ab -n 1000 -c 10 -k http://10.0.1.23/api/health', desc: '基线压测：小并发测单请求延迟，确认服务健康' },
        { cmd: 'ab -n 10000 -c 100 -k http://10.0.1.23/api/orders', desc: '中等并发压测，看 QPS 与 P99 延迟的拐点' },
        { cmd: 'ab -n 2000 -c 50 -T application/json -p /tmp/order.json http://10.0.1.23/api/orders', desc: '压测 POST 接口，请求体从文件读取' },
        { cmd: 'ab -n 1000 -c 50 -k -H "Host: www.example.com" http://10.0.1.23/', desc: '带 Host 头压测，验证 Nginx 虚拟主机配置下的性能' }
      ],
      notes: [
        '**压测只对自有系统进行**：对第三方站点压测等同于发起攻击，可能触发对方的防护与法律追责',
        'ab 是单线程工具，**压测机 CPU 先跑满时结果无效**：先看压测过程中 `top` 里 ab 进程的 CPU，接近 100% 就该换 wrk 或加多台压测机',
        '不加 `-k` 时结果包含 TCP 建连开销，QPS 会明显偏低，容易被误读为服务性能差',
        '结果里的 `Failed requests` 非 0 要看原因：`Length` 多为响应体长度不一致（正常，如动态内容），`Connect`/`Receive` 才是真错误',
        '压测会真实写入数据（下单、注册等），务必使用测试环境或用只读接口；压生产要有明确授权与回滚方案',
        '默认 30 秒超时可能让结果长时间挂住，建议显式加 `-s 10`'
      ],
      related: ['pf-wrk', 'pf-hey', 'pf-siege', 'pf-ulimit-n'],
      docs: 'https://httpd.apache.org/docs/2.4/programs/ab.html',
      tags: ['压测', 'HTTP', 'QPS', '基线']
    },

    /* ---------- 2 / 25 ---------- */
    {
      id: 'pf-wrk',
      name: 'wrk',
      alias: ['wrk -t -c -d', '高性能压测', 'Lua 压测脚本'],
      level: 3,
      syntax: 'wrk -t<线程数> -c<连接数> -d<时长> [--latency] [--timeout <秒>] [-s <脚本>] <URL>',
      summary: '多线程高并发压测工具，能用 Lua 脚本构造复杂请求与动态参数。',
      desc: 'wrk 用 epoll + 多线程，单机就能压出几十万 QPS，是 ab 的升级替代。`-t` 是线程数（通常设为 CPU 核数），`-c` 是总连接数，`-d` 是持续时长。加上 `--latency` 才会打印延迟分布（P50/P75/P90/P99），不加只能看到平均值——而平均值会掩盖长尾问题，生产排障必须看 P99。\n\nLua 脚本是 wrk 的核心竞争力：可以给每次请求生成随机参数、设置动态 Header、在 `done()` 里汇总统计。这让它既能压静态接口，也能压带鉴权的真实业务接口。\n\n判读结果的关键是"延迟与 QPS 是否稳定"：QPS 平稳、P99 在可接受范围内说明容量充足；QPS 抖动大或 P99 是 P50 的十倍以上，说明有排队、锁竞争或下游瓶颈。',
      params: [
        { flag: '-t<数值>', desc: '线程数，一般设为压测机 CPU 核数，超过核数没有收益' },
        { flag: '-c<数值>', desc: '并发连接总数，必须远大于线程数才有意义，如 `-t4 -c400`' },
        { flag: '-d<时长>', desc: '压测持续时间，如 `30s`、`2m`；建议不少于 30 秒以覆盖预热' },
        { flag: '--latency', desc: '打印完整延迟分布，排查长尾必加' },
        { flag: '--timeout <秒>', desc: '超时时间，默认 2 秒；压后端慢接口时要适当调大' },
        { flag: '-s <脚本>', desc: '指定 Lua 脚本，用于动态参数、鉴权与自定义统计' },
        { flag: '-H "<头>"', desc: '添加请求头，可重复多次' }
      ],
      examples: [
        { cmd: 'wrk -t4 -c400 -d30s --latency http://10.0.1.23/api/health', desc: '4 线程 400 连接压 30 秒并输出延迟分布' },
        { cmd: 'wrk -t8 -c1000 -d60s --latency --timeout 5s http://10.0.1.23/api/orders', desc: '高并发长时长压测，观察稳定状态下的表现' },
        { cmd: 'wrk -t4 -c200 -d30s --latency -s /tmp/post.lua http://10.0.1.23/api/orders', desc: '用 Lua 脚本压测带 JSON 请求体的 POST 接口' },
        { cmd: 'wrk -t4 -c200 -d30s --latency -H "Authorization: Bearer <访问令牌>" http://10.0.1.23/api/profile', desc: '带鉴权头压测需要登录的接口' }
      ],
      notes: [
        '**必须监控压测机自身的 CPU 与网络**：wrk 吃满 CPU 或打满网卡时压出的数字是压测机的上限，不是服务的能力上限',
        '不加 `--latency` 只看平均值会被长尾掩盖，**生产容量评估必须以 P99 为准**',
        '`-c` 设得过大可能耗尽压测机的可用端口与文件句柄，压测前先调 `ulimit -n`（见 `pf-ulimit-n`）',
        '**只对自有系统压测**，未经授权对他人系统施压属于违法行为',
        'CentOS/Ubuntu 官方源通常没有 wrk，需要从源码编译或使用第三方仓库',
        '压测结果受客户端到服务端的网络影响很大，跨公网压测的数字参考价值有限，应在同可用区内进行'
      ],
      related: ['pf-ab', 'pf-hey', 'pf-ulimit-n', 'pf-ss-summary'],
      docs: 'https://github.com/wg/wrk',
      tags: ['压测', '高并发', 'P99', 'Lua']
    },

    /* ---------- 3 / 25 ---------- */
    {
      id: 'pf-hey',
      name: 'hey',
      alias: ['hey -n -c', 'Go 压测工具', 'hey -z'],
      level: 2,
      syntax: 'hey -n <请求数> -c <并发数> [-z <时长>] [-m <方法>] [-d <请求体>] [-H "<头>"] <URL>',
      summary: 'Go 写的轻量压测工具，单文件部署且能直接输出延迟直方图。',
      desc: 'hey 是 ab 的现代替代品：单个静态二进制、无依赖、天然支持多核并发，输出直接带延迟直方图（每档延迟的请求数分布），比 ab 的汇总数字更直观。\n\n它的典型使用场景是容器与 CI 环境：把 hey 二进制拷进容器就能压测，不需要装 Apache 工具集。`-z` 参数按持续时间压测（如 `-z 30s`），比固定请求数更贴近真实流量；`-n` 与 `-z` 二选一。\n\n输出里的 `Status code distribution` 要重点看：出现 5xx 说明服务在高并发下已经开始报错，此时即使 QPS 好看也没有意义。',
      params: [
        { flag: '-n <数值>', desc: '总请求数，与 `-z` 二选一' },
        { flag: '-c <数值>', desc: '并发工作协程数，默认 50' },
        { flag: '-z <时长>', desc: '持续压测时长，如 `30s`、`1m`，与 `-n` 互斥' },
        { flag: '-m <方法>', desc: 'HTTP 方法，默认 GET，POST/PUT 时使用' },
        { flag: '-d <内容>', desc: '请求体，POST 时配合 `-m POST`' },
        { flag: '-T <类型>', desc: 'Content-Type，默认 text/html' },
        { flag: '-H "<头>"', desc: '自定义请求头，可重复；`-H "Host: a.com"` 常用于测虚拟主机' },
        { flag: '-disable-keepalive', desc: '关闭长连接，用于模拟短连接场景' }
      ],
      examples: [
        { cmd: 'hey -n 5000 -c 50 http://10.0.1.23/api/health', desc: '基础压测并输出延迟直方图' },
        { cmd: 'hey -z 30s -c 100 http://10.0.1.23/api/orders', desc: '按时长压测 30 秒，更接近真实流量形态' },
        { cmd: 'hey -n 2000 -c 20 -m POST -T application/json -d "{\\"userId\\":1}" http://10.0.1.23/api/orders', desc: '压测 POST JSON 接口' },
        { cmd: 'hey -n 3000 -c 50 -H "Authorization: Bearer <访问令牌>" http://10.0.1.23/api/profile', desc: '带鉴权头压测登录后接口' }
      ],
      notes: [
        '**只对自有或已获授权的系统压测**，对第三方施压可能构成攻击行为',
        '输出中的 5xx 分布是服务已经扛不住的直接证据，此时 QPS 数字再高也没有参考价值',
        '默认关闭了部分 HTTP/2 特性，测 HTTP/2 服务时结果可能与真实客户端有差异',
        '`-n` 与 `-z` 不能同时使用，同时给会直接报错',
        '压测机自身 CPU 打满时结果同样无效，压测期间要同步观察压测机的负载',
        'hey 的安装方式是下载官方 Release 的单个二进制，不需要包管理器；放到 `/usr/local/bin` 即可全局使用'
      ],
      related: ['pf-wrk', 'pf-ab', 'pf-siege', 'pf-locust'],
      docs: 'https://github.com/rakyll/hey',
      tags: ['压测', 'HTTP', '延迟直方图', 'Go']
    },

    /* ---------- 4 / 25 ---------- */
    {
      id: 'pf-siege',
      name: 'siege',
      alias: ['siege -c -t', '多 URL 压测', 'siege 基准测试'],
      level: 2,
      syntax: 'siege -c <并发数> -t <时长> [-i] [-f <URL列表文件>] [-b] <URL>',
      summary: '支持从文件读多个 URL 轮换压测，适合模拟混合业务场景。',
      desc: 'siege 的特点是能把一批 URL 放在文件里循环请求，模拟"首页 + 列表页 + 详情页 + 接口"的真实混合流量，而不是盯着一个接口猛压。`-i` 表示随机挑选 URL，`-b` 表示不做请求间延迟（默认每个用户请求之间有 1 秒左右停顿，很多人误以为 siege 性能差，其实是这个默认行为导致的）。\n\n输出会给出 `Transactions`（完成的事务数）、`Availability`（成功率）、`Response time`、`Transaction rate`（每秒事务数）以及最长/最短响应时间。\n\n排查时优先看 `Availability`：低于 100% 说明有请求失败，结合 `-v` 或 `--log` 把失败详情记录下来。',
      params: [
        { flag: '-c <数值>', desc: '并发用户数' },
        { flag: '-t <时长>', desc: '压测时长，如 `30S`、`5M`' },
        { flag: '-r <次数>', desc: '每个用户重复执行的轮次，与 `-t` 二选一' },
        { flag: '-f <文件>', desc: 'URL 列表文件，每行一个地址' },
        { flag: '-i', desc: '随机选取 URL，模拟真实用户跳转' },
        { flag: '-b', desc: '关闭请求间延迟（benchmark 模式），否则默认每个请求间隔约 1 秒' },
        { flag: '--log=<文件>', desc: '记录每个请求的结果，便于分析失败原因' }
      ],
      examples: [
        { cmd: 'siege -c 50 -t 1M -b http://10.0.1.23/api/health', desc: '50 并发压 1 分钟，`-b` 关闭请求间延迟' },
        { cmd: 'printf "http://10.0.1.23/\\nhttp://10.0.1.23/list\\nhttp://10.0.1.23/api/orders\\n" > /tmp/urls.txt && siege -c 30 -t 2M -i -f /tmp/urls.txt', desc: '生成 URL 列表并随机轮换压测，模拟混合业务流量' },
        { cmd: 'siege -c 100 -r 20 -b --log=/tmp/siege.log http://10.0.1.23/', desc: '固定轮次压测并记录日志，便于查失败请求' }
      ],
      notes: [
        '**不加 `-b` 时 siege 默认在每个请求之间停顿约 1 秒**，测出的 QPS 会低得离谱，压测时必须加 `-b`',
        '**只对自有系统压测**，多 URL 压测同样属于主动施压行为，需事先授权',
        'URL 列表文件要写完整地址（含 `http://`），写成相对路径会直接报错',
        '`Availability` 小于 100% 时要看日志定位失败原因（超时、连接拒绝还是 5xx）',
        'siege 默认会检查 `robots.txt` 之外的 URL 但不做爬取，压测前建议用 `-g` 先把待压 URL 列出来核对，避免压到管理后台或删除类接口',
        '高并发下 siege 自身也可能成为瓶颈，`-c` 超过 200 后结果参考价值下降'
      ],
      related: ['pf-ab', 'pf-wrk', 'pf-hey', 'pf-mtr'],
      docs: 'https://manpages.debian.org/bookworm/siege/siege.1.en.html',
      tags: ['压测', '混合流量', '多URL', '并发']
    },

    /* ---------- 5 / 25 ---------- */
    {
      id: 'pf-jmeter',
      name: 'jmeter -n -t -l',
      alias: ['JMeter 无界面模式', 'jmeter 命令行压测', 'JMeter 报告'],
      level: 3,
      syntax: 'jmeter -n -t <测试计划.jmx> -l <结果.jtl> [-e -o <报告目录>] [-J<属性>=<值>] [-R <远程节点>]',
      summary: '无界面跑 JMeter 测试计划，适合接口级压测与 CI 中的性能回归。',
      desc: 'JMeter 图形界面只用来**编写**测试计划，真正的压测必须在命令行执行：图形界面本身消耗资源，会严重影响压测结果的准确性。`-n` 就是 non-GUI 模式，`-t` 指定 `.jmx` 计划文件，`-l` 输出原始结果，再加 `-e -o` 直接生成 HTML 报告。\n\n它的优势在于**协议覆盖广**（HTTP、JDBC、JMS、gRPC 插件）与**参数化能力强**（CSV 数据驱动、关联提取、断言），适合做贴近真实业务的接口链路压测；也能用 `-R` 做分布式压测，用多台压力机突破单机瓶颈。\n\n常见坑是结果文件：`.jtl` 里包含每次请求的明细，压测规模大时会生成几 GB 的文件，压测前要评估磁盘空间。另外分布式压测要求所有压力机与 master 的 JMeter 版本、JDK 版本、插件完全一致。',
      params: [
        { flag: '-n', desc: '非 GUI 模式，压测必须使用' },
        { flag: '-t <文件>', desc: '测试计划文件（.jmx），在图形界面里做好后导出' },
        { flag: '-l <文件>', desc: '结果文件（.jtl），必须是不存在的文件，否则会报错' },
        { flag: '-e -o <目录>', desc: '压测结束后生成 HTML 报告，目录必须为空或不存在' },
        { flag: '-J<属性>=<值>', desc: '覆盖计划里的属性，如 `-Jthreads=200 -Jduration=300`' },
        { flag: '-R <节点列表>', desc: '指定远程压力机做分布式压测，如 `-R 10.0.1.31,10.0.1.32`' },
        { flag: '-G<属性>=<值>', desc: '给所有远程节点设置属性' }
      ],
      examples: [
        { cmd: 'jmeter -n -t /opt/jmeter/plan/order-api.jmx -l /tmp/result.jtl -e -o /tmp/report', desc: '无界面执行计划并生成 HTML 报告' },
        { cmd: 'jmeter -n -t /opt/jmeter/plan/order-api.jmx -Jthreads=200 -Jduration=300 -l /tmp/result.jtl', desc: '通过命令行覆盖线程数与时长，同一计划压不同规模' },
        { cmd: 'jmeter -n -t /opt/jmeter/plan/order-api.jmx -R 10.0.1.31,10.0.1.32 -l /tmp/result.jtl -e -o /tmp/report', desc: '两台压力机分布式压测，突破单机瓶颈' },
        { cmd: 'head -1 /tmp/result.jtl', desc: '查看结果文件表头，确认采集到了哪些字段' }
      ],
      notes: [
        '**绝不要在 GUI 模式下做正式压测**：图形界面本身的渲染开销会严重扭曲结果，GUI 只用于编写与调试计划',
        '`-l` 指定的结果文件**必须不存在**，重复执行时要换文件名或先删除，否则 JMeter 直接报错退出',
        '`-o` 报告目录**必须为空**，否则同样报错；CI 中常用时间戳做目录名',
        '**`.jtl` 文件可能非常大**（每次请求一行），压测前确认磁盘空间，必要时在计划中只保留统计汇总',
        '分布式压测要求 master 与 slave 的 JMeter 版本、JDK 版本、插件、`jmeter-server` 端口全部一致，不一致会出现难以定位的诡异错误',
        '压测机要调大文件句柄与可用端口（见 `pf-ulimit-n`），否则高并发时会大量报连接失败，被误判为服务端问题',
        '压测数据准备很关键：用 CSV 数据驱动时，样本要足够多以覆盖不同分支，否则压出来的只是缓存命中率'
      ],
      related: ['pf-locust', 'pf-wrk', 'pf-ulimit-n', 'pf-jstat'],
      docs: 'https://jmeter.apache.org/usermanual/get-started.html',
      tags: ['压测', '接口链路', '分布式', 'CI']
    },

    /* ---------- 6 / 25 ---------- */
    {
      id: 'pf-locust',
      name: 'locust',
      alias: ['locust -f', 'Python 压测', '分布式压测'],
      level: 3,
      syntax: 'locust -f <locustfile.py> [--headless -u <用户数> -r <每秒启动数> -t <时长>] [--host <地址>]',
      summary: '用 Python 代码描述用户行为，压测复杂业务链路并实时看 Web 图表。',
      desc: 'Locust 的核心思路是"用代码定义用户行为"：写一个继承 `HttpUser` 的类，用 `@task` 装饰器描述用户会做哪些操作、各操作权重多少、中间要不要等待。比起 JMeter 的 XML 计划，它更易读、易版本化，也更容易做出"登录 → 浏览 → 加购 → 下单"这类有状态链路。\n\n它天然支持分布式：`--master` 加多个 `--worker` 就能横向扩展压力，Web 界面会实时汇总所有节点的数据。`--headless` 是无界面模式，用于 CI 与脚本化压测。\n\n判读重点同样是分位数：Locust 报告里的 P95/P99 与失败率，比平均响应时间更能反映用户体验。压测期间要注意 Worker 数量与 CPU：Locust 单 Worker 能产生的负载有限，用户数上千时需要多 Worker。',
      params: [
        { flag: '-f <文件>', desc: '指定 locustfile，定义用户行为' },
        { flag: '--headless', desc: '无界面模式，配合 `-u`/`-r`/`-t` 使用' },
        { flag: '-u <数值>', desc: '并发用户总数' },
        { flag: '-r <数值>', desc: '每秒启动的用户数（爬坡速率），避免瞬间冲击' },
        { flag: '-t <时长>', desc: '压测持续时间，如 `5m`' },
        { flag: '--host <地址>', desc: '被测服务的基础地址，代码里用相对路径' },
        { flag: '--master / --worker', desc: '分布式模式的主节点与工作节点' },
        { flag: '--csv=<前缀>', desc: '把统计结果输出为 CSV，便于归档与画趋势图' }
      ],
      examples: [
        { cmd: 'locust -f /opt/locust/order_flow.py --headless -u 200 -r 20 -t 5m --host http://10.0.1.23', desc: '200 用户、每秒起 20 个，压 5 分钟的链路压测' },
        { cmd: 'locust -f /opt/locust/order_flow.py --host http://10.0.1.23', desc: '带 Web 界面启动，浏览器打开 8089 端口实时调节并发' },
        { cmd: 'locust -f /opt/locust/order_flow.py --master --expect-workers 4 --headless -u 2000 -r 50 -t 10m --host http://10.0.1.23', desc: '主节点分布式压测，等 4 个 worker 接入' },
        { cmd: 'locust -f /opt/locust/order_flow.py --worker --master-host 10.0.1.31', desc: '在压力机上启动 worker 加入集群' },
        { cmd: 'locust -f /opt/locust/order_flow.py --headless -u 100 -r 10 -t 2m --csv=/tmp/locust_result --host http://10.0.1.23', desc: '结果输出 CSV，便于接入报表' }
      ],
      notes: [
        '**Web 界面与 `--headless` 不能混用**：脚本化与 CI 场景必须用 `--headless`，否则命令会挂在界面上',
        'Locust 用 Python 的协程（gevent）驱动，**单个 Worker 的实际并发能力受 Python 性能限制**，用户数上千建议提前做分布式',
        '测试代码里要写 `wait_time`（思考时间），否则压出来的是不真实的极限值',
        '**只对自有系统压测**；链路压测会产生真实数据，务必在测试环境或做数据隔离',
        '分布式下 master 只负责调度与汇总，压力由 worker 产生；worker 数量不够时用户数上不去，表现为"启动慢、QPS 上不去"',
        'Locust 2.x 的 API 与 1.x 差异较大，网上的示例代码要先确认版本再抄'
      ],
      related: ['pf-jmeter', 'pf-wrk', 'pf-ab', 'pf-ss-summary'],
      docs: 'https://docs.locust.io/en/stable/quickstart.html',
      tags: ['压测', 'Python', '链路压测', '分布式']
    },

    /* ---------- 7 / 25 ---------- */
    {
      id: 'pf-sysbench',
      name: 'sysbench',
      alias: ['sysbench cpu', 'sysbench fileio', 'sysbench oltp_read_write'],
      level: 3,
      syntax: 'sysbench <cpu|memory|fileio|oltp_read_write> [选项] prepare|run|cleanup',
      summary: '一站式基准测试工具，覆盖 CPU、内存、磁盘与数据库四类场景。',
      desc: 'sysbench 的价值在于"同一把尺子量不同机器"：换机器、换内核参数、换云盘类型后各跑一遍，数字对比就能说明优化是否有效。它分四类测试，每类都是 `prepare` → `run` → `cleanup` 三步（CPU 与内存测试只有 `run`）。\n\n**CPU 测试**：`--cpu-max-prime` 决定计算量，输出 `events per second` 直接反映单核算力，多线程加 `--threads`。\n\n**内存测试**：`--memory-total-size` 与 `--memory-oper`（read/write）测内存带宽与延迟，常用于对比不同实例规格的内存性能。\n\n**fileio 测试**：最贴近真实磁盘评估，关键参数是 `--file-total-size`（测试文件总大小，**必须大于内存**否则测的是缓存）、`--file-test-mode`（`seqwr`/`seqrd`/`rndrd`/`rndwr`/`rndrw`）、`--file-extra-flags=direct`（绕过页缓存）。输出要重点看 IOPS 与 95th percentile 延迟。\n\n**数据库测试**：`oltp_read_write` 是标准 OLTP 混合负载，`--tables`、`--table-size`、`--rand-type` 决定数据分布。压测 MySQL 时要注意：**sysbench 客户端本身也会吃 CPU**，高并发下要盯紧压测机的负载。\n\n统一原则：**测试文件必须大于内存、每次对比只改一个变量、跑之前先预热一轮**。',
      params: [
        { flag: '--threads=<数值>', desc: '并发线程数，CPU 与 OLTP 测试的核心参数' },
        { flag: '--cpu-max-prime=<数值>', desc: 'CPU 测试的质数上限，越大计算量越大' },
        { flag: '--file-total-size=<大小>', desc: 'fileio 测试文件总大小，必须大于内存容量才是真实磁盘性能' },
        { flag: '--file-test-mode=<模式>', desc: '顺序/随机 + 读/写/混合，如 `rndrw` 随机读写混合' },
        { flag: '--file-extra-flags=direct', desc: '直接 IO 绕过页缓存，磁盘真实性能必加' },
        { flag: '--table-size=<行数>', desc: 'OLTP 每张表的行数，数据量要接近生产才有参考价值' },
        { flag: '--rand-type=uniform|pareto', desc: '随机分布类型，`pareto` 更接近真实业务的热点分布' },
        { flag: '--time=<秒>', desc: '压测持续时长' }
      ],
      examples: [
        { cmd: 'sysbench cpu --threads=4 --cpu-max-prime=20000 run', desc: 'CPU 基准测试，看 events per second 对比不同实例' },
        { cmd: 'sysbench memory --threads=4 --memory-total-size=20G --memory-oper=read run', desc: '内存读带宽测试' },
        { cmd: 'sysbench fileio --file-total-size=20G --file-test-mode=rndrw --file-extra-flags=direct --time=60 --threads=8 prepare && sysbench fileio --file-total-size=20G --file-test-mode=rndrw --file-extra-flags=direct --time=60 --threads=8 run && sysbench fileio --file-total-size=20G cleanup', desc: '随机读写磁盘压测完整三步，注意测试文件需大于内存' },
        { cmd: 'sysbench oltp_read_write --mysql-host=10.0.1.24 --mysql-user=bench --mysql-password=<压测账号密码> --mysql-db=benchdb --tables=10 --table-size=1000000 --threads=16 --time=300 prepare', desc: '准备 OLTP 测试数据（1 千万行规模）' },
        { cmd: 'sysbench oltp_read_write --mysql-host=10.0.1.24 --mysql-user=bench --mysql-password=<压测账号密码> --mysql-db=benchdb --tables=10 --table-size=1000000 --threads=16 --time=300 --report-interval=10 run', desc: '跑 OLTP 混合读写压测，每 10 秒输出一次中间结果' }
      ],
      notes: [
        '**fileio 测试文件必须大于内存**，否则测的是页缓存速度而不是磁盘速度，这是最常见的误用',
        'sysbench 会在当前目录生成测试文件，**先 `cd` 到目标磁盘目录且确认空间充足**，否则可能写满系统盘',
        '测完记得 `cleanup`，几十 GB 的测试文件遗忘在数据盘上会引发容量告警',
        '**OLTP 压测的密码写在命令行会被 `ps` 看到**，生产环境建议用 `--mysql-password` 配合权限收紧的测试账号，或改用配置文件',
        'OLTP 压测会对数据库产生真实写入，**绝不要在未评估的生产库上直接跑**；测试数据量要与生产同数量级，否则结论不可信',
        '对比测试时每次只改一个变量（内核参数、云盘类型、实例规格），否则无法归因',
        'CentOS 7 需要 EPEL 源的 1.0 版本，Ubuntu 可以用 `apt install sysbench`，版本差异会导致参数名不同（如 1.0 与 0.4 的差异很大）'
      ],
      related: ['pf-fio', 'ls9-fio', 'ls9-iostat', 'pf-sysctl'],
      docs: 'https://github.com/akopytov/sysbench',
      tags: ['基准测试', 'CPU', '磁盘', '数据库']
    },

    /* ---------- 8 / 25 ---------- */
    {
      id: 'pf-fio',
      name: 'fio',
      alias: ['fio --rw', '磁盘 IOPS 压测', 'IO 基准测试'],
      level: 4,
      syntax: 'fio --name=<任务名> --filename=<设备或文件> --rw=<模式> --bs=<块大小> --iodepth=<队列深度> --runtime=<秒> --direct=1 --ioengine=libaio',
      summary: '最权威的磁盘 IO 压测工具，用真实负载模型测出 IOPS 与延迟。',
      desc: '云盘选型、数据库盘验证、存储性能纠纷，最终都要靠 fio 的数字说话。它能精确控制读写模式、块大小、队列深度、并发数，模拟从 OLTP 随机小 IO 到数据仓库顺序大 IO 的各种负载。\n\n**理解四个核心维度**（这也是判读结果的钥匙）：\n- `--bs`（块大小）：4k 是数据库随机 IO 的典型值，128k~1M 是顺序大 IO 的场景；**随机小 IO 看 IOPS，顺序大 IO 看吞吐 MB/s**。\n- `--rw`（读写模式）：`randread`（随机读，如索引查询）、`randwrite`（随机写，如日志落盘）、`read`/`write`（顺序）、`randrw`（混合，用 `--rwmixread` 控制比例，如 7:3）。\n- `--iodepth`（队列深度）：**这是最容易被忽略的参数**。深度 1 测的是单次 IO 延迟，深度 32/64 才是数据库与虚拟化场景的真实并发，SSD/云盘只有在足够深度下才能跑出标称 IOPS。\n- `--direct=1`：绕过页缓存，**不加重定向缓存测出来的数字全是假的**。\n\n**标准测试流程**：① 确认盘上没有业务数据（或使用独立测试文件）；② 先 `--rw=write --bs=1M` 顺序写做预处理（让 SSD 进入稳定态）；③ 分别跑随机读、随机写、混合读写三组；④ 记录每组 IOPS、带宽、`clat` 平均与 P99 延迟。\n\n**判读要点**：结果里 `iops` 是核心指标，`clat percentiles` 里的 99.00th 才是业务感受的延迟；如果 P99 是平均值的十倍以上，说明盘已经在排队，扩容或调优的必要性很明确。`--latency_percentiles` 与 `--percentile_list` 可自定义关注的分位数。\n\n多任务混合场景可以写 job file 或用 `--numjobs` 起多个进程，模拟多并发业务同时访问一块盘。',
      params: [
        { flag: '--filename=<路径>', desc: '测试目标，可以是块设备（`/dev/vdb`）或文件（`/data/testfile`）' },
        { flag: '--rw=<模式>', desc: '`randread`/`randwrite`/`read`/`write`/`randrw`，决定负载模型' },
        { flag: '--bs=<块大小>', desc: '块大小，`4k` 测 IOPS、`1M` 测顺序带宽，支持 `4k,8k,16k` 递进' },
        { flag: '--iodepth=<深度>', desc: '异步队列深度，1 测延迟、32/64 测并发吞吐，需配合 `--ioengine=libaio`' },
        { flag: '--numjobs=<数量>', desc: '并发进程数，模拟多业务并发访问同一块盘' },
        { flag: '--direct=1', desc: '直接 IO 绕过页缓存，磁盘真实性能测试必加' },
        { flag: '--runtime=<秒> --time_based', desc: '按时长压测而不是按数据量，长稳测试必备' },
        { flag: '--rwmixread=<百分比>', desc: '混合读写中读的比例，如 `70` 表示 7 读 3 写' }
      ],
      examples: [
        { cmd: 'fio --name=randread4k --filename=/data/fio-test --rw=randread --bs=4k --iodepth=32 --numjobs=4 --direct=1 --ioengine=libaio --runtime=60 --time_based --group_reporting', desc: '模拟数据库随机读：4K 块、队列深度 32，看 IOPS 与 P99 延迟' },
        { cmd: 'fio --name=randwrite4k --filename=/data/fio-test --rw=randwrite --bs=4k --iodepth=32 --numjobs=4 --direct=1 --ioengine=libaio --runtime=60 --time_based --group_reporting', desc: '模拟随机写（日志落盘），重点看写 IOPS 是否达到云盘标称值' },
        { cmd: 'fio --name=seqwrite1m --filename=/data/fio-test --rw=write --bs=1M --iodepth=16 --direct=1 --ioengine=libaio --runtime=60 --time_based --group_reporting', desc: '顺序大 IO 写，测吞吐带宽（MB/s）' },
        { cmd: 'fio --name=mix --filename=/data/fio-test --rw=randrw --rwmixread=70 --bs=8k --iodepth=64 --numjobs=8 --direct=1 --ioengine=libaio --runtime=300 --time_based --group_reporting', desc: '模拟 OLTP 混合负载：7 读 3 写、8K 块、长稳 5 分钟' },
        { cmd: 'fio --name=latency --filename=/dev/vdb --rw=randread --bs=4k --iodepth=1 --direct=1 --runtime=30 --time_based', desc: '队列深度 1 的随机读，专测单次 IO 延迟（lat）' },
        { cmd: 'fio --name=check --filename=/data/fio-test --rw=read --size=1G --direct=1 --output-format=json > /tmp/fio.json', desc: '输出 JSON 结果，便于归档与自动化对比' }
      ],
      notes: [
        '**`--filename` 指向块设备会直接覆写数据**：`/dev/vdb` 这类参数一旦写错盘符就是数据毁灭，执行前务必用 `lsblk` 反复确认设备名',
        '**不加 `--direct=1` 时测的是页缓存**，数字可能高出十倍以上，得出的结论完全错误',
        '**`--iodepth=1` 测不出 SSD/云盘的性能**：云盘标称 IOPS 通常是在深度 32 以上测得的，用深度 1 去测然后投诉"盘性能不达标"是常见误会',
        '长时间大压力压测会产生大量写入，**云盘按写入量计费且会消耗 SSD 寿命**，测试规模要提前评估；用完记得删除测试文件',
        '在生产库所在盘上跑压测会直接影响业务，必须在维护窗口或使用独立的测试盘进行',
        '结果里的 `slat`（提交延迟）、`clat`（完成延迟）、`lat`（总延迟）含义不同，**业务延迟看 `lat` 或 `clat`**',
        '`--time_based` 不加时 fio 会在写完指定 size 后停止，长稳测试必须加上',
        '测试前建议先做 `--rw=write --bs=1M` 的预处理写入，让 SSD 进入稳定态，否则会得到偏乐观的初始成绩'
      ],
      related: ['pf-sysbench', 'ls9-fio', 'ls9-iostat', 'ls9-iotop'],
      docs: 'https://fio.readthedocs.io/en/latest/fio_doc.html',
      tags: ['磁盘', 'IOPS', '延迟', '基准测试']
    },

    /* ================= B. 网络与带宽 ================= */

    /* ---------- 9 / 25 ---------- */
    {
      id: 'pf-iperf3',
      name: 'iperf3',
      alias: ['iperf3 -s', 'iperf3 -c', '带宽测试'],
      level: 2,
      syntax: 'iperf3 -s [-p <端口>]  # 服务端；iperf3 -c <服务端IP> [-u] [-b <带宽>] [-t <秒>] [-P <并发>] [-R]',
      summary: '测两台主机之间的真实带宽与抖动，排查网络瓶颈的量化工具。',
      desc: 'iperf3 必须一端做服务端、一端做客户端。默认是 TCP 测试（`-s` / `-c`），输出 `sender` 与 `receiver` 两行速率，两者差异大说明链路有丢包或拥塞。`-u` 切到 UDP 才能测丢包率与抖动（jitter），UDP 模式下必须用 `-b` 指定目标带宽（如 `-b 100M`），否则 iperf 会以极高速率发包，把结果打成一片丢包。\n\n实用技巧：`-P 4` 起多个并发流，单流受 TCP 窗口与主机处理能力限制常常跑不满带宽，多流才能测出链路真实上限；`-R` 反向测试（服务端发送、客户端接收），用于判断"上行还是下行有问题"；`-t 30` 延长测试时间避免受 TCP 慢启动影响。\n\n**排查思路**：内网两台机器实测值远低于网卡标称 → 检查网卡协商速率（`ethtool`）、云平台带宽上限、安全组或流控策略；跨可用区实测偏低属于正常，云厂商的跨 AZ 带宽通常有额外限制与计费。',
      params: [
        { flag: '-s', desc: '以服务端模式启动，等待客户端连接' },
        { flag: '-c <地址>', desc: '客户端模式，指定服务端地址' },
        { flag: '-u', desc: '使用 UDP 测试，可测丢包率与抖动' },
        { flag: '-b <带宽>', desc: 'UDP 模式的目标带宽，如 `100M`、`1G`；TCP 模式下 0 表示不限速' },
        { flag: '-t <秒>', desc: '测试时长，默认 10 秒，建议 30 秒以上' },
        { flag: '-P <数量>', desc: '并发流数量，用于突破单流瓶颈' },
        { flag: '-R', desc: '反向测试：服务端发、客户端收' },
        { flag: '-p <端口>', desc: '指定端口，默认 5201；跨安全组测试时要放行该端口' }
      ],
      examples: [
        { cmd: 'iperf3 -s', desc: '在目标主机上启动服务端，默认监听 5201' },
        { cmd: 'iperf3 -c 10.0.1.24 -t 30 -P 4', desc: '4 并发流压 30 秒，测两台内网主机之间的 TCP 带宽' },
        { cmd: 'iperf3 -c 10.0.1.24 -u -b 100M -t 30', desc: 'UDP 模式按 100M 发包，看丢包率与抖动' },
        { cmd: 'iperf3 -c 10.0.1.24 -R -t 30', desc: '反向测试，判断是发送方向还是接收方向受限' },
        { cmd: 'iperf3 -c 10.0.1.24 -t 30 -P 4 -J > /tmp/iperf.json', desc: '输出 JSON 结果，便于归档与对比' }
      ],
      notes: [
        '**UDP 模式 (`-u`) 必须用 `-b` 限制带宽**，否则会以尽可能快的速度发包，结果全是丢包，还可能冲击网络设备',
        '服务端 5201 端口要在安全组/主机防火墙放行，否则客户端直接报 `Connection refused`；测完记得关闭服务端进程与临时规则',
        '**单流 TCP 常常跑不满带宽**：受 TCP 窗口、RTT 与单核处理能力限制，测链路上限请用 `-P` 多流',
        '默认只测 10 秒，TCP 慢启动还没结束就出结果了，带宽评估建议 `-t 30` 以上',
        '公网跨地域测试结果受中间链路影响很大，且会消耗公网流量费用，**云上按流量计费的链路要谨慎**',
        '云主机的内网带宽受实例规格限制（如 2 vCPU 实例可能只有 1 Gbps 内网带宽），测出偏低先核对规格上限而非怀疑网络故障',
        'iperf 与 iperf3 不兼容：服务端用 iperf3 时客户端也必须用 iperf3'
      ],
      related: ['pf-mtr', 'pf-ss-summary', 'pf-ping-mtu', 'ln-ethtool'],
      docs: 'https://software.es.net/iperf/',
      tags: ['带宽', '网络测试', '丢包', 'UDP']
    },

    /* ---------- 10 / 25 ---------- */
    {
      id: 'pf-mtr',
      name: 'mtr -r -c',
      alias: ['mtr 报告模式', '链路丢包诊断', 'mtr --report'],
      level: 3,
      syntax: 'mtr -r -c <次数> [-n] [-w] [-s <包大小>] <目标>',
      summary: '连续探测整条链路并汇总每跳丢包率，定位网络问题出在哪一段。',
      desc: '`traceroute` 只探一次，网络抖动看不出来；`ping` 只看两端，中间哪一跳出问题不知道。`mtr` 把两者结合：对每一跳持续发包并统计丢包率与延迟，最终给出可读的报告。\n\n`-r`（report）是脚本与工单里必须用的模式：跑完指定次数后一次性输出报告并退出，而不是停在交互界面。`-c 100` 是发包次数，**次数太少统计没有意义**，30~100 次是比较可靠的区间。`-n` 不反解域名，避免 DNS 超时拖慢输出。\n\n**判读方法是关键**：某一跳显示丢包，但**后续所有跳都不丢包**，那是该跳设备对 ICMP 限速，属于正常现象，不是故障；只有从某一跳开始**后面每一跳都持续丢包**，才说明问题确实出在那一段。同时要结合延迟看：某跳延迟突然从 2ms 跳到 80ms 且之后保持，说明拥塞点就在那里。',
      params: [
        { flag: '-r', desc: '报告模式，跑完即退出，脚本与工单取证必加' },
        { flag: '-c <次数>', desc: '每跳发包次数，建议 30~100，次数太少结论不可靠' },
        { flag: '-n', desc: '不做 DNS 反解，输出快且不会被 DNS 卡住' },
        { flag: '-w', desc: '宽输出模式，长域名与长 IP 不会被截断' },
        { flag: '-s <字节>', desc: '指定包大小，如 `-s 1400` 结合 MTU 问题排查' },
        { flag: '-T / -u', desc: '使用 TCP / UDP 探测（默认 ICMP），绕开屏蔽 ICMP 的设备' },
        { flag: '--report-cycles=<次数>', desc: '等价于 `-c`，部分版本使用' }
      ],
      examples: [
        { cmd: 'mtr -r -c 100 -n 119.29.29.29', desc: '对目标跑 100 次并输出报告，定位丢包发生在哪一跳' },
        { cmd: 'mtr -r -c 50 -n -w www.huaweicloud.com', desc: '宽输出报告，域名较长时避免被截断' },
        { cmd: 'mtr -r -c 50 -T -P 443 -n api.example.com', desc: '用 TCP 443 探测，绕开屏蔽 ICMP 的中间设备' },
        { cmd: 'mtr -r -c 50 -s 1400 -n 10.0.2.15', desc: '用接近 MTU 上限的包长探测，辅助判断 MTU 问题' }
      ],
      notes: [
        '**单跳丢包不一定是故障**：中间设备对 ICMP 限速会让某一跳显示高丢包，只要后续跳不丢就属于正常，这是最容易被误判的情况',
        '`-c` 次数太少（如默认的 10）无法反映抖动，正式排查建议 50~100 次',
        '**不要在交互模式下把 mtr 挂着不管**：它会持续发包，脚本与工单里一律用 `-r`',
        'ICMP 被中间设备屏蔽时结果会全是 `???`，改用 `-T`（TCP）或 `-u`（UDP）探测',
        'mtr 依赖 `CAP_NET_RAW` 权限，容器或受限账户下可能无法运行',
        '排查跨云或跨地域问题时，把 mtr 报告与 `ping`、`iperf3` 结果一起提供给云厂商工单，处理效率会明显提高',
        '它只反映"当前时刻"的链路状态，丢包若为间歇性，需要在故障时段抓取才有意义'
      ],
      related: ['pf-iperf3', 'pf-ping-mtu', 'ln-mtr', 'ln-traceroute'],
      docs: 'https://www.bitwizard.nl/mtr/',
      tags: ['链路诊断', '丢包', '网络排查', '报告模式']
    },

    /* ---------- 11 / 25 ---------- */
    {
      id: 'pf-ping-mtu',
      name: 'ping -M do -s',
      alias: ['MTU 探测', '路径 MTU 发现', 'ping 不分片'],
      level: 3,
      syntax: 'ping -M do -s <载荷字节> -c <次数> <目标>',
      summary: '用禁止分片的探测包二分定位路径 MTU，解决"小包通大包断"的怪问题。',
      desc: '"能 ping 通但 SSH 登录卡住""网页打不开但 API 正常"，很多这类问题的根因是 **MTU 不匹配**，常见于 VPN、IPSec 隧道、GRE、容器 overlay 网络（VXLAN 会增加 50 字节开销）。特征是大包被中间设备丢弃且没有正确返回 ICMP 需分片消息，表现为连接建立成功但传输数据时卡死。\n\n**探测方法**：`-M do` 表示禁止分片（do = Don\'t fragment），`-s` 是 ICMP 载荷大小。以太网标准 MTU 1500 → 载荷上限 1472（减去 20 字节 IP 头 + 8 字节 ICMP 头）。逐档测试：\n- `ping -M do -s 1472 -c 2 <IP>` 通 → MTU 至少 1500，正常；\n- 不通而 `-s 1400` 通 → 路径 MTU 在 1400~1472 之间，用二分法继续收敛（1436、1454…）；\n- VXLAN 环境常见结果是 1450 或 1400。\n\n找到实际值后，把对应网卡或隧道的 MTU 调整为该值（`ip link set dev eth0 mtu 1450`），或把 TCP MSS 钳制为 MTU-40（`iptables -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`），后者更常用于网关与云主机。',
      params: [
        { flag: '-M do', desc: '禁止分片（Linux），配合 `-s` 才能测出路径 MTU；BSD/macOS 用 `-D`' },
        { flag: '-s <字节>', desc: 'ICMP 载荷大小，标准以太网最大 1472' },
        { flag: '-c <次数>', desc: '发包次数，探测用 2~3 次即可' },
        { flag: '-W <秒>', desc: '超时时间，探测时调小可以加快收敛速度' },
        { flag: 'ip link set mtu', desc: '调整网卡 MTU 生效的操作命令' },
        { flag: 'TCPMSS --clamp-mss-to-pmtu', desc: '自动按路径 MTU 钳制 TCP MSS，网关场景常用' }
      ],
      examples: [
        { cmd: 'ping -M do -s 1472 -c 2 10.0.2.15', desc: '测标准以太网 MTU 1500 是否可用，不通说明路径 MTU 更小' },
        { cmd: 'ping -M do -s 1400 -c 2 10.0.2.15', desc: '降低载荷重试，用于二分收敛实际路径 MTU' },
        { cmd: 'ping -M do -s 1450 -c 2 10.0.2.15', desc: 'VXLAN overlay 场景常用的探测值（1500-50 开销）' },
        { cmd: 'ip link set dev eth0 mtu 1450', desc: '把网卡 MTU 调整为探测到的路径 MTU（会短暂中断该网卡流量）' },
        { cmd: 'iptables -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu', desc: '网关侧自动钳制 MSS，避免逐台改 MTU' }
      ],
      notes: [
        '**`-s` 是载荷不是总包长**：1472 对应 MTU 1500；写成 `-s 1500` 一定不通，很多人因此误判为网络故障',
        '**不要在远程 SSH 会话里直接改网卡 MTU**：调整瞬间可能导致连接断开，务必在控制台（VNC）或 `nohup`+延时回滚的方式下操作',
        '中间设备屏蔽 ICMP 或返回错误的 ICMP 消息时，即使 MTU 有问题也可能显示"通"，需要结合 `tcpdump` 观察大包是否被丢弃',
        '容器网络（Calico、Flannel VXLAN）MTU 通常要下调 50 字节，配置错误是 K8s 集群里"Pod 间小请求正常、大响应卡死"的典型原因',
        '**只对自有或已授权的主机做 MTU 探测**，大包探测在部分网络会被判定为异常流量',
        'IPv6 不允许中间设备分片，MTU 问题在 IPv6 环境下表现更明显，探测方法相同'
      ],
      related: ['pf-mtr', 'pf-iperf3', 'ln-ping', 'ln-ethtool'],
      docs: 'https://man7.org/linux/man-pages/man8/ping.8.html',
      tags: ['MTU', '网络排查', '分片', '隧道']
    },

    /* ---------- 12 / 25 ---------- */
    {
      id: 'pf-ss-summary',
      name: 'ss -s',
      alias: ['ss 连接数汇总', 'socket 统计', '连接数排查'],
      level: 2,
      syntax: 'ss -s | ss -s -t | ss -tan state time-wait | wc -l',
      summary: '一行输出各类 socket 的汇总数量，快速判断连接数是否异常。',
      desc: '`ss -s` 给出 TCP 总数与各状态分布（`estab` 已建立、`closed`、`orphaned`、`timewait`、`synrecv` 等），是判断"连接数是不是问题"最快的入口。比 `netstat -s` 简洁得多，而且在新内核上性能更好。\n\n**常见判读**：\n- `timewait` 数量巨大（几万）说明短连接频繁，可开启 `tcp_tw_reuse` 或改用长连接；\n- `estab` 数量接近 `ulimit -n` 时，服务很快会出现 `Too many open files`；\n- `synrecv` 持续有值可能正在被 SYN Flood，或半连接队列（`tcp_max_syn_backlog`）过小导致丢连接；\n- `orphaned`（孤儿 socket）多说明应用没有正确关闭连接。\n\n需要看明细时用 `ss -tan` 按状态过滤：`ss -tan state time-wait | wc -l` 精确统计 TIME_WAIT 数量，`ss -tan state established | wc -l` 统计活跃连接。\n\n**排查闭环**：`ss -s` 发现总量异常 → `ss -tanp` 定位到具体进程与端口 → 结合应用日志与 `pf-ulimit-n`、`pf-tcp-tw-reuse` 做针对性优化。',
      params: [
        { flag: '-s', desc: '打印汇总统计，最常用的一行命令' },
        { flag: '-t / -u / -x', desc: '只看 TCP / UDP / Unix socket' },
        { flag: '-a', desc: '显示所有 socket，含监听与已建立' },
        { flag: '-n', desc: '不做域名与服务名反解，输出快且稳定' },
        { flag: '-p', desc: '显示占用 socket 的进程（需要 root）' },
        { flag: 'state time-wait', desc: '按状态过滤，如 `time-wait`、`established`、`syn-recv`' },
        { flag: '-o', desc: '显示定时器信息，可看 TIME_WAIT 剩余时间' }
      ],
      examples: [
        { cmd: 'ss -s', desc: '查看 socket 汇总，快速判断各类状态数量是否正常' },
        { cmd: 'ss -tan state time-wait | wc -l', desc: '精确统计 TIME_WAIT 连接数' },
        { cmd: 'ss -tan state established | wc -l', desc: '统计当前活跃连接数，与容量规划对比' },
        { cmd: 'ss -tanp | grep <服务端口>', desc: '查看某端口上的连接与对应进程（需要 root）' },
        { cmd: 'ss -s && ulimit -n', desc: '组合自查：连接数汇总与句柄上限一起看，判断是否接近瓶颈' }
      ],
      notes: [
        '`ss -s` 输出里的 `closed` 不是错误，只是已关闭但 socket 结构尚未回收的数量',
        '**TIME_WAIT 多不等于故障**：它是 TCP 的正常状态，只有耗尽本地端口或导致无法新建连接时才是问题',
        '`ss -p` 需要 root，普通用户看不到进程信息',
        '统计结果受采样时刻影响，瞬时值波动大时建议连续采样几次（`for i in 1 2 3; do ss -s; sleep 1; done`）',
        '**不要使用已废弃的 `tcp_tw_recycle`**：它在 NAT 环境下会造成连接异常，且在 4.12 之后的内核中已被移除，网上老文章仍在推荐，务必甄别',
        '容器内 `ss -s` 看到的是容器命名空间的连接，排查宿主机整体情况需要在宿主机上执行'
      ],
      related: ['pf-ulimit-n', 'pf-tcp-tw-reuse', 'ln-ss', 'ln-ss-kill'],
      docs: 'https://man7.org/linux/man-pages/man8/ss.8.html',
      tags: ['连接数', 'TIME_WAIT', 'socket', '网络排查']
    },

    /* ================= C. 系统调优 ================= */

    /* ---------- 13 / 25 ---------- */
    {
      id: 'pf-ulimit-n',
      name: 'ulimit -n 与句柄上限持久化',
      kind: 'recipe',
      alias: ['Too many open files', '文件句柄数', 'nofile 限制'],
      level: 3,
      syntax: 'ulimit -n [<数值>] | /etc/security/limits.conf | systemd 单元 LimitNOFILE=<数值>',
      summary: '调整进程可打开的文件句柄上限，解决 "Too many open files" 报错。',
      desc: 'Linux 下"一切皆文件"：每个 TCP 连接、每个打开的文件、每个 epoll 句柄都占用一个文件描述符。默认上限常见是 1024，高并发服务很容易撞到，日志里出现 `Too many open files`、`SocketException: Too many open files`、新连接无法建立，都是这个原因。\n\n**完整的处理链路**（顺序很重要，漏一步就白改）：\n① **确认现状**：`ulimit -n`（当前 shell 的软限制）、`ulimit -Hn`（硬限制）、`cat /proc/<PID>/limits | grep "open files"`（**运行中进程的实际限制**，这是最权威的值）；\n② **看是谁在占句柄**：`ls /proc/<PID>/fd | wc -l` 统计该进程已用数，`lsof -p <PID> | wc -l` 看明细，注意 `lsof +L1` 能发现"已删除但仍被占用"的文件（日志轮转后未 reload 的典型问题）；\n③ **临时提高**：`ulimit -n 65535`（只能在硬限制之内提高，且只对当前 shell 及其子进程生效）；\n④ **持久化（用户级）**：写 `/etc/security/limits.conf` 或 `/etc/security/limits.d/99-nofile.conf`，同时设置 soft 与 hard；\n⑤ **持久化（服务级，最容易漏的一步）**：systemd 管理的服务**不读 limits.conf**，必须在单元文件里设置 `LimitNOFILE=65535`，用 `systemctl edit <服务>` 加 drop-in 后 `systemctl daemon-reload && systemctl restart <服务>`；\n⑥ **验证**：重启服务后重新查 `/proc/<PID>/limits`，确认新值生效；\n⑦ **根治**：如果句柄增长是持续上升而非稳定在高位，说明有连接或文件泄漏，加句柄只是延缓故障，必须查代码里的资源释放。',
      params: [
        { flag: 'ulimit -n', desc: '查看或设置当前 shell 的软限制' },
        { flag: 'ulimit -Hn', desc: '查看硬限制，普通用户无法超过该值' },
        { flag: 'nofile soft/hard', desc: 'limits.conf 中的条目类型，soft 是默认值、hard 是上限' },
        { flag: 'LimitNOFILE=', desc: 'systemd 单元中的句柄上限设置，服务场景的真正生效位置' },
        { flag: 'fs.file-max', desc: '内核级全局句柄上限，通常很大，一般不需要动' },
        { flag: 'lsof +L1', desc: '找出已删除但仍被进程占用的文件，句柄泄漏的经典原因' }
      ],
      examples: [
        { cmd: 'ulimit -n && ulimit -Hn', desc: '查看当前 shell 的软限制与硬限制' },
        { cmd: 'cat /proc/$(pgrep -f myapp | head -1)/limits | grep "open files"', desc: '查看运行中进程的真实句柄上限，排查必查项' },
        { cmd: 'ls /proc/$(pgrep -f myapp | head -1)/fd | wc -l', desc: '统计进程当前已打开的句柄数量，判断是否接近上限' },
        { cmd: 'printf "* soft nofile 65535\\n* hard nofile 65535\\n" > /etc/security/limits.d/99-nofile.conf', desc: '写入用户级持久化配置（重新登录后生效）' },
        { cmd: 'systemctl edit myapp --force --full=false', desc: '为服务添加 drop-in，写入 `[Service]` 段的 `LimitNOFILE=65535`' },
        { cmd: 'systemctl daemon-reload && systemctl restart myapp && cat /proc/$(systemctl show -p MainPID --value myapp)/limits | grep "open files"', desc: '重载并重启后验证新上限是否真的生效' },
        { cmd: 'lsof +L1 | head -20', desc: '查找已删除但仍被占用的文件，定位句柄泄漏' }
      ],
      notes: [
        '**改完 `limits.conf` 必须重新登录才生效**，对已运行的进程无效；对服务则必须重启服务',
        '**systemd 服务不读 `/etc/security/limits.conf`**：这是"明明改了配置却还是报 Too many open files"的头号原因，必须在单元里设 `LimitNOFILE`',
        '硬限制（hard）只有 root 能提高；普通用户 `ulimit -n` 超过硬限制会报 `Operation not permitted`',
        '**句柄持续增长说明有泄漏**：`lsof -p <PID> | awk \'{print $5}\' | sort | uniq -c | sort -rn` 看是哪类资源在涨，只调大上限是治标',
        '日志轮转后如果进程没有重新打开日志文件，旧句柄会一直被占用（`lsof +L1` 里显示 deleted），解决方案是给应用配 `copytruncate` 或发送信号让其重新打开日志',
        '`fs.file-max` 是系统级总量上限，通常几十万，一般不是瓶颈；`/proc/sys/fs/file-nr` 可以看到已分配数量',
        '容器环境要同时看容器内与宿主机的限制，`docker run --ulimit nofile=65535:65535` 或在 K8s 里配 `securityContext`/`limits`'
      ],
      related: ['pf-file-max', 'pf-ss-summary', 'ln-lsof', 'pf-sysctl'],
      docs: 'https://man7.org/linux/man-pages/man5/limits.conf.5.html',
      tags: ['句柄', 'Too many open files', 'systemd', '调优']
    },

    /* ---------- 14 / 25 ---------- */
    {
      id: 'pf-sysctl',
      name: 'sysctl -w 与持久化',
      kind: 'recipe',
      alias: ['sysctl -p', '/etc/sysctl.d', '内核参数调整'],
      level: 3,
      syntax: 'sysctl -w <参数>=<值> | sysctl -a | sysctl -p /etc/sysctl.d/99-tuning.conf',
      summary: '运行时修改内核参数并持久化到配置文件，是性能调优的主要入口。',
      desc: '`sysctl -w` 立即修改运行时内核参数，重启失效；持久化要写进 `/etc/sysctl.conf` 或更推荐的 `/etc/sysctl.d/99-xxx.conf`（`/etc/sysctl.d/` 下的文件按名称排序依次加载，用 `99-` 前缀保证最后生效）。\n\n调优前的基本纪律：**先记录基线，一次只改一个参数，改完压测对比，无效就回滚**。生产上调参最常见的问题不是"调错了"而是"调了一堆无法归因"。\n\n**高危参数（改错会直接失联或断网）**：\n- `net.ipv4.ip_forward`：改成 0 会让做网关/NAT 的主机停止转发，整片内网断网；\n- `net.ipv4.conf.*.rp_filter`：反向路径校验，在非对称路由环境下开启会丢包，但完全关闭也有安全风险；\n- `net.ipv4.conf.*.accept_redirects`、`send_redirects`：影响路由行为；\n- `net.ipv4.ip_local_port_range`：写错范围会导致无法建立出连接；\n- `kernel.shmall`/`kernel.shmmax`：设小会让 Oracle、PostgreSQL 无法启动；\n- `vm.overcommit_memory`：设为 1 会增加 OOM 风险，改为 2 更危险，Redis 场景通常只在必要时设 1。\n\n**远程修改的安全姿势**：在 `tmux`/`screen` 里操作，或写成"先改、延时 60 秒后自动回滚"的脚本，确认新参数没问题再取消回滚，这样可以避免因参数错误被锁在机器外。',
      params: [
        { flag: '-w <参数>=<值>', desc: '立即修改运行时参数，重启失效' },
        { flag: '-a', desc: '列出全部内核参数，配合 `grep` 查当前值' },
        { flag: '-p <文件>', desc: '从指定文件加载参数，如 `sysctl -p /etc/sysctl.d/99-tuning.conf`' },
        { flag: '-n <参数>', desc: '只输出参数值不带参数名，脚本取值用' },
        { flag: '--system', desc: '加载所有配置文件（`/etc/sysctl.conf` 与 `/etc/sysctl.d/*`）' },
        { flag: '/proc/sys/...', desc: '参数对应的文件路径，也可直接 echo 写入' }
      ],
      examples: [
        { cmd: 'sysctl -a | grep -E "somaxconn|swappiness|file-max"', desc: '查看当前关键参数值，调优前先记录基线' },
        { cmd: 'sysctl -w net.core.somaxconn=32768', desc: '临时提高全连接队列上限（立即生效，重启失效）' },
        { cmd: 'printf "net.core.somaxconn = 32768\\nnet.ipv4.tcp_max_syn_backlog = 16384\\n" > /etc/sysctl.d/99-tuning.conf && sysctl --system', desc: '写入独立配置文件并立即加载，避免直接改 /etc/sysctl.conf' },
        { cmd: 'sysctl -n net.ipv4.tcp_tw_reuse', desc: '只取值不带参数名，脚本里做判断用' },
        { cmd: 'cp /etc/sysctl.d/99-tuning.conf /tmp/backup-sysctl.conf && echo "回滚文件已备份"', desc: '改参数前备份配置，出问题可快速回滚' }
      ],
      notes: [
        '**改错内核参数可能导致主机立即失联**：尤其是 `ip_forward`、`rp_filter`、端口范围、路由相关参数；远程修改请在 `tmux`/`screen` 中操作，或准备好"延时自动回滚"',
        '`sysctl -w` 重启即失效，**必须写入 `/etc/sysctl.d/` 才算持久化**；只 `-w` 不写文件是"重启后性能回退"的常见原因',
        '**`/etc/sysctl.conf` 与 `/etc/sysctl.d/*.conf` 同名参数以后加载者为准**：用 `99-` 前缀可以保证你的配置胜出，避免被其他文件覆盖',
        '**不要照抄网上的 `tcp_tw_recycle=1`**：该参数在 NAT 环境下导致连接异常，已在 4.12+ 内核中移除，写了会报 `unknown key`',
        '调优要基于数据：先 `ss -s`、`iostat`、`sar` 找到瓶颈，再针对瓶颈调参，而不是把所有参数都调一遍',
        '容器内改 `sysctl` 大多是只读的（`/proc/sys` 被挂载为只读或受命名空间限制），需要在宿主机改或用 `--sysctl` 指定允许的参数',
        'Kubernetes 里可以通过 `securityContext.sysctls` 设置部分"安全"参数，非安全参数需要 kubelet 开启 `--allowed-unsafe-sysctls`'
      ],
      related: ['pf-somaxconn', 'pf-swappiness', 'pf-tcp-tw-reuse', 'pf-file-max'],
      docs: 'https://man7.org/linux/man-pages/man8/sysctl.8.html',
      tags: ['内核参数', '调优', '持久化', '高危操作']
    },

    /* ---------- 15 / 25 ---------- */
    {
      id: 'pf-somaxconn',
      name: 'net.core.somaxconn',
      alias: ['全连接队列', 'somaxconn 调优', 'accept 队列溢出'],
      level: 3,
      syntax: 'sysctl -w net.core.somaxconn=<数值> | ss -lnt  # 查看 Send-Q 即队列上限',
      summary: '调整 TCP 全连接队列长度上限，解决高并发下连接被丢弃的问题。',
      desc: 'TCP 建连过程有两个队列：**半连接队列**（收到 SYN、尚未完成三次握手，长度受 `tcp_max_syn_backlog` 控制）和**全连接队列**（握手完成、等应用 `accept()` 取走，长度取 `min(somaxconn, 应用 backlog)`）。应用来不及 accept 时队列会满，新连接被丢弃，客户端表现为连接超时或偶发失败，服务端 `netstat -s | grep -i listen` 里的 `listen overflows` 计数会持续增长。\n\n**判断方法**：`ss -lnt` 输出的 `Send-Q` 就是该监听 socket 的实际队列上限（**注意是 Send-Q 不是 Recv-Q**，这是 LISTEN 状态下的特殊含义）；`Recv-Q` 是当前排队等待 accept 的连接数，如果它长期接近 Send-Q，说明队列快满了。\n\n**调整要两头一起做**：内核参数 `net.core.somaxconn` 提高上限，应用侧同时把 backlog 参数改大（Nginx 的 `listen 80 backlog=8192;`、Tomcat 的 `acceptCount`、Java 的 `ServerSocket(port, backlog)`），只改一边等于没改，因为实际队列取两者最小值。\n\nNginx 与 Redis 这类高并发服务，`somaxconn` 设为 32768 是常见做法；内核 5.4 之后默认值已从 128 提升到 4096，老系统（CentOS 7 默认 128）需要显式调整。',
      params: [
        { flag: 'net.core.somaxconn', desc: '全连接队列长度上限，默认 128（新内核 4096）' },
        { flag: 'net.ipv4.tcp_max_syn_backlog', desc: '半连接队列长度，SYN Flood 防护与高并发建连相关' },
        { flag: 'net.ipv4.tcp_abort_on_overflow', desc: '队列满时直接发 RST（默认 0 是静默丢弃），排障时可临时设 1' },
        { flag: 'ss -lnt', desc: '查看监听队列情况，Send-Q 为上限、Recv-Q 为当前排队数' },
        { flag: 'listen backlog=', desc: 'Nginx 配置项，需与内核参数一起调大' },
        { flag: 'netstat -s | grep -i overflow', desc: '查看队列溢出计数，确认是否真的发生了丢弃' }
      ],
      examples: [
        { cmd: 'sysctl -w net.core.somaxconn=32768', desc: '临时提高全连接队列上限' },
        { cmd: 'printf "net.core.somaxconn = 32768\\nnet.ipv4.tcp_max_syn_backlog = 16384\\n" > /etc/sysctl.d/99-net-tuning.conf && sysctl --system', desc: '持久化配置并立即加载' },
        { cmd: 'ss -lnt | head -10', desc: '查看各监听端口的 Recv-Q 与 Send-Q，判断队列是否吃紧' },
        { cmd: 'netstat -s | grep -i -E "listen|overflow"', desc: '查看监听队列溢出统计，确认是否因队列满丢连接' },
        { cmd: 'sysctl -n net.core.somaxconn', desc: '确认当前生效值' }
      ],
      notes: [
        '**只调内核参数而应用 backlog 没跟上等于无效**：实际队列取 `min(somaxconn, backlog)`，Nginx 要在 `listen` 里加 `backlog=`，Tomcat 要改 `acceptCount`',
        '`ss -lnt` 里**看 Send-Q** 才是队列上限（LISTEN 状态下含义与其他状态不同），Recv-Q 是当前积压数，两个都别读反',
        '队列溢出通常意味着**应用 accept 太慢**（如工作进程数不足、accept 后有阻塞操作），调大队列只是缓解，不解决根因',
        '`somaxconn` 调得过大没有副作用，但同时要检查 `ulimit -n`，否则连接数先撞句柄上限',
        '临时把 `tcp_abort_on_overflow=1` 可以让溢出时返回 RST 而不是静默丢弃，便于确认问题，**排查完要改回 0**，长期开启会让客户端看到更多连接重置',
        '容器环境需要同时调整宿主机与容器的参数（K8s 里 `somaxconn` 属于需要额外放行的 sysctl）'
      ],
      related: ['pf-sysctl', 'pf-ulimit-n', 'pf-tcp-tw-reuse', 'pf-ss-summary'],
      docs: 'https://docs.kernel.org/networking/ip-sysctl.html',
      tags: ['TCP队列', '高并发', '内核参数', '调优']
    },

    /* ---------- 16 / 25 ---------- */
    {
      id: 'pf-tcp-tw-reuse',
      name: 'net.ipv4.tcp_tw_reuse 与 TIME_WAIT 优化',
      kind: 'recipe',
      alias: ['TIME_WAIT 优化', 'tcp_tw_reuse', '短连接端口耗尽'],
      level: 4,
      syntax: 'sysctl -w net.ipv4.tcp_tw_reuse=1 | sysctl -w net.ipv4.tcp_max_tw_buckets=<数值> | sysctl -w net.ipv4.ip_local_port_range="10000 65000"',
      summary: '缓解短连接场景下的 TIME_WAIT 堆积与本地端口耗尽问题。',
      desc: 'TIME_WAIT 是主动关闭连接的一方必然进入的状态，持续 2MSL（Linux 上固定 60 秒）。它的存在有正当理由：确保最后一个 ACK 能到达对端、让旧连接的延迟报文在网络中消失。所以**TIME_WAIT 本身不是故障**，只有大量堆积导致本地端口耗尽（新建连接报 `Cannot assign requested address`）或连接表膨胀时才需要处理。\n\n**先判断是不是真问题**：`ss -s` 看 timewait 总量；`ss -tan state time-wait | wc -l` 精确统计；`netstat -s | grep -i "connections established"` 对比总量；再看 `ss -tan state time-wait | awk \'{print $4}\' | awk -F: \'{print $NF}\' | sort | uniq -c | sort -rn | head` 找出集中在哪个本地端口范围。\n\n**优化手段按优先级排列**：\n① **改用长连接**——最根本的解法。HTTP 加 `Connection: keep-alive`，数据库加连接池，中间件减少频繁建连，TIME_WAIT 自然大幅下降。\n② **`tcp_tw_reuse=1`**——允许把处于 TIME_WAIT 的 socket 复用于**新的出方向连接**（依赖时间戳，安全性可接受）。注意它只影响主动发起连接的一方，服务端被动关闭产生的 TIME_WAIT 它管不着。\n③ **扩大本地端口范围**——`ip_local_port_range = 10000 65000`，把可用端口从约 2.8 万提升到 5.5 万，直接抬高耗尽阈值。\n④ **`tcp_max_tw_buckets`**——控制内核保留的 TIME_WAIT 上限，超过会直接销毁并打印告警。**调小它是危险操作**，会破坏 TCP 状态机语义，只作为极端情况下的临时手段。\n⑤ **让客户端主动关闭**——把 TIME_WAIT 压力转移到客户端侧（客户端数量多，压力天然分散），这是 Nginx 反代场景的常用技巧。\n\n**明确不要做的事**：`tcp_tw_recycle` 已被移除（4.12+），在 NAT 环境下会导致连接失败，网上老文章仍在推荐，遇到就跳过。',
      params: [
        { flag: 'net.ipv4.tcp_tw_reuse=1', desc: '允许复用 TIME_WAIT 状态的 socket 发起新连接（出方向）' },
        { flag: 'net.ipv4.tcp_max_tw_buckets', desc: 'TIME_WAIT 数量上限，超过立即回收并告警，**调小有风险**' },
        { flag: 'net.ipv4.ip_local_port_range', desc: '本地临时端口范围，扩大可缓解端口耗尽' },
        { flag: 'net.ipv4.tcp_fin_timeout', desc: 'FIN_WAIT_2 状态的超时时间，影响被动关闭方的资源占用' },
        { flag: 'net.ipv4.tcp_timestamps=1', desc: '时间戳选项，`tcp_tw_reuse` 依赖它工作，必须保持开启' },
        { flag: 'net.ipv4.tcp_max_syn_backlog', desc: '半连接队列长度，与建连压力相关' }
      ],
      examples: [
        { cmd: 'ss -s', desc: '查看 socket 汇总，看 timewait 总量是否异常' },
        { cmd: 'ss -tan state time-wait | wc -l', desc: '精确统计 TIME_WAIT 连接数' },
        { cmd: 'ss -tan state time-wait | awk \'{print $4}\' | awk -F: \'{print $NF}\' | sort -n | uniq -c | sort -rn | head', desc: '统计 TIME_WAIT 集中在哪些本地端口，判断是否端口耗尽风险' },
        { cmd: 'sysctl -w net.ipv4.tcp_tw_reuse=1', desc: '开启 TIME_WAIT 复用（出方向），立即生效' },
        { cmd: 'sysctl -w net.ipv4.ip_local_port_range="10000 65000"', desc: '扩大本地端口范围，缓解 Cannot assign requested address' },
        { cmd: 'printf "net.ipv4.tcp_tw_reuse = 1\\nnet.ipv4.ip_local_port_range = 10000 65000\\nnet.ipv4.tcp_timestamps = 1\\n" > /etc/sysctl.d/99-tw.conf && sysctl --system', desc: '持久化三项配置并加载' }
      ],
      notes: [
        '**TIME_WAIT 是 TCP 的正常状态，不是泄漏**：只有导致端口耗尽或连接表压力时才需要优化，看到几万条就慌了去改参数是常见误区',
        '**绝对不要使用 `net.ipv4.tcp_tw_recycle`**：该参数在 NAT 环境下造成大量连接失败，已在 Linux 4.12 中移除，遇到 `unknown key` 报错说明内核早已不支持',
        '**`tcp_max_tw_buckets` 调小是危险操作**，被强制回收的 TIME_WAIT 会让旧连接的延迟报文污染新连接，仅在极端场景临时使用',
        '`tcp_tw_reuse` 依赖 `tcp_timestamps=1`（默认开启），**手动关闭了时间戳会导致该参数失效**',
        '`tcp_tw_reuse` 只解决"本机作为客户端"的出方向连接；服务端被动关闭产生的 TIME_WAIT 只能靠改成长连接或让客户端先关',
        '**根治手段是长连接**：Nginx upstream 加 `keepalive`、应用配连接池、数据库用连接池，效果远好于调内核参数',
        '云主机上还有 NAT 网关侧的端口限制，本机端口范围扩大了，NAT 网关的会话表也可能成为瓶颈，大规模场景要评估'
      ],
      related: ['pf-sysctl', 'pf-somaxconn', 'pf-ss-summary', 'pf-ulimit-n'],
      docs: 'https://man7.org/linux/man-pages/man7/tcp.7.html',
      tags: ['TIME_WAIT', 'TCP', '内核参数', '短连接']
    },

    /* ---------- 17 / 25 ---------- */
    {
      id: 'pf-file-max',
      name: 'fs.file-max',
      alias: ['系统级句柄上限', 'file-nr', '内核文件句柄'],
      level: 3,
      syntax: 'sysctl -w fs.file-max=<数值> | cat /proc/sys/fs/file-nr | lsof | wc -l',
      summary: '调整内核允许分配的全局文件句柄总量，判断系统级句柄是否吃紧。',
      desc: '`fs.file-max` 是**整个系统**能分配的句柄总量，与进程级的 `ulimit -n` 是两个层次：前者是"全系统总水池"，后者是"单个进程能取多少"。绝大多数情况下 `fs.file-max` 默认值很大（几十万甚至上百万），不需要调整；真正撞上限时，`/proc/sys/fs/file-nr` 的三个数字会给出证据。\n\n`file-nr` 三个值的含义是：**已分配句柄数、已分配但未使用的句柄数（新内核固定为 0）、系统上限**。第一个数接近第三个数就是真的到顶了，此时新建连接、打开文件都会失败，日志里会出现 `VFS: file-max limit reached` 这样的内核消息（用 `dmesg -T | grep -i file-max` 能看到）。\n\n**排查次序**：先看 `dmesg` 有没有内核告警 → 再看 `file-nr` 的比值 → 用 `lsof | wc -l` 统计全系统打开的文件数 → 用 `lsof | awk \'{print $1}\' | sort | uniq -c | sort -rn | head` 找出句柄占用最多的进程。多数情况是某个进程泄漏，解决进程问题比调大总量更有效。\n\n调大 `fs.file-max` 通常要同时确认内存与 `inotify` 等子系统的限制（`fs.inotify.max_user_watches` 在文件多的机器上经常成为新瓶颈）。',
      params: [
        { flag: 'fs.file-max', desc: '全系统句柄总量上限，默认通常足够大' },
        { flag: '/proc/sys/fs/file-nr', desc: '已分配 / 未使用 / 上限 三个数字，判断是否吃紧' },
        { flag: 'fs.nr_open', desc: '单进程句柄上限的绝对天花板，`ulimit -n` 不能超过它' },
        { flag: 'fs.inotify.max_user_watches', desc: 'inotify 监视数量，文件多的机器上是常见新瓶颈' },
        { flag: 'lsof | wc -l', desc: '统计全系统打开的文件数量' },
        { flag: 'dmesg -T | grep -i file-max', desc: '查看内核是否报过句柄耗尽告警' }
      ],
      examples: [
        { cmd: 'cat /proc/sys/fs/file-nr && sysctl -n fs.file-max', desc: '对比已分配句柄数与系统上限，判断是否接近瓶颈' },
        { cmd: 'dmesg -T | grep -i -E "file-max|VFS" | tail -10', desc: '查看内核是否报过句柄耗尽，这是最直接的证据' },
        { cmd: 'lsof | awk \'{print $1}\' | sort | uniq -c | sort -rn | head -10', desc: '找出句柄占用最多的进程，定位泄漏源' },
        { cmd: 'sysctl -w fs.file-max=2097152', desc: '临时提高系统级句柄上限' },
        { cmd: 'printf "fs.file-max = 2097152\\nfs.inotify.max_user_watches = 524288\\n" > /etc/sysctl.d/99-file.conf && sysctl --system', desc: '持久化系统级与 inotify 上限' }
      ],
      notes: [
        '**`fs.file-max` 与 `ulimit -n` 是两层限制**：系统总量够但单进程上限低，一样会报 `Too many open files`，排查时两个都要看',
        '`/proc/sys/fs/file-nr` 的第二个值在新内核中固定为 0（表示未使用的已分配句柄），不要误读为"还有 0 个可用"',
        '**句柄耗尽往往是某个进程泄漏的症状**：只调大上限会把故障从"立刻报错"变成"延迟报错"，根因仍在',
        '调整 `fs.nr_open` 要谨慎，它限制单进程可打开的句柄绝对上限，设得过大在异常进程狂开句柄时可能导致内存耗尽',
        '文件数量多的服务器（如日志服务器、编译机）常被 `fs.inotify.max_user_watches` 卡住，报错是 `No space left on device` 但磁盘明明是空的，容易被误导',
        '容器内看到的是宿主机内核的全局值，容器自身不隔离该参数，排查时要区分是容器问题还是宿主机问题'
      ],
      related: ['pf-ulimit-n', 'pf-sysctl', 'ln-lsof', 'ls9-df'],
      docs: 'https://docs.kernel.org/admin-guide/sysctl/fs.html',
      tags: ['句柄', '内核参数', '容量排查', '泄漏']
    },

    /* ---------- 18 / 25 ---------- */
    {
      id: 'pf-swappiness',
      name: 'vm.swappiness',
      alias: ['swappiness 调优', '交换分区倾向', '关闭 swap 使用'],
      level: 3,
      syntax: 'sysctl -w vm.swappiness=<0-100> | cat /proc/sys/vm/swappiness',
      summary: '控制内核使用交换分区的倾向，数据库与缓存类服务的关键调优项。',
      desc: '`vm.swappiness` 取值范围 0~100，越大越倾向于把匿名页换出到 swap。默认值在多数发行版是 60（部分云镜像设为 30 或 1）。\n\n**为什么它很重要**：内存充足时把页换出会带来额外的 IO 延迟，对延迟敏感的数据库、Redis、Java 应用伤害极大——一次 swap 换入可能让请求延迟从毫秒级跳到几十毫秒。所以这类服务的常规做法是**设为 1 或 0，甚至直接关闭 swap**。\n\n需要注意两个细节：\n① **设为 0 不等于完全禁用 swap**：内核在内存真的不足时仍会换出，只是尽量避免；要彻底禁用得 `swapoff -a` 并删除 `/etc/fstab` 中的 swap 条目，但这在 OOM 时会直接杀进程。\n② **现代内核（3.5+）中 swappiness 对"有 swap 的 cgroup/容器"行为更复杂**，容器场景还要看 `memory.swappiness`。\n\n**判断是否真的在用 swap**：`free -h` 看 `Swap used` 是否在增长，`vmstat 1` 看 `si`/`so` 两列（换入/换出速率），持续非 0 就说明内存压力真实存在。**注意区分"用了一点 swap"和"持续换页"**：前者无害，后者才是性能问题。\n\n**如果已经在持续 swap，优先加内存或优化应用内存占用**，调 swappiness 只是缓解症状。',
      params: [
        { flag: 'vm.swappiness', desc: '取值 0~100，越小越不倾向换出；数据库建议 1 或 0' },
        { flag: 'vm.vfs_cache_pressure', desc: '回收 inode/dentry 缓存的倾向，默认 100，文件服务可调低' },
        { flag: 'vm.overcommit_memory', desc: '内存超额分配策略，Redis 场景常需设为 1' },
        { flag: 'free -h', desc: '查看内存与 swap 使用量' },
        { flag: 'vmstat 1', desc: '看 si/so 列判断是否在持续换页' },
        { flag: 'swapoff -a / swapon -a', desc: '关闭 / 启用全部交换分区' }
      ],
      examples: [
        { cmd: 'cat /proc/sys/vm/swappiness', desc: '查看当前 swappiness 值' },
        { cmd: 'free -h', desc: '看内存与 swap 的实际使用量，判断是否有内存压力' },
        { cmd: 'vmstat 1 5', desc: '观察 si/so 列，持续非 0 说明在频繁换页' },
        { cmd: 'sysctl -w vm.swappiness=1', desc: '把换出倾向降到最低（数据库与缓存服务器的常规设置）' },
        { cmd: 'printf "vm.swappiness = 1\\nvm.vfs_cache_pressure = 50\\n" > /etc/sysctl.d/99-vm.conf && sysctl --system', desc: '持久化调整并加载' },
        { cmd: 'for p in $(pgrep -f myapp); do echo "$p $(awk \'/VmSwap/{print $2}\' /proc/$p/status)"; done', desc: '查看具体进程被换出到 swap 的内存量，定位受害者' }
      ],
      notes: [
        '**`swappiness=0` 并不等于禁用 swap**：内存紧张时内核仍会换出，只是尽力避免；真正禁用要 `swapoff -a` 并从 `/etc/fstab` 移除，代价是 OOM 时直接杀进程',
        '**不要盲目关闭 swap**：完全没有 swap 时，一旦内存耗尽内核只能杀进程；保留少量 swap 作缓冲往往比彻底关闭更安全',
        '`free -h` 显示 swap 有使用量不一定是问题，关键看 `vmstat` 的 `si`/`so` 是否持续非 0——偶发换页与持续换页性质完全不同',
        'Java 应用在 swap 上表现尤其差（GC 停顿会被放大数倍），堆内存较大的 JVM 建议明确设置 swappiness=1 并保证物理内存充足',
        '容器内的 swappiness 受 cgroup v2 的 `memory.swappiness` 影响，宿主机设置不一定直接生效',
        '调整只是缓解，**根因通常是内存不足或应用内存泄漏**，长期方案是加内存或修内存问题'
      ],
      related: ['pf-sysctl', 'pf-numactl', 'pf-jstat', 'lu-journalctl'],
      docs: 'https://docs.kernel.org/admin-guide/sysctl/vm.html',
      tags: ['内存', 'swap', '内核参数', '调优']
    },

    /* ---------- 19 / 25 ---------- */
    {
      id: 'pf-taskset',
      name: 'taskset',
      alias: ['CPU 亲和性', '绑核', 'taskset -c'],
      level: 3,
      syntax: 'taskset -c <CPU列表> <命令> | taskset -cp <CPU列表> <PID> | taskset -p <PID>',
      summary: '把进程绑定到指定 CPU 核上运行，减少跨核切换带来的缓存失效。',
      desc: 'Linux 调度器默认会把进程在多个核之间迁移，这本身是好事（负载均衡），但对**延迟敏感或缓存敏感**的进程会造成伤害：每次迁移都会丢失 L1/L2 缓存热度，还会带来 NUMA 跨节点访问。`taskset` 就是用来锁定亲和性的。\n\n**CPU 列表写法**：`-c 0`（只绑 0 号核）、`-c 0,1`（0 和 1）、`-c 0-3`（0 到 3）、`-c 0-3,8`（混合）。查看核编号用 `lscpu` 或 `nproc`。\n\n**典型场景**：\n- 把高频交易/网关进程绑定到独占核，避免被其他进程抢占；\n- 把压测工具绑定到与业务不同的核，避免压测机自身负载污染测量结果（**性能测试的基本纪律**）；\n- 把虚拟机/容器进程绑定到独占物理核，实现资源隔离；\n- 多实例部署时把不同实例绑到不同核，避免相互争抢。\n\n`taskset` 只能改亲和性，**不做资源限制**：绑到某个核上但它仍可以和别的进程共享该核。要真正的隔离需要 `isolcpus` 内核参数 + cgroup cpuset，或者用 `numactl` 做 NUMA 级别的绑定。\n\n已有进程可以用 `-p` 在线修改（`taskset -cp 2-3 <PID>`），不需要重启服务，是临时验证亲和性效果的好办法。',
      params: [
        { flag: '-c <列表>', desc: '指定 CPU 核列表，如 `0-3`、`0,2,4`；启动新进程时使用' },
        { flag: '-p <PID>', desc: '操作已存在的进程，配合 `-c` 修改其亲和性' },
        { flag: '-cp <列表> <PID>', desc: '在线修改运行中进程的绑定核' },
        { flag: 'lscpu / nproc', desc: '查看 CPU 核数与编号，写 CPU 列表前先确认' },
        { flag: 'isolcpus', desc: '内核启动参数，把核从调度器中隔离出来，实现独占' },
        { flag: 'cpuset cgroup', desc: '容器/服务级别的核绑定，比 taskset 更彻底' }
      ],
      examples: [
        { cmd: 'taskset -c 0-3 /opt/myapp/bin/server', desc: '启动服务并绑定到 0~3 号核' },
        { cmd: 'taskset -cp 4-7 $(pgrep -f myapp | head -1)', desc: '在线把运行中的服务改绑到 4~7 号核，无需重启' },
        { cmd: 'taskset -p $(pgrep -f myapp | head -1)', desc: '查看进程当前的 CPU 亲和性掩码' },
        { cmd: 'taskset -c 8-11 wrk -t4 -c400 -d30s http://10.0.1.23/api/health', desc: '压测工具单独绑核，避免与业务进程争抢影响结果' },
        { cmd: 'lscpu | grep -E "^CPU\\(s\\)|NUMA"', desc: '查看核数与 NUMA 节点分布，为绑核方案提供依据' }
      ],
      notes: [
        '**绑核不是越多越好**：把所有进程都绑到少数几个核上会造成人为的争抢，反而降低吞吐；绑核的前提是核数足够',
        '`taskset` **只设置亲和性，不做资源隔离**：绑定的核仍可被其他进程使用；要独占需配合内核参数 `isolcpus` 或 cgroup cpuset',
        '**多核绑定会阻止调度器做负载均衡**，在核数少于进程数的机器上可能导致某些核空闲而其他核排队，使用前先看 `mpstat -P ALL 1` 的负载分布',
        'NUMA 架构上**跨节点访问内存的延迟明显高于本地**，绑核要同时考虑内存节点（用 `numactl --cpunodebind --membind`）',
        '容器中看到的 CPU 编号是容器内的视角，与宿主机不一致，绑核要结合容器 CPU 配额一起设计',
        '在线改亲和性（`-cp`）是临时验证手段，重启后失效；要持久化需写进 systemd 单元的 `CPUAffinity=` 或用 cgroup 配置'
      ],
      related: ['pf-numactl', 'pf-perf', 'pf-wrk', 'lu-lscpu'],
      docs: 'https://man7.org/linux/man-pages/man1/taskset.1.html',
      tags: ['CPU亲和', '绑核', '性能隔离', 'NUMA']
    },

    /* ---------- 20 / 25 ---------- */
    {
      id: 'pf-numactl',
      name: 'numactl',
      alias: ['NUMA 绑定', 'numactl --hardware', 'numastat'],
      level: 4,
      syntax: 'numactl --hardware | numactl --cpunodebind=<节点> --membind=<节点> <命令> | numastat -p <PID>',
      summary: '查看 NUMA 拓扑并把进程的内存与 CPU 绑定到同一节点，消除跨节点访问开销。',
      desc: '多路服务器上，CPU 访问"本地内存"和"其他 CPU 挂的内存"延迟能差 1.5~2 倍。默认策略（`--localalloc`）会让进程在本地节点分配内存，但**进程一旦被调度到别的节点，内存访问立刻变成远程**，这就是"CPU 没跑满但性能上不去"的常见原因之一。\n\n**第一步永远是看拓扑**：`numactl --hardware` 输出每个节点的 CPU 编号与内存大小，以及节点间距离（`node distances`，本地是 10，远程通常 20 或更高）。核数与内存不均（如 node0 有 32G、node1 只有 16G）的机器要特别注意。\n\n**第二步是确认是否真的跨节点**：`numastat` 看各节点的 `numa_hit` 与 `numa_miss`，**`numa_miss` 高说明大量内存分配落在远程节点**；`numastat -p <PID>` 可以看具体进程的分布。\n\n**第三步才是绑定**：`numactl --cpunodebind=0 --membind=0 <命令>` 把进程的 CPU 和内存都锁在节点 0。常见变体：`--interleave=all`（内存交替分布，适合内存带宽敏感的场景，如大内存数据库）、`--preferred=1`（优先节点 1，不足时允许溢出）。\n\n**典型应用**：数据库（MySQL、Redis、MongoDB）通常用 `--interleave=all` 或明确绑单节点；Java 大堆应用绑核绑内存能明显减少 GC 的跨节点访问；多实例部署时按 NUMA 节点分配实例，实现"一个节点一个实例"。\n\n绑定策略要压测验证：绑对了通常有 5%~20% 的提升，绑错了（如绑到内存较小的节点）反而会退化，**不要凭感觉设**。',
      params: [
        { flag: '--hardware', desc: '查看 NUMA 节点拓扑、各节点 CPU 与内存、节点间距离' },
        { flag: '--cpunodebind=<节点>', desc: '把进程的 CPU 限制在指定 NUMA 节点' },
        { flag: '--membind=<节点>', desc: '内存只从指定节点分配，不足时直接失败' },
        { flag: '--preferred=<节点>', desc: '优先从指定节点分配内存，不足时允许使用其他节点' },
        { flag: '--interleave=<节点>', desc: '内存在各节点间交替分配，适合带宽敏感场景' },
        { flag: '--show', desc: '查看当前进程的 NUMA 策略' },
        { flag: 'numastat -p <PID>', desc: '查看指定进程的内存在各节点的分布与 miss 数' }
      ],
      examples: [
        { cmd: 'numactl --hardware', desc: '查看 NUMA 拓扑与节点间距离，绑核绑内存前必看' },
        { cmd: 'numastat', desc: '查看各节点的命中与未命中统计，判断是否存在跨节点访问' },
        { cmd: 'numactl --cpunodebind=0 --membind=0 /opt/myapp/bin/server', desc: '把服务完全绑定在 NUMA 节点 0 上运行' },
        { cmd: 'numactl --interleave=all /usr/sbin/mysqld', desc: '数据库常用策略：内存在所有节点交替分配，提升内存带宽利用率' },
        { cmd: 'numastat -p $(pgrep -f myapp | head -1)', desc: '查看运行中进程的内存节点分布，确认绑定是否生效' },
        { cmd: 'numactl --show', desc: '查看当前进程的 NUMA 策略与可用节点' }
      ],
      notes: [
        '**绑错节点比不绑更糟**：把大内存进程绑到内存较小的节点会导致分配失败或频繁换出，绑之前必须用 `--hardware` 核对每个节点的内存量',
        '`--membind` 在内存不足时**直接让分配失败**（进程可能崩溃），生产上更常用 `--preferred` 或 `--interleave`',
        'NUMA 与 `taskset` 的区别：`taskset` 只绑 CPU 核，`numactl` 同时管 CPU 节点与内存节点，**真正的性能问题往往在内存侧**',
        '**虚拟机里 `numactl --hardware` 可能只显示一个节点**，因为 vNUMA 需要云平台与实例规格支持，此时 NUMA 调优意义有限',
        '跨节点访问的代价在延迟敏感场景（如高频交易、Redis）非常明显，但在带宽敏感场景（如大内存分析）用 `--interleave` 往往更好——**必须压测对比**',
        'Kubernetes 中要启用 CPU Manager 与 Topology Manager 才能实现 Pod 级别的 NUMA 亲和，默认调度不保证',
        '用 `--hardware` 里的 `node distances` 判断代价：本地是 10，20 表示远程访问延迟约为本地两倍'
      ],
      related: ['pf-taskset', 'pf-perf', 'pf-swappiness', 'lu-lscpu'],
      docs: 'https://man7.org/linux/man-pages/man8/numactl.8.html',
      tags: ['NUMA', '内存绑定', '性能调优', 'CPU亲和']
    },

    /* ================= D. Java 与内核 ================= */

    /* ---------- 21 / 25 ---------- */
    {
      id: 'pf-jstat',
      name: 'jstat -gcutil',
      alias: ['jstat 判读 GC', 'GC 频率', 'JVM 内存监控'],
      level: 3,
      syntax: 'jstat -gcutil <PID> <间隔毫秒> [<次数>] | jstat -gc <PID> 1000 10',
      summary: '持续采样 JVM 各代内存与 GC 次数，判断 GC 是否已成为性能瓶颈。',
      desc: '`jstat` 是排查 Java 性能问题最轻量的工具：不需要重启应用、不需要额外 Agent，直接读 JVM 的运行时统计。\n\n**`-gcutil` 输出列的含义**（按百分比显示）：`S0`/`S1` 两个 Survivor 区使用率、`E` Eden 区、`O` 老年代、`M` 元空间、`CCS` 压缩类空间、`YGC`/`YGCT` 新生代 GC 次数与总耗时、`FGC`/`FGCT` 老年代 GC 次数与总耗时、`GCT` 总 GC 耗时。\n\n**判读 GC 瓶颈的四个信号**：\n① **`FGC` 持续快速增长**——老年代 GC 频繁，通常意味着内存泄漏或老年代过小；\n② **`FGCT` 占 GCT 的比例高**——Full GC 单次耗时长（几百毫秒到几秒），是造成长停顿的主因；\n③ **`GCT` 占总运行时间的比例超过 5%~10%**——GC 已经在明显吃掉 CPU；\n④ **`O`（老年代使用率）回收后仍居高不下且逐步上升**——典型的对象堆积/内存泄漏特征。\n\n**采样姿势很重要**：`jstat -gcutil <PID> 1000 60` 连续采样一分钟（每秒一次），静态看一眼没有意义。计算 GC 频率时用次数差除以时间差，例如 60 秒内 FGC 从 12 涨到 30，说明**每 3 秒一次 Full GC**，服务基本不可用。\n\n**与 GC 日志配合**：`jstat` 给趋势，GC 日志给单次明细（哪次回收、停顿多久、回收前后大小）。定位到问题后通常要 `jmap -dump` 拿堆快照用 MAT 分析，或直接查代码里的缓存与大对象。',
      params: [
        { flag: '-gcutil', desc: '以百分比显示各代使用率与 GC 次数、耗时，最常用' },
        { flag: '-gc', desc: '显示各代的具体容量（KB），用于确认堆大小是否符合预期' },
        { flag: '-gccapacity', desc: '显示各代容量与对应的上限，排查堆扩缩容行为' },
        { flag: '-gccause', desc: '在 gcutil 基础上多输出最近一次 GC 的原因，定位触发源' },
        { flag: '<间隔毫秒> <次数>', desc: '采样间隔与次数，如 `1000 60` 表示每秒一次共 60 次' },
        { flag: '-t', desc: '输出时间戳列，便于与监控图表对齐' }
      ],
      examples: [
        { cmd: 'jstat -gcutil <Java进程PID> 1000 60', desc: '每秒采样一次共 60 次，观察 GC 频率与各代使用率变化' },
        { cmd: 'jstat -gc <Java进程PID> 1000 10', desc: '查看各代具体容量（KB），确认堆大小是否与配置一致' },
        { cmd: 'jstat -gccause <Java进程PID> 1000 20', desc: '带 GC 原因输出，判断是分配失败还是元空间触发' },
        { cmd: 'ps -ef | grep java | grep -v grep', desc: '先找到 Java 进程 PID 与启动参数，再执行 jstat' },
        { cmd: 'jstat -gcutil <Java进程PID> 1000 60 | awk \'NR==1 || NR%10==0\'', desc: '每 10 秒打印一次采样结果，减少输出便于观察趋势' }
      ],
      notes: [
        '**`jstat` 只给趋势不给根因**：它能告诉你"Full GC 很频繁"，但为什么频繁要看 GC 日志与堆快照',
        '**单次采样毫无意义**，必须连续采样并计算频率变化，才能真正判断是否成瓶颈',
        '`jstat` 需要与目标 JVM 相同或更高的 JDK 版本，版本不一致可能报 `Unrecognized option`；用 `jstat -J-Djstat.showUnsupported=true -snap` 之类参数可绕过部分限制',
        'JDK 9+ 中 `jstat` 位于 `$JAVA_HOME/bin`，容器里要 `docker exec` 进容器执行，或用 `kubectl exec`',
        '**GC 问题优先看"是否在持续 Full GC"**：如果 FGC 保持不变而只有 YGC 在涨，通常是正常的新生代回收，不必紧张',
        'CMS 在 JDK 9 后废弃、JDK 14 移除；G1 是 JDK 9+ 默认收集器，`jstat` 的输出列在 G1 下语义略有不同（如 `CCS` 可能为 0）',
        '开启 `-XX:+HeapDumpOnOutOfMemoryError` 是保命配置，能保证 OOM 时有现场可查'
      ],
      related: ['pf-gc-log', 'pf-jstack-cpu', 'pf-perf', 'lu-journalctl'],
      docs: 'https://docs.oracle.com/en/java/javase/17/docs/specs/man/jstat.html',
      tags: ['JVM', 'GC', '性能排障', 'Java']
    },

    /* ---------- 22 / 25 ---------- */
    {
      id: 'pf-gc-log',
      name: 'GC 日志参数与 GCViewer',
      kind: 'recipe',
      alias: ['-Xlog:gc', 'GC 日志分析', 'GCViewer'],
      level: 4,
      syntax: 'java -Xlog:gc*:file=<日志路径>:time,uptime,level,tags:filecount=10,filesize=50M -jar <应用>',
      summary: '开启结构化 GC 日志并用工具分析停顿分布，定位 GC 造成的长延迟。',
      desc: '`jstat` 看趋势，GC 日志看**每一次回收的明细**：回收前后各代大小、耗时、停顿时间、触发原因。它是 JVM 性能问题的"黑匣子"，**必须在应用启动时就开启**，事后无法补录——这是最常见的遗憾。\n\n**参数演进要注意**：JDK 8 用 `-XX:+PrintGCDetails -XX:+PrintGCDateStamps -Xloggc:<路径>`；**JDK 9+ 统一为 `-Xlog:gc*`** 这一套统一日志框架，老参数会打印废弃警告甚至不生效。`-Xlog` 的格式是 `-Xlog:<标签>:file=<文件>:<装饰器>:filecount=N,filesize=NM`，其中 `time,uptime,level,tags` 是常用的输出装饰器，`filecount` 与 `filesize` 实现自动轮转——**不加轮转参数会把磁盘写满**，这是必须避免的生产事故。\n\n**判读要点**：\n- **停顿时间（pause）** 是核心：G1 的目标是 `-XX:MaxGCPauseMillis`（默认 200ms），日志里实际停顿若经常超过几百毫秒，说明堆太大或对象存活率过高；\n- **回收前后堆占用**：`X→Y` 中 Y 居高不下说明有对象长期存活，可能存在泄漏；\n- **Full GC 的触发原因**：`Allocation Failure`（正常）、`Metadata GC Threshold`（元空间不足）、`Ergonomics`（JVM 自适应）、`System.gc()`（代码显式调用，**应该查出来是谁在调**）。\n\n**分析工具**：GCViewer（开源，直接打开日志给出吞吐量、停顿时间分布与趋势图）、GCEasy（在线，注意**不要上传生产日志**）、`gceasy` 的离线替代方案是 `jclarity` 或自己用脚本解析。推荐流程是先在测试环境复现并分析，生产日志脱敏后再上传外部工具。\n\n**常用调优方向**：堆大小设为物理内存的 50%~70% 且 `-Xms` 与 `-Xmx` 相等（避免动态扩缩）；G1 下设置 `-XX:MaxGCPauseMillis=200`；大堆（>16G）考虑 ZGC 或 Shenandoah 这类低停顿收集器。',
      params: [
        { flag: '-Xlog:gc*', desc: 'JDK 9+ 开启全部 GC 相关日志，推荐写法' },
        { flag: 'file=<路径>', desc: '输出到文件而不是标准输出，生产环境必须' },
        { flag: 'time,uptime,level,tags', desc: '输出装饰器：绝对时间、运行时长、级别、标签' },
        { flag: 'filecount=10,filesize=50M', desc: '日志自动轮转，**不加会写满磁盘**' },
        { flag: '-Xms / -Xmx', desc: '堆初始与最大值，生产建议设成相等避免动态扩缩' },
        { flag: '-XX:MaxGCPauseMillis=200', desc: 'G1 的停顿时间目标，不是硬保证但影响回收策略' },
        { flag: '-XX:+HeapDumpOnOutOfMemoryError', desc: 'OOM 时自动导出堆快照，排查内存泄漏必备' }
      ],
      examples: [
        { cmd: 'java -Xms4g -Xmx4g -Xlog:gc*:file=/data/logs/gc.log:time,uptime,level,tags:filecount=10,filesize=50M -XX:+HeapDumpOnOutOfMemoryError -jar /opt/myapp/app.jar', desc: '生产启动参数：固定堆大小 + 带轮转的 GC 日志 + OOM 快照' },
        { cmd: 'java -Xlog:gc:file=/tmp/gc.log:time,uptime -jar /opt/myapp/app.jar', desc: '只记录 GC 基本事件，日志量小适合快速验证' },
        { cmd: 'grep -c "Pause Full" /data/logs/gc.log', desc: '统计 Full GC 次数，快速判断是否频繁' },
        { cmd: 'grep "Pause Young" /data/logs/gc.log | awk -F"ms" \'{print $1}\' | tail -5', desc: '查看最近几次新生代 GC 的停顿时间' },
        { cmd: 'grep -i "System.gc" /data/logs/gc.log | head', desc: '查找显式调用 System.gc() 导致的 Full GC，代码里应移除这类调用' }
      ],
      notes: [
        '**开启 GC 日志必须带 `filecount` 与 `filesize` 轮转参数**：日志量在高频 GC 下非常可观，没有轮转会把磁盘写满并拖垮应用',
        'JDK 8 与 JDK 9+ 的参数完全不同：`-XX:+PrintGCDetails` 在 JDK 9+ 会告警甚至无效，升级 JDK 时必须同步改启动参数',
        '**GC 日志要在启动时就开**，出问题后再想开就得重启应用，很多故障现场因此丢失',
        '**分析工具上传日志有泄露风险**：日志里包含类名、包名、内存布局等信息，生产日志请用 GCViewer 本地分析，不要上传到在线服务',
        '停顿目标是"目标"不是"承诺"：G1 在堆压力大时照样会出现几百毫秒的停顿，评估用户体验要看日志里真实的长尾停顿',
        '容器中要确保 `-Xmx` 小于容器内存限额（推荐为限额的 70% 左右），否则 JVM 会被 cgroup OOM Killer 杀掉且看不到 Java 层报错',
        'JDK 11+ 可以用 `-XX:+UseZGC` 把停顿压到 10ms 以内，代价是吞吐量略降与更多内存占用，需压测评估'
      ],
      related: ['pf-jstat', 'pf-jstack-cpu', 'pf-perf', 'pf-swappiness'],
      docs: 'https://docs.oracle.com/en/java/javase/17/docs/specs/man/java.html',
      tags: ['JVM', 'GC日志', '停顿', 'Java调优']
    },

    /* ---------- 23 / 25 ---------- */
    {
      id: 'pf-jstack-cpu',
      name: '高 CPU 线程定位（组合）',
      kind: 'recipe',
      alias: ['jstack 找高CPU线程', 'Java CPU 100%', '线程栈分析'],
      level: 4,
      syntax: 'top -H -p <PID> → printf "%x\\n" <线程ID> → jstack <PID> | grep -A 30 <十六进制线程号>',
      summary: '从进程级 CPU 定位到具体 Java 代码行，排查 CPU 飙高的标准链路。',
      desc: 'Java 进程 CPU 100% 时，光看 `top` 只知道是哪个进程，不知道是哪段代码。因为 **JVM 里每个 Java 线程都对应一个操作系统线程**，只要把 Linux 的线程 ID（十进制）转成十六进制，就能在 `jstack` 输出的 `nid=0x...` 里找到对应的线程栈——这就是整条排查链路的原理。\n\n**完整链路（一步一步来）**：\n① **找进程**：`top` 或 `ps -eo pid,pcpu,cmd --sort=-pcpu | head` 找到高 CPU 的 Java 进程 PID；\n② **找线程**：`top -H -p <PID>` 进入线程视图（`-H` 是关键，显示线程而非进程），记下占用最高的线程 ID（如 12345）；\n③ **转十六进制**：`printf "%x\\n" 12345` 得到 `3039`；\n④ **取线程栈**：`jstack <PID> > /tmp/jstack.txt`，然后 `grep -A 30 "nid=0x3039" /tmp/jstack.txt` 找到该线程的调用栈；\n⑤ **读栈定位代码**：栈顶几行就是正在执行的代码。常见结论：`RUNNABLE` 卡在业务方法里说明是**死循环或复杂计算**（如正则回溯、大集合遍历、JSON 大对象序列化）；`BLOCKED` 说明在等锁；大量线程停在同一个方法说明有**锁竞争或热点方法**。\n⑥ **多次采样**：一次 `jstack` 只能看到瞬间状态，**建议间隔 5~10 秒连续抓 3~5 次**，如果多次都停在同一业务方法上，基本可以确认；只看一次很容易抓到恰好路过的不相关代码。\n\n**前提条件**：`jstack` 需要与目标 JVM 同版本或更高版本的 JDK，且执行用户要有权限（与目标进程同用户或 root）。\n\n**容器环境**：PID 是容器内的 PID，`top`/`jstack` 都要在容器里执行（`docker exec -it <容器> bash`），宿主机 `top` 看到的线程 ID 与容器内不一致。\n\n**CPU 高但栈上看不出问题时的补充手段**：`perf top -p <PID>` 看热点方法（需要 `-XX:+PreserveFramePointer` 才能看到完整的 Java 栈）、`pidstat -t -p <PID> 1` 看各线程 CPU 分布、`jstat -gcutil` 确认是不是 GC 线程在吃 CPU（这时问题在内存而不是代码）。',
      params: [
        { flag: 'top -H -p <PID>', desc: '按线程查看 CPU 占用（`-H` 显示线程），定位高 CPU 线程 ID' },
        { flag: 'printf "%x\\n" <线程ID>', desc: '把十进制线程 ID 转成十六进制，与 jstack 的 nid 对应' },
        { flag: 'jstack <PID>', desc: '导出所有线程栈，Java 自带无需额外安装' },
        { flag: 'jstack -l <PID>', desc: '额外输出锁的附加信息（ownable synchronizers），查锁竞争用' },
        { flag: 'jstack -F <PID>', desc: '强制 dump（目标进程无响应时使用），会暂停进程，慎用' },
        { flag: 'pidstat -t -p <PID> 1', desc: '按线程持续观察 CPU 分布，确认是否始终同一个线程' },
        { flag: 'grep -c "java.lang.Thread.State: BLOCKED"', desc: '统计阻塞线程数量，判断是否存在严重锁竞争' }
      ],
      examples: [
        { cmd: 'top -H -p <Java进程PID>', desc: '进入线程视图，记下 CPU 占用最高的线程 ID（十进制）' },
        { cmd: 'printf "%x\\n" <线程ID>', desc: '把线程 ID 转成十六进制，例如 12345 得到 3039' },
        { cmd: 'jstack <Java进程PID> > /tmp/jstack-$(date +%H%M%S).txt && grep -A 30 "nid=0x<十六进制线程号>" /tmp/jstack-$(date +%H%M%S).txt', desc: '导出线程栈并定位到该线程的调用链' },
        { cmd: 'for i in 1 2 3; do jstack <Java进程PID> | grep -A 12 "nid=0x<十六进制线程号>" | head -14; sleep 5; done', desc: '间隔 5 秒连续采样 3 次，确认线程是否一直停在同一段代码' },
        { cmd: 'jstack -l <Java进程PID> | grep -c "java.lang.Thread.State: BLOCKED"', desc: '统计阻塞线程数，排查锁竞争导致的 CPU 空转' },
        { cmd: 'pidstat -t -p <Java进程PID> 1 10', desc: '持续观察各线程 CPU 分布，确认热点线程是否稳定' }
      ],
      notes: [
        '**必须用 `top -H`**：不加 `-H` 只看到进程级别，无法拿到线程 ID，这是最常见的操作失误',
        '**一次 jstack 不能定论**：线程栈是瞬时快照，务必间隔数秒采样多次，多次命中同一方法才可信',
        '`jstack` 版本要与目标 JVM 匹配（用同一套 JDK），否则会报 `Unrecognized option` 或直接失败',
        '**`jstack -F` 会暂停目标进程**，生产环境慎用；常规 `jstack` 只做安全点采样，影响很小',
        '容器环境下 PID 与宿主机不同，`top -H` 与 `jstack` 都要在容器内执行，或在宿主机用 `nsenter` 进入容器的 PID 命名空间',
        '**如果高 CPU 来自 GC 线程**（栈上是 `GCTaskThread` 或 `VM Thread`），问题在内存不在代码，转去看 `pf-jstat` 与 `pf-gc-log`',
        'Linux 上 `jstack` 输出的 `nid` 是十六进制且**不带前导零补齐**，用小写十六进制匹配；转出来是 `3039` 就搜 `nid=0x3039`',
        '定位到具体代码后，常见根因是死循环、正则灾难性回溯、频繁的全表遍历、日志里拼接大字符串、序列化大对象'
      ],
      related: ['pf-jstat', 'pf-gc-log', 'pf-perf', 'pf-bpftrace'],
      docs: 'https://docs.oracle.com/en/java/javase/17/docs/specs/man/jstack.html',
      tags: ['Java', 'CPU飙高', '线程栈', '组合命令']
    },

    /* ---------- 24 / 25 ---------- */
    {
      id: 'pf-perf',
      name: 'perf top / perf record',
      alias: ['perf 火焰图', 'CPU 采样分析', 'perf record -F'],
      level: 4,
      syntax: 'perf top [-p <PID>] | perf record -F <频率> -p <PID> -g -- sleep <秒> | perf report',
      summary: '内核级性能采样，看到函数级热点并生成火焰图定位真正瓶颈。',
      desc: '`perf` 用硬件/软件计数器做采样剖析，能回答"CPU 时间到底花在哪个函数上"——这是 `top` 永远给不出的答案。\n\n**两种模式**：\n- `perf top`：实时滚动显示当前热点函数，适合"一边压测一边观察"，`-p <PID>` 只看指定进程，`-g` 显示调用关系；\n- `perf record` + `perf report`：先采样到文件再离线分析，`-F 99` 表示每秒采样 99 次（**用 99 而不是 100，避免与定时器同频产生采样偏差**），`-g` 记录调用栈，`-- sleep 30` 表示采样 30 秒后自动停止。\n\n**输出判读**：`Overhead` 列是各符号占用的 CPU 百分比，从高到低就是热点排序。看到 `[kernel.kallsyms]` 说明时间花在内核态（如系统调用、网络栈、文件系统），看到用户态符号则是应用代码。常见结论：`memcpy`/`memmove` 高说明大量内存拷贝；`schedule`/`futex` 高说明锁竞争严重；`tcp_sendmsg`/`skb` 相关高说明网络栈是瓶颈。\n\n**生成火焰图**：`perf record -F 99 -g -p <PID> -- sleep 60` 得到 `perf.data`，再用 `perf script` 导出文本，交给 FlameGraph 工具集的 `stackcollapse-perf.pl` 与 `flamegraph.pl` 生成 SVG。火焰图的读法：**横轴宽度代表 CPU 时间占比，不是时间先后**；找"又宽又平"的塔作为优化目标，从上往下看是调用链。\n\n**Java 应用要点**：需要加 `-XX:+PreserveFramePointer` 启动参数，否则 `perf` 只能看到 JIT 编译后的地址而看不到方法名；也可以用 async-profiler 这类专门工具获得更准的 Java 栈。\n\n**权限问题**：容器与受限系统上 `perf` 常因 `perf_event_paranoid` 限制而失败，可临时 `sysctl -w kernel.perf_event_paranoid=1`（**这会降低系统安全性，排障后应改回**）。',
      params: [
        { flag: 'top', desc: '实时热点视图，适合边压测边观察' },
        { flag: '-p <PID>', desc: '只剖析指定进程，避免被全系统数据淹没' },
        { flag: 'record -F <频率>', desc: '采样频率，99 是惯用值（避免与 100Hz 定时器同频）' },
        { flag: '-g', desc: '记录调用栈，生成火焰图的必要参数' },
        { flag: '-- sleep <秒>', desc: '采样指定时长后自动结束，避免手动 Ctrl+C' },
        { flag: 'report', desc: '离线分析 perf.data，支持交互式下钻到调用链' },
        { flag: 'script', desc: '把采样结果导出为文本，用于生成火焰图' },
        { flag: 'kernel.perf_event_paranoid', desc: '控制 perf 权限的内核参数，容器中常需调整' }
      ],
      examples: [
        { cmd: 'perf top -p <Java进程PID>', desc: '实时查看该进程的热点函数' },
        { cmd: 'perf record -F 99 -p <Java进程PID> -g -- sleep 30', desc: '对进程采样 30 秒并记录调用栈' },
        { cmd: 'perf record -F 99 -a -g -- sleep 10', desc: '全系统采样 10 秒，排查是哪个进程在吃 CPU' },
        { cmd: 'perf report --stdio | head -40', desc: '文本方式查看热点排序，无需交互' },
        { cmd: 'perf script > /tmp/perf.script && stackcollapse-perf.pl /tmp/perf.script > /tmp/perf.folded && flamegraph.pl /tmp/perf.folded > /tmp/flame.svg', desc: '三步生成火焰图 SVG，用浏览器打开分析' },
        { cmd: 'sysctl -w kernel.perf_event_paranoid=1', desc: '临时放宽 perf 权限（排障后建议改回 2 或更高）' }
      ],
      notes: [
        '**`perf` 需要 root 或放宽 `perf_event_paranoid`**：容器中通常被限制，需 `--cap-add SYS_ADMIN` 或宿主机执行，这是最常见的"命令跑不起来"原因',
        '**采样频率不要设为 100**：与内核定时器同频会产生系统性偏差，惯用值是 99',
        '**Java 应用不加 `-XX:+PreserveFramePointer` 时看不到方法名**，只会显示一堆匿名地址，分析价值大打折扣',
        '火焰图**横轴是时间占比而非时间顺序**，不要按"从左到右是执行流程"去理解，这是初学者最常见的误读',
        '采样会带来一定开销（1%~5%），但通常可以安全地在生产环境短时使用；长时间高频采样仍建议评估',
        '`perf.data` 文件可能很大（采样时间长 + 频率高），注意磁盘空间与采样时长控制',
        '`perf` 版本要与内核匹配，否则报 `perf.data` 格式不兼容；容器与宿主机内核版本差异也会导致问题',
        '火焰图只能反映**火焰图生成那段时间**的 CPU 占用，间歇性问题需要在故障时段采样才能抓到'
      ],
      related: ['pf-bpftrace', 'pf-jstack-cpu', 'pf-taskset', 'pf-numactl'],
      docs: 'https://man7.org/linux/man-pages/man1/perf-record.1.html',
      tags: ['性能剖析', '火焰图', 'CPU热点', 'perf']
    },

    /* ---------- 25 / 25 ---------- */
    {
      id: 'pf-bpftrace',
      name: 'bpftrace',
      alias: ['bpftrace 一行脚本', 'eBPF 追踪', '内核动态追踪'],
      level: 4,
      syntax: 'bpftrace -e \'<探针> { <动作> }\' [-p <PID>] [-c "<命令>"]',
      summary: '用一行 eBPF 脚本追踪内核事件，无侵入地观测延迟分布与调用来源。',
      desc: 'bpftrace 把 eBPF 的强大能力包装成类似 awk 的语法：`探针 { 动作 }`。它**不需要改代码、不需要重启服务、开销极低**，是排查"偶发慢"这类问题的利器——传统工具（strace、tcpdump）要么开销大，要么看不到内核内部。\n\n**常用探针类型**：`kprobe:<内核函数>`（内核函数入口）、`kretprobe:<内核函数>`（返回处，用于算耗时）、`tracepoint:<子系统>:<事件>`（稳定的追踪点，推荐优先使用）、`syscall:<系统调用>`、`profile:hz:99`（定时采样，等效于采样剖析）、`interval:s:1`（定时输出统计）。\n\n**几个真正好用的实战一行脚本**：\n- **统计各进程的系统调用次数**：`bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'`\n- **按进程统计 IO 大小分布**：`bpftrace -e \'tracepoint:block:block_rq_issue { @bytes[comm] = hist(args->bytes); }\'`\n- **测量某个内核函数的延迟分布**：`bpftrace -e \'kprobe:vfs_read { @start[tid] = nsecs; } kretprobe:vfs_read /@start[tid]/ { @ns = hist(nsecs - @start[tid]); delete(@start[tid]); }\'`\n- **追踪打开的文件（排查配置读错）**：`bpftrace -e \'tracepoint:syscalls:sys_enter_openat { printf("%s %s\\n", comm, str(args->filename)); }\'`\n- **统计 TCP 重传**：`bpftrace -e \'tracepoint:tcp:tcp_retransmit_skb { @[comm] = count(); }\'`\n\n**输出里的 `@` 是聚合变量**，`@[comm] = count()` 表示按进程名计数；`hist()` 输出直方图，**看延迟分布远比看平均值有用**——平均值 1ms 但直方图上有 5% 落在 100ms 的情况，用户是能明显感知的。\n\n**限制**：需要内核 4.x 以上且编译了 BTF/BPF 支持（CentOS 7 的 3.10 内核需要额外安装 kernel-extra 或直接用更新的发行版）；需要 root 或相应 capability；容器中通常需要在宿主机或特权容器执行。\n\n**重要纪律**：探针挂在高频函数上（如 `sys_enter`、`vfs_read`）会产生大量事件，**在生产环境务必先限制过滤条件与运行时长**（用 `-p <PID>` 限定进程、`interval:s:10` 自动退出），否则可能显著影响性能。',
      params: [
        { flag: '-e \'<程序>\'', desc: '直接执行一段 bpftrace 程序，最常用的用法' },
        { flag: '-p <PID>', desc: '只追踪指定进程，显著降低事件量与开销' },
        { flag: '-c "<命令>"', desc: '运行指定命令并只追踪它，用于复现式排查' },
        { flag: '-l <探针类型>', desc: '列出可用探针，如 `bpftrace -l "tracepoint:tcp:*"`' },
        { flag: 'count() / hist() / sum()', desc: '聚合函数：计数、直方图、求和' },
        { flag: 'interval:s:<秒>', desc: '定时探针，配合聚合变量做周期性输出' },
        { flag: 'profile:hz:<频率>', desc: '采样探针，用于类似 perf 的 CPU 剖析' }
      ],
      examples: [
        { cmd: 'bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'', desc: '统计各进程的系统调用次数，找系统调用大户' },
        { cmd: 'bpftrace -e \'tracepoint:block:block_rq_issue { @bytes[comm] = hist(args->bytes); }\'', desc: '按进程统计块设备 IO 大小分布' },
        { cmd: 'bpftrace -e \'kprobe:vfs_read { @start[tid] = nsecs; } kretprobe:vfs_read /@start[tid]/ { @ns = hist(nsecs - @start[tid]); delete(@start[tid]); }\'', desc: '测量 vfs_read 的延迟分布，找出慢在哪' },
        { cmd: 'bpftrace -p <Java进程PID> -e \'tracepoint:syscalls:sys_enter_openat { printf("%s %s\\n", comm, str(args->filename)); }\'', desc: '追踪指定进程打开的文件，排查配置读错' },
        { cmd: 'bpftrace -e \'tracepoint:tcp:tcp_retransmit_skb { @[comm] = count(); } interval:s:10 { exit(); }\'', desc: '统计 10 秒内的 TCP 重传并按进程聚合，然后自动退出' },
        { cmd: 'bpftrace -l "tracepoint:tcp:*"', desc: '列出可用的 TCP 追踪点，写脚本前先查有哪些' }
      ],
      notes: [
        '**探针挂在高频函数上开销可能很大**：生产环境务必用 `-p <PID>` 限定范围、用 `interval:s:N { exit(); }` 限定时长，不要挂着不管',
        '需要内核 4.9+（完整功能建议 5.x）并启用 BTF；CentOS 7 的 3.10 内核支持有限，可能需要 `kernel-devel` 或直接升级系统',
        '**需要 root 或 CAP_BPF/CAP_SYS_ADMIN**，容器中通常要在宿主机或特权容器内执行',
        '内核函数名（`kprobe:` 的目标）**随内核版本变化**，跨版本复用脚本前先用 `bpftrace -l` 确认符号存在',
        '`tracepoint:` 比 `kprobe:` 稳定得多（内核保证接口兼容），能用 tracepoint 就不要用 kprobe',
        '输出的聚合变量用 `@` 前缀，`@[comm] = count()` 中 `comm` 是进程名；不带键的 `@ = count()` 是全局计数',
        '它只做观测不做修改，但**观测本身有开销**，压测期间同时跑 bpftrace 会影响测量结果，要评估后使用',
        '复杂需求（长时间挂载、复杂逻辑）应考虑用 BCC 工具集（如 `execsnoop`、`biolatency`、`tcplife`），它们是基于 eBPF 的成熟脚本，比临时写 bpftrace 更可靠'
      ],
      related: ['pf-perf', 'pf-jstack-cpu', 'pf-iperf3', 'ln-tcpdump'],
      docs: 'https://github.com/bpftrace/bpftrace',
      tags: ['eBPF', '动态追踪', '延迟分析', '内核']
    }
  );
})();
