/* data/linux-storage.js · 分类 05 磁盘与存储 */
(function () {
  'use strict';

  var catId = 'linux-storage';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];

  /* 幂等保护：数据文件若被加载器重复 fetch，避免同一批命令被 push 两次 */
  if (window.CC_DATA[catId].length > 0) { return; }

  window.CC_DATA[catId].push(

    /* ================= A. 容量查看与排查 ================= */

    /* ---------- 1 / 65 ---------- */
    {
      id: 'ls9-df',
      name: 'df',
      alias: ['disk free', '磁盘使用率'],
      level: 1,
      syntax: 'df [选项] [文件|目录]',
      summary: '查看各文件系统总容量、已用、可用与挂载点，判断磁盘是否写满。',
      desc: '读取的是文件系统超级块里的统计值，不扫目录，所以比 `du` 快得多。云主机上排查“磁盘告警”第一步就是 `df -h`；如果某个挂载点使用率 100%，再往下用 `du` 或 `ncdu` 找具体目录。注意 `df` 与 `du` 的统计口径不同，两者对不上是常见现象，不要急着怀疑磁盘坏了。',
      params: [
        { flag: '-h', desc: '人类可读单位（GB/MB），生产上默认就加这个' },
        { flag: '-i', desc: '看 inode 使用量而不是容量，小文件把 inode 用满时容量可能还空着' },
        { flag: '-T', desc: '额外显示文件系统类型（ext4/xfs/nfs/tmpfs），挂载排障必备' },
        { flag: '-t <类型>', desc: '只看指定类型的文件系统，如 `df -hT -t xfs`' },
        { flag: '-x <类型>', desc: '排除指定类型，如 `df -h -x tmpfs -x devtmpfs` 只看真实磁盘' },
        { flag: '--total', desc: '末尾追加一行总计，适合脚本判断整体使用率' },
        { flag: '-l', desc: '只显示本地文件系统，过滤掉 NFS 等网络挂载' },
        { flag: '-P', desc: 'POSIX 输出格式，长设备名不折行，脚本解析必须加' }
      ],
      examples: [
        { cmd: 'df -hT -x tmpfs -x devtmpfs', desc: '只看真实磁盘的使用率与文件系统类型，日常第一眼' },
        { cmd: 'df -i /data', desc: '检查 /data 的 inode 是否用满：IUse% 100% 时容量还有空也写不进文件' },
        { cmd: 'df -h --total | tail -n 1', desc: '取整体统计行，可写进巡检脚本做阈值告警' }
      ],
      notes: [
        '`df` 显示满但 `du -sh` 加起来远小于总容量：多半是进程删了文件但文件句柄没释放，用 `lsof +L1` 找到进程后 `systemctl restart <服务>`，或 `: > /proc/<pid>/fd/<n>` 直接释放',
        '容量还有剩余却提示 “No space left on device”：先看 `df -i`，inode 耗尽（小文件海量堆积）也会报同样的错，`du` 完全看不出来',
        '已删除但仍被占用的空间，只有进程退出或 fd 关闭才会真正还给文件系统，排查时不要只看 `du`',
        '`-h` 按 1024 进制换算，硬盘厂商标称按 1000 进制，所以 1TB 盘显示约 931G，属正常现象'
      ],
      related: ['ls9-du', 'ls9-lsblk', 'ls9-findmnt', 'ls9-ncdu'],
      docs: 'https://man7.org/linux/man-pages/man1/df.1.html',
      tags: ['容量', '排障', '使用率', '磁盘满', '空间不足']
    },

    /* ---------- 2 / 65 ---------- */
    {
      id: 'ls9-du',
      name: 'du',
      alias: ['disk usage', '目录大小'],
      level: 1,
      syntax: 'du [选项] [目录|文件]',
      summary: '统计目录和文件实际占用的磁盘空间，用来定位是谁占满了盘。',
      desc: '逐层遍历目录累加块占用，所以大目录上比 `df` 慢很多，建议先用 `--max-depth` 缩小范围再逐级深入。`du` 看的是“占用块大小”，一个 1 字节文件也占 4K，因此 `du` 结果会略大于 `ls -l` 的字节数之和。标准排查套路是：`df -h` 找出满的挂载点 → `du --max-depth=1` 找一级目录 → 继续往下钻。',
      params: [
        { flag: '-s', desc: '只输出汇总值，不列子目录，常与 `-h` 连写成 `-sh`' },
        { flag: '-h', desc: '人类可读单位，和 `-s` 或 `--max-depth` 配合' },
        { flag: '--max-depth=1', desc: '只统计到指定层级，找“谁占满了磁盘”的核心参数' },
        { flag: '-x', desc: '不跨越文件系统，避免统计时钻进 NFS 挂载点或另一个分区' },
        { flag: '--exclude=<模式>', desc: '排除匹配的路径，如 `--exclude=/data/backup` 跳过备份目录' },
        { flag: '-a', desc: '连普通文件也逐个列出，配合 `--max-depth` 定位大文件' },
        { flag: '--time', desc: '输出时附带最后修改时间，判断是否是陈旧的大文件' },
        { flag: '-c', desc: '末尾追加总计行，适合统计一批目录的总和' }
      ],
      examples: [
        { cmd: 'du -h --max-depth=1 /data | sort -hr', desc: '列出 /data 下每个一级子目录的大小并倒序，找占用大头最快的一招' },
        { cmd: 'du -shx /var/* 2>/dev/null | sort -hr | head -n 10', desc: 'Top10 大目录，`-x` 保证不会跨到别的文件系统去数' },
        { cmd: 'du -ah --max-depth=2 /var/log | sort -hr | head -n 20', desc: '连文件一起列出，定位是哪个大日志文件在涨' }
      ],
      notes: [
        '`du` 会真实读目录项，在千万级小文件的目录上可能跑几十分钟并推高 IO，生产上建议加 `ionice -c3` 或改在业务低峰执行',
        '`du` 与 `df` 结果对不上是常态：被删除但句柄未释放的文件 `du` 看不到，`df` 却仍然算已用，用 `lsof +L1` 才能看到',
        '不要对 `/` 直接跑 `du -sh /`，会遍历 /proc、/sys 并可能卡死，至少加 `-x` 或指定具体目录',
        '`--max-depth=1` 里 `-s` 不能同时出现，两个汇总维度互斥'
      ],
      related: ['ls9-df', 'ls9-ncdu', 'ls9-lsblk', 'ls9-quota'],
      docs: 'https://man7.org/linux/man-pages/man1/du.1.html',
      tags: ['容量', '目录', '排障', '磁盘满', '找出大文件']
    },

    /* ---------- 3 / 65 ---------- */
    {
      id: 'ls9-ncdu',
      name: 'ncdu',
      alias: ['disk usage analyzer', '交互式磁盘分析'],
      level: 2,
      syntax: 'ncdu [选项] [目录]',
      summary: '交互式磁盘占用分析器，键盘点选即可钻取最占空间的大目录。',
      desc: '先把目录树扫一遍再进界面，之后所有钻取都在内存里完成，所以比反复敲 `du` 顺手得多。界面里方向键选择、回车进入、`d` 删除、`g` 切换百分比/大小、`n` 按名排序、`a` 看当前项大小、`q` 退出。发行版默认多半没装：CentOS/RHEL 用 `yum install ncdu`（EPEL），Ubuntu/Debian 用 `apt install ncdu`。首次扫描和 `du` 一样吃 IO，超大目录建议低峰跑。',
      params: [
        { flag: '-x', desc: '停留在同一个文件系统内，不跟进挂载点，最常用' },
        { flag: '--exclude <路径>', desc: '扫描时排除指定路径，可重复，适合跳过备份目录' },
        { flag: '-o <文件>', desc: '把扫描结果导出为 JSON 文件，便于事后分析' },
        { flag: '-f <文件>', desc: '从 `-o` 导出的 JSON 文件载入，无需重新扫描' },
        { flag: '-e', desc: '开启只读以外的能力，允许在界面里删除文件（危险）' },
        { flag: '-q', desc: '安静模式，降低界面刷新；配额统计时更省资源' }
      ],
      examples: [
        { cmd: 'ncdu -x /data', desc: '分析 /data 占用，不进界面就能一眼看到最大的目录' },
        { cmd: 'ncdu -o /tmp/ncdu-data.json /data && ncdu -f /tmp/ncdu-data.json', desc: '先导出再离线查看，扫描只在低峰做一次' }
      ],
      notes: [
        '界面里的 `d` 是真实删除文件，不是移进回收站，按下去之前先看清选中项',
        '扫描结果是一次快照，看完不刷新不会反映之后的文件变化，按 `r` 重新扫描',
        '若 `ncdu` 显示的大小明显小于 `df`，回到 `lsof +L1` 查“已删除但句柄未释放”的文件'
      ],
      related: ['ls9-du', 'ls9-df'],
      docs: 'https://dev.yorhel.nl/ncdu/man',
      tags: ['容量', '交互式', '分析']
    },

    /* ---------- 4 / 65 ---------- */
    {
      id: 'ls9-lsblk',
      name: 'lsblk',
      alias: ['list block devices', '块设备'],
      level: 1,
      syntax: 'lsblk [选项] [设备]',
      summary: '树状列出所有块设备及其分区、大小和挂载点，挂新盘先看它。',
      desc: '只读 `/sys` 和 `/proc`，不碰磁盘本身，所以随时能跑。云主机挂载新 EVS 数据盘后，第一件事就是 `lsblk` 确认内核有没有识别到新盘（通常显示为 `vdb`，KVM 虚拟化平台常见 `vda`/`vdb`；部分规格或本地盘机型显示为 `sdb`）。若挂载后仍看不到，需要在控制台确认磁盘状态为“已挂载”，再 `echo "- - -" > /sys/class/scsi_host/host0/scan` 重新扫描 SCSI 总线。',
      params: [
        { flag: '-f', desc: '显示文件系统类型、UUID 与挂载点，写 /etc/fstab 前必看' },
        { flag: '-p', desc: '显示设备完整路径（/dev/vdb1），方便直接复制进命令' },
        { flag: '-o <字段>', desc: '自选列，如 `-o NAME,SIZE,FSTYPE,MOUNTPOINT`' },
        { flag: '-l', desc: '树形改列表，输出更好 grep' },
        { flag: '-m', desc: '额外显示设备属主属组与权限模式，排查权限拒绝' },
        { flag: '-d', desc: '只看整盘不列分区，快速确认有没有未使用的裸盘' },
        { flag: '-S', desc: '显示 SCSI 层信息（HCTL、厂商型号），认盘用' },
        { flag: '-t', desc: '额外显示设备拓扑（磁盘类型、最低 IO 对齐），做性能调优时用' }
      ],
      examples: [
        { cmd: 'lsblk', desc: '看整体结构：哪块盘有多大、分了几个区、各自挂在哪' },
        { cmd: 'lsblk -f /dev/vdb', desc: '看 /dev/vdb 的文件系统类型与 UUID，用来写 fstab' },
        { cmd: 'lsblk -dp -o NAME,SIZE,TYPE,MODEL', desc: '只看裸盘清单与型号，确认新挂的云盘是哪一块' }
      ],
      notes: [
        '`lsblk` 的 UUID 列对 xfs/ext4 有效；swap 分区会显示为 `[SWAP]`，此时 `MOUNTPOINT` 是空的，属正常',
        '设备名（vdb/sdb）会随挂载顺序变化，重启后可能对调，所以 `/etc/fstab` 里要写 UUID 而不是设备名',
        '`lsblk -f` 只显示已挂载或已识别的文件系统；给裸盘做过 `mkfs` 但还没挂载时也能看到类型',
        '若新盘完全没出现，先确认云控制台里磁盘已挂载到该 ECS，再重新扫描 SCSI 总线，别急着重启系统'
      ],
      related: ['ls9-blkid', 'ls9-findmnt', 'ls9-fdisk', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man8/lsblk.8.html',
      tags: ['块设备', '分区', '云硬盘']
    },

    /* ---------- 5 / 65 ---------- */
    {
      id: 'ls9-blkid',
      name: 'blkid',
      alias: ['block id', 'UUID'],
      level: 2,
      syntax: 'blkid [选项] [设备]',
      summary: '查询块设备的 UUID、文件系统类型和卷标，写 /etc/fstab 时的取值工具。',
      desc: '直接读设备上的超级块标签，即使没挂载也能查。与 `lsblk -f` 的区别是：`blkid` 在未挂载时也会列出全部已格式化的块设备，并且能只看单个设备的 UUID，脚本里取值更方便。云盘场景下把 UUID 写进 `/etc/fstab` 是铁律，因为设备名会漂移。',
      params: [
        { flag: '-s <标签>', desc: '只输出指定标签，常用 `-s UUID` 或 `-s TYPE`' },
        { flag: '-o <格式>', desc: '输出格式，`-o value` 只打印值，适合脚本取值' },
        { flag: '-U <UUID>', desc: '反查：给出 UUID 找到对应设备，如 `blkid -U <设备UUID>`' },
        { flag: '-L <卷标>', desc: '按 LABEL 反查设备' },
        { flag: '-t <键=值>', desc: '按条件过滤，如 `-t TYPE=xfs` 列出所有 XFS 设备' },
        { flag: '-i', desc: '连带显示 IO 限制信息' },
        { flag: '-g', desc: '回收缓存（garbage collect），设备已移除但缓存还在时用' }
      ],
      examples: [
        { cmd: 'blkid /dev/vdb1', desc: '查到 /dev/vdb1 的 UUID 与 TYPE，直接抄进 fstab' },
        { cmd: 'blkid -s UUID -o value /dev/vdb1', desc: '只输出 UUID 字符串，可写进脚本拼 fstab 行' },
        { cmd: 'blkid -t TYPE=xfs', desc: '列出机器上所有 XFS 文件系统的设备' }
      ],
      notes: [
        '普通用户看不到全部信息，取 UUID 请用 root 或 sudo',
        'UUID 是格式化（`mkfs`）时生成的，重新格式化后 UUID 会变，fstab 里若用旧 UUID 会挂在开机阶段失败',
        '`blkid` 需要读设备，遇到 LVM 或正被独占的设备可能报错，此时改用 `lsblk -f` 更稳'
      ],
      related: ['ls9-lsblk', 'ls9-fstab', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man8/blkid.8.html',
      tags: ['UUID', '文件系统', 'fstab']
    },

    /* ---------- 6 / 65 ---------- */
    {
      id: 'ls9-findmnt',
      name: 'findmnt',
      alias: ['mount tree', '挂载关系'],
      level: 2,
      syntax: 'findmnt [选项] [设备|挂载点]',
      summary: '以树状结构展示当前挂载关系，可按挂载点、文件系统类型筛选。',
      desc: '比直接 `cat /proc/mounts` 可读得多，也能按条件反查“某个目录到底是不是独立挂载点”。排查“为什么写进 /data 却落到了根分区”这类问题时，`findmnt` 一眼就能看出 `/data` 有没有被单独挂载。`--verify` 还能预检 `/etc/fstab` 里的设备是否存在，适合改 fstab 前先验证。',
      params: [
        { flag: '-T <路径>', desc: '反查某路径所在的文件系统，如 `findmnt -T /data`' },
        { flag: '-t <类型>', desc: '按文件系统类型筛选，如 `-t nfs4` 只看 NFS 挂载' },
        { flag: '-o <字段>', desc: '自选输出列，如 `-o SOURCE,TARGET,FSTYPE,OPTIONS`' },
        { flag: '-D', desc: '列出已删除但仍在挂载表中的挂载点（配合 umount 排障）' },
        { flag: '--verify', desc: '校验 fstab 条目中的设备与挂载点，改 fstab 前做预检' },
        { flag: '-l', desc: '列表输出而不是树形，方便 grep' },
        { flag: '-n', desc: '不打印表头，脚本取值更省事' }
      ],
      examples: [
        { cmd: 'findmnt -T /data', desc: '确认 /data 是独立文件系统还是仅仅落在根分区下的普通目录' },
        { cmd: 'findmnt -t nfs4 -o TARGET,SOURCE,OPTIONS', desc: '列出所有 NFSv4 挂载及其挂载选项' },
        { cmd: 'findmnt --verify --verbose', desc: '改完 /etc/fstab 后先预检，比 `mount -a` 试错安全' }
      ],
      notes: [
        '`findmnt` 读的是内核挂载表，只反映“现在”，不代表重启后还成立；持久化要看 `/etc/fstab`',
        '容器里跑 `findmnt` 看到的是容器命名空间的挂载树，和宿主机不同',
        '用 `-D` 发现残留的已删除挂载点时，用 `umount -l` 清掉，否则可能挡住后续同名挂载'
      ],
      related: ['ls9-mount', 'ls9-lsblk', 'ls9-fstab'],
      docs: 'https://man7.org/linux/man-pages/man8/findmnt.8.html',
      tags: ['挂载', '排障', '树状']
    },

    /* ================= B. 分区与格式化 ================= */

    /* ---------- 7 / 65 ---------- */
    {
      id: 'ls9-fdisk',
      name: 'fdisk',
      alias: ['分区工具', 'sfdisk'],
      level: 2,
      syntax: 'fdisk [选项] <磁盘设备>',
      summary: '交互式管理磁盘分区表，支持 MBR 与 GPT，新建删除分区都用它。',
      desc: '经典分区工具，`fdisk /dev/vdb` 进入交互界面后用单字母命令操作：`n` 新建分区、`d` 删除分区、`p` 打印分区表、`t` 改分区类型、`w` 保存并退出、`q` 不保存退出。新建分区时第一个扇区保持默认（`2048`），可保证 4K 对齐，性能最好。超过 2TB 的云盘必须用 GPT，用 `g` 新建 GPT 分区表；MBR 最多只认 2TB 且主分区只有 4 个。',
      params: [
        { flag: '-l', desc: '列出所有磁盘的分区表，不改动任何数据' },
        { flag: '-l <设备>', desc: '只看指定磁盘的分区表与分区起始扇区' },
        { flag: '-u', desc: '以扇区为单位显示起止位置，确认 4K 对齐时用' },
        { flag: '-b <扇区大小>', desc: '指定逻辑扇区大小（512/1024/4096），云盘 4K 扇区机型才需要' },
        { flag: '-c', desc: '兼容模式（dos），关闭 GPT 支持以获得旧行为' },
        { flag: '-s <分区>', desc: '把分区大小（块数）打印到标准输出' },
        { flag: '--type=<类型>', desc: '创建分区表类型：`dos`（MBR）或 `gpt`（非交互建 GPT 时使用）' }
      ],
      examples: [
        { cmd: 'fdisk -l /dev/vdb', desc: '查看新数据盘容量与分区表类型，判断该用 MBR 还是 GPT' },
        { cmd: 'fdisk /dev/vdb', desc: '进入交互界面：n 建分区、p 查看、w 保存，保存后必须 partprobe 让内核重读分区表' },
        { cmd: 'echo -e "g\\nn\\n1\\n\\n\\nw" | fdisk /dev/vdb', desc: '非交互建 GPT 分区表并建一个占满全盘的分区，适合批量初始化脚本' }
      ],
      notes: [
        '`fdisk` 的分区操作在按 `w` 之前都只在内存里，`q` 退出等于什么都没做；按 `w` 立即改写分区表',
        '对正在挂载使用的磁盘改分区表属于高危操作，必须先 `umount`，否则会损坏文件系统',
        '保存分区表后内核未必立即感知，务必执行 `partprobe /dev/vdb` 或 `partx -u /dev/vdb`',
        'MBR 单盘上限 2TB、主分区最多 4 个；超过 2TB 的 EVS 盘请用 `parted`/`fdisk` 建 GPT',
        '不要用 `fdisk` 去动系统盘（如 /dev/vda），改错分区表会直接导致实例无法启动'
      ],
      related: ['ls9-parted', 'ls9-partprobe', 'ls9-mkfs-ext4', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man8/fdisk.8.html',
      tags: ['分区', 'GPT', 'MBR']
    },

    /* ---------- 8 / 65 ---------- */
    {
      id: 'ls9-parted',
      name: 'parted',
      alias: ['gpt', '大容量分区'],
      level: 2,
      syntax: 'parted [选项] <磁盘设备> <子命令> [参数]',
      summary: '支持 GPT 与 MBR 的分区工具，2TB 以上大容量云盘分区首选。',
      desc: '既能交互式操作也能一条命令搞定，脚本化比 `fdisk` 方便。核心三步是 `mklabel gpt` 建分区表、`mkpart` 建分区、`print` 查看结果。GPT 没有 2TB 单盘限制、主分区数量上限也远高于 MBR（Windows 之外一般可到 128 个），因此 2TB 以上的 EVS 数据盘一律用 GPT。',
      params: [
        { flag: 'mklabel <类型>', desc: '创建分区表，`gpt` 或 `msdos`；会清空原分区表，只对新盘做' },
        { flag: 'mkpart <名称> <起始> <结束>', desc: '建分区，单位可用百分比或容量，如 `mkpart data ext4 0% 100%`' },
        { flag: 'print', desc: '打印分区表与分区列表，含起始扇区的对齐情况' },
        { flag: 'rm <编号>', desc: '删除指定分区，不动其他分区' },
        { flag: '-l', desc: '列出所有块设备的分区表信息' },
        { flag: '-s', desc: '脚本模式，不询问直接执行；自动化脚本必须加，否则会卡在交互提示' },
        { flag: 'unit <单位>', desc: '切换显示单位，如 `unit GB` 或 `unit s`（扇区）' },
        { flag: 'align-check <类型> <编号>', desc: '检查分区是否满足最小/最优对齐，`optimal` 用于确认 4K 对齐' }
      ],
      examples: [
        { cmd: 'parted -s /dev/vdb mklabel gpt', desc: '把新数据盘初始化为 GPT 分区表（会清空该盘分区表，仅用于新盘）' },
        { cmd: 'parted -s /dev/vdb mkpart data ext4 0% 100%', desc: '创建一个从盘头到盘尾的 data 分区，自动 4K 对齐' },
        { cmd: 'parted /dev/vdb print', desc: '查看分区结果，确认 Size 与 File system 是否符合预期' }
      ],
      notes: [
        '`mklabel` 会直接重建分区表，盘上原有分区与数据全部丢失，执行前用 `lsblk` 再三确认设备名',
        '`parted` 不带 `-s` 时会进入交互模式并可能弹出警告等待输入，写进脚本会挂住，务必加 `-s`',
        'GPT 盘尾有备份分区表，所以 `mkpart` 不要吃到 100% 的最后一个扇区；用 `0% 100%` 让 parted 自己留余量',
        '改完分区表同样要 `partprobe` 让内核生效，链路上和 `fdisk` 一致',
        'Ubuntu 上 `parted` 对正在使用的设备改分区表会提示 warning，不要强行走 `Ignore`'
      ],
      related: ['ls9-fdisk', 'ls9-partprobe', 'ls9-mkfs-xfs', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man8/parted.8.html',
      tags: ['分区', 'GPT', '大容量']
    },

    /* ---------- 9 / 65 ---------- */
    {
      id: 'ls9-partprobe',
      name: 'partprobe',
      alias: ['partx', '重读分区表'],
      level: 2,
      syntax: 'partprobe [选项] [设备]',
      summary: '通知内核重新读取分区表，让新分区无需重启就出现在 /dev 下。',
      desc: '`fdisk`/`parted` 写完分区表后，内核里的分区信息可能还是旧的，表现为 `/dev/vdb1` 不存在或 `lsblk` 看不到新分区。`partprobe` 就是让内核同步一次。云盘在线扩容场景同样要用：控制台把磁盘从 100G 扩到 200G 后，先 `growpart` 扩分区，再 `partprobe`/`partx` 刷新，然后才轮到 `resize2fs`/`xfs_growfs` 扩文件系统。',
      params: [
        { flag: '<设备>', desc: '指定磁盘，如 `partprobe /dev/vdb`；不带参数则刷新所有设备' },
        { flag: '-d', desc: '只显示而不通知内核，用于预演会做哪些变更' },
        { flag: '-s', desc: '打印各设备的分区摘要信息' },
        { flag: '-h', desc: '显示帮助' }
      ],
      examples: [
        { cmd: 'partprobe /dev/vdb', desc: '分区表改完后刷新内核视图，之后 lsblk 才能看到 /dev/vdb1' },
        { cmd: 'partprobe -s', desc: '打印所有设备的分区摘要，快速核对内核识别到的分区' },
        { cmd: 'partx -u /dev/vdb', desc: 'partprobe 无效时的替代方案，强制更新指定设备的分区表' }
      ],
      notes: [
        '分区正在被挂载使用时 `partprobe` 可能报 `Device or resource busy`，此时必须先 `umount`',
        '极少数内核/驱动组合下通知不生效，只能对单块盘 `partx -u` 或卸载重挂，实在不行才考虑重启',
        '`partprobe` 只让内核重读分区表，不会修改磁盘内容，本身是安全操作，但没有分区表可读时会报错'
      ],
      related: ['ls9-fdisk', 'ls9-parted', 'ls9-lvm-extend', 'ls9-growpart'],
      docs: 'https://man7.org/linux/man-pages/man8/partprobe.8.html',
      tags: ['分区', '内核', '扩容']
    },

    /* ---------- 10 / 65 ---------- */
    {
      id: 'ls9-mkfs-ext4',
      name: 'mkfs.ext4',
      alias: ['mke2fs', '格式化'],
      level: 2,
      syntax: 'mkfs.ext4 [选项] <分区设备>',
      summary: '把分区格式化为 ext4 文件系统，Linux 上兼容性最好的默认选择。',
      desc: 'CentOS/RHEL 与 Ubuntu 都原生支持，格式化后立刻可用，且支持在线扩容与缩容（缩容需先卸载）。`mkfs` 系列只是 `mkfs.<类型>` 的前端，本质上 `mkfs.ext4` 就是 `mke2fs -t ext4`。云盘数据盘格式化为 ext4 后，默认会保留约 5% 空间给 root，这在数据盘上往往没必要，可用 `tune2fs -m 1` 释放。',
      params: [
        { flag: '-t ext4', desc: '显式指定文件系统类型（`mkfs -t ext4` 的写法）' },
        { flag: '-L <卷标>', desc: '设置卷标，方便 `blkid` 按 LABEL 查找' },
        { flag: '-b <块大小>', desc: '块大小（1024/2048/4096），默认 4096 适合绝大多数场景' },
        { flag: '-m <百分比>', desc: 'root 预留空间百分比，默认 5；纯数据盘可设 `-m 1`' },
        { flag: '-i <字节数>', desc: '每多少字节一个 inode，小文件极多时调小以避免 inode 耗尽' },
        { flag: '-N <数量>', desc: '直接指定 inode 总数，与 `-i` 互斥' },
        { flag: '-E <特性>', desc: '扩展参数，如 `-E stride=...,stripe_width=...` 配合 RAID 条带优化' },
        { flag: '-F', desc: '强制格式化，设备上已有文件系统时必须加（破坏性）' }
      ],
      examples: [
        { cmd: 'mkfs.ext4 -L data /dev/vdb1', desc: '把新分区格式化为 ext4 并打上 data 卷标' },
        { cmd: 'mkfs.ext4 -m 1 -L data /dev/vdb1', desc: '数据盘把 root 预留空间降到 1%，多出约 4% 可用容量' },
        { cmd: 'mkfs.ext4 -F /dev/vdb1', desc: '盘上已有文件系统时强制重新格式化，原数据全部丢失' }
      ],
      notes: [
        '`mkfs` 是不可逆操作，会把目标设备上原有数据全部清空；执行前用 `lsblk` 与 `df -h` 双重确认设备名，尤其别把 /dev/vda 打成 /dev/vdb',
        '格式化要选分区（/dev/vdb1）而不是整盘（/dev/vdb）；直接格式化整盘虽可用，但后续无法再分区',
        'ext4 支持缩容，但缩容前必须先 `e2fsck` 再 `resize2fs`，且必须在卸载状态做',
        '刚格式化的盘还没挂载时 `df -h` 看不到，属正常；用 `lsblk -f` 确认'
      ],
      related: ['ls9-mkfs-xfs', 'ls9-tune2fs', 'ls9-mount', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man8/mke2fs.8.html',
      tags: ['格式化', 'ext4', '文件系统']
    },

    /* ---------- 11 / 65 ---------- */
    {
      id: 'ls9-mkfs-xfs',
      name: 'mkfs.xfs',
      alias: ['xfs', '格式化'],
      level: 2,
      syntax: 'mkfs.xfs [选项] <分区设备>',
      summary: '把分区格式化为 XFS 文件系统，大容量高并发场景的性能之选。',
      desc: 'CentOS 7/8 与 RHEL 的默认文件系统，大文件吞吐与并发元数据操作表现优于 ext4，适合数据库、大数据、日志量大且文件大的数据盘。代价是 **XFS 只能扩大，不能缩小**，一旦格式化就无法把文件系统调小，规划容量时要留足余量。扩容用 `xfs_growfs`，且只能在挂载状态下执行。',
      params: [
        { flag: '-f', desc: '强制覆盖已有文件系统（破坏性，第二次格式化必须加）' },
        { flag: '-L <卷标>', desc: '设置卷标，便于按 LABEL 定位设备' },
        { flag: '-b size=<值>', desc: '块大小，默认 4096，一般无需改' },
        { flag: '-d agcount=<值>', desc: '分配组数量，大容量盘或高并发可调优' },
        { flag: '-l size=<值>', desc: '日志区大小，如 `-l size=512m`，写密集场景可加大' },
        { flag: '-m crc=1', desc: '启用 CRC 校验（新版默认开启），提升元数据可靠性' },
        { flag: '-n ftype=1', desc: '目录里记录文件类型，overlayfs/Docker 场景要求 `ftype=1`' }
      ],
      examples: [
        { cmd: 'mkfs.xfs -f -L data /dev/vdb1', desc: '把新分区格式化为 XFS，`-f` 用于盘上已有文件系统时强制覆盖' },
        { cmd: 'mkfs.xfs -f -n ftype=1 /dev/vdb1', desc: '要在该盘上跑 Docker/overlayfs 时必须带 `ftype=1`' },
        { cmd: 'xfs_info /data', desc: '格式化并挂载后核对块大小、agcount 等实际参数' }
      ],
      notes: [
        '**XFS 无法缩小文件系统**：`resize2fs` 对 XFS 无效，`xfs_growfs` 只支持扩大；容量规划必须一次到位',
        '`mkfs.xfs` 默认拒绝覆盖已有文件系统，会提示 `is not a valid block device or ... already contains a filesystem`，强行覆盖要加 `-f`',
        'XFS 扩容只能在挂载状态下用 `xfs_growfs <挂载点>`（不是设备名），且要求分区已经先扩大',
        'RHEL/CentOS 7 之上若要用 XFS 做 Docker 存储驱动，务必 `ftype=1`，否则 overlay2 不可用',
        'XFS 的 `dump`/`fsck` 体系与 ext4 不同，修复工具是 `xfs_repair`（必须卸载执行），不能用 `fsck.ext4`'
      ],
      related: ['ls9-mkfs-ext4', 'ls9-xfs-growfs', 'ls9-mount', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man8/mkfs.xfs.8.html',
      tags: ['格式化', 'XFS', '文件系统']
    },

    /* ---------- 12 / 65 ---------- */
    {
      id: 'ls9-mkswap',
      name: 'mkswap',
      alias: ['swap', '交换分区'],
      level: 2,
      syntax: 'mkswap [选项] <设备|文件>',
      summary: '把分区或文件初始化为 swap 交换空间以扩充内存，常用于内存不足时救急。',
      desc: 'swap 提供内存不足时的换出空间，但性能远低于物理内存，只是兜底手段。云主机默认多数不开 swap，小规格 ECS 跑编译或数据库时可以加一块。除了专用分区，也可以用一个文件做 swapfile，扩容更灵活。相对地，启用与关闭 swap 用 `swapon` 与 `swapoff`，本条的示例一并给出。',
      params: [
        { flag: '-L <卷标>', desc: '设置 swap 卷标，便于 `/etc/fstab` 里按 LABEL 挂载' },
        { flag: '-U <UUID>', desc: '指定 UUID，一般不用手工设' },
        { flag: '-p <优先级>', desc: '设置优先级，多块 swap 时数值大的先用' },
        { flag: '-f', desc: '强制在整盘或非预期设备上创建，慎用' },
        { flag: '--check', desc: '只检查设备上是否已有 swap 签名，不做修改' },
        { flag: '<文件>', desc: '支持直接对文件初始化，如 `mkswap /swapfile`' }
      ],
      examples: [
        { cmd: 'mkswap /dev/vdc1 && swapon /dev/vdc1', desc: '把 /dev/vdc1 做成 swap 并立即启用' },
        { cmd: 'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile', desc: '用文件方式加 2G swap，改大小只需重建文件' },
        { cmd: 'swapon --show && free -h', desc: '确认 swap 已生效并查看总交换空间' }
      ],
      notes: [
        '`mkswap` 会覆盖目标设备/文件上的原有数据，执行前务必确认设备名与文件路径',
        'swapfile 的权限必须是 `600`，否则 `swapon` 会拒绝启用并提示不安全',
        'CentOS 7 与 Ubuntu 16.04 之后必须把 swap 写进 `/etc/fstab` 才能开机自动启用；CentOS 8 / RHEL 8 起 swap 已不再是强制项，`free -h` 显示 0 不代表故障',
        '云主机上不要在系统盘上做 swap：系统盘 IO 与业务争抢，反而拖慢实例；要加就挂独立 EVS 数据盘',
        '持久化 fstab 写法：`UUID=<swap分区UUID> none swap defaults 0 0`，文件方式写 `/swapfile none swap defaults 0 0`'
      ],
      related: ['ls9-swapon', 'ls9-fstab', 'ls9-blkid', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man8/mkswap.8.html',
      tags: ['swap', '内存', '交换空间']
    },

    /* ---------- 13 / 65 ---------- */
    {
      id: 'ls9-swapon',
      name: 'swapon / swapoff',
      alias: ['swap on', '关闭swap'],
      level: 2,
      syntax: 'swapon [选项] [设备|文件]　/　swapoff [选项] [设备|文件]',
      summary: '启用与关闭 swap 交换空间，并可用 -a 一次挂载 fstab 中所有交换项。',
      desc: '`swapon` 激活一个已用 `mkswap` 初始化过的设备或文件，`swapoff` 关闭它并把换出内容读回内存。`swapon -a` 会读取 `/etc/fstab` 里所有 swap 条目并全部启用，开机流程就是这么做的，所以持久化只需写好 fstab。Kubernetes 节点要求关闭 swap（`swapoff -a`），否则 kubelet 会拒绝启动。',
      params: [
        { flag: '-a', desc: '启用 /etc/fstab 里所有 swap 条目，等价于“全部打开”' },
        { flag: '-s', desc: '显示当前已启用的 swap 摘要（新版用 `--show`）' },
        { flag: '--show[=列表]', desc: '列出 swap 设备，可指定列如 `--show=NAME,TYPE,SIZE,USED,PRIO`' },
        { flag: '-p <优先级>', desc: '临时指定优先级，数值越大越优先使用' },
        { flag: '-v', desc: 'verbose，显示每个设备是否被跳过及原因' },
        { flag: '-U <UUID>', desc: '按 UUID 启用指定 swap 设备' },
        { flag: '--all（swapoff）', desc: '`swapoff -a` 关闭全部 swap，但不会改 fstab，重启后仍会启用' }
      ],
      examples: [
        { cmd: 'swapon --show', desc: '查看当前生效的 swap 设备、大小与使用量' },
        { cmd: 'swapon -a', desc: '按 /etc/fstab 启用全部 swap 条目，验证新加的 swap 分区是否配置正确' },
        { cmd: 'swapoff -a', desc: '关闭所有 swap：Kubernetes 节点初始化前的标准动作，注意内存必须够，否则会 OOM' }
      ],
      notes: [
        '`swapoff -a` 会把已换出的页全部拉回物理内存，内存不足时可能触发 OOM Killer 杀掉业务进程，内存已经吃紧时不要执行',
        '`swapon -a` 只认 `/etc/fstab` 里的条目，用文件做 swap 时若忘写 fstab，重启后 swap 就没了',
        '临时 `swapon` 的配置重启后失效；要长期生效必须写 fstab 或用 systemd unit 管理',
        'Kubernetes 节点必须 `swapoff -a` 并在 fstab 里注释掉 swap 行，只做一次 `swapoff` 重启后会被 fstab 重新打开'
      ],
      related: ['ls9-mkswap', 'ls9-fstab', 'ls9-df'],
      docs: 'https://man7.org/linux/man-pages/man8/swapon.8.html',
      tags: ['swap', '内存', '持久化']
    },

    /* ================= C. 挂载与持久化 ================= */

    /* ---------- 14 / 65 ---------- */
    {
      id: 'ls9-mount',
      name: 'mount',
      alias: ['挂载', 'mount -o'],
      level: 2,
      syntax: 'mount [选项] [-t 类型] [-o 选项] <设备> <挂载点>',
      summary: '把磁盘、分区或网络存储挂到目录树上，是数据盘能写入的前提。',
      desc: '一次 `mount` 只在当前生效，重启就没了，所以生产上必须配 `/etc/fstab`。常用挂载选项集中在 `-o` 里：`noatime` 关闭访问时间更新以减少写放大（数据库与高写盘强烈建议）、`nofail` 表示设备不存在也不阻塞开机、`ro` 只读保护、`remount` 在不卸载的前提下改选项、`loop` 把 ISO 文件当块设备挂。云主机挂载 EVS 数据盘的典型命令是 `mount /dev/vdb1 /data`。',
      params: [
        { flag: '-t <类型>', desc: '指定文件系统类型，如 ext4、xfs、nfs、iso9660；多数情况可省略自动识别' },
        { flag: '-o <选项>', desc: '挂载选项，逗号分隔，如 `-o noatime,nofail`' },
        { flag: '-o ro', desc: '只读挂载，救援与巡检时避免误改数据' },
        { flag: '-o remount', desc: '重新挂载已挂载的文件系统，用来临时改选项，如 `-o remount,rw /`' },
        { flag: '-o loop', desc: '把普通文件当块设备挂，挂 ISO 镜像就用它' },
        { flag: '-a', desc: '按 /etc/fstab 挂载所有条目（已挂载的会跳过），改完 fstab 必须验证' },
        { flag: '-a -t <类型>', desc: '只挂 fstab 中指定类型的条目，如 `mount -a -t nfs`' },
        { flag: '-l', desc: '列表形式显示当前挂载（含 LABEL），不带参数时等价于查看挂载表' }
      ],
      examples: [
        { cmd: 'mount /dev/vdb1 /data', desc: '把新数据盘分区挂到 /data，临时生效，重启后失效' },
        { cmd: 'mount -o remount,rw /', desc: '根分区误变只读时在线恢复可写，不必重启' },
        { cmd: 'mount -t iso9660 -o loop /tmp/CentOS-7.iso /mnt/iso', desc: '挂载 ISO 镜像查看内容，做本地 yum 源时很常用' },
        { cmd: 'mount -a', desc: '按 /etc/fstab 全部挂载，写完 fstab 后必须跑一次验证，避免开机起不来' }
      ],
      notes: [
        '`mount` 不带任何参数执行会显示挂载表，但那份输出不带 UUID，排查“重启后盘还在不在”要结合 `/etc/fstab` 看',
        '挂载点必须先 `mkdir` 出来，否则报 `mount point does not exist`',
        '往挂载点里写数据前先确认挂载成功：若 `mount` 失败但你没注意，数据会写进根分区下那个空目录，把系统盘写满',
        '`mount -a` 是检查 fstab 的安全方式；若 fstab 写错，`mount -a` 会立刻报错，比等到重启进 emergency mode 好得多',
        '`noatime` 和高并发写盘组合能显著减少元数据写入；`nofail` 建议给所有非系统必需的数据盘加上'
      ],
      related: ['ls9-umount', 'ls9-fstab', 'ls9-findmnt', 'ls9-nfs-client', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man8/mount.8.html',
      tags: ['挂载', 'fstab', '数据盘']
    },

    /* ---------- 15 / 65 ---------- */
    {
      id: 'ls9-umount',
      name: 'umount',
      alias: ['卸载', 'target is busy'],
      level: 2,
      syntax: 'umount [选项] <设备|挂载点>',
      summary: '卸载已挂载的文件系统，遇到 busy 时用 lsof 与 fuser 找占用进程。',
      desc: '卸载前内核会回写脏页，正常卸载是数据安全的第一道保障。最常见的报错是 `target is busy`（或 `device is busy`），含义是有进程的工作目录、打开的文件或挂载点仍在被使用。标准处理顺序是：先 `lsof +D <挂载点>` 或 `fuser -m <挂载点>` 找出占用的 PID，让对应服务退出或切走工作目录，再正常 `umount`。`-l` 与 `-f` 是兜底手段，能不用就不用。',
      params: [
        { flag: '-l', desc: 'lazy 卸载：立刻从目录树摘除，等引用归零后再真正清理，可能残留挂载' },
        { flag: '-f', desc: 'force：强制卸载，主要用于失效的 NFS 挂载；对本地盘可能造成数据丢失' },
        { flag: '-R', desc: '递归卸载挂载点下的所有子挂载，容器与 bind mount 场景常用' },
        { flag: '-t <类型>', desc: '只卸载指定类型的文件系统，可配合 `-a`' },
        { flag: '-a', desc: '卸载 /etc/mtab 中所有已挂载文件系统（除 / 与 /proc 等）' },
        { flag: '-n', desc: '不更新 /etc/mtab，只用于 mtab 已损坏的极端情况' },
        { flag: '-v', desc: 'verbose，显示卸载过程信息' }
      ],
      examples: [
        { cmd: 'umount /data', desc: '正常卸载 /data，卸载前会回写数据，能成功就不要用 -f' },
        { cmd: 'lsof +D /data', desc: '列出 /data 目录下所有被打开的文件，定位是谁占着不放' },
        { cmd: 'fuser -m -v /data', desc: '列出占用该文件系统的进程 PID，再决定停服务还是结束进程' },
        { cmd: 'umount -l /data', desc: '实在无法停服务时的兜底：lazy 卸载，业务无感但旧句柄仍指向旧盘' }
      ],
      notes: [
        '看到 `target is busy` 不要直接上 `-f`：先用 `lsof +D /data` 与 `fuser -m /data` 找进程，强卸可能丢数据或让进程读到旧数据',
        '“自己的 shell 正 cd 在挂载点里”也会导致 busy，`cd /` 之后再卸载是最常见的低级原因',
        '`umount -l` 之后 `df -h` 可能还显示该文件系统，实际已脱离目录树，重新挂载同名设备前先确认干净',
        'NFS 服务端失联时本地 `umount` 会卡住，此时只能用 `umount -f` 或 `umount -l` 处理',
        '云盘要卸载（从 ECS 分离）前，必须在系统内先 `umount`，否则文件系统可能残留脏数据导致再次挂载失败'
      ],
      related: ['ls9-mount', 'ls9-findmnt', 'ls9-df', 'ls9-fstab'],
      docs: 'https://man7.org/linux/man-pages/man8/umount.8.html',
      tags: ['卸载', '排障', 'busy']
    },

    /* ---------- 16 / 65 ---------- */
    {
      id: 'ls9-fstab',
      name: '/etc/fstab',
      alias: ['文件系统表', '开机自动挂载'],
      level: 3,
      syntax: '<设备>  <挂载点>  <文件系统类型>  <挂载选项>  <dump>  <fsck顺序>',
      summary: '开机自动挂载的配置文件，写错会导致系统起不来进 emergency mode。',
      desc: '六个字段依次是：设备（推荐写 `UUID=`）、挂载点、文件系统类型、挂载选项、dump 备份标志（一般 0）、fsck 检查顺序（根分区 1，其他 2，不检查 0）。用 UUID 而不是 `/dev/vdb1`，因为设备名会随挂载顺序漂移；非系统必需的数据盘一定要加 `nofail`，否则云盘没挂上或摘除后，实例会卡在启动阶段无法进入系统。改完必须用 `mount -a` 验证。',
      params: [
        { flag: '字段1 设备', desc: '写 `UUID=<值>` 最稳；也可写设备名或 LABEL，但设备名重启后可能变' },
        { flag: '字段2 挂载点', desc: '必须已存在的绝对路径目录，如 `/data`，不存在会挂载失败' },
        { flag: '字段3 类型', desc: 'ext4、xfs、nfs、swap、iso9660 等，需与实际格式化类型一致' },
        { flag: '字段4 选项', desc: '`defaults` 是默认组合；常加 `noatime`、`nofail`；NFS 需写 `_netdev`' },
        { flag: '字段5 dump', desc: '是否被 dump 备份，现代系统一律填 `0`' },
        { flag: '字段6 pass', desc: 'fsck 顺序，根分区 `1`、其他本地盘 `2`、不检查填 `0`（如 NFS 与 swap）' },
        { flag: 'nofail', desc: '设备不存在时只报错继续启动，绝不因此进 emergency mode' },
        { flag: '_netdev', desc: '标记为网络设备，等网络就绪后再挂载，NFS 条目必加' }
      ],
      examples: [
        { cmd: 'blkid -s UUID -o value /dev/vdb1', desc: '先取到新盘的 UUID，fstab 里要用它而不是设备名' },
        { cmd: 'UUID=<数据盘UUID> /data ext4 defaults,noatime,nofail 0 2', desc: '一条标准数据盘条目：UUID 定位、noatime 减写、nofail 保开机' },
        { cmd: 'mount -a && df -h /data', desc: '改完 fstab 的强制验证步骤，能挂上再重启才安全' },
        { cmd: 'findmnt --verify --verbose', desc: '重启前的二次预检，会指出 fstab 里的设备与挂载点问题' }
      ],
      notes: [
        '**fstab 写错的最严重后果是系统起不来**：启动时会进 `emergency mode`，需要输入 root 密码后 `mount -o remount,rw /` 再修正该行才能继续启动，云主机若没配好控制台登录会很麻烦',
        '**所有非系统必需的数据盘条目都必须加 `nofail`**，这是云主机上最常见的自锁原因：磁盘摘了、没插上、UUID 变了，机器就起不来',
        'UUID 在重新格式化后会变化，重新 `mkfs` 过的盘务必同步更新 fstab，否则同上',
        '修改前先备份：`cp /etc/fstab /etc/fstab.bak`；改完一定 `mount -a` 验证，报错不要重启，立即改回',
        'NFS 条目要加 `_netdev`，还要注意 `bg`/`soft`/`timeo` 等选项，否则服务端不可达时启动会长时间阻塞',
        '别用 `defaults,noatime` 之外的花哨组合一次性写到系统盘条目上，系统盘改动风险最高'
      ],
      related: ['ls9-mount', 'ls9-blkid', 'ls9-lsblk', 'ls9-systemd-mount', 'ls9-new-disk-flow'],
      docs: 'https://man7.org/linux/man-pages/man5/fstab.5.html',
      tags: ['fstab', '开机挂载', 'UUID']
    },

    /* ---------- 17 / 65 ---------- */
    {
      id: 'ls9-systemd-mount',
      name: 'systemd mount unit',
      alias: ['mount unit', '.mount'],
      level: 3,
      syntax: '/etc/systemd/system/<挂载点转义名>.mount',
      summary: '用 systemd unit 管理挂载，可按需挂载并让依赖服务等挂载就绪再启动。',
      desc: 'unit 名就是把挂载点路径的 `/` 换成 `-` 并去掉首字符，`/data` 对应 `data.mount`，`/data/log` 对应 `data-log.mount`。相比 fstab 的好处是能用 `systemctl` 启停、查看状态，并让业务服务用 `RequiresMountsFor=` 或 `After=` 明确依赖挂载。fstab 的条目开机时也会被 systemd 转换成对应的 .mount unit，两者同时配置同一挂载点会冲突。',
      params: [
        { flag: '[Unit]', desc: '单元描述与依赖，`After=network-online.target` 等' },
        { flag: 'What=', desc: '要挂载的设备，如 `/dev/disk/by-uuid/<UUID>`' },
        { flag: 'Where=', desc: '挂载点绝对路径，必须与 unit 文件名一致' },
        { flag: 'Type=', desc: '文件系统类型，如 ext4、xfs、nfs4' },
        { flag: 'Options=', desc: '挂载选项，等价于 fstab 第四字段' },
        { flag: 'WantedBy=', desc: '一般写 `multi-user.target`，enable 后开机自动挂载' },
        { flag: 'x-systemd.automount', desc: 'fstab 中写法：转成 automount，实现按需挂载' }
      ],
      examples: [
        { cmd: 'systemctl daemon-reload && systemctl enable --now data.mount', desc: '重载配置并立即挂载 /data，同时设为开机自动' },
        { cmd: 'systemctl status data.mount', desc: '查看挂载 unit 的状态与失败原因，比翻 fstab 报错清楚' },
        { cmd: 'systemctl list-units --type=mount', desc: '列出当前所有挂载 unit 及其状态' }
      ],
      notes: [
        'unit 文件名必须由挂载点按转义规则生成，名字写错时 `enable` 不报错但开机不会挂载，用 `systemd-escape -p /data/log` 生成',
        '改完 unit 文件必须 `systemctl daemon-reload`，否则改动不生效',
        '同一个挂载点不要同时写 fstab 和 .mount unit，会相互覆盖导致行为不可预期',
        '想省事可以在 fstab 第四字段加 `x-systemd.automount`，由 systemd 自动生成 automount unit，不必手写'
      ],
      related: ['ls9-fstab', 'ls9-autofs', 'ls9-mount'],
      docs: 'https://man7.org/linux/man-pages/man5/systemd.mount.5.html',
      tags: ['systemd', '挂载', '开机']
    },

    /* ---------- 18 / 65 ---------- */
    {
      id: 'ls9-autofs',
      name: 'autofs',
      alias: ['按需挂载', 'automount'],
      level: 3,
      syntax: 'systemctl start autofs　（配置：/etc/auto.master 与 map 文件）',
      summary: '按需自动挂载：访问目录时才挂载，闲置超时后自动卸载，省心又省资源。',
      desc: '主要用在家目录、NFS 共享、以及不常访问的大容量存储上。配置分两层：`/etc/auto.master` 定义“父目录 + 映射文件”，映射文件里定义“子目录 + 挂载选项 + 设备”。父目录由 autofs 自动创建，用户 cd 进子目录时才真正挂载，空闲超时（默认 300 秒）后自动卸载。相比 fstab，它的优势是服务端/设备暂时不可用也不会拖住开机。',
      params: [
        { flag: '/etc/auto.master', desc: '主配置：`<父目录> <映射文件> [超时秒数]`，如 `/mnt/nfs /etc/auto.nfs --timeout=60' },
        { flag: '映射文件条目', desc: '`<子目录名> -<选项> <设备>[:<导出目录>]`，如 `data -rw,soft 192.168.1.10:/data' },
        { flag: '--timeout=<秒>', desc: '空闲多久后自动卸载，默认 300，按需调小或调大' },
        { flag: '--ghost', desc: '预先建立占位目录，`ls` 父目录时能看到子挂载点' },
        { flag: '-fstype=', desc: '显式指定文件系统类型，如 `-fstype=nfs4`' },
        { flag: '/etc/auto.master.d/', desc: '把额外配置拆成独立文件放在该目录，便于管理' }
      ],
      examples: [
        { cmd: 'yum install -y autofs && systemctl enable --now autofs', desc: 'CentOS 上安装并启用 autofs（Ubuntu 用 `apt install autofs`）' },
        { cmd: 'echo "/mnt/nfs /etc/auto.nfs --timeout=60" >> /etc/auto.master && echo "data -rw,soft 192.168.1.10:/data" > /etc/auto.nfs', desc: '配置：访问 /mnt/nfs/data 时自动挂载远端共享，空闲 60 秒卸载' },
        { cmd: 'systemctl reload autofs && ls /mnt/nfs/data', desc: '重载配置并触发一次按需挂载，验证映射是否生效' }
      ],
      notes: [
        '父目录不要手工 `mkdir` 后再往里放东西：autofs 接管该目录后，里面原有的本地文件会被“遮住”看不见',
        '改完配置要 `systemctl reload autofs`（不是 restart），否则新映射不生效',
        '调完超时时间要观察业务：小于业务访问间隔会导致频繁挂载卸载，反而增加开销',
        'NFS 场景建议在映射选项里加 `soft`，避免服务端无响应时访问进程永久卡住'
      ],
      related: ['ls9-nfs-client', 'ls9-mount', 'ls9-systemd-mount'],
      docs: 'https://man7.org/linux/man-pages/man5/autofs.5.html',
      tags: ['按需挂载', 'NFS', '自动化']
    },

    /* ---------- 19 / 65 ---------- */
    {
      id: 'ls9-nfs-client',
      name: 'mount -t nfs（客户端）',
      kind: 'recipe',
      alias: ['nfs mount', 'showmount', '网络文件系统'],
      level: 3,
      syntax: 'showmount -e <NFS服务端IP>　/　mount -t nfs [-o vers=4] <服务端IP>:<导出目录> <本地挂载点>',
      summary: '把远端 NFS 共享目录挂到本地，用 showmount 先确认服务端导出了什么。',
      desc: '典型流程是：先用 `showmount -e` 看服务端导出了哪些目录、允许哪些网段访问，再 `mount -t nfs` 挂上，最后写进 `/etc/fstab` 持久化。NFSv4 只用 2049 端口且内置锁与挂载协议，比 v3 少一堆辅助端口，云上跨可用区互通时优先 `vers=4`。跨网络挂载一定要加 `_netdev` 与 `nofail`，否则服务端不可达会影响本机启动。',
      params: [
        { flag: '-e <服务端>', desc: 'showmount 列出服务端导出的目录及允许的客户端' },
        { flag: '-t nfs', desc: '指定挂载类型，NFSv4 也可以写 `-t nfs4`' },
        { flag: '-o vers=4', desc: '强制使用 NFSv4 协议，推荐 `vers=4.1` 或 `vers=4.2`' },
        { flag: '-o soft/hard', desc: '`hard` 会无限重试（默认，数据安全）；`soft` 超时报错返回，避免进程卡死' },
        { flag: '-o timeo=<0.1秒>', desc: '超时时间，软挂载时可调小，如 `timeo=50` 表示 5 秒' },
        { flag: '-o rsize/wsize=<字节>', desc: '读写块大小，默认 1M，大文件传输可保持默认或调优' },
        { flag: '-o _netdev', desc: '等待网络就绪后再挂载，写 fstab 时必加' },
        { flag: '-o nolock', desc: '禁用文件锁，部分老旧服务端或容器场景需要' }
      ],
      examples: [
        { cmd: 'showmount -e 192.168.1.10', desc: '查看服务端导出了哪些目录以及允许的客户端网段' },
        { cmd: 'mount -t nfs -o vers=4 192.168.1.10:/data /mnt/nfs', desc: '以 NFSv4 挂载远端 /data 到本地 /mnt/nfs' },
        { cmd: '192.168.1.10:/data /mnt/nfs nfs4 defaults,_netdev,nofail,soft,timeo=50 0 0', desc: '写入 /etc/fstab 的持久化写法，`_netdev` 与 `nofail` 缺一不可' },
        { cmd: 'df -hT -t nfs4', desc: '确认 NFS 挂载已生效并查看容量' }
      ],
      notes: [
        '挂载前先用 `showmount -e` 确认导出与网段授权，服务端 `/etc/exports` 没放行你的 IP 时报 `access denied by server`',
        '云上跨安全组/VPC 访问要放通 2049/TCP（NFSv3 还需 111 与 mountd 端口），网络不通是 NFS 挂载失败的第一大原因',
        'fstab 里漏了 `_netdev` 或 `nofail`，服务端一挂掉本机就可能卡在启动阶段',
        '服务端失联时 `umount` 普通卸载会卡住，用 `umount -f` 或 `umount -l` 处理',
        '生产上慎用 `soft`：软挂载在超时后返回错误，可能导致应用写数据静默失败；`hard` + `intr` 通常更安全'
      ],
      related: ['ls9-nfs-server', 'ls9-mount', 'ls9-autofs', 'ls9-fstab'],
      docs: 'https://man7.org/linux/man-pages/man5/nfs.5.html',
      tags: ['NFS', '共享存储', '挂载']
    },

    /* ---------- 20 / 65 ---------- */
    {
      id: 'ls9-nfs-server',
      name: 'exportfs / /etc/exports',
      alias: ['nfs server', 'nfs 服务端'],
      level: 3,
      syntax: 'exportfs [-a] [-v] [-o 选项]　（配置：/etc/exports）',
      summary: '配置并导出 NFS 共享目录，让其他主机能挂载本机的指定路径。',
      desc: '`/etc/exports` 每行格式是“目录 + 客户端(选项)”，例如 `/data 192.168.1.0/24(rw,sync,no_root_squash)`。改完不需要重启服务，`exportfs -ra` 重新导出即可。服务端需要 nfs-utils（CentOS：`yum install nfs-utils`；Ubuntu：`apt install nfs-kernel-server`），并放通 2049 端口与相关 RPC 端口。云上建议用安全组限制来源网段，别对 0.0.0.0/0 导出。',
      params: [
        { flag: '-a', desc: '导出或取消导出 /etc/exports 中的全部条目' },
        { flag: '-r', desc: '重新导出：先取消再按 exports 重新导出，改配置后用 `-ra`' },
        { flag: '-v', desc: 'verbose，把导出过程与最终结果打印出来' },
        { flag: '-u <目录>', desc: '取消导出指定目录，不改文件内容' },
        { flag: '-s', desc: '以 `/etc/exports` 的写法显示当前导出列表，便于核对' },
        { flag: 'rw / ro', desc: 'exports 选项：读写或只读导出' },
        { flag: 'sync / async', desc: '`sync` 落盘后才响应（更安全），`async` 性能高但异常掉电有丢数据风险' },
        { flag: 'no_root_squash', desc: '允许客户端 root 保留 root 权限（有安全风险，默认是 root_squash 压成 nobody）' }
      ],
      examples: [
        { cmd: 'yum install -y nfs-utils && systemctl enable --now nfs-server', desc: 'CentOS 上安装并启动 NFS 服务端（Ubuntu 用 `apt install nfs-kernel-server` 与 `nfs-kernel-server` 服务名）' },
        { cmd: 'echo "/data 192.168.1.0/24(rw,sync,no_subtree_check)" >> /etc/exports && exportfs -ra', desc: '只放行内网网段读写导出 /data，改完立即重新导出' },
        { cmd: 'exportfs -v', desc: '核对当前导出列表与实际生效的选项，排障时先看它' }
      ],
      notes: [
        '`no_root_squash` 会让客户端 root 在服务端也是 root，只在完全可信的内网使用，公网暴露等于把文件系统交出去',
        '`firewalld` 环境下需放通 nfs 服务：`firewall-cmd --add-service=nfs --permanent && firewall-cmd --reload`；NFSv3 还要放通 rpc-bind 与 mountd',
        '改 `/etc/exports` 后不执行 `exportfs -ra` 不生效；`systemctl reload nfs-server` 也可以',
        '云主机上导出目录若在数据盘上，记得数据盘本身要在 fstab 里挂好且先于 NFS 服务启动',
        '客户端挂载报 `access denied` 时，先核对 exports 里的网段写法和安全组放行情况'
      ],
      related: ['ls9-nfs-client', 'ls9-mount', 'ls9-df'],
      docs: 'https://man7.org/linux/man-pages/man5/exports.5.html',
      tags: ['NFS', '共享存储', '服务端']
    },

    /* ---------- 21 / 65 ---------- */
    {
      id: 'ls9-new-disk-flow',
      name: '华为云 ECS 挂载 EVS 数据盘全流程',
      kind: 'recipe',
      alias: ['新盘挂载', '数据盘初始化', 'EVS 挂载'],
      level: 2,
      syntax: 'lsblk → parted → mkfs → mkdir → /etc/fstab（UUID）→ mount -a → df -h',
      summary: '华为云 ECS 挂载一块 EVS 数据盘的完整流程，从认盘到开机自动挂载。',
      desc: '在云控制台把 EVS 数据盘挂载到 ECS 后，系统里不会自动出现可用空间，必须自己分区、格式化、挂载并写 fstab。完整链路共七步：**① 认盘** `lsblk` 确认新盘已识别（virtio 机型一般显示为 `/dev/vdb`）；**② 分区** 2TB 以内可用 `fdisk`，2TB 以上必须 `parted` 建 GPT；**③ 格式化** `mkfs.ext4` 或 `mkfs.xfs`（XFS 不能缩小，容量规划要留余量）；**④ 建挂载点** `mkdir /data`；**⑤ 取 UUID** `blkid`；**⑥ 写 fstab** 用 UUID 并加 `nofail`；**⑦ 验证** `mount -a` 加 `df -h`。整个流程都要求 root 权限，`mount` 与 `mkfs` 前务必用 `lsblk` 再确认一次设备名，别把数据盘和系统盘搞混。',
      params: [
        { flag: '① lsblk', desc: '列出块设备，确认新盘已挂载且未被格式化、未挂载' },
        { flag: '② parted -s <盘> mklabel gpt', desc: '2TB 以上盘必须建 GPT 分区表；2TB 以内可用 `fdisk`' },
        { flag: '② parted -s <盘> mkpart data ext4 0% 100%', desc: '建一个占满全盘的分区，起始对齐到 1MiB' },
        { flag: '② partprobe <盘>', desc: '让内核重读分区表，之后 `lsblk` 才能看到 vdb1' },
        { flag: '③ mkfs.ext4 -L data <分区>', desc: '格式化为 ext4 并打卷标；XFS 场景换成 `mkfs.xfs -f`' },
        { flag: '④ mkdir -p /data', desc: '创建挂载点目录，目录不存在时 mount 会失败' },
        { flag: '⑤ blkid -s UUID -o value <分区>', desc: '取出 UUID，fstab 里用它定位设备，避免设备名漂移' },
        { flag: '⑥ /etc/fstab 条目', desc: '`UUID=<值> /data ext4 defaults,noatime,nofail 0 2`，`nofail` 防止云盘异常时进不了系统' }
      ],
      examples: [
        { cmd: 'lsblk', desc: '第一步认盘：确认新挂载的 EVS 数据盘是 /dev/vdb 且没有分区、没有挂载点' },
        { cmd: 'parted -s /dev/vdb mklabel gpt && parted -s /dev/vdb mkpart data ext4 0% 100% && partprobe /dev/vdb', desc: '第二步分区：建 GPT 分区表与一个占满全盘的分区，并让内核重读' },
        { cmd: 'mkfs.ext4 -L data /dev/vdb1 && mkdir -p /data', desc: '第三步格式化并创建挂载点，`mkfs` 会清空该分区数据' },
        { cmd: 'blkid -s UUID -o value /dev/vdb1', desc: '第四步取 UUID，接着把它写进 /etc/fstab 的对应条目' },
        { cmd: 'mount -a && df -h /data', desc: '第五步验证：按 fstab 挂载并确认容量出现在 df 输出里，能挂上再重启才安全' }
      ],
      notes: [
        '**写完 fstab 一定要 `mount -a` 验证再退出**：条目写错时 `mount -a` 会立刻报错，而直接重启可能进 emergency mode 导致实例起不来',
        '**fstab 必须用 UUID 并加 `nofail`**：设备名（vdb/sdb）会随挂载顺序漂移，而云盘被摘除或未挂上时缺 `nofail` 会让系统卡在启动阶段',
        '`mkfs` 前必须确认设备名：把 `/dev/vdb1` 误敲成 `/dev/vda1` 会直接毁掉系统盘，执行前用 `lsblk` 复核一遍',
        '整盘不分区也能用（直接对 `/dev/vdb` 做 mkfs），但后续无法再分区；规范做法还是分区后使用',
        '已有数据的盘不要重复 `mkfs`；要保留数据时只做挂载，且不要对已有文件系统的分区重建分区表',
        '卸载数据盘时要先 `umount`，再把 fstab 条目注释掉；直接拔盘或删条目顺序颠倒都可能引发启动问题'
      ],
      related: ['ls9-lsblk', 'ls9-parted', 'ls9-fdisk', 'ls9-mkfs-ext4', 'ls9-blkid', 'ls9-fstab', 'ls9-mount'],
      docs: 'https://man7.org/linux/man-pages/man5/fstab.5.html',
      tags: ['云硬盘', '挂载', '全流程']
    },

    /* ---------- 22 / 65 ---------- */
    {
      id: 'ls9-growpart',
      name: 'growpart',
      alias: ['分区扩容', '云盘扩容'],
      level: 3,
      syntax: 'growpart <磁盘设备> <分区编号>',
      summary: '把分区扩大到整盘可用空间，云盘在控制台扩容后的系统内第一步。',
      desc: '在云控制台把云硬盘从 100G 扩到 200G 后，**系统内看到的容量不会自动变大**：分区表里分区还是 100G，文件系统自然也还是 100G。这时必须依次做三件事：**①** `growpart /dev/vdb 1` 把分区扩到占满整盘；**②** 让内核重读分区表（多数情况 growpart 会自动处理，必要时 `partprobe /dev/vdb`）；**③** 扩文件系统：ext4 用 `resize2fs /dev/vdb1`，XFS 用 `xfs_growfs /data`。如果盘上有 LVM，第 ③ 步之前还要先 `pvresize /dev/vdb1` 让 PV 认到新容量。这条链路是新手上云最容易困惑的地方：控制台点了扩容，`df -h` 却一点没变。',
      params: [
        { flag: '<磁盘设备>', desc: '整盘设备名，如 `/dev/vdb`；**不要写分区名 /dev/vdb1**' },
        { flag: '<分区编号>', desc: '要扩容的分区序号，如 `1` 表示 `/dev/vdb1`' },
        { flag: '--dry-run', desc: '预演：只显示将要做的调整而不实际写入分区表' },
        { flag: '-N/--no-update', desc: '只调整分区表但不通知内核更新，一般不用' },
        { flag: '-u/--update <内核>', desc: '指定内核，容器或特殊环境才需要' },
        { flag: '（后续）partprobe', desc: '内核没刷新分区时补一条 `partprobe /dev/vdb`' },
        { flag: '（后续）resize2fs', desc: 'ext4 扩文件系统，参数是分区或 LV 设备' },
        { flag: '（后续）xfs_growfs', desc: 'XFS 扩文件系统，参数是挂载点，且只能扩不能缩' }
      ],
      examples: [
        { cmd: 'lsblk /dev/vdb', desc: '扩容前确认盘的当前容量与分区结构，判断是否需要在系统内扩分区' },
        { cmd: 'growpart /dev/vdb 1', desc: '把 /dev/vdb1 扩大到占满整盘（控制台扩容 100G→200G 后的关键一步）' },
        { cmd: 'resize2fs /dev/vdb1 && df -h /data', desc: 'ext4 场景：扩完分区再扩文件系统，最后确认容量已生效' },
        { cmd: 'xfs_growfs /data', desc: 'XFS 场景：用挂载点扩文件系统，注意 XFS 只能扩不能缩' }
      ],
      notes: [
        '**云盘扩容后系统内必须手动扩，否则 `df -h` 看不到新容量**，这是新手最容易困惑的点；顺序是 `growpart` → 扩文件系统',
        '参数是**整盘 + 分区号**（`/dev/vdb 1`），不是分区设备名（`/dev/vdb1`），写错会报找不到分区',
        '如果这块盘上没有分区（整盘直接mkfs或整盘做 PV），**不需要 growpart**，直接 `resize2fs` 或 `pvresize /dev/vdb`',
        '扩分区只改分区表，**不会自动扩文件系统**：ext4 还要 `resize2fs`，XFS 还要 `xfs_growfs`，漏掉这一步容量依然不变',
        '走 LVM 的盘在扩分区后必须补 `pvresize /dev/vdb1`，否则 VG 还是看不到新增空间，`lvextend` 会报空间不足',
        '`growpart` 由 `cloud-utils-growpart` 提供（CentOS：`yum install -y cloud-utils-growpart`；Ubuntu：`apt install cloud-guest-utils`），云主机镜像通常已预装',
        '务必执行 `growpart --dry-run /dev/vdb 1` 预演一次：输出 `CHANGE: partition=1 start=... old: size=... end=... new: ...` 说明有可扩空间，输出 `NOCHANGE` 则表示分区已经占满整盘'
      ],
      related: ['ls9-lvm-extend', 'ls9-resize2fs', 'ls9-xfs-growfs', 'ls9-partprobe', 'ls9-pvcreate'],
      docs: 'https://man7.org/linux/man-pages/man8/parted.8.html',
      tags: ['扩容', '云硬盘', '分区']
    },

    /* ================= D. LVM 逻辑卷 ================= */

    /* ---------- 23 / 65 ---------- */
    {
      id: 'ls9-lvm-overview',
      name: 'LVM 概览（PV/VG/LV）',
      kind: 'recipe',
      alias: ['逻辑卷', 'logical volume manager'],
      level: 2,
      syntax: 'PV → VG → LV 三层：pvcreate → vgcreate → lvcreate',
      summary: 'LVM 三层结构与命令地图，理解磁盘如何被抽象成可在线扩容的逻辑卷。',
      desc: '三层结构：**PV（物理卷）**是初始化过的磁盘或分区；**VG（卷组）**把多个 PV 汇成一个存储池；**LV（逻辑卷）**从 VG 里切出来的、可当普通分区格式化和挂载的逻辑设备，路径形如 `/dev/vg-data/lv-data`。价值在于：扩容时先给 VG 加盘（`vgextend`），再扩 LV（`lvextend`），最后扩文件系统，全程在线不影响业务。查询类命令成对记忆：`pvs`/`pvdisplay`、`vgs`/`vgdisplay`、`lvs`/`lvdisplay`，短格式适合脚本与速览，长格式字段全。',
      params: [
        { flag: 'pvcreate / pvs', desc: '初始化物理卷 / 速览所有 PV 的容量与剩余' },
        { flag: 'vgcreate / vgs', desc: '创建卷组 / 速览所有 VG 的总量、已用与剩余' },
        { flag: 'lvcreate / lvs', desc: '创建逻辑卷 / 速览所有 LV 的大小、所属 VG 与路径' },
        { flag: 'vgextend / lvextend', desc: '往卷组加 PV / 扩大逻辑卷，扩容主链路' },
        { flag: 'pvdisplay / vgdisplay / lvdisplay', desc: '长格式详情，排障时看 PE 大小、剩余 PE 与 LV 路径' },
        { flag: 'pvck / vgck', desc: '检查 PV 与 VG 元数据一致性' }
      ],
      examples: [
        { cmd: 'pvs && vgs && lvs', desc: '一条命令看完三层现状，判断还有多少可分配空间' },
        { cmd: 'lvs -o +lv_size,vg_free --units g', desc: '列出每个 LV 大小与所属 VG 剩余空间，做扩容前评估' },
        { cmd: 'lsblk /dev/vg-data/lv-data', desc: '像看普通块设备一样查看 LV 的大小与挂载点' }
      ],
      notes: [
        'LVM 元数据损坏比文件系统损坏更难恢复，扩容等写操作前建议先对元数据做 `vgcfgbackup`',
        '`lvs` 里的 `LSize` 是 LV 大小，`VG` 剩余空间看 `vgs` 的 `VFree`，两者混淆会导致 `lvextend` 报空间不足',
        'LVM 提供的是“逻辑上的灵活性”，不提供冗余：单块 PV 坏了整个 VG 上的数据都可能丢，要冗余请用 RAID 或云硬盘备份',
        'LV 名称与 VG 名称中间用连字符在 `/dev/mapper` 下会变成双连字符（如 `vg--data-lv--data`），脚本里建议直接用 `/dev/<vg>/<lv>` 路径'
      ],
      related: ['ls9-pvcreate', 'ls9-vgcreate', 'ls9-lvcreate', 'ls9-lvm-extend'],
      docs: 'https://man7.org/linux/man-pages/man8/lvm.8.html',
      tags: ['LVM', '逻辑卷', '概念']
    },

    /* ---------- 24 / 65 ---------- */
    {
      id: 'ls9-pvcreate',
      name: 'pvcreate / pvs / pvdisplay',
      alias: ['physical volume', '物理卷'],
      level: 3,
      syntax: 'pvcreate [选项] <设备>　/　pvs [选项]　/　pvdisplay [设备]',
      summary: '把磁盘或分区初始化为 LVM 物理卷，并查看物理卷的容量与使用情况。',
      desc: '`pvcreate` 在设备头部写入 LVM 标签（label）与元数据区，是使用 LVM 的第一步。目标可以是整盘（`/dev/vdb`）也可以是分区（`/dev/vdb1`）；整盘更简单，但无法再分第二个区。做完 PV 之后必须 `vgcreate` 把它加入卷组，否则空间用不了。查询用 `pvs`（一行一个 PV，适合速览与脚本）或 `pvdisplay`（字段详细，含 PE 大小与空闲 PE 数）。',
      params: [
        { flag: '-f', desc: '强制创建，设备上已有 PV 或其他签名时必须加（破坏性）' },
        { flag: '-u <UUID>', desc: '指定 PV 的 UUID，恢复场景才用' },
        { flag: '-y', desc: '所有询问自动回答 yes，脚本里使用' },
        { flag: '-Z y', desc: '创建后擦除前 4 个扇区，抹掉旧的文件系统签名' },
        { flag: '--metadatasize <大小>', desc: '指定元数据区大小，一般默认即可' },
        { flag: '--dataalignment <大小>', desc: '按存储/RAID 条带对齐数据区，性能优化项' },
        { flag: 'pvs -o <字段>', desc: '自定义列，如 `pvs -o pv_name,pv_size,pv_free,vg_name`' },
        { flag: 'pvdisplay <设备>', desc: '查看单个 PV 的详细信息，含所属 VG 与 PE 分配' }
      ],
      examples: [
        { cmd: 'pvcreate /dev/vdb', desc: '把新数据盘整盘做成物理卷，之后才能加入卷组' },
        { cmd: 'pvs -o pv_name,pv_size,pv_free,vg_name', desc: '查看所有 PV 的大小、剩余与所属卷组' },
        { cmd: 'pvdisplay /dev/vdb', desc: '看单个 PV 的 PE 大小、总 PE 与已分配 PE' }
      ],
      notes: [
        '`pvcreate` 会覆盖设备头部的分区表与文件系统签名，等于清空该设备，执行前务必 `lsblk` 确认设备名',
        '设备若已被挂载或在用（属于某个 VG、被 md 占用），`pvcreate` 会拒绝执行，不要用 `-f -ff` 硬来',
        '做成整盘 PV 后就不能再对这块盘分区了；若希望保留分区结构，请对 `/dev/vdb1` 执行 `pvcreate`',
        '云盘扩容后，若该盘是整盘 PV 且分区表没有中间层，需要先 `pvresize /dev/vdb` 让 PV 认到新容量，再去 `lvextend`'
      ],
      related: ['ls9-lvm-overview', 'ls9-vgcreate', 'ls9-lvm-extend', 'ls9-lsblk'],
      docs: 'https://man7.org/linux/man-pages/man8/pvcreate.8.html',
      tags: ['LVM', '物理卷', 'PV']
    },

    /* ---------- 25 / 65 ---------- */
    {
      id: 'ls9-vgcreate',
      name: 'vgcreate / vgs / vgextend',
      alias: ['volume group', '卷组'],
      level: 3,
      syntax: 'vgcreate [选项] <卷组名> <PV>...　/　vgs　/　vgextend <卷组名> <PV>...',
      summary: '创建卷组把多个物理卷汇成存储池，并可随时加盘扩容这个池子。',
      desc: '卷组是 LVM 的中间层：多个 PV 汇入一个 VG 后，容量像池子一样被 LV 按需切走，池子不够了随时 `vgextend` 加盘，不用动上层业务。PE（Physical Extent）是分配的最小单位，默认 4MiB，LV 大小都是 PE 的整数倍，所以 `lvextend` 时实际分配量会向上取整。`vgs` 看池子总量与剩余，`vgextend` 是扩容链路的第一步。',
      params: [
        { flag: '-s <大小>', desc: '指定 PE 大小，如 `-s 16M`；创建后不可随意更改' },
        { flag: '<卷组名> <PV>', desc: '`vgcreate vg-data /dev/vdb`：把 PV 加入新建卷组' },
        { flag: 'vgextend <VG> <PV>', desc: '把新 PV 加入已有卷组，扩容第一步' },
        { flag: 'vgs -o <字段>', desc: '自定义列，如 `vgs -o vg_name,vg_size,vg_free,pv_count`' },
        { flag: 'vgdisplay <VG>', desc: '查看 VG 详情：PE 大小、总 PE、已分配 PE、剩余空间' },
        { flag: 'vgreduce <VG> <PV>', desc: '从卷组移除 PV，必须先 `pvmove` 迁走数据' },
        { flag: 'vgcfgbackup <VG>', desc: '把 VG 元数据备份到 /etc/lvm/backup，出事时救援用' }
      ],
      examples: [
        { cmd: 'vgcreate vg-data /dev/vdb', desc: '用 /dev/vdb 创建名为 vg-data 的卷组' },
        { cmd: 'vgs -o vg_name,vg_size,vg_free,pv_count', desc: '查看卷组容量与剩余空间，决定还能不能扩 LV' },
        { cmd: 'vgextend vg-data /dev/vdc', desc: '把新挂的 EVS 盘加入 vg-data，之后 lvextend 就能用上这块空间' }
      ],
      notes: [
        '卷组名建议语义化并带 `vg-` 前缀，逻辑卷带 `lv-` 前缀，服务器多了以后不容易搞混',
        'PE 大小创建后再改需要重建 VG，规划大容量池（数十 TB）时可一开始就设 `-s 16M` 以减少元数据开销',
        '`vgreduce` 移除 PV 前必须先 `pvmove <PV>` 把数据迁到同 VG 的其他盘，否则会报 “PV still in use”',
        '跨盘做 VG 只增加容量不增加可靠性：一块盘坏掉，整个 VG 的元数据可能都读不出来；关键业务请用云硬盘备份或 RAID',
        '扩容前若 VG 已无剩余空间（`VFree` 为 0），必须先 `vgextend` 加盘，直接 `lvextend` 会报空间不足'
      ],
      related: ['ls9-pvcreate', 'ls9-lvcreate', 'ls9-lvm-extend', 'ls9-lvm-overview'],
      docs: 'https://man7.org/linux/man-pages/man8/vgcreate.8.html',
      tags: ['LVM', '卷组', '扩容']
    },

    /* ---------- 26 / 65 ---------- */
    {
      id: 'ls9-lvcreate',
      name: 'lvcreate / lvs / lvextend',
      alias: ['logical volume', '逻辑卷', 'lvextend'],
      level: 3,
      syntax: 'lvcreate [选项] -n <LV名> <VG名>　/　lvs　/　lvextend [选项] <LV路径>',
      summary: '在卷组里创建逻辑卷并可在线扩大容量，扩容后还要扩文件系统才可见。',
      desc: '`lvcreate -n lv-data -l 100%FREE vg-data` 用卷组全部剩余空间建一个 LV，路径为 `/dev/vg-data/lv-data`。扩容时 `lvextend -L +50G /dev/vg-data/lv-data` 把 LV 扩大 50G，**这一步只改了块设备的容量，文件系统还没变大**，必须再执行 `resize2fs`（ext4）或 `xfs_growfs`（XFS）才能在 `df -h` 里看到新容量。加 `-r` 可以让 `lvextend` 自动调用对应工具，一步到位，强烈推荐。',
      params: [
        { flag: '-n <LV名>', desc: '指定逻辑卷名称，如 `-n lv-data`' },
        { flag: '-L <大小>', desc: '按容量指定，如 `-L 100G`；扩容时写 `-L +50G` 表示增加 50G' },
        { flag: '-l <PE数|百分比>', desc: '按 PE 数量或百分比指定，如 `-l 100%FREE` 用尽剩余空间' },
        { flag: '-r', desc: '扩容时同步扩大文件系统（自动调 resize2fs/xfs_growfs），首选' },
        { flag: '-s', desc: '创建快照卷，如 `-s -n lv-snap -L 10G /dev/vg-data/lv-data`' },
        { flag: '-y', desc: '免交互确认，脚本里用' },
        { flag: 'lvs -o <字段>', desc: '自定义列，如 `lvs -o lv_name,vg_name,lv_size,lv_path`' },
        { flag: '-a y（lvs）', desc: '`lvs -a` 连内部卷与快照一起显示' }
      ],
      examples: [
        { cmd: 'lvcreate -n lv-data -l 100%FREE vg-data', desc: '用卷组剩余空间全部创建 lv-data 逻辑卷' },
        { cmd: 'lvs -o lv_name,vg_name,lv_size,lv_path', desc: '列出所有逻辑卷的名称、大小与真实设备路径' },
        { cmd: 'lvextend -L +50G -r /dev/vg-data/lv-data', desc: '在线扩容 50G 并同时扩文件系统，`-r` 是不可省的省事参数' }
      ],
      notes: [
        '**只做 `lvextend` 不扩文件系统，`df -h` 看不到新容量**，这是新手最容易踩的坑；要么加 `-r`，要么手工补 `resize2fs`/`xfs_growfs`',
        '扩容前先 `vgs` 看 `VFree`，剩余空间不足时 `lvextend` 会报 `insufficient free space`，需要先 `vgextend` 加盘',
        'ext4 支持在线扩容；XFS 只能扩不能缩；`-r` 自动判断类型，比手工敲安全',
        '`lvcreate` 的参数顺序容易写反，标准写法是 `lvcreate -n <LV> <VG>`，`-L`/`-l` 二选一',
        '快照卷占用的是同一 VG 的空间，快照过大可能撑满 VG 导致业务写入失败，用完及时 `lvremove`'
      ],
      related: ['ls9-lvm-extend', 'ls9-resize2fs', 'ls9-vgcreate', 'ls9-lvreduce'],
      docs: 'https://man7.org/linux/man-pages/man8/lvcreate.8.html',
      tags: ['LVM', '逻辑卷', '扩容']
    },

    /* ---------- 27 / 65 ---------- */
    {
      id: 'ls9-lvreduce',
      name: 'lvreduce',
      alias: ['缩小逻辑卷', 'LV 缩容'],
      level: 4,
      syntax: 'lvreduce [选项] <LV路径>',
      summary: '缩小逻辑卷容量，顺序颠倒或漏缩文件系统会直接损坏数据，属高危操作。',
      desc: '缩小必须“先缩文件系统，再缩 LV”，顺序颠倒会让 LV 尾部空间被回收而文件系统还以为自己那么大，结果就是文件系统损坏甚至数据全丢。ext4 缩容完整流程是：`umount` → `e2fsck -f` → `resize2fs <设备> <目标大小>` → `lvreduce -L <目标大小>` → 重新挂载验证。XFS 完全不能缩小，只能备份数据后重建。LV 上的文件系统若是 XFS，`lvreduce` 没有任何安全路径，请直接放弃缩容方案。',
      params: [
        { flag: '-L <大小>', desc: '缩到指定容量，如 `-L 50G`；也可以用 `-L -20G` 表示减少 20G' },
        { flag: '-l <PE数>', desc: '按 PE 数量缩容' },
        { flag: '-r/--resizefs', desc: '同时缩小文件系统，但仍要求文件系统先自查；只对 ext 系有效' },
        { flag: '-f', desc: '跳过“缩小可能丢数据”的确认提示，脚本里用（更危险）' },
        { flag: '--test', desc: '只做模拟不真正执行，缩容前先跑一次看结果' }
      ],
      examples: [
        { cmd: 'umount /data && e2fsck -f /dev/vg-data/lv-data', desc: '缩容第一步：卸载并强制检查文件系统，不检查就缩必出事' },
        { cmd: 'resize2fs /dev/vg-data/lv-data 50G', desc: '第二步：先把文件系统缩到 50G，此时 LV 还比它大，是安全的' },
        { cmd: 'lvreduce -L 50G /dev/vg-data/lv-data', desc: '第三步：再把 LV 缩到 50G，务必与上一步的目标值一致' }
      ],
      notes: [
        '**顺序绝对不能颠倒**：必须先 `resize2fs` 缩文件系统，再 `lvreduce` 缩 LV；反过来会立刻损坏文件系统',
        '缩容前必须 `umount`，ext4 不支持在线缩小；缩容前先 `e2fsck -f` 确认文件系统健康',
        'XFS 文件系统**不能缩小**，`lvreduce` 对它只会造出“文件系统比设备大”的坏局，只能备份重建',
        '缩容前务必备份数据；`lvreduce` 本身不提供回滚，误操作后只能靠备份或专业恢复工具',
        '目标值建议比文件系统实际占用多留 10%~20%，写满的文件系统缩容会直接失败',
        '不确定时先加 `--test` 模拟一遍，看清输出再真跑'
      ],
      related: ['ls9-resize2fs', 'ls9-lvm-extend', 'ls9-fsck', 'ls9-lvremove'],
      docs: 'https://man7.org/linux/man-pages/man8/lvreduce.8.html',
      tags: ['LVM', '缩容', '高危']
    },

    /* ---------- 28 / 65 ---------- */
    {
      id: 'ls9-lvm-extend',
      name: 'LVM 在线扩容完整流程',
      kind: 'recipe',
      alias: ['lvextend resize2fs', 'xfs_growfs', '扩容流程'],
      level: 3,
      syntax: 'vgextend → lvextend → resize2fs | xfs_growfs',
      summary: '数据盘空间不足时的标准在线扩容链路：加盘进卷组、扩逻辑卷、再扩文件系统。',
      desc: '运维最高频操作，分三段：**① 扩池**：新挂一块 EVS 盘 → `pvcreate` → `vgextend` 加进同一个 VG（若 VG 本来就有剩余空间可跳过）；**② 扩卷**：`lvextend -L +<增量> <LV路径>` 扩大逻辑卷；**③ 扩文件系统**：ext4 用 `resize2fs`，XFS 用 `xfs_growfs <挂载点>`。三段全部在线完成，业务无需停机、无需重启、无需卸载。云盘自身扩容（控制台从 100G 改到 200G）还要多一步：先在系统内 `growpart /dev/vdb 1` 扩分区并 `partprobe`，再走 LV 与文件系统扩容。',
      params: [
        { flag: '① pvcreate <新盘>', desc: '把新挂的盘初始化为物理卷' },
        { flag: '① vgextend <VG> <新盘>', desc: '把新 PV 加入卷组，池子变大' },
        { flag: '② lvextend -L +<增量> <LV>', desc: '扩大逻辑卷，`+` 号表示增量；不加 `+` 表示绝对值' },
        { flag: '② lvextend -l +100%FREE <LV>', desc: '把卷组剩余空间全部给这个 LV' },
        { flag: '③ resize2fs <设备>', desc: 'ext4/ext3 扩容文件系统，可在线执行' },
        { flag: '③ xfs_growfs <挂载点>', desc: 'XFS 扩容文件系统，参数是挂载点不是设备名，只能在线扩' },
        { flag: '-r（合并在 lvextend）', desc: '`lvextend -r` 自动调用上面工具一步完成 ②③，最省事' },
        { flag: 'growpart <盘> <分区号>', desc: '云盘自身扩容后先扩分区，如 `growpart /dev/vdb 1`（cloud-utils-growpart 提供）' }
      ],
      examples: [
        { cmd: 'lsblk && vgs', desc: '扩容前评估：确认新盘是否识别、卷组还有多少剩余空间' },
        { cmd: 'pvcreate /dev/vdc && vgextend vg-data /dev/vdc', desc: '场景一（VG 空间不足）：把新盘加入卷组，池子扩容' },
        { cmd: 'lvextend -l +100%FREE -r /dev/vg-data/lv-data', desc: '把卷组剩余空间全部给 LV 并自动扩文件系统，`-r` 一次搞定 ②③' },
        { cmd: 'lvextend -L +100G /dev/vg-data/lv-data && resize2fs /dev/vg-data/lv-data', desc: '场景二（ext4 手工两步）：先扩 LV 再扩文件系统，不能省第二步' },
        { cmd: 'xfs_growfs /data', desc: '场景三（XFS）：扩完 LV 后用挂载点扩文件系统，XFS 只能扩不能缩' }
      ],
      notes: [
        '**`lvextend` 之后不扩文件系统，`df -h` 一点变化都没有**：这是新手最困惑的点，块设备变大了文件系统还没跟上',
        '**云盘在控制台扩容后，系统内不会自动变大**：有分区要先 `growpart /dev/vdb 1` 再 `partprobe`，然后才轮到 `pvresize`/`lvextend`/`resize2fs` 这条链',
        '`xfs_growfs` 的参数是**挂载点**（如 `/data`），`resize2fs` 的参数是**设备**（如 `/dev/vg-data/lv-data`），写反会报错',
        'ext4 与 XFS 都支持在线扩容，但都**不支持在线缩容**；XFS 连离线缩容都不支持',
        '扩容前先 `vgs` 确认 `VFree`，不足就先 `vgextend`；否则 `lvextend` 直接报空间不足',
        '建议用 `lvextend -r` 代替手工两步，它内部会判断文件系统类型；但仍要确认它输出的 “filesystem successfully resized”',
        '整盘 PV 的云盘扩容（无分区中间层）走 `pvresize /dev/vdb`，不要对整盘用 `growpart`'
      ],
      related: ['ls9-lvcreate', 'ls9-vgcreate', 'ls9-resize2fs', 'ls9-xfs-growfs', 'ls9-growpart'],
      docs: 'https://man7.org/linux/man-pages/man8/lvextend.8.html',
      tags: ['LVM', '扩容', '云硬盘']
    },

    /* ---------- 29 / 65 ---------- */
    {
      id: 'ls9-lvremove',
      name: 'lvremove',
      alias: ['删除逻辑卷', 'vgremove'],
      level: 3,
      syntax: 'lvremove [选项] <LV路径>',
      summary: '删除逻辑卷并回收其空间给卷组，数据随之全部丢失且不可恢复。',
      desc: '`lvremove /dev/vg-data/lv-data` 会移除该 LV，空间回到 VG 供其他 LV 使用。执行前必须先 `umount` 并清理 `/etc/fstab` 中的对应条目，否则重启时 fstab 找不到设备会进 emergency mode。要彻底拆除 LVM 还要按顺序 `lvremove` → `vgremove` → `pvremove`。误删后数据基本无法恢复，删前务必确认备份与挂载点。',
      params: [
        { flag: '<LV路径>', desc: '要删除的逻辑卷，如 `/dev/vg-data/lv-data`' },
        { flag: '-f', desc: '跳过确认提示，脚本里使用（更危险）' },
        { flag: '--test', desc: '只模拟不执行，先看清会删什么' },
        { flag: '-y', desc: '所有询问自动 yes' },
        { flag: '（后续）vgremove', desc: '删除卷组：`vgremove vg-data`，需先删光其中的 LV' },
        { flag: '（后续）pvremove', desc: '清除 PV 标签：`pvremove /dev/vdb`，之后该盘可重新分区格式化' }
      ],
      examples: [
        { cmd: 'umount /data && lvremove /dev/vg-data/lv-data', desc: '先卸载再删除逻辑卷，顺手把 /etc/fstab 里对应行注释掉' },
        { cmd: 'lvremove --test /dev/vg-data/lv-data', desc: '删除前先模拟一遍，确认针对的是正确的 LV' },
        { cmd: 'vgremove vg-data && pvremove /dev/vdb', desc: '彻底拆除：删卷组再清 PV 标签，之后 /dev/vdb 可当新盘重做' }
      ],
      notes: [
        '`lvremove` 删除的数据**无法用普通手段恢复**，执行前先 `lvs` 核对 LV 名称，再确认上次备份时间',
        '删除前必须 `umount`，否则报 `Logical volume ... in use`',
        '**删完一定同步清理 `/etc/fstab`**：留着已不存在的设备条目，下次重启会进 emergency mode',
        'LV 上有快照时先删快照再删原卷，否则可能报依赖错误',
        '顺序不能乱：`lvremove` → `vgremove` → `pvremove`，跳步会一直报 “in use”'
      ],
      related: ['ls9-lvcreate', 'ls9-fstab', 'ls9-umount', 'ls9-lvm-overview'],
      docs: 'https://man7.org/linux/man-pages/man8/lvremove.8.html',
      tags: ['LVM', '删除', '高危']
    },

    /* ================= E. 文件系统修复与调整 ================= */

    /* ---------- 30 / 65 ---------- */
    {
      id: 'ls9-fsck',
      name: 'fsck / e2fsck',
      alias: ['文件系统检查', 'fsck.ext4', 'e2fsck', 'ext4 修复'],
      level: 3,
      syntax: 'fsck [选项] [-t 类型] <设备>　/　e2fsck [选项] <设备>',
      summary: '检查并修复文件系统错误，必须在卸载状态执行，根分区需进救援模式。',
      desc: '`fsck` 是各文件系统专用工具的前端，按设备类型自动分派；`fsck.ext4` 就是 `e2fsck` 的硬链接，两者功能完全相同，直接调用 `e2fsck` 能用到更细的控制选项（`-c` 坏块扫描、`-D` 目录优化、`-b` 备用超级块救援）。**核心前提是文件系统必须处于卸载状态**：对已挂载的根分区跑 `fsck` 有很大概率把文件系统改坏。根分区要检查只能：在 GRUB 内核行末加 `fsck.mode=force` 重启触发，或从云控制台进救援/单用户模式，或在另一台机器上挂载云盘检查。ext4 能自动修复的项目包括超级块、位图、目录项与 inode 链接计数。',
      params: [
        { flag: '-f', desc: '强制检查：即使文件系统标记为 clean 也完整扫描，缩容前必做' },
        { flag: '-y', desc: '所有询问自动回答 yes，无人值守时用（可能按错误建议改坏数据）' },
        { flag: '-n', desc: '只检查不修改，安全预演用；有错误时退出码非 0' },
        { flag: '-p', desc: '自动修复可安全修复的问题，不询问（`preen` 模式，开机自检用）' },
        { flag: '-t <类型>', desc: '指定文件系统类型，如 `-t ext4`；也可指定 `-t noxfs`' },
        { flag: '-c', desc: '（e2fsck）用 badblocks 扫描坏块并加入坏块列表，很慢但能发现物理坏道' },
        { flag: '-b <块号> / -B <块大小>', desc: '（e2fsck）指定备用超级块救援，如 `-b 32768 -B 4096`' },
        { flag: '-C', desc: '显示进度条，长时间检查时能看到进展' }
      ],
      examples: [
        { cmd: 'umount /data && fsck -f -y /dev/vdb1', desc: '卸载后强制检查并自动修复 ext4 数据盘，最常用的形态' },
        { cmd: 'fsck -n /dev/vdb1', desc: '只读检查不修改，先看清有多少错误再决定是否修复' },
        { cmd: 'e2fsck -b 32768 -B 4096 /dev/vdb1', desc: '主超级块损坏时的救援写法，`-B` 必须与格式化时的块大小一致' }
      ],
      notes: [
        '**绝不要对已挂载的文件系统执行 `fsck`**：`fsck` 假设自己独占设备，与内核的文件系统缓存冲突，可能造成大面积文件损坏；根分区只能在救援模式或单用户模式下检查',
        '检查根分区：在 GRUB 内核行末加 `fsck.mode=force` 后启动，或云控制台进入救援模式挂载系统盘后 `fsck /dev/vda1`',
        '**XFS 不能用 `fsck`/`e2fsck`**：要 `umount` 后跑 `xfs_repair`；挂载状态下只能用 `xfs_repair -n` 做只读检查',
        '`-y` 会无脑接受所有修复建议，在严重损坏的盘上可能把可恢复的数据改没；重要数据先用 `-n` 摸清情况，必要时先做整盘快照/镜像',
        '超级块救援时 `-b` 的备用超级块位置随块大小变化（1K 块是 8192、4K 块常见 32768），先用 `dumpe2fs` 或 `mke2fs -n` 查出候选位置',
        '`fsck` 退出码有意义：0 无错、1 已修复、4 未修复、8 操作错误，脚本里可据此判断；修完再复检一次确认退出码为 0 再挂载'
      ],
      related: ['ls9-resize2fs', 'ls9-tune2fs', 'ls9-xfs-growfs', 'ls9-lvreduce'],
      docs: 'https://man7.org/linux/man-pages/man8/e2fsck.8.html',
      tags: ['文件系统', '修复', 'ext4']
    },

    /* ---------- 31 / 65 ---------- */
    {
      id: 'ls9-resize2fs',
      name: 'resize2fs',
      alias: ['ext4 扩容', 'ext4 缩容'],
      level: 3,
      syntax: 'resize2fs [选项] <设备> [新大小]',
      summary: '扩大或缩小 ext2/3/4 文件系统，扩 LV 之后必须靠它才能看到新容量。',
      desc: '不带新大小参数时，`resize2fs` 直接把文件系统撑满底层块设备（扩容最常用）；带大小参数则是缩容。扩容器支持在线执行，缩容必须先 `umount` 且先 `e2fsck -f`。记住顺序：**扩容是“先扩 LV，再 resize2fs”；缩容是“先 resize2fs 缩文件系统，再 lvreduce 缩 LV”**，两个方向顺序相反。',
      params: [
        { flag: '<设备>', desc: '目标设备或 LV 路径，如 `/dev/vg-data/lv-data`' },
        { flag: '<新大小>', desc: '缩容时必填，如 `50G`；扩容可省略表示撑满设备' },
        { flag: '-f', desc: '强制执行而不做安全确认，缩容时使用（危险）' },
        { flag: '-p', desc: '显示进度条，大文件系统扩容时能看到进展' },
        { flag: '-M', desc: '缩到文件系统能容纳的最小尺寸，配合 `-P` 先算出最小值' },
        { flag: '-P', desc: '只打印文件系统最小尺寸，不做任何修改，缩容规划用' },
        { flag: '-d', desc: '打开调试输出，排障时看详细过程' }
      ],
      examples: [
        { cmd: 'lvextend -L +50G /dev/vg-data/lv-data && resize2fs /dev/vg-data/lv-data', desc: 'ext4 标准在线扩容两步：先扩 LV，再让文件系统撑满' },
        { cmd: 'resize2fs -P /dev/vg-data/lv-data', desc: '先查文件系统最小能缩到多少，再决定缩容目标，避免缩过头' },
        { cmd: 'umount /data && e2fsck -f /dev/vg-data/lv-data && resize2fs /dev/vg-data/lv-data 50G', desc: '缩容第一步：卸载、强制检查、把文件系统缩到 50G' }
      ],
      notes: [
        '**缩容前必须 `e2fsck -f` 且必须在卸载状态**，顺序是 `umount` → `e2fsck` → `resize2fs` 缩 → `lvreduce` 缩；跳过检查会直接损坏文件系统',
        '扩容器可以在线做，缩容不行；缩容顺序反了（先 `lvreduce`）基本等于丢数据',
        '`resize2fs` 只对 ext2/ext3/ext4 有效，**对 XFS 完全无效**，XFS 要用 `xfs_growfs`（且只能扩）',
        '扩容前先确认 LV 已经变大（`lvs` 看 LSize），否则 `resize2fs` 会提示 “Nothing to do”',
        '缩容目标值要大于文件系统当前实际占用，`df -h` 显示已用 80G 却想缩到 50G 必然失败'
      ],
      related: ['ls9-lvm-extend', 'ls9-lvreduce', 'ls9-fsck', 'ls9-xfs-growfs'],
      docs: 'https://man7.org/linux/man-pages/man8/resize2fs.8.html',
      tags: ['ext4', '扩容', '缩容']
    },

    /* ---------- 32 / 65 ---------- */
    {
      id: 'ls9-xfs-growfs',
      name: 'xfs_growfs',
      alias: ['xfs 扩容', 'XFS 不能缩小'],
      level: 3,
      syntax: 'xfs_growfs [选项] <挂载点>',
      summary: '在线扩大 XFS 文件系统，参数是挂载点；XFS 只能扩不能缩。',
      desc: '扩完 LV（或扩完分区）后用它在挂载状态下把 XFS 撑满设备，参数是**挂载点**而不是设备名，这是和 `resize2fs` 最容易混淆的地方。XFS 从设计上就不支持缩小，没有任何官方手段能把 XFS 调小，需要变小只能备份 → 重建文件系统 → 恢复数据。因此 XFS 盘规划容量时要留足余量。',
      params: [
        { flag: '<挂载点>', desc: '目标文件系统的挂载点，如 `/data`；写设备名会报错' },
        { flag: '-d', desc: '只扩数据区（默认数据区与日志区都扩）' },
        { flag: '-l <大小>', desc: '指定日志区大小，一般无需手工指定' },
        { flag: '-n', desc: '只做检查（dry run）不实际修改，预演扩容结果' },
        { flag: '-e', desc: '允许扩大最大 inode 数量上限' },
        { flag: '-m <大小>', desc: '设置最大 inode 数量上限，如 `-m 100%` 用满可用空间' }
      ],
      examples: [
        { cmd: 'lvextend -L +100G /dev/vg-data/lv-data && xfs_growfs /data', desc: 'XFS 标准在线扩容：先扩 LV，再用挂载点扩文件系统' },
        { cmd: 'df -hT /data && xfs_info /data', desc: '扩容后确认容量与新块大小，`xfs_info` 可核对 data 段大小' },
        { cmd: 'xfs_growfs -n /data', desc: '只预演不修改，确认扩容会做到多大' }
      ],
      notes: [
        '**XFS 不能缩小**：`resize2fs`、`lvreduce` 都无法安全地缩小 XFS，需要变小只能备份后重建',
        '参数是**挂载点**（`/data`），不是设备名（`/dev/vg-data/lv-data`），写错会报 “not a mounted XFS filesystem”',
        '只能在**已挂载**状态下执行；`umount` 后 `xfs_growfs` 不可用，这与 ext4 的 `resize2fs` 恰好相反',
        '扩容前提是底层设备（分区或 LV）已经变大；LV 没扩就 `xfs_growfs`，它会提示没有可扩空间',
        '修复 XFS 用 `xfs_repair`（须卸载），不是 `fsck`/`e2fsck`；`xfs_repair` 也不能修复已挂载的 XFS'
      ],
      related: ['ls9-mkfs-xfs', 'ls9-lvm-extend', 'ls9-resize2fs', 'ls9-fsck'],
      docs: 'https://man7.org/linux/man-pages/man8/xfs_growfs.8.html',
      tags: ['XFS', '扩容', '在线']
    },

    /* ---------- 33 / 65 ---------- */
    {
      id: 'ls9-tune2fs',
      name: 'tune2fs / dumpe2fs',
      alias: ['root 预留空间', 'ext4 参数调整', 'dumpe2fs', '超级块'],
      level: 3,
      syntax: 'tune2fs [选项] <设备>　/　dumpe2fs [-h] <设备>',
      summary: '查看和调整 ext 文件系统参数，可用 -m 1 释放被 root 预留的空间。',
      desc: '最高频的用法是 `tune2fs -m 1 /dev/vdb1`：ext4 默认把 5% 空间留给 root 专用，普通用户与多数服务进程写不进去，于是出现“磁盘满了但还剩 5%”的现象；纯数据盘不需要这层保护，调到 1% 立刻多出几个百分点容量。`tune2fs -l` 与 `dumpe2fs -h` 都能看文件系统参数（后者输出更全，含备用超级块位置），`dumpe2fs` 完整输出还会逐个列出块组状态，是文件系统损坏时救援的取值依据。',
      params: [
        { flag: '-l（tune2fs）', desc: '列出超级块信息：块数、inode 数、挂载次数、UUID、检查间隔' },
        { flag: '-m <百分比>', desc: '调整 root 预留空间，如 `-m 1` 或 `-m 0`，数据盘省空间的关键参数' },
        { flag: '-c <次数>', desc: '挂载多少次后强制 fsck，`-c 0` 表示关闭计数检查' },
        { flag: '-i <时间>', desc: '两次检查的最大间隔，如 `-i 180d`，`0` 表示关闭' },
        { flag: '-U <UUID> / -L <卷标>', desc: '修改 UUID 或卷标（改 UUID 后记得同步更新 fstab）' },
        { flag: '-e <行为>', desc: '出错时的行为：`continue`、`remount-ro`、`panic`；生产常设 `remount-ro`' },
        { flag: '-h（dumpe2fs）', desc: '只显示超级块信息不列块组，日常排障最常用' },
        { flag: '-b（dumpe2fs）', desc: '打印被标记为坏块的块列表，配合坏道排查' }
      ],
      examples: [
        { cmd: 'tune2fs -m 1 /dev/vdb1', desc: '把 root 预留空间从 5% 降到 1%，解决“明明还有 5% 却写不进去”' },
        { cmd: 'tune2fs -c 0 -i 0 /dev/vdb1', desc: '关闭按挂载次数与时间的自动检查，避免大容量数据盘开机被强制 fsck 卡住' },
        { cmd: 'dumpe2fs -h /dev/vdb1', desc: '查看超级块汇总：块大小、inode 数、预留块、挂载计数' },
        { cmd: 'dumpe2fs /dev/vdb1 | grep -i "Backup superblock"', desc: '列出所有备用超级块位置，主超级块损坏时用 `e2fsck -b` 救援' }
      ],
      notes: [
        '`-m 0` 会让 root 也失去应急写入空间，系统盘不要设 0，数据盘才考虑；建议至少留 1%',
        '`-U` 改 UUID 后**必须同步更新 `/etc/fstab`**，否则重启时该盘挂不上，可能进 emergency mode',
        '调 `-m` 对已挂载的 ext4 也生效，无需卸载',
        '这两个命令只适用于 ext2/ext3/ext4；XFS 查看文件系统参数用 `xfs_info <挂载点>`，写参数在 `mkfs.xfs` 时决定',
        '`dumpe2fs` 完整输出在 TB 级盘上可能几万行，先重定向到文件或只用 `-h`；对已挂载文件系统读到的数据可能不是最新（缓存未刷），关键判断前先 `sync`',
        '不要随意用 `-O` 关闭 `has_journal` 等特性，会影响掉电一致性与数据安全'
      ],
      related: ['ls9-mkfs-ext4', 'ls9-fsck', 'ls9-resize2fs', 'ls9-fstab'],
      docs: 'https://man7.org/linux/man-pages/man8/tune2fs.8.html',
      tags: ['ext4', '预留空间', '超级块']
    },

    /* ================= F. IO 观测 ================= */

    /* ---------- 34 / 65 ---------- */
    {
      id: 'ls9-iostat',
      name: 'iostat',
      alias: ['磁盘瓶颈', 'IO 监控'],
      level: 2,
      syntax: 'iostat [选项] [间隔秒数] [次数]',
      summary: '按秒采样磁盘读写吞吐、IOPS 与响应延迟，判断磁盘是不是性能瓶颈。',
      desc: '来自 sysstat 包（CentOS：`yum install sysstat`；Ubuntu：`apt install sysstat`）。基础输出看 `%util`（设备繁忙度，长时间接近 100% 说明设备饱和）与 `tps`/`kB_read`/`kB_wrtn`；加 `-x` 后的扩展指标才是定位瓶颈的关键：`await` 是平均每次 IO 的完成时间（含排队，单位 ms）、`r_await`/`w_await` 分别是读/写延迟、`aqu-sz` 是平均队列深度、`%util` 看饱和度。经验阈值：`await` 持续超过十几毫秒并伴随 `%util` 接近 100%，就是磁盘扛不住了。',
      params: [
        { flag: '-x', desc: '显示扩展统计（await、r_await、w_await、aqu-sz、%util），排障必加' },
        { flag: '-d', desc: '只显示设备（磁盘）统计，排除 CPU 行，输出更清爽' },
        { flag: '-m', desc: '以 MB/s 为单位显示吞吐，比默认 kB/s 直观' },
        { flag: '<间隔> <次数>', desc: '如 `1 5` 表示每秒采样一次共 5 次，第一次是开机以来均值，看趋势要忽略第一次' },
        { flag: '-p <设备>', desc: '显示指定设备及其分区的统计，如 `-p vda`' },
        { flag: '-t', desc: '每行加上采样时间戳，便于与业务日志对齐' },
        { flag: '-y', desc: '跳过第一份“开机以来”的均值报告，只看实时数据' },
        { flag: '-c', desc: '只显示 CPU 统计（很少用，CPU 用 top 更合适）' }
      ],
      examples: [
        { cmd: 'iostat -x -d -m 1 5', desc: '每秒采样一次共 5 次，看 await 与 %util 判断磁盘是否饱和，最常敲的一条' },
        { cmd: 'iostat -x -d -y 2 10 | grep -E "Device|vdb"', desc: '只看数据盘 vdb 的实时扩展统计，`-y` 跳过开机均值' },
        { cmd: 'iostat -d -m -p vda 1 3', desc: '按分区看系统盘 vda 的吞吐，定位是根分区还是数据分区在写' }
      ],
      notes: [
        '第一次输出是“自开机以来”的累计均值，判断当前状况要看第二次之后的数据',
        '`await` 高不一定全是磁盘慢：也可能是应用并发太高把队列压满，要结合 `aqu-sz`（队列深度）一起看',
        '`%util` 对 SSD/云盘这类可并行处理的设备参考价值下降：即使 `%util` 100%，更高队列深度下仍可能有吞吐余量，重点看 `await` 与队列',
        '云硬盘的性能上限由规格决定（IOPS 与带宽有上限），超过上限时 `await` 会明显上升，先看云监控的磁盘指标再决定扩盘或加盘',
        '容器或虚拟机里看到的设备名可能是 `vda`/`vdb`（virtio）或 `sda`/`nvme0n1`，先 `lsblk` 对齐设备名',
        '没有 `iostat` 命令时的临时替代：`cat /proc/diskstats` 或 `vmstat 1` 的 `wa` 列'
      ],
      related: ['ls9-iotop', 'ls9-ioping', 'ls9-fio', 'ls9-df'],
      docs: 'https://man7.org/linux/man-pages/man1/iostat.1.html',
      tags: ['IO', '性能', '瓶颈']
    },

    /* ---------- 35 / 65 ---------- */
    {
      id: 'ls9-iotop',
      name: 'iotop',
      alias: ['进程 IO', '谁在写盘'],
      level: 2,
      syntax: 'iotop [选项]',
      summary: '按进程实时查看磁盘读写速率，定位是哪个进程把磁盘 IO 吃满了。',
      desc: '类似 `top`，但排序依据是 IO 而不是 CPU。默认只显示真正产生 IO 的进程，界面里用左右方向键切换排序列、`r` 反向、`o` 切换只显示有 IO 的进程、`q` 退出。需要 root 或 CAP_SYS_ADMIN 才能拿到完整数据，容器里通常需要 `--privileged` 或挂载 host 的 `/proc`。CentOS：`yum install iotop`，Ubuntu：`apt install iotop`。',
      params: [
        { flag: '-o', desc: '只显示实际产生 IO 的进程，排障时首选，界面不再刷无用行' },
        { flag: '-P', desc: '只显示进程不显示线程，输出更聚合、更易读' },
        { flag: '-b', desc: '批处理模式，配合 `-n` 可用于脚本与日志采集' },
        { flag: '-n <次数>', desc: '采样指定次数后退出，与 `-b` 连用' },
        { flag: '-d <秒>', desc: '刷新间隔，如 `-d 2` 每 2 秒刷新' },
        { flag: '-k', desc: '以 KB/s 为单位显示（默认按人读单位换算）' },
        { flag: '-u', desc: '显示累计 IO 而不是实时速率，用于看“历史总写入量”' },
        { flag: '-a', desc: '累积模式，显示自启动 iotop 以来的累计值' }
      ],
      examples: [
        { cmd: 'iotop -o -P', desc: '实时查看产生 IO 的进程，`-P` 只看进程不刷线程' },
        { cmd: 'iotop -b -o -n 3 -d 1 > /tmp/iotop.log', desc: '批处理采样 3 次写入日志，故障现场留证' },
        { cmd: 'iotop -o -k -d 2', desc: '以 KB/s 为单位每 2 秒刷新，看写盘速率更直观' }
      ],
      notes: [
        '必须 root 才能看到所有进程的 IO；普通用户看到的多数是 0，不是没有 IO 而是没权限',
        '容器/虚拟机里看到的是本命名空间的进程，宿主机上的写盘大户可能不在此列，必要时上宿主机排查',
        '`iotop` 依赖内核的 IO 统计（taskstats/`CONFIG_TASK_IO_ACCOUNTING`），极老内核可能不支持',
        '若内核不支持或装不上，用 `pidstat -d 1`（sysstat 包）替代，同样能按进程看读写'
      ],
      related: ['ls9-iostat', 'ls9-du', 'ls9-df'],
      docs: 'https://man7.org/linux/man-pages/man8/iotop.8.html',
      tags: ['IO', '进程', '排障']
    },

    /* ---------- 36 / 65 ---------- */
    {
      id: 'ls9-ioping',
      name: 'ioping',
      alias: ['磁盘延迟', 'IO 延迟测试'],
      level: 3,
      syntax: 'ioping [选项] <目录|设备|文件>',
      summary: '像 ping 一样测量磁盘 IO 延迟，评估云盘响应速度与卡顿抖动。',
      desc: '对目标持续发起小 IO 并统计延迟，输出类似 `ping` 的 min/avg/max/mdev，非常适合判断“云盘是不是变慢了”。用法分两种：对目录（如 `/data`）测试经过文件系统的读写延迟，对块设备（如 `/dev/vdb`）测试裸设备延迟。默认是 1 秒一次，`-c` 指定次数。安装：Ubuntu 用 `apt install ioping`，CentOS 需从源码编译或找第三方源。',
      params: [
        { flag: '-c <次数>', desc: '发起指定次数的请求后结束，如 `-c 20`' },
        { flag: '-i <间隔>', desc: '请求间隔，支持 `1s`、`100ms`、`0`（不等）' },
        { flag: '-W', desc: '以写（write）方式测试，注意会在目录里留下临时文件' },
        { flag: '-D', desc: '直接 IO，绕过页缓存，测的是真实设备延迟' },
        { flag: '-C', desc: '带缓存顺序读，衡量缓存命中下的表现' },
        { flag: '-s <大小>', desc: '每次请求的块大小，如 `-s 4k`、`-s 1M`，按业务 IO 大小选' },
        { flag: '-w <秒>', desc: '最长运行时间限制' }
      ],
      examples: [
        { cmd: 'ioping -c 20 /data', desc: '对 /data 做 20 次小 IO 延迟测试，看云盘平均响应时间' },
        { cmd: 'ioping -D -c 20 /dev/vdb', desc: '裸设备直接 IO 测试，绕过文件系统与缓存，反映磁盘真实延迟' },
        { cmd: 'ioping -W -D -s 4k -c 20 /data', desc: '按 4K 块写测试，贴近数据库类业务的写入延迟特征' }
      ],
      notes: [
        '`-W` 写测试会在目标目录生成临时文件，别对生产关键目录长时间跑',
        '**绝不要对已有数据的块设备做写测试**（如 `ioping -W /dev/vdb`），会破坏文件系统；对设备只做读测试',
        '测试结果受云盘规格与邻居噪声影响：共享型云盘出现延迟抖动属正常，持续高于基线才需要提工单',
        '不带 `-D` 时会走页缓存，测出的延迟可能远低于真实设备延迟，判断硬件性能请加 `-D`',
        'CentOS 默认源没有 ioping，可 `yum install epel-release` 后查找，或从 `github.com/koct9i/ioping` 编译安装'
      ],
      related: ['ls9-iostat', 'ls9-fio', 'ls9-dd'],
      docs: 'https://github.com/koct9i/ioping',
      tags: ['IO', '延迟', '云硬盘']
    },

    /* ---------- 37 / 65 ---------- */
    {
      id: 'ls9-fio',
      name: 'fio',
      alias: ['IOPS 测试', '磁盘性能测试'],
      level: 3,
      syntax: 'fio [选项] <job文件>',
      summary: '灵活的 IO 压测工具，快速测出云盘的 IOPS、带宽与延迟基线。',
      desc: '支持随机/顺序、读/写、块大小、队列深度、线程数等维度组合，是评估云盘规格是否达标的行业标准工具。本分类只给“快速测一块盘的 IOPS”这一条最小可用命令；fio 的完整参数体系（job 文件、`--output-format=json`、latency 分位、混合读写比例）属于性能压测分类的内容。安装：CentOS `yum install fio`，Ubuntu `apt install fio`。',
      params: [
        { flag: '--filename=<路径>', desc: '测试文件，如 `/data/fio.test`；也可写裸设备（危险）' },
        { flag: '--direct=1', desc: '直接 IO 绕过缓存，测真实设备性能，压测必须加' },
        { flag: '--rw=randread', desc: '随机读；另可 `randwrite`、`read`、`write`、`randrw`' },
        { flag: '--bs=4k', desc: '块大小，4k 测 IOPS，1M 测吞吐带宽' },
        { flag: '--iodepth=32', desc: '队列深度，云盘 IOPS 达标情况与并发深度强相关' },
        { flag: '--numjobs=4', desc: '并发任务数，模拟多线程压力' },
        { flag: '--runtime=60', desc: '运行时长（秒），配合 `--time_based` 才能跑满时长' },
        { flag: '--name=<任务名>', desc: '任务名称，输出里用它区分结果' }
      ],
      examples: [
        { cmd: 'fio --name=randread --filename=/data/fio.test --ioengine=libaio --direct=1 --rw=randread --bs=4k --iodepth=32 --numjobs=4 --runtime=60 --time_based --group_reporting', desc: '4K 随机读压测，输出里的 IOPS 与 lat 就是云盘性能基线' },
        { cmd: 'fio --name=seqwrite --filename=/data/fio.test --direct=1 --rw=write --bs=1M --runtime=30 --size=4G', desc: '1M 顺序写测吞吐带宽，评估大文件写入能力' },
        { cmd: 'rm -f /data/fio.test', desc: '压测结束及时删除测试文件，否则它可能把数据盘撑满' }
      ],
      notes: [
        '压测会产生真实 IO 并占用磁盘带宽，**不要在业务高峰期对生产数据盘压测**，会影响线上响应',
        '`--filename` 指向裸设备（如 `/dev/vdb`）会**覆盖设备上的数据**，务必只对新建测试盘或文件操作',
        '不给 `--size` 时 fio 可能写满可用空间，务必限制大小或及时删除测试文件',
        '云盘 IOPS/带宽有规格上限，测出的数值低于标称很可能是队列深度或并发数不够，先把 `--iodepth` 与 `--numjobs` 提上去再对比',
        '测完记得 `df -h` 确认空间已释放，并按需清理页面缓存'
      ],
      related: ['ls9-iostat', 'ls9-ioping', 'ls9-dd'],
      docs: 'https://fio.readthedocs.io/en/latest/fio_doc.html',
      tags: ['IO', '压测', 'IOPS']
    },

    /* ---------- 38 / 65 ---------- */
    {
      id: 'ls9-dd',
      name: 'dd（磁盘测速）',
      kind: 'recipe',
      alias: ['磁盘读写测试', 'dd 测速'],
      level: 3,
      syntax: 'dd if=<输入> of=<输出> bs=<块大小> count=<块数> [status=progress]',
      summary: '裸设备读写测速与镜像拷贝工具，写错 of= 目标会直接毁掉整块磁盘。',
      desc: '测磁盘写入速度的常见写法是往文件系统里写一个临时大文件：`dd if=/dev/zero of=/data/testfile bs=1M count=2048 oflag=direct status=progress`，`oflag=direct` 绕过缓存才能测出真实速度；读测试用 `iflag=direct` 从已有文件读。`dd` 本身是把输入按块搬到输出的通用工具，镜像备份（`dd if=/dev/vda of=/backup/vda.img`）也常用它。',
      params: [
        { flag: 'if=<文件|设备>', desc: '输入源，`/dev/zero` 用于生成零数据，`/dev/urandom` 生成随机数据（很慢）' },
        { flag: 'of=<文件|设备>', desc: '输出目标；**写成 /dev/ 下的设备会覆盖该设备上的全部数据**' },
        { flag: 'bs=<大小>', desc: '单次读写块大小，测吞吐用 `1M`，测 IOPS 用 `4k`' },
        { flag: 'count=<次数>', desc: '搬运块数，总大小 = `bs × count`；不写会把输入读到底' },
        { flag: 'oflag=direct', desc: '输出走直接 IO 绕过页缓存，测真实写入速度必须加' },
        { flag: 'iflag=direct', desc: '输入走直接 IO，读测试用它' },
        { flag: 'status=progress', desc: '实时打印进度与速率，测速时最有用' },
        { flag: 'conv=fdatasync', desc: '结束时强制落盘再统计，避免“看起来很快”其实是写进缓存' }
      ],
      examples: [
        { cmd: 'dd if=/dev/zero of=/data/testfile bs=1M count=2048 oflag=direct status=progress', desc: '在 /data 写 2GB 测试文件，看真实顺序写入速度（绕过缓存）' },
        { cmd: 'dd if=/data/testfile of=/dev/null bs=1M iflag=direct status=progress', desc: '顺序读测速，读的是刚写好的测试文件' },
        { cmd: 'dd if=/dev/vda of=/backup/vda.img bs=4M status=progress', desc: '整盘镜像备份到文件，做磁盘救援或迁移前的常规操作' }
      ],
      notes: [
        '**`of=` 写错设备会立刻毁掉整块盘的数据**：`dd if=/dev/zero of=/dev/vdb` 等于抹掉 vdb，执行前用 `lsblk` 对照设备名，生产环境建议先 `echo` 打印一遍命令再执行',
        '**测写速度不要用 `of=/dev/sda` 这类裸设备**：那是在覆盖真实磁盘内容；正确做法是写到文件系统里的临时文件，测完删除',
        '不加 `oflag=direct`/`conv=fdatasync` 时数据只进了页缓存，测出的速度虚高，不代表真实落盘能力',
        '`bs=4k` 逐块测出来的是很小的 IOPS 表现，块太小会让 `dd` 自身开销占主导；测吞吐请用 `bs=1M`',
        '测完务必 `rm -f /data/testfile`，大文件把数据盘撑满会引发线上故障',
        '`dd` 没有进度条（除 `status=progress`），长时间运行看不出是否卡住，可用 `kill -USR1 <pid>` 打印一次进度'
      ],
      related: ['ls9-fio', 'ls9-ioping', 'ls9-fallocate', 'ls9-iostat'],
      docs: 'https://man7.org/linux/man-pages/man1/dd.1.html',
      tags: ['IO', '测速', '高危']
    },

    /* ================= G. RAID 与硬件 ================= */

    /* ---------- 39 / 65 ---------- */
    {
      id: 'ls9-mdadm',
      name: 'mdadm',
      alias: ['软 RAID', 'raid1'],
      level: 4,
      syntax: 'mdadm --create <新设备> --level=<级别> --raid-devices=<数量> <成员设备>...',
      summary: 'Linux 软件 RAID 管理工具，创建阵列、查看状态、模拟故障与换盘重建。',
      desc: '把多块盘用 `md` 驱动组成 RAID，常见 RAID1（镜像，读性能好、坏一块不丢数据）、RAID5/6（带校验，空间利用率与冗余折中）、RAID10（镜像 + 条带，性能与安全兼顾）。典型运维动作：`--detail` 看阵列健康、`--fail` 标记坏盘、`--remove` 摘盘、`--add` 加新盘后自动重建（rebuild）。云上如果已经用了云硬盘的 RAID 能力或直接把盘交给 LVM/文件系统，不必再叠一层软 RAID。',
      params: [
        { flag: '--create', desc: '创建阵列，如 `--create /dev/md0 --level=1 --raid-devices=2 /dev/vdb /dev/vdc`' },
        { flag: '--detail <设备>', desc: '查看阵列详情：级别、成员、状态、重建进度' },
        { flag: '--fail <成员>', desc: '把指定成员标记为故障，用于测试与主动下线' },
        { flag: '--remove <成员>', desc: '从阵列中移除成员（需先 `--fail`）' },
        { flag: '--add <成员>', desc: '加入新盘，阵列自动开始 rebuild' },
        { flag: '--examine <成员>', desc: '读取成员盘上的超级块，识别“这是谁的盘”' },
        { flag: '--assemble', desc: '按原有配置重新组装阵列，重启或迁移后使用' },
        { flag: '--monitor', desc: '监控阵列变化，可配合邮件告警' }
      ],
      examples: [
        { cmd: 'mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/vdb /dev/vdc', desc: '用两块盘建 RAID1 镜像阵列，之后对 /dev/md0 做 mkfs 即可' },
        { cmd: 'mdadm --detail /dev/md0', desc: '查看阵列成员、状态与重建进度，`State: clean` 才是健康' },
        { cmd: 'mdadm /dev/md0 --fail /dev/vdc --remove /dev/vdc && mdadm /dev/md0 --add /dev/vdd', desc: '换盘标准三步：标记故障盘、摘除、加入新盘并等待重建完成' }
      ],
      notes: [
        '创建阵列会**清空成员盘上的数据**，执行前务必 `lsblk` 确认设备名与成员盘已无业务数据',
        '重建（rebuild）期间阵列没有冗余，此时再坏一块盘就全丢；重建期间避免其他高 IO 操作',
        '成员盘建议整盘使用，不要用分区拼阵列；每块盘要能通过 `mdadm --examine` 被识别',
        '阵列配置要持久化：写 `/etc/mdadm.conf`（`mdadm --detail --scan >> /etc/mdadm.conf`）并配好 `/etc/fstab`，否则重启后阵列可能组不起来',
        '性能考虑：机械盘 RAID 重建很慢（TB 级可能数小时），云盘虽快但受规格带宽限制，切勿在业务高峰换盘'
      ],
      related: ['ls9-mdstat', 'ls9-smartctl', 'ls9-mkfs-ext4', 'ls9-fstab'],
      docs: 'https://man7.org/linux/man-pages/man8/mdadm.8.html',
      tags: ['RAID', '冗余', '换盘']
    },

    /* ---------- 40 / 65 ---------- */
    {
      id: 'ls9-mdstat',
      name: 'cat /proc/mdstat',
      alias: ['软RAID状态', 'raid 状态'],
      level: 3,
      syntax: 'cat /proc/mdstat',
      summary: '一眼查看软 RAID 阵列状态与重建进度，磁盘故障告警的第一现场。',
      desc: '输出里 `md0 : active raid1 vdc[1] vdb[0]` 表示阵列健康且两块成员盘都在；成员盘名后面的 `[n]` 是槽位号，若某行变成 `vdc[1](F)` 就说明该盘被标记为故障。带 `[U_]`、`[UU]` 的进度条含义是各成员盘的状态位：`U` 正常、`_` 缺失。重建时会出现 `[=>....] recovery = 12.3% ...` 的进度行。这是排查 RAID 问题第一个该看的文件。',
      params: [
        { flag: '（无参数）', desc: '`cat /proc/mdstat` 即可，纯虚拟文件，无参数' },
        { flag: 'watch 命令', desc: '`watch -n 5 cat /proc/mdstat` 每 5 秒刷新，盯重建进度' },
        { flag: '(F)', desc: '输出中的标记：该成员盘已被标记为故障' },
        { flag: '[U_]', desc: '状态位图：`U` 表示成员正常，`_` 表示缺失或故障' },
        { flag: 'recovery/resync', desc: '重建或同步进度，完成后该行消失' },
        { flag: 'blocks', desc: '阵列总块数（1K 块为单位），可换算容量' }
      ],
      examples: [
        { cmd: 'cat /proc/mdstat', desc: '查看所有软 RAID 阵列的状态与成员盘，故障排查第一步' },
        { cmd: 'watch -n 5 cat /proc/mdstat', desc: '每 5 秒刷新一次，盯换盘后的重建进度' },
        { cmd: 'cat /proc/mdstat && mdadm --detail /dev/md0', desc: '概览加详情组合，确认是盘故障还是阵列级别的问题' }
      ],
      notes: [
        '看到成员盘带 `(F)` 要立刻确认备份并准备换盘；RAID5/6 在降级状态下再坏一块就全丢',
        '`[U_]` 里的 `_` 不一定代表盘坏，也可能是重建还没完成，结合进度行一起判断',
        '`/proc/mdstat` 只反映软 RAID；硬件 RAID 卡（如 MegaRAID）要用厂商工具（`storcli`、`megacli`）查看',
        'md 阵列若配置没写进 `/etc/mdadm.conf`，重启后可能变成 `inactive`，需要 `mdadm --assemble --scan` 重新组装'
      ],
      related: ['ls9-mdadm', 'ls9-smartctl', 'ls9-df'],
      docs: 'https://man7.org/linux/man-pages/man8/mdadm.8.html',
      tags: ['RAID', '状态', '排障']
    },

    /* ---------- 41 / 65 ---------- */
    {
      id: 'ls9-smartctl',
      name: 'smartctl',
      alias: ['SMART', '磁盘健康检查'],
      level: 3,
      syntax: 'smartctl [选项] <设备>',
      summary: '读取磁盘 SMART 健康数据，提前发现坏道、重映射扇区等硬件劣化征兆。',
      desc: 'SMART 是磁盘固件记录的健康指标集合，`-H` 看总体结论（PASSED/FAILED），`-a` 看全部属性与自检记录，`-t short` 触发一次几十秒的快速自检。重点关注 `Reallocated_Sector_Ct`（重映射扇区，非 0 且持续增长说明盘在坏）、`Current_Pending_Sector`（待映射扇区）、`Offline_Uncorrectable`、`Media_Wearout_Indicator`/`Percentage_Used`（SSD 寿命）。**云硬盘场景要注意**：EVS 云盘在虚拟机里看到的是虚拟块设备（vda/vdb），宿主机的物理盘对租户不可见，`smartctl` 通常读不到数据或直接报不支持，此时磁盘健康应依赖云监控与云厂商的底层检测；只有物理机、BMS（裸金属）或直通本地盘的机型才有意义。',
      params: [
        { flag: '-a', desc: '显示全部 SMART 信息：健康结论、属性表、自检日志、错误日志' },
        { flag: '-H', desc: '只看健康状态结论，输出 PASSED 或 FAILED，最快' },
        { flag: '-i', desc: '显示设备型号、序列号、固件版本，认盘与报修用' },
        { flag: '-t short', desc: '启动快速自检（约 1~2 分钟），完成后用 `-l selftest` 看结果' },
        { flag: '-t long', desc: '启动长自检（机械盘可能数小时），全面扫盘' },
        { flag: '-l selftest', desc: '查看历史自检结果日志' },
        { flag: '-l error', desc: '查看设备错误日志，确认是否发生过 IO 错误' },
        { flag: '-A', desc: '只列出 SMART 属性表，关注重映射与待映射扇区计数' }
      ],
      examples: [
        { cmd: 'smartctl -H /dev/sda', desc: '快速判断物理盘健康结论，PASSED 才正常' },
        { cmd: 'smartctl -a /dev/sda | grep -E "Reallocated_Sector_Ct|Current_Pending_Sector|Percentage_Used"', desc: '重点看重映射扇区与 SSD 寿命消耗' },
        { cmd: 'smartctl -t short /dev/sda && sleep 120 && smartctl -l selftest /dev/sda', desc: '触发快速自检并查看结果，判断是否有读错误' }
      ],
      notes: [
        '**云硬盘（EVS）在 ECS 内一般读不到 SMART**：虚拟化层屏蔽了物理盘，`smartctl` 会报 `Unable to detect device type` 或返回空数据，这属正常现象；云盘健康请看云监控的磁盘指标与厂商侧检测',
        '`-d` 参数用于指定设备类型（如 `-d megaraid,0` 读 RAID 卡后的盘），RAID 卡下必须用厂商工具配合才有效',
        'SMART 正常不代表盘绝对可靠：属性趋势比单次快照更重要，建议定期采集对比',
        '安装：CentOS 需 `yum install smartmontools`（EPEL），Ubuntu `apt install smartmontools`',
        '`FAILED` 或重映射扇区快速增长时应尽快迁移数据并申请更换，不要等盘彻底坏掉'
      ],
      related: ['ls9-mdstat', 'ls9-mdadm', 'ls9-hdparm'],
      docs: 'https://www.smartmontools.org/wiki/TocDoc',
      tags: ['硬件', '健康检查', '云硬盘']
    },

    /* ================= H. 磁盘与文件操作 ================= */

    /* ---------- 42 / 65 ---------- */
    {
      id: 'ls9-hdparm',
      name: 'hdparm',
      alias: ['磁盘参数', '缓存测试'],
      level: 4,
      syntax: 'hdparm [选项] <设备>',
      summary: '查看和调整磁盘硬件参数，能测缓存读取速度与查询设备能力。',
      desc: '传统上用于 IDE/SATA 盘，现代云主机上主要当“只读查询 + 快速读缓存测速”工具用。`-t` 测缓存读取（不带 `--direct`，数据来自页缓存）与 `-T` 测磁盘缓冲读取，两个值常一起看。写参数类选项（`-W` 设置写缓存、`-S` 设置休眠）在虚拟磁盘上通常无效或被忽略，云盘上不要指望它调优。',
      params: [
        { flag: '-i', desc: '显示设备识别信息（型号、固件、序列号），只读不改' },
        { flag: '-I', desc: '显示设备详细能力（支持的传输模式、特性位），输出很长' },
        { flag: '-t', desc: '测缓存读取速度，配合 `-T` 一起看，单位 MB/s' },
        { flag: '-T', desc: '测磁盘缓冲读取速度（timing cached reads）' },
        { flag: '-W <0|1>', desc: '关闭/打开写缓存，虚拟磁盘上多半无效，慎改' },
        { flag: '-S <值>', desc: '设置盘休眠超时，云盘上一般无意义' },
        { flag: '--direct', desc: '配合 `-t` 绕过缓存直接读盘，测的是接近真实的读取速度' },
        { flag: '-B <值>', desc: '设置高级电源管理级别，可能影响性能，虚拟环境慎用' }
      ],
      examples: [
        { cmd: 'hdparm -i /dev/sda', desc: '查看盘型号与序列号，认盘、报修时提供信息' },
        { cmd: 'hdparm -Tt /dev/sda', desc: '一次看缓存与磁盘缓冲读取速度，快速感受盘性能' },
        { cmd: 'hdparm -Tt --direct /dev/sda', desc: '加 `--direct` 绕过缓存，数值更接近真实读性能' }
      ],
      notes: [
        '带写参数类的选项（`-W`、`-S`、`-B`）可能改变盘的工作状态甚至影响数据安全，生产盘上只做只读查询最稳',
        '云主机上的 vda/vdb 是虚拟块设备，`hdparm` 的多数写参数无效，测速也会受虚拟化层影响',
        '测速请用 fio 或 dd（`oflag=direct`）更贴近真实业务；`hdparm -t` 结果受缓存影响较大',
        'SSD 盘不要用 `hdparm` 做所谓“安全擦除”，SSD 的 TRIM 请用 `blkdiscard` 或 `fstrim`'
      ],
      related: ['ls9-smartctl', 'ls9-fio', 'ls9-dd', 'ls9-blkdiscard'],
      docs: 'https://man7.org/linux/man-pages/man8/hdparm.8.html',
      tags: ['硬件', '参数', '测速']
    },

    /* ---------- 43 / 65 ---------- */
    {
      id: 'ls9-sync',
      name: 'sync',
      alias: ['刷盘', 'fsync'],
      level: 2,
      syntax: 'sync [选项] [文件]...',
      summary: '把内存中的脏页强制写入磁盘，拔盘、关机、卸载前必须执行。',
      desc: 'Linux 把写操作先落在页缓存里，由内核异步回写，所以 `cp` 返回成功并不代表数据已经落到磁盘。`sync` 强制把脏页刷盘；不带参数刷全部文件系统，带文件参数只刷该文件所在文件系统（`sync <文件>` 等价于对文件 `fsync`）。云主机上要卸载云盘、做快照、或强制重启前，先 `sync` 能显著降低数据丢失风险。',
      params: [
        { flag: '（无参数）', desc: '把所有已挂载文件系统的脏页刷到磁盘' },
        { flag: '<文件>', desc: '只同步该文件数据与元数据，等同 `fsync` 语义' },
        { flag: '-d', desc: '只同步文件数据，不同步不必要的元数据（更快）' },
        { flag: '-f', desc: '同步文件所在文件系统的全部数据' },
        { flag: '-i', desc: '同步块设备元数据，与设备相关的元信息' },
        { flag: '（相关）fsfreeze', desc: '冻结文件系统后做一致性快照，云盘快照前的最佳实践' }
      ],
      examples: [
        { cmd: 'sync', desc: '把内存脏页全部刷盘，卸载云盘或强制重启前的标准动作' },
        { cmd: 'sync && umount /data', desc: '刷盘后再卸载，确保文件系统被干净地关闭' },
        { cmd: 'sync -f /data/bigfile.log', desc: '只把某个大文件及其文件系统数据落盘' }
      ],
      notes: [
        '`sync` 只是“发起刷盘”，对机械盘或大脏页量可能需要几十秒才真正写完，紧接着 `umount` 时 `umount` 自己也会等待回写',
        '拔盘/分离云盘前不 `sync` 又不 `umount`，可能造成文件系统不一致，再次挂载时报需要 `fsck`',
        '云盘做快照前建议先 `sync`（更严格的做法是 `fsfreeze -f /data` 冻结后快照再 `-u` 解冻），否则快照可能捕获到未落盘的中间状态',
        '`sync` 不能替代 `fsync` 语义的应用程序设计：数据库等对一致性敏感的程序必须自己调用 `fsync`',
        '整机卡在 `sync` 上通常是磁盘 IO 已经饱和或盘出现故障，此时先看 `iostat -x 1`'
      ],
      related: ['ls9-umount', 'ls9-mount', 'ls9-blkdiscard', 'ls9-dd'],
      docs: 'https://man7.org/linux/man-pages/man1/sync.1.html',
      tags: ['刷盘', '数据安全', '卸载']
    },

    /* ---------- 44 / 65 ---------- */
    {
      id: 'ls9-fallocate',
      name: 'fallocate',
      alias: ['预分配', 'truncate', '稀疏文件'],
      level: 3,
      syntax: 'fallocate -l <大小> <文件>',
      summary: '瞬间为文件预分配真实磁盘空间，比 dd 生成大文件快得多且不写实际数据。',
      desc: '必须在支持该操作的文件系统上使用（ext4、XFS、btrfs 都支持）。用途包括：快速造大文件做空间占位测试、为数据库预分配数据文件、创建 swapfile（比 `dd` 快）。同族的 `truncate -s` 也能改文件大小，但它是**稀疏**的：文件看起来 10G，实际占用可能是 0，因此不能用来消耗磁盘空间做测试。查看稀疏文件的真实占用要用 `du -h`（看实际块）与 `ls -l`（看表观大小）对比。',
      params: [
        { flag: '-l <大小>', desc: '指定文件长度，支持单位 K/M/G/T，如 `-l 10G`' },
        { flag: '-o <偏移>', desc: '从指定偏移开始分配，做分区式布局时用' },
        { flag: '-n', desc: '只预留空间不改文件大小（不写 inode 大小）' },
        { flag: '-d', desc: '给文件打上“不要 COW 共享”的标记，避免快照后写放大' },
        { flag: '-z', desc: '把指定范围清零（会真实写盘）' },
        { flag: '-p', desc: '把文件剩余部分预分配，常用于下载工具' },
        { flag: '（truncate）-s <大小>', desc: '把文件大小设为指定值，默认创建稀疏文件' },
        { flag: '（truncate）-r <参考文件>', desc: '按参考文件的大小设置目标文件大小' }
      ],
      examples: [
        { cmd: 'fallocate -l 10G /data/testfile', desc: '瞬间造一个真实占用 10G 的文件，做空间占位测试' },
        { cmd: 'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile', desc: '用 fallocate 快速建 swapfile，比 dd 快很多' },
        { cmd: 'truncate -s 10G /data/sparse.img && ls -l /data/sparse.img && du -h /data/sparse.img', desc: '造一个稀疏文件：ls 显示 10G，du 显示实际占用接近 0' }
      ],
      notes: [
        '`fallocate -l 10G` 是**真实占用**磁盘 10G，用完记得删除，很容易把数据盘写满',
        '`truncate -s` 生成的是稀疏文件，**不占实际空间**；用它做“磁盘写满测试”是无效的，要真占空间请用 `fallocate`',
        '文件系统不支持 `fallocate` 时会报 `Operation not supported`，此时退回 `dd if=/dev/zero of=<文件> bs=1M count=<块数>`',
        '给正在被程序使用的文件做 truncate/fallocate 可能导致程序读到空洞（全零），不要对活跃文件操作',
        '稀疏文件拷贝时若用 `cp` 且不加 `--sparse=always`，会被展开成真实占用，容量会暴涨'
      ],
      related: ['ls9-dd', 'ls9-mkswap', 'ls9-df', 'ls9-du'],
      docs: 'https://man7.org/linux/man-pages/man1/fallocate.1.html',
      tags: ['预分配', '稀疏文件', 'swap']
    },

    /* ---------- 45 / 65 ---------- */
    {
      id: 'ls9-blkdiscard',
      name: 'blkdiscard',
      alias: ['TRIM', 'SSD 擦除', 'fstrim'],
      level: 4,
      syntax: 'blkdiscard [选项] <设备>',
      summary: '对 SSD 或支持 TRIM 的云盘下发丢弃指令，一次性清空设备数据并回收闪存块。',
      desc: '把设备的全部（或指定范围）扇区标记为不再使用，SSD 主控据此回收闪存块，比逐块写零快得多，也避免写放大。与 `fstrim` 的区别是：`fstrim` 作用于**已挂载的文件系统**，只丢弃文件系统中空闲的块，安全且应定期执行；`blkdiscard` 作用于**整个块设备**，会**清空全部数据**，只用于重建阵列、重新格式化前的清理，或把云盘归还前的数据擦除。云硬盘支持 TRIM 的机型上可以用它快速恢复盘的空闲块状态。',
      params: [
        { flag: '<设备>', desc: '目标块设备，如 `/dev/vdb`；**绝不能写正在使用或有数据的分区**' },
        { flag: '-o <偏移>', desc: '丢弃范围的起始偏移，如 `-o 1G`' },
        { flag: '-l <长度>', desc: '丢弃范围长度，配合 `-o` 用于只清理设备的某一段' },
        { flag: '-s', desc: '安全模式：先检查该范围内是否有非零数据，有则中止并报错' },
        { flag: '-f', desc: '禁用安全模式的检查，强制执行（更危险）' },
        { flag: '-z', desc: '用写零替代 discard 指令，用于不支持 TRIM 的设备' },
        { flag: '-n', desc: 'dry run：只显示会丢弃哪些范围，不真正执行' },
        { flag: '（替代）fstrim -av', desc: '对已挂载文件系统安全地 TRIM 空闲块，日常维护用这个' }
      ],
      examples: [
        { cmd: 'blkdiscard -n /dev/vdb', desc: '预演：只显示将要被丢弃的范围，不执行任何写操作' },
        { cmd: 'blkdiscard -s -f /dev/vdb', desc: '清空新盘 /dev/vdb 上的全部数据并回收闪存块，仅用于确认无数据的新盘' },
        { cmd: 'fstrim -av', desc: '对已挂载文件系统下发的安全 TRIM，日常维护应该用它而不是 blkdiscard' }
      ],
      notes: [
        '**`blkdiscard` 会不可逆地清空整块设备的数据**，且没有确认提示；执行前用 `lsblk` 与 `df -h` 双重确认目标设备上没有挂载任何分区',
        '绝对不要对系统盘（如 `/dev/vda`）或任何已挂载的设备执行，会瞬间毁掉系统与业务数据',
        '日常 SSD/云盘维护应使用 `fstrim -av`（或 `systemctl enable --now fstrim.timer`），它只丢弃空闲块，不碰数据',
        '设备或虚拟化层不支持 discard 时会报 `Operation not supported`，可改用 `-z` 写零；但写零是真实写满整盘，非常慢且消耗闪存寿命',
        '归还云盘、重建 RAID 前想彻底抹除数据，用 `blkdiscard` 比 `dd if=/dev/zero` 快几个数量级',
        '`-s` 安全模式会先读一遍设备判断是否全零，大容量盘上很慢，但对防误操作值得'
      ],
      related: ['ls9-dd', 'ls9-sync', 'ls9-mkfs-ext4', 'ls9-hdparm'],
      docs: 'https://man7.org/linux/man-pages/man8/blkdiscard.8.html',
      tags: ['SSD', 'TRIM', '高危']
    },

    /* ---------- 46 / 65 ---------- */
    {
      id: 'ls9-quota',
      name: 'quota / repquota',
      alias: ['磁盘配额', '用户配额'],
      level: 4,
      syntax: 'quota [-u|-g] [用户名]　/　repquota [-a|-u|-g] <文件系统>',
      summary: '按用户或用户组限制磁盘用量与文件数，避免个别账号把共享盘写满。',
      desc: '多用户共享一台服务器或一块数据盘时（如 Web 托管、教学环境、共享家目录），配额能防止某个账号把盘写满拖垮所有人。配额分**容量**（blocks，单位 KB）与 **inode 数**（文件个数）两类，每类又有软限（超过只警告，宽限期内可继续写）与硬限（绝对不可超过）。使用前提是文件系统挂载时带 `usrquota`/`grpquota` 选项，再用 `quotacheck` 生成配额文件、`edquota` 编辑限额、`quotaon` 启用；查看单个用户用 `quota -u`，批量汇总用 `repquota -a`。',
      params: [
        { flag: '-u（quota）', desc: '查看当前用户的配额使用情况（默认行为）' },
        { flag: '-g（quota）', desc: '查看当前用户所属组的配额' },
        { flag: '-v（quota）', desc: '显示所有已启用配额的文件系统，包括未超限的' },
        { flag: '-a（repquota）', desc: '报告所有已启用配额的文件系统的使用情况' },
        { flag: '-u / -g（repquota）', desc: '只报告用户配额或只报告组配额' },
        { flag: '-s（repquota）', desc: '用人类可读单位显示，避免手工换算 KB' },
        { flag: 'edquota -u <用户>', desc: '编辑指定用户的软限/硬限（容量与 inode 两类）' },
        { flag: 'quotaon / quotaoff', desc: '启用或关闭指定文件系统的配额，如 `quotaon -ugv /data`' }
      ],
      examples: [
        { cmd: 'mount -o remount,usrquota,grpquota /data', desc: '先给文件系统加上配额挂载选项（持久化要写进 /etc/fstab）' },
        { cmd: 'quotacheck -cugm /data && quotaon -ugv /data', desc: '生成配额文件并启用配额：`-c` 创建、`-u` 用户、`-g` 组、`-m` 不重挂只读' },
        { cmd: 'edquota -u deploy', desc: '编辑 deploy 用户的软限与硬限，保存后立即生效' },
        { cmd: 'repquota -as /data', desc: '汇总报告该文件系统上所有用户的用量与限额，运维巡检用' }
      ],
      notes: [
        '配额要求文件系统挂载时带 `usrquota`/`grpquota`，**只改 fstab 不重新挂载不生效**；XFS 用 `uquota`/`gquota`（或 `usrquota` 亦可）选项且用 `xfs_quota` 管理，命令体系与 ext4 不同',
        '配额是按**文件系统**生效的，同一用户在不同挂载点上要分别设置',
        '`quotacheck` 会遍历整个文件系统建立用量表，大容量盘耗时较长且吃 IO，建议低峰执行；执行期间最好让业务只读（`-m` 表示强制以读写方式检查）',
        '软限必须小于硬限，宽限期默认 7 天，可用 `edquota -t` 调整；超软限期间用户会收到警告但仍能写入',
        '`quota` 命令看到 “none” 或空值通常表示配额没启用成功，依次核对挂载选项、`aquota.user` 文件是否存在、`quotaon` 是否执行'
      ],
      related: ['ls9-df', 'ls9-du', 'ls9-fstab', 'ls9-mount'],
      docs: 'https://man7.org/linux/man-pages/man1/quota.1.html',
      tags: ['配额', '多用户', '容量管理']
    },

    /* 后续命令同样追加在这里，用逗号分隔 */
  );
})();

/* Ceph：分布式存储的只读巡检、定位与受控变更。命令归入磁盘与存储。 */
(function () {
  'use strict';
  var catId = 'linux-storage';
  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(
    /* ---------- 47 / 65 ---------- */
    {
      id: 'ceph-status',
      name: 'ceph -s',
      level: 1,
      syntax: 'ceph -s', summary: '查看集群健康、MON/OSD/MGR 状态、PG 分布和容量的第一入口。',
      desc: '先看 HEALTH，再核对 OSD up/in 数、PG 状态和容量。HEALTH_OK 只代表当前集群检查通过，不能代替业务读写验证；HEALTH_WARN 时继续用 health detail 定位具体检查项。',
      examples: [{ cmd: 'ceph -s', desc: '巡检集群概况，记录时间、健康码和 OSD 数量' }],
      notes: ['先确认当前 ceph.conf 与 keyring 指向目标集群；不要把“命令能连上 MON”当作业务已恢复。'],
      related: ['ceph-health-detail', 'ceph-pg-stat', 'ceph-df'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/monitoring/', tags: ['Ceph', '集群健康']
    },
    /* ---------- 48 / 65 ---------- */
    {
      id: 'ceph-health-detail',
      name: 'ceph health detail',
      level: 2,
      syntax: 'ceph health detail', summary: '展开健康告警的检查项与对象，分清容量、PG、OSD 或服务问题。',
      desc: '比 ceph -s 的一句 HEALTH_WARN 更具体：输出告警码、受影响的守护进程或 PG 数量。先记录告警码和持续时间，再按对应子系统继续查询，不要直接静音告警。',
      examples: [{ cmd: 'ceph health detail', desc: '查看当前全部健康检查项' }],
      notes: ['同一告警可能是恢复过程中的暂态；必须结合 PG 状态和客户端错误趋势判断。'],
      related: ['ceph-status', 'ceph-osd-tree', 'ceph-pg-stat'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/health-checks/', tags: ['Ceph', '告警', '排障']
    },
    /* ---------- 49 / 65 ---------- */
    {
      id: 'ceph-osd-tree',
      name: 'ceph osd tree',
      level: 2,
      syntax: 'ceph osd tree', summary: '按 CRUSH 层级查看 OSD 状态，定位失联主机及故障域。',
      desc: 'up/down 表示进程是否在线，in/out 表示是否参与数据放置；二者含义不同。结合 host 层级判断故障是否集中在同一台机器或机架。',
      examples: [{ cmd: 'ceph osd tree', desc: '按 host 查看 OSD 状态和权重' }],
      notes: ['看到 down 不要立刻执行 out；先查网络、磁盘和服务日志，并评估副本数及当前降级程度。'],
      related: ['ceph-health-detail', 'ceph-osd-df', 'ceph-orch-ps'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/monitoring/', tags: ['Ceph', 'OSD', 'CRUSH']
    },
    /* ---------- 50 / 65 ---------- */
    {
      id: 'ceph-osd-df',
      name: 'ceph osd df tree',
      level: 2,
      syntax: 'ceph osd df tree', summary: '按主机和 OSD 查看实际用量及利用率，识别热点与容量不均。',
      desc: '重点看 %USE 与 VAR，不能只看总集群剩余量；个别 OSD 接近 full 阈值时，即使总容量充足也会影响写入。',
      examples: [{ cmd: 'ceph osd df tree', desc: '按 CRUSH 层级比较 OSD 利用率' }],
      notes: ['跨设备类型的利用率差异不一定是异常；对照 CRUSH 规则和设备类别判断。'],
      related: ['ceph-df', 'ceph-osd-tree', 'ceph-crush-rule'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/monitoring/', tags: ['Ceph', 'OSD', '容量']
    },
    /* ---------- 51 / 65 ---------- */
    {
      id: 'ceph-pg-stat',
      name: 'ceph pg stat',
      level: 2,
      syntax: 'ceph pg stat', summary: '汇总 PG 状态，确认不可用、降级或恢复积压是否存在。',
      desc: 'active+clean 是常见健康状态；degraded 表示副本不完整，inactive 表示不能正常服务。恢复中可能出现 backfill/recovery，需观察数量是否持续下降。',
      examples: [{ cmd: 'ceph pg stat', desc: '快速查看各 PG 状态的数量' }],
      notes: ['不要为了让状态变绿直接调低副本数或禁用恢复；先确认容量、网络和故障 OSD。'],
      related: ['ceph-status', 'ceph-pg-query', 'ceph-osd-tree'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/monitoring/', tags: ['Ceph', 'PG', '恢复']
    },
    /* ---------- 52 / 65 ---------- */
    {
      id: 'ceph-pg-query',
      name: 'ceph pg query',
      level: 3,
      syntax: 'ceph pg <PG_ID> query', summary: '查询单个异常 PG 的 acting/up 集合及恢复状态，缩小故障范围。',
      desc: '先从健康告警获取真实 PG ID，再看 acting/up OSD、状态和异常原因；配合 OSD tree 查对应宿主机。不同版本 JSON 字段可能变化。',
      examples: [{ cmd: 'ceph pg 1.2a query', desc: '用告警给出的 PG ID 定位具体异常' }],
      notes: ['PG ID 必须来自当前集群的告警或列表，示例 ID 不一定存在。'],
      related: ['ceph-pg-stat', 'ceph-osd-tree', 'ceph-health-detail'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/monitoring/', tags: ['Ceph', 'PG', '排障']
    },
    /* ---------- 53 / 65 ---------- */
    {
      id: 'ceph-df',
      name: 'ceph df detail',
      level: 2,
      syntax: 'ceph df detail', summary: '同时查看集群 RAW 容量和各存储池的逻辑使用量、可用空间。',
      desc: 'RAW 是物理容量视角，池统计是逻辑对象视角；副本和纠删码开销使两者不能直接相加。重点对照 MAX AVAIL、%USED 和目标池的增长趋势。',
      examples: [{ cmd: 'ceph df detail', desc: '查看各池用量和集群容量' }],
      notes: ['MAX AVAIL 受 CRUSH 规则及最满 OSD 限制，不等于总剩余 RAW 容量。'],
      related: ['ceph-osd-df', 'ceph-pool-ls'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/monitoring/', tags: ['Ceph', '容量', '池']
    },
    /* ---------- 54 / 65 ---------- */
    {
      id: 'ceph-pool-ls',
      name: 'ceph osd pool ls detail',
      level: 2,
      syntax: 'ceph osd pool ls detail', summary: '列出存储池及副本、PG 等关键属性，确认业务使用的池配置。',
      desc: '检查池名、size/min_size、PG 数和应用类型。池是 RBD、CephFS、RGW 的底层资源，改池参数前应知道哪些客户端使用它。',
      examples: [{ cmd: 'ceph osd pool ls detail', desc: '查看当前池配置' }],
      notes: ['不要仅凭池名判断业务归属；结合 ceph osd pool application get 和业务配置。'],
      related: ['ceph-pool-get', 'ceph-df', 'ceph-rbd-ls'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/pools/', tags: ['Ceph', 'pool', '配置']
    },
    /* ---------- 55 / 65 ---------- */
    {
      id: 'ceph-pool-get',
      name: 'ceph osd pool get',
      level: 2,
      syntax: 'ceph osd pool get <POOL> size', summary: '读取池的副本数等单项参数，核对容量与故障容忍度。',
      desc: 'size 是目标副本数，min_size 是允许写入的最少副本数；这两个值不能脱离当前故障域与业务可用性要求单独判断。',
      examples: [{ cmd: 'ceph osd pool get volumes size', desc: '查看 volumes 池的目标副本数' }, { cmd: 'ceph osd pool get volumes min_size', desc: '查看最低写入副本数' }],
      notes: ['示例池名需替换为实际池；不要在故障时随意调低 min_size 让告警消失。'],
      related: ['ceph-pool-ls', 'ceph-crush-rule'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/pools/', tags: ['Ceph', 'pool', '副本']
    },
    /* ---------- 56 / 65 ---------- */
    {
      id: 'ceph-pool-create',
      name: 'ceph osd pool create',
      level: 3,
      syntax: 'ceph osd pool create <POOL> [PG_NUM]', summary: '在隔离集群创建池，并在交付前确认应用类型和放置规则。',
      desc: '建池会改变集群元数据；PG 数的建议取决于 Ceph 版本和 autoscaler。现代集群先确认 pg_autoscale_mode，不要套用旧文章的固定计算公式。',
      examples: [{ cmd: 'ceph osd pool create lab-rbd', desc: '仅在隔离实验集群创建池' }, { cmd: 'ceph osd pool application enable lab-rbd rbd', desc: '明确池的应用类型' }],
      notes: ['生产创建前确认命名、配额、CRUSH 规则与审批；不要在已有业务池上照抄示例。'],
      related: ['ceph-pool-ls', 'ceph-pool-get', 'ceph-crush-rule'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/pools/', tags: ['Ceph', 'pool', '变更']
    },
    /* ---------- 57 / 65 ---------- */
    {
      id: 'ceph-crush-rule',
      name: 'ceph osd crush rule',
      level: 3,
      syntax: 'ceph osd crush rule ls / ceph osd crush rule dump <RULE>', summary: '核对数据放置规则和故障域，解释副本为何落在特定设备或主机。',
      desc: 'CRUSH 规则决定根、设备类别及 host/rack 等故障域。看到容量不均或副本落点异常时，先读取规则与池的 crush_rule，再考虑配置变更。',
      examples: [{ cmd: 'ceph osd crush rule ls', desc: '列出可用放置规则' }, { cmd: 'ceph osd pool get volumes crush_rule', desc: '确认业务池使用哪条规则' }],
      notes: ['修改 CRUSH 规则可能触发大量数据迁移；先评估容量和恢复窗口。'],
      related: ['ceph-osd-tree', 'ceph-osd-df', 'ceph-pool-get'],
      docs: 'https://docs.ceph.com/en/latest/rados/operations/crush-map/', tags: ['Ceph', 'CRUSH', '故障域']
    },
    /* ---------- 58 / 65 ---------- */
    {
      id: 'ceph-orch-ps',
      name: 'ceph orch ps',
      level: 2,
      syntax: 'ceph orch ps [--daemon_type <TYPE>]', summary: '在 cephadm 管理的集群中查看守护进程所在主机与运行状态。',
      desc: '用于确认 MON、MGR、OSD、MDS、RGW 的编排状态及部署位置；它是 cephadm 编排接口，不适用于所有旧式或外部编排集群。',
      examples: [{ cmd: 'ceph orch ps', desc: '列出 cephadm 托管的守护进程' }, { cmd: 'ceph orch host ls', desc: '对照编排主机清单' }],
      notes: ['如果返回 orchestrator not configured，先确认部署方式，不要把它当作 OSD 全部宕机。'],
      related: ['ceph-osd-tree', 'ceph-status'],
      docs: 'https://docs.ceph.com/en/latest/cephadm/operations/', tags: ['Ceph', 'cephadm', '守护进程']
    },
    /* ---------- 59 / 65 ---------- */
    {
      id: 'ceph-rbd-ls',
      name: 'rbd ls',
      level: 2,
      syntax: 'rbd ls -p <POOL>', summary: '列出 RBD 池中的块设备镜像，核对虚机或容器卷是否存在。',
      desc: 'RBD 是块存储入口，列表只能证明镜像元数据存在；要确认大小、特性和快照需继续 rbd info、rbd snap ls。',
      examples: [{ cmd: 'rbd ls -p volumes', desc: '查看 volumes 池中的镜像清单' }],
      notes: ['先确认当前 Ceph 集群及池名；不要把同名镜像与业务实例直接对应。'],
      related: ['ceph-rbd-info', 'ceph-rbd-snap', 'ceph-pool-ls'],
      docs: 'https://docs.ceph.com/en/latest/rbd/rados-rbd-cmds/', tags: ['Ceph', 'RBD', '块存储']
    },
    /* ---------- 60 / 65 ---------- */
    {
      id: 'ceph-rbd-info',
      name: 'rbd info',
      level: 2,
      syntax: 'rbd info <POOL>/<IMAGE>', summary: '查看 RBD 镜像的大小、对象布局、特性与快照状态。',
      desc: '结合 image size、features 和 block_name_prefix 判断卷配置；resize 或映射前先确认镜像没有被错误业务引用。',
      examples: [{ cmd: 'rbd info volumes/web01', desc: '查看指定镜像元数据' }],
      notes: ['镜像大小不等于已经占用的原始物理容量；配合 rbd du 与池统计。'],
      related: ['ceph-rbd-ls', 'ceph-rbd-snap', 'ceph-df'],
      docs: 'https://docs.ceph.com/en/latest/rbd/rados-rbd-cmds/', tags: ['Ceph', 'RBD', '镜像']
    },
    /* ---------- 61 / 65 ---------- */
    {
      id: 'ceph-rbd-snap',
      name: 'rbd snap ls',
      level: 3,
      syntax: 'rbd snap ls <POOL>/<IMAGE>', summary: '检查 RBD 镜像快照，确认保护点与依赖链。',
      desc: '快照是镜像级时间点，不等于应用一致性备份。克隆镜像可能依赖受保护快照，删除前必须查子镜像和恢复策略。',
      examples: [{ cmd: 'rbd snap ls volumes/web01', desc: '列出镜像已有快照' }],
      notes: ['生产创建快照前应先做应用 quiesce/一致性处理；不要把快照当作异地备份。'],
      related: ['ceph-rbd-info', 'ceph-rbd-ls'],
      docs: 'https://docs.ceph.com/en/latest/rbd/rados-rbd-cmds/', tags: ['Ceph', 'RBD', '快照']
    },
    /* ---------- 62 / 65 ---------- */
    {
      id: 'ceph-fs-status',
      name: 'ceph fs status',
      level: 2,
      syntax: 'ceph fs status [<FS_NAME>]', summary: '查看 CephFS 文件系统及 MDS 状态，区分存储层和元数据服务问题。',
      desc: '客户端挂载卡住时先看 MDS 是否有 active 实例、standby 是否就绪及元数据池健康，再看底层 OSD/PG。',
      examples: [{ cmd: 'ceph fs status', desc: '汇总全部 CephFS 与 MDS 状态' }],
      notes: ['MDS active 不代表客户端权限、挂载参数和网络都正确；还需端到端读写验证。'],
      related: ['ceph-status', 'ceph-pg-stat', 'ceph-fs-subvolume'],
      docs: 'https://docs.ceph.com/en/latest/cephfs/administration/', tags: ['Ceph', 'CephFS', 'MDS']
    },
    /* ---------- 63 / 65 ---------- */
    {
      id: 'ceph-fs-subvolume',
      name: 'ceph fs subvolume ls',
      level: 3,
      syntax: 'ceph fs subvolume ls <FS_NAME> [<GROUP_NAME>]', summary: '列出 CephFS 子卷，核对 CSI 或租户目录的卷是否存在。',
      desc: 'Kubernetes CephFS CSI 常用子卷承载 PVC；先确认文件系统名和子卷组，再将结果与 CSI 对象及业务挂载点对应。',
      examples: [{ cmd: 'ceph fs subvolume ls cephfs', desc: '列出 cephfs 默认组下的子卷' }],
      notes: ['直接在 Ceph 端删除子卷会绕过 Kubernetes 的生命周期管理；优先从业务系统查归属。'],
      related: ['ceph-fs-status', 'ceph-pool-ls'],
      docs: 'https://docs.ceph.com/en/latest/cephfs/fs-volumes/', tags: ['Ceph', 'CephFS', 'CSI']
    },
    /* ---------- 64 / 65 ---------- */
    {
      id: 'ceph-rgw-bucket',
      name: 'radosgw-admin bucket stats',
      level: 3,
      syntax: 'radosgw-admin bucket stats --bucket <BUCKET>', summary: '在 RGW 节点查看桶的对象数和用量，排查对象存储配额问题。',
      desc: '这是 RGW 管理命令，不是普通 S3 客户端命令；只在拥有相应管理权限的 RGW 环境使用。',
      examples: [{ cmd: 'radosgw-admin bucket stats --bucket lab-backups', desc: '查看指定桶的对象统计' }],
      notes: ['统计值可能有延迟；与 S3 List/Head 及实际上传下载验证一起判断。'],
      related: ['ceph-df', 'ceph-status'],
      docs: 'https://docs.ceph.com/en/latest/radosgw/admin/', tags: ['Ceph', 'RGW', '对象存储']
    },
    /* ---------- 65 / 65 ---------- */
    {
      id: 'ceph-config-dump',
      name: 'ceph config dump',
      level: 3,
      syntax: 'ceph config dump', summary: '查看集中配置数据库中的设置，排查集群参数与预期不一致。',
      desc: '集中配置只是配置来源之一；守护进程的最终生效值可通过 ceph config show <daemon> 核对，还要考虑本地文件与运行时覆盖。',
      examples: [{ cmd: 'ceph config dump', desc: '列出集群配置数据库中的条目' }],
      notes: ['查看输出时注意可能包含敏感地址或凭据；不要把原始配置直接公开分享。'],
      related: ['ceph-status', 'ceph-orch-ps'],
      docs: 'https://docs.ceph.com/en/latest/rados/configuration/ceph-conf/', tags: ['Ceph', '配置', '排障']
    }
  );
})();
