/* data/kubernetes.js · 分类 08 Kubernetes（Phase 1 首批：集群信息 / 查询 / 排错 / 调试） */
(function () {
  'use strict';

  var catId = 'kubernetes';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ==================== A. 集群信息与上下文 ==================== */

    /* ---------- 1 ---------- */
    /* ---------- 1 / 80 ---------- */
    {
      id: 'k8s-get-nodes',
      name: 'kubectl get nodes',
      alias: ['kubectl get node', 'kubectl get no'],
      level: 1,
      syntax: 'kubectl get nodes [选项]',
      summary: '查看集群所有节点的状态、角色、版本与内网 IP。',
      desc: '排任何问题之前的第一条命令：确认节点是否都 Ready。如果某个节点 NotReady，它上面的 Pod 大概率会被驱逐或处于异常状态。',
      params: [
        { flag: '-o wide', desc: '额外显示节点内网 IP、操作系统内核版本、容器运行时' },
        { flag: '--show-labels', desc: '显示节点的所有标签，便于确认调度约束' },
        { flag: '--sort-by=.metadata.name', desc: '按名称排序，节点多时便于查找' },
        { flag: '-w, --watch', desc: '持续监听变化，观察节点加入或状态翻转的过程' },
        { flag: '-l <标签>', desc: '按标签筛选节点，如 -l node-role.kubernetes.io/worker=' }
      ],
      examples: [
        { cmd: 'kubectl get nodes -o wide', desc: '最常用：一眼看清所有节点状态与内网 IP' },
        { cmd: 'kubectl get nodes --show-labels', desc: '看节点标签，排查"Pod 为什么没调度到这个节点"' },
        { cmd: 'kubectl get nodes -w', desc: '新建节点后实时等待它变成 Ready' }
      ],
      notes: [
        'STATUS 为 NotReady 时，用 `kubectl describe node <节点名>` 看 Conditions 与 Events，常见原因是 kubelet 挂了、磁盘压力（DiskPressure）或网络插件异常',
        '节点 IP 是 VPC 内网地址，从集群外访问不了；跨节点不通要查安全组与 VPC 路由'
      ],
      related: ['k8s-describe', 'k8s-cordon', 'k8s-drain'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/',
      tags: ['节点', '集群', '排错']
    },

    /* ---------- 2 ---------- */
    /* ---------- 2 / 80 ---------- */
    {
      id: 'k8s-cluster-info',
      name: 'kubectl cluster-info',
      level: 1,
      syntax: 'kubectl cluster-info [选项]',
      summary: '显示 API Server 与控制面组件的访问地址，验证当前连的是哪个集群。',
      desc: '当你本地配了多个 kubeconfig（华为云 CCE、测试集群、自建集群），这条命令能立刻告诉你当前 kubectl 到底连到哪儿了。',
      params: [
        { flag: 'dump', desc: '导出集群全部诊断信息（日志、配置、资源），用于提交工单' },
        { flag: '-n, --namespace', desc: '指定命名空间（一般用不到）' }
      ],
      examples: [
        { cmd: 'kubectl cluster-info', desc: '确认当前连接的集群地址，云端 CCE 集群会显示 CCE 提供的 API Server 域名' },
        { cmd: 'kubectl cluster-info dump --all-namespaces --output-directory=/tmp/cce-dump', desc: '集群异常时导出完整快照，便于离线分析或提工单' }
      ],
      notes: [
        '`dump` 输出量很大，务必加 `--output-directory`，否则会刷满终端'
      ],
      related: ['k8s-config', 'k8s-version'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_cluster-info/',
      tags: ['集群', '连接', 'kubeconfig']
    },

    /* ---------- 3 ---------- */
    /* ---------- 3 / 80 ---------- */
    {
      id: 'k8s-config',
      name: 'kubectl config',
      level: 2,
      syntax: 'kubectl config <子命令> [选项]',
      summary: '管理 kubeconfig：查看与切换集群、用户、上下文。',
      desc: '一个 kubeconfig 里可以放多个集群。`context`（上下文）把"集群 + 用户 + 默认命名空间"绑成一组，切换上下文就是切换目标集群。华为云 CCE 的做法是从控制台下载 kubeconfig 文件，放到 `~/.kube/config` 或指定 `KUBECONFIG` 环境变量。',
      params: [
        { flag: 'get-contexts', desc: '列出所有上下文，带 * 的为当前使用中' },
        { flag: 'use-context <名字>', desc: '切换到指定上下文' },
        { flag: 'set-context --current --namespace=<ns>', desc: '给当前上下文设置默认命名空间，省掉每次都敲 -n' },
        { flag: 'view --minify', desc: '只显示当前上下文的内容，便于确认连的是哪个集群' },
        { flag: 'current-context', desc: '仅打印当前上下文名称，适合写进脚本' }
      ],
      examples: [
        { cmd: 'kubectl config get-contexts', desc: '列出所有集群上下文，确认有没有切错环境' },
        { cmd: 'kubectl config use-context cce-prod', desc: '切到生产集群（操作前务必确认！）' },
        { cmd: 'kubectl config set-context --current --namespace=my-app', desc: '把默认命名空间设为 my-app，之后不用反复写 -n' }
      ],
      notes: [
        '**切错集群是生产事故的高发原因**：执行破坏性命令前先跑 `kubectl config current-context` 确认一下',
        'CCE 的 kubeconfig 会过期（证书有有效期），报 `Unauthorized` 时去控制台重新下载即可',
        '`KUBECONFIG` 环境变量可以指定多个文件，用冒号（Windows 用分号）分隔合并使用'
      ],
      related: ['k8s-cluster-info', 'k8s-get'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_config/',
      tags: ['kubeconfig', '上下文', '多集群']
    },

    /* ---------- 4 ---------- */
    /* ---------- 4 / 80 ---------- */
    {
      id: 'k8s-version',
      name: 'kubectl version',
      level: 1,
      syntax: 'kubectl version [--client] [--short]',
      summary: '查看 kubectl 客户端与服务端的版本号。',
      desc: 'kubectl 与 API Server 的版本差不能超过一个次版本（如 1.28 的 kubectl 配 1.30 的集群会有兼容问题），升级集群前先对一下版本。',
      params: [
        { flag: '--client', desc: '只显示客户端版本，连不上集群时也能用' },
        { flag: '--short', desc: '只输出版本号，便于脚本取值' },
        { flag: '-o yaml', desc: '输出完整信息，含 Git 提交号与编译平台' }
      ],
      examples: [
        { cmd: 'kubectl version --short', desc: '快速确认客户端与服务端版本是否匹配' },
        { cmd: 'kubectl version --client', desc: '集群已经连不上时，确认本地 kubectl 版本' }
      ],
      notes: [
        '新版本中 `--short` 已被标记废弃，若报未知参数就直接 `kubectl version`',
        '客户端版本比服务端高太多或低太多都可能出现"字段不认识"的报错'
      ],
      related: ['k8s-cluster-info'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_version/',
      tags: ['版本', '兼容性']
    },

    /* ---------- 5 ---------- */
    /* ---------- 5 / 80 ---------- */
    {
      id: 'k8s-api-resources',
      name: 'kubectl api-resources',
      level: 3,
      syntax: 'kubectl api-resources [选项]',
      summary: '列出集群支持的所有资源类型、缩写与所属 API 组。',
      desc: '写 YAML 时最怕 `apiVersion` 写错。这条命令告诉你当前集群里每种资源到底属于哪个 API 组、有什么简写（如 `po`、`svc`、`deploy`），以及是否受命名空间限制。',
      params: [
        { flag: '--namespaced=false', desc: '只列出集群级资源（Node、PV、ClusterRole 等）' },
        { flag: '--api-group=<组>', desc: '只看某个 API 组，如 apps、batch' },
        { flag: '-o wide', desc: '显示简写（SHORTNAMES）与资源类别（KIND）' },
        { flag: '--verbs=list', desc: '只列出支持 list 操作的资源' }
      ],
      examples: [
        { cmd: 'kubectl api-resources --namespaced=false', desc: '搞清楚哪些资源是集群级的，不会误加 -n' },
        { cmd: 'kubectl api-resources -o wide | grep ingress', desc: '确认 Ingress 在当前集群属于哪个 API 组（networking.k8s.io/v1 还是 extensions/v1beta1）' }
      ],
      notes: [
        '不同 K8s 版本资源所属的 API 组会变（典型是 Ingress、HPA、CronJob），从网上抄的 YAML 报 `no matches for kind` 就是这个原因，必须按当前集群的实际值写',
        'CRD（自定义资源）也会出现在这个列表里，是排查 Operator 是否安装成功的好方法'
      ],
      related: ['k8s-explain', 'k8s-apply'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_api-resources/',
      tags: ['API', '资源类型', 'YAML']
    },

    /* ---------- 6 ---------- */
    /* ---------- 6 / 80 ---------- */
    {
      id: 'k8s-explain',
      name: 'kubectl explain',
      level: 2,
      syntax: 'kubectl explain <资源>.<字段路径> [--recursive]',
      summary: '在命令行里查资源字段的含义与类型，不用去翻官网文档。',
      desc: '写 YAML 时的随身字典。字段路径用点号逐层下钻，配合 `--recursive` 可以一次看清整个字段树。',
      params: [
        { flag: '--recursive', desc: '递归展开所有子字段，看清完整结构' },
        { flag: '--api-version=<组/版本>', desc: '指定 API 版本，避免歧义' },
        { flag: '<资源>.<字段>.<子字段>', desc: '逐层下钻，如 pod.spec.containers.resources' }
      ],
      examples: [
        { cmd: 'kubectl explain pod.spec.containers.resources', desc: '查 requests/limits 怎么写、单位是什么' },
        { cmd: 'kubectl explain deployment.spec.strategy --recursive', desc: '展开滚动更新策略的全部可配字段' },
        { cmd: 'kubectl explain pod.spec.containers.livenessProbe', desc: '确认探针支持哪些字段（httpGet/tcpSocket/exec）' }
      ],
      notes: [
        '字段名大小写必须完全一致，写错会提示 "field not found"，可以先用上一级 `--recursive` 查准确名称',
        '查不到 Resource 时确认资源名写法，如 `kubectl explain ingresses` 而非 `ingress`'
      ],
      related: ['k8s-api-resources', 'k8s-apply'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_explain/',
      tags: ['YAML', '字段', '文档']
    },

    /* ==================== B. 资源查询 ==================== */

    /* ---------- 7 ---------- */
    /* ---------- 7 / 80 ---------- */
    {
      id: 'k8s-get',
      name: 'kubectl get',
      alias: ['kubectl get pods', 'kubectl get svc', 'kubectl get deploy'],
      level: 1,
      syntax: 'kubectl get <资源类型> [资源名] [选项]',
      summary: '查询资源列表或单个资源，K8s 里使用频率最高的一条命令。',
      desc: '没有指定资源名时列出全部（受命名空间限制）；指定的名字不存在会报 `NotFound`。想一次性看全套资源用 `kubectl get all`，但注意 `all` 并不包含 Ingress、PVC、ConfigMap、Secret 这些常用资源。',
      params: [
        { flag: '-n, --namespace=<ns>', desc: '指定命名空间；-A 或 --all-namespaces 表示所有命名空间' },
        { flag: '-o wide', desc: '输出更多列，如 Pod 所在节点、IP；-o yaml / -o json 输出完整对象' },
        { flag: '-o jsonpath=\'{.items[*].metadata.name}\'', desc: '只取想要的字段，写脚本时最常用' },
        { flag: '-l <标签选择器>', desc: '按标签过滤，如 -l app=nginx；也可用 --field-selector 按字段过滤' },
        { flag: '-w, --watch', desc: '持续监听资源变化，观察滚动更新或 Pod 重建过程' },
        { flag: '--show-labels', desc: '额外显示每条资源的标签，便于构造 -l 选择器' }
      ],
      examples: [
        { cmd: 'kubectl get pods -o wide', desc: '看 Pod 状态、重启次数、所在节点与 IP，排错起点' },
        { cmd: 'kubectl get pods -A --field-selector status.phase!=Running', desc: '一次性找出所有非 Running 的 Pod，快速发现异常' },
        { cmd: 'kubectl get deploy,svc,ingress,pvc -n my-app', desc: '一次查看一个应用的核心资源，比 get all 更实用' },
        { cmd: 'kubectl get pod my-pod -o yaml', desc: '导出完整 YAML，可以直接改完再 apply' }
      ],
      notes: [
        '`kubectl get all` 不包含 Ingress、PVC、ConfigMap、Secret、ServiceAccount，别以为它真的"全"了',
        'STATUS 显示 `CrashLoopBackOff` 表示容器反复退出；`ImagePullBackOff` 表示镜像拉不下来；`Pending` 通常是资源不足或调度失败',
        '`Running` 不代表业务正常，还要看 READY 列（如 `1/2` 说明有一个容器没就绪）',
        '按字段过滤只支持有限的字段（`status.phase`、`spec.nodeName`、`metadata.name` 等），不支持任意字段'
      ],
      related: ['k8s-describe', 'k8s-logs', 'k8s-get-events', 'k8s-jsonpath'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/',
      tags: ['查询', 'Pod', '排错']
    },

    /* ---------- 8 ---------- */
    /* ---------- 8 / 80 ---------- */
    {
      id: 'k8s-describe',
      name: 'kubectl describe',
      alias: ['kubectl describe pod'],
      level: 1,
      syntax: 'kubectl describe <资源类型> <资源名> [选项]',
      summary: '查看资源的详细状态与事件，排错三板斧的第一板。',
      desc: '`describe` 相比 `get -o yaml` 的价值在于**末尾的 Events 段**：调度失败、镜像拉取失败、探针失败、卷挂载失败的原因都在那里，而且带时间戳。',
      params: [
        { flag: '-n, --namespace=<ns>', desc: '指定命名空间' },
        { flag: '<资源类型>/<名字>', desc: '也可以写简写，如 kubectl describe po/my-pod' },
        { flag: '-l <标签选择器>', desc: '批量描述一批资源（输出会很长，建议搭配 grep）' }
      ],
      examples: [
        { cmd: 'kubectl describe pod my-pod -n my-app', desc: 'Pod 起不来时第一条要看的命令，重点看 Events 与 Conditions' },
        { cmd: 'kubectl describe pod my-pod | tail -30', desc: '直接看末尾的事件列表，避免翻几百行' },
        { cmd: 'kubectl describe node <节点名>', desc: '节点 NotReady 或 Pod 被驱逐时看节点状况与资源压力' },
        { cmd: 'kubectl describe pvc my-pvc', desc: 'PVC 一直 Pending 时看是存储类问题还是配额问题' }
      ],
      notes: [
        'Events 默认只保留 1 小时，问题发生较久后可能已经看不到，需及时排查或依赖事件采集组件',
        '`FailedScheduling` 常见原因：节点资源不足、有 taint 没有对应 toleration、nodeSelector/亲和性不满足',
        '`FailedMount` / `FailedAttachVolume` 在云上通常是云盘还没挂上或挂载点残留，重启 kubelet 或等云盘控制器重试'
      ],
      related: ['k8s-get', 'k8s-logs', 'k8s-get-events'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_describe/',
      tags: ['排错', '事件', '调度']
    },

    /* ---------- 9 ---------- */
    /* ---------- 9 / 80 ---------- */
    {
      id: 'k8s-get-events',
      name: 'kubectl get events',
      alias: ['kubectl events'],
      level: 2,
      syntax: 'kubectl get events [选项]',
      summary: '查看集群事件流，快速定位"最近到底发生了什么"。',
      desc: 'Event 是 K8s 的审计日志，几乎所有异常都会在这里留下记录。按时间排序 + 只看 Warning 是最有效的用法。',
      params: [
        { flag: '--sort-by=.lastTimestamp', desc: '按发生时间排序，默认顺序不可靠，这个参数几乎必加' },
        { flag: '--field-selector type=Warning', desc: '只看警告事件，过滤掉大量正常事件' },
        { flag: '-A, --all-namespaces', desc: '查看所有命名空间的事件' },
        { flag: '--watch', desc: '实时滚动显示新事件' }
      ],
      examples: [
        { cmd: 'kubectl get events -A --sort-by=.lastTimestamp | tail -30', desc: '看最近 30 条事件，集群里"刚才发生了什么"' },
        { cmd: 'kubectl get events --field-selector type=Warning -A', desc: '只看警告，快速筛出真正的问题' },
        { cmd: 'kubectl get events -n my-app --sort-by=.lastTimestamp --watch', desc: '发布过程中实时盯事件' }
      ],
      notes: [
        '不加 `--sort-by` 时事件顺序是乱的，容易误判因果关系',
        'Events 有保留时限（默认 1 小时），事后追查需要集群装了事件持久化组件',
        '`kubectl get events` 与 `kubectl events` 是两个不同实现，后者是较新版本才有的更友好版本'
      ],
      related: ['k8s-describe', 'k8s-logs'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_events/',
      tags: ['事件', '排错', '审计']
    },

    /* ---------- 10 ---------- */
    /* ---------- 10 / 80 ---------- */
    {
      id: 'k8s-logs',
      name: 'kubectl logs',
      alias: ['kubectl log'],
      level: 1,
      syntax: 'kubectl logs <Pod名> [-c 容器名] [选项]',
      summary: '查看 Pod 内某个容器的标准输出日志，排错三板斧的第二板。',
      desc: 'K8s 只收集容器的 stdout/stderr，所以应用必须把日志打到标准输出（而不是只写文件），否则 `kubectl logs` 什么都看不到。',
      params: [
        { flag: '-f, --follow', desc: '持续跟踪输出，类似 tail -f' },
        { flag: '--tail=<行数>', desc: '只看最后 N 行，Pod 日志很长时必加' },
        { flag: '--previous, -p', desc: '查看**上一次崩溃**容器的日志，CrashLoopBackOff 排错关键' },
        { flag: '-c <容器名>', desc: 'Pod 内有多个容器时指定；sidecar 场景必用' },
        { flag: '--since=10m', desc: '只看最近 10 分钟；也支持 --since-time 指定时间点' },
        { flag: '--timestamps', desc: '每行前加时间戳，用于和外部日志对齐' }
      ],
      examples: [
        { cmd: 'kubectl logs my-pod --tail=200', desc: '最常见的用法：看最后 200 行' },
        { cmd: 'kubectl logs my-pod --previous', desc: '**容器反复重启时的关键命令**，看它上一次是为什么挂的' },
        { cmd: 'kubectl logs -f deploy/my-deploy -n my-app', desc: '直接跟 Deployment 的日志，自动挑一个 Pod' },
        { cmd: 'kubectl logs my-pod -c istio-proxy --tail=100', desc: '看 sidecar 容器的日志' }
      ],
      notes: [
        '**Pod 重建后日志就没了**：`kubectl logs` 只能看当前容器与上一次容器，长期日志必须接到日志系统（如华为云 LTS）',
        '报 `a container name must be specified` 说明 Pod 里有多个容器，加 `-c`',
        '报 `previous terminated container not found` 表示没有上一次的记录，可能是首次启动失败',
        '业务日志写文件而不打 stdout 时，`kubectl logs` 是空的 —— 这是新手最常见的困惑'
      ],
      related: ['k8s-describe', 'k8s-exec', 'k8s-get'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/',
      tags: ['日志', '排错', '容器']
    },

    /* ---------- 11 ---------- */
    /* ---------- 11 / 80 ---------- */
    {
      id: 'k8s-top',
      name: 'kubectl top',
      level: 2,
      syntax: 'kubectl top <pod|node> [选项]',
      summary: '查看 Pod 或节点的实时 CPU / 内存用量。',
      desc: '数据来自 metrics-server，不是 cAdvisor 直连。所以如果报 `Metrics API not available`，先确认集群装了 metrics-server（华为云 CCE 一般默认已装）。',
      params: [
        { flag: 'pod / node', desc: '选择查看维度' },
        { flag: '-A, --all-namespaces', desc: '所有命名空间的 Pod 用量' },
        { flag: '--containers', desc: '把 Pod 内每个容器的用量分开显示' },
        { flag: '--sort-by=cpu|memory', desc: '按用量排序，找"谁在吃资源"' },
        { flag: '-l <标签选择器>', desc: '按标签筛选 Pod' }
      ],
      examples: [
        { cmd: 'kubectl top pod -A --sort-by=memory | head -20', desc: '找出全集群最吃内存的 20 个 Pod' },
        { cmd: 'kubectl top node', desc: '看节点整体负载，判断是否需要扩容' },
        { cmd: 'kubectl top pod --containers -n my-app', desc: '区分是主容器还是 sidecar 在吃资源' }
      ],
      notes: [
        '报错 `error: Metrics API not available` 说明 metrics-server 未就绪，不是命令写错了',
        '数值是**瞬时采样**（默认约 15 秒粒度），不能用它算流量或做计费依据',
        'Pod 用量接近 requests 时不会立刻出问题，超过 limits 会被 OOMKilled 或 CPU 被限流（throttling）'
      ],
      related: ['k8s-get', 'k8s-describe'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_top/',
      tags: ['资源', '监控', 'CPU', '内存']
    },

    /* ---------- 12 ---------- */
    /* ---------- 12 / 80 ---------- */
    {
      id: 'k8s-jsonpath',
      name: 'kubectl -o jsonpath',
      alias: ['kubectl get -o jsonpath', 'kubectl custom-columns'],
      level: 3,
      syntax: 'kubectl get <资源> -o jsonpath=\'{表达式}\'',
      summary: '精确提取资源里的指定字段，是自动化脚本的必备技能。',
      desc: '`-o yaml` 输出太啰嗦，`jsonpath` 能直接取出你要的那一个值。语法：`{.字段.子字段}`、`{range .items[*]}{.metadata.name}{"\\n"}{end}`。',
      params: [
        { flag: '-o jsonpath=\'{.items[*].metadata.name}\'', desc: '取所有资源的名字' },
        { flag: '-o jsonpath=\'{range .items[*]}{.metadata.name}{"\\t"}{.status.phase}{"\\n"}{end}\'', desc: '格式化输出多列，最实用' },
        { flag: '-o custom-columns=NAME:.metadata.name,IP:.status.podIP', desc: '比 jsonpath 更好写的列输出方式，推荐优先用' },
        { flag: '--template', desc: '用 Go template 输出，能力更强但更复杂' }
      ],
      examples: [
        { cmd: 'kubectl get pods -o jsonpath=\'{range .items[*]}{.metadata.name}{"\\t"}{.status.phase}{"\\n"}{end}\'', desc: '列出所有 Pod 名与状态，干净利落' },
        { cmd: 'kubectl get svc my-svc -o jsonpath=\'{.spec.clusterIP}\'', desc: '取出 Service 的 ClusterIP，写进配置或脚本' },
        { cmd: 'kubectl get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,IP:.status.podIP', desc: '自定义列，比 jsonpath 易读易写' },
        { cmd: 'kubectl get secret my-secret -o jsonpath=\'{.data.password}\' | base64 -d', desc: '取出 Secret 里的值（base64 解码后才是明文）' }
      ],
      notes: [
        '字段名**大小写敏感**，`.Status.podIP` 是错的，必须 `.status.podIP`',
        '取不到字段时 jsonpath 输出为空而不报错，脚本里要注意做空值判断',
        'Secret 的 data 是 base64 编码，别拿编码后的值当密码用',
        '列输出场景优先用 `-o custom-columns`，可读性比 jsonpath 好很多'
      ],
      related: ['k8s-get', 'k8s-exec'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/jsonpath/',
      tags: ['jsonpath', '脚本', '自动化']
    },

    /* ==================== C. 调试 ==================== */

    /* ---------- 13 ---------- */
    /* ---------- 13 / 80 ---------- */
    {
      id: 'k8s-exec',
      name: 'kubectl exec',
      alias: ['kubectl exec -it'],
      level: 1,
      syntax: 'kubectl exec -it <Pod名> [-c 容器名] -- <命令>',
      summary: '在运行中的容器里执行命令或开一个交互式 shell。',
      desc: '排错三板斧的第三板：前面看了状态、日志，还查不出来就进容器里亲眼看看。注意 `--` 后面的内容才会传进容器，不能省略。',
      params: [
        { flag: '-it', desc: '交互式终端（-i 保持 stdin，-t 分配 tty），执行 shell 必须加' },
        { flag: '-- <命令>', desc: '分隔符，后面才是容器内要执行的命令，**不能省略**' },
        { flag: '-c <容器名>', desc: '指定容器，多容器 Pod 必用' },
        { flag: '-n <命名空间>', desc: '指定命名空间' },
        { flag: '-- sh', desc: '没有 bash 时用 sh（Alpine 等精简镜像）' }
      ],
      examples: [
        { cmd: 'kubectl exec -it my-pod -- bash', desc: '进容器调试，最常用（Ubuntu/Debian 系镜像）' },
        { cmd: 'kubectl exec -it my-pod -- sh', desc: 'Alpine 等精简镜像没有 bash，用 sh' },
        { cmd: 'kubectl exec my-pod -- env', desc: '不进容器，直接看环境变量，确认 ConfigMap 有没有生效' },
        { cmd: 'kubectl exec my-pod -- cat /etc/resolv.conf', desc: '看容器内的 DNS 配置，排查"域名解析不了"' },
        { cmd: 'kubectl exec -it my-pod -c sidecar -- sh', desc: '进 sidecar 容器' }
      ],
      notes: [
        '报 `exec: "bash": executable file not found` 说明镜像里没有 bash，换 `sh` 试试',
        '报 `container not found` 或提示要指定容器，加 `-c`',
        '**distroless / scratch 镜像里连 sh 都没有**，此时用 `kubectl debug` 挂临时容器',
        '容器里的改动不会持久化，Pod 重建就没了；排错可以，别拿来改配置',
        '生产环境给 kubectl 配了 RBAC 时，`exec` 权限往往被单独限制，没权限是正常的'
      ],
      related: ['k8s-debug', 'k8s-logs', 'k8s-cp'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_exec/',
      tags: ['调试', 'shell', '排错']
    },

    /* ---------- 14 ---------- */
    /* ---------- 14 / 80 ---------- */
    {
      id: 'k8s-port-forward',
      name: 'kubectl port-forward',
      alias: ['kubectl portforward'],
      level: 2,
      syntax: 'kubectl port-forward <Pod名|svc/服务名|deploy/名称> <本地端口>:<容器端口>',
      summary: '把本地端口转发到 Pod 或 Service，不用暴露公网就能访问集群内服务。',
      desc: '开发与排障的神器：数据库、Redis、内部管理后台这些不该暴露到公网的服务，用它临时打通即可。转发只在命令运行期间有效，Ctrl+C 就断。',
      params: [
        { flag: '<本地端口>:<目标端口>', desc: '端口映射关系，本地端口随意，目标端口必须是容器实际监听端口' },
        { flag: 'svc/<服务名>', desc: '转发到 Service（自动挑一个后端 Pod），比直接指定 Pod 更稳' },
        { flag: '--address=0.0.0.0', desc: '默认只监听 127.0.0.1，想让同事访问才改成 0.0.0.0（**有安全风险**）' },
        { flag: '-n <命名空间>', desc: '指定命名空间' },
        { flag: '--pod-running-timeout=1m', desc: '等待 Pod 就绪的最长时间' }
      ],
      examples: [
        { cmd: 'kubectl port-forward svc/mysql 3306:3306 -n my-app', desc: '本地 3306 直连集群内的 MySQL，用客户端工具连 127.0.0.1:3306' },
        { cmd: 'kubectl port-forward deploy/web 8080:80', desc: '把 Deployment 的 80 端口映射到本地 8080，浏览器直接看效果' },
        { cmd: 'kubectl port-forward pod/my-pod 5005:5005', desc: '转发 Java 调试端口，本地 IDE 挂远程调试' }
      ],
      notes: [
        '**这不是生产方案**：会话断开即失效，也不支持负载均衡，生产要用 Service + Ingress/ELB',
        '报 `unable to listen on port` 说明本地端口被占用，换一个端口',
        '`--address=0.0.0.0` 会让同网段其他人也能连你的数据库，仅限可信内网临时使用',
        '每次只能转发一个 Pod；Pod 重建后需要重新执行'
      ],
      related: ['k8s-exec', 'k8s-get', 'k8s-debug'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/',
      tags: ['端口转发', '调试', '本地开发']
    },

    /* ---------- 15 ---------- */
    /* ---------- 15 / 80 ---------- */
    {
      id: 'k8s-cp',
      name: 'kubectl cp',
      level: 2,
      syntax: 'kubectl cp <源> <目标> [-c 容器名]',
      summary: '在本地与容器之间拷贝文件，用于取日志、塞配置、导数据。',
      desc: '路径写成 `<命名空间>/<Pod名>:<容器内路径>`。它是通过 tar 实现的，所以容器里必须有 tar 命令。',
      params: [
        { flag: '<ns>/<pod>:<路径>', desc: '指向容器内路径的写法，命名空间可省略（用当前上下文）' },
        { flag: '-c <容器名>', desc: '指定容器' },
        { flag: '-n <命名空间>', desc: '指定命名空间' }
      ],
      examples: [
        { cmd: 'kubectl cp my-app/my-pod:/var/log/app.log ./app.log', desc: '把容器日志拷到本地分析' },
        { cmd: 'kubectl cp ./config.yaml my-app/my-pod:/tmp/config.yaml', desc: '把本地文件塞进容器（临时排错用）' },
        { cmd: 'kubectl cp my-app/my-pod:/data ./backup -c app', desc: '整目录拷出（会递归 tar）' }
      ],
      notes: [
        '容器内**没有 tar 命令时会报错**，distroless 镜像就用不了，改用 `kubectl exec ... -- cat 文件 > 本地文件`',
        '拷大文件很慢且占内存，大文件应该走对象存储（如华为云 OBS）中转',
        '拷贝进容器的文件在 Pod 重建后丢失，不是持久化手段',
        '目标路径的父目录必须已存在'
      ],
      related: ['k8s-exec', 'k8s-logs'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_cp/',
      tags: ['文件', '拷贝', '排错']
    },

    /* ---------- 16 ---------- */
    /* ---------- 16 / 80 ---------- */
    {
      id: 'k8s-debug',
      name: 'kubectl debug',
      level: 3,
      syntax: 'kubectl debug <Pod名|节点> [选项] --image=<调试镜像>',
      summary: '给 Pod 挂一个带全套工具的临时调试容器，专治 distroless 没 shell。',
      desc: '两种典型用法：给 Pod 加临时容器（`--target`，共享进程命名空间，能看目标容器的进程），或给节点起一个特权容器（`node/<节点名>`，排查 kubelet、网络插件）。',
      params: [
        { flag: '--target=<容器名>', desc: '共享目标容器的进程命名空间，能直接看它的进程' },
        { flag: '--image=<镜像>', desc: '调试容器用的镜像，推荐带全套网络工具（如 nicolaka/netshoot）' },
        { flag: '--copy-to=<新Pod名>', desc: '复制出一个改过配置的 Pod，用于验证改动而不影响原 Pod' },
        { flag: 'node/<节点名>', desc: '在节点上起特权容器，排查节点级问题' },
        { flag: '-it -- sh', desc: '起完直接进 shell' }
      ],
      examples: [
        { cmd: 'kubectl debug -it my-pod --image=nicolaka/netshoot --target=app', desc: '给没有 shell 的容器挂一个 netshoot，共享进程空间排查' },
        { cmd: 'kubectl debug node/<节点名> -it --image=busybox', desc: '进节点排查 kubelet / 网络插件问题' },
        { cmd: 'kubectl debug my-pod --copy-to=my-pod-debug --set-image=app=myapp:v2', desc: '复制 Pod 并换镜像，验证新版本而不动线上' }
      ],
      notes: [
        '临时容器需要 K8s 1.25+ 且集群开启了 `EphemeralContainers` 特性',
        '调试容器不参与业务流量，但会占用节点资源',
        '`node/` 模式的容器会挂载宿主机根文件系统到 `/host`，改动宿主机文件有风险',
        '华为云 CCE 支持该特性，但要在控制台确认集群版本'
      ],
      related: ['k8s-exec', 'k8s-describe'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_debug/',
      tags: ['调试', '临时容器', 'distroless']
    },

    /* ---------- 17 ---------- */
    /* ---------- 17 / 80 ---------- */
    {
      id: 'k8s-node-shell',
      name: 'kubectl node-shell / 节点排障',
      kind: 'recipe',
      alias: ['kubectl debug node'],
      level: 3,
      syntax: 'kubectl debug node/<节点名> -it --image=<镜像>',
      summary: '在节点上开一个特权容器，从集群侧排查节点问题。',
      desc: '不需要 SSH 登录云主机就能查节点，适合只在集群侧有权限的场景。宿主机根目录挂载在 `/host`。',
      params: [
        { flag: 'node/<节点名>', desc: '目标节点' },
        { flag: '--image=busybox|nicolaka/netshoot', desc: '调试镜像，网络排查推荐 netshoot' },
        { flag: 'chroot /host', desc: '进入容器后切到宿主机根，就能直接看宿主机文件' }
      ],
      examples: [
        { cmd: 'kubectl debug node/10.0.1.23 -it --image=busybox', desc: '在节点上开调试容器' },
        { cmd: 'chroot /host && journalctl -u kubelet -n 100', desc: '进容器后查 kubelet 日志，排查节点 NotReady' }
      ],
      notes: [
        '需要有节点级权限，且容器是特权的（privileged），**能改宿主机文件，操作要谨慎**',
        '`/host` 是宿主机根文件系统，误删文件会影响节点上所有 Pod',
        '排查完记得清理调试 Pod（`kubectl delete pod`）'
      ],
      related: ['k8s-debug', 'k8s-cordon', 'k8s-describe'],
      docs: 'https://kubernetes.io/docs/tasks/debug/debug-cluster/',
      tags: ['节点', '排错', 'kubelet']
    },

    /* ==================== D. 变更与运维 ==================== */

    /* ---------- 18 ---------- */
    /* ---------- 18 / 80 ---------- */
    {
      id: 'k8s-apply',
      name: 'kubectl apply -f',
      alias: ['kubectl create -f', 'kubectl apply'],
      level: 1,
      syntax: 'kubectl apply -f <文件|目录|URL> [选项]',
      summary: '用声明式 YAML 创建或更新资源，日常部署的主命令。',
      desc: '`apply` 是"声明式"：把 YAML 里的期望状态同步到集群，资源不存在就创建、存在就更新。`create` 是"命令式"：资源已存在会直接报错。现代实践统一用 `apply`。',
      params: [
        { flag: '-f <路径>', desc: '可以是单个文件、目录（递归）、多个 -f，或 `-` 从标准输入读' },
        { flag: '--dry-run=client -o yaml', desc: '**不真正提交**，只渲染出将要生效的 YAML，改配置前必用' },
        { flag: '--dry-run=server', desc: '在服务端校验（含准入控制与默认值填充），比 client 更准' },
        { flag: '-n <命名空间>', desc: '指定命名空间；若 YAML 里已写 namespace 则必须与之一致' },
        { flag: '--prune -l <标签>', desc: '删除不在本次 YAML 中但带该标签的资源（**危险，慎用**）' },
        { flag: '-k <目录>', desc: '使用 Kustomize 渲染后再应用' }
      ],
      examples: [
        { cmd: 'kubectl apply -f deploy.yaml', desc: '最常用：部署或更新' },
        { cmd: 'kubectl apply -f ./manifests/ -n my-app', desc: '应用整个目录下的所有 YAML' },
        { cmd: 'kubectl apply -f deploy.yaml --dry-run=client -o yaml', desc: '先看会变成什么样，确认无误再真apply' },
        { cmd: 'kubectl apply -f https://example.com/install.yaml', desc: '直接应用远程 YAML（装 Operator 常用）' }
      ],
      notes: [
        '**YAML 里的 namespace 与 `-n` 冲突时会报错**，二选一，不要都写',
        '`create` 对已存在的资源会报 `AlreadyExists`，`apply` 不会 —— 脚本里一律用 apply',
        '`--dry-run=client` 不校验字段是否合法，`--dry-run=server` 才会；重要变更建议用 server 模式',
        '**`--prune` 会删除资源**，标签写错可能删掉不该删的东西，生产慎用',
        'YAML 缩进必须用空格（不能用 Tab），缩进错了报错信息往往很迷惑'
      ],
      related: ['k8s-get', 'k8s-edit', 'k8s-delete', 'k8s-rollout'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_apply/',
      tags: ['部署', 'YAML', '声明式']
    },

    /* ---------- 19 ---------- */
    /* ---------- 19 / 80 ---------- */
    {
      id: 'k8s-rollout',
      name: 'kubectl rollout',
      level: 2,
      syntax: 'kubectl rollout <status|history|undo|restart|pause|resume> <资源类型>/<名字>',
      summary: '管理 Deployment 的发布过程：看进度、查历史、一键回滚。',
      desc: '上线出问题时最值钱的命令。K8s 默认保留 10 个历史版本（`revisionHistoryLimit`），所以 `undo` 通常都能救回来。',
      params: [
        { flag: 'status <资源>', desc: '查看发布进度，卡住时会告诉你卡在哪一步' },
        { flag: 'history <资源>', desc: '列出所有历史版本号（REVISION）' },
        { flag: 'undo <资源> --to-revision=<N>', desc: '回滚到指定版本；不带 `--to-revision` 就是回滚到上一个版本' },
        { flag: 'restart <资源>', desc: '滚动重启（重建所有 Pod），改过 ConfigMap 后常用' },
        { flag: 'pause / resume', desc: '暂停/恢复发布，灰度时用于批量放量' }
      ],
      examples: [
        { cmd: 'kubectl rollout status deploy/web -n my-app', desc: '发布后确认是否真的滚完了，别急着走' },
        { cmd: 'kubectl rollout history deploy/web', desc: '看出过哪些版本' },
        { cmd: 'kubectl rollout undo deploy/web --to-revision=3', desc: '**回滚到 3 号版本**，线上出事的救命命令' },
        { cmd: 'kubectl rollout restart deploy/web', desc: '不换镜像，只重建 Pod（改了 ConfigMap/Secret 后生效）' }
      ],
      notes: [
        '**`undo` 不会自动回滚数据库变更**，有 schema 变更时要人工处理',
        '历史版本数量由 `revisionHistoryLimit` 决定（默认 10），太久之前的回不去了',
        '`rollout status` 卡住常见原因：新 Pod 起不来（镜像/探针/资源不足），要去看 `describe` 与 `logs`',
        '改 ConfigMap 后 Pod 不会自动重启，必须 `rollout restart`（除非用了 reloader 类工具）',
        '`restart` 会造成滚动重启，注意副本数与 PDB 设置，避免服务中断'
      ],
      related: ['k8s-apply', 'k8s-scale', 'k8s-set-image'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/',
      tags: ['发布', '回滚', 'Deployment']
    },

    /* ---------- 20 ---------- */
    /* ---------- 20 / 80 ---------- */
    {
      id: 'k8s-scale',
      name: 'kubectl scale',
      level: 2,
      syntax: 'kubectl scale <资源类型>/<名字> --replicas=<数量>',
      summary: '手动调整 Deployment 副本数，用来扩容或临时缩容。',
      desc: '快速扩容应急很有效。但如果是 HPA 托管的 Deployment，手动改副本数可能被 HPA 覆盖回去。',
      params: [
        { flag: '--replicas=<N>', desc: '目标副本数；0 表示缩到零（服务不可用，慎用）' },
        { flag: '-n <命名空间>', desc: '指定命名空间' },
        { flag: '--current-replicas=<N>', desc: '只有当前副本数等于该值时才执行，防止并发覆盖' },
        { flag: '--timeout=60s', desc: '等待缩放完成的超时时间' }
      ],
      examples: [
        { cmd: 'kubectl scale deploy/web --replicas=5 -n my-app', desc: '应急扩容到 5 副本' },
        { cmd: 'kubectl scale statefulset/mysql --replicas=0', desc: '临时缩容到 0（有状态服务要确认数据安全！）' }
      ],
      notes: [
        '**缩容会终止 Pod**，有状态服务（StatefulSet）要确认数据已落盘、主从关系安全',
        '被 HPA 管理的 Deployment 手动改副本数后，HPA 下次评估会按指标改回来',
        '缩到 0 会让服务完全不可用，只在确认无人依赖时使用'
      ],
      related: ['k8s-rollout', 'k8s-get'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_scale/',
      tags: ['扩缩容', '副本', '应急']
    },

    /* ---------- 21 ---------- */
    /* ---------- 21 / 80 ---------- */
    {
      id: 'k8s-delete',
      name: 'kubectl delete',
      level: 1,
      syntax: 'kubectl delete <资源类型> <名字> [选项]',
      summary: '删除任意 Kubernetes 资源，最需要小心的一条命令。',
      desc: '默认优雅删除（等 Pod 终止）。加了 `--force --grace-period=0` 会立即从 etcd 移除，可能留下孤儿容器或云上残留的负载均衡/云盘资源。',
      params: [
        { flag: '-f <文件>', desc: '按 YAML 删除其中定义的所有资源（部署回滚常用）' },
        { flag: '-l <标签选择器>', desc: '按标签批量删除，**范围一定要先 get 确认**' },
        { flag: '--grace-period=0 --force', desc: '强制删除，用于卡在 Terminating 的资源（**有副作用**）' },
        { flag: '--cascade=orphan', desc: '只删父资源，保留子资源（如删 Deployment 但留 Pod）' },
        { flag: '--dry-run=client', desc: '只显示会删掉什么，不真删' },
        { flag: '--all', desc: '删除该类型下的所有资源，**极度危险**' }
      ],
      examples: [
        { cmd: 'kubectl delete pod my-pod --dry-run=client', desc: '先确认要删的是哪个，再真删' },
        { cmd: 'kubectl delete -f deploy.yaml', desc: '按 YAML 清理整套资源，最可控的方式' },
        { cmd: 'kubectl delete pod my-pod --grace-period=0 --force', desc: 'Pod 卡在 Terminating 时的处理方式' }
      ],
      notes: [
        '**`kubectl delete` 没有回收站**，PV/PVC 删掉后云盘数据可能一并释放',
        '**删 Service 类型为 LoadBalancer 时会连带删除云上的负载均衡器**，公网 IP 会变，要提前评估',
        '`--all` 与 `-l` 组合务必先 `get` 同条件看一眼会命中哪些资源',
        'Pod 被 Deployment 管理时删掉会自动重建，想真停机要删 Deployment 或缩到 0',
        '`--force` 删除的 Pod 可能仍在节点上跑着（容器没被清理），必要时要上节点手动清理'
      ],
      related: ['k8s-get', 'k8s-apply'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_delete/',
      tags: ['删除', '危险', '清理']
    },

    /* ---------- 22 ---------- */
    /* ---------- 22 / 80 ---------- */
    {
      id: 'k8s-edit',
      name: 'kubectl edit / patch',
      alias: ['kubectl patch'],
      level: 3,
      syntax: 'kubectl edit <资源类型>/<名字>   |   kubectl patch <资源类型>/<名字> -p \'<JSON>\'',
      summary: '直接在线修改运行中的资源定义，应急改配置用。',
      desc: '`edit` 打开编辑器交互改，`patch` 用命令行传 JSON/YAML 片段改（适合脚本）。两者都是**热修改**，不会写回你的 Git 仓库，事后务必同步到 YAML 文件，否则下次 `apply` 会把改动覆盖掉。',
      params: [
        { flag: '-p \'{"spec":{"replicas":3}}\'', desc: 'patch 的补丁内容（默认 strategic merge）' },
        { flag: '--type=json', desc: '改用 JSON Patch（RFC 6902），适合改数组元素' },
        { flag: '--type=merge', desc: '改用 JSON Merge Patch，语义更直观' },
        { flag: '--dry-run=server', desc: '先在服务端校验补丁是否合法' },
        { flag: 'KUBE_EDITOR=nano', desc: '指定 edit 使用的编辑器（默认 vi）' }
      ],
      examples: [
        { cmd: 'kubectl edit deploy/web -n my-app', desc: '应急改镜像或副本数，保存即生效' },
        { cmd: 'kubectl patch deploy/web -p \'{"spec":{"template":{"spec":{"containers":[{"name":"web","image":"nginx:1.25"}]}}}}\'', desc: '脚本里改镜像版本' },
        { cmd: 'kubectl patch svc/web --type=json -p \'[{"op":"replace","path":"/spec/ports/0/nodePort","value":30080}]\'', desc: '改数组里的某个字段必须用 json 类型' }
      ],
      notes: [
        '**热修改不会进 Git**，务必回头更新 YAML 并重新 apply，否则下个发布就丢了',
        '`edit` 时改错字段保存会直接报错拒绝，比 apply 安全一些，但依然是直接作用于线上',
        '改数组元素（如 containers 数组里的某一项）用默认 patch 类型容易出错，改用 `--type=json`',
        '生产集群建议开启审计，记录谁在什么时候 edit 过什么'
      ],
      related: ['k8s-apply', 'k8s-rollout'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_patch/',
      tags: ['修改', '热更新', '应急']
    },

    /* ---------- 23 ---------- */
    /* ---------- 23 / 80 ---------- */
    {
      id: 'k8s-cordon',
      name: 'kubectl cordon / uncordon',
      level: 2,
      syntax: 'kubectl cordon <节点名>    |    kubectl uncordon <节点名>',
      summary: '把节点标记为不可调度 / 恢复调度，节点维护的标准前置动作。',
      desc: '`cordon` 只阻止新 Pod 调度上来，**已有的 Pod 不受影响**；`drain` 才会把已有 Pod 赶走。两者是配套的：先 cordon 再 drain。',
      params: [
        { flag: 'uncordon <节点>', desc: '恢复调度，维护完记得执行，否则节点永远空着' },
        { flag: 'get nodes', desc: 'cordon 后节点 STATUS 会显示 SchedulingDisabled' }
      ],
      examples: [
        { cmd: 'kubectl cordon 10.0.1.23', desc: '先把节点封住，不再接新 Pod' },
        { cmd: 'kubectl uncordon 10.0.1.23', desc: '维护完成后恢复调度（**很容易忘记**）' }
      ],
      notes: [
        '**只 cordon 不 drain，节点上的老 Pod 会一直在跑**，节点还是要重启的话服务会中断',
        '维护完一定要 `uncordon`，否则节点会长期空转浪费资源',
        '云上节点如果是被伸缩组管理的，cordon 可能被自动修复逻辑覆盖'
      ],
      related: ['k8s-drain', 'k8s-get-nodes'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_cordon/',
      tags: ['节点', '维护', '调度']
    },

    /* ---------- 24 ---------- */
    /* ---------- 24 / 80 ---------- */
    {
      id: 'k8s-drain',
      name: 'kubectl drain',
      level: 2,
      syntax: 'kubectl drain <节点名> [选项]',
      summary: '驱逐节点上的所有 Pod，让节点可以安全重启或下线。',
      desc: '真正让 Pod 离开节点的命令，节点维护（换盘、升级内核、下线缩容）必用。对有本地存储的 Pod 要特别小心。',
      params: [
        { flag: '--ignore-daemonsets', desc: 'DaemonSet 的 Pod 无法驱逐（每个节点都要有），必须加这个参数' },
        { flag: '--delete-emptydir-data', desc: '允许删除使用 emptyDir 的 Pod（**数据会丢**）' },
        { flag: '--force', desc: '允许驱逐不受控制器管理的裸 Pod' },
        { flag: '--grace-period=<秒>', desc: '优雅终止等待时间' },
        { flag: '--timeout=120s', desc: '驱逐超时' },
        { flag: '--dry-run=client', desc: '先看会驱逐哪些 Pod' }
      ],
      examples: [
        { cmd: 'kubectl drain 10.0.1.23 --ignore-daemonsets --delete-emptydir-data', desc: '节点维护前的标准命令' },
        { cmd: 'kubectl drain 10.0.1.23 --ignore-daemonsets --dry-run=client', desc: '先预演，确认不会影响关键服务' }
      ],
      notes: [
        '**先用 `cordon` 或直接 `drain` 前，确认副本数与 PDB 足够**，否则可能把唯一副本赶走导致服务中断',
        '**emptyDir 的数据会丢失**，`--delete-emptydir-data` 是有代价的',
        'StatefulSet 有状态服务的 Pod 可能驱逐失败（PDB 限制），需要先确认副本健康',
        '`drain` 会自动 cordon 节点，维护完要 `uncordon`',
        '本地盘（local PV）的数据留在原节点上，Pod 迁到别的节点后读不到'
      ],
      related: ['k8s-cordon', 'k8s-get-nodes', 'k8s-get'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_drain/',
      tags: ['节点', '驱逐', '维护']
    },

    /* ---------- 25 ---------- */
    /* ---------- 25 / 80 ---------- */
    {
      id: 'k8s-troubleshoot-pod',
      name: 'Pod 起不来排查三板斧',
      kind: 'recipe',
      alias: ['kubectl pod 排错', 'pod 排错流程'],
      level: 2,
      syntax: 'kubectl get pod → kubectl describe pod → kubectl logs [--previous]',
      summary: '固定顺序的三步排查法，能覆盖 Pod 异常 80% 以上的情况。',
      desc: '不要一上来就瞎试。按"状态 → 事件 → 日志"的顺序走，每一步都会把范围缩小。这张表把常见状态和对应原因列清楚，照着对即可。',
      params: [
        { flag: '第 1 步 get', desc: '看 STATUS 与 READY 列，判断是 Pending、ImagePullBackOff 还是 CrashLoopBackOff' },
        { flag: '第 2 步 describe', desc: '看末尾 Events，调度失败、拉镜像失败、挂载失败都在这里' },
        { flag: '第 3 步 logs', desc: '容器起来了但服务不正常时看日志；反复重启要加 --previous' },
        { flag: '补充 exec', desc: '还能进容器就用 `kubectl exec` 亲自验证网络、DNS、配置' }
      ],
      examples: [
        { cmd: 'kubectl get pods -n my-app -o wide', desc: '第一步：定位异常 Pod 与状态' },
        { cmd: 'kubectl describe pod my-pod -n my-app | tail -25', desc: '第二步：看事件，找直接原因' },
        { cmd: 'kubectl logs my-pod -n my-app --previous --tail=100', desc: '第三步：看崩溃前最后 100 行日志' },
        { cmd: 'kubectl get events -n my-app --sort-by=.lastTimestamp | tail -15', desc: '补充：看命名空间整体事件流，判断是否为共性问题' }
      ],
      notes: [
        '**Pending**：节点资源不足、没有匹配的节点（nodeSelector/亲和性）、PVC 没绑定、有 taint 没有 toleration',
        '**ImagePullBackOff**：镜像名/标签写错、镜像仓库需要密钥（imagePullSecrets）、网络不通拉不到 —— 华为云场景还要查 SWR 的权限与组织名',
        '**CrashLoopBackOff**：容器内进程启动即退出，用 `--previous` 看日志；也可 `kubectl get pod -o jsonpath=\'{.status.containerStatuses[*].lastState.terminated.exitCode}\'` 看退出码（137 = 被 OOMKilled 或 SIGKILL，143 = SIGTERM）',
        '**Running 但 READY 0/1**：通常是 readiness 探针失败，检查探针路径、端口、启动时间（`initialDelaySeconds` 太小很常见）',
        '**OOMKilled**：容器内存超 limits 被杀，调大 limits 或排查内存泄漏',
        '**Terminating 卡住**：节点失联或有 finalizer，必要时强制删除并检查云上残留资源'
      ],
      related: ['k8s-describe', 'k8s-logs', 'k8s-get-events', 'k8s-exec'],
      docs: 'https://kubernetes.io/docs/tasks/debug/debug-application/',
      tags: ['排错', 'Pod', '流程', '面试']
    },

    /* ---------- 26 ---------- */
    /* ---------- 26 / 80 ---------- */
    {
      id: 'k8s-troubleshoot-svc',
      name: 'Service 访问不通排查',
      kind: 'recipe',
      alias: ['kubectl service 排错', 'service 不通'],
      level: 3,
      syntax: 'kubectl get ep → kubectl get svc → kubectl describe svc',
      summary: 'Service 访问不了的分层排查法：先看 endpoints，再查端口与选择器。',
      desc: 'Service 只是个 iptables/IPVS 规则，它把流量转给 endpoints。所以 90% 的"Service 不通"其实是 endpoints 为空（选择器没匹配到 Pod），或者端口映射写错了。',
      params: [
        { flag: 'get endpoints', desc: '**第一件事**：endpoints 为空说明选择器没匹配到 Ready 的 Pod' },
        { flag: 'get svc -o yaml', desc: '确认 selector、ports（port / targetPort / nodePort）三者' },
        { flag: 'describe svc', desc: '看 Events 与 Endpoints 列表' },
        { flag: 'get pod --show-labels', desc: '对比 Pod 实际标签与 Service 的 selector 是否一致' }
      ],
      examples: [
        { cmd: 'kubectl get endpoints web -n my-app', desc: 'endpoints 有 IP 才说明后端找到了；空的就是选择器或就绪探针问题' },
        { cmd: 'kubectl get svc web -o yaml | grep -A6 ports', desc: '核对 port / targetPort 是否与容器实际监听端口一致' },
        { cmd: 'kubectl get pods -l app=web --show-labels -n my-app', desc: '确认选择器能选中哪些 Pod' },
        { cmd: 'kubectl run tmp --rm -it --image=busybox -- sh -c "wget -O- -T3 http://web.my-app:80"', desc: '在集群内起临时 Pod 验证服务连通性' }
      ],
      notes: [
        '**`targetPort` 必须是容器实际监听的端口**，不是 Service 的 port；写成 80 但应用监听 8080 是不通的经典原因',
        '**Pod 没通过 readiness 探针就不会进 endpoints**，此时 Service 表现为完全不通',
        'Pod 的 `selector` 与 Deployment 的 `selector` 都要与 Pod 标签一致，两处不一致都会出问题',
        'ClusterIP 只能在集群内访问，集群外访问需要 NodePort 或 LoadBalancer（云上用 ELB）',
        '华为云 CCE 上用 LoadBalancer 类型会创建 ELB，需确认 ELB 与节点在同一 VPC、监听器端口正确',
        'DNS 解析失败时先确认 CoreDNS 是否正常：`kubectl get pods -n kube-system -l k8s-app=kube-dns`'
      ],
      related: ['k8s-get', 'k8s-describe', 'k8s-troubleshoot-pod', 'k8s-port-forward'],
      docs: 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/',
      tags: ['Service', '排错', '网络', '面试']
    },

    /* ---------- 27 ---------- */
    /* ---------- 27 / 80 ---------- */
    {
      id: 'k8s-set-image',
      name: 'kubectl set image',
      level: 2,
      syntax: 'kubectl set image <资源类型>/<名字> <容器名>=<新镜像>',
      summary: '在线更换容器镜像并触发滚动更新，发布流水线里的常用一步。',
      desc: '等价于改 YAML 里的 image 再 apply，但一条命令就够，适合 CI/CD 脚本和应急回退到指定版本。',
      params: [
        { flag: '<容器名>=<镜像>', desc: '容器名必须与 YAML 里 `containers[].name` 完全一致，写错会报 not found' },
        { flag: '--record', desc: '把本次命令记进 revision history（已废弃，但老集群还能用）' },
        { flag: '--all', desc: '更新该资源下所有容器（多容器场景慎用）' },
        { flag: '-n <命名空间>', desc: '指定命名空间' }
      ],
      examples: [
        { cmd: 'kubectl set image deploy/web web=nginx:1.25 -n my-app', desc: '把 web 容器换成 nginx:1.25，触发滚动更新' },
        { cmd: 'kubectl set image deploy/web web=swr.cn-north-4.myhuaweicloud.com/myorg/web:v1.2.3', desc: '推送到华为云 SWR 后，用完整 SWR 地址更新镜像' },
        { cmd: 'kubectl rollout status deploy/web -n my-app', desc: '改完立刻盯发布进度（**必须配合这一步**）' }
      ],
      notes: [
        '容器名写错时会提示 `unable to find container`，先用 `kubectl get deploy/web -o jsonpath=\'{.spec.template.spec.containers[*].name}\'` 确认',
        '改完一定要跟 `kubectl rollout status`，否则不知道是否真的滚成功',
        'SWR 镜像地址格式是 `swr.<region>.myhuaweicloud.com/<组织>/<镜像>:<标签>`，少一段都拉不到',
        '和 `edit`/`patch` 一样属于热修改，记得回头同步 Git 里的 YAML'
      ],
      related: ['k8s-rollout', 'k8s-apply', 'k8s-edit'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_set/kubectl_set_image/',
      tags: ['发布', '镜像', '滚动更新']
    },

    /* ---------- 28 ---------- */
    /* ---------- 28 / 80 ---------- */
    {
      id: 'k8s-auth-can-i',
      name: 'kubectl auth can-i',
      level: 3,
      syntax: 'kubectl auth can-i <动作> <资源> [--as=<用户>] [-n <命名空间>]',
      summary: '检查当前身份有没有某个权限，排查 RBAC 导致的操作被拒。',
      desc: '报 `Forbidden` 时先别怀疑命令写错了，用这条确认是不是权限问题。还可以用 `--as` 模拟别人的身份，帮同事排查权限。',
      params: [
        { flag: '<动作> <资源>', desc: '如 `create pods`、`delete deployments`、`get secrets`' },
        { flag: '--as=<用户>', desc: '以指定用户身份检查（需要你有 impersonate 权限）' },
        { flag: '--as-group=<组>', desc: '模拟用户所属的组' },
        { flag: '--list', desc: '列出当前身份在该命名空间下的全部权限，一次看全' },
        { flag: '-n <命名空间>', desc: '在指定命名空间下检查' }
      ],
      examples: [
        { cmd: 'kubectl auth can-i create pods -n my-app', desc: '确认自己能不能在这个命名空间建 Pod' },
        { cmd: 'kubectl auth can-i --list -n my-app', desc: '列出自己在该命名空间的所有权限，排查 Forbidden 最有效' },
        { cmd: 'kubectl auth can-i get secrets --as=system:serviceaccount:my-app:my-sa', desc: '检查某个 ServiceAccount 的权限' }
      ],
      notes: [
        '回答只有 yes/no，`no` 就说明是 RBAC 问题，去找管理员加 Role/RoleBinding',
        'CCE 上常见情况：子用户只有控制台权限，没有集群内 RBAC 权限，需要管理员在集群里授权',
        '`--as` 需要调用者自身有 `impersonate` 权限，普通用户会直接报 Forbidden',
        'ServiceAccount 身份的写法是 `system:serviceaccount:<命名空间>:<sa名>`，别写错'
      ],
      related: ['k8s-config', 'k8s-get'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_can-i/',
      tags: ['RBAC', '权限', 'Forbidden']
    },

    /* ---------- 29 ---------- */
    /* ---------- 29 / 80 ---------- */
    {
      id: 'k8s-cce-kubeconfig',
      name: '连接华为云 CCE 集群',
      kind: 'recipe',
      alias: ['CCE kubeconfig', '华为云 cce kubectl 配置'],
      level: 2,
      syntax: 'kubectl config 使用从 CCE 控制台下载的 kubeconfig',
      summary: '把本地 kubectl 连到华为云 CCE 集群的标准步骤。',
      desc: 'CCE 完全兼容原生 K8s，所以**下面所有 kubectl 命令都适用**，唯一的差别只是 kubeconfig 从控制台下载而不是手工生成。',
      params: [
        { flag: '控制台下载', desc: 'CCE 控制台 → 集群详情 → 连接信息 → 下载 kubeconfig 文件' },
        { flag: 'KUBECONFIG 环境变量', desc: 'export KUBECONFIG=/path/to/cce-config，不改动默认的 ~/.kube/config' },
        { flag: '合并到默认配置', desc: '把下载内容追加到 ~/.kube/config 后，用 kubectl config use-context 切换' },
        { flag: 'kubectl get ns', desc: '验证连通性，能列出命名空间即配置成功' }
      ],
      examples: [
        { cmd: 'export KUBECONFIG=~/cce-cn-north-4-config', desc: 'Linux/macOS 指定专用 kubeconfig，不污染默认配置' },
        { cmd: '$env:KUBECONFIG = "C:\\Users\\me\\cce-config"', desc: 'Windows PowerShell 的写法' },
        { cmd: 'kubectl config get-contexts', desc: '确认 CCE 集群的 context 已出现' },
        { cmd: 'kubectl get nodes -o wide', desc: '验证能连上集群并看到 CCE 节点' }
      ],
      notes: [
        '**kubeconfig 等同于集群管理员凭证**，不要提交到 Git、不要随手发群里',
        '报 `Unauthorized` 通常是 kubeconfig 里证书过期，去控制台重新下载即可',
        '报 `connection refused` / 超时：确认本机网络能访问 CCE 的 API Server 地址（公网访问需要集群开启公网 API Server 或走跳板机）',
        'CCE 集群若开启了「集群内 RBAC」，IAM 子用户还需要在集群里做角色绑定，光有控制台权限不够',
        '`kubectl` 版本建议与集群版本差不超过一个次版本'
      ],
      related: ['k8s-config', 'k8s-cluster-info', 'k8s-auth-can-i'],
      docs: 'https://support.huaweicloud.com/usermanual-cce/cce_10_0107.html',
      tags: ['华为云', 'CCE', 'kubeconfig', '连接']
    },

    /* ==================== E. 资源对象速查 ==================== */

    /* ---------- 30 ---------- */
    /* ---------- 30 / 80 ---------- */
    {
      id: 'k8s-deployment',
      name: 'Deployment 资源',
      kind: 'recipe',
      alias: ['deployment yaml', 'k8s deployment 怎么写'],
      level: 1,
      syntax: 'apiVersion: apps/v1   kind: Deployment',
      summary: '无状态应用的标准控制器，负责副本数维持与滚动更新。',
      desc: 'Deployment 管 ReplicaSet、ReplicaSet 管 Pod 的三层结构，让它能保证"任何时刻都有 N 个副本在跑"。改镜像或副本数会创建新的 ReplicaSet，并按策略滚动替换旧 Pod，出问题可以用 `rollout undo` 回到上一版。',
      params: [
        { flag: 'replicas', desc: '期望副本数，不写默认 1' },
        { flag: 'selector.matchLabels', desc: '**必须与 `template.metadata.labels` 匹配**，否则创建直接被拒' },
        { flag: 'strategy.type', desc: '`RollingUpdate`（默认，可配 maxSurge/maxUnavailable）或 `Recreate`（先全停再起，有中断）' },
        { flag: 'template.spec.containers', desc: '容器定义：镜像、端口、env、resources、探针' },
        { flag: 'revisionHistoryLimit', desc: '保留的历史 ReplicaSet 数，默认 10，决定 `rollout undo` 能回多远' }
      ],
      examples: [
        { cmd: 'kubectl get deploy -n my-app -o wide', desc: '看 READY 列（如 `2/2`）与 UP-TO-DATE，确认副本是不是真的都起来了' },
        { cmd: 'kubectl describe deploy web -n my-app', desc: '看滚动更新事件与新旧 ReplicaSet 的副本变化过程' },
        { cmd: 'kubectl create deploy web --image=nginx:1.25 --replicas=2 --dry-run=client -o yaml', desc: '让 kubectl 生成一份 YAML 骨架，再手工补全，比从零手写不容易出错' },
        { cmd: 'kubectl rollout status deploy/web -n my-app', desc: '发布后确认是否真的滚完（**这一步不能省**）' }
      ],
      notes: [
        '`selector` 是**不可变字段**，创建后改不了；写错只能删掉重建',
        '`spec.selector` 与 `template.metadata.labels` 不一致是新手最常见的报错：`selector does not match template labels`',
        'Pod 是 ReplicaSet 托管的，**单独删 Pod 会被自动重建**，想彻底停服要删 Deployment 或缩到 0 副本',
        '镜像用 `:latest` 时滚动更新可能不触发（新旧镜像名相同，K8s 认为没变化），生产务必用固定标签'
      ],
      related: ['k8s-apply', 'k8s-rollout', 'k8s-scale', 'k8s-set-image'],
      docs: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/',
      tags: ['工作负载', 'Deployment', '滚动更新']
    },

    /* ---------- 31 ---------- */
    /* ---------- 31 / 80 ---------- */
    {
      id: 'k8s-statefulset',
      name: 'StatefulSet 资源',
      kind: 'recipe',
      alias: ['statefulset yaml', '有状态应用部署'],
      level: 2,
      syntax: 'apiVersion: apps/v1   kind: StatefulSet',
      summary: '给有状态应用用的控制器，Pod 名字、网络标识与存储都稳定不变。',
      desc: '与 Deployment 最大的区别是"身份固定"：Pod 名字是 `<名字>-0`、`<名字>-1`（如仿真环境里的 `mysql-0`），按顺序创建、逆序删除，每个副本绑定自己的 PVC。所以 MySQL 主从、Kafka、ZooKeeper 这类需要身份的应用用它。',
      params: [
        { flag: 'serviceName', desc: '必须指向一个 headless Service（`clusterIP: None`），Pod 才有稳定的 DNS 名' },
        { flag: 'volumeClaimTemplates', desc: '每个副本据此自动生成一个 PVC（如 `app-data-mysql-0`）' },
        { flag: 'podManagementPolicy', desc: '`OrderedReady`（默认，逐个起）或 `Parallel`（一起起）' },
        { flag: 'replicas', desc: '副本数；缩容时从编号最大的开始删' }
      ],
      examples: [
        { cmd: 'kubectl get sts -n my-app', desc: '看 `mysql-0` 这类固定名字的 Pod 是否 READY' },
        { cmd: 'kubectl get pvc -n my-app', desc: 'StatefulSet 的卷由模板生成，名字形如 `app-data-mysql-0`' },
        { cmd: 'kubectl get sts mysql -n my-app -o yaml | grep -A10 volumeClaimTemplates', desc: '看每个副本申请多大卷、用哪个 StorageClass' },
        { cmd: 'kubectl rollout status sts/mysql -n my-app', desc: '按顺序等待每个副本就绪，有状态服务的发布要慢得多' }
      ],
      notes: [
        '**删 StatefulSet 不会删 PVC**，数据仍在（这是有意的保护），反过来说清理时要手工删 PVC',
        '缩容再扩容时，PVC 若还在会被重新挂回，数据不会丢；但要注意主从角色是否需要人工调整',
        '`serviceName` 指向的必须是 headless Service，写成普通 Service 就拿不到稳定的 Pod DNS',
        '有状态服务的扩缩容前先确认复制状态，`kubectl scale` 会从编号最大的 Pod 开始删'
      ],
      related: ['k8s-pvc-pv', 'k8s-service', 'k8s-scale', 'k8s-deployment'],
      docs: 'https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/',
      tags: ['工作负载', 'StatefulSet', '有状态', '存储']
    },

    /* ---------- 32 ---------- */
    /* ---------- 32 / 80 ---------- */
    {
      id: 'k8s-daemonset',
      name: 'DaemonSet 资源',
      kind: 'recipe',
      alias: ['daemonset yaml', '每个节点跑一个 Pod'],
      level: 2,
      syntax: 'apiVersion: apps/v1   kind: DaemonSet',
      summary: '在每个符合条件的节点上各跑一个 Pod，日志、监控与网络插件都靠它。',
      desc: 'DaemonSet 不关心副本数，只保证"每个满足条件的节点上都有一份"，所以 Pod 数量随节点扩缩自动增减。集群里的网络插件（calico）、日志采集（fluent-bit）、监控 agent 基本都是 DaemonSet。',
      params: [
        { flag: 'selector', desc: '选择器，需与 template 的标签匹配' },
        { flag: 'template.spec.nodeSelector / affinity', desc: '限定只跑在某些节点上（如只跑 GPU 节点）' },
        { flag: 'template.spec.tolerations', desc: '**必须容忍节点的 taint**，否则控制面节点上起不来' },
        { flag: 'updateStrategy', desc: '`RollingUpdate`（默认，逐个节点更新）或 `OnDelete`' }
      ],
      examples: [
        { cmd: 'kubectl get ds -n kube-system', desc: '看采集类组件在每个节点上是否都有实例（DESIRED 应等于节点数）' },
        { cmd: 'kubectl get pods -n kube-system -l k8s-app=calico-node -o wide', desc: '确认网络插件在每个节点都 Running，节点 NotReady 时必查' },
        { cmd: 'kubectl get ds -n kube-system -o wide', desc: 'NODE SELECTOR 列显示它被限制在哪些节点上' }
      ],
      notes: [
        '**`kubectl drain` 默认会被 DaemonSet 的 Pod 挡住**，必须加 `--ignore-daemonsets`（守护进程本来就该留在节点上）',
        'DaemonSet 不能"缩容"，要让它离开某节点只能用 `nodeSelector` 排除或给节点打 taint',
        '控制面节点自带 taint，DaemonSet 想跑上去必须在模板里加对应的 toleration',
        'CCE 节点池扩容后 DaemonSet 会自动在新节点上起一份，日志采集断档往往就是这里出的问题'
      ],
      related: ['k8s-taint', 'k8s-affinity-toleration', 'k8s-drain', 'k8s-troubleshoot-node-notready'],
      docs: 'https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/',
      tags: ['工作负载', 'DaemonSet', '节点', '采集']
    },

    /* ---------- 33 ---------- */
    /* ---------- 33 / 80 ---------- */
    {
      id: 'k8s-job',
      name: 'Job 资源',
      kind: 'recipe',
      alias: ['job yaml', '一次性任务'],
      level: 2,
      syntax: 'apiVersion: batch/v1   kind: Job',
      summary: '跑一次性任务的控制器，保证任务成功执行到完成才退出。',
      desc: 'Job 关心的是"成功完成几次"，而不是"一直跑着"，适合数据迁移、批处理、备份脚本。仿真环境里卡在 Pending 的 `batch-job-28471920-x7klm` 就是一个 CPU 不足的 Job Pod。',
      params: [
        { flag: 'completions', desc: '需要成功完成的 Pod 个数，默认 1' },
        { flag: 'parallelism', desc: '允许同时跑几个 Pod，默认 1' },
        { flag: 'backoffLimit', desc: '失败重试次数，默认 6；**超了 Job 直接标记 Failed**' },
        { flag: 'activeDeadlineSeconds', desc: '整个 Job 的最长运行时间，到点强制终止' },
        { flag: 'restartPolicy', desc: '**只能是 `Never` 或 `OnFailure`**，写 `Always` 会被拒绝' }
      ],
      examples: [
        { cmd: 'kubectl get jobs -n my-app', desc: '看 COMPLETIONS 列（`1/1` 才算成功）' },
        { cmd: 'kubectl describe job batch-job -n my-app | tail -20', desc: '看为什么没跑完：调度失败、反复重试还是超时' },
        { cmd: 'kubectl logs job/batch-job -n my-app', desc: '直接看 Job 的 Pod 日志（kubectl 会自动挑一个 Pod）' },
        { cmd: 'kubectl delete job batch-job -n my-app', desc: '**Job 完成后不会自动删除**，确认结果后手工清理' }
      ],
      notes: [
        '**Job 的 Pod 失败后会不断重建**，看日志要用 `--previous` 看上一次；`backoffLimit` 用完后 Job 变 Failed 不再重试',
        '`kubectl delete job` 默认会连带删除它创建的 Pod；想留 Pod 排查用 `--cascade=orphan`',
        'Job 的 Pod 卡在 Pending 通常是资源不足，看事件里的 `FailedScheduling`（如 `0/3 nodes are available: 3 Insufficient cpu`）',
        '定时任务用 CronJob，不要手工反复创建 Job'
      ],
      related: ['k8s-cronjob', 'k8s-create-job', 'k8s-troubleshoot-pending', 'k8s-logs'],
      docs: 'https://kubernetes.io/docs/concepts/workloads/controllers/job/',
      tags: ['工作负载', 'Job', '批处理']
    },

    /* ---------- 34 ---------- */
    /* ---------- 34 / 80 ---------- */
    {
      id: 'k8s-cronjob',
      name: 'CronJob 资源',
      kind: 'recipe',
      alias: ['cronjob yaml', '定时任务'],
      level: 2,
      syntax: 'apiVersion: batch/v1   kind: CronJob',
      summary: '按 cron 表达式定时创建 Job，用来跑备份、巡检与报表任务。',
      desc: 'CronJob 本身不跑容器，到点它创建一个 Job，由 Job 再去起 Pod。所以排查要分两层：**先看 CronJob 有没有触发，再看它创建的 Job 有没有成功**，一上来就查 Pod 往往白费功夫。',
      params: [
        { flag: 'schedule', desc: '五段式 cron 表达式（分 时 日 月 周），时间基准是 **UTC**' },
        { flag: 'concurrencyPolicy', desc: '`Allow`（默认，可并发）/ `Forbid`（上次没跑完就跳过）/ `Replace`（替换正在跑的）' },
        { flag: 'startingDeadlineSeconds', desc: '错过时间点后还能补跑多久，超过就不再补' },
        { flag: 'successfulJobsHistoryLimit / failedJobsHistoryLimit', desc: '保留多少历史 Job，默认 3 / 1' },
        { flag: 'suspend', desc: '设为 true 暂停调度，排障时很有用' }
      ],
      examples: [
        { cmd: 'kubectl get cj -n my-app', desc: '看 SCHEDULE、SUSPEND 与 LAST SCHEDULE（多久没跑了）' },
        { cmd: 'kubectl get jobs -n my-app --sort-by=.metadata.creationTimestamp | tail -5', desc: '看它到底有没有创建出 Job，这是排查的第一层' },
        { cmd: 'kubectl create job --from=cronjob/backup backup-manual -n my-app', desc: '手工触发一次，立刻验证任务本身能不能跑通' },
        { cmd: 'kubectl patch cj backup --type=merge -p \'{"spec":{"suspend":true}}\' -n my-app', desc: '临时挂起定时任务，避免排障时被新任务干扰' }
      ],
      notes: [
        '**cron 表达式按 UTC 解释**："每天凌晨 2 点"在国内实际是 10 点，要改 `timeZone` 字段或自己换算',
        '`concurrencyPolicy` 默认 `Allow`，任务执行时间超过间隔就会重叠，备份类任务建议设 `Forbid`',
        '历史 Job 会一直堆积，靠 `successfulJobsHistoryLimit` 限制；失败的 Job 往往还需要人工看一眼再清理',
        'CronJob 创建的 Pod 也会占用集群资源，密集调度时要评估叠加时的资源峰值'
      ],
      related: ['k8s-job', 'k8s-create-job', 'k8s-get-events'],
      docs: 'https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/',
      tags: ['工作负载', 'CronJob', '定时任务']
    },

    /* ---------- 35 ---------- */
    /* ---------- 35 / 80 ---------- */
    {
      id: 'k8s-service',
      name: 'Service 三种类型',
      kind: 'recipe',
      alias: ['service yaml', 'ClusterIP', 'NodePort', 'LoadBalancer'],
      level: 1,
      syntax: 'apiVersion: v1   kind: Service   spec.type: ClusterIP | NodePort | LoadBalancer',
      summary: '给一组 Pod 提供固定访问入口，三种类型的选型决定谁能访问。',
      desc: 'Pod 的 IP 会随重建变化，Service 用"固定虚拟 IP + 标签选择器"把它们聚成一个稳定入口。选型口诀：**集群内互访用 ClusterIP，临时对外暴露用 NodePort，生产对外提供服务用 LoadBalancer（华为云 CCE 会自动创建 ELB）**。',
      params: [
        { flag: 'type: ClusterIP', desc: '默认类型，只有集群内能访问，配 Ingress 时后端就用它' },
        { flag: 'type: NodePort', desc: '在**每个节点**上开一个 30000-32767 的端口，节点 IP + 端口即可访问' },
        { flag: 'type: LoadBalancer', desc: '向云平台申请负载均衡器并分配地址，生产对外服务的方式' },
        { flag: 'ports.port / targetPort / nodePort', desc: '服务端口 / 容器实际监听端口 / 节点端口，**`targetPort` 必须与容器监听端口一致**' },
        { flag: 'selector', desc: '标签选择器，选不中 Ready 的 Pod 时 endpoints 为空，服务就不通' }
      ],
      examples: [
        { cmd: 'kubectl get svc -n my-app -o wide', desc: '看 TYPE 与 EXTERNAL-IP（LoadBalancer 类型这里显示 ELB 地址）' },
        { cmd: 'kubectl get endpoints web -n my-app', desc: '**服务不通先看这里**：为空说明选择器没选中或 Pod 未就绪' },
        { cmd: 'kubectl expose deploy/web --type=NodePort --port=80 --target-port=8080 --name=web-np -n my-app', desc: '快速给已有 Deployment 建一个 NodePort 服务' },
        { cmd: 'kubectl get svc web -n my-app -o jsonpath=\'{.spec.clusterIP}\'', desc: '取出 ClusterIP，写进配置或脚本' }
      ],
      notes: [
        '**改 Service 的 `selector` 不会影响 Pod**，但会让 endpoints 立刻变空、服务直接不可用，改前务必确认标签',
        '**删掉 LoadBalancer 类型的 Service 会连带释放云上 ELB**，公网 IP 会变，要提前评估',
        'NodePort 的端口**每个节点都在监听**，安全组没放开照样访问不了',
        '华为云 CCE 上用 LoadBalancer 类型会创建 ELB，需确认 ELB 与节点同 VPC、监听器与后端端口正确',
        '`ClusterIP` 是虚拟 IP，ping 不通是正常的，能不能通用 curl / telnet 端口验证'
      ],
      related: ['k8s-troubleshoot-svc', 'k8s-endpointslices', 'k8s-ingress', 'k8s-get'],
      docs: 'https://kubernetes.io/docs/concepts/services-networking/service/',
      tags: ['Service', '网络', 'LoadBalancer', 'ELB']
    },

    /* ---------- 36 ---------- */
    /* ---------- 36 / 80 ---------- */
    {
      id: 'k8s-ingress',
      name: 'Ingress 资源',
      kind: 'recipe',
      alias: ['ingress yaml', '域名访问', '七层路由'],
      level: 2,
      syntax: 'apiVersion: networking.k8s.io/v1   kind: Ingress',
      summary: '七层入口，用域名和路径把外部流量分发到集群内的不同服务。',
      desc: 'Service 只管四层，Ingress 才是按"域名 + 路径"路由的七层规则。它本身只是一堆规则，**必须集群里装了 Ingress Controller（nginx-ingress、CCE 的 ELB Ingress 等）才生效** —— 只写 Ingress 没有 Controller，是"配了没反应"的头号原因。',
      params: [
        { flag: 'ingressClassName', desc: '指定用哪个 Controller，集群里有多个时必须写' },
        { flag: 'rules[].host', desc: '域名，如 `web.example.com`' },
        { flag: 'rules[].http.paths[].path / pathType', desc: '路径与匹配方式，`Prefix`（前缀）最常用，`Exact` 为精确匹配' },
        { flag: 'backend.service.name / port.number', desc: '后端 Service 名与**服务端口**（不是 targetPort）' },
        { flag: 'tls', desc: '证书配置，Secret 里放 `tls.crt` 与 `tls.key`' }
      ],
      examples: [
        { cmd: 'kubectl get ingress -n my-app', desc: '看 ADDRESS 列有没有分到入口地址，为空说明 Controller 没处理' },
        { cmd: 'kubectl describe ingress web -n my-app', desc: '看规则、后端 Service 与 Events 里的报错' },
        { cmd: 'kubectl get ingressclass', desc: '确认集群装了哪些 Ingress Controller，别写了 Ingress 却没有实现' },
        { cmd: 'kubectl get svc -n kube-system | grep ingress', desc: '找 Ingress Controller 的入口 Service（通常是 LoadBalancer 类型）' }
      ],
      notes: [
        '**只创建 Ingress 不会自动生效**，必须有 Ingress Controller 在跑，否则 ADDRESS 一直是空的',
        '`backend` 里写的是 Service 的 `port`，**不是容器的 `targetPort`**，写错就 502/503',
        '华为云 CCE 提供 Nginx Ingress 与 ELB Ingress 两种，注解写法不同，混用会不生效',
        '域名要提前解析到入口地址，只配 Ingress 不改 DNS 照样打不开',
        'HTTPS 证书放在 Secret 里由 `tls` 段引用，证书过期是"昨天还好今天打不开"的常见原因'
      ],
      related: ['k8s-service', 'k8s-secret', 'k8s-troubleshoot-svc', 'k8s-annotate'],
      docs: 'https://kubernetes.io/docs/concepts/services-networking/ingress/',
      tags: ['Ingress', '七层', '域名', 'ELB']
    },

    /* ---------- 37 ---------- */
    /* ---------- 37 / 80 ---------- */
    {
      id: 'k8s-configmap',
      name: 'ConfigMap 资源',
      kind: 'recipe',
      alias: ['configmap yaml', '配置注入'],
      level: 1,
      syntax: 'apiVersion: v1   kind: ConfigMap',
      summary: '存放非敏感的配置数据，以文件或环境变量的形式注入容器。',
      desc: '把配置从镜像里剥离出来，同一个镜像在不同环境配不同 ConfigMap。它**只放明文配置**，密码密钥要用 Secret；改完之后**已运行的 Pod 不会自动生效**，这是最常见的"改了没反应"。',
      params: [
        { flag: 'data', desc: '键值对，值必须是字符串（数字也要加引号）' },
        { flag: 'immutable', desc: '设为 true 后不可修改，只能删除重建，可减轻 apiserver 压力' },
        { flag: 'volumes.configMap + volumeMounts', desc: '挂载成文件，**会延迟（约一分钟）自动同步**到容器内' },
        { flag: 'envFrom.configMapRef', desc: '整份注入为环境变量，**不会自动更新**，必须重启 Pod' },
        { flag: 'valueFrom.configMapKeyRef', desc: '只注入某一个键为环境变量' }
      ],
      examples: [
        { cmd: 'kubectl get cm -n my-app', desc: '看有哪些配置，DATA 列是键的数量' },
        { cmd: 'kubectl get cm app-config -n my-app -o yaml', desc: '看具体内容，确认改动有没有写进去' },
        { cmd: 'kubectl exec web-7d9c4b8f5-2xk9p -n my-app -- env | grep -i app', desc: '进容器确认环境变量形式的配置是否注入成功' },
        { cmd: 'kubectl exec web-7d9c4b8f5-2xk9p -n my-app -- cat /etc/app/app.conf', desc: '看以文件形式挂载的配置内容' }
      ],
      notes: [
        '**环境变量方式注入的配置不会随 ConfigMap 更新**，改完必须 `kubectl rollout restart` 重建 Pod',
        '卷挂载方式会延迟自动同步到容器内文件，但**应用要自己重读文件**才真正生效',
        'ConfigMap 是明文的，**密码、AK/SK、证书一律放 Secret**，别图省事写进来',
        '引用了不存在的 ConfigMap 时 Pod 会卡在 `CreateContainerConfigError`，用 `kubectl describe pod` 看事件'
      ],
      related: ['k8s-secret', 'k8s-create-configmap', 'k8s-rollout', 'k8s-exec'],
      docs: 'https://kubernetes.io/docs/concepts/configuration/configmap/',
      tags: ['配置', 'ConfigMap', '环境变量']
    },

    /* ---------- 38 ---------- */
    /* ---------- 38 / 80 ---------- */
    {
      id: 'k8s-secret',
      name: 'Secret 资源',
      kind: 'recipe',
      alias: ['secret yaml', '密码管理', 'imagePullSecrets'],
      level: 2,
      syntax: 'apiVersion: v1   kind: Secret',
      summary: '存放密码、令牌、证书等敏感数据，内容以 base64 编码保存。',
      desc: 'Secret 与 ConfigMap 结构几乎一样，定位差别在于"敏感数据"：内容以 base64 存储（**只是编码不是加密**），可以单独用 RBAC 限制读取，也可以开启 etcd 静态加密。常见类型有 `Opaque`、`kubernetes.io/dockerconfigjson`（镜像仓库凭证）、`kubernetes.io/tls`（证书）。',
      params: [
        { flag: 'type', desc: '`Opaque`（默认）/ `kubernetes.io/dockerconfigjson` / `kubernetes.io/tls`' },
        { flag: 'data', desc: 'base64 编码后的值；`stringData` 可写明文，提交时自动转 base64，写 YAML 更省事' },
        { flag: 'imagePullSecrets', desc: '在 Pod 里引用它来拉私有仓库镜像（华为云 SWR 需要）' },
        { flag: 'immutable', desc: '不可变标记，创建后不能再改' }
      ],
      examples: [
        { cmd: 'kubectl get secret -n my-app', desc: '看有哪些密钥，TYPE 列区分用途' },
        { cmd: 'kubectl describe secret db-secret -n my-app', desc: '只显示键名与字节数，**不显示内容**，适合确认键有没有配对' },
        { cmd: 'kubectl get secret db-secret -n my-app -o jsonpath=\'{.data.password}\' | base64 -d', desc: '取出明文，**注意别把结果贴到工单或聊天里**' },
        { cmd: 'kubectl create secret generic db-secret --from-literal=password=MyP@ssw0rd --dry-run=client -o yaml', desc: '生成 YAML 骨架，改好再 apply，比手写 base64 快且不易错' }
      ],
      notes: [
        '**base64 不是加密**，任何能 `get secret` 的人都能解出明文；生产要用 RBAC 限制权限并开启 etcd 加密',
        '**不要提交到 Git**：密钥一旦进仓库就等同泄露，应使用密钥管理方案统一注入',
        '改 Secret 后 Pod 不会自动重读，同样需要 `kubectl rollout restart`',
        '拉私有镜像报 `ImagePullBackOff` 时，确认 `imagePullSecrets` 的名称与仓库地址能对上（SWR 凭证由 CCE 侧创建）'
      ],
      related: ['k8s-configmap', 'k8s-create-secret-generic', 'k8s-sa-token', 'k8s-troubleshoot-imagepull'],
      docs: 'https://kubernetes.io/docs/concepts/configuration/secret/',
      tags: ['密钥', 'Secret', '安全', '镜像仓库']
    },

    /* ---------- 39 ---------- */
    /* ---------- 39 / 80 ---------- */
    {
      id: 'k8s-pvc-pv',
      name: 'PersistentVolumeClaim / PersistentVolume',
      alias: ['pvc', 'pv', '持久卷', '存储挂载'],
      level: 2,
      syntax: 'apiVersion: v1   kind: PersistentVolumeClaim',
      summary: 'PV 是集群里的存储资源，PVC 是应用对存储的申请单，两者动态绑定。',
      desc: 'PV 是管理员视角的"一块盘"，PVC 是应用视角的"我要 20G 读写盘"。两者通过 StorageClass 动态绑定：PVC 提交后 CSI 驱动（华为云是 everest-csi）去云上创建 EVS 云盘或 SFS 文件存储，再绑定成 PV。仿真环境里 `app-data` 已 Bound（csi-disk），`logs-pvc` 还 Pending（csi-nas）。',
      params: [
        { flag: 'accessModes', desc: '`ReadWriteOnce`（单节点读写，云盘 EVS 用它）/ `ReadOnlyMany` / `ReadWriteMany`（多节点读写，需 NAS/SFS）' },
        { flag: 'storageClassName', desc: '用哪个存储类，如 `csi-disk`、`csi-nas`' },
        { flag: 'resources.requests.storage', desc: '申请容量，动态模式下**只能扩不能缩**' },
        { flag: 'volumeMode', desc: '`Filesystem`（默认）或 `Block`' },
        { flag: 'persistentVolumeReclaimPolicy', desc: '回收策略：`Delete`（默认，删 PVC 连带删云盘）或 `Retain`（保留数据）' }
      ],
      examples: [
        { cmd: 'kubectl get pvc -n my-app', desc: '**第一件事**：看 STATUS 是 Bound 还是 Pending' },
        { cmd: 'kubectl describe pvc logs-pvc -n my-app | tail -20', desc: 'Pending 时看 Events：存储类不存在、容量不够还是可用区对不上' },
        { cmd: 'kubectl get pv', desc: '看集群里所有 PV 的容量、访问模式与绑定的 PVC' },
        { cmd: 'kubectl get sc', desc: '列出可用存储类，CCE 常见的有 csi-disk、csi-nas、csi-obs' }
      ],
      notes: [
        '**`logs-pvc` 这种 Pending 会让 Pod 一直起不来**：先确认 `storageClassName` 是否存在、容量是否低于存储类下限',
        '**云盘（csi-disk）只能 `ReadWriteOnce`**，多个 Pod 想同时读写要用 csi-nas（SFS 文件存储）',
        '**删 PVC 可能连带删除云上云盘**（回收策略为 Delete 时），重要数据先做快照（CCE 支持 EVS 快照）',
        '云盘是**可用区级**资源，节点与云盘不在同一 AZ 时挂不上，报 `FailedAttachVolume`',
        '扩容要先确认存储类开了 `allowVolumeExpansion`，再改 PVC 的 `requests.storage`（只能变大）'
      ],
      related: ['k8s-storageclass', 'k8s-describe', 'k8s-troubleshoot-pending', 'k8s-statefulset'],
      docs: 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/',
      tags: ['存储', 'PVC', 'PV', '华为云']
    },

    /* ---------- 40 ---------- */
    /* ---------- 40 / 80 ---------- */
    {
      id: 'k8s-storageclass',
      name: 'StorageClass 存储类',
      kind: 'recipe',
      alias: ['sc', '动态供给', 'csi-disk'],
      level: 3,
      syntax: 'apiVersion: storage.k8s.io/v1   kind: StorageClass',
      summary: '定义用哪种存储、怎么创建，让 PVC 能自动申请到云盘或文件存储。',
      desc: 'StorageClass 是动态供给的模板：PVC 只写容量和存储类名字，CSI 驱动按模板去云上创建对应介质。华为云 CCE 默认提供 `csi-disk`（EVS 云盘，块存储）、`csi-nas`（SFS 文件存储）、`csi-obs`（对象存储）等。',
      params: [
        { flag: 'provisioner', desc: '由哪个驱动负责创建，CCE 上是 `everest-csi-provisioner`' },
        { flag: 'parameters.type', desc: '云盘类型，如 `SSD`、`SAS`、`GPSSD`（不同区域取值不同）' },
        { flag: 'reclaimPolicy', desc: '`Delete`（默认）或 `Retain`' },
        { flag: 'allowVolumeExpansion', desc: '是否允许在线扩容 PVC，**默认 false**' },
        { flag: 'volumeBindingMode', desc: '`Immediate`（立即创建）或 `WaitForFirstConsumer`（等 Pod 调度后再建）' }
      ],
      examples: [
        { cmd: 'kubectl get sc', desc: '列出所有存储类，带 `(default)` 的会被未指定存储类的 PVC 使用' },
        { cmd: 'kubectl get sc csi-disk -o yaml', desc: '看这个存储类的 provisioner、参数与是否允许扩容' },
        { cmd: 'kubectl get pvc -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,SC:.spec.storageClassName,STATUS:.status.phase', desc: '全局看每个 PVC 用的存储类与绑定状态' },
        { cmd: 'kubectl describe sc csi-nas', desc: '看它当前绑定了多少 PVC、有没有报错事件' }
      ],
      notes: [
        '**云盘创建失败时 PVC 会一直 Pending**，要看 `describe pvc` 的事件，并在 CCE 控制台确认该存储类在当前可用区有库存',
        '`volumeBindingMode: WaitForFirstConsumer` 能避免"云盘建在 A 可用区、Pod 调度到 B 可用区"的经典问题，新建存储类建议开启',
        '`allowVolumeExpansion` 不打开时，改 PVC 容量会被直接拒绝',
        '`Delete` 策略下删 PVC 会真正删掉云上云盘，**没有备份的数据无法找回**',
        '跨命名空间或跨 Pod 共享存储用 `csi-nas`（ReadWriteMany），云盘做不到'
      ],
      related: ['k8s-pvc-pv', 'k8s-troubleshoot-pending', 'k8s-statefulset'],
      docs: 'https://kubernetes.io/docs/concepts/storage/storage-classes/',
      tags: ['存储', 'StorageClass', '动态供给', 'CSI']
    },

    /* ---------- 41 ---------- */
    /* ---------- 41 / 80 ---------- */
    {
      id: 'k8s-hpa',
      name: 'HorizontalPodAutoscaler',
      alias: ['hpa', '自动扩缩容', '弹性伸缩'],
      level: 3,
      syntax: 'apiVersion: autoscaling/v2   kind: HorizontalPodAutoscaler',
      summary: '按 CPU、内存或自定义指标自动调整副本数，用来应对流量波动。',
      desc: 'HPA 是一个控制循环：默认每 15 秒拉一次指标，与目标值比对后调整 Deployment / StatefulSet 的副本数。**前提是 Pod 设置了 `resources.requests`**（没有 requests 就算不出利用率），并且集群装了 metrics-server。',
      params: [
        { flag: 'scaleTargetRef', desc: '目标工作负载（apiVersion / kind / name）' },
        { flag: 'minReplicas / maxReplicas', desc: '副本数上下限，`minReplicas` 默认 1，**别让下限是 1**' },
        { flag: 'metrics[].resource.target.averageUtilization', desc: '按利用率扩缩，如 CPU 70 表示平均超过 requests 的 70% 就扩容' },
        { flag: 'behavior.scaleDown.stabilizationWindowSeconds', desc: '缩容冷却时间，默认 300 秒，防止抖动' },
        { flag: 'autoscaling/v2', desc: '现用 API 版本，支持多指标；`v1` 只支持 CPU' }
      ],
      examples: [
        { cmd: 'kubectl get hpa -n my-app', desc: '看 TARGETS 有没有数值：显示 `<unknown>/70%` 说明指标拿不到' },
        { cmd: 'kubectl describe hpa web-hpa -n my-app', desc: '看 Events：`failed to get cpu utilization` 就是指标源问题' },
        { cmd: 'kubectl top pod -n my-app', desc: '指标拿不到时先确认 metrics-server 是否正常（这是 HPA 最常见的故障）' },
        { cmd: 'kubectl get hpa web-hpa -n my-app -o yaml | grep -A8 behavior', desc: '确认扩缩容的冷却与步长策略' }
      ],
      notes: [
        '**没有 `resources.requests.cpu` 的 Pod 无法计算利用率**，HPA 会一直显示 unknown，先把 requests 补上',
        '报 `Metrics API not available` 说明 metrics-server 未就绪，和 HPA 配置无关',
        'HPA 与 `kubectl scale` 会互相"抢方向盘"：手工改的副本数在下一次评估时会被 HPA 覆盖',
        '缩容太快容易抖，`behavior.scaleDown.stabilizationWindowSeconds` 建议不低于 300 秒',
        'HPA 只能扩副本，**节点资源不够时新 Pod 会 Pending**，要配合节点池自动扩缩容（CCE 支持）'
      ],
      related: ['k8s-scale', 'k8s-top', 'k8s-deployment', 'k8s-troubleshoot-pending'],
      docs: 'https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/',
      tags: ['弹性伸缩', 'HPA', '指标', '副本']
    },

    /* ==================== F. 创建与管理 ==================== */

    /* ---------- 42 ---------- */
    /* ---------- 42 / 80 ---------- */
    {
      id: 'k8s-create-namespace',
      name: 'kubectl create namespace',
      alias: ['kubectl create ns'],
      level: 1,
      syntax: 'kubectl create namespace <命名空间名> [选项]',
      summary: '创建命名空间，用逻辑隔离把不同环境或团队分开。',
      desc: '命名空间是集群内的逻辑隔离单位：同名资源可以存在于不同命名空间，RBAC 与资源配额也常按命名空间划分。仿真环境里 `my-app`（业务）、`monitoring`（监控）、`kube-system`（系统组件）就是这样分工的。',
      params: [
        { flag: '<命名空间名>', desc: '只能用小写字母、数字和连字符' },
        { flag: '--dry-run=client -o yaml', desc: '只渲染 YAML 不提交，便于纳入 Git 管理' },
        { flag: '-n / --namespace', desc: '命名空间本身是集群级资源，不需要也不能加 `-n`' },
        { flag: 'kubectl config set-context --current --namespace=<ns>', desc: '把它设为默认命名空间，省掉反复写 `-n`' }
      ],
      examples: [
        { cmd: 'kubectl create namespace my-app', desc: '最常用：建一个业务命名空间' },
        { cmd: 'kubectl create ns monitoring --dry-run=client -o yaml > monitoring.yaml', desc: '生成 YAML，纳入 Git 后用 apply 管理' },
        { cmd: 'kubectl get ns', desc: '列出所有命名空间，STATUS 为 Active 才算正常' },
        { cmd: 'kubectl config set-context --current --namespace=my-app', desc: '把默认命名空间切成 my-app，之后不必反复写 -n' }
      ],
      notes: [
        '**删除命名空间会删光里面的一切**，PV/PVC 与云上云盘可能一并释放，执行前先 `kubectl get all -n <命名空间>` 看清楚',
        '命名空间卡在 `Terminating` 通常是还有资源带 finalizer 或 APIService 不可用，要逐个排查而不是强删',
        '`default` 与 `kube-system` 不要动，系统组件都在 `kube-system` 里',
        '命名空间**不是网络隔离**：跨命名空间默认可通，要隔离得靠 NetworkPolicy'
      ],
      related: ['k8s-create-serviceaccount', 'k8s-rbac-role', 'k8s-networkpolicy', 'k8s-delete'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_namespace/',
      tags: ['命名空间', '隔离', '创建']
    },

    /* ---------- 43 ---------- */
    /* ---------- 43 / 80 ---------- */
    {
      id: 'k8s-create-secret-generic',
      name: 'kubectl create secret generic',
      alias: ['create secret', '生成 secret yaml'],
      level: 2,
      syntax: 'kubectl create secret generic <名字> --from-literal=键=值 | --from-file=... [选项]',
      summary: '从文件、字面量或 env 文件快速生成 Secret，省去手工 base64 编码。',
      desc: '手写 Secret YAML 要自己算 base64，很容易出错。这条命令支持从文件、字面量、`.env` 文件直接生成，配合 `--dry-run=client -o yaml` 就能拿到一份正确的清单文件。',
      params: [
        { flag: '--from-literal=键=值', desc: '直接给键值对，可写多次（**值会留在 shell 历史里**）' },
        { flag: '--from-file=<文件>', desc: '文件名做键、内容做值；写 `--from-file=键=<文件>` 可自定义键名' },
        { flag: '--from-env-file=.env', desc: '按 `.env` 里每行 `KEY=VALUE` 生成多个键' },
        { flag: '--dry-run=client -o yaml', desc: '只渲染 YAML 不提交，用来生成清单文件' },
        { flag: '--type=<类型>', desc: '默认 `Opaque`，也可指定 `kubernetes.io/tls` 等' }
      ],
      examples: [
        { cmd: 'kubectl create secret generic db-secret --from-literal=username=app --from-literal=password=MyP@ssw0rd -n my-app', desc: '最常用：从字面量建一个密钥' },
        { cmd: 'kubectl create secret generic tls-secret --from-file=tls.crt=./server.crt --from-file=tls.key=./server.key --type=kubernetes.io/tls -n my-app', desc: '给 Ingress 用的 TLS 证书，**键名必须是 tls.crt 与 tls.key**' },
        { cmd: 'kubectl create secret generic db-secret --from-literal=password=MyP@ssw0rd --dry-run=client -o yaml > db-secret.yaml', desc: '生成 YAML 骨架，改完交给 GitOps 流程' },
        { cmd: 'kubectl get secret db-secret -n my-app -o jsonpath=\'{.data.password}\' | base64 -d', desc: '验证生成的密钥内容对不对' }
      ],
      notes: [
        '**`--from-literal` 会把明文写进 shell 历史**，生产建议用 `--from-file` 或从密钥管理系统取',
        '`--from-file` 默认用**文件名**做键，挂载后容器里看到的就是这个文件名，命名要规范',
        '生成出来的 YAML 里 `data` 是 base64，**直接提交 Git 等于泄露**，注意仓库权限与密钥管理方案',
        '同名 Secret 已存在会报 `AlreadyExists`，要么先删掉要么改用 `kubectl apply`'
      ],
      related: ['k8s-secret', 'k8s-configmap', 'k8s-create-configmap', 'k8s-sa-token'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_secret_generic/',
      tags: ['密钥', 'Secret', '创建']
    },

    /* ---------- 44 ---------- */
    /* ---------- 44 / 80 ---------- */
    {
      id: 'k8s-create-configmap',
      name: 'kubectl create configmap',
      alias: ['create cm', '生成 configmap yaml'],
      level: 1,
      syntax: 'kubectl create configmap <名字> --from-literal=键=值 | --from-file=... [选项]',
      summary: '从文件或字面量生成 ConfigMap，把配置与镜像彻底分开。',
      desc: '用法与 `create secret` 几乎一样，只是内容不敏感。最常见的场景是把一整个配置文件塞进 ConfigMap，再挂载到容器里覆盖镜像内的默认配置。',
      params: [
        { flag: '--from-literal=键=值', desc: '直接给键值对' },
        { flag: '--from-file=<文件|目录>', desc: '文件内容作为值；给目录时每个文件一个键（**只收一层，不递归**）' },
        { flag: '--from-env-file=<文件>', desc: '按 `KEY=VALUE` 格式批量生成，适合放一堆环境变量' },
        { flag: '--dry-run=client -o yaml', desc: '只渲染 YAML 不提交' }
      ],
      examples: [
        { cmd: 'kubectl create configmap app-config --from-literal=LOG_LEVEL=info --from-file=app.conf=./app.conf -n my-app', desc: '混合用法：一个键来自字面量，一个键来自文件' },
        { cmd: 'kubectl create configmap nginx-conf --from-file=./conf.d/ -n my-app', desc: '把整个目录里的配置文件一次性装进去' },
        { cmd: 'kubectl create configmap app-config --from-literal=LOG_LEVEL=info --dry-run=client -o yaml > cm.yaml', desc: '生成 YAML 纳入 Git 管理' },
        { cmd: 'kubectl get cm app-config -n my-app -o yaml', desc: '确认键与内容都写对了' }
      ],
      notes: [
        '改完 ConfigMap 后**环境变量方式的 Pod 不会自动更新**，要 `kubectl rollout restart` 才生效',
        '`--from-file` 给目录时**不会递归子目录**，深层配置要自己整理好目录结构',
        '键名不能含 `..` 或 `/`，用文件名做键时要留意',
        '配置文件里如果混进了密码，应该改用 Secret，不要留在 ConfigMap 里'
      ],
      related: ['k8s-configmap', 'k8s-create-secret-generic', 'k8s-rollout', 'k8s-exec'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_configmap/',
      tags: ['配置', 'ConfigMap', '创建']
    },

    /* ---------- 45 ---------- */
    /* ---------- 45 / 80 ---------- */
    {
      id: 'k8s-create-serviceaccount',
      name: 'kubectl create serviceaccount',
      alias: ['create sa', '服务账号'],
      level: 2,
      syntax: 'kubectl create serviceaccount <名字> -n <命名空间>',
      summary: '为 Pod 创建集群内身份，是 RBAC 授权与访问 API 的载体。',
      desc: 'Pod 里访问 API Server、拉取私有镜像、被 RBAC 授权，用的都是 ServiceAccount 身份。每个命名空间默认有一个 `default` SA 且**权限为空**（1.24 起不再自动生成长期令牌）。生产上建议一个应用一个 SA，按最小权限授予。',
      params: [
        { flag: '<名字>', desc: '同一命名空间内唯一' },
        { flag: '-n <命名空间>', desc: '归属的命名空间，SA 是命名空间级资源' },
        { flag: '--dry-run=client -o yaml', desc: '渲染 YAML，纳入 Git 交付' },
        { flag: 'serviceAccountName', desc: '在 Pod 的 spec 里引用它；不写就用 `default`' }
      ],
      examples: [
        { cmd: 'kubectl create serviceaccount app-sa -n my-app', desc: '给应用建一个独立身份' },
        { cmd: 'kubectl create sa app-sa -n my-app --dry-run=client -o yaml > sa.yaml', desc: '生成 YAML 纳入 Git 管理' },
        { cmd: 'kubectl get sa -n my-app', desc: '看命名空间里的 SA 列表' },
        { cmd: 'kubectl describe sa app-sa -n my-app', desc: '看它的镜像拉取密钥绑定情况' }
      ],
      notes: [
        '**1.24 之后创建 SA 不再自动生成长期令牌 Secret**，需要令牌用 `kubectl create token`',
        'Pod 不写 `serviceAccountName` 就用 `default` SA，**排查权限问题时先确认 Pod 用的是哪个 SA**',
        '不需要访问 API Server 的 Pod 建议设 `automountServiceAccountToken: false`，减少令牌泄露面',
        '删 SA 不会自动清理 RoleBinding，会留下悬空的授权引用'
      ],
      related: ['k8s-rbac-role', 'k8s-sa-token', 'k8s-create-token', 'k8s-auth-can-i'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_serviceaccount/',
      tags: ['ServiceAccount', '身份', 'RBAC']
    },

    /* ---------- 46 ---------- */
    /* ---------- 46 / 80 ---------- */
    {
      id: 'k8s-create-job',
      name: 'kubectl create job',
      alias: ['create job from cronjob', '手工触发任务'],
      level: 2,
      syntax: 'kubectl create job <名字> --image=<镜像> | --from=cronjob/<名字>',
      summary: '一条命令创建一次性任务，也能从 CronJob 手工触发跑一次。',
      desc: '临时跑批处理任务时最省事的方式。`--from=cronjob/<名字>` 会把定时任务的模板复制一份立即执行，是**验证定时任务本身能不能跑通**的标准手段。',
      params: [
        { flag: '--image=<镜像>', desc: 'Job 使用的镜像' },
        { flag: '--from=cronjob/<名字>', desc: '按已有 CronJob 的模板创建一次性 Job' },
        { flag: '--dry-run=client -o yaml', desc: '渲染 YAML，便于改成正式清单' },
        { flag: '-n <命名空间>', desc: '指定命名空间' }
      ],
      examples: [
        { cmd: 'kubectl create job db-migrate --image=swr.cn-north-4.myhuaweicloud.com/myorg/migrate:v1.2.0 -n my-app', desc: '跑一次数据库迁移，镜像来自华为云 SWR' },
        { cmd: 'kubectl create job --from=cronjob/backup backup-manual -n my-app', desc: '手工触发一次定时备份，验证任务本身是否正常' },
        { cmd: 'kubectl logs job/db-migrate -n my-app', desc: '看任务输出，`kubectl logs` 可以直接跟 `job/`' },
        { cmd: 'kubectl create job db-migrate --image=busybox --dry-run=client -o yaml > job.yaml', desc: '生成 YAML 后再补 restartPolicy、resources 等字段' }
      ],
      notes: [
        '命令行创建时**不方便指定自定义 command/args**，需要精细控制就写 YAML 用 `kubectl apply`',
        '`--from=cronjob/` 复制的是创建那一刻的模板，之后改 CronJob 不会影响这个 Job',
        'Job 的 `restartPolicy` 由 kubectl 自动设为 `Never`，不要手工改成 `Always`（会被拒绝）',
        '任务跑完 Pod 不会自动删，要么手工清理要么给 Job 配 TTL'
      ],
      related: ['k8s-job', 'k8s-cronjob', 'k8s-logs', 'k8s-apply'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_job/',
      tags: ['Job', '批处理', '创建']
    },

    /* ---------- 47 ---------- */
    /* ---------- 47 / 80 ---------- */
    {
      id: 'k8s-create-token',
      name: 'kubectl create token',
      alias: ['serviceaccount token', '申请令牌'],
      level: 3,
      syntax: 'kubectl create token <ServiceAccount名> -n <命名空间> [--duration=1h]',
      summary: '为 ServiceAccount 申请一个有时效的令牌，用于集群外身份认证。',
      desc: '1.24 起 ServiceAccount 不再自动生成长期令牌，需要令牌时用这条命令现取。默认有效期 1 小时，可用 `--duration` 延长。拿到的令牌可以写进 kubeconfig，让 CI/CD 或外部程序以该 SA 的身份访问集群。',
      params: [
        { flag: '<ServiceAccount名>', desc: '目标 SA，必须带 `-n` 指定命名空间' },
        { flag: '--duration=1h', desc: '令牌有效期，**服务端可能限制上限**（默认 1 小时）' },
        { flag: '-o yaml', desc: '输出完整 TokenRequest 对象，含 `status.expirationTimestamp`' },
        { flag: '--bound-object-kind / --bound-object-name', desc: '把令牌绑定到某个 Pod/Secret，该对象删除后令牌立即失效' },
        { flag: '--audience', desc: '指定受众，用于需要校验 audience 的场景' }
      ],
      examples: [
        { cmd: 'kubectl create token app-sa -n my-app', desc: '最常用：拿一个默认 1 小时有效期的令牌' },
        { cmd: 'kubectl create token app-sa -n my-app --duration=24h', desc: '申请 24 小时有效期（超过服务端上限会被拒）' },
        { cmd: 'kubectl create token app-sa -n my-app -o yaml', desc: '看令牌的过期时间，判断要不要做过期刷新' },
        { cmd: 'kubectl auth can-i get pods --as=system:serviceaccount:my-app:app-sa -n my-app', desc: '拿令牌之前先确认这个 SA 到底有没有权限' }
      ],
      notes: [
        '**令牌等同于该 ServiceAccount 的身份**，等于密码，不要写进代码、日志或聊天记录',
        '令牌有有效期是安全设计而非缺陷，**长期硬编码的令牌反而是风险**；CI/CD 应在每次运行时现取',
        '拿不到令牌时先确认 SA 存在、命名空间正确，以及自己有没有 `create serviceaccounts/token` 权限',
        'SA 的权限来自 RoleBinding，**令牌只证明"你是谁"，没有绑定就依然没有权限**'
      ],
      related: ['k8s-sa-token', 'k8s-create-serviceaccount', 'k8s-auth-can-i', 'k8s-rbac-role'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_token/',
      tags: ['令牌', 'ServiceAccount', '认证']
    },

    /* ---------- 48 ---------- */
    /* ---------- 48 / 80 ---------- */
    {
      id: 'k8s-label',
      name: 'kubectl label',
      alias: ['打标签', '标签管理'],
      level: 2,
      syntax: 'kubectl label <资源类型> <资源名> <键>=<值> [--overwrite]',
      summary: '给资源打标签，Service 选择器、调度与批量筛选都靠它。',
      desc: '标签是 K8s 的"索引"：Service 靠它找 Pod，Deployment 靠它认领 Pod，`-l` 靠它批量筛选。**标签可以改，但改错会立刻切断关联** —— 把 Pod 的 `app=web` 改掉，Service 的 endpoints 马上就空了。',
      params: [
        { flag: '键=值', desc: '新增或覆盖标签' },
        { flag: '--overwrite', desc: '**覆盖已有键必须加**，否则直接报错' },
        { flag: '键-', desc: '删除某个标签（键后面跟减号）' },
        { flag: '--dry-run=client', desc: '先看会改什么，不真改' },
        { flag: '-l <选择器>', desc: '批量给匹配到的一批资源打标签' }
      ],
      examples: [
        { cmd: 'kubectl label pod web-7d9c4b8f5-2xk9p env=prod -n my-app', desc: '给 Pod 加一个环境标签' },
        { cmd: 'kubectl label pod web-7d9c4b8f5-2xk9p env=test --overwrite -n my-app', desc: '改已有标签必须加 `--overwrite`' },
        { cmd: 'kubectl label node 10.0.1.24 disktype=ssd', desc: '给节点打标签，供 nodeSelector 使用' },
        { cmd: 'kubectl label pod web-7d9c4b8f5-2xk9p env- -n my-app', desc: '删除 Pod 上的 `env` 标签' }
      ],
      notes: [
        '**改 Pod 的标签会影响 Service 后端**：标签一改，endpoints 可能立刻变空、线上直接 502',
        '被 selector 引用的标签（如 `app`）要格外小心：**Deployment 的 selector 不可变**，改了模板标签会导致新 Pod 与 selector 不匹配',
        '标签的键与值有长度和字符限制（键最多 63 字符，值只能字母数字开头结尾），不支持中文键名',
        '批量打标签前先用同一个 `-l` 跑一次 `kubectl get`，看清会命中哪些资源'
      ],
      related: ['k8s-annotate', 'k8s-get-nodes-label', 'k8s-service', 'k8s-get'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_label/',
      tags: ['标签', 'selector', '调度']
    },

    /* ---------- 49 ---------- */
    /* ---------- 49 / 80 ---------- */
    {
      id: 'k8s-annotate',
      name: 'kubectl annotate',
      alias: ['注解', 'annotation'],
      level: 2,
      syntax: 'kubectl annotate <资源类型> <资源名> <键>=<值> [--overwrite]',
      summary: '给资源加注解，存放不影响调度的说明与控制器配置项。',
      desc: '注解与标签结构一样都是键值对，但用途不同：**标签给选择器用（要短、要规范），注解给工具和控制器读（可放长文本、URL、JSON）**。Ingress 的路由策略、CCE 的负载均衡参数都是通过注解写的。',
      params: [
        { flag: '键=值', desc: '添加或覆盖注解' },
        { flag: '--overwrite', desc: '覆盖已有键必须加' },
        { flag: '键-', desc: '删除注解' },
        { flag: '--dry-run=client', desc: '预演，看会改成什么样' }
      ],
      examples: [
        { cmd: 'kubectl annotate ingress web nginx.ingress.kubernetes.io/rewrite-target=/ -n my-app', desc: '给 Ingress 加一条 Controller 会读取的注解' },
        { cmd: 'kubectl annotate deploy web description="订单服务，负责人 张三" -n my-app --overwrite', desc: '加业务说明，方便别人接手' },
        { cmd: 'kubectl annotate svc web kubernetes.io/elb.id=<ELB的ID> -n my-app', desc: '指定 CCE ELB 类型 Service 使用的负载均衡实例' },
        { cmd: 'kubectl get ingress web -n my-app -o jsonpath=\'{.metadata.annotations}\'', desc: '查看资源上现有的全部注解' }
      ],
      notes: [
        '**注解写错不会报错，但控制器读不到就不生效**，排查"配了没反应"时先核对拼写',
        '注解的键通常带域名前缀（如 `nginx.ingress.kubernetes.io/`），少一段就不被识别',
        '注解值只能是字符串，复杂结构要写成 JSON 字符串',
        '各控制器与云厂商的注解不通用，CCE 的 ELB 注解与社区 nginx-ingress 注解不能混用'
      ],
      related: ['k8s-label', 'k8s-ingress', 'k8s-edit', 'k8s-service'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_annotate/',
      tags: ['注解', 'annotation', 'Ingress']
    },

    /* ---------- 50 ---------- */
    /* ---------- 50 / 80 ---------- */
    {
      id: 'k8s-replace',
      name: 'kubectl replace --force',
      alias: ['replace -f', '重建资源'],
      level: 3,
      syntax: 'kubectl replace -f <文件> [--force] [选项]',
      summary: '用新 YAML 整体替换资源，改不动不可变字段时用重建的办法解决。',
      desc: '`apply` 是合并式更新，遇到不可变字段（Service 的 `clusterIP`、Deployment 的 `selector`）会直接失败；`--force` 的做法是**先删再建**，所以能改这些字段，代价是资源会短暂消失。',
      params: [
        { flag: '-f <文件>', desc: '新的资源定义' },
        { flag: '--force', desc: '先删后建，**会造成短暂服务中断**' },
        { flag: '--grace-period=0', desc: '立即删除，不等优雅终止' },
        { flag: '--dry-run=server', desc: '先让服务端校验新定义是否合法，避免白删一次' }
      ],
      examples: [
        { cmd: 'kubectl diff -f svc.yaml', desc: '**替换前先看清单改了什么**，确认真的碰到了不可变字段' },
        { cmd: 'kubectl replace --force -f svc.yaml', desc: '重建 Service 以改动不可变字段（会有秒级中断）' },
        { cmd: 'kubectl replace -f deploy.yaml', desc: '不做删除，只整体替换（不可变字段依然改不了）' },
        { cmd: 'kubectl get svc web -n my-app -o yaml > svc-live.yaml', desc: '先把线上实际定义导出来改，避免用过期文件覆盖' }
      ],
      notes: [
        '**`--force` 是先删后建，Pod 会被全部重建、Service 的 ClusterIP 可能变化**，生产操作要选低峰期并确认副本冗余',
        '**替换前必须 `kubectl diff`**：用一份过期的本地 YAML 直接替换，会把别人在线上做的热修改全部覆盖掉',
        '删掉的资源如果有 finalizer，重建可能因为旧对象没删干净而失败',
        '更温和的替代方案：把 Service 换个名字新建，切完流量再删旧的（蓝绿思路）'
      ],
      related: ['k8s-apply', 'k8s-diff', 'k8s-delete', 'k8s-service'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_replace/',
      tags: ['变更', '替换', '不可变字段', '危险']
    },

    /* ---------- 51 ---------- */
    /* ---------- 51 / 80 ---------- */
    {
      id: 'k8s-diff',
      name: 'kubectl diff',
      alias: ['预览改动', 'apply 前对比'],
      level: 3,
      syntax: 'kubectl diff -f <文件|目录> [选项]',
      summary: '预览 apply 会带来哪些字段变化，改配置前的一道安全闸。',
      desc: '把本地 YAML 与集群里的实际对象做对比，输出统一的 diff 格式，**不改动任何东西**。它是 `apply` 之前最该养成习惯的一步：能发现"本地文件比线上旧"这种会覆盖别人热修改的情况。',
      params: [
        { flag: '-f <文件|目录>', desc: '要对比的清单，支持目录与多个 `-f`' },
        { flag: '--server-side', desc: '按服务端应用（SSA）语义对比，与 `apply --server-side` 结果一致' },
        { flag: 'KUBECTL_EXTERNAL_DIFF', desc: '指定外部 diff 工具，如 `diff -u`，输出更易读' },
        { flag: '退出码', desc: '**有差异返回 1，无差异返回 0**，串在流水线里要留意' }
      ],
      examples: [
        { cmd: 'kubectl diff -f deploy.yaml', desc: '看这份 YAML 提交后到底会改什么' },
        { cmd: 'kubectl diff -f ./manifests/ -n my-app', desc: '批量对比整个目录下的清单' },
        { cmd: '$env:KUBECTL_EXTERNAL_DIFF="diff -u"; kubectl diff -f deploy.yaml', desc: 'Windows PowerShell 下指定外部 diff 工具' },
        { cmd: 'kubectl diff -f svc.yaml --server-side', desc: '按服务端应用语义对比，与 SSA 的 apply 配套使用' }
      ],
      notes: [
        '**有差异时 `kubectl diff` 返回退出码 1**，直接串在 `&&` 后面会被当成失败中断，脚本里要特别处理',
        '长文本字段（如证书、大段配置）的差异会以整体替换形式展示，出现截断是正常的',
        '`diff` 只能看字段级差异，**看不出"这个字段为什么被改"**，结合 `kubectl get -o yaml` 一起看',
        '线上被 `kubectl edit` 热改过、而本地 YAML 没同步时，diff 会显示"要把线上改回去"，这正是它最大的价值'
      ],
      related: ['k8s-apply', 'k8s-replace', 'k8s-edit'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_diff/',
      tags: ['变更', 'diff', '预览']
    },

    /* ==================== G. 调度与节点 ==================== */

    /* ---------- 52 ---------- */
    /* ---------- 52 / 80 ---------- */
    {
      id: 'k8s-taint',
      name: 'kubectl taint',
      alias: ['污点', 'NoSchedule', 'NoExecute'],
      level: 3,
      syntax: 'kubectl taint nodes <节点名> <键>=<值>:<效果> [选项]',
      summary: '给节点打污点，用来挡住或驱逐不肯容忍它的 Pod。',
      desc: 'Taint（污点）打在节点上，Toleration（容忍）写在 Pod 上，**只有 Pod 声明了对应容忍才能调度上去**。三种效果：`NoSchedule`（不调度新 Pod）、`PreferNoSchedule`（尽量不调度）、`NoExecute`（不调度，并驱逐已运行且不容忍的 Pod）。',
      params: [
        { flag: '键=值:NoSchedule', desc: '最常用：新 Pod 不会被调度到该节点' },
        { flag: '键=值:NoExecute', desc: '**会驱逐**节点上已有且没有对应容忍的 Pod' },
        { flag: '键=值:PreferNoSchedule', desc: '软性约束，尽量不调度过去' },
        { flag: '键- 或 键:NoSchedule-', desc: '删除污点（键后加减号表示移除）' },
        { flag: '--overwrite', desc: '覆盖同名污点' }
      ],
      examples: [
        { cmd: 'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule', desc: '把某台节点留给数据库专用' },
        { cmd: 'kubectl describe node 10.0.1.11 | grep -i taint', desc: '看节点上现有的污点' },
        { cmd: 'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule-', desc: '删除污点，恢复可调度' },
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.spec.tolerations}\'', desc: '看 Pod 声明了哪些容忍' }
      ],
      notes: [
        '**`:NoExecute` 会立刻驱逐**节点上不容忍的 Pod，加之前先确认这些 Pod 有地方可去（副本数、PDB 是否够）',
        '**控制面节点自带 `node-role.kubernetes.io/control-plane:NoSchedule`**，删掉它等于让业务 Pod 跑上控制面，不建议',
        'Pod 的 toleration 只是"能忍受"，**不代表一定会调度到有污点的节点**（还要看亲和性与资源是否够）',
        'DaemonSet 想跑在所有节点（含被污染的节点）就必须在模板里加对应 toleration'
      ],
      related: ['k8s-affinity-toleration', 'k8s-drain', 'k8s-get-nodes-label', 'k8s-daemonset'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_taint/',
      tags: ['调度', '污点', '节点', '容忍']
    },

    /* ---------- 53 ---------- */
    /* ---------- 53 / 80 ---------- */
    {
      id: 'k8s-pods-by-node',
      name: 'kubectl get pods --field-selector spec.nodeName',
      alias: ['按节点查 Pod', 'nodeName', 'field-selector'],
      level: 2,
      syntax: 'kubectl get pods --field-selector spec.nodeName=<节点名> [选项]',
      summary: '筛出跑在指定节点上的所有 Pod，节点维护与故障评估必看。',
      desc: '`--field-selector` 是按对象字段做的服务端筛选（与标签无关），`spec.nodeName` 是最常用的一个。节点要重启、要下线之前，先用它把节点上的 Pod 清单拉出来评估影响面。',
      params: [
        { flag: '--field-selector spec.nodeName=<节点名>', desc: '按所在节点筛选，节点名通常是内网 IP' },
        { flag: '-A, --all-namespaces', desc: '包含系统组件，评估影响时必须加' },
        { flag: 'status.phase=Running', desc: '叠加状态条件，多个条件用逗号连接（**与关系**）' },
        { flag: '-o wide', desc: '显示 Pod IP 与节点，便于对照' }
      ],
      examples: [
        { cmd: 'kubectl get pods -A --field-selector spec.nodeName=10.0.1.23 -o wide', desc: '列出节点 10.0.1.23 上的所有 Pod（含 kube-system）' },
        { cmd: 'kubectl get pods -A --field-selector spec.nodeName=10.0.1.24,status.phase=Running', desc: '多个条件用逗号连接，只看正在运行的' },
        { cmd: 'kubectl get pods -A --field-selector spec.nodeName=10.0.1.23 --no-headers | wc -l', desc: '统计该节点上的 Pod 数量（Linux/macOS 写法）' },
        { cmd: '(kubectl get pods -A --field-selector spec.nodeName=10.0.1.23 --no-headers).Count', desc: 'Windows PowerShell 下的等价统计写法' }
      ],
      notes: [
        '字段选择器**只支持有限的字段**（`metadata.name`、`metadata.namespace`、`spec.nodeName`、`status.phase` 等），不支持任意字段',
        '**多个条件之间是"与"关系**，用逗号连接；OR 语义不支持',
        'Pod 的 `spec.nodeName` 只在调度完成后才有值，**Pending 的 Pod 这一列是空的**，不能用它查未调度的 Pod',
        '评估节点下线影响时一定要带 `-A`，否则会漏掉 `kube-system` 与 `monitoring` 里的关键组件'
      ],
      related: ['k8s-get', 'k8s-drain', 'k8s-cordon', 'k8s-troubleshoot-pending'],
      docs: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/field-selectors/',
      tags: ['调度', '节点', '筛选', '维护']
    },

    /* ---------- 54 ---------- */
    /* ---------- 54 / 80 ---------- */
    {
      id: 'k8s-affinity-toleration',
      name: '节点亲和性与污点容忍 YAML',
      kind: 'recipe',
      alias: ['nodeAffinity', 'nodeSelector', 'tolerations'],
      level: 3,
      syntax: 'spec.nodeSelector / spec.affinity.nodeAffinity / spec.tolerations',
      summary: '用 nodeSelector、亲和性与容忍，精确控制 Pod 落到哪些节点。',
      desc: '调度约束分三层：`nodeSelector` 最简单（标签精确匹配）；`nodeAffinity` 更灵活（支持 `In`/`NotIn`/`Exists` 与软硬约束）；`tolerations` 解决"节点有污点，我要被允许上去"。**硬约束（required）不满足就是 Pending，软约束（preferred）只参与打分**。',
      params: [
        { flag: 'nodeSelector', desc: '最简单的写法，键值必须完全匹配，如 `disktype: ssd`' },
        { flag: 'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution', desc: '硬约束，不满足就不调度（Pod 一直 Pending）' },
        { flag: 'affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution', desc: '软约束，带 `weight` 权重，尽量满足但不强求' },
        { flag: 'tolerations[].key / operator / effect', desc: '容忍哪条污点，`operator: Exists` 表示容忍该键的所有值' },
        { flag: 'affinity.podAntiAffinity', desc: 'Pod 反亲和，把同一服务的多个副本分散到不同节点' }
      ],
      examples: [
        { cmd: 'kubectl get nodes --show-labels | grep disktype', desc: '先确认节点上真的打了这个标签，否则硬约束一定 Pending' },
        { cmd: 'kubectl get pod batch-job-28471920-x7klm -n my-app -o yaml | grep -A15 nodeSelector', desc: '看 Pending 的 Pod 到底要求了什么条件' },
        { cmd: 'kubectl describe node 10.0.1.24 | grep -A5 Taints', desc: '确认节点的污点与 Pod 的容忍是否对得上' },
        { cmd: 'kubectl label node 10.0.1.24 disktype=ssd', desc: '给节点补上标签，让硬约束能被满足' },
        { cmd: 'kubectl get pod web-7d9c4b8f5-2xk9p -n my-app -o jsonpath=\'{.spec.affinity}\'', desc: '对照正常 Pod 的亲和性配置，看差异在哪' }
      ],
      notes: [
        '**硬约束写错一定是 Pending**，原因在 `describe pod` 的 Events 里：`didn\'t match node selector`、`node(s) had untolerated taint`',
        '`IgnoredDuringExecution` 的含义是：**调度完成后节点标签变了，已运行的 Pod 不会被赶走**',
        '标签写错最常见：`disktype` 写成 `diskType`、值大小写不一致，都会静默地匹配不上',
        'Pod 反亲和是"每个节点最多一个副本"的常用手段，但**节点数少于副本数时多余副本会 Pending**',
        '云上节点池自带的标签（如 CCE 的机型标签）可以直接拿来做亲和性，不必自己维护'
      ],
      related: ['k8s-taint', 'k8s-get-nodes-label', 'k8s-troubleshoot-pending', 'k8s-get-nodes'],
      docs: 'https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/',
      tags: ['调度', '亲和性', '容忍', 'YAML']
    },

    /* ---------- 55 ---------- */
    /* ---------- 55 / 80 ---------- */
    {
      id: 'k8s-top-node-sort',
      name: 'kubectl top node --sort-by',
      alias: ['节点资源排序', '节点负载'],
      level: 2,
      syntax: 'kubectl top node [--sort-by=cpu|memory] [选项]',
      summary: '按 CPU 或内存给节点排序，快速找出快撑不住的机器。',
      desc: '节点扩容决策的常用入口：先按内存或 CPU 排序看谁最紧张，再结合节点的已分配 requests 判断还剩多少可调度余量。注意 `top` 是**瞬时值**，只能看趋势，不能当容量依据。',
      params: [
        { flag: '--sort-by=cpu|memory', desc: '按用量排序（默认 cpu）' },
        { flag: '--no-headers', desc: '去掉表头，便于脚本处理' },
        { flag: '-l <标签选择器>', desc: '只看某类节点，如只统计工作节点' },
        { flag: 'kubectl describe node', desc: '补充查看已分配 requests/limits 的占比，**`top` 看不到这块**' }
      ],
      examples: [
        { cmd: 'kubectl top node --sort-by=memory', desc: '按内存用量从高到低排，找内存最紧张的节点' },
        { cmd: 'kubectl top node --sort-by=cpu -l node-role.kubernetes.io/worker=', desc: '只看工作节点的 CPU 排名' },
        { cmd: 'kubectl describe node 10.0.1.23 | grep -A10 -i "allocated resources"', desc: '看这台节点已分配的 requests 与剩余可分配量' },
        { cmd: 'kubectl top pod -A --sort-by=cpu | head -10', desc: '下钻一步：看是哪些 Pod 在消耗这台节点的资源' }
      ],
      notes: [
        '报 `Metrics API not available` 是 metrics-server 未就绪，**不是节点有问题**',
        '**`top` 是瞬时采样（约 15 秒粒度）**，用来看趋势可以，拿来做容量规划不可靠',
        'CPU 实际用量低不代表没压力：**`requests` 被占满时新 Pod 照样调度不上去**，必须看节点的已分配资源',
        '较新的 kubectl 版本里 `describe node` 的资源段落格式有调整，grep 不到时可改用 `kubectl get node <节点名> -o yaml` 查看 capacity 与 allocatable'
      ],
      related: ['k8s-top', 'k8s-troubleshoot-node-notready', 'k8s-troubleshoot-pending', 'k8s-get-nodes'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_top/',
      tags: ['资源', '节点', '监控', '扩容']
    },

    /* ---------- 56 ---------- */
    /* ---------- 56 / 80 ---------- */
    {
      id: 'k8s-pdb',
      name: 'PodDisruptionBudget（PDB）',
      alias: ['pdb', '中断预算', 'minAvailable'],
      level: 3,
      syntax: 'apiVersion: policy/v1   kind: PodDisruptionBudget',
      summary: '限制自愿驱逐时最多能停几个 Pod，保证维护期间服务不断。',
      desc: 'PDB 不阻止 Pod 故障，它约束的是**自愿中断**（`kubectl drain`、节点池缩容、集群升级）。写法两种：`minAvailable`（至少留几个可用）或 `maxUnavailable`（最多允许几个不可用），**二选一**。它是"节点维护不把服务打挂"的关键保险。',
      params: [
        { flag: 'minAvailable', desc: '至少保持可用的 Pod 数或百分比，如 `1` 或 `50%`' },
        { flag: 'maxUnavailable', desc: '最多允许多少个不可用；与 `minAvailable` 二选一' },
        { flag: 'selector.matchLabels', desc: '选中要保护的那批 Pod' },
        { flag: 'ALLOWED DISRUPTIONS', desc: '`kubectl get pdb` 的这一列表示当前还允许驱逐几个' }
      ],
      examples: [
        { cmd: 'kubectl get pdb -n my-app', desc: '看 ALLOWED DISRUPTIONS 是不是 0：是 0 说明现在一个都不能驱逐' },
        { cmd: 'kubectl describe pdb web-pdb -n my-app', desc: '看期望/当前健康副本数与预算状态' },
        { cmd: 'kubectl drain 10.0.1.23 --ignore-daemonsets --dry-run=client', desc: '维护前预演，PDB 会挡住不允许驱逐的 Pod' },
        { cmd: 'kubectl get pdb -A', desc: '全集群看哪些服务配了保护，排查"drain 卡住"时先看这个' }
      ],
      notes: [
        '**`minAvailable` 配得太大（如等于副本数）会让 `drain` 永远卡住**，节点维护无法进行，只能临时调低或删掉 PDB',
        'PDB **只约束自愿中断**，节点宕机、进程崩溃这类非自愿中断它管不了',
        '**没有副本冗余时 PDB 意义有限**：只有 1 个副本时 `minAvailable: 1` 会让驱逐直接卡死',
        '`drain` 报 `Cannot evict pod as it would violate the pod\'s disruption budget` 就是这个原因，先看 `kubectl get pdb`'
      ],
      related: ['k8s-drain', 'k8s-cordon', 'k8s-scale', 'k8s-deployment'],
      docs: 'https://kubernetes.io/docs/tasks/run-application/configure-pdb/',
      tags: ['可用性', 'PDB', '驱逐', '维护']
    },

    /* ---------- 57 ---------- */
    /* ---------- 57 / 80 ---------- */
    {
      id: 'k8s-get-nodes-label',
      name: 'kubectl get nodes -l',
      alias: ['节点标签筛选', '节点选择器'],
      level: 2,
      syntax: 'kubectl get nodes -l <标签选择器> [选项]',
      summary: '按标签筛选节点，确认调度约束到底能不能被满足。',
      desc: 'Pod 因 `nodeSelector`/亲和性 Pending 时，第一件事就是用同一个标签条件查节点——**要么标签根本没打，要么值写错了**。也可以用它按机型、可用区、节点池给节点分组，给扩容和排障提供依据。',
      params: [
        { flag: '-l 键=值', desc: '精确匹配，如 `-l disktype=ssd`' },
        { flag: '--show-labels', desc: '显示每个节点的全部标签，构造选择器前先看一眼真实键名' },
        { flag: '-l <键>', desc: '只写键名表示"存在该标签"，`-l \'!<键>\'` 表示不存在' },
        { flag: '-o custom-columns', desc: '只输出关心的列，节点多时更清晰' }
      ],
      examples: [
        { cmd: 'kubectl get nodes -l disktype=ssd -o wide', desc: '确认有哪些节点带这个标签，硬约束 Pending 时必查' },
        { cmd: 'kubectl get nodes --show-labels', desc: '看全部标签，构造选择器前先核对真实键名' },
        { cmd: 'kubectl get nodes -l node.kubernetes.io/instance-type=c6.large.2', desc: '按机型标签筛选节点（CCE 节点池会自动打上）' },
        { cmd: 'kubectl get nodes -l topology.kubernetes.io/zone=cn-north-4a', desc: '按可用区找节点，云盘挂不上时经常要核对这一项' }
      ],
      notes: [
        '**标签选择器写错不会报错，只会返回空列表**，然后 Pod 就一直 Pending —— 这是排查时最容易走弯路的地方',
        '`-l` 是标签筛选，`--field-selector` 是字段筛选，**两者不能混在同一个条件里**',
        '云厂商的节点标签键含域名前缀，抄的时候小心漏字符（如 `topology.kubernetes.io/zone`）',
        '节点标签是集群内的元数据，**不代表云主机的真实规格**，扩容前在控制台再确认一次'
      ],
      related: ['k8s-affinity-toleration', 'k8s-taint', 'k8s-get-nodes', 'k8s-troubleshoot-pending'],
      docs: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/',
      tags: ['节点', '标签', '调度']
    },

    /* ==================== H. RBAC 与安全 ==================== */

    /* ---------- 58 ---------- */
    /* ---------- 58 / 80 ---------- */
    {
      id: 'k8s-rbac-role',
      name: 'Role / RoleBinding',
      alias: ['rbac', 'rolebinding', '命名空间授权'],
      level: 3,
      syntax: 'apiVersion: rbac.authorization.k8s.io/v1   kind: Role | RoleBinding',
      summary: '命名空间内的权限组合：Role 定义能做什么，RoleBinding 授权给谁。',
      desc: 'Role 是"权限清单"（对哪些资源能做哪些动作），RoleBinding 是"授权关系"（把 Role 给某个用户、组或 ServiceAccount）。**只创建 Role 不绑定等于没授权**，这是 RBAC 排查的第一原则。两者的作用范围都只限本命名空间。',
      params: [
        { flag: 'rules[].apiGroups / resources / verbs', desc: '三要素：哪个 API 组、哪些资源、哪些动作（get/list/create/delete 等）' },
        { flag: 'roleRef', desc: 'RoleBinding 里指向被授予的 Role，**创建后不可修改**' },
        { flag: 'subjects[].kind', desc: '`User` / `Group` / `ServiceAccount`（写 SA 时必须带 namespace）' },
        { flag: 'resourceNames', desc: '限定只对某几个具体对象生效，**不能与 list/create 混用**' },
        { flag: 'kubectl auth can-i --list', desc: '配套命令：看某个身份在这个命名空间里到底有什么权限' }
      ],
      examples: [
        { cmd: 'kubectl get role,rolebinding -n my-app', desc: '先看这个命名空间里有哪些现成的角色与绑定' },
        { cmd: 'kubectl describe role pod-reader -n my-app', desc: '看这个角色到底允许哪些动作' },
        { cmd: 'kubectl create role pod-reader --verb=get,list,watch --resource=pods -n my-app --dry-run=client -o yaml', desc: '生成 Role 的 YAML 骨架，改完再 apply' },
        { cmd: 'kubectl create rolebinding pod-reader-bind --role=pod-reader --serviceaccount=my-app:app-sa -n my-app', desc: '把 Role 绑给一个 ServiceAccount（**少这一步授权不生效**）' },
        { cmd: 'kubectl auth can-i get pods --as=system:serviceaccount:my-app:app-sa -n my-app', desc: '验证绑定后权限是否真的生效' }
      ],
      notes: [
        '**`roleRef` 不可修改**，想换 Role 必须删掉 RoleBinding 重建',
        '**只建 Role 不建 RoleBinding 是最常见的"配了没权限"**，两者必须成对出现',
        '授予 `create pods` 基本等于给了该命名空间里的较高权限（能起特权容器、挂载宿主机目录），不要随手给',
        '排查 Forbidden 的标准动作：`kubectl auth can-i --list --as=<身份> -n <命名空间>`，把这个身份究竟有什么看清'
      ],
      related: ['k8s-rbac-clusterrole', 'k8s-auth-can-i', 'k8s-create-serviceaccount', 'k8s-auth-reconcile'],
      docs: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/',
      tags: ['RBAC', '权限', 'Role', '命名空间']
    },

    /* ---------- 59 ---------- */
    /* ---------- 59 / 80 ---------- */
    {
      id: 'k8s-rbac-clusterrole',
      name: 'ClusterRole / ClusterRoleBinding',
      alias: ['clusterrole', '集群级权限', 'cluster-admin'],
      level: 3,
      syntax: 'apiVersion: rbac.authorization.k8s.io/v1   kind: ClusterRole | ClusterRoleBinding',
      summary: '集群级权限：覆盖所有命名空间，也能授权节点等集群级资源。',
      desc: 'ClusterRole 的规则写法与 Role 一样，区别在作用范围：**ClusterRoleBinding 是全局授权（所有命名空间生效）**；而用 RoleBinding 去引用 ClusterRole，则只在单个命名空间内生效——这是"定义一次、多处复用"的常见技巧。',
      params: [
        { flag: 'ClusterRoleBinding', desc: '全局生效，**影响面最大，谨慎使用**' },
        { flag: 'RoleBinding + ClusterRole', desc: '只在本命名空间生效，推荐的做法' },
        { flag: 'resources: [nodes, persistentvolumes]', desc: '集群级资源只能用 ClusterRole 授权，Role 里写 `nodes` 不生效' },
        { flag: 'aggregationRule', desc: '聚合规则，用标签把多个 ClusterRole 合并（内置 `admin`/`edit`/`view` 就是这么做的）' },
        { flag: 'kubectl auth can-i <动作> <资源>', desc: '不加 `-n` 即为集群级权限检查' }
      ],
      examples: [
        { cmd: 'kubectl get clusterrole | grep -i node', desc: '找与节点相关的内置集群角色' },
        { cmd: 'kubectl describe clusterrole view', desc: '看内置只读角色包含哪些资源，可直接绑定复用' },
        { cmd: 'kubectl get clusterrolebinding -o wide | grep app-sa', desc: '确认某个 SA 有没有被全局授权' },
        { cmd: 'kubectl auth can-i get nodes --as=system:serviceaccount:my-app:app-sa', desc: '验证集群级权限（不加 `-n` 就是集群级检查）' }
      ],
      notes: [
        '**ClusterRoleBinding 会让权限在所有命名空间生效**，比 RoleBinding 危险得多，能用 RoleBinding 就别用 ClusterRoleBinding',
        '内置角色 `cluster-admin` 权限等于集群管理员，**授出去之前务必确认业务真的需要**',
        '集群级资源（Node、PV、Namespace、CRD）**只能用 ClusterRole 授权**，Role 里写 `nodes` 是不生效的',
        '删 ServiceAccount 不会清理绑定，会留下悬空的 subject，定期巡检 `clusterrolebinding` 有必要'
      ],
      related: ['k8s-rbac-role', 'k8s-auth-can-i', 'k8s-auth-whoami', 'k8s-get-nodes'],
      docs: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/',
      tags: ['RBAC', 'ClusterRole', '集群级', '安全']
    },

    /* ---------- 60 ---------- */
    /* ---------- 60 / 80 ---------- */
    {
      id: 'k8s-auth-reconcile',
      name: 'kubectl auth reconcile',
      alias: ['rbac 交付', '权限对账'],
      level: 3,
      syntax: 'kubectl auth reconcile -f <RBAC清单> [选项]',
      summary: '幂等地应用 RBAC 清单，自动补齐缺失的规则与授权关系。',
      desc: '用 `apply` 直接更新 Role/ClusterRole 时，如果这个角色是被聚合或由控制器创建的，修改可能被拒绝或产生冲突。`auth reconcile` 会按"期望状态"对齐规则，**缺什么补什么，可反复执行**，是交付 RBAC 清单的推荐方式。',
      params: [
        { flag: '-f <文件>', desc: 'RBAC 清单（Role / ClusterRole / RoleBinding / ClusterRoleBinding）' },
        { flag: '--dry-run=client', desc: '只显示会做什么改动，不实际提交' },
        { flag: '--remove-extra-permissions', desc: '删掉清单里没有的权限（**默认只增不减**）' },
        { flag: '--remove-extra-subjects', desc: '删掉清单里没有的授权对象' }
      ],
      examples: [
        { cmd: 'kubectl auth reconcile -f rbac.yaml --dry-run=client', desc: '先看会补哪些权限，确认无误再执行' },
        { cmd: 'kubectl auth reconcile -f rbac.yaml', desc: '实际应用 RBAC 清单，幂等、可重复执行' },
        { cmd: 'kubectl auth reconcile -f rbac.yaml --remove-extra-permissions --remove-extra-subjects', desc: '严格对齐：多出来的权限与授权对象一并清理' },
        { cmd: 'kubectl auth can-i --list --as=system:serviceaccount:my-app:app-sa -n my-app', desc: '对账完成后验证该身份的最终权限' }
      ],
      notes: [
        '**默认只增不减**：清单里去掉的权限不会自动从集群删除，想真正收敛必须加 `--remove-extra-permissions`',
        '`roleRef` 依然不可变，改动绑定关系仍要删掉重建',
        '执行前先在 `--dry-run=client` 下确认影响范围，涉及 `cluster-admin` 这类高权限角色时尤其要小心',
        '把 RBAC 清单纳入 Git 并用它交付，比在控制台点选更可追溯、更不容易漏'
      ],
      related: ['k8s-rbac-role', 'k8s-rbac-clusterrole', 'k8s-apply', 'k8s-diff'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_reconcile/',
      tags: ['RBAC', '交付', '幂等']
    },

    /* ---------- 61 ---------- */
    /* ---------- 61 / 80 ---------- */
    {
      id: 'k8s-auth-whoami',
      name: 'kubectl auth whoami',
      alias: ['当前身份', '我是谁'],
      level: 3,
      syntax: 'kubectl auth whoami [-o yaml]',
      summary: '查看当前 kubectl 是以什么身份访问集群，排查权限前先确认。',
      desc: '报 Forbidden 时第一个该问的问题就是"我现在是谁"。它把 kubeconfig 里那串证书或令牌解析成可读的身份信息（用户名、所属组），比翻 kubeconfig 文件直观得多。',
      params: [
        { flag: '-o yaml', desc: '输出用户名、UID、组与额外信息' },
        { flag: '--as=<身份>', desc: '以别人的身份查询（需要 impersonate 权限）' },
        { flag: 'kubectl config current-context', desc: '配套使用，同时确认"连的是哪个集群"' },
        { flag: 'kubectl auth can-i --list', desc: '拿到身份后紧接着看它到底有哪些权限' }
      ],
      examples: [
        { cmd: 'kubectl auth whoami', desc: '确认当前身份，CCE 上通常是 IAM 用户或集群管理员证书' },
        { cmd: 'kubectl auth whoami -o yaml', desc: '看完整信息：用户名与所属组' },
        { cmd: 'kubectl config current-context && kubectl auth whoami', desc: '一条命令同时确认集群与身份，动手前的好习惯' },
        { cmd: 'kubectl auth can-i --list -n my-app', desc: '紧接一步看这个身份在命名空间里的权限清单' }
      ],
      notes: [
        '**该命令需要 kubectl 1.27 及以上版本**，老版本会提示未知命令，可用 `kubectl auth can-i --list` 代替',
        '身份显示为 `system:serviceaccount:<命名空间>:<SA名>` 说明用的是 SA 令牌，**权限来自绑定到它的 RBAC**',
        '身份是 IAM 用户或 x509 证书时，权限可能来自 CCE 的 IAM 授权或集群内的集群角色绑定，两条链路都要查',
        '只看身份不够，还要看它被授了什么：`kubectl auth whoami` 之后紧跟 `kubectl auth can-i --list`'
      ],
      related: ['k8s-auth-can-i', 'k8s-config', 'k8s-rbac-role', 'k8s-cce-kubeconfig'],
      docs: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_whoami/',
      tags: ['RBAC', '身份', '排错']
    },

    /* ---------- 62 ---------- */
    /* ---------- 62 / 80 ---------- */
    {
      id: 'k8s-sa-token',
      name: 'ServiceAccount 令牌与身份安全',
      kind: 'recipe',
      alias: ['automountServiceAccountToken', '投射令牌', 'sa 令牌'],
      level: 3,
      syntax: 'spec.automountServiceAccountToken: false   /   kubectl create token <SA>',
      summary: '讲清 Pod 里的令牌从哪来、怎么用、怎么避免被滥用。',
      desc: '默认每个 Pod 都会在 `/var/run/secrets/kubernetes.io/serviceaccount/` 下挂一个投射令牌（有有效期、会轮转）。集群外要访问集群时，则用 `kubectl create token` 现取一个。**令牌只证明"你是谁"，权限仍然来自 RBAC 绑定**。',
      params: [
        { flag: 'automountServiceAccountToken: false', desc: '在 Pod 或 SA 上关闭自动挂载，减少令牌泄露面' },
        { flag: '/var/run/secrets/kubernetes.io/serviceaccount/token', desc: '容器内的令牌路径，`ca.crt` 与 `namespace` 也在同目录' },
        { flag: 'kubectl create token <SA> --duration=1h', desc: '为集群外场景现取一个有时效的令牌' },
        { flag: 'imagePullSecrets', desc: '挂在 SA 上，Pod 就不必逐个声明镜像拉取凭证' },
        { flag: 'serviceAccountName', desc: '在 Pod 的 spec 里指定用哪个 SA；不写就是 `default`' }
      ],
      examples: [
        { cmd: 'kubectl exec web-7d9c4b8f5-2xk9p -n my-app -- ls /var/run/secrets/kubernetes.io/serviceaccount/', desc: '看容器内的令牌、CA 证书与命名空间文件' },
        { cmd: 'kubectl exec web-7d9c4b8f5-2xk9p -n my-app -- cat /var/run/secrets/kubernetes.io/serviceaccount/namespace', desc: '确认 Pod 拿到的命名空间身份（这个文件不含凭据，可以安全查看）' },
        { cmd: 'kubectl get pod web-7d9c4b8f5-2xk9p -n my-app -o jsonpath=\'{.spec.serviceAccountName}\'', desc: '看这个 Pod 用的是哪个 SA' },
        { cmd: 'kubectl auth can-i get pods --as=system:serviceaccount:my-app:default -n my-app', desc: '确认 default SA 到底有没有权限（通常是 no）' }
      ],
      notes: [
        '**令牌泄露等于身份被盗用**：不要把 `token` 文件的内容打印到日志、工单或聊天里，排查时确认文件存在即可',
        'Pod 用不到 API 访问能力时，**设 `automountServiceAccountToken: false`** 是最省事的加固',
        '令牌有有效期并随投射卷轮转，**不要把它复制到镜像或配置文件里长期使用**',
        '拿到令牌不等于拿到权限：**必须再确认 Role/ClusterRoleBinding**，否则一样是 Forbidden',
        '**删 SA 或改绑定后，已签发的令牌不会立刻失效**，权限校验仍以每次请求时的绑定为准'
      ],
      related: ['k8s-create-token', 'k8s-create-serviceaccount', 'k8s-rbac-role', 'k8s-auth-can-i'],
      docs: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/',
      tags: ['ServiceAccount', '令牌', '安全', '加固']
    },

    /* ---------- 63 ---------- */
    /* ---------- 63 / 80 ---------- */
    {
      id: 'k8s-networkpolicy',
      name: 'NetworkPolicy 基础',
      kind: 'recipe',
      alias: ['网络策略', 'pod 隔离'],
      level: 4,
      syntax: 'apiVersion: networking.k8s.io/v1   kind: NetworkPolicy',
      summary: '给 Pod 加上像安全组一样的网络访问规则，默认拒绝更安全。',
      desc: '默认情况下集群内所有 Pod 可以互访，NetworkPolicy 是唯一的隔离手段：**一旦某个 Pod 被策略选中，它就在被选中的方向上变成"默认拒绝"，只放行规则里写明的流量**。注意它需要网络插件支持（Calico/Cilium 支持，部分简单插件不支持，写了也不生效）。',
      params: [
        { flag: 'podSelector', desc: '策略作用于哪些 Pod（`{}` 表示命名空间内全部 Pod）' },
        { flag: 'policyTypes: [Ingress, Egress]', desc: '控制方向，**入站与出站要分别声明**' },
        { flag: 'ingress[].from', desc: '允许哪些来源：`podSelector` / `namespaceSelector` / `ipBlock`' },
        { flag: 'egress[].to + ports', desc: '允许访问哪些目标与端口；**限制出站后必须显式放行 DNS**' },
        { flag: 'namespaceSelector + podSelector', desc: '写在同一个 `from` 元素里是"与"关系，分成两个元素才是"或"' }
      ],
      examples: [
        { cmd: 'kubectl get networkpolicy -n my-app', desc: '看命名空间里有没有策略在生效' },
        { cmd: 'kubectl describe networkpolicy allow-web -n my-app', desc: '看它选了哪些 Pod、放行了哪些方向' },
        { cmd: 'kubectl get pods -n my-app --show-labels', desc: '策略是用标签选 Pod 的，先确认标签对不对' },
        { cmd: 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- nslookup cache-prod-01', desc: '验证放行后 DNS 与后端连通性是否恢复' },
        { cmd: 'kubectl get pods -n kube-system', desc: '确认网络插件类型，判断 NetworkPolicy 到底支不支持' }
      ],
      notes: [
        '**写了 NetworkPolicy 不等于生效**：网络插件不支持时它只是躺在 etcd 里，先确认集群用的插件',
        '**限制了 egress 却忘了放行 DNS（UDP/TCP 53）会表现为"域名解析不了"**，这是最常见的自伤',
        '策略是叠加的：多条策略的允许规则取并集，**只要有一条允许就通**',
        '**默认拒绝要用"选中全部 Pod 且什么都不放行"的策略实现**，只写一条放行规则并不会让其他流量被拒绝',
        '华为云 CCE 不同网络模型对 NetworkPolicy 的支持程度不同，使用前先确认集群的网络模型'
      ],
      related: ['k8s-troubleshoot-svc', 'k8s-exec-dns', 'k8s-endpointslices', 'k8s-troubleshoot-pod'],
      docs: 'https://kubernetes.io/docs/concepts/services-networking/network-policies/',
      tags: ['网络', 'NetworkPolicy', '安全', '隔离']
    },

    /* ==================== I. 集群运维（kubeadm / etcd / crictl） ==================== */

    /* ---------- 64 ---------- */
    /* ---------- 64 / 80 ---------- */
    {
      id: 'k8s-kubeadm-init',
      name: 'kubeadm init',
      alias: ['初始化集群', '搭建 master'],
      level: 4,
      syntax: 'kubeadm init [--pod-network-cidr=<网段>] [--control-plane-endpoint=<地址>]',
      summary: '初始化控制面节点，把一台 Linux 机器变成集群的 Master。',
      desc: '自建集群的第一步：装好容器运行时与 kubelet 后，用它拉起 etcd、apiserver、controller-manager、scheduler 与 CoreDNS。**执行前要确认五件事：主机名、/etc/hosts、时间同步、swap 已关闭、容器运行时已就绪**，任一项不对都会卡住。',
      params: [
        { flag: '--pod-network-cidr=10.244.0.0/16', desc: 'Pod 网段，**必须与之后安装的网络插件一致**（Calico 默认 192.168.0.0/16）' },
        { flag: '--apiserver-advertise-address=<IP>', desc: '多网卡机器上指定 API Server 对外地址' },
        { flag: '--image-repository=<镜像源>', desc: '国内拉不到官方镜像时换镜像源，如 `registry.aliyuncs.com/google_containers`' },
        { flag: '--kubernetes-version=v1.29.0', desc: '指定版本，避免装到不期望的版本' },
        { flag: '--control-plane-endpoint=<VIP或域名>', desc: '高可用集群必须指定，便于后续加控制面节点' }
      ],
      examples: [
        { cmd: 'kubeadm init --pod-network-cidr=10.244.0.0/16 --image-repository=registry.aliyuncs.com/google_containers', desc: '国内环境最常用的初始化命令' },
        { cmd: 'kubeadm init --control-plane-endpoint=10.0.1.11:6443 --upload-certs --pod-network-cidr=10.244.0.0/16', desc: '高可用控制面，并上传证书供后续节点加入' },
        { cmd: 'mkdir -p $HOME/.kube && cp -i /etc/kubernetes/admin.conf $HOME/.kube/config', desc: '初始化后配置 kubeconfig，否则 kubectl 用不了' },
        { cmd: 'kubectl get pods -n kube-system', desc: '确认控制面组件都起来了（CoreDNS 要等网络插件就绪才会 Running）' }
      ],
      notes: [
        '**`kubeadm init` 会重置该机器的容器运行时与 kubelet 配置**，不要在已有业务的机器上执行',
        '**swap 必须关闭**（`swapoff -a` 并在 `/etc/fstab` 里注释掉），否则 kubelet 直接起不来',
        '`--pod-network-cidr` 一旦确定**不要改**：与网络插件配置不一致会导致 Pod 之间完全不通',
        '初始化完成后输出的 `kubeadm join` 命令与 token **只显示一次**，务必保存；token 默认 24 小时后过期',
        '中途失败要重来，先 `kubeadm reset` 清干净再执行，否则会出现各种端口与配置冲突',
        '华为云 CCE 集群由托管控制面提供，**不需要也不允许执行 kubeadm init**；这条命令只用于自建集群'
      ],
      related: ['k8s-kubeadm-join', 'k8s-kubeadm-token', 'k8s-kubeadm-reset', 'k8s-cce-kubeconfig'],
      docs: 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/',
      tags: ['kubeadm', '自建集群', '控制面', '安装']
    },

    /* ---------- 65 ---------- */
    /* ---------- 65 / 80 ---------- */
    {
      id: 'k8s-kubeadm-join',
      name: 'kubeadm join',
      alias: ['节点加入集群', '扩容节点'],
      level: 4,
      syntax: 'kubeadm join <控制面地址> --token <令牌> --discovery-token-ca-cert-hash sha256:<哈希>',
      summary: '把工作节点加入已有集群，是自建集群扩容的标准动作。',
      desc: '在新节点上装好 kubelet 与容器运行时后执行。join 需要两个凭据：**引导令牌（bootstrap token，默认 24 小时过期）**与**控制面 CA 证书哈希**。加入成功后节点会从 NotReady 变成 Ready（要等 CNI 插件就绪）。',
      params: [
        { flag: '--token <令牌>', desc: '引导令牌，过期后用 `kubeadm token create` 重新生成' },
        { flag: '--discovery-token-ca-cert-hash sha256:<哈希>', desc: '校验控制面身份，**不能省**' },
        { flag: '--control-plane', desc: '加入为控制面节点，需要额外提供 `--certificate-key`' },
        { flag: '--node-labels=', desc: '加入时直接打标签，便于后续调度' },
        { flag: '--cri-socket=', desc: '机器上有多个容器运行时时指定，如 `unix:///run/containerd/containerd.sock`' }
      ],
      examples: [
        { cmd: 'kubeadm join 10.0.1.11:6443 --token abcdef.0123456789abcdef --discovery-token-ca-cert-hash sha256:<控制面CA证书哈希>', desc: '工作节点加入集群的标准命令' },
        { cmd: 'kubeadm join 10.0.1.11:6443 --token abcdef.0123456789abcdef --discovery-token-ca-cert-hash sha256:<控制面CA证书哈希> --node-labels=disktype=ssd', desc: '加入时顺便打标签，省得之后再 label' },
        { cmd: 'kubectl get nodes -w', desc: '在控制面机器上盯着，看新节点出现并变为 Ready' },
        { cmd: 'kubectl get pods -n kube-system -o wide | grep 10.0.1.24', desc: '确认新节点上的网络插件等 DaemonSet 已就绪' }
      ],
      notes: [
        '**token 默认 24 小时过期**，报 `token is expired` 就去控制面重新生成，不需要重新 init',
        '`--discovery-token-ca-cert-hash` 必须与控制面一致，**漏写或写错会直接拒绝加入**（这是安全设计）',
        '节点加入后长时间 NotReady，**九成是 CNI 网络插件没就绪**，或容器运行时与内核转发参数没配好',
        '节点名默认取主机名，**重名会导致加入失败**，克隆虚拟机时务必先改主机名',
        '加入的节点时间必须与控制面同步（NTP），偏差过大会导致证书校验失败'
      ],
      related: ['k8s-kubeadm-init', 'k8s-kubeadm-token', 'k8s-get-nodes', 'k8s-troubleshoot-node-notready'],
      docs: 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/',
      tags: ['kubeadm', '扩容', '工作节点', '加入集群']
    },

    /* ---------- 66 ---------- */
    /* ---------- 66 / 80 ---------- */
    {
      id: 'k8s-kubeadm-token',
      name: 'kubeadm token create --print-join-command',
      alias: ['重新生成加入命令', 'join 命令过期'],
      level: 3,
      syntax: 'kubeadm token create --print-join-command [--ttl=<时长>]',
      summary: '重新生成引导令牌并直接打印可用的加入命令，扩容时最省事。',
      desc: '`kubeadm init` 输出的 join 命令只有一次机会，24 小时后令牌就过期了。这条命令会**重新生成令牌并把完整 join 命令（含 CA 证书哈希）打印出来**，复制到新节点执行即可。',
      params: [
        { flag: 'create --print-join-command', desc: '生成新令牌并输出完整 join 命令' },
        { flag: 'list', desc: '列出当前有效令牌与过期时间' },
        { flag: 'delete <令牌>', desc: '吊销某个令牌' },
        { flag: '--ttl=0', desc: '生成永不过期的令牌（**不推荐**）' },
        { flag: '--certificate-key', desc: '加入控制面节点时需要的证书密钥，`init --upload-certs` 时生成，默认 2 小时过期' }
      ],
      examples: [
        { cmd: 'kubeadm token create --print-join-command', desc: '最常用：在控制面节点上重新拿一条完整加入命令' },
        { cmd: 'kubeadm token list', desc: '看现有令牌还有多久过期，判断要不要重新生成' },
        { cmd: 'kubeadm token delete abcdef.0123456789abcdef', desc: '节点被回收时吊销它的令牌' },
        { cmd: 'kubeadm token create --print-join-command --ttl=2h', desc: '指定有效期的令牌（默认 24h）' }
      ],
      notes: [
        '**输出里包含加入集群的凭据**，不要贴到公开渠道或工单里',
        '`--ttl=0` 生成的永久令牌长期有效，**等于把集群入口一直敞着**，只在受控环境使用',
        '令牌只用于加入节点，**不代表拿到令牌就能升级、删除节点**，节点身份由 kubelet 证书单独管理',
        '加入控制面节点还需要 `--certificate-key`（默认 2 小时过期），过期后要用 `kubeadm init phase upload-certs --upload-certs` 重新上传'
      ],
      related: ['k8s-kubeadm-join', 'k8s-kubeadm-init', 'k8s-get-nodes'],
      docs: 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-token/',
      tags: ['kubeadm', '令牌', '扩容']
    },

    /* ---------- 67 ---------- */
    /* ---------- 67 / 80 ---------- */
    {
      id: 'k8s-kubeadm-upgrade',
      name: 'kubeadm upgrade plan',
      alias: ['集群升级', '版本升级'],
      level: 4,
      syntax: 'kubeadm upgrade plan   |   kubeadm upgrade apply <版本>',
      summary: '查看集群可升级到的版本与组件，是升级动作前的第一步。',
      desc: 'kubeadm 集群升级是**逐个小版本**推进的（1.28→1.29→1.30，不能跳版本），顺序固定：先控制面、再 kubelet 与 kubectl、最后逐个工作节点。`plan` 只做检查与展示，不改动任何东西。',
      params: [
        { flag: 'kubeadm upgrade plan', desc: '列出可升级版本与需要人工处理的组件（CoreDNS、kube-proxy 等）' },
        { flag: 'kubeadm upgrade apply v1.29.0', desc: '真正升级控制面，**会逐个重启控制面组件**' },
        { flag: 'kubeadm upgrade node', desc: '在工作节点上执行，升级该节点的 kubelet 配置' },
        { flag: 'kubectl drain / uncordon', desc: '升级工作节点前后必须配套使用' }
      ],
      examples: [
        { cmd: 'kubeadm upgrade plan', desc: '升级前确认目标版本与组件兼容性' },
        { cmd: 'kubeadm upgrade apply v1.29.0', desc: '升级控制面（**执行前必须先备份 etcd**）' },
        { cmd: 'kubectl drain 10.0.1.24 --ignore-daemonsets --delete-emptydir-data', desc: '升级工作节点前先驱逐 Pod' },
        { cmd: 'kubeadm upgrade node', desc: '在工作节点上执行，之后升级 kubelet/kubectl 包并重启 kubelet，最后 uncordon' }
      ],
      notes: [
        '**升级不可逆，动手前必须备份 etcd**（`etcdctl snapshot save`），这是唯一的回退手段',
        '**不能跨次版本升级**（1.28 不能直接到 1.30），必须一个小版本一个小版本走',
        '升级前确认 kubelet、kubectl、容器运行时版本都在官方支持的偏差范围内',
        '工作节点升级顺序：`drain` → `kubeadm upgrade node` → 升级 kubelet/kubectl 包 → 重启 kubelet → `uncordon`',
        '华为云 CCE 托管集群的版本升级在控制台或 API 一键完成，**不需要手工执行 kubeadm upgrade**'
      ],
      related: ['k8s-etcdctl-snapshot-save', 'k8s-drain', 'k8s-cordon', 'k8s-version'],
      docs: 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade/',
      tags: ['kubeadm', '升级', '版本', '维护']
    },

    /* ---------- 68 ---------- */
    /* ---------- 68 / 80 ---------- */
    {
      id: 'k8s-kubeadm-reset',
      name: 'kubeadm reset',
      alias: ['重置节点', '节点退群'],
      level: 4,
      syntax: 'kubeadm reset [--cri-socket=<socket>] [--force]',
      summary: '把节点从集群里摘掉并清空本地配置，重装或下线节点时用。',
      desc: '它会停掉 kubelet、清空 `/etc/kubernetes` 与本地 etcd 数据、删除 CNI 配置与 iptables 规则。**在控制面节点上执行等于销毁这个集群的控制面**，在工作节点上执行则是彻底退群。重做实验环境常用，生产上要极其谨慎。',
      params: [
        { flag: '--cri-socket=unix:///run/containerd/containerd.sock', desc: '容器运行时 socket，机器上有多个运行时必填' },
        { flag: '--force', desc: '跳过交互确认，脚本里用（**更容易误操作**）' },
        { flag: '--skip-phases=remove-etcd-member', desc: '跳过某些清理阶段，如保留 etcd 成员信息' },
        { flag: '配套手工清理', desc: '`rm -rf /etc/cni/net.d $HOME/.kube`，并清理 iptables 规则' }
      ],
      examples: [
        { cmd: 'kubeadm reset', desc: '把当前节点从集群中彻底摘除（**会删除本机 etcd 数据**）' },
        { cmd: 'kubeadm reset --cri-socket=unix:///run/containerd/containerd.sock', desc: 'containerd 环境下的写法' },
        { cmd: 'rm -rf /etc/cni/net.d $HOME/.kube && iptables -F && iptables -t nat -F', desc: 'reset 后的残留清理，重装前建议执行' },
        { cmd: 'kubectl delete node 10.0.1.24', desc: '在控制面上把已下线的节点对象删掉，否则 `get nodes` 里会一直留着它' }
      ],
      notes: [
        '**在控制面节点执行 `kubeadm reset` 会销毁整个集群**，执行前务必确认当前主机的角色',
        '**reset 会删除本机 etcd 数据目录**，没有快照就再也恢复不了，动手前先确认备份',
        '节点从集群移除后，**要在控制面执行 `kubectl delete node`**，否则会留下 NotReady 的僵尸节点',
        '被 reset 的节点上原有的 Pod 数据（emptyDir、本地盘）一并消失，有状态服务要先迁走',
        '清理后想重新加入集群，建议先重装 kubelet 配置，带着残留配置直接 `kubeadm join` 可能失败'
      ],
      related: ['k8s-kubeadm-join', 'k8s-kubeadm-init', 'k8s-delete', 'k8s-drain'],
      docs: 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/',
      tags: ['kubeadm', '重置', '危险', '下线']
    },

    /* ---------- 69 ---------- */
    /* ---------- 69 / 80 ---------- */
    {
      id: 'k8s-etcdctl-snapshot-save',
      name: 'etcdctl snapshot save',
      alias: ['etcd 备份', '集群备份'],
      level: 4,
      syntax: 'etcdctl snapshot save <备份文件> --endpoints=<地址> --cacert=... --cert=... --key=...',
      summary: '备份 etcd 数据快照，是整个自建集群唯一可靠的兜底手段。',
      desc: 'etcd 存着集群的全部状态（所有对象的定义）。**集群升级、大规模变更、故障恢复前都应该先做快照**。快照是热备、不中断服务，但要注意：恢复时只能回到快照那一刻，之后创建的资源都会丢。',
      params: [
        { flag: 'snapshot save <文件>', desc: '把快照保存到指定路径' },
        { flag: '--endpoints=https://127.0.0.1:2379', desc: 'etcd 访问地址' },
        { flag: '--cacert / --cert / --key', desc: '客户端证书三件套，kubeadm 集群在 `/etc/kubernetes/pki/etcd/` 下' },
        { flag: 'snapshot status <文件>', desc: '校验快照完整性与大小，**备份后必做**' },
        { flag: 'ETCDCTL_API=3', desc: '老版本 etcdctl 需要显式声明 API 版本' }
      ],
      examples: [
        { cmd: 'ETCDCTL_API=3 etcdctl snapshot save /var/backups/etcd-20240601.db --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key', desc: '在控制面节点上做一次完整快照' },
        { cmd: 'ETCDCTL_API=3 etcdctl --write-out=table snapshot status /var/backups/etcd-20240601.db', desc: '校验快照大小与哈希，确认备份真的可用' },
        { cmd: 'kubectl get pods -n kube-system -l component=etcd', desc: '确认 etcd 是静态 Pod，决定去哪台机器上备份' },
        { cmd: 'ETCDCTL_API=3 etcdctl endpoint health --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key', desc: '备份前先确认 etcd 本身是健康的' }
      ],
      notes: [
        '**备份文件必须拷到集群外**（如华为云 OBS）：和 etcd 放在同一块盘上，盘挂了备份一起丢',
        '**快照只代表执行那一刻的状态**，恢复后这之后创建的所有资源都不存在，重要变更前要重新做一次',
        '证书路径写错是最常见的失败原因，kubeadm 集群的 etcd 证书在 `/etc/kubernetes/pki/etcd/` 下',
        '`snapshot save` 对 etcd 有性能影响（一致性读），生产建议避开业务高峰',
        '华为云 CCE 托管集群的 etcd 由云侧维护并提供备份能力，**用户无法直接执行 etcdctl**，应使用控制台的备份功能'
      ],
      related: ['k8s-etcdctl-snapshot-restore', 'k8s-kubeadm-upgrade', 'k8s-kubeadm-init'],
      docs: 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/',
      tags: ['etcd', '备份', '快照', '容灾']
    },

    /* ---------- 70 ---------- */
    /* ---------- 70 / 80 ---------- */
    {
      id: 'k8s-etcdctl-snapshot-restore',
      name: 'etcdctl snapshot restore',
      alias: ['etcd 恢复', '集群恢复'],
      level: 4,
      syntax: 'etcdctl snapshot restore <备份文件> --data-dir=<新目录> [--name=... --initial-cluster=...]',
      summary: '从快照恢复 etcd 数据，集群被误操作摧毁后的最后手段。',
      desc: '恢复不是"原地覆盖"：要把快照还原成**一个新的数据目录**，再让 etcd 用它启动。多节点 etcd 集群需要逐个节点恢复且参数一致，否则成员关系会对不上。整个过程集群不可用，属于重大操作。',
      params: [
        { flag: '--data-dir=<新目录>', desc: '还原到新目录，**不要覆盖正在运行的数据目录**' },
        { flag: '--name / --initial-advertise-peer-urls / --initial-cluster', desc: '多节点集群必须逐个指定，且与集群成员关系一致' },
        { flag: '--skip-hash-check', desc: '快照校验失败时跳过（**仅在确认快照来源可信时使用**）' },
        { flag: '恢复前置动作', desc: '先 `mv /etc/kubernetes/manifests /tmp/` 停掉静态 Pod，避免 etcd 被 kubelet 自动拉起' }
      ],
      examples: [
        { cmd: 'mv /etc/kubernetes/manifests /tmp/manifests.bak && systemctl stop kubelet', desc: '恢复前先停掉静态 Pod，防止 etcd 被重新拉起' },
        { cmd: 'ETCDCTL_API=3 etcdctl snapshot restore /var/backups/etcd-20240601.db --data-dir=/var/lib/etcd-restore', desc: '把快照还原到一个全新的数据目录' },
        { cmd: 'mv /var/lib/etcd /var/lib/etcd.broken && mv /var/lib/etcd-restore /var/lib/etcd', desc: '切换到还原目录（**原目录先改名保留**，出问题还能退回去）' },
        { cmd: 'mv /tmp/manifests.bak /etc/kubernetes/manifests && systemctl start kubelet', desc: '恢复静态 Pod，让 etcd 用还原后的数据启动' },
        { cmd: 'kubectl get pods -n kube-system', desc: '验证控制面恢复，确认组件都重新起来了' }
      ],
      notes: [
        '**恢复会丢弃快照之后的所有变更**，动手前先确认快照的时间点，评估要重做多少东西',
        '**永远不要直接覆盖正在使用的 etcd 数据目录**，先把原目录改名保留',
        '恢复前必须停掉 kubelet 与 etcd 静态 Pod，**否则 etcd 会把旧数据重新写回，恢复白做**',
        '多节点 etcd 集群要按成员逐个恢复，`--initial-cluster` 必须与集群成员完全一致，写错会导致选主失败',
        '恢复完成后逐个检查 `kubectl get nodes` 与业务命名空间，确认数据回到预期时间点',
        '华为云 CCE 托管集群使用控制台或 API 的备份恢复能力，**不要在节点上手工操作 etcd**'
      ],
      related: ['k8s-etcdctl-snapshot-save', 'k8s-kubeadm-reset', 'k8s-cluster-info'],
      docs: 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/',
      tags: ['etcd', '恢复', '危险', '容灾']
    },

    /* ---------- 71 ---------- */
    /* ---------- 71 / 80 ---------- */
    {
      id: 'k8s-crictl',
      name: 'crictl ps / crictl logs',
      alias: ['节点上查容器', 'containerd 排错'],
      level: 4,
      syntax: 'crictl ps -a   |   crictl logs <容器ID>   |   crictl pods',
      summary: '在节点上直接查容器运行时的容器，kubectl 不可用时的排查手段。',
      desc: 'kubectl 走的是 API Server，节点级问题（kubelet 挂了、Pod 卡在 Terminating、容器没被清理）时它可能看不到真实情况。`crictl` 直接问容器运行时（containerd 等），**看到的是节点上"真实存在"的容器**，两边的差异本身就是重要线索。',
      params: [
        { flag: 'crictl ps -a', desc: '列出所有容器（含已退出的），默认只列运行中的' },
        { flag: 'crictl pods', desc: '列出 Pod 沙箱，可用于找"孤儿沙箱"' },
        { flag: 'crictl logs <容器ID>', desc: '看容器日志，等价于 `kubectl logs`，kubectl 拿不到时用它' },
        { flag: 'crictl inspect <容器ID>', desc: '看容器详细状态（退出码、OOM 记录）' },
        { flag: 'crictl rmi --prune', desc: '清理未被使用的镜像，**节点磁盘告急时使用**（有风险）' }
      ],
      examples: [
        { cmd: 'crictl ps -a | grep worker', desc: '在节点上找 `worker-6b8f7c9d4-m2vqt` 对应的容器与它的状态' },
        { cmd: 'crictl logs <容器ID> --tail=100', desc: 'kubectl logs 拿不到时，直接看容器运行时里存的日志' },
        { cmd: 'crictl pods', desc: 'Pod 卡在 Terminating 时看沙箱是否还在，判断是不是残留' },
        { cmd: 'crictl rmi --prune', desc: '节点出现 DiskPressure（磁盘压力）时清理未使用的镜像' },
        { cmd: 'journalctl -u kubelet -n 100 --no-pager', desc: '节点问题的第一现场：kubelet 日志，通常比 crictl 更早给出原因' }
      ],
      notes: [
        '**`crictl` 只能在节点上以 root 执行**；用 `kubectl debug node/<节点名>` 起的特权容器也可以直接调用它',
        '**`crictl rm` / `crictl rmi` 是管理动作，直接删容器会让 kubelet 与真实状态不一致**，非紧急不要用',
        '老版本 Docker 作为运行时需要用 `--runtime-endpoint` 指定 socket；新版本 K8s 已移除 dockershim',
        '若 `crictl ps` 里容器在跑、而 `kubectl get pods` 显示异常，**说明是 kubelet 上报链路的问题**，去看 kubelet 日志',
        '节点 NotReady 的标准起手式：`systemctl status kubelet` 加 `journalctl -u kubelet -n 100`，再回到集群侧排查'
      ],
      related: ['k8s-node-shell', 'k8s-troubleshoot-node-notready', 'k8s-logs', 'k8s-debug'],
      docs: 'https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/',
      tags: ['节点', '容器运行时', 'crictl', '排错']
    },

    /* ==================== J. 排错进阶 ==================== */

    /* ---------- 72 ---------- */
    /* ---------- 72 / 80 ---------- */
    {
      id: 'k8s-pod-status-conditions',
      name: 'kubectl get pod -o yaml（看 status.conditions）',
      kind: 'recipe',
      alias: ['pod status', 'conditions', '退出码'],
      level: 3,
      syntax: 'kubectl get pod <Pod名> -o yaml | grep -A20 "status:"',
      summary: '读 Pod 的 status 段，从 conditions 与容器状态里找出真实原因。',
      desc: '`status` 是 kubelet 汇报的"事实"，比 `describe` 的表格更完整：`conditions` 说明 Pod 处在哪个阶段（PodScheduled / Initialized / ContainersReady / Ready），`containerStatuses` 里有退出码、重启次数与等待原因。**排错到深处一定要看这一段**。',
      params: [
        { flag: 'status.conditions[]', desc: '四类条件及其 `reason`（如 `ContainersNotReady`、`PodCompleted`）' },
        { flag: 'status.containerStatuses[].state.waiting.reason', desc: '**当前卡在哪**，如 `CrashLoopBackOff`、`ImagePullBackOff`' },
        { flag: 'status.containerStatuses[].lastState.terminated', desc: '**上次为什么挂**：退出码与原因（`OOMKilled` 出现在这里）' },
        { flag: 'status.phase', desc: 'Pod 生命周期阶段：Pending / Running / Succeeded / Failed / Unknown' },
        { flag: '-o jsonpath', desc: '精确取一个字段，适合快速判断与写脚本' }
      ],
      examples: [
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o yaml | grep -A20 "status:"', desc: '看这个 CrashLoopBackOff 的 Pod 的完整状态段' },
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].lastState.terminated.exitCode}{" reason="}{.status.containerStatuses[*].lastState.terminated.reason}{"\\n"}\'', desc: '直接取退出码与原因：137 + OOMKilled 是内存超限，1 + Error 是应用自己报错退出' },
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].restartCount}{"\\n"}\'', desc: '看重启次数，判断是偶发还是持续崩溃' },
        { cmd: 'kubectl get pod web-7d9c4b8f5-2xk9p -n my-app -o jsonpath=\'{range .status.conditions[*]}{.type}={.status}{"\\n"}{end}\'', desc: '对照正常 Pod 的条件列表，看异常 Pod 是在哪一条上不满足' }
      ],
      notes: [
        '**`state.waiting.reason` 是"当前卡在哪"，`lastState.terminated` 是"上次为什么挂"**，两者要一起看才不会误判',
        '`Conditions` 里 `Ready=False` 且 `reason=ContainersNotReady` 通常说明探针没过，而不是容器起不来',
        '`exitCode 137` 不一定是 OOM：也可能是被强杀或节点压力驱逐，**要结合 `reason` 字段一起判断**',
        'status 由 kubelet 上报，**节点 NotReady 时它会停留在最后一次上报的状态**，此时以节点侧的信息为准'
      ],
      related: ['k8s-describe', 'k8s-troubleshoot-crashloop', 'k8s-jsonpath', 'k8s-get'],
      docs: 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/',
      tags: ['排错', 'status', 'Pod', '退出码']
    },

    /* ---------- 73 ---------- */
    /* ---------- 73 / 80 ---------- */
    {
      id: 'k8s-events-involved-object',
      name: 'kubectl get events --field-selector involvedObject.name',
      alias: ['按对象查事件', 'involvedObject'],
      level: 2,
      syntax: 'kubectl get events --field-selector involvedObject.name=<对象名> [选项]',
      summary: '只看某个资源相关的事件，把排错范围收窄到一个具体对象。',
      desc: '命名空间里事件很多，`involvedObject.name` 能把范围收敛到具体的一个 Pod、Service 或 PVC 上。相比 `describe` 的事件段，它可以**按时间排序、看到更多条数、跨命名空间查同名对象**。',
      params: [
        { flag: '--field-selector involvedObject.name=<名字>', desc: '只看该对象的事件' },
        { flag: 'involvedObject.kind=Pod', desc: '叠加资源类型，避免同名对象串台' },
        { flag: '--sort-by=.lastTimestamp', desc: '按时间排序，**几乎必加**，否则顺序不可靠' },
        { flag: 'type=Warning', desc: '只看警告事件' }
      ],
      examples: [
        { cmd: 'kubectl get events -n my-app --field-selector involvedObject.name=worker-6b8f7c9d4-m2vqt --sort-by=.lastTimestamp', desc: '把这个崩溃 Pod 的事件按时间排出来' },
        { cmd: 'kubectl get events -n my-app --field-selector involvedObject.name=logs-pvc --sort-by=.lastTimestamp', desc: '看 Pending 的 PVC 到底卡在哪一步' },
        { cmd: 'kubectl get events -A --field-selector involvedObject.name=batch-job-28471920-x7klm --sort-by=.lastTimestamp', desc: '跨命名空间查同名对象的事件' },
        { cmd: 'kubectl get events -n my-app --field-selector type=Warning --sort-by=.lastTimestamp | tail -20', desc: '看命名空间最近的警告，判断是不是共性问题' }
      ],
      notes: [
        '**事件默认只保留 1 小时**，隔夜再查往往已经空了，重要故障要及时取或依赖事件持久化能力',
        '`involvedObject.name` 要写**完整对象名**：`worker-6b8f7c9d4-m2vqt` 而不是 `worker`',
        '同名对象在不同命名空间会混在一起，**跨命名空间查询时补上 `involvedObject.namespace` 或指定 `-n`**',
        '`kubectl describe` 只显示最近若干条事件，**需要完整时间线时用这条命令**'
      ],
      related: ['k8s-get-events', 'k8s-describe', 'k8s-troubleshoot-pending', 'k8s-jsonpath'],
      docs: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/field-selectors/',
      tags: ['事件', '排错', '筛选']
    },

    /* ---------- 74 ---------- */
    /* ---------- 74 / 80 ---------- */
    {
      id: 'k8s-debug-copy-to',
      name: 'kubectl debug --copy-to',
      alias: ['克隆 Pod', '验证改动'],
      level: 4,
      syntax: 'kubectl debug <Pod名> --copy-to=<新Pod名> [--set-image=...] [--container=...]',
      summary: '复制一个 Pod 并改配置，用来验证改动而不动线上实例。',
      desc: '`--copy-to` 会按原 Pod 的定义克隆一份新 Pod，可以顺手换镜像、加容器、改命令或去掉探针。**原 Pod 完全不受影响**，验证完删掉克隆体即可，是"怀疑某个配置有问题但不敢直接改线上"时的标准做法。',
      params: [
        { flag: '--copy-to=<新Pod名>', desc: '克隆出的 Pod 名，必须与原 Pod 不同' },
        { flag: '--set-image=<容器名>=<镜像>', desc: '换掉指定容器的镜像，用于验证版本问题' },
        { flag: '--container=<名字> --image=<镜像>', desc: '在克隆体里额外加一个容器（如网络工具）' },
        { flag: '--replace', desc: '用克隆体替换原 Pod（**等于重建线上实例，慎用**）' },
        { flag: '--profile=legacy|general|netadmin', desc: '调试容器的权限档位，网络排查用 `netadmin`' }
      ],
      examples: [
        { cmd: 'kubectl debug worker-6b8f7c9d4-m2vqt -n my-app --copy-to=worker-dbg --set-image=worker=swr.cn-north-4.myhuaweicloud.com/myorg/worker:v1.2.4', desc: '换成新镜像起一个克隆体，验证新版本是否还崩' },
        { cmd: 'kubectl debug worker-6b8f7c9d4-m2vqt -n my-app --copy-to=worker-net --container=netshoot --image=nicolaka/netshoot', desc: '克隆体里挂一个网络工具容器，验证它连不上 `cache-prod-01` 是不是网络问题' },
        { cmd: 'kubectl debug worker-6b8f7c9d4-m2vqt -n my-app --copy-to=worker-dbg -it -- sh', desc: '克隆后直接进容器看现场' },
        { cmd: 'kubectl delete pod worker-dbg -n my-app', desc: '验证完清理克隆体（**它不受任何控制器管理，不会自动消失**）' }
      ],
      notes: [
        '**克隆出来的 Pod 不受 Deployment 管理**（没有 ownerReference），验证完必须手工删，否则会一直占资源',
        '**克隆体的标签别被 Service 选中**，否则会分到线上流量；必要时先改掉 `app` 标签',
        '克隆体与原 Pod 共享同一个 PVC 时注意读写冲突（`ReadWriteOnce` 的云盘可能挂不上）',
        '换镜像、去探针这类"一次性验证"用它最安全；**得出结论后要回到 YAML 里做正式变更**',
        '`--replace` 会直接替换原 Pod，**那是在动线上实例**，只在明确知情时使用'
      ],
      related: ['k8s-debug', 'k8s-troubleshoot-crashloop', 'k8s-exec', 'k8s-delete'],
      docs: 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/',
      tags: ['调试', '克隆', '验证', '排错']
    },

    /* ---------- 75 ---------- */
    /* ---------- 75 / 80 ---------- */
    {
      id: 'k8s-exec-dns',
      name: 'kubectl exec 排查 DNS',
      kind: 'recipe',
      alias: ['resolv.conf', 'nslookup', 'coredns'],
      level: 3,
      syntax: 'kubectl exec <Pod名> -- cat /etc/resolv.conf | nslookup <域名>',
      summary: '进容器验证域名解析链路，定位"连不上另一个服务"的问题。',
      desc: 'Pod 之间访问大多走 Service 域名（如 `cache-prod-01`）。解析不通要按顺序查三层：**容器内的 `/etc/resolv.conf` 有没有指向 CoreDNS → CoreDNS 本身是否健康 → 服务名字是否真的存在**。',
      params: [
        { flag: 'cat /etc/resolv.conf', desc: '看 `nameserver` 与 `search` 域，正常的 search 里会有 `<命名空间>.svc.cluster.local`' },
        { flag: 'nslookup <名字>', desc: '解析域名（busybox/netshoot 里有；Alpine 需装 `bind-tools`）' },
        { flag: 'getent hosts <名字>', desc: '不依赖额外工具的解析方式，**精简镜像里最实用**' },
        { flag: 'cat /etc/hosts', desc: '有些环境靠 hosts 静态解析，排查时不要漏' },
        { flag: '-c <容器名>', desc: '多容器 Pod 里指定容器' }
      ],
      examples: [
        { cmd: 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- cat /etc/resolv.conf', desc: '确认容器内的 DNS 指向与搜索域' },
        { cmd: 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- nslookup cache-prod-01', desc: '解析那个连不上的后端名，看是 NXDOMAIN 还是超时' },
        { cmd: 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- nslookup cache-prod-01.my-app.svc.cluster.local', desc: '用完整域名再试一次，能通就说明是 search 域或短名的问题' },
        { cmd: 'kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide', desc: 'CoreDNS 不健康时全集群解析都会出问题' },
        { cmd: 'kubectl get svc,endpoints -n my-app | grep cache', desc: '确认这个后端在集群里到底叫什么、有没有 endpoints' }
      ],
      notes: [
        '**解析超时（timeout）通常是网络或 CoreDNS 问题；返回 NXDOMAIN 则是名字不存在**，两者排查方向完全不同',
        '**完整域名能解析、短名不能**，说明是 `search` 域配置问题；跨命名空间访问必须写 `<服务>.<命名空间>`',
        '跨命名空间访问只写服务短名是无效的，短名只在同一命名空间内解析',
        '精简镜像里可能没有 `nslookup`，用 `getent hosts`，或 `kubectl debug` 挂一个 netshoot 容器来验证',
        'NetworkPolicy 限制了出站却忘记放行 53 端口时，**表现就是解析超时**，别只盯着 CoreDNS 查'
      ],
      related: ['k8s-exec', 'k8s-networkpolicy', 'k8s-troubleshoot-svc', 'k8s-endpointslices'],
      docs: 'https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/',
      tags: ['DNS', '网络', '排错', 'CoreDNS']
    },

    /* ---------- 76 ---------- */
    /* ---------- 76 / 80 ---------- */
    {
      id: 'k8s-endpointslices',
      name: 'kubectl get endpointslices',
      alias: ['endpointslice', '服务后端'],
      level: 3,
      syntax: 'kubectl get endpointslices -n <命名空间> [-l kubernetes.io/service-name=<服务名>]',
      summary: 'Endpoints 的后继者，看 Service 后端到底有哪些就绪的 Pod。',
      desc: '`Endpoints`（旧）与 `EndpointSlice`（新，1.21 起默认）都表达"Service 背后的 Pod 地址列表"，但 EndpointSlice 支持更大规模与更多信息（`ready`、`serving`、`terminating` 状态、节点名）。**Service 不通时先看这里有没有 ready 的后端**。',
      params: [
        { flag: '-l kubernetes.io/service-name=<服务名>', desc: '按服务筛选对应的 EndpointSlice' },
        { flag: 'ENDPOINTS 列', desc: '列出的地址才会真正接收流量，为空就是没后端' },
        { flag: 'conditions.ready', desc: '后端是否就绪，**未就绪的地址不会被转发流量**' },
        { flag: 'conditions.terminating / serving', desc: '正在终止但仍在服务的端点，优雅下线期间会出现' }
      ],
      examples: [
        { cmd: 'kubectl get endpointslices -n my-app -l kubernetes.io/service-name=web -o wide', desc: '看 web 服务后端有哪些 Pod IP' },
        { cmd: 'kubectl get endpointslices -n my-app', desc: '列出命名空间里所有服务端点，快速发现哪个服务后端为空' },
        { cmd: 'kubectl describe endpointslice web-abc12 -n my-app', desc: '看每个端点的就绪状态与所属节点' },
        { cmd: 'kubectl get endpoints web -n my-app', desc: '老命令仍然可用、输出更简单，日常排查够用' }
      ],
      notes: [
        '**后端为空说明选择器没匹配到 Ready 的 Pod**，此时要查标签与就绪探针，别急着查网络',
        '**Pod 没通过 readiness 探针就不会进就绪端点**，Service 表现为完全不通，但 Pod 状态可能显示 Running',
        'EndpointSlice 由控制器自动维护，**手工改动会被覆盖**，要改的是 Service 的 selector',
        '`terminating: true` 的端点仍可能在接收流量（优雅下线期间），判断"是否真的没后端"要看 `ready`'
      ],
      related: ['k8s-troubleshoot-svc', 'k8s-service', 'k8s-get', 'k8s-exec-dns'],
      docs: 'https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/',
      tags: ['Service', 'Endpoints', '排错', '网络']
    },

    /* ---------- 77 ---------- */
    /* ---------- 77 / 80 ---------- */
    {
      id: 'k8s-troubleshoot-pending',
      name: 'Pod Pending 完整排查链路',
      kind: 'recipe',
      alias: ['pod 一直 pending', '调度失败', 'Insufficient cpu'],
      level: 3,
      syntax: 'kubectl get pod → describe pod → top node / describe node → PVC / quota',
      summary: '按调度、资源、约束、存储、配额五层顺序查清 Pod 为什么一直 Pending。',
      desc: 'Pending 的含义是"Pod 已被 API Server 接受，但还没被调度到节点上，或者卡在存储准备阶段"。排查必须**分层往下走、不跳步**：先看调度器说了什么，再逐条排除资源、约束、存储与配额。下面用仿真环境里 CPU 不足的 `batch-job-28471920-x7klm` 串起完整链路。',
      params: [
        { flag: '第 1 层 · 调度器怎么说的', desc: '`describe pod` 末尾的 `FailedScheduling` 事件会直接写明原因（Insufficient cpu / untolerated taint / didn\'t match node selector）' },
        { flag: '第 2 层 · 集群还有没有资源', desc: '`kubectl top node` 看实际用量，节点的已分配 requests 看还能不能塞下这个 Pod' },
        { flag: '第 3 层 · 约束是否自相矛盾', desc: 'nodeSelector、亲和性、污点容忍三者与节点的真实标签、污点是否对得上' },
        { flag: '第 4 层 · 存储是否就绪', desc: 'PVC 是否 Bound（`logs-pvc` 这类 Pending 的卷会让 Pod 一起卡住）' },
        { flag: '第 5 层 · 配额是否卡住', desc: '命名空间 ResourceQuota / LimitRange 是否已满或限制过严' }
      ],
      examples: [
        { cmd: 'kubectl get pod batch-job-28471920-x7klm -n my-app -o wide', desc: '第 1 步：确认状态是 Pending、NODE 列为空（说明确实没被调度上去）' },
        { cmd: 'kubectl describe pod batch-job-28471920-x7klm -n my-app | tail -20', desc: '第 2 步：**最关键的一步**，看 FailedScheduling 事件与原因，典型输出是 `0/3 nodes are available: 3 Insufficient cpu.`' },
        { cmd: 'kubectl get events -n my-app --field-selector involvedObject.name=batch-job-28471920-x7klm --sort-by=.lastTimestamp', desc: '第 3 步：把调度失败的完整时间线拉出来，确认是一次性还是反复重试' },
        { cmd: 'kubectl describe node 10.0.1.23 | grep -A10 -i "allocated resources"', desc: '第 4 步：看节点的 requests 已分配比例。**实际用量不高但 requests 占满，照样调度不上去**' },
        { cmd: 'kubectl top node --sort-by=cpu', desc: '交叉验证：判断是"资源真不够"还是"这个 Pod 的 requests 要得太大"' },
        { cmd: 'kubectl get pvc -n my-app', desc: '第 5 步：若事件是 `pod has unbound immediate PersistentVolumeClaims`，先解决 PVC（如 `logs-pvc` 的 csi-nas 问题）' },
        { cmd: 'kubectl get resourcequota -n my-app', desc: '第 6 步：命名空间配额是否已满，满了会直接拒绝创建（事件为 `Exceeded quota`）' },
        { cmd: 'kubectl get pod batch-job-28471920-x7klm -n my-app -o yaml | grep -A12 "requests:"', desc: '第 7 步：看这个 Pod 到底要了多少 CPU/内存，判断是不是 requests 要得过高' },
        { cmd: 'kubectl get nodes', desc: '第 8 步：确认没有节点被 cordon 或整池缩容到 0 —— 那种情况下任何 Pod 都调度不上去' }
      ],
      notes: [
        '**`0/3 nodes are available: 3 Insufficient cpu` 说的是 requests 不够，不是实际负载高**：要么调小 requests，要么给节点池扩容',
        '**Pending 阶段容器根本没起来**，所以 `kubectl logs` 一定是空的，别在那里浪费时间',
        '**排查顺序不能乱**：先看事件再猜原因，跳过 `describe` 直接改 YAML 是最容易白忙的做法',
        'PVC 未绑定导致的 Pending 要回到存储侧查：`logs-pvc` 用 `csi-nas` 时要确认存储类可用、可用区与节点匹配',
        'Job / CronJob 创建的 Pod Pending 时**别只删 Pod**：控制器会立刻重建，要改的是任务模板或集群资源',
        '节点被 cordon（SchedulingDisabled）或全部 NotReady 时，新 Pod 一定 Pending，`kubectl get nodes` 能一眼看出'
      ],
      related: ['k8s-describe', 'k8s-get-events', 'k8s-affinity-toleration', 'k8s-pvc-pv', 'k8s-job', 'k8s-troubleshoot-pod'],
      docs: 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/',
      tags: ['排错', 'Pending', '调度', '组合']
    },

    /* ---------- 78 ---------- */
    /* ---------- 78 / 80 ---------- */
    {
      id: 'k8s-troubleshoot-crashloop',
      name: 'CrashLoopBackOff 完整排查链路',
      kind: 'recipe',
      alias: ['容器反复重启', 'crashloop', 'OOMKilled'],
      level: 3,
      syntax: 'kubectl get pod → 退出码 → logs --previous → describe → exec 验证依赖',
      summary: '从退出码到上一次日志，逐层查清容器为什么反复重启。',
      desc: '`CrashLoopBackOff` 不是错误原因，而是 kubelet 的**退避重试状态**：容器起来就退出，kubelet 便按 10s→20s→40s…（最长 5 分钟）的间隔不断重启。所以目标是查"容器为什么退出"，链路是：**看退出码 → 看上一次日志 → 查配置与依赖 → 查探针与资源**。下面用仿真环境里连不上 `cache-prod-01` 的 `worker-6b8f7c9d4-m2vqt` 串起来。',
      params: [
        { flag: '第 1 层 · 退出码', desc: '`lastState.terminated.exitCode`：1=应用自身报错、137=OOMKilled 或被强杀、143=SIGTERM、126/127=入口命令或文件找不到' },
        { flag: '第 2 层 · 上一次的日志', desc: '`kubectl logs --previous`，**当前容器可能还没输出任何日志**' },
        { flag: '第 3 层 · 配置与依赖', desc: 'ConfigMap/Secret 是否缺键、环境变量是否注入、依赖的后端（如 `cache-prod-01`）是否可达' },
        { flag: '第 4 层 · 探针与资源', desc: 'liveness 探针超时会把容器杀掉重启；limits 太小会被 OOMKilled' }
      ],
      examples: [
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o wide', desc: '第 1 步：确认状态是 CrashLoopBackOff、RESTARTS 次数与所在节点' },
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.status.containerStatuses[*].lastState.terminated.exitCode}{" reason="}{.status.containerStatuses[*].lastState.terminated.reason}{"\\n"}\'', desc: '第 2 步：**先看退出码与原因**，137 + OOMKilled 与 1 + Error 是完全不同的两条路' },
        { cmd: 'kubectl logs worker-6b8f7c9d4-m2vqt -n my-app --previous --tail=100', desc: '第 3 步：看崩溃前最后的输出，**这是信息量最大的一条命令**' },
        { cmd: 'kubectl describe pod worker-6b8f7c9d4-m2vqt -n my-app | tail -25', desc: '第 4 步：看 Events：探针失败、OOMKilled、拉配置失败都在这里' },
        { cmd: 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- env | grep -i cache', desc: '第 5 步：能短暂起来时进容器看环境变量，确认它连的后端地址对不对' },
        { cmd: 'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- nslookup cache-prod-01', desc: '第 6 步：验证后端能不能解析，**把"应用报错"与"网络不通"区分开**' },
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.spec.containers[*].resources}{"\\n"}\'', desc: '第 7 步：看 requests/limits 是否过小（内存被杀多半出在这里）' },
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o yaml | grep -A8 livenessProbe', desc: '第 8 步：**探针配置错误也会造成"看起来在崩溃"**，超时太短尤其常见' }
      ],
      notes: [
        '**BackOff 间隔会越来越长（最长 5 分钟）**，"改完等半天没反应"是正常的；必要时删掉 Pod 让它立刻重建验证',
        '**退出码要和 reason 一起看**：`137 + OOMKilled` 是内存超 limits；`137 + Error` 往往是被强杀或节点压力驱逐',
        '**`kubectl logs` 看当前容器，`--previous` 看上一次**；容器刚起就被杀时当前日志是空的',
        '"启动即退出"也常见于**配置文件缺键**（ConfigMap 里少了某个键）或**启动命令写错**（`command`/`args` 覆盖了镜像的 ENTRYPOINT）',
        '**依赖服务不可达**（如连不上 `cache-prod-01`）导致的崩溃，修应用的同时要查 Service、Endpoints 与 DNS',
        'liveness 探针把还没启动完的应用杀掉（`initialDelaySeconds` 太小）会形成"起不来就一直重启"的假象，启动慢的应用先用 readiness 探针'
      ],
      related: ['k8s-logs', 'k8s-describe', 'k8s-pod-status-conditions', 'k8s-exec-dns', 'k8s-troubleshoot-pod'],
      docs: 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/',
      tags: ['排错', 'CrashLoopBackOff', '退出码', '组合']
    },

    /* ---------- 79 ---------- */
    /* ---------- 79 / 80 ---------- */
    {
      id: 'k8s-troubleshoot-imagepull',
      name: 'ImagePullBackOff 完整排查链路',
      kind: 'recipe',
      alias: ['镜像拉不下来', 'ErrImagePull', 'swr 拉取失败'],
      level: 3,
      syntax: 'kubectl get pod → describe pod（看 Events）→ image / imagePullSecrets → 节点侧验证',
      summary: '按"地址 → 凭证 → 网络 → 仓库"四步查镜像为什么拉不下来。',
      desc: '`ImagePullBackOff` 同样只是 kubelet 拉镜像失败后的退避重试，真正的原因写在 Events 里。链路固定：**镜像地址对不对 → 有没有凭据 → 节点能不能连上仓库 → 仓库里到底有没有这个镜像**。华为云场景还要多查一层 SWR 的权限与组织名。',
      params: [
        { flag: '第 1 层 · 镜像地址', desc: '仓库地址、组织、镜像名、标签四段是否齐全；SWR 的格式是 `swr.<region>.myhuaweicloud.com/<组织>/<镜像>:<标签>`' },
        { flag: '第 2 层 · 拉取凭据', desc: '`imagePullSecrets` 是否声明、Secret 类型是否为 `kubernetes.io/dockerconfigjson`、SA 上有没有挂' },
        { flag: '第 3 层 · 网络连通', desc: '节点能否访问镜像仓库（拉公网仓库需要 NAT 网关或 EIP）' },
        { flag: '第 4 层 · 仓库侧', desc: '镜像是否真的存在、是否被删、标签是否写错' }
      ],
      examples: [
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o wide', desc: '第 1 步：确认状态是 ImagePullBackOff 还是 ErrImagePull（后者是首次拉取失败）' },
        { cmd: 'kubectl describe pod worker-6b8f7c9d4-m2vqt -n my-app | grep -A6 "Events"', desc: '第 2 步：**看原始报错**：`manifest unknown` = 标签不存在，`unauthorized` = 凭证问题，`i/o timeout` = 网络问题' },
        { cmd: 'kubectl get pod worker-6b8f7c9d4-m2vqt -n my-app -o jsonpath=\'{.spec.containers[*].image}{"\\n"}{.spec.imagePullSecrets}{"\\n"}\'', desc: '第 3 步：看 Pod 实际用的镜像地址与声明的拉取密钥' },
        { cmd: 'kubectl get secret -n my-app | grep -i registry', desc: '第 4 步：确认拉取凭据存在（CCE 上常见的是 default-secret 或自建的 SWR 凭证）' },
        { cmd: 'kubectl get sa default -n my-app -o yaml | grep -A3 imagePullSecrets', desc: '第 5 步：**很多环境把凭据挂在 default SA 上**，这里能看出有没有' },
        { cmd: 'kubectl run pull-test --rm -it --image=swr.cn-north-4.myhuaweicloud.com/myorg/worker:v1.2.3 --restart=Never -n my-app -- echo ok', desc: '第 6 步：用一个干净的 Pod 单独验证"这个镜像到底能不能拉"，把应用自身因素排除掉' },
        { cmd: 'kubectl debug node/10.0.1.24 -it --image=busybox', desc: '第 7 步：网络类报错时上节点验证到仓库的连通性' }
      ],
      notes: [
        '**`manifest unknown` 就是标签不存在**，别去查网络和密钥；`unauthorized` 才是凭据问题，两者要分清',
        '**CCE 的 SWR 镜像地址必须带组织和区域**：`swr.<region>.myhuaweicloud.com/<组织>/<镜像>:<标签>`，少一段都拉不到',
        '私有仓库必须配 `imagePullSecrets`，**且 Secret 必须是 `kubernetes.io/dockerconfigjson` 类型**，用 `create secret generic` 建的是无效的',
        '**节点没有公网出口时拉不动公网镜像**：要么给节点配 NAT 网关或 EIP，要么先把镜像同步到 SWR',
        '`ErrImagePull` 与 `ImagePullBackOff` 是同一问题的两个阶段，**看 Events 里的原始报错才有意义**',
        '改完镜像名或密钥后**Pod 不会自动重试**，删掉让它重建（Deployment 会自动拉起新 Pod）'
      ],
      related: ['k8s-describe', 'k8s-secret', 'k8s-create-secret-generic', 'k8s-troubleshoot-pod', 'k8s-set-image'],
      docs: 'https://kubernetes.io/docs/concepts/containers/images/',
      tags: ['排错', 'ImagePullBackOff', '镜像', '组合']
    },

    /* ---------- 80 ---------- */
    /* ---------- 80 / 80 ---------- */
    {
      id: 'k8s-troubleshoot-node-notready',
      name: '节点 NotReady 完整排查链路',
      kind: 'recipe',
      alias: ['节点失联', 'NotReady', 'kubelet 排错'],
      level: 4,
      syntax: 'kubectl get nodes → describe node → 节点上查 kubelet / 运行时 / 磁盘',
      summary: '从节点状况到 kubelet、运行时与磁盘，逐层定位节点失联原因。',
      desc: '节点 NotReady 意味着 **kubelet 停止向 API Server 上报心跳**（默认几十秒没上报就会被标记）。排查要分两侧：**先在集群侧看节点状况与上面的 Pod，再上节点看 kubelet、容器运行时与资源压力**。它比 Pod 排错影响面大得多 —— 节点一挂，上面的 Pod 会被驱逐或卡住。',
      params: [
        { flag: '第 1 层 · 集群侧看节点状态', desc: '`get nodes` 看 STATUS，`describe node` 看 Conditions（Ready / MemoryPressure / DiskPressure / PIDPressure）' },
        { flag: '第 2 层 · 节点上的 Pod 怎么样了', desc: '该节点上的 Pod 是否被驱逐、是否大量处于 Unknown' },
        { flag: '第 3 层 · kubelet 本身', desc: '`systemctl status kubelet` 与 `journalctl -u kubelet`，**大部分原因在这里**' },
        { flag: '第 4 层 · 容器运行时与磁盘', desc: '`crictl ps` 验证运行时是否可用，`df -h` 看磁盘是否写满（DiskPressure）' },
        { flag: '第 5 层 · 网络与时间', desc: '节点到 API Server 的 6443 是否通、节点与控制面时间是否同步' }
      ],
      examples: [
        { cmd: 'kubectl get nodes -o wide', desc: '第 1 步：确认哪个节点 NotReady，以及它的内网 IP 与版本' },
        { cmd: 'kubectl describe node 10.0.1.24 | grep -A8 "Conditions"', desc: '第 2 步：**看节点状况**：Ready 是 False 还是 Unknown，有没有 MemoryPressure / DiskPressure' },
        { cmd: 'kubectl get pods -A -o wide --field-selector spec.nodeName=10.0.1.24', desc: '第 3 步：看这个节点上的 Pod 是否被驱逐、是否大量处于 Unknown' },
        { cmd: 'kubectl get events -A --field-selector reason=NodeNotReady --sort-by=.lastTimestamp | tail -10', desc: '第 4 步：看节点状态翻转的时间点与相关事件' },
        { cmd: 'kubectl debug node/10.0.1.24 -it --image=busybox', desc: '第 5 步：从集群侧起调试容器进节点（**不用 SSH 也能查**），宿主机根目录在 `/host`' },
        { cmd: 'chroot /host && systemctl status kubelet', desc: '第 6 步：在调试容器里看 kubelet 是否还在跑' },
        { cmd: 'chroot /host && journalctl -u kubelet -n 100 --no-pager', desc: '第 7 步：**看 kubelet 日志里最后的报错**：证书过期、连不上运行时、磁盘满都会写在这' },
        { cmd: 'chroot /host && df -h', desc: '第 8 步：磁盘写满会触发 DiskPressure 并驱逐 Pod，是云主机上很常见的原因' },
        { cmd: 'chroot /host && crictl ps | head', desc: '第 9 步：确认容器运行时（containerd）是否还能正常响应' }
      ],
      notes: [
        '**节点 NotReady 后 Pod 不会立刻消失**：要等一段时间才开始驱逐，这段时间就是抢修窗口',
        '**多个节点同时 NotReady 优先怀疑共性因素**：网络分区、VPC 路由、时间同步、镜像仓库或存储后端故障',
        '**磁盘写满是云主机上的高频原因**：镜像与容器日志堆积会把系统盘写满，先 `df -h` 再谈其他',
        'kubelet 报证书过期（`x509: certificate has expired`）时，**节点上的 kubelet 客户端证书需要轮转**，有的集群要重建节点',
        '修好之后确认节点回到 Ready，并在必要时 `kubectl uncordon`（之前被 drain 过的节点不会自动恢复调度）',
        '节点上的业务 Pod 被驱逐后会由控制器在别的节点重建，**先确认剩余节点扛得住，再看 PDB 是否卡住驱逐**',
        '华为云 CCE 的节点就是云主机，**控制台的重置节点/重装系统是终极手段**，但会清空节点本地数据'
      ],
      related: ['k8s-get-nodes', 'k8s-describe', 'k8s-crictl', 'k8s-node-shell', 'k8s-drain', 'k8s-troubleshoot-pod'],
      docs: 'https://kubernetes.io/docs/tasks/debug/debug-cluster/',
      tags: ['排错', '节点', 'NotReady', 'kubelet']
    }

  );
})();
