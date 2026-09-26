/* data/linux-net.js · 分类 04 网络与排障 */
(function () {
  'use strict';

  var catId = 'linux-net';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ---------- 1 / 56 · 网卡与地址 ---------- */
    /* ---------- 1 / 56 ---------- */
    {
      id: 'ln-ip-addr',
      name: 'ip addr',
      alias: ['ip a', 'ip address', 'ip addr add', 'ip addr del'],
      level: 1,
      syntax: 'ip addr [show] [dev <网卡名>] | ip addr add <IP/掩码> dev <网卡名> | ip addr del <IP/掩码> dev <网卡名>',
      summary: '查看网卡 IP 与掩码，也能临时增删地址；排障第一条命令。',
      desc: '`ip addr` 属于 `iproute2` 套件，正在全面取代 `ifconfig`。不加子命令时默认等价于 `ip addr show`，输出里要重点看三样：网卡是否 `UP`、`inet` 行上的 IPv4 地址与掩码、`state UP/DOWN`。CentOS 7 及以上、Ubuntu 16.04 及以上都自带，CentOS 6 需要 `yum install iproute`。',
      params: [
        { flag: 'show / 无子命令', desc: '列出所有网卡的地址信息，最常用' },
        { flag: 'dev <网卡名>', desc: '只看指定网卡，如 dev eth0' },
        { flag: 'add <IP/掩码>', desc: '临时添加一个 IP，重启网络即失效' },
        { flag: 'del <IP/掩码>', desc: '删除指定 IP，写错网段会直接断掉远程连接' },
        { flag: 'scope global', desc: '只显示全局地址，过滤掉 IPv6 链路本地地址' },
        { flag: '-4 / -6', desc: '只显示 IPv4 或只显示 IPv6 地址' }
      ],
      examples: [
        { cmd: 'ip addr show', desc: '看本机所有网卡的 IP，确认弹性公网 IP 是否已绑定到网卡上' },
        { cmd: 'ip -4 addr show dev eth0', desc: '只看 eth0 的 IPv4 地址，输出最短，日常排障首选' },
        { cmd: 'ip addr add 192.168.1.200/24 dev eth0', desc: '给 eth0 临时加一个内网地址做测试，重启后失效' }
      ],
      notes: [
        '`ip addr add` 只是运行时生效，重启或 `systemctl restart network` 后全部丢失；要持久化必须写进 `/etc/sysconfig/network-scripts/ifcfg-eth0`（CentOS）或 `/etc/netplan/*.yaml`（Ubuntu）',
        '在远程 SSH 会话里执行 `ip addr del` 删掉当前连接所用的地址，会立刻把自己踢下线，务必先确认地址没写错',
        '华为云 ECS 上看到的私网地址是 VPC 内网 IP，弹性公网 IP 通过 NAT 映射，不会直接出现在网卡上'
      ],
      related: ['ln-ip-link', 'ln-ifconfig', 'ln-nmcli', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man8/ip-address.8.html',
      tags: ['网卡', 'IP地址', '网络接口']
    },

    /* ---------- 2 / 56 ---------- */
    {
      id: 'ln-ip-link',
      name: 'ip link',
      alias: ['ip link set', 'ip l'],
      level: 2,
      syntax: 'ip link [show] | ip link set <网卡名> up | ip link set <网卡名> down | ip link set <网卡名> mtu <值>',
      summary: '管理网卡二层状态，控制启停、改 MTU、看 MAC 与丢包计数。',
      desc: '`ip link` 管的是数据链路层，`ip addr` 管的是网络层地址，这是两者的本质区别。排查"网卡是不是没起来"看 `ip link`，排查"IP 配错没有"看 `ip addr`。加 `-s` 可以顺带打印收发包与错误计数，相当于轻量版 `ifconfig` 输出。',
      params: [
        { flag: 'show', desc: '列出所有网卡及其 UP/DOWN 状态' },
        { flag: 'set <网卡名> up', desc: '启用网卡，相当于 ifconfig eth0 up' },
        { flag: 'set <网卡名> down', desc: '禁用网卡，远程执行会直接断网' },
        { flag: 'set <网卡名> mtu 1400', desc: '改 MTU，用于排查大包不通、VPN 分片问题' },
        { flag: '-s', desc: '附带收发包、错误、丢包统计，等价于 ip -s link' },
        { flag: 'show <网卡名>', desc: '只看指定网卡，输出含 MAC 地址与 state 字段' }
      ],
      examples: [
        { cmd: 'ip link show', desc: '确认网卡是 UP 还是 DOWN，第二行能看到 MAC 与 state' },
        { cmd: 'ip -s link show eth0', desc: '看 eth0 的 RX/TX 错误与 dropped 计数，判断是否物理层丢包' },
        { cmd: 'ip link set eth0 mtu 1400', desc: '临时把 MTU 调小，验证是否为 MTU 导致的大包不通' }
      ],
      notes: [
        '`ip link set eth0 down` 在远程会话里执行等于自断网络，云主机需要去控制台走 VNC 登录才能救回',
        '`ip link set mtu` 也是临时生效，持久化要改网卡配置文件里的 `MTU=` 项',
        'RX errors / dropped 持续增长往往不是系统问题，先看云平台监控里的网卡指标和宿主机侧限速'
      ],
      related: ['ln-ip-addr', 'ln-ethtool', 'ln-ip-stats', 'ln-troubleshoot-slow'],
      docs: 'https://man7.org/linux/man-pages/man8/ip-link.8.html',
      tags: ['网卡', 'MTU', '网卡启停']
    },

    /* ---------- 3 / 56 ---------- */
    {
      id: 'ln-ip-route',
      name: 'ip route',
      alias: ['ip r', 'ip route add', 'ip route del', 'ip route get', '默认网关'],
      level: 2,
      syntax: 'ip route [show] | ip route add <网段/掩码> via <网关> dev <网卡名> | ip route del <网段/掩码> | ip route get <目标IP>',
      summary: '查看和增删路由表，确认默认网关与去往某个 IP 的实际出口。',
      desc: '路由表决定数据包从哪块网卡出去。`ip route get` 是排障利器：直接告诉你内核针对某个目标地址会选哪条路由、走哪块网卡、源地址是什么，比人肉比对整张路由表快得多。华为云 ECS 的内网互通依赖 VPC 路由表，多网卡或自建 VPN 场景经常需要手工加静态路由。',
      params: [
        { flag: 'show / 无子命令', desc: '打印路由表，default 行就是默认网关' },
        { flag: 'add <网段> via <网关>', desc: '添加静态路由，重启后失效' },
        { flag: 'del <网段>', desc: '删除指定路由条目' },
        { flag: 'get <目标IP>', desc: '查询去往该 IP 实际走哪条路由、哪块网卡、哪个源地址' },
        { flag: 'dev <网卡名>', desc: '把路由绑定到指定网卡，多网卡环境必带' },
        { flag: 'metric <值>', desc: '路由优先级，数值越小越优先' }
      ],
      examples: [
        { cmd: 'ip route show', desc: '看默认网关和所有静态路由，default via 那一行最关键' },
        { cmd: 'ip route get 8.8.8.8', desc: '确认访问外网走哪块网卡、源地址是不是弹性公网 IP 对应的私网地址' },
        { cmd: 'ip route add 10.0.0.0/24 via 192.168.1.1 dev eth0', desc: '临时加一条去 10.0.0.0/24 的静态路由' }
      ],
      notes: [
        '路由是临时生效的，重启即丢；CentOS 持久化写 `/etc/sysconfig/network-scripts/route-eth0`，Ubuntu 写 Netplan 的 `routes:` 段',
        '云主机加错默认网关会直接失去外网访问，远程操作前先想清楚回程路由',
        'VPC 内两台 ECS 不通时，先 `ip route` 确认路由存在，再去看安全组，顺序反了会白查半天'
      ],
      related: ['ln-route', 'ln-ip-neigh', 'ln-ping', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man8/ip-route.8.html',
      tags: ['路由', '网关', '静态路由']
    },

    /* ---------- 4 / 56 ---------- */
    {
      id: 'ln-ip-neigh',
      name: 'ip neigh',
      alias: ['ip n', 'arp 表', '邻居表'],
      level: 3,
      syntax: 'ip neigh [show] [dev <网卡名>] | ip neigh flush dev <网卡名>',
      summary: '查看和清理 ARP 邻居表，同网段不通时用它确认二层是否解析成功。',
      desc: '同网段通信必须先通过 ARP 把 IP 解析成 MAC，`ip neigh` 显示的就是这张缓存表。状态 `REACHABLE` 表示正常，`STALE` 表示缓存过期但还能用，`FAILED` 或 `INCOMPLETE` 表示 ARP 请求没人应答——这基本说明对端不在线、被安全组挡了二层，或者 IP 冲突。老命令 `arp -n` 显示同样内容。',
      params: [
        { flag: 'show / 无子命令', desc: '列出所有邻居表项及状态' },
        { flag: 'dev <网卡名>', desc: '只看指定网卡的邻居表' },
        { flag: 'flush dev <网卡名>', desc: '清空该网卡的 ARP 缓存，用于排除缓存错乱' },
        { flag: 'to <IP>', desc: '只看某个 IP 的邻居表项' },
        { flag: '-s', desc: '显示邻居表统计信息' }
      ],
      examples: [
        { cmd: 'ip neigh show', desc: '看同网段对端的 MAC 是否已解析，FAILED 说明对方不回 ARP' },
        { cmd: 'ip neigh show dev eth0', desc: '只看 eth0 的邻居表，聚焦当前业务网卡' },
        { cmd: 'ip neigh flush dev eth0', desc: '清空 eth0 的 ARP 缓存，处理 MAC 变更后的错乱' }
      ],
      notes: [
        '邻居表项状态为 FAILED 时，`ping` 一般报 "Destination Host Unreachable"，这与"请求超时"是两回事，排查方向也不同',
        '清空 ARP 缓存会造成短暂丢包，生产环境避开业务高峰执行',
        '同 VPC 内网不通先看 ARP 能不能解析，能解析说明二层通，问题在更高层的安全组或应用'
      ],
      related: ['ln-arping', 'ln-ip-route', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man8/ip-neighbour.8.html',
      tags: ['ARP', '二层', '邻居表']
    },

    /* ---------- 5 / 56 ---------- */
    {
      id: 'ln-ifconfig',
      name: 'ifconfig',
      alias: ['ifconfig -a', 'net-tools'],
      level: 1,
      syntax: 'ifconfig [网卡名] | ifconfig -a | ifconfig <网卡名> up|down',
      summary: '老式网卡查看命令，输出直观但已被官方废弃，新系统默认不装。',
      desc: '`ifconfig` 属于 `net-tools` 包，从 CentOS 7 起默认不再安装，Ubuntu 18.04 起也不再预装，官方推荐改用 `ip addr`。但大量老教程、老脚本和 CentOS 6 环境仍在用它，所以必须认识。它的输出把 IP、掩码、MAC、收发包统计揉在一屏，读起来比 `ip addr` 直白，这是它至今仍被顺手使用的原因。',
      params: [
        { flag: '无参数', desc: '只显示已启用的网卡' },
        { flag: '-a', desc: '显示全部网卡，包含 DOWN 状态的' },
        { flag: '<网卡名>', desc: '只看指定网卡，如 ifconfig eth0' },
        { flag: 'up / down', desc: '启用或禁用网卡，等价于 ip link set up/down' },
        { flag: 'mtu <值>', desc: '设置 MTU' }
      ],
      examples: [
        { cmd: 'ifconfig -a', desc: 'CentOS 6 老机器上查看所有网卡状态' },
        { cmd: 'ifconfig eth0', desc: '只看 eth0 的 IP、掩码、MAC 与流量计数' }
      ],
      notes: [
        '已废弃：CentOS 7+ / Ubuntu 18.04+ 需要 `yum install net-tools` 或 `apt install net-tools` 才能用，新脚本一律写 `ip addr`',
        '`ifconfig` 显示的 `inet addr` 与 `Mask` 是分开的两列，看掩码不如 `ip addr` 的 `192.168.1.10/24` 写法直观',
        '改地址用 `ifconfig` 同样只是临时生效，持久化仍要改配置文件'
      ],
      related: ['ln-ip-addr', 'ln-ip-link', 'ln-route'],
      docs: 'https://man7.org/linux/man-pages/man8/ifconfig.8.html',
      tags: ['网卡', '老命令', 'net-tools']
    },

    /* ---------- 6 / 56 ---------- */
    {
      id: 'ln-route',
      name: 'route',
      alias: ['route -n', 'netstat -rn', '老路由命令'],
      level: 2,
      syntax: 'route -n | route add -net <网段> netmask <掩码> gw <网关> | route del -net <网段>',
      summary: '老式路由表查看与配置命令，已被 ip route 取代但旧环境常见。',
      desc: '`route` 与 `ifconfig` 同属 `net-tools` 套件，同样处于废弃状态。`route -n` 不解析主机名，输出的是纯数字路由表，等价于 `netstat -rn`。新系统用 `ip route` 替代：`route add` 对应 `ip route add`，`route del` 对应 `ip route del`。看老项目的部署脚本时几乎一定会撞上它。',
      params: [
        { flag: '-n', desc: '不做 DNS 反解，直接输出数字，必须带，否则会很慢' },
        { flag: 'add -net <网段> netmask <掩码> gw <网关>', desc: '添加一条到指定网段的静态路由' },
        { flag: 'add default gw <网关>', desc: '设置默认网关' },
        { flag: 'del -net <网段>', desc: '删除指定网段的路由' },
        { flag: '-C', desc: '查看内核路由缓存' }
      ],
      examples: [
        { cmd: 'route -n', desc: '老系统上快速看默认网关，Flags 列 U=启用、G=走网关' },
        { cmd: 'route add -net 10.0.0.0 netmask 255.255.255.0 gw 192.168.1.1', desc: '老写法加静态路由，等价于 ip route add 10.0.0.0/24 via 192.168.1.1' }
      ],
      notes: [
        '已废弃，新系统优先用 `ip route`；`route` 不带 `-n` 时会尝试反解每个地址，在大路由表上会卡住',
        '同样只临时生效，重启后丢失',
        'CentOS 6 用 `route`，CentOS 7+ 和 Ubuntu 16.04+ 用 `ip route`，写文档时要按目标系统区分'
      ],
      related: ['ln-ip-route', 'ln-ifconfig', 'ln-netstat'],
      docs: 'https://man7.org/linux/man-pages/man8/route.8.html',
      tags: ['路由', '老命令', 'net-tools']
    },

    /* ---------- 7 / 56 ---------- */
    {
      id: 'ln-nmcli',
      name: 'nmcli',
      alias: ['nmcli device', 'nmcli connection', 'NetworkManager'],
      level: 2,
      syntax: 'nmcli device status | nmcli connection show | nmcli connection up <连接名> | nmcli connection down <连接名>',
      summary: 'NetworkManager 命令行工具，CentOS 8 及以上管理网卡与连接的主力。',
      desc: 'CentOS 8 / RHEL 8 起，传统 `network.service` 被彻底移除，网络只能由 NetworkManager 管理，`nmcli` 就是它的命令行入口。关键概念区分：**device** 是物理/虚拟网卡，**connection** 是套在网卡上的配置（一个网卡可以有多个连接配置）。改 IP 一般用 `nmcli connection modify` 改配置，再 `nmcli connection up` 生效，只重启连接不断 SSH 之外的其他网卡。',
      params: [
        { flag: 'device status', desc: '列出所有网卡及其状态、当前使用的连接名' },
        { flag: 'connection show', desc: '列出所有连接配置（相当于网卡配置文件列表）' },
        { flag: 'connection up <连接名>', desc: '启用连接，等价于拉起一块网卡的配置' },
        { flag: 'connection down <连接名>', desc: '停用连接，会断开该网卡上的所有流量' },
        { flag: 'connection modify <连接名> ipv4.addresses <IP/掩码>', desc: '改静态 IP 地址' },
        { flag: 'connection modify <连接名> ipv4.gateway <网关>', desc: '改默认网关' },
        { flag: 'connection modify <连接名> ipv4.method manual', desc: '改为静态 IP 模式，DHCP 则是 auto' },
        { flag: 'connection modify <连接名> ipv4.dns <DNS地址>', desc: '改该连接的 DNS 服务器' }
      ],
      examples: [
        { cmd: 'nmcli device status', desc: '看每块网卡是 connected 还是 disconnected，以及用的哪个连接' },
        { cmd: 'nmcli connection show', desc: '列出所有连接名，后续 modify / up 都要用这个名字' },
        { cmd: 'nmcli connection modify eth0 ipv4.addresses 192.168.1.50/24 ipv4.gateway 192.168.1.1 ipv4.method manual && nmcli connection up eth0', desc: '把 eth0 改成静态 IP 并立即生效，CentOS 8 上的标准改法' }
      ],
      notes: [
        '`nmcli connection modify` 只改配置文件不生效，必须再执行 `nmcli connection up <连接名>`；只 up 不 modify 则是白改',
        '连接名不一定等于网卡名，CentOS 8 默认连接名常写作 `System eth0` 或 `Wired connection 1`，先用 `nmcli connection show` 确认',
        'CentOS 8+ 上再用 `systemctl restart network` 会直接报服务不存在，别再照抄老教程',
        '远程改 IP 时用 `nmcli connection up` 而不是 `down` 再 `up`，后者中间会有一段断网窗口'
      ],
      related: ['ln-ip-addr', 'ln-ip-route', 'ln-resolv-conf', 'ln-troubleshoot-port'],
      docs: 'https://networkmanager.dev/docs/api/latest/nmcli.html',
      tags: ['NetworkManager', '网卡配置', 'CentOS 8']
    },

    /* ---------- 8 / 56 ---------- */
    {
      id: 'ln-ethtool',
      name: 'ethtool',
      alias: ['ethtool -S', 'ethtool -i', '网卡速率'],
      level: 3,
      syntax: 'ethtool <网卡名> | ethtool -S <网卡名> | ethtool -i <网卡名>',
      summary: '查看网卡速率、双工与驱动信息，判断是否协商降速的半层工具。',
      desc: '`ethtool` 直接读网卡驱动上报的物理层信息，是判断"网速慢是不是网卡协商成半双工/百兆"的唯一手段。云主机的虚拟网卡（virtio）显示的是虚拟值，速率常写成 10000Mb/s 且不支持协商，属正常现象；物理机才需要重点看 `Speed` 与 `Duplex`。加 `-S` 可拿到驱动级计数器，比 `ip -s link` 更细。',
      params: [
        { flag: '-i <网卡名>', desc: '看驱动名、固件版本、总线位置，虚拟化环境能看出 virtio' },
        { flag: '-S <网卡名>', desc: '打印网卡驱动的详细统计计数器，含各类丢包与错误' },
        { flag: '-s <网卡名> speed 1000 duplex full autoneg on', desc: '手工设置速率与双工，物理机排障用' },
        { flag: '-k <网卡名>', desc: '查看各项 offload 卸载特性（tso/gso/gro 等）' },
        { flag: '-g <网卡名>', desc: '查看收发队列 ring buffer 大小' },
        { flag: '-p <网卡名>', desc: '让网卡指示灯闪烁，机房定位物理口用' }
      ],
      examples: [
        { cmd: 'ethtool eth0', desc: '看协商速率和双工模式，物理机上 Speed 显示 100Mb/s 说明协商降级了' },
        { cmd: 'ethtool -S eth0', desc: '看驱动级丢包计数，rx_dropped 持续增长说明有拥塞或限速' },
        { cmd: 'ethtool -i eth0', desc: '确认是 virtio 虚拟网卡还是物理网卡，云主机上一般显示 virtio_net' }
      ],
      notes: [
        '`ethtool -s` 禁掉 autoneg 强制速率，线缆或对端不匹配时会造成链路直接 DOWN，远程操作风险极高',
        '云主机上 `Speed: Unknown!` 或 `10000Mb/s` 是虚拟网卡的正常输出，不代表故障',
        '华为云 ECS 的实际带宽由规格和弹性公网 IP 带宽上限决定，`ethtool` 看到的是虚机侧能力，不是真实限速值'
      ],
      related: ['ln-ip-link', 'ln-ip-stats', 'ln-troubleshoot-slow'],
      docs: 'https://man7.org/linux/man-pages/man8/ethtool.8.html',
      tags: ['网卡速率', '双工', '驱动']
    },

    /* ---------- 9 / 56 · 端口与连接 ---------- */
    /* ---------- 9 / 56 ---------- */
    {
      id: 'ln-ss',
      name: 'ss',
      alias: ['ss -tulnp', 'ss -tan', 'socket statistics', 'netstat 替代'],
      level: 2,
      syntax: 'ss [选项] [过滤表达式]',
      summary: '直接读内核套接字，秒看端口监听与连接状态，netstat 的现代替代。',
      desc: '`ss` 通过 netlink 直接向内核取套接字信息，不发愁 `netstat` 那种遍历 `/proc` 的性能问题，在几万条连接的高并发服务器上 `netstat` 会卡住而 `ss` 依然秒回。排障三板斧是 `-tulnp` 看监听、`-tan` 看全量连接、`-s` 看汇总。相比 `netstat`，它多了按状态和端口过滤的能力，比如 `state established` 和 `dport = :80`。',
      params: [
        { flag: '-t / -u', desc: '只看 TCP / 只看 UDP，两个一起写就是 -tu' },
        { flag: '-l', desc: '只看处于 LISTEN 状态的监听端口' },
        { flag: '-a', desc: '显示所有套接字（监听 + 已建立 + 等待关闭）' },
        { flag: '-n', desc: '不做域名与服务名解析，直接显示数字端口，必须带，否则卡在 DNS 上' },
        { flag: '-p', desc: '显示占用端口的进程名与 PID，需要 root 权限才能看全' },
        { flag: '-s', desc: '打印套接字汇总统计，快速判断连接数是否打满' },
        { flag: 'state established', desc: '按连接状态过滤，常见取值还有 time-wait、close-wait、syn-recv' },
        { flag: 'dport = :80 / sport = :3306', desc: '按目标端口 / 源端口过滤，写法是空格不能省' }
      ],
      examples: [
        { cmd: 'ss -tulnp', desc: '看本机监听了哪些 TCP/UDP 端口及对应进程，判断服务到底起没起' },
        { cmd: 'ss -tan state established | head -20', desc: '看当前已建立的 TCP 连接，排查连接堆积或异常来源 IP' },
        { cmd: 'ss -tan state time-wait | wc -l', desc: '统计 TIME_WAIT 数量，短连接服务上这个数暴涨就要调内核参数' },
        { cmd: 'ss -tan \'dport = :80\'', desc: '只看目标端口是 80 的连接，确认请求有没有真的到达本机' },
        { cmd: 'ss -s', desc: '一行看总连接数、TCP 各状态分布，判断是不是连接数打满' }
      ],
      notes: [
        '过滤表达式必须用引号包起来，写成 `ss -tan dport = :80` 会被 shell 拆成多个参数直接报错',
        '`state` 与 `dport` 组合时要把整个表达式放进同一个引号里，如 `ss -tan state established \'( dport = :80 or dport = :443 )\'`',
        '不加 `-n` 时 `ss` 会去反解服务名和域名，连接多的时候慢到没法用，排障一律 `-ss -tulnp` 起步',
        '`-p` 看不到进程多半是没加 `sudo`，普通用户只能看到自己的进程',
        '云主机上 `ss -tulnp` 有监听、外面仍连不上，问题几乎一定在安全组，而不是本机服务'
      ],
      related: ['ln-netstat', 'ln-lsof', 'ln-ss-kill', 'ln-troubleshoot-port', 'ln-troubleshoot-connect-refused'],
      docs: 'https://man7.org/linux/man-pages/man8/ss.8.html',
      tags: ['端口', '连接状态', '监听', '排障']
    },

    /* ---------- 10 / 56 ---------- */
    {
      id: 'ln-netstat',
      name: 'netstat',
      alias: ['netstat -antp', 'netstat -tulnp', 'net-tools'],
      level: 2,
      syntax: 'netstat -tulnp | netstat -antp | netstat -rn | netstat -s',
      summary: '老牌网络状态查看工具，功能与 ss 对应但性能差，新系统多已不装。',
      desc: '`netstat` 属于 `net-tools`，通过遍历 `/proc/net` 收集信息，连接数一多就会明显卡顿甚至几十秒无响应。CentOS 7+ 与 Ubuntu 18.04+ 默认都不再安装。它与 `ss` 基本一一对应：`netstat -tulnp` 对应 `ss -tulnp`，`netstat -antp` 对应 `ss -tanp`，`netstat -rn` 对应 `ip route`，`netstat -s` 对应 `ss -s` 或 `nstat`。',
      params: [
        { flag: '-t / -u', desc: '只看 TCP / UDP' },
        { flag: '-l', desc: '只看监听状态的端口' },
        { flag: '-a', desc: '显示所有连接与监听' },
        { flag: '-n', desc: '数字显示，不做反解，必带' },
        { flag: '-p', desc: '显示对应进程 PID 与程序名' },
        { flag: '-r', desc: '显示路由表，等价于 route -n 或 ip route' },
        { flag: '-s', desc: '显示各协议统计信息，含重传、错误计数' },
        { flag: '-i', desc: '显示网卡接口流量统计，接近 ip -s link' }
      ],
      examples: [
        { cmd: 'netstat -tulnp', desc: '老系统上查看监听端口，用法与 ss -tulnp 完全对应' },
        { cmd: 'netstat -antp | grep 3306', desc: '看谁在连本机 MySQL，老环境排查数据库连接来源' },
        { cmd: 'netstat -rn', desc: '查看路由表，等价于 ip route 或 route -n' }
      ],
      notes: [
        '已属 net-tools 废弃套件，高并发机器上执行可能卡住几十秒，线上优先用 `ss`',
        '新系统需要 `yum install net-tools` 或 `apt install net-tools` 才有，写新脚本不要再用它',
        '`netstat -p` 同样需要 root 才能看到别人的进程',
        '`netstat` 统计的 TIME_WAIT、CLOSE_WAIT 与 `ss` 一致，但刷新有延迟，实时排障以 `ss` 为准'
      ],
      related: ['ln-ss', 'ln-lsof', 'ln-route', 'ln-ip-stats'],
      docs: 'https://man7.org/linux/man-pages/man8/netstat.8.html',
      tags: ['端口', '老命令', 'net-tools']
    },

    /* ---------- 11 / 56 ---------- */
    {
      id: 'ln-lsof',
      name: 'lsof -i',
      alias: ['lsof -i:80', 'lsof +L1', 'lsof -p', 'list open files'],
      level: 3,
      syntax: 'lsof -i [:<端口>] [-P] [-n] | lsof -p <PID> | lsof +L1 | lsof <文件路径>',
      summary: '列出进程打开的文件与网络连接，专治端口占用和磁盘空间不释放。',
      desc: 'Linux 一切皆文件，套接字也是文件，所以 `lsof` 既能查端口被谁占用，也能查文件被谁打开。运维上两个王牌用法：一是 `lsof -i:80` 定位端口冲突，二是 `lsof +L1` 找出**已删除但仍被进程持有**的文件——这是"`df` 显示磁盘满、`du` 却统计不出来"的经典元凶，通常是日志被 `rm` 掉但进程还在往里写。',
      params: [
        { flag: '-i', desc: '列出所有网络连接（TCP/UDP 都包含）' },
        { flag: '-i:80', desc: '只看占用 80 端口的进程，端口冲突排查首选' },
        { flag: '-i @192.168.1.10', desc: '只看与该地址相关的连接' },
        { flag: '-P', desc: '不把端口号翻译成服务名，如显示 3306 而不是 mysql' },
        { flag: '-n', desc: '不把 IP 反解成域名，避免卡在 DNS 查询上' },
        { flag: '+L1', desc: '列出 link count 小于 1 的文件，即已删除但仍被占用的文件' },
        { flag: '-p <PID>', desc: '列出指定进程打开的所有文件与套接字' },
        { flag: '-u <用户名>', desc: '只列指定用户打开的文件' }
      ],
      examples: [
        { cmd: 'lsof -i:80', desc: '查 80 端口被哪个进程占用，启动 Nginx 报 address already in use 时用' },
        { cmd: 'lsof -i -P -n', desc: '列出全部网络连接且不做任何名字解析，输出最快最干净' },
        { cmd: 'lsof +L1', desc: '找出删除但未释放的文件，df 与 du 结果对不上时必查' },
        { cmd: 'lsof -p 12345', desc: '看指定进程打开了哪些文件与网络连接，排查句柄泄漏' }
      ],
      notes: [
        '`lsof` 全量扫描很慢，不加过滤直接跑会拖住机器，务必带上 `-i` 或 `-p` 限范围',
        '`lsof +L1` 找到的大文件要用 `: > /proc/<PID>/fd/<fd>` 或重启进程来真正释放空间，光删文件没用',
        '不加 `-n` 会做 DNS 反解，连接多时可能卡住几十秒，排障固定写 `lsof -i -P -n`',
        '部分最小化安装的系统没有 lsof，需要 `yum install lsof` 或 `apt install lsof`'
      ],
      related: ['ln-fuser', 'ln-ss', 'ln-netstat', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man8/lsof.8.html',
      tags: ['端口占用', '文件句柄', '磁盘满']
    },

    /* ---------- 12 / 56 ---------- */
    {
      id: 'ln-fuser',
      name: 'fuser -n tcp',
      alias: ['fuser', 'fuser -k'],
      level: 3,
      syntax: 'fuser -n tcp <端口> | fuser -v -n tcp <端口> | fuser -k -n tcp <端口>',
      summary: '按端口反查占用进程并可直接杀掉，比 lsof 更短平快。',
      desc: '`fuser` 通过 `/proc` 反查某个文件、目录或端口被哪些进程使用。相比 `lsof`，它的优势是能直接加 `-k` 把占用者杀掉，一句命令解决"端口被占、进程又找不到"的场景。加 `-v` 会输出更详细的 USER/PID/ACCESS 表格，便于人工确认再决定是否杀。',
      params: [
        { flag: '-n tcp <端口>', desc: '指定命名空间为 tcp，后接端口号，如 -n tcp 80' },
        { flag: '-n udp <端口>', desc: '查 UDP 端口占用' },
        { flag: '-v', desc: '输出详细表格，含用户、PID、访问类型，建议先加这个看' },
        { flag: '-k', desc: '杀掉所有占用该端口的进程，危险操作' },
        { flag: '-i', desc: '杀之前逐个询问确认，与 -k 同用可降低误杀风险' },
        { flag: '-m <挂载点>', desc: '查占用某个挂载点的进程，卸载失败时用' }
      ],
      examples: [
        { cmd: 'fuser -v -n tcp 80', desc: '先看清楚是谁占了 80 端口，确认无误再动手' },
        { cmd: 'fuser -k -n tcp 8080', desc: '强制杀掉占用 8080 的进程，用于清掉卡死的残留服务' },
        { cmd: 'fuser -m /data', desc: '查谁在使用 /data 挂载点，umount 报 target is busy 时用' }
      ],
      notes: [
        '`fuser -k` 直接发 SIGKILL，不会等进程优雅退出，生产环境先用 `-v` 确认 PID 再决定',
        '推荐写法是 `fuser -k -i -n tcp 8080`，逐个询问，避免误杀关键进程',
        '`fuser` 只能看到本机进程，容器里的端口占用要在容器命名空间里查'
      ],
      related: ['ln-lsof', 'ln-ss', 'ln-ss-kill'],
      docs: 'https://man7.org/linux/man-pages/man1/fuser.1.html',
      tags: ['端口占用', '杀进程', '挂载占用']
    },

    /* ---------- 13 / 56 ---------- */
    {
      id: 'ln-nc',
      name: 'nc',
      alias: ['netcat', 'ncat', 'nc -zv', 'nc -l', 'nc --ssl'],
      level: 2,
      syntax: 'nc -zv <主机> <端口> | nc -l <端口> | nc -u <主机> <端口> | ncat --ssl <主机> <端口>',
      summary: '网络瑞士军刀，既能探测端口通不通，也能临时监听和传数据。',
      desc: '`nc`（netcat）在排障中最常用的就是 `-zv` 探端口：它只做 TCP 三次握手，成功即打印 succeeded，失败立刻返回，比 `telnet` 干净得多。`-l` 可以起一个临时监听端口，用来验证"我这边发起、对方能否连上"，是判断安全组方向的绝招。Nmap 项目提供的 **`ncat`** 是增强版，`-zv` 用法与 `nc` 完全一致，并额外支持 `--ssl`（直接建立 TLS 连接，比手工挂 `openssl s_client` 更贴近 HTTPS 真实场景）、`--allow/--deny`（来源地址访问控制）、`--proxy`（走 HTTP/SOCKS 代理），随 `nmap` 包一起安装。',
      params: [
        { flag: '-z', desc: '零 I/O 模式，只探测连通性不发数据，必须与 -v 同用才看得到结果' },
        { flag: '-v', desc: '输出详细过程，显示 succeeded 或 refused' },
        { flag: '-l <端口>', desc: '监听模式，起一个临时服务端' },
        { flag: '-u', desc: '使用 UDP 协议，探测 DNS 53 等 UDP 服务必需' },
        { flag: '-w <秒数>', desc: '连接超时时间，不加可能长时间挂住' },
        { flag: '-k', desc: '配合 -l 使用，保持监听接受多个连接' },
        { flag: 'ncat --ssl <主机> <端口>', desc: 'ncat 专有：以 TLS 方式连接，测 HTTPS 端口比 nc 更贴近真实场景' }
      ],
      examples: [
        { cmd: 'nc -zv 192.168.1.10 3306', desc: '探测同 VPC 内 MySQL 端口是否可达，成功打印 succeeded' },
        { cmd: 'nc -zv -w 3 8.8.8.8 53', desc: '带 3 秒超时探测，避免被防火墙丢包时一直卡住' },
        { cmd: 'nc -zvu 192.168.1.10 53', desc: '用 UDP 探测 53 端口，验证 DNS 服务是否开放' },
        { cmd: 'nc -l 9000', desc: '在本机临时监听 9000，让对端 nc 过来验证反向连通性' },
        { cmd: 'ncat --ssl example.com 443', desc: 'ncat 增强用法：直接以 TLS 连上 443，验证 HTTPS 端口握手是否正常' }
      ],
      notes: [
        '部分发行版默认装的是 OpenBSD 版 nc，不支持 `-c` 反弹 shell 等参数，语法与 GNU 版有差异',
        '探测被安全组 DROP 时 `nc -zv` 会一直挂着，**一定要加 `-w`**，否则脚本会卡死',
        '`Connection refused` 说明对端有响应但没服务监听，`timed out` 说明包被丢弃，两者含义完全不同',
        '`nc -l` 起的临时监听没有任何认证，验证完记得 Ctrl+C 关掉，不要长期留在生产机',
        '`ncat` 随 `nmap` 包安装，机器上可能只有 `nc` 没有 `ncat`，用前先 `which ncat`；`--keep-open` 在老版本里要写成 `-k`'
      ],
      related: ['ln-telnet', 'ln-openssl-sclient', 'ln-tcpdump', 'ln-troubleshoot-port', 'ln-troubleshoot-connect-refused'],
      docs: 'https://man.openbsd.org/nc.1',
      tags: ['端口探测', 'netcat', '连通性']
    },

    /* ---------- 14 / 56 ---------- */
    {
      id: 'ln-telnet',
      name: 'telnet',
      alias: ['telnet 端口测试'],
      level: 2,
      syntax: 'telnet <主机> <端口>',
      summary: '明文远程登录协议，如今主要当端口连通性探测器在用。',
      desc: '`telnet` 作为登录协议早已被 SSH 淘汰，因为全程明文传输，密码在网络上裸奔。但它做端口探测特别直观：连上后会显示 `Connected to ...`，失败则报 `Connection refused` 或一直挂起。在只有最小化安装、连 `nc` 都没装的老机器上，`telnet` 往往是唯一能用的探测工具。新环境还是优先 `nc -zv` 或 `curl -v telnet://`。',
      params: [
        { flag: '<主机> <端口>', desc: '直接连接指定主机的指定端口，最常用形式' },
        { flag: '-4 / -6', desc: '强制使用 IPv4 / IPv6' },
        { flag: '-l <用户名>', desc: '指定登录用户名，探测端口时不用' },
        { flag: 'Ctrl + ] 然后 quit', desc: '在已建立的连接里退出，Ctrl+C 不一定有效' }
      ],
      examples: [
        { cmd: 'telnet 192.168.1.10 3306', desc: '测试内网 MySQL 端口，出现 Connected 即表示链路与端口都通' },
        { cmd: 'telnet smtp.example.com 25', desc: '测试邮件服务端口，成功会看到服务端的欢迎 banner' }
      ],
      notes: [
        '不推荐用于登录：`telnet` 全程明文，密码与数据可被抓包直接看到，远程登录一律用 `ssh`',
        '新版 Ubuntu 默认不装 telnet 客户端，需要 `apt install telnet`；CentOS 8 起仓库里也移除了 telnet-server',
        '探测卡住时不会自动超时，测试脚本里别用它，改用 `nc -zv -w 3`',
        '很多云厂商的安全组和 WAF 会直接拦截 telnet 特征，探测结果可能失真，最终仍以 `nc` 或 `tcpdump` 为准'
      ],
      related: ['ln-nc', 'ln-curl', 'ln-troubleshoot-port'],
      docs: 'https://man.openbsd.org/telnet.1',
      tags: ['端口探测', '明文', '老工具']
    },

    /* ---------- 15 / 56 ---------- */
    {
      id: 'ln-ss-kill',
      name: 'ss -K',
      alias: ['ss --kill', '强制关闭连接'],
      level: 4,
      syntax: 'ss -K [state <状态>] [dport = :<端口>] | ss -K dst <目标IP>',
      summary: '用内核接口强制关闭匹配的 TCP 连接，无需重启服务即可断连。',
      desc: '`ss -K` 通过 `SOCK_DESTROY` 直接把匹配到的套接字销毁，效果等同对端收到 RST 后连接立即消失。典型场景：某个来源 IP 疯狂刷接口、准备封禁它但不想重启服务；或者要清掉一批卡死的长连接让客户端重连。它比 `kill` 进程温和，比 `iptables -j DROP` 立竿见影——DROP 只能阻止新包，已建立的连接不会断。',
      params: [
        { flag: '-K, --kill', desc: '销毁匹配到的套接字，这是核心开关' },
        { flag: '-t -a', desc: '指定 TCP 与全部连接，一般与 -K 同写为 ss -Kta' },
        { flag: 'dport = :6379', desc: '按目标端口匹配，如关掉所有到 Redis 的连接' },
        { flag: 'sport = :80', desc: '按源端口匹配，即本机作为服务端的连接' },
        { flag: 'dst <目标IP>', desc: '按对端 IP 匹配，用于封禁某个异常来源' },
        { flag: 'state close-wait', desc: '只关掉处于特定状态的连接' }
      ],
      examples: [
        { cmd: 'ss -K dst 203.0.113.10', desc: '强制断开来自该 IP 的所有连接，配合安全组封禁立即生效' },
        { cmd: 'ss -Kta \'dport = :6379\'', desc: '清掉所有到 Redis 的连接，用于客户端连接池卡死时快速恢复' },
        { cmd: 'ss -Kta \'sport = :8080 state close-wait\'', desc: '清掉服务端上处于 CLOSE-WAIT 的僵死连接' }
      ],
      notes: [
        '需要 root 权限，普通用户执行会报 Operation not permitted',
        '连接被强制销毁后客户端会立即收到 RST，正在进行的业务请求会失败，务必避开业务高峰',
        '内核需要开启 `CONFIG_INET_DIAG_DESTROY`，部分老内核（3.10 之前）不支持，会报 Invalid argument',
        '只断连接不解决根因，异常来源该封就配合安全组或 `iptables` / `ipset` 一起做'
      ],
      related: ['ln-ss', 'ln-ipset', 'ln-iptables', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man8/ss.8.html',
      tags: ['强制断连', '内核套接字', '专家']
    },

    /* ---------- 16 / 56 · 连通性与路径 ---------- */
    /* ---------- 16 / 56 ---------- */
    {
      id: 'ln-ping',
      name: 'ping',
      alias: ['ping -c', 'ping -M do', 'ping -6', 'ping6'],
      level: 1,
      syntax: 'ping [选项] <目标主机|IP>',
      summary: '用 ICMP 探测对端可达性并测往返延迟，最基础的连通性检查。',
      desc: '`ping` 发 ICMP Echo Request 并等 Echo Reply，通与不通只是第一层信息：丢包率、延迟抖动、延迟是否随时间递增（说明链路拥塞或存在限速）都是重要线索。排障必备技巧是用 `-M do` 配合不同 `-s` 尺寸二分探测路径 MTU，这是"小包能通、大包卡死"类问题的标准解法。IPv6 用 `ping -6` 或独立的 `ping6`。',
      params: [
        { flag: '-c <次数>', desc: '发指定个数后停止，脚本里必须带，否则会一直 ping 下去' },
        { flag: '-i <秒>', desc: '发包间隔，默认 1 秒；小于 0.2 秒需要 root' },
        { flag: '-s <字节>', desc: '指定 ICMP 载荷大小，测 MTU 与分片时用' },
        { flag: '-M do', desc: '禁止分片（do = Don\'t Fragment），配合 -s 探测路径 MTU' },
        { flag: '-W <秒>', desc: '等待回复的超时时间，排障时调小可加快判断' },
        { flag: '-I <网卡|源IP>', desc: '指定出口网卡或源地址，多网卡与多 IP 环境必用' },
        { flag: '-6', desc: '强制使用 IPv6，等价于老系统上的独立命令 ping6' },
        { flag: '-f', desc: '洪水模式快速发包，需要 root，生产环境禁止使用' }
      ],
      examples: [
        { cmd: 'ping -c 4 8.8.8.8', desc: '测本机到公网的连通性与延迟，确认弹性公网 IP 是否真通' },
        { cmd: 'ping -c 4 -I eth0 192.168.1.10', desc: '指定从 eth0 出去 ping，多网卡机器上排除路由选错' },
        { cmd: 'ping -M do -s 1472 -c 3 192.168.1.10', desc: '探测 MTU：1472+28=1500 能通说明链路 MTU 正常，报 Frag needed 说明要调小' },
        { cmd: 'ping -6 -c 4 2400:3200::1', desc: '测 IPv6 连通性，等价于老系统上的 ping6，云主机双栈环境用它确认 v6 路由' },
        { cmd: 'ping6 -c 3 fe80::1%eth0', desc: 'ping IPv6 链路本地地址必须带 %网卡名，漏了会报 Invalid argument' }
      ],
      notes: [
        '很多云厂商与运营商默认禁 ICMP，`ping` 不通不代表服务不可用，必须结合 `nc -zv` 或 `curl` 判断',
        '测 MTU 时 `-s` 的数值是 ICMP 载荷大小，实际 IP 包还要加 28 字节（20 IP 头 + 8 ICMP 头），所以 1472 才对 1500',
        '`ping -f` 洪水模式等于小型 DoS，生产环境严禁；`ping -i` 小于 0.2 秒也必须 root',
        'IPv6 用 `ping -6` 或独立的 `ping6`：老系统（iputils 2012 之前）只有 ping6，CentOS 8 / Ubuntu 20.04 之后 ping6 可能已被移除，统一写 `ping -6` 更保险',
        'IPv6 没有 ARP，同网段解析靠 NDP，用 `ip -6 neigh` 查邻居表；链路本地地址 `fe80::` 必须带 `%网卡名` 后缀',
        '云主机开了 IPv6 还要确认安全组里有 IPv6 方向的放行规则，IPv4 规则不会自动覆盖 v6',
        '延迟从 5ms 突然涨到 200ms 且伴随丢包，往往不是本机问题，先用 `mtr` 定位是哪一跳开始劣化',
        '"Destination Host Unreachable" 通常是同网段 ARP 解析失败，"Request timeout" 才是包被丢弃或对端不回'
      ],
      related: ['ln-mtr', 'ln-traceroute', 'ln-arping', 'ln-ip-neigh', 'ln-troubleshoot-slow'],
      docs: 'https://man7.org/linux/man-pages/man8/ping.8.html',
      tags: ['连通性', '延迟', 'ICMP', 'MTU']
    },

    /* ---------- 17 / 56 ---------- */
    {
      id: 'ln-traceroute',
      name: 'traceroute',
      alias: ['traceroute -n', 'tracert'],
      level: 2,
      syntax: 'traceroute [选项] <目标主机|IP>',
      summary: '逐跳显示数据包到目标经过的路由节点，定位链路在哪一段中断。',
      desc: '`traceroute` 靠逐步增大 TTL 让沿途每台路由器回一个 ICMP 超时报文，从而画出完整路径。它默认用 UDP 高端口，很多防火墙会拦，于是出现 `* * *`；这时改用 `-I`（ICMP）或 `-T`（TCP）往往能穿透。看到从第 N 跳开始全是 `*`，说明问题出在第 N-1 跳与第 N 跳之间。同类的 **`tracepath`** 值得一并记住：它来自 `iputils`，**普通用户就能跑**（不需要原始套接字权限），而且会沿路探测并打印每一段的 `pmtu` 值，是排查"大包不通、小包能通"最快的手段。',
      params: [
        { flag: '-n', desc: '不做 DNS 反解，输出纯 IP，速度最快，必带' },
        { flag: '-I', desc: '改用 ICMP Echo 探测，UDP 被拦时用' },
        { flag: '-T', desc: '改用 TCP SYN 探测，最贴近真实业务流量，穿透性最好' },
        { flag: '-p <端口>', desc: '指定探测使用的目的端口，配合 -T 时常用 80 或 443' },
        { flag: '-m <跳数>', desc: '最大跳数，默认 30' },
        { flag: '-q <次数>', desc: '每跳探测次数，默认 3，调成 1 可加快输出' },
        { flag: '-w <秒>', desc: '每跳等待超时时间' },
        { flag: 'tracepath -n <目标>', desc: '免 root 的替代工具，输出含每段 pmtu，专治 MTU 塌陷' }
      ],
      examples: [
        { cmd: 'traceroute -n 8.8.8.8', desc: '看出去的公网路径，判断卡在哪一跳' },
        { cmd: 'traceroute -T -p 443 -n example.com', desc: '用 TCP 443 探测，穿透只放行 HTTPS 的防火墙' },
        { cmd: 'traceroute -I -q 1 -n 192.168.1.10', desc: '内网快速探测，每跳只发一个包' },
        { cmd: 'tracepath -n 192.168.1.10', desc: '普通用户权限即可执行，同时打印每段的 pmtu 值' }
      ],
      notes: [
        '中间跳显示 `* * *` 很常见，因为很多路由器不响应 ICMP 超时，不代表该跳真的不通',
        '默认 UDP 模式容易被安全策略拦，排障时优先试 `-T -p 443`',
        '链路质量（丢包率、抖动）要看 `mtr`，`traceroute` 只给一次快照，不适合判断偶发丢包',
        '`tracepath` 输出里的 `pmtu` 逐跳变小说明链路中存在 MTU 限制，常见于 VPN、隧道与跨运营商场景',
        '`tracepath` 同样会受 ICMP 限速影响出现 `asymm` 或跳数缺失，属正常现象',
        '云环境里第一跳通常是 VPC 网关，第二跳就出公网，跳数比物理网络少很多，属正常'
      ],
      related: ['ln-mtr', 'ln-ping', 'ln-troubleshoot-slow'],
      docs: 'https://man7.org/linux/man-pages/man8/traceroute.8.html',
      tags: ['链路', '逐跳', '路由追踪']
    },

    /* ---------- 18 / 56 ---------- */
    {
      id: 'ln-mtr',
      name: 'mtr',
      alias: ['mtr -r', 'mtr -c', 'my traceroute'],
      level: 3,
      syntax: 'mtr [选项] <目标主机|IP>',
      summary: '把 ping 与 traceroute 合体并持续统计，定位链路丢包最好用的工具。',
      desc: '`mtr` 一边逐跳发现路径，一边对每一跳持续发包统计丢包率与延迟，因此能回答 `traceroute` 回答不了的问题：**丢包发生在哪一跳、是持续还是偶发**。找运营商或云厂商报障时，一份 `mtr -r -c 100` 的报告就是最有力的证据。判读要点：如果某一跳开始丢包，且**后续所有跳的丢包率都接近**，说明问题就在那一跳；如果只有中间某一跳丢而后面恢复正常，那只是那台路由器限制 ICMP，不是真故障。',
      params: [
        { flag: '-r, --report', desc: '报告模式，统计完直接打印表格退出，写工单必备' },
        { flag: '-c <次数>', desc: '每跳发送的探测包数量，报告模式下常用 100，样本越多结论越准' },
        { flag: '-n, --no-dns', desc: '不做 DNS 反解，输出纯 IP，也避免卡住' },
        { flag: '-T, --tcp', desc: '用 TCP SYN 探测，穿透防火墙能力最强' },
        { flag: '-P <端口>', desc: '指定 TCP 探测的目的端口，常配 443' },
        { flag: '-i <秒>', desc: '发包间隔，默认 1 秒；调小可加快但仍需 root' },
        { flag: '-o <字段>', desc: '指定输出列顺序，如 -o "LSD NABWV"' },
        { flag: '-s <字节>', desc: '指定包大小，可顺带观察大包是否丢得更多' }
      ],
      examples: [
        { cmd: 'mtr -r -c 100 8.8.8.8', desc: '生成 100 个样本的链路报告，直接贴给运营商或云厂商工单' },
        { cmd: 'mtr -T -P 443 -r -c 50 example.com', desc: '用 TCP 443 探测并出报告，穿透只放行 HTTPS 的网络' },
        { cmd: 'mtr -n 192.168.1.10', desc: '交互式实时观察内网链路质量，Ctrl+C 退出' }
      ],
      notes: [
        '报告模式（`-r`）不写 `-c` 默认只发 10 个包，样本太少结论不可靠，报障一律 `-c 100` 起',
        '中间跳丢包但后续跳不丢，是那台路由器对 ICMP 限速，属正常现象，不要误判为故障点',
        '真正的问题特征是从某一跳起**后续所有跳都丢同样的比例**，那一跳就是故障起点',
        '`-T` 模式需要 root，因为要手工构造 TCP 包',
        '云主机上第一跳丢包常见于虚拟化平台的 ICMP 限速，判断时以业务端口实测为准'
      ],
      related: ['ln-traceroute', 'ln-ping', 'ln-troubleshoot-slow'],
      docs: 'https://www.bitwizard.nl/mtr/',
      tags: ['链路质量', '丢包定位', '报障']
    },

    /* ---------- 19 / 56 ---------- */
    {
      id: 'ln-arping',
      name: 'arping',
      alias: ['arping -I', 'IP 冲突检测'],
      level: 4,
      syntax: 'arping [-I <网卡名>] -c <次数> <目标IP>',
      summary: '在二层发 ARP 请求探测同网段主机，用于查 IP 冲突与 MAC 定位。',
      desc: '`arping` 工作在链路层，不经过 IP 层，所以能回答 `ping` 回答不了的问题：某个 IP 到底有没有被别的机器占用、响应这个 IP 的 MAC 是谁。虚拟机克隆后 IP 冲突、云主机迁移后 ARP 表错乱、需要定位某台机器接在哪个物理口，`arping` 都是首选。',
      params: [
        { flag: '-I <网卡名>', desc: '指定发包网卡，多网卡环境必须显式指定' },
        { flag: '-c <次数>', desc: '发送指定数量的 ARP 请求后退出' },
        { flag: '-D', desc: '重复地址检测模式，用于判断 IP 是否已被占用（地址冲突检测）' },
        { flag: '-s <源IP>', desc: '指定源 IP 地址' },
        { flag: '-w <秒>', desc: '超时时间' }
      ],
      examples: [
        { cmd: 'arping -I eth0 -c 4 192.168.1.10', desc: '看谁在响应这个 IP 并打印其 MAC，确认地址是否被冒用' },
        { cmd: 'arping -D -I eth0 -c 3 192.168.1.50', desc: '检测 192.168.1.50 是否已被占用，配 IP 前先跑一次' }
      ],
      notes: [
        '需要 root 权限，普通用户无法构造 ARP 报文',
        '必须指定 `-I`，不指定时多网卡机器可能从错误的网卡发包导致结果失真',
        '只能探测**同网段**主机，跨网段要用 `ping` 或 `hping3`',
        '如果收到两个不同 MAC 的响应，说明该 IP 存在冲突，必须立刻处理，否则业务会间歇性中断'
      ],
      related: ['ln-ip-neigh', 'ln-ping', 'ln-tcpdump'],
      docs: 'https://man7.org/linux/man-pages/man8/arping.8.html',
      tags: ['ARP', 'IP冲突', '二层']
    },

    /* ---------- 20 / 56 · DNS 排查 ---------- */
    /* ---------- 20 / 56 ---------- */
    {
      id: 'ln-nslookup',
      name: 'nslookup',
      alias: ['nslookup -type=mx', '交互式 DNS 查询'],
      level: 2,
      syntax: 'nslookup <域名> [DNS服务器] | nslookup -type=<记录类型> <域名>',
      summary: '交互式 DNS 查询工具，跨平台可用，快速验证解析结果与所用 DNS。',
      desc: '`nslookup` 在 Windows 和 Linux 上都有，语法一致，是跨平台排查 DNS 最省心的选择。不加服务器参数时它会读 `/etc/resolv.conf` 里的 DNS 并明确打印出来，正好可以用来确认"本机到底在用哪个 DNS"。它同时支持交互模式，输入 `server 8.8.8.8` 可以中途切换 DNS 服务器做对比。',
      params: [
        { flag: '<域名>', desc: '直接查询 A 记录' },
        { flag: '<域名> <DNS服务器>', desc: '指定 DNS 服务器查询，如 nslookup example.com 8.8.8.8' },
        { flag: '-type=mx / =ns / =txt / =cname', desc: '指定查询的记录类型' },
        { flag: '-debug', desc: '打印完整查询过程与响应报文' },
        { flag: 'set type=ptr + 反向IP', desc: '交互模式下的反向解析写法' }
      ],
      examples: [
        { cmd: 'nslookup www.huaweicloud.com', desc: '看解析结果，同时确认当前使用的是哪个 DNS 服务器' },
        { cmd: 'nslookup -type=mx example.com 8.8.8.8', desc: '向公共 DNS 查 MX 记录，与本地结果对比判断是否被污染' },
        { cmd: 'nslookup 192.168.1.10', desc: '反向解析，查这个内网 IP 对应的域名' }
      ],
      notes: [
        '`nslookup` 已属被弃用工具（随 BIND 9 的 `bind-utils` 提供），新脚本建议用 `dig` 或 `host`',
        '它不会打印 TTL 和权威服务器信息，做深度排查必须换 `dig`',
        '`Non-authoritative answer` 表示结果是缓存，不代表权威服务器就是这么配的'
      ],
      related: ['ln-dig', 'ln-host', 'ln-resolv-conf', 'ln-troubleshoot-dns'],
      docs: 'https://bind9.readthedocs.io/en/latest/manpages.html',
      tags: ['DNS', '域名解析', '跨平台']
    },

    /* ---------- 21 / 56 ---------- */
    {
      id: 'ln-dig',
      name: 'dig',
      alias: ['dig +short', 'dig +trace', 'dig -x', 'DNS 查询'],
      level: 3,
      syntax: 'dig [@DNS服务器] <域名> [记录类型] [+short] [+trace] [-x <IP>]',
      summary: '最专业的 DNS 查询工具，能指定服务器、看完整报文并逐级追踪委派。',
      desc: '`dig` 是 DNS 排查的终极工具：`@服务器` 可以绕过本地配置直接问任意 DNS，`+short` 给出最精简结果方便脚本处理，`+trace` 从根域开始逐级查询完整还原委派链路（能精确定位是哪个层级的 NS 配错了），`-x` 做反向解析。默认输出分五段：HEADER（状态码）、QUESTION、ANSWER、AUTHORITY、ADDITIONAL，排障重点看 HEADER 里的 `status` 与 `ANSWER` 的 TTL。',
      params: [
        { flag: '@<DNS服务器>', desc: '指定要查询的 DNS 服务器，如 @8.8.8.8，绕过本地配置' },
        { flag: '+short', desc: '只输出结果值，最精简，适合写进脚本' },
        { flag: '+trace', desc: '从根服务器开始逐级追踪委派，定位解析链哪一环出错' },
        { flag: '-x <IP>', desc: '反向解析，把 IP 查成域名（PTR 记录）' },
        { flag: '<记录类型>', desc: 'A / AAAA / CNAME / MX / NS / TXT / SOA / PTR，默认 A' },
        { flag: '+noall +answer', desc: '只打印 ANSWER 段，输出介于完整与 +short 之间' },
        { flag: '+tcp', desc: '改用 TCP 查询，验证 53 端口 TCP 是否放通（大响应必需）' },
        { flag: '+norecurse', desc: '不做递归，直接问权威服务器' }
      ],
      examples: [
        { cmd: 'dig +short www.huaweicloud.com', desc: '拿到最干净的解析结果，脚本里判断解析是否正常' },
        { cmd: 'dig @8.8.8.8 www.example.com', desc: '直接问 Google DNS，与本地解析结果对比定位是否本地 DNS 有问题' },
        { cmd: 'dig +trace www.example.com', desc: '从根域逐级追踪，精确定位是哪一级 NS 配置错误' },
        { cmd: 'dig -x 192.168.1.10', desc: '反查内网 IP 的 PTR 记录，确认反向解析是否正确' },
        { cmd: 'dig MX example.com +short', desc: '查邮件交换记录，排查邮件收发异常' },
        { cmd: 'dig TXT example.com +short', desc: '查 TXT 记录，用于验证 SPF、DKIM 与域名归属校验' }
      ],
      notes: [
        'HEADER 里的 `status` 是关键：`NXDOMAIN` 域名不存在，`SERVFAIL` 上游查询失败或被劫持，`REFUSED` 该 DNS 拒绝为你服务',
        '`+trace` 会直接向根和各级权威发查询，在内网或受限网络里会被封，跑之前先确认 53 端口出网正常',
        '`+short` 在多记录时会输出多行，写脚本要配合 `head -1` 或排序，否则可能拿到非预期的那一条',
        'TTL 值有助于判断"改了解析为什么还没生效"：TTL 3600 就意味着最长要等一小时',
        'Ubuntu/Debian 需要装 `dnsutils`，CentOS/RHEL 装 `bind-utils`，最小化系统默认没有 dig',
        '内网域名解析异常时，先 `dig @<内网DNS地址>` 直接问，能快速区分是 DNS 服务问题还是本机配置问题'
      ],
      related: ['ln-nslookup', 'ln-host', 'ln-resolv-conf', 'ln-troubleshoot-dns'],
      docs: 'https://bind9.readthedocs.io/en/latest/manpages.html',
      tags: ['DNS', '域名解析', '排障', '权威查询']
    },

    /* ---------- 22 / 56 ---------- */
    {
      id: 'ln-host',
      name: 'host',
      alias: ['host -t', 'host -l'],
      level: 2,
      syntax: 'host [-t <记录类型>] <域名|IP> [DNS服务器]',
      summary: '极简 DNS 查询，一条命令一个结果，适合快速确认解析。',
      desc: '`host` 的输出只有一行，比如 `example.com has address 93.184.216.34`，适合在脚本里快速判断，也适合不想读 `dig` 五段式报文的时候。传入 IP 时自动做反向解析。相比 `dig`，它缺少 `+trace` 这类高级能力，但胜在简单直给。',
      params: [
        { flag: '-t <类型>', desc: '指定记录类型，如 -t MX、-t NS、-t TXT' },
        { flag: '-a', desc: '等价于 -v -t ANY，输出所有记录类型' },
        { flag: '-v', desc: '详细输出，接近 dig 的完整格式' },
        { flag: '-l <域名>', desc: '列出整个域的记录，需要该 DNS 允许区域传送' }
      ],
      examples: [
        { cmd: 'host www.huaweicloud.com', desc: '一行拿到解析结果，最快确认域名能不能解析' },
        { cmd: 'host -t MX example.com', desc: '查邮件交换记录' },
        { cmd: 'host 192.168.1.10', desc: '传入 IP 自动反向解析，查 PTR 记录' }
      ],
      notes: [
        '输出过于精简，看不到 TTL 与权威段，定位复杂问题仍要回到 `dig`',
        '与 `dig`、`nslookup` 同属 `bind-utils`（Ubuntu 是 `dnsutils`），装了一个就有全部',
        '脚本里取值建议用 `host 域名 | awk \'{print $NF}\'`，直接切字符串容易因输出格式变化而失败'
      ],
      related: ['ln-dig', 'ln-nslookup', 'ln-hosts-file', 'ln-troubleshoot-dns'],
      docs: 'https://bind9.readthedocs.io/en/latest/manpages.html',
      tags: ['DNS', '快速查询', '反向解析']
    },

    /* ---------- 23 / 56 ---------- */
    {
      id: 'ln-resolv-conf',
      name: '/etc/resolv.conf',
      alias: ['resolv.conf', 'nameserver', 'options timeout'],
      level: 2,
      syntax: 'cat /etc/resolv.conf   # 查看；用 vi 编辑该文件修改 DNS 配置',
      summary: '本机 DNS 客户端配置，决定向哪台服务器发查询以及超时重试策略。',
      desc: '这个文件是 glibc 解析器的配置文件，四个关键项：`nameserver`（DNS 服务器地址，最多生效 3 个，按顺序尝试）、`search`（补全短域名的搜索域，查 `db` 会依次试 `db.<搜索域>`）、`domain`（本地域名，与 search 互斥，search 优先）、`options`（`timeout` 单次查询超时秒数、`attempts` 重试次数、`rotate` 轮询多个 nameserver、`ndots` 决定先当绝对域名还是先拼搜索域）。**云主机上这个文件常被 DHCP 或 NetworkManager 自动改写**，手工改完重启就还原，这是最高频的坑。Ubuntu 18.04+ / CentOS 8+ 由 `systemd-resolved` 接管 DNS 后，这个文件往往只是个指向 `127.0.0.53` 的软链接，真正的配置要看 **`resolvectl status`**。',
      params: [
        { flag: 'nameserver <IP>', desc: 'DNS 服务器地址，最多 3 个生效，按顺序尝试' },
        { flag: 'search <域名列表>', desc: '搜索域，短域名会被依次拼接尝试' },
        { flag: 'domain <域名>', desc: '本地域名，与 search 同用时 search 优先' },
        { flag: 'options timeout:<秒>', desc: '单次查询超时，默认 5 秒，内网可调小到 1~2 秒加速失败返回' },
        { flag: 'options attempts:<次>', desc: '重试次数，默认 2' },
        { flag: 'options rotate', desc: '在多个 nameserver 之间轮询，做负载分担' },
        { flag: 'resolvectl status', desc: 'systemd-resolved 接管时用它看每块网卡真实在用的 DNS' },
        { flag: 'resolvectl flush-caches', desc: '清空 DNS 缓存，改完解析记录后立即生效' }
      ],
      examples: [
        { cmd: 'cat /etc/resolv.conf', desc: '确认本机在用哪个 DNS，云主机上通常是 VPC 内网 DNS 地址' },
        { cmd: 'echo "options timeout:1 attempts:2" >> /etc/resolv.conf', desc: '调小超时与重试，缓解 DNS 慢导致的接口整体变慢' },
        { cmd: 'chattr +i /etc/resolv.conf', desc: '锁定文件防止被 DHCP 覆盖，手工改 DNS 后的常见做法' },
        { cmd: 'resolvectl status', desc: 'resolved 接管后看每块网卡实际用的 DNS 服务器，这才是真实配置' },
        { cmd: 'resolvectl query www.huaweicloud.com', desc: '走系统解析链路查询域名，输出里能看到是否命中缓存' }
      ],
      notes: [
        '云主机重启或 DHCP 续租后该文件常被自动改写，手工改动会丢失；要持久化应改网卡配置或 NetworkManager 的 `ipv4.dns`，CentOS 7 还可设 `PEERDNS=no`',
        '`nameserver` 写超过 3 个只有前 3 个生效，这是 glibc 的硬限制，不是配置错误',
        '配了 `search` 之后，短域名解析会先拼接搜索域，可能意外命中错误的内网域名，排查"解析到奇怪 IP"时要回来看这里',
        '`chattr +i` 锁定后系统更新或云厂商的自动化脚本会写入失败，长期锁定要评估影响',
        'Ubuntu 18.04+ / CentOS 8+ 上该文件若是指向 `systemd-resolved` 的软链接，直接编辑**无效**，要用 `resolvectl dns <网卡名> <DNS地址>` 或改 `/etc/systemd/resolved.conf`',
        '要让手工改的 `resolv.conf` 生效需停用 resolved（`systemctl disable --now systemd-resolved`），但要先评估其他服务的依赖',
        '`resolvectl` 只在 systemd-resolved 运行时可用，服务没启用时会报连接失败，此时改用 `dig @<DNS服务器>` 排查'
      ],
      related: ['ln-hosts-file', 'ln-dig', 'ln-nmcli', 'ln-troubleshoot-dns'],
      docs: 'https://man7.org/linux/man-pages/man5/resolv.conf.5.html',
      tags: ['DNS配置', '超时', '搜索域']
    },

    /* ---------- 24 / 56 ---------- */
    {
      id: 'ln-hosts-file',
      name: '/etc/hosts',
      alias: ['hosts 文件', 'nsswitch.conf', '本地域名解析'],
      level: 2,
      syntax: 'cat /etc/hosts   # 查看；用 vi 编辑该文件添加静态解析记录',
      summary: '本地静态域名解析表，优先级高于 DNS，是绕过解析故障的急救手段。',
      desc: '`/etc/hosts` 用 `IP 域名 别名` 的格式做静态映射，解析顺序由 `/etc/nsswitch.conf` 里的 `hosts:` 行决定，CentOS/RHEL 默认是 `files dns`、Ubuntu 默认是 `files mdns4_minimal [NOTFOUND=return] dns`（新版本还带 `resolve`）。只要 `files` 排在 `dns` 前面，hosts 就一定优先于 DNS。常见用途：数据库迁移时临时把域名指到新 IP 做验证、内网没有 DNS 时给几台机器做静态映射、屏蔽某些域名。',
      params: [
        { flag: '<IP> <域名> [别名...]', desc: '一行一条映射，IP 在最前，后可跟多个域名' },
        { flag: '127.0.0.1 localhost', desc: '系统默认条目，不要删除' },
        { flag: '# 开头', desc: '注释行，被解析器忽略' },
        { flag: 'nsswitch.conf 的 hosts: 行', desc: '决定 hosts 与 DNS 的先后顺序，files 在前则 hosts 优先' }
      ],
      examples: [
        { cmd: 'cat /etc/hosts', desc: '查看当前静态映射，排查"解析到奇怪 IP"时先看这里有没有被改' },
        { cmd: 'echo "192.168.1.100 db.internal" >> /etc/hosts', desc: '临时把 db.internal 指向新库做迁移验证，验证完记得删掉' },
        { cmd: 'getent hosts db.internal', desc: '按 nsswitch 规定的真实顺序做解析，验证 hosts 与 DNS 谁生效' }
      ],
      notes: [
        '`ping` 与 `getent` 走 nsswitch 顺序（hosts 优先），但 `dig`、`nslookup`、`host` **只查 DNS**，绕过 hosts，所以解析结果不一致时要先确认用的是哪类工具',
        'hosts 里写错映射会让服务连到错误的后端，改完必须立刻验证；生产环境不建议长期依赖 hosts 做域名管理',
        '用 hosts 屏蔽域名（指向 0.0.0.0 或 127.0.0.1）会影响本机所有程序，包括监控 Agent，操作前要评估',
        '`nsswitch.conf` 写错（比如漏掉 files）会导致整机解析异常，属于高危配置，改动前备份'
      ],
      related: ['ln-resolv-conf', 'ln-dig', 'ln-troubleshoot-dns'],
      docs: 'https://man7.org/linux/man-pages/man5/hosts.5.html',
      tags: ['本地解析', 'hosts', 'nsswitch']
    },

    /* ---------- 25 / 56 · HTTP 与下载 ---------- */
    /* ---------- 25 / 56 ---------- */
    {
      id: 'ln-curl',
      name: 'curl',
      alias: ['curl -I', 'curl -X POST', 'curl -w', 'HTTP 请求'],
      level: 2,
      syntax: 'curl [选项] <URL>',
      summary: '命令行 HTTP 客户端，接口调试、下载、连通性验证的第一主力工具。',
      desc: '`curl` 支持 HTTP/HTTPS/FTP/SCP 等几十种协议，实际工作中九成场景是它：调接口、验服务、查响应头、下文件、测代理。排障时两条最实用的组合是 `-i`（连响应头一起打印）与 `-v`（打印完整交互过程，含 TLS 握手细节，一眼看出卡在 DNS、连接还是 TLS）。`-w` 能把耗时拆成 `time_namelookup`、`time_connect`、`time_appconnect`、`time_starttransfer`、`time_total` 五段，是定位"接口慢在哪一步"的利器。',
      params: [
        { flag: '-X <方法>', desc: '指定 HTTP 方法，如 -X POST、-X PUT、-X DELETE' },
        { flag: '-H "<头: 值>"', desc: '添加请求头，可重复使用，如 -H "Content-Type: application/json"' },
        { flag: '-d "<数据>"', desc: '发送请求体，默认方法变为 POST，表单用 key=value&key2=value2' },
        { flag: '-F "<字段>=@<文件路径>"', desc: '以 multipart/form-data 上传文件，如 -F "file=@/tmp/a.jpg"' },
        { flag: '-o <文件名> / -O', desc: '保存到指定文件名 / 用 URL 里的原始文件名保存' },
        { flag: '-I / -i', desc: '只看响应头（HEAD 请求）/ 输出包含响应头与响应体' },
        { flag: '-s / -S', desc: '静默模式不显示进度 / 静默但显示错误，脚本里固定用 -sS' },
        { flag: '-v', desc: '打印完整请求与响应过程，含 TLS 握手与重定向细节，排障核心参数' }
      ],
      examples: [
        { cmd: 'curl -I https://www.huaweicloud.com', desc: '只看响应头，快速确认服务是否存活以及 HTTP 状态码' },
        { cmd: 'curl -sS -o /dev/null -w "状态码:%{http_code} 总耗时:%{time_total}s\\n" https://www.huaweicloud.com', desc: '不下载正文，只输出状态码与耗时，接口健康检查常用' },
        { cmd: 'curl -X POST -H "Content-Type: application/json" -d \'{"name":"test"}\' https://api.example.com/v1/users', desc: '发一个 JSON POST 请求，调后端接口的标准写法' },
        { cmd: 'curl -F "file=@/tmp/app.log" https://api.example.com/upload', desc: '上传本地文件，multipart 表单格式' },
        { cmd: 'curl -v http://192.168.1.10:8080/health', desc: '打印完整交互过程，看卡在 DNS、TCP 连接还是响应阶段' },
        { cmd: 'curl -O https://example.com/releases/app-1.2.0.tar.gz', desc: '下载文件并保留原始文件名（-O 用的是远端文件名，不用自己起名）' }
      ],
      notes: [
        '`-d` 会自动把方法改成 POST；如果只想加查询参数、保持 GET，要用 `--data-urlencode` 或直接拼在 URL 上',
        '`-k` 跳过证书校验**只用于排障**（快速判断是不是证书链问题），绝不能用于生产验证或写进上线脚本，那等于关掉了中间人攻击防护',
        '`-L` 跟随 3xx 重定向；不加时看到 301/302 别急着判定故障，先确认是否需要跟随',
        '`-s` 会连错误信息一起吞掉，脚本里务必用 `-sS`，否则请求失败时什么都看不到',
        '`--connect-timeout` 只控制连接阶段超时，`--max-time` 控制整个请求的总时长，要限制整体耗时必须写 `--max-time`',
        '`-v` 的输出会包含 `Authorization` 等敏感头，贴到工单或聊天群里前必须先脱敏'
      ],
      related: ['ln-curl-timing', 'ln-wget', 'ln-httpie', 'ln-openssl-sclient', 'ln-http-version', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man1/curl.1.html',
      tags: ['HTTP', '接口调试', '下载', '排障']
    },

    /* ---------- 26 / 56 ---------- */
    {
      id: 'ln-wget',
      name: 'wget',
      alias: ['wget -c', 'wget --spider', 'wget --no-check-certificate'],
      level: 2,
      syntax: 'wget [选项] <URL>',
      summary: '专注下载的命令行工具，断点续传与整站镜像能力比 curl 更省心。',
      desc: '`curl` 强在协议全面和请求可控，`wget` 强在**下载**这件事本身：`-c` 断点续传、`-r` 递归镜像、`--spider` 只探测不下载、`--limit-rate` 限速保护带宽。下载大文件、批量抓静态资源、写定时备份脚本，`wget` 通常比 `curl` 更顺手。',
      params: [
        { flag: '-c, --continue', desc: '断点续传，从已下载的部分接着下，大文件必带' },
        { flag: '-O <文件名>', desc: '保存为指定文件名' },
        { flag: '-P <目录>', desc: '保存到指定目录' },
        { flag: '--spider', desc: '只检查链接是否有效，不下载内容' },
        { flag: '--limit-rate=200k', desc: '限速下载，避免占满带宽影响业务' },
        { flag: '-r, --recursive', desc: '递归下载，镜像整站时用，务必配合 -np 与 -l 限制范围' },
        { flag: '--no-check-certificate', desc: '跳过 HTTPS 证书校验，仅限排障' },
        { flag: '-b, --background', desc: '后台下载，日志写入 wget-log' }
      ],
      examples: [
        { cmd: 'wget -c https://download.example.com/bigdata.tar.gz', desc: '下载大文件并支持断点续传，中断后重跑不会从头开始' },
        { cmd: 'wget --spider -S https://www.huaweicloud.com', desc: '只探测链接有效性并打印响应头，不落盘' },
        { cmd: 'wget --limit-rate=500k -c https://download.example.com/pkg.iso', desc: '限速 500KB/s 下载，避免占满 ECS 带宽影响线上业务' },
        { cmd: 'wget -r -np -l 2 -k https://docs.example.com/', desc: '递归镜像两层以内的页面并转换链接，做离线文档' }
      ],
      notes: [
        '`--no-check-certificate` 会跳过证书校验，等于放弃对中间人攻击的防护，**只能用于临时排障**；生产环境正确做法是把企业 CA 证书放进 `/etc/pki/ca-trust/source/anchors/` 后执行 `update-ca-trust`',
        '`-r` 递归下载没有边界限制时可能把整个站点拖下来，甚至触发对方风控，务必加 `-np`（不上溯父目录）与 `-l`（限制深度）',
        '`-c` 要求服务端支持 Range 请求，不支持时会重新完整下载；同时只能续传**同一个文件**，URL 变了续传会得到损坏文件',
        '`-b` 后台下载的日志默认写当前目录的 `wget-log`，不清理会越积越多'
      ],
      related: ['ln-curl', 'ln-httpie', 'ln-openssl-sclient'],
      docs: 'https://man7.org/linux/man-pages/man1/wget.1.html',
      tags: ['下载', '断点续传', '镜像']
    },

    /* ---------- 27 / 56 ---------- */
    {
      id: 'ln-curl-timing',
      name: 'curl -w 耗时分解',
      kind: 'recipe',
      alias: ['curl -w', 'time_namelookup', '接口耗时分析'],
      level: 3,
      syntax: 'curl -o /dev/null -s -w "<格式串>" <URL>',
      summary: '用 curl 的 -w 把一次请求拆成五段耗时，精确定位接口慢在哪一环。',
      desc: '接口慢，先别猜是网络还是应用。`-w` 可以输出一组内置变量：`time_namelookup`（DNS 解析完成）、`time_connect`（TCP 握手完成）、`time_appconnect`（TLS 握手完成）、`time_starttransfer`（收到第一个字节，即 TTFB）、`time_total`（整个请求结束）。用相邻两项相减就能算出每一阶段的真实耗时：`time_connect - time_namelookup` 是 TCP 握手耗时，`time_appconnect - time_connect` 是 TLS 握手耗时，`time_starttransfer - time_appconnect` 是服务端处理耗时，`time_total - time_starttransfer` 是内容传输耗时。',
      params: [
        { flag: '-w "<格式串>"', desc: '按格式串输出指标，变量写成 %{变量名}，换行用 \\n' },
        { flag: '-o /dev/null', desc: '丢弃响应正文，只看耗时数据' },
        { flag: '-s', desc: '静默模式，去掉进度条让输出干净' },
        { flag: '--connect-timeout <秒>', desc: '限制连接阶段超时，避免慢连接拖住脚本' },
        { flag: '--max-time <秒>', desc: '限制整个请求的最大耗时' }
      ],
      examples: [
        { cmd: 'curl -o /dev/null -s -w "DNS:%{time_namelookup} 连接:%{time_connect} TLS:%{time_appconnect} 首字节:%{time_starttransfer} 总计:%{time_total}\\n" https://www.huaweicloud.com', desc: '一次拿到五个阶段耗时，快速判断瓶颈在哪一环' },
        { cmd: 'curl -o /dev/null -s -w "状态:%{http_code} 大小:%{size_download}字节 速度:%{speed_download}字节/秒\\n" https://example.com/download/app.tar.gz', desc: '看下载速度与响应大小，判断是慢还是根本没下到东西' },
        { cmd: 'for i in $(seq 1 10); do curl -o /dev/null -s -w "%{time_total}\\n" https://api.example.com/health; done', desc: '连打 10 次看耗时波动，区分稳定慢与偶发抖动' }
      ],
      notes: [
        '所有 `time_*` 都是从请求开始算起的**累计值**，不是阶段值，必须两两相减才得到该阶段耗时',
        '`time_namelookup` 明显偏大（超过 100ms）说明 DNS 有问题，此时先去看 `/etc/resolv.conf` 而不是应用',
        '`time_connect` 大而 `time_namelookup` 小，说明 TCP 建连慢，可能是链路 RTT 高或被安全组/限速影响',
        '`time_appconnect` 与 `time_connect` 差距很大说明 TLS 握手慢，常见于证书链不完整或需要多次往返',
        '`time_starttransfer` 减去 `time_appconnect` 才是服务端真正的处理时间，这一段大就是应用自己的问题，与网络无关',
        '生产环境用 `%{time_total}` 做健康检查时，记得同时限制 `--max-time`，否则一个挂死的请求会拖住整个检查脚本'
      ],
      related: ['ln-curl', 'ln-mtr', 'ln-dig', 'ln-troubleshoot-slow'],
      docs: 'https://man7.org/linux/man-pages/man1/curl.1.html',
      tags: ['耗时分析', '性能', 'HTTP', '排障']
    },

    /* ---------- 28 / 56 ---------- */
    {
      id: 'ln-httpie',
      name: 'httpie',
      alias: ['http', 'https', 'httpie 命令'],
      level: 3,
      syntax: 'http [选项] <方法> <URL> [字段] | https <URL>',
      summary: '语法更友好的 HTTP 客户端，JSON 自动着色格式化，人工调接口舒服。',
      desc: 'HTTPie 把 `curl` 的 `-X`、`-H`、`-d` 全部简化成自然语法：`http POST url key=value` 就自动发 JSON 并带上正确的 `Content-Type`；响应默认语法高亮、JSON 自动缩进，肉眼读接口返回值比 `curl` 轻松很多。代价是它需要 Python 环境，且默认行为比 `curl` 更"自动"，脚本化时反而不如 `curl` 可控。',
      params: [
        { flag: 'http <方法> <URL>', desc: '指定方法发起请求，方法可省略（默认 GET）' },
        { flag: 'key=value', desc: 'JSON 字段，自动序列化为 JSON 请求体' },
        { flag: 'key:=<原始JSON>', desc: '值按原始 JSON 类型解析，如 age:=30 发数字而非字符串' },
        { flag: '-f, --form', desc: '改用表单提交，等价于 curl -F' },
        { flag: '-a <用户:密码>', desc: 'Basic 认证，等价于 curl -u' },
        { flag: '-h, --headers', desc: '只输出响应头' },
        { flag: '-b, --body', desc: '只输出响应体' },
        { flag: '--check-status', desc: '响应为 4xx/5xx 时以非零状态码退出，脚本里必须加' }
      ],
      examples: [
        { cmd: 'http GET https://api.example.com/v1/users', desc: '发一个 GET 请求，响应自动格式化高亮' },
        { cmd: 'http POST https://api.example.com/v1/users name=alice age:=30', desc: '自动以 JSON 提交，age 因用了 := 而保持数字类型' },
        { cmd: 'https -a admin:Passw0rd -h https://api.example.com/v1/status', desc: 'https 是 http 的 https 简写，带 Basic 认证且只输出响应头' }
      ],
      notes: [
        '需先安装：`pip install httpie` 或 `apt install httpie`，CentOS 仓库里通常没有',
        '`key=value` 默认发字符串，要发数字、布尔、数组必须用 `key:=value`，这是最常见的踩坑点',
        '脚本里不加 `--check-status` 时，即使返回 500 退出码仍是 0，会把失败当成功',
        '生产服务器上不一定有 Python 环境，通用性远不如 `curl`；排查线上问题优先用 `curl`'
      ],
      related: ['ln-curl', 'ln-wget', 'ln-http-version'],
      docs: 'https://httpie.io/docs/cli',
      tags: ['HTTP', '接口调试', 'JSON']
    },

    /* ---------- 29 / 56 ---------- */
    {
      id: 'ln-openssl-sclient',
      name: 'openssl s_client',
      alias: ['openssl s_client -connect', 'TLS 握手测试', '测 HTTPS 端口'],
      level: 3,
      syntax: 'openssl s_client -connect <主机>:<端口> [-servername <域名>] [-showcerts]',
      summary: '手工完成一次 TLS 握手，专门用来确认 HTTPS 端口能否正常协商加密。',
      desc: '当 `curl https://...` 报 SSL 相关错误时，`openssl s_client` 能给出比它详细得多的握手过程：协商出的协议版本、加密套件、对端证书链、证书有效期、SNI 是否被正确识别。它只做握手不做 HTTP 请求，所以能把"证书/TLS 层的问题"和"应用层的问题"彻底分开。`openssl` 整体属于安全分类，这里只从"测 HTTPS 端口通不通"的角度收一条。',
      params: [
        { flag: '-connect <主机>:<端口>', desc: '指定目标地址与端口，通常 443' },
        { flag: '-servername <域名>', desc: '指定 SNI，虚拟主机/CDN 场景必须带，否则可能拿到默认证书' },
        { flag: '-showcerts', desc: '打印完整证书链，用于确认中间证书是否缺失' },
        { flag: '-tls1_2 / -tls1_3', desc: '强制使用指定 TLS 版本，验证对端是否支持' },
        { flag: '-verify_return_error', desc: '证书校验失败时直接报错退出，可用于脚本判断' },
        { flag: '-4 / -6', desc: '强制使用 IPv4 / IPv6' }
      ],
      examples: [
        { cmd: 'openssl s_client -connect www.huaweicloud.com:443 -servername www.huaweicloud.com </dev/null', desc: '完成一次 TLS 握手并打印证书，确认 HTTPS 端口正常' },
        { cmd: 'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null 2>/dev/null | openssl x509 -noout -dates -subject', desc: '直接取出证书的生效与过期时间，快速判断是否证书过期' },
        { cmd: 'openssl s_client -connect api.example.com:443 -tls1_2 </dev/null', desc: '验证服务端是否仍支持 TLS 1.2，做协议合规检查' }
      ],
      notes: [
        '不加 `-servername` 时 SNI 为空，共享 IP 或 CDN 场景会返回默认证书，导致误判为"证书不匹配"',
        '命令会一直停在交互式输入等待，脚本里必须重定向 `</dev/null` 或加 `-brief`，否则会挂住',
        '握手成功不代表 HTTP 层正常，它只证明 TLS 层可用；业务是否健康仍要用 `curl -I` 验证',
        '输出里的 `Verify return code` 非 0 说明证书链有问题，最常见原因是服务端漏配中间证书',
        '需要系统安装 `openssl` 包，最小化安装的镜像里可能没有'
      ],
      related: ['ln-curl', 'ln-nc', 'ln-http-version', 'ln-troubleshoot-port'],
      docs: 'https://docs.openssl.org/3.5/man1/openssl-s_client/',
      tags: ['TLS', 'HTTPS', '证书', '握手']
    },

    /* ---------- 30 / 56 ---------- */
    {
      id: 'ln-http-version',
      name: 'curl --http2',
      alias: ['curl --http1.1', 'curl --http3', 'HTTP 版本探测'],
      level: 3,
      syntax: 'curl --http2 [-I] <URL> | curl --http1.1 [-I] <URL> | curl -w "%{http_version}\\n" -o /dev/null -s <URL>',
      summary: '强制指定或探测 HTTP 协议版本，排查网关只支持某版本导致的异常。',
      desc: 'HTTP/1.1、HTTP/2、HTTP/3 在网关、WAF、负载均衡上的支持程度不一致，表现常是"浏览器能开、命令行工具报错"或反之。`curl --http2` 会在 HTTPS 上通过 ALPN 协商 h2，用 `-v` 能看到 `ALPN, server accepted to use h2`；用 `--http1.1` 强制降级，可以判断问题是否只出现在某个协议版本上。`%{http_version}` 则直接打印本次实际使用的版本。',
      params: [
        { flag: '--http1.0 / --http1.1', desc: '强制使用指定 HTTP 版本' },
        { flag: '--http2', desc: '优先协商 HTTP/2，HTTPS 上走 ALPN' },
        { flag: '--http2-prior-knowledge', desc: '不做升级协商，直接用 h2 明文连接，用于 h2c 场景' },
        { flag: '-w "%{http_version}"', desc: '输出本次请求实际使用的 HTTP 版本号' },
        { flag: '-v', desc: '查看 ALPN 协商细节，确认对端是否接受 h2' },
        { flag: '-I', desc: '只发 HEAD 请求，探测版本时开销最小' }
      ],
      examples: [
        { cmd: 'curl --http2 -I -v https://www.huaweicloud.com', desc: '看 ALPN 是否协商成功，输出里找 "ALPN, server accepted to use h2"' },
        { cmd: 'curl -o /dev/null -s -w "%{http_version}\\n" https://www.huaweicloud.com', desc: '直接打印实际使用的 HTTP 版本，最简判断方式' },
        { cmd: 'curl --http1.1 -I https://api.example.com', desc: '强制降级到 HTTP/1.1，验证是否只有 HTTP/2 链路异常' }
      ],
      notes: [
        '`--http2` 在 HTTPS 上依赖 ALPN 协商，服务端不支持时会**静默退回 HTTP/1.1**，不报错；要确认结果必须看 `-v` 或 `%{http_version}`',
        '明文 HTTP（http://）下 `--http2` 走的是 Upgrade 机制，很多服务端不支持，测试 h2c 要用 `--http2-prior-knowledge`',
        '部分老版本 curl 未编译 nghttp2，`--http2` 会直接报 "the installed libcurl version does not support this"，用 `curl -V` 确认 Features 里有没有 HTTP2',
        'HTTP/3 需要 `--http3` 且 curl 版本较新（7.66+ 且编译了 HTTP/3 支持），生产环境目前仍以排查为主，不必强求',
        '"浏览器正常但 curl 报错"时，优先怀疑版本与请求头差异，用 `-v` 对比两者发的头'
      ],
      related: ['ln-curl', 'ln-curl-timing', 'ln-openssl-sclient', 'ln-httpie'],
      docs: 'https://man7.org/linux/man-pages/man1/curl.1.html',
      tags: ['HTTP版本', 'HTTP2', 'ALPN', '排障']
    },

    /* ---------- 31 / 56 · 抓包与流量 ---------- */
    /* ---------- 31 / 56 ---------- */
    {
      id: 'ln-tcpdump',
      name: 'tcpdump',
      alias: ['tcpdump -i any', 'tcpdump -w', '抓包'],
      level: 3,
      syntax: 'tcpdump [-i <网卡>] [-nn] [-c <数量>] [-w <文件>] [过滤表达式]',
      summary: '命令行抓包工具，用过滤表达式精确看到底有没有包到达本机。',
      desc: '当应用层什么都看不出来时，`tcpdump` 是终极裁判：包到底有没有到网卡、有没有发出去、对端有没有回。最核心的用法是 `-i any` 抓所有网卡（不在云主机上猜流量走 eth0 还是别的口），`-nn` 关掉所有名字解析让输出干净，`-c` 限制包数防打满磁盘，`-w` 存成 pcap 文件再用 Wireshark 或 `tshark` 细看。' +
        '常用过滤表达式：`port 80`（源或目的端口 80）、`host 192.168.1.10`（与该 IP 的往来）、`net 192.168.1.0/24`（整个网段）、`tcp and port 3306`、`src host 10.0.0.5 and dst port 443`、`vrrp`（抓 Keepalived 的 VRRP 心跳，排查 VIP 漂移）。',
      params: [
        { flag: '-i <网卡名>', desc: '指定网卡，any 表示所有网卡；不指定则抓第一个可用网卡，容易抓错' },
        { flag: '-nn', desc: '不解析主机名也不解析端口名，输出最快最清晰，必带' },
        { flag: '-c <数量>', desc: '抓够指定包数就退出，防止无限刷屏和写满磁盘' },
        { flag: '-w <文件>', desc: '把原始包写入 pcap 文件，供 Wireshark / tshark 分析' },
        { flag: '-r <文件>', desc: '读取已保存的 pcap 文件' },
        { flag: '-A', desc: '以 ASCII 打印包内容，看 HTTP 明文请求最直观' },
        { flag: '-X', desc: '同时以十六进制与 ASCII 打印，看二进制协议用' },
        { flag: '-s <字节>', desc: '截取每个包的前 N 字节，-s 0 表示抓完整包' }
      ],
      examples: [
        { cmd: 'tcpdump -i any -nn port 80 -c 20', desc: '抓 20 个 80 端口相关的包，确认请求到底有没有到本机' },
        { cmd: 'tcpdump -i any -nn host 192.168.1.10 and port 3306 -c 50', desc: '抓与内网 MySQL 的往来包，判断是连不上还是连上后被断开' },
        { cmd: 'tcpdump -i any -nn -w /tmp/cap.pcap port 443 -c 500', desc: '抓 500 个包存文件，之后用 Wireshark 或 tshark 慢慢分析' },
        { cmd: 'tcpdump -i any -nn -A -s 0 port 8080 -c 10', desc: '以 ASCII 打印包内容，直接看 HTTP 请求头与响应' },
        { cmd: 'tcpdump -i any -nn vrrp -c 10', desc: '抓 VRRP 心跳，排查 Keepalived 双机 VIP 漂移问题' }
      ],
      notes: [
        '**不加 `-c` 或输出重定向到文件时不加限制，高流量网卡上几分钟就能把磁盘写满**，抓包前一定先 `df -h` 并设定包数或文件大小上限',
        '必须 root 或具备 `CAP_NET_RAW` 能力，普通用户会报 permission denied',
        '`-i any` 在部分内核上抓不到 VLAN tag 或虚拟网卡的完整信息，定位虚拟化问题时改用具体网卡名',
        '过滤表达式写成 `port 80 or 443` 要加引号防止 shell 拆分；语法错误时 tcpdump 会直接报 syntax error 而不是忽略',
        '抓包会明显增加 CPU 开销，生产环境尽量加上精确过滤条件并限制时间窗口',
        '云主机上抓不到包不代表没有流量，可能是平台侧的镜像流量未下发，必要时用云平台的流量镜像功能'
      ],
      related: ['ln-tshark', 'ln-iftop', 'ln-nethogs', 'ln-nc', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man8/tcpdump.8.html',
      tags: ['抓包', '排障', '协议分析']
    },

    /* ---------- 32 / 56 ---------- */
    {
      id: 'ln-tshark',
      name: 'tshark',
      alias: ['wireshark 命令行', 'tshark -r'],
      level: 4,
      syntax: 'tshark -i <网卡> [-f "<抓包过滤>"] [-Y "<显示过滤>"] | tshark -r <pcap文件>',
      summary: 'Wireshark 的命令行版本，能在服务器上直接解析 pcap 并做协议统计。',
      desc: '`tshark` 与 Wireshark 共用同一套解析引擎，但没有图形界面，适合在只有 SSH 的服务器上分析抓包文件。它比 `tcpdump` 强的地方在于**两层过滤**：`-f` 是 BPF 抓包过滤（决定抓什么），`-Y` 是显示过滤（决定显示什么，语法与 Wireshark 完全一致），还支持 `-T fields` 按字段输出、`-z` 做各类统计。',
      params: [
        { flag: '-i <网卡名>', desc: '指定抓包网卡' },
        { flag: '-f "<BPF表达式>"', desc: '抓包过滤，语法同 tcpdump，如 "tcp port 80"' },
        { flag: '-Y "<显示过滤>"', desc: '显示过滤，Wireshark 语法，如 "http.response.code == 500"' },
        { flag: '-r <文件>', desc: '读取 pcap 文件分析' },
        { flag: '-T fields -e <字段>', desc: '按字段输出，便于脚本处理，如 -e ip.src -e tcp.dstport' },
        { flag: '-z <统计项>', desc: '输出统计，如 -z io,stat,1 看每秒流量' },
        { flag: '-V', desc: '输出包的完整协议树，信息最全但输出量极大' }
      ],
      examples: [
        { cmd: 'tshark -r /tmp/cap.pcap -Y "http.response.code >= 500"', desc: '从抓包文件里筛出所有 5xx 响应，定位服务端错误' },
        { cmd: 'tshark -r /tmp/cap.pcap -T fields -e ip.src -e tcp.dstport | sort | uniq -c | sort -rn | head -20', desc: '统计访问来源 IP 与端口排行，快速看谁在打你的服务' },
        { cmd: 'tshark -i eth0 -f "tcp port 3306" -Y "mysql.query" -c 20', desc: '实时抓 MySQL 查询语句，排查应用到底发了什么 SQL' }
      ],
      notes: [
        '安装的是 `wireshark-cli`（CentOS）或 `tshark`（Ubuntu）包，体积比 tcpdump 大不少',
        '`-V` 输出量极大，在终端里跑会刷屏，务必配合 `-c` 或重定向到文件',
        '抓包权限与 tcpdump 相同，需要 root 或把用户加进 wireshark 组',
        '显示过滤 `-Y` 与抓包过滤 `-f` 语法完全不同，写混了会报错；`-f` 只认 BPF 语法'
      ],
      related: ['ln-tcpdump', 'ln-curl', 'ln-troubleshoot-port'],
      docs: 'https://www.wireshark.org/docs/man-pages/tshark.html',
      tags: ['抓包分析', '协议解析', 'wireshark']
    },

    /* ---------- 33 / 56 ---------- */
    {
      id: 'ln-iftop',
      name: 'iftop',
      alias: ['iftop -n', 'iftop -P', '实时带宽'],
      level: 3,
      syntax: 'iftop [-i <网卡>] [-n] [-P] [-B]',
      summary: '实时按连接显示带宽占用，一眼看出是哪对 IP 在吃满流量。',
      desc: '`top` 看 CPU、`iotop` 看磁盘，而 `iftop` 看网络：它以连接为单位实时刷新收发速率，顶部还有刻度尺直观显示峰值。排查"带宽跑满导致业务变慢""有没有异常外联"时非常有效。`-n` 关掉 DNS 反解让显示更干净，`-P` 显示端口，两个一起用才能看清具体是哪条连接。',
      params: [
        { flag: '-i <网卡名>', desc: '指定监听的网卡，多网卡机器必须指定' },
        { flag: '-n', desc: '不做 DNS 反解，直接显示 IP，避免卡顿' },
        { flag: '-P', desc: '显示端口号，配合 -n 才能看清具体连接' },
        { flag: '-B', desc: '以字节为单位显示，默认是按位（bit）显示' },
        { flag: '-F <网段>', desc: '只显示与该网段相关的流量' },
        { flag: '-f "<过滤表达式>"', desc: '用 pcap 语法过滤，如 -f "port 80"' }
      ],
      examples: [
        { cmd: 'iftop -i eth0 -n -P', desc: '实时看 eth0 上哪条连接在吃带宽，排"网络卡"的第一步' },
        { cmd: 'iftop -i eth0 -n -P -f "port 3306"', desc: '只看数据库流量，判断是不是 SQL 拉取数据把带宽占满了' },
        { cmd: 'iftop -i eth0 -n -B', desc: '按字节显示速率，方便与 ECS 带宽规格（Mbit/s）换算对比' }
      ],
      notes: [
        '需要 root 权限（依赖 libpcap），且需要 `yum install iftop` 或 `apt install iftop` 单独安装',
        '默认按**位**显示（bit），而 ECS 带宽规格也是 Mbit/s，比较时注意单位；需要字节加 `-B`',
        '`iftop` 只显示 IP 层流量，不区分进程；要按进程看流量得用 `nethogs`',
        '界面里按 `h` 看帮助、`p` 切换端口显示、`n` 切换 DNS 解析、`q` 退出'
      ],
      related: ['ln-nethogs', 'ln-tcpdump', 'ln-ip-stats', 'ln-troubleshoot-slow'],
      docs: 'https://manpages.debian.org/bookworm/iftop/iftop.8.en.html',
      tags: ['带宽', '实时流量', '连接']
    },

    /* ---------- 34 / 56 ---------- */
    {
      id: 'ln-nethogs',
      name: 'nethogs',
      alias: ['nethogs -d', '按进程看流量'],
      level: 3,
      syntax: 'nethogs [-d <刷新秒数>] [-t] [<网卡名>]',
      summary: '按进程实时统计网络流量，快速找出是哪个程序在偷跑带宽。',
      desc: '`iftop` 告诉你"哪条连接在跑流量"，`nethogs` 进一步告诉你"哪个进程在跑流量"——这在排查异常外联、挖矿木马、日志上报失控时是决定性的。它把进程名、PID、该进程的上下行速率直接列出来，输出类似 `top`。',
      params: [
        { flag: '<网卡名>', desc: '指定网卡，如 nethogs eth0，不指定则用默认网卡' },
        { flag: '-d <秒>', desc: '刷新间隔，默认 1 秒，调大可以降低开销' },
        { flag: '-t', desc: '跟踪模式（tracemode），把统计结果按行输出，便于记录日志' },
        { flag: '-v <级别>', desc: '指定显示视图，3 为按进程汇总' }
      ],
      examples: [
        { cmd: 'nethogs eth0', desc: '实时看哪个进程在占用 eth0 的带宽，排查异常外联首选' },
        { cmd: 'nethogs -d 5 eth0', desc: '每 5 秒刷新一次，降低长时间观察时的系统开销' },
        { cmd: 'nethogs -t eth0 > /tmp/nethogs.log', desc: '以跟踪模式输出到日志，事后分析流量分布' }
      ],
      notes: [
        '需要 root 权限，且要 `yum install nethogs` 或 `apt install nethogs` 安装',
        '它通过解析 `/proc/net/tcp` 与进程 fd 反查归属，容器环境下容器内进程可能显示不全',
        '本身有一定 CPU 开销，高流量网卡上刷新间隔别设太小',
        '发现陌生进程大量外联时，先 `lsof -p <PID>` 看它打开了哪些文件，再决定是否封禁'
      ],
      related: ['ln-iftop', 'ln-tcpdump', 'ln-lsof', 'ln-troubleshoot-slow'],
      docs: 'https://manpages.debian.org/bookworm/nethogs/nethogs.8.en.html',
      tags: ['进程流量', '带宽', '异常外联']
    },

    /* ---------- 35 / 56 ---------- */
    {
      id: 'ln-ip-stats',
      name: 'ip -s link',
      alias: ['ip -s link show', '网卡丢包计数'],
      level: 3,
      syntax: 'ip -s link show [<网卡名>]',
      summary: '查看网卡收发包、错误与丢包计数，判断丢包是否发生在本地网卡。',
      desc: '`ip -s link` 输出网卡的累计统计：`RX packets/errors/dropped` 与 `TX packets/errors/dropped`。它的价值在于**把本地丢包与链路丢包区分开**：如果本机网卡的 dropped 计数持续增长，说明丢包就发生在本机（多为缓冲区不足或限速）；如果本机计数干净但对端还是丢，那问题在链路或对端。连续执行两次相减，就是这段时间的真实增量。',
      params: [
        { flag: '-s', desc: '显示统计信息，可叠加以看到更详细的分队列统计（ip -s -s link）' },
        { flag: 'show <网卡名>', desc: '只看指定网卡，如 ip -s link show eth0' },
        { flag: 'RX errors / dropped', desc: '接收方向的错误与丢包，dropped 增长说明本机来不及处理' },
        { flag: 'TX errors / dropped', desc: '发送方向的错误与丢包，errors 增长常见于网卡或驱动问题' },
        { flag: 'overrun', desc: '因缓冲区溢出丢弃的包数，与 ring buffer 大小相关' },
        { flag: 'carrier', desc: '物理链路层错误计数，非 0 说明线缆或协商有问题' }
      ],
      examples: [
        { cmd: 'ip -s link show eth0', desc: '看 eth0 的收发包与丢包计数，判断丢包是否发生在本机' },
        { cmd: 'ip -s -s link show eth0', desc: '叠加 -s 看到每个收发队列的详细统计，定位具体队列丢包' },
        { cmd: 'watch -n 1 "ip -s link show eth0 | tail -4"', desc: '每秒刷新一次，观察丢包计数是否在持续增长' }
      ],
      notes: [
        '所有计数都是**开机以来的累计值**，单看一次看不出问题，必须隔一段时间取两次相减',
        '`dropped` 增长常见原因是网卡 ring buffer 太小或流量超出带宽规格，可用 `ethtool -g` 查看缓冲区大小',
        '`errors` 增长属于异常信号，物理机要查线缆与光模块，云主机要提工单确认宿主机状态',
        '重启网卡或重启系统后计数清零，做前后对比要注意这一点',
        '`sar -n DEV` 能给出历史区间数据，但属监控分类；本分类只做现场即时判断'
      ],
      related: ['ln-ethtool', 'ln-ip-link', 'ln-iftop', 'ln-troubleshoot-slow'],
      docs: 'https://man7.org/linux/man-pages/man8/ip-link.8.html',
      tags: ['丢包', '网卡统计', '错误计数']
    },

    /* ---------- 36 / 56 · 防火墙 ---------- */
    /* ---------- 36 / 56 ---------- */
    {
      id: 'ln-firewall-cmd',
      name: 'firewall-cmd',
      alias: ['firewalld', 'firewall-cmd --add-port', 'firewall-cmd --permanent'],
      level: 3,
      syntax: 'firewall-cmd [--permanent] [--zone=<区域>] --add-port=<端口>/<协议> | --add-service=<服务> | --list-all | --reload',
      summary: 'firewalld 的管理命令，CentOS 7 及以上放行端口的默认工具。',
      desc: 'CentOS 7 / RHEL 7 起 firewalld 取代 iptables service 成为默认防火墙管理工具，底层仍是 iptables/nftables，但引入了**区域（zone）**的概念：每块网卡归属于某个 zone（默认 `public`），zone 里定义放行哪些端口、服务、源地址。`--permanent` 表示写入配置文件（重启后仍在），不加则表示只改运行时内存（立即生效但重启丢失）。**两者是两套独立的规则集**，这是 firewalld 最大的坑。华为云 ECS 的公共镜像（CentOS 7.9、Huawei Cloud EulerOS 等）默认开启 firewalld。',
      params: [
        { flag: '--add-port=8080/tcp', desc: '放行指定端口与协议，每次只能写一个端口' },
        { flag: '--add-service=https', desc: '按服务名放行，服务定义在 /usr/lib/firewalld/services/' },
        { flag: '--remove-port=8080/tcp', desc: '移除已放行的端口' },
        { flag: '--permanent', desc: '写入持久化配置，必须与 --reload 配合才在当前生效' },
        { flag: '--reload', desc: '重新加载持久化配置到运行时，会中断已建立的连接' },
        { flag: '--list-all', desc: '查看当前 zone 的全部规则，排障第一步' },
        { flag: '--zone=<区域>', desc: '指定区域，如 --zone=public，不指定则用默认区域' },
        { flag: '--add-rich-rule', desc: '添加富规则，如限制某源 IP 段的访问频率' }
      ],
      examples: [
        { cmd: 'firewall-cmd --list-all', desc: '查看当前区域放行了哪些端口与服务，确认规则到底生效没有' },
        { cmd: 'firewall-cmd --permanent --add-port=8080/tcp && firewall-cmd --reload', desc: '放行 8080 端口的完整两步操作，缺一步都无效' },
        { cmd: 'firewall-cmd --add-port=8080/tcp', desc: '只在运行时放行，立即生效但重启后丢失，适合临时验证' },
        { cmd: 'firewall-cmd --permanent --add-rich-rule=\'rule family="ipv4" source address="192.168.1.0/24" port port="3306" protocol="tcp" accept\' && firewall-cmd --reload', desc: '只允许指定内网网段访问 3306，比全开安全得多' },
        { cmd: 'firewall-cmd --permanent --remove-port=8080/tcp && firewall-cmd --reload', desc: '撤销之前的端口放行' }
      ],
      notes: [
        '**必须记住这两句**：`--add-port` 不加 `--permanent`，firewalld 重启或系统重启后规则消失；加了 `--permanent` 而不执行 `--reload`，当前运行时**不生效**。正确姿势永远是「加 --permanent + 执行 --reload」两步都做',
        '`--reload` 会重建规则链并断开已建立的连接，生产环境避开业务高峰执行',
        'firewalld 与直接写 iptables 规则**会互相冲突**：firewalld 重载时会覆盖手工添加的规则，用了 firewalld 就不要再手工 `iptables -A`',
        '云主机上排查端口不通，**先看安全组再看 firewalld**：华为云安全组在 VPC 层面拦截，本机 firewalld 放行了也没用',
        '`--add-port` 一次只能加一个端口，批量放行要写多次或使用富规则与 ipset',
        'Ubuntu 默认用 ufw 不用 firewalld，两套命令不能混用'
      ],
      related: ['ln-iptables', 'ln-ufw', 'ln-nft', 'ln-troubleshoot-port', 'ln-troubleshoot-firewall'],
      docs: 'https://firewalld.org/documentation/man-pages/firewall-cmd.html',
      tags: ['防火墙', '放行端口', 'firewalld', 'CentOS']
    },

    /* ---------- 37 / 56 ---------- */
    {
      id: 'ln-iptables',
      name: 'iptables',
      alias: ['iptables -L -n -v', 'iptables -A INPUT', 'NAT', 'DNAT', '端口转发'],
      level: 3,
      syntax: 'iptables [-t <表>] -L -n -v | iptables -A <链> <匹配条件> -j <动作> | iptables -D <链> <规则序号> | iptables -P <链> <策略>',
      summary: '内核 Netfilter 的命令行前端，做包过滤与 NAT 端口转发的底层工具。',
      desc: 'iptables 有四个常用表：`filter`（默认表，做放行/拒绝）、`nat`（做地址转换与端口转发）、`mangle`（改包内容）、`raw`（连接跟踪前处理）。filter 表有三条内置链：`INPUT`（进本机）、`OUTPUT`（出本机）、`FORWARD`（转发，做网关/端口转发时关键）。规则**从上往下匹配，命中即执行动作并停止**，所以顺序决定一切，`-A` 追加到末尾，`-I` 插到最前。云主机做 DNAT 端口转发时还必须开启内核转发 `net.ipv4.ip_forward=1`。',
      params: [
        { flag: '-L -n -v', desc: '列出规则：-n 不做反解、-v 显示包计数与字节数，排障标准写法' },
        { flag: '--line-numbers', desc: '显示规则序号，删除或插入规则时必用' },
        { flag: '-A <链>', desc: '在链尾追加一条规则，如 -A INPUT' },
        { flag: '-I <链> <序号>', desc: '在指定位置插入规则，默认插到第 1 条（最优先）' },
        { flag: '-D <链> <序号|规则>', desc: '删除规则，按序号删最稳' },
        { flag: '-s <源地址> / --dport <端口>', desc: '匹配源地址 / 目标端口，如 -s 192.168.1.0/24 --dport 3306' },
        { flag: '-j <动作>', desc: '命中后的动作：ACCEPT 放行、DROP 静默丢弃、REJECT 拒绝并回错误、LOG 记日志' },
        { flag: '-t nat -A PREROUTING', desc: '在 nat 表做 DNAT 端口转发，配合 --to-destination 使用' }
      ],
      examples: [
        { cmd: 'iptables -L -n -v --line-numbers', desc: '查看 filter 表全部规则与匹配计数，排障必跑的第一条' },
        { cmd: 'iptables -A INPUT -p tcp --dport 8080 -j ACCEPT', desc: '放行 8080 端口（注意是追加到末尾，可能被前面的 DROP 规则挡住）' },
        { cmd: 'iptables -I INPUT 1 -s 203.0.113.10 -j DROP', desc: '把封禁某 IP 的规则插到最前面立即生效，用于应急封禁' },
        { cmd: 'iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.1.10:8080', desc: '把本机 80 端口转发到内网机器的 8080，做端口映射' },
        { cmd: 'iptables -D INPUT 3', desc: '删除 INPUT 链上序号为 3 的规则' },
        { cmd: 'iptables -P INPUT DROP', desc: '把 INPUT 默认策略改为 DROP，只放行显式允许的流量（高危）' }
      ],
      notes: [
        '**`iptables -F` 会清空所有规则链**，如果默认策略是 DROP，执行完你的 SSH 会话立刻断线且再也连不上，只能去云控制台走 VNC 救；执行前务必先确认 `iptables -P INPUT` 是 ACCEPT，或先配置好 `crontab` 定时恢复任务',
        '`iptables` 的规则**重启后全部丢失**，持久化用 `iptables-save` / `iptables-restore`（CentOS 6 用 `service iptables save`）',
        '`-A` 追加到链尾，若前面已有 `-j DROP` 或 `-j REJECT` 全量规则，新加的 ACCEPT **永远不会命中**，此时应改用 `-I` 插到前面',
        '用了 firewalld 的机器不要手工写 iptables 规则，firewalld 重载会覆盖它们，两套管理方式只能选一套',
        '做 NAT 端口转发除了写 iptables 规则，还必须 `sysctl -w net.ipv4.ip_forward=1` 并持久化到 `/etc/sysctl.conf`，否则包不会被转发',
        '`-j DROP` 与 `-j REJECT` 表现不同：DROP 让客户端一直等到超时（Connection timed out），REJECT 立刻回错误（Connection refused），排查时这个区别能帮你反推是哪一层在拦',
        '云主机上还叠加了安全组，iptables 放行 ≠ 外网可达，两边都要放行',
        '规则条数过多会明显影响转发性能，大规模封禁场景应改用 `ipset`'
      ],
      related: ['ln-iptables-save', 'ln-ipset', 'ln-firewall-cmd', 'ln-nft', 'ln-troubleshoot-connect-refused', 'ln-troubleshoot-firewall'],
      docs: 'https://man7.org/linux/man-pages/man8/iptables.8.html',
      tags: ['防火墙', 'NAT', '端口转发', '包过滤']
    },

    /* ---------- 38 / 56 ---------- */
    {
      id: 'ln-ufw',
      name: 'ufw',
      alias: ['ubuntu firewall', 'ufw allow', 'ufw status'],
      level: 2,
      syntax: 'ufw status [verbose|numbered] | ufw allow <端口>/<协议> | ufw deny <端口> | ufw enable | ufw disable',
      summary: 'Ubuntu 上的简化防火墙前端，一条命令放行端口，比 iptables 直观。',
      desc: '`ufw`（Uncomplicated Firewall）是 Ubuntu/Debian 的默认防火墙管理工具，本质是 iptables 规则的友好封装。它默认策略是「拒绝所有入站、允许所有出站」，比裸 iptables 安全得多。`ufw allow 22/tcp` 一句话就能放行 SSH，还能直接按应用名放行（`ufw allow OpenSSH`），配置文件在 `/etc/ufw/`。',
      params: [
        { flag: 'status', desc: '查看防火墙状态与规则列表' },
        { flag: 'status verbose', desc: '显示默认策略与日志级别等完整信息' },
        { flag: 'status numbered', desc: '规则带序号显示，删除规则时用' },
        { flag: 'allow <端口>/<协议>', desc: '放行端口，如 ufw allow 8080/tcp' },
        { flag: 'allow from <源IP> to any port <端口>', desc: '只允许指定来源 IP 访问某端口' },
        { flag: 'deny <端口>', desc: '拒绝访问某端口' },
        { flag: 'delete <规则序号>', desc: '按序号删除规则' },
        { flag: 'enable / disable', desc: '启用 / 停用防火墙' }
      ],
      examples: [
        { cmd: 'ufw status verbose', desc: '查看规则与默认策略，排障第一步' },
        { cmd: 'ufw allow 8080/tcp', desc: '放行 8080 端口，规则立即生效且持久化' },
        { cmd: 'ufw allow from 192.168.1.0/24 to any port 3306 proto tcp', desc: '只允许内网网段访问数据库端口' },
        { cmd: 'ufw delete 3', desc: '按序号删除第 3 条规则' }
      ],
      notes: [
        '**`ufw enable` 之前必须先放行 SSH 端口**，否则一旦启用就把自己关在门外，云主机只能走控制台 VNC 抢救',
        '`ufw` 是 Ubuntu/Debian 专属，CentOS/RHEL 上请用 `firewall-cmd`，两套命令不能混用',
        '`ufw` 与手工 iptables 规则同样会冲突，用 ufw 就别再直接改 iptables',
        '与 firewalld 不同，`ufw allow` 是持久化生效的，不需要额外的 reload 动作',
        '规则改完可用 `ufw status numbered` 复查确认，删错序号会误删其他规则'
      ],
      related: ['ln-firewall-cmd', 'ln-iptables', 'ln-troubleshoot-port'],
      docs: 'https://git.launchpad.net/ufw/plain/doc/ufw.8',
      tags: ['防火墙', 'Ubuntu', '放行端口']
    },

    /* ---------- 39 / 56 ---------- */
    {
      id: 'ln-iptables-save',
      name: 'iptables-save / iptables-restore',
      alias: ['iptables-save', 'iptables-restore', '规则持久化'],
      level: 3,
      syntax: 'iptables-save > <文件> | iptables-restore < <文件>',
      summary: '把 iptables 规则导出到文件与从文件恢复，解决规则重启丢失问题。',
      desc: 'iptables 规则只存在于内存，重启即丢。`iptables-save` 把当前全部规则（含各表各链）按可重新导入的格式导出，`iptables-restore` 从文件一次性载入。CentOS 7+ 把规则文件放在 `/etc/sysconfig/iptables`，配合 `iptables-services` 包实现开机自动恢复；Ubuntu 则用 `iptables-persistent` 包把规则存到 `/etc/iptables/rules.v4`。',
      params: [
        { flag: '> /etc/sysconfig/iptables', desc: '导出到 CentOS 的标准规则文件位置' },
        { flag: '< /etc/sysconfig/iptables', desc: '从该文件恢复规则' },
        { flag: '-t <表>', desc: '只导出指定表，如 -t nat，默认导出所有表' },
        { flag: '-c, --counters', desc: '同时保存包计数与字节计数' },
        { flag: 'iptables-restore -n, --noflush', desc: '不先清空现有规则，而是追加，默认行为是先 flush' }
      ],
      examples: [
        { cmd: 'iptables-save > /etc/sysconfig/iptables', desc: '把当前规则导出，CentOS 7 上重启后由 iptables-services 自动载入' },
        { cmd: 'iptables-save -t nat > /tmp/nat-rules.bak', desc: '只备份 nat 表规则，改动端口转发前先留一份' },
        { cmd: 'iptables-restore < /etc/sysconfig/iptables', desc: '从文件恢复规则，改坏了可以立刻回滚' }
      ],
      notes: [
        '`iptables-restore` **默认会先清空现有规则再载入**，文件内容不完整会导致规则缺失甚至断网，恢复前先确认文件完整',
        '规则文件属于高危配置，恢复前先备份当前状态：`iptables-save > /tmp/now.bak`',
        'CentOS 7+ 需要装 `iptables-services` 并 `systemctl enable iptables` 才会开机自动恢复；只存文件不装服务等于白存',
        'Ubuntu 用 `apt install iptables-persistent`，规则存 `/etc/iptables/rules.v4`，用 `netfilter-persistent save` 保存',
        '用了 firewalld 的机器不要用这套，firewalld 会覆盖手工规则'
      ],
      related: ['ln-iptables', 'ln-ipset', 'ln-firewall-cmd'],
      docs: 'https://man7.org/linux/man-pages/man8/iptables-save.8.html',
      tags: ['规则持久化', '备份恢复', '防火墙']
    },

    /* ---------- 40 / 56 ---------- */
    {
      id: 'ln-ipset',
      name: 'ipset',
      alias: ['ipset create', 'iptables 集合', '批量封禁'],
      level: 4,
      syntax: 'ipset create <集合名> hash:ip | ipset add <集合名> <IP> | ipset list <集合名> | iptables -I INPUT -m set --match-set <集合名> src -j DROP',
      summary: '管理 IP 集合，让 iptables 一条规则就能封禁成千上万个地址。',
      desc: 'iptables 每条规则都是线性匹配，要封 5000 个恶意 IP 就得写 5000 条规则，性能直接崩掉。`ipset` 把一大堆 IP 存进哈希结构，iptables 只需一条 `--match-set` 规则引用它，匹配是 O(1) 的。它支持 `timeout` 自动过期，非常适合"临时封禁攻击源 1 小时"这类场景。',
      params: [
        { flag: 'create <名> hash:ip', desc: '创建存储单个 IP 的集合' },
        { flag: 'create <名> hash:net', desc: '创建存储网段的集合' },
        { flag: 'add <名> <IP>', desc: '往集合里加一个地址' },
        { flag: 'add <名> <IP> timeout 3600', desc: '加地址并设置 3600 秒后自动移除' },
        { flag: 'list <名>', desc: '查看集合内容' },
        { flag: 'del <名> <IP> / flush <名>', desc: '删除单个地址 / 清空整个集合' },
        { flag: 'destroy <名>', desc: '销毁集合，被 iptables 引用时需先删规则' }
      ],
      examples: [
        { cmd: 'ipset create blacklist hash:ip timeout 3600', desc: '创建名为 blacklist 的集合，成员默认 1 小时后自动过期' },
        { cmd: 'ipset add blacklist 203.0.113.10', desc: '把攻击源 IP 加入黑名单' },
        { cmd: 'iptables -I INPUT -m set --match-set blacklist src -j DROP', desc: '一条规则引用整个集合，集合里有多少 IP 都只占一条规则' },
        { cmd: 'ipset list blacklist | head -20', desc: '查看当前被封禁的地址列表' }
      ],
      notes: [
        '必须先有 iptables 规则引用集合，往集合里加 IP 才会真正拦截；只 `ipset add` 不写规则是没有效果的',
        '`ipset` 内容同样**重启后丢失**，持久化要先 `ipset save > /etc/ipset.conf` 再 `ipset restore`（配 `ipset-service`）',
        '集合名长度不能超过 31 个字符，写太长会报错',
        '大规模封禁优先用 `hash:net` 按网段聚合，比逐个 IP 更省内存',
        '`iptables` 与 `ipset` 需要内核模块支持，极简内核或部分容器环境下可能不可用'
      ],
      related: ['ln-iptables', 'ln-iptables-save', 'ln-firewall-cmd'],
      docs: 'https://ipset.netfilter.org/ipset.man.html',
      tags: ['批量封禁', 'IP集合', '高性能']
    },

    /* ---------- 41 / 56 ---------- */
    {
      id: 'ln-nft',
      name: 'nft',
      alias: ['nftables', 'nft list ruleset'],
      level: 4,
      syntax: 'nft list ruleset | nft add table <族> <表名> | nft add rule <族> <表> <链> <匹配> <动作> | nft flush ruleset',
      summary: 'nftables 的管理命令，新一代包过滤框架，正在取代 iptables。',
      desc: 'nftables 从 Linux 3.13 引入，把 iptables 的「表-链-规则」模型统一并简化：不再有固定的表与链名，用 `family`（ip / ip6 / inet / arp / bridge / netdev）区分协议族，`inet` 族可以一次同时管 IPv4 与 IPv6，不用像 iptables 那样写两遍。RHEL 8 / CentOS 8 起 `iptables` 命令实际已由 `iptables-nft` 转译到 nftables 后端，Debian 10+ 也默认使用 nftables。',
      params: [
        { flag: 'list ruleset', desc: '列出所有族、表、链、规则，相当于 iptables-save 的全量视图' },
        { flag: 'add table <族> <表名>', desc: '创建表，族取值 ip / ip6 / inet / arp / bridge / netdev' },
        { flag: 'add chain <族> <表> <链名>', desc: '创建链' },
        { flag: 'add rule <族> <表> <链>', desc: '添加规则，如 tcp dport 8080 accept' },
        { flag: 'delete rule <句柄>', desc: '按句柄删除规则，句柄用 nft -a list ruleset 查看' },
        { flag: 'flush ruleset', desc: '清空所有规则，等同于 iptables -F 的加强版，极度危险' },
        { flag: '-a', desc: '列出规则时附带句柄，删除规则前必看' }
      ],
      examples: [
        { cmd: 'nft list ruleset', desc: '查看当前全部 nftables 规则，CentOS 8 上排查防火墙的底层真相' },
        { cmd: 'nft add rule inet filter input tcp dport 8080 accept', desc: '在 inet 族一次放行 IPv4 与 IPv6 的 8080 端口' },
        { cmd: 'nft -a list ruleset | grep -i dport', desc: '带句柄列出规则，找到要删除的那条' }
      ],
      notes: [
        '**`nft flush ruleset` 会清空所有规则**，远程执行极可能立即断线，比 `iptables -F` 影响面更大，执行前必须确认默认策略与已有会话',
        '在 CentOS 8 / RHEL 8 上，`iptables` 命令其实是 `iptables-nft` 的兼容层，写 iptables 规则最终落到 nftables；用 `iptables -L` 与 `nft list ruleset` 看到的格式不同但内容是同一套',
        '不要在同一台机器上混用 firewalld、iptables、nft 三套工具，规则会互相覆盖',
        '规则持久化用 `nft list ruleset > /etc/nftables.conf` 并启用 `nftables.service`（CentOS 8 默认已启用）',
        '语法与 iptables 完全不同，迁移时逐条翻译，不要凭记忆写'
      ],
      related: ['ln-iptables', 'ln-firewall-cmd', 'ln-iptables-save'],
      docs: 'https://www.netfilter.org/projects/nftables/manpage.html',
      tags: ['nftables', '防火墙', '新一代']
    },

    /* ---------- 42 / 56 ---------- */
    {
      id: 'ln-troubleshoot-firewall',
      name: 'firewall-cmd 排查端口不通链路',
      kind: 'recipe',
      alias: ['端口不通排查', 'firewalld 排障', '安全组排查'],
      level: 3,
      syntax: 'firewall-cmd --list-all && firewall-cmd --query-port=<端口>/tcp   # 按链路逐层确认放行状态',
      summary: '从本机防火墙到云安全组逐层确认端口放行状态，定位被哪一层拦掉。',
      desc: '端口不通时，数据包要穿过**四道关卡**：云平台安全组（VPC 层）→ 本机防火墙（firewalld / ufw / iptables）→ 服务是否监听 → 应用是否绑定到正确的地址。这四层必须**从外到内**逐层排除，顺序错了会白查很久。云主机上最常见的情况是：本机 `curl localhost` 完全正常，外网就是连不上——这时九成是安全组，而不是系统防火墙。',
      params: [
        { flag: '--list-all', desc: '一次性看当前 zone 的接口、服务、端口、富规则' },
        { flag: '--query-port=8080/tcp', desc: '查询某端口是否已放行，脚本里判断用，返回 yes/no' },
        { flag: '--list-ports', desc: '只列出已放行的端口列表' },
        { flag: '--get-active-zones', desc: '看哪些 zone 处于活动状态、各绑定哪块网卡' },
        { flag: '--state / systemctl status firewalld', desc: '确认 firewalld 本身是否在运行' }
      ],
      examples: [
        { cmd: 'firewall-cmd --state && firewall-cmd --get-active-zones && firewall-cmd --list-all', desc: '三步确认本机防火墙运行状态与放行规则' },
        { cmd: 'firewall-cmd --query-port=8080/tcp', desc: '直接查询 8080 是否已放行，返回 no 说明本机防火墙在拦' },
        { cmd: 'systemctl status firewalld --no-pager', desc: '确认 firewalld 服务本身是否活着，服务停了规则自然不存在' }
      ],
      notes: [
        '**顺序必须是：云安全组 → 本机防火墙 → 服务监听 → 应用绑定地址**，跳过安全组直接查 firewalld 是最常见的浪费时间',
        '华为云安全组在控制台「网络控制台 → 访问控制 → 安全组」修改，规则方向、协议、端口、源地址四个字段都要对；改完立即生效，不需要重启 ECS',
        '安全组是有状态的：入方向放行了请求端口，出方向不需要再单独放行响应流量；但出方向发起的请求仍需出方向规则放行',
        '`firewall-cmd --list-all` 显示放行了端口，还要确认该端口属于**当前活动的 zone**，规则加在非活动 zone 上等于没加',
        'CentOS 6 没有 firewalld，用 `iptables -L -n` 或 `service iptables status` 查看',
        '实在分不清是哪一层拦的，两边同时 `tcpdump` 抓包：本机抓不到包 = 被安全组或上游拦，抓到 SYN 但没回 SYN-ACK = 本机防火墙或服务没监听'
      ],
      related: ['ln-firewall-cmd', 'ln-iptables', 'ln-ss', 'ln-tcpdump', 'ln-troubleshoot-port', 'ln-troubleshoot-connect-refused'],
      docs: 'https://firewalld.org/documentation/man-pages/firewall-cmd.html',
      tags: ['端口不通', '安全组', '排查链路']
    },

    /* ---------- 43 / 56 · SSH 与远程访问 ---------- */
    /* ---------- 43 / 56 ---------- */
    {
      id: 'ln-ssh',
      name: 'ssh',
      alias: ['ssh -L', 'ssh -R', 'ssh -D', 'ssh -J', '端口转发', '跳板机'],
      level: 2,
      syntax: 'ssh [选项] [<用户>@]<主机> [<远程命令>]',
      summary: '加密远程登录，并可通过隧道把远程端口搬到本地或反向映射出去。',
      desc: 'SSH 不只是登录工具，它的三种端口转发是运维的核心技能：**`-L` 本地转发**把远程能访问的端口映射到本机（如通过跳板机访问内网数据库）；**`-R` 远程转发**把本机端口映射到远端（如把内网服务临时暴露给外部调试）；**`-D` 动态转发**起一个 SOCKS5 代理，让浏览器走服务器出口。配合 `-N`（不执行远程命令）与 `-f`（转后台）就是一条常驻隧道。跳板机场景用 `-J` 一步到位，不必手工配 ProxyCommand。',
      params: [
        { flag: '-p <端口>', desc: '指定远端 SSH 端口，默认 22；注意是小写 p，大写 P 是 scp/sftp 的' },
        { flag: '-i <私钥文件>', desc: '指定私钥文件，如 -i ~/.ssh/id_ed25519' },
        { flag: '-o <选项>', desc: '传入配置项，如 -o StrictHostKeyChecking=no、-o ConnectTimeout=5' },
        { flag: '-v / -vvv', desc: '输出调试信息，login 失败时看卡在哪一步（认证、密钥交换、权限）' },
        { flag: '-L <本地端口>:<目标主机>:<目标端口>', desc: '本地转发：本机端口 → 经 SSH 服务器 → 目标主机端口' },
        { flag: '-R <远程端口>:<目标主机>:<目标端口>', desc: '远程转发：把远端端口映射回来，用于内网穿透' },
        { flag: '-D <本地端口>', desc: '动态转发，在本机起一个 SOCKS5 代理' },
        { flag: '-N / -f / -T', desc: '不执行远程命令 / 转后台 / 不分配终端，做隧道时三个一起用' }
      ],
      examples: [
        { cmd: 'ssh -i ~/.ssh/id_ed25519 root@192.168.1.10', desc: '用指定私钥登录云主机，最基础的形式' },
        { cmd: 'ssh -p 2222 -o ConnectTimeout=5 ubuntu@203.0.113.25', desc: '连非标准端口并设置连接超时，避免卡住' },
        { cmd: 'ssh -vvv root@192.168.1.10', desc: '登录失败时输出完整调试日志，看认证卡在哪一步' },
        { cmd: 'ssh -L 13306:192.168.1.100:3306 -N -f root@203.0.113.25', desc: '把远端内网的 MySQL 映射到本机 13306，之后本机连 127.0.0.1:13306 即可' },
        { cmd: 'ssh -D 1080 -N -f root@203.0.113.25', desc: '在本机 1080 起一个 SOCKS5 代理，浏览器配置它即走服务器出口' },
        { cmd: 'ssh -J root@203.0.113.25 root@192.168.1.100', desc: '经跳板机 203.0.113.25 直连内网主机，一条命令搞定' }
      ],
      notes: [
        '默认端口的 `-p` 是小写；`scp`/`sftp` 用的是大写 `-P`，写混了会报参数错误',
        '`-L` 默认只监听 `127.0.0.1`，别人连不上是正常的；要让局域网可访问需显式写 `-L 0.0.0.0:13306:...`，但这等于把内网数据库暴露给整个网段，务必配合防火墙限制来源',
        '`-R` 远程转发要能工作，服务端 `sshd_config` 必须允许 `GatewayPorts`（默认只绑回环），且需保持连接不断——加上 `-o ServerAliveInterval=60` 防止空闲被中断',
        '隧道进程会随 SSH 会话断开而失效，长期隧道建议用 `autossh` 或 systemd 单元托管',
        '`-o StrictHostKeyChecking=no` 会跳过主机密钥校验，方便但降低了防护能力，只适合临时自动化场景',
        '默认的 22 端口会持续被扫描爆破，生产环境建议改端口 + 禁用密码登录 + 用密钥认证'
      ],
      related: ['ln-ssh-tunnel', 'ln-ssh-keygen', 'ln-ssh-config-alias', 'ln-ssh-nopass', 'ln-sshd-config', 'ln-known-hosts'],
      docs: 'https://man7.org/linux/man-pages/man1/ssh.1.html',
      tags: ['SSH', '端口转发', '跳板机', '隧道']
    },

    /* ---------- 44 / 56 ---------- */
    {
      id: 'ln-ssh-keygen',
      name: 'ssh-keygen',
      alias: ['ssh-keygen -t ed25519', '生成密钥对'],
      level: 2,
      syntax: 'ssh-keygen -t <算法> [-b <位数>] [-C "<注释>"] [-f <输出路径>]',
      summary: '生成 SSH 密钥对，用密钥认证替代密码登录的第一步。',
      desc: '`ssh-keygen` 生成一对密钥：私钥自己留着（权限必须是 600），公钥追加到目标机器的 `~/.ssh/authorized_keys`。算法选择上，`ed25519` 是目前推荐默认值——密钥短、速度快、安全性好；`rsa` 仍有大量老系统必须用，位数至少 2048，推荐 4096。注意 **ed25519 的位数是固定的 256，不能也不需要用 `-b` 指定**，`-b` 只在生成 RSA 时有意义。',
      params: [
        { flag: '-t <算法>', desc: '指定算法：ed25519（推荐）、rsa、ecdsa' },
        { flag: '-b <位数>', desc: '指定密钥长度，RSA 用 4096；ed25519 不支持该参数' },
        { flag: '-C "<注释>"', desc: '添加注释，通常写邮箱或用途，便于在 authorized_keys 里识别' },
        { flag: '-f <路径>', desc: '指定输出文件路径，如 ~/.ssh/id_ed25519_deploy' },
        { flag: '-p', desc: '修改已有私钥的密码短语' },
        { flag: '-l -f <公钥>', desc: '查看公钥的指纹信息，交付审计时用' },
        { flag: '-R <主机>', desc: '从 known_hosts 中删除指定主机的记录，解决密钥变更告警' }
      ],
      examples: [
        { cmd: 'ssh-keygen -t ed25519 -C "ops@example.com"', desc: '生成 ed25519 密钥对，推荐的新项目默认选择' },
        { cmd: 'ssh-keygen -t rsa -b 4096 -C "deploy@ci" -f ~/.ssh/id_rsa_deploy', desc: '生成 4096 位 RSA 密钥用于老的自动化系统，且不覆盖默认密钥' },
        { cmd: 'ssh-keygen -l -f ~/.ssh/id_ed25519.pub', desc: '查看公钥指纹，核对密钥是否一致' },
        { cmd: 'ssh-keygen -R 192.168.1.10', desc: '删除该主机的 known_hosts 记录，解决主机密钥变更后的告警' }
      ],
      notes: [
        '私钥权限必须是 `600`、`.ssh` 目录必须是 `700`，权限过宽 sshd 会直接拒绝使用该密钥并报 "bad permissions"',
        '**私钥绝不能外传或提交到 Git**；只把 `.pub` 公钥分发给目标机器',
        '生成时设置的密码短语（passphrase）很关键，留空虽方便但私钥泄露即失守；生产密钥建议设短语并配合 `ssh-agent`',
        '`-f` 指定的文件若已存在，会提示是否覆盖，覆盖旧密钥会导致所有依赖它的机器失去访问权限',
        'ed25519 不兼容非常老的 OpenSSH（6.5 之前），CentOS 6 这类老系统上仍需用 RSA'
      ],
      related: ['ln-ssh-copy-id', 'ln-ssh-agent', 'ln-ssh-nopass', 'ln-ssh'],
      docs: 'https://man7.org/linux/man-pages/man1/ssh-keygen.1.html',
      tags: ['SSH密钥', '免密登录', 'ed25519']
    },

    /* ---------- 45 / 56 ---------- */
    {
      id: 'ln-ssh-copy-id',
      name: 'ssh-copy-id',
      alias: ['分发公钥', 'authorized_keys'],
      level: 2,
      syntax: 'ssh-copy-id [-i <公钥文件>] [-p <端口>] <用户>@<主机>',
      summary: '一条命令把本地公钥装到远端 authorized_keys，免密登录的第二步。',
      desc: '手工做这件事要「ssh 登录 → mkdir .ssh → chmod 700 → 追加公钥 → chmod 600」，`ssh-copy-id` 把这些全包了，还会自动修正目录与文件权限。它会提示输入一次目标机器的密码，之后就再也不用了。注意它装的是**公钥**，且是追加而不是覆盖，同一个 authorized_keys 可以放多把钥匙。',
      params: [
        { flag: '-i <公钥文件>', desc: '指定要分发的公钥，默认用 ~/.ssh/id_rsa.pub；用 ed25519 时必须显式指定' },
        { flag: '-p <端口>', desc: '指定目标 SSH 端口，默认 22' },
        { flag: '-o <选项>', desc: '透传给 ssh 的选项' },
        { flag: '-n', desc: '空跑模式，只打印将要执行的动作不实际执行' },
        { flag: '-f', desc: '强制复制，即使远端已存在该公钥' }
      ],
      examples: [
        { cmd: 'ssh-copy-id -i ~/.ssh/id_ed25519.pub root@192.168.1.10', desc: '把 ed25519 公钥装到目标机器，免密登录第二步' },
        { cmd: 'ssh-copy-id -i ~/.ssh/id_ed25519.pub -p 2222 ubuntu@203.0.113.25', desc: '目标是非标准 SSH 端口时用 -p 指定' },
        { cmd: 'ssh-copy-id -n -i ~/.ssh/id_ed25519.pub root@192.168.1.10', desc: '空跑一遍看将要做什么，确认无误再真正执行' }
      ],
      notes: [
        '免密仍不生效时按顺序查：远端 `~/.ssh` 是否 700、`authorized_keys` 是否 600、家目录本身权限是否过大（家目录 777 会导致 sshd 拒绝密钥）',
        '目标机器必须密码登录可达，如果 `sshd_config` 里已经 `PasswordAuthentication no` 且还没有任何公钥，就只能去控制台 VNC 登录后手工追加',
        '用 ed25519 密钥时必须加 `-i`，否则默认分发的是 `id_rsa.pub`，装错了自然免密不了',
        'CentOS 7 自带的 `ssh-copy-id` 版本较老，个别情况下对非标准端口支持不好，可用 `ssh "cat >> ~/.ssh/authorized_keys" < ~/.ssh/id_ed25519.pub` 手工替代',
        '分发前务必确认公钥内容正确，公钥末尾被截断会导致认证静默失败'
      ],
      related: ['ln-ssh-keygen', 'ln-ssh-nopass', 'ln-ssh-agent', 'ln-ssh'],
      docs: 'https://man7.org/linux/man-pages/man1/ssh-copy-id.1.html',
      tags: ['免密登录', '公钥分发', 'SSH']
    },

    /* ---------- 46 / 56 ---------- */
    {
      id: 'ln-ssh-agent',
      name: 'ssh-agent / ssh-add',
      alias: ['ssh-add', 'ssh-agent', '密钥代理'],
      level: 3,
      syntax: 'eval "$(ssh-agent -s)" && ssh-add <私钥文件> | ssh-add -l | ssh-add -D',
      summary: '在内存中缓存私钥，一次输入密码短语后多次登录免重复输入。',
      desc: '给私钥设了密码短语后，每次 SSH 都要输入一遍，自动化脚本更是没法用。`ssh-agent` 在内存里做一个密钥代理，`ssh-add` 把解密后的私钥交给它，之后的 SSH 连接自动向 agent 要密钥验证，全程不再提示。它还能配合 `-A` 转发 agent 到跳板机，实现"从跳板机继续免密连内网机器"而不必把私钥复制到跳板机上，这是比拷贝私钥安全得多的做法。',
      params: [
        { flag: 'ssh-add <私钥文件>', desc: '把指定私钥加入 agent，会提示输入一次密码短语' },
        { flag: 'ssh-add -l', desc: '列出 agent 中已加载的密钥指纹' },
        { flag: 'ssh-add -L', desc: '列出完整的公钥内容' },
        { flag: 'ssh-add -D', desc: '清空 agent 中所有密钥' },
        { flag: 'ssh-add -d <公钥文件>', desc: '移除指定密钥' },
        { flag: 'ssh-add -t <秒数>', desc: '设置密钥在 agent 中的有效时间，到期自动移除' }
      ],
      examples: [
        { cmd: 'eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519', desc: '启动 agent 并加载私钥，只需输一次密码短语' },
        { cmd: 'ssh-add -l', desc: '确认 agent 里有哪些密钥，排查"为什么还要输密码"' },
        { cmd: 'ssh-add -t 3600 ~/.ssh/id_ed25519_deploy', desc: '加载密钥并设置 1 小时后自动失效，降低长期驻留风险' }
      ],
      notes: [
        '`ssh-agent` 只在当前 shell 会话有效，新开终端或断开后 agent 就没了，需要重新 `eval "$(ssh-agent -s)"`；要长期使用可写进 `~/.bashrc` 或用 `keychain`',
        '`ssh-add -D` 会清掉所有已加载的密钥，正在使用 agent 的自动化任务会立刻失败',
        'agent 转发（`ssh -A`）很方便但**有风险**：跳板机 root 用户可以通过 agent 套接字冒用你的密钥登录其他机器，仅在可信跳板机上使用',
        '在 screen/tmux 与 SSH agent 混用时，注意环境变量 `SSH_AUTH_SOCK` 是否被带到新会话里'
      ],
      related: ['ln-ssh', 'ln-ssh-keygen', 'ln-ssh-nopass'],
      docs: 'https://man7.org/linux/man-pages/man1/ssh-agent.1.html',
      tags: ['密钥代理', '免密登录', 'SSH']
    },

    /* ---------- 47 / 56 ---------- */
    {
      id: 'ln-ssh-nopass',
      name: 'ssh 免密登录三步',
      kind: 'recipe',
      alias: ['免密登录', 'SSH 免密码', '公钥认证'],
      level: 2,
      syntax: 'ssh-keygen -t ed25519   # 1.生成密钥  →  ssh-copy-id   # 2.分发公钥  →  ssh 验证  # 3.免密登录',
      summary: '生成密钥、分发公钥、验证登录三步配好 SSH 免密，附带排错顺序。',
      desc: '免密登录（公钥认证）的完整闭环只有三步，但配不通时原因往往藏在权限细节里。验证顺序应当是：先确认**私钥有没有加载**（`ssh-add -l`）、再确认**远端文件权限**（`~/.ssh` 700、`authorized_keys` 600、家目录不能是 777）、最后用 `ssh -vvv` 看认证过程到底试了哪些方法。第三步验证时**必须新开一个终端**，不要覆盖当前已登录的会话，否则配置错了就再也进不去。',
      params: [
        { flag: '第 1 步 ssh-keygen -t ed25519', desc: '在本机生成密钥对，密码短语可留空（自动化场景）或设置（更安全）' },
        { flag: '第 2 步 ssh-copy-id -i <公钥> <用户>@<主机>', desc: '把公钥追加到远端 authorized_keys，会要求输入一次密码' },
        { flag: '第 3 步 ssh <用户>@<主机>', desc: '新开终端验证是否还需要密码' },
        { flag: '排错 ssh -vvv <用户>@<主机>', desc: '看认证细节，重点找 "Offering public key" 与 "Server accepts key"' },
        { flag: '排错 ls -ld ~/.ssh && ls -l ~/.ssh/authorized_keys', desc: '在远端检查权限是否为 700 / 600' }
      ],
      examples: [
        { cmd: 'ssh-keygen -t ed25519 -C "ops@example.com"', desc: '第一步：在本机生成 ed25519 密钥对' },
        { cmd: 'ssh-copy-id -i ~/.ssh/id_ed25519.pub root@192.168.1.10', desc: '第二步：把公钥分发到目标云主机' },
        { cmd: 'ssh -o PreferredAuthentications=publickey root@192.168.1.10', desc: '第三步：强制只用公钥认证验证，成功且不提示密码即配置完成' },
        { cmd: 'ssh -vvv root@192.168.1.10 2>&1 | grep -i "publickey\\|accepts"', desc: '免密失败时过滤关键日志，快速定位是密钥没发过去还是权限不对' }
      ],
      notes: [
        '**第三步验证一定要新开一个终端窗口**，不要在当前已登录的会话里试验；配错了至少还有一条活着的连接可以救回来',
        '远端 `~/.ssh` 必须是 700、`authorized_keys` 必须是 600；家目录权限过大（如 777）同样会导致 sshd 拒绝使用公钥，这个坑最隐蔽',
        '免密失败时用 `ssh -vvv` 观察：完全没有 "Offering public key" 说明本机没找到私钥；有 Offering 但服务端不接受，说明公钥没装对或权限有问题',
        '`sshd_config` 里若设了 `PubkeyAuthentication no`，怎么配都不生效；确认它是 yes 或注释状态',
        'SELinux 开启时（`getenforce` 返回 Enforcing）`~/.ssh` 的安全上下文不对也会导致认证失败，可用 `restorecon -Rv ~/.ssh` 修复',
        '免密配好后建议关闭密码登录（`PasswordAuthentication no`），但**务必先确认免密可用**再关，否则会锁死自己'
      ],
      related: ['ln-ssh-keygen', 'ln-ssh-copy-id', 'ln-ssh-agent', 'ln-sshd-config', 'ln-ssh'],
      docs: 'https://man7.org/linux/man-pages/man1/ssh.1.html',
      tags: ['免密登录', '公钥认证', '实战']
    },

    /* ---------- 48 / 56 ---------- */
    {
      id: 'ln-known-hosts',
      name: 'ssh -o StrictHostKeyChecking / known_hosts',
      alias: ['StrictHostKeyChecking', 'known_hosts', 'Host key verification failed'],
      level: 3,
      syntax: 'ssh -o StrictHostKeyChecking=<yes|no|accept-new> <用户>@<主机> | ssh-keygen -R <主机>',
      summary: '处理主机密钥校验告警，说清什么时候该清记录、什么时候该警觉。',
      desc: '首次连接一台机器时 SSH 会提示 "The authenticity of host ... can\'t be established"，确认后把对端公钥指纹记入 `~/.ssh/known_hosts`，之后指纹变化就报 `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!` 并拒绝连接。**这个告警本身是安全机制**：可能是重装了系统、换了机器（正常情况），也可能是中间人攻击（危险情况）。正确处理是先核对新指纹，确认无误后用 `ssh-keygen -R` 删掉旧记录重连。`StrictHostKeyChecking` 的 `accept-new` 是新版 OpenSSH 提供的折中选项：首次自动接受，但变更时仍会报错。',
      params: [
        { flag: 'StrictHostKeyChecking=yes', desc: '最严格：指纹不匹配就拒绝连接（默认行为）' },
        { flag: 'StrictHostKeyChecking=accept-new', desc: '首次自动接受，指纹变更时报警，自动化场景推荐' },
        { flag: 'StrictHostKeyChecking=no', desc: '不校验指纹，任何主机都直接连；方便但放弃防护' },
        { flag: 'UserKnownHostsFile=/dev/null', desc: '不写入 known_hosts，配合 no 使用（临时脚本常见）' },
        { flag: 'ssh-keygen -R <主机>', desc: '删除该主机的 known_hosts 记录，指纹变更后的标准处理' },
        { flag: 'ssh-keyscan <主机>', desc: '主动获取对端主机公钥，可先比对指纹再决定是否信任' }
      ],
      examples: [
        { cmd: 'ssh -o StrictHostKeyChecking=accept-new root@192.168.1.10', desc: '首次连接自动接受指纹，后续变更仍会告警，自动化脚本推荐写法' },
        { cmd: 'ssh-keygen -R 192.168.1.10', desc: '主机重装系统后指纹变了，删掉旧记录再重连' },
        { cmd: 'ssh-keyscan -t ed25519 192.168.1.10 2>/dev/null | ssh-keygen -lf -', desc: '获取并打印对端主机密钥指纹，与运维核对后再连接' }
      ],
      notes: [
        '指纹变更告警**不要习惯性忽略**：云主机重装、更换弹性公网 IP 复用、负载均衡后端切换都会触发；但如果是你没做任何变更就告警，要警惕中间人攻击',
        '`StrictHostKeyChecking=no` 常被写进 CI 脚本图方便，这等于放弃主机身份校验，在不可信网络中风险很高；优先用 `accept-new` 或把目标主机公钥预置进 known_hosts',
        '`UserKnownHostsFile=/dev/null` 会让每次连接都像首次连接，无法发现指纹变更，只适合一次性临时容器环境',
        'known_hosts 里的记录与**主机名或 IP 严格绑定**，同一台机器用 IP 和域名连会被当成两台主机分别记录',
        '错误提示 `REMOTE HOST IDENTIFICATION HAS CHANGED` 里已经给出了冲突行号，可按提示定位并删除'
      ],
      related: ['ln-ssh', 'ln-ssh-keygen', 'ln-ssh-config-alias', 'ln-sshd-config'],
      docs: 'https://man7.org/linux/man-pages/man5/ssh_config.5.html',
      tags: ['known_hosts', '主机密钥', '安全告警']
    },

    /* ---------- 49 / 56 ---------- */
    {
      id: 'ln-ssh-config-alias',
      name: '~/.ssh/config',
      alias: ['ssh config', 'ssh 别名', 'Host 配置'],
      level: 3,
      syntax: '在 ~/.ssh/config 中写 Host <别名> 段，之后可直接 ssh <别名>',
      summary: '把主机、端口、用户、密钥写成别名，一条 ssh 短命令代替一长串参数。',
      desc: '`~/.ssh/config` 让你把常用连接参数固化成别名：配好之后 `ssh prod-db` 就等于 `ssh -i ~/.ssh/id_ed25519_prod -p 2222 ops@203.0.113.25 -o ConnectTimeout=5`。它还支持 `ProxyJump` 直接写跳板机，`Host *` 通配段设置全局默认值，是管理几十台机器的必备配置。文件必须放在 `~/.ssh/config` 且权限为 600，否则 SSH 会忽略它。',
      params: [
        { flag: 'Host <别名>', desc: '定义一个别名，后面可跟多个模式如 Host web1 web2' },
        { flag: 'HostName <地址>', desc: '真实的主机名或 IP' },
        { flag: 'User <用户名>', desc: '登录用户' },
        { flag: 'Port <端口>', desc: 'SSH 端口' },
        { flag: 'IdentityFile <私钥路径>', desc: '指定私钥文件' },
        { flag: 'ProxyJump <跳板机>', desc: '指定跳板机，等价于命令行 -J' },
        { flag: 'ServerAliveInterval <秒>', desc: '定时发心跳，防止空闲被防火墙断开' },
        { flag: 'Host *', desc: '通配段，放在文件最后作为全局默认值' }
      ],
      examples: [
        { cmd: 'printf "Host prod-db\\n  HostName 203.0.113.25\\n  User ops\\n  Port 2222\\n  IdentityFile ~/.ssh/id_ed25519_prod\\n  ProxyJump jump-host\\n" >> ~/.ssh/config && chmod 600 ~/.ssh/config', desc: '写入一个带跳板机的别名并修正权限' },
        { cmd: 'ssh prod-db', desc: '配好别名后一条命令登录，参数全部由配置文件提供' },
        { cmd: 'ssh -G prod-db | head -20', desc: '打印该别名最终生效的完整配置，排查配置没生效的原因' }
      ],
      notes: [
        '`~/.ssh/config` 权限必须是 `600`，权限过宽 SSH 会直接忽略整个文件，且不报错，非常隐蔽',
        '配置项**区分大小写**，必须写成 `HostName` 而不是 `hostname`；写错了同样静默失效',
        '`Host *` 通配段要放在文件**最后**，因为 SSH 采用「首个匹配优先」，放前面会覆盖后面的具体配置',
        '`ssh -G <别名>` 是排查配置是否生效的最快方式，它打印合并后的最终配置',
        '跳板机别名本身也要能在配置里解析，`ProxyJump` 里引用的是另一个 `Host` 名或 `用户@主机`'
      ],
      related: ['ln-ssh', 'ln-ssh-tunnel', 'ln-known-hosts', 'ln-ssh-nopass'],
      docs: 'https://man7.org/linux/man-pages/man5/ssh_config.5.html',
      tags: ['SSH配置', '别名', '跳板机']
    },

    /* ---------- 50 / 56 ---------- */
    {
      id: 'ln-sftp',
      name: 'sftp',
      alias: ['sftp 上传下载', 'SSH 文件传输'],
      level: 2,
      syntax: 'sftp [-P <端口>] [-i <私钥>] <用户>@<主机>',
      summary: '基于 SSH 的交互式文件传输，适合少量文件的安全上传下载。',
      desc: '`sftp` 走 SSH 通道，全程加密，不需要额外开服务，只要有 SSH 权限就能传文件。它是交互式会话，进去后可用 `put`/`get`/`ls`/`cd`/`lcd` 等命令，和操作本地目录的感觉接近。相比 `scp`，它的优势是能在会话里先看清楚再传；相比 `rsync`，它没有增量同步能力，大量文件传输不如 `rsync`。',
      params: [
        { flag: '-P <端口>', desc: '指定 SSH 端口，注意是大写 P（scp 与 sftp 都用大写）' },
        { flag: '-i <私钥文件>', desc: '指定私钥' },
        { flag: '-b <批处理文件>', desc: '从文件读取命令批量执行，适合自动化' },
        { flag: 'put <本地文件> [远端路径]', desc: '上传文件（会话内命令）' },
        { flag: 'get <远端文件> [本地路径]', desc: '下载文件（会话内命令）' },
        { flag: 'put -r <目录> / get -r <目录>', desc: '递归上传 / 下载整个目录（会话内命令）' }
      ],
      examples: [
        { cmd: 'sftp -i ~/.ssh/id_ed25519 root@192.168.1.10', desc: '连上远端进入交互式文件传输会话' },
        { cmd: 'sftp -P 2222 ops@203.0.113.25', desc: '目标是非标准 SSH 端口时指定端口' },
        { cmd: 'sftp -b /tmp/batch.txt ops@203.0.113.25', desc: '用批处理文件自动上传，适合脚本化' }
      ],
      notes: [
        '端口参数是**大写 `-P`**（与 `ssh -p` 相反），写错会报参数错误或连到默认 22',
        '服务端若在 `sshd_config` 里设了 `Subsystem sftp` 被注释或禁用，sftp 会连接失败，此时检查该行是否指向 `sftp-server`',
        '大量小文件传输效率很低，建议先 `tar` 打包再传，或在 `linux-basic` 分类里用 `rsync` 做增量同步',
        '传输大文件时注意目标磁盘空间，先 `df -h` 确认；云主机系统盘普遍不大'
      ],
      related: ['ln-ssh', 'ln-sshd-config', 'ln-curl'],
      docs: 'https://man7.org/linux/man-pages/man1/sftp.1.html',
      tags: ['文件传输', 'SSH', '上传下载']
    },

    /* ---------- 51 / 56 · 网络排查组合 ---------- */
    /* ---------- 51 / 56 ---------- */
    {
      id: 'ln-sshd-config',
      name: '/etc/ssh/sshd_config',
      alias: ['sshd_config', 'PermitRootLogin', 'PasswordAuthentication', 'sshd -t'],
      level: 3,
      syntax: 'vi /etc/ssh/sshd_config   # 修改后执行 sshd -t 校验，再 systemctl reload sshd 生效',
      summary: 'SSH 服务端配置，控制登录方式、端口与访问白名单，改错会锁死自己。',
      desc: '这是云主机安全加固中最关键的一个文件，四个高频配置项：`PermitRootLogin`（是否允许 root 直接登录，建议 `no` 或 `prohibit-password`）、`PasswordAuthentication`（是否允许密码登录，配好密钥后应设 `no`）、`Port`（SSH 端口，改非 22 可大幅减少扫描爆破）、`AllowUsers`（白名单，只允许指定用户登录）。**改完必须先执行 `sshd -t` 校验语法，再 `systemctl reload sshd` 重载**——reload 不会断开已建立的连接，而 restart 会。',
      params: [
        { flag: 'Port 2222', desc: '修改 SSH 监听端口，改完要同步放行安全组与新端口的防火墙规则' },
        { flag: 'PermitRootLogin no', desc: '禁止 root 直接登录；prohibit-password 表示禁止密码但允许密钥' },
        { flag: 'PasswordAuthentication no', desc: '禁用密码认证，只允许密钥登录，务必先确认密钥可用' },
        { flag: 'AllowUsers ops deploy', desc: '只允许这些用户登录，白名单之外的一律拒绝' },
        { flag: 'PubkeyAuthentication yes', desc: '启用公钥认证，免密登录的前提' },
        { flag: 'MaxAuthTries 3', desc: '最大认证尝试次数，降低暴力破解成功率' },
        { flag: 'ClientAliveInterval 300', desc: '每 300 秒发心跳，防止空闲连接被防火墙断开' },
        { flag: 'sshd -t', desc: '语法校验，改完配置后必须执行，通过才说明配置合法' }
      ],
      examples: [
        { cmd: 'sshd -t', desc: '校验配置语法，改完 sshd_config 后必须执行的第一步' },
        { cmd: 'sshd -t -f /etc/ssh/sshd_config && systemctl reload sshd', desc: '校验通过后重载服务，reload 不断开现有连接' },
        { cmd: 'grep -Ev "^#|^$" /etc/ssh/sshd_config', desc: '过滤注释与空行，看清当前真正生效的配置项' },
        { cmd: 'ss -tulnp | grep sshd', desc: '确认 sshd 实际监听的端口，验证 Port 改动是否生效' }
      ],
      notes: [
        '**改完必须 `sshd -t` 校验语法**：配置写错再 restart，sshd 起不来就再也连不上了。校验通过再 reload',
        '**操作时务必保留一个已登录的 SSH 会话不要关闭**，用新开窗口验证新配置能登录后，再关掉旧会话',
        '用 `reload` 而不是 `restart`：reload 只重读配置不断开已有连接，restart 会踢掉所有人的会话',
        '把 `PasswordAuthentication` 改成 `no` 之前，**必须确认密钥登录已经可用**，否则会把自己彻底锁在门外，只能去云控制台走 VNC 救援',
        '改完 `Port` 要同时做三件事：放行云安全组的新端口、放行本机防火墙、确认 SELinux 允许该端口（`semanage port -a -t ssh_port_t -p tcp 2222`），漏一个就连不上',
        '部分发行版（如 Ubuntu）的服务名是 `ssh` 而不是 `sshd`，`systemctl reload ssh` 才是对的',
        '`sshd_config` 里若同时存在多个同名配置项，**以第一个出现的为准**，这与多数配置文件「后者覆盖前者」的直觉相反'
      ],
      related: ['ln-ssh', 'ln-ssh-nopass', 'ln-ssh-config-alias', 'ln-ss', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man5/sshd_config.5.html',
      tags: ['SSH加固', '服务端配置', '安全', '端口']
    },

    /* ---------- 52 / 56 · 组合记录：SSH 隧道实战 ---------- */
    /* ---------- 52 / 56 ---------- */
    {
      id: 'ln-ssh-tunnel',
      name: 'ssh -L 隧道访问内网 MySQL',
      kind: 'recipe',
      alias: ['端口转发实战', '跳板机', '内网穿透'],
      level: 3,
      syntax: 'ssh -L <本地端口>:<内网目标IP>:<目标端口> -N -f <跳板机用户>@<跳板机IP>',
      summary: '通过跳板机的 SSH 隧道访问无公网的内网数据库，无需暴露任何端口。',
      desc: '典型场景：华为云 VPC 内有一台 RDS for MySQL（只有内网地址 192.168.1.100:3306），另有一台带弹性公网 IP 的 ECS 作为跳板机。本地用 `-L` 建立隧道后，访问本机的 13306 端口就等于访问内网的 3306，Navicat、DBeaver 或 mysql 客户端都能直接用。隧道的本质是 SSH 在本地开一个监听端口，把流量加密转发到跳板机，再由跳板机以内网身份发起连接——**整个过程不需要给数据库开公网、不需要改安全组**。',
      params: [
        { flag: '-L 13306:192.168.1.100:3306', desc: '本地 13306 → 经跳板机 → 内网 192.168.1.100 的 3306' },
        { flag: '-N', desc: '不执行远程命令，只做转发，隧道场景必带' },
        { flag: '-f', desc: '认证成功后转入后台运行，把终端还给你' },
        { flag: '-o ServerAliveInterval=60', desc: '每 60 秒发心跳，防止隧道被网络设备静默断开' },
        { flag: '-o ExitOnForwardFailure=yes', desc: '转发失败就退出，避免以为隧道建好了其实没通' },
        { flag: '-i <私钥文件>', desc: '指定跳板机私钥' }
      ],
      examples: [
        { cmd: 'ssh -L 13306:192.168.1.100:3306 -N -f -o ServerAliveInterval=60 -o ExitOnForwardFailure=yes -i ~/.ssh/id_ed25519 root@203.0.113.25', desc: '建立到内网 MySQL 的隧道并转后台，本地连 127.0.0.1:13306 即可' },
        { cmd: 'mysql -h 127.0.0.1 -P 13306 -u appuser -p', desc: '通过隧道连接内网数据库，密码交互输入不写入历史' },
        { cmd: 'ss -tlnp | grep 13306', desc: '确认本地隧道端口已在监听，排查隧道没建起来的问题' }
      ],
      notes: [
        '隧道只在当前 SSH 连接存活期间有效，网络抖动或长时间空闲都会断，**务必加 `-o ServerAliveInterval=60`**；长期隧道用 `autossh` 或写 systemd 服务托管',
        '`-L` 默认只绑 `127.0.0.1`，这通常正是你要的；写成 `0.0.0.0:13306` 会把内网数据库暴露给同网段所有人，风险极高',
        '数据库账号的授权主机（Host 字段）要允许跳板机的内网 IP，否则会报 `Host is not allowed to connect`，这与隧道无关',
        '用完记得关掉隧道进程（`pkill -f "ssh -L 13306"`），长期挂着的隧道是安全隐患',
        '在云主机上排查隧道问题时，跳板机侧可用 `ss -tnp | grep 3306` 确认它是否真的连到了数据库',
        '如果跳板机自己也连不上数据库，先在跳板机上用 `nc -zv 192.168.1.100 3306` 验证，再看 RDS 安全组是否放行了跳板机所在网段'
      ],
      related: ['ln-ssh', 'ln-ssh-config-alias', 'ln-nc', 'ln-ss', 'ln-troubleshoot-port'],
      docs: 'https://man7.org/linux/man-pages/man1/ssh.1.html',
      tags: ['端口转发', '跳板机', '隧道', '实战']
    },

    /* ---------- 53 / 56 · 组合记录：端口不通排查链路 ---------- */
    /* ---------- 53 / 56 ---------- */
    {
      id: 'ln-troubleshoot-port',
      name: '端口不通完整排查链路',
      kind: 'recipe',
      alias: ['端口不通', '连不上', '排查思路', '安全组'],
      level: 3,
      syntax: 'ss -tulnp  # 1.本机是否监听  →  安全组/防火墙  # 2.是否放行  →  nc -zv  # 3.外部探测  →  tcpdump  # 4.抓包定位  →  应用日志  # 5.看服务自身',
      summary: '从本机监听到云安全组逐层排除，五步定位端口不通卡在哪一层。',
      desc: '端口不通的排查必须**按固定顺序逐层推进**，跳步就会浪费时间。五步链路：**① 本机有没有监听**（`ss -tulnp`，服务没起来后面全白搭）；**② 放行规则有没有开**（云安全组 → 本机防火墙）；**③ 从外部能不能连上**（`nc -zv` 探测）；**④ 包到底有没有到**（`tcpdump` 抓包，这是分层的铁证）；**⑤ 应用自己怎么说**（服务日志）。判断要点：`ss -tulnp` 里**没有**该端口 → 服务没起来或绑定了错误的地址；**有**监听但外部连不上 → 安全组或防火墙；`tcpdump` 里能看到 SYN 进来但服务没响应 → 应用层问题；完全抓不到包 → 被上游拦掉了。**云主机上"本机 curl localhost 通、外网不通"，九成是安全组而不是系统防火墙。**',
      params: [
        { flag: 'ss -tulnp', desc: '第一步：确认端口有没有被监听、被哪个进程监听' },
        { flag: 'ss -tlnp | grep <端口>', desc: '只看目标端口，输出为空说明服务根本没起' },
        { flag: 'nc -zv -w 3 <目标IP> <端口>', desc: '第三步：从外部探测，必须加 -w 防卡死' },
        { flag: 'firewall-cmd --list-all / iptables -L -n', desc: '第二步：确认本机防火墙放行状态' },
        { flag: 'tcpdump -i any -nn port <端口> -c 20', desc: '第四步：抓包确认请求到底有没有到网卡' },
        { flag: 'journalctl -u <服务名> -n 100', desc: '第五步：看服务自身日志，应用层报错往往在这里' },
        { flag: 'curl -v telnet://<目标IP>:<端口>', desc: '没装 nc 时的替代探测方式' }
      ],
      examples: [
        { cmd: 'ss -tulnp | grep 8080', desc: '第一步：确认 8080 有没有被监听；无输出说明服务没起来或没绑对该地址' },
        { cmd: 'firewall-cmd --query-port=8080/tcp', desc: '第二步：查本机防火墙是否放行，返回 no 就去加规则并 reload' },
        { cmd: 'nc -zv -w 3 203.0.113.25 8080', desc: '第三步：从另一台机器探测，succeeded 说明链路通，refused 说明服务没监听' },
        { cmd: 'tcpdump -i any -nn port 8080 -c 20', desc: '第四步：在服务端抓包，看 SYN 有没有到；到不了就是安全组在拦' },
        { cmd: 'journalctl -u myapp -n 100 --no-pager', desc: '第五步：看应用日志，确认是否绑定到了 127.0.0.1 而不是 0.0.0.0' }
      ],
      notes: [
        '**顺序不能乱**：先看服务是否监听，再看放行规则，最后抓包；跳过任何一步都可能得出错误结论',
        '云主机上"本机 `curl localhost` 通、外网不通"几乎一定是**安全组**问题，而不是 firewalld/iptables；华为云在控制台「访问控制 → 安全组」配置，改完立即生效无需重启 ECS',
        '服务监听在 `127.0.0.1:8080` 时只能本机访问，必须绑 `0.0.0.0` 才能被外部连接；这是配置问题，不是防火墙问题',
        '`nc -zv` 报 **Connection refused** 说明包到了、但没人监听（服务没起或端口写错）；报 **timed out** 说明包被丢弃（安全组/防火墙在用 DROP）；两者排查方向完全不同',
        '`tcpdump` 抓到 SYN 但看不到 SYN-ACK，说明本机收下了却没回，方向转到本机防火墙与服务；完全抓不到 SYN，说明问题在到达本机之前（安全组、VPC 路由、对端网络）',
        '安全组是有状态的，入方向放行后响应流量自动放行；但如果服务要主动外联（如连数据库、调第三方接口），还必须配出方向规则',
        '排查完记得回收临时放行的规则，尤其是为了测试开的 `0.0.0.0/0` 全放行'
      ],
      related: ['ln-ss', 'ln-nc', 'ln-tcpdump', 'ln-firewall-cmd', 'ln-iptables', 'ln-troubleshoot-firewall', 'ln-troubleshoot-connect-refused', 'ln-troubleshoot-dns'],
      docs: 'https://man7.org/linux/man-pages/man8/ss.8.html',
      tags: ['端口不通', '排查链路', '安全组', '实战']
    },

    /* ---------- 54 / 56 · 组合记录：DNS 排查链路 ---------- */
    /* ---------- 54 / 56 ---------- */
    {
      id: 'ln-troubleshoot-dns',
      name: '域名解析排查链路',
      kind: 'recipe',
      alias: ['DNS 排查', '解析不了', '域名不通'],
      level: 3,
      syntax: 'dig  # 1.验证解析  →  /etc/resolv.conf  # 2.查DNS配置  →  /etc/hosts  # 3.查本地映射  →  nsswitch.conf  # 4.查解析顺序',
      summary: '按解析链路四步定位域名解析失败或解析到错误地址的问题。',
      desc: '解析异常的排查顺序对应 Linux 真实的解析流程：应用程序调用 `getaddrinfo` → 按 `/etc/nsswitch.conf` 的 `hosts:` 行决定先查什么 → 通常是先查 `/etc/hosts` → 再按 `/etc/resolv.conf` 里的 `nameserver` 发 DNS 查询。所以四步是：**① 用 `dig` 确认 DNS 本身能不能解析**、**② 看 `/etc/resolv.conf` 用的是哪个 DNS**、**③ 看 `/etc/hosts` 有没有被写死映射**、**④ 用 `getent hosts` 验证按 nsswitch 顺序的真实结果**。关键判断：`dig` 能解析但应用解析不了 → 问题在 hosts 或 nsswitch；`dig @8.8.8.8` 能解析但本机 DNS 不行 → 本机配置的 DNS 有问题；`+trace` 在某级 NS 断掉 → 域名委派配置错误。',
      params: [
        { flag: 'dig <域名> +short', desc: '第一步：确认 DNS 能否解析，最简输出' },
        { flag: 'dig @<DNS服务器> <域名>', desc: '指定公共 DNS 对比，区分本地 DNS 与域名本身的问题' },
        { flag: 'cat /etc/resolv.conf', desc: '第二步：看本机在用哪个 DNS、有没有配 search 搜索域' },
        { flag: 'cat /etc/hosts', desc: '第三步：看有没有被写死的静态映射' },
        { flag: 'getent hosts <域名>', desc: '第四步：按 nsswitch 的真实顺序解析，结果与 dig 不一致时就查这里' },
        { flag: 'grep ^hosts /etc/nsswitch.conf', desc: '确认 hosts 与 dns 的先后顺序' },
        { flag: 'dig +trace <域名>', desc: '逐级追踪委派链路，定位是哪一级 NS 出错' }
      ],
      examples: [
        { cmd: 'dig +short www.example.com', desc: '第一步：确认 DNS 能否解析；有输出说明 DNS 链路正常，问题在别处' },
        { cmd: 'dig @8.8.8.8 www.example.com', desc: '换公共 DNS 查询做对比，能解析说明本机配置的 DNS 有问题' },
        { cmd: 'cat /etc/resolv.conf && grep ^hosts /etc/nsswitch.conf', desc: '第二、四步：一起看 DNS 配置与解析顺序' },
        { cmd: 'getent hosts db.internal', desc: '按系统真实顺序解析，与 dig 结果不一致时优先看 /etc/hosts' },
        { cmd: 'dig +trace www.example.com', desc: '从根域逐级追踪，精确定位是哪一级 NS 配置错误' }
      ],
      notes: [
        '**`dig`、`nslookup`、`host` 只查 DNS，不读 `/etc/hosts`**；而 `ping`、`curl`、`getent` 走 nsswitch 顺序会先读 hosts。解析结果不一致时，先确认自己用的是哪一类工具',
        '`dig` 返回 `NXDOMAIN` 是域名不存在，`SERVFAIL` 是上游查询失败（常被 DNS 劫持或上游挂了），`REFUSED` 是该 DNS 拒绝服务，三种错误处理方式完全不同',
        '云主机上 `/etc/resolv.conf` 常被 DHCP 自动改写，手工改的 DNS 重启就丢；要持久化得改网卡配置或 NetworkManager 的 `ipv4.dns`',
        'Ubuntu 18.04+ / CentOS 8+ 由 `systemd-resolved` 接管时，`/etc/resolv.conf` 只是软链接，直接编辑无效，要用 `resolvectl status` 查看真实配置',
        '`options timeout` 设置过大会让每次解析失败都卡 5 秒以上，接口整体变慢却看不出原因，内网可调成 1~2 秒',
        '`nsswitch.conf` 的 `hosts:` 行如果漏了 `files`，hosts 文件会完全失效，属于高危配置错误',
        '排查完别忘了确认 TTL：改了 DNS 记录后没生效，很可能是上游缓存还没过期，不是配置没生效'
      ],
      related: ['ln-dig', 'ln-nslookup', 'ln-host', 'ln-resolv-conf', 'ln-hosts-file', 'ln-troubleshoot-port'],
      docs: 'https://bind9.readthedocs.io/en/latest/manpages.html',
      tags: ['DNS', '解析失败', '排查链路', '实战']
    },

    /* ---------- 55 / 56 · 组合记录：网络慢排查链路 ---------- */
    /* ---------- 55 / 56 ---------- */
    {
      id: 'ln-troubleshoot-slow',
      name: '网络慢排查链路',
      kind: 'recipe',
      alias: ['网络慢', '丢包', 'MTU 问题', '延迟高'],
      level: 3,
      syntax: 'mtr -r -c 100  # 1.定位丢包跳  →  ping -M do  # 2.测路径MTU  →  ethtool  # 3.看网卡协商  →  ip -s link  # 4.看丢包计数',
      summary: '四步区分网络慢是链路丢包、MTU 塌陷、网卡协商还是本机丢包。',
      desc: '"网络慢"是个模糊现象，必须先拆成四类原因：**链路丢包/延迟高**（用 `mtr` 定位是哪一跳开始劣化）、**路径 MTU 塌陷**（小包通大包不通，用 `ping -M do` 二分探测）、**网卡协商降级**（物理机上网卡跑成了百兆或半双工，用 `ethtool` 看）、**本机丢包**（网卡缓冲区不足或超出带宽规格，用 `ip -s link` 看 dropped 计数）。判读铁律：`mtr` 里**中间跳丢包但后续跳不丢**是那台路由器限制 ICMP，不是故障；**从某跳起后续所有跳都丢同样比例**，那一跳才是故障起点。',
      params: [
        { flag: 'mtr -r -c 100 <目标IP>', desc: '第一步：生成链路报告定位丢包起点，报障的核心证据' },
        { flag: 'ping -M do -s 1472 -c 3 <目标IP>', desc: '第二步：探测路径 MTU，1472+28=1500 能通即链路 MTU 正常' },
        { flag: 'ethtool <网卡名>', desc: '第三步：看协商速率与双工，物理机上重点看 Speed 与 Duplex' },
        { flag: 'ip -s link show <网卡名>', desc: '第四步：看网卡的 errors 与 dropped 计数是否持续增长' },
        { flag: 'ethtool -S <网卡名>', desc: '第四步补充：看驱动级丢包计数，比 ip -s link 更细' },
        { flag: 'curl -w "%{time_namelookup} %{time_connect} %{time_starttransfer} %{time_total}"', desc: '应用层验证：把耗时拆开，区分 DNS、建连、服务端处理与传输' },
        { flag: 'iftop -i <网卡名> -n -P', desc: '看当前哪条连接在占带宽，排除被大流量挤占' }
      ],
      examples: [
        { cmd: 'mtr -r -c 100 8.8.8.8', desc: '第一步：100 个样本的链路报告，看从哪一跳开始丢包' },
        { cmd: 'ping -M do -s 1472 -c 3 192.168.1.10', desc: '第二步：探测 MTU，报 "Frag needed" 说明链路 MTU 小于 1500' },
        { cmd: 'ethtool eth0 | grep -E "Speed|Duplex"', desc: '第三步：看协商速率，物理机显示 100Mb/s 说明协商降级了' },
        { cmd: 'ip -s link show eth0', desc: '第四步：看丢包计数；隔一分钟再跑一次对比增量才有意义' },
        { cmd: 'curl -o /dev/null -s -w "DNS:%{time_namelookup} 连接:%{time_connect} 首字节:%{time_starttransfer} 总计:%{time_total}\\n" https://api.example.com/health', desc: '把慢拆到具体阶段，判断该查网络还是查应用' }
      ],
      notes: [
        '`mtr` 报告**必须给足样本**，`-c 100` 起步；只发 10 个包得出的丢包率毫无参考价值',
        '判读 `mtr` 的铁律：中间某跳丢包但后续跳不丢 = 那台路由器限制 ICMP，属正常；从某跳起后续全部同比例丢 = 该跳是故障起点',
        'MTU 探测时 `-s` 是 ICMP 载荷大小，实际 IP 包要加 28 字节（20 IP 头 + 8 ICMP 头），所以 1472 对应 1500；从 1472 往下二分才能找到真实 MTU',
        'MTU 问题的典型症状是「能 ping 通、能建 TCP 连接，但一传大数据就卡死」——握手包小能过，大包被丢弃，常见于 VPN、隧道和跨云专线场景',
        '云主机上 `ethtool` 看到的是 virtio 虚拟网卡，速率显示 10000Mb/s 且 `Speed: Unknown!` 属正常，真实带宽上限由 ECS 规格与弹性公网 IP 带宽决定',
        '`ip -s link` 的计数是开机以来的累计值，**必须取两次相减**才能判断是否在持续丢包',
        '网络慢也可能是应用自己慢：`time_starttransfer` 减去 `time_appconnect` 就是服务端处理耗时，这段大就跟网络无关',
        '排除法很重要：先确认是不是被别的进程占满带宽（`iftop` / `nethogs`），再怀疑链路'
      ],
      related: ['ln-mtr', 'ln-ping', 'ln-traceroute', 'ln-ethtool', 'ln-ip-stats', 'ln-curl-timing', 'ln-iftop', 'ln-nethogs'],
      docs: 'https://www.bitwizard.nl/mtr/',
      tags: ['网络慢', '丢包', 'MTU', '排查链路']
    },

    /* ---------- 56 / 56 · 组合记录：拒绝连接 vs 超时 ---------- */
    /* ---------- 56 / 56 ---------- */
    {
      id: 'ln-troubleshoot-connect-refused',
      name: 'Connection refused 与 timed out 的区别',
      kind: 'recipe',
      alias: ['Connection refused', 'Connection timed out', '连接被拒绝', '面试高频'],
      level: 3,
      syntax: 'nc -zv <目标IP> <端口>   # 报 refused 说明端口没监听；报 timed out 说明包被丢弃',
      summary: '两个报错含义完全相反：拒绝是服务没起，超时是被防火墙拦，方向别查反。',
      desc: '这两个报错是网络排障的分水岭，面试也高频。**`Connection refused`**：TCP 收到了对端的 **RST** 响应，说明包**成功到达了目标主机**，但那个端口上没有进程监听——问题在**服务端自己**（服务没起、崩了、端口配错、只绑了 127.0.0.1）。**`Connection timed out`**：SYN 发出去**没有任何响应**，包被中途静默丢弃（DROP），问题在**路径上的拦截者**——云安全组、本机防火墙的 DROP 规则、VPC 路由缺失、对端主机不存在。一句话记忆：**refused 是有人告诉你"这儿没服务"，timed out 是根本没人理你。**',
      params: [
        { flag: 'nc -zv -w 3 <目标IP> <端口>', desc: '探测端口并区分两种报错，必须加 -w 否则超时场景会一直挂着' },
        { flag: 'ss -tulnp | grep <端口>', desc: 'refused 时在服务端执行：确认服务到底有没有监听' },
        { flag: 'ss -tlnp | grep <端口>', desc: '注意看绑定地址：127.0.0.1:8080 与 0.0.0.0:8080 对外表现完全不同' },
        { flag: 'tcpdump -i any -nn port <端口>', desc: 'timed out 时在服务端抓包：完全抓不到 SYN 就是被上游拦了' },
        { flag: 'iptables -L -n -v', desc: '检查本机是否有 DROP 规则；DROP 造成 timed out，REJECT 造成 refused' },
        { flag: 'firewall-cmd --list-all', desc: 'CentOS 7+ 上检查 firewalld 放行状态' },
        { flag: 'journalctl -u <服务名> -n 100', desc: 'refused 且确认端口没监听时，看服务为什么没起来' }
      ],
      examples: [
        { cmd: 'nc -zv -w 3 192.168.1.10 3306', desc: '一步区分：succeeded 通、refused 服务没起、timed out 被拦' },
        { cmd: 'ss -tulnp | grep 3306', desc: 'refused 方向：在服务端确认 MySQL 到底有没有监听 3306' },
        { cmd: 'tcpdump -i any -nn port 3306 -c 20', desc: 'timed out 方向：抓不到 SYN 说明包被安全组或防火墙丢了' },
        { cmd: 'iptables -L INPUT -n -v --line-numbers', desc: '检查是否有 DROP 规则在拦；DROP 表现为超时，REJECT 表现为拒绝' }
      ],
      notes: [
        '**记忆口诀**：refused = 包到了、没人接（服务端问题）；timed out = 包没到、没人理（防火墙/安全组问题）。方向查反会浪费大量时间',
        '`Connection refused` 在云主机上还要多想一层：服务可能只监听了 `127.0.0.1`，此时本机 `curl localhost` 通、从外面连就是 refused，改绑 `0.0.0.0` 即可',
        '`Connection timed out` 优先查云安全组（华为云在控制台「访问控制 → 安全组」），其次查 VPC 路由，最后才是本机防火墙',
        '`iptables -j DROP` 造成 timed out，`-j REJECT` 造成 refused；知道这个区别就能从报错反推拦截方式',
        '抓包是终极裁判：服务端抓不到 SYN → 上游拦；抓到 SYN 没回 SYN-ACK → 本机防火墙或服务没监听；抓到 SYN 回了 RST → 端口没监听（refused）',
        '还有第三种常见报错 `No route to host`，那是路由缺失或 ARP 解析失败，与上面两个又不同，对应 `ip route` 与 `ip neigh` 排查',
        '排完记得回收为测试临时放行的安全组规则，避免长期敞开'
      ],
      related: ['ln-nc', 'ln-ss', 'ln-tcpdump', 'ln-firewall-cmd', 'ln-iptables', 'ln-troubleshoot-port', 'ln-telnet'],
      docs: 'https://man.openbsd.org/nc.1',
      tags: ['连接被拒绝', '超时', '面试高频', '排障']
    }

    /* 后续命令同样追加在这里，用逗号分隔 */
  );
})();
