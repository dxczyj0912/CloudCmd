/* 从真实问题回忆下一步。需要远端、账号或危险权限的题只给核验路径，不伪装成模拟执行。 */
(function () {
  'use strict';
  window.CC_CARDS = window.CC_CARDS || [];
  var rows = [
    // cat, id, level, front, answer, why, contrast, cmdIds, run（仅当本地模拟确实可执行）
    ['linux-basic','numbered-review',2,'同事给出的报错定位在配置文件第 42 行；复核时怎样保留原文并给每一行编号？','nl -ba /etc/nginx/nginx.conf','-ba 连空行也编号，行号能与报错位置对应；原文件不被修改。','cat 只能显示内容；编辑器里临时行号也不能替代交接时可复制的编号证据。','lb-nl'],
    ['linux-basic','remote-transfer',2,'要把备份安全送到另一台测试主机，且希望能交互核对远端目录。批量复制与交互传输怎样选？','scp /data/backup/www.tar.gz test@host:/tmp/；交互核目录用 sftp test@host','两者都走 SSH；先核对主机指纹、账号权限与目标路径，再在远端校验大小或哈希。','模拟器显示复制完成不能证明远端真有文件；不应把生产密钥或真实地址写进课程。','lb-scp lb-sftp'],
    ['linux-basic','download-evidence',2,'供应商给出一个 HTTPS 下载链接，文件名有意义；落盘后还需校验来源与完整性。','curl -O https://example.com/release.tar.gz','-O 用远端文件名落盘；下载成功只证明传输，仍需校验发布方签名或哈希。','curl -o 自定本地文件名；不要用没有校验的下载结果直接执行脚本。','lb-curl-o'],
    ['linux-basic','shell-observation',2,'每两秒观察一次容量变化，同时想回溯刚才敲过的命令；两件事分别怎么做？','watch -n 2 df -h /data；history','watch 重复执行只读命令便于看趋势；history 用于找本会话曾执行的命令。','watch 不保留审计日志，history 也可能缺少其他会话或被清理。','lb-watch lb-history'],
    ['linux-basic','navigation-shortcuts',1,'频繁在项目目录与原目录之间切换，并想给常用长列表起一个本会话的短名字。','cd -；alias ll="ls -lh"','cd - 返回 OLDPWD；alias 只影响当前 shell，适合交互提效。','不要把 alias 当成脚本的可移植依赖；脚本里写完整命令更清楚。','lb-alias lb-cd-dash'],

    ['linux-text','sed-surgical-change',2,'审配置时要删除过期行、在指定行附近插入注释，或把整行替换成新配置；如何避免误改原文件？','先用 sed 的 d、a/i、c 预览输出，确认后再编辑副本','d 删除匹配行，a/i 在后/前插入，c 替换整行；先预览匹配范围，尤其注意正则会命中多行。','直接 sed -i 后再看差异容易错删；需要保留原文件或版本库差异作为回滚证据。','lt-sed-delete lt-sed-insert lt-sed-change'],
    ['linux-text','awk-report',2,'日志要统计请求总数、错误数与错误率；还要在没有匹配行时输出 0，而非空白。','awk "BEGIN{n=0;e=0} {n++; if (\$9>=500) e++} END{printf \"%d/%d %.2f%%\\n\",e,n,n?100*e/n:0}" /var/log/nginx/access.log','BEGIN 初始化，逐行累加，END 汇总；分母为零时显式处理，错误率才有定义。','只 grep -c 500 会把响应体字节数或 URL 中的 500 误算成状态码。','lt-awk-begin-end lt-awk-sum lt-log-error-rate'],
    ['linux-text','tabular-merge',2,'两份按同一键排序的清单要按键合并；若只是逐行并排、最后为了人眼对齐该怎么区分？','按键合并用 join；逐行并排用 paste；展示对齐用 column -t','join 要求输入按连接键排序，否则可能漏行；paste 不检查键是否相同；column 只改变展示。','不能把 column 输出当成结构化数据再解析，空格宽度会随内容变化。','lt-paste lt-join lt-column'],
    ['linux-text','encoding-and-format',2,'导入老系统 CSV 后出现乱码，生成报告又要求数值对齐；先核对哪两个不同问题？','先用 iconv 明确源/目标编码；报告格式用 printf','编码转换必须知道原编码并检查失败行；printf 用明确格式控制小数位与列宽。','终端里看起来正常不等于文件编码正确；不要用空格拼接代替格式化。','lt-iconv lt-printf'],
    ['linux-text','pod-json',2,'想把所有 Pod 的名称与阶段给脚本消费，而不是从人类可读表格里切列。','kubectl get pods -A -o json | jq -r ".items[] | [.metadata.namespace,.metadata.name,.status.phase] | @tsv"','结构化 JSON 字段稳定于表格宽度；先核对 items 数量与命名空间，再处理空字段。','grep 表格中的 Running 会漏掉状态变化，也无法可靠区分命名空间。','lt-jq-k8s-pod'],

    ['linux-user','group-access',2,'新同事要加入运维组并获得某目录的组读权限，如何把账号所属组与文件属组分开处理？','groupadd ops；usermod -aG ops alice；chgrp ops /srv/app','-aG 保留账号原有附加组；chgrp 改文件所属组，二者需要分别用 id 与 stat 核对。','usermod -G 不带 -a 会覆盖已有附加组；组成员变化通常要重新登录才生效。','lu-groupadd lu-usermod lu-chgrp'],
    ['linux-user','delegated-group',2,'组管理员要临时维护组成员；只允许某个用户读目录，不能放宽整个组权限。','用 gpasswd 管组成员；用 setfacl 给指定用户授权，再 getfacl 核验','组成员和 ACL 是不同权限层；ACL 的 mask 会限制有效权限，需看 effective 字段。','chmod o+r 会对所有用户开放；只看 ls -l 的加号不能知道 ACL 具体内容。','lu-gpasswd lu-getfacl lu-setfacl'],
    ['linux-user','identity-and-boot',2,'服务以专用账号运行，却只在开机后慢。先确认身份，再看启动关键路径。','su -s /bin/sh serviceuser -c id；systemd-analyze blame','身份切换验证实际 UID/GID；启动耗时要结合 critical-chain 判断依赖链，blame 单独不能证明因果。','不要用 root 手工启动成功就推断服务账号也有权限。','lu-su lu-systemd-analyze'],
    ['linux-user','login-sessions',2,'安全审计要确认哪些账号很久未登录、谁现在仍有会话。','lastlog；loginctl list-sessions','lastlog 查看最近登录记录，loginctl 查看当前会话；分别核对账号与会话来源。','lastlog 的从未登录不等于账号从未被非交互任务使用。','lu-lastlog lu-loginctl'],

    ['linux-net','tls-and-firewall',3,'443 端口能连上却报证书名不匹配；同时要确认本机防火墙策略是否挡住流量。','openssl s_client -connect web.example.com:443 -servername web.example.com；再检查 ufw 或 nft 规则','SNI 要与访问域名一致，检查证书主题/链和验证错误；防火墙要核对输入链及生效规则。','TCP 通不等于 TLS 验证通过；临时开通端口不能替代持久规则审查。','ln-openssl-sclient ln-ufw ln-nft'],
    ['linux-net','ssh-first-contact',2,'首次连一台测试机并准备免密登录；如何验证主机身份而不关闭校验？','核对主机公钥指纹并写入 known_hosts，再用 ssh-copy-id 安装公钥并 ssh 验证','先通过可信渠道对比指纹；免密包含本地密钥、远端 authorized_keys 和权限三处验证。','StrictHostKeyChecking=no 会跳过最关键的首次身份校验，不是方便的默认方案。','ln-ssh ln-ssh-copy-id ln-ssh-nopass ln-known-hosts'],
    ['linux-net','ssh-alias-and-server',2,'维护多台跳板机时客户端地址和密钥参数重复；服务端又要求限制可登录用户。两端分别在哪里配置？','客户端 ~/.ssh/config 使用 Host 别名；服务端 sshd_config 配 AllowUsers 后做语法检查','客户端别名不改变服务端授权；服务端配置先 sshd -t 再重载，并保留现有会话验证新登录。','不要把客户端配置当成服务端安全策略，也不要在仅有的 SSH 会话里盲重启。','ln-ssh-config-alias ln-sshd-config ln-sftp'],

    ['linux-storage','capacity-before-format',3,'新盘准备分区与格式化。怎样证明选中了正确设备、内核已读取新分区表？','先核对 lsblk/设备序列号；隔离盘上用 parted 分区，partprobe 后再核对 lsblk','设备路径可能漂移，必须核对容量、序列号和挂载；partprobe 后出现预期分区才进入格式化。','不能因模拟器返回 0 就对生产盘执行 mkfs；文件系统创建会覆盖旧数据。','ls9-parted ls9-partprobe ls9-mkfs-ext4 ls9-mkfs-xfs'],
    ['linux-storage','swap-and-quota',3,'内存压力大时计划加交换区，另有团队占满共享盘。两种限制分别如何验证？','隔离文件/分区先 mkswap 再 swapon，并用 swapon --show 核对；用 quota/repquota 看配额','交换区要核对设备、权限及持久化配置；配额要核对用户/组的已用量与软硬限制。','加 swap 不会修复内存泄漏；df 有空余也可能因 quota 达限写不进去。','ls9-mkswap ls9-swapon ls9-quota'],
    ['linux-storage','nfs-export-audit',3,'共享目录客户端无法挂载；服务端说已经写过导出配置。下一步核对什么？','检查 /etc/exports 后执行 exportfs -v，再在隔离客户端验证','配置文件表示计划，exportfs -v 表示当前导出及客户端范围；还需核对防火墙和客户端权限。','不要为排障直接导出给 * 且 rw；这会扩大数据暴露面。','ls9-nfs-server'],
    ['linux-storage','interactive-disk-view',2,'服务器磁盘告警，目录层级很深；交互筛出大目录后还应怎样留下可复核证据？','ncdu /data；记录目标目录后用 du -sh 复核','交互工具便于缩小范围；最终以可复制的路径、大小和时间作为交接证据。','ncdu 的界面截图不能证明文件可安全删除；备份与打开文件需另查。','ls9-ncdu'],

    ['shell','robust-arguments',2,'脚本接受多个文件名与一个可选开关，空参数要明确报错，还要避免位置参数错位。','getopts 解析选项；shift 移走已处理参数；用函数与 local 限制临时变量','先验证参数个数和必填值，再循环处理剩余位置参数；local 避免函数内临时变量污染外层。','直接读 $1/$2 容易在可选参数顺序变化后处理错文件。','sh-getopts sh-shift sh-function'],
    ['shell','loop-control',2,'批量处理主机时某台不在白名单要跳过，遇到致命错误要结束；结果还要等并发子任务完成。','continue 跳过当前项，break 结束循环；记录 PID 并 wait','跳过与终止是不同控制流；wait 的退出码可确认后台任务是否失败。','只检查主脚本退出码可能漏掉后台子任务失败。','sh-break-continue sh-wait'],
    ['shell','safe-input',2,'脚本要生成多行配置，另外要保存一组路径并限定外部命令最长运行时间。','here-document 写多行；数组保存路径；timeout 限制命令时长','引用 here-document 分隔符可抑制变量展开；数组用 "${arr[@]}" 保留含空格的单个路径。','未引用的 $arr 或命令替换会拆词；timeout 退出码也要区分业务错误。','sh-heredoc sh-array sh-timeout'],
    ['shell','session-preservation',2,'长时间维护任务不能因 SSH 断线而消失，还要允许重连后查看进度。','在 tmux 或 screen 会话中运行，断线后重新 attach','会话保持解决终端断开，不代表任务自动重试或记录完整日志；保留任务退出码与输出。','nohup 适合无交互后台任务，但没有会话窗口可继续操作。','sh-screen-tmux'],

    ['docker','image-promotion',2,'同一镜像要给测试仓库一个版本标签并推送；团队还要确认构建目标架构。','docker buildx build --platform linux/amd64 ...；docker tag 源镜像 目标标签；docker push 目标标签','构建输出架构、标签与仓库摘要应在推送后核对；tag 只是本地引用，push 才上传。','不要把同名 latest 当成可追溯版本；只看 push 退出码不足以核对远端摘要。','dk-buildx dk-tag dk-push'],
    ['docker','airgap-image',2,'内网不能访问镜像仓库，要把可审计镜像交付给另一台机器。','docker save -o app.tar image:tag；目标机 docker load -i app.tar','传输前后核对文件哈希，load 后核对镜像 ID/摘要；save/load 保留镜像层与标签。','docker export/import 是容器文件系统快照，会丢失镜像构建元数据。','dk-save dk-history'],
    ['docker','container-drift',2,'容器已停止，想再次启动同一容器；担心有人在容器里临时改过配置。','docker start 容器名；docker diff 容器名；必要时 docker cp 取出文件核对','start 复用现有容器及其可写层，diff 标出增删改，cp 用于取证；变更仍应回写 Dockerfile。','docker run 会新建容器；把手改后的容器当标准镜像会失去可复现性。','dk-start dk-diff dk-cp dk-dockerfile'],
    ['docker','timezone-diagnosis',2,'容器日志比宿主机慢八小时，怎样区分镜像时区、环境变量和应用自己的时区？','依次核对 date、TZ、/etc/localtime 与应用日志时区设置','容器与应用可能各自使用不同配置；以同一时间点的 UTC 与本地显示对照定位。','只改宿主机时间会影响全机服务，且未必改变容器或 JVM 时区。','dk-troubleshoot-timezone'],

    ['kubernetes','workload-choice',2,'每个节点都要有日志采集器；数据库迁移只跑到完成；每天凌晨再跑一次清理。','节点常驻用 DaemonSet，一次性用 Job，定时用 CronJob','核对期望节点数、Job 的 completions/failed、CronJob 的 schedule/timeZone 与最近一次执行。','Deployment 不保证每节点一个；定时任务不能靠常驻 Pod 里的 sleep 循环代替。','k8s-daemonset k8s-job k8s-cronjob'],
    ['kubernetes','image-pull-triage',2,'Pod 一直拉不到镜像；先分清节点版本/运行时问题、仓库认证还是镜像名拼错。','kubectl version；describe Pod 看 Events；在目标节点用 crictl ps/logs 核对运行时','Events 的具体原因可区分 401、not found、超时；版本和节点运行时用于判断兼容性。','Pod 状态名 ImagePullBackOff 只是结果，不能直接断定网络故障。','k8s-version k8s-crictl k8s-troubleshoot-imagepull'],
    ['kubernetes','exposure-and-config',2,'业务需要外部 HTTP 入口与一个可版本管理的非敏感配置；怎么分开建并验收？','用 Ingress 路由 HTTP；用 ConfigMap 存非敏感配置；分别 get/describe 核对','Ingress 还需 controller 与地址生效；ConfigMap 更新后还要确认工作负载是否重新读取。','密码不应放 ConfigMap；Ingress 对非 HTTP 协议并非通用入口。','k8s-ingress k8s-create-configmap'],

    ['helm','chart-source',2,'要审查第三方 Chart 再安装；内部仓库还需要发布自己的包。','helm pull 下载并检查 Chart；helm create 建骨架；打包后 helm push 到 OCI 仓库','下载后的模板和 values 可审计；push 后核对仓库中版本及摘要，骨架需删改示例默认值。','直接安装远端 latest 会降低可追溯性；helm create 的示例资源不能原样上生产。','hl-pull hl-push hl-create'],
    ['helm','chart-reuse',2,'多个模板反复写标签和资源名，稍有变化就互相不一致。','在 _helpers.tpl 定义命名模板，用 include 引用并渲染核对','公共 helper 统一名称与标签；helm template 应能看到每个资源的相同选择器。','只做字符串替换可能造成 selector 与 Pod labels 不匹配。','hl-helpers'],

    ['db-cache','backup-restore',3,'数据库备份审计不能只看生成文件；并行导出与单库逻辑备份怎样分别验证可恢复？','MySQL 用 mydumper/myloader；PostgreSQL 用 pg_dump/pg_restore；MongoDB 用 mongodump/mongorestore','在隔离实例恢复，核对对象数、行数或文档数及应用只读查询；记录版本和导出选项。','备份文件存在、命令退出 0 都不足以证明恢复成功；不要在生产实例做覆盖式演练。','db-mysql-mydumper db-pg-dump db-mongo-dump'],
    ['db-cache','rocketmq-lag',3,'RocketMQ 消费延迟升高，要分清 broker 集群问题、Topic 积压和具体消费组落后。','先查 mqadmin clusterList、topicStatus，再查 consumerProgress','集群与 Topic 状态是范围，消费组的 diff/offset 才能定位积压归属；需结合消费速度趋势。','只看消息总量不能判断是哪一个消费组落后。','db-rocket-cluster db-rocket-topic db-rocket-consumer-progress'],
    ['db-cache','slow-query-summary',2,'慢查询日志很长，想先按总耗时和次数找最值得优化的 SQL 模式。','mysqldumpslow -s t -t 10 慢日志路径','排序后的模板聚合可定位高代价查询；拿到样例后仍需 EXPLAIN 和索引/数据量验证。','单看最慢的一条可能是偶发；不要只凭聚合结果直接加索引。','db-mysqldumpslow'],
    ['middleware','etcd-change-watch',3,'配置键被别的组件改动，间歇性故障无法靠一次 get 捕获。','etcdctl watch --prefix /app/config/','watch 能观察后续事件与 revision；保留发生时间和键名，必要时配合历史审计。','一次 get 只能给当前值；watch 断线后不能假设期间没有变化。','mw-etcd-watch'],

    ['monitor','resource-hotspot',2,'机器 CPU 看起来忙，磁盘延迟也高；怎样分别定位进程与真正发 I/O 的任务？','先用 htop 看进程/线程，再用 iotop -o 看正在发 I/O 的进程','htop 中 CPU%、load 与内存是不同信号；iotop -o 只显示活跃 I/O，需采样多个时间点。','单看系统总体 iowait 无法给具体进程定责。','mo-htop mo-iotop'],
    ['monitor','log-and-agent',2,'多个日志同时滚动，又怀疑监控项从代理端拿不到值。','用 lnav/multitail 对齐时间线；zabbix_agentd -t key 测试单个监控项','先核对相同时间窗与时区；-t 的返回值和错误能区分 key 不支持、权限与采集异常。','监控平台图表缺点不一定是主机无数据，也可能是代理配置或传输问题。','mo-log-multitail mo-zabbix-agentd'],
    ['monitor','jvm-memory-map',3,'Java 进程内存高，但堆指标正常；要分清 JVM 标志和进程映射占用。','jinfo -flags PID；pmap -x PID','JVM 参数确认堆上限与 GC 设置，pmap 看地址空间和 RSS；容器限制还需另查。','进程 RSS 大不能直接判为 Java 堆泄漏。','mo-jvm-jinfo mo-pmap'],

    ['cloud-cli','cloud-readonly-inventory',2,'部署前要确认可用区规格、网络与基础镜像匹配，却不能先创建资源试错。','只读列出 ECS 可用区/规格、VPC/子网和 IMS 镜像','核对 region/project、配额、架构、可用区以及镜像 ID 的真实返回值；在测试账号复核。','CLI 返回空列表不等于资源不存在，也可能是区域或权限选错。','hw-ecs-az-flavor hw-vpc-list hw-ims-list-images'],
    ['cloud-cli','cloud-init-credential',3,'新云主机要自动初始化，但交接材料不能包含明文长期密钥。','先用 obsutil help 核对语法；cloud-init 用户数据只放非敏感初始化，凭证走最小权限临时身份','在测试主机查 cloud-init 状态和日志，确认幂等性；AK/SK 需要最小权限、轮换和泄露处置。','cloud-init 脚本成功打印不等于服务可用；把 AK/SK 写进镜像或用户数据会长期暴露。','hw-obsutil-help hw-flow-cloud-init hw-cross-aksk-best-practice'],

    ['iac','terraform-inputs',2,'两个环境只差实例数量与标签，想避免复制整份配置。','用 variable/tfvars 表达输入，locals 计算内部值，for_each 维护有稳定键的资源','先 terraform validate/plan 核对地址与差异；for_each 的键变化会影响资源地址。','count 索引前插会让后续地址整体漂移；敏感变量也不能直接提交到 tfvars。','iac-tf-variable iac-tf-locals iac-tf-count-foreach'],
    ['iac','terraform-debug',2,'plan 报表达式错误，普通错误行看不清值；需要临时诊断并避免日志泄露凭证。','terraform console 验表达式；短时开启 TF_LOG/TF_LOG_PATH 收集诊断','console 读取当前配置上下文，日志可含请求与敏感值；收集后关闭并限制文件权限。','不要将调试日志提交仓库，也不要用 apply 来试表达式。','iac-tf-console iac-tf-log'],
    ['iac','ansible-module-choice',2,'重复部署配置：文件内容应一致、目录存在、某行参数修改，服务随配置重启。','copy/template 管内容，file 管属性，lineinfile 改单行，service/systemd 管服务','先 --check --diff 观察目标变更，再执行并二次运行确认 changed=0。','shell 里连续 cp/sed/systemctl 不易保持幂等，也更难审查差异。','iac-ans-copy iac-ans-file iac-ans-template iac-ans-lineinfile iac-ans-service'],
    ['iac','ansible-platform',2,'同一剧本要为不同发行版装包并创建受限账号；提升权限的范围需明确。','用 when/loop 选择 yum 或 apt，user/group 管账号，become 限定需提权的任务','按主机事实选择包管理器；--check 与目标主机 id/包列表核对结果。','全局无条件 become 容易扩大权限；把用户创建写成裸 shell 也可能重复失败。','iac-ans-user-group iac-ans-yum-apt iac-ans-become iac-ans-when-loop'],
    ['iac','ansible-reuse',2,'团队希望复用一套部署步骤，接手者还要知道角色依赖和模块参数。','ansible-galaxy 管角色来源；ansible-doc 查模块契约；roles 组织任务和默认变量','锁定角色版本，审查下载来源；模块文档可核对参数和返回字段，角色默认值不能藏关键凭证。','复制一整套任务到每个项目会导致修复分叉。','iac-ans-galaxy iac-ans-doc iac-ans-roles'],

    ['cicd','git-isolated-fix',2,'线上热修要从指定提交挑一个改动；同时排查是哪次提交引入回归，不能污染当前工作区。','cherry-pick 选定提交，bisect 定位回归，worktree 建隔离目录','cherry-pick 后审实际 diff 与测试；bisect 标记 good/bad 要用可复现测试；worktree 共享仓库历史。','直接在主工作区反复 reset 容易丢改动，也会混淆定位证据。','ci-git-cherry-pick ci-git-bisect ci-git-worktree'],
    ['cicd','git-subproject',2,'主仓库引用另一个仓库的固定版本；CI 拉取后目录却是空的。','核对子模块 URL 与固定提交，再用 git submodule update --init --recursive','子模块记录的是提交指针；CI 必须显式初始化，且需要读取子仓库的凭证。','只提交子模块目录的文件改动并不会自动更新主仓库记录的指针。','ci-git-submodule'],
    ['cicd','pipeline-order-and-output',2,'构建后测试与打包可并行，但发布必须拿到打包产物；怎样表达依赖并保留可下载结果？','GitLab CI 用 needs 建 DAG；Jenkins 用 archiveArtifacts 归档产物','needs 指向明确作业并核对 artifacts 是否传递；归档需要路径匹配与保留期。','仅按 stages 顺序可能无谓串行；控制台日志不是可靠的制品仓库。','ci-gitlab-needs ci-jenkins-archive'],
    ['cicd','pipeline-guardrails',2,'同一流水线只在合并请求和主分支运行不同作业，密钥不能写进仓库。','用 rules 定义触发条件，CI 变量设置保护/掩码与环境范围','先用 CI Lint 和测试分支核对规则匹配，再确认受保护变量只在受信分支暴露。','only 与 rules 混搭容易产生意外流水线；mask 不等于最小权限。','ci-gitlab-variables ci-gitlab-rules'],

    ['kvm','image-customization',3,'批量交付测试虚机，基础镜像要预装包和初始化账号；如何保证模板可复用？','离线副本上用 virt-customize 修改，再准备 cloud-init user-data/meta-data','离线修改后启动隔离虚机核对包、账号和启动日志；user-data 中不应含长期密钥。','不要直接改仍被虚机使用的 qcow2；只看镜像文件存在不代表能启动。','vm-img-virt-customize vm-cloud-user-data vm-cloud-image-flow'],

    ['security','certificate-chain',3,'内网服务要换证书；先生成私钥和请求，再确认服务端实际发送了正确证书链。','隔离保存私钥后生成 CSR/自签测试证书，再用 openssl s_client 核对链和主机名','私钥权限、SAN、有效期及签发链要一起核对；自签证书只适用于明确配置了信任根的测试环境。','生成成功不等于客户端信任；不要把私钥直接写进镜像或仓库。','sec-openssl-genrsa sec-openssl-req'],
    ['security','policy-baseline',3,'主机访问被拒却文件权限正常；集群节点还需要基线体检。','先查 aa-status/getsebool 的生效策略；隔离集群运行 kube-bench','强制访问控制可能独立于 Unix 权限；基线报告要关联具体发行版与 Kubernetes 版本核查。','直接关闭安全模块只会掩盖原因；基线告警也不能不复核就批量改生产配置。','sec-aa-status sec-getsebool sec-kube-bench'],
    ['security','sandbox-root',3,'老工具必须在受限目录树内运行，团队把它称作隔离环境。实际隔离还缺什么？','chroot 只能改进程可见根目录，仍要限制用户、挂载、能力与系统调用','用最小权限身份、只读挂载和必要的 namespace/seccomp 边界核验可访问范围。','chroot 不是安全容器；有足够权限的进程可突破单纯的目录限制。','sec-chroot']
  ];
  var runnable = {
    'numbered-review': 'nl -ba /etc/nginx/nginx.conf',
    'download-evidence': 'curl -O https://example.com/release.tar.gz',
    'shell-observation': 'watch -n 2 "ss -s"',
    'navigation-shortcuts': 'alias ll="ls -alh"',
    'sed-surgical-change': 'sed "1i # 本文件由运维脚本自动维护" /etc/nginx/nginx.conf | head -3',
    'tabular-merge': 'join -t, /opt/app/data/ips.csv /opt/app/data/hostnames.csv',
    'encoding-and-format': 'printf "%-12s %5s\\n" app-01 82',
    'identity-and-boot': 'systemd-analyze blame',
    'login-sessions': 'lastlog',
    'tls-and-firewall': 'openssl s_client -connect web.example.com:443 -servername web.example.com -brief </dev/null',
    'interactive-disk-view': 'ncdu /data',
    'safe-input': 'timeout 5 sleep 1',
    'workload-choice': 'kubectl get jobs -n my-app',
    'image-pull-triage': 'kubectl version',
    'exposure-and-config': 'kubectl get cm app-config -n my-app -o yaml',
    'chart-source': 'helm create my-app',
    'chart-reuse': 'helm template myapp myorg/web -n my-app | head -8',
    'resource-hotspot': 'htop',
    'log-and-agent': 'zabbix_agentd -t system.cpu.util',
    'jvm-memory-map': 'jinfo -flags 18442',
    'ansible-module-choice': 'ansible-doc -s copy',
    'ansible-reuse': 'ansible-doc -s copy',
    'policy-baseline': 'aa-status'
  };
  var lessons = { 'numbered-review': 'lt-numbered-config-review', 'tabular-merge': 'lt-join-host-roster', 'chart-source': 'hl-chart-scaffold-check' };
  rows.forEach(function (r) {
    var ids = r[7].split(' ');
    var card = { id: 'card-path-' + r[1], cat: r[0], kind: 'distinguish', level: r[2],
      front: r[3], answer: r[4], why: r[5], contrast: r[6], cmdIds: ids,
      tags: ['真实场景', '验收判据'] };
    if (runnable[r[1]]) card.run = runnable[r[1]];
    if (lessons[r[1]]) card.lesson = lessons[r[1]];
    window.CC_CARDS.push(card);
  });
})();
