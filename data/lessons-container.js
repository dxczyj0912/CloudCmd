/* data/lessons-container.js · 容器与云原生（Docker / Kubernetes / Helm）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。这里只放课程数据。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

      {
        id: 'dk-ps-all',
        cat: 'docker',
        title: '容器起不来？先看全部容器',
        prompt: '服务访问不了，你怀疑容器挂了，但 `docker ps` 什么都没有。',
        task: '列出所有容器（包括已退出的）',
        steps: [
          { title: '先看不加参数的 ps', about: '挂掉的容器不会显示', cmd: 'docker ps', ref: 'dk-ps', hint: ['挂掉的容器不会出现在默认列表里 —— 服务访问不了时，先看清眼下还有哪些在跑，别被"列表是空的"误导', 'docker ____'], note: '只有运行中的容器 —— 挂掉的容器不显示，很容易误判成"容器不存在"' },
          { title: '加上 -a 看全部容器', about: '连已退出的一起列出来', cmd: 'docker ps -a', ref: 'dk-ps', hint: ['服务起不来时，最该先确认的是它到底有没有在跑 —— 默认输出不带已退出的容器，"挂掉"和"不存在"要看两种状态才算分得清', 'docker ps ____'], note: 'old-web 显示 Exited (1)，debug-tmp 显示 Exited (137)' }
        ],
        answer: 'docker ps -a',
        alt: ['docker ps --all', 'docker container ls -a', 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"'],
        expect: /Exited|old-web/,
        teach: '`docker ps` 只显示运行中的容器 —— 容器挂了它就不显示了，很多人因此以为"容器不存在"。**`-a` 是排障必备**，能直接看到 `Exited (1)` 与退出码。'
      },

      {
        id: 'dk-logs',
        cat: 'docker',
        title: '看容器最后 100 行日志',
        prompt: 'web 容器在跑但接口报错，你想看它的日志。',
        task: '查看 web 容器最后 100 行日志',
        steps: [
          { title: '确认容器名与状态', about: '拿到容器名才能查日志', cmd: 'docker ps', ref: 'dk-ps', hint: ['下一步查日志要拿容器名当参数 —— 名字不用猜，先看当前有哪些容器在跑，把名字抄下来', 'docker ____'], note: '拿到容器名 web' },
          { title: '看最后 100 行日志', about: '限制行数，避免刷屏', cmd: 'docker logs --tail 100 web', ref: 'dk-logs', hint: ['日志一次刷几千行很难看，只取尾部若干行就够定位报错 —— 哪个选项负责限定"最后 N 行"？', 'docker logs ____ 100 web'], note: '--tail 限制行数，避免刷屏' }
        ],
        answer: 'docker logs --tail 100 web',
        alt: ['docker logs web --tail 100', 'docker logs --tail=100 web', 'docker logs -n 100 web'],
        expect: /query timeout/,
        teach: '**容器只收集 stdout/stderr**，应用如果把日志只写文件，`docker logs` 会是空的。加 `-f` 实时跟踪，加 `--since 10m` 只看最近十分钟。'
      },

      {
        id: 'dk-exitcode',
        cat: 'docker',
        title: '一眼拿到退出码与重启次数',
        prompt: 'old-web 容器反复重启，你要用一条命令拿到它的关键状态。',
        task: '用 docker inspect 的 --format 提取 old-web 的 ExitCode、OOMKilled、RestartCount',
        steps: [
          { title: '先看它是怎么退出的', about: 'STATUS 能看到退出码', cmd: 'docker ps -a', ref: 'dk-ps', hint: ['退出码决定排查方向：0 多半是前台进程跑成了后台，137 是被强杀或 OOM —— 它写在 STATUS 列的括号里', 'docker ps ____'], note: 'STATUS 列写着 Exited (1)，但看不到重启次数' },
          { title: '精确取出关键状态', about: '退出码 / 是否 OOM / 重启次数', cmd: 'docker inspect --format "{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}" old-web', ref: 'dk-inspect', hint: ['那几项分别散在 JSON 的 State 与根层级里，用 Go 模板把三处字段拼成一行 —— 哪个选项用来指定模板？', 'docker inspect ____ "{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}" old-web'], note: '输出 1 false 7：退出码 1、没被 OOM、重启了 7 次' }
        ],
        answer: 'docker inspect --format "{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}" old-web',
        alt: [
          'docker inspect -f "{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}" old-web',
          'docker inspect --format "{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}" old-web'
        ],
        expect: /1 false 7/,
        teach: '输出 `1 false 7`：退出码 1（应用自己报错）、没被 OOM、重启了 7 次。**退出码含义**：0 正常结束（常见于把前台进程写成后台运行）、1 应用报错、126/127 没有执行权限或解释器、137 被 SIGKILL 或 OOM、143 收到 SIGTERM。'
      },

      {
        id: 'dk-df',
        cat: 'docker',
        title: 'Docker 把磁盘吃光了',
        prompt: 'Docker 的目录越来越大，你要先看清各类资源各占多少。',
        task: '查看 Docker 的磁盘占用明细',
        steps: [
          { title: '看宿主机磁盘', about: '先确认哪块盘紧张', cmd: 'df -h', ref: 'ls9-df', hint: ['别一上来就清理 —— 先确认是哪个挂载点快满了，再用人类可读的单位看容量', 'df ____'], note: '/var/lib/docker 所在的盘已经很紧张' },
          { title: '看 Docker 的占用明细', about: '镜像 / 容器 / 卷 / 构建缓存', cmd: 'docker system df', ref: 'dk-df', hint: ['清理前先分清是镜像、容器、卷还是构建缓存把盘吃掉的 —— 顶层子命令里就有一类专门报各资源占用', 'docker system ____'], note: '镜像 / 容器 / 卷 / 构建缓存各占多少一目了然' }
        ],
        answer: 'docker system df',
        alt: ['docker system df -v', 'docker system df --verbose'],
        expect: /RECLAIMABLE|Images/,
        teach: '先 `df` 定位到是"哪一类"占的，再决定用 `image prune` 还是 `builder prune`。直接 `docker system prune -a` 会删掉所有未被使用的镜像 —— **生产环境务必先看明细再清理**。'
      },

      {
        id: 'dk-inspect-net',
        cat: 'docker',
        title: '容器之间怎么互相访问',
        prompt: '两个容器放在自定义网络 mynet 里，你想确认它们各自的 IP 与网关。',
        task: '查看 mynet 网络的详细信息',
        steps: [
          { title: '看有哪些网络', about: '默认三个 + 自定义网络', cmd: 'docker network ls', ref: 'dk-network-ls', hint: ['先列出都有哪些网络、各是什么驱动，再挑出题目给的那个自定义网络下手', 'docker network ____'], note: '默认有 bridge/host/none，外加自定义的 mynet' },
          { title: '看 mynet 的网段', about: '子网与已接入的容器', cmd: 'docker network inspect mynet', ref: 'dk-network-inspect', hint: ['容器名能不能互相解析、各自分到哪个 IP，都记在网络对象自己的详情里 —— 哪个子命令看单个对象的展开信息？', 'docker network ____ mynet'], note: 'Subnet 与已接入的容器都在这里' },
          { title: '在容器里验证连通性', about: '自定义网络可用容器名互访', cmd: 'docker exec web env', ref: 'dk-exec', hint: ['验证点不是从外面通不通，而是容器内部看到的 DNS 与代理变量 —— 哪个子命令能把程序跑进正在运行的容器里？', 'docker ____ web env'], note: '自定义网络里容器可以用容器名互相访问' }
        ],
        answer: 'docker network inspect mynet',
        alt: ['docker network inspect mynet --format "{{json .Containers}}"'],
        expect: /172\.20\.0\.0|Subnet/,
        teach: '**自定义 bridge 网络里的容器可以用容器名互相解析**，默认的 `bridge` 网络不行（只能靠已废弃的 `--link`）。这也是 compose 默认给每个项目建一个网络的原因。'
      },

      {
        id: 'k8s-get-pods',
        cat: 'kubernetes',
        title: '看集群里的 Pod 状态',
        prompt: '你要在 my-app 命名空间里看清所有 Pod 的状态与重启次数。',
        task: '列出 my-app 命名空间下的所有 Pod',
        steps: [
          { title: '确认连的是哪个集群', about: '执行前先确认没切错环境', cmd: 'kubectl config current-context', ref: 'k8s-config', hint: ['客户端可能同时存着好几套集群的凭据，动手前先确认当前 context 指向哪一套，别把命令打到生产上', 'kubectl config ____'], note: '确认没切错环境' },
          { title: '列出 Pod', about: '看清状态与重启次数', cmd: 'kubectl get pods -n my-app', ref: 'k8s-get', hint: ['STATUS 列能看出谁 CrashLoopBackOff、谁 Pending，RESTARTS 列能看出重启了几次 —— 题目指定了哪个命名空间？', 'kubectl get pods ____ my-app'], note: 'web 两个副本正常，worker 在 CrashLoopBackOff，batch-job 在 Pending' }
        ],
        answer: 'kubectl get pods -n my-app',
        alt: [
          'kubectl get pods --namespace my-app',
          'kubectl get pod -n my-app',
          'kubectl get pods -n my-app -o wide',
          'kubectl get po -n my-app'
        ],
        expect: /CrashLoopBackOff|web-7d9c4b8f5/,
        teach: '排错第一步永远是 `get`：先看清 STATUS 与 RESTARTS。这里能直接看到 `worker-...` 处于 `CrashLoopBackOff`、`batch-job-...` 处于 `Pending` —— 两个不同的病，要用不同方法治。'
      },

      {
        id: 'k8s-describe',
        cat: 'kubernetes',
        title: '看 Pod 的事件找根因',
        prompt: '有个 Pod 一直 Pending，你要看它的详细事件，找出调度失败的原因。',
        task: '查看 batch-job-28471920-x7klm 这个 Pod 的详细信息',
        steps: [
          { title: '确认它卡在 Pending', about: 'RESTARTS 是 0，说明还没起来过', cmd: 'kubectl get pods -n my-app', ref: 'k8s-get', hint: ['RESTARTS 是 0 就说明容器从没起来过 —— 先确认这个 Pod 卡在哪一列状态上、调度到底成没成功', 'kubectl get pods ____ my-app'], note: 'STATUS 是 Pending，RESTARTS 是 0' },
          { title: '看详细事件', about: '拉到最底看 Events', cmd: 'kubectl describe pod batch-job-28471920-x7klm -n my-app', ref: 'k8s-describe', hint: ['Pending 意味着调度没成功，原因不在资源内容里，而在调度器留下的那串事件 —— 哪个子命令能把对象的事件展开？', 'kubectl describe ____ batch-job-28471920-x7klm -n my-app'], note: '拉到最底看 Events' }
        ],
        answer: 'kubectl describe pod batch-job-28471920-x7klm -n my-app',
        alt: [
          'kubectl describe pod batch-job-28471920-x7klm',
          'kubectl describe pods batch-job-28471920-x7klm -n my-app',
          'kubectl describe po batch-job-28471920-x7klm -n my-app'
        ],
        expect: /FailedScheduling|Insufficient cpu/,
        teach: '`describe` 的价值在末尾的 **Events**。这里能看到 `0/3 nodes are available: 2 Insufficient cpu` —— 节点 CPU 不够，不是镜像也不是配置问题。看 `get -o yaml` 是找不到这条信息的。'
      },

      {
        id: 'k8s-logs-prev',
        cat: 'kubernetes',
        title: '看崩溃前的日志',
        prompt: 'worker 这个 Pod 在 CrashLoopBackOff 反复重启，当前容器的日志看不到崩溃原因。',
        task: '查看该 Pod 上一个已终止容器实例的日志',
        steps: [
          { title: '先看当前容器的日志', about: '只有启动阶段那几行', cmd: 'kubectl logs worker-6b8f7c9d4-m2vqt -n my-app', ref: 'k8s-logs', hint: ['先拿到当前这个容器实例的标准输出，才能判断崩溃信息是不是根本不在这里', 'kubectl ____ worker-6b8f7c9d4-m2vqt -n my-app'], note: '只有启动阶段那几行，看不到崩溃原因' },
          { title: '看上一个实例的日志', about: '崩溃现场在这里', cmd: 'kubectl logs worker-6b8f7c9d4-m2vqt --previous -n my-app', ref: 'k8s-logs', hint: ['容器反复重启时，正在跑的那个已经把上次崩溃的输出覆盖了 —— 哪个选项能取到已被终止的那份日志？', 'kubectl logs worker-6b8f7c9d4-m2vqt ____ -n my-app'], note: '崩溃现场在这里：连不上 cache-prod-01' }
        ],
        answer: 'kubectl logs worker-6b8f7c9d4-m2vqt --previous -n my-app',
        alt: [
          'kubectl logs worker-6b8f7c9d4-m2vqt -p -n my-app',
          'kubectl logs --previous worker-6b8f7c9d4-m2vqt -n my-app',
          'kubectl logs worker-6b8f7c9d4-m2vqt --previous'
        ],
        expect: /UnknownHostException|cache-prod-01/,
        teach: '**`--previous` 是 CrashLoopBackOff 的唯一线索**：当前容器刚起来还没输出就挂了，只有上一个实例的日志里有崩溃现场。这里显示连不上 `cache-prod-01`（DNS 解析失败）。'
      },

      {
        id: 'k8s-endpoints',
        cat: 'kubernetes',
        title: 'Service 不通的第一嫌疑',
        prompt: '访问 Service 完全不通，你要确认它背后到底有没有可用的 Pod。',
        task: '查看 my-app 命名空间下 Service 的 endpoints',
        steps: [
          { title: '先看 Service 本身', about: '端口与类型都正常', cmd: 'kubectl get svc -n my-app', ref: 'k8s-get', hint: ['Service 的端口、类型往往都是对的，看着正常 —— 先确认它自己没问题，随后要查的是它背后的关联对象', 'kubectl get ____ -n my-app'], note: 'ClusterIP/NodePort/LoadBalancer 都在，看着很正常' },
          { title: '看背后的 endpoints', about: '为 <none> 就是根因', cmd: 'kubectl get endpoints -n my-app', ref: 'k8s-get', hint: ['Service 只是个虚拟 IP，真正承接流量的是它选择器匹配到的后端对象 —— 名字写成 none，说明一个都没匹配上', 'kubectl get ____ -n my-app'], note: 'worker 那一行是 <none> —— 根因就在这里' }
        ],
        answer: 'kubectl get endpoints -n my-app',
        alt: [
          'kubectl get ep -n my-app',
          'kubectl get endpoints --namespace my-app',
          'kubectl get endpoints web -n my-app',
          'kubectl get ep'
        ],
        expect: /172\.20\.|none/,
        teach: '**90% 的"Service 不通"是 endpoints 为空**：要么选择器没匹配到 Pod，要么 Pod 没通过 readiness 探针。看输出里 `worker` 和 `web-nodeport` 的对比就明白了 —— 没有 Ready 的 Pod 就没有 endpoint。'
      },

      {
        id: 'k8s-events',
        cat: 'kubernetes',
        title: '按时间看集群事件',
        prompt: '集群里好几个资源都出问题了，你想按时间顺序看最近发生了什么。',
        task: '查看所有命名空间的事件，并按时间倒序排列',
        steps: [
          { title: '先看所有事件', about: '顺序是乱的', cmd: 'kubectl get events -A', ref: 'k8s-get-events', hint: ['事件对象本身就是一条条记录，把全部命名空间的都列出来 —— 注意默认顺序既不是时间也不是因果', 'kubectl get events ____'], note: '顺序是乱的，Warning 和 Normal 混在一起' },
          { title: '按时间排序', about: '理清因果关系', cmd: 'kubectl get events -A --sort-by=.lastTimestamp', ref: 'k8s-get-events', hint: ['想看出"先失败调度、后触发扩容"这类因果，就得让输出按事件的时间字段排序，并把顺序倒过来看', 'kubectl get events -A ____=.lastTimestamp'], note: '最近发生的排在最后，因果关系才看得清' }
        ],
        answer: 'kubectl get events -A --sort-by=.lastTimestamp',
        alt: [
          'kubectl get events --all-namespaces --sort-by=.lastTimestamp',
          'kubectl get events -A --sort-by .lastTimestamp',
          'kubectl get events --sort-by=.lastTimestamp -A'
        ],
        expect: /Warning|FailedScheduling/,
        teach: '**不加 `--sort-by` 时事件顺序是乱的**，容易把因果搞反。加 `--field-selector type=Warning` 可以只看告警。注意 Events 默认只保留 1 小时，事后追查就没了。'
      },

      {
        id: 'k8s-nodes',
        cat: 'kubernetes',
        title: '确认节点都健康',
        prompt: 'Pod 调度不上去，你要先确认节点是不是都 Ready、各自的 IP 与版本。',
        task: '用 wide 格式查看所有节点',
        steps: [
          { title: '看节点基本状态', about: '确认没有 NotReady', cmd: 'kubectl get nodes', ref: 'k8s-get-nodes', hint: ['调度失败不一定是没资源 —— 节点 NotReady 时上面的 Pod 全都不正常，先看三个节点是不是都 Ready', 'kubectl get ____'], note: '三个节点都是 Ready，说明不是节点挂了' },
          { title: '看更多节点细节', about: '内网 IP / OS / 容器运行时', cmd: 'kubectl get nodes -o wide', ref: 'k8s-get-nodes', hint: ['默认只有名字、状态、角色、版本几列，要看内网 IP、内核、容器运行时得换一种更宽的输出格式', 'kubectl get nodes ____ wide'], note: '多出内网 IP、OS、内核、容器运行时几列' }
        ],
        answer: 'kubectl get nodes -o wide',
        alt: ['kubectl get nodes -owide', 'kubectl get node -o wide', 'kubectl get no -o wide'],
        expect: /Ready|INTERNAL-IP/,
        teach: '`-o wide` 多出 INTERNAL-IP、OS、内核、容器运行时几列。**排任何"Pod 起不来"之前都要先看节点**：节点 NotReady 时上面的 Pod 全都会异常，那不是应用的问题。'
      },

      {
        id: 'k8s-top',
        cat: 'kubernetes',
        title: '看谁在吃资源',
        prompt: '节点负载很高，你要看各节点的 CPU 与内存实际用量。',
        task: '查看各节点的资源使用量',
        steps: [
          { title: '先看节点概览', about: '状态看不出负载', cmd: 'kubectl get nodes', ref: 'k8s-get-nodes', hint: ['Ready 只说明节点活着，看不出它有多忙 —— 先确认状态没问题，压力得用另一类子命令去量', 'kubectl get ____'], note: '状态都是 Ready，看不出负载' },
          { title: '看节点真实用量', about: 'CPU 与内存的实际占用', cmd: 'kubectl top node', ref: 'k8s-top', hint: ['节点状态列看不出负载，要的是 CPU 核数与内存的真实占用 —— 这是另一类子命令，数据来自 metrics-server', 'kubectl top ____'], note: '10.0.1.23 的 CPU 已经 39%、内存 51%' },
          { title: '看是哪个 Pod 吃的', about: '定位到具体工作负载', cmd: 'kubectl top pod', ref: 'k8s-top', hint: ['下一步要落到单个工作负载上，才知道是谁把节点吃满的 —— 得给上面那条用量命令换个对象类型', 'kubectl top ____'], note: 'mysql-0 内存 1824Mi 最扎眼' }
        ],
        answer: 'kubectl top node',
        alt: ['kubectl top nodes'],
        expect: /CPU\(cores\)|MEMORY/,
        teach: '数据来自 metrics-server，报 `Metrics API not available` 说明集群没装它。**注意这是瞬时采样**，不能用来算流量或计费。看 Pod 用 `kubectl top pod -A --sort-by=memory`。'
      },

      {
        id: 'hl-release-inventory',
        cat: 'helm',
        title: '接手集群：看清有哪些 release，并学会退回上一版',
        prompt: '你新接手一套 CCE 集群。`kubectl get pods -A` 只能看到 Pod，看不出"这套东西是谁装的、装的是哪个版本"。而上线出问题时，你要能马上退回上一版。',
        task: '列出所有命名空间的 release，读一个 release 的历史，并完成一次回滚验证',
        steps: [
          { title: '确认 helm 版本', about: 'v3 与 v2 的用法差别很大', cmd: 'helm version', ref: 'hl-plugin', hint: ['v2 靠服务端组件管发布、v3 把 release 记在命名空间的 Secret 里 —— 先确认客户端版本，后面所有命令的写法都取决于它', 'helm ____'], note: 'v3 没有 Tiller，release 存在命名空间的 Secret 里' },
          { title: '列出所有命名空间的 release', about: '接管集群先清点，别漏掉别的命名空间', cmd: 'helm list -A', ref: 'hl-list', hint: ['接管集群时最怕漏看：release 散在各个命名空间里 —— 加个选项让它跨全部命名空间列出来', 'helm list ____'], note: 'myapp / prometheus / mysql 三个 release，各在各的命名空间' },
          { title: '感受默认命名空间的坑', about: '不写 -n/-A 时只看 kubeconfig 的命名空间', cmd: 'helm list', ref: 'hl-list', hint: ['默认范围跟 kubeconfig 当前 context 的命名空间一致 —— 什么都不加地跑一次，对照上一步就知道会漏看多少', 'helm ____'], note: '只剩 mysql —— 因为 current-context 的默认命名空间是 default' },
          { title: '看单个命名空间', about: '只看这个命名空间，注意 REVISION 列', cmd: 'helm list -n my-app', ref: 'hl-list', hint: ['把范围收到题目指定的那个命名空间，顺便留意 REVISION 列 —— 它已经不等于 1，说明升过级', 'helm list ____ my-app'], note: 'REVISION=3：这个 release 已经升过两次' },
          { title: '看它的版本历史', about: '看每次升级留下的版本记录，只增不删', cmd: 'helm history myapp', ref: 'hl-history', hint: ['每次 upgrade 和 rollback 都会留一条带编号的版本记录，只增不删 —— 要挨个看这些版本，用哪个子命令？', 'helm ____ myapp'], note: '每次 upgrade/rollback 都是一条新 revision，只增不删' },
          { title: '回滚到上一版', about: '发现新版本有问题，退回上一个可用版本', cmd: 'helm rollback myapp 3', ref: 'hl-rollback', hint: ['回滚要两个参数：release 名字，以及历史里那个 revision 编号 —— 上一步查到的编号在这里直接用上', 'helm rollback ____ 3'], note: '回滚只改 K8s 资源，不管数据库迁移' },
          { title: '确认历史里留下了记录', about: '回滚也是一次新 revision', cmd: 'helm history myapp', ref: 'hl-history', hint: ['回滚不是把历史删回去，而是又发了一版 —— 再查一次版本记录，看最新那条写了什么', 'helm ____ myapp'], note: '多出一条 Rollback to 3 —— 回滚不是"撤销"，而是"再发布一次老版本"' }
        ],
        answer: 'helm list -A && helm history myapp && helm rollback myapp 3 && helm history myapp',
        alt: [
          'helm list -A && helm rollback myapp 3 && helm history myapp',
          'helm ls -A && helm history myapp && helm rollback myapp 2 && helm history myapp'
        ],
        expect: /Rollback to \d/,
        teach: '一个 release 由**名字 + 命名空间 + revision** 唯一确定，所以同一个 chart 可以在不同命名空间各装一份。**`helm list` 默认只看 kubeconfig 当前 context 的命名空间**（这里是 `default`），这不是 bug 而是和 kubectl 一致的设计 —— 摸清集群请一律加 `-A`。release 的元数据存在命名空间里的 Secret（`sh.helm.release.v1.<release>.v<rev>`），所以 `kubectl get secret -n my-app` 能看到 helm 的痕迹。回滚要记住两件事：① `helm rollback` 是**新增一条 revision**（历史只增不减，回滚记录本身可追溯）；② 它只回退 K8s 资源，**不会撤销数据库迁移、消息格式变更这类有状态改动** —— 这也是"回滚后依然报错"的头号原因。上线时配合 `--atomic --wait` 可以让升级失败自动回滚。'
      },

      {
        id: 'hl-template-before-install',
        cat: 'helm',
        title: '上线前先用 helm template 看清会创建什么',
        prompt: '灰度环境要装一个新服务。你不想直接 install 到集群里再看效果 —— 万一镜像 tag 写错、副本数写多，先污染的是环境。你要先在本地把 YAML 渲染出来确认。',
        task: '渲染 chart 看清镜像与副本数，用 --set 改一个值，最后干跑一次安装',
        steps: [
          { title: '先在仓库里找到 chart', about: '在已添加的仓库里按名字找可用的 chart', cmd: 'helm search repo web', ref: 'hl-repo-search', hint: ['CHART VERSION 是 chart 自身的版本，APP VERSION 是里面应用的版本，别把两者当一回事 —— 先在仓库里按名字找', 'helm search ____ web'], note: 'CHART VERSION 是 chart 版本，APP VERSION 是里面的应用版本，两者不是一回事' },
          { title: '本地渲染出清单', about: '不连集群，先在本地把模板渲染成 YAML', cmd: 'helm template myorg/web', ref: 'hl-template', hint: ['install 之前想先看到会生成哪些 YAML，就得让 chart 在本地走一遍模板渲染 —— 不连集群、不创建 release 的那个子命令', 'helm ____ myorg/web'], note: '没给 release 名时用 release-name 占位' },
          { title: '换名字再改副本数', about: '--set 覆盖 values', cmd: 'helm template canary myorg/web --set replicaCount=1', ref: 'hl-template', hint: ['渲染时能带上 release 名，并用命令行值压掉 chart 里自带的默认值 —— 键按点号走层级，全小驼峰要和 values.yaml 对齐', 'helm template canary myorg/web ____ replicaCount=1'], note: '--set 的键就是 values.yaml 里的路径，点号表示层级' },
          { title: '只挑关键行看', about: 'grep 出 kind/image/replicas', cmd: 'helm template canary myorg/web --set replicaCount=1 | grep -E "kind:|replicas:|image:"', ref: 'hl-template', hint: ['渲染出来几十行 YAML 挨个看太慢，用扩展正则一次筛出对象类型、副本数、镜像三类行就够了', 'helm template canary myorg/web --set replicaCount=1 | ____ -E "kind:|replicas:|image:"'], note: '三个对象：ServiceAccount / Service / Deployment' },
          { title: '干跑一次安装', about: 'install --dry-run 不真正写入', cmd: 'helm install canary myorg/web -n my-app --set replicaCount=1 --dry-run | head -6', ref: 'hl-install', hint: ['正式 install 会真的往集群写资源，所以先用"只走流程不落地"的那个选项跑一遍，看输出的 STATUS 就行', 'helm install canary myorg/web -n my-app --set replicaCount=1 ____ | head -6'], note: 'STATUS: pending-install —— 干跑不会产生 release' },
          { title: '确认干跑没留下东西', about: '列一遍确认灰度那次没有真的落地', cmd: 'helm list -n my-app', ref: 'hl-list', hint: ['干跑成不成功不看输出，看它有没有真的产生 release —— 到命名空间里列一遍，确认没多出那个名字', 'helm list ____ my-app'], note: '只有 myapp，canary 没有落地' }
        ],
        answer: 'helm template canary myorg/web --set replicaCount=1 | grep -E "kind:|replicas:|image:"',
        alt: [
          'helm template canary myorg/web --set replicaCount=1 | grep replicas:',
          'helm template canary myorg/web --set replicaCount=1 | tail -45'
        ],
        expect: /replicas: 1/,
        teach: '**`helm template` 是"发布前唯一能白看清单"的手段**：它只做模板渲染，不连集群、不创建 release，所以可以放进 CI 里对渲染结果做 `git diff` —— "这次发布到底改了什么 K8s 字段"一目了然。它和 `helm install --dry-run` 的区别：前者连 values 合并都只做本地计算，后者会连集群校验（例如命名空间是否存在、API 版本是否可用）。`--set` 的点号是**路径**：`--set image.tag=1.2.4` 会覆盖 `image: { tag: ... }`；改多个值可以重复写 `--set`，值里含逗号时要用 `--set-string` 或转义。最后记住资源命名规则：清单里的 `metadata.name` 是 `{{ release }}-{{ chart }}`，**release 名是资源名的一部分**，所以改名等于换一套新资源，而不是原地更新。'
      },

      /* ══════════════════════════════════════════════════════════════════
         下面几节补 kubernetes 的空白：80 条记录原先只有 7 节课。
         选题标准与前几批一致：**云原生排障最常被问到、且只用只读命令就能回答**的那几件事。
         ══════════════════════════════════════════════════════════════════ */

      {
        id: 'k8s-pod-dns-broken',
        cat: 'kubernetes',
        title: 'Pod 里解析不了另一个服务的名字',
        prompt: '应用日志里反复出现 `cannot resolve host cache-prod-01`，可那个服务明明 `Running`、Pod 也正常。问题不在应用代码，而在**集群内的服务发现**这一层。',
        task: '确认容器里的 DNS 配置，并逐层核对服务对象、端点与集群 DNS 组件',
        steps: [
          { title: '看容器里的 DNS 配置', about: '容器解析域名靠的是一份挂进去的配置', cmd: 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- cat /etc/resolv.conf', ref: 'k8s-exec-dns', hint: ['容器里的域名解析不靠宿主机那份配置，而是单独挂进去的一份文件：把它直接打出来，重点看 search 域与 nameserver', 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- ____ /etc/resolv.conf'], note: 'search 域是 my-app.svc.cluster.local —— 所以短名字会被自动补成"服务.命名空间"' },
          { title: '确认服务对象在不在', about: '先确定这个名字对应的对象存在', cmd: 'kubectl get svc -n my-app', ref: 'k8s-troubleshoot-svc', hint: ['名字解析不出来，第一步不是查 DNS，而是确认"这个名字对应的服务对象到底存不存在"—— 列一遍这个命名空间里的服务', 'kubectl get ____ -n my-app'], note: 'cache 服务的 ClusterIP 是 172.20.0.31 —— 对象存在，DNS 不是唯一嫌疑' },
          { title: '看服务背后有没有 Pod', about: '服务存在不代表流量有人接', cmd: 'kubectl get endpoints -n my-app', ref: 'k8s-endpointslices', hint: ['服务对象存在不代表有后端：要看它挂的端点列表是不是空的 —— 空端点意味着选择器没匹配到任何 Pod', 'kubectl get ____ -n my-app'], note: 'cache 的 ENDPOINTS 里有真实 Pod IP —— 后端是健康的，问题更可能在那台客户端容器的解析上' },
          { title: '确认集群 DNS 组件在跑', about: '负责解析的那个组件本身', cmd: 'kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide', ref: 'k8s-exec-dns', hint: ['前面几层都正常，就该怀疑"负责解析的组件"本身：它在 kube-system 里，用标签筛出来看状态与所在节点', 'kubectl get pods -n kube-system -l ____ -o wide'], note: 'CoreDNS 是 Running —— 集群侧解析链路完整，回到客户端容器上找原因' }
        ],
        answer: 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- cat /etc/resolv.conf',
        alt: [
          'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- cat /etc/resolv.conf | head -3',
          'kubectl get endpoints -n my-app'
        ],
        expect: /cluster\.local|ENDPOINTS/,
        teach: '**集群内服务发现的分层顺序是固定的**：① 容器里的 `/etc/resolv.conf`（决定短名字被补成什么全名）→ ② Service 对象是否存在（`kubectl get svc`）→ ③ Service 的 Endpoints 是否为空（**这一层最容易被跳过，也最常出问题**）→ ④ CoreDNS 是否在跑（`kubectl get pods -n kube-system -l k8s-app=kube-dns`）。短名字 `cache-prod-01` 会被自动补成 `cache-prod-01.<当前命名空间>.svc.cluster.local`，所以**跨命名空间时必须写全名** —— "同名的服务在另一个命名空间里"是解析失败最常见的原因。Endpoints 为空几乎总是**标签选择器没对上**：`kubectl get svc cache -o yaml` 看 `spec.selector`，再 `kubectl get pods --show-labels` 对一遍；也可能是 Pod 没 Ready（就绪探针没过）—— **没 Ready 的 Pod 不会被挂进 Endpoints**。还有一个隐蔽情况：NetworkPolicy 默认拒绝跨命名空间流量，解析通了但连不上，报的是超时而不是解析失败，两者要分清。'
      },

      {
        id: 'k8s-rollout-verify',
        cat: 'kubernetes',
        title: '发布之后：怎么确认成功、怎么退回去',
        prompt: '刚 `apply` 了新镜像，Pod 也起来了，但你并不确定"这次发布到底完成没有"。更麻烦的是：如果三分钟后用户开始报错，你需要**在几十秒内退回去**。',
        task: '确认滚动更新的状态与历史，掌握回滚与强制重建两个动作',
        steps: [
          { title: '确认这次发布完成没有', about: '滚动更新有自己的进度状态', cmd: 'kubectl rollout status deploy/web -n my-app', ref: 'k8s-rollout', hint: ['Pod 变成 Running 不等于发布完成 —— 滚动更新有独立的进度状态，要专门去问它', 'kubectl rollout ____ deploy/web -n my-app'], note: '"successfully rolled out" 才是"这次发布真的完成"' },
          { title: '看清有哪些版本可退', about: '要回滚就得先知道能退到哪一版', cmd: 'kubectl rollout history deploy/web -n my-app', ref: 'k8s-rollout', hint: ['回滚前必须先知道能退到哪一版：把这个 Deployment 的变更历史列出来', 'kubectl rollout ____ deploy/web -n my-app'], note: 'REVISION 1/2/3 —— 出问题时退到上一个正常的版本号' },
          { title: '退回指定版本', about: '用版本号精确回退', cmd: 'kubectl rollout undo deploy/web --to-revision=3 -n my-app', ref: 'k8s-rollout', hint: ['确认目标版本号之后退回去 —— 用"退回到某一版"的子命令，版本号用 --to-revision 指定', 'kubectl rollout ____ deploy/web --to-revision=3 -n my-app'], note: '回滚是**新建一次滚动更新**，不是把历史倒带 —— 所以它自己也会进历史' },
          { title: '不改镜像也让 Pod 重建', about: '改了配置要触发滚动重启', cmd: 'kubectl rollout restart deploy/web -n my-app', ref: 'k8s-rollout', hint: ['还有一种常见需求：镜像没变但要强制重建 Pod（例如刚改了 ConfigMap 而应用不支持热加载）—— 这是触发滚动重启的做法', 'kubectl rollout ____ deploy/web -n my-app'], note: '滚动重启会逐批替换 Pod，不中断服务（前提是副本数 ≥2 且探针配好）' }
        ],
        answer: 'kubectl rollout history deploy/web -n my-app',
        alt: [
          'kubectl rollout history deploy/web -n my-app --revision=3',
          'kubectl rollout status deploy/web -n my-app && kubectl rollout history deploy/web -n my-app'
        ],
        expect: /REVISION/,
        teach: '**"Pod 是 Running"和"发布成功"是三件不同的事**，要分别证明：容器起来了 / 滚动更新完成（`rollout status`）/ 业务真的能通（探针 + 冒烟请求）。`kubectl rollout status` 会一直等到完成或超时，**放进 CI 才能挡住"发到一半就报成功"**。回滚的关键认识：**`rollout undo` 是一次新的滚动更新**，它会生成新的 ReplicaSet 并进入历史（所以"回滚"本身也可以再回滚）—— 这意味着**回滚不需要重新构建镜像**，秒级生效，这是 K8s 相比传统部署最大的止血优势。两条纪律：① **发布前先记下当前 revision**（`rollout history` 的输出存一份），故障时才知道退到哪；② `rollout restart` 常被用来对付"改了 ConfigMap 但没生效"——因为**环境变量形式的配置不会热更新**，必须重建 Pod，而挂载成文件的形式则会自动同步（有几十秒延迟）。最后：`CHANGE-CAUSE` 一列默认是 `<none>`，用 `kubectl annotate deploy/web kubernetes.io/change-cause="镜像 1.2.4"` 记一下，回滚时才能一眼看出哪一版是什么改动 —— 这个习惯能省掉大量翻提交记录的时间。'
      },

      {
        id: 'k8s-secret-not-in-yaml',
        cat: 'kubernetes',
        title: '密码不要写进 YAML',
        prompt: '要给应用配数据库口令。最省事的做法是直接写进 Deployment 的 `env`，但那份 YAML 会进 Git —— 等于把口令连同代码一起提交了。正确做法是让口令**只存在于 Secret 对象里**。',
        task: '创建 Secret 并验证它的值，确认它不会以明文出现在清单里',
        steps: [
          { title: '确认现在有哪些 Secret', about: '先看命名空间里已有什么', cmd: 'kubectl get secret -n my-app', ref: 'k8s-create-secret-generic', hint: ['动手之前先看清现状：列出这个命名空间里已有的机密对象，避免覆盖别人建好的', 'kubectl get ____ -n my-app'], note: 'db-secret 的 TYPE 是 Opaque —— 普通的键值机密' },
          { title: '看它的存储形态', about: '机密在清单里长什么样', cmd: 'kubectl get secret db-secret -n my-app -o yaml | head -20', ref: 'k8s-create-secret-generic', hint: ['"密码不落明文"要能证明：把机密对象按 YAML 打出来看 —— 值那一栏是什么形态？', 'kubectl get secret db-secret -n my-app -o ____ | head -20'], note: 'data 下面是一串 base64 —— **注意：base64 不是加密，只是编码**' },
          { title: '取出真实值验证', about: '确认存进去的确实是那个口令', cmd: "kubectl get secret db-secret -n my-app -o jsonpath='{.data.password}' | base64 -d", ref: 'k8s-create-secret-generic', hint: ['存进去的值要能取出来核对，否则应用连不上你不知道是口令错了还是配置没挂上 —— 取字段再解码', "kubectl get secret db-secret -n my-app -o jsonpath='{.data.____}' | base64 -d"], note: '解出来就是应用真正拿到的口令 —— 这也说明**谁能读 Secret 谁就能拿到口令**，RBAC 必须收紧' }
        ],
        answer: "kubectl get secret db-secret -n my-app -o jsonpath='{.data.password}' | base64 -d",
        alt: [
          "kubectl get secret db-secret -n my-app -o jsonpath='{.data.password}' | base64 --decode",
          'kubectl get secret db-secret -n my-app'
        ],
        expect: /MyP@ssw0rd|db-secret/,
        teach: '**`data` 里的 base64 不是加密。** 这一条必须刻进直觉：`kubectl get secret -o yaml` 得到的串，任何人 `base64 -d` 就能还原。Secret 与 ConfigMap 的**真正区别只有三点**：① 传输与落盘时 etcd 可配加密；② 不被写入容器镜像；③ **可以被 RBAC 单独管控**（这才是它的核心价值 —— 让"能部署"的人未必"能看口令"）。所以三条纪律：**别把口令写进 Deployment 的 env 或镜像**（会进 Git、进镜像层）；**用 `--from-literal`/`--from-file` 建 Secret**，或更彻底地用外部密钥管理（Vault / 云 KMS）配合 initContainer 注入；**收紧 `get secret` 的权限**（`kubectl auth can-i get secrets -n my-app --as=...` 能查）。另一个高频坑：**Secret 更新后，以环境变量方式引用的 Pod 不会自动更新**，必须 `rollout restart`；而挂载成文件的方式会在一分钟左右自动同步。生产上还常配 **Sealed Secrets / External Secrets** 把加密后的清单纳入 Git —— 这样"GitOps 与不落明文"就不冲突了。'
      },

      {
        id: 'k8s-sa-token-permission',
        cat: 'kubernetes',
        title: '这个 ServiceAccount 到底能干什么',
        prompt: 'CI 流水线里用了一个 ServiceAccount 来部署应用，报 `forbidden`。到底是权限不够、还是它的令牌有问题？你需要**用它的身份去问集群**，而不是猜。',
        task: '查看命名空间里的 ServiceAccount，取一个令牌，并以它的身份验证权限',
        steps: [
          { title: '看有哪些 ServiceAccount', about: '先确认对象存在', cmd: 'kubectl get sa -n my-app', ref: 'k8s-create-serviceaccount', hint: ['报权限错误时先确认"用的那个身份对象存在吗"—— 列出这个命名空间里的服务账号', 'kubectl get ____ -n my-app'], note: '每个命名空间都有个 default，业务应该用专用的那个' },
          { title: '取一个令牌', about: '证明这个身份能签发凭证', cmd: 'kubectl create token app-sa -n my-app', ref: 'k8s-create-token', hint: ['要验证权限，先得有"以这个身份说话"的凭证：给它签一个短期令牌出来', 'kubectl create ____ app-sa -n my-app'], note: '输出是一长串 JWT —— 现代 K8s 用 TokenRequest 签发**有期限**的令牌，不再用永不过期的 Secret' },
          { title: '用它的身份问集群', about: '能不能做某个动作，一问便知', cmd: 'kubectl auth can-i get pods --as=system:serviceaccount:my-app:app-sa -n my-app', ref: 'k8s-auth-can-i', hint: ['不用真的拿令牌去试：把"以谁的身份"作为参数问集群 —— 它的身份写法是 system:serviceaccount:命名空间:名字', 'kubectl auth ____ get pods --as=system:serviceaccount:my-app:app-sa -n my-app'], note: 'yes / no 一行就能定位 RBAC 问题，比翻 RoleBinding 快得多' },
          { title: '看令牌里带了什么', about: '凭证本身的内容', cmd: 'kubectl create token app-sa -n my-app -o yaml', ref: 'k8s-create-token', hint: ['令牌除了字符串还有元数据（有效期、受众等）：换个输出格式把它完整打出来', 'kubectl create token app-sa -n my-app -o ____'], note: 'expirationSeconds 决定有效期 —— CI 里应当按任务时长签发，而不是长期有效' }
        ],
        answer: 'kubectl auth can-i get pods --as=system:serviceaccount:my-app:app-sa -n my-app',
        alt: [
          'kubectl get sa -n my-app',
          'kubectl create token app-sa -n my-app -o yaml'
        ],
        expect: /yes|NAME|expiration/,
        teach: '**排 RBAC 问题不要靠猜，用 `kubectl auth can-i --as=` 直接问集群。** 它能回答"某个身份在某个命名空间能不能做某个动作"，把权限排查从"翻 Role / RoleBinding / ClusterRole"变成一次问答。身份写法要记牢：**User** 是 `--as=<用户名>`；**ServiceAccount** 是 `--as=system:serviceaccount:<命名空间>:<名字>`（这个格式写错就查不出来）。ServiceAccount 的演进值得知道：**旧方式是自动创建永不过期的 Secret**（1.24 起不再自动创建），**新方式是 TokenRequest 签发的有期限令牌**（`kubectl create token --duration=1h`）—— 所以"找不到 sa 对应的 secret"在新集群上是正常的，不是坏了。三条实务建议：**别用 default**，每个工作负载建专用 SA（最小权限的前提）；**CI 用的 SA 按流水线需要授权**（通常只需目标命名空间的 deploy 权限，不要给 cluster-admin）；**优先用工作负载身份**（云上的 IRSA / 委托，或 OIDC 联邦）而不是把长期令牌塞进 CI 变量 —— 长期令牌是泄露的头号来源。'
      },

      {
        id: 'k8s-node-pressure',
        cat: 'kubernetes',
        title: '哪个节点最忙，还能不能再往上放',
        prompt: '要加一个副本，但你不确定"集群还有没有余量"。凭感觉挑节点是运维事故的常见起点 —— 需要看**实际的资源占用**，以及每个节点上**已分配出去的 requests**。',
        task: '找出内存与 CPU 占用最高的节点，并看它的已分配资源',
        steps: [
          { title: '按内存排序看节点', about: '实际占用而不是容量', cmd: 'kubectl top node --sort-by=memory', ref: 'k8s-top-node-sort', hint: ['容量（Capacity）和实际占用是两件事：按资源用量排序看节点，先看内存那一列', 'kubectl top node --sort-by=____'], note: 'MEMORY% 那一列最直观 —— 谁快满了先看谁' },
          { title: '按 CPU 排序', about: '换个维度再排一次', cmd: 'kubectl top node --sort-by=cpu -l node-role.kubernetes.io/worker=', ref: 'k8s-top-node-sort', hint: ['换个维度再看一遍（CPU 与内存的瓶颈往往不在同一台）：同时用标签把范围限定到工作节点', 'kubectl top node --sort-by=cpu -l ____'], note: '-l 用标签筛节点，把控制平面排除掉' },
          { title: '看已分配出去的 requests', about: '这才是"还能不能放"的依据', cmd: 'kubectl describe node 10.0.1.23 | grep -A10 -i "allocated resources"', ref: 'k8s-top-node-sort', hint: ['能不能再放 Pod，看的是已分配的 requests 而不是当前用量：这一节在节点详情里，用关键词筛出来', 'kubectl describe node 10.0.1.23 | grep -A10 -i "____ resources"'], note: '调度看的是 Requests/Limits 的百分比 —— **它可能远高于实际利用率**（都申请了但没用）' },
          { title: '看哪个 Pod 最费 CPU', about: '定位到具体工作负载', cmd: 'kubectl top pod -A --sort-by=cpu | head -10', ref: 'k8s-top-node-sort', hint: ['节点忙是结果、Pod 费是原因：把所有命名空间的 Pod 按 CPU 排序取前几名', 'kubectl top pod -A --sort-by=cpu | ____ -10'], note: '-A 跨所有命名空间 —— 往往是个"没人记得"的旧服务在占资源' }
        ],
        answer: 'kubectl top node --sort-by=memory',
        alt: [
          'kubectl top node --sort-by=cpu',
          'kubectl top pod -A --sort-by=cpu | head -10'
        ],
        expect: /MEMORY|CPU\(cores\)/,
        teach: '**"还有没有余量"要分两个口径看，混起来会做错决策**：`kubectl top` 给的是**实际用量**（过去一段时间的采样），而**调度器看的是 `requests`**（Pod 声明的"至少要给我这么多"）。所以会出现两种相反的坑：**节点实际很闲但调度不上去**（requests 声明过大，`Allocated resources` 已经 90%+）；**节点实际很忙但还能调度**（没人声明 requests，全靠抢，一旦同时起来就 OOM）。结论：**核心服务必须写 requests/limits**，`describe node` 的 `Allocated resources` 才是判断余量的依据。几个配套动作：**CPU 是可压缩资源**（超了只会变慢），**内存不可压缩**（超了直接 OOMKilled），所以内存 limits 要保守；**QoS 等级由 requests/limits 是否相等决定**（`Guaranteed` > `Burstable` > `BestEffort`），节点内存紧张时先驱逐 BestEffort；**HPA 扩副本要看指标**，如果瓶颈是节点容量，扩了也调度不上（会一直 Pending，`kubectl describe pod` 里能看到 `Insufficient memory`）。排查"谁在占"用 `kubectl top pod -A --sort-by=cpu|memory`；要长期答案则看监控而不是即时快照。'
      },

      {
        id: 'k8s-events-timeline',
        cat: 'kubernetes',
        title: 'Pod 起不来，先看它身上发生过什么',
        prompt: '一个 Pod 处于 `Pending` 或反复重启。`describe` 给了你长串输出，但真正有用的是**事件**：谁在什么时候对它做了什么、失败了什么原因。',
        task: '按时间顺序看这个 Pod 身上的事件，并把范围缩到只报警告',
        steps: [
          { title: '看这个 Pod 的事件', about: '按对象名筛事件', cmd: 'kubectl get events -n my-app --field-selector involvedObject.name=worker-6b8f7c9d4-m2vqt --sort-by=.lastTimestamp', ref: 'k8s-events-involved-object', hint: ['事件是"某对象身上发生了什么"的记录：用字段选择器把范围限定到某一个对象，并按时间排序', 'kubectl get events -n my-app --field-selector ____ --sort-by=.lastTimestamp'], note: '看 REASON 与 MESSAGE 两列：FailedScheduling / Unhealthy / BackOff 各指向不同原因' },
          { title: '只看报警告的', about: '把噪音滤掉', cmd: 'kubectl get events -n my-app --field-selector type=Warning --sort-by=.lastTimestamp | tail -20', ref: 'k8s-events-involved-object', hint: ['正常事件（Scheduled / Pulled / Created）会淹没有用信息：按类型只筛警告，并取最后若干条', 'kubectl get events -n my-app --field-selector ____ --sort-by=.lastTimestamp | tail -20'], note: 'Warning 级别的基本就是问题线索' },
          { title: '跨命名空间追一条存储问题', about: '有些事件不在业务命名空间里', cmd: 'kubectl get events -A --field-selector involvedObject.name=logs-pvc --sort-by=.lastTimestamp', ref: 'k8s-events-involved-object', hint: ['PVC 的绑定失败往往记在存储组件所在的命名空间：把范围放大到所有命名空间再筛对象名', 'kubectl get events -____ --field-selector involvedObject.name=logs-pvc --sort-by=.lastTimestamp'], note: 'PVC 相关事件可能不在业务命名空间 —— 这就是要 -A 的原因' }
        ],
        answer: 'kubectl get events -n my-app --field-selector type=Warning --sort-by=.lastTimestamp | tail -20',
        alt: [
          'kubectl get events -n my-app --field-selector involvedObject.name=worker-6b8f7c9d4-m2vqt --sort-by=.lastTimestamp',
          'kubectl get events -n my-app --field-selector type=Warning --sort-by=.lastTimestamp'
        ],
        expect: /LAST SEEN|Warning/,
        teach: '**事件是 K8s 排障里最短的那条路径**：它按时间记录"调度器/控制器/kubelet 对这个对象做过什么"，比翻容器日志更早、比读 YAML 更直接。三个高频 REASON 要会读：**`FailedScheduling`**（调度不上 —— 资源不足、污点不容忍、节点选择器/亲和性不匹配，MESSAGE 里会直说）；**`FailedMount` / `FailedAttachVolume`**（卷挂不上 —— 多见于 PVC 没绑定、或跨可用区挂载）；**`BackOff`**（容器反复起失败 —— 配合 `kubectl logs --previous` 看上一次的崩溃日志）。用法上的三个要点：**`--field-selector` 比 grep 可靠**（按结构化字段筛，不会误伤 MESSAGE 里的同名字符串）；**一定要 `--sort-by=.lastTimestamp`**（默认顺序不保证时间序，看故障时间线会乱）；**事件默认只保留 1 小时**（`kube-apiserver` 的 `--event-ttl`），所以**出问题要尽快看，或者把它接进日志系统长期留存**。最后：`kubectl describe pod` 输出的最后那一段就是事件，但 `get events` 能跨对象、能筛类型、能排序 —— 排查时更趁手。'
      },

      {
        id: 'k8s-jsonpath-for-scripts',
        cat: 'kubernetes',
        title: '把 kubectl 的输出取成脚本能用的值',
        prompt: '你要写个巡检脚本：把所有 Pod 的名字和状态取出来。直接把 `kubectl get pods` 的表格塞进脚本是不行的 —— 得让 kubectl **只输出你要的字段**。',
        task: '用 jsonpath 与 custom-columns 取出结构化字段，喂给后续脚本',
        steps: [
          { title: '只取名字与状态', about: '按模板拼出想要的行', cmd: 'kubectl get pods -o jsonpath=\'{range .items[*]}{.metadata.name}{"\\t"}{.status.phase}{"\\n"}{end}\'', ref: 'k8s-jsonpath', hint: ['要写脚本就得拿到"一行一条、字段用制表符分开"的输出：用模板语法遍历 items，逐个打印字段', 'kubectl get pods -o jsonpath=\'{range .items[*]}{.metadata.name}{"\\t"}{.status.____}{"\\n"}{end}\''], note: 'range…end 是 jsonpath 的循环写法 —— 不写它只会取到第一个元素' },
          { title: '改用表格挑列', about: '比 jsonpath 好读的写法', cmd: 'kubectl get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,IP:.status.podIP', ref: 'k8s-jsonpath', hint: ['同样的事有一种更像"选列"的写法：直接给出表头与字段路径的映射，可读性好得多', 'kubectl get pods -o custom-columns=NAME:.metadata.name,____:.spec.nodeName,IP:.status.podIP'], note: 'custom-columns 输出自带表头，适合给人看；jsonpath 适合给程序看' },
          { title: '取单个值', about: '一个字段直接拿出来', cmd: "kubectl get svc my-svc -o jsonpath='{.spec.clusterIP}'", ref: 'k8s-jsonpath', hint: ['脚本里常需要"就取某一个字段"：去掉 range，路径直接写到底', "kubectl get svc my-svc -o jsonpath='{.spec.____}'"], note: '没有多余换行 —— 可以直接赋给 shell 变量' },
          { title: '取出来再解码', about: '把取字段与后续处理接起来', cmd: "kubectl get secret my-secret -o jsonpath='{.data.password}' | base64 -d", ref: 'k8s-jsonpath', hint: ['取出来的值未必能直接用（Secret 的值是编码过的）：把它接给另一个命令做二次处理', "kubectl get secret my-secret -o jsonpath='{.data.password}' | ____ -d"], note: 'kubectl 取字段 + 管道二次处理，是运维脚本最常见的形状' }
        ],
        answer: 'kubectl get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,IP:.status.podIP',
        alt: [
          "kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{\"\\t\"}{.status.phase}{\"\\n\"}{end}'",
          "kubectl get svc my-svc -o jsonpath='{.spec.clusterIP}'"
        ],
        expect: /NAME|web|172\.20/,
        teach: '**脚本里不要解析 kubectl 的表格输出。** 列宽会随内容变化、字段顺序会随版本调整，`awk \'{print $1}\'` 这种写法今天能跑、明天就取错列 —— 而且**取错列往往不报错**，只是静默给出错误的值（这比报错危险得多）。正确做法是让 kubectl 输出结构化字段：**`-o jsonpath`**（适合程序，支持 `range…end` 循环与 `{"\\t"}` 这类字面量）与 **`-o custom-columns`**（适合人看，自带表头，字段缺失时显示 `<none>` 而不是错位）。再往上一层是 `-o json` 配 `jq`（复杂筛选、聚合时更趁手），以及 `-o go-template`（需要条件与函数时）。三个实务要点：**`-o jsonpath` 里取不到字段会静默输出空**，所以脚本里要判空；**多文档输出（`-o json` 加 `--watch`）是流式的 JSON 序列**，不是数组，`jq` 要用 `--seq` 或逐行处理；**`-A` 跨命名空间时记得把 `metadata.namespace` 也取出来**，否则同名资源分不清属于谁。'
      },

      {
        id: 'k8s-taint-scheduling',
        cat: 'kubernetes',
        title: '让某些 Pod 别落到这台机器上',
        prompt: '一台节点上跑着数据库，你不希望普通业务 Pod 被调度上去抢资源。用**污点（taint）**把节点"标记为不欢迎"，而不是靠人记得别往上放。',
        task: '给节点打污点、验证它生效，最后演练如何移除',
        steps: [
          { title: '先看节点现状', about: '确认目标节点与它的标签', cmd: 'kubectl get nodes --show-labels', ref: 'k8s-taint', hint: ['动手前先确认操作对象：把节点与它们的标签一起列出来，看清哪台是数据库节点', 'kubectl get nodes --____'], note: 'ROLES 列能看出哪个是控制平面、哪个是工作节点' },
          { title: '给节点打污点', about: '标记为"不欢迎普通 Pod"', cmd: 'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule', ref: 'k8s-taint', hint: ['污点的写法是"键=值:效果"，效果决定"不容忍的 Pod 会怎样"—— 最常用的是"不调度新的"', 'kubectl taint nodes 10.0.1.11 dedicated=db:____'], note: 'NoSchedule 只影响新调度；已经在跑的 Pod 不会被赶走（那是 NoExecute）' },
          { title: '确认污点生效', about: '回读节点属性', cmd: 'kubectl describe node 10.0.1.11 | grep -i taint', ref: 'k8s-taint', hint: ['改完必须回读：节点详情里专门有一行记录污点', 'kubectl describe node 10.0.1.11 | grep -i ____'], note: 'Taints 一行就是刚才打上去的' },
          { title: '演练如何移除', about: '键后面加一个减号', cmd: 'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule-', ref: 'k8s-taint', hint: ['移除的写法很特别：在**同一个键值后面加一个减号**，而不是另起一个"删除"子命令', 'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule____'], note: '结尾那个减号就是"去掉这个污点"' }
        ],
        answer: 'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule',
        alt: [
          'kubectl get nodes --show-labels',
          'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule-'
        ],
        expect: /tainted|NAME|untainted/,
        teach: '**污点与容忍是"节点拒绝 + Pod 申请例外"的一对机制**，方向与亲和性相反：**污点由节点声明**（"别把普通 Pod 放我这儿"），**容忍由 Pod 声明**（"我能接受这种污点"）。三个效果要分清：**`NoSchedule`** 只影响新调度（已在跑的留着）；**`PreferNoSchedule`** 是软约束（尽量不排）；**`NoExecute`** 最狠 —— **会把不容忍的 Pod 驱逐走**，还能配 `tolerationSeconds` 给个缓冲（这正是"节点失联后 Pod 被自动赶走"的机制）。写法有两处最容易记错：**移除污点是键值后加减号**（`key=value:Effect-`），**查看用 `kubectl describe node` 的 Taints 一行**。选型建议：**定向调度优先用"节点标签 + nodeSelector/亲和性"**（表达"我要去哪"），**污点用来说明"这里不欢迎谁"**（如专用节点、GPU 节点、控制平面）。最后一条经验：给节点打污点前先确认"有没有关键 Pod 正跑在上面且不容忍它"—— `NoExecute` 会立刻驱逐，配错就是把生产服务赶下线。'
      },

      /* ══════════════════════════════════════════════════════════════════
         下面几节补 docker 的空白：56 条记录原先只有 5 节课。
         选题都是"容器环境里最常被问到"的那几件事。
         ══════════════════════════════════════════════════════════════════ */

      {
        id: 'dk-which-container-eats',
        cat: 'docker',
        title: '宿主机变慢了，是哪个容器吃的',
        prompt: '一台跑着七八个容器的宿主机 load 一直很高。你在宿主机上敲 `top`，看到的全是 `containerd-shim` 这类进程名 —— **它不告诉你这是哪个容器**。要按容器维度看资源。',
        task: '按容器维度看 CPU 与内存占用，并定位到具体容器',
        steps: [
          { title: '按容器看资源占用', about: '每个容器的实时用量', cmd: 'docker stats --no-stream', ref: 'dk-stats', hint: ['宿主机的进程视角看不到"容器"这一层：要按容器维度取一次快照，注意要加"只取一次不要一直刷"的那个选项', 'docker stats ____'], note: 'CPU % 与 MEM USAGE / LIMIT 两列 —— **LIMIT 是容器的内存上限**，接近上限就要出事' },
          { title: '只取要汇报的字段', about: '自定义输出格式', cmd: 'docker stats --no-stream --format "{{.Name}} CPU={{.CPUPerc}} MEM={{.MemUsage}}"', ref: 'dk-stats', hint: ['给同事看不需要那一屏表格：用模板只取名字、CPU 与内存三项', 'docker stats --no-stream --format "{{.Name}} CPU={{.____}} MEM={{.MemUsage}}"'], note: 'Go 模板的字段名首字母大写 —— 与 docker ps 的字段是一套' },
          { title: '对照容器清单', about: '确认有哪些容器在跑', cmd: 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"', ref: 'dk-ps', hint: ['stats 里出现的名字要和"实际在跑的容器清单"对得上：列一遍名字、状态与镜像', 'docker ps --format "table {{.Names}}\\t{{.____}}\\t{{.Image}}"'], note: '注意 RESTARTS 高的容器 —— 它可能一直在重启，CPU 峰值都被均摊掉了' }
        ],
        answer: 'docker stats --no-stream',
        alt: [
          'docker stats --no-stream',
          'docker stats --no-stream --format "{{.Name}} CPU={{.CPUPerc}} MEM={{.MemUsage}}"'
        ],
        expect: /CONTAINER ID|CPU %|NAME/,
        teach: '**容器里的进程在宿主机上换了个名字**（`containerd-shim` / `java` / `nginx`），所以宿主机 `top` 很难回答"是哪个容器" —— **容器维度的观测要用容器自己的工具**（`docker stats`、`docker top`、`cadvisor`）。判读 `docker stats` 的四列：**`CPU %`**（可以超过 100%，那是多核累加）、**`MEM USAGE / LIMIT`**（**看 LIMIT** —— 它由 `--memory` 决定，没设就是宿主机全部内存，风险极大）、**`MEM %`**、**`NET I/O` / `BLOCK I/O`**（累计值，要看速率得间隔采样两次相减）。三个实务要点：**必须给容器设 `--memory` 与 `--cpus`**（否则一个容器能吃掉整台机器，还可能被 OOM Killer 选中别的进程）；**`--no-stream` 是脚本里唯一可用的形式**（不加它会一直刷屏、卡住 CI）；**`docker stats` 只给"此刻"**，要历史曲线得靠 `cadvisor` + Prometheus，或云厂商的容器监控。排查"哪个容器拖垮宿主机"的顺序：`docker stats --no-stream` 找大户 → `docker top <容器>` 看里面是哪个进程 → 进容器 `docker exec` 用 `top`/`jstack` 继续下钻。'
      },

      {
        id: 'dk-container-keeps-restarting',
        cat: 'docker',
        title: '容器一直重启，但日志里看不出原因',
        prompt: '一个容器状态栏里 RESTARTS 数字一直在涨，`docker logs` 却只看到正常启动的几行 —— 因为它**每次起来没几秒就被干掉了，日志还没来得及写**。这种时候要看的是"它身上发生过什么事件"。',
        task: '按时间顺序看这个容器的生命周期事件，找出被杀的原因',
        steps: [
          { title: '看容器清单与重启次数', about: '先从状态栏确认现象', cmd: 'docker ps -a', ref: 'dk-ps', hint: ['先确认"确实在反复重启"以及重启了多少次：列出全部容器（包括已退出的那些），看状态与 RESTARTS 两列', 'docker ps ____'], note: 'STATUS 里的 "Restarting" 与 RESTARTS 计数是判据 —— 加了 -a 才能看到已退出的容器' },
          { title: '看这个容器的生命周期事件', about: '起停杀的时间线', cmd: 'docker events --since 2h --until 10m --filter container=web', ref: 'dk-events', hint: ['日志看不到"容器这一层"的动作：要看的是容器生命周期事件，并且限定时间窗与目标容器', 'docker events --since 2h --until 10m --____ container=web'], note: 'create → start → die 的序列与时间点 —— **die 的间隔能看出是"立刻挂"还是"跑一会才挂"**' },
          { title: '只看非正常退出', about: '筛出 die 与 oom 两类事件', cmd: 'docker events --filter event=die --filter event=oom', ref: 'dk-events', hint: ['事件流太长就按类型筛：只留"进程退出"和"内存超限被杀"这两类', 'docker events --filter event=____ --filter event=oom'], note: '**oom 事件说明是被内核 OOM Killer 杀的** —— 日志里当然没有了，因为进程是被强制终止的' },
          { title: '再看一次日志（这次带上前一次的）', about: '上一次实例的日志', cmd: 'docker logs --tail 50 web', ref: 'dk-logs', hint: ['重启过的容器有一个"上一次实例"的日志 —— 直接看当前这次往往是空的，但引擎里我们用 tail 取最近若干行对照', 'docker logs ____ 50 web'], note: '如果日志是空的，基本可以断定是 OOM 或启动命令立刻失败 —— 回到事件里找 oom / die 的退出码' }
        ],
        answer: 'docker events --filter event=die --filter event=oom',
        alt: [
          'docker events --filter event=die --filter event=oom',
          'docker events --since 2h --until 10m --filter container=web'
        ],
        expect: /container (create|start|die|oom)/,
        teach: '**"容器反复重启"要看容器事件，不是看应用日志** —— 因为很多死法（OOM 被杀、启动命令不存在、端口冲突）**进程根本没机会写日志**。`docker events` 给的是容器层的生命周期流水（create / start / die / kill / oom / restart），带时间戳与退出码，是把"重启时间线"还原出来的唯一手段。三种高频死法要能对上：**`oom`**（内存超限被内核杀 —— 加 `--memory` 并调大，或查内存泄漏）；**`die` 且 exitCode 126/127**（`126` = 命令存在但不可执行，通常是忘了 `chmod +x`；`127` = 命令不存在，通常是 entrypoint 写错或基础镜像里没这个程序）；**`die` 且 exitCode 1 且间隔固定**（应用自己崩了，这时才轮到看日志）。两个配套动作：**`docker logs --previous`** 看"上一个实例"的日志（重启过的容器才有意义 —— 这正是"日志里看不出原因"的常见错觉来源）；**`--restart` 策略要选对**（`no` 默认不重启、`on-failure` 只在非 0 退出时重启、`always` 无论怎么退都重启 —— **`always` 配上有 bug 的容器会造成"无限重启"**，掩盖问题还耗资源）。最后：`docker events` 默认只回放最近一段且会一直挂着等新事件，脚本里要用 `--since`/`--until` 限定窗口。'
      },

      {
        id: 'dk-disk-eaten-by-docker',
        cat: 'docker',
        title: '/var/lib/docker 把磁盘吃满了',
        prompt: '磁盘告警，`df` 显示根分区满了。`du -sh /*` 一排下来，`/var/lib/docker` 占了几十 G —— 但你的应用镜像加起来也没那么大。**多出来的是什么？**',
        task: '看清 docker 各类资源的占用，识别可以安全清理的部分',
        steps: [
          { title: '看它的用量账本', about: '镜像/容器/卷/构建缓存各占多少', cmd: 'docker system df', ref: 'dk-system-prune', hint: ['容器引擎自己有一本"用量账本"，按四类资源分别统计总量与可回收量 —— 先看它', 'docker system ____'], note: 'RECLAIMABLE 那一列就是"能清出多少" —— **构建缓存往往是最大头**' },
          { title: '看镜像清单', about: '哪些镜像在占地方', cmd: 'docker images', ref: 'dk-images', hint: ['账本说镜像占了若干 G，具体是哪些：把本地镜像都列出来，看 SIZE 那一列', 'docker ____'], note: '同一个仓库的多个 tag 可能指向同一个镜像（ID 相同），**它们的 SIZE 不重复计算**' },
          { title: '找出悬空镜像', about: '没有标签也没有引用的那些', cmd: 'docker images -f dangling=true', ref: 'dk-images', hint: ['每次重新构建都会留下"没有标签、也没人引用"的旧层：加过滤条件把它们单独挑出来', 'docker images -f ____=true'], note: '`<none>:<none>` 就是悬空镜像 —— 重新构建频繁时它们堆积得很快' },
          { title: '看清理会做什么（不真删）', about: '确认范围再动手', cmd: 'docker system prune', ref: 'dk-system-prune', hint: ['清理是不可逆的，所以先跑一次不带强制的形式，看清它"将要"清掉哪几类资源', 'docker system ____'], note: '它会清悬空镜像、停止的容器、未使用的网络与构建缓存 —— **默认不动数据卷**，这个默认值救过很多人' }
        ],
        answer: 'docker system df',
        alt: [
          'docker system df',
          'docker images -f dangling=true'
        ],
        expect: /TYPE|RECLAIMABLE|REPOSITORY|none/,
        teach: '**`/var/lib/docker` 的占用由五部分组成，认识它们才能安全清理**：**镜像层**（多个 tag 共享层，删一个 tag 不一定释放空间）、**悬空镜像**（`<none>`，重新构建的产物，最该清）、**构建缓存**（BuildKit 的中间层，**往往是最大头且最容易被忽略**）、**停止的容器**（包括它的可写层）、**数据卷**（**唯一不能随便动的 —— 里面是持久化数据**）。清理的分级由保守到激进：**`docker container prune`**（只删停止的容器）→ **`docker image prune`**（删悬空镜像）→ **`docker builder prune`**（删构建缓存）→ **`docker system prune`**（以上全做 + 未使用网络，**仍保留数据卷**）→ **`docker system prune -a --volumes`**（**连没在用的镜像和数据卷一起删 —— 这一步会丢数据，生产上必须逐个确认**）。三条纪律：**先 `docker system df -v` 看清明细再动手**（`-v` 会逐项列出，比汇总更可靠）；**`--volumes` 是红线**（它删的是"当前没有容器使用"的卷，而"暂时没容器用"和"没人要了"是两回事 —— 备份恢复演练时就常踩这个）；**定期在维护窗口做，别等磁盘满了才做**（磁盘 100% 时 `docker` 自身都可能起不来）。另外：**日志也会吃满磁盘** —— 容器的 json 日志默认不限大小，要配 `log-opts` 的 `max-size`/`max-file`，那是另一个常见元凶。'
      },

      {
        id: 'dk-compose-service-down',
        cat: 'docker',
        title: 'compose 起了一半：哪个服务没起来',
        prompt: '`docker compose up -d` 执行完了，但应用还是连不上数据库。compose 里有五六个服务，你要**先确认哪个没在跑**，而不是把所有日志都翻一遍。',
        task: '看清各服务的状态，再针对性地看没起来那个的日志',
        steps: [
          { title: '看各服务状态', about: '哪些在跑、哪些退出了', cmd: 'docker compose ps', ref: 'dk-compose-ps', hint: ['多服务编排最忌讳"从头翻日志"：先要一张状态表 —— 哪个服务在跑、哪个已经退出', 'docker compose ____'], note: '默认只显示运行中的服务 —— **"少了谁"本身就是答案**' },
          { title: '连已退出的一起看', about: '别漏掉退出的服务', cmd: 'docker compose ps -a', ref: 'dk-compose-ps', hint: ['只看到"在跑的服务"是不够的：加上"全部"那个选项，把已退出的也列出来，并看它的退出码', 'docker compose ps ____'], note: 'Exited (1) 的那个就是元凶 —— 退出码直接指向原因类别' },
          { title: '看那个服务的日志', about: '针对性排错', cmd: 'docker compose logs --since 5m db', ref: 'dk-compose-logs', hint: ['状态定位到具体服务之后才看日志：限定服务名与时间窗，避免把整摞日志都拉出来', 'docker compose logs --____ 5m db'], note: 'compose 的日志是**按服务名**取的，不用先查容器 ID —— 这是它比 docker logs 方便的地方' },
          { title: '看 web 服务的日志', about: '顺带确认上游', cmd: 'docker compose logs --tail 100 web', ref: 'dk-compose-logs', hint: ['一个服务起不来往往会连带影响依赖它的服务：把上游那个也看一眼，确认报错是"连不上 db"而不是它自己的问题', 'docker compose logs --____ 100 web'], note: '上游报 "connection refused" 时，根因在 db 而不在 web' }
        ],
        answer: 'docker compose ps -a',
        alt: [
          'docker compose ps -a',
          'docker compose ps'
        ],
        expect: /NAME|Exited|running/,
        teach: '**多服务编排的排查顺序是"先看状态表、再看单个服务日志"** —— 直接翻日志会在五六个服务交织的输出里迷路。`docker compose ps` 的默认行为有个坑：**它只显示运行中的服务**，所以"某个服务不在列表里"就是第一条线索；加 `-a` 才能看到已退出的及其退出码。退出码的读法（与前面"容器反复重启"那节一致）：**0** 正常结束（对一次性任务是对的，对常驻服务就是错的）；**1** 应用自己报错；**126/127** 命令不可执行/不存在（entrypoint 或 `command` 写错）；**137** 被 SIGKILL（多为 OOM 或被 `docker stop` 超时强杀）；**143** 被 SIGTERM（正常停止）。三个高频根因：**依赖顺序**（`depends_on` 只保证启动顺序，**不保证依赖服务"就绪"** —— 应用要自己重试，或用 healthcheck + `condition: service_healthy`）；**环境变量没传进去**（`.env` 文件位置不对、`environment` 写成 `env_file`）；**端口/卷冲突**（宿主机端口已被占用、挂载路径权限不对）。还有一个最容易被忽略的：**`docker compose` 与 `docker-compose` 是两个不同的命令**（v2 插件版与 v1 独立版），参数有差异，脚本里要统一。'
      },

      {
        id: 'dk-volume-outlives-container',
        cat: 'docker',
        title: '"我把容器删了，数据怎么还在"——以及反过来',
        prompt: '有人为了"清干净"把数据库容器 `docker rm -f` 删了，重新 `run` 一个，结果数据**还在**（因为数据卷没删）；另一个人想清理磁盘，跑了带 `--volumes` 的清理，结果**数据真没了**。这两件事的差别就在"数据卷"上。',
        task: '看清有哪些数据卷、它们的挂载点，理解清理的边界',
        steps: [
          { title: '列出所有数据卷', about: '谁在用、有哪些', cmd: 'docker volume ls', ref: 'dk-volume-ls', hint: ['数据不在容器里，而在"卷"里：先把所有卷列出来，看名字与驱动', 'docker volume ____'], note: 'mysqldata / redisdata 这种有名字的是**命名卷** —— 删容器不会动它们' },
          { title: '找出没人用的卷', about: '悬空卷', cmd: 'docker volume ls -f dangling=true', ref: 'dk-volume-ls', hint: ['清理前要先知道"哪些卷当前没有任何容器在用"：加过滤条件单独挑出来', 'docker volume ls -f ____=true'], note: 'dangling 卷 = 当前无容器引用 —— **注意这是"当前没用"而不是"没人要"**' },
          { title: '数一下有多少个卷', about: '清理前的量化', cmd: 'docker volume ls -q | wc -l', ref: 'dk-volume-ls', hint: ['要给清理动作一个可核对的前后对照：只输出卷名再数行数', 'docker volume ls ____ | wc -l'], note: '`-q` 只输出名字，方便接管道 —— 这是 docker 各子命令的通用约定' },
          { title: '看清理会做什么（不真删）', about: '确认边界再动手', cmd: 'docker volume prune -f', ref: 'dk-volume-rm', hint: ['卷是最不能误删的资源：先跑一次它的清理命令，看引擎怎么描述这个动作的边界', 'docker volume ____ -f'], note: '教学环境不会真删；真机上它删的是"当前无容器引用"的卷，**数据不可恢复**' }
        ],
        answer: 'docker volume ls',
        alt: [
          'docker volume ls',
          'docker volume ls -f dangling=true'
        ],
        expect: /VOLUME NAME|mysqldata/,
        teach: '**容器的可写层与数据卷是两回事，这决定了"删容器"到底删掉了什么**：容器自己那层可写层**随容器一起删**（`docker rm` 就没了）；而**数据卷独立存在** —— 删容器**不会**删卷，所以"删了容器数据还在"是**正确行为**，不是 bug。反过来，`docker volume prune` 或 `docker system prune --volumes` **会删掉"当前无容器引用"的卷，且不可恢复** —— 而"当前没容器用"和"没人要了"完全是两回事（恢复演练、临时下线、迁移中间态都会出现无引用的卷）。三条纪律：**有状态服务一律用命名卷或绑定挂载**（`-v mysqldata:/var/lib/mysql` 或 `-v /data/mysql:/var/lib/mysql`），别把数据留在容器可写层里；**清理带 `--volumes` 时逐个确认**（先 `docker volume ls -f dangling=true` 看清名字，甚至 `docker volume inspect` 看它的创建时间与挂载点）；**绑定挂载（bind mount）与命名卷（volume）行为不同** —— 前者的权限、SELinux 标签、备份方式都跟宿主机路径一致，后者由 docker 管理（`/var/lib/docker/volumes/`），备份时前者直接 `tar` 目录、后者要么 `docker run --rm -v vol:/data -v $PWD:/backup alpine tar` 要么用 `docker volume inspect` 找到宿主机路径。最后：**`docker compose down -v` 也会删卷**（`-v` 就是 `--volumes`），这是 compose 用户最容易踩的一脚。'
      },

      {
        id: 'dk-custom-network-alias',
        cat: 'docker',
        title: '两个容器互相连不上：默认网络不做名字解析',
        prompt: '你 `docker run` 起了 app 和 db 两个容器，在 app 里 `ping db` 却报 `bad address` —— 但两个容器都在跑。**问题不在应用，在它们连的是哪个网络**：默认的 `bridge` 网络**不提供容器名解析**。',
        task: '创建自定义网络、把两个容器接进去（带别名），并验证网络成员',
        steps: [
          { title: '先看有哪些网络', about: '容器默认落在哪个网络上', cmd: 'docker network ls', ref: 'dk-network-create', hint: ['连不上先看"它们各自在哪个网络里"：把网络清单列出来，注意默认那个 bridge', 'docker network ____'], note: 'bridge 是默认网络 —— **它只提供 IP 互通，不做容器名解析**' },
          { title: '创建自定义网络', about: '自定义网络才带内嵌 DNS', cmd: 'docker network create appnet', ref: 'dk-network-create', hint: ['要名字能互相解析，就得让它们待在用户自定义网络里：建一个', 'docker network ____ appnet'], note: '返回的一长串是网络 ID —— 自定义网络自带内嵌 DNS，容器名与别名都能解析' },
          { title: '把容器接进去并起别名', about: '别名让应用不用改配置', cmd: 'docker network connect --alias mysql appnet mysql8', ref: 'dk-network-connect', hint: ['把数据库容器接进新网络，并且**给它一个应用里已经在用的名字**作为别名 —— 这样应用配置一行都不用改', 'docker network connect --____ mysql appnet mysql8'], note: '允许"容器名"与"别名"不一致 —— 迁移时特别有用' },
          { title: '验证网络里有哪些成员', about: '回读确认接入成功', cmd: 'docker network inspect appnet', ref: 'dk-network-create', hint: ['改完必须回读：看这个网络的成员列表里是不是已经有刚才那个容器', 'docker network ____ appnet'], note: 'Containers 一节列出成员与它们的 IP —— 这就是"连通性"的事实依据' }
        ],
        answer: 'docker network inspect appnet',
        alt: [
          'docker network inspect bridge',
          'docker network ls'
        ],
        expect: /NETWORK ID|"Name":/,
        teach: '**Docker 默认的 `bridge` 网络与"用户自定义网络"有一个关键差别：只有自定义网络提供内嵌 DNS。** 也就是说：在默认 bridge 上，容器之间只能用 IP 互访（而 IP 每次重建都会变，所以等于没法用）；在自定义网络上，**容器名与 `--alias` 别名都能直接解析**。这是"两个容器互相连不上"最高频的原因，而且报错往往很含糊（`bad address` / `Name or service not known` / `connection refused`）。排查看三层：**① 在不在同一个网络**（`docker network inspect <网络>` 看 Containers 列表 —— 两个容器在**不同**网络里是连不通的，这是第二条高频原因）；**② 名字解析**（在容器里 `getent hosts db` 或 `nslookup db`，解析不出来就是网络类型或别名的问题）；**③ 端口与监听地址**（应用监听 `127.0.0.1` 而不是 `0.0.0.0` 时，容器外永远连不上 —— 这一条与网络无关但同样常见）。三个配套知识：**compose 会自动建一个自定义网络**并把所有服务接进去、**用服务名当主机名**（所以 compose 里通常不用手动建网络）；**`--alias` 的价值在于迁移**（把新数据库容器接进网络并起旧名字的别名，应用无感切换）；**`--internal` 建的是无外网出口的网络**（数据库应当放在这种网络里，只允许应用访问、不允许它主动出网）。'
      },

      /* ══════════════════════════════════════════════════════════════════
         下面几节继续补 kubernetes 的空白（本分类记录最多、可教面也最大）。
         ══════════════════════════════════════════════════════════════════ */

      {
        id: 'k8s-node-maintenance',
        cat: 'kubernetes',
        title: '要给节点换配置：怎么把 Pod 安全挪走',
        prompt: '一台工作节点要停机维护（换规格、打内核补丁）。**直接关机是最糟的做法** —— 上面的 Pod 会同时失联，业务瞬间掉一半。正确做法分两步：先让调度器别再往上放新的，再把已有的赶走。',
        task: '先看清受影响的 Pod，标记节点不可调度，预演驱逐，再真正驱逐并恢复',
        steps: [
          { title: '先看节点上的 Pod', about: '动手前先知道会影响到谁', cmd: 'kubectl get pods -A -o wide --field-selector spec.nodeName=10.0.1.23', ref: 'k8s-pods-by-node', hint: ['维护前必须知道"这台机器上跑着什么"：按节点名筛出 Pod，用扩展输出看它们各自属于哪个工作负载', 'kubectl get pods -A -o wide --field-selector ____=10.0.1.23'], note: '看清是哪些服务会受影响 —— 单副本的服务一旦被驱逐就真的断了' },
          { title: '标记为不可调度', about: '先堵住"新的还会进来"', cmd: 'kubectl cordon 10.0.1.23', ref: 'k8s-cordon', hint: ['第一步不是赶人，而是"别再往里放人"：把节点标记为不可调度', 'kubectl ____ 10.0.1.23'], note: 'cordon 只影响新调度，**已经在跑的 Pod 不会被动**' },
          { title: '预演一次驱逐', about: '先看会驱逐哪些 Pod', cmd: 'kubectl drain 10.0.1.23 --ignore-daemonsets --dry-run=client', ref: 'k8s-drain', hint: ['驱逐是不可逆的（Pod 会被删掉重建）：先用"只报告不执行"的方式跑一遍，看清清单', 'kubectl drain 10.0.1.23 --ignore-daemonsets --____=client'], note: '预演会列出要驱逐的 Pod 与它们的目标节点' },
          { title: '真正驱逐', about: '两个选项各有含义', cmd: 'kubectl drain 10.0.1.23 --ignore-daemonsets --delete-emptydir-data', ref: 'k8s-drain', hint: ['确认清单无误后真的执行：有一类 Pod 本来就该在每个节点上跑一份、赶不走，必须显式忽略；用了临时卷的 Pod 要显式同意丢数据，否则会被拒绝', 'kubectl drain 10.0.1.23 --ignore-daemonsets --____'], note: '**--ignore-daemonsets** 放过 DaemonSet，**--delete-emptydir-data** 同意丢弃临时卷数据' },
          { title: '维护完恢复调度', about: '别忘了这一步', cmd: 'kubectl uncordon 10.0.1.23', ref: 'k8s-cordon', hint: ['维护完成后必须把节点放回可调度，否则它会一直空着 —— 这一步最容易被忘', 'kubectl ____ 10.0.1.23'], note: '节点重新可调度 —— 但**已经在别处跑起来的 Pod 不会自己回来**，要等下次调度' }
        ],
        answer: 'kubectl drain 10.0.1.23 --ignore-daemonsets --dry-run=client',
        alt: [
          'kubectl get pods -A -o wide --field-selector spec.nodeName=10.0.1.23',
          'kubectl cordon 10.0.1.23'
        ],
        expect: /cordoned|evicting|NAME|Ready/,
        teach: '**节点维护的标准流程是 `cordon → drain → 维护 → uncordon`，其中 `cordon` 与 `drain` 的分工必须分清**：**`cordon`（封锁）** 只是把节点标记为 `SchedulingDisabled`，**已经跑着的 Pod 一动不动** —— 它解决的是"别再有新的进来"；**`drain`（驱逐）** 才会把已有 Pod 逐个删掉让它们去别处重建。之所以要分两步，是因为**一起做会没有回头路**：先 cordon 观察几分钟，确认没有异常，再 drain。三个高频坑：**`--ignore-daemonsets` 几乎每次都要加** —— DaemonSet 的 Pod 本来就该在每个节点上跑一份，驱逐它们没有意义，不加会直接报错中止；**`--delete-emptydir-data` 表示"同意丢掉 emptyDir 卷里的数据"** —— 不加的话，只要有一个 Pod 用了 emptyDir，整个 drain 就会被拒绝（这个设计是对的：它逼你确认"这份临时数据丢了没关系"）；**单副本服务被驱逐就是真的断了** —— drain 之前要么先把副本数调到 ≥2，要么接受维护窗口内的短暂不可用。`--dry-run=client` 是**必做的预演**：它把"会驱逐哪些 Pod、它们会去哪儿"列出来，让你在动手前核对。最后别忘了 **`uncordon`** —— 忘了它，这台机器会一直空着，而集群容量悄悄少了一块。'
      },

      {
        id: 'k8s-urgent-scale-and-image',
        cat: 'kubernetes',
        title: '紧急扩容与换镜像：不改 YAML 也能改',
        prompt: '晚高峰来了，CPU 顶到 90%，你需要**立刻**把副本数加上去；十分钟后新镜像构建好了，还要把镜像换掉。这两件事都等不及走一遍 Git 提交与流水线。',
        task: '在线调整副本数、替换镜像，并确认滚动更新完成',
        steps: [
          { title: '先看当前副本数', about: '确认现状再动手', cmd: 'kubectl get deploy -n my-app', ref: 'k8s-scale', hint: ['动手前先记录原值 —— 紧急操作之后要能说清"从多少改到多少"：把工作负载清单列出来看 READY 那一列', 'kubectl get ____ -n my-app'], note: 'READY 2/2 表示期望 2 个、就绪 2 个 —— 这个分数就是"期望/实际"' },
          { title: '在线扩容', about: '立刻把副本数加上去', cmd: 'kubectl scale deploy/web --replicas=5 -n my-app', ref: 'k8s-scale', hint: ['扩容不必改 YAML：有一条子命令直接调整期望副本数，指定资源与目标数量即可', 'kubectl ____ deploy/web --replicas=5 -n my-app'], note: '扩容是**立即生效**的 —— 调度器马上开始创建新 Pod' },
          { title: '换掉镜像', about: '注意要写容器名', cmd: 'kubectl set image deploy/web web=nginx:1.25 -n my-app', ref: 'k8s-set-image', hint: ['换镜像同样不必改 YAML：注意写法是"资源名 容器名=新镜像"，**容器名不能省**（一个 Pod 里可能有多个容器）', 'kubectl set image deploy/web ____=nginx:1.25 -n my-app'], note: '`web=nginx:1.25` 里的 `web` 是**容器名**，不是 Deployment 名 —— 这是最容易写错的地方' },
          { title: '确认滚动更新完成', about: '改完必须验证', cmd: 'kubectl rollout status deploy/web -n my-app', ref: 'k8s-rollout', hint: ['镜像换了不等于生效：要等滚动更新真的走完，用专门看进度的子命令确认', 'kubectl rollout ____ deploy/web -n my-app'], note: '"successfully rolled out" 才算这次换镜像真的完成' }
        ],
        answer: 'kubectl get deploy -n my-app',
        alt: [
          'kubectl get deploy -n my-app',
          'kubectl rollout status deploy/web -n my-app'
        ],
        expect: /NAME|READY|successfully/,
        teach: '**`scale` 与 `set image` 是"命令式"操作：它们直接改集群里的对象，不经过 Git** —— 这在故障止血时是优点（快），在 GitOps 里是缺点（**下次同步会把你的改动覆盖掉**，因为 Git 才是期望状态的来源）。所以正确的用法是"**命令式止血、声明式收口**"：先用这两条把火扑灭，然后**立刻把同样的改动补进 Git**，否则下一次流水线一跑就打回原形 —— 而且没人记得当时为什么是 5 个副本。三条实务要点：**改之前先记录原值**（`kubectl get deploy` 或 `rollout history`），回滚时才知道退到哪；**`set image` 必须带容器名**（格式是 `<资源>/<名字> <容器名>=<镜像>`，容器名写错会报错而不是静默失败，这点还算友好）；**`scale --replicas=0` 是"临时下线"的标准做法**（比删 Deployment 好 —— 配置、Service、PVC 都保留，改回 1 就恢复，常用于省钱过夜或暂停一个环境）。最后：**扩容不等于能扛住** —— 如果瓶颈在数据库连接数、外部 API 限流或节点容量，加副本只会让它们一起变慢；**HPA（水平自动扩缩）才是长期方案**，手工 `scale` 只适合应急。'
      },

      {
        id: 'k8s-diff-before-apply',
        cat: 'kubernetes',
        title: '发布前先看"这次会改什么"',
        prompt: '你要 `apply` 一份改过的清单。**问题是你并不完全确定改了什么** —— 也许只改了镜像版本，也许顺手把副本数也带上了。生产上"以为什么都没改"是最危险的假设。',
        task: '用 diff 与 dry-run 在真正提交之前看清变更内容',
        steps: [
          { title: '看清单文件本身', about: '先确认手上这份是什么', cmd: 'ls -l /data/k8s/', ref: 'k8s-apply', hint: ['先确认手上的文件：列一下那个目录，看清有哪些清单、多大、什么时候改的', 'ls -l ____'], note: 'deploy.yaml 与 svc.yaml 两份' },
          { title: '对照集群里的实际对象', about: '逐字段比出差异', cmd: 'kubectl diff -f /data/k8s/deploy.yaml || echo "（退出码 $? = 有差异）"', ref: 'k8s-diff', hint: ['关键一步：把本地清单与**集群里正在跑的对象**逐字段比一次 —— 注意它"有差异就返回非 0"，所以接一句兜底才能让这一步算通过', 'kubectl diff -f /data/k8s/deploy.yaml ____ echo "（退出码 $? = 有差异）"'], note: '`-` 是集群现状、`+` 是你要提交的 —— **看 `+` 的那些行就是这次会改的东西**' },
          { title: '干跑一次提交', about: '不写入也能看到结果', cmd: 'kubectl apply -f /data/k8s/deploy.yaml --dry-run=client -o yaml', ref: 'k8s-apply', hint: ['上一步看的是"与现状的差异"，还想确认"提交上去的对象长什么样"：用只走流程不落地的方式跑一次，并打印结果', 'kubectl apply -f /data/k8s/deploy.yaml --____=client -o yaml'], note: '输出的是**合并后的完整对象** —— 能看出省略的字段会被填成什么默认值' }
        ],
        answer: 'kubectl apply -f /data/k8s/deploy.yaml --dry-run=client -o yaml',
        alt: [
          'kubectl apply -f /data/k8s/deploy.yaml --dry-run=client -o yaml',
          'ls -l /data/k8s/'
        ],
        expect: /deployment|Deployment|deploy\.yaml|configured/,
        teach: '**发布类操作有一条通用纪律：先用它的"预演"能力看清楚，再真的执行。** 各家的写法高度一致 —— `kubectl diff` / `--dry-run`、`terraform plan`、`helm diff upgrade`、`ansible-playbook --check`、`aws s3 sync --dryrun`、`obsutil sync -dryRun`、`rsync -n`。`kubectl` 这一层有两个不同的预演，**分工要分清**：**`kubectl diff -f`** 比的是"本地清单 vs 集群里正在跑的对象"，回答"**这次会改什么**"（**它在有差异时返回退出码 1** —— 这是刻意设计，CI 里正是靠这个退出码做门禁：有未预期的差异就拦住发布；但作为一条要"成功退出"的步骤，得自己接兜底）；**`kubectl apply --dry-run=client -o yaml`** 不比较、直接算出"**提交后会得到什么对象**"（能看到省略字段的默认值填充结果）。`--dry-run` 还有 `server` 与 `client` 两种：**`client` 只做本地计算**（快，但不知道集群里的准入策略），**`server` 会真的发给 apiserver 走一遍校验与变更准入**（更准，能发现 webhook 拒绝、字段不可变等问题，代价是要一次往返）。生产上推荐 **`diff` 看变更 + `server` 干跑验准入**，两者都过了再提交。最后一条经验：**提交的输出只有"configured/created/unchanged"三态**，它不告诉你改了什么 —— 所以"改了什么"必须靠 diff 回答，别指望提交那一下的输出。'
      },

      {
        id: 'k8s-port-forward-no-expose',
        cat: 'kubernetes',
        title: '数据库没开公网，怎么从本地连上去',
        prompt: '集群里的 MySQL 是 ClusterIP，没有公网入口 —— 这是**正确**的安全设计。可你现在要连上去看一眼数据。临时把它改成对外暴露的入口？**那是把生产数据库直接挂到公网上。**',
        task: '把集群内的端口临时转发到本地，并理解它的作用范围',
        steps: [
          { title: '转发一个 Service 的端口', about: '把集群内端口映射到本地', cmd: 'kubectl port-forward svc/mysql 3306:3306 -n my-app', ref: 'k8s-port-forward', hint: ['不用改任何对外暴露配置也能连上去：把集群内某个 Service 的端口映射到本机 —— 注意"本地端口:远程端口"的写法', 'kubectl port-forward svc/mysql ____:3306 -n my-app'], note: '本地 3306 现在指向集群里的 mysql —— **走的是 apiserver 建立的安全隧道**，不经过公网' },
          { title: '转发一个工作负载', about: '也可以直接指向它', cmd: 'kubectl port-forward deploy/web 8080:80', ref: 'k8s-port-forward', hint: ['不一定非要 Service：也可以直接指向某类工作负载，它会在其中挑一个 Pod 建隧道', 'kubectl port-forward ____/web 8080:80'], note: '指向 Deployment 时会**随机挑一个 Pod** —— 调试多副本时要知道自己连的是哪一个' },
          { title: '转发到指定 Pod 的调试端口', about: 'Java 远程调试的典型用法', cmd: 'kubectl port-forward pod/my-pod 5005:5005', ref: 'k8s-port-forward', hint: ['要连的是某个具体 Pod 上的调试端口（而不是服务端口）：把目标写成"类型/名字"的形式，两边端口保持一致', 'kubectl port-forward ____/my-pod 5005:5005'], note: '5005 是 JDWP 调试端口 —— 把 IDE 的远程调试指向本地 5005 就能断点调试集群里的进程' }
        ],
        answer: 'kubectl port-forward svc/mysql 3306:3306 -n my-app',
        alt: [
          'kubectl port-forward svc/mysql 3306:3306 -n my-app',
          'kubectl port-forward deploy/web 8080:80'
        ],
        expect: /Forwarding from/,
        teach: '**`port-forward` 是"临时隧道"，不是"暴露服务"** —— 它通过 apiserver 建立一条从你本机到目标 Pod 的转发，**不改变任何 Service 类型、不加任何对外入口、不经过公网**。这正好解决了运维里一个反复出现的矛盾：**安全上不该暴露的东西，排障时又必须连上去**。正确姿势就是它，而不是临时把 Service 改成 `LoadBalancer` / `NodePort`（**改完很容易忘记改回来，那才是真事故**）。三种目标写法要记牢：**`svc/<名字>`**（经 Service，通常最方便）、**`deploy/<名字>`**（在其中随机挑一个 Pod —— 多副本调试时**要知道自己连的是哪一个**，最好改用 pod）、**`pod/<名字>`**（最精确，调试端口如 JDWP 5005 必须用它，因为 Service 不转发这种端口）。几个必须知道的限制：**它是前台进程**（占着终端，`Ctrl+C` 就断 —— 要长期用就开一个新终端或放后台）；**只监听本机**（默认 `127.0.0.1`，同事连不上你的转发 —— 要共享得加 `--address 0.0.0.0`，但那等于把端口开给整个网络，**用之前想清楚**）；**Pod 重建就断**（尤其是转发 pod 时，Pod 一挂隧道就失效，转发 svc/deploy 会自动重连到新 Pod）；**它是排障工具不是长期方案**（要长期访问就老老实实配 Ingress / VPN / 跳板机）。最后一条安全提醒：**它的权限由 RBAC 控制**（能 `pods/portforward` 的人就能连进任意 Pod 的网络命名空间）—— 给外包或实习生账号授权时要意识到这一点。'
      },

      {
        id: 'k8s-pod-running-but-broken',
        cat: 'kubernetes',
        title: 'Pod 显示 Running，但服务就是不可用',
        prompt: '`kubectl get pods` 里状态是 `Running`、READY 也是 `1/1`，可请求打过去就是不通。**`Running` 只说明"容器进程起来了"，完全不说明"服务是健康的"。** 真正的判据在状态条件里。',
        task: '查看 Pod 的各项条件与容器重启情况，判断它到底健康不健康',
        steps: [
          { title: '看各项状态条件', about: '几项条件才是真判据', cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{range .status.conditions[*]}{.type}={.status}{"\\n"}{end}\'', ref: 'k8s-pod-status-conditions', hint: ['Pod 有好几项独立的条件（是否调度成功、初始化是否完成、容器是否就绪、能不能接流量），要看它们各自的真假值而不是那个总状态', 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{range .status.____[*]}{.type}={.status}{"\\n"}{end}\''], note: '**Ready=True 才是"能接流量"**；其余几项各管一段' },
          { title: '看重启次数', about: '重启过说明发生过问题', cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].restartCount}\'', ref: 'k8s-pod-status-conditions', hint: ['容器"起来过"和"一直好好跑着"是两回事：看它的累计重启次数，非 0 就说明中间崩过', 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].____}\''], note: '清单里 RESTARTS 那一列就是它 —— 但这个字段能精确取出来喂给脚本' },
          { title: '看上一次退出的原因', about: '上一个实例为什么结束', cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].lastState.terminated.reason}\'', ref: 'k8s-pod-status-conditions', hint: ['重启过的话，容器会记着"上一个实例是怎么结束的"—— 这是它为什么崩的直接答案', 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].____.terminated.reason}\''], note: '最常见的两个值：**OOMKilled**（内存超限被杀）与 **Error**（进程自己非 0 退出）' }
        ],
        answer: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].restartCount}\'',
        alt: [
          'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].restartCount}\'',
          'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].lastState.terminated.reason}\''
        ],
        expect: /NAME|worker|\d/,
        teach: '**Pod 的"状态"有四层，混起来就会得出错误结论**：**`phase`**（最粗：Pending / Running / Succeeded / Failed）—— **`Running` 只表示"至少有一个容器在跑"，不表示它健康**；**`conditions`**（真正有用的四项：**`PodScheduled`** 调度成功了吗、**`Initialized`** init 容器都完成了吗、**`ContainersReady`** 容器全就绪了吗、**`Ready`** **能不能接流量** —— Service 的 Endpoints 只收 `Ready=True` 的 Pod，所以"Pod Running 但服务不通"十有八九是 `Ready=False`）；**`containerStatuses`**（每个容器自己的状态：`ready`、`restartCount`、`state`、`lastState`）；**`events`**（发生过什么）。三个高频"Running 但不可用"的根因：**就绪探针没过**（`Ready=False`，Service 不给它转发 —— 探针路径/端口/阈值配错，或应用启动真的要很久）；**应用只监听了 127.0.0.1**（容器内自己 `curl localhost` 通，外面连不上 —— 要监听 `0.0.0.0`）；**容器反复重启但刚好被你看到 Running 的瞬间**（`restartCount` 非 0 是判据，`lastState.terminated.reason` 告诉你是 `OOMKilled` 还是 `Error`）。一条实用经验：**别只看清单里 STATUS 那一列**，它是给人看的摘要；要判断"能不能服务"看 `READY` 的分子分母，要判断"健康不健康"看 `conditions` 与 `restartCount`。'
      },

      {
        id: 'k8s-annotate-change-cause',
        cat: 'kubernetes',
        title: '给每次发布留一句"为什么改"',
        prompt: '三个月后要回滚一个服务，变更历史列出一排 `REVISION 1/2/3/4/5`，而"变更原因"那一列全是 `<none>`。**你完全不知道哪一版是什么改动** —— 只能靠猜或者翻提交记录。这个信息其实可以顺手留下。',
        task: '给资源打注解、回读验证，并理解它与发布历史的配合',
        steps: [
          { title: '给工作负载加一条说明', about: '注解是挂在对象上的备注', cmd: 'kubectl annotate deploy web description="订单服务，负责人 张三" -n my-app --overwrite', ref: 'k8s-annotate', hint: ['注解是"挂在对象上的备注"：键=值的形式，改已有的键要显式允许覆盖', 'kubectl annotate deploy web description="订单服务，负责人 张三" -n my-app --____'], note: '不加允许覆盖的开关时，给已存在的键赋值会被拒绝 —— 这个设计防止手滑覆盖' },
          { title: '给入口加一条控制注解', about: '注解也用来给控制器传参', cmd: 'kubectl annotate ingress web nginx.ingress.kubernetes.io/rewrite-target=/ -n my-app', ref: 'k8s-annotate', hint: ['注解不只给人看：很多控制器**靠注解接收配置**（比如入口控制器靠它指定路径重写规则）', 'kubectl annotate ingress web nginx.ingress.kubernetes.io/____=/ -n my-app'], note: '返回里说 overwritten —— 说明这个键原本就有值，被我们覆盖了' },
          { title: '回读确认', about: '改完必须验证', cmd: 'kubectl get ingress web -n my-app -o jsonpath=\'{.metadata.annotations}\'', ref: 'k8s-annotate', hint: ['注解改完要回读：把它按结构化字段取出来，确认键值都在', 'kubectl get ingress web -n my-app -o jsonpath=\'{.metadata.____}\''], note: '输出里能看到两条注解 —— 这就是"注解确实写进去了"的证据' }
        ],
        answer: 'kubectl get ingress web -n my-app -o jsonpath=\'{.metadata.annotations}\'',
        alt: [
          'kubectl get ingress web -n my-app -o jsonpath=\'{.metadata.annotations}\'',
          'kubectl annotate deploy web description="订单服务，负责人 张三" -n my-app --overwrite'
        ],
        expect: /map\[|annotated|annotation/,
        teach: '**`annotations`（注解）与 `labels`（标签）是两种不同的元数据，用途完全不同**：**labels 给"选择器"用**（Service 靠它找 Pod、Deployment 靠它管 ReplicaSet —— **改动标签可能直接导致服务失联**）；**annotations 给"人或控制器"用**（存描述、负责人、变更原因，或给入口控制器 / 证书管理器 / 云控制器传参数 —— **它不参与选择，改了通常不影响调度**）。回到开头那个问题：**变更历史里的"原因"一列默认是 `<none>`**，要填上它有两种做法：**打上固定的注解键 `kubernetes.io/change-cause`**（在下一次 `set image` / 提交之前打，它就会被记进那一版历史），或者用 `--record`（**已废弃**，新版本移除）。顺手做这一步的回报很大：**故障回滚时，历史列表直接告诉你"退到哪一版、那一版是什么改动"**，不用去翻提交记录、也不用问人。三条实务建议：**把变更原因写成"改了什么 + 为什么"**（"1.2.4 修复订单超时"比"发布"有用得多）；**注解的键用反域名格式**（`example.com/owner`，避免与他人冲突 —— 第三方控制器都遵守这个约定）；**别把注解当配置存储用**（它有大小限制，且不参与校验 —— 真正的配置应该进 ConfigMap / Secret）。'
      },

      {
        id: 'k8s-etcd-backup',
        cat: 'kubernetes',
        title: '集群的"根"怎么备份',
        prompt: '有人误删了一个命名空间，连带里面的 PVC 一起没了。你想从备份恢复 —— 这时才发现：**平时备份的都是业务数据，没人备份过 etcd**。而 etcd 里存着整个集群的全部状态：所有对象、所有配置、所有 Secret。',
        task: '给 etcd 打一次快照，并检查这份快照的内容',
        steps: [
          { title: '确认 etcd 在哪、是什么形态', about: '先搞清备份对象', cmd: 'kubectl get pods -n kube-system --show-labels', ref: 'k8s-etcdctl-snapshot-save', hint: ['kubeadm 装的集群里，etcd 是以静态 Pod 形式跑在控制平面节点上的：到系统命名空间里把它找出来，顺便看它的标签', 'kubectl get pods -n kube-system --____'], note: 'etcd 是控制平面的核心组件 —— 它挂了整个集群就只读不可写了' },
          { title: '打一份快照', about: '在线备份，不用停集群', cmd: 'ETCDCTL_API=3 etcdctl snapshot save /var/backups/etcd-snap.db --endpoints=https://127.0.0.1:2379', ref: 'k8s-etcdctl-snapshot-save', expect: /Snapshot saved at \/var\/backups\/etcd-snap\.db/, hint: ['备份动作本身：指定快照落盘路径与 etcd 的监听地址（新版客户端已经不需要再设 API 版本，但显式写上兼容老版本）', 'ETCDCTL_API=3 etcdctl snapshot ____ /var/backups/etcd-snap.db --endpoints=https://127.0.0.1:2379'], note: '返回里有 `snapshot saved` 与耗时 —— **它是在线备份，不需要停集群**' },
          { title: '检查刚生成的快照内容', about: '对这次生成的文件读取哈希、revision、键数和大小', cmd: 'ETCDCTL_API=3 etcdctl snapshot status /var/backups/etcd-snap.db -w table', ref: 'k8s-etcdctl-snapshot-save', hint: ['**备份没验证过就等于没有备份**：对刚才生成的同一个文件读取内容摘要，而不是拿旧快照蒙混过关', 'ETCDCTL_API=3 etcdctl snapshot ____ /var/backups/etcd-snap.db -w table'], note: '表格中的 TOTAL KEYS 与 TOTAL SIZE 是内容证据；这仍是仿真快照，真机还须隔离恢复演练' },
          { title: '确认这次备份文件落地了', about: '只核对刚生成的目标文件和容量', cmd: 'ls -l /var/backups/etcd-snap.db', ref: 'k8s-etcdctl-snapshot-save', hint: ['最后确认刚才生成的那一个文件确实在磁盘上、容量不为零', 'ls -l ____'], note: '仿真环境用记录的快照容量展示；真机还要检查可读性、离机副本和恢复演练' }
        ],
        answer: 'ETCDCTL_API=3 etcdctl snapshot save /var/backups/etcd-snap.db --endpoints=https://127.0.0.1:2379 && ETCDCTL_API=3 etcdctl snapshot status /var/backups/etcd-snap.db -w table',
        expect: /179451|HASH|REVISION|etcd/,
        teach: '**etcd 是集群的唯一事实来源（single source of truth），它的备份是集群层面最高优先级的备份** —— 因为业务数据（数据库、对象存储）通常有各自的备份体系，而"集群里所有 K8s 对象"只有 etcd 这一个地方存着。弄丢它意味着：所有 Deployment / Service / ConfigMap / **Secret** / PVC 定义全部消失，即使容器还在跑，集群也已经"失忆"了 —— 无法重建、无法回滚、无法调度。`etcdctl snapshot save` 的三个要点：**它是在线备份**（走 gRPC，不需要停 apiserver，但会占 IO，建议低峰做）；**它需要证书**（生产上要带 `--cacert` / `--cert` / `--key` 三件套，否则报 `context deadline exceeded` 或 `certificate required` —— 这正是"连不上 etcd"最常见的原因）；**它只备份 etcd 的数据，不备份证书与配置文件**（`/etc/kubernetes/pki`、`/etc/kubernetes/manifests` 要单独备份，恢复时两者缺一不可）。**验证比备份更重要**：`snapshot status` 给出哈希、revision、键数量与 etcd 版本，是"这份快照能不能用"的直接证据；**进一步要定期做恢复演练**（在测试环境用 `snapshot restore` 起一个独立的 etcd，确认能读出来）—— 没演练过的备份，事故当天才发现不可用就太晚了。最后三条运维纪律：**kubeadm 集群的 etcd 有内置的定期快照机制吗？没有** —— 必须自己配 CronJob 或外部脚本；**快照要传到集群之外**（留在同一台机器上，机器没了备份也没了）；**恢复 etcd 是高危操作**（会回退整个集群的状态，必须先在隔离环境验证恢复步骤）。'
      },

      {
        id: 'k8s-one-off-job',
        cat: 'kubernetes',
        title: '跑一次性任务：数据库迁移',
        prompt: '这次发布包含一个数据库结构变更，要跑一次迁移脚本。**你不能把它塞进应用的启动命令里** —— 多副本时会有多个实例同时跑迁移，而且失败要能重跑。这类"跑一次、必须成功"的活儿属于 Job。',
        task: '创建一个一次性任务，并确认它的执行结果',
        steps: [
          { title: '先看已有的任务与结果', about: '确认现状与命名规范', cmd: 'kubectl get jobs -n my-app', ref: 'k8s-create-job', hint: ['动手前先看这个命名空间里已有哪些一次性任务、它们的完成情况 —— 顺带能看出同事们的命名习惯', 'kubectl get ____ -n my-app'], note: 'COMPLETIONS 那一列是"已完成/期望"—— `1/1` 才算成功跑完' },
          { title: '干跑看清会创建什么', about: '先不提交', cmd: 'kubectl create job db-migrate --image=busybox --dry-run=client -o yaml', ref: 'k8s-create-job', hint: ['提交之前先看清这个任务对象长什么样：用只走流程不落地的方式生成 YAML 打出来', 'kubectl create job db-migrate --image=busybox --____=client -o yaml'], note: '能看到 `restartPolicy`、`backoffLimit` 这些关键字段的默认值' },
          { title: '真正创建任务', about: '指定镜像与命名空间', cmd: 'kubectl create job db-migrate --image=swr.cn-north-4.myhuaweicloud.com/myorg/migrate:v1.2.0 -n my-app', ref: 'k8s-create-job', expect: /job\.batch\/db-migrate created/, hint: ['确认无误后真的提交：把镜像指向迁移程序（**必须用固定版本号，不能用 latest** —— 迁移脚本要可复现）', 'kubectl create job db-migrate --image=swr.cn-north-4.myhuaweicloud.com/myorg/migrate:____ -n my-app'], note: '任务已创建 —— 接下来要确认它真的跑成功了' }
        ],
        answer: 'kubectl create job db-migrate --image=busybox --dry-run=client -o yaml',
        alt: [
          'kubectl get jobs -n my-app',
          'kubectl get ns'
        ],
        expect: /Job|db-migrate|NAME/,
        teach: '**K8s 里的工作负载分三类，按"要跑多久"来选**：**Deployment / StatefulSet** 是**长期运行**的服务（进程不该退出，退了就重启）；**Job** 是**跑一次到完成**的任务（迁移、批处理、导出 —— 完成即成功，退出码 0 才算成功）；**CronJob** 是**按时间表反复跑**的 Job。Job 的两个关键字段决定它的行为：**`restartPolicy`** 只能是 `Never` 或 `OnFailure`（**不能是 Always** —— 那就变成"永远重启"，与 Job 的语义矛盾；这是从 Deployment 抄配置时最常见的报错）；**`backoffLimit`** 是"失败重试几次"（默认 6，指数退避；批量任务可以调大，**迁移脚本要调小甚至设 0** —— 因为迁移脚本失败后重跑可能有副作用）。三个实务要点：**迁移类任务要与应用发布解耦**（经典做法是 Helm 的 pre-upgrade hook，或 CI 里先跑 Job 再滚动更新应用；**绝不能放进容器启动命令** —— 多副本会并发跑、重启会重跑）；**镜像必须固定版本**（`latest` 会让"重跑一次"变成"跑了一个不知道什么版本"）；**务必配 `activeDeadlineSeconds`**（给任务一个超时上限，否则卡住的任务会一直占着资源）。排查 Job 的顺序：`kubectl get jobs` 看完成情况 → `kubectl describe job <名字>` 看事件与失败原因 → `kubectl logs job/<名字>` 看程序输出（**Job 的 Pod 完成后仍保留，所以日志还在**，这是它比"直接在 CI 里跑脚本"强的地方）。最后：**跑完的 Job 不会自动删**（保留是为了让你查日志），要清理可以配 `ttlSecondsAfterFinished` 让它在完成后若干秒自动删除。'
      },

      {
        id: 'k8s-label-scheduling',
        cat: 'kubernetes',
        title: '用标签把 Pod 引到指定的机器上',
        prompt: '新加了一台带 SSD 的机器，你希望 IO 密集的服务只跑在它上面。**直接写节点名是最差的做法**（机器换了、扩容了就要改 YAML）—— 正确做法是**给节点打标签，让 Pod 按标签找机器**。',
        task: '查看节点标签、给节点打标签、按标签筛选节点，并演示删除标签',
        steps: [
          { title: '看节点现在有哪些标签', about: '标签是调度的依据', cmd: 'kubectl get nodes --show-labels', ref: 'k8s-get-nodes-label', hint: ['调度靠标签，所以先看清现有节点上都有些什么标签（K8s 自身会打一批：区域、实例规格、角色）', 'kubectl get nodes --____'], note: 'LABELS 那一列很长 —— 其中有 K8s 自动打的（区域/规格/角色），也有运维手工打的' },
          { title: '给节点打一个自定义标签', about: '标记它的硬件特征', cmd: 'kubectl label node 10.0.1.24 disktype=ssd', ref: 'k8s-label', hint: ['给目标节点打一个描述硬件特征的标签：键=值的形式，作用在节点对象上', 'kubectl label node 10.0.1.24 ____=ssd'], note: '标签是**幂等**的：Pod 的 nodeSelector 写 `disktype: ssd`，以后换机器只要打同样的标签' },
          { title: '按标签筛选节点', about: '验证标签能选中它', cmd: 'kubectl get nodes -l disktype=ssd -o wide', ref: 'k8s-get-nodes-label', hint: ['打完要验证"能被选中"：用标签选择器筛节点，加上扩展输出确认只有它匹配', 'kubectl get nodes -l ____=ssd -o wide'], note: '只列出了打了这个标签的节点 —— 这就是 `nodeSelector` 生效时的匹配逻辑' },
          { title: '按 K8s 自带的标签筛', about: '用区域标签找同可用区的机器', cmd: 'kubectl get nodes -l topology.kubernetes.io/zone=cn-north-4a', ref: 'k8s-get-nodes-label', hint: ['K8s 自动打的标签也很有用：比如按"可用区"筛，能快速看清哪些机器在同一个 AZ（跨 AZ 流量是要花钱的）', 'kubectl get nodes -l topology.kubernetes.io/____=cn-north-4a'], note: '云上跨可用区通信有延迟与流量费 —— 用这个标签把有状态服务固定在同一个 AZ 里' },
          { title: '删除一个标签', about: '键后面加一个减号', cmd: 'kubectl label pod web-7d9c4b8f5-2xk9p env- -n my-app', ref: 'k8s-label', hint: ['删除标签的写法很特别：在**键名后面直接加一个减号**、并且不给值', 'kubectl label pod web-7d9c4b8f5-2xk9p ____ -n my-app'], note: '结尾那个减号就是"删除这个键" —— 与给节点去污点的写法是同一套约定' }
        ],
        answer: 'kubectl get nodes --show-labels',
        alt: [
          'kubectl get nodes --show-labels',
          'kubectl get nodes -l disktype=ssd -o wide'
        ],
        expect: /NAME|LABELS|Ready|No resources/,
        teach: '**标签（label）是 K8s 里"选择"机制的基石**，几乎所有"找到一批对象"的动作都靠它：**Service 靠它找 Pod**（`spec.selector`）、**Deployment 靠它管 ReplicaSet**、**调度靠它选节点**（`nodeSelector` / `nodeAffinity`）、**运维靠它做批量操作**（`kubectl get pods -l app=web`、`kubectl delete -l env=dev`）。所以有一条铁律：**改动 Pod 模板的标签要极其小心** —— 改错了，Service 会突然找不到后端（表现为"服务 502 但 Pod 都健康"）。三种"定向调度"手段要分清：**`nodeSelector`**（最简单：Pod 里写 `nodeSelector: {disktype: ssd}`，**硬性要求**，没有匹配节点就一直 Pending）；**`nodeAffinity`**（表达能力强：支持 `In` / `NotIn` / `Exists`、软硬两种，还能按标签变更做偏好）；**污点与容忍**（方向相反，见前面那一节）。标签的命名有规范：**键可以用 `<前缀>/<名字>` 的形式**（`topology.kubernetes.io/zone`、`node.kubernetes.io/instance-type` 都是这样），**前缀必须是 DNS 子域名**；值最长 63 字符、只能字母数字与 `-_.`。两条实务建议：**优先用 K8s 与云厂商已打好的标签**（区域、实例规格、角色都是现成的，`kubectl get nodes --show-labels` 能看到），别自己造一套同义的；**给业务对象打上"环境 + 应用 + 版本"三个维度**（`env=prod`、`app=order-api`、`version=v1.2.3`），后面做批量查询、灰度切流、成本分摊都靠它们。'
      },

      {
        id: 'k8s-copy-files-in-out',
        cat: 'kubernetes',
        title: '从容器里把文件取出来',
        prompt: 'Pod 里的应用生成了一份堆转储（或一份日志），你要拿回本地分析。**但你进不去那个容器**（镜像里连 shell 都没有）—— 这种情况要能在不进容器的情况下把文件取出来。',
        task: '演示从容器取文件、往容器放文件，以及指定多容器 Pod 里的某一个',
        steps: [
          { title: '从容器取文件到本地', about: '注意路径顺序', cmd: 'kubectl cp my-app/my-pod:/var/log/app.log ./app.log', ref: 'k8s-cp', hint: ['取文件的方向是"容器路径 → 本地路径"：容器侧要写成"命名空间/Pod名:绝对路径"的形式', 'kubectl cp my-app/my-pod:____ ./app.log'], note: '注意冒号的位置 —— **左边是源、右边是目标**，写反了方向就反了' },
          { title: '把文件放进容器', about: '反过来也能用', cmd: 'kubectl cp ./config.yaml my-app/my-pod:/tmp/config.yaml', ref: 'k8s-cp', hint: ['反向放文件同样支持：本地文件路径放左边，容器路径放右边（临时放个排查脚本很常用）', 'kubectl cp ./config.yaml my-app/my-pod:____'], note: '临时放进去的文件**重启就没了**（不在镜像里）—— 适合排查，不适合当部署手段' },
          { title: '指定多容器 Pod 里的某一个', about: '一个 Pod 可能有多个容器', cmd: 'kubectl cp my-app/my-pod:/data ./backup -c app', ref: 'k8s-cp', hint: ['一个 Pod 里可能有多个容器（应用 + sidecar），必须说明是哪一个：用指定容器名的选项', 'kubectl cp my-app/my-pod:/data ./backup ____ app'], note: '不指定容器时默认第一个 —— 有 sidecar 的 Pod 里这个默认值经常不是你想要的' }
        ],
        answer: 'kubectl cp my-app/my-pod:/var/log/app.log ./app.log',
        alt: [
          'kubectl cp my-app/my-pod:/var/log/app.log ./app.log',
          'kubectl cp ./config.yaml my-app/my-pod:/tmp/config.yaml'
        ],
        expect: /教学环境不真的传输文件|kubectl cp/,
        teach: '**`kubectl cp` 的底层实现是"在容器里调 `tar` 打包、通过 apiserver 流式传回"** —— 这个实现细节解释了它几乎所有的限制：**容器里必须有 `tar`**（很多精简镜像如 `distroless`、`scratch`、`alpine` 的部分变体里没有 —— 报错往往是 `exec: "tar": executable file not found`，这是它最常见的失败原因）；**它不适合传大文件**（要走 apiserver 中转，慢且占 apiserver 资源 —— 几百 MB 以上就该考虑别的办法）；**它需要 Pod 里的容器在运行**（容器挂了就拷不出来，那时要先 `kubectl debug` 或从宿主机上找）。取不到文件时的替代路径值得记住：**`kubectl exec ... -- cat 文件`**（小文件直接打到标准输出，不依赖 tar）；**`kubectl debug` 加临时容器**（distroless 镜像没 shell 时用 `--image=busybox` 挂一个进来）；**`kubectl port-forward` + 应用自己的接口**；**从宿主机上找**（日志目录常通过 `emptyDir` 或 `hostPath` 挂在宿主机上，直接到节点上取更快）。三个注意点：**路径里的冒号是语法的一部分**（Windows 上写本地路径时 `C:\...` 会让解析歧义，要写成 `C:/...` 或改用相对路径）；**它不做权限提升**（容器里读不到的文件，拷出来一样读不到）；**拷进去的文件重启即失**（要持久化得走 ConfigMap / 卷，`cp` 只适合临时排障）。'
      },

      {
        id: 'k8s-who-am-i',
        cat: 'kubernetes',
        title: '我是谁：确认当前身份与权限',
        prompt: '你在一台跳板机上敲命令，`kubectl` 却报 `forbidden`。**问题先要确认清楚：你现在的操作身份是谁、用的是哪个上下文、在哪个命名空间、有什么权限。** 这四个问题的答案都不在你脑子里，而在集群里。',
        task: '确认当前上下文与身份，并列出在目标命名空间里的全部权限',
        steps: [
          { title: '确认当前上下文', about: '上下文决定连哪个集群、用哪个身份', cmd: 'kubectl config current-context && kubectl auth whoami', ref: 'k8s-auth-whoami', hint: ['先确认"我在操作哪个集群"：把当前上下文打出来，紧接着问集群"你认为我是谁" —— 两条一起看才有意义', 'kubectl config current-context && kubectl auth ____'], note: '上下文名里通常带着区域与集群标识 —— **多集群环境下这一步能避免改错集群**' },
          { title: '看身份的详细信息', about: '用户名与所属组', cmd: 'kubectl auth whoami -o yaml', ref: 'k8s-auth-whoami', hint: ['用户名与所属组是 RBAC 判权的依据：换一种输出格式把它们完整打出来', 'kubectl auth whoami -o ____'], note: '**GROUPS 决定了你继承哪些权限** —— 有些权限是绑在组上的，不在你名下' },
          { title: '列出全部权限清单', about: '在这个命名空间里能做什么', cmd: 'kubectl auth can-i --list -n my-app', ref: 'k8s-auth-can-i', hint: ['与其逐个猜"我能不能做 X"，不如让集群把"我在这个命名空间里能做的全部动作"列出来', 'kubectl auth can-i ____ -n my-app'], note: '按资源分组列出允许的动作 —— 一眼就能看出缺的是哪一项权限' }
        ],
        answer: 'kubectl auth can-i --list -n my-app',
        alt: [
          'kubectl auth can-i --list -n my-app',
          'kubectl auth whoami'
        ],
        expect: /Resources|Non-Resource|USERNAME|GROUPS/,
        teach: '**遇到 `forbidden` 时的排查顺序是"先确认身份、再确认权限"，而不是先怀疑配置** —— 因为最常见的两个原因是：**你用的上下文指向了另一个集群/另一个身份**（多集群环境下尤其常见，`kubectl config current-context` 一看便知），以及**上下文默认命名空间与你以为的不一样**（`kubectl config view --minify` 能看到当前上下文的 `namespace`）。三条定位命令要记牢：**`kubectl config current-context`**（连的是哪个集群）、**`kubectl auth whoami`**（集群认为你是谁，含用户名与所属组）、**`kubectl auth can-i --list -n <命名空间>`**（能做什么的完整清单）。RBAC 的判权模型要理解：权限**只增不减**（多个 RoleBinding 是并集，没有"拒绝"规则）、**绑定在"用户/组/ServiceAccount"上**、**分命名空间级（Role/RoleBinding）与集群级（ClusterRole/ClusterRoleBinding）**两套。所以 `forbidden` 的可能原因有四种：**身份不对**（上下文用错）、**命名空间不对**（默认命名空间不是你操作的那个）、**动作没授权**（如能 `get` 不能 `exec`）、**资源类型没授权**（如能管 Pod 不能管 Secret）。一条实用技巧：**`kubectl auth can-i <动词> <资源> --as=<身份>`** 可以替别人问（管理员常用它来验证"这个 SA 到底能不能做某事"，比翻 RoleBinding 快得多）。最后提醒：**能 `exec` 进 Pod 就等价于能读该 Pod 的所有 Secret 与环境变量** —— 授权时要意识到这一层间接提权。'
      },

      {
        id: 'k8s-namespace-context',
        cat: 'kubernetes',
        title: '换个命名空间，别每次都敲 -n',
        prompt: '你在一个项目上要连续做几十条操作，全都在 `my-app` 命名空间里。**每条命令都带 `-n my-app` 又累又容易漏** —— 漏了的那条就作用到 `default` 上，那才是真麻烦。',
        task: '查看命名空间清单，并把当前上下文的默认命名空间切过去',
        steps: [
          { title: '看有哪些命名空间', about: '集群里的"租户"划分', cmd: 'kubectl get ns', ref: 'k8s-create-namespace', hint: ['先看清集群里有哪些命名空间 —— 系统组件的命名空间不要碰，业务操作要落在业务命名空间里', 'kubectl get ____'], note: '`default` 是没指定时的落点 —— **误操作到 default 是很常见的事故来源**' },
          { title: '把默认命名空间切过去', about: '改当前上下文的默认值', cmd: 'kubectl config set-context --current --namespace=my-app', ref: 'k8s-create-namespace', hint: ['要免掉每次都写 -n：把"当前上下文"的默认命名空间改成目标值 —— 注意是改**当前**那个上下文，不是新建一个', 'kubectl config set-context --____ --namespace=my-app'], note: '`--current` 表示改当前上下文；改完之后的命令默认都作用在 my-app 上' },
          { title: '按结构化方式列出命名空间', about: '给脚本用', cmd: 'kubectl get ns -o jsonpath=\'{range .items[*]}{.metadata.name}{"\\n"}{end}\'', ref: 'k8s-jsonpath', hint: ['要喂给脚本就别解析表格：按模板把名字逐个取出来，一行一个', 'kubectl get ns -o jsonpath=\'{range .items[*]}{.metadata.____}{"\\n"}{end}\''], note: '一行一个命名空间名 —— 可以直接接给 `while read` 做批量操作' }
        ],
        answer: 'kubectl get ns',
        alt: [
          'kubectl get ns',
          'kubectl get ns -o jsonpath=\'{range .items[*]}{.metadata.name}{"\\n"}{end}\''
        ],
        expect: /NAME|default|kube-system/,
        teach: '**命名空间（Namespace）是集群内的"虚拟集群"，它的作用有两层：一是隔离与配额**（`ResourceQuota` 限制总量、`LimitRange` 限制单 Pod 默认值、RBAC 常按命名空间授权），**二是"省事"**（把默认命名空间切过去，后续命令都不用带 `-n`）。但**切换默认命名空间是有风险的**：命令的落点从"明写"变成了"隐式"，**别人接手你的终端、或你自己开新窗口时，很容易在有破坏性的操作上作用到错的命名空间**。所以两条纪律：**破坏性操作（`delete` / `drain` / `scale 0`）一律显式写 `-n`，不依赖默认值**；**在脚本与 CI 里永远显式传 `--namespace`**（脚本里"隐式默认"就是不可复现的来源）。几个配套知识点：**`kubectl config view --minify`** 能看到当前上下文的全部属性（包括默认命名空间），排查"命令怎么作用到别处去了"时先看它；**跨命名空间的引用要写全名**（Service 是 `svc.<命名空间>`，DNS 是 `<服务>.<命名空间>.svc.cluster.local` —— **不写命名空间只会找同命名空间的**，这是"服务名解析不了"的高频原因）；**删命名空间会连带删掉里面的一切**（包括 PVC —— 数据也一起没了，所以命名空间是"最危险的一键删除"）；**系统命名空间（`kube-system` / `kube-public` / `kube-node-lease`）不要手工改**，里面的对象由控制平面自己管理。'
      },

      {
        id: 'dk-stop-graceful-vs-kill',
        cat: 'docker',
        title: '停容器的三种方式，代价完全不同',
        prompt: '要给一个容器升级镜像，得先把它停掉。**直接 `kill` 最快，但数据库可能因此损坏**；等它优雅退出最安全，但可能永远等不到。你需要知道这三种停法的区别，才能按场景选。',
        task: '演示优雅停止、带头超时的停止，与直接发信号强杀',
        steps: [
          { title: '优雅停止', about: '先发温和信号，等它自己退', cmd: 'docker stop web', ref: 'dk-stop', hint: ['最常规的停法：给进程发一个"请你退出"的信号，**等它自己做完清理再退**（默认等 10 秒，超时才强杀）', 'docker ____ web'], note: '默认是 **SIGTERM → 等 10 秒 → SIGKILL** —— 前两步给了应用收尾的机会' },
          { title: '给数据库更长的收尾时间', about: '大实例 10 秒不够', cmd: 'docker stop -t 60 mysql8', ref: 'dk-stop', hint: ['数据库关闭时要刷脏页、写检查点，10 秒往往不够：把等待时间调长（单位是秒）', 'docker stop ____ 60 mysql8'], note: '`-t 60` 把超时拉到 60 秒 —— **超时到了照样 SIGKILL**，所以这个值要按业务真实收尾时间设' },
          { title: '重启容器', about: '一条命令完成停+启', cmd: 'docker restart web', ref: 'dk-restart', hint: ['只是想让配置生效、不想改配置：一条命令完成"停 → 启"，它内部走的同样是优雅停止那套', 'docker ____ web'], note: '等价于 `stop` + `start` —— **不是"重载"，是有真实中断的**' },
          { title: '直接发信号强杀', about: '最后手段', cmd: 'docker kill web', ref: 'dk-kill', hint: ['对"停不下来"的容器，或者明确知道它不响应温和信号时：直接发信号（默认就是那个无法被捕获的）', 'docker ____ web'], note: '默认发 **SIGKILL**（进程无法捕获、没有清理机会）—— **数据库类容器绝不要这么停**' },
          { title: '发指定信号而不是强杀', about: '让 Nginx 重载配置', cmd: 'docker kill -s SIGHUP web', ref: 'dk-kill', hint: ['同一个命令也能发别的信号：比如让 Nginx **重载配置而不是退出**（这正是"不中断服务换配置"的做法）', 'docker kill -s ____ web'], note: '**SIGHUP 对多数守护进程意味着"重载配置"** —— 这就是"优雅重载"的实现方式' }
        ],
        answer: 'docker stop -t 60 mysql8',
        alt: [
          'docker stop -t 60 mysql8',
          'docker stop web'
        ],
        expect: /不会真的改动|mysql8|web/,
        teach: '**容器停止是一个"三段式"过程，理解它才能避免数据损坏**：**① 发 `SIGTERM`**（默认信号，"请你退出"）→ **② 等待 `-t` 秒**（默认 10 秒，让应用关连接、刷缓冲、写完最后一批数据）→ **③ 超时则发 `SIGKILL`**（无法捕获，进程被立即干掉，**未落盘的数据丢失**）。所以"停得慢"不一定是坏事 —— **那说明应用在认真收尾**；反过来"秒停"才需要警惕（可能它根本没处理 SIGTERM，直接被杀）。三种停法的选择：**`docker stop`**（常规，默认 10 秒）、**`docker stop -t <秒>`**（有状态服务必须调大 —— **数据库、消息队列的收尾可能要几十秒**）、**`docker kill`**（最后手段，默认 SIGKILL）。**关键区别**：`docker kill -s SIGHUP <容器>` 并不是"强杀"，而是"发一个自定义信号" —— 对 Nginx 它意味着**重载配置**（这正是"不重启换配置"的标准做法），对多数守护进程它是"重读配置文件"。三个实务要点：**`-t` 的值要按业务设**（K8s 里对应 `terminationGracePeriodSeconds`，**设得太小等于每次发布都强杀**）；**容器里 PID 1 的进程必须正确处理信号**（很多脚本用 `exec` 才让应用成为 PID 1，否则信号被 shell 吃掉、应用收不到 —— 这是"容器停不下来"最常见的原因）；**`docker stop` 成功返回不代表数据安全**（要看应用日志里有没有正常关闭的记录）。最后一条：**升级流程应当"先摘流量、再停容器"**（负载均衡里先把它摘掉、等在途请求处理完，再停 —— 否则用户会看到 502）。'
      },

      {
        id: 'dk-remove-container-and-image',
        cat: 'docker',
        title: '删容器与删镜像：顺序搞反就删不掉',
        prompt: '要清理一批旧版本：几个停了的容器、几个已经不用的镜像。你敲 `docker rmi` 删镜像，它却报 `image is being used by stopped container` —— **容器停了，但它仍然占着镜像**。',
        task: '演示删容器（含连带匿名卷）与删镜像，并理解它们的依赖顺序',
        steps: [
          { title: '先看有哪些已退出的容器', about: '清理对象是谁', cmd: 'docker ps -a', ref: 'dk-ps', hint: ['清理前先看清对象：列出**全部**容器（包括已退出的），看它们的状态与镜像', 'docker ps ____'], note: 'STATUS 里 `Exited` 的就是可以删的 —— **但`created`/`running` 的不要动**' },
          { title: '删掉一个已退出的容器', about: '容器是镜像的"引用方"', cmd: 'docker rm web', ref: 'dk-rm', hint: ['要删镜像就得先删掉引用它的容器：删除动作针对的是容器名（不加任何选项时只能删已停止的）', 'docker ____ web'], note: '**正在运行的容器删不掉** —— 需要显式强制，那是另一个选项' },
          { title: '连匿名卷一起删', about: '否则卷会变成悬空', cmd: 'docker rm -v old-mysql', ref: 'dk-rm', hint: ['容器删了但它的**匿名数据卷**会留下来（有名字的命名卷不受影响）：加一个选项把匿名卷一并删掉', 'docker rm ____ old-mysql'], note: '`-v` 只删**匿名卷** —— **命名卷永远保留**（这个设计是对的：命名卷里是你要的数据）' },
          { title: '删一个不再使用的镜像', about: '容器清了才删得掉', cmd: 'docker rmi nginx:1.25', ref: 'dk-rmi', hint: ['容器清完之后才能删镜像：删的是"仓库:标签"（删掉标签不等于删掉所有层）', 'docker ____ nginx:1.25'], note: '如果还有容器引用它，会报 `image is being used by stopped container` —— **这正是本节要说的依赖顺序**' },
          { title: '先看清楚哪些是悬空镜像', about: '批量删之前必须先列', cmd: 'docker images -f dangling=true', ref: 'dk-images', hint: ['悬空镜像（`<none>`）是构建残留，可以整批清理：先用过滤器只把它们筛出来看清', 'docker images -f ____=true'], note: '`<none>` 之所以能筛出来，是因为**它的引用链断了** —— 没有任何 tag 指向它' },
          { title: '确认清单没问题', about: '只留 ID，准备交给删除', cmd: 'docker images -f dangling=true -q', ref: 'dk-images', hint: ['上一步看清之后，让同一个查询只输出 ID（这样它的结果就能直接当作删除命令的参数）', 'docker images -f dangling=true ____'], note: '`-q` 只输出 ID —— **先只列、再删，是批量清理唯一的安全阀**' }
        ],
        answer: 'docker images -f dangling=true -q',
        alt: [
          'docker images -f dangling=true -q',
          'docker ps -a'
        ],
        expect: /CONTAINER ID|d4e7f1a2b5c8|nginx/,
        teach: '**Docker 的资源有明确的"引用链"：镜像 ← 容器 ← 卷**，删除必须**从下往上**（先删容器、再删镜像），否则会报"still in use"。命令本身其实只有两条：**`docker rm <容器>`**（只能删已停止的容器）与 **`docker rmi <镜像>`**（删的是"仓库:标签"）。真正的难点全在**选项与前提**上：**`docker rm -f`**（强制：**会先发 SIGKILL 再删** —— 生产上慎用）；**`docker rm -v`**（连带删匿名卷 —— **命名卷永远保留**，这个设计是对的）；**`docker rmi`** 的两个现象要分清：**`Untagged`** 表示"只删掉了标签"（同 ID 还有别的 tag 或有容器引用，**层数据仍在**），**`Deleted`** 才是"真的删了数据"。**批量清理的标准三步**：**① 先只列**（`docker images -f dangling=true`，确认 `<none>` 悬空镜像就是构建残留）；**② 再只出 ID**（同一查询加 `-q`，让结果能直接当参数用）；**③ 最后才删**（`docker rmi $(docker images -f dangling=true -q)`）。这三步之所以必须分开，是因为 **`$(...)` 里的过滤器写错一个字母，删掉的就可能远超预期** —— 这是 docker 里最容易造成事故的一类命令。删之前还有两件事要做：**有状态容器的匿名卷先确认没数据**（`docker rm -v` 删了找不回来）；**删完用 `docker system df` 核对释放了多少空间**，而不是凭感觉觉得"清干净了"。'
      },

      {
        id: 'dk-compose-validate-then-up',
        cat: 'docker',
        title: '起 compose 之前，先让配置自己证明没问题',
        prompt: '你改了 `docker-compose.yml`，`up -d` 之后某个服务一直起不来。**问题可能是配置写错了**（缩进、变量没定义、端口冲突），而这类错误在 `up` 的输出里往往只是一句含糊的报错。**有更好的做法：先让配置自己校验一遍。**',
        task: '先校验并展开 compose 配置，再用确定性的方式启动',
        steps: [
          { title: '校验并展开配置', about: '看最终生效的配置长什么样', cmd: 'docker compose config', ref: 'dk-compose-config', hint: ['动手前先让配置"自证清白"：把变量替换、默认值合并之后的**最终配置**完整展开出来看', 'docker compose ____'], note: '**它会把环境变量替换后的真实值打出来** —— 变量没定义、拼错名字在这步就能发现' },
          { title: '只做校验，不要输出', about: '放进 CI 当门禁', cmd: 'docker compose config -q && echo "配置合法"', ref: 'dk-compose-config', hint: ['要放进流水线当门禁：加一个"安静模式"的选项，只靠退出码表示合法与否', 'docker compose config ____ && echo "配置合法"'], note: '`-q` 无输出、只看退出码 —— **这就是 CI 里校验 compose 配置的标准写法**' },
          { title: '叠加环境差异文件后再校验', about: '生产覆盖开发配置', cmd: 'docker compose -f docker-compose.yml -f docker-compose.prod.yml config', ref: 'dk-compose-config', hint: ['生产配置通常是"基础文件 + 覆盖文件"两层：把两个文件都指定（后面的覆盖前面的），再展开看最终结果', 'docker compose -f docker-compose.yml -f docker-compose.prod.yml ____'], note: '**多个 `-f` 是"后者覆盖前者"** —— 这是 compose 管理多环境的标准方式' },
          { title: '后台启动并重建改动过的', about: '确定性地启动', cmd: 'docker compose up -d --build web', ref: 'dk-compose-up', hint: ['确认配置没问题再启动：后台起来，并且**强制重新构建**目标服务（否则它可能用旧的镜像）', 'docker compose up -d ____ web'], note: '`--build` 只作用于指定服务 —— **不加它，改了 Dockerfile 也不会重新构建**' },
          { title: '起完核对实际状态', about: '启动不等于成功', cmd: 'docker compose ps', ref: 'dk-compose-ps', hint: ['`up` 返回不代表服务都健康：列一遍实际状态，确认每个服务都在跑', 'docker compose ____'], note: '默认只显示运行中的 —— **"少了谁"本身就是答案**（加 `-a` 看退出的）' }
        ],
        answer: 'docker compose config',
        alt: [
          'docker compose config',
          'docker compose config -q && echo "配置合法"'
        ],
        expect: /services|image|build|version|配置合法/,
        teach: '**Compose 的正确使用顺序是"校验 → 展开确认 → 启动 → 核对状态"，跳过前两步就会在 `up` 的滚动输出里迷失**。`docker compose config` 的价值在于它做三件 `up` 不会告诉你的事：**① 变量替换的结果**（`${TAG}` 到底替换成了什么 —— **变量没定义时它会警告，而 `up` 可能直接用一个空值跑起来**）；**② 多文件叠加后的最终形态**（`-f base.yml -f prod.yml` 谁覆盖了谁）；**③ 默认值填充**（你没写的 `network`、`restart` 等会被补上什么）。`-q` 版本则是给 CI 用的门禁 —— **配置不合法就让流水线红掉**，比部署到一半失败早得多。三组容易搞混的选项：**`up -d --build`**（后台启动 + 强制重建指定服务 —— **改了 Dockerfile 不加这个会用旧镜像**）、**`up -d --force-recreate`**（即使配置没变也重建容器 —— 改了环境变量但 compose 认为"没变化"时用它）、**`up -d --remove-orphans`**（清掉配置里已删除、但容器还在的服务 —— **改名或删服务后必须加，否则旧容器会一直占着端口**）。另外两个高频坑：**端口冲突**（宿主机端口已被别的进程占用 —— `up` 会报 `address already in use`，先用 `ss -tlnp` 查清）；**依赖没就绪**（`depends_on` 只保证**启动顺序**，不保证**服务可用** —— 应用必须自己带重试，或用 healthcheck + `condition: service_healthy`）。最后：**`up` 的输出要看完**（很多人 `up -d` 之后立刻走开，而失败信息就在那几行里）。'
      },

      {
        id: 'hl-upgrade-diff-before-apply',
        cat: 'helm',
        title: '升级前先看会改什么：diff 比 dry-run 多告诉你什么',
        prompt: '你要把线上 web 服务从 2 副本改成 3 副本并换镜像 tag。**上一次升级没看清单就直接上，结果把 Service 的 type 一起改了**，业务断了十分钟。这次要先看清"到底会改哪些字段"。',
        task: '用 helm diff 看清升级会改什么，再真正升级，最后确认结果',
        steps: [
          { title: '先看这次升级会改什么', about: '逐字段对比"渲染结果"与"集群现状"', cmd: 'helm diff upgrade myapp myorg/web -n my-app --set replicaCount=3', ref: 'hl-upgrade', hint: ['要的不是"会生成哪些 YAML"，而是"相比集群里现在跑着的，哪些字段会变" —— 这个能力来自一个插件，装好之后用法是 diff + 子命令', 'helm ____ upgrade myapp myorg/web -n my-app --set replicaCount=3'], note: '`-` 是现状、`+` 是将要变成的样子；**它比对的是集群里的真实对象**，这是 dry-run 给不了的' },
          { title: '确认镜像 tag 真的会变', about: '同一份 diff 里的第二处改动', cmd: 'helm diff upgrade myapp myorg/web -n my-app --set replicaCount=3 --set image.tag=1.3.0', ref: 'hl-upgrade', hint: ['镜像 tag 也是 values 里的一个路径 —— 按点号层级写，和 values.yaml 的结构对齐，再加一遍同样的对比', 'helm diff upgrade myapp myorg/web -n my-app --set replicaCount=3 ____ image.tag=1.3.0'], note: '两处改动都列出来了 —— **升级前能看到"改哪几个字段"是发布安全的核心**' },
          { title: '执行升级', about: '确认过清单才动手', cmd: 'helm upgrade myapp myorg/web -n my-app --set replicaCount=3 --set image.tag=1.3.0', ref: 'hl-upgrade', hint: ['清单确认过就可以升级了：release 名、chart 引用、命名空间、两组值，参数顺序和上一步完全一样，只是把 diff 换成真正的动作', 'helm ____ myapp myorg/web -n my-app --set replicaCount=3 --set image.tag=1.3.0'], note: 'REVISION 加 1 —— 每次 upgrade 都是一条新版本记录' },
          { title: '看渲染出来的副本数', about: '确认改动真的落到了清单里', cmd: 'helm template myapp myorg/web -n my-app --set replicaCount=3 | grep replicas:', ref: 'hl-template', hint: ['升级成功不代表写进去的值是对的：把同一个 chart 再本地渲染一遍，只筛出副本数那一行看', 'helm template myapp myorg/web -n my-app --set replicaCount=3 | ____ replicas:'], note: 'values 的优先级：`--set` > `-f` 文件 > chart 自带默认值' },
          { title: '确认镜像 tag 落到了清单里', about: '比看升级输出更直接的证据', cmd: 'helm template myapp myorg/web -n my-app --set image.tag=1.3.0 | grep image:', ref: 'hl-template', hint: ['同理，镜像那一行才是"这次到底要拉哪个 tag"的证据 —— 只看 upgrade 的输出是看不出来的', 'helm template myapp myorg/web -n my-app --set image.tag=1.3.0 | ____ image:'], note: 'tag 是 values 里的 `image.tag`，点号表示 YAML 的层级' }
        ],
        answer: 'helm diff upgrade myapp myorg/web -n my-app --set replicaCount=3',
        alt: [
          'helm diff upgrade myapp myorg/web -n my-app --set replicaCount=3',
          'helm template myapp myorg/web -n my-app --set replicaCount=3 | grep replicas:'
        ],
        expect: /has changed|replicas|spec\.replicas/,
        teach: '**`helm diff` 补的是 `--dry-run` 给不了的那一半信息。** 把四种"发布前预演"排清楚：`helm template` 只在**本地**渲染，不连集群、不知道集群现状；`helm upgrade --dry-run` 会连集群做校验（命名空间在不在、API 版本可不可用），但输出是"将要提交的完整清单"，**不告诉你和现在差在哪**；`helm diff upgrade` **把渲染结果与集群里的实际对象逐字段比**，直接列出 `-` 现状 / `+` 目标；`helm get manifest` 是回看"当前这一版到底是什么"。**为什么 diff 是升级前的最后一道闸**：K8s 的 apply 是"整份清单覆盖"，改动往往不是你想改的那一处 —— 改 values 时手滑动了缩进、chart 升版时上游把 Service 的 `type` 从 ClusterIP 改成 NodePort、加了个默认开启的 HPA，这些都会在 diff 里现形，而 `upgrade` 的输出只告诉你"STATUS: deployed"。`helm diff` 是**插件**不是内置命令（`helm plugin install https://github.com/databus23/helm-diff`），所以 CI 镜像里要固定插件版本 —— 第三方插件会执行本地命令，只从可信来源装。最后记住 values 的**优先级链**：`--set` > `-f/--values` 文件（**多个 -f 是后者覆盖前者**）> chart 自带 `values.yaml`，而 `helm get values <release> -a` 才能看到三层合并后"最终生效"的值。'
      },

      {
        id: 'hl-upgrade-failed-rollback',
        cat: 'helm',
        title: '升级失败后：回滚、还是重推一版',
        prompt: '你刚 `helm upgrade` 完，业务开始报错。**第一反应是回滚 —— 但上一版真的没问题吗？** 如果上一版也有问题，回滚只是把故障从 A 换成 B；而如果你不回滚先去查原因，用户还在受影响。',
        task: '先判断"回滚到第几版"，确认目标版本的状态，再执行回滚并确认结果',
        steps: [
          { title: '先确认现在是什么状态', about: 'STATUS 与 REVISION 是两个不同的信息', cmd: 'helm status myapp', ref: 'hl-status', hint: ['出问题先看这个 release 当前的样子：它现在的状态是什么、处在第几版 —— 这两个不是一回事', 'helm ____ myapp'], note: 'STATUS 是这一版的结局，REVISION 是"现在是第几版" —— 排障要先分清' },
          { title: '看上一版是什么', about: '回滚前确认目标版本', cmd: 'helm status myapp --revision 2', ref: 'hl-status', hint: ['回滚不能凭感觉选版本号：把候选的那一版单独查出来，看它的状态与信息，确认它确实是个可用的版本', 'helm status myapp ____ 2'], note: '第 2 版显示 `superseded`（被取代）—— 这是历史版本的正常状态，不代表它当时失败过' },
          { title: '翻出完整版本历史', about: 'DESCRIPTION 列是回滚的决策依据', cmd: 'helm history myapp', ref: 'hl-history', hint: ['要知道"每一版分别是怎么来的、结局如何"，就得把整条版本记录列出来 —— 注意看最后一列的说明文字', 'helm ____ myapp'], note: 'DESCRIPTION 列写着每版是 Install / Upgrade / Rollback —— **选版本号要看它，不是凭印象**' },
          { title: '回滚到那一版', about: '回滚是一次新发布，不是撤销', cmd: 'helm rollback myapp 2', ref: 'hl-rollback', hint: ['确认好目标版本就执行回滚：两个参数 —— release 名 + 要回到的那个版本号', 'helm rollback ____ 2'], note: '回滚会**新增一条 revision**（不是删历史），所以回滚本身也可追溯、也能再回滚' },
          { title: '确认回滚真的生效', about: '回滚成功不代表业务好了', cmd: 'helm history myapp', ref: 'hl-history', hint: ['回滚命令说成功，只代表 K8s 资源被改回去了 —— 再看一次版本记录，确认最新那条写的是什么', 'helm ____ myapp'], note: '多出一条 `Rollback to 2` —— **版本号加 1 了**，这是"回滚也是一次发布"的直接证据' }
        ],
        answer: 'helm history myapp && helm rollback myapp 2 && helm history myapp',
        alt: [
          'helm status myapp --revision 2 && helm rollback myapp 2 && helm history myapp',
          'helm history myapp && helm rollback myapp 1 && helm history myapp'
        ],
        expect: /Rollback to \d/,
        teach: '**"回滚"是止血手段，不是根因分析。** 决策顺序应当固定成三步：**① 先看 `helm status`** 确认当前状态（`failed` 说明这一版根本没成功，`deployed` 说明它成功了但业务不对 —— **这两种情况的处置完全不同**）；**② 用 `helm history` 看 DESCRIPTION 列**选出最后一个已知可用的版本（不要凭"上一版应该没问题"猜，历史上真出现过"回滚到同样有问题的那一版"）；**③ 回滚后用 `helm history` 确认**新版本号已经产生。三条最容易踩的坑：**① 回滚不会撤销有状态改动** —— 数据库迁移、消息格式变更、已写入的对象存储数据都留在新格式上，所以"回滚完还是报错"十有八九是数据已经变了；这种情况下正确做法是**向前修（roll forward）**而不是回滚。**② `helm rollback` 只回退 Helm 管理的资源** —— 手工 `kubectl apply` 过的东西、CRD、PVC 都不在它的范围内。**③ 回滚 `revision` 越大不代表越新**：回滚是"用老版本的清单再发布一次"，所以版本号一直在涨，但内容是老的。**把这一步做在前面的办法**是升级时带 `--atomic --wait`：失败自动回滚，但要知道 `--atomic` 依赖就绪探针，探针写得不对它会在"应用其实已经好了"的时候误判失败。'
      },

      {
        id: 'hl-orphan-resources-not-in-helm',
        cat: 'helm',
        title: 'namespace 里那些"没人认领"的资源',
        prompt: '交接时前任说"这个环境都是 helm 管的"。可你 `helm list -n my-app` 只看到一个 release，而 `kubectl get all -n my-app` 里还有一堆对象。**哪些是被 helm 管的、哪些是某次手工 `kubectl apply` 留下的？**',
        task: '用 helm 的 managed-by 标签把"谁管的"分清楚，并读出一个 release 的完整清单',
        steps: [
          { title: '先看命名空间里有什么', about: '所有对象混在一起，看不出归属', cmd: 'kubectl get all -n my-app', ref: 'k8s-get', hint: ['交接第一步是清点现场：把这个命名空间里的对象全列出来 —— 注意它们混在一起，从这个视图看不出谁是谁创建的', 'kubectl get all ____ my-app'], note: '这个列表回答的是"有什么"，**答不了"是谁建的"**' },
          { title: '按 helm 的标签筛一遍', about: 'managed-by=Helm 才是 helm 管的', cmd: 'kubectl get all -n my-app -l app.kubernetes.io/managed-by=Helm', ref: 'k8s-get-nodes-label', hint: ['helm 创建每个对象时都会打上一组标准标签，其中标着"由谁管理"的那一个就是判据 —— 用标签选择器把 helm 管的挑出来', 'kubectl get all -n my-app ____ app.kubernetes.io/managed-by=Helm'], note: '**能筛出来的才是 helm 管的** —— 对照上一步，差集就是"没人认领"的资源' },
          { title: '从 helm 侧看归属', about: 'release 的视角看到的是名字与版本', cmd: 'helm list -n my-app', ref: 'hl-list', hint: ['同一个命名空间，换个视角看：包管理器只知道自己的 release，它列出来的是名字、版本、状态，而不是 K8s 对象', 'helm list ____ my-app'], note: 'helm 的视角里只有 release；**"一个 release 对应哪些 K8s 对象"要另查**' },
          { title: '读出一个 release 的完整清单', about: '这才是"它到底创建了什么"', cmd: 'helm get manifest myapp -n my-app', ref: 'hl-get', hint: ['要回答"这个 release 具体管了哪些对象"，就得把它当前这一版实际提交的清单原样取出来看', 'helm get ____ myapp -n my-app'], note: '这就是 helm 存下来的那份清单 —— **`metadata.name` 都以 release 名开头**，因为模板里就写着 `{{ .Release.Name }}`' },
          { title: '只挑对象类型看', about: '几十行 YAML 里只要那几行', cmd: 'helm get manifest myapp -n my-app | grep -E "^kind:|^  name:"', ref: 'hl-get', hint: ['清单太长，只想知道"它建了哪几类对象、分别叫什么" —— 用扩展正则一次筛出类型行与名字行', 'helm get manifest myapp -n my-app | ____ -E "^kind:|^  name:"'], note: '三种对象：ServiceAccount / Service / Deployment —— **这就是"helm 管了什么"的权威答案**' }
        ],
        answer: 'kubectl get all -n my-app -l app.kubernetes.io/managed-by=Helm',
        alt: [
          'kubectl get all -n my-app -l app.kubernetes.io/managed-by=Helm',
          'helm get manifest myapp -n my-app | grep -E "^kind:|^  name:"'
        ],
        expect: /(NAME|NAME\s+READY)|kind:|Deployment|ServiceAccount/,
        teach: '**Helm 与 K8s 是"声明式管理"与"实际对象"两层，交接时必须两边都看。** 判断一个对象归谁管，唯一可靠判据是标签 **`app.kubernetes.io/managed-by=Helm`** —— Helm 创建对象时自动打上它，另外还有 `app.kubernetes.io/instance=<release名>`（**这个才是"属于哪个 release"**，同一 chart 装两次靠它区分）、`helm.sh/chart=<chart>-<版本>`（**能看出这个对象是哪个 chart 版本渲染的** —— chart 升级后标签没变往往说明升级没真正生效）。**为什么"没人认领"的资源危险**：它不在任何 release 的清单里，所以 `helm uninstall` 删不掉、`helm rollback` 管不着、下一任交接时也没人知道它为什么在那儿；反过来它可能**正被依赖**（手工建的 Service 被 helm 装的 Deployment 引用），所以发现之后先查引用关系再决定，**别直接删**。三个实用招数：**① 反查"这个对象有没有被 helm 管"** —— `kubectl get deploy web -o jsonpath="{.metadata.labels}"` 看标签；**② 找出某个 release 的全部对象** —— `helm get manifest`（当前版）或 `helm get manifest --revision N`（历史某一版）；**③ 找出"集群里有哪些不是 helm 建的"** —— 用上面的标签选择器取补集。**最后一条**：Helm 自己用命名空间里的 Secret 存 release 元数据（名字形如 `sh.helm.release.v1.<release>.v<rev>`），所以 `kubectl get secret -n <ns> | grep helm` 能看到全部历史版本 —— 这解释了为什么"卸载但保留历史"（`--keep-history`）之后 `helm list -a` 还能看到那条记录。'
      },

      {
        id: 'hl-release-inventory-audit',
        cat: 'helm',
        title: '交接审计：这套环境的 release 是谁、为什么装的',
        prompt: '安审要求你说明：生产命名空间里每个 release 是谁装的、装的哪个版本、用的什么配置。**你能列出 release，但"为什么装"和"改过哪些值"答不上来** —— 而这两条恰恰是审计要的。',
        task: '做一次 release 审计：版本记录、变更原因注解、生效配置、以及权限确认',
        steps: [
          { title: '先清点全部 release', about: '审计的第一步是"有哪些"', cmd: 'helm list -A', ref: 'hl-list', hint: ['审计要从完整清单开始：release 可能散落在多个命名空间里，所以范围要放到全部命名空间', 'helm list ____'], note: '**一定要加 `-A`** —— 默认只看 kubeconfig 当前上下文的那个命名空间，会漏掉大部分' },
          { title: '看它的版本记录', about: '每一次变更都留痕', cmd: 'helm history myapp', ref: 'hl-history', hint: ['审计要回答"改过几次、每次是什么"：release 的版本记录只增不删，正好是这份台账', 'helm ____ myapp'], note: '三次变更都在 —— **但 DESCRIPTION 只说"Upgrade complete"，看不出"为什么改"**' },
          { title: '查变更原因注解', about: '这才是审计要的"为什么"', cmd: 'kubectl get deploy web -n my-app -o jsonpath="{.metadata.annotations}"', ref: 'k8s-annotate', hint: ['"为什么改"要写在对象注解里才留得下来 —— 取注解用的输出格式是"路径表达式"，把 Deployment 的注解原样取出来看', 'kubectl get deploy web -n my-app -o jsonpath=____'], note: '`kubernetes.io/change-cause` 就是发布原因 —— **规范做法是每次 upgrade 都带 `--description` 或写这个注解**' },
          { title: '看当前生效的配置', about: '审计要的是"实际值"不是"文件里的值"', cmd: 'helm get values myapp -a', ref: 'hl-get', hint: ['"用的什么配置"要的是三层合并后最终生效的值，而不是当初提交的那几个覆盖项 —— 加一个表示"全部"的选项', 'helm get values myapp ____'], note: '`-a` 给的是**计算后**的值（chart 默认 + values 文件 + --set 合并结果）；不加 `-a` 只有用户显式给的那几项' },
          { title: '确认谁能动它', about: '审计的最后一问是权限', cmd: 'kubectl auth can-i delete pods -n my-app', ref: 'k8s-auth-can-i', hint: ['最后一个问题："谁能删"。用权限自检命令问一句，它会直接回 yes 或 no', 'kubectl auth ____ delete pods -n my-app'], note: '`can-i` 是**唯一能确定回答"我能不能做这个动作"**的命令 —— 比读 Role 定义再自己推靠谱' }
        ],
        answer: 'helm list -A && helm history myapp && helm get values myapp -a',
        alt: [
          'helm list -A && helm history myapp && helm get values myapp -a',
          'helm list -A && helm get values myapp -a && kubectl auth can-i delete pods -n my-app'
        ],
        expect: /myapp|COMPUTED VALUES|REVISION|yes/,
        teach: '**Helm 的审计台账分四层，缺一层就答不全。** **① 有哪些**：`helm list -A`（**必须 `-A`**，否则只看当前命名空间）；**② 改过几次**：`helm history <release>`，每次 install/upgrade/rollback 都是一条 revision，**只增不删**；**③ 为什么改**：这一层 Helm 自己**不记**（DESCRIPTION 只写"Upgrade complete"），要靠 `kubernetes.io/change-cause` 注解 —— 所以规范做法是升级时带 **`helm upgrade --description "修复订单超时"`**，它会把这句话写进 revision；**④ 用的什么配置**：`helm get values <release> -a` 给"三层合并后的生效值"（**`-a` 是关键**，不加只有用户显式覆盖的那几项）。**把这四层变成习惯的做法**：把 `--description` 写进发布流水线模板，让"为什么改"永远不靠人记；再配合 `helm get values -a > values-effective.yaml` 在每次发布时留档 —— 出事时能直接回答"当时跑的是哪份配置"。**权限那一问用 `kubectl auth can-i`**：它会**真的做一次权限判定**并回 yes/no，比"读 Role 定义再看自己绑了哪个 Role"可靠得多；`--list` 还能一次列出"我在这个命名空间里能做的所有动作"。最后一条实务：**审计还要看"有没有该删没删的"** —— `helm list -A --all`（含 uninstalled）会列出被卸载但保留了历史的 release，那些历史里可能含着敏感信息（values 里的密码会以明文存在 release Secret 里）。'
      },

      {
        id: 'hl-upgrade-install-idempotent',
        cat: 'helm',
        title: '发布脚本怎么写才能重复执行：upgrade --install',
        prompt: '你的发布脚本里写的是 `helm install`，**第二次跑就报 `cannot re-use a name that is still in use`**。改成 `helm upgrade` 之后，**在还没装过的环境上又报 `has no deployed releases`** —— 同一份脚本没法在"全新环境"和"已有环境"上都跑通。',
        task: '写出一个幂等的发布命令，并用两次执行验证它确实幂等',
        steps: [
          { title: '先看当前有没有这个 release', about: '幂等的前提是先知道状态', cmd: 'helm list -n my-app', ref: 'hl-list', hint: ['脚本要判断"该装还是该升"，先得知道现在有没有 —— 把这个命名空间里的 release 列出来', 'helm list ____ my-app'], note: '没有 canary —— 说明这是**全新环境**，直接 `upgrade` 会失败' },
          { title: '一条命令兼顾两种情况', about: '--install 让 upgrade 自动补装', cmd: 'helm upgrade --install canary myorg/web -n my-app --create-namespace', ref: 'hl-upgrade-install', hint: ['让同一个子命令在"release 不存在时自动改成安装" —— 这就是发布脚本该用的写法；另外命名空间也可能不存在，顺手让它一起建', 'helm upgrade ____ canary myorg/web -n my-app --create-namespace'], note: '输出第一行 `Release "canary" does not exist. Installing it now.` —— **它自己完成了判断**' },
          { title: '确认装上了', about: '验证第一次执行的结果', cmd: 'helm list -n my-app', ref: 'hl-list', hint: ['第一次执行完，确认那个名字真的出现了 —— 幂等脚本也要有验证步骤', 'helm list ____ my-app'], note: 'canary 与 myapp 都在了 —— REVISION 都是 1，说明 canary 是刚装的' },
          { title: '再执行一次同一条命令', about: '幂等性的真正考验', cmd: 'helm upgrade --install canary myorg/web -n my-app --create-namespace', ref: 'hl-upgrade-install', hint: ['幂等的判据是"再执行一次不报错、且不产生意外结果" —— 把上一步的命令原样再跑一遍，那个"不存在就装"的选项这次会走另一条分支', 'helm upgrade ____ canary myorg/web -n my-app --create-namespace'], note: '这次没有"does not exist"那行 —— **它走了 upgrade 分支**，同一条命令两种路径' },
          { title: '确认走的是升级而不是重装', about: '看 REVISION 有没有涨', cmd: 'helm history canary', ref: 'hl-history', hint: ['怎么证明第二次是"升级"而不是"删了重装"？看版本记录 —— 重新安装会从 1 开始，升级会往上加', 'helm ____ canary'], note: 'REVISION 从 1 变成 2，且第 1 条是 Install、第 2 条是 Upgrade —— **这就证明了幂等**' }
        ],
        answer: 'helm upgrade --install canary myorg/web -n my-app --create-namespace',
        alt: [
          'helm upgrade --install canary myorg/web -n my-app --create-namespace',
          'helm upgrade --install canary myorg/web -n my-app --create-namespace --set replicaCount=2'
        ],
        expect: /canary|STATUS: deployed|REVISION/,
        teach: '**发布脚本必须幂等，而 `helm upgrade --install` 就是 Helm 为这件事准备的开关。** 三个命令的边界要分清：`helm install` **只装**（名字被占用就报 `cannot re-use a name that is still in use`）；`helm upgrade` **只升**（release 不存在就报 `has no deployed releases`）；`helm upgrade --install`（可简写 `-i`）**不存在就装、存在就升** —— 所以 CI 脚本里应当只用第三种。**为什么这不是"省事"而是"正确"**：流水线要能对"全新环境"和"已有环境"跑同一份脚本（首次部署、日常发布、灾备重建都是同一条流水线），靠 shell 里的 `if helm list | grep` 自己判断会引入竞态（判断和动作之间别人也可能建）。**升级常用的三个配套开关**：`--create-namespace`（命名空间不存在就建 —— 少了它全新环境会报 `namespaces "xxx" not found`）；`--atomic --wait`（**等资源就绪，失败自动回滚** —— 但 `--atomic` 依赖就绪探针，探针写得不对会在"应用其实已经好了"时误判失败）；`--timeout 5m`（等多久算超时，默认 5 分钟，**大镜像首次拉取经常不够**）。**一个必须知道的坑**：`helm upgrade` 的默认行为是**基于"上一版的 values"叠加本次的 `--set`**（所以不写 `-f` 时旧值会保留）；如果你希望"完全按文件来"，要么每次都带上完整的 values 文件，要么用 `--reset-values`。最后：判断发布成功不能只看 `STATUS: deployed`（它只说明 K8s 接受了清单），**要看 `helm history` 的 revision 涨了、以及 `kubectl rollout status` 真的就绪**。'
      }
,

      {
        id: 'hl-lint-before-release',
        cat: 'helm',
        title: '上架前自检：lint、元数据与"干跑"三关',
        prompt: '你要把一个自研 chart 推到团队仓库给别的组用。**以前出过两次事**：一次是 `Chart.yaml` 的 `version` 忘了改，别人 `helm upgrade` 拉到的还是旧包；一次是模板里引用了不存在的 values 键，渲染出来是个空字符串。**上架前得有一套自己的检查流程。**',
        task: '依次用 lint、元数据、生效取值、渲染结果、干跑把 chart 检查一遍',
        steps: [
          { title: '先让 lint 挑毛病', about: '静态检查语法与规范问题', cmd: 'helm lint myorg/web', ref: 'hl-lint', hint: ['上架前的第一关是静态检查：它会把模板语法错误、Chart.yaml 缺字段、命名不规范这类问题一次列出来', 'helm ____ myorg/web'], note: '`[INFO]` 是建议不是错误 —— **要看最后那行"几个 chart 通过、几个失败"**' },
          { title: '核对元数据', about: 'version 与 appVersion 是两回事', cmd: 'helm show chart myorg/web', ref: 'hl-show', hint: ['第二关是元数据：把 Chart.yaml 的关键字段打出来看 —— 重点区分"chart 自身的版本"和"里面装的软件版本"', 'helm show ____ myorg/web'], note: '`version: 1.2.3` 是 **chart 版本**，`appVersion` 是**里面应用的版本** —— 两者可以不同步' },
          { title: '看默认取值', about: '别人不传 -f 时会拿到什么', cmd: 'helm show values myorg/web', ref: 'hl-show', hint: ['第三关是"默认值"：别的组多半只写一个最简的 install，所以 chart 自带的默认值必须本身就能跑起来', 'helm show ____ myorg/web'], note: '**`helm show values` 是参数的权威来源** —— README 里的参数表经常过期，这个不会' },
          { title: '确认渲染结果里有镜像', about: '模板引用了不存在的键会渲染成空', cmd: 'helm template myorg/web | grep -E "image:|replicas:"', ref: 'hl-template', hint: ['第四关是真正渲染一遍并挑出关键字段：镜像与副本数如果渲染成空字符串，apply 到集群就是一次故障', 'helm template myorg/web | ____ -E "image:|replicas:"'], note: '不传名字时用 `release-name` 占位 —— **没写值的键会渲染成空，这是上架前最该抓的一类错**' },
          { title: '干跑一次安装', about: '连集群校验 API 与命名空间', cmd: 'helm install canary myorg/web -n my-app --dry-run | head -6', ref: 'hl-install', hint: ['最后一关是"干跑"：它比 template 多做一步 —— 会连集群确认命名空间在不在、API 版本可不可用', 'helm install canary myorg/web -n my-app ____ | head -6'], note: '`STATUS: pending-install` 是干跑的正常值 —— **干跑不会真的产生 release**' },
          { title: '确认干跑没留下东西', about: '验证"干跑"的承诺', cmd: 'helm list -n my-app', ref: 'hl-list', hint: ['干跑承诺"不落地"，那就验证一下：列一遍这个命名空间，确认刚才那个名字没有出现', 'helm list ____ my-app'], note: '没有 canary —— **干跑确实什么都没落地**' }
        ],
        answer: 'helm lint myorg/web && helm show chart myorg/web && helm template myorg/web | grep -E "image:|replicas:"',
        alt: [
          'helm lint myorg/web && helm show values myorg/web',
          'helm show chart myorg/web && helm template myorg/web | grep -E "image:|replicas:"'
        ],
        expect: /chart\(s\) linted|apiVersion|version:|image:|replicas:/,
        teach: '**上架自检的价值在于"把只有别人会遇到的错误提前到自己这里暴露"。** 五关各自拦一类问题：**`helm lint`** 拦**模板语法**与**Chart.yaml 规范**（缺 icon 只是 INFO，但缺 `apiVersion`、模板里有未闭合的 `{{` 会直接失败）；**`helm show chart`** 拦**版本号忘记改** —— `version` 是 chart 版本、`appVersion` 是里面应用的版本，**仓库靠 `version` 区分新旧**，忘了改的话别人 `helm upgrade` 拉到的还是旧包，而且**不会报错**（这是最隐蔽的一种：你以为发布了新版本，其实推的是旧的）；**`helm show values`** 拦**文档与实现不一致**（README 的参数表常年过期，**这个命令是权威来源**）；**`helm template`** 拦**模板引用了不存在的键** —— 渲染出来是个空字符串，而 K8s 对很多字段的空值不会报错，直到运行时才发现（典型：`image:` 后面是空的）；**`helm install --dry-run`** 拦**集群侧的不兼容**（命名空间不存在、API 版本已废弃、必填字段缺失），这是 template 给不了的，因为它压根不连集群。**几条实务**：把前四关写进 CI（`helm lint` + `helm template` 不需要集群凭据，最容易自动化），`--dry-run` 放在有集群凭据的部署前步骤；`helm lint --strict` 会把 INFO 也当失败，**上架仓库的流水线建议开**；`helm install --dry-run` 与 `helm template` 的取舍已经讲过 —— **前者要集群、验证更全，后者离线、适合放进代码评审**。最后：**`helm package` 之前记得改 `version`**，这条最好也做成 CI 检查（对比 git tag 与 Chart.yaml 的 version）。'
      }
,

      {
        id: 'hl-first-look',
        cat: 'helm',
        title: '接手一套 K8s 环境：先搞清"上面装了什么"',
        prompt: '你拿到一台集群的访问权限。`kubectl get pods` 只会给你一串 Pod 名字，**但看不出"这套东西是谁装的、装的是哪个版本、怎么升级"**。Helm 是 K8s 的包管理器 —— 先学会用它的视角看环境。',
        task: '从"有哪些仓库、能装什么、已经装了什么"三个角度把环境看一遍',
        steps: [
          { title: '看配了哪些 Chart 仓库', about: '能装的东西从哪来', cmd: 'helm repo list', ref: 'hl-repo-list', hint: ['第一眼看"货源"：这台机器配置了哪些 Chart 仓库、各自的地址是什么', 'helm ____ list'], note: '**官方公共仓库（bitnami）+ 自己公司的私库** 是常见组合 —— 私库地址往往就是你们的制品仓库' },
          { title: '在仓库里搜一个 Chart', about: '先看有什么可装', cmd: 'helm search repo web', ref: 'hl-repo-search', hint: ['找东西用搜索：在已添加的仓库里按名字找 —— 输出里有**两个容易混淆的版本列**', 'helm search repo ____'], note: '**`CHART VERSION` 是 chart 自身的版本，`APP VERSION` 是里面装的软件版本** —— 两者不是一回事，发布时钉住的是前者' },
          { title: '看已经装了哪些 release', about: 'release = 装到集群里的一份实例', cmd: 'helm list -A', ref: 'hl-list', hint: ['看"已经装了什么"：列出所有命名空间的 release —— **`-A` 不能省**，否则只看当前命名空间', 'helm list ____'], note: '**`REVISION=3` 说明这个 release 升级过两次**；`STATUS=deployed` 是正常状态 —— **一个 release 由"名字 + 命名空间"唯一确定**' },
          { title: '看这个 Chart 的元信息', about: '版本、说明、依赖', cmd: 'helm show chart myorg/web', ref: 'hl-show', hint: ['想知道一个 Chart 是什么，看它的元信息 —— 一条命令输出 apiVersion、名称、版本与说明', 'helm show ____ myorg/web'], note: '**`version: 1.2.3` 是 chart 版本**（发布锚点），`appVersion` 是里面的应用版本 —— 升级时改的是前者' },
          { title: '看它的默认取值', about: '不传参数时会装成什么样', cmd: 'helm show values myorg/web', ref: 'hl-show', hint: ['再看它的默认配置：**这是参数的权威来源**（README 里的参数表经常过期，这个不会）', 'helm show ____ myorg/web'], note: '默认值 + values 文件 + `--set` 三层合并，最终生效的值才是真正跑起来的配置' }
        ],
        answer: 'helm list -A',
        alt: [
          'helm list -A',
          'helm repo list'
        ],
        expect: /myapp|prometheus|mysql|myorg|bitnami/,
        teach: '**Helm 是 K8s 的包管理器，它给集群带来的是"版本"与"来源"这两个 kubectl 给不了的维度。** `kubectl get pods` 告诉你"现在跑着什么"，**但答不了"它是谁装的、装的哪一版、怎么升回去"** —— 这正是 Helm 的 release 概念要解决的。**五个核心概念，按理解顺序**：**Chart**（打包好的应用模板，相当于"软件安装包"）、**Repository**（存放 Chart 的地方，`helm repo list/add/update` 管理）、**Release**（Chart 装到集群里的一份**实例** —— **同一个 Chart 可以用不同名字装多次**，互不干扰）、**Revision**（release 的版本号，每次 install/upgrade/rollback 都 +1，**只增不删**）、**Values**（配置，三层合并：Chart 默认 → `-f` 文件 → `--set`，**后者覆盖前者**）。**为什么"release 由名字 + 命名空间唯一确定"这条要记住**：它解释了两件事 —— 同一个 Chart 能在 `dev` 与 `prod` 各装一份；以及 `helm list` 默认只看 kubeconfig 当前上下文的命名空间，**摸清环境必须加 `-A`**（漏看别的命名空间是接手环境时最常见的失误）。**`helm show chart` 与 `helm show values` 的分工**：前者看"这个包是什么"（版本、说明），后者看"装了会是什么样"（默认配置）—— **`show values` 才是参数的权威来源**，因为 README 会过期而它不会。**Helm 3 的一个重要变化**：没有服务端组件（Tiller）了，**release 的元数据以 Secret 形式存在 release 所在的命名空间里**（名字形如 `sh.helm.release.v1.<release>.v<rev>`）—— 这解释了为什么 `helm list -A` 需要权限、也解释了为什么"卸载但保留历史"后还能查到记录。**最后一条实务**：接手一套环境时，`helm list -A` + `helm history <release>` 这两步能把"有什么、怎么变成现在这样的"基本问清 —— **比逐个 `kubectl describe` 高效得多，因为 Helm 视角自带版本与时间线**。'
      }

  );
})();
