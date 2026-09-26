/* ==========================================================================
   data/cards-linux.js · 「每日一练」Linux 地基部分（分类 01~06）
   --------------------------------------------------------------------------
   覆盖：linux-basic 15 张、linux-text 12 张、linux-user 13 张、
         linux-net 15 张、linux-storage 10 张、shell 10 张，共 75 张。

   写卡前请先读 data/cards.js 顶部的字段契约，本文件照抄它的质量线：
     · 背面不抄 summary，只回答"为什么现在该用这条、而不是旁边那条"
     · why 给可验证的判据（某个字段/某句报错），contrast 给反向排除
     · run 是引擎真跑得通的命令（已用 tools/card-check.js 逐条验证）
     · diagnose 卡的正面用用户的话说现象，不出现答案里的命令名

   run 全部跑在 data/termfs.js 的虚拟环境上（/data 故意 100%、inode 100%、
   app.log 很大、/etc/crontab 与两个脚本都是真实可读的），卡片判据与这些
   故障数据是相互呼应的。
   ========================================================================== */
(function () {
  'use strict';

  window.CC_CARDS = window.CC_CARDS || [];

  /* ==================================================================
     01 · Linux 基础与文件操作（linux-basic）15 张
     ================================================================== */
  window.CC_CARDS.push(

    {
      id: 'card-lb-ls-recent-change',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 1,
      front: '线上刚出问题，你要先知道**这个目录里最近被动过的是哪个文件**，而不是从最早的记录开始翻。',
      hint: '让列表按"改动时间"倒着排，最新的顶到第一行。',
      answer: 'ls -lht /var/log/nginx',
      why: '`-t` 按修改时间倒序（最新在最上）、`-h` 人类可读、`-l` 给出大小与时间。判据：第一行就是 `access.log`（09:43，46.0M）—— 与"事故刚发生"的时间对得上；如果第一行还是昨天的文件，说明你找错目录了。',
      contrast: '`ls -l` 默认按**文件名**排序，时间信息在但看不出先后；按访问时间排用 `-u`、按元数据变更时间（权限/属主）用 `-c`，三者不同；目录里文件成千上万时 `ls` 会截断或很慢，改用 `find . -mmin -10 -type f` 更精确；脚本里解析 `ls` 的输出是禁忌（列宽会变），要属性请用 `find`/`stat`。',
      run: 'ls -lht /var/log/nginx',
      cmdIds: ['lb-ls', 'lb-stat', 'lb-tail'],
      lesson: 'ls-time',
      tags: ['文件', '时间', '排查']
    },

    {
      id: 'card-lb-find-mtime-old',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 2,
      front: '备份目录每周涨好几 G，你要按"最后修改时间"挑出**两天以前**的老包，而不是靠文件名里的日期猜。',
      hint: '按文件的某个属性去筛，而不是先全部列出来再肉眼挑。',
      answer: 'find /data/backup -type f -mtime +1',
      why: '`-mtime +1` 是"修改时间超过 1×24 小时"：`+` 表示大于、`-` 表示小于、不带符号是"正好第 n 天"。判据：这台机器上它只命中 `www-2024-03-16.tar.gz` —— 03-17、03-18 的包都不会被选中，正好符合"清两天前的"。`-type f` 顺手排除同名目录。',
      contrast: '`-mtime` 按**天**向下取整比较，要按分钟用 `-mmin +60`；要"比某个文件更新"用 `-newer`。注意文件名里的日期和真实 mtime 可以不一致（拷贝、解包、`touch` 都会改），所以先用 `-print`（默认行为）空跑一遍确认清单，再挂 `-delete` 或 `-exec`；删之前也顺手 `ls -l` 看大小，别把当天那个还在写的包删了。',
      run: 'find /data/backup -type f -mtime +1',
      cmdIds: ['lb-find', 'lb-rm', 'lb-ls'],
      lesson: 'basic-copy-move',
      tags: ['文件', 'find', '清理']
    },

    {
      id: 'card-lb-tail-f-follow',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 2,
      front: '服务正在报错，你要盯着日志看**新冒出来**的行，同时不想让满屏的历史记录把有用信息冲走。',
      hint: '既要"跟住文件"，又要先限定只看多少行。',
      answer: 'tail -f -n 100 /data/app/logs/app.log',
      why: '`-f` 让命令不退出、持续输出追加进来的内容，`-n 100` 先把上下文限定在最后 100 行。判据：真机上这条命令会一直挂着不返回，只有 Ctrl+C 才停 —— 如果它立刻退出，说明文件根本没在被写，而不是"没有报错"。',
      contrast: '**日志被切割（logrotate）后 `-f` 会跟丢**：它跟的是文件描述符（旧 inode），新日志写到新文件，屏幕就再也不动了 —— 这时要用 `-F`（大写），它按**文件名**重开并重试。看历史用 `tail -n 100`（不加 `-f`），想看开头那几行用 `head`；日志文件很大时别用 `cat`（会把整个文件喷到终端）。',
      run: 'tail -f -n 100 /data/app/logs/app.log',
      cmdIds: ['lb-tail', 'lb-head', 'lb-less', 'mo-log-tail'],
      lesson: 'tail-follow',
      tags: ['日志', '排障', 'tail']
    },

    {
      id: 'card-lb-file-identify',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 1,
      front: '同事丢过来一个没有任何后缀的文件，你要先判断它是脚本、二进制还是文本，再决定用什么方式打开。',
      hint: '不用读完，只看文件开头那一小段"魔数"。',
      answer: 'file /opt/scripts/backup.sh',
      why: '`file` 只读文件头几个字节做特征匹配，不改文件、也不把内容喷到终端。判据：输出 `Bourne-Again shell script, ASCII text executable` —— 末尾那个 `executable` 说明它**同时带可执行位**，可以直接 `./` 运行。',
      contrast: '直接 `cat` 一个二进制会把终端刷成乱码（真机上还可能把终端编码搞坏，得 `reset` 才好）；`stat` 给的是权限、属主、大小、时间这些**属性**，"这是什么类型"它答不了；`ls -l` 第一列只能看出有没有执行位，看不出文件类型；`file` 用的是特征库，遇到少见格式会只报 `data`，不代表文件坏了。',
      run: 'file /opt/scripts/backup.sh',
      cmdIds: ['lb-file', 'lb-stat', 'lb-cat-a'],
      lesson: 'basic-perm-tree',
      tags: ['文件', '类型', '排查']
    },

    {
      id: 'card-lb-which-real-binary',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 1,
      front: '机器上装过两个版本的同名程序，重启后行为变了，你要确认敲下命令时**实际被执行的是哪个文件**。',
      hint: 'PATH 是从左往右找的，第一个命中的就是答案。',
      answer: 'which nginx',
      why: '`which` 按 `PATH` 从左到右找**第一个**命中的可执行文件并打印绝对路径。判据：输出 `/usr/sbin/nginx` —— 如果它落在 `/usr/local/sbin/nginx`（在 PATH 里更靠前），那你改 `/etc/nginx` 下的配置当然不生效。',
      contrast: '`which` 看不到 **shell 别名和函数**（`alias ll="ls -l"` 时它会说找不到），要连别名一起看用 `type` 或 `command -v`；装完新版本后 shell 会缓存路径，`hash -r` 清一下再试；真机上"运行中的进程到底跑的是哪份"最权威的是 `ls -l /proc/<PID>/exe`。',
      run: 'which nginx',
      cmdIds: ['lb-which', 'lb-whereis', 'lb-type'],
      tags: ['命令', 'PATH', '排查']
    },

    {
      id: 'card-lb-stat-three-times',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 2,
      front: '配置文件的**权限**好像被人动过，但 `ls -l` 显示的时间还是上周，你想确认这事到底有没有发生。',
      hint: '一个文件有三个时间戳：被读过、内容变了、属性变了。',
      answer: 'stat /data/app/config.yaml',
      why: '`stat` 一次给全三个时间：Access（最后被读取）、Modify（**内容**最后修改）、Change（**元数据**最后变更：权限、属主、链接数）。判据：**Change 比 Modify 新**就说明内容没动、动的是权限或属主 —— 只看 Modify 会得出"没人碰过"的错误结论。输出里还能直接读到八进制权限（这里 `0640`）与 `Uid/Gid`。',
      contrast: '`ls -l` 只显示 Modify，而且默认只精确到分钟；`ls -lc` 看 ctime、`ls -lu` 看 atime；脚本里取值用 `stat -c "%y %z %a"`。注意很多挂载点带 `noatime`（本机 `/data` 就是 `rw,noatime`），atime 基本不更新，别拿它当"谁读过这个文件"的证据。',
      run: 'stat /data/app/config.yaml',
      cmdIds: ['lb-stat', 'lu-stat', 'ls9-fstab'],
      lesson: 'basic-perm-tree',
      tags: ['文件', '时间戳', '排查']
    },

    {
      id: 'card-lb-symlink-opt',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 2,
      front: '同事说应用在 `/opt/myapp`，可你改了里面的配置，另一条路径下的文件也跟着变了；把 `/opt/myapp` 整个删掉，数据居然还在。',
      hint: '那个"目录"可能只是一张写着真实位置的便签。',
      answer: 'ls -l /opt',
      why: '输出里 `myapp -> /data/app` 说明它是**符号链接**：第一列以 `l` 开头、行尾带箭头，本体只是个别名，真正的数据在 `/data/app`。判据：看到 `->` 就别在它上面做删除或覆盖操作，先顺着箭头找到真身，再决定动谁。',
      contrast: '创建链接时**一定用绝对路径**：`ln -s app /opt/myapp` 这样的相对目标会相对**链接所在目录**解析，链接一挪就断；硬链接（不加 `-s`）不能指向目录、不能跨文件系统，但删掉任一名字数据都还在（链接数 −1）；软链接删的只是别名，目标被删后链接就断（访问报 No such file or directory，`ls -l` 里目标会标红）。',
      run: 'ls -l /opt',
      cmdIds: ['lb-ln', 'lb-readlink', 'lb-realpath', 'lb-find'],
      tags: ['软链接', 'ln', '文件']
    },

    {
      id: 'card-lb-pwd-cwd',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 2,
      front: '脚本用了相对路径，手动执行一切正常，被定时任务调起来之后结果完全不同 —— 你要先确认它**到底在哪个目录里干活**。',
      hint: '相对路径的基准不是脚本所在目录，而是进程的工作目录。',
      answer: 'cd /data/app && pwd',
      why: '相对路径一律以**当前工作目录（cwd）**为基准，而 cwd 由"谁启动了这个进程"决定：手动执行时是你所在的目录，cron 起来时是用户家目录，systemd 起来时由 `WorkingDirectory=` 决定（不写就是 `/`）。判据：把 `pwd` 插进脚本打印一次，输出和你以为的目录不一致，就是它。',
      contrast: '`cd` 是 shell 内置命令，`sudo cd /data/app` 一定失败（sudo 只能给外部命令提权）；脚本里要写 `cd /data/app || exit 1`（或开头 `set -e`），否则 `cd` 失败后后面所有相对路径都落在旧目录上，`rm -rf` 这类操作会删错地方；要"相对脚本自身"定位，用脚本所在目录而不是 cwd。',
      run: 'cd /data/app && pwd',
      cmdIds: ['lb-pwd', 'lb-cd', 'sh-template-backup'],
      lesson: 'ci-git-commit-config',
      tags: ['目录', '脚本', '排障']
    },

    {
      id: 'card-lb-mv-cross-filesystem',
      cat: 'linux-basic',
      kind: 'diagnose',
      level: 2,
      front: '同样是"把 30G 目录从 A 挪到 B"，同事那边几秒就完了，你敲的却跑了十几分钟 —— 差别可能不在命令，而在**这两条路径是不是同一个文件系统**。',
      hint: '同一个分区内，"移动"只改一个名字。',
      answer: 'mv 同分区是改目录项（瞬间），跨分区是"复制 + 删除"（很慢）',
      why: '`mv` 在同一文件系统内只改 inode 里的目录项，一个字节的数据都不搬，所以 30G 也是瞬间；跨文件系统（比如 `/home` 与 `/data` 分属两块盘）就只能真的复制再删源。判据：`df /home /data` 看两边的 Filesystem 是不是同一个设备 —— 不同就必然慢，而且中途失败会留下**半份数据**。',
      contrast: '跨盘搬大数据更稳的是 `rsync -a --remove-source-files`（可续传、可校验、失败可重跑）或 `tar | ssh` 管道；`cp` 默认不保留属主与时间（要 `-a`），而 `mv` 会尽量保留；`mv` 覆盖目标时不会问你，脚本里先用 `[ -e "$dst" ]` 判断，避免盖掉别人的文件；`mv` 到不存在的目录会报 No such file or directory —— 它是**改名**，不是帮你建目录。',
      run: 'mv /tmp/app.log /tmp/app.log.bak && ls -l /tmp',
      cmdIds: ['lb-mv', 'lb-cp', 'lb-rsync', 'ls9-df'],
      lesson: 'basic-copy-move',
      tags: ['文件', 'mv', '分区']
    },

    {
      id: 'card-lb-rm-r-dir',
      cat: 'linux-basic',
      kind: 'distinguish',
      level: 2,
      front: '删一个目录被拒绝，报错写着 `Is a directory` —— `-r`、`-rf`、`rmdir` 各自能删什么，`-f` 又到底"强制"了什么？',
      hint: '要区分"递归"和"不提示"这两件不同的事。',
      answer: 'rm -r <目录>（空目录可以用 rmdir，但它只删空目录）',
      why: '`rm` 默认只处理文件，遇到目录直接报 `Is a directory`；`-r` 才是"递归删除目录及其内容"。而 `-f` **不是"强制删除"开关**：它只关掉"文件不存在"和"是否确认"的提示，单独写 `-f` 仍然删不掉目录（同一个报错）。判据：报 `Is a directory` = 缺 `-r`；报 `Permission denied` = 权限或属主问题 —— 两者方向完全不同。',
      contrast: '`-rf` 无提示且不可恢复；脚本里写 `rm -rf "$DIR"/` 时如果 `DIR` 为空就会变成 `rm -rf /`（真机灾难），所以变量必须加引号并用 `set -u` / `"${DIR:?未设置}"` 挡住空值；目录里文件极多时 `rm -r` 很慢（要逐个 unlink），可以先 `mv` 到同分区的临时目录再后台删（rename 是瞬间的）。',
      run: 'rm -r /data/app/tmp && ls /data/app',
      cmdIds: ['lb-rm', 'lb-rmdir', 'sh-set-euo-pipefail'],
      lesson: 'basic-copy-move',
      tags: ['删除', '目录', '脚本']
    },

    {
      id: 'card-lb-redirect-append',
      cat: 'linux-basic',
      kind: 'distinguish',
      level: 2,
      front: '记录健康检查的脚本跑第二遍，日志文件里就只剩下最后一行了 —— 明明每一遍都往里写。',
      hint: '两个箭头，其中一个会先把文件清空。',
      answer: '>>（追加）而不是 >（覆盖）',
      why: '`>` 打开文件时带 **O_TRUNC，先把文件长度截成 0**，再写入本次输出；`>>` 是 O_APPEND，永远写在末尾。判据：文件大小从几十 KB 突然变成一行（`ls -l` 看大小、`wc -l` 看行数），就是被截断过 —— 而不是"写入失败"。',
      contrast: '更危险的是手滑把 `>` 用在配置文件上（`echo ... > /etc/fstab` 会清空它，Linux 没有回收站，只能靠备份）；`2>&1` 的**位置**也有讲究：`cmd > f 2>&1` 才是标准输出和错误都进 f，写成 `cmd 2>&1 > f` 时错误仍然去了终端（重定向从左往右生效）；写日志固定用 `>> /var/log/xxx.log 2>&1`。',
      run: 'echo "[ops] manual trigger" >> /var/log/backup.log',
      cmdIds: ['sh-redirect', 'sh-tee-exec', 'lb-tee'],
      lesson: 'sh-stderr-log',
      tags: ['重定向', '日志', '脚本']
    },

    {
      id: 'card-lb-ls-ld-dir',
      cat: 'linux-basic',
      kind: 'distinguish',
      level: 1,
      front: '你想看 `/data` 这个目录**自己**的权限、属主和时间，可一条 `ls -l /data` 把里面几百个文件全倒了出来。',
      hint: '有个选项专门让它"别展开目录"。',
      answer: 'ls -ld /data',
      why: '`-d` 让目录只作为一条记录显示，不再展开内容。判据：输出**只有一行**、第一列以 `d` 开头（`drwxr-xr-x 5 root root 4096 ... /data`）—— 排查"这个目录谁能进、谁能写"看的就是这一行。',
      contrast: '目录那一列的 `4096` **不是**里面文件占了多少，它只是目录项自身占的块 —— 统计目录占用总和要用 `du -sh /data`；`-h` 必须和 `-l`（或 `-s`）同用，单写 `ls -h` 没有任何效果；`ls -lht` 按时间倒序、`ls -lhS` 按体积倒序，是判断"谁刚改过""谁最大"的两个常用组合。',
      run: 'ls -ld /data',
      cmdIds: ['lb-ls', 'ls9-du', 'lu-stat'],
      lesson: 'basic-perm-tree',
      tags: ['ls', '目录', '权限']
    },

    {
      id: 'card-lb-mkdir-p-idempotent',
      cat: 'linux-basic',
      kind: 'distinguish',
      level: 1,
      front: '部署脚本第二次执行就挂在这一行上，报 `File exists`，可目录本来就该存在。',
      hint: '有一个选项同时解决"父目录不存在"和"已经存在"两种情况。',
      answer: 'mkdir -p /data/app/logs',
      why: '`-p` 有两个作用：父目录缺失时**递归创建**，目标已存在时**静默成功**（幂等），退出码仍是 0。判据：不带 `-p` 时两种失败文本完全不同 —— `No such file or directory`（父目录不存在）与 `File exists`（目标已存在），而 `-p` 两个都不报。',
      contrast: '脚本里判断"目录在不在"应该用 `[ -d ... ]`，不要靠 `mkdir` 的报错来分支；需要连权限一起建（比如 750 的日志目录）用 `install -d -m 750 /data/logs`（真机上容器镜像里常用）；`mkdir` 建出来的是**当前用户**的目录，服务以别的用户运行时可能没权限写，建完顺手 `ls -ld` 看一眼属主。',
      run: 'mkdir -p /data/app/logs/2024/03 && ls /data/app/logs',
      cmdIds: ['lb-mkdir', 'lb-install', 'lb-touch'],
      lesson: 'basic-copy-move',
      tags: ['目录', '脚本', '幂等']
    },

    {
      id: 'card-lb-wc-lines',
      cat: 'linux-basic',
      kind: 'syntax',
      level: 1,
      front: '脚本要统计访问日志一共多少行 —— 只要行数，不要词数和字节数：\n\n  wc ____ /var/log/nginx/access.log',
      hint: '三个计数项里，哪一项对应"行"。',
      answer: '-l',
      why: '不带参数时 `wc` 一次给出 **行 / 词 / 字节** 三列，脚本再去 `awk "{print $1}"` 取值就依赖列顺序、很容易被改坏；`-l` 直接只输出行数。判据：输出形如 `15 /var/log/nginx/access.log` —— 一个数字加文件名。',
      contrast: '`-c` 是**字节**数（一行日志可能几百字节，`-c` 会比 `-l` 大两三个数量级）、`-w` 是词数；`grep -c` 数的是**匹配**的行数 —— "总数"用 `wc -l`，"符合条件的数"用 `grep -c`，用错场景时数字会莫名其妙地小。',
      run: 'wc -l /var/log/nginx/access.log',
      cmdIds: ['lb-wc', 'lt-grep', 'lt-awk'],
      lesson: 'lt-log-status-distribution',
      tags: ['文本', '统计', 'wc']
    },

    {
      id: 'card-lb-tar-list-first',
      cat: 'linux-basic',
      kind: 'syntax',
      level: 2,
      front: '收到一个 `.tar.gz` 备份包，你只想**看清单**、暂不解压（不想在当前目录多出一堆文件）：\n\n  tar ____ /data/backup/www-2024-03-17.tar.gz',
      hint: '三个字母分别回答：干什么、什么格式、操作哪个文件。',
      answer: '-tzf',
      why: '`t` = 列出清单、`z` = 先过 gzip 解压、`f` = 后面紧跟归档文件名。判据：输出是一行行路径（`var/www/html/index.html` …），而当前目录**没有任何新文件**产生 —— 这就是"先看清包里有什么"的正确姿势。',
      contrast: '少了 `z`（写成 `tar -tf`）对 `.tar.gz` 会报 `gzip: stdin: not in gzip format`；真正解包用 `-xzf`，而且很多包会把路径原样铺出来（有的带 `./`，甚至有绝对路径，直接解可能覆盖系统文件），所以**先 `-t` 再解**，必要时加 `-C /目标目录` 或 `--strip-components=1`；解压前顺手 `df -h` 确认目标分区放得下 —— 别把 2G 的包解到已经 100% 的 `/data` 上。',
      run: 'tar -tzf /data/backup/www-2024-03-17.tar.gz',
      cmdIds: ['lb-tar', 'lb-gzip', 'lb-gunzip'],
      lesson: 'basic-tar-backup',
      tags: ['压缩', 'tar', '备份']
    }

  );

  /* ==================================================================
     02 · 文本处理三剑客（linux-text）12 张
     ================================================================== */
  window.CC_CARDS.push(

    {
      id: 'card-lt-grep-status-500',
      cat: 'linux-text',
      kind: 'diagnose',
      level: 1,
      front: '用户报订单页报错，你要从那批访问日志里把**失败的请求**挑出来看特征。',
      hint: '日志里有一列专门记状态码，先按它筛。',
      answer: 'grep " 500 " /var/log/nginx/access.log',
      why: 'Nginx 默认格式里状态码是独立的一列，前后各有一个空格；把空格一起写进模式，可以避免误命中字节数里的 500 或 URL 里的 500。判据：命中的每一行第 9 列都是 500，这里输出 3 行（订单 8812 / 8813 / 8814），说明是同一类失败。',
      contrast: '按列精确比较用 `awk "$9==500"`（不受空格数量变化影响），要连 502/504 一起看用 `grep -E " (50[0-9]) "`；更稳的顺序是**先看分布再动手**：`awk "{print $9}" access.log | sort | uniq -c | sort -rn`，一上来就 grep 容易只盯着自己猜的那个状态码。',
      run: 'grep " 500 " /var/log/nginx/access.log',
      cmdIds: ['lt-grep', 'lt-awk', 'lt-nginx-status'],
      lesson: 'lt-log-status-distribution',
      tags: ['日志', 'grep', '排障']
    },

    {
      id: 'card-lt-grep-invert',
      cat: 'linux-text',
      kind: 'distinguish',
      level: 1,
      front: '日志里一大半是探针的健康检查，你要看**除它之外**的真实用户请求。',
      hint: '有个选项的语义是"反过来，只要不匹配的"。',
      answer: 'grep -v healthz /var/log/nginx/access.log',
      why: '`-v` 反转匹配：输出所有**不包含**该模式的行。判据：输出行数 = 总行数 − 匹配行数（本机 15 − 3 = 12 行），一眼就能核对有没有漏掉或漏排。',
      contrast: '多个排除条件要串起来写（`grep -v a | grep -v b`）或给多个 `-e 模式`；`-v` 是"**整行**不含"，不是"某一列不等于"，按列排除要用 `awk "$7!=\"/healthz\""`；另外记住 grep 的退出码：0 = 有匹配、1 = 无匹配，脚本里配 `set -e` 时"全被排除掉"会让脚本直接退出（要写 `|| true`）。',
      run: 'grep -v healthz /var/log/nginx/access.log',
      cmdIds: ['lt-grep', 'lt-nginx-top-ip', 'sh-set-euo-pipefail'],
      lesson: 'grep-invert',
      tags: ['grep', '日志', '过滤']
    },

    {
      id: 'card-lt-uniq-after-sort',
      cat: 'linux-text',
      kind: 'distinguish',
      level: 2,
      front: '统计每个客户端 IP 各请求了多少次，可数出来的结果里每个 IP 都只有 1 次。',
      hint: '那个负责计数的命令，只比较**相邻**的行。',
      answer: 'sort | uniq -c（顺序不能颠倒）',
      why: '`uniq` 只合并**相邻**的重复行：输入没排序时同一个 IP 被别的行隔开，于是每个都算一次，`-c` 出来的计数全是 1。判据：把中间结果接个 `| head` 看一眼 —— 没排序时同一个 IP 会分散出现多次，排序后就挨在一起了。',
      contrast: '`sort -u` 是"排序 + 去重"但**不给次数**；要 Top 榜就接 `| sort -rn | head`（`-n` 按数值排，否则 `10` 会排在 `9` 前面）；超大文件排序会落临时盘，`sort -T /data/tmp` 换到空间够的目录能避免 `/tmp` 被写满 —— 按 IP 计数这类活在大日志上更适合交给 awk 一次遍历完成。',
      run: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -4",
      cmdIds: ['lt-sort-column', 'lt-uniq', 'lt-awk-dedupe'],
      lesson: 'awk-topip',
      tags: ['统计', 'uniq', '管道']
    },

    {
      id: 'card-lt-grep-time-window',
      cat: 'linux-text',
      kind: 'diagnose',
      level: 2,
      front: '事故发生在 09:41 到 09:42 这两分钟里，日志文件很大，你要把**这个时间窗内的行**切出来发给同事。',
      hint: '两分钟的分钟数只差最后一位，一个字符类就能同时匹配。',
      answer: 'grep -E "09:4[12]" /data/app/logs/app.log',
      why: '`-E` 打开扩展正则，`[12]` 是字符类（匹配一个字符：1 或 2），所以一条模式同时覆盖 41 与 42 两分钟。判据：输出正好 4 行，且 09:40 与 09:43 的行都不出现 —— 条数对不上说明时间窗写错了。',
      contrast: '时间不连续（跨小时、跨天）时字符类会漏或误配，更严谨的是 `sed -n "/09:41/,/09:42/p"`（从起点模式到终点模式整段取）或用 awk 做真正的时间比较；**日志里的时间是本地时区**，容器时区不对时会白找；先用 `grep -c` 确认条数再往下做统计，别在 0 条的结果上分析半天。',
      run: 'grep -E 09:4[12] /data/app/logs/app.log',
      cmdIds: ['lt-grep', 'lt-egrep', 'lt-sed-address', 'lt-log-time-window'],
      lesson: 'grep-context',
      tags: ['日志', 'grep', '时间窗']
    },

    {
      id: 'card-lt-awk-vs-cut',
      cat: 'linux-text',
      kind: 'distinguish',
      level: 2,
      front: '从日志里取第一列，用 `cut` 切出来的却是空行或整体错位 —— 同样"按分隔符取列"，两个工具的差别在哪？',
      hint: '一个按"任意多个空白"分列，另一个按"你给的那一个字符"分列。',
      answer: "awk '{print $1}'",
      why: 'awk 默认的分隔符是**空白（连续空格/制表符算一个）**，还会自动忽略行首空白；`cut -d" "` 是按字符逐刀切，遇到两个连续空格就切出一个空字段，后面所有列号整体偏移。判据：`awk "{print NF}"` 看每行列数 —— 如果同一个日志文件里列数忽多忽少，就不适合用 `cut -d" "`。',
      contrast: '分隔符规范的文件（`/etc/passwd` 的 `:`、CSV 的 `,`、TSV 的 `\\t`）用 `cut -d` 更快更直观，取**固定字符位置**用 `cut -c`；非要用 cut 处理连续空白，得先 `tr -s " "` 把多个空格压成一个；要按列做条件过滤（`$9>=500`）只有 awk 能做，cut 没有判断能力。',
      run: "awk '{print $1}' /var/log/nginx/access.log | head -3",
      cmdIds: ['lt-awk', 'lt-cut', 'lt-tr', 'lt-awk-f'],
      lesson: 'lt-log-status-distribution',
      tags: ['文本', 'awk', 'cut']
    },

    {
      id: 'card-lt-awk-field-sep',
      cat: 'linux-text',
      kind: 'syntax',
      level: 1,
      front: '统计系统里每个账号的登录 shell（`/etc/passwd` 是冒号分隔的）：\n\n  awk ____ "{print $1, $7}" /etc/passwd',
      hint: '默认分隔符是空白，而这里的分隔符是另一个字符。',
      answer: '-F:',
      why: 'awk 默认以空白分列，面对 `root:x:0:0:...` 整行只会被当成一个字段，`$7` 直接输出空；`-F:` 指定冒号后才切得开。判据：不加 `-F` 时 `print $1, $7` 只有第一列、后面空着，`print NF` 是 1 而不是 7。',
      contrast: '分隔符本身是正则元字符时要小心（`-F.` 得写 `-F\\\\.`，多个候选写 `-F"[.:]"`）；`-F "\\t"` 与 `-F"\\t"` 在 shell 引号里的处理不同，写 `-F"\\t"` 最稳；`-F` 只影响输入分列，想把输出分隔符改成逗号要用 `OFS=","` 或 `printf`；分隔符跨多字符（如 `::`）时 `-F` 是按**单字符集**处理的，要整体匹配得用 `FS` 正则。',
      run: "awk -F: '{print $1, $7}' /etc/passwd",
      cmdIds: ['lt-awk-f', 'lt-cut', 'lt-awk-printf'],
      tags: ['文本', 'awk', '分隔符']
    },

    {
      id: 'card-lt-grep-count',
      cat: 'linux-text',
      kind: 'syntax',
      level: 1,
      front: '脚本要拿到"404 出现了多少条"，只要那个数字，不要匹配到的整行：\n\n  grep ____ " 404 " /var/log/nginx/access.log',
      hint: '有两个选项都不打印匹配行：一个给条数，一个给文件名。',
      answer: '-c',
      why: '`-c` 只输出**匹配的行数**（一行里命中多次也只算 1 行），不打印内容，日志再大也不会刷屏。判据：跳出来的只有一行计数，没有任何整行日志 —— 这正是脚本想直接喂给监控的形态。',
      contrast: '要数"出现次数"而不是"行数"，得 `grep -o 模式 | wc -l`；`-l` 是"只列文件名"、`-q` 是"只要退出码、什么都不打印"（最适合 `if` 判断）；**务必记住 grep 的退出码**：0 = 有匹配、1 = 无匹配、2 = 出错，所以拿到 0 条时退出码是 1，脚本里配 `set -e` 会把"没有 404"误判成失败，要写成 `|| true`。',
      run: 'grep -c " 404 " /var/log/nginx/access.log',
      cmdIds: ['lt-grep', 'lt-egrep', 'sh-set-euo-pipefail'],
      lesson: 'lt-log-status-distribution',
      tags: ['grep', '统计', '脚本']
    },

    {
      id: 'card-lt-jq-format',
      cat: 'linux-text',
      kind: 'distinguish',
      level: 2,
      front: '一份被压成一行的 JSON 配置，`cat` 出来糊成整整一行，看不清嵌套结构。',
      hint: '有个工具是"读懂 JSON"，而不是当普通文本处理。',
      answer: 'jq . /etc/docker/daemon.json',
      why: '`.` 表示整个文档，jq 会解析后按缩进重新排版，同时**顺手校验了一次 JSON 合法性**（解析失败直接报错）。判据：输出是 2 空格缩进的多行结构，字段顺序与原文一致 —— 不是随便换个工具打印，而是真的解析过了。',
      contrast: '取字段用 `.字段名`，**字段名里有连字符或点号时必须写成 `."log-driver"`**，否则 jq 报语法错误（这份 daemon.json 里几乎全是带连字符的键，全踩得上）；`-r` 去掉字符串的引号（喂 shell 变量用）、`-c` 反过来压成一行（喂别的程序用）；数组用 `.[]` 展开、`.[0]` 取第一个；YAML 要用 `yq`，别拿 jq 硬套。',
      run: 'jq . /etc/docker/daemon.json',
      cmdIds: ['lt-jq', 'lt-yq', 'sh-redirect'],
      lesson: 'lt-jq-json-fields',
      tags: ['JSON', 'jq', '配置']
    },

    {
      id: 'card-lt-grep-r-config',
      cat: 'linux-text',
      kind: 'diagnose',
      level: 2,
      front: '要改一个域名，你想先确认**配置目录里到底还有哪些文件引用了它**，一个个文件翻太慢。',
      hint: '让搜索自己走进子目录，并把行号带出来。',
      answer: 'grep -rn "web.example.com" /etc',
      why: '`-r` 递归进子目录、`-n` 带行号，输出是 `文件路径:行号:内容` 三段，能直接定位到"哪个文件的第几行"。判据：这里只有一处命中（`/etc/nginx/nginx.conf:22`），说明改一处就够；如果命中好几处，就得逐个确认是不是都要改。',
      contrast: '`-r` **不跟进符号链接指向的目录，`-R` 才跟进** —— 同一个目录两条命令的命中条数可能不同，别以为是缓存问题；搜索范围要收窄（`/etc`、`/opt`），全盘 `grep -r /` 会把 `/proc`、`/sys` 扫进去，又慢又刷一屏 Permission denied；只要文件名列表加 `-l`，排除版本库用 `--exclude-dir=.git`；查压缩过的旧日志用 `zgrep`。',
      run: 'grep -rn "web.example.com" /etc',
      cmdIds: ['lt-grep', 'lt-zgrep-r', 'lt-rg'],
      lesson: 'lt-log-status-distribution',
      tags: ['grep', '配置', '排查']
    },

    {
      id: 'card-lt-sed-inplace',
      cat: 'linux-text',
      kind: 'distinguish',
      level: 3,
      front: '要批量替换配置里的旧域名，同事特别强调：千万别写成 `sed "s/旧/新/" 文件 > 文件`。',
      hint: '重定向是在命令**开始执行之前**就把文件打开的。',
      answer: "sed -i.bak 's/旧/新/g' 文件",
      why: '`>` 由 shell 先打开并**截断**目标文件，sed 再去读它时读到的已经是空文件 —— 结果不是"替换失败"，而是**整个文件被清空**。`-i` 是 sed 自己写临时文件再改名覆盖，所以能安全就地修改，`-i.bak` 还会先留一份备份。判据：改完 `diff 文件.bak 文件` 应该只有你预期的那几行变化，`grep 旧域名 文件` 无输出、`grep 新域名 文件` 有输出。',
      contrast: '更稳的流程是"先看差异再落盘"：`sed "s/旧/新/g" f > /tmp/f.new && diff f /tmp/f.new`，确认无误再覆盖（本项目终端里可以先用 `sed ... f | grep 关键词` 预览结果）；GNU 与 BSD/macOS 的 `-i` **不兼容**（macOS 必须写 `-i ""`），跨平台脚本要分开处理；替换前确认没有程序正在写这个文件，配置热加载期间改文件可能被覆盖回去。',
      run: 'sed s/web.example.com/app.example.com/g /etc/nginx/nginx.conf | grep server_name',
      cmdIds: ['lt-sed', 'lt-sed-i'],
      lesson: 'mw-nginx-bad-conf',
      tags: ['sed', '配置', '替换']
    },

    {
      id: 'card-lt-tr-uppercase',
      cat: 'linux-text',
      kind: 'diagnose',
      level: 1,
      front: '同事给的清单里主机名大小写不一致，比对前你要把它们统一成大写；而且这类工具**不接文件名**，只能从管道喂。',
      hint: '它是按"字符"映射，不是按"字符串"替换。',
      answer: 'cat /etc/hostname | tr a-z A-Z',
      why: '`tr` 只从**标准输入**读数据（不接受文件参数），`a-z A-Z` 是字符集之间的逐字符映射。判据：输出变成 `WEB-PROD-01` —— 内容一个字符没丢，只是大小写被换掉了。',
      contrast: '`tr -d "\\r"` 是删掉 Windows 换行（`dos2unix` 的替代），`tr -s " "` 把连续空格压成一个（日志解析脚本的前置步骤）；它是**字符级**工具：`tr "ab" "xy"` 是把每个 a 换成 x、每个 b 换成 y，想做**字符串**替换必须用 sed；`tr` 也不认正则和数量词。',
      run: 'cat /etc/hostname | tr a-z A-Z',
      cmdIds: ['lt-tr', 'lt-dos2unix', 'lt-sed'],
      tags: ['文本', 'tr', '清理']
    },

    {
      id: 'card-lt-head-log-start',
      cat: 'linux-text',
      kind: 'diagnose',
      level: 2,
      front: '应用刚重启过一次，启动那一刻的信息（启动耗时、初始化失败原因）在文件**最前面**，可这个日志有 160M。',
      hint: '不用把整个文件读进来，只看开头几行就够。',
      answer: 'head -n 20 /data/app/logs/app.log',
      why: '`head` 读够 N 行就停止并退出，不会把 160M 整个读一遍（对比 `cat` 会把文件全量吐到终端）。判据：第一行正好是 `Started OrdersApplication in 8.42 seconds` —— 启动那一刻的信息；后面几条 ERROR 是运行期才出现的，能据此区分"启动就坏"和"跑一会儿才坏"。',
      contrast: '排查"**现在**在报什么"要看尾部（`tail -n 100`）；日志被 logrotate 切成多份后，最早的启动记录在 `app.log.1` 甚至 `app.log.2.gz` 里，别只看当前文件（压缩包用 `zcat app.log.2.gz | head`）；`-n` 默认 10，排查时通常显式写大一点；要"掐头去尾看中间"用 `sed -n "100,120p"`。',
      run: 'head -n 20 /data/app/logs/app.log',
      cmdIds: ['lb-head', 'lb-tail', 'lt-sed-print'],
      lesson: 'lt-dedupe-large-file-大文件去重',
      tags: ['日志', 'head', '排障']
    }

  );

  /* ==================================================================
     03 · 用户权限与系统管理（linux-user）13 张
     ================================================================== */
  window.CC_CARDS.push(

    {
      id: 'card-lu-systemctl-status',
      cat: 'linux-user',
      kind: 'diagnose',
      level: 1,
      front: '客户说页面打不开，你连端口都没看到在监听；在翻应用日志之前，先确认**服务管理器眼里这个服务是什么状态**。',
      hint: '先看结论行，再看 PID 和开机自启设置。',
      answer: 'systemctl status myapp',
      why: '一条命令给三件事：`Active:` 是结论（`active (running)` / `inactive (dead)` / `failed`）、`Main PID` 有值说明进程真在跑、`Loaded:` 行里的 `enabled/disabled` 决定**开机自启**。判据：`inactive (dead)` 时这条命令的退出码是 3 —— 脚本里可以直接用退出码判断，不必去解析那十几行文本。',
      contrast: '服务 `active (running)` 但端口不通 → 问题在应用自身（看 `journalctl -u myapp -n 50`，以及它的监听地址是不是 127.0.0.1）；报 `Unit xxx.service could not be found` 是**服务名写错或 unit 没装**，不是"服务挂了"；改过 unit 文件却没 `systemctl daemon-reload` 会出现"改了没生效"，此时 `status` 里的启动时间还是旧的。',
      run: 'systemctl status myapp',
      cmdIds: ['lu-systemctl', 'lu-journalctl', 'lu-systemctl-enable'],
      lesson: 'systemctl-status',
      tags: ['systemd', '服务', '排障']
    },

    {
      id: 'card-lu-is-active-for-script',
      cat: 'linux-user',
      kind: 'distinguish',
      level: 2,
      front: '给人看的服务状态和给脚本用的判断，输出与退出码完全不是一回事 —— `status`、`is-active`、`is-enabled` 各回答哪个问题？',
      hint: '一个回答"现在在不在跑"，另一个回答"开机自不自启"。',
      answer: 'systemctl is-active myapp（只输出 active/inactive，退出码就是结论）',
      why: '`is-active` 只输出一个词（`active`/`inactive`/`failed`），并且**退出码就是结论**（0 = 在运行），可以直接写 `if systemctl is-active --quiet myapp; then`。`status` 输出十几行给人看，脚本里解析它是最容易随版本失效的写法。判据：`is-active` 打印 `active` 就是正在运行。',
      contrast: '`is-enabled` 判断的是**开机自启**（enabled/disabled/static），与"现在在不在跑"完全是两个问题 —— 服务可以正在跑但没 enable，也可以 enabled 但当前挂掉了；unit 是 `static` 时不能 enable（它由别的 unit 拉起）；巡检失败单元用 `systemctl list-units --failed`；`--quiet` 连输出都省掉，只留退出码。',
      run: 'systemctl is-active myapp',
      cmdIds: ['lu-systemctl', 'lu-systemctl-enable', 'lu-systemctl-list'],
      lesson: 'systemctl-status',
      tags: ['systemd', '脚本', '判断']
    },

    {
      id: 'card-lu-id-groups',
      cat: 'linux-user',
      kind: 'diagnose',
      level: 2,
      front: '脚本明明做了提权，执行时还是 `Permission denied`；你要先确认**当前到底是谁、在不在需要的组里**。',
      hint: '光看名字不够，权限判定还看"属于哪些组"。',
      answer: 'id',
      why: '权限判定看的是**有效 UID + 所有附加组**，不是名字像不像 root。`id` 一次给全：`uid=0(root) gid=0(root) groups=0(root)`。判据：`groups=` 里有没有那个关键组（`docker`、`wheel`、`adm` 之类）—— 缺组时的表现是"文件看得见却读写被拒"，或者非 root 用户跑 docker 直接 `permission denied while trying to connect to the Docker daemon socket`。',
      contrast: '`whoami` 只给名字、不给组，排权限问题一定用 `id`；脚本里判断是不是 root 用 `[ "$(id -u)" -eq 0 ]`（`$UID` 是 bash 专有变量，dash 里没有）；容器里 UID 0 与宿主机的 root 共用同一套内核权限，很多镜像默认就是 root —— 这才是"容器不安全"的根源；`id 用户名` 可以查别人的身份，`getent group docker` 查组里有谁。',
      run: 'id',
      cmdIds: ['lu-id', 'lu-passwd', 'lu-getent'],
      lesson: 'lu-who-can-sudo',
      tags: ['权限', '用户', '排查']
    },

    {
      id: 'card-lu-kill-term-vs-kill9',
      cat: 'linux-user',
      kind: 'distinguish',
      level: 3,
      front: '进程卡住了，`kill` 发过去半天没反应，同事直接上 `-9` —— 这两者到底差在哪，什么时候**不该**用 `-9`？',
      hint: '一个信号是"请你退出"，另一个是"立刻消失"。',
      answer: '先 kill <PID>（SIGTERM=15），无效再 kill -9 <PID>（SIGKILL）',
      why: 'SIGTERM 可以被程序**捕获**，它有机会关连接、刷盘、删锁文件和 pid 文件、优雅下线；SIGKILL 由内核直接终止，**不可捕获**，进程没有任何清理机会（数据库可能要走崩溃恢复，临时文件与锁会残留）。判据：`kill` 成功时**什么都不打印**（静默即成功），失败才报 `No such process`；补一发 `ps -p <PID>` 看它是否还在。',
      contrast: '处于 **D 状态（不可中断睡眠，等 IO）** 的进程连 `-9` 都杀不掉（信号要等它回到可中断状态才被处理），只能等 IO 返回或重启机器，用 `ps -eo state,pid,cmd | grep "^D"` 找它们；systemd 托管的服务应该 `systemctl stop`（同样先 TERM、超时再 KILL，还会阻止 `Restart=` 把它立刻拉起来）；动手前务必 `ps -p <PID> -o pid,user,cmd` 确认目标，PID 抄错就是另一个故事了。',
      run: 'kill -9 18442',
      cmdIds: ['lu-systemctl', 'sh-trap', 'sh-background'],
      lesson: 'lu-service-wont-start',
      tags: ['进程', '信号', '排障']
    },

    {
      id: 'card-lu-uname-kernel-release',
      cat: 'linux-user',
      kind: 'distinguish',
      level: 2,
      front: '要装一个驱动或编译内核模块，先得说清"**内核版本**"；而装 rpm/deb 包时看的是"**发行版版本**" —— 它们在系统里是两个来源。',
      hint: '一个来自运行中的内核，一个来自发行版的说明文件。',
      answer: 'uname -r 给内核版本；/etc/os-release 给发行版（真机可用 hostnamectl 一条看全）',
      why: '`uname -r` 输出 `5.10.0-60.18.0.50.oe2203.x86_64` —— 装驱动/编模块必须与 `/lib/modules/` 下的目录名**逐字符一致**，差一个小版本都加载不上；发行版信息在 `/etc/os-release` 的 `PRETTY_NAME`（本站终端里它是个软链接，用 `ls -l /etc/os-release` 能看到指向 `../usr/lib/os-release`）。判据：内核模块报 `Invalid module format` 或 `version magic ... should be` 就是两边对不上。',
      contrast: '`uname -a` 一屏给全部（内核 + 主机名 + 架构），但**不含发行版**，别拿它回答"这是什么系统"；`lsb_release -a` 依赖 lsb 包，最小化系统里没有；`uname -m` 是**架构**（x86_64/aarch64），装错会报 `cannot execute binary file: Exec format error`，与发行版又是第三个维度；升级内核后 `uname -r` 要重启才会变（`/lib/modules` 下可能已经有新目录了）。',
      run: 'uname -r',
      cmdIds: ['lu-uname', 'lu-hostnamectl', 'lu-lsb-release', 'lu-dmidecode'],
      lesson: 'lu-host-identity',
      tags: ['系统', '内核', '版本']
    },

    {
      id: 'card-lu-hostname-permanent',
      cat: 'linux-user',
      kind: 'distinguish',
      level: 2,
      front: '改主机名有两种写法：一种改的是**内核里的运行时名字**，重启就回去了；另一种才是永久生效。',
      hint: '看谁负责把名字写进配置文件。',
      answer: 'hostnamectl set-hostname <新名>（永久）；hostname <新名> 只是临时',
      why: '`hostname 新名` 只改当前内核的 hostname，重启后由 `/etc/hostname`（systemd 系统）恢复；`hostnamectl set-hostname` 同时改运行时与配置文件。判据：改完必须 `hostname` 与 `cat /etc/hostname` 两条输出**一致**，不一致就是只改了临时的。',
      contrast: '主机名与 `/etc/hosts` 里的映射不一致会让 `sudo` 明显变慢（它要解析自己的名字，超时才继续）；K8s 节点名一变，节点会以新名字重新注册、旧节点变 NotReady；云主机的**实例名**在控制台，与系统 hostname 是两回事，改系统名不会改控制台显示，也不会改内网 DNS 记录；`hostname -I` 只是打印本机 IP，不是配置命令。',
      run: 'hostname',
      cmdIds: ['lu-hostname', 'lu-hostnamectl', 'ln-hosts-file'],
      lesson: 'lu-host-identity',
      tags: ['主机名', 'systemd', '配置']
    },

    {
      id: 'card-lu-date-timezone',
      cat: 'linux-user',
      kind: 'diagnose',
      level: 2,
      front: '应用日志的时间戳和服务器对不上，差了整整 8 小时，你要先确认**这台机器现在认为几点、在哪个时区**。',
      hint: '输出里除了时间，还有两个字能说明时区。',
      answer: 'date',
      why: '`date` 默认输出带时区缩写（`CST`）与星期，一眼能看出是不是本地时区。判据：出现 `CST`（或 `date +%z` 给 `+0800`）说明时区是 Asia/Shanghai；显示 `UTC` 或时间比预期少 8 小时，日志就会整体偏移 —— 先确认这一点，再去改应用。',
      contrast: '容器是**另一层**：镜像默认 UTC，要在启动时 `-e TZ=Asia/Shanghai` 或挂载 `/etc/localtime`（Java 还有 `-Duser.timezone`）；系统级排查用 `timedatectl`（给时区、UTC 时间、NTP 同步状态），手工 `date -s` 在有 NTP 的机器上会被拉回去，正确做法是 `timedatectl set-timezone Asia/Shanghai`；脚本里取时间一律用格式串，默认输出带英文星期、随 locale 变化，没法直接排序。',
      run: 'date',
      cmdIds: ['lu-date', 'lu-timedatectl', 'lu-localectl'],
      lesson: 'lu-host-identity',
      tags: ['时间', '时区', '排查']
    },

    {
      id: 'card-lu-lscpu-hypervisor',
      cat: 'linux-user',
      kind: 'diagnose',
      level: 2,
      front: '同事说"这台小机器跑不动这个服务"，你要确认它**实际有几个核、是不是虚拟机、CPU 是什么型号**。',
      hint: '一屏能同时看到核数、型号和虚拟化厂商。',
      answer: 'lscpu',
      why: '`CPU(s): 2` 是核数、`Model name` 是型号、**`Hypervisor vendor: KVM` 说明这是云主机/虚拟机**（物理机上没有这一行）、`NUMA node(s)` 影响内存访问延迟。判据：负载要除以核数才有意义（2 核上 8 就是 4 倍超载）；看到 KVM 就别按物理机的磁盘 IO 与 CPU 独占能力做预期。',
      contrast: '`nproc` 只给"当前可用核数"，会受 cgroup/CPU 亲和性限制（容器里可能与宿主机不同），适合写脚本取数；`/proc/cpuinfo` 是原始数据、字段随架构变化，不适合脚本解析；worker 进程数、`make -j`、JVM 的 GC/编译线程数都依赖核数，看错会导致资源争抢或压不满 CPU；`Architecture` 那一行要与 `uname -m` 一致，不一致说明你在容器/模拟层里。',
      run: 'lscpu',
      cmdIds: ['lu-lscpu', 'lu-dmidecode', 'lu-uname'],
      lesson: 'lu-host-identity',
      tags: ['CPU', '系统', '容量']
    },

    {
      id: 'card-lu-export-env',
      cat: 'linux-user',
      kind: 'distinguish',
      level: 2,
      front: '脚本里 `TOKEN=abc` 写完之后，下一行的子进程**读不到**这个变量；换个写法就好了。',
      hint: '本 shell 的变量，和要传给子进程的变量，是两回事。',
      answer: 'export TOKEN=abc（先赋值再 export TOKEN 也行）',
      why: 'shell 变量默认只是本 shell 的**局部变量**，只有 `export` 成**环境变量**才会随 fork/exec 复制给子进程（脚本、`env`、`printenv` 都是子进程）。判据：`env | grep TOKEN` 有输出才算环境变量；只有 `echo $TOKEN` 有输出，只证明当前 shell 有。',
      contrast: '`VAR=1 cmd` 只给这一条命令加变量，不影响当前 shell；管道右侧、`$( )` 子 shell 同样是"子进程"，只能继承环境变量；`~/.bashrc` 里的 export 只对**交互式 shell** 生效，systemd 服务完全不读它（要写 unit 里的 `Environment=` 或 `EnvironmentFile=`），cron 也只带极简环境 —— 这三处是"手动能跑、自动跑不了"的经典现场。',
      run: 'export TOKEN=prod-abc && env | grep TOKEN',
      cmdIds: ['sh-var-export', 'sh-special-vars', 'lu-crontab'],
      lesson: 'sh-hosts-inventory-loop',
      tags: ['变量', '环境', '脚本']
    },

    {
      id: 'card-lu-uptime-load',
      cat: 'linux-user',
      kind: 'diagnose',
      level: 2,
      front: '用户抱怨"这台机器最近总是卡"，你要先确认它**开机多久了**、以及当前的负载水平。',
      hint: '一行输出里有三个不同时间尺度的数字。',
      answer: 'uptime',
      why: '输出三段信息：当前时间、开机时长（`up 14 days`）、以及 1/5/15 分钟的平均负载。判据：负载要**除以核数**才有意义（`nproc` 是 2，所以 0.42/0.68/0.71 属于正常；8 才是超载）；三个数字的**趋势**比单点值有用 —— 1 分钟远大于 15 分钟说明正在恶化。',
      contrast: '负载高但 CPU 闲要先看 IO 等待（`vmstat` 的 `b`/`wa`，属监控分类）；"到底重启过几次"看 `last reboot` 或 `journalctl --list-boots`，`uptime` 只给最近一次；容器里 `uptime` 读到的是**宿主机**的（共享内核），别拿它判断容器生命周期；`top` 第一行是同一份数据，区别是它会实时刷新。',
      run: 'uptime',
      cmdIds: ['lu-uptime', 'mo-uptime', 'mo-vmstat'],
      lesson: 'mon-load-vs-cores',
      tags: ['负载', '系统', '排查']
    },

    {
      id: 'card-lu-uname-arch',
      cat: 'linux-user',
      kind: 'syntax',
      level: 1,
      front: '下载二进制包之前要确认 CPU 架构：\n\n  uname ____    →  x86_64',
      hint: '`-r` 给内核版本、`-a` 给全部，那"硬件架构"是哪个字母？',
      answer: '-m',
      why: '`-m` 输出机器架构（x86_64 / aarch64），选安装包就看它。判据：输出 `x86_64` 才能装 amd64 包 —— 装错架构的二进制会报 `cannot execute binary file: Exec format error`，这个报错基本可以直接判定"包下错了"。',
      contrast: '`uname -r` 是**内核版本**（编模块、装驱动才看它）、`uname -a` 是全部信息（不含发行版）；`uname -p` 在很多发行版上返回 `unknown`，别用它判断架构；容器里看到的架构是**宿主机**的（多架构镜像会按平台自动选）；`lscpu` 的 `Architecture` 与它一致，但另外给出核数、NUMA 与虚拟化厂商。',
      run: 'uname -m',
      cmdIds: ['lu-uname', 'lu-lscpu', 'lu-lsb-release'],
      lesson: 'lu-host-identity',
      tags: ['系统', '架构', 'uname']
    },

    {
      id: 'card-lu-date-format',
      cat: 'linux-user',
      kind: 'syntax',
      level: 2,
      front: '脚本要生成 `backup-2024-03-18.tar.gz` 这种按日期命名的文件，只需要"年-月-日"：\n\n  tar czf backup-$(date ____).tar.gz /var/www/html',
      hint: '`+` 后面接格式串，先想"年-月-日"分别是哪三个占位符。',
      answer: '+%F',
      why: '`+` 引出格式串，`%F` 等价于 `%Y-%m-%d`（同理 `%T` = `%H:%M:%S`、`%s` = Unix 时间戳）。判据：输出 `2024-03-18` —— 这种**定长且大端**的写法可以按文件名直接排序、也能安全地当文件名（没有空格和斜杠）。',
      contrast: '默认的 `date` 输出带英文星期与时区（`Mon Mar 18 09:51:00 CST 2024`），**无法直接排序**、还会随 locale 变，脚本里一律用格式串；算耗时用 `date +%s` 做减法（真机还可以 `date -d` 解析字符串）；`%F` 只到天，同一天跑两次会**覆盖**同名备份 —— 需要保留多次就加上 `%H%M%S`；容器里 `date` 可能是 UTC，会生成"少 8 小时"的文件名，先确认时区。',
      run: "date '+%F %T'",
      cmdIds: ['lu-date', 'lu-timedatectl', 'sh-template-backup'],
      lesson: 'lu-host-identity',
      tags: ['时间', '格式化', '脚本']
    },

    {
      id: 'card-lu-chmod-755-644',
      cat: 'linux-user',
      kind: 'distinguish',
      level: 2,
      front: '同事让你把脚本权限设成 755、配置文件设成 644 —— 这两个数字分别在说什么？为什么 777 不是"方便"而是"事故"？',
      hint: '三个数字对应三类人，每个数字是三个二进制位。',
      answer: '755 = 属主 rwx / 同组 r-x / 其他人 r-x；644 = 属主 rw- / 同组 r-- / 其他人 r--',
      why: '三位八进制依次是 **属主 / 同组 / 其他人**，每位的 4=r、2=w、1=x。关键在于**执行位**：程序与脚本要有 x 才能运行，**目录要有 x 才能进入**（没有 x 就 `cd` 不进去、看不到里面的文件，这条最容易被忽略）；配置、密钥、纯数据文件不该有 x。判据：`ls -l` 第一列 `-rwxr-xr-x` 是 755、`-rw-r--r--` 是 644、`-rw-------` 是 600 —— 本机 `/etc/passwd` 与 `/etc/ssh/sshd_config` 正好是前两者的对照。',
      contrast: '**不要用 777 解决"权限不够"**：那等于让任何用户都能改你的程序（入侵者拿到 webshell 后第一步就是找可写目录）；正确的分诊是问"谁需要读/写/执行" —— Web 目录一般 755/644、上传目录 775 + 同组、私钥 600，递归改权限时目录与文件必须分开处理（`find /data -type d -exec chmod 755 {} +` 与 `-type f` 分别来），否则目录丢了 x 位谁都进不去；`chmod +x` 只加执行位、不动其它位，是上线脚本最小的改动。',
      cmdIds: ['lu-chmod', 'lu-chown', 'lu-umask', 'lb-install'],
      lesson: 'lu-umask-newfile',
      tags: ['权限', 'chmod', '安全']
    }

  );

  /* ==================================================================
     04 · 网络与排障（linux-net）15 张
     ================================================================== */
  window.CC_CARDS.push(

    {
      id: 'card-ln-ping-layer',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 1,
      front: '应用连不上后端，你要**先判断是网络层还是应用层**的问题，而不是一头扎进日志。',
      hint: 'ICMP 只能证明"包能来回"，证明不了"服务在"。',
      answer: 'ping -c 3 10.0.1.31',
      why: '`-c 3` 限定发包数量（**不加 `-c` 会一直 ping 下去**，脚本里必然卡死）。判据：`3 packets transmitted, 3 received, 0% packet loss` 加一个正常的 `rtt`，说明网络层通、延迟正常 —— 这一步只排除"路不通"，**不能**证明 8080 上的服务可用。',
      contrast: '**ping 通 ≠ 服务可用**，**ping 不通 ≠ 服务不可用**（云厂商安全组和运营商常年禁 ICMP），测端口要用 `nc -zv`；`Destination Host Unreachable` 多是同网段 ARP/路由没通（二层没解析到对端），`Request timeout` 才是包被丢弃或对端不回 —— 这两个报错指向完全不同的方向；要测 MTU 用 `-s 1472 -M do`（1472 是载荷，加 28 字节 IP+ICMP 头正好 1500）。',
      run: 'ping -c 3 10.0.1.31',
      cmdIds: ['ln-ping', 'ln-nc', 'ln-traceroute'],
      lesson: 'net-traceroute-where-broken',
      tags: ['网络', 'ping', '分层']
    },

    {
      id: 'card-ln-ip-route-default',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 2,
      front: '机器能通同网段，却怎么也出不了公网 —— 你要先看它**默认把包交给谁**。',
      hint: '看路由表里有没有那一行"默认"。',
      answer: 'ip route',
      why: '输出第一行 `default via 10.0.1.1 dev eth0 ... metric 100` 就是默认路由：没有它，机器根本不知道"非本网段的目标"该发给谁。判据：**缺 `default` 这一行**时表现为"同网段通、跨网段全不通"，报错常常是 `Network is unreachable` —— 这比 DNS 失败更早、更根本，先解决它再看别的。',
      contrast: '`ip route get 8.8.8.8` 更进一步：直接算出"去这个地址实际会走哪条路由、从哪个源 IP 出去"（多网卡、多路由表时最有用）；`netstat -rn` / `route -n` 是同一份数据的老写法（net-tools 已停维）；云主机第一跳是 VPC 网关，跳数比物理网络少得多，属正常；网关本身 ping 不通 ≠ 网关有问题，还要看 `ip neigh` 里网关是不是 REACHABLE（以及 ICMP 是否被禁）。',
      run: 'ip route',
      cmdIds: ['ln-ip-route', 'ln-route', 'ln-ip-neigh'],
      lesson: 'net-route-missing',
      tags: ['网络', '路由', '排障']
    },

    {
      id: 'card-ln-hosts-order',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 3,
      front: '同事在本机加了一行映射之后，`ping` 与 `curl` 都去了那台机器，但某个排查工具查出来的却是**另一个 IP** —— 同一个域名，两个答案。',
      hint: '解析顺序由 nsswitch 决定，本地文件排在 DNS 前面。',
      answer: 'cat /etc/hosts',
      why: '应用（glibc）默认 **files 优先**：先查 `/etc/hosts`，命中就不再问 DNS。这台机器的 hosts 里就写着 `10.0.1.23 web-prod-01`、`10.0.2.15 db-prod-01`。判据：`getent hosts <名字>`（走同一套 nsswitch，等于"应用看到的答案"）与 `dig <名字>`（只查 DNS）结果不同，就说明 hosts 在起作用。',
      contrast: '`dig`/`nslookup`/`host` **只查 DNS、完全绕过 hosts** —— "命令行能解析、程序解析到别处"这类怪事基本都在这里；hosts 里写错映射会让服务连到错误后端（改完立刻验证）；用 hosts 屏蔽域名会影响本机所有程序（包括监控 Agent）；容器里的 hosts 由 Docker/K8s 自动生成（`--add-host`、Service 名），手改重启即失效；`nsswitch.conf` 里漏掉 `files` 会让整机解析异常，改前先备份。',
      run: 'cat /etc/hosts',
      cmdIds: ['ln-hosts-file', 'ln-resolv-conf', 'ln-troubleshoot-dns'],
      lesson: 'net-dns-resolution-wrong',
      tags: ['DNS', '解析', '排障']
    },

    {
      id: 'card-ln-tcpdump-arrival',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 3,
      front: '应用说请求已经发出去了，本机服务的日志里却什么都没有 —— 你要确认**包到底有没有到达这台机器**。',
      hint: '在网卡上直接看报文，而不是听应用怎么说。',
      answer: 'tcpdump -i any -nn -c 20 port 80',
      why: '`-i any` 抓所有网卡、`-nn` 不做 IP 与端口反解（避免卡在 DNS 上）、`-c 20` 抓满就停。判据：看到 `Flags [S]`（客户端发来的 SYN）说明包**已经到本机**，问题在服务或本机防火墙；一个包都抓不到则是上游（安全组/路由/NAT）就丢了 —— 这个分叉直接决定下一步查谁。',
      contrast: '带过滤条件时表达式要加引号（`tcpdump -nn "host 203.0.113.25 and port 80"`），否则 shell 会把 `and`/`or` 拆成参数；要留着慢慢看就用 `-w /tmp/x.pcap`（终端刷屏会丢包），再用 Wireshark 分析；需要 root 或 `CAP_NET_RAW`，普通用户报 permission denied；云主机上抓不到也可能是平台侧没开流量镜像；**不加 `-c` 或不限文件大小，高流量网卡几分钟就能把磁盘写满** —— 这是 tcpdump 最著名的生产事故。',
      run: 'tcpdump -c 20 -i any -nn port 80',
      cmdIds: ['ln-tcpdump', 'ln-troubleshoot-firewall', 'ln-troubleshoot-port'],
      lesson: 'net-tcpdump-did-it-arrive',
      tags: ['抓包', '排障', '网络']
    },

    {
      id: 'card-ln-host-cname',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 2,
      front: '用户说这个站点解析到了"别的地址"，你要看清它的**别名链最终指向谁**，而不是只看一个 IP。',
      hint: '一个域名可以套好几层 CNAME，A 记录在最末端。',
      answer: 'host www.163.com',
      why: '`host` 会把 CNAME 链一层层列出来（`www.163.com → ...163jiasu.com → ...bdydns.com → opencdn126music.jomodns.com`），最后 `Name:` 那一行才是真正持有 A 记录（`Address: 182.40.118.54`）的主机。判据：链尾的地址才是客户端实际会连的地址 —— CDN 场景下这个地址按地区/线路变化，属正常而不是被劫持。',
      contrast: '要看 `status`、`TTL`、权威段必须用 `dig`（`host` 太精简，连 `NXDOMAIN` 与 `SERVFAIL` 都不区分）；"改了解析为什么还没生效"看 TTL（TTL 300 = 最多再等 5 分钟）；`host` 与 `dig` 一样**只查 DNS、不看 `/etc/hosts`**，所以它和 `ping` 的结果不一致是正常现象；脚本里取值建议 `host 域名 | awk "{print $NF}"`。',
      run: 'host www.163.com',
      cmdIds: ['ln-host', 'ln-dig', 'ln-nslookup'],
      lesson: 'net-dns-resolution-wrong',
      tags: ['DNS', 'CDN', '排障']
    },

    {
      id: 'card-ln-traceroute-hop',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 2,
      front: '用户说访问慢，可你测延迟是正常的 —— 你要看**是哪一跳开始变慢或开始丢包**。',
      hint: '逐跳递增 TTL，让沿途每个路由器自己报时。',
      answer: 'traceroute www.baidu.com',
      why: '`traceroute` 每跳发三个探测包并打印三个 RTT，从某一跳起 RTT **明显抬升**或开始持续丢，才是问题段。判据：这里前几跳都在 1~3ms，从第 4 跳起出现 `*`（路由器不回 ICMP 超时报文），到第 7 跳之后全是 `* * *` —— **中间跳出现 `*` 是常态，不代表链路断了**，只有"从某一跳起后面每一跳都按同一比例丢"才是真故障点。',
      contrast: '一次快照判断不了偶发丢包/抖动，那要用 `mtr -c 100 -r` 持续统计；默认 UDP 探测容易被安全策略拦，`-T -p 443` 换 TCP 穿透性更好；`-n` 跳过反解会快很多；`tracepath` 能顺带看出逐跳 `pmtu` 变小（VPN/隧道/跨运营商的典型症状）；云环境第一跳就是 VPC 网关，跳数少属正常。',
      run: 'traceroute www.baidu.com',
      cmdIds: ['ln-traceroute', 'ln-mtr', 'ln-troubleshoot-slow'],
      lesson: 'net-traceroute-where-broken',
      tags: ['网络', '链路', '排障']
    },

    {
      id: 'card-ln-nmcli-device',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 2,
      front: '接手一台机器，要确认它的**地址、网关、DNS、连接名**分别是什么（而不是从别的机器抄一份）。',
      hint: '一条命令同时给三层配置，比连敲三条老命令可靠。',
      answer: 'nmcli device show eth0',
      why: '一条命令给全：`GENERAL.CONNECTION`（连接名，后面 `nmcli con mod` 要用它）、`IP4.ADDRESS`、`IP4.GATEWAY`、`IP4.DNS[*]` 与 `GENERAL.STATE: 100 (connected)`。判据：`IP4.DNS` 必须与 `/etc/resolv.conf` 里的 nameserver 对得上 —— 对不上说明 DNS 是从别处（DHCP 或手工文件）来的，改网卡配置也不会生效。',
      contrast: '`ip addr` 只给地址、**不给网关和 DNS**（要再配 `ip route` 与 `/etc/resolv.conf` 才凑齐，而手工改 `/etc/resolv.conf` 会被 NetworkManager/DHCP 覆写，持久化要改 `ipv4.dns` 或设 `PEERDNS=no`）；`ip addr add` 是**临时**配置（重载即丢），持久化是 `nmcli con mod eth0 ipv4.addresses ... ipv4.gateway ... && nmcli con up eth0`；`nmtui` 是同一套配置的文本界面，不熟参数时更直观；远程改 IP 一定留回滚手段（控制台 VNC 或定时恢复任务），否则一改就失联。',
      run: 'nmcli device show eth0',
      cmdIds: ['ln-nmcli', 'ln-ip-addr', 'ln-resolv-conf', 'ln-ifconfig'],
      lesson: 'net-dns-resolution-wrong',
      tags: ['网络', '网卡', '配置']
    },

    {
      id: 'card-ln-nc-vs-telnet',
      cat: 'linux-net',
      kind: 'distinguish',
      level: 2,
      front: '老同事习惯用 `telnet` 测端口，为什么现在的排查笔记都改写成 `nc`？两者的实测结果又有哪些不同解读？',
      hint: '一个连上之后停在那里等你输入，另一个测完立刻返回。',
      answer: 'nc -vz -w 3 <主机> <端口>',
      why: '`-z` 只扫描、不建立会话，`-v` 打印过程，`-w 3` 设 3 秒超时。判据：通的时候打印 `Connection to 10.0.1.32 8080 port [tcp/*] succeeded!` 并**立刻返回**；`telnet` 则输出 `Connected to ...` 后停在光标处等输入（要 `Ctrl+]` 再 `quit`），脚本里用它会挂住。',
      contrast: '探测被安全组 **DROP** 时两种工具都会一直等，所以 `nc` 必须带 `-w`（否则脚本卡死）；结果解读才是分诊关键 —— `Connection refused` = 有主机应答但没人监听（服务没起 / 只监听 127.0.0.1），`Connection timed out` = 包被丢弃（安全组、防火墙、路由），`Name or service not known` = DNS 没解析出来；`telnet` 全程明文，**绝不能用来登录**（远程登录一律 ssh），很多新版发行版默认也不装它。',
      run: 'nc -vz -w3 10.0.1.32 8080',
      cmdIds: ['ln-nc', 'ln-telnet', 'ln-troubleshoot-connect-refused'],
      tags: ['端口', '探测', '排障']
    },

    {
      id: 'card-ln-lsof-port-holder',
      cat: 'linux-net',
      kind: 'diagnose',
      level: 3,
      front: '重启服务时报 `Address already in use`，可进程列表里那个程序明明已经停了 —— 你要找出**到底是谁还占着这个端口**。',
      hint: '从端口反查进程，而不是从进程列表里正着找。',
      answer: 'lsof -i:8080',
      why: '`lsof -i:<端口>` 直接按端口列出持有它的进程与 PID（`ss -tulnp | grep 8080` 也行，但要自己过滤，且 `-p` 看不到别人的进程往往是没加 sudo）。判据：输出里的 PID 就是占端口的元凶 —— 这里 8080 属于 `java` 18442（应用自己），拿 PID 后先 `ps -p <PID> -o pid,user,cmd` 确认身份，再决定是杀它还是换端口。',
      contrast: '"服务停了端口还占着"常见三种，处置完全不同：**TIME-WAIT** 是内核保留（主动关闭方等 2MSL，`ss -tan` 里能看到，等一会儿自己就没了，不算被占用）；**子进程/线程没退**（nginx master 退了 worker 还在、java 线程没结束）；**被容器占用**（`docker ps` 里映射了同一端口，宿主机上会看到 `docker-proxy`）；`SO_REUSEADDR` 能让程序忽略 TIME-WAIT 直接复用端口，Java 默认就带。',
      run: 'lsof -i:8080',
      cmdIds: ['ln-lsof', 'ln-ss', 'ln-fuser'],
      lesson: 'lsof-deleted',
      tags: ['端口', '进程', '排障']
    },

    {
      id: 'card-ln-ip-neigh',
      cat: 'linux-net',
      kind: 'distinguish',
      level: 3,
      front: '两台机器在同一个网段却互相不通，你要先看**二层地址解析**有没有成功 —— 这一层经常被整段跳过。',
      hint: '同网段通信靠 ARP/NDP，缓存里有没有对端的条目很说明问题。',
      answer: 'ip neigh',
      why: '同网段通信要先做 ARP 解析，`ip neigh` 列出邻居缓存与状态：`REACHABLE` 是正常，`FAILED`/`INCOMPLETE` 或**根本没有对端条目**说明 ARP 没解析出来（网段/VLAN 不一致、对端没开机、虚拟化二层限制）。判据：这里默认网关是 `REACHABLE`，而 `10.0.1.24` 是 `STALE` —— **STALE 不代表故障**，只是缓存老化，真正发包时会重新确认。',
      contrast: '跨网段的目标不会出现在邻居表里（流量走网关），别拿"没有对端条目"当故障；IPv6 用 `ip -6 neigh`（NDP 代替 ARP），链路本地地址必须带 `%网卡名`；排查 **IP 冲突**用 `arping -I eth0 <IP>`（收到两个不同 MAC 就是冲突，业务会间歇性中断）；清缓存 `ip neigh flush all`；`arp -n` 是同一份数据的老写法。',
      run: 'ip neigh',
      cmdIds: ['ln-ip-neigh', 'ln-arping', 'ln-ping'],
      tags: ['网络', 'ARP', '排障']
    },

    {
      id: 'card-ln-ss-tcp-states',
      cat: 'linux-net',
      kind: 'distinguish',
      level: 3,
      front: '短连接服务跑一段时间后报"端口不够用"，你要看连接**状态的分布**：`TIME-WAIT` 与 `CLOSE-WAIT` 都"没在传数据"，但一个会自己消失、另一个说明程序有 bug。',
      hint: '先分清"是谁先关的连接"。',
      answer: 'ss -tan（看 TIME-WAIT / CLOSE-WAIT 的堆积情况）',
      why: '`-a` 显示所有状态（含监听与已关闭）、`-t` 只看 TCP、`-n` 不反解。判定规则：**TIME-WAIT** 是**本机主动关闭**后等 2MSL 的正常状态，量大说明短连接太多（连接池不足），会自己回收；**CLOSE-WAIT** 是**对端已关闭、本机没有调用 close()**，堆积会吃光文件描述符，**只能改代码，调内核参数没用**。判据：`ss -tan | awk "{print $1}" | sort | uniq -c` 一眼看出哪种状态在涨。',
      contrast: 'TIME-WAIT 的缓解手段是连接池 + `net.ipv4.tcp_tw_reuse=1`（**不要用已废弃的 tcp_tw_recycle**，NAT 环境下会出诡异问题），只有几千个 TIME-WAIT 完全不必处理（本地端口范围通常约 2.8 万）；`ss -s` 给总量摘要；`ss -tan state time-wait` 可按状态过滤但**表达式必须加引号**（`state` 与 `dport` 组合时整个表达式要放进同一个引号）；`netstat` 能看到同样的状态，但高并发下可能卡几十秒。',
      run: 'ss -tan',
      cmdIds: ['ln-ss', 'ln-ss-kill', 'ln-netstat'],
      lesson: 'net-kill-one-connection',
      tags: ['TCP', '连接', '排障']
    },

    {
      id: 'card-ln-ip-link-lower-up',
      cat: 'linux-net',
      kind: 'distinguish',
      level: 3,
      front: '接口的配置里明明有地址，流量却完全不通 —— 你要分清**二层链路状态**和**三层地址配置**是两码事。',
      hint: '尖括号里那一串标志位，有一个表示"物理链路真的起来了"。',
      answer: 'ip link（二层是否 UP）；ip addr（三层地址）',
      why: '`ip addr` 第一行的 `<BROADCAST,MULTICAST,UP,LOWER_UP>` 里，**`UP` 是管理状态、`LOWER_UP` 才是链路层协商成功**：只有 UP 没有 LOWER_UP，说明网线/对端端口/虚拟化网络没通，此时地址还配着但包出不去。判据：`ip link` 里同一行也能看到这两个标志，而 `state UP` 只说明管理上启用了接口。',
      contrast: '老命令 `ifconfig`（net-tools 已停维）根本不显示 LOWER_UP 这个概念，容易漏判；要看协商速率/双工与 `Link detected` 用 `ethtool eth0`（**云主机上 `Speed: Unknown!` 是虚拟网卡的正常输出**，不代表故障）；"有地址却不通"还有第三种可能：地址加在了**错误的网卡**上，用 `ip -br addr` 一眼看全每张卡的地址与状态；`ip -s link` 的 dropped/errors 是累计值，要隔时间取两次相减才有意义。',
      run: 'ip link',
      cmdIds: ['ln-ip-link', 'ln-ip-addr', 'ln-ethtool', 'ln-ip-stats'],
      lesson: 'net-link-mtu-down',
      tags: ['网络', '网卡', '链路']
    },

    {
      id: 'card-ln-curl-three-layers',
      cat: 'linux-net',
      kind: 'distinguish',
      level: 2,
      front: '`ping` 通就代表业务正常吗？同一台机器上，三个层次的验证各能证明什么、又各**不能**证明什么？',
      hint: '网络层 → 传输层 → 应用层，逐层排除。',
      answer: 'ping 证网络层；nc -z 证端口在监听；curl -I 证七层 HTTP 正常',
      why: '三层依次排除：ICMP 通只说明主机在线；TCP 端口通只说明进程在监听；**只有 HTTP 拿到 2xx/3xx 才说明应用真的能处理请求**。判据：`curl -I` 输出 `HTTP/1.1 200 OK` 与 `Server: nginx/1.20.1` —— 到这一步才能说"服务是好的"；如果 `ping`/`nc` 都通而 `curl` 卡住，问题就在应用内部（后端超时、线程池满）。',
      contrast: '云上常见禁 ICMP，`ping` 不通不能作为故障依据；`curl -I` 发的是 **HEAD**，有的服务不支持会返回 405（改用 `curl -s -o /dev/null -w "%{http_code}"`）；HTTPS 站点要 `curl -I https://...`，`-k` 跳过证书校验**只用于排障**、绝不能写进脚本；要拆"慢在哪一段"用 `curl -w` 的 `time_namelookup/time_connect/time_starttransfer`（都是**累计值**，必须两两相减才是阶段耗时）。',
      run: 'curl -I http://127.0.0.1',
      cmdIds: ['ln-curl', 'ln-curl-timing', 'ln-ping', 'ln-nc'],
      lesson: 'curl-head',
      tags: ['HTTP', '分层', '排障']
    },

    {
      id: 'card-ln-firewall-permanent',
      cat: 'linux-net',
      kind: 'syntax',
      level: 3,
      front: '把 443 端口**永久**放行（firewalld，重启后仍然有效）：\n\n  firewall-cmd ____ --add-port=443/tcp',
      hint: 'firewalld 维护着两套规则：当前生效的，和写进配置的。',
      answer: '--permanent',
      why: '`--add-port` 不加 `--permanent` 只改 **runtime**（当前生效、重启即丢）；加了 `--permanent` 只写配置、**当前不生效**。所以正确姿势永远是两步：`firewall-cmd --permanent --add-port=443/tcp && firewall-cmd --reload`。判据：`firewall-cmd --query-port=443/tcp` 与 `firewall-cmd --permanent --query-port=443/tcp` **两个都返回 yes**，才算真的配好了。',
      contrast: '`--list-all` 显示的是**当前活动 zone** 的规则，规则加到非活动 zone 上等于没加（先 `--get-active-zones` 确认）；`--reload` 会重建规则链并**断开已建立的连接**，生产上避开高峰；firewalld 与手工 iptables 规则会互相覆盖，只能选一套；云主机上**先看安全组再看本机防火墙**（安全组在 VPC 层拦截，本机放行也没用）；Ubuntu 用的是 ufw，命令完全不通用。',
      run: 'firewall-cmd --permanent --add-port=443/tcp',
      cmdIds: ['ln-firewall-cmd', 'ln-troubleshoot-firewall', 'ln-iptables'],
      lesson: 'sec-fw-3306-blocked',
      tags: ['防火墙', '端口', 'firewalld']
    },

    {
      id: 'card-ln-traceroute-n',
      cat: 'linux-net',
      kind: 'syntax',
      level: 2,
      front: '让每一跳只显示 IP、不做域名反解（既快，也不会卡在 DNS 上）：\n\n  traceroute ____ www.baidu.com',
      hint: '`nc` 里也有同名选项：不解析。',
      answer: '-n',
      why: '`-n` 关闭反向解析（不查 PTR）：反解每一跳要发 DNS 查询，慢且可能被内网 DNS 拖住，排障时输出纯 IP 反而更好比对。判据：每一跳都是 `IP + 三个 RTT` 的形式，没有 `hostname (ip)`。',
      contrast: '排障固定组合是 `traceroute -n`（一次快照）+ `mtr -n -c 100`（持续统计）；默认 UDP 探测常被安全策略丢弃，`-T -p 443` 走 TCP 更容易穿过去，`-I` 用 ICMP 回显（老式但兼容性好）；`* * *` 表示该跳没回 ICMP 超时报文，**不等于链路断了**；`ss`/`netstat` 的 `-n` 是同一个含义：不做名字解析，这也是排障时"命令像卡住了"的常见原因。',
      run: 'traceroute -n www.baidu.com',
      cmdIds: ['ln-traceroute', 'ln-mtr', 'ln-dig'],
      lesson: 'net-dns-resolution-wrong',
      tags: ['网络', 'traceroute', 'DNS']
    }

  );

  /* ==================================================================
     05 · 磁盘与存储（linux-storage）10 张
     ================================================================== */
  window.CC_CARDS.push(

    {
      id: 'card-ls9-lsblk-vs-df',
      cat: 'linux-storage',
      kind: 'distinguish',
      level: 2,
      front: '云控制台把数据盘从 100G 扩到了 200G，`df -h` 却还是老容量 —— "块设备层面"和"文件系统层面"的两个数字，到底该看哪个？',
      hint: '一个看设备/分区有多大，一个看文件系统用了多少。',
      answer: 'lsblk（看设备与分区大小）；df 看文件系统容量',
      why: '`lsblk` 显示**块设备与分区的大小**（内核视角），`df` 显示**文件系统**的容量。扩容链路是"控制台扩盘 → 扩分区（growpart）→ 扩文件系统（resize2fs/xfs_growfs）"，任何一步没做，`df` 都不会变。判据：在 `lsblk` 里对照 `vdb`（disk）与 `vdb1`（part）两行的 SIZE —— **part 比 disk 小**说明卡在分区层；两者一样大而 `df` 没变，说明卡在文件系统层。',
      contrast: '`lsblk -f` 还会列出文件系统类型与 UUID（写 fstab 时要用）；`df -h` 的 Use%/Avail 才是"还能写多少"；`blkid` 看文件系统签名、`fdisk -l` 看分区表；走 LVM 的盘扩容后还要 `pvresize` 才能让 VG 看到新空间 —— **跳步是云上扩容最常见的坑**，扩完必须回到 `df -h` 确认数字真的变了。',
      run: 'lsblk',
      cmdIds: ['ls9-lsblk', 'ls9-df', 'ls9-growpart', 'ls9-lvm-extend'],
      lesson: 'ls-growpart-after-resize',
      tags: ['磁盘', '扩容', '云盘']
    },

    {
      id: 'card-ls9-findmnt-source',
      cat: 'linux-storage',
      kind: 'distinguish',
      level: 2,
      front: '某个目录上读写特别慢，你先要确认它**到底是本地盘还是网络存储** —— 这两种情况的处置方向完全不同。',
      hint: '按挂载点反查来源设备与文件系统类型。',
      answer: 'findmnt /data',
      why: '`findmnt` 按挂载点给出 SOURCE（来源设备）、FSTYPE、OPTIONS，还带树形层级（比 `mount` 的输出可读）。判据：SOURCE 是 `/dev/vdb1` = 本地盘；FSTYPE 是 `nfs4`/`cifs` = **网络存储** —— 后者的"磁盘慢"其实是网络问题，本地 `iostat` 反而看不出异常。',
      contrast: '`mount` 输出**所有**挂载点（排查单个点要自己 grep，且不含 UUID）；`df -h` 给的是容量不是来源；`mount | grep <目录>` 是"到底挂上了没有"最快的判断 —— 挂载点只是普通空目录，**没挂上时数据会写进根分区里的那个目录，把系统盘写满**，这是云主机上极高频的事故；网络存储的 fstab 条目要加 `_netdev` 和 `nofail`，否则服务端不可达时本机可能卡在启动阶段。',
      run: 'findmnt /data',
      cmdIds: ['ls9-findmnt', 'ls9-mount', 'ls9-nfs-client', 'ls9-fstab'],
      lesson: 'ls-findmnt-which-device',
      tags: ['挂载', '存储', '排障']
    },

    {
      id: 'card-ls9-iostat-which-disk',
      cat: 'linux-storage',
      kind: 'diagnose',
      level: 3,
      front: '业务变慢，CPU 和内存都正常，`vmstat` 的 `wa` 那一列却有值 —— 你要确认是**哪块盘**在拖后腿、它又挂着谁。',
      hint: '要看"每块设备"的利用率与平均等待时间，而不是整机平均。',
      answer: 'iostat -x 1 3',
      why: '`-x` 给扩展指标：`%util` 接近 100% 说明设备几乎没有空闲、`await`（平均等待，毫秒）远高于平时（机械盘 >20ms、SSD/云盘 >5ms）就是瓶颈；`r_await`/`w_await` 分开看还能区分读多还是写多。判据：这里 `vdb` 的 `%util` 99.41、`w_await` 42ms，而 `vdb1` 正是挂着 `/data` 的那块盘（`lsblk` 可核对），与 `/data` 已用 100% 完全对得上。',
      contrast: '**第一次输出是"开机以来的累计均值"**，判断现状要看 `iostat -x 1 3` 的第二次以后；云盘有 IOPS/带宽规格上限，超限时 `await` 明显上升（先看云监控的磁盘指标再决定扩盘还是加盘）；`%util` 对可并行的 SSD/云盘参考价值下降，要结合 `aqu-sz`（队列深度）一起看；容器/虚机里设备名可能是 `vda/vdb`，先 `lsblk` 对齐名字；没有 iostat 时可临时看 `vmstat 1` 的 `wa`。',
      run: 'iostat -x 1 3',
      cmdIds: ['ls9-iostat', 'mo-vmstat', 'ls9-iotop', 'ls9-lsblk'],
      lesson: 'mon-io-bottleneck',
      tags: ['磁盘', '性能', 'IO']
    },

    {
      id: 'card-ls9-mount-point-shadow',
      cat: 'linux-storage',
      kind: 'diagnose',
      level: 3,
      front: '重启后数据盘没挂上，应用却照常启动，把数据写进了根分区下的一个空目录，最后把系统盘撑满了 —— 你怎么最快确认这一点？',
      hint: '看"设备与目录的对应关系"里有没有那一行。',
      answer: 'mount | grep vdb1',
      why: '挂载点只是一个**普通空目录**：设备没挂上时往里写数据，会静默落到根分区的那个目录里 —— 典型症状是 `df -h /` 突然涨、而 `/data` 里空空如也。判据：输出里存在 `/dev/vdb1 on /data type ext4 (rw,noatime)` 才算真的挂上了；没有这一行，写进去的就是系统盘。',
      contrast: '`findmnt /data` 输出更整齐、还带树形（推荐）；`mount -a` 是**改完 fstab 的安全验证方式**（写错立刻报错，比直接重启进 emergency mode 好得多）；挂载点必须先 `mkdir` 出来；数据盘条目要写 **UUID**（设备名会随挂载顺序漂移）并加 `nofail`（盘被摘掉时不阻塞启动）；**往数据盘写数据前先确认挂载成功**，这条纪律比任何工具都值钱。',
      run: 'mount',
      cmdIds: ['ls9-mount', 'ls9-fstab', 'ls9-new-disk-flow', 'ls9-umount'],
      lesson: 'ls-umount-busy',
      tags: ['挂载', 'fstab', '排障']
    },

    {
      id: 'card-ls9-df-avail-reserved',
      cat: 'linux-storage',
      kind: 'distinguish',
      level: 3,
      front: '`df -h` 里 Size 200G、Used 189G，可 Avail 只有 1.2G —— Size 减 Used 明明是 11G，那 10G 去哪了？',
      hint: '有一块空间普通用户永远用不到，它专门留给 root。',
      answer: 'Avail 扣掉了文件系统给 root 保留的 5%（Size − Used − Avail ≈ 保留块）',
      why: 'ext4 默认把总块数的 **5% 留给 root**（`Reserved block count`）：普通用户写满时报 `no space left on device`，而 root 还能再写一点 —— 这就是 Avail 明显小于 Size−Used 的原因。判据：`tune2fs -l /dev/vdb1 | grep -i reserved`（或 `dumpe2fs -h`）读出的保留块数换算回来正好是差额（200G 的 5% ≈ 10G）。',
      contrast: '数据盘可以 `tune2fs -m 1` 把保留比例降到 1%（大容量盘能释放几十 G），**系统盘不要动**（这点余量是应急写入与碎片整理用的）；"df 满而 du 找不到大头"的另两个经典原因是**已删除但仍被进程持有的句柄**（`lsof +L1`）和 **inode 用满**（`df -i`）—— 三条线互不相同，别在一条上死磕。',
      run: 'df -h',
      cmdIds: ['ls9-df', 'ls9-du', 'ls9-tune2fs', 'ln-lsof'],
      lesson: 'du-culprit',
      tags: ['磁盘', '容量', 'ext4']
    },

    {
      id: 'card-ls9-log-truncate',
      cat: 'linux-storage',
      kind: 'diagnose',
      level: 3,
      front: '应用日志把 `/data` 撑到 100%，你删掉了那个 160M 的 `app.log`，可 `df` 一点没降。',
      hint: '文件在目录里已经消失，但还有进程在用它。',
      answer: ': > /data/app/logs/app.log（等价于 truncate -s 0）',
      why: '进程还持有这个文件的**句柄**：目录项删掉了（`lsof +L1` 能看到那一行带 `(deleted)`、且 SIZE/OFF 就是 165150720），但数据块要等最后一个句柄关闭才释放，所以 `df` 不会降。用 `: >` 把它**清空**（只改 inode 里的长度字段，瞬间完成）即可立刻释放空间，且**不用重启进程**。判据：执行后 `df -h` 的 Used 立刻回落，进程继续往同一个文件写。',
      contrast: '`rm` 之后只能靠重启进程（`systemctl restart myapp`）释放；logrotate 的 `copytruncate` 就是干这件事（适合不能重启的程序），默认的 create 模式靠信号让程序重开日志文件；清空前先想清楚"这段日志还要不要留证据"（复盘时可能要先 `tail -n 1000 > /tmp/keep.log`）；**别用 `echo > file`**（会写入一个换行，JSON 类日志会被写坏）；`journalctl --vacuum-size=500M` 是系统日志的同类操作。',
      cmdIds: ['lb-truncate', 'ln-lsof', 'ls9-fallocate', 'lu-journalctl-vacuum'],
      lesson: 'net-port-who-holds-it',
      tags: ['磁盘', '日志', '句柄']
    },

    {
      id: 'card-ls9-fstab-verify',
      cat: 'linux-storage',
      kind: 'distinguish',
      level: 3,
      front: '改完 `/etc/fstab` 直接重启，机器进了 emergency mode 起不来 —— 这个文件为什么这么危险，改完**先做什么**才安全？',
      hint: '有一条命令能在当前系统里把全部条目试挂一遍，不动正在跑的服务。',
      answer: 'mount -a（改完先验证，别急着重启）',
      why: '`/etc/fstab` 是**开机挂载表**：UUID 写错、设备不存在、选项拼错，systemd 会卡在依赖该挂载点的任务上；云主机没配好控制台就进不去系统。`mount -a` 在当前系统里按 fstab 挂一遍，写错**立刻报错**而不影响运行中的服务。判据：**无输出即成功**；报 `bad option` / `cannot find UUID=` 就是这一行有问题，立即改回。',
      contrast: '用 **UUID** 而不是 `/dev/vdb1`（设备名会漂移，多挂一块盘顺序就变 —— 本机 fstab 两条用的都是 UUID）；数据盘条目必须加 `nofail`（盘被摘掉或没插上时不阻塞启动），NFS 条目还要 `_netdev`；改前先 `cp /etc/fstab /etc/fstab.bak`；已经进了 emergency mode 的话，先 `mount -o remount,rw /` 让根分区可写才能编辑文件；`systemctl daemon-reload` 是 unit 文件改完要做的事，跟 fstab 无关；`findmnt --verify` 可做静态语法校验。',
      run: 'cat /etc/fstab',
      cmdIds: ['ls9-fstab', 'ls9-mount', 'ls9-new-disk-flow', 'ls9-systemd-mount'],
      tags: ['fstab', '启动', '云盘']
    },

    {
      id: 'card-ls9-mount-a',
      cat: 'linux-storage',
      kind: 'syntax',
      level: 2,
      front: '写完 fstab 条目，要在**不重启**的前提下验证它写对了没有：\n\n  ____ -a',
      hint: '就是那个"挂载"命令：不带参数会打印所有挂载点。',
      answer: 'mount',
      why: '`mount -a` 按 `/etc/fstab` 挂载所有"还没挂上"的条目：写错了它立刻报错（`bad option`、`can\'t find UUID`、`mount point does not exist`），当前系统不受影响 —— 这是 fstab 唯一的"安全试跑"。判据：无输出 = 全部条目正常；有报错**立即改回**，绝不要带着报错重启。',
      contrast: '`mount -o remount,rw /` 是紧急模式下的第一步（根分区默认只读，不改可写连 fstab 都编辑不了）；`mount -a` 不会卸载已挂载的条目，也不会覆盖正在使用的挂载点；验证完顺手 `df -h` 看容量对不对，避免"挂上了但挂错了盘"；`umount` 报 `target is busy` 时先用 `lsof +D /data` 找占用进程，别急着上 `-f`。',
      run: 'mount -a',
      cmdIds: ['ls9-mount', 'ls9-fstab', 'ls9-new-disk-flow'],
      tags: ['挂载', 'fstab', '验证']
    },

    {
      id: 'card-ls9-du-summary',
      cat: 'linux-storage',
      kind: 'syntax',
      level: 1,
      front: '只要一个总数，不要递归列出每个子目录：\n\n  du ____ /data',
      hint: '一个字母让它"汇总成一行"，另一个字母让它"人看得懂"。',
      answer: '-sh',
      why: '`-s` 是 summarize：只输出**一行**合计，不递归展开子目录；`-h` 把字节换算成 K/M/G。判据：输出形如 `6.2G /data` —— 一行搞定，可以直接和 `df -h` 的已用容量做对比。',
      contrast: '不加 `-s` 会把每个子目录都打出来（大目录几千行，得配 `| sort -rh | head` 才有用）；`--max-depth=1` 是"只看一层"的折中（比 `-s` 多一层细节）；**du 统计的是文件实际占用的块**：稀疏文件会比 `ls -l` 显示的小、硬链接只算一次，所以 `du` 的总和经常与 `ls -l` 逐个相加的结果不一致 —— 这是正常的，不是算错了。',
      run: 'du -sh /data',
      cmdIds: ['ls9-du', 'ls9-df', 'lt-sort-column'],
      lesson: 'du-culprit',
      tags: ['磁盘', 'du', '容量']
    },

    {
      id: 'card-ls9-df-path-docker',
      cat: 'linux-storage',
      kind: 'diagnose',
      level: 2,
      front: '容器镜像和容器日志快把盘写满了，你要先确认它的数据目录**落在了哪块盘上**（系统盘还是独立数据盘）。',
      hint: '给一个路径，看它所在的那个文件系统的余量。',
      answer: 'df -h /var/lib/docker',
      why: '`df <路径>` 显示这个路径**所在文件系统**的容量（不是路径本身占多少）。判据：输出里 `/var/lib/docker` 落在 `/dev/vdc1`（100G，用了 19%）—— 说明容器数据在独立盘上，撑爆它不会拖垮根分区；反过来如果它出现在 `/`（`/dev/vda1`，已用 32%）那一行，日志涨起来就会直接写满系统盘。',
      contrast: '权威答案在容器引擎自己的配置里：`docker info | grep "Docker Root Dir"`（真机）与 `/etc/docker/daemon.json` 的 `data-root`（改完要 `systemctl restart docker` 并**迁移旧数据**，只改配置会让新旧目录各留一份）；容器日志默认写在 `/var/lib/docker/containers/*/*-json.log`，不限制会单文件涨到几十 G —— 本机 daemon.json 里已经配了 `max-size: 10m, max-file: 3`，这就是"日志不吃盘"的标准做法；清理前先 `docker system df -v` 看清是镜像、容器还是构建缓存占的。',
      run: 'df -h /var/lib/docker',
      cmdIds: ['ls9-df', 'ls9-du', 'ls9-lsblk'],
      lesson: 'du-culprit',
      tags: ['磁盘', 'Docker', '容量']
    }

  );

  /* ==================================================================
     06 · Shell 脚本编程（shell）10 张
     ================================================================== */
  window.CC_CARDS.push(

    {
      id: 'card-sh-set-euo-pipefail',
      cat: 'shell',
      kind: 'distinguish',
      level: 3,
      front: '脚本开头那行 `set -euo pipefail` 常被当成模板照抄 —— 它到底解决了什么，又有哪些"看上去没生效"的例外？',
      hint: '三个开关分别管：出错、空变量、管道里的失败。',
      answer: 'set -euo pipefail：-e 出错即退 / -u 用未定义变量即报错 / -o pipefail 管道任一环失败即整体失败',
      why: '默认的 shell **不检查中间命令的失败**：`tar czf backup.tar.gz /var/www/html | obsutil cp - obs://bucket/` 这种管道只看**最后一个命令**的退出码，tar 失败也会显示"上传成功"。`-o pipefail` 让管道按最坏的那个退出码算。判据：故意让管道前半段失败（源目录不存在），加与不加 pipefail 的退出码分别是非 0 和 0 —— 本机 `/opt/scripts/backup.sh` 就是这么写的。',
      contrast: '`-u` 能挡住 `rm -rf $DIR/` 这种变量为空的灾难（配合 `"${DIR:?DIR 未设置}"` 更明确）；`-e` 有一份**例外清单**：`||`/`&&` 左侧的命令、`if`/`while` 条件、`!` 取反、以及 `grep` 没匹配（退出码 1）都不会触发退出 —— 这正是很多人觉得 `-e` "没用"的原因；调试时临时 `set -x` 打印每条命令，但别留在生产脚本里（日志会爆）。',
      run: 'cat /opt/scripts/backup.sh',
      cmdIds: ['sh-set-euo-pipefail', 'sh-debug', 'sh-log-error', 'sh-trap'],
      lesson: 'basic-tar-backup',
      tags: ['Shell', '健壮性', '脚本']
    },

    {
      id: 'card-sh-and-or-shortcircuit',
      cat: 'shell',
      kind: 'distinguish',
      level: 2,
      front: '`curl -sf http://127.0.0.1:8080/health >/dev/null || systemctl restart myapp` —— 这里为什么是 `||` 而不是 `&&`？写反会怎样？',
      hint: '两个连接符的语义是"成功才做"与"失败才做"。',
      answer: '`||`：前一条**失败**才执行后一条（`&&` 是成功才执行）',
      why: '`&&` 和 `||` 都用**退出码**做短路判断：`A && B` 只在 A 成功（退出码 0）时跑 B；`A || B` 只在 A 失败（非 0）时跑 B。健康检查要的是"**探测失败才重启**"，所以必须 `||`。判据：`curl -sf` 在接口返回 4xx/5xx 时退出码非 0（这就是 `-f` 的作用），重启被触发；一切正常时 `||` 右侧根本不执行。',
      contrast: '`;` 是无条件顺序执行、**不看退出码**，只能用来串"无论如何都要做"的清理动作，绝不能串有依赖关系的两步；`cmd1 && cmd2 || cmd3` 这种"三明治"有坑：`cmd2` 失败时 `cmd3` 也会执行（看着像 if/else，其实不是）；`curl -s` 会把错误信息一起静默，脚本里用 `-sS` 保留错误行；健康检查还必须配 `--connect-timeout`/`--max-time`，否则挂死的请求会拖住整个检查。',
      run: 'cat /opt/scripts/health-check.sh',
      cmdIds: ['sh-log-error', 'sh-template-health', 'ln-curl', 'sh-if'],
      lesson: 'sh-stderr-log',
      tags: ['Shell', '短路', '健康检查']
    },

    {
      id: 'card-sh-grep-exit-code',
      cat: 'shell',
      kind: 'distinguish',
      level: 3,
      front: '监控脚本什么都没输出就结束了，日志里也没有任何报错 —— 它其实是被**一条"没找到"的命令**提前终止的。',
      hint: '有一个常用命令在"没匹配"时退出码是 1。',
      answer: 'grep -c "…" 文件 || true（或改用 if grep -q …）',
      why: '`grep` 的退出码有三种：0 = 有匹配、1 = **无匹配**、2 = 出错。"没匹配"在监控场景里是**正常结果**，但在 `set -e` 的脚本里等价于失败，脚本当场退出。判据：脚本"提前结束且没有任何自己的报错"、手工再跑一遍又能跑通，就是这一类；`bash -x` 能看到它退在哪一行。',
      contrast: '`grep -q` 只看退出码、不产生输出，最适合 `if` 判断；要拿数字统计用 `grep -c` 并显式接住非 0（`n=$(grep -c ... || true)`）；同类"结果非 0 属正常"的命令还有 `diff`（有差异返回 1）、`test` 系列、`kill -0`（进程不在返回 1），凡是这类命令都要显式接住；`set -e` 的例外清单要背下来，否则会写出"有时生效有时不生效"的脚本。',
      run: 'grep -c healthz /var/log/nginx/access.log',
      cmdIds: ['sh-set-euo-pipefail', 'lt-grep', 'sh-log-error'],
      lesson: 'sh-stderr-log',
      tags: ['Shell', '退出码', '监控']
    },

    {
      id: 'card-sh-cron-output-env',
      cat: 'shell',
      kind: 'diagnose',
      level: 2,
      front: '定时任务到点确实跑了，但脚本里的报错你一条都看不到，连命令都提示找不到。',
      hint: 'cron 的环境和你登录时的环境不是同一个，输出也不会自动送到你面前。',
      answer: 'cat /etc/crontab（先看清 PATH 与输出重定向是怎么写的）',
      why: 'cron 用**极简环境**启动任务：本机 `/etc/crontab` 顶部就把 `PATH` 写死成 `/sbin:/bin:/usr/sbin:/usr/bin`，你 `~/.bashrc` 里的别名、变量、`/usr/local/bin` 全都不存在 —— 所以脚本里的命令要写绝对路径。而 stdout/stderr 会被 cron 拿去发邮件，没配 MTA 就**直接丢弃**。判据：文件里两条任务的写法就是标准答案 —— `>> /var/log/backup.log 2>&1` 自己把输出收走。',
      contrast: '`/etc/crontab` 多一个"用户名"字段（`分 时 日 月 周 用户 命令`），而 `crontab -e` 写的用户级任务**没有**这一列，抄错就整行不生效；`systemctl status crond` / `journalctl -u crond` 能看到任务有没有被调起；cron 的 cwd 是用户家目录（不是脚本所在目录），脚本里必须用绝对路径或先 `cd`；要长期稳定的任务建议改用 systemd timer（有日志、有依赖关系、失败可查）。',
      run: 'cat /etc/crontab',
      cmdIds: ['lu-crontab', 'lu-cron-format', 'lu-systemd-timer', 'sh-template-backup'],
      lesson: 'journalctl-unit',
      tags: ['cron', '环境', '排障']
    },

    {
      id: 'card-sh-systemd-unit-env',
      cat: 'shell',
      kind: 'diagnose',
      level: 2,
      front: '脚本手动执行完全正常，做成 systemd 服务就提示找不到命令、变量也是空的。',
      hint: '服务不是登录 shell 启动的，所以不会读你的 .bashrc。',
      answer: 'cat /etc/systemd/system/myapp.service（看它怎么声明环境与工作目录）',
      why: 'systemd 由 PID 1 启动服务，**不经过登录 shell**：`~/.bashrc`、`/etc/profile` 里的 export 它完全看不到，`PATH` 也是 systemd 自己的默认值。所以 unit 里要么用**绝对路径**（本机 unit 的 `ExecStart=/usr/bin/java -jar /opt/myapp/app.jar` 就是范例），要么显式 `Environment=` / `EnvironmentFile=` 注入变量。判据：`journalctl -u myapp` 里报 `xxx: command not found` 就是 PATH 问题、报变量为空就是环境没注入。',
      contrast: '`WorkingDirectory=` 决定相对路径的基准（不写就是 `/`）；`User=` 决定以哪个身份运行，换了用户之后 `$HOME`、文件权限、可读的证书全都跟着变（本机是 `User=deploy`）；改完 unit 必须 `systemctl daemon-reload` 才生效；临时调整用 `systemctl edit myapp`（生成 override 片段），不要直接改发行版自带的 unit（升级会被覆盖）；全局变量可写 `/etc/environment`，但它**不支持变量展开和复杂语法**。',
      run: 'cat /etc/systemd/system/myapp.service',
      cmdIds: ['lu-systemd-unit', 'lu-systemctl-daemon-reload', 'sh-systemd-wrapper', 'sh-var-export'],
      lesson: 'sh-case-dispatch',
      tags: ['systemd', '环境', '排障']
    },

    {
      id: 'card-sh-cron-step',
      cat: 'shell',
      kind: 'syntax',
      level: 2,
      front: '让它**每 5 分钟**跑一次（也就是每小时 12 次），五个时间字段里的第一个该写什么？\n\n  ____ * * * * /opt/scripts/backup.sh',
      hint: '五个字段是"分 时 日 月 周"，要的是"步长"而不是"第几分钟"。',
      answer: '*/5',
      why: '`*/5` 表示"从 0 开始每隔 5 个单位"（0,5,10,…,55）；只写 `5` 是"每小时的**第 5 分钟**跑一次"，两者相差 12 倍。判据：本机 crontab 里两条任务正好是对照组 —— `0 3 * * *` 是每天 03:00 一次，`*/5 * * * *` 是每 5 分钟一次。',
      contrast: '日（第 3 字段）与周（第 5 字段）是"或"的关系，两个都写会变成并集、容易多跑；`@daily`、`@reboot` 是简写；时区跟系统走（容器里要确认 TZ）；最要命的是**环境**：cron 的 `PATH` 只有 `/sbin:/bin:/usr/sbin:/usr/bin`，命令要写绝对路径，输出必须自己 `>> log 2>&1` 收走，否则报错直接进邮件黑洞。',
      run: 'crontab -l',
      cmdIds: ['lu-cron-format', 'lu-crontab', 'sh-template-log-clean'],
      tags: ['cron', '定时', '语法']
    },

    {
      id: 'card-sh-test-brackets',
      cat: 'shell',
      kind: 'distinguish',
      level: 2,
      front: '脚本报 `[: missing \']\'` 或 `unary operator expected`，可判断语句看着完全正常。',
      hint: '`[` 不是一个符号，它是一个命令，参数之间要用空格隔开。',
      answer: '[ -f "$file" ]：方括号两侧留空格，变量加双引号（复杂判断用 [[ ]]）',
      why: '`[` 就是 `/usr/bin/[`（`test` 的另一个名字）；既然是命令，`[` 与 `-f`、操作数与 `]` 之间**必须**有空格。而 `[ -f $file ]` 在 `$file` 为空时会退化成 `[ -f ]`，于是报 `unary operator expected`。判据：看到 `[: missing \']\'` = 少了空格；看到 `unary operator expected` = 变量为空（**必须给变量加双引号**）。',
      contrast: '`[[ ]]` 是 bash 关键字（不是命令）：不做分词、支持 `&&`/`||`、`=~` 正则与通配符匹配，所以更安全，但**不是 POSIX**（`sh`/dash 里没有，shebang 写 `#!/bin/sh` 时会报错）；数值比较要用 `-eq/-gt/-lt`，在 `[ ]` 里写 `[ "$a" < "$b" ]` 时 `<` 会被当成**重定向**（真机上会凭空生成一个文件，经典事故）；空值判断用 `[ -z "$x" ]` / `[ -n "$x" ]`，字符串比较两侧也别忘引号。',
      cmdIds: ['sh-test', 'sh-if', 'sh-case', 'sh-param-default'],
      lesson: 'sh-case-dispatch',
      tags: ['Shell', '条件', '脚本']
    },

    {
      id: 'card-sh-enable-vs-start',
      cat: 'shell',
      kind: 'distinguish',
      level: 2,
      front: '把脚本做成服务之后，手动 `start` 能跑，机器重启却没起来 —— `start` 与 `enable` 管的根本不是一回事。',
      hint: '一个管"现在跑起来"，另一个管"以后每次开机都跑"。',
      answer: 'systemctl enable myapp（enable = 开机自启；start = 本次运行）',
      why: '`start` 只影响本次运行；`enable` 才是在 `multi-user.target.wants` 下建软链接、让系统开机时自动拉起。判据：`systemctl is-enabled myapp` 输出 `enabled`（不是 `disabled`/`static`）；unit 里的 `Restart=on-failure` 管的是"**进程崩了自动拉起**"，与开机自启是三件不同的事，别混为一谈。',
      contrast: '改过 unit 文件（尤其新增/改动 `[Install]` 段）必须先 `systemctl daemon-reload` 再 `enable`，否则 enable 用的是旧 unit；`systemctl status` 的 `Loaded:` 行里也能直接看到 `enabled/disabled`；`disable` **不会**停掉正在跑的服务（要另外 `stop`）；容器里没有 systemd（PID 1 就是应用自己），这套命令不适用，进程守护交给编排平台。',
      run: 'systemctl enable myapp',
      cmdIds: ['lu-systemctl-enable', 'lu-systemctl', 'lu-systemd-unit', 'sh-systemd-wrapper'],
      lesson: 'journalctl-unit',
      tags: ['systemd', '自启', '服务']
    },

    {
      id: 'card-sh-curl-exit-code',
      cat: 'shell',
      kind: 'distinguish',
      level: 2,
      front: '健康检查脚本里的 `curl` 永远返回成功，哪怕接口明明在返回 500。',
      hint: 'HTTP 状态码和进程退出码是两个不同的东西。',
      answer: 'curl -sf http://127.0.0.1:8080/health（-f 让 HTTP ≥400 变成非 0 退出码）',
      why: '默认情况下 `curl` **不把 HTTP 错误当失败**：接口返回 500，它照样以退出码 0 结束（只有连接层面失败才算失败）。`-f`（--fail）让 4xx/5xx 变成非 0 退出码（22），这样 `if curl ...` 才真的有判断力。判据：接口正常时能看到业务返回的 `{"status":"UP",...}`；返回 5xx 时 `-f` 下没有输出且退出码非 0，健康检查才会去重启服务。',
      contrast: '`-s` 会把错误信息一起静默掉，脚本里应该用 `-sS`（保留错误行）；只想看状态码用 `-o /dev/null -w "%{http_code}"`（也顺便避开 HEAD 不被支持的问题）；必须配 `--connect-timeout 3 --max-time 5`，否则一个挂死的请求会拖住整个检查脚本、甚至让 cron 任务层层堆叠；`-k` 跳过证书校验只用于排障，**绝不能进生产脚本**（等于关掉中间人防护）。',
      run: 'curl -sf http://127.0.0.1:8080/health',
      cmdIds: ['ln-curl', 'ln-curl-timing', 'sh-template-health', 'ln-http-version'],
      lesson: 'net-where-is-the-latency',
      tags: ['Shell', '健康检查', 'curl']
    },

    {
      id: 'card-sh-backup-verify',
      cat: 'shell',
      kind: 'diagnose',
      level: 3,
      front: '早上的巡检：备份脚本报"执行成功"，但产出的备份包大小不对劲 —— 你要先看**产出物本身**。',
      hint: '脚本报的"成功"只反映最后一条命令的退出码。',
      answer: 'ls -l /data/backup（看文件大小与时间戳）',
      why: '"脚本成功"往往只说明最后一条 `echo` 成功：管道默认只看最后一个命令的退出码，`tar` 写失败也可能被吞掉。所以巡检要看**产出物**：`ls -l` 给大小与时间，本机最新的 `db-2024-03-18.sql.gz` 是 886046720 字节、时间 03:20 —— 说明昨晚确实产出了。判据就两条：**有没有今天的文件、大小和昨天是不是同一量级**。',
      contrast: '更严格的写法是在脚本里自检：`set -euo pipefail` 加 `[ -s "$FILE" ] || { echo "备份为空"; exit 1; }`，再 `tar tzf` 抽查归档可读性；第一嫌疑永远是磁盘满（`df -h`，本机 `/data` 就是 100%）—— 写满时 `tar` 会报 write error，但退出码可能被管道掩盖；`ls -lh` 带人类可读单位、`ls -lht` 按时间倒序最快看出"最新的包是什么时候的"；大小对但内容可疑时用 `md5sum`/`sha256sum` 比对校验值。',
      run: 'ls -l /data/backup',
      cmdIds: ['sh-template-backup', 'ls9-df', 'lb-md5sum', 'sh-set-euo-pipefail'],
      lesson: 'basic-free-space',
      tags: ['备份', '巡检', '脚本']
    }

  );
})();
