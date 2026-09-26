/* data/helm.js · 分类 09 Helm 包管理 */
(function () {
  'use strict';

  var catId = 'helm';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. 仓库与检索 ================= */

    /* ---------- 1 / 25 ---------- */
    {
      id: 'hl-repo-add',
      name: 'helm repo add / update',
      alias: ['helm repo remove', 'helm repo index', '添加 helm 仓库', '更新仓库索引'],
      level: 1,
      syntax: 'helm repo add <仓库名> <仓库地址> [选项]\nhelm repo update [仓库名 ...]',
      summary: '添加 Chart 仓库并同步索引，装 Chart 之前的第一步。',
      desc: '`helm repo add` 只是把「仓库名 → 地址」写进本地配置并下载索引，不下载任何 Chart；索引会过期，所以每次装 Chart 前先跑 `helm repo update` 刷新。华为云场景可以指向 SWR 的 OCI 仓库（`oci://swr.cn-north-4.myhuaweicloud.com/<组织名>`），私有仓库用 `--username`/`--password` 或先 `helm registry login`。',
      params: [
        { flag: '--username / --password', desc: '私有仓库的账号密码，也可用 `--password-stdin` 从标准输入读' },
        { flag: '--force-update', desc: '同名仓库地址变了时强制覆盖' },
        { flag: '--insecure-skip-tls-verify', desc: '跳过 HTTPS 证书校验，仅自签证书的内网仓库使用' },
        { flag: '--ca-file / --cert-file / --key-file', desc: '指定自签 CA 与客户端证书，比跳过校验安全' },
        { flag: '--no-update', desc: '只写配置不抓索引，离线环境用' }
      ],
      examples: [
        { cmd: 'helm repo add bitnami https://charts.bitnami.com/bitnami', desc: '添加最常用的 Bitnami 官方仓库' },
        { cmd: 'helm repo add huawei https://charts.huaweicloud.com/repository/helm-charts', desc: '添加华为云开源镜像站的 Chart 仓库' },
        { cmd: 'helm repo add myorg oci://swr.cn-north-4.myhuaweicloud.com/myorg', desc: '把华为云 SWR 的 OCI 命名空间当仓库用（Helm 3.8+）' },
        { cmd: 'helm repo add private https://helm.internal.example.com --username admin --password-stdin', desc: '加私有仓库并交互输入密码，避免密码进 shell 历史' },
        { cmd: 'helm repo update && helm repo list', desc: '刷完索引立刻确认仓库清单，日常固定动作' },
        { cmd: 'helm repo remove bitnami', desc: '删除不再使用的仓库配置与缓存' }
      ],
      notes: [
        '`helm repo add` 不会校验 Chart 是否存在，仓库地址写错也能成功，要到 `helm search repo` 或 `helm install` 时才报错',
        '索引缓存在 `~/.cache/helm/repository/`（macOS 在 `~/Library/Caches/helm/`），报 `no cached repo found` 时先 `helm repo update`',
        'OCI 仓库不支持 `helm search repo`，只能 `helm show chart oci://...` 直接查看',
        '密码写在命令行会留在 `~/.bash_history`，生产环境一律用 `--password-stdin` 或 `helm registry login`'
      ],
      related: ['hl-repo-list', 'hl-repo-search', 'hl-install', 'hl-pull', 'dk-pull'],
      docs: 'https://helm.sh/docs/helm/helm_repo_add/',
      tags: ['仓库', '索引', 'Chart']
    },

    /* ---------- 2 / 25 ---------- */
    {
      id: 'hl-repo-list',
      name: 'helm repo list',
      alias: ['helm repo ls', '列出仓库'],
      level: 1,
      syntax: 'helm repo list [选项]',
      summary: '列出本地已配置的 Chart 仓库，排错时先看它。',
      desc: '输出 `NAME` 与 `URL` 两列，只反映本地 `repositories.yaml` 的内容，不代表远端仓库可用。`helm repo list` 配 `helm repo update` 可以快速确认「索引是不是太久没刷了」。',
      params: [
        { flag: '-o, --output', desc: '输出格式：`table`（默认）/ `json` / `yaml`，脚本里用 json' },
        { flag: '--no-headers', desc: '不打印表头，方便 `awk` 取字段' }
      ],
      examples: [
        { cmd: 'helm repo list', desc: '查看当前所有仓库名与地址' },
        { cmd: 'helm repo list -o json', desc: '输出 JSON，交给 jq 或脚本解析' },
        { cmd: 'helm repo list --no-headers | awk \'{print $1}\'', desc: '只取仓库名，用于批量 `helm repo update`' }
      ],
      notes: [
        '仓库配置存在 `~/.config/helm/repositories.yaml`，可以在 CI 里通过挂载这份文件复用仓库配置',
        '列表里有仓库但 `helm search repo` 搜不到 Chart，多半是索引未下载或已过期，执行 `helm repo update` 重建'
      ],
      related: ['hl-repo-add', 'hl-repo-search', 'hl-pull'],
      docs: 'https://helm.sh/docs/helm/helm_repo_list/',
      tags: ['仓库', '列表', '排错']
    },

    /* ---------- 3 / 25 ---------- */
    {
      id: 'hl-repo-search',
      name: 'helm search repo / hub',
      alias: ['helm search hub', '搜索 chart', '查找 chart'],
      level: 1,
      syntax: 'helm search repo [关键词] [选项]\nhelm search hub [关键词] [选项]',
      summary: '在本地已加仓库或 Artifact Hub 上搜 Chart 并看版本。',
      desc: '`helm search repo` 只搜**本地索引**，速度快、结果少；`helm search hub` 搜公网 Artifact Hub，覆盖广但需要联网。看某个 Chart 的全部历史版本用 `--versions`，这一步决定了后面 `helm install --version` 能不能写死版本号。',
      params: [
        { flag: '--versions', desc: '列出所有可用版本，不只是最新版' },
        { flag: '-l, --list', desc: '等价于 `--versions` 的简写形式（部分版本支持）' },
        { flag: '-o, --output', desc: '输出 `table` / `json` / `yaml`' },
        { flag: '--version', desc: '按语义化版本约束过滤，如 ">=1.2.0 <2.0.0"' },
        { flag: '--max-col-width', desc: '控制 DESCRIPTION 列宽，列太挤时调大' }
      ],
      examples: [
        { cmd: 'helm search repo nginx', desc: '在本仓库索引里搜 nginx 相关 Chart' },
        { cmd: 'helm search repo bitnami/mysql --versions', desc: '看 MySQL Chart 的全部版本，挑一个稳定版固定下来' },
        { cmd: 'helm search repo nginx --version ">=15.0.0"', desc: '只列 15.0.0 以上的版本' },
        { cmd: 'helm search hub redis', desc: '在 Artifact Hub 上搜 redis（需联网，结果含各种第三方仓库）' },
        { cmd: 'helm search repo database -o json | jq -r \'.[].name\'', desc: '以 JSON 输出并抽出 Chart 名，便于脚本处理' }
      ],
      notes: [
        '`helm search hub` 的结果需要自己 `helm repo add` 对应仓库后才能安装，它不是仓库本身',
        '搜不到不等于不存在：先 `helm repo update`，再确认关键词大小写与仓库范围',
        '安装时写 `--version` 才可复现，只写 Chart 名会用最新版，多人协作容易装出不同结果'
      ],
      related: ['hl-repo-add', 'hl-repo-list', 'hl-install', 'hl-show'],
      docs: 'https://helm.sh/docs/helm/helm_search_repo/',
      tags: ['检索', 'Chart', '版本']
    },

    /* ================= B. 安装与升级 ================= */

    /* ---------- 4 / 25 ---------- */
    {
      id: 'hl-install',
      name: 'helm install',
      alias: ['helm install --dry-run', 'helm install --create-namespace', '安装 chart'],
      level: 2,
      syntax: 'helm install <Release名> <Chart> [选项]',
      summary: '把 Chart 渲染成 K8s 资源并创建发布，首次部署用它。',
      desc: 'Release 名是集群内该次安装的唯一标识，同一 namespace 下不能重名。Chart 可以写仓库路径（`bitnami/nginx`）、本地目录（`./mychart`）、tgz 包或 OCI 地址。生产上常用 `--dry-run` 先看渲染结果、`--wait` 等 Pod 就绪再返回，并按环境分别传 `-f values-prod.yaml`。',
      params: [
        { flag: '-f, --values', desc: '指定 values 文件覆盖默认值，可重复传多个，右边的优先' },
        { flag: '--set', desc: '命令行覆盖单个值，如 `--set image.tag=1.0.0`；优先级高于 `-f`' },
        { flag: '-n, --namespace', desc: '安装到指定命名空间，默认是当前 kubeconfig 的 namespace' },
        { flag: '--create-namespace', desc: '命名空间不存在时自动创建（Helm 3.2+）' },
        { flag: '--wait', desc: '等所有资源就绪（Deployment/PVC/Service）才返回，CI 里必加' },
        { flag: '--timeout', desc: '等待超时，默认 5m0s，配合 `--wait` 一起用' },
        { flag: '--dry-run', desc: '只渲染并打印，不真正提交到集群' },
        { flag: '--atomic', desc: '失败自动回滚到上一个正常版本，等价于 `--wait` + 失败回滚' }
      ],
      examples: [
        { cmd: 'helm install my-nginx bitnami/nginx --namespace web --create-namespace', desc: '最简安装：新建 web 命名空间并装一个 Nginx' },
        { cmd: 'helm install my-app ./charts/my-app -n prod -f values-prod.yaml --wait --timeout 10m', desc: '用生产 values 安装本地 Chart，并等资源全部就绪' },
        { cmd: 'helm install my-app bitnami/mysql --version 9.3.1 --set auth.rootPassword=Str0ngPass -n db', desc: '固定 Chart 版本并用 `--set` 传密码' },
        { cmd: 'helm install my-app ./charts/my-app -n prod -f values.yaml --set image.tag=1.4.2 --dry-run --debug', desc: '上线前本地演练，确认渲染出的 YAML 正确' },
        { cmd: 'helm install my-app oci://swr.cn-north-4.myhuaweicloud.com/myorg/my-app --version 1.0.0 -n prod', desc: '从华为云 SWR 的 OCI 仓库安装 Chart' }
      ],
      notes: [
        '`--set` 的值类型会按 Helm 的规则解析：`--set replicas=3` 是整数，`3` 想当字符串要写 `--set-string`；含逗号、点号的值必须转义，复杂结构优先用 `-f`',
        '`-f` 是**整体覆盖**语义，不是深合并：values 文件里没写的字段才用 Chart 默认值，写了空 map 就会真的清空',
        '`--create-namespace` 只在 Helm 3.2 以上可用，老版本要先 `kubectl create ns`',
        '加了 `--wait` 却超时，`helm list` 里会看到 `failed` 状态，资源可能已经创建了一半，要么 `helm rollback` 要么 `helm uninstall` 清干净再重来',
        '在 CCE 上装 Chart 前确认 `kubectl config current-context` 指向目标集群，避免装错环境'
      ],
      related: ['hl-upgrade-install', 'hl-uninstall', 'hl-template', 'hl-status', 'k8s-apply', 'k8s-cce-kubeconfig'],
      docs: 'https://helm.sh/docs/helm/helm_install/',
      tags: ['安装', 'Chart', 'Release']
    },

    /* ---------- 5 / 25 ---------- */
    {
      id: 'hl-upgrade',
      name: 'helm upgrade',
      alias: ['helm upgrade --reuse-values', 'helm upgrade --atomic', '升级 release'],
      level: 2,
      syntax: 'helm upgrade <Release名> <Chart> [选项]',
      summary: '把已存在的 Release 升级到新 Chart 或新配置。',
      desc: 'Release 不存在时 `helm upgrade` 直接报错 `has no deployed releases`，这正是 `--install` 存在的意义。升级时 Helm 走「三路合并」：旧 Chart 默认值、旧 values、你新传的 values，所以**不带 `-f` 的升级常常会把上次的自定义值丢掉**，生产脚本里一般显式带上完整 values 或用 `--reuse-values`。',
      params: [
        { flag: '--install', desc: 'Release 不存在时自动执行安装（幂等部署的关键）' },
        { flag: '--reuse-values', desc: '沿用上次的值，只用 `--set` 增量覆盖；与 `-f` 同用时 `-f` 被忽略' },
        { flag: '--reset-values', desc: '丢弃历史值，完全以本次 `-f`/`--set` 为准（默认行为）' },
        { flag: '--atomic', desc: '升级失败自动回滚到上一个版本' },
        { flag: '--cleanup-on-fail', desc: '失败时清理本次新建的资源' },
        { flag: '--wait / --timeout', desc: '等待资源就绪与超时时间，CI 场景必加' },
        { flag: '--force', desc: '资源冲突无法更新时强制替换（会先删后建，慎用）' }
      ],
      examples: [
        { cmd: 'helm upgrade my-app ./charts/my-app -n prod -f values-prod.yaml --wait --timeout 10m', desc: '标准升级：带完整生产 values 并等待就绪' },
        { cmd: 'helm upgrade my-app bitnami/nginx --version 15.4.0 -n web --reuse-values --set image.tag=1.25.4', desc: '只升 Chart 版本并沿用旧配置，只改镜像标签' },
        { cmd: 'helm upgrade my-app ./charts/my-app -n prod -f values-prod.yaml --atomic --timeout 5m', desc: '带自动回滚的升级，失败不留半成品' },
        { cmd: 'helm upgrade my-app ./charts/my-app -n prod -f values-prod.yaml --dry-run --debug', desc: '升级前对比渲染结果，确认没有意外改动' }
      ],
      notes: [
        '`--reuse-values` 与 `-f` 互斥地「打架」：同时给出时 `-f` 不生效，只会用历史值加 `--set`，这是生产事故的常见来源',
        '升级不会自动回收已删除的资源：Chart 里去掉的 Deployment，升级后仍留在集群，需要 `kubectl delete` 手动清理',
        '`--force` 对 StatefulSet、PVC 等有状态资源的替换风险很高，非必要不用',
        '升级前后用 `helm history` 与 `helm get values` 留痕，回滚时才知道该回到哪个 revision'
      ],
      related: ['hl-upgrade-install', 'hl-rollback', 'hl-history', 'hl-get', 'hl-install', 'k8s-rollout'],
      docs: 'https://helm.sh/docs/helm/helm_upgrade/',
      tags: ['升级', 'Release', '回滚']
    },

    /* ---------- 6 / 25 ---------- */
    {
      id: 'hl-upgrade-install',
      name: 'helm upgrade --install',
      alias: ['helm upgrade -i', '幂等部署', 'helm 幂等安装'],
      level: 2,
      syntax: 'helm upgrade --install <Release名> <Chart> [选项]',
      summary: '不存在就装、存在就升，CI 里部署同一 Release 的标准写法。',
      desc: '这是 Helm 在流水线里最该出现的一条命令：同一条命令既可以首次部署，也可以后续升级，脚本不需要判断 `helm list` 里有没有这个 Release。配合 `-n <命名空间> --create-namespace`、`-f <环境 values>`、`--atomic --wait` 就构成一套可重复执行的发布动作，重复跑多少次结果都一致。',
      params: [
        { flag: '-i, --install', desc: '必加。Release 不存在时自动创建，去掉它就退化成普通 `helm upgrade`' },
        { flag: '--create-namespace', desc: '连命名空间一起保证存在，CI 里首次部署很省事' },
        { flag: '--atomic', desc: '失败自动回滚，配合 `--wait` 保证流水线不会「假成功」' },
        { flag: '--wait --timeout', desc: '等待资源就绪，超时时间要大于镜像拉取 + 启动时间' },
        { flag: '--history-max', desc: '保留多少个历史 revision，默认 10，频繁发布可调大或调小' },
        { flag: '--set / -f', desc: '覆盖值；CI 里一般传环境 values 文件加少量 `--set`（如镜像 tag）' }
      ],
      examples: [
        { cmd: 'helm upgrade --install my-app ./charts/my-app -n prod --create-namespace -f values-prod.yaml --wait --timeout 10m', desc: '一条命令完成首次部署与后续升级，最常用的形式' },
        { cmd: 'helm upgrade --install my-app ./charts/my-app -n prod -f values-prod.yaml --set image.repository=swr.cn-north-4.myhuaweicloud.com/myorg/my-app --set image.tag=1.4.2 --atomic --timeout 10m', desc: 'CI 里推完 SWR 镜像后，用 commit 对应的 tag 发布到 CCE' },
        { cmd: 'helm upgrade --install my-app ./charts/my-app -n test -f values-test.yaml --dry-run --debug', desc: '在测试环境先演练，确认渲染无误再动生产' },
        { cmd: 'helm upgrade --install my-app ./charts/my-app -n prod -f values-prod.yaml --history-max 20 --wait', desc: '保留 20 个历史版本，便于回滚到更早的稳定版本' }
      ],
      notes: [
        '`--install` 只解决「不存在就创建」，不解决「配置漂移」：每次都要传完整 values，否则本次升级可能把上次的值覆盖掉',
        '第一次执行时如果 namespace 已存在但 Release 名被别的东西占用（例如手工 `kubectl apply` 过同名资源），会报 `invalid ownership metadata`，需要给资源补上 `app.kubernetes.io/managed-by: Helm` 注解或换 Release 名',
        '`--atomic` 会真的回滚而不是停在失败态，但状态为 `pending-install` 卡死的 Release 需要先 `helm uninstall` 再重试',
        '流水线里务必把 `--timeout` 设得比镜像拉取慢的情况更长，否则 CCE 首次拉大镜像很容易被误判为失败'
      ],
      related: ['hl-install', 'hl-upgrade', 'hl-rollback', 'hl-history', 'dk-push', 'k8s-cce-kubeconfig'],
      docs: 'https://helm.sh/docs/helm/helm_upgrade/',
      tags: ['幂等', 'CI/CD', '发布']
    },

    /* ---------- 7 / 25 ---------- */
    {
      id: 'hl-uninstall',
      name: 'helm uninstall',
      alias: ['helm delete', 'helm del', '删除 release'],
      level: 2,
      syntax: 'helm uninstall <Release名> [选项]',
      summary: '删除 Release 及其创建的资源，可按 revision 精确回退删除。',
      desc: 'Helm 3 里 `helm delete` 已改名为 `helm uninstall`（`delete` 仍作为别名可用）。默认删除该 Release 创建的全部 K8s 资源，但**不会删除 PVC、PV、Secret 等有状态或独立的数据载体**，也不会删除 CRD。',
      params: [
        { flag: '-n, --namespace', desc: 'Release 所在命名空间' },
        { flag: '--keep-history', desc: '只删资源、保留 Release 记录，之后可 `helm rollback` 复活' },
        { flag: '--dry-run', desc: '只打印会删除哪些资源，不执行' },
        { flag: '--wait', desc: '等待资源真正删除完成再返回' },
        { flag: '--no-hooks', desc: '跳过 pre-delete/post-delete hook' }
      ],
      examples: [
        { cmd: 'helm uninstall my-app -n prod', desc: '删除生产环境的 my-app 及其资源' },
        { cmd: 'helm uninstall my-app -n prod --keep-history', desc: '保留历史记录，误删后还能 rollback 回来' },
        { cmd: 'helm uninstall my-app -n prod --dry-run', desc: '先看会被删掉哪些资源，确认后再真删' }
      ],
      notes: [
        '`helm uninstall` 是**破坏性操作**，生产执行前先 `helm get manifest my-app -n prod` 确认它管着哪些资源，并按需备份数据',
        'PVC 默认保留（这是好事，数据还在），重新安装同名 Release 时可能因旧 PVC 里的数据产生意外结果，清理要单独 `kubectl delete pvc`',
        '删除后 Release 名可以复用，但 `--keep-history` 留下的记录会让同名 Release 的 revision 从旧值继续累加',
        'CRD 不会被删除，重装前注意旧 CRD 的版本是否与新 Chart 兼容'
      ],
      related: ['hl-install', 'hl-list', 'hl-history', 'hl-rollback', 'k8s-delete'],
      docs: 'https://helm.sh/docs/helm/helm_uninstall/',
      tags: ['删除', 'Release', '危险']
    },

    /* ---------- 8 / 25 ---------- */
    {
      id: 'hl-rollback',
      name: 'helm rollback',
      alias: ['helm rollback 0', '回滚 release'],
      level: 2,
      syntax: 'helm rollback <Release名> [REVISION] [选项]',
      summary: '把 Release 回退到指定历史版本，发布出问题时的第一反应。',
      desc: '不写 REVISION 时回到上一个版本，写 `0` 表示回到最老版本。回滚不是「撤销操作」，而是把旧版本的配置**当作一次新的 revision 重新部署**，所以 revision 号会继续增长（如从 5 回滚到 3，会生成 revision 6）。前提是旧 revision 还在 `helm history` 里。',
      params: [
        { flag: '<REVISION>', desc: '目标版本号，来自 `helm history`；省略则回到上一版，`0` 表示第一版' },
        { flag: '--cleanup-on-fail', desc: '回滚过程中失败时，清理本次新建的资源' },
        { flag: '--wait --timeout', desc: '等待资源就绪与超时时间' },
        { flag: '--force', desc: '强制替换资源（先删后建），慎用' },
        { flag: '--recreate-pods', desc: '仅 Helm 2 可用；Helm 3 已移除，改在 values 里加 checksum 注解触发滚动' }
      ],
      examples: [
        { cmd: 'helm history my-app -n prod', desc: '先看历史，找到要回退到的 revision 号' },
        { cmd: 'helm rollback my-app 3 -n prod --wait --timeout 5m', desc: '回滚到 revision 3 并等待就绪' },
        { cmd: 'helm rollback my-app -n prod', desc: '回到上一个版本，最常用的救火写法' },
        { cmd: 'helm rollback my-app 0 -n prod', desc: '回到最初版本，用于彻底放弃近期改动' }
      ],
      notes: [
        '回滚依赖历史记录：`helm uninstall --keep-history` 之外的删除、或超过 `--history-max` 上限的旧 revision 都回不去',
        '`--recreate-pods` 在 Helm 3 已不存在，写了会报 unknown flag；让 Pod 重建要靠 values 里放 ConfigMap 的 checksum 注解',
        '回滚只还原 Helm 模板里的资源，`kubectl` 手工改过的东西（如临时改副本数、加注解）不会跟着回去',
        '回滚后建议 `helm get values my-app -n prod` 核对生效值，确认 Service/Ingress 等入口资源也回到了预期状态'
      ],
      related: ['hl-history', 'hl-upgrade', 'hl-get', 'hl-status', 'k8s-rollout'],
      docs: 'https://helm.sh/docs/helm/helm_rollback/',
      tags: ['回滚', '发布', '救火']
    },

    /* ---------- 9 / 25 ---------- */
    {
      id: 'hl-history',
      name: 'helm history',
      alias: ['helm hist', '查看 release 历史'],
      level: 2,
      syntax: 'helm history <Release名> [选项]',
      summary: '列出 Release 的历次发布记录，回滚前必看的一张表。',
      desc: '输出 `REVISION`、`UPDATED`、`STATUS`、`CHART`、`APP VERSION`、`DESCRIPTION`。`STATUS` 常见值：`deployed`（当前生效）、`superseded`（被新版本取代）、`failed`（失败）、`pending-upgrade`（卡住）。谁在什么时候、用哪个 Chart 版本发的，全在这张表里。',
      params: [
        { flag: '-n, --namespace', desc: '指定命名空间' },
        { flag: '--max', desc: '最多显示多少条，默认 256' },
        { flag: '-o, --output', desc: '输出 `table` / `json` / `yaml`' }
      ],
      examples: [
        { cmd: 'helm history my-app -n prod', desc: '查看 my-app 的全部发布记录' },
        { cmd: 'helm history my-app -n prod --max 10', desc: '只看最近 10 次发布' },
        { cmd: 'helm history my-app -n prod -o json | jq -r \'.[] | "\\(.revision) \\(.status) \\(.chart)"\'', desc: '用 jq 提取版本号、状态与 Chart 版本，便于写进发布报告' }
      ],
      notes: [
        '出现 `pending-upgrade` / `pending-install` 说明有发布卡住了，通常需要 `helm uninstall`（可加 `--keep-history`）后重新部署',
        '历史条数受 `--history-max` 限制，超出后最老的记录会被回收，回滚范围也随之缩小',
        '`superseded` 不等于失败，那只是被新版本取代的正常状态；只有 `failed` 才代表那次发布没成功'
      ],
      related: ['hl-rollback', 'hl-status', 'hl-list', 'hl-get'],
      docs: 'https://helm.sh/docs/helm/helm_history/',
      tags: ['历史', '发布', '回滚']
    },

    /* ================= C. 查看与调试 ================= */

    /* ---------- 10 / 25 ---------- */
    {
      id: 'hl-list',
      name: 'helm list',
      alias: ['helm ls', 'helm list -A', '查看 release 列表'],
      level: 1,
      syntax: 'helm list [选项]',
      summary: '列出命名空间下的 Release 与状态，巡检和排错起点。',
      desc: '默认只看当前 kubeconfig 命名空间且状态为 `deployed`/`failed` 的 Release，所以「明明装了却看不到」多半是没加 `-A`，或状态是 `uninstalled` 需要 `--all` 才显示。',
      params: [
        { flag: '-A, --all-namespaces', desc: '列出所有命名空间的 Release，最常用' },
        { flag: '-a, --all', desc: '包含 `uninstalled`、`superseded` 等非活跃状态的 Release' },
        { flag: '-n, --namespace', desc: '只看指定命名空间' },
        { flag: '--filter', desc: '按正则过滤 Release 名，如 "web-.*"' },
        { flag: '--deployed / --failed / --pending', desc: '只显示指定状态的 Release' },
        { flag: '-o, --output', desc: '输出 `table` / `json` / `yaml`' }
      ],
      examples: [
        { cmd: 'helm list -A', desc: '查看集群里所有命名空间的 Release，巡检第一步' },
        { cmd: 'helm list -n prod --all', desc: '查看 prod 下全部 Release，包含已卸载但保留历史的' },
        { cmd: 'helm list -A --filter "web-.*" -o json', desc: '过滤出 web- 开头的 Release 并以 JSON 输出' },
        { cmd: 'helm list -A --failed', desc: '只看失败的 Release，快速定位有问题的发布' }
      ],
      notes: [
        '不加 `-A` 时 Helm 用的是 kubeconfig 当前 context 的 namespace，不是 `default` 也未必是你以为的那个',
        '`--all` 与 `-A` 是两个不同的开关：前者控制**状态**范围，后者控制**命名空间**范围，常被写错',
        '`helm list` 读的是集群里的 Secret（`sh.helm.release.v1.*`），集群连不上时会直接超时，此时先验证 kubeconfig'
      ],
      related: ['hl-status', 'hl-history', 'hl-uninstall', 'k8s-get', 'k8s-cce-kubeconfig'],
      docs: 'https://helm.sh/docs/helm/helm_list/',
      tags: ['列表', 'Release', '巡检']
    },

    /* ---------- 11 / 25 ---------- */
    {
      id: 'hl-status',
      name: 'helm status',
      alias: ['helm status --show-resources', '查看 release 状态'],
      level: 2,
      syntax: 'helm status <Release名> [选项]',
      summary: '查看某个 Release 的当前状态、备注与它管理的资源。',
      desc: '比起 `helm list` 的一行摘要，`helm status` 会打印状态、revision、部署时间、`NOTES.txt` 内容，加 `--show-resources` 还能列出该 Release 创建的所有资源，是回答「这个 Release 到底管了哪些东西」的最佳命令。',
      params: [
        { flag: '-n, --namespace', desc: '指定命名空间' },
        { flag: '--show-resources', desc: '列出该 Release 管理的全部 K8s 资源' },
        { flag: '--show-desc', desc: '显示部署描述信息' },
        { flag: '-o, --output', desc: '输出 `table` / `json` / `yaml`' },
        { flag: '--revision', desc: '查看指定 revision 的状态（Helm 3.13+）' }
      ],
      examples: [
        { cmd: 'helm status my-app -n prod', desc: '查看状态与 Chart 自带的 NOTES 提示' },
        { cmd: 'helm status my-app -n prod --show-resources', desc: '列出该 Release 创建的所有资源，清理和交接时很有用' },
        { cmd: 'helm status my-app -n prod --show-desc', desc: '看这次发布的描述（通常记录了升级原因）' }
      ],
      notes: [
        '状态为 `failed` 时资源可能仍然存在，务必 `--show-resources` 看清残留再决定回滚还是删除',
        '`--revision` 需要较新的 Helm 3.13+，老版本会报 unknown flag',
        '状态正常不代表业务正常：`deployed` 只表示 Helm 认为资源已提交，Pod 是否 Ready 还要看 `kubectl get pods`'
      ],
      related: ['hl-list', 'hl-history', 'hl-get', 'hl-rollback', 'k8s-get'],
      docs: 'https://helm.sh/docs/helm/helm_status/',
      tags: ['状态', 'Release', '排错']
    },

    /* ---------- 12 / 25 ---------- */
    {
      id: 'hl-get',
      name: 'helm get values / manifest / all',
      alias: ['helm get values', 'helm get manifest', 'helm get all', '导出 release 配置'],
      level: 3,
      syntax: 'helm get values|manifest|all|notes|hooks <Release名> [选项]',
      summary: '导出生效的配置值与渲染后的 YAML，比对差异靠它。',
      desc: '`values` 显示该 Release 实际生效的值（默认只显示用户覆盖的部分，`-a` 才显示全部合并结果）；`manifest` 显示最终提交给集群的完整 YAML；`all` 把两者与 NOTES、hooks 一起打印。排查「本地渲染跟集群里不一样」时，`helm get manifest` 与 `helm template` 的 diff 是决定性证据。',
      params: [
        { flag: '-a, --all', desc: '`get values` 专用：输出计算后的全部值（含 Chart 默认值）' },
        { flag: '--revision', desc: '取指定 revision 的内容，与历史版本比对' },
        { flag: '-n, --namespace', desc: '指定命名空间' },
        { flag: '-o, --output', desc: '输出 `table` / `json` / `yaml`，`manifest` 常用 yaml' }
      ],
      examples: [
        { cmd: 'helm get values my-app -n prod', desc: '看待这次发布用户显式覆盖了哪些值' },
        { cmd: 'helm get values my-app -n prod -a > /tmp/effective-values.yaml', desc: '导出合并后的完整生效值，作为下次发布的基线' },
        { cmd: 'helm get manifest my-app -n prod > /tmp/deployed.yaml', desc: '导出集群里实际生效的 YAML，用于和本地渲染结果比对' },
        { cmd: 'helm get manifest my-app -n prod --revision 3 | diff - /tmp/deployed.yaml', desc: '比对 revision 3 与当前版本的资源差异' },
        { cmd: 'helm get all my-app -n prod', desc: '一次性看全 values、manifest、NOTES 与 hooks' }
      ],
      notes: [
        '`helm get values` 不带 `-a` 时看不到 Chart 默认值，误以为「某个值没生效」前先用 `-a` 确认',
        '`helm get manifest` 输出的是提交时的 YAML，之后被 `kubectl edit` 改过的内容不会体现，真实状态要看 `kubectl get ... -o yaml`',
        '`helm get` 的结果可以重定向成文件长期归档，这是发布审计最省事的证据链'
      ],
      related: ['hl-status', 'hl-history', 'hl-template', 'hl-upgrade', 'hl-values-files'],
      docs: 'https://helm.sh/docs/helm/helm_get_values/',
      tags: ['导出', '排错', '比对']
    },

    /* ---------- 13 / 25 ---------- */
    {
      id: 'hl-template',
      name: 'helm template',
      alias: ['helm template --debug', '本地渲染', '离线渲染 chart'],
      level: 2,
      syntax: 'helm template <Release名> <Chart> [选项]',
      summary: '在本地把 Chart 渲染成 YAML，不连集群就能验证模板。',
      desc: '`helm template` 只做渲染，不访问集群、不创建任何资源，是调试模板最安全的手段。渲染结果与 `helm install` 提交的内容一致（除非 Chart 里有 `lookup` 这类要读集群的函数）。CI 里常把它当作「部署前的静态检查 + 产物归档」，也可以接 `kubeconform`、`kube-linter` 做校验。',
      params: [
        { flag: '-f, --values', desc: '指定 values 文件，可重复传，右侧优先' },
        { flag: '--set', desc: '命令行覆盖值' },
        { flag: '-s, --show-only', desc: '只渲染指定模板文件，输出干净便于比对' },
        { flag: '--output-dir', desc: '把每个资源写成独立文件到目录，便于逐个 review 或交给 kubectl' },
        { flag: '--namespace', desc: '模拟目标命名空间，影响 `.Release.Namespace` 的取值' },
        { flag: '--api-versions', desc: '声明集群支持的 API 版本（如 `apps/v1`），影响 Capabilities 判断' },
        { flag: '--debug', desc: '渲染失败时打印详细错误与渲染上下文' },
        { flag: '--validate', desc: '按集群做 schema 校验（需能连集群）' }
      ],
      examples: [
        { cmd: 'helm template my-app ./charts/my-app -n prod -f values-prod.yaml', desc: '本地渲染生产环境 YAML，直接打在屏幕上检查' },
        { cmd: 'helm template my-app ./charts/my-app -n prod -f values-prod.yaml > /tmp/rendered.yaml', desc: '把渲染结果存成文件，用于 diff 归档或人工审批' },
        { cmd: 'helm template my-app ./charts/my-app -s templates/deployment.yaml -f values-prod.yaml', desc: '只渲染 Deployment 模板，排查单个文件的渲染问题' },
        { cmd: 'helm template my-app ./charts/my-app --output-dir /tmp/myapp-out -f values-prod.yaml', desc: '按资源拆成多文件输出，方便逐份 review' },
        { cmd: 'helm template my-app ./charts/my-app -f values-prod.yaml --debug', desc: '渲染报错时打印详细上下文，定位模板语法问题' },
        { cmd: 'helm template my-app ./charts/my-app -f values-prod.yaml | kubectl apply --dry-run=server -f -', desc: '渲染后用服务端 dry-run 校验，能提前发现字段不合法' }
      ],
      notes: [
        '`helm template` 不会执行 CRD 安装、也不会跑 hook，所以渲染通过不代表 `helm install` 一定成功',
        'Chart 里用了 `lookup` 函数时，`helm template` 拿不到集群数据会返回空值，渲染结果与真实安装可能有差异',
        '没有 `--api-versions` 时 Capabilities 只带默认内置 API 列表，用 `Capabilities.APIVersions.Has` 判断的模板可能走错分支',
        '`-s` 指定的路径要写完整模板路径（`templates/xxx.yaml`），只写文件名会报 not found',
        '把渲染结果接 `kubeconform -strict` 或 `kube-linter lint` 能拦掉大部分 YAML 层面的低级错误，值得放进流水线'
      ],
      related: ['hl-lint', 'hl-install', 'hl-upgrade-install', 'hl-get', 'hl-functions', 'k8s-apply'],
      docs: 'https://helm.sh/docs/helm/helm_template/',
      tags: ['模板', '调试', 'CI/CD']
    },

    /* ---------- 14 / 25 ---------- */
    {
      id: 'hl-lint',
      name: 'helm lint',
      alias: ['helm lint --strict', '检查 chart'],
      level: 2,
      syntax: 'helm lint <Chart路径> [选项]',
      summary: '检查 Chart 目录结构与模板规范，提交前跑一遍。',
      desc: '`helm lint` 检查 Chart.yaml 必填字段、values.yaml 可解析性、模板能否渲染、以及一批官方推荐实践（如缺少 icon、模板里有可疑写法）。它比 `helm template` 更偏「规范体检」，两者一起放进流水线的 pre-commit 或 CI 前置步骤最合适。',
      params: [
        { flag: '--strict', desc: '把 warning 也当成 error，CI 里建议开启' },
        { flag: '-f, --values', desc: '用指定 values 文件一起检查' },
        { flag: '--set', desc: '命令行覆盖值参与检查' },
        { flag: '--with-subcharts', desc: '连子 Chart 一起 lint' },
        { flag: '--quiet', desc: '只输出错误，不打印汇总' }
      ],
      examples: [
        { cmd: 'helm lint ./charts/my-app', desc: '检查本地 Chart 的基本规范' },
        { cmd: 'helm lint ./charts/my-app -f values-prod.yaml --strict', desc: '用生产 values 严格检查，warning 也算失败' },
        { cmd: 'helm lint ./charts/my-app --with-subcharts', desc: '连依赖的子 Chart 一起检查' },
        { cmd: 'helm lint ./charts/*', desc: '一次性检查 charts 目录下的所有 Chart' }
      ],
      notes: [
        'lint 通过不等于部署成功：镜像 tag 是否存在、资源配额是否够、CRD 是否齐全，lint 都管不了',
        '默认 warning 不会让命令返回非 0，CI 里必须加 `--strict` 才能真正卡住流水线',
        '`helm lint` 会真的渲染模板，所以缺失的 values 键会报错，可用 `-f` 传对应环境的值'
      ],
      related: ['hl-template', 'hl-chart-yaml', 'hl-install'],
      docs: 'https://helm.sh/docs/helm/helm_lint/',
      tags: ['校验', 'Chart', 'CI/CD']
    },

    /* ---------- 15 / 25 ---------- */
    {
      id: 'hl-show',
      name: 'helm show values / chart / readme',
      alias: ['helm inspect', 'helm show all', '查看 chart 说明'],
      level: 1,
      syntax: 'helm show values|chart|readme|crds|all <Chart> [选项]',
      summary: '不下载就查看 Chart 的可配值、元数据与说明文档。',
      desc: '`show values` 打印 Chart 的默认 values，是写自定义 values 文件的最佳起点；`show chart` 看 Chart.yaml 元数据（版本、依赖、K8s 版本要求）；`show readme` 看作者写的使用说明；`show all` 全部打印。也可以直接对 OCI 地址用。',
      params: [
        { flag: '--version', desc: '指定 Chart 版本，默认取最新版' },
        { flag: '--devel', desc: '允许使用开发版本（如 `1.2.0-rc.1`）' },
        { flag: '--repo', desc: '直接指定仓库地址，不必先 `helm repo add`' },
        { flag: '--jsonpath', desc: '只取 values 中的某个路径（Helm 3.14+）' }
      ],
      examples: [
        { cmd: 'helm show values bitnami/nginx > values-default.yaml', desc: '导出默认 values 作为自定义配置的起点' },
        { cmd: 'helm show chart bitnami/nginx', desc: '查看 Chart 版本、依赖与 K8s 版本要求' },
        { cmd: 'helm show readme bitnami/mysql', desc: '读作者的安装说明与注意事项' },
        { cmd: 'helm show values oci://swr.cn-north-4.myhuaweicloud.com/myorg/my-app --version 1.0.0', desc: '直接查看 SWR OCI 仓库里 Chart 的默认值' },
        { cmd: 'helm show all bitnami/redis', desc: '一次性看 values、Chart.yaml、README 与 CRD' }
      ],
      notes: [
        '`helm show values` 的默认值很多（几百上千行），实际只需要改其中几个，建议先读 README 再挑字段覆盖',
        '`helm inspect` 是 Helm 2 的旧名，在 Helm 3 里作为别名仍可用，新脚本统一用 `helm show`',
        '切换 Chart 大版本（如 14.x → 15.x）前一定要 `helm show chart` 看 K8s 版本要求与依赖变化'
      ],
      related: ['hl-repo-search', 'hl-pull', 'hl-values-files', 'hl-install'],
      docs: 'https://helm.sh/docs/helm/helm_show_values/',
      tags: ['Chart', '参数', '文档']
    },

    /* ================= D. 打包与依赖 ================= */

    /* ---------- 16 / 25 ---------- */
    {
      id: 'hl-package',
      name: 'helm package',
      alias: ['helm package --version', '打包 chart'],
      level: 2,
      syntax: 'helm package <Chart目录> [选项]',
      summary: '把 Chart 目录打成 tgz 包，分发与上传前的标准动作。',
      desc: '输出 `<Chart名>-<版本>.tgz`，版本号取自 Chart.yaml 的 `version`（可用 `--version` 覆盖）。打包时会忽略 `.git`、`Chart.lock` 之类无关文件，但**子 Chart 与 charts/ 目录会被一起打进去**，所以打包前先 `helm dependency update`。',
      params: [
        { flag: '-d, --destination', desc: '输出目录，默认当前目录' },
        { flag: '--version', desc: '覆盖 Chart.yaml 里的 version' },
        { flag: '--app-version', desc: '覆盖 appVersion 字段' },
        { flag: '--dependency-update', desc: '打包前自动 `helm dependency update`' },
        { flag: '--sign / --key / --keyring', desc: '用 GPG 签名（Helm 3.8+ 已弃用，改用 `helm push` 到 OCI 仓库做完整性保护）' }
      ],
      examples: [
        { cmd: 'helm package ./charts/my-app', desc: '把本地 Chart 打成 tgz 包' },
        { cmd: 'helm package ./charts/my-app -d ./dist --version 1.4.2', desc: '指定版本与输出目录，CI 里常配合 git tag 生成版本号' },
        { cmd: 'helm package ./charts/my-app --dependency-update -d ./dist', desc: '打包前先拉齐依赖，避免发出缺子 Chart 的包' },
        { cmd: 'helm package ./charts/my-app -d ./dist --app-version 1.4.2', desc: '同时更新 appVersion，表示包里的应用版本' }
      ],
      notes: [
        '`version` 是 Chart 版本，`appVersion` 是应用版本，两者独立；只改 appVersion 不会改变 tgz 文件名',
        '包名带 `+` 等特殊字符时部分仓库不接受，版本号建议遵循语义化版本 `MAJOR.MINOR.PATCH`',
        '打包前确认 `.helmignore` 已排除测试文件、CI 配置和大体积资源，否则包会无谓变大'
      ],
      related: ['hl-push', 'hl-dependency-update', 'hl-pull', 'hl-chart-yaml'],
      docs: 'https://helm.sh/docs/helm/helm_package/',
      tags: ['打包', 'Chart', '分发']
    },

    /* ---------- 17 / 25 ---------- */
    {
      id: 'hl-pull',
      name: 'helm pull',
      alias: ['helm fetch', 'helm pull --untar', '下载 chart'],
      level: 2,
      syntax: 'helm pull <Chart> [选项]',
      summary: '把远端 Chart 下载到本地，便于改值和离线分发。',
      desc: '默认只下载 tgz 不展开，加 `--untar` 直接解包成目录。常见用法是「先 pull 再看 values 改配置」，或把 Chart 存进内网制品库，供无法访问公网的集群离线安装。',
      params: [
        { flag: '--untar', desc: '下载后自动解包到当前目录' },
        { flag: '--untar-dir', desc: '指定解包目录' },
        { flag: '-d, --destination', desc: 'tgz 的输出目录' },
        { flag: '--version', desc: '指定 Chart 版本' },
        { flag: '--devel', desc: '允许下载开发版本' },
        { flag: '--repo', desc: '直接指定仓库地址，免去 `helm repo add`' }
      ],
      examples: [
        { cmd: 'helm pull bitnami/nginx --version 15.4.0', desc: '下载指定版本的 Nginx Chart 包' },
        { cmd: 'helm pull bitnami/nginx --untar --untar-dir ./charts', desc: '下载并解包到 ./charts，方便直接改模板或 values' },
        { cmd: 'helm pull oci://swr.cn-north-4.myhuaweicloud.com/myorg/my-app --version 1.0.0 -d ./dist', desc: '从华为云 SWR 拉取 OCI Chart 包，用于离线环境分发' },
        { cmd: 'helm pull prometheus-community/kube-prometheus-stack --untar && ls kube-prometheus-stack', desc: '拉取大型 Chart 并确认目录结构' }
      ],
      notes: [
        '下载前最好 `helm repo update`，否则可能拿到索引里过期的版本',
        '`--untar` 解出的目录会覆盖同名目录里的文件，在已有工作目录执行要小心',
        '把第三方 Chart 拉下来改属于 fork，升级时要自己合并上游变更，长期维护成本高，优先用 values 覆盖而不是改模板'
      ],
      related: ['hl-repo-add', 'hl-package', 'hl-dependency-update', 'hl-show', 'hl-push'],
      docs: 'https://helm.sh/docs/helm/helm_pull/',
      tags: ['下载', 'Chart', '离线']
    },

    /* ---------- 18 / 25 ---------- */
    {
      id: 'hl-dependency-update',
      name: 'helm dependency update / build',
      alias: ['helm dep up', 'helm dep build', '拉取子 chart'],
      level: 3,
      syntax: 'helm dependency update <Chart目录>\nhelm dependency build <Chart目录>\nhelm dependency list <Chart目录>',
      summary: '按 Chart.yaml 拉取并锁定子 Chart 依赖到 charts 目录。',
      desc: '`update` 会重新解析 `dependencies`、下载子 Chart 到 `charts/` 并生成 `Chart.lock`；`build` 严格按已有的 `Chart.lock` 重建，适合 CI 保证依赖可复现。`Chart.lock` 必须提交到 Git，否则每次构建都可能拉到不同版本。',
      params: [
        { flag: '--skip-refresh', desc: '不刷新仓库索引，直接用本地缓存（离线构建用）' },
        { flag: '--verify', desc: '校验依赖来源 provenance（Helm 3.8+ 起 Signing 能力已弱化，仍可用于校验）' },
        { flag: '--keyring', desc: '指定 GPG keyring 路径' },
        { flag: 'helm dependency list', desc: '列出依赖名、版本、仓库与状态（`ok`/`missing`/`unpacked`）' }
      ],
      examples: [
        { cmd: 'helm dependency update ./charts/my-app', desc: '拉取声明在 Chart.yaml 里的子 Chart 并生成 Chart.lock' },
        { cmd: 'helm dependency build ./charts/my-app --skip-refresh', desc: 'CI 里按 Chart.lock 离线重建依赖，保证可复现' },
        { cmd: 'helm dependency list ./charts/my-app', desc: '检查依赖是否都已就绪，`missing` 就是没拉下来' },
        { cmd: 'cd /data/app && git add charts/my-app/Chart.lock && git commit -m "chore(helm): lock my-app dependencies"', desc: '把 lock 文件提交进仓库，团队与 CI 才能拿到同一批依赖' }
      ],
      notes: [
        'CI 里不要用 `update`，它会重新解析版本导致「今天能构建、明天就挂」，构建阶段统一用 `build`',
        'Condition 字段可以让子 Chart 按开关启用/禁用，例如 `condition: mysql.enabled`，排查依赖是否生效先看这里',
        '`charts/` 目录与 `Chart.lock` 的取舍：lock 文件必须提交，`charts/` 目录一般加进 `.gitignore` 由构建时生成',
        '仓库地址变了要同步改 `Chart.yaml` 里的 `repository`，否则 `update` 会报找不到依赖'
      ],
      related: ['hl-pull', 'hl-package', 'hl-chart-yaml', 'hl-lint'],
      docs: 'https://helm.sh/docs/helm/helm_dependency_update/',
      tags: ['依赖', '子Chart', '构建']
    },

    /* ---------- 19 / 25 ---------- */
    {
      id: 'hl-push',
      name: 'helm push',
      alias: ['helm push oci', '推送 chart 到 SWR', 'helm registry login'],
      level: 3,
      syntax: 'helm push <Chart包.tgz> oci://<仓库地址>/<命名空间> [选项]',
      summary: '把打包好的 Chart 推进 OCI 仓库，华为云 SWR 支持。',
      desc: 'Helm 3.8+ 才支持 `helm push`，且**只支持 OCI 协议**，仓库地址必须以 `oci://` 开头。华为云 SWR 可以直接当 OCI Chart 仓库用：先 `helm registry login` 登录，再 `helm push` 到 `oci://swr.<region>.myhuaweicloud.com/<组织名>`，之后用 `helm install oci://...` 直接安装。',
      params: [
        { flag: 'oci://<地址>', desc: '必填且必须带 `oci://` 前缀，结尾写组织名/命名空间，不要再加仓库名' },
        { flag: '--insecure-skip-tls-verify', desc: '跳过 TLS 校验，仅自签证书的内网 Harbor 使用' },
        { flag: '--plain-http', desc: '用 HTTP 而非 HTTPS 推送，仅纯内网测试环境' },
        { flag: '--ca-file / --cert-file / --key-file', desc: '指定 CA 与客户端证书' },
        { flag: 'helm registry login', desc: '登录仓库：`helm registry login -u <账号> swr.cn-north-4.myhuaweicloud.com`' },
        { flag: 'helm registry logout', desc: '退出登录并清理凭证' }
      ],
      examples: [
        { cmd: 'helm registry login -u cn-north-4@ABCDEFG swr.cn-north-4.myhuaweicloud.com', desc: '登录华为云 SWR（用户名用「区域@AK」形式，密码用登录密钥）' },
        { cmd: 'helm package ./charts/my-app --version 1.4.2 -d ./dist', desc: '先打成 tgz，push 只接受包文件不接受目录' },
        { cmd: 'helm push ./dist/my-app-1.4.2.tgz oci://swr.cn-north-4.myhuaweicloud.com/myorg', desc: '把 Chart 推进 SWR 的 myorg 命名空间' },
        { cmd: 'helm show chart oci://swr.cn-north-4.myhuaweicloud.com/myorg/my-app --version 1.4.2', desc: '推送后立刻验证，能查到说明上传成功' },
        { cmd: 'helm install my-app oci://swr.cn-north-4.myhuaweicloud.com/myorg/my-app --version 1.4.2 -n prod --create-namespace', desc: '从 SWR 的 OCI 仓库直接安装 Chart' }
      ],
      notes: [
        'OCI 地址结尾不要带仓库名：写成 `oci://swr.../myorg/my-app` 会变成命名空间下再套一层，安装路径对不上',
        '`helm push` 不能推目录，必须先 `helm package` 生成 tgz',
        '推送到 OCI 后 **不能**用 `helm repo add` + `helm search repo` 检索，只能用 `helm show chart oci://...` 或 `helm pull oci://...`',
        'SWR 的组织名必须已创建且有推送权限，报 `unauthorized` 先确认登录的用户名格式与临时登录指令',
        'Chart 里的 `version` 已存在时会被覆盖（取决于仓库策略），生产发布请保证版本号只增不改'
      ],
      related: ['hl-package', 'hl-pull', 'hl-install', 'hl-upgrade-install', 'dk-push'],
      docs: 'https://helm.sh/docs/helm/helm_push/',
      tags: ['OCI', 'SWR', '制品库']
    },

    /* ================= E. Chart 结构与模板速查 ================= */

    /* ---------- 20 / 25 ---------- */
    {
      id: 'hl-chart-yaml',
      name: 'Chart.yaml 字段速查',
      kind: 'recipe',
      alias: ['Chart.yaml', 'chart 元数据', 'apiVersion v2'],
      level: 2,
      syntax: 'Chart.yaml（Chart 根目录，必需）',
      summary: 'Chart 的元数据清单，版本、依赖、类型都写在这里。',
      desc: 'Helm 3 用 `apiVersion: v2`（Helm 2 是 v1，不兼容）。`version` 是 Chart 自身版本，每改一次模板就要升；`appVersion` 是被部署应用的版本，仅作展示，不参与 Helm 的版本比较。`dependencies` 声明子 Chart，由 `helm dependency update` 消费。',
      params: [
        { flag: 'apiVersion', desc: '必填，Helm 3 固定写 `v2`' },
        { flag: 'name', desc: '必填，Chart 名，需与目录名一致（小写字母、数字、连字符）' },
        { flag: 'version', desc: '必填，Chart 版本，语义化版本格式，如 `1.4.2`' },
        { flag: 'appVersion', desc: '应用版本，字符串，建议加引号避免被解析成数字（如 `"1.4"`）' },
        { flag: 'description / home / sources / maintainers / icon', desc: '描述、主页、源码地址、维护者、图标，`helm lint` 会检查部分字段' },
        { flag: 'type', desc: '`application`（默认，可安装）或 `library`（只提供模板，不能被安装）' },
        { flag: 'dependencies', desc: '子 Chart 列表：`name`/`version`/`repository`/`condition`/`alias`' },
        { flag: 'kubeVersion', desc: '支持的 K8s 版本约束，如 `>=1.24.0-0`，不匹配时安装会失败' }
      ],
      examples: [
        { cmd: 'helm show chart bitnami/nginx', desc: '看一个成熟 Chart 的 Chart.yaml 长什么样' },
        { cmd: 'helm create my-app && cat my-app/Chart.yaml', desc: '用官方脚手架生成一份标准 Chart.yaml 作为模板' },
        { cmd: 'helm lint ./charts/my-app --strict', desc: '改完 Chart.yaml 立刻检查必填字段与格式' }
      ],
      notes: [
        '`appVersion` 不加引号时 `1.10` 会被 YAML 解析成数字 1.1，务必写成 `appVersion: "1.10"`',
        '`apiVersion: v1` 的旧 Chart 在 Helm 3 下需要迁移，`helm create` 生成的已是 v2',
        '`type: library` 的 Chart 不能被 `helm install`，只能被其他 Chart 当依赖引用',
        '改了模板或默认值就必须升 `version`，否则推送到 OCI 仓库会覆盖同名版本，回滚时无法区分'
      ],
      related: ['hl-values-files', 'hl-dependency-update', 'hl-lint', 'hl-package', 'hl-helpers'],
      docs: 'https://helm.sh/docs/topics/charts/',
      tags: ['Chart', '元数据', '速查']
    },

    /* ---------- 21 / 25 ---------- */
    {
      id: 'hl-values-files',
      name: 'values.yaml 与多环境 values 文件',
      kind: 'recipe',
      alias: ['多环境 values', 'values-prod.yaml', 'values 覆盖顺序'],
      level: 2,
      syntax: 'helm install <Release> <Chart> -f values.yaml -f values-prod.yaml --set key=value',
      summary: '用分层 values 文件管理多环境配置，命令行只做微调。',
      desc: '`values.yaml` 放所有环境的公共默认值，环境差异拆到 `values-dev.yaml`、`values-test.yaml`、`values-prod.yaml`，通过 `-f` 按「从左到右、右侧覆盖左侧」叠加，最后再用 `--set` 打补丁。这样同一份 Chart 能在多套环境复用，配置差异在 Git 里一目了然。',
      params: [
        { flag: '-f, --values', desc: '可重复传，右侧文件覆盖左侧；被覆盖是**整体替换**而非深合并' },
        { flag: '--set', desc: '命令行单点覆盖，优先级最高；类型按 Helm 规则推断' },
        { flag: '--set-string', desc: '强制按字符串处理，如版本号 `--set-string image.tag=1.10`' },
        { flag: '--set-file', desc: '把文件内容作为值传入，适合塞证书、大段配置' },
        { flag: '--reuse-values', desc: '升级时沿用上次的值，只用 `--set` 增量修改' }
      ],
      examples: [
        { cmd: 'helm upgrade --install my-app ./charts/my-app -f values.yaml -f values-prod.yaml -n prod --create-namespace --wait', desc: '公共值 + 生产值分层叠加，CI 的标准写法' },
        { cmd: 'helm upgrade --install my-app ./charts/my-app -f values-prod.yaml --set image.tag=1.4.2 --set-string build.number=1001', desc: '环境值打底，只把镜像 tag 和构建号交给流水线变量' },
        { cmd: 'helm upgrade --install my-app ./charts/my-app -f values-prod.yaml --set-file tls.crt=./certs/server.crt', desc: '把证书文件内容直接注入 values' },
        { cmd: 'helm get values my-app -n prod -a > values-effective.yaml', desc: '导出当前生效的完整值，作为下一版 values 的基线' }
      ],
      notes: [
        '覆盖是**浅合并**：同名 key 会被整个替换。数组尤其要注意，`-f` 里的数组会把默认数组完全换掉，而不是追加',
        'values 里不要放明文密码，用 `existingSecret` 引用 K8s Secret，或在 CI 里用凭据注入',
        '键名大小写敏感，Go 模板里读的是 `.Values.image.tag`，YAML 写成 `Image` 就会取到空值导致渲染出 `<no value>`',
        '用 `--set` 传含逗号、点号、等号的值必须转义（如 `--set nodeSelector."kubernetes\.io/hostname"=node1`），复杂结构一律用文件'
      ],
      related: ['hl-install', 'hl-upgrade-install', 'hl-get', 'hl-chart-yaml', 'hl-functions'],
      docs: 'https://helm.sh/docs/chart_template_guide/values_files/',
      tags: ['values', '多环境', '配置']
    },

    /* ---------- 22 / 25 ---------- */
    {
      id: 'hl-functions',
      name: 'Helm 模板函数速查',
      kind: 'recipe',
      alias: ['toYaml', 'include', 'tpl', 'with range default quote', '模板函数'],
      level: 3,
      syntax: '{{ include "名称" . }} / {{ toYaml .Values.x | nindent 4 }} / {{ .Values.x | default "值" | quote }}',
      summary: 'include/toYaml/nindent 这套组合，是写模板最常用的骨架。',
      desc: 'Helm 模板基于 Go template，额外内置了 Sprig 函数库。最高频的五个：`include`（渲染命名模板并返回字符串，能配合管道，优于 `template`）、`tpl`（把字符串当模板再渲染一次，用于 values 里塞模板片段）、`toYaml`（把结构体转成 YAML 文本）、`with`（改变上下文，减少重复的 `.Values.x`）、`range`（遍历列表或 map）。缩进由 `nindent`/`indent` 配合完成。',
      params: [
        { flag: 'include "name" .', desc: '渲染 `_helpers.tpl` 里的命名模板并返回字符串，可继续接管道' },
        { flag: 'tpl STRING .', desc: '把字符串当模板渲染，values 里写 `{{ .Release.Name }}` 也能生效' },
        { flag: 'toYaml / fromYaml', desc: '结构体与 YAML 字符串互转，常配 `nindent` 塞进配置块' },
        { flag: 'with / range / if', desc: '上下文切换、循环、条件判断；`range` 内用 `.` 表示当前元素' },
        { flag: 'default / quote / required', desc: '给默认值、加引号、必填校验（`required "msg" .Values.x` 为空时报错）' },
        { flag: 'nindent / indent / trim', desc: '缩进与去空白，控制注入 YAML 的对齐' },
        { flag: 'lookup', desc: '渲染时读集群对象；`helm template` 下取不到值，会与真实安装有差异' }
      ],
      examples: [
        { cmd: '{{ include "my-app.fullname" . }}', desc: '引用 _helpers.tpl 里的命名模板，生成规范资源名' },
        { cmd: '{{ toYaml .Values.resources | nindent 12 }}', desc: '把 resources 结构体转 YAML 并缩进 12 空格，写进容器 spec' },
        { cmd: '{{ .Values.image.tag | default .Chart.AppVersion | quote }}', desc: '镜像 tag 没配时回退到 appVersion，并强制加引号' },
        { cmd: '{{- with .Values.nodeSelector }}\n      nodeSelector:\n{{ toYaml . | nindent 8 }}\n{{- end }}', desc: '用 with 切换上下文，只有配置了 nodeSelector 才渲染这一段' },
        { cmd: '{{- range .Values.env }}\n        - name: {{ .name }}\n          value: {{ .value | quote }}\n{{- end }}', desc: 'range 遍历环境变量列表逐条渲染' },
        { cmd: '{{ tpl .Values.configTemplate . | nindent 4 }}', desc: '把 values 里的字符串当模板二次渲染，实现配置片段复用' }
      ],
      notes: [
        '`include` 返回字符串可以接管道，老写法 `template` 只能输出不能接管道，新模板统一用 `include`',
        '`toYaml` 输出的是「第一行无缩进、后续行相对缩进」的文本，直接写进 YAML 会错位，必须配 `nindent`',
        '`.Values` 里不存在的键渲染成 `<no value>`，被 `quote` 后会变成字符串 `"<no value>"`，用 `default` 或 `required` 兜底',
        '`lookup` 会让 `helm template` 与 `helm install` 结果不一致，CI 静态校验时要注意这一点',
        '`range` 遍历 map 时顺序是随机的（Go map 无序），生成配置需要稳定顺序时先转成 list 或用 `keys | sortAlpha`'
      ],
      related: ['hl-helpers', 'hl-template', 'hl-values-files', 'hl-chart-yaml'],
      docs: 'https://helm.sh/docs/chart_template_guide/functions_and_pipelines/',
      tags: ['模板', '函数', '速查']
    },

    /* ---------- 23 / 25 ---------- */
    {
      id: 'hl-helpers',
      name: '_helpers.tpl 与命名模板',
      kind: 'recipe',
      alias: ['define', '命名模板', 'helpers.tpl', '模板复用'],
      level: 3,
      syntax: 'templates/_helpers.tpl：{{- define "chart.name" -}} ... {{- end }}',
      summary: '用 define 抽出可复用的名字与标签，避免模板到处重复。',
      desc: '`templates/_helpers.tpl` 里的内容不会渲染成资源（下划线开头的文件被当作 partial），只用于 `define` 命名模板。约定俗成的三个：`<chart>.name`（Chart 名）、`<chart>.fullname`（Release 名 + Chart 名，截断到 63 字符以符合 K8s 命名限制）、`<chart>.labels` / `<chart>.selectorLabels`（标准标签集）。',
      params: [
        { flag: 'define "名称"', desc: '定义命名模板，名称建议用 `<chart>.<用途>` 全局唯一' },
        { flag: 'include "名称" .', desc: '调用并返回字符串，`.` 是把当前上下文传进去；不传则模板内拿不到 `.Values`/`.Release`' },
        { flag: '{{- / -}}', desc: '裁剪左右空白，避免渲染出多余空行影响 YAML 结构' },
        { flag: '.Chart.Name / .Release.Name', desc: 'helpers 里最常用的两个上下文变量' },
        { flag: 'trunc 63 / trimSuffix "-"', desc: 'K8s 资源名上限 63 字符，fullname 模板里必须处理' }
      ],
      examples: [
        { cmd: '{{- define "my-app.fullname" -}}\n{{- if .Values.fullnameOverride }}\n{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}\n{{- else }}\n{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}\n{{- end }}\n{{- end }}', desc: '标准的 fullname 模板：优先用覆盖值，否则拼 Release 与 Chart 名并截断' },
        { cmd: 'metadata:\n  name: {{ include "my-app.fullname" . }}\n  labels:\n    {{- include "my-app.labels" . | nindent 4 }}', desc: '在资源模板里引用 helper 生成名字与标签块' },
        { cmd: 'selectorLabels: |\n  app.kubernetes.io/name: {{ include "my-app.name" . }}\n  app.kubernetes.io/instance: {{ .Release.Name }}', desc: 'selectorLabels 一旦上线就不能改，Deployment 的 selector 是不可变字段' },
        { cmd: 'helm template my-app ./charts/my-app -s templates/deployment.yaml', desc: '改完 helper 立刻渲染单个模板，验证名字与标签是否符合预期' }
      ],
      notes: [
        '`include` 的第二个参数 `.` 不能省，省了 helper 内部拿不到上下文，会渲染出空名字',
        '`selectorLabels` 只放 `name` 与 `instance` 这类稳定标签，别把 `version` 放进去——selector 不可变，改版本号会导致升级失败',
        'helper 名在整个 Chart 树里唯一，子 Chart 要用自己的前缀，否则同名 define 只保留先加载的一个',
        '`templates/_helpers.tpl` 本身不产生资源，但文件名必须以 `_` 开头，否则会被当成清单渲染出去'
      ],
      related: ['hl-functions', 'hl-template', 'hl-chart-yaml', 'hl-lint'],
      docs: 'https://helm.sh/docs/chart_template_guide/named_templates/',
      tags: ['模板', '复用', '速查']
    },

    /* ---------- 24 / 25 ---------- */
    {
      id: 'hl-create',
      name: 'helm create',
      alias: ['helm create', 'chart 脚手架', '新建 chart'],
      level: 1,
      syntax: 'helm create <Chart名>',
      summary: '生成一份官方标准的 Chart 目录骨架，起手最省事。',
      desc: '生成的目录包含 `Chart.yaml`、`values.yaml`、`charts/`、`templates/`（`deployment.yaml`/`service.yaml`/`ingress.yaml`/`serviceaccount.yaml`/`hpa.yaml`/`_helpers.tpl`/`NOTES.txt`）以及 `tests/test-connection.yaml`。直接在骨架基础上改比自己从零搭更不容易漏掉标签、探针、安全上下文这些细节。',
      params: [
        { flag: '<Chart名>', desc: '必填，同时作为目录名，须为小写字母/数字/连字符' },
        { flag: '-p, --starter', desc: '指定起始模板目录（Helm 3.6+），团队可内置自己的骨架' }
      ],
      examples: [
        { cmd: 'helm create my-app', desc: '在当前目录生成 my-app 这个 Chart 骨架' },
        { cmd: 'helm create my-app && helm lint ./my-app', desc: '生成后立刻 lint，确认骨架本身是干净的' },
        { cmd: 'helm template my-app ./my-app -n default', desc: '渲染骨架默认输出，理解模板各段的作用' }
      ],
      notes: [
        '骨架里 `values.yaml` 的默认镜像是 `nginx`，改成自己的业务镜像和 tag 再发布',
        '生成后记得改 `Chart.yaml` 的 `name`/`appVersion`/`description`，helm lint 会对部分字段报警告',
        '不要直接改 `charts/` 下的第三方子 Chart，升级会被覆盖，配置差异统一写进父 Chart 的 values'
      ],
      related: ['hl-chart-yaml', 'hl-helpers', 'hl-lint', 'hl-template', 'hl-package'],
      docs: 'https://helm.sh/docs/helm/helm_create/',
      tags: ['脚手架', 'Chart', '入门']
    },

    /* ---------- 25 / 25 ---------- */
    {
      id: 'hl-plugin',
      name: 'helm plugin / version / env',
      alias: ['helm plugin install', 'helm version', 'helm env', 'helm 环境排错'],
      level: 3,
      syntax: 'helm plugin list|install|uninstall [选项]\nhelm version\nhelm env',
      summary: '装插件与查环境变量，排「命令不存在/找不到仓库」类问题。',
      desc: '`helm plugin` 管理和安装扩展，`helm-diff`、`helm-secrets`、`helm-unittest` 是使用率最高的三个；`helm version` 确认客户端版本与是否连得上集群；`helm env` 打印 `HELM_REPOSITORY_CONFIG`、`HELM_CACHE_HOME`、`KUBECONFIG` 等关键路径，CI 里「本地能跑、流水线不行」多看一眼这个输出就能定位。',
      params: [
        { flag: 'helm plugin list', desc: '列出已安装插件及其版本' },
        { flag: 'helm plugin install <git地址>', desc: '从 Git 仓库安装插件，可加 `--version` 指定版本' },
        { flag: 'helm plugin uninstall <名称>', desc: '卸载插件' },
        { flag: 'helm version --short', desc: '只打印版本号，脚本里判断版本用（推 OCI 需要 3.8+）' },
        { flag: 'helm env', desc: '打印全部 HELM_* 环境变量与路径，排查缓存/配置问题' }
      ],
      examples: [
        { cmd: 'helm version --short', desc: '确认 Helm 版本，OCI 相关功能要求 3.8 以上' },
        { cmd: 'helm env', desc: '查看仓库配置、缓存与 KUBECONFIG 的实际路径' },
        { cmd: 'helm plugin install https://github.com/databus23/helm-diff', desc: '安装 helm-diff，用 `helm diff upgrade` 预览升级会改哪些资源' },
        { cmd: 'helm diff upgrade my-app ./charts/my-app -n prod -f values-prod.yaml', desc: '升级前预览真实差异，比 dry-run 更直观，大幅降低误发风险' },
        { cmd: 'helm plugin install https://github.com/helm-unittest/helm-unittest --version 0.5.1', desc: '安装单元测试插件，给模板断言加一道保险' }
      ],
      notes: [
        '插件是本地二进制或脚本，团队协作时版本不一致会导致结果不同，CI 镜像里要固定插件版本',
        '`helm env` 输出的路径可用 `HELM_CACHE_HOME`、`HELM_CONFIG_HOME`、`HELM_DATA_HOME` 覆盖，容器里挂载缓存能显著加快仓库刷新',
        '`helm version` 报连接错误说明 kubeconfig 有问题，此时 `helm repo` 类命令仍可用，要把「本地操作」和「集群操作」分开判断',
        '第三方插件会执行本地命令，只从可信来源安装'
      ],
      related: ['hl-list', 'hl-upgrade', 'hl-repo-add', 'hl-template', 'k8s-version'],
      docs: 'https://helm.sh/docs/helm/helm_plugin/',
      tags: ['插件', '环境', '排错']
    }

  );
})();
