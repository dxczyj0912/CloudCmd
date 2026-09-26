/* data/cards-gaps.js · 补齐高频排障知识点 */
(function () {
  'use strict';
  window.CC_CARDS = window.CC_CARDS || [];
  window.CC_CARDS.push(
    {
      id: 'card-gap-systemctl-start-enable', cat: 'linux-user', kind: 'distinguish', level: 2,
      front: '部署完 nginx 后，服务现在已经在运行，但重启机器后没有自动起来。`start` 和 `enable` 哪个缺了？',
      answer: 'systemctl enable --now nginx',
      why: '`start` 只改变当前运行状态，`enable` 才会把服务挂到启动目标。`enable --now` 同时写入开机自启并立即启动，最后用 `systemctl is-enabled nginx` 与 `systemctl is-active nginx` 分别验证两个状态。',
      contrast: '如果只是临时排障，不要误用 `enable --now` 改变重启后的行为；只需要当前启动时用 `systemctl start nginx`，上线前再明确决定是否 enable。',
      run: 'systemctl status nginx',
      cmdIds: ['lu-systemctl', 'lu-systemctl-enable']
    },
    {
      id: 'card-gap-df-du-inode', cat: 'linux-storage', kind: 'diagnose', level: 2,
      front: '磁盘还有 30% 容量，却不断报 `No space left on device`；`du` 看起来也不大，下一步先查什么？',
      answer: 'df -i',
      why: '小文件过多会先耗尽 inode，容量尚有剩余也无法创建新文件。`df -i` 看 inode 使用率；若 inode 正常，再用 `lsof +L1` 排查已删除但仍被进程打开的文件。',
      contrast: '`df -h` 满而 inode 正常时，方向是容量占满；`du` 总和明显偏小时，优先查已删除但仍被打开的文件。',
      run: 'df -i',
      cmdIds: ['ls9-df', 'ls9-du']
    },
    {
      id: 'card-gap-k8s-endpoints', cat: 'kubernetes', kind: 'diagnose', level: 2,
      front: 'Service 有 ClusterIP，客户端却一直连接超时。排查时先看 Pod 日志还是先看 Service 后端？',
      answer: 'kubectl get endpoints web -n prod',
      why: 'Service 是否有可用后端由 endpoints 决定。为空通常是 selector 不匹配、Pod 没 Ready 或端口名不一致；先确认 endpoints，再进入 Pod 看日志，能快速区分路由问题和应用问题。',
      contrast: 'endpoints 有地址仍超时，再查 NetworkPolicy、Service port/targetPort、容器监听地址及应用日志；不要一开始就重启 Pod。',
      run: 'kubectl get endpoints web -n prod',
      cmdIds: ['k8s-get', 'k8s-troubleshoot-svc']
    },
    {
      id: 'card-gap-cert-chain', cat: 'security', kind: 'distinguish', level: 2,
      front: '浏览器提示证书不受信任，但证书的域名和有效期都正确。还缺哪一类验证？',
      answer: 'openssl verify -CAfile /etc/pki/tls/certs/ca-bundle.crt server.crt',
      why: '域名与时间只说明叶子证书本身没问题，客户端仍要能沿着 intermediate 回到受信任根。`openssl verify` 检查签发链；生产部署还要把中间证书按正确顺序拼进 fullchain。',
      contrast: '只把根证书发给客户端、却漏掉服务器应发送的 intermediate，会导致部分客户端报 unknown issuer；先检查服务端实际发送的链。',
      cmdIds: ['sec-cert-chain', 'sec-openssl-x509']
    },
    {
      id: 'card-gap-awk-safe-filter', cat: 'linux-text', kind: 'distinguish', level: 2,
      front: '脚本把 awk 程序拼接进字符串后再执行，输入里出现引号就可能改变程序结构。更稳的做法是什么？',
      answer: "awk '$9 >= 500 {print $7, $9}' /var/log/nginx/access.log",
      why: 'awk 程序应作为固定、白名单化的单引号脚本传入，外部阈值用 `-v limit="$LIMIT"` 传值并做数值校验。不要用 `eval` 拼接再执行；它会把数据当代码，既有注入风险也难以复现。',
      contrast: '需要动态字段或条件时只允许固定模板 + `-v` 参数；输入来自用户时先做数字/枚举校验，不能把整段输入直接拼进 awk 程序。',
      run: "awk '$9 >= 500 {print $7, $9}' /var/log/nginx/access.log",
      cmdIds: ['lt-awk', 'lt-awk-filter']
    },
    {
      id: 'card-gap-uniq-sort', cat: 'linux-basic', kind: 'distinguish', level: 2,
      front: '统计日志中每个来源出现了多少次，结果里相同的行明明分散在各处，却只统计到一部分。问题通常出在哪？',
      answer: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn",
      why: '`uniq` 只比较相邻行；先 `sort` 才能把同一个值聚到一起，再用 `uniq -c` 计数。最后一次 `sort -rn` 才是按次数从高到低排序。',
      contrast: '只想去掉相邻重复行可以直接用 `uniq`；想统计全量出现次数必须先排序，不能把 `uniq` 当成集合去重。',
      run: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn",
      cmdIds: ['lb-uniq', 'lt-sort-column'],
      tags: ['日志', '统计', '排序']
    },
    {
      id: 'card-gap-diff-patch', cat: 'linux-basic', kind: 'distinguish', level: 2,
      front: '上线前要确认配置文件到底改了哪些行，并把差异交给同事审核。应该看普通比较还是带上下文的差异？',
      answer: 'diff -u old.conf new.conf',
      why: '`-u` 输出 unified diff，包含变更行前后的上下文，`-` 表示旧文件、`+` 表示新文件，能直接用于代码审查和后续 `patch`。',
      contrast: '`cmp` 只回答两个文件是否逐字节相同，适合二进制或快速校验；需要知道改了什么时用 `diff -u`，不要只看 cmp 的退出码。',
      cmdIds: ['lb-diff', 'lb-cmp'],
      tags: ['配置', '审查', 'diff']
    },
    {
      id: 'card-gap-sha-trust', cat: 'linux-basic', kind: 'diagnose', level: 3,
      front: '下载的镜像文件大小正确，但你仍然不能确认它没有被替换。校验时最容易漏掉哪一步？',
      answer: 'sha256sum -c sha256list.txt',
      why: '摘要只能证明“当前文件对应某个摘要”，不能证明摘要来源可信。应从官方 HTTPS 或签名发布页取得清单，再用 `sha256sum -c` 校验；清单和文件来自同一不可信位置时没有安全价值。',
      contrast: '只想快速发现传输损坏可以计算单个 `sha256sum 文件`；要做发布验收还要核对清单来源，真正的发布防篡改应再验证数字签名。',
      cmdIds: ['lb-sha256sum'],
      tags: ['完整性', '发布', '校验']
    },
    {
      id: 'card-gap-xargs-null', cat: 'linux-basic', kind: 'distinguish', level: 3,
      front: '批量处理文件时，文件名里有空格或换行，脚本却把一个文件拆成了好几个参数。怎样把边界保留下来？',
      answer: 'find /data/tmp -print0 | xargs -0 -r rm -f',
      why: '`find -print0` 用 NUL 分隔路径，`xargs -0` 按同样的边界读取，文件名中的空格不会被拆开；`-r` 让空输入时不执行一次空命令。',
      contrast: '普通 `find ... | xargs` 只适合确认过文件名不含空白的场景；删除前应加 `-p` 或先把命令改成 `echo` 预览，避免批量误删。',
      cmdIds: ['lb-xargs'],
      tags: ['批处理', '文件名', '安全']
    },
    {
      id: 'card-gap-grep-pattern-file', cat: 'linux-text', kind: 'distinguish', level: 2,
      front: '黑名单从几十个关键词增长到几千个，继续把关键词拼到命令行里会遇到长度和转义问题。',
      answer: 'grep -F -f blacklist.txt access.log',
      why: '`-f` 从文件逐行读取模式，避免命令行过长；`-F` 把模式当固定字符串，不会把 `.`、`*`、`[` 等业务字符误解释成正则。',
      contrast: '确实需要正则时去掉 `-F` 并单独测试模式；模式文件不能有空行，否则空模式会匹配所有行。',
      cmdIds: ['lt-grep-file'],
      tags: ['grep', '黑名单', '日志']
    },
    {
      id: 'card-gap-useradd-service', cat: 'linux-user', kind: 'distinguish', level: 2,
      front: '给服务创建账号时，账号不应该能登录，也不需要普通用户的家目录。创建参数怎么选？',
      answer: 'useradd -r -s /sbin/nologin appuser',
      why: '`-r` 创建系统账号，`/sbin/nologin` 阻止交互登录；服务账号只给进程所需目录和权限，降低凭据被滥用后的影响。',
      contrast: '给运维人员建账号通常要 `-m -s /bin/bash` 并设置密码或 SSH 公钥；不要把服务账号和人工登录账号混用。',
      cmdIds: ['lu-useradd'],
      tags: ['账号', '最小权限', '服务']
    },
    {
      id: 'card-gap-chage-vs-passwd', cat: 'linux-user', kind: 'distinguish', level: 3,
      front: '合规要求“90 天必须改密、提前 7 天提醒”，但你只执行了修改密码的命令，策略仍没有生效。',
      answer: 'chage -M 90 -W 7 deploy',
      why: '`passwd` 管密码内容，`chage` 管密码最长寿命、提醒时间和账号过期日。用 `chage -l deploy` 检查结果中的 Maximum、Warning 字段。',
      contrast: '临时强制下一次登录改密可用 `chage -d 0`；不要把“改了一次密码”误认为“设置了密码生命周期”。',
      cmdIds: ['lu-chage', 'lu-passwd'],
      tags: ['密码策略', '合规', '账号']
    },
    {
      id: 'card-gap-visudo-safe', cat: 'linux-user', kind: 'diagnose', level: 2,
      front: '修改 sudo 授权后，所有人突然都不能提权；问题通常是配置写错而不是服务没重启。',
      answer: 'visudo -c',
      why: '`visudo` 会在保存时检查 sudoers 语法，`visudo -c` 可在交付前单独校验。子文件通常放在 `/etc/sudoers.d/`，权限应为 0440。',
      contrast: '不要直接用编辑器覆盖 `/etc/sudoers`；语法错误会让 sudo 整体拒绝加载，修复要依赖 root、单用户模式或云控制台。',
      cmdIds: ['lu-visudo'],
      tags: ['sudo', '权限', '安全']
    },
    {
      id: 'card-gap-ssh-key-agent', cat: 'linux-net', kind: 'distinguish', level: 2,
      front: 'SSH 私钥已经设置了口令，但同一台跳板机上的多个会话仍然每次都要求输入。',
      answer: 'ssh-agent + ssh-add ~/.ssh/id_ed25519',
      why: '`ssh-agent` 在会话中缓存已解锁的私钥，`ssh-add` 把私钥交给 agent；私钥文件仍保留口令保护，终端只需解锁一次。',
      contrast: '不要把私钥口令写进脚本或改成无口令私钥；批处理场景应使用短期、最小权限的专用密钥并控制 agent 转发。',
      cmdIds: ['ln-ssh-agent', 'ln-ssh-keygen'],
      tags: ['SSH', '密钥', '跳板机']
    },
    {
      id: 'card-gap-ssh-tunnel', cat: 'linux-net', kind: 'diagnose', level: 3,
      front: '数据库只绑定内网地址，跳板机能访问，但你的本地电脑不能直连。怎样只开放一条本地转发通道？',
      answer: 'ssh -N -L 13306:10.0.2.15:3306 deploy@bastion',
      why: '`-L 本地端口:目标地址:目标端口` 把本地连接通过 SSH 主机转到内网目标，`-N` 表示只转发不启动远程 shell；应用连 `127.0.0.1:13306` 即可。',
      contrast: '本地转发是访问内网服务；`-R` 是把远端端口反向暴露到本地，`-D` 是 SOCKS 代理，方向弄反会造成暴露面扩大。',
      cmdIds: ['ln-ssh-tunnel'],
      tags: ['SSH', '隧道', '内网']
    },
    {
      id: 'card-gap-lvm-chain', cat: 'linux-storage', kind: 'diagnose', level: 3,
      front: '云盘已经扩容，但挂载点大小没有变化。LVM 扩容时缺的是哪一层？',
      answer: 'PV → VG → LV → 文件系统',
      why: 'LVM 需要依次确认物理卷、卷组、逻辑卷和文件系统：`pvdisplay` 看 PV，`vgs` 看 VG，`lvs` 看 LV，最后用 `xfs_growfs` 或 `resize2fs` 扩文件系统。只扩云盘或 LV 都不会自动改变文件系统容量。',
      contrast: '非 LVM 分区直接扩分区后再扩文件系统；XFS 不能用 `resize2fs`，ext4 也不能用 `xfs_growfs`。',
      cmdIds: ['ls9-lvm-overview', 'ls9-vgcreate', 'ls9-xfs-growfs', 'ls9-resize2fs'],
      tags: ['LVM', '扩容', '文件系统']
    },
    {
      id: 'card-gap-fsck-unmounted', cat: 'linux-storage', kind: 'diagnose', level: 3,
      front: '文件系统出现错误，想在线直接执行修复命令。为什么这一步有风险？',
      answer: '先卸载，再 fsck -f /dev/设备',
      why: '`fsck` 会修改元数据；挂载状态下业务还在读写，修复过程可能与内核缓存冲突，造成更严重的损坏。先停业务、卸载或进救援环境，再用 `fsck -f` 检查并记录结果。',
      contrast: '只读诊断可以先看 `dmesg`、`findmnt` 和文件系统专用工具；根分区不能随便卸载，应从救援系统或云厂商维护模式修复。',
      cmdIds: ['ls9-fsck'],
      tags: ['文件系统', '修复', '磁盘']
    },
    {
      id: 'card-gap-mktemp', cat: 'shell', kind: 'diagnose', level: 2,
      front: '脚本需要临时文件，直接写 `/tmp/report.$$` 仍可能被其他用户抢先创建或替换。',
      answer: 'tmp=$(mktemp); trap \'rm -f "$tmp"\' EXIT',
      why: '`mktemp` 以原子方式创建不可预测的文件名，避免符号链接和竞争条件；配合 `trap ... EXIT` 在成功、失败和中断时都清理。',
      contrast: '固定文件名、只用 PID 或先 `test -e` 再创建都不是安全的排他创建；临时目录里保存敏感内容还要检查权限。',
      run: 'mktemp',
      cmdIds: ['sh-mktemp'],
      tags: ['Shell', '临时文件', '安全']
    },
    {
      id: 'card-gap-docker-pull-build', cat: 'docker', kind: 'distinguish', level: 2,
      front: '部署机器上执行了 `docker build`，却没有使用仓库里的最新基础镜像。构建前缺了哪一步？',
      answer: 'docker pull <基础镜像>:<固定标签> && docker build --pull ...',
      why: '`docker build` 默认可能复用本地缓存；`--pull` 强制检查基础镜像更新，先显式 `pull` 还能把下载失败与构建失败分开。生产构建应使用 digest 或不可变版本标签，保证可复现。',
      contrast: '只写 `latest` 并不能保证每次都是最新，也会让回滚失去确定性；要更新应用层而不变基础层时不要盲目禁用缓存。',
      cmdIds: ['dk-pull', 'dk-build'],
      tags: ['Docker', '构建', '可复现']
    },
    {
      id: 'card-gap-k8s-networkpolicy', cat: 'kubernetes', kind: 'diagnose', level: 3,
      front: 'Service 和 endpoints 都正常，但加固后 Pod 之间全部超时。最可能被遗漏的是哪层？',
      answer: 'kubectl get networkpolicy -A',
      why: 'NetworkPolicy 按 namespace、Pod selector、方向和端口控制流量；一条 default-deny 会让原本可达的连接全部变成超时。先列出策略，再核对 ingress/egress 是否放行 DNS、Service 和实际端口。',
      contrast: 'NetworkPolicy 为空时再查安全组、节点防火墙和应用监听；只看 Service 配置无法证明网络策略允许流量。',
      cmdIds: ['k8s-networkpolicy'],
      tags: ['K8s', '网络策略', '排错']
    },
    {
      id: 'card-gap-helm-dependency', cat: 'helm', kind: 'distinguish', level: 2,
      front: 'Chart.yaml 新增了依赖，但 `helm template` 仍提示找不到子 Chart。修改依赖声明后还要做什么？',
      answer: 'helm dependency update ./chart',
      why: '`helm dependency update` 根据 Chart.yaml 下载并解析最新依赖，更新 `Chart.lock`；只改 YAML 不会自动把 tgz 放进 charts/。已有 lock 且只想按锁定版本下载时用 `helm dependency build`。',
      contrast: '上线要可复现时提交 `Chart.lock` 并用 `build`；需要刷新依赖版本时才用 `update`，不要在生产部署脚本里无意更新。',
      cmdIds: ['hl-dependency-update'],
      tags: ['Helm', '依赖', '可复现']
    },
    {
      id: 'card-gap-mysql-user-grant', cat: 'db-cache', kind: 'distinguish', level: 2,
      front: '数据库账号能登录，但访问业务表时报权限不足。创建账号和授权是不是同一条语句？',
      answer: 'CREATE USER ...; GRANT ...; SHOW GRANTS ...;',
      why: '`CREATE USER` 只建立身份，`GRANT` 才授予库表权限，最后用 `SHOW GRANTS` 验证实际生效的授权。把登录成功当成权限完整会漏掉最小权限配置。',
      contrast: '不要直接给 `*.*` 的全局权限；按库、表、操作拆分，并区分应用账号、迁移账号和只读账号。',
      cmdIds: ['db-mysql-create-user', 'db-mysql-grant', 'db-mysql-show-grants'],
      tags: ['MySQL', '权限', '最小权限']
    },
    {
      id: 'card-gap-proc-live', cat: 'monitor', kind: 'distinguish', level: 2,
      front: '排查进程和内核状态时，`/proc` 下的文件大小显示为 0，但读取仍然能得到内容。',
      answer: '把 /proc 当作实时接口读取，不要按普通文件判断大小',
      why: '`/proc` 是内核导出的伪文件系统，目录项大小不代表数据长度；例如 `/proc/loadavg`、`/proc/meminfo` 每次读取都可能变化。排障时记录读取时间和命令输出。',
      contrast: '真正的日志或配置文件才适合用 `du`、备份和 checksum；不要对 `/proc` 做复制、压缩或“清理”操作。',
      cmdIds: ['mo-proc'],
      tags: ['Linux', 'proc', '监控']
    },
    {
      id: 'card-gap-tf-output-sensitive', cat: 'iac', kind: 'distinguish', level: 2,
      front: 'Terraform apply 后需要把实例地址交给流水线，但数据库密码不能出现在终端和 CI 日志里。输出块怎么设计？',
      answer: 'output "endpoint" { value = ... }；敏感值加 sensitive = true',
      why: '`output` 把资源结果暴露给 `terraform output` 和远端状态；密码、令牌等要设置 `sensitive = true`，避免普通输出和 CI 日志直接显示。敏感标记只隐藏终端展示，状态文件仍需加密和限权。',
      contrast: '不要把秘密写进普通 output 或提交到 tfvars；需要给下游程序读取时用受控的 `terraform output -json`，并保护状态后端。',
      cmdIds: ['iac-tf-output', 'iac-tf-output-block'],
      tags: ['Terraform', '状态', '秘密']
    },
    {
      id: 'card-gap-git-rebase-merge', cat: 'cicd', kind: 'distinguish', level: 2,
      front: '功能分支还没合并，想同步主干又不想制造一次无意义的合并提交。该选哪种历史整理方式？',
      answer: 'git fetch origin && git rebase origin/main',
      why: '`rebase` 会把自己的提交重新接到最新主干后面，历史线性；冲突解决后用 `git rebase --continue`，放弃用 `--abort`。',
      contrast: '已经被多人共享的分支不要随意 rebase；那会改写提交 ID。公共分支需要合并时用 `git merge`，个人分支更新远端用 `--force-with-lease` 而不是 `--force`。',
      cmdIds: ['ci-git-rebase', 'ci-git-merge'],
      tags: ['Git', '协作', '历史']
    },
    {
      id: 'card-gap-git-stash-untracked', cat: 'cicd', kind: 'diagnose', level: 2,
      front: '切分支前执行了 stash，回来却发现刚创建的配置文件不见了。',
      answer: 'git stash push -u -m "wip"',
      why: '普通 `git stash` 默认只收起已跟踪文件的修改，不包含新文件；`-u` 才把 untracked 文件一起放入 stash。用 `stash list` 确认编号，再选择 `apply`（保留）或 `pop`（恢复并删除）。',
      contrast: '被忽略的文件还要用 `-a`；不要把 stash 当远端备份，它只存在本地，长期工作应尽快提交到分支。',
      cmdIds: ['ci-git-stash'],
      tags: ['Git', 'stash', '未跟踪文件']
    },
    {
      id: 'card-gap-virsh-snapshot-backup', cat: 'kvm', kind: 'distinguish', level: 3,
      front: '升级虚机前打了快照，磁盘损坏后却发现快照也没了。这里把哪两个概念混淆了？',
      answer: '快照用于短期回滚，备份必须放到独立存储',
      why: 'virsh 快照通常和原磁盘位于同一存储池，记录的是某个时间点的回滚链；存储池损坏或误删时快照会一起丢。长期保护要用独立备份、复制或对象存储。',
      contrast: '数据库等有状态服务还要用 `--quiesce` 或应用级备份保证一致性；快照存在不等于备份验收通过。',
      cmdIds: ['vm-virsh-snapshot'],
      tags: ['KVM', '快照', '备份']
    },
    {
      id: 'card-gap-trivy-ci', cat: 'security', kind: 'diagnose', level: 2,
      front: '镜像扫描结果很多，但 CI 仍然每次通过，漏洞没有真正阻止发布。缺少哪个控制点？',
      answer: 'trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 镜像:标签',
      why: '`--exit-code 1` 把命中策略变成非 0 退出码，流水线才能失败；`--severity` 控制门槛，`--ignore-unfixed` 减少尚无修复版本的噪音。',
      contrast: '不要永久用 `.trivyignore` 静默漏洞；每条豁免都应有原因、负责人和复审日期，扫描数据库也要在离线环境定期更新。',
      cmdIds: ['sec-trivy'],
      tags: ['镜像', 'CVE', 'CI安全']
    },
    {
      id: 'card-gap-mtu-payload', cat: 'perf', kind: 'diagnose', level: 3,
      front: '小请求正常，大响应或 SSH 交互卡住；基础连通性测试也能通。排查路径 MTU 时数值应该怎么算？',
      answer: 'ping -M do -s 1472 -c 2 <目标>',
      why: '`-s` 是 ICMP 载荷，不是总包长；IPv4 还要加 20 字节 IP 头和 8 字节 ICMP 头，1472 对应 MTU 1500。`-M do` 禁止分片，逐步降低载荷即可收敛路径 MTU。',
      contrast: '不要在远程 SSH 会话里直接改网卡 MTU，可能立刻断线；先用控制台或安排可回滚的变更，并结合 tcpdump 排除 ICMP 被过滤的情况。',
      cmdIds: ['pf-ping-mtu'],
      tags: ['MTU', '网络', '性能']
    }
  );
})();
