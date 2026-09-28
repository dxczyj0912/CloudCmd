/* 命令手册的二级导航。只引用原始命令 ID，不复制命令或学习状态。 */
(function () {
  'use strict';
  function group(id, name, icon, ids, prefixes, source) {
    return { id: id, name: name, icon: icon,
      ids: ids ? ids.split(' ') : [], prefixes: prefixes ? prefixes.split(' ') : [], source: source || '' };
  }
  window.CC_COMMAND_STACKS = {
    'linux-basic': [
      group('navigation', '目录与路径', '🧭', 'lb-ls lb-cd lb-cd-dash lb-pwd lb-tree lb-basename lb-dirname lb-realpath lb-readlink'),
      group('reading', '查看文件', '📄', 'lb-cat lb-cat-a lb-tac lb-less lb-more lb-head lb-tail lb-nl lb-file lb-stat'),
      group('files', '文件操作', '📁', 'lb-mkdir lb-rmdir lb-touch lb-rm lb-cp lb-mv lb-ln lb-truncate lb-install lb-rename'),
      group('finding', '查找命令与文件', '🔎', 'lb-find lb-locate lb-which lb-whereis lb-type'),
      group('compare', '统计、比较与校验', '📏', 'lb-wc lb-sort lb-uniq lb-diff lb-cmp lb-md5sum lb-sha256sum'),
      group('archive', '压缩与归档', '🗜️', 'lb-tar lb-gzip lb-gunzip lb-zip lb-unzip lb-xz lb-zstd lb-split'),
      group('transfer', '远程传输与下载', '📡', 'lb-scp lb-rsync lb-sftp lb-wget lb-curl-o'),
      group('utilities', '命令行辅助', '⌨️', 'lb-tee lb-xargs lb-watch lb-dd lb-history lb-alias')
    ],
    'linux-text': [
      group('grep', 'grep 与检索', '🔎', 'lt-egrep lt-fgrep lt-zgrep lt-zgrep-r lt-rg', 'lt-grep'),
      group('sed', 'sed 文本编辑', '✂️', '', 'lt-sed'),
      group('awk', 'awk 数据分析', '📊', '', 'lt-awk'),
      group('columns', '字段与去重', '🧮', 'lt-cut lt-paste lt-tr lt-join lt-column lt-sort-column lt-uniq lt-dedupe-large-file'),
      group('structured', 'JSON 与 YAML', '🧩', 'lt-jq lt-jq-k8s-pod lt-yq'),
      group('encoding', '编码与格式', '🔤', 'lt-iconv lt-dos2unix lt-printf'),
      group('logs', '日志分析', '📜', 'lt-nginx-top-ip lt-nginx-status lt-log-time-window lt-log-error-rate')
    ],
    'linux-user': [
      group('accounts', '用户、组与登录', '👤', 'lu-useradd lu-usermod lu-userdel lu-passwd lu-chage lu-groupadd lu-groupmod lu-groupdel lu-gpasswd lu-id lu-su lu-sudo lu-visudo lu-getent lu-w lu-last lu-lastlog lu-loginctl'),
      group('permissions', '文件权限与 ACL', '🔐', 'lu-chmod lu-chown lu-chgrp lu-umask lu-lsattr lu-chattr lu-getfacl lu-setfacl lu-stat'),
      group('system', '主机与时间', '🖥️', 'lu-hostname lu-hostnamectl lu-date lu-timedatectl lu-uptime lu-uname lu-lsb-release lu-lscpu lu-dmidecode lu-localectl lu-update-alternatives'),
      group('services', 'systemd 与日志', '⚙️', 'lu-service lu-journalctl lu-journalctl-vacuum lu-systemd-unit lu-systemd-analyze', 'lu-systemctl'),
      group('scheduling', '定时任务', '⏰', 'lu-crontab lu-cron-format lu-at lu-systemd-timer'),
      group('power', '关机与运行级别', '🔌', 'lu-shutdown lu-reboot lu-halt lu-poweroff lu-runlevel')
    ],
    'linux-net': [
      group('interfaces', '网卡与路由', '🌐', 'ln-ifconfig ln-route ln-nmcli ln-ethtool ln-arping ln-ip-stats', 'ln-ip-'),
      group('ports', '端口与连接', '🔌', 'ln-ss ln-ss-kill ln-netstat ln-lsof ln-fuser ln-nc ln-telnet'),
      group('reachability', '连通性与 DNS', '📡', 'ln-ping ln-traceroute ln-mtr ln-nslookup ln-dig ln-host ln-resolv-conf ln-hosts-file ln-troubleshoot-dns ln-troubleshoot-slow ln-troubleshoot-connect-refused'),
      group('http', 'HTTP 与 TLS', '🌍', 'ln-curl ln-wget ln-curl-timing ln-httpie ln-openssl-sclient ln-http-version'),
      group('capture', '抓包与流量', '📈', 'ln-tcpdump ln-tshark ln-iftop ln-nethogs'),
      group('firewall', '防火墙与端口排障', '🛡️', 'ln-firewall-cmd ln-iptables ln-iptables-save ln-ufw ln-ipset ln-nft ln-troubleshoot-firewall ln-troubleshoot-port'),
      group('ssh', 'SSH 与远程访问', '🔑', 'ln-ssh ln-ssh-keygen ln-ssh-copy-id ln-ssh-agent ln-ssh-nopass ln-known-hosts ln-ssh-config-alias ln-sftp ln-sshd-config ln-ssh-tunnel')
    ],
    'linux-storage': [
      group('capacity', '容量与设备发现', '📊', 'ls9-df ls9-du ls9-ncdu ls9-lsblk ls9-blkid ls9-findmnt ls9-new-disk-flow'),
      group('partition', '分区与文件系统', '💽', 'ls9-fdisk ls9-parted ls9-partprobe ls9-mkfs-ext4 ls9-mkfs-xfs ls9-mkswap ls9-swapon ls9-growpart ls9-fsck ls9-resize2fs ls9-xfs-growfs ls9-tune2fs'),
      group('mount', '挂载与共享', '📁', 'ls9-mount ls9-umount ls9-fstab ls9-systemd-mount ls9-autofs ls9-nfs-client ls9-nfs-server'),
      group('lvm', 'LVM 卷管理', '🧱', 'ls9-lvm-overview ls9-pvcreate ls9-vgcreate ls9-lvcreate ls9-lvreduce ls9-lvm-extend ls9-lvremove'),
      group('io', 'IO 观测与压测', '⚡', 'ls9-iostat ls9-iotop ls9-ioping ls9-fio ls9-dd'),
      group('raid', 'RAID 与磁盘健康', '🛠️', 'ls9-mdadm ls9-mdstat ls9-smartctl ls9-hdparm'),
      group('maintenance', '空间维护', '🧹', 'ls9-sync ls9-fallocate ls9-blkdiscard ls9-quota'),
      group('ceph', 'Ceph 分布式存储', '🦑', '', 'ceph-')
    ],
    'shell': [
      group('variables', '变量与参数', '🔤', 'sh-var-export sh-quotes sh-param-default sh-string-ops sh-array sh-special-vars sh-shift sh-read sh-echo'),
      group('flow', '条件与循环', '🔀', 'sh-if sh-test sh-case sh-for sh-while-until sh-break-continue'),
      group('functions', '函数与选项', '🧩', 'sh-function sh-getopts'),
      group('streams', '重定向与管道', '📤', 'sh-redirect sh-heredoc sh-pipe-cmdsub sh-tee-exec sh-devnull-devtcp'),
      group('reliability', '可靠性与调试', '🛡️', 'sh-set-euo-pipefail sh-trap sh-mktemp sh-log-error sh-debug'),
      group('processes', '后台与超时', '⏱️', 'sh-background sh-screen-tmux sh-wait sh-timeout sh-systemd-wrapper'),
      group('templates', '实用脚本模板', '📋', '', 'sh-template-')
    ],
    'docker': [
      group('images', '镜像与构建', '📦', 'dk-pull dk-images dk-build dk-buildx dk-tag dk-push dk-rmi dk-save dk-history dk-inspect dk-commit dk-dockerfile dk-prune-image'),
      group('containers', '容器生命周期', '🐳', 'dk-run dk-ps dk-start dk-stop dk-restart dk-kill dk-rm dk-pause dk-wait dk-rename dk-update dk-exec dk-logs dk-stats dk-cp dk-diff dk-events dk-container-logs-size'),
      group('network', '容器网络', '🌐', '', 'dk-network-'),
      group('volume', '数据卷', '💾', '', 'dk-volume-'),
      group('compose', 'Docker Compose', '🧩', '', 'dk-compose-'),
      group('maintenance', '主机与故障排查', '🛠️', 'dk-system-prune dk-info dk-df dk-daemon-json', 'dk-troubleshoot-')
    ],
    'kubernetes': [
      group('cluster', '集群与节点', '☸️', 'k8s-get-nodes k8s-cluster-info k8s-config k8s-version k8s-api-resources k8s-cce-kubeconfig k8s-cordon k8s-drain k8s-get-nodes-label k8s-pods-by-node k8s-top-node-sort k8s-taint k8s-crictl k8s-troubleshoot-node-notready'),
      group('inspect', '资源查询与排障', '🔎', 'k8s-explain k8s-get k8s-describe k8s-get-events k8s-logs k8s-top k8s-jsonpath k8s-pod-status-conditions k8s-events-involved-object k8s-troubleshoot-pod k8s-troubleshoot-pending k8s-troubleshoot-crashloop k8s-troubleshoot-imagepull'),
      group('debug', 'Pod 调试', '🧰', 'k8s-exec k8s-cp k8s-debug k8s-debug-copy-to k8s-node-shell k8s-exec-dns'),
      group('workloads', '工作负载与发布', '🚀', 'k8s-apply k8s-rollout k8s-scale k8s-delete k8s-edit k8s-set-image k8s-deployment k8s-statefulset k8s-daemonset k8s-job k8s-cronjob k8s-hpa k8s-pdb k8s-replace k8s-diff k8s-create-job'),
      group('network', 'Service 与网络', '🌐', 'k8s-port-forward k8s-troubleshoot-svc k8s-service k8s-ingress k8s-networkpolicy k8s-endpointslices k8s-create-serviceaccount'),
      group('storage', '配置与存储', '💾', 'k8s-configmap k8s-secret k8s-pvc-pv k8s-storageclass k8s-create-namespace k8s-create-secret-generic k8s-create-configmap k8s-label k8s-annotate'),
      group('access', 'RBAC 与身份', '🔐', 'k8s-auth-can-i k8s-auth-reconcile k8s-auth-whoami k8s-rbac-role k8s-rbac-clusterrole k8s-sa-token k8s-create-token'),
      group('bootstrap', 'kubeadm 与 etcd', '🏗️', '', 'k8s-kubeadm- k8s-etcdctl-'),
      group('scheduling', '调度与亲和性', '📍', 'k8s-affinity-toleration')
    ],
    'helm': [
      group('repo', '仓库与 Chart 获取', '📚', 'hl-repo-add hl-repo-list hl-repo-search hl-show hl-pull hl-push'),
      group('release', '发布与升级', '🚀', 'hl-install hl-upgrade hl-upgrade-install hl-uninstall hl-rollback hl-history'),
      group('inspect', '查看 Release', '🔎', 'hl-list hl-status hl-get'),
      group('templates', '模板与校验', '🧩', 'hl-template hl-lint hl-chart-yaml hl-values-files hl-functions hl-helpers'),
      group('package', 'Chart 构建与依赖', '📦', 'hl-package hl-dependency-update hl-create hl-plugin')
    ],
    'middleware': [
      group('nginx', 'Nginx', '🌐', '', 'mw-nginx-'),
      group('tomcat', 'Tomcat', '☕', '', 'mw-tomcat-'),
      group('haproxy', 'HAProxy', '⚖️', '', 'mw-haproxy-'),
      group('keepalived', 'Keepalived', '🔁', '', 'mw-keepalive-'),
      group('etcd', 'etcd', '🗳️', '', 'mw-etcd-'),
      group('redis', 'Redis', '🔴', '', 'db-redis-', 'db-cache'),
      group('kafka', 'Kafka', '📨', '', 'db-kafka-', 'db-cache'),
      group('rabbitmq', 'RabbitMQ', '🐰', '', 'db-rabbit-', 'db-cache'),
      group('rocketmq', 'RocketMQ', '🚀', '', 'db-rocket-', 'db-cache')
    ],
    'db-cache': [
      group('mysql', 'MySQL', '🐬', 'db-mysqldumpslow', 'db-mysql-'),
      group('redis', 'Redis', '🔴', '', 'db-redis-'),
      group('postgresql', 'PostgreSQL', '🐘', '', 'db-pg-'),
      group('mongodb', 'MongoDB', '🍃', '', 'db-mongo-'),
      group('kafka', 'Kafka', '📨', '', 'db-kafka-'),
      group('rabbitmq', 'RabbitMQ', '🐰', '', 'db-rabbit-'),
      group('rocketmq', 'RocketMQ', '🚀', '', 'db-rocket-')
    ],
    'monitor': [
      group('host', '主机资源观测', '🖥️', 'mo-top mo-htop mo-ps mo-pgrep mo-free mo-vmstat mo-uptime mo-nproc mo-iostat mo-sar mo-pidstat mo-iotop mo-lsof mo-strace mo-dmesg mo-proc mo-perf mo-pmap'),
      group('logs', '日志采集与轮转', '📜', '', 'mo-log-'),
      group('prometheus', 'Prometheus 与告警', '📈', 'mo-promql mo-node-exporter mo-grafana-api mo-amtool', 'mo-promtool-'),
      group('zabbix', 'Zabbix', '🔔', '', 'mo-zabbix-'),
      group('cloud', '云监控与日志', '☁️', '', 'mo-hcloud-'),
      group('jvm', 'JVM 诊断', '☕', '', 'mo-jvm-')
    ],
    'cloud-cli': [
      group('huawei', '华为云账号与通用 CLI', '☁️', '', 'hw-hcloud- hw-cross-'),
      group('compute', 'ECS 与镜像', '🖥️', '', 'hw-ecs- hw-ims-'),
      group('storage', 'OBS 与 obsutil', '🪣', '', 'hw-obs- hw-obsutil-'),
      group('network', 'VPC 与 ELB', '🌐', '', 'hw-vpc- hw-elb-'),
      group('data', 'EVS 与 RDS', '💾', '', 'hw-evs- hw-rds-'),
      group('identity', 'IAM、安全与监控', '🔐', '', 'hw-iam- hw-ces-'),
      group('containers', 'CCE 容器服务', '☸️', '', 'hw-cce-'),
      group('workflow', '云上运维流程', '🧭', '', 'hw-flow-'),
      group('aws', 'AWS CLI', '🟠', '', 'hw-aws-'),
      group('azure', 'Azure CLI', '🔷', '', 'hw-az-')
    ],
    'iac': [
      group('terraform', 'Terraform', '🏗️', '', 'iac-tf-'),
      group('ansible', 'Ansible', '⚙️', '', 'iac-ans-')
    ],
    'cicd': [
      group('git', 'Git', '🌿', '', 'ci-git-'),
      group('jenkins', 'Jenkins', '🔧', '', 'ci-jenkins-'),
      group('gitlab', 'GitLab CI', '🦊', '', 'ci-gitlab-'),
      group('delivery', '镜像与交付', '📦', '', 'ci-docker- ci-argocd- ci-image-')
    ],
    'kvm': [
      group('virsh', 'KVM 与 virsh', '🖥️', '', 'vm-virsh-'),
      group('images', '镜像与虚机创建', '💿', '', 'vm-img-'),
      group('cloudinit', 'cloud-init', '☁️', '', 'vm-cloud-'),
      group('tools', 'Packer / Vagrant / govc', '🧰', '', 'vm-misc-'),
      group('openstack', 'OpenStack 私有云', '🏢', '', 'os-')
    ],
    'security': [
      group('crypto', '证书与加密', '🔑', 'sec-cert-expiry-check sec-cert-chain sec-certbot-renew sec-gpg sec-ssh-keygen', 'sec-openssl-'),
      group('mac', 'SELinux 与 AppArmor', '🛡️', 'sec-getenforce sec-semanage-fcontext sec-restorecon sec-aa-status sec-setenforce sec-getsebool sec-setsebool'),
      group('audit', '审计与入侵检测', '🔎', 'sec-ausearch sec-auditctl sec-lastb sec-secure-log sec-fail2ban sec-lynis sec-rpm-va sec-backdoor-check'),
      group('scanning', '网络与镜像扫描', '📡', 'sec-nmap sec-masscan sec-nikto sec-trivy sec-kube-bench sec-clamav'),
      group('cloud', '云安全与密钥', '☁️', 'sec-chroot sec-vault-kv sec-huawei-iam sec-aksk-leak sec-sg-minimal sec-obs-bucket-acl sec-waf-ddos')
    ],
    'perf': [
      group('http', 'HTTP 压测', '🌍', 'pf-ab pf-wrk pf-hey pf-siege pf-jmeter pf-locust'),
      group('system', '系统与磁盘压测', '💾', 'pf-sysbench pf-fio'),
      group('network', '网络性能', '📡', 'pf-iperf3 pf-mtr pf-ping-mtu pf-ss-summary'),
      group('kernel', '内核与资源参数', '⚙️', 'pf-ulimit-n pf-sysctl pf-somaxconn pf-tcp-tw-reuse pf-file-max pf-swappiness'),
      group('cpu', 'CPU 与 NUMA', '🧮', 'pf-taskset pf-numactl'),
      group('profiling', 'JVM 与性能剖析', '🔬', 'pf-jstat pf-gc-log pf-jstack-cpu pf-perf pf-bpftrace')
    ]
  };
})();
