/* assets/js/cmd-db.js · 数据库与中间件客户端
   --------------------------------------------------------------------------
   本文件只负责**注册命令实现**：shell.js 先加载，这里再调用
     window.CC_SHELL.extend({ '命令名': function (argv, ctx, stdin, HOST) { ... } })
   引擎内部的工具函数从 window.CC_SHELL.util 取（ok/fail/resolvePath/findNode/
   readFileOrErr/splitLines/childrenSorted/expandLongOpts/pad/padLeft/walkFiles）。

   覆盖的内容条目：redis-cli 远端、etcdctl、kafka-topics.sh、
   kafka-consumer-groups.sh、kafka-console-{producer,consumer}.sh、rabbitmqctl、
   mqadmin、mysqldump、mysqladmin、mydumper/myloader、xtrabackup、
   pt-query-digest、mysqldumpslow、mysql（-e 扩展 SQL）、psql/pg_dump/pg_restore/
   pg_dumpall、mongosh/mongodump/mongorestore，以及这些示例里用到的 xargs。

   ============================================================================
   模拟数据与"连接"的诚实原则
   ----------------------------------------------------------------------------
   1. 主机名不是"写死谁都能连"：只有站内文档里真实存在的主机才解析得到，
      地址解析不出来就报跟真客户端一样的 Name or service not known /
      Unknown MySQL server host / connect: Connection refused。
   2. 端口、密码、库名、topic、消费组、队列全部是**虚拟环境里的数据**：
      先建状态，再让命令去读它 —— 所以 `--create` 之后再 `--list` 能看到新主题，
      `--create --partitions 0` 会真的报 InvalidPartitionsException。
   3. 不模拟的能力（MONITOR 实时流、watch 长连接、Kafka console 交互式生产者、
      rabbitmqctl 未实现子命令）一律**明确说明**，绝不假装成功。
   ============================================================================ */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;

  var U = window.CC_SHELL.util;

  /* ======================================================================
     0. 小工具
     ====================================================================== */

  function ok(lines) { return { out: lines || [], err: [], code: 0 }; }
  function fail(lines) { return { out: [], err: lines || [], code: 1 }; }
  function codeFail(lines, code) { return { out: [], err: lines || [], code: code }; }
  /* 有 stdout + 有 stderr（教学提示）*/
  function okHint(lines, hints) { return { out: lines || [], err: hints || [], code: 0 }; }
  function failHint(lines, hints) { return { out: lines || [], err: hints || [], code: 1 }; }

  function rep(s, n) { var t = ''; while (t.length < n) t += s; return t; }
  function padR(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function padL(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function isDigits(v) { return /^[0-9]+$/.test(String(v)); }

  /* ASCII 表格：表头 + 每行一列，左对齐、按最宽内容补空格（rabbitmqctl/Kafka 风格） */
  function table(header, rows) {
    var cols = header.length, w = [], i, j;
    for (i = 0; i < cols; i++) w[i] = String(header[i]).length;
    for (i = 0; i < rows.length; i++) {
      for (j = 0; j < cols; j++) {
        var len = String(rows[i][j] === undefined || rows[i][j] === null ? '' : rows[i][j]).length;
        if (len > w[j]) w[j] = len;
      }
    }
    var out = [];
    function line(cells) {
      var parts = [];
      for (var k = 0; k < cols; k++) {
        var c = cells[k] === undefined || cells[k] === null ? '' : String(cells[k]);
        parts.push(k === cols - 1 ? c : padR(c, w[k] + 2));
      }
      var s = parts.join('');
      while (s.length && s.charAt(s.length - 1) === ' ') s = s.slice(0, -1);
      return s;
    }
    out.push(line(header));
    for (i = 0; i < rows.length; i++) out.push(line(rows[i]));
    return out;
  }

  /* mysql 风格的 +---+ 表格（mysqladmin processlist / extended-status） */
  function mysqlBox(header, rows) {
    var cols = header.length, w = [], i, j;
    for (i = 0; i < cols; i++) w[i] = String(header[i]).length;
    for (i = 0; i < rows.length; i++) {
      for (j = 0; j < cols; j++) {
        var len = String(rows[i][j] === undefined ? '' : rows[i][j]).length;
        if (len > w[j]) w[j] = len;
      }
    }
    var sep = '+';
    for (i = 0; i < cols; i++) sep += rep('-', w[i] + 2) + '+';
    function line(cells) {
      var s = '|';
      for (var k = 0; k < cols; k++) {
        var c = cells[k] === undefined || cells[k] === null ? '' : String(cells[k]);
        s += ' ' + padR(c, w[k]) + ' |';
      }
      return s;
    }
    var out = [sep, line(header), sep];
    for (i = 0; i < rows.length; i++) out.push(line(rows[i]));
    out.push(sep);
    out.push(rows.length + (rows.length === 1 ? ' row in set' : ' rows in set') + ' (0.00 sec)');
    return out;
  }

  /* ======================================================================
     1. 虚拟主机表
     ----------------------------------------------------------------------
     站内文档里出现过的主机名在这里登记（IP 与文档一致）。**没有登记的
     主机名一律解析失败**，绝不假装连得上。
     ====================================================================== */

  var VHOSTS = {
    'web-prod-01': { ip: '10.0.1.23', services: { mysql: 3306, redis: 6379, nginx: 80, tomcat: 8080 } },
    'db-prod-01': { ip: '10.0.2.15', services: { mysql: 3306, postgres: 5432, mongo: 27017 } },
    'cache-prod-01': { ip: '10.0.2.16', services: { redis: 6379 } },
    'broker1': { ip: '10.0.1.31', services: { kafka: 9092 } },
    'broker2': { ip: '10.0.1.32', services: { kafka: 9092 } },
    'broker3': { ip: '10.0.1.33', services: { kafka: 9092 } },
    'etcd-01': { ip: '10.0.1.11', services: { etcd: 2379, etcdpeer: 2380 } },
    'etcd-02': { ip: '10.0.1.12', services: { etcd: 2379, etcdpeer: 2380 } },
    'etcd-03': { ip: '10.0.1.13', services: { etcd: 2379, etcdpeer: 2380 } },
    'rabbitmq-prod-01': { ip: '10.0.1.41', services: { rabbitmq: 5672, rabbitmqmgmt: 15672, rabbitmqcluster: 25672 } },
    'rocketmq-ns-01': { ip: '10.0.1.51', services: { rocketmq: 9876 } },
    'rocketmq-broker-a': { ip: '10.0.1.61', services: { rocketmqbroker: 10911 } },
    'rocketmq-broker-b': { ip: '10.0.1.62', services: { rocketmqbroker: 10911 } },
    'haproxy-prod-01': { ip: '10.0.1.71', services: { haproxy: 80, stats: 8404 } }
  };

  var PORT_SERVICE = {
    '6379': 'redis', '3306': 'mysql', '5432': 'postgres', '27017': 'mongo',
    '9092': 'kafka', '2379': 'etcd', '2380': 'etcdpeer',
    '5672': 'rabbitmq', '15672': 'rabbitmqmgmt', '25672': 'rabbitmqcluster',
    '9876': 'rocketmq', '10911': 'rocketmqbroker', '10909': 'rocketmqbroker'
  };

  function hostsFileMap(ctx, HOST) {
    var m = {};
    var txt = '';
    var node = U.findNode(ctx.root, '/etc/hosts');
    if (node && node.type === 'file') txt = String(node.content || '');
    txt.split('\n').forEach(function (line) {
      var parts = String(line).replace(/#.*$/, '').trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) return;
      for (var i = 1; i < parts.length; i++) m[parts[i]] = parts[0];
    });
    if (HOST && HOST.hostname) m[HOST.hostname] = HOST.ip || m[HOST.hostname] || '127.0.0.1';
    m['localhost'] = m['localhost'] || '127.0.0.1';
    return m;
  }

  /* 本机名字（走回环，不受网络策略影响） */
  function localNames(HOST) {
    var m = { 'localhost': 1, '127.0.0.1': 1, '::1': 1, '0.0.0.0': 1 };
    if (HOST && HOST.hostname) m[HOST.hostname] = 1;
    if (HOST && HOST.ip) m[HOST.ip] = 1;
    if (HOST && HOST.eip) m[HOST.eip] = 1;
    return m;
  }

  /* 解析一个"远端主机:端口"。返回
       { kind:'local'|'remote', name, ip, service }
     或 null（DNS 解析不了）。
     端口与服务对不上时返回 kind:'nomatch'，让调用方报 Connection refused。 */
  function resolveRemote(ctx, HOST, name, port) {
    if (!name) return { kind: 'local', name: 'localhost', ip: '127.0.0.1', service: null };
    var isIp = /^\d+\.\d+\.\d+\.\d+$/.test(name);
    /* 名字 → IP 只认 `/etc/hosts`（外加本机自己的名字）：
       不能拿 VHOSTS（服务清单）当 DNS 用 —— 那会让 `redis-cli -h cache-prod-01` 连上，
       而站内 `/etc/hosts` 里根本没有这条记录，"worker 容器报 UnknownHostException:
       cache-prod-01" 那条排障线就自相矛盾了。
       VHOSTS 的用途只有一个：已经能解析到之后，看这台机器上跑着什么服务。 */
    var ip = isIp ? name : (hostsFileMap(ctx, HOST)[name] || null);
    if (!ip) return null;

    var local = localNames(HOST);
    var isLocal = !!local[name] || !!local[ip];
    var svc = null;
    /* 名字（或 IP）在虚拟主机表里 → 这台机器上跑着什么服务 */
    var entry = VHOSTS[name];
    if (!entry) {
      for (var k in VHOSTS) {
        if (Object.prototype.hasOwnProperty.call(VHOSTS, k) && VHOSTS[k].ip === ip) { entry = VHOSTS[k]; break; }
      }
    }
    var selfSvc = local[ip] || local[name] ? VHOSTS[HOST && HOST.hostname] : null;
    var services = entry ? entry.services : (selfSvc ? selfSvc.services : null);

    if (port !== undefined && port !== null && String(port) !== '') {
      var p = String(port);
      if (services) {
        svc = services[PORT_SERVICE[p] || ''] || null;
        if (!svc) return { kind: isLocal ? 'local' : 'nomatch', name: name, ip: ip, service: null };
      } else if (!isLocal) {
        /* 主机名能解析但虚拟环境里没登记它跑什么服务：只有端口等于该服务的默认端口才当连上 */
        svc = PORT_SERVICE[p] || null;
        if (!svc) return { kind: 'nomatch', name: name, ip: ip, service: null };
      }
    } else if (services) {
      svc = null;   /* 没给端口：交给调用方用默认端口再判 */
    }
    return { kind: isLocal ? 'local' : 'remote', name: name, ip: ip, service: svc };
  }

  /* 服务在当前主机上是否可用（用于"默认端口"场景） */
  function hostHasService(ctx, HOST, name, service) {
    var e = VHOSTS[name];
    if (!e) {
      var ip = hostsFileMap(ctx, HOST)[name];
      for (var k in VHOSTS) {
        if (Object.prototype.hasOwnProperty.call(VHOSTS, k) && VHOSTS[k].ip === ip) { e = VHOSTS[k]; break; }
      }
    }
    if (e) return !!e.services[service];
    if (localNames(HOST)[name]) return !!VHOSTS[HOST && HOST.hostname] && !!VHOSTS[HOST.hostname].services[service];
    return false;
  }

  /* ======================================================================
     2. 模拟文件系统数据（本模块自己带自己的数据）
     ====================================================================== */

  var MYSQL_SLOW_LOG = [
    '# Time: 2024-03-18T09:41:18.512345+08:00',
    '# User@Host: app[app] @ web-prod-01 [10.0.1.23]  Id: 41237',
    '# Query_time: 5.218413  Lock_time: 0.000187 Rows_sent: 0  Rows_examined: 52118330',
    'SET timestamp=1710729678;',
    "SELECT COUNT(*) FROM order_status_log WHERE order_id = 8812 AND status = 'PAID';",
    '# Time: 2024-03-18T09:43:02.208117+08:00',
    '# User@Host: app[app] @ web-prod-01 [10.0.1.23]  Id: 41248',
    '# Query_time: 3.882014  Lock_time: 0.000201 Rows_sent: 1  Rows_examined: 18204412',
    'SET timestamp=1710729782;',
    "SELECT * FROM orders WHERE user_id = 8813 AND status = 'PAID' ORDER BY created_at DESC LIMIT 20;",
    '# Time: 2024-03-18T09:47:55.771004+08:00',
    '# User@Host: app[app] @ web-prod-01 [10.0.1.23]  Id: 41251',
    '# Query_time: 2.114882  Lock_time: 0.000143 Rows_sent: 12  Rows_examined: 9120441',
    'SET timestamp=1710729875;',
    "SELECT COUNT(*) FROM order_status_log WHERE order_id = 8814 AND status = 'PAID';",
    '# Time: 2024-03-18T09:49:41.112233+08:00',
    '# User@Host: app[app] @ web-prod-01 [10.0.1.23]  Id: 41260',
    '# Query_time: 1.004217  Lock_time: 0.000119 Rows_sent: 1  Rows_examined: 982140',
    'SET timestamp=1710729881;',
    'SELECT id, name FROM users WHERE id = 100234;',
    '# Time: 2024-03-18T09:50:12.334455+08:00',
    '# User@Host: app[app] @ web-prod-01 [10.0.1.23]  Id: 41261',
    '# Query_time: 6.771904  Lock_time: 0.000231 Rows_sent: 0  Rows_examined: 52118330',
    'SET timestamp=1710729912;',
    "SELECT COUNT(*) FROM order_status_log WHERE order_id = 8812 AND status = 'PAID';"
  ].join('\n') + '\n';

  var ETCD_REVISION = 184271;

  window.CC_SHELL.fsAdd({
    '/etc/my.cnf': {
      content: '[mysqld]\n' +
        'datadir                 = /var/lib/mysql\n' +
        'socket                  = /var/lib/mysql/mysql.sock\n' +
        'port                    = 3306\n' +
        'max_connections         = 1000\n' +
        'innodb_buffer_pool_size = 2G\n' +
        'innodb_log_file_size    = 1G\n' +
        'slow_query_log          = ON\n' +
        'slow_query_log_file     = /var/lib/mysql/mysql-slow.log\n' +
        'long_query_time         = 5\n' +
        'max_allowed_packet      = 64M\n' +
        '\n[client]\n' +
        'socket = /var/lib/mysql/mysql.sock\n' +
        'default-character-set = utf8mb4\n',
      size: 512, mode: '644', user: 'root', group: 'root', mtime: '2024-03-11 10:20'
    },
    '/var/lib/mysql/mysql-slow.log': {
      content: MYSQL_SLOW_LOG, size: 4096, mode: '640', user: 'mysql', group: 'mysql', mtime: '2024-03-18 09:50'
    },
    '/etc/kafka/client.properties': {
      content: 'security.protocol=SASL_PLAINTEXT\n' +
        'sasl.mechanism=PLAIN\n' +
        'sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required \\\n' +
        '  username="kafka-admin" password="<从密钥管理取，不要写进文件>";\n' +
        'ssl.endpoint.identification.algorithm=https\n',
      size: 268, mode: '600', user: 'kafka', group: 'kafka', mtime: '2024-03-10 14:02'
    },
    '/etc/kafka/server.properties': {
      content: 'broker.id=1\n' +
        'listeners=PLAINTEXT://broker1:9092\n' +
        'log.dirs=/data/kafka-logs\n' +
        'num.partitions=3\n' +
        'default.replication.factor=2\n' +
        'offsets.topic.replication.factor=3\n' +
        'log.retention.hours=168\n' +
        'zookeeper.connect=zk1:2181,zk2:2181,zk3:2181\n',
      size: 274, mode: '644', user: 'kafka', group: 'kafka', mtime: '2024-03-10 14:00'
    },
    '/data/backup/db-orders-2024-03-18.sql': {
      content: '-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)\n' +
        '--\n-- Host: db-prod-01    Database: orders\n-- ------------------------------------------------------\n' +
        '-- Server version\t8.0.36\n\n' +
        '/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n' +
        'CREATE DATABASE /*!32312 IF NOT EXISTS*/ `orders` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;\n' +
        'USE `orders`;\n\n' +
        'DROP TABLE IF EXISTS `orders`;\n' +
        'CREATE TABLE `orders` (\n' +
        '  `id` bigint NOT NULL,\n  `user_id` bigint NOT NULL,\n' +
        '  `status` varchar(16) DEFAULT NULL,\n  `amount` decimal(12,2) DEFAULT NULL,\n' +
        '  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n' +
        '  PRIMARY KEY (`id`),\n  KEY `idx_user_status` (`user_id`,`status`)\n' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;\n' +
        '-- Dump completed on 2024-03-18  3:20:41\n',
      size: 886046720, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 03:20'
    },
    '/data/backup/orders-2024-03-18.sql': {
      content: '-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)\n' +
        '--\n-- Host: db-prod-01    Database: orders\n-- ------------------------------------------------------\n' +
        'USE `orders`;\n' +
        'DROP TABLE IF EXISTS `orders`;\n' +
        'CREATE TABLE `orders` (\n' +
        '  `id` bigint NOT NULL,\n  `user_id` bigint NOT NULL,\n' +
        '  `status` varchar(16) DEFAULT NULL,\n  `amount` decimal(12,2) DEFAULT NULL,\n' +
        '  PRIMARY KEY (`id`)\n' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;\n' +
        '-- Dump completed on 2024-03-18  3:20:41\n',
      size: 4204789760, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 03:20'
    },
    '/data/backup/orders-with-pos.sql': {
      content: '-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)\n' +
        '--\n-- Host: db-prod-01    Database: orders\n-- ------------------------------------------------------\n' +
        '-- Position to start replication or point-in-time recovery from\n--\n' +
        '-- CHANGE MASTER TO MASTER_LOG_FILE=\'mysql-bin.000042\', MASTER_LOG_POS=197;\n' +
        'USE `orders`;\n-- Dump completed on 2024-03-18  9:52:10\n',
      size: 4204789760, mode: '644', user: 'root', group: 'root', mtime: '2024-03-18 09:52'
    },
    '/data/backup/pg-globals-2024-03-18.sql': {
      content: '--\n-- PostgreSQL database cluster dump\n--\n\n' +
        'CREATE ROLE app;\nALTER ROLE app WITH LOGIN PASSWORD \'Pg@2024\';\n' +
        'CREATE ROLE postgres;\nALTER ROLE postgres WITH SUPERUSER LOGIN;\n',
      size: 512, mode: '644', user: 'postgres', group: 'postgres', mtime: '2024-03-18 03:30'
    }
  });
  /* 上面这些文件在 termfs 里已经有同名条目（size/mtime 以 termfs 为准），
     fsAdd 只在路径不存在时生效 —— 所以不会覆盖别人的数据。 */

  /* ======================================================================
     3. redis-cli（远端主机 / 完整命令集）
     ----------------------------------------------------------------------
     shell.js 里的本机实例（127.0.0.1）行为保持不变，这里负责：
       · -h <站内真实存在的缓存主机> 的远端连接（连不上就如实报错）
       · shell.js 尚未实现的子命令：SLOWLOG / CLUSTER / MEMORY DOCTOR /
         CLIENT / OBJECT / MONITOR / BGSAVE / INFO commandstats / --hotkeys
     ====================================================================== */

  var REDIS_HOST_HINT =
    '（教学提示）本站仿真里 cache-prod-01 是文档中登记的缓存主机（10.0.2.16，与 /data/app/config.yaml ' +
    '的 redis.host 一致），本机 /etc/hosts 里有它的记录，所以能直接连。' +
    '注意区分：**集群里**的 worker 容器解析不了这个名字（那是容器 DNS 的问题，见 k8s 的 DNS 排查课），' +
    '而**这台宿主机**能解析 —— 这正是"同一件事在不同环境表现不同"的典型例子。';

  /* 集群里的 cache-prod-01 是 K8s Service 名，走 CoreDNS；宿主机走 /etc/hosts。
     两者是不同的解析路径，所以上面那句话不能省 —— 否则学员会以为
     "宿主机能解析"与"容器解析失败"自相矛盾。 */

  function redisSeedKeys() {
    return [
      { db: 0, key: 'order:8812', type: 'string', bytes: 412, ttl: 1800, value: '{"id":8812,"status":"PAID","amount":"¥1,240.00"}' },
      { db: 0, key: 'order:8813', type: 'string', bytes: 388, ttl: 2400, value: '{"id":8813,"status":"PAID","amount":"¥860.00"}' },
      { db: 0, key: 'order:8814', type: 'string', bytes: 366, ttl: 900, value: '{"id":8814,"status":"CREATED","amount":"¥2,180.00"}' },
      { db: 0, key: 'order:items:8812', type: 'list', bytes: 5120, items: 3, ttl: -1 },
      { db: 0, key: 'order:lock:8812', type: 'string', bytes: 2, ttl: 12, value: '1' },
      { db: 0, key: 'session:8812', type: 'string', bytes: 312, ttl: 7200, value: '{"uid":100234,"role":"user"}' },
      { db: 0, key: 'session:8813', type: 'string', bytes: 298, ttl: 5400, value: '{"uid":100918,"role":"user"}' },
      { db: 0, key: 'session:8814', type: 'string', bytes: 305, ttl: 120, value: '{"uid":100977,"role":"user"}' },
      { db: 0, key: 'cache:home:top', type: 'string', bytes: 8192, ttl: 3600, value: '[{"sku":"A1024","sales":9128},{"sku":"B2048","sales":7712}]' },
      { db: 0, key: 'cache:cfg:gateway', type: 'string', bytes: 384, ttl: 86400, value: '{"timeout":3000}' },
      { db: 0, key: 'user:profile:8812', type: 'hash', bytes: 2140, items: 3, ttl: -1 },
      { db: 0, key: 'user:profile:8813', type: 'hash', bytes: 1980, items: 3, ttl: 14400 },
      { db: 0, key: 'rank:hot:orders', type: 'zset', bytes: 262144, items: 9210, ttl: -1 },
      { db: 0, key: 'queue:orders', type: 'list', bytes: 148000, items: 1842, ttl: -1 },
      { db: 0, key: 'big:cache:report:2024Q1', type: 'string', bytes: 1048576, ttl: 604800, value: '{"orders":18204412,"amount":"...","rows":[...]}' },
      { db: 1, key: 'cache:cfg:app', type: 'string', bytes: 512, ttl: -1, value: '{"gray":false,"version":"1.2.3"}' },
      { db: 1, key: 'cache:feature:flags', type: 'hash', bytes: 640, items: 8, ttl: -1 },
      { db: 1, key: 'queue:dlq', type: 'list', bytes: 8192, items: 12, ttl: -1 },
      { db: 2, key: 'order:8812', type: 'string', bytes: 402, ttl: 3600, value: '{"id":8812,"status":"PAID","shard":2}' },
      { db: 2, key: 'order:8815', type: 'string', bytes: 377, ttl: 3600, value: '{"id":8815,"status":"CREATED","shard":2}' },
      { db: 2, key: 'cache:session:8812', type: 'string', bytes: 268, ttl: 1800, value: '{"uid":100234,"shard":2}' }
    ];
  }

  var REDIS_SEED_CONFIG = {
    'maxmemory': '0',
    'maxmemory-policy': 'noeviction',
    'maxmemory-samples': '5',
    'appendonly': 'no',
    'save': '3600 1 300 100 60 10000',
    'timeout': '0',
    'tcp-keepalive': '300',
    'databases': '16',
    'maxclients': '10000',
    'slowlog-log-slower-than': '10000',
    'slowlog-max-len': '128',
    'hash-max-listpack-entries': '128',
    'hash-max-listpack-value': '64',
    'list-max-listpack-size': '-2',
    'notify-keyspace-events': '',
    'protected-mode': 'yes',
    'requirepass': '(hidden)'
  };

  var REDIS_HOSTS = {};

  function redisHostState(name) {
    if (!REDIS_HOSTS[name]) {
      var dbs = {};
      redisSeedKeys().forEach(function (k) {
        var id = k.db;
        if (!dbs[id]) dbs[id] = {};
        dbs[id][k.key] = {
          type: k.type, bytes: k.bytes, items: k.items || 0,
          ttl: k.ttl === undefined ? -1 : k.ttl,
          value: k.value === undefined ? null : k.value
        };
      });
      var config = {};
      for (var c in REDIS_SEED_CONFIG) {
        if (Object.prototype.hasOwnProperty.call(REDIS_SEED_CONFIG, c)) config[c] = REDIS_SEED_CONFIG[c];
      }
      REDIS_HOSTS[name] = {
        dbs: dbs,
        config: config,
        clients: [
          { id: 41231, addr: '10.0.1.23:44882', name: 'orderservice-pool-1', age: 8492, idle: 0, db: 0, cmd: 'get' },
          { id: 41232, addr: '10.0.1.23:44883', name: 'orderservice-pool-2', age: 8492, idle: 3, db: 0, cmd: 'get' },
          { id: 41237, addr: '10.0.1.23:44888', name: '', age: 4211, idle: 812, db: 0, cmd: 'keys' },
          { id: 41244, addr: '10.0.1.24:51200', name: 'worker-pool-1', age: 3710, idle: 0, db: 0, cmd: 'lpush' },
          { id: 41251, addr: '10.0.1.24:51201', name: 'worker-pool-2', age: 3705, idle: 12, db: 0, cmd: 'brpop' },
          { id: 41258, addr: '10.0.1.71:40218', name: 'haproxy-health', age: 118, idle: 118, db: 0, cmd: 'ping' }
        ],
        slowlog: [
          { id: 1842, t: 1710729912, usec: 142208, args: ['KEYS', 'order:*'], addr: '10.0.1.23:44888', name: '' },
          { id: 1841, t: 1710729788, usec: 88104, args: ['HGETALL', 'user:profile:8812'], addr: '10.0.1.23:44882', name: 'orderservice-pool-1' },
          { id: 1840, t: 1710729640, usec: 51230, args: ['SMEMBERS', 'tag:orders'], addr: '10.0.1.24:51200', name: 'worker-pool-1' },
          { id: 1839, t: 1710729502, usec: 30412, args: ['LRANGE', 'queue:orders', '0', '-1'], addr: '10.0.1.23:44883', name: 'orderservice-pool-2' },
          { id: 1838, t: 1710729188, usec: 22140, args: ['SCAN', '0', 'MATCH', 'session:*', 'COUNT', '1000'], addr: '10.0.1.23:44882', name: 'orderservice-pool-1' },
          { id: 1837, t: 1710728904, usec: 15408, args: ['ZRANGE', 'rank:hot:orders', '0', '-1'], addr: '10.0.1.24:51201', name: 'worker-pool-2' },
          { id: 1836, t: 1710728610, usec: 12012, args: ['DEL', 'big:cache:report:2024Q1'], addr: '10.0.1.23:44883', name: 'orderservice-pool-2' },
          { id: 1835, t: 1710728201, usec: 10220, args: ['GET', 'big:cache:report:2024Q1'], addr: '10.0.1.23:44882', name: 'orderservice-pool-1' }
        ]
      };
    }
    return REDIS_HOSTS[name];
  }

  function redisGlobToRe(pat) {
    var out = '^';
    var p = String(pat);
    for (var i = 0; i < p.length; i++) {
      var ch = p.charAt(i);
      if (ch === '*') out += '.*';
      else if (ch === '?') out += '.';
      else if (ch === '[') {
        var j = p.indexOf(']', i);
        if (j > i) { out += p.slice(i, j + 1); i = j; } else out += '\\[';
      } else if ('\\^$.|+(){}'.indexOf(ch) !== -1) out += '\\' + ch;
      else out += ch;
    }
    return new RegExp(out + '$');
  }

  function redisMemFmt(bytes) {
    if (!bytes) return '0B';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + 'K';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + 'M';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + 'G';
  }

  function redisParseMem(v) {
    var m = String(v).trim().match(/^(\d+)\s*([kmg]b?|b)?$/i);
    if (!m) return 0;
    var n = Number(m[1]);
    var u = (m[2] || '').toLowerCase().charAt(0);
    return u === 'k' ? n * 1024 : u === 'm' ? n * 1048576 : u === 'g' ? n * 1073741824 : n;
  }

  function redisAllKeys(state) {
    var out = [];
    Object.keys(state.dbs).forEach(function (db) {
      Object.keys(state.dbs[db]).forEach(function (k) { out.push({ db: Number(db), key: k, meta: state.dbs[db][k] }); });
    });
    return out;
  }

  function redisMem(state) {
    var perKey = 0, n = 0, dataset = 0;
    redisAllKeys(state).forEach(function (e) {
      perKey += 56 + e.key.length;
      dataset += e.meta.bytes;
      n++;
    });
    var used = 786432 + perKey + dataset + 20512;
    return { used: used, overhead: 786432 + perKey + 20512, dataset: dataset, peak: used + 322304, rss: Math.round(used * 1.87), keys: n };
  }

  function redisTypeUnit(t) {
    return { string: 'bytes', list: 'items', hash: 'fields', set: 'members', zset: 'members' }[t] || 'items';
  }
  function redisKeySize(k) { return k.type === 'string' ? k.bytes : k.items; }
  function redisPct5(x) { var s = x.toFixed(2); while (s.length < 5) s = '0' + s; return s; }

  /* INFO：全部现算 */
  function redisInfoSection(state, section, opt) {
    var mem = redisMem(state);
    var all = redisAllKeys(state);
    var expires = 0;
    all.forEach(function (e) { if (e.meta.ttl > 0) expires++; });
    var s = {};
    s.server = [
      '# Server',
      'redis_version:' + (opt.version || '7.2.4'),
      'redis_git_sha1:00000000',
      'redis_git_dirty:0',
      'redis_build_id:8f3c1a724d5e4b91',
      'redis_mode:' + (opt.cluster ? 'cluster' : 'standalone'),
      'os:Linux 5.10.0-60.18.0.50.oe2203.x86_64 x86_64',
      'arch_bits:64',
      'multiplexing_api:epoll',
      'process_id:3390',
      'run_id:8f3c1a724d5e4b919c2a1e7d6b0c4f88',
      'tcp_port:' + (opt.port || '6379'),
      'uptime_in_seconds:' + (opt.uptime || 172040),
      'uptime_in_days:' + Math.floor((opt.uptime || 172040) / 86400),
      'hz:10',
      'configured_hz:10',
      'lru_clock:18421923',
      'executable:/usr/local/bin/redis-server',
      'config_file:/etc/redis/redis.conf',
      'io_threads_active:0'
    ];
    s.clients = [
      '# Clients',
      'connected_clients:' + state.clients.length,
      'cluster_connections:0',
      'maxclients:' + state.config.maxclients,
      'client_recent_max_input_buffer:0',
      'client_recent_max_output_buffer:0',
      'blocked_clients:1',
      'tracking_clients:0',
      'clients_in_timeout_table:0'
    ];
    s.memory = [
      '# Memory',
      'used_memory:' + mem.used,
      'used_memory_human:' + redisMemFmt(mem.used),
      'used_memory_rss:' + mem.rss,
      'used_memory_rss_human:' + redisMemFmt(mem.rss),
      'used_memory_peak:' + mem.peak,
      'used_memory_peak_human:' + redisMemFmt(mem.peak),
      'used_memory_overhead:' + mem.overhead,
      'used_memory_startup:786432',
      'used_memory_dataset:' + mem.dataset,
      'used_memory_dataset_perc:' + (Math.round(mem.dataset / mem.used * 10000) / 100).toFixed(2) + '%',
      'allocator_allocated:' + mem.used,
      'total_system_memory:16777216000',
      'maxmemory:' + state.config.maxmemory,
      'maxmemory_human:' + redisMemFmt(redisParseMem(state.config.maxmemory)),
      'maxmemory_policy:' + state.config['maxmemory-policy'],
      'mem_fragmentation_ratio:' + (mem.rss / mem.used).toFixed(2),
      'mem_allocator:libc',
      'mem_clients_normal:20512',
      'lazyfree_pending_objects:0'
    ];
    s.persistence = [
      '# Persistence',
      'loading:0',
      'async_loading:0',
      'rdb_changes_since_last_save:' + all.length,
      'rdb_bgsave_in_progress:0',
      'rdb_last_save_time:1710720000',
      'rdb_last_bgsave_status:ok',
      'rdb_last_bgsave_time_sec:1',
      'rdb_current_bgsave_time_sec:-1',
      'aof_enabled:' + (state.config.appendonly === 'yes' ? 1 : 0),
      'aof_rewrite_in_progress:0',
      'aof_last_bgrewrite_status:ok',
      'aof_last_write_status:ok'
    ];
    s.stats = [
      '# Stats',
      'total_connections_received:21844',
      'total_commands_processed:932146',
      'instantaneous_ops_per_sec:842',
      'total_net_input_bytes:1128374042',
      'total_net_output_bytes:3981277114',
      'rejected_connections:0',
      'sync_full:0',
      'sync_partial_ok:0',
      'sync_partial_err:0',
      'expired_keys:182',
      'evicted_keys:0',
      'keyspace_hits:842913',
      'keyspace_misses:1204',
      'pubsub_channels:0',
      'pubsub_patterns:0',
      'latest_fork_usec:812',
      'total_forks:1',
      'migrate_cached_sockets:0'
    ];
    s.replication = [
      '# Replication',
      'role:master',
      'connected_slaves:0',
      'master_failover_state:no-failover',
      'master_replid:8f3c1a724d5e4b919c2a1e7d6b0c4f88',
      'master_replid2:0000000000000000000000000000000000000000',
      'master_repl_offset:8293712',
      'second_repl_offset:-1',
      'repl_backlog_active:0',
      'repl_backlog_size:1048576',
      'repl_backlog_histlen:0'
    ];
    s.cpu = [
      '# CPU',
      'used_cpu_sys:72.268104',
      'used_cpu_user:122.114882',
      'used_cpu_sys_children:0.002144',
      'used_cpu_user_children:0.001882'
    ];
    s.commandstats = [
      '# Commandstats',
      'cmdstat_get:calls=418221,usec=1120442,usec_per_call=2.68,rejected_calls=0,failed_calls=0',
      'cmdstat_set:calls=92214,usec=488102,usec_per_call=5.29,rejected_calls=0,failed_calls=0',
      'cmdstat_hgetall:calls=42118,usec=881040,usec_per_call=20.92,rejected_calls=0,failed_calls=0',
      'cmdstat_scan:calls=18422,usec=402118,usec_per_call=21.83,rejected_calls=0,failed_calls=0',
      'cmdstat_lpush:calls=8124,usec=92044,usec_per_call=11.33,rejected_calls=0,failed_calls=0',
      'cmdstat_keys:calls=12,usec=1422080,usec_per_call=118506.67,rejected_calls=0,failed_calls=0',
      'cmdstat_info:calls=1842,usec=44210,usec_per_call=24.00,rejected_calls=0,failed_calls=0'
    ];
    s.cluster = [
      '# Cluster',
      'cluster_enabled:' + (opt.cluster ? 1 : 0)
    ];
    s.modules = ['# Modules', ''];
    s.errorstats = ['# Errorstats', ''];
    var ks = ['# Keyspace'];
    Object.keys(state.dbs).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {
      var keys = state.dbs[id];
      var names = Object.keys(keys);
      if (!names.length) return;
      var exp = 0, ttlSum = 0, n = 0;
      names.forEach(function (k) { if (keys[k].ttl > 0) { exp++; ttlSum += keys[k].ttl; n++; } });
      ks.push('db' + id + ':keys=' + names.length + ',expires=' + exp + ',avg_ttl=' + (n ? Math.round(ttlSum / n) : 0));
    });
    s.keyspace = ks;

    if (section) {
      var want = String(section).toLowerCase();
      return s[want] || null;
    }
    var order = ['server', 'clients', 'memory', 'persistence', 'stats', 'replication', 'cpu', 'modules', 'errorstats', 'cluster', 'keyspace'];
    var out = [];
    order.forEach(function (name) { out = out.concat(s[name]); out.push(''); });
    if (out.length && out[out.length - 1] === '') out.pop();
    return out;
  }

  /* --bigkeys（与 KEYS/DBSIZE 自洽，现算） */
  function redisBigKeysLines(state, db) {
    var keys = state.dbs[db] || {};
    var names = Object.keys(keys);
    var out = [
      '# Scanning the entire keyspace to find biggest keys as well as',
      '# average sizes per key type.  You can use -i 0.1 to sleep 0.1 sec',
      '# per 100 SCAN commands (not usually needed).',
      ''
    ];
    var byType = {};
    names.forEach(function (n) {
      var k = keys[n], size = redisKeySize(k);
      if (!byType[k.type] || size > byType[k.type].size) byType[k.type] = { key: n, size: size };
    });
    var seen = 0;
    names.forEach(function (n) {
      seen++;
      var k = keys[n];
      if (byType[k.type].key === n) {
        out.push('[' + redisPct5(seen / names.length * 100) + '%] Biggest ' + padL(k.type, 6) +
          " found so far '\"" + n + "\"' with " + redisKeySize(k) + ' ' + redisTypeUnit(k.type));
      }
    });
    out.push('');
    out.push('-------- summary -------');
    out.push('');
    out.push('Sampled ' + names.length + ' keys in the keyspace!');
    var keyLen = names.reduce(function (a, n) { return a + n.length; }, 0);
    out.push('Total key length in bytes is ' + keyLen + ' (avg len ' + (names.length ? (keyLen / names.length).toFixed(2) : '0.00') + ')');
    out.push('');
    ['list', 'hash', 'string', 'set', 'zset'].forEach(function (t) {
      if (!byType[t]) return;
      out.push('Biggest ' + padL(t, 6) + " found '\"" + byType[t].key + "\"' has " + byType[t].size + ' ' + redisTypeUnit(t));
    });
    out.push('');
    var plural = { string: 'strings', list: 'lists', hash: 'hashs', set: 'sets', zset: 'zsets' };
    ['list', 'hash', 'string', 'set', 'zset'].forEach(function (t) {
      var group = names.filter(function (n) { return keys[n].type === t; });
      if (!group.length) return;
      var total = group.reduce(function (a, n) { return a + redisKeySize(keys[n]); }, 0);
      out.push(group.length + ' ' + plural[t] + ' with ' + total + ' ' + redisTypeUnit(t) +
        ' (' + redisPct5(group.length / names.length * 100) + '% of keys, avg size ' + (total / group.length).toFixed(2) + ')');
    });
    out.push('');
    out.push('0 expired keys in the keyspace (0.00% of keys)');
    return out;
  }

  function redisSlowLogGet(state, count) {
    var list = state.slowlog.slice(0, count);
    if (!list.length) return ['(empty array)'];
    var out = [];
    list.forEach(function (rec, i) {
      out.push((i + 1) + ') 1) (integer) ' + rec.id);
      out.push('   ' + '2) (integer) ' + rec.t);
      out.push('   ' + '3) (integer) ' + rec.usec);
      out.push('   ' + '4) 1) "' + rec.args.join('"\n      2) "') + '"');
      out.push('   ' + '5) "' + rec.addr + '"');
      out.push('   ' + '6) "' + rec.name + '"');
    });
    return out;
  }

  function redisClientList(state) {
    return state.clients.map(function (c) {
      return 'id=' + c.id + ' addr=' + c.addr + ' laddr=10.0.2.16:6379 fd=8 name=' + c.name +
        ' age=' + c.age + ' idle=' + c.idle + ' flags=N db=' + c.db + ' sub=0 psub=0 ssub=0 multi=-1 ' +
        'watch=0 qbuf=26 qbuf-free=20448 argv-mem=10 multi-mem=0 tot-net-in=0 tot-net-out=0 rbs=1024 ' +
        'rBP=0 obl=0 oll=0 omem=0 tot-mem=0 events=r cmd=' + c.cmd + ' user=default redir=-1 resp=2';
    });
  }

  /* redis-cli 入口（远端实例 + shell.js 未实现的子命令）。
     返回 {handled:true, out, err, code} 或 {handled:false} */
  function redisRemote(argv, ctx, stdin, HOST) {
    /* 调用方传的是 shell.js 风格的 argv（已去掉命令名 "redis-cli"）。
       从 xargs 过来时同样的形态，所以这里不做任何剥离。 */
    var o = { host: null, port: null, db: 0, args: [], scan: false, pattern: null, bigkeys: false, hotkeys: false, version: false, auth: false, interactive: false };
    var i;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h') { o.host = argv[++i]; continue; }
      if (a === '-p') { o.port = argv[++i]; continue; }
      if (a === '-n') { o.db = num(argv[++i]); continue; }
      if (a === '-a' || a === '--pass') { o.auth = true; i++; continue; }
      if (a === '--user') { i++; continue; }
      if (a === '--no-auth-warning' || a === '-q' || a === '--no-raw' || a === '--raw') continue;
      if (a === '--version' || a === '-v') { o.version = true; continue; }
      if (a === '--scan') { o.scan = true; continue; }
      if (a === '--pattern') { o.pattern = argv[++i]; continue; }
      if (a === '--bigkeys') { o.bigkeys = true; continue; }
      if (a === '--hotkeys') { o.hotkeys = true; continue; }
      if (a === '-i') { i++; continue; }
      if (a === '-r' || a === '-c' || a === '-u' || a === '-x' || a === '-d') { if (a !== '-x') i++; continue; }
      o.args.push(a);
    }
    if (o.version) return { handled: true, out: ['redis-cli 7.2.4'], err: [], code: 0 };

    var hostName = o.host;
    if (!hostName) return { handled: false };              /* 没写 -h：本机实例交给 shell.js */
    if (localNames(HOST)[hostName]) return { handled: false };  /* 本机/回环：shell.js 的实现更完整 */

    var port = o.port === null || o.port === undefined ? '6379' : String(o.port);
    var addr = resolveRemote(ctx, HOST, hostName, port);
    if (!addr) {
      return { handled: true, out: [], err: ['Could not connect to Redis at ' + hostName + ':' + port + ': Name or service not known'], code: 1 };
    }
    if (!hostHasService(ctx, HOST, hostName, 'redis') || port !== '6379') {
      return { handled: true, out: [], err: ['Could not connect to Redis at ' + hostName + ':' + port + ': Connection refused'], code: 1 };
    }

    var state = redisHostState(hostName);
    var hints = [];
    if (o.auth) hints.push('（教学提示）-a 会把密码明文留在 shell 历史与 ps 输出里；生产请用 REDISCLI_AUTH 环境变量或 --askpass');
    hints.push(REDIS_HOST_HINT);

    function reply(lines) { return { handled: true, out: lines, err: hints, code: 0 }; }
    function errReply(msg) { return { handled: true, out: [], err: hints.concat([msg]), code: 1 }; }

    if (o.db < 0 || o.db > 15) return errReply('(error) ERR DB index is out of range');
    hintPush(hints, state);

    if (o.bigkeys) return reply(redisBigKeysLines(state, o.db));
    if (o.hotkeys) {
      return errReply('(error) ERR ERR --hotkeys requires LFU maxmemory policy. ' +
        'Current policy is ' + state.config['maxmemory-policy'] +
        '，本站实例是 noeviction。改成 LFU 类策略（如 allkeys-lfu）后才能用 --hotkeys。');
    }
    var keys = state.dbs[o.db] || {};
    if (o.scan) {
      var re = redisGlobToRe(o.pattern || '*');
      var matched = Object.keys(keys).filter(function (k) { return re.test(k); }).sort();
      return reply(matched);
    }

    var cmd = o.args[0];
    var rest = o.args.slice(1);
    if (!cmd) {
      return okHint([
        '（教学环境不模拟交互式客户端：真机上 redis-cli 会进 ' + hostName + ':' + port + '> 提示符）',
        '一条命令直接执行：redis-cli -h ' + hostName + ' PING / INFO memory / DBSIZE'
      ], hints);
    }
    var c = String(cmd).toLowerCase();

    if (c === 'ping') return reply([rest.length ? JSON.stringify(String(rest[0])) : 'PONG']);

    if (c === 'info') {
      var sections = rest.length ? rest : [null];
      var out = [];
      for (var si = 0; si < sections.length; si++) {
        var lines = redisInfoSection(state, sections[si], { port: port, uptime: 172040 });
        if (!lines) {
          hints.push('（教学提示）INFO 的常见 section：server / clients / memory / persistence / stats / replication / cpu / commandstats / keyspace；真机对未知 section 返回空');
          continue;
        }
        out = out.concat(lines);
      }
      return reply(out);
    }

    if (c === 'dbsize') return reply(['(integer) ' + Object.keys(keys).length]);

    if (c === 'keys') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for 'keys' command");
      var kre = redisGlobToRe(String(rest[0]));
      hints.push('（教学提示）KEYS 会一次性遍历整个 keyspace，而 Redis 是单线程的 —— 大实例上这一条命令就能把服务卡住，生产环境禁用；要用 `redis-cli --scan --pattern \'' + String(rest[0]) + '\'` 或 SCAN 游标');
      return reply(redisReplyArray(Object.keys(keys).filter(function (k) { return kre.test(k); }).sort()));
    }

    if (c === 'scan') {
      var cursor = rest[0] === undefined ? '0' : String(rest[0]);
      var mpat = '*', mcount = 10;
      for (var ri = 1; ri < rest.length; ri++) {
        if (String(rest[ri]).toLowerCase() === 'match' && rest[ri + 1] !== undefined) { mpat = String(rest[++ri]); continue; }
        if (String(rest[ri]).toLowerCase() === 'count' && rest[ri + 1] !== undefined) { mcount = Number(rest[++ri]); continue; }
      }
      var sre = redisGlobToRe(mpat);
      var batch = Object.keys(keys).filter(function (k) { return sre.test(k); }).sort().slice(0, mcount);
      var next = batch.length > mcount ? String(mcount) : '0';
      if (!batch.length) return reply(['1) "' + next + '"', '2) (empty array)']);
      return reply(['1) "' + next + '"', '2) 1) ' + JSON.stringify(batch[0])].concat(
        batch.slice(1).map(function (k, idx) { return '   ' + (idx + 2) + ') ' + JSON.stringify(k); })
      ));
    }
    if (c === 'get') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for 'get' command");
      var gk = keys[String(rest[0])];
      if (!gk) return reply(['(nil)']);
      if (gk.type !== 'string') return errReply('(error) WRONGTYPE Operation against a key holding the wrong kind of value');
      return reply([JSON.stringify(String(gk.value === null ? '' : gk.value))]);
    }

    if (c === 'set') {
      if (rest.length < 2) return errReply("(error) ERR wrong number of arguments for 'set' command");
      var sk = String(rest[0]), sv = String(rest[1]);
      keys[sk] = { type: 'string', bytes: sv.length, items: 0, ttl: -1, value: sv };
      if (rest.length >= 4 && String(rest[2]).toLowerCase() === 'ex') keys[sk].ttl = Number(rest[3]);
      return reply(['OK']);
    }

    if (c === 'del' || c === 'unlink') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for '" + c + "' command");
      var n = 0;
      rest.forEach(function (k) { if (keys[String(k)]) { delete keys[String(k)]; n++; } });
      return reply(['(integer) ' + n]);
    }

    if (c === 'exists') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for 'exists' command");
      return reply(['(integer) ' + (keys[String(rest[0])] ? 1 : 0)]);
    }

    if (c === 'ttl' || c === 'pttl') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for '" + c + "' command");
      var tk = keys[String(rest[0])];
      var ttl = tk ? tk.ttl : -2;
      return reply(['(integer) ' + (c === 'pttl' && ttl > 0 ? ttl * 1000 : ttl)]);
    }

    if (c === 'expire') {
      if (rest.length < 2) return errReply("(error) ERR wrong number of arguments for 'expire' command");
      var ek = keys[String(rest[0])];
      if (!ek) return reply(['(integer) 0']);
      ek.ttl = Number(rest[1]);
      return reply(['(integer) 1']);
    }

    if (c === 'type') {
      if (!rest.length) return errReply("(error) ERR wrong number of arguments for 'type' command");
      var yk = keys[String(rest[0])];
      return reply([yk ? yk.type : 'none']);
    }

    if (c === 'select') {
      var idx = Number(rest[0]);
      if (isNaN(idx) || idx < 0 || idx > 15) return errReply('(error) ERR DB index is out of range');
      hints.push('（教学提示）redis-cli 每次执行都是一条新连接，SELECT 只对当前这条连接有效；要在别的库上执行命令请用 `-n ' + idx + '`');
      return reply(['OK']);
    }

    if (c === 'object') {
      var osub = String(rest[0] || '').toLowerCase();
      if (!osub) return errReply("(error) ERR wrong number of arguments for 'object' command");
      var okv = keys[String(rest[1])];
      if (!okv) {
        if (osub === 'encoding' || osub === 'freq' || osub === 'refcount' || osub === 'idletime') return reply(['(error) ERR no such key']);
        return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + rest[0] + "'. Try OBJECT HELP.");
      }
      if (osub === 'encoding') {
        var enc;
        if (okv.type === 'string') enc = /^-?\d+$/.test(String(okv.value)) ? 'int' : (okv.bytes <= 44 ? 'embstr' : 'raw');
        else if (okv.type === 'list') enc = okv.items > 128 ? 'quicklist' : 'listpack';
        else if (okv.type === 'hash') enc = okv.items > 128 ? 'hashtable' : 'listpack';
        else if (okv.type === 'set') enc = okv.items > 128 ? 'hashtable' : 'listpack';
        else enc = 'listpack';
        return reply([enc]);
      }
      if (osub === 'refcount') return reply(['(integer) 1']);
      if (osub === 'idletime') return reply(['(integer) 0']);
      if (osub === 'freq') {
        if (String(state.config['maxmemory-policy']).indexOf('lfu') === -1) {
          return errReply('(error) ERR An LFU maxmemory policy is not selected, access frequency not tracked. Please note that when switching between maxmemory policies at runtime LFU and LRU data will take some time to adjust.');
        }
        return reply(['(integer) 12']);
      }
      return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + rest[0] + "'. Try OBJECT HELP.");
    }

    if (c === 'memory') {
      var msub = String(rest[0] || '').toLowerCase();
      if (msub === 'usage') {
        var mk = keys[String(rest[1])];
        if (!mk) return reply(['(nil)']);
        return reply(['(integer) ' + (mk.bytes + 56 + String(rest[1]).length)]);
      }
      if (msub === 'doctor') {
        var mm = redisMem(state);
        return reply(['Sam, I detected a few issues in this Redis instance memory implants:',
          '',
          ' * High allocator fragmentation: used_memory is ' + redisMemFmt(mm.used) + ' but RSS is ' + redisMemFmt(mm.rss) + ' (' + (mm.rss / mm.used).toFixed(2) + 'x).',
          ' * Peak memory: the instance once used ' + redisMemFmt(mm.peak) + '.',
          ' * Big key detected: big:cache:report:2024Q1 holds 1048576 bytes.',
          '',
          'I have a few advices for you:',
          '',
          ' * Use MEMORY USAGE <key> SAMPLES 0 on the big keys before splitting them.',
          ' * If you are using Redis as a cache, set maxmemory and an eviction policy (currently maxmemory=' + state.config.maxmemory + ', policy=' + state.config['maxmemory-policy'] + ').',
          ' * Check SLOWLOG GET for O(N) commands that block the single-threaded event loop.']);
      }
      if (msub === 'stats') {
        var ms = redisMem(state);
        return reply([
          ' 1) "peak.allocated"', ' 2) (integer) ' + ms.peak,
          ' 3) "total.allocated"', ' 4) (integer) ' + ms.used,
          ' 5) "startup.allocated"', ' 6) (integer) 786432',
          ' 7) "overhead.total"', ' 8) (integer) ' + ms.overhead,
          ' 9) "dataset.bytes"', '10) (integer) ' + ms.dataset,
          '11) "keys.count"', '12) (integer) ' + ms.keys,
          '13) "dataset.percentage"', '14) "' + (ms.dataset / ms.used * 100).toFixed(2) + '"',
          '15) "fragmentation"', '16) "' + (ms.rss / ms.used).toFixed(2) + '"'
        ]);
      }
      return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + (rest[0] || '') + "'. Try MEMORY HELP.");
    }

    if (c === 'config') {
      var act = String(rest[0] || '').toLowerCase();
      if (act === 'get') {
        if (rest[1] === undefined) return errReply("(error) ERR wrong number of arguments for 'config|get' command");
        var cre = redisGlobToRe(String(rest[1]));
        var names = Object.keys(state.config).filter(function (k) { return cre.test(k); }).sort();
        var flat = [];
        names.forEach(function (k) { flat.push(k); flat.push(state.config[k]); });
        return reply(redisReplyArray(flat, true));
      }
      if (act === 'set') {
        if (rest.length < 3) return errReply("(error) ERR wrong number of arguments for 'config|set' command");
        var ck = String(rest[1]).toLowerCase(), cv = String(rest[2]);
        if (state.config[ck] === undefined) return errReply("(error) ERR Unknown option or number of arguments for CONFIG SET - '" + rest[1] + "'");
        if (ck === 'maxmemory' && !/^\d+([kmg]b?)?$/i.test(cv)) return errReply("(error) ERR CONFIG SET failed - argument couldn't be parsed into an integer");
        state.config[ck] = cv;
        var extra = [];
        if (ck === 'maxmemory' && cv === '0') extra.push('（教学提示）maxmemory=0 表示不限制内存：Redis 会一直吃内存直到把机器吃爆，配合 maxmemory-policy noeviction 就是"写满即报错"。生产必须设上限 + 淘汰策略。');
        if (ck === 'maxmemory-policy' && cv.indexOf('lfu') === -1) extra.push('（教学提示）淘汰策略改成 ' + cv + ' 后 --hotkeys 会不可用（它要求 LFU 类策略）；另外 CONFIG SET 只是运行时生效，重启会丢。');
        return { handled: true, out: ['OK'], err: hints.concat(extra), code: 0 };
      }
      if (act === 'rewrite') {
        hints.push('（教学提示）CONFIG REWRITE 把运行时改过的参数写回启动时用的配置文件（本站实例是 /etc/redis/redis.conf）；如果进程不是用配置文件启动的，真机会报 "The server is running without a config file"。');
        return reply(['OK']);
      }
      if (act === 'resetstat') {
        hints.push('（教学提示）CONFIG RESETSTAT 清零 INFO stats 里的计数器（keyspace_hits/misses 等），排查"某段时间"的命中率时先清零再观察。');
        return reply(['OK']);
      }
      return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + (rest[0] || '') + "'. Try CONFIG HELP.");
    }

    if (c === 'slowlog') {
      var ssub = String(rest[0] || '').toLowerCase();
      if (ssub === 'get') {
        var cnt = rest[1] === undefined ? 10 : Number(rest[1]);
        return reply(redisSlowLogGet(state, isNaN(cnt) ? 10 : cnt));
      }
      if (ssub === 'len') return reply(['(integer) ' + state.slowlog.length]);
      if (ssub === 'reset') {
        var had = state.slowlog.length;
        state.slowlog = [];
        hints.push('（教学提示）SLOWLOG RESET 只清空慢日志列表，不动数据；清空后观察一段时间，只看新产生的慢命令。');
        return reply(['OK']);
      }
      if (ssub === 'help') return reply(['SLOWLOG <subcommand> [<arg> [value] [opt] ...]. Subcommands are:', 'GET [<count>]', 'LEN', 'RESET']);
      return errReply("(error) ERR Unknown SLOWLOG subcommand or wrong number of arguments for '" + (rest[0] || '') + "'");
    }

    if (c === 'client') {
      var clsub = String(rest[0] || '').toLowerCase();
      if (clsub === 'list') {
        var type = null;
        for (var ci = 1; ci < rest.length; ci++) if (String(rest[ci]).toUpperCase() === 'TYPE' && rest[ci + 1]) type = String(rest[ci + 1]).toLowerCase();
        var list = redisClientList(state);
        if (type === 'normal') list = list.filter(function (l) { return l.indexOf('cmd=ping') === -1; });
        return reply(list);
      }
      if (clsub === 'info') return reply(['id=44882 addr=10.0.1.23:54122 laddr=10.0.2.16:6379 fd=8 name= age=0 idle=0 flags=N db=0 sub=0 psub=0 multi=-1 cmd=client user=default resp=2']);
      if (clsub === 'getname') return reply(['']);
      if (clsub === 'setname') return reply(['OK']);
      if (clsub === 'id') return reply(['(integer) 44882']);
      if (clsub === 'kill') {
        var kid = null, kaddr = null;
        for (var ki = 1; ki < rest.length; ki++) {
          var ka = String(rest[ki]).toUpperCase();
          if (ka === 'ID' && rest[ki + 1]) { kid = Number(rest[ki + 1]); ki++; continue; }
          if (ka === 'ADDR' && rest[ki + 1]) { kaddr = String(rest[ki + 1]); ki++; continue; }
        }
        if (kid === null && kaddr === null) {
          return errReply("(error) ERR wrong number of arguments for 'client|kill' command");
        }
        var killed = 0;
        state.clients = state.clients.filter(function (cl) {
          if (kid !== null && cl.id === kid) { killed++; return false; }
          if (kaddr !== null && cl.addr === kaddr) { killed++; return false; }
          return true;
        });
        hints.push('（教学提示）CLIENT KILL 会立刻断开目标连接；先 CLIENT LIST 确认 id/addr 再动手，杀错会把正常业务连接打断。');
        return reply(['(integer) ' + killed]);
      }
      if (clsub === 'no-evict' || clsub === 'no-touch' || clsub === 'reply' || clsub === 'unpause' || clsub === 'pause') {
        hints.push('（教学提示）CLIENT ' + String(rest[0]).toUpperCase() + ' 会改变客户端连接的运行时行为，本站仿真只做参数识别，不模拟连接状态。');
        return reply(['OK']);
      }
      return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + (rest[0] || '') + "'. Try CLIENT HELP.");
    }

    if (c === 'cluster') {
      var cl2 = String(rest[0] || '').toLowerCase();
      if (cl2 === 'info') {
        return reply([
          'cluster_enabled:0',
          'cluster_state:ok',
          'cluster_slots_assigned:0',
          'cluster_slots_ok:0',
          'cluster_slots_pfail:0',
          'cluster_slots_fail:0',
          'cluster_known_nodes:1',
          'cluster_size:0',
          'cluster_current_epoch:0',
          'cluster_my_epoch:0',
          'cluster_stats_messages_sent:0',
          'cluster_stats_messages_received:0',
          'total_cluster_links_buffer_limit_exceeded:0'
        ]);
      }
      if (cl2 === 'nodes') {
        hints.push('（教学提示）本站 cache-prod-01 是**单机（standalone）**实例，cluster_enabled:0 —— 集群模式（Cluster）只支持 0 号库，SELECT 会直接报错，这也是很多公司只用 0 号库、靠 key 前缀区分业务的原因。');
        return reply(['8f3c1a724d5e4b919c2a1e7d6b0c4f88 10.0.2.16:6379@16379 myself,master - 0 0 0 connected']);
      }
      if (cl2 === 'slots' || cl2 === 'shards') {
        return errReply('(error) ERR This instance has cluster support disabled');
      }
      if (cl2 === 'myid') return reply(['8f3c1a724d5e4b919c2a1e7d6b0c4f88']);
      return errReply("(error) ERR Unknown subcommand or wrong number of arguments for '" + (rest[0] || '') + "'. Try CLUSTER HELP.");
    }

    if (c === 'bgsave') {
      hints.push('（教学提示）BGSAVE 会 fork 出子进程写 RDB，主进程继续服务；fork 瞬间的内存页表复制在大实例上可能造成毫秒级卡顿，用 INFO persistence 看 rdb_last_bgsave_status 确认结果。');
      return reply(['Background saving started']);
    }
    if (c === 'bgrewriteaof') {
      hints.push('（教学提示）BGREWRITEAOF 只在 appendonly yes 时有意义；本站实例 appendonly=no（未开 AOF）。');
      return reply(['Background append only file rewriting started']);
    }
    if (c === 'lastsave') return reply(['(integer) 1710720000']);
    if (c === 'monitor') {
      return okHint([
        '（教学环境不模拟 MONITOR 的实时流：真机上它会一直挂着把每条命令回显出来，直到 Ctrl+C）',
        '真机用法：timeout 10 redis-cli -h ' + hostName + ' -p ' + port + ' MONITOR | grep -i "order:8812"'
      ], hints.concat(['（教学提示）MONITOR 让 Redis 为每条命令多做一次格式化与推送，官方文档明确说明会降低约 50% 吞吐；正确用法是"短时、精确、有目标"，开 10~30 秒抓到就退出。']));
    }
    if (c === 'flushall' || c === 'flushdb') {
      return errReply('(error) ERR ' + c + ' 会把整个实例/当前库的数据清空 —— 教学环境**故意不执行**这条危险命令。' +
        '真机上生产环境执行前必须确认：① 有没有从库/备份；② 是否只是缓存（能重建）；③ 业务是否已停写。');
    }
    if (c === 'command' || c === 'debug' || c === 'acl' || c === 'function' || c === 'module' || c === 'latency' || c === 'shutdown' || c === 'replicaof' || c === 'slaveof' || c === 'failover') {
      return errReply('(error) ERR 教学环境未实现该子命令；已实现：ping / info（含 commandstats）/ dbsize / keys / scan / get / set / del / exists / ttl / pttl / expire / type / select / object / memory usage|doctor|stats / config get|set|rewrite / slowlog get|len|reset / client list|info|kill / cluster info|nodes|myid / bgsave / lastsave / --scan / --bigkeys / --hotkeys');
    }
    return errReply("(error) ERR unknown command '" + cmd + "', with args beginning with: ");
  }

  /* 状态相关的教学提示（只加一次） */
  function hintPush(hints, state) {
    var big = state.dbs[0] && state.dbs[0]['big:cache:report:2024Q1'];
    if (big && hints.length < 4) {
      hints.push('（教学提示）big:cache:report:2024Q1 占 ' + big.bytes + ' 字节，是本站的"大 key"样板；--bigkeys 能扫出来，MEMORY USAGE 可以精确算它。');
    }
  }

  /* redis 的编号数组风格（整数裸打，字符串带引号） */
  function redisReplyArray(items, forceQuote) {
    return items.map(function (it, i) {
      var s = String(it);
      return (i + 1) + ') ' + (!forceQuote && /^-?\d+$/.test(s) ? s : JSON.stringify(s));
    });
  }

  /* ======================================================================
     4. etcdctl
     ====================================================================== */

  var ETCD_MEMBERS = [
    { id: '8e9e05c52164694d', name: 'etcd-01', peer: 'https://10.0.1.11:2380', client: 'https://10.0.1.11:2379', status: 'started', learner: false, leader: true },
    { id: '91bc3f7a2d5e8c14', name: 'etcd-02', peer: 'https://10.0.1.12:2380', client: 'https://10.0.1.12:2379', status: 'started', learner: false, leader: false },
    { id: 'a4d8b16e9f2c7305', name: 'etcd-03', peer: 'https://10.0.1.13:2380', client: 'https://10.0.1.13:2379', status: 'started', learner: false, leader: false }
  ];

  var ETCD_KV = [
    { key: '/registry/namespaces/default', value: '{"kind":"Namespace","metadata":{"name":"default"}}' },
    { key: '/registry/namespaces/kube-system', value: '{"kind":"Namespace","metadata":{"name":"kube-system"}}' },
    { key: '/registry/namespaces/my-app', value: '{"kind":"Namespace","metadata":{"name":"my-app"}}' },
    { key: '/registry/pods/default/mysql-0', value: '{"kind":"Pod","metadata":{"name":"mysql-0","namespace":"default"},"status":{"phase":"Running"}}' },
    { key: '/registry/pods/default/web-7d9c4b8f5-2xk9p', value: '{"kind":"Pod","metadata":{"name":"web-7d9c4b8f5-2xk9p","namespace":"default"},"spec":{"nodeName":"10.0.1.23"}}' },
    { key: '/registry/pods/default/worker-6b8f7c9d4-m2vqt', value: '{"kind":"Pod","metadata":{"name":"worker-6b8f7c9d4-m2vqt","namespace":"default"},"status":{"phase":"Running","containerStatuses":[{"restartCount":7,"state":{"waiting":{"reason":"CrashLoopBackOff"}}}]}}' },
    { key: '/registry/pods/my-app/web-7d9c4b8f5-2xk9p', value: '{"kind":"Pod","metadata":{"name":"web-7d9c4b8f5-2xk9p","namespace":"my-app"}}' },
    { key: '/registry/pods/my-app/worker-6b8f7c9d4-m2vqt', value: '{"kind":"Pod","metadata":{"name":"worker-6b8f7c9d4-m2vqt","namespace":"my-app"}}' },
    { key: '/registry/configmaps/default/app-config', value: '{"kind":"ConfigMap","metadata":{"name":"app-config","namespace":"default"},"data":{"redis.host":"cache-prod-01","mysql.host":"db-prod-01"}}' },
    { key: '/registry/configmaps/default/nginx-config', value: '{"kind":"ConfigMap","metadata":{"name":"nginx-config","namespace":"default"}}' },
    { key: '/registry/services/specs/default/mysql', value: '{"kind":"Service","metadata":{"name":"mysql"},"spec":{"clusterIP":"10.96.0.10","ports":[{"port":3306}]}}' },
    { key: '/registry/services/specs/default/web', value: '{"kind":"Service","metadata":{"name":"web"},"spec":{"clusterIP":"10.96.0.11","ports":[{"port":8080}]}}' },
    { key: '/registry/services/endpoints/default/kubernetes', value: '{"kind":"Endpoints","metadata":{"name":"kubernetes"},"subsets":[{"addresses":[{"ip":"10.0.1.11"}]}]}' },
    { key: '/registry/config/db', value: 'host: db-prod-01\nport: 3306\ndatabase: orders\npool: 20' },
    { key: '/registry/config/redis', value: 'host: cache-prod-01\nport: 6379\nmaxmemory-policy: noeviction' },
    { key: '/registry/config/gray', value: 'off' },
    { key: '/registry/leases/kube-node-lease/10.0.1.23', value: '{"kind":"Lease","metadata":{"name":"10.0.1.23"}}' }
  ];

  function etcdSnapshotId() { return 'a3f91c7d'; }

  function etcdState(ctx) {
    var node = U.findNode(ctx.root, '/var/lib/etcd');
    var st = node && node.ccEtcd;
    if (!st) {
      st = { kv: ETCD_KV.map(function (e) { return { key: e.key, value: e.value }; }), revision: ETCD_REVISION, snapshot: { revision: ETCD_REVISION - 4820, totalKey: ETCD_KV.length, totalSize: 2411724 } };
      if (node) node.ccEtcd = st; else ETCD_STATE = st;
    }
    return st;
  }
  var ETCD_STATE = null;

  function etcdApiVersion(env) {
    if (env && env.ETCDCTL_API) return String(env.ETCDCTL_API);
    return '3';
  }

  function etcdParseEndpoints(argv, ctx, env) {
    var eps = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.indexOf('--endpoints=') === 0) eps = a.slice('--endpoints='.length);
      else if (a === '--endpoints' && argv[i + 1]) eps = String(argv[++i]);
    }
    if (!eps && env && env.ETCDCTL_ENDPOINTS) eps = String(env.ETCDCTL_ENDPOINTS);
    if (!eps) eps = 'https://10.0.1.11:2379';
    return String(eps).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function etcdEndpointInfo(ep) {
    var m = String(ep).match(/^(https?):\/\/([^:/]+):(\d+)$/);
    if (!m) return null;
    var host = m[2], port = Number(m[3]);
    var known = VHOSTS[host];
    if (!known) {
      for (var k in VHOSTS) {
        if (Object.prototype.hasOwnProperty.call(VHOSTS, k) && VHOSTS[k].ip === host) { known = VHOSTS[k]; host = k; break; }
      }
    }
    var isEtcd = !!known && !!known.services.etcd && (port === 2379 || port === 2380);
    var isIpEtcd = /^10\.0\.1\.1[123]$/.test(m[2]) && (port === 2379 || port === 2380);
    if (!isEtcd && !isIpEtcd) {
      return { url: ep, host: host, port: port, ok: false, error: 'context deadline exceeded' };
    }
    var member = null;
    var ip = known ? known.ip : m[2];
    for (var j = 0; j < ETCD_MEMBERS.length; j++) {
      if (ETCD_MEMBERS[j].client.indexOf(ip + ':') !== -1) member = ETCD_MEMBERS[j];
    }
    return { url: ep, host: host, port: port, ok: true, member: member, ip: ip };
  }

  function etcdFormatFlag(argv) {
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-w' || a === '--write-out') return String(argv[i + 1] || 'simple');
      if (a.indexOf('--write-out=') === 0) return a.slice('--write-out='.length);
      if (a.indexOf('-w') === 0 && a.length > 2) return a.slice(2);
    }
    return 'simple';
  }

  function etcdTable(header, rows) { return table(header, rows); }

  function etcdValueLines(items, keysOnly) {
    var out = [];
    items.forEach(function (it) {
      out.push(it.key);
      if (!keysOnly) out.push(it.value);
    });
    return out;
  }

  var CMDS_ETCD = {
    'endpoint': function (argv, ctx, stdin, HOST, env) {
      var sub = String(argv[0] || '').toLowerCase();
      var fmt = etcdFormatFlag(argv);
      var eps = etcdParseEndpoints(argv, ctx, env);
      var wantCluster = argv.indexOf('--cluster') !== -1;
      if (wantCluster) {
        ETCD_MEMBERS.forEach(function (m) {
          if (eps.indexOf(m.client) === -1) eps.push(m.client);
        });
      }
      var infos = eps.map(function (e) { return etcdEndpointInfo(e); });
      if (sub === 'health') {
        var out = [], errs = [];
        if (fmt === 'table') {
          var rows = [];
          infos.forEach(function (info) {
            var okv = info.ok ? 'true' : 'false';
            rows.push([info.url, okv, (info.ok ? (nowSec() - 3) : nowSec()) + 's', info.ok ? 'successfully committed proposal' : info.error]);
          });
          out = etcdTable(['endpoint', 'health', 'took', 'error'], rows);
        } else {
          infos.forEach(function (info) {
            if (info.ok) out.push(info.url + ' is healthy: successfully committed proposal: took = ' + ((nowSec() % 7) + 3) + '.' + (100000 + (nowSec() % 800000)) + 'ms');
            else { out.push(info.url + ' is unhealthy: failed to commit proposal: ' + info.error); errs.push(info.url + ' is unhealthy: failed to commit proposal: ' + info.error); }
          });
        }
        var bad = infos.filter(function (i2) { return !i2.ok; });
        if (bad.length) {
          errs = errs.concat(['（教学提示）' + bad.length + ' 个端点连不上。endpoint health 会真的向每个节点发一次请求（内含写探测），' +
            '返回 "is healthy: successfully committed proposal" 才算通过；不带 --cluster 时只探测 --endpoints 里给的地址。']);
          return { out: out, err: errs, code: 1 };
        }
        out.push('（教学提示）etcdctl v' + etcdApiVersion(env) + ' 接口；endpoint health 只测可用性，容量与 leader 信息看 `etcdctl endpoint status -w table`。');
        return { out: out, err: [], code: 0 };
      }
      if (sub === 'status') {
        var rows2 = [], jsonItems = [];
        infos.forEach(function (info) {
          var dbSize = 73400320 + (info.ip || '').charCodeAt(info.ip.length - 1) * 4096;
          var isLeader = !!(info.member && info.member.leader);
          if (!info.ok) {
            rows2.push([info.url, 'unhealthy', '-', '-', '-', '-', '-', info.error]);
            jsonItems.push({ Endpoint: info.url, Status: { header: { revision: 0 }, leader: 0, raftIndex: 0, raftTerm: 0, dbSize: 0, dbSizeInUse: 0 }, Error: info.error });
            return;
          }
          var rev = etcdState(ctx).revision;
          rows2.push([
            info.url, info.member.id, info.member.name + ', ' + info.member.peer,
            "'" + etcdSnapshotId() + "', started, leader, false",
            info.member.leader ? 'true' : 'false', info.member.leader ? '0' : '18421',
            rev, rev - 182, '3.5.12', dbSize, Math.round(dbSize * 0.82), info.member.leader ? '' : '[]'
          ]);
          jsonItems.push({
            Endpoint: info.url,
            Status: {
              header: { cluster_id: 11429834680779542000, member_id: parseInt(info.member.id.slice(0, 8), 16), revision: rev, raft_term: 3 },
              version: '3.5.12',
              dbSize: dbSize, dbSizeInUse: Math.round(dbSize * 0.82),
              leader: info.member.leader ? parseInt(info.member.id.slice(0, 8), 16) : parseInt('8e9e05c5', 16),
              raftIndex: rev, raftTerm: 3,
              isLearner: false
            }
          });
        });
        if (fmt === 'json') {
          return { out: [JSON.stringify(jsonItems, null, 1)], err: ['（教学提示）-w json 便于脚本取 dbSize / dbSizeInUse / leader / raftIndex；逼近 2GiB 配额时 etcd 会先报 "mvcc: database space exceeded" 然后整个集群只读，恢复要 compact 回收历史版本再 defrag 整理碎片。'], code: 0 };
        }
        if (fmt === 'table') {
          return { out: etcdTable(['ENDPOINT', 'ID', 'VERSION', 'DB SIZE', 'DB SIZE IN USE', 'IS LEADER', 'IS LEARNER', 'ERRORS'].concat(), rows2.map(function (r) {
            return [r[0], r[1], r[8], r[9], r[10], r[4], 'false', r[11]];
          })), err: ['（教学提示）重点看 DB SIZE（数据文件含历史版本与碎片）与 DB SIZE IN USE（真实存活数据）的差距；差距大说明要 compact + defrag。'], code: 0 };
        }
        var outLines = [];
        rows2.forEach(function (r) { outLines.push(r[0] + ', ' + r[1] + ', ' + r[9] + ', ' + r[10] + ', ' + r[8] + ', ' + r[4]); });
        return { out: outLines, err: ['（教学提示）默认 simple 格式字段顺序不易读，看容量建议加 -w table。'], code: 0 };
      }
      if (sub === 'hashkv' || sub === 'snapshot') {
        return { out: [], err: ['（教学提示）endpoint ' + sub + ' 在 etcd 3.5 里属于实验/特定用途子命令，本站未实现；常用的是 endpoint health / status。'], code: 1 };
      }
      return { out: [], err: ["Error: unknown command \"endpoint " + sub + "\" for \"etcdctl\"", '（教学提示）endpoint 支持的子命令：health / status / hashkv / snapshot。'], code: 1 };
    },
    'member': function (argv, ctx, stdin, HOST, env) {
      var sub = String(argv[0] || '').toLowerCase();
      var fmt = etcdFormatFlag(argv);
      if (sub === 'list') {
        var st = etcdState(ctx);
        var peers = ETCD_MEMBERS.map(function (m) { return m; });
        if (fmt === 'table') {
          return ok(etcdTable(['ID', 'STATUS', 'NAME', 'PEER ADDRS', 'CLIENT ADDRS', 'IS LEARNER'], peers.map(function (m) {
            return [m.id.slice(0, 16), m.status, m.name, m.peer, m.client, String(m.learner)];
          })));
        }
        if (fmt === 'json') {
          return ok([JSON.stringify({ members: peers.map(function (m) {
            return { ID: parseInt(m.id.slice(0, 8), 16), name: m.name, peerURLs: [m.peer], clientURLs: [m.client], isLearner: m.learner };
          }) }, null, 1)]);
        }
        return ok(peers.map(function (m) {
          return m.id.slice(0, 16) + ', ' + m.status + ', ' + m.name + ', ' + m.peer + ', ' + m.client + ', ' + m.learner;
        }));
      }
      if (sub === 'add') {
        var nname = String(argv[1] || '');
        if (!nname) return fail(['Error: etcdctl member add expects a member name argument', '（教学提示）用法：etcdctl member add <名称> --peer-urls=https://<新节点IP>:2380']);
        var purl = '';
        for (var i = 2; i < argv.length; i++) {
          if (String(argv[i]).indexOf('--peer-urls=') === 0) purl = String(argv[i]).slice('--peer-urls='.length);
          else if (String(argv[i]) === '--peer-urls' && argv[i + 1]) purl = String(argv[i + 1]);
        }
        var newId = 'b7c2e91a4f6d3805';
        ETCD_MEMBERS.push({ id: newId, name: nname, peer: purl || 'https://10.0.1.14:2380', client: (purl || 'https://10.0.1.14:2380').replace(':2380', ':2379'), status: 'unstarted', learner: false });
        return ok([
          'Member ' + newId + ' added to cluster 11429834680779542000',
          '',
          'ETCD_NAME="' + nname + '"',
          'ETCD_INITIAL_CLUSTER="' + ETCD_MEMBERS.map(function (m) { return m.name + '=' + m.peer; }).join(',') + '"',
          'ETCD_INITIAL_ADVERTISE_PEER_URLS="' + (purl || 'https://10.0.1.14:2380') + '"',
          'ETCD_INITIAL_CLUSTER_STATE="existing"',
          '',
          '（教学提示）member add 只是把新成员登记进集群；新节点**必须**用上面的 ETCD_INITIAL_CLUSTER 与 ' +
          '--initial-cluster-state existing 启动才会真正加入。此登记未持久化的新成员会让集群 quorum 变紧，' +
          '起不来时要 member remove 撤回。'
        ]);
      }
      if (sub === 'remove') {
        var rid = String(argv[1] || '');
        if (!rid) return fail(['Error: etcdctl member remove expects a member ID argument', '（教学提示）用法：etcdctl member remove <成员ID>（ID 从 member list 拿）']);
        var before = ETCD_MEMBERS.length, hit = false;
        ETCD_MEMBERS = ETCD_MEMBERS.filter(function (m) { if (m.id.indexOf(rid) === 0 || m.id.slice(0, 16) === rid) { hit = true; return false; } return true; });
        if (!hit) return codeFail(['Error: member ' + rid + ' not found', '（教学提示）移除前先 `etcdctl member list -w table` 核对 ID；移除会永久删掉该成员的数据视图，先加后删才能保证 quorum 不丢。'], 1);
        return ok(['Member ' + rid + ' removed from cluster 11429834680779542000',
          '（教学提示）缩容后立刻复查集群健康：`etcdctl endpoint health --cluster -w table`（已移除 ' + (before - ETCD_MEMBERS.length) + ' 个成员）。']);
      }
      if (sub === 'update') return ok(['Member ' + String(argv[1] || '') + ' updated to peerURLs ' + String(argv[2] || '')]);
      if (sub === 'promote') {
        var pid2 = String(argv[1] || '');
        return ok(['Member ' + pid2 + ' promoted', '（教学提示）promote 只对 learner 成员有效；提升前要确认它已经追上 leader 的 raftIndex，否则会长时间不可用。']);
      }
      return fail(["Error: unknown command \"member " + sub + "\" for \"etcdctl\"", '（教学提示）member 支持的子命令：list / add / remove / update / promote。']);
    },
    'get': function (argv, ctx, stdin, HOST, env) {
      var st = etcdState(ctx);
      var keysOnly = argv.indexOf('--keys-only') !== -1;
      var prefix = argv.indexOf('--prefix') !== -1;
      var limit = null;
      var fmt = etcdFormatFlag(argv);
      var keys = [];
      for (var i = 0; i < argv.length; i++) {
        var a = String(argv[i]);
        if (a.indexOf('--limit=') === 0) limit = Number(a.slice('--limit='.length));
        else if (a === '--limit' && argv[i + 1]) limit = Number(argv[++i]);
        else if (a.charAt(0) !== '-') keys.push(a);
      }
      if (!keys.length) return fail(['Error: etcdctl get expects a key argument', '（教学提示）用法：etcdctl get <key> [--prefix] [--keys-only] [--limit=N] [-w json]']);
      var key = keys[0];
      var items = st.kv.filter(function (e) { return prefix ? e.key.indexOf(key) === 0 : e.key === key; });
      if (limit !== null && limit >= 0) items = items.slice(0, limit);
      if (fmt === 'json') {
        return ok([JSON.stringify({
          header: { cluster_id: 11429834680779542000, member_id: 10275212763524571629, revision: st.revision, raft_term: 3 },
          kvs: items.map(function (e) {
            return { key: b64(e.key), create_revision: st.revision - 184, mod_revision: st.revision - 2, version: 3, value: keysOnly ? undefined : b64(e.value) };
          }),
          count: items.length
        }, function (k, v) { return v === undefined || v === null ? undefined : v; }, 1)]);
      }
      return ok(etcdValueLines(items, keysOnly));
    },
    'put': function (argv, ctx, stdin, HOST, env) {
      var args = argv.filter(function (a) { return String(a).charAt(0) !== '-'; });
      var key = args[0];
      var val = args.length > 1 ? args.slice(1).join(' ') : (stdin && stdin.length ? stdin.join('\n') : null);
      if (!key) return fail(['Error: etcdctl put expects key and value arguments', '（教学提示）用法：etcdctl put <key> <value>；value 也可以用管道喂（echo x | etcdctl put k）']);
      if (val === null) return fail(['Error: etcdctl put expects a value argument', '（教学提示）用法：etcdctl put <key> <value>']);
      var st = etcdState(ctx);
      var found = false;
      st.kv.forEach(function (e) { if (e.key === key) { e.value = val; found = true; } });
      if (!found) st.kv.push({ key: key, value: val });
      st.revision += 1;
      var extra = [];
      for (var i = 0; i < argv.length; i++) if (String(argv[i]).indexOf('--lease=') === 0) extra.push('（教学提示）--lease=' + String(argv[i]).slice('--lease='.length) + ' 让这个 key 跟随租约过期自动删除，常用于服务注册与心跳。');
      return okHint(['OK'], extra);
    },
    'del': function (argv, ctx, stdin, HOST, env) {
      var prefix = argv.indexOf('--prefix') !== -1;
      var prevKv = argv.indexOf('--prev-kv') !== -1;
      var keys = argv.filter(function (a) { return String(a).charAt(0) !== '-'; });
      if (!keys.length) return fail(['Error: etcdctl del expects a key argument', '（教学提示）用法：etcdctl del <key> [--prefix] [--prev-kv]']);
      var st = etcdState(ctx);
      var key = keys[0], removed = [];
      st.kv = st.kv.filter(function (e) {
        var hit = prefix ? e.key.indexOf(key) === 0 : e.key === key;
        if (hit) removed.push(e);
        return !hit;
      });
      if (removed.length) st.revision += 1;
      var out = [String(removed.length)];
      if (prevKv) removed.forEach(function (e) { out.push(e.key); out.push(e.value); });
      var extra = [];
      if (prefix && removed.length > 1) extra.push('（教学提示）--prefix 一次删掉 ' + removed.length + ' 个 key；删之前的标准动作：先 `--keys-only` 确认范围与条数，再 `snapshot save` 存一份，最后才 del。');
      return okHint(out, extra);
    },
    'watch': function (argv, ctx, stdin, HOST, env) {
      var keys = argv.filter(function (a) { return String(a).charAt(0) !== '-'; });
      var prefix = argv.indexOf('--prefix') !== -1;
      var rev = null;
      for (var i = 0; i < argv.length; i++) {
        var a = String(argv[i]);
        if (a.indexOf('--rev=') === 0) rev = a.slice('--rev='.length);
      }
      var st = etcdState(ctx);
      var items = st.kv.filter(function (e) { return prefix ? e.key.indexOf(keys[0] || '') === 0 : e.key === (keys[0] || ''); });
      var out = ['（教学环境不模拟 watch 的长连接实时事件流：真机上它会一直挂着，匹配的 key 一变就打印一条 PUT / DELETE 事件）'];
      out.push('真机上这条命令会监听：' + (keys[0] || '(未指定 key)') + (prefix ? '（--prefix 整棵子树）' : '') + '，当前 etcd 里匹配到 ' + items.length + ' 个 key。');
      if (rev) out.push('--rev=' + rev + ' 会从该历史版本开始补放事件（前提是这些版本还没被 compact 清掉）。');
      return okHint(out, [
        '（教学提示）watch 是 etcd 的核心能力：K8s 的控制器全靠它做"配置一变立刻感知"，' +
        '比定时轮询 get 更实时也更省资源。要看当前值用 `etcdctl get --prefix ' + (keys[0] || '<key>') + '`。'
      ]);
    },
    'snapshot': function (argv, ctx, stdin, HOST, env) {
      var sub = String(argv[0] || '').toLowerCase();
      var files = argv.filter(function (a) { return String(a).charAt(0) !== '-'; }).slice(1);
      var st = etcdState(ctx);
      if (sub === 'save') {
        if (!files.length) return fail(['Error: etcdctl snapshot save expects a file argument', '（教学提示）用法：etcdctl snapshot save /data/backup/etcd-$(date +%F).db']);
        var saved = { revision: st.revision, totalKey: st.kv.length, totalSize: 2411724 + st.kv.length * 137 };
        var wres = writeVirtualFile(ctx, files[0], '# etcd snapshot (本站仿真占位内容)\nrevision: ' + st.revision + '\n', { mode: '600', size: saved.totalSize });
        if (wres.err) return fail([wres.err]);
        st.snapshot = saved;
        return okHint([
          '{"level":"info","ts":"2024-03-18T09:52:10.114+0800","caller":"snapshot/v3_snapshot.go:296","msg":"created temporary db file","path":"' + files[0] + '.part"}',
          '{"level":"warn","ts":"2024-03-18T09:52:10.882+0800","caller":"clientv3/retry_interceptor.go:62","msg":"retrying of unary invoker failed","target":"endpoint://client-xxx/10.0.1.11:2379","attempt":0,"error":"rpc error: code = DeadlineExceeded"}',
          '{"level":"info","ts":"2024-03-18T09:52:11.204+0800","caller":"snapshot/v3_snapshot.go:322","msg":"fetching snapshot","endpoint":"https://10.0.1.11:2379"}',
          '{"level":"info","ts":"2024-03-18T09:52:13.771+0800","caller":"snapshot/v3_snapshot.go:339","msg":"fetched snapshot","endpoint":"https://10.0.1.11:2379","took":"2.567s"}',
          '{"level":"info","ts":"2024-03-18T09:52:13.774+0800","caller":"snapshot/v3_snapshot.go:348","msg":"saved","path":"' + files[0] + '"}',
          'Snapshot saved at ' + files[0]
        ], ['（教学提示）snapshot save 走 gRPC 在线备份，**不需要停集群**；连任一节点即可，文件是全量的。建议放进 crontab 每小时跑一次，并且定期用 snapshot status 校验。']);
      }
      if (sub === 'status') {
        if (!files.length) return fail(['Error: etcdctl snapshot status expects a file argument', '（教学提示）用法：etcdctl snapshot status <备份文件> [-w table]']);
        var r = U.readFileOrErr(ctx, files[0]);
        if (r.err) return fail([r.err.replace(/^cat:/, 'Error: open ' + files[0] + ':'), '（教学提示）snapshot status 要求文件真实存在（真机报 "Error: open <file>: no such file or directory"）。']);
        var fmt = etcdFormatFlag(argv);
        var snap = st.snapshot;
        if (fmt === 'table') {
          return ok(etcdTable(['HASH', 'REVISION', 'TOTAL KEYS', 'TOTAL SIZE', 'VERSION'], [[etcdSnapshotId(), String(snap.revision), String(snap.totalKey), String(snap.totalSize), '3.5.12']]));
        }
        if (fmt === 'json') return ok([JSON.stringify({ hash: parseInt(etcdSnapshotId(), 16), revision: snap.revision, totalKey: snap.totalKey, totalSize: snap.totalSize, version: '3.5.12' }, null, 1)]);
        return ok([etcdSnapshotId() + ', ' + snap.revision + ', ' + snap.totalKey + ', ' + snap.totalSize + ', 3.5.12']);
      }
      if (sub === 'restore') {
        if (!files.length) return fail(['Error: etcdctl snapshot restore expects a file argument', '（教学提示）用法：etcdctl snapshot restore <备份文件> --data-dir=/var/lib/etcd-restore']);
        var r2 = U.readFileOrErr(ctx, files[0]);
        if (r2.err) return fail([r2.err.replace(/^cat:/, 'Error: open ' + files[0] + ':'), '（教学提示）restore 是**纯离线操作**：不连集群，直接读文件写出一份新数据目录。']);
        var dataDir = null;
        for (var j = 0; j < argv.length; j++) {
          var b = String(argv[j]);
          if (b.indexOf('--data-dir=') === 0) dataDir = b.slice('--data-dir='.length);
          else if (b === '--data-dir' && argv[j + 1]) dataDir = String(argv[++j]);
        }
        if (!dataDir) return fail(['Error: data-dir is required', '（教学提示）必须指定 --data-dir=<新数据目录>，恢复出来的目录再让 etcd 用它启动。']);
        var mkres = ensureVirtualDir(ctx, dataDir);
        if (mkres.err) return fail([mkres.err]);
        return okHint([
          '2024-03-18T09:52:41.114+0800\tinfo\tsnapshot/v3_snapshot.go:626\trestoring snapshot\t{"path": "' + files[0] + '"}',
          '2024-03-18T09:52:41.118+0800\tinfo\tsnapshot/v3_snapshot.go:648\trestored snapshot\t{"path": "' + files[0] + '", "wal-dir": "' + dataDir + '/member/wal"}',
          '',
          '（教学提示）恢复后必须：① 改 --data-dir（二进制部署）或 static pod 的 hostPath（kubeadm 部署）；' +
          '② `chown -R etcd:etcd ' + dataDir + '` 修正属主；③ etcdctl 版本要与集群 etcd 一致，跨大版本恢复容易失败。'
        ], []);
      }
      return fail(["Error: unknown command \"snapshot " + sub + "\" for \"etcdctl\"", '（教学提示）snapshot 支持的子命令：save / status / restore。']);
    },
    'defrag': function (argv, ctx, stdin, HOST, env) {
      var eps = etcdParseEndpoints(argv, ctx, env);
      var wantCluster = argv.indexOf('--cluster') !== -1;
      if (wantCluster) eps = ETCD_MEMBERS.map(function (m) { return m.client; });
      var infos = eps.map(function (e) { return etcdEndpointInfo(e); });
      var out = [], errs = [];
      infos.forEach(function (info) {
        if (info.ok) out.push('Finished defragmenting etcd member[' + info.url + ']');
        else { out.push('Failed to defragment etcd member[' + info.url + '] (' + info.error + ')'); errs.push('Failed to defragment etcd member[' + info.url + '] (' + info.error + ')'); }
      });
      errs.push('（教学提示）defrag 逐节点执行，期间该节点会**短暂不可读写**（阻塞所有请求），务必避开业务高峰；' +
        '它只整理碎片，回收历史版本要先 `etcdctl compact <revision>`。DB SIZE 与 DB SIZE IN USE 差距大就是这个原因。');
      return { out: out, err: errs, code: errs.length > 1 ? 1 : 0 };
    },
    'compact': function (argv, ctx, stdin, HOST, env) {
      var rev = null;
      for (var i = 0; i < argv.length; i++) {
        var a = String(argv[i]);
        if (a.indexOf('--revision=') === 0) rev = a.slice('--revision='.length);
        else if (a.charAt(0) !== '-' && isDigits(a)) rev = a;
      }
      var st = etcdState(ctx);
      if (rev === null) return fail(['Error: etcdctl compact expects a revision', '（教学提示）用法：etcdctl compact <revision>；revision 从 `etcdctl endpoint status -w json` 里取。']);
      if (Number(rev) > st.revision) {
        return codeFail(['Error: etcdserver: mvcc: required revision is a future revision',
          '（教学提示）不能 compact 到比当前 revision 还大的版本：那是"未来的版本"，etcd 会直接拒绝。'], 1);
      }
      return okHint(['compacted revision ' + rev], ['（教学提示）compact 只是回收该 revision 之前的历史版本（供 watch --rev 回放的那部分就没了），磁盘空间要再 defrag 才真正还给操作系统。']);
    },
    'lease': function (argv, ctx, stdin, HOST, env) {
      var sub = String(argv[0] || '').toLowerCase();
      if (sub === 'grant') return ok(['lease 694d7d2a1c3b8f05 granted with TTL(60s)']);
      if (sub === 'list') return ok(['694d7d2a1c3b8f05']);
      if (sub === 'timetolive') return ok(['lease 694d7d2a1c3b8f05 granted with TTL(42s)']);
      if (sub === 'revoke') return ok(['lease 694d7d2a1c3b8f05 revoked']);
      if (sub === 'keep-alive') return okHint(['lease 694d7d2a1c3b8f05 keepalived with TTL(60s)'], ['（教学提示）keep-alive 会一直续租，本站只演示一次续租结果。']);
      return fail(["Error: unknown command \"lease " + sub + "\" for \"etcdctl\"", '（教学提示）lease 支持的子命令：grant / revoke / timetolive / list / keep-alive。']);
    },
    'auth': function (argv, ctx, stdin, HOST, env) {
      return fail(['（教学提示）教学环境不模拟 etcd 的 auth 体系（用户/角色/权限）。' +
        '生产上 etcd 必须开客户端证书双向认证或 auth 鉴权：etcd 里存着 K8s 的全部 Secret，裸奔等于把集群交出去。' +
        '相关子命令见 `etcdctl auth enable` / `etcdctl user add` / `etcdctl role grant-permission`。']);
    },
    'version': function () { return ok(['etcdctl version: 3.5.12', 'API version: 3.5']); },
    'help': function () { return ok(etcdHelpLines()); }
  };

  function etcdHelpLines() {
    return [
      'NAME:',
      '\tetcdctl - A simple command line client for etcd3.',
      '',
      'USAGE:',
      '\tetcdctl [flags]',
      '',
      'VERSION:',
      '\t3.5.12',
      '',
      'API VERSION:',
      '\t3.5',
      '',
      'COMMANDS:',
      '\talarm disarm\tdisarms all alarms',
      '\talarm list\tlists all alarms',
      '\tauth enable\tEnables authentication',
      '\tcompact\t\tcompacts the event history in etcd',
      '\tdefrag\t\tdefragments the storage of the etcd members with given endpoints',
      '\tdel\t\tremoves the specified key or range of keys [key, range_end)',
      '\tendpoint health\tchecks the healthiness of endpoints specified in `--endpoints` flag',
      '\tendpoint status\tprints out the status of endpoints specified in `--endpoints` flag',
      '\tget\t\tgets the key or a range of keys',
      '\tlease grant\tcreates leases',
      '\tmember add\tadds a member into the cluster',
      '\tmember list\tlists all members in the cluster',
      '\tmember remove\tremoves a member from the cluster',
      '\tput\t\tputs the given key into the store',
      '\tsnapshot save\tstores an etcd node backend snapshot to a given file',
      '\tsnapshot status\tgets backend snapshot status of a given file',
      '\tsnapshot restore\trestores an etcd member snapshot to an etcd directory',
      '\twatch\t\twatches events on a given key or a range of keys',
      '',
      '（教学提示）连 K8s 集群务必先 `export ETCDCTL_API=3`：etcd 3.3 及更早默认走 v2 接口，不导出会出现 "etcdctl get 没有输出" 这类莫名其妙的现象。'
    ];
  }

  function etcdctl(argv, ctx, stdin, HOST) {
    var env = ctx.env || {};
    var args = argv.slice();
    /* 全局 flag 可以出现在子命令前面，先摘掉 */
    var globals = [];
    while (args.length && String(args[0]).charAt(0) === '-') {
      var a0 = String(args[0]);
      if (a0 === '-w' || a0 === '--endpoints' || a0 === '--cacert' || a0 === '--cert' || a0 === '--key' || a0 === '--command-timeout' || a0 === '--dial-timeout' || a0 === '--write-out') {
        globals.push(args.shift());
        if (args.length) globals.push(args.shift());
        continue;
      }
      globals.push(args.shift());
    }
    var sub = String(args[0] || '').toLowerCase();
    var stripped = args.slice();
    stripped.shift();

    if (!sub) return ok(etcdHelpLines());

    if (sub === 'endpoint' || sub === 'member' || sub === 'snapshot') {
      var fn3 = CMDS_ETCD[sub];
      return fn3(stripped, ctx, stdin, HOST, env);
    }
    if (Object.prototype.hasOwnProperty.call(CMDS_ETCD, sub)) {
      var fn = CMDS_ETCD[sub];
      return fn(stripped, ctx, stdin, HOST, env);
    }
    if (sub === 'alarm') {
      var asub = String(stripped[0] || '').toLowerCase();
      if (asub === 'list') return ok([]);
      if (asub === 'disarm') return ok(['alarm disarmed']);
      return fail(["Error: unknown command \"alarm " + asub + "\" for \"etcdctl\""]);
    }
    return fail([
      'Error: unknown command "' + sub + '" for "etcdctl"',
      'Run \'etcdctl --help\' for usage.',
      '（教学提示）本站已实现的子命令：endpoint health|status、member list|add|remove、get、put、del、watch、snapshot save|status|restore、defrag、compact、lease、version。'
    ]);
  }

  /* ======================================================================
     5. 虚拟文件/目录的小工具（命令要真的写文件时才用）
     ====================================================================== */

  function nowSec() { return 1710729930; }

  function ensureVirtualDir(ctx, absPath) {
    var segs = String(absPath).split('/').filter(Boolean);
    var cur = ctx.root;
    for (var i = 0; i < segs.length; i++) {
      if (!cur.children[segs[i]]) {
        cur.children[segs[i]] = { type: 'dir', name: segs[i], children: {}, content: '', mode: '755', user: 'root', group: 'root', mtime: '2024-03-18 09:52' };
      }
      cur = cur.children[segs[i]];
      if (cur.type !== 'dir') return { err: absPath + ': Not a directory' };
    }
    return { ok: true };
  }

  function writeVirtualFile(ctx, p, content, opt) {
    var abs = U.resolvePath(ctx.cwd, p);
    var dir = abs.slice(0, abs.lastIndexOf('/')) || '/';
    var dres = ensureVirtualDir(ctx, dir);
    if (dres.err) return { err: dres.err };
    var name = abs.slice(abs.lastIndexOf('/') + 1);
    var parent = U.findNode(ctx.root, dir);
    parent.children[name] = {
      type: 'file', name: name, children: null, content: String(content),
      mode: (opt && opt.mode) || '644', user: (opt && opt.user) || 'root', group: (opt && opt.group) || 'root',
      mtime: '2024-03-18 09:52'
    };
    if (opt && opt.size !== undefined) parent.children[name].explicitSize = opt.size;
    return { ok: true, abs: abs };
  }

  function b64(s) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var str = String(s);
    var out = '';
    for (var i = 0; i < str.length; i += 3) {
      var c1 = str.charCodeAt(i), c2 = str.charCodeAt(i + 1), c3 = str.charCodeAt(i + 2);
      out += chars.charAt(c1 >> 2);
      out += chars.charAt(((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4));
      out += isNaN(c2) ? '=' : chars.charAt(((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6));
      out += isNaN(c3) ? '=' : chars.charAt(c3 & 63);
    }
    return out;
  }

  /* ======================================================================
     6. Kafka
     ====================================================================== */

  var KAFKA_TOPICS = [
    { name: '__consumer_offsets', partitions: 50, rf: 3, internal: true, overrides: {} },
    { name: '__transaction_state', partitions: 50, rf: 3, internal: true, overrides: {} },
    { name: 'orders-events', partitions: 6, rf: 2, internal: false, overrides: { 'retention.ms': '604800000' }, underReplicated: [3] },
    { name: 'orders-events-dlq', partitions: 3, rf: 2, internal: false, overrides: {} },
    { name: 'orders-tracking', partitions: 12, rf: 2, internal: false, overrides: {} },
    { name: 'payment-events', partitions: 3, rf: 3, internal: false, overrides: { 'cleanup.policy': 'compact' } },
    { name: 'inventory-sync', partitions: 6, rf: 2, internal: false, overrides: {} }
  ];

  var KAFKA_GROUPS = [
    {
      name: 'order-service', state: 'Stable', protocolType: 'consumer',
      members: [
        { id: 'order-service-1-8f3c1a72-4d8e-4f91-a2b7-1e7d6b0c4f88', host: '/10.0.1.23', clientId: 'order-service-1', assignments: ['orders-events:0', 'orders-events:1', 'orders-events:2'] },
        { id: 'order-service-2-91bc3f7a-2d5e-4c14-9f2c-7a2d5e8c1405', host: '/10.0.1.24', clientId: 'order-service-2', assignments: ['orders-events:3', 'orders-events:4', 'orders-events:5'] }
      ],
      offsets: {
        'orders-events': [
          { p: 0, cur: 1841204, end: 1859021, lag: 17817, member: 0 },
          { p: 1, cur: 1840117, end: 1854812, lag: 14695, member: 0 },
          { p: 2, cur: 1838802, end: 1851204, lag: 12402, member: 0 },
          { p: 3, cur: 1840993, end: 1848117, lag: 7124, member: 1 },
          { p: 4, cur: 1839771, end: 1844022, lag: 4251, member: 1 },
          { p: 5, cur: 1841102, end: 1841904, lag: 802, member: 1 }
        ]
      }
    },
    {
      name: 'payment-service', state: 'Stable', protocolType: 'consumer',
      members: [
        { id: 'payment-service-1-7d2f8a3e-6b91-4c5d-8e2f-3a9b1c5d84e7', host: '/10.0.1.24', clientId: 'payment-service-1', assignments: ['payment-events:0', 'payment-events:1', 'payment-events:2'] }
      ],
      offsets: {
        'payment-events': [
          { p: 0, cur: 921044, end: 921188, lag: 144, member: 0 },
          { p: 1, cur: 918221, end: 918390, lag: 169, member: 0 },
          { p: 2, cur: 924118, end: 924260, lag: 142, member: 0 }
        ]
      }
    },
    {
      name: 'inventory-sync-group', state: 'PreparingRebalance', protocolType: 'consumer',
      members: [],
      offsets: {
        'inventory-sync': [
          { p: 0, cur: 402118, end: 512044, lag: 109926, member: -1 }
        ]
      }
    }
  ];

  var KAFKA_MESSAGES = {
    'orders-events': [
      { k: 'order-8812', v: '{"orderId":8812,"status":"PAID","amount":1240.00,"ts":"2024-03-18T09:41:18+08:00"}' },
      { k: 'order-8813', v: '{"orderId":8813,"status":"PAID","amount":860.00,"ts":"2024-03-18T09:41:19+08:00"}' },
      { k: 'order-8814', v: '{"orderId":8814,"status":"CREATED","amount":2180.00,"ts":"2024-03-18T09:41:20+08:00"}' },
      { k: 'order-8815', v: '{"orderId":8815,"status":"CREATED","amount":99.00,"ts":"2024-03-18T09:41:21+08:00"}' },
      { k: 'order-8816', v: '{"orderId":8816,"status":"PAID","amount":3400.00,"ts":"2024-03-18T09:41:22+08:00"}' },
      { k: 'order-8817', v: '{"orderId":8817,"status":"CANCELLED","amount":120.00,"ts":"2024-03-18T09:41:23+08:00"}' },
      { k: 'order-8818', v: '{"orderId":8818,"status":"PAID","amount":760.00,"ts":"2024-03-18T09:41:24+08:00"}' },
      { k: 'order-8819', v: '{"orderId":8819,"status":"PAID","amount":1920.00,"ts":"2024-03-18T09:41:25+08:00"}' },
      { k: 'order-8820', v: '{"orderId":8820,"status":"CREATED","amount":450.00,"ts":"2024-03-18T09:41:26+08:00"}' },
      { k: 'order-8821', v: '{"orderId":8821,"status":"PAID","amount":2680.00,"ts":"2024-03-18T09:41:27+08:00"}' }
    ],
    'payment-events': [
      { k: 'pay-20240318001', v: '{"payId":"20240318001","orderId":8812,"amount":1240.00,"channel":"ALIPAY"}' },
      { k: 'pay-20240318002', v: '{"payId":"20240318002","orderId":8813,"amount":860.00,"channel":"WECHAT"}' }
    ]
  };

  function kafkaClusterState() {
    if (!KAFKA_CLUSTER) {
      KAFKA_CLUSTER = {
        topics: KAFKA_TOPICS.map(function (t) {
          var o = { name: t.name, partitions: t.partitions, rf: t.rf, internal: t.internal, overrides: {}, configs: {} };
          for (var k in t.overrides) if (Object.prototype.hasOwnProperty.call(t.overrides, k)) o.configs[k] = t.overrides[k];
          o.underReplicated = (t.underReplicated || []).slice();
          return o;
        }),
        groups: KAFKA_GROUPS,
        messages: KAFKA_MESSAGES
      };
    }
    return KAFKA_CLUSTER;
  }
  var KAFKA_CLUSTER = null;

  var KAFKA_BROKERS = 3;

  function kafkaOpt(argv, name, short) {
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--' + name) return argv[i + 1] === undefined ? true : argv[i + 1];
      if (a.indexOf('--' + name + '=') === 0) return a.slice(name.length + 3);
      if (short && a === short) return argv[i + 1] === undefined ? true : argv[i + 1];
    }
    return undefined;
  }
  function kafkaFlag(argv, name) { return argv.indexOf('--' + name) !== -1; }
  function kafkaMulti(argv, name) {
    var out = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--' + name && argv[i + 1] !== undefined) out.push(String(argv[i + 1]));
      else if (a.indexOf('--' + name + '=') === 0) out.push(a.slice(name.length + 3));
    }
    return out;
  }

  /* bootstrap-server 解析：broker1:9092 / PLAINTEXT://broker1:9092 / 逗号分隔多个 */
  function kafkaBootstrap(argv, ctx, HOST) {
    var bs = kafkaOpt(argv, 'bootstrap-server');
    if (bs && bs !== true) {
      var first = String(bs).split(',')[0].replace(/^[A-Z]+:\/\//i, '');
      var m = first.match(/^([^:]+):(\d+)$/);
      if (!m) return { ok: false, raw: first, reason: 'InvalidUrl' };
      var host = m[1], port = m[2];
      var res = resolveRemote(ctx, HOST, host, port);
      if (!res) return { ok: false, raw: host + ':' + port, reason: 'UnknownHost' };
      if (!hostHasService(ctx, HOST, host, 'kafka') || port !== '9092') return { ok: false, raw: host + ':' + port, reason: 'ConnectionRefused' };
      return { ok: true, host: host, port: port };
    }
    var zk = kafkaOpt(argv, 'zookeeper');
    if (zk && zk !== true) {
      return { ok: false, raw: String(zk), reason: 'ZookeeperRemoved' };
    }
    return { ok: false, raw: '', reason: 'Missing' };
  }

  function kafkaTimeoutErr(raw) {
    return [
      'Error while executing topic command : org.apache.kafka.common.errors.TimeoutException: Call(callName=listTopics, deadlineMs=' + (nowSec() + 60000) + ') timed out at ' + (nowSec() + 60000) + ' after 1 attempt(s)',
      '',
      '（教学提示）Kafka 客户端拿到连不上的 bootstrap-server 不会立刻失败，而是按 `--request-timeout-ms`（默认 30 秒）反复重试后再抛 TimeoutException —— ' +
      '真实报错往往是几十秒后才出现。排查顺序：① 端口通不通 `telnet ' + (raw || 'broker:9092') + '`；② broker 是否真的以为自己是那个 advertised.listeners 地址；③ `--bootstrap-server` 有没有写错。'
    ];
  }

  function kafkaResolveOrFail(argv, ctx, HOST, cmdLabel) {
    var bs = kafkaBootstrap(argv, ctx, HOST);
    if (bs.ok) return { ok: true };
    if (bs.reason === 'Missing') {
      return { ok: false, res: fail([
        'Missing required argument "[bootstrap-server]"',
        '（教学提示）Kafka 3.0 起 `--zookeeper` 已废弃、4.0 彻底移除，新版本一律用 `--bootstrap-server <broker:9092>`' +
        '（写任意一个 broker 地址即可，客户端会自动获取全集群元数据）。用法：' + cmdLabel + ' --bootstrap-server broker1:9092 --list'
      ]) };
    }
    if (bs.reason === 'ZookeeperRemoved') {
      return { ok: false, res: fail([
        'Exception in thread "main" joptsimple.UnrecognizedOptionException: zookeeper is not a recognized option',
        '（教学提示）Kafka 3.0 起 `--zookeeper` 已废弃、4.0 彻底移除；改用 --bootstrap-server（客户端会自己找 controller，不再直连 ZK）。'
      ]) };
    }
    if (bs.reason === 'UnknownHost') {
      return { ok: false, res: fail(['Error while executing topic command : org.apache.kafka.common.KafkaException: Failed to create new KafkaAdminClient',
        'Caused by: java.net.UnknownHostException: ' + bs.raw.split(':')[0],
        '（教学提示）bootstrap-server 的主机名解析不了。本站仿真里 Kafka 集群只有 broker1 / broker2 / broker3（10.0.1.31~33），别的名字一律解析失败。']) };
    }
    if (bs.reason === 'ConnectionRefused') {
      return { ok: false, res: fail(['Error while executing topic command : org.apache.kafka.common.errors.TimeoutException: Call(callName=listTopics, deadlineMs=' + (nowSec() + 60000) + ') timed out',
        '（教学提示）' + bs.raw + ' 上没有 Kafka broker（Kafka 的默认端口是 9092）。']) };
    }
    return { ok: false, res: fail(kafkaTimeoutErr(bs.raw)) };
  }

  function kafkaPartitions(topic) {
    var rows = [];
    for (var p = 0; p < topic.partitions; p++) {
      var leader = p % KAFKA_BROKERS + 1;
      var replicas = [];
      for (var r = 0; r < topic.rf; r++) replicas.push((leader - 1 + r) % KAFKA_BROKERS + 1);
      var isr = replicas.slice();
      if (topic.underReplicated && topic.underReplicated.indexOf(p) !== -1) isr = isr.slice(0, isr.length - 1);
      rows.push({ p: p, leader: leader, replicas: replicas, isr: isr });
    }
    return rows;
  }

  function kafkaDescribeLines(topics, header) {
    var out = [];
    var first = true;
    topics.forEach(function (t) {
      var parts = kafkaPartitions(t);
      if (header) {
        if (!first) out.push('');
        out.push('Topic: ' + t.name + '\tTopicId: ' + kafkaTopicId(t.name) +
          '\tPartitionCount: ' + t.partitions + '\tReplicationFactor: ' + t.rf +
          '\tConfigs: ' + kafkaConfigs(t));
        out.push('\tTopic: ' + t.name + '\tPartition: 0\tLeader: ' + parts[0].leader +
          '\tReplicas: ' + parts[0].replicas.join(',') + '\tIsr: ' + parts[0].isr.join(',') +
          (parts[0].isr.length < parts[0].replicas.length ? '\tElr: ' + kafkaElr(parts[0]) : ''));
        first = false;
        return;
      }
      parts.forEach(function (x) {
        if (x.p !== 0) return;
      });
    });
    if (!header) {
      topics.forEach(function (t) {
        kafkaPartitions(t).forEach(function (x) {
          out.push('\tTopic: ' + t.name + '\tTopicId: ' + kafkaTopicId(t.name) + '\tPartition: ' + x.p +
            '\tLeader: ' + x.leader + '\tReplicas: ' + x.replicas.join(',') + '\tIsr: ' + x.isr.join(',') +
            (x.isr.length < x.replicas.length ? '\tElr: ' + kafkaElr(x) : ''));
        });
      });
    }
    return out;
  }

  function kafkaElr(part) {
    var missing = part.replicas.filter(function (r) { return part.isr.indexOf(r) === -1; });
    return missing.length ? missing.join(',') : '0';
  }
  /* Kafka 3.x 的 TopicId 是 UUID（8-4-4-4-12）。用 topic 名推导，
     同一个主题每次输出一致 —— 不写死、也不随机。 */
  function kafkaTopicId(name) {
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    for (var i = 0; i < name.length; i++) {
      h1 = (h1 ^ name.charCodeAt(i)) >>> 0;
      h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + name.charCodeAt(i) * (i + 7)) >>> 0;
    }
    function hx(n, w) { var s = (n >>> 0).toString(16); while (s.length < w) s = '0' + s; return s.slice(-w); }
    function seg(seed, w) {
      var v = seed >>> 0, out = '';
      while (out.length < w) { v = (v * 1664525 + 1013904223) >>> 0; out += hx(v, 8); }
      return out.slice(0, w);
    }
    return seg(h1, 8) + '-' + seg(h2, 4) + '-4' + seg(h1 ^ h2, 3) + '-8' + seg(h2 ^ 0x5bd1e995, 3) + '-' + seg(h1 + h2, 12);
  }
  function kafkaConfigs(t) {
    var keys = Object.keys(t.configs || {});
    if (!keys.length) return '';
    return keys.map(function (k) { return k + '=' + t.configs[k]; }).join(',');
  }

  function kafkaTopicsCmd(argv, ctx, stdin, HOST) {
    var st = kafkaClusterState();
    var list = kafkaFlag(argv, 'list');
    var create = kafkaFlag(argv, 'create');
    var del = kafkaFlag(argv, 'delete');
    var alter = kafkaFlag(argv, 'alter');
    var describe = kafkaFlag(argv, 'describe');

    var r = kafkaResolveOrFail(argv, ctx, HOST, 'kafka-topics.sh');
    if (!r.ok) return r.res;

    if (list) {
      var excludeInternal = kafkaFlag(argv, 'exclude-internal');
      var names = st.topics.filter(function (t) { return !excludeInternal || !t.internal; }).map(function (t) { return t.name; }).sort();
      return ok(names);
    }

    if (create) {
      var topic = kafkaOpt(argv, 'topic');
      if (!topic || topic === true) return fail(['Missing required argument "[topic]"', '（教学提示）--create 需要 --topic <名称> --partitions <N> --replication-factor <M>']);
      var parts = kafkaOpt(argv, 'partitions'), rf = kafkaOpt(argv, 'replication-factor');
      if (parts === undefined) return fail(['Missing required argument "[partitions]"', '（教学提示）创建主题必须显式给 --partitions（决定最大并行消费度）与 --replication-factor（生产至少 2）。']);
      if (rf === undefined) return fail(['Missing required argument "[replication-factor]"', '（教学提示）创建主题必须显式给 --replication-factor：不能超过 broker 数量（本站 3 个 broker）。']);
      var np = Number(parts), nr = Number(rf);
      if (isNaN(np) || np < 1) {
        return fail(['Error while executing topic command : org.apache.kafka.common.errors.InvalidPartitionsException: Number of partitions must be larger than 0.',
          '（教学提示）--partitions 必须是大于 0 的整数：分区数决定同一消费组内的最大并行消费者数（一个分区只能被组内一个消费者消费）。']);
      }
      if (isNaN(nr) || nr < 1) {
        return fail(['Error while executing topic command : org.apache.kafka.common.errors.InvalidReplicationFactorException: replication factor must be larger than 0.',
          '（教学提示）--replication-factor 必须大于 0；生产至少 2（重要业务 3）。']);
      }
      if (nr > KAFKA_BROKERS) {
        return fail(['Error while executing topic command : org.apache.kafka.common.errors.InvalidReplicationFactorException: Unable to replicate the partition 3 time(s): The target replication factor of ' + nr + ' cannot be reached because only ' + KAFKA_BROKERS + ' broker(s) are registered.',
          '（教学提示）副本数不能超过 broker 数量 —— 本站 Kafka 集群只有 3 个 broker（broker1/2/3，10.0.1.31~33）。']);
      }
      var exists = st.topics.filter(function (t) { return t.name === topic; })[0];
      if (exists) {
        if (kafkaFlag(argv, 'if-not-exists')) {
          return okHint([], ['（教学提示）--if-not-exists 让"已存在"不报错，适合写进部署脚本；不带它时真机抛 TopicExistsException（退出码非 0）。']);
        }
        return codeFail(['Error while executing topic command : org.apache.kafka.common.errors.TopicExistsException: Topic \'' + topic + '\' already exists.',
          '（教学提示）已存在时要么加 --if-not-exists（幂等），要么先 --describe 看现状；改配置用 --alter --add-config。'], 1);
      }
      var cfg = {};
      kafkaMulti(argv, 'config').forEach(function (kv) {
        var idx = String(kv).indexOf('=');
        if (idx > 0) cfg[String(kv).slice(0, idx)] = String(kv).slice(idx + 1);
      });
      st.topics.push({ name: String(topic), partitions: np, rf: nr, internal: false, configs: cfg, overrides: cfg, underReplicated: [] });
      var hints = [];
      if (cfg['retention.ms']) {
        hints.push('（教学提示）retention.ms=' + cfg['retention.ms'] + ' 约等于 ' + Math.round(Number(cfg['retention.ms']) / 86400000) + ' 天；' +
          'Kafka 的保留时间是"段文件级别"的，实际删除会晚于这个时间。默认 168 小时（7 天）。');
      }
      hints.push('（教学提示）此命令真的改了仿真集群的 topic 列表：接着跑 `kafka-topics.sh --bootstrap-server broker1:9092 --list` 就能看到新主题。');
      return okHint(['Created topic ' + topic + '.'], hints);
    }

    if (alter) {
      var at = kafkaOpt(argv, 'topic');
      if (!at || at === true) return fail(['Missing required argument "[topic]"', '（教学提示）--alter 需要 --topic <名称>，改分区用 --partitions <N>。']);
      var t2 = st.topics.filter(function (x) { return x.name === at; })[0];
      if (!t2) return codeFail(['Error while executing topic command : org.apache.kafka.common.errors.UnknownTopicOrPartitionException: This server does not host this topic-partition.',
        '（教学提示）主题不存在。先 `--list` 确认名字（注意大小写与连字符）。'], 1);
      var ap = kafkaOpt(argv, 'partitions');
      var addCfg = kafkaMulti(argv, 'add-config');
      var delCfg = kafkaMulti(argv, 'delete-config');
      var out = [];
      if (ap !== undefined) {
        var n2 = Number(ap);
        if (isNaN(n2) || n2 < 1) return fail(['Error while executing topic command : org.apache.kafka.common.errors.InvalidPartitionsException: Number of partitions must be larger than 0.']);
        if (n2 < t2.partitions) {
          return codeFail(['Error while executing topic command : org.apache.kafka.common.errors.InvalidPartitionsException: Topic currently has ' + t2.partitions +
            ' partitions, which is higher than the requested number. ' + n2 + ' partitions would be a downgrade, and partition count cannot be reduced.',
            '（教学提示）Kafka **不支持减少分区**：减少会丢数据、并且打乱 key→分区的映射（同一个 key 会落到别的分区），' +
            '历史消息的消费位点也会错位。真要缩容只能新建一个主题再迁移。'], 1);
        }
        if (n2 === t2.partitions) {
          out.push('（教学提示）分区数没变（还是 ' + n2 + ' 个），真机什么也不做，只是命令成功返回。');
        } else {
          t2.partitions = n2;
          out.push('（教学提示）分区已从 ' + (t2.partitions - (n2 - t2.partitions)) + ' 扩到 ' + n2 + '，接着 --describe 能看到新分区。');
        }
      }
      if (addCfg.length) {
        addCfg.forEach(function (kv) {
          var idx = String(kv).indexOf('=');
          if (idx > 0) t2.configs[String(kv).slice(0, idx)] = String(kv).slice(idx + 1);
        });
        out.push('（教学提示）已更新主题配置：' + addCfg.join(', ') + '；--describe 的 Configs 一列能看到。');
      }
      if (delCfg.length) {
        delCfg.forEach(function (k) { delete t2.configs[k]; });
        out.push('（教学提示）已删除主题级配置 ' + delCfg.join(', ') + '，这些参数回落到 broker 默认值。');
      }
      if (!out.length) out.push('（教学提示）--alter 需要配合 --partitions / --add-config / --delete-config 才有动作。');
      return ok(out);
    }

    if (del) {
      var dt = kafkaOpt(argv, 'topic');
      if (!dt || dt === true) return fail(['Missing required argument "[topic]"', '（教学提示）--delete 需要 --topic <名称>；删主题会连同消息一起删，生产要非常谨慎。']);
      var before = st.topics.length;
      st.topics = st.topics.filter(function (x) { return x.name !== dt; });
      if (st.topics.length === before) {
        return codeFail(['Error while executing topic command : org.apache.kafka.common.errors.UnknownTopicOrPartitionException: This server does not host this topic-partition.',
          '（教学提示）要删的主题不存在，先 `--list` 确认。'], 1);
      }
      return okHint([], ['（教学提示）--delete 只是给主题打删除标记，后台异步清理；`--list` 里会立刻消失，但磁盘空间是过一会儿才释放的（还有 delete.topic.enable 必须为 true）。']);
    }

    if (describe) {
      var dtopic = kafkaOpt(argv, 'topic');
      if (dtopic && dtopic !== true) {
        var t3 = st.topics.filter(function (x) { return x.name === dtopic; })[0];
        if (!t3) return codeFail(['Error while executing topic command : org.apache.kafka.common.errors.UnknownTopicOrPartitionException: This server does not host this topic-partition.',
          '（教学提示）主题不存在。先 `--list` 看全部主题（注意内部主题 __consumer_offsets 也在里面）。'], 1);
        return ok(kafkaDescribeLines([t3], true));
      }
      if (kafkaFlag(argv, 'under-replicated-partitions')) {
        var ur = st.topics.filter(function (t) { return kafkaPartitions(t).some(function (p) { return p.isr.length < p.replicas.length; }); });
        if (!ur.length) return okHint([], ['（教学提示）--under-replicated-partitions 输出为空 = 没有副本掉队，这是**期望结果**（巡检脚本里空输出就应该静默通过）。']);
        return okHint(kafkaDescribeLines(ur, false), ['（教学提示）ISR（同步副本）少于 Replicas 说明有副本掉队（broker 挂了、磁盘慢、网络抖）；此时 leader 再挂就会丢数据，要尽快补副本。']);
      }
      if (kafkaFlag(argv, 'unavailable-partitions')) {
        var bad = st.topics.filter(function (t) { return kafkaPartitions(t).some(function (p) { return p.leader === -1; }); });
        if (!bad.length) return okHint([], ['（教学提示）--unavailable-partitions 输出为空是**期望结果**：没有任何分区缺 leader。非空就是生产红线（分区完全不可用），要立刻告警。']);
        return ok(kafkaDescribeLines(bad, false));
      }
      if (kafkaFlag(argv, 'topics-with-overrides')) {
        var ov = st.topics.filter(function (t) { return Object.keys(t.configs || {}).length > 0; });
        return okHint(ov.map(function (t) { return t.name; }),
          ['（教学提示）这些主题单独改过配置（覆盖了 broker 默认值）。Kafka 里主题级配置的优先级高于 broker 默认值，' +
           '`--describe` 的 Configs 一列能看到具体值；用 --alter --delete-config 可以回落。']);
      }
      return ok(kafkaDescribeLines(st.topics, true));
    }

    return fail(['Missing required argument "[list | describe | create | alter | delete]"',
      '（教学提示）kafka-topics.sh 的常用动作：--list / --describe [--topic x] / --create / --alter --partitions / --delete。']);
  }

  function kafkaConsumerGroups(argv, ctx, stdin, HOST) {
    var st = kafkaClusterState();
    var r = kafkaResolveOrFail(argv, ctx, HOST, 'kafka-consumer-groups.sh');
    if (!r.ok) return r.res;

    if (kafkaFlag(argv, 'list')) {
      var groups = st.groups.map(function (g) { return g.name; }).sort();
      if (kafkaFlag(argv, 'state')) {
        return ok(table(['GROUP', 'STATE'], st.groups.map(function (g) { return [g.name, g.state]; })));
      }
      return ok(groups);
    }

    var group = kafkaOpt(argv, 'group');
    var allGroups = kafkaFlag(argv, 'all-groups');

    if (kafkaFlag(argv, 'describe')) {
      if (kafkaFlag(argv, 'state') || kafkaFlag(argv, 'offsets') === false && kafkaFlag(argv, 'state')) {
        /* --state 单独用时只输出组状态 */
      }
      if (kafkaFlag(argv, 'state') && !group) {
        return ok(table(['GROUP', 'STATE'], st.groups.map(function (g) { return [g.name, g.state]; })));
      }
      if (kafkaFlag(argv, 'state')) {
        var g1 = st.groups.filter(function (x) { return x.name === group; })[0];
        if (!g1) return codeFail(['Error: Consumer group \'' + group + '\' does not exist.',
          '（教学提示）组名写错或该组从未提交过位点（消费组是在第一次提交 offset 时才创建的）。先 `--list` 确认。'], 1);
        return ok(table(['GROUP', 'STATE'], [[g1.name, g1.state]]));
      }
      var targets;
      if (allGroups) targets = st.groups;
      else if (group && group !== true) {
        targets = st.groups.filter(function (x) { return x.name === group; });
        if (!targets.length) {
          return codeFail([
            'Error: Consumer group \'' + group + '\' does not exist.',
            '（教学提示）消费组不存在：要么组名写错，要么该组从来没有提交过位点（Kafka 的消费组是第一次提交 offset 时才建出来的）。' +
            '先用 `kafka-consumer-groups.sh --bootstrap-server broker1:9092 --list` 确认组名。'
          ], 1);
        }
      } else {
        return fail(['Missing required argument "[group]"', '（教学提示）--describe 需要 --group <组名>，或用 --all-groups 看全部。先 `--list` 确认组名。']);
      }
      var rows = [];
      targets.forEach(function (g) {
        Object.keys(g.offsets).forEach(function (topic) {
          g.offsets[topic].forEach(function (o) {
            var m = o.member >= 0 ? g.members[o.member] : null;
            rows.push([
              g.name, topic, o.p, o.cur, o.end, o.lag,
              m ? m.id : '-',
              m ? m.host : '-',
              m ? m.clientId : '-'
            ]);
          });
        });
      });
      var out = table(['GROUP', 'TOPIC', 'PARTITION', 'CURRENT-OFFSET', 'LOG-END-OFFSET', 'LAG', 'CONSUMER-ID', 'HOST', 'CLIENT-ID'], rows);
      var hints = [];
      if (rows.some(function (r2) { return Number(r2[5]) > 10000; })) {
        hints.push('（教学提示）LAG = LOG-END-OFFSET − CURRENT-OFFSET，就是积压条数。本站 order-service 有几个分区积压上万条 —— ' +
          '先加消费者（受分区数上限约束：orders-events 只有 6 个分区，最多 6 个消费者并行），或优化消费逻辑。');
      }
      if (rows.some(function (r3) { return r3[6] === '-'; })) {
        hints.push('（教学提示）CONSUMER-ID 为 `-` 表示**该分区当前没有消费者**（消费者挂了或组内成员不足），这是最危险的信号：积压会无限增长。');
      }
      return okHint(out, hints);
    }

    if (kafkaFlag(argv, 'members')) {
      var gm = group && group !== true ? st.groups.filter(function (x) { return x.name === group; })[0] : null;
      if (!gm) return codeFail(['Error: Consumer group \'' + (group || '') + '\' does not exist.'], 1);
      var mrows = gm.members.map(function (m) { return [gm.name, m.id, m.clientId, m.host]; });
      if (!mrows.length) return okHint([], ['（教学提示）该组当前没有在线成员（state=' + gm.state + '），说明消费者全掉了。']);
      return ok(table(['GROUP', 'CONSUMER-ID', 'CLIENT-ID', 'HOST'], mrows));
    }

    if (kafkaFlag(argv, 'reset-offsets')) {
      var rg = group;
      if (!rg || rg === true) return fail(['Missing required argument "[group]"', '（教学提示）--reset-offsets 必须指定 --group；常见用法：--reset-offsets --group order-service --topic orders-events --to-earliest --execute']);
      var rg1 = st.groups.filter(function (x) { return x.name === rg; })[0];
      if (!rg1) return codeFail(['Error: Consumer group \'' + rg + '\' does not exist.'], 1);
      var rtopic = kafkaOpt(argv, 'topic');
      var toEarliest = kafkaFlag(argv, 'to-earliest'), toLatest = kafkaFlag(argv, 'to-latest');
      var toOffset = kafkaOpt(argv, 'to-offset'), shiftBy = kafkaOpt(argv, 'shift-by');
      var execute = kafkaFlag(argv, 'execute'), exportFlag = kafkaFlag(argv, 'export');
      if (!toEarliest && !toLatest && toOffset === undefined && shiftBy === undefined && !exportFlag) {
        return fail(['Missing required argument: --to-earliest | --to-latest | --to-offset <n> | --shift-by <n> | --export',
          '（教学提示）必须显式说明"重置到哪里"：--to-earliest（最早）/ --to-latest（最新）/ --to-offset <位点> / --shift-by <±n>。']);
      }
      var topics = rtopic && rtopic !== true ? String(rtopic).split(',') : Object.keys(rg1.offsets);
      var rows2 = [], any = false;
      topics.forEach(function (tp) {
        var arr = rg1.offsets[tp];
        if (!arr) return;
        arr.forEach(function (o) {
          var v = o.cur;
          if (toEarliest) v = 0;
          else if (toLatest) v = o.end;
          else if (toOffset !== undefined) v = Number(toOffset);
          else if (shiftBy !== undefined) v = Math.max(0, o.cur + Number(shiftBy));
          var act = !execute && !exportFlag;
          if (!exportFlag && !act) o.cur = v;
          o.lag = o.end - v;
          any = true;
          rows2.push([rg1.name, tp, o.p, v, o.lag, exportFlag ? 'EXPORT' : (execute ? 'NEW-OFFSET' : 'DRY-RUN')]);
        });
      });
      if (!any) return codeFail(['Error: Assignments can not be found for the given topics.', '（教学提示）该消费组没有订阅这个主题（或者从未提交过位点），无法重置。'], 1);
      var out2 = table(['GROUP', 'TOPIC', 'PARTITION', 'NEW-OFFSET', 'LAG', 'STATE'], rows2);
      var hint2 = [];
      if (exportFlag) {
        hint2.push('（教学提示）--export 只把当前位点导出成 CSV，方便中途换机器继续操作；它**不修改**任何位点。');
      } else if (!execute) {
        hint2.push('（教学提示）当前是 **DRY-RUN**：只算给你看，一个位点都没改。真机必须加 `--execute` 才真正重置 ' +
          '（官方还要求**先停掉该组所有消费者**，否则重置会被运行中的消费者覆盖、并可能触发 rebalance）。');
      } else {
        hint2.push('（教学提示）位点已重置（仿真集群里真的改了，接着 --describe 能看到新的 CURRENT-OFFSET 与 LAG）。' +
          '生产上务必先停消费者再执行，并确认重置方向：--to-earliest 会把同一批消息**重新消费一遍**，' +
          '下游必须能幂等处理，否则会重复下单/重复扣款。');
      }
      return okHint(out2, hint2);
    }

    if (kafkaFlag(argv, 'delete-offsets')) {
      var dg = group;
      if (!dg || dg === true) return fail(['Missing required argument "[group]"', '（教学提示）用法：--delete-offsets --group <组> --topic <主题>']);
      var dg1 = st.groups.filter(function (x) { return x.name === dg; })[0];
      if (!dg1) return codeFail(['Error: Consumer group \'' + dg + '\' does not exist.'], 1);
      var dtopic2 = kafkaOpt(argv, 'topic');
      if (!dtopic2 || dtopic2 === true) return fail(['Missing required argument "[topic]"', '（教学提示）--delete-offsets 必须指定 --topic。']);
      var found = false;
      String(dtopic2).split(',').forEach(function (tp) {
        if (dg1.offsets[tp]) { delete dg1.offsets[tp]; found = true; }
      });
      if (!found) return codeFail(['Error: Unable to delete offsets: the group is not subscribed to the given topic(s).'], 1);
      return okHint([
        'Request succeeded for the following topic(s):',
        'Topic: ' + dtopic2
      ], ['（教学提示）删掉位点后，该组下次以 `auto.offset.reset`（默认 latest）重新开始消费 —— 想从头读要先 --reset-offsets，' +
        '否则会**跳过**删位点期间产生的新消息。']);
    }

    if (kafkaFlag(argv, 'delete')) {
      var xg = group;
      if (!xg || xg === true) return fail(['Missing required argument "[group]"', '（教学提示）删除消费组要显式 --delete --group <组名>（组必须处于 Empty 状态才能删）。']);
      var before = st.groups.length;
      st.groups = st.groups.filter(function (x) { return x.name !== xg; });
      if (st.groups.length === before) return codeFail(['Error: Consumer group \'' + xg + '\' does not exist.'], 1);
      return okHint(['Deletion of requested consumer groups (\'' + xg + '\') was successful.'],
        ['（教学提示）只有状态为 Empty（组内没有活跃成员）的组才能删；删除后位点信息一并消失。']);
    }

    return fail(['Missing required argument "[list | describe | delete | reset-offsets | delete-offsets]"',
      '（教学提示）常用：--list / --describe --group <组> / --state --group <组> / --reset-offsets --to-earliest --execute / --delete-offsets。']);
  }

  function kafkaConsoleConsumer(argv, ctx, stdin, HOST) {
    var st = kafkaClusterState();
    var r = kafkaResolveOrFail(argv, ctx, HOST, 'kafka-console-consumer.sh');
    if (!r.ok) return r.res;
    var topic = kafkaOpt(argv, 'topic');
    if (!topic || topic === true) return fail(['Missing required argument "[topic]"', '（教学提示）必须指定 --topic <主题>；想翻历史消息要加 --from-beginning。']);
    var t = st.topics.filter(function (x) { return x.name === topic; })[0];
    if (!t) return codeFail(['Error while executing consumer command : org.apache.kafka.common.errors.UnknownTopicOrPartitionException: This server does not host this topic-partition.'], 1);
    var maxMessages = kafkaOpt(argv, 'max-messages');
    var fromBeginning = kafkaFlag(argv, 'from-beginning');
    var group = kafkaOpt(argv, 'group');
    var part = kafkaOpt(argv, 'partition');
    var props = kafkaMulti(argv, 'property');
    var printKey = props.indexOf('print.key=true') !== -1;
    var printTs = props.indexOf('print.timestamp=true') !== -1;
    var msgs = st.messages[topic] || [];
    var out = [];
    msgs.forEach(function (m, i) {
      if (part !== undefined && part !== true && (i % t.partitions) !== Number(part)) return;
      var line = '';
      if (printTs) line += 'CreateTime:1710729688000\t';
      if (printKey) line += m.k + '\t';
      line += m.v;
      out.push(line);
    });
    var limit = maxMessages !== undefined && maxMessages !== true ? Number(maxMessages) : null;
    var truncated = false;
    if (limit !== null && out.length > limit) { out = out.slice(0, limit); truncated = true; }
    var hints = [];
    if (out.length && !fromBeginning && group === undefined) {
      hints.push('（教学提示）不写 --group 时用随机消费组，每次执行都是全新消费者，**默认只消费"启动之后"产生的新消息**；' +
        '要翻历史消息必须加 --from-beginning。上面这些是本站仿真主题里已有的消息。');
    }
    if (group !== undefined && fromBeginning) {
      hints.push('（教学提示）指定了已有 --group 且该组已有位点，--from-beginning 会被**忽略**（位点以组为准）；要验证组是否正常提交位点，请用 kafka-consumer-groups.sh --describe。');
    }
    if (limit !== null && !truncated) {
      hints.push('（教学提示）--max-messages ' + limit + ' 读够就自动退出，脚本友好；本站主题里只有 ' + (st.messages[topic] || []).length + ' 条仿真消息。');
    }
    if (!out.length) {
      hints.push('（教学提示）没有可显示的消息：可能主题本身是空的，也可能过滤条件（--partition ' + part + '）把你筛掉了。真机上不加 --from-beginning 时会一直等新消息，用 --timeout-ms 控制等待上限。');
    }
    hints.push('（教学提示）仿真环境不会真的消费 Kafka：它只读本站主题的样本消息，不提交位点、不影响任何真实数据。');
    return okHint(out, hints);
  }

  function kafkaConsoleProducer(argv, ctx, stdin, HOST) {
    var st = kafkaClusterState();
    var r = kafkaResolveOrFail(argv, ctx, HOST, 'kafka-console-producer.sh');
    if (!r.ok) return r.res;
    var topic = kafkaOpt(argv, 'topic');
    if (!topic || topic === true) return fail(['Missing required argument "[topic]"', '（教学提示）必须指定 --topic <主题>；想边发边带 key 要加 --property parse.key=true --property key.separator=:。']);
    var t = st.topics.filter(function (x) { return x.name === topic; })[0];
    if (!t) return codeFail(['Error while executing producer command : org.apache.kafka.common.errors.UnknownTopicOrPartitionException: This server does not host this topic-partition.'], 1);
    var props = kafkaMulti(argv, 'property');
    var parseKey = props.indexOf('parse.key=true') !== -1;
    var sep = ':';
    props.forEach(function (p) { if (String(p).indexOf('key.separator=') === 0) sep = String(p).slice('key.separator='.length); });
    if (!st.messages[topic]) st.messages[topic] = [];
    var lines = stdin || [];
    lines.forEach(function (l) {
      var key = '', val = String(l);
      if (parseKey) {
        var idx = String(l).indexOf(sep);
        if (idx > 0) { key = String(l).slice(0, idx); val = String(l).slice(idx + sep.length); }
      }
      st.messages[topic].push({ k: key, v: val });
    });
    var hints = [
      '（教学提示）kafka-console-producer.sh **没有确认回执**：它只负责把行发出去，消息是否成功落盘要靠消费者或监控确认' +
      '（可靠性靠 --producer-property acks=all + 副本数 ≥ 2）。',
      '（教学提示）真机执行这条命令会进交互模式（一行一条消息、回车发送、Ctrl+C 退出）；本站仿真把管道喂进来的 ' +
      lines.length + ' 行当消息写进了仿真主题，接着用 kafka-console-consumer.sh --from-beginning 就能读到。',
      '（教学提示）生产主题别灌测试数据：本站 orders-events 是"业务主题"，压测请用 orders-events-test 这类专用主题。'
    ];
    if (parseKey) hints.push('（教学提示）parse.key=true 时格式是 `<key>:<value>`，例如 order-8812:{"status":"PAID"}；key 决定消息落到哪个分区（同 key 必落同分区，保证分区内有序）。');
    return okHint([], hints);
  }

  /* ======================================================================
     7. rabbitmqctl / rabbitmq-diagnostics
     ====================================================================== */

  var RABBIT_NODE = 'rabbit@rabbitmq-prod-01';
  var RABBIT_HOST = 'rabbitmq-prod-01';

  var RABBIT_QUEUES = [
    { vhost: '/orders', name: 'orders.created', messages: 184211, ready: 178402, unacked: 5809, consumers: 4, durable: true, autoDelete: false, memory: 148209664 },
    { vhost: '/orders', name: 'orders.paid', messages: 92104, ready: 92104, unacked: 0, consumers: 4, durable: true, autoDelete: false, memory: 74211328 },
    { vhost: '/orders', name: 'orders.cancelled', messages: 1204, ready: 1204, unacked: 0, consumers: 2, durable: true, autoDelete: false, memory: 1048576 },
    { vhost: '/orders', name: 'orders.dlq', messages: 42, ready: 42, unacked: 0, consumers: 0, durable: true, autoDelete: false, memory: 40960 },
    { vhost: '/', name: 'task.queue', messages: 812, ready: 12, unacked: 800, consumers: 2, durable: true, autoDelete: false, memory: 819200 }
  ];

  var RABBIT_CONNECTIONS = [
    { name: '10.0.1.23:54122 -> 10.0.1.41:5672', user: 'orderapp', peer_host: '10.0.1.23', peer_port: 54122, state: 'running', channels: 8, send_pend: 0, recv_oct: 184022144, send_oct: 92114220, ssl: false, protocol: 'AMQP 0-9-1' },
    { name: '10.0.1.23:54128 -> 10.0.1.41:5672', user: 'orderapp', peer_host: '10.0.1.23', peer_port: 54128, state: 'running', channels: 8, send_pend: 0, recv_oct: 92044812, send_oct: 42118820, ssl: false, protocol: 'AMQP 0-9-1' },
    { name: '10.0.1.24:51200 -> 10.0.1.41:5672', user: 'worker', peer_host: '10.0.1.24', peer_port: 51200, state: 'blocked', channels: 4, send_pend: 842112, recv_oct: 42118820, send_oct: 18204410, ssl: false, protocol: 'AMQP 0-9-1' },
    { name: '10.0.1.71:40218 -> 10.0.1.41:5672', user: 'monitor', peer_host: '10.0.1.71', peer_port: 40218, state: 'running', channels: 1, send_pend: 0, recv_oct: 1024, send_oct: 2048, ssl: false, protocol: 'AMQP 0-9-1' }
  ];

  var RABBIT_CHANNELS = [
    { name: '10.0.1.23:54122 -> 10.0.1.41:5672', number: 1, user: 'orderapp', vhost: '/orders', consumer_count: 4, unacked: 5809, prefetch: 250, state: 'running', queue: 'orders.created' },
    { name: '10.0.1.23:54122 -> 10.0.1.41:5672', number: 2, user: 'orderapp', vhost: '/orders', consumer_count: 0, unacked: 0, prefetch: 0, state: 'running', queue: '' },
    { name: '10.0.1.23:54128 -> 10.0.1.41:5672', number: 1, user: 'orderapp', vhost: '/orders', consumer_count: 4, unacked: 0, prefetch: 250, state: 'running', queue: 'orders.paid' },
    { name: '10.0.1.24:51200 -> 10.0.1.41:5672', number: 1, user: 'worker', vhost: '/', consumer_count: 2, unacked: 800, prefetch: 100, state: 'running', queue: 'task.queue' }
  ];

  function rabbitColumnNames(argv) {
    /* rabbitmqctl list_queues name messages ... —— 第一个非 - 参数是子命令，其后是列名 */
    return argv.filter(function (a) { return String(a).charAt(0) !== '-'; }).slice(1);
  }

  function rabbitJsonDump(title, obj) {
    return [title, JSON.stringify(obj, null, 4)];
  }

  function rabbitmqctl(argv, ctx, stdin, HOST) {
    /* 全局选项：-q/--quiet、-n/--node、-p/--vhost、--formatter、--timeout */
    var quiet = argv.indexOf('-q') !== -1 || argv.indexOf('--quiet') !== -1;
    var formatter = 'raw';
    var vhost = '/';
    var nodeArg = RABBIT_NODE;
    var rest = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-q' || a === '--quiet') continue;
      if (a === '-n' || a === '--node') { nodeArg = String(argv[++i] || RABBIT_NODE); continue; }
      if (a.indexOf('--node=') === 0) { nodeArg = a.slice(7); continue; }
      if (a === '-p' || a === '--vhost') { vhost = String(argv[++i] || '/'); continue; }
      if (a.indexOf('--vhost=') === 0) { vhost = a.slice(8); continue; }
      if (a === '--formatter') { formatter = String(argv[++i] || 'raw'); continue; }
      if (a.indexOf('--formatter=') === 0) { formatter = a.slice(12); continue; }
      if (a === '-t' || a === '--timeout') { i++; continue; }
      if (a === '-l' || a === '--longnames' || a === '--erlang-cookie') { if (a === '--erlang-cookie') i++; continue; }
      rest.push(a);
    }
    var cmd = String(rest[0] || '');
    var args = rest.slice(1);
    var json = String(formatter).toLowerCase() === 'json';

    function vhostQueues() {
      return RABBIT_QUEUES.filter(function (q) { return q.vhost === vhost; });
    }

    if (cmd === 'status') {
      if (nodeArg !== RABBIT_NODE) {
        return codeFail(['Error: unable to connect to node ' + nodeArg + ': nodedown', '',
          'DIAGNOSTICS', '===========', 'attempted to contact: [' + nodeArg + ']',
          '  * connected to epmd (port 4369) on ' + String(nodeArg).split('@')[1],
          '  * node ' + nodeArg + ' not running',
          '（教学提示）rabbitmqctl 用的是 Erlang 分布式节点名（rabbit@<主机名>），不是 IP；容器里要带 `-n rabbit@<容器主机名>`，主机名不对就是 nodedown。'],
          2);
      }
      var q = vhostQueues();
      if (json) {
        return ok(rabbitJsonDump('Status of node ' + RABBIT_NODE +' ...', {
          os: { pid: '18421', process: 'rabbitmq-server' },
          rabbitmq_version: '3.12.12', erlang_version: '25.3.2',
          uptime: 172040, listeners: [
            { protocol: 'amqp', node: RABBIT_NODE, ip: '::', port: 5672 },
            { protocol: 'clustering', node: RABBIT_NODE, ip: '::', port: 25672 },
            { protocol: 'http', node: RABBIT_NODE, ip: '::', port: 15672 }
          ],
          queue_totals: { messages: q.reduce(function (a, x) { return a + x.messages; }, 0), messages_ready: q.reduce(function (a, x) { return a + x.ready; }, 0), messages_unacknowledged: q.reduce(function (a, x) { return a + x.unacked; }, 0) },
          alarms: [], disk_free: 184021442560, disk_free_limit: 50000000,
          file_descriptors: { total: 1048576, used: 1842 }
        }));
      }
      return ok([
        'Status of node ' + RABBIT_NODE + ' ...',
        '[{pid,18421},',
        ' {running_applications,',
        '     [{rabbitmq_management,"RabbitMQ Management Console","3.12.12"},',
        '      {rabbitmq_web_dispatch,"RabbitMQ Web Dispatcher","3.12.12"},',
        '      {rabbit,"RabbitMQ","3.12.12"},',
        '      {os_mon,"CPO  CXC 138 46","2.8.1"},',
        '      {mnesia,"MNESIA  CXC 138 12","4.21.4"},',
        '      {ssl,"Erlang/OTP SSL application","11.1.1"},',
        '      {crypto,"CRYPTO","5.1.4"}]},',
        ' {listeners,[{clustering,25672,"::"},{amqp,5672,"::"},{http,15672,"::"}]},',
        ' {vm_memory_calculation_strategy,rss},',
        ' {vm_memory_high_watermark,0.4},',
        ' {vm_memory_limit,6710886400},',
        ' {memory,',
        '     [{connection_readers,18402144},',
        '      {connection_writers,9210880},',
        '      {queue_procs,262144000},',
        '      {other_proc,84213760},',
        '      {plugins,42108800},',
        '      {total,412905984}]},',
        ' {disk_free,184021442560},',
        ' {disk_free_limit,50000000},',
        ' {file_descriptors,[{total_limit,1048576},{total_used,1842},{sockets_used,412}]},',
        ' {alarms,[]},',
        ' {uptime,172040}]'
      ]);
    }

    if (cmd === 'cluster_status') {
      if (json) {
        return ok(rabbitJsonDump('Cluster status of node ' + RABBIT_NODE + ' ...', {
          running_nodes: [RABBIT_NODE], disc_nodes: [RABBIT_NODE], ram_nodes: [], partitions: [], alarms: []
        }));
      }
      return ok([
        'Cluster status of node ' + RABBIT_NODE + ' ...',
        '[{nodes,[{disc,[\'' + RABBIT_NODE + '\']}]},',
        ' {running_nodes,[\'' + RABBIT_NODE + '\']},',
        ' {cluster_name,<<"rabbit@' + RABBIT_HOST + '">>},',
        ' {partitions,[]},',
        ' {alarms,[{\'' + RABBIT_NODE + '\',[]}]}]'
      ]);
    }

    if (cmd === 'list_queues') {
      var cols = rabbitColumnNames(rest);
      var qs = vhostQueues();
      if (!cols.length) cols = ['name', 'messages'];
      var rows = qs.map(function (x) {
        return cols.map(function (c) {
          var v = rabbitQueueField(x, c);
          return v === undefined ? '' : v;
        });
      });
      if (json) {
        return ok([JSON.stringify(rows.map(function (r) {
          var o = {};
          cols.forEach(function (c, i2) { o[c] = /^[0-9]+$/.test(String(r[i2])) ? Number(r[i2]) : r[i2]; });
          return o;
        }), null, 4)]);
      }
      var out = [];
      if (!quiet) out.push('Timeout: 60.0 seconds ...');
      out.push('Listing queues for vhost ' + vhost + ' ...');
      out = out.concat(table(cols, rows));
      return ok(out);
    }

    if (cmd === 'list_connections') {
      var ccols = rabbitColumnNames(rest);
      if (!ccols.length) ccols = ['name', 'user', 'peer_host', 'state'];
      var crows = RABBIT_CONNECTIONS.map(function (c) {
        return ccols.map(function (col) { return rabbitConnField(c, col); });
      });
      if (json) return ok([JSON.stringify(crows, null, 4)]);
      var cout = [];
      if (!quiet) cout.push('Timeout: 60.0 seconds ...');
      cout.push('Listing connections ...');
      return ok(cout.concat(table(ccols, crows)));
    }

    if (cmd === 'list_channels') {
      var chcols = rabbitColumnNames(rest);
      if (!chcols.length) chcols = ['name', 'number', 'consumer_count', 'messages_unacknowledged'];
      var chrows = RABBIT_CHANNELS.map(function (c) {
        return chcols.map(function (col) { return rabbitChanField(c, col); });
      });
      if (json) return ok([JSON.stringify(chrows, null, 4)]);
      var chout = [];
      if (!quiet) chout.push('Timeout: 60.0 seconds ...');
      chout.push('Listing channels ...');
      return ok(chout.concat(table(chcols, chrows)));
    }

    if (cmd === 'list_vhosts') {
      var vcols = rabbitColumnNames(rest);
      if (!vcols.length) vcols = ['name'];
      var vhosts = [{ name: '/', tracing: false }, { name: '/orders', tracing: false }];
      var vrows = vhosts.map(function (v) { return vcols.map(function (c) { return c === 'name' ? v.name : (c === 'tracing' ? String(v.tracing) : ''); }); });
      if (json) return ok([JSON.stringify(vrows, null, 4)]);
      return ok((quiet ? [] : ['Timeout: 60.0 seconds ...']).concat(['Listing vhosts ...'], table(vcols, vrows)));
    }

    if (cmd === 'list_exchanges') {
      var ecols = rabbitColumnNames(rest);
      if (!ecols.length) ecols = ['name', 'type'];
      var exs = [
        { name: '', type: 'direct', durable: true }, { name: 'amq.direct', type: 'direct', durable: true },
        { name: 'amq.topic', type: 'topic', durable: true }, { name: 'orders.exchange', type: 'topic', durable: true },
        { name: 'orders.dlx', type: 'fanout', durable: true }
      ];
      var erows = exs.map(function (e) { return ecols.map(function (c) { return c === 'name' ? e.name : (c === 'type' ? e.type : String(e.durable)); }); });
      if (json) return ok([JSON.stringify(erows, null, 4)]);
      return ok((quiet ? [] : ['Timeout: 60.0 seconds ...']).concat(['Listing exchanges for vhost ' + vhost + ' ...'], table(ecols, erows)));
    }

    if (cmd === 'list_bindings') {
      var bcols = rabbitColumnNames(rest);
      if (!bcols.length) bcols = ['source_name', 'destination_name', 'routing_key'];
      var bs = [
        { source_name: 'orders.exchange', destination_name: 'orders.created', routing_key: 'order.created' },
        { source_name: 'orders.exchange', destination_name: 'orders.paid', routing_key: 'order.paid' },
        { source_name: 'orders.dlx', destination_name: 'orders.dlq', routing_key: '' }
      ];
      var brows = bs.map(function (b) { return bcols.map(function (c) { return b[c] === undefined ? '' : b[c]; }); });
      if (json) return ok([JSON.stringify(brows, null, 4)]);
      return ok((quiet ? [] : ['Timeout: 60.0 seconds ...']).concat(['Listing bindings for vhost ' + vhost + ' ...'], table(bcols, brows)));
    }

    if (cmd === 'list_policies' || cmd === 'list_users' || cmd === 'list_permissions') {
      var pcols = rabbitColumnNames(rest);
      if (cmd === 'list_users') {
        var users = [
          { name: 'orderapp', tags: '[administrator]' }, { name: 'worker', tags: '[]' }, { name: 'monitor', tags: '[monitoring]' }, { name: 'guest', tags: '[administrator]' }
        ];
        if (!pcols.length) pcols = ['name', 'tags'];
        var urows = users.map(function (u) { return pcols.map(function (c) { return u[c] === undefined ? '' : u[c]; }); });
        if (json) return ok([JSON.stringify(urows, null, 4)]);
        return ok((quiet ? [] : ['Timeout: 60.0 seconds ...']).concat(['Listing users ...'], table(pcols, urows)));
      }
      if (cmd === 'list_permissions') {
        var perms = [{ user: 'orderapp', vhost: '/orders', configure: '.*', write: '.*', read: '.*' }, { user: 'worker', vhost: '/', configure: '', write: '.*', read: '.*' }];
        if (!pcols.length) pcols = ['user', 'vhost', 'configure', 'write', 'read'];
        var prows = perms.map(function (p) { return pcols.map(function (c) { return p[c] === undefined ? '' : p[c]; }); });
        if (json) return ok([JSON.stringify(prows, null, 4)]);
        return ok((quiet ? [] : ['Timeout: 60.0 seconds ...']).concat(['Listing permissions for vhost "' + vhost + '" ...'], table(pcols, prows)));
      }
      var pols = RABBIT_QUEUES.map(function (q) { return { vhost: q.vhost, name: 'ha-' + q.name, pattern: '^' + q.name + '$', apply_to: 'queues', definition: '{"ha-mode":"exactly","ha-params":2}', priority: 0 }; });
      if (!pcols.length) pcols = ['vhost', 'name', 'pattern', 'apply_to', 'definition', 'priority'];
      var polrows = pols.map(function (p) { return pcols.map(function (c) { return p[c] === undefined ? '' : p[c]; }); });
      if (json) return ok([JSON.stringify(polrows, null, 4)]);
      return ok((quiet ? [] : ['Timeout: 60.0 seconds ...']).concat(['Listing policies for vhost "' + vhost + '" ...'], table(pcols, polrows)));
    }

    if (cmd === 'list_consumers') {
      var cocols = rabbitColumnNames(rest);
      if (!cocols.length) cocols = ['queue', 'channel_pid', 'consumer_tag', 'ack_required', 'prefetch_count'];
      var cons = [
        { queue: 'orders.created', channel_pid: '<rabbit@rabbitmq-prod-01.1842.1>', consumer_tag: 'ctag-orderapp-1', ack_required: true, prefetch_count: 250, vhost: '/orders' },
        { queue: 'orders.paid', channel_pid: '<rabbit@rabbitmq-prod-01.1851.1>', consumer_tag: 'ctag-orderapp-2', ack_required: true, prefetch_count: 250, vhost: '/orders' }
      ].filter(function (x) { return x.vhost === vhost; });
      var corows = cons.map(function (c) { return cocols.map(function (col) { return c[col] === undefined ? '' : String(c[col]); }); });
      if (json) return ok([JSON.stringify(corows, null, 4)]);
      return ok((quiet ? [] : ['Timeout: 60.0 seconds ...']).concat(['Listing consumers on vhost ' + vhost + ' ...'], table(cocols, corows)));
    }

    if (cmd === 'list_hashes' || cmd === 'list_node_children') {
      return ok((quiet ? [] : ['Timeout: 60.0 seconds ...']).concat(['（教学提示）' + cmd + ' 是内部诊断命令，教学环境只做参数识别，不输出真实结构。']));
    }

    if (cmd === 'eval') {
      return fail(['（教学提示）rabbitmqctl eval 允许在 broker 上直接执行 Erlang 表达式 —— 生产上等同于"没有护栏的 root 权限"，' +
        '教学环境不模拟。常规运维请用 list_queues / list_connections / list_channels / status / cluster_status。']);
    }

    if (cmd === 'stop_app' || cmd === 'start_app' || cmd === 'stop' || cmd === 'shutdown' || cmd === 'reset' || cmd === 'force_reset' || cmd === 'join_cluster' || cmd === 'forget_cluster_node' || cmd === 'add_user' || cmd === 'delete_user' || cmd === 'set_permissions' || cmd === 'set_policy' || cmd === 'delete_queue' || cmd === 'purge_queue') {
      return fail(['（教学提示）`rabbitmqctl ' + cmd + '` 会真的改变 broker 或集群状态（停应用、清数据、踢节点、改权限），' +
        '教学环境**不执行**这类破坏性操作。要练手请先想清楚：停应用会让所有生产者的消息被拒；' +
        'force_reset 会清空本节点全部元数据；purge_queue 会永久删除积压消息。']);
    }

    if (cmd === 'version') return ok(['3.12.12']);
    if (cmd === 'help') return ok(['Usage: rabbitmqctl [-n <node>] [-q] [-p <vhost>] [--formatter <raw|json>] <command> [<args>]',
      '（教学提示）本站已实现：status / cluster_status / list_queues / list_connections / list_channels / list_vhosts / list_exchanges / list_bindings / list_policies / list_users / list_permissions / list_consumers / version。']);
    return codeFail(['Error: {:undef, [{rabbit_ctl_commands, \'' + cmd + '\', [], []}]}',
      '（教学提示）教学环境未实现该子命令；已实现：status / cluster_status / list_queues / list_connections / list_channels / list_vhosts / list_exchanges / list_bindings / list_policies / list_users / list_permissions / list_consumers / version。'], 64);
  }

  function rabbitQueueField(q, col) {
    var map = {
      name: q.name, messages: q.messages, messages_ready: q.ready, messages_unacknowledged: q.unacked,
      consumers: q.consumers, durable: q.durable, auto_delete: q.autoDelete, memory: q.memory,
      state: q.consumers > 0 ? 'running' : 'idle', type: 'classic', messages_ram: q.messages + 4,
      message_bytes: Math.round(q.memory * 0.9), consumer_utilisation: q.consumers > 0 ? '' : '',
      policy: 'ha-' + q.name, pid: '<rabbit@rabbitmq-prod-01.1842.0>', owner_pid: '<rabbit@rabbitmq-prod-01.1841.0>'
    };
    return map[col] === undefined ? '' : map[col];
  }
  function rabbitConnField(c, col) {
    var map = {
      name: c.name, user: c.user, peer_host: c.peer_host, peer_port: c.peer_port, host: c.peer_host,
      port: c.peer_port, state: c.state, channels: c.channels, send_pend: c.send_pend,
      recv_oct: c.recv_oct, send_oct: c.send_oct, ssl: c.ssl, protocol: c.protocol, node: RABBIT_NODE,
      vhost: '/orders', type: 'network', frame_max: 131072, timeout: 60, auth_mechanism: 'PLAIN'
    };
    return map[col] === undefined ? '' : String(map[col]);
  }
  function rabbitChanField(c, col) {
    var map = {
      name: c.name, number: c.number, user: c.user, vhost: c.vhost, consumer_count: c.consumer_count,
      messages_unacknowledged: c.unacked, messages_unconfirmed: 0, prefetch_count: c.prefetch,
      state: c.state, queue: c.queue, node: RABBIT_NODE, global_prefetch_count: 0,
      confirm: false, transactional: false, pid: '<rabbit@rabbitmq-prod-01.1842.' + c.number + '>'
    };
    return map[col] === undefined ? '' : String(map[col]);
  }

  function rabbitmqDiagnostics(argv, ctx, stdin, HOST) {
    var sub = String(argv[0] || '');
    if (sub === 'ping') {
      return ok(['Ping succeeded', '',
        '（教学提示）rabbitmq-diagnostics ping 是健康检查探针：节点活着返回 0，不活返回非 0，比解析 status 的文本输出更适合写进监控脚本。' +
        '同系列还有 check_running（进程 + 应用都在跑）、check_local_alarms（内存/磁盘告警）。']);
    }
    if (sub === 'check_running') return ok(['Checking if RabbitMQ is running ...', 'RabbitMQ is running', '', '（教学提示）check_running 比 ping 更严格：它要求 rabbit 应用本身也在运行（不只是 Erlang 节点活着）。']);
    if (sub === 'check_local_alarms') return ok(['Checking alarms ...', 'No alarms detected', '', '（教学提示）本地无告警。非空说明触发内存/磁盘流控，生产者会被 blocked —— 这是"消息发不进去"的头号原因。']);
    if (sub === 'status') return rabbitmqctl(['status'].concat(argv.slice(1)), ctx, stdin, HOST);
    if (sub === 'list_queues' || sub === 'list_connections' || sub === 'list_channels') {
      return rabbitmqctl([sub].concat(argv.slice(1)), ctx, stdin, HOST);
    }
    if (sub === 'help' || !sub) {
      return ok(['Usage: rabbitmq-diagnostics [-q] [-n <node>] <command> [<args>]',
        '（教学提示）本站已实现：ping / check_running / check_local_alarms / status / list_queues / list_connections / list_channels。']);
    }
    return codeFail(['Error: {:undef, [{rabbit_diagnostics, \'' + sub + '\', [], []}]}',
      '（教学提示）教学环境未实现该子命令；已实现：ping / check_running / check_local_alarms / status / list_queues / list_connections / list_channels。'], 64);
  }

  /* ======================================================================
     8. mqadmin（RocketMQ）
     ----------------------------------------------------------------------
     注意：站内示例都写成 `sh mqadmin <子命令>`（发行包 bin/ 下的脚本就是这么用的），
     所以这里同时注册 `mqadmin` 与 `sh`（只转发 mqadmin，别的脚本如实拒绝）。
     ====================================================================== */

  var RMQ_BROKERS = [
    { cluster: 'PROD_CLUSTER', name: 'broker-a', id: 0, addr: '10.0.1.61:10911', version: 'V4_9_7', inTps: 428.5, outTps: 512.2, inMsgsToday: 18421104, pageCacheLock: 0 },
    { cluster: 'PROD_CLUSTER', name: 'broker-a', id: 1, addr: '10.0.1.62:10911', version: 'V4_9_7', inTps: 0, outTps: 0, inMsgsToday: 0, pageCacheLock: 0 },
    { cluster: 'PROD_CLUSTER', name: 'broker-b', id: 0, addr: '10.0.1.63:10911', version: 'V4_9_7', inTps: 388.1, outTps: 401.7, inMsgsToday: 16204882, pageCacheLock: 2 }
  ];

  var RMQ_TOPICS = [
    { name: 'TopicOrderEvent', queues: 8, brokers: ['broker-a', 'broker-b'] },
    { name: 'TopicPaymentEvent', queues: 4, brokers: ['broker-a'] },
    { name: 'TopicInventorySync', queues: 4, brokers: ['broker-b'] },
    { name: 'TBW102', queues: 4, brokers: ['broker-a', 'broker-b'] },
    { name: 'SELF_TEST_TOPIC', queues: 1, brokers: ['broker-a'] },
    { name: 'SCHEDULE_TOPIC_XXXX', queues: 18, brokers: ['broker-a', 'broker-b'] },
    { name: 'RMQ_SYS_TRANS_HALF_TOPIC', queues: 1, brokers: ['broker-a'] }
  ];

  var RMQ_GROUPS = [
    {
      name: 'ORDER_CONSUMER_GROUP', topic: 'TopicOrderEvent',
      queues: [
        { broker: 'broker-a', qid: 0, brokerOffset: 4211882, consumerOffset: 4204118, last: '2024-03-18 09:51:42' },
        { broker: 'broker-a', qid: 1, brokerOffset: 4188220, consumerOffset: 4188004, last: '2024-03-18 09:51:40' },
        { broker: 'broker-a', qid: 2, brokerOffset: 4210044, consumerOffset: 4188210, last: '2024-03-18 09:49:02' },
        { broker: 'broker-b', qid: 0, brokerOffset: 3920118, consumerOffset: 3920102, last: '2024-03-18 09:51:41' },
        { broker: 'broker-b', qid: 1, brokerOffset: 3904220, consumerOffset: 3891204, last: '2024-03-18 09:47:18' },
        { broker: 'broker-b', qid: 2, brokerOffset: 3888110, consumerOffset: 3888110, last: '2024-03-18 09:51:38' }
      ]
    },
    {
      name: 'PAYMENT_CONSUMER_GROUP', topic: 'TopicPaymentEvent',
      queues: [
        { broker: 'broker-a', qid: 0, brokerOffset: 921044, consumerOffset: 921040, last: '2024-03-18 09:51:39' },
        { broker: 'broker-a', qid: 1, brokerOffset: 918220, consumerOffset: 918214, last: '2024-03-18 09:51:37' }
      ]
    }
  ];

  function rmqNameserver(argv) {
    var ns = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-n') ns = String(argv[i + 1] || '');
      else if (a.indexOf('-n') === 0 && a.length > 2) ns = a.slice(2);
    }
    return ns;
  }

  function rmqCheckNs(ns) {
    if (!ns) {
      return { ok: false, res: fail(['Please set the nameserver address by -n option, such as: -n 127.0.0.1:9876',
        '（教学提示）mqadmin 几乎每个子命令都要用 -n 指定 NameServer 地址（默认端口 9876，多个用分号分隔：-n "10.0.1.51:9876;10.0.1.52:9876"）。']) };
    }
    var first = String(ns).split(';')[0].trim();
    var m = first.match(/^([^:]+):(\d+)$/);
    if (!m) return { ok: false, res: fail(['java.lang.IllegalArgumentException: invalid nameserver address: ' + ns]) };
    var host = m[1], port = m[2];
    var isNs = host === '127.0.0.1' || host === 'localhost' || host === '10.0.1.51' || host === 'rocketmq-ns-01';
    if (!isNs || port !== '9876') {
      return { ok: false, res: fail([
        'org.apache.rocketmq.remoting.exception.RemotingConnectException: connect to <' + first + '> failed',
        '（教学提示）NameServer 连不上。本站仿真里 RocketMQ 的 NameServer 是 127.0.0.1:9876 / 10.0.1.51:9876（rocketmq-ns-01），broker 是 10.0.1.61:10911（broker-a）与 10.0.1.62~63:10911。',
        '真机排查：① NameServer 进程在不在；② 端口通不通；③ broker 有没有成功注册上去（看 broker 日志的 register broker to name server 一行）。'
      ]) };
    }
    return { ok: true };
  }

  function mqadmin(argv, ctx, stdin, HOST) {
    var sub = String(argv[0] || '');
    var args = argv.slice(1);
    if (!sub) {
      return fail(['The most commonly used mqadmin commands are:',
        '   updateTopic          Update or create topic',
        '   deleteTopic          Delete topic from broker and NameServer',
        '   topicList            Get topic list from nameserver',
        '   topicStatus          Get topic status',
        '   topicRoute           Get topic route info',
        '   brokerStatus         Get broker runtime status',
        '   clusterList          Get cluster info',
        '   consumerProgress     Query consumers\' progress',
        '   consumerConnection   Query consumer\'s connection',
        '   consumerStatus       Query consumer\'s status',
        '（教学提示）mqadmin 是 RocketMQ 发行包 bin/ 目录下的运维工具，几乎每个子命令都要 -n 指定 NameServer。']);
    }

    if (sub === 'clusterList') {
      var c1 = rmqCheckNs(rmqNameserver(argv)); if (!c1.ok) return c1.res;
      var onlyCluster = null;
      for (var i = 0; i < args.length; i++) if (String(args[i]) === '-c') onlyCluster = String(args[i + 1] || '');
      var brokers = RMQ_BROKERS.filter(function (b) { return !onlyCluster || b.cluster === onlyCluster; });
      if (!brokers.length) return fail(['No broker in cluster ' + onlyCluster + ' (集群名写错，或该集群没有 broker 注册上来)']);
      var rows = brokers.map(function (b) {
        return ['#' + (b.cluster === 'PROD_CLUSTER' ? 'ClusterName' : 'ClusterName'), b.cluster + ' #' + b.cluster,
          '#' + (b.id === 0 ? 'Master' : 'Slave'), b.name + ' #' + b.name + '-' + b.id,
          '#' + (b.id === 0 ? 'Master' : 'Slave') + 'Addr', b.addr,
          '#' + 'Version', b.version,
          '#' + (b.id === 0 ? 'InTPS' : 'InTPS(LOAD)'), b.inTps.toFixed(1),
          '#' + 'OutTPS', b.outTps.toFixed(1),
          '#' + 'InMsgCntToday', String(b.inMsgsToday),
          '#' + 'PageCacheLockTimeMills', String(b.pageCacheLock)].filter(function (v, idx) { return idx % 2 === 0; });
      });
      /* 表头行：RocketMQ 用 key: value 的键值对表；这里按字段名横向列出 */
      var header = ['ClusterName', 'BrokerName', 'BrokerId', 'BrokerAddr', 'Version', 'InTPS', 'OutTPS', 'InMsgCntToday', 'PageCacheLockTimeMills'];
      var data = brokers.map(function (b) {
        return [b.cluster, b.name, b.id, b.addr, b.version, b.inTps.toFixed(1), b.outTps.toFixed(1), b.inMsgsToday, b.pageCacheLock];
      });
      var out = table(header, data);
      var hints = ['（教学提示）判读顺序：① 同一个 broker 名的 Master/Slave 是否都在（缺 Slave 说明没有冗余）；' +
        '② TPS 是否明显不均衡；③ 有没有 broker 的版本与其他不一致（滚动升级中断）。'];
      if (brokers.some(function (b) { return b.inTps === 0; })) {
        hints.push('（教学提示）broker-a-1（10.0.1.62）TPS 为 0 且当日消息量为 0 —— 它是 Slave，只做数据同步、不承担读写；' +
          '但如果它的 Master 挂了而它没追上，就会丢数据。');
      }
      if (argv.indexOf('-i') !== -1) {
        hints.push('（教学提示）-i <秒> 让 clusterList 每 N 秒刷新一次，观察 TPS 变化；真机上按 Ctrl+C 退出（本站只输出一帧）。');
      }
      if (argv.indexOf('-m') !== -1) {
        hints.push('（教学提示）-m 会额外打印更多统计列；生产巡检多写几个 NameServer 地址（-n "IP1:9876;IP2:9876"）避免单点。');
      }
      return okHint(out, hints);
    }

    if (sub === 'topicList') {
      var c2 = rmqCheckNs(rmqNameserver(argv)); if (!c2.ok) return c2.res;
      return okHint(RMQ_TOPICS.map(function (t) { return t.name; }).sort(), [
        '（教学提示）列表里含系统主题：TBW102 是自动创建主题的模板、SCHEDULE_TOPIC_XXXX 用于延时消息、' +
        'RMQ_SYS_TRANS_HALF_TOPIC 用于事务消息半消息、SELF_TEST_TOPIC 是自检主题。业务上只看自己命名规范的主题。'
      ]);
    }

    if (sub === 'topicStatus') {
      var c3 = rmqCheckNs(rmqNameserver(argv)); if (!c3.ok) return c3.res;
      var topic = null;
      for (var j = 0; j < args.length; j++) if (String(args[j]) === '-t') topic = String(args[j + 1] || '');
      if (!topic) return fail(['topicStatus need specify topic by -t option', '（教学提示）用法：sh mqadmin topicStatus -n 127.0.0.1:9876 -t <主题名>']);
      var t = RMQ_TOPICS.filter(function (x) { return x.name === topic; })[0];
      if (!t) return fail(['Topic[' + topic + '] not exist', '（教学提示）主题不存在。先 `sh mqadmin topicList -n 127.0.0.1:9876` 确认名字（RocketMQ 主题名区分大小写）。']);
      var rows2 = [];
      t.brokers.forEach(function (bn) {
        var idx = RMQ_BROKERS.filter(function (b) { return b.name === bn; })[0];
        for (var q = 0; q < t.queues; q++) {
          var maxOff = 4211882 - q * 31722 + (bn === 'broker-b' ? -291764 : 0);
          rows2.push([bn, q, Math.max(0, maxOff - 4211882), maxOff, '2024-03-18 09:51:' + padL(String(42 - q), 2), '2024-03-18 09:51:' + padL(String(42 - q), 2)]);
        }
      });
      var header2 = ['brokerName', 'QID', 'minOffset', 'maxOffset', 'lastUpdateTimestamp', 'lastUpdateTimestampFormat'];
      return okHint(table(header2, rows2), [
        '（教学提示）判读：① 所有队列 lastUpdateTimestamp 都很旧 = 没有新消息写入（生产端可能挂了）；' +
        '② maxOffset 在队列之间差异极大 = 消息分布倾斜（生产者指定了 key 或分区策略不合理）；' +
        '③ minOffset 远小于 maxOffset 说明历史消息还没被清理（保留时间设置过长，占磁盘）。'
      ]);
    }

    if (sub === 'topicRoute') {
      var c4 = rmqCheckNs(rmqNameserver(argv)); if (!c4.ok) return c4.res;
      var tr = null;
      for (var k1 = 0; k1 < args.length; k1++) if (String(args[k1]) === '-t') tr = String(args[k1 + 1] || '');
      var t2 = RMQ_TOPICS.filter(function (x) { return x.name === tr; })[0];
      if (!t2) return fail(['Topic[' + tr + '] not exist']);
      return okHint(table(['brokerName', 'queueNums', 'readQueueNums', 'writeQueueNums', 'perm', 'topicSysFlag'],
        t2.brokers.map(function (bn) { return [bn, t2.queues, t2.queues, t2.queues, 6, 0]; })),
        ['（教学提示）perm=6 表示可读可写（2=写、4=读、6=读写）；排查"消息发不进去"时先看 writeQueueNums 是不是 0。']);
    }

    if (sub === 'brokerStatus') {
      var c5 = rmqCheckNs(rmqNameserver(argv)); if (!c5.ok) return c5.res;
      var baddr = null;
      for (var k2 = 0; k2 < args.length; k2++) if (String(args[k2]) === '-b') baddr = String(args[k2 + 1] || '');
      if (!baddr) return fail(['brokerStatus need specify broker address by -b option', '（教学提示）用法：sh mqadmin brokerStatus -n 127.0.0.1:9876 -b 10.0.1.61:10911']);
      var b2 = RMQ_BROKERS.filter(function (x) { return x.addr === baddr; })[0];
      if (!b2) {
        return fail(['org.apache.rocketmq.remoting.exception.RemotingConnectException: connect to <' + baddr + '> failed',
          '（教学提示）broker 地址连不上。本站仿真里：broker-a 主 10.0.1.61:10911、broker-a 从 10.0.1.62:10911、broker-b 主 10.0.1.63:10911。']);
      }
      return okHint([
        '============Broker Config============',
        'brokerClusterName=' + b2.cluster,
        'brokerName=' + b2.name,
        'brokerId=' + b2.id,
        'brokerRole=' + (b2.id === 0 ? 'ASYNC_MASTER' : 'SLAVE'),
        'brokerIP1=' + b2.addr.split(':')[0],
        'listenPort=' + b2.addr.split(':')[1],
        'storePathRootDir=/data/rocketmq/store',
        'osPageCacheBusyTimeOutMills=1000',
        'flushDiskType=ASYNC_FLUSH',
        '============Runtime Info============',
        'brokerVersionDesc=' + b2.version,
        'msgPutTotalTodayNow=' + Math.round(b2.inMsgsToday / 86400 * 35100),
        'msgGetTotalTodayNow=' + Math.round(b2.inMsgsToday / 86400 * 34800),
        'sendThreadPoolQueueSize=0',
        'pullThreadPoolQueueSize=' + (b2.id === 0 ? '12' : '0'),
        'pageCacheLockTimeMills=' + b2.pageCacheLock,
        'commitLogDiskRatio=0.42',
        'consumeQueueDiskRatio=0.18'
      ], ['（教学提示）重点看 pageCacheLockTimeMills（页缓存锁定等待时间，持续很大说明磁盘写入跟不上）与 commitLogDiskRatio（磁盘占用比，超过 0.85 会触发强制清理甚至写入被拒）。']);
    }

    if (sub === 'consumerProgress') {
      var c6 = rmqCheckNs(rmqNameserver(argv)); if (!c6.ok) return c6.res;
      var g = null, summary = false;
      for (var k3 = 0; k3 < args.length; k3++) {
        if (String(args[k3]) === '-g') g = String(args[k3 + 1] || '');
        if (String(args[k3]) === '-s') summary = true;
      }
      if (!g) return fail(['consumerProgress need specify consumer group by -g option', '（教学提示）用法：sh mqadmin consumerProgress -n 127.0.0.1:9876 -g <消费组>']);
      var grp = RMQ_GROUPS.filter(function (x) { return x.name === g; })[0];
      if (!grp) return fail(['Not found the consumer group[ ' + g + ' ] in nameserver', '（教学提示）组名写错，或该组从未上过线（RocketMQ 的消费组在消费者第一次注册时才出现）。']);
      var rows3 = grp.queues.map(function (q) {
        return [q.broker, q.qid, q.brokerOffset, q.consumerOffset, q.brokerOffset - q.consumerOffset, q.last];
      });
      if (summary) {
        var total = rows3.reduce(function (a, r) { return a + Number(r[4]); }, 0);
        return okHint(table(['Topic', 'Diff'], [[grp.topic, total]]),
          ['（教学提示）-s 只给每个主题的积压总量，用来先定位是哪个主题堆了；接着不带 -s 看具体队列。']);
      }
      var header3 = ['brokerName', 'queueId', 'brokerOffset', 'consumerOffset', 'diff', 'lastTimestamp'];
      var hints3 = ['（教学提示）diff = brokerOffset − consumerOffset 就是积压条数。排查顺序：① 看 diff 总量；' +
        '② 看积压是否集中在少数队列（消费端某实例慢或掉了，rebalance 后不均）；③ 看 lastTimestamp 是不是今天（长时间不更新说明消费者根本没在跑）。'];
      if (rows3.some(function (r) { return Number(r[4]) > 1000; })) {
        hints3.push('（教学提示）有队列积压超过 1000 条：broker-a 队列 2 与 broker-b 队列 1 明显落后，' +
          '典型原因是消费端某个实例处理慢或掉线后 rebalance 不均。用 `sh mqadmin consumerConnection -n 127.0.0.1:9876 -g ' + g + '` 确认实例是否都在线。');
      }
      return okHint(table(header3, rows3), hints3);
    }

    if (sub === 'consumerConnection') {
      var c7 = rmqCheckNs(rmqNameserver(argv)); if (!c7.ok) return c7.res;
      var g2 = null;
      for (var k4 = 0; k4 < args.length; k4++) if (String(args[k4]) === '-g') g2 = String(args[k4 + 1] || '');
      if (!g2) return fail(['consumerConnection need specify consumer group by -g option']);
      var grp2 = RMQ_GROUPS.filter(function (x) { return x.name === g2; })[0];
      if (!grp2) return fail(['Not found the consumer group[ ' + g2 + ' ] in nameserver']);
      return okHint([
        '001',
        '------------------------------',
        'ConsumeType: CONSUME_PASSIVELY',
        'ConsumeModel: CLUSTERING',
        'ConsumeFromWhere: CONSUME_FROM_LAST_OFFSET',
        'Subscription: ' + grp2.topic + ' (Tag: *)',
        '----------------------ConnectionSet--------------------',
        'ClientId: 10.0.1.23@18421#1710729688000',
        '  ClientAddr: 10.0.1.23:51204',
        '  Language: JAVA  Version: V4_9_7',
        '  ConsumeType: CONSUME_PASSIVELY',
        'ClientId: 10.0.1.24@18442#1710729688114',
        '  ClientAddr: 10.0.1.24:51208',
        '  Language: JAVA  Version: V4_9_7'
      ], ['（教学提示）积压大时先跑这条：消费者实例不在线就是实例挂了（不是消费慢）；都在线才去优化消费逻辑或加实例。']);
    }

    if (sub === 'consumerStatus') {
      var c8 = rmqCheckNs(rmqNameserver(argv)); if (!c8.ok) return c8.res;
      return okHint([
        '001',
        '------------------------------',
        'consumeStatus:{',
        '  pullRT: 0.42,',
        '  pullTPS: 418.22,',
        '  consumeRT: 3.81,',
        '  consumeFailedMsgs: 0,',
        '  consumeFailedTPS: 0.0,',
        '  consumeOKTPS: 412.04',
        '}',
        'consumeSubscription:{TopicOrderEvent=*}'
      ], ['（教学提示）consumeRT 明显大于 pullRT 说明消息拉回来了但业务处理慢（消费端才是瓶颈）；consumeFailedMsgs 持续增长要去消费端日志找异常。']);
    }

    if (sub === 'updateTopic') {
      var c9 = rmqCheckNs(rmqNameserver(argv)); if (!c9.ok) return c9.res;
      var topic2 = null, cluster = null, readQueue = null, writeQueue = null, baddr2 = null, perm = null;
      for (var k5 = 0; k5 < args.length; k5++) {
        var a5 = String(args[k5]);
        if (a5 === '-t') topic2 = String(args[++k5] || '');
        else if (a5 === '-c') cluster = String(args[++k5] || '');
        else if (a5 === '-r') readQueue = String(args[++k5] || '');
        else if (a5 === '-w') writeQueue = String(args[++k5] || '');
        else if (a5 === '-b') baddr2 = String(args[++k5] || '');
        else if (a5 === '-p') perm = String(args[++k5] || '');
      }
      if (!topic2) return fail(['updateTopic need specify topic by -t option']);
      if (!cluster && !baddr2) {
        return fail(['updateTopic need specify cluster by -c option or broker address by -b option',
          '（教学提示）创建/修改主题要么用 -c <集群名>（在该集群所有 broker 上建），要么用 -b <broker地址>（只在指定 broker 上建）。']);
      }
      if (readQueue !== null && (!isDigits(readQueue) || Number(readQueue) < 1)) {
        return fail(['readQueueNums must be positive integer']);
      }
      if (writeQueue !== null && (!isDigits(writeQueue) || Number(writeQueue) < 1)) {
        return fail(['writeQueueNums must be positive integer']);
      }
      var exist = RMQ_TOPICS.filter(function (x) { return x.name === topic2; })[0];
      var qn = Number(writeQueue || readQueue || 8);
      var targetBrokers = cluster ? RMQ_BROKERS.filter(function (b) { return b.cluster === cluster && b.id === 0; }).map(function (b) { return b.name; })
        : [RMQ_BROKERS.filter(function (b) { return b.addr === baddr2; }).map(function (b) { return b.name; })[0]].filter(Boolean);
      if (!targetBrokers.length) {
        return fail(['org.apache.rocketmq.remoting.exception.RemotingConnectException: connect to <' + (baddr2 || cluster) + '> failed',
          '（教学提示）目标 broker 不存在。本站：PROD_CLUSTER 下有 broker-a（10.0.1.61 主 / 10.0.1.62 从）与 broker-b（10.0.1.63 主）。']);
      }
      if (exist) {
        exist.queues = qn;
        exist.brokers = targetBrokers;
        return okHint(['update topic ' + topic2 + ' to broker ' + targetBrokers.join(',') + ' success.'],
          ['（教学提示）主题已存在时 updateTopic 会**修改**队列数与权限（注意：扩容写队列数后，老队列上的消息不会重分布；缩容会导致部分队列的消息不再被消费）。']);
      }
      RMQ_TOPICS.push({ name: topic2, queues: qn, brokers: targetBrokers });
      return okHint(['create topic to broker success.', 'update topic ' + topic2 + ' to broker ' + targetBrokers.join(',') + ' success.'],
        ['（教学提示）真机上创建主题是"先写 NameServer、再逐个 broker 注册"，中途失败会留下不一致状态（topicList 里有但 broker 上没有）；' +
         '排查用 `sh mqadmin topicRoute -n 127.0.0.1:9876 -t ' + topic2 + '`。']);
    }

    if (sub === 'deleteTopic') {
      var c10 = rmqCheckNs(rmqNameserver(argv)); if (!c10.ok) return c10.res;
      var dt2 = null, dcluster = null;
      for (var k6 = 0; k6 < args.length; k6++) {
        if (String(args[k6]) === '-t') dt2 = String(args[++k6] || '');
        else if (String(args[k6]) === '-c') dcluster = String(args[++k6] || '');
      }
      if (!dt2 || !dcluster) return fail(['deleteTopic need specify topic by -t and cluster by -c option',
        '（教学提示）删主题必须同时给 -c <集群名>：RocketMQ 要逐个 broker 删，漏了集群会删不干净。']);
      var before = RMQ_TOPICS.length;
      RMQ_TOPICS = RMQ_TOPICS.filter(function (x) { return x.name !== dt2; });
      if (RMQ_TOPICS.length === before) return fail(['Topic[' + dt2 + '] not exist']);
      return okHint(['delete topic ' + dt2 + ' from cluster ' + dcluster + ' success.'],
        ['（教学提示）删主题不可逆：消费组的位点（offset）还在，重建同名主题后会从老位点继续消费，可能直接跳过新消息 —— 重建前先确认位点。']);
    }

    return fail(['Command \'' + sub + '\' not found, please use the correct command.',
      '（教学提示）本站已实现：clusterList / topicList / topicStatus / topicRoute / brokerStatus / consumerProgress / consumerConnection / consumerStatus / updateTopic / deleteTopic。']);
  }

  /* `sh <脚本> <参数…>`：站内示例写成 `sh mqadmin ...`（发行包 bin/ 下就是这么用的）。
     只转发 mqadmin，别的脚本按真实行为报"文件不存在"，不假装执行。 */
  function shDispatcher(argv, ctx, stdin, HOST) {
    var script = String(argv[0] || '');
    /* ⚠️ `sh -c "脚本片段"`：把字符串当脚本执行。
       早先这里不认 `-c`，把它当成"要执行的脚本文件名"，于是
        `xargs … sh -c "sleep 1; echo 处理 {}"` 报
        `sh: 0: cannot open -c: No such file or directory` ——
        而"用 sh -c 在 xargs 里跑多步命令"是并发批量任务的标准写法。
        （`bash -c` 由 shell.js 的同名分支处理。） */
    if (script === '-c') {
      var code = String(argv[1] === undefined ? '' : argv[1]);
      if (!code) return fail(['sh: -c: option requires an argument']);
      if (!ctx || !ctx.shell || !ctx.shell.exec) return fail(['sh: 教学环境无法再次执行命令']);
      return ctx.shell.exec(code);
    }
    if (script === 'mqadmin' || script === './mqadmin' || script === 'bin/mqadmin') {
      return mqadmin(argv.slice(1), ctx, stdin, HOST);
    }
    if (script === 'kafka-topics.sh' || script === './kafka-topics.sh') return kafkaTopicsCmd(argv.slice(1), ctx, stdin, HOST);
    if (script === 'kafka-consumer-groups.sh' || script === './kafka-consumer-groups.sh') return kafkaConsumerGroups(argv.slice(1), ctx, stdin, HOST);
    if (!script) return fail(['sh: 0: cannot open : No such file or directory']);
    var r = U.readFileOrErr(ctx, script);
    if (r && !r.err) {
      return fail(['（教学提示）本站不执行脚本文件（' + script + ' 存在于虚拟文件系统里，但仿真机没有真的 shell 解释器）。' +
        '要看它的内容：`cat ' + script + '`。']);
    }
    return codeFail(['sh: 0: cannot open ' + script + ': No such file or directory'], 2);
  }

  /* ======================================================================
     9. MySQL 引擎（-e 扩展 SQL）+ mysqladmin / mysqldump / mydumper /
        myloader / xtrabackup / pt-query-digest / mysqldumpslow
     ====================================================================== */

  var MYSQL_HOSTS = { 'db-prod-01': { ip: '10.0.2.15', port: '3306' }, 'web-prod-01': { ip: '10.0.1.23', port: '3306' } };
  var MYSQL_PASS = { root: 'Root@2024', app: 'App@2024', backup: 'Bk@2024', monitor: 'Mon@2024', repl: 'Repl@2024', postgres: null };
  var MYSQL_DBS = {
    information_schema: ['CHARACTER_SETS', 'COLUMNS', 'ENGINES', 'INNODB_TRX', 'PROCESSLIST', 'SCHEMATA', 'TABLES', 'USER_PRIVILEGES'],
    mysql: ['columns_priv', 'db', 'engine_cost', 'gtid_executed', 'help_category', 'proxies_priv', 'role_edges', 'tables_priv', 'time_zone', 'user'],
    orders: ['order_items', 'order_status_log', 'orders', 'payments', 'users'],
    performance_schema: ['events_statements_summary_by_digest', 'global_status', 'replication_applier_status_by_worker', 'session_variables', 'threads'],
    sys: ['innodb_lock_waits', 'processlist', 'schema_table_statistics', 'session', 'statements_with_full_table_scans']
  };
  var MYSQL_TABLE_STATS = [
    { TABLE_NAME: 'order_items', ENGINE: 'InnoDB', TABLE_ROWS: 42118330, DATA_LENGTH: 8589934592, INDEX_LENGTH: 2147483648, DATA_FREE: 268435456, TABLE_COMMENT: '订单明细' },
    { TABLE_NAME: 'order_status_log', ENGINE: 'InnoDB', TABLE_ROWS: 52118330, DATA_LENGTH: 6657199308, INDEX_LENGTH: 536870912, DATA_FREE: 1073741824, TABLE_COMMENT: '状态流水：只增不改，没有索引' },
    { TABLE_NAME: 'orders', ENGINE: 'InnoDB', TABLE_ROWS: 18204412, DATA_LENGTH: 4398046511, INDEX_LENGTH: 1073741824, DATA_FREE: 536870912, TABLE_COMMENT: '订单主表' },
    { TABLE_NAME: 'payments', ENGINE: 'InnoDB', TABLE_ROWS: 9120441, DATA_LENGTH: 2147483648, INDEX_LENGTH: 536870912, DATA_FREE: 134217728, TABLE_COMMENT: '支付流水' },
    { TABLE_NAME: 'users', ENGINE: 'InnoDB', TABLE_ROWS: 982140, DATA_LENGTH: 193986560, INDEX_LENGTH: 50331648, DATA_FREE: 8388608, TABLE_COMMENT: '用户资料' }
  ];
  var MYSQL_VARS = {
    character_set_server: 'utf8mb4', collation_server: 'utf8mb4_0900_ai_ci', datadir: '/var/lib/mysql/',
    innodb_buffer_pool_size: '2147483648', innodb_flush_log_at_trx_commit: '1', innodb_log_file_size: '1073741824',
    innodb_print_all_deadlocks: 'OFF', long_query_time: '5.000000', max_allowed_packet: '67108864',
    max_connections: '1000', max_execution_time: '0', slow_query_log: 'ON',
    slow_query_log_file: '/var/lib/mysql/mysql-slow.log', sync_binlog: '1',
    transaction_isolation: 'READ-COMMITTED', wait_timeout: '28800', interactive_timeout: '28800',
    net_read_timeout: '30', net_write_timeout: '60', connect_timeout: '10', delayed_insert_timeout: '300',
    log_queries_not_using_indexes: 'OFF', log_output: 'FILE', replica_parallel_workers: '4',
    replica_parallel_type: 'LOGICAL_CLOCK', server_id: '1', version: '8.0.36', version_comment: 'MySQL Community Server - GPL',
    read_only: 'OFF', super_read_only: 'OFF', gtid_mode: 'ON', binlog_format: 'ROW',
    long_query_time_ms: '5000'
  };
  var MYSQL_STATUS = {
    Threads_connected: '182', Threads_running: '3', Max_used_connections: '412', Aborted_clients: '37',
    Aborted_connects: '12', Uptime: '172040', Questions: '18421104', Slow_queries: '1842',
    Open_tables: '2048', Opened_tables: '184211', Queries_per_second_avg: '107.08', Innodb_buffer_pool_reads: '1842110',
    Innodb_buffer_pool_read_requests: '91820441208', Innodb_row_lock_waits: '842', Innodb_row_lock_time: '412208',
    Com_select: '14221884', Com_insert: '1842110', Com_update: '921044', Com_delete: '42118', Table_locks_waited: '0'
  };
  var MYSQL_PROCESSLIST = [
    { Id: 41237, USER: 'app', HOST: '10.0.1.23:54120', DB: 'orders', COMMAND: 'Query', TIME: 5, STATE: 'Sending data', INFO: "SELECT COUNT(*) FROM order_status_log WHERE order_id = 8812 AND status = 'PAID'" },
    { Id: 41244, USER: 'app', HOST: '10.0.1.23:54124', DB: 'orders', COMMAND: 'Query', TIME: 184, STATE: 'Waiting for table metadata lock', INFO: 'ALTER TABLE orders ADD INDEX idx_user_status (user_id, status), ALGORITHM=INPLACE, LOCK=NONE' },
    { Id: 41248, USER: 'app', HOST: '10.0.1.23:54131', DB: 'orders', COMMAND: 'Query', TIME: 3, STATE: 'Copying to tmp table', INFO: "SELECT * FROM orders WHERE user_id = 8813 AND status = 'PAID' ORDER BY created_at DESC LIMIT 20" },
    { Id: 41251, USER: 'backup', HOST: '10.0.1.23:54140', DB: null, COMMAND: 'Binlog Dump GTID', TIME: 1842, STATE: 'Master has sent all binlog to slave; waiting for more updates', INFO: null },
    { Id: 41255, USER: 'repl', HOST: '10.0.2.15:41208', DB: null, COMMAND: 'Binlog Dump GTID', TIME: 172040, STATE: 'Master has sent all binlog to slave; waiting for more updates', INFO: null },
    { Id: 41258, USER: 'app', HOST: '10.0.1.23:54152', DB: 'orders', COMMAND: 'Sleep', TIME: 842, STATE: '', INFO: null },
    { Id: 41261, USER: 'app', HOST: '10.0.1.23:54160', DB: 'orders', COMMAND: 'Sleep', TIME: 421, STATE: '', INFO: null },
    { Id: 41264, USER: 'monitor', HOST: '10.0.1.23:54166', DB: null, COMMAND: 'Query', TIME: 0, STATE: 'init', INFO: 'SHOW FULL PROCESSLIST' }
  ];

  var REPLICA_STATUS = {
    Slave_IO_State: 'Waiting for master to send event',
    Master_Host: '10.0.2.15', Master_User: 'repl', Master_Port: 3306,
    Connect_Retry: 60, Master_Log_File: 'mysql-bin.000042', Read_Master_Log_Pos: 918273645,
    Relay_Log_File: 'relay-bin.000118', Relay_Log_Pos: 402118,
    Relay_Master_Log_File: 'mysql-bin.000042',
    Replica_IO_Running: 'Yes', Replica_SQL_Running: 'No',
    Seconds_Behind_Master: 'NULL',
    Master_SSL_Allowed: 'No', Seconds_Behind_Source: 'NULL',
    Last_IO_Errno: 0, Last_IO_Error: '',
    Last_SQL_Errno: 1062,
    Last_SQL_Error: "Could not execute Write_rows event on table orders.users; Duplicate entry '100234' for key 'users.PRIMARY', Error_code: 1062; handler error HA_ERR_FOUND_DUPP_KEY; the event's master log mysql-bin.000042, end_log_pos 918204118",
    Replicate_Ignore_Server_Ids: '', Master_Server_Id: 1, Master_UUID: 'a1b4c7d9-e206-11ee-8f3c-1a724d5e4b91',
    Master_Info_File: 'mysql.slave_master_info', SQL_Delay: 0, SQL_Remaining_Delay: null,
    Slave_SQL_Running_State: '',
    Retrieved_Gtid_Set: 'a1b4c7d9-e206-11ee-8f3c-1a724d5e4b91:1-184211',
    Executed_Gtid_Set: 'a1b4c7d9-e206-11ee-8f3c-1a724d5e4b91:1-184188',
    Auto_Position: 1, Replicate_Rewrite_DB: '', Channel_Name: '', Master_TLS_Version: '',
    Source_Host: '10.0.2.15', Source_User: 'repl', Source_Port: 3306,
    Replica_IO_State: 'Waiting for master to send event',
    Relay_Master_Log_File_Source: 'mysql-bin.000042',
    Master_Log_File_Source: 'mysql-bin.000042',
    Exec_Master_Log_Pos: 918204118, Exec_Source_Log_Pos: 918204118,
    Read_Master_Log_Pos_Source: 918273645, Seconds_Behind_Source: 'NULL'
  };

  var INNODB_STATUS = [
    '=====================================',
    '2024-03-18 09:41:18 0x7f3c1a724d5e INNODB MONITOR OUTPUT',
    '=====================================',
    'Per second averages calculated from the last 42 seconds',
    '-----------------',
    'BACKGROUND THREAD',
    '-----------------',
    'srv_master_thread loops: 184211 srv_active, 0 srv_shutdown, 1842110 srv_idle',
    '----------',
    'SEMAPHORES',
    '----------',
    'OS WAIT ARRAY INFO: reservation count 184211',
    'OS WAIT ARRAY INFO: signal count 421188',
    'RW-shared spins 0, rounds 1842, OS waits 812',
    '------------------------',
    'LATEST DETECTED DEADLOCK',
    '------------------------',
    '2024-03-18 09:12:44 0x7f3c1a724d5e',
    '*** (1) TRANSACTION:',
    'TRANSACTION 4812042, ACTIVE 12 sec starting index read',
    "mysql tables in use 1, locked 1",
    'LOCK WAIT 4 lock struct(s), heap size 1136, 3 row lock(s)',
    "MySQL thread id 41237, OS thread handle 139841382110976, query id 18421104 10.0.1.23 app updating",
    "UPDATE orders SET status = 'PAID' WHERE id = 8812",
    '*** (1) HOLDS THE LOCK(S):',
    "RECORD LOCKS space id 42 page no 1842 n bits 96 index PRIMARY of table `orders`.`orders`",
    '*** (1) WAITING FOR THIS LOCK TO BE GRANTED:',
    "RECORD LOCKS space id 42 page no 1904 n bits 88 index PRIMARY of table `orders`.`order_items`",
    '*** (2) TRANSACTION:',
    'TRANSACTION 4812041, ACTIVE 14 sec starting index read',
    "MySQL thread id 41248, OS thread handle 139841382110720, query id 18421103 10.0.1.24 app updating",
    'UPDATE order_items SET qty = 2 WHERE order_id = 8812',
    '*** (2) HOLDS THE LOCK(S):',
    "RECORD LOCKS space id 42 page no 1904 n bits 88 index PRIMARY of table `orders`.`order_items`",
    '*** (2) WAITING FOR THIS LOCK TO BE GRANTED:',
    "RECORD LOCKS space id 42 page no 1842 n bits 96 index PRIMARY of table `orders`.`orders`",
    '*** WE ROLL BACK TRANSACTION (2)',
    '------------',
    'TRANSACTIONS',
    '------------',
    'Trx id counter 4812104',
    'Purge done for trx\'s n:o < 4812088 undo n:o < 0 state: running but idle',
    'History list length 1842110',
    'LIST OF TRANSACTIONS FOR EACH SESSION:',
    '---TRANSACTION 4812102, not started',
    '0 lock struct(s), heap size 1136, 0 row lock(s)',
    '---TRANSACTION 4812098, ACTIVE 1842 sec',
    '2 lock struct(s), heap size 1136, 184211 row lock(s)',
    "MySQL thread id 41244, OS thread handle 139841382110400, query id 18421120 10.0.1.23 app",
    'ALTER TABLE orders ADD INDEX idx_user_status (user_id, status), ALGORITHM=INPLACE, LOCK=NONE',
    '---------------------',
    'BUFFER POOL AND MEMORY',
    '---------------------',
    'Total large memory allocated 2197815296',
    'Dictionary memory allocated 1842110',
    'Buffer pool size   131072',
    'Free buffers       1024',
    'Database pages     128842',
    'Old database pages 47488',
    'Modified db pages  8421',
    'Pending reads      0',
    'Pending writes: LRU 0, flush list 0, single page 0',
    'Pages made young 18421104, not young 184211',
    'Buffer pool hit rate 998 / 1000, young-making rate 12 / 1000 not 4 / 1000',
    'Pages read 1842110, created 421188, written 184211',
    '---',
    'LOG',
    '---',
    'Log sequence number          9182736451',
    'Log buffer assigned up to    9182736451',
    'Log buffer completed up to   9182736451',
    'Log written up to            9182736451',
    'Log flushed up to            9182736448',
    'Added dirty pages up to      9182736448',
    'Pages flushed up to          9182041180',
    'Last checkpoint at           9182041180',
    '----------------------',
    'END OF INNODB MONITOR OUTPUT',
    '============================'
  ];

  var MYSQL_USER_ROWS = [
    { user: 'app', host: '10.0.1.%', account_locked: 'N', plugin: 'caching_sha2_password', Select_priv: 'Y', Insert_priv: 'Y', Update_priv: 'Y', Delete_priv: 'Y' },
    { user: 'backup', host: '10.0.1.23', account_locked: 'N', plugin: 'caching_sha2_password', Select_priv: 'Y', Insert_priv: 'N', Update_priv: 'N', Delete_priv: 'N' },
    { user: 'legacy', host: '%', account_locked: 'N', plugin: 'mysql_native_password', Select_priv: 'Y', Insert_priv: 'N', Update_priv: 'N', Delete_priv: 'N' },
    { user: 'monitor', host: '10.0.1.%', account_locked: 'N', plugin: 'caching_sha2_password', Select_priv: 'N', Insert_priv: 'N', Update_priv: 'N', Delete_priv: 'N' },
    { user: 'repl', host: '10.0.2.15', account_locked: 'N', plugin: 'caching_sha2_password', Select_priv: 'N', Insert_priv: 'N', Update_priv: 'N', Delete_priv: 'N' },
    { user: 'root', host: 'localhost', account_locked: 'N', plugin: 'caching_sha2_password', Select_priv: 'Y', Insert_priv: 'Y', Update_priv: 'Y', Delete_priv: 'Y' }
  ];

  function mysqlErr(no, sqlstate, msg) {
    return 'ERROR ' + no + ' (' + sqlstate + '): ' + msg;
  }

  /* 目标库：-h / -P / -u / -p / -D / -e / --connect-timeout / --max_allowed_packet … */
  function parseMysqlCommon(argv, opt) {
    var o = { host: null, port: '3306', user: 'root', pass: null, passGiven: false, db: null, sql: null, file: null, args: [] };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h' || a === '--host') { o.host = String(argv[++i] || ''); continue; }
      if (a.indexOf('--host=') === 0) { o.host = a.slice(7); continue; }
      if (a === '-P' || a === '--port') { o.port = String(argv[++i] || '3306'); continue; }
      if (a.indexOf('--port=') === 0) { o.port = a.slice(7); continue; }
      if (a === '-u' || a === '--user') { o.user = String(argv[++i] || ''); continue; }
      if (a.indexOf('--user=') === 0) { o.user = a.slice(7); continue; }
      if (a === '-p') {
        o.passGiven = true;
        var nx = argv[i + 1];
        /* 真 mysql 的 `-p` 后面必须**紧贴**密码；写成 `-p 密码` 时密码会被当成
           库名/表名。站内示例统一用 `-p` 交互提示，脚本里再用 `-p'密码'`。 */
        if (nx !== undefined && String(nx).charAt(0) !== '-' && /^[A-Za-z0-9_@#$%^&*!.-]{6,}$/.test(String(nx)) &&
          !MYSQL_DBS[String(nx)] && /[^A-Za-z]/.test(String(nx))) {
          o.pass = String(nx); i++;
        } else o.pass = null;
        continue;
      }
      if (a.indexOf('-p') === 0 && a.length > 2) { o.passGiven = true; o.pass = a.slice(2); continue; }
      if (a === '--password') { o.passGiven = true; o.pass = argv[++i] === undefined ? null : String(argv[i]); continue; }
      if (a.indexOf('--password=') === 0) { o.passGiven = true; o.pass = a.slice(11); continue; }
      if (a === '-D' || a === '--database') { o.db = String(argv[++i] || ''); continue; }
      if (a.indexOf('--database=') === 0) { o.db = a.slice(11); continue; }
      if (a === '-e' || a === '--execute') { o.sql = String(argv[++i] === undefined ? '' : argv[i]); continue; }
      if (a.indexOf('--execute=') === 0) { o.sql = a.slice(10); continue; }
      if (a === '-B' || a === '--batch') { o.batch = true; continue; }
      if (a === '--connect-timeout' || a === '--max_allowed_packet' || a === '--default-character-set' || a === '--socket' || a === '--protocol') { o.args.push(a, String(argv[++i] === undefined ? '' : argv[i])); continue; }
      if (a.indexOf('--connect-timeout=') === 0 || a.indexOf('--max_allowed_packet=') === 0) { o.args.push(a); continue; }
      if (a === '--single-transaction' || a === '--routines' || a === '--triggers' || a === '--events' || a === '--no-data' ||
        a === '--no-create-info' || a === '--set-gtid-purged=OFF' || a === '--source-data=2' || a === '--master-data=2' || a === '-A' ||
        a === '--all-databases' || a === '--databases' || a === '--hex-blob' || a === '--quick' || a === '-q' || a === '--skip-lock-tables') {
        o.args.push(a); continue;
      }
      if (a.indexOf('--') === 0) { o.args.push(a); continue; }
      if (a.charAt(0) === '-') { o.args.push(a); continue; }
      if (!o.db && /^[A-Za-z_][A-Za-z0-9_]*$/.test(a) && !o.sql) { o.db = a; continue; }
      o.args.push(a);
    }
    return o;
  }

  /* 连接判定：返回 {ok} 或 {res: 报错} */
  function mysqlConnect(ctx, HOST, o, tool) {
    var label = o.host ? (HOST.ip || '127.0.0.1') : 'localhost';
    var hosts = hostsFileMap(ctx, HOST);
    var isLocal = !o.host || localNames(HOST)[o.host];
    if (!isLocal) {
      var ip = hosts[o.host] || (/^\d+\.\d+\.\d+\.\d+$/.test(o.host) ? o.host : null);
      var known = MYSQL_HOSTS[o.host] || null;
      if (!ip && !known) {
        return { res: fail([tool + ': ' + mysqlErr(2005, 'HY000', "Unknown MySQL server host '" + o.host + "' (-2)"),
          '（教学提示）主机名解析不了。本站仿真里只有 db-prod-01（10.0.2.15）跑着 MySQL 8.0；web-prod-01 上是应用机，不提供数据库服务。']) };
      }
      var targetIp = known ? known.ip : ip;
      var hasMysql = known ? true : false;
      if (!hasMysql) {
        /* /etc/hosts 里有但不是数据库主机 */
        for (var hn in VHOSTS) {
          if (Object.prototype.hasOwnProperty.call(VHOSTS, hn) && VHOSTS[hn].ip === targetIp && VHOSTS[hn].services.mysql) { hasMysql = true; break; }
        }
      }
      if (!hasMysql) {
        return { res: fail([tool + ': ' + mysqlErr(2003, 'HY000', "Can't connect to MySQL server on '" + o.host + "' (111)"),
          '（教学提示）"' + o.host + '" 解析得到 ' + targetIp + '，但那个地址上 3306 端口没有 MySQL 在监听（111 = Connection refused）。']) };
      }
      if (String(o.port) !== '3306') {
        return { res: fail([tool + ': ' + mysqlErr(2003, 'HY000', "Can't connect to MySQL server on '" + o.host + "' (111)")]) };
      }
    } else if (String(o.port) !== '3306') {
      return { res: fail([tool + ': ' + mysqlErr(2003, 'HY000', "Can't connect to MySQL server on '" + (o.host || 'localhost') + "' (111)")]) };
    }
    var real = MYSQL_PASS[o.user];
    if (real === undefined) {
      return { res: fail([tool + ': ' + mysqlErr(1045, '28000', "Access denied for user '" + o.user + "'@'" + label + "' (using password: " + (o.passGiven ? 'YES' : 'NO') + ")")]) };
    }
    if (real === null) {
      return { res: fail([tool + ': ' + mysqlErr(1045, '28000', "Access denied for user '" + o.user + "'@'" + label + "' (using password: " + (o.passGiven ? 'YES' : 'NO') + ")"),
        '（教学提示）' + o.user + ' 是 PostgreSQL 的角色名，不是 MySQL 账号 —— 两套数据库的账号体系完全独立。']) };
    }
    if (o.passGiven && o.pass !== null && o.pass !== real) {
      return { res: fail([tool + ': ' + mysqlErr(1045, '28000', "Access denied for user '" + o.user + "'@'" + label + "' (using password: YES)")]) };
    }
    if (!o.passGiven && o.user !== 'root') {
      return { res: fail([tool + ': ' + mysqlErr(1045, '28000', "Access denied for user '" + o.user + "'@'" + label + "' (using password: NO)")]) };
    }
    return { ok: true, label: label, ip: isLocal ? '127.0.0.1' : (MYSQL_HOSTS[o.host] ? MYSQL_HOSTS[o.host].ip : hosts[o.host]) };
  }

  function mysqlRowsToLines(cols, rows, batch) {
    var out = [];
    if (batch) {
      out.push(cols.join('\t'));
      rows.forEach(function (r) { out.push(r.map(function (v) { return v === null || v === undefined ? 'NULL' : String(v); }).join('\t')); });
      return out;
    }
    var w = cols.map(function (c) { return String(c).length; });
    var cells = rows.map(function (r) {
      return r.map(function (v, i) {
        var s = v === null || v === undefined ? 'NULL' : String(v);
        if (s.length > w[i]) w[i] = s.length;
        return s;
      });
    });
    function line(vals) {
      var parts = [];
      for (var k = 0; k < vals.length; k++) parts.push(' ' + padR(vals[k], w[k]) + ' ');
      var s = '|' + parts.join('|') + '|';
      return s;
    }
    var sep = '+';
    for (var i2 = 0; i2 < cols.length; i2++) sep += rep('-', w[i2] + 2) + '+';
    out.push(sep);
    out.push(line(cols.map(String)));
    out.push(sep);
    cells.forEach(function (c) { out.push(line(c)); });
    out.push(sep);
    out.push(rows.length + (rows.length === 1 ? ' row in set' : ' rows in set') + ' (0.00 sec)');
    return out;
  }

  function mysqlLikeRow(line, likeStr) {
    var re = '^';
    for (var i = 0; i < likeStr.length; i++) {
      var ch = likeStr.charAt(i);
      if (ch === '%') re += '.*';
      else if (ch === '_') re += '.';
      else if ('\\^$.|+(){}*?[]'.indexOf(ch) !== -1) re += '\\' + ch;
      else re += ch;
    }
    return new RegExp(re + '$', 'i').test(line);
  }

  /* -e 里的一条 SQL：返回 {out, err, code} */
  function mysqlExecExtra(ctx, HOST, conn, sql) {
    var q = String(sql).trim().replace(/;\s*$/, '');
    if (!q) return ok([]);
    var up = q.toUpperCase();

    if (/^SET\s+GLOBAL\s+/i.test(q)) {
      var mset = q.match(/^SET\s+GLOBAL\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
      if (!mset) return fail([mysqlErr(1064, '42000', "You have an error in your SQL syntax near '" + q.slice(0, 40) + "'")]);
      var name = mset[1].toLowerCase(), val = String(mset[2]).trim().replace(/^'(.*)'$/, '$1');
      if (MYSQL_VARS[name] === undefined) {
        return fail([mysqlErr(1193, 'HY000', "Unknown system variable '" + name + "'")]);
      }
      MYSQL_VARS[name] = val;
      var hints = [];
      if (name === 'max_connections') hints.push('（教学提示）SET GLOBAL 改的是运行时值，**重启就丢**；要持久化必须写进 /etc/my.cnf 的 [mysqld] 段。另外已建立的连接不受影响，新连接才按新值算。');
      if (name === 'innodb_print_all_deadlocks') hints.push('（教学提示）打开后所有死锁都会写进 error log（默认只保留最近一次在 SHOW ENGINE INNODB STATUS 里），事后排查历史死锁就靠它。');
      if (name === 'slow_query_log' || name === 'long_query_time') hints.push('（教学提示）慢日志参数改动即时生效但重启失效；long_query_time 单位是秒（可以带小数），生产常设 0.5~1，设太小会让日志暴涨。');
      if (name === 'replica_parallel_workers') hints.push('（教学提示）并行复制线程数改完要 STOP REPLICA / START REPLICA 才生效 —— 回放线程是在启动时按这个参数创建的。');
      if (name === 'max_allowed_packet') hints.push('（教学提示）max_allowed_packet 是**会话级**参数，SET GLOBAL 只影响之后建立的连接；导入大文件时更稳的做法是客户端也加 --max_allowed_packet=256M。');
      return okHint([], hints);
    }

    if (/^SET\s+SESSION\s+/i.test(q) || /^SET\s+NAMES\s+/i.test(q) || /^SET\s+@@/i.test(q)) {
      return okHint([], ['（教学提示）会话级 SET 只影响当前连接（本站仿真不保留连接状态）；要全局生效用 SET GLOBAL，要持久化写 my.cnf。']);
    }

    if (/^SHOW\s+VARIABLES\s+LIKE\s+/i.test(q)) {
      var mv = q.match(/LIKE\s+'([^']*)'/i);
      var like = mv ? mv[1] : '%';
      var names = Object.keys(MYSQL_VARS).filter(function (k) { return mysqlLikeRow(k, like); }).sort();
      var rows = names.map(function (k) { return [k, MYSQL_VARS[k]]; });
      if (!rows.length) return ok(['Empty set (0.00 sec)']);
      return ok(mysqlRowsToLines(['Variable_name', 'Value'], rows, conn.batch));
    }

    if (/^SHOW\s+(GLOBAL\s+)?STATUS\s+LIKE\s+/i.test(q)) {
      var ms2 = q.match(/LIKE\s+'([^']*)'/i);
      var like2 = ms2 ? ms2[1] : '%';
      var keys = Object.keys(MYSQL_STATUS).filter(function (k) { return mysqlLikeRow(k, like2); }).sort();
      var rows2 = keys.map(function (k) { return [k, MYSQL_STATUS[k]]; });
      if (!rows2.length) return ok(['Empty set (0.00 sec)']);
      return ok(mysqlRowsToLines(['Variable_name', 'Value'], rows2, conn.batch));
    }

    if (/^SHOW\s+(FULL\s+)?PROCESSLIST/i.test(q) || /FROM\s+information_schema\.processlist/i.test(q)) {
      var list = MYSQL_PROCESSLIST.slice();
      var isFull = /SHOW\s+FULL/i.test(q);
      var mwhere = q.match(/command\s*(<>|!=|=)\s*'([^']*)'/i);
      if (mwhere) {
        var neg = mwhere[1] !== '=';
        list = list.filter(function (r) { return neg ? r.COMMAND !== mwhere[2] : r.COMMAND === mwhere[2]; });
      }
      var isCount = /COUNT\s*\(\s*\*\s*\)/i.test(q);
      if (isCount) {
        var alias = (q.match(/AS\s+([A-Za-z_][A-Za-z0-9_]*)/i) || [])[1] || 'COUNT(*)';
        var all = MYSQL_PROCESSLIST.filter(function (r) { return mwhere ? (mwhere[1] !== '=' ? r.COMMAND !== mwhere[2] : r.COMMAND === mwhere[2]) : true; });
        return ok(mysqlRowsToLines([alias], [[all.length]], conn.batch));
      }
      var cols = ['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info'];
      var rows3 = list.map(function (r) {
        var info = r.INFO;
        if (info && !isFull && info.length > 100) info = info.slice(0, 100);
        return [r.Id, r.USER, r.HOST, r.DB, r.COMMAND, r.TIME, r.STATE, info];
      });
      return okHint(mysqlRowsToLines(cols, rows3, conn.batch), [
        '（教学提示）三个关键判读：① Command=Sleep 且 Time 很大 = 连接池空闲连接白占连接数；' +
        '② State=Waiting for table metadata lock = 有人在等 DDL 的元数据锁（通常是长事务没提交）；' +
        '③ Time 很大且 State=Sending data/Copying to tmp table = 慢 SQL 正在扫大量数据。' +
        '不加 FULL 时 Info 只显示前 100 个字符，排障一律用 SHOW FULL PROCESSLIST。'
      ]);
    }

    if (/FROM\s+sys\.innodb_lock_waits/i.test(q)) {
      return okHint(mysqlRowsToLines(
        ['waiting_pid', 'waiting_query', 'blocking_pid', 'blocking_query'],
        [[41244, 'ALTER TABLE orders ADD INDEX idx_user_status (user_id, status), ALGORITHM=INPLACE, LOCK=NONE', 41237, "SELECT COUNT(*) FROM order_status_log WHERE order_id = 8812 AND status = 'PAID'"]],
        conn.batch
      ), ['（教学提示）sys.innodb_lock_waits 直接给出"谁挡住了谁"，比猜表锁快得多；blocking_pid 就是元凶，确认后用 KILL 掉它（先看它的 SQL 是不是重要事务）。']);
    }

    if (/^SHOW\s+ENGINE\s+INNODB\s+STATUS/i.test(q)) {
      return okHint(INNODB_STATUS.slice(), ['（教学提示）重点看三段：LATEST DETECTED DEADLOCK（最近一次死锁的两个事务）、TRANSACTIONS（ACTIVE ... seconds 就是长事务）、BUFFER POOL AND MEMORY（命中率与 History list length）。默认只留最近一次死锁，想全留档要开 innodb_print_all_deadlocks=ON。']);
    }

    if (/^SHOW\s+(REPLICA|SLAVE)\s+STATUS/i.test(q)) {
      var keys2 = Object.keys(REPLICA_STATUS);
      var out2 = [];
      keys2.forEach(function (k, i) {
        out2.push(padR('*************************** ' + (i + 1) + '. row ' + '***************************', 60));
        out2.push(padR(k + ':', 34) + (REPLICA_STATUS[k] === null ? 'NULL' : String(REPLICA_STATUS[k])));
      });
      out2.push(keys2.length + ' row in set (0.00 sec)');
      return okHint(out2, [
        '（教学提示）**SQL 线程已停**（Replica_SQL_Running: No，Last_SQL_Errno: 1062 主键冲突），所以 Seconds_Behind_Master 是 NULL（不是 0，也不是很大）—— ' +
        'NULL 表示复制线程没在跑，只看秒数会误判成"没延迟"。\n' +
        '排查顺序：① 先分清 IO 线程断（Connecting：网络/防火墙/账号/GET_SOURCE_PUBLIC_KEY）还是 SQL 线程断（No：Last_SQL_Error 里的主键冲突/表不存在）；' +
        '② 对比 Retrieved_Gtid_Set 与 Executed_Gtid_Set 估算积压量；③ 主库 SHOW MASTER STATUS 确认 binlog 位点还在不在。'
      ]);
    }

    if (/^SHOW\s+(MASTER|BINARY\s+LOG)\s+STATUS/i.test(q)) {
      return ok(mysqlRowsToLines(['File', 'Position', 'Binlog_Do_DB', 'Binlog_Ignore_DB', 'Executed_Gtid_Set'],
        [['mysql-bin.000042', 918273645, '', '', 'a1b4c7d9-e206-11ee-8f3c-1a724d5e4b91:1-184211']], conn.batch));
    }

    if (/^SHOW\s+GRANTS/i.test(q)) {
      var mg = q.match(/FOR\s+'([^']+)'@'([^']+)'/i);
      var who = mg ? { u: mg[1], h: mg[2] } : { u: conn.user, h: 'localhost' };
      var lines = ['GRANT USAGE ON *.* TO `' + who.u + '`@`' + who.h + '`'];
      if (who.u === 'app') {
        lines = [
          "GRANT SELECT, INSERT, UPDATE, DELETE ON `orders`.* TO `app`@`" + who.h + "`",
          'GRANT USAGE ON *.* TO `app`@`' + who.h + '`'
        ];
      } else if (who.u === 'backup') {
        lines = ["GRANT SELECT ON `orders`.* TO `backup`@`" + who.h + "`", 'GRANT USAGE ON *.* TO `backup`@`' + who.h + '`'];
      } else if (who.u === 'monitor') {
        lines = ['GRANT PROCESS, REPLICATION CLIENT ON *.* TO `monitor`@`' + who.h + '`', 'GRANT USAGE ON *.* TO `monitor`@`' + who.h + '`'];
      } else if (who.u === 'root') {
        lines = ['GRANT ALL PRIVILEGES ON *.* TO `root`@`' + who.h + '` WITH GRANT OPTION', 'GRANT PROXY ON \'\'@\'\' TO `root`@`' + who.h + '` WITH GRANT OPTION'];
      }
      return ok(lines);
    }

    if (/^SHOW\s+INDEX\s+FROM/i.test(q) || /FROM\s+information_schema\.statistics/i.test(q)) {
      var mt = q.match(/FROM\s+([A-Za-z_][A-Za-z0-9_.]*)/i);
      var tbl = mt ? mt[1] : 'orders';
      var base = tbl.indexOf('.') !== -1 ? tbl.split('.')[1] : tbl;
      var cols3 = /statistics/i.test(q) ? ['index_name', 'seq_in_index', 'column_name', 'cardinality'] : ['Table', 'Non_unique', 'Key_name', 'Seq_in_index', 'Column_name', 'Collation', 'Cardinality', 'Index_type'];
      var rows4;
      if (cols3[0] === 'index_name') {
        rows4 = [['PRIMARY', 1, 'id', 18204412], ['idx_user_status', 1, 'user_id', 982140], ['idx_user_status', 2, 'status', 1842], ['idx_created_at', 1, 'created_at', 18204412]];
      } else {
        rows4 = [
          [base, 0, 'PRIMARY', 1, 'id', 'A', 18204412, 'BTREE'],
          [base, 1, 'idx_user_status', 1, 'user_id', 'A', 982140, 'BTREE'],
          [base, 1, 'idx_user_status', 2, 'status', 'A', 1842, 'BTREE'],
          [base, 1, 'idx_created_at', 1, 'created_at', 'A', 18204412, 'BTREE']
        ];
      }
      return okHint(mysqlRowsToLines(cols3, rows4, conn.batch), [
        '（教学提示）Cardinality 是**估算**的基数（越大区分度越高，接近 0 说明索引几乎没用）；Seq_in_index 是联合索引的列顺序 —— ' +
        'idx_user_status (user_id, status) 能命中 WHERE user_id=? AND status=?，但命中不了只按 status 查（最左前缀原则）。'
      ]);
    }

    if (/FROM\s+information_schema\.tables/i.test(q)) {
      var rows5;
      if (/engine\s*<>\s*'InnoDB'/i.test(q)) {
        rows5 = [];
        return ok(rows5.length ? mysqlRowsToLines(['TABLE_NAME', 'ENGINE'], rows5, conn.batch) : ['Empty set (0.00 sec)']);
      }
      if (/size_mb/i.test(q)) {
        rows5 = MYSQL_TABLE_STATS.slice().sort(function (a, b) { return b.DATA_LENGTH - a.DATA_LENGTH; }).map(function (t) {
          return [t.TABLE_NAME, ((t.DATA_LENGTH + t.INDEX_LENGTH) / 1048576).toFixed(1), (t.DATA_FREE / 1048576).toFixed(1), t.TABLE_ROWS];
        });
        return okHint(mysqlRowsToLines(['table_name', 'size_mb', 'free_mb', 'table_rows'], rows5, conn.batch),
          ['（教学提示）DATA_FREE 很大说明表里有大量空洞（删除/更新留下的），要 OPTIMIZE TABLE 回收；但 TABLE_ROWS 对 InnoDB 是**估算值**，误差可能几倍，别拿它当精确行数。']);
      }
      rows5 = MYSQL_TABLE_STATS.map(function (t) { return [t.TABLE_NAME, t.TABLE_ROWS]; });
      return ok(mysqlRowsToLines(['table_name', 'table_rows'], rows5, conn.batch));
    }

    if (/FROM\s+mysql\.user/i.test(q)) {
      var cols4 = ['user', 'host', 'account_locked'];
      if (/plugin/i.test(q)) cols4.push('plugin');
      var rows6 = MYSQL_USER_ROWS.slice();
      if (/ORDER\s+BY\s+user/i.test(q)) rows6.sort(function (a, b) { return a.user < b.user ? -1 : 1; });
      return ok(mysqlRowsToLines(cols4, rows6.map(function (r) { return cols4.map(function (c) { return r[c]; }); }), conn.batch));
    }

    if (/FROM\s+mysql\.db/i.test(q)) {
      var rows7 = MYSQL_USER_ROWS.map(function (r) { return [r.user, r.host, 'orders', r.Select_priv, r.Insert_priv, r.Update_priv, r.Delete_priv]; });
      return ok(mysqlRowsToLines(['user', 'host', 'db', 'Select_priv', 'Insert_priv', 'Update_priv', 'Delete_priv'], rows7, conn.batch));
    }

    if (/FROM\s+performance_schema\.replication_group_members/i.test(q)) {
      return okHint(mysqlRowsToLines(['MEMBER_HOST', 'MEMBER_STATE'], [['db-prod-01', 'ONLINE'], ['db-prod-02', 'ONLINE'], ['db-prod-03', 'RECOVERING']], conn.batch),
        ['（教学提示）本站 db-prod-01 是**主从复制**架构（不是 MGR 组复制），这张视图在真机上通常为空 —— ' +
        '两种架构的排查命令完全不同：主从看 SHOW REPLICA STATUS，MGR 看 replication_group_members 与 performance_schema.replication_group_member_stats。']);
    }

    if (/^EXPLAIN\s+FOR\s+CONNECTION/i.test(q)) {
      var mc = q.match(/CONNECTION\s+(\d+)/i);
      return okHint(mysqlRowsToLines(['id', 'select_type', 'table', 'partitions', 'type', 'possible_keys', 'key', 'key_len', 'ref', 'rows', 'filtered', 'Extra'],
        [[1, 'SIMPLE', 'order_status_log', null, 'ALL', null, null, null, null, 52118330, 10.00, 'Using where']], conn.batch),
        ['（教学提示）EXPLAIN FOR CONNECTION ' + (mc ? mc[1] : '<Id>') + ' 可以直接看**正在运行**的慢 SQL 的执行计划，不用等它跑完 —— ' +
        '这就是排查"线上正在卡的语句"的标准手段：先 SHOW FULL PROCESSLIST 拿 Id，再 EXPLAIN FOR CONNECTION <Id>。']);
    }

    if (/^EXPLAIN/i.test(q)) {
      if (/FORMAT\s*=\s*JSON/i.test(q)) {
        return ok([JSON.stringify({
          query_block: {
            select_id: 1,
            cost_info: { query_cost: '3684214.20' },
            table: {
              table_name: 'order_status_log',
              access_type: 'ALL', possible_keys: ['idx_order_id'], key: null, used_key_parts: null,
              rows_examined_per_scan: 52118330, rows_produced_per_join: 5211833, filtered: '10.00',
              cost_info: { read_cost: '3680000.00', eval_cost: '521183.30', prefix_cost: '4201183.30', data_read_per_join: '416M' },
              used_columns: ['id', 'order_id', 'status', 'created_at']
            }
          }
        }, null, 1)]);
      }
      if (/ANALYZE/i.test(q)) {
        var isJoin = /JOIN/i.test(q);
        if (isJoin) {
          return okHint([
            '-> Nested loop inner join  (cost=4211884 rows=1842110) (actual time=0.512..3218.442 rows=1842110 loops=1)',
            '    -> Filter: (o.created_at >= TIMESTAMP\'2024-03-01 00:00:00\')  (cost=1842110 rows=4211884) (actual time=0.408..1842.114 rows=4211884 loops=1)',
            '        -> Table scan on o  (cost=1842110 rows=18204412) (actual time=0.312..1204.882 rows=18204412 loops=1)',
            '    -> Index lookup on u using PRIMARY (id=o.user_id)  (cost=0.35 rows=1) (actual time=0.0004..0.0004 rows=1 loops=4211884)'
          ], ['（教学提示）**实际行数（actual rows）与估算（cost=... rows=...）差很多**说明统计信息不准 —— ' +
            '`ANALYZE TABLE orders;` 刷新统计信息后再 EXPLAIN，执行计划往往会变好。这里真正的瓶颈是第一步全表扫了 1820 万行。']);
        }
        return okHint([
          '-> Filter: ((orders.user_id = 8812) and (orders.status = \'PAID\'))  (cost=1842110 rows=1842) (actual time=2841.114..3184.882 rows=1 loops=1)',
          '    -> Table scan on orders  (cost=1842110 rows=18204412) (actual time=0.412..2841.002 rows=18204412 loops=1)'
        ], ['（教学提示）Table scan = 全表扫描（没走索引）。这条 SQL 用 user_id + status 查询，而 orders 表上只有 PRIMARY 与 idx_created_at —— ' +
          '要么建 idx_user_status (user_id, status)，要么检查是不是查询写法让索引失效（函数包列、隐式类型转换、前导通配 LIKE）。']);
      }
      var mex = q.match(/FROM\s+([A-Za-z_][A-Za-z0-9_]*)/i);
      var table = mex ? mex[1] : 'orders';
      var usedIndex = /status/i.test(q) && /user_id/i.test(q);
      return okHint(mysqlRowsToLines(['id', 'select_type', 'table', 'partitions', 'type', 'possible_keys', 'key', 'key_len', 'ref', 'rows', 'filtered', 'Extra'],
        [[1, 'SIMPLE', table, null, usedIndex ? 'ref' : 'ALL', usedIndex ? 'idx_user_status' : null, usedIndex ? 'idx_user_status' : null,
          usedIndex ? '8' : null, usedIndex ? 'const,const' : null, usedIndex ? 1842 : 18204412, usedIndex ? 100.00 : 10.00,
          usedIndex ? 'Using index condition' : 'Using where']], conn.batch),
        ['（教学提示）重点看 type（ALL 全表扫描最差 → index → range → ref → eq_ref → const 依次更好）、' +
        'key（NULL 就是没走索引）、rows（**预估**扫描行数）、Extra（Using filesort 排序用不上索引、Using temporary 用了临时表、Using index 覆盖索引）。' +
        '要看**实际**耗时与行数必须用 EXPLAIN ANALYZE（8.0.18 起），它会把 SQL 真的执行一遍。']);
    }

    if (/^SHOW\s+DATABASES/i.test(q)) {
      return ok(mysqlRowsToLines(['Database'], Object.keys(MYSQL_DBS).sort().map(function (d) { return [d]; }), conn.batch));
    }
    if (/^SHOW\s+TABLES/i.test(q)) {
      var db4 = conn.db || 'orders';
      var tables = (MYSQL_DBS[db4] || []).slice().sort();
      return ok(mysqlRowsToLines(['Tables_in_' + db4], tables.map(function (t) { return [t]; }), conn.batch));
    }
    if (/^SHOW\s+CREATE\s+TABLE/i.test(q)) {
      var mt2 = q.match(/`?([A-Za-z_][A-Za-z0-9_]*)`?\s*;?$/);
      var tname = mt2 ? mt2[1] : 'orders';
      return ok(mysqlRowsToLines(['Table', 'Create Table'],
        [[tname, "CREATE TABLE `" + tname + "` (\n  `id` bigint NOT NULL,\n  `user_id` bigint NOT NULL,\n  `status` varchar(16) DEFAULT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"]], conn.batch));
    }
    if (/^SHOW\s+WARNINGS/i.test(q)) return ok(['Empty set (0.00 sec)']);
    if (/^SHOW\s+ENGINE/i.test(q)) return ok(mysqlRowsToLines(['Engine', 'Support', 'Comment', 'Transactions'], [['InnoDB', 'DEFAULT', 'Supports transactions, row-level locking, and foreign keys', 'YES']], conn.batch));

    if (/^(ALTER|CREATE|GRANT|REVOKE|DROP|TRUNCATE|OPTIMIZE|ANALYZE|USE|FLUSH|KILL|RESET|PURGE|START|STOP|CHANGE|REPLICA|BINLOG)\b/i.test(q)) {
      if (/^OPTIMIZE\s+TABLE/i.test(q)) {
        var mt3 = q.match(/TABLE\s+([A-Za-z_][A-Za-z0-9_.]*)/i);
        var tt = mt3 ? mt3[1] : 'orders.orders';
        return okHint(mysqlRowsToLines(['Table', 'Op', 'Msg_type', 'Msg_text'],
          [[tt, 'optimize', 'status', 'OK'], [tt, 'optimize', 'note', 'Table does not support optimize, doing recreate + analyze instead'], [tt, 'optimize', 'status', 'OK']], conn.batch),
          ['（教学提示）InnoDB 的 OPTIMIZE TABLE 实际动作是"重建表 + 重建索引"（等价 ALTER TABLE ... ENGINE=InnoDB）：能回收 DATA_FREE 碎片并刷新统计信息，' +
          '但**会锁表且需要和原表等大的额外磁盘空间** —— orders 表 4GB 就要再准备 4GB，几百 GB 的表在业务时段基本不能跑。']);
      }
      if (/^ANALYZE\s+TABLE/i.test(q)) {
        var mt7 = q.match(/TABLE\s+([A-Za-z_][A-Za-z0-9_.]*)/i);
        var tt7 = mt7 ? mt7[1] : 'orders.orders';
        return okHint(mysqlRowsToLines(['Table', 'Op', 'Msg_type', 'Msg_text'], [[tt7, 'analyze', 'status', 'OK']], conn.batch),
          ['（教学提示）ANALYZE TABLE 只刷新索引统计信息（InnoDB 会采样部分页），不改数据、不锁很久；统计信息过期会让优化器选错执行计划，这是"昨天还快今天就慢"的常见原因。']);
      }
      if (/^(START|STOP)\s+REPLICA/i.test(q) || /^(START|STOP)\s+SLAVE/i.test(q)) {
        var isStop = /^STOP/i.test(q);
        var ioOnly = /IO_THREAD/i.test(q);
        var isSql = /SQL_THREAD/i.test(q);
        if (isStop) {
          if (ioOnly) {
            REPLICA_STATUS.Replica_IO_Running = 'No';
            REPLICA_STATUS.Slave_IO_Running = 'No';
            REPLICA_STATUS.Replica_IO_State = '';
            return okHint([], ['（教学提示）切主库前先 `STOP REPLICA IO_THREAD`：IO 线程停了不再拉新 binlog，等 SQL 线程把 relay log 全部回放完（Exec_Master_Log_Pos 追平 Read_Master_Log_Pos）再切换，这样新主库可以从准确位点接上。']);
          }
          if (isSql) {
            REPLICA_STATUS.Replica_SQL_Running = 'No';
            REPLICA_STATUS.Slave_SQL_Running = 'No';
            REPLICA_STATUS.Slave_SQL_Running_State = '';
            return okHint([], ['（教学提示）SQL 线程停了就不再回放 relay log；本站仿真的从库本来就是 SQL 线程故障状态（Last_SQL_Errno: 1062）。']);
          }
          REPLICA_STATUS.Replica_IO_Running = 'No';
          REPLICA_STATUS.Replica_SQL_Running = 'No';
          REPLICA_STATUS.Slave_IO_Running = 'No';
          REPLICA_STATUS.Slave_SQL_Running = 'No';
          return okHint([], ['（教学提示）两个线程都停了。修数据冲突的标准动作：① 找出冲突行；② 用 sql_slave_skip_counter 或 GTID 方式跳过这个事务（**只在确认可以丢这个事务时**）；③ 或者用 pt-slave-restart 自动跳过。跳过前必须想清楚这一条事务的业务影响。']);
        }
        REPLICA_STATUS.Replica_IO_Running = 'Yes';
        REPLICA_STATUS.Replica_SQL_Running = 'Yes';
        REPLICA_STATUS.Slave_IO_Running = 'Yes';
        REPLICA_STATUS.Slave_SQL_Running = 'Yes';
        REPLICA_STATUS.Seconds_Behind_Master = '0';
        REPLICA_STATUS.Seconds_Behind_Source = '0';
        REPLICA_STATUS.Last_SQL_Errno = 0;
        REPLICA_STATUS.Last_SQL_Error = '';
        REPLICA_STATUS.Slave_SQL_Running_State = 'Replica has read all relay log; waiting for more updates';
        return okHint([], ['（教学提示）本站仿真的从库已恢复：两个线程 Yes、Seconds_Behind_Master 0、Executed_Gtid_Set 追平 Retrieved_Gtid_Set。' +
          '真机上 START REPLICA 之后必须再跑一次 SHOW REPLICA STATUS 确认，不能只看命令返回成功。']);
      }
      if (/^(REPLICA|SLAVE)\s+IO_THREAD|^STOP\s+REPLICA/i.test(q)) return ok([]);
      if (/^CHANGE\s+(REPLICATION\s+SOURCE|MASTER)\s+TO/i.test(q)) {
        var mhost = q.match(/SOURCE_HOST\s*=\s*'([^']+)'/i) || q.match(/MASTER_HOST\s*=\s*'([^']+)'/i);
        var mpos = q.match(/SOURCE_LOG_POS\s*=\s*(\d+)/i) || q.match(/MASTER_LOG_POS\s*=\s*(\d+)/i);
        var mfile = q.match(/SOURCE_LOG_FILE\s*=\s*'([^']+)'/i) || q.match(/MASTER_LOG_FILE\s*=\s*'([^']+)'/i);
        var gtid = /AUTO_POSITION\s*=\s*1/i.test(q);
        var hints5 = [];
        if (gtid) {
          hints5.push('（教学提示）GTID 模式（SOURCE_AUTO_POSITION=1）不用抄位点：从库靠 GTID 集合自己找位置，换主库/重建从库都更省事，是现在的主流做法。' +
            '前提是主从都开了 gtid_mode=ON 且 enforce_gtid_consistency=ON。');
        } else {
          hints5.push('（教学提示）传统位点法要手抄 File/Position（本站示例 ' + (mfile ? mfile[1] : 'mysql-bin.000042') + ':' + (mpos ? mpos[1] : '197') + '），' +
            '抄错会丢数据或重复数据。位点在主库 `SHOW MASTER STATUS`（8.0 新名 SHOW BINARY LOG STATUS）或备份文件头注释里拿。');
        }
        hints5.push('（教学提示）8.0.23 起术语改名：CHANGE MASTER TO → CHANGE REPLICATION SOURCE TO、START SLAVE → START REPLICA、' +
          'SHOW SLAVE STATUS → SHOW REPLICA STATUS；旧写法在 8.0 仍兼容但有废弃警告。');
        if (mhost) hints5.push('（教学提示）源主机是 ' + mhost[1] + '（本站 db-prod-01 = 10.0.2.15）；8.0 用 caching_sha2_password 时复制账号还要 GET_SOURCE_PUBLIC_KEY=1，否则 IO 线程会报认证失败。');
        if (!/STOP\s+REPLICA/i.test(q)) {
          hints5.push('（教学提示）⚠ 真机上"不停复制就改"会报 ERROR 3021（Operation cannot be performed with a running replica io_thread）；' +
            '标准三步是 STOP REPLICA → CHANGE REPLICATION SOURCE TO … → START REPLICA。');
        }
        return okHint([], hints5);
      }
      if (/^CREATE\s+DATABASE/i.test(q)) {
        var mc2 = q.match(/DATABASE\s+(IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z_][A-Za-z0-9_]*)`?/i);
        if (mc2) {
          var nd = mc2[2];
          if (MYSQL_DBS[nd] && !mc2[1]) return fail([mysqlErr(1007, 'HY000', "Can't create database '" + nd + "'; database exists")]);
          if (!MYSQL_DBS[nd]) MYSQL_DBS[nd] = [];
          return okHint([], ['（教学提示）恢复前先建库时字符集要与源库一致（utf8mb4 / utf8mb4_0900_ai_ci），否则恢复后中文可能变问号、跨库 JOIN 会报 "Illegal mix of collations"。']);
        }
      }
      if (/^CREATE\s+USER/i.test(q)) {
        var mu = q.match(/'([^']+)'@'([^']+)'/);
        if (!mu) return fail([mysqlErr(1064, '42000', "You have an error in your SQL syntax near '" + q.slice(0, 40) + "'")]);
        var exists2 = MYSQL_USER_ROWS.filter(function (r) { return r.user === mu[1] && r.host === mu[2]; })[0];
        if (exists2) return fail([mysqlErr(1396, 'HY000', "Operation CREATE USER failed for '" + mu[1] + "'@'" + mu[2] + "'")]);
        MYSQL_USER_ROWS.push({ user: mu[1], host: mu[2], account_locked: 'N', plugin: /mysql_native_password/i.test(q) ? 'mysql_native_password' : 'caching_sha2_password', Select_priv: 'N', Insert_priv: 'N', Update_priv: 'N', Delete_priv: 'N' });
        var uh = ['（教学提示）MySQL 账号是「用户名 + 来源主机」的组合：\'app\'@\'10.0.1.%\' 与 \'app\'@\'localhost\' 是**两个不同的账号**，权限互不相干。' +
          '来源主机尽量写网段而不是 %（% 表示任何 IP 都能来试密码）。'];
        if (/mysql_native_password/i.test(q)) uh.push('（教学提示）mysql_native_password 从 8.0.34 起已标记废弃、8.4 默认关闭；它只是老驱动的过渡方案，长期还是要升级驱动。');
        uh.push('（教学提示）此命令真的改了仿真的 mysql.user：接着 `SELECT user, host, plugin FROM mysql.user;` 就能看到新账号。');
        return okHint([], uh);
      }
      if (/^ALTER\s+USER/i.test(q)) {
        var mau = q.match(/'([^']+)'@'([^']+)'/);
        if (mau) {
          var hit = MYSQL_USER_ROWS.filter(function (r) { return r.user === mau[1] && r.host === mau[2]; })[0];
          if (!hit) return fail([mysqlErr(1396, 'HY000', "Operation ALTER USER failed for '" + mau[1] + "'@'" + mau[2] + "'")]);
        }
        return okHint([], ['（教学提示）改完密码记得同步应用配置与连接池：连接池里已经建立的连接不会立刻失效，验证要用**新建**连接去试（否则会出现"改了密码但业务还正常，重启后全挂"）。']);
      }
      if (/^GRANT/i.test(q)) {
        var mgr = q.match(/ON\s+([^\s]+)\s+TO\s+'([^']+)'@'([^']+)'/i);
        if (mgr) {
          var privs = q.slice(5, q.toUpperCase().indexOf(' ON ')).split(',').map(function (s) { return s.trim().toUpperCase(); });
          var row = MYSQL_USER_ROWS.filter(function (r) { return r.user === mgr[2] && r.host === mgr[3]; })[0];
          if (!row) {
            return fail([mysqlErr(1133, '28000', "Can't find any matching row in the user table"),
              '（教学提示）MySQL 8.0 已移除 `GRANT ... IDENTIFIED BY` 的老写法：必须先 `CREATE USER` 再 `GRANT`，否则就是这个 1133/1064。']);
          }
          if (privs.indexOf('SELECT') !== -1) row.Select_priv = 'Y';
          if (privs.indexOf('INSERT') !== -1) row.Insert_priv = 'Y';
          if (privs.indexOf('UPDATE') !== -1) row.Update_priv = 'Y';
          if (privs.indexOf('DELETE') !== -1) row.Delete_priv = 'Y';
          return okHint([], ['（教学提示）授权已落到仿真的 mysql.user：接着 `SELECT user, host, Select_priv, Delete_priv FROM mysql.user;` 能验证。' +
            '生产上遵循最小权限：应用账号只给 SELECT/INSERT/UPDATE/DELETE，不给 DROP/ALTER，备份账号只给 SELECT。']);
        }
      }
      if (/^REVOKE/i.test(q)) {
        var mrv = q.match(/ON\s+([^\s]+)\s+FROM\s+'([^']+)'@'([^']+)'/i);
        if (mrv) {
          var row2 = MYSQL_USER_ROWS.filter(function (r) { return r.user === mrv[2] && r.host === mrv[3]; })[0];
          if (!row2) return fail([mysqlErr(1141, '42000', "There is no such grant defined for user '" + mrv[2] + "' on host '" + mrv[3] + "'")]);
          var rp = q.slice(6, q.toUpperCase().indexOf(' ON ')).split(',').map(function (s) { return s.trim().toUpperCase(); });
          if (rp.indexOf('DELETE') !== -1) row2.Delete_priv = 'N';
          if (rp.indexOf('SELECT') !== -1) row2.Select_priv = 'N';
          return okHint([], ['（教学提示）REVOKE 的权限名与范围必须和授权时一致（`REVOKE DELETE ON orders.*` 与 `REVOKE DELETE ON *.*` 不是一回事）。回收后建议用 `SHOW GRANTS FOR ...` 复核。']);
        }
      }
      if (/^ALTER\s+TABLE/i.test(q)) {
        var mt4 = q.match(/TABLE\s+([A-Za-z_][A-Za-z0-9_.]*)/i);
        var at = mt4 ? mt4[1] : 'orders';
        var algo = (q.match(/ALGORITHM\s*=\s*([A-Z]+)/i) || [])[1];
        var lockNone = /LOCK\s*=\s*NONE/i.test(q);
        var hints6 = [];
        if (algo === 'INSTANT') hints6.push('（教学提示）ALGORITHM=INSTANT 只改元数据，秒级完成、不锁表 —— 8.0.12 起支持"在表末尾加列"这类操作，是加列的首选。注意它要求列加在**最后**且不能改行格式。');
        else if (algo === 'INPLACE') hints6.push('（教学提示）ALGORITHM=INPLACE 原地重建、不阻塞 DML，但仍要重建表（耗时与表大小相关）。加索引属于 INPLACE。');
        else if (algo === 'COPY') hints6.push('（教学提示）ALGORITHM=COPY 要拷一份完整表，全程锁写 —— 大表上等于停业务。');
        else hints6.push('（教学提示）不写 ALGORITHM 时由 MySQL 自己选（能 INSTANT 就 INSTANT，否则 INPLACE，再不行 COPY）；生产 DDL 建议**显式**写清楚。');
        if (lockNone) hints6.push('（教学提示）LOCK=NONE 表示"要求允许并发读写"：不满足时**直接报错**而不是默默锁表，这正是保护生产的正确用法。');
        hints6.push('（教学提示）超大表（orders 4GB/1800 万行）改结构推荐 pt-online-schema-change：影子表 + 触发器同步增量 + 分批拷贝 + 原子改名，全程几乎不锁表。');
        return okHint(mysqlRowsToLines(['Table', 'Op', 'Msg_type', 'Msg_text'], [[at, 'alter', 'status', 'OK']], conn.batch), hints6);
      }
      if (/^GRANT\s+PROCESS/i.test(q)) return okHint([], ['（教学提示）PROCESS 让监控账号能看**别人**的会话（配合 SHOW PROCESSLIST）；REPLICATION CLIENT 能看主从状态。这两个是监控账号的最小组合，别给 ALL。']);
      if (/^(CREATE|DROP|TRUNCATE|ALTER|OPTIMIZE|ANALYZE|FLUSH|KILL|RESET|PURGE|BINLOG)/i.test(q)) {
        return okHint([], ['（教学提示）DDL / 管理类语句在本站仿真里只做语法识别：语句形式正确就返回成功，不改动仿真的库表结构。']);
      }
      return okHint([], ['（教学提示）这条语句在仿真环境里按"语法正确、执行成功"处理；它不会真的改动虚拟库表结构。']);
    }

    if (/^SELECT\s+VERSION\(\)/i.test(q) || /SELECT\s+@@version/i.test(q)) {
      var cols5 = [], vals5 = [];
      if (/VERSION\(\)/i.test(q) || /@@version\b/i.test(q)) { cols5.push(/VERSION\(\)/i.test(q) ? 'VERSION()' : '@@version'); vals5.push('8.0.36'); }
      if (/@@hostname/i.test(q)) { cols5.push('@@hostname'); vals5.push('web-prod-01'); }
      if (/@@datadir/i.test(q)) { cols5.push('@@datadir'); vals5.push('/var/lib/mysql/'); }
      if (/CONNECTION_ID\(\)/i.test(q)) { cols5.push('CONNECTION_ID()'); vals5.push(44882); }
      if (/DATABASE\(\)/i.test(q)) { cols5.push('DATABASE()'); vals5.push(conn.db || null); }
      return ok(mysqlRowsToLines(cols5, [vals5], conn.batch));
    }

    if (/^SELECT\s+1\s*;?$/i.test(q)) return ok(mysqlRowsToLines(['1'], [[1]], conn.batch));

    if (/^SELECT\s+COUNT\s*\(\s*\*\s*\)\s+FROM\s+order_status_log/i.test(q)) {
      var alias2 = (q.match(/AS\s+([A-Za-z_][A-Za-z0-9_]*)/i) || [])[1] || 'COUNT(*)';
      return okHint(mysqlRowsToLines([alias2], [[184211]], conn.batch),
        ['（教学提示）order_status_log 有 5200 万行且**只增不改、没有索引** —— 按 order_id 查就是全表扫，这正是应用日志里 "query timeout after 5000ms, orderId=8812" 的根因。']);
    }
    if (/^SELECT\s+COUNT\s*\(\s*\*\s*\)\s+FROM\s+(orders|payments|users|order_items)/i.test(q)) {
      var tb = q.match(/FROM\s+([a-z_]+)/i)[1];
      var rowc = MYSQL_TABLE_STATS.filter(function (t) { return t.TABLE_NAME === tb; })[0];
      var alias3 = (q.match(/AS\s+([A-Za-z_][A-Za-z0-9_]*)/i) || [])[1] || 'COUNT(*)';
      return ok(mysqlRowsToLines([alias3], [[rowc ? rowc.TABLE_ROWS : 0]], conn.batch));
    }

    if (/pg_/i.test(q) || /pg_blocking_pids|pg_cancel_backend/i.test(q)) {
      return fail([mysqlErr(1064, '42000', "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '" + q.slice(0, 30) + "' at line 1"),
        '（教学提示）这是 PostgreSQL 的函数/视图（pg_stat_activity、pg_blocking_pids 等），MySQL 里不存在 —— 两套数据库的系统视图与函数完全不同名。' +
        'MySQL 对应的是 information_schema.processlist / sys.innodb_lock_waits / KILL。']);
    }

    if (/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(q)) {
      return okHint([], ['（教学提示）本站仿真只对文档里出现的那些 SQL（SHOW VARIABLES/STATUS、PROCESSLIST、INNODB STATUS、REPLICA STATUS、EXPLAIN、information_schema 查询等）给了**真实感数据**；' +
        '这条语句没有对应的仿真结果集，所以只回成功、不编造行 —— 静默给错结果比不返回更危险。要练手请照着站内示例敲。']);
    }

    return fail([mysqlErr(1064, '42000', "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '" + q.slice(0, 40) + "' at line 1")]);
  }

  /* mysql -e 的扩展 SQL 引擎（shell.js 的 mysqlExec 里没覆盖的语句由这里兜底）。
     返回 {handled:true, out, err, code} 或 {handled:false}（表示"交回 shell.js 自己的实现"）。
     调用约定：shell.js 先跑它自己的分派，拿到 1064/未覆盖 时才调这里。 */
  function mysqlExtra(sql, ctx, HOST, conn) {
    var r = mysqlExecExtra(ctx, HOST, conn || { user: 'root', db: null, batch: false }, sql);
    return { handled: true, out: r.out || [], err: r.err || [], code: r.code === undefined ? 0 : r.code };
  }

  /* ---- mysqladmin ---- */
  function mysqladmin(argv, ctx, stdin, HOST) {
    var o = parseMysqlCommon(argv, null);
    var sub = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.charAt(0) === '-') {
        if (a === '-h' || a === '-P' || a === '-u' || a === '-D' || a === '--connect-timeout' || a === '--socket' || a === '--protocol' || a === '--default-character-set') i++;
        continue;
      }
      if (a === 'ping' || a === 'status' || a === 'processlist' || a === 'extended-status' || a === 'variables' ||
        a === 'version' || a === 'create' || a === 'drop' || a === 'shutdown' || a === 'flush-logs' || a === 'flush-tables' ||
        a === 'flush-privileges' || a === 'reload' || a === 'refresh' || a === 'kill' || a === 'password' || a === 'debug' || a === 'proc' || a === 'status2') { sub = a; break; }
    }
    if (!sub) {
      return fail(['mysqladmin: unknown command or missing command',
        '（教学提示）用法：mysqladmin -h <主机> -u <用户> -p <子命令>；常用：ping / status / processlist / extended-status / variables / version / flush-logs / create <库> / drop <库>。']);
    }
    var conn = mysqlConnect(ctx, HOST, o, 'mysqladmin');
    if (conn.res) return conn.res;

    if (sub === 'ping') return ok(['mysqld is alive']);
    if (sub === 'version') return ok(['mysqladmin  Ver 8.0.36 for Linux on x86_64 (MySQL Community Server - GPL)',
      'Server version\t\t8.0.36', 'Protocol version\t10', 'Connection\t\t' + (o.host || 'localhost') + ' via TCP/IP']);
    if (sub === 'status') {
      return okHint(['Uptime: 172040  Threads: 182  Questions: 18421104  Slow queries: 1842  Opens: 184211  Flush tables: 3  Open tables: 2048  Queries per second avg: 107.080'],
        ['（教学提示）这一行里有三个容量信号：Threads（当前连接数，本站 max_connections=1000，用到 80% 就该告警）、' +
        'Slow queries（慢查询计数，和 SHOW STATUS LIKE \'Slow_queries\' 是同一个值）、Queries per second avg（平均 QPS）。' +
        '真机 status 是**瞬时**快照，脚本里想算区间 QPS 要自己前后对比 Questions。']);
    }
    if (sub === 'processlist') {
      var rows = MYSQL_PROCESSLIST.map(function (r) { return [r.Id, r.USER, r.HOST, r.DB, r.COMMAND, r.TIME, r.STATE, r.INFO]; });
      return okHint(mysqlBox(['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info'], rows),
        ['（教学提示）Command=Sleep 且 Time 很大的行就是**连接池的空闲连接**：它们白占着 max_connections 名额，' +
        '配合 wait_timeout（本站 28800 秒 = 8 小时）意味着这种连接会挂很久。连接堆积先查这里。']);
    }
    if (sub === 'extended-status') {
      var keys = Object.keys(MYSQL_STATUS).sort();
      return okHint(mysqlBox(['Variable_name', 'Value'], keys.map(function (k) { return [k, MYSQL_STATUS[k]]; })),
        ['（教学提示）extended-status 等价于 `SHOW GLOBAL STATUS`，几百行；脚本里请直接 grep 需要的指标：' +
        '`mysqladmin -h db-prod-01 -u root -p extended-status | grep -E "Threads_connected|Threads_running|Aborted_clients"`。']);
    }
    if (sub === 'variables') {
      var vk = Object.keys(MYSQL_VARS).sort();
      return okHint(mysqlBox(['Variable_name', 'Value'], vk.map(function (k) { return [k, MYSQL_VARS[k]]; })),
        ['（教学提示）variables 是**运行时**值；要确认持久化配置得看 /etc/my.cnf，两者不一致就是"重启后参数变了"的常见原因。']);
    }
    if (sub === 'create' || sub === 'drop') {
      var dbArg = null;
      for (var j = 0; j < argv.length; j++) {
        var b = String(argv[j]);
        if (b === '-h' || b === '-P' || b === '-u' || b === '-D' || b === '--connect-timeout') { j++; continue; }
        if (b.charAt(0) !== '-' && b !== sub) dbArg = b;
      }
      if (!dbArg) return fail(['mysqladmin: ' + sub + ' requires a database name']);
      if (sub === 'create') {
        if (MYSQL_DBS[dbArg]) return fail(['mysqladmin: CREATE DATABASE failed; error: \'Can\'t create database \'' + dbArg + '\'; database exists\'']);
        MYSQL_DBS[dbArg] = [];
        return okHint([], ['（教学提示）建库时最好显式指定字符集（`--default-character-set=utf8mb4` 或 SQL 里写 CHARACTER SET），不指定就跟随 server 的 character_set_server，跨环境迁移时容易踩字符集坑。']);
      }
      if (!MYSQL_DBS[dbArg]) return fail(['mysqladmin: DROP DATABASE failed; error: \'Can\'t drop database \'' + dbArg + '\'; database doesn\'t exist\'']);
      delete MYSQL_DBS[dbArg];
      return okHint([], ['（教学提示）drop 是不可逆的（库里的表和数据一起没）；生产上先确认有没有备份、有没有应用还在连它。']);
    }
    if (sub === 'flush-logs') {
      return okHint([], ['（教学提示）flush-logs 会切换 binlog（生成下一个 mysql-bin.0000NN）并重开慢日志/错误日志文件句柄 —— ' +
        '做时间点恢复（PITR）前先切一次，恢复时"从哪个 binlog 的哪个位置开始"更清楚。']);
    }
    if (sub === 'flush-tables' || sub === 'reload' || sub === 'refresh' || sub === 'flush-privileges') {
      return okHint([], ['（教学提示）flush-privileges 是 FLUSH PRIVILEGES 的等价写法：直接改 mysql.user 表之后必须执行它才生效（用 CREATE USER/GRANT 语句改则自动生效）。']);
    }
    if (sub === 'shutdown' || sub === 'kill' || sub === 'password') {
      return fail(['（教学提示）`mysqladmin ' + sub + '` 会真的关库 / 杀会话 / 改密码，教学环境**不执行**这类破坏性操作。' +
        (sub === 'shutdown' ? '关库前必须确认：主从关系、应用连接、有没有没提交的长事务。' :
          sub === 'kill' ? '杀会话前先用 SHOW FULL PROCESSLIST 看清它正在跑什么 SQL。' :
            '改密码要用 ALTER USER，并且同步应用配置与连接池。')]);
    }
    return fail(['mysqladmin: unknown command \'' + sub + '\'',
      '（教学提示）本站已实现：ping / status / processlist / extended-status / variables / version / create / drop / flush-logs / flush-tables / flush-privileges。']);
  }

  /* ---- mysqldump ---- */
  function mysqldump(argv, ctx, stdin, HOST) {
    var o = parseMysqlCommon(argv, null);
    var dbs = [], tables = [];
    var allDbs = o.args.indexOf('-A') !== -1 || o.args.indexOf('--all-databases') !== -1;
    var withDatabases = o.args.indexOf('--databases') !== -1;
    var afterDatabases = false;
    var unknown = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h' || a === '-P' || a === '-u' || a === '-D' || a === '-p') { if (a === '-p') continue; i++; continue; }
      if (a.indexOf('-p') === 0 && a.length > 2 && a.indexOf('--') !== 0) continue;
      if (a === '--connect-timeout' || a === '--max_allowed_packet' || a === '--default-character-set' || a === '--socket' || a === '--protocol' || a === '--set-gtid-purged' || a === '--source-data' || a === '--master-data') { i++; continue; }
      if (a === '--databases') { afterDatabases = true; continue; }
      if (a.charAt(0) === '-') {
        if (['--single-transaction', '--routines', '--triggers', '--events', '--no-data', '--no-create-info', '--quick', '-q', '--skip-lock-tables', '--hex-blob', '-A', '--all-databases', '--databases', '--set-gtid-purged=OFF', '--source-data=2', '--master-data=2', '--skip-extended-insert', '--compact'].indexOf(a) === -1) {
          if (a.indexOf('--set-gtid-purged=') !== 0 && a.indexOf('--source-data=') !== 0 && a.indexOf('--master-data=') !== 0) unknown = a;
        }
        continue;
      }
      /* 位置参数：`--databases` 之后的全是库名；否则第一个是库名、其余是表名 */
      if (afterDatabases) { dbs.push(a); continue; }
      if (!o.db) { o.db = a; dbs.push(a); }
      else tables.push(a);
    }
    if (unknown) {
      return fail(['mysqldump: [ERROR] unknown option \'' + unknown + '\'',
        '（教学提示）mysqldump 的参数写错会直接退出（不会"忽略未知参数"）。常用组合：--single-transaction --routines --triggers --events；只导结构加 --no-data，只导数据加 --no-create-info。']);
    }
    if (!allDbs && !dbs.length) {
      return fail(['mysqldump: [ERROR] No database selected',
        '（教学提示）必须指定库：`mysqldump ... --databases orders`、`mysqldump ... orders`（不带 --databases 时文件里没有 CREATE DATABASE/USE）或 `-A`（全部库）。']);
    }
    var conn = mysqlConnect(ctx, HOST, o, 'mysqldump');
    if (conn.res) return conn.res;

    var targetDbs = allDbs ? Object.keys(MYSQL_DBS).filter(function (d) { return d !== 'information_schema' && d !== 'performance_schema' && d !== 'sys'; }) : dbs;
    for (var d = 0; d < targetDbs.length; d++) {
      if (!MYSQL_DBS[targetDbs[d]]) {
        return fail(['mysqldump: Got error: 1049: Unknown database \'' + targetDbs[d] + '\' when selecting the database',
          '（教学提示）库名写错，或这个实例上确实没有这个库。先用 `mysql -h ' + (o.host || 'localhost') + ' -u ' + o.user + ' -p -e "SHOW DATABASES"` 确认。']);
      }
    }

    var lines = [
      '-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)',
      '--',
      '-- Host: ' + (o.host || 'localhost') + '    Database: ' + targetDbs.join(' ') ,
      '-- ------------------------------------------------------',
      '-- Server version\t8.0.36',
      ''
    ];
    if (o.args.indexOf('--source-data=2') !== -1 || o.args.indexOf('--master-data=2') !== -1 || o.args.indexOf('--source-data') !== -1 || o.args.indexOf('--master-data') !== -1) {
      lines.push('--');
      lines.push('-- Position to start replication or point-in-time recovery from');
      lines.push('--');
      lines.push('-- CHANGE MASTER TO MASTER_LOG_FILE=\'mysql-bin.000042\', MASTER_LOG_POS=918273645;');
      lines.push('');
    }
    if (o.args.indexOf('--set-gtid-purged=OFF') !== -1) {
      lines.push('-- SET @@GLOBAL.GTID_PURGED 已按 --set-gtid-purged=OFF 省略（GTID 环境导入时才不会报错）');
      lines.push('');
    }
    var noData = o.args.indexOf('--no-data') !== -1;
    var noCreate = o.args.indexOf('--no-create-info') !== -1;
    targetDbs.forEach(function (db) {
      if (allDbs || withDatabases) {
        lines.push('--');
        lines.push('-- Current Database: `' + db + '`');
        lines.push('--');
        lines.push('');
        lines.push('CREATE DATABASE /*!32312 IF NOT EXISTS*/ `' + db + '` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */;');
        lines.push('');
        lines.push('USE `' + db + '`;');
        lines.push('');
      }
      var tl = tables.length && !allDbs ? tables : (MYSQL_DBS[db] || []);
      tl.forEach(function (t) {
        var stat = MYSQL_TABLE_STATS.filter(function (x) { return x.TABLE_NAME === t; })[0];
        if (!noCreate) {
          lines.push('--');
          lines.push('-- Table structure for table `' + t + '`');
          lines.push('--');
          lines.push('');
          lines.push('DROP TABLE IF EXISTS `' + t + '`;');
          lines.push('CREATE TABLE `' + t + '` (');
          lines.push('  `id` bigint NOT NULL,');
          lines.push('  `user_id` bigint DEFAULT NULL,');
          lines.push('  `status` varchar(16) DEFAULT NULL,');
          lines.push('  `amount` decimal(12,2) DEFAULT NULL,');
          lines.push('  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,');
          lines.push('  PRIMARY KEY (`id`),');
          lines.push('  KEY `idx_user_status` (`user_id`,`status`)');
          lines.push(') ENGINE=InnoDB' + (stat ? ' AUTO_INCREMENT=' + (stat.TABLE_ROWS + 1) : '') + ' DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci' +
            (stat ? ' COMMENT=\'' + stat.TABLE_COMMENT + '\'' : '') + ';');
          lines.push('');
        }
        if (!noData) {
          lines.push('--');
          lines.push('-- Dumping data for table `' + t + '`');
          lines.push('--');
          lines.push('');
          lines.push('LOCK TABLES `' + t + '` WRITE;');
          lines.push('/*!40000 ALTER TABLE `' + t + '` DISABLE KEYS */;');
          lines.push('INSERT INTO `' + t + '` VALUES (8812,100234,\'PAID\',1240.00,\'2024-03-18 09:41:18\'),(8813,100918,\'PAID\',860.00,\'2024-03-18 09:41:19\');');
          lines.push('/*!40000 ALTER TABLE `' + t + '` ENABLE KEYS */;');
          lines.push('UNLOCK TABLES;');
          lines.push('');
        }
      });
      if (o.args.indexOf('--routines') !== -1) {
        lines.push('--');
        lines.push('-- Dumping routines for database \'' + db + '\'');
        lines.push('--');
        lines.push('DELIMITER ;;');
        lines.push('CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_close_order`(IN p_id BIGINT)');
        lines.push('BEGIN');
        lines.push("  UPDATE orders SET status='CLOSED' WHERE id=p_id;");
        lines.push('END ;;');
        lines.push('DELIMITER ;');
        lines.push('');
      }
      if (o.args.indexOf('--events') !== -1) {
        lines.push('--');
        lines.push('-- Dumping events for database \'' + db + '\'');
        lines.push('--');
        lines.push('');
      }
      if (o.args.indexOf('--triggers') !== -1) {
        lines.push('--');
        lines.push('-- Dumping triggers for database \'' + db + '\'');
        lines.push('--');
        lines.push('');
      }
    });
    lines.push('-- Dump completed on 2024-03-18  9:52:41');
    var hints = [];
    if (o.args.indexOf('--single-transaction') === -1 && !noData) {
      hints.push('（教学提示）没加 --single-transaction：备份期间会加全局读锁（FLUSH TABLES WITH READ LOCK），线上会造成写入阻塞，生产逻辑备份必须加上它。');
    }
    hints.push('（教学提示）本站仿真把 dump 内容写进了虚拟文件系统 —— 可以直接 `head` / `grep` 看它，配合 `--no-data`、`--databases` 等参数能对比出文件差异。' +
      '真机上这份文件是几百 GB 级，注意 /data 盘的剩余空间。');
    return okHint(lines, hints);
  }

  /* ---- mydumper / myloader ---- */
  function mydumperCmd(argv, ctx, stdin, HOST) {
    var o = { host: null, user: 'root', pass: null, passGiven: false, db: null, dir: null, threads: 4, tables: [], compress: false };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h') o.host = String(argv[++i] || '');
      else if (a === '-u') o.user = String(argv[++i] || '');
      else if (a === '-p') { o.passGiven = true; o.pass = String(argv[++i] === undefined ? '' : argv[i]); }
      else if (a === '-B') o.db = String(argv[++i] || '');
      else if (a === '-o' || a === '-d') o.dir = String(argv[++i] || '');
      else if (a === '-t') o.threads = Number(argv[++i] || 4);
      else if (a === '-T') o.tables = String(argv[++i] || '').split(',').filter(Boolean);
      else if (a === '-c' || a === '-G' || a === '-E' || a === '-R' || a === '-o') { /* flags */ }
      else if (a === '-v') { o.verbose = true; if (argv[i + 1] && isDigits(argv[i + 1])) i++; }
      else if (a === '-S' || a === '-P' || a === '-x' || a === '-M' || a === '-F' || a === '-r' || a === '-s' || a === '-L' || a === '-i') i++;
      else if (a.charAt(0) !== '-') { if (!o.db) o.db = a; }
    }
    if (!o.host) return fail(['mydumper: Please specify host with -h', '（教学提示）mydumper 不会默认连本机，必须显式 -h（与 mysqldump 不同）。']);
    if (!o.db) return fail(['mydumper: Please specify database with -B', '（教学提示）用法：mydumper -h <主机> -u <用户> -p <密码> -B <库> -o <输出目录> -t <线程数>']);
    if (!o.dir) return fail(['mydumper: Please specify output directory with -o', '（教学提示）mydumper 导出的是**目录**（每表一个 .sql + schema 文件），不是单个文件，所以 -o 是必填的。']);
    var chk = connectLite(ctx, HOST, o, 'mydumper');
    if (chk.res) return chk.res;
    if (!MYSQL_DBS[o.db]) {
      return fail(['mydumper: Couldn\'t acquire lock: Unknown database \'' + o.db + '\'',
        '（教学提示）库不存在。先用 `mysql -h ' + o.host + ' -u ' + o.user + ' -p -e "SHOW DATABASES"` 确认库名。']);
    }
    var res = ensureVirtualDir(ctx, U.resolvePath(ctx.cwd, o.dir));
    if (res.err) return fail(['mydumper: ' + res.err]);
    var tbls = o.tables.length ? o.tables : (MYSQL_DBS[o.db] || []);
    var badT = o.tables.filter(function (t) { return (MYSQL_DBS[o.db] || []).indexOf(t) === -1; });
    if (badT.length) {
      return fail(['mydumper: Table \'' + badT[0] + '\' doesn\'t exist in database \'' + o.db + '\'',
        '（教学提示）-T 后面跟的是**表名**（逗号分隔），要确认这些表在库里存在。']);
    }
    var out = [
      '（教学提示）本站仿真不真的写几百个分片文件，只把命令解析与线程/分片规划说清楚 —— 真机输出如下结构：',
      o.dir + '/',
      o.dir + '/metadata',
      o.dir + '/' + o.db + '.schema.sql' + (o.compress ? '.gz' : '')
    ];
    tbls.forEach(function (t) {
      for (var c = 0; c < Math.max(1, Math.min(o.threads, 4)); c++) {
        out.push(o.dir + '/' + o.db + '.' + t + '.' + ('0000' + c).slice(-4) + + c + '.sql' + (o.compress ? '.gz' : ''));
      }
    });
    out.push('');
    out.push('统计（真机 mydumper 结束时会打印）：');
    out.push('  Threads: ' + o.threads);
    out.push('  Tables: ' + tbls.length);
    out.push('  Rows dumped: ' + MYSQL_TABLE_STATS.filter(function (x) { return tbls.indexOf(x.TABLE_NAME) !== -1; }).reduce(function (a, x) { return a + x.TABLE_ROWS; }, 0));
    out.push('  Elapsed: 184.2s');
    return okHint(out, [
      '（教学提示）mydumper 比 mysqldump 快在**并行 + 分片**（每表切成多个 chunk，-t 指定线程数），天然支持按表恢复；' +
      '但按行切片时要靠 `--trx-consistency-only` 保证一致性快照，单表特别大时尤其要注意。',
      '（教学提示）它导出的目录结构是"每表一个 .sql + 一个 schema 文件"，所以恢复可以**只挑出事的那张表**（myloader -B <库> -o <目录>）。' +
      '本站 /data/backup/mydumper-20240318 就是这样的目录。'
    ]);
  }

  function myloaderCmd(argv, ctx, stdin, HOST) {
    var o = { host: null, user: 'root', pass: null, passGiven: false, db: null, dir: null, threads: 4, overwrite: false, queries: null };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h') o.host = String(argv[++i] || '');
      else if (a === '-u') o.user = String(argv[++i] || '');
      else if (a === '-p') { o.passGiven = true; o.pass = String(argv[++i] === undefined ? '' : argv[i]); }
      else if (a === '-B') o.db = String(argv[++i] || '');
      else if (a === '-d') o.dir = String(argv[++i] || '');
      else if (a === '-t') o.threads = Number(argv[++i] || 4);
      else if (a === '-q') o.queries = Number(argv[++i] || 1000);
      else if (a === '-o' || a === '--overwrite-tables') o.overwrite = true;
      else if (a === '-v') { o.verbose = true; if (argv[i + 1] && isDigits(argv[i + 1])) i++; }
      else if (a === '-S' || a === '-P' || a === '-x' || a === '-M' || a === '-F' || a === '-r' || a === '-s' || a === '-L' || a === '-i') i++;
    }
    if (!o.host) return fail(['myloader: Please specify host with -h']);
    if (!o.dir) return fail(['myloader: Please specify directory with -d', '（教学提示）用法：myloader -h <主机> -u <用户> -p <密码> -B <库> -d <mydumper 输出目录> -t <线程数>']);
    var chk = connectLite(ctx, HOST, o, 'myloader');
    if (chk.res) return chk.res;
    var d = U.findNode(ctx.root, U.resolvePath(ctx.cwd, o.dir));
    if (!d || d.type !== 'dir') {
      return fail(['myloader: cannot open directory ' + o.dir + ': No such file or directory',
        '（教学提示）恢复目录必须是 mydumper 真正导出过的目录（里面要有 metadata 与 *.schema.sql）；本站 /data/backup/mydumper-20240318 就是这样一个目录。']);
    }
    return okHint([
      '（教学提示）本站仿真不真的执行导入，只把命令解析与并行规划说清楚 —— 真机输出形如：',
      '** Message: 8 threads created',
      '** Message: Creating metadata',
      '** Message: Dropping table or view (if exists) `' + (o.db || 'orders') + '`.`orders`',
      '** Message: Creating table `' + (o.db || 'orders') + '`.`orders`',
      '** Message: Thread 1 restoring `' + (o.db || 'orders') + '`.`orders` part 0',
      '** Message: Thread 2 restoring `' + (o.db || 'orders') + '`.`order_items` part 0',
      '** Message: Commit completed, 184211 rows restored',
      '** Message: Finished 2 tables in 92.4s'
    ], [
      '（教学提示）-t ' + o.threads + ' 是并行导入线程数；-o / --overwrite-tables 会在导入前 DROP 同名表（**会丢现有数据**，事故回滚时才用）；' +
      '-q ' + (o.queries || 1000) + ' 表示每 ' + (o.queries || 1000) + ' 条查询提交一次事务（调大更快但回滚代价更大，且锁持有时间更长）。',
      '（教学提示）恢复前务必确认目标库正确：myloader 是"按目录里的库表名"建的，`-B` 写错库名可能把数据灌进生产库。'
    ]);
  }

  function connectLite(ctx, HOST, o, tool) {
    var label = o.host ? (HOST.ip || '127.0.0.1') : 'localhost';
    var hosts = hostsFileMap(ctx, HOST);
    var isLocal = !o.host || localNames(HOST)[o.host];
    if (!isLocal) {
      var known = MYSQL_HOSTS[o.host] || null;
      var ip = hosts[o.host] || (/^\d+\.\d+\.\d+\.\d+$/.test(o.host) ? o.host : null);
      if (!known && !ip) return { res: fail([tool + ': ' + mysqlErr(2005, 'HY000', "Unknown MySQL server host '" + o.host + "' (-2)")]) };
      if (!known) {
        var has = false;
        for (var hn in VHOSTS) {
          if (Object.prototype.hasOwnProperty.call(VHOSTS, hn) && VHOSTS[hn].ip === ip && VHOSTS[hn].services.mysql) has = true;
        }
        if (!has) return { res: fail([tool + ': ' + mysqlErr(2003, 'HY000', "Can't connect to MySQL server on '" + o.host + "' (111)")]) };
      }
    }
    var real = MYSQL_PASS[o.user];
    if (real === undefined || real === null || (o.passGiven && o.pass !== null && o.pass !== real)) {
      return { res: fail([tool + ': ' + mysqlErr(1045, '28000', "Access denied for user '" + o.user + "'@'" + label + "' (using password: " + (o.passGiven ? 'YES' : 'NO') + ")")]) };
    }
    if (!o.passGiven && o.user !== 'root') {
      return { res: fail([tool + ': ' + mysqlErr(1045, '28000', "Access denied for user '" + o.user + "'@'" + label + "' (using password: NO)")]) };
    }
    return { ok: true };
  }

  /* ---- xtrabackup ---- */
  function xtrabackup(argv, ctx, stdin, HOST) {
    var action = null, defaults = null, target = null, stream = null, parallel = null, dataDir = '/var/lib/mysql';
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--backup' || a === '--prepare' || a === '--copy-back' || a === '--move-back' || a === '--apply-log-only' || a === '--version') { if (!action) action = a; continue; }
      if (a.indexOf('--defaults-file=') === 0) { defaults = a.slice(16); continue; }
      if (a === '--defaults-file') { defaults = String(argv[++i] || ''); continue; }
      if (a.indexOf('--target-dir=') === 0) { target = a.slice(13); continue; }
      if (a === '--target-dir') { target = String(argv[++i] || ''); continue; }
      if (a.indexOf('--stream=') === 0) { stream = a.slice(9); continue; }
      if (a === '--stream') { stream = String(argv[++i] || ''); continue; }
      if (a.indexOf('--parallel=') === 0) { parallel = a.slice(11); continue; }
      if (a === '--parallel') { parallel = String(argv[++i] || ''); continue; }
      if (a.indexOf('--datadir=') === 0) { dataDir = a.slice(10); continue; }
      if (a === '--datadir') { dataDir = String(argv[++i] || ''); continue; }
      if (a === '--compress' || a === '--decompress' || a === '--no-timestamp' || a === '--use-memory' || a === '--apply-log-only') continue;
    }
    if (action === '--version') return ok(['xtrabackup version 8.0.35-30 based on MySQL server 8.0.36 Linux (x86_64) (revision id: 1c1a3b4d)']);
    if (!action) {
      return fail(['xtrabackup: Error: you must specify one of --backup, --prepare, --copy-back or --move-back',
        '（教学提示）三步步标准流程：`--backup` 拷数据文件（此时文件内部**不一致**）→ `--prepare` 把 redo log 应用上去做成一致状态 → 停库 `--copy-back` 拷回数据目录。']);
    }
    if (defaults) {
      var r = U.readFileOrErr(ctx, defaults);
      if (r.err) {
        return fail(['xtrabackup: Error: cannot open defaults file ' + defaults,
          '（教学提示）--defaults-file 指向的 my.cnf 必须真实存在（本站是 /etc/my.cnf）；它决定了 datadir、socket、端口这些参数，写错会连不上库或备份错目录。']);
      }
    }
    if (action === '--copy-back' || action === '--move-back') {
      if (!target) return fail(['xtrabackup: Error: --copy-back requires --target-dir']);
      var t = U.findNode(ctx.root, U.resolvePath(ctx.cwd, target));
      if (!t) {
        return fail(['xtrabackup: Error: cannot open directory ' + target + ': No such file or directory',
          '（教学提示）--copy-back 要拷贝的是 --prepare 过的备份目录；目录不存在说明备份/解压这一步没成功，或者路径写错。']);
      }
      return okHint([
        '2024-03-18T09:56:02.114882+08:00 0 [Note] [MY-011825] [Xtrabackup] Copying ./ibdata1 to ' + dataDir + '/ibdata1',
        '2024-03-18T09:56:44.882117+08:00 0 [Note] [MY-011825] [Xtrabackup] Copying ./orders/orders.ibd to ' + dataDir + '/orders/orders.ibd',
        '2024-03-18T09:58:12.208117+08:00 0 [Note] [MY-011825] [Xtrabackup] Copying ./mysql.ibd to ' + dataDir + '/mysql.ibd',
        '2024-03-18T09:58:41.114882+08:00 0 [Note] [MY-011825] [Xtrabackup] completed OK!'
      ], [
        '（教学提示）copy-back **要求 MySQL 已经停库**（否则会覆盖正在使用的数据文件）。完整流程：' +
        '`systemctl stop mysqld && xtrabackup --copy-back ... && chown -R mysql:mysql ' + dataDir + ' && systemctl start mysqld`。',
        '（教学提示）拷回来之后目录属主会变成执行命令的用户（通常是 root），不 chown 回 mysql:mysql 数据库起不来 —— 这是最常见的一步失误。'
      ]);
    }
    if (action === '--prepare') {
      if (!target) return fail(['xtrabackup: Error: --prepare requires --target-dir', '（教学提示）用法：xtrabackup --prepare --target-dir=/data/backup/xtra-20240318']);
      var td = U.findNode(ctx.root, U.resolvePath(ctx.cwd, target));
      if (!td) {
        return fail(['xtrabackup: Error: cannot open directory ' + target + ': No such file or directory',
          '（教学提示）目录不存在，先跑 `--backup`；如果备份是 `--stream=xbstream` 出来的，要先用 `xbstream -x < 文件` 解包成目录再 prepare。']);
      }
      return okHint([
        '2024-03-18T09:55:02.114882+08:00 0 [Note] [MY-011825] [Xtrabackup] Starting InnoDB instance for recovery.',
        '2024-03-18T09:55:02.118117+08:00 0 [Note] [MY-011825] [Xtrabackup] Using 8388608 bytes for buffer pool',
        '2024-03-18T09:55:44.882117+08:00 0 [Note] [MY-012882] [InnoDB] Applying a batch of 184211 redo log records ...',
        '2024-03-18T09:56:12.208117+08:00 0 [Note] [MY-012884] [InnoDB] Apply batch completed!',
        '2024-03-18T09:56:12.884882+08:00 0 [Note] [MY-011825] [Xtrabackup] Shutdown completed; log sequence number 9182736451',
        '2024-03-18T09:56:13.114882+08:00 0 [Note] [MY-011825] [Xtrabackup] completed OK!'
      ], ['（教学提示）prepare 的核心动作是**应用 redo log 把不一致的数据文件做成一致状态**；如果是增量备份，要按顺序把每个增量目录都 prepare 一遍（除最后一个外都加 --apply-log-only）。']);
    }
    if (action === '--backup') {
      if (!stream && !target) {
        return fail(['xtrabackup: Error: --backup requires --target-dir (or --stream)',
          '（教学提示）用法：xtrabackup --defaults-file=/etc/my.cnf --backup --target-dir=/data/backup/xtra-YYYYMMDD --parallel=4']);
      }
      var lines = [
        '2024-03-18T09:54:02.114882+08:00 0 [Note] [MY-011825] [Xtrabackup] Executing LOCK TABLES FOR BACKUP ...',
        '2024-03-18T09:54:02.208117+08:00 0 [Note] [MY-011825] [Xtrabackup] Using "xtrabackup" ...',
        '2024-03-18T09:54:02.882117+08:00 0 [Note] [MY-011825] [Xtrabackup] Connecting to MySQL server host: localhost, user: root',
        '2024-03-18T09:54:03.118117+08:00 0 [Note] [MY-011825] [Xtrabackup] Starting backup with ' + (parallel || '1') + ' threads',
        '2024-03-18T09:54:03.208117+08:00 0 [Note] [MY-012207] [InnoDB] Using ' + (parallel || '1') + ' threads to copy data files',
        '2024-03-18T09:55:44.114882+08:00 0 [Note] [MY-012207] [InnoDB] Copying ./orders/order_status_log.ibd',
        '2024-03-18T09:56:14.882117+08:00 0 [Note] [MY-011825] [Xtrabackup] >> log scanned up to (9182736451)'
      ];
      if (stream) lines.push('2024-03-18T09:56:15.114882+08:00 0 [Note] [MY-011825] [Xtrabackup] Streaming ./xtrabackup_logfile to <stdout>');
      lines.push('2024-03-18T09:56:44.208117+08:00 0 [Note] [MY-011825] [Xtrabackup] completed OK!');
      var hints = [
        '（教学提示）--backup 期间**不锁表**（只在开始取一次 LOCK TABLES FOR BACKUP 拿位点），业务不中断；' +
        '但备份出来的文件内部**不一致**（有的页新、有的页旧），必须 --prepare 应用 redo 才能恢复。',
        '（教学提示）XtraBackup 的版本必须与 MySQL 大版本对应：XtraBackup 8.0 只能备份/恢复 MySQL 8.0，不能拿来恢复 5.7。'
      ];
      if (stream) hints.push('（教学提示）--stream=xbstream 把备份流式打到 stdout，配合 `| gzip > xx.xb.gz` 直接产出压缩包，适合传到 OBS 或异地机房；恢复时要先 `gunzip < xx.xb.gz | xbstream -x -C /data/restore` 再 prepare。');
      return okHint(lines, hints);
    }
    return fail(['xtrabackup: Error: unknown action ' + action]);
  }

  /* ---- pt-query-digest ---- */
  var PT_CLASSES = [
    { fingerprint: "SELECT COUNT(*) FROM order_status_log WHERE order_id = ? AND status = ?", calls: 184211, total: 962114.442, rows: 52118330, db: 'orders' },
    { fingerprint: 'SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?', calls: 84210, total: 328114.208, rows: 18204412, db: 'orders' },
    { fingerprint: 'SELECT id, name FROM users WHERE id = ?', calls: 421188, total: 42118.882, rows: 982140, db: 'orders' },
    { fingerprint: 'UPDATE orders SET status = ? WHERE id = ?', calls: 18204, total: 18422.114, rows: 18204412, db: 'orders' },
    { fingerprint: 'SHOW FULL PROCESSLIST', calls: 4211, total: 8422.208, rows: 0, db: '' }
  ];

  function ptQueryDigest(argv, ctx, stdin, HOST) {
    var files = [], opts = {}, limit = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--since' || a === '--until' || a === '--type' || a === '--order-by' || a === '--limit' || a === '--output' || a === '--review' || a === '--history' || a === '--filter') {
        var v = argv[i + 1] === undefined ? '' : String(argv[i + 1]);
        opts[a] = v; i++;
        if (a === '--limit') limit = Number(v);
        continue;
      }
      if (a.indexOf('--since=') === 0 || a.indexOf('--until=') === 0 || a.indexOf('--type=') === 0 || a.indexOf('--order-by=') === 0 || a.indexOf('--limit=') === 0) {
        var k = a.slice(0, a.indexOf('='));
        opts[k] = a.slice(a.indexOf('=') + 1);
        if (k === '--limit') limit = Number(opts[k]);
        continue;
      }
      if (a === '--print' || a === '--no-report' || a === '--version') { opts[a] = true; continue; }
      if (a.charAt(0) !== '-') files.push(a);
    }
    if (!files.length) {
      return fail(['No input files or DSNs specified.',
        '（教学提示）用法：pt-query-digest /var/lib/mysql/mysql-slow.log —— 它还能分析通用查询日志、binlog（--type=binlog），甚至实时连库抓 --processlist。']);
    }
    var r = U.readFileOrErr(ctx, files[0]);
    if (r.err) {
      return fail(['Cannot open file ' + files[0] + ': No such file or directory',
        '（教学提示）慢日志文件路径要跟 `SHOW VARIABLES LIKE \'slow_query_log_file\'` 的输出一致（本站是 /var/lib/mysql/mysql-slow.log）；' +
        '如果 slow_query_log 没开，这个文件根本不会被写。']);
    }
    var orderBy = opts['--order-by'] || 'Query_time:sum';
    var sorted = PT_CLASSES.slice().sort(function (a, b) {
      if (orderBy.indexOf('sum') !== -1) return b.total - a.total;
      if (orderBy.indexOf('Cnt') !== -1 || orderBy.indexOf('count') !== -1) return b.calls - a.calls;
      return (b.total / b.calls) - (a.total / a.calls);
    });
    if (limit !== null) sorted = sorted.slice(0, limit);
    var grandTotal = PT_CLASSES.reduce(function (a, x) { return a + x.total; }, 0);
    var out = [];
    out.push('# 1842110 total, 42 unique, 0 QPS, 0x concurrency __________');
    out.push('# Time range: ' + (opts['--since'] || '2024-03-18 09:00:00') + ' to ' + (opts['--until'] || '2024-03-18 09:51:00'));
    out.push('# Attribute          total     min     max     avg     95%  stddev  median');
    out.push('# ============     ======= ======= ======= ======= ======= ======= =======');
    out.push('# Exec time           962s    12ms   6771ms    23ms   142ms   184ms    18ms');
    out.push('# Query size         1.42M     108    2048     842     942     412     812');
    out.push('');
    out.push('# Profile');
    out.push('# Rank Query ID           Response time    Calls R/Call  V/M   Item');
    out.push('# ==== ================== ================ ===== ======= ===== ============');
    sorted.forEach(function (c2, i) {
      var pct = (c2.total / grandTotal * 100);
      out.push('# ' + padL(String(i + 1), 4) + ' 0x' + ptChecksum(c2.fingerprint) + ' ' +
        padL(c2.total.toFixed(4), 16) + ' ' + pct.toFixed(1) + '% ' + padL(String(c2.calls), 5) + ' ' +
        (c2.total / c2.calls * 1000).toFixed(2) + 'ms ' + (c2.rows / c2.calls).toFixed(0) + ' ' + (i === 0 ? 'SELECT order_status_log' : ''));
    });
    out.push('');
    out.push('# MISC');
    out.push('# Tables');
    out.push('#    SHOW TABLE STATUS LIKE \'order_status_log\'\\G');
    out.push('');
    sorted.forEach(function (c3, i) {
      out.push('# Query ' + (i + 1) + ': ' + (c3.total / grandTotal * 100).toFixed(1) + ' QPS, ' + (c3.total / c3.calls * 1000).toFixed(2) + 'ms avg, ' + c3.calls + ' calls');
      out.push('# ============');
      out.push('# ' + c3.fingerprint);
      out.push('#');
      out.push('# Databases    ' + (c3.db || '(none)'));
      out.push('# Query_time distribution');
      out.push('#   1us  #');
      out.push('#  10us  ####');
      out.push('# 100us  ##########');
      out.push('#   1ms  ################');
      out.push('#  10ms  ######');
      out.push('# 100ms  ##');
      out.push('#    1s  #');
      out.push('');
    });
    return okHint(out, [
      '（教学提示）报表三块用法：① 头部 `# Profile` 的 Response time 占比告诉你"主要矛盾在哪一类 SQL"（本例 order_status_log 的全表 COUNT 占了 ~80%）；' +
      '② `--order-by Query_time:sum` 按总耗时排（看影响面）、`Query_time:avg` 按单次最慢排（看最拖的那条）；' +
      '③ `--since/--until` 只看事故时间窗，别被一天的日志淹没。',
      '（教学提示）pt-query-digest 会把参数值相同的 SQL **归一化成指纹**（? 占位），所以看到的是"模板"而不是具体某条语句 —— 这正是它比 mysqldumpslow 更能做聚合分析的原因。'
    ]);
  }

  function ptChecksum(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    var v = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    var hex = v.toString(16);
    while (hex.length < 16) hex = '0' + hex;
    return hex;
  }

  /* ---- mysqldumpslow ---- */
  function mysqldumpslow(argv, ctx, stdin, HOST) {
    var sortBy = 'at', top = null, grepPat = null, files = [], verbose = false;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-s') { sortBy = String(argv[++i] || 'at'); continue; }
      if (a.indexOf('-s') === 0 && a.length > 2) { sortBy = a.slice(2); continue; }
      if (a === '-t') { top = Number(argv[++i] || 0); continue; }
      if (a.indexOf('-t') === 0 && a.length > 2) { top = Number(a.slice(2)); continue; }
      if (a === '-g') { grepPat = String(argv[++i] || ''); continue; }
      if (a.indexOf('-g') === 0 && a.length > 2) { grepPat = a.slice(2); continue; }
      if (a === '-a' || a === '-n' || a === '-v') { verbose = verbose || a === '-v'; if (a === '-n') i++; continue; }
      if (a === '-r' || a === '-d') continue;
      if (a.charAt(0) !== '-') files.push(a);
    }
    if (!files.length) {
      return fail(['mysqldumpslow: no log file specified',
        '（教学提示）用法：mysqldumpslow -s t -t 10 /var/lib/mysql/mysql-slow.log（-s t 按总耗时、-s c 按次数、-s at 按平均耗时、-g <模式> 过滤）。']);
    }
    var r = U.readFileOrErr(ctx, files[0]);
    if (r.err) {
      return fail(['mysqldumpslow: ' + files[0] + ': No such file or directory',
        '（教学提示）路径要跟 slow_query_log_file 一致；本站仿真里是 /var/lib/mysql/mysql-slow.log。']);
    }
    var classes = parseSlowLog(r.content);
    if (!classes.length) return ok([]);
    var filtered = classes;
    if (grepPat) {
      var re = new RegExp(grepPat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filtered = classes.filter(function (c) { return re.test(c.fingerprint); });
    }
    var cmp;
    if (sortBy === 't') cmp = function (a, b) { return b.total - a.total; };
    else if (sortBy === 'c') cmp = function (a, b) { return b.count - a.count; };
    else if (sortBy === 'at') cmp = function (a, b) { return (b.total / b.count) - (a.total / a.count); };
    else if (sortBy === 'l') cmp = function (a, b) { return b.lock - a.lock; };
    else if (sortBy === 'r') cmp = function (a, b) { return b.rows - a.rows; };
    else cmp = function (a, b) { return b.total - a.total; };
    filtered.sort(cmp);
    if (top) filtered = filtered.slice(0, top);
    var out = ['Reading mysql slow query log from ' + files[0]];
    filtered.forEach(function (c) {
      out.push('Count: ' + c.count + '  Time=' + c.total.toFixed(2) + 's (' + (c.total / c.count).toFixed(2) + 's)  Lock=' + c.lock.toFixed(2) + 's (' + (c.lock / c.count).toFixed(2) + 's)  Rows=' + Math.round(c.rows / c.count) + ' (' + Math.round(c.rows) + ')');
      out.push('  ' + c.fingerprint);
    });
    return okHint(out, [
      '（教学提示）mysqldumpslow 会把参数值归一化成 `N`（所以 `order_id = 8812` 与 `= 8814` 会合并成同一条"模板"），' +
      '它只能做**粗聚合**；要看响应时间占比、执行计划建议请用 pt-query-digest。',
      '（教学提示）本站这条慢日志的"主要矛盾"是 order_status_log 上的全表 COUNT（Query_time 5~6 秒、Rows_examined 5211 万）—— ' +
      '与应用日志 "query timeout after 5000ms, orderId=8812" 对得上，根因就是这张 5200 万行、只增不改没有索引的流水表。'
    ]);
  }

  function parseSlowLog(text) {
    var blocks = String(text).split(/# Time:/).slice(1);
    var classes = {};
    blocks.forEach(function (b) {
      var qm = b.match(/Query_time:\s*([0-9.]+)\s+Lock_time:\s*([0-9.]+)\s+Rows_sent:\s*(\d+)\s+Rows_examined:\s*(\d+)/);
      if (!qm) return;
      var lines = b.split('\n');
      var sql = '';
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (!l || l.charAt(0) === '#' || /^SET timestamp=/.test(l) || /^use\s/i.test(l)) continue;
        if (/^(SELECT|UPDATE|DELETE|INSERT|REPLACE|CALL)/i.test(l)) { sql = l; break; }
      }
      if (!sql) return;
      var fp = sql
        .replace(/\b\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?\b/g, 'N')
        .replace(/'[^']*'/g, "'N'")
        .replace(/\b\d+(\.\d+)?\b/g, 'N')
        .replace(/\bN,\s*N,\s*N\b/g, 'N')
        .replace(/\bIN\s*\(\s*N(\s*,\s*N)*\s*\)/gi, 'IN (N)')
        .replace(/\s+/g, ' ');
      if (!classes[fp]) classes[fp] = { fingerprint: fp, count: 0, total: 0, lock: 0, rows: 0 };
      classes[fp].count++;
      classes[fp].total += Number(qm[1]);
      classes[fp].lock += Number(qm[2]);
      classes[fp].rows += Number(qm[4]);
    });
    return Object.keys(classes).map(function (k) { return classes[k]; });
  }

  /* ======================================================================
     10. PostgreSQL（psql / pg_dump / pg_restore / pg_dumpall）
     ====================================================================== */

  var PG_HOSTS = { 'db-prod-01': { ip: '10.0.2.15', port: '5432' } };
  var PG_PASS = { app: 'Pg@2024', postgres: 'Pg@2024', backup: 'Bk@2024' };
  var PG_DBS = {
    orders: { owner: 'app', encoding: 'UTF8', collate: 'en_US.UTF-8', size: '42 GB' },
    postgres: { owner: 'postgres', encoding: 'UTF8', collate: 'en_US.UTF-8', size: '8521 kB' },
    template0: { owner: 'postgres', encoding: 'UTF8', collate: 'C', size: '8412 kB' },
    template1: { owner: 'postgres', encoding: 'UTF8', collate: 'en_US.UTF-8', size: '8544 kB' }
  };
  var PG_TABLES = [
    { name: 'orders', rows: 18204412, size: '18 GB', idx: '6 GB' },
    { name: 'order_items', rows: 42118330, size: '21 GB', idx: '4 GB' },
    { name: 'payments', rows: 9120441, size: '3120 MB', idx: '842 MB' },
    { name: 'users', rows: 982140, size: '184 MB', idx: '42 MB' },
    { name: 'order_status_log', rows: 52118330, size: '26 GB', idx: '0 bytes' }
  ];
  var PG_ROLES = [
    { name: 'app', attributes: 'Cannot login', memberof: '{orders_rw}' },
    { name: 'backup', attributes: '', memberof: '{orders_ro}' },
    { name: 'postgres', attributes: 'Superuser, Create role, Create DB, Replication, Bypass RLS', memberof: '{}' }
  ];

  function psqlErrHost(host) {
    return [
      'psql: error: connection to server at "' + host + '", port 5432 failed: could not translate host name "' + host + '" to address: Name or service not known',
      '（教学提示）主机名解析不了。本站仿真里 PostgreSQL 与 MySQL 共用 db-prod-01（10.0.2.15），只有这一个数据库主机；-h 写别的主机名就是解析失败。'
    ];
  }
  function psqlErrRefused(host) {
    return ['psql: error: connection to server at "' + host + '", port 5432 failed: Connection refused',
      '（教学提示）主机能解析，但 5432 端口没有 PostgreSQL 在监听（Is the server running and accepting connections?）。'];
  }
  function psqlErrAuth(user, db) {
    return ['psql: error: connection to server at "db-prod-01" (10.0.2.15), port 5432 failed: FATAL:  password authentication failed for user "' + user + '"',
      '（教学提示）密码不对。psql **没有** `-p<密码>` 这种写法（小写 -p 是端口！），密码走 PGPASSWORD 环境变量或 ~/.pgpass 文件；' +
      '~/.pgpass 格式是 `主机:端口:库:用户:密码` 且权限必须是 600，否则 PG 会直接忽略它。'];
  }

  function psqlParse(argv) {
    var o = { host: null, port: '5432', user: null, db: null, cmd: null, file: null, list: false, fields: [], args: [], quiet: false };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h' || a === '--host') { o.host = String(argv[++i] || ''); continue; }
      if (a.indexOf('--host=') === 0) { o.host = a.slice(7); continue; }
      if (a === '-p' || a === '--port') { o.port = String(argv[++i] || '5432'); continue; }
      if (a.indexOf('--port=') === 0) { o.port = a.slice(7); continue; }
      if (a === '-U' || a === '--username') { o.user = String(argv[++i] || ''); continue; }
      if (a.indexOf('--username=') === 0) { o.user = a.slice(11); continue; }
      if (a === '-d' || a === '--dbname') { o.db = String(argv[++i] || ''); continue; }
      if (a.indexOf('--dbname=') === 0) { o.db = a.slice(9); continue; }
      if (a === '-c' || a === '--command') { o.cmd = String(argv[++i] === undefined ? '' : argv[i]); continue; }
      if (a.indexOf('--command=') === 0) { o.cmd = a.slice(10); continue; }
      if (a === '-f' || a === '--file') { o.file = String(argv[++i] || ''); continue; }
      if (a.indexOf('--file=') === 0) { o.file = a.slice(7); continue; }
      if (a === '-l' || a === '--list') { o.list = true; continue; }
      if (a === '-q' || a === '--quiet') { o.quiet = true; continue; }
      if (a === '-x' || a === '--expanded') { o.expanded = true; continue; }
      if (a === '-F' || a === '--field-separator') { o.fields.push(String(argv[++i] || '')); continue; }
      if (a === '-v' || a === '--set' || a === '--variable') { o.fields.push(String(argv[++i] || '')); continue; }
      if (a === '-A' || a === '--no-align' || a === '-t' || a === '--tuples-only' || a === '-1' || a === '--single-transaction' || a === '-w' || a === '--no-password') { o.args.push(a); continue; }
      if (a.charAt(0) !== '-') { if (!o.db) o.db = a; else o.cmd = a; }
    }
    return o;
  }

  function psqlConnect(ctx, HOST, o) {
    if (o.host) {
      var ip = hostsFileMap(ctx, HOST)[o.host] || (/^\d+\.\d+\.\d+\.\d+$/.test(o.host) ? o.host : null);
      if (!ip) return { res: fail(psqlErrHost(o.host)) };
      var known = PG_HOSTS[o.host];
      if (!known) {
        for (var hn in VHOSTS) {
          if (Object.prototype.hasOwnProperty.call(VHOSTS, hn) && VHOSTS[hn].ip === ip && VHOSTS[hn].services.postgres) { known = VHOSTS[hn]; break; }
        }
      }
      if (!known) return { res: fail(psqlErrRefused(o.host)) };
      if (String(o.port) !== '5432') return { res: fail(psqlErrRefused(o.host)) };
    } else if (String(o.port) !== '5432') {
      return { res: fail(psqlErrRefused(o.host || 'localhost')) };
    }
    var user = o.user || 'postgres';
    var envPass = (ctx.env || {}).PGPASSWORD;
    var real = PG_PASS[user];
    if (real === undefined) {
      return { res: fail(['psql: error: connection to server at "db-prod-01" (10.0.2.15), port 5432 failed: FATAL:  role "' + user + '" does not exist',
        '（教学提示）PostgreSQL 的账号叫**角色（role）**，超级用户通常叫 postgres 而不是 root —— 这是从 MySQL 转过来最容易踩的坑。']) };
    }
    /* 没给 PGPASSWORD 时按 ~/.pgpass（仿真里视为已配置）处理；
       给了但不对才报 1045 那类认证失败 —— 绝不"密码错了也放行"。 */
    if (envPass && envPass !== real) return { res: fail(psqlErrAuth(user, o.db)) };
    return { ok: true };
  }

  function psqlResult(cols, rows, o) {
    var out = [];
    var w = cols.map(function (c, i) {
      var m = String(c).length;
      rows.forEach(function (r) { if (String(r[i] === null ? '' : r[i]).length > m) m = String(r[i] === null ? '' : r[i]).length; });
      return m;
    });
    function line(vals) {
      var parts = [];
      for (var k = 0; k < vals.length; k++) parts.push(' ' + padR(String(vals[k] === null ? '' : vals[k]), w[k]) + ' ');
      var s = parts.join('|');
      while (s.length && s.charAt(s.length - 1) === ' ') s = s.slice(0, -1);
      return s;
    }
    out.push(line(cols));
    var sep = '';
    for (var i = 0; i < cols.length; i++) sep += rep('-', w[i] + 2) + '+';
    out.push(sep.slice(0, sep.length - 1));
    rows.forEach(function (r) { out.push(line(r)); });
    out.push('(' + rows.length + (rows.length === 1 ? ' row' : ' rows') + ')');
    out.push('');
    return out;
  }

  function psqlMeta(cmd, ctx, HOST, o) {
    var c = String(cmd).trim();
    if (c === '\\l' || c === '\\l+') {
      var rows = Object.keys(PG_DBS).sort().map(function (d) {
        return [d, PG_DBS[d].owner, PG_DBS[d].encoding, PG_DBS[d].collate, PG_DBS[d].size];
      });
      return okHint(psqlResult(['Name', 'Owner', 'Encoding', 'Collate', 'Size'], rows, o),
        ['（教学提示）看看这台实例上有哪些库、分别是什么编码。跨环境迁移时 encoding/collate 不一致会导致排序规则不同、索引失效 —— 恢复前先对齐。']);
    }
    if (/^\\dt/.test(c)) {
      var pat = c.replace(/^\\dt\+?\s*/, '') || '*';
      var re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      var rows2 = PG_TABLES.filter(function (t) { return re.test(t.name); }).map(function (t) {
        if (/\+/.test(c)) return ['public', t.name, 'table', t.owner || 'app', t.size, t.idx];
        return ['public', t.name, 'table', 'app'];
      });
      if (!rows2.length) return ok(['Did not find any relation named "' + pat + '".']);
      var cols = /\+/.test(c) ? ['Schema', 'Name', 'Type', 'Owner', 'Size', 'Indexes'] : ['Schema', 'Name', 'Type', 'Owner'];
      return okHint(psqlResult(cols, rows2, o), ['（教学提示）\\dt 支持通配符（\\dt order*）；加 `+` 会多出大小与描述列 —— 找"哪张表最大"时直接用 \\dt+ 更快。']);
    }
    if (/^\\d\+?\s+/.test(c) || c === '\\d') {
      var tbl = c.replace(/^\\d\+?\s*/, '') || 'orders';
      if (!PG_TABLES.filter(function (t) { return t.name === tbl; }).length) {
        return fail(['Did not find any relation named "' + tbl + '".']);
      }
      var t0 = PG_TABLES.filter(function (t) { return t.name === tbl; })[0];
      var out = [
        '                                      Table "public.' + tbl + '"',
        '   Column   |            Type             | Collation | Nullable |              Default',
        '------------+-----------------------------+-----------+----------+-----------------------------------',
        ' id         | bigint                      |           | not null | nextval(\'' + tbl + '_id_seq\'::regclass)',
        ' user_id    | bigint                      |           | not null | ',
        ' status     | character varying(16)       |           |          | ',
        ' amount     | numeric(12,2)               |           |          | ',
        ' created_at | timestamp without time zone |           |          | now()',
        'Indexes:',
        '    "' + tbl + '_pkey" PRIMARY KEY, btree (id)',
        '    "idx_' + tbl + '_user_status" btree (user_id, status)',
        'Foreign-key constraints:',
        '    "fk_' + tbl + '_user" FOREIGN KEY (user_id) REFERENCES users(id)'
      ];
      if (/\+/.test(c)) {
        out.push('Has OIDs: no');
        out.push('Options: autovacuum_enabled=true');
        out.push('Size: ' + t0.size);
        out.push('Rows: ' + t0.rows);
      }
      return okHint(out, ['（教学提示）\\d+ 比 \\d 多了存储参数与大小；重点看 Indexes 一节的 btree 列顺序（联合索引的最左前缀原则在这里同样成立）。']);
    }
    if (/^\\du/.test(c)) {
      var rows3 = PG_ROLES.map(function (r) { return [r.name, r.attributes, r.memberof]; });
      return okHint(psqlResult(['Role name', 'Attributes', 'Member of'], rows3, o),
        ['（教学提示）PG 用"角色"统一表示用户与组；确认应用账号是否存在、有没有读表权限就看这里（\du 只列角色，具体表权限看 \\dp 或 information_schema.role_table_grants）。']);
    }
    if (/^\\dn/.test(c)) return ok(psqlResult(['Name', 'Owner'], [['public', 'pg_database_owner']], o));
    if (/^\\di/.test(c)) {
      return ok(psqlResult(['Schema', 'Name', 'Type', 'Owner', 'Table'], [
        ['public', 'orders_pkey', 'index', 'app', 'orders'],
        ['public', 'idx_orders_user_status', 'index', 'app', 'orders']
      ], o));
    }
    if (/^\\df/.test(c)) return ok(psqlResult(['Schema', 'Name', 'Result data type', 'Argument data types'], [['public', 'sp_close_order', 'void', 'bigint']], o));
    if (/^\\dp/.test(c)) return ok(psqlResult(['Schema', 'Name', 'Type', 'Access privileges'], [['public', 'orders', 'table', 'app=arwdDxt/app']], o));
    if (/^\\x/.test(c)) return okHint([], ['（教学提示）已切换到扩展显示（竖排）。宽表在单行里挤成一团时用 \\x 一开就好读多了；再敲一次 \\x 关掉。本站仿真不保留连接状态，所以只提示不改变后续输出。']);
    if (/^\\timing/.test(c)) return ok(['Timing is on.', '', '（教学提示）\\timing 打开后每条语句都会打印实际耗时（Time: 12.345 ms），是定位"哪一步慢"最省事的办法。']);
    if (/^\\c/.test(c)) {
      var nd = c.replace(/^\\c\s*/, '') || 'orders';
      return okHint(['You are now connected to database "' + nd + '" as user "' + (o.user || 'postgres') + '".'],
        ['（教学提示）\\c 是交互式元命令，切换的是当前会话的连接；脚本里请直接用 `psql -d ' + nd + '`。']);
    }
    if (/^\\q/.test(c)) return okHint([], ['（教学环境里不需要退出 —— 刷新页面即可重置）']);
    if (/^\\d/.test(c)) return fail(['（教学提示）教学环境未实现该元命令；已实现：\\l、\\dt [pattern]、\\d <表>、\\d+ <表>、\\du、\\dn、\\di、\\df、\\dp、\\x、\\timing、\\c、\\q。']);
    return fail(["(psql: invalid command \\'" + c + "'. Try \\? for help.)"]);
  }

  function psql(argv, ctx, stdin, HOST) {
    var o = psqlParse(argv);
    var conn = psqlConnect(ctx, HOST, o);
    if (conn.res) return conn.res;

    if (o.list) return psqlMeta('\\l', ctx, HOST, o);
    if (o.file) {
      var r = U.readFileOrErr(ctx, o.file);
      if (r.err) return fail(['psql: error: could not open file "' + o.file + '": No such file or directory',
        '（教学提示）-f 指向的 SQL 文件必须真实存在；本站 /data/backup/pg-globals-2024-03-18.sql 是 pg_dumpall -g 的产物。']);
      var lines = U.splitLines(String(r.content));
      var applied = 0;
      lines.forEach(function (l) {
        var s = l.trim();
        if (!s || s.charAt(0) === '-' || s.charAt(0) === '/' && s.charAt(1) === '*') return;
        if (/^CREATE ROLE|^ALTER ROLE|^GRANT|^SET|^CREATE TABLE|^CREATE INDEX|^COMMENT|^CREATE DATABASE/i.test(s)) applied++;
      });
      return okHint(['SET', 'SET', 'SET', 'CREATE ROLE', 'ALTER ROLE', 'CREATE ROLE', 'ALTER ROLE'],
        ['（教学提示）已执行 ' + o.file + '（仿真：识别到 ' + applied + ' 条 DDL/DCL 语句，不真的改虚拟库）。' +
        '脚本化恢复建议加 `-v ON_ERROR_STOP=1`：遇错立即退出（退出码非 0），否则 psql 默认会**继续往下跑**，你拿到的"成功"是假的。']);
    }
    if (o.db && !PG_DBS[o.db]) {
      return fail(['psql: error: connection to server at "db-prod-01" (10.0.2.15), port 5432 failed: FATAL:  database "' + o.db + '" does not exist',
        '（教学提示）库不存在。用 `psql -h db-prod-01 -U postgres -l` 看实例上有哪些库。']);
    }
    if (!o.cmd) {
      return okHint([
        '（教学环境不模拟交互式客户端：真机上 psql 会进 postgres=# 提示符，这里请用 -c "SQL" 一次执行）',
        '例：psql -h db-prod-01 -U app -d orders -c "SELECT version();"',
        '元命令也可以：psql -h db-prod-01 -U app -d orders -c "\\dt"'
      ], []);
    }
    var cmd = String(o.cmd);
    if (cmd.charAt(0) === '\\') return psqlMeta(cmd.split('\n')[0], ctx, HOST, o);

    var up = cmd.trim().toUpperCase();
    if (/^SELECT\s+VERSION\(\)/i.test(cmd)) {
      return ok(psqlResult(['version'], [['PostgreSQL 15.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 10.3.1, 64-bit']], o));
    }
    if (/^SHOW\s+server_version/i.test(cmd)) return ok(psqlResult(['server_version'], [['15.6']], o));
    if (/^SELECT\s+COUNT\s*\(\s*\*\s*\)\s+FROM\s+orders/i.test(cmd)) {
      return okHint(psqlResult(['count'], [[18204412]], o),
        ['（教学提示）count(*) 在 PG 里也要全表扫（MVCC 不保存精确行数），1800 万行的表在低配机器上要几秒；' +
        '要估算值可以用 `SELECT reltuples::bigint FROM pg_class WHERE relname=\'orders\';`。']);
    }
    if (/^SELECT\s+COUNT/i.test(cmd)) return ok(psqlResult(['count'], [[982140]], o));
    if (/FROM\s+pg_stat_activity/i.test(cmd)) {
      if (/pg_blocking_pids/i.test(cmd)) {
        return okHint(psqlResult(['pid', 'blocked_by', 'sql'], [[41244, '{41237}', "ALTER TABLE orders ADD INDEX idx_user_status (user_id, status)"]]),
          ['（教学提示）pg_blocking_pids(pid) 直接给出"谁挡住了我"：blocking_by={41237} 说明 41237 持有锁。' +
          '定位到源头后先用 `SELECT pg_cancel_backend(41237);`（温和，取消当前语句）而不是 `pg_terminate_backend`（断连接）。']);
      }
      if (/idle in transaction/i.test(cmd)) {
        return okHint(psqlResult(['pid', 'state', 'xact_age', 'left'], [[41251, 'idle in transaction', '00:18:42', 'UPDATE orders SET status=$1 WHERE id=$2']]),
          ['（教学提示）`idle in transaction` 是 PG 变慢的高频元凶：事务开着却不干活，会一直持有锁并把 vacuum 挡住（导致表膨胀、xid 回卷风险）。' +
          '排查完要治应用：连接池必须设 statement_timeout / idle_in_transaction_session_timeout。']);
      }
      return okHint(psqlResult(['pid', 'usename', 'application_name', 'client_addr', 'state', 'wait_event_type', 'wait_event', 'duration', 'sql'], [
        [41237, 'app', 'orderservice', '10.0.1.23', 'active', 'IO', 'DataFileRead', '00:00:05.218', 'SELECT COUNT(*) FROM order_status_log WHERE order_id = 8812 AND status = $1'],
        [41244, 'app', 'orderservice', '10.0.1.24', 'active', 'Lock', 'relation', '00:03:04.882', 'ALTER TABLE orders ADD INDEX idx_user_status (user_id, status)'],
        [41251, 'app', 'orderservice', '10.0.1.24', 'idle in transaction', null, null, '00:18:42', 'UPDATE orders SET status=$1 WHERE id=$2']
      ]), [
        '（教学提示）按持续时长倒序列出活动会话是 PG 排障第一步。三个重点：`active` + IO/DataFileRead = 真在扫磁盘（缺索引或统计信息过期）；' +
        '`wait_event_type=Lock` = 在等锁，用 pg_blocking_pids 找源头；`idle in transaction` = 事务开着不干活，必须治。',
        '（教学提示）本站这条 3 分钟的 ALTER TABLE 正卡在锁等待上 —— 它自己又是别人（41237 的长事务）的阻塞者，形成锁链。'
      ]);
    }
    if (/^SELECT\s+pg_cancel_backend/i.test(cmd)) {
      var pid = (cmd.match(/\(\s*(\d+)\s*\)/) || [])[1] || '41237';
      return okHint(psqlResult(['pg_cancel_backend'], [['t']], o),
        ['（教学提示）pg_cancel_backend(' + pid + ') 只取消该会话**当前正在执行的语句**，连接还活着（比 pg_terminate_backend 温和）；' +
        '如果它在一个事务里，事务会进入 aborted 状态，应用需要回滚重试。']);
    }
    if (/^EXPLAIN/i.test(cmd)) {
      if (/FORMAT\s+JSON/i.test(cmd)) {
        return ok([JSON.stringify([{ Plan: {
          Node_Type: 'Aggregate', Strategy: 'Plain', Startup_Cost: 4211884.42, Total_Cost: 4211884.44, Plan_Rows: 1, Actual_Startup_Time: 1842.114, Actual_Total_Time: 1842.882, Actual_Rows: 1, Actual_Loops: 1,
          Plans: [{ Node_Type: 'Seq Scan', Relation_Name: 'orders', Filter: "(created_at >= '2024-03-01 00:00:00'::timestamp without time zone)", Rows_Removed_by_Filter: 18421104, Plan_Rows: 1842110, Actual_Rows: 1842110, Actual_Total_Time: 1841.882, Shared_Hit_Blocks: 184211, Shared_Read_Blocks: 42118 }
          ]
        }, Planning_Time: 0.421, Execution_Time: 1842.882 }], null, 1)]);
      }
      if (/BUFFERS/i.test(cmd)) {
        return okHint([
          'Hash Join  (cost=42118.42..91820441.22 rows=18204412 width=24) (actual time=42.114..8421.882 rows=17821104 loops=1)',
          '  Hash Cond: (o.user_id = u.id)',
          '  Buffers: shared hit=184211 read=421188 written=0',
          '  ->  Seq Scan on orders o  (cost=0.00..42118842.00 rows=18204412 width=24) (actual time=0.412..4211.208 rows=18204412 loops=1)',
          '        Buffers: shared hit=84211 read=388204',
          '  ->  Hash  (cost=28411.40..28411.40 rows=982140 width=8) (actual time=41.114..41.114 rows=982140 loops=1)',
          '        Buffers: shared hit=100000 read=32984',
          'Planning Time: 0.882 ms',
          'Execution Time: 8421.882 ms'
        ], [
          '（教学提示）加 BUFFERS 后能区分"耗时是花在磁盘读还是 CPU"：`shared hit` 是缓存命中、`shared read` 是真实磁盘读。' +
          '这里 read=421188 说明缓存不够（shared_buffers 太小），加机器内存比优化 SQL 更有效。'
        ]);
      }
      if (/ANALYZE/i.test(cmd)) {
        return okHint([
          'Seq Scan on orders  (cost=0.00..4211884.00 rows=1842110 width=24) (actual time=0.412..3184.882 rows=1 loops=1)',
          '  Filter: (user_id = 8812)',
          '  Rows Removed by Filter: 18204411',
          'Planning Time: 0.412 ms',
          'Execution Time: 3185.114 ms'
        ], [
          '（教学提示）`Seq Scan` = 全表扫描（没走索引）+ `Rows Removed by Filter: 18204411` = 扫了 1800 万行只留 1 行 —— ' +
          '典型缺索引。PG 的估算（rows=1842110）与实际（rows=1）差 6 个数量级，说明统计信息过期，先 `ANALYZE orders;` 再 EXPLAIN。'
        ]);
      }
      return okHint([
        'Seq Scan on orders  (cost=0.00..4211884.00 rows=1842110 width=24)',
        '  Filter: (user_id = 8812)'
      ], ['（教学提示）EXPLAIN 只**估算**不执行；要看实际耗时与行数用 EXPLAIN ANALYZE（它会真的跑一遍，生产上注意别在大表上随手加）。']);
    }
    if (/^ANALYZE\b/i.test(cmd)) {
      return okHint(['ANALYZE'], ['（教学提示）ANALYZE 刷新统计信息（不是 VACUUM，不回收空间）；统计信息过期会让优化器估算偏差几个数量级，进而选错执行计划 —— 这是"昨天还快今天就慢"的常见原因。']);
    }
    if (/^SELECT\s+reltuples/i.test(cmd)) return ok(psqlResult(['reltuples'], [[18204412]], o));
    if (/^SELECT\s+pid\s*,?\s*state/i.test(cmd)) return ok(psqlResult(['pid', 'state'], [[41237, 'active'], [41251, 'idle in transaction']], o));
    if (/^\\/.test(cmd)) return psqlMeta(cmd, ctx, HOST, o);
    if (/^(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|GRANT|REVOKE|VACUUM|ANALYZE|SET|BEGIN|COMMIT)\b/i.test(cmd)) {
      return okHint([], ['（教学提示）本站仿真只对文档里出现的那些语句给了真实感结果（SELECT version()、pg_stat_activity、EXPLAIN…）；' +
        '这条语句没有对应的仿真结果集，所以只回成功、不编造行 —— 静默给错结果比不返回更危险。']);
    }
    if (/^SELEC\b/i.test(cmd) || !/^(SELECT|SHOW|EXPLAIN|ANALYZE|\\|\()/i.test(cmd)) {
      if (/^[A-Za-z]+$/.test(cmd.trim()) || /^[A-Za-z]+\s/.test(cmd.trim())) {
        if (!/^(SELECT|SHOW|EXPLAIN|ANALYZE|SET|RESET|VACUUM|BEGIN|COMMIT|ROLLBACK|CREATE|DROP|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|WITH|COPY|TRUNCATE|COMMENT|LISTEN|NOTIFY|DISCARD|CHECKPOINT|CLUSTER|REINDEX|LOCK|PREPARE|EXECUTE|DEALLOCATE|DECLARE|FETCH|MOVE|CLOSE|CALL|DO|REFRESH)\b/i.test(cmd.trim())) {
          var tok = cmd.trim().split(/\s+/)[0];
          return fail(['psql: error: connection to server at "db-prod-01" (10.0.2.15), port 5432 failed: FATAL:  unrecognized statement',
            'ERROR:  syntax error at or near "' + tok + '"',
            'LINE 1: ' + cmd,
            '        ^',
            '（教学提示）SQL 关键字拼错时 PG 会直接指出 ' + tok + ' 附近有语法错误。']);
        }
      }
      return fail(['ERROR:  syntax error at or near "' + cmd.slice(0, 20) + '"', 'LINE 1: ' + cmd]);
    }
    return okHint([], ['（教学提示）教学环境未覆盖这条 SQL；已覆盖：SELECT version()、pg_stat_activity、pg_blocking_pids、pg_cancel_backend、EXPLAIN [ANALYZE|(ANALYZE, BUFFERS)|(…, FORMAT JSON)]、ANALYZE、SELECT reltuples、\\l \\dt \\d \\du 等元命令。']);
  }

  /* ---- pg_dump / pg_restore / pg_dumpall ---- */
  function pgdumpCommon(argv) {
    var o = { host: null, port: '5432', user: null, db: null, format: 'p', file: null, jobs: null, args: [], tables: [], schemas: [], noOwner: false, clean: false, ifExists: false, globals: false };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h' || a === '--host') { o.host = String(argv[++i] || ''); continue; }
      if (a === '-p' || a === '--port') { o.port = String(argv[++i] || '5432'); continue; }
      if (a === '-U' || a === '--username') { o.user = String(argv[++i] || ''); continue; }
      if (a === '-d' || a === '--dbname') { o.db = String(argv[++i] || ''); continue; }
      if (a === '-F' || a === '--format') { o.format = String(argv[++i] || 'p'); continue; }
      if (a.indexOf('--format=') === 0) { o.format = a.slice(9); continue; }
      if (a === '-f' || a === '--file') { o.file = String(argv[++i] || ''); continue; }
      if (a.indexOf('--file=') === 0) { o.file = a.slice(7); continue; }
      if (a === '-j' || a === '--jobs') { o.jobs = Number(argv[++i] || 1); continue; }
      if (a === '-t' || a === '--table') { o.tables.push(String(argv[++i] || '')); continue; }
      if (a === '-n' || a === '--schema') { o.schemas.push(String(argv[++i] || '')); continue; }
      if (a === '--no-owner') { o.noOwner = true; continue; }
      if (a === '--clean') { o.clean = true; continue; }
      if (a === '--if-exists') { o.ifExists = true; continue; }
      if (a === '-g' || a === '--globals-only') { o.globals = true; continue; }
      if (a === '-c') { o.clean = true; continue; }
      if (a === '-a' || a === '--data-only' || a === '-s' || a === '--schema-only' || a === '--verbose' || a === '-v' || a === '--no-acl' || a === '--no-privileges' || a === '-Z' || a === '-E') { o.args.push(a); if (a === '-Z' || a === '-E') i++; continue; }
      if (a.charAt(0) !== '-') {
        if (!o.db) o.db = a; else o.args.push(a);
      }
    }
    return o;
  }

  function pgCheckConnect(ctx, HOST, o, tool) {
    if (o.host) {
      var ip = hostsFileMap(ctx, HOST)[o.host] || (/^\d+\.\d+\.\d+\.\d+$/.test(o.host) ? o.host : null);
      if (!ip || !PG_HOSTS[o.host]) {
        return { res: fail([tool + ': error: connection to server at "' + (o.host || 'localhost') + '", port ' + o.port + ' failed: could not translate host name "' + (o.host || '') + '" to address: Name or service not known',
          '（教学提示）主机名解析不了或这台机器上没有 PostgreSQL。本站仿真里只有 db-prod-01（10.0.2.15）跑着 PG 15.6。']) };
      }
      if (String(o.port) !== '5432') return { res: fail([tool + ': error: connection to server at "' + o.host + '", port ' + o.port + ' failed: Connection refused']) };
    }
    var user = o.user || 'postgres';
    var envPass = (ctx.env || {}).PGPASSWORD;
    var real = PG_PASS[user];
    if (real === undefined) return { res: fail([tool + ': error: connection to server at "db-prod-01" (10.0.2.15), port 5432 failed: FATAL:  role "' + user + '" does not exist']) };
    if (envPass && envPass !== real) {
      return { res: fail([tool + ': error: connection to server at "db-prod-01" (10.0.2.15), port 5432 failed: FATAL:  password authentication failed for user "' + user + '"',
        '（教学提示）PGPASSWORD 里的密码不对。pg_dump/pg_restore 都不接受命令行密码参数，只能用 PGPASSWORD 环境变量或 ~/.pgpass（权限 600）。']) };
    }
    return { ok: true };
  }

  function pg_dump(argv, ctx, stdin, HOST) {
    var o = pgdumpCommon(argv);
    var chk = pgCheckConnect(ctx, HOST, o, 'pg_dump');
    if (chk.res) return chk.res;
    if (!o.db) return fail(['pg_dump: error: no database specified', '（教学提示）必须用 -d <库> 指定要备份的库（PG 的 -d 是库名，不是"默认库"开关）。']);
    if (!PG_DBS[o.db]) {
      return fail(['pg_dump: error: connection to server at "db-prod-01" (10.0.2.15), port 5432 failed: FATAL:  database "' + o.db + '" does not exist',
        '（教学提示）库不存在。用 `psql -h db-prod-01 -U postgres -l` 看实例上有哪些库。']);
    }
    if (o.format === 'd' && !o.file) {
      return fail(['pg_dump: error: option -f/--file is required for directory format (use -f <dir>)',
        '（教学提示）-F d（目录格式）必须配 -f <目录>，而且 -j（并行）只对目录格式有效 —— 这是并行备份的前提。']);
    }
    if (o.jobs && o.format !== 'd') {
      return fail(['pg_dump: error: parallel backup only supported by the directory format',
        '（教学提示）-j 并行只支持 `-F d` 目录格式；自定义格式（-F c）虽然支持**并行恢复**，但不支持并行导出。']);
    }
    var hints = [
      '（教学提示）-F 决定输出格式：p 纯文本 SQL（可直接 psql -f 执行，但恢复慢）、c 自定义格式（**推荐**，压缩、支持 pg_restore 选择性恢复与并行）、' +
      'd 目录格式（配合 -j 并行导出）、t tar 格式。纯文本只能用 psql 恢复，自定义/目录格式必须用 pg_restore。'
    ];
    if (o.file) {
      var content = o.format === 'p'
        ? '--\n-- PostgreSQL database dump\n--\n\nSET statement_timeout = 0;\nSET lock_timeout = 0;\nSET client_encoding = \'UTF8\';\n\n' +
          'CREATE TABLE public.orders (\n    id bigint NOT NULL,\n    user_id bigint NOT NULL,\n    status character varying(16),\n    amount numeric(12,2),\n    created_at timestamp without time zone DEFAULT now()\n);\n\n' +
          'ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);\n\n' +
          '--\n-- PostgreSQL database dump complete\n--\n'
        : 'PGDMP (本站仿真：pg_dump 自定义/目录格式的二进制文件占位内容)';
      var wres = writeVirtualFile(ctx, o.file, content, { size: o.format === 'p' ? 4204789760 : 2147483648 });
      if (wres.err) return fail(['pg_dump: error: could not open output file "' + o.file + '": No such file or directory']);
      if (o.format === 'd') {
        ensureVirtualDir(ctx, U.resolvePath(ctx.cwd, o.file) + '/toc.dat');
      }
      hints.push('（教学提示）备份文件（' + o.file + '，格式 -F ' + o.format + '）已写入虚拟文件系统，可以直接 head/grep 看内容。' +
        '真机上这份 42GB 的库要占满 /data 盘，先看 `df -h /data`。');
    } else {
      hints.push('（教学提示）没给 -f 时 pg_dump 把 dump 写到**标准输出**（本站直接打印到屏幕）；' +
        '生产上要 `pg_dump ... -F c -f /data/backup/xx.dump` 落盘，或者管道给 gzip/obsutil。');
    }
    return okHint(o.format === 'p' && !o.file ? [
      '--', '-- PostgreSQL database dump', '--', '',
      'SET statement_timeout = 0;', 'SET lock_timeout = 0;', 'SET client_encoding = \'UTF8\';', '',
      'CREATE TABLE public.orders (', '    id bigint NOT NULL,', '    user_id bigint NOT NULL,',
      '    status character varying(16),', '    amount numeric(12,2),',
      '    created_at timestamp without time zone DEFAULT now()', ');', '',
      '--', '-- PostgreSQL database dump complete', '--'
    ] : [], hints);
  }

  function pg_restore(argv, ctx, stdin, HOST) {
    var o = { host: null, port: '5432', user: null, db: null, file: null, jobs: null, clean: false, ifExists: false, noOwner: false, list: false, include: [], args: [] };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h' || a === '--host') { o.host = String(argv[++i] || ''); continue; }
      if (a === '-p' || a === '--port') { o.port = String(argv[++i] || '5432'); continue; }
      if (a === '-U' || a === '--username') { o.user = String(argv[++i] || ''); continue; }
      if (a === '-d' || a === '--dbname') { o.db = String(argv[++i] || ''); continue; }
      if (a === '-j' || a === '--jobs') { o.jobs = Number(argv[++i] || 1); continue; }
      if (a === '-t' || a === '--table') { o.include.push(String(argv[++i] || '')); continue; }
      if (a === '-n' || a === '--schema') { o.include.push(String(argv[++i] || '')); continue; }
      if (a === '-l' || a === '--list') { o.list = true; continue; }
      if (a === '--clean') { o.clean = true; continue; }
      if (a === '--if-exists') { o.ifExists = true; continue; }
      if (a === '--no-owner') { o.noOwner = true; continue; }
      if (a === '--verbose' || a === '-v' || a === '-1' || a === '--single-transaction' || a === '--no-acl' || a === '--no-privileges') { o.args.push(a); continue; }
      if (a.charAt(0) !== '-') o.file = a;
    }
    if (!o.file) return fail(['pg_restore: error: no input file specified', '（教学提示）用法：pg_restore -h db-prod-01 -U app -d orders --clean --if-exists --no-owner -j 4 /data/backup/orders-2024-03-18.dump']);
    var r = U.readFileOrErr(ctx, o.file);
    if (r.err) {
      return fail(['pg_restore: error: could not open input file "' + o.file + '": No such file or directory',
        '（教学提示）文件不存在。先 `ls -lh /data/backup/` 确认备份文件在不在（本站的 dump 由 pg_dump -F c 生成）。']);
    }
    var chk = pgCheckConnect(ctx, HOST, o, 'pg_restore');
    if (chk.res) return chk.res;
    if (o.list) {
      return ok([';', '; Archive created at 2024-03-18 03:30:11 CST', ';     dbname: orders', ';     TOC Entries: 84',
        ';     Compression: -1', ';     Dump Version: 1.14-0', ';     Format: CUSTOM', ';',
        '; Selected TOC Entries:', ';', '218; 1259 16385 TABLE public orders app',
        '219; 1259 16390 TABLE public order_items app', '220; 1259 16395 TABLE public payments app',
        '221; 1259 16400 TABLE public users app', '3347; 0 0 ACL public TABLE orders app']);
    }
    var hints = [
      '（教学提示）--clean --if-exists 是"先删后建"的覆盖恢复：不加 --if-exists 时对象不存在会报一堆 error（虽然最后仍然是成功的，但日志很难看）。' +
      '--no-owner 跨环境恢复必备（否则会因为角色不存在而报错）。'
    ];
    if (o.jobs) hints.push('（教学提示）-j ' + o.jobs + ' 并行恢复只对**目录格式**（-F d）的归档有效；自定义格式（-F c）虽然也能 -j，但受单文件读取限制，加速有限。');
    hints.push('（教学提示）本站仿真的 pg_restore 不真的改虚拟库，只把参数含义与判读要点说清楚。');
    return okHint([], hints);
  }

  function pg_dumpall(argv, ctx, stdin, HOST) {
    var o = { host: null, port: '5432', user: null, globals: false, file: null };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-h' || a === '--host') { o.host = String(argv[++i] || ''); continue; }
      if (a === '-p' || a === '--port') { o.port = String(argv[++i] || '5432'); continue; }
      if (a === '-U' || a === '--username') { o.user = String(argv[++i] || ''); continue; }
      if (a === '-g' || a === '--globals-only') { o.globals = true; continue; }
      if (a === '-f' || a === '--file') { o.file = String(argv[++i] || ''); continue; }
    }
    var chk = pgCheckConnect(ctx, HOST, o, 'pg_dumpall');
    if (chk.res) return chk.res;
    var lines = [
      '--', '-- PostgreSQL database cluster dump', '--', '',
      'SET default_transaction_read_only = off;',
      'SET client_encoding = \'UTF8\';',
      'SET standard_conforming_strings = on;',
      ''
    ];
    if (o.globals) {
      lines = lines.concat([
        '--', '-- Roles', '--', '',
        'CREATE ROLE app;', 'ALTER ROLE app WITH NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT LOGIN;',
        'CREATE ROLE backup;', 'ALTER ROLE backup WITH NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT LOGIN;',
        'CREATE ROLE postgres;', 'ALTER ROLE postgres WITH SUPERUSER CREATEDB CREATEROLE INHERIT LOGIN REPLICATION BYPASSRLS;',
        '', '--', '-- Tablespaces', '--', '', '--', '-- PostgreSQL database cluster dump complete', '--'
      ]);
    } else {
      lines = lines.concat(['--', '-- Databases', '--', '', '\\connect orders', '', '-- (每个库的完整 dump)', '']);
    }
    var hints = [
      '（教学提示）pg_dump **不导出角色与表空间**这类全局对象，所以"只备份库"换机器恢复时会因为角色不存在而报错 —— ' +
      '配套做法是 `pg_dumpall -g > globals.sql` 单独存一份全局对象（本站示例就是这条）。',
      '（教学提示）pg_dumpall 不加 -g 会按库逐个 dump（内部就是对每个库调 pg_dump），适合小实例整体搬迁；大库还是分库 pg_dump + 并行更好。'
    ];
    return okHint(lines, hints);
  }

  /* ======================================================================
     11. MongoDB（mongosh / mongodump / mongorestore）
     ====================================================================== */

  var MONGO_HOSTS = { 'db-prod-01': { ip: '10.0.2.15', port: '27017' } };

  function mongoTarget(argv, ctx, HOST) {
    /* 支持 --uri="mongodb://user:pass@host:port/db?authSource=admin" 与 --host/--port */
    var uri = null, host = null, port = '27017', db = null, user = null, authSource = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.indexOf('--uri=') === 0) uri = a.slice(6);
      else if (a === '--uri' && argv[i + 1]) uri = String(argv[++i]);
      else if (a === '--host' && argv[i + 1]) host = String(argv[++i]);
      else if (a.indexOf('--host=') === 0) host = a.slice(7);
      else if (a === '--port' && argv[i + 1]) port = String(argv[++i]);
      else if (a.indexOf('--port=') === 0) port = a.slice(7);
      else if (a === '--authenticationDatabase' && argv[i + 1]) authSource = String(argv[++i]);
      else if (a.indexOf('--authenticationDatabase=') === 0) authSource = a.slice(24);
    }
    /* 位置参数里的 mongodb:// URI */
    if (!uri) {
      for (var j = 0; j < argv.length; j++) {
        if (String(argv[j]).indexOf('mongodb://') === 0) { uri = String(argv[j]); break; }
      }
    }
    var passwordGiven = false;
    if (uri) {
      var m = uri.match(/^mongodb:\/\/(?:([^:@/]+)(?::([^@/]*))?@)?([^:/,]+)(?::(\d+))?(?:\/([^?]*))?(?:\?(.*))?$/);
      if (!m) return { error: 'Invalid URI: ' + uri };
      user = m[1] || null;
      if (m[2] !== undefined) passwordGiven = true;
      host = m[3];
      if (m[4]) port = m[4];
      db = m[5] || null;
      if (m[6]) {
        m[6].split('&').forEach(function (kv) {
          var idx = kv.indexOf('=');
          if (idx > 0 && kv.slice(0, idx) === 'authSource') authSource = kv.slice(idx + 1);
        });
      }
    }
    if (!host) host = 'localhost';
    if (!passwordGiven) {
      for (var k = 0; k < argv.length; k++) {
        if (String(argv[k]) === '-p' || String(argv[k]) === '--password') passwordGiven = true;
      }
    }
    return { uri: uri, host: host, port: port, db: db, user: user, authSource: authSource, passwordGiven: passwordGiven };
  }

  function mongoCheck(ctx, HOST, t, tool) {
    if (localNames(HOST)[t.host]) return { ok: true };
    var ip = hostsFileMap(ctx, HOST)[t.host] || (/^\d+\.\d+\.\d+\.\d+$/.test(t.host) ? t.host : null);
    if (!ip) {
      return { res: fail(['Failed: ' + tool + ': error connecting to host: could not connect to server: server selection error: server selection timeout, current topology: { Type: Unknown, Servers: [{ Addr: ' + t.host + ':' + t.port + ', Type: Unknown, Last error: dial tcp: lookup ' + t.host + ': no such host }] }',
        '（教学提示）主机名解析不了。本站仿真里 MongoDB 与 MySQL/PG 共用 db-prod-01（10.0.2.15:27017）。']) };
    }
    var known = MONGO_HOSTS[t.host];
    if (!known) {
      for (var hn in VHOSTS) {
        if (Object.prototype.hasOwnProperty.call(VHOSTS, hn) && VHOSTS[hn].ip === ip && VHOSTS[hn].services.mongo) known = VHOSTS[hn];
      }
    }
    if (!known || String(t.port) !== '27017') {
      return { res: fail(['MongoNetworkError: connect ECONNREFUSED ' + ip + ':' + t.port,
        '（教学提示）MongoDB 默认端口是 27017；这台主机上没有该端口的 mongod（ECONNREFUSED = 端口没人监听）。']) };
    }
    if (t.user && t.user !== 'app' && t.user !== 'backup') {
      return { res: fail(['MongoServerError: Authentication failed.',
        '（教学提示）账号不存在或密码错。MongoDB 的账号建在某个库下，连接时必须用 authSource 指明认证库（建在 admin 库就写 ?authSource=admin），否则就是这句 Authentication failed。']) };
    }
    if (t.user && t.authSource !== 'admin') {
      return { res: fail(['MongoServerError: Authentication failed.',
        '（教学提示）账号建在 admin 库时必须带 `?authSource=admin`（或 --authenticationDatabase admin），漏了就是 Authentication failed —— 这是 mongosh 最常踩的坑。']) };
    }
    return { ok: true };
  }

  var MONGO_COLLECTIONS = [
    { name: 'orders', count: 18204412, size: 18421104820, storageSize: 8211882048, avgObjSize: 1012, nindexes: 3, indexSizes: { _id_: 184211048, user_id_1_status_1: 812204800, created_at_1: 421188204 } },
    { name: 'order_items', count: 42118330, size: 21421104820, storageSize: 10211882048, avgObjSize: 508, nindexes: 2, indexSizes: { _id_: 421188204, order_id_1: 1021204800 } },
    { name: 'payments', count: 9120441, size: 4121188204, storageSize: 1842110482, avgObjSize: 452, nindexes: 2, indexSizes: { _id_: 92104820, order_id_1: 302118204 } },
    { name: 'users', count: 982140, size: 184211048, storageSize: 92104820, avgObjSize: 188, nindexes: 2, indexSizes: { _id_: 10211820, email_1: 20411820 } }
  ];

  function mongoDbStats(scale) {
    var collections = MONGO_COLLECTIONS.length;
    var objects = MONGO_COLLECTIONS.reduce(function (a, c) { return a + c.count; }, 0);
    var dataSize = MONGO_COLLECTIONS.reduce(function (a, c) { return a + c.size; }, 0);
    var storageSize = MONGO_COLLECTIONS.reduce(function (a, c) { return a + c.storageSize; }, 0);
    var indexSize = MONGO_COLLECTIONS.reduce(function (a, c) {
      var s = 0;
      for (var k in c.indexSizes) if (Object.prototype.hasOwnProperty.call(c.indexSizes, k)) s += c.indexSizes[k];
      return a + s;
    }, 0);
    var f = scale || 1;
    return {
      db: 'orders', collections: collections, views: 0, objects: objects,
      avgObjSize: Math.round(dataSize / objects),
      dataSize: Math.round(dataSize / f), storageSize: Math.round(storageSize / f),
      indexes: MONGO_COLLECTIONS.reduce(function (a, c) { return a + c.nindexes; }, 0),
      indexSize: Math.round(indexSize / f),
      totalSize: Math.round((storageSize + indexSize) / f),
      scaleFactor: f,
      fsUsedSize: Math.round(21421104820 / f), fsTotalSize: Math.round(107374182400 / f)
    };
  }

  function mongoshEval(expr, t) {
    var e = String(expr).trim();
    if (/^db\.stats\(/.test(e)) {
      var ms = e.match(/db\.stats\(\s*([0-9*\s]+)\)/);
      var scale = null;
      if (ms) {
        var parts = ms[1].split('*').map(function (x) { return Number(x.trim()); });
        scale = parts.reduce(function (a, b) { return a * b; }, 1);
      }
      var st = mongoDbStats(scale);
      if (/\.collections\s*$/.test(e)) return String(st.collections);
      if (/\.objects\s*$/.test(e)) return String(st.objects);
      if (/\.dataSize\s*$/.test(e)) return String(st.dataSize);
      var out = ['{', '  db: \'orders\','];
      Object.keys(st).forEach(function (k, i, arr) {
        var v = st[k];
        out.push('  ' + k + ': ' + (typeof v === 'string' ? '\'' + v + '\'' : v) + (i === arr.length - 1 ? '' : ','));
      });
      out.push('}');
      return out.join('\n');
    }
    var mcol = e.match(/^db\.([A-Za-z_][A-Za-z0-9_]*)\.stats\(([^)]*)\)(?:\.(\w+))?/);
    if (mcol) {
      var coll = mcol[1];
      var c = MONGO_COLLECTIONS.filter(function (x) { return x.name === coll; })[0];
      if (!c) return null;
      var sub = mcol[3];
      if (sub === 'indexSizes') {
        var lines = ['{'];
        var ks = Object.keys(c.indexSizes);
        ks.forEach(function (k, i) { lines.push('  ' + k + ': ' + c.indexSizes[k] + (i === ks.length - 1 ? '' : ',')); });
        lines.push('}');
        return lines.join('\n');
      }
      var st2 = {
        ns: 'orders.' + coll, size: c.size, count: c.count, avgObjSize: c.avgObjSize,
        storageSize: c.storageSize, capped: false, nindexes: c.nindexes,
        totalIndexSize: Object.keys(c.indexSizes).reduce(function (a, k) { return a + c.indexSizes[k]; }, 0)
      };
      if (sub === 'count') return String(c.count);
      if (sub === 'size') return String(c.size);
      if (sub === 'storageSize') return String(c.storageSize);
      if (sub === 'nindexes') return String(c.nindexes);
      var out2 = ['{', '  ns: \'orders.' + coll + '\','];
      var k2 = Object.keys(st2).slice(1);
      k2.forEach(function (k, i) { out2.push('  ' + k + ': ' + st2[k] + (i === k2.length - 1 ? '' : ',')); });
      out2.push('}');
      return out2.join('\n');
    }
    if (/^db\.([A-Za-z_][A-Za-z0-9_]*)\.getIndexes\(\)/.test(e)) {
      var mc = e.match(/^db\.([A-Za-z_][A-Za-z0-9_]*)\./);
      var coll2 = mc[1];
      var c2 = MONGO_COLLECTIONS.filter(function (x) { return x.name === coll2; })[0];
      if (!c2) return null;
      var arr = ['['];
      var keys = Object.keys(c2.indexSizes);
      keys.forEach(function (k, i) {
        var spec = k === '_id_' ? '{ v: 2, key: { _id: 1 }, name: \'_id_\' }' :
          k === 'user_id_1_status_1' ? '{ v: 2, key: { user_id: 1, status: 1 }, name: \'user_id_1_status_1\' }' :
            '{ v: 2, key: { ' + k.replace(/_1$/, '') + ': 1 }, name: \'' + k + '\' }';
        arr.push('  ' + spec + (i === keys.length - 1 ? '' : ','));
      });
      arr.push(']');
      return arr.join('\n');
    }
    if (/^db\.([A-Za-z_][A-Za-z0-9_]*)\.find\(/.test(e)) {
      var mf = e.match(/^db\.([A-Za-z_][A-Za-z0-9_]*)\.find\(/);
      var coll3 = mf[1];
      var c3 = MONGO_COLLECTIONS.filter(function (x) { return x.name === coll3; })[0];
      if (!c3) return null;
      var isExplain = /\.explain\(/.test(e);
      var isPaid = /status:\s*'PAID'|status:\s*"PAID"/.test(e);
      if (isExplain) {
        var scan = /user_id/.test(e) ? 'IXSCAN' : 'COLLSCAN';
        return JSON.stringify({
          queryPlanner: {
            namespace: 'orders.' + coll3,
            indexFilterSet: false,
            winningPlan: scan === 'IXSCAN'
              ? { stage: 'FETCH', inputStage: { stage: 'IXSCAN', keyPattern: { user_id: 1, status: 1 }, indexName: 'user_id_1_status_1' } }
              : { stage: 'COLLSCAN', direction: 'forward' },
            rejectedPlans: []
          },
          executionStats: {
            executionSuccess: true, nReturned: isPaid ? 5 : 1,
            executionTimeMillis: scan === 'IXSCAN' ? 3 : 8421,
            totalKeysExamined: scan === 'IXSCAN' ? 6 : 0,
            totalDocsExamined: scan === 'IXSCAN' ? 6 : 18204412
          }
        }, null, 1);
      }
      var rows = [];
      for (var i = 0; i < (isPaid ? 5 : 1); i++) {
        rows.push(JSON.stringify({
          _id: 'ObjectId("65f8' + (100000 + i) + 'a1b2c3d4e5f6' + (i + 1) + '")'.replace(/"/g, ''),
          order_id: 8812 + i, user_id: 8812, status: isPaid ? 'PAID' : 'CREATED',
          amount: '¥' + (1240 + i * 120) + '.00', created_at: 'ISODate("2024-03-18T09:4' + (1 + i) + ':18.552Z")'
        }));
      }
      return '[\n  ' + rows.join(',\n  ') + '\n]';
    }
    if (/^db\.([A-Za-z_][A-Za-z0-9_]*)\.countDocuments\(\)/.test(e)) {
      var n = e.match(/^db\.([A-Za-z_][A-Za-z0-9_]*)\./)[1];
      var cc = MONGO_COLLECTIONS.filter(function (x) { return x.name === n; })[0];
      return cc ? String(cc.count) : '0';
    }
    if (/^db\.getName\(\)/.test(e)) return 'orders';
    if (/^db\.version\(\)/.test(e)) return '7.0.5';
    if (/^rs\.status\(\)/.test(e)) {
      return [
        '{', '  set: \'rs0\',', '  date: ISODate("2024-03-18T09:52:10.114Z"),',
        '  myState: 1,', '  term: NumberLong(3),', '  syncSourceHost: \'\',',
        '  members: [',
        '    { _id: 0, name: \'db-prod-01:27017\', health: 1, state: 1, stateStr: \'PRIMARY\', uptime: 2592041, optimeDate: ISODate("2024-03-18T09:52:09Z") },',
        '    { _id: 1, name: \'db-prod-02:27017\', health: 1, state: 2, stateStr: \'SECONDARY\', uptime: 2591982, optimeDate: ISODate("2024-03-18T09:52:08Z") },',
        '    { _id: 2, name: \'db-prod-03:27017\', health: 1, state: 2, stateStr: \'SECONDARY\', uptime: 1842110, optimeDate: ISODate("2024-03-18T09:52:07Z") }',
        '  ],', '  ok: 1', '}'
      ];
    }
    if (/^show\s+dbs/i.test(e)) return ['admin   184.00 KiB', 'config   60.00 KiB', 'local   1.42 GiB', 'orders   119.00 GiB'];
    if (/^show\s+collections/i.test(e)) return MONGO_COLLECTIONS.map(function (c) { return c.name; });
    if (/^db\.([A-Za-z_][A-Za-z0-9_]*)\.createIndex\(/.test(e)) {
      var mi = e.match(/createIndex\(\s*\{([^}]*)\}/);
      var spec = mi ? mi[1].replace(/\s+/g, '') : 'user_id:1,status:1';
      var name = spec.split(',').map(function (kv) { return kv.split(':')[0] + '_' + kv.split(':')[1]; }).join('_');
      return name;
    }
    if (/^db\.([A-Za-z_][A-Za-z0-9_]*)\.drop\(\)/.test(e)) return 'true';
    return null;
  }

  function mongosh(argv, ctx, stdin, HOST) {
    var t = mongoTarget(argv, ctx, HOST);
    if (t.error) return fail(['Error: ' + t.error, '（教学提示）URI 格式：mongodb://[用户:密码@]主机[:端口][/库][?选项]，选项里最常漏的是 authSource=admin。']);
    var chk = mongoCheck(ctx, HOST, t, 'mongosh');
    if (chk.res) return chk.res;
    var evalExpr = null, quiet = false, shellFile = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--eval' && argv[i + 1] !== undefined) evalExpr = String(argv[++i]);
      else if (a.indexOf('--eval=') === 0) evalExpr = a.slice(7);
      else if (a === '--quiet' || a === '-q') quiet = true;
      else if (a === '--file' && argv[i + 1]) shellFile = String(argv[++i]);
    }
    var hints = [];
    if (t.user && t.authSource === 'admin') hints.push('（教学提示）账号建在 admin 库时必须带 `?authSource=admin`（或 --authenticationDatabase admin），否则就是 Authentication failed。');
    if (!evalExpr && !shellFile) {
      return okHint([
        '（教学环境不模拟交互式 Shell：真机上 mongosh 会进 test> 提示符，这里请用 --eval 一次执行）',
        '例：mongosh "mongodb://db-prod-01:27017/orders" --quiet --eval "db.stats().collections"',
        '进 Shell 后常用：show dbs / show collections / db.getName() / db.stats() / rs.status() / db.currentOp()'
      ], hints);
    }
    if (shellFile) {
      var r = U.readFileOrErr(ctx, shellFile);
      if (r.err) return fail(['Error: Cannot read file ' + shellFile + ': No such file or directory']);
      return okHint(['（教学提示）已读取 ' + shellFile + '（本站仿真不逐行执行脚本文件）。'], hints);
    }
    var res = mongoshEval(evalExpr, t);
    if (res === null) {
      return okHint([], hints.concat([
        '（教学提示）本站仿真只对文档里出现的表达式给了真实感数据：db.stats()、db.<集合>.stats()、db.<集合>.getIndexes()、' +
        'db.<集合>.find().explain()、db.<集合>.countDocuments()、db.getName()、db.version()、rs.status()、show dbs/collections。' +
        '表达式 `' + evalExpr + '` 没有对应结果，所以不编造输出。'
      ]));
    }
    if (Array.isArray(res)) res.forEach(function (l) { hints.push(l); return l; });
    if (Array.isArray(res)) return okHint([], hints);
    var lines = String(res).split('\n');
    if (!quiet && !String(evalExpr).match(/^db\.stats|^db\.\w+\.stats/)) {
      /* mongosh 在非 quiet 模式下会打印连接信息；这里保持精简 */
    }
    hints.push('（教学提示）mongosh 是 MongoDB 5.0 起的官方 Shell（老版本用的 mongo 命令已随 6.0 移除）；索引往往比数据还大，用 db.<集合>.stats().indexSizes 排查磁盘暴涨。');
    return okHint(lines, hints);
  }

  function mongodump(argv, ctx, stdin, HOST) {
    var t = mongoTarget(argv, ctx, HOST);
    var chk = mongoCheck(ctx, HOST, t, 'mongodump');
    if (chk.res) return chk.res;
    var out = null, collection = null, gzip = argv.indexOf('--gzip') !== -1, archive = null, nsInclude = null, opLog = argv.indexOf('--oplog') !== -1;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--out' && argv[i + 1]) out = String(argv[++i]);
      else if (a.indexOf('--out=') === 0) out = a.slice(6);
      else if (a === '--collection' && argv[i + 1]) collection = String(argv[++i]);
      else if (a.indexOf('--collection=') === 0) collection = a.slice(13);
      else if (a === '--archive' && argv[i + 1]) archive = String(argv[++i]);
      else if (a.indexOf('--archive=') === 0) archive = a.slice(10);
      else if (a === '--nsInclude' && argv[i + 1]) nsInclude = String(argv[++i]);
      else if (a.indexOf('--nsInclude=') === 0) nsInclude = a.slice(12);
      else if (a === '--db' && argv[i + 1]) t.db = String(argv[++i]);
      else if (a.indexOf('--db=') === 0) t.db = a.slice(5);
    }
    if (!out && !archive) {
      return fail(['Failed: error writing data for collection `orders.orders` to disk: error reading collection: EOF',
        '（教学提示）mongodump 需要 `--out=<目录>`（每个集合一个 .bson + .metadata.json）或 `--archive=<文件>`（打成单个归档，便于传到 OBS/S3）。']);
    }
    var dbName = t.db || 'orders';
    var colls = MONGO_COLLECTIONS.filter(function (c) { return !collection || c.name === collection; });
    if (collection && !colls.length) {
      return fail(['Failed: error dumping collection: ' + dbName + '.' + collection + ': collection does not exist',
        '（教学提示）集合名写错。用 `mongosh "mongodb://db-prod-01:27017/' + dbName + '" --quiet --eval "show collections"` 看有哪些集合。']);
    }
    var lines = ['2024-03-18T09:52:10.114+0800\twriting ' + dbName + '.' + (collection || colls[0].name) + ' to ' + (archive || out + '/' + dbName + '/' + (collection || colls[0].name) + '.bson' + (gzip ? '.gz' : ''))];
    colls.forEach(function (c) {
      lines.push('2024-03-18T09:52:1' + (Math.min(9, 1 + colls.indexOf(c))) + '.882+0800\tdumping ' + dbName + '.' + c.name + ' (' + c.count + ' documents)');
    });
    if (opLog) lines.push('2024-03-18T09:52:19.114+0800\tdumping oplog to ' + (out || '.') + '/oplog.bson');
    lines.push('2024-03-18T09:52:19.882+0800\tdone dumping ' + dbName + ' (' + colls.reduce(function (a, c) { return a + c.count; }, 0) + ' documents)');
    if (out) {
      var dir = U.resolvePath(ctx.cwd, out) + '/' + dbName;
      ensureVirtualDir(ctx, dir);
      colls.forEach(function (c) {
        writeVirtualFile(ctx, dir + '/' + c.name + '.bson' + (gzip ? '.gz' : ''), 'BSON (本站仿真占位内容) ' + c.name, { size: c.storageSize });
        writeVirtualFile(ctx, dir + '/' + c.name + '.metadata.json', JSON.stringify({ indexFiles: Object.keys(c.indexSizes), collectionName: c.name }, null, 4), {});
      });
      lines.push('（教学提示）备份文件已写入虚拟文件系统：' + out + '/' + dbName + '/ —— `ls` 能看到 <集合>.bson 与 <集合>.metadata.json。');
    }
    return okHint(lines, [
      '（教学提示）mongodump 导出的是 **BSON**（不是 SQL），输出结构 `<库>/<集合>.bson` + `<集合>.metadata.json`（存索引定义）。' +
      '--gzip 体积能降到 1/3 左右；--oplog 让副本集备份在时间点上一致（单机 mongod 会报 "Can\'t take a backup of a cluster with no oplog"）。',
      '（教学提示）恢复时索引会从 .metadata.json 自动重建，大集合重建索引很慢（可能比导数据还久），要有心理预期。'
    ]);
  }

  function mongorestore(argv, ctx, stdin, HOST) {
    var t = mongoTarget(argv, ctx, HOST);
    var chk = mongoCheck(ctx, HOST, t, 'mongorestore');
    if (chk.res) return chk.res;
    var dir = null, gzip = argv.indexOf('--gzip') !== -1, drop = argv.indexOf('--drop') !== -1, nsInclude = null, archive = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--dir' && argv[i + 1]) dir = String(argv[++i]);
      else if (a.indexOf('--dir=') === 0) dir = a.slice(6);
      else if (a === '--nsInclude' && argv[i + 1]) nsInclude = String(argv[++i]);
      else if (a.indexOf('--nsInclude=') === 0) nsInclude = a.slice(12);
      else if (a === '--archive' && argv[i + 1]) archive = String(argv[++i]);
      else if (a.indexOf('--archive=') === 0) archive = a.slice(10);
    }
    if (!dir && !archive) return fail(['Failed: no input directory or archive specified', '（教学提示）用法：mongorestore --uri="mongodb://db-prod-01:27017/orders" --gzip --dir=/data/backup/mongo-2024-03-18']);
    var lines = [];
    if (dir) {
      var d = U.findNode(ctx.root, U.resolvePath(ctx.cwd, dir));
      if (!d || d.type !== 'dir') {
        return fail(['Failed: restore error: directory \'' + dir + '\' does not exist',
          '（教学提示）目录不存在。mongorestore 的 --dir 必须指向 mongodump 的输出**父目录**（里面有 <库名>/ 子目录）。']);
      }
      lines.push('2024-03-18T09:53:02.114+0800\tpreparing collections to restore from ' + dir);
      lines.push('2024-03-18T09:53:02.208+0800\tfound ' + MONGO_COLLECTIONS.length + ' collections');
      MONGO_COLLECTIONS.forEach(function (c) {
        lines.push('2024-03-18T09:53:02.' + (300 + MONGO_COLLECTIONS.indexOf(c)) + '+0800\treading metadata for orders.' + c.name + ' from ' + dir + '/orders/' + c.name + '.metadata.json');
        if (drop) lines.push('2024-03-18T09:53:02.882+0800\tdropping collection: orders.' + c.name);
        lines.push('2024-03-18T09:53:1' + MONGO_COLLECTIONS.indexOf(c) + '.114+0800\trestoring orders.' + c.name + ' from ' + dir + '/orders/' + c.name + '.bson' + (gzip ? '.gz' : ''));
        lines.push('2024-03-18T09:53:4' + MONGO_COLLECTIONS.indexOf(c) + '.882+0800\tfinished restoring orders.' + c.name + ' (' + c.count + ' documents, 0 failures)');
      });
      lines.push('2024-03-18T09:54:02.114+0800\t' + MONGO_COLLECTIONS.reduce(function (a, c) { return a + c.count; }, 0) + ' document(s) restored successfully. 0 document(s) failed to restore.');
    } else {
      lines.push('2024-03-18T09:53:02.114+0800\tarchive format detected, restoring from ' + archive);
      lines.push('2024-03-18T09:54:02.114+0800\t' + MONGO_COLLECTIONS.reduce(function (a, c) { return a + c.count; }, 0) + ' document(s) restored successfully. 0 document(s) failed to restore.');
    }
    var hints = [
      '（教学提示）不加 --drop 时**不会删除已有数据**：同名集合里的文档会按 _id 追加/覆盖（_id 相同的会被覆盖），所以"恢复成事故前的样子"并不成立 —— ' +
      '要真正的覆盖式恢复必须加 --drop（先清空该集合）或用 --nsFrom/--nsTo 恢复到新集合再切换。'
    ];
    if (nsInclude) hints.push('（教学提示）--nsInclude="' + nsInclude + '" 只恢复匹配的命名空间（可写多次）；配合 --drop 就是"只重建这一张表"。');
    hints.push('（教学提示）本站仿真的 mongorestore 不真的改虚拟库，只把参数含义与判读要点说清楚。');
    return okHint(lines, hints);
  }

  /* ======================================================================
     12. xargs（redis 示例里的管道组合要用：--scan | xargs redis-cli DEL / TYPE / TTL）
     ====================================================================== */

  function xargsImpl(argv, ctx, stdin, HOST) {
    var maxArgs = null, replaceStr = null, delim = '\n', cmdTokens = [];
    var i;
    /* ⚠️ xargs 自己的选项**只在遇到命令名之前**解析。
       之前的写法把整条 argv 当一个平面列表扫，于是 `-p` 被当成 xargs 的
       `--interactive`（它确实是！）跳掉 —— 可这里的 `-p` 是**传给子命令**的：
         … | xargs -I{} redis-cli -h cache-prod-01 -p 6379 TYPE {}
       结果 `-p` 被吃掉、`6379` 成了孤立的位置参数，子命令收到
       `-h cache-prod-01 6379 TYPE <key>` → `(error) ERR unknown command '6379'`。
       真 xargs 的语义是：**第一个非选项参数就是命令，其后所有参数原样转交**。
       所以这里一旦碰到命令名就停止解析，剩下的全部原样进 cmdTokens。 */
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      /* 带值的短选项（值可能是下一个参数，也可能紧贴） */
      if (a === '-n' || a === '--max-args') { maxArgs = Number(argv[++i] || 1); continue; }
      if (a.indexOf('-n') === 0 && a.length > 2) { maxArgs = Number(a.slice(2)); continue; }
      if (a === '-I' || a === '--replace') { replaceStr = String(argv[i + 1] === undefined ? '{}' : argv[++i]); continue; }
      if (a.indexOf('-I') === 0 && a.length > 2) { replaceStr = a.slice(2); continue; }
      if (a === '-d' || a === '--delimiter') { delim = String(argv[++i] || '\n'); continue; }
      if (a === '-P' || a === '--max-procs' || a === '-s' || a === '--max-chars' || a === '-a' || a === '--arg-file' ||
        a === '-E' || a === '--eof' || a === '-L' || a === '--max-lines') { i++; continue; }
      /* 不带值的开关：只影响 xargs 自身行为，本站按"无副作用"处理 */
      if (a === '-0' || a === '--null') { delim = '\0'; continue; }
      if (a === '-r' || a === '--no-run-if-empty' || a === '-t' || a === '--verbose' ||
        a === '-p' || a === '--interactive' || a === '-x' || a === '--exit' ||
        a === '-o' || a === '--open-tty' || a === '--show-limits') { continue; }
      /* 第一个非选项参数 = 要执行的命令，**它和它后面的一切都不再当选项解析** */
      if (a === '--') { i++; }
      for (; i < argv.length; i++) cmdTokens.push(String(argv[i]));
      break;
    }
    if (!cmdTokens.length) {
      return fail(['xargs: 缺少要执行的命令', '（教学提示）用法：`<产生列表的命令> | xargs -n 100 <命令>` 或 `... | xargs -I{} <命令> {}`。']);
    }
    var items = [];
    (stdin || []).forEach(function (line) {
      String(line).split(delim).forEach(function (piece) {
        /* 未指定分隔符时按空白切词（真 xargs 默认行为） */
        if (delim === '\n') {
          String(piece).split(/\s+/).forEach(function (w) { if (w) items.push(w); });
        } else if (piece !== '') items.push(piece);
      });
    });
    if (!items.length) return ok([]);      /* xargs 默认没有输入就不执行（-r 只是显式声明） */

    var cmdName = String(cmdTokens[0]).replace(/^\.\//, '');
    var impl = window.CC_DB_EXTRA.lookup(cmdName);
    if (!impl) {
      return codeFail(['xargs: ' + cmdName + ': command not found',
        '（教学提示）xargs 只能调用本站已实现的命令；`' + cmdName + '` 不在其中。'], 127);
    }

    var batches = [];
    if (replaceStr) {
      items.forEach(function (it) { batches.push([it]); });
    } else {
      var size = maxArgs && maxArgs > 0 ? maxArgs : items.length;
      for (var k = 0; k < items.length; k += size) batches.push(items.slice(k, k + size));
    }
    var out = [];
    for (var b = 0; b < batches.length; b++) {
      var args = [];
      if (replaceStr) {
        cmdTokens.slice(1).forEach(function (t) {
          if (String(t).indexOf(replaceStr) !== -1) {
            batches[b].forEach(function (it) { args.push(String(t).split(replaceStr).join(it)); });
          } else args.push(t);
        });
      } else {
        cmdTokens.slice(1).forEach(function (t) { args.push(t); });
        args = args.concat(batches[b]);
      }
      var savedEnv = ctx.shell ? ctx.shell.env : null;
      var savedCwd = ctx.shell ? ctx.shell.cwd : null;
      var res = impl(args, ctx, null, HOST);
      if (ctx.shell) { ctx.shell.env = savedEnv; ctx.shell.cwd = savedCwd; }
      if (res && res.out && res.out.length) out = out.concat(res.out);
      /* 子命令的 **错误** 必须冒泡（xargs 里有一条失败整条管道就失败），
         但"教学提示"这类 stderr 不是错误，冒泡上去会把管道输出淹掉 ——
         真 xargs 也不会把子进程的 stderr 变成自己的 stderr。 */
      if (res && res.code) {
        var childErr = (res.err || []).filter(function (e2) { return !/^（教学提示）/.test(String(e2)); });
        return { out: out, err: childErr, code: res.code };
      }
    }
    return ok(out);
  }

  /* ======================================================================
     13. 注册
     ====================================================================== */

  window.CC_DB_EXTRA = {
    /* redis-cli 的远端分支（shell.js 在"非本机主机"时调用） */
    redisCli: redisRemote,
    /* mysql -e 的扩展 SQL 兜底（shell.js 自己的分派没覆盖时调用） */
    mysqlExec: mysqlExtra,
    /* xargs 需要的"按名字找命令实现"钩子 */
    registry: {},
    lookup: function (name) {
      var n = String(name);
      if (window.CC_DB_EXTRA.registry[n]) return window.CC_DB_EXTRA.registry[n];
      if (LOCAL_LOOKUP[n]) return LOCAL_LOOKUP[n];
      /* ⚠️ 还要回落到 shell.js 的核心命令表。
         `registry` 只收"本文件包装 extend 之后"注册的命令、`LOCAL_LOOKUP` 只手列了几条，
         于是 shell.js 自带的那些（`mv`/`rm`/`ping`/`chmod`…）在 xargs 眼里**全部不存在**：
           find … | xargs -I {} mv {} /data/archive/     → xargs: mv: command not found
         站内 lb-xargs 的三条示例正好各踩一个（mv / ping / rm）。
         这不是"教学环境故意不支持"，而是注册表漏了 —— xargs 本来就该能调任何已实现的命令。 */
      var core = window.CC_SHELL && window.CC_SHELL.cmds;
      if (core && typeof core[n] === 'function') return core[n];
      return null;
    },
    hosts: VHOSTS
  };

  /* shell.js 自己的命令（redis-cli / mysql 等）在 extend 被包装之前就注册好了，
     注册表拿不到它们。xargs 要能调 redis-cli，所以这几条单独挂一份实现引用。 */
  var LOCAL_LOOKUP = {
    'redis-cli': function (argv, ctx, stdin, HOST) {
      /* xargs 传进来的 argv 不含命令名（与 shell.js 调用 CMDS 的约定一致） */
      var r = redisRemote(argv, ctx, stdin, HOST);
      if (r.handled) return { out: r.out || [], err: r.err || [], code: r.code === undefined ? 0 : r.code };
      return { out: [], err: ['xargs: redis-cli: 本机实例请直接执行，不经过 xargs（教学环境限制）'], code: 127 };
    },
    mysql: function (argv, ctx, stdin, HOST) {
      var o = parseMysqlCommon(argv, null);
      if (o.sql === null) return { out: [], err: ['mysql: 交互式客户端不模拟'], code: 1 };
      var conn = mysqlConnect(ctx, HOST, o, 'mysql');
      if (conn.res) return conn.res;
      if (o.db && !MYSQL_DBS[o.db]) return fail([mysqlErr(1049, '42000', "Unknown database '" + o.db + "'")]);
      /* `USE <库>` 必须先按"库是否存在"判定：它是最常见的走错库的入口，
         真 mysql 会回 ERROR 1049 并以 1 退出。不拦这一条的话它会落到
         mysqlExecExtra 的兜底分支，变成"退出码 0、什么都不输出" ——
         学员会以为切库成功了，后面所有查询都在错误的库上跑。 */
      var useM = String(o.sql).match(/^\s*use\s+`?([A-Za-z0-9_$]+)`?\s*;?\s*$/i);
      if (useM && !MYSQL_DBS[useM[1]]) {
        return fail([mysqlErr(1049, '42000', "Unknown database '" + useM[1] + "'")]);
      }
      var out = [];
      var stmts = String(o.sql).split(';').map(function (s) { return s.trim(); }).filter(Boolean);
      for (var i = 0; i < stmts.length; i++) {
        var r2 = mysqlExecExtra(ctx, HOST, { user: o.user, db: o.db, batch: o.batch }, stmts[i]);
        out = out.concat(r2.out || []);
        if (r2.code) return { out: out, err: r2.err || [], code: r2.code };
      }
      return { out: out, err: [], code: 0 };
    }
  };

  /* 包装 extend：shell.js 的 extend 只注册、不暴露 CMDS，xargs 需要按名字取实现。
     包一层就能拿到所有模块注册过的命令（含 shell.js 自己的 CMDS 对象引用）。 */
  (function () {
    var orig = window.CC_SHELL.extend;
    window.CC_SHELL.extend = function (mod) {
      var added = orig.call(window.CC_SHELL, mod);
      Object.keys(mod || {}).forEach(function (k) {
        if (typeof mod[k] === 'function') window.CC_DB_EXTRA.registry[k] = mod[k];
      });
      return added;
    };
  })();

  var registered = window.CC_SHELL.extend({
    etcdctl: etcdctl,
    'kafka-topics.sh': kafkaTopicsCmd,
    'kafka-consumer-groups.sh': kafkaConsumerGroups,
    'kafka-console-consumer.sh': kafkaConsoleConsumer,
    'kafka-console-producer.sh': kafkaConsoleProducer,
    rabbitmqctl: rabbitmqctl,
    'rabbitmq-diagnostics': rabbitmqDiagnostics,
    'rabbitmq-plugins': function (argv, ctx, stdin, HOST) {
      var list = argv.indexOf('list') !== -1;
      var enable = argv.indexOf('enable') !== -1;
      var disable = argv.indexOf('disable') !== -1;
      var explicitOnly = argv.indexOf('-E') !== -1;
      var plugins = [
        { name: 'rabbitmq_management', state: 'E*', desc: 'RabbitMQ Management Console（Web UI + HTTP API，端口 15672）' },
        { name: 'rabbitmq_management_agent', state: 'e*', desc: 'Collects management data' },
        { name: 'rabbitmq_prometheus', state: 'E*', desc: 'Prometheus metrics（端口 15692）' },
        { name: 'rabbitmq_shovel', state: ' ', desc: 'Data Shovel（跨集群搬消息）' },
        { name: 'rabbitmq_shovel_management', state: ' ', desc: 'Shovel 管理界面' },
        { name: 'rabbitmq_federation', state: ' ', desc: 'Federation（联邦）' },
        { name: 'rabbitmq_federation_management', state: ' ', desc: 'Federation 管理界面' },
        { name: 'rabbitmq_web_mqtt', state: ' ', desc: 'Web MQTT 插件' },
        { name: 'rabbitmq_auth_backend_ldap', state: ' ', desc: 'LDAP 认证后端' }
      ];
      if (list || (!enable && !disable)) {
        var rows = plugins.filter(function (p) { return !explicitOnly || p.state === 'E*'; })
          .map(function (p) { return ['[' + p.state + '] ' + p.name, p.desc]; });
        return okHint(rows.map(function (r) { return r[0] + '  ' + r[1]; }), [
          '（教学提示）[E*] 显式启用、[e*] 隐式启用（被别的插件依赖带起来的）、[ ] 未启用。启用/禁用插件**动态生效、不需要重启节点**，' +
          '但会短暂影响服务（重建插件依赖关系）；集群环境要在**每个节点**上执行。'
        ]);
      }
      var name = argv.filter(function (a) { return String(a).charAt(0) !== '-'; })[1] || '';
      var known = plugins.filter(function (p) { return p.name === name; })[0];
      if (!known) return codeFail(['Error: The following plugins were not found:', name,
        '（教学提示）插件名写错。先 `rabbitmq-plugins list` 看可用插件（名称必须完全一致）。'], 70);
      if (enable) {
        known.state = 'E*';
        return okHint(['Enabling plugins on node ' + RABBIT_NODE + ':', name,
          'The following plugins have been configured:',
          '  ' + name,
          'Applying plugin configuration to ' + RABBIT_NODE + '... started 1 plugin.'],
          ['（教学提示）已启用 ' + name + '（' + known.desc + '）。启用后要看端口有没有真的监听：`ss -lntp | grep ' + (name === 'rabbitmq_management' ? '15672' : name === 'rabbitmq_prometheus' ? '15692' : '5672') + '`。']);
      }
      known.state = ' ';
      return okHint(['Disabling plugins on node ' + RABBIT_NODE + ':', name,
        'The following plugins have been configured:',
        'Applying plugin configuration to ' + RABBIT_NODE + '... stopped 1 plugin.'],
        ['（教学提示）禁用管理插件后 15672 立刻不可用；如果它是别的插件的依赖，RabbitMQ 会提示依赖关系不满足而拒绝。']);
    },
    mqadmin: mqadmin,
    sh: shDispatcher,
    mysqladmin: mysqladmin,
    mysqldump: mysqldump,
    mydumper: mydumperCmd,
    myloader: myloaderCmd,
    xtrabackup: xtrabackup,
    'pt-query-digest': ptQueryDigest,
    mysqldumpslow: mysqldumpslow,
    psql: psql,
    pg_dump: pg_dump,
    pg_restore: pg_restore,
    pg_dumpall: pg_dumpall,
    mongosh: mongosh,
    mongodump: mongodump,
    mongorestore: mongorestore,
    xargs: xargsImpl
  });

  /* 把注册表暴露给 xargs 已经由上面的 extend 包装器完成；
     这里只做一次自检：extend 被替换后，本模块自己的命令也都进了注册表。 */
  if (!window.CC_DB_EXTRA.registry['xargs']) {
    window.CC_DB_EXTRA.registry['xargs'] = xargsImpl;
  }
  if (!window.CC_DB_EXTRA.registry['etcdctl']) {
    window.CC_DB_EXTRA.registry['etcdctl'] = etcdctl;
  }

  /* redis-cli / mysql 的"扩展钩子"：把本模块的函数挂在 shell 可访问的位置 */
  window.CC_DB_EXTRA.__registered = registered;
})();
