/* ==========================================================================
   data/cards-cloud.js · 每日一练卡片 · 云平台与保障体系
   --------------------------------------------------------------------------
   覆盖 6 个分类：
     cloud-cli  华为云 CLI（KooCLI / obsutil）    21 张
     cicd       CI/CD 与 Git                       15 张
     security   安全与合规                         13 张
     perf       性能压测与调优                     11 张
     iac        Terraform / Ansible                10 张
     kvm        虚拟化与镜像                        8 张

   字段与质量线见 data/cards.js 顶部契约，这里只记两条本文件特有的约定：

   ① `run` 一律写"引擎真跑得通"的命令（tools/card-check.js 会逐条执行）。
      引擎没实现的命令（terraform / ansible / virsh / qemu-img / openssl /
      ausearch / getenforce / ab / wrk / fio / sysbench / chmod / lastb）
      所在的卡片**不写 run**，只做"读卡"——宁缺毋滥，绝不用别的命令凑数。
      凡是 run 与 answer 不同名的，run 都是这道题里**真实存在的一个检查步骤**
      （例如 answer 是删除命令、run 是删之前用于核对身份的那条查询）。

   ② iac 与 kvm 两个分类的命令引擎全部没实现，因此这 18 张卡片
      **全部没有 run**，一律写成 `distinguish` 或"现象→结论"的 diagnose，
      靠辨析而不是靠手速体现价值。

   ⚠️ 涉及云凭证的示例一律用 `<你的AK>` / `<你的SK>` 这类尖括号占位，
      任何真实密钥形状的字符串都不允许出现在这个文件里。
   ========================================================================== */
(function () {
  'use strict';

  window.CC_CARDS = window.CC_CARDS || [];

  window.CC_CARDS.push(

    /* ==================================================================
       A. 华为云 CLI（KooCLI 与 obsutil）· 21 张
       ================================================================== */

    {
      id: 'card-hw-config-list-before-init',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 1,
      front: '你接手同事的终端，要查的机器在哪个账号、哪个区域都不确定，下一步就要敲查询命令。',
      hint: '先看清现状，还是先写一份配置？',
      answer: 'hcloud configure list',
      why: '它把本机保存的所有配置项连**脱敏后的 AK、region、鉴权模式**一起列出来，是"这台机器现在用谁的凭证、打哪个区域"最直接的答案。而 `configure init` 是**交互式写入**：同名 profile 会被新输入的值直接覆盖，在不知道现状时先跑它，等于闭着眼改配置。',
      contrast: '判据看 region 列：显示 `cn-north-4` 而你要查的是上海一的机器，后面每条查询都会返回**空列表而不是报错**——"查不到"看起来像没权限或机器没了，实际只是区域不对。只想临时换环境，就在命令末尾加 `--cli-profile=` / `--cli-region=`，不要改配置文件：默认值是共享的，改一次会影响这台机器上的所有人和所有脚本。',
      run: 'hcloud configure list',
      cmdIds: ['hw-hcloud-config-list', 'hw-hcloud-config-init'],
      lesson: 'hw-cli-profile',
      tags: ['华为云', 'KooCLI', 'profile']
    },

    {
      id: 'card-hw-ecs-addresses-fixed-floating',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 2,
      front: '机器在控制台显示"运行中"，可你从办公网连它的 22 端口一直超时，安全组里也放行了。',
      hint: '先确认这台机器到底有没有公网入口。',
      answer: 'hcloud ECS ListServersDetails --cli-region=cn-north-4',
      why: '返回的 `addresses` 是「网段 → 地址数组」的嵌套结构，每个地址都带 `OS-EXT-IPS:type`：`fixed` 是 VPC 内网地址，**只有 `floating` 才是绑定的弹性公网 IP**。一台机器只有 `fixed` 条目，就意味着它在 VPC 外根本不可达——这时候去查安全组是白费功夫。判据：在 `addresses` 里数一下有没有 `floating`。',
      contrast: '确实没绑 EIP 也别急着新建一个：先看账号里有没有状态为 `DOWN` 的闲置 EIP 可以复用（新建一个就是多一份钱）。绑定时注意**EIP 绑的是网卡而不是机器**，得先拿到网卡端口 ID 才能绑——`addresses` 里那个 UUID 键就是端口 ID。',
      run: 'hcloud ECS ListServersDetails --cli-region=cn-north-4',
      cmdIds: ['hw-ecs-list', 'hw-ecs-eip-bind', 'hw-flow-ssh-inventory'],
      lesson: 'hw-ecs-inventory',
      tags: ['ECS', 'EIP', '公网']
    },

    {
      id: 'card-hw-ecs-count-vs-array-len',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 3,
      front: '盘点脚本跑出来的机器台数总比控制台少一大截，可命令本身一条错误也没报。',
      hint: '返回值里有一个字段，天生就比数组长。',
      answer: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --limit=100 --offset=0',
      why: '华为云多数列表接口**默认只返回一页（常见 25 条）**，剩下的要靠 `--offset` 累加翻页，而翻页这件事接口不会替你报警。判据非常直接：返回体里 `count` 的值大于 `servers` 数组的长度，就说明还有下一页。循环的终止条件写成"取到空数组就停"，比按 `count` 循环更稳——`count` 本身也可能是估算值。',
      contrast: 'obsutil 走的是另一套分页参数：`-limit` 配 `-marker=<上一页最后一个对象名>`，**没有 `--offset`**，两套混着写会直接报未知参数。另外被限流时（HTTP 429 或 `Throttling` 一类错误）不要死循环重试：用指数退避加随机抖动，并降低并发；读接口重试是安全的，写接口重试要先确认它是幂等的。',
      run: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --limit=100 --offset=0',
      cmdIds: ['hw-cross-paging-backoff', 'hw-ecs-list', 'hw-obsutil-ls'],
      lesson: 'hw-ecs-inventory',
      tags: ['华为云', '分页', '脚本']
    },

    {
      id: 'card-hw-cli-query-changes-shape',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 2,
      front: '给查询加了字段过滤之后，下游那几行 `jq` 全返回 `null`，命令自己却一声不响。',
      hint: '被换掉的不只是字段，还有整个返回结构。',
      answer: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[*].name"',
      why: '`--cli-query` 是**投影**而不是筛选：它把整个返回体替换成查询结果本身。原来顶层是 `{"count":2,"servers":[...]}`，查询 `servers[*].name` 之后顶层直接变成 `["web-prod-01","db-prod-01"]`，`jq` 里必须写 `.[]` 而不是 `.servers[]`。**路径错了不报错，只会安静地给出 `null`**，这是最耗时间的一类故障。',
      contrast: '想保留原结构就别用它：`--cli-output=json > ecs.json` 落盘后再让 `jq` 处理 `.servers[]`。脚本里**永远不要用 `--cli-output=table`**——列宽随内容变化，解析必崩。JMESPath 里字符串比较用单引号，shell 里还得再包一层双引号，写错的表现同样是"结果为空"而不是报错。',
      run: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[*].name"',
      cmdIds: ['hw-hcloud-output', 'hw-flow-ssh-inventory'],
      tags: ['KooCLI', 'JMESPath', '脚本']
    },

    {
      id: 'card-hw-obsutil-cp-recursive-flag',
      cat: 'cloud-cli',
      kind: 'syntax',
      level: 2,
      front: '把整个构建目录传到桶里：\n\n  obsutil cp ./dist obs://<桶名>/web/ ____ -f\n\n横线处至少该补哪个参数？',
      hint: '要处理的是一个目录，不是一个文件。',
      answer: '-r',
      why: '`-r` 是递归，**传目录必须显式加**，只有传单个文件时才能省。它和 `-f` 是两个互不相干的维度：`-r` 决定"能不能处理目录"，`-f` 决定"遇到同名对象要不要逐条问你"。脚本里 `-f` 不加会**卡在交互确认上直到超时**，比直接报错更难查。',
      contrast: '`-r` 加 `-f` 只解决"传得上去"，不解决"传得快"：`cp` 不做差异比较，同名文件**全量重传**。前端发布这类大部分文件没变的场景应该用 `obsutil sync`（逐文件比对后跳过没变的），但要注意它是**单向补齐、不会删除** OBS 上多出来的旧对象，与 `aws s3 sync --delete` 不是一回事。',
      run: 'obsutil cp ./dist obs://prod-static/web/ -r -f',
      cmdIds: ['hw-obsutil-cp', 'hw-obsutil-sync', 'hw-cross-dryrun'],
      lesson: 'hw-obs-publish',
      tags: ['obsutil', '上传', '参数']
    },

    {
      id: 'card-hw-obsutil-dryrun-casing',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 2,
      front: '发布前端之前想先确认这一趟到底会传哪些文件，尤其怕把 `.env`、`node_modules` 一起弄上公网桶。',
      hint: '有个开关能让它"只说要做什么"，一个字节都不传。',
      answer: 'obsutil sync ./dist obs://<桶名>/web/ -dryRun',
      why: '`-dryRun` 会把**将要上传的文件完整列出来，但一个字节都不传**，是发现"同步范围写错了"的唯一机会——输出里出现你不认识的路径，就该停下来改 `-include`/`-exclude`。大小写有讲究：obsutil 是 `-dryRun`（单横线带大写 R），AWS S3 是 `--dryrun`（全小写），写成对方那套会被当成未知参数直接报错。',
      contrast: '别把预演当保证：它**只校验参数与权限**，不校验业务约束（配额、桶策略、名称冲突），"预演通过"不等于"一定成功"。对没有预演能力的操作（`obsutil rm -r`、华为云多数删除接口），替代办法是先跑**只读查询**核对目标前缀或资源 ID，再执行写操作。',
      run: 'obsutil sync ./dist obs://prod-static/web/ -dryRun',
      cmdIds: ['hw-cross-dryrun', 'hw-obsutil-sync', 'hw-flow-obs-static-site'],
      lesson: 'hw-obs-publish',
      tags: ['obsutil', '预演', '发布']
    },

    {
      id: 'card-hw-obs-403-aksk-vs-anonymous',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 3,
      front: '上传一路成功，同事在浏览器里打开同一个地址却是 `AccessDenied`。',
      hint: '这两个访问者是两种身份，走的是两套鉴权。',
      answer: 'obsutil chattri obs://<桶名>/web/index.html -acl=public-read',
      why: '命令行工具用的是 **AK/SK 签名**，只要 IAM 给了权限就一定能读；浏览器是**匿名访问**，只看桶策略与对象 ACL。上传时没显式指定 ACL 的对象**跟随桶策略**，新桶默认私有——所以"工具能读"完全不能证明"浏览器能读"，这两件事必须分开验证。',
      contrast: '另外三个高频 403 与权限无关：静态网站托管的**默认首页没配**（访问桶根路径变成列对象或 404）、对象 `Content-Type` 被存成 `application/octet-stream`（浏览器拒绝执行 JS）、以及用了 OBS 默认域名而访问走的是 HTTPS。SPA 项目还要把错误页也指向 `index.html`，否则刷新子路由直接 404。',
      cmdIds: ['hw-flow-obs-static-site', 'hw-obsutil-stat-chattri', 'hw-obs-bucket'],
      lesson: 'hw-obs-publish',
      tags: ['OBS', '权限', '静态网站']
    },

    {
      id: 'card-hw-obs-two-cli-dialects',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 2,
      front: '同样是操作 OBS，同事从文档里抄来的参数一粘就报"未知参数"，换一套写法又完全正常。',
      hint: '桶和对象是同一批，工具却是两套。',
      answer: 'obsutil <子命令> 用短选项（-r/-f/-j）；hcloud OBS <操作名> 用长参数（--bucket=/--key=）',
      why: '`hcloud OBS` 是 KooCLI 按 OBS 接口元数据生成的操作，风格是**动宾式操作名加长参数**（`ListBuckets`/`PutObject`、`--bucket=`/`--key=`），鉴权复用 `~/.hcloud/config.json`；`obsutil` 是对象存储专用工具，风格是**短子命令加短选项**（`ls`/`cp`/`sync`、`-r`/`-f`/`-j`），鉴权读自己的 `.obsutilconfig`。两者操作同一批桶，语法却毫无共通之处。',
      contrast: '混着写的表现是**直接报未知参数**，而不是鉴权失败——按报错类型就能分清是"语法写错"还是"权限不够"。真正难查的是**配置分两份**：轮换 AK 时 `hcloud configure` 与 `obsutil config` 都要改，漏一个的典型症状就是"KooCLI 查桶正常、obsutil 报 403"。',
      run: 'obsutil ls',
      cmdIds: ['hw-obs-vs-obsutil', 'hw-obsutil-config', 'hw-obs-bucket'],
      lesson: 'hw-obs-publish',
      tags: ['OBS', 'obsutil', 'KooCLI']
    },

    {
      id: 'card-hw-obsutil-rm-prefix-boundary',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 3,
      front: '要清掉某一年份的旧资源，一条批量删除下去，相邻年份的对象也跟着没了。',
      hint: '这里的"递归"匹配的到底是什么边界？',
      answer: 'obsutil rm obs://<桶名>/web/2024/ -r -f',
      why: '`-r` 匹配的是**对象名前缀**而不是目录边界：OBS 没有真目录，写成 `web/2024` 会把 `web/2024-backup/`、`web/2024Q1/` 一起命中。所以前缀**必须以 `/` 结尾**，而且执行前必须先用列表命令把同前缀的清单打出来看一遍——删除不可恢复，开了多版本控制的桶里被删的对象也只是变成仍占空间、仍计费的历史版本。',
      contrast: '更稳的做法是**不删**：给桶配生命周期规则按前缀自动过期，一次配置长期有效，也不担心手滑。真要手工删就分两步走；脚本里 `-f` 必须加（不加会卡在逐条确认上直到超时），但人肉操作时留着确认反而更安全。',
      run: 'obsutil ls obs://prod-backup/web/ -limit=10',
      cmdIds: ['hw-obsutil-rm', 'hw-obsutil-ls', 'hw-obs-get-delete-object'],
      lesson: 'hw-obs-publish',
      tags: ['OBS', '删除', '危险操作']
    },

    {
      id: 'card-hw-obsutil-endpoint-not-region',
      cat: 'cloud-cli',
      kind: 'syntax',
      level: 2,
      front: '区域是北京四，给对象存储专用工具配一次凭证：\n\n  obsutil config -i=<你的AK> -k=<你的SK> ____\n\n横线处该填什么？',
      hint: '它要的不是区域代号，而是能拼出访问域名的那串东西。',
      answer: '-e=obs.cn-north-4.myhuaweicloud.com',
      why: 'obsutil 的 `-e` 要的是 **endpoint（终端节点）**，写成区域代号 `-e=cn-north-4` 会连接失败——工具拿它去拼访问域名，拼不出来。三个值必须成套：长期凭证用 `-i`/`-k`，临时凭证（委托/STS 场景）还要补 `-t=<securitytoken>`，缺一个一律签名失败。',
      contrast: '同一家云内部就不统一：KooCLI 那边写的是 `--cli-region=cn-north-4`，obsutil 这边写 endpoint，**两者不能互换**。`.obsutilconfig` 是**明文**保存的，与 `~/.hcloud/config.json` 相互独立——轮换密钥时两个文件都要改。',
      run: 'obsutil config -i=<你的AK> -k=<你的SK> -e=obs.cn-north-4.myhuaweicloud.com',
      cmdIds: ['hw-obsutil-config', 'hw-hcloud-config-set', 'hw-obs-vs-obsutil'],
      lesson: 'hw-obs-publish',
      tags: ['obsutil', 'endpoint', 'AK/SK']
    },

    {
      id: 'card-hw-batch-power-soft-vs-hard',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 2,
      front: '停机维护窗口要一次关掉一批机器，接口给了一个模式参数：一个是"请操作系统自己关"，一个是"立刻断电"。',
      hint: '区别在于给不给应用做收尾的机会。',
      answer: 'hcloud ECS BatchStopServers --cli-region=cn-north-4 --os-stop=\'{"servers":[{"id":"<云服务器ID>"}],"type":"SOFT"}\'',
      why: '`SOFT` 是**优雅关机**：等操作系统响应，应用有机会落盘、注销、停服务，代价是可能被卡住的应用一直拖着不关。`HARD` 相当于拔电源，**未落盘的写入直接丢**，只在系统完全无响应时才用。而且批量接口只返回"已受理"，判据是机器状态从 `ACTIVE` 走到 `SHUTOFF` 才算真关完，中间那段是过渡态，此时再发命令容易失败。',
      contrast: '关机**不等于省钱**：按需实例关机后计算资源不再计费，但**系统盘、数据盘和绑定的 EIP 继续计费**。长期停机的机器不如做成镜像后删掉，否则账单上会一直挂着一笔看不见的沉默成本。',
      run: 'hcloud ECS BatchStopServers',
      cmdIds: ['hw-ecs-batch-power', 'hw-ecs-show', 'hw-flow-cost-idle'],
      tags: ['ECS', '批量', '关机']
    },

    {
      id: 'card-hw-delete-server-keep-disk',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 3,
      front: '测试机器要下线，但机器上那块数据盘还得留作证据，你正准备执行删除。',
      hint: '删除接口上挂着两个"连带处理"的开关。',
      answer: 'hcloud ECS DeleteServers --cli-region=cn-north-4 --servers=\'[{"id":"<云服务器ID>"}]\' --delete_publicip=false --delete_volume=false',
      why: '`--delete_volume` 管机器上的云硬盘，`--delete_publicip` 管绑定的弹性公网 IP，两个都传 `false` 就是"只删机器、附件全留"。代价是留下的盘会变成 `available` 状态**继续计费**，所以删除任务做完必须回头列一次云盘清单——漏了这一步，"留作证据"就变成"留着一张月账单"。',
      contrast: '反向的坑更致命：`--delete_publicip=true` 释放的 EIP **基本拿不回来**，如果这个 IP 已经进了白名单、备案或域名解析，释放就是一次线上事故。另外**删除云服务器本身不可恢复**（除非事先做过镜像或备份），删之前先确认没有依赖它的负载均衡后端、数据库白名单和定时任务。',
      run: 'hcloud ECS ListServersDetails --cli-region=cn-north-4',
      cmdIds: ['hw-ecs-delete', 'hw-evs-list', 'hw-flow-cost-idle'],
      lesson: 'hw-evs-unattached',
      tags: ['ECS', '删除', '计费']
    },

    {
      id: 'card-hw-evs-resize-two-halves',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 3,
      front: '云盘扩容的接口已经调完，机器上再看可用空间，容量纹丝不动。',
      hint: '变大的是块设备，还是文件系统？',
      answer: 'hcloud EVS ResizeVolume --volume_id=<云硬盘ID> --os-extend=\'{"new_size":200}\' --cli-region=cn-north-4',
      why: '云盘扩容天然分两半：接口只把**块设备**变大，操作系统里还要再扩**分区与文件系统**。判据就在两条命令的对照上——`lsblk` 看到的盘容量已经变大，而 `df -h` 还是老数字，说明第一步成了、第二步没做。补上 `growpart /dev/vdb 1` 再 `resize2fs /dev/vdb1`（XFS 用 `xfs_growfs /data`），`df` 才会变。',
      contrast: 'LVM 结构下顺序不同：要先 `pvresize`、再 `lvextend`，最后才 `resize2fs`，直接对物理盘做分区扩容是错的。反方向的**缩容不支持**，买大了只能新建小盘迁数据。ext4 与 XFS 都支持在线扩容，不用卸载——但不做系统内这一步，应用看到的永远是老容量。',
      run: 'lsblk',
      cmdIds: ['hw-evs-resize-growpart', 'hw-evs-list', 'hw-evs-attach-detach'],
      lesson: 'hw-ecs-inventory',
      tags: ['EVS', '扩容', '文件系统']
    },

    {
      id: 'card-hw-sg-union-and-default-deny',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 3,
      front: '一台机器的数据库端口在某个安全组里明明有放行规则，你据此判定"网络这边没问题"，可应用还是连不上。',
      hint: '这块网卡上绑了几个组？多个组的规则是取交集还是取并集？',
      answer: 'hcloud VPC ListSecurityGroups --cli-region=cn-north-4',
      why: '安全组是**白名单**：没有任何规则允许的流量一律被拒，不存在"默认全通"。同时一块网卡可以绑**多个**安全组、规则取**并集**——所以"你记得的那个组放行了"本该是通的，真正要查的是**这台机器绑定的全部安全组**里有没有哪一条把源地址卡住了。判据：把全部组、全部规则一并拉出来看，而不是只看你记得的那一个。',
      contrast: '安全组是**有状态**的：放行入方向请求后，返回流量自动允许，不需要再配出方向——照传统防火墙思路重复配置只会越配越乱。另外别忽略**子网级**的网络 ACL 与主机内的 firewalld/iptables：云上"端口不通"的固定顺序是**绑定的全部安全组 → 网络 ACL → 主机防火墙 → 服务是否监听**，跳过任何一层都会白折腾。',
      run: 'hcloud VPC ListSecurityGroups',
      cmdIds: ['hw-vpc-sg-list', 'hw-vpc-sg-rule', 'hw-vpc-troubleshoot-port', 'sec-sg-minimal'],
      lesson: 'hw-sg-3306',
      tags: ['华为云', '安全组', 'VPC']
    },

    {
      id: 'card-hw-eip-associates-port-not-server',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 3,
      front: '要把一个闲置的公网 IP 绑到某台云服务器上，你拿着机器 ID 去找绑定接口，却发现参数里根本没有这一项。',
      hint: '这个资源绑定的对象，比"机器"低一层。',
      answer: 'hcloud VPC ListPorts --cli-region=cn-north-4 --device_id=<云服务器ID> --cli-query="ports[*].id"',
      why: '弹性公网 IP 绑定的是**网卡端口（port）**而不是云服务器本身：接口要的是 `associate_instance_type=PORT` 加上一个 `associate_instance_id`（端口 ID）。机器与端口是一对多的关系（多网卡机器有多个端口），所以必须先按 `device_id` 查出端口，再拿端口 ID 去绑定——绑错对象的典型表现是"服务本身正常，就是外网访问不到"。',
      contrast: '**解绑不等于释放**：解绑后的 EIP 仍然按小时计费，不用了要显式删除，而释放后 IP 不可找回。还有一种"绑了却不通"是安全组没放行——EIP 只解决"有没有公网路径"，端口开不开由安全组决定。',
      run: 'hcloud ECS ListServersDetails --cli-region=cn-north-4',
      cmdIds: ['hw-ecs-eip-bind', 'hw-ecs-list', 'hw-flow-cost-idle'],
      lesson: 'hw-eip-idle-billing',
      tags: ['EIP', '公网IP', 'VPC']
    },

    {
      id: 'card-hw-ces-dim-format',
      cat: 'cloud-cli',
      kind: 'syntax',
      level: 3,
      front: '要按实例取一段 CPU 监控数据，命名空间与指标名都填好了，取数接口还是返回空：\n\n  hcloud CES ShowMetricData --namespace=SYS.ECS --metric_name=cpu_util ____ --filter=average --period=300 --from=1735689600000 --to=1735776000000\n\n横线处该填什么？',
      hint: '监控数据要定位到"哪一个对象"，靠的是名字与值的组合。',
      answer: '--dim.0=instance_id,<云服务器ID>',
      why: 'CES 的指标用**命名空间 + 指标名 + 维度**三层定位，维度参数是「维度名,维度值」的数组形式（多个维度依次写 `--dim.0`、`--dim.1`）。维度名必须与指标列表接口返回的完全一致：CPU 用 `instance_id`，磁盘与网卡类指标还要额外带挂载点或网卡维度，**写错不报错，只是取不到数据**。',
      contrast: '同一类错误还有两处：`--from`/`--to` 是**毫秒**时间戳，传成秒会查到 1970 年附近或直接返回空；`--period` 只能取固定档位（300/1200/3600/14400/86400 秒），跨度大却用 300 秒粒度容易被拒或返回巨量数据点。取不到数时先不加 `--cli-query`，看一次原始返回结构再决定字段路径。',
      cmdIds: ['hw-ces-show-metric-data', 'hw-ces-list-metrics'],
      lesson: 'hw-ces-metric-first',
      tags: ['CES', '监控', '参数']
    },

    {
      id: 'card-hw-nova-vs-ecs-new-api',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 2,
      front: '同样查一台机器，文档里给出的操作名一个带 Nova 前缀、一个不带，返回的字段结构也不一样。',
      hint: '它们是两代接口，管的是同一批机器。',
      answer: '查询阶段两代可以混用；**创建与变更类操作一律用新版**',
      why: '带 `Nova` 前缀的是兼容 OpenStack 的旧接口集，字段贴近原生结构；ECS v2.1（`ListServersDetails`/`CreatePostPaidServers`/`BatchStartServers` 等）是自研新版。两者操作的是**同一批云服务器、同一个 ID**，所以查询混着用不会出错——区别在于**新规格与新特性只在 v2.1 提供**，变更类操作走旧接口会少参数、少能力。',
      contrast: '判据可以看状态值：`ACTIVE` 运行中、`SHUTOFF` 关机，`REBOOT`/`BUILD` 是过渡态（此时再发命令容易失败）。另外部分旧接口字段（如宿主机信息）只有管理员可见，普通账号返回空**是正常现象**，不要当成接口坏了——不确定操作名时以 `--help` 的输出为准，华为云 API 迭代很快。',
      run: 'hcloud ECS ListServersDetails --cli-region=cn-north-4',
      cmdIds: ['hw-ecs-show', 'hw-ecs-list', 'hw-hcloud-help'],
      lesson: 'hw-ecs-inventory',
      tags: ['ECS', 'Nova', 'API 版本']
    },

    {
      id: 'card-hw-cce-is-standard-k8s',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 2,
      front: '团队要上托管容器集群，有人担心站内学的那套容器编排命令到云上得重学一遍。',
      hint: '托管的是控制面，不是 API。',
      answer: 'kubectl --kubeconfig=<从控制台下载的文件> get nodes -o wide',
      why: '托管集群托管的只是**控制面**，对外暴露的仍是**标准 K8s API**：下载 kubeconfig（或在"连接信息"里复制命令）之后，`kubectl` 的所有子命令、资源类型、排障方法都不变，不必为某一家云单独学一套。云上与原生 K8s 的差异都在"集群之外"——节点池、插件市场、监控日志对接。',
      contrast: 'kubeconfig 是**集群管理凭证**（等同管理员权限），别提交 Git、别在群里传，控制台可设有效期。另一个高频坑是网络：kubeconfig 里写的是 apiserver 地址，在集群外使用需要它有公网入口或走 VPN/专线，否则报的是"连不上"而不是"没权限"。多集群场景一定先 `kubectl config get-contexts` 看清当前上下文再动手，生产上执行删除类命令前尤其要看。',
      run: 'kubectl config get-contexts',
      cmdIds: ['hw-cce-kubeconfig', 'hw-cce-list-clusters'],
      tags: ['CCE', 'Kubernetes', 'kubeconfig']
    },

    {
      id: 'card-hw-region-vs-endpoint-cross',
      cat: 'cloud-cli',
      kind: 'distinguish',
      level: 2,
      front: '同一套脚本里，一个工具让你写区域代号，另一个工具让你写一串域名，两个值看起来能互相推导。',
      hint: '一家云内部也有两套写法。',
      answer: 'KooCLI 用 --cli-region=cn-north-4；obsutil 用 -e=obs.cn-north-4.myhuaweicloud.com',
      why: '区域决定 API 端点、资源可见性与计费口径，但**同一家云内部并不统一**：一个收的是区域标识，另一个收的是能直接拼出访问域名的 endpoint。两者不能互换，写错的表现常常**不是报错而是查不到资源**——空列表看起来像"没权限"或"机器没了"，实际只是打错了区域。',
      contrast: '跨云更不统一：别家云用的是方位加序号或纯地名。华为云里还有一条更隐蔽的规则：**项目 ID 与区域必须配对**，两者不同区会报鉴权失败或资源不存在，这是命令行工具最高频的坑，比区域写错更难查——因为报错信息看起来像权限问题。',
      run: 'hcloud configure list',
      cmdIds: ['hw-cross-region-endpoint', 'hw-hcloud-config-list', 'hw-obsutil-config'],
      lesson: 'hw-cli-profile',
      tags: ['跨云', 'region', 'endpoint']
    },

    {
      id: 'card-hw-aksk-leak-first-action',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 4,
      front: '同事把带访问密钥的配置文件推到了公开仓库，你被叫去处理。',
      hint: '有一件事必须在做任何排查之前完成。',
      answer: '先在 IAM 控制台停用（或删除）这把访问密钥，再去查审计日志',
      why: '密钥一旦进入公开仓库，**几分钟内就会被扫描工具抓到并开始调用**，攻击者不需要任何漏洞就能创建资源、导出数据、删除备份。所以顺序不能颠倒：先止血（停用优先于删除，停用可回溯），再用云审计排查泄露时间点之后的全部调用记录——重点看有没有新建计算实例（挖矿）、改安全组、新建子用户或密钥（持久化）、以及对象存储的批量下载。',
      contrast: '**只删掉当前提交里的那行配置是无效的**：版本历史仍然保留，克隆历史照样能拿到，必须清理历史并强推，同时通知所有协作者重新克隆。另外**不要只换这一把密钥**——同一台机器上的数据库密码、SSH 私钥、第三方 API Token 都可能已经被读过，凭据之间存在横向移动风险，要一并轮换。',
      cmdIds: ['sec-aksk-leak', 'hw-iam-aksk-leak', 'hw-iam-user', 'hw-iam-agency'],
      lesson: 'hw-iam-ak-audit',
      tags: ['云安全', 'AK/SK', '应急']
    },

    {
      id: 'card-hw-batch-accepted-not-done',
      cat: 'cloud-cli',
      kind: 'diagnose',
      level: 3,
      front: '批量重启提交成功、返回值也正常，可脚本紧接着去读机器状态，读到的还是重启前的旧值。',
      hint: '这类接口回的是"收到了"，不是"做完了"。',
      answer: 'hcloud ECS NovaShowServer --server_id=<云服务器ID> --cli-region=cn-north-4 --cli-query="server.status"',
      why: '批量接口是**异步**的：它只回一个受理结果，机器随即进入过渡态，此时状态读出来既不是 `ACTIVE` 也不是最终值。脚本必须**轮询到目标状态**再往下走——判据是状态回到 `ACTIVE`（开机/重启）或 `SHUTOFF`（关机），而不是命令的返回码。',
      contrast: '轮询要有**超时上限**：过渡态长时间卡住通常意味着底层动作失败（配额、库存、宿主机异常），无限等下去会把流水线挂死。另外过渡态里再发变更命令（改规格、删机器）容易直接被拒，批量操作之间要留出状态稳定的间隔。',
      run: 'hcloud ECS BatchRebootServers --cli-region=cn-north-4',
      cmdIds: ['hw-ecs-batch-power', 'hw-ecs-show', 'hw-cross-paging-backoff'],
      tags: ['ECS', '异步', '轮询']
    },

    /* ==================================================================
       B. CI/CD 与 Git · 15 张
       ================================================================== */

    {
      id: 'card-git-diff-three-way',
      cat: 'cicd',
      kind: 'distinguish',
      level: 1,
      front: '提交前想确认"这次到底会写进去什么"，可文档里三个 diff 写法长得几乎一样。',
      hint: '工作区、暂存区、HEAD，三个位置两两比较。',
      answer: 'git diff（工作区 vs 暂存区）｜ git diff --cached（暂存区 vs HEAD）｜ git diff HEAD（工作区 vs HEAD）',
      why: '不带参数的 `git diff` **只比"工作区 vs 暂存区"**，所以 `git add` 之后它会变空——很多人到这一步以为改动丢了，其实是跑错了命令。要审"这次提交真正会写进去的内容"必须用 `git diff --cached`（等价 `--staged`）；想一次看全部（已暂存加未暂存）就用 `git diff HEAD`。判据：同一份改动，add 之前 `git diff` 有输出、add 之后没输出，这就证明它比的是暂存区。',
      contrast: '`git diff --stat` 只给每个文件的增删行数，适合提交前扫一眼范围，但**不告诉你改了什么内容**。审代码一律看完整 diff——`--stat` 通过、内容里却硬编码了一个密码，是真实发生过的翻车方式。',
      run: 'cd /data/app && git diff HEAD',
      cmdIds: ['ci-git-diff', 'ci-git-add', 'ci-git-commit'],
      lesson: 'ci-git-commit-config',
      tags: ['Git', 'diff', '暂存区']
    },

    {
      id: 'card-git-nothing-added-to-commit',
      cat: 'cicd',
      kind: 'diagnose',
      level: 1,
      front: '文件明明改过，敲下提交命令却被回了一句 `no changes added to commit`。',
      hint: '改动落在"哪一段"才算是待提交的？',
      answer: 'cd /data/app && git status',
      why: '提交动作写的是**暂存区**，不是工作区。状态命令会把文件分成两段列出来：`Changes to be committed`（在暂存区，这次会被提交）与 `Changes not staged for commit`（只在工作区，不会进这次提交）——看着目标文件落在哪一段，就知道要不要补一次 add。',
      contrast: '`git commit -a` 能省掉 add，但它**只覆盖已被跟踪文件的修改与删除，不会带上新文件**。所以"用了 -a 还是漏文件"的原因通常不是命令没生效，而是那个文件从来就没被跟踪过——它在状态输出的 `Untracked files` 段里，必须显式 add。',
      run: 'cd /data/app && git status',
      cmdIds: ['ci-git-commit', 'ci-git-add', 'ci-git-diff'],
      lesson: 'ci-git-commit-config',
      tags: ['Git', '提交', '暂存区']
    },

    {
      id: 'card-git-reset-vs-revert',
      cat: 'cicd',
      kind: 'distinguish',
      level: 3,
      front: '一次改动写错了，但这几个提交**已经推到远端**，别人可能已经拉过。',
      hint: '一种是改写历史，一种是追加历史。',
      answer: 'git revert <提交>（公共分支）｜ git reset --hard <提交>（仅限本地未推送）',
      why: '`git reset` 是**移动分支指针**：被回退掉的提交从分支历史上消失，别人已经拉过就会和你对不上，下次推送要么被拒、要么把别人的工作覆盖掉。`git revert` 是**新增一个反向提交**抵消原来的改动，历史只增不改，所有人都能安全地拉取。判据：reset 之后 `git log` 里看不到那个提交，revert 之后能看到多出一条 `Revert ...`。',
      contrast: '`reset` 的三种模式差别在**动到哪一层**：`--soft` 只移指针（改动留在暂存区）、`--mixed`（默认）移指针并清暂存区（改动留在工作区）、`--hard` 连工作区一起抹掉——**`--hard` 之后未提交的改动没有回收站**。真误删了还能靠 reflog 找回指针，但它是本地记录、有保留期，不能当备份用。',
      run: 'cd /data/app && git log --oneline -3',
      cmdIds: ['ci-git-reset', 'ci-git-revert', 'ci-git-reflog'],
      lesson: 'ci-git-log-tag',
      tags: ['Git', '回退', '公共分支']
    },

    {
      id: 'card-git-fetch-vs-pull',
      cat: 'cicd',
      kind: 'distinguish',
      level: 2,
      front: '想知道远端有没有新提交，但又不想让本地工作区被合来合去。',
      hint: '一个只更新引用，一个还会动你的文件。',
      answer: 'git fetch',
      why: '`git fetch` 只把远端对象与引用拉下来，**工作区与当前分支一动不动**，拉完可以先看别人改了什么，再决定要不要合并——这是"先侦察后动手"。`git pull` 等于 fetch 加合并，会直接改你的工作区，本地有未提交改动时还可能撞上冲突。',
      contrast: '判据是状态输出里那句 `Your branch is behind origin/main by N commits`：fetch 之后这句话就会出现，说明远端确实有新东西而工作区没被动过。合并策略上，带 `--rebase` 的拉取会让本地提交叠到远端之后、历史更线性，但**已经推出去的提交不要 rebase**，那会改写别人已经拉到的历史。',
      run: 'cd /data/app && git status',
      cmdIds: ['ci-git-fetch', 'ci-git-pull', 'ci-git-branch-remote'],
      lesson: 'ci-git-branch-fix',
      tags: ['Git', '同步', '远端']
    },

    {
      id: 'card-git-status-porcelain',
      cat: 'cicd',
      kind: 'syntax',
      level: 2,
      front: '要在脚本里判断"工作区干不干净"，可默认输出里那几行提示文字随时可能变：\n\n  git status ____\n\n横线处填什么？',
      hint: '要一份机器稳定可读、每行一个文件的结果。',
      answer: '--porcelain',
      why: '`--porcelain`（简写 `-s`）输出**固定格式的两列状态码加路径**，每行一个文件，且格式承诺跨版本稳定；默认输出里那些 `On branch main`、`use "git add..."` 是给人看的，会随版本和语言环境变化，拿它做字符串匹配迟早会崩。判据：干净的仓库里 `--porcelain` **什么都不输出**，而默认输出永远有 `On branch ...` 这一行。',
      contrast: '两列状态码含义不同：左列是**暂存区 vs HEAD**，右列是**工作区 vs 暂存区**；`??` 是未跟踪、` M` 是改了没 add、`M ` 是已经 add。要连被忽略规则挡掉的文件一起看，得再加 `--ignored`——默认不列它们。',
      run: 'cd /data/app && git status --porcelain',
      cmdIds: ['ci-git-diff', 'ci-git-add'],
      lesson: 'ci-git-commit-config',
      tags: ['Git', '脚本', '状态']
    },

    {
      id: 'card-gitignore-dir-vs-glob',
      cat: 'cicd',
      kind: 'syntax',
      level: 2,
      front: '两条忽略规则要分别表达"只忽略这个目录"和"忽略任意层级的这类文件"：\n\n  ____      ← 只忽略名为 logs 的目录及其内容\n  *.log     ← 任意层级的 .log 文件\n\n横线处填什么？',
      hint: '结尾那个符号决定它匹配的是目录还是文件。',
      answer: 'logs/',
      why: '**结尾带斜杠**表示只匹配目录：`logs/` 忽略名为 logs 的目录及其全部内容；不带斜杠的 `logs` 会同时匹配同名的**文件**和目录。而不含斜杠的 `*.log` 按"任意层级"匹配——深在子目录里的日志和根目录下的日志都会被忽略，这一点与很多人对"路径模式"的直觉相反。',
      contrast: '**已经被跟踪的文件不会因为写进忽略文件就自动消失**：忽略规则只作用于未跟踪文件，已经在版本控制下的日志照样显示改动。要让它真的不再出现，得先把它移出跟踪（`git rm --cached`）再提交。另外 `!` 开头的例外规则必须写在对应的忽略规则**之后**才生效，顺序反了等于没写。',
      run: 'cd /data/app && cat .gitignore',
      cmdIds: ['ci-git-add', 'ci-git-commit'],
      lesson: 'ci-git-commit-config',
      tags: ['Git', 'gitignore', '规则']
    },

    {
      id: 'card-git-config-author-identity',
      cat: 'cicd',
      kind: 'diagnose',
      level: 2,
      front: '流水线里的提交记录作者全是一串机器名加邮箱，追责和通知都没法做。',
      hint: '提交作者不是从登录账号推出来的，是配置里读的。',
      answer: 'cd /data/app && git config --list',
      why: '作者信息来自 `user.name` 与 `user.email` 两项配置，**版本控制工具不会去查系统账号**，没配就用机器默认值（常见就是 root 加上主机名）。判据就是配置清单里的这两行；CI 里通常在每个作业开始时按当前触发人设置一次，让历史里留下真实身份。',
      contrast: '改配置要分清层级：仓库级写在仓库的配置里（跟着仓库走），带 `--global` 的写在用户目录（跟着人走），同名时**仓库级优先**——"改了全局却不生效"基本都是被仓库级覆盖了。另外作者（author）与提交者（committer）是两个字段，rebase、cherry-pick 之后它们会不一致，排查时要先分清看的是哪一个。',
      run: 'cd /data/app && git config --list',
      cmdIds: ['ci-git-config', 'ci-git-commit'],
      lesson: 'ci-git-commit-config',
      tags: ['Git', '配置', 'CI']
    },

    {
      id: 'card-git-branch-a-missing-remote',
      cat: 'cicd',
      kind: 'diagnose',
      level: 2,
      front: '本地新建的分支明明推上去了，同事那边却说"看不到这个分支"。',
      hint: '他的本地记录里，远端分支列表还停在过去。',
      answer: 'cd /data/app && git branch -a',
      why: '不带参数的 `git branch` 只显示**本地分支**，加 `-a` 才会把远端引用一起列出来。别人在你推送**之前**取过远端，他本地的远端引用就停在那一刻——新分支不在他的列表里，需要先同步一次远端引用才会出现。判据：输出里有没有 `remotes/origin/<分支名>` 这一行。',
      contrast: '更常见的情况是只建了本地分支、从没推送过：列表里只有本地那一行，没有任何远端对应项。另外注意分支名里的斜杠是**目录层级**，分支 `release/1.2` 与同名标签是两个不同引用，两者同时存在时会报 `refname is ambiguous`，删除和推送时都要写全。',
      run: 'cd /data/app && git branch -a',
      cmdIds: ['ci-git-branch', 'ci-git-branch-remote', 'ci-git-fetch'],
      lesson: 'ci-git-branch-fix',
      tags: ['Git', '分支', '远端']
    },

    {
      id: 'card-git-checkout-vs-restore',
      cat: 'cicd',
      kind: 'diagnose',
      level: 2,
      front: '想把一个文件恢复到上次提交的样子，你顺手敲了老写法，结果整个工作区被切到了另一个分支上。',
      hint: '老命令一个词管两件事，新命令把它们拆开了。',
      answer: 'git restore <文件>',
      why: '老写法里"从某个提交取回文件"和"切换分支"共用同一个子命令，参数形态又极像，误伤率很高。新版本把它拆成两个专用命令：一个**只管文件**（配 `--staged` 还能撤销暂存），另一个**只管分支**。判据：命令后跟的是文件路径还是分支名——意图是"恢复文件"就该走只管文件的那个。',
      contrast: '恢复文件**会直接丢掉工作区里未提交的改动，没有回收站**；只想撤销暂存、保留改动，要用带 `--staged` 的形式。另外从历史版本取回单个文件后，它处于"已修改未暂存"状态，还得再 add 一次才会进下一次提交——这一步漏掉会造成"明明恢复了却没提交上"。',
      run: 'cd /data/app && git status -s',
      cmdIds: ['ci-git-switch', 'ci-git-add'],
      lesson: 'ci-git-branch-fix',
      tags: ['Git', 'restore', '误操作']
    },

    {
      id: 'card-git-log-oneline-scope',
      cat: 'cicd',
      kind: 'diagnose',
      level: 1,
      front: '线上刚出问题，你要在几十条提交里快速找出"最近动过这个文件的那几次"。',
      hint: '先缩小时间范围，再看单行标题。',
      answer: 'cd /data/app && git log --oneline -5',
      why: '`--oneline` 把每条提交压成"短 sha 加装饰加标题"一行，一屏能看十几条；配合条数限制把范围压到最近几次，是事故现场最快的定位手法。判据：装饰里的 `(HEAD -> main, tag: v1.2.3, origin/main)` 能一眼看出当前 HEAD、标签、远端指针是不是在同一个提交上——对不上就说明有本地未推送的提交。',
      contrast: '要把结果**限定到某个文件或目录**，在命令末尾加 `-- <路径>`：`--` 后面的参数一律当成路径，避免与分支名混淆。要逐行找出"这行是谁写的"用 blame；不确定是哪次提交引入的问题，用二分法定位比顺着历史翻快得多。',
      run: 'cd /data/app && git log --oneline -3',
      cmdIds: ['ci-git-log', 'ci-git-tag', 'ci-git-diff'],
      lesson: 'ci-git-log-tag',
      tags: ['Git', 'log', '定位']
    },

    {
      id: 'card-git-not-a-repository',
      cat: 'cicd',
      kind: 'diagnose',
      level: 1,
      front: '在应用目录里执行版本控制命令，回了一句 `fatal: not a git repository`。',
      hint: '这个工具是从你当前所在的位置开始往上找的。',
      answer: 'cd /data/app && git status',
      why: '版本控制工具从当前目录**逐级向上**查找仓库标记目录，找到哪一级就把那一级当仓库根——所以进到子目录里照样能用，而在仓库树之外的任何地方都会报这个错。判据就是报错本身：先确认自己在不在仓库目录树里，而不是去怀疑命令写错或权限不够。',
      contrast: '另有一条容易混淆的报错是 `fatal: not in a git directory`，它来自那些**允许在仓库外运行**的子命令（如配置类），两者含义相近但来源不同。还有一个变体：仓库标记目录被复制或打包时丢了一半，表现为目录看着对但状态命令仍报 not a git repository，这时只能重新克隆。',
      run: 'cd /data/app && git status',
      cmdIds: ['ci-git-init', 'ci-git-clone', 'ci-git-config'],
      tags: ['Git', '排错', '仓库']
    },

    {
      id: 'card-git-commit-a-vs-add-all',
      cat: 'cicd',
      kind: 'distinguish',
      level: 2,
      front: '提交时想省掉 add 那一步：一个选项只处理"已经跟踪过"的文件，另一个写法连新文件一起收。',
      hint: '区别就在"新文件算不算"。',
      answer: 'git commit -a（只带已跟踪文件的修改与删除）｜ git add -A 之后再 commit（连新文件一起）',
      why: '`-a` 是 add 的**受限版本**：它只把已被跟踪文件的修改与删除收进提交，**新建的文件一个都不带**。要连新文件一起提交，必须先 `git add -A`（或按路径 add）再 commit。判据：状态输出里待在 `Untracked files` 段的文件，无论用多少次 `-a` 都不会进提交。',
      contrast: '`git add -A` 在仓库根执行时收全仓库的改动，而 `git add .` 只作用于**当前目录**——在子目录里执行点号会漏掉兄弟目录的改动，这是"明明 add 了却没提交上"的常见原因。另外被忽略规则命中的文件两者都不会收，需要强制参数才能加，但强制跟踪一个忽略文件通常意味着忽略规则本身写错了。',
      run: 'cd /data/app && git status -s',
      cmdIds: ['ci-git-add', 'ci-git-commit'],
      lesson: 'ci-git-commit-config',
      tags: ['Git', '提交', '暂存']
    },

    {
      id: 'card-ci-jenkins-credential-echo',
      cat: 'cicd',
      kind: 'diagnose',
      level: 3,
      front: '流水线日志里，数据库密码以明文整行打印了出来，任何能看构建日志的人都拿到了它。',
      hint: '密码不该作为普通变量穿过整条流水线。',
      answer: '在流水线里用 credentials 绑定（withCredentials / environment 的凭据助手），而不是把密码存成普通参数',
      why: '凭据绑定会把值包成**掩码对象**：日志输出里自动替换成星号，同时变量的生命周期被限制在那一段绑定块内，块外读不到。判据很直接——**在日志里搜密码明文**，只要出现过一次，就说明它走的是普通变量而不是凭据绑定。',
      contrast: '掩码不是万能的：它靠**字符串匹配**做替换，密码被编码、拼接、写进文件再打印出来就会漏。更根本的做法是"**让密码根本不进流水线日志**"：敏感值直接挂在部署目标的凭据库里（如 K8s Secret、配置中心），流水线只传引用。另外凭据轮换后要同步更新流水线平台的凭据库，否则会出现"代码改了、构建还在用旧密码"。',
      cmdIds: ['ci-jenkins-credentials', 'ci-jenkins-pipeline'],
      tags: ['Jenkins', '凭据', '安全']
    },

    {
      id: 'card-ci-image-tag-latest',
      cat: 'cicd',
      kind: 'distinguish',
      level: 3,
      front: '镜像标签规则没定，大家按习惯分别用了 latest、分支名和提交短 sha。',
      hint: '标签要能回答"这次发布到底是哪份代码"。',
      answer: '用不可变的提交 sha（或语义版本加 sha）做标签；latest 只当"最近一次"的展示别名',
      why: '`latest` 是**可移动标签**：同一个名字今天指向 A、明天指向 B，无法从"线上跑的是哪个镜像"回溯到"哪次提交"，回滚也就无从谈起。提交 sha 天然唯一且不可变，查看 Pod 详情时的镜像名可以直接对应到一次提交。判据：拿到线上镜像标签，能不能**唯一定位**到一次代码提交。',
      contrast: '生产上常见的组合是"**人类可读的主标签（语义版本或日期）加提交 sha 唯一标签**"，两者指向同一个镜像摘要。更严谨的做法是**按摘要而不是标签部署**，才能防住"同名标签被覆盖推送"——这正是"回滚了却还是坏的"最常见原因。仓库里那些 `<none>` 标签是被新构建顶掉的旧镜像，长期不清理会一直占磁盘。',
      run: 'docker images',
      cmdIds: ['ci-image-tag', 'ci-docker-buildx', 'ci-argocd-sync'],
      tags: ['CI/CD', '镜像', '发布']
    },

    {
      id: 'card-git-log-count-flag',
      cat: 'cicd',
      kind: 'syntax',
      level: 1,
      front: '提交列表太长，只想看最近 3 条，并且每条压成一行：\n\n  git log --oneline ____\n\n横线处填什么？',
      hint: '限制条数有三种写法，最短的那种最常见。',
      answer: '-3',
      why: '`-<数字>` 是"只显示最近 N 条"的简写，等价于 `-n 3`，也等价于 `--max-count=3`。它写在 `--oneline` 前后都可以。判据：输出正好 3 行，每行第一个字段是 7 位短 sha，标题里还带着指向当前 HEAD 的装饰。',
      contrast: '别把"限制条数"和"限制范围"搞混：按时间、按作者、以及"某分支有而另一分支没有"的范围写法限制的是**提交集合**，与条数无关，而且可以叠加。要看某个提交的完整改动用带 diff 的那条命令——默认的历史输出不带改动内容。',
      run: 'cd /data/app && git log --oneline -3',
      cmdIds: ['ci-git-log', 'ci-git-diff'],
      lesson: 'ci-git-log-tag',
      tags: ['Git', 'log', '参数']
    },

    /* ==================================================================
       C. 安全与合规 · 13 张
       ================================================================== */

    {
      id: 'card-sec-secure-log-failed-password',
      cat: 'security',
      kind: 'diagnose',
      level: 2,
      front: '凌晨有一段异常登录，你要先确认"到底有没有人试过、试了多少次"。',
      hint: '认证失败会落在哪一个日志文件里？',
      answer: 'grep -i "Failed password" /var/log/secure',
      why: '认证事件写在 `/var/log/secure`（Debian 系是 `/var/log/auth.log`），每一行都带**失败账户名、来源 IP、来源端口**三样关键信息，是判断"是不是爆破、从哪来、打的哪个账号"最可靠的一手材料。判据看三点：失败是否在短时间内密集；账户名是真实用户还是 `invalid user`（后者说明在盲猜常见用户名）；来源 IP 是不是同一个。',
      contrast: '成功登录记录与失败记录**不在同一个数据源**：记录成功登录的那条命令读的是 wtmp，**看不到任何失败**，拿它来证明"没人试过"是彻底的误判。要从认证日志里做聚合统计（按 IP、按账户）得再接一段文本处理管道，光这一条命令只能看到明细。',
      run: 'grep -i "Failed password" /var/log/secure',
      cmdIds: ['sec-secure-log', 'sec-lastb'],
      lesson: 'sec-ssh-brute-force',
      tags: ['安全', '日志', '爆破']
    },

    {
      id: 'card-sec-last-vs-lastb-vs-secure',
      cat: 'security',
      kind: 'distinguish',
      level: 2,
      front: '要看登录历史：一个来源只记成功、一个只记失败，第三个连失败原因都写着。',
      hint: '它们读的是三个不同的文件。',
      answer: '成功登录（读 wtmp）｜ 失败尝试（读 btmp）｜ /var/log/secure（认证过程与失败原因）',
      why: '三个来源职责不同：wtmp 只记**成功登录**（谁、从哪来、停留多久），btmp 只记**失败尝试**（默认只有 root 能读），`secure` 记的是**认证对话的全过程**——包括失败原因（密码错、无效用户、密钥被拒）与会话开关。判据：要回答"有人在爆破吗"必须看 btmp 或 secure，**wtmp 里干干净净完全不能作为没被攻击的证据**。',
      contrast: '基于 wtmp/btmp 的老命令会被**日志轮转**影响：转走的历史要用 `-f` 指定轮转后的文件才看得到，不指定就只看到当前文件里那几天——"记录怎么突然变少了"多数是这个原因，而不是日志被清。真要留证据，应该把认证日志实时外送到集中日志平台，本地被清也无所谓。',
      run: 'last -n 5',
      cmdIds: ['sec-lastb', 'sec-secure-log', 'sec-backdoor-check'],
      lesson: 'sec-ssh-brute-force',
      tags: ['安全', '登录历史', '审计']
    },

    {
      id: 'card-sec-ssh-private-key-mode',
      cat: 'security',
      kind: 'diagnose',
      level: 2,
      front: '登录跳板机时客户端直接拒绝，说这把私钥"不受保护"，可文件明明读得出来。',
      hint: '它拒绝的不是内容，是权限位。',
      answer: 'chmod 600 ~/.ssh/id_ed25519',
      why: 'SSH 客户端对私钥权限有**硬性要求**：只要 group 或 other 上有任何权限位，就直接拒绝加载并报 `UNPROTECTED PRIVATE KEY FILE`——这是保护机制在工作，不是文件坏了、也不是密钥内容有问题。判据：`ls -l` 的第一列必须是 `-rw-------`，出现 `-rw-r--r--` 之类就必须改。',
      contrast: '同一套检查还管三处，缺一都会被拒：私钥 600、`authorized_keys` 600、`.ssh` 目录 700——而报错通常只提私钥，容易只改一个。权限对了但**属主不对**同样不行，那时要用改属主的命令而不是改权限位的命令。改完最好再确认一次文件内容没被"顺手覆盖"，尤其是多人共用的跳板机。',
      run: 'ls -l /root/.ssh/id_ed25519',
      cmdIds: ['sec-ssh-keygen', 'sec-backdoor-check'],
      tags: ['安全', 'SSH', '权限']
    },

    {
      id: 'card-sec-redis-listen-address',
      cat: 'security',
      kind: 'diagnose',
      level: 3,
      front: '一台对外提供服务的缓存实例，运维说"已经限制成本机访问了"，你要自己确认一遍。',
      hint: '同一个端口号，绑定的地址不同，含义完全不同。',
      answer: 'ss -tulnp | grep 6379',
      why: '判据在**绑定地址**这一列：`127.0.0.1:6379` 表示只接受本机连接，`0.0.0.0:6379` 表示所有网卡都接受。缓存未授权访问是三个条件**同时**成立的结果——监听在 `0.0.0.0`、没设密码、安全组放行了这个端口；缺任何一条都进不来。所以看到 `0.0.0.0` 要先去改服务自己的绑定地址与保护模式，而不是只在安全组上做文章。',
      contrast: '把监听地址直接改成 `127.0.0.1` 有时会**把应用一起弄挂**——应用在别的机器上时就再也连不上了。跨机访问的正解是：保持内网监听、设置密码、并且安全组的源地址写成**应用层安全组**而不是 `0.0.0.0/0`。另外端口通了不代表业务可用，还要确认认证配置是否匹配。',
      run: 'ss -tulnp | grep 6379',
      cmdIds: ['sec-sg-minimal', 'sec-backdoor-check', 'ln-ss'],
      lesson: 'sec-fw-3306-blocked',
      tags: ['安全', 'Redis', '暴露面']
    },

    {
      id: 'card-sec-chmod-600-numeric',
      cat: 'security',
      kind: 'syntax',
      level: 1,
      front: '把 SSH 私钥改回只有属主可读写：\n\n  chmod ____ ~/.ssh/id_ed25519\n\n横线处填什么？',
      hint: '三位数字，分别对应属主、同组、其他人。',
      answer: '600',
      why: '权限位分三组（属主 / 同组 / 其他），每组按 r=4、w=2、x=1 相加：`600` 就是属主读写、另外两组一位都没有。**SSH 的硬性要求是 group 与 other 一位都不能有**，所以 `640`、`660` 一样会被拒绝并报 `UNPROTECTED PRIVATE KEY FILE`——这不是"差不多就行"的场景。',
      contrast: '符号写法 `u=rw,go=` 与 `600` 等价，但**别用递归的 777 当排障手段**：它把"权限不对"换成"所有人都能改"，安全扫描直接判高危，而真正的根因（属主错了、强制访问控制上下文不对）一个都没解决。另外改权限位与改属主是两条不同的命令，混用会出现"权限看着对了服务还是起不来"。',
      cmdIds: ['sec-ssh-keygen', 'sec-backdoor-check'],
      tags: ['安全', '权限位', 'chmod']
    },

    {
      id: 'card-sec-md5sum-baseline-compare',
      cat: 'security',
      kind: 'diagnose',
      level: 3,
      front: '发布包在某台机器上跑起来行为不对，你怀疑这个文件被人替换过。',
      hint: '你需要一个"原来应该是什么样"的参照物。',
      answer: 'md5sum /data/app/app.jar',
      why: '摘要命令输出"32 位十六进制摘要加文件名"，把它与**发布时记录的摘要**逐字符比对，就能确认文件是否被换过。关键在参照物：必须先有基线（构建产物落盘时就把摘要存档），事后才有可比对象——事后临时算一遍，得到的只是"现在这个文件长什么样"，证明不了任何事。',
      contrast: 'MD5 已被证明可以**构造碰撞**，对抗性场景（有人故意伪造）要换更长的摘要算法；发现意外损坏或替换这类目标，MD5 够用。系统文件层面有更省事的办法：包管理器自带的校验（RPM 系是 `rpm -Va`）一次比对权限、属主、大小与摘要，前提是文件由包管理器安装——自己编译安装的文件不在它的管辖范围内。',
      run: 'md5sum /data/app/app.jar',
      cmdIds: ['sec-rpm-va', 'sec-backdoor-check'],
      lesson: 'sec-upload-scan-baseline',
      tags: ['安全', '完整性', 'md5sum']
    },

    {
      id: 'card-sec-curl-k-scope',
      cat: 'security',
      kind: 'distinguish',
      level: 3,
      front: '内网接口用的是自签证书，同事让你"先加个参数跑通"，这个参数要不要写进 CI 脚本？',
      hint: '它关掉的不是证书本身，是"校验"这件事。',
      answer: 'curl -k 只用于手工定性判断，不进脚本',
      why: '`-k`（等价 `--insecure`）关掉的是**服务端证书链校验**，也就是放弃了"我在跟谁说话"的确认——中间人可以无感替换证书，你拿到的响应可能来自别人。它的正确用法是**二分定位**：加 `-k` 通了、不加报 `certificate verify failed`，就说明故障在证书链而不是接口逻辑，方向立刻清楚。',
      contrast: '修的方向不是长期加 `-k`，而是把**中间证书**一起配上（证书链不完整是自签与内网环境最常见的原因），或者显式指认自建 CA 的证书文件去信任它。另外三个参数常被混：只看响应头、看握手细节、跳过校验——排证书问题要的是前两个，把第三个当日常手段就是把安全性让掉了。',
      run: 'curl -k https://127.0.0.1:8443/healthz',
      cmdIds: ['sec-cert-chain', 'sec-openssl-sclient', 'sec-cert-expiry-check'],
      lesson: 'sec-chain-incomplete',
      tags: ['安全', 'TLS', 'curl']
    },

    {
      id: 'card-sec-aksk-leak-stop-first',
      cat: 'security',
      kind: 'diagnose',
      level: 4,
      front: '运维在公开仓库里发现了带云访问密钥的配置片段，群里的第一反应是"先查是谁推的"。',
      hint: '有一件事比追责更急，而且窗口只有几分钟。',
      answer: '先在 IAM 控制台停用（或删除）这把访问密钥，再排查调用记录',
      why: '密钥进公开仓库后会被扫描工具在**几分钟内**抓走并开始调用，攻击者不需要任何漏洞就能创建资源、导出数据、删备份。顺序必须是**先止血再看影响**：停用优先于删除（可回溯），然后用云审计拉取泄露时间点之后的调用记录，重点看有没有新建计算实例（挖矿）、改安全组、新建子用户或密钥（持久化）、以及对象存储的批量下载。',
      contrast: '只删掉当前提交里的那行配置**是无效的**：版本历史仍然保留，克隆历史照样能拿到，必须清理历史并强推，同时通知所有协作者重新克隆。还有一点常被漏：**不要只换这一把密钥**——同一台机器上的数据库密码、SSH 私钥、第三方 Token 都可能已经被读过，凭据之间可以横向移动，要一并轮换。',
      cmdIds: ['sec-aksk-leak', 'sec-huawei-iam', 'sec-vault-kv'],
      tags: ['云安全', 'AK/SK', '应急']
    },

    {
      id: 'card-sec-sg-source-group-not-cidr',
      cat: 'security',
      kind: 'distinguish',
      level: 3,
      front: '数据库安全组的入方向规则里，源地址填的是应用服务器的固定 IP 段，应用一扩容就要改规则。',
      hint: '云上有一个"会跟着成员变化"的源地址写法。',
      answer: '把源地址写成应用层的**安全组 ID**，而不是 IP 段',
      why: '安全组的源可以是另一个安全组的 ID，规则含义就变成"允许**这个组里的所有成员**访问"——应用扩容、换 IP、重建实例，规则都不用动。判据很实用：用 IP 段当源时，每次扩缩容都会冒出"新机器连不上数据库"的工单；用安全组当源则完全没有这个动作。',
      contrast: '自查暴露面时最该盯的是"全网来源加高危端口"（22、3389、3306、6379、9200）这种组合，它在自动化扫描里几乎必然被发现。还要记得看**出方向**：很多团队只配入方向，而出方向全开正是主机被控后能立刻外联矿池的前提。另外改规则**即时生效**，误删可能把自己关在门外，动手前先确认有控制台或带外通道这条后路。',
      run: 'hcloud VPC ListSecurityGroups',
      cmdIds: ['sec-sg-minimal', 'sec-nmap', 'hw-vpc-sg-rule'],
      lesson: 'hw-sg-3306',
      tags: ['安全组', '最小权限', '华为云']
    },

    {
      id: 'card-sec-selinux-avc-ausearch',
      cat: 'security',
      kind: 'diagnose',
      level: 3,
      front: '一个服务起不来，日志里只有一句 `Permission denied`，可相关文件和目录的权限、属主看着都对。',
      hint: '除了普通权限位，还有一层强制访问控制在管着。',
      answer: 'ausearch -m avc -ts recent -i',
      run: 'ausearch -m avc -ts recent -i',
      why: '强制访问控制的拒绝**不写在应用日志里**，它以 AVC 记录的形式进审计日志，所以"权限位全对却被拒绝"正是它的典型特征。判据看 AVC 记录里的两个字段：`scontext`（谁被拦）与 `tcontext`（访问什么被拦），据此决定是重打文件标签，还是放开对应的布尔开关。',
      contrast: '最快的**确诊**手段不是翻日志，而是把强制模式临时切成宽容再重启一次服务：能起来就基本锁定是它（验完要改回去）。但**别把临时关闭当解决方案**——那等于用降低安全性换取服务启动，真正的修法是按 AVC 结论开布尔值或修正文件上下文。没有审计日志的系统只能退而看内核环形缓冲区，信息会少很多。',
      cmdIds: ['sec-ausearch', 'sec-getenforce', 'sec-restorecon', 'sec-semanage-fcontext'],
      lesson: 'sec-selinux-www-403',
      tags: ['SELinux', '审计', '排错']
    },

    {
      id: 'card-sec-cert-expiry-days-left',
      cat: 'security',
      kind: 'diagnose',
      level: 3,
      front: '半夜开始有用户反馈"网站打不开、提示不安全"，服务进程还在、端口也通。',
      hint: '有一类故障是"到点自己发生"的。',
      answer: 'openssl x509 -in <证书文件> -noout -dates',
      why: '证书过期是**定时发生**的故障：服务进程活着、端口通、应用日志里没有报错，只有客户端侧拒绝握手。判据是证书里的生效与失效时间跟当前时间的关系；线上排查要先看**服务实际加载的是哪个文件**（配置里写的证书路径），再看那个文件的到期日——不是看仓库里备份的那一份。',
      contrast: '两个容易被忘的点：**中间证书也会过期**，链上任何一张过期都会让部分客户端不信任，所以配置要给全链；续签成功后**不重载服务是不生效的**，进程用的还是内存里的旧证书——"续了还是过期"几乎都是这一步漏了。提前发现靠巡检：对每个域名查一次剩余天数并设告警，比半夜被叫起来强得多。',
      cmdIds: ['sec-cert-expiry-check', 'sec-openssl-x509', 'sec-certbot-renew', 'sec-cert-chain'],
      lesson: 'sec-chain-incomplete',
      tags: ['证书', 'HTTPS', '巡检']
    },

    {
      id: 'card-sec-journal-applog-audit',
      cat: 'security',
      kind: 'distinguish',
      level: 2,
      front: '同一个故障现场有三个日志来源：应用自己写的文件、服务管理器收集的日志、还有内核与审计记录。',
      hint: '一个记业务、一个记进程生命周期、一个记内核与安全事件。',
      answer: '应用日志文件（业务与异常栈）｜ 服务管理器日志（进程启停与标准输出）｜ 内核与审计日志（OOM、崩溃、强制访问控制拒绝）',
      why: '三者覆盖面不同：应用日志由代码决定写了什么，**服务根本没起来时它是空的**；服务管理器日志拿的是被捕获的标准输出与单元状态变化，能回答"进程被谁拉起、被什么信号杀掉、为什么反复重启"；内核与审计层则记录内存溢出、段错误、强制访问控制拒绝这类事件。判据：**应用日志为空或只有启动那几行**时，问题必然在进程之前，直接转去看单元状态与内核日志。',
      contrast: '单元日志里有一个特别值钱的判据是主进程与退出码：被 9 号信号杀掉通常是内存溢出，收到中止信号则是自身崩溃。而内存溢出的**凶手不在应用日志里**——要去内核环形缓冲区找那一行 `Out of memory: Killed process`，它才会告诉你谁被杀、当时内存多大。另外容器里的应用还要多一层：容器日志与节点上的内核日志是分开的。',
      run: 'journalctl -u myapp -n 20',
      cmdIds: ['lu-journalctl', 'sec-auditctl'],
      lesson: 'journalctl-unit',
      tags: ['日志', '排错', 'systemd']
    },

    {
      id: 'card-sec-obs-bucket-public-read',
      cat: 'security',
      kind: 'diagnose',
      level: 3,
      front: '安全扫描报告说"对象存储里有一个桶对公网可读"，你要先自己去核实。',
      hint: '桶的访问策略是一份独立配置，跟身份权限不是一回事。',
      answer: 'hcloud OBS ListBuckets --cli-region=cn-north-4，再逐个确认桶策略与对象 ACL 是否为公共读',
      why: '桶的公开性由**桶策略与对象 ACL** 决定，和"谁的 AK 有权限"是两套东西：IAM 给的是身份权限，桶策略给的是**匿名访问**权限，所以"我们账号里只有自己人"完全不能证明桶没公开。判据：匿名可读的桶能用不带任何签名的 HTTP 请求直接取到对象——这是最贴近攻击者视角的验证方式，比在控制台上看配置更可信。',
      contrast: '可读可写比只读更危险：任何匿名用户都能**上传**对象，常被用来托管钓鱼页面或当中转，账单与合规责任都算在你头上。排查时还要回头看有没有开**静态网站托管**——很多公开桶最初只是为了放前端，之后被人塞了别的东西进去；以及有没有开多版本控制，被删的对象可能仍以历史版本形式占着空间。',
      run: 'obsutil ls',
      cmdIds: ['sec-obs-bucket-acl', 'hw-obs-bucket', 'hw-flow-obs-static-site'],
      tags: ['OBS', '数据泄露', '合规']
    },

    /* ==================================================================
       D. 性能压测与调优 · 11 张
       ================================================================== */

    {
      id: 'card-perf-iostat-util-await',
      cat: 'perf',
      kind: 'diagnose',
      level: 3,
      front: '有台机器上接口时不时卡一下，负载不算高，CPU 也闲着一大半。',
      hint: '有一类等待既不占 CPU，也不体现在 CPU 使用率里。',
      answer: 'iostat -x 1 2',
      why: '判据在扩展模式的三列上：`%util` 接近 100% 说明设备几乎没有空闲时刻；`await`（单次请求平均耗时，含排队）明显高于平常——机械盘超过 20ms、固态盘超过 5ms 就该怀疑；`aqu-sz` 是平均队列深度，它和非零的 `wa` 一起涨才说明请求真的在排队。三列一起看，才能区分"设备一直很忙"和"请求在排队等"。',
      contrast: '同一份输出里有一个**不能采信**的列：`svctm` 已被工具作者标记为废弃，别拿它下结论。另一头也要小心：**固态盘上 `%util` 到 100% 不等于饱和**，设备本身可以并行处理大量请求，这时要看 `await` 与队列深度。要定位**哪个进程**在压盘，这里帮不上忙，得用按进程统计磁盘的那类工具。',
      run: 'iostat -x 1 2',
      cmdIds: ['mo-iostat', 'pf-fio', 'mo-vmstat'],
      lesson: 'perf-io-bottleneck',
      tags: ['性能', 'IO', 'iostat']
    },

    {
      id: 'card-perf-vmstat-first-row',
      cat: 'perf',
      kind: 'diagnose',
      level: 3,
      front: '连续观测时，第一行的块设备读写速率是几万，后面几行却只有几百，不知道该信哪个。',
      hint: '有一行的统计口径和后面几行不是一回事。',
      answer: 'vmstat 1 3',
      why: '**第一行是自开机以来的累计平均值**，只有本次执行才带这一行；从第二行起才是当前采样间隔内的真实值。所以"系统现在到底忙不忙"只能看第二行之后。判据是 `b` 列（处于不可中断睡眠状态的进程数）与 `wa` 列（CPU 花在等 IO 上的比例）：这两个值反映当下；而 `swpd`（已用交换空间）是**累计量**，非 0 只说明历史上用过交换，证明不了此刻在换页。',
      contrast: '真正代表内存压力的是 `si`/`so`（每秒换入换出）：长期为 0 而 `swpd` 很大属于历史遗留，可以不管；`si`/`so` 持续非 0 才说明内存不够、应用延迟会抖。另外这一层只能说"系统有压力"，**说不出是哪块盘、哪个进程**——设备层面转去看按设备展开的 IO 报告，进程层面转去看按进程统计的工具。',
      run: 'vmstat 1 3',
      cmdIds: ['mo-vmstat', 'mo-iostat', 'pf-swappiness'],
      lesson: 'perf-io-bottleneck',
      tags: ['性能', '内存', 'vmstat']
    },

    {
      id: 'card-perf-single-thread-ceiling',
      cat: 'perf',
      kind: 'diagnose',
      level: 3,
      front: '多核机器整体利用率只有一成多，接口延迟却明显上去了。',
      hint: '平均值会把一个跑满的核稀释掉。',
      answer: 'ps -eo pid,%cpu,%mem,cmd --sort=-%cpu',
      why: '`%cpu` 是**按单核归一化**的（与实时监控工具一致）：一个线程把某个核跑满就是 100%，哪怕机器有 64 个核。判据就是"榜首进程接近 100% 而整体利用率很低"这个组合——它说明瓶颈在**单线程**，加核加机器都救不了，只有拆并行或换算法才行。配合核数与负载一起看，三个数放一起结论才稳。',
      contrast: '注意这个 `%cpu` 是**自进程启动以来的平均值**，短时突发会被摊平，抓瞬时热点要用实时视图。确认是 JVM 应用后还要再下一层：先按线程找出最忙的那个，把十进制线程号**转成十六进制**，再到线程栈输出里搜对应的 `nid=0x...`——这才是"哪一行代码在烧 CPU"的答案。间隔数秒采样三次以上，避免把偶发抖动当热点。',
      run: 'ps -eo pid,%cpu,%mem,cmd --sort=-%cpu',
      cmdIds: ['mo-ps', 'pf-jstack-cpu', 'pf-taskset', 'mo-uptime'],
      lesson: 'perf-baseline-http',
      tags: ['性能', 'CPU', '单线程']
    },

    {
      id: 'card-perf-ss-summary-states',
      cat: 'perf',
      kind: 'diagnose',
      level: 2,
      front: '服务开始报"连不上"，但机器资源都很闲，你想先确认连接层面有没有异常。',
      hint: '要的是各类连接状态的汇总数，不是一条条明细。',
      answer: 'ss -s',
      why: '它一行给出各类套接字的**汇总**：已建立连接突然很大，通常是连接池泄漏或慢查询把连接占住了；处于时间等待状态的特别多，多半是短连接用完就关、没开长连接。判据是**与自己的基线比**而不是某个绝对数字——所以平时就要知道这台机器"正常时是多少"。',
      contrast: '时间等待状态多**不等于**故障：它是主动关闭方的正常状态，会自行消失。真正需要处理的是**本地端口耗尽**（报 `Cannot assign requested address`），那才轮到复用参数出场。反过来，已建立的不多但**大量连接堆在关闭等待状态**才是代码问题——对方已经关了，应用这一侧没关。',
      run: 'ss -s',
      cmdIds: ['pf-ss-summary', 'pf-tcp-tw-reuse', 'pf-ulimit-n'],
      lesson: 'perf-client-side',
      tags: ['性能', '连接', '排错']
    },

    {
      id: 'card-perf-app-waiting-downstream',
      cat: 'perf',
      kind: 'diagnose',
      level: 3,
      front: '接口耗时从两百毫秒涨到五秒左右就停住了，而 CPU、内存、磁盘、网络全都正常。',
      hint: '有一个数字是由配置决定的，不是由负载决定的。',
      answer: 'grep "query timeout" /data/app/logs/app.log',
      why: '延迟**精确地停在某个整数毫秒**（5 秒、3 秒、10 秒）是"应用在等下游"的典型特征：那个数字是配置里的超时值，不是真实处理时间——故障的下限由超时配置决定，而且往往伴随重试把压力放大。判据在日志里：`query timeout after 5000ms` 这种行直接指出等的是谁、等了多久；资源全闲正好排除了"自己算不过来"这条路径。',
      contrast: '另一种同样"资源全闲"的情况是**连接池被打满**：请求在池外排队，日志里**没有超时行**，只有处理时间变长——这时要看已建立连接数是不是贴着池上限。再往下才是查数据库本身（慢查询、锁等待）。建议把顺序固定成：日志里的超时行 → 连接数 → 下游语句，别一上来就加机器。',
      run: 'grep "query timeout" /data/app/logs/app.log',
      cmdIds: ['pf-perf', 'pf-bpftrace'],
      lesson: 'perf-jvm-gc',
      tags: ['性能', '超时', '排错']
    },

    {
      id: 'card-perf-cpu-topology-nproc',
      cat: 'perf',
      kind: 'diagnose',
      level: 2,
      front: '要按"每个核多少负载"来换算告警阈值，可手边几个命令给出的核数概念并不一样。',
      hint: '逻辑核、物理核、可用核是三件事。',
      answer: 'lscpu',
      why: '它一次给出三层信息：逻辑核数（也就是按核计数的那个命令返回的值）、物理核数（每颗处理器核数乘插槽数）、以及每核线程数——后者为 2 说明开了超线程。判据：拿逻辑核数去除负载会**低估实际压力**，因为超线程核跑计算密集任务拿不到两倍性能，两个线程抢一个物理核时各自只能算半个。',
      contrast: '在容器里这个命令看到的是**宿主机**拓扑，不等于容器能用的核数（要看 cgroup 配额）。做性能优化前还有一层要看：NUMA 拓扑——跨节点访存延迟能差近一倍，把进程与内存绑到**同一个节点**往往比调应用参数更立竿见影。强绑核之前也要先确认业务真的受调度抖动影响，否则只是把灵活性换掉了。',
      run: 'lscpu',
      cmdIds: ['pf-numactl', 'pf-taskset'],
      lesson: 'perf-baseline-http',
      tags: ['性能', 'CPU', '容量']
    },

    {
      id: 'card-perf-ab-n-vs-c',
      cat: 'perf',
      kind: 'distinguish',
      level: 2,
      front: '要给接口做一次基线压测，命令里有两个数字参数：一个决定总共发多少请求，一个决定同时压多少。',
      hint: '总数和并发是两件事，混了会得出严重偏低的结论。',
      answer: '-n 是请求总数，-c 是并发数（同时保持的连接数）：ab -n 1000 -c 10 <URL>',
      why: '`-n` 只决定"打多少发子弹"，`-c` 决定"几把枪同时开火"。**只调大总数不调并发，测的是串行吞吐**，得到的 QPS 会远低于服务端真实能力，还会让人误以为"系统只能扛这么点"。判据看输出里的并发级别与总耗时两行：QPS 约等于总请求数除以总耗时。',
      contrast: '这类 Apache 时代的老工具**默认不发长连接**（要显式加参数开启），单进程模型也让**它自己很容易先成为瓶颈**——压力机 CPU 打满而服务端很闲，就是这种情况，此时测出来的是压测机的上限。要压真实上限用多线程工具，要压业务链路（登录到下单到支付）用带场景编排的工具。还有一条底线：压测前确认压的是测试环境。',
      cmdIds: ['pf-ab', 'pf-wrk', 'pf-jmeter', 'pf-locust'],
      lesson: 'perf-result-longtail',
      tags: ['压测', 'ab', '基线']
    },

    {
      id: 'card-perf-somaxconn-vs-synbacklog',
      cat: 'perf',
      kind: 'distinguish',
      level: 3,
      front: '高并发下开始有客户端连接超时，但服务端 CPU 与内存都不紧张。',
      hint: '两个内核队列，一个装"还没握完手"的，一个装"已握手等应用来取"的。',
      answer: 'net.core.somaxconn（全连接队列上限）｜ net.ipv4.tcp_max_syn_backlog（半连接队列）',
      why: '握手完成但应用还没取走的连接排在**全连接队列**，它的上限取内核参数与程序调用监听时传入的 backlog 中的**较小值**；还在三次握手过程中的连接排在**半连接队列**。判据可以直接在监听列表上看：LISTEN 行的 `Send-Q` 就是该端口的全连接队列上限，`Recv-Q` 是当前排队数量——`Recv-Q` 持续贴着 `Send-Q` 就是队列被打满。',
      contrast: '队列打满只是**症状**：根因通常是应用取连接太慢（事件循环被阻塞）或后端处理慢，请求只是从"被拒绝"变成"在队列里排到超时"。把上限调大能让突发流量不丢，但**不改变吞吐上限**。另外调内核参数时别忘了同步调应用侧的监听 backlog，否则取较小值的那一端没变，调了等于没调。',
      cmdIds: ['pf-somaxconn', 'pf-sysctl', 'pf-file-max', 'pf-ulimit-n'],
      lesson: 'perf-kernel-tuning',
      tags: ['调优', '内核参数', '连接']
    },

    {
      id: 'card-perf-vmstat-interval-count',
      cat: 'perf',
      kind: 'syntax',
      level: 2,
      front: '要看的是**当前**压力，而不是开机以来的平均值：\n\n  vmstat ____\n\n横线处填什么？',
      hint: '两个数字：隔多久采一次、一共采几次。',
      answer: '1 3',
      why: '带两个数字时，**第一个是采样间隔秒数、第二个是采样次数**：`vmstat 1 3` 表示每秒采一次、共 3 次。**不带参数时它只输出一行"自开机以来的累计平均值"**，那个数字对排障几乎没有参考价值——"跑了但看不出问题"基本都出在这里。',
      contrast: '同类写法还有 `iostat -x 1 2`（间隔 1 秒、采 2 次）。要注意**第一行仍是累计值**，横向比较时要跳过它。次数别写太小，单次采样容易正好错过突发；想连续盯就用大一点的次数，或者干脆用定时重跑的方式。',
      run: 'vmstat 1 3',
      cmdIds: ['mo-vmstat', 'pf-sysctl'],
      lesson: 'perf-kernel-tuning',
      tags: ['vmstat', '采样', '参数']
    },

    {
      id: 'card-perf-ps-sort-desc',
      cat: 'perf',
      kind: 'syntax',
      level: 2,
      front: '按 CPU 占用从高到低排，只想看最靠前的几个：\n\n  ps -eo pid,%cpu,cmd ____ | head\n\n横线处填什么？',
      hint: '排序键前面那个符号决定方向。',
      answer: '--sort=-%cpu',
      why: '`--sort` 的**减号表示降序**：不加减号是升序，等于把最闲的进程排到第一屏，正好和排障意图相反。排序键必须与 `-o` 里列出的字段名**写法一致**（百分比字段要带百分号），写成裸的字段名会被当成未知的用户自定义字段直接报错。',
      contrast: '这里的 `%cpu` 是**自进程启动以来的平均值**，抓不到瞬时突发，要实时看热点得用会刷新的监控工具或按进程采样的工具。另外交互式监控工具里按 CPU 排序、按内存排序都是**按键操作**，写不进脚本——脚本里一律用一次性输出的批处理模式。',
      run: 'ps -eo pid,%cpu,%mem,cmd --sort=-%cpu',
      cmdIds: ['mo-ps', 'pf-jstack-cpu'],
      lesson: 'perf-jvm-gc',
      tags: ['ps', '排序', '参数']
    },

    {
      id: 'card-perf-layer-baseline',
      cat: 'perf',
      kind: 'distinguish',
      level: 3,
      front: '要回答"这套系统到底能扛多少并发"，团队里有人说直接上 500 并发压满看会不会崩。',
      hint: '拐点比崩溃点有用得多。',
      answer: '先用 -c 1 拿单请求基线，再逐档加并发找拐点，最后才压业务链路',
      why: '单请求基线回答"这套代码最理想的延迟是多少"；逐档加并发时，**QPS 不再上涨、平均延迟开始线性上升**的那个点就是当前架构的容量拐点——它比"压到崩"有用得多，因为崩掉的那一刻你已经不知道瓶颈在哪一层了。判据：把并发与 QPS 画成曲线，找第一个明显偏离线性的档位。',
      contrast: '压测结果的**可信度**取决于客户端：单进程、不发长连接的工具自己就会先饱和，测出来的上限偏低。要把压力机与服务端分开、用多线程工具，并同时盯服务端的磁盘利用率、换页计数、已建立连接数——**哪个先饱和，哪个就是这一档的瓶颈**。另外压测前务必确认目标环境，别把生产打挂。',
      cmdIds: ['pf-ab', 'pf-wrk', 'pf-fio', 'pf-sysbench'],
      lesson: 'perf-baseline-http',
      tags: ['压测', '容量', '方法论']
    },

    /* ==================================================================
       E. Terraform / Ansible · 10 张
       ⚠️ terraform 与 ansible 引擎都没实现，本分类**全部不写 run**。
       ================================================================== */

    {
      id: 'card-tf-plan-out-file',
      cat: 'iac',
      kind: 'syntax',
      level: 2,
      front: '生产环境要保证"真正执行的，就是我刚才看过的那一份计划"：\n\n  terraform plan ____=tfplan\n  terraform apply tfplan\n\n横线处填什么？',
      hint: '要让这次计算出来的计划落成一个文件。',
      answer: '-out',
      why: '`plan -out=<文件>` 把这次计算的计划**存档**，之后 `apply <文件>` 直接执行这份存档、**不会重新计算**——中间别人改了代码、改了变量，都不影响你要执行的内容。判据：`apply tfplan` 的输出里**不会再次出现计划预览**，它是照着存档直接落地的。',
      contrast: '计划文件里可能含**敏感值**（标记为 sensitive 的变量也会被写进去），所以这个文件不能提交到代码仓库、不能放共享目录。另外不带文件执行 `apply` 时会**重新算一次计划再等你确认**，你看过的和执行的严格来说不是同一份——并发协作的环境里，这正是"apply 出意外资源"的来源。',
      cmdIds: ['iac-tf-plan', 'iac-tf-apply'],
      lesson: 'iac-tf-plan-review',
      tags: ['Terraform', '计划', '发布']
    },

    {
      id: 'card-tf-state-rm-vs-destroy',
      cat: 'iac',
      kind: 'distinguish',
      level: 3,
      front: '要把一台机器从基础设施代码的管理范围里去掉，可这台机器还得继续跑业务。',
      hint: '一个只改登记簿，一个真去删资源。',
      answer: 'state rm <地址>（只摘登记，资源不动）｜ destroy（真的调云接口删除）',
      why: '摘登记只把资源从状态文件里**注销**：云上东西还在、还在跑，只是工具从此不认识它——之后执行计划看不见它、销毁也不会删它。要**删掉资源**必须走销毁路径（只想删一个就配按地址限定）。这两个命令的名字都不带"删"字眼，却一个留下、一个毁灭，混用的代价是数据没了。',
      contrast: '摘登记最常见的用法是配合导入做目录搬迁（旧目录摘、新目录收），或者让销毁跳过必须保留的资源。但要注意：**配置块还留着的话**，下一次 `apply` 会尝试重新创建同名资源，在云上直接撞上"已存在"一类冲突。所以动手之前先想清楚配置块要不要一起删，并且先把状态文件导出一份备份。',
      cmdIds: ['iac-tf-state-rm', 'iac-tf-destroy', 'iac-tf-import'],
      lesson: 'iac-tf-import-handover',
      tags: ['Terraform', 'state', '危险操作']
    },

    {
      id: 'card-tf-state-mv-vs-import',
      cat: 'iac',
      kind: 'distinguish',
      level: 3,
      front: '两个命令都用来"让状态和配置对上"，可一个要求地址已经在状态里，另一个要求它不在。',
      hint: '一个搬东西，一个收编东西。',
      answer: 'state mv：状态里已有该地址，改它的地址｜ import：状态里没有该资源，把云上已有的登记进来',
      why: '前提条件正好相反，这是区分它们最快的判据：搬地址操作针对的是**已经登记的**资源（重构模块路径、把按数量创建的改成按键创建时同步改地址），云上资源纹丝不动；导入操作收编的是**还没登记的**存量资源（控制台上手工创建的），它只写状态、**不生成配置**。',
      contrast: '导入之后**必须手工把资源块补全**，否则下一次执行计划会把"状态里有、配置里没有"判为待销毁——这是导入最著名的翻车方式。判断搬对了没有也有统一判据：搬地址之后计划应该是"无变更"；导入之后计划必然还有差异，要靠查看真实属性回写配置，一路磨到"无变更"才算接管完成。',
      cmdIds: ['iac-tf-state-mv', 'iac-tf-import', 'iac-tf-state-list'],
      lesson: 'iac-tf-import-handover',
      tags: ['Terraform', 'state', '重构']
    },

    {
      id: 'card-tf-import-no-config-generated',
      cat: 'iac',
      kind: 'diagnose',
      level: 3,
      front: '把控制台上手工建的一台机器纳管进代码之后，下一次执行计划里它居然变成了"待销毁"。',
      hint: '纳管这个动作只做了一半的工作。',
      answer: 'import 之后补全 resource 块，并反复执行计划磨到"无变更"',
      why: '导入操作**只把资源写进状态文件，不会生成任何配置**。于是状态里有、配置文件里没有——工具认为这个资源不该存在，计划里就是销毁它。判据：执行计划时出现销毁动作，且对象正是刚导入的那个地址，说明配置块没补或者属性对不上。',
      contrast: '补配置的正确姿势是**读出云端真实属性再回写**，而不是凭记忆写——手写的默认值和实际不符，计划会一直残留差异。有些属性云端根本不回读（如初始密码、初始化脚本），这类只能用忽略变更的生命周期参数处理。接管生产资源的底线是：**看到销毁重建标记就必须停下来改配置**，绝不能直接执行。',
      cmdIds: ['iac-tf-import', 'iac-tf-state-rm', 'iac-tf-plan', 'iac-tf-lifecycle'],
      lesson: 'iac-tf-destroy-triage',
      tags: ['Terraform', 'import', '存量资源']
    },

    {
      id: 'card-tf-taint-vs-replace',
      cat: 'iac',
      kind: 'distinguish',
      level: 3,
      front: '有台机器状态不干净，想让它下次执行时销毁重建。',
      hint: '老办法要跑两次，新办法一次完成。',
      answer: 'apply -replace=<资源地址>（新写法，一步到位）｜ taint <地址>（老写法，只打标记，下次执行才重建）',
      why: '打标记只改状态文件里的**标记位**，当下什么资源都不动，必须再跑一次应用才真正销毁重建——分两步意味着中间那段时间里，任何人跑一次应用都会触发重建。带 `-replace` 的写法把"标记加执行"合并进一次操作，意图和执行在一起，所以 0.15.2 之后官方推荐用它。判据：打过标记之后，计划里会出现销毁重建的 `-/+` 记号。',
      contrast: '重建意味着**服务中断**且实例 ID 变化：系统盘重新安装、数据盘按删除策略决定去留、绑定的公网 IP 需要重新关联。所以重建前先把流量摘走（负载均衡下线、从反向代理的后端列表里注释掉）。想取消标记有对应的反向命令；而"先建后删"的生命周期参数遇到**全局唯一**的资源名（如对象存储桶名）会让重建直接失败，因为同名的新旧两个不能并存。',
      cmdIds: ['iac-tf-taint', 'iac-tf-apply', 'iac-tf-lifecycle'],
      tags: ['Terraform', '重建', '变更']
    },

    {
      id: 'card-tf-validate-vs-plan',
      cat: 'iac',
      kind: 'distinguish',
      level: 2,
      front: '一个检查几秒钟就出结果、完全不联网，另一个慢得多而且会真的去调云接口。',
      hint: '语法自洽和"云上到底行不行"是两回事。',
      answer: 'validate（离线校验配置自洽）｜ plan（会调云接口，做真实差异对比）',
      why: '校验命令只检查语法、变量与资源引用是否存在、必填参数有没有漏、类型是否匹配——**它不访问云端也不读状态文件**，所以必须在初始化之后跑（要用到插件的 schema），几秒就能拦住低级错误，适合放进流水线第一步或提交钩子。计划命令会先刷新云端真实状态再算差异，慢是正常的。',
      contrast: '**校验通过不等于计划能过**：规格在该可用区有没有库存、镜像 ID 是否已过期、配额够不够，这些只有打到云上才知道。反过来说，计划报出的差异也**不一定是配置写错了**——别人在控制台手工改过资源时那叫真实漂移，先决定是"改配置对齐现状"还是"用执行把现状拉回来"，这是两套完全不同的处置。',
      cmdIds: ['iac-tf-validate', 'iac-tf-plan', 'iac-tf-fmt'],
      lesson: 'iac-tf-validate-before-commit',
      tags: ['Terraform', '校验', 'CI']
    },

    {
      id: 'card-tf-state-lock-stuck',
      cat: 'iac',
      kind: 'diagnose',
      level: 3,
      front: '一次流水线被强制中断之后，后面所有人执行任何基础设施命令都卡在同一个错误上。',
      hint: '远端状态文件被人"锁"住了，而锁的持有者已经不在了。',
      answer: 'terraform force-unlock <LOCK_ID>',
      why: '工具对远端状态文件加**互斥锁**，防止两个人同时写；进程被强杀时锁不会自动释放，于是所有人都用不了——错误信息里会带一个 **Lock ID**，强制解锁就吃这个 ID。判据：错误里的人名、机器名、时间戳对应的正是那次被中断的流水线。',
      contrast: '**强制解锁不会去检查锁的持有者是否还活着**，所以解锁前必须人工确认那次任务确实已经死了——万一它只是慢，两次操作会同时写状态文件，轻则互相覆盖、重则文件损坏。流水线里更稳的做法是加等锁超时让它排队，再配合"任务超时即终止"的设置，从源头减少残留锁。',
      cmdIds: ['iac-tf-force-unlock', 'iac-tf-backend', 'iac-tf-apply'],
      tags: ['Terraform', 'state', '锁']
    },

    {
      id: 'card-tf-state-in-git',
      cat: 'iac',
      kind: 'distinguish',
      level: 3,
      front: '团队想把状态文件一起提交到代码仓库，"这样大家就都有最新状态了"。',
      hint: '那份文件里存的不只是资源 ID。',
      answer: '用 backend 把状态放到远端（云上可用对象存储桶），并在忽略规则里排除状态文件',
      why: '状态文件是**纯文本明文**：资源 ID、连接串、以及创建时写入的密码类属性都在里面，提交到仓库等于把这些值公开；而且本地状态是"一人一台机器"的模型，第二个人一执行就会互相覆盖。判据很简单：在版本控制里搜一下有没有状态文件，只要有，就已经泄露了。',
      contrast: '迁移到远端的做法是加 backend 块再执行带迁移参数的初始化；云上一般用对象存储桶，**桶要开多版本控制与加密**——状态文件一旦损坏，没有历史版本就救不回来。远端后端也不是并发安全的终点：锁只能防"同时写"，防不了两个人用同一份配置改不同资源的心智混乱。另外插件版本锁定文件**应该**提交，它锁的是插件版本，和状态文件正好相反。',
      cmdIds: ['iac-tf-backend', 'iac-tf-init', 'iac-tf-providers-lock'],
      lesson: 'iac-tf-validate-before-commit',
      tags: ['Terraform', 'state', '安全']
    },

    {
      id: 'card-ans-command-vs-shell',
      cat: 'iac',
      kind: 'distinguish',
      level: 2,
      front: '要在远端执行一条命令：一个模块不走 shell、用不了管道，另一个走 shell、写起来自由但容易出事。',
      hint: '区别在于这条命令有没有经过一个 shell 解释。',
      answer: '-m command（不经过 shell，参数按列表传，更安全）｜ -m shell（走 /bin/sh -c，支持管道与重定向，需自行防注入）',
      why: '命令模块**不启动 shell**：管道、重定向、逻辑与、变量展开、通配符统统不生效，参数以列表形式传递、不会被再解释一次，因此天然免疫 shell 注入，是默认选择。shell 模块会把整串交给 `/bin/sh -c`，能做复杂表达式，代价是变量里带特殊字符时可能被当成命令执行——**变量来自外部输入时尤其危险**。',
      contrast: '判据看失败方式：用命令模块写带管道的语句不会报"注入"错，而是报"找不到名为 `|` 的文件"之类的诡异错误，一眼就能认出是模块选错了。需要幂等性时两者都不算好：它们每次执行都会被标记为"已变更"，除非加条件参数或显式声明"不算变更"。真正的配置管理应该优先用专用模块（文件、模板、服务），它们自带幂等。',
      cmdIds: ['iac-ans-command-shell', 'iac-ans-adhoc', 'iac-ans-register'],
      lesson: 'iac-ans-idempotent-check',
      tags: ['Ansible', '模块', '幂等']
    },

    {
      id: 'card-ans-check-mode-blindspot',
      cat: 'iac',
      kind: 'diagnose',
      level: 3,
      front: '上线前用"只模拟不改动"的模式跑了一遍剧本，全绿；正式执行却把服务重启了。',
      hint: '不是所有模块都愿意配合"模拟"。',
      answer: 'ansible-playbook -i <清单> site.yml --check --diff',
      why: '模拟模式是把"不真改"的责任交给**每个模块自己**去实现：文件、模板、服务这类标准模块支持得很好，而执行命令类的模块默认**直接跳过**——它们没法预知一条命令会改什么。于是"全绿"只覆盖了标准模块那部分，最危险的自定义命令恰好是盲区。而差异模式补上另一半价值：它会打印文件内容的前后对比。',
      contrast: '判据：模拟输出的结果里出现**被跳过的命令类任务**，就说明这些步骤根本没被模拟过。要缩小盲区，就给这类任务补上"已存在则跳过"之类的判断参数，让模块能自己决定要不要执行；或者显式声明某一步在模拟下也应该真跑——后者要非常谨慎，等于主动放弃这层保护。',
      cmdIds: ['iac-ans-playbook', 'iac-ans-handlers', 'iac-ans-command-shell'],
      lesson: 'iac-ans-idempotent-check',
      tags: ['Ansible', 'check', '变更']
    },

    /* ==================================================================
       F. 虚拟化与镜像 · 8 张
       ⚠️ virsh 与 qemu-img 引擎都没实现，本分类**全部不写 run**。
       ================================================================== */

    {
      id: 'card-kvm-shutdown-vs-destroy',
      cat: 'kvm',
      kind: 'distinguish',
      level: 2,
      front: '一台虚机要维护下电，命令里有两个动作：一个像在系统里点关机，一个像直接拔电源。',
      hint: '区别在于虚机有没有机会做完收尾。',
      answer: 'virsh shutdown <虚机>（发 ACPI 请求，优雅）｜ virsh destroy <虚机>（立即切断电源）',
      why: '优雅关机是**请求**：向客户机发 ACPI 信号，由系统自己去停服务、刷盘、卸载文件系统，所以需要客户机里装了 ACPI 支持（老系统、精简镜像可能完全不响应）。强制下电是**切断**：进程直接停，虚机没有任何收尾机会——未落盘的写缓存、进行中的事务、内存里的状态全都丢，文件系统还可能处于不一致状态，下次启动要日志恢复甚至全盘自检。',
      contrast: '优雅关机是**异步**的：命令返回不代表已经关完，脚本里必须轮询状态直到 `shut off` 再往下做（比如克隆磁盘），否则会在虚机仍在运行时动磁盘。真要强制时优先加"先礼后兵"的那个参数，它会先友好通知、失败再切断。顺序永远是：先优雅关机、等一两分钟、客户机彻底无响应（内核崩溃、死锁）才强制下电。',
      cmdIds: ['vm-virsh-start', 'vm-virsh-destroy', 'vm-virsh-list'],
      lesson: 'kvm-vm-down',
      tags: ['KVM', '关机', '数据风险']
    },

    {
      id: 'card-kvm-destroy-vs-undefine',
      cat: 'kvm',
      kind: 'distinguish',
      level: 3,
      front: '想把一台虚机彻底清掉，两个命令一个叫"销毁"、一个叫"取消定义"，而磁盘文件都不在它们的责任范围里。',
      hint: '一个断电，一个注销。',
      answer: 'destroy 只下电（虚机仍在列表里）｜ undefine 删除虚机定义，两者都不删磁盘文件',
      why: '强制下电的名字极具误导性：它**只是断电**，虚机仍留在完整列表里、状态显示为已关闭，随时能再启动。真正移除配置的是取消定义。而**磁盘镜像文件两个命令都不会删**——取消定义之后镜像就变成没人引用的"孤儿磁盘"，占着空间、也没人再管它。',
      contrast: '所以清理一台虚机的完整动作是三步，顺序不能反：确认业务已停 → 移除定义 → **人工确认后**再删镜像文件（删之前看有没有快照链依赖它，删了基础镜像整条差分链全废）。有些实现提供"连存储一起删"的开关，但那是把"人工确认"这一步交给命令行，生产上不建议用。',
      cmdIds: ['vm-virsh-destroy', 'vm-virsh-list', 'vm-virsh-dominfo'],
      lesson: 'kvm-host-handover',
      tags: ['KVM', 'libvirt', '清理']
    },

    {
      id: 'card-kvm-resize-no-shrink',
      cat: 'kvm',
      kind: 'distinguish',
      level: 3,
      front: '虚机磁盘买大了想调小一点，工具却要求额外加一个"我确认要这样做"的开关，否则直接拒绝。',
      hint: '有一个方向的操作会把数据直接截掉。',
      answer: '缩小必须显式加 --shrink；扩容直接写 +20G 即可',
      why: '这个额外的参数是官方故意设计的**防呆**：缩容会把超出新容量的数据**直接丢弃且不可恢复**，而且文件系统一旦大于块设备，挂载时就会报错甚至损坏。正确顺序与扩容完全相反：先在系统内缩小文件系统（ext 系需要卸载后操作，**XFS 根本不支持缩小**）→ 缩小分区 → 最后才缩镜像。顺序反了就是数据毁灭。',
      contrast: '扩容虽然安全得多，也容易被误解：改了镜像容量之后虚机里看可用空间**不会变**，因为分区表和文件系统还是原来的大小，必须在系统内再做扩分区与扩文件系统才算完成。另外**必须先关机再改容量**，对运行中的虚机动镜像官方明确警告会损坏数据；差分格式的镜像还可以加预分配参数减少后续写入的分配抖动。',
      cmdIds: ['vm-img-resize', 'vm-img-info', 'vm-img-snapshot'],
      lesson: 'kvm-provision-web02',
      tags: ['KVM', 'qemu-img', '扩容']
    },

    {
      id: 'card-kvm-qcow2-vs-raw',
      cat: 'kvm',
      kind: 'distinguish',
      level: 2,
      front: '两种镜像格式：一种文件大小只反映实际写了多少数据、还能挂差分盘，另一种就是磁盘的逐字节副本。',
      hint: '稀疏与直通的区别。',
      answer: 'qcow2（稀疏、支持内部快照与差分链、有格式开销）｜ raw（直通、可被常规工具直接处理、无内部快照）',
      why: '判据可以直接从镜像信息的输出里读出来：格式那一行给出类型，而"虚拟大小"（虚机看到的盘）与"磁盘占用"（宿主机实际占的空间）**差得越多说明越稀疏**。qcow2 靠稀疏与写时复制换来快照、压缩、差分链这些能力；raw 没有任何元数据开销、性能直接，但一个大容量的 raw 文件在写好数据之前就可能先占满宿主机的盘。',
      contrast: '选型还要看使用方式：raw"就是一块盘"，可以被常规工具直接读写，也最容易和别的虚拟化平台互通；qcow2 的**差分链**很强大，但链上任何一层损坏都会让整条链打不开，所以基础镜像要当只读资产保护起来。要长期归档，还可以用格式转换顺带压缩瘦身；要迁移到别的平台，转换格式往往比重新装系统快得多。',
      cmdIds: ['vm-img-info', 'vm-img-convert', 'vm-img-create'],
      lesson: 'kvm-image-inventory',
      tags: ['KVM', '镜像', 'qcow2']
    },

    {
      id: 'card-kvm-list-all-flag',
      cat: 'kvm',
      kind: 'distinguish',
      level: 1,
      front: '同事让你看一下这台宿主机上有哪些虚机，你敲了列表命令，输出是空的。',
      hint: '默认视图只显示某一种状态的虚机。',
      answer: 'virsh list --all',
      run: 'virsh list --all',
      why: '列表命令**默认只列运行中的**虚机，所以"列表为空"只说明当前没有虚机在跑，完全不能说明宿主机上没有虚机；加上 `--all` 才会把关机的、崩溃的一并列出来（状态列会显示已关闭等值）。判据就是状态列——排障时第一眼要看的也是它。',
      contrast: '状态不等于"业务可用"：运行中只代表进程活着，客户机内部可能还卡在启动、在做文件系统自检、或者网络根本没起来。要判断"业务到底通没通"得进控制台看，或者从外部探测端口。另外这个命令看的是**这一台宿主机**上的虚拟化层，集群层面的虚机清单不在这里。',
      cmdIds: ['vm-virsh-list', 'vm-virsh-dominfo', 'vm-virsh-autostart'],
      lesson: 'kvm-host-handover',
      tags: ['KVM', 'virsh', '状态']
    },

    {
      id: 'card-kvm-console-when-network-down',
      cat: 'kvm',
      kind: 'diagnose',
      level: 2,
      front: '虚机 ping 不通、远程登录也连不上，你要进去看看，可所有入口都依赖网络。',
      hint: '有一条通道不经过虚机的网络协议栈。',
      answer: 'virsh console <虚机名>',
      why: '串口控制台走的是虚拟化层提供的**虚拟串口**，完全不依赖虚机内部的网络配置——网卡配错、防火墙拦死、远程登录服务没起来，它都照样能进。判据：控制台能出现登录提示并登录成功，就说明**虚机本身运行正常、问题在网络层**；如果控制台一片空白，要先确认客户机内核有没有把输出重定向到串口。',
      contrast: '退出串口用的是转义序列而不是中断信号（后者会把信号送给虚机里的前台进程，可能打断正在跑的任务）。还有一个常被忽略的前提：进系统后要检查**网卡名与配置文件是否对得上**——克隆出来的虚机会带着原虚机的网卡硬件地址与命名规则，表现为"配置里写的是一个名字，系统里却叫另一个"，看着配置全对但网就是不通。',
      cmdIds: ['vm-virsh-console', 'vm-virsh-edit', 'vm-cloud-cloud-init'],
      tags: ['KVM', 'console', '排错']
    },

    {
      id: 'card-kvm-domblklist-disk-path',
      cat: 'kvm',
      kind: 'diagnose',
      level: 2,
      front: '虚机报磁盘空间不足，可你在默认的镜像目录里怎么也找不到它用的那个文件。',
      hint: '定义里写的路径，和实际用的文件可能不是一回事。',
      answer: 'virsh domblklist <虚机名>',
      why: '它直接列出这台虚机**每个磁盘的目标设备名与实际源文件路径**，是"这个虚机到底在用哪个镜像"最直接的答案——镜像完全可能在另一个存储池或独立数据盘上（比如挂在专门的数据目录里），而不是默认镜像目录。判据：拿着它给出的路径去查镜像信息，就能看清格式、虚拟大小与实际占用。',
      contrast: '想批量盘点整台宿主机上的存储，用存储池列表配合卷列表比一个个查虚机快。要改路径得编辑虚机定义并重新加载，**不要在虚机运行时手工挪动镜像文件**——路径对不上会让虚机直接打不开。另外如果磁盘挂的是差分盘，只有展开整条 backing chain 才能把依赖关系看全，只看顶层会漏掉它依赖的基础镜像。',
      cmdIds: ['vm-virsh-dominfo', 'vm-virsh-pool', 'vm-img-info'],
      lesson: 'kvm-image-inventory',
      tags: ['KVM', '磁盘', '存储池']
    },

    {
      id: 'card-kvm-qemu-img-resize-plus',
      cat: 'kvm',
      kind: 'syntax',
      level: 2,
      front: '把虚机镜像在现有容量基础上再扩大 20G：\n\n  qemu-img resize /data/vmstore/web.qcow2 ____\n\n横线处填什么？',
      hint: '要表达"在原来的基础上增加"，不是"设成这个大小"。',
      answer: '+20G',
      why: '`+20G` 是**相对扩容**：在当前容量上加 20G；不加加号写 `20G` 则是**绝对大小**，把盘设成 20G——如果原来就是 40G，前者得到 60G，后者是在做缩容（而且没有显式确认参数会被直接拒绝）。判据：命令回显里会给出调整结果以及扩容前后的容量对比。',
      contrast: '改之前**必须先关机**：对运行中的虚机改镜像容量官方明确警告会损坏数据。改完之后宿主机上看到的是文件变大，而虚机里看可用空间**还不会变**——分区表和文件系统仍是旧尺寸，必须在虚机内继续做扩分区与扩文件系统（XFS 只能扩不能缩），否则就是最常见的"扩了没用"。',
      cmdIds: ['vm-img-resize', 'vm-img-info', 'vm-virsh-start'],
      lesson: 'kvm-image-inventory',
      tags: ['KVM', 'qemu-img', '扩容']
    }

  );
})();
