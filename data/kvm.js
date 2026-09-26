/* data/kvm.js · 分类 16 虚拟化与镜像 */
(function () {
  'use strict';

  var catId = 'kvm';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. virsh 虚拟机管理 ================= */

    /* ---------- 1 / 25 ---------- */
    {
      id: 'vm-virsh-list',
      name: 'virsh list',
      alias: ['virsh list --all', '查看虚拟机', '列出虚机'],
      level: 1,
      syntax: 'virsh list [--all] [--inactive] [--autostart] [--with-snapshot] [--title]',
      summary: '列出 KVM 虚拟机及其运行状态，管理虚拟机的第一个命令。',
      desc: '`virsh list` 默认只显示**正在运行**的虚拟机，这一点和 `docker ps` 一样容易让人误会"我的虚机不见了"。加上 `--all` 才会把已定义但未启动的一并列出，状态列会显示 `running`、`shut off`、`paused`、`crashed`。\n\n输出列的含义：`Id` 是运行时的临时编号（关机后消失，**不要用它做脚本标识**），`Name` 是持久化的域名，`State` 是状态。脚本里操作虚拟机一律用 `Name` 或 UUID。\n\n配套命令：`virsh dominfo <名称>` 看单台详情，`virsh list --autostart` 看哪些设置了开机自启（这个信息在排查"宿主机重启后虚机没起来"时非常关键）。',
      params: [
        { flag: '--all', desc: '列出所有虚拟机，包括已关机（shut off）的，最常用' },
        { flag: '--inactive', desc: '只列出已定义但未运行的虚拟机' },
        { flag: '--autostart', desc: '只列出设置了开机自启的虚拟机' },
        { flag: '--no-autostart', desc: '只列出没有设置开机自启的虚拟机，用于查漏' },
        { flag: '--with-snapshot', desc: '只列出存在快照的虚拟机' },
        { flag: '--title', desc: '显示虚拟机标题（来自 XML 的 title 字段）' },
        { flag: '-c qemu:///system', desc: '指定连接 URI；普通用户默认连 `qemu:///session` 会看不到系统级虚机' }
      ],
      examples: [
        { cmd: 'virsh list --all', desc: '列出所有虚拟机及状态，管理虚机的第一步' },
        { cmd: 'virsh list --autostart', desc: '查看哪些虚机设置了开机自启，宿主机重启后排障必看' },
        { cmd: 'virsh list --all --title', desc: '带标题列出，多台同类型虚机时更容易辨认用途' },
        { cmd: 'virsh list --all | grep -c running', desc: '统计运行中的虚机数量，用于巡检脚本' }
      ],
      notes: [
        '**不加 `--all` 时已关机的虚机不会显示**，很多人以为虚机被删了，其实只是关机状态',
        '非 root 用户执行时默认连接 `qemu:///session`，只能看到自己创建的虚机；要管系统级虚机请 `sudo virsh` 或加 `-c qemu:///system`',
        '`Id` 列是运行时编号，重启或关机后会变，**脚本里必须用名称或 UUID**',
        '报 `Failed to connect to the hypervisor` 说明 `libvirtd` 没运行，先 `systemctl status libvirtd`',
        '宿主机重启后虚机没自动起来，先查 `virsh list --no-autostart`，多半是没设 `virsh autostart`'
      ],
      related: ['vm-virsh-start', 'vm-virsh-dominfo', 'vm-virsh-autostart', 'lu-systemctl'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '虚拟机', '状态查看', 'libvirt']
    },

    /* ---------- 2 / 25 ---------- */
    {
      id: 'vm-virsh-start',
      name: 'virsh start / shutdown',
      alias: ['virsh start', 'virsh shutdown', '启动虚机', '优雅关机'],
      level: 2,
      syntax: 'virsh start <域名> | virsh shutdown <域名> [--mode acpi|agent|initctl|signal] [--force]',
      summary: '启动虚拟机，或向虚拟机发送优雅关机信号等待其正常关闭。',
      desc: '`virsh start` 启动一台已定义的虚拟机；`virsh shutdown` 是**优雅关机**：向客户机发送 ACPI 关机信号，等价于在虚机里点击"关机"，需要客户机内安装并运行 ACPI 服务（Linux 通常由 systemd 处理，Windows 需要 QEMU Guest Agent 或 ACPI 驱动）。\n\n**关键点：`shutdown` 是异步的**，命令立刻返回但虚机还在关机过程中。脚本里必须轮询等待真正关机完成，否则后续操作（如克隆磁盘、改配置）会在虚机仍在运行时执行，导致数据损坏。\n\n如果客户机没装 ACPI 支持（老系统、精简镜像），`shutdown` 会一直不生效，虚机停在 running 状态。此时正确做法是登录虚机内部执行 `poweroff`，或用 `virsh shutdown --mode agent`（需要 qemu-guest-agent 已安装并运行）。`--force` 会走 ACPI 的强制路径，但仍是请求关机而非切断电源。\n\n**真正停不下来的场景**（内核 panic、死锁）只能用 `virsh destroy`，见下一条。',
      params: [
        { flag: 'start <域名>', desc: '启动指定虚拟机' },
        { flag: 'shutdown <域名>', desc: '发送 ACPI 优雅关机请求' },
        { flag: '--mode acpi', desc: '默认方式，通过 ACPI 信号请求关机' },
        { flag: '--mode agent', desc: '通过 QEMU Guest Agent 请求关机，需要虚机内安装 agent' },
        { flag: '--mode initctl', desc: '通过客户机内的 init 系统请求关机' },
        { flag: '--mode signal', desc: '向客户机内进程发送信号触发关机' },
        { flag: '--force', desc: '强制走关机流程（仍是请求，不是断电）' }
      ],
      examples: [
        { cmd: 'virsh start web-prod-01', desc: '启动名为 web-prod-01 的虚拟机' },
        { cmd: 'virsh shutdown web-prod-01', desc: '发送优雅关机请求' },
        { cmd: 'virsh shutdown --mode agent web-prod-01', desc: '通过 Guest Agent 关机，比 ACPI 更可靠' },
        { cmd: 'virsh shutdown web-prod-01; while virsh domstate web-prod-01 | grep -q running; do sleep 2; done; echo 已关机', desc: '关机并轮询等待真正完成，脚本里的正确姿势' },
        { cmd: 'virsh domstate web-prod-01', desc: '查看虚机当前状态，确认关机是否完成' }
      ],
      notes: [
        '**`virsh shutdown` 是异步的**：命令返回不代表已关机，脚本里必须 `virsh domstate` 轮询确认，否则后续操作会破坏运行中的数据',
        '**客户机没装 ACPI 支持时 `shutdown` 会完全无效**：老旧的 Windows、精简 Linux 镜像都可能不响应，需要安装 `qemu-guest-agent` 或用 `--mode agent`',
        '`--force` 不是断电，它只是走 ACPI 的强制路径；要真正切断电源用 `virsh destroy`（危险，见下一条）',
        '虚机内如果正在 fsck、跑长事务或有大内存写入，优雅关机可能需要数分钟，**不要着急上 destroy**',
        'Windows 虚机建议安装 virtio-win 驱动与 QEMU Guest Agent，否则关机、查询 IP、冻结文件系统等能力都会缺失',
        '批量操作多台虚机时先确认业务是否允许同时关机，滚动操作比一次性全关安全得多'
      ],
      related: ['vm-virsh-destroy', 'vm-virsh-list', 'vm-virsh-console', 'vm-virsh-autostart'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '启动', '优雅关机', 'libvirt']
    },

    /* ---------- 3 / 25 ---------- */
    {
      id: 'vm-virsh-destroy',
      name: 'virsh destroy',
      alias: ['virsh destroy', '强制关闭虚机', '虚机断电'],
      level: 2,
      syntax: 'virsh destroy <域名> [--graceful]',
      summary: '立即强制关闭虚拟机，效果等同拔掉电源，只作为最后手段使用。',
      desc: '`virsh destroy` 的名字非常有误导性：**它不删除虚拟机，只是立刻切断电源**。libvirt 向 QEMU 进程发送停止指令，虚机没有任何机会做收尾工作——不刷盘、不卸载文件系统、不通知应用。\n\n**后果是什么**：磁盘上可能存在未落盘的数据（丢最近若干秒的写入）；文件系统可能处于不一致状态，下次启动需要 journal 恢复甚至 fsck；数据库可能出现需要恢复的损坏（MySQL 的 InnoDB 通常能恢复，但可能耗时很久）；正在执行的事务全部丢失；如果是分布式系统的一个节点，还可能触发集群重新选主。\n\n**正确使用顺序**：① 先 `virsh shutdown`（优雅）；② 等待 1~2 分钟（用 `virsh domstate` 轮询）；③ 如果客户机完全无响应（内核 panic、死锁、OOM 卡死）才用 `destroy`；④ 用 `destroy` 之后，**下次启动务必关注文件系统自检与数据库恢复日志**。\n\n`--graceful` 参数会先尝试友好地通知客户机（如通过 Guest Agent），失败后再强制切断——如果一定要用强制手段，优先加这个参数。\n\n**注意它不会删除虚机定义**：要用 `virsh undefine` 才会移除配置，而磁盘文件仍需手工决定是否删除。',
      params: [
        { flag: '<域名>', desc: '要强制下电的虚拟机名称、ID 或 UUID' },
        { flag: '--graceful', desc: '先尝试优雅关闭，失败后再强制下电' },
        { flag: 'domstate <域名>', desc: '配套使用：确认下电是否完成（状态变为 shut off）' },
        { flag: 'undefine <域名>', desc: '删除虚机定义（与 destroy 完全不同，destroy 只下电）' }
      ],
      examples: [
        { cmd: 'virsh shutdown web-prod-01 && sleep 30 && virsh domstate web-prod-01', desc: '首选姿势：先优雅关机，等待后确认状态' },
        { cmd: 'virsh destroy web-prod-01', desc: '仅在虚机彻底无响应时使用，等同拔电源' },
        { cmd: 'virsh destroy --graceful web-prod-01', desc: '需要强制时优先加 --graceful，先尝试友好通知' },
        { cmd: 'virsh domstate web-prod-01 && virsh dominfo web-prod-01 | grep -i state', desc: '下电后确认状态，再决定后续操作' },
        { cmd: 'virsh start web-prod-01 && virsh console web-prod-01', desc: '强制下电后重启并进控制台，重点看文件系统自检与数据库恢复日志' }
      ],
      notes: [
        '**`virsh destroy` = 拔电源，不是"删除虚拟机"**：名字极具误导性，它会立即切断电源且不通知客户机',
        '**强制下电会丢数据**：未落盘的写缓存、进行中的事务、内存里的状态全部丢失；数据库、消息队列等有状态服务尤其危险',
        '**可能造成文件系统损坏**：下次启动会触发 journal 恢复甚至全盘 fsck，大容量磁盘可能耗时数十分钟',
        '**永远先试 `virsh shutdown`**，并耐心等待 1~2 分钟；只有客户机完全无响应时才用 destroy',
        '**destroy 不会删除虚机定义**：虚机仍在 `virsh list --all` 里，只是状态为 shut off；要删除请用 `virsh undefine`（并单独确认磁盘文件是否保留）',
        '强制下电是"事后能解释"的操作：生产环境请记录时间、原因与操作人，并在重启后核对应用日志与数据一致性',
        '删除了虚机定义但硬盘文件还在，会变成"孤儿磁盘"占空间，清理前务必确认不再需要（重要数据先备份）'
      ],
      related: ['vm-virsh-start', 'vm-virsh-list', 'vm-virsh-snapshot', 'vm-virsh-dominfo'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '强制关机', '高危操作', '数据风险']
    },

    /* ---------- 4 / 25 ---------- */
    {
      id: 'vm-virsh-console',
      name: 'virsh console',
      alias: ['virsh console', '虚机串口控制台', '连接虚机终端'],
      level: 2,
      syntax: 'virsh console <域名> [--devname <设备名>] [--force]',
      summary: '通过串口连接到虚拟机控制台，网络不通时的救命通道。',
      desc: '当虚机 SSH 连不上、网络配置改错、甚至还没装好系统时，`virsh console` 是唯一的入口。它连接的是客户机的**虚拟串口**（serial console），不依赖网络，因此特别适合救援场景。\n\n**前提是客户机把控制台输出到了串口**：Linux 需要在 GRUB 里加 `console=ttyS0,115200` 内核参数，并在 `/etc/securetty`（较老系统）与 systemd 的 `getty@ttyS0` 服务上做配置。很多云镜像已经默认开启，自建虚机常常忘了配，表现是"连上去一片空白"。\n\n**退出方式**：`Ctrl + ]`（这是默认的转义键）。很多人在控制台里找不到退出办法只能关终端窗口，其实记住这个组合键就行。\n\n`virsh console` 在宿主机终端里运行，也可以配合 `--devname` 指定其他串口设备；如果是用 `virt-install --graphics none --console pty,target_type=serial` 安装的系统，串口通常已经配好。',
      params: [
        { flag: 'console <域名>', desc: '连接到虚机的串口控制台' },
        { flag: '--devname <设备名>', desc: '指定要连接的串口设备名，多个串口时使用' },
        { flag: '--force', desc: '强制连接（即使已有其他会话占用）' },
        { flag: 'Ctrl + ]', desc: '退出控制台的转义键，务必记住' },
        { flag: '-e <字符>', desc: 'virsh 全局参数：自定义转义字符，避免与现有习惯冲突' }
      ],
      examples: [
        { cmd: 'virsh console web-prod-01', desc: '连接虚机控制台，退出按 Ctrl + ]' },
        { cmd: 'virsh console web-prod-01 --force', desc: '强制接管已被占用的控制台会话' },
        { cmd: 'virsh list --all && virsh console db-prod-01', desc: '网络不通时通过控制台登录排查' },
        { cmd: 'virsh dumpxml web-prod-01 | grep -A3 "console\\|serial"', desc: '检查虚机 XML 里是否配置了串口设备' }
      ],
      notes: [
        '**退出控制台按 `Ctrl + ]`**：不知道这个键会以为终端卡死了',
        '**客户机必须把控制台重定向到串口**（GRUB 加 `console=ttyS0,115200`），否则连上去只有一片空白，这是最常见的"console 不管用"原因',
        '串口控制台**不支持复制粘贴**，粘贴大段配置请改用 SSH 或 `virt-customize` 直接改镜像',
        '中文显示在串口上通常乱码，救援时建议用英文或只用命令行',
        '同一虚机的控制台可能只允许一个会话，被占用时加 `--force` 接管',
        '它是救援通道，**不是日常运维入口**：日常操作请用 SSH，控制台留作网络故障时使用',
        '容器环境下没有直接的 `virsh console`，需要通过 `virsh ttyconsole` 或宿主机终端接入'
      ],
      related: ['vm-virsh-list', 'vm-virsh-start', 'vm-virsh-edit', 'ln-ssh'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '串口控制台', '救援', 'libvirt']
    },

    /* ---------- 5 / 25 ---------- */
    {
      id: 'vm-virsh-edit',
      name: 'virsh edit',
      alias: ['virsh edit', 'virsh define', 'virsh dumpxml', '修改虚机配置'],
      level: 3,
      syntax: 'virsh edit <域名> | virsh dumpxml <域名> > <文件>.xml | virsh define <文件>.xml',
      summary: '编辑虚拟机 XML 配置，改 CPU、内存、磁盘与网卡等硬件参数。',
      desc: '`virsh edit` 打开虚机的 XML 定义（实际调用 `$EDITOR`），保存时 libvirt 会校验 XML 是否符合 schema，不符合会拒绝写回并让你重新编辑。这个"校验后生效"的机制比直接改 `/etc/libvirt/qemu/*.xml` 安全得多——**直接改文件不会触发校验，写错可能导致虚机无法启动**。\n\n**改配置前先导出备份**：`virsh dumpxml <域名> > /opt/kvm/xml/<域名>-$(date +%F).xml`。这是硬性纪律，因为改坏之后没有备份就只能凭记忆恢复。\n\n**大部分改动需要重启虚机才生效**，但部分参数支持热插拔：内存（`virsh setmem`，需要客户机支持内存热插拔）、CPU（`virsh setvcpus`，需要 `maxvcpus` 预留）、磁盘与网卡（`virsh attach-disk` / `attach-interface`）。\n\n**容易改错的地方**：磁盘的 `<source file=...>` 路径写错会让虚机起不来；`<driver name="qemu" type="qcow2"/>` 与实际镜像格式不一致会导致启动失败或数据损坏（**格式写错是危险操作**）；MAC 地址冲突会导致网络异常。\n\n如果虚机已经在运行，`virsh edit` 修改的是持久化配置（下次启动生效），当前运行实例不受影响；要同时改运行实例需用 `--live` 类命令。',
      params: [
        { flag: 'edit <域名>', desc: '编辑虚机 XML 定义，保存时自动校验' },
        { flag: 'dumpxml <域名>', desc: '导出当前 XML 定义，改前备份用' },
        { flag: 'define <文件>', desc: '从 XML 文件定义（或更新）虚机' },
        { flag: 'undefine <域名> --keep-natives', desc: '删除定义（配合 `--nvram` 等参数保留固件变量）' },
        { flag: 'domxml-to-native / domxml-from-native', desc: 'libvirt XML 与 QEMU 命令行之间的相互转换，排障时用' },
        { flag: 'setmem / setvcpus', desc: '在线调整内存与 CPU（需客户机与配置支持）' }
      ],
      examples: [
        { cmd: 'virsh dumpxml web-prod-01 > /opt/kvm/xml/web-prod-01-$(date +%F).xml', desc: '改配置前先备份 XML，出问题可快速回滚' },
        { cmd: 'virsh edit web-prod-01', desc: '编辑虚机配置，保存时 libvirt 会校验 XML' },
        { cmd: 'virsh define /opt/kvm/xml/web-prod-01-2024-03-18.xml', desc: '从备份文件恢复虚机定义' },
        { cmd: 'virsh domxml-to-native qemu-argv /opt/kvm/xml/web-prod-01.xml', desc: '把 XML 转成 QEMU 命令行，确认实际启动参数' },
        { cmd: 'virsh setmem web-prod-01 4G --live', desc: '在线把内存调整为 4G（需客户机支持内存热插拔）' }
      ],
      notes: [
        '**改 XML 前必须 `virsh dumpxml` 备份**，这是唯一的回滚手段；不要直接编辑 `/etc/libvirt/qemu/*.xml`，那样不经过校验',
        '**磁盘 `<driver type=` 必须与镜像实际格式一致**：把 raw 镜像标成 qcow2（或反之）会导致启动失败甚至写坏数据',
        '磁盘 source 路径写错是虚机起不来的常见原因，改完先用 `virsh start` 验证',
        '**大多数改动需要关机重启才生效**：内存、CPU、磁盘等硬件拓扑类参数不能在线改，`virsh edit` 只更新持久化定义',
        '改 MAC 地址要避免同网段冲突，否则会出现"虚机网络时通时断"的诡异现象',
        '`virsh edit` 使用 `$EDITOR`，容器或精简环境里可能没设置，先 `export EDITOR=vi`',
        'XML 校验失败会提示具体行号，按提示改即可；**不要忽略校验错误强行保存**'
      ],
      related: ['vm-virsh-dominfo', 'vm-virsh-start', 'vm-img-create', 'vm-virsh-snapshot'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', 'XML配置', '虚机定义', 'libvirt']
    },

    /* ---------- 6 / 25 ---------- */
    {
      id: 'vm-virsh-dominfo',
      name: 'virsh dominfo / domblklist',
      alias: ['virsh dominfo', 'virsh domblklist', '虚机信息查询'],
      level: 2,
      syntax: 'virsh dominfo <域名> | virsh domblklist <域名> [--details] | virsh domiflist <域名> | virsh domstats <域名>',
      summary: '查看虚机的资源配置、磁盘与网卡清单，核对实际生效状态。',
      desc: '这一组命令解决同一个问题：**"这台虚机到底是什么配置、磁盘文件在哪、网卡接在哪个网桥上"**。\n\n`virsh dominfo` 给出概览：状态、CPU 数、内存分配与最大内存、CPU 时间、自启设置、UUID、安全标签。排查"内存不生效"时特别有用——`Max memory` 与 `Used memory` 不一致说明热插拔受限。\n\n`virsh domblklist --details` 列出虚机的所有块设备、目标设备名（如 `vda`）、磁盘类型与源文件路径，**是确认"这台虚机的磁盘文件到底在哪个目录"最快的办法**，做备份、扩容、迁移前必查。\n\n`virsh domiflist` 列出网卡及其所属虚拟网络/网桥与 MAC 地址，排查网络问题时先看它确认虚机接在哪个桥上。\n\n`virsh domstats` 是性能数据的宝库：CPU 时间、块设备 IO 统计、网络流量、内存气球（balloon）状态等，可加 `--cpu-total`、`--block`、`--interface`、`--state` 等参数过滤，适合写监控脚本采集。',
      params: [
        { flag: 'dominfo <域名>', desc: '虚机概览：状态、CPU、内存、自启、UUID、安全标签' },
        { flag: 'domblklist <域名> --details', desc: '列出磁盘设备与源文件路径，含类型与容量' },
        { flag: 'domiflist <域名>', desc: '列出网卡、MAC 与所属网络/网桥' },
        { flag: 'domstats <域名>', desc: '输出详细统计，可加 `--state`、`--cpu-total`、`--block`、`--interface`' },
        { flag: 'domblkinfo <域名> <设备>', desc: '查看单块磁盘的容量、分配量与物理块大小' },
        { flag: 'vcpucount <域名>', desc: '查看 vCPU 的当前值与最大值，确认能否热插拔' }
      ],
      examples: [
        { cmd: 'virsh dominfo web-prod-01', desc: '查看虚机概览：状态、CPU、内存、自启设置' },
        { cmd: 'virsh domblklist web-prod-01 --details', desc: '列出磁盘设备与源文件路径，做备份与扩容前必查' },
        { cmd: 'virsh domiflist web-prod-01', desc: '查看网卡挂在哪个虚拟网络或网桥上' },
        { cmd: 'virsh domstats web-prod-01 --state --cpu-total --balloon', desc: '采集状态、CPU 时间与内存气球数据，可用于监控脚本' },
        { cmd: 'virsh domblkinfo web-prod-01 vda', desc: '查看 vda 的容量与已分配空间，确认扩容是否生效' },
        { cmd: 'virsh vcpucount web-prod-01', desc: '查看 vCPU 当前值与最大值，判断能否在线加核' }
      ],
      notes: [
        '**`dominfo` 里 `Max memory` 与 `Used memory` 不一致**说明内存热插拔能力受限，配置了更大内存但虚机没吃到',
        '`domblklist` 不带 `--details` 时不显示源文件路径，做备份或迁移务必要加',
        '**磁盘源文件路径不要手工拼接**：以 `domblklist` 输出为准，避免因软链接或存储池映射而找错文件',
        '`domstats` 输出很长且是 `key=value` 格式，脚本里建议配合 `grep` 或 `--state` 之类的过滤参数',
        '虚机运行的性能数据在虚机内部看更准确（用 `top`、`iostat`），`domstats` 反映的是宿主机视角的汇总',
        '`domiflist` 显示的是配置层面，虚机内实际 IP 需要用 `virsh domifaddr <域名> --source agent`（需 Guest Agent）'
      ],
      related: ['vm-virsh-list', 'vm-virsh-edit', 'vm-img-info', 'vm-img-resize'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '信息查询', '磁盘', '网卡']
    },

    /* ---------- 7 / 25 ---------- */
    {
      id: 'vm-virsh-snapshot',
      name: 'virsh snapshot',
      alias: ['virsh snapshot-create-as', 'virsh snapshot-list', 'virsh snapshot-revert', '虚机快照'],
      level: 3,
      syntax: 'virsh snapshot-create-as <域名> <快照名> ["描述"] [--disk-only] [--atomic] [--quiesce] | virsh snapshot-list <域名> | virsh snapshot-revert <域名> <快照名>',
      summary: '给虚拟机打快照并快速回滚，变更前的必备保险措施。',
      desc: '快照分两类，理解区别很关键：\n- **系统检查点（默认）**：同时保存磁盘状态与内存状态，回滚后虚机从快照那一刻继续运行（包括内存里的进程），恢复最快但占用空间大；\n- **磁盘快照（`--disk-only`）**：只保存磁盘，回滚后需要重新启动虚机，适合"改配置前留个底"的场景，空间占用小得多。\n\n**打快照的正确时机**：改内核参数、升级软件、调整分区、做危险操作之前。命名建议带日期与用途（如 `before-kernel-upgrade-20240318`），并加描述，否则过几个月没人知道哪个能删。\n\n**`--quiesce` 是数据一致性的关键**：它要求虚机内运行 QEMU Guest Agent，会在打快照前冻结文件系统，保证快照里的数据是一致的。**没有 `--quiesce` 的快照相当于"运行中突然断电的磁盘镜像"**，数据库等有状态服务回滚后可能需要恢复。\n\n**`--atomic`** 保证快照要么完全成功要么完全不创建，避免留下半成品。\n\n**重要提醒**：快照**不是备份**。它和被快照的磁盘通常在同一个存储上，磁盘损坏或误删存储池会一起丢；而且快照链会拖慢 IO 并占用额外空间，长期保留会显著影响性能。**快照用于"短时间内的回滚保险"，长期数据保护必须用真正的备份**（`virsh blockcopy`、`qemu-img convert` 导出或存储层快照）。',
      params: [
        { flag: 'snapshot-create-as <域名> <名称>', desc: '创建命名快照并加描述，推荐用法' },
        { flag: '--disk-only', desc: '只保存磁盘状态，回滚后需重启虚机，占用空间小' },
        { flag: '--quiesce', desc: '通过 Guest Agent 冻结文件系统，保证数据一致性（强烈建议）' },
        { flag: '--atomic', desc: '原子操作，失败时不留下半成品快照' },
        { flag: 'snapshot-list <域名>', desc: '列出所有快照及其创建时间' },
        { flag: 'snapshot-revert <域名> <名称>', desc: '回滚到指定快照，**当前状态会丢失**' },
        { flag: 'snapshot-delete <域名> <名称>', desc: '删除快照（含其占用的磁盘空间）' },
        { flag: 'snapshot-current <域名>', desc: '查看当前所处的快照位置' }
      ],
      examples: [
        { cmd: 'virsh snapshot-create-as web-prod-01 before-upgrade-20240318 "内核升级前快照" --atomic --quiesce', desc: '变更前打快照，带描述与一致性保证' },
        { cmd: 'virsh snapshot-create-as web-prod-01 disk-only-20240318 "仅磁盘快照" --disk-only --atomic', desc: '只做磁盘快照，占用空间小，适合频繁留底' },
        { cmd: 'virsh snapshot-list web-prod-01', desc: '列出所有快照，确认名称与创建时间' },
        { cmd: 'virsh snapshot-revert web-prod-01 before-upgrade-20240318', desc: '回滚到指定快照（当前状态会被丢弃，执行前确认）' },
        { cmd: 'virsh snapshot-delete web-prod-01 before-upgrade-20240318', desc: '删除不再需要的快照释放空间' },
        { cmd: 'virsh domblklist web-prod-01 --details && ls -lh /var/lib/libvirt/images/', desc: '查看快照产生的额外磁盘文件与空间占用' }
      ],
      notes: [
        '**快照不是备份**：它与被快照的磁盘通常在同一存储上，存储损坏或误删会一起丢失；长期保护必须做独立备份',
        '**不加 `--quiesce` 的快照数据可能不一致**：相当于运行中断电的镜像，数据库等有状态服务回滚后可能需恢复，且需要虚机内运行 QEMU Guest Agent',
        '**`snapshot-revert` 会丢弃当前状态**：自快照之后的所有数据变更都会消失，执行前必须确认业务允许回退',
        '**快照链越深性能越差**：每个 IO 都要穿透多层 qcow2 查找，长期保留大量快照会明显拖慢磁盘',
        '快照文件会持续增长（记录自快照以来的所有写入），**存储空间可能被悄悄吃满**，要监控容量并按计划清理',
        '系统检查点快照（含内存）在虚机内存很大时会占用大量空间与时间，大内存虚机建议用 `--disk-only`',
        '删除快照是耗时操作（需要合并 qcow2 层），大磁盘上可能跑很久，期间 IO 压力较大，建议避开业务高峰',
        '回滚系统检查点快照要求虚机当前的磁盘配置与快照时一致（磁盘数量、顺序），中间改过配置可能回滚失败'
      ],
      related: ['vm-img-snapshot', 'vm-virsh-destroy', 'vm-img-convert', 'vm-virsh-edit'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '快照', '回滚', '数据保护']
    },

    /* ---------- 8 / 25 ---------- */
    {
      id: 'vm-virsh-network',
      name: 'virsh net-list / net-start',
      alias: ['virsh net-list', 'virsh net-start', '虚拟网络管理'],
      level: 3,
      syntax: 'virsh net-list --all | virsh net-start <网络名> | virsh net-autostart <网络名> | virsh net-dumpxml <网络名>',
      summary: '管理 libvirt 虚拟网络，确保虚机网桥存在且开机自动启动。',
      desc: 'libvirt 的虚拟网络是"虚机的交换机"：默认的 `default` 网络是一个 NAT 网络（`virbr0`，网段通常是 192.168.122.0/24），虚机通过它访问外网，外部无法直接访问虚机；需要虚机拥有同网段 IP（如做集群、被外部直连）时要用 **bridge 模式**（把物理网卡桥接到 `br0`）。\n\n**最常见的故障**：宿主机重启后虚机起不来，报 `network default is not active`。原因是 `default` 网络没有设置 autostart，重启后处于 inactive 状态。修复：`virsh net-start default && virsh net-autostart default`。这一条几乎每个 KVM 运维都会遇到一次。\n\n**排查链路**：`virsh net-list --all` 看网络状态 → 若 inactive 则 `net-start` → `virsh net-dumpxml <网络>` 看网段与 DHCP 范围 → 宿主机 `ip addr show virbr0` 确认网桥有 IP → 虚机内 `ip addr` 确认是否拿到地址 → 若虚机有 IP 但上不了外网，检查宿主机 `net.ipv4.ip_forward` 与 NAT 规则（libvirt 会自动加 iptables MASQUERADE 规则）。\n\n**改网段**：`virsh net-edit default` 修改 XML 里的 `<ip address=...>` 与 `<dhcp><range .../></dhcp>`，改完需要 `net-destroy` + `net-start` 生效（**会短暂中断该网络上的所有虚机网络**）。',
      params: [
        { flag: 'net-list --all', desc: '列出所有虚拟网络及是否 active/autostart' },
        { flag: 'net-start <网络>', desc: '启动一个已定义但未激活的网络' },
        { flag: 'net-autostart <网络>', desc: '设置开机自动激活，宿主机重启后虚机能正常联网' },
        { flag: 'net-dumpxml <网络>', desc: '查看网络 XML：网段、DHCP 范围、转发模式' },
        { flag: 'net-define <文件> / net-undefine', desc: '从 XML 定义 / 删除虚拟网络' },
        { flag: 'net-dhcp-leases <网络>', desc: '查看 DHCP 已分配的租约，快速找虚机 IP' },
        { flag: 'net-destroy <网络>', desc: '立即停止网络（**该网络上所有虚机将断网**）' }
      ],
      examples: [
        { cmd: 'virsh net-list --all', desc: '查看所有虚拟网络的状态与自启设置' },
        { cmd: 'virsh net-start default && virsh net-autostart default', desc: '修复宿主机重启后虚机网络不通的经典故障' },
        { cmd: 'virsh net-dumpxml default', desc: '查看 default 网络的网段与 DHCP 配置' },
        { cmd: 'virsh net-dhcp-leases default', desc: '查看 DHCP 租约，快速定位虚机 IP' },
        { cmd: 'ip addr show virbr0 && sysctl net.ipv4.ip_forward', desc: '确认网桥存在且 IP 转发已开启（NAT 网络的前提）' },
        { cmd: 'virsh net-edit default', desc: '修改网络配置（改完需 net-destroy + net-start 生效）' }
      ],
      notes: [
        '**`default` 网络默认没有 autostart**：宿主机重启后虚机启动会报 `network default is not active`，务必执行 `virsh net-autostart default`',
        'NAT 模式下外部无法主动访问虚机，只能由虚机出访；需要外部直连请改用 bridge 模式并把物理网卡桥接',
        '`virsh net-destroy` 是**立即断开该网络**，上面所有虚机会立刻失去网络连接，不是"删除网络"，但影响面很大',
        '改网络网段后虚机如果用的是静态 IP，需要同步修改虚机内配置，否则会彻底失联（**改之前先确保有 console 通道**）',
        'NAT 网络依赖宿主机 `net.ipv4.ip_forward=1` 与 libvirt 自动维护的 iptables 规则；手工清过 iptables 规则会导致 NAT 失效，重启 libvirtd 可恢复',
        'bridge 模式下把物理网卡加入网桥会导致宿主机该网卡 IP 需要迁移到网桥，**远程操作有失联风险**，务必在控制台操作',
        '容器环境（如 KubeVirt）不使用 libvirt 虚拟网络，这套命令不适用'
      ],
      related: ['vm-virsh-list', 'vm-virsh-dominfo', 'vm-virsh-pool', 'ln-ip-addr'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '虚拟网络', '网桥', 'NAT']
    },

    /* ---------- 9 / 25 ---------- */
    {
      id: 'vm-virsh-pool',
      name: 'virsh pool-list / pool-define-as',
      alias: ['virsh pool-list', 'pool-define-as', '存储池管理'],
      level: 3,
      syntax: 'virsh pool-list --all | virsh pool-define-as <名称> <类型> --target <路径> | virsh pool-build <名称> | virsh pool-start <名称> | virsh pool-autostart <名称>',
      summary: '定义并激活 libvirt 存储池，把虚机磁盘放到独立数据盘上。',
      desc: '存储池是 libvirt 对"存放虚机磁盘的目录"的抽象，最常用的是 `dir` 类型（就是一个本地目录）。默认池是 `/var/lib/libvirt/images`，**它位于系统盘上**——生产环境虚机磁盘应该放在独立的数据盘或共享存储上，否则系统盘写满会拖垮所有虚机。\n\n**新建存储池的完整四步**（顺序不能错）：① `pool-define-as` 定义（只写配置，不创建目录）；② `pool-build` 创建目录（对 `dir` 类型就是 `mkdir -p`）；③ `pool-start` 激活；④ `pool-autostart` 设置开机自启。**漏掉 `pool-autostart` 会导致宿主机重启后池处于 inactive，虚机无法启动**，这是仅次于网络 autostart 的高频故障。\n\n**目录属主很关键**：libvirt 以 `qemu:qemu`（或 `libvirt-qemu:kvm`）身份访问磁盘，目录属主不对会报 `Permission denied`。通常做法是把目录属主设为 `qemu:qemu` 并给 `0755`，或用 `virsh pool-define-as` 后手工 `chown`。\n\n`virsh vol-list <池名>` 列出池内的卷（磁盘文件），`virsh vol-create-as` 可以直接在池里建卷，比手工 `qemu-img` 更符合 libvirt 的管理方式。',
      params: [
        { flag: 'pool-list --all', desc: '列出所有存储池及 active/autostart 状态' },
        { flag: 'pool-define-as <名> dir --target <路径>', desc: '定义目录类型存储池' },
        { flag: 'pool-build <名>', desc: '创建池对应的目录结构' },
        { flag: 'pool-start <名>', desc: '激活存储池（不激活则无法使用）' },
        { flag: 'pool-autostart <名>', desc: '开机自动激活，**宿主机重启后虚机能否启动的关键**' },
        { flag: 'pool-info <名>', desc: '查看池的容量、已用空间与状态' },
        { flag: 'vol-list <池名>', desc: '列出池内的卷（磁盘文件）' },
        { flag: 'vol-create-as <池> <卷名> <大小>', desc: '在池中创建指定大小的卷' }
      ],
      examples: [
        { cmd: 'virsh pool-list --all', desc: '查看所有存储池的状态与自启设置' },
        { cmd: 'virsh pool-define-as vmstore dir --target /data/vmstore', desc: '定义目录型存储池' },
        { cmd: 'virsh pool-build vmstore && virsh pool-start vmstore && virsh pool-autostart vmstore', desc: '创建目录、激活并设置自启，三步连做避免漏项' },
        { cmd: 'chown qemu:qemu /data/vmstore && chmod 0755 /data/vmstore', desc: '修正目录属主，避免虚机因权限问题无法启动' },
        { cmd: 'virsh pool-info vmstore && virsh vol-list vmstore', desc: '查看池容量与已有磁盘文件' },
        { cmd: 'virsh vol-create-as vmstore web-prod-02.qcow2 40G --format qcow2', desc: '在存储池中创建 40G 的 qcow2 卷' }
      ],
      notes: [
        '**默认存储池在系统盘 `/var/lib/libvirt/images`**：虚机磁盘放这里会把系统盘写满，生产环境务必使用独立数据盘并新建存储池',
        '**漏掉 `pool-autostart` 会导致宿主机重启后虚机起不来**，报错通常是找不到磁盘文件；排查时 `virsh pool-list --all` 看是否 inactive',
        '**目录属主必须是 qemu 运行用户**（CentOS 上是 `qemu:qemu`，Ubuntu 上是 `libvirt-qemu:kvm`），否则虚机启动报权限错误',
        '`pool-define-as` 只写配置不建目录，必须配合 `pool-build`；对已存在的目录，`pool-build` 会报已存在但仍可 `pool-start`',
        '删除池用 `pool-destroy`（停止）+ `pool-undefine`（删除定义），**它们都不会删除磁盘文件**，需要单独清理',
        'NFS/共享存储场景用 `netfs` 类型池，`--source-host` 与 `--source-path` 指定挂载源，注意宿主机要能正常挂载并有权限',
        '迁移虚机时存储池名称与路径要在源和目标宿主机上保持一致，否则迁移会失败'
      ],
      related: ['vm-virsh-network', 'vm-img-create', 'vm-img-convert', 'ls9-lsblk'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '存储池', '磁盘', 'libvirt']
    },

    /* ---------- 10 / 25 ---------- */
    {
      id: 'vm-virsh-autostart',
      name: 'virsh autostart',
      alias: ['virsh autostart', '虚机开机自启', 'autostart --disable'],
      level: 2,
      syntax: 'virsh autostart <域名> [--disable] [--once] | virsh list --autostart',
      summary: '设置虚拟机随宿主机启动，避免重启后业务虚机没有自动恢复。',
      desc: '默认情况下 KVM 虚机**不会**随宿主机一起启动，需要显式设置 autostart。原理是在 `/etc/libvirt/qemu/autostart/` 下创建一个指向虚机 XML 的软链接，libvirtd 启动时读取该目录。\n\n`--disable` 取消自启，`--once` 表示"只在下次宿主启动时启动一次"（之后不再自启），适合临时场景（如计划内维护后只启动一次）。\n\n**生产环境的完整自启检查清单**（缺一不可）：\n① `virsh autostart <域名>` 设置虚机自启；\n② `virsh net-autostart default` 确保虚拟网络自启；\n③ `virsh pool-autostart <池名>` 确保存储池自启；\n④ `systemctl is-enabled libvirtd` 确认 libvirtd 本身开机启用。\n\n这四件事任何一件没做，宿主机重启后虚机都可能起不来或起不来但没网络。建议把这四项写成一个巡检脚本定期检查。\n\n另外注意：**自启是有顺序问题的**——libvirt 会并行启动多台虚机，如果业务有依赖关系（如存储服务要先起），需要靠虚机内的 systemd 依赖或额外的编排脚本控制，libvirt 本身不保证启动顺序。',
      params: [
        { flag: 'autostart <域名>', desc: '设置虚机随宿主机启动' },
        { flag: '--disable', desc: '取消开机自启' },
        { flag: '--once', desc: '只在下次宿主机启动时启动一次，之后不再自启' },
        { flag: 'list --autostart', desc: '列出所有已设置自启的虚机' },
        { flag: 'list --no-autostart', desc: '列出未设置自启的虚机，用于查漏' },
        { flag: 'net-autostart / pool-autostart', desc: '配套设置：网络与存储池也要自启' }
      ],
      examples: [
        { cmd: 'virsh autostart web-prod-01', desc: '设置虚机随宿主机启动' },
        { cmd: 'virsh list --no-autostart --all', desc: '找出所有没设自启的虚机，逐台确认是否需要' },
        { cmd: 'virsh autostart --disable db-test-01', desc: '取消测试虚机的自启，避免占用资源' },
        { cmd: 'virsh list --autostart && virsh net-list --autostart && virsh pool-list --autostart', desc: '自启三重检查：虚机、网络、存储池' },
        { cmd: 'systemctl is-enabled libvirtd', desc: '确认 libvirtd 本身开机启用，否则前面的设置都不会被读取' }
      ],
      notes: [
        '**虚机、虚拟网络、存储池三者的 autostart 要一起设置**：只设虚机自启而网络没自启，会出现"虚机起来了但没网络"',
        '`--once` 只对下一次宿主机启动生效，适合维护场景，**不要当成永久自启用**',
        'libvirt **不保证多台虚机的启动顺序**，有依赖关系的服务需要在虚机内配置 systemd 依赖或改用编排工具',
        '设置自启后如果虚机磁盘在未自启的存储池上，宿主机重启会启动失败，务必用 `pool-list --autostart` 复查',
        '大量虚机同时自启会造成宿主机启动瞬间 IO 与 CPU 风暴，几十台以上的环境建议错峰或分批启动',
        '云上（华为云 ECS 里的嵌套虚拟化）场景要考虑云主机自身的重启策略与系统盘性能，自启风暴可能让云主机长时间高负载',
        '取消自启不等于虚机被删除，它只是不再自动启动，仍可手工 `virsh start`'
      ],
      related: ['vm-virsh-list', 'vm-virsh-start', 'vm-virsh-network', 'vm-virsh-pool'],
      docs: 'https://libvirt.org/manpages/virsh.html',
      tags: ['KVM', '开机自启', '宿主机重启', 'libvirt']
    },

    /* ================= B. 镜像与磁盘 ================= */

    /* ---------- 11 / 25 ---------- */
    {
      id: 'vm-img-create',
      name: 'qemu-img create',
      alias: ['qemu-img create', '创建磁盘镜像', 'qcow2 预分配'],
      level: 2,
      syntax: 'qemu-img create -f <格式> [-o <选项>] <文件> <大小>',
      summary: '创建虚拟磁盘镜像，选对 qcow2 或 raw 并合理预分配。',
      desc: '**格式选择**是第一个决策点：\n- **qcow2**：稀疏分配（用多少占多少）、支持内部快照、支持压缩，是通用默认。代价是多一层元数据映射，性能略低于 raw，且文件损坏时恢复更复杂；\n- **raw**：裸格式，没有元数据开销，性能最好、可被任何工具直接读取，但**创建时就占满全部空间**（除非文件系统支持 hole，实际占用仍可能是稀疏的），且不支持快照。数据库等对 IO 敏感的场景常用 raw。\n\n**预分配（`preallocation`）**是第二个关键点：默认的 qcow2 是"用多少长多少"，好处是省空间，坏处是**运行中扩容时会触发分配、产生写放大与延迟抖动**。三种预分配模式：\n- `preallocation=off`：默认，稀疏；\n- `preallocation=metadata`：只预分配元数据，创建快、后续扩容开销小，是**最常用的折中**；\n- `preallocation=falloc` / `full`：真正把空间占住，性能最稳定，但创建慢且立即占用全部容量（`full` 会写零，更慢）。\n\n**`cluster_size`** 影响 qcow2 的 IO 效率：默认 64K，顺序大 IO 场景可以调大（如 `1M`）减少元数据开销，随机小 IO 场景保持默认或调小。\n\n用法上必须是"先建镜像，再挂给虚机或安装系统"，注意创建的镜像只是空文件，没有任何分区与文件系统。',
      params: [
        { flag: '-f qcow2|raw', desc: '指定镜像格式，**必须显式指定**，不要让工具自动猜测' },
        { flag: '-o preallocation=metadata', desc: '预分配元数据，兼顾创建速度与运行稳定性' },
        { flag: '-o preallocation=full', desc: '完全预分配（写零），性能最稳定但创建慢、立即占满空间' },
        { flag: '-o cluster_size=1M', desc: '调整 qcow2 簇大小，顺序大 IO 场景可减少元数据开销' },
        { flag: '-o backing_file=<基础镜像>', desc: '基于已有镜像创建差分盘（写时复制），批量部署常用' },
        { flag: '-o backing_fmt=qcow2', desc: '显式指定基础镜像的格式，避免自动探测出错' },
        { flag: '-o lazy_refcounts=on', desc: '延迟引用计数更新，提升写入性能（compat=1.1 才支持）' }
      ],
      examples: [
        { cmd: 'qemu-img create -f qcow2 -o preallocation=metadata /data/vmstore/web-prod-02.qcow2 40G', desc: '创建 40G qcow2 盘并预分配元数据，通用推荐写法' },
        { cmd: 'qemu-img create -f raw -o preallocation=falloc /data/vmstore/db-data.raw 200G', desc: '创建 raw 盘并立即占满空间，数据库等 IO 敏感场景' },
        { cmd: 'qemu-img create -f qcow2 -b /data/base/rocky9-base.qcow2 -F qcow2 /data/vmstore/vm-03.qcow2 40G', desc: '基于基础镜像创建差分盘，批量部署时节省空间与时间' },
        { cmd: 'qemu-img create -f qcow2 -o cluster_size=1M /data/vmstore/bigio.qcow2 500G', desc: '大簇 qcow2，适合顺序大 IO 的数据盘' }
      ],
      notes: [
        '**格式必须用 `-f` 显式指定**：不写时依赖自动探测，配合挂载或转换容易出错，生产脚本务必写全',
        '**qcow2 默认是稀疏的**：`ls -lh` 看到的文件大小不代表实际占用，用 `qemu-img info` 或 `du -h` 看真实占用',
        '**创建路径所在磁盘要有足够空间**：稀疏盘虽然初始占用小，但写满后仍会占满声明容量，容量规划要按声明大小算',
        '`preallocation=full` 会立即写入全部空间，**创建 500G 盘可能耗时很久**，且立即消耗 500G 存储',
        '**差分盘（`-b`）依赖基础镜像**：基础镜像被删或移动会导致所有差分盘无法打开，生产环境要把基础镜像放到受保护目录并记录引用关系',
        '扩展名不代表格式（`.img` 可能是 qcow2），一切以 `qemu-img info` 输出为准',
        '不要在虚机运行中修改其磁盘镜像文件，官方文档明确警告这可能导致镜像损坏'
      ],
      related: ['vm-img-info', 'vm-img-convert', 'vm-img-resize', 'ls9-fallocate'],
      docs: 'https://www.qemu.org/docs/master/tools/qemu-img.html',
      tags: ['镜像', 'qcow2', 'raw', '预分配']
    },

    /* ---------- 12 / 25 ---------- */
    {
      id: 'vm-img-info',
      name: 'qemu-img info',
      alias: ['qemu-img info', '查看镜像信息', '镜像格式识别'],
      level: 1,
      syntax: 'qemu-img info [-f <格式>] [--backing-chain] [--output=json] <镜像文件>',
      summary: '查看镜像的格式、虚拟大小与实际占用，动手前的必查命令。',
      desc: '在扩容、转换、挂载、导入这些操作之前，**永远先用 `qemu-img info` 确认三件事**：格式是什么（qcow2 还是 raw）、虚拟大小多大（虚机看到的容量）、实际占用多少（真实磁盘消耗）。搞错格式就动手是数据损坏的常见原因。\n\n输出字段解读：`file format` 是格式；`virtual size` 是虚机看到的容量；`disk size` 是宿主机上实际占用的空间（qcow2 稀疏盘两者差距可能很大）；`cluster_size` 是簇大小；`backing file` 与 `backing file format` 表示这是差分盘及其依赖的基础镜像；`Snapshot list` 列出内部快照。\n\n`--backing-chain` 会**递归列出整条差分链**，是排查"镜像到底依赖了哪些文件"的唯一可靠方式——差分盘链断裂（基础镜像丢失）时的报错很晦涩，先用这个命令看清楚结构。\n\n`--output=json` 适合脚本解析，可配合 `jq` 取值做自动化巡检（如批量检查所有镜像的格式与占用）。',
      params: [
        { flag: '<镜像文件>', desc: '要查询的镜像路径，支持 qcow2、raw、vmdk、vdi 等格式' },
        { flag: '-f <格式>', desc: '强制指定格式，用于自动探测失败或需要避免探测风险的场景' },
        { flag: '--backing-chain', desc: '递归列出整条差分链，排查基础镜像依赖' },
        { flag: '--output=json', desc: 'JSON 输出，脚本解析用' },
        { flag: '-U, --force-share', desc: '共享模式打开，可在虚机运行中查询（结果可能不一致）' },
        { flag: 'qemu-img check <镜像>', desc: '配套使用：检查 qcow2 镜像的一致性，发现损坏' }
      ],
      examples: [
        { cmd: 'qemu-img info /data/vmstore/web-prod-02.qcow2', desc: '查看镜像格式、虚拟大小与实际占用' },
        { cmd: 'qemu-img info --backing-chain /data/vmstore/vm-03.qcow2', desc: '查看差分盘整条依赖链，确认基础镜像是否都在' },
        { cmd: 'qemu-img info --output=json /data/vmstore/web-prod-02.qcow2 | jq -r ".format, .\\"virtual-size\\", .\\"actual-size\\""', desc: 'JSON 输出提取关键字段，用于批量巡检脚本' },
        { cmd: 'qemu-img check /data/vmstore/web-prod-02.qcow2', desc: '检查镜像一致性，怀疑损坏时先跑这一条' },
        { cmd: 'for f in /data/vmstore/*.qcow2; do echo -n "$f "; qemu-img info "$f" | grep "virtual size"; done', desc: '批量列出所有镜像的虚拟大小，做容量盘点' }
      ],
      notes: [
        '**`virtual size` 与 `disk size` 差别很大是正常的**：qcow2 稀疏盘按需分配，文件大小不等于声明容量，容量规划要按 virtual size 算',
        '**不要对运行中的虚机磁盘做 `qemu-img` 写操作**：查询可以加 `-U` 勉强进行，但结果可能不一致；修改类操作（resize/convert/commit）必须先关机',
        '`--backing-chain` 是排查差分盘问题的第一步，链上任何一层缺失都会导致虚机无法启动',
        '文件扩展名不可信，**永远以 `qemu-img info` 输出的 `file format` 为准**；把 raw 当成 qcow2 操作会破坏数据',
        '`qemu-img check` 只对 qcow2/qed/vhdx/vmdk/vdi 有效，raw 格式会提示不支持',
        '从云厂商下载的镜像常是 qcow2 或 raw 格式，导入前先 `info` 确认，再决定是否需要 `qemu-img convert`'
      ],
      related: ['vm-img-create', 'vm-img-convert', 'vm-img-resize', 'vm-img-snapshot'],
      docs: 'https://www.qemu.org/docs/master/tools/qemu-img.html',
      tags: ['镜像', '格式识别', '容量', '差分盘']
    },

    /* ---------- 13 / 25 ---------- */
    {
      id: 'vm-img-convert',
      name: 'qemu-img convert',
      alias: ['qemu-img convert', '镜像格式转换', '镜像压缩'],
      level: 3,
      syntax: 'qemu-img convert [-f <源格式>] -O <目标格式> [-c] [-p] [-m <并发>] [-S <稀疏阈值>] <源> <目标>',
      summary: '在 raw、qcow2、vmdk 等格式间转换镜像，顺带压缩与瘦身。',
      desc: '格式转换有四个典型需求：\n① **导入云平台**：华为云 IMS 通常接受 qcow2 或 vmdk，本地 raw 镜像需转换；\n② **瘦身**：从 raw 转 qcow2 时，`-c` 压缩 + 零块检测能显著减小体积（尤其是有大量空闲块的镜像）；\n③ **性能取舍**：qcow2 转 raw 换取更好 IO 性能；\n④ **跨虚拟化平台迁移**：转成 vmdk 给 VMware，或从 vmdk 转 qcow2 迁到 KVM。\n\n**关键参数**：`-c` 启用压缩（只支持 qcow/qcow2/vmdk 的 streamOptimized 子格式），**压缩后的镜像是只读的**——被改写过的压缩块会以未压缩形式重写；`-p` 显示进度条（大镜像必备）；`-m 8` 使用 8 个并发协程加速（对大镜像提升明显）；`-S 4k` 指定零块检测粒度，值越大越激进（可能把有效数据当零块，**默认即可，不要随意调大**）。\n\n**转换是"读源写目标"，源文件不会被修改**，转换完成后需要自己决定是否替换。生产上的标准流程是：关机 → 转换到新文件 → `qemu-img info` 校验 → 修改虚机 XML 指向新文件 → 启动验证 → 确认无误后再删除旧镜像。\n\n**转换耗时与镜像大小成正比**，几百 GB 的镜像可能要跑很久，建议在维护窗口进行并让命令在 `tmux` 里跑，避免 SSH 断开导致中断。',
      params: [
        { flag: '-f <源格式>', desc: '显式指定源格式，避免自动探测出错' },
        { flag: '-O <目标格式>', desc: '目标格式：qcow2、raw、vmdk、vdi 等' },
        { flag: '-c', desc: '压缩输出（仅 qcow/qcow2/vmdk 支持），**压缩后镜像不宜再频繁写入**' },
        { flag: '-p', desc: '显示进度条，大镜像转换必加' },
        { flag: '-m <并发数>', desc: '并发协程数（默认 8），提升大镜像转换速度' },
        { flag: '-S <字节>', desc: '零块检测粒度，默认 4k；**不要随意调大**，可能误判有效数据' },
        { flag: '-W', desc: '允许乱序写以提升性能，仅建议对预分配设备使用' },
        { flag: '-U', desc: '共享模式打开源镜像（源正在被使用时的勉强手段）' }
      ],
      examples: [
        { cmd: 'qemu-img convert -f raw -O qcow2 -c -p -m 8 /data/images/rocky9.raw /data/images/rocky9.qcow2', desc: 'raw 转压缩 qcow2，大镜像加并发与进度显示' },
        { cmd: 'qemu-img convert -f qcow2 -O raw -p /data/vmstore/db.qcow2 /data/vmstore/db.raw', desc: 'qcow2 转 raw，换取更好的 IO 性能（数据库场景）' },
        { cmd: 'qemu-img convert -f qcow2 -O vmdk -p /data/images/app.qcow2 /data/export/app.vmdk', desc: '转成 vmdk 供 VMware 使用' },
        { cmd: 'qemu-img convert -f raw -O qcow2 -c -p /data/images/cloud-base.raw /data/images/cloud-base.qcow2 && qemu-img info /data/images/cloud-base.qcow2', desc: '转换后立即校验结果，确认格式与大小正确' },
        { cmd: 'qemu-img info /data/images/rocky9.raw && qemu-img info /data/images/rocky9.qcow2', desc: '对比转换前后的虚拟大小与实际占用，确认瘦身效果' }
      ],
      notes: [
        '**转换前必须关闭虚机**：对运行中虚机的磁盘做转换，读到的是一致性无保证的数据，官方明确警告可能损坏镜像',
        '**目标文件不能已存在**（部分版本会拒绝覆盖），脚本里要显式处理；转换前确认目标磁盘有足够空间容纳转换后的文件',
        '`-c` 压缩输出**不适合再频繁写入**：被改写的压缩块要以未压缩方式重写，长期运行会越来越臃肿；压缩适合做模板与归档',
        '**转换大镜像耗时很长**，SSH 断线会中断进程，务必在 `tmux`/`screen` 或 `nohup` 中执行',
        '**不要用 `-S` 调大零块阈值来"减小体积"**：可能把含数据的块判定为零块而丢弃，造成数据丢失',
        '转换完成后要修改虚机 XML 指向新文件，**不要直接覆盖原文件**，保留原镜像直到新镜像验证通过',
        '`-W` 乱序写只对预分配设备有效，对普通文件可能降低性能甚至出错',
        '跨平台转换还涉及驱动问题：从 KVM 迁到 VMware 需要先卸载 virtio 驱动、安装 vmware tools，否则转换后的镜像无法启动'
      ],
      related: ['vm-img-info', 'vm-img-create', 'vm-img-resize', 'vm-cloud-image-flow'],
      docs: 'https://www.qemu.org/docs/master/tools/qemu-img.html',
      tags: ['镜像转换', '格式', '压缩', '迁移']
    },

    /* ---------- 14 / 25 ---------- */
    {
      id: 'vm-img-resize',
      name: 'qemu-img resize',
      alias: ['qemu-img resize', '磁盘扩容', '缩小镜像'],
      level: 3,
      syntax: 'qemu-img resize [--preallocation=<模式>] <镜像> [+]<大小> | qemu-img resize --shrink <镜像> -<大小>',
      summary: '调整镜像容量，扩容后还必须在系统内扩分区与文件系统。',
      desc: '`qemu-img resize` 只做**第一半**工作：把镜像文件的容量改大或改小。虚机重启后会发现磁盘变大了，但**分区表和文件系统还是原来的大小**，用 `df -h` 看容量没变——这是最常见的误解，很多人以为命令没生效。\n\n**扩容的完整链路（四步，缺一不可）**：\n① **关闭虚机**（对运行中虚机改镜像容量极其危险）；\n② 宿主机执行 `qemu-img resize /data/vmstore/web.qcow2 +20G` 把镜像扩大 20G；\n③ 启动虚机，登录后扩容分区：`growpart /dev/vda 1`（云上通用工具，自动处理分区表变化）或 `parted /dev/vda resizepart 1 100%`；\n④ 扩容文件系统：ext4 用 `resize2fs /dev/vda1`，XFS 用 `xfs_growfs /`（**XFS 只能扩不能缩**）；\n⑤ 用 `df -h` 确认容量已生效。\n\n如果是 LVM 结构，中间还要多两步：`pvresize /dev/vda2` 然后 `lvextend -l +100%FREE /dev/vg0/lv_root`，最后才 `resize2fs`。\n\n**缩小（shrink）是危险操作**：`qemu-img resize --shrink` 强制要求显式加 `--shrink` 参数，这是官方设计的"防呆"，因为**缩容会把超出新容量的数据直接丢弃，无法恢复**。正确的缩容顺序与扩容完全相反：先在系统内缩小文件系统（ext4 需卸载后用 `resize2fs`，XFS 不支持缩小）→ 缩小分区 → 最后才缩小镜像。\n\n**qcow2 扩容性能提示**：不预分配的 qcow2 每次扩容都要分配新簇，会产生写放大与延迟抖动；可以在扩容时加 `--preallocation=metadata` 提前把元数据铺好。',
      params: [
        { flag: '<镜像> +<大小>', desc: '在当前容量基础上增加，如 `+20G`；也可写绝对大小如 `40G`' },
        { flag: '--shrink', desc: '**缩小必须显式添加**，表示已知悉会截断数据，官方防呆设计' },
        { flag: '--preallocation=metadata', desc: '扩容时预分配元数据，减少后续写入的分配开销' },
        { flag: 'growpart <设备> <分区号>', desc: '虚机内扩容分区的通用工具，如 `growpart /dev/vda 1`' },
        { flag: 'resize2fs <设备>', desc: 'ext2/3/4 文件系统扩容（缩容需先卸载）' },
        { flag: 'xfs_growfs <挂载点>', desc: 'XFS 文件系统扩容，**XFS 不支持缩小**' },
        { flag: 'pvresize / lvextend', desc: 'LVM 结构下的中间步骤：先扩物理卷再扩逻辑卷' }
      ],
      examples: [
        { cmd: 'virsh shutdown web-prod-01 && virsh domstate web-prod-01', desc: '第一步：必须先关机，确认状态为 shut off' },
        { cmd: 'qemu-img resize /data/vmstore/web-prod-01.qcow2 +20G', desc: '第二步：宿主机上把镜像扩大 20G' },
        { cmd: 'virsh start web-prod-01 && virsh console web-prod-01', desc: '第三步：启动并登录虚机做系统内扩容' },
        { cmd: 'growpart /dev/vda 1 && resize2fs /dev/vda1 && df -h', desc: '第四步：扩容分区与 ext4 文件系统并验证' },
        { cmd: 'growpart /dev/vda 2 && pvresize /dev/vda2 && lvextend -l +100%FREE /dev/vg0/lv_root && xfs_growfs / && df -h', desc: 'LVM + XFS 的完整扩容链路' },
        { cmd: 'qemu-img info /data/vmstore/web-prod-01.qcow2', desc: '扩容后用 info 确认 virtual size 已变化' }
      ],
      notes: [
        '**缩容会丢数据且不可恢复**：`--shrink` 缩掉的容量对应的数据被直接截断，必须先在系统内缩小文件系统与分区，**顺序反了就是数据毁灭**',
        '**XFS 文件系统不支持缩小**，只能扩大；需要在 XFS 上"缩小"只能重建文件系统并迁移数据',
        '**扩容后 `df -h` 没变化是正常的**：`qemu-img resize` 只改镜像容量，必须在虚机内扩分区与文件系统才真正可用',
        '**必须先关机再 resize**：对运行中虚机的镜像做容量修改会导致数据损坏，官方文档明确警告',
        'ext4 缩容需要先 `umount`（在线缩容不支持），根分区无法卸载，因此根分区缩容基本要走救援模式，风险极高',
        '扩容是相对安全的操作，但**仍要提前备份或打快照**：分区表操作失误（如把分区号写错）会破坏数据',
        '云主机上扩容云盘后同样需要 `growpart` + `resize2fs`/`xfs_growfs`，这一步与本地 KVM 完全一致',
        '如果磁盘是差分盘链的顶层，扩容只影响顶层镜像；基础镜像不要动，否则整条链都会出问题'
      ],
      related: ['vm-img-info', 'vm-img-create', 'ls9-resize2fs', 'ls9-xfs-growfs'],
      docs: 'https://www.qemu.org/docs/master/tools/qemu-img.html',
      tags: ['扩容', '缩容', '文件系统', '高危操作']
    },

    /* ---------- 15 / 25 ---------- */
    {
      id: 'vm-img-snapshot',
      name: 'qemu-img snapshot',
      alias: ['qemu-img snapshot', '镜像内部快照', 'qcow2 快照'],
      level: 3,
      syntax: 'qemu-img snapshot -c <快照名> <镜像> | qemu-img snapshot -l <镜像> | qemu-img snapshot -a <快照名> <镜像> | qemu-img snapshot -d <快照名> <镜像>',
      summary: '在 qcow2 镜像内部创建与恢复快照，不依赖 libvirt 的轻量方案。',
      desc: '这是 qcow2 **内部快照**，快照信息存在镜像文件自身里，与 `virsh snapshot-create-as` 相比更"底层"：不需要 libvirt、不受虚机定义影响，但**只能处理磁盘状态，不包含内存**，恢复后虚机需要重启。\n\n**四个动作**：`-c` 创建、`-l` 列出、`-a` 恢复（apply）、`-d` 删除。\n\n**必须关机操作**：`qemu-img snapshot` 的所有写操作都要求虚机已关闭，因为内部快照会修改镜像的元数据表，运行中操作必然损坏数据。\n\n**内部快照的优缺点**：优点是简单、不产生额外文件、不依赖 libvirt；缺点是**快照与镜像绑在一起**（镜像复制走，快照也一起走，无法单独管理），**删除快照不会释放空间**（内部快照占用的块在镜像内部，需要 `qemu-img convert` 重写镜像才能真正回收），并且快照多了会拖慢 IO。\n\n**更现代的替代方案**：`virsh snapshot-create-as --disk-only`（外部快照，产生独立的 overlay 文件，可用块提交合并）在生产上更常用，因为它对 IO 性能的影响更可控，也更容易做备份与迁移。\n\n**恢复快照意味着丢弃**：`-a` 之后镜像回到快照那一刻的状态，**快照之后的所有写入全部丢失**，操作前务必确认。',
      params: [
        { flag: '-c <快照名>', desc: '创建内部快照（要求虚机已关机）' },
        { flag: '-l', desc: '列出镜像内所有快照及其大小与日期' },
        { flag: '-a <快照名>', desc: '恢复（apply）到指定快照，**之后的写入会丢失**' },
        { flag: '-d <快照名>', desc: '删除快照（**不会立即释放磁盘空间**）' },
        { flag: '-U', desc: '共享模式打开，用于在镜像被占用时只读查看' },
        { flag: 'qemu-img convert', desc: '配套使用：重写镜像以真正回收快照占用的空间' }
      ],
      examples: [
        { cmd: 'virsh shutdown web-prod-01 && qemu-img snapshot -c before-patch-20240318 /data/vmstore/web-prod-01.qcow2', desc: '关机后创建内部快照（必须先关机）' },
        { cmd: 'qemu-img snapshot -l /data/vmstore/web-prod-01.qcow2', desc: '列出镜像内的所有快照' },
        { cmd: 'qemu-img snapshot -a before-patch-20240318 /data/vmstore/web-prod-01.qcow2 && virsh start web-prod-01', desc: '恢复到快照并启动，之后的写入会被丢弃' },
        { cmd: 'qemu-img snapshot -d before-patch-20240318 /data/vmstore/web-prod-01.qcow2', desc: '删除快照（空间不会立即释放）' },
        { cmd: 'qemu-img convert -O qcow2 -p /data/vmstore/web-prod-01.qcow2 /data/vmstore/web-prod-01-compact.qcow2 && qemu-img info /data/vmstore/web-prod-01-compact.qcow2', desc: '重写镜像以真正回收快照空间，再校验结果' }
      ],
      notes: [
        '**必须在虚机关机状态下操作**：内部快照会改写镜像元数据，运行中操作会导致数据损坏',
        '**删除内部快照不会释放磁盘空间**：要真正回收必须 `qemu-img convert` 重写整个镜像，这一点与外部快照完全不同',
        '**恢复快照会丢弃之后的所有写入**：相当于时间倒流，生产操作前必须确认数据可回退',
        '内部快照只包含磁盘状态、**不含内存**，恢复后虚机是"异常断电"的状态，需要走文件系统恢复流程',
        '**内部快照与差分盘链不能混用**：在差分盘上做内部快照会让依赖关系更复杂，容易出错',
        '快照数量多会明显拖慢 IO（每次读取都要查快照映射表），长期保留快照的镜像性能会持续下降',
        '生产环境更推荐 `virsh snapshot-create-as --disk-only`（外部快照）或存储层快照，便于单独管理与合并',
        '不要直接复制带内部快照的镜像给别的虚机用，快照会被一起带过去，造成空间与性能问题'
      ],
      related: ['vm-virsh-snapshot', 'vm-img-info', 'vm-img-convert', 'vm-img-resize'],
      docs: 'https://www.qemu.org/docs/master/tools/qemu-img.html',
      tags: ['镜像快照', 'qcow2', '回滚', '数据保护']
    },

    /* ---------- 16 / 25 ---------- */
    {
      id: 'vm-img-virt-install',
      name: 'virt-install',
      alias: ['virt-install', '命令行创建虚机', '无人值守装虚机'],
      level: 3,
      syntax: 'virt-install --name <名称> --memory <MB> --vcpus <核数> --disk <磁盘参数> --network <网络参数> --location <安装源> [--graphics none] [--noautoconsole]',
      summary: '一条命令完成 KVM 虚机的定义与安装，可完全脚本化无人值守。',
      desc: '`virt-install` 把"创建磁盘 + 定义 XML + 启动安装"合成一条命令，是自动化部署虚机的标准方式（`virt-manager` 图形界面底层也是调它）。\n\n**必填要素**：`--name`（唯一名称）、`--memory`（MB）、`--vcpus`、`--disk`（磁盘）、`--network`（网络）、安装源（`--cdrom` 光驱、`--location` 安装树、`--import` 导入已有磁盘、`--pxe` 网络启动）。\n\n**关键参数解释**：\n- `--disk path=...,size=...,format=qcow2,bus=virtio`：`path` 与 `size` 二选一（给了 path 且文件不存在时需给 size 让其创建）；`bus=virtio` 是**性能关键**，用 virtio 磁盘比 IDE/SATA 快数倍；\n- `--network bridge=br0,model=virtio` 或 `--network network=default,model=virtio`：网卡型号同样选 virtio；\n- `--cpu host-passthrough`：把宿主机 CPU 特性透传给虚机（性能最好，但**跨不同型号宿主机无法迁移**）；\n- `--graphics none --console pty,target_type=serial`：不要图形界面，走串口控制台，服务器场景的标配；\n- `--noautoconsole`：安装完不自动连控制台，脚本里必加，否则命令会挂在控制台上；\n- `--osinfo rocky9`（等价老写法 `--os-variant`）：告诉 libvirt 客户机类型，**不指定会退化到性能很差的默认配置**（如缺 virtio 优化）。\n\n**无人值守安装**通常配合两种方式：把 kickstart/preseed 放到 HTTP 服务器并用 `--extra-args "ks=http://10.0.1.30/ks.cfg"`，或者用 cloud 镜像 + `--import` + cloud-init（推荐，更快更标准）。\n\n`--dry-run` 可以先看将要生成的 XML 而不实际创建，是学习与验证参数的好帮手。',
      params: [
        { flag: '--name <名称>', desc: '虚机名称，必须唯一' },
        { flag: '--memory <MB> / --vcpus <核数>', desc: '内存与 vCPU；`--vcpus 4,maxvcpus=8` 可预留热插拔空间' },
        { flag: '--disk <参数>', desc: '磁盘：`path=`、`size=`（GB）、`format=`、`bus=virtio`、`cache=`' },
        { flag: '--network <参数>', desc: '网络：`bridge=br0`、`network=default`、`model=virtio`、`mac=`' },
        { flag: '--location <源> / --cdrom <ISO>', desc: '安装源：HTTP/FTP 安装树、本地目录、ISO 文件' },
        { flag: '--import', desc: '跳过安装，直接用已有磁盘启动（cloud 镜像场景必用）' },
        { flag: '--osinfo <系统>', desc: '指定客户机系统类型，如 `rocky9`、`ubuntu22.04`；**不写会退化性能**' },
        { flag: '--graphics none --console pty,target_type=serial --noautoconsole', desc: '纯文本串口控制台且不自动连接，服务器场景与脚本化标配' }
      ],
      examples: [
        { cmd: 'virt-install --name web-prod-02 --memory 4096 --vcpus 2 --cpu host-passthrough --disk path=/data/vmstore/web-prod-02.qcow2,size=40,format=qcow2,bus=virtio --network bridge=br0,model=virtio --location /data/iso/Rocky-9.3-x86_64-dvd.iso --osinfo rocky9 --graphics none --console pty,target_type=serial --noautoconsole', desc: '从 ISO 安装一台虚机，全 virtio 且无图形界面' },
        { cmd: 'virt-install --name app-03 --memory 8192 --vcpus 4 --disk path=/data/vmstore/app-03.qcow2,format=qcow2,bus=virtio --network network=default,model=virtio --import --osinfo rocky9 --graphics none --console pty,target_type=serial --noautoconsole', desc: '导入已有 cloud 镜像磁盘启动虚机，cloud 镜像场景的标准做法' },
        { cmd: 'virt-install --name ks-demo --memory 2048 --vcpus 2 --disk size=20 --network network=default --location http://10.0.1.30/rocky9/ --extra-args "ks=http://10.0.1.30/ks.cfg console=ttyS0,115200" --osinfo rocky9 --graphics none --noautoconsole', desc: 'HTTP 安装树 + kickstart 无人值守安装' },
        { cmd: 'virt-install --name test-01 --memory 1024 --vcpus 1 --disk size=10 --network network=default --cdrom /data/iso/Rocky-9.3-x86_64-dvd.iso --osinfo rocky9 --dry-run', desc: '演练模式：只打印将生成的 XML，不实际创建' }
      ],
      notes: [
        '**`--osinfo`（老写法 `--os-variant`）一定要写**：不指定时 libvirt 会退化为"未知系统"的保守配置，磁盘与网卡可能不用 virtio，性能差距很大',
        '**`--noautoconsole` 脚本里必须加**：否则命令会卡在控制台界面不返回，CI 与自动化脚本直接挂死',
        '**`bus=virtio` 与 `model=virtio` 是性能关键**：使用 IDE/SATA/e1000 会让磁盘与网络性能大幅下降',
        '**`--cpu host-passthrough` 换来性能但牺牲迁移性**：宿主机 CPU 型号不一致的集群里会导致迁移失败，需要迁移的场景请用具体 CPU 型号',
        '磁盘 `path=` 与 `size=` 同时给时以 path 为准；只给 `size=` 会创建在默认存储池（系统盘的 `/var/lib/libvirt/images`），**生产环境请显式指定数据盘路径**',
        '用 `--location` 安装时如果指定 `--extra-args`，**必须同时确保内核输出到串口**（`console=ttyS0,115200`），否则看不到安装过程',
        'Windows 虚机需要额外的 virtio 驱动 ISO（`--disk path=virtio-win.iso,device=cdrom`），否则装完看不到磁盘',
        '删除虚机时要 `virsh undefine`，磁盘文件不会自动删除，留在存储池里占空间，需要手工确认清理'
      ],
      related: ['vm-virsh-edit', 'vm-img-create', 'vm-cloud-localds', 'vm-cloud-image-flow'],
      docs: 'https://manpages.debian.org/bookworm/virtinst/virt-install.1.en.html',
      tags: ['创建虚机', '无人值守', 'virtio', '自动化']
    },

    /* ---------- 17 / 25 ---------- */
    {
      id: 'vm-img-virt-customize',
      name: 'virt-customize',
      alias: ['virt-customize', '改镜像', '注入SSH密钥'],
      level: 3,
      syntax: 'virt-customize -a <镜像> [--install <包>] [--run-command "<命令>"] [--ssh-inject <用户>:file:<公钥>] [--root-password password:<密码>] [--hostname <主机名>]',
      summary: '离线修改镜像：装软件、注入密钥、改密码、跑脚本，改完即可批量部署。',
      desc: '`virt-customize` 直接挂载镜像文件（借助 libguestfs 启动一个临时小虚拟机来操作），**不需要启动目标系统**，因此特别适合做"基础镜像 + 个性化定制"的批量流程。它修改是**原地（in place）**的，所以在生产上使用前务必先复制一份镜像。\n\n**高频用法**：\n- `--install qemu-guest-agent,chrony`：预装必要软件包（**依赖宿主机网络与 yum/apt 源**，装不了会报错）；\n- `--ssh-inject root:file:/root/.ssh/id_ed25519.pub`：把公钥注入指定用户（**该用户必须已存在**）；\n- `--root-password password:<新密码>`：设置 root 密码（配合 `--password-crypto sha512` 保证加密强度）；\n- `--run-command "..."`：在镜像内执行命令（如 `systemctl enable qemu-guest-agent`）；\n- `--firstboot-command "..."`：写入"首次启动时执行"的脚本，适合需要真实硬件环境才能做的操作；\n- `--hostname <名称>`、`--timezone`、`--copy-in`、`--upload`：常规配置项。\n\n**`--run-command` 与 `--firstboot-command` 的区别很关键**：前者在构建时于 libguestfs 的小虚拟机里执行（网络受限、硬件与真实环境不同），后者是写进镜像、在虚机第一次启动时于真实环境中执行。需要 `yum install` 且依赖真实环境的操作，应优先用 `--firstboot-command`。\n\n**SELinux 注意**：virt-customize 会自动对新增/修改的文件重打 SELinux 标签，若重打失败会创建 `/.autorelabel` 让系统下次启动时重打（表现为首次启动很慢），这是正常行为。\n\n`-n/--dry-run` 可以只做演练不实际修改，验证参数是否正确时很有用。',
      params: [
        { flag: '-a <镜像>', desc: '指定要修改的镜像文件，可多次指定多块盘' },
        { flag: '--install <包列表>', desc: '构建时安装软件包（需要宿主机网络与软件源）' },
        { flag: '--run-command "<命令>"', desc: '在镜像内执行命令（构建时，环境受限）' },
        { flag: '--firstboot-command "<命令>"', desc: '写入首次启动时执行的命令（真实环境，更适合装软件）' },
        { flag: '--ssh-inject <用户>:file:<公钥>', desc: '为用户注入 SSH 公钥，**用户必须已存在**' },
        { flag: '--root-password password:<密码>', desc: '设置 root 密码；配合 `--password-crypto sha512` 更安全' },
        { flag: '--hostname <名称> / --copy-in <本地>:<镜像内目录>', desc: '设置主机名 / 把宿主机文件复制进镜像' },
        { flag: '-n, --dry-run', desc: '演练模式，不实际修改镜像' }
      ],
      examples: [
        { cmd: 'cp /data/images/rocky9-base.qcow2 /data/images/web-prod-02.qcow2 && virt-customize -a /data/images/web-prod-02.qcow2 --hostname web-prod-02 --install qemu-guest-agent,chrony --run-command "systemctl enable qemu-guest-agent chronyd"', desc: '先复制镜像再定制：装必要软件并设置开机自启' },
        { cmd: 'virt-customize -a /data/images/web-prod-02.qcow2 --ssh-inject root:file:/root/.ssh/id_ed25519.pub', desc: '注入运维公钥，实现免密登录' },
        { cmd: 'virt-customize -a /data/images/web-prod-02.qcow2 --root-password password:<新root密码> --password-crypto sha512', desc: '设置 root 密码并使用 sha512 加密' },
        { cmd: 'virt-customize -a /data/images/web-prod-02.qcow2 --copy-in /opt/app/config:/opt/app --run-command "chown -R app:app /opt/app"', desc: '把配置文件复制进镜像并修正属主' },
        { cmd: 'virt-customize -a /data/images/web-prod-02.qcow2 --firstboot-command "dnf install -y nginx && systemctl enable --now nginx"', desc: '把装包动作放到首次启动执行，避免构建时网络受限' },
        { cmd: 'virt-customize -a /data/images/web-prod-02.qcow2 -n --install nginx', desc: '演练模式验证参数，不实际改动镜像' }
      ],
      notes: [
        '**virt-customize 是原地修改**：生产流程必须先 `cp` 一份镜像再定制，改错了原始镜像就没了',
        '**目标虚机必须处于关机状态**：对运行中虚机的镜像做修改会损坏数据，官方明确警告',
        '**`--ssh-inject` 指定的用户必须已存在于镜像中**，否则会失败；root 用户通常存在，其他用户要先用 `--run-command "useradd ..."` 创建',
        '**构建时的 `--install` 依赖宿主机网络**，内网环境要提前配置好可用的软件源，否则报错中断',
        '`--run-command` 里运行 `systemctl enable` 通常没问题（只是创建软链），但 `systemctl start` 在构建环境里无意义，**服务启动要用 `--firstboot-command`**',
        '**不要用 `--root-password` 在镜像里留明文弱密码**：镜像会流转到多处，密码应通过 cloud-init 或首次启动脚本注入',
        'SELinux 系统上会自动重打标签，若失败会创建 `/.autorelabel`，表现为首次启动明显变慢，属正常现象',
        'Windows 镜像不适用这套工具（virt-customize 主要面向 Linux），Windows 需要 sysprep 等专用流程'
      ],
      related: ['vm-img-guestfish', 'vm-cloud-image-flow', 'ln-ssh-keygen', 'vm-img-create'],
      docs: 'https://libguestfs.org/virt-customize.1.html',
      tags: ['镜像定制', 'SSH注入', '离线修改', 'libguestfs']
    },

    /* ---------- 18 / 25 ---------- */
    {
      id: 'vm-img-guestfish',
      name: 'guestfish / libguestfs',
      alias: ['guestfish', 'libguestfs', '挂载镜像查看'],
      level: 4,
      syntax: 'guestfish --ro -a <镜像> -i <命令> | guestfish --ro -a <镜像> -i  # 交互模式',
      summary: '不启动虚机直接浏览与修改镜像内部文件，救援与取证的利器。',
      desc: 'libguestfs 工具集会在需要时启动一个极小的虚拟机，把目标镜像挂载进去操作，因此**不需要 root 权限、不依赖镜像内的内核与驱动**——即使镜像的系统已经损坏到无法启动，依然能读取里面的文件。\n\n**`guestfish` 是最底层的交互式工具**：`--ro` 只读、`-a` 添加镜像、`-i` 自动检查并挂载所有文件系统；进入交互界面后用 `ls`、`ll`、`cat`、`download`、`upload`、`rm` 等命令操作。**只读模式是救援与取证的默认姿势**，能避免误改证据或改坏镜像。\n\n**一键式命令**（不进交互界面）：`guestfish --ro -a disk.qcow2 -i cat /etc/hostname` 直接输出结果，适合脚本。\n\n**更高层的封装工具更常用**：\n- `virt-filesystems -a img --all --long -h`：列出镜像里的文件系统、分区、LVM 与容量；\n- `virt-df -a img -h`：像 `df` 一样看镜像内各文件系统的使用率（**排查镜像磁盘将满的首选**）；\n- `virt-ls -lR -a img /etc`：递归列出目录；\n- `virt-cat -a img /etc/fstab`：直接读文件；\n- `virt-copy-out -a img /var/log/messages /tmp/`：把文件拷出来；\n- `virt-rescue -a img`：进入救援 shell，用于修复无法启动的系统（重装 GRUB、改 fstab、重置密码）。\n\n**典型场景**：虚机起不来要改 `/etc/fstab`；忘记密码要清空 `/etc/shadow`；排查镜像磁盘是否将满；从坏镜像里抢救数据；审计镜像里是否残留了密钥与历史记录。',
      params: [
        { flag: '--ro', desc: '只读打开，救援与取证的默认姿势，防止误改' },
        { flag: '-a <镜像>', desc: '添加镜像文件，可多次指定（多块盘）' },
        { flag: '-i', desc: '自动检查并挂载镜像内的文件系统（inspect）' },
        { flag: '-d <域名>', desc: '直接操作某台 libvirt 虚机的所有磁盘' },
        { flag: '-m <设备>', desc: '手动指定要挂载的设备，自动检查失败时使用' },
        { flag: 'virt-filesystems / virt-df', desc: '配套工具：列出文件系统清单 / 查看使用率' },
        { flag: 'virt-rescue -a <镜像>', desc: '进入救援 shell，用于修复无法启动的系统' }
      ],
      examples: [
        { cmd: 'guestfish --ro -a /data/vmstore/web-prod-01.qcow2 -i cat /etc/hostname', desc: '不启动虚机直接读取镜像内的文件' },
        { cmd: 'guestfish --ro -a /data/vmstore/web-prod-01.qcow2 -i', desc: '进入只读交互模式，用 ls/cat/download 等命令操作' },
        { cmd: 'virt-filesystems -a /data/vmstore/web-prod-01.qcow2 --all --long -h', desc: '列出镜像内的分区、文件系统与 LVM 结构及容量' },
        { cmd: 'virt-df -a /data/vmstore/web-prod-01.qcow2 -h', desc: '查看镜像内各文件系统使用率，排查磁盘将满' },
        { cmd: 'virt-copy-out -a /data/vmstore/web-prod-01.qcow2 /var/log/messages /tmp/rescue-logs/', desc: '把镜像内的日志文件拷出来分析' },
        { cmd: 'virt-rescue -a /data/vmstore/broken-vm.qcow2', desc: '进入救援 shell，修复无法启动系统（改 fstab、重装 GRUB）' }
      ],
      notes: [
        '**默认一律加 `--ro`**：只读模式能避免误改；需要写入时（如清密码）再去掉，并明确知道自己在改什么',
        'libguestfs 启动的小虚拟机需要一定的内存（默认约 500MB），**宿主机内存紧张时可能失败**，可用 `-m` 参数调整',
        '镜像内有 LVM 时，`-i` 通常能自动激活并挂载；如果镜像来自别的机器且卷组同名冲突，可能需要加 `--` 相关参数或先 `vgchange` 处理',
        '**Windows 镜像的盘符与 Linux 不同**，guestfish 里看到的是 `/dev/sda1` 之类的设备名，路径要按实际结构写',
        '**加解密镜像（LUKS）需要显式提供密钥**（`--key` 参数），否则看不到内容',
        'libguestfs 工具在宿主机需要安装对应包：CentOS 装 `libguestfs-tools`，Ubuntu 装 `libguestfs-tools`；精简系统可能缺少内核与 appliance 组件导致启动失败',
        '**取证场景务必用只读模式并记录哈希**：写入会改变镜像内容，影响证据效力'
      ],
      related: ['vm-img-virt-customize', 'vm-img-info', 'vm-img-convert', 'vm-cloud-image-flow'],
      docs: 'https://libguestfs.org/guestfish.1.html',
      tags: ['镜像救援', 'libguestfs', '取证', '离线操作']
    },

    /* ================= C. 云镜像与初始化 ================= */

    /* ---------- 19 / 25 ---------- */
    {
      id: 'vm-cloud-cloud-init',
      name: 'cloud-init 调试',
      kind: 'recipe',
      alias: ['cloud-init status', 'cloud-init 日志', '云主机初始化失败'],
      level: 3,
      syntax: 'cloud-init status [--long] [--wait] | cloud-init analyze show | cloud-init clean --logs | cat /var/log/cloud-init.log',
      summary: '查看云主机首次启动初始化的执行结果，定位用户数据没生效的原因。',
      desc: 'cloud-init 是云主机"开机自动配置"的引擎：设置主机名、注入 SSH 公钥、配置网络、装软件、跑脚本。它出问题时表现往往很"玄学"：密码登不上、公钥没注入、脚本没执行——**根因都在两个日志文件里**。\n\n**两个日志的分工必须搞清楚**：\n- `/var/log/cloud-init.log`：cloud-init 自身的调试日志，记录各模块的执行与跳过原因（如 datasource 探测、模块依赖、语法错误）；\n- `/var/log/cloud-init-output.log`：**用户脚本（`runcmd`、`bootcmd`）的 stdout/stderr**，脚本报错看这里。\n\n**排查标准链路**：\n① `cloud-init status --long` 看整体状态：`done` 正常、`error` 有失败、`running` 还在跑；`--long` 会列出出错的模块；\n② 若状态是 error，追 `cloud-init status --long` 给出的失败阶段，再到 `/var/log/cloud-init.log` 里搜该模块名；\n③ 脚本类问题查 `/var/log/cloud-init-output.log`，**看到 shell 报错就是用户数据的问题**；\n④ 想确认"到底拿到了什么用户数据"：`cloud-init query userdata` 打印实际收到的 user-data，`cloud-init query --all` 打印所有元数据（实例 ID、主机名、可用区等）；\n⑤ 时间线分析：`cloud-init analyze show` 与 `cloud-init analyze blame` 给出各阶段耗时，排查"启动特别慢"时非常有用。\n\n**重跑初始化**：`cloud-init clean --logs` 清除状态与日志，重启后会当成首次启动再跑一遍。**注意这会导致重新执行用户数据里的脚本**（可能重复装包、重复写文件），在生产机上执行前务必确认脚本幂等。\n\n**云镜像制作的关键一步**：把镜像做成云镜像前，必须执行 `cloud-init clean --logs` 清掉 instance-id 与日志，否则用该镜像创建的每一台 ECS 都会认为"已经初始化过"而跳过用户数据。',
      params: [
        { flag: 'status', desc: '查看初始化整体状态：done / error / running' },
        { flag: 'status --long', desc: '显示详细状态与出错模块，排障第一选择' },
        { flag: 'status --wait', desc: '阻塞等待初始化完成，脚本里判断是否就绪时使用' },
        { flag: 'analyze show / analyze blame', desc: '各阶段耗时分析与最耗时阶段排名' },
        { flag: 'query userdata / query --all', desc: '查看实际收到的用户数据与元数据，验证"数据到没到"' },
        { flag: 'clean --logs', desc: '清除初始化状态与日志（**重启后会重新执行用户数据**）' },
        { flag: 'schema --config-file <文件>', desc: '校验 user-data 语法（较新版本提供，用于提交前自查）' }
      ],
      examples: [
        { cmd: 'cloud-init status --long', desc: '查看初始化状态与出错模块，排障第一步' },
        { cmd: 'grep -iE "error|fail|traceback" /var/log/cloud-init.log | tail -20', desc: '在 cloud-init 主日志里找错误' },
        { cmd: 'tail -50 /var/log/cloud-init-output.log', desc: '查看用户脚本的输出与报错，runcmd 失败必看' },
        { cmd: 'cloud-init query userdata', desc: '打印实际收到的 user-data，确认数据是否传到了虚机' },
        { cmd: 'cloud-init analyze blame | head -15', desc: '查看哪个阶段最耗时，排查启动慢' },
        { cmd: 'cloud-init clean --logs && reboot', desc: '清除初始化状态并重启重跑（仅在确认脚本幂等后使用）' }
      ],
      notes: [
        '**分不清两个日志是排障最大的障碍**：cloud-init 自身的问题在 `/var/log/cloud-init.log`，用户脚本的报错在 `/var/log/cloud-init-output.log`',
        '**`cloud-init clean` 会导致用户数据被重新执行**：脚本若不幂等（如重复追加配置、重复创建用户）可能造成故障，生产机上操作前务必确认',
        '`cloud-init status --wait` 在脚本里判断"实例是否初始化完成"非常有用，比 `sleep 60` 可靠得多',
        '**做云镜像前必须 `cloud-init clean --logs`**：否则镜像里残留的 instance-id 会让新实例跳过初始化，这是自制镜像最常见的坑',
        'datasource 探测失败（如 NoCloud 的 seed ISO 卷标不是 `cidata`）会让 cloud-init 直接跳过所有配置，日志里会写 `Did not find any datasource`',
        'user-data 首行必须是 `#cloud-config`（cloud-config 格式）或 `#!/bin/bash`（脚本格式），**写错或漏写会被当成无格式数据而忽略**',
        'YAML 对缩进极其敏感，一个空格错误就导致整个 user-data 解析失败，提交前用 `cloud-init schema` 或在线校验工具检查',
        '不同发行版的 cloud-init 版本差异较大，某些模块可能不存在，跨系统复用的 user-data 要做兼容测试'
      ],
      related: ['vm-cloud-user-data', 'vm-cloud-localds', 'vm-cloud-image-flow', 'lu-journalctl'],
      docs: 'https://docs.cloud-init.io/en/latest/howto/debugging.html',
      tags: ['cloud-init', '云主机初始化', '日志排障', 'YAML']
    },

    /* ---------- 20 / 25 ---------- */
    {
      id: 'vm-cloud-user-data',
      name: 'user-data / meta-data 写法',
      kind: 'recipe',
      alias: ['user-data', 'meta-data', 'cloud-config 语法'],
      level: 3,
      syntax: '#cloud-config 开头的 YAML（user-data） + instance-id/local-hostname（meta-data）',
      summary: '编写云主机的初始化配置与元数据，决定实例第一次开机做什么。',
      desc: '**user-data** 是"要执行的配置"，**meta-data** 是"实例的身份信息"，两者配合使用。\n\n**user-data 的三种格式**（首行决定格式，写错等于没写）：\n- `#cloud-config`：YAML 格式，最常用，用声明式配置完成任务；\n- `#!/bin/bash`：脚本格式，直接当 shell 脚本执行，适合逻辑复杂但环境固定的场景；\n- `#include` / MIME 多部分：前者引用外部 URL，后者把多种格式打包在一起。\n\n**最常用的 cloud-config 键**：\n- `hostname` / `fqdn`：设置主机名；\n- `users`：创建用户并指定 `ssh_authorized_keys`、`sudo` 权限、`shell`；\n- `ssh_pwauth` / `chpasswd`：是否允许密码登录、批量设置密码（**注意密码会明文出现在 user-data 里**）；\n- `package_update` / `packages`：更新源并安装软件包；\n- `write_files`：写文件（可指定 `permissions` 与 `owner`）；\n- `runcmd`：启动后执行的命令列表（**最常用也最容易出错的地方，不保证顺序、失败不一定中断**）；\n- `bootcmd`：更早执行（每次启动都跑，而 runcmd 只在首次启动跑）；\n- `growpart` / `resizefs`：根分区自动扩容（云镜像里通常已默认开启）；\n- `power_state`：初始化完成后重启或关机。\n\n**meta-data** 关键字段：`instance-id`（**必须唯一，重复会导致 cloud-init 认为已经初始化过**）、`local-hostname`，NoCloud 场景还可以带 `network-config` 描述网络。\n\n**写 user-data 的三条纪律**：① YAML 缩进用空格不用 Tab（**Tab 会导致解析失败**）；② `runcmd` 里的命令失败不会让整个流程显式失败，关键步骤要自己加 `&&` 或日志；③ 不要在 user-data 里写明文密码与密钥，改用 Vault 或密钥管理服务。',
      params: [
        { flag: '#cloud-config', desc: 'user-data 首行标记，声明使用 YAML 格式，**不能漏**' },
        { flag: 'hostname / fqdn', desc: '设置主机名与完整域名' },
        { flag: 'users', desc: '创建用户，可指定 `ssh_authorized_keys`、`sudo`、`shell`' },
        { flag: 'packages / package_update', desc: '安装软件包与是否先更新软件源' },
        { flag: 'write_files', desc: '写入文件，支持 `content`、`path`、`permissions`、`owner`' },
        { flag: 'runcmd / bootcmd', desc: '首次启动执行 / 每次启动都执行的命令列表' },
        { flag: 'growpart / resizefs', desc: '根分区自动扩容与文件系统扩展' },
        { flag: 'instance-id', desc: 'meta-data 中必须唯一的实例标识，重复会导致初始化被跳过' }
      ],
      examples: [
        { cmd: 'printf "#cloud-config\\nhostname: web-prod-02\\nusers:\\n  - name: ops\\n    sudo: ALL=(ALL) NOPASSWD:ALL\\n    ssh_authorized_keys:\\n      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey ops@example.com\\npackages:\\n  - nginx\\n  - chrony\\nruncmd:\\n  - systemctl enable --now nginx\\n" > /tmp/user-data', desc: '生成标准 cloud-config：设置主机名、创建用户、装包并启动服务' },
        { cmd: 'printf "instance-id: iid-web-0002\\nlocal-hostname: web-prod-02\\n" > /tmp/meta-data', desc: '生成 meta-data，instance-id 必须唯一' },
        { cmd: 'printf "#!/bin/bash\\necho \\"初始化开始 $(date)\\" >> /var/log/boot-init.log\\ndnf install -y nginx\\n" > /tmp/user-data-script', desc: '使用 shell 脚本格式的 user-data，适合逻辑复杂场景' },
        { cmd: 'cloud-init schema --config-file /tmp/user-data', desc: '提交前校验 user-data 语法（需较新版本）' },
        { cmd: 'grep -n "\\t" /tmp/user-data', desc: '检查是否误用了 Tab 缩进（YAML 只认空格）' }
      ],
      notes: [
        '**首行格式标记不能漏**：cloud-config 必须是 `#cloud-config`，脚本必须是 `#!/bin/bash`，否则 cloud-init 会把它当成未知数据直接忽略',
        '**YAML 缩进只能用空格，不能用 Tab**：一个 Tab 就会导致解析失败且报错信息不直观，这是最高频的踩坑点',
        '**`meta-data` 里的 `instance-id` 必须唯一**：用同一份 seed 启动多台虚机，只有第一台会执行初始化',
        '**`runcmd` 中命令失败不会中断整个流程**：关键步骤要加 `&&`、`|| exit 1` 或写日志，否则"看起来成功了但服务没起来"',
        '`runcmd` 相对 `bootcmd` 更晚执行（网络就绪后），需要联网的操作应放在 `runcmd` 里',
        '**不要在 user-data 里写明文密码与 AK/SK**：user-data 会在实例元数据服务中可查（部分平台还能被实例内任何用户读取），属于凭据泄露的高发点',
        '`write_files` 写入的文件要显式指定 `permissions`，否则默认权限可能与预期不符（如私钥文件权限过宽）',
        '跨发行版的 user-data 要测试：`packages` 在不同系统上走 yum/apt，包名不同会导致失败'
      ],
      related: ['vm-cloud-cloud-init', 'vm-cloud-localds', 'vm-cloud-image-flow', 'sec-ssh-keygen'],
      docs: 'https://docs.cloud-init.io/en/latest/explanation/format/index.html',
      tags: ['cloud-config', '初始化', 'YAML', '自动化']
    },

    /* ---------- 21 / 25 ---------- */
    {
      id: 'vm-cloud-localds',
      name: 'cloud-localds',
      alias: ['cloud-localds', 'NoCloud seed', '制作 seed ISO'],
      level: 3,
      syntax: 'cloud-localds [--network-config=<文件>] <输出.img> <user-data> [<meta-data>]',
      summary: '打包 user-data 与 meta-data 成 seed 镜像供本地 KVM 使用。',
      desc: '云平台通过 metadata 服务把初始化数据交给实例；**本地 KVM 没有这个服务**，所以要用 NoCloud 数据源——把 `user-data` 与 `meta-data` 打包成一个 ISO/镜像，作为第二块盘挂给虚机。cloud-init 启动时会扫描带有特定卷标（`cidata` 或 `CIDATA`）的卷并读取其中的文件。\n\n`cloud-localds` 就是做这个打包的工具（来自 `cloud-image-utils` 包），它自动处理好卷标与文件布局，比手工 `genisoimage` 省事也不容易出错。\n\n**标准流程**：① 准备 `user-data` 与 `meta-data` 两个文件；② `cloud-localds seed.img user-data meta-data`；③ 用 `virt-install --import` 把 cloud 镜像作为系统盘、`seed.img` 作为第二块盘启动。\n\n**必须用 cloud 镜像**：只有预装了 cloud-init 的镜像（发行版官方的 cloud image、华为云市场的云镜像）才会读取 seed。普通的 ISO 安装系统里没有 cloud-init，挂了 seed 也不会生效。\n\n**网络配置**：NoCloud 支持把 `network-config` 作为第三个输入传给 `--network-config=` 参数，用于在没有 DHCP 的环境里静态配置网络，格式是 cloud-init 的 network-config v1/v2。\n\n**排障要点**：如果 cloud-init 提示 `Did not find any datasource`，先检查卷标是否为 `cidata`（**大小写敏感**）、seed 盘是否真的挂上了（`virsh domblklist`）、以及虚机能否识别该设备。',
      params: [
        { flag: '<输出.img>', desc: '生成的 seed 镜像文件，通常命名为 `seed.img`' },
        { flag: '<user-data>', desc: '初始化配置内容文件' },
        { flag: '<meta-data>', desc: '实例元数据文件，省略时会自动生成最小内容' },
        { flag: '--network-config=<文件>', desc: '指定网络配置，用于静态 IP 等场景' },
        { flag: '-v, --verbose', desc: '输出详细信息，排查打包问题' },
        { flag: '卷标 cidata', desc: 'NoCloud 数据源的识别依据，**大小写敏感**，手工打包时必须是这个值' }
      ],
      examples: [
        { cmd: 'cloud-localds /data/vmstore/web-prod-02-seed.img /tmp/user-data /tmp/meta-data', desc: '把 user-data 与 meta-data 打包成 seed 镜像' },
        { cmd: 'cloud-localds --network-config=/tmp/network-config /data/vmstore/seed-static.img /tmp/user-data /tmp/meta-data', desc: '带静态网络配置的 seed，用于无 DHCP 环境' },
        { cmd: 'virt-install --name web-prod-02 --memory 2048 --vcpus 2 --disk path=/data/vmstore/web-prod-02.qcow2,format=qcow2,bus=virtio --disk path=/data/vmstore/web-prod-02-seed.img,device=cdrom --network bridge=br0,model=virtio --import --osinfo rocky9 --graphics none --console pty,target_type=serial --noautoconsole', desc: '用 cloud 镜像 + seed 盘启动虚机，cloud-init 会自动执行 user-data' },
        { cmd: 'virsh domblklist web-prod-02 --details', desc: '确认 seed 盘已挂载到虚机' },
        { cmd: 'isoinfo -d -i /data/vmstore/web-prod-02-seed.img | grep -i volume', desc: '检查 seed 镜像的卷标是否为 cidata' }
      ],
      notes: [
        '**卷标必须是 `cidata`（大小写敏感）**：手工用 `genisoimage` 打包时写成其他值，cloud-init 会完全找不到数据源',
        '**必须使用带 cloud-init 的 cloud 镜像**：普通 ISO 安装的系统里没有 cloud-init，挂 seed 也不会执行任何配置',
        '**`instance-id` 相同的 seed 只会生效一次**：批量部署时每台虚机的 meta-data 都要重新生成并改 instance-id',
        'seed 盘通常以 cdrom 方式挂载（`device=cdrom`），cloud-init 也支持 vfat 格式的磁盘，但 ISO 兼容性最好',
        '`cloud-localds` 来自 `cloud-image-utils` 包（Ubuntu/Debian），CentOS 上可用 `genisoimage -volid cidata -joliet -rock user-data meta-data -o seed.img` 替代',
        'user-data 里的 YAML 语法错误不会阻止虚机启动，只会让 cloud-init 静默跳过配置，**务必用 `cloud-init status --long` 验证**',
        '生产环境更推荐用云平台（如华为云 IMS + ECS 的"用户数据"功能）注入，省去自己维护 seed 盘的步骤'
      ],
      related: ['vm-cloud-user-data', 'vm-cloud-cloud-init', 'vm-img-virt-install', 'vm-cloud-image-flow'],
      docs: 'https://docs.cloud-init.io/en/latest/reference/datasources/nocloud.html',
      tags: ['NoCloud', 'seed镜像', 'cloud-init', '本地KVM']
    },

    /* ---------- 22 / 25 ---------- */
    {
      id: 'vm-cloud-image-flow',
      name: '云镜像制作完整流程（组合）',
      kind: 'recipe',
      alias: ['制作云镜像', '自定义镜像流程', '镜像上传 IMS'],
      level: 4,
      syntax: '下载 cloud 镜像 → virt-customize 定制 → cloud-init clean → 验证启动 → 压缩转换 → 上传 OBS → 注册为 IMS 私有镜像',
      summary: '从官方 cloud 镜像做出可批量创建 ECS 的私有镜像，含验证与上传环节。',
      desc: '自制云镜像是"一次投入、长期复用"的工作：做好一个标准镜像，之后所有 ECS 都能在分钟级创建出来且配置一致。流程中最容易出错的是"清理不彻底"与"验证不充分"。\n\n**完整链路（每步都要做，跳过任何一步都会在后面翻车）**：\n\n**① 准备基础镜像**：从发行版官方下载 cloud 镜像（qcow2 格式，**必须是 cloud 版而不是 DVD 版**，前者自带 cloud-init 与 virtio 驱动）。用 `qemu-img info` 确认格式与大小。\n\n**② 定制镜像**：用 `virt-customize` 装必要软件（qemu-guest-agent、chrony、监控 agent）、注入基础配置、设置时区与主机名模板。**不要在这里写死主机名与密钥**，那些应由 cloud-init 在实例创建时注入。\n\n**③ 清理痕迹（最关键的一步）**：`virt-customize --run-command "cloud-init clean --logs"` 清除 instance-id 与日志；同时清理 `/etc/machine-id`（用 `truncate -s 0` 置空）、SSH 主机密钥（`rm -f /etc/ssh/ssh_host_*`，让每台实例自己生成）、`/root/.bash_history` 与 `authorized_keys`（**镜像里残留公钥等于给所有人留后门**）。\n\n**④ 本地验证（不可跳过）**：用 `cloud-localds` 做一份 seed，`virt-install --import` 起一台虚机，确认能启动、cloud-init 正常执行、网络与 SSH 正常、virtio 驱动生效（`lsblk` 看到 `vda`、`lspci | grep -i virtio`）。**没有本地验证就上传，等于把问题带到线上**。\n\n**⑤ 压缩与转换**：`qemu-img convert -c -O qcow2` 压缩瘦身，能显著减小上传体积。若平台要求 raw/vmdk 格式则一并转换。\n\n**⑥ 上传对象存储**：用 `obsutil cp` 把镜像上传到 OBS 桶（大文件建议分片上传并确认校验值一致）。\n\n**⑦ 注册为私有镜像**：在 IMS 控制台（或用 KooCLI 调用 IMS 接口）以"外部镜像文件"方式导入，指定 OBS 上的镜像文件路径、操作系统类型、系统盘大小与架构。导入过程需要一段时间，完成后即可用于创建 ECS。\n\n**⑧ 用镜像创建 ECS 并做最终验收**：起一台最小规格 ECS，确认登录、cloud-init 注入、磁盘自动扩容、监控 agent 全部正常，再把镜像标记为可用版本。\n\n**版本管理**：镜像命名带日期与版本号（如 `rocky9-base-v1.2-20240318`），保留上一版的可用镜像用于回滚。',
      params: [
        { flag: 'qemu-img info / convert', desc: '确认基础镜像格式；转换与压缩瘦身' },
        { flag: 'virt-customize', desc: '离线定制镜像：装包、注入配置、清理痕迹' },
        { flag: 'cloud-init clean --logs', desc: '清除初始化状态，**自制云镜像必做**，否则新实例跳过初始化' },
        { flag: '/etc/machine-id', desc: '需置空，否则多台实例 machine-id 相同会导致 DHCP 与日志混乱' },
        { flag: 'cloud-localds + virt-install --import', desc: '本地验证：用 seed 盘启动镜像确认可用' },
        { flag: 'obsutil cp <文件> obs://<桶>/', desc: '把镜像上传到 OBS 桶，供 IMS 导入' },
        { flag: 'IMS 导入私有镜像', desc: '在控制台或用 KooCLI 以外部镜像文件方式注册为私有镜像' }
      ],
      examples: [
        { cmd: 'qemu-img info /data/images/Rocky-9-GenericCloud.qcow2 && cp /data/images/Rocky-9-GenericCloud.qcow2 /data/images/rocky9-base-v1.0.qcow2', desc: '第一步：确认基础镜像格式并复制一份开始定制' },
        { cmd: 'virt-customize -a /data/images/rocky9-base-v1.0.qcow2 --install qemu-guest-agent,chrony --run-command "systemctl enable qemu-guest-agent chronyd" --timezone Asia/Shanghai', desc: '第二步：安装云主机必备组件并设置时区' },
        { cmd: 'virt-customize -a /data/images/rocky9-base-v1.0.qcow2 --run-command "cloud-init clean --logs" --run-command "truncate -s 0 /etc/machine-id" --run-command "rm -f /etc/ssh/ssh_host_* /root/.bash_history" --run-command "rm -f /root/.ssh/authorized_keys"', desc: '第三步：清理实例标识与密钥痕迹，这是云镜像制作的关键' },
        { cmd: 'cloud-localds /tmp/verify-seed.img /tmp/user-data /tmp/meta-data && virt-install --name verify-img --memory 2048 --vcpus 2 --disk path=/data/images/rocky9-base-v1.0.qcow2,format=qcow2,bus=virtio --disk path=/tmp/verify-seed.img,device=cdrom --network network=default,model=virtio --import --osinfo rocky9 --graphics none --console pty,target_type=serial --noautoconsole', desc: '第四步：本地起一台验证虚机，确认镜像可用' },
        { cmd: 'qemu-img convert -c -O qcow2 -p /data/images/rocky9-base-v1.0.qcow2 /data/images/rocky9-base-v1.0-compact.qcow2', desc: '第五步：压缩转换，减小上传体积' },
        { cmd: 'obsutil cp /data/images/rocky9-base-v1.0-compact.qcow2 obs://prod-image/ims/rocky9-base-v1.0.qcow2', desc: '第六步：上传到 OBS 桶，供 IMS 导入' }
      ],
      notes: [
        '**必须用 cloud 版镜像做基础**：发行版 DVD/ISO 安装出来的系统缺少 cloud-init 与 virtio 优化，做出来的镜像在云上体验很差',
        '**`cloud-init clean --logs` 是自制云镜像的必做步骤**：不清除会导致新创建的 ECS 认为已经初始化过，跳过用户数据注入（主机名、密钥都不会生效）',
        '**`/etc/machine-id` 必须置空**：多台实例共用同一个 machine-id 会导致 DHCP 分配冲突、日志系统混乱、监控指标串台',
        '**镜像里绝不能残留 SSH 私钥、authorized_keys、AK/SK、history 记录**：镜像会被复制到多处，残留凭据等于批量泄露',
        '**本地验证不可跳过**：直接上传未经启动验证的镜像，问题会在创建 ECS 时集中爆发，排查成本更高',
        '上传 OBS 后用校验值（`obsutil` 输出或 `sha256sum`）确认文件完整，**大文件上传中断导致镜像损坏是常见事故**',
        '华为云导入镜像有格式与容量要求（支持 qcow2/vmdk/raw 等，系统盘大小需在允许范围内），导入前先核对官方文档的约束',
        '镜像要按版本管理并保留上一版：新镜像出问题时能立刻用旧镜像创建实例，避免业务长时间无法交付',
        '镜像中不要预装与业务强绑定的东西（如固定的服务配置、写死的 IP），那些应由 cloud-init 或配置管理在实例创建时注入'
      ],
      related: ['vm-img-virt-customize', 'vm-cloud-localds', 'vm-cloud-cloud-init', 'vm-img-convert'],
      docs: 'https://support.huaweicloud.com/ims/index.html',
      tags: ['云镜像', 'IMS', 'OBS', '组合命令']
    },

    /* ================= D. 容器与虚拟机工具 ================= */

    /* ---------- 23 / 25 ---------- */
    {
      id: 'vm-misc-packer',
      name: 'packer',
      alias: ['packer build', 'packer validate', '镜像自动化构建'],
      level: 3,
      syntax: 'packer build [-var <键>=<值>] [-only=<构建器>] <模板> | packer validate <模板> | packer inspect <模板>',
      summary: '用模板描述镜像构建过程，一条命令产出可复用的云镜像。',
      desc: 'Packer 把"手工敲命令做镜像"变成"声明式模板 + 一条命令构建"。模板（HCL2 格式，`.pkr.hcl`）包含三部分：**source**（在哪个平台、用什么基础镜像构建）、**build**（构建步骤）、**provisioner**（装软件、改配置，常用 shell 或 ansible）。\n\n**核心价值在于可重复**：同一份模板跑出来的镜像完全一致，且模板可以进 Git 做版本管理与 Code Review，比"某台机器上手工改出来的镜像"可靠得多。它也支持一次构建**同时产出多个平台的镜像**（如同时输出 KVM qcow2 与华为云 IMS 镜像）。\n\n**三个常用子命令**：`packer validate` 检查模板语法与变量（**改完模板先跑它**）、`packer inspect` 打印模板结构（看有哪些 builder 与 provisioner）、`packer build` 真正执行构建。\n\n**构建过程中的常用参数**：`-var` 传入变量（如镜像版本号、基础镜像名）、`-only` 只跑指定的 builder（多平台模板时）、`-force` 强制重建已存在的产物、`-debug` 逐步调试（每步暂停等待确认，排查 provisioner 失败时非常有用）。\n\n**典型 CI 用法**：代码变更触发流水线 → `packer validate` → `packer build` → 产物自动上传到 OBS 并注册为 IMS 镜像 → 通知下游。整条链完全无人值守。',
      params: [
        { flag: 'build <模板>', desc: '执行构建，按模板产出镜像' },
        { flag: 'validate <模板>', desc: '只校验模板语法与变量，**改完模板先跑这个**' },
        { flag: 'inspect <模板>', desc: '打印模板里定义的 builder 与 provisioner 结构' },
        { flag: '-var <键>=<值>', desc: '传入模板变量，如版本号、基础镜像 ID' },
        { flag: '-var-file=<文件>', desc: '从文件批量传入变量，CI 中管理不同环境的参数' },
        { flag: '-only=<构建器>', desc: '只执行指定构建器，多平台模板时使用' },
        { flag: '-force', desc: '强制重新构建，覆盖已存在的产物' },
        { flag: '-debug', desc: '逐步调试模式，每步暂停确认，排查 provisioner 失败' }
      ],
      examples: [
        { cmd: 'packer validate /opt/packer/rocky9-base.pkr.hcl', desc: '构建前校验模板语法与变量' },
        { cmd: 'packer inspect /opt/packer/rocky9-base.pkr.hcl', desc: '查看模板定义了哪些构建器与步骤' },
        { cmd: 'packer build -var "image_version=v1.2" -var "base_image=Rocky-9-GenericCloud.qcow2" /opt/packer/rocky9-base.pkr.hcl', desc: '带变量执行构建，产出带版本号的镜像' },
        { cmd: 'packer build -only=qemu.rocky9 /opt/packer/rocky9-base.pkr.hcl', desc: '多平台模板中只构建 QEMU 镜像' },
        { cmd: 'packer build -debug /opt/packer/rocky9-base.pkr.hcl', desc: '调试模式逐步执行，用于排查 provisioner 失败' }
      ],
      notes: [
        '**构建前必须先 `packer validate`**：语法或变量错误的模板会浪费大量构建时间，早发现能省几十分钟',
        'Packer 构建会**真实启动虚拟机并消耗资源**，在 CI 里并发构建多个镜像时要注意宿主机容量',
        'HCL2 模板（`.pkr.hcl`）与旧版 JSON 模板（`.json`）语法完全不同，**照抄网上示例前先确认格式**，混用会直接报错',
        '**构建产物里不要残留凭据**：provisioner 里如果用了临时 AK/SK 或密码，要确保不写进镜像文件与日志',
        '构建过程依赖网络下载基础镜像与软件包，**内网环境需要提前配置镜像源与代理**，否则中途失败',
        '`-force` 会覆盖已有产物，**在共享的构建目录里使用要谨慎**，可能覆盖他人正在使用的镜像',
        'Packer 只负责"造镜像"，不负责"管理镜像版本"；镜像的版本命名、保留策略、回滚方案要额外设计',
        '与 `virt-customize` 的分工：Packer 适合标准化流水线式的镜像构建（可跨平台），`virt-customize` 适合快速的一次性镜像修改'
      ],
      related: ['vm-cloud-image-flow', 'vm-img-virt-customize', 'vm-img-convert', 'vm-misc-vagrant'],
      docs: 'https://developer.hashicorp.com/packer/docs/commands/build',
      tags: ['镜像构建', '自动化', 'IaC', 'CI']
    },

    /* ---------- 24 / 25 ---------- */
    {
      id: 'vm-misc-vagrant',
      name: 'vagrant',
      alias: ['vagrant up', 'vagrant halt', 'vagrant destroy', 'vagrant snapshot'],
      level: 2,
      syntax: 'vagrant up | vagrant halt | vagrant destroy [-f] | vagrant ssh | vagrant snapshot save|restore|list [<名称>]',
      summary: '用 Vagrantfile 描述开发环境虚机，一条命令创建、连接与销毁。',
      desc: 'Vagrant 面向**开发与测试环境**而不是生产：一个 `Vagrantfile` 描述"用什么 box（基础镜像）、多少内存、什么网络、装什么软件"，团队成员 `vagrant up` 就能得到完全一致的环境，彻底消除"在我机器上是好的"。\n\n**常用命令**：`up` 创建并启动（首次会下载 box 并执行 provision）、`halt` 优雅关机、`destroy` 删除虚机（**可加 `-f` 跳过确认**）、`ssh` 直接登录、`reload` 重启并重新应用配置、`provision` 只重跑配置脚本、`status` 查看状态。\n\n**快照**：`vagrant snapshot save <名称>` 保存当前状态，`restore` 恢复，`list` 列出。**在做危险实验前先 save 一次**是最实用的习惯，比重新 `up` 快得多。\n\n**provider**：默认用 VirtualBox，也支持 `--provider=libvirt`（KVM）、VMware、Hyper-V。国内环境常用 libvirt provider 搭配 KVM，性能比 VirtualBox 好且与生产虚拟化技术一致。\n\n**与生产工具的边界**：Vagrant 是开发环境工具，**不适合管生产虚机**（没有高可用、没有集群管理、没有审计）。生产环境的虚机管理用 `virsh`、OpenStack、Kubernetes 或云平台控制台。\n\n**国内常见问题**：下载 box 很慢，需要配置国内镜像源或直接用本地 box 文件（`config.vm.box_url` 指向本地路径）。',
      params: [
        { flag: 'up', desc: '创建并启动虚机，首次会下载 box 并执行 provision' },
        { flag: 'halt', desc: '优雅关机，保留虚机与磁盘数据' },
        { flag: 'destroy', desc: '删除虚机及其磁盘，**数据会丢失**，`-f` 跳过确认' },
        { flag: 'ssh', desc: 'SSH 登录到虚机（无需关心 IP 与密钥）' },
        { flag: 'reload', desc: '重启虚机并重新应用 Vagrantfile 中的配置' },
        { flag: 'provision', desc: '只重新执行配置脚本，不重建虚机' },
        { flag: 'snapshot save|restore|list', desc: '保存 / 恢复 / 列出快照' },
        { flag: '--provider=libvirt', desc: '指定虚拟化后端，如 libvirt、virtualbox、vmware_desktop' }
      ],
      examples: [
        { cmd: 'vagrant up', desc: '按 Vagrantfile 创建并启动开发虚机' },
        { cmd: 'vagrant ssh', desc: '直接登录虚机，不需要记 IP 与密钥' },
        { cmd: 'vagrant snapshot save before-upgrade && vagrant snapshot list', desc: '做危险操作前先存快照' },
        { cmd: 'vagrant snapshot restore before-upgrade', desc: '实验失败时恢复到快照状态' },
        { cmd: 'vagrant halt && vagrant status', desc: '优雅关机并确认状态' },
        { cmd: 'vagrant destroy -f', desc: '强制删除虚机（数据会丢失，执行前确认）' },
        { cmd: 'vagrant up --provider=libvirt', desc: '使用 KVM/libvirt 作为后端启动' }
      ],
      notes: [
        '**`vagrant destroy -f` 会删除虚机及其磁盘数据且不可恢复**：开发环境无所谓，但如果有重要测试数据请先备份或改用快照',
        '**Vagrant 是开发环境工具，不要用来管生产虚机**：它缺少高可用、审计、权限控制与集群能力',
        '默认后端 VirtualBox 在 Linux 上与 KVM 冲突（VirtualBox 无法与 KVM 共存），生产型 Linux 工作站建议直接用 `--provider=libvirt`',
        'box 下载在国内很慢，配置镜像源或使用本地 box 文件能显著改善体验',
        '`vagrant reload` 会重启虚机，**未保存的工作会丢失**；只想应用新配置用 `vagrant provision`',
        '共享目录（`synced_folder`）在 VirtualBox 与 libvirt 下的实现不同（vboxsf vs NFS/9p），性能与权限表现有差异',
        'Vagrantfile 应纳入 Git 管理，这样团队环境才能一致；本地的个性化配置写进 `Vagrantfile.local` 之类的非入库文件',
        '快照功能依赖 provider 支持，不同 provider 的快照行为与限制不完全一致，跨 provider 不能通用'
      ],
      related: ['vm-misc-packer', 'vm-virsh-list', 'vm-img-create', 'dk-run'],
      docs: 'https://developer.hashicorp.com/vagrant/docs/cli/up',
      tags: ['开发环境', 'Vagrantfile', '虚拟化', '快照']
    },

    /* ---------- 25 / 25 ---------- */
    {
      id: 'vm-misc-govc',
      name: 'govc',
      alias: ['govc ls', 'govc vm.info', 'govc vm.power', 'VMware 命令行'],
      level: 3,
      syntax: 'export GOVC_URL=<vCenter地址> GOVC_USERNAME=<用户> GOVC_PASSWORD=<密码> GOVC_INSECURE=1; govc ls | govc vm.info <虚机> | govc vm.power -on|-off|-reset <虚机>',
      summary: 'VMware vSphere 的命令行客户端，批量查询与控制 ESXi 上的虚拟机。',
      desc: '`govc` 是 govmomi 项目提供的 vSphere CLI，把 vCenter 的 API 包装成 Unix 风格的命令，让 VMware 环境也能像 KVM 一样脚本化。它通过环境变量认证：`GOVC_URL`（vCenter 地址，如 `https://vcenter.example.com/sdk`）、`GOVC_USERNAME`、`GOVC_PASSWORD`，自签证书环境需要 `GOVC_INSECURE=1`。\n\n**最常用的三类命令**：\n- **查询**：`govc ls`（像 `ls` 一样浏览清单，`/数据中心/vm/` 下就是虚机）、`govc vm.info <虚机>`（相当于 `virsh dominfo`）、`govc find . -type m`（批量找虚机）、`govc ls -l`（带详细信息）；\n- **电源控制**：`govc vm.power -on`、`-off`（**硬关机，等于拔电源**）、`-s`（优雅关机，相当于 `virsh shutdown`）、`-reset`（重启，等于按复位键）、`-suspend`；\n- **批量操作**：结合 `govc find` 与 shell 循环，对成百上千台虚机做统一操作（打标签、查快照、导出信息），这是它相对图形界面最大的价值。\n\n**典型运维场景**：导出全部虚机的清单与配置做资产盘点；批量检查哪些虚机快照过期未清理；迁移前批量关机；用脚本给虚机批量打标签/备注。\n\n**安全提醒**：`GOVC_PASSWORD` 会出现在环境变量与 shell 历史里，生产环境应使用受限的服务账号并通过安全的凭据注入方式提供，不要把密码写进脚本。',
      params: [
        { flag: 'GOVC_URL', desc: 'vCenter 或 ESXi 地址，如 `https://vcenter.example.com/sdk`' },
        { flag: 'GOVC_USERNAME / GOVC_PASSWORD', desc: '认证凭据，建议使用权限受限的服务账号' },
        { flag: 'GOVC_INSECURE=1', desc: '跳过证书校验（自签证书环境），生产建议导入受信任证书' },
        { flag: 'GOVC_DATACENTER / GOVC_CLUSTER', desc: '指定默认数据中心与集群，简化命令路径' },
        { flag: 'govc ls [-l] [路径]', desc: '浏览清单，`/DC/vm` 下是虚机，`-l` 显示详细信息' },
        { flag: 'govc vm.info <虚机>', desc: '查看虚机详情：配置、IP、电源状态、主机' },
        { flag: 'govc vm.power -on|-off|-s|-reset', desc: '电源控制：开机 / 硬关机 / 优雅关机 / 重启' },
        { flag: 'govc find . -type m', desc: '批量查找虚机，用于脚本遍历' }
      ],
      examples: [
        { cmd: 'export GOVC_URL=https://vcenter.example.com/sdk GOVC_USERNAME=ops-readonly GOVC_PASSWORD=<服务账号密码> GOVC_INSECURE=1', desc: '配置连接信息（生产环境请用受限服务账号）' },
        { cmd: 'govc ls /DC/vm', desc: '列出数据中心下的所有虚机' },
        { cmd: 'govc vm.info web-prod-01', desc: '查看指定虚机的详细配置与电源状态' },
        { cmd: 'govc vm.power -s web-prod-01', desc: '优雅关机（等价于 virsh shutdown，不是硬下电）' },
        { cmd: 'govc find . -type m -name "web-*" | while read vm; do govc vm.info "$vm" | head -3; done', desc: '批量查询所有 web- 开头的虚机信息，做资产盘点' },
        { cmd: 'govc ls -l /DC/vm | head -20', desc: '带详细信息列出虚机清单' }
      ],
      notes: [
        '**`govc vm.power -off` 是硬关机，等于拔电源**：生产虚机请用 `-s` 优雅关机，`-off` 只用于彻底无响应的场景',
        '**凭据不要写进脚本或 Git**：`GOVC_PASSWORD` 会出现在环境变量、进程列表与 shell 历史中，应使用受限服务账号并从凭据管理系统注入',
        '`GOVC_INSECURE=1` 会跳过证书校验，**存在中间人风险**，仅建议在测试环境或已导入受信任证书前临时使用',
        '路径要精确：vSphere 清单是树形结构（数据中心 → 集群 → 主机/虚机），`govc ls` 不带路径时默认从当前数据中心开始',
        '**批量电源操作风险极高**：脚本里务必先 `govc find` 打印目标清单人工确认，再执行实际动作，避免误关生产虚机',
        '权限按角色授予：只读盘点用只读角色，需要电源操作时单独授权，避免一个账号拥有全量管理权限',
        'govc 版本要与 vCenter 版本大致匹配，过旧版本可能不支持新 API，报错往往很晦涩',
        '它是 VMware 专用工具，KVM/华为云场景请分别使用 `virsh` 与 `hcloud`'
      ],
      related: ['vm-virsh-dominfo', 'vm-virsh-start', 'vm-virsh-destroy', 'sec-huawei-iam'],
      docs: 'https://github.com/vmware/govmomi',
      tags: ['VMware', 'vSphere', '命令行', '批量运维']
    }
  );
})();
