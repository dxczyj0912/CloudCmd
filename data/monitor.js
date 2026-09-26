/* data/monitor.js · 分类 12 监控与日志 */
(function () {
  'use strict';

  var catId = 'monitor';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. 进程与系统概览（11 条） ================= */

    /* ---------- 1 / 42 ---------- */
    {
      id: 'mo-top',
      name: 'top',
      alias: ['top -c', 'top -H', 'top -p', '实时监控'],
      level: 1,
      syntax: 'top [-d <秒>] [-p <PID>] [-u <用户>] [-c] [-H] [-b -n <次数>]',
      summary: '实时看 CPU、内存和进程排行，服务器卡了第一个打开的就是它。',
      desc: '界面分两块：上半部分是汇总（`load average`、`Tasks`、`%Cpu(s)`、`MiB Mem`、`MiB Swap`），下半部分是进程列表。`%Cpu(s)` 一行里 `us`（用户态）、`sy`（内核态）、`wa`（**IO 等待**，高说明磁盘慢）、`st`（**被宿主机抢占**，云主机上高说明邻居吵）、`id`（空闲）加起来是 100%。内存行末尾的 `avail Mem` 才是应用程序真正能拿到的内存（等价于 `free -h` 的 `available`），别只看 `free`。进程列表默认按 CPU 使用率排序，`%CPU` 可能超过 100%（多核累加）。**交互键**是它真正的价值：`P` 按 CPU 排序、`M` 按内存排序、`T` 按运行时间排序、`1` 展开每个 CPU 核、`c` 显示完整命令行、`H` 切换到线程视图、`u` 按用户过滤、`i` 隐藏空闲进程、`f` 挑列、`k` 杀进程、`r` 调优先级、`W` 把当前配置存下来、`q` 退出。脚本里用 `top -b -n 1` 抓一次快照。本站仿真环境里 `mysqld` 常驻内存约 22.8%，是内存排行第一的常客，用 `top -o %MEM` 一眼就能看到。',
      params: [
        { flag: '-d <秒>', desc: '刷新间隔，默认 3 秒；排障时常改成 1' },
        { flag: '-p <PID>', desc: '只看指定进程（可逗号分隔多个），盯住可疑进程' },
        { flag: '-u <用户>', desc: '只看指定用户的进程，如 `-u deploy`' },
        { flag: '-c', desc: '显示完整命令行（含参数），区分同名进程必用' },
        { flag: '-H', desc: '按线程显示，找「哪个线程吃 CPU」的第一步' },
        { flag: '-b -n <次数>', desc: '批处理模式输出指定次数后退出，写脚本/留证据用' },
        { flag: '-o <字段>', desc: '指定排序字段，如 `-o %MEM`、`-o RES`' },
        { flag: '-w <宽度>', desc: '输出宽度，命令行太长被截断时调大' }
      ],
      examples: [
        { cmd: 'top', desc: '最常用：进界面后按 M 看内存排行、按 P 看 CPU 排行' },
        { cmd: 'top -c -o %MEM', desc: '按内存占用排序并显示完整命令行，找内存大户' },
        { cmd: 'top -H -p 18442', desc: '看 Java 进程 18442 的各线程 CPU，配合 jstack 定位热点线程' },
        { cmd: 'top -b -n 1 -o %CPU | head -20', desc: '批处理抓一次 CPU 排行快照，适合写进巡检脚本' }
      ],
      notes: [
        '`load average` 包含**不可中断睡眠（D 状态）**的进程，所以磁盘 IO 卡住时 load 也会很高而 CPU 并不忙',
        '`%CPU` 是多核累加值，8 核机器上单进程跑满多线程可以是 800%',
        '`wa` 高先查磁盘（`iostat -x 1`），`st` 高是被宿主机抢 CPU（云主机需升配或换规格）',
        '内存要看 `avail Mem` 而不是 `free`，Linux 会用空闲内存做缓存，`free` 很小是正常的',
        'top 里按 `k` 杀进程前务必确认 PID 与进程名，杀错关键进程（如 `mysqld`）会直接导致业务中断',
        '容器里 top 看到的是宿主机视角（除非容器内单独装了 procps），排障时注意区分'
      ],
      related: ['mo-htop', 'mo-ps', 'mo-uptime', 'mo-free'],
      docs: 'https://man7.org/linux/man-pages/man1/top.1.html',
      tags: ['进程', 'CPU', '实时']
    },

    /* ---------- 2 / 42 ---------- */
    {
      id: 'mo-htop',
      name: 'htop',
      alias: ['htop', '彩色进程管理器'],
      level: 1,
      syntax: 'htop [-u <用户>] [-p <PID>] [-d <十分之一秒>] [-t]',
      summary: 'top 的彩色加强版，带树形视图、鼠标操作和直观的 CPU 内存条。',
      desc: '相比 `top` 的优势：彩色进度条一眼看出每个核的负载、支持鼠标点击列头排序、`F5` 树形视图能看清父子进程关系（排查「谁 fork 出一堆子进程」特别有用）、`F3` 搜索、`F4` 过滤、`F6` 排序、`F9` 发信号（相当于 kill）。`F2` 可以自定义顶部显示的仪表（如 load、磁盘 IO、网络）。它默认**不是所有系统都装**（需要 `yum install htop` 或 `apt install htop`），生产服务器上装不了就用 `top`。`htop` 读取 `/proc` 的方式与 top 略有差异，统计口径基本一致。',
      params: [
        { flag: '-u <用户>', desc: '只显示指定用户的进程' },
        { flag: '-p <PID>', desc: '只显示指定进程' },
        { flag: '-d <十分之一秒>', desc: '刷新间隔，`-d 10` 表示 1 秒' },
        { flag: '-t, --tree', desc: '直接以树形视图启动，看进程父子关系' },
        { flag: '-C, --no-color', desc: '关闭颜色，输出到文件或投屏时用' },
        { flag: 'F5 / F6 / F9', desc: '树形视图 / 选择排序字段 / 发送信号（kill）' }
      ],
      examples: [
        { cmd: 'htop', desc: '日常最常用：彩色界面，鼠标可点，F6 换排序字段' },
        { cmd: 'htop -u deploy -t', desc: '只看 deploy 用户的进程并以树形展开，排查进程分叉' },
        { cmd: 'htop -p 18442', desc: '只盯住应用进程 18442 的资源占用' },
        { cmd: 'htop -C -d 10', desc: '关闭颜色、1 秒刷新，适合录屏或远程终端' }
      ],
      notes: [
        '不是所有发行版都预装：RHEL/CentOS 需 `yum install htop`，Ubuntu/Debian 需 `apt install htop`，内网无源时可以用 `top` 替代',
        '`F9` 发送信号等同于 `kill`，选中进程后别手抖按到 `SIGKILL`',
        'htop 会读取所有进程信息，权限不足时看不到其他用户的完整命令行',
        '在极简容器镜像（如 alpine）里通常没有 htop，也不建议为了排障临时装包，直接用 `top`/`ps`'
      ],
      related: ['mo-top', 'mo-ps', 'mo-pidstat'],
      docs: 'https://htop.dev/',
      tags: ['进程', '交互', '工具']
    },

    /* ---------- 3 / 42 ---------- */
    {
      id: 'mo-ps',
      name: 'ps aux / ps -ef',
      alias: ['ps aux', 'ps -ef', 'ps --sort', 'ps -eo'],
      level: 1,
      syntax: 'ps aux [--sort=-%cpu|-%mem] / ps -eo <字段列表> --sort=-<字段>',
      summary: '抓一份进程快照，配合排序与自定义列做精确的进程排查。',
      desc: '两种风格：`ps aux`（BSD 风格，列有 `USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND`）和 `ps -ef`（System V 风格，列有 `UID PID PPID C STIME TTY TIME CMD`）——**`-ef` 会显示 PPID**，查父进程时用它。`--sort` 是排序利器：`--sort=-%cpu` 按 CPU 降序、`--sort=-%mem` 按内存降序、`--sort=-rss` 按实际内存降序。自定义列用 `-eo`，常用字段：`pid,ppid,user,%cpu,%mem,rss,etime,stat,lstart,cmd`。`STAT` 列含义要会读：`R` 运行、`S` 可中断睡眠、`D` **不可中断睡眠（通常在等 IO，是 load 高的常见原因）**、`Z` 僵尸、`T` 停止；后缀 `s` 会话首进程、`l` 多线程、`+` 前台进程组、`<` 高优先级、`N` 低优先级。线程用 `ps -T -p <PID>` 或 `ps -eLf`。',
      params: [
        { flag: 'aux', desc: 'BSD 风格全量进程，含 CPU/内存百分比' },
        { flag: '-ef', desc: 'System V 风格，含 PPID，查父子关系用' },
        { flag: '--sort=-%cpu / -%mem', desc: '按 CPU / 内存降序排序，前面的 `-` 表示倒序' },
        { flag: '-eo <字段>', desc: '自定义输出列，如 `-eo pid,ppid,etime,stat,cmd`' },
        { flag: '-T -p <PID>', desc: '显示指定进程的所有线程，找热点线程的第一步' },
        { flag: '-C <命令名>', desc: '按命令名过滤，如 `ps -C java -o pid,etime,cmd`' },
        { flag: '--no-headers', desc: '不输出表头，便于脚本处理' }
      ],
      examples: [
        { cmd: 'ps aux --sort=-%cpu | head -10', desc: 'CPU 占用前十的进程，最常用的排查起手式' },
        { cmd: 'ps -eo pid,ppid,user,%mem,rss,etime,stat,cmd --sort=-rss | head -10', desc: '按实际内存占用排序并带父进程与运行时长' },
        { cmd: 'ps aux | grep "[j]ava"', desc: '用 `[j]ava` 这种写法排除 grep 自身，找 Java 进程' },
        { cmd: 'ps -T -p 18442 -o spid,pcpu,stat,comm --sort=-pcpu | head -10', desc: '列出发热进程内的线程排行，拿到 TID 后交给 jstack 定位' },
        { cmd: 'ps -eo state,pid,cmd | grep "^D"', desc: '找处于 D 状态（等 IO）的进程，load 高但 CPU 不高时必查' }
      ],
      notes: [
        '`ps aux` 的 `%CPU` 是**进程生命周期内的平均值**，不是瞬时值，短时飙高的进程可能看不出来，实时看要用 `top` 或 `pidstat`',
        '`ps` 输出的是**快照**，不是实时刷新，脚本里循环采集要注意间隔',
        'grep 过滤进程时用 `grep "[j]ava"` 或 `grep -v grep` 排除 grep 自己，否则结果里总混进一条',
        '`D` 状态进程无法被 kill（信号要等系统调用返回才处理），持续 D 状态说明存储/网络文件系统有问题',
        '`Z` 僵尸进程本身不占资源，堆积说明父进程没回收子进程（检查父进程代码），`kill` 父进程才能清理'
      ],
      related: ['mo-top', 'mo-pgrep', 'mo-pidstat', 'mo-lsof'],
      docs: 'https://man7.org/linux/man-pages/man1/ps.1.html',
      tags: ['进程', '快照', '排查']
    },

    /* ---------- 4 / 42 ---------- */
    {
      id: 'mo-pgrep',
      name: 'pgrep / pkill',
      alias: ['pgrep', 'pkill', 'pkill -f', '按名字找进程'],
      level: 2,
      syntax: 'pgrep [选项] <模式> / pkill [-<信号>] [选项] <模式>',
      summary: '按名字或完整命令行匹配进程，批量操作前先 pgrep 确认再 pkill。',
      desc: '`pgrep` 返回匹配进程的 PID（一行一个），`pkill` 用同样的匹配规则**直接发信号**，两个命令共用参数。关键参数 `-f` 匹配**完整命令行**（不加 `-f` 只匹配进程名，长度限制 15 字符以内），这是最容易出事的选项：`pkill -f app.jar` 会匹配到任何命令行里含 `app.jar` 的进程，包括你自己的 `grep`/`vim` 会话。稳妥流程永远是**先 `pgrep -af` 看命中清单，确认无误再 `pkill`**。`-u <用户>` 限定用户，`-x` 精确匹配整个名字，`-n` 取最新、`-o` 取最老，`-c` 只数个数。',
      params: [
        { flag: '-f', desc: '匹配完整命令行（不加只匹配进程名）' },
        { flag: '-a', desc: '同时显示命令行，pgrep 排查时的必加项' },
        { flag: '-u <用户>', desc: '限定用户，如 `-u deploy`' },
        { flag: '-x', desc: '精确匹配整个进程名，避免误伤同前缀进程' },
        { flag: '-n / -o', desc: '只取最新 / 最老的匹配进程' },
        { flag: '-c', desc: '只输出匹配到的进程数量' },
        { flag: '-<信号>', desc: 'pkill 专用：如 `-HUP` 重载配置、`-TERM` 优雅退出、`-9` 强杀' }
      ],
      examples: [
        { cmd: 'pgrep -af "app.jar"', desc: '先看命中哪些进程（带命令行），确认无误再动手' },
        { cmd: 'pkill -HUP nginx', desc: '给 nginx 发 HUP 信号重载配置，不中断连接' },
        { cmd: 'pkill -u deploy -f "python3 worker.py"', desc: '只杀 deploy 用户的 worker 进程，缩小误伤范围' },
        { cmd: 'pgrep -c -u deploy', desc: '数一下 deploy 用户开了多少进程，异常暴涨时快速发现' }
      ],
      notes: [
        '**`pkill -f` 是误杀高发区**：模式越短越危险，务必先 `pgrep -af` 看命中清单，必要时加 `-u`/`-x` 收紧条件',
        '默认信号是 `SIGTERM`（15），给进程清理机会；`-9`（SIGKILL）不给机会，可能导致数据未落盘或文件损坏，只在进程卡死时用',
        '数据库、消息队列等有状态服务**不要用 pkill 停**，要用 `systemctl stop` 或服务自带命令（如 `mysqladmin shutdown`）',
        '`-f` 匹配的是 `/proc/<pid>/cmdline`，脚本名/参数含特殊字符时要转义',
        '容器里 pkill 可能匹配不到 Java 进程的真实名字，因为 PID 1 的命令行是 `java -jar app.jar`，用 `-f` 才匹配得上'
      ],
      related: ['mo-ps', 'mo-top', 'mo-lsof', 'ln-ss-kill'],
      docs: 'https://man7.org/linux/man-pages/man1/pgrep.1.html',
      tags: ['进程', '查找', '信号']
    },

    /* ---------- 5 / 42 ---------- */
    {
      id: 'mo-free',
      name: 'free -h',
      alias: ['free', 'free -m', 'available', '内存查看'],
      level: 1,
      syntax: 'free [-h|-m|-g] [-s <秒>] [-t]',
      summary: '看内存总量与使用情况，判断内存够不够只看 available 一列。',
      desc: '输出六列：`total`（总量）、`used`（已用）、`free`（完全空闲）、`shared`（tmpfs 等共享内存）、`buff/cache`（内核缓冲与页缓存）、`available`（**应用程序真正还能拿到的内存**）。**判读的核心是 `available`，不是 `free`**：Linux 会把空闲内存拿去做文件缓存，所以 `free` 很小是**正常且健康**的（缓存让读操作更快），内存紧张时内核会自动回收 `buff/cache` 给应用。只有当 `available` 也很小（比如低于总量 10%）才说明内存真的不够，接下来要关注 swap 是否被使用：`vmstat 1` 的 `si`/`so` 非 0 就说明在换页，性能会断崖下跌。本站仿真环境 `MemTotal` 约 7.6G、`MemFree` 只有 400M 但 `MemAvailable` 约 1.1G，正是「free 很小但还不算危险」的典型样本。',
      params: [
        { flag: '-h', desc: '人类可读单位（GiB/MiB），日常首选' },
        { flag: '-m / -g', desc: '按 MB / GB 显示，做容量核算时用' },
        { flag: '-s <秒>', desc: '每隔 N 秒刷新一次，观察内存变化趋势' },
        { flag: '-t', desc: '额外输出一行合计（内存 + swap）' },
        { flag: '-w', desc: '把 buff 与 cache 分列显示，默认是合并列' }
      ],
      examples: [
        { cmd: 'free -h', desc: '最常用：只看 available 一列判断内存是否真的紧张' },
        { cmd: 'free -h -s 5', desc: '每 5 秒刷新，观察 available 是否持续下降' },
        { cmd: 'free -m -t', desc: '按 MB 显示并带合计行，做容量规划时用' },
        { cmd: 'vmstat 1 5', desc: '配合看 si/so，确认是否已经在使用 swap（性能杀手）' }
      ],
      notes: [
        '**`free` 小不等于内存不足**：`buff/cache` 是可回收的，只看 `available` 才准确',
        '`available` 持续下降到很低时，先查是谁在涨（`ps aux --sort=-rss`、`top -o %MEM`），再考虑加内存或限制应用堆大小',
        '`si`/`so` 出现非 0 值说明在用 swap，数据库、消息队列这类服务一旦换页性能会急剧下降，应尽快处理',
        '`shared` 列较大通常是 tmpfs（`/dev/shm`、`/run`）占用，容器与数据库共享内存（如 PostgreSQL、Oracle）常见',
        '`free` 不区分 cgroup 限制：容器里看到的是宿主机内存，容器实际能用的看 `cat /sys/fs/cgroup/memory.max`（cgroup v2）',
        '本站仿真里 `/data` 盘的 inode 与容量都已 100%，内存类问题排查完记得顺手看一眼磁盘'
      ],
      related: ['mo-top', 'mo-vmstat', 'mo-proc', 'mo-ps'],
      docs: 'https://man7.org/linux/man-pages/man1/free.1.html',
      tags: ['内存', 'available', '巡检']
    },

    /* ---------- 6 / 42 ---------- */
    {
      id: 'mo-vmstat',
      name: 'vmstat',
      alias: ['vmstat', 'vmstat 1', '上下文切换', 'si so'],
      level: 2,
      syntax: 'vmstat [<间隔秒> [<次数>]] [-s] [-d] [-w]',
      summary: '一屏看全 CPU、内存、swap、IO 与上下文切换，定位瓶颈类型最快。',
      desc: '输出分两组列。**进程与内存**：`r`（等待运行的进程数，持续大于 CPU 核数说明 CPU 不够用）、`b`（处于不可中断睡眠的进程数，大于 0 基本就是 IO 阻塞）、`swpd`（已用 swap 大小）、`free`、`buff`、`cache`。**swap 与 IO**：`si`/`so`（每秒从 swap 换入/换出，**非 0 就是内存不足的硬信号**）、`bi`/`bo`（每秒从块设备读/写的块数，默认 1 块 = 1KB）。**系统**：`in`（每秒中断数）、`cs`（**每秒上下文切换次数**，几万以上且 CPU 高说明线程过多或锁竞争严重）。**CPU**：`us`/`sy`/`id`/`wa`（IO 等待）/`st`（被虚拟化层抢占）。定位套路：`r` 高 `us`/`sy` 高 → CPU 瓶颈；`b` 高 `wa` 高 → 磁盘瓶颈；`si`/`so` 非 0 → 内存不足；`cs` 极高但 CPU 不满 → 上下文切换/锁竞争。',
      params: [
        { flag: '<间隔> <次数>', desc: '如 `vmstat 1 5` 每秒采样共 5 次；不写参数则输出开机以来的平均值' },
        { flag: 'r / b', desc: '运行队列长度 / 阻塞（IO 等待）进程数' },
        { flag: 'si / so', desc: '每秒 swap 换入/换出，非 0 说明内存不够' },
        { flag: 'bi / bo', desc: '每秒块设备读/写块数（1 块约 1KB）' },
        { flag: 'cs / in', desc: '每秒上下文切换次数 / 中断次数' },
        { flag: '-s', desc: '以表格形式输出内存与事件的累计统计' },
        { flag: '-d', desc: '输出磁盘统计（读写次数、合并数、耗时）' },
        { flag: '-w', desc: '宽输出模式，列间距更大便于阅读' }
      ],
      examples: [
        { cmd: 'vmstat 1 5', desc: '每秒采样一次共 5 次，最常用的瓶颈初判命令' },
        { cmd: 'vmstat -s', desc: '看开机以来的累计统计（换页次数、中断总数等）' },
        { cmd: 'vmstat -d', desc: '看各磁盘设备的读写次数与合并情况' },
        { cmd: 'vmstat -w 1 10', desc: '宽输出连续采样，远程终端上更易读' }
      ],
      notes: [
        '不带参数执行时输出的第一行是**开机至今的平均值**，容易误导，做判断一定要带采样间隔',
        '第一行数据是上一个采样周期的平均值，趋势判断要从第二行开始看',
        '`r` 列要和 CPU 核数比较：4 核机器上 `r` 长期大于 4 才算 CPU 排队',
        '`b` 列大于 0 且持续存在，说明有进程卡在 IO 上，接着用 `iostat -x 1` 与 `ps -eo state,pid,cmd | grep "^D"` 深挖',
        '`cs` 的合理范围与业务相关：几万属正常，几十万且 `sy` 高说明系统调用或锁竞争严重'
      ],
      related: ['mo-free', 'mo-iostat', 'mo-top', 'mo-pidstat'],
      docs: 'https://man7.org/linux/man-pages/man8/vmstat.8.html',
      tags: ['性能', '内存', 'IO']
    },

    /* ---------- 7 / 42 ---------- */
    {
      id: 'mo-uptime',
      name: 'uptime / load average',
      alias: ['uptime', 'load average', '系统负载', '平均负载'],
      level: 2,
      syntax: 'uptime / cat /proc/loadavg / w',
      summary: '看 1、5、15 分钟平均负载，判断系统是忙还是被 IO 卡住了。',
      desc: '`uptime` 输出：当前时间、开机时长、登录用户数、`load average: 0.42, 0.68, 0.71`（依次是 1、5、15 分钟的平均值）。**load 的定义是「运行中 + 不可中断睡眠（D 状态）」的进程数平均值**——注意它把等 IO 的进程也算进去了，这正是「load 高但 CPU 不高」的根本原因。判断标准是**和 CPU 核数比**（`nproc`）：load 等于核数 ≈ 满载，大于核数说明有任务在排队，长期超过核数的 2 倍要处理。三个数值的走势也有含义：1 分钟远大于 15 分钟 = 负载正在突增；15 分钟高而 1 分钟低 = 刚经历过高峰，正在恢复。',
      params: [
        { flag: 'load average: 1/5/15', desc: '最近 1、5、15 分钟的平均负载，单位是「进程数」' },
        { flag: 'nproc', desc: '对比基准：CPU 核数，load 与它比较才有意义' },
        { flag: '/proc/loadavg', desc: 'load 的原始数据源，第 4 段是「运行中/总进程数」' },
        { flag: 'w', desc: '除 load 外还显示登录用户与其正在执行的命令' },
        { flag: '-p, --pretty', desc: '`uptime -p` 用自然语言显示开机时长' }
      ],
      examples: [
        { cmd: 'uptime', desc: '看 1/5/15 分钟负载与开机时长' },
        { cmd: 'nproc && uptime', desc: '先看核数再看 load，立刻知道负载是否超标' },
        { cmd: 'cat /proc/loadavg', desc: '取原始数据，最后一段是「运行中进程数/总进程数/最近PID」' },
        { cmd: 'ps -eo state,pid,cmd | grep "^D"', desc: 'load 高但 CPU 不忙时，找出卡在 D 状态的进程' }
      ],
      notes: [
        '**load 高但 CPU 不高，最常见的是磁盘 IO 瓶颈**：大量进程处于 D 状态等 IO，此时 `iostat -x 1` 的 `%util` 与 `await` 会很高',
        '第二类原因是**内存不足导致换页**：看 `vmstat 1` 的 `si`/`so` 是否非 0，swap 抖动会把 load 推高而 CPU 空闲',
        '第三类是**网络存储卡住**：NFS/NAS/云盘挂载点无响应时，访问该路径的进程会长期 D 状态，load 飙升（本站仿真里 `logs-pvc` 用的 `csi-nas` 就属于这类存储）',
        '第四类是**内核态问题**：驱动异常、硬件故障、内核锁竞争，配合 `dmesg -T` 看有没有 IO 错误或 OOM 记录',
        '容器里 `uptime` 读的是**宿主机**的 load，容器自身的负载要结合 cgroup 的 CPU 限流指标看',
        '排查顺序固定：`uptime` → `vmstat 1`（看 r/b/wa/si/so）→ `iostat -x 1`（看 %util/await）→ `ps` 找 D 状态进程 → `dmesg -T` 看硬件与 OOM'
      ],
      related: ['mo-top', 'mo-vmstat', 'mo-iostat', 'mo-free', 'mo-dmesg'],
      docs: 'https://man7.org/linux/man-pages/man1/uptime.1.html',
      tags: ['负载', '诊断', 'IO']
    },
    /* ---------- 8 / 42 ---------- */
    {
      id: 'mo-nproc',
      name: 'nproc',
      alias: ['CPU 核数', '几核', '--all', 'available processors'],
      level: 1,
      syntax: 'nproc [--all] [--ignore=<N>]',
      summary: '查看当前可用的 CPU 核数 —— 判断负载高低、设置并发度时的那个分母。',
      desc: '`nproc` 打印的是**当前进程可用的处理器数**，不是机器的物理核总数：它读的是内核给的 CPU 亲和性掩码（`sched_getaffinity`），所以会被 `taskset`、cgroup 的 **cpuset** 控制器裁掉一部分。**注意一个常见的误传**：cgroup 的 CPU 配额（`--cpus`、`cpu.max`）是"每周期能用多少时间"的限流，它**不改变亲和性掩码**，因此 `nproc` 并不会因为 `docker run --cpus=2` 而变小 —— 会按配额缩小的是 JDK 8u191+/11+ 的 `Runtime.availableProcessors()` 这类主动读 cgroup 的实现。`uptime` 里的 load average 必须除以它才有意义：本站仿真是 2 核，load `0.42` 约用了 21%，同一台机器换成 1 核就是 42%。',
      params: [
        { flag: '（无参数）', desc: '打印当前进程可用的处理器数，最常用' },
        { flag: '--all', desc: '打印系统安装的处理器总数，忽略 CPU 亲和性限制' },
        { flag: '--ignore=<N>', desc: '在可用数里再减掉 N 个，做容量预留估算时用' },
        { flag: '--version', desc: '确认 coreutils 版本；`--all`/`--ignore` 是较新版本才有的参数' }
      ],
      examples: [
        { cmd: 'nproc', desc: '拿到分母：本站仿真 2 核，接着去看 uptime 的负载' },
        { cmd: 'nproc --all', desc: '和上一个对比，判断当前进程是不是被 taskset/cpuset 限制了' },
        { cmd: 'lscpu | grep -E "^CPU\\(s\\)|^Model name"', desc: '顺带看清型号与核数结构，写容量报告时要用' },
        { cmd: 'grep -c processor /proc/cpuinfo', desc: '另一个口径的数法，和 `nproc` 互相印证' }
      ],
      notes: [
        '**load average 一定要除以核数**：单核 load 1.0 就是满载，8 核 load 4.0 才用了一半。只报"负载 4.0 很高"而不说几核，等于没说',
        '**`nproc` 不反映 CPU 配额**：`--cpus=2` / `cpu.max` 只限流、不改亲和性，所以容器里 `nproc` 常常还是宿主机核数；真正会按配额缩小的通常是 JVM/运行时自己的实现（JDK 8u191+ 起 `availableProcessors()` 会读 cgroup）',
        '容器里按"宿主机核数"去设线程池大小，是容器环境最常见的容量事故；要拿到配额，看 `cat /sys/fs/cgroup/cpu.max`（v2）或 `cpu.cfs_quota_us`（v1）',
        '`taskset -c 0-1` 这类亲和性设置会改变 `nproc` 的结果，`nproc --all` 才是不受影响的系统总量',
        '`--all` 与 `--ignore` 是较新的 coreutils 才提供的（老系统上会报 unrecognized option），脚本里用之前先 `nproc --version` 确认',
        '只想看"有几核"用 `nproc` 就够；要看每核型号、主频、NUMA 拓扑要用 `lscpu`，两者不是一回事'
      ],
      related: ['mo-uptime', 'mo-top', 'mo-vmstat', 'mo-pidstat'],
      docs: 'https://man7.org/linux/man-pages/man1/nproc.1.html',
      tags: ['CPU', '容量判断', '容器']
    },

    /* ---------- 9 / 42 ---------- */
    {
      id: 'mo-iostat',
      name: 'iostat -x',
      alias: ['iostat', 'iostat -x', '%util', 'await', '磁盘瓶颈'],
      level: 2,
      syntax: 'iostat -x [<间隔秒> [<次数>]] [-d] [-m] [-p] [-t]',
      summary: '看每块磁盘的利用率与 IO 等待时间，判断磁盘是不是瓶颈。',
      desc: '`-x` 是扩展统计模式，关键列：`r/s`/`w/s`（每秒读写次数，即 IOPS）、`rkB/s`/`wkB/s`（每秒读写吞吐）、`await`（**平均每次 IO 的等待毫秒数**，包含排队时间，是体验好坏的核心指标）、`r_await`/`w_await`（分开看读与写）、`aqu-sz`（平均请求队列长度，新版叫 `aqu-sz`，老版本叫 `avgqu-sz`）、`%util`（**设备忙碌时间百分比**）。判读经验：机械盘 `await` 超过 20ms、SSD 超过 5~10ms 就值得关注；`%util` 持续接近 100% 说明设备已经饱和；`aqu-sz` 持续大于 1 说明请求在排队。**注意 `%util` 的局限**：它是「设备有请求在处理的时间比例」，对支持多队列并行的 NVMe/RAID 会失真（`%util` 到 100% 但盘还没跑满），此时应结合 `await` 与吞吐量一起判断。',
      params: [
        { flag: '-x', desc: '扩展统计（含 await、%util 等），排查必加' },
        { flag: '<间隔> <次数>', desc: '如 `-x 1 5` 每秒采样共 5 次' },
        { flag: '-d', desc: '只显示磁盘统计，不显示 CPU 行' },
        { flag: '-m', desc: '吞吐以 MB/s 显示（默认 KB/s）' },
        { flag: '-p', desc: '显示分区级统计，排查某分区 IO 时用' },
        { flag: '-t', desc: '输出时间戳，便于与日志时间对齐' },
        { flag: '-z', desc: '不显示活动为 0 的设备，输出更干净' }
      ],
      examples: [
        { cmd: 'iostat -x 1 5', desc: '每秒采样一次共 5 次，看 %util 与 await 判断磁盘压力' },
        { cmd: 'iostat -x -d -m -z 1', desc: '只看有 IO 的磁盘、以 MB/s 显示，输出最清爽' },
        { cmd: 'iostat -x -p 1 3', desc: '按分区看 IO，定位是哪个分区在狂写' },
        { cmd: 'iostat -x -t 1 10', desc: '带时间戳连续采样，与业务日志对齐时间点' }
      ],
      notes: [
        '`%util` 对 NVMe/RAID 等多队列设备会失真，别只盯这一个值，要结合 `await` 与吞吐量',
        '第一次输出的数据是开机以来的累计平均，趋势判断从第二次开始看',
        '`await` 高但 `%util` 不高，可能是文件系统（如 ext4 日志）、RAID 卡写缓存策略或云盘后端限流导致',
        '本站仿真里 `/data` 盘已 100%、inode 也 100%，如果同时出现 `await` 高，优先怀疑小文件过多导致元数据压力',
        '云主机（如华为云 EVS）的 IOPS/带宽有配额上限，达到上限时 `await` 会明显上升，需要看云监控的磁盘指标',
        '`iostat` 属于 `sysstat` 包，精简系统要 `yum install sysstat` 或 `apt install sysstat`'
      ],
      related: ['mo-iotop', 'mo-vmstat', 'mo-pidstat', 'mo-uptime'],
      docs: 'https://man7.org/linux/man-pages/man1/iostat.1.html',
      tags: ['磁盘', 'IO', '性能']
    },

    /* ---------- 10 / 42 ---------- */
    {
      id: 'mo-sar',
      name: 'sar',
      alias: ['sar -u', 'sar -r', 'sar -n DEV', '历史性能'],
      level: 3,
      syntax: 'sar [-u|-r|-n DEV|-d|-q] [<间隔> <次数>] [-f <历史文件>] [-s <开始时间> -e <结束时间>]',
      summary: '既能实时采样也能回看历史，事后复盘性能问题的唯一手段。',
      desc: '`sar` 的价值有两层：实时采样（`sar -u 1 5`）与**回看历史**（数据由 `sysstat` 服务每 10 分钟采集一次，存到 `/var/log/sa/sa<日>`，用 `sar -f` 读取）。事故往往发生在夜里、发现时已经恢复，这时只有 `sar` 能还原当时的 CPU、内存、网络、磁盘曲线。常用组合：`-u`（CPU，含 `%iowait`、`%steal`）、`-r`（内存与 swap）、`-n DEV`（网络接口收发速率与包量）、`-n EDEV`（网络错误与丢包）、`-d`（磁盘）、`-q`（队列长度与 load）、`-b`（IO 与传输速率）、`-W`（swap 换页）。前提是 `sysstat` 服务处于启用状态：RHEL/CentOS 改 `/etc/sysconfig/sysstat` 的 `ENABLED="true"`，Ubuntu/Debian 改 `/etc/default/sysstat` 的 `ENABLED="true"`，然后启动服务。',
      params: [
        { flag: '-u', desc: 'CPU 使用率（含 iowait、steal），最常用' },
        { flag: '-r', desc: '内存与 swap 使用情况' },
        { flag: '-n DEV', desc: '网络接口流量（`-n EDEV` 看错误与丢包）' },
        { flag: '-d', desc: '块设备 IO 统计（新版被 `-b` 部分取代）' },
        { flag: '-q', desc: '运行队列长度与 load average' },
        { flag: '-f <文件>', desc: '读取历史数据文件，如 `-f /var/log/sa/sa18`' },
        { flag: '-s / -e', desc: '指定起止时间，如 `-s 09:00:00 -e 10:00:00`' },
        { flag: '-P <cpu|ALL>', desc: '按 CPU 核显示（`-P ALL`）' }
      ],
      examples: [
        { cmd: 'sar -u 1 5', desc: '实时看 CPU 各状态占比（含 iowait 与 steal）' },
        { cmd: 'sar -r 1 5', desc: '实时看内存与 swap，判断有没有换页' },
        { cmd: 'sar -n DEV 1 5', desc: '实时看各网卡的收发速率与包量，排查带宽瓶颈' },
        { cmd: 'sar -u -s 09:00:00 -e 10:00:00 -f /var/log/sa/sa18', desc: '回看 3 月 18 日 9~10 点的 CPU 历史（应用报超时的时间窗）' },
        { cmd: 'sar -n EDEV 1 5', desc: '看网卡错误与丢包，网络抖动类问题必查' }
      ],
      notes: [
        '历史数据依赖 `sysstat` 服务常开，很多系统默认装了包但**服务未启用**，出事时才发现没有历史数据',
        '历史文件默认保留约一个月（由 `HISTORY` 配置决定），重要系统要调长并纳入备份',
        '`%steal` 高说明虚拟机被宿主机抢走 CPU，云主机上出现要考虑升配或换独享型规格',
        '`sar` 实时采样与 `iostat`/`vmstat` 口径基本一致，历史回看只有 `sar` 能做（`atop` 也可以，需单独部署）',
        '不同发行版的 `sar` 参数与字段名略有差异（尤其 `-d`/`-b`），用 `sar -V` 确认版本后查对应手册'
      ],
      related: ['mo-iostat', 'mo-vmstat', 'mo-pidstat', 'mo-top'],
      docs: 'https://man7.org/linux/man-pages/man1/sar.1.html',
      tags: ['历史', '性能', '复盘']
    },

    /* ---------- 11 / 42 ---------- */
    {
      id: 'mo-pidstat',
      name: 'pidstat',
      alias: ['pidstat -u', 'pidstat -d', 'pidstat -w', '进程级监控'],
      level: 3,
      syntax: 'pidstat [-u|-r|-d|-w|-t] [<间隔> <次数>] [-p <PID>] [-C <命令名>]',
      summary: '按进程（甚至线程）看 CPU、内存、IO 与上下文切换的秒级变化。',
      desc: '`top` 只能看瞬时快照，`pidstat` 能给出**每秒钟的进程级明细**，是「到底哪个进程把磁盘写满」这类问题的答案。四类指标：`-u`（CPU：`%usr`/`%system`/`%CPU`，多核会累加）、`-r`（内存：`minflt`/`majflt` 缺页、`VSZ`/`RSS`、`%MEM`）、`-d`（IO：`kB_rd/s`/`kB_wr/s`/`kB_ccwr/s` 与 `iodelay`）、`-w`（上下文切换：`cswch/s` 自愿切换、`nvcswch/s` **非自愿切换**，后者高说明 CPU 竞争激烈）。加 `-t` 能**拆到线程级**，配合 `jstack` 定位 Java 热点线程；`-C <命令名>` 按命令名过滤比 `-p` 更方便。排查套路：CPU 高 → `pidstat -u 1`；内存涨 → `pidstat -r 1`；IO 高 → `pidstat -d 1`；卡顿但 CPU 不满 → `pidstat -w 1` 看非自愿切换。',
      params: [
        { flag: '-u', desc: 'CPU 使用率（用户态/内核态分开）' },
        { flag: '-r', desc: '内存：缺页次数、虚拟内存 VSZ、常驻内存 RSS、%MEM' },
        { flag: '-d', desc: '磁盘 IO：每秒读写 KB 与 IO 延迟' },
        { flag: '-w', desc: '上下文切换：自愿 / 非自愿切换次数' },
        { flag: '-t', desc: '显示线程级明细，Java 排障必备' },
        { flag: '-p <PID>', desc: '只统计指定进程（可逗号分隔多个）' },
        { flag: '-C <命令名>', desc: '按命令名过滤，如 `-C java`' },
        { flag: '-h', desc: '输出带表头的时间戳格式，便于脚本解析' }
      ],
      examples: [
        { cmd: 'pidstat -u 1 5', desc: '每秒列出各进程的 CPU 占用，找 CPU 大户' },
        { cmd: 'pidstat -d 1 5', desc: '看哪个进程在狂写磁盘，IO 瓶颈定位利器' },
        { cmd: 'pidstat -t -p 18442 1 5', desc: '拆到线程级看应用进程 18442，拿到 TID 再交给 jstack' },
        { cmd: 'pidstat -w -C java 1 5', desc: '看 Java 进程的上下文切换，非自愿切换高说明 CPU 抢不过来' },
        { cmd: 'pidstat -r -C mysqld 1 5', desc: '盯住 MySQL 进程的内存变化，判断是否存在内存泄漏' }
      ],
      notes: [
        '`%CPU` 在多核机器上是累加值，单进程可以超过 100%',
        '`-d` 显示的是**实际磁盘 IO**（不含页缓存命中），所以缓存命中率高时数字会很小，不代表没读写',
        '非自愿上下文切换（`nvcswch/s`）高通常意味着线程数远超 CPU 核数，或存在严重的锁竞争',
        '`pidstat` 也属于 `sysstat` 包；不带参数只输出一次，要看趋势必须带间隔与次数',
        '排查 Java 应用时 `-t` 给出的 TID 需要转成十六进制才能在 `jstack` 输出里搜到（见 `mo-jvm-jstack`）'
      ],
      related: ['mo-top', 'mo-ps', 'mo-iostat', 'mo-jvm-jstack'],
      docs: 'https://man7.org/linux/man-pages/man1/pidstat.1.html',
      tags: ['进程', '性能', 'sysstat']
    },

    /* ================= B. IO 与内核（6 条） ================= */

    /* ---------- 12 / 42 ---------- */
    {
      id: 'mo-iotop',
      name: 'iotop -o',
      alias: ['iotop', 'iotop -o', '谁在写磁盘'],
      level: 2,
      syntax: 'iotop [-o] [-P] [-a] [-d <秒>] [-n <次数>] [-b] [-u <用户>]',
      summary: '实时按进程显示磁盘读写速率，抓「谁在狂写磁盘」最直观。',
      desc: '`iotop` 像 `top` 一样刷新，但统计的是每个进程的磁盘读写。默认显示所有进程（含没有 IO 的一大批），加 `-o`（`--only`）**只显示真正有 IO 的进程**，这是最有用的参数。`-P` 只显示进程不显示线程，`-a` 显示累计 IO 而不是速率，`-b` 批处理模式（配合 `-n` 输出到文件），`-d` 指定刷新间隔，`-u` 过滤用户。列的读法：`DISK READ`/`DISK WRITE` 是**实际落到磁盘**的速率（不含页缓存命中，所以缓存写多的时候数字偏小）、`SWAPIN` 是换入占比、`IO>` 是 IO 等待占比。需要 root 权限，并且依赖内核的 taskstats 接口；容器里通常看不到宿主机其他进程的 IO。',
      params: [
        { flag: '-o, --only', desc: '只显示有实际 IO 的进程，必加' },
        { flag: '-P, --processes', desc: '只显示进程，不展开线程' },
        { flag: '-a, --accumulated', desc: '显示累计 IO 量而不是实时速率' },
        { flag: '-d <秒>', desc: '刷新间隔，默认 1 秒' },
        { flag: '-n <次数>', desc: '刷新 N 次后退出，配合 `-b` 留证据' },
        { flag: '-b, --batch', desc: '批处理模式，非交互输出' },
        { flag: '-u <用户>', desc: '只看指定用户的进程' }
      ],
      examples: [
        { cmd: 'iotop -o', desc: '只显示正在读写磁盘的进程，抓 IO 元凶第一条命令' },
        { cmd: 'iotop -o -P -d 2', desc: '只看进程（不展开线程）、2 秒刷新，输出更聚焦' },
        { cmd: 'iotop -o -b -n 5 > /tmp/iotop-$(date +%F-%H%M).txt', desc: '批处理抓 5 次快照存文件，作为故障证据' },
        { cmd: 'iotop -o -u deploy', desc: '只看 deploy 用户产生的 IO' }
      ],
      notes: [
        '需要 root 权限，普通用户执行会报 `Cannot open /proc/net/dev` 或权限不足',
        '`DISK READ/WRITE` 是**实际磁盘 IO**，被页缓存吸收的写不会体现在这里，所以数字小不等于没在写',
        '内核需开启 `CONFIG_TASK_DELAY_ACCT`/`CONFIG_TASK_IO_ACCOUNTING`，部分精简内核或容器环境读不到数据（此时退回 `pidstat -d 1`）',
        '容器里 iotop 只能看到本容器命名空间内的进程，宿主机整体 IO 要在宿主机上查',
        '找不到明显的写盘进程时，别忘了内核自身（日志刷盘、`kswapd`、`jbd2`）也在写，`iotop` 会显示为内核线程'
      ],
      related: ['mo-iostat', 'mo-pidstat', 'mo-lsof', 'mo-log-disk-full'],
      docs: 'https://man7.org/linux/man-pages/man8/iotop.8.html',
      tags: ['IO', '进程', '实时']
    },

    /* ---------- 13 / 42 ---------- */
    {
      id: 'mo-lsof',
      name: 'lsof',
      alias: ['lsof -i', 'lsof +L1', 'lsof -p', '端口占用'],
      level: 2,
      syntax: 'lsof [-i [协议]:[端口]] [-p <PID>] [-u <用户>] [+L1] [-n] [-P] [文件|目录]',
      summary: '列出进程打开的文件与网络连接，查端口占用和磁盘不释放的利器。',
      desc: '`lsof` 是「list open files」，Linux 里一切皆文件，所以它既能查端口也能查文件句柄。四种常用姿势：① **查端口占用**：`lsof -i :8080`（谁占了 8080）、`lsof -i tcp:3306`、`lsof -i @10.0.1.23`（与某地址的连接）；② **查进程打开了什么**：`lsof -p <PID>`；③ **查目录被谁占用**：`lsof /data`（卸载文件系统前必做，否则报 `device is busy`）；④ **查磁盘空间不释放**：`lsof +L1` 列出 **link count 小于 1** 的文件，也就是「已经 `rm` 删除、但仍有进程持有句柄」的文件——这时 `df` 显示磁盘满，`du` 却怎么都找不到大文件，只能靠它揪出来。加 `-n` 不解析主机名、`-P` 不解析端口名，能显著加快输出（默认会做 DNS 反查，卡住很常见）。',
      params: [
        { flag: '-i :<端口>', desc: '按端口过滤，如 `-i :8080`、`-i tcp:3306`' },
        { flag: '-p <PID>', desc: '列出该进程打开的所有文件与连接' },
        { flag: '+L1', desc: '列出 link count < 1 的文件（已删除但仍被占用）' },
        { flag: '-u <用户>', desc: '按用户过滤，如 `-u deploy`' },
        { flag: '-c <命令名>', desc: '按进程名过滤，如 `-c java`' },
        { flag: '-n / -P', desc: '不解析主机名 / 不解析端口名，避免 DNS 卡顿' },
        { flag: '-t', desc: '只输出 PID，便于管道传给 kill' }
      ],
      examples: [
        { cmd: 'lsof -i :8080', desc: '看谁占用了 8080 端口，发布时端口冲突必用' },
        { cmd: 'lsof -nP -p 18442 | head -20', desc: '看应用进程打开了哪些文件与连接（不做 DNS 解析，快）' },
        { cmd: 'lsof +L1', desc: '揪出「已删除但仍被占用」的文件，磁盘空间不释放的元凶' },
        { cmd: 'lsof /data', desc: '看谁在占用 /data，卸载或扩容前必须确认' },
        { cmd: 'lsof -nP -i tcp:3306 | grep ESTABLISHED | wc -l', desc: '统计到 3306 的已建立连接数，看连接是否泄漏' }
      ],
      notes: [
        '默认会做 DNS 反查，网络不通时会卡很久，排障时建议固定加 `-nP`',
        '`lsof +L1` 找到的已删除文件，**只有重启或 reload 持有它的进程才能真正释放空间**；用 `> /proc/<PID>/fd/<FD>` 清空是应急手段但同样有风险',
        '删日志文件前先确认没有进程持有句柄（否则空间不释放），正确做法是 `> file` 清空或用 `logrotate` 切割并通知进程重开文件',
        '非 root 用户只能看到自己的进程，查端口占用时经常需要用 root 或 `sudo`',
        '`lsof` 输出可能极长，一定配合 `grep`/`head` 使用，直接跑会刷屏',
        '本站仿真里 `/data` 容量与 inode 都是 100%，`lsof +L1` 是这种情况下必跑的一条命令'
      ],
      related: ['mo-ps', 'mo-iotop', 'mo-log-disk-full', 'ln-lsof', 'ln-ss'],
      docs: 'https://man7.org/linux/man-pages/man8/lsof.8.html',
      tags: ['文件句柄', '端口', '磁盘']
    },

    /* ---------- 14 / 42 ---------- */
    {
      id: 'mo-strace',
      name: 'strace -p',
      alias: ['strace', 'strace -p', '系统调用跟踪'],
      level: 4,
      syntax: 'strace -p <PID> [-f] [-T] [-tt] [-e trace=<类别>] [-c] [-o <文件>] [-s <长度>]',
      summary: '跟踪进程的系统调用，看它能卡在哪个调用上，生产务必限时使用。',
      desc: '当进程「没反应又没日志」时，`strace` 能告诉你它到底在干什么：`-p <PID>` 附加到运行中的进程，`-f` 跟随子进程/线程，`-T` 显示每个调用耗时（**找卡点最有用**），`-tt` 加时间戳，`-e trace=file|network|process|signal|desc` 按类别过滤（不加过滤输出会刷屏），`-c` 只输出统计汇总（哪种调用最频繁、耗时最多），`-o <文件>` 输出到文件，`-s <长度>` 加长字符串显示（默认只截断 32 字节）。经典用法：`strace -f -T -tt -e trace=network -p <PID>` 看它在等哪个网络连接；`strace -c -p <PID>` 跑 10 秒看系统调用分布。**替代方案更安全**：`perf trace`、`bpftrace`、`cat /proc/<PID>/wchan`（看内核等待点）、`cat /proc/<PID>/stack`，条件允许优先用这些。',
      params: [
        { flag: '-p <PID>', desc: '附加到指定进程（可多个）' },
        { flag: '-f', desc: '跟随 fork 出的子进程与线程' },
        { flag: '-T', desc: '显示每个系统调用的耗时，找卡点核心参数' },
        { flag: '-tt', desc: '每个调用前加精确时间戳' },
        { flag: '-e trace=<类别>', desc: '只跟踪指定类别：`file`/`network`/`process`/`signal`/`desc`' },
        { flag: '-c', desc: '只输出系统调用统计汇总' },
        { flag: '-o <文件>', desc: '输出写入文件，避免刷屏' },
        { flag: '-s <长度>', desc: '字符串最大显示长度，默认 32' }
      ],
      examples: [
        { cmd: 'timeout 10 strace -f -T -tt -p 18442 -o /tmp/strace-18442.log', desc: '限时 10 秒抓系统调用与耗时，之后用 grep 找耗时最大的调用' },
        { cmd: 'timeout 5 strace -c -p 18442', desc: '只输出系统调用统计，快速看它主要在干什么' },
        { cmd: 'timeout 10 strace -f -e trace=network -p 18442', desc: '只看网络相关调用，定位卡在哪个连接上' },
        { cmd: 'cat /proc/18442/wchan', desc: '不侵入地看进程当前等待在内核哪个函数上，strace 的安全替代' }
      ],
      notes: [
        '**生产环境慎用**：`strace` 会让目标进程每次系统调用都停下来通知 tracer，性能下降几倍到几十倍；高频调用（如高 QPS 服务）的进程可能被拖到超时甚至假死',
        '必须**限时使用**：用 `timeout 10 strace ...` 包起来，或抓够立刻 Ctrl+C，绝不要挂着不管',
        '不要在数据库、消息队列、网关这类核心进程上直接 strace，除非已做好业务受损的准备',
        '`-f` 会跟随所有子进程，输出量与开销都成倍增加，容器里尤其容易把 PID 命名空间搞乱',
        '部分内核开启了 `ptrace_scope` 限制（`/proc/sys/kernel/yama/ptrace_scope`），非 root 或跨用户附加会报 `Operation not permitted`',
        '优先考虑低开销替代：`perf trace`、`bpftrace`、`/proc/<PID>/wchan`、`/proc/<PID>/stack`、应用自身的线程栈（如 `jstack`）'
      ],
      related: ['mo-perf', 'mo-lsof', 'mo-ps', 'mo-jvm-jstack'],
      docs: 'https://man7.org/linux/man-pages/man1/strace.1.html',
      tags: ['系统调用', '危险', '排障']
    },

    /* ---------- 15 / 42 ---------- */
    {
      id: 'mo-dmesg',
      name: 'dmesg -T',
      alias: ['dmesg', 'dmesg -T', 'OOM', '内核日志', '硬件错误'],
      level: 2,
      syntax: 'dmesg [-T] [-w] [--level=<级别>] [-H] | grep <关键字>',
      summary: '看内核环形缓冲区日志，OOM 杀进程与磁盘硬件报错都在这里。',
      desc: '`dmesg` 读的是内核日志缓冲区，**加 `-T` 才会把相对时间戳转成人类可读时间**（否则是一串看不懂的秒数），加 `-H` 更友好（带分页与颜色）。两类必查内容：① **OOM（内存耗尽）**：`dmesg -T | grep -i "out of memory"`、`grep -i "killed process"`、`grep -i oom`，内核 OOM Killer 会按 `oom_score` 挑一个进程杀掉，日志里能看到被杀进程名与 PID；容器场景对应 cgroup OOM（`docker inspect` 里 `OOMKilled: true`，本站仿真的 `debug-tmp` 容器就是这样被杀的）。② **硬件与驱动错误**：`dmesg -T --level=err,warn` 看错误与警告，重点找 `I/O error, dev sdb`（磁盘坏道/链路问题）、`ata`/`nvme` 报错、`EXT4-fs error`、网卡 `link is not ready`、内存 `EDAC`/ECC 报错。注意 `dmesg` 是**环形缓冲区**，重启即丢，要留档就用 `dmesg -T > file` 或看 `journalctl -k`。',
      params: [
        { flag: '-T', desc: '显示人类可读的时间戳（否则是开机以来的秒数）' },
        { flag: '-H, --human', desc: '更友好的输出（分页、彩色、相对时间）' },
        { flag: '-w, --follow', desc: '实时跟踪新产生内核消息，等价于 `tail -f`' },
        { flag: '--level=err,warn', desc: '只显示指定级别：`emerg`/`alert`/`crit`/`err`/`warn`/`notice`/`info`/`debug`' },
        { flag: '-k', desc: '显示内核日志（配合 journalctl 使用时是 `journalctl -k`）' },
        { flag: '-c, --read-clear', desc: '读取并清空缓冲区（会丢证据，慎用）' }
      ],
      examples: [
        { cmd: 'dmesg -T | grep -i "out of memory"', desc: '确认是否发生过 OOM，内存类故障第一步' },
        { cmd: 'dmesg -T | grep -iE "killed process|oom-kill"', desc: '看被杀掉的是哪个进程，判断是谁把内存吃光了' },
        { cmd: 'dmesg -T --level=err,warn | tail -50', desc: '看最近的错误与警告，磁盘/网卡硬件问题常在这' },
        { cmd: 'dmesg -T > /tmp/dmesg-$(date +%F-%H%M).txt', desc: '留档，重启后缓冲区内容就没了' },
        { cmd: 'dmesg -Tw --level=err', desc: '实时跟踪内核错误，压测或变更期间观察' }
      ],
      notes: [
        '不加 `-T` 看到的是「开机以来的秒数」，与业务日志对不上时间，排障时一定加',
        '`dmesg` 是**环形缓冲区**：写满后新日志覆盖旧日志，重启后清空；要长期保留内核日志请依赖 `journalctl -k` 或 rsyslog 的 `/var/log/dmesg`',
        'OOM 日志只能证明「内核杀了进程」，根因还要看是谁在涨内存（`ps aux --sort=-rss`、`top -o %MEM`）',
        '容器里的 OOM 通常不体现在宿主机 dmesg，要到 `docker inspect <容器>` 看 `State.OOMKilled`，或 `dmesg | grep -i "memory cgroup"`',
        '看到 `I/O error` / `medium error` 这类磁盘报错要立刻安排巡检与更换（`smartctl -a /dev/sdb`），别等盘彻底坏',
        '`dmesg -c` 会清空缓冲区，排障过程中千万不要用，会丢掉唯一证据'
      ],
      related: ['mo-log-journalctl', 'mo-free', 'mo-uptime', 'mo-proc'],
      docs: 'https://man7.org/linux/man-pages/man1/dmesg.1.html',
      tags: ['内核', 'OOM', '硬件']
    },

    /* ---------- 16 / 42 ---------- */
    {
      id: 'mo-proc',
      name: '/proc 关键文件速查',
      kind: 'recipe',
      alias: ['/proc/meminfo', '/proc/loadavg', '/proc/mounts', '/proc/stat', '虚拟文件系统'],
      level: 3,
      syntax: 'cat /proc/<文件>  或  cat /proc/<PID>/<文件>',
      summary: '内核暴露的实时数据接口，所有监控工具的数据其实都来自这里。',
      desc: '`/proc` 是内核的虚拟文件系统，`top`/`free`/`iostat` 都只是它的美化版，直接读它最快也最准。**系统级**：`/proc/meminfo`（内存明细，`MemAvailable` 就是 `free -h` 的 available）、`/proc/loadavg`（load，第 4 段是运行中/总进程数）、`/proc/uptime`（开机秒数与空闲秒数）、`/proc/stat`（CPU 各状态累计 jiffies，算 CPU 利用率的原始数据）、`/proc/mounts`（当前挂载，比 `/etc/mtab` 更可信）、`/proc/cpuinfo`（CPU 型号与核数）、`/proc/diskstats`（磁盘 IO 原始计数）、`/proc/net/dev`（网卡收发包与字节）、`/proc/sys/`（sysctl 参数，可直接 `cat`，写它等于 `sysctl -w`）。**进程级**：`/proc/<PID>/status`（`VmRSS` 实际内存、`Threads` 线程数、`State` 状态）、`/proc/<PID>/io`（`read_bytes`/`write_bytes` 真实磁盘 IO，与缓存无关）、`/proc/<PID>/fd/`（打开的文件描述符，句柄泄漏就看这里个数）、`/proc/<PID>/limits`（进程级 ulimit）、`/proc/<PID>/cmdline`、`/proc/<PID>/wchan`（等待在内核哪个函数）。',
      params: [
        { flag: '/proc/meminfo', desc: '内存明细，看 `MemAvailable` 判断真实可用内存' },
        { flag: '/proc/loadavg', desc: '平均负载原始数据，与 uptime 一致' },
        { flag: '/proc/mounts', desc: '当前所有挂载点与参数，比 `mount` 输出更权威' },
        { flag: '/proc/stat', desc: 'CPU/中断/上下文切换累计计数，监控计算的原始来源' },
        { flag: '/proc/<PID>/status', desc: '进程状态、VmRSS 内存、线程数' },
        { flag: '/proc/<PID>/io', desc: '进程真实磁盘读写字节数（绕过页缓存）' },
        { flag: '/proc/<PID>/fd/', desc: '打开的文件描述符清单，句柄泄漏排查' },
        { flag: '/proc/sys/', desc: '内核参数目录，可直接读，写等于 sysctl -w' }
      ],
      examples: [
        { cmd: 'grep -E "MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree" /proc/meminfo', desc: '看内存核心指标，MemAvailable 才是真实可用' },
        { cmd: 'cat /proc/loadavg', desc: '读负载原始数据，第 4 段是运行中/总进程数' },
        { cmd: 'cat /proc/mounts | grep -E "data|docker"', desc: '确认 /data 与 docker 目录的挂载来源与参数' },
        { cmd: 'cat /proc/2210/io; grep -E "VmRSS|Threads" /proc/2210/status', desc: '看 mysqld（PID 2210）的真实磁盘 IO、内存与线程数' },
        { cmd: 'ls /proc/18442/fd | wc -l', desc: '数应用进程打开的文件描述符数量，判断有没有句柄泄漏' }
      ],
      notes: [
        '`/proc/<PID>/io` 的 `read_bytes`/`write_bytes` 是**真实落盘字节**，不含页缓存命中，与 `iostat` 口径一致（`rchar`/`wchar` 才是含缓存的逻辑读写量）',
        '`/proc` 里的值都是**实时生成**的，读取有微小开销，不要写高频轮询脚本（每秒几十次以上）',
        '容器里看到的 `/proc/meminfo`、`/proc/cpuinfo` 多数是**宿主机**信息，容器实际配额在 cgroup 目录（`/sys/fs/cgroup/`）',
        '`/proc/sys` 下的参数写入即生效但**重启失效**，持久化要写 `/etc/sysctl.conf` 或 `/etc/sysctl.d/*.conf`',
        '进程退出后对应的 `/proc/<PID>` 立即消失，取证要在进程存活时抓（脚本里先保存快照）',
        '读 `/proc/<PID>/fd/` 需要 root 或同用户权限，否则报 `Permission denied`'
      ],
      related: ['mo-free', 'mo-vmstat', 'mo-lsof', 'mo-dmesg'],
      docs: 'https://man7.org/linux/man-pages/man5/proc.5.html',
      tags: ['内核', '数据源', '速查']
    },

    /* ---------- 17 / 42 ---------- */
    {
      id: 'mo-perf',
      name: 'perf top / 火焰图',
      kind: 'recipe',
      alias: ['perf top', 'perf record', '火焰图', 'flamegraph'],
      level: 4,
      syntax: 'perf top [-p <PID>] / perf record -F <频率> -p <PID> -g -- sleep <秒> / perf script | flamegraph.pl > flame.svg',
      summary: '采样式性能剖析，找出函数级热点并生成火焰图，开销远小于 strace。',
      desc: '`perf` 是内核自带的采样剖析工具，**采样而非逐调用拦截**，所以对目标进程的开销通常只有几个百分点，比 `strace` 安全得多，适合生产短时使用。三个层次：① `perf top`（实时看当前系统的函数级热点，相当于内核态与用户态的 `top`，`-p` 限定进程，`-e cpu-clock`/`-e cycles` 换事件源）；② `perf record -F 99 -p <PID> -g -- sleep 30` 采样 30 秒写入 `perf.data`，`-g` 记录调用栈（火焰图必需），`-F 99` 表示每秒采样 99 次（标准做法，避免与定时器同步造成偏差）；③ `perf report` 交互查看，或导出生成**火焰图**：`perf script > out.perf`，再用 Brendan Gregg 的 FlameGraph 工具 `stackcollapse-perf.pl out.perf | flamegraph.pl > flame.svg`。火焰图横轴是时间占比、纵轴是调用栈深度，**横条越宽说明该函数占用 CPU 越多**，一眼就能看出瓶颈在业务代码、JVM GC 还是系统调用。',
      params: [
        { flag: 'perf top', desc: '实时显示系统或指定进程的函数级热点' },
        { flag: '-p <PID>', desc: '只剖析指定进程' },
        { flag: '-e <事件>', desc: '指定事件源，如 `cpu-clock`、`cycles`、`syscalls:sys_enter_read`' },
        { flag: 'perf record -F <频率>', desc: '采样频率，通常 99 Hz' },
        { flag: '-g', desc: '记录调用图（调用栈），生成火焰图必须加' },
        { flag: 'perf report', desc: '交互式查看采样结果' },
        { flag: 'perf script', desc: '把 perf.data 导出为文本，喂给火焰图脚本' },
        { flag: 'perf stat', desc: '看程序整体指标（指令数、缓存命中、上下文切换）' }
      ],
      examples: [
        { cmd: 'perf top -p 18442', desc: '实时看应用进程 18442 的函数级热点，找 CPU 消耗在哪' },
        { cmd: 'perf record -F 99 -p 18442 -g -- sleep 30', desc: '采样 30 秒并记录调用栈，生成火焰图的第一步' },
        { cmd: 'perf report --stdio | head -40', desc: '文本方式看采样结果，确认哪个符号占比最高' },
        { cmd: 'perf script > /tmp/out.perf && stackcollapse-perf.pl /tmp/out.perf | flamegraph.pl > /tmp/flame.svg', desc: '生成火焰图（需 FlameGraph 工具集），直观定位热点栈' }
      ],
      notes: [
        '需要安装 `perf`：RHEL/CentOS 装 `perf` 包，Ubuntu/Debian 装 `linux-tools-common`/`linux-tools-$(uname -r)`，版本要与内核匹配',
        '容器里默认没有权限访问 perf 事件，需要 `--cap-add SYS_ADMIN`（或 PERFMON）并调整 `/proc/sys/kernel/perf_event_paranoid`（容器内通常不可写，需宿主机调整）',
        '`/proc/sys/kernel/perf_event_paranoid` 值越大限制越严，生产环境不要为了排障长期调成 -1',
        '`perf record` 的频率不要设得太高（99Hz 足够），过高会明显增加开销并产生巨大数据文件',
        'Java 应用建议加 `-XX:+PreserveFrameCache`（或使用 async-profiler）才能看到完整的 Java 栈，否则火焰图里大量显示为 `[unknown]`',
        '`perf` 采样虽轻量，仍建议短时限时使用（`-- sleep 30` 这种写法能自动结束），避免长时间挂在核心进程上'
      ],
      related: ['mo-strace', 'mo-top', 'mo-pidstat', 'mo-jvm-jstack'],
      docs: 'https://man7.org/linux/man-pages/man1/perf-top.1.html',
      tags: ['性能剖析', '火焰图', '采样']
    },

    /* ================= C. 日志体系（8 条） ================= */

    /* ---------- 18 / 42 ---------- */
    {
      id: 'mo-log-journalctl',
      name: 'journalctl',
      alias: ['journalctl -u', 'journalctl -f', 'journalctl --since', '-p err', 'systemd 日志'],
      level: 1,
      syntax: 'journalctl [-u <单元>] [-f] [--since <时间>] [-p <级别>] [-b] [-n <行数>] [-o <格式>]',
      summary: '查 systemd 统一日志，按服务、时间、级别过滤，排障最常用的日志命令。',
      desc: 'systemd 系统里应用与内核日志统一由 journald 收集，`journalctl` 是唯一的查询入口。五种过滤维度可以任意组合：**按服务** `-u myapp`（本站仿真里 `myapp` 就是那个 Java 应用）、**按时间** `--since "2024-03-18 09:00:00"` 或 `--since "1 hour ago"`、**按级别** `-p err`（级别从 0 到 7：`emerg`/`alert`/`crit`/`err`/`warning`/`notice`/`info`/`debug`，写 `-p err` 表示 err 及更严重）、**按启动** `-b`（本次启动）/`-b -1`（上一次启动，排查「重启前发生了什么」必用）、**按行数** `-n 100` 配合 `-r` 倒序。`-f` 实时跟踪（类似 `tail -f`）。输出格式用 `-o` 切换：默认 `short`、`-o short-iso` 带 ISO 时间戳、`-o json`/`json-pretty` 结构化输出（喂给 jq 分析）、`-o cat` 只留消息本体。`--disk-usage` 看日志占了多少磁盘，`--vacuum-time=7d`/`--vacuum-size=1G` 清理历史。',
      params: [
        { flag: '-u <单元>', desc: '只看指定服务，如 `-u myapp`、`-u nginx`' },
        { flag: '-f, --follow', desc: '实时跟踪新日志，等价于 `tail -f`' },
        { flag: '--since / --until', desc: '时间过滤，支持 `"2024-03-18 09:00:00"`、`"1 hour ago"`、`yesterday`' },
        { flag: '-p <级别>', desc: '按优先级过滤：`err`、`warning`、`crit` 等（含更严重级别）' },
        { flag: '-b [N]', desc: '本次启动的日志；`-b -1` 看上一次启动（崩机复盘）' },
        { flag: '-n <行数> / -r', desc: '只显示最后 N 行 / 倒序输出（最新的在最上）' },
        { flag: '-o <格式>', desc: '输出格式：`short-iso`、`json`、`json-pretty`、`cat`、`verbose`' },
        { flag: '--disk-usage / --vacuum-time', desc: '查看日志占用 / 按时间清理（如 `--vacuum-time=7d`）' }
      ],
      examples: [
        { cmd: 'journalctl -u myapp -n 100 --no-pager', desc: '看 myapp 服务最近 100 行日志（不进入分页器，适合脚本）' },
        { cmd: 'journalctl -u myapp --since "2024-03-18 09:40:00" -p err', desc: '只看 9:40 之后的错误级别日志，对应应用报 query timeout 的时间窗' },
        { cmd: 'journalctl -f -u myapp', desc: '实时跟踪服务日志，改配置或复现问题时用' },
        { cmd: 'journalctl -b -1 -p err', desc: '看上一次启动期间的错误，排查「机器重启过、服务为什么没起来」' },
        { cmd: 'journalctl -u myapp -o json-pretty | jq -r \'.MESSAGE\' | tail -50', desc: '结构化输出配合 jq 提取消息，便于二次处理' },
        { cmd: 'journalctl --disk-usage', desc: '看日志占了多少磁盘，日志写满盘时的第一条命令' }
      ],
      notes: [
        '默认日志可能**只存在内存**（`/run/log/journal`），重启即丢；要持久化必须开 `Storage=persistent`（见 `mo-log-journald-conf`）',
        '`-p err` 是「err 及更严重」，不是「只有 err」，要精确匹配得用 `-o json` 加 jq 过滤 `PRIORITY`',
        '输出默认进 `less` 分页器，脚本里必须加 `--no-pager`，否则会卡住',
        '`journalctl` 的日志与 rsyslog 的 `/var/log/messages` 是两套来源，同一件事可能两边都有，排查时别只看一边',
        '`--vacuum-*` 清理是**不可恢复**的，清理前先确认没有合规审计要求',
        '本站仿真里 `myapp` 是 `java -jar /opt/myapp/app.jar`，日志同时写 journald 与 `/data/app/logs/app.log`，两条线都可以查'
      ],
      related: ['mo-log-journald-conf', 'mo-log-var-log', 'mo-log-tail', 'lu-journalctl'],
      docs: 'https://man7.org/linux/man-pages/man1/journalctl.1.html',
      tags: ['systemd', '日志', '查询']
    },

    /* ---------- 19 / 42 ---------- */
    {
      id: 'mo-log-journald-conf',
      name: 'journald.conf 持久化配置',
      kind: 'recipe',
      alias: ['journald.conf', 'Storage=persistent', 'SystemMaxUse', '日志持久化'],
      level: 3,
      syntax: 'vim /etc/systemd/journald.conf（改 Storage=persistent 等）→ systemctl restart systemd-journald',
      summary: '让 systemd 日志落盘保存，否则重启后现场证据全部消失。',
      desc: 'journald 的**默认行为很容易踩坑**：`Storage=auto` 表示「`/var/log/journal` 目录存在就落盘，不存在就只写内存（`/run/log/journal`）」。很多系统装完就是没有这个目录，于是所有日志重启即丢，事故复盘时什么都查不到。开启持久化三步：`mkdir -p /var/log/journal` → `systemd-tmpfiles --create --prefix /var/log/journal`（创建目录结构并设置正确属性，**这一步不能省**）→ `systemctl restart systemd-journald`。常用配置项：`Storage=persistent`（强制落盘）、`SystemMaxUse=2G`（磁盘上日志总量上限）、`SystemKeepFree=1G`（至少保留多少空闲空间，**磁盘紧张时这条很关键**）、`RuntimeMaxUse=200M`（内存中日志上限）、`MaxRetentionSec=1month`（最长保留时间）、`Compress=yes`（压缩，默认开）、`ForwardToSyslog=yes`（同时转发给 rsyslog，保留 `/var/log/messages`）。配合 `journalctl --disk-usage` 与 `journalctl --vacuum-size=1G` 做容量治理。',
      params: [
        { flag: 'Storage=persistent', desc: '强制落盘到 `/var/log/journal`；`auto` 看目录是否存在' },
        { flag: 'Storage=volatile', desc: '只写内存 `/run/log/journal`，重启即丢' },
        { flag: 'SystemMaxUse=<大小>', desc: '磁盘日志总量上限，如 `2G`' },
        { flag: 'SystemKeepFree=<大小>', desc: '始终保留的空闲磁盘空间，磁盘快满时优先保障' },
        { flag: 'MaxRetentionSec=<时间>', desc: '日志最长保留时间，如 `1month`' },
        { flag: 'ForwardToSyslog=yes', desc: '同时转发给 rsyslog，保留传统 `/var/log/messages`' },
        { flag: 'Compress=yes', desc: '压缩存储（默认开启）' }
      ],
      examples: [
        { cmd: 'grep -vE "^#|^$" /etc/systemd/journald.conf', desc: '先看当前生效的配置（未注释的行），确认 Storage 是什么' },
        { cmd: 'mkdir -p /var/log/journal && systemd-tmpfiles --create --prefix /var/log/journal && systemctl restart systemd-journald', desc: '开启持久化的标准三步，缺一步都可能不生效' },
        { cmd: 'journalctl --disk-usage', desc: '确认日志占用了多少磁盘，持久化后要盯这个值' },
        { cmd: 'journalctl --vacuum-size=1G', desc: '把日志总量压到 1G 以内，磁盘告急时的清理动作' },
        { cmd: 'ls -ld /var/log/journal', desc: '确认目录存在且属主为 root:systemd-journal' }
      ],
      notes: [
        '**默认 `Storage=auto` 且 `/var/log/journal` 不存在时日志只存内存**，重启全丢——这是「事故后查不到日志」的头号原因',
        '`systemd-tmpfiles --create --prefix /var/log/journal` 不能省，手工 `mkdir` 出来的目录权限/属主不对，journald 可能拒绝写入',
        '改完必须 `systemctl restart systemd-journald`；重启 journald **不会丢已有日志**，但重启系统前没落盘的日志会丢',
        '日志持久化后要配 `SystemMaxUse` 与 `SystemKeepFree`，否则日志可能把 `/var` 或 `/` 分区写满（本站仿真里 `/data` 盘 100% 就是典型的容量失控场景）',
        '不要把 `Storage` 设成 `none`：那会彻底关闭日志，排障时完全没有抓手',
        '云主机建议把日志目录挂到独立数据盘，避免系统盘被日志写满导致无法登录'
      ],
      related: ['mo-log-journalctl', 'mo-log-var-log', 'mo-log-logrotate', 'mo-log-disk-full'],
      docs: 'https://man7.org/linux/man-pages/man5/journald.conf.5.html',
      tags: ['systemd', '日志', '配置']
    },

    /* ---------- 20 / 42 ---------- */
    {
      id: 'mo-log-var-log',
      name: '/var/log 目录体系速查',
      kind: 'recipe',
      alias: ['/var/log', 'messages', 'secure', 'cron', 'auth.log'],
      level: 2,
      syntax: 'ls -lht /var/log/  然后按需 tail/grep 对应文件',
      summary: '认清 /var/log 下每个文件记什么，排障时直奔目标文件不绕路。',
      desc: '**RHEL/CentOS/EulerOS 系**：`/var/log/messages`（rsyslog 收的全量系统日志，`*.info` 级别，排除 mail/authpriv/cron）、`/var/log/secure`（**认证与安全**：ssh 登录成功/失败、sudo、su，排查暴力破解看它）、`/var/log/cron`（crontab 执行记录，任务没跑先看这里）、`/var/log/maillog`、`/var/log/boot.log`（开机过程）、`/var/log/dmesg`（开机内核日志快照）、`/var/log/yum.log`（软件包安装记录）。**Ubuntu/Debian 系**：对应的文件叫 `/var/log/syslog`（≈messages）、`/var/log/auth.log`（≈secure）、`/var/log/kern.log`。**通用**：`/var/log/wtmp`（登录历史，用 `last` 读）、`/var/log/btmp`（失败登录，用 `lastb` 读）、`/var/log/lastlog`（用 `lastlog` 读）——这三个是**二进制文件，不能直接 cat**。**应用日志**：`/var/log/nginx/access.log` 与 `error.log`、`/var/log/mysql/error.log` 等，本站仿真里还有应用自己写的 `/data/app/logs/app.log`（日志目录放到了数据盘，是更规范的做法）。',
      params: [
        { flag: 'messages / syslog', desc: '全量系统日志（RHEL 叫 messages，Debian 系叫 syslog）' },
        { flag: 'secure / auth.log', desc: '认证与安全日志：ssh 登录、sudo、su' },
        { flag: 'cron', desc: '定时任务执行日志，任务没执行先查它' },
        { flag: 'dmesg / boot.log', desc: '开机内核日志 / 启动过程日志' },
        { flag: 'wtmp / btmp / lastlog', desc: '二进制文件，必须用 `last` / `lastb` / `lastlog` 读' },
        { flag: 'nginx/ mysql/ 等子目录', desc: '各服务自己的日志目录，按服务名归类' },
        { flag: 'ls -lht /var/log', desc: '按修改时间排序，快速找出最近在写的日志' }
      ],
      examples: [
        { cmd: 'ls -lht /var/log | head -15', desc: '按修改时间看最近在写的日志文件，第一步' },
        { cmd: 'grep -i "Failed password" /var/log/secure | tail -20', desc: '看 ssh 暴力破解尝试（本站仿真里 198.51.100.77 反复失败）' },
        { cmd: 'tail -n 50 /var/log/messages', desc: '看系统全量日志的最新 50 行' },
        { cmd: 'grep -i "myapp" /var/log/messages | tail -20', desc: '在系统日志里找某个服务的记录' },
        { cmd: 'lastb | head -20', desc: '读 /var/log/btmp，看失败登录的来源与次数' },
        { cmd: 'du -sh /var/log/* | sort -rh | head -10', desc: '看哪个日志占空间最大，日志写满盘时必查' }
      ],
      notes: [
        '`wtmp`/`btmp`/`lastlog` 是**二进制文件**，`cat` 出来是乱码，要用 `last`/`lastb`/`lastlog`',
        'RHEL 系与 Debian 系文件名不同（`messages`/`syslog`、`secure`/`auth.log`），写脚本前先 `ls /var/log` 确认',
        '日志文件由 **rsyslog 规则**决定写到哪里（见 `mo-log-rsyslog`），改了规则要重启 rsyslog 才生效',
        '`/var/log` 在系统盘上时容量有限（本站仿真里 `/` 盘 40G 用了 32%），大流量应用的日志应放到数据盘',
        '直接 `rm` 正在被写入的日志文件不会释放空间（`lsof +L1` 能看到），正确做法是 `> file` 清空或走 logrotate',
        'journald 系统里 `/var/log/messages` 可能已不再更新（完全由 journald 接管），看不到新内容时先用 `journalctl` 确认'
      ],
      related: ['mo-log-rsyslog', 'mo-log-tail', 'mo-log-disk-full', 'mo-log-logrotate'],
      docs: 'https://man7.org/linux/man-pages/man5/rsyslog.conf.5.html',
      tags: ['日志', '目录', '速查']
    },

    /* ---------- 21 / 42 ---------- */
    {
      id: 'mo-log-logrotate',
      name: 'logrotate',
      alias: ['logrotate -d', 'logrotate -f', '日志切割', 'logs rotation'],
      level: 3,
      syntax: 'logrotate [-d|-v|-f] <配置文件>  配置在 /etc/logrotate.conf 与 /etc/logrotate.d/*',
      summary: '按天或按大小切割、压缩、清理日志，防止单个日志文件涨爆磁盘。',
      desc: '`logrotate` 通常由 cron/systemd timer **每天自动执行一次**，读取 `/etc/logrotate.conf` 与 `/etc/logrotate.d/` 下的所有片段。一个典型配置块：`/data/app/logs/app.log { daily rotate 7 size 100M compress delaycompress missingok notifempty create 0644 deploy deploy postrotate systemctl reload myapp > /dev/null 2>&1 || true endscript }`。关键指令辨析：`daily`/`weekly`/`size 100M` 决定**何时**切割（同时写时以 size 优先触发）；`rotate N` 保留几份历史；`compress`+`delaycompress` 压缩（delay 表示最新一份先不压，避免程序还在写）；`copytruncate`（**复制后清空原文件**，适合不支持重开日志的程序，但有丢日志风险）与 `create`+`postrotate`（**切割后新建文件并通知程序重开**，更可靠，需要程序支持信号，如 nginx 的 `USR1`）；`missingok`/`notifempty` 决定文件缺失或为空时是否报错。**调试必用 `logrotate -d`**：dry-run 模式只打印「将要做什么」，不实际动文件，是验证配置有没有写错的标准手段。',
      params: [
        { flag: '-d, --debug', desc: '演练模式：只输出计划动作，不改动任何文件，排错必用' },
        { flag: '-f, --force', desc: '强制立即切割（忽略时间条件），磁盘告急时用' },
        { flag: '-v, --verbose', desc: '详细输出，配合 `-d` 看每一步判断依据' },
        { flag: 'daily / weekly / size', desc: '触发条件：按天 / 按周 / 超过指定大小' },
        { flag: 'rotate <N>', desc: '保留多少个历史文件，超出最旧的被删除' },
        { flag: 'compress / delaycompress', desc: '压缩历史 / 最新一份暂不压缩' },
        { flag: 'copytruncate', desc: '复制后清空原文件（适用于不支持重开日志的程序）' },
        { flag: 'create + postrotate', desc: '新建文件并通知程序重开（如 nginx 的 `USR1`）' }
      ],
      examples: [
        { cmd: 'logrotate -d /etc/logrotate.d/myapp', desc: '演练：看配置会怎么执行而不真的动文件，改配置后必跑' },
        { cmd: 'logrotate -vf /etc/logrotate.d/myapp', desc: '强制立即切割并输出详细信息，磁盘要满时应急' },
        { cmd: 'cat /var/lib/logrotate/logrotate.status | grep myapp', desc: '看某个日志上次切割时间（Debian 系路径是 `/var/lib/logrotate/status`）' },
        { cmd: 'systemctl status logrotate.timer', desc: '确认自动切割的定时器处于 active 状态（老系统看 `/etc/cron.daily/logrotate`）' }
      ],
      notes: [
        '**`copytruncate` 会丢日志**：复制与清空之间写入的内容可能丢失，能不用的场景优先用 `create` + `postrotate` 通知程序重开文件',
        '`create` 模式必须配 `postrotate` 让程序重新打开文件（如 nginx 用 `kill -USR1`），否则程序仍写向已删除的旧 inode，空间不释放',
        '`rotate` 与实际体积要一起算：每天 1G 的日志配 `rotate 30` 就是 30G 占用，容易把数据盘写满',
        '`missingok` 与 `notifempty` 建议都加上，否则日志文件缺失或为空时 logrotate 会报错并可能中断后续配置的处理',
        '配置写错会导致**整个 logrotate 任务失败**（一个文件语法错可能影响同一批次其他日志），改完务必 `-d` 验证',
        '本站仿真里 `/data` 盘已 100%、inode 也 100%，如果日志目录下有海量小文件，logrotate 的 `rotate` 数量与 `maxage` 要一起收紧'
      ],
      related: ['mo-log-disk-full', 'mo-log-var-log', 'mo-log-journald-conf', 'mo-log-tail'],
      docs: 'https://man7.org/linux/man-pages/man8/logrotate.8.html',
      tags: ['日志切割', '磁盘', '定时任务']
    },

    /* ---------- 22 / 42 ---------- */
    {
      id: 'mo-log-rsyslog',
      name: 'rsyslog 规则',
      kind: 'recipe',
      alias: ['rsyslog.conf', '/etc/rsyslog.d', 'facility', 'priority'],
      level: 3,
      syntax: '<facility>.<priority>  <action>   写在 /etc/rsyslog.conf 或 /etc/rsyslog.d/*.conf',
      summary: '决定哪类日志写到哪个文件或转发到哪台机器，日志分流全靠它。',
      desc: '规则格式是「**来源.级别 动作**」。来源（facility）常见值：`auth`/`authpriv`（认证）、`cron`（定时任务）、`daemon`（守护进程）、`kern`（内核）、`mail`、`user`、`local0`~`local7`（自定义，业务常用）、`*`（全部）。级别（priority）从低到高：`debug`、`info`、`notice`、`warning`、`err`、`crit`、`alert`、`emerg`，写 `*.info` 表示 info 及更严重，写 `none` 表示排除。动作（action）可以是文件路径（`/var/log/messages`）、**转发**（`@10.0.1.23:514` UDP、`@@10.0.1.23:514` TCP、`@@` 更适合跨机房）、丢弃（`~` 或 `stop`）、或用户终端。典型默认规则：`*.info;mail.none;authpriv.none;cron.none  /var/log/messages`、`authpriv.*  /var/log/secure`、`cron.*  /var/log/cron`。业务自定义更推荐用 `local` 设备或在 `/etc/rsyslog.d/` 下加独立片段，并用新语法 `if $programname == "myapp" then /var/log/myapp.log`。改完用 `rsyslogd -N1` 检查语法，再重启服务。',
      params: [
        { flag: '<facility>', desc: '日志来源：authpriv/cron/daemon/kern/mail/user/local0-7/*' },
        { flag: '<priority>', desc: '级别：debug/info/notice/warning/err/crit/alert/emerg，`*` 表示全部' },
        { flag: 'none', desc: '排除某个来源，如 `mail.none`' },
        { flag: '<文件路径>', desc: '动作：写入指定文件，如 `/var/log/secure`' },
        { flag: '@<主机>:514 / @@<主机>:514', desc: '转发到远程：单个 @ 是 UDP，双 @ 是 TCP' },
        { flag: '~ / stop', desc: '丢弃该条日志，不再继续匹配后续规则' },
        { flag: '$programname', desc: '新语法里按程序名匹配，如 `if $programname == "myapp"`' }
      ],
      examples: [
        { cmd: 'grep -vE "^#|^$" /etc/rsyslog.conf', desc: '看当前生效的规则（去掉注释与空行）' },
        { cmd: 'echo \'if $programname == "myapp" then /var/log/myapp.log\' | sudo tee /etc/rsyslog.d/10-myapp.conf', desc: '为应用单独分流一个日志文件（放独立片段便于管理）' },
        { cmd: 'rsyslogd -N1', desc: '检查配置语法，改完规则先验证再重启' },
        { cmd: 'systemctl restart rsyslog && tail -f /var/log/myapp.log', desc: '重启生效并验证新文件是否开始写入' },
        { cmd: '*.* @@10.0.1.100:514', desc: '把所有日志用 TCP 转发到集中日志服务器（跨机房排查必备）' }
      ],
      notes: [
        '改规则后必须重启（或 reload）rsyslog 才生效：`systemctl restart rsyslog`',
        '转发的 `@` 是 **UDP**（可能丢日志），`@@` 是 **TCP**（可靠但会阻塞），生产集中采集优先 TCP 并配队列',
        '规则是**顺序匹配**的，前面的规则命中后仍会继续匹配后面的（除非用 `~`/`stop`），写规则时注意重复写入',
        'rsyslog 与 journald 并存时，两个系统都要配置，别只改一边',
        '自定义业务日志用 `local0`~`local7` 或在 `/etc/rsyslog.d/` 下加片段，不要直接改主配置文件的默认行，升级时容易被覆盖',
        '日志转发量很大时要评估网络带宽与远端磁盘，本站仿真里 `/data` 已经 100%，集中式日志服务器同样要防写满'
      ],
      related: ['mo-log-var-log', 'mo-log-journald-conf', 'mo-log-journalctl', 'mo-log-disk-full'],
      docs: 'https://man7.org/linux/man-pages/man5/rsyslog.conf.5.html',
      tags: ['日志', 'rsyslog', '分流']
    },

    /* ---------- 23 / 42 ---------- */
    {
      id: 'mo-log-tail',
      name: 'tail -f 多文件',
      kind: 'recipe',
      alias: ['tail -f', 'tail -F', 'tail -n', '实时看日志'],
      level: 1,
      syntax: 'tail [-f|-F] [-n <行数>] [-q|-v] <文件...> [--pid=<PID>]',
      summary: '实时跟踪一个或多个日志文件，多文件会带文件名分节，排障最常用。',
      desc: '`-f`（follow）跟踪文件**追加**的内容；一次给多个文件时会用 `==> 文件名 <==` 分节显示，但只有内容变化的分节才会刷新，所以多文件跟踪时建议用 `-q` 关掉文件名头再自己加标识，或者干脆开多个终端。**`-F` 比 `-f` 更实用**：`-F` 等价于 `--follow=name --retry`，文件被 **logrotate 切割或重建后会自动跟上新文件**，而 `-f` 会一直盯着旧 inode 导致「日志不刷新」（这是最常见的误判为『应用不打日志了』的原因）。`-n <行数>` 先显示末尾 N 行再跟（默认 10 行）；`--pid=<PID>` 在进程退出后自动结束跟踪（配合应用进程用很省心）。配合 grep 时**必须加 `--line-buffered`**，否则 grep 会缓冲输出，看起来像是不实时：`tail -F app.log | grep --line-buffered ERROR`。',
      params: [
        { flag: '-f, --follow', desc: '跟踪文件追加的内容' },
        { flag: '-F', desc: '等价 `--follow=name --retry`，文件被切割/重建后自动跟上，推荐' },
        { flag: '-n <行数>', desc: '先输出末尾 N 行再跟踪，如 `-n 200`' },
        { flag: '-q, --quiet', desc: '多文件时不输出 `==> 文件名 <==` 分节头' },
        { flag: '-v, --verbose', desc: '单文件时也输出文件名头' },
        { flag: '--pid=<PID>', desc: '指定进程退出后停止跟踪' },
        { flag: '-s <秒>', desc: '轮询间隔（与 `-f` 同用）' }
      ],
      examples: [
        { cmd: 'tail -f /data/app/logs/app.log', desc: '实时跟踪应用日志，复现问题时最常用' },
        { cmd: 'tail -F /data/app/logs/app.log /var/log/nginx/error.log', desc: '同时跟两个日志，`-F` 保证切割后仍能跟上' },
        { cmd: 'tail -F /data/app/logs/app.log | grep --line-buffered -E "ERROR|Exception"', desc: '只实时显示错误行，`--line-buffered` 不能省否则不实时' },
        { cmd: 'tail -n 200 /data/app/logs/app.log | grep "query timeout"', desc: '先看最近 200 行里的超时记录（本站仿真应用报 query timeout after 5000ms）' },
        { cmd: 'tail -F --pid=18442 /data/app/logs/app.log', desc: '盯着应用进程，进程退出后自动结束跟踪' }
      ],
      notes: [
        '**`-f` 遇到日志切割会失效**（仍盯着旧 inode），生产排障一律用 `-F`',
        '管道给 grep 时加 `--line-buffered`，否则输出被缓冲，看起来像卡住不刷新',
        '`tail -f` 不会读取已有历史内容（除 `-n` 指定的行数），要查历史用 `grep` 或 `journalctl`',
        '远程 SSH 里跑 `tail -f` 断线会中断，重要场景用 `nohup`/`screen`/`tmux` 或先重定向到文件',
        '日志文件被 `rm` 后 `tail -F` 会一直提示 `No such file`，直到同名文件被重新创建',
        '大日志文件配 `grep` 时注意 IO 开销，别在生产高峰对几 GB 的日志反复全量扫描'
      ],
      related: ['mo-log-multitail', 'mo-log-var-log', 'mo-log-journalctl', 'lb-tail'],
      docs: 'https://man7.org/linux/man-pages/man1/tail.1.html',
      tags: ['日志', '实时', '跟踪']
    },

    /* ---------- 24 / 42 ---------- */
    {
      id: 'mo-log-multitail',
      name: 'multitail / lnav',
      alias: ['multitail', 'lnav', '多窗口日志', '日志分析器'],
      level: 3,
      syntax: 'multitail [-i] <文件1> [-i <文件2>] / lnav [<文件|目录>]',
      summary: '两个进阶日志工具：一个分屏同时看多路日志，一个能查询与分析。',
      desc: '`multitail` 解决「同时盯多个日志」的问题：`multitail -i a.log -i b.log` 会把窗口分成多块各自跟踪，`-s` 指定分屏列数，`-cS <配色方案>` 上色，`-l "命令"` 直接跟踪某个命令的输出（如 `-l "kubectl logs -f pod"`），支持高亮关键字（`-k` 正则配色）。`lnav` 是**日志分析器**：自动识别时间戳与日志级别并高亮，可按 `i` 看直方图、按 `/` 搜索、按 `Tab` 补全，最强大的是**用 SQL 查日志**——按 `;` 进入 SQL 模式后可以写 `SELECT log_level, count(*) FROM logline GROUP BY log_level`，还能跨文件按时间轴合并（`lnav /var/log/nginx/access.log*`），直接打开 `.gz` 压缩日志，`-r` 递归目录。三者分工：`tail -F` 看实时少量、`multitail` 同时看多路、`lnav` 做离线深度分析。',
      params: [
        { flag: 'multitail -i <文件>', desc: '把文件加入分屏跟踪（可多次指定）' },
        { flag: 'multitail -s <列数>', desc: '指定分屏列数，如 `-s 2` 两列' },
        { flag: 'multitail -l "<命令>"', desc: '跟踪命令输出，如 `-l "docker logs -f web"`' },
        { flag: 'lnav <文件|目录>', desc: '打开日志，支持通配符与 `.gz` 压缩文件' },
        { flag: 'lnav -r', desc: '递归打开目录下的日志' },
        { flag: 'lnav -t <格式>', desc: '指定时间戳格式（自动识别失败时手工指定）' },
        { flag: 'lnav 内按 ; ', desc: '进入 SQL 模式，用 `SELECT ... FROM logline` 查询日志' }
      ],
      examples: [
        { cmd: 'multitail -i /data/app/logs/app.log -i /var/log/nginx/error.log', desc: '分屏同时跟踪应用与 Nginx 错误日志' },
        { cmd: 'multitail -s 2 -i /data/app/logs/app.log -i /var/log/nginx/access.log', desc: '两列分屏，同时盯应用与访问日志' },
        { cmd: 'lnav /data/app/logs/app.log', desc: '打开应用日志，按 i 看级别直方图，按 / 搜索' },
        { cmd: 'lnav /var/log/nginx/access.log*', desc: '把切割过的多个访问日志按时间轴合并分析（含 .gz）' },
        { cmd: 'lnav -r /data/app/logs', desc: '递归打开日志目录，适合按天归档的场景' }
      ],
      notes: [
        '`multitail` 与 `lnav` 都需要额外安装（`yum install multitail lnav` / `apt install multitail lnav`），内网环境要提前准备离线包',
        '`lnav` 的 SQL 查询在内存中建索引，**几 GB 的日志会吃很多内存**，大文件建议先按时间窗切分',
        '`multitail` 分屏太多会导致每个窗口很小，终端窗口要够大（建议 120 列以上）',
        '`lnav` 依赖时间戳格式识别，自定义格式（如纯毫秒时间戳）识别不到时用 `-t` 指定',
        '两者都只读日志文件，不进 `journalctl` 的数据；systemd 日志请先导出（`journalctl -o short-iso > /tmp/x.log`）再分析',
        '生产服务器上不一定允许装额外工具，排障前先确认安全合规要求'
      ],
      related: ['mo-log-tail', 'mo-log-var-log', 'mo-log-journalctl'],
      docs: 'https://lnav.org/',
      tags: ['日志', '分析', '工具']
    },

    /* ---------- 25 / 42 ---------- */
    {
      id: 'mo-log-disk-full',
      name: '日志占满磁盘应急处理',
      kind: 'recipe',
      alias: ['磁盘满', '日志写满', 'no space left', 'df 100%', 'inode 满'],
      level: 3,
      syntax: '（组合）df -h → df -i → du -sh → find -size → lsof +L1 → 清空/切割 → 防复发',
      summary: '磁盘被日志写满时的固定处置顺序，先保命再定位再防复发。',
      desc: '**处置顺序（先看什么 → 再看什么）**：① `df -h` 确认**哪个分区**满了（本站仿真里 `/data` 已 100%，只剩 1.2G）；② `df -i` 看 inode——本站仿真 `/data` 的 inode 也是 100%（13107200 个用满），说明是**海量小文件**而不是大文件，这一条决定了后续怎么找；③ `du -sh /data/* | sort -rh | head -10` 定位大目录（加 `-x` 不跨文件系统），逐层往下缩小范围；④ `find /data -type f -size +1G -exec ls -lh {} \\;` 找单个大文件，`find /data -type f | wc -l` 数文件个数（inode 满时看这个）；⑤ **`lsof +L1`** 找「已删除但仍被进程占用」的文件——`df` 满而 `du` 找不到大文件时，答案一定在这里；⑥ 应急处置分三种：日志文件还在用 → **用 `> 文件` 或 `truncate -s 0` 清空**（不要 `rm`！rm 之后句柄不释放，空间照样不还）；有 logrotate 配置 → `logrotate -vf <配置>` 强制切割压缩；已删除仍被占用 → 重启或 reload 对应进程才会真正释放。⑦ 防复发：配好 logrotate 的 `rotate`/`maxsize`、journald 的 `SystemMaxUse`/`SystemKeepFree`、Docker 的 `log-opts`（`max-size`/`max-file`，容器 json 日志是常见元凶）、磁盘使用率告警（如华为云 CES 磁盘指标）。',
      params: [
        { flag: 'df -h / df -i', desc: '看容量与 inode 使用率，两个都要看' },
        { flag: 'du -sh <目录>', desc: '看目录总大小，加 `-x` 不跨文件系统' },
        { flag: 'find -size +1G', desc: '找大文件；`find | wc -l` 数文件个数（inode 满时用）' },
        { flag: 'lsof +L1', desc: '找已删除但被占用的文件，空间不释放的元凶' },
        { flag: '> file / truncate -s 0', desc: '清空文件内容且保留 inode，日志清空的安全做法' },
        { flag: 'logrotate -vf', desc: '强制立即切割压缩日志' },
        { flag: 'docker log-opts', desc: '限制容器日志大小：`max-size=10m`、`max-file=3`' }
      ],
      examples: [
        { cmd: 'df -h; df -i', desc: '第一步：确认哪个分区满、是容量满还是 inode 满' },
        { cmd: 'du -sh /data/* 2>/dev/null | sort -rh | head -10', desc: '第二步：定位占空间最大的目录' },
        { cmd: 'find /data -type f -size +1G -exec ls -lh {} \\; 2>/dev/null', desc: '第三步：找出单个大文件' },
        { cmd: 'lsof +L1 | head -20', desc: '第四步：找已删除但仍被占用的文件（df 满而 du 找不到时必查）' },
        { cmd: 'truncate -s 0 /data/app/logs/app.log', desc: '应急清空日志内容（保留文件与句柄，比 rm 安全）' },
        { cmd: 'logrotate -vf /etc/logrotate.d/myapp', desc: '强制切割压缩，把大日志立刻变小' },
        { cmd: 'du -sh /var/lib/docker/containers/*/*-json.log 2>/dev/null | sort -rh | head', desc: '查容器 json 日志占用（容器环境的头号磁盘杀手）' }
      ],
      notes: [
        '**清空日志用 `> file` 或 `truncate -s 0`，不要用 `rm`**：`rm` 后进程仍持有句柄，`df` 里的空间不会释放，反而更难排查',
        '磁盘 100% 会导致数据库无法写入、服务无法记录日志甚至无法启动，属于 P0 级故障，先**腾出空间恢复业务**再慢慢定位根因',
        '根分区（`/`）满会影响 ssh 登录、systemd 写日志；数据盘（`/data`）满主要影响业务写入与日志落盘，处置优先级不同',
        '**inode 满和容量满是两回事**：inode 满时 `df -h` 可能显示还有空间但就是写不了，必须用 `df -i` 才能发现（本站仿真 `/data` 两者都是 100%）',
        '删文件前务必确认不是当前正在写入的日志（`lsof <文件>`），否则会造成日志断档、丢失故障证据',
        '容器场景优先查 `/var/lib/docker/containers/*/*-json.log`，并在 `daemon.json` 里配 `log-opts` 限制大小（见 `dk-daemon-json`）',
        '防复发三件套：logrotate 策略、journald 容量上限、磁盘使用率告警阈值（建议 80% 预警、90% 告警）'
      ],
      related: ['mo-lsof', 'mo-log-logrotate', 'mo-log-var-log', 'mo-log-journald-conf', 'ls9-df', 'dk-container-logs-size'],
      docs: 'https://man7.org/linux/man-pages/man8/logrotate.8.html',
      tags: ['磁盘满', '日志', '应急']
    },

    /* ================= D. 监控体系（10 条） ================= */

    /* ---------- 26 / 42 ---------- */
    {
      id: 'mo-promtool-check',
      name: 'promtool check config',
      alias: ['promtool check config', 'check rules', 'Prometheus 配置校验'],
      level: 3,
      syntax: 'promtool check config <prometheus.yml> / promtool check rules <规则文件...>',
      summary: '改完 Prometheus 配置先验语法，避免 reload 失败导致监控整体中断。',
      desc: 'Prometheus 的配置文件与告警规则一旦有语法错误，`SIGHUP` 热加载会**整体失败**（旧配置继续生效）或进程直接起不来，监控静默失效是比服务宕机更可怕的故障。`promtool` 是官方自带的校验工具，两类必查：`promtool check config /etc/prometheus/prometheus.yml` 会检查主配置语法、`rule_files` 引用的规则文件是否存在且合法、以及 `scrape_configs` 的结构；`promtool check rules /etc/prometheus/rules/*.yml` 单独校验告警与记录规则（表达式能否解析、标签是否合法）。校验通过时退出码为 0，**非常适合放进 CI 或配置变更流水线**，在 reload 前自动跑一遍。其他子命令：`promtool check service-discovery` 校验服务发现配置、`promtool check healthy --url=http://<prometheus>:9090` 检查运行中的服务是否健康。',
      params: [
        { flag: 'check config <文件>', desc: '校验主配置与它引用的规则文件' },
        { flag: 'check rules <文件...>', desc: '只校验规则文件（告警规则与记录规则）' },
        { flag: 'check service-discovery', desc: '校验服务发现（如 Kubernetes SD、文件 SD）配置' },
        { flag: 'check healthy --url=<地址>', desc: '检查运行中的 Prometheus 是否健康' },
        { flag: '--syntax-only / -s', desc: '只做语法检查，不校验规则文件的引用关系' },
        { flag: 'query instant <地址> <表达式>', desc: '对运行中的实例做即时查询（见下一条）' }
      ],
      examples: [
        { cmd: 'promtool check config /etc/prometheus/prometheus.yml', desc: '改完主配置先校验，通过再 SIGHUP 热加载' },
        { cmd: 'promtool check rules /etc/prometheus/rules/*.yml', desc: '单独校验全部告警规则文件，输出每个文件的规则条数' },
        { cmd: 'promtool check config /etc/prometheus/prometheus.yml && kill -HUP $(pidof prometheus)', desc: '校验通过才热加载，避免坏配置导致监控静默失效' },
        { cmd: 'kubectl exec -n monitoring prometheus-server-0 -c prometheus -- promtool check config /etc/config/prometheus.yml', desc: '容器化（本站仿真的 CCE 集群）里校验挂载进容器的配置' }
      ],
      notes: [
        '**热加载失败是静默的**：`kill -HUP` 后如果配置有错，Prometheus 会记录错误但继续用旧配置，不主动告警，所以必须「先校验后加载」',
        '校验通过不等于逻辑正确：表达式能解析但可能算错指标（如 counter 忘加 `rate()` 导致数值一直增长）',
        '`--syntax-only` 会跳过规则文件引用检查，快但不够严，变更流水线里建议用完整校验',
        '容器里配置是挂载进去的，要 `kubectl exec` 进容器校验挂载后的真实文件，而不是只校验 Git 仓库里的那份',
        '把 `promtool check` 写进 CI，和代码一起评审，能挡掉绝大多数监控配置事故'
      ],
      related: ['mo-promtool-query', 'mo-promql', 'mo-node-exporter', 'mo-amtool'],
      docs: 'https://prometheus.io/docs/prometheus/latest/command-line/promtool/',
      tags: ['Prometheus', '配置', '校验']
    },

    /* ---------- 27 / 42 ---------- */
    {
      id: 'mo-promtool-query',
      name: 'promtool query instant',
      alias: ['promtool query instant', 'promtool query range', '命令行查 PromQL'],
      level: 3,
      syntax: 'promtool query instant <Prometheus地址> <PromQL> / promtool query range --start --end --step <地址> <PromQL>',
      summary: '在命令行直接向 Prometheus 发查询，验证表达式与排查告警最方便。',
      desc: '写告警规则时最怕「表达式语法对但算出来不是想要的」，`promtool query instant http://127.0.0.1:9090 \'up == 0\'` 可以**直接复用 Prometheus 的数据与计算引擎**验证表达式，结果与 Grafana 里完全一致。子命令：`instant`（即时查询，返回当前时刻的值）、`range`（区间查询，需 `--start`/`--end`/`--step`）、`series`（按标签匹配器列出时间序列）、`labels`（列出标签名或某标签的值）、`analyze`（较新版本，分析表达式与规则的健康度）。运维场景常用：确认某台机器的 `up` 是不是 0、看某指标的当前值、列出某 job 下所有 instance。本站仿真里 Prometheus 跑在 CCE 集群的 `monitoring` 命名空间（Pod `prometheus-server-0`），从跳板机访问要先做端口转发。',
      params: [
        { flag: 'instant <地址> <表达式>', desc: '即时查询，返回查询时刻的样本值' },
        { flag: 'range --start --end --step', desc: '区间查询，如 `--start=2024-03-18T09:00:00Z --end=...  --step=1m`' },
        { flag: 'series --match=<匹配器>', desc: '列出匹配的时间序列（如 `--match=\'up{job="node"}\'`）' },
        { flag: 'labels <标签名>', desc: '列出某标签的所有取值，如 `labels job`' },
        { flag: '--header', desc: '附加 HTTP 头（如带认证的 `Authorization`）' }
      ],
      examples: [
        { cmd: 'promtool query instant http://127.0.0.1:9090 \'up == 0\'', desc: '查所有失联的抓取目标，最快确认「谁挂了」' },
        { cmd: 'promtool query instant http://127.0.0.1:9090 \'node_memory_MemAvailable_bytes / 1024 / 1024 / 1024\'', desc: '验证内存表达式能算出预期数值，再拿去写告警' },
        { cmd: 'promtool query series --match=\'up{job="node"}\' http://127.0.0.1:9090', desc: '列出 node job 下所有实例的时间序列' },
        { cmd: 'promtool query range --start=2024-03-18T09:00:00Z --end=2024-03-18T10:00:00Z --step=1m http://127.0.0.1:9090 \'rate(node_cpu_seconds_total{mode="idle"}[5m])\'', desc: '回看某个时间窗的区间数据，复盘事故发生时的指标' },
        { cmd: 'kubectl port-forward -n monitoring svc/prometheus-server 9090:9090', desc: '先把集群内的 Prometheus 端口转发到本地，再执行上面的查询' }
      ],
      notes: [
        '`promtool query` 只是「客户端」，**不校验表达式以外的东西**：查不到数据时先确认 Prometheus 自己有没有抓到该指标（查 `up`）',
        '区间查询的 `--start`/`--end` 要用 RFC3339 格式（如 `2024-03-18T09:00:00Z`），写错会报解析错误',
        'PromQL 里的引号在 Shell 中要转义：整体用单引号包住，内部标签用双引号，例如 `\'up{job="node"}\'`',
        '集群内访问 Prometheus 优先用 `kubectl port-forward` 而不是把 9090 暴露到公网（Prometheus 默认无认证）',
        '写告警规则前先用 `instant` 验证表达式能返回预期数据，能省下大量「告警不触发」的排查时间'
      ],
      related: ['mo-promtool-check', 'mo-promql', 'mo-grafana-api', 'k8s-port-forward'],
      docs: 'https://prometheus.io/docs/prometheus/latest/command-line/promtool/',
      tags: ['Prometheus', 'PromQL', '查询']
    },

    /* ---------- 28 / 42 ---------- */
    {
      id: 'mo-promql',
      name: 'PromQL 常用查询',
      kind: 'recipe',
      alias: ['PromQL', 'rate', 'sum by', 'histogram_quantile', 'topk'],
      level: 3,
      syntax: '<指标名>{<标签过滤>}[<时间范围>]  配合 rate/irate/sum/increase/histogram_quantile 等函数',
      summary: '从 Prometheus 里把指标算成能看的数字，告警与看板全靠它。',
      desc: 'PromQL 的核心思路是「**先选时间序列，再做区间计算，最后聚合**」。四条最常用的骨架：① **CPU 使用率**（counter 要用 `rate` 求每秒增量）：`100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`；② **内存使用率**（gauge 直接算比例）：`(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100`；③ **磁盘使用率与预测**：`(1 - node_filesystem_avail_bytes{mountpoint="/data"} / node_filesystem_size_bytes{mountpoint="/data"}) * 100`，预测写满用 `predict_linear(node_filesystem_avail_bytes{mountpoint="/data"}[6h], 4*3600) < 0`；④ **耗时 P99**（直方图）：`histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))`。聚合用 `sum by (标签)`/`avg by`/`max by` 按维度合并，`topk(5, ...)` 取前几名，`increase(...[1h])` 看一小时内增量。**关键规则**：counter 类型（`_total` 结尾、只增不减）必须用 `rate`/`irate`/`increase`，直接画会得到一条单调上升的斜线。',
      params: [
        { flag: 'rate(<范围向量>[5m])', desc: 'counter 的每秒平均增长率，最常用的函数' },
        { flag: 'irate(...[5m])', desc: '用最后两个点算瞬时增长率，敏感但抖动大' },
        { flag: 'increase(...[1h])', desc: '一段时间内的增量，如「近 1 小时错误数」' },
        { flag: 'sum by (标签) (...)', desc: '按维度求和，如 `sum by (instance)`' },
        { flag: 'histogram_quantile(0.99, ...)', desc: '从直方图桶算分位数，P99 延迟标准写法' },
        { flag: 'topk(N, ...)', desc: '取数值最大的 N 条序列，看板常用' },
        { flag: 'predict_linear(..., 4*3600)', desc: '线性预测 4 小时后的值，磁盘写满预警' },
        { flag: 'avg_over_time / max_over_time', desc: '区间内的平均/最大值，用于平滑抖动' }
      ],
      examples: [
        { cmd: '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', desc: '各实例 CPU 使用率（%），最经典的 PromQL' },
        { cmd: '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100', desc: '内存使用率，注意用 MemAvailable 而不是 MemFree' },
        { cmd: '(1 - node_filesystem_avail_bytes{mountpoint="/data"} / node_filesystem_size_bytes{mountpoint="/data"}) * 100 > 90', desc: '查 /data 使用率是否超过 90%（本站仿真里这个值就是 100）' },
        { cmd: 'histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', desc: '接口 P99 延迟，性能看板与 SLO 告警的标准写法' },
        { cmd: 'topk(5, sum by (instance) (rate(node_network_receive_bytes_total[5m])))', desc: '网络接收速率最高的 5 台机器' },
        { cmd: 'predict_linear(node_filesystem_avail_bytes{mountpoint="/data"}[6h], 4*3600) < 0', desc: '按近 6 小时趋势预测 4 小时后磁盘是否写满，提前告警' }
      ],
      notes: [
        '**counter 必须套 `rate`**：`node_cpu_seconds_total` 这类累计值直接查会得到单调上升的线，看不出任何问题',
        '`rate()` 的时间窗口要**至少包含 2 个采样点**，抓取间隔 15s 时用 `[1m]` 起步，写 `[10s]` 会经常返回空',
        '`rate` 会自动处理 counter 重置（进程重启），`delta`/`increase` 也有类似语义，别自己手写相邻点相减',
        '标签过滤用 `=`（精确）、`!=`、`=~`（正则）、`!~`；正则匹配很耗资源，能精确匹配就别用正则',
        '`sum by` 与 `sum without` 二选一：前者保留指定标签，后者去掉指定标签，别在同一表达式里混用导致维度混乱',
        '本站仿真里 `/data` 使用率 100%、内存 `MemAvailable` 约 1.1G，正好可以用这两条表达式验证告警规则是否合理'
      ],
      related: ['mo-promtool-query', 'mo-node-exporter', 'mo-grafana-api', 'mo-promtool-check'],
      docs: 'https://prometheus.io/docs/prometheus/latest/querying/basics/',
      tags: ['PromQL', '指标', '告警']
    },

    /* ---------- 29 / 42 ---------- */
    {
      id: 'mo-node-exporter',
      name: 'node_exporter',
      alias: ['node_exporter', '主机监控采集', '9100', 'textfile collector'],
      level: 2,
      syntax: './node_exporter [--web.listen-address=:9100] [--collector.<名称>] [--collector.textfile.directory=<目录>]',
      summary: '把主机的 CPU、内存、磁盘、网络指标暴露成 HTTP 接口给 Prometheus 抓。',
      desc: '`node_exporter` 是 Prometheus 生态里的主机指标采集器，启动后默认监听 `:9100`，Prometheus 通过 `/metrics` 抓取。**最常用的指标**：`node_cpu_seconds_total`（CPU 各模式累计秒数，配 `rate` 算使用率）、`node_memory_MemAvailable_bytes`（可用内存）、`node_filesystem_avail_bytes`/`node_filesystem_size_bytes`（文件系统可用与总量，带 `mountpoint`/`fstype` 标签）、`node_disk_io_time_seconds_total`（磁盘忙碌时间）、`node_load1`/`node_load5`/`node_load15`（负载）、`node_network_receive_bytes_total`/`node_network_transmit_bytes_total`（网卡流量）、`node_boot_time_seconds`（开机时间，用来算运行时长与重启检测）、`node_exporter_build_info`（版本信息）。常用参数：`--web.listen-address` 改监听地址、`--collector.<名称>`/`--no-collector.<名称>` 开关采集器、`--collector.textfile.directory` 指定**自定义指标目录**（业务脚本把指标写成 `.prom` 文件丢进去即可暴露，这是最常用的扩展方式）、`--web.config.file` 配 TLS 与 basic auth。生产用 systemd 托管，并只监听内网地址。',
      params: [
        { flag: '--web.listen-address=:9100', desc: '监听地址与端口，默认 9100' },
        { flag: '--collector.textfile.directory=<目录>', desc: '自定义指标目录，脚本写入 `.prom` 文件即可暴露' },
        { flag: '--collector.<名称> / --no-collector.<名称>', desc: '开启/关闭单个采集器，如 `--no-collector.nfs`' },
        { flag: '--collector.filesystem.mount-points-exclude', desc: '排除某些挂载点（如容器 overlay、tmpfs）' },
        { flag: '--web.config.file=<文件>', desc: '配置 TLS 与 basic auth，公网暴露时必须配' },
        { flag: '--log.level=info', desc: '日志级别：debug/info/warn/error' }
      ],
      examples: [
        { cmd: './node_exporter --web.listen-address=:9100 --collector.textfile.directory=/var/lib/node_exporter/textfile', desc: '标准启动方式，开启自定义指标目录' },
        { cmd: 'curl -s http://127.0.0.1:9100/metrics | grep -E "^node_load1|^node_memory_MemAvailable_bytes"', desc: '本地验证指标是否正常暴露（本站仿真里 node_exporter 监听 127.0.0.1:9100）' },
        { cmd: 'curl -s http://127.0.0.1:9100/metrics | grep node_filesystem_avail_bytes', desc: '确认文件系统指标里的 mountpoint 标签是否包含 /data' },
        { cmd: 'echo "myapp_up 1" > /var/lib/node_exporter/textfile/myapp.prom', desc: '用 textfile 方式暴露自定义指标（脚本巡检结果也这么做）' }
      ],
      notes: [
        '`node_exporter` 默认**没有任何认证**，必须限制只监听内网（`--web.listen-address=127.0.0.1:9100` 或安全组只放通 Prometheus 地址）',
        '容器里跑 node_exporter 需要挂载宿主机的 `/proc`、`/sys`、`/` 并加 `--path.procfs`/`--path.sysfs`/`--path.rootfs`，否则指标是容器自身的',
        '采集器不是越多越好：`--collector.*` 全开会显著增加抓取时间与 Prometheus 存储压力',
        'textfile collector 目录里的 `.prom` 文件由业务脚本写入，注意**原子写入**（先写临时文件再 `mv`），否则 Prometheus 会抓到半截文件',
        '文件系统指标里包含容器 overlay、tmpfs 等噪音挂载点，用 `--collector.filesystem.mount-points-exclude` 过滤掉',
        '主机指标只是基础，应用指标要另外埋点（如 Micrometer/Micrometer Prometheus registry 暴露 `/actuator/prometheus`）'
      ],
      related: ['mo-promql', 'mo-promtool-check', 'mo-grafana-api', 'mo-uptime'],
      docs: 'https://github.com/prometheus/node_exporter',
      tags: ['采集器', '主机监控', '指标']
    },

    /* ---------- 30 / 42 ---------- */
    {
      id: 'mo-grafana-api',
      name: 'Grafana API 导入看板',
      kind: 'recipe',
      alias: ['grafana api', '/api/dashboards/db', '导入看板', 'Service Account Token'],
      level: 3,
      syntax: 'curl -X POST -H "Authorization: Bearer <Token>" -H "Content-Type: application/json" -d @dashboard.json http://<grafana>:3000/api/dashboards/db',
      summary: '用接口批量导入与更新看板，把「手工点界面」变成可版本化的自动流程。',
      desc: 'Grafana 的看板就是一个 JSON，所以可以用 HTTP API 做**版本化管理**：把导出的 JSON 提交到 Git，变更时用 API 推送。核心接口 `POST /api/dashboards/db`，请求体形如 `{"dashboard": { ... 看板对象 ... }, "overwrite": true, "folderUid": "<目录UID>", "message": "由 CI 部署"}`——`overwrite: true` 表示同 UID 的看板直接覆盖更新。认证方式：Grafana 9 起推荐 **Service Account Token**（`Authorization: Bearer <token>`），老的 API Key 在新版本已移除；也可以用 `admin` 账号的 basic auth（不推荐写进脚本）。辅助接口：`GET /api/search?query=<关键字>` 查已有看板、`GET /api/dashboards/uid/<uid>` 取看板 JSON、`POST /api/datasources` 建数据源、`GET /api/health` 探活。注意导出的 JSON 里**数据源要写成变量**（`${DS_PROMETHEUS}`）或明确的 uid，否则换环境导入会指向不存在的同名数据源。',
      params: [
        { flag: 'POST /api/dashboards/db', desc: '创建或更新看板（配合 `overwrite: true`）' },
        { flag: 'Authorization: Bearer <token>', desc: 'Service Account Token 认证（Grafana 9+ 推荐）' },
        { flag: '-d @dashboard.json', desc: '用文件传请求体，避免超长 JSON 写进命令行' },
        { flag: 'overwrite: true', desc: '同 UID 看板直接覆盖，幂等部署的关键' },
        { flag: 'folderUid', desc: '指定看板存放的目录 UID' },
        { flag: 'GET /api/search?query=', desc: '按关键字搜索已有看板，找 UID' },
        { flag: 'GET /api/health', desc: '探活接口，确认 Grafana 可访问' }
      ],
      examples: [
        { cmd: 'curl -s http://grafana:3000/api/health', desc: '先探活，确认地址与网络通' },
        { cmd: 'curl -X POST -H "Authorization: Bearer <ServiceAccountToken>" -H "Content-Type: application/json" -d @/data/backup/node-dashboard.json http://grafana:3000/api/dashboards/db', desc: '用令牌把看板 JSON 推送到 Grafana（幂等覆盖）' },
        { cmd: 'curl -s -H "Authorization: Bearer <ServiceAccountToken>" "http://grafana:3000/api/search?query=node" | jq -r \'.[].uid\'', desc: '搜索已有的 node 相关看板并取出 UID' },
        { cmd: 'curl -s -H "Authorization: Bearer <ServiceAccountToken>" http://grafana:3000/api/dashboards/uid/node-exporter-full > node-exporter-full.json', desc: '导出看板 JSON 提交到 Git，实现看板版本化' }
      ],
      notes: [
        '**导出再导入时数据源最容易出问题**：JSON 里的数据源要写成 `${DS_xxx}` 变量或明确的 uid，否则新环境导入后所有面板报 `Datasource not found`',
        'Token 属于凭证，不要写进命令行（会进 history）或提交到 Git，用环境变量或密钥管理服务注入',
        'Grafana 9 起 API Key 逐步被 Service Account Token 取代（新版本已移除 API Key），老脚本要迁移',
        '生产环境别用 basic auth 的 admin 账号做自动化，权限过大且改密码就失效',
        '导入前先备份现有看板 JSON，`overwrite: true` 是**直接覆盖**，没有回收站',
        '集群内访问用 `kubectl port-forward -n monitoring svc/grafana 3000:3000`，不要把 Grafana 直接暴露到公网'
      ],
      related: ['mo-promql', 'mo-node-exporter', 'mo-promtool-query', 'k8s-port-forward'],
      docs: 'https://grafana.com/docs/grafana/latest/developers/http_api/dashboard/',
      tags: ['Grafana', 'API', '看板']
    },

    /* ---------- 31 / 42 ---------- */
    {
      id: 'mo-amtool',
      name: 'amtool 告警管理',
      kind: 'recipe',
      alias: ['amtool', 'alertmanager', 'silence', '静默告警'],
      level: 3,
      syntax: 'amtool [--alertmanager.url=<地址>] alert query / silence add / check-config <文件>',
      summary: '命令行查告警、建静默与校验 Alertmanager 配置，值班处理告警必备。',
      desc: '`amtool` 是 Alertmanager 的官方命令行工具，用 `--alertmanager.url=http://<地址>:9093` 指定服务地址（也可写进配置文件）。四个高频子命令：① `alert query` 列出当前**正在触发的告警**（含标签与状态），加 `--active` 只看未解决的；② `silence add --duration=2h --comment="<原因>" <匹配器>` 建**静默**（维护窗口抑制告警的标准手段，如 `silence add --duration=2h --comment="升级数据库" alertname=MySQLDown`）；③ `silence query` 看当前静默列表，`silence expire <ID>` 提前解除；④ `check-config /etc/alertmanager/alertmanager.yml` 校验配置语法（与 `promtool check config` 同理，改完再 reload）。此外 `config routes test` 可以**模拟一条告警的标签**，看它会走哪条路由、是否被静默——调试复杂路由树时非常有用。',
      params: [
        { flag: '--alertmanager.url=<地址>', desc: '指定 Alertmanager 地址（默认 http://localhost:9093）' },
        { flag: 'alert query [--active]', desc: '查当前告警，`--active` 只看未解决的' },
        { flag: 'silence add --duration=<时长>', desc: '建静默，如 `--duration=2h`' },
        { flag: 'silence add --comment="<原因>"', desc: '静默必须带说明，方便事后追溯' },
        { flag: 'silence query / expire <ID>', desc: '查看静默列表 / 提前解除指定静默' },
        { flag: 'check-config <文件>', desc: '校验 alertmanager.yml 语法' },
        { flag: 'config routes test', desc: '按标签模拟路由匹配，验证告警会发到哪里' }
      ],
      examples: [
        { cmd: 'amtool --alertmanager.url=http://127.0.0.1:9093 alert query', desc: '列出当前所有告警，值班第一眼' },
        { cmd: 'amtool --alertmanager.url=http://127.0.0.1:9093 alert query --active', desc: '只看还没恢复的告警，过滤掉已解决的历史' },
        { cmd: 'amtool silence add --duration=2h --comment="数据库升级维护窗口" alertname=MySQLDown --alertmanager.url=http://127.0.0.1:9093', desc: '维护窗口静默指定告警，避免误报打扰值班' },
        { cmd: 'amtool check-config /etc/alertmanager/alertmanager.yml', desc: '改完路由配置先校验再 reload' },
        { cmd: 'amtool config routes test --config.file=/etc/alertmanager/alertmanager.yml severity=critical team=db', desc: '模拟一条严重告警走哪条路由，验证路由树写得对不对' }
      ],
      notes: [
        '静默**必须写 `--comment`** 且写清原因与工单号，否则事后没人知道当时为什么静默了告警',
        '静默到期后会失效，长时间维护要记得续期；也可以用 `silence expire <ID>` 提前恢复',
        '静默只影响通知，**不影响告警本身的计算与记录**，Prometheus 里照样能看到指标异常',
        '`check-config` 通过不代表路由正确，复杂路由要用 `config routes test` 模拟验证',
        '改完 `alertmanager.yml` 要 `systemctl reload alertmanager`（或发 `SIGHUP`）才生效，改文件不重启是无效的',
        '别用静默代替修复：大量长期静默会掩盖真实故障，建议定期审计 `silence query` 的结果'
      ],
      related: ['mo-promtool-check', 'mo-promql', 'mo-grafana-api'],
      docs: 'https://github.com/prometheus/alertmanager',
      tags: ['告警', 'Alertmanager', '静默']
    },

    /* ---------- 32 / 42 ---------- */
    {
      id: 'mo-zabbix-get',
      name: 'zabbix_get',
      alias: ['zabbix_get', '取值测试', '10050', 'agent key'],
      level: 3,
      syntax: 'zabbix_get -s <被监控主机> -p <端口> -k "<监控项 key>"',
      summary: '从 Zabbix Server 侧直连 agent 取值，判断监控项拿不到数是谁的问题。',
      desc: '当 Zabbix 界面里某个监控项变成 `Not supported` 时，需要先分清是 **agent 端取不到值**还是 **server 与 agent 之间不通**。`zabbix_get` 就是在 Server 上执行的诊断工具：`-s <主机>` 指定被监控机器、`-p` 指定 agent 端口（默认 **10050**）、`-k` 指定监控项 key。常用 key：`system.cpu.load[all,avg1]`（1 分钟负载）、`system.cpu.util[,idle]`（CPU 空闲率）、`vm.memory.size[available]`（可用内存字节）、`vfs.fs.size[/data,pfree]`（**/data 剩余空间百分比**，本站仿真里这个值已经是 0）、`vfs.fs.inode[/,pfree]`（inode 剩余百分比）、`proc.num[mysqld]`（进程数量）、`net.if.in[eth0]`（网卡入流量）、`agent.ping`（连通性探针，返回 1）。返回错误信息也很有价值：`ZBX_NOTSUPPORTED` 说明 key 写法错或 agent 端取不到，超时则是网络/防火墙问题。',
      params: [
        { flag: '-s <主机>', desc: '被监控主机地址（必填）' },
        { flag: '-p <端口>', desc: 'agent 监听端口，默认 10050' },
        { flag: '-k "<key>"', desc: '监控项 key，带参数时要用引号包住整个 key' },
        { flag: '-I <源IP>', desc: '指定本机使用的源地址（多网卡时用）' },
        { flag: '-t <秒>', desc: '超时时间，默认 30 秒，排网络问题时调小' },
        { flag: '-v', desc: '显示详细过程，便于定位连接阶段的问题' }
      ],
      examples: [
        { cmd: 'zabbix_get -s 10.0.1.23 -p 10050 -k "agent.ping"', desc: '先测连通性，返回 1 说明 agent 正常在线' },
        { cmd: 'zabbix_get -s 10.0.1.23 -p 10050 -k "system.cpu.load[all,avg1]"', desc: '取 1 分钟负载，验证 CPU 类监控项' },
        { cmd: 'zabbix_get -s 10.0.1.23 -p 10050 -k "vfs.fs.size[/data,pfree]"', desc: '取 /data 剩余空间百分比（本站仿真里该值为 0，正好用于验证磁盘告警）' },
        { cmd: 'zabbix_get -s 10.0.1.23 -p 10050 -k "proc.num[mysqld]"', desc: '取进程数量，验证进程类监控项' },
        { cmd: 'zabbix_get -s 10.0.1.23 -p 10050 -k "net.if.in[eth0]" -t 5', desc: '5 秒超时取网卡入流量，快速判断是否网络不通' }
      ],
      notes: [
        '返回 `ZBX_NOTSUPPORTED` 说明 key 不支持或取值失败，问题在 **agent 端**（key 写错、脚本报错、权限不足）',
        '命令超时或 `Connection refused` 说明**网络或服务问题**（安全组/防火墙未放通 10050、agent 未启动、`Server=` 白名单没加 Server IP）',
        '带参数的 key 必须整体加引号，否则 Shell 会把 `[]` 当通配符展开导致参数丢失',
        'Zabbix 5.0+ 的 agent2 端口同样是 10050，但部分 key 的实现与老 agent 不同（`zabbix_agent2 -t` 测试）',
        '取值时要考虑单位：`vm.memory.size[available]` 返回字节，`vfs.fs.size[/data,pfree]` 返回百分比（0~100，可能带小数）',
        '主动模式（active）的监控项无法用 `zabbix_get` 测，它只能测被动模式（server 主动来取）的项'
      ],
      related: ['mo-zabbix-agentd', 'mo-hcloud-ces', 'mo-log-disk-full', 'ls9-df'],
      docs: 'https://www.zabbix.com/documentation/current/en/manpages/zabbix_get',
      tags: ['Zabbix', '监控项', '诊断']
    },

    /* ---------- 33 / 42 ---------- */
    {
      id: 'mo-zabbix-agentd',
      name: 'zabbix_agentd -t',
      alias: ['zabbix_agentd -t', '-p 打印所有 key', 'userparameter'],
      level: 3,
      syntax: 'zabbix_agentd [-c <配置文件>] -t "<key>" / zabbix_agentd -p / zabbix_agentd -R userparameter_reload',
      summary: '在 agent 本机测试监控项取值，确认 key 到底能不能取到数。',
      desc: '当 Server 侧 `zabbix_get` 取不到值时，要在**被监控主机**上用 `zabbix_agentd -t "<key>"` 本地测试，从而区分「key 本身有问题」还是「网络/权限有问题」。输出形如 `system.cpu.load[all,avg1]     [d|0.42]`——`d` 表示数值型（double），`s` 表示字符串型；如果输出 `ZBX_NOTSUPPORTED` 并附原因，就是 key 写法或自定义脚本报错。三个关键参数：`-c <配置文件>` 指定配置文件（**必须加**，否则默认路径与 daemon 实际使用的不一致，测出来的结果会误导你）、`-t "<key>"` 测试单个 key、`-p` 打印**所有受支持的 key 及当前值**（输出很长，常配合 grep 找 key 名）。自定义监控项（UserParameter）改完配置文件后可以用 `-R userparameter_reload` 让 agent **热加载**，不用重启。',
      params: [
        { flag: '-t "<key>"', desc: '测试单个监控项，输出 `[类型|值]`' },
        { flag: '-c <配置文件>', desc: '指定配置文件（必加，保证与 daemon 用的是同一份）' },
        { flag: '-p, --print', desc: '打印所有支持的监控项及当前值' },
        { flag: '-R <命令>', desc: '运行时控制，如 `userparameter_reload` 热加载自定义监控项' },
        { flag: '-T, --test-config', desc: '测试配置文件语法是否正确' },
        { flag: '-f, --foreground', desc: '前台运行，调试启动问题时用' }
      ],
      examples: [
        { cmd: 'zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -t "system.cpu.load[all,avg1]"', desc: '本机测试 key，输出 `[d|0.42]` 说明取值正常' },
        { cmd: 'zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -t "vfs.fs.size[/data,pfree]"', desc: '测试文件系统监控项（本站仿真 /data 剩余 0%）' },
        { cmd: 'zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -p | grep -i "mysql"', desc: '打印所有支持的 key 并过滤，确认自定义 key 是否注册成功' },
        { cmd: 'zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -R userparameter_reload', desc: '改完 UserParameter 后热加载，不用重启 agent' },
        { cmd: 'zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -T', desc: '测试配置文件语法，改配置后先跑一遍' }
      ],
      notes: [
        '`-c` 一定要写实际使用的配置文件路径（RHEL 系常见 `/etc/zabbix/zabbix_agentd.conf`，编译安装可能在 `/usr/local/etc/`），否则测出来的结果与线上不一致',
        '自定义 key 报 `ZBX_NOTSUPPORTED` 时，先用 `-p` 确认 key 是否注册成功，再检查 `UserParameter` 里的脚本能否被 zabbix 用户执行（**权限问题最常见**）',
        '`UserParameter` 的脚本要用**绝对路径**，且注意 zabbix 用户的 PATH 与登录用户不同',
        'Zabbix 5.0 起有 agent2（Go 实现），测试命令是 `zabbix_agent2 -t <key>`，参数与老 agent 略有差异',
        '`-p` 输出可能上千行，务必配合 `grep`；它也会真实执行取值脚本，重脚本别频繁跑',
        'agent 与 server 的时间要同步（chrony/ntp），时间偏差会导致主动模式数据被丢弃'
      ],
      related: ['mo-zabbix-get', 'mo-log-var-log', 'lu-systemctl'],
      docs: 'https://www.zabbix.com/documentation/current/en/manpages/zabbix_agentd',
      tags: ['Zabbix', 'agent', '监控项']
    },

    /* ---------- 34 / 42 ---------- */
    {
      id: 'mo-hcloud-ces',
      name: 'hcloud CES ShowMetricData',
      alias: ['hcloud CES', 'ShowMetricData', '华为云监控数据', 'KooCLI'],
      level: 4,
      syntax: 'hcloud CES ShowMetricData/v1 --cli-region=<区域> --project_id=<项目ID> --namespace=<命名空间> --metric_name=<指标> --dim.0=<维度键,维度值> --filter=<聚合方式> --period=<粒度> --from=<起始毫秒> --to=<结束毫秒>',
      summary: '用华为云 KooCLI 查云监控指标数据，把控制台图表搬到命令行与脚本里。',
      desc: '云监控服务 CES 的 `ShowMetricData` 接口（`GET /V1.0/{project_id}/metric-data`）用来查询指定指标在指定时间范围、指定粒度下的监控数据，KooCLI 里的命令形式是 `hcloud CES ShowMetricData/v1`（CES 有 v1/v2 两套 API，CLI 参考中以带版本后缀的形式记录）。参数约束（**写错会直接报参数错误或返回空数据**）：`namespace` 形如 `SYS.ECS`（各服务的命名空间见官方「支持监控的服务列表」）、`metric_name` 如 `cpu_util`、`dim.0` 格式为 `key,value`（如 `instance_id,<ECS实例ID>`，最多 4 个维度 `dim.0`~`dim.3`）、`filter` 取 `average`/`variance`/`min`/`max`/`sum`、`period` 取 1/60/300/1200/3600/14400/86400（秒）、`from`/`to` 是**毫秒级时间戳且 from 必须小于 to**（官方建议 from 相对当前时间至少向前偏移一个聚合周期，否则会因聚合未完成返回空）。KooCLI 的通用参数：`--cli-region` 区域、`--cli-profile` 指定配置项、`--cli-output=json|table|tsv` 输出格式、`--cli-query` 用 JMESPath 过滤结果、`--dryrun` **只打印请求不真正执行**（调试参数时非常有用）。接口限流 500 次/分钟，超限返回 `ces.0429` 或 `Too Many Requests`。',
      params: [
        { flag: '--cli-region=<区域>', desc: '区域，如 `cn-north-4`（北京四）' },
        { flag: '--project_id=<项目ID>', desc: '项目 ID，可在控制台「我的凭证」查看' },
        { flag: '--namespace=<命名空间>', desc: '服务命名空间，如 ECS 是 `SYS.ECS`' },
        { flag: '--metric_name=<指标>', desc: '指标名，如 `cpu_util`' },
        { flag: '--dim.0=<key,value>', desc: '维度，格式 `instance_id,<实例ID>`，最多 4 个' },
        { flag: '--filter=<聚合>', desc: '聚合方式：average/variance/min/max/sum' },
        { flag: '--period=<秒>', desc: '聚合粒度：1/60/300/1200/3600/14400/86400' },
        { flag: '--from / --to', desc: '起止时间，毫秒时间戳，from 必须小于 to' }
      ],
      examples: [
        { cmd: 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.ECS', desc: '先看这台机器上报了哪些指标' },
        { cmd: 'hcloud CES ShowMetricData --cli-region=cn-north-4 --namespace=SYS.ECS --metric_name=cpu_util', desc: '取 CPU 使用率的历史数据点，回答"那段时间到底发生了什么"' },
        { cmd: 'hcloud CES ShowMetricData/v1 --cli-region="cn-north-4" --project_id="<项目ID>" --namespace="SYS.ECS" --metric_name="cpu_util" --dim.0="instance_id,<ECS实例ID>" --filter="average" --period=300 --from=1710723600000 --to=1710727200000', desc: '查某台 ECS 指定 1 小时窗口的 5 分钟粒度平均 CPU 使用率' },
        { cmd: 'hcloud CES ShowMetricData/v1 --cli-region="cn-north-4" --namespace="SYS.ECS" --metric_name="cpu_util" --dim.0="instance_id,<ECS实例ID>" --filter="average" --period=300 --from=1710723600000 --to=1710727200000 --cli-output=table', desc: '表格输出，人工看数更直观' },
        { cmd: 'hcloud CES ShowMetricData/v1 --cli-region="cn-north-4" --namespace="SYS.ECS" --metric_name="cpu_util" --dim.0="instance_id,<ECS实例ID>" --filter="average" --period=300 --from=1710723600000 --to=1710727200000 --dryrun', desc: '只打印请求报文不真正调用，调试参数时先用它' },
        { cmd: 'hcloud CES ShowMetricData/v1 --cli-region="cn-north-4" --namespace="SYS.EVS" --metric_name="disk_util_inband" --dim.0="instance_id,<ECS实例ID>" --dim.1="disk_name,<云硬盘ID>" --filter="max" --period=300 --from=1710723600000 --to=1710727200000 --cli-query="datapoints[].max"', desc: '查云硬盘利用率并用 JMESPath 只取数据点' }
      ],
      notes: [
        '`from`/`to` 是**毫秒**时间戳且 `from` 必须小于 `to`；官方建议 from 至少向前偏移一个聚合周期，否则会因聚合未完成返回空数据（这是「查不到数据」的最常见原因）',
        '`dim.0` 的格式是「维度键,维度值」用**英文逗号**连接，写成等号或冒号会直接报参数错误',
        '接口有 500 次/分钟限流，批量巡检脚本要做退避重试，别写死循环',
        'KooCLI 首次使用要先 `hcloud configure init` 配置 AK/SK 与区域，或设置环境变量；凭证不要写进脚本提交到 Git',
        '`--dryrun` 只打印请求报文，是调试参数最省事的方式',
        '控制台看到的图表与 API 返回可能有几分钟延迟，属正常（指标采集与聚合本身有延迟）'
      ],
      related: ['mo-hcloud-lts', 'mo-promql', 'mo-zabbix-get'],
      docs: 'https://support.huaweicloud.com/api-ces/ces_03_0033.html',
      tags: ['华为云', '云监控', 'KooCLI']
    },

    /* ---------- 35 / 42 ---------- */
    {
      id: 'mo-hcloud-lts',
      name: 'hcloud LTS ListLogs',
      alias: ['hcloud LTS', 'ListLogs', '华为云日志检索', '云日志服务'],
      level: 4,
      syntax: 'hcloud LTS ListLogs --cli-region=<区域> --project_id=<项目ID> --log_group_id=<日志组ID> --log_stream_id=<日志流ID> --start_time=<起始毫秒> --end_time=<结束毫秒> [--keywords=<关键词>] [--limit=<条数>]',
      summary: '用 KooCLI 检索云日志服务里的日志，把日志查询接进脚本与自动化。',
      desc: '华为云 LTS（云日志服务）的「查询日志」接口是 `ListLogs`（`POST /v2/{project_id}/groups/{log_group_id}/streams/{log_stream_id}/content/query`），KooCLI 命令为 `hcloud LTS ListLogs`。路径参数三个：`project_id`、`log_group_id`（日志组）、`log_stream_id`（日志流）；查询参数重点：`start_time`/`end_time` 是**毫秒级时间戳**（闭区间，单次查询区间最大 180 天，两者取值不能相同）、`keywords` 关键词精确搜索（如 `query timeout`）、`limit` 单次返回条数（1~5000，默认 50，官方建议 100）、`is_desc` 是否倒序（默认 false）、`is_count` 是否返回总数、`labels` 按结构化字段过滤（如 `hostName`）、`scroll_id`/`line_num` 用于分页。做聚合分析时用 `query`（管道符/SQL 语句，如 `* | select count(*)`）并配合 `is_analysis_query=true`，此时除起止时间外的其他查询参数会失效。日志量大时官方推荐用 `--cli-jsonInput` 把参数写进 JSON 文件，避免命令行过长。',
      params: [
        { flag: '--project_id', desc: '项目 ID（路径参数）' },
        { flag: '--log_group_id', desc: '日志组 ID（路径参数）' },
        { flag: '--log_stream_id', desc: '日志流 ID（路径参数）' },
        { flag: '--start_time / --end_time', desc: '毫秒级时间戳，闭区间，最大跨度 180 天' },
        { flag: '--keywords=<词>', desc: '关键词精确搜索，如 `query timeout`' },
        { flag: '--limit=<条数>', desc: '返回条数，1~5000，默认 50' },
        { flag: '--is_desc=true', desc: '倒序返回（最新的在前）' },
        { flag: '--query / --is_analysis_query', desc: '管道符/SQL 分析语句与开关，开启后其他过滤参数失效' }
      ],
      examples: [
        { cmd: 'hcloud LTS ListLogs --cli-region=cn-north-4 --cli-output=table', desc: '列出日志组与日志流（接入云日志后先确认接进来了）' },
        { cmd: 'hcloud LTS ListLogs --cli-region=cn-north-4 --cli-query="logs[*].[log_group_name,log_stream_name,ttl_in_days]" --cli-output=tsv', desc: '看每个日志流的保留天数 —— 排障时"日志只留 7 天"是常见坑' },
        { cmd: 'hcloud LTS ListLogs --cli-region="cn-north-4" --project_id="<项目ID>" --log_group_id="<日志组ID>" --log_stream_id="<日志流ID>" --start_time="1710723600000" --end_time="1710727200000" --keywords="query timeout" --limit=100 --is_desc=true', desc: '检索指定时间窗内含 query timeout 的日志（对应本站仿真应用报超时的场景）' },
        { cmd: 'hcloud LTS ListLogs --cli-region="cn-north-4" --project_id="<项目ID>" --log_group_id="<日志组ID>" --log_stream_id="<日志流ID>" --start_time="1710723600000" --end_time="1710727200000" --keywords="ERROR" --limit=100 --is_count=true', desc: '同时返回命中总数，用于统计错误量级' },
        { cmd: 'hcloud LTS ListLogs --cli-region="cn-north-4" --project_id="<项目ID>" --log_group_id="<日志组ID>" --log_stream_id="<日志流ID>" --start_time="1710723600000" --end_time="1710727200000" --labels=\'{"hostName":"web-prod-01"}\' --limit=100', desc: '按结构化字段过滤，只看某台主机的日志' },
        { cmd: 'hcloud LTS ListLogs --cli-region="cn-north-4" --cli-jsonInput=/data/backup/lts-query.json', desc: '参数多时用 JSON 文件传入，避免命令行过长写错' }
      ],
      notes: [
        '`start_time`/`end_time` 是**毫秒**时间戳且不能相等，单次查询区间上限 180 天，跨度太大要分段查',
        '`limit` 上限 5000，超出会报参数错误；要翻页用返回里的 `scroll_id`（配合 `line_num`）继续查',
        '`is_analysis_query=true` 时**其余过滤参数全部失效**，分页、排序、条数都要靠 `query` 里的 SQL 语句控制',
        '结构化字段（`labels`）过滤依赖日志流已配置索引，未建索引的字段过滤不出结果',
        'KooCLI 参数带点号或特殊字符时要用引号包住；参数多建议用 `--cli-jsonInput` 传 JSON 文件',
        '日志检索接口也有流控，批量拉日志请控制频率，不要写高频轮询'
      ],
      related: ['mo-hcloud-ces', 'mo-log-journalctl', 'mo-log-tail'],
      docs: 'https://support.huaweicloud.com/api-lts/ListLogs.html',
      tags: ['华为云', '日志检索', 'KooCLI']
    },

    /* ================= E. JVM 与语言级诊断（7 条） ================= */

    /* ---------- 36 / 42 ---------- */
    {
      id: 'mo-jvm-jps',
      name: 'jps -lvm',
      alias: ['jps', 'jps -lvm', 'Java 进程列表'],
      level: 1,
      syntax: 'jps [-q] [-l] [-m] [-v] [-lvm]',
      summary: '列出本机所有 JVM 进程与启动参数，排查 Java 应用的第一步。',
      desc: 'Java 进程的完整命令行很长（`java -Xms2g -Xmx2g -jar app.jar --spring.profiles.active=prod`），`ps` 看起来费劲，`jps` 是 JDK 自带的专门工具。四个参数可自由组合：`-q` 只输出 PID、`-l` 显示主类全名或 jar 路径、`-m` 显示传给 main 方法的参数、`-v` 显示 JVM 参数（`-Xmx`、`-XX:` 等），日常直接用 `-lvm` 一次看全。输出第一列是 PID，后面依次是主类/jar、main 参数、JVM 参数。**注意两点**：① `jps` 只能看到**与当前用户相同**的 JVM 进程（root 能看到全部，普通用户看不到别人的），排查时经常要加 `sudo -u <应用用户>`；② 容器里执行 `jps` 要在容器命名空间内（`docker exec` 或 `kubectl exec`），在宿主机上执行看不到容器里的 JVM。本站仿真环境里应用是 `/opt/myapp/app.jar`（软链到 `/data/app/app.jar`），进程 PID 18442，`jps -lvm` 能看到它的完整启动参数。',
      params: [
        { flag: '-q', desc: '只输出 PID，便于管道处理' },
        { flag: '-l', desc: '显示主类全名或 jar 包完整路径' },
        { flag: '-m', desc: '显示传给 main() 的参数' },
        { flag: '-v', desc: '显示 JVM 启动参数（-Xmx、-XX 等）' },
        { flag: '-lvm', desc: '三个一起用，日常排查的标准写法' }
      ],
      examples: [
        { cmd: 'jps -lvm', desc: '最常用：一次看全 PID、jar 路径、main 参数与 JVM 参数' },
        { cmd: 'jps -q', desc: '只取 PID，喂给 jstat/jstack 等后续命令' },
        { cmd: 'jps -lv | grep -i app.jar', desc: '只看应用进程并确认它用的堆大小参数' },
        { cmd: 'docker exec -it web jps -lvm', desc: '容器化部署时进容器执行（本站仿真的 web 容器就是 java -jar app.jar）' }
      ],
      notes: [
        '`jps` 只能看到**同用户**的 JVM，看不到别人的进程时先确认是不是权限问题，用 `sudo -u deploy jps -lvm` 或 root 执行',
        '容器里的 JVM 在宿主机上执行 `jps` 看不到，必须 `docker exec` / `kubectl exec` 进容器',
        '`jps` 显示的 PID 是 JVM 视角的 PID，容器里通常是 1 号进程，与宿主机看到的 PID 不同',
        '生产环境如果只装了 JRE（没有 JDK），是没有 `jps`/`jstack` 这些工具的，排障要用 `jcmd`（JDK 9+ 自带于 JDK）或提前装好 JDK',
        '`jps` 本身很轻量，可以放心执行，不像 `jmap`/`jstack` 会对目标进程有影响'
      ],
      related: ['mo-jvm-jstat', 'mo-jvm-jstack', 'mo-jvm-jmap', 'mo-ps'],
      docs: 'https://docs.oracle.com/en/java/javase/17/docs/specs/man/jps.html',
      tags: ['JVM', '进程', '入门']
    },

    /* ---------- 37 / 42 ---------- */
    {
      id: 'mo-jvm-jstat',
      name: 'jstat -gcutil',
      alias: ['jstat', '-gcutil', 'GC 频率', 'GC 耗时', 'YGC FGC'],
      level: 3,
      syntax: 'jstat -gcutil <PID> [<间隔毫秒> [<次数>]]',
      summary: '看各内存区使用率与 GC 次数耗时，判断 GC 是否拖慢了应用。',
      desc: '`jstat -gcutil <PID> 1000 10` 表示每秒采样一次、共 10 次，输出各内存区**使用率百分比**与 GC 统计：`S0`/`S1`（两个 Survivor 区）、`E`（Eden）、`O`（**老年代**）、`M`（元空间 Metaspace）、`CCS`（压缩类空间）、`YGC`（Young GC 次数）、`YGCT`（Young GC 总耗时秒）、`FGC`（**Full GC 次数**）、`FGCT`（Full GC 总耗时秒）、`GCT`（GC 总耗时）。**判读要点**：① `E` 快速上涨到接近 100% 然后回落 = 正常的 Young GC 节奏；② **`FGC` 持续增长**说明老年代不断被填满，通常是内存泄漏或堆太小；③ `FGCT` 增长速度快（比如每分钟好几秒）说明 Full GC 已经影响到业务吞吐；④ `O` 长期停在 90% 以上不下降 = 危险信号，很快会 OOM；⑤ `GCT` 占总运行时间的比例是「GC 开销」，超过 5% 就该优化。想看**具体容量**用 `jstat -gc <PID>`（单位为 KB），想看上次 GC 原因用 `jstat -gccause`。jstat 是**纯读取** JVM 内部计数器，开销极小，可以放心在生产上短时使用（这也是它比 `jmap` 安全的地方）。',
      params: [
        { flag: '-gcutil <PID> <间隔> <次数>', desc: '输出各区使用率与 GC 次数/耗时' },
        { flag: '-gc <PID>', desc: '输出各区**容量**（KB）与 GC 次数，看堆到底多大' },
        { flag: '-gccause <PID>', desc: '额外显示上次 GC 的原因（Allocation Failure / Ergonomics 等）' },
        { flag: '-gcnew / -gcold', desc: '只看新生代 / 老年代的详细统计' },
        { flag: '-gccapacity', desc: '各代的容量与使用上限，判断堆是否够用' },
        { flag: 'YGC/YGCT', desc: 'Young GC 次数与总耗时（秒）' },
        { flag: 'FGC/FGCT', desc: 'Full GC 次数与总耗时（秒），重点盯这两个' }
      ],
      examples: [
        { cmd: 'jstat -gcutil 18442 1000 10', desc: '每秒采样共 10 次，看 Eden/老年代变化与 GC 节奏' },
        { cmd: 'jstat -gcutil 18442 1000 | head -20', desc: '持续采样（Ctrl+C 结束），观察 FGC 是否不断增长' },
        { cmd: 'jstat -gc 18442', desc: '看各区容量（KB）与已用大小，确认堆配置是否合理' },
        { cmd: 'jstat -gccause 18442 2000 5', desc: '每 2 秒采样一次并显示上次 GC 原因，排查频繁 GC 的诱因' }
      ],
      notes: [
        '`jstat -gcutil` 输出的是**百分比**，要具体容量请用 `jstat -gc`，两者配合才完整',
        '`FGC` 持续增长 = 老年代反复被填满，优先怀疑内存泄漏（配合 `jmap -histo` 看对象增长）或堆设置过小',
        '**GC 耗时占比**（GCT / 运行时长）超过 5% 就应优化；超过 10% 业务通常已有明显抖动',
        '`jstat` 的采样间隔不要小于 1000 毫秒，太密会干扰观测；它在生产上可以安全使用',
        'JVM 启动参数里 `-Xmx` 与 `-Xms` 建议设成相同值，避免堆动态伸缩带来的额外 GC',
        '更细的 GC 分析要看 GC 日志：JDK 9+ 用 `-Xlog:gc*:file=/data/app/logs/gc.log:time,uptime:filecount=5,filesize=50M`，JDK 8 用 `-XX:+PrintGCDetails -Xloggc:<文件>`',
        '本站仿真里应用日志反复出现 `query timeout after 5000ms`，如果同时 `FGC` 频繁，很可能是长时间 Full GC 停顿导致请求超时'
      ],
      related: ['mo-jvm-jps', 'mo-jvm-jmap', 'mo-jvm-jstack', 'mo-jvm-arthas'],
      docs: 'https://docs.oracle.com/en/java/javase/17/docs/specs/man/jstat.html',
      tags: ['JVM', 'GC', '内存']
    },

    /* ---------- 38 / 42 ---------- */
    {
      id: 'mo-jvm-jmap',
      name: 'jmap -heap / -dump',
      alias: ['jmap', 'jmap -heap', '-dump', 'heap dump', 'OOM'],
      level: 4,
      syntax: 'jmap -heap <PID> / jmap -histo[:live] <PID> / jmap -dump:[live,]format=b,file=<文件> <PID>',
      summary: '看堆配置与对象分布，导出堆快照做内存泄漏分析，导出会停世界。',
      desc: '三个用法层次不同：① `jmap -heap <PID>` 输出堆配置与各代使用（JDK 8 上信息最全，G1 下信息较少，可改用 `jcmd <PID> GC.heap_info`）；② `jmap -histo <PID>` 输出**对象直方图**（按类统计实例数与占用字节），加 `:live` 会先触发一次 Full GC 只统计存活对象——**`:live` 有 STW 停顿**，不加则不停顿但数据含垃圾对象；③ `jmap -dump:live,format=b,file=<文件> <PID>` **导出堆快照**（hprof 格式，用 MAT/VisualVM 分析），这是排查内存泄漏的终极手段。**生产警告**：`-dump:live` 会触发 Full GC 并暂停整个 JVM（几秒到几十秒，堆越大越久），且 dump 文件大小接近堆占用（几 GB 很常见）。更稳妥的做法是启动时加 `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/app/logs/`，让 JVM 在 OOM 时**自动**导出，既拿到现场又不用人工触发停顿。',
      params: [
        { flag: '-heap', desc: '显示堆配置与各代使用情况（JDK 8 信息最全）' },
        { flag: '-histo <PID>', desc: '对象直方图，按类看实例数与占用内存' },
        { flag: '-histo:live <PID>', desc: '只统计存活对象，**会触发 Full GC（STW）**' },
        { flag: '-dump:format=b,file=<文件>', desc: '导出堆快照（不含垃圾对象，不停顿）' },
        { flag: '-dump:live,format=b,file=<文件>', desc: '导出前先 Full GC 只留存活对象，**停顿明显**' },
        { flag: '-XX:+HeapDumpOnOutOfMemoryError', desc: 'OOM 时自动 dump（启动参数，推荐）' },
        { flag: '-XX:HeapDumpPath=<路径>', desc: '自动 dump 的存放路径，注意磁盘空间' }
      ],
      examples: [
        { cmd: 'jmap -heap 18442', desc: '看堆配置与各代使用情况（JDK 8 上信息最完整）' },
        { cmd: 'jmap -histo 18442 | head -30', desc: '看对象数量排行（不停顿，适合生产快速排查）' },
        { cmd: 'jmap -histo:live 18442 | head -30', desc: '只看存活对象（会触发 Full GC，生产低峰期执行）' },
        { cmd: 'jmap -dump:live,format=b,file=/data/app/logs/heap-18442-$(date +%F-%H%M).hprof 18442', desc: '导出堆快照供 MAT 分析（会 STW，且文件很大，先确认磁盘空间）' },
        { cmd: 'jcmd 18442 GC.heap_info', desc: '不停顿地看堆信息，JDK 9+ 推荐的 jmap -heap 替代品' }
      ],
      notes: [
        '**`jmap -dump`（尤其带 `:live`）会造成 STW 停顿**：几 GB 的堆可能暂停数秒到数十秒，业务表现为请求超时或雪崩，生产必须低峰期执行并提前通知',
        'dump 文件大小约等于堆占用（几 GB 很常见），本站仿真里 `/data` 盘已 100%，**导出前一定要先 `df -h` 确认空间**，否则会直接把盘写满引发更大故障',
        '推荐做法是启动参数加 `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/app/logs/`，OOM 时自动 dump，不用人工制造停顿',
        '`-histo:live` 同样会触发 Full GC，别被「只是直方图」误导',
        'dump 文件要用 MAT（Eclipse Memory Analyzer）或 VisualVM 打开分析，直接看二进制没意义；分析完记得删除大文件',
        'JDK 9+ 更推荐 `jcmd <PID> GC.heap_dump <文件>`，语义更清晰；`jmap -heap` 在新版本与 G1/ZGC 下信息有限',
        '容器里 dump 路径要挂载出来，否则容器重建后快照就丢了'
      ],
      related: ['mo-jvm-jstat', 'mo-jvm-jstack', 'mo-jvm-jps', 'mo-jvm-arthas'],
      docs: 'https://docs.oracle.com/en/java/javase/17/docs/specs/man/jmap.html',
      tags: ['JVM', '堆快照', '危险']
    },

    /* ---------- 39 / 42 ---------- */
    {
      id: 'mo-jvm-jstack',
      name: 'jstack',
      alias: ['jstack', '线程栈', '死锁', '高 CPU 线程'],
      level: 3,
      syntax: 'jstack [-l] [-F] [-m] <PID> > <文件>',
      summary: '抓 Java 线程栈，定位死锁、卡住的线程与吃 CPU 的热点线程。',
      desc: '`jstack -l <PID>` 打印 JVM 内所有线程的调用栈（`-l` 额外显示锁信息，**排查死锁必加**）。**死锁排查**：JVM 会自动检测并在线程栈末尾打印 `Found one Java-level deadlock:` 与涉及的两个（或多个）线程及各自持有的锁——直接 `grep -A 30 "Found one Java-level deadlock"` 就能拿到结论。**高 CPU 排查（固定套路）**：① `top -H -p <PID>` 找到占 CPU 最高的线程，记下它的 **十进制 TID**；② `printf "%x\\n" <TID>` 把 TID 转成**十六进制**；③ 在 `jstack` 输出里搜 `nid=0x<十六进制TID>`，命中那段栈就是热点线程正在执行的代码。**线程状态判读**：`RUNNABLE`（正在跑或等 IO）、`BLOCKED`（等 synchronized 锁，大量 BLOCKED 说明锁竞争严重）、`WAITING`/`TIMED_WAITING`（`park`/`sleep`，需结合栈顶方法判断是不是在等下游）。**抓栈要有对比**：间隔 5~10 秒抓 2~3 次，**多次都卡在同一处**的线程才是真问题。本站仿真里应用线程名形如 `http-nio-8080-exec-4`，日志中 `query timeout after 5000ms` 的那次请求如果线程还卡着，就能在 jstack 里精确找到它卡在哪个方法上。',
      params: [
        { flag: '<PID>', desc: '目标 JVM 进程号（可用 `jps -lvm` 获取）' },
        { flag: '-l, --long', desc: '显示额外的锁信息，**排死锁必加**' },
        { flag: '-F, --force', desc: '进程无响应时强制 dump（jstack 挂起时用）' },
        { flag: '-m, --mixed', desc: '同时打印 Java 与 native 栈帧' },
        { flag: '> <文件>', desc: '重定向到文件，便于搜索与对比多次快照' },
        { flag: 'nid=0x<十六进制>', desc: '在输出里按这个关键字定位高 CPU 的线程' }
      ],
      examples: [
        { cmd: 'jstack -l 18442 > /tmp/jstack-18442-$(date +%H%M%S).txt', desc: '抓一份带锁信息的线程栈快照（最基本用法）' },
        { cmd: 'grep -A 30 "Found one Java-level deadlock" /tmp/jstack-18442-*.txt', desc: '直接看 JVM 检测到的死锁结论' },
        { cmd: 'top -H -p 18442 -b -n 1 | head -15', desc: '第一步：找占 CPU 最高的线程 TID（十进制）' },
        { cmd: 'printf "%x\\n" 18473', desc: '第二步：把十进制 TID 转成十六进制（如 18473 → 4829）' },
        { cmd: 'grep -A 25 "nid=0x4829" /tmp/jstack-18442.txt', desc: '第三步：在线程栈里定位该线程正在执行的代码' },
        { cmd: 'grep -c "java.lang.Thread.State: BLOCKED" /tmp/jstack-18442.txt', desc: '统计阻塞线程数，判断锁竞争是否严重' }
      ],
      notes: [
        '抓栈要**间隔抓 2~3 次做对比**，只有多次都停在同一位置的线程才是真卡住，单次快照容易误判',
        '`jstack -F` 会强制挂起目标进程，属于最后手段，能用普通模式就别加',
        '高 CPU 线程的 TID 必须转成**十六进制**才能匹配 `nid=0x...`，很多人卡在这一步',
        '`jstack` 本身开销很小但有极短的 safepoint 停顿，生产上短时使用是安全的；`-F` 模式风险较高',
        '容器里 `jstack` 要用**容器内的 PID**（通常是 1），并且要与 JVM 同用户执行',
        '大量线程卡在 `socketRead0`/`read` 通常是下游（数据库、Redis、HTTP 依赖）慢；卡在同一个 `synchronized` 块则是锁竞争',
        '如果线程数异常多（几千），先查线程池配置与「是不是每次请求都新建线程」，再看栈'
      ],
      related: ['mo-jvm-jstat', 'mo-jvm-jmap', 'mo-jvm-arthas', 'mo-pidstat', 'mo-top'],
      docs: 'https://docs.oracle.com/en/java/javase/17/docs/specs/man/jstack.html',
      tags: ['JVM', '线程', '死锁']
    },

    /* ---------- 40 / 42 ---------- */
    {
      id: 'mo-jvm-jinfo',
      name: 'jinfo -flags',
      alias: ['jinfo', '-flags', 'JVM 参数', '动态调整 JVM'],
      level: 3,
      syntax: 'jinfo -flags <PID> / jinfo -flag <参数名> <PID> / jinfo -flag [+|-]<参数> <PID>',
      summary: '查看 JVM 生效的启动参数，并动态开关部分可管理参数。',
      desc: '`jinfo -flags <PID>` 输出该进程**当前生效**的全部 JVM 参数（含命令行显式指定与默认值，`-XX:+PrintFlagsFinal` 也能看但需要重启），是确认「线上到底用的哪套参数」的唯一可靠方式；`jinfo -flag <参数名> <PID>` 查单个参数（如 `jinfo -flag MaxHeapSize 18442`、`jinfo -flag UseG1GC 18442`）。**动态修改**：只有标记为 `manageable` 的参数才能在运行时改，例如 `jinfo -flag +HeapDumpOnOutOfMemoryError <PID>`、`jinfo -flag ExitOnOutOfMemoryError <PID>`、`jinfo -flag PrintGC <PID>`（JDK 8）——堆大小（`-Xmx`）、GC 算法这类参数**不支持**运行时修改，必须重启。哪些参数可管理可以用 `java -XX:+PrintFlagsFinal -version | grep manageable` 查。JDK 9+ 更推荐用 `jcmd <PID> VM.flags` 与 `jcmd <PID> VM.set_flag <参数> <值>`。',
      params: [
        { flag: '-flags <PID>', desc: '打印全部生效的 JVM 参数' },
        { flag: '-flag <参数名> <PID>', desc: '查询单个参数的值' },
        { flag: '-flag [+|-]<参数> <PID>', desc: '动态开关布尔型 manageable 参数' },
        { flag: '-flag <参数>=<值> <PID>', desc: '动态设置数值型 manageable 参数' },
        { flag: '-sysprops <PID>', desc: '打印系统属性（相当于 System.getProperties）' },
        { flag: 'jcmd <PID> VM.flags', desc: 'JDK 9+ 的替代方式，输出更规范' }
      ],
      examples: [
        { cmd: 'jinfo -flags 18442', desc: '确认线上 JVM 的全部生效参数（含堆大小与 GC 算法）' },
        { cmd: 'jinfo -flag MaxHeapSize 18442', desc: '单查最大堆（返回字节数），核对是否与预期一致' },
        { cmd: 'jinfo -flag UseG1GC 18442', desc: '确认用的是不是 G1 垃圾回收器' },
        { cmd: 'jinfo -flag +HeapDumpOnOutOfMemoryError 18442', desc: '运行时打开 OOM 自动 dump（可管理参数，立即生效）' },
        { cmd: 'jcmd 18442 VM.flags', desc: 'JDK 9+ 推荐的替代写法，输出更规范易读' }
      ],
      notes: [
        '**只有 `manageable` 参数能动态修改**，`-Xmx`/`-Xms`/GC 算法等核心参数改不了，别在生产上试（会报错或无效）',
        '`jinfo -flags` 输出包含大量默认参数，想只看显式指定的可以对比 `jps -lvm` 的输出',
        '动态改的参数**重启后失效**，要持久化必须改启动脚本或容器编排里的 JVM 参数',
        'JDK 9+ 的 `jinfo` 依赖 attach 机制，容器/受限环境可能报 `Unable to open socket file`，此时用 `jcmd` 或进容器执行',
        '改 JVM 参数的标准流程是：改启动参数 → 滚动重启 → 用 `jinfo -flags` 复核，而不是指望 `jinfo` 动态改'
      ],
      related: ['mo-jvm-jps', 'mo-jvm-jstat', 'mo-jvm-jmap'],
      docs: 'https://docs.oracle.com/en/java/javase/17/docs/specs/man/jinfo.html',
      tags: ['JVM', '参数', '排查']
    },

    /* ---------- 41 / 42 ---------- */
    {
      id: 'mo-jvm-arthas',
      name: 'arthas',
      alias: ['arthas', 'dashboard', 'thread -n', 'trace', '阿尔萨斯'],
      level: 4,
      syntax: 'java -jar arthas-boot.jar  然后 dashboard / thread / trace / watch / jad',
      summary: '在线诊断 Java 应用的瑞士军刀，不重启就能看线程、追踪方法耗时。',
      desc: 'Arthas 是阿里开源的 Java 诊断工具，**attach 到运行中的 JVM**，把以前必须重启加日志才能做的事变成在线操作。启动：`curl -O https://arthas.aliyun.com/arthas-boot.jar` 然后 `java -jar arthas-boot.jar`，它会列出所有 JVM 进程让你选序号。核心命令：`dashboard`（实时面板：线程、内存、GC、运行环境，相当于 JVM 版 top）、`thread`（列出全部线程）、**`thread -n 3`**（最忙的 3 个线程及其栈，直接对应高 CPU 排查）、**`thread -b`**（找出**阻塞其他线程的元凶**，死锁排查神器）、`thread --state BLOCKED`、**`trace <类> <方法>`**（跟踪方法内部调用路径与每个子调用耗时，定位慢在哪一行）、`watch <类> <方法> "{params, returnObj, throwExp}" -x 3`（观察入参、返回值和异常）、`stack`（看方法被谁调用）、`monitor -c 5 <类> <方法>`（统计调用次数、成功率、平均耗时）、`jad --source-only <类>`（在线反编译看线上代码版本）、`sc`/`sm`（查类与方法）、`tt`（时空隧道，记录调用现场并回放）、`stop`（退出）。**与 jstack/jmap 的关系**：Arthas 底层也是这些机制，但把「抓快照 → 人工分析」变成了「交互式实时观测」。',
      params: [
        { flag: 'dashboard', desc: '实时面板：线程、内存、GC、系统信息' },
        { flag: 'thread -n <N>', desc: '显示最忙的 N 个线程栈，高 CPU 排查首选' },
        { flag: 'thread -b', desc: '找出阻塞其他线程的线程（死锁/锁竞争）' },
        { flag: 'trace <类> <方法>', desc: '跟踪方法内部调用路径与各子调用耗时' },
        { flag: 'watch <类> <方法> <表达式>', desc: '观察入参、返回值、异常，如 `{params, returnObj, throwExp}`' },
        { flag: 'monitor -c <周期> <类> <方法>', desc: '按周期统计调用次数、成功率与平均 RT' },
        { flag: 'jad <类>', desc: '在线反编译，确认线上跑的是哪份代码' },
        { flag: 'stop / quit', desc: '`stop` 完全退出并重置增强，`quit` 只退出当前会话' }
      ],
      examples: [
        { cmd: 'java -jar arthas-boot.jar 18442', desc: '直接 attach 到指定 PID（不加 PID 会列出进程让你选）' },
        { cmd: 'dashboard', desc: '进去先看面板：线程数、堆使用、GC 次数一目了然' },
        { cmd: 'thread -n 3', desc: '看最忙的 3 个线程栈，定位 CPU 消耗位置' },
        { cmd: 'trace c.e.o.OrderService queryOrder', desc: '跟踪订单查询方法的调用链与耗时，定位慢在哪一步（对应本站仿真里 query timeout 的场景）' },
        { cmd: 'watch c.e.o.OrderService queryOrder \'{params, returnObj, throwExp}\' -x 3', desc: '观察方法入参、返回值与抛出的异常，排查偶发问题' },
        { cmd: 'thread -b', desc: '一键找出阻塞其他线程的线程，比人工分析 jstack 快得多' }
      ],
      notes: [
        '`trace`/`watch`/`monitor` 都会**增强字节码**，对高频方法（每秒上万次调用）有明显性能开销，一定要用 `-n`/`--cost` 等参数限制次数或时间，观察完及时 `stop`',
        '生产使用前要评估风险并与团队确认；Arthas 会占用额外内存，堆本来就紧张时谨慎使用',
        '必须在**与目标 JVM 相同用户**下启动（不同用户 attach 会失败）；容器里要进容器执行并保证 JDK 可用',
        '`stop` 会重置所有增强并退出；直接 `kill` 掉 Arthas 进程可能残留字节码增强，优先用 `stop` 正常退出',
        '线上反编译（`jad`）出来的代码可能与 Git 仓库不一致（热修过、打包时用了旧分支），排查时以线上为准',
        'Arthas 需要下载 jar 包，内网环境要提前准备离线包；不要在公网直接 `curl` 后无校验地运行',
        '本篇涉及的 JVM 诊断（`jstat`/`jmap`/`jstack`）与 Arthas 是互补关系：`jstat` 看 GC 趋势、`jmap` 抓堆快照做深分析、`jstack` 拿线程栈证据、Arthas 做在线交互式观测'
      ],
      related: ['mo-jvm-jstack', 'mo-jvm-jstat', 'mo-jvm-jmap', 'mo-jvm-jps'],
      docs: 'https://arthas.aliyun.com/doc/',
      tags: ['JVM', '在线诊断', 'Arthas']
    },

    /* ---------- 42 / 42 ---------- */
    {
      id: 'mo-pmap',
      name: 'pmap',
      alias: ['pmap -x', '进程内存映射', '看进程占了多少内存'],
      level: 3,
      syntax: 'pmap -x <PID> [-d] [--sort=<字段>]  |  pmap <PID>',
      summary: '把一个进程的内存映射一段段列出来，看清内存到底被谁占着。',
      desc: '`ps` 只告诉你这个进程用了多少 RSS，`pmap` 告诉你**这些内存在哪**：每一段映射的起始地址、大小（Kbytes）、常驻量（RSS）、脏页（Dirty）和来源（`[anon]` 堆/栈、`[stack]`、映射的 `.so` 文件、`[heap]`）。\n\n**为什么值得单独学**：`ps` 看到某进程 RSS 一路涨，但说不清是 Java 堆、是 JVM 自己的元空间，还是某个 `.so` 或线程栈泄漏。`pmap -x` 按段看，配合 `--sort=rss` 直接找出占得最多的那几段；看 `.so` 段数异常多，通常是插件/`dlopen` 泄漏。\n\n**一个常见误判**：RSS 加起来会比 `ps` 的 RSS 大，因为共享库被多个进程映射、每边都算一遍。真要看"独占了多少"用 `Pss`（`/proc/<PID>/smaps` 里才有，`pmap -x` 不给）。',
      params: [
        { flag: '-x', desc: '扩展格式：多出 RSS 与 Dirty 两列，排障基本只用这一种' },
        { flag: '-d', desc: '显示设备映射（`.so`、共享内存段），排查库文件占用时用' },
        { flag: '--sort=<字段>', desc: '按 rss / size / dirty 等排序，找大户最省事' },
        { flag: '-q', desc: '不显示表头与合计，方便接 `awk` 取数' },
        { flag: '<PID>', desc: '目标进程号，先用 `pgrep -f 名字` 拿到' }
      ],
      examples: [
        { cmd: 'pmap -x 18442 | tail -5', desc: '看最后那行合计：total 的 RSS 就是这个进程占的物理内存' },
        { cmd: 'pmap -x 18442 --sort=rss | tail -15', desc: '按 RSS 从大到小排，一眼看出内存被哪几段占着' },
        { cmd: 'pmap -x 18442 | grep -c "\\.so"', desc: '数一下加载了多少个动态库；数量只涨不跌，多半是插件重复加载' },
        { cmd: 'pmap -d 18442 | head -20', desc: '看设备映射段，确认共享库与共享内存的分布' }
      ],
      notes: [
        '⚠️ **本教学终端的进程是模拟的、没有真实内核映射表，所以 `pmap` 跑不了**（会明确提示原因，不会假装成功）。真机上用它；教学环境里看内存分布请用 `ps -eo pid,rss,pmem,cmd --sort=-rss`。',
        '各段 RSS 之和大于 `ps` 的 RSS 是正常的：共享库被每个进程各算一份，不是统计错误',
        '看"独占内存"要看 `Pss` 而不是 `Rss`，那在 `/proc/<PID>/smaps` 里，`pmap` 不提供',
        'Java 进程别只看 pmap：堆的问题用 `jmap -heap` / `jstat -gc` 更直接（见分类 11 的 JVM 条目）',
        '对短命进程抓不到：它可能在两次 `pmap` 之间就退出了，脚本里要判 `$?`'
      ],
      related: ['mo-ps', 'mo-top', 'mo-free', 'mo-proc', 'mo-jvm-jstat'],
      docs: 'https://man7.org/linux/man-pages/man1/pmap.1.html',
      tags: ['内存', '进程', '排障', '内存泄漏']
    }
  );
})();
