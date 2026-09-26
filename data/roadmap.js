/* data/roadmap.js · 学习路线图（Phase 1 阶段 1/2/4/5 细节完整，其余为 Phase 2 占位） */
(function () {
  'use strict';

  window.CC_ROADMAP = [

    /* ==================== 阶段 1 ==================== */
    {
      id: 'stage-1',
      no: 1,
      title: 'Linux 基础与文件操作',
      icon: '🐧',
      duration: '1~2 周',
      prereq: null,
      status: 'ready',
      catIds: ['linux-basic'],
      goal: '能在命令行里自由地查看、创建、查找、打包、传输文件，不再依赖图形界面和 FTP 工具。这是后面所有技能的物理基础。',
      keys: [
        '`ls -lht` 快速找出最近改动的文件',
        '`cd`/`pwd`/`mkdir -p` 把目录结构理清楚',
        '`cp -a` 与 `mv` 的区别（-a 保留权限与时间戳）',
        '`find /path -name "*.log" -mtime +7 -exec rm -f {} \\;` 按条件批量处理',
        '`tar -czf` / `tar -xzf` / `tar --exclude` 打包与解包',
        '`rsync -avz --delete` 增量同步到云主机',
        '`scp -r` 与 `rsync` 的取舍（rsync 支持断点续传与增量）'
      ],
      project: '把本地一个项目目录打包，用 `rsync` 传到一台华为云 ECS 的 `/data` 目录并解压；再用 `find` 找出其中 7 天未修改的临时文件并清理。',
      check: [
        '能不看文档写出「查找 /var/log 下大于 100M 且 3 天前的文件」',
        '能解释 `cp` 与 `rsync` 的区别，以及 `rsync --delete` 的风险',
        '知道 `rm -rf` 为什么危险，以及 `rm -rf $DIR/` 变量为空时会发生什么'
      ]
    },

    /* ==================== 阶段 2 ==================== */
    /* ==================== 阶段 2 ==================== */
{
      id: 'stage-2',
      no: 2,
      title: 'Linux 系统管理与权限',
      icon: '👤',
      duration: '1~2 周',
      prereq: 'stage-1',
      status: 'ready',
      catIds: [
        'linux-user'
      ],
      goal: '能回答「这个操作我有没有权限」「这个服务为什么起不来」「这个定时任务为什么没跑」这三类日常问题，并理解 Linux 的权限模型。',
      keys: [
        '`id` / `groups` 看自己是谁、属于哪些组',
        '`ls -l` 读权限位，`chmod` / `chown` 改属主与权限',
        '`sudo -l` 看自己能提权做什么，以及 `visudo` 的写法',
        '`systemctl status` + `journalctl -u xxx -n 200` 排服务启动失败',
        '`systemctl enable/disable` 与 `daemon-reload` 的时机',
        '`crontab -e` 写定时任务（**必须用绝对路径**），`crontab -l` 核对',
        '`getent passwd/group` 查账号与组（比直接读 `/etc/passwd` 更通用）'
      ],
      project: '在一台云主机上创建一个 `deploy` 账号并只给它 `/data/app` 的读写权限；写一个自定义 systemd 服务并设置开机自启；再加一个每天凌晨 3 点清理 7 天前日志的 cron 任务 —— 三项做完后分别用 `id` / `systemctl status` / `crontab -l` 逐条验证。',
      check: [
        '能说清 `644` 与 `755` 分别意味着谁能做什么，以及目录上 `x` 位的特殊含义',
        '遇到「服务起不来」，能按 `systemctl status` → `journalctl -u` → 手工执行 ExecStart 命令的顺序定位',
        '能解释「cron 任务手工跑没问题、定时却不执行」的三种常见原因（PATH、工作目录、环境变量）',
        '知道 `Permission denied` 与 `Operation not permitted` 的区别（前者是权限位，后者常是 SELinux/CAP）'
      ]
    },

    /* ==================== 阶段 3 ==================== */
{
      id: 'stage-3',
      no: 3,
      title: '文本处理与 Shell 脚本',
      icon: '✂️',
      duration: '2~3 周',
      prereq: 'stage-2',
      status: 'ready',
      catIds: [
        'linux-text',
        'shell'
      ],
      goal: '能把几百兆的日志变成一句结论（谁在压站、错误率多少、哪个接口在报错），并把重复的判断写成能重复执行的脚本。',
      keys: [
        '`grep -rn --include="*.log"` 在指定文件类型里递归搜索，`-v` 反向排除噪音',
        "`awk '{print $1}' access.log | sort | uniq -c | sort -rn | head` 统计 Top N",
        "`sed -n '100,200p'` 取行区间，`sed -i` 原地替换",
        "`jq -r '.items[].metadata.name'` 从 JSON 取值（**别用 grep 抠字段**）",
        '`sort -u -T <大盘> -S 2G` 处理放不进内存的大文件',
        '脚本三件套：`set -euo pipefail`、`$()` 取命令输出、`case` 做分派',
        '重定向与错误分流：`>out 2>err`、`2>&1`，以及管道里的子 shell 陷阱'
      ],
      project: '写一个日志巡检脚本：接收「日期 + 日志路径」两个参数，输出该日的 Top 10 来源 IP、5xx 占比、以及最慢的 3 个接口；参数缺失时给出用法提示并以非 0 退出。',
      check: [
        '能解释 `sort | uniq -c` 里为什么 `sort` 不能省（`uniq` 只统计相邻重复行）',
        '能说出 `awk` 与 `sed` 各自适合哪一类处理，并各写出一个真实用例',
        '写的脚本在参数缺失、文件不存在时**不会静默跑出错误结果**',
        '知道「管道里的循环在子 shell 中执行」会导致变量拿不到（本站 shell 分类有专门一课）'
      ]
    },

    /* ==================== 阶段 4 ==================== */
{
      id: 'stage-4',
      no: 4,
      title: '网络与存储排障',
      icon: '🌐',
      duration: '2~3 周',
      prereq: 'stage-3',
      status: 'ready',
      catIds: [
        'linux-net',
        'linux-storage'
      ],
      goal: '能独立排查「服务连不上」与「磁盘满了 / 磁盘要坏了」这两类最高频的线上问题，并给出可执行的结论，而不是猜测。',
      keys: [
        '`ss -tulnp` 看端口监听，`lsof -i:80` 看谁占了端口',
        '`curl -I` / `curl -v` / `curl -w` 三件套定位 HTTP 问题',
        '`tcpdump -i any -nn port 80` 抓包验证流量到底有没有到',
        '`ip route get <目标>` 反查走哪条路，`traceroute` 判断断在第几跳',
        '`ssh -L` / `-R` / `-J` 端口转发与跳板机',
        '`df -h` / `du -sh` / `lsof +L1` 找出磁盘被谁占满（含「已删除但未释放」）',
        '`lsblk` / `findmnt` 搞清哪块盘挂在哪；LVM 在线扩容 `vgextend` → `lvextend` → `resize2fs`',
        '`smartctl` 读磁盘寿命，`mdadm` 看软 RAID 是否降级'
      ],
      project: '在一台云主机上完成两件事：① 用 `tcpdump` 抓包判断一次「外网访问不到 80 端口」到底是安全组、防火墙还是服务没起；② 给一块新挂的云盘做「分区 → 文件系统 → 挂载 → 写 fstab → 扩容」全流程，并用 `findmnt --verify` 确认开机不会挂不上。',
      check: [
        '能说出 `Connection refused` 与 `Connection timed out` 的排查方向有何不同',
        '能解释 `df` 显示磁盘满但 `du` 加起来不到的原因，并用 `lsof +L1` 找到它',
        '能独立完成一次 LVM 在线扩容，并说清 `+50G` 与 `50G` 的区别',
        '知道 SMART 的 `PASSED` 是滞后指标，该盯的是 `Reallocated_Sector_Ct` 与 `Pending_Sector`'
      ]
    },


    /* ==================== 阶段 3 ==================== */
    {
      id: 'stage-5',
      no: 5,
      title: '服务与数据',
      icon: '🗄️',
      duration: '3~4 周',
      prereq: 'stage-4',
      status: 'soon',
      catIds: ['middleware', 'db-cache'],
      goal: '掌握生产环境最常见的中间件与数据库运维命令：Nginx 配置与排错、MySQL 备份与慢查询分析、Redis 内存与大 key 排查。',
      keys: [
        '`nginx -t` 校验配置，`nginx -s reload` 平滑重载',
        '`mysqldump --single-transaction` 一致性备份',
        '`EXPLAIN` 与 `SHOW PROCESSLIST` 定位慢查询与锁等待',
        '`redis-cli --bigkeys` 找大 key，`INFO memory` 看内存碎片',
        '`redis-cli --scan` 替代危险的 `KEYS *`',
        '`etcdctl snapshot save` 备份（K8s 阶段会用到）'
      ],
      project: '用 Docker 起一套 Nginx + MySQL + Redis，配置反向代理与负载均衡，做一次数据库备份恢复演练，并用慢查询日志找出并优化一条 SQL。',
      check: [
        '能独立排查 Nginx 502/504 并说清各自原因',
        '能完成 MySQL 全量备份 + 恢复，并说明 `--single-transaction` 的作用',
        '知道为什么生产环境禁止用 `KEYS *`'
      ]
    },

    /* ==================== 阶段 4 ==================== */
    {
      id: 'stage-6',
      no: 6,
      title: '容器化 Docker',
      icon: '🐳',
      duration: '2~3 周',
      prereq: 'stage-5',
      status: 'ready',
      catIds: ['docker'],
      goal: '能把一个应用打包成镜像并跑起来，会写 Dockerfile、会用 Compose 编排多容器，能独立排掉"容器起不来"这类问题。',
      keys: [
        '`docker run -d -p -v -e --name --restart` 完整参数',
        '`docker exec -it <容器> sh` 进容器查问题',
        '`docker logs --tail 100 -f` 看容器日志',
        '`docker inspect --format` 取容器状态与退出码',
        '写 Dockerfile：`FROM`/`RUN`/`COPY`/`CMD`/`ENTRYPOINT` 与多阶段构建',
        '`docker build -t` 与 `docker tag` + `docker push` 到华为云 SWR',
        '`docker compose up -d` / `down` / `logs` / `config`',
        '`docker system df` 与 `prune` 清理磁盘'
      ],
      project: '把一个自己的应用（前端或 Java/Go 服务）写成 Dockerfile 构建成镜像，推到华为云 SWR，再用 `docker compose` 起「应用 + MySQL + Redis」三件套，实现宿主机重启后自动拉起。',
      check: [
        '能解释容器为什么必须有一个前台进程（PID 1），以及 `nginx -g "daemon off;"` 的意义',
        '能说出 volume、bind mount、tmpfs 三者的区别与适用场景',
        '遇到「容器反复重启」，能在 5 分钟内通过 `logs --previous` 与 `inspect` 定位原因',
        '知道容器内时区为什么默认不对，以及怎么修正',
        '能说明 `docker system prune -a` 的风险'
      ]
    },

    /* ==================== 阶段 5 ==================== */
    {
      id: 'stage-7',
      no: 7,
      title: 'Kubernetes 与云原生',
      icon: '☸️',
      duration: '4~6 周',
      prereq: 'stage-6',
      status: 'ready',
      catIds: ['kubernetes', 'helm'],
      goal: '能用 kubectl 独立完成一次部署、一次扩缩容、一次回滚，并且遇到 Pod 起不来、Service 不通能自己排掉。最终落到华为云 CCE 上跑起来。',
      keys: [
        '`kubectl get pods -o wide` / `get events --sort-by=.lastTimestamp`',
        '`kubectl describe pod` 看 Events，`kubectl logs --previous` 看崩溃日志',
        '`kubectl exec -it` 与 `kubectl debug`（distroless 镜像没 shell 时）',
        '`kubectl port-forward svc/mysql 3306:3306` 本地连集群内服务',
        '`kubectl apply -f` 部署，`kubectl rollout status` 盯发布',
        '`kubectl rollout undo --to-revision=N` 回滚',
        '`kubectl scale` 扩缩容，`kubectl set image` 换版本',
        '`kubectl get endpoints` 排 Service 不通（**关键一步**）',
        '`kubectl cordon` + `drain` 做节点维护',
        '`kubectl auth can-i --list` 排查 Forbidden'
      ],
      project: '在华为云 CCE 上部署一个双副本应用：写 Deployment + Service + Ingress，配好 readiness/liveness 探针与 resources 限制，滚动发布一个新版本再回滚，然后用 `cordon` + `drain` 完成一次节点维护演练。',
      check: [
        '能默写 Pod 排错三板斧（get → describe → logs）并说清每步在找什么',
        '能说出 Pending / ImagePullBackOff / CrashLoopBackOff / OOMKilled 各自的典型原因',
        'Service 不通时，知道第一件事是看 endpoints 是否为空',
        '能解释 `targetPort` 与 `port` 的区别',
        '理解 `apply` 与 `create` 的差异，以及为什么生产统一用声明式'
      ]
    },

    /* ==================== 阶段 6 ==================== */
    {
      id: 'stage-8',
      no: 8,
      title: 'IaC 与华为云平台',
      icon: '☁️',
      duration: '3~4 周',
      prereq: 'stage-7',
      status: 'soon',
      catIds: ['cloud-cli', 'iac', 'cicd', 'kvm'],
      goal: '从"手工点控制台"进阶到"用命令行与代码管云"：会用华为云 KooCLI 与 obsutil，会用 Terraform 声明式创建云资源，会搭一条最基本的 CI/CD 流水线。',
      keys: [
        '`hcloud configure init` 配置 AK/SK，`hcloud ECS ListServersDetails` 查实例',
        '`hcloud VPC ListSecurityGroups` 排查安全组导致的连不上',
        '`obsutil sync` 把构建产物同步到 OBS（前端发布标准流程）',
        '`terraform init` / `plan` / `apply` / `destroy` 管理云资源',
        '`terraform state list` / `import` 接管已有资源',
        '`ansible-playbook -i inventory site.yml --check` 批量配置',
        'Git 常用流程：`switch -c` / `rebase` / `cherry-pick` / `reflog` 救回误操作',
        '`docker buildx build --push` 多架构构建与推送'
      ],
      project: '用 Terraform 声明式创建一台华为云 ECS 与一个 OBS 桶，用 Ansible 完成该机器的初始化（用户、时区、Docker），再把一个前端项目用 `obsutil sync` 发布到 OBS 静态网站托管。',
      check: [
        '能说出 `hcloud` 报错时优先检查哪两个参数（region 与 project_id）',
        '能说明 `terraform plan` 在流程中的必要性',
        '知道 AK/SK 为什么绝不能提交到 Git，以及泄露后的应急步骤'
      ]
    },

    /* ==================== 阶段 7 ==================== */
    {
      id: 'stage-9',
      no: 9,
      title: '可观测、安全与高可用',
      icon: '📊',
      duration: '持续精进',
      prereq: 'stage-8',
      status: 'soon',
      catIds: ['monitor', 'security', 'perf'],
      goal: '能建立一套"出事之前就能发现"的监控告警体系，并掌握性能压测与安全加固的常用手段。这一阶段没有终点，是持续积累的过程。',
      keys: [
        '`top`/`vmstat`/`iostat`/`sar` 四件套定位 CPU、内存、IO 瓶颈',
        '`pidstat` / `perf top` / 火焰图定位热点函数',
        '`journalctl -p err --since "1 hour ago"` 快速看错误日志',
        'Prometheus + Grafana + Alertmanager 搭建告警',
        '`openssl s_client -connect host:443 -servername host` 排查证书问题',
        '`nmap` 自查暴露端口，`fail2ban` 防暴力破解',
        '`ab` / `wrk` / `sysbench` / `fio` 做压测',
        '`sysctl` 调优内核参数（`somaxconn`、`file-max`、`tcp_tw_reuse`）',
        '`ulimit -n` 解决"Too many open files"'
      ],
      project: '给前面的 CCE 应用接上监控：用 Prometheus 采集指标、Grafana 出图、配一条"错误率超 5% 告警"的规则；再用 `wrk` 压测找出瓶颈并优化，最后用 `openssl` 排查一次 HTTPS 证书链问题。',
      check: [
        '能按「CPU 高 / 内存涨 / 磁盘满 / 网络慢」四类现象快速给出排查命令',
        '能独立搭建一套最小可用的监控告警',
        '知道 `ulimit` 与 `sysctl` 的区别，以及各自的持久化方式'
      ]
    }

  ];

  /* 阶段项目的可交付证据与人工核验表。项目可在真机完成，模拟终端仅用于预演。 */
  var acceptance = {
    'stage-1': {
      artifact: '交接包、源/目标文件清单、同步与清理记录',
      verify: ['解包后的关键文件路径与源目录一致，并记录双方校验和。', '保留一次 rsync --dry-run 清单；正式同步后再对照目标文件数量。', '删除临时文件前保存 find 命中清单，抽查时间条件与目标路径。']
    },
    'stage-2': {
      artifact: '账号权限清单、服务状态、定时任务配置与一次运行日志',
      verify: ['id deploy 与 ls -ld /data/app 能证明账号和目录权限符合要求。', 'systemctl is-enabled 与 is-active 分别证明开机自启和当前运行。', 'crontab -l 与任务日志能证明调度配置及最近一次执行结果。']
    },
    'stage-3': {
      artifact: '巡检脚本、可重复使用的测试日志和一份示例报告',
      verify: ['固定测试日志下，Top IP、5xx 分母/分子、慢接口结果与手算一致。', '缺参数、坏日期、文件不可读时输出清晰错误并以非零退出。', '同一输入重复运行得到相同报告；报告标明日期与日志路径。']
    },
    'stage-4': {
      artifact: '网络抓包与监听证据、云盘挂载记录、fstab 验证结果',
      verify: ['对外不可达时同时保留 ss、抓包和安全组检查结果，能定位断点。', '记录 blkid UUID、findmnt 当前挂载和文件系统容量。', '重启前 findmnt --verify 通过；维护窗口重启后再核对挂载。']
    },
    'stage-5': {
      artifact: '服务拓扑配置、健康检查结果、备份恢复演练记录',
      verify: ['应用、数据库、缓存的健康状态与依赖端口均可独立检查。', '用隔离实例恢复一份备份，核对关键表行数和时间点。', '留存慢查询原执行计划、优化后计划与同负载下耗时对比。']
    },
    'stage-6': {
      artifact: 'Dockerfile、镜像摘要、Compose 配置与重启恢复记录',
      verify: ['镜像可从锁定的 Dockerfile 重建，记录仓库中的不可变 digest。', 'docker compose config 通过，三个服务均有可核对的健康状态。', '宿主机重启后服务自动恢复，数据卷中的测试数据仍存在。']
    },
    'stage-7': {
      artifact: '工作负载清单、发布/回滚记录、节点维护记录',
      verify: ['两副本均 Ready，探针与资源限制可从清单和 describe 核对。', '滚动发布与回滚各留一次 revision、镜像版本和可用副本数。', 'drain 前后保留 Pod 分布，确认业务持续有可用副本。']
    },
    'stage-8': {
      artifact: 'IaC 代码、plan 审核记录、配置运行结果、发布清单',
      verify: ['plan 的新增/修改/删除资源与预期一致，审核后才执行 apply。', 'Ansible 第二次执行无意外变更，并记录初始化后的主机状态。', 'OBS 对象清单与本地构建产物一致，仓库和日志均不含 AK/SK。']
    },
    'stage-9': {
      artifact: '仪表盘截图或导出、告警触发/恢复记录、压测对照、证书链核验',
      verify: ['用可控测试流量触发错误率告警，再确认恢复通知正常。', '相同并发与时长下保存优化前后的延迟分位数和错误率。', '证书链与域名、有效期均核对通过，并注明公钥信任来源。']
    }
  };
  window.CC_ROADMAP.forEach(function (stage) { stage.acceptance = acceptance[stage.id]; });
})();
