/* data/errors.js · 报错速查
   --------------------------------------------------------------------------
   排障最难的一步不是"怎么修"，而是"这句英文到底在说什么"。
   一条记录 = 一类真实报错（原文必须是真会打印出来的那句话）。

   {
     id: 'err-connection-refused',
     cat: 'linux-net',              // 主要归属分类
     msg: 'curl: (7) Failed to connect to 10.0.2.15 port 3306: Connection refused',
                                    // **报错原文**，要能一字不差地在终端里复现
     where: 'curl / telnet / nc 连数据库端口',   // 什么时候会看到它
     meaning: '……',                 // 这句话在说什么（区分 refused / timed out / unreachable）
     causes: [                      // 2~5 条常见原因，**按概率从高到低**
       '服务没起来', '只监听 127.0.0.1', '……'
     ],
     diagnose: ['ss -tulnp | grep 3306'],   // 排查命令，首词必须是引擎已实现的命令
     fix: '……',                     // 怎么修
     related: ['ln-curl'],          // 关联命令条目 id
     tags: ['网络', '端口']
   }

   校验：node tools/kb-check.js（字段、长度、引用是否断链、命令是否可跑）
   渲染：#/errors（见 assets/js/render.js 的 viewKb）
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_ERRORS = window.CC_ERRORS || [];

  window.CC_ERRORS.push(
    /* ==================== Linux 基础 / 权限 ==================== */
    {
      id: 'err-ls-no-such-file',
      cat: 'linux-basic',
      msg: "ls: cannot access '/nope': No such file or directory",
      where: 'ls / cat / stat / find 指向一个不存在的路径',
      meaning: '路径解析在最后一步失败：内核沿着目录一级级往下走，走到某一级发现没有这个名字，返回 ENOENT。它排除了"文件存在但你没权限"（那是 Permission denied）和"这是目录不能直接读"（那是 Is a directory）。注意报错里的路径是**第一个走不通的那一级**，不一定是你以为的那个文件。',
      causes: [
        '路径拼错，或大小写不对（Linux 严格区分大小写）',
        '当前目录不是你以为的那个：相对路径落到了别处，先 pwd 确认',
        '文件真被删了/移走了，或者软链指向的目标已不存在（悬空软链）',
        '路径里有变量而变量是空的，`$DIR/file` 退化成了 `/file`'
      ],
      diagnose: [
        'pwd',
        'ls -l /nope',
        'stat /nope',
        'find / -maxdepth 2 -name nope'
      ],
      fix: '逐级往上看是哪一级断的：`ls -ld /a /a/b`。路径里带变量时先 `echo "$DIR/file"` 把真实路径打出来。要建目录用 `mkdir -p`，别等报错才补。',
      related: ['lb-ls', 'lb-cat', 'lb-find', 'lb-realpath'],
      tags: ['文件', '路径', 'ENOENT']
    },
    {
      id: 'err-cat-no-such-file',
      cat: 'linux-basic',
      msg: 'cat: /data/app/app.conf: No such file or directory',
      where: 'cat / head / tail / grep 读一个不存在的文件',
      meaning: '这是**打开文件**失败，不是读取失败：open(2) 直接回了 ENOENT。它排除了"文件存在但内容为空"（那会正常退出、什么都不打印），也排除了"权限不够"（那是 Permission denied）。前缀 `cat:` 是命令自己加的，同一类错误在不同命令下前缀不同。',
      causes: [
        '文件路径写错（少写或漏写了 /data/app 这一级）',
        '配置文件被改名或挪走，只剩下备份文件 app.conf.bak',
        '读的是容器内路径，而文件其实只在宿主机上',
        '软链还在、目标已删（dangling symlink）'
      ],
      diagnose: [
        'ls -l /data/app',
        'ls -l /data/app/app.conf',
        'find /data -name "app.conf"',
        'stat /data/app'
      ],
      fix: '先 `ls -l /data/app` 看目录里到底有什么；确认是改名了，就改引用它的地方（systemd 的 EnvironmentFile、应用的 --config 参数）或把文件改回来。',
      related: ['lb-cat', 'lb-head', 'lb-tail', 'lb-ls'],
      tags: ['文件', '配置']
    },
    {
      id: 'err-permission-denied-read',
      cat: 'linux-basic',
      msg: 'cat: /etc/shadow: Permission denied',
      where: '普通用户读 root 专属文件（/etc/shadow、/var/log/secure、别人的家目录）',
      meaning: '文件**存在**，但内核在 VFS 层挡下了这次 open：当前进程的 uid/gid 不满足文件 mode 的读位（EACCES）。它排除了"文件不存在"（No such file or directory）。同样报 Permission denied 的还有另一类：路径上某一级目录缺 x（搜索）位 —— 那种情况卡在目录上，不在文件上。',
      causes: [
        '当前不是 root，而文件是 640 root:root（/etc/shadow 就是 000 或 640）',
        '路径中某一级目录缺 x 位，例如 /home/deploy 是 700，别人进不去',
        'SELinux 上下文不对：报错同样是 Permission denied，但 audit 日志里有 avc: denied',
        'sudo 放行了命令，但只放行了特定参数（sudoers 里写死了绝对路径）'
      ],
      diagnose: [
        'id',
        'ls -l /etc/shadow',
        'ls -ld /etc',
        'grep denied /var/log/audit/audit.log'
      ],
      fix: '确属运维需要就 `sudo cat /etc/shadow`；要长期可读，用 `sudo chown root:ops /path && sudo chmod 640 /path` 精确放权，不要 chmod 777，也不要为了省事把文件复制到 /tmp。',
      related: ['lu-chmod', 'lu-chown', 'lu-sudo', 'lu-getfacl', 'sec-ausearch'],
      tags: ['权限', 'EACCES']
    },
    {
      id: 'err-bash-permission-denied',
      cat: 'linux-basic',
      msg: 'bash: ./deploy.sh: Permission denied',
      where: '直接执行一个没有 x 位的脚本，或执行 noexec 分区上的程序',
      meaning: 'bash 找到了这个文件，但 execve(2) 被拒：要么文件本身没有可执行位，要么它所在的挂载点带了 noexec。它和 `command not found` 的关键区别是**文件确实存在**，所以别再去查 PATH 了。',
      causes: [
        '脚本没有 x 位（用编辑器新建或用 cp 从别处拷过来，默认是 644）',
        '文件系统挂载带了 noexec（/tmp、部分数据盘常见）',
        '文件所在目录缺 x 位，进不去自然也执行不了',
        'shebang 指向的解释器不存在（少数发行版下会报 bad interpreter）'
      ],
      diagnose: [
        'ls -l ./deploy.sh',
        'head -1 ./deploy.sh',
        'findmnt /tmp',
        'mount | grep noexec'
      ],
      fix: '`chmod +x ./deploy.sh` 后重跑。确认挂在 noexec 分区上就挪到 /usr/local/bin，或者显式交给解释器：`bash ./deploy.sh`。',
      related: ['lu-chmod', 'sh-echo', 'sh-set-euo-pipefail', 'ls9-mount'],
      tags: ['权限', '执行']
    },
    {
      id: 'err-rm-is-a-directory',
      cat: 'linux-basic',
      msg: "rm: cannot remove '/etc': Is a directory",
      where: 'rm 一个目录却没有带 -r',
      meaning: '内核的 unlink(2) 只能删文件，删目录必须用 rmdir(2)（且目录得是空的）或先递归清空。所以这句话的字面意思是"你给我的是目录，而我用的是删文件的系统调用"。它排除了"目录非空"（那是 rm -r 才涉及的问题）和"没权限"。',
      causes: [
        '只想删文件，却把目录名写了进去',
        '本来就该用 rm -r，或对空目录用 rmdir',
        '通配符展开把目录也带进来了，比如 rm /data/logs/*',
        '想删软链指向的目录，却在路径末尾多写了一个 /'
      ],
      diagnose: [
        'ls -ld /etc',
        'ls -la /etc',
        'stat /etc'
      ],
      fix: '空目录用 `rmdir /etc`；确认整个目录都不要了再 `rm -r /etc`。用通配符时先 `ls -d /data/logs/*` 把展开结果看一遍再回车。',
      related: ['lb-rm', 'lb-rmdir', 'lb-ls'],
      tags: ['文件', '目录']
    },
    {
      id: 'err-command-not-found',
      cat: 'linux-basic',
      msg: 'bash: supervisorctl: command not found',
      where: '敲了一个没装的命令，或 PATH 里没有这个可执行文件',
      meaning: 'bash 在 PATH 列出的每个目录里都没找到这个名字的可执行文件，于是自己造了这句话（不是内核报的），退出码固定为 127。它排除"命令存在但不能执行"（那是 Permission denied）。',
      causes: [
        '软件根本没装（supervisorctl 属于 supervisor 包）',
        '装了但不在 PATH 里（比如装在 /usr/local/bin 而 PATH 里没有它）',
        '命令名拼错，或用了别的发行版/初始化系统的命令名',
        '原本是别名或 shell 函数，换了用户、换了 shell 就没了'
      ],
      diagnose: [
        'which supervisorctl',
        'echo $PATH',
        'ls -l /usr/local/bin',
        'find / -maxdepth 4 -name "supervisorctl"'
      ],
      fix: '先 `which -a <命令>` 与 `echo $PATH` 判断是"没装"还是"没进 PATH"；没装就装上，装完执行 `hash -r` 清掉 bash 的命令路径缓存再试。',
      related: ['lb-which', 'lb-whereis', 'lb-type', 'lb-find'],
      tags: ['命令', 'PATH']
    },
    {
      id: 'err-mkdir-parent-missing',
      cat: 'linux-basic',
      msg: "mkdir: cannot create directory '/nope/a/b': No such file or directory",
      where: 'mkdir 多级目录，但中间层不存在，又没加 -p',
      meaning: 'mkdir(2) 只创建**最后一级**，父目录必须已经存在。所以这个报错指的是父目录 /nope/a 不存在，跟最后一级 b 无关。加上 -p 就会自动补齐中间层，且目录已存在时也不报错。',
      causes: [
        '少写了 -p',
        '上一级目录被误删，或路径本身就写错了',
        '脚本里没先 cd 到正确位置，相对路径落到了别处'
      ],
      diagnose: [
        'ls -ld /nope',
        'ls -ld /nope/a',
        'pwd'
      ],
      fix: '改成 `mkdir -p /nope/a/b`。脚本里更稳的写法是 `mkdir -p "$DIR" && cd "$DIR"`，避免后面所有相对路径都跟着跑偏。',
      related: ['lb-mkdir', 'lb-cd', 'sh-set-euo-pipefail'],
      tags: ['文件', '目录']
    },
    {
      id: 'err-text-file-busy',
      cat: 'linux-basic',
      msg: 'bash: ./a.out: Text file busy',
      where: '覆盖一个正在运行的可执行文件，然后再次运行它',
      meaning: 'ETXTBSY —— 内核拒绝以写方式打开一个"正在被执行的"文件。说明这个二进制此刻有进程在跑，所以覆盖动作（cp、编译输出、scp）被拒。它排除"文件被锁"：Linux 传统上并没有强制文件锁这一说，这个错误码是内核为可执行文件专门留的。',
      causes: [
        '服务还在跑就去覆盖它的二进制或 jar（cp / 编译输出直接写同名文件）',
        '上一次的进程没退干净，或后台还挂着一个实例',
        '用 scp / rsync 直接覆盖线上正在运行的程序文件',
        '容器里 PID 1 还活着就替换了镜像内的可执行文件'
      ],
      diagnose: [
        'ps -ef | grep a.out',
        'fuser -v ./a.out',
        'lsof ./a.out',
        'ls -l ./a.out'
      ],
      fix: '先停服务再覆盖：`systemctl stop myapp` → 拷新文件 → `systemctl start myapp`。更稳的做法是"写新文件名再 mv 覆盖"：mv 换的是目录项，不受 ETXTBSY 限制。',
      related: ['lb-cp', 'lb-rm', 'mo-lsof', 'ln-fuser'],
      tags: ['文件', '进程', 'ETXTBSY']
    },
    {
      id: 'err-argument-list-too-long',
      cat: 'linux-basic',
      msg: 'bash: /bin/rm: Argument list too long',
      where: '用 * 通配符操作一个装了几十万个文件的目录',
      meaning: 'E2BIG。报错的是 **bash 而不是 rm**：bash 要先把 `*` 展开成完整的文件名列表塞进 execve 的参数区，而内核给"参数 + 环境变量"设了总大小上限（ARG_MAX，通常约 2MB）。所以问题是展开后参数太多，不在 rm 本身。',
      causes: [
        '目录里文件数量到十万级，`*` 展开后超过 ARG_MAX',
        '脚本把一个大列表当参数传给命令，例如 cp $(find ...)',
        '单个参数本身超长（极长路径或超长环境变量占掉了额度）'
      ],
      diagnose: [
        'ls /data/logs | wc -l',
        'df -i /data',
        'du -sh /data/logs',
        'find /data/logs -type f | head -3'
      ],
      fix: '让内核分批执行，而不是一次性展开：`find /data/logs -type f -name "*.log" -delete`，或者 `ls | xargs -n 100 rm`。别写 `rm *`。',
      related: ['lb-xargs', 'lb-find', 'lb-rm', 'pf-file-max'],
      tags: ['文件', 'E2BIG', '通配符']
    },
    {
      id: 'err-too-many-open-files',
      cat: 'linux-basic',
      msg: 'cat: /var/log/messages: Too many open files',
      where: '进程的文件描述符用满时，任何要新开 fd 的命令都会报它',
      meaning: 'EMFILE —— 当前**进程**已经达到 RLIMIT_NOFILE 上限，内核拒绝再分配 fd。它排除"整机 fd 耗尽"：整机耗尽的表现是 dmesg 里出现 `VFS: file-max limit ... reached`，报错文本完全不同。',
      causes: [
        '应用有 fd 泄漏（打开不关，长跑几天后爆掉）',
        'systemd 服务没配 LimitNOFILE，沿用了默认的 1024',
        '并发连接数上来了，每个连接一个 fd，超出 ulimit -n',
        '日志被轮转后进程没重开文件，旧句柄一直挂着'
      ],
      diagnose: [
        'ls /proc/18442/fd | wc -l',
        'lsof -p 18442 | wc -l',
        'cat /proc/sys/fs/file-max',
        'lsof +L1'
      ],
      fix: '临时抬高只对当前 shell 有效（`ulimit -n 65535`）；服务要写进 unit 的 `LimitNOFILE=65535`，然后 `systemctl daemon-reload && systemctl restart myapp`。根因通常还是泄漏，用 `lsof -p <pid>` 反复看是哪类 fd 一直在涨。',
      related: ['pf-ulimit-n', 'pf-file-max', 'mo-lsof', 'ln-lsof'],
      tags: ['文件描述符', 'EMFILE']

    },
    /* ==================== 磁盘与存储 ==================== */
    {
      id: 'err-no-space-left-device',
      cat: 'linux-storage',
      msg: '2024-03-18 09:44:12.660 ERROR 1 --- [http-nio-8080-exec-6] c.e.o.FileLogAppender : No space left on device',
      where: '磁盘写满后，应用日志或内核日志里出现的那一行',
      meaning: 'ENOSPC —— 文件系统没有可用的**数据块**了。它排除"配额超限"（那是 Disk quota exceeded）和"只读挂载"（那是 Read-only file system）。特别注意：它和 inode 用尽报的是**同一句话**，必须用 `df -h` 与 `df -i` 两条一起看才能区分。',
      causes: [
        '日志没轮转，单文件涨到几十 G（/data/app/logs/app.log 最常见）',
        '文件被删了但进程还持有句柄，df 显示满而 du 算不出来（lsof +L1 能看到）',
        '镜像层与容器日志堆在 /var/lib/docker',
        '备份或临时文件写进了数据盘却没人清理'
      ],
      diagnose: [
        'df -h',
        'du -sh /data/* | sort -rh | head',
        'lsof +L1',
        'df -i'
      ],
      fix: '先定位再动手：`du -sh /data/* | sort -rh | head` 找到大户。清日志用 `truncate -s 0 <文件>` —— 如果进程还持有句柄，直接 rm 是**不会**释放空间的。长期靠 logrotate 配 maxsize 与保留份数。',
      related: ['ls9-df', 'ls9-du', 'ls9-ncdu', 'mo-log-logrotate', 'mo-log-disk-full'],
      tags: ['磁盘', 'ENOSPC', '日志']
    },
    {
      id: 'err-no-space-inode',
      cat: 'linux-storage',
      msg: "touch: cannot touch '/data/test/new': No space left on device",
      where: '磁盘还有容量、但 inode 用尽时创建文件',
      meaning: '和"磁盘写满"**报错文字一模一样**，但根因相反：这次耗尽的是 inode（索引节点），文件系统再也建不出新的目录项。判据只有一个组合：`df -h` 还有剩余空间，而 `df -i` 的 IUse% 已经 100%。',
      causes: [
        '目录里堆了海量小文件（session 文件、mail spool、缓存碎片）',
        '程序不停建临时文件且从不清理',
        '数据盘 inode 总数本来就少（默认每 16K 一个 inode，200G 也就一千多万个）',
        '小文件被反复创建删除，inode 长期处于高位'
      ],
      diagnose: [
        'df -i',
        'df -h',
        'find /data -type f | wc -l',
        'du -sh /data/*'
      ],
      fix: '找出小文件最多的目录（`for d in /data/*; do echo $(find $d | wc -l) $d; done`）后清理。架构上要减少小文件：session 挪进 Redis、日志合并成少数大文件。彻底解决只能重做文件系统并调大 inode 数量，那需要停机。',
      related: ['ls9-df', 'ls9-du', 'ls9-ncdu', 'ls9-fsck'],
      tags: ['磁盘', 'inode', 'ENOSPC']
    },
    {
      id: 'err-read-only-file-system',
      cat: 'linux-storage',
      msg: "touch: cannot touch '/sys/kernel/test': Read-only file system",
      where: '往只读挂载点写文件',
      meaning: 'EROFS —— 挂载时就带着 ro，或者文件系统因为出错被内核**自动重挂成只读**（ext4 元数据不一致时的自保动作）。第二种最危险：机器还活着、进程还在跑，但所有写入都失败，日志也会静默丢掉。',
      causes: [
        '挂载参数本来就是 ro（容器里的 /proc、/sys，或特意做成只读的备份盘）',
        'ext4 报错后自动 remount-ro，dmesg 里能查到 EXT4-fs error',
        '云盘掉线或链路异常后被以只读方式重新挂上',
        '挂载点被安全策略标成只读（SELinux 严格模式、容器只读根文件系统）'
      ],
      diagnose: [
        'mount | grep ro',
        'findmnt',
        'dmesg',
        'grep -i "read-only" /var/log/messages'
      ],
      fix: '先看 dmesg 有没有 EXT4-fs error：有就说明是内核自保只读，**先备份数据再 fsck**，别急着重启写盘。纯挂载参数问题就 `mount -o remount,rw /data`，并检查 /etc/fstab 里是不是写死了 ro。',
      related: ['ls9-mount', 'ls9-umount', 'ls9-fstab', 'ls9-fsck'],
      tags: ['磁盘', '只读', 'EROFS']
    },
    {
      id: 'err-blk-update-io-error',
      cat: 'linux-storage',
      msg: 'blk_update_request: I/O error, dev vdb, sector 184221184 op WRITE',
      where: '云盘或本地盘出现坏道、链路抖动时 dmesg 刷出来的行',
      meaning: '块层的 I/O 请求最终失败：dev 是设备名，sector 是物理扇区号，op 是读写方向。这是**硬件/虚拟化层**的问题，不是文件系统逻辑错。看到它就意味着这次写的数据可能真的没落盘。',
      causes: [
        '云盘到达性能上限被限流，或底层存储节点异常',
        '磁盘物理坏道（本地盘、老 SSD 最常见）',
        'virtio/SCSI 链路问题（热迁移、宿主机抖动）',
        '文件系统已经损坏，读到坏块后向上抛错'
      ],
      diagnose: [
        'dmesg',
        'smartctl -a /dev/vdb',
        'iostat -x 1 3',
        'lsblk'
      ],
      fix: '先把业务切走（有副本的先摘流量），用 `dmesg` 与 `smartctl -a` 判断是链路还是坏道；云盘提工单换盘，本地盘换硬件。恢复后跑一次 `fsck` 再挂回，别在报 I/O error 的盘上继续写。',
      related: ['ls9-smartctl', 'ls9-iostat', 'ls9-fsck', 'ls9-mdadm'],
      tags: ['磁盘', 'IO', '硬件']
    },
    {
      id: 'err-ext4-end-bio-io-error',
      cat: 'linux-storage',
      msg: 'EXT4-fs warning (device vdb1): ext4_end_bio:344: I/O error 10 writing to inode 8842133 (offset 418418688 size 4096 starting block 5284184)',
      where: 'ext4 写盘失败时，dmesg 里的文件系统层记录',
      meaning: 'ext4 把一次写交给块层之后收到了错误，并报出**具体 inode 与文件内偏移**。它比 blk_update_request 更进一步：能定位到是哪个文件的哪 4K 没写成功，是判断"哪些数据可能丢了"的直接依据。',
      causes: [
        '底层设备 I/O 失败（同一时刻 dmesg 里通常还有 blk_update_request）',
        '文件系统元数据损坏，需要停机 fsck',
        '云盘掉线后以只读/异常状态挂回',
        'fstab 里的 nofail 掩盖了挂载失败，实际写在一个已经出问题的设备上'
      ],
      diagnose: [
        'dmesg',
        'findmnt /data',
        'df -h /data',
        'smartctl -a /dev/vdb'
      ],
      fix: '确认业务可容忍的丢失窗口后：`umount /data` → `fsck -y /dev/vdb1` → 校验业务数据完整性 → 再挂回。同时把这块盘的底层问题解决掉（换盘/换云盘），否则 fsck 完还会复发。',
      related: ['ls9-fsck', 'ls9-mount', 'ls9-smartctl', 'ls9-iostat'],
      tags: ['磁盘', 'ext4', 'IO']
    },
    {
      id: 'err-mount-wrong-fs-type',
      cat: 'linux-storage',
      msg: 'mount: /data: wrong fs type, bad option, bad superblock on /dev/vdb1, missing codepage or helper program, or other error.',
      where: 'mount 一块设备时（fstab 写错、盘没格式化、盘上不是这个文件系统）',
      meaning: 'mount 把能想到的原因一次列全了，因为它自己也不知道是哪一个：类型不对、参数不对、超级块损坏、缺 helper。真正的线索在紧接着的那一行内核消息里（`dmesg | tail` 会给出 can not read superblock 之类的具体原因）。',
      causes: [
        '设备还没格式化（新挂上来的云盘 EVS 是裸设备）',
        'fstab 里的文件系统类型写错，比如把 xfs 写成了 ext4',
        '挂载点目录不存在，或设备名写错（/dev/vdb1 写成了 /dev/vdb）',
        '文件系统超级块损坏，需要 fsck 修复'
      ],
      diagnose: [
        'lsblk -f',
        'blkid /dev/vdb1',
        'file -s /dev/vdb1',
        'dmesg'
      ],
      fix: '先 `lsblk -f` 与 `blkid` 确认设备上到底是什么：空的就 `mkfs.ext4 /dev/vdb1`（**会清空数据**）；有数据但类型不符就把 fstab 的类型改对，再 `mount -a` 验证。',
      related: ['ls9-mount', 'ls9-fstab', 'ls9-blkid', 'ls9-lsblk', 'ls9-mkfs-ext4'],
      tags: ['磁盘', '挂载']

    },
    /* ==================== 用户 / 系统管理 ==================== */
    {
      id: 'err-vfs-file-max-reached',
      cat: 'linux-user',
      msg: 'VFS: file-max limit 2097152 reached',
      where: '整机文件描述符耗尽时内核打印的行',
      meaning: '这是**内核全局**的 fs.file-max 到顶了，和单个进程的 `Too many open files`（EMFILE）不是一回事：这里是整台机器所有进程加起来的 fd 总数超限，新连接会被直接拒绝，表现为服务大面积不可用而不是单个命令失败。',
      causes: [
        '某个进程 fd 泄漏，把全局额度吃光',
        '高并发短连接场景，fd 需求本来就超过默认 fs.file-max',
        '机器上服务数量增长后没同步调大内核参数',
        'TIME_WAIT 大量堆积（通常还伴随 ip_local_port_range 用尽）'
      ],
      diagnose: [
        'cat /proc/sys/fs/file-max',
        'lsof +L1',
        'ss -s',
        'free -m'
      ],
      fix: '临时 `sysctl -w fs.file-max=4194304`；永久写进 /etc/sysctl.d/99-file-max.conf 后 `sysctl -p`。但 fs.file-max 只是天花板，真正要治的是泄漏源：结合 `lsof +L1` 与 `ss -s` 找出一直在涨的进程。',
      related: ['pf-file-max', 'pf-ulimit-n', 'ln-lsof', 'ln-ss'],
      tags: ['内核', '文件描述符', '调优']
    },
    {
      id: 'err-systemd-unit-not-found',
      cat: 'linux-user',
      msg: 'Unit nope.service could not be found.',
      where: 'systemctl status / restart / start 一个不存在的 unit',
      meaning: 'systemd 在它所有的 unit 搜索路径里都没找到这个名字。它只说"没有这个服务"，与权限无关。另外注意 unit 名不带路径：即使文件在 /etc/systemd/system/foo.service，命令里也只写 `foo`。',
      causes: [
        '服务名拼错（nginx 写成了 ngnix）',
        '软件装了但没带 systemd unit（不是所有程序都提供）',
        'unit 文件新建后没执行 `systemctl daemon-reload`，systemd 还不知道它',
        'unit 放在 systemd 不搜索的目录里'
      ],
      diagnose: [
        'systemctl status nope',
        'systemctl list-unit-files',
        'ls -l /etc/systemd/system',
        'find / -maxdepth 4 -name "*.service"'
      ],
      fix: '用 `systemctl list-unit-files | grep <关键字>` 找真实名字；自己写的 unit 放到 /etc/systemd/system/ 之后必须 `systemctl daemon-reload` 才会被识别。',
      related: ['lu-systemctl', 'lu-systemctl-list', 'lu-systemctl-daemon-reload', 'lu-systemd-unit'],
      tags: ['systemd', '服务']
    },
    {
      id: 'err-systemd-job-failed',
      cat: 'linux-user',
      msg: 'Job for nginx.service failed because the control process exited with error code.',
      where: 'systemctl start / restart 一个能启动但立刻退出的服务',
      meaning: '这句话只说明"启动动作失败了"，**原因一个字都没给**。systemd 随手给了两条线索命令：`systemctl status` 看退出码与状态，`journalctl -xe` 看进程死前说了什么。它和 `could not be found` 的区别是：unit 存在，只是起不来。',
      causes: [
        '配置语法错，进程刚起来就退出（nginx 配置写错最典型）',
        '端口被占用，bind 失败',
        '工作目录或日志目录不存在、没有写权限',
        'unit 里 ExecStart 的可执行文件路径写错'
      ],
      diagnose: [
        'systemctl status nginx',
        'journalctl -u nginx -n 50',
        'nginx -t',
        'ss -tulnp | grep 80'
      ],
      fix: '按 systemd 的提示走：`systemctl status nginx.service` 看 Active 与退出码，`journalctl -u nginx -n 50 --no-pager` 看最后几十行 —— 应用自己的报错一定在那里。改完先验证（如 `nginx -t`）再 restart。',
      related: ['lu-systemctl', 'lu-journalctl', 'mw-nginx-test', 'lu-systemd-unit'],
      tags: ['systemd', '服务', '启动失败']
    },
    {
      id: 'err-sudo-password-required',
      cat: 'linux-user',
      msg: 'sudo: a password is required',
      where: '非交互环境（脚本、CI、Ansible、ssh 远程命令）里执行 sudo',
      meaning: 'sudo 需要密码，但当前没有终端可以输入（stdin 不是 tty），于是直接失败。它排除"密码错"（那是 Sorry, try again）和"不在 sudoers 里"（那是 xxx is not in the sudoers file）。',
      causes: [
        'cron / CI / Ansible 里用了需要密码的 sudo，却没有分配 tty',
        '想用 NOPASSWD 但 sudoers 里没配',
        'ssh 执行远程命令时用了 sudo 而没加 -t',
        'sudo 的时间戳票据过期，而当前会话拿不到密码输入'
      ],
      diagnose: [
        'id',
        'grep -v "^#" /etc/sudoers',
        'ls -l /etc/sudoers',
        'env'
      ],
      fix: '交互场景给 ssh 加 `-t` 分配终端；自动化场景用 `visudo` 精确放行：`deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp`，只写需要的那几条命令，不要写 ALL。',
      related: ['lu-sudo', 'lu-visudo', 'lu-su', 'ln-ssh'],
      tags: ['权限', 'sudo', '自动化']

    },
    /* ==================== 网络与排障 ==================== */
    {
      id: 'err-connection-refused',
      cat: 'linux-net',
      msg: 'curl: (7) Failed to connect to 10.0.2.15 port 3306: Connection refused',
      where: 'curl / nc / telnet 连数据库或后端端口时',
      meaning: 'TCP 层收到了 RST —— 包**到了对端**，但对端没有程序在监听这个端口。它排除了"防火墙丢包"（那会表现为 timed out，curl 退出码 28）、"域名解析失败"（那是 Could not resolve host，退出码 6）和"网络不可达"（Network is unreachable）。所以这条报错其实是个好消息：链路是通的。',
      causes: [
        '服务没起来，或刚崩了（systemctl status 显示 inactive / failed）',
        '服务只监听了 127.0.0.1，容器外、别的机器连不上',
        '监听端口和配置里写的不是同一个（改了配置没重启）',
        '服务正在启动中，端口还没 bind 完'
      ],
      diagnose: [
        'ss -tulnp | grep 3306',
        'nc -zv 10.0.2.15 3306',
        'curl -v http://10.0.2.15:3306',
        'netstat -tulnp'
      ],
      fix: '到对端机器上 `ss -tulnp | grep 3306`：没有输出就是服务没起（查 `systemctl status` 与 journalctl）；输出是 127.0.0.1:3306 就把配置里的 bind-address 改成 0.0.0.0（或具体网卡 IP）后重启。',
      related: ['ln-troubleshoot-connect-refused', 'ln-ss', 'ln-curl', 'ln-nc', 'ln-troubleshoot-port'],
      tags: ['网络', '端口', 'ECONNREFUSED']
    },
    {
      id: 'err-nc-connection-refused',
      cat: 'linux-net',
      msg: 'nc: connect to 10.0.1.23 port 9999 (tcp) failed: Connection refused',
      where: 'nc / telnet 探测一个没有服务的端口',
      meaning: '和 curl 那条是同一个内核错误（ECONNREFUSED），只是 nc 的措辞：`connect to <主机> port <端口> (tcp) failed`。这句话同时确认了三件事：名字/IP 可达、目标主机在线、该端口没人监听 —— 探测端口时它是效率最高的一条命令。',
      causes: [
        '目标端口本来就没服务（端口号写错）',
        '服务只跑在别的节点上，而负载均衡/Service 把流量导到了没有实例的那台',
        '服务崩了还没被拉起来',
        'IPv4/IPv6 不一致：nc 走了 v6，而服务只监听了 v4'
      ],
      diagnose: [
        'nc -zv 10.0.1.23 9999',
        'nc -zv 10.0.1.23 80',
        'ss -tulnp',
        'telnet 10.0.1.23 9999'
      ],
      fix: '先在目标机上 `ss -tulnp` 列出真实监听，再核对调用方写死的端口；K8s 场景顺带看 `kubectl get endpoints` 是不是空的 —— Endpoints 为空时流量根本没处可转。',
      related: ['ln-nc', 'ln-telnet', 'ln-ss', 'ln-netstat'],
      tags: ['网络', '端口']
    },
    {
      id: 'err-connection-timed-out',
      cat: 'linux-net',
      msg: 'nc: connect to 10.0.2.15 port 3306 (tcp) failed: Connection timed out',
      where: '探测一个被安全组或防火墙丢包的端口',
      meaning: 'SYN 发出去了但**没有任何回应**，一路重传到超时。它和 Connection refused 是镜像关系：refused 说明对方回了 RST（有响应、没服务）；timed out 说明对方**根本没回**。典型原因就是包被 DROP 了 —— DROP 不回 RST，所以表现成超时而不是拒绝。',
      causes: [
        '云安全组没放行该端口（华为云场景最常见）',
        '主机层 iptables / firewalld 里是 DROP 而不是 REJECT',
        '目标 IP 不可路由或路由黑洞（回程路径缺失）',
        '服务在但 listen backlog 打满，SYN 被丢弃'
      ],
      diagnose: [
        'nc -zv 10.0.2.15 3306',
        'telnet 10.0.2.15 3306',
        'ping 10.0.2.15',
        'ip route'
      ],
      fix: '按"云安全组 → 主机防火墙 → 服务监听"三层依次放通：控制台给 ECS 的安全组加入方向 3306，主机上 `firewall-cmd --add-port=3306/tcp --permanent && firewall-cmd --reload`，最后确认服务监听的是 0.0.0.0 而不是 127.0.0.1。',
      related: ['ln-troubleshoot-port', 'ln-telnet', 'ln-nc', 'hw-vpc-troubleshoot-port', 'ln-troubleshoot-firewall'],
      tags: ['网络', '防火墙', '安全组']
    },
    {
      id: 'err-curl-operation-timed-out',
      cat: 'linux-net',
      msg: 'curl: (28) Operation timed out after 5000 milliseconds with 0 bytes received',
      where: 'curl -m / --max-time 到点还没拿到响应',
      meaning: '连接**建立成功了**（否则是 (7)），但整个请求在 --max-time 内一个字节都没收到。退出码 28 是超时专用码。它排除了 DNS 问题（(6)）和端口不通（(7)），把矛头指向"服务端处理太慢或卡死"。',
      causes: [
        '后端处理慢：慢 SQL、锁等待、调下游被拖住',
        '应用线程池或连接池打满，请求在排队没人处理',
        '中间走了代理，代理把请求挂住了',
        '--max-time 设得比接口真实耗时还短（拉报表、全量导出本来就慢）'
      ],
      diagnose: [
        'curl -m 6 http://127.0.0.1:8080/api/orders/8812',
        'curl -m 5 -o /dev/null -s -w "%{time_total}\\n" http://127.0.0.1:8080/api/orders/8812',
        'tail -20 /data/app/logs/app.log',
        'ss -tunap'
      ],
      fix: '先用 `-w "%{time_connect} %{time_starttransfer} %{time_total}"` 分段看是连接慢还是首字节慢；首字节慢就去应用日志找慢查询（本机场景就是 `query timeout after 5000ms`），再决定加索引、扩线程池还是单独调大这个接口的超时。',
      related: ['ln-curl-timing', 'ln-curl', 'ln-troubleshoot-slow', 'db-mysql-slowlog'],
      tags: ['网络', '超时', 'curl']
    },
    {
      id: 'err-could-not-resolve-host',
      cat: 'linux-net',
      msg: 'curl: (6) Could not resolve host: nope.invalid',
      where: 'curl / wget 访问一个解析不了的主机名',
      meaning: 'curl 的退出码 6 = 名字解析失败，**连接还没开始**。它排除了端口问题（(7)）和超时（(28)）。判据很干脆：能 ping 通 IP 却访问不了域名，基本就是这一条。',
      causes: [
        '域名拼错，或该域名确实不存在（NXDOMAIN）',
        '/etc/resolv.conf 里的 nameserver 不可达',
        '容器内 DNS 没配好（resolv.conf 指向了已失效的地址）',
        '内网域名没配 search 域，也没写进 /etc/hosts'
      ],
      diagnose: [
        'cat /etc/resolv.conf',
        'nslookup nope.invalid',
        'dig nope.invalid',
        'cat /etc/hosts'
      ],
      fix: '先 `dig <域名> @<nameserver>` 判断是"域名本身不存在"还是"解析器不可用"；临时救急可写 /etc/hosts（改完立刻生效），长期要修 resolv.conf 或云上的内网 DNS 解析记录。',
      related: ['ln-troubleshoot-dns', 'ln-dig', 'ln-nslookup', 'ln-resolv-conf', 'ln-hosts-file'],
      tags: ['网络', 'DNS']
    },
    {
      id: 'err-name-or-service-not-known',
      cat: 'linux-net',
      msg: 'nc: getaddrinfo for host "nope.example.com" failed: Name or service not known',
      where: 'nc / telnet / ssh / redis-cli 解析主机名失败时',
      meaning: 'glibc 的 getaddrinfo(3) 返回了 EAI_NONAME，程序把它翻译成 "Name or service not known"。含义和 curl 的 Could not resolve host 完全一样，只是**换了库、换了措辞**。看到这句就把 DNS 当第一嫌疑，别再查端口了。',
      causes: [
        '主机名写错，或该名字在 DNS 里不存在',
        '/etc/resolv.conf 配置错误，或 nameserver 不通',
        '只在某台机器的 /etc/hosts 里映射过，换台机器就没了',
        '在容器里查一个只存在于 K8s 的名字，但不在同一个 namespace'
      ],
      diagnose: [
        'nslookup nope.example.com',
        'dig nope.example.com',
        'cat /etc/resolv.conf',
        'cat /etc/hosts'
      ],
      fix: '用 `getent hosts <名字>` 验证 —— 它走和应用程序同一套 nsswitch，最能代表程序看到的答案。内网名字缺失就补 DNS 记录或 /etc/hosts；K8s 里则核对 Service 名与 namespace。',
      related: ['ln-nslookup', 'ln-dig', 'ln-resolv-conf', 'ln-troubleshoot-dns'],
      tags: ['网络', 'DNS', 'getaddrinfo']
    },
    {
      id: 'err-destination-host-unreachable',
      cat: 'linux-net',
      msg: 'From 10.0.1.23 icmp_seq=1 Destination Host Unreachable',
      where: 'ping 一个同网段但不存在的 IP',
      meaning: '这不是超时，而是**中间设备主动回了 ICMP 不可达**。From 后面那个 10.0.1.23 就是你自己的地址：说明本机发 ARP 问"谁是这个 IP"没人应答，或者路由表里找不到能到它的下一跳。它排除"对端在线但关了端口"（那种情况 ping 会通，只有端口报 refused）。',
      causes: [
        '目标 IP 在本网段里根本不存在（打错 IP，或机器已下线）',
        '目标是别的网段，但路由表里既没有对应路由也没有默认网关',
        '对端云主机被关机/删除，交换机上已经没有它的 ARP 表项',
        '同网段但子网掩码或 VLAN 配错，实际不在同一个二层域'
      ],
      diagnose: [
        'ping 10.0.2.15',
        'ip addr',
        'ip route',
        'ip neigh'
      ],
      fix: '先 `ip route` 确认有没有到目标网段的路由；同网段就 `ip neigh` 看 ARP 有没有解析出来。云上还要检查 ECS 是否关机、安全组是否放通 ICMP —— 很多安全组默认不允许 ping。',
      related: ['ln-ping', 'ln-ip-route', 'ln-ip-neigh', 'ln-ip-addr', 'ln-troubleshoot-port'],
      tags: ['网络', 'ICMP', '路由']
    },
    {
      id: 'err-nxdomain',
      cat: 'linux-net',
      msg: "** server can't find nope.invalid: NXDOMAIN",
      where: 'nslookup 查一个不存在的域名',
      meaning: 'NXDOMAIN 是 DNS 的**权威回答**："这个域名不存在"，而不是"我查不到"。它排除了"DNS 服务器不可达"（那会报 connection timed out; no servers could be reached）和"域名存在但没有 A 记录"（那是 NODATA / No answer）。分清这两者很重要：前者要修域名，后者要修记录类型。',
      causes: [
        '域名拼错，或该域名确实没注册、没配置解析',
        '内网域名没在云解析服务里加记录',
        '查的是内部名字（比如 K8s 的 Service 名），却去问了公网 DNS',
        '域名刚添加，解析记录还在生效中（TTL 未过）'
      ],
      diagnose: [
        'nslookup nope.invalid',
        'dig nope.invalid',
        'dig nope.invalid @100.125.1.250',
        'cat /etc/resolv.conf'
      ],
      fix: '换一个 DNS 对比结论（`dig <域名> @114.114.114.114`），或用 `dig <域名> +trace` 看是哪一级没有记录。内网名字要去云解析服务里补 A 记录，别指望公网 DNS 认识它。',
      related: ['ln-nslookup', 'ln-dig', 'ln-host', 'ln-troubleshoot-dns'],
      tags: ['网络', 'DNS', 'NXDOMAIN']
    },
    {
      id: 'err-network-is-unreachable',
      cat: 'linux-net',
      msg: 'ping: connect: Network is unreachable',
      where: '本机没有到目标网段的路由时',
      meaning: 'ENETUNREACH —— 内核在**选路阶段**就放弃了：路由表里没有任何一条能匹配目标，包根本没发出去。它排除"包发出去了但没回来"（那是 Destination Host Unreachable 或超时），也排除端口问题。',
      causes: [
        '默认网关丢了（云主机网卡没起来、DHCP 没拿到地址）',
        '路由表被误删，或策略路由把流量导到了不存在的表',
        '网卡 down 了，直连路由随之全部消失',
        '只配了 IPv6 却要访问 IPv4 地址（或反过来）'
      ],
      diagnose: [
        'ip route',
        'ip addr',
        'ip link',
        'ping 10.0.2.15'
      ],
      fix: '`ip route` 看有没有 `default via ...`：没有就补默认路由（或用 nmcli 重连网卡）；同时 `ip link` 确认网卡状态是 UP。云主机还要确认子网、安全组没被改动。',
      related: ['ln-ip-route', 'ln-ip-addr', 'ln-ip-link', 'ln-nmcli'],
      tags: ['网络', '路由', 'ENETUNREACH']
    },
    {
      id: 'err-connection-reset-by-peer',
      cat: 'linux-net',
      msg: 'curl: (56) Recv failure: Connection reset by peer',
      where: '连接中途被对端 RST 掉（不是一开始就被拒）',
      meaning: 'ECONNRESET —— TCP 连接**已经建立**，但在收发数据的过程中对端发了 RST。它排除了"端口没人听"（那在最开始就会 refused）和"超时"（28）：说明对端进程是在通话中途消失的，或者中间设备主动切断了这条连接。',
      causes: [
        '后端进程崩溃或被 OOM 杀掉，已建立的连接被内核 RST',
        '服务端 keepalive 超时清掉了空闲连接，而客户端还在复用旧连接',
        '中间防火墙/负载均衡的空闲超时比客户端短，静默切断了长连接',
        '服务端滚动发布，旧实例的连接全部断开'
      ],
      diagnose: [
        'curl -v http://10.0.1.31:8080/health',
        'ss -tunap',
        'dmesg',
        'journalctl -u nginx -n 50'
      ],
      fix: '抓服务端日志确认当时是否重启或被 OOM（`journalctl -u <服务>` 与 `dmesg` 里搜 oom）；客户端侧要加**重试 + 连接池健康检查**，别复用已被对端关掉的连接，并让客户端 keepalive 小于中间设备的空闲超时。',
      related: ['ln-curl', 'ln-tcpdump', 'ln-ss', 'mo-dmesg'],
      tags: ['网络', 'TCP', 'ECONNRESET']
    },
    {
      id: 'err-address-already-in-use',
      cat: 'linux-net',
      msg: 'nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)',
      where: '服务启动时端口已被别的进程占用',
      meaning: 'EADDRINUSE —— bind(2) 失败：这个 (地址, 端口) 组合已经被另一个 socket 占着，且没开 SO_REUSEPORT。[emerg] 是 nginx 的最高日志级别，意味着**启动直接中止**，配置里后面的内容统统不会生效。',
      causes: [
        '同一个服务起了两份（旧进程没停干净，或 supervisor 与 systemd 各拉了一个）',
        '端口被别的程序占了（80 被 httpd 或另一份 nginx 占用）',
        '之前用 docker -p 把宿主端口映射走了',
        '只监听了具体 IP 而客户端连的是另一个地址（少见，但报错相同）'
      ],
      diagnose: [
        'ss -tulnp | grep 80',
        'lsof -i :80',
        'netstat -tulnp',
        'ps -ef | grep nginx'
      ],
      fix: '`ss -tulnp | grep :80` 拿到 PID 后判断该停谁（`systemctl stop <旧服务>` 或 `kill <pid>`）；两个服务确实都要监听 80，就把其中一个改端口，或前面加一层反向代理统一入口。',
      related: ['ln-ss', 'ln-lsof', 'ln-netstat', 'ln-ss-kill', 'mw-nginx-test'],
      tags: ['网络', '端口', 'EADDRINUSE']
    },
    /* ==================== Docker ==================== */
    {
      id: 'err-docker-daemon-unreachable',
      cat: 'docker',
      msg: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
      where: 'dockerd 没起来或没权限时，任何 docker 命令',
      meaning: 'docker 客户端连不上 dockerd 的 Unix socket。这句话只说明**客户端到 daemon 这一段断了**，跟容器、镜像本身毫无关系。它排除"命令写错"（那会报 unknown command）和"镜像不存在"（那也要先连上 daemon 才会知道）。',
      causes: [
        'dockerd 没启动或已经崩了',
        '当前用户不在 docker 组，读不了 /var/run/docker.sock',
        'DOCKER_HOST 环境变量指向了不存在的地址',
        '磁盘写满导致 dockerd 自己退出（先看 df -h）'
      ],
      diagnose: [
        'systemctl status docker',
        'docker info',
        'ls -l /var/run/docker.sock',
        'id'
      ],
      fix: '`systemctl status docker` 看状态：没起就 `systemctl start docker && systemctl enable docker`；起来了却报权限错，就把用户加进 docker 组（`usermod -aG docker <用户>`）后重新登录。生产上不要用 `chmod 777 docker.sock` 图省事。',
      related: ['dk-info', 'dk-daemon-json', 'dk-troubleshoot-restart', 'lu-systemctl'],
      tags: ['Docker', 'daemon']
    },
    {
      id: 'err-docker-pull-access-denied',
      cat: 'docker',
      msg: "Error response from daemon: pull access denied for private.registry/x/y, repository does not exist or may require 'docker login'",
      where: 'docker pull 拉私有仓库，或镜像名写错时',
      meaning: 'registry 明确拒绝了这个拉取请求。措辞很诚实：它自己也分不清是"仓库不存在"还是"你没登录"，因为这两种情况在 registry 侧返回的都是 401/403。它排除"网络不通"（那会是 timeout 或 no such host）。',
      causes: [
        '没 `docker login` 就拉私有仓库',
        '镜像名或组织名写错（少写仓库域名就会被当成 Docker Hub 的官方镜像）',
        '账号通过了认证，但没有这个仓库的拉取权限',
        '凭证过期（SWR 的临时登录指令只有 24 小时）'
      ],
      diagnose: [
        'docker info',
        'docker images',
        'hcloud configure list',
        'docker pull nginx:1.25'
      ],
      fix: '先确认镜像全名（华为云 SWR 要写全 `swr.<region>.myhuaweicloud.com/<组织>/<镜像>:<标签>`），再用临时登录指令 `docker login -u <区域项目名>@<AK> swr.cn-north-4.myhuaweicloud.com` 登录；拉公网镜像失败则检查 /etc/docker/daemon.json 里的 registry-mirrors。',
      related: ['dk-pull', 'dk-tag', 'dk-push', 'dk-daemon-json', 'hw-hcloud-config-list'],
      tags: ['Docker', '镜像', '认证']
    },
    {
      id: 'err-docker-push-denied',
      cat: 'docker',
      msg: 'denied: requested access to the resource is denied',
      where: 'docker push 到没有写权限的仓库',
      meaning: 'registry 的鉴权失败只回这一句：**你要推的仓库路径和当前账号的权限对不上**。最常见的其实不是密码错（那会报 unauthorized: authentication required），而是镜像名里没带 registry 域名，于是 docker 把镜像推到了 Docker Hub 上你名下的同名仓库。',
      causes: [
        '镜像没重新 tag 成带 registry 域名的全名，被推去了 Docker Hub',
        '登录的账号不是该组织/命名空间的成员',
        '组织名或镜像名拼错，路径不在你的权限范围内',
        'SWR 的临时登录指令已过期'
      ],
      diagnose: [
        'docker images',
        'docker tag web:1.2.3 swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3',
        'hcloud configure list',
        'docker info'
      ],
      fix: '推送前先改标签：`docker tag web:1.2.3 swr.cn-north-4.myhuaweicloud.com/<组织>/web:1.2.3`，再 push 全名。检查方法很简单 —— 看镜像名的第一段是不是 registry 域名，不是就一定会推错地方。',
      related: ['dk-push', 'dk-tag', 'dk-images', 'hw-hcloud-config-list'],
      tags: ['Docker', '镜像', '推送']
    },
    {
      id: 'err-docker-no-such-container',
      cat: 'docker',
      msg: 'Error response from daemon: No such container: nope',
      where: 'docker logs / exec / stop / start 一个不存在的容器',
      meaning: 'daemon 按你给的名字或 ID 在本地容器表里查不到。它排除"容器存在但已退出"——`docker logs` 对已退出的容器照样能看日志，只有 `docker start` 才会因为状态不对另报错误。',
      causes: [
        '容器名打错，或把镜像名当成了容器名',
        '容器已被删（docker rm 之后对象就没了）',
        '容器在另一台机器/另一个环境上，本地根本没跑过',
        '用 --rm 起的容器退出后自动被删除'
      ],
      diagnose: [
        'docker ps -a',
        'docker ps',
        'docker inspect nope',
        'docker images'
      ],
      fix: '`docker ps -a` 会列出所有容器（含已退出的），用它核对真实名字。容器已经被删就只能重建，重建前先确认数据在 volume 里而不是容器可写层里。',
      related: ['dk-ps', 'dk-logs', 'dk-exec', 'dk-rm', 'dk-inspect'],
      tags: ['Docker', '容器']
    },
    {
      id: 'err-docker-port-already-allocated',
      cat: 'docker',
      msg: 'Error response from daemon: driver failed programming external connectivity on endpoint web (c9f2a71b3d05): Bind for 0.0.0.0:8080 failed: port is already allocated',
      where: 'docker run -p 时宿主端口已被别的容器占用',
      meaning: 'docker 的默认 bridge 网络自己维护端口映射（写 iptables DNAT 规则），这一步失败了。注意它和宿主机进程占端口的报错**不同**：宿主机自己的服务占用会报 `bind: address already in use`，而这一句说明端口的占用者同样是 docker 管理的容器。',
      causes: [
        '同一个宿主端口被别的容器映射了（两个 -p 8080:... 撞车）',
        '旧容器没删干净，docker ps -a 里还在',
        'compose 文件里两个服务写了同一个宿主端口',
        '容器停了但映射规则还在（少见，重启 dockerd 可清）'
      ],
      diagnose: [
        'docker ps -a',
        'docker port web',
        'docker compose ps',
        'ss -tulnp | grep 8080'
      ],
      fix: '用 `docker ps -a` 或 `docker port <名字>` 找出占了该宿主端口的容器，停掉它或改映射（`-p 18080:80`）。多个服务要共存时，优先让它们加入同一个 docker network 用容器名互访，根本不映射宿主端口。',
      related: ['dk-run', 'dk-ps', 'dk-network-modes', 'dk-compose-up', 'ln-ss'],
      tags: ['Docker', '端口', '端口映射']
    },
    {
      id: 'err-docker-overlay2-no-space',
      cat: 'docker',
      msg: 'failed to register layer: write /var/lib/docker/overlay2/8f3c1a72/diff/usr/lib/x86_64-linux-gnu/libc.so.6: no space left on device',
      where: 'docker pull / build 写镜像层写到一半磁盘满了',
      meaning: '错在**解压并注册镜像层**这一步：overlay2 存储驱动要把层内容写进 /var/lib/docker，写到中途 ENOSPC。报错给出了具体文件路径，说明前面的层都成功了，是中途写满的 —— 所以空间需求比"看一眼剩余量"更微妙，得留出解压峰值。',
      causes: [
        '/var/lib/docker 所在分区被镜像层与容器日志堆满',
        '容器 json-file 日志没配 max-size，单个日志涨到几十 G',
        'build cache 与悬空镜像长期没清理',
        'inode 用尽（df -h 还有空间时尤其要接着看 df -i）'
      ],
      diagnose: [
        'df -h',
        'docker system df',
        'du -sh /var/lib/docker/*',
        'docker system prune'
      ],
      fix: '先 `docker system df` 分清是镜像、容器还是 build cache 占的，再 `docker system prune -a` 清理（**会删掉所有未被使用的镜像**，生产上先确认没有依赖）。随后给 daemon.json 加 `"log-opts": {"max-size":"100m","max-file":"3"}` 并重启 docker，防止复发。',
      related: ['dk-df', 'dk-system-prune', 'dk-prune-image', 'dk-container-logs-size', 'ls9-df'],
      tags: ['Docker', '磁盘', 'overlay2']
    },
    {
      id: 'err-exec-format-error',
      cat: 'docker',
      msg: 'exec /usr/local/bin/app: exec format error',
      where: '容器启动或 kubectl exec 时，可执行文件的架构不匹配',
      meaning: 'ENOEXEC —— 内核认得这是可执行文件，但它的格式和当前 CPU 架构对不上，或者脚本的 shebang 是坏的。最典型的场景：在 x86 笔记本上 build 出 amd64 镜像，部署到 ARM 鲲鹏节点（或反过来）。',
      causes: [
        '镜像架构与节点架构不一致（x86 镜像跑在鲲鹏 ARM 节点上）',
        '基础镜像里那个二进制是为别的平台编译的',
        '脚本第一行 shebang 写错，或文件是 CRLF 换行导致解释器路径带了 \\r',
        '手动 COPY 进来的二进制架构不对，或忘了带执行位'
      ],
      diagnose: [
        'uname -m',
        'docker inspect web',
        'docker images',
        'file /usr/local/bin/app'
      ],
      fix: '构建时显式指定目标平台：`docker buildx build --platform linux/arm64 -t <镜像> .`；要多架构就 `--platform linux/amd64,linux/arm64` 并推送 manifest list。先 `uname -m` 确认节点架构，再决定 build 参数。',
      related: ['dk-buildx', 'dk-build', 'dk-inspect', 'ci-docker-buildx'],
      tags: ['Docker', '镜像', '架构']
    },
    {
      id: 'err-docker-oci-runtime-create',
      cat: 'docker',
      msg: 'docker: Error response from daemon: OCI runtime create failed: container_linux.go:367: starting container process caused: exec: "sh": executable file not found in $PATH: unknown',
      where: 'docker run 一个 ENTRYPOINT / CMD 指向不存在程序的镜像',
      meaning: '镜像拉下来了、容器文件系统也建好了，倒在**最后一步：执行入口程序**。OCI runtime（runc）在镜像的 PATH 里找不到要执行的命令。它排除"镜像拉取失败"（那会更早报 pull 相关错误），也排除"守护进程连不上"。',
      causes: [
        'Dockerfile 的 ENTRYPOINT / CMD 命令名或路径写错',
        '用了 scratch / distroless 基础镜像，里面连 sh 都没有',
        'CMD 与 ENTRYPOINT 组合后参数被吞，实际执行的命令不是你想的那个',
        '写的是宿主机的绝对路径，镜像里并不存在'
      ],
      diagnose: [
        'docker inspect web',
        'docker history nginx:1.25',
        'docker images',
        'docker ps -a'
      ],
      fix: '用 `docker inspect <镜像>` 看 Config.Entrypoint 与 Config.Cmd 合并后的真实命令；改 Dockerfile 用镜像里确实存在的解释器（alpine 用 /bin/sh，不要写 /bin/bash），或把缺的二进制打进镜像。',
      related: ['dk-run', 'dk-dockerfile', 'dk-inspect', 'dk-history'],
      tags: ['Docker', '容器', 'OCI']
    },
    {
      id: 'err-docker-manifest-unknown',
      cat: 'docker',
      msg: 'Error response from daemon: manifest for nginx:1.99 not found: manifest unknown: manifest unknown',
      where: 'docker pull 一个 tag 不存在的镜像',
      meaning: '仓库连上了、认证也过了，但 registry 里没有这个 **tag** 对应的 manifest。它和 pull access denied 的区别很关键：那句是权限或仓库不存在，这句是**仓库存在、标签不存在**。所以只要镜像名是对的，剩下的可能就只有标签写错。',
      causes: [
        '标签号写错，或该标签已被删除（1.99 这种不存在的版本）',
        '私有仓库里仓库名对，但确实没推过这个 tag',
        '多架构 manifest list 里缺当前架构（措辞类似，但会提到 no matching manifest）',
        '镜像在别的 region 或别的组织下，名字少写了一段'
      ],
      diagnose: [
        'docker images',
        'docker history nginx:1.25',
        'docker pull nginx:1.25',
        'docker info'
      ],
      fix: '去仓库页面（华为云 SWR 控制台）核对确切 tag，本地已有的镜像用 `docker images` 看真实标签。拉取时把名字写全：`swr.<region>.myhuaweicloud.com/<组织>/<镜像>:<标签>`。',
      related: ['dk-pull', 'dk-images', 'dk-tag', 'dk-history'],
      tags: ['Docker', '镜像', 'tag']

    },
    /* ==================== Kubernetes ==================== */
    {
      id: 'err-k8s-crashloopbackoff',
      cat: 'kubernetes',
      msg: 'Back-off restarting failed container worker in pod worker-6b8f7c9d4-m2vqt_my-app',
      where: 'kubectl describe pod 的 Events 里；同时 Pod 的 STATUS 列显示 CrashLoopBackOff',
      meaning: 'CrashLoopBackOff 拆开看：容器**启动过、又退出了**，kubelet 按指数退避（10s→20s→40s……最长 5 分钟）反复重启它。这条 Back-off 只说"我在退避重试"这个事实，**真正的原因在容器自己的日志里**，事件一个字都没提。它排除"镜像拉不下来"（那是 ImagePullBackOff）和"调度不上"（那是 Pending）。',
      causes: [
        '应用一启动就报错退出（配置错、连不上数据库或 Redis）',
        '启动命令或参数错，或者依赖的 init 容器没跑通',
        '健康检查配得太严，应用还没起来就被 liveness 杀掉',
        '内存超 limit 被 OOMKilled 后反复重启（此时 State 会显示 OOMKilled）'
      ],
      diagnose: [
        'kubectl logs worker-6b8f7c9d4-m2vqt --previous',
        'kubectl describe pod worker-6b8f7c9d4-m2vqt',
        'kubectl logs worker-6b8f7c9d4-m2vqt',
        'kubectl get events'
      ],
      fix: '关键动作是 `kubectl logs <pod> --previous` —— 拿**崩溃前那一次**的日志，当前实例可能刚起来还没输出。拿到栈后对症改：连接串错就改 ConfigMap/Secret，探针太严就调 initialDelaySeconds，OOM 就抬 limits。',
      related: ['k8s-troubleshoot-crashloop', 'k8s-troubleshoot-pod', 'k8s-logs', 'k8s-describe', 'k8s-pod-status-conditions'],
      tags: ['Kubernetes', 'Pod', 'CrashLoopBackOff']
    },
    {
      id: 'err-k8s-imagepullbackoff',
      cat: 'kubernetes',
      msg: 'rpc error: code = NotFound desc = failed to resolve reference "swr.cn-north-4.myhuaweicloud.com/myorg/worker:v1.2.4": not found',
      where: 'kubectl describe pod 的 Events 里；Pod 状态是 ImagePullBackOff',
      meaning: 'kubelet 拉镜像失败，`NotFound` 这一层已经回答了"为什么"：**仓库里没有这个镜像或标签**。ImagePullBackOff 只是结果状态（拉失败后进入退避重试），rpc error 后面那半句才是原因。',
      causes: [
        'tag 写错，或这个版本还没推上去（最常见）',
        '镜像名里的组织或仓库名拼错',
        '推到了别的 region 的 SWR，而节点配置的是本 region 的仓库',
        '私有仓库没配凭证时，registry 对匿名请求可能回 NotFound 而不是 401'
      ],
      diagnose: [
        'kubectl describe pod worker-6b8f7c9d4-m2vqt',
        'kubectl get events',
        'kubectl get secret -n my-app',
        'kubectl get pods -A'
      ],
      fix: '先 `kubectl describe pod` 读 Events 里 rpc error 的原文，再核对镜像全名与标签；名字确认无误后仍失败，就检查 Deployment 的 imagePullSecrets，以及 default ServiceAccount 上有没有挂 SWR 凭证。',
      related: ['k8s-troubleshoot-imagepull', 'k8s-describe', 'k8s-get-events', 'k8s-secret', 'k8s-jsonpath'],
      tags: ['Kubernetes', '镜像', 'ImagePullBackOff']
    },
    {
      id: 'err-k8s-errimagepull',
      cat: 'kubernetes',
      msg: 'Failed to pull image "private.registry/myorg/app:v1": rpc error: code = Unknown desc = failed to authorize: failed to fetch anonymous token: unexpected status: 401 Unauthorized',
      where: 'Pod 先出现 ErrImagePull（首次拉取失败），随后变成 ImagePullBackOff',
      meaning: 'ErrImagePull 和 ImagePullBackOff 是**同一个故障的两个阶段**：ErrImagePull 是第一次拉取失败的瞬时状态，kubelet 开始退避重试后就显示 ImagePullBackOff。这里的 401 Unauthorized 明确指向**认证**，而不是"镜像不存在"。',
      causes: [
        '私有仓库没配 imagePullSecrets',
        'Secret 类型不对（必须是 kubernetes.io/dockerconfigjson）',
        'Secret 建在了别的 namespace，Pod 引用不到',
        '凭证过期（SWR 临时登录指令 24 小时有效）'
      ],
      diagnose: [
        'kubectl get secret -n my-app',
        'kubectl describe pod worker-6b8f7c9d4-m2vqt',
        'kubectl get sa default -n my-app',
        'kubectl get pods -A'
      ],
      fix: '用 `kubectl create secret docker-registry swr-secret --docker-server=swr.cn-north-4.myhuaweicloud.com --docker-username=<区域项目名>@<AK> --docker-password=<临时登录指令> -n my-app` 建 Secret，然后在 Deployment 的 spec.imagePullSecrets 里引用，或直接挂到 default ServiceAccount 上。',
      related: ['k8s-troubleshoot-imagepull', 'k8s-create-secret-generic', 'k8s-secret', 'k8s-describe', 'k8s-sa-token'],
      tags: ['Kubernetes', '镜像', 'ErrImagePull', '认证']
    },
    {
      id: 'err-k8s-failedscheduling-cpu',
      cat: 'kubernetes',
      msg: '0/3 nodes are available: 2 Insufficient cpu.',
      where: 'kubectl get events 或 describe pod 里的 FailedScheduling 事件',
      meaning: '调度器把所有节点都试了一遍（0/3 表示 3 个节点里一个都没成），失败原因是 CPU 的 requests 装不下。关键是 **requests 而不是实际使用率**：节点上 CPU 可能很闲，但已经被其他 Pod 的 requests 预订满了。',
      causes: [
        'Pod 的 resources.requests.cpu 写太大，节点剩余可分配量不够',
        '节点上已有 Pod 的 requests 把额度占满（实际用量低但预订高）',
        '节点被 cordon / drain 掉了，可用节点变少',
        '副本数扩太多，集群整体容量不足'
      ],
      diagnose: [
        'kubectl get events',
        'kubectl describe pod batch-job-28471920-x7klm',
        'kubectl top node',
        'kubectl describe node node-1'
      ],
      fix: '先 `kubectl describe node <节点>` 看 Allocated resources 那一栏的 Requests 占比；把 Pod 的 requests 调到与真实用量相符，或加节点/开弹性扩容。别为了让 Pod 调度上去就把 requests 写成 0 —— 那会让节点超卖。',
      related: ['k8s-troubleshoot-pending', 'k8s-get-events', 'k8s-top-node-sort', 'k8s-affinity-toleration', 'k8s-hpa'],
      tags: ['Kubernetes', '调度', 'Pending']
    },
    {
      id: 'err-k8s-failedscheduling-taint',
      cat: 'kubernetes',
      msg: '0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu.',
      where: 'FailedScheduling 事件里同时列出多个不同的失败原因',
      meaning: '这是调度器给的**逐节点报告**：逗号后面每一条对应一类被拒的节点。这里 1 个节点因为控制面污点不能放（Pod 没配 toleration），另外 2 个是 CPU 不够。读它的方法就是把它当成"我试过的每个节点 + 各自被拒的理由"。',
      causes: [
        '业务 Pod 没写 tolerations，而节点带了污点（控制面节点、GPU 节点常见）',
        '节点刚被打上专用污点，旧 Deployment 没同步加 toleration',
        '节点 NotReady，调度器也会以污点形式拒绝',
        '剩下的节点资源确实不够'
      ],
      diagnose: [
        'kubectl describe pod batch-job-28471920-x7klm',
        'kubectl describe node node-1',
        'kubectl get nodes',
        'kubectl get pods -o wide'
      ],
      fix: '按污点的键值在 Pod 上补 tolerations（`kubectl describe node` 的 Taints 一行给出 key=value:effect）；但控制面节点默认不该跑业务 Pod —— 容量不足应该扩节点，而不是把污点去掉。',
      related: ['k8s-taint', 'k8s-affinity-toleration', 'k8s-troubleshoot-pending', 'k8s-get-nodes', 'k8s-cordon'],
      tags: ['Kubernetes', '调度', '污点']
    },
    {
      id: 'err-k8s-pvc-provisioning-failed',
      cat: 'kubernetes',
      msg: 'failed to provision volume with StorageClass "csi-nas": no available NAS mount point',
      where: 'kubectl describe pvc 的 Events 里，PVC 一直 Pending',
      meaning: '动态存储供给失败 —— 这不是"没找到 PV"，而是**供给器去创建 PV 时建不出来**。所以排查方向在 StorageClass 背后的存储服务（这里是 NAS），不在 PV/PVC 的绑定关系上。它排除"PVC 没匹配到已有 PV"（那会报 no persistent volumes available for this claim）。',
      causes: [
        '存储后端容量或配额不足、没有可用的挂载点',
        'StorageClass 的 provisioner 没部署或没就绪',
        '存储类参数写错（NAS 的共享路径、磁盘类型不存在）',
        '跨可用区：PVC 的 AZ 与存储池对不上'
      ],
      diagnose: [
        'kubectl get pvc',
        'kubectl describe pvc logs-pvc',
        'kubectl get sc',
        'kubectl get events'
      ],
      fix: '读 PVC 的 Events 里供给器给的原话，再去云控制台确认对应存储服务（EVS/NAS/OBS）的配额与可用区。PV 卡在 Pending 时 Pod 也会一直 Pending —— 这就是"未绑定 PV"这一类 Pending 的典型链路。',
      related: ['k8s-pvc-pv', 'k8s-storageclass', 'k8s-troubleshoot-pending', 'k8s-get-events', 'hw-evs-create'],
      tags: ['Kubernetes', '存储', 'PVC', 'Pending']
    },
    {
      id: 'err-k8s-readiness-probe-refused',
      cat: 'kubernetes',
      msg: 'Readiness probe failed: Get "http://172.20.1.22:8081/healthz": dial tcp 172.20.1.22:8081: connect: connection refused',
      where: 'kubectl describe pod 的 Events 里出现 Unhealthy',
      meaning: 'kubelet 从**节点上**去访问 Pod IP 的健康检查端口，被 refused 了 —— 端口上没有进程监听。它排除"探针路径返回 500"（那是 probe failed with statuscode 500）和"探针超时"（那是 timeout）。所以问题不在应用逻辑，而在应用压根没监听那个端口或地址。',
      causes: [
        '应用监听的端口与探针配的端口不一致（配置里 8080，探针写 8081）',
        '应用还在启动中，端口没 bind（initialDelaySeconds 太小）',
        '应用只监听了 127.0.0.1，Pod IP 上连不上',
        '容器已经崩了，探针自然连不上'
      ],
      diagnose: [
        'kubectl describe pod worker-6b8f7c9d4-m2vqt',
        'kubectl logs worker-6b8f7c9d4-m2vqt',
        'kubectl get events',
        'kubectl exec web-7d9c4b8f5-2xk9p -- env'
      ],
      fix: '三处端口必须一致：容器实际监听端口、Service 的 targetPort、探针的 port。给探针留足启动时间（initialDelaySeconds / failureThreshold），并把 readiness 指向真正轻量的端点 —— 别用会查库的 /health。',
      related: ['k8s-troubleshoot-pod', 'k8s-describe', 'k8s-logs', 'k8s-troubleshoot-svc', 'k8s-pod-status-conditions'],
      tags: ['Kubernetes', '探针', '就绪']
    },
    {
      id: 'err-k8s-forbidden-rbac',
      cat: 'kubernetes',
      msg: 'Error from server (Forbidden): pods is forbidden: User "system:serviceaccount:my-app:default" cannot list resource "pods" in API group "" in the namespace "my-app"',
      where: 'kubectl 报 Forbidden（注意不是 Unauthorized）',
      meaning: 'apiserver **认出了你是谁**（这里是一个 ServiceAccount），但 RBAC 判定你没这个权限。它和 401 Unauthorized 的区别很关键：401 是身份没通过（kubeconfig、证书、token 有问题），403 是身份没问题、授权不够。这句话还精确给出了缺的动作（list）、资源（pods）和命名空间。',
      causes: [
        'ServiceAccount 没绑定任何 Role/ClusterRole（缺 RoleBinding）',
        'Role 里的 verbs 或 resources 没包含这个操作（只给了 get 没给 list）',
        'RoleBinding 建在了别的 namespace，作用不到当前 namespace',
        '操作的是集群级资源（nodes、pv），却只绑了 namespace 级的 Role'
      ],
      diagnose: [
        'kubectl auth can-i list pods -n my-app',
        'kubectl get sa default -n my-app',
        'kubectl auth can-i get pods -n my-app',
        'kubectl get pods -A'
      ],
      fix: '按报错里缺的动作和资源补授权：建一个只含所需 verbs 的 Role，再用 RoleBinding 绑到对应 ServiceAccount；集群级资源必须用 ClusterRole + ClusterRoleBinding。别图快直接绑 cluster-admin。',
      related: ['k8s-auth-can-i', 'k8s-rbac-role', 'k8s-rbac-clusterrole', 'k8s-auth-whoami', 'k8s-auth-reconcile'],
      tags: ['Kubernetes', 'RBAC', '权限']
    },
    {
      id: 'err-k8s-exec-not-found-path',
      cat: 'kubernetes',
      msg: 'OCI runtime exec failed: exec failed: unable to start container process: exec: "curl": executable file not found in $PATH: unknown',
      where: 'kubectl exec 进容器跑一个里面没装的命令（docker exec 同理）',
      meaning: 'exec 已经进了容器，但要在里面执行的那个程序找不到。注意这是**容器内**的 PATH，和宿主机上有没有 curl 毫无关系。这也是"精简镜像必须自带排障工具"的直接原因 —— distroless、alpine 里往往没有 curl、ping、netstat。',
      causes: [
        '镜像里根本没装这个命令（distroless / alpine 精简镜像最常见）',
        '命令在非标准路径，且不在容器的 PATH 里',
        'shell 形式与 exec 形式的差别没搞清（-- cmd 与 -- sh -c "cmd"）',
        '容器已经退出或处于 CrashLoop，exec 到的不是你以为的那个实例'
      ],
      diagnose: [
        'kubectl exec web-7d9c4b8f5-2xk9p -- env',
        'kubectl exec web-7d9c4b8f5-2xk9p -- ls /var/run/secrets/kubernetes.io/serviceaccount/',
        'kubectl debug node/10.0.1.24 -it --image=busybox',
        'kubectl get pods -n my-app'
      ],
      fix: '先 `kubectl exec <pod> -- env` 看容器的 PATH、`-- ls /usr/bin` 看有什么可用；没有就换用镜像里已有的工具，或用 `kubectl debug` 起一个带工具集的临时容器，共享目标容器的网络命名空间来排障。',
      related: ['k8s-exec', 'k8s-debug', 'k8s-debug-copy-to', 'dk-exec', 'k8s-troubleshoot-pod'],
      tags: ['Kubernetes', 'exec', '排障']
    },
    {
      id: 'err-k8s-oomkilled',
      cat: 'kubernetes',
      msg: 'Reason: OOMKilled',
      where: 'kubectl describe pod 里容器 State / Last State 的 Reason 字段',
      meaning: '容器被内核 OOM killer 杀掉了：它的内存占用超过 cgroup 限制（Pod 的 resources.limits.memory），cgroup 内存控制器直接 SIGKILL。**退出码是 137**（128+9）。它和 CrashLoopBackOff 常常同时出现 —— 反复 OOM 就会退避重启成 CrashLoopBackOff。',
      causes: [
        'limits.memory 设得比应用真实峰值小',
        '应用堆没按容器限制配（JVM 仍用默认 MaxHeapSize，撑爆 cgroup）',
        '内存泄漏，跑几天才涨上来',
        '同一 Pod 的 sidecar 一起吃内存，加起来超限'
      ],
      diagnose: [
        'kubectl describe pod worker-6b8f7c9d4-m2vqt',
        'kubectl top pods',
        'kubectl get events',
        'free -m'
      ],
      fix: '把 limits.memory 抬到真实峰值之上，并让应用感知容器限制：JVM 用 `-XX:MaxRAMPercentage=70`（别写死 -Xmx），Node/Python 也要看各自的堆参数。同时把 requests 调到接近实际用量，调度器才能正确摆放。',
      related: ['k8s-pod-status-conditions', 'k8s-describe', 'k8s-top', 'mo-jvm-jmap', 'pf-gc-log'],
      tags: ['Kubernetes', '内存', 'OOMKilled']
    },
    {
      id: 'err-k8s-evicted',
      cat: 'kubernetes',
      msg: 'The node was low on resource: ephemeral-storage.',
      where: 'kubectl describe pod 里 Status: Failed、Reason: Evicted',
      meaning: 'kubelet 主动驱逐：节点上的**临时存储**（ephemeral-storage，即容器可写层 + 日志 + emptyDir）低于驱逐阈值，kubelet 挑了这个 Pod 杀掉腾空间。它不是 OOM，也不是应用崩，而是**节点在保命**。被驱逐的裸 Pod 不会自己回来。',
      causes: [
        '容器日志没限制大小，把节点磁盘写满（json-file 没配 max-size）',
        'emptyDir 或容器可写层写了大量临时数据',
        '镜像层堆积，节点 imagefs 占用过高',
        '节点系统盘本来就小，还跑了几个大镜像的 Pod'
      ],
      diagnose: [
        'kubectl describe node node-1',
        'kubectl get events',
        'kubectl get pods -o wide',
        'df -h'
      ],
      fix: '治本三件事：给容器日志加上限（kubelet 的 containerLogMaxSize，或把日志采集到远端）、emptyDir 设 sizeLimit、清掉节点上的无用镜像并给系统盘扩容。Evicted 的 Pod 要重建 —— Deployment 会自动拉新副本，裸 Pod 得手工重建。',
      related: ['k8s-pod-status-conditions', 'k8s-describe', 'k8s-get-events', 'k8s-drain', 'mo-log-disk-full'],
      tags: ['Kubernetes', '驱逐', 'Evicted']
    },
    {
      id: 'err-k8s-failedmount',
      cat: 'kubernetes',
      msg: 'MountVolume.SetUp failed for volume "pvc-2b1c9d4e-71a3-4f88" : rpc error: code = Internal desc = mount failed: exit status 32',
      where: 'kubectl describe pod 的 Events 里，Pod 卡在 ContainerCreating',
      meaning: 'kubelet 调 CSI 插件挂载卷失败，exit status 32 是 mount(8) 的失败码。注意事件里的卷名是 **PV 名字**（pvc-<uuid>），不是你在 YAML 里写的 PVC 名 —— 要对应起来得去查 PVC 的 volumeName 字段。',
      causes: [
        'PVC 还没 Bound（卷本身没准备好，自然挂不上）',
        '卷被别的节点挂走了（RWO 卷跨节点挂载冲突）',
        '节点上没有对应的 CSI 驱动，或驱动没就绪',
        '卷所在可用区与节点可用区不一致'
      ],
      diagnose: [
        'kubectl describe pod worker-6b8f7c9d4-m2vqt',
        'kubectl get pvc',
        'kubectl get pv',
        'kubectl get events'
      ],
      fix: '按顺序捋：PVC 是否 Bound → PV 的 StorageClass 与节点 AZ 是否匹配 → 节点上 CSI 插件 Pod 是否 Running。RWO 卷要保证同一时刻只挂在一个节点上，有状态服务别随手扩副本。',
      related: ['k8s-pvc-pv', 'k8s-troubleshoot-pod', 'k8s-get-events', 'k8s-storageclass', 'k8s-debug'],
      tags: ['Kubernetes', '存储', '挂载', 'FailedMount']
    },
    {
      id: 'err-k8s-no-endpoints',
      cat: 'kubernetes',
      msg: 'Error: no endpoints available for service "order-service"',
      where: 'Ingress Controller / kube-proxy / port-forward 往 Service 转发时',
      meaning: 'Service 后面的 Endpoints 列表是**空的**。Service 本身只是一组 iptables/IPVS 规则，真正接流量的是 Endpoints 里的 Pod IP —— 空的就没人可转。它排除"Pod 没起来"：Pod 可能好好地 Running，只是没被选中或者没 Ready。',
      causes: [
        'Service 的 selector 和 Pod 的 labels 对不上（最常见）',
        'Pod 起来了但 readiness 探针没过，不会被放进 Endpoints',
        'Service 与 Pod 不在同一个 namespace',
        'targetPort 写错：Endpoints 里有地址，但流量转到错端口'
      ],
      diagnose: [
        'kubectl get endpoints',
        'kubectl describe svc mysql',
        'kubectl get pods -n my-app',
        'kubectl get events'
      ],
      fix: '`kubectl get endpoints <svc> -n <ns>` 先确认是不是空；是空就对比 `kubectl describe svc` 里的 Selector 与 `kubectl get pods --show-labels` 的标签，再确认 Pod 的 READY 是不是 1/1。',
      related: ['k8s-troubleshoot-svc', 'k8s-service', 'k8s-endpointslices', 'k8s-describe', 'k8s-get'],
      tags: ['Kubernetes', 'Service', 'Endpoints']
    },
    {
      id: 'err-k8s-dns-nxdomain',
      cat: 'kubernetes',
      msg: "** server can't find cache-prod-01: NXDOMAIN",
      where: 'kubectl exec 进 Pod 里 nslookup 一个 Service 名',
      meaning: '从**集群内部**看，这个名字在 CoreDNS 里不存在。它排除了"网络不通"（包到了 CoreDNS，对方也应答了）和"Pod 没起来"。K8s 里 Service 的完整域名是 `<service>.<namespace>.svc.cluster.local`，跨 namespace 必须带 namespace。',
      causes: [
        'Service 名或 namespace 写错（只有同 namespace 才能省掉后缀）',
        'Service 还没创建',
        'Pod 的 dnsPolicy 被改成 None 或 Default，而没配 nameserver',
        'CoreDNS 组件本身异常（此时所有名字都解析不了）'
      ],
      diagnose: [
        'kubectl exec web-7d9c4b8f5-2xk9p -- nslookup cache-prod-01',
        'kubectl get svc',
        'kubectl exec web-7d9c4b8f5-2xk9p -- cat /etc/resolv.conf',
        'kubectl get pods -A'
      ],
      fix: '先用完整域名试：`nslookup <service>.<namespace>.svc.cluster.local`。通了就是短名或 namespace 的问题；整个集群都解析不了，就查 kube-system 里 CoreDNS 的 Pod 与 Service 是否正常。',
      related: ['k8s-exec-dns', 'k8s-service', 'k8s-troubleshoot-svc', 'k8s-endpointslices', 'k8s-troubleshoot-pod'],
      tags: ['Kubernetes', 'DNS', 'CoreDNS']

    },
    /* ==================== Helm ==================== */
    {
      id: 'err-helm-release-not-found',
      cat: 'helm',
      msg: 'Error: release: not found',
      where: 'helm status / upgrade / rollback / uninstall 一个不存在的 release',
      meaning: 'helm 在目标 namespace 的 Secret 里找不到这个名字的 release 记录（helm 3 把 release 状态存成 Secret）。注意 release 名和 chart 名是两回事，而且 helm 的作用域是 **namespace**：加了 -n 换个命名空间就查不到了。',
      causes: [
        'release 名写错，或者把 chart 名当成了 release 名',
        '没带 -n，查的是默认 namespace，而 release 装在别的 namespace',
        'release 已经被 uninstall 掉了',
        'KUBECONFIG 指向了另一个集群'
      ],
      diagnose: [
        'helm list',
        'helm status nope',
        'helm history nope',
        'kubectl get ns'
      ],
      fix: '先 `helm list` 确认 release 的真实名字与 namespace，再带上 `-n <ns>` 重试；`helm history <release> -n <ns>` 能看到它的版本记录与回滚点（前提是 release 存在）。',
      related: ['hl-list', 'hl-status', 'hl-history', 'hl-rollback', 'hl-uninstall'],
      tags: ['Helm', 'release']
    },
    /* ==================== Nginx / 中间件 ==================== */
    {
      id: 'err-nginx-emerg-open-failed',
      cat: 'middleware',
      msg: 'nginx: [emerg] open() "/nope/nginx.conf" failed (2: No such file or directory)',
      where: 'nginx -t / -c / reload 时指定的配置文件不存在',
      meaning: '[emerg] 是最高级别，配置加载阶段就中止。**注意老 worker 还在用旧配置对外服务**，所以服务不会立刻挂 —— 这也是它容易被忽略的原因。括号里的 2 是 errno（ENOENT）。',
      causes: [
        '-c 给的路径写错，或文件被删、被改名',
        '用了相对路径，而 nginx 的工作目录由 systemd 决定，不是你以为的那个',
        '主配置里 include 的子文件不存在（目录被清空了）',
        '配置在容器里挂载错了路径，宿主机的路径在容器内不存在'
      ],
      diagnose: [
        'nginx -t',
        'ls -l /etc/nginx/',
        'ls -l /etc/nginx/conf.d/',
        'cat /etc/nginx/nginx.conf'
      ],
      fix: '改配置前先 `nginx -t` 验证，通过再 `nginx -s reload`。reload 失败时线上仍在用旧配置跑 —— 此时修配置比重启更安全，别直接 restart（restart 会真的停服务）。',
      related: ['mw-nginx-test', 'mw-nginx-dump', 'mw-nginx-signal', 'mw-nginx-location'],
      tags: ['Nginx', '配置']
    },
    {
      id: 'err-nginx-invalid-option',
      cat: 'middleware',
      msg: 'nginx: invalid option: "nope"',
      where: 'nginx -s <信号> 传了不支持的信号名',
      meaning: 'nginx 只认四个信号：stop、quit、reload、reopen。-s 后面的字符串会被严格比对，除此之外一律这句。它排除"配置文件有问题"（那时会报 [emerg] 加具体原因），也排除"nginx 没装"（那是 command not found）。',
      causes: [
        '信号名拼错，或把 systemctl 的动作名（restart）当成了 nginx 信号',
        '脚本里变量为空，命令退化成了 nginx -s ""',
        '多写了参数（如 nginx -s reload all）',
        '想重载配置却写成了 nginx -s reload=1 之类'
      ],
      diagnose: [
        'nginx -v',
        'nginx -t',
        'systemctl status nginx',
        'journalctl -u nginx -n 20'
      ],
      fix: '重载配置用 `nginx -s reload` 或 `systemctl reload nginx`（注意不是 restart）；确认信号名只有 stop / quit / reload / reopen 四个。',
      related: ['mw-nginx-signal', 'mw-nginx-test', 'mw-nginx-version', 'lu-systemctl'],
      tags: ['Nginx', '信号']
    },
    {
      id: 'err-nginx-upstream-timed-out',
      cat: 'middleware',
      msg: 'upstream timed out (110: Connection timed out) while reading response header from upstream',
      where: '/var/log/nginx/error.log 里，客户端拿到 504 时',
      meaning: 'nginx 已经把请求转给后端了，但**等响应头**等到超过 proxy_read_timeout（默认 60s），于是放弃并给客户端 504。110 是 ETIMEDOUT。它排除"连不上后端"（那是 connect() failed）—— 连接建立过，是后端处理太慢。',
      causes: [
        '后端真的有慢请求：慢 SQL、锁等待、调外部接口被拖住',
        '后端线程池或连接池打满，请求在排队没人处理',
        'proxy_read_timeout 设得比业务真实耗时短',
        '后端在做 Full GC 或正在重启，短暂无响应'
      ],
      diagnose: [
        'tail -30 /var/log/nginx/error.log',
        'curl -m 6 http://127.0.0.1:8080/api/orders/8812',
        'tail -20 /data/app/logs/app.log',
        'cat /etc/nginx/nginx.conf'
      ],
      fix: '拿 error.log 里的 upstream 地址去查**那台后端**的应用日志，找慢在哪一步；确属业务长耗时（导出、报表）就把该 location 的 proxy_read_timeout 单独调大，别全局放宽把问题盖住。',
      related: ['mw-nginx-502-504-499', 'mw-nginx-log', 'mw-nginx-upstream', 'mw-nginx-proxy-pass', 'mo-log-var-log'],
      tags: ['Nginx', '504', '超时']
    },
    {
      id: 'err-nginx-upstream-connect-refused',
      cat: 'middleware',
      msg: 'connect() failed (111: Connection refused) while connecting to upstream',
      where: '/var/log/nginx/error.log 里，客户端拿到 502 时',
      meaning: '111 是 ECONNREFUSED：nginx 去连 upstream 的地址端口，被 RST 了。它和 upstream timed out 的区分点是**卡在哪一步** —— 这句卡在"连接"阶段（后端端口没人听），那句卡在"读响应"阶段（连上了但没回）。所以经验规则是：502 通常意味着后端没了，504 通常意味着后端慢。',
      causes: [
        '后端服务挂了，或端口没起来',
        'upstream 里写的 IP/端口已过期（后端换机、改端口）',
        '后端只监听了 127.0.0.1，而 nginx 从别的机器或别的容器过来连',
        '后端在滚动发布，所有实例同时下线'
      ],
      diagnose: [
        'tail -30 /var/log/nginx/error.log',
        'cat /etc/nginx/nginx.conf',
        'ss -tulnp | grep 8080',
        'curl -v http://10.0.1.31:8080/health'
      ],
      fix: '拿 error.log 里 `upstream: "http://10.0.1.31:8080/..."` 的地址直接 curl 一次：refused 就是后端没起；起来了就核对 upstream 配置里的 IP 列表与真实节点是否一致，长期应改成域名或服务发现。',
      related: ['mw-nginx-502-504-499', 'mw-nginx-upstream', 'mw-nginx-log', 'ln-ss', 'mw-nginx-proxy-pass'],
      tags: ['Nginx', '502', 'upstream']
    },
    {
      id: 'err-nginx-worker-connections',
      cat: 'middleware',
      msg: '2024/03/18 09:41:18 [alert] 1842#0: 1024 worker_connections are not enough',
      where: 'QPS 上来之后 error.log 里刷出的 [alert] 行',
      meaning: 'alert 级别（比 error 更高）：单个 worker 进程能同时打开的连接数到了 worker_connections 上限，新连接直接被丢，客户端表现为卡住或 502。注意这是**并发连接数**上限，不是 QPS 上限 —— 每个长连接都占一个额度。',
      causes: [
        '并发连接数确实超过配置（worker_connections 默认 512 或 1024，太小）',
        '上游 keepalive 没配，每个请求都新建连接，连接数被放大',
        'worker_processes 太少，单进程扛下了全部连接',
        '慢客户端长期占着连接不放（read timeout 太长）'
      ],
      diagnose: [
        'nginx -T',
        'cat /etc/nginx/nginx.conf',
        'ss -s',
        'ps -ef | grep nginx'
      ],
      fix: 'events 块里把 `worker_connections` 调到 10240 以上并设 `worker_processes auto`；再给 upstream 配 `keepalive 32` 加 `proxy_http_version 1.1` 与 `Connection ""` 复用连接。改完 `nginx -t && nginx -s reload`。',
      related: ['mw-nginx-limit', 'mw-nginx-upstream', 'mw-nginx-test', 'pf-somaxconn', 'pf-ulimit-n'],
      tags: ['Nginx', '并发', '连接数']
    },
    {
      id: 'err-nginx-unknown-directive',
      cat: 'middleware',
      msg: 'nginx: [emerg] unknown directive "proxy_passs" in /etc/nginx/nginx.conf:42',
      where: 'nginx -t 时配置里出现了不存在的指令名',
      meaning: '配置解析器在指定文件的第 42 行读到一个它不认识的指令，直接 [emerg] 中止。这是**纯语法错**，与运行状态无关。它排除"指令位置放错"（那种报的是 xxx directive is not allowed here），也排除"参数不对"（那是 invalid parameter）。',
      causes: [
        '指令名拼写错误（proxy_passs、server_nmae 这类手滑）',
        '该指令属于第三方模块，而这个 nginx 没编译进该模块',
        '配置块层级放错（把 http 段指令写进了 server 段也会报 unknown 或 not allowed here）',
        '从 Apache / Caddy 抄配置时把它们的指令也搬了过来'
      ],
      diagnose: [
        'nginx -t',
        'nginx -T',
        'cat /etc/nginx/nginx.conf',
        'nginx -V'
      ],
      fix: '按报错给的文件名与行号直接改那一行，改完必须 `nginx -t` 通过再 reload。如果 include 了子文件，报错里给的也是子文件的路径与行号，别去主配置里瞎找。',
      related: ['mw-nginx-test', 'mw-nginx-dump', 'mw-nginx-version', 'mw-nginx-location'],
      tags: ['Nginx', '配置', '语法']

    },
    /* ==================== MySQL / Redis ==================== */
    {
      id: 'err-mysql-access-denied-remote',
      cat: 'db-cache',
      msg: "ERROR 1045 (28000): Access denied for user 'root'@'10.0.1.23' (using password: YES)",
      where: 'mysql -h <远程主机> 连不上时',
      meaning: '@ 后面是**服务端看到的客户端地址**，不是用户名的一部分。(using password: YES) 表示你确实带了密码 —— 所以别去怀疑"是不是密码没输进去"。(28000) 是 SQLSTATE，表示授权失败。它排除"网络不通"（那会是 ERROR 2003 或 2005，属于客户端错误）。',
      causes: [
        '密码错，或者用了 -p 却没在提示符下真正输入',
        '这个**来源 IP** 没有授权：MySQL 账号是 user@host 两条一起匹配的',
        '账号只授权了 root@localhost，从别的机器来不认',
        '认证插件不匹配（服务端 caching_sha2_password，客户端太老）'
      ],
      diagnose: [
        'mysql -h db-prod-01 -uroot -pwrong -e "SHOW DATABASES"',
        'mysql -uroot -p -e "SHOW DATABASES"',
        'mysql -uroot -p -e "SELECT user,host FROM mysql.user"',
        'ss -tulnp | grep 3306'
      ],
      fix: '用能连上的账号进去 `SELECT user,host FROM mysql.user;` 看清有哪些来源；缺来源就按网段补建账号并授权（host 写 10.0.1.% 这种），最后 FLUSH PRIVILEGES。纯密码错就 ALTER USER 重置，别去改 mysql.user 表。',
      related: ['db-mysql-client', 'db-mysql-create-user', 'db-mysql-grant', 'db-mysql-show-grants', 'db-mysql-connect-timeout'],
      tags: ['MySQL', '认证', '1045']
    },
    {
      id: 'err-mysql-access-denied-local',
      cat: 'db-cache',
      msg: "ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)",
      where: 'mysql -u root -p 在本机连接时',
      meaning: '和远程版本同码不同 host：这次客户端来源是 localhost。**这里有个经典陷阱** —— 不带 -h 时走 Unix socket，host 显示为 localhost；带 -h 127.0.0.1 时走 TCP，host 可能是 127.0.0.1。MySQL 按 host 匹配账号，于是"本机 socket 能连、TCP 连不上（或反过来）"非常常见。',
      causes: [
        '密码输错了，或者密码里含特殊字符被 shell 吃掉了（要加单引号）',
        '账号只有 root@127.0.0.1 而没有 root@localhost（或刚好相反）',
        '连的是 socket 而你以为在走 TCP（-h 不带时默认走 socket）',
        'MySQL 8 初始化时给出的临时随机密码丢了，从没用它登录过'
      ],
      diagnose: [
        'mysql -u root -pwrong',
        'mysql -h 127.0.0.1 -uroot -p -e "SHOW DATABASES"',
        'mysql -uroot -p -e "SELECT user,host FROM mysql.user"',
        'cat /etc/my.cnf'
      ],
      fix: '先用能连上的账号查 `SELECT user,host FROM mysql.user;`，确认有哪些 host 的账号 —— localhost 与 127.0.0.1 在 MySQL 眼里是两个来源，缺哪个补哪个。root 密码彻底忘了要走 --skip-grant-tables 恢复流程，需要重启实例。',
      related: ['db-mysql-client', 'db-mysql-create-user', 'db-mysql-show-grants', 'db-mysql-grant'],
      tags: ['MySQL', '认证', '1045']
    },
    {
      id: 'err-mysql-unknown-host',
      cat: 'db-cache',
      msg: "ERROR 2005 (HY000): Unknown MySQL server host 'nope' (-2)",
      where: 'mysql -h 写了一个解析不了的主机名',
      meaning: '这是**客户端侧**错误（2000 系列都是客户端自己报的，不是服务端返回的）：它在本地解析这个主机名就失败了，(-2) 是 getaddrinfo 的错误码。也就是说包一个都没发出去 —— 它排除"服务没起"（那会报 ERROR 2003）。',
      causes: [
        '主机名拼错，或该名字不在任何 DNS 里',
        '只在某台机器的 /etc/hosts 里映射过，换台机器就没了',
        'resolv.conf 配错导致解析器不可用',
        '内网域名在云解析里没加记录'
      ],
      diagnose: [
        'nslookup nope',
        'cat /etc/hosts',
        'cat /etc/resolv.conf',
        'ping nope'
      ],
      fix: '用 `getent hosts <主机名>` 验证解析（它和客户端走同一套解析链路）；内网名字补 /etc/hosts 或云解析记录。临时救急可以直接写 IP 连接，但记得回头改配置，别把 IP 硬编码进代码。',
      related: ['db-mysql-client', 'db-mysql-connect-timeout', 'ln-hosts-file', 'ln-resolv-conf', 'ln-troubleshoot-dns'],
      tags: ['MySQL', '客户端', 'DNS']
    },
    {
      id: 'err-mysql-unknown-database',
      cat: 'db-cache',
      msg: "ERROR 1049 (42000): Unknown database 'nope'",
      where: '连接时指定了不存在的库，或 use 一个不存在的库',
      meaning: '服务端告诉你这个库不存在。它排在认证**之后** —— 也就是说账号密码是对的（否则先报 1045），只是库里没有这个名字。分清这一点的价值在于：不用再去折腾权限了。',
      causes: [
        '库名拼错，或大小写不符（Linux 上默认区分大小写）',
        '库还没建（初始化脚本没跑成功）',
        '连到了别的实例（把测试环境当成了生产）',
        '库被删了，或备份没恢复到这个实例上'
      ],
      diagnose: [
        'mysql -uroot -p -e "SHOW DATABASES"',
        'mysql -h 10.0.2.15 -uroot -p -e "SHOW DATABASES"',
        'cat /etc/my.cnf',
        'ss -tulnp | grep 3306'
      ],
      fix: '用能连的账号 `SHOW DATABASES;` 列出真实库名；确认要新建就 `CREATE DATABASE <名> DEFAULT CHARACTER SET utf8mb4;`，然后从备份恢复数据。',
      related: ['db-mysql-client', 'db-mysql-information-schema', 'db-mysql-restore', 'db-mysql-mysqldump'],
      tags: ['MySQL', '1049', '数据库']
    },
    {
      id: 'err-mysql-table-not-exist',
      cat: 'db-cache',
      msg: "ERROR 1146 (42S02): Table 'orders.no_such_table' doesn't exist",
      where: 'SQL 里引用了不存在的表',
      meaning: '格式固定是 `库名.表名`。它带库名这一点非常有用 —— **这是判断"是不是连错库"最直接的证据**：报错里的库名与你以为的不一致，就是连接串里的 database 配错了。42S02 是"表或视图不存在"的标准 SQLSTATE。',
      causes: [
        '表名拼错，或大小写与建表时不一致',
        '连到了错误的库（看报错里的库名前缀就能确认）',
        '建表脚本没执行，或迁移工具没跑成功',
        '表在另一个实例上（分库分表、读写分离指错了地址）'
      ],
      diagnose: [
        'mysql -uroot -p -e "SHOW DATABASES"',
        'mysql -uroot -p -e "SHOW TABLES FROM orders"',
        'mysql -uroot -p -e "SELECT * FROM no_such_table"',
        'cat /etc/my.cnf'
      ],
      fix: '先 `SHOW TABLES;` 确认当前库里到底有什么，再拿报错里的库名前缀核对连接串的 database。缺表就补跑建表或迁移脚本，别手工在线上 CREATE TABLE 了事。',
      related: ['db-mysql-client', 'db-mysql-information-schema', 'db-mysql-explain', 'db-mysql-restore'],
      tags: ['MySQL', '1146', '表']
    },
    {
      id: 'err-mysql-too-many-connections',
      cat: 'db-cache',
      msg: 'ERROR 1040 (HY000): Too many connections',
      where: '连接数达到 max_connections 时，新来的连接请求',
      meaning: '服务端连接数满了，**连认证都不会做**，直接回 1040 —— 所以别去查密码。它和应用侧连接池报"连接超时"是两件事：这里是 MySQL 主动拒绝了新连接，属于服务端已经到顶。',
      causes: [
        'max_connections 太小而并发上来了（默认 151，本站配置 500）',
        '应用连接池配得过大（每实例几百连接 × 多个副本）',
        '连接泄漏：应用拿了连接不还，Sleep 状态的连接堆积',
        '慢查询长期占着连接不放'
      ],
      diagnose: [
        'cat /etc/my.cnf',
        'mysql -uroot -p -e "SHOW DATABASES"',
        'mysql -uroot -p -e "SHOW PROCESSLIST"',
        'free -m'
      ],
      fix: '应急 `SET GLOBAL max_connections = 1000;`（重启失效，要写进 my.cnf 的 [mysqld] 段）。治本要两头收：应用连接池 maximumPoolSize 按 (max_connections × 0.8 ÷ 应用实例数) 反推，再查 Sleep 状态的空闲连接是谁漏还的。',
      related: ['db-mysql-connect-timeout', 'db-mysql-processlist', 'db-mysql-mysqladmin', 'db-mysql-slowlog'],
      tags: ['MySQL', '1040', '连接数']
    },
    {
      id: 'err-mysql-lock-wait-timeout',
      cat: 'db-cache',
      msg: 'ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction',
      where: '事务里等行锁超过 innodb_lock_wait_timeout（默认 50 秒）',
      meaning: 'InnoDB 在等一把**行锁**，一直等到超时。它和死锁（1213）的区别是：死锁是循环等待、InnoDB 立刻检测到并回滚一方；超时是单向等待，只能等时间到点。所以 1205 往往意味着"有另一个事务开了很久还没提交"。',
      causes: [
        '有长事务没提交（应用报错后没 rollback，连接还挂着）',
        '同一行被高频更新，排队时间超过 50 秒',
        '批量 UPDATE / DELETE 一次锁太多行，锁等待被放大',
        'innodb_lock_wait_timeout 设得太短，而业务本身就是长事务'
      ],
      diagnose: [
        'tail -20 /var/log/mysql/slow.log',
        'mysql -uroot -p -e "SHOW PROCESSLIST"',
        'mysql -uroot -p -e "SHOW DATABASES"',
        'cat /etc/my.cnf'
      ],
      fix: '先抓"是谁在锁"：查 information_schema.innodb_trx，按 trx_started 找到跑了最久的那个 trx_mysql_thread_id，必要时 KILL 掉它。然后把长事务拆小、批量操作分批提交，事务里绝不夹人工确认或远程调用。',
      related: ['db-mysql-innodb-status', 'db-mysql-processlist', 'db-mysql-slowlog', 'db-mysql-optimize-table'],
      tags: ['MySQL', '锁', '1205']
    },
    {
      id: 'err-mysql-deadlock',
      cat: 'db-cache',
      msg: 'ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction',
      where: 'InnoDB 检测到两个事务循环等待时',
      meaning: 'InnoDB 的死锁检测发现 A 等 B、B 等 A，于是**主动选一个牺牲者回滚**并返回 1213。要注意这句其实是"设计好的保护"，不是故障：正确应对是重试整个事务，而不是去改数据库参数把它关掉。',
      causes: [
        '两个事务以相反顺序更新同一批行（典型 AB-BA 死锁）',
        '缺索引导致 UPDATE 扫描并锁住了大范围的行',
        '事务里混用 SELECT ... FOR UPDATE 与普通 UPDATE，加锁顺序不一致',
        '并发高 + 事务太长，碰撞概率被放大'
      ],
      diagnose: [
        'tail -20 /var/log/mysql/slow.log',
        'mysql -uroot -p -e "SHOW PROCESSLIST"',
        'mysql -uroot -p -e "SHOW DATABASES"',
        'cat /etc/my.cnf'
      ],
      fix: '先看 `SHOW ENGINE INNODB STATUS` 的 LATEST DETECTED DEADLOCK 段，里面有两个事务的 SQL 与用到的索引。然后统一加锁顺序（按主键排序后再批量更新）、给 WHERE 条件补索引、把大事务拆小；应用层必须捕获 1213 并重试 2~3 次。',
      related: ['db-mysql-innodb-status', 'db-mysql-processlist', 'db-mysql-slowlog', 'db-mysql-explain'],
      tags: ['MySQL', '死锁', '1213']
    },
    {
      id: 'err-mysql-cant-connect',
      cat: 'db-cache',
      msg: "ERROR 2003 (HY000): Can't connect to MySQL server on '10.0.2.15' (111)",
      where: 'mysql -h 远程连接不上时（客户端侧错误）',
      meaning: '2003 是**客户端**在说"我连不上"，末尾的 (111) 是 errno，111 就是 ECONNREFUSED。它排除认证问题（那要先连上才会报 1045）和域名问题（那是 2005）。所以看到 2003 就去查网络与监听，别去查账号。',
      causes: [
        'MySQL 服务没起，或 mysqld 崩了',
        '只监听了 127.0.0.1（bind-address 没改）',
        '端口不通：云安全组或主机防火墙没放行',
        '实例还在启动中（大库的崩溃恢复要几分钟）'
      ],
      diagnose: [
        'nc -zv 10.0.2.15 3306',
        'ss -tulnp | grep 3306',
        'ping 10.0.2.15',
        'cat /etc/my.cnf'
      ],
      fix: '先 `nc -zv <host> 3306` 分清是网络还是服务：timed out 就去放安全组与防火墙；refused 就上机器 `ss -tulnp | grep 3306` 看有没有监听，没有就 `systemctl status mysqld` 并看 MySQL 的 error log。',
      related: ['db-mysql-client', 'db-mysql-connect-timeout', 'ln-nc', 'ln-troubleshoot-port', 'hw-vpc-troubleshoot-port'],
      tags: ['MySQL', '2003', '网络']
    },
    {
      id: 'err-redis-misconf',
      cat: 'db-cache',
      msg: "MISCONF Redis is configured to save RDB snapshots, but it's currently unable to persist to disk.",
      where: 'Redis 的写命令被拒，而读命令仍然正常',
      meaning: 'Redis 开启了 RDB 快照，但最近一次 bgsave 失败了，于是它**主动禁掉所有写命令**保命（stop-writes-on-bgsave-error 默认 yes）。整句话的重点在后半段：不是内存问题，是**磁盘或持久化路径**的问题。',
      causes: [
        '磁盘满或 inode 满，bgsave fork 出来的子进程写不下去',
        'rdb 目录没有写权限，或目录被删掉了',
        'vm.overcommit_memory=0 时 fork 失败（没有足够的 copy-on-write 余量）',
        'rdb 路径被换成了只读挂载，或被别的进程占着'
      ],
      diagnose: [
        'redis-cli info memory',
        'df -h',
        'redis-cli config get dir',
        'redis-cli dbsize'
      ],
      fix: '先修磁盘（`df -h` 与 `df -i`，清日志或扩容），确认 rdb 目录可写；`redis-cli config set stop-writes-on-bgsave-error no` 只是临时止血。再把 `vm.overcommit_memory` 设为 1，并从 Redis 日志里确认 RDB save 已恢复正常。',
      related: ['db-redis-info', 'db-redis-ops', 'db-redis-cli', 'ls9-df', 'db-redis-bigkeys'],
      tags: ['Redis', '持久化', 'MISCONF']
    },
    {
      id: 'err-redis-oom-command',
      cat: 'db-cache',
      msg: "OOM command not allowed when used memory > 'maxmemory'.",
      where: 'Redis 内存达到 maxmemory 之后的写命令',
      meaning: '这是 Redis **自己**的拒绝，不是内核 OOM：used_memory 超过 maxmemory，而淘汰策略（maxmemory-policy）是 noeviction 时，写命令一律被拒、读命令照常。它和"内核把 redis 进程杀掉"是程度不同的两件事，看到这句说明进程还活着。',
      causes: [
        'maxmemory-policy 是 noeviction（默认），而 key 一直在增长',
        'maxmemory 设得小于实际数据量',
        '有大量 key 没有 TTL，数据只进不出',
        '大 key 或热 key 多，内存涨得比预期快'
      ],
      diagnose: [
        'redis-cli info memory',
        'redis-cli dbsize',
        'redis-cli --bigkeys',
        'free -m'
      ],
      fix: '看 `INFO memory` 里 used_memory_human 与 maxmemory 的距离。业务允许丢数据就把策略改成 allkeys-lru 或 volatile-lru（`CONFIG SET maxmemory-policy allkeys-lru`，并写进 redis.conf），同时给所有缓存 key 补过期时间、清理无用大 key。',
      related: ['db-redis-info', 'db-redis-memory-usage', 'db-redis-bigkeys', 'db-redis-ops', 'mo-free'],
      tags: ['Redis', '内存', 'maxmemory']
    },
    {
      id: 'err-redis-noauth',
      cat: 'db-cache',
      msg: 'NOAUTH Authentication required.',
      where: 'Redis 配了密码（requirepass）而客户端没带 -a',
      meaning: 'Redis 要求先 AUTH，当前连接还是未认证状态，所以拒绝这条命令。注意报错词是 **NOAUTH** —— 它和 READONLY、MISCONF 一样属于"权限或策略类拒绝"，跟数据本身无关，别去查 key 是否存在。',
      causes: [
        'redis.conf 里设了 requirepass，客户端没传密码',
        '密码填错（那会报 WRONGPASS invalid username-password pair）',
        '应用配置里 Redis 密码为空（容器化后环境变量没注入）',
        '连到了另一个实例（同集群里有密码与无密码混用）'
      ],
      diagnose: [
        'redis-cli ping',
        'redis-cli -h 127.0.0.1 ping',
        'redis-cli info memory',
        'ss -tulnp | grep 6379'
      ],
      fix: '连接时带上密码：`redis-cli -a <密码> ping`（生产上别把密码留在命令历史里，用 REDISCLI_AUTH 环境变量）；应用侧把密码放进配置中心或 K8s Secret 注入，改完重启应用。',
      related: ['db-redis-cli', 'db-redis-ops', 'db-redis-info', 'k8s-secret'],
      tags: ['Redis', '认证', 'NOAUTH']
    },
    {
      id: 'err-redis-readonly',
      cat: 'db-cache',
      msg: "READONLY You can't write against a read only replica.",
      where: '往只读副本（replica）写数据时',
      meaning: '这个实例被标记成了 replica（replica-read-only 默认 yes），写命令一律拒绝。它说明**你连对了 Redis，但连错了角色** —— 主从架构里客户端应该把写流量发给主节点。',
      causes: [
        '连接串指向了从节点（读写分离配置反了，或主从切换后没更新）',
        '主节点故障切换后，旧主变成了新从，客户端还连着它',
        'Sentinel / Cluster 客户端没实现"写走主"的路由',
        '有人手工在从节点上执行了写命令'
      ],
      diagnose: [
        'redis-cli info replication',
        'redis-cli info memory',
        'redis-cli ping',
        'redis-cli dbsize'
      ],
      fix: '先确认拓扑：`INFO replication` 里 role:slave 就是副本。把写流量指到 master，或让客户端走 Sentinel/Cluster 自动路由。故障切换期间出现这句属于正常现象，客户端应当有重连与重试。',
      related: ['db-redis-info', 'db-redis-ops', 'db-redis-cli', 'db-redis-client-list'],
      tags: ['Redis', '主从', 'READONLY']
    },
    {
      id: 'err-redis-connection-refused',
      cat: 'db-cache',
      msg: 'Could not connect to Redis at db-prod-01:6379: Connection refused',
      where: 'redis-cli 连不上目标 Redis 实例',
      meaning: 'TCP 层被 RST：**网络是通的，只是那台机器的 6379 没有进程监听**。它排除"网络不通"（那会报 Connection timed out）和"名字解析失败"（那会报 Name or service not known）。注意两种失败共用 "Could not connect to" 前缀，区别全在冒号后面那半句。',
      causes: [
        'Redis 没启动，或启动后立刻退出（配置错、RDB 加载失败）',
        'Redis 只监听了 127.0.0.1（bind 指令没加网卡地址）',
        'protected-mode yes 且没设密码时，会拒绝非本机连接',
        '端口不是 6379（改过端口而客户端没改）'
      ],
      diagnose: [
        'redis-cli -h db-prod-01 ping',
        'ss -tulnp | grep 6379',
        'nc -zv db-prod-01 6379',
        'tail -20 /data/app/logs/app.log'
      ],
      fix: '登上目标机 `ss -tulnp | grep 6379`：无输出就是没起（启动它并看日志）；输出是 127.0.0.1:6379 就把 redis.conf 的 bind 改成具体网卡 IP（或 0.0.0.0 配合密码与安全组），确认 protected-mode 与 requirepass 配置后重启。',
      related: ['db-redis-cli', 'db-redis-ops', 'ln-troubleshoot-connect-refused', 'ln-ss', 'ln-nc'],
      tags: ['Redis', '网络', '端口']

    },
    /* ==================== JVM / 内存 ==================== */
    {
      id: 'err-jvm-heap-space',
      cat: 'monitor',
      msg: 'java.lang.OutOfMemoryError: Java heap space',
      where: '应用日志里，堆内存耗尽时',
      meaning: '堆里的对象再也放不下、Full GC 也回收不出空间时抛的就是这一句。它明确排除了"元空间满"（那是 Metaspace）、"堆外内存满"（那是 Direct buffer memory）和"线程建不出来"（那是 unable to create new native thread）—— 四种 OOM 的措辞不同，指向的内存区域完全不同。',
      causes: [
        '堆太小（-Xmx 小于真实峰值），或容器 limit 小于堆',
        '内存泄漏：集合或缓存只增不减，Full GC 后老年代仍居高不下',
        '一次拉了太多数据（全表查询、无分页导出）',
        '缓存没有上限也没有过期策略'
      ],
      diagnose: [
        'tail -40 /data/app/logs/app.log',
        'jmap -heap 18442',
        'jstat -gcutil 18442',
        'tail -5 /data/logs/gc.log'
      ],
      fix: '先分清是"泄漏"还是"不够"：`jstat -gcutil` 看 FGC 之后老年代是否回落到低位 —— 回落是峰值问题（抬 -Xmx 或改用 MaxRAMPercentage），不回落就是泄漏（`jmap -dump:format=b,file=/tmp/heap.hprof <pid>` 抓堆快照，用 MAT 找持有者）。',
      related: ['mo-jvm-jmap', 'mo-jvm-jstat', 'pf-gc-log', 'mo-jvm-arthas', 'mo-jvm-jstack'],
      tags: ['JVM', '内存', 'OOM']
    },
    {
      id: 'err-jvm-metaspace',
      cat: 'monitor',
      msg: 'java.lang.OutOfMemoryError: Metaspace',
      where: '类元数据区（Metaspace）耗尽时',
      meaning: '元空间装的是**类的元数据**，不是对象。所以出现这句通常意味着"类被反复加载"，而不是数据太多。JDK 8 之后 Metaspace 用的是本地内存（不在 -Xmx 里），因此堆还有富余也会报这个。',
      causes: [
        '热部署或热加载导致类加载器泄漏（Tomcat reload、频繁 redeploy）',
        '动态生成类太多（CGLIB 代理、脚本引擎、反射框架）',
        'MaxMetaspaceSize 设得太小',
        '容器本地内存不足（元空间与线程栈、直接内存共享堆外内存）'
      ],
      diagnose: [
        'jstat -gcutil 18442',
        'jmap -heap 18442',
        'jinfo 18442',
        'tail -40 /data/app/logs/app.log'
      ],
      fix: '先看 `jstat -gcutil` 的 M 列（Metaspace 使用率）是否单调上涨：持续上涨就是类加载器泄漏，去查热部署次数与动态代理、脚本引擎；不涨就调大 `-XX:MaxMetaspaceSize=512m`，同时给容器留足堆外内存。',
      related: ['mo-jvm-jstat', 'mo-jvm-jmap', 'mo-jvm-jinfo', 'mo-jvm-arthas', 'mo-jvm-jps'],
      tags: ['JVM', 'Metaspace', 'OOM']
    },
    {
      id: 'err-jvm-direct-buffer',
      cat: 'monitor',
      msg: 'java.lang.OutOfMemoryError: Direct buffer memory',
      where: 'NIO 直接内存（堆外）耗尽时',
      meaning: 'DirectByteBuffer 分配的是**本地内存**，不受 -Xmx 管，只受 -XX:MaxDirectMemorySize 限制（默认约等于堆上限）。所以典型现象是：堆看起来正常，进程 RSS 却一直涨，最后报这一句。',
      causes: [
        'Netty / NIO 框架用直接内存做缓冲，而没有设上限',
        '直接内存没释放（ByteBuffer 被引用住，Cleaner 没触发）',
        'MaxDirectMemorySize 没设，默认值与本机内存不匹配',
        '容器内存 limit 到了，分配本地内存时被系统拒绝'
      ],
      diagnose: [
        'jmap -heap 18442',
        'jstat -gcutil 18442',
        'free -m',
        'tail -40 /data/app/logs/app.log'
      ],
      fix: '显式设 `-XX:MaxDirectMemorySize=512m` 并继续观察：仍溢出就是泄漏，重点查 Netty 的 ByteBuf 是否 release、NIO channel 是否关闭。用 `jcmd <pid> VM.native_memory summary` 能看到直接内存的实际占用。',
      related: ['mo-jvm-jmap', 'mo-jvm-jstat', 'mo-jvm-jinfo', 'mo-jvm-arthas', 'mo-free'],
      tags: ['JVM', '直接内存', 'OOM']
    },
    {
      id: 'err-jvm-gc-overhead',
      cat: 'monitor',
      msg: 'java.lang.OutOfMemoryError: GC overhead limit exceeded',
      where: 'GC 占用了 98% 以上时间却只回收不到 2% 的空间时',
      meaning: '严格说这不是"内存不够"而是**GC 空转**：JVM 几乎把所有 CPU 都花在 GC 上却回收不出空间，于是它宁可抛错，也不把 CPU 全耗在无用功上。判据很明确 —— `jstat -gcutil` 里 FGC 频繁增长、GCT 占比极高而 O 区不下降。',
      causes: [
        '堆几乎满了，存活对象太多导致每次 GC 都白干',
        '缓存或集合泄漏，对象全被引用住',
        '堆设得过小，同时业务并发还很高',
        '大量临时大对象（大数组、大字符串）让 GC 反复触发'
      ],
      diagnose: [
        'jstat -gcutil 18442',
        'tail -5 /data/logs/gc.log',
        'jmap -heap 18442',
        'tail -40 /data/app/logs/app.log'
      ],
      fix: '先看 GC 日志里 Full GC 的频次与耗时；短期抬 -Xmx 争取时间，然后抓堆快照定位是谁在大量持有对象。`-XX:-UseGCOverheadLimit` 能关掉这个检查，但那只是把报错换成更难看的 heap space，不解决问题。',
      related: ['pf-gc-log', 'mo-jvm-jstat', 'mo-jvm-jmap', 'pf-jstat', 'mo-jvm-arthas'],
      tags: ['JVM', 'GC', 'OOM']
    },
    {
      id: 'err-jvm-native-thread',
      cat: 'monitor',
      msg: 'java.lang.OutOfMemoryError: unable to create new native thread',
      where: '线程数达到系统或容器上限时',
      meaning: '这句和堆内存**没有直接关系**：JVM 要新建一个线程，但操作系统拒绝分配（pthread_create 失败）。反直觉的是，堆调得越大反而越容易触发它 —— 堆吃掉的本地内存多了，留给线程栈的就少了。',
      causes: [
        '线程数达到容器或用户的限制（nproc、pids cgroup、ulimit -u）',
        '每个线程栈太大（-Xss），总内存不够',
        '应用线程池无界，创建了几千个线程',
        '堆加直接内存把本地内存吃光，没有空间再给线程栈'
      ],
      diagnose: [
        'jstack 18442',
        'jps',
        'ps -ef | grep java',
        'free -m'
      ],
      fix: '先数线程：`jstack <pid>` 看线程块数量，或 `ps -eLf | wc -l`。线程池无界就给它设上限并加拒绝策略；是系统限制就抬 LimitNPROC 或容器的 pids limit；把 -Xss 调到 512k 通常能立刻缓解。',
      related: ['mo-jvm-jstack', 'mo-jvm-jps', 'pf-ulimit-n', 'pf-jstack-cpu', 'mo-jvm-jmap'],
      tags: ['JVM', '线程', 'OOM']
    },
    {
      id: 'err-jvm-gc-pause-full',
      cat: 'monitor',
      msg: '[2024-03-18T09:44:12.661+0800][info][gc] GC(4) Pause Full (G1 Compaction Pause) 2046M->712M(2048M) 1204.318ms',
      where: 'GC 日志里出现 Pause Full，且耗时到了秒级',
      meaning: '括号里是**触发原因**（G1 Compaction Pause 是并发标记后发现碎片太多、需要压缩），箭头两边是回收前后的堆占用，最后是 STW 停顿时长。1.2 秒的 Stop-The-World 意味着所有业务线程都停了 1.2 秒 —— 这才是应用日志里报"接口超时"的根因，而不是数据库慢。',
      causes: [
        '堆太小：2046M->712M 说明一回收就掉一半，堆长期在 90% 以上',
        '对象存活率高（缓存占大头），每次都得做压缩',
        'Humongous 大对象分配（超过 region 一半的对象）触发并发周期',
        '代码里调了 System.gc()（日志里会直接写 System.gc()）'
      ],
      diagnose: [
        'tail -5 /data/logs/gc.log',
        'jstat -gcutil 18442',
        'jmap -heap 18442',
        'tail -40 /data/app/logs/app.log'
      ],
      fix: '按 Full GC 的频次与停顿决定动作：堆不够就抬 -Xmx（容器里用 MaxRAMPercentage），存活率高就查缓存是否无上限，日志里出现 System.gc() 就去代码里删掉显式调用（或加 -XX:+DisableExplicitGC）。',
      related: ['pf-gc-log', 'pf-jstat', 'mo-jvm-jstat', 'mo-jvm-jmap', 'mo-jvm-arthas'],
      tags: ['JVM', 'GC', '停顿']
    },
    {
      id: 'err-kernel-oom-killed',
      cat: 'monitor',
      msg: 'Out of memory: Killed process 2210 (mysqld) total-vm:1892444kB, anon-rss:1820440kB, file-rss:0kB, shmem-rss:0kB, UID:27 pgtables:3764kB oom_score_adj:0',
      where: 'dmesg 里，进程被内核 OOM killer 杀掉时',
      meaning: '这是**内核**杀的（不是 JVM 或应用自己抛的 OOM），说明整机物理内存加 swap 都见底了。关键信息有三组：被杀进程名与 PID、anon-rss（它实际占的物理内存）、oom_score_adj（打分调权）。进程会"凭空消失"且不写任何应用日志，证据只在这里。',
      causes: [
        '机器内存被某个进程吃满（内存泄漏，或缓存无上限）',
        '容器没设 memory limit，进程把宿主机吃穿',
        '多个进程共用一台机器，总需求超过物理内存且 swap 关闭',
        'page cache 与匿名页争抢，直接回收也救不回来'
      ],
      diagnose: [
        'dmesg',
        'free -m',
        'top',
        'cat /proc/meminfo'
      ],
      fix: '先 `dmesg` 确认是谁被杀、`free -m` 看剩余内存；给关键进程设保护（调低 oom_score_adj）只是权宜。根治要给大户设上限：容器 memory limit、JVM 堆上限、缓存容量，并评估是否需要加内存或开 swap。',
      related: ['mo-dmesg', 'mo-free', 'mo-top', 'mo-proc', 'pf-swappiness'],
      tags: ['内核', 'OOM', '内存']

    },
    /* ==================== 华为云 / 对象存储 ==================== */
    {
      id: 'err-hw-apigw-0301',
      cat: 'cloud-cli',
      msg: '{"error_msg":"Authentication failed.","error_code":"APIGW.0301"}',
      where: '调用华为云 API 时返回的 401（hcloud/KooCLI、API Explorer、自研脚本都会遇到）',
      meaning: 'APIGW 是华为云 API 网关的错误码前缀，0301 就是认证失败：请求确实到了网关，但签名或令牌没通过。它排除"权限不足"（那是 403 一类，网关和 IAM 会给出不同的错误码）和"参数写错"（那是 400）。',
      causes: [
        'AK/SK 写错，或复制时带了空格、把 SK 填到了 AK 的位置',
        '签名区域与 endpoint 不匹配（cli-region 与请求域名对不上）',
        '临时凭证（STS）过期，或没带 securitytoken',
        '请求头里的 Project-ID、账号名等信息填错'
      ],
      diagnose: [
        'hcloud configure list',
        'hcloud ECS ListServersDetails',
        'obsutil config',
        'env'
      ],
      fix: '`hcloud configure list` 确认 profile 里的 AK/SK 与 region，重配用 `hcloud configure set --cli-access-key=<AK> --cli-secret-key=<SK> --cli-region=cn-north-4`。用临时凭证时必须同时提供 securitytoken，且注意它有效期很短。',
      related: ['hw-hcloud-config-init', 'hw-hcloud-config-set', 'hw-hcloud-config-list', 'hw-cross-aksk-best-practice', 'hw-hcloud-output'],
      tags: ['华为云', '认证', 'AK/SK']
    },
    {
      id: 'err-obs-invalid-access-key-id',
      cat: 'cloud-cli',
      msg: '<Code>InvalidAccessKeyId</Code><Message>The AWS Access Key Id you provided does not exist in our records.</Message>',
      where: 'OBS / S3 返回 403 时的 XML 响应体',
      meaning: 'OBS 兼容 S3 协议，所以错误码与措辞沿用 AWS 的那一套：**这个 Access Key 本身在系统里查不到**。它和 SignatureDoesNotMatch 的区别很关键 —— 这句是 AK 不存在（多半复制错或已删除），那句是 AK 对了但签名算错（多半 SK 错、编码错或时钟偏差）。',
      causes: [
        'AK 复制时多了空格或换行，或者把 SK 填到了 AK 的位置',
        'AK 已被删除或停用（IAM 里禁用、删除访问密钥）',
        '用了别的云账号、别的区域的 AK',
        'STS 临时凭证的 AK 已过期'
      ],
      diagnose: [
        'obsutil config',
        'hcloud configure list',
        'obsutil ls',
        'env'
      ],
      fix: '到 IAM 控制台的"我的凭证 → 访问密钥"重新下载或新建 AK/SK，然后 `obsutil config -i=<AK> -k=<SK> -e=obs.cn-north-4.myhuaweicloud.com` 重配。AK/SK 绝不能进代码仓库 —— 泄露会被云厂商扫描并告警。',
      related: ['hw-obsutil-config', 'hw-obs-bucket', 'hw-iam-aksk-leak', 'sec-aksk-leak', 'hw-hcloud-config-set'],
      tags: ['OBS', '认证', 'AK/SK']
    },
    {
      id: 'err-obs-request-time-too-skewed',
      cat: 'cloud-cli',
      msg: '<Code>RequestTimeTooSkewed</Code><Message>The difference between the request time and the current time is too large.</Message>',
      where: 'OBS / S3 返回 403，且错误码是 RequestTimeTooSkewed',
      meaning: '服务端把你签名里的时间和自己的时间比，差得太多（OBS 允许 15 分钟）就拒绝 —— 这是签名校验的必然要求，因为签名串里含时间戳。它排除了"AK/SK 错"（那会是 InvalidAccessKeyId 或 SignatureDoesNotMatch），**根因是本机时钟**。',
      causes: [
        '服务器时钟漂移（没开 NTP，或虚拟机休眠后时间跳变）',
        '容器内的时区或时间与宿主机不一致',
        '本地开发机时间不准',
        '请求在客户端缓存太久才发出（少见）'
      ],
      diagnose: [
        'date',
        'uptime',
        'hcloud configure list',
        'obsutil config'
      ],
      fix: '`date` 对比标准时间，然后用 chrony 校时：`systemctl restart chronyd` 让它立刻与服务端同步，并 `systemctl enable chronyd` 保证开机自启。容器共享宿主机的内核时钟，所以要把宿主机的 NTP 修好。',
      related: ['lu-date', 'lu-timedatectl', 'hw-cross-region-endpoint', 'hw-obsutil-config', 'hw-hcloud-config-list'],
      tags: ['OBS', '时钟', '签名']
    },
    {
      id: 'err-hcloud-missing-command',
      cat: 'cloud-cli',
      msg: 'hcloud: missing command',
      where: 'KooCLI（hcloud）不带任何参数直接执行',
      meaning: 'KooCLI 的参数模型是"服务 + 操作"两段（形如 `hcloud ECS ListServersDetails`），只敲 hcloud 它不知道该调哪个接口，于是给出这句最简短的抱怨。它排除"AK/SK 没配"—— 那要等真正发起请求时才会报认证错误。',
      causes: [
        '忘了写服务名与操作名（KooCLI 与 aws cli 写法不同，它没有默认命令）',
        '脚本里变量展开为空，整条命令退化成了 hcloud',
        '想查帮助却忘了写 `hcloud --help`',
        '从文档复制命令时把中间那段漏掉了'
      ],
      diagnose: [
        'hcloud configure list',
        'env',
        'hcloud ECS ListServersDetails',
        'obsutil ls'
      ],
      fix: 'KooCLI 的固定格式是 `hcloud <服务> <操作> [--参数]`，例如 `hcloud ECS ListServersDetails --cli-region=cn-north-4`。不确定操作名就用 `hcloud <服务> --help` 查，或在 API Explorer 页面上直接生成命令。',
      related: ['hw-hcloud-config-list', 'hw-hcloud-help', 'hw-ecs-list', 'hw-hcloud-output'],
      tags: ['华为云', 'KooCLI', '命令行']

    },
    /* ==================== Git / 交付 ==================== */
    {
      id: 'err-git-not-a-repo',
      cat: 'cicd',
      msg: 'fatal: not a git repository (or any of the parent directories): .git',
      where: '任何 git 子命令，只要当前目录不在仓库内',
      meaning: 'git 从当前目录**逐级向上**找 .git（目录或文件），一直找到根都没有，于是放弃。注意"向上找"这一点：仓库的子目录里能跑 git，而 /tmp 里不能。它排除"仓库损坏"—— 那种情况会是别的报错。',
      causes: [
        '当前目录不在仓库里（cd 错了地方，或部署机上只拷了代码没拷 .git）',
        '仓库目录被删了，或被 rsync 的 exclude 规则把 .git 排除了',
        '在容器里执行，而代码是 COPY 进去的、没带 .git',
        'GIT_DIR 环境变量指到了错误位置'
      ],
      diagnose: [
        'git status',
        'pwd',
        'ls -la',
        'find /data -maxdepth 3 -name ".git"'
      ],
      fix: '先 `pwd` 与 `ls -la` 确认当前位置、以及有没有 .git；在仓库子目录里执行，或 cd 到仓库根。CI 里要保证 checkout 步骤真的执行了 —— 浅克隆也依然带 .git。',
      related: ['ci-git-status', 'ci-git-init', 'ci-git-clone', 'ci-git-worktree'],
      tags: ['Git', '仓库']
    },
    {
      id: 'err-git-pathspec',
      cat: 'cicd',
      msg: "error: pathspec 'nope' did not match any file(s) known to git",
      where: 'git checkout / git add 一个 git 不认识的路径或分支名',
      meaning: 'git 把参数既当分支名又当路径去匹配，两边都没匹配上。它排除"分支存在但切不过去"（那会报 local changes would be overwritten）和"仓库不存在"（那是 not a git repository）。',
      causes: [
        '分支或标签名拼错，或本地还没有这个分支（要先 fetch）',
        '文件路径写错，或文件没被 git 跟踪且名字也对不上',
        '想 checkout 远端同名分支，但本地没有对应的 remote 引用',
        '大小写不符（Linux 上文件名区分大小写）'
      ],
      diagnose: [
        'git branch -a',
        'git status',
        'git log --oneline',
        'git tag'
      ],
      fix: '`git branch -a` 看本地与远端都有什么；要切远端分支先 `git fetch` 再 checkout。检出某个历史提交用 `git switch --detach <sha>`，别把一个短 sha 当分支名直接写。',
      related: ['ci-git-branch', 'ci-git-switch', 'ci-git-fetch', 'ci-git-branch-remote'],
      tags: ['Git', '分支', 'pathspec']
    },
    {
      id: 'err-git-non-fast-forward',
      cat: 'cicd',
      msg: '! [rejected]        main -> main (non-fast-forward)',
      where: 'git push 时远端存在你本地没有的提交',
      meaning: '远端 main 的提交历史不是本地的祖先，git 拒绝推送，以免覆盖别人的提交。**这是保护机制，不是故障**。它和 fetch first 的差别是：non-fast-forward 说明两条历史真的分叉了，fetch first 只是本地还没把远端提交拉下来（更常见、也更好解）。',
      causes: [
        '别人先推了提交，而你没 pull 就改了同一分支',
        '本地做过 rebase 或 commit --amend，历史被改写了',
        '在旧的本地分支上开发太久，远端已经前进很多',
        'CI 用的凭证推的是受保护分支（那种会报 protected branch，措辞不同）'
      ],
      diagnose: [
        'git status',
        'git log --oneline',
        'git diff',
        'git branch -a'
      ],
      fix: '先 `git pull --rebase origin main` 把远端提交垫在下面再推。**不要 `git push -f`** —— 那会抹掉别人的提交。确实需要强推个人分支时用 `git push --force-with-lease`（远端一变就拒绝，比 -f 安全得多）。',
      related: ['ci-git-push', 'ci-git-pull', 'ci-git-fetch', 'ci-git-rebase', 'ci-git-reflog'],
      tags: ['Git', '推送', '协作']
    },
    {
      id: 'err-git-detached-head',
      cat: 'cicd',
      msg: "You are in 'detached HEAD' state.",
      where: 'git checkout 一个提交 sha 或标签之后',
      meaning: 'HEAD 直接指向了某个提交，而不是某个分支。此时提交的修改**不属于任何分支**，一旦切走就很容易丢。它和"unborn branch"（新仓库还没有任何提交）是两回事，别混。',
      causes: [
        '用 git checkout <sha> 或 <tag> 查看历史版本',
        'CI 里 checkout 了某个 tag 做发布',
        'submodule 或某些工具直接检出具体提交',
        'rebase 过程中也会暂时处于 detached 状态（这是正常的）'
      ],
      diagnose: [
        'git status',
        'git log --oneline',
        'git branch -a',
        'git diff'
      ],
      fix: '只是看看历史就没事；要在这里改代码，先建分支：`git switch -c fix/xxx`。已经提交了又切走，就用 `git reflog` 找到那个 sha，再 `git branch <名字> <sha>` 把它救回来（reflog 默认保留 90 天）。',
      related: ['ci-git-switch', 'ci-git-reflog', 'ci-git-log', 'ci-git-tag', 'ci-git-reset'],
      tags: ['Git', 'HEAD']
    },
    {
      id: 'err-git-merge-conflict',
      cat: 'cicd',
      msg: 'CONFLICT (content): Merge conflict in src/main/java/com/example/orders/OrderService.java',
      where: 'git merge / pull / rebase / cherry-pick 时，同一文件的同一区域被两边改过',
      meaning: 'git 能自动合并**不同的**改动，只有同一处被两边改成了不同内容时才停下来让人决定。它排除"合并操作本身失败"：这里的冲突是**预期行为**，需要人工编辑解决，而不是重试。',
      causes: [
        '两个分支改了同一文件的相同或相邻行',
        '一边删了文件、另一边改了它（那时会报 CONFLICT (modify/delete)）',
        '格式化工具重排了整个文件，造成大面积"假冲突"',
        '长期分支没同步主干，积累了太多分叉'
      ],
      diagnose: [
        'git status',
        'git diff',
        'git log --oneline',
        'git branch -a'
      ],
      fix: '打开冲突文件找 `<<<<<<<`、`=======`、`>>>>>>>` 三处标记，手工改成最终想要的内容并删掉标记，然后 `git add <文件>` 再 `git commit`（rebase 场景用 `git rebase --continue`）。想整个放弃就 `git merge --abort` 回到合并前。',
      related: ['ci-git-merge', 'ci-git-rebase', 'ci-git-status', 'ci-git-diff', 'ci-git-cherry-pick'],
      tags: ['Git', '冲突', '合并']

    },
    /* ==================== 安全 ==================== */
    {
      id: 'err-ssh-host-key-changed',
      cat: 'security',
      msg: 'WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!',
      where: 'ssh 连一台重装过系统或换过密钥的机器',
      meaning: '这是 ssh **客户端本地的保护机制**，不是服务端报错：~/.ssh/known_hosts 里记着的主机公钥和这次拿到的不一致，ssh 直接断开，防止中间人攻击。它排除"密码错"—— 密码错要等连接建立之后才会报。',
      causes: [
        '目标机器重装了系统，或重新生成了 ssh host key',
        '多台机器共用一个 IP（云上弹性 IP 换绑、NAT 后面挂多台）',
        '负载均衡后面有多台主机，各自的 host key 不同',
        '真的是中间人攻击（少见，但不能默认排除）'
      ],
      diagnose: [
        'cat /etc/hosts',
        'cat /etc/ssh/sshd_config',
        'hostname',
        'ip addr'
      ],
      fix: '确认确实是重装或换机之后，删掉旧记录再连：`ssh-keygen -R 10.0.1.24` 会从 known_hosts 里精确删掉那一条，然后重新接受新指纹。**接受前先通过带外渠道核对指纹**，不要习惯性回车。',
      related: ['ln-ssh', 'ln-known-hosts', 'ln-ssh-config-alias', 'ln-ssh-copy-id', 'sec-ssh-keygen'],
      tags: ['SSH', '安全', 'known_hosts']
    }
  );
})();
