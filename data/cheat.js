/* data/cheat.js · 常见故障速查（Phase 1：Linux / Docker / Kubernetes 三部分） */
(function () {
  'use strict';

  window.CC_CHEAT = [

    /* ==================== Linux 系统 ==================== */
    {
      id: 'cheat-cpu', group: 'Linux 系统', sym: '🔥', level: 2,
        cmdIds: ['mo-top', 'mo-ps', 'mo-pidstat'],
      title: 'CPU 使用率飙高',
      chain: [
        'top -c',
        'ps -eo pid,ppid,pcpu,pmem,cmd --sort=-pcpu | head -15',
        'pidstat -u 1 5',
        'top -H -p <PID>',
        'perf top -p <PID>'
      ],
      note: '先用 `top` 按 `P` 排序确认是哪个进程，再看是用户态（%us）还是内核态（%sy）高。Java 应用用 `top -H -p` 找到线程 ID 后转十六进制，再去 `jstack` 里对。'
    },
    {
      id: 'cheat-mem', group: 'Linux 系统', sym: '🧠', level: 2,
        cmdIds: ['mo-free', 'lb-cat', 'mo-ps', 'mo-dmesg', 'mo-pmap'],
      title: '内存持续上涨 / 疑似泄漏',
      chain: [
        'free -h',
        'cat /proc/meminfo | head -5',
        'ps -eo pid,pmem,rss,cmd --sort=-rss | head -15',
        'dmesg -T | grep -i -E "oom|killed process"',
        'pmap -x <PID> | tail -5'
      ],
      note: '`free` 里的 `available` 才是真正可用内存，`buff/cache` 高不是问题。若 `dmesg` 里有 OOM 记录，说明进程是被内核杀掉的（对应 K8s 里的 OOMKilled）。'
    },
    {
      id: 'cheat-disk-full', group: 'Linux 系统', sym: '💾', level: 2,
        cmdIds: ['ls9-df', 'ls9-du', 'mo-lsof', 'lb-find'],
      title: '磁盘满（df 显示 100%）',
      chain: [
        'df -h',
        'df -i',
        'du -sh /* 2>/dev/null | sort -rh | head -10',
        'du -sh /var/* 2>/dev/null | sort -rh | head -10',
        'lsof +L1 2>/dev/null | head -20',
        'find / -xdev -type f -size +1G -exec ls -lh {} \\; 2>/dev/null'
      ],
      note: '**关键分叉**：先 `df -i` 看是不是 inode 用满（小文件太多，`du` 看不出来）。如果 `df` 说满了但 `du` 加起来不到，就是进程删了文件但句柄没释放，用 `lsof +L1` 找出来重启对应进程。'
    },
    {
      id: 'cheat-load', group: 'Linux 系统', sym: '📈', level: 3,
        cmdIds: ['lu-uptime', 'mo-vmstat', 'mo-iostat', 'mo-ps', 'mo-dmesg'],
      title: '负载高但 CPU 不高',
      chain: [
        'uptime',
        'vmstat 1 5',
        'iostat -x 1 5',
        'ps -eo state,pid,cmd | grep -E "^D"',
        'dmesg -T | tail -30'
      ],
      note: '`vmstat` 里 `b` 列（阻塞进程数）大、`wa`（IO 等待）高，说明卡在磁盘 IO 或 NFS。`D` 状态进程无法被 kill，要解决底层 IO 问题。'
    },
    {
      id: 'cheat-too-many-files', group: 'Linux 系统', sym: '📂', level: 3,
        cmdIds: ['pf-ulimit-n', 'lb-cat', 'mo-lsof', 'lb-ls'],
      title: 'Too many open files',
      chain: [
        'ulimit -n',
        'cat /proc/<PID>/limits | grep "open files"',
        'lsof -p <PID> | wc -l',
        'ls /proc/<PID>/fd | wc -l'
      ],
      note: '`ulimit -n` 只影响当前 shell 及其子进程；systemd 服务要在 unit 里写 `LimitNOFILE=` 并 `daemon-reload`。改完必须重启进程才生效。'
    },
    {
      id: 'cheat-service-fail', group: 'Linux 系统', sym: '⚙️', level: 1,
        cmdIds: ['lu-systemctl', 'lu-journalctl', 'lu-systemctl-daemon-reload'],
      title: '服务起不来',
      chain: [
        'systemctl status <服务名>',
        'journalctl -u <服务名> -n 200 --no-pager',
        'journalctl -u <服务名> -p err --since "30 min ago"',
        'systemctl cat <服务名>',
        'systemctl daemon-reload && systemctl restart <服务名>'
      ],
      note: '`status` 只给结论，`journalctl -u` 才给原因。改过 unit 文件却没 `daemon-reload` 是极常见的"改了没生效"。'
    },
    {
      id: 'cheat-port-blocked', group: 'Linux 系统', sym: '🚪', level: 2,
        cmdIds: ['ln-ss', 'ln-curl', 'ln-firewall-cmd', 'ln-tcpdump'],
      title: '端口不通（本机通、外网不通）',
      chain: [
        'ss -tulnp | grep <端口>',
        'curl -v telnet://127.0.0.1:<端口>',
        'firewall-cmd --list-all   # 或 ufw status / iptables -L -n',
        'tcpdump -i any -nn port <端口>',
        '# 云主机还要查：控制台安全组入方向规则、VPC 路由、弹性公网 IP 是否绑定'
      ],
      note: '**分层判断**：本机 `ss` 没监听 → 服务问题；本机通、外网不通 → 防火墙或云安全组；`tcpdump` 看不到包 → 请求根本没到这台机器（安全组/网络层拦截）。'
    },
    {
      id: 'cheat-ssh-fail', group: 'Linux 系统', sym: '🔑', level: 2,
        cmdIds: ['ln-ping', 'ln-nc', 'ln-ssh'],
      title: 'SSH 连不上云主机',
      chain: [
        'ping <公网IP>                    # 通不通说明网络层',
        'nc -zv <公网IP> 22               # 测 22 端口',
        'ssh -vvv root@<公网IP>           # 看卡在哪一步',
        'ssh -i ~/.ssh/id_rsa -p 22 root@<公网IP>',
        '# 云上依次排查：安全组 22 放行、EIP 是否绑定、VPC 路由、系统防火墙、sshd 是否在跑'
      ],
      note: '`Connection timed out` 大多是安全组或网络层；`Connection refused` 是 sshd 没监听或被防火墙 reject；`Permission denied` 才是密钥/密码问题。'
    },

    /* ==================== Docker 容器 ==================== */
    {
      id: 'cheat-docker-restart', group: 'Docker 容器', sym: '🐳', level: 2,
        cmdIds: ['dk-ps', 'dk-logs', 'dk-inspect', 'dk-run'],
      title: '容器反复重启 / 启动即退出',
      chain: [
        'docker ps -a',
        'docker logs --tail 100 <容器名>',
        'docker inspect --format "{{.State.ExitCode}} {{.State.Error}}" <容器名>',
        'docker inspect --format "{{.State.OOMKilled}}" <容器名>',
        'docker run -it --entrypoint sh <镜像>   # 绕开 CMD 手工试'
      ],
      note: '**最常见原因是容器里没有前台进程**（PID 1 退出容器就结束）。退出码含义：0 正常退出、1 应用报错、137 被 SIGKILL/OOM、143 收到 SIGTERM。'
    },
    {
      id: 'cheat-docker-image', group: 'Docker 容器', sym: '📦', level: 2,
        cmdIds: ['dk-pull', 'dk-info', 'lb-cat', 'dk-tag', 'dk-push'],
      title: '镜像拉不下来 / 推送失败',
      chain: [
        'docker pull <镜像>                      # 看真实报错',
        'docker info | grep -A3 "Registry Mirrors"',
        'cat /etc/docker/daemon.json',
        'docker login swr.cn-north-4.myhuaweicloud.com',
        'docker tag <本地镜像> swr.<region>.myhuaweicloud.com/<组织>/<镜像>:<标签>',
        'docker push swr.<region>.myhuaweicloud.com/<组织>/<镜像>:<标签>'
      ],
      note: '拉取失败先区分是**网络**（配镜像加速/代理）还是**认证**（`docker login`）。推送到华为云 SWR 时，镜像名必须是完整的 SWR 域名格式，先 `tag` 成该格式再 push。'
    },
    {
      id: 'cheat-docker-disk', group: 'Docker 容器', sym: '💽', level: 2,
        cmdIds: ['dk-df', 'ls9-du', 'dk-prune-image'],
      title: 'Docker 把磁盘占满',
      chain: [
        'docker system df',
        'docker system df -v | head -30',
        'du -sh /var/lib/docker/* | sort -rh | head',
        'docker container prune -f',
        'docker image prune -a -f',
        'docker builder prune -f'
      ],
      note: '**`docker system df -v` 会告诉你谁占的**：镜像、容器、卷还是构建缓存。容器日志不受限也会撑满，重建时加 `--log-opt max-size=10m --log-opt max-file=3`。`prune` 前确认没有还需要用的镜像。'
    },
    {
      id: 'cheat-docker-network', group: 'Docker 容器', sym: '🌐', level: 3,
        cmdIds: ['dk-exec', 'dk-network-inspect', 'pf-sysctl', 'ln-iptables'],
      title: '容器访问不了外网 / 访问不了宿主机',
      chain: [
        'docker exec -it <容器> cat /etc/resolv.conf',
        'docker exec -it <容器> ping -c2 8.8.8.8',
        'docker exec -it <容器> nslookup <域名>',
        'docker network inspect bridge',
        'sysctl net.ipv4.ip_forward   # 必须是 1',
        'iptables -t nat -L POSTROUTING -n | head'
      ],
      note: '容器内**默认用宿主机 DNS**，公司内网 DNS 场景常出错，可 `--dns` 指定。容器访问宿主机用 `host.docker.internal`（需 `--add-host`）或宿主机内网 IP（`172.17.0.1` 是默认 bridge 网关）。'
    },
    {
      id: 'cheat-docker-timezone', group: 'Docker 容器', sym: '🕐', level: 2,
        cmdIds: ['dk-exec', 'dk-run'],
      title: '容器内时间不对（差 8 小时）',
      chain: [
        'docker exec -it <容器> date',
        'docker run -e TZ=Asia/Shanghai <镜像> date',
        'docker run -v /etc/localtime:/etc/localtime:ro <镜像> date',
        'docker exec -it <容器> ls /usr/share/zoneinfo/Asia/Shanghai'
      ],
      note: '**容器内默认是 UTC**。`-e TZ=Asia/Shanghai` 最干净，但要求镜像装了 tzdata；挂载 `/etc/localtime` 会让容器与宿主机时区一致。Java 应用还要注意 `-Duser.timezone`。'
    },
    {
      id: 'cheat-docker-port', group: 'Docker 容器', sym: '🔌', level: 1,
        cmdIds: ['dk-ps', 'ln-ss', 'ln-curl', 'dk-exec'],
      title: '端口映射了但访问不到',
      chain: [
        'docker ps --format "table {{.Names}}\\t{{.Ports}}\\t{{.Status}}"',
        'docker port <容器名>',
        'ss -tulnp | grep <宿主机端口>',
        'curl -v http://127.0.0.1:<宿主机端口>',
        'docker exec -it <容器> curl -v http://127.0.0.1:<容器端口>'
      ],
      note: '**分两段验证**：宿主机端口通不通（前半段），容器内服务在不在监听（后半段）。容器内 `127.0.0.1` 是容器自己，不是宿主机。应用只监听 `127.0.0.1` 而非 `0.0.0.0` 时映射出来也访问不到。'
    },

    /* ==================== Kubernetes ==================== */
    {
      id: 'cheat-k8s-pod', group: 'Kubernetes', sym: '☸️', level: 2,
        cmdIds: ['k8s-get', 'k8s-describe', 'k8s-logs', 'k8s-get-events'],
      title: 'Pod 起不来（三板斧）',
      chain: [
        'kubectl get pods -n <ns> -o wide',
        'kubectl describe pod <pod> -n <ns> | tail -30',
        'kubectl logs <pod> -n <ns> --previous --tail=100',
        'kubectl get events -n <ns> --sort-by=.lastTimestamp | tail -15',
        'kubectl get pod <pod> -o jsonpath="{.status.containerStatuses[*].state}"'
      ],
      note: '按状态对症：**Pending** → 资源不足/亲和性/PVC 未绑定/taint；**ImagePullBackOff** → 镜像名错或拉取密钥缺失（华为云查 SWR 权限）；**CrashLoopBackOff** → 应用启动即退出，看 `--previous` 日志；**OOMKilled** → 内存超 limits。'
    },
    {
      id: 'cheat-k8s-svc', group: 'Kubernetes', sym: '🔀', level: 3,
        cmdIds: ['k8s-get', 'k8s-describe'],
      title: 'Service 访问不通',
      chain: [
        'kubectl get endpoints <svc> -n <ns>          # 空就是根因',
        'kubectl get svc <svc> -n <ns> -o yaml | grep -A6 ports',
        'kubectl get pods -l <selector> -n <ns> --show-labels',
        'kubectl describe svc <svc> -n <ns>',
        'kubectl run tmp --rm -it --image=busybox -- sh -c "wget -O- -T3 http://<svc>.<ns>:<port>"'
      ],
      note: '**90% 的"Service 不通"是 endpoints 为空**：要么选择器没匹配到 Pod，要么 Pod 没通过 readiness 探针。第二个高频原因是 `targetPort` 写成了 Service 的 port，而不是容器实际监听的端口。'
    },
    {
      id: 'cheat-k8s-pending', group: 'Kubernetes', sym: '⏳', level: 3,
        cmdIds: ['k8s-describe', 'k8s-get', 'k8s-get-nodes'],
      title: 'Pod 一直 Pending',
      chain: [
        'kubectl describe pod <pod> -n <ns> | grep -A15 Events',
        'kubectl describe nodes | grep -A5 "Allocated resources"',
        'kubectl get pvc -n <ns>',
        'kubectl get nodes --show-labels | head',
        'kubectl get pod <pod> -o yaml | grep -A10 nodeSelector'
      ],
      note: '四个方向：**资源不够**（requests 大于所有节点可分配余量）、**调度约束不满足**（nodeSelector/affinity/taint 未容忍）、**PVC 未绑定**（StorageClass 不存在或云盘配额满）、**节点全被 cordon**。'
    },
    {
      id: 'cheat-k8s-crash', group: 'Kubernetes', sym: '💥', level: 3,
        cmdIds: ['k8s-get', 'k8s-logs', 'k8s-describe'],
      title: 'Pod 反复重启 / OOMKilled',
      chain: [
        'kubectl get pod <pod> -n <ns>',
        'kubectl logs <pod> -n <ns> --previous --tail=200',
        'kubectl get pod <pod> -o jsonpath="{.status.containerStatuses[*].lastState.terminated}"',
        'kubectl describe pod <pod> | grep -i -E "oom|limit|probe|restart"',
        'kubectl get pod <pod> -o jsonpath="{.spec.containers[*].resources}"'
      ],
      note: '退出码 **137** 通常是被 OOMKilled 或 SIGKILL；**143** 是收到 SIGTERM（正常优雅停止）。若是探针问题，`Running 0/1` 而不是重启 —— 看 readiness 的路径、端口与 `initialDelaySeconds` 是否够长。'
    },
    {
      id: 'cheat-k8s-node', group: 'Kubernetes', sym: '🖥️', level: 3,
        cmdIds: ['k8s-get-nodes', 'k8s-describe', 'k8s-debug', 'sec-chroot'],
      title: '节点 NotReady',
      chain: [
        'kubectl get nodes',
        'kubectl describe node <节点> | grep -A20 Conditions',
        'kubectl describe node <节点> | grep -A15 "Allocated resources"',
        'kubectl debug node/<节点> -it --image=busybox   # 进去后 chroot /host',
        'chroot /host && journalctl -u kubelet -n 100 --no-pager'
      ],
      note: '常见原因：kubelet 挂了、磁盘压力（DiskPressure）、内存压力、网络插件（CNI）异常、节点到 API Server 网络不通。云上还要看节点是否欠费或安全组被改。'
    },
    {
      id: 'cheat-k8s-image', group: 'Kubernetes', sym: '📥', level: 2,
        cmdIds: ['k8s-describe', 'k8s-get', 'dk-pull'],
      title: 'ImagePullBackOff',
      chain: [
        'kubectl describe pod <pod> -n <ns> | grep -A10 Events',
        'kubectl get pod <pod> -o jsonpath="{.spec.containers[*].image}"',
        'kubectl get secret -n <ns>',
        'kubectl get pod <pod> -o jsonpath="{.spec.imagePullSecrets}"',
        'docker pull <镜像>   # 在节点或本地手工验证一次'
      ],
      note: '四种原因：镜像名/标签写错（最常见）、私有仓库缺 `imagePullSecrets`、节点拉不到外网（要配镜像加速或走内网端点）、仓库限流。华为云 SWR 要注意镜像地址格式与「长期登录指令」的组织权限。'
    },
    {
      id: 'cheat-k8s-storage', group: 'Kubernetes', sym: '🗄️', level: 3,
        cmdIds: ['k8s-get', 'k8s-describe'],
      title: 'PVC 一直 Pending / 挂载失败',
      chain: [
        'kubectl get pvc -n <ns>',
        'kubectl describe pvc <pvc> -n <ns> | tail -20',
        'kubectl get storageclass',
        'kubectl get pv',
        'kubectl describe pod <pod> -n <ns> | grep -i -A5 mount'
      ],
      note: 'PVC Pending 多为：`storageClassName` 不存在或写错、云盘配额不足、可用区与节点不匹配（**云上高频坑**：PV 在 az1 而 Pod 被调度到 az2）。`FailedMount` 则常见于云盘还没 attach 完、挂载点残留。'
    },
    {
      id: 'cheat-k8s-forbidden', group: 'Kubernetes', sym: '🚫', level: 3,
        cmdIds: ['k8s-config', 'k8s-auth-can-i', 'k8s-get'],
      title: 'Forbidden / Unauthorized',
      chain: [
        'kubectl config current-context',
        'kubectl auth can-i --list -n <ns>',
        'kubectl auth can-i create pods -n <ns>',
        'kubectl config view --minify',
        'kubectl get rolebinding,clusterrolebinding -A | grep <用户名|SA名>'
      ],
      note: '**Forbidden** 是 RBAC 权限不足（能连上集群但没权限）；**Unauthorized** 是认证失败（kubeconfig 证书过期或错误）。CCE 场景常见：IAM 子用户有控制台权限但集群内没做角色绑定。'
    },

    /* ==================== 中间件（Phase 2） ==================== */
    {
      id: 'cheat-nginx-502-504-499', group: '中间件', sym: '🚪', level: 3,
        cmdIds: ['lt-awk', 'lt-grep', 'lb-tail', 'ln-curl', 'ln-ss', 'sec-getenforce'],
      title: 'Nginx 报 502 / 504 / 499',
      chain: [
        'awk \'{print $9}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head',
        'awk \'$9==502||$9==504{n++} END{printf "502+504 占比: %.2f%%\\n", n/NR*100}\' /var/log/nginx/access.log',
        'grep -E \' (502|504|499) \' /var/log/nginx/access.log | tail -50',
        'tail -f /var/log/nginx/error.log',
        'curl -v http://<后端IP>:<后端端口>/health',
        'ss -lntp | grep <后端端口>',
        'getenforce && getsebool httpd_can_network_connect'
      ],
      note: '**三种码方向完全不同**：502 是连不上后端，504 是连上了但超时，499 是客户端先断开。先统计分布再动手，别一上来就调超时参数。'
    },
    {
      id: 'cheat-nginx-upstream-down', group: '中间件', sym: '🔌', level: 3,
        cmdIds: ['mw-nginx-dump', 'lt-grep', 'ln-curl', 'ln-ss', 'mo-dmesg', 'sec-getsebool', 'ln-firewall-cmd'],
      title: 'Nginx 连不上后端 / upstream 全挂',
      chain: [
        'nginx -T | grep -n -A8 "upstream"',
        'grep -E "no live upstreams|connect\\(\\) failed|upstream timed out" /var/log/nginx/error.log | tail -20',
        'curl -v -m 3 http://<后端IP>:<后端端口>/health',
        'ss -lntp | grep <后端端口>',
        'dmesg -T | grep -i -E "oom|killed process"',
        'getsebool httpd_can_network_connect',
        'firewall-cmd --list-all   # 或 iptables -L -n'
      ],
      note: '`no live upstreams` 就是**后端全被 max_fails 摘除**。开源版只有被动健康检查、没有主动探测，要配 backup 或外层负载均衡兜底。'
    },
    {
      id: 'cheat-keepalived-split-brain', group: '中间件', sym: '🧭', level: 3,
        cmdIds: ['lu-systemctl', 'lu-journalctl', 'mw-keepalive-vip', 'ln-tcpdump', 'lt-grep', 'ln-firewall-cmd'],
      title: 'Keepalived 双主 / VIP 漂移失败',
      chain: [
        'systemctl status keepalived --no-pager',
        'journalctl -u keepalived -n 50 --no-pager',
        'ip addr show <网卡> | grep -w <VIP>',
        'tcpdump -i <网卡> -nn -vv vrrp',
        'grep -E "virtual_router_id|priority|state|unicast_peer" /etc/keepalived/keepalived.conf',
        'firewall-cmd --add-protocol=vrrp --permanent && firewall-cmd --reload',
        'grep -rn "virtual_router_id" /etc/keepalived/   # 一台机器跑了多组时查冲突'
      ],
      note: '**双主的判据是两台同时持有 VIP**：看 `priority` 是否写成同一个值、`virtual_router_id` 是否撞车；云 VPC 不转发 VRRP 多播，要改 `unicast_peer`。'
    },
    {
      id: 'cheat-etcd-space', group: '中间件', sym: '🗃️', level: 4,
        cmdIds: ['mw-etcd-status', 'mw-etcd-health', 'mw-etcd-member-list'],
      title: 'ETCD 空间满 / 集群不健康',
      chain: [
        'export ETCDCTL_API=3',
        'etcdctl endpoint status --cluster -w table',
        'etcdctl endpoint health --cluster -w table',
        'etcdctl member list -w table',
        'etcdctl version && etcd --version',
        'etcdctl compact $(etcdctl endpoint status -w json | grep -o \'"revision":[0-9]*\' | head -1 | cut -d: -f2)',
        'etcdctl defrag --cluster --command-timeout=120s',
        'etcdctl endpoint status -w table   # 复查 DB SIZE 是否回落'
      ],
      note: '报 `mvcc: database space exceeded` 说明 2GiB 配额写满、**集群已整体只读**，所有资源都建不了。`compact` 只标记回收，必须再 `defrag`。'
    },

    /* ==================== 数据库与缓存（Phase 2） ==================== */
    {
      id: 'cheat-mysql-repl-lag', group: '数据库与缓存', sym: '🔁', level: 4,
        cmdIds: ['db-mysql-client', 'mo-iostat', 'mo-top'],
      title: 'MySQL 主从延迟 / 复制断链',
      chain: [
        'mysql -h <从库> -u root -p -e "SHOW REPLICA STATUS\\G" | egrep "Running|Seconds_Behind|Last_.*Error|Gtid_Set"',
        'mysql -h <从库> -u root -p -e "SELECT COUNT(*) FROM information_schema.processlist WHERE command<>\'Sleep\';"',
        'mysql -h <从库> -u root -p -e "SHOW ENGINE INNODB STATUS\\G" | sed -n \'/TRANSACTIONS/,/^---/p\'',
        'mysql -h <主库> -u root -p -e "SHOW MASTER STATUS\\G"',
        'iostat -x 1 5',
        'top -H -p $(pgrep -f mysqld) | head -20'
      ],
      note: '先分清 **IO 线程断**（`Connecting`：网络/账号/位点）还是 **SQL 线程断**（`No`：看 `Last_SQL_Error`）。两个都 `Yes` 但延迟大就是回放跟不上。'
    },
    {
      id: 'cheat-mysql-lock-wait', group: '数据库与缓存', sym: '🔒', level: 3,
        cmdIds: ['db-mysql-client'],
      title: 'MySQL 锁等待 / 长事务把库拖住',
      chain: [
        'mysql -h <主机> -u root -p -e "SHOW FULL PROCESSLIST;"',
        'mysql -h <主机> -u root -p -e "SELECT id,user,host,db,command,time,state,LEFT(info,80) FROM information_schema.processlist WHERE command<>\'Sleep\' ORDER BY time DESC LIMIT 20;"',
        'mysql -h <主机> -u root -p -e "SELECT waiting_pid,waiting_query,blocking_pid,blocking_query FROM sys.innodb_lock_waits;"',
        'mysql -h <主机> -u root -p -e "SHOW ENGINE INNODB STATUS\\G" | sed -n \'/LATEST DETECTED DEADLOCK/,/^---/p\'',
        'mysql -h <主机> -u root -p -e "SELECT COUNT(*) AS sleep_conn FROM information_schema.processlist WHERE command=\'Sleep\';"',
        'mysql -h <主机> -u root -p -e "KILL QUERY <会话ID>;"'
      ],
      note: '`sys.innodb_lock_waits` 直接给出**谁挡住了谁**。`State=Waiting for table metadata lock` 基本就是有人 `ALTER` 撞上未提交的长事务。'
    },
    {
      id: 'cheat-mysql-slow-sql', group: '数据库与缓存', sym: '🐢', level: 2,
        cmdIds: ['db-mysql-client', 'db-mysqldumpslow'],
      title: 'MySQL 慢查询找不到是哪条 SQL',
      chain: [
        'mysql -h <主机> -u root -p -e "SHOW VARIABLES LIKE \'slow_query%\'"',
        'mysql -h <主机> -u root -p -e "SHOW VARIABLES LIKE \'long_query_time\'"',
        'mysql -h <主机> -u root -p -e "SET GLOBAL slow_query_log=ON; SET GLOBAL long_query_time=1;"',
        'mysqldumpslow -s t -t 10 /var/lib/mysql/mysql-slow.log',
        'mysqldumpslow -s c -t 20 -g "SELECT" /var/lib/mysql/mysql-slow.log',
        'mysql -h <主机> -u root -p -e "EXPLAIN FOR CONNECTION <会话ID>;"'
      ],
      note: '慢日志**只记录跑完的语句**：正在卡住的要用 `SHOW PROCESSLIST` 抓，再用 `EXPLAIN FOR CONNECTION` 看它的执行计划。`-s c` 找调用次数多的。'
    },
    {
      id: 'cheat-redis-bigkey-oom', group: '数据库与缓存', sym: '🧱', level: 3,
        cmdIds: ['db-redis-cli'],
      title: 'Redis 大 key / 内存写满',
      chain: [
        'redis-cli -h <主机> -p 6379 INFO memory | egrep "used_memory_human|maxmemory_human|evicted_keys|mem_fragmentation_ratio"',
        'redis-cli -h <主机> -p 6379 CONFIG GET maxmemory-policy',
        'redis-cli -h <主机> -p 6379 --bigkeys -i 0.1',
        'redis-cli -h <主机> -p 6379 MEMORY USAGE <key> SAMPLES 0',
        'redis-cli -h <主机> -p 6379 INFO keyspace',
        'redis-cli -h <主机> -p 6379 SLOWLOG GET 10',
        'redis-cli -h <主机> -p 6379 UNLINK <key>'
      ],
      note: '`--bigkeys` 每种类型**只报最大的一个**，没扫到不等于没有，要用 `MEMORY USAGE <key> SAMPLES 0` 复核。`evicted_keys` 在涨就是内存不够。'
    },
    {
      id: 'cheat-log-fill-disk', group: '数据库与缓存', sym: '📝', level: 3,
        cmdIds: ['ls9-df', 'ls9-du', 'lb-find', 'mo-lsof', 'lb-truncate', 'lu-journalctl', 'mo-log-logrotate', 'lt-grep'],
      title: '日志占满磁盘（no space left on device）',
      chain: [
        'df -h; df -i',
        'du -sh /var/log/* /data/* /var/lib/docker/containers/* 2>/dev/null | sort -rh | head -10',
        'find /var/log /data -xdev -type f -size +500M -exec ls -lh {} \\; 2>/dev/null',
        'lsof +L1 2>/dev/null | head -20',
        'truncate -s 0 /data/app/logs/app.log',
        'journalctl --disk-usage && journalctl --vacuum-size=500M',
        'logrotate -vf /etc/logrotate.d/<服务名>',
        'grep -rE "max-size|max-file" /etc/docker/daemon.json'
      ],
      note: '**绝对不要 `rm` 正在写的日志**：进程还持有句柄，空间不会释放、`df` 依旧 100%，要用 `truncate -s 0`。容器场景先查 `*-json.log`。'
    },

    /* ==================== 安全与合规（Phase 2） ==================== */
    {
      id: 'cheat-cert-expired', group: '安全与合规', sym: '📜', level: 3,
        cmdIds: ['lb-find', 'lt-grep', 'sec-openssl-x509'],
      title: '证书过期 / HTTPS 报证书错误',
      chain: [
        'echo | openssl s_client -connect <域名>:443 -servername <域名> 2>/dev/null | openssl x509 -noout -subject -issuer -dates',
        'for h in <域名1> <域名2>; do end=$(echo | openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2); echo "$h 剩余 $(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 )) 天"; done',
        'echo | openssl s_client -connect <域名>:443 -servername <域名> -showcerts 2>/dev/null | grep -c "BEGIN CERTIFICATE"',
        'find /etc/nginx /etc/pki/tls/certs -name "*.crt" -o -name "*.pem" | while read f; do openssl x509 -in "$f" -noout -checkend 2592000 >/dev/null 2>&1 || echo "30 天内过期: $f"; done',
        'grep -rn "ssl_certificate " /etc/nginx/   # 找出 Nginx 实际加载的证书路径',
        'openssl x509 -in <证书文件> -noout -subject -dates'
      ],
      note: '判据是 `-enddate` 换算出的**剩余天数**与 `-showcerts` 数出的**证书张数**（正常 2 张）。别忘中间证书也会过期，Nginx 要配 fullchain。'
    },
    {
      id: 'cheat-selinux-denied', group: '安全与合规', sym: '🛡️', level: 3,
        cmdIds: ['sec-getenforce', 'sec-setenforce', 'sec-ausearch', 'lt-grep', 'sec-semanage-fcontext', 'sec-setsebool', 'sec-restorecon'],
      title: 'SELinux 拒绝导致服务起不来',
      chain: [
        'getenforce',
        'setenforce 0 && systemctl restart <服务名>   # 临时宽容验证是否 SELinux 所致，验完改回 1',
        'ausearch -m avc -ts recent -i',
        'ausearch -m avc -ts today -i | audit2why',
        'grep -i avc /var/log/audit/audit.log | tail -20   # 没有 auditd 时改用 dmesg -T | grep -i avc',
        'semanage fcontext -l | grep <服务名>',
        'setsebool -P httpd_can_network_connect 1   # 按 AVC 结论选布尔值',
        'restorecon -Rv <目录>'
      ],
      note: '关键判据是 `setenforce 0` 后服务立刻能起 —— 能起基本确诊。再看 AVC 的 `scontext`（谁被拦）与 `tcontext`（访问什么被拦）决定改标签还是开布尔值。'
    },

    /* ==================== 性能与调优（Phase 2） ==================== */
    {
      id: 'cheat-java-thread-cpu', group: '性能与调优', sym: '🧵', level: 4,
        cmdIds: ['mo-jvm-jps', 'mo-top', 'lt-printf', 'mo-jvm-jstack', 'lt-grep', 'mo-pidstat'],
      title: 'Java 进程 CPU 高但不知是哪个线程',
      chain: [
        'jps -lvm',
        'top -H -p <PID>',
        'printf "%x\\n" <线程ID>',
        'jstack <PID> > /tmp/jstack-$(date +%H%M%S).txt',
        'grep -A 30 "nid=0x<十六进制线程号>" /tmp/jstack-$(date +%H%M%S).txt',
        'for i in 1 2 3; do jstack <PID> | grep -A 12 "nid=0x<十六进制线程号>" | head -14; sleep 5; done',
        'pidstat -t -p <PID> 1 5',
        'jstack -l <PID> | grep -c "java.lang.Thread.State: BLOCKED"'
      ],
      note: '原理是 **JVM 线程与内核线程一一对应**：`top -H` 的十进制线程 ID 转成十六进制就是 `jstack` 里的 `nid=0x...`。必须间隔数秒采样 3 次以上。'
    },
    {
      id: 'cheat-disk-io-bottleneck', group: '性能与调优', sym: '🧊', level: 3,
        cmdIds: ['mo-vmstat', 'mo-iostat', 'mo-pidstat', 'ls9-iotop', 'mo-ps', 'mo-lsof', 'mo-dmesg'],
      title: '磁盘 IO 瓶颈（CPU 不高但很卡）',
      chain: [
        'vmstat 1 5',
        'iostat -x -d -m -z 1 5',
        'pidstat -d 1 5',
        'iotop -oP -d 2',
        'ps -eo state,pid,cmd | grep -E "^D"',
        'lsof -p <PID> 2>/dev/null | grep -E "REG|DIR" | head -20',
        'dmesg -T | grep -i -E "I/O error|EXT4-fs|nvme|ata" | tail -20'
      ],
      note: '判据是 `iostat` 的 **`%util` 接近 100%、`await` 远高于平时**（机械盘 >20ms、SSD >5ms），`vmstat` 的 `b` 与 `wa` 同时高。`D` 状态进程连 `kill -9` 都杀不掉。'
    },

    /* ==================== 云平台与自动化（Phase 2） ==================== */
    {
      id: 'cheat-huawei-ecs-unreachable', group: '云平台与自动化', sym: '☁️', level: 3,
        cmdIds: ['hw-ecs-list', 'lu-systemctl', 'ln-ss', 'ln-nc', 'ln-tcpdump'],
      title: '华为云 ECS 连不上 / 安全组没放行',
      chain: [
        'hcloud ECS ListServersDetails --cli-region=<区域> --cli-query="servers[?name==\'<实例名>\'].{id:id,status:status,addresses:addresses}" --cli-output=json',
        'hcloud EIP ListPublicips --cli-region=<区域> --cli-query="publicips[*].{ip:public_ip_address,status:status}" --cli-output=table',
        'hcloud VPC ListSecurityGroupRules --cli-region=<区域> --security_group_id=<安全组ID> --cli-query="security_group_rules[?direction==\'ingress\'].{proto:protocol,port:port_range_min,remote:remote_ip_prefix}" --cli-output=table',
        'systemctl status firewalld; iptables -L -n',
        'ss -lntp | grep <端口>',
        'nc -vz <弹性公网IP> <端口>',
        'tcpdump -i any -nn port <端口>'
      ],
      note: '顺序固定为**公网路径 → 安全组 → 本机防火墙 → 服务监听**，别一上来就改安全组。安全组规则是并集，绑了多个组要全部看一眼。'
    },

    /* ==================== 虚拟化与镜像（Phase 2） ==================== */
    {
      id: 'cheat-vm-boot-fail', group: '虚拟化与镜像', sym: '🖥️', level: 3,
        cmdIds: ['vm-virsh-list', 'lu-journalctl', 'vm-img-info'],
      title: '虚机无法启动 / 磁盘镜像有问题',
      chain: [
        'virsh list --all && virsh dominfo <虚机名>',
        'virsh start <虚机名> 2>&1 | tail -20',
        'journalctl -u libvirtd -n 50 --no-pager',
        'qemu-img info /var/lib/libvirt/images/<镜像文件>',
        'qemu-img info --backing-chain /var/lib/libvirt/images/<镜像文件>',
        'qemu-img check /var/lib/libvirt/images/<镜像文件>',
        'virsh pool-list --all && virsh domblklist <虚机名>',
        'virsh dumpxml <虚机名> | grep -A5 "<disk"'
      ],
      note: '两个必查判据：镜像 `file format` 是否与 XML 里声明的 `<driver type=>` 一致（不一致直接拒启），`--backing-chain` 看**基础镜像是否还在**。'
    }

  ];
})();
