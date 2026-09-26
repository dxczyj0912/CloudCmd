/* ==========================================================================
   data/termfs.js · 模拟终端的虚拟环境
   --------------------------------------------------------------------------
   这里定义"一台假机器"：文件系统、Docker 状态、K8s 集群状态、服务状态。
   所有练习都在这个环境里跑，输出是照着真机格式写的仿真结果 —— 它用于学习，
   不能替代真机验证。新增练习时，尽量先把需要的文件/容器/节点加到这里。
   ========================================================================== */
(function () {
  'use strict';

  /* ======================= 1. 文件系统内容 ======================= */
  /* 写法：目录 = 普通对象；文件 = { $f: '内容' }；软链 = { $l: '目标' }；空目录 = {} */

  var FS_SPEC = {
    etc: {
      hostname: { $f: 'web-prod-01\n' },
      hosts: { $f: '127.0.0.1   localhost localhost.localdomain\n::1         localhost localhost6\n10.0.1.23   web-prod-01\n10.0.2.15   db-prod-01\n10.0.2.16   cache-prod-01\n10.0.1.31   broker1\n10.0.1.32   broker2\n10.0.1.33   broker3\n' },
      os_release: { $f: 'NAME="EulerOS"\nVERSION="2.0 (SP10)"\nID="euleros"\nVERSION_ID="2.0"\nPRETTY_NAME="EulerOS 2.0 (SP10)"\n' },
      localtime: { $l: '/usr/share/zoneinfo/Asia/Shanghai' },
      fstab: { $f: '# <file system>  <mount point>  <type>  <options>  <dump>  <pass>\nUUID=8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88  /      ext4  defaults        1 1\nUUID=b41d9e05-2c7a-4f38-8a61-5d0e2f9b7c31  /data  ext4  defaults,noatime,nofail  0 2\n' },
      'resolv.conf': { $f: 'nameserver 100.125.1.250\nnameserver 114.114.114.114\nsearch myhuaweicloud.com\noptions timeout:1 attempts:2\n' },
      crontab: { $f: 'SHELL=/bin/bash\nPATH=/sbin:/bin:/usr/sbin:/usr/bin\nMAILTO=root\n\n0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1\n*/5 * * * * /usr/bin/curl -s http://127.0.0.1:8080/health >> /var/log/health.log 2>&1\n' },
      nginx: {
        'nginx.conf': { $f: 'user  nginx;\nworker_processes  auto;\n\nevents {\n    worker_connections  10240;\n}\n\nhttp {\n    include       /etc/nginx/mime.types;\n    default_type  application/octet-stream;\n    access_log    /var/log/nginx/access.log  main;\n    sendfile        on;\n    keepalive_timeout  65;\n\n    upstream app_backend {\n        server 10.0.1.31:8080 max_fails=3 fail_timeout=10s;\n        server 10.0.1.32:8080 max_fails=3 fail_timeout=10s;\n    }\n\n    server {\n        listen       80;\n        server_name  web.example.com;\n        location / {\n            proxy_pass http://app_backend;\n            proxy_set_header Host $host;\n            proxy_set_header X-Real-IP $remote_addr;\n        }\n    }\n}\n' },
        conf_d: {}
      },
      docker: {
        'daemon.json': { $f: '{\n  "registry-mirrors": ["https://docker.mirrors.example.com"],\n  "data-root": "/data/docker",\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "3" },\n  "insecure-registries": []\n}\n' }
      },
      systemd: {
        system: {
          'myapp.service': { $f: '[Unit]\nDescription=My Web App\nAfter=network.target\n\n[Service]\nType=simple\nUser=deploy\nWorkingDirectory=/opt/myapp\nExecStart=/usr/bin/java -jar /opt/myapp/app.jar\nRestart=on-failure\nRestartSec=5\nLimitNOFILE=65535\n\n[Install]\nWantedBy=multi-user.target\n' }
        }
      },
      ssh: {
        sshd_config: { $f: 'Port 22\nPermitRootLogin prohibit-password\nPasswordAuthentication no\nPubkeyAuthentication yes\nAllowUsers deploy\nClientAliveInterval 300\n' },
        'ssh_host_ed25519_key.pub': { $f: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH7kQ2mNv8xLpT4rWcY1bE6sJdA9fG3hK0nR5uV2xZ8q root@web-prod-01\n' }
      },
      passwd: { $f: 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\ndeploy:x:1000:1000:deploy:/home/deploy:/bin/bash\nnginx:x:991:986:nginx user:/var/cache/nginx:/sbin/nologin\n' },
      sudoers: { $f: 'Defaults   !visiblepw\nDefaults    env_reset\nroot    ALL=(ALL)       ALL\n%wheel  ALL=(ALL)       ALL\ndeploy  ALL=(ALL)       NOPASSWD: ALL\n' },
      yum: { repos_d: {} },
      'yum.repos.d': {
        'EulerOS.repo': { $f: '[base]\nname=EulerOS-$releasever - Base\nbaseurl=http://repo.huaweicloud.com/euler/2.10/os/$basearch/\nenabled=1\ngpgcheck=1\n' }
      },
      'os-release': { $l: '../usr/lib/os-release' }
    },

    proc: {
      version: { $f: 'Linux version 5.10.0-60.18.0.50.oe2203.x86_64 (abuild@euleros) (gcc version 10.3.1) #1 SMP Wed Mar 22 03:16:53 UTC 2023\n' },
      cpuinfo: { $f: 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) Gold 6278C CPU @ 2.60GHz\ncpu MHz\t\t: 2600.000\ncache size\t: 36608 KB\n\nprocessor\t: 1\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) Gold 6278C CPU @ 2.60GHz\ncpu MHz\t\t: 2600.000\ncache size\t: 36608 KB\n' },
      meminfo: { $f: 'MemTotal:        7957184 kB\nMemFree:          412036 kB\nMemAvailable:    1128404 kB\nBuffers:          128764 kB\nCached:          1820440 kB\nSwapTotal:       2097148 kB\nSwapFree:        2097148 kB\n' },
      loadavg: { $f: '0.42 0.68 0.71 2/412 88231\n' },
      uptime: { $f: '1283947.42 4198320.18\n' },
      mounts: { $f: '/dev/vda1 / ext4 rw,relatime 0 0\n/dev/vdb1 /data ext4 rw,noatime 0 0\nproc /proc proc rw,nosuid,nodev,noexec,relatime 0 0\ntmpfs /dev/shm tmpfs rw,nosuid,nodev 0 0\n' },
      mdstat: { $f: 'Personalities : [raid1]\nunused devices: <none>\n' }
    },

    var: {
      log: {
        'messages': { $f: 'Mar 18 03:00:01 web-prod-01 systemd[1]: Starting Daily Backup...\nMar 18 03:00:04 web-prod-01 backup.sh[22104]: backup started, target=obs://prod-backup\nMar 18 03:12:48 web-prod-01 backup.sh[22104]: uploaded 1842 objects, 12.4 GB\nMar 18 03:12:49 web-prod-01 systemd[1]: backup.service: Succeeded.\nMar 18 09:41:12 web-prod-01 kernel: [1283947.42] docker0: port 3(veth9c1a2b) entered forwarding state\n' },
        'secure': { $f: 'Mar 18 08:12:03 web-prod-01 sshd[18442]: Accepted publickey for deploy from 203.0.113.25 port 51234 ssh2\nMar 18 08:12:03 web-prod-01 sshd[18442]: pam_unix(sshd:session): session opened for user deploy\nMar 18 09:02:31 web-prod-01 sshd[19008]: Failed password for invalid user admin from 198.51.100.77 port 40221 ssh2\nMar 18 09:02:33 web-prod-01 sshd[19009]: Failed password for invalid user root from 198.51.100.77 port 40222 ssh2\nMar 18 09:02:35 web-prod-01 sshd[19010]: Failed password for invalid user test from 198.51.100.77 port 40223 ssh2\n' },
        nginx: {
          'access.log': { $f:
            '203.0.113.25 - - [18/Mar/2024:09:41:02 +0800] "GET /api/orders HTTP/1.1" 200 1842 "-" "curl/7.79.1"\n' +
            '198.51.100.77 - - [18/Mar/2024:09:41:05 +0800] "GET /admin HTTP/1.1" 404 153 "-" "Mozilla/5.0"\n' +
            '203.0.113.25 - - [18/Mar/2024:09:41:09 +0800] "POST /api/orders HTTP/1.1" 201 96 "-" "curl/7.79.1"\n' +
            '192.0.2.44 - - [18/Mar/2024:09:41:12 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.27"\n' +
            '203.0.113.25 - - [18/Mar/2024:09:41:18 +0800] "GET /api/orders/8812 HTTP/1.1" 500 412 "-" "curl/7.79.1"\n' +
            '192.0.2.44 - - [18/Mar/2024:09:41:42 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.27"\n' +
            '198.51.100.77 - - [18/Mar/2024:09:41:55 +0800] "GET /admin HTTP/1.1" 404 153 "-" "Mozilla/5.0"\n' +
            '203.0.113.91 - - [18/Mar/2024:09:42:01 +0800] "GET /api/orders HTTP/1.1" 200 2044 "-" "curl/7.79.1"\n' +
            '203.0.113.25 - - [18/Mar/2024:09:42:07 +0800] "GET /api/orders/8813 HTTP/1.1" 500 418 "-" "curl/7.79.1"\n' +
            '203.0.113.91 - - [18/Mar/2024:09:42:15 +0800] "GET /static/app.js HTTP/1.1" 200 88213 "-" "Mozilla/5.0"\n' +
            '192.0.2.44 - - [18/Mar/2024:09:42:12 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.27"\n' +
            '203.0.113.25 - - [18/Mar/2024:09:42:30 +0800] "GET /api/orders HTTP/1.1" 200 1901 "-" "curl/7.79.1"\n' +
            '198.51.100.77 - - [18/Mar/2024:09:42:41 +0800] "GET /admin HTTP/1.1" 404 153 "-" "Mozilla/5.0"\n' +
            '203.0.113.91 - - [18/Mar/2024:09:42:52 +0800] "GET /api/orders HTTP/1.1" 200 2107 "-" "curl/7.79.1"\n' +
            '203.0.113.25 - - [18/Mar/2024:09:43:03 +0800] "GET /api/orders/8814 HTTP/1.1" 500 421 "-" "curl/7.79.1"\n'
          },
          'error.log': { $f:
            '2024/03/18 09:41:18 [error] 1842#0: *5123 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 203.0.113.25, server: web.example.com, request: "GET /api/orders/8812 HTTP/1.1", upstream: "http://10.0.1.31:8080/api/orders/8812"\n' +
            '2024/03/18 09:42:07 [error] 1842#0: *5140 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 203.0.113.25, server: web.example.com, request: "GET /api/orders/8813 HTTP/1.1", upstream: "http://10.0.1.32:8080/api/orders/8813"\n' +
            '2024/03/18 09:43:03 [error] 1842#0: *5158 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 203.0.113.25, server: web.example.com, request: "GET /api/orders/8814 HTTP/1.1", upstream: "http://10.0.1.31:8080/api/orders/8814"\n'
          }
        },
        'backup.log': { $f: '2024-03-17 03:00:04 backup started\n2024-03-17 03:12:48 backup finished, 12.4 GB uploaded\n2024-03-18 03:00:04 backup started\n2024-03-18 03:12:49 backup finished, 12.6 GB uploaded\n' },
        'health.log': { $f: '{"status":"UP","ts":"2024-03-18T09:40:02+08:00"}\n{"status":"UP","ts":"2024-03-18T09:40:32+08:00"}\n' },
        'yum.log': { $f: 'Mar 15 10:02:11 Installed: nginx-1.20.1-1.el7.x86_64\nMar 15 10:02:14 Installed: docker-ce-24.0.7-1.el7.x86_64\n' }
      },
      lib: {
        docker: { containers: {}, image: {} }
      },
      spool: {
        cron: {
          deploy: { $f: '0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1\n' }
        }
      },
      www: {
        html: {
          'index.html': { $f: '<!DOCTYPE html>\n<html>\n<head><title>My App</title></head>\n<body><h1>It works!</h1></body>\n</html>\n' },
          'health.txt': { $f: 'ok\n' }
        }
      }
    },

    data: {
      app: {
        'README.md': { $f: '# 生产应用目录\n\n- app.jar      应用主程序\n- config.yaml  配置\n- logs/        应用日志\n' },
        'app.jar': { $f: '<binary>\u0000\u0000\u0000jar-content-88MB' },
        'config.yaml': { $f: 'server:\n  port: 8080\nspring:\n  datasource:\n    url: jdbc:mysql://db-prod-01:3306/orders?useSSL=false\n    username: app\n    password: ${DB_PASSWORD}\n  redis:\n    host: cache-prod-01\n    port: 6379\nlogging:\n  file:\n    name: /opt/myapp/logs/app.log\n' },
        logs: {
          'app.log': { $f:
            '2024-03-18 09:40:02.113  INFO 1 --- [main] c.e.OrdersApplication : Started OrdersApplication in 8.42 seconds\n' +
            '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\n' +
            '2024-03-18 09:41:18.553 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : caused by: java.sql.SQLTimeoutException: Statement cancelled due to timeout\n' +
            '2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813\n' +
            '2024-03-18 09:42:07.882 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : caused by: java.sql.SQLTimeoutException: Statement cancelled due to timeout\n' +
            '2024-03-18 09:43:03.207 ERROR 1 --- [http-nio-8080-exec-2] c.e.o.OrderService : query timeout after 5000ms, orderId=8814\n'
          }
        },
        tmp: {}
      },
      backup: {
        'www-2024-03-16.tar.gz': { $f: '<binary>archive-2.1GB' },
        'www-2024-03-17.tar.gz': { $f: '<binary>archive-2.2GB' },
        'db-2024-03-17.sql.gz': { $f: '<binary>archive-840MB' },
        'db-2024-03-18.sql.gz': { $f: '<binary>archive-845MB' }
      },
      'docker': {
        overlay2: {}
      }
    },

    opt: {
      myapp: { $l: '/data/app' },
      scripts: {
        'backup.sh': { $f: '#!/bin/bash\nset -euo pipefail\nDATE=$(date +%F)\ntar czf /data/backup/www-$DATE.tar.gz /var/www/html\nobsutil cp /data/backup/www-$DATE.tar.gz obs://prod-backup/www/\necho "backup done: $DATE"\n' },
        'health-check.sh': { $f: '#!/bin/bash\ncurl -sf http://127.0.0.1:8080/health >/dev/null || systemctl restart myapp\n' }
      }
    },

    root: {
      '.ssh': {
        'id_ed25519': { $f: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz\nc2gtZWQyNTUxOQAAACBH7kQ2mNv8xLpT4rWcY1bE6sJdA9fG3hK0nR5uV2xZ8qAAAA\n-----END OPENSSH PRIVATE KEY-----\n' },
        'id_ed25519.pub': { $f: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH7kQ2mNv8xLpT4rWcY1bE6sJdA9fG3hK0nR5uV2xZ8q root@web-prod-01\n' },
        known_hosts: { $f: '10.0.2.15 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL9xK2mQv4pT8rWcY3bE7sJdA1fG5hK0nR6uV3xZ9w\n' },
        config: { $f: 'Host db-prod\n    HostName 10.0.2.15\n    User deploy\n    Port 22\n    IdentityFile ~/.ssh/id_ed25519\n' }
      },
      '.bashrc': { $f: '# .bashrc\nexport PS1="[\\u@\\h \\W]\\$ "\nalias ll="ls -alF"\nalias ..="cd .."\nexport LANG=en_US.UTF-8\n' },
      '.bash_history': { $f: 'systemctl status myapp\njournalctl -u myapp -n 100\ndocker ps -a\ntail -f /data/app/logs/app.log\n' }
    },

    tmp: {
      'top-ip.txt': { $f: '198.51.100.77\n203.0.113.25\n203.0.113.91\n' },
      'app.log': { $f: 'temp copy of app log\n' }
    },

    usr: {
      /* ⚠️ 文件名是**连字符**的 os-release（真机就是这个名字）。
         早先这里写成了下划线的 os_release，而 /etc/os-release 那个软链指向
         ../usr/lib/os-release —— 链接指向一个不存在的路径，
         `cat /etc/os-release` 永远读不到内容（看发行版是最常见的动作之一）。
         下划线那个保留着，免得别处引用它。 */
      lib: {
        'os-release': { $f: 'NAME="EulerOS"\nVERSION="2.0 (SP10)"\nID="euleros"\nVERSION_ID="2.0"\nPRETTY_NAME="EulerOS 2.0 (SP10)"\nHOME_URL="https://www.huaweicloud.com/kunpeng/compute/euleros.html"\n' },
        os_release: { $f: 'NAME="EulerOS"\nVERSION="2.0 (SP10)"\nID="euleros"\n' }
      },
      share: { zoneinfo: { Asia: { Shanghai: { $f: '<binary>tzdata' } }, UTC: { $f: '<binary>tzdata' } } }
    },

    home: {
      deploy: {
        '.bashrc': { $f: '# deploy user bashrc\nalias ll="ls -alF"\nexport EDITOR=vim\n' },
        '.ssh': {
          'authorized_keys': { $f: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH7kQ2mNv8xLpT4rWcY1bE6sJdA9fG3hK0nR5uV2xZ8q deploy@web-prod-01\n' }
        },
        'notes.txt': { $f: '上线检查清单\n1. 备份数据库\n2. 打镜像并推 SWR\n3. kubectl rollout status\n4. 看 /var/log/nginx/error.log\n' },
        work: {
          'deploy.yaml': { $f: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: my-app\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3\n        ports:\n        - containerPort: 80\n        resources:\n          requests: { cpu: 200m, memory: 256Mi }\n          limits:   { cpu: 500m, memory: 512Mi }\n        readinessProbe:\n          httpGet: { path: /healthz, port: 80 }\n          initialDelaySeconds: 5\n' }
        }
      }
    },

    run: { docker: { 'docker.sock': { $f: '<socket>' } } },
    sys: {},
    boot: {}
  };

  /* ======================= 2. 文件元数据（大小/权限/属主/时间） =======================
     为了让 ls -l / du / find -size 输出可信，给关键文件补上真实感元数据；
     没列到的文件按内容长度自动估算。 */
  var FILE_META = {
    '/etc/nginx/nginx.conf': { size: 1247, mode: '644', user: 'root', group: 'root', mtime: '2024-03-11 10:22' },
    '/etc/docker/daemon.json': { size: 286, mode: '644', user: 'root', group: 'root', mtime: '2024-03-11 10:25' },
    '/etc/systemd/system/myapp.service': { size: 342, mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 16:40' },
    '/etc/fstab': { size: 331, mode: '644', user: 'root', group: 'root', mtime: '2024-03-10 09:12' },
    '/etc/ssh/sshd_config': { size: 158, mode: '600', user: 'root', group: 'root', mtime: '2024-03-10 09:30' },
    '/etc/passwd': { size: 412, mode: '644', user: 'root', group: 'root', mtime: '2024-03-15 11:02' },
    '/etc/sudoers': { size: 148, mode: '440', user: 'root', group: 'root', mtime: '2024-03-10 09:08' },
    '/etc/crontab': { size: 274, mode: '644', user: 'root', group: 'root', mtime: '2024-03-14 20:15' },
    '/etc/resolv.conf': { size: 118, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 08:00' },
    '/etc/hosts': { size: 121, mode: '644', user: 'root', group: 'root', mtime: '2024-03-10 09:05' },
    '/root/.ssh/id_ed25519': { size: 411, mode: '600', user: 'root', group: 'root', mtime: '2024-03-09 21:14' },
    '/root/.ssh/authorized_keys': { size: 0, mode: '600', user: 'root', group: 'root', mtime: '2024-03-09 21:14' },
    '/data/app/app.jar': { size: 92274688, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/data/app/config.yaml': { size: 486, mode: '640', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' },
    '/data/app/README.md': { size: 132, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-15 14:20' },
    '/data/app/logs/app.log': { size: 165150720, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:43' },
    '/data/backup/www-2024-03-16.tar.gz': { size: 2254857830, mode: '644', user: 'root', group: 'root', mtime: '2024-03-16 03:12' },
    '/data/backup/www-2024-03-17.tar.gz': { size: 2362232012, mode: '644', user: 'root', group: 'root', mtime: '2024-03-17 03:12' },
    '/data/backup/db-2024-03-17.sql.gz': { size: 880803840, mode: '644', user: 'root', group: 'root', mtime: '2024-03-17 03:20' },
    '/data/backup/db-2024-03-18.sql.gz': { size: 886046720, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 03:20' },
    '/var/log/nginx/access.log': { size: 48234496, mode: '644', user: 'nginx', group: 'nginx', mtime: '2024-03-18 09:43' },
    '/var/log/nginx/error.log': { size: 4404019, mode: '644', user: 'nginx', group: 'nginx', mtime: '2024-03-18 09:43' },
    '/var/log/messages': { size: 8703180, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 09:41' },
    '/var/log/secure': { size: 2936012, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 09:02' },
    '/var/log/backup.log': { size: 184320, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 03:12' },
    '/opt/scripts/backup.sh': { size: 268, mode: '755', user: 'root', group: 'root', mtime: '2024-03-14 19:52' },
    '/opt/scripts/health-check.sh': { size: 108, mode: '755', user: 'root', group: 'root', mtime: '2024-03-14 19:55' },
    '/home/deploy/.ssh/authorized_keys': { size: 102, mode: '600', user: 'deploy', group: 'deploy', mtime: '2024-03-09 21:20' },
    '/home/deploy/notes.txt': { size: 176, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-16 10:05' },
    '/home/deploy/work/deploy.yaml': { size: 812, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30' },
    '/tmp/top-ip.txt': { size: 42, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:45' },
    '/tmp/app.log': { size: 23, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:46' },
    '/var/www/html/index.html': { size: 118, mode: '644', user: 'root', group: 'root', mtime: '2024-03-12 15:30' },
    '/var/www/html/health.txt': { size: 3, mode: '644', user: 'root', group: 'root', mtime: '2024-03-12 15:30' },
    '/proc/version': { size: 152, mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/cpuinfo': { size: 480, mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' },
    '/proc/meminfo': { size: 320, mode: '444', user: 'root', group: 'root', mtime: '2024-03-05 08:00' }
  };

  /* ======================= 3. Docker 状态 ======================= */

  var DOCKER = {
    images: [
      { repo: 'nginx', tag: '1.25', id: 'a8758716bb6a', size: '187MB', created: '2 weeks ago' },
      { repo: 'mysql', tag: '8.0', id: 'f1b0a4c9d2e3', size: '586MB', created: '3 weeks ago' },
      { repo: 'redis', tag: '7.2-alpine', id: '9c1d4e7f8a2b', size: '41.2MB', created: '3 weeks ago' },
      { repo: 'swr.cn-north-4.myhuaweicloud.com/myorg/web', tag: '1.2.3', id: '3e7a9b1c5d84', size: '268MB', created: '12 minutes ago' },
      { repo: 'swr.cn-north-4.myhuaweicloud.com/myorg/web', tag: '1.2.2', id: '7d2f8a3e6b91', size: '267MB', created: '2 days ago' },
      { repo: 'eclipse-temurin', tag: '17-jre', id: 'b5c8d1e4f7a2', size: '278MB', created: '5 weeks ago' },
      { repo: '<none>', tag: '<none>', id: 'd4e7f1a2b5c8', size: '268MB', created: '2 days ago' }
    ],
    containers: [
      {
        id: 'c9f2a71b3d05', name: 'web', image: 'swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3',
        command: 'java -jar app.jar', created: '12 minutes ago', status: 'Up 12 minutes', state: 'running',
        ports: '0.0.0.0:8080->8080/tcp', exitCode: 0, restartCount: 0, oomKilled: false,
        startedAt: '2024-03-18 09:38:42 +0800 CST',
        logs: [
          '2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3',
          '2024-03-18 09:38:42.113  INFO 1 --- [main] c.e.OrdersApplication : Started OrdersApplication in 8.42 seconds',
          '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812',
          '2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813',
          '2024-03-18 09:43:03.207 ERROR 1 --- [http-nio-8080-exec-2] c.e.o.OrderService : query timeout after 5000ms, orderId=8814'
        ]
      },
      {
        id: 'a1b4c7d9e206', name: 'mysql8', image: 'mysql:8.0',
        command: 'mysqld', created: '2 days ago', status: 'Up 2 days', state: 'running',
        ports: '0.0.0.0:3306->3306/tcp', exitCode: 0, restartCount: 0, oomKilled: false,
        startedAt: '2024-03-16 10:02:11 +0800 CST',
        logs: [
          '2024-03-16 10:02:11+08:00 [Note] [Entrypoint]: Entrypoint script for MySQL Server 8.0 started.',
          '2024-03-16 10:02:14+08:00 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections. Version: 8.0.36',
          '2024-03-18 09:41:18+08:00 [Warning] [MY-010055] [Server] IP address \'10.0.1.23\' could not be resolved'
        ]
      },
      {
        id: 'e3f6a9b2c508', name: 'redis', image: 'redis:7.2-alpine',
        command: 'redis-server', created: '2 days ago', status: 'Up 2 days', state: 'running',
        ports: '0.0.0.0:6379->6379/tcp', exitCode: 0, restartCount: 0, oomKilled: false,
        startedAt: '2024-03-16 10:03:40 +0800 CST',
        logs: ['1:C 16 Mar 2024 10:03:40.219 * Ready to accept connections tcp']
      },
      {
        id: 'b7c1d4e8f309', name: 'old-web', image: 'swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.2',
        command: 'java -jar app.jar', created: '2 days ago', status: 'Exited (1) 2 hours ago', state: 'exited',
        ports: '', exitCode: 1, restartCount: 7, oomKilled: false,
        error: 'driver failed programming external connectivity on endpoint old-web: Bind for 0.0.0.0:8080 failed: port is already allocated',
        startedAt: '2024-03-16 10:05:02 +0800 CST',
        logs: [
          '2024-03-16 10:05:02.114  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.2',
          '2024-03-16 10:05:03.881 ERROR 1 --- [main] c.e.OrdersApplication : Failed to bind port 8080: Address already in use',
          '2024-03-16 10:05:03.902 ERROR 1 --- [main] c.e.OrdersApplication : Application run failed'
        ]
      },
      {
        id: 'd2e5f8a1b407', name: 'debug-tmp', image: 'busybox:1.36',
        command: 'sh', created: '3 hours ago', status: 'Exited (137) 3 hours ago', state: 'exited',
        ports: '', exitCode: 137, restartCount: 0, oomKilled: true,
        startedAt: '2024-03-18 06:40:11 +0800 CST',
        logs: ['/ # wget -q -O- http://web:8080/health', 'Killed']
      }
    ],
    volumes: [
      { name: 'mysqldata', driver: 'local', mountpoint: '/var/lib/docker/volumes/mysqldata/_data', size: '4.2GB' },
      { name: 'redisdata', driver: 'local', mountpoint: '/var/lib/docker/volumes/redisdata/_data', size: '18MB' }
    ],
    networks: [
      { name: 'bridge', driver: 'bridge', scope: 'local', subnet: '172.17.0.0/16', containers: 1 },
      { name: 'host', driver: 'host', scope: 'local', subnet: '-', containers: 0 },
      { name: 'none', driver: 'null', scope: 'local', subnet: '-', containers: 0 },
      { name: 'mynet', driver: 'bridge', scope: 'local', subnet: '172.20.0.0/16', containers: 3 }
    ],
    diskUsage: { images: '1.62GB', containers: '268MB', volumes: '4.22GB', cache: '892MB' }
  };

  /* ======================= 4. Kubernetes 状态 ======================= */

  var K8S = {
    context: 'cce-cn-north-4-prod',
    /* kubeconfig 当前上下文绑定的默认命名空间 —— kubectl 不写 -n 时用它。
       这里保持真实的 default（不设成 my-app），否则会掩盖"忘写 -n"这类高频错误 */
    contextNs: 'default',
    nodeList: [
      { name: '10.0.1.23', status: 'Ready', role: 'worker', version: 'v1.27.5-r0-CCE22.9.1', age: '42d', ip: '10.0.1.23', os: 'EulerOS 2.0 (SP10)', runtime: 'containerd://1.6.20', cpu: '8', mem: '16Gi', cpuUsed: '3120m', memUsed: '8214Mi', cpuPct: '39%', memPct: '51%' },
      { name: '10.0.1.24', status: 'Ready', role: 'worker', version: 'v1.27.5-r0-CCE22.9.1', age: '42d', ip: '10.0.1.24', os: 'EulerOS 2.0 (SP10)', runtime: 'containerd://1.6.20', cpu: '8', mem: '16Gi', cpuUsed: '1180m', memUsed: '3902Mi', cpuPct: '14%', memPct: '24%' },
      { name: '10.0.1.11', status: 'Ready', role: 'control-plane', version: 'v1.27.5-r0-CCE22.9.1', age: '42d', ip: '10.0.1.11', os: 'EulerOS 2.0 (SP10)', runtime: 'containerd://1.6.20', cpu: '4', mem: '8Gi', cpuUsed: '640m', memUsed: '2456Mi', cpuPct: '16%', memPct: '30%' }
    ],
    namespaces: ['default', 'kube-system', 'kube-public', 'my-app', 'monitoring'],
    pods: [
      { ns: 'my-app', name: 'web-7d9c4b8f5-2xk9p', ready: '1/1', status: 'Running', restarts: 0, age: '12m', ip: '172.20.1.14', node: '10.0.1.23', images: 'swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3', containers: ['web'], logs: ['2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3', '2024-03-18 09:38:42.113  INFO 1 --- [main] c.e.OrdersApplication : Started OrdersApplication in 8.42 seconds', '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812'] },
      { ns: 'my-app', name: 'web-7d9c4b8f5-9q4zw', ready: '1/1', status: 'Running', restarts: 0, age: '12m', ip: '172.20.2.9', node: '10.0.1.24', images: 'swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3', containers: ['web'], logs: ['2024-03-18 09:38:35.104  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3', '2024-03-18 09:38:44.221  INFO 1 --- [main] c.e.OrdersApplication : Started OrdersApplication in 9.11 seconds'] },
      { ns: 'my-app', name: 'worker-6b8f7c9d4-m2vqt', ready: '0/1', status: 'CrashLoopBackOff', restarts: 7, age: '26m', ip: '172.20.1.22', node: '10.0.1.23', images: 'swr.cn-north-4.myhuaweicloud.com/myorg/worker:1.2.3', containers: ['worker'],
        logs: ['2024-03-18 09:20:11.002 ERROR 1 --- [main] c.e.w.WorkerApplication : Failed to connect to redis at cache-prod-01:6379', '2024-03-18 09:20:11.004 ERROR 1 --- [main] c.e.w.WorkerApplication : caused by: java.net.UnknownHostException: cache-prod-01', '2024-03-18 09:20:11.010 ERROR 1 --- [main] c.e.w.WorkerApplication : Application run failed', '2024-03-18 09:20:11.115  INFO 1 --- [main] o.s.b.w.e.tomcat.TomcatWebServer : Tomcat started on port(s): 8081'],
        prevLogs: ['2024-03-18 09:18:02.331 ERROR 1 --- [main] c.e.w.WorkerApplication : Failed to connect to redis at cache-prod-01:6379', '2024-03-18 09:18:02.333 ERROR 1 --- [main] c.e.w.WorkerApplication : caused by: java.net.UnknownHostException: cache-prod-01'],
        events: [
          { type: 'Normal', reason: 'Scheduled', msg: 'Successfully assigned my-app/worker-6b8f7c9d4-m2vqt to 10.0.1.23' },
          { type: 'Normal', reason: 'Pulled', msg: 'Container image "swr.cn-north-4.myhuaweicloud.com/myorg/worker:1.2.3" already present on machine' },
          { type: 'Normal', reason: 'Created', msg: 'Created container worker' },
          { type: 'Normal', reason: 'Started', msg: 'Started container worker' },
          { type: 'Warning', reason: 'BackOff', msg: 'Back-off restarting failed container worker in pod worker-6b8f7c9d4-m2vqt_my-app' }
        ] },
      { ns: 'my-app', name: 'batch-job-28471920-x7klm', ready: '0/1', status: 'Pending', restarts: 0, age: '4m', ip: '<none>', node: '<none>', images: 'busybox:1.36', containers: ['batch'],
        events: [
          { type: 'Warning', reason: 'FailedScheduling', msg: '0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.' }
        ] },
      { ns: 'kube-system', name: 'coredns-6d8c4cb4d8-hz8qj', ready: '1/1', status: 'Running', restarts: 0, age: '42d', ip: '172.20.0.3', node: '10.0.1.24', images: 'coredns/coredns:v1.10.1', containers: ['coredns'], logs: ['[INFO] plugin/reload: Running configuration SHA512 = 6d8c... ', '.:53', 'CoreDNS-1.10.1'] },
      { ns: 'kube-system', name: 'everest-csi-controller-6b8d9f7c4-l4nrt', ready: '1/1', status: 'Running', restarts: 0, age: '42d', ip: '172.20.2.5', node: '10.0.1.24', images: 'swr.cn-north-4.myhuaweicloud.com/cce/everest-csi-controller:2.4.25', containers: ['csi-attacher', 'csi-provisioner', 'everest-csi-controller'], logs: ['I0318 09:40:11.223] provisioner=everest.csi.huaweicloud.com started', 'I0318 09:41:02.881] volume 6f8a-2c1b attached to node 10.0.1.23'] },
      { ns: 'monitoring', name: 'prometheus-server-0', ready: '2/2', status: 'Running', restarts: 1, age: '9d', ip: '172.20.3.7', node: '10.0.1.23', images: 'prom/prometheus:v2.48.1', containers: ['prometheus', 'config-reloader'], logs: ['ts=2024-03-18T01:40:02.114Z caller=main.go:1040 level=info msg="Server is ready to receive web requests."'] },
      { ns: 'monitoring', name: 'grafana-5c7d9b6f8-tq4zp', ready: '1/1', status: 'Running', restarts: 0, age: '9d', ip: '172.20.3.8', node: '10.0.1.24', images: 'grafana/grafana:10.2.3', containers: ['grafana'], logs: ['logger=ngalert.multiorg.alertmanager t=2024-03-18T01:35:11Z level=info msg="starting MultiOrg Alertmanager"'] },
      { ns: 'default', name: 'mysql-0', ready: '1/1', status: 'Running', restarts: 0, age: '30d', ip: '172.20.1.30', node: '10.0.1.23', images: 'mysql:8.0', containers: ['mysql'], logs: ['2024-03-18 09:41:18+08:00 [Warning] [MY-010055] [Server] IP address \'172.20.1.14\' could not be resolved'] }
    ],
    deployments: [
      { ns: 'my-app', name: 'web', ready: '2/2', upToDate: 2, available: 2, age: '12m', image: 'swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3' },
      { ns: 'my-app', name: 'worker', ready: '0/1', upToDate: 1, available: 0, age: '26m', image: 'swr.cn-north-4.myhuaweicloud.com/myorg/worker:1.2.3' },
      { ns: 'kube-system', name: 'coredns', ready: '1/1', upToDate: 1, available: 1, age: '42d', image: 'coredns/coredns:v1.10.1' },
      { ns: 'monitoring', name: 'grafana', ready: '1/1', upToDate: 1, available: 1, age: '9d', image: 'grafana/grafana:10.2.3' }
    ],
    services: [
      { ns: 'my-app', name: 'web', type: 'ClusterIP', clusterIP: '10.247.13.88', externalIP: '<none>', ports: '80/TCP', age: '30d', selector: 'app=web' },
      { ns: 'my-app', name: 'web-nodeport', type: 'NodePort', clusterIP: '10.247.13.91', externalIP: '<none>', ports: '80:30080/TCP', age: '30d', selector: 'app=web' },
      { ns: 'my-app', name: 'web-lb', type: 'LoadBalancer', clusterIP: '10.247.13.95', externalIP: '121.36.44.17', ports: '80:30112/TCP', age: '6d', selector: 'app=web' },
      { ns: 'default', name: 'kubernetes', type: 'ClusterIP', clusterIP: '10.247.0.1', externalIP: '<none>', ports: '443/TCP', age: '42d', selector: '<none>' },
      { ns: 'default', name: 'mysql', type: 'ClusterIP', clusterIP: '10.247.8.20', externalIP: '<none>', ports: '3306/TCP', age: '30d', selector: 'app=mysql' }
    ],
    endpoints: [
      { ns: 'my-app', name: 'web', endpoints: '172.20.1.14:8080,172.20.2.9:8080' },
      { ns: 'my-app', name: 'worker', endpoints: '<none>' },
      { ns: 'my-app', name: 'web-nodeport', endpoints: '172.20.1.14:8080,172.20.2.9:8080' },
      { ns: 'default', name: 'mysql', endpoints: '172.20.1.30:3306' },
      { ns: 'default', name: 'kubernetes', endpoints: '10.0.1.11:5443' }
    ],
    pvcs: [
      { ns: 'my-app', name: 'app-data', status: 'Bound', volume: 'pvc-6f8a2c1b-9d4e-4a71', capacity: '100Gi', accessModes: 'RWO', storageClass: 'csi-disk', age: '30d' },
      { ns: 'default', name: 'mysql-data', status: 'Bound', volume: 'pvc-2b1c9d4e-71a3-4f88', capacity: '500Gi', accessModes: 'RWO', storageClass: 'csi-disk-ssd', age: '30d' },
      { ns: 'my-app', name: 'logs-pvc', status: 'Pending', volume: '', capacity: '', accessModes: 'RWX', storageClass: 'csi-nas', age: '8m' }
    ],
    events: [
      { time: '3m12s', type: 'Warning', reason: 'FailedScheduling', obj: 'pod/batch-job-28471920-x7klm', msg: '0/3 nodes are available: 2 Insufficient cpu.' },
      { time: '4m01s', type: 'Warning', reason: 'BackOff', obj: 'pod/worker-6b8f7c9d4-m2vqt', msg: 'Back-off restarting failed container worker' },
      { time: '6m40s', type: 'Normal', reason: 'Pulled', obj: 'pod/web-7d9c4b8f5-2xk9p', msg: 'Container image "swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3" already present on machine' },
      { time: '8m20s', type: 'Warning', reason: 'ProvisioningFailed', obj: 'persistentvolumeclaim/logs-pvc', msg: 'failed to provision volume with StorageClass "csi-nas": no available NAS mount point' },
      { time: '12m05s', type: 'Normal', reason: 'ScalingReplicaSet', obj: 'deployment/web', msg: 'Scaled up replica set web-7d9c4b8f5 to 2' },
      { time: '26m11s', type: 'Warning', reason: 'Unhealthy', obj: 'pod/worker-6b8f7c9d4-m2vqt', msg: 'Readiness probe failed: Get "http://172.20.1.22:8081/healthz": dial tcp 172.20.1.22:8081: connect: connection refused' }
    ]
  };

  /* ======================= 5. 系统服务与监听端口 ======================= */

  var SERVICES = {
    'myapp': { load: 'loaded', active: 'active (running)', since: '2024-03-18 09:38:42 CST; 12min ago', pid: '18442', mem: '612.4M', desc: 'My Web App' },
    'nginx': { load: 'loaded', active: 'active (running)', since: '2024-03-16 10:01:55 CST; 2 days ago', pid: '1842', mem: '18.6M', desc: 'The nginx HTTP and reverse proxy server' },
    'docker': { load: 'loaded', active: 'active (running)', since: '2024-03-16 10:00:12 CST; 2 days ago', pid: '1204', mem: '142.8M', desc: 'Docker Application Container Engine' },
    'mysqld': { load: 'loaded', active: 'active (running)', since: '2024-03-16 10:02:11 CST; 2 days ago', pid: '2210', mem: '1.8G', desc: 'MySQL Server' },
    'firewalld': { load: 'loaded', active: 'inactive (dead)', since: '', pid: '', mem: '', desc: 'firewalld - dynamic firewall daemon' },
    'redis': { load: 'not-found', active: 'inactive (dead)', since: '', pid: '', mem: '', desc: 'Redis persistent key-value database' }
  };

  var LISTEN_PORTS = [
    { proto: 'tcp', state: 'LISTEN', recvq: 0, sendq: 0, local: '0.0.0.0:22', peer: '0.0.0.0:*', proc: 'sshd', pid: 1180 },
    { proto: 'tcp', state: 'LISTEN', recvq: 0, sendq: 0, local: '0.0.0.0:80', peer: '0.0.0.0:*', proc: 'nginx', pid: 1842 },
    { proto: 'tcp', state: 'LISTEN', recvq: 0, sendq: 0, local: '0.0.0.0:8080', peer: '0.0.0.0:*', proc: 'java', pid: 18442 },
    { proto: 'tcp', state: 'LISTEN', recvq: 0, sendq: 0, local: '0.0.0.0:3306', peer: '0.0.0.0:*', proc: 'mysqld', pid: 2210 },
    { proto: 'tcp', state: 'LISTEN', recvq: 0, sendq: 0, local: '127.0.0.1:6379', peer: '0.0.0.0:*', proc: 'redis-server', pid: 3390 },
    { proto: 'tcp', state: 'LISTEN', recvq: 0, sendq: 0, local: '127.0.0.1:9100', peer: '0.0.0.0:*', proc: 'node_exporter', pid: 4102 },
    { proto: 'udp', state: 'UNCONN', recvq: 0, sendq: 0, local: '127.0.0.1:323', peer: '0.0.0.0:*', proc: 'chronyd', pid: 990 }
  ];

  var ESTABLISHED = [
    { proto: 'tcp', state: 'ESTAB', recvq: 0, sendq: 0, local: '10.0.1.23:22', peer: '203.0.113.25:51234', proc: 'sshd', pid: 18442 },
    { proto: 'tcp', state: 'ESTAB', recvq: 0, sendq: 0, local: '10.0.1.23:80', peer: '203.0.113.91:40218', proc: 'nginx', pid: 1842 },
    { proto: 'tcp', state: 'ESTAB', recvq: 0, sendq: 0, local: '10.0.1.23:80', peer: '203.0.113.25:51390', proc: 'nginx', pid: 1842 },
    { proto: 'tcp', state: 'ESTAB', recvq: 0, sendq: 0, local: '10.0.1.23:8080', peer: '10.0.1.23:44882', proc: 'java', pid: 18442 },
    { proto: 'tcp', state: 'TIME-WAIT', recvq: 0, sendq: 0, local: '10.0.1.23:8080', peer: '10.0.1.31:51200', proc: '-', pid: 0 },
    { proto: 'tcp', state: 'TIME-WAIT', recvq: 0, sendq: 0, local: '10.0.1.23:8080', peer: '10.0.1.32:51188', proc: '-', pid: 0 }
  ];

  var DISK_USAGE = [
    { fs: '/dev/vda1', size: '40G', used: '12G', avail: '26G', usePct: '32%', mount: '/' },
    { fs: '/dev/vdb1', size: '200G', used: '189G', avail: '1.2G', usePct: '100%', mount: '/data' },
    { fs: 'tmpfs', size: '3.9G', used: '0', avail: '3.9G', usePct: '0%', mount: '/dev/shm' },
    { fs: '/dev/vdc1', size: '100G', used: '18G', avail: '77G', usePct: '19%', mount: '/var/lib/docker' }
  ];

  var INODES = [
    { fs: '/dev/vda1', inodes: '2621440', iused: '312884', ifree: '2308556', iusePct: '12%', mount: '/' },
    { fs: '/dev/vdb1', inodes: '13107200', iused: '13098233', ifree: '8967', iusePct: '100%', mount: '/data' }
  ];

  window.CC_TERM_FS = {
    spec: FS_SPEC,
    fileMeta: FILE_META,
    docker: DOCKER,
    k8s: K8S,
    services: SERVICES,
    listen: LISTEN_PORTS,
    established: ESTABLISHED,
    disk: DISK_USAGE,
    inodes: INODES,
    host: { hostname: 'web-prod-01', user: 'root', home: '/root', ip: '10.0.1.23', eip: '121.36.44.17', region: 'cn-north-4', kernel: '5.10.0-60.18.0.50.oe2203.x86_64' }
  };
})();
