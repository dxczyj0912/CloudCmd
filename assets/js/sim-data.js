/* assets/js/sim-data.js · 模拟文件系统的补充数据
   --------------------------------------------------------------------------
   termfs.js 是终端环境的"主机快照"，但内容里引用的一些文件（轮转日志、证书、
   manifest、镜像、GC 日志……）并不在里面。缺文件会让学员照着示例敲出
   "No such file or directory" —— 示例就不再可信。

   这里只放**文件**，不放命令实现。写法：
     window.CC_SHELL.fsAdd({
       "/var/log/nginx/access.log-20240317.gz": { content: "...", gz: true, size: 8*1024*1024,
                                                  mode: "644", user: "nginx", mtime: "2024-03-17 03:12" }
     });
   --------------------------------------------------------------------------
   写作约定（新增数据请沿用）：
     · 内容必须是"这个文件真会有的格式"：nginx 用 combined 格式、MySQL 慢查询用
       `# Time: / # Query_time:`、YAML 就是 YAML、sysctl 就是 `key = value`。
     · 数值与剧情对齐：/data 盘 100% 已满、error.log 里是 upstream timed out、
       应用日志里是 query timeout after 5000ms、Pod worker-6b8f7c9d4-m2vqt CrashLoop。
     · gz: true 表示 gzip 压缩过的文本：cat 如实拒绝，zcat / zgrep 能读。
     · size 只影响 ls -l / stat / du 的显示，不写就按内容长度算。
   ========================================================================== */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.fsAdd) return;

  var F = {};

  /* ======================================================================
     一、Nginx：配置 + 访问日志 + 413 上传被拦 + 轮转归档
     ----------------------------------------------------------------------
     剧情：client_max_body_size 还是默认的 1m，上传接口一直在报 413；
     error.log（termfs 里已有）记的是 upstream timed out；access.log 要与
     error.log 的 09:41:18 / 09:42:07 / 09:43:03 三条 500 对得上。
     ====================================================================== */

  /* /etc/nginx/conf.d/app.conf：sed 教学（8080 → 9090、localhost → 10.0.0.10）
     和"只放大上传接口"都靠它。客户端的 413 就是这里没写 client_max_body_size。 */
  F['/etc/nginx/conf.d/app.conf'] = {
    content:
      '# 订单服务反向代理 · 由 deploy 维护，改完先 nginx -t 再 reload\n' +
      'upstream order_backend {\n' +
      '    server 10.0.1.31:8080 max_fails=3 fail_timeout=10s;\n' +
      '    server 10.0.1.32:8080 max_fails=3 fail_timeout=10s;\n' +
      '}\n' +
      '\n' +
      'server {\n' +
      '    listen       80;\n' +
      '    server_name  web.example.com;\n' +
      '\n' +
      '    location / {\n' +
      '        proxy_pass http://order_backend;\n' +
      '        proxy_set_header Host              $host;\n' +
      '        proxy_set_header X-Real-IP         $remote_addr;\n' +
      '        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;\n' +
      '        proxy_connect_timeout 5s;\n' +
      '        proxy_read_timeout    30s;\n' +
      '    }\n' +
      '\n' +
      '    # 上传接口没写 client_max_body_size，沿用默认的 1m —— 大文件全被 413 挡掉\n' +
      '    location /upload/ {\n' +
      '        proxy_pass http://order_backend;\n' +
      '        client_body_temp_path /var/cache/nginx/client_temp;\n' +
      '    }\n' +
      '}\n',
    size: 892, mode: '644', user: 'root', group: 'root', mtime: '2024-03-11 10:22'
  };

  /* mime.types 只是被 nginx.conf include，这里给一份精简但真实的映射表 */
  F['/etc/nginx/mime.types'] = {
    content:
      'types {\n' +
      '    text/html                                        html htm shtml;\n' +
      '    text/css                                         css;\n' +
      '    text/xml                                         xml;\n' +
      '    application/javascript                           js;\n' +
      '    application/json                                 json;\n' +
      '    image/gif                                        gif;\n' +
      '    image/jpeg                                       jpeg jpg;\n' +
      '    image/png                                        png;\n' +
      '    image/svg+xml                                    svg svgz;\n' +
      '    application/x-gzip                              gz tgz;\n' +
      '}\n',
    size: 386, mode: '644', user: 'root', group: 'root', mtime: '2024-03-05 08:00'
  };

  /* ⚠️ `/var/log/nginx/access.log` 不在这里登记：termfs.js 的主机快照里已经有
     这个文件（15 行 combined 格式的访问日志），而 fsAdd 是"同路径只在第一次
     生效"，在这里再写一份会被静默丢弃、还容易让人以为改了实际内容。
     与它相关的两条示例因此仍受 termfs 现有内容限制：
       · `grep -c " 413 " /var/log/nginx/access.log` —— 快照里没有 413 记录；
       · `awk '{print $1}' ...` —— 这一条正常工作（第 1 列就是 $remote_addr）。
     需要让 413 计数有结果，得改 data/termfs.js（不属本文件的职责范围）。 */

  /* 当日 00:00 轮转出来的归档：lg 里那一堆 404 扫描 + 两台后端均衡。
     上一份归档文件名是 access.log-20240317（*.gz 一族；带日期的 .gz 由 logrotate 生成） */
  F['/var/log/nginx/access.log-20240317.gz'] = {
    gz: true,
    content:
      '203.0.113.91 - - [17/Mar/2024:08:02:11 +0800] "GET /api/orders HTTP/1.1" 200 1877 "-" "curl/7.79.1" 0.039\n' +
      '203.0.113.25 - - [17/Mar/2024:08:05:47 +0800] "GET /api/orders/8790 HTTP/1.1" 200 1764 "-" "curl/7.79.1" 0.052\n' +
      '198.51.100.77 - - [17/Mar/2024:09:14:03 +0800] "GET /admin HTTP/1.1" 404 153 "-" "Mozilla/5.0" 0.002\n' +
      '203.0.113.25 - - [17/Mar/2024:10:31:26 +0800] "POST /api/orders HTTP/1.1" 201 98 "-" "curl/7.79.1" 0.036\n' +
      '192.0.2.44 - - [17/Mar/2024:10:32:00 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.27" 0.001\n' +
      '203.0.113.91 - - [17/Mar/2024:11:48:19 +0800] "GET /static/app.js HTTP/1.1" 200 88213 "-" "Mozilla/5.0" 0.004\n' +
      '203.0.113.25 - - [17/Mar/2024:14:09:52 +0800] "GET /api/orders/8801 HTTP/1.1" 500 409 "-" "curl/7.79.1" 30.002\n' +
      '192.0.2.44 - - [17/Mar/2024:14:10:12 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.27" 0.001\n' +
      '203.0.113.25 - - [17/Mar/2024:16:22:38 +0800] "POST /upload/report.pdf HTTP/1.1" 413 157 "-" "curl/7.79.1" 0.000\n' +
      '203.0.113.91 - - [17/Mar/2024:18:40:07 +0800] "GET /api/orders/8806 HTTP/1.1" 504 176 "-" "curl/7.79.1" 60.001\n' +
      '198.51.100.77 - - [17/Mar/2024:21:03:55 +0800] "GET /admin HTTP/1.1" 404 153 "-" "Mozilla/5.0" 0.002\n' +
      '203.0.113.25 - - [17/Mar/2024:23:51:44 +0800] "GET /api/orders HTTP/1.1" 200 1922 "-" "curl/7.79.1" 0.044\n',
    size: 46137344, mode: '644', user: 'nginx', group: 'nginx', mtime: '2024-03-18 00:00'
  };

  /* 5 月那份归档：lt-zgrep 用它数 500。真机上是"上个月的归档还没删"的场景 */
  F['/var/log/nginx/access.log-20240501.gz'] = {
    gz: true,
    content:
      '203.0.113.25 - - [01/May/2024:07:12:03 +0800] "GET /api/orders HTTP/1.1" 200 1811 "-" "curl/7.79.1" 0.042\n' +
      '203.0.113.91 - - [01/May/2024:08:44:19 +0800] "GET /api/orders/9102 HTTP/1.1" 500 405 "-" "curl/7.79.1" 30.001\n' +
      '192.0.2.44 - - [01/May/2024:08:45:00 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.27" 0.001\n' +
      '198.51.100.77 - - [01/May/2024:09:31:27 +0800] "GET /admin HTTP/1.1" 404 153 "-" "Mozilla/5.0" 0.002\n' +
      '203.0.113.25 - - [01/May/2024:11:02:55 +0800] "POST /api/orders HTTP/1.1" 201 97 "-" "curl/7.79.1" 0.037\n' +
      '203.0.113.91 - - [01/May/2024:13:26:40 +0800] "GET /api/orders/9107 HTTP/1.1" 500 418 "-" "curl/7.79.1" 30.004\n' +
      '203.0.113.25 - - [01/May/2024:15:58:12 +0800] "POST /upload/invoice.pdf HTTP/1.1" 413 157 "-" "curl/7.79.1" 0.000\n' +
      '203.0.113.91 - - [01/May/2024:19:40:08 +0800] "GET /api/orders HTTP/1.1" 200 2033 "-" "curl/7.79.1" 0.046\n',
    size: 42991616, mode: '644', user: 'nginx', group: 'nginx', mtime: '2024-05-02 00:00'
  };

  /* ======================================================================
     二、应用日志
     ----------------------------------------------------------------------
     /data/app/logs/order.log    —— 订单服务的业务流水（head/tail/stat/mv 教学）
     /var/log/app/app.log        —— 老式多服务部署里"每个应用一个目录"的写法
     /var/log/app/access.log     —— 应用自身的访问日志（第 3 列是耗时，供 awk 求和）

     ⚠️ `/data/app/logs/app.log` 不在这里登记：assets/js/cmd-ops.js 已经用
     APP_LOG 注册了同一个路径（fsAdd 同路径只在第一次生效），在这里再写一份
     只会被静默丢弃。它那边的内容已经包含 query timeout after 5000ms /
     HikariPool 线程饥饿等剧情，与本文件的数据是同一套时间线。

     两个 app.log 都以 `query timeout after 5000ms, orderId=881x` 为主线，
     与 nginx 的 upstream timed out、MySQL 慢查询日志、Pod worker 的崩溃一一对应。
     ====================================================================== */

  /* 订单业务流水：lb-head / lb-tail / lb-stat / lb-mv / lb-tac / lb-nl 都读它。     字段固定为 `时间 级别 订单号 用户 金额 耗时ms`，最后一行与上面 ERROR 对齐。 */
  F['/data/app/logs/order.log'] = {
    content:
      '2024-03-18 09:30:01 INFO  orderId=8781 user=u10233 amount=268.00 cost=41ms status=PAID\n' +
      '2024-03-18 09:30:14 INFO  orderId=8782 user=u10871 amount=1299.00 cost=57ms status=PAID\n' +
      '2024-03-18 09:31:02 WARN  orderId=8783 user=u10044 amount=88.50 cost=1204ms status=PAID retry=1\n' +
      '2024-03-18 09:31:47 INFO  orderId=8784 user=u10233 amount=19.90 cost=38ms status=PAID\n' +
      '2024-03-18 09:32:19 INFO  orderId=8785 user=u11902 amount=560.00 cost=44ms status=PAID\n' +
      '2024-03-18 09:33:05 INFO  orderId=8786 user=u10777 amount=32.00 cost=39ms status=CANCELLED\n' +
      '2024-03-18 09:34:41 INFO  orderId=8787 user=u10871 amount=1450.00 cost=61ms status=PAID\n' +
      '2024-03-18 09:35:12 WARN  orderId=8788 user=u10044 amount=76.00 cost=987ms status=PAID retry=1\n' +
      '2024-03-18 09:36:38 INFO  orderId=8789 user=u11345 amount=240.00 cost=42ms status=PAID\n' +
      '2024-03-18 09:37:55 INFO  orderId=8790 user=u11902 amount=178.80 cost=47ms status=REFUNDED\n' +
      '2024-03-18 09:38:20 INFO  orderId=8791 user=u10233 amount=99.00 cost=40ms status=PAID\n' +
      '2024-03-18 09:39:07 INFO  orderId=8792 user=u10777 amount=328.00 cost=52ms status=PAID\n' +
      '2024-03-18 09:40:33 WARN  orderId=8793 user=u11345 amount=65.00 cost=1512ms status=PAID retry=1\n' +
      '2024-03-18 09:41:18 ERROR orderId=8812 user=u10233 amount=412.00 cost=30004ms status=FAILED reason=query_timeout\n' +
      '2024-03-18 09:41:52 INFO  orderId=8813 user=u10871 amount=233.00 cost=45ms status=PAID\n' +
      '2024-03-18 09:42:07 ERROR orderId=8813 user=u10871 amount=233.00 cost=30003ms status=FAILED reason=query_timeout\n' +
      '2024-03-18 09:42:48 INFO  orderId=8814 user=u11902 amount=158.00 cost=49ms status=PAID\n' +
      '2024-03-18 09:43:03 ERROR orderId=8814 user=u11902 amount=158.00 cost=30005ms status=FAILED reason=query_timeout\n' +
      '2024-03-18 09:43:39 INFO  orderId=8815 user=u10044 amount=76.50 cost=43ms status=PAID\n' +
      '2024-03-18 09:44:12 ERROR orderId=8816 user=u10777 amount=520.00 cost=0ms status=FAILED reason=disk_full\n',
    size: 67108864, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:44'
  };

  /* 老式部署：日志落在 /var/log/<应用>/ 下（lt-sed / lt-egrep / lt-zgrep -r）。
     级别刻意混排：`ERROR`（Spring 风格，给 `egrep -c "ERROR|WARN"` 用）与
     `[error]`（log4j 老式方括号风格，给 `sed -n "/\[error\]/,/^$/p"` 用），
     每个异常块后面留一个空行 —— 上面那条 sed 才有整段堆栈可打印。 */
  F['/var/log/app/app.log'] = {
    content:
      '2024-05-01 08:12:03 [order-service] INFO started, profile=prod, port=8080\n' +
      '2024-05-01 08:12:47 [order-service] INFO connection pool ready: jdbc:mysql://db-prod-01:3306/orders\n' +
      '2024-05-01 08:31:19 [order-service] WARN slow query 1204ms, sql=SELECT * FROM orders WHERE user_id=?\n' +
      '2024-05-01 09:04:55 [order-service] WARN retry 1/3 after 500ms, cause=connect timeout\n' +
      '2024/05/01 09:41:18 [error] [order-service] query timeout after 5000ms, orderId=8812\n' +
      '2024/05/01 09:41:18 [error] [order-service] caused by: java.sql.SQLTimeoutException: Statement cancelled due to timeout\n' +
      '2024/05/01 09:41:18 [error] [order-service] org.springframework.dao.QueryTimeoutException\n' +
      '\tat com.example.orders.OrderService.findOrder(OrderService.java:118)\n' +
      '\tat com.example.orders.OrderController.get(OrderController.java:64)\n' +
      '\tat java.base/java.lang.reflect.Method.invoke(Method.java:568)\n' +
      '\n' +
      '2024-05-01 10:02:31 [order-service] ERROR java.lang.OutOfMemoryError: Java heap space\n' +
      '2024-05-01 10:02:31 [order-service] ERROR caused by: java.lang.OutOfMemoryError: Java heap space\n' +
      '\tat com.example.orders.OrderCache.put(OrderCache.java:76)\n' +
      '\tat com.example.orders.OrderService.cache(OrderService.java:201)\n' +
      '\tat com.example.orders.OrderController.list(OrderController.java:39)\n' +
      '\n' +
      '2024/05/01 10:02:33 [warn] [order-service] heap usage 1986M/2048M (97%), Full GC triggered\n' +
      '2024/05/01 10:04:02 [info] [order-service] 已用 System.gc() 触发一次 Full GC（老代码遗留，建议移除）\n' +
      '2024/05/01 10:07:48 [error] [order-service] No space left on device, /data\n' +
      '2024/05/01 10:07:48 [error] [order-service] log appender disabled to avoid blocking business threads\n' +
      '\n' +
      '2024-05-01 10:31:12 [order-service] WARN graceful shutdown requested, draining 12 connections\n' +
      '2024-05-01 10:31:52 [order-service] INFO stopped\n',
    size: 10485760, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-05-01 10:31'
  };

  /* 应用自身访问日志：`时间 客户端 方法 路径 耗时ms 状态码`，第 3 列就是耗时（awk 求平均）。
     时间戳刻意用 `2024-05-01 08:12:03` 这种完整格式（不是 `09:41:02`）—— 与同目录
     app.log 的时间格式一致，`grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}'` 这类按日期打头的
     正则才有意义。 */
  F['/var/log/app/access.log'] = {
    content:
      '2024-05-01 09:41:02 203.0.113.25 GET /api/orders 41ms 200\n' +
      '2024-05-01 09:41:05 198.51.100.77 GET /admin 2ms 404\n' +
      '2024-05-01 09:41:09 203.0.113.25 POST /api/orders 57ms 201\n' +
      '2024-05-01 09:41:12 192.0.2.44 GET /healthz 1ms 200\n' +
      '2024-05-01 09:41:18 203.0.113.25 GET /api/orders/8812 30004ms 500\n' +
      '2024-05-01 09:41:42 192.0.2.44 GET /healthz 1ms 200\n' +
      '2024-05-01 09:42:01 203.0.113.91 GET /api/orders 45ms 200\n' +
      '2024-05-01 09:42:07 203.0.113.25 GET /api/orders/8813 30003ms 500\n' +
      '2024-05-01 09:42:15 203.0.113.91 GET /static/app.js 4ms 200\n' +
      '2024-05-01 09:42:30 203.0.113.25 GET /api/orders 43ms 200\n' +
      '2024-05-01 09:42:52 203.0.113.91 GET /api/orders 47ms 200\n' +
      '2024-05-01 09:43:03 203.0.113.25 GET /api/orders/8814 30005ms 500\n',
    size: 3145728, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:43'
  };

  /* 生产应用的访问日志（`时间 客户端 方法 路径 耗时ms 状态码`）。
     `/data/app/logs/` 目录里原来只有 app.log（业务日志），少了访问日志，
     而 `lt-awk-sum` 要拿第 3 列求平均耗时 —— 补上它，awk/sort/uniq 那些示例
     才有真正属于"应用访问日志"的样本。 */
  F['/data/app/logs/access.log'] = {
    content:
      '2024-03-18 09:41:02 203.0.113.25 GET /api/orders 41ms 200\n' +
      '2024-03-18 09:41:05 198.51.100.77 GET /admin 2ms 404\n' +
      '2024-03-18 09:41:09 203.0.113.25 POST /api/orders 57ms 201\n' +
      '2024-03-18 09:41:12 192.0.2.44 GET /healthz 1ms 200\n' +
      '2024-03-18 09:41:18 203.0.113.25 GET /api/orders/8812 30004ms 500\n' +
      '2024-03-18 09:41:42 192.0.2.44 GET /healthz 1ms 200\n' +
      '2024-03-18 09:42:01 203.0.113.91 GET /api/orders 45ms 200\n' +
      '2024-03-18 09:42:07 203.0.113.25 GET /api/orders/8813 30003ms 500\n' +
      '2024-03-18 09:42:15 203.0.113.91 GET /static/app.js 4ms 200\n' +
      '2024-03-18 09:42:30 203.0.113.25 GET /api/orders 43ms 200\n' +
      '2024-03-18 09:42:52 203.0.113.91 GET /api/orders 47ms 200\n' +
      '2024-03-18 09:43:03 203.0.113.25 GET /api/orders/8814 30005ms 500\n',
    size: 8388608, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:43'
  };

  /* ⚠️ 兼容 `sh-quotes` 里 `/var/log/app.log` 这个**根目录下**的路径
     （站内唯一一处把应用日志放在 /var/log 根下的写法，其它地方一律是
     `/var/log/app/app.log` 或 `/data/app/logs/app.log`）。
     这里不复制内容（两份日志会不一致），而是登记软链指向真正的那份：
     `cat/head/tail` 会跟着软链读到内容；`grep` 不会 —— 引擎的 grep 直接读
     软链节点自身的 content，不跟随 target，属于引擎侧缺陷，需要数据兜底时
     只能改成复制一份真实内容。 */
  F['/root/app.log'] = { type: 'link', target: '/var/log/app/app.log', mode: '777', user: 'root', group: 'root', mtime: '2024-05-01 10:31' };

  /* 客户端 IP 清单（lt-uniq 去重计数：12 行里 4 个是重复的 → 去重后 8 行） */
  F['/var/log/app/ips.txt'] = {
    content:
      '203.0.113.25\n' +
      '198.51.100.77\n' +
      '203.0.113.91\n' +
      '192.0.2.44\n' +
      '203.0.113.25\n' +
      '198.51.100.77\n' +
      '203.0.113.91\n' +
      '192.0.2.44\n' +
      '203.0.113.25\n' +
      '198.51.100.77\n' +
      '10.0.1.23\n' +
      '172.20.1.14\n',
    size: 178, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:43'
  };

  /* 关键词清单：grep -F -f 的输入。里面全是日志里真出现过的词 */
  F['/opt/app/conf/keywords.txt'] = {
    content:
      'OutOfMemory\n' +
      'query timeout\n' +
      'SQLTimeoutException\n' +
      'No space left\n' +
      'NullPointerException\n' +
      'Connection refused\n' +
      'upstream timed out\n' +
      'Connection timed out\n' +
      'cache-prod-01\n' +
      'java.net.UnknownHostException\n',
    size: 186, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-15 11:20'
  };

  /* Java 应用配置：file -i 用它确认编码（UTF-8 中文不能乱码） */
  F['/opt/app/conf/app.properties'] = {
    content:
      '# 订单服务配置 · 生产环境（改完需要重启 myapp）\n' +
      'server.port=8080\n' +
      'spring.datasource.url=jdbc:mysql://db-prod-01:3306/orders?useSSL=false&characterEncoding=utf8\n' +
      'spring.datasource.username=app\n' +
      'spring.datasource.password=${DB_PASSWORD}\n' +
      'spring.datasource.hikari.maximum-pool-size=50\n' +
      'spring.datasource.hikari.connection-timeout=3000\n' +
      'spring.redis.host=cache-prod-01\n' +
      'spring.redis.port=6379\n' +
      'logging.level.root=INFO\n' +
      'logging.level.com.example.orders=DEBUG\n' +
      'order.timeout.ms=5000\n' +
      '备注：慢查询阈值 1s，超过就记到 /var/log/mysql/slow.log\n',
    size: 612, mode: '640', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30'
  };

  /* ======================================================================
     三、Tomcat
     ----------------------------------------------------------------------
     /opt/tomcat/logs 是 mw-tomcat-log 的主角：catalina.out 里同时能看到
     应用启动、业务报错与 OutOfMemoryError，日志目录本身也很大（排查"谁把盘写满"）。
     ====================================================================== */

  F['/opt/tomcat/logs/catalina.out'] = {
    content:
      '18-Mar-2024 09:02:11.004 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server version name:   Apache Tomcat/9.0.85\n' +
      '18-Mar-2024 09:02:11.021 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Java Home:             /usr/lib/jvm/java-17-openjdk\n' +
      '18-Mar-2024 09:02:11.118 INFO [main] org.apache.catalina.core.StandardServer.await Starting ProtocolHandler ["http-nio-8080"]\n' +
      '18-Mar-2024 09:02:13.882 INFO [main] org.apache.catalina.startup.Catalina.start Server startup in [2741] milliseconds\n' +
      '18-Mar-2024 09:41:18.552 SEVERE [http-nio-8080-exec-4] com.example.orders.OrderService.findOrder query timeout after 5000ms, orderId=8812\n' +
      '18-Mar-2024 09:41:18.553 SEVERE [http-nio-8080-exec-4] com.example.orders.OrderService.findOrder java.sql.SQLTimeoutException: Statement cancelled due to timeout\n' +
      '\tat com.example.orders.OrderService.findOrder(OrderService.java:118)\n' +
      '\tat org.apache.catalina.valves.ErrorReportValve.invoke(ErrorReportValve.java:93)\n' +
      '18-Mar-2024 09:42:07.881 SEVERE [http-nio-8080-exec-9] com.example.orders.OrderService.findOrder query timeout after 5000ms, orderId=8813\n' +
      '18-Mar-2024 09:43:03.207 SEVERE [http-nio-8080-exec-2] com.example.orders.OrderService.findOrder query timeout after 5000ms, orderId=8814\n' +
      '18-Mar-2024 09:44:12.660 SEVERE [http-nio-8080-exec-6] com.example.orders.FileLogAppender.write 磁盘写入失败: /data/app/logs/app.log (No space left on device)\n' +
      '18-Mar-2024 09:44:12.661 WARNING [http-nio-8080-exec-6] com.example.orders.FileLogAppender.rollover 日志轮转被跳过：/data 剩余空间 0 字节\n' +
      '18-Mar-2024 09:47:55.214 SEVERE [http-nio-8080-exec-3] org.apache.catalina.core.ContainerBase.invoke java.lang.OutOfMemoryError: Java heap space\n' +
      '\tat java.base/java.util.Arrays.copyOf(Arrays.java:3537)\n' +
      '\tat com.example.orders.OrderCache.put(OrderCache.java:76)\n' +
      '\tat com.example.orders.OrderService.cache(OrderService.java:201)\n' +
      '18-Mar-2024 09:47:55.216 SEVERE [http-nio-8080-exec-3] org.apache.catalina.core.StandardWrapperValve.invoke Servlet.service() for servlet [dispatcher] threw exception\n' +
      '18-Mar-2024 09:48:02.004 INFO [Thread-7] org.apache.catalina.core.StandardServer.await The stop command was received\n' +
      '18-Mar-2024 09:48:02.913 INFO [main] org.apache.catalina.startup.Catalina.stop Server shutdown in [909] milliseconds\n',
    size: 104857600, mode: '644', user: 'tomcat', group: 'tomcat', mtime: '2024-03-18 09:48'
  };

  F['/opt/tomcat/logs/localhost_access_log.2024-03-18.txt'] = {
    content:
      '10.0.1.23 - - [18/Mar/2024:09:41:02 +0800] "GET /orders/8781 HTTP/1.1" 200 842 41\n' +
      '10.0.1.31 - - [18/Mar/2024:09:41:18 +0800] "GET /orders/8812 HTTP/1.1" 500 412 30004\n' +
      '10.0.1.32 - - [18/Mar/2024:09:42:07 +0800] "GET /orders/8813 HTTP/1.1" 500 418 30003\n' +
      '10.0.1.23 - - [18/Mar/2024:09:42:30 +0800] "GET /orders HTTP/1.1" 200 1901 43\n' +
      '10.0.1.31 - - [18/Mar/2024:09:43:03 +0800] "GET /orders/8814 HTTP/1.1" 500 421 30005\n' +
      '10.0.1.23 - - [18/Mar/2024:09:47:55 +0800] "GET /orders HTTP/1.1" 500 214 5001\n',
    size: 4194304, mode: '644', user: 'tomcat', group: 'tomcat', mtime: '2024-03-18 09:48'
  };

  F['/opt/tomcat/logs/catalina.2024-03-17.log'] = {
    gz: true,
    content:
      '17-Mar-2024 09:01:44.120 INFO [main] org.apache.catalina.startup.Catalina.start Server startup in [2618] milliseconds\n' +
      '17-Mar-2024 10:12:31.884 WARNING [http-nio-8080-exec-2] org.apache.catalina.valves.AccessLogValve.invoke Access log rotation skipped\n' +
      '17-Mar-2024 14:09:52.331 SEVERE [http-nio-8080-exec-5] com.example.orders.OrderService.findOrder query timeout after 5000ms, orderId=8801\n' +
      '17-Mar-2024 14:09:53.004 WARNING [http-nio-8080-exec-5] org.apache.catalina.connector.CoyoteAdapter.service An exception or error occurred in the container during request processing\n' +
      '17-Mar-2024 18:40:07.512 SEVERE [http-nio-8080-exec-8] com.example.orders.OrderService.findOrder query timeout after 5000ms, orderId=8806\n',
    size: 89128960, mode: '644', user: 'tomcat', group: 'tomcat', mtime: '2024-03-18 00:00'
  };

  /* ======================================================================
     四、MySQL / 慢查询
     ----------------------------------------------------------------------
     /etc/my.cnf 是 sed 教学（[mysqld] 段插参数）的载体，慢查询阈值 1s；
     /var/log/mysql/slow.log 是配套的慢查询现场，逐条对应应用日志的
     query timeout after 5000ms。
     ====================================================================== */

  F['/etc/my.cnf'] = {
    content:
      '[client]\n' +
      'port = 3306\n' +
      'socket = /var/lib/mysql/mysql.sock\n' +
      'default-character-set = utf8mb4\n' +
      '\n' +
      '[mysql]\n' +
      'prompt = "\\u@\\h [\\d]> "\n' +
      '\n' +
      '[mysqld]\n' +
      'user = mysql\n' +
      'port = 3306\n' +
      'datadir = /var/lib/mysql\n' +
      'socket = /var/lib/mysql/mysql.sock\n' +
      'character-set-server = utf8mb4\n' +
      'collation-server = utf8mb4_general_ci\n' +
      'max_connections = 500\n' +
      'innodb_buffer_pool_size = 2G\n' +
      'innodb_flush_log_at_trx_commit = 1\n' +
      'slow_query_log = 1\n' +
      'slow_query_log_file = /var/log/mysql/slow.log\n' +
      'long_query_time = 1\n' +
      'log_queries_not_using_indexes = 1\n' +
      '\n' +
      '[mysqldump]\n' +
      'quick\n' +
      'single-transaction\n',
    size: 574, mode: '644', user: 'root', group: 'root', mtime: '2024-03-10 09:18'
  };

  F['/var/log/mysql/slow.log'] = {
    content:
      '# Time: 2024-03-18T09:41:13.882104+08:00\n' +
      '# User@Host: app[app] @ 10.0.1.23 []  Id:  8812\n' +
      '# Query_time: 5.122981  Lock_time: 0.000180 Rows_sent: 0  Rows_examined: 1842193\n' +
      'SET timestamp=1710726073;\n' +
      'SELECT o.id, o.user_id, o.amount, o.status FROM orders o WHERE o.user_id = 10233 AND o.created_at > \'2024-01-01\' ORDER BY o.created_at DESC;\n' +
      '# Time: 2024-03-18T09:42:02.114553+08:00\n' +
      '# User@Host: app[app] @ 10.0.1.23 []  Id:  8830\n' +
      '# Query_time: 5.087334  Lock_time: 0.000210 Rows_sent: 0  Rows_examined: 1903441\n' +
      'SET timestamp=1710726122;\n' +
      'SELECT o.id, o.user_id, o.amount, o.status FROM orders o WHERE o.user_id = 10871 AND o.created_at > \'2024-01-01\' ORDER BY o.created_at DESC;\n' +
      '# Time: 2024-03-18T09:42:58.771902+08:00\n' +
      '# User@Host: app[app] @ 10.0.1.23 []  Id:  8847\n' +
      '# Query_time: 5.203118  Lock_time: 0.000166 Rows_sent: 0  Rows_examined: 1877025\n' +
      'SET timestamp=1710726178;\n' +
      'SELECT o.id, o.user_id, o.amount, o.status FROM orders o WHERE o.user_id = 11902 AND o.created_at > \'2024-01-01\' ORDER BY o.created_at DESC;\n' +
      '# Time: 2024-03-18T09:44:12.660887+08:00\n' +
      '# User@Host: app[app] @ 10.0.1.23 []  Id:  8861\n' +
      '# Query_time: 0.004512  Lock_time: 0.000098 Rows_sent: 1  Rows_examined: 1\n' +
      'SET timestamp=1710726252;\n' +
      'INSERT INTO order_events(order_id, event, ts) VALUES (8816, \'failed\', NOW());\n',
    size: 3145728, mode: '640', user: 'mysql', group: 'mysql', mtime: '2024-03-18 09:44'
  };

  /* ======================================================================
     五、系统日志与日志子系统配置（monitor 分类）
     ----------------------------------------------------------------------
     journald 默认 Storage=auto 且 /var/log/journal 不存在 → 重启即丢日志；
     rsyslog 规则里没有 myapp 分流；logrotate.status 里记着上次切割时间。
     ====================================================================== */

  F['/etc/systemd/journald.conf'] = {
    content:
      '#  This file is part of systemd.\n' +
      '#\n' +
      '#  systemd is free software; you can redistribute it and/or modify it\n' +
      '#  under the terms of the GNU Lesser General Public License as published by\n' +
      '#  the Free Software Foundation; either version 2.1 of the License, or\n' +
      '#  (at your option) any later version.\n' +
      '#\n' +
      '[Journal]\n' +
      '#Storage=auto\n' +
      '#Compress=yes\n' +
      '#Seal=yes\n' +
      '#SplitMode=uid\n' +
      '#SyncIntervalSec=5m\n' +
      '#RateLimitIntervalSec=30s\n' +
      '#RateLimitBurst=10000\n' +
      'SystemMaxUse=2G\n' +
      'SystemKeepFree=1G\n' +
      '#SystemMaxFileSize=100M\n' +
      'MaxRetentionSec=1month\n' +
      'ForwardToSyslog=yes\n' +
      '#MaxLevelStore=debug\n',
    size: 812, mode: '644', user: 'root', group: 'root', mtime: '2024-03-12 15:40'
  };

  F['/etc/rsyslog.conf'] = {
    content:
      '# rsyslog configuration file (EulerOS 2.0 SP10)\n' +
      'module(load="imuxsock"    # provides support for local system logging (e.g. via logger command)\n' +
      '       SysSock.Use="off")\n' +
      'module(load="imjournal"   # provides access to the systemd journal\n' +
      '       StateFile="imjournal.state")\n' +
      '\n' +
      '#### GLOBAL DIRECTIVES ####\n' +
      '$WorkDirectory /var/lib/rsyslog\n' +
      '$ActionFileDefaultTemplate RSYSLOG_TraditionalFileFormat\n' +
      '$FileOwner root\n' +
      '$FileGroup adm\n' +
      '$FileCreateMode 0640\n' +
      '$DirCreateMode 0755\n' +
      '$Umask 0022\n' +
      '\n' +
      '#### RULES ####\n' +
      '*.info;mail.none;authpriv.none;cron.none                /var/log/messages\n' +
      'authpriv.*                                              /var/log/secure\n' +
      'mail.*                                                  -/var/log/maillog\n' +
      'cron.*                                                  /var/log/cron\n' +
      '*.emerg                                                 :omusrmsg:*\n' +
      'uucp,news.crit                                          /var/log/spooler\n' +
      'local7.*                                                /var/log/boot.log\n' +
      '\n' +
      '# 应用 myapp 目前走默认规则（全量进 /var/log/messages），要单独分流见 /etc/rsyslog.d/\n' +
      '$IncludeConfig /etc/rsyslog.d/*.conf\n',
    size: 1183, mode: '644', user: 'root', group: 'root', mtime: '2024-03-10 09:26'
  };

  F['/var/lib/logrotate/logrotate.status'] = {
    content:
      'logrotate state -- version 2\n' +
      '"/var/log/yum.log" 2024-3-1-3:0:0\n' +
      '"/var/log/boot.log" 2024-3-1-3:0:0\n' +
      '"/var/log/messages" 2024-3-18-3:0:0\n' +
      '"/var/log/secure" 2024-3-18-3:0:0\n' +
      '"/var/log/cron" 2024-3-18-3:0:0\n' +
      '"/var/log/maillog" 2024-3-1-3:0:0\n' +
      '"/var/log/spooler" 2024-3-1-3:0:0\n' +
      '"/var/log/nginx/access.log" 2024-3-18-0:0:0\n' +
      '"/var/log/nginx/error.log" 2024-3-18-0:0:0\n' +
      '"/data/app/logs/app.log" 2024-3-18-3:0:0\n' +
      '"/var/log/myapp.log" 2024-3-17-3:0:0\n',
    size: 396, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 03:00'
  };

  /* 应用自己的日志：rsyslog 分流规则还没加，所以这里只有昨天之前的几行 */
  F['/var/log/myapp.log'] = {
    content:
      'Mar 17 03:00:04 web-prod-01 myapp[18204]: scheduled task started, job=daily-report\n' +
      'Mar 17 03:12:41 web-prod-01 myapp[18204]: scheduled task finished, job=daily-report cost=757s\n' +
      'Mar 17 09:14:52 web-prod-01 myapp[18204]: WARN redis reconnect attempt=1 host=cache-prod-01:6379\n' +
      'Mar 17 18:40:09 web-prod-01 myapp[18204]: ERROR query timeout after 5000ms, orderId=8806\n' +
      'Mar 18 03:00:05 web-prod-01 myapp[18442]: scheduled task started, job=daily-report\n' +
      'Mar 18 03:12:49 web-prod-01 myapp[18442]: scheduled task finished, job=daily-report cost=764s\n',
    size: 1048576, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 03:12'
  };

  /* 应用自己的轮转日志目录：`sh-template-log-clean` 的清理脚本与
     `truncate -s 0` 演示都按 `/var/log/myapp/<文件>.log` 取路径，
     所以这里给它一个"正在被写入的大日志"。 */
  F['/var/log/myapp/app.log'] = {
    content:
      '2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3\n' +
      '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\n' +
      '2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813\n' +
      '2024-03-18 09:43:03.207 ERROR 1 --- [http-nio-8080-exec-2] c.e.o.OrderService : query timeout after 5000ms, orderId=8814\n' +
      '2024-03-18 09:44:12.660 ERROR 1 --- [http-nio-8080-exec-6] c.e.o.FileLogAppender : No space left on device\n',
    size: 268435456, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:44'
  };

  F['/var/log/logclean.log'] = {
    content:
      '[2024-03-17 03:00:01] 开始清理 /var/log/myapp\n' +
      '[2024-03-17 03:00:01] 已截断超大日志: /var/log/myapp/app.log (412MB)\n' +
      '[2024-03-17 03:00:02] 清理完成，当前占用: 38M\n',
    size: 4096, mode: '644', user: 'root', group: 'root', mtime: '2024-03-17 03:00'
  };

  /* node_exporter 的 textfile 采集目录（mo-node-exporter 往里写 myapp_up） */
  F['/var/lib/node_exporter/textfile/myapp.prom'] = {
    content:
      '# HELP myapp_up 应用存活状态（1=存活 0=不可用）\n' +
      '# TYPE myapp_up gauge\n' +
      'myapp_up 1\n' +
      '# HELP myapp_health_check_duration_seconds 健康检查耗时\n' +
      '# TYPE myapp_health_check_duration_seconds gauge\n' +
      'myapp_health_check_duration_seconds 0.041\n' +
      '# HELP myapp_restart_total 本机重启应用次数\n' +
      '# TYPE myapp_restart_total counter\n' +
      'myapp_restart_total 2\n',
    size: 368, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:45'
  };

  /* JVM 线程栈：/tmp/jstack-18442.txt 里必须有 nid=0x4829 与 JVM 自己检测到的死锁结论，
     与 mo-jvm-jstack / pf-jstack-cpu 的示例严格对应。 */
  F['/tmp/jstack-18442.txt'] = {
    content:
      '2024-03-18 09:47:58\n' +
      'Full thread dump OpenJDK 64-Bit Server VM (17.0.9+9-LTS mixed mode, sharing):\n' +
      '\n' +
      'Threads class SMR info:\n' +
      '_java_thread_list=0x00007f2c8c00a220, length=87, elements={...}\n' +
      '\n' +
      '"main" #1 prio=5 os_prio=0 cpu=4821.31ms elapsed=574.21s tid=0x00007f2c8c028800 nid=0x1 waiting on condition  [0x00007f2c8d27c000]\n' +
      '   java.lang.Thread.State: WAITING (parking)\n' +
      '\tat jdk.internal.misc.Unsafe.park(Native Method)\n' +
      '\t- parking to wait for  <0x00000000f0a1c4d8> (a java.util.concurrent.CountDownLatch$Sync)\n' +
      '\tat java.util.concurrent.locks.LockSupport.park(LockSupport.java:211)\n' +
      '\tat org.springframework.boot.loader.LaunchedURLClassLoader.loadClass(LaunchedURLClassLoader.java:151)\n' +
      '\n' +
      '"http-nio-8080-exec-4" #42 prio=5 os_prio=0 cpu=31204.55ms elapsed=402.11s tid=0x00007f2c8c1a2800 nid=0x4829 waiting for monitor entry  [0x00007f2c8ce9b000]\n' +
      '   java.lang.Thread.State: BLOCKED (on object monitor)\n' +
      '\tat com.example.orders.OrderCache.put(OrderCache.java:76)\n' +
      '\t- waiting to lock <0x00000000e8b23f10> (a com.example.orders.OrderCache)\n' +
      '\tat com.example.orders.OrderService.cache(OrderService.java:201)\n' +
      '\tat com.example.orders.OrderController.list(OrderController.java:39)\n' +
      '\tat org.apache.catalina.valves.ErrorReportValve.invoke(ErrorReportValve.java:93)\n' +
      '\tat org.apache.tomcat.util.threads.TaskThread$WrappingRunnable.run(TaskThread.java:61)\n' +
      '\tat java.base/java.lang.Thread.run(Thread.java:840)\n' +
      '\n' +
      '   Locked ownable synchronizers:\n' +
      '\t- None\n' +
      '\n' +
      '"http-nio-8080-exec-9" #47 prio=5 os_prio=0 cpu=9841.02ms elapsed=388.40s tid=0x00007f2c8c1b0800 nid=0x4b19 waiting on condition  [0x00007f2c8cf9d000]\n' +
      '   java.lang.Thread.State: WAITING (parking)\n' +
      '\tat com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:198)\n' +
      '\t- parking to wait for  <0x00000000e9c11a80> (a java.util.concurrent.SynchronousQueue$TransferStack)\n' +
      '\tat com.example.orders.OrderService.findOrder(OrderService.java:112)\n' +
      '\n' +
      '"order-sync-pool-1" #58 prio=5 os_prio=0 cpu=2877.44ms elapsed=301.55s tid=0x00007f2c8c240800 nid=0x5a12 waiting for monitor entry  [0x00007f2c8d39e000]\n' +
      '   java.lang.Thread.State: BLOCKED (on object monitor)\n' +
      '\tat com.example.orders.OrderReport.render(OrderReport.java:214)\n' +
      '\t- waiting to lock <0x00000000e8b23f10> (a com.example.orders.OrderCache)\n' +
      '\tat com.example.orders.OrderSyncTask.run(OrderSyncTask.java:88)\n' +
      '\tat java.base/java.lang.Thread.run(Thread.java:840)\n' +
      '\n' +
      '"Reference Handler" #9 daemon prio=10 os_prio=0 cpu=18.22ms elapsed=574.10s tid=0x00007f2c8c038800 nid=0x2 waiting on condition  [0x00007f2c8d37c000]\n' +
      '   java.lang.Thread.State: RUNNABLE\n' +
      '\tat java.lang.ref.Reference.waitForReferencePendingList(Native Method)\n' +
      '\n' +
      '"VM Thread" os_prio=0 cpu=1204.77ms elapsed=574.09s tid=0x00007f2c8c040800 nid=0x3 runnable\n' +
      '\n' +
      'JNI global refs: 29, weak refs: 0\n' +
      '\n' +
      'Found one Java-level deadlock:\n' +
      '=============================\n' +
      '"http-nio-8080-exec-4":\n' +
      '  waiting to lock monitor 0x00007f2c8c1d1c00 (object 0x00000000e8b23f10, a com.example.orders.OrderCache),\n' +
      '  which is held by "order-sync-pool-1"\n' +
      '"order-sync-pool-1":\n' +
      '  waiting to lock monitor 0x00007f2c8c1d2a80 (object 0x00000000e9c11a80, a com.zaxxer.hikari.pool.HikariPool),\n' +
      '  which is held by "http-nio-8080-exec-4"\n' +
      '\n' +
      'Java stack information for the threads listed above:\n' +
      '===================================================\n' +
      '"http-nio-8080-exec-4":\n' +
      '\tat com.example.orders.OrderService.cache(OrderService.java:201)\n' +
      '\t- waiting to lock <0x00000000e8b23f10> (a com.example.orders.OrderCache)\n' +
      '"order-sync-pool-1":\n' +
      '\tat com.example.orders.OrderSyncTask.run(OrderSyncTask.java:88)\n' +
      '\t- waiting to lock <0x00000000e9c11a80> (a com.zaxxer.hikari.pool.HikariPool)\n' +
      '\n' +
      'Found 1 deadlock.\n',
    size: 21504, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:47'
  };

  /* 第二份快照：5 分钟后再抓一次，用于"多次命中同一位置才可信"的教学对比 */
  F['/tmp/jstack-18442-095302.txt'] = {
    content:
      '2024-03-18 09:53:02\n' +
      'Full thread dump OpenJDK 64-Bit Server VM (17.0.9+9-LTS mixed mode, sharing):\n' +
      '\n' +
      '"http-nio-8080-exec-4" #42 prio=5 os_prio=0 cpu=35602.11ms elapsed=706.33s tid=0x00007f2c8c1a2800 nid=0x4829 waiting for monitor entry  [0x00007f2c8ce9b000]\n' +
      '   java.lang.Thread.State: BLOCKED (on object monitor)\n' +
      '\tat com.example.orders.OrderCache.put(OrderCache.java:76)\n' +
      '\t- waiting to lock <0x00000000e8b23f10> (a com.example.orders.OrderCache)\n' +
      '\tat com.example.orders.OrderService.cache(OrderService.java:201)\n' +
      '\n' +
      '"order-sync-pool-1" #58 prio=5 os_prio=0 cpu=3104.02ms elapsed=605.71s tid=0x00007f2c8c240800 nid=0x5a12 waiting for monitor entry  [0x00007f2c8d39e000]\n' +
      '   java.lang.Thread.State: BLOCKED (on object monitor)\n' +
      '\tat com.example.orders.OrderReport.render(OrderReport.java:214)\n' +
      '\t- waiting to lock <0x00000000e8b23f10> (a com.example.orders.OrderCache)\n' +
      '\n' +
      'Found one Java-level deadlock:\n' +
      '=============================\n' +
      '"http-nio-8080-exec-4":\n' +
      '  waiting to lock monitor 0x00007f2c8c1d1c00 (object 0x00000000e8b23f10, a com.example.orders.OrderCache),\n' +
      '  which is held by "order-sync-pool-1"\n' +
      '"order-sync-pool-1":\n' +
      '  waiting to lock monitor 0x00007f2c8c1d2a80 (object 0x00000000e9c11a80, a com.zaxxer.hikari.pool.HikariPool),\n' +
      '  which is held by "http-nio-8080-exec-4"\n' +
      '\n' +
      'Found 1 deadlock.\n',
    size: 18432, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:53'
  };

  /* GC 日志：JDK 9+ 统一日志格式。3 次 Pause Full + 6 次 Pause Young，
     最后一次 Full GC 的原因写着 System.gc()（老代码遗留）。 */
  F['/data/logs/gc.log'] = {
    content:
      '[2024-03-18T09:38:35.104+0800][info][gc] Using G1\n' +
      '[2024-03-18T09:38:42.221+0800][info][gc,init] Version: 17.0.9+9-LTS (release)\n' +
      '[2024-03-18T09:38:42.223+0800][info][gc,init] Heap Region Size: 2M\n' +
      '[2024-03-18T09:40:12.664+0800][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 512M->96M(2048M) 18.442ms\n' +
      '[2024-03-18T09:41:18.552+0800][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 1284M->312M(2048M) 27.108ms\n' +
      '[2024-03-18T09:42:07.883+0800][info][gc] GC(2) Pause Young (Concurrent Start) (G1 Humongous Allocation) 1520M->498M(2048M) 41.882ms\n' +
      '[2024-03-18T09:43:03.209+0800][info][gc] GC(3) Pause Young (Normal) (G1 Evacuation Pause) 1402M->366M(2048M) 24.551ms\n' +
      '[2024-03-18T09:44:12.661+0800][info][gc] GC(4) Pause Full (G1 Compaction Pause) 2046M->712M(2048M) 1204.318ms\n' +
      '[2024-03-18T09:45:30.118+0800][info][gc] GC(5) Pause Young (Normal) (G1 Evacuation Pause) 1188M->288M(2048M) 21.774ms\n' +
      '[2024-03-18T09:46:41.902+0800][info][gc] GC(6) Pause Full (G1 Evacuation Pause) 1998M->684M(2048M) 986.220ms\n' +
      '[2024-03-18T09:47:22.318+0800][info][gc] GC(7) Pause Young (Normal) (G1 Evacuation Pause) 1044M->254M(2048M) 19.336ms\n' +
      '[2024-03-18T09:47:55.214+0800][info][gc] GC(8) Pause Full (System.gc()) 2012M->698M(2048M) 1102.744ms\n' +
      '[2024-03-18T09:47:55.216+0800][info][gc,cpu] GC(8) User=4.42s Sys=0.09s Real=1.11s\n',
    size: 4194304, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:47'
  };

  /* 业务日志：千万级 ID 文件（sort -u -T /data/tmp 的输入） */
  F['/data/logs/all-ids.txt'] = {
    content:
      'ID202403180000001\n' +
      'ID202403180000002\n' +
      'ID202403180000003\n' +
      'ID202403180000002\n' +
      'ID202403180000004\n' +
      'ID202403180000005\n' +
      'ID202403180000001\n' +
      'ID202403180000006\n' +
      'ID202403180000007\n' +
      'ID202403180000008\n' +
      'ID202403180000005\n' +
      'ID202403180000009\n',
    size: 12582912, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:20'
  };

  /* 应用启动/停止流水（mv 教学的两个源文件） */
  F['/data/logs/app-1.log'] = {
    content:
      '2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3\n' +
      '2024-03-18 09:38:42.113  INFO 1 --- [main] c.e.OrdersApplication : Started OrdersApplication in 8.42 seconds\n' +
      '2024-03-18 09:40:02.884  WARN 1 --- [scheduling-1] c.e.o.OrderSyncTask : sync delay 1204ms\n',
    size: 2097152, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:40'
  };

  F['/data/logs/app-2.log'] = {
    content:
      '2024-03-18 09:41:18.552 ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\n' +
      '2024-03-18 09:42:07.881 ERROR 1 --- [http-nio-8080-exec-9] c.e.o.OrderService : query timeout after 5000ms, orderId=8813\n' +
      '2024-03-18 09:44:12.660 ERROR 1 --- [http-nio-8080-exec-6] c.e.o.FileLogAppender : No space left on device\n',
    size: 1048576, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:44'
  };

  /* 大日志（split -n 4 的输入） */
  F['/data/logs/big.log'] = {
    content:
      '2024-03-18 08:00:01 INFO  requestId=8f3c1a72 handled by web-7d9c4b8f5-2xk9p cost=41ms\n' +
      '2024-03-18 08:00:02 INFO  requestId=b41d9e05 handled by web-7d9c4b8f5-9q4zw cost=38ms\n' +
      '2024-03-18 08:00:03 INFO  requestId=6f8a2c1b handled by web-7d9c4b8f5-2xk9p cost=44ms\n' +
      '2024-03-18 08:00:04 WARN  requestId=2b1c9d4e handled by web-7d9c4b8f5-9q4zw cost=1204ms retry=1\n' +
      '2024-03-18 08:00:05 INFO  requestId=9d4e4a71 handled by web-7d9c4b8f5-2xk9p cost=40ms\n' +
      '2024-03-18 08:00:06 ERROR requestId=71a34f88 handled by web-7d9c4b8f5-9q4zw cost=30004ms reason=query_timeout\n' +
      '2024-03-18 08:00:07 INFO  requestId=3c1a728f handled by web-7d9c4b8f5-2xk9p cost=43ms\n' +
      '2024-03-18 08:00:08 INFO  requestId=e059b41d handled by web-7d9c4b8f5-9q4zw cost=39ms\n',
    size: 16777216, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30'
  };

  /* ======================================================================
     六、/data 下的目录、配置与发布产物
     ----------------------------------------------------------------------
     注意：/data 是 100% 满的（termfs 的 disk 数据），所以这里只放**已存在**的
     文件；示例里"往 /data 写新文件"依旧会失败，那是剧情的一部分。
     ====================================================================== */

  /* 应用配置目录（docker bind mount 的 src、ln 硬链接的载体） */
  F['/data/app/conf/app.yml'] = {
    content:
      'server:\n' +
      '  port: 8080\n' +
      '  context-path: /orders\n' +
      'spring:\n' +
      '  datasource:\n' +
      '    url: jdbc:mysql://db-prod-01:3306/orders?useSSL=false&characterEncoding=utf8\n' +
      '    username: app\n' +
      '    password: ${DB_PASSWORD}\n' +
      '    hikari:\n' +
      '      maximum-pool-size: 50\n' +
      '      connection-timeout: 3000\n' +
      '  redis:\n' +
      '    host: cache-prod-01\n' +
      '    port: 6379\n' +
      '    timeout: 2000ms\n' +
      'order:\n' +
      '  timeout-ms: 5000\n' +
      '  slow-query-threshold-ms: 1000\n' +
      'logging:\n' +
      '  file:\n' +
      '    name: /data/app/logs/app.log\n' +
      '  level:\n' +
      '    root: INFO\n' +
      '    com.example.orders: DEBUG\n',
    size: 634, mode: '640', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30'
  };

  F['/data/app/conf/app.yml.20240311.bak'] = {
    content:
      'server:\n' +
      '  port: 8080\n' +
      'spring:\n' +
      '  datasource:\n' +
      '    url: jdbc:mysql://10.0.2.15:3306/orders?useSSL=false\n' +
      '    username: app\n' +
      '    password: ${DB_PASSWORD}\n' +
      'order:\n' +
      '  timeout-ms: 3000\n',
    size: 248, mode: '640', user: 'deploy', group: 'deploy', mtime: '2024-03-11 10:20'
  };

  F['/data/app/conf/datasource.properties'] = {
    content:
      'jdbc.driver=com.mysql.cj.jdbc.Driver\n' +
      'jdbc.url=jdbc:mysql://db-prod-01:3306/orders?useSSL=false&characterEncoding=utf8\n' +
      'jdbc.username=app\n' +
      'jdbc.password=${DB_PASSWORD}\n' +
      'jdbc.pool.maxActive=50\n' +
      'jdbc.pool.maxWait=3000\n',
    size: 246, mode: '640', user: 'deploy', group: 'deploy', mtime: '2024-03-11 10:21'
  };

  F['/data/app/conf/logback-spring.xml'] = {
    content:
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<configuration>\n' +
      '  <property name="LOG_HOME" value="/data/app/logs"/>\n' +
      '  <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">\n' +
      '    <file>${LOG_HOME}/app.log</file>\n' +
      '    <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">\n' +
      '      <fileNamePattern>${LOG_HOME}/app.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>\n' +
      '      <maxFileSize>100MB</maxFileSize>\n' +
      '      <maxHistory>7</maxHistory>\n' +
      '      <totalSizeCap>5GB</totalSizeCap>\n' +
      '    </rollingPolicy>\n' +
      '    <encoder>\n' +
      '      <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level %pid --- [%thread] %logger{36} : %msg%n</pattern>\n' +
      '    </encoder>\n' +
      '  </appender>\n' +
      '  <root level="INFO"><appender-ref ref="FILE"/></root>\n' +
      '</configuration>\n',
    size: 802, mode: '640', user: 'deploy', group: 'deploy', mtime: '2024-03-11 10:21'
  };

  /* 静态资源目录（cp -ru /data/app/static /data/backup/static 的源） */
  F['/data/app/static/index.html'] = {
    content:
      '<!DOCTYPE html>\n' +
      '<html lang="zh-CN">\n' +
      '<head>\n' +
      '  <meta charset="utf-8">\n' +
      '  <title>订单中心</title>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <h1>订单中心</h1>\n' +
      '  <p>静态资源由 Nginx 直接返回，不走后端。</p>\n' +
      '</body>\n' +
      '</html>\n',
    size: 218, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-15 14:20'
  };

  F['/data/app/static/app.js'] = {
    content:
      '(function () {\n' +
      '  function fetchOrders() {\n' +
      '    return fetch("/api/orders", { headers: { Accept: "application/json" } });\n' +
      '  }\n' +
      '  window.addEventListener("load", function () {\n' +
      '    fetchOrders().then(function (r) { return r.json(); }).then(render);\n' +
      '  });\n' +
      '})();\n',
    size: 236, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-15 14:20'
  };

  F['/data/app/static/app.css'] = {
    content:
      'body { font-family: "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 24px; }\n' +
      'h1 { color: #1f3a93; }\n' +
      '.order-table { width: 100%; border-collapse: collapse; }\n' +
      '.order-table th, .order-table td { border-bottom: 1px solid #e0e0e0; padding: 8px; }\n',
    size: 226, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-15 14:20'
  };

  F['/data/app/static/health.txt'] = { content: 'ok\n', size: 3, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-15 14:20' };

  /* 硬链接教学的载体（ln /data/app/order.log /data/app/order.log.hard） */
  F['/data/app/order.log'] = {
    content:
      '2024-03-18 09:41:18 ERROR orderId=8812 user=u10233 cost=30004ms reason=query_timeout\n' +
      '2024-03-18 09:42:07 ERROR orderId=8813 user=u10871 cost=30003ms reason=query_timeout\n' +
      '2024-03-18 09:43:03 ERROR orderId=8814 user=u11902 cost=30005ms reason=query_timeout\n' +
      '2024-03-18 09:44:12 ERROR orderId=8816 user=u10777 cost=0ms reason=disk_full\n',
    size: 33554432, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:44'
  };

  /* 发布目录：md5sum / sha256sum / unzip -l 的输入 */
  F['/data/dist/app-1.2.3.tar.gz'] = { content: '<binary>archive-268MB', size: 8388608, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:38' };
  F['/data/dist/web-1.2.3.tar.gz'] = { content: '<binary>archive-96MB', size: 4194304, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:39' };
  F['/data/dist/site.zip'] = { content: '<binary>archive-12MB', size: 2097152, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:39' };
  F['/data/dist/app.zip'] = { content: '<binary>archive-268MB', size: 6291456, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:39' };
  F['/data/dist/secret.zip'] = { content: '<binary>archive-4KB', size: 4096, mode: '600', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:39' };

  /* 备份目录：老的一月备份包 + split 出来的切片（db.part.* 拼接还原） */
  F['/data/backup/db_20240101.bak'] = { content: '<binary>archive-1.1GB', size: 268435456, mode: '644', user: 'root', group: 'root', mtime: '2024-01-01 03:20' };
  F['/data/backup/db_20240101.tar.gz'] = { content: '<binary>archive-1.1GB', size: 268435456, mode: '644', user: 'root', group: 'root', mtime: '2024-01-01 03:20' };
  F['/data/backup/app-2024-01-01.tar.gz'] = { content: '<binary>archive-880MB', size: 67108864, mode: '644', user: 'root', group: 'root', mtime: '2024-01-01 03:12' };
  F['/data/backup/db.part.aa'] = { content: '<binary>split-part-800MB', size: 33554432, mode: '644', user: 'root', group: 'root', mtime: '2024-03-17 03:25' };
  F['/data/backup/db.part.ab'] = { content: '<binary>split-part-800MB', size: 33554432, mode: '644', user: 'root', group: 'root', mtime: '2024-03-17 03:25' };
  F['/data/backup/db.part.ac'] = { content: '<binary>split-part-352MB', size: 16777216, mode: '644', user: 'root', group: 'root', mtime: '2024-03-17 03:25' };

  /* xtrabackup 的全量备份目录（`--prepare` / `--copy-back` 的目标）。
     真机上由 `xtrabackup --backup --target-dir=...` 生成，这里给出它之后
     一定会有的几个文件：备份元数据、InnoDB 系统表空间、以及 .ibd 数据文件。 */
  F['/data/backup/xtra-20240318/xtrabackup_info'] = {
    content:
      'uuid = 8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88\n' +
      'name = \n' +
      'tool_name = xtrabackup\n' +
      'tool_command = --defaults-file=/etc/my.cnf --backup --target-dir=/data/backup/xtra-20240318\n' +
      'tool_version = 8.0.35-27\n' +
      'ibbackup_version = 8.0.35-27\n' +
      'server_version = 8.0.36\n' +
      'start_time = 2024-03-18 03:20:11\n' +
      'end_time = 2024-03-18 03:34:52\n' +
      'lock_time = 0\n' +
      'binlog_pos = filename \'mysql-bin.000042\', position \'18422910\', GTID of the last change \'\'\n' +
      'innodb_from_lsn = 0\n' +
      'innodb_to_lsn = 884210442188\n' +
      'partial = N\n' +
      'incremental = N\n' +
      'format = xbstream\n' +
      'compressed = N\n' +
      'encrypted = N\n',
    size: 486, mode: '640', user: 'mysql', group: 'mysql', mtime: '2024-03-18 03:34'
  };

  F['/data/backup/xtra-20240318/xtrabackup_checkpoints'] = {
    content:
      'backup_type = full-prepared\n' +
      'from_lsn = 0\n' +
      'to_lsn = 884210442188\n' +
      'last_lsn = 884210443104\n' +
      'compact = 0\n' +
      'recover_binlog_info = 0\n' +
      'flushed_lsn = 884210442188\n',
    size: 178, mode: '640', user: 'mysql', group: 'mysql', mtime: '2024-03-18 03:34'
  };

  F['/data/backup/xtra-20240318/ibdata1'] = { content: '<binary>innodb-system-tablespace-12M', size: 12582912, mode: '640', user: 'mysql', group: 'mysql', mtime: '2024-03-18 03:34' };
  F['/data/backup/xtra-20240318/orders.ibd'] = { content: '<binary>innodb-table-orders-3.8G', size: 268435456, mode: '640', user: 'mysql', group: 'mysql', mtime: '2024-03-18 03:34' };
  F['/data/backup/xtra-20240318/mysql.ibd'] = { content: '<binary>innodb-mysql-schema-24M', size: 4194304, mode: '640', user: 'mysql', group: 'mysql', mtime: '2024-03-18 03:34' };

  /* 临时与归档目录里的内容 */
  F['/data/tmp/build.tar.gz'] = { content: '<binary>archive-320MB', size: 8388608, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30' };
  F['/data/tmp/build/app.jar.tmp'] = { content: '<binary>jar-content-88MB', size: 4194304, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30' };
  F['/data/tmp/upload/session-8f3c.tmp'] = { content: 'temp upload buffer\n', size: 1048576, mode: '600', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:44' };
  F['/data/old/nginx.conf.20240115.bak'] = { content: 'user  nginx;\nworker_processes  2;\n\nhttp {\n    include       /etc/nginx/mime.types;\n    access_log    /var/log/nginx/access.log  main;\n}\n', size: 142, mode: '644', user: 'root', group: 'root', mtime: '2024-01-15 10:02' };
  F['/data/old/yum.conf.20240120.bak'] = { content: '[main]\ncachedir=/var/cache/yum/$basearch/$releasever\nkeepcache=0\ndebuglevel=2\nlogfile=/var/log/yum.log\ngpgcheck=1\n', size: 132, mode: '644', user: 'root', group: 'root', mtime: '2024-01-20 11:15' };
  F['/data/old/mysql.conf.20240128.bak'] = { content: '[mysqld]\nmax_connections = 200\ninnodb_buffer_pool_size = 1G\nslow_query_log = 1\nlong_query_time = 2\n', size: 112, mode: '644', user: 'root', group: 'root', mtime: '2024-01-28 16:40' };
  F['/data/archive/app-1.2.1.tar.gz'] = { content: '<binary>archive-266MB', size: 4194304, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-10 09:38' };
  F['/data/restore/.keep'] = { content: '# 保留目录：还原时 db.part.* 拼接输出到这里\n', size: 48, mode: '644', user: 'root', group: 'root', mtime: '2024-03-17 03:30' };

  /* CSV：/data/csv 给 head/cat -A 用；/opt/app/data 给 awk -F, / sort -t, 用 */
  F['/data/csv/user.csv'] = {
    content:
      'user_id,user_name,dept,email,status\n' +
      '10233,张伟,订单中心,zhangwei@example.com,active\n' +
      '10871,李娜,订单中心,lina@example.com,active\n' +
      '10044,王强,支付组,wangqiang@example.com,active\n' +
      '11902,刘洋,风控组,liuyang@example.com,active\n' +
      '10777,陈静,订单中心,chenjing@example.com,disabled\n' +
      '11345,赵磊,支付组,zhaolei@example.com,active\n' +
      '12118,孙悦,风控组,sunyue@example.com,active\n' +
      '10456,周涛,订单中心,zhoutao@example.com,active\n' +
      '11003,吴敏,支付组,wumin@example.com,disabled\n' +
      '12677,郑凯,风控组,zhengkai@example.com,active\n',
    size: 512, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-15 11:30'
  };

  F['/opt/app/data/users.csv'] = {
    content:
      'uid,user_name,dept,phone\n' +
      '10233,张伟,订单中心,13800001001\n' +
      '10871,李娜,订单中心,13800001002\n' +
      '10044,王强,支付组,13800001003\n' +
      '11902,刘洋,风控组,13800001004\n' +
      '10777,陈静,订单中心,13800001005\n' +
      '11345,赵磊,支付组,13800001006\n',
    size: 268, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-15 11:30'
  };

  F['/opt/app/data/report.csv'] = {
    content:
      'date,service,orders,amount,avg_cost_ms\n' +
      '2024-03-18,order-service,18421,4281933.50,46\n' +
      '2024-03-17,order-service,21033,5120884.00,43\n' +
      '2024-03-16,order-service,19877,4711205.80,45\n' +
      '2024-03-15,order-service,22104,5398017.20,44\n' +
      '2024-03-14,order-service,20991,4988330.10,47\n' +
      '2024-03-13,order-service,18652,4302991.60,42\n' +
      '2024-03-12,order-service,17208,3988774.30,41\n',
    size: 386, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:00'
  };

  /* 上传目录：file -i 看编码（GBK 中文，真机上 file 会提示 charset=iso-8859-1） */
  F['/data/upload/report.csv'] = {
    content:
      'order_id,user_name,amount,created_at\n' +
      '8781,张伟,268.00,2024-03-18 09:30:01\n' +
      '8782,李娜,1299.00,2024-03-18 09:30:14\n' +
      '8783,王强,88.50,2024-03-18 09:31:02\n',
    size: 176, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:31'
  };

  F['/data/upload/invoice-8812.pdf'] = { content: '<binary>pdf-186KB', size: 190464, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:41' };

  /* 运维脚本（cat -A 查 CRLF） */
  F['/data/scripts/deploy.sh'] = {
    content:
      '#!/bin/bash\n' +
      '# 发布脚本（这个文件在 Windows 上编辑过，行尾混进了 CRLF，执行会报 bad interpreter）\n' +
      'set -euo pipefail\n' +
      '\n' +
      'APP=/data/app/app.jar\n' +
      'BACKUP=/data/backup/app-$(date +%F).jar\n' +
      '\n' +
      'cp -a "$APP" "$BACKUP"\n' +
      'systemctl stop myapp\n' +
      'cp -f /data/dist/app.jar "$APP"\n' +
      'systemctl start myapp\n' +
      'systemctl status myapp --no-pager | head -5\n',
    size: 402, mode: '755', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:35'
  };

  /* 服务清单：sort -u -o 就地排序去重（有重复行才讲得通） */
  F['/data/app/services.txt'] = {
    content:
      'order-service\n' +
      'payment-service\n' +
      'user-service\n' +
      'order-service\n' +
      'inventory-service\n' +
      'payment-service\n' +
      'gateway\n' +
      'order-service\n' +
      'notification-service\n',
    size: 128, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:20'
  };

  /* 用户清单：uniq -d 找重复（4 个账号各出现两次） */
  F['/data/user/list.txt'] = {
    content:
      'u10233\n' +
      'u10871\n' +
      'u10044\n' +
      'u11902\n' +
      'u10233\n' +
      'u10777\n' +
      'u11345\n' +
      'u10871\n' +
      'u12118\n' +
      'u10456\n' +
      'u11902\n' +
      'u11003\n',
    size: 96, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:10'
  };

  /* xargs 批量 ping 的主机清单 */
  F['/data/iplist.txt'] = {
    content:
      '10.0.1.21\n' +
      '10.0.1.22\n' +
      '10.0.1.23\n' +
      '10.0.1.24\n' +
      '10.0.1.31\n' +
      '10.0.1.32\n' +
      '10.0.2.15\n',
    size: 70, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:15'
  };

  /* 站点目录（chmod -R u=rwX,g=rX,o= /data/www、stat /data/www、ls -Z） */
  F['/data/www/index.html'] = {
    content:
      '<!DOCTYPE html>\n' +
      '<html lang="zh-CN">\n' +
      '<head><meta charset="utf-8"><title>订单中心</title></head>\n' +
      '<body><h1>It works!</h1></body>\n' +
      '</html>\n',
    size: 158, mode: '644', user: 'nginx', group: 'nginx', mtime: '2024-03-12 15:30'
  };
  F['/data/www/health.txt'] = { content: 'ok\n', size: 3, mode: '644', user: 'nginx', group: 'nginx', mtime: '2024-03-12 15:30' };
  F['/data/www/robots.txt'] = { content: 'User-agent: *\nDisallow: /admin\nDisallow: /api/internal/\n', size: 52, mode: '644', user: 'nginx', group: 'nginx', mtime: '2024-03-12 15:30' };

  /* 共享目录（chgrp dev / chmod 2770）与待转存目录 */
  F['/data/share/docs/接口说明.md'] = {
    content: '# 订单接口说明\n\n- `GET /api/orders` 查询列表\n- `GET /api/orders/{id}` 查询详情\n- `POST /api/orders` 创建订单\n',
    size: 168, mode: '664', user: 'deploy', group: 'dev', mtime: '2024-03-14 16:20'
  };
  F['/data/share/ops/上线检查表.txt'] = {
    content: '1. 备份数据库\n2. 构建并推送镜像到 SWR\n3. kubectl rollout status deploy/web -n my-app\n4. 观察 /var/log/nginx/error.log 五分钟\n',
    size: 142, mode: '664', user: 'deploy', group: 'dev', mtime: '2024-03-14 16:22'
  };
  F['/data/upload/.gitkeep'] = { content: '', size: 0, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-10 09:00' };

  /* ======================================================================
     七、系统配置与脚本（shell / linux-user / linux-net 分类）
     ====================================================================== */

  F['/etc/nsswitch.conf'] = {
    content:
      '# /etc/nsswitch.conf —— 名字服务的查询顺序（谁在前谁先被问）\n' +
      'passwd:     files sss\n' +
      'shadow:     files sss\n' +
      'group:      files sss\n' +
      'hosts:      files dns myhostname\n' +
      'bootparams: nisplus [NOTFOUND=return] files\n' +
      'ethers:     files\n' +
      'netmasks:   files\n' +
      'networks:   files\n' +
      'protocols:  files\n' +
      'services:   files sss\n' +
      'netgroup:   files sss\n' +
      'publickey:  nisplus\n' +
      'automount:  files sss\n' +
      'aliases:    files nisplus\n',
    size: 452, mode: '644', user: 'root', group: 'root', mtime: '2024-03-10 09:05'
  };

  F['/etc/sysctl.d/99-tuning.conf'] = {
    content:
      '# 生产调优参数（改完 sysctl -p /etc/sysctl.d/99-tuning.conf 生效）\n' +
      'net.core.somaxconn = 32768\n' +
      'net.core.netdev_max_backlog = 16384\n' +
      'net.ipv4.tcp_max_syn_backlog = 8192\n' +
      'net.ipv4.tcp_tw_reuse = 1\n' +
      'net.ipv4.tcp_fin_timeout = 30\n' +
      'net.ipv4.ip_local_port_range = 10240 65000\n' +
      'net.ipv4.tcp_rmem = 4096 87380 6291456\n' +
      'net.ipv4.tcp_wmem = 4096 16384 4194304\n' +
      'fs.file-max = 1000000\n' +
      'vm.swappiness = 10\n' +
      'vm.dirty_ratio = 20\n' +
      'vm.dirty_background_ratio = 10\n' +
      'vm.overcommit_memory = 1\n',
    size: 462, mode: '644', user: 'root', group: 'root', mtime: '2024-03-12 15:20'
  };

  /* MySQL 段：sed 的 /^\[debug\]/,/^\[/c 要能命中，所以后面要跟另一个段头 */
  F['/etc/app/app.conf'] = {
    content:
      '[main]\n' +
      'app_name = order-service\n' +
      'work_dir = /data/app\n' +
      'log_level = info\n' +
      'log_file = /data/app/logs/app.log\n' +
      '\n' +
      '[debug]\n' +
      'enable = false\n' +
      'trace_sql = false\n' +
      'dump_heap_on_oom = true\n' +
      'slow_query_threshold_ms = 1000\n' +
      '\n' +
      '[server]\n' +
      'listen = 0.0.0.0:8080\n' +
      'max_body_size = 2m\n' +
      'keepalive_timeout = 65\n' +
      '\n' +
      '[redis]\n' +
      'host = cache-prod-01\n' +
      'port = 6379\n' +
      'timeout_ms = 2000\n',
    size: 486, mode: '640', user: 'deploy', group: 'deploy', mtime: '2024-03-15 11:40'
  };

  F['/opt/scripts/strict-demo.sh'] = {
    content:
      '#!/bin/bash\n' +
      '# set -Eeuo pipefail：出错即停、未定义变量即停、管道里任一环失败即失败\n' +
      'set -Eeuo pipefail\n' +
      'IFS=$\'\\n\\t\'\n' +
      'trap \'echo "[ERROR] 第 $LINENO 行失败，退出码 $?" >&2\' ERR\n' +
      '\n' +
      'readonly TARGET_DIR=/data/backup\n' +
      'readonly LOG=/var/log/backup.log\n' +
      '\n' +
      'main() {\n' +
      '    : "${OBS_BUCKET:?必须设置 OBS_BUCKET}"\n' +
      '    mkdir -p "$TARGET_DIR"\n' +
      '    tar czf "$TARGET_DIR/www-$(date +%F).tar.gz" /var/www/html\n' +
      '    echo "$(date "+%F %T") backup ok" >> "$LOG"\n' +
      '}\n' +
      '\n' +
      'main "$@"\n',
    size: 512, mode: '755', user: 'root', group: 'root', mtime: '2024-03-14 20:10'
  };

  F['/etc/sudoers.d/deploy'] = {
    content:
      '# deploy 账号的免密提权范围（容器重启、备份由自动化调用）\n' +
      'deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart myapp, /bin/systemctl stop myapp, /bin/systemctl start myapp\n' +
      'deploy ALL=(ALL) NOPASSWD: /opt/scripts/backup.sh\n' +
      'Defaults:deploy !requiretty\n',
    size: 296, mode: '440', user: 'root', group: 'root', mtime: '2024-03-14 20:30'
  };

  /* ======================================================================
     八、cloud-init / KVM
     ----------------------------------------------------------------------
     user-data 与 meta-data 放在 /tmp（cloud-localds 打包前的暂存），
     cloud-init 的两个日志是排障现场：user-data 里留了一个 Tab 缩进错误，
     正是 `grep -n "\t" /tmp/user-data` 要找的东西。
     ====================================================================== */

  F['/tmp/user-data'] = {
    content:
      '#cloud-config\n' +
      '# 云主机初始化：主机名、账号、SSH 公钥、基础软件\n' +
      'hostname: web-prod-02\n' +
      'manage_etc_hosts: true\n' +
      'timezone: Asia/Shanghai\n' +
      '\n' +
      'users:\n' +
      '  - name: deploy\n' +
      '    groups: wheel\n' +
      '    sudo: [\'ALL=(ALL) NOPASSWD:ALL\']\n' +
      '    shell: /bin/bash\n' +
      '    ssh_authorized_keys:\n' +
      '      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH7kQ2mNv8xLpT4rWcY1bE6sJdA9fG3hK0nR5uV2xZ8q deploy@web-prod-01\n' +
      '    lock_passwd: true\n' +
      '\n' +
      'package_update: true\n' +
      'packages:\n' +
      '  - nginx\n' +
      '  - chrony\n' +
      '  - qemu-guest-agent\n' +
      '\t# 这一行是 Tab 缩进，YAML 只认空格 —— 整段 packages 都会解析失败\n' +
      '\n' +
      'write_files:\n' +
      '  - path: /etc/motd\n' +
      '    content: |\n' +
      '      生产环境 · 变更需走审批\n' +
      '    permissions: \'0644\'\n' +
      '\n' +
      'runcmd:\n' +
      '  - systemctl enable --now nginx chronyd qemu-guest-agent\n' +
      '  - echo "cloud-init finished at $(date)" >> /var/log/boot-init.log\n',
    size: 1024, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 08:40'
  };

  F['/tmp/meta-data'] = {
    content:
      'instance-id: i-0f3c1a724d5e4b91\n' +
      'local-hostname: web-prod-02\n' +
      'public-keys:\n' +
      '  - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH7kQ2mNv8xLpT4rWcY1bE6sJdA9fG3hK0nR5uV2xZ8q deploy@web-prod-01\n' +
      'network-interfaces: |\n' +
      '  auto eth0\n' +
      '  iface eth0 inet static\n' +
      '  address 10.0.1.33\n' +
      '  netmask 255.255.255.0\n' +
      '  gateway 10.0.1.1\n',
    size: 386, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 08:40'
  };

  F['/tmp/network-config'] = {
    content:
      'version: 2\n' +
      'ethernets:\n' +
      '  eth0:\n' +
      '    addresses: [10.0.1.33/24]\n' +
      '    gateway4: 10.0.1.1\n' +
      '    nameservers:\n' +
      '      addresses: [100.125.1.250, 114.114.114.114]\n',
    size: 178, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 08:40'
  };

  /* 提交给云平台的 user-data 副本（`base64 -w0 cloud-init.yaml > userdata.txt`
     是华为云/阿里云 CLI 创建实例时传 user_data 的标准写法）。
     与 /tmp/user-data 是同一份内容，只是换了标准文件名。 */
  F['/root/cloud-init.yaml'] = {
    content:
      '#cloud-config\n' +
      '# 云主机初始化：主机名、账号、SSH 公钥、基础软件\n' +
      'hostname: web-prod-02\n' +
      'manage_etc_hosts: true\n' +
      'timezone: Asia/Shanghai\n' +
      '\n' +
      'users:\n' +
      '  - name: deploy\n' +
      '    groups: wheel\n' +
      '    sudo: [\'ALL=(ALL) NOPASSWD:ALL\']\n' +
      '    shell: /bin/bash\n' +
      '    ssh_authorized_keys:\n' +
      '      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH7kQ2mNv8xLpT4rWcY1bE6sJdA9fG3hK0nR5uV2xZ8q deploy@web-prod-01\n' +
      '    lock_passwd: true\n' +
      '\n' +
      'package_update: true\n' +
      'packages:\n' +
      '  - nginx\n' +
      '  - chrony\n' +
      '  - qemu-guest-agent\n' +
      '\n' +
      'runcmd:\n' +
      '  - systemctl enable --now nginx chronyd qemu-guest-agent\n' +
      '  - echo "cloud-init finished at $(date)" >> /var/log/boot-init.log\n',
    size: 986, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 08:40'
  };

  /* cloud-init 主日志：启动阶段（网络、磁盘、模块）都正常 */
  F['/var/log/cloud-init.log'] = {
    content:
      '2024-03-18 08:40:02,114 - util.py[DEBUG]: Cloud-init v. 22.2.2 running \'init\' at Mon, 18 Mar 2024 08:40:02 +0800. Up 8.31 seconds.\n' +
      '2024-03-18 08:40:02,336 - stages.py[INFO]: Loaded config: [DatasourceNoCloudNet, DataSourceConfigDriveNet]\n' +
      '2024-03-18 08:40:02,512 - __init__.py[DEBUG]: Looking for vendordata in /var/lib/cloud/seed/nocloud-net\n' +
      '2024-03-18 08:40:03,004 - handlers.py[DEBUG]: start: init-network/config-ssh-hostkeys\n' +
      '2024-03-18 08:40:03,881 - cc_set_hostname.py[DEBUG]: Setting the hostname to web-prod-02\n' +
      '2024-03-18 08:40:04,220 - cc_users_groups.py[INFO]: Created user deploy with groups wheel\n' +
      '2024-03-18 08:40:05,118 - cc_ssh_import_id.py[WARNING]: Skipped: no ssh-import-id configured\n' +
      '2024-03-18 08:40:07,662 - cc_package_update_upgrade_install.py[DEBUG]: Running package update\n' +
      '2024-03-18 08:40:12,004 - cc_yaml.py[WARNING]: YAML didn\'t parse correctly. Could not determine a constructor for the tag\n' +
      '2024-03-18 08:40:12,006 - cc_yaml.py[ERROR]: Failed to load user-data: mapping values are not allowed here at line 22 column 1\n' +
      '2024-03-18 08:40:12,110 - stages.py[ERROR]: Failed to apply module cc_package_update_upgrade_install\n' +
      '2024-03-18 08:40:12,224 - util.py[WARNING]: Running module package-update-upgrade-install (<module \'cloudinit.config.cc_package_update_upgrade_install\'>) failed\n' +
      '2024-03-18 08:40:12,330 - stages.py[INFO]: Applying (post) module final-message\n' +
      '2024-03-18 08:40:12,455 - handlers.py[DEBUG]: finish: init-network: SUCCESS\n',
    size: 2097152, mode: '640', user: 'root', group: 'root', mtime: '2024-03-18 08:40'
  };

  /* cloud-init 输出日志：runcmd 的输出与报错都在这里 */
  F['/var/log/cloud-init-output.log'] = {
    content:
      'Cloud-init v. 22.2.2 running \'modules:config\' at Mon, 18 Mar 2024 08:40:07 +0800. Up 13.44 seconds\n' +
      'Hit 1: repository base from http://repo.huaweicloud.com/euler/2.10/os/x86_64\n' +
      'Last metadata expiration check: 0:00:04 ago on Mon 18 Mar 2024 08:40:08 AM CST.\n' +
      'Package nginx-1.20.1-1.el7.x86_64 is already installed.\n' +
      'Package chrony-4.2-1.el7.x86_64 is already installed.\n' +
      'Dependencies resolved.\n' +
      'Nothing to do.\n' +
      'Complete!\n' +
      'Cloud-init v. 22.2.2 running \'modules:final\' at Mon, 18 Mar 2024 08:40:12 +0800. Up 18.21 seconds\n' +
      'Failed to apply module cc_package_update_upgrade_install, see /var/log/cloud-init.log for details\n' +
      'Traceback (most recent call last):\n' +
      '  File "/usr/lib/python3.9/site-packages/cloudinit/config/cc_package_update_upgrade_install.py", line 108, in handle\n' +
      '    raise ValueError("packages 段解析失败：第 22 行用了 Tab 缩进")\n' +
      'ValueError: packages 段解析失败：第 22 行用了 Tab 缩进\n' +
      'Mar 18 08:40:12 web-prod-02 systemd[1]: Starting My Web App...\n' +
      'Mar 18 08:40:14 web-prod-02 systemd[1]: Started My Web App.\n' +
      'Cloud-init v. 22.2.2 finished at Mon, 18 Mar 2024 08:40:14 +0800. Datasource DataSourceNoCloudNet.  Up 20.33 seconds\n',
    size: 4194304, mode: '640', user: 'root', group: 'root', mtime: '2024-03-18 08:40'
  };

  F['/var/log/boot-init.log'] = {
    content:
      '初始化开始 Mon Mar 18 08:40:12 CST 2024\n' +
      'nginx 已启用并启动\n' +
      'chronyd 已启用并启动\n' +
      'qemu-guest-agent 已启用并启动\n',
    size: 208, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 08:40'
  };

  /* /var/log/boot.log：more +100 要看的启动日志（20 行，真机上通常是几百行） */
  F['/var/log/boot.log'] = {
    content:
      'Mar 18 08:39:52 web-prod-01 systemd[1]: Started Show Plymouth Boot Screen.\n' +
      'Mar 18 08:39:53 web-prod-01 systemd[1]: Reached target Paths.\n' +
      'Mar 18 08:39:53 web-prod-01 systemd[1]: Reached target Basic System.\n' +
      'Mar 18 08:39:54 web-prod-01 kernel: EXT4-fs (vda1): mounted filesystem with ordered data mode\n' +
      'Mar 18 08:39:54 web-prod-01 systemd-fsck[612]: /dev/vda1: clean, 312884/2621440 files, 3145728/10485760 blocks\n' +
      'Mar 18 08:39:55 web-prod-01 systemd[1]: Mounting /data...\n' +
      'Mar 18 08:39:55 web-prod-01 kernel: EXT4-fs (vdb1): mounted filesystem with ordered data mode\n' +
      'Mar 18 08:39:55 web-prod-01 systemd[1]: Mounted /data.\n' +
      'Mar 18 08:39:56 web-prod-01 systemd[1]: Starting Network Manager...\n' +
      'Mar 18 08:39:58 web-prod-01 NetworkManager[881]: <info> device (eth0): state change: config -> ip-config\n' +
      'Mar 18 08:39:59 web-prod-01 NetworkManager[881]: <info> dhcp4 (eth0): address 10.0.1.23/24 gateway 10.0.1.1\n' +
      'Mar 18 08:40:00 web-prod-01 systemd[1]: Reached target Network is Online.\n' +
      'Mar 18 08:40:01 web-prod-01 systemd[1]: Started OpenSSH server daemon.\n' +
      'Mar 18 08:40:02 web-prod-01 sshd[1180]: Server listening on 0.0.0.0 port 22.\n' +
      'Mar 18 08:40:04 web-prod-01 systemd[1]: Started Docker Application Container Engine.\n' +
      'Mar 18 08:40:06 web-prod-01 dockerd[1204]: time="2024-03-18T08:40:06.114Z" level=info msg="Loading containers: done."\n' +
      'Mar 18 08:40:11 web-prod-01 systemd[1]: Started The nginx HTTP and reverse proxy server.\n' +
      'Mar 18 08:40:14 web-prod-01 systemd[1]: Started My Web App.\n' +
      'Mar 18 08:40:15 web-prod-01 systemd[1]: Reached target Multi-User System.\n' +
      'Mar 18 08:40:15 web-prod-01 systemd[1]: Startup finished in 23.418s (kernel) + 18.204s (userspace) = 41.622s.\n',
    size: 2097152, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 08:40'
  };

  /* 健康检查脚本的日志：脚本里 log "重启服务" 会写进来（grep -c 统计重启次数） */
  F['/var/log/healthcheck.log'] = {
    content:
      '[2024-03-18 09:20:03] 健康检查通过（第 1 次），HTTP 200\n' +
      '[2024-03-18 09:25:03] 健康检查失败：curl 退出码 28（超时 5s）\n' +
      '[2024-03-18 09:25:08] 健康检查失败：curl 退出码 28（超时 5s）\n' +
      '[2024-03-18 09:25:13] 健康检查失败：curl 退出码 28（超时 5s）\n' +
      '[2024-03-18 09:25:13] 连续 3 次失败，重启服务 myapp\n' +
      '[2024-03-18 09:25:21] 重启完成，第 1 次复检 HTTP 200\n' +
      '[2024-03-18 09:30:04] 健康检查通过（第 1 次），HTTP 200\n' +
      '[2024-03-18 09:40:04] 健康检查通过（第 1 次），HTTP 200\n' +
      '[2024-03-18 09:45:04] 健康检查失败：curl 退出码 28（超时 5s）\n' +
      '[2024-03-18 09:45:09] 健康检查失败：curl 退出码 28（超时 5s）\n' +
      '[2024-03-18 09:45:14] 健康检查失败：curl 退出码 28（超时 5s）\n' +
      '[2024-03-18 09:45:14] 连续 3 次失败，重启服务 myapp\n' +
      '[2024-03-18 09:45:22] 重启完成，第 1 次复检 HTTP 200\n' +
      '[2024-03-18 09:50:04] 健康检查通过（第 1 次），HTTP 200\n',
    size: 65536, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:50'
  };

  /* 批量 ssh 巡检的按主机输出（cat 一个 /var/log/batch-* 目录下的 10.0.1.21.out） */
  F['/var/log/batch-2024-03-18_094502/10.0.1.21.out'] = {
    content:
      ' 09:45:06 up 42 days,  3:12,  1 user,  load average: 0.42, 0.68, 0.71\n' +
      'Filesystem      Size  Used Avail Use% Mounted on\n' +
      '/dev/vda1        40G   12G   26G  32% /\n' +
      '/dev/vdb1       200G  189G  1.2G 100% /data\n' +
      '10.0.1.21 正常\n',
    size: 4096, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:45'
  };

  F['/var/log/batch-2024-03-18_094502/10.0.1.22.out'] = {
    content:
      ' 09:45:06 up 42 days,  3:12,  1 user,  load average: 0.31, 0.44, 0.52\n' +
      'Filesystem      Size  Used Avail Use% Mounted on\n' +
      '/dev/vda1        40G   11G   27G  30% /\n' +
      '/dev/vdb1       200G   64G  126G  34% /data\n' +
      '10.0.1.22 正常\n',
    size: 4096, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:45'
  };

  /* 主机清单：批量 ssh 脚本的输入 */
  F['/opt/scripts/hosts.txt'] = {
    content:
      '10.0.1.21\n' +
      '10.0.1.22\n' +
      '# 10.0.1.23 维护中\n' +
      '10.0.1.24\n' +
      '10.0.1.31\n' +
      '10.0.1.32\n',
    size: 66, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:44'
  };

  /* ======================================================================
     九、安全 / 性能
     ----------------------------------------------------------------------
     剧情延续：爆破登录（secure 里已有一批 Failed password）、masscan 扫内网、
     lynis 审计报告、OOM 与 GC 现场。
     ====================================================================== */

  F['/var/log/lynis-report.dat'] = {
    content:
      '# Lynis report · generated 2024-03-17 22:14:08\n' +
      '# 主机: web-prod-01 (EulerOS 2.0 SP10)\n' +
      '\n' +
      'warning[]=AUTH-9286|The SSH daemon is configured to allow password authentication|OpenSSH|PermitRootLogin\n' +
      'warning[]=PKGS-7392|Found 12 vulnerable packages that need to be updated|yum\n' +
      'warning[]=FILE-7524|Permissions of /etc/sudoers.d/deploy are too permissive (0640 instead of 0440)|-\n' +
      'warning[]=KRNL-6000|No kernel hardening parameters found in /etc/sysctl.d|-\n' +
      'suggestion[]=SSH-7408|Consider hardening SSH configuration (MaxAuthTries 3, LogLevel VERBOSE)|OpenSSH\n' +
      'suggestion[]=DEB-0880|Install a malware scanner (rkhunter/chkrootkit) and run it weekly|-|rkhunter\n' +
      'suggestion[]=LOGG-2154|Enable logging to a remote syslog server|-|rsyslog\n' +
      'suggestion[]=FIRE-4590|Configure a firewall (firewalld is inactive)|firewalld\n' +
      'suggestion[]=HRDN-7222|Set a password on the GRUB bootloader|-|grub\n' +
      '\n' +
      'hardening_index=68\n' +
      'tests_performed=253\n' +
      'warnings_found=4\n' +
      'suggestions_found=5\n',
    size: 2097152, mode: '640', user: 'root', group: 'root', mtime: '2024-03-17 22:14'
  };

  /* masscan 输出：格式固定 `open <port> tcp <ip>`，awk $4 取 IP */
  F['/tmp/scan.txt'] = {
    content:
      '#masscan 1.3.2 scan initiated Sat Mar 16 21:03:44 2024\n' +
      '#rate: 1000.00, 65536 ports scanned in 66.42 seconds\n' +
      'open tcp 22 10.0.1.21 1710594224\n' +
      'open tcp 80 10.0.1.21 1710594224\n' +
      'open tcp 22 10.0.1.22 1710594225\n' +
      'open tcp 8080 10.0.1.22 1710594225\n' +
      'open tcp 22 10.0.1.23 1710594226\n' +
      'open tcp 80 10.0.1.23 1710594226\n' +
      'open tcp 8080 10.0.1.23 1710594226\n' +
      'open tcp 22 10.0.1.24 1710594227\n' +
      'open tcp 3306 10.0.2.15 1710594228\n' +
      'open tcp 22 10.0.2.15 1710594228\n' +
      'open tcp 6379 10.0.2.16 1710594229\n' +
      'open tcp 22 10.0.1.23 1710594230\n' +
      '#masscan done at Sat Mar 16 21:04:51 2024\n',
    size: 4096, mode: '644', user: 'root', group: 'root', mtime: '2024-03-16 21:04'
  };

  /* 历史 secure 归档：爆破失败 + 一次成功登录（zgrep "Accepted"） */
  F['/var/log/secure-20240316.gz'] = {
    gz: true,
    content:
      'Mar 16 02:14:11 web-prod-01 sshd[20114]: Failed password for invalid user admin from 198.51.100.77 port 40118 ssh2\n' +
      'Mar 16 02:14:13 web-prod-01 sshd[20116]: Failed password for invalid user root from 198.51.100.77 port 40119 ssh2\n' +
      'Mar 16 02:14:15 web-prod-01 sshd[20118]: Failed password for invalid user test from 198.51.100.77 port 40120 ssh2\n' +
      'Mar 16 02:14:18 web-prod-01 sshd[20120]: Failed password for invalid user oracle from 198.51.100.77 port 40121 ssh2\n' +
      'Mar 16 08:31:04 web-prod-01 sshd[21344]: Accepted publickey for deploy from 203.0.113.25 port 50881 ssh2\n' +
      'Mar 16 08:31:04 web-prod-01 sshd[21344]: pam_unix(sshd:session): session opened for user deploy\n' +
      'Mar 16 09:02:19 web-prod-01 sudo:   deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/bin/systemctl restart myapp\n',
    size: 1048576, mode: '600', user: 'root', group: 'root', mtime: '2024-03-17 00:00'
  };

  F['/var/log/secure-20240317.gz'] = {
    gz: true,
    content:
      'Mar 17 03:22:41 web-prod-01 sshd[22101]: Failed password for invalid user ubuntu from 198.51.100.77 port 41220 ssh2\n' +
      'Mar 17 03:22:44 web-prod-01 sshd[22103]: Failed password for invalid user postgres from 198.51.100.77 port 41221 ssh2\n' +
      'Mar 17 07:58:12 web-prod-01 sshd[23004]: Accepted publickey for deploy from 203.0.113.25 port 51102 ssh2\n' +
      'Mar 17 07:58:12 web-prod-01 sshd[23004]: pam_unix(sshd:session): session opened for user deploy\n' +
      'Mar 17 18:40:07 web-prod-01 sshd[24881]: Accepted publickey for deploy from 10.0.1.23 port 44886 ssh2\n',
    size: 1048576, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 00:00'
  };

  /* JMeter 结果文件：首行必须与 jmeter -l 的表头一致 */
  F['/tmp/result.jtl'] = {
    content:
      'timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,sentBytes,grpThreads,allThreads,URL,Latency,IdleTime,Connect\n' +
      '1710726122114,41,GET /api/orders,200,OK,Thread Group 1-1,text,true,,1842,142,1,1,http://10.0.1.31:8080/api/orders,41,0,3\n' +
      '1710726122255,44,GET /api/orders,200,OK,Thread Group 1-2,text,true,,1877,142,2,2,http://10.0.1.32:8080/api/orders,44,0,4\n' +
      '1710726122396,30004,GET /api/orders/8812,500,Internal Server Error,Thread Group 1-3,text,false,query timeout after 5000ms,412,142,3,3,http://10.0.1.31:8080/api/orders/8812,30004,0,3\n' +
      '1710726122537,52,GET /api/orders/8813,200,OK,Thread Group 1-4,text,true,,1764,142,4,4,http://10.0.1.32:8080/api/orders/8813,52,0,5\n' +
      '1710726122678,47,GET /api/products,200,OK,Thread Group 1-5,text,true,,2107,142,5,5,http://10.0.1.31:8080/api/products,47,0,3\n',
    size: 2097152, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:42'
  };

  F['/data/images/rocky9-base.qcow2'] = { content: '<binary>qcow2-image-1.2GB', size: 734003200, mode: '644', user: 'root', group: 'root', mtime: '2024-03-10 11:20' };

  /* qcow2 的"来源"原始镜像：qemu-img convert 从 raw 转成 qcow2 是镜像制作的第一步，
     `/data/images/` 下同时留着 raw 与 qcow2 才是真实现场（raw 只在转换期间需要）。 */
  F['/data/images/rocky9.raw'] = { content: '<binary>raw-image-2.0GB', size: 629145600, mode: '644', user: 'root', group: 'root', mtime: '2024-03-10 11:08' };

  /* ======================================================================
     十、站点目录 / 主机文件 / 控制面文件
     ----------------------------------------------------------------------
     统一约定：文档里 /data/www 才是这个站的站点根，但 nginx 教程里反复出现
     的 `/usr/share/nginx/html`（RPM 版 Nginx 的默认 root）也补上，两处内容各自
     自洽；`/etc/services`、`/usr/local/bin/nginx`、`/etc/kubernetes/*` 都是
     一台跑着业务与容器的机器上**本来就该有**的东西。
     ====================================================================== */

  F['/usr/share/nginx/html/index.html'] = {
    content:
      '<!DOCTYPE html>\n' +
      '<html>\n' +
      '<head>\n' +
      '    <title>Welcome to nginx!</title>\n' +
      '    <style>body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }</style>\n' +
      '</head>\n' +
      '<body>\n' +
      '<h1>Welcome to nginx!</h1>\n' +
      '<p>If you see this page, the nginx web server is successfully installed and working. Further configuration is required.</p>\n' +
      '<p>For online documentation and support please refer to <a href="https://nginx.org/">nginx.org</a>.</p>\n' +
      '<p><em>Thank you for using nginx.</em></p>\n' +
      '</body>\n' +
      '</html>\n',
    size: 642, mode: '644', user: 'root', group: 'root', mtime: '2024-03-05 08:00'
  };

  F['/usr/share/nginx/html/50x.html'] = {
    content:
      '<!DOCTYPE html>\n' +
      '<html>\n' +
      '<head><title>Error</title></head>\n' +
      '<body>\n' +
      '<center><h1>502 Bad Gateway</h1></center>\n' +
      '<hr><center>nginx</center>\n' +
      '</body>\n' +
      '</html>\n',
    size: 196, mode: '644', user: 'root', group: 'root', mtime: '2024-03-05 08:00'
  };

  /* nginx 二进制：`file` 只看内容前缀，<binary> 会被识别成 ELF/可执行数据 */
  F['/usr/local/bin/nginx'] = { content: '<binary>ELF-64bit-x86-64-not-stripped', size: 1258291, mode: '755', user: 'root', group: 'root', mtime: '2024-03-05 08:00' };
  F['/usr/local/bin/hcloud'] = { content: '<binary>ELF-64bit-x86-64-stripped', size: 17825792, mode: '755', user: 'root', group: 'root', mtime: '2024-03-12 14:02' };
  F['/usr/local/bin/obsutil'] = { content: '<binary>ELF-64bit-x86-64-stripped', size: 25165824, mode: '755', user: 'root', group: 'root', mtime: '2024-03-12 14:05' };

  /* /etc/services：端口与服务名对照表（more /etc/services 只看前几屏就够） */
  F['/etc/services'] = {
    content:
      '# /etc/services —— 常用端口与服务名对照（IANA 风格，节选）\n' +
      '# service-name  port/protocol  [aliases]\n' +
      'ftp             21/tcp\n' +
      'ssh             22/tcp                          # Secure Shell\n' +
      'ssh             22/udp\n' +
      'telnet          23/tcp\n' +
      'smtp            25/tcp          mail\n' +
      'domain          53/tcp          nameserver      # DNS\n' +
      'domain          53/udp          nameserver\n' +
      'bootps          67/udp          dhcp\n' +
      'bootpc          68/udp          dhcp\n' +
      'tftp            69/udp\n' +
      'http            80/tcp          www www-http    # WorldWideWeb HTTP\n' +
      'http            80/udp\n' +
      'kerberos        88/tcp          krb5\n' +
      'pop3            110/tcp         pop-3\n' +
      'imap            143/tcp         imap2\n' +
      'snmp            161/udp         snmp\n' +
      'ldap            389/tcp\n' +
      'https           443/tcp         https           # http protocol over TLS/SSL\n' +
      'https           443/udp\n' +
      'syslog          514/udp\n' +
      'smtps           465/tcp         smtps\n' +
      'submission      587/tcp         submission\n' +
      'ldaps           636/tcp         ldapssl\n' +
      'rsync           873/tcp\n' +
      'ftps-data       989/tcp\n' +
      'imaps           993/tcp\n' +
      'pop3s           995/tcp\n' +
      'nfs             2049/tcp        nfsd\n' +
      'mysql           3306/tcp\n' +
      'postgresql      5432/tcp\n' +
      'redis           6379/tcp\n' +
      'http-alt        8080/tcp        webcache\n' +
      'https-alt       8443/tcp\n' +
      'elasticsearch   9200/tcp\n' +
      'prometheus      9090/tcp\n' +
      'node-exporter   9100/tcp\n' +
      'zabbix-agent    10050/tcp\n' +
      'zabbix-trapper  10051/tcp\n' +
      'kubernetes-api  6443/tcp\n' +
      'etcd-client     2379/tcp\n' +
      'etcd-server     2380/tcp\n' +
      'kubelet         10250/tcp\n',
    size: 1024, mode: '644', user: 'root', group: 'root', mtime: '2024-03-05 08:00'
  };

  /* 手改后待切换的新版 nginx.conf（`mv -i nginx.conf.new nginx.conf` 教学）：
     多了 gzip、把 worker_connections 提到 20480，并把 conf.d 收进来。 */
  F['/etc/nginx/nginx.conf.new'] = {
    content:
      'user  nginx;\n' +
      'worker_processes  auto;\n' +
      '\n' +
      'events {\n' +
      '    worker_connections  20480;\n' +
      '}\n' +
      '\n' +
      'http {\n' +
      '    include       /etc/nginx/mime.types;\n' +
      '    default_type  application/octet-stream;\n' +
      '    access_log    /var/log/nginx/access.log  main;\n' +
      '    sendfile        on;\n' +
      '    keepalive_timeout  65;\n' +
      '    gzip  on;\n' +
      '    gzip_min_length 1k;\n' +
      '    gzip_types text/plain text/css application/json application/javascript;\n' +
      '\n' +
      '    include /etc/nginx/conf.d/*.conf;\n' +
      '}\n',
    size: 486, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:40'
  };

  /* 各类定时任务的落点（后门排查：陌生计划任务是最常见的一种） */
  F['/etc/cron.d/0hourly'] = {
    content:
      'SHELL=/bin/bash\n' +
      'PATH=/sbin:/bin:/usr/sbin:/usr/bin\n' +
      'MAILTO=root\n' +
      '01 * * * * root run-parts /etc/cron.hourly\n',
    size: 118, mode: '644', user: 'root', group: 'root', mtime: '2024-03-05 08:00'
  };

  F['/etc/cron.hourly/0anacron'] = {
    content:
      '#!/bin/sh\n' +
      '# 由 /etc/cron.d/0hourly 调起，交给 anacron 决定是否该跑 daily/weekly 任务\n' +
      '/usr/sbin/anacron -s\n',
    size: 96, mode: '755', user: 'root', group: 'root', mtime: '2024-03-05 08:00'
  };

  /* /data/test 是"运维拿来做试验"的目录（touch -d、truncate 的目标） */
  F['/data/test/old.log'] = {
    content:
      '2024-01-01 08:00:00 INFO  历史日志：清理策略上线前的最后一份留存\n' +
      '2024-01-01 08:00:01 INFO  retention=7d, 超过 7 天的日志由 find -mtime +7 -delete 清理\n',
    size: 168, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-01-01 08:00'
  };

  F['/data/test/disk.img'] = { content: '<binary>sparse-file-100M', size: 5242880, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:20' };

  /* Docker 卷的挂载点（docker volume inspect 拿它去 du） */
  F['/var/lib/docker/volumes/mysqldata/_data/ibdata1'] = { content: '<binary>innodb-system-tablespace-12M', size: 12582912, mode: '660', user: 'root', group: 'docker', mtime: '2024-03-18 09:45' };
  F['/var/lib/docker/volumes/mysqldata/_data/orders.ibd'] = { content: '<binary>innodb-table-orders-3.8G', size: 1073741824, mode: '660', user: 'root', group: 'docker', mtime: '2024-03-18 09:45' };
  F['/var/lib/docker/volumes/mysqldata/_data/mysql-bin.000042'] = { content: '<binary>binlog-256M', size: 268435456, mode: '660', user: 'root', group: 'docker', mtime: '2024-03-18 09:45' };

  /* 容器日志目录（Docker 默认 json-file 驱动，一个容器一个目录一个 -json.log） */
  F['/var/lib/docker/containers/c9f2a71b3d05e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1/c9f2a71b3d05-json.log'] = {
    content:
      '{"log":"2024-03-18T09:38:33.902000000Z  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3\\n","stream":"stdout","time":"2024-03-18T09:38:33.902Z"}\n' +
      '{"log":"2024-03-18T09:41:18.552000000Z ERROR 1 --- [http-nio-8080-exec-4] c.e.o.OrderService : query timeout after 5000ms, orderId=8812\\n","stream":"stdout","time":"2024-03-18T09:41:18.552Z"}\n' +
      '{"log":"2024-03-18T09:44:12.660000000Z ERROR 1 --- [http-nio-8080-exec-6] c.e.o.FileLogAppender : No space left on device\\n","stream":"stderr","time":"2024-03-18T09:44:12.660Z"}\n',
    size: 33554432, mode: '640', user: 'root', group: 'docker', mtime: '2024-03-18 09:44'
  };

  F['/var/lib/docker/containers/a1b4c7d9e206f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3/a1b4c7d9e206-json.log'] = {
    content:
      '{"log":"2024-03-16T10:02:11.114000000Z [Note] [Entrypoint]: Entrypoint script for MySQL Server 8.0 started.\\n","stream":"stdout","time":"2024-03-16T10:02:11.114Z"}\n' +
      '{"log":"2024-03-18T09:41:18.882000000Z [Warning] [MY-010055] [Server] IP address \'10.0.1.23\' could not be resolved\\n","stream":"stderr","time":"2024-03-18T09:41:18.882Z"}\n' +
      '{"log":"2024-03-18T09:44:12.771000000Z [ERROR] [MY-012592] [InnoDB] Operating system error number 28 in a file operation.\\n","stream":"stderr","time":"2024-03-18T09:44:12.771Z"}\n',
    size: 894435328, mode: '640', user: 'root', group: 'docker', mtime: '2024-03-18 09:44'
  };

  F['/var/lib/docker/containers/e3f6a9b2c508d4f6a8b0c2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4/e3f6a9b2c508-json.log'] = {
    content:
      '{"log":"1:C 16 Mar 2024 10:03:40.219 * Ready to accept connections tcp\\n","stream":"stdout","time":"2024-03-16T10:03:40.219Z"}\n' +
      '{"log":"1:M 18 Mar 2024 09:41:19.004 # WARNING Memory overcommit must be enabled!\\n","stream":"stdout","time":"2024-03-18T09:41:19.004Z"}\n',
    size: 20971520, mode: '640', user: 'root', group: 'docker', mtime: '2024-03-18 09:41'
  };

  /* ======================================================================
     十一、kubeadm 控制面现场
     ----------------------------------------------------------------------
     `kubeadm init` 之后的机器上，这些文件本来就存在：静态 Pod 清单目录、
     admin.conf（kubeconfig）、etcd 数据目录。补上它们，
     `cp /etc/kubernetes/admin.conf $HOME/.kube/config`、
     `mv /etc/kubernetes/manifests /tmp/manifests.bak` 才有东西可操作。
     ====================================================================== */

  F['/etc/kubernetes/admin.conf'] = {
    content:
      'apiVersion: v1\n' +
      'kind: Config\n' +
      'clusters:\n' +
      '- cluster:\n' +
      '    certificate-authority-data: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSURCekNDQWUrZ0F3SUJBZ0lVVSz\n' +
      '    server: https://10.0.1.11:6443\n' +
      '  name: kubernetes\n' +
      'contexts:\n' +
      '- context:\n' +
      '    cluster: kubernetes\n' +
      '    user: kubernetes-admin\n' +
      '  name: kubernetes-admin@kubernetes\n' +
      'current-context: kubernetes-admin@kubernetes\n' +
      'kind: Config\n' +
      'preferences: {}\n' +
      'users:\n' +
      '- name: kubernetes-admin\n' +
      '  user:\n' +
      '    client-certificate-data: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSURKekNDQWcrZ0F3SUJBZ0lJ\n' +
      '    client-key-data: LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFcEFJQkFBS0NBUUVB\n',
    size: 5642, mode: '600', user: 'root', group: 'root', mtime: '2024-03-05 08:12'
  };

  F['/etc/kubernetes/manifests/kube-apiserver.yaml'] = {
    content:
      'apiVersion: v1\n' +
      'kind: Pod\n' +
      'metadata:\n' +
      '  creationTimestamp: null\n' +
      '  labels:\n' +
      '    component: kube-apiserver\n' +
      '    tier: control-plane\n' +
      '  name: kube-apiserver\n' +
      '  namespace: kube-system\n' +
      'spec:\n' +
      '  containers:\n' +
      '  - command:\n' +
      '    - kube-apiserver\n' +
      '    - --advertise-address=10.0.1.11\n' +
      '    - --etcd-servers=https://127.0.0.1:2379\n' +
      '    - --secure-port=6443\n' +
      '    - --service-cluster-ip-range=10.247.0.0/16\n' +
      '    - --authorization-mode=Node,RBAC\n' +
      '    image: swr.cn-north-4.myhuaweicloud.com/cce/kube-apiserver:v1.27.5\n' +
      '    name: kube-apiserver\n' +
      '    resources:\n' +
      '      requests:\n' +
      '        cpu: 250m\n' +
      '  hostNetwork: true\n' +
      '  priorityClassName: system-node-critical\n' +
      'status: {}\n',
    size: 726, mode: '600', user: 'root', group: 'root', mtime: '2024-03-05 08:12'
  };

  F['/etc/kubernetes/manifests/etcd.yaml'] = {
    content:
      'apiVersion: v1\n' +
      'kind: Pod\n' +
      'metadata:\n' +
      '  labels:\n' +
      '    component: etcd\n' +
      '    tier: control-plane\n' +
      '  name: etcd\n' +
      '  namespace: kube-system\n' +
      'spec:\n' +
      '  containers:\n' +
      '  - command:\n' +
      '    - etcd\n' +
      '    - --advertise-client-urls=https://10.0.1.11:2379\n' +
      '    - --data-dir=/var/lib/etcd\n' +
      '    - --listen-client-urls=https://127.0.0.1:2379,https://10.0.1.11:2379\n' +
      '    image: swr.cn-north-4.myhuaweicloud.com/cce/etcd:3.5.9-0\n' +
      '    name: etcd\n' +
      '    volumeMounts:\n' +
      '    - mountPath: /var/lib/etcd\n' +
      '      name: etcd-data\n' +
      '  volumes:\n' +
      '  - hostPath:\n' +
      '      path: /var/lib/etcd\n' +
      '      type: DirectoryOrCreate\n' +
      '    name: etcd-data\n',
    size: 812, mode: '600', user: 'root', group: 'root', mtime: '2024-03-05 08:12'
  };

  F['/etc/kubernetes/manifests/kube-controller-manager.yaml'] = {
    content:
      'apiVersion: v1\n' +
      'kind: Pod\n' +
      'metadata:\n' +
      '  labels:\n' +
      '    component: kube-controller-manager\n' +
      '    tier: control-plane\n' +
      '  name: kube-controller-manager\n' +
      '  namespace: kube-system\n' +
      'spec:\n' +
      '  containers:\n' +
      '  - command:\n' +
      '    - kube-controller-manager\n' +
      '    - --leader-elect=true\n' +
      '    - --controllers=*,bootstrapsigner,tokencleaner\n' +
      '    image: swr.cn-north-4.myhuaweicloud.com/cce/kube-controller-manager:v1.27.5\n' +
      '    name: kube-controller-manager\n' +
      '  hostNetwork: true\n',
    size: 588, mode: '600', user: 'root', group: 'root', mtime: '2024-03-05 08:12'
  };

  F['/etc/kubernetes/manifests/kube-scheduler.yaml'] = {
    content:
      'apiVersion: v1\n' +
      'kind: Pod\n' +
      'metadata:\n' +
      '  labels:\n' +
      '    component: kube-scheduler\n' +
      '    tier: control-plane\n' +
      '  name: kube-scheduler\n' +
      '  namespace: kube-system\n' +
      'spec:\n' +
      '  containers:\n' +
      '  - command:\n' +
      '    - kube-scheduler\n' +
      '    - --leader-elect=true\n' +
      '    - --bind-address=127.0.0.1\n' +
      '    image: swr.cn-north-4.myhuaweicloud.com/cce/kube-scheduler:v1.27.5\n' +
      '    name: kube-scheduler\n' +
      '  hostNetwork: true\n',
    size: 486, mode: '600', user: 'root', group: 'root', mtime: '2024-03-05 08:12'
  };

  /* etcd 数据目录：db 是真正的成员数据库，wal 是预写日志 */
  F['/var/lib/etcd/member/snap/db'] = { content: '<binary>etcd-bolt-db-96M', size: 100663296, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 09:50' };
  F['/var/lib/etcd/member/wal/0000000000000000-0000000000000000.wal'] = { content: '<binary>etcd-wal-64M', size: 67108864, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 09:50' };

  /* 已用 etcdctl snapshot restore 还原出来、等待切换的新数据目录 */
  F['/var/lib/etcd-restore/member/snap/db'] = { content: '<binary>etcd-restored-db-92M', size: 96468992, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 09:52' };
  F['/var/lib/etcd-restore/member/wal/0000000000000000-0000000000000000.wal'] = { content: '<binary>etcd-wal-64M', size: 67108864, mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 09:52' };

  /* 上一次维护留下的静态 Pod 备份（恢复时要搬回去） */
  F['/tmp/manifests.bak/kube-apiserver.yaml'] = { content: '# 静态 Pod 清单备份（维护窗口期间从 /etc/kubernetes/manifests 整体搬过来）\napiVersion: v1\nkind: Pod\nmetadata:\n  name: kube-apiserver\n  namespace: kube-system\n', size: 168, mode: '600', user: 'root', group: 'root', mtime: '2024-03-05 08:20' };
  F['/tmp/manifests.bak/etcd.yaml'] = { content: '# 静态 Pod 清单备份\napiVersion: v1\nkind: Pod\nmetadata:\n  name: etcd\n  namespace: kube-system\n', size: 108, mode: '600', user: 'root', group: 'root', mtime: '2024-03-05 08:20' };

  /* 华为云 CLI 安装脚本（curl -o hcloud_install.sh 的落点） */
  F['/root/hcloud_install.sh'] = {
    content:
      '#!/bin/bash\n' +
      '# 华为云 CLI（KooCLI）安装脚本 · 官方下载页：hwcloudcli.obs.cn-north-1.myhuaweicloud.com\n' +
      'set -e\n' +
      'INSTALL_DIR=/usr/local/bin\n' +
      'VERSION=latest\n' +
      'ARCH=$(uname -m)\n' +
      'echo "开始安装 KooCLI (${VERSION}) 到 ${INSTALL_DIR}"\n' +
      'curl -fL "https://hwcloudcli.obs.cn-north-1.myhuaweicloud.com/cli/${VERSION}/hcloud_linux_${ARCH}.tar.gz" -o /tmp/hcloud.tar.gz\n' +
      'tar -xzf /tmp/hcloud.tar.gz -C /tmp\n' +
      'install -m 0755 /tmp/hcloud "$INSTALL_DIR/hcloud"\n' +
      'rm -f /tmp/hcloud.tar.gz\n' +
      'echo "安装完成，执行 hcloud version 校验"\n',
    size: 642, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:12'
  };

  /* ======================================================================
     十二、挂载点 / 权限教学用目录（内容有代表性的几个文件）
     ====================================================================== */

  F['/mnt/nfs/data/inventory-20240318.csv'] = {
    content:
      'sku,warehouse,qty,updated_at\n' +
      'SKU-1001,华东-01,1420,2024-03-18 08:00:11\n' +
      'SKU-1002,华东-02,880,2024-03-18 08:00:12\n' +
      'SKU-1003,华北-01,3310,2024-03-18 08:00:14\n',
    size: 168, mode: '644', user: 'deploy', group: 'dev', mtime: '2024-03-18 09:40'
  };

  F['/mnt/newdisk/app/README.md'] = {
    content: '# /mnt/newdisk/app\n\n新数据盘挂载点。`cp -a /data/app/. /mnt/newdisk/app/` 会把 /data/app 的内容\n（含隐藏文件）整目录复制到这里，用于把应用目录迁到新盘。\n',
    size: 152, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:40'
  };

  /* CodeArts / GitLab 流水线清单（cicd 分类常驻引用的文件） */
  F['/home/deploy/work/.gitlab-ci.yml'] = {
    content:
      'stages:\n' +
      '  - build\n' +
      '  - test\n' +
      '  - deploy\n' +
      '\n' +
      'variables:\n' +
      '  IMAGE_TAG: $CI_COMMIT_SHORT_SHA\n' +
      '  SWR_REGISTRY: swr.cn-north-4.myhuaweicloud.com/myorg\n' +
      '\n' +
      'build-image:\n' +
      '  stage: build\n' +
      '  image: docker:24.0.7\n' +
      '  services:\n' +
      '    - docker:24.0.7-dind\n' +
      '  script:\n' +
      '    - docker build -t $SWR_REGISTRY/web:$IMAGE_TAG .\n' +
      '    - docker push $SWR_REGISTRY/web:$IMAGE_TAG\n' +
      '  rules:\n' +
      '    - if: \'$CI_COMMIT_BRANCH == "main"\'\n' +
      '\n' +
      'unit-test:\n' +
      '  stage: test\n' +
      '  image: maven:3.9-eclipse-temurin-17\n' +
      '  script:\n' +
      '    - mvn -B test\n' +
      '  artifacts:\n' +
      '    when: always\n' +
      '    reports:\n' +
      '      junit: target/surefire-reports/TEST-*.xml\n' +
      '    expire_in: 1 week\n' +
      '\n' +
      'deploy-prod:\n' +
      '  stage: deploy\n' +
      '  image: bitnami/kubectl:1.27\n' +
      '  script:\n' +
      '    - kubectl --kubeconfig=$KUBE_CONFIG set image deploy/web web=$SWR_REGISTRY/web:$IMAGE_TAG -n my-app\n' +
      '    - kubectl --kubeconfig=$KUBE_CONFIG rollout status deploy/web -n my-app --timeout=120s\n' +
      '  environment:\n' +
      '    name: prod\n' +
      '  rules:\n' +
      '    - if: \'$CI_COMMIT_BRANCH == "main"\'\n' +
      '      when: manual\n' +
      '\n' +
      'cache:\n' +
      '  key: "$CI_COMMIT_REF_SLUG"\n' +
      '  paths:\n' +
      '    - .m2/repository\n',
    size: 1180, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30'
  };

  F['/home/deploy/work/pod.json'] = {
    content:
      '{\n' +
      '  "apiVersion": "v1",\n' +
      '  "kind": "Pod",\n' +
      '  "metadata": {\n' +
      '    "name": "worker-6b8f7c9d4-m2vqt",\n' +
      '    "namespace": "my-app",\n' +
      '    "labels": { "app": "worker", "version": "1.2.3" }\n' +
      '  },\n' +
      '  "spec": {\n' +
      '    "nodeName": "10.0.1.23",\n' +
      '    "containers": [\n' +
      '      { "name": "worker", "image": "swr.cn-north-4.myhuaweicloud.com/myorg/worker:1.2.3", "restartPolicy": "Always" }\n' +
      '    ]\n' +
      '  },\n' +
      '  "status": {\n' +
      '    "phase": "Running",\n' +
      '    "podIP": "172.20.1.22",\n' +
      '    "containerStatuses": [\n' +
      '      { "name": "worker", "ready": false, "restartCount": 7, "state": { "waiting": { "reason": "CrashLoopBackOff", "message": "back-off 5m0s restarting failed container" } } }\n' +
      '    ]\n' +
      '  }\n' +
      '}\n',
    size: 826, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30'
  };

  F['/home/deploy/work/pods.json'] = {
    content:
      '{\n' +
      '  "apiVersion": "v1",\n' +
      '  "kind": "PodList",\n' +
      '  "items": [\n' +
      '    { "metadata": { "name": "coredns-6d8c4cb4d8-hz8qj", "namespace": "kube-system" }, "status": { "phase": "Running" } },\n' +
      '    { "metadata": { "name": "everest-csi-controller-6b8d9f7c4-l4nrt", "namespace": "kube-system" }, "status": { "phase": "Running" } },\n' +
      '    { "metadata": { "name": "web-7d9c4b8f5-2xk9p", "namespace": "my-app" }, "status": { "phase": "Running" } },\n' +
      '    { "metadata": { "name": "web-7d9c4b8f5-9q4zw", "namespace": "my-app" }, "status": { "phase": "Running" } },\n' +
      '    { "metadata": { "name": "worker-6b8f7c9d4-m2vqt", "namespace": "my-app" }, "status": { "phase": "Running" } },\n' +
      '    { "metadata": { "name": "prometheus-server-0", "namespace": "monitoring" }, "status": { "phase": "Running" } },\n' +
      '    { "metadata": { "name": "grafana-5c7d9b6f8-tq4zp", "namespace": "monitoring" }, "status": { "phase": "Running" } },\n' +
      '    { "metadata": { "name": "batch-job-28471920-x7klm", "namespace": "my-app" }, "status": { "phase": "Pending" } }\n' +
      '  ]\n' +
      '}\n',
    size: 1042, mode: '644', user: 'deploy', group: 'deploy', mtime: '2024-03-18 09:30'
  };

  window.CC_SHELL.fsAdd(F);
})();
