/* ==========================================================================
   data/cards-container.js · 每日一练卡片：容器与编排（docker / kubernetes / helm）
   --------------------------------------------------------------------------
   数据契约与质量线见 data/cards.js 顶部注释 —— 本文件照抄那 20 张样板卡的质量线：
     · 背面不抄 summary，只回答"为什么现在用这条、而不是旁边那条"
     · why 必须有可验证的判据（输出里的某个字段值、某句报错/状态）
     · contrast 写"如果现象不是这样，该往哪想"
     · run 全部是 assets/js/shell.js 真能跑通、且输出与讲解对得上的命令
   所有 run 的观察对象都来自 data/termfs.js 里那套刻意做坏的集群与容器：
     worker-6b8f7c9d4-m2vqt（CrashLoopBackOff，DNS 解析不了 cache-prod-01）
     batch-job-28471920-x7klm（Pending，FailedScheduling: Insufficient cpu）
     logs-pvc（Pending，csi-nas 供不出卷）/ old-web、debug-tmp（退出码 1 / 137 OOM）
     helm release：myapp(my-app)、prometheus(monitoring)、mysql(default)
   顺带一提：本文件里的 re-run 不创建也不删除任何 release，只读 + 升级 myapp，
   所以无论从哪张卡开始看，helm list -A 里的三个 release 都还在。
   ========================================================================== */
(function () {
  'use strict';

  window.CC_CARDS = window.CC_CARDS || [];

  /* ==================== Docker 容器 ==================== */
  window.CC_CARDS.push(

    {
      id: 'card-docker-container-missing-ps-a',
      cat: 'docker',
      kind: 'diagnose',
      level: 1,
      front: '同事说机器上的服务挂了，你列了一遍容器，只有三个还活着的，那个"应该存在"的容器连影子都没有。',
      hint: '默认只列"还在跑"的容器。',
      answer: 'docker ps -a',
      why: '不加 `-a` 时只显示 `Up` 状态的容器 —— 起不来的那些恰恰全在"非运行"那一档。补上 `-a` 之后 STATUS 列会带出 `Exited (1) 2 hours ago` 这类信息，**退出码就写在状态里**，这是定位"起不来"的起点。',
      contrast: '加了 `-a` 仍然找不到那个容器，说明它已经被**删掉**了（被 `rm` 过、被 `compose down` 清过、或者当初就没创建成功）。这时候要看守护进程的历史事件流（`docker events`），或者回到编排文件核对容器名 —— 在"状态"上继续下功夫是白费力气，对象已经不在了。',
      run: 'docker ps -a',
      cmdIds: ['dk-ps', 'dk-troubleshoot-restart'],
      lesson: 'dk-ps-all',
      tags: ['Docker', '排错', '状态']
    },

    {
      id: 'card-docker-oomkilled-not-exitcode',
      cat: 'docker',
      kind: 'diagnose',
      level: 3,
      front: '一个容器跑着跑着突然消失，状态里写着 `Exited (137)`，你要判断它到底是不是被内存限制杀掉的。',
      hint: '137 说的是"怎么死的"，不是"谁干的"。',
      answer: "docker inspect -f '{{.State.OOMKilled}}' debug-tmp",
      why: '137 = 128 + 9，只代表进程收到了 **SIGKILL**：有人手动 `kill -9`、`rm -f` 强删、宿主机内存回收，都会留下 137。只有 `.State.OOMKilled` 为 `true` 才证明是**容器 cgroup 的内存限额**把它打死的 —— 这一位决定了你该去调 limit，还是去查是谁杀了它。',
      contrast: '`OOMKilled` 是 `false` 时别再动内存参数：去看 `docker events` 里有没有 kill 记录、宿主机 `dmesg` 有没有系统级 OOM，以及容器是不是被 `docker stop` 的宽限期（默认 10s）超时后补发的 SIGKILL —— 后者也是 137，但根因是应用没处理 SIGTERM。',
      run: "docker inspect -f '{{.State.OOMKilled}}' debug-tmp",
      cmdIds: ['dk-inspect', 'dk-troubleshoot-restart', 'dk-update'],
      lesson: 'dk-exitcode',
      tags: ['Docker', 'OOM', '退出码']
    },

    {
      id: 'card-docker-restart-count',
      cat: 'docker',
      kind: 'diagnose',
      level: 3,
      front: '容器现在是 `Up` 的、日志也正常，可同事说它"半夜挂过两次"。你要拿到它历史上被自动拉起过多少次。',
      hint: '这个数字不在容器列表的 STATUS 列里 —— 除非它正在反复重启。',
      answer: "docker inspect -f '{{.RestartCount}}' old-web",
      why: '`RestartCount` 是**累计**值，容器后来恢复健康也不会归零。所以"当前 Up + RestartCount 非 0"就等于"它崩过、并且按重启策略被拉起来过"—— 这是偶发崩溃留在容器元数据里唯一的痕迹（这里答案是 7 次）。',
      contrast: '要区分"还在循环重启"和"很久以前崩过一两次"，得把 `.State.StartedAt` 一起看：StartedAt 就在几分钟前 + RestartCount 很大 = 还在循环，该去查日志和退出码；StartedAt 是几天前 + RestartCount 是 7 = 早就稳住了，别被这个数字吓到。',
      run: "docker inspect -f '{{.RestartCount}}' old-web",
      cmdIds: ['dk-inspect', 'dk-ps', 'dk-update'],
      lesson: 'dk-exitcode',
      tags: ['Docker', '重启', '排查']
    },

    {
      id: 'card-docker-system-df-reclaimable',
      cat: 'docker',
      kind: 'diagnose',
      level: 2,
      front: '宿主机磁盘快满了，要清容器相关的东西。动手删之前，你想先看清镜像、容器、卷、构建缓存各占多少，以及哪些是能安全回收的。',
      hint: '清理前先看一张表 —— 它专门回答"哪一类最占地方、能回收多少"。',
      answer: 'docker system df',
      why: '它按 Images / Containers / Local Volumes / Build Cache 四类统计，关键是最后一列 **RECLAIMABLE**：本环境 Images 是 `1.62GB` 总量、`1.35GB (83%)` 可回收，Build Cache `892MB` 全部可回收 —— 说明大头是"没被任何容器使用"的镜像层，删掉不影响业务。',
      contrast: '如果 RECLAIMABLE 很小、而 Local Volumes 那一行很大（本环境 4.22GB、可回收 `0B`），删镜像一点用都没有：占地方的是**数据卷里的数据**，得先 `docker volume inspect` 看 Mountpoint 再决定，卷删了不可恢复。',
      run: 'docker system df',
      cmdIds: ['dk-df', 'dk-system-prune', 'dk-prune-image'],
      lesson: 'dk-df',
      tags: ['Docker', '磁盘', '清理']
    },

    {
      id: 'card-docker-network-dns-same-net',
      cat: 'docker',
      kind: 'diagnose',
      level: 3,
      front: '两个容器本该用容器名互相访问，结果一个连另一个时报"名字解析失败"。你要先确认它们到底在不在同一个网络上。',
      hint: '容器名的 DNS 解析只在某一个范围内有效。',
      answer: 'docker network inspect mynet',
      why: 'Docker 内置 DNS **只对用户自定义网络生效**：默认的 `bridge` 网络里容器之间只能用 IP 访问，名字解析根本不工作。所以判据就是输出里的 `Containers` 段 —— 目标容器不在里面，说明它没接这个网络（`mynet` 现在只有 web 在 172.20.0.2/16）。',
      contrast: '两个容器都在 `Containers` 段里却还是连不上，问题就不在"网络归属"，去看**监听地址**：容器里的服务如果监听在 `127.0.0.1:6379`，别的容器连过来会被直接拒绝（要监听 `0.0.0.0`）。进容器 `ss -lntp` 看 Local Address 是不是回环，一眼就能把这两种故障分开。',
      run: 'docker network inspect mynet',
      cmdIds: ['dk-network-inspect', 'dk-network-create', 'dk-network-connect', 'dk-troubleshoot-network'],
      lesson: 'dk-inspect-net',
      tags: ['Docker', '网络', 'DNS']
    },

    {
      id: 'card-docker-port-mapping-check',
      cat: 'docker',
      kind: 'diagnose',
      level: 2,
      front: '容器里服务在跑、用容器的 IP 也能 curl 通，可从宿主机的 `127.0.0.1:8080` 就是不通。你要先确认端口到底有没有映射出来。',
      hint: '有一个子命令专门打印"容器端口 → 宿主机端口"这张对应表。',
      answer: 'docker port web',
      why: '它直接打印映射关系（`8080/tcp -> 0.0.0.0:8080`）。判据是它的**输出为空**：空的就说明这个容器压根没做 `-p` 映射 —— "容器 IP 通、宿主机不通"正是这个原因。`docker ps` 的 PORTS 列虽然也有这信息，但容器一多会被截断，也看不清绑定的是 `0.0.0.0` 还是 `127.0.0.1`。',
      contrast: '有映射还是不通，分三种：绑定地址写成 `127.0.0.1:8080->8080` 时只有宿主机本机能访问、外部进不来；容器用了 `--network host` 时根本没有映射表，端口直接开在宿主机上；宿主机 `firewalld` 没放行时本机通、外部不通。三种的修法完全不同。',
      run: 'docker port web',
      cmdIds: ['dk-ps', 'dk-network-modes', 'dk-troubleshoot-network'],
      lesson: 'dk-which-container-eats',
      tags: ['Docker', '端口', '网络']
    },

    {
      id: 'card-docker-stats-vs-limit',
      cat: 'docker',
      kind: 'diagnose',
      level: 3,
      front: '监控说某个容器"内存快到顶了"，可你看宿主机整机内存还剩一大半。你要看的是这个容器相对**它自己的限额**用了多少。',
      hint: '容器有自己的 cgroup 限额，宿主机视角看不到"离限额还有多远"。',
      answer: 'docker stats --no-stream',
      why: '`docker stats` 的 `MEM USAGE / LIMIT` 是相对 **cgroup 限额**的比值：本环境 `web` 显示 `612.4MiB / 512MiB`、MEM % 是 `119.61%` —— 超过 100% 说明它已经撞上限额、正在被内核压制（表现是变慢、甚至被 OOM 杀掉）。宿主机的 `free`/`top` 只给整机数字，回答不了"这个容器离 limit 还有多远"。',
      contrast: '`--no-stream` 不能省：不加它会持续刷新并占住终端，在脚本里等于挂死。另外 `stats` **只列运行中的容器** —— 已经退出的容器不会出现，要复盘它的历史峰值只能靠监控系统，别指望在这里看到死掉的容器。',
      run: 'docker stats --no-stream',
      cmdIds: ['dk-stats', 'dk-update', 'dk-inspect'],
      lesson: 'dk-which-container-eats',
      tags: ['Docker', '资源', '内存']
    },

    {
      id: 'card-docker-logs-exited-container',
      cat: 'docker',
      kind: 'diagnose',
      level: 2,
      front: '新版本容器已经正常跑起来了，你想知道**上一个**（已经退出的那个）容器当时报了什么错。',
      hint: '退出的容器不会自己消失，它的标准输出还在。',
      answer: 'docker logs old-web',
      why: '容器退出后日志仍然留在 json-file 日志驱动里，只要容器**没被 rm**，`docker logs <名字>` 照样能读。判据是 `docker ps -a` 里那个容器还在、状态为 `Exited` —— 这就是"能事后复盘"的前提。',
      contrast: '如果容器已经被 `rm` 掉，日志就只能在宿主机 `/var/lib/docker/containers/<id>/` 下面找了（还得看 `log-opts` 的 `max-size`/`max-file` 有没有把它滚掉）。所以排查"起不来"的第一条纪律是：**现场没看完之前不要 rm 容器**。',
      run: 'docker logs old-web',
      cmdIds: ['dk-logs', 'dk-rm', 'dk-container-logs-size'],
      lesson: 'dk-logs',
      tags: ['Docker', '日志', '现场']
    },

    {
      id: 'card-docker-logs-tail-flag',
      cat: 'docker',
      kind: 'syntax',
      level: 1,
      front: '只取容器最后 50 行日志，别刷屏：\n\n  docker logs ____ 50 web\n\n横线处填什么？',
      hint: '`docker logs` 没有 `-n` 这个参数。',
      answer: '--tail',
      why: '`--tail N` 是"只取最后 N 行"，要和 `-f` 连用才能"先看尾巴再跟新的"。判据是写错时的报错：`docker logs -n 50` 会直接给出 usage 错误而不是日志 —— `-n` 是 `docker ps` / `docker exec` 那一族的用法，被带到 `logs` 上是最常见的一种记混。',
      contrast: '要按**时间**而不是行数截取，用 `--since 10m` / `--until 2024-03-18T09:00:00`；两个维度可以叠加（`--since 10m --tail 100`）。排障时先用 `--tail` 快速看现场，再决定要不要用 `--since` 把窗口对准故障发生的那一刻。',
      run: 'docker logs --tail 3 web',
      cmdIds: ['dk-logs'],
      lesson: 'dk-logs',
      tags: ['Docker', '日志', '参数']
    },

    {
      id: 'card-docker-inspect-format-exitcode',
      cat: 'docker',
      kind: 'syntax',
      level: 2,
      front: '只想取出容器的退出码，不想把整个 inspect 的 JSON 翻一遍：\n\n  docker inspect ____ old-web\n\n横线处填什么？',
      hint: '用 Go 模板只渲染你要的那一个字段。',
      answer: "-f '{{.State.ExitCode}}'",
      why: '`-f`（`--format`）走 Go 模板，只把指定字段渲染出来。字段路径必须写全：退出码在 **State 子对象**里，写成 `.ExitCode` 不会报错，只会得到空字符串 —— 模板取不到字段时是静默的，这点最坑。外层要用单引号，否则 `{{ }}` 会被 shell 当通配符展开。',
      contrast: '要一次取多个字段就在模板里拼：`-f "{{.State.ExitCode}} {{.RestartCount}}"`。而要**筛选**容器（比如"只列已退出的"）不是 `inspect` 的活，那是 `docker ps -a --filter status=exited -q` 的场景：先筛出 ID 列表，再逐个 inspect。',
      run: "docker inspect -f '{{.State.ExitCode}}' old-web",
      cmdIds: ['dk-inspect', 'dk-ps'],
      lesson: 'dk-exitcode',
      tags: ['Docker', 'inspect', '模板']
    },

    {
      id: 'card-docker-compose-up-detach',
      cat: 'docker',
      kind: 'syntax',
      level: 2,
      front: 'compose 文件写好了，要让整套服务在后台跑起来、不占住当前终端：\n\n  docker compose ____\n\n缺哪个参数？',
      hint: '不加它，日志会直接糊在屏幕上，Ctrl+C 还会把刚起来的服务一起停掉。',
      answer: 'up -d',
      why: '`up` 默认把各服务的日志聚合到当前终端（前台运行），`Ctrl+C` 会连带停掉整套服务；`-d`（detach）让它在后台跑。判据是加 `-d` 之后终端立刻退回提示符、只留下一行行 `✔ Container ... Started` —— 生产与 CI 里几乎总是带 `-d`。',
      contrast: '进了后台就看不到启动日志了，排查要用 `docker compose logs -f <service>`（`-f` 才跟实时输出）。另外"想停下来"分两个层次：`docker compose stop` 只停容器、保留它们；`docker compose down` 会把容器和网络**删掉**（具名卷默认保留，加 `-v` 才删卷）—— 分不清这两个是误删数据的常见起点。',
      run: 'docker compose up -d',
      cmdIds: ['dk-compose-up', 'dk-compose-down', 'dk-compose-logs'],
      lesson: 'dk-compose-service-down',
      tags: ['Docker', 'Compose', '参数']
    },

    {
      id: 'card-docker-compose-port-order',
      cat: 'docker',
      kind: 'syntax',
      level: 2,
      front: '把容器的 8080 暴露成宿主机的 18080，compose 里这样写：\n\n  ports:\n    - "____"\n\n横线处怎么填？',
      hint: '两个端口的顺序不是随便写的：一个在里，一个在外。',
      answer: '18080:8080（宿主机端口在前，容器端口在后）',
      why: '这个顺序和 `docker run -p` 一致：**冒号左边是宿主机、右边是容器**。写反成 `8080:18080` 不会报错，只是把容器里没人监听的 8080 映射了出去 —— 现象是"宿主机端口是开的、连上却立刻断或 502"。`docker compose config` 会把短语法展开成 `published` / `target` 两个字段，`published` 就是你写在左边那个，这是验证顺序最快的办法。',
      contrast: '只写一个端口（`- "8080"`）时宿主机端口由 Docker 随机分配，只有 `docker compose ps` / `docker port` 才知道最终是多少 —— 需要固定入口的场景不能这么写。UDP 服务要显式写 `8080:8080/udp`，默认只映射 TCP，漏了协议后缀会表现为"端口开着但收不到包"。',
      run: 'docker compose config',
      cmdIds: ['dk-compose-config', 'dk-compose-yml', 'dk-run', 'dk-network-modes'],
      lesson: 'dk-compose-validate-then-up',
      tags: ['Docker', '端口', 'Compose']
    },

    {
      id: 'card-docker-stop-vs-kill',
      cat: 'docker',
      kind: 'distinguish',
      level: 2,
      front: '容器里的服务卡死了：`docker stop` 敲下去等了十秒才退出，同事说下次直接"杀掉"就行。这两条命令真正的分界在哪？',
      hint: '差别只在一个信号上，但这个信号决定应用有没有机会收尾。',
      answer: 'docker stop 先发 SIGTERM（默认等 10s）→ docker kill 默认直接发 SIGKILL',
      why: '`stop` 是**先礼后兵**：先给 PID 1 发 SIGTERM，让它排空连接、提交事务、清掉临时文件；`-t` 秒内没退出才补一个 SIGKILL。判据就是耗时：秒退说明应用自己处理了信号；卡满 `-t`（默认 10s）才退，说明它**没有**处理 SIGTERM、是被强杀的 —— 这时候该去修应用的信号处理，而不是换成 `kill` 把问题盖住。',
      contrast: '`kill` 的真正价值是**发送任意信号**：`docker kill -s HUP nginx` 是让 Nginx 重载配置，`-s TERM` 则几乎等价于 `stop`。"kill 很暴力"只对默认信号（SIGKILL）成立；把它当成"停止"的快捷键，代价是数据库类容器可能留下需要恢复的脏数据。',
      run: 'docker kill -s HUP web',
      cmdIds: ['dk-stop', 'dk-kill', 'dk-restart'],
      lesson: 'dk-stop-graceful-vs-kill',
      tags: ['Docker', '信号', '优雅停止']
    },

    {
      id: 'card-docker-rm-vs-rmi',
      cat: 'docker',
      kind: 'distinguish',
      level: 1,
      front: '磁盘要满了，同事让你"把没用的容器清一清"。删容器和删镜像是同一个动作吗？',
      hint: '一个是"跑过的实例"，一个是"只读模板"。',
      answer: 'docker rm 删容器 ／ docker rmi 删镜像',
      why: '容器是镜像叠一层可写层之后的**实例**，镜像才是那个只读模板。`rm` 删掉实例和它的可写层（日志一起没）；`rmi` 删模板，所以只要还有容器（**包括已停止的**）基于它，就会报 `image is being used by stopped container` —— 顺序永远只能是先 `rm` 容器、再 `rmi` 镜像。',
      contrast: '`rm -v` 才会连**匿名卷**一起删；不加 `-v`，卷会留下来变成没人引用的孤儿卷 —— 这正是 `docker system df` 里 Local Volumes 越涨越大、却看不出是谁在用的原因。另外 `rmi` 报 `image has dependent child images` 是另一回事：那是它被别的镜像当基础层了，得从最上层往下删。',
      run: 'docker rm old-web',
      cmdIds: ['dk-rm', 'dk-rmi', 'dk-prune-image', 'dk-volume-rm'],
      lesson: 'dk-remove-container-and-image',
      tags: ['Docker', '清理', '镜像']
    },

    {
      id: 'card-docker-system-prune-scope',
      cat: 'docker',
      kind: 'distinguish',
      level: 2,
      front: '磁盘告急，同事让你 `docker system prune -a` 一把梭。这条命令不加 `-a` 和加 `-a`，删掉的东西差在哪？',
      hint: '差别在"没有被容器使用"这几个字覆盖的范围。',
      answer: 'prune 默认删已停止容器 + 悬空镜像 + 无用网络；-a 连没被容器使用的**带标签镜像**一起删',
      why: '默认档只碰"已经没人要"的东西：`<none>` 悬空镜像、已停止的容器、没有容器在用的网络。加 `-a` 会把 `mysql:8.0`、`nginx:1.25` 这类**有名字但当前没被任何容器使用**的镜像也删掉。判据就在 `docker system df` 的 RECLAIMABLE 列：本环境 Images 可回收 `1.35GB (83%)`，比例越高说明越多镜像正处在"下次部署还要用"的状态。',
      contrast: '真正不能顺手敲的是 `docker volume prune`：它删的是**没有任何容器引用**的卷 —— 容器 `rm` 之后（没带 `-v`）留下的孤儿卷正好符合这个条件，而卷里装的是数据，删了不可恢复。所以清理顺序是：先 `docker system df` 看构成 → 再 `ps -a` 确认没有要留的容器 → 最后才考虑卷，且必须先 `volume ls` / `volume inspect` 看清清单。',
      run: 'docker system prune',
      cmdIds: ['dk-system-prune', 'dk-prune-image', 'dk-volume-rm', 'dk-df'],
      lesson: 'dk-disk-eaten-by-docker',
      tags: ['Docker', '清理', '红线']
    },

    {
      id: 'card-docker-volume-named-vs-bind',
      cat: 'docker',
      kind: 'distinguish',
      level: 2,
      front: 'MySQL 的数据目录要持久化：写 `-v mysqldata:/var/lib/mysql` 还是 `-v /data/mysql:/var/lib/mysql`？',
      hint: '看冒号左边那一段是不是以 `/` 开头。',
      answer: '不带斜杠的是具名卷（交给 Docker 管）／带绝对路径的是绑定挂载（你自己管）',
      why: '`mysqldata` 这种写法会创建一个**具名卷**，落在 `/var/lib/docker/volumes/mysqldata/_data`，挂载点权限由 Docker 初始化好，容器删了数据还在、`docker volume ls` 里看得到。`/data/mysql` 是**绑定挂载**：直接用宿主机上那个目录，路径不存在时 Docker 会替你建一个空目录 —— 于是"路径写错"最终表现为"数据莫名其妙空了"。',
      contrast: '还有第三种：只写容器内路径（`-v /var/lib/mysql`）会生成一个**匿名卷**，名字是一串哈希，同样归 Docker 管但没法按名字引用；容器 `rm` 时如果不带 `-v`，它就变成谁也认不出来的孤儿卷。长期保存的数据库数据一律用具名卷，只有"必须让宿主机上的其他程序也能读到这些文件"时才用绑定挂载。',
      run: 'docker volume inspect mysqldata',
      cmdIds: ['dk-volume-vs-bind', 'dk-volume-create', 'dk-volume-inspect', 'dk-volume-ls'],
      lesson: 'dk-volume-outlives-container',
      tags: ['Docker', '存储', '数据卷']
    },

    {
      id: 'card-docker-info-vs-version',
      cat: 'docker',
      kind: 'distinguish',
      level: 2,
      front: '要确认数据目录被改到了哪、日志驱动是什么、有没有配镜像加速 —— `docker version` 够用吗？',
      hint: '一个只回答"版本号是多少"。',
      answer: 'docker info 看配置态 ／ docker version 看版本号',
      why: '`version` 只给客户端与服务端的版本；`info` 才有 **Docker Root Dir**（本环境是 `/data/docker`）、**Storage Driver**（overlay2）、**Logging Driver**（json-file）、**Registry Mirrors**、Cgroup 版本这些配置态字段 —— "磁盘为什么满在别处""镜像为什么拉不动"要用到的正是这些。',
      contrast: '`info` 的输出分 Client 与 Server 两段：如果 Server 段缺失、或者报 `Cannot connect to the Docker daemon`，说明客户端在、守护进程没跑，此时查任何容器状态都是白费功夫，先去 `systemctl status docker` 看它为什么起不来。',
      run: 'docker info',
      cmdIds: ['dk-info', 'dk-daemon-json', 'dk-df'],
      lesson: 'dk-df',
      tags: ['Docker', '环境', '配置']
    },

    {
      id: 'card-docker-exec-vs-run',
      cat: 'docker',
      kind: 'distinguish',
      level: 2,
      front: '同事让你"在容器里跑一下 `env`，看看环境变量"。该用 `docker exec` 还是 `docker run`？',
      hint: '先问一句：这个输出应该来自**哪个**容器的环境？',
      answer: 'docker exec 在已有容器里执行 ／ docker run 会创建一个全新容器',
      why: '`docker run` 每次都新建容器实例，环境变量、挂载、网络命名空间全是新的 —— 要复现"线上那个容器为什么读不到配置"，必须用 `exec` 进**那个**容器：exec 出来的进程与容器主进程共享 PID/网络/挂载命名空间，看到的 `/etc/resolv.conf`、环境变量、挂载点和它完全一致。判据是 `docker ps` 里那个容器的 ID 有没有变。',
      contrast: '容器里**没有 shell**（distroless / scratch 镜像）时，`exec -it ... sh` 会报 `executable file not found in $PATH`，这时才轮到"挂一个新容器进去"的思路（K8s 里对应的是 `kubectl debug`）。换句话说 `run` 不是 `exec` 的替代品，而是它走不通时的兜底。',
      run: 'docker exec web env',
      cmdIds: ['dk-exec', 'dk-run', 'dk-compose-exec', 'dk-troubleshoot-network'],
      lesson: 'dk-inspect-net',
      tags: ['Docker', '排查', 'exec']
    },

    {
      id: 'card-docker-logs-vs-events',
      cat: 'docker',
      kind: 'distinguish',
      level: 3,
      front: '一个容器"自己没了"，`ps -a` 里也找不到它。你想知道它是什么时候、因为什么消失的 —— 该看日志还是看别的东西？',
      hint: '两个信息源记的不是一类事：一个记应用说了什么，一个记守护进程做了什么。',
      answer: 'docker events 看守护进程的动作（create/start/die/destroy）／docker logs 看应用自己的标准输出',
      why: '容器**被删除**之后日志就一起没了，而事件流记的是守护进程自己的动作：`container die` 事件里带 `exitCode=` 属性，`container destroy` 就是它被 `rm` 的那一刻。判据是事件里出现了 `destroy` —— 那说明有人（或某个脚本）主动删了它，而不是它自己崩了。',
      contrast: '事件流是**流式**的、默认从当前时刻开始，事后才想起来看就什么都没有 —— 真正常态化的做法是把事件流接到中心化日志里长期留存。另外要区分"容器死了"和"容器被删了"：应用日志只存在于容器还在的时候，`docker events` 才能告诉你删它的是谁、什么时候。',
      run: 'docker events',
      cmdIds: ['dk-events', 'dk-logs', 'dk-rm', 'dk-container-logs-size'],
      lesson: 'dk-container-keeps-restarting',
      tags: ['Docker', '事件', '排错']
    },

    {
      id: 'card-docker-compose-ps-vs-ps',
      cat: 'docker',
      kind: 'distinguish',
      level: 1,
      front: '一台机器上有十几个容器，你要一眼看出某个 compose 项目里**哪个服务**没起来。`docker ps` 够用吗？',
      hint: '容器名（`myapp-web-1`）和服务名不是一回事，但有一个命令直接把服务名给你。',
      answer: 'docker compose ps 按项目过滤并直接给出 SERVICE 列 ／ docker ps 列整机所有容器',
      why: '`compose ps` 只列当前 compose 项目（按项目名匹配）的容器，并直接把 **SERVICE** 列打出来，所以"哪个服务挂了"是一眼的事；`docker ps` 给你的是 `myapp-web-1` 这种容器名，还得自己反推服务名，也容易被同机上别的项目的容器干扰。判据就是输出里有没有 SERVICE 这一列。',
      contrast: '但 `compose ps` 默认**只显示在跑的**容器：服务起不来、起来就立刻退出时它可能什么都不显示，要加 `-a`。而且它只反映状态、不解释原因 —— 服务为什么起不来一定要看 `docker compose logs <service>`，那才是第一现场。',
      run: 'docker compose ps',
      cmdIds: ['dk-compose-ps', 'dk-compose-logs', 'dk-ps'],
      lesson: 'dk-ps-all',
      tags: ['Docker', 'Compose', '状态']
    },

    /* ==================== Kubernetes ==================== */
    {
      id: 'card-k8s-pending-insufficient-cpu',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '新提交的批处理 Pod 一直卡在 Pending，等了十分钟也没动静 —— 日志当然是一条都没有。',
      hint: '这个阶段容器还没被创建，所以日志里不可能有答案。要找的是"谁拒绝了这个 Pod"。',
      answer: 'kubectl describe pod batch-job-28471920-x7klm -n my-app',
      why: 'Pending 的原因写在 describe 末尾的 **Events** 里，这里是 `Warning FailedScheduling   0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane}, 2 Insufficient cpu`。判据就是 `FailedScheduling` 那一行：调度器会逐个节点说明"为什么不能用它"，`0/3` 意味着三个节点全被排除了。',
      contrast: '原因换成 `untolerated taint` 是节点污点/容忍没写对；`Insufficient memory` 是内存 requests 不够；`node(s) had volume node affinity conflict` 是 PV 绑在了另一个可用区；`waiting for first consumer` 则是延迟绑定的正常状态。**同样是 Pending，处置方向完全不同**，所以必须先读这一行再看别的。',
      run: 'kubectl describe pod batch-job-28471920-x7klm -n my-app',
      cmdIds: ['k8s-describe', 'k8s-troubleshoot-pending', 'k8s-affinity-toleration', 'k8s-get-events'],
      lesson: 'k8s-describe',
      tags: ['K8s', 'Pending', '调度']
    },

    {
      id: 'card-k8s-crashloop-laststate-exitcode',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '一个 Pod 的 READY 是 `0/1` 而且反复重启。你要先分清：是应用自己退出，还是被探针打死的。',
      hint: '容器"上一次是怎么结束的"，记在它的上一次状态里。',
      answer: 'kubectl describe pod worker-6b8f7c9d4-m2vqt -n my-app',
      why: 'describe 里写着 `Last State: Terminated / Reason: Error / Exit Code: 1` 加上 `Restart Count: 7`：**退出码 1 说明应用自己以失败码退出**，跟探针没关系；被 liveness 探针杀会是 **137**（SIGKILL），被内核因内存超限杀则 Reason 变成 `OOMKilled`。判据就是这个 Exit Code，它把"应用有 bug"和"探针/资源配错"劈成两条完全不同的排查路线。',
      contrast: '如果 State 是 `Waiting / Reason: ImagePullBackOff` 而不是 Running + Last State，说明容器**从没被创建成功**，别再读日志，去查镜像地址、tag 和 imagePullSecrets。同理 `Reason: CreateContainerConfigError` 是挂载的 ConfigMap/Secret 缺键，也不是应用的问题 —— 三者都不该从应用日志入手。',
      run: 'kubectl describe pod worker-6b8f7c9d4-m2vqt -n my-app',
      cmdIds: ['k8s-describe', 'k8s-troubleshoot-crashloop', 'k8s-pod-status-conditions'],
      lesson: 'k8s-describe',
      tags: ['K8s', 'CrashLoop', '退出码']
    },

    {
      id: 'card-k8s-wrong-namespace',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 2,
      front: '同事说"worker 那个 Pod 挂了，你看一眼"。你在终端里敲了一条列表命令，返回的却只有一行 `mysql-0` —— 资源类型你并没有写错。',
      hint: '命令没错，是"范围"不对：你没指定命名空间，它就用了默认的那个。',
      answer: 'kubectl get pods -A',
      why: '不写 `-n` 时用的是 kubeconfig 当前上下文绑定的默认命名空间（真机就是 `default`，这个教学环境也刻意保持成 default）。`-A` 会**多出一列 NAMESPACE** —— 判据就是这一列里出现了 `my-app`：Pod 一直在那儿好好活着，只是你刚才只看了 `default`。',
      contrast: '加了 `-A` 还是找不到那个名字，才轮到怀疑名字本身：Deployment 管着的 Pod 名带随机后缀，每次滚动更新都会变，拿几天前的 Pod 名去查必然 NotFound。这时应该按 **Deployment 名**查，而不是继续拿旧 Pod 名试 —— 这是"高频错误"的第二层。',
      run: 'kubectl get pods -A',
      cmdIds: ['k8s-get', 'k8s-config', 'k8s-deployment'],
      lesson: 'k8s-get-pods',
      tags: ['K8s', '命名空间', '高频错误']
    },

    {
      id: 'card-k8s-svc-external-access',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '集群内部访问 Service 的 ClusterIP 完全正常，可公网怎么都进不来。你要先确认这个 Service 到底有没有对外入口。',
      hint: '看服务的类型和端口映射 —— 有的类型天生只能在集群内用。',
      answer: 'kubectl get svc -n my-app',
      why: 'TYPE 列直接决定谁能访问：`ClusterIP` 只有集群内能路由；`NodePort` 要用**节点 IP** 访问 `PORT(S)` 里冒号后面那个端口（这里是 30080，且安全组必须放行）；`LoadBalancer` 才看 **EXTERNAL-IP**（这里是 121.36.44.17）—— 那个地址才是公网入口。判据就是 TYPE 与 PORT(S) 两列的组合。',
      contrast: '`LoadBalancer` 的 EXTERNAL-IP 长期是 `<pending>`，说明云控制器没申请到弹性 IP（配额、子网或注解问题），这是**集群外**的事，去查 CCE 事件与 ELB 配额；此时改 Service 的 selector/targetPort 全是白费功夫。反过来，TYPE 是 NodePort 却拿 ClusterIP 去访问，也是同一类"看错入口"的错误。',
      run: 'kubectl get svc -n my-app',
      cmdIds: ['k8s-service', 'k8s-troubleshoot-svc', 'k8s-endpointslices'],
      lesson: 'k8s-endpoints',
      tags: ['K8s', 'Service', '入口']
    },

    {
      id: 'card-k8s-pvc-pending-provision',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '一个申请存储的 PVC 挂了很久还是 Pending，Pod 也因此起不来。你要先判断是"申请单写错了"还是"存储后端给不出来"。',
      hint: 'PVC 自己的事件里写着存储插件说了什么。',
      answer: 'kubectl describe pvc logs-pvc -n my-app',
      why: 'Events 里是 `Warning ProvisioningFailed   failed to provision volume with StorageClass "csi-nas": no available NAS mount point` —— PVC 本身没问题，是**存储后端供不出卷**。判据还有一处：`kubectl get pvc` 里 STATUS 是 `Pending` 且 **VOLUME 列为空**，说明它还没绑定到任何 PV。',
      contrast: '事件换成 `storageclass not found` 是 StorageClass 名字写错（大小写敏感）；`waiting for first consumer to be created before binding` 是 `WaitForFirstConsumer` 绑定模式的**正常**状态，等 Pod 调度即可；而 `no available NAS mount point` 这类属于存储侧容量/挂载点问题，要联系存储管理员，改 YAML 一点用都没有。',
      run: 'kubectl describe pvc logs-pvc -n my-app',
      cmdIds: ['k8s-pvc-pv', 'k8s-storageclass', 'k8s-troubleshoot-pending'],
      tags: ['K8s', '存储', 'PVC']
    },

    {
      id: 'card-k8s-describe-node-requests',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '调度器报"CPU 不够"，可你看节点用量才三成多。这两个数字到底谁在说谎？',
      hint: '调度器根本不是按"实际用量"做决定的。',
      answer: 'kubectl describe node 10.0.1.23',
      why: '调度看的是 **requests 之和**，就写在 `Allocated resources` 段里（`cpu 3120m (39%) Requests`、`memory 8214Mi (54%)`）；而"用量三成"是**实际消耗**，属于 `kubectl top` 的领域。两者量的不是一回事 —— 节点完全可以"实际很闲"但"requests 已排满"，这时新 Pod 依然调度不上去。判据是 Requests 那一列，不是 top 的百分比。',
      contrast: 'Requests 明明还剩很多却依然报 Insufficient，就往两处看：Pod 自己的 `requests` 是不是开得过大（一个 request 4 核的 Pod 在任何 8 核节点上都难落），以及节点上有没有 **DaemonSet / 不可驱逐的 Pod** 长期占着额度。这两种都不是"再加一台节点"能立刻解决的。',
      run: 'kubectl describe node 10.0.1.23',
      cmdIds: ['k8s-describe', 'k8s-top', 'k8s-top-node-sort', 'k8s-troubleshoot-pending'],
      lesson: 'k8s-node-pressure',
      tags: ['K8s', '调度', 'requests']
    },

    {
      id: 'card-k8s-events-warning-filter',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 2,
      front: '集群里最近"感觉不太对"，但你不确定是哪个对象出了问题。想先看一圈**只属于异常**的记录。',
      hint: '事件分两类，把正常的那一类滤掉就行。',
      answer: 'kubectl get events --field-selector type=Warning',
      why: '事件有 `Normal` 和 `Warning` 两类，按 `type=Warning` 一筛，剩下的基本都是真问题 —— 本环境筛完只剩 4 条，而且每条都能直接对上故障：`FailedScheduling`（Pod Pending）、`BackOff`（CrashLoop）、`ProvisioningFailed`（PVC Pending）、`Unhealthy`（就绪探针失败）。判据是最后一列的 **OBJECT** 字段，它告诉你该去查哪个对象。',
      contrast: '事件默认只保留最近一小时左右，**它不是审计日志**，超过窗口的故障必须靠中心化日志/监控复盘。另外事件顺序不保证按时间排，要按时间看得加 `--sort-by=.lastTimestamp`；只想看某个对象的记录，用 `--field-selector involvedObject.name=<名字>` 把范围收窄到一个对象上。',
      run: 'kubectl get events --field-selector type=Warning',
      cmdIds: ['k8s-get-events', 'k8s-events-involved-object', 'k8s-describe'],
      lesson: 'k8s-events',
      tags: ['K8s', '事件', '排错']
    },

    {
      id: 'card-k8s-logs-dns-unknownhost',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '一个 Pod 的 RESTARTS 已经 7 次、状态 CrashLoopBackOff。日志里只有一行 `UnknownHostException: cache-prod-01`，你要判断这是"名字解析不了"还是"连不上对方"。',
      hint: '看异常类型：失败发生在"拿到 IP 之前"还是"之后"。',
      answer: 'kubectl logs worker-6b8f7c9d4-m2vqt -n my-app',
      why: '`java.net.UnknownHostException` 说明失败在 **DNS 解析阶段**，报文压根没发出去 —— 跟对方端口通不通、服务在不在毫无关系。判据就是异常类型本身：`UnknownHostException` = 名字没解析出来；`ConnectException: Connection refused` = 解析成功但没人监听；`SocketTimeoutException` = 包发出去没回来。三种的下一步完全不同。',
      contrast: '确认是解析问题后，下一步是**进容器验证解析链路**（`cat /etc/resolv.conf` 看 nameserver 是不是 kube-dns 的 ClusterIP，再 `nslookup <service>.<namespace>.svc.cluster.local` 逐段试），而不是去重启上游服务。何况 `cache-prod-01` 这个名字本身就可疑：集群内跨命名空间访问要用 `<service>.<ns>` 或 FQDN，纯主机名是虚拟机时代的遗留写法。',
      run: 'kubectl logs worker-6b8f7c9d4-m2vqt -n my-app',
      cmdIds: ['k8s-logs', 'k8s-exec-dns', 'k8s-troubleshoot-crashloop', 'k8s-exec'],
      lesson: 'k8s-logs-prev',
      tags: ['K8s', 'DNS', '日志']
    },

    {
      id: 'card-k8s-rollout-status-blocking',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 2,
      front: '刚提交完新版本的 YAML，命令返回了 `configured`，可你不确定新副本到底起没起来。',
      hint: '有一类命令会**卡在那里**直到发布真的结束，它说成功才算数。',
      answer: 'kubectl rollout status deploy/web -n my-app',
      why: '它是**阻塞式**的：一直等到滚动更新完成才打印 `deployment "web" successfully rolled out`。判据就是它的两种结局 —— 这句话，或者超时后的 `error: timed out waiting for the condition`（等待有时间上限，可以用 `--timeout` 调整）。',
      contrast: '`apply` 返回 `configured` 只代表**对象被 API Server 接受了**，跟 Pod 有没有起来、探针有没有过完全无关；把它当成发布成功是最常见的误判。而"卡住不动"时，`rollout status` 的输出会告诉你卡在哪一步（在等新副本 Ready，还是旧副本没缩下去），再配合 `get pods` 去找那个不 Ready 的 Pod。',
      run: 'kubectl rollout status deploy/web -n my-app',
      cmdIds: ['k8s-rollout', 'k8s-apply', 'k8s-deployment', 'k8s-get'],
      lesson: 'k8s-urgent-scale-and-image',
      tags: ['K8s', '发布', '滚动更新']
    },

    {
      id: 'card-k8s-deploy-ready-vs-available',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 2,
      front: '要一眼找出"哪个应用没起满"，你打算逐个 Pod 看过去 —— 有没有更快的入口？',
      hint: '控制器层面的汇总表里已经有现成的分数：分子和分母不相等就是没起满。',
      answer: 'kubectl get deployments -n my-app',
      why: '这张表是**控制器视角**的汇总：READY 是"就绪副本/期望副本"（`web 2/2` 正常、`worker 0/1` 没起满），UP-TO-DATE 是已更新的副本数、AVAILABLE 是真正可用的副本数。判据就是 READY 的分子 ≠ 分母 —— 它比逐个 Pod 翻快得多，也是发现"某个应用悄悄少了一个副本"的标准入口。',
      contrast: '注意 `READY 0/1` 有两种成因完全不同的情况：`get pods` 里 Pod 是 **Running** 但 READY `0/1` → 容器活着、只是 **readiness 探针**没过（流量被摘掉，AVAILABLE 为 0）；Pod 是 CrashLoopBackOff → 容器本身在死。前者去改探针或等它启动，后者去查应用日志，方向恰好相反。',
      run: 'kubectl get deployments -n my-app',
      cmdIds: ['k8s-deployment', 'k8s-get', 'k8s-scale', 'k8s-pod-status-conditions'],
      lesson: 'k8s-describe',
      tags: ['K8s', 'Deployment', '状态']
    },

    {
      id: 'card-k8s-auth-can-i',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '一条操作被服务端拒了，提示里带着 `forbidden`。你要先判断是权限不够，还是命令/资源本身有问题。',
      hint: '有一个子命令专门回答"当前身份能不能做这件事"，不用真去试。',
      answer: 'kubectl auth can-i create pods -n my-app',
      why: '它按当前身份做一次权限判定，只输出 `yes` 或 `no`：回答 `no` 就是 RBAC 拦的，跟你的 YAML、资源名都没关系。判据就是这一行输出 —— 这是把"权限问题"和"资源问题"分开的最省事办法，而且不用真的去创建东西。',
      contrast: '`can-i --list` 给的是当前身份的**全部**权限清单（本环境里 pods 有 get/list/watch/create/delete，deployments 有 get/list/watch/update/patch，而 secrets 只有 get/list）。排查 403 的完整顺序是：先 `auth whoami` 确认"我到底是谁"，再 `can-i` 确认能不能做，最后才看 RoleBinding 绑的是不是这个身份 —— 顺序反了就会一直在角色定义里绕圈。',
      run: 'kubectl auth can-i --list',
      cmdIds: ['k8s-auth-can-i', 'k8s-rbac-role', 'k8s-rbac-clusterrole', 'k8s-auth-whoami'],
      lesson: 'k8s-who-am-i',
      tags: ['K8s', 'RBAC', '403']
    },

    {
      id: 'card-k8s-wrong-cluster-context',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 2,
      front: '排查了半小时：配置改了、Pod 也重启了，现象一点变化都没有。有没有可能你看的根本不是那套集群？',
      hint: '当前这个终端里的"上下文"，未必是你以为的那一个。',
      answer: 'kubectl config current-context',
      why: 'kubeconfig 里可以同时存几十套集群，命令用的是**当前上下文**指向的那一套；这条命令直接打印它的名字（这里是 `cce-cn-north-4-prod`）。判据：`kubectl config get-contexts` 里带 `*` 的那一行才是生效的上下文 —— 多套环境（prod / test）并存时，这是"改了没反应"的第一个嫌疑。',
      contrast: '确认集群没搞错之后，下一个要确认的是**身份**：同一份配置在不同机器上可能挂着不同的证书或 ServiceAccount，于是出现"我这边能改、你那边改不动"。改配置没生效的排查顺序固定是：集群 → 命名空间 → 对象名 → 最后才轮到怀疑控制器。',
      run: 'kubectl config current-context',
      cmdIds: ['k8s-config', 'k8s-cluster-info', 'k8s-cce-kubeconfig', 'k8s-auth-whoami'],
      lesson: 'k8s-get-pods',
      tags: ['K8s', 'kubeconfig', '高频错误']
    },

    {
      id: 'card-k8s-port-forward-debug',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '要在本机用客户端连一下集群里的数据库，可安全组不放行、Service 也没暴露到公网 —— 有办法只给自己开一条临时通道吗？',
      hint: '有一条命令借 API Server 把本地端口接到集群内的对象上，不用改任何网络配置。',
      answer: 'kubectl port-forward svc/mysql 3306:3306 -n default',
      why: '它通过 API Server 建一条隧道，把**本机端口**转发到 Pod 或 Service 的端口，不需要 Service 暴露类型、也不需要安全组放行。判据是它打印的 `Forwarding from 127.0.0.1:3306 -> 3306` —— 看到这行才说明隧道建立了；而且这条命令会**一直占住终端**，`Ctrl+C` 才断开。',
      contrast: '它走的是 kubeconfig 里**你自己的身份**，能连上只能证明"目标端口有东西在监听"，不代表业务 Pod 也能连（RBAC 与 NetworkPolicy 是两回事）。另外它只适合临时验证：隧道一断应用就挂，生产入口该用 Service/Ingress，别拿 port-forward 当长期方案。',
      run: 'kubectl port-forward svc/mysql 3306:3306 -n default',
      cmdIds: ['k8s-port-forward', 'k8s-service', 'k8s-exec', 'k8s-debug'],
      lesson: 'k8s-port-forward-no-expose',
      tags: ['K8s', '调试', '网络']
    },

    {
      id: 'card-k8s-delete-pod-vs-deployment',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 2,
      front: '一个 Pod 状态不对，同事说"删掉它就好了"。删 Pod 和删 Deployment 分别会发生什么？',
      hint: '关键在于：删完之后，有没有东西会自动把它补回来。',
      answer: '删 Pod → 控制器立刻补一个新副本 ／ 删 Deployment → 连它管的 Pod 一起清掉且不再重建',
      why: 'Pod 由 ReplicaSet 管着，`delete pod` 只是让控制器**补一个新副本**（名字、IP、启动时间全变）—— 这是"重启一下试试"的标准姿势。`delete deployment` 会删掉 ReplicaSet 与所有副本，**没有任何东西会重建它们**，那才是真正意义上的下线。判据是删完再 `get pods`：数量没变但名字变了 → 前者；一个都不剩 → 后者。',
      contrast: '如果这个 Deployment 是 Helm 装出来的，手删只是让集群偏离了 release 记录 —— 下一次 `helm upgrade`/`rollback` 会把它**重新建出来**，看起来像"删不掉"。另外 StatefulSet 的 Pod（名字带序号、绑着 PVC）删掉后名字不变、PVC 也不会被删，这点和 Deployment 差别很大。',
      run: 'kubectl delete pod batch-job-28471920-x7klm -n my-app',
      cmdIds: ['k8s-delete', 'k8s-deployment', 'k8s-statefulset', 'k8s-troubleshoot-pod'],
      tags: ['K8s', '删除', '控制器']
    },

    {
      id: 'card-k8s-rollout-undo-vs-restart',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 2,
      front: '刚发的新版本有问题。一个想法是"退回上一版"，另一个想法是"原地重启一次"。这两条命令改的东西一样吗？',
      hint: '一条会新建 ReplicaSet，另一条连镜像都不换。',
      answer: 'kubectl rollout undo 回退到指定 revision ／ kubectl rollout restart 只是触发一次滚动重启',
      why: '`undo` 按**历史 revision** 把 Pod 模板换回去（先 `rollout history` 看清编号，再用 `--to-revision=N`），它会新建一个 ReplicaSet，所以镜像是真的换版本了。`restart` 只是往 Pod 模板里塞一个 `restartedAt` 注解来触发滚动重启 —— **镜像和配置一个字节都没变**。判据：undo 之后 `rollout history` 会多出一条记录，restart 只会多一次同一版本的重启。',
      contrast: '`restart` 只对"配置注入型"改动有效（改了 ConfigMap 想让 Pod 重新读），对"镜像/代码有问题"完全无效 —— 那种情况下 restart 一百次也还是同一个坏镜像。反过来，`undo` **不会**回滚 ConfigMap/Secret：镜像版本和配置版本是两条独立的线，回滚代码不会连带回滚配置。',
      run: 'kubectl rollout history deploy/web -n my-app',
      cmdIds: ['k8s-rollout', 'k8s-set-image', 'k8s-apply', 'k8s-configmap'],
      lesson: 'k8s-urgent-scale-and-image',
      tags: ['K8s', '发布', '回滚']
    },

    {
      id: 'card-k8s-cordon-vs-drain',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 2,
      front: '一台节点要停机维护。直接把它上面的 Pod 赶走就行吗？这两条命令各自会做什么？',
      hint: '一条只改调度标记，一条会真的驱逐 Pod。',
      answer: 'kubectl cordon 只标记"不可调度" ／ kubectl drain 先 cordon 再逐个驱逐 Pod',
      why: '`cordon` 只把节点标成不可调度：**新** Pod 不再落上去，已经在跑的一个都不动，服务零中断。`drain` 是"cordon + evict"，会把节点上的 Pod 逐个赶走 —— 所以它**会中断服务**。判据是 `get nodes` 的 STATUS 列变成 `Ready,SchedulingDisabled`（cordon 的效果），而 drain 还会额外打印被驱逐的 Pod 列表。',
      contrast: '`drain` 常被三类 Pod 挡住并报错：DaemonSet 的 Pod（要 `--ignore-daemonsets`）、使用 emptyDir 的 Pod（不写 `--delete-emptydir-data` 会直接拒绝，防止数据丢失）、以及 PDB 允许的中断数已用满的 Pod（这种会一直重试）。所以 drain 报错**不等于**命令写错，读它的提示逐条加参数即可；而"卡着不动"通常正是 PDB 在按设计工作。',
      run: 'kubectl drain 10.0.1.24 --ignore-daemonsets --delete-emptydir-data',
      cmdIds: ['k8s-drain', 'k8s-cordon', 'k8s-pdb'],
      lesson: 'k8s-node-maintenance',
      tags: ['K8s', '节点维护', '驱逐']
    },

    {
      id: 'card-k8s-get-vs-describe',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 1,
      front: '`get pods` 看起来一切正常，可你就是不放心。这时候是换个命令，还是给原命令加参数？',
      hint: '一个给"状态摘要"，一个给"配置 + 状态 + 事件"。',
      answer: 'kubectl get 看摘要 ／ kubectl describe 看详情与 Events',
      why: '`get` 只读对象的一小部分字段（STATUS/READY/RESTARTS/AGE），信息来自对象的 status 摘要；`describe` 把 spec 和 status 一起摊开，并在末尾附上该对象的 **Events**（调度失败、探测失败、拉镜像失败都写在这里）。判据：`get` 一旦出现 `Pending`、`0/1` 这类"不够具体"的信号，就该切到 describe。',
      contrast: '两者都看不到**应用日志**：describe 里的 Events 是 kubelet / 调度器写的事件，不是容器里应用的输出。排错三板斧的固定顺序是 get（谁不正常）→ describe（事件说明为什么）→ logs（应用自己怎么说），跳步就会得出"什么线索都没有"的错觉。',
      run: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app',
      cmdIds: ['k8s-get', 'k8s-describe', 'k8s-troubleshoot-pod'],
      lesson: 'k8s-describe',
      tags: ['K8s', '排错', '三板斧']
    },

    {
      id: 'card-k8s-explain-vs-api-resources',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 2,
      front: '写 YAML 时不确定字段该写 `limits` 还是 `limit`，又不想断网去翻官网 —— 该查哪个命令？',
      hint: '一个回答"字段叫什么"，一个回答"这类资源存不存在"。',
      answer: 'kubectl explain 查字段结构 ／ kubectl api-resources 查资源类型是否被集群支持',
      why: '`explain` 基于**这个集群的** OpenAPI 展开字段树（加 `--recursive` 全展开），所以给出的字段名永远和你这个集群的版本对得上 —— 官网文档可能对应的是别的版本。判据：输出头部的 `KIND` / `VERSION` 就是你集群里真实的 API 版本。',
      contrast: '`explain` 回答不了"这个值填多少合适"（那是经验与压测的事）。而写 CRD 相关 YAML 时如果字段怎么都查不到，要先用 `api-resources | grep <关键字>` 确认**这个集群到底装没装那个 CRD** —— 没装的话 `explain` 当然什么都查不到，报错也不是你的 YAML 写错了。',
      run: 'kubectl explain pod.spec.resources',
      cmdIds: ['k8s-explain', 'k8s-api-resources', 'k8s-jsonpath'],
      lesson: 'k8s-namespace-context',
      tags: ['K8s', 'YAML', '文档']
    },

    {
      id: 'card-k8s-apply-vs-create-replace',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 2,
      front: '同一个 YAML 跑第二遍：`create` 报对象已存在，`apply` 却说 `configured`。而当某个字段被提示"不可变"时两个都不好使 —— 那又该用什么？',
      hint: '三条路的区别是：合并、新建、以及删了重建。',
      answer: 'apply 声明式合并 ／ create 命令式新建（存在即报错）／ replace --force 删除后重建',
      why: '`apply` 会记录 last-applied 注解做**三路合并**（文件 / 上次提交的文件 / 集群现状），所以只动你写的那几个字段；`create` 遇到已存在的对象直接 `AlreadyExists` 失败。判据：想改一个字段、又不想碰文件里没写的其它字段，只有 `apply` 做得到。',
      contrast: '真正需要 `replace --force` 的场景是**不可变字段**（比如 Deployment 的 `spec.selector`，改它会报 `field is immutable`）—— 它的实现方式是"删掉重建"，代价是服务中断、Pod 名字与 IP 全变。所以三条路的选择是：日常 `apply`；应急改字段用 `edit`/`patch`；只有不可变字段才动 `replace --force`，且必须先确认重建期间服务扛得住。',
      run: 'kubectl apply -f /home/deploy/work/deploy.yaml',
      cmdIds: ['k8s-apply', 'k8s-replace', 'k8s-edit', 'k8s-diff'],
      lesson: 'k8s-diff-before-apply',
      tags: ['K8s', '声明式', '发布']
    },

    {
      id: 'card-k8s-configmap-vs-secret',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 2,
      front: '数据库密码和 `server.port` 这两个配置，一个进 ConfigMap、一个进 Secret。那"放进 Secret 就更安全"这句话对吗？',
      hint: '先问一句：Secret 里的内容在 etcd 里是加密存的吗？',
      answer: 'ConfigMap 放非敏感配置 ／ Secret 放敏感数据，但它默认只是 base64 编码',
      why: 'Secret 的值默认**只是 base64**（`echo -n p@ss | base64` 就能还原），它真正提供的是三样东西构成的**权限边界**：可以用 RBAC 单独限制谁能读 Secret、kubelet 只在需要的节点上把它挂进 Pod、`kubectl describe pod` 里不会明文显示内容。所以"放 Secret"是为了控制**谁能读**，不是为了加密。',
      contrast: '要真的加密得在 etcd 层面开 EncryptionConfiguration 或接 KMS。另外别把 `data` 和 `stringData` 搞混：`stringData` 是**写入时**用的（自动编码），`data` 是**读出来**的样子（已经是 base64）—— 从 `get secret -o yaml` 里看到的那串不是密文，别再手动 base64 一次。',
      cmdIds: ['k8s-configmap', 'k8s-secret', 'k8s-create-secret-generic', 'k8s-rbac-role'],
      lesson: 'k8s-secret-not-in-yaml',
      tags: ['K8s', '配置', 'Secret']
    },

    {
      id: 'card-k8s-scale-vs-hpa',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 3,
      front: '高峰时你手工把副本数从 2 改成 6，两小时后发现它自己变回 2 了。谁改的？',
      hint: '有一个控制器在按指标持续地"纠正"副本数。',
      answer: 'HPA 会覆盖手工调整的副本数',
      why: 'HPA 每隔一小段（默认 15 秒）重算一次期望副本数，并**直接写 Deployment 的 replicas** —— 你手工写的数字只在下一次同步之前有效。判据：`kubectl get hpa` 的 TARGETS 列（当前指标 / 目标值）只要还在阈值那一侧，它就会持续往回收或往外扩。',
      contrast: '`scale` 也不是没用：临时演练、或者先把 HPA 摘掉再手工控制，都是常见做法。要"临时下线但保留全部配置"，`scale --replicas=0` 比删 Deployment 安全得多（配置、Service、PVC 都还在，随时拉回来）。反过来，想让副本数长期稳定，得去调 HPA 的 minReplicas，而不是跟它抢着改。',
      run: 'kubectl scale deploy/web --replicas=3 -n my-app',
      cmdIds: ['k8s-scale', 'k8s-hpa', 'k8s-deployment'],
      lesson: 'k8s-urgent-scale-and-image',
      tags: ['K8s', 'HPA', '副本数']
    },

    {
      id: 'card-k8s-get-nodes-vs-top',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 2,
      front: '一台节点"看起来是好的"：STATUS 是 Ready。可调度器就是不往上放 Pod。这两个判断用的是同一个指标吗？',
      hint: '一个回答"活着没"，一个回答"忙不忙"，而调度器看的是第三个东西。',
      answer: 'get nodes 看节点是否失联 ／ top node 看实际资源用量',
      why: '`get nodes` 的 `Ready` 只代表 kubelet 心跳正常、节点没掉线，**完全不反映资源水位**；`top node` 给的是实际 CPU/内存用量百分比（本环境三个节点是 39% / 14% / 16% CPU）。判据：Ready 而且 top 很低的节点，照样可能因为 **requests 之和打满**而拒绝新 Pod。',
      contrast: '三个视角必须分清：`get nodes` = 健康状态；`top node` = 实际用量；`describe node` 的 `Allocated resources` = requests 水位（**调度器的依据**）。"节点明明很空却调度不上去"这个问题，答案几乎总在第三个里 —— 用错视角就会一直怀疑节点故障。',
      run: 'kubectl top node',
      cmdIds: ['k8s-get-nodes', 'k8s-top', 'k8s-top-node-sort', 'k8s-troubleshoot-node-notready'],
      lesson: 'k8s-top',
      tags: ['K8s', '节点', '资源']
    },

    {
      id: 'card-k8s-liveness-vs-readiness',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 3,
      front: '一个 Pod 的容器**在跑**（RESTARTS 没涨），但 READY 一直是 `0/1`，Service 也不给它流量。这更像是哪一类探针没过？',
      hint: '想清楚：哪一个探针失败**不会**重启容器？',
      answer: 'readinessProbe 失败：容器照跑，只是被摘出 endpoints',
      why: '`readinessProbe` 决定这个 Pod 要不要被放进 Service 的 endpoints：失败只是**摘流量**，容器继续跑、RESTARTS 不动。`livenessProbe` 失败才会**重启容器**（RESTARTS 持续上涨，最终变成 CrashLoopBackOff）。判据就是这两个信号的组合：READY=0/1 且 RESTARTS 不涨 → readiness。',
      contrast: 'Events 里会直接写出失败细节：`Readiness probe failed: Get "http://172.20.1.22:8081/healthz": dial tcp ... connect: connection refused` —— 注意探针打的是 **8081**，而 Service 的 targetPort 是 8080：**探针端口写错**是"永远不就绪"里最低级也最常见的原因。另一种是 `initialDelaySeconds` 太小，慢启动应用还没起来就被判死，现象和真的没就绪一模一样。',
      run: 'kubectl get events --field-selector type=Warning',
      cmdIds: ['k8s-pod-status-conditions', 'k8s-troubleshoot-pod', 'k8s-service', 'k8s-endpointslices'],
      lesson: 'k8s-pod-dns-broken',
      tags: ['K8s', '探针', '流量']
    },

    {
      id: 'card-k8s-taint-vs-cordon',
      cat: 'kubernetes',
      kind: 'distinguish',
      level: 3,
      front: '只想让"某一类" Pod 不要调度到这台机器上，而不是整台节点都不可调度 —— 该用哪种机制？',
      hint: '一种是节点一刀切，另一种是节点开出条件、Pod 满足条件才准进。',
      answer: 'kubectl taint node <节点> key=value:NoSchedule',
      why: '`cordon` 是**节点维度**的一刀切：所有新 Pod 都别来。`taint` 是节点贴出的条件，只有 Pod 里写了对应的 `tolerations` 才能落上去 —— 于是能做出"只有 GPU 任务能上这台机器""这个节点专供某业务"这类精细控制。判据：`describe node` 的 **Taints** 段从 `<none>` 变成 `key=value:NoSchedule`。',
      contrast: '三种 effect 必须分清：`NoSchedule` 只挡新 Pod（已在跑的不动）、`PreferNoSchedule` 是软约束（尽力而为）、`NoExecute` 会**驱逐**不容忍的现有 Pod。给节点打 `NoExecute` 前先确认上面的 Pod 有容忍，否则等于发起一次计划外驱逐 —— 这也是"Pod 莫名其妙被赶走"的常见原因。',
      run: 'kubectl describe node 10.0.1.23',
      cmdIds: ['k8s-taint', 'k8s-affinity-toleration', 'k8s-cordon', 'k8s-pods-by-node'],
      lesson: 'k8s-node-maintenance',
      tags: ['K8s', '调度', '污点']
    },

    {
      id: 'card-k8s-get-wide-columns',
      cat: 'kubernetes',
      kind: 'syntax',
      level: 2,
      front: '要看每个 Pod 的 IP 和它跑在哪台节点上：\n\n  kubectl get pods ____ -n my-app\n\n横线处填什么？',
      hint: '不是输出成 YAML，而是"多给我几列"。',
      answer: '-o wide',
      why: '`-o wide` 在默认列后面追加 **IP** 和 **NODE** 两列，这是"想多看几个字段"的正确用法（想看"某个 Pod 在哪台机器上"就只能靠 NODE 这一列）。判据：加上它之后表头出现 NODE 列，值就是节点名 —— 比如 Pending 的那个 Pod 两列全是 `<none>`，因为调度器还没给它分配节点。',
      contrast: '别拿 `-o yaml` 去干这件事：那会把整个对象（几百行）打出来。反过来，要从列表里**精确取一个字段**给脚本用，`-o yaml` 又太重，该用 `-o jsonpath=`。三者的定位是：默认列看概况、`wide` 多看几列、`jsonpath` 只取一个值。',
      run: 'kubectl get pods -o wide -n my-app',
      cmdIds: ['k8s-get', 'k8s-jsonpath', 'k8s-pods-by-node'],
      lesson: 'k8s-jsonpath-for-scripts',
      tags: ['K8s', '参数', '输出格式']
    },

    {
      id: 'card-k8s-events-sort-by',
      cat: 'kubernetes',
      kind: 'syntax',
      level: 2,
      front: '事件列表看着乱，想按时间排一下：\n\n  kubectl get events -A ____\n\n横线处填什么？',
      hint: 'K8s 的排序参数统一用"对象里的字段路径"来指定。',
      answer: '--sort-by=.lastTimestamp',
      why: '`--sort-by` 接收一个字段路径，事件对象里表示"最近一次发生时间"的字段是 `.lastTimestamp`（开头那个点不能省，它表示从对象根开始）。判据：加上之后列表按时间先后排列，跨对象看"谁先谁后"才成立 —— 不加时返回顺序是按资源分组的，很容易把两件有因果关系的事看反。',
      contrast: '只想看**一个对象**的事件，用 `--field-selector involvedObject.name=<名字>`（比全量再肉眼筛可靠得多）；只想看异常事件，用 `--field-selector type=Warning`。selector 可以和 `--sort-by` 叠加，但它们解决的是不同问题，不能互相替代。',
      run: 'kubectl get events -A --sort-by=.lastTimestamp',
      cmdIds: ['k8s-get-events', 'k8s-events-involved-object'],
      lesson: 'k8s-events',
      tags: ['K8s', '事件', '参数']
    },

    {
      id: 'card-k8s-exec-double-dash',
      cat: 'kubernetes',
      kind: 'syntax',
      level: 2,
      front: '进容器执行命令时，中间那两条横线最常被省略：\n\n  kubectl exec web-7d9c4b8f5-2xk9p -n my-app ____ env\n\n横线处填什么？',
      hint: '它的作用是"从这里开始，后面的都交给容器"。',
      answer: '--',
      why: '`--` 之后的内容全部当作**容器内的命令**传给容器，不再由 kubectl 解析。省略它时，容器内命令里以 `-` 开头的参数可能被 kubectl 自己吃掉（比如 `kubectl exec web-7d9c4b8f5-2xk9p -n my-app ls -l /tmp` 里的 `-l`），于是报 `unknown shorthand flag` 或者行为诡异 —— 判据就是这个报错。',
      contrast: '多条命令要用 shell 显式串起来：`kubectl exec -it web-7d9c4b8f5-2xk9p -n my-app -- sh -c "a; b"`。直接写 `kubectl exec web-7d9c4b8f5-2xk9p -- a; b` 时，**只有 a 进了容器，b 是在你本机执行的** —— 脚本里这是最隐蔽的一类错误，因为两条命令看起来都"成功"了。',
      run: 'kubectl exec web-7d9c4b8f5-2xk9p -n my-app -- env',
      cmdIds: ['k8s-exec', 'k8s-cp', 'k8s-exec-dns'],
      lesson: 'k8s-copy-files-in-out',
      tags: ['K8s', 'exec', '参数']
    },

    {
      id: 'card-k8s-debug-distroless',
      cat: 'kubernetes',
      kind: 'diagnose',
      level: 3,
      front: '一个精简到没有 shell 的镜像行为异常，进容器的命令直接报"找不到可执行文件"。日志又看不出所以然，还有办法进现场吗？',
      hint: '既然容器里没有工具，就让集群在旁边**挂一个带工具的容器**进来。',
      answer: 'kubectl debug -it <Pod名> --image=busybox:1.36 --target=<容器名>',
      why: '`debug` 会往目标 Pod 里加入一个**临时容器**，`--target` 让它共享目标容器的进程命名空间 —— 于是你能用新容器里的工具去看目标容器的进程、网络和文件。判据：`exec` 报 `executable file not found in $PATH`，这就是 distroless / scratch 镜像的典型特征，这类镜像里根本没有 shell 可供 exec。',
      contrast: '它需要集群支持 **Ephemeral Containers**（1.23+ 默认开启），老集群上只能 `--copy-to` 复制出一个 Pod 来改（比如把启动命令换成 `sleep` 再进去看）—— 好处是绝对不动线上实例。另外别忘了：**只看日志根本不用进容器**，`kubectl logs` 对 distroless 一样有效，因为日志走的是标准输出，不依赖镜像里有什么工具。',
      cmdIds: ['k8s-debug', 'k8s-debug-copy-to', 'k8s-node-shell', 'k8s-logs'],
      lesson: 'k8s-logs-prev',
      tags: ['K8s', '调试', 'distroless']
    },

    /* ==================== Helm 包管理 ==================== */
    {
      id: 'card-helm-list-all-namespaces',
      cat: 'helm',
      kind: 'diagnose',
      level: 1,
      front: '接手上一个同事留下的集群，你要先把"上面用 Helm 部署过哪些应用"列清楚 —— 一条命令看全。',
      hint: '不加参数的话，它只看你当前所在的那一个命名空间。',
      answer: 'helm list -A',
      why: '`helm list` 默认只列**当前命名空间**的 release（默认命名空间下只有 `mysql`），这正是"装过的东西看不见"的头号原因；`-A` 会带上 NAMESPACE 列，于是 my-app 的 `myapp`、monitoring 的 `prometheus`、default 的 `mysql` 会出现在同一张表里。判据是 STATUS 列：正常是 `deployed`，出现 `failed` / `pending-install` 说明上一次发布没走完。',
      contrast: '`helm list` 只回答"装过哪些 release"，不回答"它们下面健康吗" —— release 处于 `deployed` 完全不妨碍它管理的 Pod 全部 CrashLoopBackOff。要判断业务是否真的可用，必须再对一遍 `kubectl get pods -n <命名空间>`，这两张表是互补的。',
      run: 'helm list -A',
      cmdIds: ['hl-list', 'hl-status', 'hl-history'],
      lesson: 'hl-release-inventory',
      tags: ['Helm', '巡检', 'release']
    },

    {
      id: 'card-helm-repo-add-vs-update',
      cat: 'helm',
      kind: 'distinguish',
      level: 1,
      front: '搜 chart 时报"在你已添加的仓库里找不到结果"，同事让你"先 add 再 update"。这两步各自解决什么？',
      hint: '一个解决"仓库不认识"，一个解决"索引太旧"。',
      answer: 'helm repo add 登记仓库地址 ／ helm repo update 重新拉取索引',
      why: 'Helm 安装时并不实时访问仓库，而是用本地缓存的 `index.yaml`：`repo add` 把仓库地址与索引登记进本地配置，`repo update` 是重新拉一遍索引。判据：`helm repo list` 里**有**这个仓库，但 `search repo` 搜不到新版本 —— 那就是索引没更新（刚推上去的版本，不 update 永远看不到）。',
      contrast: '搜不到还有第二种可能：**搜索的维度不对**。`search repo` 匹配的是 chart 名和描述（搜 `mysql` 能命中 `bitnami/mysql`），想看全部版本要加 `--versions`；而 `search hub` 查的是公网 Artifact Hub，和本地已加仓库是两套数据源 —— 用它搜到了，不等于本地仓库里就有。',
      run: 'helm repo list',
      cmdIds: ['hl-repo-add', 'hl-repo-list', 'hl-repo-search'],
      lesson: 'hl-template-before-install',
      tags: ['Helm', '仓库', '索引']
    },

    {
      id: 'card-helm-show-values',
      cat: 'helm',
      kind: 'syntax',
      level: 1,
      front: '不安装、不下载，先看一个 chart 有哪些可配的值：\n\n  helm ____ myorg/web\n\n横线处填什么？',
      hint: '`show` 后面还要跟一个"看什么"的子命令。',
      answer: 'show values',
      why: '`helm show` 有三个常用子命令：`values`（可配项及默认值）、`chart`（Chart.yaml 元数据：版本、appVersion、依赖）、`readme`（上游说明文档）。判据：`show values` 打出来的是**渲染时最底层的那些键**（replicaCount、image.repository、resources…）—— 上游文档里没写的可配项，这里一定有。',
      contrast: '`show values` 给的是 **chart 自带**的默认值；某个 release **实际生效**的值要用 `helm get values <release>` 看。两者不是一回事：拿 chart 默认值去解释线上行为，就会得出"我明明没改过这个值"的错误结论。',
      run: 'helm show values myorg/web',
      cmdIds: ['hl-show', 'hl-get', 'hl-values-files'],
      lesson: 'hl-release-inventory-audit',
      tags: ['Helm', 'chart', 'values']
    },

    {
      id: 'card-helm-template-before-install',
      cat: 'helm',
      kind: 'diagnose',
      level: 2,
      front: '一个没见过的 chart 要装到生产。你不想装完才发现它建了一堆意料之外的对象 —— 怎么在本地先看清它到底会创建什么？',
      hint: '有一条命令只渲染、不连集群、也不生成 release。',
      answer: 'helm template myapp myorg/web -n my-app',
      why: '`template` 在本地把 chart 渲染成完整 YAML 打印出来，不连集群、不建 release，可以随便试参数。判据：每个 YAML 文档开头的 **`# Source: web/templates/xxx.yaml`** 注释指出了这段内容来自哪个模板文件 —— 排查"某个字段为什么是这个值"时，顺着它去看模板最快。',
      contrast: '`template` 纯本地渲染，**不做集群校验**：集群里没有对应 CRD、字段在当前 API 版本已废弃，它照样渲染成功，那是 `install --dry-run` 的领域（会经过集群的能力校验）。所以上线前的顺序是：`lint` → `template`（人工核对）→ `--dry-run`（集群校验）→ 真正 install。',
      run: 'helm template myapp myorg/web -n my-app',
      cmdIds: ['hl-template', 'hl-lint', 'hl-install', 'hl-show'],
      lesson: 'hl-template-before-install',
      tags: ['Helm', '模板', '上线前']
    },

    {
      id: 'card-helm-lint-vs-template',
      cat: 'helm',
      kind: 'distinguish',
      level: 2,
      front: '改完模板，`helm lint` 通过了，是不是就可以直接发布了？',
      hint: '"能打包"和"装出来的东西是你要的"是两件事。',
      answer: 'helm lint 查 chart 结构与模板规范 ／ helm template 查渲染结果',
      why: '`lint` 检查的是**打包规范与模板语法**（Chart.yaml 必填字段、模板能否渲染、values 里的键有没有被用到），它根本不关心渲染出什么对象。判据：`lint` 的结论只有 `N chart(s) linted, 0 chart(s) failed` 这一句 —— 它通过只代表这份 chart"装得上"。',
      contrast: '要看"装出来是什么样"必须用 `template`：镜像 tag、副本数、探针路径、资源限额这些**业务正确性**只有渲染结果才能核对。而两者都不连集群，所以都发现不了"集群没有这个 CRD"，那一层要靠 `install --dry-run`。',
      run: 'helm lint myorg/web',
      cmdIds: ['hl-lint', 'hl-template', 'hl-package'],
      lesson: 'hl-lint-before-release',
      tags: ['Helm', '校验', 'CI']
    },

    {
      id: 'card-helm-get-values-effective',
      cat: 'helm',
      kind: 'diagnose',
      level: 2,
      front: '同一个 chart，生产环境和本地行为不一样。你要确认这个 release **实际生效**的配置值，而不是仓库里那份 values.yaml 写了什么。',
      hint: '每次发布时最终生效的值，都被记进 release 里了。',
      answer: 'helm get values myapp -n my-app',
      why: 'Helm 把每次发布**最终生效的 values** 存进 release 记录，`get values` 默认只打印被覆盖过的那部分（这里是 `replicaCount: 2` 和 `image.tag: 1.2.3`，来自发布时的 `--set`）。判据：输出里出现的键，就是"这个环境被动过手脚"的键 —— 仓库里的 values.yaml 已经解释不了线上行为了。',
      contrast: '`get values` 给的是**值**，`get manifest` 给的是**渲染后的 YAML**。想知道"值有没有真的作用到容器上"，必须看 manifest 里 Deployment 的 image/replicas 有没有跟着变 —— 两个一起看，才能区分"值没传进去"和"模板根本没读这个值"这两种不同的故障。',
      run: 'helm get values myapp -n my-app',
      cmdIds: ['hl-get', 'hl-values-files', 'hl-status', 'hl-show'],
      lesson: 'hl-release-inventory-audit',
      tags: ['Helm', 'values', '配置']
    },

    {
      id: 'card-helm-vs-kubectl-view',
      cat: 'helm',
      kind: 'distinguish',
      level: 2,
      front: '想确认线上那个 web 是不是 Helm 装的、装的是哪个 chart 版本 —— 只看 `kubectl get deploy` 够吗？',
      hint: '资源对象上有没有留下"我归谁管"的标记？',
      answer: 'helm status/list 看 release 视角 ／ kubectl get 看资源视角',
      why: '`kubectl get deploy` 只能看到 Deployment 对象（名字通常是 `<release>-<chart>`，比如 myapp 渲染出来叫 `myapp-web`），看不出它属于哪个 release、哪个 chart 版本；`helm list` / `helm status` 才有 REVISION、CHART、APP VERSION。判据：资源上有 **`app.kubernetes.io/managed-by: Helm`** 和 **`app.kubernetes.io/instance: <release 名>`** 两个标签 —— 这是"这个对象归 Helm 管"的唯一标记。',
      contrast: '反过来，Helm 的 `deployed` **不代表下面的资源健康**：release 记录只说明"我提交过这份 YAML"，Pod 崩了它状态照样是 deployed。所以"发布成功了吗"看 `kubectl rollout status`，"装过什么、装过几版"才看 Helm。',
      run: 'helm status myapp -n my-app',
      cmdIds: ['hl-status', 'hl-list', 'k8s-deployment', 'k8s-label'],
      lesson: 'hl-template-before-install',
      tags: ['Helm', '视角', '标签']
    },

    {
      id: 'card-helm-rollback-vs-uninstall',
      cat: 'helm',
      kind: 'distinguish',
      level: 2,
      front: '一次发布把服务搞坏了。什么情况下该"回滚"，什么情况下该"整个卸掉重来"？',
      hint: '一个只换内容，一个连"发布记录"一起抹掉。',
      answer: 'helm rollback 换回旧版本（保留历史）／ helm uninstall 删除 release 及它创建的资源',
      why: '`rollback` 只改 release 的**内容**：名字留着、历史留着，所以之后还能再滚到别的 revision。`uninstall` 会删掉 release 记录**和它创建的所有 K8s 对象**，下次再装从 revision 1 重新开始，`helm history` 从此什么也查不到。判据：回滚后 `helm history` **多出一条**记录（旧版本没被删除，只是状态变成 superseded），而 uninstall 之后这条命令直接报 `release: not found`。',
      contrast: '最需要警惕的是数据：`uninstall` **会**删掉它创建的 PVC，除非该资源带有 `helm.sh/resource-policy: keep` 注解（不少数据库 chart 会标，但你必须去确认）。而 `rollback` 也救不了数据层面的破坏 —— 已经跑过的数据库迁移、写坏的数据，都不会因为回滚代码而撤销。所以"删了重装"之前，先确认卷在不在保留策略里。',
      run: 'helm history myapp -n my-app',
      cmdIds: ['hl-rollback', 'hl-uninstall', 'hl-history', 'hl-list'],
      lesson: 'hl-release-inventory',
      tags: ['Helm', '回滚', '数据']
    },

    {
      id: 'card-helm-rollback-bad-release',
      cat: 'helm',
      kind: 'diagnose',
      level: 2,
      front: '升级之后接口开始报 500，YAML 已经改乱了。你要**立刻**把发布退回上一个可用版本，而不是去翻 Git 重新发一次。',
      hint: '每次发布的历史都留在集群里，先看清编号再动手。',
      answer: 'helm rollback myapp 2 -n my-app',
      why: 'Helm 把每次 install/upgrade 存成一个 **revision**（`helm history myapp` 会列出 1、2、3…，当前生效那条的 STATUS 是 `deployed`）。`rollback myapp 2` 是把 revision 2 的内容**重新发布成一个新 revision** —— 历史只增不改，所以回滚本身也能再被回滚。判据：执行后 `helm history` 多出一条 DESCRIPTION 为 `Rollback to 2` 的记录。',
      contrast: '一定要先 `helm history` 看清编号再回滚：不写编号时它只退到"上一个 revision"，如果上一版本身就是坏的，你会正好滚进故障版本。另外 **rollback 不回滚配置和数据库**：它只把 chart 渲染出的 K8s 对象换回去，新版本已经跑过的数据库迁移、以及被改过的 ConfigMap，都不在这条命令的管辖范围内。',
      run: 'helm rollback myapp 2 -n my-app',
      cmdIds: ['hl-rollback', 'hl-history', 'hl-status', 'hl-upgrade'],
      lesson: 'hl-release-inventory',
      tags: ['Helm', '回滚', '发布']
    },

    {
      id: 'card-helm-upgrade-install-idempotent',
      cat: 'helm',
      kind: 'diagnose',
      level: 2,
      front: 'CI 里希望用同一条命令完成部署：空集群第一次跑要能装上，之后每次跑要能升级。怎么写？',
      hint: '默认的升级命令有一个前提：这个 release 已经存在。',
      answer: 'helm upgrade --install myapp myorg/web -n my-app',
      why: '`upgrade` 的前提是 release 已存在 —— 首次在空环境跑会报 `Error: UPGRADE FAILED: "myapp" has no deployed releases`。加上 `--install` 后它变成幂等的两用命令：不存在就装（并多打一行 `Release "myapp" does not exist. Installing it now.`），存在就升。判据：`helm history` 里出现的是 revision 1 的 `Install complete`（走的安装路径）还是新的一条 `Upgrade complete`（走的升级路径）—— 它必然二选一。',
      contrast: '`--install` **不会创建命名空间**：`-n` 指向一个不存在的命名空间时会报 `create: failed to create: namespaces "xxx" not found`，要再加 `--create-namespace`，这是 CI 首次部署到新环境最常见的第二个坑。另外 release 名只需在**同一命名空间内**唯一：同名 release 重复安装会报 `cannot re-use a name that is still in use`。',
      run: 'helm upgrade --install myapp myorg/web -n my-app',
      cmdIds: ['hl-upgrade-install', 'hl-upgrade', 'hl-install', 'hl-history'],
      lesson: 'hl-upgrade-install-idempotent',
      tags: ['Helm', 'CI', '幂等']
    },

    {
      id: 'card-helm-values-layering',
      cat: 'helm',
      kind: 'syntax',
      level: 2,
      front: '给某个环境叠加一份专属配置，不动 chart 里的默认值：\n\n  helm upgrade myapp myorg/web ____ values-prod.yaml -n my-app\n\n横线处填什么？',
      hint: 'values 文件是"喂"给这条命令的，用参数指定文件路径。',
      answer: '-f',
      why: '`-f`（`--values`）可以出现多次，按**从左到右后者覆盖前者**的顺序合并，而 chart 自带的 values.yaml 永远在最底层。这就是"公共值放 chart、环境差异放 values-<env>.yaml"这套分层结构能成立的原因。判据：`helm get values <release>` 里出现的键，就是被 `-f` / `--set` 覆盖过的键。',
      contrast: '`--set` 的优先级比任何 `-f` 都高，临时改一个值很方便；但键一多它就没人看得懂了（`--set` 的值在 shell 里还会被逗号、点号、引号搅乱），批量配置该退回 `-f`。还有一条必须记住的合并规则：**values 里的数组是整体替换、不是合并** —— prod 文件里写 `imagePullSecrets` 会把 chart 里那条挤掉，列表字段必须整段重写。',
      run: 'helm upgrade -f values-prod.yaml myapp myorg/web -n my-app',
      cmdIds: ['hl-values-files', 'hl-upgrade', 'hl-get', 'hl-chart-yaml'],
      lesson: 'hl-orphan-resources-not-in-helm',
      tags: ['Helm', 'values', '多环境']
    }

  );
})();
