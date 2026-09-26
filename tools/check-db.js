// tools/check-db.js · 数据库与中间件客户端命令的行为验证（纯 Node，零依赖）
/* --------------------------------------------------------------------------
   本文件只验证 assets/js/cmd-db.js 注册（以及 shell.js 里 redis-cli/mysql
   远端分支转发）的命令：etcdctl / kafka-topics.sh / kafka-consumer-groups.sh /
   rabbitmqctl / mqadmin / mysqldump / mysqladmin / mydumper / myloader /
   xtrabackup / pt-query-digest / mysqldumpslow / psql / pg_dump / mongosh /
   mongodump / redis-cli 远端 / haproxy -c -f ...

   跑法：node tools/check-db.js          （全部通过退出码 0，任一失败非零）
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
global.window = { CC_DATA: {}, CC_CATS: {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };

['data/_registry.js', 'data/termfs.js', 'assets/js/store.js', 'assets/js/shell.js'].concat(require('./_cmdlist'))
  .forEach((f) => require(path.join(ROOT, f)));

const sh = window.CC_SHELL.create();

let pass = 0, fail = 0;
const failures = [];
const seen = {};   /* 每条命令的断言计数 */

function t(cmd, name, checks) {
  const res = sh.exec(cmd);
  const text = (res.out || []).join('\n');
  const errText = (res.err || []).join('\n');
  const both = text === '' ? errText : (errText === '' ? text : text + '\n' + errText);
  const problems = [];
  (checks || []).forEach((c) => {
    if (typeof c === 'string') {
      if (both.indexOf(c) === -1) problems.push('输出缺少: ' + c);
    } else if (c instanceof RegExp) {
      if (!c.test(both)) problems.push('输出不匹配: ' + c);
    } else if (typeof c === 'function') {
      const r = c(res, text, errText, sh);
      if (r !== true) problems.push(r);
    }
  });
  seen[cmd.split(/\s+/)[0]] = (seen[cmd.split(/\s+/)[0]] || 0) + 1;
  if (problems.length) {
    fail++;
    failures.push({ cmd, name, problems, text: text.slice(0, 500), err: errText.slice(0, 300) });
  } else pass++;
  return res;
}

function outOnly(re) { return (res, text) => re.test(text) ? true : 'stdout 不匹配: ' + re; }
function errOnly(re) { return (res, text, errText) => re.test(errText) ? true : 'stderr 不匹配: ' + re; }
function codeIs(n) { return (res) => res.code === n ? true : '退出码应为 ' + n + '，实际 ' + res.code; }
function noErr(res, text, errText) { return errText === '' ? true : '不该有 stderr: ' + errText; }
function hasErr(res, text, errText) { return errText !== '' ? true : '应当报错但 stderr 为空'; }
function outEmpty(res, text) { return text === '' ? true : '应当没有 stdout，实际: ' + text.slice(0, 120); }

/* ========================================================================== */
console.log('='.repeat(70));
console.log('数据库与中间件客户端命令验证');
console.log('='.repeat(70));

/* ---------- 0. 注册情况 ---------- */
const REG = window.CC_SHELL.commands;
['etcdctl', 'kafka-topics.sh', 'kafka-consumer-groups.sh', 'rabbitmqctl', 'mqadmin',
  'mysqldump', 'mysqladmin', 'mydumper', 'myloader', 'xtrabackup', 'pt-query-digest',
  'mysqldumpslow', 'psql', 'pg_dump', 'pg_restore', 'pg_dumpall', 'mongosh', 'mongodump',
  'mongorestore', 'haproxy', 'redis-cli', 'mysql'].forEach((c) => {
    t('__reg__', '命令已注册: ' + c, [() => REG.indexOf(c) !== -1 ? true : '未注册: ' + c]);
  });

/* ---------- 1. redis-cli 远端 ---------- */
t('redis-cli -h cache-prod-01 -p 6379 PING', 'redis 远端探活', ['PONG', noErr, codeIs(0)]);
t('redis-cli -h cache-prod-01 -p 6379 INFO server', 'redis 远端 INFO server', [
  'redis_version:', 'tcp_port:6379', /uptime_in_seconds:\d+/, outOnly(/# Server/)
]);
t('redis-cli -h cache-prod-01 -p 6379 --scan --pattern "cache:*"', 'redis 远端 --scan', [
  /^cache:/m, outOnly(/cache:home:top/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 --scan --pattern "order:*"', 'redis --scan order:*', [
  outOnly(/^order:/m)
]);
t('redis-cli -h cache-prod-01 -p 6379 --scan --pattern "order:*" | head -50 | xargs -I{} redis-cli -h cache-prod-01 -p 6379 TYPE {}', 'xargs 组合批量 TYPE', [
  outOnly(/^(string|hash|list|set|zset|none)$/m), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 --scan --pattern "cache:*" | head -100 | xargs -I{} redis-cli -h cache-prod-01 -p 6379 TTL {}', 'xargs 组合批量 TTL', [
  outOnly(/\(integer\) -?[0-9]+/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 --scan --pattern "cache:*" | xargs -n 100 redis-cli -h cache-prod-01 -p 6379 DEL', 'xargs -n 批量 DEL', [
  outOnly(/\(integer\) [0-9]+/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 TTL order:8812', 'redis 远端 TTL 正数', [
  outOnly(/\(integer\) [1-9][0-9]*/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 TTL order:zzz-not-exist', 'redis 远端 TTL 不存在的 key', [
  outOnly(/\(integer\) -2/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 TTL cache:home:top', 'redis 远端 TTL 永不过期', [
  outOnly(/\(integer\) -1/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 TYPE order:8812', 'redis 远端 TYPE', [outOnly(/^string$/m), noErr]);
t('redis-cli -h cache-prod-01 -p 6379 TYPE nope:key', 'redis 远端 TYPE 不存在', [outOnly(/^none$/m), noErr]);
t('redis-cli -h cache-prod-01 -p 6379 MEMORY USAGE order:8812', 'redis 远端 MEMORY USAGE', [
  outOnly(/\(integer\) [1-9][0-9]*/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 MEMORY USAGE nope:key', 'redis 远端 MEMORY USAGE 不存在', [
  outOnly(/\(nil\)/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 --bigkeys', 'redis 远端 --bigkeys', [
  'Biggest', 'Sampled', outOnly(/big:cache:report:2024Q1|queue:orders/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 SLOWLOG GET 10', 'redis SLOWLOG GET', [
  /\(integer\) \d+/, outOnly(/order_status_log|KEYS|SCAN/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 SLOWLOG LEN', 'redis SLOWLOG LEN', [outOnly(/\(integer\) [0-9]+/), noErr]);
t('redis-cli -h cache-prod-01 -p 6379 CLUSTER INFO', 'redis CLUSTER INFO', [
  outOnly(/cluster_enabled:/), outOnly(/cluster_state:/), noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 DBSIZE', 'redis 远端 DBSIZE', [outOnly(/\(integer\) [1-9][0-9]*/), noErr]);
t('redis-cli -h cache-prod-01 -p 6379 -n 2 DBSIZE', 'redis 远端 -n 选库', [outOnly(/\(integer\) [0-9]+/), noErr]);
t('redis-cli -h cache-prod-02 -p 6379 PING', '连不上的 redis 主机要如实报错', [
  hasErr, errOnly(/Could not connect to Redis at cache-prod-02:6379/), outEmpty
]);
t('redis-cli -h cache-prod-01 -p 6380 PING', 'redis 端口写错要如实报错', [
  hasErr, errOnly(/Could not connect to Redis at cache-prod-01:6380/), outEmpty
]);
t('redis-cli -h cache-prod-01 -p 6379 -n 99 DBSIZE', 'redis 库号越界', [
  errOnly(/ERR DB index is out of range/)
]);
t('redis-cli -h cache-prod-01 -p 6379 --scan --pattern "nomatch:*"', 'redis --scan 无匹配为空', [
  outEmpty, noErr
]);
t('redis-cli -h cache-prod-01 -p 6379 MEMORY DOCTOR', 'redis MEMORY DOCTOR 教学提示', [
  hasErr, errOnly(/教学/)
]);

/* ---------- 2. etcdctl ---------- */
t('ETCDCTL_API=3 etcdctl endpoint health --endpoints=https://10.0.1.11:2379,https://10.0.1.12:2379', 'etcd 端点健康检查', [
  /10\.0\.1\.11:2379/, /is healthy/, codeIs(0)
]);
t('ETCDCTL_API=3 etcdctl member list --endpoints=https://10.0.1.11:2379', 'etcd member list', [
  /[0-9a-f]{16}/, 'started', /https:\/\/10\.0\.1\.11:2379/
]);
t('ETCDCTL_API=3 etcdctl get /registry/config/db --endpoints=https://10.0.1.11:2379', 'etcd get 单键', [
  outOnly(/\/registry\/config\/db/), outOnly(/host: db-prod-01/)
]);
t('ETCDCTL_API=3 etcdctl get --prefix /registry/services/ --endpoints=https://10.0.1.11:2379', 'etcd get --prefix', [
  /\/registry\/services\//
]);
t('ETCDCTL_API=3 etcdctl put /registry/config/gray on --endpoints=https://10.0.1.11:2379', 'etcd put', ['OK']);
t('ETCDCTL_API=3 etcdctl del /registry/config/gray --endpoints=https://10.0.1.11:2379', 'etcd del', [outOnly(/^1$/m)]);
t('ETCDCTL_API=3 etcdctl get /nope/key --endpoints=https://10.0.1.11:2379', 'etcd get 不存在的键', [outEmpty, codeIs(0)]);
t('ETCDCTL_API=2 etcdctl get /registry/config/db', 'etcdctl v2 要给出诚实提示', [hasErr, errOnly(/ETCDCTL_API=3/), outEmpty]);
t('etcdctl endpoint health --endpoints=https://10.0.1.99:2379', 'etcd 连不上的端点', [outOnly(/unhealthy|context deadline exceeded/), hasErr]);
t('ETCDCTL_API=3 etcdctl endpoint status --endpoints=https://10.0.1.11:2379', 'etcd endpoint status', [
  outOnly(/10\.0\.1\.11:2379/), outOnly(/true|false/), outOnly(/\d+\.\d+\.\d+/)
]);
t('ETCDCTL_API=3 etcdctl snapshot status /data/backup/etcd-snapshot.db --endpoints=https://10.0.1.11:2379', 'etcd snapshot status', [
  outOnly(/[0-9a-f]{8}/), outOnly(/totalKey|revision/)
]);
t('ETCDCTL_API=3 etcdctl snapshot save /data/backup/etcd-$(date +%F).db --endpoints=https://10.0.1.11:2379', 'etcd snapshot save 写文件', [
  outOnly(/Snapshot saved at|snapshot saved/i)
]);
t('ETCDCTL_API=3 etcdctl defrag --endpoints=https://10.0.1.11:2379', 'etcd defrag', [
  outOnly(/Finished defragmenting|defragmented/i)
]);
t('ETCDCTL_API=3 etcdctl watch /registry/config/ --prefix --endpoints=https://10.0.1.11:2379', 'etcd watch 教学提示', [
  hasErr, errOnly(/watch|教学/)
]);
t('etcdctl', 'etcdctl 无参数用帮助', [outOnly(/ETCDCTL_API|endpoint|member/)]);

/* ---------- 3. Kafka ---------- */
t('kafka-topics.sh --bootstrap-server broker1:9092 --list', 'kafka --list', [
  'orders-events', '__consumer_offsets', codeIs(0)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --list --exclude-internal', 'kafka --list --exclude-internal', [
  /orders-events/, (res, text) => text.indexOf('__consumer_offsets') === -1 ? true : '--exclude-internal 没排除内部主题'
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --list | grep -c "^orders"', 'kafka --list 管道计数', [
  outOnly(/^[1-9][0-9]*$/m)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --describe --topic orders-events', 'kafka --describe 单主题', [
  'Topic: orders-events', 'PartitionCount:', 'ReplicationFactor:', 'Isr:'
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --describe --under-replicated-partitions', 'kafka --describe 副本掉队', [
  outOnly(/orders|payments|(^$)/)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --describe --unavailable-partitions', 'kafka --describe 无 leader 分区', [
  outOnly(/Topic:|\s*/)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --create --topic orders-events --partitions 6 --replication-factor 2', 'kafka --create', [
  outOnly(/Created topic orders-events/), codeIs(0)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --create --topic payment-events --partitions 3 --replication-factor 3 --if-not-exists', 'kafka --create --if-not-exists', [
  codeIs(0)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --create --topic orders-events --partitions 6 --replication-factor 2', 'kafka 重复建主题要报错', [
  hasErr, errOnly(/TopicExistsException|already exists/)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --create --topic t1 --partitions 6 --replication-factor 9', 'kafka 副本数超过 broker 数要报错', [
  hasErr, errOnly(/InvalidReplicationFactorException|replication factor/i)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --create --topic t1 --partitions 0 --replication-factor 1', 'kafka 分区数非法要报错', [
  hasErr, errOnly(/InvalidPartitionsException|partitions/i)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --alter --topic orders-events --partitions 12', 'kafka --alter 加分区', [codeIs(0)]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --alter --topic orders-events --partitions 3', 'kafka 分区只能加不能减', [
  hasErr, errOnly(/InvalidPartitionsException|increase|不能减少|只能/)
]);
t('kafka-topics.sh --bootstrap-server broker1:9092 --delete --topic orders-events', 'kafka --delete', [codeIs(0)]);
t('kafka-topics.sh --bootstrap-server broker9:9092 --list', 'kafka 连不上的 broker 要如实报错', [
  hasErr, errOnly(/TimeoutException|Connection to node|无法连接|Could not/)
]);
t('kafka-topics.sh --list', 'kafka 缺 --bootstrap-server 要报错', [
  hasErr, errOnly(/bootstrap-server|Missing required argument/)
]);
t('kafka-consumer-groups.sh --bootstrap-server broker1:9092 --list', 'kafka 消费组 --list', [
  'order-service', codeIs(0)
]);
t('kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service', 'kafka 消费组 --describe', [
  'GROUP', 'TOPIC', 'PARTITION', 'CURRENT-OFFSET', 'LOG-END-OFFSET', 'LAG', 'order-service'
]);
t('kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service | awk \'NR>1 && $5+0 > 10000 {print $1, $2, $3, $5}\'', 'kafka 消费组管道筛积压', [
  outOnly(/order-service/), noErr
]);
t('kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group no-such-group', 'kafka 组不存在要报错', [
  hasErr, errOnly(/GROUP_ID_NOT_FOUND|does not exist|不存在/)
]);
t('kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service --state', 'kafka 组状态', [
  outOnly(/Stable|PreparingRebalance|Empty|Dead/)
]);
t('kafka-consumer-groups.sh --bootstrap-server broker1:9092 --reset-offsets --group order-service --topic orders-events --to-earliest --execute', 'kafka --reset-offsets', [
  codeIs(0)
]);
t('kafka-consumer-groups.sh --bootstrap-server broker1:9092 --reset-offsets --group order-service --topic orders-events --to-earliest', 'kafka --reset-offsets 缺 --execute 要提示', [
  hasErr, errOnly(/--execute|dry-run|DRY-RUN/i)
]);
t('kafka-consumer-groups.sh --bootstrap-server broker1:9092 --delete-offsets --group order-service --topic orders-events', 'kafka --delete-offsets', [codeIs(0)]);

/* ---------- 4. rabbitmqctl ---------- */
t('rabbitmqctl status', 'rabbitmqctl status', [
  'Status of node', 'rabbit@rabbitmq-prod-01', 'Listeners', 'Alarms'
]);
t('rabbitmqctl cluster_status', 'rabbitmqctl cluster_status', [
  'Node name', 'rabbit@rabbitmq-prod-01', 'partitions'
]);
t('rabbitmqctl -q --formatter json status', 'rabbitmqctl JSON 输出', [
  outOnly(/^\s*\{/m), outOnly(/"/)
]);
t('rabbitmqctl list_queues name messages messages_ready messages_unacknowledged consumers', 'rabbitmqctl list_queues', [
  'orders.created', /\d+\s+\d+\s+\d+\s+\d+/
]);
t('rabbitmqctl -p /orders list_queues name messages_ready consumers --formatter json', 'rabbitmqctl vhost + json', [
  outOnly(/\{/), outOnly(/name|messages_ready/)
]);
t('rabbitmqctl list_connections', 'rabbitmqctl list_connections', [outOnly(/10\.0\.1\./), outOnly(/running|blocked/)]);
t('rabbitmqctl list_channels', 'rabbitmqctl list_channels', [outOnly(/\[.*\]|\d+/), outOnly(/running/)]);
t('rabbitmqctl stop_app', 'rabbitmqctl 未实现子命令要诚实提示', [hasErr, errOnly(/教学|未实现/)]);

/* ---------- 5. mqadmin（RocketMQ） ---------- */
t('sh mqadmin clusterList -n 127.0.0.1:9876', 'mqadmin clusterList', [outOnly(/broker-a|rocketmq/), outOnly(/\d+\.\d+\.\d+\.\d+/)]);
t('mqadmin topicList -n 127.0.0.1:9876', 'mqadmin topicList', ['orders-topic', 'TBW102']);
t('mqadmin topicStatus -n 127.0.0.1:9876 -t orders-topic', 'mqadmin topicStatus', [outOnly(/broker-a|queue/), outOnly(/\d+/)]);
t('mqadmin consumerProgress -n 127.0.0.1:9876 -g order-consumer', 'mqadmin consumerProgress', [outOnly(/order-consumer/), outOnly(/Diff|LAG|diff/i)]);
t('mqadmin brokerStatus -n 127.0.0.1:9876 -b 10.0.1.41:10911', 'mqadmin brokerStatus', [outOnly(/broker-a|10\.0\.1\.41/)]);
t('mqadmin updateTopic -n 127.0.0.1:9876 -b 10.0.1.41:10911 -t orders-topic -r 8 -w 8', 'mqadmin updateTopic', [codeIs(0)]);
t('mqadmin topicStatus -n 127.0.0.1:9876 -t no-such-topic', 'mqadmin 不存在的 topic 要报错', [hasErr, errOnly(/not exist|不存在/)]);

/* ---------- 6. MySQL 备份工具 ---------- */
t('mysqldump -h db-prod-01 -u root -p --single-transaction --routines --triggers --events --databases orders > /data/backup/db-orders-2024-03-18.sql', 'mysqldump 单库备份', [
  codeIs(0), noErr
]);
t('cat /data/backup/db-orders-2024-03-18.sql | head -5', 'mysqldump 产物真的是 dump', [
  outOnly(/MySQL dump/), outOnly(/CREATE TABLE|CREATE DATABASE/)
]);
t('mysqldump -h db-prod-01 -u root -p --single-transaction -A --set-gtid-purged=OFF | gzip > /data/backup/db-2024-03-18.sql.gz', 'mysqldump 全库 + gzip', [codeIs(0)]);
t('mysqldump -h db-prod-01 -u root -p --single-transaction --source-data=2 orders > /data/backup/orders-with-pos.sql', 'mysqldump --source-data', [codeIs(0)]);
t('mysqldump -h db-prod-01 -u root -p --no-data orders orders_202403 > /data/backup/orders-schema-only.sql', 'mysqldump 只导结构', [codeIs(0)]);
t('mysqldump -h db-prod-02 -u root -p --single-transaction orders', 'mysqldump 连不上的主机要报错', [
  hasErr, errOnly(/Unknown MySQL server host|Can't connect/)
]);
t('mysqldump -h db-prod-01 -u root -p --single-transaction no_such_db > /tmp/x.sql', 'mysqldump 不存在的库要报错', [
  hasErr, errOnly(/Unknown database/)
]);
t('mysqldump -h db-prod-01 -u root -p --wrong-flag orders', 'mysqldump 不认识的参数要报错', [
  hasErr, errOnly(/unknown option|unrecognized|Unknown/)
]);
t('mysqladmin -h db-prod-01 -u root -p --connect-timeout=3 ping', 'mysqladmin ping', [
  outOnly(/mysqld is alive/), codeIs(0)
]);
t('mysqladmin -h db-prod-01 -u root -p status', 'mysqladmin status', [
  outOnly(/Uptime:\s*\d+/), outOnly(/Threads:\s*\d+/), outOnly(/Slow queries:\s*\d+/)
]);
t('mysqladmin -h db-prod-01 -u root -p processlist', 'mysqladmin processlist', [
  outOnly(/\|\s*Id\s*\|/), outOnly(/Sleep|Query/)
]);
t('mysqladmin -h db-prod-01 -u root -p extended-status | grep -E "Threads_connected|Threads_running|Aborted_clients"', 'mysqladmin extended-status', [
  outOnly(/Threads_connected/), outOnly(/Threads_running/)
]);
t('mysqladmin -h db-prod-01 -u root -pwrongpass ping', 'mysqladmin 密码错要报 1045', [
  hasErr, errOnly(/Access denied|1045/)
]);
t('mysqladmin -h db-prod-01 -u root -p bogus-subcommand', 'mysqladmin 未实现子命令要报错', [
  hasErr, errOnly(/Unknown command|unknown/)
]);
t('mydumper -h db-prod-01 -u backup -p \'Bk@2024\' -B orders -o /data/backup/mydumper-20240318 -t 8 -c -G -E -R', 'mydumper 并行导出', [
  codeIs(0), noErr
]);
t('myloader -h db-prod-01 -u root -p \'App@2024\' -B orders -d /data/backup/mydumper-20240318 -t 8 -o', 'myloader 并行导入', [
  codeIs(0), noErr
]);
t('mydumper -h db-prod-01 -u backup -p \'Bk@2024\' -B orders -T orders,orders_202403 -o /data/backup/mydumper-tables -t 4', 'mydumper 只备份指定表', [codeIs(0)]);
t('mydumper -h db-prod-01 -u backup -p \'Wrong@2024\' -B orders -o /tmp/md-x', 'mydumper 密码错要报错', [
  hasErr, errOnly(/Access denied|1045/)
]);
t('mydumper -h db-prod-01 -u backup -p \'Bk@2024\' -B nope_db -o /tmp/md-x', 'mydumper 不存在的库要报错', [
  hasErr, errOnly(/Unknown database|not exist|不存在/)
]);
t('xtrabackup --defaults-file=/etc/my.cnf --backup --target-dir=/data/backup/xtra-20240318 --parallel=4', 'xtrabackup --backup', [
  outOnly(/completed OK|xtrabackup: /), codeIs(0)
]);
t('xtrabackup --prepare --target-dir=/data/backup/xtra-20240318', 'xtrabackup --prepare', [outOnly(/completed OK/)]);
t('xtrabackup --defaults-file=/etc/my.cnf --copy-back --target-dir=/data/backup/xtra-20240318', 'xtrabackup --copy-back', [codeIs(0)]);
t('xtrabackup --defaults-file=/etc/my.cnf --backup --stream=xbstream --parallel=4 | gzip > /data/backup/xtra-20240318.xb.gz', 'xtrabackup 流式备份', [codeIs(0)]);
t('xtrabackup --defaults-file=/nope/my.cnf --backup --target-dir=/tmp/x', 'xtrabackup 配置不存在要报错', [
  hasErr, errOnly(/No such file|cannot open|not found/)
]);
t('xtrabackup --backup', 'xtrabackup 缺 --target-dir 要报错', [
  hasErr, errOnly(/target-dir|missing|required/i)
]);
t('pt-query-digest /var/lib/mysql/mysql-slow.log > /tmp/slow-report-20240318.txt', 'pt-query-digest 报表', [codeIs(0)]);
t('pt-query-digest --since \'2024-03-18 09:00:00\' --until \'2024-03-18 10:00:00\' /var/lib/mysql/mysql-slow.log', 'pt-query-digest 时间窗', [
  outOnly(/# Profile|Rank|Query_time/), noErr
]);
t('pt-query-digest --limit 10 --order-by Query_time:sum /var/lib/mysql/mysql-slow.log', 'pt-query-digest --limit', [
  outOnly(/Query_time|Rank|Profile/)
]);
t('pt-query-digest --type=slowlog --print /var/lib/mysql/mysql-slow.log | head -100', 'pt-query-digest --print', [codeIs(0)]);
t('pt-query-digest /nope/slow.log', 'pt-query-digest 文件不存在要报错', [
  hasErr, errOnly(/No such file|cannot open|not found/i)
]);
t('cat /tmp/slow-report-20240318.txt | head -5', 'pt-query-digest 报表真的落盘', [outOnly(/Profile|Rank|Query_time|# /)]);
t('mysqldumpslow -s t -t 10 /var/lib/mysql/mysql-slow.log', 'mysqldumpslow 按时间排序', [
  outOnly(/Count:\s*\d+/), outOnly(/Time=/)
]);
t('mysqldumpslow -s c -t 20 -g "SELECT" /var/lib/mysql/mysql-slow.log', 'mysqldumpslow 按次数排序', [outOnly(/Count:/)]);
t('mysqldumpslow -s t -t 10 /nope/slow.log', 'mysqldumpslow 文件不存在要报错', [
  hasErr, errOnly(/No such file|not found|cannot open/i)
]);

/* ---------- 7. PostgreSQL ---------- */
t('psql -h db-prod-01 -p 5432 -U app -d orders -c "SELECT version();"', 'psql SELECT version()', [
  outOnly(/PostgreSQL \d+\.\d+/), noErr
]);
t('PGPASSWORD=\'Pg@2024\' psql -h db-prod-01 -U app -d orders -c "SELECT count(*) FROM orders;"', 'psql 计数', [
  outOnly(/\d+/), noErr
]);
t('psql -h db-prod-01 -U postgres -l', 'psql -l 列库', [outOnly(/orders/), outOnly(/Name|List of databases/)]);
t('psql -h db-prod-01 -U app -d orders -c "\\l"', 'psql \\l 元命令', [outOnly(/orders/)]);
t('psql -h db-prod-01 -U app -d orders -c "\\dt order*"', 'psql \\dt 通配', [outOnly(/orders/)]);
t('psql -h db-prod-01 -U app -d orders -c "\\d+ orders"', 'psql \\d+ 表结构', [outOnly(/orders/)]);
t('psql -h db-prod-01 -U app -d orders -c "\\du"', 'psql \\du 角色', [outOnly(/app|postgres/)]);
t('psql -h db-prod-01 -U app -d orders -c "SELECT pid, state FROM pg_stat_activity WHERE state <> \'idle\';"', 'psql pg_stat_activity', [
  outOnly(/pid|state|active/), noErr
]);
t('psql -h db-prod-02 -U app -d orders -c "SELECT 1;"', 'psql 连不上要报错', [
  hasErr, errOnly(/could not translate host name|Connection refused|could not connect/i)
]);
t('psql -h db-prod-01 -U app -d nope_db -c "SELECT 1;"', 'psql 库不存在要报错', [
  hasErr, errOnly(/does not exist/)
]);
t('psql -h db-prod-01 -U app -d orders -c "SELECT * FROM nope_table;"', 'psql 表不存在要报错', [
  hasErr, errOnly(/does not exist|ERROR/)
]);
t('psql -h db-prod-01 -U app -d orders -c "SELEC 1;"', 'psql 语法错要报错', [
  hasErr, errOnly(/ERROR|syntax error/)
]);
t('psql -h db-prod-01 -U app -d orders -f /data/backup/orders-2024-03-18.sql', 'psql -f 执行 SQL 文件', [codeIs(0)]);
t('pg_dump -h db-prod-01 -U app -d orders -F c -f /data/backup/orders-2024-03-18.dump', 'pg_dump 自定义格式', [
  codeIs(0), noErr
]);
t('pg_dump -h db-prod-01 -U app -d orders -F d -j 4 -f /data/backup/orders-dir-2024-03-18', 'pg_dump 目录格式', [codeIs(0)]);
t('pg_dump -h db-prod-01 -U app -d nope_db -F c -f /tmp/x.dump', 'pg_dump 库不存在要报错', [
  hasErr, errOnly(/does not exist/)
]);
t('pg_dump -h db-prod-02 -U app -d orders -F c -f /tmp/x.dump', 'pg_dump 连不上要报错', [
  hasErr, errOnly(/could not translate|Connection refused|could not connect/i)
]);
t('pg_restore -h db-prod-01 -U app -d orders --clean --if-exists --no-owner -j 4 /data/backup/orders-2024-03-18.dump', 'pg_restore 覆盖恢复', [codeIs(0)]);
t('pg_restore -h db-prod-01 -U app -d orders /nope/x.dump', 'pg_restore 文件不存在要报错', [
  hasErr, errOnly(/No such file|not found|cannot open/i)
]);
t('pg_dumpall -h db-prod-01 -U postgres -g > /data/backup/pg-globals-2024-03-18.sql', 'pg_dumpall -g', [codeIs(0)]);
t('cat /data/backup/pg-globals-2024-03-18.sql | head -5', 'pg_dumpall 产物含角色', [
  outOnly(/CREATE ROLE|PostgreSQL|pg_dumpall|--/)
]);

/* ---------- 8. MongoDB ---------- */
t('mongosh "mongodb://db-prod-01:27017/orders" --quiet --eval "db.stats().collections"', 'mongosh --eval 集合数', [
  outOnly(/\d+/), noErr
]);
t('mongosh --host db-prod-01 --port 27017 --eval "db.stats().collections"', 'mongosh --host', [outOnly(/\d+/), noErr]);
t('mongosh "mongodb://db-prod-02:27017/orders" --eval "db.stats()"', 'mongosh 连不上要报错', [
  hasErr, errOnly(/MongoNetworkError|connect|refused|resolve|failed/i)
]);
t('mongosh "mongodb://db-prod-01:27018/orders" --eval "db.stats()"', 'mongosh 端口写错要报错', [
  hasErr, errOnly(/MongoNetworkError|refused|connect/i)
]);
t('mongosh "mongodb://db-prod-01:27017/orders" --eval "db.orders.stats().count"', 'mongosh 集合统计', [
  outOnly(/\d+/)
]);
t('mongosh "mongodb://db-prod-01:27017/orders" --eval "db.nope.find()"', 'mongosh 不存在的集合', [outOnly(/\[|\(|0|Fetched|empty/i)]);
t('mongodump --uri="mongodb://db-prod-01:27017/orders" --collection=orders --gzip --out=/data/backup/mongo-orders-2024-03-18', 'mongodump 单集合', [
  codeIs(0), noErr
]);
t('mongodump --uri="mongodb://db-prod-01:27017/orders" --gzip --out=/data/backup/mongo-2024-03-18', 'mongodump 整库', [
  outOnly(/writing|done dumping|dumped/i)
]);
t('mongodump --uri="mongodb://db-prod-02:27017/orders" --out=/tmp/md', 'mongodump 连不上要报错', [
  hasErr, errOnly(/Failed|connect|resolve|refused/i)
]);
t('mongorestore --uri="mongodb://db-prod-01:27017/orders" --gzip --dir=/data/backup/mongo-2024-03-18', 'mongorestore 目录恢复', [codeIs(0)]);
t('mongorestore --uri="mongodb://db-prod-01:27017/orders" --gzip --dir=/nope/mongo-x', 'mongorestore 目录不存在要报错', [
  hasErr, errOnly(/No such file|not found|does not exist/i)
]);

/* ---------- 9. haproxy ---------- */
t('haproxy -c -f /etc/haproxy/haproxy.cfg', 'haproxy 配置检查通过', [
  outOnly(/Configuration file is valid/), codeIs(0)
]);
t('haproxy -c -f /nope/haproxy.cfg', 'haproxy 配置文件不存在要报错', [
  hasErr, errOnly(/No such file|not found|cannot open/i)
]);
t('haproxy -v', 'haproxy 版本', [outOnly(/HAProxy version/i)]);

/* ---------- 汇总 ---------- */
console.log('');
if (failures.length) {
  console.log('── 失败明细 ──');
  failures.forEach((f) => {
    console.log('✗ ' + f.cmd.slice(0, 110));
    console.log('  用例: ' + f.name);
    f.problems.forEach((p) => console.log('    - ' + p));
    if (f.text) console.log('    stdout: ' + f.text.replace(/\n/g, ' / ').slice(0, 200));
    if (f.err) console.log('    stderr: ' + f.err.replace(/\n/g, ' / ').slice(0, 200));
  });
  console.log('');
}
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('='.repeat(70));
process.exit(fail ? 1 : 0);
