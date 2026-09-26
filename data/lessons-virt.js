/* data/lessons-virt.js · 虚拟化与镜像（练习课）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。每节课的 steps[].cmd 必须是**引擎真能跑通**的
   命令（tools/shell-check.js 会把每节课的 answer/alt 逐条执行验证），
   每步都要有 ref（回指命令手册条目 id）与两级 hint。

   剧情基座（与 assets/js/cmd-virt.js 的模拟状态一致）：
     宿主机 5 台虚机：web-prod-01 / db-prod-01（running）、db-test-01（shut off）、
     win-test-01（paused）、legacy-erp（crashed）。
     镜像在 /data/vmstore（web-prod-01、web-prod-02、db.qcow2、vm-03 差分盘、
     broken-vm 损坏盘…）与 /data/images（rocky9-base 等基础镜像）。
     default 虚拟网络初始是 inactive 且没设 autostart —— 这正是第 4 节课的现场。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

      {
        id: 'kvm-host-handover',
        cat: 'kvm',
        title: '接手一台虚拟化宿主机，先看清上面有哪些虚机',
        prompt: '同事把一台 KVM 宿主机交给你，只丢下一句「上面跑着几台业务虚机」，没留文档也没留清单。你要在动手之前先把这台机器的家底盘清楚。',
        task: '列出全部虚机（含已关机），逐台确认状态、自启设置与用途',
        steps: [
          { title: '先把盘子摸清', about: '连关机的也一起列出来，状态列才是重点', cmd: 'virsh list --all', ref: 'vm-virsh-list', hint: ['只列运行中的会漏掉一半信息 —— 交接时你最需要知道的是「哪些本该在跑却没跑」', 'virsh list ____'], note: '5 台：running 2 台，剩下 3 台分别是 shut off / paused / crashed —— 后三种状态才是你要追的' },
          { title: '给那台关着机的定性', about: '看它的资源配置与自启登记', cmd: 'virsh dominfo db-test-01', ref: 'vm-virsh-dominfo', hint: ['关着机不代表不用管：内存给了多少、有没有登记自启，才是判断它「该不该自己起来」的依据', 'virsh dominfo ____'], note: 'State 是 shut off，Autostart 却是 enable —— 这台是「设了自启却没起来」的第一号怀疑对象' },
          { title: '找出所有没登记自启的', about: '宿主重启后，没登记的都不会自己回来', cmd: 'virsh list --no-autostart --all', ref: 'vm-virsh-autostart', hint: ['宿主重启后谁不会自己回来，取决于一项登记记录 —— 换个过滤条件，把没有这项登记的挑出来', 'virsh list ____ --all'], note: 'win-test-01 与 legacy-erp 都没有登记自启 —— 宿主机一重启，这两台不会自己回来' },
          { title: '确认每台分别是什么业务', about: '标题列会写清用途，避免误停生产', cmd: 'virsh list --all --title', ref: 'vm-virsh-list', hint: ['名字叫 web-prod-01 还是 legacy-erp，不足以判断该不该动它；把每台自己登记的用途说明一并带出来', 'virsh list --all ____'], note: '标题写明：web-prod-01 / db-prod-01 是生产，win-test-01 与 legacy-erp 是待处置的历史系统' }
        ],
        answer: 'virsh list --all && virsh dominfo db-test-01',
        alt: [
          'virsh list --all && virsh list --no-autostart --all',
          'virsh list --all --title'
        ],
        expect: /db-test-01/,
        teach: '**接手一台虚拟化宿主机的固定顺序**：① `virsh list --all` 看清盘子 —— 只看运行中的会漏掉一半信息；② 对状态异常的那一台 `virsh dominfo <域名>` 看内存、CPU 与自启设置；③ `virsh list --no-autostart --all` 找出「宿主重启后不会自己回来」的机器；④ `virsh list --all --title` 用标题确认哪台是生产、哪台是可以动的历史系统。\n\n交接现场真正值得警惕的不是「哪台在跑」，而是三个异常状态：`shut off`（本该在跑却没跑）、`paused`（有人手动暂停过）、`crashed`（自己崩了）。它们背后往往都对应着一次没被记录的事故。另外记住 `Id` 列只是运行期编号，**关机就消失，脚本里一律用名称或 UUID**。'
      },

      {
        id: 'kvm-image-inventory',
        cat: 'kvm',
        title: '镜像盘告警了，先把每一张 qcow2 的账算清楚',
        prompt: '运维群里又贴出容量告警：数据盘 /data 只剩 1.2G。有人提议「删几个不用的镜像」，可没人说得清哪些盘是谁在用、哪张能删。',
        task: '盘清镜像目录的清单，看清每张盘的真实占用、依赖关系与归属虚机',
        steps: [
          { title: '先看目录里有什么', about: '每个文件的名字、大小、属主与改动时间', cmd: 'ls -lh /data/vmstore/', ref: 'vm-img-info', hint: ['别急着删：先把目录里每个文件的名字、大小、属主与改动时间看全，后面才谈得上取舍', 'ls -lh ____'], note: '88.0G 的 db.qcow2 一张就吃掉整块盘的四成 —— 但文件大小不等于容量账，下一步才算得清' },
          { title: '给最大那张盘算账', about: '分清虚机看到的容量与真实占用', cmd: 'qemu-img info /data/vmstore/db.qcow2', ref: 'vm-img-info', hint: ['目录里最大的那张盘要单独算账：虚机看到的容量和宿主上真实占了多少，这两个数不是一回事', 'qemu-img info ____'], note: 'virtual size 200 GiB、disk size 88 GiB —— 容量规划按前者算，空间回收看后者，稀疏盘天生就差这么多' },
          { title: '那张 320M 的小盘是什么', about: '看清差分盘背后的依赖链', cmd: 'qemu-img info --backing-chain /data/vmstore/vm-03.qcow2', ref: 'vm-img-info', hint: ['有一张只有三百多兆，明显不是独立系统盘；要看清它背后还压着谁，得把整条依赖链一次拉出来', 'qemu-img info ____ /data/vmstore/vm-03.qcow2'], note: '它只存与基础镜像的差异，真正的内容在 /data/base/rocky9-base.qcow2 —— 基础镜像一丢，这条链上所有虚机都起不来' },
          { title: '这块盘挂在谁身上', about: '这块盘到底挂在哪台虚机上', cmd: 'virsh domblklist web-prod-01 --details', ref: 'vm-virsh-dominfo', hint: ['删之前必须知道谁在用：磁盘文件与设备的对应关系要从虚机定义里读，不能靠文件名猜', 'virsh domblklist ____ --details'], note: 'web-prod-01 的盘在 /data/vmstore/web-prod-01.qcow2；上面那张 88G 的 db.qcow2 在定义里查不到归属，是典型的孤儿盘' },
          { title: '别忘了默认存储池', about: '默认池里还有哪些卷，别漏掉', cmd: 'virsh vol-list default', ref: 'vm-virsh-pool', hint: ['盘不一定只堆在一个目录里：自己建的池之外，系统默认池也要一并列出，否则会漏掉一半', 'virsh vol-list ____'], note: '默认池 /var/lib/libvirt/images 里还躺着 4 块盘（含 80G 的 win-test-01）—— 真正的盘点要把两处都过一遍' }
        ],
        answer: 'ls -lh /data/vmstore/ && qemu-img info /data/vmstore/db.qcow2',
        alt: [
          'qemu-img info /data/vmstore/db.qcow2',
          'qemu-img info --output=json /data/vmstore/db.qcow2'
        ],
        expect: /virtual[- ]size/,
        teach: '**容量盘点不能 `ls` 一把梭**。一张 qcow2 有两个数：`virtual size`（虚机看到的容量，容量规划按它算）和 `disk size`（宿主上真实占用，稀疏盘会小很多），两者差得越多说明盘越「空」。\n\n删盘之前必须回答两个问题：**它挂在谁身上**（`virsh domblklist <域名> --details` 从 libvirt 定义里读，不能靠文件名猜）、**有没有别的盘依赖它**（`qemu-img info --backing-chain` 把整条差分链拉出来）。上面那张 88G 的 `db.qcow2` 在定义里查不到归属，是典型的孤儿盘 —— 但「孤儿」只说明它没挂给虚机，删之前还要确认没有备份、克隆或迁移流程在用它。\n\n还要记住盘不一定只堆在一个目录：`virsh vol-list default` 里还躺着默认存储池（在系统盘上）的几块盘。真正的盘点要把数据盘与默认池两处都过一遍，才不会「删了半天空间没释放」。'
      },

      {
        id: 'kvm-vm-down',
        cat: 'kvm',
        title: '压测环境连不上，先确认那台虚机到底在不在跑',
        prompt: '测试同事说连不上压测库，只给了一个名字 db-test-01。你没有数据库权限，只能先从宿主机这一层往下查。',
        task: '确认 db-test-01 的状态与配置，把它启动起来，并确认它的网卡挂在哪个网络上',
        steps: [
          { title: '先分清是哪种连不上', about: '分清「压根没跑」与「跑了但网络不通」', cmd: 'virsh list --all', ref: 'vm-virsh-list', hint: ['连不上不等于机器坏了：先分清它压根没跑、还是跑了但网络不通，一份带状态的清单就能分开这两种情况', 'virsh list ____'], note: 'db-test-01 是 shut off —— 不是网络问题，它压根没在跑，往下的排查方向完全变了' },
          { title: '看它的配置与自启登记', about: '看它的资源配置与自启登记', cmd: 'virsh dominfo db-test-01', ref: 'vm-virsh-dominfo', hint: ['状态只是结论：还得看它的内存、CPU 与自启登记，才知道这台「本该自己起来」的机器为什么没起来', 'virsh dominfo ____'], note: 'Autostart 是 enable：这台机器本该随宿主启动，却没起来 —— 说明中间发生过一次非正常关机' },
          { title: '把它拉起来', about: '把电源键按下去，先止血', cmd: 'virsh start db-test-01', ref: 'vm-virsh-start', hint: ['确认了它确实没在跑，就把电源键按下去；这一步只是「发起」，成没成要另找依据', 'virsh ____ db-test-01'], note: '真机上这条命令会拉起一个 qemu-system-x86_64 进程，返回只代表「已发起」，不代表客户机已经可用' },
          { title: '确认它真的起来了', about: '再问一次，看到目标状态才算数', cmd: 'virsh domstate db-test-01', ref: 'vm-virsh-start', hint: ['上一步只负责发起，这一步才是结果：再问一次状态，看到目标值才算这台机器真的回来了', 'virsh domstate ____'], note: 'running —— 到这里「机器没跑」这一层才算排除掉，可以往网络与服务层继续查了' },
          { title: '看它的网卡挂在哪', about: '网卡接在哪个网络或网桥上', cmd: 'virsh domiflist db-test-01', ref: 'vm-virsh-dominfo', hint: ['机器起来了业务还是不通，就往下看网络层：网卡接在哪个桥上，决定了它能不能拿到同网段地址', 'virsh domiflist ____'], note: 'vnet2 挂在 default 这个 NAT 网络（virbr0，192.168.122.0/24）上 —— 下一节课就从这个网络出错开始' }
        ],
        answer: 'virsh domstate db-test-01 && virsh start db-test-01 && virsh domstate db-test-01',
        alt: [
          'virsh start db-test-01 && virsh domstate db-test-01',
          'virsh dominfo db-test-01 && virsh start db-test-01'
        ],
        expect: /Domain 'db-test-01' started/,
        teach: '**「连不上」要先分层**：机器没跑、跑了但网络不通、网络通了但服务没起 —— 从宿主机往下查，比从应用往上猜快得多。宿主机这一层的顺序固定为：`virsh list --all` 看它在不在 → `virsh dominfo <域名>` 看配置与自启 → `virsh start <域名>` 拉起来 → `virsh domstate <域名>` 确认结果 → `virsh domiflist <域名>` 看网卡挂在哪个网络上。\n\n两个最容易踩的点：**`virsh start` 只是「发起」**，脚本里不能假设它返回就等于起来了，必须用 `virsh domstate` 轮询确认；**`shut off` 配上 `Autostart: enable`** 是一个强烈的信号 —— 这台机器本该自己起来却没起来，说明上一次关机不正常，值得单独追一次事故记录。'
      },

      {
        id: 'kvm-net-autostart',
        cat: 'kvm',
        title: '宿主重启后虚机起不来，报的却是「网络不存在」',
        prompt: '周末机房做了电力检修。宿主机重启后同事来报：虚机起不来，日志里写着 network default is not active。你确认过，虚机的定义都还在。',
        task: '查清虚拟网络的状态与自启设置，把它恢复并登记为开机自启',
        steps: [
          { title: '先确认虚机定义还在', about: '先排除虚机定义丢失这一整类猜测', cmd: 'virsh list --all', ref: 'vm-virsh-list', hint: ['报错指向网络，但先别顺着错误往下走：确认虚机的定义还完整在册，能排除「配置丢了」这一整类猜测', 'virsh list ____'], note: '5 台虚机定义一台不少 —— 问题不在虚机本身，而是在它依赖的资源上' },
          { title: '看网络的状态与自启', about: '看它的状态列与自启列', cmd: 'virsh net-list --all', ref: 'vm-virsh-network', hint: ['虚机没事就往它依赖的资源上查：网络的状态列与自启列只要都是否，重启后它一定起不来', 'virsh net-list ____'], note: 'default 是 inactive 且 Autostart=no —— 两个「否」凑在一起，正好解释了这条报错' },
          { title: '看网络配置本身', about: '确认网段、网桥与转发模式没被改过', cmd: 'virsh net-dumpxml default', ref: 'vm-virsh-network', hint: ['确认网段、网桥名与转发模式没被人动过；配置本身没变，问题就只是「没被激活」这一件事', 'virsh net-dumpxml ____'], note: '网段 192.168.122.0/24、网桥 virbr0、NAT 转发都在 —— 配置没被动过，可以放心地只做激活' },
          { title: '先把网络拉起来止血', about: '先临时拉起来止血', cmd: 'virsh net-start default', ref: 'vm-virsh-network', hint: ['先把它拉起来只是止血；宿主下次重启还会掉，所以这一条必须再配一条「登记」才算真修完', 'virsh net-start ____'], note: 'Network default started —— 现在虚机能起来了，但下次检修还会重演，所以还没做完' },
          { title: '登记成随宿主启动', about: '让它在下次重启时自己回来', cmd: 'virsh net-autostart default', ref: 'vm-virsh-autostart', hint: ['让故障不再复发的动作：把这份资源登记成随宿主启动，否则下次检修你还得再来一遍', 'virsh net-____ default'], note: 'marked as autostarted —— 这一步才是真正的修复，上一步只是止血' },
          { title: '确认虚机真拿到地址', about: '确认虚机的网卡真的领到了地址', cmd: 'virsh net-dhcp-leases default', ref: 'vm-virsh-network', hint: ['网络活了不等于虚机就有地址：翻一眼租约表，确认这台机器的网卡真的领到了 IP 才算闭环', 'virsh net-dhcp-____ default'], note: 'web-prod-01 / db-test-01 / win-test-01 各有一条租约 —— 网络这一层通了，可以回虚机里继续查服务' }
        ],
        answer: 'virsh net-list --all && virsh net-start default && virsh net-autostart default',
        alt: [
          'virsh net-start default && virsh net-autostart default',
          'virsh net-start default && virsh net-autostart default && virsh net-list --all'
        ],
        expect: /Network default marked as autostarted/,
        teach: '**libvirt 的虚拟网络不是「定义了就能用」**：它有自己的 active 状态和 autostart 登记。宿主重启后，没登记自启的网络会停在 inactive，靠它联网的虚机启动时直接报 `network default is not active` —— 这几乎是每个 KVM 运维都会遇到一次的故障。\n\n修复只有两步，但**两步缺一不可**：`virsh net-start default` 是止血（本次可用），`virsh net-autostart default` 才是修复（下次不再犯）。只做前者，下次检修你还得再来一遍。\n\n更完整的自启清单是四件事：虚机 `virsh autostart <域名>`、虚拟网络 `virsh net-autostart <网络>`、存储池 `virsh pool-autostart <池>`、以及宿主上的 `systemctl is-enabled libvirtd`。四件里任何一件没做，重启后都可能出现「虚机起来了但没网」或者「根本找不到磁盘」。最后用 `virsh net-dhcp-leases default` 确认虚机真的拿到了地址，这一层才算闭环。'
      },

      {
        id: 'kvm-provision-web02',
        cat: 'kvm',
        title: '新加一台 Web 前端：先核素材，再一条命令定义出来',
        prompt: '要加一台 web-prod-02 接生产流量。运维规范是不跑安装 ISO，直接用 cloud 基础镜像导入，首次配置交给初始化盘完成。动手之前先把素材核一遍。',
        task: '核对基础镜像与初始化盘，用一条命令把 web-prod-02 定义并启动，最后回读它的磁盘挂载',
        steps: [
          { title: '先核基础镜像', about: '确认格式与容量，别拿扩展名当格式', cmd: 'qemu-img info /data/images/rocky9-base.qcow2', ref: 'vm-img-info', hint: ['动手前先核素材：格式是稀疏盘还是裸盘、虚机看到的容量多大、实际占了多少，这三项决定后面怎么用', 'qemu-img info ____'], note: 'qcow2、10 GiB、实际占 700 MiB —— 基础镜像就该是这种「声明大、占用小」的稀疏模板盘' },
          { title: '确认它还是干净模板', about: '读一眼里面的主机名，确认它是干净模板', cmd: 'guestfish --ro -a /data/images/rocky9-base.qcow2 -i cat /etc/hostname', ref: 'vm-img-guestfish', hint: ['模板机得是一张没被配置过的干净底片：不启动它也能读出里面的主机名，一眼就能验证这一点', 'guestfish --ro -a /data/images/rocky9-base.qcow2 -i ____'], note: 'output 是 localhost.localdomain —— 干净的底片；如果这里已经是某台在跑的机器名，说明这张「基础镜像」被人用过' },
          { title: '核初始化盘', about: '确认这块初始化小盘存在且格式正确', cmd: 'qemu-img info /data/vmstore/web-prod-02-seed.img', ref: 'vm-cloud-localds', hint: ['本地没有云平台那种元数据服务，初始化数据得靠一块小盘递进去；先确认它确实在、格式对不对', 'qemu-img info /data/vmstore/____'], note: 'raw 格式、360 KiB —— 它由 cloud-localds 打出，卷标必须是 cidata（大小写敏感），标错会报 Did not find any datasource 然后静默跳过全部初始化' },
          { title: '定义并启动它', about: '把两块盘挂好，用导入方式定义并启动', cmd: 'virt-install --name web-prod-02 --memory 4096 --vcpus 2 --disk path=/data/vmstore/web-prod-02.qcow2,format=qcow2,bus=virtio --disk path=/data/vmstore/web-prod-02-seed.img,device=cdrom --import --osinfo rocky9 --network network=default,model=virtio --noautoconsole', ref: 'vm-img-virt-install', hint: ['素材齐了：磁盘位给系统盘、光驱位给初始化盘，再告诉它不要再跑安装程序，直接引导这张盘', 'virt-install --name web-prod-02 --memory 4096 --vcpus 2 --disk path=/data/vmstore/web-prod-02.qcow2,format=qcow2,bus=virtio --disk path=/data/vmstore/web-prod-02-seed.img,device=cdrom ____ --osinfo rocky9 --network network=default,model=virtio --noautoconsole'], note: 'bus=virtio 与 model=virtio 是性能关键；--noautoconsole 让脚本不挂在控制台上；--osinfo 不写会退化到很差的默认配置' },
          { title: '回读它的资源', about: '核对内存与 CPU 是不是你要的数', cmd: 'virsh dominfo web-prod-02', ref: 'vm-virsh-dominfo', hint: ['命令返回「完成」只代表定义写进去了：回 libvirt 里核对内存与 CPU 是不是你要的那两个数', 'virsh ____ web-prod-02'], note: 'Used memory 4194304 KiB = 4 GiB、CPU(s) 2 —— 与命令行给的一致，定义这一步才算真的成功' },
          { title: '回读它的磁盘', about: '系统盘与初始化盘都要在', cmd: 'virsh domblklist web-prod-02 --details', ref: 'vm-virsh-dominfo', hint: ['两块盘一块都不能少：系统盘决定它能不能起来，初始化盘决定它的主机名与公钥对不对', 'virsh domblklist web-prod-02 ____'], note: 'vda 是系统盘、sda 是 cdrom 位的初始化盘 —— seed 盘真的挂上了，cloud-init 才拿得到数据' }
        ],
        answer: 'virt-install --name web-prod-02 --memory 4096 --vcpus 2 --disk path=/data/vmstore/web-prod-02.qcow2,format=qcow2,bus=virtio --disk path=/data/vmstore/web-prod-02-seed.img,device=cdrom --import --osinfo rocky9 --network network=default,model=virtio --noautoconsole',
        alt: [
          'virt-install --name web-prod-02 --memory 4096 --vcpus 2 --disk path=/data/vmstore/web-prod-02.qcow2,format=qcow2,bus=virtio --disk path=/data/vmstore/web-prod-02-seed.img,device=cdrom --import --osinfo rocky9 --noautoconsole',
          'virt-install --name web-prod-02 --memory 4096 --vcpus 2 --disk path=/data/vmstore/web-prod-02.qcow2,format=qcow2,bus=virtio --disk path=/data/vmstore/web-prod-02-seed.img,device=cdrom --import --osinfo rocky9 --graphics none --noautoconsole'
        ],
        expect: /Domain creation completed/,
        teach: '**cloud 镜像 + cloud-init 是现在部署虚机的标准姿势**，比跑一遍安装程序快一个数量级。它由三块拼起来：① 基础镜像（`rocky9-base.qcow2`，干净的模板底片，主机名还是 `localhost.localdomain`）；② 一块 seed 盘（`cloud-localds` 打出来的 `cidata` 小盘，装着 user-data 与 meta-data）；③ `virt-install --import` 把两者挂上并直接引导。\n\n三个决定成败的参数：**`--import`** 跳过安装程序（不加它 virt-install 会去找安装源，直接报错）；**`--disk ...,device=cdrom`** 把 seed 盘放到光驱位（cloud-init 按卷标 `cidata` 找它，卷标大小写敏感，标错了就静默跳过所有初始化）；**`--noautoconsole`** 让命令不挂在控制台上（不加它脚本会假死）。\n\n`--osinfo rocky9` 也别省：不写会退化到「未知系统」的保守配置，virtio 优化拿不到，磁盘与网络性能差一大截。定义完一定要回读：`virsh dominfo` 看内存与 CPU、`virsh domblklist --details` 看两块盘是不是都在。**前面的命令返回成功，不等于定义出来的东西就是你要的。**'
      },

      {
        id: 'kvm-offline-rescue',
        cat: 'kvm',
        title: '虚机起不来又不敢反复重启，先离线把镜像查清楚',
        prompt: '一台虚机一启动就报磁盘错误，怀疑镜像坏了。业务还在等，可你不敢反复试启动 —— 每失败一次，镜像的元数据可能就更乱一点。',
        task: '在不启动虚机的前提下看清镜像的分区结构、关键配置与日志，并知道真要动手修的时候从哪里进',
        steps: [
          { title: '先看清它的磁盘结构', about: '不启动虚机，先看清它的分区与文件系统', cmd: 'virt-filesystems -a /data/vmstore/broken-vm.qcow2 --all --long -h', ref: 'vm-img-guestfish', hint: ['它已经起不来了，但磁盘结构不用启动也能看清：分区、文件系统、卷标与容量都能单独列出来', 'virt-filesystems -a /data/vmstore/broken-vm.qcow2 --all ____'], note: '一块 40 GiB 的盘、两个 xfs 分区：/dev/sda1 挂 /boot、/dev/sda2 挂 / —— 挂载点信息是判断 fstab 有没有写错的前提' },
          { title: '看每个文件系统用了多少', about: '看每个文件系统用了多少、还剩多少', cmd: 'virt-df -a /data/vmstore/broken-vm.qcow2', ref: 'vm-img-guestfish', hint: ['结构看清了，接着看每个文件系统用了多少 —— 不需要挂载或启动，镜像里的使用率是算得出来的', 'virt-df -a ____'], note: '根分区 15%、/boot 26%，都不满 —— 可以排除「磁盘写满导致起不来」这条最常见的原因' },
          { title: '只读确认这是哪台机器', about: '只读打开镜像，直接读文件内容', cmd: 'guestfish --ro -a /data/vmstore/broken-vm.qcow2 -i cat /etc/hostname', ref: 'vm-img-guestfish', hint: ['修复前先确认这是哪台机器，取证时也别写坏证据：只读模式打开镜像，直接把文件内容读出来', 'guestfish --ro -a /data/vmstore/broken-vm.qcow2 -i ____'], note: 'broken-vm —— 盘里的系统还是完整的，只是引导或元数据出了问题。--ro 是救援与取证的默认姿势' },
          { title: '读一眼开机挂载表', about: '单独读一眼最容易被写错的那个文件', cmd: 'virt-cat -a /data/vmstore/broken-vm.qcow2 /etc/fstab', ref: 'vm-img-guestfish', hint: ['起不来最常见的原因是开机挂载表写错：单独把那个文件的内容打出来看一眼，比重装系统快得多', 'virt-cat -a /data/vmstore/broken-vm.qcow2 ____'], note: '两条 UUID 挂载记录看着正常 —— 说明不是 fstab 的锅，继续往日志与镜像一致性上查' },
          { title: '把日志整份取出来', about: '把日志整份取到宿主上再分析', cmd: 'virt-copy-out -a /data/vmstore/broken-vm.qcow2 /var/log/messages /tmp', ref: 'vm-img-guestfish', hint: ['要把日志翻透，得先把它从镜像里取到宿主上：取出来之后慢慢翻、慢慢筛才用得上', 'virt-copy-out -a /data/vmstore/broken-vm.qcow2 /var/log/messages ____'], note: '日志已落到 /tmp/messages —— 取出来之后就能用 tail、grep 反复分析，而不用一次次去碰那个镜像' },
          { title: '真要修时从哪里进', about: '真要动手修时再进这个独立小系统', cmd: 'virt-rescue -a /data/vmstore/broken-vm.qcow2', ref: 'vm-img-guestfish', hint: ['真要动手修的时候才进救援环境：里面是一个独立的小系统，改挂载表、重装引导、重置密码都在那儿做', 'virt-rescue -a ____'], note: '救援环境里手工挂载文件系统（mount /dev/sda2 /sysroot）再改；注意提示里那句话 —— 这个镜像的一致性确实有问题' }
        ],
        answer: 'guestfish --ro -a /data/vmstore/broken-vm.qcow2 -i cat /etc/hostname',
        alt: [
          'virt-cat -a /data/vmstore/broken-vm.qcow2 /etc/hostname',
          'guestfish --ro -a /data/vmstore/broken-vm.qcow2 -i head /etc/hostname'
        ],
        expect: /broken-vm/,
        teach: '**libguestfs 这一套工具的价值在于「不启动目标系统也能读写它的磁盘」**：它在宿主上临时拉起一个极小的虚拟机，把目标镜像挂进去操作，所以镜像里的系统已经损坏到无法引导，照样能把文件读出来。\n\n离线排障的动作顺序：`virt-filesystems -a img --all --long -h` 看清分区与文件系统结构 → `virt-df -a img` 看各文件系统使用率（排查「盘满了」最快的手段，比启动虚机快得多）→ `guestfish --ro -a img -i cat <文件>` 只读取证、确认这是哪台机器 → `virt-cat -a img /etc/fstab` 单读一眼最容易被写错的开机挂载表 → `virt-copy-out -a img /var/log/messages /tmp` 把日志整份取到宿主上慢慢分析 → 真要动手改（改 fstab、重装 GRUB、重置密码）才 `virt-rescue -a img` 进救援环境。\n\n两条纪律：**一律先加 `--ro`** —— 只读能避免误改，取证场景写一下证据就废了；用 `qemu-img check <镜像>` 发现 `Leaked clusters` / `L1 table is corrupted` 这类损坏时，**先把原文件备份一份再考虑修复**（`-r all` 是激进修复，可能越修越糟），修完还要再 check 一遍确认。'
      }
,

      {
        id: 'kvm-host-inventory-l1',
        cat: 'kvm',
        title: '虚拟化宿主机上跑着什么：先做一次清点',
        prompt: '你接手一台 KVM 宿主机，**上面跑着几台虚机，其中一台还暂停着**。在动任何东西之前，先回答：**有哪些虚机、各自什么状态、磁盘文件多大。**',
        task: '用 virsh 与 qemu-img 做一次只读清点：虚机名单、状态、以及磁盘文件的真实占用',
        steps: [
          { title: '列出全部虚机', about: '包括关机的', cmd: 'virsh list --all', ref: 'vm-virsh-list', hint: ['清点第一步：列出**全部**虚机 —— 不加"全部"选项只能看到运行中的，会漏掉关机的那些', 'virsh list ____'], note: '四台虚机三种状态：`running` / `shut off` / **`paused`** —— **暂停状态要特别留意**（它占着内存但不干活，常见于宿主资源不足或迁移中断）' },
          { title: '看单台虚机的详情', about: '规格与状态', cmd: 'virsh dominfo web-prod-01', ref: 'vm-virsh-dominfo', hint: ['接着看单台的规格：一条命令给出 vCPU 数、内存、状态与 UUID', 'virsh ____ web-prod-01'], note: '**`CPU(s)` 与 `Max memory` 是分配规格**（不是实际用量）；`UUID` 在跨宿主迁移与备份时要对得上' },
          { title: '看磁盘文件在哪、多大', about: '容量规划要的是真实占用', cmd: 'virsh domblklist web-prod-01', ref: 'vm-virsh-dominfo', hint: ['虚机的磁盘在宿主机上就是一个文件 —— 先看它挂在哪个路径（`Target` 是虚机里的设备名，`Source` 是宿主上的文件）', 'virsh ____ web-prod-01'], note: '**`Source` 那一列才是宿主上的真实路径**；`Target` 是虚机里的设备名（`vda` 这种）' },
          { title: '看磁盘文件的真实占用', about: '虚拟大小与实际占用的区别', cmd: 'qemu-img info /data/vmstore/web-prod-02.qcow2', ref: 'vm-img-info', hint: ['关键一步：看磁盘文件的实际占用 —— 注意输出里**有两个不同的大小的字段**', 'qemu-img info ____'], note: '**`virtual size: 40 GiB` 是虚机看到的盘大小；`disk size: 1.39 GiB` 才是文件真占了宿主多少空间** —— 稀疏文件（qcow2）不会立刻吃掉全部空间' },
          { title: '确认宿主机自己的余量', about: '还能不能再开一台', cmd: 'df -h /data', ref: 'ls9-df', hint: ['最后看宿主自己还有没有地方放新盘 —— **虚拟化最容易踩的坑就是"盘分配出去了、宿主却没空间"**', 'df -h ____'], note: '**判断"还能不能开新虚机"要看宿主余量**，而不是看虚机里 `df` 的结果（后者只是"分配到的额度"）' }
        ],
        answer: 'virsh list --all',
        alt: [
          'virsh list --all',
          'qemu-img info /data/vmstore/web-prod-02.qcow2'
        ],
        expect: /running|shut off|paused|qcow2/,
        teach: '**虚拟化环境里最容易混淆的一组概念是"分配"与"占用"，而它们的差值决定你能不能再开虚机。** `virsh list --all` 给出**四种状态**，各自含义不同：**`running`**（正常）、**`shut off`**（已关机，但**定义还在** —— 随时能再启动）、**`paused`**（**内存还占着、CPU 停了**：常见于宿主内存不足、存储 IO 卡死、或迁移中断 —— **它不是"关机"，不能靠 `start` 恢复**，要先查为什么被暂停）、**`crashed`**（异常终止）。**看清"暂停"很重要**：它占着内存却不服务，会让宿主可用内存莫名其妙少一块。**`virsh dominfo` 与 `virsh domblklist` 的分工**：前者给**规格**（vCPU、内存、UUID、状态），后者给**磁盘的宿主路径**（`Source` 是宿主上的文件、`Target` 是虚机内的设备名）—— **要动磁盘就得认准 `Source`**，它是宿主机上的真实路径。**`qemu-img info` 的两个大小必须分清**：**`virtual size`** 是虚机看到的盘容量（你"分配"出去的），**`disk size`** 是文件**实际占用宿主多少空间**；qcow2 是**稀疏文件**，40 GiB 的盘初始可能只占 1.39 GiB，**写多少涨多少**。这带来两条实务结论：**① 宿主容量规划要按"所有虚机写满"来算**（否则某台虚机大量写数据时会把宿主撑爆，影响**所有**虚机）；**② `qcow2` 支持快照与压缩，性能比裸设备略低** —— 追求 IO 的场景会用 `raw` 或直接 LVM 逻辑卷。**清点的完整动作**（本课只做了只读部分）：`virsh list --all` 看名单 → `dominfo` / `domblklist` 看规格与磁盘 → `qemu-img info` 看真实占用 → `df -h` 看宿主余量 → **`virsh net-list --all` 看网络、`virsh pool-list` 看存储池**。**一个安全习惯**：在虚拟化宿主上操作前，**先把要动的虚机的 `virsh dumpxml` 备份出来** —— XML 是虚机的"定义"，删掉定义（`undefine`）而没备份，重建时全靠记忆补规格，风险极高。'
      }

  );
})();
