/* data/db-cache.js · 分类 11 数据库与缓存 */
(function () {
  'use strict';

  var catId = 'db-cache';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. MySQL（20 条） ================= */

    /* ---------- 1 / 56 ---------- */
    {
      id: 'db-mysql-client',
      name: 'mysql',
      alias: ['mysql -h -u -p', 'mysql -e', 'source 导入 SQL', 'mysql 登录'],
      level: 1,
      syntax: 'mysql -h <主机> -P <端口> -u <用户> -p [库名] [-e "SQL"]',
      summary: '登录 MySQL 的总入口，连库、执行 SQL、导入脚本都从它开始。',
      desc: '`-h` 不写默认连本机 socket，连远程必须显式指定主机；`-P` 是端口（大写），小写 `-p` 是密码提示，这两个最容易写混。`-e` 后面跟一条 SQL 直接执行并退出，适合写进 Shell 脚本；`-D` 指定默认库，等价于登录后 `USE <库>`。装完数据库先 `SELECT VERSION();` 确认版本，5.7 与 8.0 在很多语法上不兼容。本站仿真环境里 MySQL 跑在容器 `mysql8`（`mysql:8.0`，映射 `0.0.0.0:3306->3306/tcp`），容器里没有客户端环境变量就要用 `docker exec -it mysql8 mysql ...`。',
      params: [
        { flag: '-h <主机>', desc: '数据库地址，可写 IP、域名或 `<主机>:<端口>` 形式' },
        { flag: '-P <端口>', desc: '端口，默认 3306；大写 P 是端口，别和小写 p 混' },
        { flag: '-u <用户>', desc: '登录账号；不带空格与值之间可有空格，`-uroot` 也合法' },
        { flag: '-p[密码]', desc: '提示输入密码；`-p` 与密码之间**不能有空格**，写成 `-p 123` 会把 123 当库名' },
        { flag: '-D <库名>', desc: '登录后直接使用该库，省一次 `USE`' },
        { flag: '-e "SQL"', desc: '执行一条语句后退出，脚本巡检首选' },
        { flag: '--default-character-set=utf8mb4', desc: '指定客户端字符集，解决中文乱码' },
        { flag: 'source <文件>', desc: '客户端内建命令（不是 SQL），导入 `.sql` 脚本；写绝对路径更稳' }
      ],
      examples: [
        { cmd: 'mysql -h db-prod-01 -P 3306 -u app -p -D orders', desc: '登录生产订单库，密码交互输入，最常用的写法' },
        { cmd: 'mysql -h db-prod-01 -u app -p -e "SELECT VERSION(); SHOW DATABASES;"', desc: '不进交互界面，一次性执行几条 SQL 后退出' },
        { cmd: 'mysql -h db-prod-01 -u app -p -D orders -e "source /data/backup/db-orders-2024-03-18.sql"', desc: '用 `source` 把备份脚本灌进指定库，非交互式导入' },
        { cmd: 'docker exec -it mysql8 mysql -uroot -p -e "SHOW PROCESSLIST;"', desc: '容器里没有 mysql 客户端时，从宿主机进容器执行' }
      ],
      notes: [
        '`-p` 后面**不能加空格**：`-p 123456` 会被解析成「库名 123456」，然后提示你输密码',
        '密码写在命令行会留在 `~/.bash_history` 和 `ps` 输出里，生产建议只写 `-p` 交互输入，或用 `mysql_config_editor` 生成 login-path',
        '`source` 是 mysql 客户端自己的命令，不是 SQL，写成 `mysql -e "source x.sql"` 可用，但在其他客户端（Navicat 以外）里未必支持',
        '连不上先按顺序查：`ping <主机>` → `telnet <主机> 3306` → 账号是否允许该来源主机（`SHOW GRANTS`）',
        '报 `Too many connections` 说明连接数打满，先看 `db-mysql-connect-timeout` 与 `db-mysql-processlist`'
      ],
      related: ['db-mysql-mysqladmin', 'db-mysql-restore', 'db-mysql-processlist', 'db-mysql-connect-timeout'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/mysql.html',
      tags: ['MySQL', '连接', '客户端']
    },

    /* ---------- 2 / 56 ---------- */
    {
      id: 'db-mysql-mysqladmin',
      name: 'mysqladmin',
      alias: ['mysqladmin status', 'mysqladmin ping', 'mysqladmin processlist'],
      level: 2,
      syntax: 'mysqladmin -h <主机> -u <用户> -p <子命令>',
      summary: '不登客户端就能看存活、状态和连接数，写巡检脚本最省事。',
      desc: '`ping` 只回一句 `mysqld is alive`，用来做存活探针最合适；`status` 一行给出 `Uptime`、`Threads`（当前连接数）、`Questions`（总查询数）、`Slow queries`、`Open tables`、`Queries per second avg`；`extended-status` 等价于 `SHOW GLOBAL STATUS`，配合 `grep` 取单个指标。`mysqladmin` 还能做 `shutdown`（关库！）、`flush-logs`（切 binlog）、`create/drop <库>`。',
      params: [
        { flag: 'ping', desc: '探活，返回 `mysqld is alive`；连不上会卡住直到超时' },
        { flag: 'status', desc: '一行式运行状态：运行时长、连接数、查询数、慢查询数' },
        { flag: 'processlist', desc: '等价于 `SHOW PROCESSLIST`，输出更紧凑' },
        { flag: 'extended-status', desc: '输出全部 `SHOW GLOBAL STATUS` 指标，脚本里 grep 单值' },
        { flag: 'variables', desc: '输出全部 `SHOW GLOBAL VARIABLES` 参数' },
        { flag: '--connect-timeout=3', desc: '连接超时秒数，探活脚本必加，避免一直挂着' },
        { flag: '-i <秒>', desc: '按间隔重复执行，如 `-i 2 status` 每 2 秒刷一次' }
      ],
      examples: [
        { cmd: 'mysqladmin -h db-prod-01 -u root -p --connect-timeout=3 ping', desc: '存活探针，3 秒连不上就当失败，适合写进监控脚本' },
        { cmd: 'mysqladmin -h db-prod-01 -u root -p status', desc: '一眼看运行时长、当前连接数和慢查询数' },
        { cmd: 'mysqladmin -h db-prod-01 -u root -p processlist', desc: '不登客户端看当前会话，排查连接堆积' },
        { cmd: 'mysqladmin -h db-prod-01 -u root -p extended-status | grep -E "Threads_connected|Threads_running|Aborted_clients"', desc: '取连接相关指标做容量判断' }
      ],
      notes: [
        '`mysqladmin shutdown` 会直接停库，属于高危操作，非计划内维护不要用',
        '`status` 里的 `Threads` 是当前连接数，不是线程池大小；`Threads_running` 才是正在执行的会话数',
        '探活脚本务必加 `--connect-timeout`，否则数据库半死不活时脚本会一直挂住',
        '`Aborted_clients` 持续增长通常是应用没正常关闭连接（连接池配置或 `wait_timeout` 变小导致）'
      ],
      related: ['db-mysql-client', 'db-mysql-processlist', 'db-mysql-connect-timeout'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/mysqladmin.html',
      tags: ['MySQL', '巡检', '状态']
    },

    /* ---------- 3 / 56 ---------- */
    {
      id: 'db-mysql-connect-timeout',
      name: '连接超时与连接数',
      kind: 'recipe',
      alias: ['wait_timeout', 'connect_timeout', 'max_connections', 'Communications link failure'],
      level: 3,
      syntax: 'SHOW VARIABLES LIKE \'%timeout%\'; / SET GLOBAL wait_timeout=<秒>;',
      summary: '查清各种 timeout 管哪一段，解决连接被掐断与连接数打满。',
      desc: 'MySQL 的超时参数各管一段，混起来最容易误判：`connect_timeout`（握手阶段，只影响建立连接）、`wait_timeout`（非交互连接空闲多久被服务端断开）、`interactive_timeout`（交互式客户端空闲断开，mysql 命令行走这个）、`net_read_timeout`/`net_write_timeout`（读写在途超时）。客户端侧另有 `--connect-timeout`。应用日志出现 `Communications link failure`、`The last packet successfully received from the server was xxx milliseconds ago` 基本就是空闲连接被服务端先断、而连接池没做保活校验。本站仿真环境里应用日志 `/data/app/logs/app.log` 的 `java.sql.SQLTimeoutException: Statement cancelled due to timeout` 是**语句执行**超时（应用侧 `query timeout`），和这里的连接超时不是一回事，别混。',
      params: [
        { flag: 'connect_timeout', desc: '服务端握手超时，默认 10 秒；客户端还有同名连接参数' },
        { flag: 'wait_timeout', desc: '非交互连接空闲超时，默认 28800 秒（8 小时）' },
        { flag: 'interactive_timeout', desc: '交互式连接空闲超时，`mysql` 客户端走这个' },
        { flag: 'net_read_timeout / net_write_timeout', desc: '网络读写等待超时，默认 30/60 秒' },
        { flag: 'max_connections', desc: '最大连接数，打满后新连接报 `Too many connections`' },
        { flag: '--connect-timeout=<秒>', desc: 'mysql 客户端侧的连接超时，探活脚本必加' }
      ],
      examples: [
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW VARIABLES LIKE \'%timeout%\';"', desc: '一次看清所有 timeout 参数，先确认改的是哪一个' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW STATUS LIKE \'Threads_connected\'; SHOW STATUS LIKE \'Max_used_connections\'; SHOW STATUS LIKE \'Aborted_clients\';"', desc: '看连接水位与异常断开次数，判断是不是连接数问题' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW VARIABLES LIKE \'max_connections\'; SET GLOBAL max_connections=1000;"', desc: '临时调大连接数（重启失效，要持久化写 my.cnf）' },
        { cmd: 'mysql --connect-timeout=3 -h db-prod-01 -u app -p -e "SELECT 1;"', desc: '客户端侧 3 秒连不上就失败，用于脚本探活' }
      ],
      notes: [
        '`wait_timeout` 改小（比如 600）后，连接池里空闲超过 10 分钟的连接会被服务端单方面断开，池子必须配 `validationQuery`/心跳，否则业务随机报错',
        '`SET GLOBAL` 只对**新**连接生效，已存在的连接仍是旧值；要立刻生效对老连接需 `KILL` 后重连',
        '容器化 MySQL 的 `max_connections` 还受容器内存限制，盲目调大会 OOM',
        '`Aborted_clients` 高说明客户端异常断开（超时、进程被杀），`Aborted_connects` 高才是握手失败（密码错、来源主机不允许）',
        '改参数持久化要写进 `my.cnf` 的 `[mysqld]` 段，然后滚动重启，不能靠 `SET GLOBAL` 长期维持'
      ],
      related: ['db-mysql-client', 'db-mysql-mysqladmin', 'db-mysql-processlist'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html',
      tags: ['连接', '超时', '参数']
    },

    /* ---------- 4 / 56 ---------- */
    {
      id: 'db-mysql-mysqldump',
      name: 'mysqldump',
      alias: ['mysqldump --single-transaction', '逻辑备份', '导出 SQL'],
      level: 2,
      syntax: 'mysqldump -h <主机> -u <用户> -p [选项] <库名> [表名] > backup.sql',
      summary: '最常用的逻辑备份工具，导出成 SQL 文件，跨版本恢复最省事。',
      desc: '生产备份的黄金组合是 `--single-transaction --routines --triggers --events`：`--single-transaction` 在 InnoDB 上开一个可重复读事务拿一致性快照，**全程不锁表**；`--routines` 导出存储过程与函数、`--triggers` 导出触发器（默认开启）、`--events` 导出事件调度器任务，这三个不写，恢复后业务逻辑就残了。只导结构加 `--no-data`，只导数据加 `--no-create-info`。全库备份用 `-A`（`--all-databases`）；用 `--databases <库1> <库2>` 会在文件里带上 `CREATE DATABASE` 与 `USE`，恢复时不用先建库。GTID 环境务必加 `--set-gtid-purged=OFF`，否则导入时报 GTID 相关错误。需要记录 binlog 位点做从库时用 `--source-data=2`（8.0.26 之前叫 `--master-data=2`，注意与 `--single-transaction` 同时用会短暂加全局读锁）。',
      params: [
        { flag: '--single-transaction', desc: 'InnoDB 一致性快照备份，不锁表；备份期间禁止 DDL' },
        { flag: '-A, --all-databases', desc: '备份所有库，含 `mysql` 系统库（权限、账号一起带走）' },
        { flag: '--databases <库...>', desc: '备份指定库并写入 `CREATE DATABASE`/`USE` 语句' },
        { flag: '--routines', desc: '导出存储过程与函数，不写就丢' },
        { flag: '--triggers', desc: '导出触发器，默认开启，可用 `--skip-triggers` 关闭' },
        { flag: '--events', desc: '导出事件调度器（event scheduler）任务' },
        { flag: '--set-gtid-purged=OFF', desc: 'GTID 环境必备；不写会让导入端 GTID 冲突或报错' },
        { flag: '--source-data=2', desc: '把 binlog 位点以注释形式写进备份文件，供搭从库用（旧名 `--master-data=2`）' }
      ],
      examples: [
        { cmd: 'mysqldump -h db-prod-01 -u root -p --single-transaction --routines --triggers --events --databases orders > /data/backup/db-orders-$(date +%F).sql', desc: '单库生产级备份，带库名与过程/触发器，文件按日期命名' },
        { cmd: 'mysqldump -h db-prod-01 -u root -p --single-transaction -A --set-gtid-purged=OFF | gzip > /data/backup/db-$(date +%F).sql.gz', desc: '全库备份并直接压缩，本站仿真里 `/data/backup/db-2024-03-18.sql.gz` 就是这么来的' },
        { cmd: 'mysqldump -h db-prod-01 -u root -p --single-transaction --source-data=2 orders > /data/backup/orders-with-pos.sql', desc: '备份并把 binlog 位点写进注释，用于搭建从库' },
        { cmd: 'mysqldump -h db-prod-01 -u root -p --no-data orders orders_202403 > /data/backup/orders-schema-only.sql', desc: '只导表结构，快速在测试库复刻一张表' }
      ],
      notes: [
        '`--single-transaction` **只对 InnoDB 有效**，库里混着 MyISAM 表时这些表仍会被锁，备份期间业务写会阻塞',
        '`--single-transaction` 期间不能有 DDL（`ALTER`/`DROP`），否则备份出来的结构可能不一致，建议放在低峰期',
        '不带 `--databases` 时备份文件里**没有** `CREATE DATABASE`，恢复前必须先建库，否则报 `ERROR 1049`',
        '备份文件要写到 `/data` 这类数据盘，别写 `/` 分区；本站仿真里数据盘 `/data` 已经 100%，备份前先用 `df -h` 确认空间',
        '大库备份耗时长，`mysqldump` 单线程导出，几百 GB 建议换 `db-mysql-mydumper` 或 `db-mysql-xtrabackup`',
        '备份完一定做**恢复演练**，没验证过的备份等于没有备份'
      ],
      related: ['db-mysql-restore', 'db-mysql-xtrabackup', 'db-mysql-mydumper', 'db-mysql-information-schema'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html',
      tags: ['备份', '导出', '逻辑备份']
    },

    /* ---------- 5 / 56 ---------- */
    {
      id: 'db-mysql-restore',
      name: 'mysql 恢复',
      kind: 'recipe',
      alias: ['mysql < backup.sql', '导入 SQL', 'gunzip 恢复'],
      level: 2,
      syntax: 'mysql -h <主机> -u <用户> -p [库名] < backup.sql',
      summary: '把 SQL 备份灌回数据库，恢复前先建库建账号再灌数据。',
      desc: '逻辑备份的恢复就是「把文件当标准输入喂给客户端」，所以用输入重定向 `<`，不要写成 `mysql -e "..."`。带 `--databases`/`-A` 导出的文件里有 `CREATE DATABASE`，直接恢复即可；单库导出的文件要先 `CREATE DATABASE`。压缩备份用 `gunzip < 文件 | mysql ...` 流式解压导入，不必先解压出几百 GB 的中间文件（本站仿真里 `/data/backup/db-2024-03-18.sql.gz` 是 845MB，解压后可能好几 GB，而 `/data` 盘只有 1.2G 可用）。导入期间临时把 `max_allowed_packet` 调大能避开「server has gone away」。',
      params: [
        { flag: '< backup.sql', desc: '输入重定向导入，最常用也最快的写法' },
        { flag: 'gunzip < x.sql.gz | mysql', desc: '压缩备份流式解压导入，不落中间文件' },
        { flag: '--one-database', desc: '只恢复语句中涉及的指定库，忽略其他库的语句' },
        { flag: '--max_allowed_packet=256M', desc: '客户端侧包大小，遇到超长 INSERT 时调大' },
        { flag: '-f, --force', desc: '遇错继续执行，导脏数据时用，排障时不要开' },
        { flag: 'SHOW PROCESSLIST', desc: '恢复期间另开一个会话看进度（导入是一个长事务式的大 SQL）' }
      ],
      examples: [
        { cmd: 'mysql -h db-prod-01 -u root -p -e "CREATE DATABASE IF NOT EXISTS orders DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"', desc: '单库备份恢复前先建库，字符集要和源库一致' },
        { cmd: 'mysql -h db-prod-01 -u root -p orders < /data/backup/orders-2024-03-18.sql', desc: '把单库备份导入 orders 库，标准恢复写法' },
        { cmd: 'gunzip < /data/backup/db-2024-03-18.sql.gz | mysql -h db-prod-01 -u root -p', desc: '压缩备份直接流式恢复，全库备份文件自带建库语句' },
        { cmd: 'mysql -h db-prod-01 -u root -p --max_allowed_packet=256M orders < /data/backup/orders-2024-03-18.sql', desc: '大表备份报 `MySQL server has gone away` 时，调大包上限再导' }
      ],
      notes: [
        '恢复是**破坏性**操作：文件里的 `DROP TABLE`/`INSERT` 会覆盖同名表现有数据，先确认目标库、先备份，再执行',
        '报 `ERROR 1049 (42000): Unknown database` 说明目标库不存在；报 `ERROR 1044` 是账号权限不足',
        '导入大文件时主库 binlog 会暴涨，主从环境注意从库延迟（见 `db-mysql-replication-lag`）',
        '导入速度慢是正常的：逐条执行 SQL 且每 1000 行一个事务，想快就换物理备份 `db-mysql-xtrabackup`',
        '恢复完记得 `ANALYZE TABLE` 或直接 `OPTIMIZE TABLE` 刷新统计信息，否则执行计划可能很差'
      ],
      related: ['db-mysql-mysqldump', 'db-mysql-client', 'db-mysql-mydumper', 'db-mysql-replication-lag'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/mysql-batch-commands.html',
      tags: ['恢复', '导入', '备份']
    },

    /* ---------- 6 / 56 ---------- */
    {
      id: 'db-mysql-xtrabackup',
      name: 'xtrabackup',
      alias: ['percona xtrabackup', '物理备份', 'innobackupex'],
      level: 3,
      syntax: 'xtrabackup --backup --target-dir=<目录> / --prepare / --copy-back',
      summary: 'InnoDB 物理热备工具，大库备份快、恢复快，但步骤多必须按流程走。',
      desc: 'Percona XtraBackup 直接拷贝 InnoDB 数据文件，备份期间不锁表、不打断业务，与 `mysqldump` 的逻辑备份互补。标准三步：`--backup` 拷数据文件（此时文件内部**不一致**）→ `--prepare` 把 redo log 应用上去做成一致状态 → 停库 `--copy-back` 拷回数据目录。备份版本必须与 MySQL 大版本对应（XtraBackup 8.0 备份 MySQL 8.0，不能拿来恢复 5.7）。大库还可以 `--stream=xbstream` 边备边压缩直接传到对象存储或从库。',
      params: [
        { flag: '--backup', desc: '开始备份，写入 `--target-dir` 指定目录' },
        { flag: '--target-dir=<目录>', desc: '备份目录，必须为空或不存在' },
        { flag: '--defaults-file=<文件>', desc: '指定 my.cnf，从 `[mysqld]` 段读数据目录与端口等配置' },
        { flag: '--databases="<库>.<表>"', desc: '只备份指定库表，多张用空格分隔' },
        { flag: '--prepare', desc: '第二步：应用 redo log 使备份一致，恢复前必须执行一次' },
        { flag: '--copy-back', desc: '第三步：把 prepare 好的文件拷回 `datadir`，要求目录为空' },
        { flag: '--stream=xbstream', desc: '流式输出，配合 gzip 或管道直接传到异地' },
        { flag: '--parallel=<N>', desc: '并行拷贝/应用的线程数，按 CPU 核数设置' }
      ],
      examples: [
        { cmd: 'xtrabackup --defaults-file=/etc/my.cnf --backup --target-dir=/data/backup/xtra-20240318 --parallel=4', desc: '在线物理备份到数据盘，业务不中断' },
        { cmd: 'xtrabackup --prepare --target-dir=/data/backup/xtra-20240318', desc: '恢复前先 prepare，把 redo 应用成一致状态' },
        { cmd: 'systemctl stop mysqld && xtrabackup --defaults-file=/etc/my.cnf --copy-back --target-dir=/data/backup/xtra-20240318 && chown -R mysql:mysql /var/lib/mysql && systemctl start mysqld', desc: '停库 → 拷回 → 改属主 → 起库，完整恢复流程' },
        { cmd: 'xtrabackup --defaults-file=/etc/my.cnf --backup --stream=xbstream --parallel=4 | gzip > /data/backup/xtra-20240318.xb.gz', desc: '流式压缩备份，适合直接传到 OBS 或异地机房' }
      ],
      notes: [
        '`--copy-back` 前**必须停库并清空 datadir**：数据目录非空时 MySQL 会拒绝启动，也可能出现半新半旧的数据',
        '恢复后目录属主会变成执行 xtrabackup 的用户（通常是 root），必须 `chown -R mysql:mysql /var/lib/mysql`，否则起不来',
        '`--prepare` 只能在**同一大版本**上做，8.0 的备份不能恢复到 5.7',
        '备份目录要先确认磁盘空间：物理备份大小约等于数据文件大小，本站仿真里 `/data` 已 100%，直接写会失败',
        '别把密码写在命令行里，推荐用 `--defaults-file` 让工具从配置文件读账号，或建一个只有 `BACKUP_ADMIN`/`RELOAD`/`LOCK TABLES` 权限的备份账号'
      ],
      related: ['db-mysql-mysqldump', 'db-mysql-restore', 'db-mysql-mydumper'],
      docs: 'https://docs.percona.com/percona-xtrabackup/8.0/index.html',
      tags: ['物理备份', 'InnoDB', '恢复']
    },

    /* ---------- 7 / 56 ---------- */
    {
      id: 'db-mysql-mydumper',
      name: 'mydumper / myloader',
      alias: ['mydumper', 'myloader', '并行备份'],
      level: 3,
      syntax: 'mydumper -h <主机> -u <用户> -p <密码> -B <库> -o <目录> -t <线程数>',
      summary: '多线程逻辑备份工具，大库导出导入比 mysqldump 快一个数量级。',
      desc: '`mydumper` 把每张表切成多个 chunk 并行导出（`-t` 指定线程数），输出是「每表一个 `.sql` + 一个 schema 文件」的目录结构，天然支持按表恢复；配套的 `myloader` 同样多线程导入。它比 `mysqldump` 快在并行和分片，适合几百 GB 级逻辑备份；但因为会按行数切片，单表特别大时反而要注意一致性快照（`--trx-consistency-only`）。本站仿真里每天的 `db-2024-03-18.sql.gz` 备份如果换成 `mydumper -c` 输出，恢复时就能只挑出事故那张表。',
      params: [
        { flag: '-B <库>', desc: '指定要备份的库（等价于 `--database`）' },
        { flag: '-o <目录>', desc: '输出目录，必须不存在或是空目录' },
        { flag: '-t <N>', desc: '并行线程数，常用 CPU 核数或 2 倍' },
        { flag: '-c, --compress', desc: '输出文件压缩，体积小但导入要解压' },
        { flag: '-r <N>, --rows', desc: '按 N 行切分文件，控制单文件大小' },
        { flag: '-G -E -R', desc: '分别导出触发器、事件、存储过程与函数' },
        { flag: '--trx-consistency-only', desc: '只要事务一致性，不锁表（InnoDB 场景）' },
        { flag: '-d <目录> / -o', desc: '`myloader` 的参数：导入目录、覆盖同名表' }
      ],
      examples: [
        { cmd: 'mydumper -h db-prod-01 -u backup -p \'Bk@2024\' -B orders -o /data/backup/mydumper-20240318 -t 8 -c -G -E -R', desc: '8 线程并行导出 orders 库，带触发器/事件/存储过程' },
        { cmd: 'myloader -h db-prod-01 -u root -p \'App@2024\' -B orders -d /data/backup/mydumper-20240318 -t 8 -o', desc: '8 线程并行导入，`-o` 覆盖已存在的同名表' },
        { cmd: 'mydumper -h db-prod-01 -u backup -p \'Bk@2024\' -B orders -T orders,orders_202403 -o /data/backup/mydumper-tables -t 4', desc: '只备份指定的两张表，适合单表事故回滚' },
        { cmd: 'myloader -h db-prod-01 -u root -p \'App@2024\' -B orders -d /data/backup/mydumper-20240318 -t 4 --overwrite-tables -q 1000', desc: '覆盖导入并把每 1000 条查询作为一个事务提交' }
      ],
      notes: [
        '`mydumper` 的 `-p` **必须直接跟密码**（不会像 `mysql` 那样提示输入），密码会明文出现在 `ps` 和 history 里——生产请单独建一个只读备份账号，不要用 root',
        '备份目录要与目标库隔离：`myloader -o` 会 `DROP` 后重建同名表，导入前确认目标库选对了',
        '导出文件按表分片，恢复单表很方便，但**跨表外键约束**会让导入顺序报错，必要时先 `SET FOREIGN_KEY_CHECKS=0`',
        '版本要匹配：`mydumper` 0.12+ 才完整支持 MySQL 8.0 的 `caching_sha2_password` 认证，老版本会连不上',
        '和 `mysqldump` 一样属于逻辑备份，恢复的是某一时刻数据，不是物理文件级别的一致快照'
      ],
      related: ['db-mysql-mysqldump', 'db-mysql-restore', 'db-mysql-xtrabackup'],
      docs: 'https://github.com/mydumper/mydumper',
      tags: ['并行备份', '导入导出', '大库']
    },

    /* ---------- 8 / 56 ---------- */
    {
      id: 'db-mysql-processlist',
      name: 'SHOW PROCESSLIST',
      alias: ['SHOW FULL PROCESSLIST', 'information_schema.processlist', 'KILL QUERY', '找阻塞'],
      level: 2,
      syntax: 'SHOW [FULL] PROCESSLIST; / SELECT ... FROM information_schema.PROCESSLIST;',
      summary: '看当前有哪些连接在跑什么 SQL，找阻塞与长事务的第一现场。',
      desc: '输出每行一个连接：`Id`（会话号，`KILL` 时用）、`User`、`Host`（来源 IP）、`db`、`Command`（`Query`/`Sleep`）、`Time`（**当前状态**已持续的秒数）、`State`、`Info`（正在执行的 SQL）。三个关键判读：① `Command=Sleep` 且 `Time` 很大 = 连接池的空闲连接占着不干活（连接数被白占）；② `State=Waiting for table metadata lock` = 有人在等 DDL 的元数据锁，通常是长事务没提交导致的锁等待；③ `Time` 很大且 `State=Sending data`/`Copying to tmp table` = 慢 SQL 正在扫大量数据。**不加 `FULL` 时 `Info` 只显示前 100 个字符**，长 SQL 会被截断，排障一律用 `SHOW FULL PROCESSLIST`。想看阻塞关系链更推荐查 `sys.innodb_lock_waits`（直接给出「谁挡住了谁」）或 `performance_schema.data_lock_waits`。本站仿真里 `/data/app/logs/app.log` 报 `query timeout after 5000ms, orderId=8812`，就是应用侧 5 秒超时——对应的 SQL 此时还挂在 MySQL 里，用这条命令能抓到它。',
      params: [
        { flag: 'FULL', desc: '显示完整 SQL 文本；不写 `Info` 列只留前 100 个字符' },
        { flag: 'information_schema.PROCESSLIST', desc: '当表查，可 `WHERE`/`ORDER BY` 过滤，`TIME` 字段可排序' },
        { flag: 'sys.innodb_lock_waits', desc: 'sys 库视图，直接列出等待事务与被阻塞事务的对应关系' },
        { flag: 'performance_schema.data_lock_waits', desc: '8.0 的锁等待原始表，`data_locks` 配合看具体锁对象' },
        { flag: 'KILL QUERY <Id>', desc: '只终止该会话**正在执行**的语句，连接保留' },
        { flag: 'KILL <Id>', desc: '直接断开整个连接，应用会收到错误并重连' }
      ],
      examples: [
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW FULL PROCESSLIST;"', desc: '最直接的写法，看全部连接与完整 SQL' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SELECT id,user,host,db,command,time,state,LEFT(info,80) AS sql_text FROM information_schema.processlist WHERE command <> \'Sleep\' ORDER BY time DESC LIMIT 20;"', desc: '按已持续时长倒序，只看干活中的会话，排障第一步' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SELECT waiting_pid, waiting_query, blocking_pid, blocking_query FROM sys.innodb_lock_waits;"', desc: '一眼看出是谁的锁挡住了谁，比猜表锁快得多' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SELECT COUNT(*) AS sleep_conn FROM information_schema.processlist WHERE command = \'Sleep\';"', desc: '数空闲连接，`Sleep` 过多说明连接池配置不合理' }
      ],
      notes: [
        '**`KILL` 有风险**：先用 `KILL QUERY <Id>` 只杀语句，确认业务能接受再考虑 `KILL <Id>` 断连接；大事务被 KILL 后要**回滚**，回滚时间可能比执行时间还长，期间持续占用 undo 与 IO',
        '别在业务高峰期批量 `KILL` 会话：应用侧会瞬间收到大量异常并疯狂重连，容易把数据库打垮',
        '`Time` 是**当前状态**持续的秒数，`Sleep` 1000 秒不代表有查询跑了 1000 秒，别拿它当慢查询依据',
        '不加 `FULL` 会截断 SQL（前 100 字符），排障时经常因为看不到 `WHERE` 条件而误判',
        '看不到别人的会话说明当前账号没有 `PROCESS` 权限，需要 `GRANT PROCESS ON *.* TO ...`'
      ],
      related: ['db-mysql-innodb-status', 'db-mysql-slowlog', 'db-mysql-explain', 'db-mysql-connect-timeout'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/show-processlist.html',
      tags: ['诊断', '阻塞', '长事务']
    },

    /* ---------- 9 / 56 ---------- */
    {
      id: 'db-mysql-innodb-status',
      name: 'SHOW ENGINE INNODB STATUS',
      alias: ['innodb status', '死锁排查', 'LATEST DETECTED DEADLOCK'],
      level: 3,
      syntax: 'SHOW ENGINE INNODB STATUS\\G',
      summary: 'InnoDB 引擎的体检报告，死锁、活跃事务、脏页与刷盘情况都在里面。',
      desc: '输出是纯文本分段的，排障只关心几段：`LATEST DETECTED DEADLOCK`（最近一次死锁的两个事务、各自持有的锁与执行的 SQL）、`TRANSACTIONS`（当前活跃事务，`ACTIVE ... seconds` 就是长事务）、`BUFFER POOL AND MEMORY`（缓冲池命中率、脏页比例、`History list length`）、`LOG`（LSN 与刷盘等待）、`ROW OPERATIONS`。默认只保留**最近一次**死锁，想把所有死锁都留档要开 `innodb_print_all_deadlocks=ON`，死锁信息会写进 error log。结构化的替代方案是 `performance_schema.data_locks` / `data_lock_waits` 与 `sys.innodb_lock_waits`。',
      params: [
        { flag: '\\G', desc: '客户端把结果竖排显示，不加会挤成一坨没法读' },
        { flag: 'LATEST DETECTED DEADLOCK', desc: '最近一次死锁的事务、锁与 SQL，重点看 `WE ROLL BACK TRANSACTION`' },
        { flag: 'TRANSACTIONS', desc: '活跃事务列表，`ACTIVE n sec` 很大即为长事务' },
        { flag: 'BUFFER POOL AND MEMORY', desc: '缓冲池命中率、脏页数、`History list length`' },
        { flag: 'innodb_print_all_deadlocks', desc: '开关变量，ON 后所有死锁写入 error log（默认只留最后一次）' },
        { flag: 'SHOW ENGINE INNODB MUTEX', desc: '看 InnoDB 内部互斥量，已废弃，一般不用' }
      ],
      examples: [
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW ENGINE INNODB STATUS\\G" | sed -n \'/LATEST DETECTED DEADLOCK/,/^---/p\'', desc: '只截出死锁段落，快速看是谁和谁互相等锁' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW ENGINE INNODB STATUS\\G" | sed -n \'/TRANSACTIONS/,/^---/p\'', desc: '看活跃事务与长事务，配合 `db-mysql-processlist` 定位会话' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SET GLOBAL innodb_print_all_deadlocks=ON;"', desc: '打开全量死锁记录，之后从 error log 里翻历史死锁' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW ENGINE INNODB STATUS\\G" > /tmp/innodb-status-$(date +%F-%H%M).txt', desc: '留存现场，事后对比 `History list length` 与事务变化' }
      ],
      notes: [
        '输出没有「重置」开关，只有最近一次死锁信息，要留证据请先把它重定向到文件再分析',
        '`History list length` 持续增长说明 purge 线程被长事务拖住，往往伴随 undo 表空间膨胀与磁盘上涨',
        '死锁是 InnoDB 的正常保护机制：应用侧应该捕获 `Deadlock found when trying to get lock` 并重试，而不是把死锁本身当故障',
        'MySQL 8.0 里 `SHOW ENGINE INNODB MUTEX` 已标记废弃，别在脚本里依赖它',
        '输出很长且字段是英文，建议固定 grep 关键字（`DEADLOCK`、`ACTIVE`、`History list length`）而不是通读'
      ],
      related: ['db-mysql-processlist', 'db-mysql-explain', 'db-mysql-slowlog'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/show-engine.html',
      tags: ['InnoDB', '死锁', '事务']
    },

    /* ---------- 10 / 56 ---------- */
    {
      id: 'db-mysql-explain',
      name: 'EXPLAIN / EXPLAIN ANALYZE',
      alias: ['EXPLAIN', 'EXPLAIN ANALYZE', '执行计划', 'FORMAT=TREE'],
      level: 2,
      syntax: 'EXPLAIN [ANALYZE] [FORMAT=TRADITIONAL|TREE|JSON] <SQL 语句>',
      summary: '看 SQL 到底怎么执行，索引有没有用上，慢查询优化的第一把刀。',
      desc: '两种模式要分清：`EXPLAIN` 只**估算**不执行，`EXPLAIN ANALYZE`（8.0.18 起）会**真正执行** SQL 并给出每一步的实际耗时与行数，是定位「估算 vs 实际差很多」的唯一手段。传统表格列重点看：`type`（`ALL` 全表扫描最差，`index` 全索引扫描，`range`/`ref`/`eq_ref`/`const` 依次更好）、`key`（实际用到的索引，`NULL` 就是没走索引）、`rows`（**预估**扫描行数）、`filtered`（过滤后剩余百分比）、`Extra`（`Using filesort` 排序无法用索引、`Using temporary` 用了临时表、`Using index` 覆盖索引）。MySQL 8.0.16 起默认 `FORMAT=TREE` 输出树形结构，比表格直观。`EXPLAIN FOR CONNECTION <Id>` 可以直接看**正在运行**的慢 SQL 的执行计划，不用等它跑完。',
      params: [
        { flag: 'ANALYZE', desc: '真正执行并返回实际耗时/行数（8.0.18+），注意会落数据' },
        { flag: 'FORMAT=TREE', desc: '树形输出，8.0.16 起的默认格式，看嵌套循环最直观' },
        { flag: 'FORMAT=JSON', desc: 'JSON 输出，含成本估算与索引建议，喂给分析工具用' },
        { flag: 'FORMAT=TRADITIONAL', desc: '传统表格输出，老教程里的那种' },
        { flag: 'FOR CONNECTION <Id>', desc: '看指定会话正在执行的 SQL 的执行计划' },
        { flag: 'type/key/rows/Extra', desc: '四个最该看的列：访问类型、实际索引、预估行数、额外动作' }
      ],
      examples: [
        { cmd: 'EXPLAIN SELECT * FROM orders WHERE user_id = 8812 AND status = \'PAID\';', desc: '看单表查询有没有走 `user_id` 索引，`type` 是不是 `ALL`' },
        { cmd: 'EXPLAIN ANALYZE SELECT o.id, o.amount FROM orders o JOIN users u ON u.id = o.user_id WHERE o.created_at >= \'2024-03-01\';', desc: '看连接查询各步骤的**实际**耗时与行数，找真正的瓶颈步骤' },
        { cmd: 'EXPLAIN FORMAT=JSON SELECT * FROM orders WHERE user_id = 8812;', desc: '输出成本估算与 `used_columns`，适合做深度分析' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "EXPLAIN FOR CONNECTION 41237;"', desc: '会话 41237 正在跑的慢 SQL 到底怎么执行的，不用等它结束' }
      ],
      notes: [
        '**`EXPLAIN ANALYZE` 会真的执行语句**：对 `UPDATE`/`DELETE` 直接跑会改数据，生产上要测就包在 `BEGIN; ...; ROLLBACK;` 里',
        '表格式输出里的 `rows` 是**预估**值，不是实际扫描行数；预估与实际差很多说明统计信息过期，执行 `ANALYZE TABLE <表>` 刷新',
        '`type=ALL` 且 `rows` 很大 = 全表扫描，优先考虑加索引或改 SQL 条件',
        '`Extra` 出现 `Using filesort`/`Using temporary` 通常意味着排序或分组没走索引，是慢查询的常见根因',
        '`EXPLAIN ANALYZE` 有执行副作用与额外开销，别在高峰期对生产大表执行',
        '本站仿真场景：日志里 `query timeout after 5000ms, orderId=8812` 对应 `orders` 表按 `order_id` 查询，先用 `EXPLAIN` 确认是否走主键'
      ],
      related: ['db-mysql-slowlog', 'db-mysql-processlist', 'db-mysql-information-schema', 'db-mysql-pt-query-digest'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/explain.html',
      tags: ['执行计划', '慢查询', '索引']
    },

    /* ---------- 11 / 56 ---------- */
    {
      id: 'db-mysql-slowlog',
      name: '慢查询日志 / mysqldumpslow',
      kind: 'recipe',
      alias: ['slow_query_log', 'long_query_time', 'mysqldumpslow', '慢日志'],
      level: 2,
      syntax: 'SET GLOBAL slow_query_log=ON; / mysqldumpslow -s t -t 10 <慢日志文件>',
      summary: '把超过阈值的 SQL 记下来，再用 mysqldumpslow 汇总出最慢的几条。',
      desc: '四个参数决定记录什么：`slow_query_log`（开关）、`slow_query_log_file`（文件位置）、`long_query_time`（阈值，默认 10 秒，生产常设 0.5~1 秒）、`log_queries_not_using_indexes`（没走索引的也记，开了日志会暴涨，慎用）。8.0 还可以 `log_output=TABLE` 把慢日志写进 `mysql.slow_log` 表，直接用 SQL 查更灵活。`mysqldumpslow` 是官方自带的汇总脚本：`-s t` 按总耗时排序、`-s c` 按出现次数、`-s at` 按平均耗时、`-t N` 只取前 N 条、`-g <模式>` 按关键字过滤，它会把参数值相同的 SQL 归一化成 `N`，所以只会看到「模板」而不是具体某条。',
      params: [
        { flag: 'slow_query_log', desc: '慢日志开关，`ON`/`OFF`，8.0 默认关闭（很多云数据库默认开）' },
        { flag: 'long_query_time', desc: '超过多少秒算慢查询，默认 10；生产建议 0.5~1' },
        { flag: 'slow_query_log_file', desc: '慢日志文件路径，常见 `/var/lib/mysql/mysql-slow.log`' },
        { flag: 'log_queries_not_using_indexes', desc: '记录未使用索引的语句，压力大的库不要开' },
        { flag: 'log_output', desc: '`FILE`（默认）/`TABLE`/`FILE,TABLE`，写表里可 SQL 查询' },
        { flag: '-s t / -s c / -s at', desc: 'mysqldumpslow：按总耗时 / 出现次数 / 平均耗时排序' },
        { flag: '-t <N> / -g <模式>', desc: 'mysqldumpslow：只显示前 N 条 / 用正则过滤语句' }
      ],
      examples: [
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SET GLOBAL slow_query_log=ON; SET GLOBAL long_query_time=1;"', desc: '临时开启慢日志并把阈值调到 1 秒（重启失效）' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW VARIABLES LIKE \'slow_query%\' ; SHOW VARIABLES LIKE \'long_query_time\';"', desc: '确认慢日志是否真的开着、阈值是多少、文件在哪' },
        { cmd: 'mysqldumpslow -s t -t 10 /var/lib/mysql/mysql-slow.log', desc: '按总耗时排出最拖后腿的 10 类 SQL，优化从这里下手' },
        { cmd: 'mysqldumpslow -s c -t 20 -g "SELECT" /var/lib/mysql/mysql-slow.log', desc: '按执行次数排序，找「单次不慢但被调用几十万次」的 SQL' }
      ],
      notes: [
        '`SET GLOBAL` 重启即失效，长期开启要写进 `my.cnf` 的 `[mysqld]` 段并重启实例',
        '`long_query_time=0` 会记录所有语句，日志分钟级就能涨到几个 GB；本站仿真里数据盘 `/data` 已经 100%，开之前先 `df -h` 看空间',
        '`log_queries_not_using_indexes=ON` 在小表上也会刷屏，通常只在专项优化期间临时打开',
        '`mysqldumpslow` 输出的 SQL 是归一化模板（数字变成 `N`、字符串变成 `S`），要定位具体的 `orderId=8812` 请直接 grep 慢日志或上 `db-mysql-pt-query-digest`',
        '慢日志只记录「执行完」的语句，正在卡住的长事务要配合 `db-mysql-processlist` 看'
      ],
      related: ['db-mysql-pt-query-digest', 'db-mysql-explain', 'db-mysql-processlist'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/slow-query-log.html',
      tags: ['慢查询', '日志', '优化']
    },

    /* ---------- 12 / 56 ---------- */
    {
      id: 'db-mysql-pt-query-digest',
      name: 'pt-query-digest',
      alias: ['pt-query-digest', '慢日志聚合', 'percona toolkit'],
      level: 3,
      syntax: 'pt-query-digest [--since <时间>] [--limit N] <慢日志|通用日志|binlog>',
      summary: 'Percona 慢日志聚合工具，按总耗时排名并给出可读的优化线索。',
      desc: '输出比 `mysqldumpslow` 详细得多：整体摘要（时间范围、总查询数、各语句类别的响应时间占比）+ 每条 SQL 的「Rank / Response time / Calls / R/Call / Rows examine」以及执行计划建议。除了慢日志，它还能分析通用查询日志、binlog（`--type=binlog`），甚至实时连库抓 `--processlist`。参数是时间过滤的利器：`--since`/`--until` 只看事故时间窗，`--limit` 控制报表长度，`--order-by Query_time:sum` 按总耗时排序。`--review` 能把结果落到 Percona 的 `query_review` 表里，做「优化前 vs 优化后」的对比。',
      params: [
        { flag: '--since / --until', desc: '只看指定时间窗，如 `--since \'2024-03-18 09:00:00\'`' },
        { flag: '--limit <N>', desc: '报表里最多列多少条语句，默认 95% 占比截断' },
        { flag: '--order-by Query_time:sum', desc: '排序依据，可换成 `Query_time:max`、`Calls:sum` 等' },
        { flag: '--type=binlog', desc: '把输入当 binlog 分析（需要 `--type=binlog` 配合 mysqlbinlog）' },
        { flag: '--processlist', desc: '实时轮询正在执行的语句（需给连接参数），短时抓现场' },
        { flag: '--review', desc: '把分析结果写入 `query_review` 表，便于历史对比' }
      ],
      examples: [
        { cmd: 'pt-query-digest /var/lib/mysql/mysql-slow.log > /tmp/slow-report-20240318.txt', desc: '生成完整慢日志报表，最常用的用法' },
        { cmd: 'pt-query-digest --since \'2024-03-18 09:00:00\' --until \'2024-03-18 10:00:00\' /var/lib/mysql/mysql-slow.log', desc: '只看应用报 `query timeout` 那一小时的慢 SQL' },
        { cmd: 'pt-query-digest --limit 10 --order-by Query_time:sum /var/lib/mysql/mysql-slow.log', desc: '只输出总耗时最高的 10 类 SQL，快速抓主要矛盾' },
        { cmd: 'pt-query-digest --type=slowlog --print /var/lib/mysql/mysql-slow.log | head -100', desc: '先看报表头部摘要，判断这段时间到底慢在哪一类语句' }
      ],
      notes: [
        '解析几 GB 的慢日志很吃 CPU 和内存，别在数据库主机业务高峰期直接跑，可先 `scp` 到分析机',
        '报表里的「执行计划建议」是基于统计的推测，落地前必须用 `db-mysql-explain` 人工确认',
        '它是 Percona Toolkit 的一部分，需要额外安装（不是 MySQL 自带），离线环境要提前备好 rpm/deb 包',
        '和 `mysqldumpslow` 一样依赖慢日志先开着，没开日志再牛的工具也无数据可析'
      ],
      related: ['db-mysql-slowlog', 'db-mysql-explain', 'db-mysql-information-schema'],
      docs: 'https://docs.percona.com/percona-toolkit/pt-query-digest.html',
      tags: ['慢查询', 'Percona', '报表']
    },

    /* ---------- 13 / 56 ---------- */
    {
      id: 'db-mysql-create-user',
      name: 'CREATE USER',
      alias: ['CREATE USER', '建库账号', 'caching_sha2_password', '改密码'],
      level: 2,
      syntax: 'CREATE USER \'<用户>\'@\'<来源主机>\' IDENTIFIED BY \'<密码>\';',
      summary: '按最小权限给应用建独立账号，别让业务一直用 root 连库。',
      desc: 'MySQL 账号是「用户名 + 来源主机」的组合：`\'app\'@\'10.0.1.%\'` 和 `\'app\'@\'localhost\'` 是**两个不同的账号**，权限互不相干。来源主机尽量写成网段（`10.0.1.%`）而不是 `%`，`%` 表示任何 IP 都能来试密码。MySQL 8.0 默认认证插件是 `caching_sha2_password`，老版本驱动（5.1.x 版 JDBC、老 PHP）会报 `Authentication plugin \'caching_sha2_password\' cannot be loaded`，此时可以 `IDENTIFIED WITH mysql_native_password BY \'...\'` 兼容，但注意 `mysql_native_password` 从 8.0.34 起已标记废弃、8.4 默认关闭，长期还是要升级驱动。改密码用 `ALTER USER`，不是 `SET PASSWORD`（8.0 仍支持但不推荐）。',
      params: [
        { flag: 'IDENTIFIED BY \'<密码>\'', desc: '设置密码，会在 binlog 里以哈希形式记录' },
        { flag: 'IDENTIFIED WITH <插件> BY \'<密码>\'', desc: '指定认证插件，兼容老驱动时用 `mysql_native_password`' },
        { flag: '\'<用户>\'@\'localhost\'', desc: '只允许本机 socket/127.0.0.1 登录' },
        { flag: '\'<用户>\'@\'10.0.1.%\'', desc: '只允许指定网段登录，生产推荐写法' },
        { flag: 'ALTER USER ... IDENTIFIED BY', desc: '改密码，立即生效' },
        { flag: 'DROP USER \'<用户>\'@\'<主机>\'', desc: '删除账号（不会自动清理已授的权限记录）' },
        { flag: 'CREATE USER IF NOT EXISTS', desc: '账号已存在时不报错，适合放进初始化脚本' }
      ],
      examples: [
        { cmd: 'CREATE USER \'app\'@\'10.0.1.%\' IDENTIFIED BY \'App@2024\';', desc: '给应用建账号，限定只能从 10.0.1 网段连' },
        { cmd: 'CREATE USER \'backup\'@\'10.0.1.23\' IDENTIFIED BY \'Bk@2024\';', desc: '给备份主机建专用账号，配合只读权限做每日备份' },
        { cmd: 'ALTER USER \'app\'@\'10.0.1.%\' IDENTIFIED BY \'NewApp@2024\';', desc: '改密码，改完记得同步应用配置与连接池' },
        { cmd: 'CREATE USER \'legacy\'@\'%\' IDENTIFIED WITH mysql_native_password BY \'Legacy@2024\';', desc: '老驱动连不上 8.0 时的兼容写法（只作过渡）' }
      ],
      notes: [
        '建完账号**必须再 `GRANT`**，否则登录后什么都不能做（报 `Access denied ... to database`）',
        '开了 `validate_password` 插件时弱密码会报 `ERROR 1819 (HY000): Your password does not satisfy the current policy requirements`',
        '密码里含 `$`、`!`、`@` 时在 Shell 里要加单引号，否则会被 Shell 先展开',
        '`DROP USER` 前先确认没有业务在用（看 `information_schema.processlist` 的 `user` 列）',
        '本站仿真的应用配置 `/data/app/config.yaml` 里连库账号是 `app`，密码走环境变量 `${DB_PASSWORD}`，不要写死在配置文件里'
      ],
      related: ['db-mysql-grant', 'db-mysql-show-grants'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/create-user.html',
      tags: ['账号', '权限', '安全']
    },

    /* ---------- 14 / 56 ---------- */
    {
      id: 'db-mysql-grant',
      name: 'GRANT / REVOKE',
      alias: ['GRANT', 'REVOKE', '授权', '回收权限'],
      level: 2,
      syntax: 'GRANT <权限列表> ON <库>.<表> TO \'<用户>\'@\'<主机>\';',
      summary: '给账号授权、回收权限，按库按表最小化授权才是安全做法。',
      desc: '常用权限分两类：数据权限 `SELECT`/`INSERT`/`UPDATE`/`DELETE`，结构权限 `CREATE`/`ALTER`/`DROP`/`INDEX`/`REFERENCES`；管理类权限 `PROCESS`（看别人会话，配合 `SHOW PROCESSLIST`）、`REPLICATION CLIENT`（看主从状态）、`REPLICATION SLAVE`（从库同步账号必需）、`SUPER`。写法上 `ON <库>.*` 授权整个库，`ON *.*` 是全局。MySQL 8.0 的一个重要变化：`GRANT ... IDENTIFIED BY` 的老写法**已被移除**，必须先 `CREATE USER` 再 `GRANT`，否则报 `ERROR 1064`。用 `REVOKE` 回收时权限名和范围要和授权时一致。',
      params: [
        { flag: 'ON <库>.<表>', desc: '权限范围，如 `ON orders.orders` / `ON orders.*` / `ON *.*`' },
        { flag: 'TO \'<用户>\'@\'<主机>\'', desc: '目标账号，主机部分必须与 `CREATE USER` 时完全一致' },
        { flag: 'WITH GRANT OPTION', desc: '允许被授权者把权限再授给别人，非必要不给' },
        { flag: 'REVOKE ... ON ... FROM ...', desc: '回收权限，范围写法与授权一致' },
        { flag: 'PROCESS / REPLICATION CLIENT', desc: '监控账号需要的两个全局权限' },
        { flag: 'FLUSH PRIVILEGES', desc: '只有直接改 `mysql` 库权限表时才需要，用 GRANT 时不必执行' }
      ],
      examples: [
        { cmd: 'GRANT SELECT, INSERT, UPDATE, DELETE ON orders.* TO \'app\'@\'10.0.1.%\';', desc: '给应用账号授权增删改查，最常用的最小权限组合' },
        { cmd: 'GRANT PROCESS, REPLICATION CLIENT ON *.* TO \'monitor\'@\'10.0.1.%\';', desc: '给监控账号授权，让它能看会话和主从状态' },
        { cmd: 'REVOKE DELETE ON orders.* FROM \'app\'@\'10.0.1.%\';', desc: '回收删除权限，防止误删数据' },
        { cmd: 'GRANT SELECT ON orders.* TO \'backup\'@\'10.0.1.23\';', desc: '备份账号只给只读，配合 mysqldump 使用' }
      ],
      notes: [
        '`GRANT ALL PRIVILEGES ON *.*` 等于给了超级权限，属于高危操作，生产环境禁止随手用',
        '`WITH GRANT OPTION` 会形成权限扩散链，回收时要顺着链条一起清',
        'MySQL 8.0 已移除 `GRANT ... IDENTIFIED BY \'密码\'` 语法，老教程里的这条会直接报语法错误',
        '改权限立即生效，不需要 `FLUSH PRIVILEGES`、更不需要重启',
        '给从库用的复制账号至少要 `REPLICATION SLAVE`，8.0 用 `caching_sha2_password` 时还要配合 `GET_SOURCE_PUBLIC_KEY=1`'
      ],
      related: ['db-mysql-create-user', 'db-mysql-show-grants'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/grant.html',
      tags: ['权限', '授权', '安全']
    },

    /* ---------- 15 / 56 ---------- */
    {
      id: 'db-mysql-show-grants',
      name: 'SHOW GRANTS',
      alias: ['SHOW GRANTS FOR', '查看权限', 'mysql.user'],
      level: 1,
      syntax: 'SHOW GRANTS [FOR \'<用户>\'@\'<主机>\'];',
      summary: '一条命令确认账号到底有哪些权限，排查权限报错先看它。',
      desc: '不写 `FOR` 时查的是**当前登录账号**的权限；写 `FOR` 可以查别人（需要相应权限）。输出是「可以直接抄回去执行」的 `GRANT` 语句，所以它同时也是备份权限的手段。配套的两张系统表：`mysql.user`（账号是否存在、是否锁定 `account_locked`、密码最后修改时间 `password_last_changed`）、`mysql.db`/`mysql.tables_priv`（库级与表级权限明细）。排障时最常见的坑是主机名不匹配——建的是 `\'app\'@\'10.0.1.%\'`，而应用从 `127.0.0.1` 连进来就匹配不上 `localhost`，会直接报 `Access denied`。',
      params: [
        { flag: 'FOR \'<用户>\'@\'<主机>\'', desc: '查指定账号；主机部分必须与实际账号一致' },
        { flag: 'CURRENT_USER()', desc: '`SHOW GRANTS FOR CURRENT_USER();` 明确查当前会话身份' },
        { flag: 'mysql.user', desc: '系统表，看账号清单、锁定状态、密码最后修改时间' },
        { flag: 'mysql.db / tables_priv', desc: '库级/表级权限明细，权限查不全时来这里核对' }
      ],
      examples: [
        { cmd: 'SHOW GRANTS FOR \'app\'@\'10.0.1.%\';', desc: '确认应用账号有哪些权限，是否漏了某张表的 SELECT' },
        { cmd: 'SHOW GRANTS;', desc: '看当前登录账号自己的权限，最常用' },
        { cmd: 'SELECT user, host, account_locked FROM mysql.user ORDER BY user;', desc: '列出全部账号，确认账号是否存在、是否被锁定' },
        { cmd: 'SELECT user, host, db, Select_priv, Insert_priv, Update_priv, Delete_priv FROM mysql.db;', desc: '看库级权限分配，做权限审计' }
      ],
      notes: [
        '报 `ERROR 1141 (42000): There is no such grant defined for user ...` 通常是主机名部分写错（`localhost` 与 `%` 是两个账号）',
        '同一用户名在不同来源主机下权限可能完全不同，查权限必须「用户名 + 主机」一起写全',
        '8.0 的 `mysql.user` 表里看不到明文密码（存的是 `authentication_string` 哈希），改密码用 `ALTER USER`',
        '权限审计时别忘了 `mysql.global_grants`（8.0 新增的动态权限）也存放着一部分全局权限'
      ],
      related: ['db-mysql-grant', 'db-mysql-create-user'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/show-grants.html',
      tags: ['权限', '查询', '审计']
    },

    /* ---------- 16 / 56 ---------- */
    {
      id: 'db-mysql-change-replication-source',
      name: 'CHANGE REPLICATION SOURCE TO',
      alias: ['CHANGE MASTER TO', 'START REPLICA', 'STOP REPLICA', '搭从库'],
      level: 3,
      syntax: 'STOP REPLICA; CHANGE REPLICATION SOURCE TO SOURCE_HOST=\'<主库IP>\', SOURCE_USER=\'<账号>\', SOURCE_PASSWORD=\'<密码>\', SOURCE_LOG_FILE=\'<binlog>\', SOURCE_LOG_POS=<位点>; START REPLICA;',
      summary: '把从库指向主库并给定位点，搭主从和切换主库都靠这一组命令。',
      desc: 'MySQL 8.0.23 起把复制术语整体改名：`CHANGE MASTER TO` → `CHANGE REPLICATION SOURCE TO`、`START SLAVE` → `START REPLICA`、`SHOW SLAVE STATUS` → `SHOW REPLICA STATUS`，旧写法在 8.0 里仍兼容但会有废弃警告。标准动作是三步：`STOP REPLICA` → `CHANGE REPLICATION SOURCE TO ...` → `START REPLICA`（不停就改会报 `ERROR 3021`）。位点两种给法：① 传统位点，从主库 `SHOW MASTER STATUS`（新版 MySQL 改名为 `SHOW BINARY LOG STATUS`）或备份文件头注释里拿 `File`/`Position`；② GTID 模式直接写 `SOURCE_AUTO_POSITION=1`，不用记位点，这也是现在的主流做法。换主库前用 `STOP REPLICA IO_THREAD` 让从库先把 relay log 追平，再执行切换。',
      params: [
        { flag: 'SOURCE_HOST / SOURCE_PORT', desc: '主库地址与端口（旧名 `MASTER_HOST`/`MASTER_PORT`）' },
        { flag: 'SOURCE_USER / SOURCE_PASSWORD', desc: '复制账号，需要 `REPLICATION SLAVE` 权限' },
        { flag: 'SOURCE_LOG_FILE / SOURCE_LOG_POS', desc: '传统位点复制：binlog 文件名与偏移量' },
        { flag: 'SOURCE_AUTO_POSITION=1', desc: 'GTID 自动定位，不用指定位点，推荐' },
        { flag: 'GET_SOURCE_PUBLIC_KEY=1', desc: '8.0 用 caching_sha2_password 复制账号时的必备项' },
        { flag: 'SOURCE_SSL=1', desc: '跨公网复制时对 binlog 传输加密' },
        { flag: 'START REPLICA / STOP REPLICA', desc: '启动/停止复制线程，可用 `IO_THREAD`、`SQL_THREAD` 只操作其中一个' },
        { flag: 'RESET REPLICA ALL', desc: '清空复制配置，重新指向新主库前使用' }
      ],
      examples: [
        { cmd: 'STOP REPLICA; CHANGE REPLICATION SOURCE TO SOURCE_HOST=\'10.0.2.15\', SOURCE_USER=\'repl\', SOURCE_PASSWORD=\'Repl@2024\', SOURCE_LOG_FILE=\'mysql-bin.000042\', SOURCE_LOG_POS=197, GET_SOURCE_PUBLIC_KEY=1; START REPLICA;', desc: '传统位点搭建从库，含 8.0 认证插件必备的 GET_SOURCE_PUBLIC_KEY' },
        { cmd: 'STOP REPLICA; CHANGE REPLICATION SOURCE TO SOURCE_HOST=\'10.0.2.15\', SOURCE_PORT=3306, SOURCE_USER=\'repl\', SOURCE_PASSWORD=\'Repl@2024\', SOURCE_AUTO_POSITION=1; START REPLICA;', desc: 'GTID 模式搭建从库，不用抄位点，推荐做法' },
        { cmd: 'STOP REPLICA IO_THREAD; SHOW REPLICA STATUS\\G', desc: '切主前先停 IO 线程、等 SQL 线程把 relay log 追平' },
        { cmd: 'CHANGE MASTER TO MASTER_HOST=\'10.0.2.15\', MASTER_USER=\'repl\', MASTER_PASSWORD=\'Repl@2024\', MASTER_LOG_FILE=\'mysql-bin.000042\', MASTER_LOG_POS=197;', desc: '8.0.22 及更早版本的旧写法，只在老环境里用' }
      ],
      notes: [
        '改指向必须 `STOP REPLICA` 在前，否则报 `ERROR 3021 (HY000): This operation cannot be performed with a running replica io_thread`',
        '`GET_SOURCE_PUBLIC_KEY=1` 是 8.0 的高频坑：复制账号用 `caching_sha2_password` 时不加它，从库 IO 线程会一直 `Connecting` 并报认证失败',
        '`SOURCE_PASSWORD` 会明文存进 `mysql.slave_master_info` 表，注意该表与 datadir 的访问权限',
        '8.0.22 之前没有新语法，写 `CHANGE REPLICATION SOURCE TO` 会直接语法报错，先 `SELECT VERSION();` 确认版本',
        '`RESET REPLICA ALL` 只清配置不动数据，执行前把位点记下来，否则重新对齐很麻烦',
        '本站仿真里主库是 `db-prod-01`（`/etc/hosts` 里 10.0.2.15），搭从库前先在主库执行 `SHOW MASTER STATUS;` 取位点'
      ],
      related: ['db-mysql-show-replica-status', 'db-mysql-replication-lag', 'db-mysql-mysqldump'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/change-replication-source-to.html',
      tags: ['主从', '复制', 'GTID']
    },

    /* ---------- 17 / 56 ---------- */
    {
      id: 'db-mysql-show-replica-status',
      name: 'SHOW REPLICA STATUS',
      alias: ['SHOW SLAVE STATUS', 'Seconds_Behind_Master', 'Slave_SQL_Running', '主从状态'],
      level: 3,
      syntax: 'SHOW REPLICA STATUS\\G（旧写法 SHOW SLAVE STATUS\\G）',
      summary: '从库同步状态的权威视图，两个线程活着没、延迟多少一眼看穿。',
      desc: '只看五个字段就能判断 90% 的问题：`Replica_IO_Running`（拉 binlog 的线程，`Yes` 正常、`Connecting` 表示连不上主库、`No` 表示线程挂了）、`Replica_SQL_Running`（回放 relay log 的线程，`No` 基本就是数据冲突或表不存在）、`Seconds_Behind_Master`（延迟秒数，`NULL` 说明复制线程没跑起来）、`Last_IO_Error` / `Last_SQL_Error`（最直接的报错原因）。进阶看 `Retrieved_Gtid_Set`（已拉到的 GTID 集合）与 `Executed_Gtid_Set`（已执行的），两者不一致的部分就是还没回放的量——比 `Seconds_Behind_Master` 可靠得多。注意字段名：8.0.22 起官方文档用 `Replica_*`，但从库还没升级时输出的仍是 `Slave_*`，脚本里两个名字都要兼容。另外从库延时**必须同时看** `SHOW REPLICA STATUS` 与 `Exec_Master_Log_Pos` 是否在推进，只盯秒数会误判。',
      params: [
        { flag: '\\G', desc: '竖排输出，字段多，不加 `\\G` 根本没法读' },
        { flag: 'Replica_IO_Running', desc: '拉取 binlog 的线程状态：Yes / Connecting / No' },
        { flag: 'Replica_SQL_Running', desc: '回放 relay log 的线程状态，No 时必看 `Last_SQL_Error`' },
        { flag: 'Seconds_Behind_Master', desc: '延迟秒数；NULL 表示线程没跑，0 也**不一定**没延迟' },
        { flag: 'Last_IO_Error / Last_SQL_Error', desc: '最近一次 IO / SQL 线程错误，排障的第一手信息' },
        { flag: 'Retrieved_Gtid_Set', desc: 'GTID 模式：已从主库拉到的 GTID 集合' },
        { flag: 'Executed_Gtid_Set', desc: 'GTID 模式：已在本库执行完的 GTID 集合，两者差值即积压' }
      ],
      examples: [
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW REPLICA STATUS\\G" | egrep "Running|Seconds_Behind|Last_.*Error|Log_Pos"', desc: '一行命令只看关键字段，日常巡检就够用' },
        { cmd: 'mysql -h db-prod-01 -u root -rp -e "SHOW REPLICA STATUS\\G" | grep -E "Retrieved_Gtid_Set|Executed_Gtid_Set" -A 1', desc: 'GTID 模式下对比两个集合，判断还有多少事务没回放' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW SLAVE STATUS\\G"', desc: '老版本或老习惯的写法，输出内容与 SHOW REPLICA STATUS 完全一样' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SELECT MEMBER_HOST, MEMBER_STATE FROM performance_schema.replication_group_members;"', desc: 'MGR（组复制）集群用这个视图看成员状态，不是主从架构' }
      ],
      notes: [
        '`Seconds_Behind_Master = 0` **不等于没延迟**：主库长时间没写入、或 SQL 线程空闲时它也是 0；大事务执行期间该值还会在 0 和很大之间跳变（只在事务提交时更新）',
        '`Slave_SQL_Running=No` 先看 `Last_SQL_Error`：`1062` 是主键冲突、`1032` 是找不到行，两者都说明主从数据已不一致',
        '`SET GLOBAL SQL_SLAVE_SKIP_COUNTER=1` 在 8.0 已标记废弃且 GTID 模式下不可用，正确做法是用备份重建从库',
        '老版本用 `SHOW SLAVE STATUS`、新版本输出 `Replica_*` 字段名，写监控脚本时两套字段都要取',
        '从库只读要确认 `read_only=ON` 与 `super_read_only=ON`，否则误写会造成主从冲突'
      ],
      related: ['db-mysql-change-replication-source', 'db-mysql-replication-lag', 'db-mysql-mysqldump'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/show-replica-status.html',
      tags: ['主从', '延迟', '诊断']
    },

    /* ---------- 18 / 56 ---------- */
    {
      id: 'db-mysql-replication-lag',
      name: '主从延迟与断链排查',
      kind: 'recipe',
      alias: ['主从延迟', '复制断了', 'Seconds_Behind_Master 大', '1236'],
      level: 4,
      syntax: '（组合）SHOW REPLICA STATUS → SHOW PROCESSLIST → SHOW ENGINE INNODB STATUS → 主库 SHOW MASTER STATUS',
      summary: '从库落后或复制断链时的固定排查顺序，从线程状态一路查到根因。',
      desc: '**排查顺序（先看什么 → 再看什么）**：① 从库 `SHOW REPLICA STATUS\\G`，先分清是 **IO 线程断**（`Connecting`：网络、防火墙、账号、`GET_SOURCE_PUBLIC_KEY`）还是 **SQL 线程断**（`No`：`Last_SQL_Error` 里的主键冲突/表不存在）；② 两个线程都 `Yes` 但 `Seconds_Behind_Master` 很大 → 是**回放跟不上**，对比 `Retrieved_Gtid_Set` 与 `Executed_Gtid_Set` 估算积压量；③ 从库 `SHOW PROCESSLIST` 与 `SHOW ENGINE INNODB STATUS`，找正在回放的大事务、锁等待、`History list length` 增长；④ 主库 `SHOW MASTER STATUS` 看 binlog 是否已被 purge，从库要的位点没了就只能重做从库；⑤ 最后看系统层：从库 `iostat -x 1`（`%util` 是否打满）、`top`（回放线程是否吃满单核）、`sar -n DEV 1`（复制流量是否被带宽卡住）。常见根因：主库跑了大事务或批量 DDL、从库单线程回放、从库磁盘比主库慢、`max_allowed_packet` 主从不一致、网络抖动。',
      params: [
        { flag: 'Last_IO_Error', desc: 'IO 线程错误，`error connecting to master` 看网络与账号，`1236` 看位点' },
        { flag: 'Last_SQL_Error', desc: 'SQL 线程错误，1062/1032 表示主从数据已不一致' },
        { flag: 'Retrieved_Gtid_Set vs Executed_Gtid_Set', desc: 'GTID 模式下最可靠的积压量指标' },
        { flag: 'replica_parallel_workers', desc: '并行回放线程数，8.0.26 起的新名（旧名 `slave_parallel_workers`）' },
        { flag: 'replica_parallel_type=LOGICAL_CLOCK', desc: '并行复制模式，配合上一项才能真正并行' },
        { flag: 'SHOW MASTER STATUS', desc: '主库上执行，确认当前 binlog 位点与文件是否还在' }
      ],
      examples: [
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW REPLICA STATUS\\G" | egrep "Running|Seconds_Behind_Master|Last_.*Error|Retrieved_Gtid_Set|Executed_Gtid_Set"', desc: '第一步：一次拿到线程状态、延迟与错误信息' },
        { cmd: 'mysql -h db-prod-01 -u root -p -e "SHOW VARIABLES LIKE \'replica_parallel_workers\'; SET GLOBAL replica_parallel_workers=8;"', desc: '从库回放跟不上时开并行复制（改完要 STOP/START REPLICA 才生效）' },
        { cmd: 'mysql -h 10.0.2.15 -u root -p -e "SHOW MASTER STATUS;"', desc: '第四步：主库确认 binlog 位点是否还在，判断要不要重建从库' },
        { cmd: 'iostat -x 1 5; top -H -p $(pgrep -f "sql_thread|replica")', desc: '第五步：从库磁盘 `%util` 与回放线程 CPU，确认是不是硬件瓶颈' }
      ],
      notes: [
        '复制断开先别急着重启从库：`Last_SQL_Error` 里的冲突不解决，`START REPLICA` 起来还会立刻再断',
        '报 `Got fatal error 1236 ... Could not find first log file name in binary log index file` 说明主库 binlog 已被清理，唯一解是拿最新备份重建从库',
        '`replica_parallel_workers` 改完必须 `STOP REPLICA; START REPLICA;` 才生效，热改不生效',
        '延迟秒数会随大事务提交跳变，判断趋势要看 `Exec_Master_Log_Pos` / `Executed_Gtid_Set` 是否持续前进，而不是看某一秒的数字',
        '本站仿真里主库是 `db-prod-01`、从库常见现象是应用写多读少导致回放堆积，先按上面五步走，别跳步'
      ],
      related: ['db-mysql-show-replica-status', 'db-mysql-change-replication-source', 'db-mysql-slowlog', 'db-mysql-restore'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/replication-administration-status.html',
      tags: ['主从', '延迟', '排查顺序']
    },

    /* ---------- 19 / 56 ---------- */
    {
      id: 'db-mysql-information-schema',
      name: 'SHOW INDEX / information_schema',
      alias: ['SHOW INDEX FROM', 'information_schema.tables', '表大小', '碎片', '索引基数'],
      level: 3,
      syntax: 'SELECT ... FROM information_schema.TABLES|STATISTICS / SHOW INDEX FROM <库>.<表>;',
      summary: '查库表大小、碎片与索引结构，容量规划和加索引前必看。',
      desc: '最常用的三个视图：`information_schema.TABLES`（`DATA_LENGTH` 数据大小、`INDEX_LENGTH` 索引大小、`DATA_FREE` 碎片空间、`TABLE_ROWS` 行数、`ENGINE`、`TABLE_COLLATION`）、`information_schema.STATISTICS`（索引的列顺序 `SEQ_IN_INDEX` 与区分度 `CARDINALITY`）、`information_schema.INNODB_TABLESPACES`（8.0 的表空间实际文件大小）。`SHOW INDEX FROM <表>` 是看单表索引最快的写法，重点看 `Cardinality`（基数，越大区分度越高，接近 0 说明索引几乎没用）和 `Seq_in_index`（联合索引的列顺序）。`DATA_FREE` 很大说明表里有大量空洞，需要 `OPTIMIZE TABLE` 回收（见 `db-mysql-optimize-table`）。两个高频误判：`TABLE_ROWS` 对 InnoDB 是**估算值**，误差可能几倍；`DATA_FREE` 只是表空间内的空闲页，不代表能还给操作系统。',
      params: [
        { flag: 'information_schema.TABLES', desc: '库表级元数据：大小、行数、引擎、字符集、碎片' },
        { flag: 'DATA_LENGTH / INDEX_LENGTH', desc: '数据与索引占用字节数，容量规划用' },
        { flag: 'DATA_FREE', desc: '表空间内空闲字节，值大说明碎片多' },
        { flag: 'TABLE_ROWS', desc: 'InnoDB 下是**估算值**，精确行数要 `COUNT(*)`' },
        { flag: 'information_schema.STATISTICS', desc: '索引明细：列顺序、基数、索引类型' },
        { flag: 'SHOW INDEX FROM <表>', desc: '单表索引速查，等价于查 STATISTICS' },
        { flag: 'SHOW CREATE TABLE <表>', desc: '看完整建表语句，确认索引定义与字符集' }
      ],
      examples: [
        { cmd: 'SELECT table_name, ROUND((data_length+index_length)/1024/1024,1) AS size_mb, ROUND(data_free/1024/1024,1) AS free_mb, table_rows FROM information_schema.tables WHERE table_schema=\'orders\' ORDER BY data_length DESC LIMIT 10;', desc: '列出 orders 库里最大的 10 张表与碎片大小，容量排查第一步' },
        { cmd: 'SHOW INDEX FROM orders.orders_202403;', desc: '看单表索引清单，重点核对 cardinality 与列顺序' },
        { cmd: 'SELECT index_name, seq_in_index, column_name, cardinality FROM information_schema.statistics WHERE table_schema=\'orders\' AND table_name=\'orders\' ORDER BY index_name, seq_in_index;', desc: '检查联合索引的列顺序，判断能不能命中查询条件' },
        { cmd: 'SELECT table_name, engine FROM information_schema.tables WHERE table_schema=\'orders\' AND engine <> \'InnoDB\';', desc: '找出非 InnoDB 表，`mysqldump --single-transaction` 备份时它们仍会被锁' }
      ],
      notes: [
        '`TABLE_ROWS` 在 InnoDB 上是采样估算，几百行的表可能显示 0 或偏差很大，别拿它当业务数据统计',
        '`DATA_FREE` 只反映表空间内部空闲页，共享表空间（`ibdata1`）下这些空间不会还给操作系统',
        '查询 `information_schema` 会触发打开表元数据，实例上表特别多（几万张）时可能很慢，务必带 `WHERE table_schema=...` 条件',
        '`SHOW INDEX` 的 `Cardinality` 是统计信息，不准确时执行 `ANALYZE TABLE` 刷新后再看',
        '加索引前先看这里：重复索引（同一个列已在前缀里）会增加写入开销而没有任何收益'
      ],
      related: ['db-mysql-optimize-table', 'db-mysql-explain', 'db-mysql-mysqldump'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/information-schema-tables-table.html',
      tags: ['元数据', '容量', '索引']
    },

    /* ---------- 20 / 56 ---------- */
    {
      id: 'db-mysql-optimize-table',
      name: 'OPTIMIZE TABLE / ALTER TABLE',
      alias: ['OPTIMIZE TABLE', 'ALTER TABLE', 'pt-online-schema-change', '表碎片整理'],
      level: 3,
      syntax: 'OPTIMIZE TABLE <表>; / ALTER TABLE <表> ADD COLUMN ... , ALGORITHM=INPLACE, LOCK=NONE;',
      summary: '回收表碎片、改表结构；大表操作必须用在线工具或指定算法。',
      desc: '`OPTIMIZE TABLE` 对 InnoDB 的实际动作是「重建表 + 重建索引」（等价于 `ALTER TABLE ... ENGINE=InnoDB`），能回收 `DATA_FREE` 碎片并刷新统计信息，但**会锁表且需要和原表等大的额外磁盘空间**，几百 GB 的表在业务时段基本不能跑。改结构用 `ALTER TABLE`，MySQL 8.0 支持三种算法：`ALGORITHM=INSTANT`（8.0.12+，加列/改默认值等操作秒级完成，只改元数据）、`ALGORITHM=INPLACE`（原地重建，不阻塞 DML 但要重建表）、`ALGORITHM=COPY`（拷表，全程锁写）。加上 `LOCK=NONE` 表示要求「允许并发读写」，如果不满足会直接报错而不是默默锁表——这是保护生产的正确用法。超大表改结构推荐 `pt-online-schema-change`：它建一张影子表、用触发器同步增量、分批拷贝数据，最后原子改名，全程几乎不锁表。',
      params: [
        { flag: 'OPTIMIZE TABLE <表>', desc: '重建表回收碎片，InnoDB 下会锁表并需要额外空间' },
        { flag: 'ALGORITHM=INSTANT', desc: '8.0.12+ 秒级加列/改默认值，只改数据字典' },
        { flag: 'ALGORITHM=INPLACE', desc: '原地重建，不阻塞 DML，耗时与表大小相关' },
        { flag: 'ALGORITHM=COPY', desc: '拷贝整表，期间禁止写入，最慢但兼容性最好' },
        { flag: 'LOCK=NONE', desc: '要求并发读写；不满足就报错，避免误锁生产表' },
        { flag: '--alter / --execute', desc: 'pt-online-schema-change：变更语句与真正执行（不加只演练）' },
        { flag: '--critical-load Threads_running=<N>', desc: 'pt-osc：负载超过阈值自动中止，保护主库' },
        { flag: '--dry-run', desc: 'pt-osc：只检查不执行，变更前先跑一遍' }
      ],
      examples: [
        { cmd: 'OPTIMIZE TABLE orders.orders_202403;', desc: '整理单表碎片（低峰期执行，大表会锁很久）' },
        { cmd: 'ALTER TABLE orders.orders ADD COLUMN channel VARCHAR(32) DEFAULT NULL, ALGORITHM=INSTANT;', desc: '8.0 加列走 INSTANT 算法，秒级完成不锁表' },
        { cmd: 'ALTER TABLE orders.orders ADD INDEX idx_user_status (user_id, status), ALGORITHM=INPLACE, LOCK=NONE;', desc: '在线加索引，要求全程不阻塞读写，不满足则直接报错' },
        { cmd: 'pt-online-schema-change --alter "ADD COLUMN channel VARCHAR(32) DEFAULT NULL" D=orders,t=orders --critical-load Threads_running=100 --execute', desc: '大表在线加列，影子表 + 触发器同步，业务几乎无感' }
      ],
      notes: [
        '**`OPTIMIZE TABLE` 大表会长时间锁表**：InnoDB 下是重建表，期间该表不可写，几百 GB 的表几小时起步，生产必须放到维护窗口或用 `pt-online-schema-change`',
        '重建表需要与原表**差不多大的空闲磁盘**；本站仿真里 `/data` 已 100%，直接执行会失败甚至写坏，先 `df -h` 确认空间',
        '`ALTER TABLE` 不加 `ALGORITHM`/`LOCK` 时 MySQL 会自己挑一个算法，可能静默锁表；生产改表一律显式写 `ALGORITHM=INPLACE, LOCK=NONE`',
        '`ALTER TABLE` 隐式提交当前事务，且无法回滚，执行前先确认没有长事务（否则会等元数据锁并阻塞后续所有查询）',
        '`pt-online-schema-change` 需要表有主键或唯一索引，且不能在已有触发器的表上直接用（要加 `--preserve-triggers`）',
        '本站仿真场景：应用日志里 `query timeout after 5000ms` 也可能是元数据锁导致，改表前先看 `db-mysql-processlist`'
      ],
      related: ['db-mysql-information-schema', 'db-mysql-processlist', 'db-mysql-explain'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/optimize-table.html',
      tags: ['DDL', '碎片', '在线变更']
    },

    /* ================= B. Redis（13 条） ================= */

    /* ---------- 21 / 56 ---------- */
    {
      id: 'db-redis-cli',
      name: 'redis-cli',
      alias: ['redis-cli -h -p -a', '--no-auth-warning', '连接 Redis'],
      level: 1,
      syntax: 'redis-cli -h <主机> -p <端口> [-a <密码>] [--no-auth-warning] [-n <库号>]',
      summary: '连上 Redis 的命令行客户端，所有 Redis 操作都从它开始。',
      desc: '不写 `-h` 默认连 `127.0.0.1:6379`。带密码时 `-a` 会打印一句 `Warning: Using a password with -a option on the command line interface may not be safe.`，脚本里加 `--no-auth-warning` 关掉它（**只是关掉警告，不是不要密码**）。生产上更安全的做法是设 `REDISCLI_AUTH` 环境变量，避免密码出现在 `ps` 与 history 里。连接后可以用 `AUTH <密码>` 手工认证，也可以用 `PING` 自检（返回 `PONG`）。本站仿真环境里 Redis 跑在容器 `redis`（`redis:7.2-alpine`，映射 `0.0.0.0:6379->6379/tcp`），宿主机上 `ss -lntp` 看到的是 `127.0.0.1:6379`。',
      params: [
        { flag: '-h <主机>', desc: '服务端地址，默认 127.0.0.1' },
        { flag: '-p <端口>', desc: '端口，默认 6379' },
        { flag: '-a <密码>', desc: '连接时认证，会打印安全警告；密码会出现在 `ps` 里' },
        { flag: '--no-auth-warning', desc: '关闭 `-a` 的安全警告输出，只影响提示不影响功能' },
        { flag: '-n <库号>', desc: '直接切到指定库（0~15），等价于连上后执行 `SELECT <库号>`' },
        { flag: '--user <用户名>', desc: 'Redis 6 起的 ACL 账号，配合 `-a` 使用' },
        { flag: '-s <socket>', desc: '走 Unix socket 连接，本机访问更快且不暴露端口' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 -a \'Red1s@2024\' --no-auth-warning PING', desc: '带密码探活，返回 PONG 说明连上了' },
        { cmd: 'REDISCLI_AUTH=\'Red1s@2024\' redis-cli -h cache-prod-01 -p 6379 INFO server | head -5', desc: '用环境变量传密码，避免密码出现在 ps 与 history 里' },
        { cmd: 'redis-cli -h 127.0.0.1 -p 6379', desc: '本机连默认实例，最常用的日常写法' },
        { cmd: 'docker exec -it redis redis-cli PING', desc: '容器里执行，容器内无需再指定地址' }
      ],
      notes: [
        '示例里的 `REDISCLI_AUTH` 必须全大写，写错大小写等于没设，仍然会要求你输密码',
        '`-a` 传密码会让密码出现在 `ps -ef` 输出里，多人共用的机器上等于泄露，生产建议用 `REDISCLI_AUTH` 环境变量或 `~/.rediscli` 配置',
        'Redis 6 以后有 ACL 账号体系，`-a` 只填密码时用的是 `default` 用户，被禁用后要改用 `--user` + `-a`',
        '连不上先查三件事：Redis 是否只监听 `127.0.0.1`、`requirepass` 是否开了、防火墙/安全组是否放通 6379',
        'Redis 单线程处理命令，别在交互式客户端里跑 `KEYS *`、`FLUSHALL` 这类全量命令'
      ],
      related: ['db-redis-db-select', 'db-redis-scan', 'db-redis-info'],
      docs: 'https://redis.io/docs/latest/develop/tools/cli/',
      tags: ['Redis', '连接', '客户端']
    },

    /* ---------- 22 / 56 ---------- */
    {
      id: 'db-redis-db-select',
      name: 'SELECT / -n 选库',
      kind: 'recipe',
      alias: ['SELECT', 'redis 多库', '-n 2', '选库'],
      level: 1,
      syntax: 'redis-cli -h <主机> -p <端口> -n <库号> / SELECT <库号>',
      summary: '在 16 个逻辑库之间切换，避免在错误的库里删错 key。',
      desc: 'Redis 默认有 16 个逻辑库（`databases 16`），编号 0~15，**默认在 0 号库**。逻辑库之间数据完全隔离，同名 key 互不影响，但**共享同一份内存与同一个持久化文件**——也就是说 `DBSIZE` 是分库统计的，而 `INFO memory`、`INFO keyspace` 里的内存是全实例的。集群模式（Cluster）只支持 0 号库，`SELECT` 会直接报错，这也是很多公司只用 0 号库并靠 key 前缀区分业务的原因。客户端每次连接都要重新选库，`redis-cli -n <库号>` 只是省了一次 `SELECT`。',
      params: [
        { flag: '-n <库号>', desc: 'redis-cli 启动参数，连接后自动执行 SELECT' },
        { flag: 'SELECT <库号>', desc: '运行中切库，0~15（受 `databases` 配置限制）' },
        { flag: 'INFO keyspace', desc: '列出**有数据的库**及其 key 数量，确认数据都在哪个库' },
        { flag: 'DBSIZE', desc: '当前库的 key 总数，切换库后结果会变' },
        { flag: 'CONFIG GET databases', desc: '看实例配置了几个逻辑库' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 -n 2 DBSIZE', desc: '直接看 2 号库有多少 key，不用先连再切' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 -n 2 --scan --pattern "order:*" | head -20', desc: '只遍历 2 号库里订单相关的 key' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 INFO keyspace', desc: '看哪些库有数据、各有多少 key，先确认目标库' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 -n 0 CONFIG GET databases', desc: '确认实例配置的逻辑库数量' }
      ],
      notes: [
        '`FLUSHALL` 清的是**所有库**，`FLUSHDB` 只清当前库——执行前务必先 `SELECT` 确认自己在哪个库，或用 `-n` 显式指定',
        'Redis Cluster 模式下只有 0 号库，`SELECT 1` 会报 `ERR SELECT is not allowed in cluster mode`',
        '不同库共用同一份内存：在库 1 写爆内存，库 0 也会被淘汰（受 `maxmemory-policy` 影响）',
        '持久化文件（RDB/AOF）是整实例的，不能只恢复某一个库',
        '多业务混用一个实例时，用 key 前缀 + 库号双重区分，比只靠库号更清晰'
      ],
      related: ['db-redis-cli', 'db-redis-dbsize', 'db-redis-ops'],
      docs: 'https://redis.io/docs/latest/commands/select/',
      tags: ['Redis', '逻辑库', '切换']
    },

    /* ---------- 23 / 56 ---------- */
    {
      id: 'db-redis-scan',
      name: 'SCAN / --scan',
      alias: ['SCAN', '--scan', 'MATCH', 'COUNT', '替代 KEYS'],
      level: 2,
      syntax: 'SCAN <游标> [MATCH <模式>] [COUNT <数量>] [TYPE <类型>] / redis-cli --scan --pattern "<模式>"',
      summary: '安全地分批遍历 key，生产环境替代 KEYS 的唯一正确姿势。',
      desc: '**生产环境禁用 `KEYS *`**：Redis 是单线程的，`KEYS` 会一次性遍历整个键空间并在此期间阻塞所有其他命令，几十万 key 就能让线上接口超时。`SCAN` 用游标分批返回（每次大约 `COUNT` 个，默认 10 个，只是提示不是精确值），不会长时间阻塞，代价是**可能返回重复元素**、且遍历期间新增/删除的 key 不保证被返回。用法：第一次 `SCAN 0 MATCH order:* COUNT 100`，返回结果里第一个数字就是下次要传的游标，直到游标回到 `0` 表示遍历结束。`redis-cli --scan --pattern` 是客户端帮你循环调 `SCAN`，写起来最省事，底层同样是 `SCAN`，所以也安全。',
      params: [
        { flag: '<游标>', desc: '起始游标，第一次写 0，之后用上一次返回的游标' },
        { flag: 'MATCH <模式>', desc: '通配符匹配（`*`、`?`、`[]`），注意是**逐批过滤**，不是先筛后取' },
        { flag: 'COUNT <数量>', desc: '每次扫描的槽位数量提示，默认 10；调大减少往返次数但单次更久' },
        { flag: 'TYPE <类型>', desc: 'Redis 6 起支持按类型过滤，如 `TYPE string`' },
        { flag: '--scan --pattern', desc: 'redis-cli 参数，自动循环 SCAN，等价但更好写' },
        { flag: '--bigkeys / --hotkeys', desc: 'redis-cli 内置的 SCAN 应用，找大 key 与热 key（见大 key 排查那条）' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --scan --pattern "order:*" | head -20', desc: '安全列出订单相关 key，替代 `KEYS order:*`' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --scan --pattern "session:*" | wc -l', desc: '统计某类 key 的数量（也可用 `--scan --pattern "x*" | wc -l` 近似）' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 SCAN 0 MATCH "user:*" COUNT 100', desc: '手工分批扫描，返回的第一列数字是下一次要用的游标' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --scan --pattern "cache:*" | xargs -n 100 redis-cli -h cache-prod-01 -p 6379 DEL', desc: '分批删除某类 key（先小范围试，确认模式没写错再执行）' }
      ],
      notes: [
        '**生产环境禁止 `KEYS *`**：单线程阻塞式全量遍历，key 多时直接导致线上请求超时，只允许在从库或调试环境使用',
        '`SCAN` 不保证不重复、也不保证完整：遍历期间被删除的 key 可能不返回，新增的 key 可能返回也可能不返回',
        '`MATCH` 是在服务端**逐批过滤**的，所以「匹配到的 key 很少」也不代表很快——`COUNT` 太小会导致往返次数极多',
        '最后一批不一定返回游标 0；判断结束的唯一标准是游标变成 `0`',
        '循环删除大量 key 时建议在从库执行或分批加 sleep，避免把主库打满',
        '集群模式下 `SCAN` 只作用于当前节点，要遍历全集群得对每个节点分别执行'
      ],
      related: ['db-redis-bigkeys', 'db-redis-cli', 'db-redis-dbsize', 'db-redis-type'],
      docs: 'https://redis.io/docs/latest/commands/scan/',
      tags: ['遍历', '安全', '禁 KEYS']
    },

    /* ---------- 24 / 56 ---------- */
    {
      id: 'db-redis-info',
      name: 'INFO',
      alias: ['INFO memory', 'INFO clients', 'INFO stats', 'INFO keyspace'],
      level: 2,
      syntax: 'INFO [section]',
      summary: 'Redis 的总体检报告，内存、连接、命中率和持久化状态都在这。',
      desc: '不写 section 会输出全部内容（很长），生产上按需取分段更高效：`INFO memory`（`used_memory_human`、`used_memory_rss`、`mem_fragmentation_ratio` 内存碎片率、`maxmemory`、`maxmemory_policy`）、`INFO clients`（`connected_clients`、`blocked_clients`、`maxclients`）、`INFO stats`（`instantaneous_ops_per_sec`、`keyspace_hits`/`keyspace_misses` 命中率、`rejected_connections` 被拒连接数、`expired_keys`）、`INFO keyspace`（各库 key 数量与过期时间设置）、`INFO replication`（主从角色、`master_link_status`、`slave_repl_offset`）、`INFO persistence`（`rdb_last_bgsave_status`、`aof_last_bgrewrite_status`）、`INFO server`（版本、运行时长）。命中率 = hits/(hits+misses)，低于 80% 就要看是不是缓存设计或 key 过期策略有问题。',
      params: [
        { flag: 'memory', desc: '内存占用、碎片率、淘汰策略与已淘汰 key 数' },
        { flag: 'clients', desc: '当前连接数、被阻塞客户端数、最大连接数' },
        { flag: 'stats', desc: 'QPS、命中率、被拒连接、过期 key 数' },
        { flag: 'keyspace', desc: '各逻辑库的 key 数量与带过期时间的 key 数' },
        { flag: 'replication', desc: '主从角色、连接状态、复制偏移量' },
        { flag: 'persistence', desc: 'RDB/AOF 上次保存是否成功' },
        { flag: 'server', desc: '版本号、运行时长、进程 ID、配置文件路径' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 INFO memory', desc: '看内存占用与碎片率，判断要不要扩容或重启' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 INFO clients', desc: '看连接数是否接近 `maxclients`，连接泄漏的第一个信号' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 INFO stats | egrep "keyspace_hits|keyspace_misses|instantaneous_ops_per_sec|rejected_connections"', desc: '算命中率与 QPS，确认是不是缓存没起作用' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 INFO keyspace', desc: '看每个库有多少 key、多少设置了过期时间' }
      ],
      notes: [
        '`mem_fragmentation_ratio` 大于 1.5 说明内存碎片严重，小于 1 说明用了 swap（性能会断崖式下降）',
        '`evicted_keys` 持续增长说明内存不够、key 被淘汰，业务会感觉「缓存老是没命中」',
        '命中率要结合业务看：全量写多读少的场景命中率天然低，不能只盯一个数字',
        '`INFO` 本身也会遍历部分数据（如 keyspace），超大实例上别高频调用',
        '生产上把这几个指标接进 Prometheus 比人工登录看更靠谱，见 `mo-node-exporter` 与 `mo-promql`'
      ],
      related: ['db-redis-cli', 'db-redis-dbsize', 'db-redis-memory-usage', 'db-redis-client-list'],
      docs: 'https://redis.io/docs/latest/commands/info/',
      tags: ['状态', '内存', '监控']
    },

    /* ---------- 25 / 56 ---------- */
    {
      id: 'db-redis-dbsize',
      name: 'DBSIZE',
      alias: ['DBSIZE', 'key 总数', '统计 key'],
      level: 1,
      syntax: 'DBSIZE',
      summary: '返回当前库的 key 总数，O(1) 复杂度，随时可查。',
      desc: '`DBSIZE` 直接读元数据计数器，**不会遍历键空间**，所以无论多少 key 都是常数时间，可以放心在线上执行——这一点和 `KEYS *` 完全不同。注意它是**按当前库**统计的：默认在 0 号库，要统计别的库得先 `SELECT` 或用 `redis-cli -n <库号>`。它统计的是 key 个数而不是内存占用，想知道内存要看 `INFO memory` 或 `MEMORY USAGE`。另外 `DBSIZE` 包含还没被惰性删除的**已过期但未清理**的 key（Redis 的过期删除是惰性 + 定时采样，过期 key 不一定马上消失）。',
      params: [
        { flag: 'DBSIZE', desc: '返回当前库 key 总数，O(1)' },
        { flag: '-n <库号>', desc: '统计前先切到目标库' },
        { flag: 'INFO keyspace', desc: '一次看所有库的 key 数与过期 key 数' },
        { flag: 'LASTSAVE', desc: '配合使用：看上次成功持久化的时间戳' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 DBSIZE', desc: '看 0 号库有多少 key，日常巡检第一条' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 -n 2 DBSIZE', desc: '统计 2 号库的 key 数量' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 INFO keyspace', desc: '对比各库 key 数，判断数据分布是否合理' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --scan --pattern "session:*" | wc -l', desc: '要按前缀统计时用 SCAN 过滤，`DBSIZE` 给不了分类统计' }
      ],
      notes: [
        '`DBSIZE` 是分库统计的，多库混用时容易看错数量，先确认当前库',
        '结果包含已过期但尚未清理的 key，`DBSIZE` 与「有效 key 数」可能有差异',
        '统计 key 数量不会阻塞，但如果要按前缀分类统计，必须用 `SCAN`（别用 `KEYS`）',
        'key 数量暴涨往往意味着缺少过期时间或写入 key 没规范命名，配合 `INFO keyspace` 的 `expires` 一起看'
      ],
      related: ['db-redis-db-select', 'db-redis-scan', 'db-redis-info'],
      docs: 'https://redis.io/docs/latest/commands/dbsize/',
      tags: ['统计', 'key 数量', '巡检']
    },

    /* ---------- 26 / 56 ---------- */
    {
      id: 'db-redis-type',
      name: 'TYPE / OBJECT ENCODING',
      alias: ['TYPE', 'OBJECT ENCODING', 'key 类型'],
      level: 1,
      syntax: 'TYPE <key> / OBJECT ENCODING <key>',
      summary: '确认一个 key 到底是什么数据结构，取数之前先看类型。',
      desc: '`TYPE` 返回 `string`/`list`/`set`/`zset`/`hash`/`stream`，key 不存在时返回 `none`。它决定了你能用哪些命令：string 用 `GET`、hash 用 `HGETALL`，用错命令会直接报 `WRONGTYPE Operation against a key holding the wrong kind of value`。`OBJECT ENCODING <key>` 返回**底层编码**（`int`、`embstr`、`raw`、`listpack`、`quicklist`、`intset`、`hashtable`、`skiplist`、`ziplist`），这是判断内存占用的关键：同样是 hash，元素少时用 `listpack` 很省内存，超过阈值（`hash-max-listpack-entries`，默认 128）就转成 `hashtable`，内存可能翻好几倍。`OBJECT REFCOUNT` 看引用计数（共享整数对象时为 2147483647），`OBJECT FREQ` 看 LFU 访问频率（需要 `maxmemory-policy` 是 LFU 类策略）。',
      params: [
        { flag: 'TYPE <key>', desc: '返回 key 的数据结构类型，不存在返回 `none`' },
        { flag: 'OBJECT ENCODING <key>', desc: '返回底层编码，判断内存效率' },
        { flag: 'OBJECT REFCOUNT <key>', desc: '对象引用计数，共享整数对象显示为 2147483647' },
        { flag: 'OBJECT FREQ <key>', desc: 'LFU 访问频率，仅当淘汰策略为 LFU 时有意义' },
        { flag: 'OBJECT IDLETIME <key>', desc: 'LRU 空闲秒数（LFU 策略下不可用）' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 TYPE order:8812', desc: '取数据前先确认类型，避免 WRONGTYPE 报错' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 OBJECT ENCODING user:profile:8812', desc: '看 hash 是 listpack 还是 hashtable，判断内存是否被撑大' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --scan --pattern "order:*" | head -50 | xargs -I{} redis-cli -h cache-prod-01 -p 6379 TYPE {}', desc: '批量看一批 key 的类型分布，排查「本该是 string 却写成 hash」的脏数据' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 OBJECT FREQ order:8812', desc: 'LFU 策略下看热点 key 的访问频率' }
      ],
      notes: [
        '`TYPE` 只回类型不回内容，大 key 排查时先用它筛出 hash/zset 等复杂类型再看 `MEMORY USAGE`',
        '编码转换是**单向**的：元素数超过阈值转成 hashtable 后，即使再删元素也不会自动转回 listpack，内存不会自动释放',
        '`OBJECT` 系列命令在 Redis Cluster 的从节点上可能不可用，需要在主节点查',
        '生产上不要用 `TYPE` 配合 `KEYS` 批量跑，遍历一律用 `SCAN`'
      ],
      related: ['db-redis-scan', 'db-redis-memory-usage', 'db-redis-ttl'],
      docs: 'https://redis.io/docs/latest/commands/type/',
      tags: ['类型', '编码', '排查']
    },

    /* ---------- 27 / 56 ---------- */
    {
      id: 'db-redis-ttl',
      name: 'TTL / EXPIRE',
      alias: ['TTL', 'PTTL', 'EXPIRE', 'PERSIST', '过期时间'],
      level: 1,
      syntax: 'TTL <key> / PTTL <key> / EXPIRE <key> <秒> / PERSIST <key>',
      summary: '查 key 还剩多久过期、给 key 补过期时间，内存泄漏排查必用。',
      desc: '`TTL` 返回剩余秒数，三个特殊值要记住：`-1` 表示 key **存在但没有设置过期时间**（永不过期，是内存泄漏的头号嫌疑）、`-2` 表示 key **不存在**（可能已过期或被删）、正数是剩余秒数。`PTTL` 返回毫秒精度。`EXPIRE <key> <秒>` 设置过期时间，`PERSIST <key>` 去掉过期时间（变成永久）。`SET <key> <值> EX <秒>` 建 key 时就带过期时间，比先 `SET` 再 `EXPIRE` 少一次往返。注意 Redis 的过期是「惰性删除 + 定期采样删除」：到点后 key 逻辑上已过期、读不到，但内存不一定立刻释放，所以 `DBSIZE` 与 `INFO memory` 可能滞后。',
      params: [
        { flag: 'TTL <key>', desc: '剩余过期秒数；-1 无过期时间，-2 不存在' },
        { flag: 'PTTL <key>', desc: '毫秒精度的剩余时间' },
        { flag: 'EXPIRE <key> <秒>', desc: '设置过期时间，返回 1 成功、0 表示 key 不存在' },
        { flag: 'PERSIST <key>', desc: '移除过期时间，key 变成永久有效' },
        { flag: 'SET ... EX <秒>', desc: '写入时直接带过期时间，推荐写法' },
        { flag: 'INFO keyspace', desc: '看每个库有多少 key 设置了过期时间' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 TTL session:8812', desc: '看会话 key 还剩多久过期，正常应该是正数' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --scan --pattern "cache:*" | head -100 | xargs -I{} redis-cli -h cache-prod-01 -p 6379 TTL {}', desc: '批量抽查一类 key 的过期时间，找出全是 -1 的漏网之鱼' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 EXPIRE order:8812 3600', desc: '给已存在的 key 补一个 1 小时过期时间' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 SET order:8812 \'{"status":"PAID"}\' EX 3600', desc: '写缓存时直接带过期时间，避免写出永久 key' }
      ],
      notes: [
        '大量 key 的 `TTL` 是 `-1` 说明业务写入时漏了过期时间，内存会只涨不降，必须业务侧修',
        '`TTL` 返回 `-1` 和 `-2` 含义不同，写监控脚本时别都当成「已过期」',
        '`EXPIRE` 作用在已存在的 key 上；key 不存在返回 0 而不是报错，脚本里要判断返回值',
        '过期 key 的内存释放是异步的，`INFO memory` 里 `used_memory` 短期不降属正常',
        '主从/集群环境不要用 `EXPIRE` 做分布式锁的续期，锁续期应该用 `PEXPIRE` 并配唯一 value 校验'
      ],
      related: ['db-redis-type', 'db-redis-info', 'db-redis-memory-usage'],
      docs: 'https://redis.io/docs/latest/commands/ttl/',
      tags: ['过期', '内存', '巡检']
    },

    /* ---------- 28 / 56 ---------- */
    {
      id: 'db-redis-memory-usage',
      name: 'MEMORY USAGE',
      alias: ['MEMORY USAGE', 'MEMORY DOCTOR', 'MEMORY STATS', '内存占用'],
      level: 2,
      syntax: 'MEMORY USAGE <key> [SAMPLES <数量>] / MEMORY DOCTOR / MEMORY STATS',
      summary: '精确算单个 key 占多少内存，找大 key 与内存核算的核心命令。',
      desc: '`MEMORY USAGE <key>` 返回该 key 及其值占用的字节数（含 key 本身与内部结构开销）；对 list/hash/zset/set 这类集合，它会**抽样估算**，`SAMPLES <N>` 指定抽样元素个数（默认 5，`SAMPLES 0` 表示全量精确计算，元素多时很慢）。`MEMORY DOCTOR` 给出人类可读的内存诊断建议（比如「碎片率高，建议重启」）。`MEMORY STATS` 输出详细的内存构成（`peak.allocated`、`dataset.bytes`、`overhead.total`、各类型开销）。配合全局配置看：`maxmemory`（内存上限）、`maxmemory-policy`（淘汰策略，如 `allkeys-lru`、`volatile-ttl`）、`maxmemory-samples`。注意 Redis 4.0 起可以配置 `activedefrag yes` 做在线碎片整理。',
      params: [
        { flag: 'MEMORY USAGE <key>', desc: '返回单个 key 占用的字节数' },
        { flag: 'SAMPLES <N>', desc: '抽样元素个数，默认 5；`0` 表示全量精确但很慢' },
        { flag: 'MEMORY DOCTOR', desc: '内存诊断建议，人类可读' },
        { flag: 'MEMORY STATS', desc: '内存构成明细：数据集、开销、峰值' },
        { flag: 'maxmemory-policy', desc: '淘汰策略，默认 `noeviction`（写满直接报错）' },
        { flag: 'CONFIG SET activedefrag yes', desc: '开启在线碎片整理（4.0+）' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 MEMORY USAGE order:8812', desc: '看单个 key 到底占了多少字节，大 key 排查的入口' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 MEMORY USAGE user:profile:8812 SAMPLES 0', desc: '对 hash 全量精确计算内存（元素多时耗时会明显变长）' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 MEMORY DOCTOR', desc: '让 Redis 自己给一句内存健康诊断' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CONFIG GET maxmemory; redis-cli -h cache-prod-01 -p 6379 CONFIG GET maxmemory-policy', desc: '确认内存上限与淘汰策略，判断会不会写满就报错' }
      ],
      notes: [
        '`MEMORY USAGE` 对集合类型是抽样估算，`SAMPLES 0` 才精确，但大 key 上全量计算会阻塞（单线程）',
        'key 很多时不要用循环逐个 `MEMORY USAGE` 普查，用 `redis-cli --bigkeys` 更高效',
        '`maxmemory-policy=noeviction` 时内存写满会直接报 `OOM command not allowed`，缓存场景应改成 `allkeys-lru` 之类',
        '`used_memory_rss` 明显大于 `used_memory` 是碎片，`activedefrag` 只对部分数据结构有效，往往还是重启最快',
        '生产上限制 `maxmemory` 为物理内存的 70% 左右，给 RDB fork 的写时复制留余量'
      ],
      related: ['db-redis-bigkeys', 'db-redis-info', 'db-redis-type', 'db-redis-ops'],
      docs: 'https://redis.io/docs/latest/commands/memory-usage/',
      tags: ['内存', '大 key', '容量']
    },

    /* ---------- 29 / 56 ---------- */
    {
      id: 'db-redis-client-list',
      name: 'CLIENT LIST',
      alias: ['CLIENT LIST', 'CLIENT KILL', 'connected_clients', '连接排查'],
      level: 2,
      syntax: 'CLIENT LIST [TYPE normal|master|replica|pubsub] / CLIENT KILL <过滤条件>',
      summary: '列出所有客户端连接，查连接泄漏、来源 IP 和阻塞会话。',
      desc: '输出每行一个连接：`id`、`addr`（来源 IP:端口）、`name`（客户端自报的名字，`CLIENT SETNAME` 设置）、`age`（连接存活秒数）、`idle`（空闲秒数）、`db`（所在库）、`cmd`（最近执行的命令）、`multi`、`omem`（输出缓冲占用）。三个用法：① 连接数远超预期 → 数一下 `addr` 里的来源 IP，定位是哪台应用泄漏；② `idle` 很大的一堆连接 → 应用没复用连接池；③ `omem` 很大 → 某客户端消费太慢，输出缓冲区把内存吃掉了（可能触发 `client-output-buffer-limit` 断连）。`CLIENT KILL` 可以按 `ID`、`ADDR`、`LADDR`、`TYPE`、`USER`、`SKIPME` 关闭连接，Redis 6 起 `CLIENT KILL` 支持更多过滤形式。`INFO clients` 里的 `connected_clients` 是总量，`blocked_clients` 是阻塞在 `BLPOP`/`WAIT` 上的数量。',
      params: [
        { flag: 'CLIENT LIST', desc: '列出全部连接及其地址、空闲时间、所在库' },
        { flag: 'TYPE normal', desc: '只看普通客户端（还有 master/replica/pubsub）' },
        { flag: 'CLIENT KILL ID <id>', desc: '按连接 id 关闭，最精确的方式' },
        { flag: 'CLIENT KILL ADDR <ip:port>', desc: '按来源地址关闭连接' },
        { flag: 'CLIENT NO-EVICT ON|OFF', desc: 'Redis 7 起可让连接免于被内存淘汰机制断开' },
        { flag: 'maxclients', desc: '最大连接数配置，默认 10000，达到后新连接被拒' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CLIENT LIST | head -20', desc: '看前 20 个连接的来源与空闲时间' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CLIENT LIST | awk \'{print $2}\' | cut -d= -f2 | cut -d: -f1 | sort | uniq -c | sort -rn | head', desc: '按来源 IP 聚合连接数，一眼看出是哪台机器连接泄漏' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CLIENT LIST | awk \'{print $6, $0}\' | sort -rn | head -5', desc: '按空闲时间排序，找出长期闲置的连接' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CLIENT KILL ID 41237', desc: '关闭指定连接（确认是这个客户端再执行）' }
      ],
      notes: [
        '`CLIENT KILL` 会**直接断开**应用连接，业务侧立刻报错，执行前先核对 `id`/`addr`，优先杀测试或异常来源的连接',
        '生产上更该做的是修连接池配置（最大连接数、空闲回收、心跳），而不是反复手工杀连接',
        '`connected_clients` 接近 `maxclients` 时新连接会被拒，报 `ERR max number of clients reached`',
        '`omem` 持续很大说明消费者慢，pub/sub 或 `MONITOR` 场景尤其明显，会触发输出缓冲区限制被强制断开',
        '连接数暴涨有时是客户端在疯狂重连（比如前面刚被 `CLIENT KILL`），要连着看 `INFO stats` 的 `rejected_connections`'
      ],
      related: ['db-redis-info', 'db-redis-monitor', 'db-redis-cli'],
      docs: 'https://redis.io/docs/latest/commands/client-list/',
      tags: ['连接', '排查', '连接池']
    },

    /* ---------- 30 / 56 ---------- */
    {
      id: 'db-redis-slowlog',
      name: 'SLOWLOG GET',
      alias: ['SLOWLOG GET', 'SLOWLOG RESET', 'slowlog-log-slower-than', '慢命令'],
      level: 2,
      syntax: 'SLOWLOG GET [数量] / SLOWLOG LEN / SLOWLOG RESET',
      summary: '查看被记录下来的慢命令，定位拖慢 Redis 的元凶。',
      desc: '阈值由 `slowlog-log-slower-than`（单位**微秒**，默认 10000 即 10 毫秒，设为 0 记录所有命令、负数关闭）和 `slowlog-max-len`（保留条数，默认 128，超出后最旧的被丢弃）控制。`SLOWLOG GET` 返回每条记录：自增 id、发生时间戳、**执行耗时（微秒）**、命令及参数数组、客户端地址与名称。要重点警惕 O(N) 命令：`KEYS *`、`HGETALL` 大 hash、`SMEMBERS` 大集合、`LRANGE key 0 -1`、`DEL` 大 key、`FLUSHALL`、`SORT`、`ZRANGE` 全量——它们在单线程模型下会阻塞所有其他请求。`SLOWLOG RESET` 只清空慢日志列表，不影响数据。',
      params: [
        { flag: 'SLOWLOG GET [N]', desc: '取最近 N 条慢命令，默认 10 条' },
        { flag: 'SLOWLOG LEN', desc: '当前慢日志条数' },
        { flag: 'SLOWLOG RESET', desc: '清空慢日志列表（不动数据）' },
        { flag: 'slowlog-log-slower-than', desc: '阈值，单位**微秒**；10000 = 10 毫秒，0 = 记录全部' },
        { flag: 'slowlog-max-len', desc: '最多保留多少条，默认 128' },
        { flag: 'CONFIG REWRITE', desc: '把 `CONFIG SET` 的改动写回配置文件（需配置文件可写）' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 SLOWLOG GET 10', desc: '看最近 10 条慢命令，排查卡顿第一步' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CONFIG SET slowlog-log-slower-than 5000', desc: '把阈值调到 5 毫秒，先临时放大观察面（重启会失效）' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 SLOWLOG LEN', desc: '看慢日志攒了多少条，判断是否是持续性问题' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 SLOWLOG RESET', desc: '清空后观察一段时间，只看新产生的慢命令' }
      ],
      notes: [
        '阈值单位是**微秒**不是毫秒，写 1000 表示 1 毫秒，比想象中严格得多',
        '`CONFIG SET` 只改运行时，重启就失效；要持久化得改配置文件或执行 `CONFIG REWRITE`',
        '慢日志只记录**执行阶段**的耗时，网络往返、排队等待不算在内，客户端测到的慢不一定能在慢日志里看到',
        '`SLOWLOG GET` 输出的命令里可能包含敏感参数（如密码），截屏分享前先脱敏',
        '看到 `KEYS`、`FLUSHALL`、大集合的 `HGETALL` 出现在慢日志里，基本可以直接定位成「代码写错了」'
      ],
      related: ['db-redis-monitor', 'db-redis-scan', 'db-redis-bigkeys'],
      docs: 'https://redis.io/docs/latest/commands/slowlog-get/',
      tags: ['慢命令', '诊断', '性能']
    },

    /* ---------- 31 / 56 ---------- */
    {
      id: 'db-redis-monitor',
      name: 'MONITOR',
      alias: ['MONITOR', '实时命令流', 'debug 命令'],
      level: 3,
      syntax: 'redis-cli -h <主机> -p <端口> MONITOR',
      summary: '实时打印服务端收到的每一条命令，短时抓现场用，生产慎开。',
      desc: '`MONITOR` 把 Redis 收到的所有命令**实时**回显给当前连接，包含时间戳、来源库、客户端地址与命令原文，是「到底谁在写这个 key」这类问题的终极手段。代价很大：它会让 Redis 为**每一条**命令额外做一次格式化和网络推送，官方文档明确说明会降低约 50% 的吞吐（极端情况更多），并且输出本身会占用大量内存与带宽。正确用法是「短时、精确、有目标」：先想清楚要抓什么，开 10~30 秒，抓到就 Ctrl+C 退出，绝不要挂着跑一整天。要看慢命令用 `SLOWLOG GET`，要看命令统计用 `INFO commandstats`。',
      params: [
        { flag: 'MONITOR', desc: '进入实时回显模式，Ctrl+C 退出' },
        { flag: 'redis-cli --timeout', desc: '配合超时参数避免忘记退出' },
        { flag: 'INFO commandstats', desc: '不阻塞的命令级统计，替代 MONITOR 看命令分布' },
        { flag: 'SLOWLOG GET', desc: '看慢命令，替代 MONITOR 定位性能问题' },
        { flag: 'CLIENT LIST', desc: '先定位可疑客户端，再用 MONITOR 精确验证' }
      ],
      examples: [
        { cmd: 'timeout 10 redis-cli -h cache-prod-01 -p 6379 MONITOR', desc: '最多抓 10 秒自动退出，避免忘记关掉把实例拖垮' },
        { cmd: 'timeout 10 redis-cli -h cache-prod-01 -p 6379 MONITOR | grep -i "order:8812"', desc: '只盯某个热点 key，看是谁在读它、读得有多频繁' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 INFO commandstats | sort -t= -k2 -rn | head -10', desc: '先看命令调用分布，比直接 MONITOR 更安全' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CLIENT LIST | grep -i "cmd=keys"', desc: '找正在执行 KEYS 的客户端，定位后再单独处理' }
      ],
      notes: [
        '**生产环境慎用**：官方文档明确说明 MONITOR 会显著降低吞吐（约 50% 甚至更多），并占用额外内存与带宽，高峰期使用可能直接压垮实例',
        '必须限时使用：用 `timeout 10 redis-cli ... MONITOR` 或抓够就 Ctrl+C，绝不要长期挂着',
        'MONITOR 输出会包含所有命令的**完整参数**，密码、令牌等敏感数据会明文出现，注意输出文件的保管与脱敏',
        'Redis Cluster 下 `MONITOR` 只能在**当前节点**上抓，全集群排查要逐节点执行',
        '优先考虑替代方案：命令统计 `INFO commandstats`、慢日志 `SLOWLOG GET`、连接列表 `CLIENT LIST`，这三个都不阻塞'
      ],
      related: ['db-redis-slowlog', 'db-redis-client-list', 'db-redis-bigkeys'],
      docs: 'https://redis.io/docs/latest/commands/monitor/',
      tags: ['实时', '危险', '抓包']
    },

    /* ---------- 32 / 56 ---------- */
    {
      id: 'db-redis-bigkeys',
      name: '大 key 与热 key 排查',
      kind: 'recipe',
      alias: ['--bigkeys', '--hotkeys', 'big key', 'hot key', '内存不均'],
      level: 3,
      syntax: 'redis-cli --bigkeys / redis-cli --hotkeys / MEMORY USAGE <key>',
      summary: '按固定顺序找出大 key 与热 key，解决内存倾斜与单点卡顿。',
      desc: '**排查顺序（先看什么 → 再看什么）**：① `redis-cli --bigkeys` 全实例扫描，按类型列出每种结构中最大的 key（底层用 `SCAN`，不阻塞，但实例很大时耗时较长，建议在从库跑）；② 对上一步的候选 key 用 `MEMORY USAGE <key> SAMPLES 0` 精确算内存，确认到底占了多少；③ 用 `OBJECT ENCODING` 看编码，判断是不是元素数超过阈值从 listpack 变成了 hashtable；④ 热 key 用 `redis-cli --hotkeys`（**必须先设置 `maxmemory-policy` 为 LFU 类策略**，如 `allkeys-lfu`，否则直接报错）；⑤ 集群场景用 `redis-cli --cluster call <节点> DBSIZE` 或逐节点 `--bigkeys` 对比，找出数据倾斜的节点；⑥ 定位到业务后用 `timeout 10 redis-cli MONITOR | grep <key>` 短时确认访问来源。常见大 key 形态：把几万条记录的 hash 当单 key 存、`SADD` 无上限的集合、把大 JSON 直接 `SET`。处理方式：拆分（按业务维度打散成多个 key）、压缩（值做序列化压缩）、设过期时间。',
      params: [
        { flag: '--bigkeys', desc: '扫描全实例并列出各类型最大的 key（基于 SCAN，不阻塞）' },
        { flag: '--hotkeys', desc: '找出访问频率最高的 key，需 LFU 淘汰策略' },
        { flag: '--memkeys', desc: '按内存占用扫描（较新版本支持），比 --bigkeys 更贴近内存视角' },
        { flag: '-i 0.1', desc: '每次 SCAN 之间 sleep，降低对线上影响' },
        { flag: 'MEMORY USAGE <key> SAMPLES 0', desc: '对候选 key 做精确内存核算' },
        { flag: 'maxmemory-policy allkeys-lfu', desc: '使用 --hotkeys 的前置条件' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --bigkeys', desc: '第一步：全实例扫描，列出每种类型最大的 key' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --bigkeys -i 0.1', desc: '线上扫描时每轮 sleep 0.1 秒，进一步降低影响' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 MEMORY USAGE user:profile:8812 SAMPLES 0', desc: '第二步：对候选 key 精确算内存，确认是不是真的过大' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 --hotkeys', desc: '第四步：找访问最频繁的热 key（要求淘汰策略是 LFU）' }
      ],
      notes: [
        '`--bigkeys` 底层是 `SCAN`，不会长时间阻塞，但**在大实例上仍会跑很久并占用 CPU**，优先在从库执行并加 `-i` 降速',
        '`--hotkeys` 必须先把 `maxmemory-policy` 设成 LFU（如 `allkeys-lfu`）且运行一段时间积累计数，否则会报错或数据不准',
        '大 key 的危害不只是内存：`DEL`/`EXPIRE` 一个大 hash 同样会阻塞主线程，删除大 key 建议用 `UNLINK`（异步删除）',
        '热 key 的危害是单分片压力集中：集群里某个节点 QPS 打满而其他节点空闲，需要加本地缓存或做 key 打散',
        '扫描类命令都不要在业务高峰对主库执行，问清楚窗口再动手'
      ],
      related: ['db-redis-scan', 'db-redis-memory-usage', 'db-redis-monitor', 'db-redis-type'],
      docs: 'https://redis.io/docs/latest/develop/tools/cli/',
      tags: ['大 key', '热 key', '排查顺序']
    },

    /* ---------- 33 / 56 ---------- */
    {
      id: 'db-redis-ops',
      name: 'Redis 运维命令速查',
      kind: 'recipe',
      alias: ['BGSAVE', 'BGREWRITEAOF', 'CONFIG GET', 'CLUSTER INFO', 'redis-benchmark', 'FLUSHALL'],
      level: 3,
      syntax: '（速查）BGSAVE / BGREWRITEAOF / CONFIG GET|SET / CLUSTER INFO|NODES / redis-benchmark',
      summary: '持久化、参数调整、集群状态与压测，Redis 日常运维一套带走。',
      desc: '**持久化**：`BGSAVE` 后台生成 RDB 快照（fork 子进程，主进程继续服务），`BGREWRITEAOF` 后台重写 AOF 文件（体积膨胀时用），`LASTSAVE` 看上次成功保存的时间戳，`INFO persistence` 看 `rdb_last_bgsave_status`/`aof_last_bgrewrite_status` 是否 `ok`。**参数**：`CONFIG GET <参数>` 支持通配（`CONFIG GET maxmemory*`），`CONFIG SET` 改运行时参数立即生效但不落盘，`CONFIG REWRITE` 才写回配置文件（要求配置文件可写、且是启动时指定的那个）。**集群**：`CLUSTER INFO` 看集群状态（`cluster_state:ok`、`cluster_known_nodes`、`cluster_slots_assigned` 必须 16384），`CLUSTER NODES` 列出节点、角色、槽位分配与连接状态。**压测**：`redis-benchmark` 内置压测工具，`-c` 并发连接、`-n` 总请求数、`-q` 精简输出、`-t set,get` 指定命令、`--csv` 输出 CSV。',
      params: [
        { flag: 'BGSAVE', desc: '后台生成 RDB 快照，立即返回，fork 期间有内存开销' },
        { flag: 'BGREWRITEAOF', desc: '后台重写 AOF，AOF 文件过大时使用' },
        { flag: 'CONFIG GET / SET / REWRITE', desc: '查参数 / 改运行时 / 写回配置文件' },
        { flag: 'CLUSTER INFO', desc: '集群状态与槽位分配情况' },
        { flag: 'CLUSTER NODES', desc: '节点清单、角色、槽位与连接状态' },
        { flag: '-c / -n / -t', desc: 'redis-benchmark：并发数 / 总请求数 / 测试的命令' },
        { flag: '--csv / -q', desc: 'redis-benchmark：CSV 输出 / 精简输出' },
        { flag: 'FLUSHALL / FLUSHDB', desc: '清空所有库 / 清空当前库的数据（极度危险）' }
      ],
      examples: [
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 BGSAVE', desc: '手工触发一次 RDB 快照，返回 Background saving started' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CONFIG GET maxmemory; redis-cli -h cache-prod-01 -p 6379 CONFIG SET maxmemory-policy allkeys-lru', desc: '查内存上限并临时调整淘汰策略' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CLUSTER INFO; redis-cli -h cache-prod-01 -p 6379 CLUSTER NODES', desc: '集群模式先看状态是否 ok，再看节点与槽位分配' },
        { cmd: 'redis-benchmark -h cache-prod-01 -p 6379 -c 50 -n 100000 -t set,get -q', desc: '50 并发 10 万请求压测读写性能' },
        { cmd: 'redis-cli -h cache-prod-01 -p 6379 CONFIG REWRITE', desc: '把运行时改过的参数写回配置文件，避免重启失效' }
      ],
      notes: [
        '**`FLUSHALL` 会清空实例上所有库的全部数据，且无法撤销**；`FLUSHDB` 只清当前库。执行前必须 `SELECT` 确认当前库、确认连的是哪个实例，生产环境建议在配置里 `rename-command FLUSHALL ""` 直接禁掉',
        '`BGSAVE` 会 fork 子进程，写时复制（COW）期间内存可能翻倍，`maxmemory` 设得太满会触发 OOM 或 swap',
        '`CONFIG SET` 不落盘，重启即失效；`CONFIG REWRITE` 需要启动时用的配置文件可写，容器里常因挂载只读而失败',
        '`CLUSTER INFO` 里 `cluster_state:fail` 通常意味着有槽位未分配或节点失联，此时集群拒绝写入',
        '`redis-benchmark` 会打满实例并可能干扰真实业务，只在测试环境或低峰期对生产做小规模验证',
        'Redis 6 起支持 ACL，可以用 `ACL SETUSER` 给业务账号禁用 `FLUSHALL`/`CONFIG`/`KEYS` 等高危命令'
      ],
      related: ['db-redis-info', 'db-redis-memory-usage', 'db-redis-cli', 'db-redis-db-select'],
      docs: 'https://redis.io/docs/latest/commands/bgsave/',
      tags: ['运维', '持久化', '集群']
    },

    /* ================= C. PostgreSQL（5 条） ================= */

    /* ---------- 34 / 56 ---------- */
    {
      id: 'db-pg-psql',
      name: 'psql',
      alias: ['psql -c', 'psql 连接', 'PGPASSWORD'],
      level: 1,
      syntax: 'psql -h <主机> -p <端口> -U <用户> -d <库名> [-c "SQL"]',
      summary: 'PostgreSQL 的命令行客户端，交互式操作和脚本执行都用它。',
      desc: '默认端口 5432，超级用户通常叫 `postgres`（不是 `root`），`-U` 指定的是**数据库角色**而不是操作系统用户。密码走 `PGPASSWORD` 环境变量或 `~/.pgpass` 文件（格式 `主机:端口:库:用户:密码`，权限必须 `600`），`psql` 本身没有 `-p<密码>` 这种写法（小写 `-p` 是端口）。`-c "SQL"` 执行一条语句后退出，适合脚本；`-f file.sql` 执行 SQL 文件；`-l` 列出所有库；`-x` 竖排显示宽表；脚本里建议加 `-v ON_ERROR_STOP=1`，遇错立即退出而不是继续跑。',
      params: [
        { flag: '-h <主机>', desc: '服务端地址，不写走 Unix socket' },
        { flag: '-p <端口>', desc: '端口，默认 5432（注意小写 p 是端口，PG 没有 -p 传密码的写法）' },
        { flag: '-U <用户>', desc: '数据库角色名，默认取当前系统用户' },
        { flag: '-d <库名>', desc: '要连接的数据库，默认与用户名同名' },
        { flag: '-c "SQL"', desc: '执行一条 SQL 后退出，脚本里最常用' },
        { flag: '-f <文件>', desc: '执行 SQL 文件' },
        { flag: '-v ON_ERROR_STOP=1', desc: '遇错立即停止，避免脚本带病继续跑' },
        { flag: '--csv / -x', desc: 'CSV 格式输出 / 竖排显示宽表' }
      ],
      examples: [
        { cmd: 'psql -h db-prod-01 -p 5432 -U app -d orders -c "SELECT version();"', desc: '连上并确认版本，第一条命令' },
        { cmd: 'PGPASSWORD=\'Pg@2024\' psql -h db-prod-01 -U app -d orders -c "SELECT count(*) FROM orders;"', desc: '用环境变量传密码，避免交互输入，适合脚本' },
        { cmd: 'psql -h db-prod-01 -U app -d orders -f /data/backup/orders-2024-03-18.sql', desc: '执行 SQL 文件恢复数据，配合 `-v ON_ERROR_STOP=1` 更稳' },
        { cmd: 'psql -h db-prod-01 -U postgres -l', desc: '列出实例上所有数据库（等价于元命令 `\\l`）' }
      ],
      notes: [
        '`psql` 的 `-p` 是端口不是密码，密码用 `PGPASSWORD` 环境变量或 `~/.pgpass`（权限 600，否则会被忽略）',
        '`-W` 强制提示输密码，`-w` 从不提示；脚本里用 `PGPASSWORD` + `-w` 避免卡在交互提示上',
        '默认超级用户是 `postgres` 而不是 `root`，用 `-U postgres` 连接',
        '连接报 `no pg_hba.conf entry for host` 是服务端认证规则没放通该网段，需要改 `pg_hba.conf` 并 reload',
        '`-U` 的账号名区分大小写，建角色时用了双引号大写，连接时也要加引号'
      ],
      related: ['db-pg-meta', 'db-pg-dump', 'db-pg-stat-activity'],
      docs: 'https://www.postgresql.org/docs/current/app-psql.html',
      tags: ['PostgreSQL', '连接', '客户端']
    },

    /* ---------- 35 / 56 ---------- */
    {
      id: 'db-pg-meta',
      name: 'psql 元命令（\\d / \\l / \\dt）',
      kind: 'recipe',
      alias: ['\\d', '\\l', '\\dt', '\\du', '元命令'],
      level: 1,
      syntax: '\\l / \\dt [模式] / \\d [表名] / \\du / \\dn / \\x',
      summary: '不用写 SQL 就能看库、表、角色和结构，PG 排障的日常入口。',
      desc: '元命令以反斜杠开头，只在 `psql` 交互环境里有效（`-c "\\dt"` 也可以，但要在 `psql` 里执行）。常用的几个：`\\l` 列出所有数据库（含编码与权限）、`\\dt` 列出当前库的表、`\\dt+` 带大小与描述、`\\d <表>` 看表结构（列、类型、默认值、索引、外键、触发器）、`\\d+ <表>` 还会显示存储参数与大小、`\\di` 看索引、`\\du` 看角色与权限、`\\dn` 看 schema、`\\df` 看函数、`\\x` 切换竖排显示（宽表必备）、`\\timing` 打开每条语句耗时、`\\c <库>` 切库、`\\?` 查看全部元命令、`\\q` 退出。`\\dt` 支持通配符，如 `\\dt order*`。',
      params: [
        { flag: '\\l', desc: '列出所有数据库、属主、编码、排序规则' },
        { flag: '\\dt [模式]', desc: '列出表，`+` 后缀显示大小与描述' },
        { flag: '\\d <表>', desc: '看表结构：列、类型、索引、外键、触发器' },
        { flag: '\\di / \\dn / \\df', desc: '分别看索引、schema、函数' },
        { flag: '\\du', desc: '看角色（用户）及其成员关系与权限' },
        { flag: '\\x', desc: '切换竖排输出，宽表查看必备' },
        { flag: '\\timing', desc: '打开/关闭每条 SQL 的执行耗时显示' },
        { flag: '\\?', desc: '列出所有元命令的简明帮助' }
      ],
      examples: [
        { cmd: '\\l', desc: '看看这台实例上有哪些库、分别是什么编码' },
        { cmd: '\\dt order*', desc: '列出名字以 order 开头的表，支持通配符' },
        { cmd: '\\d+ orders', desc: '看 orders 表的结构、索引、大小与存储参数' },
        { cmd: '\\x\nSELECT * FROM orders WHERE order_id = 8812;', desc: '先开竖排再查一行宽记录，输出可读性好很多' },
        { cmd: '\\du', desc: '确认应用账号是否存在、有没有读表权限' }
      ],
      notes: [
        '元命令只在 `psql` 里有效，写进 `-c` 时要确认是 `psql -c "\\dt"` 这种形式，纯 SQL 客户端（如 JDBC）里不能执行',
        '`\\d` 不带参数会列出所有关系（表、视图、序列），表多时输出很长，尽量带表名',
        '`\\dt` 默认只看当前 schema 的 `search_path`，找不到表时用 `\\dt *.*` 或先 `SET search_path`',
        '`\\x` 是会话级开关，退出后失效；在 `-c` 里用 `-x` 命令行参数代替'
      ],
      related: ['db-pg-psql', 'db-pg-stat-activity', 'db-pg-explain'],
      docs: 'https://www.postgresql.org/docs/current/app-psql.html',
      tags: ['元命令', '表结构', '日常']
    },

    /* ---------- 36 / 56 ---------- */
    {
      id: 'db-pg-dump',
      name: 'pg_dump / pg_restore',
      alias: ['pg_dump', 'pg_restore', 'pg_dumpall', '逻辑备份'],
      level: 2,
      syntax: 'pg_dump -h <主机> -U <用户> -d <库> -F c -f <文件> / pg_restore -d <库> -j <并发> <文件>',
      summary: 'PostgreSQL 的逻辑备份与恢复，自定义格式支持并行与按表恢复。',
      desc: '`-F` 决定输出格式：`p` 纯文本 SQL（可直接 `psql -f` 执行，但恢复慢）、`c` 自定义格式（**推荐**，压缩、支持 `pg_restore` 选择性恢复与并行）、`d` 目录格式（配合 `-j` 并行导出）、`t` tar 格式。纯文本格式只能用 `psql` 恢复，自定义/目录格式必须用 `pg_restore`。`pg_restore` 的 `-j <N>` 并行恢复（只对目录格式有效）、`-t <表>` 只恢复某张表、`-n <schema>` 只恢复某个 schema、`--clean --if-exists` 先删后建（覆盖恢复）、`--no-owner` 忽略属主（跨环境恢复必备）。注意 `pg_dump` **不导出角色与表空间**这类全局对象，要带走账号用 `pg_dumpall -g`（只导全局对象）或 `pg_dumpall` 全量。',
      params: [
        { flag: '-F c / -F d / -F p', desc: '自定义格式（推荐）/ 目录格式（可并行）/ 纯文本 SQL' },
        { flag: '-f <文件>', desc: '输出文件或目录' },
        { flag: '-t <表> / -n <schema>', desc: '只导出指定表 / 指定 schema' },
        { flag: '--no-owner', desc: '不写属主信息，跨环境恢复必备' },
        { flag: '-j <N>', desc: '并行导出/导入线程数（目录格式或 pg_restore 时可用）' },
        { flag: '--clean --if-exists', desc: 'pg_restore 恢复前先 DROP 已有对象' },
        { flag: 'pg_dumpall -g', desc: '只导出全局对象（角色、表空间），备份账号权限用' }
      ],
      examples: [
        { cmd: 'pg_dump -h db-prod-01 -U app -d orders -F c -f /data/backup/orders-2024-03-18.dump', desc: '自定义格式备份，压缩且支持选择性恢复（推荐）' },
        { cmd: 'pg_dump -h db-prod-01 -U app -d orders -F d -j 4 -f /data/backup/orders-dir-2024-03-18', desc: '目录格式 4 线程并行导出，大库首选' },
        { cmd: 'pg_restore -h db-prod-01 -U app -d orders --clean --if-exists --no-owner -j 4 /data/backup/orders-2024-03-18.dump', desc: '覆盖恢复：先删对象再重建，忽略属主' },
        { cmd: 'pg_dumpall -h db-prod-01 -U postgres -g > /data/backup/pg-globals-2024-03-18.sql', desc: '单独备份角色与表空间等全局对象，与库备份配套保存' }
      ],
      notes: [
        '**`--clean` 会 DROP 目标库里的同名对象**，恢复前确认库和实例没连错，生产恢复务必先在测试库演练',
        '`pg_dump` 不备份角色、表空间，只恢复库文件会丢账号与权限，必须配合 `pg_dumpall -g`',
        '纯文本格式（`-F p`）不能用 `pg_restore` 恢复；自定义/目录格式不能用 `psql -f` 恢复，两者别搞混',
        '`pg_restore -j` 只对目录格式（`-F d`）有效，自定义格式并行不生效',
        '大库备份注意磁盘空间，本站仿真里 `/data` 盘已 100%，写备份前先 `df -h`',
        '跨大版本恢复（如 12 → 16）建议用 `pg_dump`/`pg_restore` 逻辑方式，物理文件不兼容'
      ],
      related: ['db-pg-psql', 'db-pg-meta', 'db-mysql-mysqldump'],
      docs: 'https://www.postgresql.org/docs/current/app-pgdump.html',
      tags: ['备份', '恢复', 'pg_dump']
    },

    /* ---------- 37 / 56 ---------- */
    {
      id: 'db-pg-explain',
      name: 'EXPLAIN ANALYZE',
      alias: ['EXPLAIN ANALYZE', 'BUFFERS', '执行计划', 'Seq Scan'],
      level: 2,
      syntax: 'EXPLAIN [ (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ] <SQL>',
      summary: '真正执行 SQL 并给出每步实际耗时，PG 慢查询优化的核心手段。',
      desc: '`EXPLAIN` 只估算，`EXPLAIN ANALYZE` **真的执行**并返回 `actual time`、`rows`、`loops`，括号里两组数字（`cost=0.00..12.34` 是估算，`actual time=0.02..0.05 rows=1 loops=1` 是实际）差异大说明统计信息不准。加 `BUFFERS` 能看到缓存命中（`shared hit`）与磁盘读（`shared read`），加 `VERBOSE` 看输出列，`FORMAT JSON` 方便程序解析。要重点识别的节点：`Seq Scan`（全表扫描，大表上出现通常要加索引）、`Nested Loop`（嵌套循环，内层没走索引时会爆炸）、`Hash Join`/`Merge Join`、`Sort` 后面带 `external merge Disk`（排序落盘，说明 `work_mem` 不够）、`Rows Removed by Filter` 很大（扫了很多又丢掉）。统计信息过期时执行 `ANALYZE <表>` 刷新。',
      params: [
        { flag: 'ANALYZE', desc: '真正执行语句并返回实际耗时与行数' },
        { flag: 'BUFFERS', desc: '显示缓存命中与磁盘读块数' },
        { flag: 'VERBOSE', desc: '显示输出列等详细信息' },
        { flag: 'FORMAT JSON', desc: 'JSON 格式输出，便于工具分析' },
        { flag: 'ANALYZE <表>', desc: '刷新表统计信息（不是 EXPLAIN 的选项，是独立命令）' },
        { flag: 'work_mem', desc: '排序/哈希可用内存，太小会导致排序落盘' }
      ],
      examples: [
        { cmd: 'EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 8812;', desc: '看这条查询实际耗时与是不是走了索引' },
        { cmd: 'EXPLAIN (ANALYZE, BUFFERS) SELECT o.id, o.amount FROM orders o JOIN users u ON u.id = o.user_id;', desc: '带缓存统计，判断耗时是花在磁盘读还是 CPU' },
        { cmd: 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM orders WHERE created_at >= \'2024-03-01\';', desc: 'JSON 输出，便于用脚本提取 actual time 做对比' },
        { cmd: 'ANALYZE orders;', desc: '刷新统计信息后重新 EXPLAIN，执行计划往往会变好' }
      ],
      notes: [
        '**`EXPLAIN ANALYZE` 会真的执行语句**：对 `UPDATE`/`DELETE` 直接跑会改数据，生产上要包在 `BEGIN; ...; ROLLBACK;` 里',
        '看到 `Seq Scan` 不一定是坏事：小表全扫比走索引更快，要结合 `rows` 与实际耗时判断',
        '`Sort Method: external merge Disk: xxxxkB` 表示排序落盘，调大 `work_mem`（会话级 `SET work_mem = \'64MB\';`）通常立刻见效',
        '`actual rows` 与估算 `rows` 差几个数量级时先 `ANALYZE <表>`，别急着加索引',
        '生产上对超大表执行 `EXPLAIN ANALYZE` 也会消耗大量 IO 与 CPU，低峰期做',
        'PG 12 起 `EXPLAIN` 支持 `SETTINGS` 选项，能看到影响计划的非默认参数，排障很有用'
      ],
      related: ['db-pg-stat-activity', 'db-pg-psql', 'db-mysql-explain'],
      docs: 'https://www.postgresql.org/docs/current/sql-explain.html',
      tags: ['执行计划', '慢查询', '优化']
    },

    /* ---------- 38 / 56 ---------- */
    {
      id: 'db-pg-stat-activity',
      name: 'pg_stat_activity',
      alias: ['pg_stat_activity', 'pg_locks', 'pg_blocking_pids', '活动会话'],
      level: 3,
      syntax: 'SELECT ... FROM pg_stat_activity [WHERE state <> \'idle\']; / SELECT pg_blocking_pids(<pid>);',
      summary: '看当前有哪些会话在跑、跑了多久、被谁锁住，PG 排障第一站。',
      desc: '`pg_stat_activity` 是 PG 的活动会话视图，关键列：`pid`（进程号，杀会话时用）、`usename`、`application_name`、`client_addr`、`state`（`active`/`idle`/`idle in transaction`/`idle in transaction (aborted)`）、`wait_event_type` 与 `wait_event`（`Lock` 表示在等锁）、`query_start`（当前语句开始时间）、`xact_start`（事务开始时间）、`query`。**`idle in transaction` 是最危险的常见状态**：事务开着却不干活，会一直持有锁并把 vacuum 挡住，很多「PG 突然变慢」都是它造成的。查锁等待用 `pg_blocking_pids(pid)` 直接拿到「谁挡住了我」，再用 `pg_locks` 看锁对象。终止会话用 `pg_cancel_backend(pid)`（取消当前语句）和 `pg_terminate_backend(pid)`（断开连接）。',
      params: [
        { flag: 'state', desc: '`active` 执行中、`idle` 空闲、`idle in transaction` 事务开着没干活（危险）' },
        { flag: 'wait_event_type / wait_event', desc: '等待类型与事件，`Lock` 说明在等锁' },
        { flag: 'query_start / xact_start', desc: '当前语句与事务的开始时间，用来算持续时长' },
        { flag: 'pg_blocking_pids(pid)', desc: '返回挡住该会话的进程号数组' },
        { flag: 'pg_locks', desc: '锁明细：锁类型、模式、对象、是否已授予' },
        { flag: 'pg_cancel_backend(pid)', desc: '取消该会话正在执行的语句（连接保留）' },
        { flag: 'pg_terminate_backend(pid)', desc: '强制断开该会话（回滚其事务）' },
        { flag: 'idle_in_transaction_session_timeout', desc: '自动断开长期 idle in transaction 的会话' }
      ],
      examples: [
        { cmd: 'SELECT pid, usename, application_name, client_addr, state, wait_event_type, wait_event, now() - query_start AS duration, left(query, 60) AS sql FROM pg_stat_activity WHERE state <> \'idle\' ORDER BY duration DESC;', desc: '按持续时长倒序列出活动会话，排障第一步' },
        { cmd: 'SELECT pid, state, now() - xact_start AS xact_age, left(query, 60) FROM pg_stat_activity WHERE state LIKE \'idle in transaction%\' ORDER BY xact_age DESC;', desc: '专查「事务开着不干活」的会话，PG 变慢的高频元凶' },
        { cmd: 'SELECT pid, pg_blocking_pids(pid) AS blocked_by, left(query, 60) AS sql FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0;', desc: '一眼看出谁被谁挡住，直接定位锁源头' },
        { cmd: 'SELECT pg_cancel_backend(41237);', desc: '取消某会话当前语句（比直接断开温和）' }
      ],
      notes: [
        '**`pg_terminate_backend` 会强制断开连接并回滚事务**，业务侧立即报错；先用 `pg_cancel_backend` 取消语句，确认无效再考虑断开',
        '杀会话前务必核对 `pid` 与 `query`，杀错可能中断正在提交的关键业务',
        '`idle in transaction` 的会话不会自己消失，建议设置 `idle_in_transaction_session_timeout`（如 `30s`）自动兜底',
        '排查锁等待时不要只看 `pg_stat_activity`，要配合 `pg_locks` 才能看出锁在哪个对象上',
        '普通用户只能看到自己会话的 `query` 内容（其他会话显示 `<insufficient privilege>`），排查需要足够权限的账号',
        'PG 14 起 `pg_stat_activity` 的 `query` 列在部分场景需要 `pg_read_all_stats` 角色才能看到完整内容'
      ],
      related: ['db-pg-psql', 'db-pg-explain', 'db-pg-meta'],
      docs: 'https://www.postgresql.org/docs/current/monitoring-stats.html',
      tags: ['会话', '锁', '诊断']
    },

    /* ================= D. MongoDB（4 条） ================= */

    /* ---------- 39 / 56 ---------- */
    {
      id: 'db-mongo-shell',
      name: 'mongosh',
      alias: ['mongosh', 'mongo shell', '连接 MongoDB'],
      level: 1,
      syntax: 'mongosh "mongodb://<用户>:<密码>@<主机>:<端口>/<库>?authSource=admin"',
      summary: 'MongoDB 的官方命令行客户端，替代了老的 mongo shell。',
      desc: '`mongosh` 是 MongoDB 5.0 起的官方 Shell，老版本用的 `mongo` 命令已随 6.0 一起移除。连接方式有两种：URI 形式（`mongodb://用户:密码@主机:端口/库?authSource=admin`）或参数形式（`--host`/`--port`/`-u`/`-p`/`--authenticationDatabase`）。**认证库的坑最多**：账号建在 `admin` 库时，URI 里必须写 `authSource=admin`，否则报 `Authentication failed`。进 Shell 后常用：`show dbs`、`show collections`、`use <库>`、`db.getName()`、`db.version()`、`rs.status()`（副本集状态）、`db.currentOp()`（正在执行的操作）。退出用 `exit` 或 `Ctrl+D`。',
      params: [
        { flag: '--host / --port', desc: '地址与端口，默认 127.0.0.1:27017' },
        { flag: '-u / -p', desc: '用户名与密码（`-p` 不跟值时会交互提示）' },
        { flag: '--authenticationDatabase', desc: '认证库，账号通常建在 `admin`' },
        { flag: '--tls', desc: '启用 TLS 连接（云数据库一般要求）' },
        { flag: '--eval "<脚本>"', desc: '执行一段 JS 后退出，脚本化首选' },
        { flag: '--quiet', desc: '减少启动横幅输出，脚本里更干净' }
      ],
      examples: [
        { cmd: 'mongosh "mongodb://app:Mo@2024@db-prod-01:27017/orders?authSource=admin"', desc: 'URI 方式连接，注意 `authSource=admin` 不能漏' },
        { cmd: 'mongosh --host db-prod-01 --port 27017 -u app -p --authenticationDatabase admin', desc: '参数方式连接，密码交互输入更安全' },
        { cmd: 'mongosh "mongodb://db-prod-01:27017/orders" --quiet --eval "db.stats().collections"', desc: '不进交互界面，直接跑一段脚本取集合数量' },
        { cmd: 'mongosh --host db-prod-01 -u app -p --authenticationDatabase admin --eval "rs.status().members.map(m => m.name + \' \' + m.stateStr)"', desc: '副本集场景看各成员状态（PRIMARY/SECONDARY）' }
      ],
      notes: [
        '老教程里的 `mongo` 命令在 MongoDB 6.0 已移除，装 6.0 以上版本只会看到 `mongosh`',
        'URI 里密码含 `@`、`:`、`/` 时必须做 URL 编码，否则连接串会被解析错',
        '账号建在哪个库就要用 `authSource` 指明哪个库，这是 `Authentication failed` 最常见的原因',
        '生产环境别用 `--eval` 跑会改数据的脚本（`dropDatabase`、`deleteMany`），Shell 里没有二次确认',
        '密码写进命令行会留在 history，可用 `mongosh --shell` 配合配置文件或环境变量'
      ],
      related: ['db-mongo-stats', 'db-mongo-find', 'db-mongo-dump'],
      docs: 'https://www.mongodb.com/docs/mongodb-shell/',
      tags: ['MongoDB', '连接', '客户端']
    },

    /* ---------- 40 / 56 ---------- */
    {
      id: 'db-mongo-stats',
      name: 'db.stats() / db.collection.stats()',
      alias: ['db.stats()', 'collection.stats()', '存储统计', 'wiredTiger'],
      level: 2,
      syntax: 'db.stats([scale]) / db.<集合>.stats([scale])',
      summary: '查看库与集合的存储占用、索引大小和文档数，容量排查必用。',
      desc: '`db.stats()` 返回当前库的整体统计：`collections`（集合数）、`objects`（文档总数）、`dataSize`（未压缩逻辑大小）、`storageSize`（磁盘实际占用，WiredTiger 下通常远小于 dataSize，因为默认启用了压缩）、`indexes`/`indexSize`、`totalSize`、`fsUsedSize`/`fsTotalSize`（所在文件系统用量，容量告警看这两个）。参数 `scale` 指定单位（`db.stats(1024*1024)` 按 MB 显示）。`db.<集合>.stats()` 返回单集合明细：`count`、`size`、`avgObjSize`、`storageSize`、`nindexes`、`indexSizes`、`totalIndexSize`、`capped`、`wiredTiger`（含 `block-manager` 与缓存信息）。索引往往比数据还大，`indexSizes` 是排查磁盘暴涨的重点。',
      params: [
        { flag: 'scale', desc: '单位换算，如 `1024*1024` 表示按 MB 输出' },
        { flag: 'db.stats().storageSize', desc: '磁盘实际占用，与 dataSize 对比看压缩效果' },
        { flag: 'fsUsedSize / fsTotalSize', desc: '所在文件系统已用与总量，最直接的容量指标' },
        { flag: 'db.<集合>.stats().indexSizes', desc: '各索引占用，找出「没用却很大」的索引' },
        { flag: 'db.<集合>.stats().wiredTiger', desc: 'WiredTiger 存储引擎明细（块管理、缓存）' },
        { flag: 'db.serverStatus().wiredTiger.cache', desc: '实例级缓存使用情况，判断内存是否吃紧' }
      ],
      examples: [
        { cmd: 'db.stats(1024*1024)', desc: '按 MB 看当前库的集合数、文档数、数据与索引占用' },
        { cmd: 'db.orders.stats(1024*1024)', desc: '看 orders 集合的大小、文档数、平均文档大小与索引占用' },
        { cmd: 'db.orders.stats().indexSizes', desc: '列出每个索引占多少空间，找冗余索引' },
        { cmd: 'db.orders.getIndexes()', desc: '配合上面的 indexSizes，确认哪些索引真的被业务用到' }
      ],
      notes: [
        '`dataSize` 是未压缩的逻辑大小，`storageSize` 是磁盘实际占用；WiredTiger 默认压缩，两者差几倍很正常，别把 dataSize 当成磁盘占用',
        '删除文档**不会**立刻释放磁盘空间（WiredTiger 会复用），要看真实占用得等 checkpoint 或做 `compact`',
        '`indexSize` 超过 `dataSize` 通常说明索引建多了，每个索引都会拖慢写入',
        '`fsTotalSize` 接近 `fsUsedSize` 时写入会失败，MongoDB 所在盘与其他服务共用时尤其要注意',
        '集合数极多（几万个）的实例上 `db.stats()` 会较慢，生产监控优先采 `serverStatus`'
      ],
      related: ['db-mongo-shell', 'db-mongo-find', 'db-mysql-information-schema'],
      docs: 'https://www.mongodb.com/docs/manual/reference/method/db.stats/',
      tags: ['存储', '容量', '索引']
    },

    /* ---------- 41 / 56 ---------- */
    {
      id: 'db-mongo-find',
      name: 'find() / explain()',
      alias: ['db.collection.find()', 'explain()', 'executionStats', 'COLLSCAN'],
      level: 2,
      syntax: 'db.<集合>.find(<条件>).sort(<排序>).limit(<N>) / .explain("executionStats")',
      summary: '查文档并看查询执行计划，判断有没有走索引、扫了多少文档。',
      desc: '`find()` 返回游标，Shell 里默认只打印前 20 条（输入 `it` 继续）。常用链式方法：`.sort({created_at: -1})`、`.limit(5)`、`.skip(100)`（深分页很慢）、`.projection({order_id: 1, amount: 1})` 只返回需要的字段（减少网络与内存），`db.<集合>.findOne({...})` 只取一条。排障核心是 `.explain("executionStats")`，重点看：`winningPlan.stage` 是 `COLLSCAN`（全集合扫描，**没有走索引**）还是 `IXSCAN`（走索引）、`totalDocsExamined`（实际扫描文档数）与 `nReturned`（返回数）的比值（理想是接近 1:1，差很多说明索引选择性差）、`executionTimeMillis`（耗时）。索引用 `db.<集合>.createIndex({user_id: 1, status: 1})` 创建，`getIndexes()` 查看已有的。',
      params: [
        { flag: 'find(<条件>)', desc: '查询条件，如 `{status: "PAID"}`；空对象表示全查' },
        { flag: '.sort({字段: 1|-1})', desc: '排序，1 升序 -1 降序；配合索引才有意义' },
        { flag: '.limit(N) / .skip(N)', desc: '限制条数 / 跳过条数（深分页性能差）' },
        { flag: '.projection({字段: 1})', desc: '只返回需要的字段，节省网络与内存' },
        { flag: '.explain("executionStats")', desc: '输出执行统计，看是否走索引与扫描文档数' },
        { flag: 'createIndex({...})', desc: '创建索引；复合索引字段顺序要与查询条件顺序匹配' },
        { flag: 'getIndexes()', desc: '查看集合已有索引' }
      ],
      examples: [
        { cmd: 'db.orders.find({status: \'PAID\'}).sort({created_at: -1}).limit(5)', desc: '按时间倒序取最近 5 条已支付订单' },
        { cmd: 'db.orders.find({user_id: 8812}).explain(\'executionStats\')', desc: '看查询计划：`COLLSCAN` 说明没索引，`IXSCAN` 才是走索引' },
        { cmd: 'db.orders.createIndex({user_id: 1, status: 1})', desc: '按查询条件建复合索引（大集合上建索引会占用资源，低峰期做）' },
        { cmd: 'db.orders.find({order_id: 8812}, {order_id: 1, amount: 1, _id: 0})', desc: '只返回需要的字段，避免把大文档整个拉回来' }
      ],
      notes: [
        '`explain()` 的 `totalDocsExamined` 远大于 `nReturned` 说明索引效率低，需要调整索引或查询条件',
        '`COLLSCAN` 在小集合上无所谓，集合上百万文档时全扫会直接拖垮实例',
        '复合索引遵循最左前缀原则，`{a:1, b:1}` 不能用于只查 `b` 的条件',
        '`skip()` 深分页要跳过大量文档才能取到结果，改用「上一页最后一条的排序字段值」做范围查询',
        '`find()` 不带条件会返回全集合，Shell 里请务必加 `limit()`，生产脚本更不能用无条件全查',
        '`explain` 里的 `executionTimeMillis` 不含网络传输时间，客户端测到的耗时会更大'
      ],
      related: ['db-mongo-shell', 'db-mongo-stats', 'db-mongo-dump'],
      docs: 'https://www.mongodb.com/docs/manual/reference/method/cursor.explain/',
      tags: ['查询', '索引', '执行计划']
    },

    /* ---------- 42 / 56 ---------- */
    {
      id: 'db-mongo-dump',
      name: 'mongodump / mongorestore',
      alias: ['mongodump', 'mongorestore', 'BSON 备份', '--gzip'],
      level: 2,
      syntax: 'mongodump --uri="<连接串>" --gzip --out=<目录> / mongorestore --uri="<连接串>" --gzip --dir=<目录>',
      summary: 'MongoDB 官方备份恢复工具，导出 BSON 快照并可选择性恢复集合。',
      desc: '`mongodump` 把数据导成 BSON 文件（不是 SQL），输出目录结构是 `<库>/<集合>.bson` + `<集合>.metadata.json`（存索引定义）。常用参数：`--gzip` 压缩（体积可降到 1/3 左右）、`--out` 输出目录、`--db`/`--collection` 只导某个库或集合、`--nsInclude="orders.*"` 按命名空间过滤、`--archive=<文件>` 打成单个归档文件（便于传到 OBS/S3）、`--oplog` 记录备份期间的操作日志（副本集场景实现时间点一致）。`mongorestore` 对应参数：`--dir`、`--gzip`、`--nsInclude`、`--nsFrom/--nsTo` 做集合改名、`--drop` 恢复前先删同名集合。恢复时索引会从 `.metadata.json` 自动重建，大集合重建索引很慢，要有心理预期。',
      params: [
        { flag: '--uri="<连接串>"', desc: '带认证的连接串，比逐项传账号密码更清晰' },
        { flag: '--gzip', desc: '导出/导入时压缩，显著省磁盘与传输量' },
        { flag: '--out <目录> / --dir <目录>', desc: '导出目录 / 导入目录' },
        { flag: '--nsInclude="<库>.<集合>"', desc: '按命名空间过滤，可多次指定或用通配符' },
        { flag: '--archive=<文件>', desc: '打包成单个归档文件，便于异地传输' },
        { flag: '--oplog', desc: '副本集下记录备份期间的操作，实现一致快照' },
        { flag: '--drop', desc: 'mongorestore：恢复前删除同名集合（危险）' },
        { flag: '--nsFrom / --nsTo', desc: '恢复时改名：把 A 库集合恢复到 B 库' }
      ],
      examples: [
        { cmd: 'mongodump --uri="mongodb://app:Mo@2024@db-prod-01:27017/orders?authSource=admin" --gzip --out=/data/backup/mongo-2024-03-18', desc: '整库带压缩备份到数据盘，最常用写法' },
        { cmd: 'mongodump --uri="mongodb://db-prod-01:27017/orders" --collection=orders --gzip --out=/data/backup/mongo-orders-2024-03-18', desc: '只备份单个集合，适合单表事故回滚' },
        { cmd: 'mongorestore --uri="mongodb://db-prod-01:27017/orders" --gzip --dir=/data/backup/mongo-2024-03-18', desc: '按目录恢复（不会删除已有数据，同名集合会追加/覆盖文档）' },
        { cmd: 'mongorestore --uri="mongodb://db-prod-01:27017/orders" --gzip --drop --nsInclude="orders.orders" --dir=/data/backup/mongo-2024-03-18', desc: '只恢复 orders 集合且先清空原集合（覆盖式恢复）' }
      ],
      notes: [
        '**`--drop` 会先删除目标集合再恢复**，生产执行前必须确认连接串指向的实例与库，先做恢复演练',
        '`mongodump` 是逻辑备份，导出的是 BSON 而不是物理文件，大库（TB 级）建议用文件系统快照或云数据库自带备份',
        '备份期间的写入不保证包含在快照里；副本集上要一致性快照请加 `--oplog`，恢复时对应使用 `--oplogReplay`',
        '恢复时 `.metadata.json` 里的索引会重建，大集合耗时长且吃内存，注意 `df -h` 与实例内存水位',
        '跨大版本恢复（如 4.4 → 7.0）通常可行但不保证，跨大版本升级建议用官方升级路径而不是 dump/restore',
        '本站仿真里 `/data` 盘已 100%，写备份前先确认空间，备份完成后记得清理历史文件'
      ],
      related: ['db-mongo-shell', 'db-mongo-stats', 'db-pg-dump'],
      docs: 'https://www.mongodb.com/docs/database-tools/mongodump/',
      tags: ['备份', '恢复', 'BSON']
    },

    /* ================= E. Kafka（6 条） ================= */

    /* ---------- 43 / 56 ---------- */
    {
      id: 'db-kafka-topics-list',
      name: 'kafka-topics.sh --list',
      alias: ['kafka-topics.sh --list', 'topic 列表', '查看主题'],
      level: 1,
      syntax: 'kafka-topics.sh --bootstrap-server <broker:9092> --list',
      summary: '列出集群里所有主题名，确认 topic 是否存在的最快方式。',
      desc: 'Kafka 3.0 起 `--zookeeper` 已废弃、4.0 彻底移除，新版本一律用 `--bootstrap-server`（写任意一个 broker 地址即可，客户端会自动获取全集群元数据）。默认会连内部主题（`__consumer_offsets`、`__transaction_state`）一起列出来，加 `--exclude-internal` 只看业务主题。要过滤可以用 Shell 管道，比如只看订单相关的：`kafka-topics.sh --list | grep orders`。注意 kafka-topics.sh 是 Kafka 发行包 `bin/` 目录下的脚本，不在 PATH 里时要写全路径或先 `cd` 到 Kafka 目录。',
      params: [
        { flag: '--bootstrap-server <host:port>', desc: 'broker 地址，多个用逗号分隔；3.0 起取代 `--zookeeper`' },
        { flag: '--list', desc: '列出所有主题名' },
        { flag: '--exclude-internal', desc: '排除 `__consumer_offsets` 等内部主题' },
        { flag: '--topic <名称>', desc: '配合 `--list` 无效，用于 describe/create/delete' },
        { flag: '--command-config <文件>', desc: '需要认证（SASL/SSL）时指定客户端配置文件' }
      ],
      examples: [
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --list', desc: '列出集群所有主题（含内部主题）' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --list --exclude-internal', desc: '只看业务主题，排除 `__consumer_offsets` 等' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --list | grep -c "^orders"', desc: '统计订单相关主题的个数，巡检脚本里常用' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --list --command-config /etc/kafka/client.properties', desc: '开启了 SASL/SSL 认证的集群，用配置文件带认证信息' }
      ],
      notes: [
        'Kafka 3.0 起 `--zookeeper` 已废弃、4.0 移除；看到老教程写 `--zookeeper` 说明版本很老，别照抄',
        '`--bootstrap-server` 只需给一个可用 broker，但建议写 2~3 个做冗余',
        '开了认证的集群不加 `--command-config` 会报 `Connection to node -1 could not be established` 或超时',
        '`kafka-topics.sh` 在 Kafka 安装包的 `bin/` 目录，容器化部署要用 `docker exec` 进 broker 容器执行',
        '列出主题不会影响集群性能，但 `--describe` 在大集群（上万 topic）上会明显变慢'
      ],
      related: ['db-kafka-topics-describe', 'db-kafka-topics-create', 'db-kafka-consumer-groups'],
      docs: 'https://kafka.apache.org/documentation/#basic_ops',
      tags: ['Kafka', '主题', '查询']
    },

    /* ---------- 44 / 56 ---------- */
    {
      id: 'db-kafka-topics-describe',
      name: 'kafka-topics.sh --describe',
      alias: ['--describe', 'ISR', '分区副本', 'under-replicated'],
      level: 2,
      syntax: 'kafka-topics.sh --bootstrap-server <broker:9092> --describe [--topic <名称>]',
      summary: '看主题的分区、副本与 ISR 状态，判断数据可靠性与负载均衡。',
      desc: '输出每个分区一行：`Partition`（分区号）、`Leader`（负责读写的 broker）、`Replicas`（副本所在 broker 列表）、`Isr`（**同步中的副本**，正常应与 Replicas 一致）。三个判读要点：① **ISR 数量少于 Replicas** 说明有副本掉队（broker 挂了、磁盘慢、网络抖），此时如果 leader 再挂就会丢数据；② `Leader` 为 `-1` 表示该分区**没有 leader**，分区不可用，生产环境告警红线；③ 所有分区的 leader 集中在同一 broker 说明分区分配不均。加 `--under-replicated-partitions` 只看有副本掉队的分区，`--unavailable-partitions` 只看没有 leader 的分区——这两个是巡检脚本的标准参数。`--topics-with-overrides` 列出被单独改过配置的主题。',
      params: [
        { flag: '--describe', desc: '显示主题的分区、副本与 ISR 详情' },
        { flag: '--topic <名称>', desc: '只看指定主题；不写则列出全部（大集群很慢）' },
        { flag: '--under-replicated-partitions', desc: '只看 ISR 少于副本数的分区（巡检必备）' },
        { flag: '--unavailable-partitions', desc: '只看没有 leader 的分区（最严重的异常）' },
        { flag: '--topics-with-overrides', desc: '只看单独改过配置项的主题' },
        { flag: '--command-config <文件>', desc: '认证集群的客户端配置文件' }
      ],
      examples: [
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --describe --topic orders-events', desc: '看单个主题的分区、leader、副本与 ISR' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --describe --under-replicated-partitions', desc: '巡检：找出副本掉队的分区，及时补副本' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --describe --unavailable-partitions', desc: '巡检：找出没有 leader 的分区（应为空，非空立即告警）' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --describe --topics-with-overrides', desc: '看哪些主题单独改过保留时间等配置' }
      ],
      notes: [
        '`Isr` 比 `Replicas` 少就意味着**副本没有全部同步**，此时容灾能力下降，要在下一个 broker 故障前处理掉',
        '`Leader: -1` 表示分区不可用，生产和消费都会失败，属于最高优先级告警',
        '`--describe` 不带 `--topic` 会遍历所有主题，上万 topic 的集群上很慢且会给 controller 压力，巡检请用过滤参数',
        '副本数 `ReplicationFactor` 大于 broker 数量时创建会失败，扩容 broker 后可以用 `kafka-reassign-partitions.sh` 重新分配',
        '`--describe` 只反映某一时刻的元数据，ISR 抖动时会看到瞬时不一致，判断故障要连续观察'
      ],
      related: ['db-kafka-topics-list', 'db-kafka-topics-create', 'db-kafka-consumer-groups'],
      docs: 'https://kafka.apache.org/documentation/#basic_ops',
      tags: ['Kafka', '分区', 'ISR']
    },

    /* ---------- 45 / 56 ---------- */
    {
      id: 'db-kafka-topics-create',
      name: 'kafka-topics.sh --create',
      alias: ['--create', '--partitions', '--replication-factor', '建 topic'],
      level: 2,
      syntax: 'kafka-topics.sh --bootstrap-server <broker:9092> --create --topic <名称> --partitions <N> --replication-factor <M>',
      summary: '创建主题并指定分区数与副本数，参数定错后面很难改回来。',
      desc: '三个必填项要想清楚：`--partitions`（分区数，决定**最大并行消费度**——同一消费组内一个分区只能被一个消费者消费，分区数 6 意味着最多 6 个消费者并行）、`--replication-factor`（副本数，生产至少 2，重要业务 3；不能超过 broker 数量）、`--topic`（名称，建议带业务前缀与版本，如 `orders-events-v1`）。可以用 `--config` 覆盖主题级配置，如 `retention.ms`（保留时长，默认 168 小时 = 7 天）、`cleanup.policy`（`delete`/`compact`）、`max.message.bytes`。改分区数用 `--alter --partitions N`，**只能增加不能减少**（Kafka 不支持减少分区，因为会丢数据与打乱 key 到分区的映射）。',
      params: [
        { flag: '--create', desc: '创建主题' },
        { flag: '--topic <名称>', desc: '主题名，建议带业务前缀便于管理' },
        { flag: '--partitions <N>', desc: '分区数，决定消费并行度；只能增不能减' },
        { flag: '--replication-factor <M>', desc: '副本数，生产至少 2，不能大于 broker 数量' },
        { flag: '--config <k=v>', desc: '覆盖主题级配置，如 `retention.ms=604800000`' },
        { flag: '--alter --partitions <N>', desc: '增加分区数（减少会报错）' },
        { flag: '--if-not-exists', desc: '主题已存在时不报错，适合放进初始化脚本' }
      ],
      examples: [
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --create --topic orders-events --partitions 6 --replication-factor 2', desc: '创建 6 分区 2 副本的订单事件主题，生产标准写法' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --create --topic orders-events --partitions 6 --replication-factor 2 --config retention.ms=604800000 --config cleanup.policy=delete', desc: '同时指定保留 7 天与清理策略' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --alter --topic orders-events --partitions 12', desc: '消费堆积时扩容分区（只能加不能减）' },
        { cmd: 'kafka-topics.sh --bootstrap-server broker1:9092 --create --topic payment-events --partitions 3 --replication-factor 3 --if-not-exists', desc: '幂等创建，已存在时不报错，适合写进部署脚本' }
      ],
      notes: [
        '**分区数只能增加不能减少**：建 topic 时宁可多规划一些，也别事后想缩容',
        '增加分区会**打乱 key 到分区的映射**，依赖「同一 key 落在同一分区」做顺序保证的业务要谨慎（顺序只在分区内保证）',
        '`--replication-factor` 大于 broker 数量会报 `InvalidReplicationFactorException`，集群只有 1 个 broker 时只能写 1（无冗余，生产不要这么干）',
        '副本数 1 意味着 broker 一挂数据就不可用，生产环境禁止',
        '`--config retention.ms` 的单位是毫秒，写 7 表示 7 毫秒（消息立刻被删），这类低级错误很常见',
        'Kafka 4.0 起彻底移除了 `--zookeeper`，请使用 `--bootstrap-server`'
      ],
      related: ['db-kafka-topics-list', 'db-kafka-topics-describe', 'db-kafka-console-producer'],
      docs: 'https://kafka.apache.org/documentation/#basic_ops',
      tags: ['Kafka', '创建', '分区']
    },

    /* ---------- 46 / 56 ---------- */
    {
      id: 'db-kafka-console-producer',
      name: 'kafka-console-producer.sh',
      alias: ['kafka-console-producer.sh', '发消息', '生产测试'],
      level: 2,
      syntax: 'kafka-console-producer.sh --bootstrap-server <broker:9092> --topic <名称>',
      summary: '命令行往主题里发消息，验证链路与做联调测试最方便。',
      desc: '执行后进入交互模式，每行输入一条消息、回车即发送（默认把整行当 value）。要发带 key 的消息加 `--property parse.key=true --property key.separator=:`，此时 `order-8812:{"status":"PAID"}` 会被解析成 key=`order-8812`、value=`{"status":"PAID"}`。发送带空值或需要指定序列化时用 `--property value.serializer=...`。也可以用管道批量灌数据：`seq 1 100 | kafka-console-producer.sh ...`。重要参数 `--producer-property acks=all`（要求所有 ISR 确认，可靠性最高）、`--producer-property linger.ms=0`（不等待批量）。这个工具**没有确认回执**，消息发出去是否成功要靠消费者或监控确认。',
      params: [
        { flag: '--bootstrap-server <host:port>', desc: 'broker 地址，3.0 起取代 `--broker-list`' },
        { flag: '--topic <名称>', desc: '目标主题' },
        { flag: '--property parse.key=true', desc: '解析 key，需与 `key.separator` 一起用' },
        { flag: '--property key.separator=:', desc: 'key 与 value 的分隔符' },
        { flag: '--producer-property acks=all', desc: '所有 ISR 确认后才算成功，可靠性最高' },
        { flag: '--producer-property linger.ms=100', desc: '攒批等待时间，提高吞吐但增加延迟' },
        { flag: '--command-config <文件>', desc: '认证集群的客户端配置' }
      ],
      examples: [
        { cmd: 'kafka-console-producer.sh --bootstrap-server broker1:9092 --topic orders-events', desc: '进入交互模式，逐行输入消息（回车发送，Ctrl+C 退出）' },
        { cmd: 'kafka-console-producer.sh --bootstrap-server broker1:9092 --topic orders-events --property parse.key=true --property key.separator=:', desc: '发带 key 的消息，格式如 `order-8812:{"status":"PAID"}`' },
        { cmd: 'seq 1 100 | kafka-console-producer.sh --bootstrap-server broker1:9092 --topic orders-events', desc: '批量灌 100 条测试消息，验证消费链路' },
        { cmd: 'kafka-console-producer.sh --bootstrap-server broker1:9092 --topic orders-events --producer-property acks=all --command-config /etc/kafka/client.properties', desc: '认证集群 + 高可靠发送' }
      ],
      notes: [
        '生产者**默认不显示发送结果**，看到输入没报错不等于消息进了 Kafka，务必用消费者或 `kafka-run-class.sh kafka.tools.GetOffsetShell` 核对',
        '`acks=all` 最可靠但延迟最高；只写 `acks=1` 时 leader 落盘即返回，leader 挂掉可能丢消息',
        '发 `null` 需要写 `--property null.marker=NULL`，否则会被当成字符串 "null"',
        '往生产主题灌测试数据会污染业务，测试请用专门的测试主题（如 `orders-events-test`）',
        'Kafka 4.0 起 `--broker-list` 已移除，只能用 `--bootstrap-server`',
        '中文消息要确认客户端与服务端编码一致，Shell 里注意 LANG 设置，否则会乱码'
      ],
      related: ['db-kafka-console-consumer', 'db-kafka-topics-create', 'db-kafka-consumer-groups'],
      docs: 'https://kafka.apache.org/quickstart',
      tags: ['Kafka', '生产', '测试']
    },

    /* ---------- 47 / 56 ---------- */
    {
      id: 'db-kafka-console-consumer',
      name: 'kafka-console-consumer.sh',
      alias: ['kafka-console-consumer.sh', '--from-beginning', '--group', '消费消息'],
      level: 2,
      syntax: 'kafka-console-consumer.sh --bootstrap-server <broker:9092> --topic <名称> [--from-beginning] [--group <组>]',
      summary: '命令行消费主题消息，验证数据是否写进去、内容对不对。',
      desc: '**不写 `--group` 时用随机消费组**，每次执行都是全新消费者，默认只消费「启动之后」产生的新消息；加 `--from-beginning` 从最早的可用位点开始读（注意：如果指定了已有 `--group`，而该组已经有位点，`--from-beginning` 会被忽略，因为位点以组为准）。实际排查时更常用的是「**不指定 group + `--from-beginning`**」来翻历史消息。其他实用参数：`--max-messages <N>` 读够 N 条自动退出（脚本友好）、`--property print.key=true` 打印 key、`--property print.timestamp=true` 打印时间戳、`--partition <N>` 只读某个分区、`--timeout-ms <毫秒>` 无消息时超时退出、`--offset earliest|latest`。要验证**消费组是否正常提交位点**，请用 `kafka-consumer-groups.sh --describe`。',
      params: [
        { flag: '--bootstrap-server <host:port>', desc: 'broker 地址' },
        { flag: '--topic <名称>', desc: '要消费的主题' },
        { flag: '--from-beginning', desc: '从最早位点开始读；指定已有 group 时以组位点为准' },
        { flag: '--group <组名>', desc: '加入指定消费组，会与线上消费者共同分摊分区' },
        { flag: '--max-messages <N>', desc: '读够 N 条后退出，脚本里必加' },
        { flag: '--property print.key=true', desc: '同时打印消息 key' },
        { flag: '--timeout-ms <毫秒>', desc: '指定时间内无消息则退出' },
        { flag: '--partition <N> / --offset earliest', desc: '只消费指定分区 / 指定位点策略' }
      ],
      examples: [
        { cmd: 'kafka-console-consumer.sh --bootstrap-server broker1:9092 --topic orders-events --from-beginning --max-messages 10', desc: '从最早位点读 10 条历史消息后退出，验证数据是否写入成功' },
        { cmd: 'kafka-console-consumer.sh --bootstrap-server broker1:9092 --topic orders-events --property print.key=true --property print.timestamp=true', desc: '实时跟读，带 key 与时间戳，排查具体某条消息' },
        { cmd: 'kafka-console-consumer.sh --bootstrap-server broker1:9092 --topic orders-events --group order-service-test --max-messages 5', desc: '用临时消费组读消息，会真实提交位点（测试组名别与线上重名）' },
        { cmd: 'kafka-console-consumer.sh --bootstrap-server broker1:9092 --topic orders-events --partition 0 --offset earliest --max-messages 20', desc: '只读 0 号分区从头开始的 20 条消息' }
      ],
      notes: [
        '**千万别用线上消费组名**：命令行消费者会加入该组并分走分区，导致线上实例消费不到消息（会触发 rebalance）',
        '`--group` 与 `--from-beginning` 同时用时要小心：组里已有位点时，`--from-beginning` 不生效',
        '不指定 `--group` 时会自动生成随机组名，不会提交位点，也不会影响线上消费',
        '消费大量历史消息会占用 broker 带宽与磁盘 IO，`--from-beginning` 请务必配 `--max-messages` 或 `--timeout-ms`',
        '读不到消息先确认三件事：主题名是否写错、消息是否真的写进去了（用 producer 复查）、消费者是否有权限',
        '认证集群需要 `--consumer.config <文件>`（注意是 consumer.config，与 producer 的参数名不同）'
      ],
      related: ['db-kafka-console-producer', 'db-kafka-consumer-groups', 'db-kafka-topics-describe'],
      docs: 'https://kafka.apache.org/quickstart',
      tags: ['Kafka', '消费', '验证']
    },

    /* ---------- 48 / 56 ---------- */
    {
      id: 'db-kafka-consumer-groups',
      name: 'kafka-consumer-groups.sh --describe',
      alias: ['--describe', 'LAG', '消费积压', 'consumer-groups'],
      level: 3,
      syntax: 'kafka-consumer-groups.sh --bootstrap-server <broker:9092> --describe --group <组名>',
      summary: '看消费组的位点与积压量，LAG 持续增长就是消费跟不上了。',
      desc: '输出每行一个分区：`CURRENT-OFFSET`（消费组已提交的位点）、`LOG-END-OFFSET`（该分区最新消息位点）、`LAG`（**积压条数 = LOG-END-OFFSET − CURRENT-OFFSET**）、`CONSUMER-ID`/`HOST`/`CLIENT-ID`（当前消费者）。判读要点：① `LAG` 稳定在很小的值 = 正常；② `LAG` **持续增长** = 消费速度小于生产速度，要么加消费者（受分区数上限约束）、要么优化消费逻辑；③ `LAG` 为 `-` 且 `CONSUMER-ID` 为空 = **该分区没有消费者**（消费者挂了或组内成员不足），是最危险的信号；④ 所有分区都压在同一个 `CONSUMER-ID` 上 = 分区分配不均。配套命令：`--list` 列出所有组、`--describe --all-groups` 看全部组、`--state` 看组状态（`Stable`/`PreparingRebalance`/`Empty`/`Dead`）、`--members --verbose` 看成员与分配、`--delete` 删组、`--reset-offsets --to-earliest --execute` 重置位点（**必须先停掉所有消费者**）。',
      params: [
        { flag: '--describe --group <组名>', desc: '看该组每个分区的位点与 LAG' },
        { flag: '--all-groups', desc: '一次性看所有消费组的积压（大集群输出很长）' },
        { flag: '--list', desc: '列出所有消费组名' },
        { flag: '--state', desc: '看组状态：Stable / PreparingRebalance / Empty / Dead' },
        { flag: '--members --verbose', desc: '看成员清单与各自分到的分区' },
        { flag: '--reset-offsets --to-earliest|--to-latest|--to-offset <N>', desc: '重置位点（加 `--execute` 才真正执行，先停消费者）' },
        { flag: '--delete', desc: '删除消费组（组必须处于不活跃状态）' }
      ],
      examples: [
        { cmd: 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service', desc: '看订单服务的消费积压，LAG 一列是重点' },
        { cmd: 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service | awk \'NR>1 && $5+0 > 10000 {print $1, $2, $3, $5}\'', desc: '筛出积压超过 1 万条的分区，快速定位热点分区' },
        { cmd: 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --list', desc: '列出所有消费组，确认组名写对了' },
        { cmd: 'kafka-consumer-groups.sh --bootstrap-server broker1:9092 --describe --group order-service --state', desc: '看组状态，`PreparingRebalance` 卡住会导致长时间不消费' }
      ],
      notes: [
        '`LAG` 为 `-` 且没有 `CONSUMER-ID` 说明该分区**没有消费者在消费**，比积压大更严重，优先查消费者进程与组状态',
        '`LAG` 大不一定是故障：批量离线任务、消费者重启期间积压是正常的，关键看趋势是否收敛',
        '加消费者**不能超过分区数**：6 个分区最多 6 个消费者并行，第 7 个会一直空闲（此时要先扩分区，但扩分区会打乱 key 映射）',
        '`--reset-offsets` 必须在消费组**没有任何活跃成员**时执行，否则报错；重置前先 `--dry-run` 看影响范围',
        '`--delete` 删除消费组会丢掉位点记录，下次消费将从策略决定的位置开始，慎用',
        '消费慢的常见原因：单条消息处理耗时长、批量提交位点间隔太大、消费者线程数与分区数不匹配'
      ],
      related: ['db-kafka-console-consumer', 'db-kafka-topics-describe', 'db-kafka-topics-list'],
      docs: 'https://kafka.apache.org/documentation/#basic_ops_consumer_group',
      tags: ['Kafka', '积压', 'LAG']
    },

    /* ================= F. RabbitMQ（4 条） ================= */

    /* ---------- 49 / 56 ---------- */
    {
      id: 'db-rabbit-status',
      name: 'rabbitmqctl status',
      alias: ['rabbitmqctl status', 'cluster_status', '节点状态'],
      level: 1,
      syntax: 'rabbitmqctl status / rabbitmqctl cluster_status',
      summary: '看 RabbitMQ 节点是否健康：内存、磁盘、文件句柄与监听端口。',
      desc: '`rabbitmqctl status` 输出节点名、RabbitMQ 与 Erlang 版本、`Uptime`、`Listeners`（`amqp` 5672、`clustering` 25672、管理插件启用时还有 15672）、`Memory`（各队列/连接/插件占用）、`File Descriptors`（**已用/总量**，用满会直接拒绝新连接）、`Disk space`（空闲磁盘，低于 `disk_free_limit` 会触发流控阻塞生产者）、`Alarms`（内存或磁盘告警，非空即为异常）。`rabbitmqctl cluster_status` 看集群成员与分区情况：`Running Nodes`、`Disc Nodes`（磁盘节点，存元数据）、`Ram Nodes`、`Partitions`（网络分区，非空说明集群脑裂）。配套 `rabbitmq-diagnostics` 系列（`ping`、`check_running`、`check_local_alarms`）更适合做监控探针。',
      params: [
        { flag: 'status', desc: '节点整体状态：版本、监听端口、内存、句柄、磁盘' },
        { flag: 'cluster_status', desc: '集群成员、磁盘/RAM 节点、网络分区情况' },
        { flag: '-n <节点名>', desc: '指定要操作的节点（如 `rabbit@node1`）' },
        { flag: '--formatter json', desc: '以 JSON 输出，便于监控脚本解析' },
        { flag: '-q, --quiet', desc: '精简输出，适合脚本' },
        { flag: 'rabbitmq-diagnostics ping', desc: '轻量存活探针，比 status 快得多' },
        { flag: 'rabbitmq-diagnostics check_local_alarms', desc: '检查本节点是否处于告警（流控）状态' }
      ],
      examples: [
        { cmd: 'rabbitmqctl status', desc: '看节点是否健康，重点扫 Alarms、File Descriptors、Disk space' },
        { cmd: 'rabbitmqctl cluster_status', desc: '看集群成员是否都在、有没有网络分区' },
        { cmd: 'rabbitmqctl -q --formatter json status', desc: 'JSON 输出，喂给监控系统做采集' },
        { cmd: 'rabbitmq-diagnostics ping', desc: '健康检查探针，返回 `Ping succeeded` 即正常' }
      ],
      notes: [
        '`File Descriptors` 用满会报 `too many open files`，新连接被拒，需要调大 systemd 的 `LimitNOFILE` 后重启',
        '`Disk space` 低于 `disk_free_limit`（默认 50MB）会触发**流控**，生产者的 publish 会被阻塞，本站仿真里 `/data` 盘已 100%，这类问题很常见',
        '`Alarms` 里有 `memory` 或 `disk` 说明节点已经限制生产者，这是「消息发不进去」的常见根因',
        '`cluster_status` 的 `Partitions` 非空表示网络分区（脑裂），要人工介入处理，不能等它自愈',
        'RAM 节点只存元数据副本（队列内容仍在磁盘），全集群都是 RAM 节点时重启会丢元数据，生产至少两个 disc 节点',
        '容器里 `rabbitmqctl` 要带 `-n rabbit@<容器主机名>`，否则会报找不到节点'
      ],
      related: ['db-rabbit-list-queues', 'db-rabbit-connections', 'db-rabbit-plugins'],
      docs: 'https://www.rabbitmq.com/docs/man/rabbitmqctl.8',
      tags: ['RabbitMQ', '节点', '健康检查']
    },

    /* ---------- 50 / 56 ---------- */
    {
      id: 'db-rabbit-list-queues',
      name: 'rabbitmqctl list_queues',
      alias: ['list_queues', '消息积压', 'messages_ready', 'unacked'],
      level: 2,
      syntax: 'rabbitmqctl list_queues [-p <vhost>] [--formatter json] <列名...>',
      summary: '按队列看消息积压与消费者数量，MQ 堆积排查的第一条命令。',
      desc: '不指定列名时只输出队列名与消息总数，一定要显式指定列才看得出问题。最关键的三列：`messages_ready`（**已就绪待投递**，说明没有消费者或消费不过来）、`messages_unacknowledged`（**已投递但未确认**，说明消费者拿到消息后卡住或处理慢）、`consumers`（消费者数量，为 0 就是**没有任何消费者在消费**，积压会无限增长）。**判读顺序**：先看 `consumers` 是不是 0（消费者掉了）→ 再看 `messages_ready` 是否持续增长（消费能力不足）→ 再看 `messages_unacknowledged` 是否很大（消费者处理慢或忘记 ack）→ 最后看 `messages`（总数）与 `message_bytes` 评估影响面。多 vhost 环境要用 `-p <vhost>` 指定，或用 `list_vhosts` 先看有哪些 vhost。',
      params: [
        { flag: 'name', desc: '队列名' },
        { flag: 'messages', desc: '消息总数（就绪 + 未确认）' },
        { flag: 'messages_ready', desc: '已就绪待投递的消息数，积压的核心指标' },
        { flag: 'messages_unacknowledged', desc: '已投递未确认的数，消费者卡住的信号' },
        { flag: 'consumers', desc: '消费者数量，为 0 表示没人消费' },
        { flag: 'message_bytes', desc: '队列消息占用的字节数，评估内存压力' },
        { flag: '-p <vhost>', desc: '指定虚拟主机，多租户环境必用' },
        { flag: '--formatter json', desc: '输出 JSON，便于监控采集' }
      ],
      examples: [
        { cmd: 'rabbitmqctl list_queues name messages messages_ready messages_unacknowledged consumers', desc: '一次拿到四个关键指标，排查看这一条就够' },
        { cmd: 'rabbitmqctl -p /orders list_queues name messages_ready consumers --formatter json', desc: '只看 orders 这个 vhost，JSON 输出便于脚本采集' },
        { cmd: 'rabbitmqctl list_queues name messages_ready | sort -k2 -rn | head -10', desc: '按就绪消息数倒序，找出积压最严重的 10 个队列' },
        { cmd: 'rabbitmqctl list_vhosts name', desc: '先确认有哪些 vhost，避免查错命名空间' }
      ],
      notes: [
        '`messages_ready` 大 = 没人消费或消费太慢；`messages_unacknowledged` 大 = 消费者拉走了却不 ack（处理卡住或代码漏了 ack）',
        '`consumers` 为 0 是最危险的：队列只进不出，积压会一直涨到触发流控或磁盘写满',
        '不指定列名时输出很简略，一定要显式写列，否则看不出积压结构',
        '多 vhost 环境不加 `-p` 默认看 `/`，很容易误判成「没有积压」',
        '积压的队列如果设置了 `x-max-length` 或 TTL，消息会被丢弃，排查前先确认队列参数（`rabbitmqctl list_queues name arguments`）',
        '`list_queues` 在队列数量极多（几万）时会较慢，监控采集注意频率'
      ],
      related: ['db-rabbit-status', 'db-rabbit-connections', 'db-kafka-consumer-groups'],
      docs: 'https://www.rabbitmq.com/docs/man/rabbitmqctl.8',
      tags: ['RabbitMQ', '积压', '队列']
    },

    /* ---------- 51 / 56 ---------- */
    {
      id: 'db-rabbit-plugins',
      name: 'rabbitmq-plugins enable',
      alias: ['rabbitmq-plugins', 'enable', 'management 插件', '15672'],
      level: 1,
      syntax: 'rabbitmq-plugins enable <插件名> / rabbitmq-plugins list',
      summary: '启用或关闭 RabbitMQ 插件，最常开的是 Web 管理界面。',
      desc: '`rabbitmq-plugins list` 列出全部插件及状态：`[E*]` 表示显式启用、`[e*]` 隐式启用（被其他插件依赖带起来的）、`[ ]` 未启用。最常用的三个：`rabbitmq_management`（Web 管理界面 + HTTP API，端口 **15672**）、`rabbitmq_shovel`（跨集群搬运消息）、`rabbitmq_federation`（联邦）。启用/禁用插件会**动态生效，不需要重启节点**，但会短暂影响服务（生成插件依赖关系）。注意企业版/社区版的功能差异：`rabbitmq_prometheus` 插件（社区版 3.8+ 自带）暴露 Prometheus 指标，端口 15692，接 Grafana 看板必备。集群环境要在**每个节点**上执行，或者用 `--online`/`--offline` 控制操作模式。',
      params: [
        { flag: 'list', desc: '列出所有插件及启用状态（`-E` 显式启用 / `-e` 隐式 / 空 未启用）' },
        { flag: 'enable <插件>', desc: '启用插件，动态生效不用重启' },
        { flag: 'disable <插件>', desc: '禁用插件' },
        { flag: '--all / --implicitly-enabled', desc: 'list 的过滤选项，只看启用中的插件' },
        { flag: '--online / --offline', desc: '在线模式（需要节点运行）或离线模式改配置' },
        { flag: 'rabbitmq_management', desc: 'Web 管理界面与 HTTP API（端口 15672）' },
        { flag: 'rabbitmq_prometheus', desc: '暴露 Prometheus 指标（端口 15692）' }
      ],
      examples: [
        { cmd: 'rabbitmq-plugins list', desc: '看哪些插件已启用，确认管理插件是否开着' },
        { cmd: 'rabbitmq-plugins enable rabbitmq_management', desc: '开启 Web 管理界面，之后访问 `http://<主机>:15672`' },
        { cmd: 'rabbitmq-plugins enable rabbitmq_prometheus', desc: '开启 Prometheus 指标端点（15692），接监控看板' },
        { cmd: 'rabbitmq-plugins list -E', desc: '只看显式启用的插件，快速核对清单' }
      ],
      notes: [
        '启用插件是动态生效的，**不需要重启节点**；如果报错说需要重启，通常是插件版本与 RabbitMQ 版本不匹配',
        '`rabbitmq_management` 默认账号 `guest/guest` **只允许本机登录**，生产必须新建管理员账号并限制来源（`rabbitmqctl add_user` + `set_permissions`）',
        '管理界面端口 15672 不要直接暴露到公网，安全组只放通内网或跳板机',
        '集群要在每个节点都启用插件（或用 `rabbitmq-plugins --node` 指定），只开一个节点会出现界面数据不全',
        '禁用被依赖的插件会连带停掉依赖它的插件，操作前先 `rabbitmq-plugins list --implicitly-enabled` 看清楚依赖关系'
      ],
      related: ['db-rabbit-status', 'db-rabbit-list-queues'],
      docs: 'https://www.rabbitmq.com/docs/man/rabbitmq-plugins.8',
      tags: ['RabbitMQ', '插件', '管理界面']
    },

    /* ---------- 52 / 56 ---------- */
    {
      id: 'db-rabbit-connections',
      name: 'rabbitmqctl list_connections / list_channels',
      alias: ['list_connections', 'list_channels', '连接排查', 'channel'],
      level: 2,
      syntax: 'rabbitmqctl list_connections [列...] / rabbitmqctl list_channels [列...]',
      summary: '看客户端连接与信道状态，查连接泄漏、阻塞与消费异常。',
      desc: 'RabbitMQ 的结构是「连接（connection）→ 信道（channel）」，一个 TCP 连接上可以开多个信道，业务操作都在信道上。`list_connections` 常用列：`name`、`user`、`peer_host`/`peer_port`（来源）、`state`（`running`/`blocked`/`blocking`）、`channels`（信道数）、`send_pend`（待发送字节，积压说明网络慢）。`state` 出现 `blocked` 说明触发**资源告警流控**（内存或磁盘不够），生产者的消息会被挂住——这是「消息发不进去」的头号原因。`list_channels` 常用列：`name`、`number`（信道号）、`consumer_count`（消费者数）、`messages_unacknowledged`（未确认消息数）、`prefetch_count`、`state`。`messages_unacknowledged` 长期很大的信道就是「消费慢」的元凶。',
      params: [
        { flag: 'list_connections name user peer_host state channels', desc: '连接清单与状态，看谁连了多少' },
        { flag: 'state', desc: '`running` 正常、`blocked`/`blocking` 表示被流控' },
        { flag: 'send_pend', desc: '待发送字节数，持续很大说明网络或客户端消费慢' },
        { flag: 'list_channels name number consumer_count', desc: '信道清单与消费者数量' },
        { flag: 'messages_unacknowledged', desc: '信道级未确认消息数，定位消费卡在哪' },
        { flag: 'prefetch_count', desc: '预取数量，太大容易造成消息堆在单个消费者' },
        { flag: '--formatter json', desc: 'JSON 输出，便于监控采集' }
      ],
      examples: [
        { cmd: 'rabbitmqctl list_connections name user peer_host state channels', desc: '看所有连接的来源与状态，找连接泄漏' },
        { cmd: 'rabbitmqctl list_connections peer_host state | grep -c running', desc: '统计正常连接数，与预期对比判断是否泄漏' },
        { cmd: 'rabbitmqctl list_channels name consumer_count messages_unacknowledged', desc: '看哪些信道积了一堆未确认消息，定位消费慢的实例' },
        { cmd: 'rabbitmqctl list_connections name state | grep blocked', desc: '检查是否有关键连接处于流控阻塞状态' }
      ],
      notes: [
        '连接 `state=blocked` 说明节点触发了内存/磁盘告警流控，先解决资源问题（`rabbitmqctl status` 的 Alarms），而不是去杀连接',
        '连接数暴涨通常是客户端没复用连接（每次操作新建 TCP 连接），要改客户端连接池配置',
        '`messages_unacknowledged` 长期不降说明消费者拉走消息后不 ack（代码异常或处理极慢），会拖住整个队列',
        '`prefetch_count` 设置过大会让消息全部堆在一个消费者上，其他消费者空闲，建议按处理能力设 10~100',
        '关闭连接用 `rabbitmqctl close_connection <连接名> "<原因>"`，会中断该客户端业务，执行前确认来源',
        '信道的 `name` 里包含连接 IP 与序号，排查时可以据此定位到具体应用实例'
      ],
      related: ['db-rabbit-status', 'db-rabbit-list-queues'],
      docs: 'https://www.rabbitmq.com/docs/monitoring',
      tags: ['RabbitMQ', '连接', '信道']
    },

    /* ================= G. RocketMQ（4 条） ================= */

    /* ---------- 53 / 56 ---------- */
    {
      id: 'db-rocket-cluster',
      name: 'mqadmin clusterList',
      alias: ['mqadmin clusterList', '集群状态', 'broker 列表'],
      level: 2,
      syntax: 'sh mqadmin clusterList -n <NameServer地址:9876>',
      summary: '列出 RocketMQ 集群的 broker 与实时 TPS，确认集群是否完整。',
      desc: '`mqadmin` 是 RocketMQ 发行包 `bin/` 目录下的运维工具，几乎每个子命令都要用 `-n` 指定 **NameServer 地址**（默认端口 9876，多个用分号分隔，如 `-n "10.0.1.31:9876;10.0.1.32:9876"`）。`clusterList` 输出每个 broker 的集群名、broker 名、broker ID（`0` 是 Master，非 0 是 Slave）、地址、版本、`InTPS`/`OutTPS`（生产/消费 TPS）、`InMsgCntToday`（当日消息量）、`PageCacheLockTimeMills`（页缓存锁定等待时间，持续很大说明磁盘写入跟不上）。排查要点：① 同一个 broker 名的 Master/Slave 是否都在（缺 Slave 说明没有冗余）；② TPS 是否明显不均衡（负载倾斜）；③ 有没有 broker 的版本与其他不一致（滚动升级中断）。',
      params: [
        { flag: '-n <地址:9876>', desc: 'NameServer 地址，多个用分号分隔（几乎所有子命令都要）' },
        { flag: '-m, --moreStats', desc: '显示更多统计信息' },
        { flag: '-i, --interval <秒>', desc: '持续刷新显示，相当于 `top` 模式' },
        { flag: '-c <集群名>', desc: '只显示指定集群的 broker' },
        { flag: '-h', desc: '查看该子命令的全部参数' }
      ],
      examples: [
        { cmd: 'sh mqadmin clusterList -n 127.0.0.1:9876', desc: '看集群 broker 清单与实时 TPS，日常巡检第一条' },
        { cmd: 'sh mqadmin clusterList -n "10.0.1.31:9876;10.0.1.32:9876" -m', desc: '指定多个 NameServer 并显示更多统计（生产推荐多写几个）' },
        { cmd: 'sh mqadmin clusterList -n 127.0.0.1:9876 -i 5', desc: '每 5 秒刷新一次，观察 TPS 变化' },
        { cmd: 'sh mqadmin clusterList -n 127.0.0.1:9876 -c PROD_CLUSTER', desc: '只看指定集群的 broker，多集群环境用' }
      ],
      notes: [
        '`-n` 是 NameServer 地址不是 broker 地址，写错会报连接超时（这是最常见的入门错误）',
        '`mqadmin` 在 RocketMQ 安装包的 `bin/` 目录，容器化部署要进容器或用脚本全路径执行',
        'broker ID 为 `0` 是 Master，非 `0` 是 Slave；同名 broker 只看到一个说明主从有一个掉了',
        '`InTPS` 突然掉到 0 说明生产者写不进来，先查 broker 日志与磁盘（RocketMQ 磁盘满会直接拒绝写入）',
        '`PageCacheLockTimeMills` 持续增大说明刷盘压力大，通常与磁盘性能或消息量突增有关',
        '4.x 与 5.x 的 `mqadmin` 参数略有差异（5.x 引入 Proxy 概念），用 `-h` 确认当前版本的参数'
      ],
      related: ['db-rocket-topic', 'db-rocket-consumer-progress'],
      docs: 'https://rocketmq.apache.org/docs/deploymentOperations/02admintool',
      tags: ['RocketMQ', '集群', '巡检']
    },

    /* ---------- 54 / 56 ---------- */
    {
      id: 'db-rocket-topic',
      name: 'mqadmin topicList / topicStatus',
      alias: ['mqadmin topicList', 'topicStatus', '队列位点'],
      level: 2,
      syntax: 'sh mqadmin topicList -n <NameServer:9876> / sh mqadmin topicStatus -n <NameServer:9876> -t <主题>',
      summary: '列出全部主题并查看某主题各队列的消息位点与更新时间。',
      desc: '`topicList` 列出集群上所有主题名（含系统主题 `TBW102`、`SELF_TEST_TOPIC`、`SCHEDULE_TOPIC_XXXX`、`RMQ_SYS_TRANS_HALF_TOPIC` 等，业务主题一般只看自己命名规范的）。`topicStatus -t <主题>` 输出该主题**每个消息队列**的详情：`brokerName`、`QID`（队列 ID）、`minOffset`（最小位点，被消费/过期清理后的起点）、`maxOffset`（最大位点，即写入总量）、`lastUpdateTimestamp`（该队列最后写入时间）、`lastUpdateTimestampFormat`。判读要点：① 所有队列的 `lastUpdateTimestamp` 都很旧 = **没有新消息写入**，生产端可能挂了；② `maxOffset` 在队列之间差异极大 = 消息分布倾斜（生产者指定了 key 或分区策略不合理）；③ `minOffset` 远小于 `maxOffset` 说明历史消息还没被清理（保留时间设置过长，占磁盘）。',
      params: [
        { flag: 'topicList -n <NS>', desc: '列出全部主题名' },
        { flag: 'topicStatus -n <NS> -t <主题>', desc: '查看该主题各队列的位点与最后写入时间' },
        { flag: '-c <集群名>', desc: '限定集群' },
        { flag: '-t <主题名>', desc: '指定主题（topicStatus 必填）' },
        { flag: 'updateTopic -n <NS> -b <broker> -t <主题>', desc: '在指定 broker 上创建/更新主题（另一种建 topic 的方式）' },
        { flag: 'deleteTopic -n <NS> -t <主题> -c <集群>', desc: '删除主题（危险操作）' }
      ],
      examples: [
        { cmd: 'sh mqadmin topicList -n 127.0.0.1:9876', desc: '列出集群所有主题，确认业务主题是否存在' },
        { cmd: 'sh mqadmin topicStatus -n 127.0.0.1:9876 -t TopicOrderEvent', desc: '看该主题各队列的最大/最小位点与最后写入时间' },
        { cmd: 'sh mqadmin topicStatus -n 127.0.0.1:9876 -t TopicOrderEvent | grep -E "brokerName|maxOffset|lastUpdateTimestamp"', desc: '只看关键列，判断消息是否还在持续写入' },
        { cmd: 'sh mqadmin updateTopic -n 127.0.0.1:9876 -c PROD_CLUSTER -t TopicOrderEvent -r 8 -w 8', desc: '在集群所有 broker 上创建主题并指定读写队列数' }
      ],
      notes: [
        '`topicStatus` 需要主题已经创建；报 `topic not exist` 说明主题没建或建在了别的集群',
        '`lastUpdateTimestamp` 长时间不更新意味着没有新消息写入，先查生产者而不是查 RocketMQ',
        '`minOffset` 与 `maxOffset` 的差值就是还留在磁盘上的消息量，保留时间由 broker 的 `fileReservedTime` 控制（默认 72 小时）',
        '`deleteTopic` 会**删除主题及其消息**，且不可恢复，生产执行前必须确认主题名与集群',
        'RocketMQ 4.x 的主题要在每个 broker 上创建或用 `updateTopic -c <集群>` 批量创建，5.x 推荐用 mqadmin 的集群级操作',
        '系统主题（`RMQ_SYS_` 开头、`SCHEDULE_TOPIC_` 等）不要手工改动，会影响延时消息与事务消息'
      ],
      related: ['db-rocket-cluster', 'db-rocket-consumer-progress'],
      docs: 'https://rocketmq.apache.org/docs/deploymentOperations/02admintool',
      tags: ['RocketMQ', '主题', '位点']
    },

    /* ---------- 55 / 56 ---------- */
    {
      id: 'db-rocket-consumer-progress',
      name: 'mqadmin consumerProgress',
      alias: ['consumerProgress', '消费积压', 'diff', '消费进度'],
      level: 3,
      syntax: 'sh mqadmin consumerProgress -n <NameServer:9876> -g <消费组>',
      summary: '看消费组在每个队列上的消费进度与积压条数，定位堆积源头。',
      desc: '输出每行一个队列：`brokerName`、`queueId`、`brokerOffset`（broker 上的最新位点，即写入总量）、`consumerOffset`（消费组已消费到的位点）、`diff`（**积压条数 = brokerOffset − consumerOffset**）、`lastTimestamp`（最后消费时间）。**排查顺序**：① 先看 `diff` 总量，确认是否真的积压；② 看积压是否集中在少数几个队列（说明消费端某个消费者实例慢或掉了，触发 rebalance 后不均）；③ 看 `lastTimestamp` 是否为「今天」（长时间没更新说明消费者根本没在跑）；④ 用 `consumerConnection -g <组>` 看在线消费者实例与订阅关系；⑤ 用 `consumerStatus -g <组> -i <客户端ID>` 看消费者内部各队列的处理情况。加 `-s` 可以列出该组订阅的所有主题的积压概览。',
      params: [
        { flag: '-n <地址:9876>', desc: 'NameServer 地址（必填）' },
        { flag: '-g <消费组>', desc: '消费组名（必填）' },
        { flag: '-s', desc: '显示该组订阅的所有主题的积压概览' },
        { flag: 'diff', desc: '积压条数 = brokerOffset − consumerOffset，核心指标' },
        { flag: 'lastTimestamp', desc: '最后消费时间，判断消费者是否还活着' },
        { flag: 'consumerConnection -g <组>', desc: '看组内在线消费者实例（配套命令）' },
        { flag: 'consumerStatus -g <组> -i <客户端ID>', desc: '看消费者内部各队列的处理状态（配套命令）' },
        { flag: 'resetOffsetByTime -g <组> -t <主题> -s <时间戳>', desc: '按时间重置消费位点（危险操作）' }
      ],
      examples: [
        { cmd: 'sh mqadmin consumerProgress -n 127.0.0.1:9876 -g ORDER_CONSUMER_GROUP', desc: '看订单消费组各队列的积压条数，diff 一列是重点' },
        { cmd: 'sh mqadmin consumerProgress -n 127.0.0.1:9876 -g ORDER_CONSUMER_GROUP -s', desc: '看该组订阅的所有主题的积压概览，先定位是哪个主题堆了' },
        { cmd: 'sh mqadmin consumerConnection -n 127.0.0.1:9876 -g ORDER_CONSUMER_GROUP', desc: '积压大时先确认消费者实例是否都在线（不在线就是实例挂了）' },
        { cmd: 'sh mqadmin consumerProgress -n 127.0.0.1:9876 -g ORDER_CONSUMER_GROUP | awk \'$4+0 > 1000 {print $1, $2, $4}\'', desc: '筛出积压超过 1000 条的队列，快速定位热点队列' }
      ],
      notes: [
        '积压先分两类：**消费者不在线**（`consumerConnection` 查不到实例，是进程/网络问题）还是**消费太慢**（实例在线但 `diff` 一直涨，是处理能力问题）',
        '积压集中在少数队列通常是消费者实例数量与队列数不匹配，或 rebalance 后分配不均，不是 RocketMQ 本身的问题',
        '`diff` 为负数（consumerOffset 大于 brokerOffset）说明位点异常，常见于重置位点或 broker 数据被清理',
        '`resetOffsetByTime` 会**改变消费位点**，可能造成大量消息被重复消费或漏消费，执行前必须与业务确认',
        'RocketMQ 的消息保留由 `fileReservedTime` 控制（默认 72 小时），积压超过保留时间后消息会被物理删除，此时积压会「自动消失」但数据已丢',
        '生产环境建议把 `diff` 接入监控告警，别等到磁盘写满才发现积压'
      ],
      related: ['db-rocket-cluster', 'db-rocket-topic', 'db-kafka-consumer-groups'],
      docs: 'https://rocketmq.apache.org/docs/deploymentOperations/02admintool',
      tags: ['RocketMQ', '积压', '消费进度']
    },

    /* ---------- 56 / 56 ---------- */
    {
      id: 'db-mysqldumpslow',
      name: 'mysqldumpslow',
      alias: ['mysqldumpslow -s t', '慢查询聚合', '慢日志归并'],
      level: 2,
      syntax: 'mysqldumpslow [-s <排序字段>] [-t <条数>] [-g <模式>] [-a] <慢日志文件>',
      summary: '把慢查询日志按"同类 SQL"归并，排出最该优化的那几条。',
      desc: '慢日志是**流水账**：同一条 SQL 带不同参数可能刷出几万行，直接看根本看不出重点。`mysqldumpslow` 做的是**归并同类项** —— 把参数替换成 `N`、把 `IN (...)` 折叠，然后按次数或总耗时排序，输出"这类 SQL 一共执行了多少次、平均/累计/最大耗时多少"。\n\n**它和 `pt-query-digest` 的分工**：`mysqldumpslow` 是 MySQL 自带、无需安装、输出朴素；`pt-query-digest` 是 Percona 的增强版，能做百分位、能按用户/库分组、能出报表。**手上只有一台裸机时的第一选择是它**，因为它一定存在。\n\n**两个关键选项**：`-s t` 按总耗时排（找"最拖垮系统"的），`-s c` 按出现次数排（找"最频繁"的）。这两个视角经常指向不同的 SQL：一条偶发的全表扫描 vs 一条每秒几百次的索引扫描，都得治。',
      params: [
        { flag: '-s <字段>', desc: '排序：`t`=总耗时、`at`=平均耗时、`c`=次数、`l`=锁时间、`r`=返回行数、`al`/`ar` 是平均版' },
        { flag: '-t <N>', desc: '只输出前 N 条，实务上永远配合 `-t` 用，否则刷屏' },
        { flag: '-g <模式>', desc: '只统计匹配该模式的 SQL（会当作正则处理），用于聚焦某个业务表' },
        { flag: '-a', desc: '不把数字抽象成 N —— 想看真实参数时加，但会削弱归并效果' },
        { flag: '-r', desc: '反转排序顺序（配合 `-s` 用）' },
        { flag: '-n <N>', desc: '名称里至少要有 N 个数字才抽象成 N，影响归并粒度' }
      ],
      examples: [
        { cmd: 'mysqldumpslow -s t -t 10 /var/log/mysql/slow.log', desc: '按**总耗时**排前 10 条 —— 先治最花时间的那几条' },
        { cmd: 'mysqldumpslow -s c -t 10 /var/log/mysql/slow.log', desc: '按**出现次数**排前 10 条 —— 高频 SQL 往往比偶发的更值得加索引' },
        { cmd: 'mysqldumpslow -s at -t 10 /var/log/mysql/slow.log', desc: '按平均耗时排，找出"单次就慢得离谱"的 SQL' },
        { cmd: 'mysqldumpslow -a -g "order" -s t -t 5 /var/log/mysql/slow.log', desc: '只看 order 相关 SQL 且保留真实参数，聚焦排查某个业务' }
      ],
      notes: [
        '⚠️ **本教学终端不模拟 `mysqldumpslow`**（它要读真实的慢日志文件目录）。真机上执行；慢日志本身要看哪些字段、`long_query_time` 怎么设，见 `db-mysql-slowlog`；拿到慢 SQL 后的下一步是 `EXPLAIN`（见 `db-mysql-explain`）。',
        '**必须先开慢日志**：`slow_query_log=ON` + `long_query_time`（默认 10 秒太宽松，线上一般 0.5~1 秒）。没开的话这个命令没有输入。',
        '默认会把数字抽象成 `N`、字符串抽象成 `S`，所以看不到真实参数 —— 想精确看某一条加 `-a`，但归并效果会变差',
        '它**不做百分位统计**，要 P95/P99 得上 `pt-query-digest`（见 `db-mysql-pt-query-digest`）',
        '日志很大时先 `wc -l` 看看量级；几个 G 的慢日志可以直接按天切分再分析，别一条命令啃到底',
        '优化顺序建议：先看 `-s c` 的高频（加索引收益最直接），再看 `-s t` 的总耗时大户（可能是架构问题，如缺分页、笛卡尔积）'
      ],
      related: ['db-mysql-slowlog', 'db-mysql-pt-query-digest', 'db-mysql-explain', 'db-mysql-processlist', 'db-mysql-innodb-status'],
      docs: 'https://dev.mysql.com/doc/refman/8.0/en/mysqldumpslow.html',
      tags: ['MySQL', '慢查询', '性能', 'SQL优化']
    }
  );
})();
