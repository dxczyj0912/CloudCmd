/* data/cert.js · 认证与岗位对照
   --------------------------------------------------------------------------
   把站点内容对到真实认证大纲上，缺口一眼可见 —— 也是学习动机最强的一页。
   一条记录 = 一个认证/岗位方向。**只写能核实的公开信息**：
   大纲名称与权重以官方公开页面为准；不确定的宁可写"以官方最新大纲为准"。

   {
     id: 'hcia-cloud-computing',
     name: 'HCIA-Cloud Computing',
     vendor: '华为',
     note: '入门级，考云计算基础、华为云常见服务与基本运维操作',
     domains: [
       { name: '云计算基础概念', weight: '约 10%', catIds: ['linux-basic', 'perf'],
         lessons: ['ls-long'], covered: 'gap',   // covered: high | partial | gap
         note: '本站目前没有虚拟化原理类的课程，只有零散命令条目' }
     ]
   }

   ── 数据来源与写法约定（宁缺勿编） ──
     · 认证名称、颁发方、考试代码、知识域名称：只写厂商 / 基金会公开的认证目录与考试大纲。
     · 权重一栏只在拿到厂商自己发布的大纲文档时才写具体百分比（HCIP-Cloud Computing V4.0
       官方大纲、CNCF 官方 CKA 课程大纲）；其余一律写"以官方最新大纲为准"并注明大纲版本，
       不臆造数字。岗位方向本来就没有官方权重。
     · covered 一律按仓库里 tools/continuity-check.js 的真实统计判断（条目数 / 可跑 /
       被课教过 / 被卡练过 / 孤儿），不凭印象；只有零星条目、没有课程的一律 partial 或 gap。
     · note 里引用的是**内容侧**的数字（条目数 / 课程数 / 卡片数 / 被课教过 / 孤儿），
       不引用"可跑"条数 —— 那一项随引擎实现进度天天在变，写进来第二天就过期了。

   校验：node tools/kb-check.js（字段、长度、引用是否断链、命令是否可跑）
   渲染：#/cert（见 assets/js/render.js 的 viewKb）
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_CERT = window.CC_CERT || [];

  /* ── 1. 华为云计算入门：HCIA-Cloud Computing ───────────────────────────── */
  window.CC_CERT.push({
    id: 'hcia-cloud-computing',
    name: 'HCIA-Cloud Computing',
    vendor: '华为',
    note: '华为入门级云计算认证，考试代码 H13-511。四大模块：基础通识知识（服务器 / 存储 / 网络 / 操作系统）、虚拟化 FusionCompute、桌面云 FusionAccess、云计算发展趋势，全部为笔试。本站偏命令行与云上实操，FusionCompute 与 FusionAccess 两大块基本空白。',
    domains: [
      { name: '云计算概述', weight: '以官方最新大纲为准（V5.5）',
        catIds: [], lessons: [], covered: 'gap',
        note: '站内没有云计算定义、服务模型（IaaS/PaaS/SaaS）与部署模式这类概念课，云 CLI 分类里的实操条目替代不了这一块。' },

      { name: '服务器基础', weight: '以官方最新大纲为准（V5.5）',
        catIds: [], lessons: [], covered: 'gap',
        note: '服务器硬件与关键技术站内完全没有；最接近的 kvm 分类只有 25 条虚拟化命令，讲的是虚拟机不是服务器硬件本身。' },

      { name: '存储技术基础', weight: '以官方最新大纲为准（V5.5）',
        catIds: ['linux-storage'],
        lessons: ['du-culprit', 'df-inode', 'ls-findmnt-which-device', 'ls-io-bottleneck', 'ls-lvm-why', 'ls-smart-disk-failing', 'ls-raid-degraded'],
        covered: 'partial',
        note: '磁盘与存储 46 条命令覆盖分区、LVM、挂载、NFS、RAID，13 节课已涵盖容量排查、IO 瓶颈判定与磁盘寿命预警，14 张卡片；块存储与分布式存储原理没有内容。' },

      { name: '网络技术基础', weight: '以官方最新大纲为准（V5.5）',
        catIds: ['linux-net'],
        lessons: ['ss-listen', 'curl-head', 'net-where-is-the-latency', 'net-dns-resolution-wrong', 'net-tcpdump-did-it-arrive', 'net-route-missing', 'net-port-who-holds-it'],
        covered: 'partial',
        note: '网络与排障 56 条命令覆盖 IP、端口、链路与抓包，12 节课已能练时延定责、DNS 定位、抓包判到达、路由反查与端口归属；考纲要的交换与路由基础站内没有对应课程。' },

      { name: '操作系统基础', weight: '以官方最新大纲为准（V5.5）',
        catIds: ['linux-basic', 'linux-user'],
        lessons: ['ls-long', 'ls-time', 'basic-copy-move', 'basic-perm-tree', 'basic-tar-backup', 'basic-free-space', 'tail-follow'],
        covered: 'high',
        note: '本站最扎实的一块：Linux 基础与用户权限两个分类共 116 条命令、29 张卡片，其中 7 节课专讲文件与权限，深度明显超过考纲要求的"Linux 基本操作"。' },

      { name: '虚拟化技术介绍', weight: '以官方最新大纲为准（V5.5）',
        catIds: ['kvm'], lessons: ['kvm-image-inventory', 'kvm-vm-down'], covered: 'partial',
        note: '虚拟化与镜像 25 条命令把 virsh、qemu-img、cloud-init 的对象关系列全了，6 节课覆盖镜像清点与虚机排障；但底层虚拟化原理仍只能自己补。' },

      { name: '华为虚拟化平台介绍', weight: '以官方最新大纲为准（V5.5）',
        catIds: [], lessons: [], covered: 'gap',
        note: 'FusionCompute 的产品定位与规划部署（VRM / CNA）站内没有任何内容；云 CLI 里的华为云命令是公有云 API，与私有云虚拟化平台不是一回事。' },

      { name: '华为虚拟化平台管理与使用', weight: '以官方最新大纲为准（V5.5）',
        catIds: [], lessons: [], covered: 'gap',
        note: 'V5.5 大纲里权重最高的知识域，考 FusionCompute 的计算 / 存储 / 网络虚拟化与平台管理；站内既没有课程也没有命令条目，是考证最大的缺口。' },

      { name: '桌面云解决方案概述', weight: '以官方最新大纲为准（V5.5）',
        catIds: [], lessons: [], covered: 'gap',
        note: 'FusionAccess 组件划分、HDP 桌面协议、典型使用场景，站内均无对应内容。' },

      { name: '桌面云规划及部署', weight: '以官方最新大纲为准（V5.5）',
        catIds: ['kvm'], lessons: [], covered: 'gap',
        note: '组件规划、安装与初始化配置站内没有；kvm 分类里的 cloud-init 与镜像制作是公有云镜像视角，替代不了桌面云部署实验。' },

      { name: '桌面云业务发放', weight: '以官方最新大纲为准（V5.5）',
        catIds: [], lessons: [], covered: 'gap',
        note: '业务封装、模板制作、桌面发放都是 FusionAccess 的界面操作，站内没有可替代的实验内容。' },

      { name: '桌面云特性与管理', weight: '以官方最新大纲为准（V5.5）',
        catIds: [], lessons: [], covered: 'gap',
        note: '策略管理、业务调整与日常告警处理，站内均无对应内容。' },

      { name: '云计算发展趋势', weight: '以官方最新大纲为准（V5.5）',
        catIds: ['docker', 'kubernetes'], lessons: ['dk-ps-all', 'k8s-get-pods', 'k8s-rollout-verify', 'k8s-node-maintenance'], covered: 'partial',
        note: '考纲只要求 OpenStack 与新兴技术简介：OpenStack 站内没有，但容器与 K8s 方向（161 条命令、51 节课、78 张卡片）考得比这一小块深得多。' }
    ]
  });

  /* ── 2. 华为云计算进阶：HCIP-Cloud Computing ──────────────────────────── */
  window.CC_CERT.push({
    id: 'hcip-cloud-computing',
    name: 'HCIP-Cloud Computing',
    vendor: '华为',
    note: '华为云计算中级认证，考试代码 H13-527。官方 V4.0 大纲只有两大知识域并公布了占比：华为服务器虚拟化产品介绍 40%、华为桌面云产品介绍 60%，均为笔试。两大块都是 FusionCompute / FusionAccess 产品操作，站内几乎没有对应内容 —— 这一页的缺口栏就是它。',
    domains: [
      { name: 'FusionCompute 产品介绍', weight: '以官方最新大纲为准（V4.0，隶属 40% 模块）',
        catIds: ['kvm'], lessons: [], covered: 'gap',
        note: '产品架构与部署规划站内没有；kvm 分类的 25 条命令只覆盖 KVM 侧对象，替代不了 FusionCompute 的产品认知。' },

      { name: 'FusionCompute 计算虚拟化介绍', weight: '以官方最新大纲为准（V4.0，隶属 40% 模块）',
        catIds: ['kvm'], lessons: [], covered: 'gap',
        note: 'CPU / 内存虚拟化原理、超分配、集群与调度策略站内没有课程；kvm 分类偏命令行对象管理，不涉及这些原理。' },

      { name: 'FusionCompute 存储虚拟化介绍', weight: '以官方最新大纲为准（V4.0，隶属 40% 模块）',
        catIds: ['linux-storage'], lessons: ['du-culprit', 'df-inode', 'ls-lvm-why'], covered: 'partial',
        note: '磁盘与存储 46 条命令能建立存储对象与容量排查的手感；但数据存储、精简置备、存储热迁移这些虚拟化存储概念站内没有。' },

      { name: 'FusionCompute 网络虚拟化介绍', weight: '以官方最新大纲为准（V4.0，隶属 40% 模块）',
        catIds: ['linux-net'], lessons: ['ss-listen', 'net-route-missing'], covered: 'partial',
        note: '网络与排障 56 条命令能支撑二层三层与端口排查的基础；虚拟交换机、VLAN 池、端口组这些平台侧配置站内没有课程。' },

      { name: 'FusionCompute 虚拟机发放与管理', weight: '以官方最新大纲为准（V4.0，隶属 40% 模块）',
        catIds: ['kvm'], lessons: ['kvm-provision-web02'], covered: 'partial',
        note: 'virsh 启停与快照、qemu-img、cloud-init 能对上虚拟机生命周期的手感，6 节课已含虚机发放与离线救援；但平台侧的模板与规格管理站内没有。' },

      { name: 'FusionCompute 日常维护和故障处理', weight: '以官方最新大纲为准（V4.0，隶属 40% 模块）',
        catIds: ['monitor', 'linux-storage'], lessons: ['mon-load-vs-cores', 'mon-io-bottleneck', 'mon-process-vanished'], covered: 'partial',
        note: '监控与日志 42 条命令、16 节课能覆盖主机层面的负载、IO 与进程消失判断；告警处理、VRM 主备、CNA 节点故障这些平台运维内容站内没有。' },

      { name: 'FusionAccess 桌面云解决方案介绍', weight: '以官方最新大纲为准（V4.0，隶属 60% 模块）',
        catIds: [], lessons: [], covered: 'gap',
        note: '桌面云组件、HDP 协议、使用场景站内完全没有对应内容。' },

      { name: 'FusionAccess 桌面云组件介绍与安装', weight: '以官方最新大纲为准（V4.0，隶属 60% 模块）',
        catIds: [], lessons: [], covered: 'gap',
        note: '组件规划与安装流程站内没有，也没有同类可替代的实验。' },

      { name: 'FusionAccess 桌面云业务发放', weight: '以官方最新大纲为准（V4.0，隶属 60% 模块）',
        catIds: [], lessons: [], covered: 'gap',
        note: '模板制作与桌面发放是纯 FusionAccess 界面操作，站内没有对应内容。' },

      { name: 'FusionAccess 桌面云运维与管理', weight: '以官方最新大纲为准（V4.0，隶属 60% 模块）',
        catIds: [], lessons: [], covered: 'gap',
        note: '策略管理与业务调整站内没有；站内的 systemd / journalctl 课是通用 Linux 服务排查，不能算作桌面云运维的覆盖。' },

      { name: 'FusionAccess 桌面云故障处理', weight: '以官方最新大纲为准（V4.0，隶属 60% 模块）',
        catIds: [], lessons: [], covered: 'gap',
        note: '桌面云故障案例站内没有；K8s 与 Docker 的排障课与桌面云无关，不计入覆盖。' }
    ]
  });

  /* ── 3. 华为公有云服务入门：HCIA-Cloud Service ────────────────────────── */
  window.CC_CERT.push({
    id: 'hcia-cloud-service',
    name: 'HCIA-Cloud Service',
    vendor: '华为',
    note: '华为公有云服务入门认证，考试代码 H13-811。考云基础、计算 / 网络 / 存储云服务、华为云运维基础，以及数据库等"更多云服务"怎么用。本站的华为云 CLI 分类（71 条命令、11 节课、27 张卡片）是与它最贴近的一块，但控制台操作与服务原理没有覆盖。',
    domains: [
      { name: '云基础介绍', weight: '以官方最新大纲为准（V3.5）',
        catIds: ['cloud-cli'], lessons: ['hw-cli-profile'], covered: 'partial',
        note: '"先确认你在操作哪个区域"这节课建立了账号与区域的概念；但云计算基础、公有云概念本身站内没有课程。' },

      { name: '计算云服务', weight: '以官方最新大纲为准（V3.5）',
        catIds: ['cloud-cli', 'docker', 'kubernetes'], lessons: ['hw-ecs-inventory', 'dk-ps-all'], covered: 'partial',
        note: '弹性云服务器与镜像服务有命令（取 ECS 清单有课），CCE 有集群列表与 kubeconfig 条目；弹性伸缩、裸金属站内没有，容器部分讲的是自建 Docker / K8s 而不是 CCE 托管服务。' },

      { name: '网络云服务', weight: '以官方最新大纲为准（V3.5）',
        catIds: ['cloud-cli', 'linux-net'], lessons: ['hw-sg-3306', 'ss-listen'], covered: 'partial',
        note: 'VPC 与安全组有命令，"数据库连不上，先去查安全组"这节课把云上端口排查链路走通了；EIP、ELB 只有命令条目没有课程，VPN 与 NAT 网关站内没有。' },

      { name: '存储云服务', weight: '以官方最新大纲为准（V3.5）',
        catIds: ['cloud-cli', 'linux-storage'], lessons: ['hw-obs-publish', 'hw-obs-publish-dryrun', 'hw-evs-unattached'], covered: 'partial',
        note: 'OBS 有 hcloud 与 obsutil 两组命令和 2 节站点发布课（含 sync 干跑预演），云硬盘有挂载与扩容条目及"没人挂的云盘还在计费"1 节课；弹性文件服务、云备份服务站内没有条目。' },

      { name: '华为云运维基础', weight: '以官方最新大纲为准（V3.5）',
        catIds: ['cloud-cli', 'monitor'], lessons: ['hw-cli-profile', 'hw-ces-metric-first', 'hw-iam-ak-audit', 'mon-load-vs-cores'], covered: 'partial',
        note: 'IAM 密钥审计与云监控 CES 取第一手指标都有课；云日志只有 1 条条目，消息通知、云审计站内没有 —— 这一块仍有命令、缺体系。' },

      { name: '更多云服务', weight: '以官方最新大纲为准（V3.5）',
        catIds: ['db-cache', 'security'], lessons: ['db-mysql-slow-query', 'db-redis-bigkeys', 'sec-chain-incomplete'], covered: 'partial',
        note: '数据库类最扎实：数据库与缓存 56 条命令、11 节课、34 张卡片，慢查询与主从复制都有课；安全类 38 条、8 节课（含入侵排查链路），CDN、AI 与大数据、API 网关站内基本没有。' }
    ]
  });

  /* ── 4. Kubernetes 管理员：CKA ────────────────────────────────────────── */
  window.CC_CERT.push({
    id: 'cka',
    name: 'CKA（Certified Kubernetes Administrator）',
    vendor: 'CNCF / Linux Foundation',
    note: '云原生计算基金会（CNCF）的 Kubernetes 管理员认证，全程实操机考。官方课程大纲分五个知识域并公布权重，其中故障排查占 30%。本站 Kubernetes 分类有 80 条命令、32 张卡片、27 节课，是几个方向里最接近考纲的一块，但集群安装与存储明显偏薄。',
    domains: [
      { name: '集群架构、安装与配置（Cluster Architecture, Installation & Configuration）', weight: '25%',
        catIds: ['kubernetes', 'kvm', 'iac'], lessons: ['k8s-nodes', 'k8s-etcd-backup'], covered: 'partial',
        note: 'kubeadm 初始化 / 加入 / 升级 / reset、etcdctl 快照备份恢复、crictl、RBAC 都有命令条目，且 etcd 快照备份有 1 节专门课；但集群搭建与证书轮换仍没有实验课。' },

      { name: '工作负载与调度（Workloads & Scheduling）', weight: '15%',
        catIds: ['kubernetes', 'helm'], lessons: ['k8s-get-pods', 'k8s-top', 'k8s-one-off-job', 'k8s-taint-scheduling', 'k8s-label-scheduling'], covered: 'partial',
        note: 'Deployment / StatefulSet / Job / CronJob、ConfigMap / Secret、taint 与亲和性、HPA、PDB 都有条目，且污点调度、标签调度、一次性任务都有课；但仍没有一节讲怎么从零写这些工作负载。' },

      { name: '服务与网络（Services & Networking）', weight: '20%',
        catIds: ['kubernetes', 'linux-net'], lessons: ['k8s-endpoints', 'k8s-pod-dns-broken', 'k8s-port-forward-no-expose', 'ss-listen', 'net-port-who-holds-it'], covered: 'partial',
        note: 'Service、Endpoints、Ingress、NetworkPolicy、集群 DNS 都有条目，Service 不通与 Pod 内 DNS 解析失败都有完整排查课；Ingress 控制器与 CNI 插件的部署配置站内没有。' },

      { name: '存储（Storage）', weight: '10%',
        catIds: ['kubernetes', 'linux-storage', 'docker'], lessons: ['du-culprit', 'dk-df', 'ls-lsblk-before-mount', 'ls-new-disk-not-visible'], covered: 'partial',
        note: 'K8s 侧只有 PV / PVC 与 StorageClass 两条命令条目；磁盘侧已能练"盘挂在哪"与"新盘系统看不见"两条链路，但没有一节讲 PV / PVC 绑定与 StorageClass 动态供给。' },

      { name: '故障排查（Troubleshooting）', weight: '30%',
        catIds: ['kubernetes', 'docker', 'monitor'],
        lessons: ['k8s-get-pods', 'k8s-describe', 'k8s-logs-prev', 'k8s-endpoints', 'k8s-events', 'k8s-events-timeline', 'k8s-pod-running-but-broken', 'k8s-node-pressure', 'k8s-node-maintenance'],
        covered: 'high',
        note: '权重最高也最成体系：9 节循序渐进的排障课 + 32 张卡片 + 针对 Pending / CrashLoop / ImagePull / NodeNotReady 的专门条目。控制面组件与 kubelet 证书类故障仍只有命令条目、没有课。' }
    ]
  });

  /* ── 5. 岗位方向：Linux 运维工程师 ────────────────────────────────────── */
  window.CC_CERT.push({
    id: 'linux-ops-role',
    name: 'Linux 运维工程师',
    vendor: '岗位方向',
    note: '这不是一个认证，而是招聘市场上 Linux 运维 / 云运维岗位反复出现的能力项，按本站 18 个分类的划分整理，因此没有官方权重。覆盖判断全部来自站内真实统计：863 条命令、188 节课、398 张卡片，其中 136 条命令既没被课教过也没被卡练过。',
    domains: [
      { name: '文件与权限', weight: '无官方权重（岗位方向）',
        catIds: ['linux-basic', 'linux-user'],
        lessons: ['ls-long', 'ls-time', 'basic-copy-move', 'basic-perm-tree', 'basic-tar-backup', 'basic-free-space', 'tail-follow'],
        covered: 'high',
        note: '站内最扎实的一块：两个分类共 116 条命令、29 张卡片，从看清大小与时间、复制改名、权限归属到打包留档，7 节课配的都是能在终端执行的真实场景。' },

      { name: '文本处理', weight: '无官方权重（岗位方向）',
        catIds: ['linux-text'], lessons: ['grep-context', 'grep-invert', 'awk-topip'], covered: 'partial',
        note: 'grep / sed / awk / jq 共 42 条命令，8 节课（捞错误行、排除噪音、统计 TopIP）已能覆盖日志分析主线；sed 与 jq 仍没有专门课。' },

      { name: '网络排障', weight: '无官方权重（岗位方向）',
        catIds: ['linux-net'],
        lessons: ['ss-listen', 'curl-head', 'lsof-deleted', 'net-where-is-the-latency', 'net-dns-resolution-wrong', 'net-tcpdump-did-it-arrive', 'net-kill-one-connection', 'net-route-missing', 'net-traceroute-where-broken', 'net-port-who-holds-it', 'net-link-mtu-down'],
        covered: 'high',
        note: '56 条命令覆盖 ip / ss / curl / tcpdump / ssh 端口转发，12 节课把"时延定责 → DNS 定位 → 抓包判到达 → 路由反查 → 端口归属 → 链路状态"整条链路走通了，是岗位方向上最接近实战的一块。' },

      { name: '存储管理', weight: '无官方权重（岗位方向）',
        catIds: ['linux-storage'],
        lessons: ['du-culprit', 'df-inode', 'ls-findmnt-which-device', 'ls-io-bottleneck', 'ls-disk-perf-baseline', 'ls-lvm-why', 'ls-smart-disk-failing', 'ls-raid-degraded', 'ls-new-disk-not-visible'],
        covered: 'high',
        note: '命令最全的一块：46 条覆盖分区、LVM 全流程、文件系统、挂载、NFS、RAID 与 IO 观测，13 节课已含容量排查、IO 瓶颈定位、LVM 在线扩容、SMART 寿命预警与软 RAID 降级识别。' },

      { name: 'Shell 脚本', weight: '无官方权重（岗位方向）',
        catIds: ['shell'],
        lessons: ['sh-log-archive-loop', 'sh-hosts-inventory-loop', 'sh-timestamp-filename', 'sh-param-fallback', 'sh-stderr-log', 'sh-pipe-subshell-trap', 'sh-case-dispatch'],
        covered: 'high',
        note: '36 条命令把变量、流程控制、函数、getopts、set -euo pipefail、trap 都列全了，7 节课覆盖循环归档、批量主机清单、时间戳命名、参数兜底、错误分流、子 shell 陷阱与 case 分派 —— 能动手练脚本了。' },

      { name: '服务与守护进程', weight: '无官方权重（岗位方向）',
        catIds: ['linux-user', 'middleware'],
        lessons: ['systemctl-status', 'journalctl-unit', 'mw-nginx-test-reload', 'mw-nginx-bad-conf'], covered: 'partial',
        note: 'systemd 状态与日志 2 节课、Nginx 配置校验与 reload 2 节课，链路完整；但中间件分类 30 条只有 4 条被课教过，Tomcat / HAProxy / Keepalived / ETCD 都没有课。' },

      { name: '性能与可观测性', weight: '无官方权重（岗位方向）',
        catIds: ['monitor', 'perf'],
        lessons: ['mon-load-vs-cores', 'mon-io-bottleneck', 'mon-free-vs-available', 'mon-look-back-yesterday', 'mon-find-the-noisy-process', 'mon-process-vanished', 'mon-java-thread-stuck', 'mon-java-heap-where', 'mon-cpu-hotspot-flame', 'perf-baseline-http', 'perf-result-longtail', 'perf-kernel-tuning'],
        covered: 'high',
        note: '监控与日志 42 条命令加 16 节课（负载/IO/内存判定、历史采样回看、定位噪声进程、进程消失、Java 线程栈与堆、perf 火焰图、告警静默），性能压测与调优 25 条另有 6 节课（压测基线、长尾延迟、IO 与内核参数调优）。' },

      { name: '容器与编排', weight: '无官方权重（岗位方向）',
        catIds: ['docker', 'kubernetes', 'helm'],
        lessons: ['dk-ps-all', 'dk-logs', 'dk-exitcode', 'dk-df', 'dk-inspect-net', 'dk-container-keeps-restarting', 'dk-disk-eaten-by-docker',
                  'k8s-get-pods', 'k8s-describe', 'k8s-logs-prev', 'k8s-endpoints', 'k8s-events', 'k8s-rollout-verify', 'k8s-pod-dns-broken', 'k8s-node-maintenance',
                  'hl-release-inventory', 'hl-template-before-install'],
        covered: 'high',
        note: '站内最成体系的一块：三个分类 161 条命令、51 节课、78 张卡片，从 Docker 到 K8s 再到 Helm 的排障与上线前检查链路完整。' },

      { name: '云平台操作', weight: '无官方权重（岗位方向）',
        catIds: ['cloud-cli', 'iac'],
        lessons: ['hw-cli-profile', 'hw-ecs-inventory', 'hw-sg-3306', 'hw-obs-publish', 'hw-iam-ak-audit', 'iac-tf-plan-review', 'iac-tf-destroy-triage', 'iac-ans-idempotent-check'],
        covered: 'partial',
        note: '华为云 CLI 71 条命令、11 节课、27 张卡片（区域确认、ECS 清单、安全组排查、OBS 发布、密钥审计）最贴近云岗位；Terraform / Ansible 45 条另有 6 节课（plan 评审、destroy 排障、幂等性检查），厂商侧认证考的控制台操作仍未覆盖。' },

      { name: 'CI/CD', weight: '无官方权重（岗位方向）',
        catIds: ['cicd'], lessons: ['ci-git-commit-config', 'ci-git-branch-fix', 'ci-git-log-tag'], covered: 'partial',
        note: 'Git 三条主线（提交改动、hotfix 分支、找可回滚版本）有课，41 条命令里 10 条被课教过，是被课教最多的分类；Jenkins 与 GitLab CI 只有命令条目、没有课程。' }
    ]
  });
})();
