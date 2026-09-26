/* assets/js/fs-extra.js · 模拟文件系统的**第二批夹具**（B 档命令的前置条件）
   --------------------------------------------------------------------------
   为什么单独一个文件：`data/termfs.js` 是"这台机器长什么样"的**权威定义**，
   改它要动那个大对象；而这里补的是**为了让命令示例跑得起来**所需的素材
   （镜像文件、压缩包、软链、密钥、样本图片…），性质上属于"教学夹具"。
   用 `CC_SHELL.fsAdd` 挂上去，父目录自动创建、**同名先到先得**，
   所以它永远不会覆盖 termfs 里已有的东西。

   ⚠️ 为什么必须先补夹具再实现命令：
   `example-check` 对"引擎未实现"的命令是**跳过**（不算失败），
   一旦实现了，它的示例就变成**真跑**。所以命令和夹具必须一起上，
   否则结果是**把"跳过"变成"失败"**。
   本文件对应的命令：readlink realpath sha256sum cmp gunzip xz zstd split
   alias install rename zip unzip tac —— 见 assets/js/cmd-basic3.js。

   物理事实与 termfs 对齐，不另造一套：
     /data 是 200G 数据盘（vdb1）、/data/app 是订单服务、/data/backup 是备份目录。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.fsAdd) return;

  /* 反复用的时间戳：与 termfs 里其它文件的 mtime 风格保持一致 */
  var T = '2024-03-18 09:00';

  window.CC_SHELL.fsAdd({

    /* ==================== 发布目录与版本软链 ====================
       `readlink` / `realpath` 的教学点就是"current 指向哪个版本"，
       没有这条软链，这两条命令的示例全都跑不起来。 */
    '/data/app/releases': { type: 'dir' },
    /* ⚠️ v1.2.0 / v1.3.0 必须存在：`lb-ln` 的示例会
         ln -s  /data/app/releases/v1.2.0 /data/app/current
         ln -sfn /data/app/releases/v1.3.0 /data/app/current
       把 current 切到这两版；而后面 `lb-readlink` 的
         readlink -e /data/app/current/conf/app.yml
       要求 current/conf/app.yml **真实存在**。少一版就会连环失败 ——
       这正是"共享夹具要满足整条剧情线"的意思。 */
    '/data/app/releases/v1.2.0': { type: 'dir' },
    '/data/app/releases/v1.2.0/conf': { type: 'dir' },
    '/data/app/releases/v1.2.0/conf/app.yml': {
      content: 'app:\n  name: order-api\n  port: 8080\n  db:\n    host: db-prod-01\n    name: orderdb\nlogging:\n  level: info\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-02-20 11:05'
    },
    '/data/app/releases/v1.3.0': { type: 'dir' },
    '/data/app/releases/v1.3.0/conf': { type: 'dir' },
    '/data/app/releases/v1.3.0/conf/app.yml': {
      content: 'app:\n  name: order-api\n  port: 8080\n  db:\n    host: db-prod-01\n    name: orderdb\nlogging:\n  level: info\n  file: /data/app/logs/app.log\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-05 16:30'
    },
    '/data/app/releases/v2.3.0': { type: 'dir' },
    '/data/app/releases/v2.3.1': { type: 'dir' },
    '/data/app/releases/v2.3.1/conf': { type: 'dir' },
    '/data/app/releases/v2.3.1/conf/app.yml': {
      content: 'app:\n  name: order-api\n  port: 8080\n  db:\n    host: db-prod-01\n    name: orderdb\nlogging:\n  level: info\n  file: /var/log/app/app.log\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-17 21:40'
    },
    '/data/app/releases/v2.3.1/app.jar': {
      content: '（仿真的 Spring Boot 可执行 jar：订单服务 v2.3.1）\n', size: 48234496,
      mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-17 21:40'
    },
    '/data/app/releases/v2.3.0/conf': { type: 'dir' },
    '/data/app/releases/v2.3.0/conf/app.yml': {
      content: 'app:\n  name: order-api\n  port: 8080\n  db:\n    host: db-prod-01\n    name: orderdb\nlogging:\n  level: warn\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-10 20:15'
    },
    /* ⚠️ 这条软链是 readlink / realpath 两课的核心素材 */
    '/data/app/current': { type: 'link', target: '/data/app/releases/v2.3.1' },

    /* ==================== 构建产物（install 的源） ==================== */
    '/data/build': { type: 'dir' },
    '/data/build/app': {
      content: '（仿真的二进制：order-api 构建产物）\n', size: 12582912,
      mode: '755', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/build/app.conf': {
      content: 'server.port=8080\nspring.datasource.url=jdbc:mysql://db-prod-01:3306/orderdb\nlogging.file.name=/var/log/app/app.log\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/build/app.tar.gz': {
      content: '（仿真的 tar.gz：order-api 发布包）\n', gz: true, size: 8388608,
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },

    /* ==================== 镜像与校验（sha256sum / cmp 的素材） ====================
       两个 .qcow2 刻意做成**内容不同**：`cmp` 的教学点就是"报出第一处不同在哪"。 */
    '/data/iso': { type: 'dir' },
    '/data/iso/CentOS-7-x86_64-Minimal-2009.iso': {
      content: '（仿真的 CentOS 7 最小化安装镜像）\n', size: 1073741824,
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-01 10:00'
    },
    '/data/img': { type: 'dir' },
    '/data/img/a.qcow2': {
      content: 'QFI\xfb（仿真 qcow2 头）\nvirtual-size: 40G\nbacking: none\n',
      size: 21474836480, mode: '644', user: 'root', group: 'root', mtime: '2024-03-12 14:20'
    },
    '/data/img/b.qcow2': {
      content: 'QFI\xfb（仿真 qcow2 头）\nvirtual-size: 40G\nbacking: /data/img/base.qcow2\n',
      size: 21474836480, mode: '644', user: 'root', group: 'root', mtime: '2024-03-12 14:25'
    },

    /* ==================== 压缩包（gunzip / xz / zstd / split 的素材） ==================== */
    '/data/backup/db.sql': {
      content: '-- orderdb 逻辑备份\nCREATE TABLE `orders` (id bigint, user_id bigint, amount decimal(10,2));\nINSERT INTO `orders` VALUES (8812,1024,199.00);\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 02:00'
    },
    '/data/backup/db.sql.gz': {
      content: '-- orderdb 逻辑备份（gzip 压缩）\nCREATE TABLE `orders` (id bigint, user_id bigint, amount decimal(10,2));\nINSERT INTO `orders` VALUES (8812,1024,199.00);\n',
      gz: true, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 02:00'
    },
    '/data/backup/db.sql.xz': {
      content: '-- orderdb 逻辑备份（xz 压缩）\n', gz: true, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 02:00'
    },
    '/data/backup/db.sql.zst': {
      content: '-- orderdb 逻辑备份（zstd 压缩）\n', gz: true, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 02:00'
    },
    '/data/backup/app.log.gz': {
      content: '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\n',
      gz: true, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:45'
    },
    '/data/backup/db.tar.gz': {
      content: '（仿真的 tar.gz：orderdb 物理备份）\n', gz: true, size: 1073741824,
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 02:10'
    },
    '/data/backup/app.tar.gz': {
      content: '（仿真的 tar.gz：order-api 发布包快照）\n', gz: true, size: 8388608,
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/restore': { type: 'dir' },
    /* 大文件切片（split 的素材）：/data/x 与 /data/logs/all-ids.txt */
    '/data/x': {
      content: '（仿真的 350M 大文件，用于演示 split 切片）\n', size: 367001600,
      mode: '644', user: 'root', group: 'root', mtime: T
    },
    '/data/logs/all-ids.txt': {
      content: '8812\n8813\n8814\n8815\n8816\n8817\n8818\n8819\n8820\n8821\n',
      size: 52428800, mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* lb-split 示例 3：把大日志平均切成 4 份 */
    '/data/logs/big.log': {
      content: '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\n'
        + '2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813\n'
        + '2024-03-18 09:43:03.114 ERROR 1 --- [http-nio-8080-exec-12] c.e.o.OrderService : query timeout after 5000ms, orderId=8814\n'
        + '2024-03-18 09:47:41.114 ERROR 1 --- [http-nio-8080-exec-17] c.e.o.OrderService : query timeout after 5000ms, orderId=8819\n',
      size: 524288000, mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* 订单服务日志：mo-log-tail / sh-quotes 等示例都在读它 */
    '/data/app/logs/app.log': {
      content: '2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3\n'
        + '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\n'
        + '2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* lu-chmod 的示例 chmod 600 ~/.ssh/id_rsa 需要这个文件 */
    '/root/.ssh/id_rsa': {
      content: '-----BEGIN OPENSSH PRIVATE KEY-----\n（仿真私钥：教学环境不生成真实密钥）\n-----END OPENSSH PRIVATE KEY-----\n',
      mode: '600', user: 'root', group: 'root', mtime: T
    },

    /* ==================== 批量重命名的素材（rename） ==================== */
    '/data/photos': { type: 'dir' },
    '/data/photos/IMG_0001.jpg': {
      content: '（仿真相片 1）\n', size: 3145728, mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/photos/IMG_0002.jpg': {
      content: '（仿真相片 2）\n', size: 3355443, mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/upload/photo-01.jpeg': {
      content: '（仿真相片：photo-01）\n', size: 2097152, mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/upload/photo-02.jpeg': {
      content: '（仿真相片：photo-02）\n', size: 2202009, mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },

    /* ==================== zip / unzip 的素材 ====================
       `/data/dist/site.zip` 用**与 cmd-basic3.js 的 zip 相同的格式**写成，
       这样 `unzip -l /data/dist/site.zip`（站内示例）看得到真实清单，
       而不是一句固定的假输出。格式见 cmd-basic3.js 顶部说明。 */
    '/data/conf': { type: 'dir' },
    '/data/conf/db.conf': {
      content: '[client]\nhost=db-prod-01\nport=3306\nuser=orderapp\ndatabase=orderdb\n',
      mode: '600', user: 'root', group: 'root', mtime: T
    },
    '/data/dist/site.zip': {
      content: 'ZIPSIM1\n' + JSON.stringify([
        { n: 'index.html', s: 241, c: '<!doctype html><title>CloudCmd 演示站</title>\n' },
        { n: 'css/app.css', s: 1024, c: 'body{font-family:system-ui}\n' },
        { n: 'health.txt', s: 12, c: 'ok\n' }
      ]),
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },

    /* ==================== 编码与换行（iconv / dos2unix 的素材） ====================
       ⚠️ 仿真里没有真实字节流，所以这两个命令**不真的转码 / 不真的改行尾**，
       只翻转节点上的标记（`__encoding` / `__crlf`）并说明原因。
       给它们夹具是为了让示例里的路径真实存在、`cat`/`file` 能读到内容。 */
    '/opt/app/config': { type: 'dir' },
    '/opt/app/conf/gbk.sql': {
      content: '-- 订单库导出（Windows 端 mysqldump 打的包，GBK 编码）\nCREATE TABLE `orders` (id bigint, user_id bigint);\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/opt/app/bin': { type: 'dir' },
    '/opt/app/bin/start.sh': {
      content: '#!/bin/bash\r\n# Windows 编辑器保存过，行尾是 CRLF\r\ncd /opt/app && exec java -jar app.jar\r\n',
      mode: '755', user: 'deploy', group: 'deploy', mtime: T
    },
    '/opt/app/data': { type: 'dir' },
    '/opt/app/data/ips.txt': {
      content: '10.0.1.21\n10.0.1.22\n10.0.1.24\n10.0.1.31\n10.0.1.32\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/opt/app/data/deployment.yaml': {
      content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: order-api\n  namespace: prod\nspec:\n  replicas: 2\n  template:\n    spec:\n      containers:\n        - name: order-api\n          image: swr.cn-north-4.myhuaweicloud.com/prod/order-api:1.2.3\n          ports:\n            - containerPort: 8080\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* 客户名单（GBK 转码示例的"另一头"） */
    '/opt/app/data/names.csv': {
      content: '1024,张三\n1025,李四\n1026,王五\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* ── paste / join 的成对夹具 ──
       这两个命令的示例原本写的是进程替换 `<(cut …)` / `<(sort …)`，
       而引擎不支持进程替换（那是"把命令输出变成一个文件"的语法）。
       给它们配**真实的已排序文件**，示例就能两步走：先 `sort -o` 落盘，再 join。
       这比"为几条示例实现进程替换"划算得多，而且更接近真机上写脚本的做法。 */
    '/opt/app/data/ips.csv': {
      content: '10.0.1.21,web-01\n10.0.1.22,web-02\n10.0.1.24,db-01\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/opt/app/data/hostnames.csv': {
      content: '10.0.1.21,web-prod-01\n10.0.1.22,web-prod-02\n10.0.1.31,cache-01\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/opt/app/data/users.txt': {
      content: '1024 zhangsan\n1025 lisi\n1026 wangwu\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/opt/app/data/orders.txt': {
      content: '1024 8812 199.00\n1024 8813 88.50\n1026 8819 260.00\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* `paste -d, <(cut -d: -f1 /etc/passwd) <(cut -d: -f7 /etc/passwd)` 的替代素材：
       两列分别落成文件（真机上这个例子的意图就是"把两列拼成 CSV"） */
    '/opt/app/data/passwd-users.txt': {
      content: 'root\nnginx\nmysql\ntomcat\ndeploy\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/opt/app/data/passwd-shells.txt': {
      content: '/bin/bash\n/sbin/nologin\n/bin/false\n/sbin/nologin\n/bin/bash\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/app/batch.txt': {
      content: 'job-1001;order;import;ok\njob-1002;order;export;ok\njob-1003;user;cleanup;ok\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* `alias` 命令会把别名写进这个文件；`source ~/.bashrc` 是站内讲过的写法 */
    '/root/.bashrc': {
      content: '# .bashrc\nalias ll=\'ls -alh\'\nalias la=\'ls -A\'\n',
      mode: '644', user: 'root', group: 'root', mtime: T
    },
    '/root/.ssh': { type: 'dir', mode: '700', user: 'root', group: 'root', mtime: T },
    '/root/.ssh/id_ed25519': {
      content: '-----BEGIN OPENSSH PRIVATE KEY-----\n（仿真私钥：教学环境不生成真实密钥）\n-----END OPENSSH PRIVATE KEY-----\n',
      mode: '600', user: 'root', group: 'root', mtime: T
    },
    '/root/.ssh/id_ed25519.pub': {
      content: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI（仿真公钥） root@web-prod-01\n',
      mode: '644', user: 'root', group: 'root', mtime: T
    },
    '/root/.ssh/known_hosts': {
      content: '10.0.1.21 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI（仿真）\n10.0.1.22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI（仿真）\n',
      mode: '644', user: 'root', group: 'root', mtime: T
    },
    '/data/scripts': { type: 'dir' },
    '/data/scripts/upload.txt': {
      content: 'order-20240317.tar.gz\norder-20240318.tar.gz\n', mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* ⚠️ `/opt/myapp` 在 termfs 里是**指向 /data/app 的软链**，
       所以这两个脚本要按真实位置放在 /data/app 下 ——
       用 `/opt/myapp/start.sh` 也能读到（走软链），但不能往软链下面"新建"文件。 */
    '/data/app/start.sh': {
      content: '#!/bin/bash\ncd /data/app/current && exec java -jar app.jar\n',
      mode: '755', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/app/batch.sh': {
      content: '#!/bin/bash\n# 批量对账\nfor id in $(seq 1 100); do echo "对账 $id"; done\n',
      mode: '755', user: 'deploy', group: 'deploy', mtime: T
    },

    /* ==================== 脚本与其它常用素材 ==================== */

    /* ==================== 收尾：补齐内容里引用到的路径 ====================
       下面这些不是"为了某条命令"补的，而是**内容里已经写了、文件系统里却没有**，
       于是示例报 `No such file or directory`。逐条都有出处：

         /etc/nginx/nginx.conf.bak         ← lb-diff「和改之前的配置比一比」
         /data/dist/release.key|.pub       ← sec-openssl-dgst「对发布包签名/验签」
         /data/app/stubborn-task.sh        ← sh-timeout「卡住的任务要强制杀」
         /var/log/batch-20240318/*.out     ← sh-template-batch-ssh「逐台收集结果」
         /opt/tomcat/bin/setenv.sh         ← mw-tomcat-context「JVM 参数写在哪」
         /var/lib/docker/containers/…      ← dk-container-logs-size「日志把磁盘写满」
         /usr/lib/jvm/java-17-openjdk/bin/java ← sh-var-export「JAVA_HOME 要指到哪」
         /var/log/app.log                  ← sh-quotes / 多处 grep 日志的示例
         /var/log/tomcat/catalina.out      ← lt-zgrep-r「在归档日志里捞异常」

       ⚠️ nginx.conf.bak 要**故意和现役配置有几处不同**，否则 `diff -u` 没输出，
       学员看不出"改配置前后到底差在哪"—— 那才是这条示例的教学点。 */
    '/etc/nginx/nginx.conf.bak': {
      content: 'user  nginx;\nworker_processes  auto;\nworker_connections  1024;\n'
        + 'keepalive_timeout  65;\nclient_max_body_size 10m;\n'
        + 'access_log  /var/log/nginx/access.log  main;\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-11 10:20'
    },
    '/data/dist/release.key': {
      content: '-----BEGIN PRIVATE KEY-----\n（仿真签名私钥：教学环境不生成真实密钥）\n-----END PRIVATE KEY-----\n',
      mode: '600', user: 'root', group: 'root', mtime: T
    },
    '/data/dist/release.pub': {
      content: '-----BEGIN PUBLIC KEY-----\n（仿真验签公钥）\n-----END PUBLIC KEY-----\n',
      mode: '644', user: 'root', group: 'root', mtime: T
    },
    /* openssl dgst 签名示例用的"待签名发布包"（与 app-1.2.3.tar.gz 同一个包，
       只是示例里用的是不带版本号的通用名） */
    '/data/dist/app.tar.gz': {
      content: '（仿真的发布包：order-api 构建产物）\n', gz: true, size: 19300000,
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    /* 把 kubectl 的输出落盘再做 jq 分析（lt-jq 的示例这么写） */
    '/data/k8s': { type: 'dir' },
    /* ── kubectl 的清单文件 ──
       `kubectl apply -f` / `kubectl diff -f` / `kubectl replace -f` 的示例都引用它。
       内容要和集群里的实际对象**有差异**，否则 diff 没有输出，
       学员看不到"这次发布到底会改什么"（那正是 diff 的教学点）。 */
    '/data/k8s/deploy.yaml': {
      content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: my-app\n'
        + 'spec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: web\n  template:\n'
        + '    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n'
        + '        - name: web\n          image: nginx:1.25\n          ports:\n            - containerPort: 80\n'
        + '          resources:\n            requests:\n              cpu: 100m\n              memory: 128Mi\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/k8s/svc.yaml': {
      content: 'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\n  namespace: my-app\n'
        + 'spec:\n  type: ClusterIP\n  selector:\n    app: web\n  ports:\n    - port: 80\n      targetPort: 80\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/data/app/stubborn-task.sh': {
      content: '#!/bin/bash\n# 故意的"卡住不动"的任务：验证 timeout 与 kill -9 的区别\nwhile true; do sleep 60; done\n',
      mode: '755', user: 'deploy', group: 'deploy', mtime: T
    },
    '/var/log/batch-20240318': { type: 'dir' },
    '/var/log/batch-20240318/10.0.1.21.out': {
      content: 'web-prod-01\nup 42 days,  6:11,  1 user,  load average: 0.08, 0.12, 0.09\n',
      mode: '644', user: 'ops', group: 'ops', mtime: '2024-03-18 09:30'
    },
    '/var/log/batch-20240318/10.0.1.22.out': {
      content: 'cache-01\nup 42 days,  6:11,  1 user,  load average: 0.21, 0.18, 0.15\n',
      mode: '644', user: 'ops', group: 'ops', mtime: '2024-03-18 09:30'
    },
    '/opt/tomcat/bin/setenv.sh': {
      content: '#!/bin/bash\n# Tomcat 的 JVM 参数入口：catalina.sh 会自动 source 这个文件\nexport CATALINA_OPTS="$CATALINA_OPTS -Xms2g -Xmx2g -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/heapdump"\n'
        + 'export JAVA_OPTS="$JAVA_OPTS -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Shanghai"\n',
      mode: '755', user: 'tomcat', group: 'tomcat', mtime: T
    },
    '/var/lib/docker/containers/3f2a9c1e8b7d4a6f0e5c2b9d8a7f6e5d': { type: 'dir' },
    '/var/lib/docker/containers/3f2a9c1e8b7d4a6f0e5c2b9d8a7f6e5d/3f2a9c1e8b7d4a6f0e5c2b9d8a7f6e5d-json.log': {
      content: '{"log":"2024-03-18T09:38:33.902Z INFO 服务已启动\\n","stream":"stdout","time":"2024-03-18T09:38:33.902Z"}\n'
        + '{"log":"2024-03-18T09:41:18.552Z ERROR 查询超时 orderId=8812\\n","stream":"stderr","time":"2024-03-18T09:41:18.552Z"}\n',
      size: 2147483648, mode: '640', user: 'root', group: 'root', mtime: T
    },
    '/var/lib/docker/containers/7a1b3c5d9e2f4a6b8c0d1e3f5a7b9c0d': { type: 'dir' },
    '/var/lib/docker/containers/7a1b3c5d9e2f4a6b8c0d1e3f5a7b9c0d/7a1b3c5d9e2f4a6b8c0d1e3f5a7b9c0d-json.log': {
      content: '{"log":"2024-03-18T09:20:11.001Z INFO ready\\n","stream":"stdout","time":"2024-03-18T09:20:11.001Z"}\n',
      size: 536870912, mode: '640', user: 'root', group: 'root', mtime: T
    },
    '/usr/lib/jvm/java-17-openjdk/bin/java': {
      content: '（仿真 JDK 17 的 java 可执行文件；教学终端不会真的运行 JVM）\n',
      mode: '755', user: 'root', group: 'root', mtime: T
    },
    '/var/log/app.log': {
      content: '2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3\n'
        + '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\n'
        + '2024-03-18 09:41:19.114  WARN 1 --- [http-nio-8080-exec-5] c.e.o.OrderService : retry 1/3 for orderId=8812\n'
        + '2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813\n',
      mode: '644', user: 'deploy', group: 'deploy', mtime: T
    },
    '/var/log/tomcat': { type: 'dir' },
    /* etcd 快照：`k8s-etcdctl-snapshot-save` 会把它"存"出来，
       而 `k8s-etcdctl-snapshot-restore` 要**读**它做恢复演练。
       两条是不同记录、各自一个 shell，所以不能指望前者替后者准备文件
       —— 直接放一份在夹具里，恢复演练才有东西可恢复。 */
    '/var/backups': { type: 'dir' },
    '/var/backups/etcd-20240601.db': {
      content: '（仿真的 etcd 快照：v3 格式，约 42MB）\n', size: 44040192,
      mode: '600', user: 'root', group: 'root', mtime: '2024-06-01 03:00:12'
    },    '/var/log/tomcat/catalina.out': {
      content: '18-Mar-2024 09:38:31.002 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server version name:   Apache Tomcat/9.0.85\n'
        + '18-Mar-2024 09:38:33.114 INFO [main] org.apache.catalina.core.StandardEngine.startInternal Starting Servlet engine: [Apache Tomcat/9.0.85]\n'
        + '18-Mar-2024 09:41:20.552 SEVERE [http-nio-8080-exec-4] org.apache.catalina.core.StandardWrapperValve.invoke Servlet.service() for servlet [order] threw exception\n'
        + 'java.lang.NullPointerException: Cannot invoke "com.example.Order.getId()" because "order" is null\n'
        + '\tat com.example.web.OrderServlet.doGet(OrderServlet.java:88)\n',
      size: 104857600, mode: '640', user: 'tomcat', group: 'tomcat', mtime: T
    },
    '/var/log/tomcat/tomcat-2024-03-17.log.gz': {
      content: '17-Mar-2024 22:10:02.331 SEVERE [http-nio-8080-exec-7] java.lang.NullPointerException: legacy NPE from yesterday\n',
      gz: true, mode: '640', user: 'tomcat', group: 'tomcat', mtime: '2024-03-17 23:59'
    },
    /* 影子口令文件是每台 Linux 都有的，而 termfs 里没有它 ——
       于是 lu-stat 的示例 `stat -c "%a %U:%G %n" /etc/passwd /etc/shadow`
       在前者成功、后者报 No such file。权限检查的教学点恰恰是
       "影子文件的权限必须是 000 或 640，绝不能是 644"，
       所以这个文件必须有（内容用占位，不模拟真实口令哈希）。
       （本注释原先把路径用粗体括起来写，结果"星号加斜杠"提前闭合了块注释 ——
       这个坑本项目已经踩过四次，块注释里出现路径时一律不要加粗。） */
    '/etc/shadow': {
      content: 'root:$6$（仿真口令哈希，教学环境不生成真实哈希）:19762:0:99999:7:::\n'
        + 'bin:*:19300:0:99999:7:::\n'
        + 'deploy:$6$（仿真口令哈希）:19780:0:99999:7:::\n'
        + 'nginx:!!:19780:0:99999:7:::\n',
      mode: '000', user: 'root', group: 'root', mtime: T
    },
    '/etc/gshadow': {
      content: 'root:::\nwheel:::\ndocker:!::deploy\n',
      mode: '000', user: 'root', group: 'root', mtime: T
    },
    /* /etc/group 也必须补齐：`getent group wheel` 原先读的是自己的小表，
       而 `cat /etc/group` 什么都没有 —— 于是 `id deploy` 算不出附加组，
       而"这个账号在哪些组里"正是权限排查最关键的一步
       （lu-who-can-sudo 那节课要学员看的就是 groups= 后面那一串）。
       成员写法按真实格式：组名:口令占位:GID:成员列表（逗号分隔）。 */
    '/etc/group': {
      content: 'root:x:0:\n'
        + 'wheel:x:10:deploy\n'
        + 'docker:x:983:deploy,ops\n'
        + 'nginx:x:986:\n'
        + 'tomcat:x:987:\n'
        + 'mysql:x:988:\n'
        + 'deploy:x:1000:\n',
      mode: '644', user: 'root', group: 'root', mtime: T
    },
  });

  /* 把相对路径的便捷写法也挂上：`readlink ~/.ssh/id_ed25519.pub` 之类
     （resolvePath 只认绝对路径，`~` 会由 shell 展开成 /root，所以不用额外处理） */
})();
