/* data/versions.js · 版本与弃用差异
   --------------------------------------------------------------------------
   同一件事，老版本和新版本的写法不同 —— 这是"文档看着对、执行就报错"的头号来源。
   一条记录 = 一个具体差异点。

   {
     id: 'ver-docker-compose-v1-v2',
     topic: 'docker-compose 与 docker compose',
     cat: 'docker',
     then: 'docker-compose up -d',   // 老写法（要写清是哪一代）
     now: 'docker compose up -d',    // 新写法
     since: 'Docker 20.10 起内置 Compose V2，2023 年 7 月起 Compose V1 停止支持',
     why: '……',                      // 为什么会变
     risk: '……',                     // 生产上踩到会怎样（升级后脚本突然失效之类）
     related: ['dk-compose-up'],
     docs: 'https://docs.docker.com/compose/migrate/'
   }

   注意：then / now / why / risk 都是**单行 JS 字符串**，多行命令用 \n 转义，
        不要写成跨行的裸多行字符串（会让本文件直接语法错误、整站加载不出来）。

   校验：node tools/kb-check.js（字段、长度、引用是否断链、命令是否可跑）
   渲染：#/versions（见 assets/js/render.js 的 viewKb）
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_VERSIONS = window.CC_VERSIONS || [];

  window.CC_VERSIONS.push(

    {
      id: "ver-docker-compose-v1-v2",
      topic: "docker-compose 与 docker compose（V1 独立二进制 → V2 插件）",
      cat: "docker",
      then: "docker-compose up -d",
      now: "docker compose up -d",
      since: "Docker 20.10（2020-12）把 Compose V2 作为 CLI 插件随引擎提供；Compose V1 的最后版本停在 1.29.2（2021-05），官方于 2023 年 7 月停止支持",
      why: "Compose V1 是 Python 写的独立二进制，依赖 python-docker 库与独立的发布节奏，装它与装 Docker 是两件事；V2 用 Go 重写、由 docker CLI 直接加载，才能做 compose 自动补全、与 docker 共用 context 与凭据，也让 Compose 能跟引擎同步发版修 bug。",
      risk: "CI 里固定写 `docker-compose` 的流水线在升级构建机后直接失败，报 `docker-compose: command not found`；而把名字一换就上线更危险 —— V2 的 `--compatibility` 行为与 V1 并不完全一致，容器名、网络名的下划线/连字符处理都变过，`docker compose down` 不认 V1 时代残留的容器，可能同时跑起两套服务。",
      related: ["dk-compose-up","dk-compose-down","dk-compose-yml","dk-compose-config"],
      docs: "https://docs.docker.com/compose/migrate/"
    },

    {
      id: "ver-docker-link-to-network",
      topic: "容器互联：--link → 自定义网络 + 服务名 DNS",
      cat: "docker",
      then: "docker run -d --name db mysql:8\ndocker run -d --link db:db wordpress",
      now: "docker network create app-net\ndocker run -d --name db --network app-net mysql:8\n# 应用容器同样 --network app-net，用服务名 db 连",
      since: "--link 自 Docker 1.9（2015-11）引入自定义网络后即被官方标记为 legacy，文档长期标注 “The --link flag is a legacy feature”（具体移除时间以官方文档为准）",
      why: "--link 只在默认 bridge 上生效，靠往 /etc/hosts 塞条目和注入环境变量实现互通，是单向的、不能动态改，容器重建后 IP 一变配置就烂掉；自定义网络内嵌 Docker DNS，服务名即域名，还能做网络隔离（不同网络默认不通），这才是编排需要的模型。",
      risk: "照老博客敲 `--link` 起的容器，重启顺序一变就互相连不上，报错却是应用层的 `Unknown MySQL server host`，看着像数据库挂了；Swarm 与 Kubernetes 完全无视 --link，迁移时这层隐式依赖没有任何清单可查，只能靠人回忆。",
      related: ["dk-network-connect","dk-network-modes","dk-network-create","dk-compose-up"]
    },

    {
      id: "ver-docker-buildx-default",
      topic: "docker build 与 docker buildx build（BuildKit 成为默认构建器）",
      cat: "docker",
      then: "DOCKER_BUILDKIT=1 docker build -t app:1.0 .",
      now: "docker buildx build --platform linux/amd64,linux/arm64 -t repo/app:1.0 --push .",
      since: "Docker Engine 23.0.0（2023-02-01）在 Linux 上把 Buildx 与 BuildKit 设为默认构建器，`docker build` 成为 `docker buildx build` 的别名，旧构建器只能用 DOCKER_BUILDKIT=0 显式启用（自 23.0 起算作已弃用）",
      why: "旧构建器是 daemon 内置的顺序执行器，构建慢、缓存弱、不支持多平台、不能做缓存导入导出；BuildKit 把构建拆成有向图并行执行，支持 --platform 多架构、--cache-from/--cache-to 远端缓存、--secret 与 --mount=type=cache，是“一次构建多架构交付”和 CI 加速的前提。",
      risk: "习惯性写 `DOCKER_BUILDKIT=0` 绕过问题的流水线在 23.0+ 上会退回已弃用的构建器，多阶段构建的缓存与 --from 解析行为和默认路径不一致，某个没改的 Dockerfile 会突然找不到上一阶段产出的文件；只构建 amd64 的旧脚本在鲲鹏/ARM 节点上 `docker pull` 报 `no matching manifest`，交付当天才发现要重做镜像。",
      related: ["dk-build","dk-buildx","ci-docker-buildx","dk-push"],
      docs: "https://docs.docker.com/build/"
    },

    {
      id: "ver-docker-latest-tag",
      topic: "镜像标签：latest 滚更新 → 不可变 tag + 改 deployment",
      cat: "docker",
      then: "docker build -t repo/app:latest . && docker push repo/app:latest",
      now: "docker build -t repo/app:1.7.3 . && docker push repo/app:1.7.3\ndocker tag repo/app:1.7.3 repo/app:latest",
      since: "Kubernetes 自 1.0 起，Pod 模板里的镜像 tag 为 `latest`（或省略 tag）时强制把 imagePullPolicy 默认为 Always；这不是新禁令，而是 latest 不可回滚的代价随集群规模放大",
      why: "一个 tag 指向的镜像被覆盖后，同一份 YAML 在不同时间部署出来的内容不同，“现在跑的是哪版代码”无法回答，也无法用 `kubectl rollout undo` 回到上一版（它回到的还是同一个 tag）；语义化版本或 commit 短哈希是不可变指针，才让回滚与审计成立。",
      risk: "节点上缓存着旧 latest 且策略为 IfNotPresent 时，推了新镜像、Pod 重建后仍跑旧代码，表现为“改了没生效”，重启节点后又变成另一个版本，同一 Deployment 的不同副本跑着不同代码；出故障时没有任何镜像 digest 记录可供回滚，只能重新构建一个“和当时差不多”的镜像。",
      related: ["ci-image-tag","dk-tag","dk-push","k8s-set-image"]
    },

    {
      id: "ver-docker-cgroup-driver",
      topic: "Docker 默认 cgroup driver：cgroupfs → systemd",
      cat: "docker",
      then: "/etc/docker/daemon.json 里写：\n{\n  \"exec-opts\": [\"native.cgroupdriver=cgroupfs\"]\n}",
      now: "/etc/docker/daemon.json 里写：\n{\n  \"exec-opts\": [\"native.cgroupdriver=systemd\"]\n}\n改完重启 docker",
      since: "kubelet 自 1.22（2021-08）起 KubeletConfiguration 的 cgroupDriver 默认值由 cgroupfs 改为 systemd，不一致时会打印告警；Docker 自身仍默认 cgroupfs，所以 daemon.json 必须显式对齐",
      why: "cgroupfs 与 systemd 是两套独立的 cgroup 管理器，同时存在时各自创建的 cgroup 互相不可见：systemd 算出的 slice 用量不含容器，kubelet 上报的 allocatable 与实际占用对不上，`systemctl status` 也看不到容器进程；统一到 systemd 才能让节点资源核算、OOM 计数、CPU 权重口径一致，也是后续接入 cgroup v2 的前提。",
      risk: "两个 driver 不一致的节点上，Pod 的 request/limit 被记进不同的 cgroup 树，出现节点明明有余量却调度不上、或容器被整机 OOM 杀掉却不产生 Pod 事件；升级 kubelet 后如果节点没改 daemon.json，kubelet 可能直接启动失败、节点 NotReady，而报错只说 “cgroup driver mismatch”。",
      related: ["dk-daemon-json","k8s-kubeadm-init","k8s-troubleshoot-node-notready","k8s-cluster-info"]
    },

    {
      id: "ver-dockershim-crictl",
      topic: "容器运行时排障：docker 命令 → crictl（dockershim 移除）",
      cat: "kubernetes",
      then: "docker ps | grep k8s_",
      now: "crictl ps -a",
      since: "Kubernetes 1.24（2022-05）正式移除 dockershim；1.24 起 containerd / CRI-O 节点上不再存在这个转发层",
      why: "dockershim 是“让 kubelet 说 Docker 语言”的临时适配层，长期由 Kubernetes 社区而非 Docker 维护，Docker 一升级它就跟不上；kubelet 直接对接 CRI 之后，运行时（containerd、CRI-O）成为可替换组件，镜像与容器状态直接来自 CRI，少了一层语义转换造成的状态不一致。",
      risk: "升级到 1.24 后节点上 `docker ps` 还能用但**看不到任何 K8s 容器**（kubelet 已直接对 containerd 说话），运维容易误判成“Pod 全丢了”而动手重启 kubelet；改用 crictl 时又常忘记 containerd 的 namespace —— 不加 `--runtime-endpoint unix:///run/containerd/containerd.sock` 往往什么都列不出来；此外依赖 docker 命令做日志与巡检的脚本要全部重写。",
      related: ["k8s-crictl","k8s-get-nodes","k8s-troubleshoot-node-notready","k8s-node-shell"],
      docs: "https://kubernetes.io/blog/2022/02/17/dockershim-faq/"
    },

    {
      id: "ver-podman-rootless",
      topic: "Podman 取代 docker：守护进程与 root 假设的差异",
      cat: "docker",
      then: "docker run -d -p 80:80 --name web nginx",
      now: "podman run -d -p 8080:80 --name web nginx  # rootless 不能绑 80\nsystemctl --user enable --now podman.socket  # 兼容 docker",
      since: "Podman 1.0 于 2018 年发布即定位为无守护进程的 OCI 运行时；RHEL 8（2019）起 Red Hat 把 podman 作为默认容器工具链、docker 需另装（各发行版自带版本以官方文档为准）",
      why: "daemonless + rootless 让每个用户在自己的用户命名空间里跑容器：没有常驻的 root 守护进程，`docker` 组“等价于 root”的提权问题消失，容器进程在宿主上以映射后的普通 UID 运行；容器不归某个后台服务管，systemd 可以直接把它当服务托管。",
      risk: "把 `alias docker=podman` 当成迁移完成的团队会踩两类坑：一是 rootless 下绑 80 端口报 permission denied、挂载宿主机目录也报 permission denied（UID 映射不同），二是依赖 `/var/run/docker.sock` 的工具（Watchtower、Portainer、Compose V1、docker-in-docker 型 CI runner）全部连不上；Podman 的 pod/quadlet 与 docker compose 也不等价，podman-compose 的字段覆盖度不如官方 Compose，原样搬生产 compose 会丢掉依赖顺序与健康检查语义。",
      related: ["dk-run","dk-ps","dk-compose-up","dk-network-modes"]
    },

    {
      id: "ver-k8s-ingress-v1beta1",
      topic: "Ingress API：extensions/v1beta1 → networking.k8s.io/v1",
      cat: "kubernetes",
      then: "apiVersion: extensions/v1beta1\nbackend: {serviceName: web, servicePort: 80}",
      now: "apiVersion: networking.k8s.io/v1\nbackend: {service: {name: web, port: 80}}\npathType: Prefix   # v1 新增且必填",
      since: "extensions/v1beta1 与 networking.k8s.io/v1beta1 两个 Ingress 版本在 Kubernetes 1.22（2021-08）被移除；networking.k8s.io/v1 自 1.19 起可用",
      why: "v1beta1 把后端写成平铺的 serviceName/servicePort，既不能表达同一个 Service 是“按名字”还是“按端口号”引用，也让 Ingress 无法与后续的 Gateway API 统一模型；stable 版本改用嵌套的 backend.service 结构，并新增必填的 pathType（Exact / Prefix / ImplementationSpecific）来消除各 Ingress Controller 对路径匹配的歧义。",
      risk: "集群升到 1.22+ 后，仓库里没改的 Ingress YAML `kubectl apply` 报 `no matches for kind \"Ingress\" in version \"extensions/v1beta1\"`，同时**已存在的 Ingress 对象也读不出来** —— `kubectl get ingress` 直接报错、GitOps 同步失败；如果清单在 Helm chart 里，Chart 版本没动而集群先升级，发布会全线红灯，而应用其实还在跑，故障现象与根因之间有明显时间差，容易先怀疑网络。",
      related: ["k8s-ingress","k8s-apply","k8s-troubleshoot-svc","k8s-api-resources"],
      docs: "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
    },

    {
      id: "ver-k8s-workloads-api-v1",
      topic: "工作负载 API：apps/v1beta1、apps/v1beta2 → apps/v1",
      cat: "kubernetes",
      then: "apiVersion: apps/v1beta1\nkind: Deployment\nspec:\n  replicas: 2\n  template: {metadata: {labels: {app: web}}}",
      now: "apiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: 2\n  selector: {matchLabels: {app: web}}",
      since: "apps/v1beta1 与 apps/v1beta2 在 Kubernetes 1.16（2019-09）被移除（StatefulSet、DaemonSet、ReplicaSet 的 extensions/v1beta1 版本同样在 1.16 移除）；CronJob 的 batch/v1beta1 在 1.25（2022-08）移除",
      why: "beta 版本里 Deployment 的 spec.selector 可以省略、由控制器自动补全，看似省事，实则把“这个 Deployment 管哪些 Pod”变成不可声明的隐式状态：自动生成的 selector 一旦与后来手工改的标签对不上，控制器就会开始收养或丢弃别人的 Pod；apps/v1 起 selector 必填且创建后不可改，把归属关系固化成显式契约，滚动更新的替换策略语义也随之确定。",
      risk: "老 YAML 直接 apply 会因为缺 spec.selector 被校验拒绝（`spec.selector: Required value`），补 selector 时若和模板标签不一致，又会得到 `selector does not match template labels`；更隐蔽的是 etcd 里当年用 beta 版本写进去、后来再也读不出来的对象，`kubectl get deploy` 报 `no matches for kind`，看着像资源“消失”，实际是存储版本没人认识它，必须先升 API 版本再回滚清单。",
      related: ["k8s-deployment","k8s-statefulset","k8s-daemonset","k8s-apply"],
      docs: "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
    },

    {
      id: "ver-k8s-cronjob-batch-v1",
      topic: "CronJob：batch/v1beta1 → batch/v1",
      cat: "kubernetes",
      then: "apiVersion: batch/v1beta1\nkind: CronJob\nspec:\n  schedule: \"0 3 * * *\"",
      now: "apiVersion: batch/v1\nkind: CronJob\nspec:\n  schedule: \"0 3 * * *\"\n  concurrencyPolicy: Forbid",
      since: "batch/v1 的 CronJob 自 Kubernetes 1.21（2021-04）可用，batch/v1beta1 在 1.25（2022-08）被移除",
      why: "CronJob 从 1.8 进 beta 到 1.21 转正花了三年多，期间错过时间窗怎么办、并发怎么控、历史 Job 留几个这些语义反复调整；转正后的 batch/v1 才提供稳定的 startingDeadlineSeconds、concurrencyPolicy、successfulJobsHistoryLimit 字段，控制器改为基于 lastScheduleTime 判断补跑，避免 beta 时期“停摆后疯狂补作业”的行为。",
      risk: "集群升到 1.25 后原有 CronJob 的 YAML 全部失效，备份、巡检、报表这些“平时没人看”的定时任务会静默停掉 —— 没人 apply 就不会报错，直到真要恢复数据时才发现最近的备份是两周前的；用 ArgoCD/Flux 纳管的仓库会先报同步失败，但如果处置不当触发删除重建，正在跑的 Job 会被中断。",
      related: ["k8s-cronjob","k8s-create-job","k8s-job","k8s-apply"],
      docs: "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
    },

    {
      id: "ver-kubectl-run-deployment-to-pod",
      topic: "kubectl run：默认创建 Deployment → 只创建 Pod",
      cat: "kubernetes",
      then: "kubectl run nginx --image=nginx --replicas=2 --port=80 --restart=Always",
      now: "kubectl create deployment nginx --image=nginx --replicas=2 --port=80",
      since: "kubectl run 生成 Deployment 的行为在 Kubernetes 1.18（2020-03）被正式移除；自 1.12 起已持续打印弃用警告",
      why: "`kubectl run` 一个动词要覆盖 Pod、Deployment、Job、CronJob 四种产出，靠 --restart、--schedule 等参数拼凑，参数与产出的对应关系反直觉（--restart=Always 出 Deployment，OnFailure 出 Job），生成的 Deployment 字段还写死在 kubectl 里、无法跟随 API 演进；拆成 `kubectl create deployment/job/cronjob` 加上只出 Pod 的 `kubectl run` 之后，每个命令只做一件事，行为可预期。",
      risk: "`kubectl run web --image=nginx -n prod` 在老版本创建的是带自愈能力的 Deployment，1.18 之后创建的是裸 Pod：节点重启、驱逐、OOM 之后它不会重新调度，业务“莫名其妙少了一个实例”且没有任何控制器事件可查；批量起临时服务的运维脚本在 1.18+ 上产出的全是裸 Pod，删掉就真没了，排查时容易先怀疑调度器。",
      related: ["k8s-deployment","k8s-get","k8s-describe","k8s-apply"],
      docs: "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
    },

    {
      id: "ver-kubectl-export-removed",
      topic: "kubectl get：--export 移除后的“导出干净 YAML”写法",
      cat: "kubernetes",
      then: "kubectl get deploy web -o yaml --export > web.yaml",
      now: "kubectl get deploy web -o yaml > web.yaml\n# 要能直接重建，剥掉运行时字段：\nkubectl get deploy web -o json | jq 'del(.metadata,.status)'",
      since: "--export 在 Kubernetes 1.14（2019-03）被弃用，并在 1.18（2020-03）移除",
      why: "`--export` 是客户端“猜着”删掉 metadata.resourceVersion、uid、creationTimestamp、status 等字段，猜错的代价很大：它分不清哪些字段是服务端默认值、哪些是用户显式设置的，导出的对象再 apply 回去要么因缺省值被重新填充而产生 diff，要么带着不该有的字段被 API 拒绝；官方因此不再提供这种“看起来干净”的假象，改为让用户用 jq/yq 显式处理。",
      risk: "把 `--export` 写进配置备份脚本的运维，会在某次重建命名空间时发现备份文件里全是 resourceVersion 与 uid，`kubectl apply` 报 `metadata.resourceVersion: Invalid value`，回滚失败；更常见的是“导出→改→apply”的迁移流程，导出的 YAML 带着 status 与 creationTimestamp，apply 后 Git 里每次 diff 都在变，代码评审失去意义。",
      related: ["k8s-get","k8s-jsonpath","k8s-diff","lt-jq"]
    },

    {
      id: "ver-kubeadm-config-v1beta3",
      topic: "kubeadm 配置格式：v1beta2 → v1beta3（init/join 字段归位）",
      cat: "kubernetes",
      then: "apiVersion: kubeadm.k8s.io/v1beta2\nkind: InitConfiguration\nnodeRegistration: {name: node1}",
      now: "apiVersion: kubeadm.k8s.io/v1beta3\nkind: InitConfiguration\nnodeRegistration: {name: node1}",
      since: "kubeadm.k8s.io/v1beta3 自 Kubernetes 1.22（2021-08）起成为默认配置版本，v1beta2 同时被弃用；后续 v1beta4 自 1.27 起可用。kubeadm 停止接受 v1beta2 的确切版本以官方文档为准",
      why: "v1beta2 把 InitConfiguration、JoinConfiguration、ClusterConfiguration 放在同一个文件里用 --- 分隔，字段散落各处（advertiseAddress 在 Init 段、controlPlaneEndpoint 在 Cluster 段、networking 又在 Cluster 段），字段位置写错也不报错；v1beta3 明确拆开各段结构，把 API 端点集中到 localAPIEndpoint，并强制用 --config 传文件，好让 kubeadm 在真正改动机器之前完成校验。",
      risk: "拿 1.20 时代的 kubeadm-config.yaml 去 `kubeadm init --config` 初始化 1.22+ 集群，会因为不认识的字段或段落归属错误直接失败，报 unknown field 或 could not unmarshal，而集群已经写了一半（kubelet 已拉起、证书已生成），清理要 kubeadm reset 重来；`kubeadm upgrade` 读取的是集群里 kubeadm-config ConfigMap 的内容，老集群升级前不先跑 `kubeadm config migrate`，会在升级中途停下，此时控制面组件版本已经不一致。",
      related: ["k8s-kubeadm-init","k8s-kubeadm-join","k8s-kubeadm-upgrade","k8s-kubeadm-reset"]
    },

    {
      id: "ver-k8s-topologykeys-traffic-distribution",
      topic: "Service 拓扑路由：topologyKeys → trafficDistribution",
      cat: "kubernetes",
      then: "spec:\n  selector: {app: web}\n  topologyKeys:\n  - kubernetes.io/hostname\n  - topology.kubernetes.io/zone\n  - \"*\"",
      now: "apiVersion: v1\nkind: Service\nspec:\n  selector: {app: web}\n  ports: [{port: 80}]\n  trafficDistribution: PreferClose",
      since: "topologyKeys 在 Kubernetes 1.21（2021-04）被弃用；拓扑感知路由先由注解 service.kubernetes.io/topology-aware-hints 承接（1.24 起默认 Auto），再迁移到 trafficDistribution 字段（1.31 起 GA）。当前可用字段与确切分界以官方最新文档为准",
      why: "topologyKeys 让用户写一条“就近降级链”，但 endpoint 计算是每个节点各自做的，字段在实现里被解释成硬性过滤：本节点无可用 endpoint 时直接失败而不是降级，再加上用户普遍写 * 兜底，实际效果与“就近优先”的预期相反；trafficDistribution 只表达意图（PreferClose / PreferSameZone 等），由 kube-proxy 结合节点位置实现就近路由，语义单一、可演进。",
      risk: "集群升到移除 topologyKeys 的版本后，`kubectl apply` 报 `unknown field \"spec.topologyKeys\"`，Service 更新不上去，只能改清单；如果 kubectl 以非严格模式静默丢弃该字段，Service 会退回全量跨区负载均衡，跨 AZ 流量费与延迟悄悄上升，业务只表现为“变慢了”，很难联想到是一次 apply 掉的字段。",
      related: ["k8s-service","k8s-endpointslices","k8s-troubleshoot-svc","k8s-get"]
    },

    {
      id: "ver-k8s-psp-to-psa",
      topic: "Pod 安全：PodSecurityPolicy → Pod Security Admission 命名空间标签",
      cat: "kubernetes",
      then: "apiVersion: policy/v1beta1\nkind: PodSecurityPolicy\nspec:\n  privileged: false\n  runAsUser: {rule: MustRunAsNonRoot}",
      now: "kubectl label ns prod --overwrite \\\n  pod-security.kubernetes.io/enforce=baseline   # 先审后紧",
      since: "PodSecurityPolicy 在 Kubernetes 1.21（2021-04）弃用，1.25（2022-08）移除；Pod Security Admission 1.23 起 Beta 并默认开启，1.25 起 GA",
      why: "PSP 是一套必须自己写 RBAC 授权才生效的准入插件：策略对象本身不生效，还要给 ServiceAccount 绑 use 权限，配置复杂到大量集群“装了但没起作用”，而它几十个 allow/rule 组合的字段既表达不了标准化安全档位，也难跨版本兼容；PSA 把档位固化成 privileged / baseline / restricted 三档，直接挂在命名空间标签上，还提供 audit 与 warn 两种非阻塞模式，迁移期可以既不断业务又能观测影响面。",
      risk: "用 PSP 做过隔离的集群升到 1.25 后策略对象被删除，而命名空间上没有任何 PSA 标签 —— 默认按 privileged 放行，原先被禁止的特权容器、hostPath、hostNetwork 又能被创建，安全基线等于一夜之间被撤掉且没有告警；反过来给生产命名空间直接打 enforce=restricted，会让已在运行、但没配 securityContext 的 Deployment 在下次重建时全部被拒，滚动发布卡在 FailedCreate。",
      related: ["k8s-networkpolicy","sec-kube-bench","k8s-rbac-role","k8s-create-serviceaccount"],
      docs: "https://kubernetes.io/docs/tasks/configure-pod-container/migrate-from-psp/"
    },

    {
      id: "ver-k8s-sa-token-secret",
      topic: "ServiceAccount 令牌：自动生成 Secret → kubectl create token",
      cat: "kubernetes",
      then: "kubectl get secret $(kubectl get sa ci -o jsonpath='{.secrets[0].name}') -o jsonpath='{.data.token}' | base64 -d",
      now: "kubectl create token ci -n default --duration=1h",
      since: "Kubernetes 1.24（2022-05）起不再为 ServiceAccount 自动创建长期有效的 token Secret（LegacyServiceAccountTokenNoAutoGeneration 默认开启）；短期令牌走 TokenRequest API（1.22 GA）",
      why: "自动生成的 Secret 令牌**永不过期**，一旦泄漏就等于集群内身份的永久后门，而 Secret 又常被 `kubectl get secret -A -o yaml` 整份导出到日志或工单里；TokenRequest 签发的令牌有小时级 TTL、绑定 Audience、可按需轮换，把长期凭证换成可撤销的短期凭证是零信任方向的硬要求。",
      risk: "依赖 `sa.secrets[0].name` 取令牌的脚本（CI 里写死 kubeconfig、监控 agent 用固定 token 连 apiserver）在 1.24+ 上取到空值，报 index out of range 或 401，现象是“CI 突然连不上集群”；用 `kubectl get secrets -A` 巡检的脚本也会因为看不到 token Secret 而误报“凭证丢失”，进而人工补一个长期 Secret，把安全改进又退回原点。",
      related: ["k8s-create-token","k8s-sa-token","k8s-create-serviceaccount","k8s-auth-whoami"]
    },

    {
      id: "ver-centos8-eol-rocky",
      topic: "CentOS 8 生命周期结束：换成 Stream / Rocky / openEuler 之一",
      cat: "linux-basic",
      then: "yum install -y nginx   # CentOS 7 / 8 上的写法",
      now: "dnf install -y nginx   # Rocky 9 / openEuler 等 RHEL 9 系派生版；CentOS 7 上 yum 仍可用",
      since: "Red Hat 于 2020-12-08 宣布 CentOS 8 提前至 2021-12-31 结束支持（原计划 2029）；CentOS 7 已于 2024-06-30 EOL，CentOS Stream 8 于 2024-05-31 结束更新",
      why: "CentOS 从“RHEL 的下游重建版”改为“RHEL 的上游滚动预览版”（CentOS Stream），定位由稳定但滞后变成稳定但领先，原来的 CentOS Linux 8 因此不再有独立长期支持线；企业需要的是与 RHEL 二进制兼容且带维护承诺的替代品，Rocky Linux、AlmaLinux 承接了原 CentOS 的角色。",
      risk: "继续跑 CentOS 8 的机器拿不到任何补丁：`yum update` 因为 mirrorlist 全部 404 而失败，报 `Failed to download metadata for repo AppStream`，此时新披露的内核/OpenSSL 漏洞无法修补，等保与安全扫描直接判不合格；迁到 Rocky 9 又常被大版本差异打到 —— nginx 由 1.14 到 1.20+ 的指令变化、PHP 7.2 到 8.0 的大量废弃函数、iptables-services 包消失，业务镜像里的旧依赖也要一起升。",
      related: ["lu-lsb-release","lu-systemctl","mo-log-var-log","ln-firewall-cmd"]
    },

    {
      id: "ver-linux-service-to-systemctl",
      topic: "服务管理：service / chkconfig → systemctl",
      cat: "linux-user",
      then: "service nginx restart && chkconfig nginx on",
      now: "systemctl restart nginx && systemctl enable nginx",
      since: "systemd 自 2011 年成为主流发行版默认 init；RHEL 7（2014）与 CentOS 7 起以 systemd 为默认，`service` 与 `chkconfig` 退化为转发到 systemctl 的兼容脚本",
      why: "systemd 用声明式 unit 文件（依赖关系、启动顺序、重启策略、资源限制、日志归属）取代了 shell 脚本里手写的 PID 文件与 sleep 轮询：After=/Requires= 表达依赖，Restart= 表达自愈，日志统一进 journald 可用 `journalctl -u` 检索；这与“脚本猜启动完了没有”的 SysVinit 模型是根本区别，也是云主机上服务自愈能力的基础。",
      risk: "RHEL 9 系已经不再安装 /etc/init.d 的兼容脚本体系，`service nginx restart` 在只有 unit 文件的机器上报 command not found 或 Unit not found；老脚本里的 `chkconfig nginx on` 在 systemd 下是无效操作 —— 服务能跑但重启后不自启，表现为“服务器维护后业务没起来”；自己写的 SysVinit 脚本若没有 LSB 头（### BEGIN INIT INFO），systemd 无法把它当服务托管，`systemctl start` 直接说找不到单元，只能手工执行。",
      related: ["lu-systemctl","lu-service","lu-systemctl-enable","lu-systemd-unit"]
    },

    {
      id: "ver-ifconfig-to-ip",
      topic: "网络查看与配置：ifconfig / route → ip addr / ip route",
      cat: "linux-net",
      then: "ifconfig eth0\nroute -n\nifconfig eth0 192.168.1.10 netmask 255.255.255.0 up",
      now: "ip -br addr show\nip route show\nip addr add 192.168.1.10/24 dev eth0 && ip link set eth0 up",
      since: "net-tools（ifconfig/route/netstat/arp）自 2001 年后基本停止维护，内核 2.6.29（2009-03）起把 iproute2 作为推荐工具；RHEL 8（2019）起默认不再预装 net-tools",
      why: "ifconfig 走的是只能表达“一块网卡一个地址”的老 ioctl 接口，读不到策略路由、多地址、VRF、网络命名空间、VLAN/VXLAN 等新特性；iproute2 直接通过 netlink 与内核对话，能看到完整路由表、邻居状态与统计，`ip -br` 的输出也更适合脚本解析。",
      risk: "最小化安装的 RHEL 8/9 与 EulerOS 上 `ifconfig` 报 command not found，巡检脚本取不到 IP 却继续往下走，最后拿空变量去拼 ssh 或防火墙规则，制造出更难查的故障；反之用 `ifconfig eth0 ...` 临时配的地址在 NetworkManager 眼里不存在，一旦重启网络服务或重启网卡就丢，远程运维时这一下会直接把自己关在门外。",
      related: ["ln-ip-addr","ln-ip-route","ln-ifconfig","ln-nmcli"]
    },

    {
      id: "ver-netstat-to-ss",
      topic: "连接与端口排查：netstat → ss",
      cat: "linux-net",
      then: "netstat -tunlp | grep 8080",
      now: "ss -tulnp | grep 8080",
      since: "netstat 属于 net-tools，同样自 2001 年后基本停更；RHEL 8（2019）起默认不装 net-tools（ss 由 iproute 提供并默认安装）",
      why: "netstat 通过解析 /proc/net/tcp 之类的文本文件统计连接 —— 要把整张连接表读成文本再解析，几十万并发连接的机器上执行一次要几十秒甚至卡住；ss 用 netlink 直接从内核套接字表取数，同一场景是秒级返回，还能显示 socket 内存、定时器、拥塞算法等更细的字段。",
      risk: "端口排查脚本在 RHEL 8/9 上因为 `netstat: command not found` 而拿到空结果，脚本若没开 `set -e` 就会把“没查到监听”当结论，健康检查误判服务已死并反复重启容器或触发主备切换；把这条命令放进高并发网关的定时采集更糟 —— 采集进程长时间卡在 netstat 上，本身成为负载来源，还会掩盖真正的连接堆积问题。",
      related: ["ln-ss","ln-netstat","ln-troubleshoot-port","pf-ss-summary"]
    },

    {
      id: "ver-iptables-to-nftables",
      topic: "防火墙：iptables 规则 → firewalld 的 nftables 后端 / nft",
      cat: "linux-net",
      then: "iptables -I INPUT -p tcp --dport 8080 -j ACCEPT\niptables-save > /etc/sysconfig/iptables",
      now: "firewall-cmd --permanent --add-port=8080/tcp && firewall-cmd --reload\nnft list ruleset",
      since: "RHEL 8（2019-05）起 firewalld 默认使用 nftables 后端，`iptables` 命令由 iptables-nft 兼容层提供；RHEL 9 移除了 iptables-services 包与 iptables 服务。RHEL 8.0 上后端启用的具体细节以官方文档为准",
      why: "iptables 是“每个表各一条链、逐条遍历匹配”，规则多了就是 O(n) 比较，且 ipv4、ipv6、ebtables 各一套语法与各自的保存/恢复机制；nftables 用统一的规则集（set/map/verdict）与原子事务替换整张规则集，支持集合匹配，性能和可维护性都更好，也不必再分别维护 ip6tables。",
      risk: "在 RHEL 8+ 上手工 `iptables -I INPUT` 加的规则与 firewall-cmd 管理的规则集不在同一处，`firewall-cmd --reload` 或 firewalld 重启会把手工规则清掉，表现为“临时放行的端口过一阵又不通了”；RHEL 9 上 `systemctl enable iptables` 直接失败（单元不存在），原来靠这个服务恢复规则的机器重启后默认策略会变，要么全放通成为安全事件，要么全拒绝导致业务中断；排查时 `iptables -L` 与 `nft list ruleset` 结果不一致，又会让人重复叠加规则。",
      related: ["ln-iptables","ln-nft","ln-firewall-cmd","ln-troubleshoot-firewall"]
    },

    {
      id: "ver-cron-to-systemd-timer",
      topic: "定时任务：crontab → systemd timer",
      cat: "linux-user",
      then: "crontab -e\n# 0 3 * * * /opt/backup/db.sh >> /var/log/db-backup.log 2>&1",
      now: "systemctl edit --force --full db-backup.timer\n# [Timer]\n# OnCalendar=*-*-* 03:00:00\n# Persistent=true",
      since: "systemd timer 自 systemd 197（2012）起可用，随 systemd 成为主流发行版默认 init 而被广泛采用；cron 本身仍在维护，两者不是移除关系，而是官方推荐的迁移方向",
      why: "cron 的执行环境几乎是空的（PATH 通常只有 /usr/bin:/bin，没有登录环境变量），大量“手工跑没问题、定时跑就报 command not found”都源于此；它也无法表达任务依赖、错过补跑、并发抑制与日志归属，任务重叠只能靠 flock 手工加锁。systemd timer 跑在与服务相同的环境里，日志进 journald 可查历史，Persistent=true 能补跑停机期间错过的窗口，OnFailure= 可挂告警单元。",
      risk: "把 crontab 原样搬成 timer 最容易漏掉环境与补跑：Environment= 没写、脚本里的相对路径失效，任务每天静默失败（cron 模式下失败会往 root 邮箱发信，偏偏很多人把这封信关掉了）；容器或最小化镜像里根本没装 cron，部署脚本 `crontab -l` 报 command not found 被忽略，定时任务从未注册成功；OnCalendar= 与 cron 表达式语法完全不同（Mon 写法、以及 systemd 里 % 不再需要转义），写错后表现为“不按预期时间跑”，而 systemd 不像 crontab 那样给你一行明显报错。",
      related: ["lu-crontab","lu-systemd-timer","lu-cron-format","lu-journalctl"]
    },

    {
      id: "ver-cgroup-v1-to-v2",
      topic: "cgroup 版本：v1 层级 → v2 统一层级（节点与容器）",
      cat: "linux-storage",
      then: "cat /sys/fs/cgroup/memory/memory.limit_in_bytes\nmount | grep cgroup",
      now: "cat /sys/fs/cgroup/memory.max\nstat -fc %T /sys/fs/cgroup   # 输出 cgroup2fs 即为 v2",
      since: "cgroup v2 自 Linux 4.5 引入、4.15 起可作生产使用；systemd 247（2020-11）起在新装系统上默认使用统一的 cgroup v2 层级；Kubernetes 自 1.25（2022-08）起 cgroup v2 为 GA 并优先使用（各发行版是否默认启用 v2 以官方文档为准）",
      why: "cgroup v1 是“一个控制器一棵树”（cpu 一棵、memory 一棵、io 一棵），进程在不同树里的归属无法原子保持一致，容器运行时还要为每个控制器分别挂载；v2 只有一棵统一树，把资源控制做成“一个进程组一份完整配置”，支持 PSI 压力指标、eBPF 挂载点与统一的内存/IO 成本核算 —— 这是 K8s 内存 QoS、容器内 PSI 观测等能力的前提。",
      risk: "节点切到 cgroup v2 后，按 v1 路径写死采集的监控脚本全部取不到数（memory.limit_in_bytes 这类文件不存在），面板上容器内存上限变成空值，容量规划失去依据；依赖 v1 语义的老 JDK（8u191 之前）会把容器内存上限识别成宿主机总量，堆按整机大小配置，最后容器被 OOM 杀掉而 JVM 日志里没有 OutOfMemoryError；集群里一部分节点 v1、一部分 v2 时，同一份监控模板要写两套路径，漏改的那半边就是数据失踪的那半边。",
      related: ["dk-stats","k8s-top","mo-proc","mo-dmesg"],
      docs: "https://kubernetes.io/docs/concepts/architecture/cgroups/"
    },

    {
      id: "ver-python2-to-python3",
      topic: "Python 2 → Python 3（脚本 shebang 与 yum 依赖）",
      cat: "shell",
      then: "#!/usr/bin/python\nprint \"hello\"\n# CentOS 7 上 /usr/bin/python 指向 Python 2.7",
      now: "#!/usr/bin/env python3\nprint(\"hello\")\n# RHEL 8+ / Rocky 9 默认只装 python3，/usr/bin/python 需要 alternatives 显式指定",
      since: "Python 2.7 已于 2020-01-01 官方停止支持；RHEL 8（2019）起系统默认 python3 且不提供 `python` 命令（需 `alternatives --set python /usr/bin/python3`），CentOS 7 存量机器仍普遍以 Python 2.7 为 /usr/bin/python",
      why: "Python 3 修正了 str/bytes 不分、整数除法、默认编码等语言层设计缺陷，2.x 也不再有安全修复；对运维更直接的驱动力是生态单向迁移 —— 新版 Ansible、OpenStack 客户端与各大云厂商 SDK 早已只支持 Python 3，继续用 2.7 等于把自己锁死在无人维护的依赖树里。",
      risk: "在 CentOS 7 上把 /usr/bin/python 改成指向 python3 会直接废掉 yum —— 它自身用 Python 2 写，之后执行任何 yum 命令都报 `SyntaxError: invalid syntax`，而此时已没有可用的包管理器，只能手工下载 rpm 用 `rpm -Uvh` 修回来；反过来把 Python 3 脚本的 shebang 写成 #!/usr/bin/python，在只有 python3 的机器上报 `bad interpreter: No such file or directory`，报错完全没提 Python 版本，排查常从脚本权限查起。",
      related: ["sh-debug","iac-ans-playbook","iac-ans-yum-apt","lb-file"]
    },

    {
      id: "ver-sysvinit-script-to-unit",
      topic: "自研启动脚本：/etc/init.d 脚本 → systemd unit 文件",
      cat: "linux-user",
      then: "/etc/init.d/myapp：\n#!/bin/bash\n. /etc/init.d/functions\ncase \"$1\" in start) daemon /opt/myapp/bin/myapp ;; esac",
      now: "myapp.service：\n[Unit]\nDescription=myapp\n[Service]\nExecStart=/opt/myapp/bin/myapp\nWantedBy=multi-user.target",
      since: "RHEL 7 / CentOS 7（2014）起 systemd 为默认 init 并保留 SysVinit 兼容层；RHEL 9 系发行版已不再支持 /etc/init.d 遗留脚本。各发行版的保留策略以官方文档为准",
      why: "SysVinit 脚本把“启动成功了吗、进程还在吗、依赖就绪了吗”全交给脚本作者用 sleep 与 ps 判断，PID 文件一旦被删或进程改名，status/stop 就失效；systemd 用 cgroup 跟踪服务的主进程与全部子孙进程，Restart= 声明自愈策略，After=/Requires= 声明依赖，退出码与日志统一由 journald 记录，不再依赖脚本自己维护的状态文件。",
      risk: "自研 init 脚本在 systemd 机器上要么完全不工作（`systemctl start myapp` 报 Unit not found），要么被 sysv-generator 包装成一个“看起来能启”的服务：这种包装无法跟踪 fork 出去的守护进程，`systemctl stop` 后子进程仍在跑、端口仍被占用，再启动报 Address already in use，而 `systemctl status` 显示 active（主脚本早退出了），排障时最容易被这个假状态误导。",
      related: ["lu-systemd-unit","sh-systemd-wrapper","lu-systemctl-daemon-reload","lu-service"]
    },

    {
      id: "ver-egrep-fgrep-deprecated",
      topic: "egrep / fgrep：被标记弃用 → grep -E / grep -F",
      cat: "linux-text",
      then: "egrep -c \"ERROR|WARN\" app.log\nfgrep -c \"GET /health\" access.log",
      now: "grep -E -c \"ERROR|WARN\" app.log\ngrep -F -c \"GET /health\" access.log",
      since: "GNU grep 3.8（2022-09）起运行 egrep/fgrep 时打印 “egrep: warning: egrep is obsolescent; using grep -E”；POSIX 早已把这两个命令标为 obsolescent（可废弃），并非新决定",
      why: "egrep/fgrep 只是 grep -E 与 grep -F 的历史别名，脚本里用它们会让“到底用了哪种正则语法”变得不明确（同一段正则在 BRE 与 ERE 下语义完全不同），也妨碍工具统一参数解析；GNU grep 保留行为只发警告，是为了让存量脚本平滑过渡而不是某天突然失效。",
      risk: "风险不在警告本身，而在“把警告当噪音顺手抑制”的脚本：`egrep ... 2>/dev/null` 关掉 stderr 之后，一旦某天该别名真的被移除，命令退出码变 127，脚本取到的计数是空值，日志巡检反而报“零错误”，故障就在一切正常的报表里被掩盖；把 grep 换成 BusyBox 或精简版实现（容器基础镜像里很常见）也有同样的静默差异，因为那些实现未必提供 egrep。",
      related: ["lt-egrep","lt-fgrep","lt-grep","lt-log-error-rate"]
    },

    {
      id: "ver-sed-i-gnu-vs-bsd",
      topic: "sed -i：GNU sed 与 BSD/macOS sed 的参数差异",
      cat: "linux-text",
      then: "sed -i 's/old/new/g' config.conf\n# macOS / FreeBSD 的 BSD sed 必须写成：sed -i '' 's/old/new/g' config.conf",
      now: "sed -i.bak 's/old/new/g' config.conf\n# 跨平台脚本更稳的写法：perl -pi -e 's/old/new/g' config.conf",
      since: "GNU sed 自 4.0（2009）起把 -i 的备份后缀设为可选（-i 或 -i.bak）；BSD sed 一直要求 -i 带后缀参数、用空串表示不备份。这是两个实现的长期设计分歧，不是某一版的变化",
      why: "GNU 把后缀设计成紧跟 -i 的可选部分（-i.bak 是一个 token），BSD 把它设计成独立的位置参数（-i .bak），于是同一个短选项在两边吃掉的参数个数不同；任何“本地在 Mac 上调试、服务器上跑”的脚本都可能因这一行之差表现完全相反。",
      risk: "在 macOS 上执行 `sed -i 's/old/new/g' file`，BSD sed 会把 s/old/new/g 当成备份后缀、把 file 当成脚本内容，要么报 `command a expects \\ followed by text`，要么**把文件原地改坏**；反过来在 Linux 上执行 `sed -i '' ...`，GNU sed 会把空串当作文件名，报 `sed: can't read : No such file or directory`，若脚本忽略退出码，后续读到的是没被修改的旧配置，变更静默失败。",
      related: ["lt-sed-i","lt-sed","lt-dos2unix","sh-quotes"]
    },

    {
      id: "ver-date-d-gnu-vs-bsd",
      topic: "日期计算：GNU date -d 与 BSD date -v 的差异",
      cat: "linux-basic",
      then: "date -d 'yesterday' +%F\ndate -d '+3 days' +%F",
      now: "date -v-1d +%F\ndate -v+3d +%F\n# 绝对可移植的做法是用 python3 -c 或 perl 计算日期",
      since: "GNU coreutils 的 date 长期支持 -d/--date 解析自然语言日期，BSD/macOS 的 date 至今只提供 -v 做字段增减。这是两个实现的长期分歧，不是某个版本的变更",
      why: "GNU 内置了日期字符串解析器（能懂 yesterday、+3 days、next monday），BSD 只提供按字段加减的 -v（-v-1d 表示日减一）与“只算不改系统时间”的 -j；两边对“什么算合法日期”的边界完全不同，任何自然语言日期写法都不是可移植的 POSIX 行为。",
      risk: "备份与清理脚本里写 `date -d '-7 days' +%F` 算过期日期，在 Linux 上正常，被拉到 macOS 或 FreeBSD 存储设备上执行时 date 直接报 `illegal option -- d`；若脚本没开 set -e 会带着空日期继续往下走，可能把删除条件变成空值（例如 find 的时间条件失效），一次误删整库备份；反之用 -v 硬凑“上个月最后一个工作日”这类需求，在跨月时会算错日期，报表口径整体偏移。",
      related: ["lu-date","lu-timedatectl","lb-find","sh-param-default"]
    },

    {
      id: "ver-awk-gawk-vs-mawk",
      topic: "awk 实现差异：gawk（RHEL）与 mawk（Debian/Ubuntu）",
      cat: "linux-text",
      then: "awk '{ print gensub(/o/, \"0\", \"g\", $0) }' file\n# gensub() 是 gawk 扩展，mawk 在解析阶段就会报错退出",
      now: "awk '{ gsub(/o/, \"0\"); print }' file\n# 只用 POSIX 定义的函数，gawk / mawk / busybox awk 都能跑",
      since: "Debian 与 Ubuntu 默认 awk 长期是 mawk（体积小、速度快），RHEL/CentOS 系默认是 gawk；这是两个实现的长期分工，不属于某个版本的变更（当前默认实现以发行版文档为准）",
      why: "gawk 是 GNU 的完整实现，提供 gensub()、asort()、SYMTAB、--csv、BEGINFILE 等大量扩展；mawk 追求小与快，只实现 POSIX awk 的核心，未定义的扩展函数会在解析阶段就报错退出。差异之所以造成事故，是因为“gawk 有扩展、mawk 没有”这件事只在报错信息里体现，而很多脚本作者只在 RHEL 上测过。",
      risk: "在 RHEL 上开发、在 Ubuntu 容器里执行的日志统计脚本，一句 gensub() 就让整个 awk 立刻退出并打印 `function gensub never defined`；由于脚本常以管道下游（sort/uniq）的退出码作为判断依据，没开 `set -o pipefail` 时这个失败会被吞掉，输出变成空文件，报表口径直接掉零；想在 Debian 上强制用 gawk 又常常没装（只有 mawk），生产镜像里临时加包通常不被允许。",
      related: ["lt-awk","lt-awk-func","lt-awk-printf","lt-nginx-top-ip"]
    },

    {
      id: "ver-bash3-to-bash4",
      topic: "bash 3.2 与 bash 4+：关联数组、mapfile 与大小写转换",
      cat: "shell",
      then: "declare -A map\nmap[key]=value\nmapfile -t lines < file.txt\nname=${name^^}",
      now: "echo \"${BASH_VERSINFO[0]}.${BASH_VERSINFO[1]}\"  # 先判版本\n#!/usr/bin/env bash\n# 无关联数组/mapfile 时改用 while read 与变量名拼装",
      since: "关联数组（declare -A）与 mapfile/readarray 自 bash 4.0（2009）引入，${var^^} 大小写转换同为 4.0 特性；macOS 自带的 /bin/bash 因许可证原因长期停留在 3.2（2007）",
      why: "bash 3.2 是最后一个 GPLv2 版本，Apple 选择不再跟进 GPLv3 的 bash 4/5，于是 macOS 一直停在 3.2，而 Linux 发行版早已是 4.x/5.x；这造就了“开发机是 Mac、生产是 Linux”团队里最典型的一类不可移植脚本，因为在 Mac 上 #!/bin/bash 拿到的就是 3.2。",
      risk: "在 macOS 上跑 `declare -A` 报 `declare: -A: invalid option` 后脚本退出；更隐蔽的是 `${x^^}` 这类写法在 bash 3.2 上不报错但也得不到期望结果（^^ 被当作普通字符），拼出的文件名多出两个尖括号，后续 rm/mv 因路径不存在而失败；`mapfile` 报 command not found 后若继续执行，数组为空、遍历一次都不进，脚本“成功退出”却什么也没做 —— 定时备份、批量清理这类任务会静默空转很久才被发现。",
      related: ["sh-array","sh-string-ops","sh-read","sh-for"]
    },

    {
      id: "ver-git-checkout-to-switch",
      topic: "Git 子命令拆分：git checkout → git switch / git restore",
      cat: "cicd",
      then: "git checkout main\ngit checkout -b feature/login\ngit checkout -- src/app.js",
      now: "git switch main\ngit switch -c feature/login\ngit restore src/app.js",
      since: "git 2.23（2019-08）引入 git switch 与 git restore 拆分 git checkout 的职责，2.24 起稳定可用；git checkout 本身仍然保留，属于推荐迁移而非移除",
      why: "`git checkout` 一个命令同时承担切换分支、创建分支、还原工作区文件、检出某 commit 到游离头四件事，语义高度依赖是否带 `--`，是新手最常误操作的地方（想还原一个文件结果切了分支，或想切分支结果丢了一堆改动）；拆成只管分支的 switch 与只管文件的 restore 之后，命令名本身就说明意图，`--` 的歧义也随之消失。",
      risk: "老脚本里 `git checkout $BRANCH` 在分支名与文件名同名时（公司里既有 release 分支又有 release 目录很常见）会按参数猜测去还原文件，脚本不报错但根本没切分支，后续拉取、构建、打包全在错的分支上进行，产出物版本对不上；改用 `git switch` 后，在旧 CI 镜像上（git 2.20 及更早）报 `git: 'switch' is not a git command`，流水线在拉代码阶段就断，而报错文案很像拼写错误，容易被误判成人写错了命令。",
      related: ["ci-git-switch","ci-git-branch","ci-git-config","ci-git-status"],
      docs: "https://git-scm.com/docs/git-switch"
    },

    {
      id: "ver-git-default-branch-main",
      topic: "Git 默认分支名：master → main",
      cat: "cicd",
      then: "git init\ngit branch -M master\ngit push -u origin master",
      now: "git init -b main\ngit config --global init.defaultBranch main\ngit push -u origin main",
      since: "git 2.28（2020-07）新增 init.defaultBranch 配置项；GitHub、GitLab 等平台自 2020 年 10 月起陆续把新建仓库的默认分支改为 main（各平台切换时间以各自公告为准）",
      why: "变更动机是去术语化（避免 master/slave 这类带奴役隐喻的词汇），技术上由 init.defaultBranch 提供可配置项、由平台改默认值来逐步推进，而不是强制改名；这也解释了它为什么是“git 版本 + 平台 + 仓库创建时间”的三重变量，没有可以照抄的统一答案。",
      risk: "CI 配置里把分支写死成 master 的流水线，在默认分支为 main 的新仓库上永远不触发 —— 提交推上去了、Webhook 也通了，流水线列表里就是没有构建记录，排查往往先怀疑 runner 掉线或 Webhook 密钥错；自动化脚本里 `git checkout master` 报 `pathspec master did not match`，如果写在 Dockerfile 里会让镜像构建以非零退出码失败，错误信息让人以为仓库里没有这个分支（其实是不存在 master 这个引用）。",
      related: ["ci-git-init","ci-git-branch","ci-git-push","ci-git-config"]
    },

    {
      id: "ver-mysql8-caching-sha2",
      topic: "MySQL 8 默认认证插件：mysql_native_password → caching_sha2_password",
      cat: "db-cache",
      then: "CREATE USER 'app'@'%' IDENTIFIED WITH mysql_native_password BY '明文口令';",
      now: "CREATE USER 'u'@'%' IDENTIFIED WITH caching_sha2_password BY 'Pw!';\n# 老客户端临时兼容：IDENTIFIED WITH mysql_native_password",
      since: "MySQL 8.0（2018-04）起 caching_sha2_password 成为默认认证插件，取代 5.7 时代的 mysql_native_password；MySQL 8.4 起 mysql_native_password 默认不再启用",
      why: "mysql_native_password 用 SHA1 挑战应答，口令哈希可被离线暴力破解，也不支持通道绑定；caching_sha2_password 用 SHA-256，配合 RSA 公钥或 TLS 传输口令，并把认证成功的结果缓存在服务端，重复连接不必再走完整握手（这也是它叫 caching 的原因）。安全强度提高的代价就是对老客户端不兼容。",
      risk: "5.7 时代的客户端连 8.0 时握手失败，报 `Authentication plugin 'caching_sha2_password' cannot be loaded` 或 `Client does not support authentication protocol requested by server`，而不少驱动只笼统报“访问被拒绝”，让人先去查账号密码与授权；在应用侧临时用 mysql_native_password 建账号属于把降级当解决方案，口令强度回到可离线破解的水平，安全扫描会判不合格，且 8.4 之后还要再迁一次。",
      related: ["db-mysql-client","db-mysql-create-user","db-mysql-connect-timeout","db-mysql-grant"]
    },

    {
      id: "ver-mysql8-grant-identified-by",
      topic: "MySQL 8：GRANT ... IDENTIFIED BY 被移除，建号与授权必须分两步",
      cat: "db-cache",
      then: "GRANT ALL PRIVILEGES ON appdb.* TO 'app'@'%' IDENTIFIED BY 'Str0ngPass!';",
      now: "CREATE USER 'app'@'%' IDENTIFIED BY 'Str0ngPass!';\nGRANT ALL PRIVILEGES ON appdb.* TO 'app'@'%';",
      since: "MySQL 8.0（2018-04）移除了 GRANT 语句中的 IDENTIFIED BY 子句，官方在 8.0 的 Features Removed 中列为不兼容变更（5.7 时代该写法已是隐式建用户）",
      why: "把“建账号/改口令”和“授权”合并在一条 GRANT 里，会让权限变更语句顺带创建账号，审计时无法区分“谁在什么时间创建了这个身份”；8.0 拆开之后，账号由 CREATE USER / ALTER USER 管理、权限由 GRANT / REVOKE 管理，两者都进审计日志，认证插件与口令策略这类账号属性也只能从正确的入口设置。",
      risk: "应用初始化 SQL 里写着老的 `GRANT ... IDENTIFIED BY ...`，在 8.0 上整句报 `ERROR 1064 (42000): You have an error in your SQL syntax`；致命的是初始化脚本常常“建库成功、建账号失败”半途而废：库和表都在、账号没建，应用连上报 access denied，运维看到的现象是“数据库存在、网络也通”，容易先怀疑权限或口令，真正原因却在初始化脚本的第一段；用 Flyway/Liquibase 管理时改脚本还会撞上 checksum 冲突，需要额外处理。",
      related: ["db-mysql-grant","db-mysql-create-user","db-mysql-show-grants","db-mysql-client"]
    },

    {
      id: "ver-mysql8-utf8mb4-collation",
      topic: "MySQL 8 默认排序规则：utf8mb4_general_ci → utf8mb4_0900_ai_ci",
      cat: "db-cache",
      then: "-- 5.7 及更早的建库/建表习惯：\nCOLLATE=utf8mb4_general_ci\n-- 8.0 默认（不写也是它）：COLLATE=utf8mb4_0900_ai_ci",
      now: "-- 8.0 起不写 COLLATE 时默认就是：\nCOLLATE=utf8mb4_0900_ai_ci",
      since: "MySQL 8.0（2018-04）起服务器默认字符集为 utf8mb4、默认排序规则为 utf8mb4_0900_ai_ci（5.7 为 latin1 / utf8mb4_general_ci）；该规则基于 Unicode 9.0，仅 MySQL 8.0+ 可用",
      why: "utf8mb4_general_ci 是早期为速度做的简化实现，排序与比较不完全符合 Unicode 规范（部分欧洲字符、emoji、拼音序处理不正确），utf8mb4_0900_ai_ci 按 Unicode 9.0 的排序权重比较、性能也有优化；代价是它只在 8.0 之后存在，5.7 及更早实例无法识别。",
      risk: "5.7 与 8.0 之间做主从或双写时两端排序规则不同，涉及临时表、GROUP BY、ORDER BY 字符串列的语句会在从库上报 `Illegal mix of collations` 并中断复制（见 SHOW REPLICA STATUS 的 Last_SQL_Error）；同一个查询在主从两端返回的行序不同，会让分页与去重结果不一致，下游对账出现“少量数据对不上”却难以复现；把 5.7 的备份恢复到 8.0 时若建表语句显式写了 utf8mb4_general_ci，同一实例内两套规则并存，JOIN 时同样触发该错误。",
      related: ["db-mysql-information-schema","db-mysql-mysqldump","db-mysql-restore","db-mysql-show-replica-status"]
    },

    {
      id: "ver-mysql-show-replica-status",
      topic: "MySQL 复制命令改名：SHOW SLAVE STATUS → SHOW REPLICA STATUS",
      cat: "db-cache",
      then: "SHOW SLAVE STATUS\\G\nCHANGE MASTER TO MASTER_HOST='10.0.0.5', MASTER_LOG_FILE='mysql-bin.000123';",
      now: "SHOW REPLICA STATUS\\G\nCHANGE REPLICATION SOURCE TO SOURCE_HOST='10.0.0.5', SOURCE_LOG_FILE='mysql-bin.000123';",
      since: "MySQL 8.0.22（2020-10）引入 SHOW REPLICA STATUS 与 CHANGE REPLICATION SOURCE TO 等新语法，并把 MASTER/SLAVE 系命令标记为弃用（去术语化）；MySQL 8.4 起旧语法被移除",
      why: "这是 MySQL 去术语化（移除 master/slave 这类带奴役隐喻的词汇）的一部分，同时借改名把复制相关命令统一到 REPLICATION SOURCE / REPLICA 的表述；新旧语法功能等价，改名不代表语义变化，因此可以逐条替换而不必停机。",
      risk: "监控脚本解析 SHOW SLAVE STATUS 的字段名（Slave_IO_Running、Seconds_Behind_Master）—— 8.0.22+ 输出字段是否已改成 Replica_* 取决于具体版本，同一套正则跨版本会取到空值，告警规则静默失效，主从延迟涨到几小时也没有告警；在 8.4 上命令直接报语法错误，备份/巡检脚本每次执行都失败，如果错误被重定向进日志而没人看，等于复制监控长期缺失。",
      related: ["db-mysql-show-replica-status","db-mysql-change-replication-source","db-mysql-replication-lag","db-mysql-processlist"]
    },

    {
      id: "ver-redis-acl-rename-command",
      topic: "Redis 命令管控：rename-command 禁用 → ACL 用户按权限授权",
      cat: "db-cache",
      then: "redis.conf 里写：\nrename-command CONFIG \"\"\nrename-command FLUSHALL \"\"",
      now: "redis.conf 里写（不再用 rename-command）：\nuser app on >口令 ~app:* +@read +@write -@dangerous\nuser default off",
      since: "Redis 6.0（2020-05）引入 ACL 用户体系；Redis 7.0（2022-04）起在配置中使用 rename-command 会被标记为弃用，官方建议改用 ACL（具体移除时间以官方文档为准）",
      why: "rename-command 是全局的、对所有连接生效，而且把命令改名会破坏客户端兼容性 —— 很多客户端与驱动内部就调用 CONFIG、CLIENT 等命令，改一个名字整类工具立刻连不上；它也做不到“这个账号能读 app:* 前缀的键、那个账号只能读缓存键”。ACL 把“谁能连、用哪个账号、能执行哪些命令、能访问哪些键前缀”分开表达，可按业务最小授权并支持 ACL 文件热加载。",
      risk: "在 6.x 上一边保留 `rename-command CONFIG \"\"` 一边启用 ACL，会出现权限模型打架：口令校验通过，但客户端初始化阶段要执行 CONFIG GET maxmemory 之类的探测命令，遇到被改名的命令直接抛错，表现为“能连上但一操作就失败”，而 Redis 日志里没有记录；把 rename-command 换成 ACL 时若漏了 `user default off`，未认证连接仍以 default 用户的全权限工作，安全加固只做了一半，未授权访问扫描依旧判为高危。",
      related: ["db-redis-cli","db-redis-info","db-redis-client-list","db-redis-slowlog"]
    },

    {
      id: "ver-nginx-listen-http2-directive",
      topic: "Nginx HTTP/2 配置：listen ... http2 → 独立的 http2 指令",
      cat: "middleware",
      then: "server {\n  listen 443 ssl http2;\n  server_name a.example.com;\n  ssl_certificate /etc/nginx/ssl/a.crt;\n}",
      now: "server {\n  listen 443 ssl;\n  http2 on;\n  server_name a.example.com;\n  ssl_certificate /etc/nginx/ssl/a.crt;\n}",
      since: "nginx 1.25.1（2023-06）起把 listen 的 http2 参数标记为弃用，并新增独立的 http2 指令，旧写法会打印 “the \"listen ... http2\" directive is deprecated, use the \"http2\" directive instead” 警告（确切行为以 nginx 官方文档为准）",
      why: "旧写法把 HTTP/2 绑在某个 listen 套接字上，同一个 443 端口被多个 server 块共享（同一 IP 按 SNI 分流多个域名）时，HTTP/2 的开关状态取决于哪个 server 块先匹配，配置之间互相影响、行为不直观；改成 `http2 on;` 后它是 server 级的独立开关，语义从“这条监听线路上允许协商 HTTP/2”变成“这个虚拟主机启用 HTTP/2”，与 ssl、quic 等同类开关一致。",
      risk: "升级到 1.25.1+ 后保留 `listen 443 ssl http2;` 会持续输出弃用警告，把错误日志刷满、掩盖真正需要关注的问题（证书续期失败、upstream 超时都会淹没在警告里）；反过来把新写法 `http2 on;` 用到 1.24.x 及更早版本上会直接报 `unknown directive \"http2\"`，`nginx -t` 失败 —— 如果发布流程是“先改配置再 reload”，正在服务的 nginx 会 reload 失败而继续跑旧配置，出现“改了没生效”，改用 restart 则会造成一次短暂中断。",
      related: ["mw-nginx-test","mw-nginx-version","mw-nginx-proxy-pass","mw-nginx-signal"]
    },

    {
      id: "ver-tomcat10-jakarta-namespace",
      topic: "Tomcat 10：javax.* → jakarta.* 命名空间迁移",
      cat: "middleware",
      then: "// Servlet 4.0（Tomcat 9 及更早）\nimport javax.servlet.http.HttpServlet;\nimport javax.servlet.http.HttpServletRequest;",
      now: "// Servlet 5.0（Tomcat 10）：\nimport jakarta.servlet.http.HttpServletRequest;",
      since: "Tomcat 10.0.0（2021-02）起实现 Jakarta EE 9 规范，规范 API 的包名由 javax.* 改为 jakarta.*；用 Tomcat 9 编译的 WAR 不能直接在 Tomcat 10 上运行",
      why: "Oracle 把 Java EE 移交给 Eclipse 基金会时不允许新组织继续使用 javax.* 包名（商标与命名空间约束），于是 Jakarta EE 9 把整套规范 API 的包名从 javax 改名为 jakarta；这不只是换个名字 —— Tomcat 10 里的 jakarta.servlet.http.HttpServlet 与 Tomcat 9 的 javax.servlet.http.HttpServlet 是两个不同的类，按老包名编译的 class 找不到父类，二进制不兼容。",
      risk: "把 Tomcat 9 上跑得好好的 WAR 直接丢进 Tomcat 10 的 webapps，部署阶段就报 `ClassNotFoundException: javax.servlet.http.HttpServlet`（或 NoClassDefFoundError），应用完全起不来，而报错只提类名不提包名迁移，容易被当成依赖缺失去反复检查 jar；迁移时若只改了自己的 import 而没检查第三方依赖（老框架、驱动、鉴权 filter），编译能过但运行到那些 jar 时抛 `NoClassDefFoundError: javax/servlet/ServletRequest`；因为同一个 WAR 无法同时兼容两代命名空间，升级必须和代码改造、依赖升级捆绑成一个发布窗口，回滚只能连 WAR 一起回滚。",
      related: ["mw-tomcat-serverxml","mw-tomcat-catalina","mw-tomcat-log","mo-jvm-jstack"],
      docs: "https://tomcat.apache.org/migration-10.html"
    },

    {
      id: "ver-huaweicloud-ecs-api-v2-v3",
      topic: "华为云 ECS 接口版本：OpenStack 风格接口 → 新版 v3 接口",
      cat: "cloud-cli",
      then: "hcloud ECS CreateServer --cli-region=cn-north-4 \\\n  --project_id=xxx --server.imageRef=xxx",
      now: "hcloud ECS CreateServers --cli-region=cn-north-4 \\\n  --X-Project-Id=xxx --server.imageRef=xxx",
      since: "华为云 ECS 在新版接口中提供 CreateServers 等操作与 /v3/{project_id}/cloudservers 等路径，与沿用 OpenStack Nova 风格的老接口长期并存；某个操作属于哪一代、KooCLI 各版本默认调用哪一代，以华为云官方 API Explorer 与 KooCLI 文档为准",
      why: "老接口沿用 OpenStack Nova 的风格（请求体里嵌套 server、参数名与 OpenStack 对齐、project 走查询参数），新接口按华为云自身的 API 规范重写：统一用 X-Project-Id 之类的头部传参、统一错误码与分页模型、字段命名规范化；动机是摆脱 OpenStack API 的历史包袱，让 ECS 与 EVS、VPC、IMS 等云服务保持一致的调用与鉴权约定。",
      risk: "照旧文档写的调用在 KooCLI 上会因为操作名或参数名不匹配直接报错（`Not found the operation` 或参数校验失败）；更麻烦的是 KooCLI 升级后默认调用的接口版本可能变化，脚本**无声地换了一套接口** —— 返回体字段路径变了，用 --cli-json-filter 或 jq 取值的脚本拿到 null，后续把空 IP、空 ID 写进 DNS、CMDB 或 ssh 命令，错误现场离根因很远；批量创建场景下新老接口的限额与语义不同，缺少幂等保护的脚本会重复创建机器并产生费用。",
      related: ["hw-ecs-list","hw-ecs-create","hw-hcloud-config-init","hw-cross-dryrun"]
    },

    {
      id: "ver-openstack-keystone-v2-v3",
      topic: "OpenStack 鉴权与 API：keystone v2 → v3（tenant → project + domain）",
      cat: "cloud-cli",
      then: "openstack --os-auth-url http://keystone:5000/v2.0 \\\n  --os-tenant-name demo server list",
      now: "openstack --os-auth-url http://keystone:5000/v3 \\\n  --os-project-name demo --os-user-domain-name Default server list",
      since: "Keystone v2.0 接口在 OpenStack Queens（2018-02）被移除，v3 自 Kilo 起为默认且推荐；改用 v3 时必须提供 user/project domain 参数。各家云平台的兼容时间以各自官方文档为准",
      why: "v2 只有 tenant 概念，无法表达“用户属于哪个域、项目属于哪个域”的多租户层级，也做不了域级管理、应用凭据与信任委托；v3 引入 domain/project/user 三层模型与统一鉴权入口 /v3/auth/tokens，并把服务目录放进 token 响应，使一次鉴权即可拿到全部服务的 endpoint。这是从扁平租户到可分层治理的结构性变更，所以参数名（tenant → project）与必填项都变了。",
      risk: "把 OS_AUTH_URL 指向 /v2.0 的老脚本在新平台上直接 404 或返回 `The resource could not be found`，错误信息不会说“v2 已被移除”，运维常先去查网络连通性与防火墙；把 --os-tenant-name 换成 --os-project-name 时漏了 --os-user-domain-name，会报 `You are not authorized`，看起来像口令错了；用 v3 token 跑长时间任务（批量迁移、镜像同步）时默认有效期约 1 小时，任务跑到一半开始 401，中间结果半途而废，而 v2 时代的脚本大多没做 token 刷新，这个坑迁移后才暴露。",
      related: ["hw-hcloud-config-init","hw-cross-region-endpoint","hw-cross-paging-backoff","hw-ecs-list"]
    },

    {
      id: "ver-terraform-011-to-012",
      topic: "Terraform HCL：0.11 的 ${} 插值 → 0.12+ 的表达式与引用",
      cat: "iac",
      then: "  count    = \"${var.web_count}\"   # 0.11：连变量引用也要包 ${}\n  image_id = \"${var.image_id}\"",
      now: "  count    = var.web_count          # 0.12+：引用即表达式\n  image_id = var.image_id",
      since: "Terraform 0.12（2019-05）重写了 HCL 解析器与类型系统，官方提供 `terraform 0.12upgrade` 升级老配置；0.11 语法在 0.12+ 上多数会报错，0.13 起不再支持 0.11 语法",
      why: "0.11 里所有表达式都必须塞进 ${}，连 \"${var.x}\" 这样的纯引用也要包一层，字符串与表达式没有类型区分，列表/对象与字符串之间可以隐式转换，类型错误往往到执行阶段才炸；0.12 把引用变成一等表达式（var.x、resource.type.name.attr），加入明确类型与 for 表达式、dynamic 块，把“配置写错”提前到 terraform validate 阶段发现，也才可能实现稳定的 plan diff。",
      risk: "拿 0.11 时代写的模块（大量来自老博客与私有仓库）在 0.12+ 上执行，会报 `Error: Invalid expression`、`Unsupported attribute` 或 `Ambiguous attribute value`，一处不改就整份配置全军覆没；更危险的是**静默的语义变化**：0.11 里把字符串当布尔用的写法（如 count = \"${var.enabled}\"）在 0.12 后类型不同，count 由 0 变 1 或反之，apply 时会销毁并重建全部实例，表现成生产机器被删掉重开、没做保护的数据盘随之丢失；列表引用由 .*.id 改成 [*].id 时，若某处仍写 .* 会得到空列表，下游 element() 取值报 index out of range。",
      related: ["iac-tf-variable","iac-tf-count-foreach","iac-tf-validate","iac-tf-output-block"],
      docs: "https://developer.hashicorp.com/terraform/language/upgrade-guides"
    },

    {
      id: "ver-jenkins-freestyle-to-pipeline",
      topic: "Jenkins 构建定义：自由风格任务 → Jenkinsfile 声明式流水线",
      cat: "cicd",
      then: "在 Jenkins Web UI 里逐项填写：源码管理 / 构建触发器 / 构建步骤（Execute shell）\n# 配置只存在于 master 的 config.xml 里，无法随代码评审",
      now: "pipeline { agent any\n  stages { stage('build') { steps { sh 'mvn -B clean package' } } }\n}",
      since: "Jenkins Pipeline（含声明式语法 pipeline { }）自 Jenkins 2.x 起随 Pipeline 插件提供，Jenkins 2.5（2016）起成为核心推荐方式；自由风格任务仍在维护但不再演进",
      why: "自由风格任务的配置是 master 上的 XML，改一次构建步骤要去网页点几下，既不能 code review 也不能随分支走，环境一多就靠人肉复制、逐渐漂移；Jenkinsfile 把流水线变成仓库里的文件，与代码同分支、同评审、同回滚，声明式语法还提供 post、when、parallel、options 等结构化能力，以及断点重启（Restart from Stage）等自由风格配置模型表达不了的特性。",
      risk: "由自由风格改造成流水线最常见的翻车点是脚本安全沙箱：原来在 shell 里随便调用 Groovy/Java 的步骤，在 Jenkinsfile 里会被 `Scripts not permitted to use method ...` 拦住，需要管理员在 In-process Script Approval 逐条批准，未批准就整条流水线失败；其次是凭证 ID 与插件版本必须同步，改造后引用的 credentials('xxx') 在老 master 上是别的 ID 或插件未装，报错点在 withCredentials 而不是构建逻辑，容易被当成语法写错；引入 parallel 之后，原来隐含串行的任务变成并发访问同一工作区，clean 与 package 争抢目录，出现随机失败的 flaky 构建。",
      related: ["ci-jenkins-pipeline","ci-jenkins-parallel","ci-jenkins-when","ci-jenkins-credentials"],
      docs: "https://www.jenkins.io/doc/book/pipeline/"
    }

  );
})();
