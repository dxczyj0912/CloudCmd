/* data/linux-basic.js · 分类 01 Linux 基础与文件操作 */
(function () {
  'use strict';

  var catId = 'linux-basic';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ---------- 1 / 60 ---------- */
    {
      id: 'lb-ls',
      name: 'ls',
      alias: ['list', 'll'],
      level: 1,
      syntax: 'ls [选项] [文件|目录]',
      summary: '按名称列出目录内容，登录服务器后查看现场的第一步。',
      desc: '默认按名称排序，不显示以 `.` 开头的隐藏文件。生产上高频组合是 `ls -lh` 看大小、`ls -lht` 按时间排、`ls -lhS` 按体积排，用来快速判断磁盘空间被谁占了。',
      params: [
        { flag: '-l', desc: '长格式：权限、属主、大小、修改时间' },
        { flag: '-a', desc: '显示隐藏文件（含 . 与 ..）' },
        { flag: '-h', desc: '人类可读的大小（KB/MB/GB），需与 -l 或 -s 同用' },
        { flag: '-t', desc: '按修改时间排序，最新的在最前' },
        { flag: '-S', desc: '按文件大小排序，最大的在最前' },
        { flag: '-d', desc: '只显示目录本身，不展开目录内容' },
        { flag: '-R', desc: '递归列出所有子目录' }
      ],
      examples: [
        { cmd: 'ls -lht /var/log', desc: '按修改时间倒序列出日志目录，排障第一步' },
        { cmd: 'ls -lhS /data/backup', desc: '按体积从大到小排，快速找出最占空间的备份包' },
        { cmd: 'ls -ld /data', desc: '只看 /data 目录本身的权限和属主，而不是里面的文件' }
      ],
      notes: [
        '`-h` 必须和 `-l` 或 `-s` 一起用，单独写 `ls -h` 没有任何效果',
        '输出列宽会随终端变化，脚本里解析文件列表请用 `find` 或 `stat`，不要 `awk` 切 `ls`',
        '目录下文件极多时加 `-f` 关闭排序，可以明显加快输出'
      ],
      related: ['lb-find', 'lb-stat', 'lb-tree', 'lb-cp'],
      docs: 'https://man7.org/linux/man-pages/man1/ls.1.html',
      tags: ['文件', '目录', '列表']
    },

    /* ---------- 2 / 60 ---------- */
    {
      id: 'lb-cd',
      name: 'cd',
      alias: ['chdir'],
      level: 1,
      syntax: 'cd [目录]',
      summary: '切换 Shell 的当前工作目录，所有相对路径都以它为基准。',
      desc: 'Shell 内置命令，不启动子进程，所以它只能改当前 Shell 自己的目录。不带参数回到用户家目录 `$HOME`，`cd ..` 上一级，`cd -` 回到上一次的目录。',
      params: [
        { flag: '..（无参数形式）', desc: '进入上一级目录' },
        { flag: '~', desc: '进入当前用户家目录，等价于不带参数' },
        { flag: '-', desc: '回到上一次所在目录，并打印该路径' },
        { flag: '-P', desc: '解析软链接，进入真实物理路径' },
        { flag: '-L', desc: '跟随软链接（默认行为）' }
      ],
      examples: [
        { cmd: 'cd /data/app/logs', desc: '进入应用日志目录' },
        { cmd: 'cd /data/app && cd -', desc: '进入应用目录后再一键跳回原目录' },
        { cmd: 'cd /data/app || exit 1', desc: '脚本里的安全写法：目录不存在就直接退出，避免后续命令跑在错误路径' }
      ],
      notes: [
        '`cd` 是 Shell 内置命令，`sudo cd /root` 一定失败，因为 sudo 只能给外部命令提权',
        '目录名带空格要加引号：`cd "app logs"`',
        '脚本里务必写 `cd /data/app || exit 1`，否则 `cd` 失败后后面的 `rm`、`tar` 会在错误目录执行'
      ],
      related: ['lb-pwd', 'lb-ls', 'lb-cd-dash'],
      docs: 'https://man7.org/linux/man-pages/man1/bash.1.html',
      tags: ['目录', '导航', '内置命令']
    },

    /* ---------- 3 / 60 ---------- */
    {
      id: 'lb-pwd',
      name: 'pwd',
      alias: ['print working directory'],
      level: 1,
      syntax: 'pwd [-P]',
      summary: '打印当前所在的绝对路径，执行危险操作前必须确认位置。',
      desc: '默认输出逻辑路径（可能仍带软链接名），`pwd -P` 输出解析软链接后的物理路径。删除、格式化这类操作前先 `pwd` 一眼，是最便宜的保险。',
      params: [
        { flag: '-P', desc: '显示解析软链接后的真实物理路径' },
        { flag: '-L', desc: '显示逻辑路径（默认）' }
      ],
      examples: [
        { cmd: 'pwd', desc: '执行 rm -rf 之前确认自己在哪个目录' },
        { cmd: 'pwd -P', desc: '查看软链接指向的真实物理路径，例如 /data 实际挂载在数据盘上' },
        { cmd: 'cd /data/app && pwd && ls -l', desc: '切目录后立刻确认位置与内容，再决定下一步操作' }
      ],
      notes: [
        '从软链接目录 `cd` 进去时 `pwd` 显示的是链接路径，要真实路径请用 `pwd -P`',
        '脚本里需要绝对路径时优先用 `pwd -P`，避免把软链接路径写进配置文件'
      ],
      related: ['lb-cd', 'lb-readlink', 'lb-realpath'],
      docs: 'https://man7.org/linux/man-pages/man1/pwd.1.html',
      tags: ['目录', '路径', '确认']
    },

    /* ---------- 4 / 60 ---------- */
    {
      id: 'lb-mkdir',
      name: 'mkdir',
      alias: ['make directory'],
      level: 1,
      syntax: 'mkdir [-p] [-m 权限] 目录...',
      summary: '创建目录，`-p` 能一次建出多级父目录且重复执行不报错。',
      desc: '不带 `-p` 时父目录不存在会直接报错。部署脚本里几乎都用 `mkdir -p`，因为它幂等：目录已存在时静默通过，脚本可以反复执行。',
      params: [
        { flag: '-p', desc: '递归创建父目录，已存在时不报错' },
        { flag: '-m', desc: '直接指定权限模式，如 -m 750' },
        { flag: '-v', desc: '每创建一个目录就打印一行' },
        { flag: '-Z', desc: '设置 SELinux 安全上下文（SELinux 开启时生效）' }
      ],
      examples: [
        { cmd: 'mkdir -p /data/app/{logs,conf,data}', desc: '一次建出应用所需的三个子目录' },
        { cmd: 'mkdir -p -m 750 /data/secure', desc: '建目录时直接给 750，避免先出现 755 再改权限的窗口期' },
        { cmd: 'mkdir -p /data/backup/$(date +%F)', desc: '脚本里按当天日期建备份目录，重复执行也不会报错' }
      ],
      notes: [
        '`-m` 是显式指定模式，不受 umask 影响；不加 `-m` 时权限为 777 减去 umask（通常是 755）',
        '想删掉刚建的空目录用 `rmdir`，比 `rm -rf` 安全得多',
        '`-p` 也会静默接受"目录已存在"，所以别指望它报错来发现路径写错'
      ],
      related: ['lb-rmdir', 'lb-touch', 'lb-cp', 'lb-install'],
      docs: 'https://man7.org/linux/man-pages/man1/mkdir.1.html',
      tags: ['目录', '创建', '脚本']
    },

    /* ---------- 5 / 60 ---------- */
    {
      id: 'lb-rmdir',
      name: 'rmdir',
      alias: ['remove directory'],
      level: 1,
      syntax: 'rmdir [-p] 目录...',
      summary: '只能删除空目录，比 `rm -r` 安全，适合清理临时挂载点。',
      desc: '目录非空时直接拒绝执行，这个"限制"正好可以当护栏用。要删非空目录只能用 `rm -r`，而 `rm -r` 没有回头路，所以清理脚本里优先考虑 `rmdir`。',
      params: [
        { flag: '-p', desc: '删除目录后若父目录也空了，一并删掉' },
        { flag: '-v', desc: '每删除一个目录就打印一行' },
        { flag: '--ignore-fail-on-non-empty', desc: '目录非空时也不报错（GNU 扩展）' }
      ],
      examples: [
        { cmd: 'rmdir /data/tmp/upload', desc: '删除空的临时目录，非空会报错，不会误删数据' },
        { cmd: 'rmdir -p /data/tmp/a/b/c', desc: '从最里层往外删，父目录空了也一起清理' },
        { cmd: 'umount /mnt/nfs && rmdir /mnt/nfs', desc: '卸载 NFS 后清理空挂载点' }
      ],
      notes: [
        '报 `Directory not empty` 说明目录里还有文件，这时不要图省事直接换 `rm -rf`，先 `ls -la` 看清里面是什么',
        '`rmdir` 删不掉非空目录是设计如此，不是权限问题'
      ],
      related: ['lb-rm', 'lb-mkdir', 'lb-ls'],
      docs: 'https://man7.org/linux/man-pages/man1/rmdir.1.html',
      tags: ['目录', '删除', '安全']
    },

    /* ---------- 6 / 60 ---------- */
    {
      id: 'lb-tree',
      name: 'tree',
      alias: ['目录树'],
      level: 2,
      syntax: 'tree [选项] [目录]',
      summary: '用树状图递归展示目录层级，快速看清项目或配置结构。',
      desc: '默认一路递归到底，大目录会刷屏，所以实际使用时几乎都会配 `-L` 限层、`-d` 只看目录。多数发行版需额外安装：CentOS `yum install -y tree`，Ubuntu `apt install -y tree`。',
      params: [
        { flag: '-L N', desc: '只显示 N 层，防止输出爆炸' },
        { flag: '-d', desc: '只列出目录，不列文件' },
        { flag: '-a', desc: '显示隐藏文件' },
        { flag: '-I 模式', desc: '排除匹配的文件或目录，多个模式用 | 分隔' },
        { flag: '--du', desc: '同时显示每个目录占用的空间' },
        { flag: '-h', desc: '显示人类可读的大小（与 --du 同用）' }
      ],
      examples: [
        { cmd: 'tree -L 2 /etc/nginx', desc: '两层内看清 Nginx 配置的整体布局' },
        { cmd: 'tree -d -L 2 /data', desc: '只看目录不看文件，快速掌握数据盘结构' },
        { cmd: 'tree -a -I ".git|node_modules" -L 3 /data/app', desc: '显示隐藏文件，但排除版本库和依赖目录' }
      ],
      notes: [
        '默认不安装，报 `command not found` 时先装包：CentOS 用 `yum install -y tree`，Ubuntu/Debian 用 `apt install -y tree`',
        '目录巨大时一定要加 `-L`，否则几万行输出会把终端卡住',
        '`-I` 的模式区分大小写，多个模式必须加引号并用 `|` 连接'
      ],
      related: ['lb-find', 'lb-ls', 'lb-dirname'],
      docs: 'https://manpages.debian.org/bookworm/tree/tree.1.en.html',
      tags: ['目录', '结构', '可视化']
    },

    /* ---------- 7 / 60 ---------- */
    {
      id: 'lb-basename',
      name: 'basename',
      alias: ['取文件名'],
      level: 2,
      syntax: 'basename 路径 [后缀]',
      summary: '从完整路径里截出最后的文件名，脚本拼日志名时最常用。',
      desc: '和 `dirname` 正好相反：一个取尾、一个取头。给第二个参数可以顺手去掉指定后缀，例如把 `/data/app/order.jar` 直接变成 `order`。',
      params: [
        { flag: '-s 后缀', desc: '同时去掉指定后缀，等价于写第二个参数' },
        { flag: '-a', desc: '支持一次传入多个路径，逐个输出' },
        { flag: '-z', desc: '输出用 NUL 分隔，便于脚本安全处理' }
      ],
      examples: [
        { cmd: 'basename /data/app/order-service.jar', desc: '取出文件名 order-service.jar' },
        { cmd: 'basename /data/app/order-service.jar .jar', desc: '去掉 .jar 后缀，得到服务名 order-service' },
        { cmd: 'basename -a /data/logs/*.log', desc: '批量把一批路径压成纯文件名，交付清单时好用' }
      ],
      notes: [
        '路径以 `/` 结尾时返回空串，例如 `basename /data/logs/`，脚本里要先去掉尾部斜杠',
        '它只做字符串处理，不检查文件是否真的存在'
      ],
      related: ['lb-dirname', 'lb-realpath', 'lb-ls'],
      docs: 'https://man7.org/linux/man-pages/man1/basename.1.html',
      tags: ['路径', '字符串', '脚本']
    },

    /* ---------- 8 / 60 ---------- */
    {
      id: 'lb-dirname',
      name: 'dirname',
      alias: ['取目录名'],
      level: 2,
      syntax: 'dirname 路径',
      summary: '从完整路径里截出目录部分，脚本里定位配置目录时常用。',
      desc: '`dirname /etc/nginx/nginx.conf` 得到 `/etc/nginx`。脚本里最经典的写法是 `cd "$(dirname "$0")"`，先锁定脚本自身所在目录再往下跑，这样不管从哪里调用都不会跑偏。',
      params: [
        { flag: '-z', desc: '输出用 NUL 分隔，便于脚本安全处理' },
        { flag: '--help / --version', desc: '查看帮助与版本（GNU coreutils）' }
      ],
      examples: [
        { cmd: 'dirname /etc/nginx/nginx.conf', desc: '取出配置所在目录 /etc/nginx' },
        { cmd: 'cd "$(dirname "$0")"', desc: '脚本里切到脚本自身所在目录，定时任务调用也不会跑偏' },
        { cmd: 'dirname /data/app/logs/order.log', desc: '得到 /data/app/logs，常用于拼接收割后的归档路径' }
      ],
      notes: [
        '`dirname` 只做字符串处理，不判断目录是否存在',
        '嵌套引号的经典写法 `cd "$(dirname "$0")"` 要原样照抄，少一层引号遇到带空格的路径就会失败'
      ],
      related: ['lb-basename', 'lb-realpath', 'lb-pwd'],
      docs: 'https://man7.org/linux/man-pages/man1/dirname.1.html',
      tags: ['路径', '字符串', '脚本']
    },

    /* ---------- 9 / 60 ---------- */
    {
      id: 'lb-cat',
      name: 'cat',
      alias: ['concatenate'],
      level: 1,
      syntax: 'cat [选项] [文件...]',
      summary: '把文件内容一次性输出到屏幕，看小文件和拼接内容最快。',
      desc: '适合几十行的小文件；几百 MB 的日志直接 `cat` 会把终端刷爆甚至卡死，那种场景用 `less` 或 `tail`。传入多个文件时按顺序拼接输出，也可以用来合并文件。',
      params: [
        { flag: '-n', desc: '给所有行编号（含空行）' },
        { flag: '-b', desc: '只给非空行编号' },
        { flag: '-s', desc: '把连续多个空行压缩成一个' },
        { flag: '-E', desc: '在每行末尾显示 $，用于检查行尾' }
      ],
      examples: [
        { cmd: 'cat /etc/nginx/nginx.conf', desc: '查看 Nginx 主配置内容' },
        { cmd: 'cat /etc/os-release', desc: '确认云主机跑的是 CentOS 还是 Ubuntu，决定后续用 yum 还是 apt' },
        { cmd: 'cat /data/logs/app-1.log /data/logs/app-2.log > /data/logs/all.log', desc: '把两个日志文件按顺序合并成一个' }
      ],
      notes: [
        '不要用 `cat` 打开 G 级日志，会把 SSH 会话卡住；看大文件用 `less`，看末尾用 `tail`',
        '`cat > file` 会立刻清空原文件，误操作不可恢复，写之前想清楚',
        '`cat file | grep xxx` 是多余的管道，直接写 `grep xxx file` 更省一个进程',
        '检查行尾和不可见字符请用 `cat -A`，普通 `cat` 看不出来'
      ],
      related: ['lb-cat-a', 'lb-tac', 'lb-less', 'lb-head', 'lb-tail'],
      docs: 'https://man7.org/linux/man-pages/man1/cat.1.html',
      tags: ['文件', '查看', '文本']
    },

    /* ---------- 10 / 60 ---------- */
    {
      id: 'lb-tac',
      name: 'tac',
      alias: ['反向 cat'],
      level: 2,
      syntax: 'tac [选项] [文件...]',
      summary: '把文件按行倒序输出，名字就是 `cat` 反过来写。',
      desc: '日志排障时想从最新一行往回看，`tac` 比先算总行数再 `tail` 更省事。也可以用 `-s` 指定别的分隔符，处理按空行或分号分段的文件。',
      params: [
        { flag: '-s 分隔符', desc: '指定记录分隔符，默认是换行符' },
        { flag: '-b', desc: '把分隔符附在记录开头而不是结尾' },
        { flag: '-r', desc: '把分隔符当正则表达式解释' }
      ],
      examples: [
        { cmd: 'tac /var/log/messages | head -50', desc: '从最新一行往前看 50 行系统日志' },
        { cmd: 'tac /data/app/logs/order.log | less', desc: '倒序进 less，从最新记录往历史上翻' },
        { cmd: 'tac -s ";" /data/app/batch.txt', desc: '按分号分段倒序，处理非按行组织的批处理记录' }
      ],
      notes: [
        '`tac` 需要先读完整份文件再反转，超大文件会吃内存，只看末尾还是用 `tail`',
        '`tac` 不排序，只反转顺序，不要和 `sort -r` 混为一谈'
      ],
      related: ['lb-cat', 'lb-tail', 'lb-less'],
      docs: 'https://man7.org/linux/man-pages/man1/tac.1.html',
      tags: ['文件', '倒序', '日志']
    },

    /* ---------- 11 / 60 ---------- */
    {
      id: 'lb-less',
      name: 'less',
      alias: ['分页查看', 'more 增强版'],
      level: 1,
      syntax: 'less [选项] 文件',
      summary: '分页浏览大文件，打开瞬间完成，看日志最推荐的方式。',
      desc: '只按需读取，打开 G 级日志也是秒开。支持 `/` 向下搜索、`?` 向上搜索、`g`/`G` 跳首尾，`F` 进入实时跟踪（类似 `tail -f`），比 `more` 多了往回翻的能力。',
      params: [
        { flag: '-N', desc: '显示行号' },
        { flag: '+F', desc: '打开后直接进入实时跟踪模式' },
        { flag: '-S', desc: '超长行不折行，左右滚动查看' },
        { flag: '-i', desc: '搜索时忽略大小写' },
        { flag: '+G', desc: '直接跳到文件末尾' }
      ],
      examples: [
        { cmd: 'less /var/log/messages', desc: '分页查看系统日志，不占内存也不刷屏' },
        { cmd: 'tail -f /var/log/nginx/access.log', desc: '实时跟踪访问日志（真机上 `less +F` 是同效果的交互式写法，按 Ctrl+C 停下还能往回翻；教学终端不支持交互键，所以这里用 tail -f 演示"跟随"这件事）' },
        { cmd: 'less -N /etc/nginx/nginx.conf', desc: '带行号看配置，配合报错信息里的行号快速定位' }
      ],
      notes: [
        '`+F` 进入跟踪模式后要先按 `Ctrl+C` 才能继续上下翻页，退出统一按 `q`',
        '一行业务日志很长时加 `-S`，否则一行会折成整屏，很难看',
        '`less` 只读不改，是查看线上日志最安全的方式；要编辑请用 `vim`'
      ],
      related: ['lb-more', 'lb-tail', 'lb-cat', 'lb-head'],
      docs: 'https://man7.org/linux/man-pages/man1/less.1.html',
      tags: ['文件', '分页', '日志']
    },

    /* ---------- 12 / 60 ---------- */
    {
      id: 'lb-more',
      name: 'more',
      alias: ['分页'],
      level: 1,
      syntax: 'more [选项] 文件',
      summary: '最老的分页查看工具，只支持向下翻，任何精简系统都有。',
      desc: '容器镜像或极小化安装里常常没有 `less`，但一定有 `more`。空格翻一屏、回车滚一行、`q` 退出，缺点是翻过头就回不去了。',
      params: [
        { flag: '-n 行数', desc: '每屏显示的行数' },
        { flag: '+行号', desc: '从指定行开始显示' },
        { flag: '-s', desc: '把连续空行压缩成一行' },
        { flag: '-d', desc: '在底部显示翻页提示' }
      ],
      examples: [
        { cmd: 'more /etc/services', desc: '分屏查看系统服务与端口对照表' },
        { cmd: 'sed -n "100,$p" /var/log/boot.log', desc: '从第 100 行开始往下看启动日志（分页器本身不负责定位行号，定位交给 sed）' },
        { cmd: 'dmesg | more', desc: '内核日志分屏查看，避免开机信息刷屏' }
      ],
      notes: [
        '`more` 不能往回翻，看长文档优先用 `less`',
        '管道场景下部分实现的搜索和回滚能力受限，脚本里不要依赖 `more` 做交互'
      ],
      related: ['lb-less', 'lb-cat', 'lb-head'],
      docs: 'https://man7.org/linux/man-pages/man1/more.1.html',
      tags: ['文件', '分页', '查看']
    },

    /* ---------- 13 / 60 ---------- */
    {
      id: 'lb-head',
      name: 'head',
      alias: ['取开头'],
      level: 1,
      syntax: 'head [-n 行数] [文件...]',
      summary: '只看文件开头若干行，确认文件格式与表头时最顺手。',
      desc: '默认输出前 10 行。`-n` 可以取负数：`-n -5` 表示"除了最后 5 行，其余全要"。判断一个陌生文件是什么格式、CSV 有哪些列，用它最快。',
      params: [
        { flag: '-n 行数', desc: '输出前 N 行，默认 10 行' },
        { flag: '-c 字节数', desc: '按字节数取开头内容' },
        { flag: '-q', desc: '多个文件时不显示文件名分隔头' },
        { flag: '-v', desc: '总是显示文件名分隔头' }
      ],
      examples: [
        { cmd: 'head -n 20 /data/app/logs/order.log', desc: '看日志开头，确认时间格式和字段含义' },
        { cmd: 'head -n 1 /data/csv/user.csv', desc: '取出 CSV 表头，确认列名和顺序' },
        { cmd: 'head -c 100 /dev/urandom | base64', desc: '取 100 字节随机数据并做 Base64 编码，用于生成随机口令' }
      ],
      notes: [
        '`head -n -5` 表示去掉末尾 5 行，不是"前 5 行"，写脚本时容易看反',
        '与 `tail` 组合可以取文件中段，例如 `head -n 100 f | tail -n 10`'
      ],
      related: ['lb-tail', 'lb-cat', 'lb-less', 'lb-split'],
      docs: 'https://man7.org/linux/man-pages/man1/head.1.html',
      tags: ['文件', '查看', '开头']
    },

    /* ---------- 14 / 60 ---------- */
    {
      id: 'lb-tail',
      name: 'tail',
      alias: ['取末尾', 'tailf'],
      level: 2,
      syntax: 'tail [选项] [文件...]',
      summary: '查看文件末尾内容，`-f` 可以实时跟踪日志滚动输出。',
      desc: '排障最常用的两条：`tail -n 100` 看最后 100 行，`tail -f` 挂在那里实时看日志。`-F` 等价于 `-f --retry`，日志被 `logrotate` 切割或文件被重建后能自动重新打开，长期跟踪应该用它。',
      params: [
        { flag: '-n 行数', desc: '输出末尾 N 行，默认 10 行；`-n +100` 表示从第 100 行到结尾' },
        { flag: '-f', desc: '持续跟踪文件新增内容' },
        { flag: '-F', desc: '跟踪并支持文件被切割、重建后自动重连' },
        { flag: '-c 字节数', desc: '按字节数取末尾内容' },
        { flag: '--pid=PID', desc: '指定进程退出后自动停止跟踪' }
      ],
      examples: [
        { cmd: 'tail -n 100 /var/log/messages', desc: '只看最后 100 行系统日志' },
        { cmd: 'tail -f /data/app/logs/order.log', desc: '实时跟踪业务日志，一边操作一边看输出' },
        { cmd: 'tail -F /var/log/nginx/access.log | grep " 500 "', desc: '长期跟踪并过滤出 500 错误，日志切割也不会失效' },
        { cmd: 'tail -n +100 /data/app/logs/order.log', desc: '从第 100 行输出到文件结尾，用于跳过已知的历史噪声' }
      ],
      notes: [
        '日志被 `logrotate` 切割后，`tail -f` 还盯着已被删除的旧文件，会"看不到新日志"；长期跟踪请改用 `-F`',
        '`tail -f` 会占住终端，退出按 `Ctrl+C`',
        '`tail -n +100` 里的 `+` 不能丢，丢了就变成"最后 100 行"，语义完全相反'
      ],
      related: ['lb-head', 'lb-less', 'lb-watch', 'lb-cat', 'lb-tee', 'lb-cat-a'],
      docs: 'https://man7.org/linux/man-pages/man1/tail.1.html',
      tags: ['日志', '实时', '查看']
    },

    /* ---------- 15 / 60 ---------- */
    {
      id: 'lb-nl',
      name: 'nl',
      alias: ['加行号'],
      level: 2,
      syntax: 'nl [选项] [文件]',
      summary: '给文本加行号输出，默认跳过空行，比 `cat -n` 更可控。',
      desc: '`cat -n` 给所有行编号，`nl` 默认只给非空行编号，还能控制行号宽度、起始值和分隔符。生成巡检报告、把行号对齐到报错信息时更整齐。',
      params: [
        { flag: '-b a', desc: '给所有行编号（含空行）' },
        { flag: '-b t', desc: '只给非空行编号（默认）' },
        { flag: '-n 格式', desc: '行号格式：ln 左对齐、rn 右对齐、rz 右侧补零' },
        { flag: '-w 宽度', desc: '行号占用的字符宽度' },
        { flag: '-s 分隔符', desc: '行号与正文之间的分隔字符串' },
        { flag: '-v 起始号', desc: '指定起始行号' }
      ],
      examples: [
        { cmd: 'nl -ba /etc/nginx/nginx.conf', desc: '给所有行（含空行）编号，按行号定位配置问题' },
        { cmd: 'nl -w 2 -s ": " /data/app/logs/order.log | head -20', desc: '行号定宽、冒号分隔，输出对齐好看' },
        { cmd: 'nl -v 100 -ba /data/app/conf/app.yml', desc: '行号从 100 开始，用于接续上一段输出' }
      ],
      notes: [
        '`nl` 默认跳过空行，需要全部编号时必须显式写 `-b a`，否则空行不占号，行号对不上',
        '只是想看行号的话 `less -N` 更方便，不用改动输出格式'
      ],
      related: ['lb-cat', 'lb-cat-a', 'lb-wc', 'lb-less'],
      docs: 'https://man7.org/linux/man-pages/man1/nl.1.html',
      tags: ['文本', '行号', '定位']
    },

    /* ---------- 16 / 60 ---------- */
    {
      id: 'lb-file',
      name: 'file',
      alias: ['文件类型'],
      level: 2,
      syntax: 'file [选项] 文件...',
      summary: '读取文件头字节判断真实类型，不靠扩展名猜。',
      desc: 'Linux 不强制扩展名，运维拿到陌生文件先 `file` 一下：能识别 gzip、tar、ELF 可执行、文本编码、图片等。下载或备份文件"打不开"时，第一步就是用它与扩展名核对。',
      params: [
        { flag: '-i', desc: '输出 MIME 类型与字符集，排查编码乱码' },
        { flag: '-b', desc: '只输出结果，不显示文件名' },
        { flag: '-L', desc: '跟随软链接，检查链接指向的真实文件' },
        { flag: '-z', desc: '深入探测压缩包内部内容' },
        { flag: '-s', desc: '读取块设备或特殊文件' }
      ],
      examples: [
        { cmd: 'file /data/backup/db_20240101.bak', desc: '确认备份包到底是 gzip、tar 还是普通文本' },
        { cmd: 'file -i /data/upload/report.csv', desc: '看真实编码，排查中文乱码是 GBK 还是 UTF-8' },
        { cmd: 'file /usr/local/bin/nginx', desc: '确认二进制是 64 位 ELF 可执行文件，排除下载到错误架构的包' }
      ],
      notes: [
        '`file` 只读文件头部若干字节，速度极快，可以放心对成百上千个文件批量使用',
        '扩展名与真实格式不符时以 `file` 结果为准，改扩展名不会改变文件真实格式',
        '报 `cannot open` 时先检查路径和权限，报 `data` 说明它也不认识，可能是加密或专有格式'
      ],
      related: ['lb-stat', 'lb-ls', 'lb-gzip', 'lb-cat-a'],
      docs: 'https://man7.org/linux/man-pages/man1/file.1.html',
      tags: ['文件', '类型', '排查']
    },

    /* ---------- 17 / 60 ---------- */
    {
      id: 'lb-stat',
      name: 'stat',
      alias: ['文件详情'],
      level: 2,
      syntax: 'stat [选项] 文件...',
      summary: '查看文件的详细元信息：权限、inode、三个时间戳、占用块数。',
      desc: '比 `ls -l` 细致得多，会给出 inode 号、硬链接数、块数以及 Access/Modify/Change 三个时间。脚本里可以用 `-c` 只取需要的字段，输出稳定好解析。',
      params: [
        { flag: '-c 格式', desc: '自定义输出，如 %a 权限、%U 属主、%s 大小、%n 文件名' },
        { flag: '-f', desc: '查看文件所在文件系统的信息（块大小、剩余 inode）' },
        { flag: '-L', desc: '跟随软链接，查看链接指向文件的元信息' },
        { flag: '-t', desc: '单行简洁输出，便于日志记录' }
      ],
      examples: [
        { cmd: 'stat /data/app/logs/order.log', desc: '看三个时间戳，判断日志是"没写入"还是"没被读取"' },
        { cmd: 'stat -c "%a %U:%G %n" /etc/nginx/nginx.conf', desc: '脚本里只取权限和属主，输出干净无表头' },
        { cmd: 'stat -f /data', desc: '查看 /data 所在文件系统的块大小与剩余 inode' }
      ],
      notes: [
        'Modify 是内容修改时间，Change 是元数据（权限、属主、链接数）变更时间，两者不同：排查"文件被动过"要看 Change',
        '`stat -c %i` 取 inode 号，容器里验证挂载是否真正生效时非常有用',
        '`stat` 对软链接默认显示链接自身的元信息，要看目标文件加 `-L`'
      ],
      related: ['lb-ls', 'lb-file', 'lb-md5sum', 'lb-touch', 'lb-ln'],
      docs: 'https://man7.org/linux/man-pages/man1/stat.1.html',
      tags: ['文件', '元数据', 'inode']
    },

    /* ---------- 18 / 60 ---------- */
    {
      id: 'lb-touch',
      name: 'touch',
      alias: ['新建空文件'],
      level: 1,
      syntax: 'touch [选项] 文件...',
      summary: '创建空文件或刷新文件时间戳，脚本里常用来占位和探活。',
      desc: '文件不存在就建一个 0 字节文件，已存在则把三个时间戳更新为当前时间。`-d` 能指定任意时间，把文件"做旧"以验证清理脚本的判断逻辑，是测试 `find -mtime` 的常用手段。',
      params: [
        { flag: '-a', desc: '只更新访问时间（atime）' },
        { flag: '-m', desc: '只更新修改时间（mtime）' },
        { flag: '-d 时间', desc: '指定时间，支持 2024-01-01、yesterday、2 days ago' },
        { flag: '-t 时间戳', desc: '按 [[CC]YY]MMDDhhmm[.ss] 格式指定时间' },
        { flag: '-c', desc: '文件不存在时不创建，只更新时间' },
        { flag: '-r 参考文件', desc: '使用参考文件的时间戳' }
      ],
      examples: [
        { cmd: 'touch /data/app/.health', desc: '生成健康检查标记文件，供探针或脚本判断' },
        { cmd: 'touch -d "2024-01-01 08:00" /data/test/old.log', desc: '把文件时间改到过去，用来测试日志清理规则' },
        { cmd: 'touch -r /etc/nginx/nginx.conf /data/backup/nginx.conf.bak', desc: '让备份文件与源文件时间戳保持一致' }
      ],
      notes: [
        '`touch` 不会清空已有文件内容，只改时间戳；要清空用 `truncate -s 0` 或 `> file`',
        '`-d` 支持自然语言时间（`yesterday`、`3 days ago`），造旧文件时很方便',
        '文件所在目录没有写权限时，即使文件已存在也会失败'
      ],
      related: ['lb-stat', 'lb-truncate', 'lb-find', 'lb-mkdir'],
      docs: 'https://man7.org/linux/man-pages/man1/touch.1.html',
      tags: ['文件', '创建', '时间戳']
    },

    /* ---------- 19 / 60 ---------- */
    {
      id: 'lb-rm',
      name: 'rm',
      alias: ['remove', '删除'],
      level: 1,
      syntax: 'rm [选项] 文件...',
      summary: '删除文件或目录，不进回收站，删掉后基本无法恢复。',
      desc: '删文件不需要 `-r`，只有删目录才需要。默认静默删除、不询问，`-i` 才会逐条确认。生产上正确姿势是：先 `pwd` 和 `ls` 确认目标，再执行删除，或让 `-i` 兜底。',
      params: [
        { flag: '-r', desc: '递归删除目录及其内容' },
        { flag: '-f', desc: '强制删除，忽略不存在的文件与确认提示' },
        { flag: '-i', desc: '删除每个文件前都询问一次' },
        { flag: '-I', desc: '删除超过 3 个文件或递归删除时，只确认一次' },
        { flag: '-d', desc: '删除空目录，等价于 rmdir' },
        { flag: '-v', desc: '打印每个被删除的文件' }
      ],
      examples: [
        { cmd: 'rm -f /data/app/logs/order.log.2024-01-01', desc: '删除指定日期的日志文件' },
        { cmd: 'rm -i /data/app/conf/*.bak', desc: '逐个确认删除备份配置，避免手滑' },
        { cmd: 'rm -rf /data/tmp/build', desc: '递归删除构建临时目录，执行前务必用 pwd 和 ls 确认路径' },
        { cmd: 'rm -I /data/old/*', desc: '批量删除前只确认一次，兼顾安全与效率' }
      ],
      notes: [
        '`rm -rf /` 会摧毁系统：现代发行版默认带 `--preserve-root` 保护，但**不要依赖它**，加 `--no-preserve-root` 或换个写法照样执行',
        '**不要写 `rm -rf $VAR/`**：变量为空时命令会变成 `rm -rf /`。正确写法是 `rm -rf "${VAR:?变量为空，已中止}"`，或先判断 `[ -n "$VAR" ] || exit 1`',
        '`rm` 默认**不询问**直接删除，只有 `rm -i`（或 `alias rm="rm -i"`）才会逐条确认，别把希望寄托在"应该会问"',
        '`rm` 不走回收站，误删只能靠备份恢复，`extundelete` 之类工具的抢救成功率取决于后续写入量',
        '通配符会先被 Shell 展开，`rm -rf /data/app/*` 一旦路径写错就是整目录消失，建议先用 `ls` 跑一遍同样的通配符',
        '删除正在被进程写入的文件，磁盘空间不会立即释放，需要重启或截断该文件（`truncate -s 0`）'
      ],
      related: ['lb-rmdir', 'lb-find', 'lb-truncate', 'lb-mv', 'lb-xargs'],
      docs: 'https://man7.org/linux/man-pages/man1/rm.1.html',
      tags: ['危险', '删除', '文件']
    },

    /* ---------- 20 / 60 ---------- */
    {
      id: 'lb-cp',
      name: 'cp',
      alias: ['copy', '复制'],
      level: 2,
      syntax: 'cp [选项] 源 目标',
      summary: '复制文件或目录，改配置前留备份、跨盘搬数据都靠它。',
      desc: '复制目录必须加 `-r`。默认会静默覆盖同名文件，`-i` 才询问。`-a` 等价于 `-dR --preserve=all`，保留权限、属主、时间戳和软链接，是备份场景的首选参数。',
      params: [
        { flag: '-r / -R', desc: '递归复制目录及其内容' },
        { flag: '-a', desc: '归档模式，递归并保留权限、属主、时间戳、软链接' },
        { flag: '-p', desc: '保留权限、属主和时间戳（不含软链接处理）' },
        { flag: '-i', desc: '覆盖已有文件前询问' },
        { flag: '-u', desc: '只在源文件更新时才复制' },
        { flag: '-L', desc: '跟随软链接，复制其指向的真实文件内容' }
      ],
      examples: [
        { cmd: 'cp -a /etc/nginx /data/backup/nginx-$(date +%F)', desc: '备份 Nginx 配置并完整保留权限与时间戳' },
        { cmd: 'cp -ru /data/app/static /data/backup/static', desc: '只复制有更新的文件，做轻量同步' },
        { cmd: 'cp -i /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak', desc: '覆盖前确认，避免把已有备份冲掉' },
        { cmd: 'cp -a /data/app/. /mnt/newdisk/app/', desc: '把目录内容（含隐藏文件）复制到新挂载的数据盘' }
      ],
      notes: [
        '不加 `-r` 复制目录会报 `omitting directory`，复制整个目录请用 `cp -a`',
        '`cp` 默认静默覆盖同名文件，覆盖不可撤销，改线上配置前先 `cp -a` 备份一份',
        '目标目录已存在时，`cp -a src dst` 会在 dst 下再建一层 src；只想复制内容请在源路径末尾加 `/.`',
        '跨文件系统复制会真的搬数据，几百 G 的目录非常慢，增量同步请用 `rsync`',
        '复制正在写入的文件可能得到不完整副本，数据库文件应先停写或导出后再复制',
        '想同时设定权限和属主，用 `install -m 755 -o root -g root` 比"复制完再 chmod/chown"更稳'
      ],
      related: ['lb-mv', 'lb-rsync', 'lb-ln', 'lb-install', 'lb-tar'],
      docs: 'https://man7.org/linux/man-pages/man1/cp.1.html',
      tags: ['文件', '复制', '备份']
    },

    /* ---------- 21 / 60 ---------- */
    {
      id: 'lb-mv',
      name: 'mv',
      alias: ['move', '移动'],
      level: 1,
      syntax: 'mv [选项] 源 目标',
      summary: '移动文件或目录，同一分区内改名几乎瞬间完成。',
      desc: '同一文件系统内 `mv` 只改目录项，inode 不变，再大的文件也是毫秒级；跨文件系统时则退化成"复制 + 删除"，大目录会很慢。它同时承担重命名和归档移动两个职责。',
      params: [
        { flag: '-i', desc: '覆盖已有文件前询问' },
        { flag: '-f', desc: '强制覆盖，不提示' },
        { flag: '-n', desc: '目标已存在时不覆盖' },
        { flag: '-u', desc: '只在源文件比目标新时才移动' },
        { flag: '-v', desc: '打印移动过程' },
        { flag: '-t 目录', desc: '把所有源文件移动到指定目录' }
      ],
      examples: [
        { cmd: 'mv /data/app/logs/order.log /data/app/logs/order.log.$(date +%F)', desc: '给当前日志改名归档，方便新日志重新开始写' },
        { cmd: 'mv -i /etc/nginx/nginx.conf.new /etc/nginx/nginx.conf', desc: '用新配置覆盖旧配置前确认一次' },
        { cmd: 'mv /data/tmp/*.tar.gz /data/backup/', desc: '把打包好的备份包集中移动到备份目录' },
        { cmd: 'mv -t /data/archive/ /data/logs/app-1.log /data/logs/app-2.log', desc: '批量移动到指定目录，源文件多时比逐个写更安全' }
      ],
      notes: [
        '`mv` 覆盖目标文件不可恢复，改配置前先 `cp` 一份带日期的备份',
        '目标目录已存在时，`mv dir1 dir2` 是把 dir1 放进 dir2 里面，与"改名"的预期不同，操作前先 `ls` 看清',
        '跨分区移动大文件中途中断可能留下半个文件，重要数据请先 `cp` 再删源',
        '`mv` 会保留原文件的权限和属主，但移动到不同属主的目录后可能无法再访问，注意检查'
      ],
      related: ['lb-cp', 'lb-rename', 'lb-rm', 'lb-ln'],
      docs: 'https://man7.org/linux/man-pages/man1/mv.1.html',
      tags: ['文件', '移动', '改名']
    },

    /* ---------- 22 / 60 ---------- */
    {
      id: 'lb-ln',
      name: 'ln',
      alias: ['link', '软链接', '硬链接'],
      level: 3,
      syntax: 'ln [选项] 目标 链接名',
      summary: '创建硬链接或软链接，`-s` 建软链接、不加 `-s` 是硬链接。',
      desc: '硬链接指向同一个 inode，两个名字共享一份数据，删掉任意一个文件都还在，但不能跨文件系统、不能指向目录；软链接（符号链接）保存的是路径字符串，可跨分区、可指向目录，源文件删除后变成断链。发布系统里常用软链接切换版本。',
      params: [
        { flag: '-s', desc: '创建符号链接（软链接），最常用' },
        { flag: '-f', desc: '若链接名已存在则覆盖' },
        { flag: '-n', desc: '把指向目录的软链接当作普通文件处理，避免链到目录里面去' },
        { flag: '-r', desc: '创建相对路径的软链接' },
        { flag: '-b', desc: '覆盖前先备份原文件' },
        { flag: '-v', desc: '打印创建过程' }
      ],
      examples: [
        { cmd: 'ln -s /data/app/releases/v1.2.0 /data/app/current', desc: '用软链接指向当前版本，发布时只切换这个链接' },
        { cmd: 'ln -sfn /data/app/releases/v1.3.0 /data/app/current', desc: '原子切换版本链接，`-n` 防止在旧版本目录里再建一个链接' },
        { cmd: 'ln /data/app/order.log /data/app/order.log.hard', desc: '建硬链接，两个文件名共享同一份数据，删一个不影响另一个' },
        { cmd: 'ls -li /data/app/order.log /data/app/order.log.hard', desc: '对比 inode 号，相同说明是硬链接' }
      ],
      notes: [
        '软链接源文件删除后会变成断链（`ls -l` 通常显示为红色），访问时报 `No such file or directory`',
        '硬链接不能跨文件系统、不能指向目录；软链接都可以，但建议写绝对路径，避免移动后失效',
        '**`ln -sf 新目录 已有软链接` 会钻进目录里新建链接**，必须写 `ln -sfn`，这是最经典的踩坑点',
        '区分两者：`ls -l` 首字符为 `l` 是软链接；`ls -l` 第二列的链接计数大于 1，说明存在硬链接',
        '删除软链接用 `rm 链接名`，结尾不要加 `/`，否则会试图删掉链接指向的目录内容'
      ],
      related: ['lb-readlink', 'lb-realpath', 'lb-ls', 'lb-stat', 'lb-cp'],
      docs: 'https://man7.org/linux/man-pages/man1/ln.1.html',
      tags: ['链接', '软链接', '硬链接']
    },

    /* ---------- 23 / 60 ---------- */
    {
      id: 'lb-truncate',
      name: 'truncate',
      alias: ['清空文件', '截断'],
      level: 3,
      syntax: 'truncate [选项] 文件...',
      summary: '把文件精确裁剪或扩展到指定大小，原地清空大日志最省事。',
      desc: '`-s 0` 可以把正在被写入的日志瞬间清零，而且**保持 inode 不变**，所以写日志的进程完全无感知，磁盘空间立刻释放。这是比 `rm` 更适合清日志的方式。',
      params: [
        { flag: '-s 大小', desc: '目标大小，支持 0、100M、+1G（+ 表示在现有基础上增加）' },
        { flag: '-c', desc: '文件不存在时不创建' },
        { flag: '-o', desc: '只对更小的文件做扩展，不缩小已有大文件' },
        { flag: '-r 参考文件', desc: '按参考文件的大小调整' }
      ],
      examples: [
        { cmd: 'truncate -s 0 /var/log/nginx/access.log', desc: '原地清空访问日志，nginx 无需重启也能继续写入' },
        { cmd: 'truncate -s 100M /data/test/disk.img', desc: '快速生成 100M 的稀疏文件用于测试' },
        { cmd: 'truncate -s +1G /data/test/disk.img', desc: '在现有基础上把文件扩大 1G' }
      ],
      notes: [
        '`-s 0` 会**永久丢弃文件内容**，不做备份就没有回头路，清日志前先确认是否还有排查价值',
        '用 `rm` 删掉正在被进程写入的日志，空间不会释放（进程仍持有文件句柄，`df` 和 `du` 对不上）；这时用 `truncate -s 0` 或 `: > file` 才有效',
        '扩大的部分是空洞（稀疏文件），`ls -l` 显示的大小与 `du` 的实际占用可能相差很大',
        '对数据库文件、正在写入的镜像做截断会造成不可逆损坏，操作前必须停写'
      ],
      related: ['lb-rm', 'lb-touch', 'lb-split', 'lb-dd'],
      docs: 'https://man7.org/linux/man-pages/man1/truncate.1.html',
      tags: ['文件', '清空', '危险']
    },

    /* ---------- 24 / 60 ---------- */
    {
      id: 'lb-install',
      name: 'install',
      alias: ['部署文件'],
      level: 3,
      syntax: 'install [选项] 源 目标',
      summary: '复制文件并同时设定权限与属主，部署脚本里一次到位。',
      desc: '相当于 `cp` + `chmod` + `chown` 三步合一，还能用 `-D` 自动补建目标目录。写部署脚本时比"复制完再改权限"少两步，也不会出现权限过宽的过渡窗口。注意它与包管理的 `yum install`、`apt install` 完全无关。',
      params: [
        { flag: '-m 权限', desc: '直接设置目标文件权限，如 -m 755' },
        { flag: '-o 属主', desc: '设置目标文件属主（需 root）' },
        { flag: '-g 属组', desc: '设置目标文件属组（需 root）' },
        { flag: '-D', desc: '自动创建目标路径上缺失的目录' },
        { flag: '-d', desc: '只创建目录，不复制文件' },
        { flag: '-b', desc: '覆盖前先备份已有文件' }
      ],
      examples: [
        { cmd: 'install -m 755 -o root -g root /data/build/app /usr/local/bin/app', desc: '部署二进制并一次设好权限与属主' },
        { cmd: 'install -m 644 -D /data/build/app.conf /etc/myapp/app.conf', desc: '目录不存在时自动创建，再完成安装' },
        { cmd: 'install -d -m 750 /data/app/logs', desc: '只创建目录并指定权限' }
      ],
      notes: [
        '这是 coreutils 里的文件安装命令，`install -m 755 a b` 是复制文件；装软件包请用 `yum install` 或 `apt install`',
        '不带 `-m` 时默认权限为 755，而 `cp` 会沿用源文件权限，两者行为不同',
        '`-o`、`-g` 需要 root 权限，普通用户执行会报权限错误',
        '目标文件已存在时 `install` 会直接覆盖，加 `-b` 可自动留一份备份'
      ],
      related: ['lb-cp', 'lb-mkdir', 'lb-mv', 'lb-ln'],
      docs: 'https://man7.org/linux/man-pages/man1/install.1.html',
      tags: ['文件', '部署', '权限']
    },

    /* ---------- 25 / 60 ---------- */
    {
      id: 'lb-rename',
      name: 'rename',
      alias: ['批量改名'],
      level: 2,
      syntax: 'rename [选项] 表达式 替换 文件... 或 rename [选项] "s/正则/替换/" 文件...',
      summary: '按规则批量重命名文件，一次改掉一整批文件名。',
      desc: 'Linux 上有两个同名但语法不同的 `rename`：util-linux 版（CentOS/RHEL 默认）用法是 `rename 原串 新串 文件`；Perl 版（Ubuntu/Debian 默认）用法是正则替换 `s/旧/新/`。上机前先用 `rename --version` 确认是哪一个。',
      params: [
        { flag: '-n', desc: '只预览不执行（dry-run），Perl 版支持' },
        { flag: '-v', desc: '显示每个改名动作' },
        { flag: '-f', desc: '强制覆盖已存在的目标文件' },
        { flag: '-s', desc: '对软链接指向的目标操作' }
      ],
      examples: [
        { cmd: 'rename .log .log.bak /data/app/logs/*.log', desc: 'util-linux 版：批量给日志文件名加后缀' },
        { cmd: 'rename -n "s/\\.jpeg$/.jpg/" /data/upload/*.jpeg', desc: 'Perl 版：先预览改名结果，确认无误再去掉 -n 执行' },
        { cmd: 'rename -v "s/IMG_/photo_/" /data/photos/IMG_*.jpg', desc: 'Perl 版：批量替换文件名前缀' }
      ],
      notes: [
        '发行版差异极大：CentOS 上写 `rename .jpg .png *.jpg`，Ubuntu 上必须写 `rename "s/.jpg/.png/" *.jpg`，用错版本会毫无反应或报参数错误',
        '务必先用 `-n` 预览或先在测试目录演练，正则写错会一次性搞乱整批文件名',
        '批量改名不可撤销，重要目录先打包备份一份'
      ],
      related: ['lb-mv', 'lb-find', 'lb-basename', 'lb-ls'],
      docs: 'https://man7.org/linux/man-pages/man1/rename.1.html',
      tags: ['批量', '重命名', '文件']
    },

    /* ---------- 26 / 60 ---------- */
    {
      id: 'lb-find',
      name: 'find',
      alias: ['查找文件'],
      level: 3,
      syntax: 'find [路径...] [条件] [动作]',
      summary: '按名称、类型、时间、大小等条件递归查找文件，并能直接处理结果。',
      desc: '默认递归整个目录树，多个条件之间是"与"关系。生产上两大用途：按时间和大小清理磁盘，以及用 `-exec` 对批量文件做统一处理。`find` 的输出顺序不保证稳定，脚本里不要依赖它，也不要拿它当排序工具。',
      params: [
        { flag: '-name "模式"', desc: '按文件名匹配，支持 * 与 ?，区分大小写；忽略大小写用 -iname' },
        { flag: '-type f|d|l', desc: '按类型过滤：f 普通文件、d 目录、l 软链接' },
        { flag: '-mtime +N', desc: '按修改时间过滤，+7 表示 7 天以前修改过的' },
        { flag: '-size +100M', desc: '按大小过滤，+ 大于、- 小于，单位 c/k/M/G' },
        { flag: '-maxdepth N', desc: '限制递归深度，放在其他条件之前' },
        { flag: '-exec 命令 {} \\;', desc: '对每个结果执行一次命令，{} 代表文件名' },
        { flag: '-delete', desc: '直接删除匹配到的文件（危险，隐含 -depth）' },
        { flag: '-print', desc: '只打印路径（默认动作），用于删除前预览' }
      ],
      examples: [
        { cmd: 'find /var/log -name "*.log" -mtime +7 -exec rm -f {} \\;', desc: '清理 7 天前的日志文件，释放磁盘空间' },
        { cmd: 'find /data/app -type f -size +500M -exec ls -lh {} \\;', desc: '找出应用目录里超过 500M 的大文件，定位空间占用' },
        { cmd: 'find /data/backup -type f -name "*.tar.gz" -mtime +30 -delete', desc: '删除 30 天前的备份包，执行前先用 -print 预览一遍' },
        { cmd: 'find /data/app -maxdepth 2 -type d -name "logs" -exec chmod 755 {} \\;', desc: '只找两层内的 logs 目录并批量修正权限' }
      ],
      notes: [
        '`-exec ... {} \\;` 会对每个文件启动一个进程，几千个文件就明显变慢；能接受批量传参时改用 `-exec ... {} +` 快得多',
        '`-delete` 与 `-exec rm -f {} \\;` 都是**直接删除、不进回收站**，执行前务必先用 `-print` 或 `-ls` 预览结果集',
        '`-mtime +7` 的含义是"修改时间早于 7×24 小时之前"，不是"7 天前那一天"，理解偏了会多删或少删文件',
        '`-delete` 会隐含 `-depth`，且必须放在所有条件之后；位置写错会报错或漏删',
        '路径含空格时 `{}` 要加引号：`-exec ls -lh "{}" \\;`；更稳的写法是 `find ... -print0 | xargs -0`',
        '从 `/` 或网络挂载点开始查找前先想清楚，`find / -name "*.log"` 可能跑几十分钟并打满磁盘 IO'
      ],
      related: ['lb-locate', 'lb-xargs', 'lb-rm', 'lb-stat', 'lb-which'],
      docs: 'https://man7.org/linux/man-pages/man1/find.1.html',
      tags: ['查找', '批量', '清理', '磁盘满', '大文件']
    },

    /* ---------- 27 / 60 ---------- */
    {
      id: 'lb-locate',
      name: 'locate',
      alias: ['索引查找'],
      level: 2,
      syntax: 'locate [选项] 关键词',
      summary: '在预建索引里秒查文件路径，比 `find` 快得多但结果可能过时。',
      desc: '查的是 `updatedb` 生成的数据库，不遍历磁盘，因此几乎瞬间返回；代价是刚创建或刚删除的文件在索引里对不上。多数系统要装 `mlocate`：CentOS `yum install -y mlocate`，Ubuntu `apt install -y mlocate`。',
      params: [
        { flag: '-i', desc: '匹配时忽略大小写' },
        { flag: '-n N', desc: '只输出前 N 条结果' },
        { flag: '-r', desc: '把关键词当正则表达式' },
        { flag: '-c', desc: '只输出匹配数量，不列路径' },
        { flag: '-e', desc: '只输出当前磁盘上真实存在的文件' },
        { flag: '-b', desc: '只匹配路径最后一段（文件名部分）' }
      ],
      examples: [
        { cmd: 'locate nginx.conf', desc: '秒级列出系统里所有名为 nginx.conf 的路径' },
        { cmd: 'locate -i -n 20 ".tar.gz"', desc: '忽略大小写找压缩包，最多返回 20 条' },
        { cmd: 'locate -e /data/app/config.yml', desc: '与磁盘核对后再输出，过滤掉索引里已删除的陈旧记录' }
      ],
      notes: [
        '索引默认每天由 cron 跑一次 `updatedb` 更新，刚创建的文件查不到属正常现象，可手动执行 `updatedb`',
        '`locate` 只匹配文件名和路径，不查文件内容；按内容搜索要用 `grep -r`',
        '索引数据库包含全盘路径信息，多用户环境下要注意信息暴露，权限默认为 root 可读'
      ],
      related: ['lb-find', 'lb-which', 'lb-whereis'],
      docs: 'https://man7.org/linux/man-pages/man1/locate.1.html',
      tags: ['查找', '索引', '定位']
    },

    /* ---------- 28 / 60 ---------- */
    {
      id: 'lb-which',
      name: 'which',
      alias: ['命令位置'],
      level: 1,
      syntax: 'which [选项] 命令名...',
      summary: '沿 PATH 查找命令的可执行文件，确认到底调用了哪个版本。',
      desc: '排障常用：机器上装了两个 Python 或两个 Java 时，`which java` 立刻看出实际调用的是哪一个。它只认 PATH 里的外部可执行文件，不认 Shell 内置命令、别名和函数。',
      params: [
        { flag: '-a', desc: '列出 PATH 中所有匹配项，而不只是第一个' },
        { flag: '-i', desc: '同时读取并识别别名（部分实现支持）' }
      ],
      examples: [
        { cmd: 'which java', desc: '确认当前 PATH 下实际调用的是哪个 JDK' },
        { cmd: 'which -a python3', desc: '列出所有 python3，检查是否装了多个版本' },
        { cmd: 'which nginx', desc: '确认 nginx 二进制路径，便于核对启动脚本用的到底是哪一个' }
      ],
      notes: [
        '`which` 看不到别名和 Shell 函数，判断"实际会执行哪一个"应该用 `type -a`',
        '`which` 只查 PATH，不代表文件一定有可执行权限，必要时用 `ls -l` 复核',
        'CentOS 与 Ubuntu 的 `which` 实现不同（一个是独立程序、一个是 shell 脚本），输出细节略有差异'
      ],
      related: ['lb-whereis', 'lb-type', 'lb-locate', 'lb-ls'],
      docs: 'https://www.gnu.org/software/which/',
      tags: ['命令', '路径', '排查']
    },

    /* ---------- 29 / 60 ---------- */
    {
      id: 'lb-whereis',
      name: 'whereis',
      alias: ['命令与手册'],
      level: 2,
      syntax: 'whereis [选项] 名称...',
      summary: '定位命令的二进制、源码和手册页位置，比 `which` 查得更全。',
      desc: '从标准系统目录里找，而不是沿 PATH 找，能同时报出可执行文件、源码包和 man 手册。确认软件是否装全、手册在不在，用它一次看完。',
      params: [
        { flag: '-b', desc: '只查找二进制可执行文件' },
        { flag: '-m', desc: '只查找 man 手册页' },
        { flag: '-s', desc: '只查找源码' },
        { flag: '-B 目录', desc: '限定二进制的搜索目录' },
        { flag: '-M 目录', desc: '限定手册的搜索目录' }
      ],
      examples: [
        { cmd: 'whereis nginx', desc: '一次看清 nginx 的二进制与手册页位置' },
        { cmd: 'whereis -b java', desc: '只找 java 可执行文件，输出更干净' },
        { cmd: 'whereis -m tar', desc: '确认 tar 的手册页是否安装，精简镜像常常缺 man' }
      ],
      notes: [
        '`whereis` 只在固定系统目录中搜索，装在 /usr/local 或自定义目录下的程序可能查不到，那种情况用 `which` 或 `find`',
        '输出里同一类路径可能有多条，脚本里解析建议配合 `-b` 只取二进制',
        '它不检查文件是否真的可执行，只报告找到的路径'
      ],
      related: ['lb-which', 'lb-type', 'lb-locate'],
      docs: 'https://man7.org/linux/man-pages/man1/whereis.1.html',
      tags: ['命令', '手册', '路径']
    },

    /* ---------- 30 / 60 ---------- */
    {
      id: 'lb-type',
      name: 'type',
      alias: ['命令类型'],
      level: 2,
      syntax: 'type [选项] 名称...',
      summary: '判断一个名字是别名、Shell 函数、内置命令还是外部程序。',
      desc: 'Shell 内置命令，能一次说清"敲下这个命令到底会执行什么"。`type -a` 会按优先级列出所有同名来源，是排查 `alias` 覆盖了真实命令这类问题的正解。',
      params: [
        { flag: '-a', desc: '按优先级列出所有同名定义' },
        { flag: '-t', desc: '只输出类型关键字：alias、function、builtin、file' },
        { flag: '-p', desc: '只输出外部命令的路径，找不到则不输出' },
        { flag: '-P', desc: '强制按 PATH 查找文件，忽略别名与函数' }
      ],
      examples: [
        { cmd: 'type ll', desc: '看清 ll 到底是别名、函数还是真实命令' },
        { cmd: 'type -a python', desc: '按优先级列出所有 python 来源，排查调用错版本' },
        { cmd: 'type -t nginx', desc: '只输出类型（file/alias/builtin），适合在脚本里做判断' }
      ],
      notes: [
        '`type` 是 Shell 内置命令，必须在交互式 Shell 或脚本里执行，`sudo type xx` 无效',
        '`type -P` 会忽略别名和函数、只按 PATH 找外部文件，行为接近 `which`',
        '在脚本里判断命令是否存在，用 `command -v 名字 >/dev/null 2>&1` 最通用'
      ],
      related: ['lb-which', 'lb-alias', 'lb-whereis', 'lb-history'],
      docs: 'https://man7.org/linux/man-pages/man1/bash.1.html',
      tags: ['Shell', '别名', '排查']
    },

    /* ---------- 31 / 60 ---------- */
    {
      id: 'lb-realpath',
      name: 'realpath',
      alias: ['绝对路径'],
      level: 2,
      syntax: 'realpath [选项] 路径...',
      summary: '把相对路径解析成不含软链接的绝对路径，脚本里最好用。',
      desc: '从软链接目录 `cd` 进去后 `pwd` 显示的仍是链接路径，`realpath` 会一路解析到底给出真实物理路径。它也能解析尚不存在的路径中已存在的部分，用来规范化用户输入的路径。',
      params: [
        { flag: '-e', desc: '要求路径每一级都必须存在，否则报错' },
        { flag: '-m', desc: '允许路径不存在，只做规范化拼接' },
        { flag: '--relative-to=目录', desc: '输出相对于指定目录的路径' },
        { flag: '-s', desc: '不解析软链接，只做路径规范化' }
      ],
      examples: [
        { cmd: 'realpath /data/app/current', desc: '看软链接解析后真正落在哪个版本目录' },
        { cmd: 'realpath ../conf/nginx.conf', desc: '把相对路径变成绝对路径，写进配置文件更稳' },
        { cmd: 'realpath --relative-to=/data /data/app/logs/order.log', desc: '生成相对 /data 的路径，便于打包和迁移' }
      ],
      notes: [
        '默认允许路径不存在也能拼出结果，需要严格校验存在性请加 `-e`',
        '脚本里定位自身目录的经典写法：`SCRIPT_DIR=$(dirname "$(realpath "$0")")`，比 `readlink -f` 更容易读',
        '想保留软链接名不解析，加 `-s`'
      ],
      related: ['lb-readlink', 'lb-pwd', 'lb-basename', 'lb-dirname'],
      docs: 'https://man7.org/linux/man-pages/man1/realpath.1.html',
      tags: ['路径', '绝对路径', '脚本']
    },

    /* ---------- 32 / 60 ---------- */
    {
      id: 'lb-readlink',
      name: 'readlink',
      alias: ['看链接指向'],
      level: 2,
      syntax: 'readlink [选项] 文件',
      summary: '读出软链接指向的目标，或把路径递归解析成绝对路径。',
      desc: '只对软链接有意义，对普通文件执行没有任何输出——"无输出"本身就说明它不是软链接。`-f` 是最常用的写法，会递归解析整条路径上的所有软链接并输出绝对路径。',
      params: [
        { flag: '-f', desc: '递归解析为绝对路径，最后一级允许不存在' },
        { flag: '-e', desc: '递归解析，且要求每一级都真实存在' },
        { flag: '-m', desc: '不要求路径存在，只做规范化' },
        { flag: '-n', desc: '输出末尾不加换行符' }
      ],
      examples: [
        { cmd: 'readlink /data/app/current', desc: '看版本软链接当前指向哪个发布目录' },
        { cmd: 'readlink -f /usr/bin/java', desc: '一路解析到真实 JDK 安装路径' },
        { cmd: 'readlink -e /data/app/current/conf/app.yml', desc: '解析路径并校验文件真实存在，适合写进健康检查脚本' }
      ],
      notes: [
        '对普通文件执行 `readlink` 会没有任何输出，不要误以为命令失败',
        '`-f` 允许最后一级不存在，做存在性判断要用 `-e`',
        '删除软链接时用 `rm 链接名`，注意结尾不要带 `/`，否则会作用到链接指向的目录'
      ],
      related: ['lb-ln', 'lb-realpath', 'lb-file', 'lb-stat'],
      docs: 'https://man7.org/linux/man-pages/man1/readlink.1.html',
      tags: ['链接', '路径', '排查']
    },

    /* ---------- 33 / 60 ---------- */
    {
      id: 'lb-wc',
      name: 'wc',
      alias: ['word count', '统计行数'],
      level: 1,
      syntax: 'wc [选项] [文件...]',
      summary: '统计文件的行数、单词数和字节数，数日志条数最常用 `-l`。',
      desc: '不带选项时输出"行数 单词数 字节数"三列。最常见的用法是 `wc -l`：数访问日志有多少条请求、数某个错误出现了多少次。它也能直接读管道输入。',
      params: [
        { flag: '-l', desc: '只统计行数' },
        { flag: '-w', desc: '只统计单词数' },
        { flag: '-c', desc: '只统计字节数' },
        { flag: '-m', desc: '只统计字符数（多字节中文与字节数不同）' },
        { flag: '-L', desc: '输出最长一行的长度' }
      ],
      examples: [
        { cmd: 'wc -l /var/log/nginx/access.log', desc: '统计访问日志总行数，约等于总请求数' },
        { cmd: 'grep " 500 " /var/log/nginx/access.log | wc -l', desc: '统计 500 错误出现了多少次' },
        { cmd: 'cat /data/app/logs/*.log | wc -l', desc: '统计多个日志文件加起来的行数' }
      ],
      notes: [
        '`wc -l` 数的是换行符个数，最后一行若没有换行符就不会计入，结果可能比实际少 1',
        '`wc -c` 是字节数，`wc -m` 是字符数，含中文的文件两者不相等，报"文件多大"时别看错',
        '统计大文件也要完整读一遍，G 级文件会占用磁盘 IO，业务高峰期慎用'
      ],
      related: ['lb-cat', 'lb-sort', 'lb-uniq', 'lb-nl', 'lb-tee'],
      docs: 'https://man7.org/linux/man-pages/man1/wc.1.html',
      tags: ['统计', '行数', '文本']
    },

    /* ---------- 34 / 60 ---------- */
    {
      id: 'lb-sort',
      name: 'sort',
      alias: ['排序'],
      level: 2,
      syntax: 'sort [选项] [文件...]',
      summary: '按行排序文本，配合 `uniq` 做去重统计的标准前一步。',
      desc: '默认按字典序升序。运维里最经典的组合是"排序 → 去重计数 → 再按计数排序"：`sort | uniq -c | sort -rn`，用来统计 Top IP、Top URL、Top 错误码。`-h` 能正确排序 1K/2M/3G 这类人类可读大小。',
      params: [
        { flag: '-n', desc: '按数值大小排序，排数字必须加' },
        { flag: '-r', desc: '倒序（从大到小）' },
        { flag: '-k N', desc: '按第 N 列排序' },
        { flag: '-t 分隔符', desc: '指定字段分隔符，如 -t: 处理 /etc/passwd' },
        { flag: '-u', desc: '排序并去重，等价于 sort 后再 uniq' },
        { flag: '-h', desc: '按人类可读大小排序（1K < 2M < 3G）' },
        { flag: '-o 文件', desc: '结果写回文件，可安全地对同一文件排序' }
      ],
      examples: [
        { cmd: 'du -sh /data/* | sort -rh | head -10', desc: '找出 /data 下最占空间的 10 个目录' },
        { cmd: 'awk \'{print $1}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20', desc: '统计访问量最高的 20 个来源 IP' },
        { cmd: 'sort -t: -k3 -n /etc/passwd', desc: '按 UID 数值排序输出系统用户' },
        { cmd: 'sort -u /data/app/services.txt -o /data/app/services.txt', desc: '就地排序去重，`-o` 可安全写回同一个文件' }
      ],
      notes: [
        '默认是字典序，排数字必须加 `-n`，否则 `10` 会排在 `9` 前面',
        '直接 `sort file > file` 会把文件清空，要写回原文件请用 `-o file`',
        '超大文件排序会占用大量内存和临时磁盘空间，必要时用 `-S` 限制内存、`-T` 指定临时目录',
        '默认按整行比较，按列排序要同时给 `-k` 和 `-t`，否则分隔符不对结果就不对'
      ],
      related: ['lb-uniq', 'lb-wc', 'lb-diff', 'lb-head', 'lb-xargs'],
      docs: 'https://man7.org/linux/man-pages/man1/sort.1.html',
      tags: ['文本', '排序', '统计']
    },

    /* ---------- 35 / 60 ---------- */
    {
      id: 'lb-uniq',
      name: 'uniq',
      alias: ['去重'],
      level: 2,
      syntax: 'uniq [选项] [输入 [输出]]',
      summary: '去掉相邻的重复行，配合 `sort` 完成去重与出现次数统计。',
      desc: '它只能处理**相邻**的重复行，所以几乎总是先 `sort` 再 `uniq`。`-c` 在每行前显示出现次数，`-d` 只显示重复行，`-u` 只显示唯一行。',
      params: [
        { flag: '-c', desc: '在行首显示该行出现的次数' },
        { flag: '-d', desc: '只显示有重复的行' },
        { flag: '-u', desc: '只显示没有重复的行' },
        { flag: '-i', desc: '比较时忽略大小写' },
        { flag: '-f N', desc: '跳过前 N 个字段后再比较' },
        { flag: '-w N', desc: '只比较每行的前 N 个字符' }
      ],
      examples: [
        { cmd: 'awk \'{print $1}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head', desc: '统计来源 IP 访问次数排行' },
        { cmd: 'sort /data/user/list.txt | uniq -d', desc: '找出重复出现的用户记录，用于数据核对' },
        { cmd: 'sort -u /data/app/services.txt | wc -l', desc: '统计去重后的服务数量' }
      ],
      notes: [
        '不先 `sort` 直接用 `uniq` 会漏掉不相邻的重复行，这是最常见的误用',
        '`uniq` 不改动原文件，结果需要落盘请用重定向，或写成 `uniq 输入 输出`',
        '`uniq -c` 的输出前面带空格和计数，脚本里取值建议用 `awk \'{print $1}\'`'
      ],
      related: ['lb-sort', 'lb-wc', 'lb-diff'],
      docs: 'https://man7.org/linux/man-pages/man1/uniq.1.html',
      tags: ['文本', '去重', '统计']
    },

    /* ---------- 36 / 60 ---------- */
    {
      id: 'lb-diff',
      name: 'diff',
      alias: ['比较差异'],
      level: 2,
      syntax: 'diff [选项] 文件1 文件2',
      summary: '逐行比较两个文本文件的差异，核对配置改动时必备。',
      desc: '输出里 `<` 表示第一个文件有、`>` 表示第二个文件新增。`-u` 生成带上下文的统一格式（unified diff），可以直接交给 `patch` 使用；`-r` 能递归比较两个目录，发布前后核对文件差异非常高效。',
      params: [
        { flag: '-u', desc: '输出统一格式差异，带上下文行，可生成补丁' },
        { flag: '-r', desc: '递归比较两个目录' },
        { flag: '-q', desc: '只报告是否不同，不列具体内容' },
        { flag: '-i', desc: '忽略大小写差异' },
        { flag: '-w', desc: '忽略空白字符差异' },
        { flag: '-y', desc: '并排显示两列内容，人工核对更直观' }
      ],
      examples: [
        { cmd: 'diff -u /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf', desc: '对比改动前后的配置差异，确认改了什么' },
        { cmd: 'diff -q /etc/nginx/conf.d/app.conf /etc/nginx/nginx.conf', desc: '只看两个文件是否不同（-q 模式，不打印逐行差异）' },
        { cmd: 'diff -u /etc/nginx/conf.d/app.conf /etc/nginx/nginx.conf > /tmp/change.patch', desc: '生成补丁文件（-u 统一格式），再用 patch 在别的机器上打上' }
      ],
      notes: [
        '`diff` 的退出码有意义：0 表示相同、1 表示有差异、2 表示出错，脚本里可用 `diff -q a b >/dev/null || echo differ` 判断',
        '比较二进制文件请用 `cmp`，`diff` 遇到二进制只会提示"二进制文件不同"',
        '比较目录必须加 `-r`，否则只比目录本身，永远报相同',
        '行尾符不同（CRLF 与 LF）会被判定为整文件差异，先用 `cat -A` 确认行尾'
      ],
      related: ['lb-cmp', 'lb-sort', 'lb-md5sum', 'lb-rsync', 'lb-cat-a'],
      docs: 'https://man7.org/linux/man-pages/man1/diff.1.html',
      tags: ['比较', '差异', '配置']
    },

    /* ---------- 37 / 60 ---------- */
    {
      id: 'lb-cmp',
      name: 'cmp',
      alias: ['逐字节比较'],
      level: 2,
      syntax: 'cmp [选项] 文件1 文件2',
      summary: '逐字节比较两个文件，二进制文件比对与一致性确认的首选。',
      desc: '默认只报告第一个不同字节的位置和行号；`-l` 列出所有差异字节，`-s` 完全静默只给退出码。适合比对镜像、二进制程序、以及确认两个文件是否完全一致。',
      params: [
        { flag: '-l', desc: '列出所有不同的字节（偏移量与字节值）' },
        { flag: '-s', desc: '静默模式，不输出内容，只用退出码表示结果' },
        { flag: '-b', desc: '同时打印不同的字节内容' },
        { flag: '-n N', desc: '只比较前 N 个字节' },
        { flag: '-i N', desc: '跳过前 N 个字节再开始比较' }
      ],
      examples: [
        { cmd: 'cmp /data/img/a.qcow2 /data/img/b.qcow2', desc: '确认两个镜像文件是否完全一致' },
        { cmd: 'cmp -s /data/backup/app.tar.gz /data/build/app.tar.gz && echo same', desc: '脚本里静默比较，用退出码判断是否一致' },
        { cmd: 'cmp -l /data/img/a.qcow2 /data/img/b.qcow2 | head -20', desc: '列出前 20 处不同字节的偏移量，用于定位损坏位置' }
      ],
      notes: [
        '报 `cmp: EOF on 文件` 说明两个文件长度不同（短的那个先结束），不是内容相同',
        '`-s` 不输出任何内容，只能靠退出码（0 相同、1 不同、2 出错）判断，别以为命令没生效',
        '跨机器校验文件一致性请用 `md5sum` 或 `sha256sum` 比对摘要，`cmp` 要求两个文件都在本地'
      ],
      related: ['lb-diff', 'lb-md5sum', 'lb-sha256sum'],
      docs: 'https://man7.org/linux/man-pages/man1/cmp.1.html',
      tags: ['比较', '二进制', '校验']
    },

    /* ---------- 38 / 60 ---------- */
    {
      id: 'lb-md5sum',
      name: 'md5sum',
      alias: ['md5', '校验和'],
      level: 2,
      syntax: 'md5sum [选项] [文件...]',
      summary: '生成或校验文件的 MD5 摘要，快速确认文件是否完整。',
      desc: '常用于下载后校验、备份包完整性检查。`-c` 能按清单文件批量校验，是企业内网搬运文件后的标准动作。注意 MD5 已被证明存在碰撞，**不适合安全防篡改场景**，那种场合请用 `sha256sum`。',
      params: [
        { flag: '-c 清单文件', desc: '按清单文件逐条校验' },
        { flag: '-b', desc: '以二进制模式读取文件' },
        { flag: '--quiet', desc: '校验时只打印失败的行' },
        { flag: '--status', desc: '完全不输出，只用退出码表示结果' },
        { flag: '--tag', desc: '输出 BSD 风格的摘要格式' }
      ],
      examples: [
        { cmd: 'md5sum /data/backup/db_20240101.tar.gz', desc: '计算备份包摘要并记录到校验清单' },
        { cmd: 'md5sum /data/dist/*.tar.gz > md5list.txt', desc: '为整个发布目录生成校验清单' },
        { cmd: 'md5sum -c md5list.txt', desc: '按清单批量校验文件是否被改动或损坏' }
      ],
      notes: [
        'MD5 存在碰撞攻击风险，只适合校验传输与存储错误，**不要用于安全防篡改**',
        '`md5sum -c` 校验失败会逐条打印 FAILED 并返回非 0，可直接接入 CI 流水线',
        '计算摘要要完整读一遍文件，几十 G 的镜像会比较慢，脚本里可加 `--quiet` 减少输出',
        '清单文件里的路径是相对路径，`-c` 时必须在对应目录下执行，否则全部报缺失'
      ],
      related: ['lb-sha256sum', 'lb-cmp', 'lb-file', 'lb-split'],
      docs: 'https://man7.org/linux/man-pages/man1/md5sum.1.html',
      tags: ['校验', '摘要', '完整性']
    },

    /* ---------- 39 / 60 ---------- */
    {
      id: 'lb-sha256sum',
      name: 'sha256sum',
      alias: ['sha256', '安全校验'],
      level: 3,
      syntax: 'sha256sum [选项] [文件...]',
      summary: '生成 SHA-256 摘要，比 MD5 更安全，用于校验与防篡改。',
      desc: '输出 64 位十六进制摘要，适用于发布包校验、镜像一致性确认与安全合规场景。算法比 MD5 略慢，但抗碰撞能力足够，是当前文件完整性校验的主流选择。',
      params: [
        { flag: '-c 清单文件', desc: '按清单文件批量校验' },
        { flag: '-b', desc: '以二进制模式读取' },
        { flag: '--quiet', desc: '校验时只打印失败项' },
        { flag: '--status', desc: '静默，仅用退出码表示结果' },
        { flag: '--ignore-missing', desc: '清单中存在但本地缺失的文件不报错' }
      ],
      examples: [
        { cmd: 'sha256sum /data/iso/CentOS-7-x86_64-Minimal-2009.iso', desc: '计算镜像摘要，与官方镜像站公布的值比对' },
        { cmd: 'find /data/dist -type f -exec sha256sum {} \\; > sha256list.txt', desc: '为整个发布目录生成校验清单' },
        { cmd: 'sha256sum -c sha256list.txt', desc: '批量校验发布包是否被篡改或损坏' }
      ],
      notes: [
        '比对用的摘要值必须来自可信渠道（官网 HTTPS 页面），和文件一起下载下来的校验值没有安全意义',
        '`-c` 时文件缺失会报 FAILED，确实不关心缺失文件可加 `--ignore-missing`',
        '摘要只能证明内容一致，不能证明来源可信；供应链安全还需要 GPG 签名验证'
      ],
      related: ['lb-md5sum', 'lb-cmp', 'lb-wget', 'lb-curl-o'],
      docs: 'https://man7.org/linux/man-pages/man1/sha256sum.1.html',
      tags: ['校验', '安全', '摘要']
    },

    /* ---------- 40 / 60 ---------- */
    {
      id: 'lb-tar',
      name: 'tar',
      alias: ['打包', '解包'],
      level: 3,
      syntax: 'tar [选项] [归档文件] [文件...]',
      summary: '打包与解开归档文件，配合 gzip/xz/zstd 做备份与传输。',
      desc: '`tar` 自己只打包不压缩，靠 `-z` 调 gzip、`-j` 调 bzip2、`-J` 调 xz、`--zstd` 调 zstd。选项里的 `f` 必须紧挨着归档文件名，并且放在其他选项之后。备份、交付、迁移几乎都绕不开它。',
      params: [
        { flag: '-c', desc: '创建归档（打包）' },
        { flag: '-x', desc: '解开归档（解包）' },
        { flag: '-t', desc: '只列出归档内容清单，不解包' },
        { flag: '-z / -J / --zstd', desc: '分别调用 gzip / xz / zstd 压缩或解压' },
        { flag: '-f 文件名', desc: '指定归档文件名，必须紧跟文件名且写在最后' },
        { flag: '-C 目录', desc: '先切换到指定目录再打包或解包' },
        { flag: '--exclude=模式', desc: '打包时排除匹配的文件或目录' },
        { flag: '-v', desc: '显示处理过程（文件很多时输出会很长）' }
      ],
      examples: [
        { cmd: 'tar -czf /data/backup/app-$(date +%F).tar.gz -C /data/app .', desc: '用 -C 进入目录再打包，避免把绝对路径写进包里' },
        { cmd: 'tar -xzf /data/backup/app-2024-01-01.tar.gz -C /data/restore', desc: '解包到指定目录，不污染当前目录' },
        { cmd: 'tar -tzf /data/backup/app-2024-01-01.tar.gz | head -20', desc: '解包前先看包里有什么，确认目录结构对不对' },
        { cmd: 'tar -czf /data/backup/logs.tar.gz --exclude="*.tmp" --exclude="cache" /var/log/myapp', desc: '排除临时文件与缓存目录后再打包，包更小' }
      ],
      notes: [
        '`-f` 后面必须紧跟归档文件名，正确写法是 `tar -czvf 包名 目录`；写成 `tar -czfv 包名` 会把 `v` 当成文件名',
        '打包时用相对路径（配合 `-C`），否则解包会把内容释放回原绝对路径，可能直接覆盖生产文件',
        '`--exclude` 匹配的是路径片段，写 `--exclude=logs` 会连 `app/logs` 一起排除，注意范围',
        '`-z` 兼容性最好；想要更高压缩率可用 `-J`（xz）或 `--zstd`，后者在 CentOS 7 上默认不带',
        '解包前先 `-tzf` 看清单，再用 `-C` 指定目录，两步走最安全',
        '忘了加压缩参数时 tar 会生成不压缩的 .tar，注意 `file` 一下确认实际格式'
      ],
      related: ['lb-gzip', 'lb-zip', 'lb-rsync', 'lb-split', 'lb-find', 'lb-xz'],
      docs: 'https://man7.org/linux/man-pages/man1/tar.1.html',
      tags: ['压缩', '打包', '备份']
    },

    /* ---------- 41 / 60 ---------- */
    {
      id: 'lb-gzip',
      name: 'gzip',
      alias: ['压缩'],
      level: 2,
      syntax: 'gzip [选项] [文件...]',
      summary: '压缩单个文件，默认用 `.gz` 替换原文件，日志归档常用。',
      desc: '**默认会删除原文件**，只留下 `.gz`，这是最容易踩的坑；要保留原文件加 `-k`。gzip 不能把多个文件打成一个包，多文件归档请用 `tar -czf`。压缩率与速度可用 `-1`~`-9` 调节。',
      params: [
        { flag: '-k', desc: '保留原文件，只生成 .gz' },
        { flag: '-d', desc: '解压，等价于 gunzip' },
        { flag: '-9', desc: '最高压缩率（更慢）' },
        { flag: '-1', desc: '最快压缩（压缩率最低）' },
        { flag: '-l', desc: '查看压缩前后大小与压缩比' },
        { flag: '-r', desc: '递归压缩目录下的每个文件' }
      ],
      examples: [
        { cmd: 'gzip -k /data/app/logs/order.log', desc: '压缩日志但保留原文件，得到 order.log.gz' },
        { cmd: 'gzip -9 /data/backup/db.sql', desc: '用最高压缩率压缩数据库导出文件，长期归档更省空间' },
        { cmd: 'gzip -l /data/backup/db.sql.gz', desc: '查看压缩比，判断是否值得再压' },
        { cmd: 'gzip -dk /data/backup/db.sql.gz', desc: '解压并保留压缩包，线上操作更稳' }
      ],
      notes: [
        '不带 `-k` 时 `gzip` 会**删除原文件**，压缩前先确认原文是否还需要留一份',
        '已经压缩过的文件（jpg、png、mp4、已 gzip 的包）再压基本没效果，纯属浪费 CPU',
        '`gzip -r` 是逐个文件压缩，不会打成单包；要单包请用 `tar -czf`',
        '压缩大文件时磁盘会同时存在原文件与 .gz，先确认剩余空间够用'
      ],
      related: ['lb-gunzip', 'lb-tar', 'lb-zstd', 'lb-xz', 'lb-zip'],
      docs: 'https://www.gnu.org/software/gzip/manual/gzip.html',
      tags: ['压缩', '日志', '归档']
    },

    /* ---------- 42 / 60 ---------- */
    {
      id: 'lb-gunzip',
      name: 'gunzip',
      alias: ['解压 gz'],
      level: 1,
      syntax: 'gunzip [选项] [文件...]',
      summary: '解开 `.gz` 文件，等价于 `gzip -d`，默认也会删掉压缩包。',
      desc: '解压后默认删除 `.gz` 文件，想保留压缩包加 `-k`。`-c` 可以把解压结果送到标准输出，配合管道查看内容而不落地。报 `not in gzip format` 时先用 `file` 看真实类型。',
      params: [
        { flag: '-k', desc: '保留 .gz 压缩包' },
        { flag: '-c', desc: '解压结果输出到标准输出，不改动原文件' },
        { flag: '-l', desc: '列出压缩包信息（原始大小、压缩比）' },
        { flag: '-t', desc: '只测试压缩包是否完整，不解压' },
        { flag: '-f', desc: '强制覆盖已存在的输出文件' }
      ],
      examples: [
        { cmd: 'gunzip -k /data/backup/db.sql.gz', desc: '解压数据库备份并保留压缩包，线上更稳妥' },
        { cmd: 'gunzip -c /data/backup/app.log.gz | less', desc: '不解压落盘，直接管道查看压缩日志内容' },
        { cmd: 'gunzip -t /data/backup/db.sql.gz', desc: '只校验压缩包是否损坏，适合备份巡检脚本' }
      ],
      notes: [
        '默认删除 `.gz`，需要保留请加 `-k`，或先用 `-c` 输出到别处',
        '报 `not in gzip format` 通常是文件其实是 zip/tar，或者下载不完整，先用 `file` 确认',
        '解压前用 `df -h` 看一眼目标盘剩余空间，别把磁盘撑满',
        '`.tgz` 与 `.tar.gz` 是同一格式，`gunzip` 只能解出一层，里面的 tar 还要再 `tar -xf`'
      ],
      related: ['lb-gzip', 'lb-tar', 'lb-file', 'lb-unzip'],
      docs: 'https://www.gnu.org/software/gzip/manual/gzip.html',
      tags: ['解压', '归档', '日志']
    },

    /* ---------- 43 / 60 ---------- */
    {
      id: 'lb-zip',
      name: 'zip',
      alias: ['压缩包'],
      level: 2,
      syntax: 'zip [选项] 压缩包名 文件...',
      summary: '生成 zip 压缩包，跨平台交付给 Windows 环境最省事。',
      desc: '与 `tar` 不同，`zip` 是"先写包名、再写要压的文件"，且**默认保留原文件**。Windows 原生支持 zip，交付给非 Linux 环境优先选它。最小化安装通常不带，需 `yum install -y zip` 或 `apt install -y zip`。',
      params: [
        { flag: '-r', desc: '递归压缩整个目录' },
        { flag: '-9', desc: '最高压缩率' },
        { flag: '-q', desc: '静默模式，不打印压缩过程' },
        { flag: '-e', desc: '使用密码加密（会交互提示输入密码）' },
        { flag: '-x 模式', desc: '排除匹配的文件' },
        { flag: '-j', desc: '不保留目录结构，只存文件' }
      ],
      examples: [
        { cmd: 'zip -r /data/dist/site.zip /data/www', desc: '递归打包网站目录，用于交付或迁移' },
        { cmd: 'zip -r -9 -x "*.log" /data/dist/app.zip /data/app', desc: '最高压缩率打包并排除日志文件' },
        { cmd: 'zip -e /data/dist/secret.zip /data/conf/db.conf', desc: '生成带密码的压缩包，适合临时传递配置文件' }
      ],
      notes: [
        '中文文件名在 Windows 上解压可能乱码，是编码差异导致，交付前先在 Windows 上试解一次',
        '`-e` 使用的传统 zip 加密强度较弱，敏感数据请改用 `openssl` 或 `gpg` 加密',
        '`zip` 默认不删源文件，与 `gzip`、`xz` 的默认行为相反，别搞混',
        'CentOS 7 最小化安装没有 zip，先 `yum install -y zip unzip`'
      ],
      related: ['lb-unzip', 'lb-tar', 'lb-gzip', 'lb-sha256sum'],
      docs: 'https://infozip.sourceforge.net/Zip.html',
      tags: ['压缩', '跨平台', '交付']
    },

    /* ---------- 44 / 60 ---------- */
    {
      id: 'lb-unzip',
      name: 'unzip',
      alias: ['解压 zip'],
      level: 2,
      syntax: 'unzip [选项] 压缩包 [文件...]',
      summary: '解开 zip 包，可先列清单再选择性解压到指定目录。',
      desc: '不带选项时直接解压到当前目录并保留包内目录结构。养成"先 `-l` 看清单、再用 `-d` 指定目录"的习惯，能避免文件散落一地或覆盖已有文件。',
      params: [
        { flag: '-l', desc: '只列出包内文件清单，不解压' },
        { flag: '-d 目录', desc: '解压到指定目录' },
        { flag: '-o', desc: '覆盖已有文件且不提示' },
        { flag: '-n', desc: '不覆盖已存在的文件' },
        { flag: '-O 编码', desc: '指定文件名编码，解决中文乱码' },
        { flag: '-x 模式', desc: '排除指定文件' }
      ],
      examples: [
        { cmd: 'unzip -l /data/dist/site.zip', desc: '解压前先看包里有哪些文件' },
        { cmd: 'unzip /data/dist/site.zip -d /data/www', desc: '解压到指定目录，不污染当前目录' },
        { cmd: 'unzip -O gbk /data/dist/site.zip -d /data/www', desc: '指定 GBK 编码解压，解决 Windows 打包的中文乱码' },
        { cmd: 'unzip -o /data/dist/app.zip -d /data/app -x "*.log"', desc: '覆盖解压并排除日志文件' }
      ],
      notes: [
        '不带 `-d` 会解压到当前目录，几十个文件散落一地；先 `cd` 或用 `-d` 指定',
        '中文乱码时用 `-O gbk`（Windows 打的包常见），部分发行版需写成 `-O cp936`',
        '遇到同名文件默认会交互询问，脚本里必须显式加 `-o` 或 `-n`，否则会卡住等待输入',
        'zip 包内可能含绝对路径或 `../`，解压前用 `-l` 检查，避免被写到系统目录（zip slip）'
      ],
      related: ['lb-zip', 'lb-tar', 'lb-file', 'lb-gunzip'],
      docs: 'https://infozip.sourceforge.net/UnZip.html',
      tags: ['解压', '跨平台', '文件']
    },

    /* ---------- 45 / 60 ---------- */
    {
      id: 'lb-xz',
      name: 'xz',
      alias: ['高压缩比'],
      level: 3,
      syntax: 'xz [选项] [文件...]',
      summary: '高压缩比压缩工具，压得最小但很慢，适合长期归档。',
      desc: '压缩率通常明显优于 gzip，解压速度也不差，代价是压缩过程很吃 CPU 与时间。默认同样删除原文件。`tar -J` 就是调用它，很多发行版的源码包用 `.tar.xz`。',
      params: [
        { flag: '-d', desc: '解压 .xz 文件' },
        { flag: '-k', desc: '保留原文件' },
        { flag: '-9', desc: '最高压缩率（很慢）' },
        { flag: '-T N', desc: '多线程压缩，-T 0 表示用满所有 CPU 核' },
        { flag: '-l', desc: '查看压缩信息（压缩前后大小与比值）' },
        { flag: '-z', desc: '强制进入压缩模式' }
      ],
      examples: [
        { cmd: 'xz -k -T 0 -9 /data/backup/db.sql', desc: '多线程最高压缩率压缩备份文件，适合夜间归档（`-k` 保留原文件）' },
        { cmd: 'xz -dk /data/backup/db.sql.xz', desc: '解压并保留 .xz 文件' },
        { cmd: 'xz -l /data/backup/db.sql.xz', desc: '查看压缩比，估算归档收益' },
        { cmd: 'tar -cJf /data/backup/app.tar.xz -C /data/app .', desc: '用 tar 调用 xz 打包整个应用目录' }
      ],
      notes: [
        '`-9` 压缩大文件可能耗时几十分钟甚至更久，要注意业务窗口期；`-T 0` 能显著加速但会吃满 CPU',
        '默认删除原文件，要保留请加 `-k`',
        'CentOS 7 自带版本较老，`-T` 多线程支持有限，追求速度可考虑 `zstd`',
        '解压 `.tar.xz` 要分两层理解：外层是 xz 流，内层才是 tar 归档，报错时用 `file` 判断卡在哪一层'
      ],
      related: ['lb-tar', 'lb-gzip', 'lb-zstd', 'lb-gunzip'],
      docs: 'https://manpages.debian.org/bookworm/xz-utils/xz.1.en.html',
      tags: ['压缩', '归档', '高压缩比']
    },

    /* ---------- 46 / 60 ---------- */
    {
      id: 'lb-zstd',
      name: 'zstd',
      alias: ['zstandard', '现代压缩'],
      level: 3,
      syntax: 'zstd [选项] [文件...]',
      summary: '兼顾高压缩率与极快速度的现代压缩工具，适合日志与备份。',
      desc: '压缩速度远快于 xz，压缩率又优于 gzip，还原生支持多线程，越来越多的发行版、容器镜像与内核在用。`tar --zstd` 可调用它，`.tar.zst` 是近年的常见归档格式。',
      params: [
        { flag: '-d', desc: '解压 .zst 文件' },
        { flag: '-k', desc: '保留原文件' },
        { flag: '-19', desc: '最高压缩级别（1~19，默认 3）' },
        { flag: '-T N', desc: '多线程，-T 0 用满所有核' },
        { flag: '--rm', desc: '压缩成功后删除源文件' },
        { flag: '-t', desc: '测试压缩包完整性' }
      ],
      examples: [
        { cmd: 'zstd -k -T0 -19 /data/backup/db.sql', desc: '多线程高压缩率压缩备份文件（`-k` 保留原文件，方便和上一条 xz 对比）' },
        { cmd: 'zstd -dk /data/backup/db.sql.zst', desc: '解压 .zst 文件并保留压缩包' },
        { cmd: 'tar -c --zstd -f /data/backup/app.tar.zst -C /data/app .', desc: '用 tar 调用 zstd 打包应用目录' },
        { cmd: 'zstd -t /data/backup/db.sql.zst', desc: '校验压缩包完整性，适合备份巡检' }
      ],
      notes: [
        'CentOS 7 默认源里没有 zstd，需要 `yum install -y zstd`；Ubuntu 20.04+ 与较新的 CentOS Stream 自带',
        '默认**保留**原文件，与 gzip、xz 相反；要删源文件必须显式加 `--rm`',
        '级别 19 很慢，日常归档用默认级别（3）在速度与体积之间更划算',
        '老版本 tar 不支持 `--zstd`，可改用管道写法：`tar -c -C /data/app . | zstd -T0 -o app.tar.zst`'
      ],
      related: ['lb-xz', 'lb-gzip', 'lb-tar', 'lb-gunzip'],
      docs: 'https://facebook.github.io/zstd/zstd_manual.html',
      tags: ['压缩', '高性能', '归档']
    },

    /* ---------- 47 / 60 ---------- */
    {
      id: 'lb-scp',
      name: 'scp',
      alias: ['远程复制'],
      level: 2,
      syntax: 'scp [选项] 源 目标',
      summary: '基于 SSH 在本地与远程主机之间加密复制文件或目录。',
      desc: '走 SSH 加密通道，语法与 `cp` 类似，远程路径写成 `用户@主机:路径`。只能整体复制、不能增量，中断后要重传；大目录和大文件优先用 `rsync`。新版 OpenSSH 的 `scp` 已改用 SFTP 协议实现，行为与老版本略有差异。',
      params: [
        { flag: '-r', desc: '递归复制整个目录' },
        { flag: '-P 端口', desc: '指定 SSH 端口，注意是大写 P' },
        { flag: '-i 私钥', desc: '指定登录用的私钥文件' },
        { flag: '-C', desc: '传输时压缩，适合带宽紧张的场景' },
        { flag: '-p', desc: '保留文件的修改时间与权限' },
        { flag: '-l 速率', desc: '限速，单位 Kbit/s' }
      ],
      examples: [
        { cmd: 'scp /data/dist/app.tar.gz root@192.168.1.10:/data/dist/', desc: '把发布包上传到云主机' },
        { cmd: 'scp -r /data/app/conf root@192.168.1.10:/data/app/', desc: '递归上传整个配置目录' },
        { cmd: 'scp -i ~/.ssh/id_rsa -P 2222 root@192.168.1.10:/data/logs/order.log ./', desc: '用指定私钥和非默认端口把日志下载到本地' },
        { cmd: 'scp -C -l 2048 /data/backup/db.sql.gz root@192.168.1.10:/data/backup/', desc: '压缩传输并限速 2Mbit/s，避免打满专线' }
      ],
      notes: [
        '端口参数是**大写 `-P`**；小写 `-p` 是保留时间戳，写错会静默改变行为',
        '传大目录或需要断点续传时用 `rsync -avz --partial`，`scp` 中断后只能重头再来',
        '首次连接会提示确认主机指纹，自动化脚本可加 `-o StrictHostKeyChecking=accept-new`',
        '安全组或防火墙没放行 22 端口时，命令会一直卡住直到超时，先确认网络连通性',
        '两台远程主机互传会经过本地中转（除非加 `-3` 之外的场景），跨地域时速度受本地上行带宽限制'
      ],
      related: ['lb-rsync', 'lb-sftp', 'lb-tar', 'lb-sha256sum'],
      docs: 'https://man7.org/linux/man-pages/man1/scp.1.html',
      tags: ['远程', '传输', 'SSH']
    },

    /* ---------- 48 / 60 ---------- */
    {
      id: 'lb-rsync',
      name: 'rsync',
      alias: ['增量同步', '远程同步'],
      level: 3,
      syntax: 'rsync [选项] 源 目标',
      summary: '增量同步文件，只传变化的部分，备份与发布的标准工具。',
      desc: '核心是"先比对、再传输"的差量算法，重复执行极快。本地目录镜像、同步到云主机、异地备份都用它。**源路径结尾有没有 `/` 语义完全不同**：带斜杠是同步目录内容，不带斜杠是在目标下再建一层目录。',
      params: [
        { flag: '-a', desc: '归档模式，递归并保留权限、属主、时间戳、软链接' },
        { flag: '-v', desc: '显示同步过程与文件列表' },
        { flag: '-z', desc: '传输时压缩，跨公网省带宽' },
        { flag: '--delete', desc: '删除目标端多余的文件，使两端完全一致（危险）' },
        { flag: '--exclude=模式', desc: '排除指定文件或目录' },
        { flag: '-e "ssh -p 端口"', desc: '指定远程 Shell 及参数，如非默认端口、指定私钥' },
        { flag: '--dry-run', desc: '只演练不传输，配合 -v 预览会做哪些改动' },
        { flag: '--partial --progress', desc: '保留半成品以支持断点续传，并显示进度' }
      ],
      examples: [
        { cmd: 'rsync -avz --delete /data/www/ /data/backup/www/', desc: '本地目录镜像同步，目标端多余文件会被删除' },
        { cmd: 'rsync -avz --exclude="*.log" --exclude="cache/" /data/app/ root@192.168.1.10:/data/app/', desc: '排除日志与缓存后增量同步到云主机' },
        { cmd: 'rsync -avz --dry-run /data/www/ root@192.168.1.10:/data/www/', desc: '正式同步前先演练，确认要传哪些文件、会不会删东西' },
        { cmd: 'rsync -avz -e "ssh -p 2222 -i ~/.ssh/id_rsa" /data/backup/ root@192.168.1.10:/data/backup/', desc: '指定 SSH 端口与私钥同步备份目录' },
        { cmd: 'rsync -avz --partial --progress /data/iso/CentOS-7.iso root@192.168.1.10:/data/iso/', desc: '大文件带进度同步，中断后可续传' }
      ],
      notes: [
        '`--delete` 会删除目标端多余文件，方向写反或路径写错就是数据丢失，务必先加 `--dry-run` 演练',
        '源路径末尾的 `/` 决定语义：`/data/www/` 同步的是目录**内容**，`/data/www` 会在目标下再建一层 `www`，这是最高频的踩坑点',
        '`-a` 隐含 `-rlptgoD`，其中保留属主属组需要 root；普通用户同步会退化为当前用户身份，导致权限不符',
        '`--exclude` 的路径相对传输根目录，写 `--exclude=/logs` 只排除根下的 logs，不加斜杠会排除任意层级的 logs',
        '默认按"大小 + 修改时间"判断差异，内容相同但时间不同仍会重传；要更严格可加 `-c`（校验和模式，明显更慢）',
        '同步正在写入的数据库文件不可靠，应先停写或先导出成静态文件再同步'
      ],
      related: ['lb-scp', 'lb-sftp', 'lb-tar', 'lb-cp', 'lb-diff'],
      docs: 'https://man7.org/linux/man-pages/man1/rsync.1.html',
      tags: ['同步', '备份', '增量']
    },

    /* ---------- 49 / 60 ---------- */
    {
      id: 'lb-sftp',
      name: 'sftp',
      alias: ['SSH 文件传输'],
      level: 2,
      syntax: 'sftp [选项] [用户@]主机',
      summary: '在 SSH 加密通道里交互式传文件，像 FTP 一样浏览远端目录。',
      desc: '登录后可以用 `ls`、`cd`、`get`、`put`、`mkdir`、`rm` 等子命令操作远端，本地命令要加 `l` 前缀（`lls`、`lcd`、`lpwd`）。相比 `scp`，它的优势是能边看边传，部署时不确定远端路径时特别好用。',
      params: [
        { flag: '-P 端口', desc: '指定 SSH 端口，注意是大写 P' },
        { flag: '-i 私钥', desc: '指定登录用私钥' },
        { flag: '-b 批处理文件', desc: '按脚本自动执行，用于流水线' },
        { flag: '-C', desc: '传输时压缩' }
      ],
      examples: [
        { cmd: 'sftp root@192.168.1.10', desc: '登录远端主机，进入交互式文件传输' },
        { cmd: 'sftp -i ~/.ssh/id_rsa -P 2222 root@192.168.1.10', desc: '用指定私钥和非默认端口登录' },
        { cmd: 'sftp -b /data/scripts/upload.txt root@192.168.1.10', desc: '按批处理脚本自动上传，用于发布流水线（脚本里写 put -r /data/dist /data/dist）' }
      ],
      notes: [
        '端口同样是大写 `-P`，与 `ssh` 的小写 `-p` 相反，容易记混',
        '交互模式下本地命令必须加前缀 `l`：`lpwd`、`lls`、`lcd`，不加就是操作远端',
        '`-b` 批处理模式不会交互提示，任一步失败就可能中断后续动作，脚本里要做好失败判断',
        '传输大量小文件效率很低，先 `tar` 打包再传会快得多'
      ],
      related: ['lb-scp', 'lb-rsync', 'lb-tar', 'lb-ls'],
      docs: 'https://man7.org/linux/man-pages/man1/sftp.1.html',
      tags: ['远程', '传输', 'SSH']
    },

    /* ---------- 50 / 60 ---------- */
    {
      id: 'lb-wget',
      name: 'wget',
      alias: ['下载'],
      level: 2,
      syntax: 'wget [选项] URL',
      summary: '命令行下载文件，支持断点续传与后台下载，服务器上最常用。',
      desc: '默认把文件下载到当前目录，`-c` 断点续传、`-b` 后台下载、`--limit-rate` 限速、`-r` 递归镜像。脚本里拉取安装包、下载镜像优先用它，比 `curl -O` 多了断点续传和递归能力。',
      params: [
        { flag: '-c', desc: '断点续传，网络中断后可接着下' },
        { flag: '-O 文件名', desc: '另存为指定文件名' },
        { flag: '-P 目录', desc: '保存到指定目录（保留原文件名）' },
        { flag: '-b', desc: '后台下载，日志写入 wget-log' },
        { flag: '--limit-rate=速度', desc: '限速，如 --limit-rate=2m' },
        { flag: '--no-check-certificate', desc: '跳过 HTTPS 证书校验' }
      ],
      examples: [
        { cmd: 'wget https://mirrors.huaweicloud.com/centos/7/isos/x86_64/CentOS-7-x86_64-Minimal-2009.iso', desc: '从华为云镜像站下载系统镜像' },
        { cmd: 'wget -c https://obs.cn-north-4.myhuaweicloud.com/backup/db_backup.tar.gz', desc: '断点续传下载备份包，网络抖动后接着下' },
        { cmd: 'wget -b --limit-rate=2m https://example.com/data/big.iso', desc: '后台限速下载，避免打满生产带宽' },
        { cmd: 'wget -O /data/dist/app.tar.gz https://example.com/releases/app-1.2.0.tar.gz', desc: '下载并另存为指定文件名' }
      ],
      notes: [
        '`-O` 指定的文件若已存在会**直接覆盖**，脚本里要留意目标名是否冲突',
        '`--no-check-certificate` 会跳过证书校验，只应在明确知道原因时临时使用',
        '下载大文件建议加 `-c`，完成后用 `sha256sum` 与官方公布值核对',
        'CentOS 7 最小化安装可能不带 wget，先 `yum install -y wget`；也可用 `curl -O` 替代'
      ],
      related: ['lb-curl-o', 'lb-sha256sum', 'lb-gunzip', 'lb-tar'],
      docs: 'https://man7.org/linux/man-pages/man1/wget.1.html',
      tags: ['下载', '网络', '运维']
    },

    /* ---------- 51 / 60 ---------- */
    {
      id: 'lb-curl-o',
      name: 'curl -O',
      alias: ['curl', '下载文件'],
      level: 2,
      syntax: 'curl -O [选项] URL',
      summary: '用 HTTP/HTTPS 下载文件，`-O` 按远端文件名保存到本地。',
      desc: '`-O`（大写字母 O）保留服务器上的文件名，`-o`（小写）自定义本地文件名，这是最容易写错的一对参数。curl 默认把响应内容打印到屏幕，不加 `-O` 或 `-o` 时什么文件都不会生成。',
      params: [
        { flag: '-O', desc: '按 URL 里的文件名保存到当前目录' },
        { flag: '-o 文件名', desc: '另存为指定名字或路径' },
        { flag: '-L', desc: '跟随 301/302 跳转' },
        { flag: '-C -', desc: '断点续传，接着上次的位置继续下' },
        { flag: '-f', desc: 'HTTP 返回错误码时直接失败（脚本里建议加）' },
        { flag: '-s', desc: '静默模式，不显示进度与错误' }
      ],
      examples: [
        { cmd: 'curl -O https://example.com/releases/app-1.2.0.tar.gz', desc: '按远端文件名把发布包下载到当前目录' },
        { cmd: 'curl -L -O https://example.com/download/app.tar.gz', desc: '跟随跳转下载，很多下载链接会先返回 302' },
        { cmd: 'curl -C - -O https://example.com/data/big.iso', desc: '断点续传继续下载大文件' },
        { cmd: 'curl -f -o /data/dist/app.tar.gz https://example.com/releases/app-1.2.0.tar.gz', desc: '指定本地保存路径，且 HTTP 出错时立即失败' }
      ],
      notes: [
        '`-O` 大写是用远端文件名，`-o` 小写是自己指定名字，写反了不会报错但结果不对',
        '不加 `-O`/`-o` 时响应体会直接打到屏幕上，只会刷屏不会存盘',
        '下载地址有 302 跳转时必须加 `-L`，否则只会下到一个跳转页面（几 KB 的 HTML）',
        '脚本里建议配合 `-f` 和 `--retry 3`，避免把错误页面当成文件存下来',
        '需要递归镜像整站时 curl 不合适，请用 `wget -r`'
      ],
      related: ['lb-wget', 'lb-sha256sum', 'lb-tar', 'lb-file'],
      docs: 'https://man7.org/linux/man-pages/man1/curl.1.html',
      tags: ['下载', 'HTTP', '网络']
    },

    /* ---------- 52 / 60 ---------- */
    {
      id: 'lb-tee',
      name: 'tee',
      alias: ['双向输出'],
      level: 2,
      syntax: 'tee [选项] [文件...]',
      summary: '把管道数据同时写到屏幕和文件，边看边留档的利器。',
      desc: '管道末尾的重定向只能二选一：要么显示、要么存盘，`tee` 让两者同时成立。它也是写入系统文件的正解——`sudo echo x >> /etc/f` 无效，而 `echo x | sudo tee -a /etc/f` 可以。',
      params: [
        { flag: '-a', desc: '追加写入，不覆盖原文件' },
        { flag: '-i', desc: '忽略中断信号（Ctrl+C）' },
        { flag: '-p', desc: '检查写入过程中的错误' }
      ],
      examples: [
        { cmd: 'systemctl status nginx | tee /data/logs/nginx-status.log', desc: '命令输出同时打屏和存盘，方便事后复盘' },
        { cmd: 'echo "net.ipv4.ip_forward = 1" | sudo tee -a /etc/sysctl.conf', desc: '用 sudo tee 追加写系统配置文件' },
        { cmd: 'tail -f /var/log/nginx/access.log | tee -a /data/logs/access-copy.log', desc: '实时抓取日志同时留一份副本' }
      ],
      notes: [
        '`sudo echo x >> /etc/file` 提权无效：重定向由当前 Shell 执行，正确写法是 `echo x | sudo tee -a /etc/file`',
        '不带 `-a` 会**覆盖**目标文件，追加务必加 `-a`',
        '数据被写两份，大流量管道下磁盘写入量翻倍，注意目标盘剩余空间',
        '写多人共用的日志文件时，`tee -a` 也不是原子的，高并发场景应交由日志系统处理'
      ],
      related: ['lb-cat', 'lb-tail', 'lb-xargs', 'lb-watch'],
      docs: 'https://man7.org/linux/man-pages/man1/tee.1.html',
      tags: ['管道', '日志', '重定向']
    },

    /* ---------- 53 / 60 ---------- */
    {
      id: 'lb-xargs',
      name: 'xargs',
      alias: ['参数传递'],
      level: 3,
      syntax: '命令 | xargs [选项] [命令]',
      summary: '把标准输入拆成命令行参数，管道与批量操作之间的粘合剂。',
      desc: '`rm`、`cp`、`kill` 这类命令不能从管道读参数，`xargs` 负责把上一段的输出转成参数列表。默认按空白字符切分，**文件名含空格就会切错**，配合 `find -print0` 时必须用 `-0`。',
      params: [
        { flag: '-0', desc: '输入以 NUL 分隔，配合 find -print0 正确处理带空格的文件名' },
        { flag: '-n N', desc: '每次传递 N 个参数给命令' },
        { flag: '-I {}', desc: '用占位符把每个输入逐个放到命令的指定位置' },
        { flag: '-p', desc: '执行每条命令前先询问确认' },
        { flag: '-t', desc: '执行前打印将要运行的命令' },
        { flag: '-r', desc: '输入为空时不运行命令（GNU 扩展）' },
        { flag: '-P N', desc: '并行度，同时运行 N 个进程' }
      ],
      examples: [
        { cmd: 'find /data/tmp -name "*.tmp" -print0 | xargs -0 rm -f', desc: '批量清理临时文件，文件名带空格也不会删错' },
        { cmd: 'find /data/logs -name "*.log" | xargs -I {} mv {} /data/archive/', desc: '把每个日志文件逐个移动到归档目录' },
        { cmd: 'cat /data/iplist.txt | xargs -n 1 -P 4 ping -c 1', desc: '每次 ping 一个地址，并发 4 个做批量连通性检查' },
        { cmd: 'find /data/old -type f -name "*.bak" | xargs -p rm -f', desc: '删除前逐条确认，避免批量误删' }
      ],
      notes: [
        '**空输入陷阱**：上游没有输出时，某些实现仍会执行一次不带参数的 `rm`，GNU 环境下请加 `-r`，且不要轻易在 `xargs` 后面挂破坏性命令',
        '文件名含空格必须写 `find ... -print0 | xargs -0`，否则一个文件会被拆成多个参数，删错对象',
        '`-I {}` 隐含"每次只传一个参数"，效率低于 `-n`，能用 `-n` 就不要用 `-I`',
        '`-P` 并行会打乱输出顺序，也可能瞬间拉起大量进程压垮机器，生产上给个合理并发数',
        '`xargs` 默认会把单双引号当语法解析，文件名里含引号时更要用 `-0`'
      ],
      related: ['lb-find', 'lb-tee', 'lb-rm', 'lb-wc', 'lb-sort'],
      docs: 'https://man7.org/linux/man-pages/man1/xargs.1.html',
      tags: ['管道', '批量', '参数']
    },

    /* ---------- 54 / 60 ---------- */
    {
      id: 'lb-watch',
      name: 'watch',
      alias: ['定时刷新'],
      level: 2,
      syntax: 'watch [选项] 命令',
      summary: '按固定间隔重复执行命令并全屏刷新，盯着指标变化最直观。',
      desc: '默认每 2 秒执行一次并覆盖刷新屏幕，`-d` 高亮变化的部分，`-n` 调整间隔。看磁盘占用变化、连接数增长、容器状态迁移这类动态指标特别顺手，比反复手敲命令高效得多。',
      params: [
        { flag: '-n 秒', desc: '刷新间隔，最小 0.1 秒' },
        { flag: '-d', desc: '高亮显示两次输出之间的差异' },
        { flag: '-t', desc: '不显示顶部的标题栏（命令与时间）' },
        { flag: '-e', desc: '命令出错时暂停刷新' },
        { flag: '-g', desc: '输出发生变化时退出，适合等状态出现' },
        { flag: '-b', desc: '命令返回非 0 时响铃提示' }
      ],
      examples: [
        { cmd: 'watch -n 1 -d "df -h /data"', desc: '每秒刷新数据盘占用并高亮变化，观察扩容或清理效果' },
        { cmd: 'watch -n 2 "ss -s"', desc: '持续观察 TCP 连接数变化，排查连接泄漏' },
        { cmd: 'watch -n 1 "cat /proc/loadavg"', desc: '盯住系统负载变化，配合压测观察水位' },
        { cmd: 'watch -n 5 -d "kubectl get pods -n default"', desc: '每 5 秒刷新 Pod 状态（需已配置 kubectl）' }
      ],
      notes: [
        '命令里含管道、引号或 `$` 变量时必须整体加引号：`watch "ps aux | grep nginx"`',
        '`-n 0.1` 这种高频刷新本身会给机器增加负载，生产上不要低于 1 秒',
        '`watch` 是全屏交互程序，不能放进脚本或 crontab；需要定时请直接写 cron',
        '`-g` 可以在输出变化时退出，适合"等某个状态出现再继续"的编排场景'
      ],
      related: ['lb-tail', 'lb-wc', 'lb-tee', 'lb-sort'],
      docs: 'https://man7.org/linux/man-pages/man1/watch.1.html',
      tags: ['监控', '循环', '交互']
    },

    /* ---------- 55 / 60 ---------- */
    {
      id: 'lb-dd',
      name: 'dd',
      alias: ['数据搬运', '写盘'],
      level: 3,
      syntax: 'dd if=输入 of=输出 [选项]',
      summary: '按块搬运数据，写镜像、测磁盘性能、造大文件都用它。',
      desc: '参数不用 `-` 前缀，而是 `if=`/`of=` 这种键值写法，因此看起来和别的命令不一样。它能直接对块设备读写，所以**写错 `of=` 会不可逆地毁掉整块盘或整个分区**，是 Linux 里最危险的命令之一。',
      params: [
        { flag: 'if=文件', desc: '输入源，可以是普通文件或设备（如 /dev/zero）' },
        { flag: 'of=文件', desc: '输出目标，可以是普通文件或设备（写错即毁数据）' },
        { flag: 'bs=大小', desc: '一次读写的块大小，直接影响速度' },
        { flag: 'count=N', desc: '只复制 N 个块' },
        { flag: 'status=progress', desc: '显示实时进度与速度' },
        { flag: 'conv=fsync', desc: '结束前强制刷盘，确保数据真正落盘' },
        { flag: 'oflag=direct', desc: '绕过页缓存，测真实磁盘性能' }
      ],
      examples: [
        { cmd: 'dd if=/dev/zero of=/data/test.img bs=1M count=1024 status=progress', desc: '生成 1G 测试文件，用于验证磁盘写入' },
        { cmd: 'dd if=/dev/zero of=/data/speed.test bs=1M count=2048 conv=fdatasync', desc: '测试数据盘写入速度，测完记得删除该文件' },
        { cmd: 'dd if=/data/backup/www-2024-03-17.tar.gz of=/data/backup/copy.tar.gz bs=4M conv=fsync', desc: '文件级镜像拷贝：if= 源、of= 目标、bs= 块大小、conv=fsync 落盘。**of= 写错就是覆盖错东西**，动手前先确认路径' },
        { cmd: 'dd if=/dev/zero of=/tmp/disk.img bs=1M count=100 && ls -lh /tmp/disk.img', desc: '造一个 100MB 的空盘镜像并核对大小 —— 给虚机准备空盘镜像的第一步就是它（模拟环境没有块设备，所以这里用文件演示同一条命令的写法）' }
      ],
      notes: [
        '`of=` 写错设备会**直接覆盖整块磁盘的分区表和数据**，无法恢复；执行前必须用 `lsblk`、`df -h` 逐项核对设备名，绝不凭记忆写 `/dev/sdb`',
        '`dd` 慢通常是因为 `bs` 太小（默认 512 字节），把 `bs` 提到 1M~4M 速度能差好几倍',
        '长时间没有任何输出容易让人以为卡死，加 `status=progress` 可以看到实时进度与速度',
        '对块设备操作前先 `umount` 并确认设备没被挂载使用，对正在读写的数据盘做镜像只会得到不一致内容',
        '`dd` 不会校验内容，写完请用 `sha256sum` 或 `cmp` 验证；整盘擦除场景建议用 `shred` 或云厂商的擦除能力',
        '制作镜像前确认目标文件所在分区剩余空间足够，否则写满磁盘会连带影响系统'
      ],
      related: ['lb-truncate', 'lb-split', 'lb-tar', 'lb-sha256sum'],
      docs: 'https://man7.org/linux/man-pages/man1/dd.1.html',
      tags: ['危险', '磁盘', '镜像']
    },

    /* ---------- 56 / 60 ---------- */
    {
      id: 'lb-split',
      name: 'split',
      alias: ['切分文件'],
      level: 3,
      syntax: 'split [选项] [输入 [前缀]]',
      summary: '把大文件切成若干小文件，便于分批传输或绕过大小限制。',
      desc: '默认按 1000 行切分，传大备份包时更常用按字节切。切片本身只是"切开"，不加密也不压缩；还原时用 `cat` 按顺序拼回去，顺序绝不能乱。',
      params: [
        { flag: '-b 大小', desc: '每片的字节数，支持 K/M/G' },
        { flag: '-l 行数', desc: '每片的行数，默认 1000' },
        { flag: '-n N', desc: '平均切成 N 片' },
        { flag: '-d', desc: '用数字后缀（默认是字母后缀）' },
        { flag: '-a N', desc: '后缀长度，默认 2 位' },
        { flag: '--additional-suffix=后缀', desc: '给每片加统一后缀' }
      ],
      examples: [
        { cmd: 'split -b 500M -d -a 2 /data/backup/db.tar.gz /data/backup/db.part.', desc: '把备份包按 500M 切片并数字编号' },
        { cmd: 'cat /data/backup/db.part.* > /data/restore/db.tar.gz && tar -tzf /data/restore/db.tar.gz | head', desc: '按顺序拼接切片还原，并立即校验包内容' },
        { cmd: 'split -n 4 -d /data/logs/big.log /data/logs/chunk.', desc: '把大日志平均切成 4 份，分给多人同时排查' },
        { cmd: 'split -b 100M --additional-suffix=.part /data/x /data/backup/part_', desc: '切片并统一加后缀，便于识别与清理' }
      ],
      notes: [
        '切片不能单独使用，还原必须按后缀顺序 `cat 前缀.* > 原文件`；顺序错或漏一片，文件就报废',
        '还原后务必用 `md5sum`/`sha256sum` 与源文件比对，切片传输最容易出现静默损坏',
        '`-d` 用数字后缀更好读；默认字母后缀超过 26 片会变成 `aa`、`ab`，肉眼排序容易出错',
        '`-a 2` 只够 100 片，切更多片要相应加大后缀长度，否则会覆盖已有切片'
      ],
      related: ['lb-cat', 'lb-tar', 'lb-sha256sum', 'lb-dd'],
      docs: 'https://man7.org/linux/man-pages/man1/split.1.html',
      tags: ['大文件', '切分', '传输']
    },

    /* ---------- 57 / 60 ---------- */
    {
      id: 'lb-cat-a',
      name: 'cat -A',
      alias: ['显示不可见字符', '查换行符'],
      level: 2,
      syntax: 'cat -A 文件',
      summary: '把制表符、行尾符等不可见字符显式打印出来，专治诡异文本问题。',
      desc: '等价于 `-vET`：`-v` 显示非打印字符、`-E` 在每行末尾打 `$`、`-T` 把 Tab 显示成 `^I`。配置文件莫名报错、脚本报 `bad interpreter` 时，多半是行尾带了 `^M`（Windows 换行）或开头有 BOM。',
      params: [
        { flag: '-A', desc: '等价于 -vET，一次显示所有不可见字符' },
        { flag: '-E', desc: '在每行末尾显示 $，用于确认行尾' },
        { flag: '-T', desc: '把 Tab 显示为 ^I' },
        { flag: '-v', desc: '显示非打印字符（保留换行与 Tab 的可见形式）' }
      ],
      examples: [
        { cmd: 'cat -A /etc/nginx/nginx.conf | head -20', desc: '检查配置里是否混入了 Windows 换行符 ^M' },
        { cmd: 'cat -A /data/scripts/deploy.sh | grep "\\^M"', desc: '找出脚本里的 CRLF 行，这类文件在 Linux 上执行会报错' },
        { cmd: 'cat -A /data/csv/user.csv | head -1', desc: '确认 CSV 用的是 Tab（^I）还是逗号分隔' }
      ],
      notes: [
        '行尾出现 `^M$` 说明是 Windows 换行（CRLF），可用 `sed -i "s/\\r$//" 文件` 转换后再执行',
        '文件开头出现 `M-oM-;M-?` 是 UTF-8 BOM，会导致 Shell 脚本首行 shebang 失效、报 `bad interpreter`',
        '只读不改，是排查文本类问题最安全的方式；确认原因后再动手修改'
      ],
      related: ['lb-cat', 'lb-nl', 'lb-file', 'lb-diff'],
      docs: 'https://man7.org/linux/man-pages/man1/cat.1.html',
      tags: ['文本', '排查', '不可见字符']
    },

    /* ---------- 58 / 60 ---------- */
    {
      id: 'lb-history',
      name: 'history',
      alias: ['历史命令'],
      level: 1,
      syntax: 'history [选项] [条数]',
      summary: '查看与复用历史命令，`!n` 重跑、`Ctrl+R` 反向搜索。',
      desc: '历史默认保存在 `~/.bash_history`，通常在退出 Shell 时才写入。`!!` 重跑上一条，`!n` 重跑编号为 n 的命令，`!字符串` 重跑最近一条以该字符串开头的命令，`Ctrl+R` 进入反向增量搜索。',
      params: [
        { flag: '数字 n', desc: '只显示最近 n 条历史' },
        { flag: '-c', desc: '清空当前会话的历史列表' },
        { flag: '-d 编号', desc: '删除指定编号的历史条目' },
        { flag: '-w', desc: '把当前历史写入历史文件' },
        { flag: '-a', desc: '把本次会话新增的命令追加到历史文件' }
      ],
      examples: [
        { cmd: 'history 20', desc: '查看最近 20 条命令，回想刚才做过什么' },
        { cmd: 'history | grep "tar"', desc: '从历史里翻出之前用过的打包命令直接复用' },
        { cmd: '!1024', desc: '重新执行编号为 1024 的历史命令' },
        { cmd: 'sudo !!', desc: '给上一条命令补上 sudo 重跑，比如忘了提权的 yum/apt' }
      ],
      notes: [
        '`Ctrl+R` 后输入关键字即可反向搜索，连按可继续往前找，回车执行、方向键先编辑',
        '历史默认在退出 Shell 时才落盘，多窗口操作容易互相覆盖，可先 `history -a` 立即追加',
        '命令里带明文密码会被记录进 `~/.bash_history`，敏感操作前加一个空格（需 `HISTCONTROL=ignorespace`），或事后用 `history -d 编号` 删除',
        '`history -c` 只清当前会话内存，历史文件仍在，需要一并处理 `~/.bash_history`',
        '生产跳板机上历史会保留所有操作，不要用它执行含密钥、口令的命令'
      ],
      related: ['lb-alias', 'lb-type', 'lb-cd-dash'],
      docs: 'https://man7.org/linux/man-pages/man1/bash.1.html',
      tags: ['Shell', '历史', '效率']
    },

    /* ---------- 59 / 60 ---------- */
    {
      id: 'lb-alias',
      name: 'alias',
      alias: ['别名'],
      level: 1,
      syntax: 'alias [名称[=值]]',
      summary: '给常用命令起短名字，减少重复输入，也能给危险命令加保险。',
      desc: '不带参数时列出所有已定义别名。别名只在当前 Shell 会话有效，要长期生效得写进 `~/.bashrc`。想临时绕过别名执行原始命令，在前面加反斜杠或用 `command 命令名`。',
      params: [
        { flag: '名称=值', desc: '定义别名，如 alias ll="ls -alh"' },
        { flag: '-p', desc: '以可复用的 alias 语句格式列出所有别名' },
        { flag: 'unalias 名称', desc: '取消指定别名（unalias -a 取消全部）' }
      ],
      examples: [
        { cmd: 'alias ll="ls -alh"', desc: '定义常用别名，之后敲 ll 就能看详细列表' },
        { cmd: 'alias rm="rm -i"', desc: '给 rm 加上删除前确认，降低误删风险' },
        { cmd: 'alias grep="grep --color=auto"', desc: '让 grep 结果自动高亮，便于扫日志' },
        { cmd: 'echo "alias ll=\'ls -alh\'" >> ~/.bashrc && source ~/.bashrc', desc: '把别名写进配置文件并立即生效' }
      ],
      notes: [
        '别名只在当前 Shell 有效，写进 `~/.bashrc` 后要 `source ~/.bashrc` 或重新登录才生效',
        '脚本（非交互 Shell）默认不加载 `~/.bashrc`，部署脚本里不要依赖别名，否则手动执行正常、定时任务失败',
        '想临时执行原始命令，用 `\\ls` 或 `command ls`',
        '给 `rm` 加 `-i` 别名容易养成依赖，换一台没有别名的机器时反而更危险；根本上还是要先 `ls` 确认再删'
      ],
      related: ['lb-type', 'lb-history', 'lb-rm', 'lb-which'],
      docs: 'https://man7.org/linux/man-pages/man1/bash.1.html',
      tags: ['Shell', '别名', '效率']
    },

    /* ---------- 60 / 60 ---------- */
    {
      id: 'lb-cd-dash',
      name: 'cd -',
      alias: ['返回上一目录', 'OLDPWD'],
      level: 2,
      syntax: 'cd -',
      summary: '在两个目录之间来回切换，省掉反复输入一长串路径的时间。',
      desc: '`cd -` 回到上一次所在的目录，并把切换后的路径打印出来。它依赖 Shell 变量 `OLDPWD`，本质等价于 `cd "$OLDPWD"`。在源码目录、日志目录、配置目录之间来回跳时特别省事。',
      params: [
        { flag: '-', desc: '回到上一次的工作目录（取自 $OLDPWD）' },
        { flag: '$OLDPWD', desc: '保存上一个目录的环境变量，可直接 echo 查看' }
      ],
      examples: [
        { cmd: 'cd -', desc: '回到上一次所在目录，两个目录之间来回切' },
        { cmd: 'cd - > /dev/null', desc: '静默返回上一目录，脚本里不想打印多余路径时用' },
        { cmd: 'echo $OLDPWD', desc: '查看上一次所在目录，确认 cd - 会跳到哪里' }
      ],
      notes: [
        '新开的 Shell 里 `OLDPWD` 是空的，直接 `cd -` 会报错或停在原地',
        '`cd -` 会把目标路径打印到标准输出，脚本里建议重定向到 `/dev/null`',
        '需要在多个目录间反复跳转时，用 `pushd`/`popd` 维护目录栈比 `cd -` 更合适'
      ],
      related: ['lb-cd', 'lb-pwd', 'lb-history'],
      docs: 'https://man7.org/linux/man-pages/man1/bash.1.html',
      tags: ['目录', '切换', '效率']
    }

  );
})();
