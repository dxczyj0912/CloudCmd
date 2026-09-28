/* data/concepts.js · 概念词典
   --------------------------------------------------------------------------
   863 条命令解决"怎么敲"，这一份解决"到底是什么、为什么是这样"。
   一条记录 = 一个概念（不是一条命令）。

   {
     id: 'cgroup-cpu-limit',        // 唯一，kebab-case，不与命令条目 id 冲突
     term: 'cgroup',                // 术语（中文或英文原词）
     en: 'control group',           // 英文原词，没有就省略
     cat: 'docker',                 // 主要归属分类（必须是 _registry.js 里的分类 id）
     level: 2,                      // 1 入门 / 2 进阶 / 3 深入
     oneLine: '内核按组限制与统计资源用量的机制',   // ≤40 字，一句话定义
     why: '……',                     // ≥60 字：为什么重要、生产上什么时候会撞到它
     confusion: [                   // ≥1 条常见误解（问答对，这是最有价值的部分）
       { q: '给容器设了 --cpus=2，nproc 就该显示 2 吗？', a: '……' }
     ],
     related: ['dk-run'],           // 关联命令条目 id（必须存在，可以空数组）
     lessons: ['dk-df'],            // 关联课程 id（必须存在，可以空数组）
     tags: ['容器', 'CPU']
   }

   校验：node tools/kb-check.js（字段、长度、引用是否断链、命令是否可跑）
   渲染：#/concepts（见 assets/js/render.js 的 viewKb）
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_CONCEPTS = window.CC_CONCEPTS || [];

  window.CC_CONCEPTS.push(

    /* ══════════════════ 一、容器与内核 ══════════════════ */

    {
      id: 'cgroup-cpu-limit',
      term: 'cgroup',
      en: 'control group',
      cat: 'docker',
      level: 2,
      oneLine: '内核按组限制与统计资源用量的机制',
      why: 'CPU、内存、IO 的上限都落在 cgroup 上：docker run 的 --cpus/--memory、K8s 的 requests/limits、systemd 的 CPUQuota 最终都写成 cgroup 里的数值。不懂它就会把"限额"当成"独占"：容器被限流时 top 里 CPU 可能不高，但接口延迟照样飙升；容器内存超限时进程被内核直接杀掉，应用日志里什么都看不到。',
      confusion: [
        { q: '`docker run --cpus=2` 是给容器独占 2 个核吗？', a: '不是 —— 它写的是 CPU 带宽配额（quota/period），含义是每个 100ms 周期内最多消耗 200ms 的 CPU 时间，容器照样会被调度到宿主机任意核上。要真的绑核得用 `--cpuset-cpus`，这两个参数经常被混为一谈。' },
        { q: '设了 `--cpus=2`，容器里 `nproc` 就会显示 2 吗？', a: '通常不会 —— `nproc` 读的是 CPU 亲和性（sched_getaffinity），只有设了 `--cpuset-cpus` 才会变小，`--cpus` 不改亲和性。会跟着配额变的是 Java：JDK 8u191/11 之后 `Runtime.availableProcessors()` 会读 cgroup 配额；老 JDK 看不到限额，线程池按宿主机核数开，于是在被限流的 CPU 上互相争抢。' },
        { q: '容器被 CPU 限流了，会像内存超限那样被杀掉吗？', a: '不会 —— CPU 是可压缩资源，超配额只是被推迟到下一个周期执行（throttle），表现为延迟升高；内存是不可压缩资源，超了才会 OOMKilled。所以"CPU 跑满"和"内存打满"的处置方向完全不同。' }
      ],
      related: ['dk-run', 'dk-update', 'dk-stats', 'mo-nproc', 'pf-taskset'],
      lessons: [],
      tags: ['容器', '内核', 'CPU']
    },

    {
      id: 'cgroup-v1-vs-v2',
      term: 'cgroup v1 与 v2',
      en: 'cgroup v1 / v2',
      cat: 'docker',
      level: 3,
      oneLine: 'cgroup 的两代实现：v1 每类控制器一套层级，v2 统一成一套',
      why: '查容器资源用量时两代的文件名不一样：v1 是 memory.limit_in_bytes、cpu.cfs_quota_us，v2 是 memory.max、cpu.max；路径也从 /sys/fs/cgroup/<控制器>/ 变成 /sys/fs/cgroup/<cgroup>/。照抄网上的排查命令却提示"文件不存在"时，第一嫌疑就是版本不对，而不是内核没开 cgroup。',
      confusion: [
        { q: '照博客去 `/sys/fs/cgroup/memory/docker/<id>/memory.limit_in_bytes` 取值，提示文件不存在，是内核不支持 cgroup 吗？', a: '多半是宿主机跑在 cgroup v2 上 —— 目录结构与文件名都变了，要用 `/sys/fs/cgroup/<cgroup 路径>/memory.max`。`docker info` 里的 Cgroup Version 一行可以直接确认当前版本。' },
        { q: 'cgroup v2 里 `memory.current` 接近 `memory.max`，说明内存泄漏了吗？', a: '不一定 —— v2 的 memory.current 把页缓存（file）也算进去，读过大文件后它自然会接近上限。要看 `memory.stat` 里 anon 与 file 各占多少：anon 持续增长才更像泄漏，file 高只是缓存，会被回收。' }
      ],
      related: ['dk-stats', 'dk-inspect', 'mo-proc'],
      lessons: [],
      tags: ['容器', '内核', '监控']
    },

    {
      id: 'overlayfs-layers',
      term: 'OverlayFS',
      en: 'overlay filesystem',
      cat: 'docker',
      level: 2,
      oneLine: '把多个只读目录叠加成一个可写视图的联合文件系统',
      why: '镜像的每一层是一个只读目录，运行时的写入落到最上层的可写层，读的时候按层从上往下找，修改下层文件时先把它复制上来（copy-up）。所以"进容器改了配置文件"只改了可写层，容器一删就没了；宿主机上 /var/lib/docker/overlay2 的体积也主要由这些可写层和容器日志撑起来。',
      confusion: [
        { q: '在容器里 `rm` 掉一个大文件，镜像或磁盘就会变小吗？', a: '不会 —— 镜像层是只读的，删除只是在可写层写入一条 whiteout 记录把下层文件"遮住"，下层内容与镜像体积都不变。要缩小体积只能改 Dockerfile 重新构建。' },
        { q: '容器挂了数据卷，里面的写入就一定持久吗？', a: '只有写在挂载点路径下的才持久 —— 其余路径都在可写层，`docker rm` 后一起消失。而且 `-v /data`（匿名卷）与 `-v /宿主目录:/data`（bind mount）的落点不同，要用 `docker inspect` 的 Mounts 字段确认实际挂载了什么。' }
      ],
      related: ['dk-inspect', 'dk-diff', 'dk-commit', 'dk-volume-vs-bind'],
      lessons: [],
      tags: ['容器', '文件系统']
    },

    {
      id: 'image-layer-reuse',
      term: '镜像分层',
      en: 'image layer',
      cat: 'docker',
      level: 2,
      oneLine: '镜像由只读层叠加而成，内容相同的层可以被多个镜像共用',
      why: 'Dockerfile 每条会改动文件系统的指令生成一层，层按内容摘要标识，所以拉取时相同层只传一次、本地多个镜像也能共用同一份层。构建缓存同样按"父层 + 指令"命中，指令顺序直接决定构建速度：把 `COPY . .` 放在 `RUN npm install` 之前，改一行代码就会让依赖重装一遍。',
      confusion: [
        { q: '`RUN` 的构建缓存是看命令字符串，还是看它实际产生的文件？', a: '经典构建器看的是父层摘要加命令字符串，不会去校验命令执行的结果；只有 `COPY`/`ADD` 才会对文件内容算校验和。所以 `RUN apt-get update` 这类"命令没变但结果应该变"的指令会一直命中旧缓存，需要 `--no-cache` 或 `--pull` 打破。' },
        { q: '两个镜像用了同一个基础镜像，磁盘上就是两份吗？', a: '不是 —— 相同摘要的层在本地只存一份，`docker system df -v` 里的 SHARED SIZE 一列就是被多个镜像共用的部分；但每个容器运行时的可写层是独立的，那部分不共享。' }
      ],
      related: ['dk-build', 'dk-history', 'dk-images', 'dk-df', 'dk-buildx'],
      lessons: ['dk-df'],
      tags: ['容器', '镜像']
    },

    {
      id: 'namespace-isolation',
      term: 'namespace',
      en: 'namespace',
      cat: 'docker',
      level: 2,
      oneLine: '内核用来隔离进程视图的机制：PID、网络、挂载、主机名各自独立',
      why: '容器"看起来像一台独立机器"靠的是 namespace：PID 让容器内进程号从 1 开始、NET 给它独立的网卡与端口空间、MNT 给它独立的挂载表、UTS 让它有自己的主机名。但它只解决"看不看得见"，不解决"能用多少"——后者是 cgroup。这个区分在排障时很实用：进程互相看不见是 namespace 的问题，进程被限速或被杀是 cgroup 的问题。',
      confusion: [
        { q: '容器里的 root 就是宿主机的 root 吗？', a: '不是 —— 默认情况下容器内 root 的 capability 被裁剪过（没有 CAP_SYS_ADMIN 等），也受挂载与设备限制；只有 `--privileged` 或改用 host namespace 才接近宿主机 root。很多容器逃逸类漏洞的前提就是有人图省事加了 --privileged。' },
        { q: '两个容器用同一个镜像、监听同一个端口，会冲突吗？', a: '默认不冲突 —— 每个容器有独立的 NET namespace，各自的 80 端口互不干扰。真正会冲突的是 `--network host`（共享宿主机网络栈）或同一个 Pod 里的多个容器（共享同一个网络命名空间）。' }
      ],
      related: ['dk-run', 'dk-inspect', 'dk-network-modes', 'k8s-exec'],
      lessons: [],
      tags: ['容器', '内核']
    },

    {
      id: 'container-oom-killer',
      term: 'OOM Killer',
      en: 'out-of-memory killer',
      cat: 'docker',
      level: 3,
      oneLine: '内存不足时内核按评分杀进程，容器里表现为 cgroup OOM',
      why: '容器内存超过 limit，内核会在这个 cgroup 内挑一个进程杀掉，应用往往没有任何日志就消失。K8s 里表现为 Pod 反复重启、`kubectl describe` 显示 Last State: Terminated, Reason: OOMKilled、退出码 137。Java 服务最常见：堆没设或设得比容器 limit 还大，再加上元空间、线程栈、直接内存就超限了。',
      confusion: [
        { q: '容器退出码 137 就一定是 OOM 吗？', a: '不一定 —— 137 = 128 + 9（SIGKILL），`docker stop` 宽限期结束后的强杀、`docker kill` 和 OOM 都会给出 137。判据是 `docker inspect` 里的 State.OOMKilled 字段或 `dmesg` 中的 Memory cgroup out of memory 记录，不能只看退出码。' },
        { q: '容器里 `free -h` 显示内存还很充裕，为什么还被 OOM 杀掉？', a: '`free` 读的是宿主机的内存信息，完全不看 cgroup 限额。要知道容器自己的上限得读 cgroup 文件（v2 是 memory.max 与 memory.current），或看监控里的 working_set 指标。' }
      ],
      related: ['dk-update', 'dk-stats', 'dk-inspect', 'mo-dmesg', 'k8s-troubleshoot-crashloop'],
      lessons: ['dk-exitcode', 'mon-free-vs-available'],
      tags: ['容器', '内存', '内核']
    },

    {
      id: 'pid1-signal-forward',
      term: 'PID 1 与信号转发',
      en: 'PID 1',
      cat: 'docker',
      level: 2,
      oneLine: '容器里的 1 号进程负责接收信号并回收孤儿进程',
      why: '容器启动时指定的那个进程就是容器内的 PID 1。内核对 PID 1 有特殊规则：没有注册处理函数的信号会被忽略，所以应用若不处理 SIGTERM，`docker stop` 只能等到宽限期结束再 SIGKILL（退出码 137），K8s 里表现为优雅下线失败、正在处理的连接被硬断。用 shell 形式的 CMD 还会让信号根本传不到真正的工作进程。',
      confusion: [
        { q: '`CMD node server.js` 和 `CMD ["node","server.js"]` 有区别吗？', a: '有 —— 前者会被包成 `/bin/sh -c "node server.js"`，PID 1 是 sh 而不是 node，`docker stop` 发的 SIGTERM 落在 sh 上且不会转发，只能等超时被强杀；后者（exec 形式）让 node 直接成为 PID 1，才能收到信号并优雅退出。' },
        { q: '`--init` 只是为了收信号吗？', a: '它还负责回收孤儿进程 —— 应用 fork 出的子进程先退出而父进程没 wait 时会产生僵尸进程，挂在 PID 1 名下等它回收。`--init`（tini）同时解决信号转发与僵尸回收两件事。' }
      ],
      related: ['dk-run', 'dk-dockerfile', 'dk-stop', 'dk-kill'],
      lessons: ['dk-exitcode'],
      tags: ['容器', '信号']
    },

    /* ══════════════════ 二、Kubernetes ══════════════════ */

    {
      id: 'k8s-declarative',
      term: '声明式与期望状态',
      en: 'declarative / desired state',
      cat: 'kubernetes',
      level: 1,
      oneLine: '只声明期望状态，由控制器不断把实际状态调谐过去',
      why: '控制器循环持续对比期望状态（spec）与实际状态（status）并采取动作，所以"删掉的 Pod 又回来了""改回去又被人改回来"都是正常现象。理解这点，排查思路就从"手动修"变成"改 spec 或找出是谁在改 spec"，也能解释为什么 `kubectl apply` 是主要入口，而命令式的 `kubectl create` 只在少数场景使用。',
      confusion: [
        { q: '手动 `kubectl edit` 改了副本数，为什么过一会儿又变回去了？', a: '因为期望状态在 Deployment 的 spec 里，多半是 GitOps 工具（ArgoCD、Flux）或 HPA 按 spec 把它改回来了。要永久生效得改源头（Git 仓库或 HPA 的 min/max），否则每次调谐都会被打回。' },
        { q: '`kubectl create` 建出来的资源，之后 `kubectl apply` 能正常接管吗？', a: '能，但语义会变 —— create 不会写 last-applied-configuration 注解，apply 会退化成两方合并，你从 YAML 里删掉的字段不会被清理。团队里统一用 apply（或用 `--server-side`）才能行为一致。' }
      ],
      related: ['k8s-apply', 'k8s-diff', 'k8s-edit', 'k8s-rollout'],
      lessons: [],
      tags: ['Kubernetes', '理念']
    },

    {
      id: 'pod-vs-container',
      term: 'Pod 与容器',
      en: 'Pod',
      cat: 'kubernetes',
      level: 1,
      oneLine: 'Pod 是调度的最小单位，是一组共享网络与存储的容器',
      why: '调度、扩缩容、重建的单位都是 Pod 而不是容器。同一个 Pod 里的容器共享网络命名空间（同一个 IP、端口不能重复），可以共享数据卷，也可以共享 IPC，而且一定被调度到同一个节点上。sidecar 模式之所以成立，以及"两个容器抢 80 端口"在 Pod 内真的会冲突，原因都在这里。',
      confusion: [
        { q: '同一个 Pod 里两个容器能监听同一个端口吗？', a: '不能 —— 它们共享同一个网络命名空间，端口是互斥的。同 Pod 内容器之间用 localhost 互访；不同 Pod 之间要靠 Service。' },
        { q: 'Pod 重启后 IP 会变吗？', a: '会 —— Pod 被删除重建、被 Deployment 滚动替换后都会拿到新 IP，所以不能拿 Pod IP 做服务发现或写进配置。`kubectl get pods -o wide` 里看到的 IP 只在这一次生命周期内有效。' }
      ],
      related: ['k8s-get', 'k8s-describe', 'k8s-exec', 'k8s-troubleshoot-pod'],
      lessons: ['k8s-get-pods', 'k8s-describe'],
      tags: ['Kubernetes', '调度']
    },

    {
      id: 'k8s-probes',
      term: '探针',
      en: 'liveness / readiness / startup probe',
      cat: 'kubernetes',
      level: 2,
      oneLine: 'kubelet 对容器做的三类健康检查：存活、就绪、启动',
      why: '三个探针的后果完全不同：liveness 失败会重启容器，readiness 失败只是把它从 Service 后端摘掉（不重启），startup 失败才会杀容器。生产上最常见的自伤是把慢启动应用的 liveness initialDelaySeconds 设得太小，应用还没起来就被反复杀掉，永远起不来。',
      confusion: [
        { q: 'readiness 探针失败，容器会被重启吗？', a: '不会 —— 它只是把 Pod 的 Ready 条件置为 False 并从 EndpointSlice 里摘掉，流量不再进来，容器本身继续跑。会触发重启的是 liveness 探针。' },
        { q: '探针是 Service 或 Ingress 发起的吗？', a: '都不是 —— 探针由所在节点的 kubelet 直接发起，httpGet 探针访问的是 Pod IP，exec 探针在容器内执行命令。它和网关自己的健康检查是两回事，节点故障时节点上的探针会一起失效。' }
      ],
      related: ['k8s-troubleshoot-pod', 'k8s-describe', 'k8s-pod-status-conditions', 'k8s-troubleshoot-crashloop'],
      lessons: ['k8s-describe'],
      tags: ['Kubernetes', '健康检查']
    },

    {
      id: 'service-endpoints',
      term: 'Service 与 Endpoints',
      en: 'Service / EndpointSlice',
      cat: 'kubernetes',
      level: 2,
      oneLine: 'Service 提供稳定地址，Endpoints 是它背后的 Pod 列表',
      why: 'Service 给出固定的 ClusterIP 与 DNS 名，真正决定"请求发给谁"的是 EndpointSlice（旧版是 Endpoints）——由控制器按 selector 匹配，并且只收录 Ready 的 Pod。所以 Service 不通时第一步不是看 Service 本身，而是看它的后端列表是不是空的：selector 写错、Pod 没过就绪探针都会让列表为空。',
      confusion: [
        { q: '`ping` Service 的 ClusterIP 不通，是不是 Service 坏了？', a: '不是 —— ClusterIP 只是 iptables/IPVS 里的虚拟地址，没有实体网卡、不响应 ICMP，只对 TCP/UDP 做转发。判据是 `kubectl get endpointslices` 有没有后端，以及用 `curl`/`nc` 测真实端口。' },
        { q: '`kubectl get endpoints` 是空的，先查什么？', a: '先比对 Service 的 selector 与 Pod 的 labels 是否匹配，再看目标 Pod 的 READY 是不是 1/1 —— EndpointSlice 只收录通过 readiness 探针的 Pod，探针没过就永远没有后端。' },
        { q: 'Service 的 `port` 和 `targetPort` 有什么区别？', a: '`port` 是 Service 自己对外提供的端口（集群内访问用的），`targetPort` 是流量最终转发到 Pod 上的端口。targetPort 写错就会落到没监听的端口上，表现为连接被拒绝；NodePort 则是在每台节点上额外开的端口。' }
      ],
      related: ['k8s-service', 'k8s-endpointslices', 'k8s-troubleshoot-svc', 'k8s-ingress'],
      lessons: ['k8s-endpoints'],
      tags: ['Kubernetes', '网络']
    },

    {
      id: 'ingress-vs-service',
      term: 'Ingress 与 Service',
      en: 'Ingress vs Service',
      cat: 'kubernetes',
      level: 2,
      oneLine: 'Ingress 是七层 HTTP 路由规则，Service 是四层转发与稳定地址',
      why: 'Ingress 资源本身什么都不做，集群里必须装了 Ingress Controller（nginx-ingress、云厂商的 ELB Ingress 等）才会被翻译成真正的网关配置。Ingress 负责按域名与路径分流、终止 TLS，Service 负责给一组 Pod 一个稳定入口。外网访问不通时，要沿域名解析、网关、Ingress 规则、Service、EndpointSlice、Pod 逐段查。',
      confusion: [
        { q: '创建了 Ingress，域名为什么还是访问不了？', a: '先确认集群里有没有 Ingress Controller，以及它拿没拿到外部地址（`kubectl get ingress` 的 ADDRESS 一栏是不是空的）。没有 controller 时，Ingress 只是一条没人理会的记录。' },
        { q: 'Ingress 能转发 TCP/UDP 吗？', a: 'Ingress 规范只描述 HTTP/HTTPS 路由；四层暴露要用 Service 的 NodePort/LoadBalancer，或者用具体 controller 自带的 TCP 转发配置（各家写法不同，不是标准字段，换 controller 就得重写）。' }
      ],
      related: ['k8s-ingress', 'k8s-service', 'k8s-troubleshoot-svc', 'k8s-get'],
      lessons: ['k8s-endpoints'],
      tags: ['Kubernetes', '网络', 'Ingress']
    },

    {
      id: 'configmap-secret-mount',
      term: 'ConfigMap 与 Secret 挂载',
      en: 'ConfigMap / Secret mount',
      cat: 'kubernetes',
      level: 2,
      oneLine: '把配置与敏感数据从镜像里拆出来，以环境变量或文件形式注入',
      why: '同一个镜像要在多环境跑，靠的就是把配置外置。但两种注入方式行为不同：作为环境变量注入的值在容器创建时就固定了，改 ConfigMap 不会生效，必须重建 Pod；以 volume 挂载的文件会被 kubelet 周期性同步更新（有延迟），而用了 subPath 又不会更新。很多"改了配置没生效"都出在这里。',
      confusion: [
        { q: '改完 ConfigMap，为什么容器里的环境变量没变？', a: '环境变量在容器创建时就写死了，ConfigMap 更新不会改动已运行容器的 env，必须重建 Pod（`kubectl rollout restart`）。只有 volume 挂载方式才会由 kubelet 自动同步。' },
        { q: 'Secret 里的值是 base64，所以算加密吗？', a: '不算 —— base64 只是编码，拿到 YAML 或能读 etcd 的人都能还原。Secret 的价值在于和 ConfigMap 分开做 RBAC、限制可见范围、支持挂载为内存文件系统；真要加密得开 etcd 静态加密或引入外部密钥管理。' },
        { q: '用 subPath 挂载的 ConfigMap 会热更新吗？', a: '不会 —— subPath 挂载不会收到 kubelet 的同步更新（这是已知行为）。需要热更新就别用 subPath；对不支持热加载的程序，还得靠 sidecar 或重建 Pod 触发重载。' }
      ],
      related: ['k8s-configmap', 'k8s-secret', 'k8s-create-configmap', 'k8s-create-secret-generic'],
      lessons: [],
      tags: ['Kubernetes', '配置']
    },

    {
      id: 'pv-pvc-storageclass',
      term: 'PV / PVC / StorageClass',
      en: 'PersistentVolume / PersistentVolumeClaim',
      cat: 'kubernetes',
      level: 2,
      oneLine: 'PV 是集群里的存储资源，PVC 是申请，StorageClass 负责按需创建',
      why: 'Pod 不直接写存储细节，而是通过 PVC 申请容量与访问模式，由 StorageClass 里的 provisioner 去云上创建云盘并绑定。这层间接带来两个常见现场：Pod 一直 Pending 且事件里写着等待 volume 绑定（没有默认 StorageClass 或 SC 名字写错），以及删了 PVC 之后云盘还在继续计费（回收策略是 Retain）。',
      confusion: [
        { q: '`ReadWriteOnce` 是说只能被一个 Pod 挂载吗？', a: '不是 —— 它约束的是节点：同一时刻只能被一个节点挂载读写，而同一个节点上的多个 Pod 是可以同时挂同一块盘的。要多节点同时读写需要 `ReadWriteMany`，能否支持取决于存储后端。' },
        { q: '删掉 PVC，云盘就一定会被删吗？', a: '看回收策略：`Delete` 会连存储一起删除，`Retain` 只把 PV 置为 Released，云盘继续存在并计费。Released 的 PV 因为残留 claimRef 不能直接复用，要手工清理后才能重新绑定。' }
      ],
      related: ['k8s-pvc-pv', 'k8s-storageclass', 'k8s-troubleshoot-pending', 'k8s-get'],
      lessons: [],
      tags: ['Kubernetes', '存储']
    },

    {
      id: 'requests-limits-qos',
      term: 'requests 与 limits',
      en: 'resource requests and limits',
      cat: 'kubernetes',
      level: 2,
      oneLine: 'requests 决定调度与保底，limits 决定运行时的上限',
      why: '调度器只看 requests：按"节点已分配 requests 之和 + 新 Pod 的 requests"判断放不放得下，所以 requests 写小了节点会超卖、写大了 Pod 一直 Pending。limits 是运行时闸门，且两类资源行为不同：CPU 超限只是被限流变慢，内存超限直接 OOMKilled。这套数值还决定 Pod 的 QoS 等级，进而决定节点内存紧张时谁先被驱逐。',
      confusion: [
        { q: '只写 limits 不写 requests，会有什么后果？', a: 'Kubernetes 会把 request 默认成 limit 的值（CPU 与内存都是），于是调度按 limit 算容量，节点装不下那么多 Pod，表现为一堆 Pod Pending。反过来只写 requests 不写 limits，则可能被邻居挤到没资源，甚至把节点内存吃光。' },
        { q: 'CPU 用到 limits 会被杀掉重启吗？', a: '不会 —— CPU 是可压缩资源，超配额只会被 CFS 限流（throttle），表现为延迟升高、限流指标上涨；只有内存这种不可压缩资源超限才会 OOMKilled。把 CPU limits 设得过紧，是"服务没报错但就是慢"的常见原因。' },
        { q: '节点内存紧张时先驱逐哪些 Pod？', a: '按 QoS 等级：BestEffort（所有容器都没设 requests/limits）最先，其次 Burstable，最后才轮到 Guaranteed（每个容器都设了且 requests 等于 limits）。想让核心服务最后被动，就把它配成 Guaranteed 并配合优先级。' }
      ],
      related: ['k8s-top', 'k8s-describe', 'k8s-troubleshoot-pending', 'k8s-hpa', 'k8s-pdb'],
      lessons: ['k8s-top', 'k8s-nodes'],
      tags: ['Kubernetes', '资源', '调度']
    },

    {
      id: 'k8s-scheduling-affinity',
      term: '调度与亲和性',
      en: 'scheduling / affinity / taint',
      cat: 'kubernetes',
      level: 2,
      oneLine: '决定 Pod 能落到哪些节点上的规则集合：选择器、亲和性与污点',
      why: 'nodeSelector 与 nodeAffinity 是 Pod 挑节点，taint 与 toleration 是节点排斥 Pod；调度不成功就停在 Pending，事件里会写清原因（Insufficient cpu、node(s) had taint 等）。生产上用它把 GPU、SSD、特定机型区分开，也用 podAntiAffinity 把同一服务的副本打散到不同节点，避免一个节点挂掉整服务不可用。',
      confusion: [
        { q: '给 Pod 加了 toleration，它就会跑到那个有污点的节点上吗？', a: '不一定 —— toleration 只是"允许"被调度上去（不被污点排斥），并不构成"必须去"。要指定还得加 nodeSelector 或 nodeAffinity；反过来只有 nodeAffinity 而没容忍污点，照样会被挡在门外。' },
        { q: '`kubectl cordon` 会把节点上的 Pod 赶走吗？', a: '不会 —— cordon 只是标记该节点不可再调度，已有 Pod 照常运行。要驱逐得用 `kubectl drain`，而且遇到没有控制器管理的 Pod 或 PDB 不允许时会停下（`--force`、`--ignore-daemonsets` 是显式承担风险）。' }
      ],
      related: ['k8s-affinity-toleration', 'k8s-taint', 'k8s-cordon', 'k8s-drain', 'k8s-troubleshoot-pending'],
      lessons: ['k8s-nodes'],
      tags: ['Kubernetes', '调度']
    },

    {
      id: 'rolling-update-surge',
      term: '滚动更新',
      en: 'rolling update',
      cat: 'kubernetes',
      level: 2,
      oneLine: '用 maxSurge 与 maxUnavailable 控制替换过程中的副本余量',
      why: '默认 25%/25% 意味着更新期间最多临时多出 25% 的 Pod、最多 25% 不可用，这两个数直接决定发布期间的容量与回滚速度。maxUnavailable 设为 0 看着最安全，但如果就绪探针太宽松，新 Pod 刚 Ready 其实还没预热好，流量打进去照样 502；再叠加没有 preStop 的话，旧 Pod 被删时正在处理的请求会断。',
      confusion: [
        { q: '`maxUnavailable: 0` 就一定能做到发布零中断吗？', a: '不能 —— 它只保证旧 Pod 不被提前删，前提是新 Pod 的就绪探针真能反映"可以服务了"。探针只探端口、不探依赖（数据库、缓存）时，流量会在新 Pod 还没准备好时打进来；再配上 preStop 等待与合理的优雅退出时间才完整。' },
        { q: '`kubectl rollout undo` 能把这次发布的影响全部还原吗？', a: '只能还原 Deployment 的 Pod 模板（镜像、环境变量等），它不回滚数据库变更、不恢复 ConfigMap 的旧内容、也动不了已经写进 PVC 的数据。回滚预案必须把数据迁移一起设计。' }
      ],
      related: ['k8s-rollout', 'k8s-set-image', 'k8s-deployment', 'k8s-pdb', 'k8s-troubleshoot-crashloop'],
      lessons: [],
      tags: ['Kubernetes', '发布']
    },

    /* ══════════════════ 三、Helm ══════════════════ */

    {
      id: 'helm-release-values',
      term: 'Helm release',
      en: 'Helm release',
      cat: 'helm',
      level: 2,
      oneLine: 'Helm 把一次安装记成一个 release，用 values 渲染出最终清单',
      why: 'release 是 Helm 的账本：记录这份 chart 用什么 values 渲染出了哪些资源，并以 Secret 的形式存在集群里，`helm history`、`helm rollback`、`helm list` 都建立在这份记录上。排障时如果"集群里的资源"和"chart 渲染出的资源"对不上，往往说明有人绕过 Helm 直接改了集群，下次升级就会被打回或冲突。',
      confusion: [
        { q: '`helm template` 渲染通过，`helm install` 就一定成功吗？', a: '不一定 —— `helm template` 只在本地渲染，不连集群、不做 API 校验；API 版本不存在、字段被 API server 拒绝、CRD 未安装都要到真正提交时才报错。上线前用 `helm install --dry-run` 或 `helm upgrade --dry-run` 才连集群校验。' },
        { q: '`helm rollback` 能把这次发布的影响全部撤销吗？', a: '不能 —— 它只是把目标 revision 的清单重新 apply 一遍（并生成一个新的 revision 号）。数据库 schema 变更、已写入的数据、集群外改过的 DNS 与证书都回不来。' },
        { q: '`helm list` 里看不到某个 release，是它没装吗？', a: '先看命名空间与状态过滤 —— `helm list` 默认只列当前命名空间，且不显示 superseded/uninstalled 这类历史状态；加 `-A`（所有命名空间）和 `-a`（含历史状态）再确认一次。' }
      ],
      related: ['hl-list', 'hl-history', 'hl-rollback', 'hl-template', 'hl-values-files'],
      lessons: ['hl-release-inventory', 'hl-template-before-install'],
      tags: ['Helm', '发布']
    },

    /* ══════════════════ 四、文件系统与存储 ══════════════════ */

    {
      id: 'inode',
      term: 'inode',
      en: 'index node',
      cat: 'linux-storage',
      level: 2,
      oneLine: '文件系统里存放文件元数据的索引节点，每个文件至少占一个',
      why: 'inode 保存权限、大小、时间戳和数据块位置，文件名则放在目录项里。inode 总数在 mkfs 时就基本定死了（`df -i` 看用量），所以"磁盘还剩几百 G 却写不进去、报 No space left on device"最典型的原因就是 inode 被大量小文件耗光：会话文件、邮件队列、缓存碎片、没清理的临时文件。',
      confusion: [
        { q: '磁盘明明还有空间，为什么写文件报 No space left on device？', a: '先看 `df -i` —— 如果 IUse% 到 100%，那是 inode 用尽而不是块用尽，只有删小文件才管用；如果 inode 也够，再查配额（quota）、ext4 给 root 保留的 5% 空间，以及文件系统是不是被重新挂成了只读。' },
        { q: '硬链接会多占一份空间吗？', a: '不会 —— 硬链接只是目录里多了一个指向同一 inode 的名字，`ls -l` 第二列的链接数加一，数据只有一份；删掉其中一个名字，另一个照样能读。软链接才是另一个文件，源文件删掉它就悬空了。' }
      ],
      related: ['ls9-df', 'lb-stat', 'lb-ln', 'lb-find', 'ls9-quota'],
      lessons: ['df-inode', 'basic-free-space'],
      tags: ['文件系统', '存储']
    },

    {
      id: 'ext4-vs-xfs',
      term: 'ext4 与 XFS',
      en: 'ext4 / XFS',
      cat: 'linux-storage',
      level: 2,
      oneLine: '两种主流本地文件系统，扩容缩容能力与配套工具不同',
      why: '选型的实际差别在于"能不能缩、用什么工具、怎么修"：ext4 用 resize2fs 可扩可缩（缩要先卸载），XFS 只能在线扩大（xfs_growfs），完全不支持缩小；检查修复也要先卸载，再分别用 fsck 或 xfs_repair。RHEL/CentOS 7 之后默认 XFS，很多云主机镜像也是 XFS，于是云盘扩容这条路上两者的命令完全不同。',
      confusion: [
        { q: 'XFS 上的 LVM 逻辑卷能缩容吗？', a: '不能 —— `lvreduce` 缩的是块设备，XFS 跟不上，结果是文件系统被截断、数据损坏。LVM 缩容的正确顺序是"先缩文件系统、再缩 LV"，而 XFS 这一步就做不到，所以 XFS 上的 LV 只能扩。' },
        { q: '`xfs_growfs` 的参数是设备名吗？', a: '不是 —— XFS 用挂载点：`xfs_growfs /data`；ext4 的 `resize2fs` 才用设备名：`resize2fs /dev/vg0/lv_data`。两者记混就会出现"命令跑了但容量没变"。' }
      ],
      related: ['ls9-mkfs-ext4', 'ls9-mkfs-xfs', 'ls9-resize2fs', 'ls9-xfs-growfs', 'ls9-fsck'],
      lessons: [],
      tags: ['文件系统', '存储']
    },

    {
      id: 'lvm-pv-vg-lv',
      term: 'LVM',
      en: 'Logical Volume Manager',
      cat: 'linux-storage',
      level: 2,
      oneLine: '把物理磁盘抽象成存储池、再切成逻辑卷的分层管理方式',
      why: 'LVM 的价值是"不用停机就能改容量"：PV 是物理卷（分区或整盘），VG 是卷组（多个 PV 组成的池），LV 是从池里切出来的逻辑卷，文件系统建在 LV 上。云上最常见的运维动作就是数据盘告急：pvresize 认新容量、vgextend 加新盘、lvextend 扩 LV、再扩文件系统，少任何一步 `df` 都不会变。',
      confusion: [
        { q: '`lvextend` 执行成功了，为什么 `df -h` 容量没变？', a: '因为只扩了块设备，文件系统还没扩 —— ext4 要再跑 `resize2fs /dev/vg/lv`，XFS 要 `xfs_growfs /挂载点`。用 `lvextend -r` 可以让它顺带调用对应的扩容工具，省掉这一步。' },
        { q: '`lvextend` 报 insufficient free space，是盘坏了吗？', a: '不是 —— 是卷组里没有空闲的 PE 了（`vgs` 看 VFree 一列）。要先把新盘做成 PV 再 `vgextend` 加入卷组，或者用 `pvresize` 让已有 PV 认到扩容后的容量，然后才能继续扩 LV。' }
      ],
      related: ['ls9-lvm-overview', 'ls9-pvcreate', 'ls9-vgcreate', 'ls9-lvcreate', 'ls9-lvm-extend'],
      lessons: [],
      tags: ['存储', 'LVM']
    },

    {
      id: 'fstab-mount',
      term: '挂载与 /etc/fstab',
      en: 'mount / fstab',
      cat: 'linux-storage',
      level: 2,
      oneLine: '开机自动挂载的配置表，写错会让系统起不来',
      why: 'fstab 的六个字段是设备、挂载点、类型、选项、dump、pass，系统启动时按它挂载；任何一条写错（设备名变了、挂载点不存在、云盘还没挂上）都可能让机器进入 emergency mode，只能从控制台进去救。所以改之前先手工 `mount` 验证、改完用 `mount -a` 演练一遍，是最便宜的自保。',
      confusion: [
        { q: 'fstab 里直接写 `/dev/sdb` 有什么风险？', a: '盘符不牢靠 —— 云主机增删盘、换控制器之后 /dev/sdb 可能指向另一块盘，轻则挂错目录，重则起不来。用 `blkid` 查到的 UUID 或 LABEL 更稳，LVM 则写 /dev/vg/lv 这类稳定路径。' },
        { q: '云盘和 NFS 的条目上为什么要加 `nofail` 与 `_netdev`？', a: '`nofail` 让设备不存在时不要阻断启动（否则云盘没挂上机器就卡在启动阶段），`_netdev` 告诉 systemd 等网络就绪后再挂。把网络存储写进 fstab 却不加这两个选项，是很典型的"重启一次就失联"。' }
      ],
      related: ['ls9-fstab', 'ls9-mount', 'ls9-findmnt', 'ls9-blkid', 'ls9-nfs-client'],
      lessons: [],
      tags: ['存储', '挂载']
    },

    {
      id: 'deleted-but-open-file',
      term: '已删除但仍被占用的文件',
      en: 'deleted but open file',
      cat: 'linux-storage',
      level: 2,
      oneLine: '文件被删除但仍有进程打开时，磁盘空间不会释放',
      why: '`rm` 只是删掉目录项并把链接数减到 0，只要还有进程持有这个文件的描述符，inode 与数据块就不会回收，于是 `df` 显示满、`du` 却怎么算都差一大截。日志文件是重灾区：手工删掉正在写的日志，空间一点没回来，直到服务重启才释放。',
      confusion: [
        { q: '`df` 与 `du` 算出来的占用差很多，一定是有人删了文件没重启吗？', a: '这是最常见的原因但不是唯一 —— 还要排查挂载点被覆盖（有文件被上层挂载遮住，du 看不到却占空间）、稀疏文件、以及 du 跨了别的文件系统。用 `lsof +L1` 或 `lsof | grep deleted` 确认有没有"已删除但仍打开"的文件。' },
        { q: '发现是日志文件后，直接 `rm` 一次就解决了吗？', a: '不解决 —— 进程还开着旧的文件描述符，空间仍不释放。要么让进程重开日志文件（reload 或发信号），要么清空它：`truncate -s 0 /proc/<pid>/fd/<n>`，之后交给 logrotate 管轮转。' }
      ],
      related: ['ln-lsof', 'mo-lsof', 'ls9-du', 'ls9-df', 'mo-log-disk-full'],
      lessons: ['lsof-deleted', 'du-culprit'],
      tags: ['文件系统', '磁盘', '排障']
    },

    {
      id: 'raid-levels',
      term: 'RAID 级别',
      en: 'RAID',
      cat: 'linux-storage',
      level: 3,
      oneLine: '用多块盘组合出冗余与性能的不同级别',
      why: 'RAID 0 只条带没有冗余，RAID 1 镜像，RAID 5 一块校验盘（可用容量 N-1），RAID 6 两块校验（N-2），RAID 10 先镜像再条带。RAID 5/6 每次随机写要读旧数据与校验再重写（写惩罚），重建时要读全盘、耗时数小时且性能骤降，而这段时间再坏一块就整体丢失。',
      confusion: [
        { q: '做了 RAID 5 还需要备份吗？', a: '需要 —— RAID 防的是单块盘物理损坏，防不住误删、勒索加密、控制器或机箱故障，也防不住手滑的 mkfs。它和备份解决的是两类不同问题，不能互相替代。' },
        { q: 'RAID 5 的可用容量是全部盘之和吗？', a: '不是 —— 是 (N-1) 块盘的容量，少掉的那块被校验占用（RAID 6 是 N-2）。另外软 RAID 的重建进度要看 `cat /proc/mdstat` 里的 recovery/resync 百分比，别只看 State 一行写着 active 就放心。' }
      ],
      related: ['ls9-mdadm', 'ls9-mdstat', 'ls9-smartctl', 'ls9-iostat'],
      lessons: [],
      tags: ['存储', 'RAID', '可靠性']
    },

    {
      id: 'nfs-vs-local-disk',
      term: 'NFS',
      en: 'Network File System',
      cat: 'linux-storage',
      level: 2,
      oneLine: '通过网络访问的文件系统，语义与性能都和本地盘不同',
      why: 'NFS 把 open/read/write 变成网络请求，所以小文件与元数据密集的操作（编译、大量 stat）会明显变慢；权限上常见的 root_squash 会把 root 映射成匿名用户，导致"文件是 root 建的却写不进去"；属性缓存又会让客户端短时间看到旧内容。服务端不可达时，默认 hard 挂载会让访问该目录的进程进入 D 状态卡死，`df` 和 `ls` 一起挂住。',
      confusion: [
        { q: 'NFS 目录下 `ls` 很快但程序读写很慢，是带宽不够吗？', a: '通常不是带宽而是时延与元数据 —— 每次 open/stat 都是一次网络往返，成千上万次小操作累积起来就很慢。`nfsstat -c`、mountstats 看的是 RPC 次数与重传，`iperf3` 测的是带宽，两者要分开看。' },
        { q: 'NFS 服务端挂了，客户端 `ls` 卡住是正常的吗？', a: '在默认 hard 挂载下是正常的 —— 客户端会无限重试，相关进程进入不可中断睡眠（D 状态），连 kill 都杀不掉。要么等服务恢复，要么在挂载时按需选 soft 与超时（soft 可能带来数据不一致风险），强制 umount 要谨慎。' }
      ],
      related: ['ls9-nfs-client', 'ls9-nfs-server', 'ls9-mount', 'ls9-fstab', 'ls9-findmnt'],
      lessons: [],
      tags: ['存储', '网络文件系统']
    },

    {
      id: 'cloud-disk-replica-iops',
      term: '云盘多副本与 IOPS',
      en: 'cloud disk / IOPS',
      cat: 'linux-storage',
      level: 2,
      oneLine: '云硬盘由存储侧多副本承载，性能按规格封顶',
      why: '云硬盘的数据在存储集群里有多份副本，坏一块硬件对使用者无感；代价是每次 IO 都要经过网络存储，所以性能有明确上限（IOPS 与吞吐由盘类型和容量决定），超过之后表现为时延陡增而不是报错。数据库、Elasticsearch 这类随机 IO 密集的服务，上线前应该在同类盘上用 fio 压一遍，而不是等业务高峰才发现。',
      confusion: [
        { q: '云盘有多副本，是不是就不用做快照和备份了？', a: '不是 —— 多副本防的是存储硬件故障，而误删除、误格式化、勒索加密、写错数据会同样作用于所有副本。快照/备份解决的是"数据被改错了怎么退回去"，两者不能互相替代。' },
        { q: '把云盘容量扩了，为什么 `df` 还是原来的数字？', a: '扩容只改了块设备的大小，还要扩分区（growpart）和文件系统（resize2fs 或 xfs_growfs）。少任何一步，`lsblk` 看到的盘变大了而 `df` 纹丝不动。' }
      ],
      related: ['hw-evs-list', 'hw-evs-create', 'hw-evs-resize-growpart', 'ls9-fio', 'ls9-growpart'],
      lessons: [],
      tags: ['云', '存储', '性能']
    },

    {
      id: 'hard-vs-soft-link',
      term: '硬链接与软链接',
      en: 'hard link / symbolic link',
      cat: 'linux-basic',
      level: 2,
      oneLine: '硬链接是同一 inode 的另一个名字，软链接是存路径的独立文件',
      why: '两者的差别决定了删除、打包、部署的影响面：硬链接与原文件是同一个 inode，删掉一个名字数据还在，但不能跨文件系统，普通用户也不能给目录建；软链接是个独立的小文件，内容只是目标路径，可以跨文件系统、也可以指向不存在的路径，但源文件一删就悬空。发布目录用 current 软链接指向 releases/日期 就是靠这个特性做版本切换与回滚。',
      confusion: [
        { q: '`ln -s app/config.yml config.yml` 换个目录执行会怎样？', a: '第一个参数若是相对路径，会被原样存下来并相对于链接所在目录解析 —— 链接一挪位置就指错。做软链接时最稳的是写绝对路径，或者先进入链接要放的目录再创建。' },
        { q: '`cp` 一个软链接会复制什么？', a: '默认复制的是链接指向的目标内容（解引用），`cp -d`（或被 `-a` 包含）才保留链接本身。备份和同步目录时只写了 `-r` 而没带 `-a`，软链接会变成实打实的文件副本，体积和语义都变了。' }
      ],
      related: ['lb-ln', 'lb-stat', 'lb-readlink', 'lb-realpath', 'lb-cp'],
      lessons: ['ls-long', 'basic-perm-tree'],
      tags: ['文件系统', 'Linux 基础']
    },

    /* ══════════════════ 五、网络 ══════════════════ */

    {
      id: 'nat-port-mapping',
      term: 'NAT 与端口映射',
      en: 'network address translation',
      cat: 'linux-net',
      level: 2,
      oneLine: '转发时改写源或目的地址端口的机制，端口映射靠它实现',
      why: '`docker run -p 8080:80` 背后是宿主机 netfilter 上的 DNAT 规则，容器出网靠 SNAT/MASQUERADE；云上的 NAT 网关同理，让一批没有公网 IP 的机器共享一条出口。NAT 依赖连接跟踪表（conntrack）记录每条连接，表被打满时会直接丢包，表现为"莫名其妙就连不上"，所以要把它纳入容量与监控。',
      confusion: [
        { q: '容器里访问宿主机的公网 IP:8080，为什么不通？', a: '常见原因是回环路径（hairpin NAT）没有生效 —— 从容器出去绕到公网再回到同一台宿主机时，回包路径与规则不匹配。稳妥做法是让容器直接访问宿主机的内网地址或网关地址，或者显式配置 hairpin 规则。' },
        { q: '`-p 8080:80` 与 `-p 127.0.0.1:8080:80` 有区别吗？', a: '有 —— 前者绑定在所有网卡上（外网可达，而且会绕过 ufw 之类的默认策略），后者只绑定回环、仅本机可访问。只想让本机 Nginx 反代访问容器时，必须显式写绑定地址。' }
      ],
      related: ['dk-run', 'dk-network-modes', 'ln-iptables', 'ln-ip-route', 'hw-ecs-eip-bind'],
      lessons: ['dk-inspect-net'],
      tags: ['网络', 'NAT', '容器']
    },

    {
      id: 'iptables-vs-nftables',
      term: 'iptables 与 nftables',
      en: 'iptables / nftables',
      cat: 'linux-net',
      level: 2,
      oneLine: 'netfilter 的两套用户态配置工具，规则模型与持久化都不同',
      why: 'iptables 按"表 + 链"组织规则，从上往下匹配、命中即生效；nftables 是新一代实现，统一了 iptables/ip6tables/arptables/ebtables 的语法并支持集合与映射。很多发行版上的 iptables 命令其实已经是指向 nft 后端的兼容层，所以"用哪条命令查、看到的是不是同一份规则"取决于后端，这是最容易看错的地方。',
      confusion: [
        { q: '在开着 firewalld 的机器上直接写 iptables 规则，重启后还在吗？', a: '不保证 —— 手工规则不在 firewalld 的管理范围内，reload 或重启后可能丢失或被覆盖（firewalld 会重建自己的链）。要持久化得用 iptables-services/netfilter-persistent 保存，或者干脆统一走 firewalld/nftables 一套。' },
        { q: '防火墙里没放通 8080，容器却还能从外面访问，为什么？', a: '因为 Docker 会把自己管理的规则插到 filter 表更靠前的位置（并在 nat 表做完 DNAT），绕过你手写的过滤链。要限制容器端口，应该在 `-p` 的绑定地址、Docker 的 iptables 开关或云上的安全组上做文章。' }
      ],
      related: ['ln-iptables', 'ln-nft', 'ln-firewall-cmd', 'ln-iptables-save', 'ln-ipset'],
      lessons: [],
      tags: ['网络', '防火墙']
    },

    {
      id: 'dns-resolution-order',
      term: 'DNS 解析顺序',
      en: 'name resolution order',
      cat: 'linux-net',
      level: 2,
      oneLine: '程序解析域名时先查 hosts 再问 DNS，顺序由 nsswitch 决定',
      why: 'glibc 的解析顺序写在 /etc/nsswitch.conf 的 hosts 行（默认 files dns），也就是先查 /etc/hosts，再按 /etc/resolv.conf 里的 nameserver 递归查询。容器里 Docker 会替换 /etc/resolv.conf（自定义网络下用内置的 127.0.0.11）并往 /etc/hosts 注入容器名。排查"域名解析不对"必须按这个顺序走一遍，否则会在错误的地方找原因。',
      confusion: [
        { q: '`dig` 能解析出来，为什么应用还是报 unknown host？', a: '两者走的不是同一条路 —— `dig`/`nslookup` 直接查 DNS 服务器，而应用的 getaddrinfo 先看 /etc/hosts 与 nsswitch 配置。反过来，/etc/hosts 里写死的记录 `dig` 永远查不到。要确认"应用实际会解析成什么"，用 `getent hosts 域名`。' },
        { q: 'K8s 里解析外部域名特别慢，是 CoreDNS 坏了吗？', a: '更常见的是 search 域造成的放大 —— Pod 的 /etc/resolv.conf 默认 ndots:5 加多个 search 后缀，像 api.example.com 这种名字会先被拼成 api.example.com.svc.cluster.local 之类逐个试过才查原名。用末尾带点的 FQDN 或调整 ndots 可以规避。' }
      ],
      related: ['ln-resolv-conf', 'ln-hosts-file', 'ln-dig', 'ln-nslookup', 'lu-getent', 'k8s-exec-dns', 'ln-troubleshoot-dns'],
      lessons: [],
      tags: ['网络', 'DNS']
    },

    {
      id: 'tcp-timewait',
      term: '三次握手与 TIME_WAIT',
      en: 'three-way handshake / TIME_WAIT',
      cat: 'linux-net',
      level: 2,
      oneLine: '建连要三次握手，主动关闭连接的一方会进入 TIME_WAIT 等待',
      why: 'TIME_WAIT 的作用是让最后的 ACK 有机会重传、并让旧连接的延迟报文在网络里失效，Linux 上固定持续 2MSL（60 秒）。它是主动关闭方的正常状态，本身不代表故障；真正会出问题的是客户端侧：高并发短连接把本地端口耗光（可用端口约 2.8 万个），新连接报 cannot assign requested address。',
      confusion: [
        { q: '服务器上看到成千上万个 TIME_WAIT，要赶紧调内核参数吗？', a: '先分清角色 —— 服务端通常是被动关闭方，出现大量 TIME_WAIT 说明是服务器主动关的连接（短连接、没开 keepalive 或应用主动 close）。该改的是连接复用（keepalive、连接池），而不是先动内核参数。' },
        { q: '`net.ipv4.tcp_tw_reuse = 1` 是万能的吗？', a: '不是 —— 它只对主动发起连接的一方（客户端）复用自己的 TIME_WAIT 端口生效，还需要时间戳支持；服务端被动关闭产生的 TIME_WAIT 不受它影响。而同类的 `tcp_tw_recycle` 会误伤 NAT 后的客户端，已在 Linux 4.12 被移除，看到老文档推荐它就别照做。' }
      ],
      related: ['ln-ss', 'pf-tcp-tw-reuse', 'pf-ss-summary', 'pf-sysctl', 'ln-tcpdump'],
      lessons: ['ss-listen'],
      tags: ['网络', 'TCP', '性能']
    },

    {
      id: 'mtu-mss',
      term: 'MTU 与 MSS',
      en: 'maximum transmission unit',
      cat: 'linux-net',
      level: 3,
      oneLine: '链路层单包最大长度，以及 TCP 由此推出的报文段上限',
      why: '以太网 MTU 是 1500，减去 IP 头 20 与 TCP 头 20，MSS 是 1460。路径 MTU 发现依赖 ICMP 的"需要分片"消息，一旦 ICMP 被防火墙挡掉，就会出现"能 ping 通、能建连、一发大数据就卡住"的经典故障；隧道（VXLAN、IPsec、GRE）还会额外占掉头部字节，所以跨隧道传输要把 MTU 调小。',
      confusion: [
        { q: '`ping -M do -s 1472 目标` 通了说明什么？', a: '说明这条路径的 MTU 至少有 1500 —— 1472 是数据部分，加上 8 字节 ICMP 头与 20 字节 IP 头正好 1500。要验证更小的 MTU 就逐步减小 -s，收到 Frag needed 或超时说明超了。' },
        { q: 'SSH 能连上、小请求正常，一传大文件就断，是带宽问题吗？', a: '更像 MTU 问题 —— 小包不需要分片所以能过，大包被丢弃或分片失败。这时要看路径上有没有隧道、有没有设备挡了 ICMP，并在两端把 MTU/MSS 调小，或让防火墙放通 ICMP 的 type 3 code 4。' }
      ],
      related: ['ln-ip-link', 'ln-ping', 'pf-ping-mtu', 'ln-tcpdump', 'ln-ip-route', 'ln-troubleshoot-slow'],
      lessons: [],
      tags: ['网络', 'TCP', '排障']
    },

    {
      id: 'refused-vs-timeout',
      term: '连接被拒绝与超时',
      en: 'connection refused vs timed out',
      cat: 'linux-net',
      level: 2,
      oneLine: '被拒绝说明收到了 RST，超时说明包被丢弃或没有回程',
      why: '这两个报错把排查方向直接分成两半：refused 说明网络是通的、包到达了目标主机，只是那个端口没有进程在听（或被显式 REJECT）；timed out 说明 SYN 没得到任何回应，问题在路由、安全组/防火墙 DROP 或目标根本不存在。分不清就会在"服务没起"和"网络不通"之间来回猜，白白耗掉大量时间。',
      confusion: [
        { q: '连接一直卡住最后超时，是不是对方服务没启动？', a: '恰恰相反 —— 服务没监听会立刻回 RST 报 refused。超时意味着 SYN 被丢弃：安全组没放通、防火墙 DROP、路由不可达，或目标机器已关机（云上关机后 IP 可能被回收）。判据是 `nc -vz` 的返回速度，以及 `tcpdump` 有没有看到回包。' },
        { q: '服务监听在 127.0.0.1:8080，从别的机器访问会是什么现象？', a: '包能到达主机但匹配不到监听套接字，内核回 RST，客户端报 connection refused —— 看起来像"服务没起"，其实是监听地址绑错了（应用配置里绑了回环）。先在内网用 `ss -lntp` 看监听地址是 0.0.0.0 还是 127.0.0.1。' }
      ],
      related: ['ln-troubleshoot-connect-refused', 'ln-telnet', 'ln-nc', 'ln-ss', 'ln-tcpdump', 'hw-vpc-troubleshoot-port'],
      lessons: [],
      tags: ['网络', '排障', 'TCP']
    },

    /* ══════════════════ 六、云平台 ══════════════════ */

    {
      id: 'vpc-route-peering',
      term: 'VPC 路由与对等连接',
      en: 'VPC route table / peering',
      cat: 'cloud-cli',
      level: 3,
      oneLine: 'VPC 内靠路由表决定去向，对等连接打通两个 VPC 但不传递路由',
      why: '同一个 VPC 的子网之间默认通过本地路由互通，出公网要 NAT 网关或 EIP，跨 VPC 要建对等连接并在两端路由表里各加一条指向对方的条目。对等连接不传递路由（A-B、B-C 对等不会让 A 访问 C），跨账号还要两端都接受。云上"安全组明明放通了却还是不通"，多数时候卡在路由表这一步。',
      confusion: [
        { q: '对等连接创建成功，为什么还是 ping 不通对方？', a: '按顺序查三件事：两端路由表是否都加了指向对方网段的路由（只加一端无效）、两端安全组是否都放通了对方网段、以及实例的子网是不是就是要打通的那个。对等连接只提供"可达的路由"，不代替安全策略。' },
        { q: '两个 VPC 对等之后，其中一个的 NAT 网关能让另一个 VPC 出公网吗？', a: '不能 —— 对等连接只打通两个 VPC 之间的路由，不传递默认路由，也不传递 NAT 能力。要让多个 VPC 共享出口，需要企业路由器/云连接这类中转方案。' }
      ],
      related: ['hw-vpc-list', 'hw-vpc-create', 'hw-vpc-troubleshoot-port', 'hw-ecs-eip-bind', 'ln-ip-route'],
      lessons: [],
      tags: ['云', '网络', 'VPC']
    },

    {
      id: 'security-group-vs-acl',
      term: '安全组与网络 ACL',
      en: 'security group vs network ACL',
      cat: 'cloud-cli',
      level: 2,
      oneLine: '安全组作用于实例且有状态，网络 ACL 作用于子网且无状态',
      why: '安全组是实例/网卡级别的白名单，只支持允许规则，而且有状态：放通入方向后，这条连接的返回流量会自动放行，不用再配出方向。网络 ACL 是子网级别的，支持允许与拒绝、按编号顺序匹配，但无状态 —— 出方向也要显式放通，包括返回流量用的临时端口。两类规则用混，就会出现"看着全放通了却连不上"。',
      confusion: [
        { q: '安全组放通了 3306，为什么数据库还是连不上？', a: '安全组要两端都确认：客户端所在实例的入/出方向、数据库实例的入方向是否放通了对应网段（出方向默认全通，但被改过就要查）。再往下查子网 ACL、路由表，以及数据库自身的 bind-address 与账号授权的 host 限制。' },
        { q: '想封掉某个恶意 IP，写在安全组里行吗？', a: '通常不行 —— 安全组只支持允许规则（白名单语义），拒绝类需求要靠网络 ACL 的拒绝规则、WAF 或主机防火墙。这也是"安全组能不能做黑名单"的标准答案。' }
      ],
      related: ['hw-vpc-sg-list', 'hw-vpc-sg-rule', 'hw-vpc-troubleshoot-port', 'sec-sg-minimal'],
      lessons: ['hw-sg-3306'],
      tags: ['云', '安全', '网络']
    },

    {
      id: 'region-vs-az',
      term: '区域与可用区',
      en: 'region / availability zone',
      cat: 'cloud-cli',
      level: 1,
      oneLine: '区域是地理上的数据中心集群，可用区是区域内独立的故障域',
      why: 'Region 之间内网不通（要靠 EIP 或云连接），AZ 之间内网互通但时延更高；云盘只能在同一个 AZ 内挂载，跨 AZ 要先复制快照；CLI 与 SDK 都要指定 region 以匹配 endpoint，region 传错会报资源不存在（而不是权限错误）。做高可用时，把主备放在不同 AZ 才有意义。',
      confusion: [
        { q: '同 Region 不同 AZ 的 ECS 与云盘能直接挂载吗？', a: '不能 —— 云硬盘是 AZ 级资源，只能挂到同一 AZ 的实例上。跨 AZ 使用要先在目标 AZ 用快照创建新盘，或者改用支持跨 AZ 的共享存储。' },
        { q: '命令行报"资源不存在"，第一反应是权限不够吗？', a: '先核对 region 与 endpoint 是否匹配 —— 同一个 API 在不同 region 的 endpoint 不同，region 写错时查的是另一个区域，自然什么都查不到。华为云 CLI 的 profile、AWS 的 `--region` 都是干这件事的。' }
      ],
      related: ['hw-ecs-az-flavor', 'hw-cross-region-endpoint', 'hw-evs-create', 'hw-ims-list-images'],
      lessons: ['hw-cli-profile'],
      tags: ['云', '架构']
    },

    {
      id: 'aksk-vs-iam-agency',
      term: 'AK/SK 与 IAM 委托',
      en: 'access key / IAM agency',
      cat: 'cloud-cli',
      level: 2,
      oneLine: 'AK/SK 是长期 API 凭证，委托是发给服务或账号的临时授权',
      why: 'AK/SK 是长期有效的签名凭证，一旦写进代码、镜像或 CI 变量就等于长期泄露；委托（Agency）让云服务或其他账号在需要时换取临时凭证（有有效期、自动轮换），ECS 上的实例委托就是让应用不落地任何长期密钥的标准做法。安全事件里最常见的一条，就是 AK/SK 被提交进了 Git 仓库。',
      confusion: [
        { q: 'AK/SK 泄露后，改账号密码有用吗？', a: '没用 —— 密码和 AK 是两套凭证。处置顺序是：停用或删除泄露的 AK、查该 AK 最近的审计与创建的资源、换上新的最小权限凭证、收敛授权范围。删掉代码里的那行字符串只是最后一步。' },
        { q: '创建了 IAM 子用户，它就能用了吗？', a: '默认什么权限都没有 —— 需要显式授权（挂策略或加入用户组）。所以"新建子用户调 API 报 403"是预期行为，不是配置坏了；反过来给子用户挂 Administrator，等于把长期全权凭证又发了一份。' }
      ],
      related: ['hw-iam-user', 'hw-iam-agency', 'hw-iam-aksk-leak', 'sec-aksk-leak', 'hw-cross-aksk-best-practice'],
      lessons: [],
      tags: ['云', '安全', 'IAM']
    },

    {
      id: 'eip-bandwidth-billing',
      term: '弹性公网 IP',
      en: 'elastic IP',
      cat: 'cloud-cli',
      level: 2,
      oneLine: '可以独立持有的公网 IP，带宽可选固定或按流量计费',
      why: 'EIP 与实例解绑后仍然可以保留，也仍然可能计费；按需实例的带宽有"按带宽"和"按流量"两种互斥的计费方式，选错了账单差别很大：稳定高带宽的服务按带宽划算，低峰值的按流量可能更省，但被刷流量时按流量会失控。内网机器想访问公网又不想各自持有公网 IP，就用 NAT 网关共享出口。',
      confusion: [
        { q: 'EIP 没绑定到任何实例，就不收费吗？', a: '多数云上未绑定的 EIP 仍会收保有/闲置费用（按需计费尤其如此）。做成本排查时，要把"闲置 EIP"和"未挂载云盘"一起列出来，用完就释放，别留在账号里。' },
        { q: '一台 ECS 没有 EIP，能主动访问公网吗？', a: '不能直接访问 —— 要么绑定 EIP，要么把子网路由指向 NAT 网关（多台共享出口）。反过来，有 EIP 也不代表外面能进来，入方向还要看安全组。' }
      ],
      related: ['hw-ecs-eip-bind', 'hw-flow-cost-idle', 'hw-vpc-create', 'hw-ecs-list'],
      lessons: ['hw-ecs-inventory'],
      tags: ['云', '计费', '网络']
    },

    {
      id: 'obs-vs-block-storage',
      term: '对象存储与块存储',
      en: 'object storage vs block storage',
      cat: 'cloud-cli',
      level: 2,
      oneLine: '对象存储按 key 存取整个对象，块存储挂载成盘支持随机读写',
      why: 'OBS/S3 这类对象存储走 HTTP API，命名空间是扁平的（用前缀模拟目录），按对象整体读写（改一个字节也要重传整个对象），适合静态资源、备份归档、大数据输入输出；云硬盘这类块存储挂载成设备、建文件系统，支持随机读写与文件锁，适合数据库与有状态服务。把对象存储当盘用是选型阶段最常见的错。',
      confusion: [
        { q: '把对象存储用 POSIX 客户端挂载成目录，能跑数据库吗？', a: '不适合 —— 每次操作都要走 HTTP，时延比本地盘高几个数量级，文件锁、随机写、rename 语义也都弱。对象存储适合的是"读多写少、整对象替换"的场景，数据库请用块存储。' },
        { q: '上传一个几百 G 的文件，一条命令直接传上去就行吗？', a: '大文件要用分片与断点续传参数（obsutil 的 -threshold、-p、-cpd 之类），单流容易超时且失败要重头来。另外 `obsutil` 与 `hcloud OBS` 是两套不同的工具，参数与配置不能混用。' }
      ],
      related: ['hw-obs-bucket', 'hw-obs-put-object', 'hw-obsutil-cp', 'hw-obsutil-restore-resume', 'hw-evs-create', 'hw-obs-vs-obsutil'],
      lessons: ['hw-obs-publish'],
      tags: ['云', '存储']
    },

    /* ══════════════════ 七、中间件与架构 ══════════════════ */

    {
      id: 'l4-vs-l7-lb',
      term: '四层与七层负载均衡',
      en: 'L4 vs L7 load balancing',
      cat: 'middleware',
      level: 2,
      oneLine: '四层按连接转发，七层解析 HTTP 后按域名与路径转发',
      why: '四层（TCP/UDP）只看地址端口，性能高、协议无关，但后端只能拿到网关的地址；七层（HTTP/HTTPS）能终止 TLS、按域名/路径/Header 路由、改写请求头，因此能做灰度与 A/B。代价是多一次解析与连接终止，证书、超时、缓冲区这些参数都要单独调，健康检查的方式也不一样。',
      confusion: [
        { q: '七层负载均衡后面，后端拿到的客户端 IP 是什么？', a: '是负载均衡器的地址 —— 真实客户端 IP 在 X-Forwarded-For 头里，需要应用或框架显式解析，而且不能无条件信任（否则可被伪造）。四层转发可以用 PROXY protocol 或透明代理把源地址带过去，但后端也得支持。' },
        { q: '健康检查都是"能连上就算健康"吗？', a: '四层通常只能探端口（TCP 握手成功即认为健康），七层可以探指定的 HTTP 路径并校验状态码与响应内容。所以"端口通但接口全 500"时，四层后端仍会被判健康并继续接流量，这是排查时容易看错的一环。' }
      ],
      related: ['hw-elb-list', 'hw-elb-create-listener', 'hw-elb-health-check', 'mw-nginx-upstream', 'mw-haproxy-config', 'mw-nginx-proxy-pass'],
      lessons: [],
      tags: ['负载均衡', '网络']
    },

    {
      id: 'connection-pool',
      term: '连接池',
      en: 'connection pool',
      cat: 'middleware',
      level: 2,
      oneLine: '预先建立并复用连接，避免每次请求都重新握手与认证',
      why: '建立连接要三次握手、认证、后端分配资源，连接池把这些成本摊掉，同时给后端一个可控的并发上限。但池不是越大越好：池的总量要与数据库的承载能力匹配，应用线程数与池大小的乘积关系也要算清楚，否则会出现"获取连接超时"和数据库"too many connections"这两种方向相反的故障。',
      confusion: [
        { q: '把连接池调大，接口就会更快吗？', a: '往往更慢 —— 数据库并发执行能力有限，连接数超过它能有效处理的量后，多出来的连接只是在争锁与做上下文切换。经验起点是"CPU 核数 × 2 + 磁盘数"这个量级，再按压测结果调，而不是随手写 200。' },
        { q: '数据库里看到几十个 Sleep 连接，是连接泄漏吗？', a: 'Sleep 是空闲连接，是池正常保留的，不一定是问题。要判断泄漏，看连接数是否随时间单调增长、以及应用池的活跃数与数据库 Threads_connected 的趋势差；长事务导致的连接占用则要看 processlist 里 Time 很大的那些。' }
      ],
      related: ['db-mysql-connect-timeout', 'db-mysql-processlist', 'mw-nginx-upstream', 'mw-tomcat-serverxml', 'pf-ulimit-n'],
      lessons: ['db-mysql-params'],
      tags: ['数据库', '性能', '架构']
    },

    /* ══════════════════ 八、数据库与缓存 ══════════════════ */

    {
      id: 'bplus-index-leftmost',
      term: 'B+ 树索引与最左前缀',
      en: 'B+ tree index / leftmost prefix',
      cat: 'db-cache',
      level: 2,
      oneLine: 'InnoDB 用 B+ 树组织索引，联合索引按最左前缀匹配',
      why: 'InnoDB 的主键索引（聚簇索引）叶子节点直接存整行数据，二级索引叶子只存主键值，所以走二级索引查到主键后还要回表再查一次（除非索引里已经包含所需字段，即覆盖索引）。联合索引只有在条件从最左列开始连续匹配时才能用于定位，这一点直接决定一条慢查询能不能救回来。',
      confusion: [
        { q: '建了 (a,b,c) 联合索引，`where b=1 and c=2` 能走索引吗？', a: '不能用于定位 —— 不满足最左前缀，只能全表扫或走别的索引。要么把 b 放到最左重建索引，要么为这组条件单独建一个，要么设计成覆盖索引让它至少能走索引扫描、少回表。' },
        { q: '`explain` 的 key 有值，就说明这条 SQL 没问题了吗？', a: '不一定 —— 还要看 type（ALL/index 全扫与 range/ref 差别很大）、rows（优化器的估算行数，不是真实值）、filtered 与 Extra（Using filesort、Using temporary 往往才是真正慢的原因）。要看真实行数与耗时，用 `EXPLAIN ANALYZE`。' },
        { q: '在索引列上套函数会怎样？', a: '`where date(created_at) = ...` 这类写法无法用索引定位，只能扫；字符串列传数字这种隐式类型转换也是同样后果。8.0 可以建函数索引，或者把条件改写成范围查询（created_at >= ... and created_at < ...）。' }
      ],
      related: ['db-mysql-explain', 'db-mysql-information-schema', 'db-mysql-slowlog', 'db-mysql-optimize-table'],
      lessons: ['db-mysql-slow-query'],
      tags: ['MySQL', '索引', '性能']
    },

    {
      id: 'isolation-mvcc',
      term: '事务隔离级别与 MVCC',
      en: 'isolation level / MVCC',
      cat: 'db-cache',
      level: 3,
      oneLine: 'InnoDB 用 undo 与读视图实现快照读，隔离级别决定读视图的时机',
      why: '普通 SELECT 是快照读，不加锁，读的是事务开始（RR）或语句开始（RC）时的可见版本；UPDATE、DELETE 与 SELECT ... FOR UPDATE 是当前读，读最新已提交版本并加锁。掌握这个二分法，才能解释"为什么同一事务里前后两次查询结果不同""为什么我没改这行却被阻塞"。',
      confusion: [
        { q: 'REPEATABLE READ 下，一个事务里两次 SELECT 的结果一定一样吗？', a: '只对快照读成立 —— 如果第二次用了 `SELECT ... FOR UPDATE` 或 `LOCK IN SHARE MODE`（当前读），它会看到别的事务已经提交的最新数据，结果可能不同。RR 保证的是快照读的一致性，不是"事务内一切都冻结"。' },
        { q: 'RR 是靠加锁实现的吗？', a: '不是 —— 快照读靠 MVCC（undo 版本链加读视图），完全不加锁；只有当前读与写入才加行锁/间隙锁。RR 下的间隙锁（next-key lock）用于阻止其他事务在范围内插入，这也是"没动这行却被阻塞"的常见原因。' },
        { q: 'MySQL 的默认隔离级别是 RC 吗？', a: '不是 —— InnoDB 默认是 REPEATABLE READ（多数其他数据库默认 READ COMMITTED），临时改是 `SET SESSION TRANSACTION ISOLATION LEVEL`，只改 GLOBAL 不会影响已经建立的连接。' }
      ],
      related: ['db-mysql-processlist', 'db-mysql-innodb-status', 'db-mysql-explain'],
      lessons: ['db-mysql-params'],
      tags: ['MySQL', '事务']
    },

    {
      id: 'replication-lag',
      term: '主从复制延迟',
      en: 'replication lag',
      cat: 'db-cache',
      level: 2,
      oneLine: '从库重放主库日志存在时间差，延迟指标本身并不可靠',
      why: 'MySQL 复制默认是异步的（半同步也只是等至少一个从库确认收到），从库的 SQL 线程重放 relay log 需要时间，大事务、DDL、单线程重放、从库硬件弱都会放大延迟。业务上表现为"刚写入的数据立刻从库读不到"，所以写后读必须走主库或做会话粘滞，而监控延迟的指标本身还有几个坑。',
      confusion: [
        { q: '`Seconds_Behind_Master = 0` 就说明没有延迟吗？', a: '不代表 —— 这个值算的是"从库当前时间减去正在重放事件的时间戳"，SQL 线程空闲时它可能就是 0，即便主库刚提交的事务还没传到从库。更可靠的是比对 GTID/位点差，或在业务侧写入后立刻读一次从库做验证。' },
        { q: '主从延迟大，多加几个从库能解决吗？', a: '不一定 —— 根因常常是"单线程重放跟不上主库的并发写入"，先看有没有开并行复制、从库磁盘能不能扛住；无脑加从库不会让每个从库变快，还会加重主库分发 binlog 的负担。' }
      ],
      related: ['db-mysql-show-replica-status', 'db-mysql-replication-lag', 'db-mysql-change-replication-source', 'db-mysql-mysqldump'],
      lessons: ['db-mysql-replica-broken'],
      tags: ['MySQL', '复制', '高可用']
    },

    {
      id: 'slow-query-explain',
      term: '慢查询与执行计划',
      en: 'slow query log / execution plan',
      cat: 'db-cache',
      level: 2,
      oneLine: '慢查询日志负责发现问题，执行计划负责解释为什么慢',
      why: '慢查询日志按 long_query_time 记录超过阈值的语句，用 mysqldumpslow 或 pt-query-digest 聚合之后才知道该优化谁；单条语句为什么慢则要看执行计划（访问类型、用到的键、预估行数、Extra）。两者要配合：只看日志会淹没在个别慢语句里，只看执行计划会漏掉"执行次数极多、单次不慢"的语句。',
      confusion: [
        { q: '优化慢查询该先看"最慢的那条"还是"总耗时最高的那条"？', a: '先看总耗时（调用次数乘以平均耗时）—— 一条 100ms 但每秒执行 500 次的语句，对系统的伤害远大于一天跑一次的 10s 报表。pt-query-digest 默认就是按总耗时排序。' },
        { q: '`EXPLAIN` 里的 rows 是真实扫描行数吗？', a: '不是 —— 那是优化器的估算值，可能差很多。要看真实行数与各阶段耗时得用 `EXPLAIN ANALYZE`（它会真正执行语句）。另外把 long_query_time 设成 0 可以记录所有语句，但只适合短时间排查，长期开着会带来额外 IO。' }
      ],
      related: ['db-mysql-slowlog', 'db-mysql-explain', 'db-mysql-pt-query-digest', 'db-mysql-information-schema'],
      lessons: ['db-mysql-slow-query'],
      tags: ['MySQL', '性能', '排障']
    },

    {
      id: 'redis-single-thread',
      term: 'Redis 单线程',
      en: 'single-threaded',
      cat: 'db-cache',
      level: 2,
      oneLine: 'Redis 用单线程执行命令，一条慢命令会挡住所有客户端',
      why: '命令执行是单线程的，所以每条命令都应该是 O(1) 或 O(logN) 级别的，也不能有阻塞式的大操作。生产事故最常见两类：`KEYS *` 或大 `HGETALL` 把实例卡住几秒，以及 `DEL` 一个几百万元素的 key 造成阻塞。理解这点，才会自觉用 SCAN、UNLINK 和合理的分片。',
      confusion: [
        { q: 'Redis 6.0 说支持多线程，是不是命令也并发了？', a: '不是 —— 6.0 的多线程只用于网络读写（收包发包），命令执行仍是单线程，所以 `KEYS`、大集合操作照样会阻塞所有请求。多线程解决的是网络 IO 瓶颈，不是慢命令。' },
        { q: '`SLOWLOG` 里没有记录，就说明没有慢操作吗？', a: '不一定 —— SLOWLOG 只统计命令自身的执行时间，不包含客户端排队等待的时间（前面的慢命令占着线程时，后面命令的总耗时很长而执行时间很短）。判断阻塞还要看 INFO 里的 latest_fork_usec，以及是否正在做持久化或主从全量同步。' }
      ],
      related: ['db-redis-cli', 'db-redis-slowlog', 'db-redis-scan', 'db-redis-monitor', 'db-redis-info'],
      lessons: ['db-redis-keys-vs-scan'],
      tags: ['Redis', '性能']
    },

    {
      id: 'redis-bigkey-hotkey',
      term: 'bigkey 与热 key',
      en: 'big key / hot key',
      cat: 'db-cache',
      level: 2,
      oneLine: '单个 value 过大或单个 key 访问过于集中，都会压垮单实例',
      why: 'bigkey 让单次操作变重（序列化、网络传输、删除都慢），在集群里还会造成数据倾斜（某个分片的内存与流量远高于其他）；热 key 把所有请求压到一个分片上，加节点也分摊不掉。两者在业务上通常来自"把大对象整个塞进一个 key"和"全站共用一个配置或计数器 key"。',
      confusion: [
        { q: '`redis-cli --bigkeys` 报出来的就是内存占用最大的 key 吗？', a: '不完全是 —— 它按各类型的元素个数/长度排序（基于 SCAN 遍历），并不等于内存占用；要按内存找得用 `--memkeys`（抽样估算），或对具体 key 用 `MEMORY USAGE`（精确，但一次只能一个）。' },
        { q: '集群模式下给热 key 加节点能解决吗？', a: '不能 —— 同一个 key 只落在一个分片上，加节点不改变它的位置。可行的是本地缓存、读写分离、把 key 拆成多个分片 key（如按用户取模），或在应用侧做请求合并。' }
      ],
      related: ['db-redis-bigkeys', 'db-redis-memory-usage', 'db-redis-scan', 'db-redis-dbsize', 'db-redis-type', 'db-redis-cli'],
      lessons: ['db-redis-bigkeys', 'db-redis-keys-vs-scan'],
      tags: ['Redis', '性能', '排障']
    },

    {
      id: 'cache-penetration-avalanche',
      term: '缓存穿透、击穿与雪崩',
      en: 'cache penetration / breakdown / avalanche',
      cat: 'db-cache',
      level: 2,
      oneLine: '穿透查的是不存在的数据，击穿是热点过期，雪崩是大面积同时失效',
      why: '三者都会把压力瞬间打到数据库，但成因与对策不同：穿透要用缓存空值或布隆过滤器挡住不存在的键；击穿要避免热点 key 到期瞬间的并发回源（互斥重建或逻辑过期）；雪崩要避免大量 key 同时过期（过期时间加随机抖动），并给数据库留限流与降级。名词混用就会用错方案。',
      confusion: [
        { q: '给所有 key 设同一个过期时间有问题吗？', a: '有 —— 这就是自己制造的雪崩：整点刷新的缓存会在同一秒集体失效，请求同时回源。正确做法是在基础过期时间上叠加随机抖动，或者改成后台异步刷新（逻辑过期）。' },
        { q: '把"查不到"也缓存起来，有副作用吗？', a: '有 —— 空值的过期时间要短一些，否则数据后来真的存在了，业务会长时间读到"不存在"；另外要区分"确实不存在"与"查询失败"，把故障也缓存成空值会把问题固化。' }
      ],
      related: ['db-redis-ttl', 'db-redis-info', 'db-redis-dbsize', 'db-redis-memory-usage'],
      lessons: [],
      tags: ['缓存', '架构', '高可用']
    },

    {
      id: 'mq-at-least-once-idempotent',
      term: '至少一次与幂等',
      en: 'at-least-once / idempotency',
      cat: 'db-cache',
      level: 3,
      oneLine: '消息投递语义：至少一次会重复，精确一次要靠消费端幂等',
      why: '绝大多数消息队列默认给的是"至少一次"：生产者重试、消费者处理成功但位点提交失败、分区再均衡都会造成重复消费。所以真正的可靠性不在 broker，而在消费端是否幂等（用业务唯一键去重），以及重试与死信策略是否可控。分布式场景常用本地消息表加幂等消费来兜底。',
      confusion: [
        { q: '消费端 ack 了，消息就不会重复吗？', a: '不一定 —— 如果在"业务处理完成但位点还没提交"之间进程崩溃，重启后会从上次提交的位点重新消费，这条消息就重复了。所以幂等要按业务唯一键做（订单号、流水号），不能假设消息 ID 永远不变。' },
        { q: '怎么判断消费有没有积压？', a: '看消费组的 LAG（Kafka 用 `kafka-consumer-groups.sh --describe` 的 LAG 列，RocketMQ 看 consumerProgress 的堆积量），而不是主题里的消息总数 —— 总量只说明写入量，LAG 才说明"生产快过消费"。' }
      ],
      related: ['db-kafka-consumer-groups', 'db-kafka-console-consumer', 'db-rabbit-list-queues', 'db-rocket-consumer-progress', 'db-kafka-topics-describe'],
      lessons: [],
      tags: ['消息队列', '架构', '可靠性']
    },

    /* ══════════════════ 九、可观测与性能 ══════════════════ */

    {
      id: 'load-average-cores',
      term: 'load average',
      en: 'load average',
      cat: 'monitor',
      level: 1,
      oneLine: '可运行与不可中断进程的平均数量，不是使用率百分比',
      why: '三个数字是 1/5/15 分钟的平均值，统计的是"正在运行 + 处于不可中断睡眠（D 状态）"的进程数，所以必须除以核数才有意义：4 核机器上 load 4 意味着排满，32 核上很闲。因为包含 D 状态，IO 卡住时 load 也会飙升，光看 load 容易把 IO 问题误判成 CPU 问题。',
      confusion: [
        { q: 'load 高就是 CPU 不够吗？', a: '不一定 —— 要看 vmstat 的 r 列与 b 列：r（运行队列）高说明 CPU 不足，b（阻塞进程）高说明卡在 IO。结合 top 里的 us/sy/wa 与 load 的变化趋势看，比盯一个数字靠谱得多。' },
        { q: '容器里 `uptime` 看到的 load 是容器自己的负载吗？', a: '不是 —— load 来自 /proc/loadavg，是整台宿主机的（除非挂了 lxcfs 这类隔离层）。容器里 load 8 可能全是邻居造成的，判断容器自身是否 CPU 饥饿要看 cgroup 的限流指标。' }
      ],
      related: ['mo-uptime', 'mo-nproc', 'mo-vmstat', 'lu-lscpu', 'mo-top'],
      lessons: ['mon-load-vs-cores'],
      tags: ['监控', '性能', 'CPU']
    },

    {
      id: 'free-vs-available',
      term: 'free 与 available',
      en: 'free / MemAvailable',
      cat: 'monitor',
      level: 1,
      oneLine: 'free 是完全空闲的内存，available 是内核估算的可用内存',
      why: 'Linux 会把空闲内存拿去做页缓存（buff/cache），需要时再回收，所以 free 很小是正常的；判断"还剩多少内存"要看 available，也就是内核估算的、不触发 swap 还能分配出去的量。容器里更要注意：`free` 读的是宿主机的内存，容器自己的上限在 cgroup 里，这正是"监控说内存充裕，Pod 却被 OOMKilled"的根源。',
      confusion: [
        { q: '内存只剩几百 M 了，是不是要加内存？', a: '先看 available 那一列 —— 如果它还有几个 G，说明页缓存随时可回收，不是真的内存不足。真正要警惕的是 available 逼近 0，或者 vmstat 里 si/so 持续非 0（正在换页）。' },
        { q: '容器里 `free -h` 显示宿主机有 128G，容器就能用满吗？', a: '不能 —— 容器的内存上限由 cgroup 限制（K8s 的 limits、docker 的 -m），`free` 看不到这层。要看 cgroup 的 memory.current 与 memory.max，或监控里的 working_set 指标，否则容易写出把宿主机内存吃光的程序。' }
      ],
      related: ['mo-free', 'mo-vmstat', 'mo-proc', 'mo-top', 'pf-swappiness'],
      lessons: ['mon-free-vs-available'],
      tags: ['监控', '内存']
    },

    {
      id: 'iowait-meaning',
      term: 'iowait',
      en: 'io wait',
      cat: 'monitor',
      level: 3,
      oneLine: 'CPU 空闲且有未完成块设备 IO 的时间占比',
      why: 'iowait 只在 CPU 空闲、同时有任务在等块设备 IO 时才计入，所以它既会漏报（CPU 同时很忙时，等待时间被算进 user/sys）也会误报（虚拟机里看不到宿主机存储侧的瓶颈）。多核机器上 top 里的 wa 是全核平均，一块盘打满也可能只有几个百分点。判断磁盘是否真瓶颈要看 iostat 的 %util、await 与队列深度。',
      confusion: [
        { q: 'iowait 高，换 SSD 就能解决吗？', a: '先确认瓶颈在哪一层 —— `iostat -x 1` 看具体设备的 %util 是否接近 100%、await 是否远高于平时、队列是否堆积；也可能是 NFS/云盘侧的限制、文件系统日志，或者内存不足导致的大量换页（那就该加内存而不是换盘）。' },
        { q: 'iowait 不高，就说明没有 IO 问题吗？', a: '不代表 —— CPU 忙着跑其他任务时，等待 IO 的时间不会记到 iowait 上，虚拟化环境里 guest 的 iowait 也可能失真。更直接的证据是 D 状态进程数（vmstat 的 b 列）与业务延迟的抖动。' }
      ],
      related: ['mo-iostat', 'mo-vmstat', 'mo-sar', 'mo-pidstat', 'mo-iotop'],
      lessons: ['mon-io-bottleneck'],
      tags: ['监控', '性能', 'IO']
    },

    {
      id: 'gc-pause',
      term: 'GC 停顿',
      en: 'GC pause',
      cat: 'monitor',
      level: 3,
      oneLine: '垃圾回收会暂停应用线程，堆越大单次停顿通常越长',
      why: '老年代增长会让 Full GC 变频繁，每次 Full GC 都伴随 Stop-The-World，表现为周期性的 P99 尖刺甚至请求超时。判断要靠 GC 日志与 jstat（FGC 次数、FGCT 累计时间、各代占用趋势），而不是猜内存大小；容器里还要注意堆上限与容器 limit 的关系，没设好就会踩坑。',
      confusion: [
        { q: '把 `-Xmx` 调大，GC 问题就缓解了吗？', a: '不一定 —— 堆越大，单次 Full GC 的停顿通常越长（可回收对象更多、整理更久），只是频率降低。要同时看停顿与频率，并考虑换收集器（G1/ZGC）与调 MaxGCPauseMillis；注意那只是期望目标，不是保证值。' },
        { q: '容器里不设 `-Xmx` 会怎样？', a: 'JDK 8u191/10 之前不识别容器限额，会按宿主机内存的 1/4 设堆 —— 容器 limit 是 2G 而宿主机 128G 时，堆能开到 32G，于是被 cgroup OOMKilled（退出码 137）。新版本虽已容器感知，仍建议显式设置或用 MaxRAMPercentage。' }
      ],
      related: ['mo-jvm-jstat', 'pf-jstat', 'pf-gc-log', 'mo-jvm-jmap', 'mo-jvm-arthas', 'pf-jstack-cpu'],
      lessons: [],
      tags: ['JVM', '性能', '监控']
    },

    {
      id: 'flamegraph',
      term: '火焰图',
      en: 'flame graph',
      cat: 'monitor',
      level: 3,
      oneLine: '按采样调用栈画出的占比图，横向宽度代表出现频率',
      why: '火焰图把成千上万次采样的调用栈叠起来：横轴宽度是该栈在采样中的占比（近似耗时占比），纵轴是调用深度（从下往上是调用方向），顶部平而宽的"高原"说明这个函数自己在消耗资源。它是定位 CPU 热点的最快手段，但只覆盖采样到的东西 —— 等待、锁、IO 不在 on-CPU 火焰图里。',
      confusion: [
        { q: '火焰图上某个函数很宽，就说明它执行得慢吗？', a: '说明它出现在更多采样里（占用了更多 CPU 时间），但要区分"它自己慢"还是"它调用的子函数慢"：看它上方还有没有栈帧，有就把注意力放到子帧，顶部宽而平才是它自身在消耗。' },
        { q: 'CPU 用得不高的服务，火焰图能看出慢在哪吗？', a: 'on-CPU 火焰图看不出 —— 它只在 CPU 上采样，阻塞在锁、网络、磁盘的时间不会出现。这类问题要用 off-CPU 分析或按墙钟时间采样，也可以配合 strace 看系统调用阻塞在哪里。' }
      ],
      related: ['mo-perf', 'pf-perf', 'pf-bpftrace', 'mo-strace', 'pf-jstack-cpu'],
      lessons: [],
      tags: ['性能', '排障']
    },

    {
      id: 'p99-vs-average',
      term: 'P99 与平均值',
      en: 'percentile',
      cat: 'monitor',
      level: 2,
      oneLine: '尾延迟用分位数描述，平均值会被长尾掩盖',
      why: '平均响应时间是被大量快请求拉低的：99 个 10ms 加 1 个 10s，平均只有 110ms，看着很健康，但每 100 个用户就有一个等了 10 秒。所以 SLO 通常写 P95/P99，容量评估也要看尾延迟；而分位数的计算与聚合有几个很容易出错的地方。',
      confusion: [
        { q: '把几个实例的 P99 取平均，就是全局 P99 吗？', a: '不是 —— 分位数不能直接平均。正确做法是对直方图桶聚合后再算分位数（如 Prometheus 的 histogram_quantile 配合 sum by (le)），或者用能合并的 sketch；Summary 类型的 quantile 根本无法正确聚合。' },
        { q: '`histogram_quantile` 算出来的 P99 是精确值吗？', a: '不是 —— 它按桶边界做线性插值，是估算值，桶划分不合理时误差很大。要更准就得增加桶密度，或者用原生直方图、离线摘要来计算。' }
      ],
      related: ['mo-promql', 'mo-grafana-api', 'pf-wrk', 'pf-ab', 'mo-hcloud-ces'],
      lessons: [],
      tags: ['监控', '性能', 'SLO']
    },

    {
      id: 'log-rotation-inode',
      term: '日志轮转',
      en: 'log rotation',
      cat: 'monitor',
      level: 2,
      oneLine: '按大小或时间切割日志，配置不当会丢日志或耗尽 inode',
      why: 'logrotate 支持 create（切完新建文件，需要进程配合重新打开）与 copytruncate（复制后截断原文件，不需要进程支持但会丢一个窗口的日志），配上 postrotate 发信号让进程重开日志是标准做法。切割太保守会让单个文件涨到几十 G，切得太碎又会堆出上百万小文件把 inode 用光，报错同样是 No space left on device。',
      confusion: [
        { q: '日志切割后磁盘空间没释放，是什么原因？', a: '多半是进程还持有旧文件的句柄继续写（`lsof +L1` 能看到 deleted 标记），空间要等进程关闭或重启才回收。用 copytruncate 不会出现这个现象，代价是可能丢一个窗口的日志。' },
        { q: '文件数量多也会让磁盘"满"吗？', a: '会 —— 大量小文件会把 inode 耗尽，`df -h` 看着还有空间却写不进去，要用 `df -i` 确认。所以清理策略不光看总量，也要看文件个数，切得太碎就要定期打包合并。' }
      ],
      related: ['mo-log-logrotate', 'mo-log-disk-full', 'mo-log-var-log', 'mo-log-journald-conf', 'lu-journalctl-vacuum', 'mo-lsof'],
      lessons: ['tail-follow', 'basic-tar-backup'],
      tags: ['日志', '运维', '磁盘']
    },

    {
      id: 'cpu-affinity',
      term: 'CPU 亲和性',
      en: 'CPU affinity',
      cat: 'perf',
      level: 2,
      oneLine: '把进程或线程限制在指定 CPU 核上运行的调度约束',
      why: '亲和性决定调度器能把这个线程放到哪些核上：绑核能提升缓存命中率、减少跨 NUMA 访存，也能把关键进程与噪音邻居隔开；但绑得太窄会在高并发时排队。容器里的 `--cpuset-cpus` 就是给容器设亲和性，K8s 的 static CPU 管理策略也是围绕它做 CPU 独占。',
      confusion: [
        { q: '`docker run --cpus=2` 和 `--cpuset-cpus=0-1` 是一回事吗？', a: '不是 —— 前者是 CPU 时间配额（每 100ms 最多用 200ms），容器仍可能跑在任意核上并被限流；后者是亲和性，把容器限制在 0、1 号核上，但不保证这两个核只跑它。要独占得配合 cgroup cpuset 划分或 K8s 的 static 策略。' },
        { q: '用 `taskset -c 0` 绑一个核，这个核就归我了吗？', a: '不是 —— 亲和性只限制"我允许在哪些核上跑"，其他进程照样可以被调度到 0 号核。真正的隔离要靠 cpuset 把别的任务排除出去，或者用独占核规格。' },
        { q: 'NUMA 机器上绑核有什么讲究？', a: '要连内存节点一起绑 —— 跨 NUMA 访存延迟明显更高。先用 `numactl --hardware` 看拓扑，再用 `--cpunodebind` 与 `--membind` 一起指定，跑完用 `numastat` 看有没有大量 miss。' }
      ],
      related: ['pf-taskset', 'pf-numactl', 'dk-run', 'mo-nproc', 'lu-lscpu'],
      lessons: [],
      tags: ['性能', 'CPU', '内核']
    },

    {
      id: 'swap-swappiness',
      term: 'swap 与 swappiness',
      en: 'swap / vm.swappiness',
      cat: 'perf',
      level: 3,
      oneLine: '把不常访问的内存页换出到磁盘，swappiness 控制换出倾向',
      why: 'swap 能在内存紧张时避免直接 OOM，代价是被换出的页再次访问时要读盘（毫秒级对纳秒级），表现为莫名其妙的卡顿。`vm.swappiness` 控制内核换出匿名页的积极程度（默认 60），调低会让内核更倾向回收页缓存而不是换出进程内存；数据库类服务通常设很低甚至关闭 swap，但一定要配套监控，因为关掉之后内存不足就直接 OOM。',
      confusion: [
        { q: '`vm.swappiness = 0` 就是禁用 swap 吗？', a: '不是 —— 它只是把"主动换出"的倾向降到最低，内存真正紧张时内核仍可能换出。要禁用得 `swapoff -a` 并清掉 fstab 里的 swap 条目，而这么做之后内存不足会直接触发 OOM Killer。' },
        { q: '`free` 里 swap used 不为 0，说明现在有性能问题吗？', a: '不一定 —— 那可能是很早以前换出、之后再没被访问的页。要看的是 vmstat 里 si/so 是否持续非 0（正在换入换出），以及业务延迟有没有随之抖动。' }
      ],
      related: ['pf-swappiness', 'pf-sysctl', 'ls9-swapon', 'mo-free', 'mo-vmstat'],
      lessons: ['mon-free-vs-available'],
      tags: ['内存', '性能', '内核']
    },

    {
      id: 'file-descriptor-ulimit',
      term: '文件句柄上限',
      en: 'file descriptor limit',
      cat: 'perf',
      level: 2,
      oneLine: '进程能同时打开的文件与套接字数量上限，分多层设置',
      why: '每个打开的文件、socket、管道都占一个文件描述符，上限有三层：进程级的 soft/hard 限制（`ulimit -n`）、systemd 服务的 LimitNOFILE、以及系统级的 `fs.file-max`。报错 too many open files 时，要么是单进程上限太小，要么是程序泄漏了描述符（典型是 CLOSE_WAIT 连接没有关闭）。',
      confusion: [
        { q: '在 /etc/security/limits.conf 里改完，为什么 systemd 服务还是老限制？', a: '因为 systemd 启动的服务不读那个文件 —— 要在 unit 里写 `LimitNOFILE=`，或改 /etc/systemd/system.conf 的 DefaultLimitNOFILE 后 daemon-reload。判断服务实际生效的限制看 `cat /proc/<pid>/limits`，别只看当前 shell 的 ulimit。' },
        { q: '`ulimit -n` 调大后，已经在跑的进程也生效吗？', a: '不生效 —— 限制是进程创建时继承的，改完要重启进程（或对运行中的进程用 `prlimit --pid` 调整）。"重启一下就好了"往往只是新进程继承了新限制，泄漏本身还在。' },
        { q: '描述符用满一定是上限设小了吗？', a: '不一定 —— 要区分"上限太小"和"泄漏"：`lsof -p <pid> | wc -l` 持续单调增长就是泄漏（常见于没关的 HTTP 连接、没 close 的文件），此时调大上限只是把爆炸时间往后推。' }
      ],
      related: ['pf-ulimit-n', 'pf-file-max', 'pf-sysctl', 'ln-lsof', 'mo-lsof', 'ln-ss'],
      lessons: [],
      tags: ['性能', '内核', '排障']
    },

    /* ══════════════════ 十、交付与云原生 ══════════════════ */

    {
      id: 'blue-green-canary',
      term: '蓝绿与灰度',
      en: 'blue-green / canary',
      cat: 'cicd',
      level: 2,
      oneLine: '蓝绿是两套环境整体切流量，灰度是先放小比例再逐步放大',
      why: '蓝绿部署准备两套完整环境，验证后一次性切流量（DNS、负载均衡或 Service selector），回滚就是切回去，代价是资源翻倍；金丝雀/灰度让新版本先接 1%~5% 的流量，观察错误率与延迟再逐步放大，代价是需要按比例分流的能力和可对比的指标。两者都依赖同一件事：能快速回滚。',
      confusion: [
        { q: '灰度发布按随机比例分流就够了吗？', a: '不够 —— 同一个用户的多次请求如果落到不同版本，会出现功能闪烁与状态不一致。要按稳定维度分流（用户 ID、cookie、租户），并保证同一会话粘在同一版本上。' },
        { q: '回滚就是把流量切回旧版本吗？', a: '不只是 —— 如果这次发布带了数据库 schema 变更或数据写入，旧版本代码可能读不懂新数据。要按"扩展、迁移、收缩"的方式做兼容变更：先加字段双写，切完流量再清理旧结构。' },
        { q: '切流量之前还要注意什么？', a: '新环境要先预热（JVM JIT、缓存、连接池），否则一切流量就出现延迟尖刺；蓝绿切换还要考虑长连接（切了 selector，老连接仍在旧 Pod 上）与 DNS 的 TTL 缓存。' }
      ],
      related: ['ci-image-tag', 'ci-argocd-sync', 'k8s-rollout', 'hw-elb-create-listener', 'k8s-service'],
      lessons: [],
      tags: ['发布', 'CI/CD', '架构']
    },

    {
      id: 'immutable-infra',
      term: '不可变基础设施',
      en: 'immutable infrastructure',
      cat: 'cicd',
      level: 3,
      oneLine: '实例部署后不再修改，变更靠重建新实例来替换',
      why: '把服务器当"牲畜"而不是"宠物"：配置全部进代码与镜像，要改就重新构建、重新部署，不登录机器改文件。好处是环境一致、没有配置漂移、回滚等于换回上一个镜像；代价是必须有镜像构建流水线、快速启动能力，并且把数据、日志、会话这些状态都外置。',
      confusion: [
        { q: '不可变之后就不能登机器排查问题了吗？', a: '可以登上去看（诊断是只读行为），但不该在机器上"修"（改配置、装包、hotfix）。改了当下生效，可下次重建就丢，而且机器上的状态与代码仓库里的定义分叉，后面没人知道真相在哪。' },
        { q: '不可变基础设施和有状态服务冲突吗？', a: '不冲突但要求更高 —— 必须先把状态外置（数据库、对象存储、云盘/PV），让计算实例真正无状态，才能随意替换。做不到这一步就贸然"不可变"，重建实例时会丢数据。' }
      ],
      related: ['ci-image-tag', 'ci-docker-buildx', 'vm-misc-packer', 'iac-tf-apply', 'iac-ans-playbook'],
      lessons: [],
      tags: ['理念', 'CI/CD', '云原生']
    },

    {
      id: 'git-branch-model',
      term: 'Git 分支模型',
      en: 'branching model',
      cat: 'cicd',
      level: 2,
      oneLine: '分支只是指向提交的指针，模型决定协作与发布的方式',
      why: '分支不是目录副本，它就是一个指向某个提交的可变指针，所以创建与切换都极快，真正的成本在于"分支活多久"：短生命周期分支配合频繁合并能减少冲突，长期并存的多条分支（develop、release、hotfix 全上）在多人协作下很容易变成合并地狱。团队里最重要的是统一，而不是选哪个模型。',
      confusion: [
        { q: '`git rebase` 和 `git merge` 该用哪个？', a: '取决于分支是否已经共享 —— 本地未推送的分支用 rebase 整理成线性历史很干净；已经推送并被别人拉取的分支上 rebase 会重写提交 ID，别人的历史就分叉了。共享分支上用 merge（必要时 `--no-ff` 保留合并记录）更安全。' },
        { q: '在 main 上直接改一个字符也要开分支吗？', a: '重点不在"一个字" —— 直接改 main 的问题是跳过了 CI 与评审门禁，而且一 push 就影响了所有人。分支的成本几乎为零，用短分支加快合并（紧急情况用 hotfix 分支）能把风险挡在合并之前。' }
      ],
      related: ['ci-git-branch', 'ci-git-merge', 'ci-git-rebase', 'ci-git-switch', 'ci-git-push', 'ci-git-log'],
      lessons: ['ci-git-branch-fix'],
      tags: ['Git', '协作', 'CI/CD']
    },

    {
      id: 'commit-granularity',
      term: '提交粒度',
      en: 'atomic commit',
      cat: 'cicd',
      level: 1,
      oneLine: '一次提交只做一件可独立回滚的事，并说明为什么改',
      why: '提交是最小可回滚单位：粒度小、职责单一，`git revert`、`git cherry-pick`、`git bisect` 才有意义，代码评审也才看得动。把一整天的工作攒成一次提交，出问题时只能整块回滚，连带把同时改好的功能一起撤掉；提交信息只写"改了什么"是重复 diff，写清"为什么改"才是后人需要的。',
      confusion: [
        { q: '`git add .` 有什么风险？', a: '它会把你没注意到的文件一起提交 —— 密钥、.env、构建产物、本地 IDE 配置。提交前用 `git status` 和 `git diff --cached` 过一眼，并把该忽略的写进 .gitignore；已经提交过的密钥要直接视为泄露，改历史不等于安全。' },
        { q: '提交粒度小，会不会提交数量爆炸、历史不好看？', a: '提交历史的价值在于可检索与可回滚，不是好看。真正难维护的是"一次提交 80 个文件、信息写着 update"；本地可以随时 amend 或交互式 rebase 整理，推到共享分支之前整理好就行。' }
      ],
      related: ['ci-git-commit', 'ci-git-add', 'ci-git-status', 'ci-git-log', 'ci-git-revert', 'ci-git-bisect'],
      lessons: ['ci-git-commit-config', 'ci-git-log-tag'],
      tags: ['Git', '协作']
    },

    {
      id: 'image-vs-snapshot',
      term: '镜像与快照',
      en: 'image / snapshot',
      cat: 'kvm',
      level: 2,
      oneLine: '镜像是可启动的模板，快照是某块盘在某一刻的数据副本',
      why: '镜像带着系统盘内容与启动元数据，用来创建新实例，可以做跨 AZ、跨 region 复制；快照是单块云盘的数据副本，用于回滚这块盘或据此创建新盘。两者在控制台里常常挨在一起，但用途不同：前者管"装出什么样的机器"，后者管"数据怎么退回去"。',
      confusion: [
        { q: '有云盘快照就等于有备份了吗？', a: '不能划等号 —— 快照在同一套存储体系内，误删、误改、账号被盗同样会波及。重要数据要有跨区或跨账号的独立备份，并定期做恢复演练，否则真出事时才发现快照也跟着没了。' },
        { q: '用镜像创建的 ECS，改里面的东西会影响镜像吗？', a: '不会 —— 实例是镜像的一份拷贝，改动只写在这台实例的盘上。反过来，想让改动变成新镜像要重新制作镜像；`qemu-img` 层面的快照链也是同样道理，快照依赖原盘，原盘没了链就断了。' }
      ],
      related: ['vm-img-create', 'vm-img-convert', 'vm-virsh-snapshot', 'hw-ims-list-images', 'hw-evs-create'],
      lessons: [],
      tags: ['云', '虚拟化', '存储']
    },

    {
      id: 'iac-state',
      term: 'Terraform state',
      en: 'state file',
      cat: 'iac',
      level: 3,
      oneLine: '记录配置里的资源与真实资源 ID 映射关系的状态文件',
      why: 'plan 的本质是"配置 + state + 真实 API"三方对比：state 里存着每个资源对应的真实 ID 与属性，所以它一旦丢失或不一致，Terraform 就可能重复创建或误删资源。多人协作必须把 state 放远端（backend）并开启锁，绝不能各存本地；state 里还包含明文敏感信息，存储要加密、权限要收紧。',
      confusion: [
        { q: '在控制台上手工改了资源，会怎样？', a: '产生配置漂移 —— 下次 plan 会试图把它改回代码里的样子，改不回去的就重建（可能丢数据）。所以排查完手工改动后，要么把改动同步回代码，要么接受 Terraform 把它改回来。' },
        { q: '`terraform state rm` 会把云上资源删掉吗？', a: '不会 —— 它只是让 Terraform 不再管理这个资源，真实资源还在（也还在计费）。要删资源用 `terraform destroy` 或 `-target`；反过来，想把已有资源纳入管理要用 `terraform import`，而且它只写 state，不会生成配置代码，得自己补 HCL。' }
      ],
      related: ['iac-tf-state-list', 'iac-tf-import', 'iac-tf-backend', 'iac-tf-refresh', 'iac-tf-plan', 'iac-tf-state-rm'],
      lessons: [],
      tags: ['IaC', 'Terraform', '运维']
    },

    {
      id: 'selinux-context',
      term: 'SELinux 标签',
      en: 'SELinux context',
      cat: 'security',
      level: 3,
      oneLine: '在传统权限之外，用安全上下文标签做强制访问控制',
      why: 'SELinux 是内核里的强制访问控制：每个进程和文件都带上下文（user:role:type:level），策略按 type 决定"这个进程能不能访问这个资源"，因此会出现"rwx 权限都对、属主也对，服务还是 Permission denied"的情况。排查入口是 `getenforce` 加 /var/log/audit/audit.log 里的 AVC 记录。',
      confusion: [
        { q: '服务报权限不足，怎么快速判断是不是 SELinux？', a: '先看 `getenforce` 是不是 Enforcing，再用 ausearch 查最近的 AVC 拒绝记录。确认是它之后不要长期 `setenforce 0`（重启失效，而且等于关掉一层防护），而是用 semanage fcontext 加规则再 restorecon 修标签，或用布尔值开关放行特定行为。' },
        { q: '为什么 `cp` 过去的文件能正常访问，`mv` 过去的反而不行？', a: '因为 `mv` 保留原文件的上下文标签，`cp` 默认按目标目录的默认规则生成新标签。往服务目录里放文件时 mv 常需要 `restorecon -Rv <目录>` 修复，否则标签类型不对，权限再对也访问不了。' }
      ],
      related: ['sec-getenforce', 'sec-semanage-fcontext', 'sec-restorecon', 'sec-ausearch', 'sec-aa-status'],
      lessons: [],
      tags: ['安全', 'Linux', '排障']
    },

    {
      id: 'ceph-osd-pg',
      term: 'Ceph OSD 与 PG',
      en: 'Object Storage Daemon / Placement Group',
      cat: 'linux-storage',
      level: 3,
      oneLine: 'OSD 保存对象，PG 将对象映射到一组 OSD 上',
      why: 'Ceph 把数据切成对象，再通过 PG 和 CRUSH 规则分布到多个 OSD。健康检查先看集群状态，再看 OSD 是否在位、PG 是否 active+clean；PG 降级常是 OSD 故障或副本暂时不足。容量也不是把所有磁盘剩余空间相加就能直接使用：副本数、故障域和各 OSD 的空间不均会影响可写容量。',
      confusion: [
        { q: '一个 PG 卡住就应该立即执行修复或删掉它吗？', a: '不应该。先读 `ceph health detail`、`ceph pg <id> query` 和 OSD 状态，确认是磁盘故障、网络分区还是恢复队列。盲目删数据或强制标记丢失对象会造成永久数据损失。' },
        { q: '集群显示 HEALTH_OK，就能省略恢复演练吗？', a: '不能。HEALTH_OK 表示当前副本与服务状态满足配置，不证明备份可恢复，也不证明同时故障的容忍能力；生产环境仍要核对故障域、备份与恢复流程。' }
      ],
      related: ['ceph-status', 'ceph-health-detail', 'ceph-osd-tree', 'ceph-pg-stat', 'ceph-pg-query', 'ceph-df'],
      lessons: [],
      tags: ['Ceph', '存储', '排障']
    },

    {
      id: 'openstack-services',
      term: 'OpenStack 服务分工',
      en: 'OpenStack services',
      cat: 'kvm',
      level: 2,
      oneLine: '身份、计算、网络、镜像与块存储由不同服务协作',
      why: 'OpenStack CLI 看似统一，背后却分别调用 Keystone 身份认证、Nova 计算、Neutron 网络、Glance 镜像、Cinder 块存储和 Swift 对象存储。创建云主机失败时，先确认 token 和服务目录，再逐项核查镜像、规格、网络与卷；只盯着 Nova 的报错容易漏掉下游服务的问题。各服务的配额和权限也可能分别限制创建。',
      confusion: [
        { q: '已有云主机规格与镜像，为什么仍创建失败？', a: '还可能缺少网络、子网、安全组、可用区资源或项目配额。先验证 `openstack token issue`，再列出镜像、规格、网络和服务状态，最后查看云主机详情与控制台日志。' },
        { q: 'Swift 对象存储和 Cinder 云硬盘是同一种存储吗？', a: '不是。Cinder 提供可挂载给实例的块设备，适合文件系统和数据库；Swift 用对象 API 存取对象，适合静态文件与备份，两者的访问方式和一致性需求不同。' }
      ],
      related: ['os-token-issue', 'os-service-list', 'os-server-list', 'os-image-list', 'os-network-list', 'os-volume-list', 'os-object-list'],
      lessons: [],
      tags: ['OpenStack', '私有云', '排障']
    },

    {
      id: 'cert-chain',
      term: '证书链',
      en: 'certificate chain',
      cat: 'security',
      level: 2,
      oneLine: '服务器证书加中间证书构成信任链，缺一段就会校验失败',
      why: '客户端信任库里只有根证书，服务器必须把"服务器证书 + 中间 CA 证书"一起下发，客户端才能逐级验到根。漏发中间证书时，浏览器可能自己补齐（通过 AIA 拉取）而看起来正常，但 curl、Java、SDK 会直接报 unable to get local issuer certificate —— 这类问题往往在换证书之后才暴露。',
      confusion: [
        { q: '浏览器能正常打开 HTTPS，证书配置就没问题吗？', a: '不一定 —— 浏览器会尝试通过 AIA 去下载缺失的中间证书，所以链不完整时浏览器可能照样显示正常，而命令行工具与 Java 客户端报错。用 `openssl s_client -showcerts -connect host:443` 看服务器实际下发了几个证书，并读末尾的 Verify return code。' },
        { q: '证书报错都是"过期"吗？', a: '不是 —— 常见三类：证书过期（certificate has expired）、链不完整（unable to get local issuer certificate）、域名不匹配（hostname mismatch）。定位手段都是 `openssl s_client` 配合 `openssl x509 -noout -dates -subject` 看具体信息。' }
      ],
      related: ['sec-openssl-sclient', 'sec-openssl-x509', 'sec-cert-chain', 'sec-cert-expiry-check', 'mw-nginx-test'],
      lessons: [],
      tags: ['安全', '证书', '排障']
    }

  );
})();
