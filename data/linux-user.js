/* data/linux-user.js · 分类 03 用户权限与系统管理 */
(function () {
  'use strict';

  var catId = 'linux-user';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ---------- 1 / 56 ---------- */
    {
      id: 'lu-useradd',
      name: 'useradd',
      alias: ['adduser', '创建用户'],
      level: 2,
      syntax: 'useradd [选项] <用户名>',
      summary: '创建用户账号，云主机初始化时建运维账号的第一步。',
      desc: '默认值来自 `/etc/default/useradd`（可用 `useradd -D` 查看）与 `/etc/login.defs`（UID 范围、是否建家目录、密码有效期），家目录的初始内容从 `/etc/skel` 复制。新账号在设置密码前无法用密码登录。',
      params: [
        { flag: '-m', desc: '创建家目录，Debian/Ubuntu 默认不建，必须显式加' },
        { flag: '-d /home/deploy', desc: '指定家目录路径，常与 -m 连用' },
        { flag: '-s /bin/bash', desc: '指定登录 shell，服务账号用 /sbin/nologin 禁止登录' },
        { flag: '-G wheel,docker', desc: '追加附加组（逗号分隔、不能有空格）' },
        { flag: '-g dev', desc: '指定主组，不写则自动创建同名主组' },
        { flag: '-u 1500', desc: '指定 UID，跨机器保持一致便于共享存储权限' },
        { flag: '-r', desc: '创建系统账号（UID 小于 1000，默认不建家目录）' },
        { flag: '-c "运维账号"', desc: '添加注释，写入 /etc/passwd 的第 5 个字段' }
      ],
      examples: [
        { cmd: 'useradd -m -s /bin/bash -c "运维账号" deploy', desc: '华为云 ECS 上建运维账号，Ubuntu 必须带 -m 才会建家目录' },
        { cmd: 'useradd -r -s /sbin/nologin -d /data/appuser appuser', desc: '建不可登录的服务账号，家目录放在数据盘' },
        { cmd: 'useradd -D', desc: '查看默认配置，批量建号前先确认 shell 与家目录基准值' }
      ],
      notes: [
        '发行版差异：Debian/Ubuntu 默认 `CREATE_HOME no`，不加 `-m` 就没有家目录，登录后落在 `/`；CentOS/RHEL 7+ 默认建家目录',
        '建完账号必须 `passwd deploy` 设置密码，否则该账号无法用密码登录',
        '`-G` 是"设置为"语义，后续调整附加组要用 `usermod -aG` 追加，否则会覆盖',
        '要改默认家目录基准、UID 范围、密码有效期，改 `/etc/default/useradd` 与 `/etc/login.defs`，只对之后新建的账号生效'
      ],
      related: ['lu-usermod', 'lu-passwd', 'lu-groupadd', 'lu-chage'],
      docs: 'https://man7.org/linux/man-pages/man8/useradd.8.html',
      tags: ['用户', '账号', '初始化']
    },

    /* ---------- 2 / 56 ---------- */
    {
      id: 'lu-usermod',
      name: 'usermod',
      alias: ['修改用户', '-aG'],
      level: 2,
      syntax: 'usermod [选项] <用户名>',
      summary: '修改用户的附加组、家目录、shell 与锁定状态等属性。',
      desc: '用户信息分散在 `/etc/passwd`、`/etc/shadow`、`/etc/group` 三个文件里，`usermod` 是安全修改这三处的推荐方式，手工编辑容易写坏格式并锁死账号。',
      params: [
        { flag: '-aG dev', desc: '追加附加组，-a 表示追加，必须与 -G 同用' },
        { flag: '-G wheel,docker', desc: '直接设置附加组列表，会覆盖原有全部附加组' },
        { flag: '-L', desc: '锁定账号（在 /etc/shadow 密码前加 !），不影响已登录会话' },
        { flag: '-U', desc: '解锁账号' },
        { flag: '-d /data/deploy -m', desc: '修改家目录并把原内容整体搬过去' },
        { flag: '-s /bin/bash', desc: '修改登录 shell' },
        { flag: '-l devops', desc: '改用户名，家目录不会跟着改，需再配 -d -m' },
        { flag: '-e 2025-12-31', desc: '设置账号过期日期，到期后无法登录' }
      ],
      examples: [
        { cmd: 'usermod -aG wheel deploy', desc: 'CentOS 把运维账号加入 wheel 组（Ubuntu 换成 sudo 组）' },
        { cmd: 'usermod -aG docker,systemd-journal deploy', desc: '让运维账号免 sudo 使用 docker、查看全部日志' },
        { cmd: 'usermod -d /data/deploy -m deploy', desc: '把家目录迁到数据盘并搬移原文件' }
      ],
      notes: [
        '`-G` 会覆盖用户原有的全部附加组：追加必须写 `-aG`，漏掉 `-a` 会把用户从其他所有组里踢出去，这是最常见的组权限事故',
        '组变更对已登录会话不生效，需要重新登录或用 `newgrp` 临时切换',
        '`-L` 只锁密码登录，持有 SSH 密钥的账号仍能登录，要彻底封禁得同时删除 `authorized_keys` 或用 `-s /sbin/nologin`',
        '`-d -m` 搬移大量数据很慢，执行前先停掉该用户的业务进程'
      ],
      related: ['lu-useradd', 'lu-groupadd', 'lu-gpasswd', 'lu-id'],
      docs: 'https://man7.org/linux/man-pages/man8/usermod.8.html',
      tags: ['用户', '属组', '锁定']
    },

    /* ---------- 3 / 56 ---------- */
    {
      id: 'lu-userdel',
      name: 'userdel',
      alias: ['删除用户'],
      level: 2,
      syntax: 'userdel [选项] <用户名>',
      summary: '删除用户账号，加 -r 会连家目录一起删且无法恢复。',
      desc: '默认只删除 `/etc/passwd`、`/etc/shadow`、`/etc/group` 里的账号记录，家目录与邮件池都会保留。文件不会跟着消失，属主会退化成原来的数字 UID。',
      params: [
        { flag: '-r', desc: '同时删除家目录与邮件池 /var/spool/mail/<用户>' },
        { flag: '-f', desc: '强制删除，即使用户仍在登录或家目录被占用' }
      ],
      examples: [
        { cmd: 'userdel deploy', desc: '只删账号，保留 /home/deploy 里的数据' },
        { cmd: 'userdel -r appuser', desc: '连家目录一起删，执行前确认里面没有业务数据' },
        { cmd: 'find / -nouser -print 2>/dev/null', desc: '找出删除用户后残留的孤儿文件，逐个决定归属' }
      ],
      notes: [
        '`userdel -r` 删除的家目录不进回收站、无法恢复，生产上先 `tar czf /data/backup/deploy-home.tgz /home/deploy` 备份',
        '删除前先确认没有该用户的进程：`ps -u deploy`，残留进程会让 UID 继续被占用',
        '账号删了但 `/etc/sudoers.d/` 里的授权文件还在，留着就是一颗定时炸弹，要手工清理',
        '被删用户的 crontab 也会一起清理，但 `/data` 等目录下属于他的文件会变成数字 UID，需用 `chown -R` 修复'
      ],
      related: ['lu-useradd', 'lu-usermod', 'lu-chown', 'lu-visudo'],
      docs: 'https://man7.org/linux/man-pages/man8/userdel.8.html',
      tags: ['用户', '删除', '危险']
    },

    /* ---------- 4 / 56 ---------- */
    {
      id: 'lu-passwd',
      name: 'passwd',
      alias: ['chpasswd', '改密码'],
      level: 1,
      syntax: 'passwd [选项] [用户名]',
      summary: '设置或锁定用户密码，不写用户名就是修改自己的密码。',
      desc: '密码哈希存放在 `/etc/shadow`，`passwd` 会自动做加盐哈希。密码强度策略由 PAM 的 `pwquality` 控制，有效期由 `/etc/login.defs` 与 `chage` 控制。',
      params: [
        { flag: '-l', desc: '锁定账号，在密码哈希前加 ! 使其无法用密码登录' },
        { flag: '-u', desc: '解锁账号' },
        { flag: '-e', desc: '立即过期，用户下次登录必须改密码' },
        { flag: '-S', desc: '查看密码状态：是否已设置、是否锁定、有效期' },
        { flag: '-d', desc: '清空密码（危险，可能变成空密码登录）' },
        { flag: '--stdin', desc: '从标准输入读密码，RHEL/CentOS 可用，批量建号用' }
      ],
      examples: [
        { cmd: 'passwd deploy', desc: 'root 给 deploy 设置新密码，交互输入两次' },
        { cmd: 'passwd -e deploy', desc: '把密码设为立即过期，交付时让对方首次登录自行改密' },
        { cmd: 'echo "deploy:Cloud@2024" | chpasswd', desc: '批量设置密码，Ubuntu 与 CentOS 通用写法' }
      ],
      notes: [
        '`echo 用户:密码 | chpasswd` 的密码会留在 shell 历史与进程列表里，生产上改用 `chpasswd < 密码文件` 并及时清理文件',
        'root 改密码不走复杂度校验（PAM 的 pwquality 只约束普通用户），弱密码照样能设上，合规场景要人工把关',
        '`passwd -d` 配合 sshd 的 `PermitEmptyPasswords yes` 等于把机器对外开放，默认配置下才勉强安全',
        '`--stdin` 是 RHEL/CentOS 的扩展参数，Ubuntu 上没有，用 `chpasswd` 代替',
        '普通用户只能改自己的密码，且必须提供原密码；忘记密码只能由 root 用 `passwd 用户名` 重置'
      ],
      related: ['lu-chage', 'lu-usermod', 'lu-su', 'lu-sudo'],
      docs: 'https://man7.org/linux/man-pages/man1/passwd.1.html',
      tags: ['密码', '用户', '安全']
    },

    /* ---------- 5 / 56 ---------- */
    {
      id: 'lu-chage',
      name: 'chage',
      alias: ['密码有效期', '密码策略'],
      level: 3,
      syntax: 'chage [选项] <用户名>',
      summary: '管理密码有效期与账号过期时间，等保要求定期改密时用它。',
      desc: '管理的是"密码多久必须换一次"和"账号什么时候作废"，与 `passwd` 管的具体密码内容互补。新建账号的默认值取自 `/etc/login.defs` 的 `PASS_MAX_DAYS` 等参数。',
      params: [
        { flag: '-l deploy', desc: '列出该用户的密码有效期全部字段' },
        { flag: '-M 90', desc: '密码最长使用天数，90 天后必须改密' },
        { flag: '-m 7', desc: '两次改密的最小间隔天数，防止绕过密码历史策略' },
        { flag: '-W 7', desc: '密码过期前 7 天开始提示' },
        { flag: '-I 30', desc: '密码过期后仍可登录的宽限天数，超期账号失效' },
        { flag: '-E 2025-12-31', desc: '账号到期日，到期后直接禁止登录' },
        { flag: '-d 0', desc: '把最后修改日期置为 0，强制下次登录改密' }
      ],
      examples: [
        { cmd: 'chage -l deploy', desc: '查看密码策略现状，交付验收时常查' },
        { cmd: 'chage -M 90 -W 7 deploy', desc: '按等保要求设置 90 天改密、提前 7 天提醒' },
        { cmd: 'chage -d 0 deploy', desc: '强制 deploy 下次登录必须改密，等效 passwd -e' }
      ],
      notes: [
        '`-I` 与 `-E` 容易混淆：`-I` 管密码过期后的宽限天数，`-E` 管账号本身的死期',
        '默认值来自 `/etc/login.defs` 的 `PASS_MAX_DAYS`、`PASS_WARN_AGE`，改这里只对之后新建的账号生效，存量账号要逐个 `chage`',
        '把 `-M` 设得比 `-m` 还小会导致密码永远无法修改，配置前先核对',
        '账号已过期（`-E`）时用户登录会被直接拒绝，排障时先用 `chage -l` 看 Account expires 一行'
      ],
      related: ['lu-passwd', 'lu-useradd', 'lu-lastlog'],
      docs: 'https://man7.org/linux/man-pages/man1/chage.1.html',
      tags: ['密码', '有效期', '等保']
    },

    /* ---------- 6 / 56 ---------- */
    {
      id: 'lu-groupadd',
      name: 'groupadd',
      alias: ['addgroup', '新建用户组'],
      level: 2,
      syntax: 'groupadd [选项] <组名>',
      summary: '新建用户组，之后用 usermod -aG 把用户加进去共享权限。',
      desc: '组信息写在 `/etc/group` 与 `/etc/gshadow`。做多用户共享目录时，通常先建组、再加人、最后给目录设 `2770`（SGID）让新建文件自动继承组。',
      params: [
        { flag: '-g 1500', desc: '指定 GID，跨机器统一便于共享存储权限一致' },
        { flag: '-r', desc: '创建系统组（GID 小于 1000）' },
        { flag: '-f', desc: '组已存在时不报错，脚本里做幂等用' }
      ],
      examples: [
        { cmd: 'groupadd -g 1500 deploy', desc: '建运维组并固定 GID' },
        { cmd: 'groupadd -r apprunner', desc: '建系统组给服务账号使用' },
        { cmd: 'groupadd -f dev', desc: '已存在就跳过，写自动化脚本时避免中途失败' }
      ],
      notes: [
        'GID 不能与已有组冲突，冲突会报 `GID 1500 is not unique`',
        '`useradd` 不指定 `-g` 时会自动创建同名主组，所以很多场景不需要单独 groupadd',
        '建完组别忘了 `chmod 2770 共享目录`，否则组员新建的文件仍归属于各人的主组'
      ],
      related: ['lu-usermod', 'lu-groupmod', 'lu-gpasswd', 'lu-chgrp'],
      docs: 'https://man7.org/linux/man-pages/man8/groupadd.8.html',
      tags: ['用户组', 'GID', '权限']
    },

    /* ---------- 7 / 56 ---------- */
    {
      id: 'lu-groupmod',
      name: 'groupmod',
      alias: ['改组名', '改GID'],
      level: 2,
      syntax: 'groupmod [选项] <组名>',
      summary: '修改组名或 GID，改 GID 后旧文件上的属组不会自动更新。',
      desc: '改组名只影响 `/etc/group` 里的记录，成员关系与文件属组都按 GID 关联，不受影响；改 GID 则是换了标识，磁盘上原有文件的数字属组不会跟着变。',
      params: [
        { flag: '-n ops', desc: '把组重命名为 ops' },
        { flag: '-g 1600', desc: '修改 GID' }
      ],
      examples: [
        { cmd: 'groupmod -n ops deploy', desc: '把 deploy 组改名为 ops，成员关系不变' },
        { cmd: 'groupmod -g 1600 ops', desc: '改 GID 后需用 chgrp 修补旧文件的属组' },
        { cmd: 'find /data -gid 1500 -exec chgrp 1600 {} +', desc: '把还挂在旧 GID 上的文件批量改成新 GID' }
      ],
      notes: [
        '改 GID 不会更新已有文件的数字属组，`ls -l` 会显示成数字 1500，必须用 `find -gid` 配合 `chgrp` 修补',
        '正在运行的进程仍持有旧 GID，要重启相关服务后才完全生效',
        '`/etc/sudoers` 里用 `%组名` 授权的规则在改名后会失效，记得同步更新'
      ],
      related: ['lu-groupadd', 'lu-chgrp', 'lu-gpasswd', 'lu-chown'],
      docs: 'https://man7.org/linux/man-pages/man8/groupmod.8.html',
      tags: ['用户组', '重命名', 'GID']
    },

    /* ---------- 8 / 56 ---------- */
    {
      id: 'lu-groupdel',
      name: 'groupdel',
      alias: ['删除用户组'],
      level: 2,
      syntax: 'groupdel <组名>',
      summary: '删除用户组，不能删除仍被用户当作主组的组。',
      desc: '组记录从 `/etc/group` 与 `/etc/gshadow` 中移除，磁盘上文件里残留的数字 GID 不会改变，会显示为无主数字。',
      examples: [
        { cmd: 'getent group dev', desc: '删除前先确认组里还有谁在用' },
        { cmd: 'groupdel testgrp', desc: '删掉无人使用的测试组' }
      ],
      notes: [
        '组里仍有用户以它为主组时删除会失败并提示 `cannot remove the primary group of user`，要先 `usermod -g` 换主组',
        '组里只有附加组用户时不会报错，这些用户会悄悄失去一个组权限，删前用 `getent group` 核对成员',
        '`/etc/sudoers` 里 `%dev` 形式的授权在组删除后变成无效规则，建议一并清理',
        '共享目录上残留的 GID 会显示为数字，需要时用 `chgrp` 改成合适的组'
      ],
      related: ['lu-groupadd', 'lu-groupmod', 'lu-usermod', 'lu-gpasswd'],
      docs: 'https://man7.org/linux/man-pages/man8/groupdel.8.html',
      tags: ['用户组', '删除']
    },

    /* ---------- 9 / 56 ---------- */
    {
      id: 'lu-gpasswd',
      name: 'gpasswd',
      alias: ['组成员管理', 'newgrp'],
      level: 3,
      syntax: 'gpasswd [选项] <组名>',
      summary: '集中管理组成员，批量加人减人比逐条 usermod 更清晰。',
      desc: '既能加减成员，也能指定组管理员让业务负责人自行维护成员。不跟任何选项只写组名时，是为该组设置组密码（配合 `newgrp` 临时切换主组）。',
      params: [
        { flag: '-a deploy', desc: '把用户加入组（追加，不影响其他成员）' },
        { flag: '-d deploy', desc: '把用户从组里移除' },
        { flag: '-M deploy,ops', desc: '一次性设置成员列表，会覆盖原有成员' },
        { flag: '-A deploy', desc: '指定组管理员，管理员可自行增删成员' },
        { flag: '-r', desc: '删除组密码' }
      ],
      examples: [
        { cmd: 'gpasswd -a deploy docker', desc: '把 deploy 加进 docker 组，与 usermod -aG 等效' },
        { cmd: 'gpasswd -d deploy docker', desc: '把人从组里摘掉，不影响其他属性' },
        { cmd: 'gpasswd -M deploy,ops dev', desc: '把 dev 组成员精确设置为 deploy 与 ops 两人' }
      ],
      notes: [
        '`-M` 是覆盖式的，执行前先 `getent group dev` 看清现有成员，否则会把其他人挤出去',
        '组成员变更对已登录会话不生效，要重新登录或执行 `newgrp dev` 开一个新 shell',
        '不带选项直接执行 `gpasswd 组名` 是设置组密码，不是查看成员，生产上误操作会造成不必要的组口令',
        '`gpasswd -a` 与 `usermod -aG` 效果相同，选一种统一使用，混用容易在审计时漏看'
      ],
      related: ['lu-usermod', 'lu-groupadd', 'lu-id', 'lu-getent'],
      docs: 'https://man7.org/linux/man-pages/man1/gpasswd.1.html',
      tags: ['用户组', '成员', '批量']
    },

    /* ---------- 10 / 56 ---------- */
    {
      id: 'lu-id',
      name: 'id',
      alias: ['groups', 'whoami', '查看用户身份'],
      level: 1,
      syntax: 'id [选项] [用户名]',
      summary: '查看用户的 UID、主组与全部附加组，排查权限问题的起点。',
      desc: '权限报错时先 `id` 看清自己是谁、属于哪些组。`whoami` 等价于 `id -un`，`groups` 等价于 `id -Gn`，三者读的是同一份数据，只是输出详略不同。',
      params: [
        { flag: '-u', desc: '只显示 UID，加 -n 显示用户名（-un 等价 whoami）' },
        { flag: '-g', desc: '只显示主组 GID，加 -n 显示组名' },
        { flag: '-G', desc: '显示全部组的 GID，加 -n 显示组名（-Gn 最常用）' },
        { flag: '-n', desc: '与 -u/-g/-G 连用，输出名称而不是数字' },
        { flag: 'deploy', desc: '查询指定用户，不写则是当前用户' }
      ],
      examples: [
        { cmd: 'id deploy', desc: '看 deploy 的 UID、主组与附加组，确认加组是否生效' },
        { cmd: 'id -Gn deploy', desc: '只列组名，比 groups 更适合写进脚本' },
        { cmd: 'whoami', desc: 'sudo 之后确认当前身份，等价于 id -un' }
      ],
      notes: [
        '`id` 反映的是当前进程的组信息：刚用 `usermod -aG` 加过组，不重新登录看不到新组',
        '脚本里判断是否 root 用 `[ "$(id -u)" -eq 0 ]`，比 whoami 更可靠',
        '`who am i`（带空格）查的是登录用户，`whoami` 查的是当前有效用户，`su` 切换后两者结果不同'
      ],
      related: ['lu-usermod', 'lu-gpasswd', 'lu-sudo', 'lu-getent'],
      docs: 'https://man7.org/linux/man-pages/man1/id.1.html',
      tags: ['用户', '属组', '身份']
    },

    /* ---------- 11 / 56 ---------- */
    {
      id: 'lu-su',
      name: 'su',
      alias: ['su -', '切换用户'],
      level: 2,
      syntax: 'su [选项] [-] [用户名]',
      summary: '切换用户身份，加不加短横线决定是否加载目标用户环境。',
      desc: '`su - 用户` 是登录式切换，会重新读取目标用户的 `/etc/profile`、`~/.bash_profile`，拿到他的 PATH、HOME 与 umask；`su 用户` 只换身份不换环境，很多"命令找不到""文件写错地方"的怪问题都出在这里。',
      params: [
        { flag: '-', desc: '登录式切换（等价 -l），加载目标用户的完整环境，推荐写法' },
        { flag: '-c "命令"', desc: '以目标用户身份执行一条命令后返回' },
        { flag: '-s /bin/bash', desc: '指定切换后使用的 shell，目标账号是 nologin 时用' },
        { flag: 'root', desc: '不写用户名默认切到 root，需要 root 密码' }
      ],
      examples: [
        { cmd: 'su - deploy', desc: '完整切到 deploy，环境变量与直接登录完全一致' },
        { cmd: 'su - deploy -c "whoami && echo $HOME"', desc: '验证登录式切换后的身份与家目录' },
        { cmd: 'su -s /bin/bash - deploy', desc: '目标账号是 nologin 时临时借一个 bash 排查问题' }
      ],
      notes: [
        '最大坑：`su deploy` 不加载目标用户环境，`HOME` 仍是 `/root`、`PATH` 仍带 `/sbin`，脚本里会写错文件位置或找不到命令，务必写 `su - deploy`',
        'root 切普通用户不需要密码，普通用户切 root 需要 root 密码',
        'Ubuntu 默认锁定 root 密码（`/etc/shadow` 里是 !），`su -` 会一直失败属于正常现象，改用 `sudo -i`',
        '`su -c` 里的变量会被当前 shell 先展开，要传 `$HOME` 这类变量请用单引号包住整条命令',
        '`su -` 不会清理当前用户的环境残留（如 SSH_AUTH_SOCK），跨用户操作时可能触发 agent 权限告警'
      ],
      related: ['lu-sudo', 'lu-id', 'lu-passwd', 'lu-visudo'],
      docs: 'https://man7.org/linux/man-pages/man1/su.1.html',
      tags: ['切换用户', '环境变量', '坑']
    },

    /* ---------- 12 / 56 ---------- */
    {
      id: 'lu-sudo',
      name: 'sudo',
      alias: ['sudo -i', 'sudo -u', 'sudo -l', 'sudo !!'],
      level: 2,
      syntax: 'sudo [选项] <命令>',
      summary: '以其他用户（默认 root）身份执行命令，可授权、可审计。',
      desc: '相比直接给 root 密码，sudo 能做到按命令授权、留下操作日志。执行时默认会重置环境变量（PATH 走 sudoers 里的 `secure_path`），密码缓存 5 分钟。权限规则写在 `/etc/sudoers` 与其包含目录 `/etc/sudoers.d/`。',
      params: [
        { flag: '-i', desc: '进入 root 的登录式 shell，加载 /root 环境（等价 sudo su -）' },
        { flag: '-s', desc: '开一个 root shell，但不加载登录环境' },
        { flag: '-u nginx', desc: '以指定用户身份执行命令' },
        { flag: '-l', desc: '列出当前用户被授权可执行的命令' },
        { flag: '-k', desc: '立即清除密码缓存，下次需重新输密码' },
        { flag: '-E', desc: '保留当前环境变量，默认会被 env_reset 清掉' },
        { flag: '-n', desc: '非交互模式，需要密码时直接失败，适合脚本' },
        { flag: '-b', desc: '把命令放到后台执行' }
      ],
      examples: [
        { cmd: 'sudo -i', desc: '进入 root 登录 shell，环境与 root 直接登录一致' },
        { cmd: 'sudo -u nginx /usr/sbin/nginx -t', desc: '以 nginx 用户身份校验配置，排查权限导致的启动失败' },
        { cmd: 'sudo !!', desc: '上一条命令忘了加 sudo，用历史展开重跑一遍' },
        { cmd: 'sudo -l -U deploy', desc: '查看 deploy 被授权了哪些命令，交接权限时核对' }
      ],
      notes: [
        '`sudo -i` 与 `sudo -s` 的差别在环境变量：`-i` 读 `/root/.bash_profile`，`-s` 保留当前目录与部分变量',
        '被 sudo 执行的命令 PATH 会重置为 sudoers 里的 `secure_path`，脚本中写相对路径会 command not found，一律用绝对路径',
        '密码缓存默认 5 分钟（`timestamp_timeout`），共用管理员账号的机器上记得 `sudo -k`',
        'sudo 不会继承你的 `JAVA_HOME`、`http_proxy` 等变量，需要时用 `sudo -E` 或在 sudoers 里用 `env_keep` 放行',
        '免密配置形如 `deploy ALL=(ALL) NOPASSWD: ALL`，写进 `/etc/sudoers.d/deploy`（权限 0440），必须用 `visudo` 编辑'
      ],
      related: ['lu-visudo', 'lu-su', 'lu-useradd', 'lu-id'],
      docs: 'https://man7.org/linux/man-pages/man8/sudo.8.html',
      tags: ['提权', '授权', '免密']
    },

    /* ---------- 13 / 56 ---------- */
    {
      id: 'lu-visudo',
      name: 'visudo',
      alias: ['编辑sudoers', 'sudoers.d'],
      level: 2,
      syntax: 'visudo [选项] [-f <sudoers文件>]',
      summary: '安全编辑 sudoers，保存前自动做语法检查，防止提权被锁死。',
      desc: '直接用 vim 改 `/etc/sudoers` 一旦写错语法，sudo 会拒绝加载配置，所有人（包括 root）都无法提权。visudo 在保存时校验语法，写错会提示并让你重改。',
      params: [
        { flag: '-f /etc/sudoers.d/deploy', desc: '编辑指定的子配置文件，推荐每个账号一个文件' },
        { flag: '-c', desc: '只做语法检查不进入编辑，配合 -f 检查单个文件' },
        { flag: '-s', desc: '严格模式，额外检查别名重复定义等问题' }
      ],
      examples: [
        { cmd: 'visudo -f /etc/sudoers.d/deploy', desc: '给运维账号单独写一份授权，互不影响便于回收' },
        { cmd: 'visudo -c', desc: '交付前检查 sudoers 语法，这步能救命' },
        { cmd: 'echo "deploy ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/deploy && chmod 440 /etc/sudoers.d/deploy && visudo -c', desc: '脚本化写入免密配置并把权限设为 440' }
      ],
      notes: [
        '直接 `vim /etc/sudoers` 保存语法错误后，sudo 会报 `parse error` 并拒绝所有提权，连 root 都被锁；补救要靠 `su -`、单用户/救援模式或云主机控制台 VNC',
        '`/etc/sudoers.d/` 下的文件权限必须是 0440，文件名不能含 `.` 或 `~`，否则 sudo 会忽略并提示 `bad mode` 或 `ignoring`',
        '改完立即生效，不需要重启任何服务',
        '授权粒度建议按命令给（如 `/usr/bin/systemctl restart nginx`），直接 `NOPASSWD: ALL` 等于把 root 交出去',
        '用 `sudo -l -U 用户名` 可以验证授权是否按预期生效'
      ],
      related: ['lu-sudo', 'lu-useradd', 'lu-userdel', 'lu-su'],
      docs: 'https://man7.org/linux/man-pages/man8/visudo.8.html',
      tags: ['sudoers', '授权', '坑']
    },

    /* ---------- 14 / 56 ---------- */
    {
      id: 'lu-chmod',
      name: 'chmod',
      alias: ['chmod 755', 'chmod 644', 'chmod +x', '权限修改'],
      level: 2,
      syntax: 'chmod [选项] <权限模式> <文件|目录>',
      summary: '修改文件权限位，数字法管整体、符号法做精细调整。',
      desc: '权限分属主(u)、属组(g)、其他人(o)三组，每组 r=4、w=2、x=1，三组相加就是数字法：755 表示 u=rwx,g=rx,o=rx。符号法用 `+`、`-`、`=` 只改动指定位，不会误伤其他组。目录必须有 x 才能进入，普通文件有 x 才能执行。',
      params: [
        { flag: '755', desc: '目录与可执行文件的常规权限：属主全权，其他人只读可进入' },
        { flag: '644', desc: '普通文件常规权限：属主可读写，其他人只读' },
        { flag: '600', desc: '仅属主可读写：SSH 私钥、证书密钥、含密码的配置文件' },
        { flag: 'u+x', desc: '符号法：只给属主加执行位' },
        { flag: 'g-w,o=r', desc: '符号法：组去掉写权限、其他人设为只读，逗号可串联多个操作' },
        { flag: '-R', desc: '递归修改目录下所有内容，风险最高的参数' },
        { flag: 'X', desc: '大写 X 只给目录（或已有执行位的文件）加 x，递归时最安全' },
        { flag: '+t', desc: '粘滞位（1777）：目录内文件只有属主能删，如 /tmp' }
      ],
      examples: [
        { cmd: 'chmod 600 ~/.ssh/id_rsa', desc: '私钥必须是 600，否则 ssh 报 UNPROTECTED PRIVATE KEY FILE 拒绝使用' },
        { cmd: 'chmod +x /opt/scripts/backup.sh', desc: '给脚本加执行权限，之后可以用 ./backup.sh 运行' },
        { cmd: 'chmod -R u=rwX,g=rX,o= /data/www', desc: '递归授权的最稳写法：目录自动带 x，普通文件不会被误设成可执行' }
      ],
      notes: [
        '`chmod -R 777 /` 会让系统彻底不可用：ssh 拒绝权限过松的私钥与 authorized_keys、sudo 报 sudoers 文件可写、passwd 直接罢工，基本只能重装或进救援模式',
        '`-R` 会无差别改掉目录下所有文件（含隐藏文件），执行前先 `ls -lR` 或 `find` 确认范围；递归改 Web 目录优先用带 `X` 的符号法',
        '权限还受挂载选项限制：文件系统带 `noexec` 时 `chmod +x` 也没用，可用 `findmnt -no OPTIONS /data` 确认',
        'SUID/SGID（4755、2755）会让程序以属主身份运行，是提权漏洞的常见来源，除系统自带程序外不要随意设置',
        '符号链接的权限无法单独修改，`chmod` 会跟随到目标文件上'
      ],
      related: ['lu-chown', 'lu-chgrp', 'lu-umask', 'lu-setfacl', 'lu-stat'],
      docs: 'https://man7.org/linux/man-pages/man1/chmod.1.html',
      tags: ['权限', '安全', '递归']
    },

    /* ---------- 15 / 56 ---------- */
    {
      id: 'lu-chown',
      name: 'chown',
      alias: ['改属主', 'chown -R'],
      level: 2,
      syntax: 'chown [选项] <属主>[:<属组>] <文件|目录>',
      summary: '修改文件的属主与属组，写法是 用户:组，加 -R 递归生效。',
      desc: '部署 Web 服务、挂载数据盘后调整目录归属时最常用。属主可以用用户名或数字 UID，删过用户的环境里只能用数字 UID 修复。',
      params: [
        { flag: 'deploy:deploy', desc: '同时修改属主与属组' },
        { flag: 'deploy', desc: '只改属主，属组保持不变' },
        { flag: ':www', desc: '只改属组，等价于 chgrp www' },
        { flag: '-R', desc: '递归修改目录下所有内容' },
        { flag: '--from=root:root', desc: '只改当前属主是 root:root 的文件，避免误伤' },
        { flag: '-h', desc: '修改符号链接本身而不是它指向的目标' }
      ],
      examples: [
        { cmd: 'chown -R nginx:nginx /data/www', desc: 'CentOS 上把站点目录交给 nginx 用户' },
        { cmd: 'chown -R www-data:www-data /data/www', desc: 'Ubuntu/Debian 上对应的属主名是 www-data' },
        { cmd: 'chown -R --from=root:root deploy:deploy /data/app', desc: '只改还属于 root 的文件，不会动到别的账号数据' }
      ],
      notes: [
        '`-R` 改大目录很慢且会改掉所有子项，先 `ls -ld` 看清目标，必要时用 `--from` 限定范围',
        '删除用户后文件会残留数字 UID（`ls -l` 显示 1001），可用 `chown -R 1001:1001` 或 `find / -nouser` 定位修复',
        '符号链接默认跟随目标，要改链接本身加 `-h`；共享目录更推荐用 SGID 让新文件自动继承组，而不是反复手工 chown',
        '跨机器迁移后 UID 不一致会导致权限混乱，规划时固定关键账号的 UID'
      ],
      related: ['lu-chmod', 'lu-chgrp', 'lu-userdel', 'lu-getfacl'],
      docs: 'https://man7.org/linux/man-pages/man1/chown.1.html',
      tags: ['属主', '属组', '权限']
    },

    /* ---------- 16 / 56 ---------- */
    {
      id: 'lu-chgrp',
      name: 'chgrp',
      alias: ['改属组', 'chgrp -R'],
      level: 1,
      syntax: 'chgrp [选项] <属组> <文件|目录>',
      summary: '只改文件属组，等价于 chown :组名，适合团队共享目录。',
      desc: '与 `chown` 相比只动属组、不动属主，权限收窄更安全。共享目录的完整做法是：建组、加人、`chgrp` 改属组、再配 `2770` 让新建文件继承组。',
      params: [
        { flag: '-R', desc: '递归修改目录下所有内容' },
        { flag: '--reference=/data/www', desc: '参照另一个文件的属组来设置，省去查名字' },
        { flag: '-h', desc: '修改符号链接本身' }
      ],
      examples: [
        { cmd: 'chgrp -R dev /data/share', desc: '把共享目录交给 dev 组' },
        { cmd: 'chmod 2770 /data/share', desc: '配合 SGID，组内新建的文件自动继承 dev 组' },
        { cmd: 'chgrp -R --reference=/data/www /data/upload', desc: '让 /data/upload 的属组与 /data/www 保持一致' }
      ],
      notes: [
        '只改属组不设 SGID 时，组员新建的文件仍归属各人主组，共享目录记得配 `2770`',
        '`chgrp -R` 同样有范围失控风险，先 `find /data/share -maxdepth 2 -ls` 确认影响范围',
        '属组名写错会直接报 `invalid group`，不会静默失败；跨机器共享目录要保证两边的 GID 一致'
      ],
      related: ['lu-chown', 'lu-chmod', 'lu-groupadd', 'lu-groupmod'],
      docs: 'https://man7.org/linux/man-pages/man1/chgrp.1.html',
      tags: ['属组', '共享目录', '权限']
    },

    /* ---------- 17 / 56 ---------- */
    {
      id: 'lu-umask',
      name: 'umask',
      alias: ['umask 022', '默认权限'],
      level: 2,
      syntax: 'umask [权限掩码]',
      summary: '设定新建文件与目录的默认权限，022 会得到 644 与 755。',
      desc: 'umask 记的是"要拿掉的位"而不是"要给的位"。基准值是文件 666、目录 777（文件默认不给执行位），实际权限等于基准值按位与非上掩码。umask 022 时：文件 666 去掉 022 得 644，目录 777 去掉 022 得 755。',
      params: [
        { flag: '022', desc: '默认值：新文件 644、新目录 755，同组和其他人可读' },
        { flag: '027', desc: '新文件 640、新目录 750，同组可读、其他人无任何权限' },
        { flag: '077', desc: '新文件 600、新目录 700，只有自己能访问' },
        { flag: '002', desc: '新文件 664、新目录 775，同组可写，团队共享目录常用' },
        { flag: '-S', desc: '用符号形式显示当前掩码，如 u=rwx,g=rx,o=rx' }
      ],
      examples: [
        { cmd: 'umask', desc: '查看当前掩码，通常输出 0022' },
        { cmd: 'umask -S', desc: '用 u=rwx,g=rx,o=rx 的符号形式确认实际效果，比数字直观' },
        { cmd: 'umask 027 && touch /data/test.conf && ls -l /data/test.conf', desc: '验证 027 掩码产出的文件权限是 640' }
      ],
      notes: [
        '算法是按位"与非"而不是十进制减法：文件 666 去 022 得 644，目录 777 去 022 得 755，用 666-22 算会得出错误结论',
        '`umask` 只对当前 shell 及其子进程生效，写进脚本会影响脚本创建的所有文件；要全局生效改 `/etc/profile` 或 `/etc/login.defs` 的 `UMASK` 并重新登录',
        '发行版默认值不同：CentOS/RHEL 的 `/etc/profile` 会按 UID 判断给 002 或 022，Ubuntu/Debian 默认 022，跨机器排查权限问题时先对比 `umask`',
        '`cp -p`、`install -m`、解压带权限的归档不受 umask 影响，别指望掩码能兜住所有场景'
      ],
      related: ['lu-chmod', 'lu-chown', 'lu-stat', 'lu-setfacl'],
      docs: 'https://man7.org/linux/man-pages/man2/umask.2.html',
      tags: ['权限', '默认值', '掩码']
    },

    /* ---------- 18 / 56 ---------- */
    {
      id: 'lu-lsattr',
      name: 'lsattr',
      alias: ['查看属性', '不可修改'],
      level: 3,
      syntax: 'lsattr [选项] [文件|目录]',
      summary: '查看文件的隐藏属性位，确认文件是否被 chattr 锁住。',
      desc: '权限位之外还有一层文件系统属性，`ls -l` 完全看不出来。当某个文件权限正常却怎么都改不动、删不掉时，用 `lsattr` 看一眼属性位，`i` 和 `a` 是最常见的两个。',
      params: [
        { flag: '-a', desc: '列出目录下所有文件，包含隐藏文件' },
        { flag: '-d', desc: '查看目录本身而不是目录内容' },
        { flag: '-R', desc: '递归列出子目录' },
        { flag: '-v', desc: '显示文件版本号' }
      ],
      examples: [
        { cmd: 'lsattr /etc/passwd /etc/shadow', desc: '确认关键账号文件是否被加了 i 锁' },
        { cmd: 'lsattr -R /etc/nginx', desc: '排查为什么某个配置文件改不动' },
        { cmd: 'lsattr -d /data/upload', desc: '只看目录本身的属性，判断新文件能不能创建' }
      ],
      notes: [
        '输出形如 `----i---------e----`，第 5 位是 `i` 表示不可变，`a` 表示只可追加，`e` 是 ext4 的 extent 标记属正常',
        'ext4 默认支持全部常见属性，XFS 只支持部分，报 `Operation not supported` 说明当前文件系统不支持该属性',
        '只有 root 能查看别人的文件属性；SELinux 标签属于另一套机制，用 `ls -Z` 查看'
      ],
      related: ['lu-chattr', 'lu-chmod', 'lu-stat'],
      docs: 'https://man7.org/linux/man-pages/man1/lsattr.1.html',
      tags: ['属性', '防篡改', '排障']
    },

    /* ---------- 19 / 56 ---------- */
    {
      id: 'lu-chattr',
      name: 'chattr',
      alias: ['chattr +i', '不可修改锁', '防篡改'],
      level: 3,
      syntax: 'chattr [+-=属性] [选项] <文件|目录>',
      summary: '设置文件系统层面的隐藏属性，+i 能让文件连 root 都改不动。',
      desc: '入侵者拿到 root 后常会改 `/etc/passwd`、塞 SSH 公钥、清空日志。给这些文件加 `i`（不可变）或 `a`（只可追加）属性，可以显著提高篡改成本，是等保加固里的常规动作。',
      params: [
        { flag: '+i', desc: '不可变：禁止修改、删除、改名、建硬链接' },
        { flag: '-i', desc: '解除不可变锁，加锁后只能靠它解开' },
        { flag: '+a', desc: '只允许追加内容，适合日志文件防清空' },
        { flag: '+A', desc: '不更新访问时间，减少磁盘 IO' },
        { flag: '-R', desc: '递归处理目录下所有内容' },
        { flag: '-V', desc: '显示详细过程与错误信息' }
      ],
      examples: [
        { cmd: 'chattr +i /etc/passwd /etc/shadow /etc/sudoers', desc: '加固关键账号与授权文件，阻止被悄悄加账号' },
        { cmd: 'chattr -i /etc/passwd /etc/shadow', desc: '需要改密码或加用户前必须先解锁，否则 passwd 会报错' },
        { cmd: 'chattr +a /var/log/secure', desc: '日志只允许追加，防止入侵者清空痕迹' },
        { cmd: 'lsattr /etc/passwd /etc/shadow', desc: '加锁后用 lsattr 确认属性已生效' }
      ],
      notes: [
        '`+i` 之后连 root 都改不动：`rm` 报 Operation not permitted、`passwd` 报 Authentication token manipulation error、`useradd` 直接失败，排查半天往往是当初自己锁的，用 `chattr -i` 解除即可',
        '加锁前建议把锁过的文件写进清单或脚本，否则后续正常运维会被自己挡住',
        '属性只在 ext4、XFS 等支持的文件系统上有效，NFS、tmpfs 与容器 overlay 上通常报 Operation not supported',
        '`chattr -R +i` 会锁住整棵目录树，解锁同样要递归，批量使用前先在小范围验证',
        '`+a` 属性下用 `>` 重定向写日志会失败，很多程序的日志切割脚本会因此报错，加锁前确认切割方式'
      ],
      related: ['lu-lsattr', 'lu-chmod', 'lu-passwd', 'lu-visudo'],
      docs: 'https://man7.org/linux/man-pages/man1/chattr.1.html',
      tags: ['防篡改', '属性', '安全']
    },

    /* ---------- 20 / 56 ---------- */
    {
      id: 'lu-getfacl',
      name: 'getfacl',
      alias: ['查看ACL', 'acl'],
      level: 3,
      syntax: 'getfacl [选项] <文件|目录>',
      summary: '查看文件的 ACL 细粒度权限，看清权限位之外的额外授权。',
      desc: 'ACL 能在不改属主属组的前提下，给某个用户或组单独授权。`ls -l` 权限位末尾出现 `+` 就说明该文件带 ACL，必须用 getfacl 才能看到完整规则。',
      params: [
        { flag: '-p', desc: '保留路径开头的斜杠，输出原始绝对路径' },
        { flag: '-R', desc: '递归列出目录下所有 ACL' },
        { flag: '-a', desc: '只显示访问 ACL，不显示默认 ACL' },
        { flag: '-d', desc: '只显示默认 ACL（目录上新建文件的继承规则）' },
        { flag: '-c', desc: '不输出注释头，便于脚本解析' }
      ],
      examples: [
        { cmd: 'getfacl /data/www', desc: '查看站点目录上有没有权限位之外的额外授权' },
        { cmd: 'getfacl -c /data/www', desc: '去掉注释头，只保留有效规则' },
        { cmd: 'getfacl -R /data/share > /data/acl-backup.txt', desc: '改 ACL 前先备份，出问题可按文件恢复' }
      ],
      notes: [
        '`ls -l` 权限位最后一位是 `+` 说明文件带 ACL，看不到规则时先怀疑这一条',
        '输出里的 `mask` 行限制属组与所有命名用户的**有效**权限，getfacl 显示的可能是名义权限，实际生效要结合 mask 判断',
        '`getfacl -R` 在大目录上很慢，配合 `-c` 与重定向更适合做审计基线'
      ],
      related: ['lu-setfacl', 'lu-chmod', 'lu-chown', 'lu-stat'],
      docs: 'https://man7.org/linux/man-pages/man1/getfacl.1.html',
      tags: ['ACL', '权限', '审计']
    },

    /* ---------- 21 / 56 ---------- */
    {
      id: 'lu-setfacl',
      name: 'setfacl',
      alias: ['setfacl -m', '默认ACL'],
      level: 3,
      syntax: 'setfacl [选项] <规则> <文件|目录>',
      summary: '给指定用户或组单独授予额外权限，不用改变目录归属。',
      desc: '典型场景：日志目录属主是 root，只让运维账号 deploy 读取，用 ACL 比把 deploy 塞进 root 组安全得多。给目录设默认 ACL 后，目录内新建的文件会自动带上同样的授权。',
      params: [
        { flag: '-m u:deploy:rx', desc: '给用户 deploy 追加 r-x 权限，g:组名 则是给组授权' },
        { flag: '-x u:deploy', desc: '删除指定用户的 ACL 条目' },
        { flag: '-b', desc: '清空全部 ACL，回到普通权限位' },
        { flag: '-R', desc: '递归应用到目录下所有内容' },
        { flag: '-d', desc: '设置默认 ACL，目录下新建的文件自动继承' },
        { flag: '--mask', desc: '同时重算 mask，避免新授权被 mask 压制' }
      ],
      examples: [
        { cmd: 'setfacl -m u:deploy:rx /data/www', desc: '只给 deploy 读与进入权限，不动属主属组' },
        { cmd: 'setfacl -R -m u:ops:rwx /data/share', desc: '递归给 ops 用户读写执行权限' },
        { cmd: 'setfacl -d -m u:deploy:rwx /data/upload', desc: '默认 ACL：之后在该目录新建的文件自动带 deploy 的权限' }
      ],
      notes: [
        '设了 ACL 后 `ls -l` 的组权限位显示的其实是 mask，不再代表属组权限，看到 rwx 却被拒绝往往就是 mask 在起作用',
        '`-R` 会把规则铺满整棵目录树，和 `chmod -R` 一样属于高风险操作，先在小范围验证',
        '文件系统必须支持 ACL（ext4 默认开启，老系统需 `mount -o acl`），否则报 Operation not supported',
        '批量复制 ACL 用 `getfacl -R 源目录 | setfacl --set-file=- 目标目录`，比手工重设可靠',
        '`-x` 只能删除具体条目，规则写错想全部推倒重来用 `-b`'
      ],
      related: ['lu-getfacl', 'lu-chmod', 'lu-chown', 'lu-umask'],
      docs: 'https://man7.org/linux/man-pages/man1/setfacl.1.html',
      tags: ['ACL', '授权', '权限']
    },

    /* ---------- 22 / 56 ---------- */
    {
      id: 'lu-getent',
      name: 'getent',
      alias: ['getent passwd', 'getent group', 'NSS'],
      level: 2,
      syntax: 'getent <数据库> [键]',
      summary: '通过 NSS 查询用户与组等系统数据库，比直接读 passwd 更全。',
      desc: '程序查账号走的是 NSS（可配置本地文件、LDAP、SSSD、winbind 等多个来源），`cat /etc/passwd` 只能看到本地文件这一份。接了域认证的环境里，只有 getent 才能查到域账号。',
      params: [
        { flag: 'passwd deploy', desc: '查询单个用户的账号条目' },
        { flag: 'group dev', desc: '查询组信息，包含成员列表' },
        { flag: 'passwd', desc: '列出全部用户，含 NSS 其他来源的账号' },
        { flag: 'shadow', desc: '读取影子密码条目，需要 root' },
        { flag: 'hosts 10.0.0.11', desc: '按 NSS 顺序做名称解析，网络排障常用' }
      ],
      examples: [
        { cmd: 'getent passwd deploy', desc: '确认用户是否存在，以及 UID、家目录、登录 shell' },
        { cmd: 'getent group docker', desc: '看 docker 组里都有哪些成员' },
        { cmd: 'getent passwd | awk -F: \'$3>=1000 && $3<65534 {print $1}\'', desc: '列出所有可登录的真实用户，做账号清理与审计' }
      ],
      notes: [
        '改完用户或组后用 `getent` 复核最可靠，它走的是程序真正使用的查询路径',
        '`getent shadow` 输出含密码哈希，属敏感操作，不要重定向到共享目录',
        '`getent hosts` 与 `getent ahosts` 行为不同：前者按 NSS 顺序返回，后者更接近真实解析流程，排查 DNS 问题时注意区分'
      ],
      related: ['lu-id', 'lu-groupadd', 'lu-lastlog', 'lu-useradd'],
      docs: 'https://man7.org/linux/man-pages/man1/getent.1.html',
      tags: ['用户', '查询', 'NSS']
    },

    /* ---------- 23 / 56 ---------- */
    {
      id: 'lu-stat',
      name: 'stat',
      alias: ['查看权限', 'inode'],
      level: 1,
      syntax: 'stat [选项] <文件|目录>',
      summary: '查看文件详细状态，含八进制权限、inode 与三个时间戳。',
      desc: '`ls -l` 只给概览，`stat` 给的是完整元数据：设备号、inode、硬链接数、八进制权限、属主属组，以及访问（Access）、修改（Modify）、状态变更（Change）三个时间。',
      params: [
        { flag: '-c "%a %U:%G %n"', desc: '自定义输出：八进制权限、属主、文件名，脚本里最好用' },
        { flag: '-f', desc: '显示所在文件系统的信息：类型、块大小、inode 用量' },
        { flag: '-L', desc: '跟随符号链接，查看目标文件的信息' },
        { flag: '-t', desc: '单行简洁输出，便于写日志' }
      ],
      examples: [
        { cmd: 'stat -c "%a %U:%G %n" /etc/passwd', desc: '输出 644 root:root /etc/passwd，适合批量比对权限基线' },
        { cmd: 'stat /data/www', desc: '查看 inode、块数与 Access/Modify/Change 三个时间' },
        { cmd: 'stat -f /data', desc: '查看 /data 的文件系统类型与 inode 总量' }
      ],
      notes: [
        '`%a` 是八进制权限（644），`%A` 是符号权限（-rw-r--r--），写脚本别混用',
        '`ls -l` 只显示 mtime，权限或属主被改动只反映在 ctime（Change）上，排查"谁改了我的权限"要看 stat',
        '带 ACL 的文件用 stat 看不到额外规则，还得配合 getfacl',
        '`stat -f` 能看 inode 使用率，磁盘还有空间却报 No space left on device 时用它定位'
      ],
      related: ['lu-chmod', 'lu-chown', 'lu-getfacl', 'lu-lsattr'],
      docs: 'https://man7.org/linux/man-pages/man1/stat.1.html',
      tags: ['权限', 'inode', '时间戳']
    },

    /* ---------- 24 / 56 ---------- */
    {
      id: 'lu-hostname',
      name: 'hostname',
      alias: ['主机名', 'hostname -I'],
      level: 1,
      syntax: 'hostname [选项] [新主机名]',
      summary: '显示或临时修改主机名，也常用来一次列出本机所有 IP。',
      desc: '不带参数时显示当前主机名；带参数时修改的是内核里的瞬态主机名，不写配置文件，重启即失效。要永久改主机名用 `hostnamectl set-hostname`。',
      params: [
        { flag: '-I', desc: '列出本机所有 IP 地址（大写 I），一条命令看全部网卡' },
        { flag: '-i', desc: '显示解析到的主机 IP，依赖 /etc/hosts 或 DNS' },
        { flag: '-f', desc: '显示完整域名 FQDN' },
        { flag: '-s', desc: '只显示第一个点之前的主机名短名' }
      ],
      examples: [
        { cmd: 'hostname', desc: '查看当前主机名' },
        { cmd: 'hostname -I', desc: '一次列出所有网卡 IP，比 ip addr 更快' },
        { cmd: 'hostname ecs-web01', desc: '临时改主机名，重启后失效，永久修改请用 hostnamectl' }
      ],
      notes: [
        '`hostname 新名字` 只改内核里的瞬态值，不写 `/etc/hostname`，重启就打回原形',
        '改完主机名要在 `/etc/hosts` 补一条 `127.0.1.1 新主机名`，否则 `sudo` 会报 unable to resolve host 并卡顿几秒',
        '`-i` 依赖名称解析，解析不到会返回 127.0.0.1 或报错，看真实地址请用 `-I`'
      ],
      related: ['lu-hostnamectl', 'lu-uname', 'lu-localectl'],
      docs: 'https://man7.org/linux/man-pages/man1/hostname.1.html',
      tags: ['主机名', '系统信息']
    },

    /* ---------- 25 / 56 ---------- */
    {
      id: 'lu-hostnamectl',
      name: 'hostnamectl',
      alias: ['set-hostname', '永久主机名'],
      level: 1,
      syntax: 'hostnamectl [set-hostname <主机名>]',
      summary: '永久修改主机名，顺带查看系统版本、内核与虚拟化平台。',
      desc: 'systemd 提供的主机名管理工具，写入 `/etc/hostname` 并立即生效。不带参数时输出的信息量很大：操作系统、内核、架构、虚拟化类型、时区、静态与瞬态主机名，是交付前的自检清单。',
      params: [
        { flag: 'set-hostname ecs-web01', desc: '永久设置静态主机名并写入 /etc/hostname' },
        { flag: '--static', desc: '只操作静态主机名（持久化，推荐）' },
        { flag: '--transient', desc: '只操作瞬态主机名，重启后丢失' },
        { flag: 'status', desc: '显示主机名、系统版本、内核、架构与虚拟化平台' }
      ],
      examples: [
        { cmd: 'hostnamectl set-hostname ecs-web01', desc: '华为云 ECS 买来第一件事：改成业务可读的主机名' },
        { cmd: 'hostnamectl', desc: '确认主机名、操作系统、内核与虚拟化类型' },
        { cmd: 'hostnamectl set-hostname ecs-db01 --static', desc: '只改持久化主机名，明确不碰瞬态值' }
      ],
      notes: [
        '`set-hostname` 立即生效且重启保留，不需要重启系统；已打开的 shell 提示符不会自动刷新，重新登录即可',
        '改完记得在 `/etc/hosts` 里加上新名字，否则依赖反解的程序（sudo、邮件）会变慢或报警',
        'CentOS 6 等没有 systemd 的系统上没有这个命令，需改 `/etc/sysconfig/network`'
      ],
      related: ['lu-hostname', 'lu-timedatectl', 'lu-localectl', 'lu-uname'],
      docs: 'https://man7.org/linux/man-pages/man1/hostnamectl.1.html',
      tags: ['主机名', 'systemd', '初始化']
    },

    /* ---------- 26 / 56 ---------- */
    {
      id: 'lu-date',
      name: 'date',
      alias: ['date -d', 'date +%F', '时间戳'],
      level: 1,
      syntax: 'date [选项] [+格式]',
      summary: '显示或设置系统时间，也是脚本里做时间戳与日期运算的工具。',
      desc: '不写格式串时按系统默认格式输出。写脚本时用 `+格式` 精确控制输出，用 `-d` 做相对时间计算：备份文件名、按天清理、日志切分都靠这两招。',
      params: [
        { flag: '+%F', desc: '格式化为 2024-05-01 形式，等价 %Y-%m-%d' },
        { flag: "+'%F %T'", desc: '日期加时间，如 2024-05-01 10:30:00' },
        { flag: '-d "-1 day"', desc: '相对时间计算，支持 yesterday、-3 hours、10 min ago' },
        { flag: '+%s', desc: '输出 Unix 时间戳（秒）' },
        { flag: '-d @1714500000', desc: '把时间戳还原成可读时间' },
        { flag: '-s "2024-05-01 10:00:00"', desc: '设置系统时间，需要 root' }
      ],
      examples: [
        { cmd: 'date +%F', desc: '输出 2024-05-01，做备份文件名最常用' },
        { cmd: 'date -d "-1 day" +%F', desc: '计算昨天的日期，写按天滚动的备份与清理脚本' },
        { cmd: 'tar czf /data/backup/www-$(date +%F).tar.gz /data/www', desc: '备份文件名带日期，天天跑也不会互相覆盖' }
      ],
      notes: [
        '`date -s` 手动改时间在有 NTP/chrony 的云主机上会被很快同步回去，改时间前先 `timedatectl set-ntp false`',
        '手动改时间会让 cron 任务错乱、日志时间跳变、证书校验失败，生产上除排障外不要动',
        '容器内默认是 UTC，`date` 与北京时间差 8 小时属正常现象，需在容器里挂载时区文件或设置 TZ',
        '格式串里的 `%` 写进 crontab 时必须转义成 `\\%`，否则会被 cron 当成换行符'
      ],
      related: ['lu-timedatectl', 'lu-crontab', 'lu-uptime', 'lu-localectl'],
      docs: 'https://man7.org/linux/man-pages/man1/date.1.html',
      tags: ['时间', '格式化', '脚本']
    },

    /* ---------- 27 / 56 ---------- */
    {
      id: 'lu-timedatectl',
      name: 'timedatectl',
      alias: ['set-timezone', '时区', 'NTP'],
      level: 2,
      syntax: 'timedatectl [set-timezone <时区>]',
      summary: '查看和设置系统时区与 NTP 同步，云主机时区纠偏的第一条命令。',
      desc: '同时管理系统时间、时区和网络时间同步。国内云主机默认多为 UTC，日志时间比北京时间早 8 小时，排障时对不上时间线，买到机器后先设时区再装业务。',
      params: [
        { flag: 'set-timezone Asia/Shanghai', desc: '设置时区，华为云 ECS 默认 UTC，改成东八区' },
        { flag: 'list-timezones', desc: '列出所有可用时区，配合 grep 过滤' },
        { flag: 'set-ntp true', desc: '开启或关闭网络时间同步（chrony 或 systemd-timesyncd）' },
        { flag: 'set-time "2024-05-01 10:00:00"', desc: '手动设置时间，NTP 开启时会被拒绝' },
        { flag: 'status', desc: '显示当前时间、时区、NTP 服务与同步状态' }
      ],
      examples: [
        { cmd: 'timedatectl', desc: '查看当前时区，以及 NTP 是否已同步' },
        { cmd: 'timedatectl set-timezone Asia/Shanghai', desc: '把云主机从 UTC 改为东八区，日志时间才与本地一致' },
        { cmd: 'timedatectl list-timezones | grep Asia', desc: '不确定时区名时先查，避免写成 Asia/Beijing 这种不存在的值' }
      ],
      notes: [
        '云主机时区坑：默认 UTC 时 `date` 比北京时间慢 8 小时，cron 任务、日志检索、证书校验全会错位，交付前必须确认时区',
        '时区名必须取自 `list-timezones`，`Asia/Beijing` 不存在，正确写法是 `Asia/Shanghai`',
        '改时区只影响宿主机，Docker 容器内是独立的，容器里要单独挂载 `/etc/localtime` 或设置 TZ 环境变量',
        'NTP 开启时 `set-time` 会报 Automatic time synchronization is enabled，先 `set-ntp false` 再改',
        'CentOS 6 没有这个命令，老系统用 `ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime`'
      ],
      related: ['lu-date', 'lu-hostnamectl', 'lu-localectl', 'lu-crontab'],
      docs: 'https://man7.org/linux/man-pages/man1/timedatectl.1.html',
      tags: ['时区', 'NTP', '云主机']
    },

    /* ---------- 28 / 56 ---------- */
    {
      id: 'lu-uptime',
      name: 'uptime',
      alias: ['负载', '开机时长'],
      level: 1,
      syntax: 'uptime [选项]',
      summary: '一行看清开机时长、登录人数与 1/5/15 分钟平均负载。',
      desc: '输出格式为：当前时间、已运行时长、登录用户数、负载均值。登录云主机第一眼就看它，既判断机器是否刚被重启过，也判断当前压力趋势。',
      params: [
        { flag: '-p', desc: '人类可读格式，如 up 3 days, 2 hours' },
        { flag: '-s', desc: '显示系统启动的时刻' }
      ],
      examples: [
        { cmd: 'uptime', desc: '看三个负载值，判断系统当前压力' },
        { cmd: 'uptime -p', desc: '看开机多久，确认机器是否刚被重启过' },
        { cmd: 'uptime -s', desc: '显示启动时间点，与 last reboot 相互印证' }
      ],
      notes: [
        '负载包含等待 IO 的进程，负载高不一定是 CPU 忙，要结合 `vmstat`、`iostat` 判断',
        '三个值依次是 1、5、15 分钟平均：1 分钟远大于 15 分钟说明负载正在上升',
        '云主机上运行时长明显小于预期，说明实例被重启或迁移过，先查 `last reboot` 与云监控事件',
        '负载值与 CPU 核数相关，8 核机器负载 8 才算跑满，别只看绝对值'
      ],
      related: ['lu-w', 'lu-last', 'lu-systemd-analyze', 'lu-reboot'],
      docs: 'https://man7.org/linux/man-pages/man1/uptime.1.html',
      tags: ['负载', '运行时长', '排障']
    },

    /* ---------- 29 / 56 ---------- */
    {
      id: 'lu-uname',
      name: 'uname',
      alias: ['arch', '内核版本', 'uname -a'],
      level: 1,
      syntax: 'uname [选项]',
      summary: '显示内核名称、版本与硬件架构，装驱动和软件包前必查。',
      desc: '`uname -m` 就是独立命令 `arch`，判断 x86_64 还是 aarch64（鲲鹏）时最直接。选软件包、装内核模块、确认容器基础镜像架构都要先看内核版本与架构。',
      params: [
        { flag: '-a', desc: '显示全部信息：内核名、主机名、内核版本、架构、操作系统' },
        { flag: '-r', desc: '只显示内核版本，装 kernel-devel、DKMS 驱动时对齐用' },
        { flag: '-m', desc: '显示硬件架构，如 x86_64、aarch64（等价于 arch）' },
        { flag: '-s', desc: '显示内核名称，通常是 Linux' },
        { flag: '-n', desc: '显示主机名，等价于 hostname' }
      ],
      examples: [
        { cmd: 'uname -a', desc: '一条命令看全内核与系统信息' },
        { cmd: 'uname -rm', desc: '内核版本加架构，下载软件包前确认' },
        { cmd: 'arch', desc: '独立命令，等价 uname -m，鲲鹏云主机上输出 aarch64' }
      ],
      notes: [
        '`arch` 与 `uname -m` 完全等价，排查 ARM 与 x86 软件包选型时用它最省事',
        '`uname -p` 在不少 x86 发行版上返回 unknown，不要用它判断 CPU 型号',
        '内核版本不等于发行版版本：`uname -r` 是内核，`cat /etc/os-release` 才是发行版版本'
      ],
      related: ['lu-lscpu', 'lu-lsb-release', 'lu-hostnamectl', 'lu-dmidecode'],
      docs: 'https://man7.org/linux/man-pages/man1/uname.1.html',
      tags: ['内核', '架构', '系统信息']
    },

    /* ---------- 30 / 56 ---------- */
    {
      id: 'lu-lsb-release',
      name: 'lsb_release',
      alias: ['版本', 'os-release'],
      level: 1,
      syntax: 'lsb_release [选项]',
      summary: '打印发行版名称与版本号，确认系统是 CentOS 还是 Ubuntu。',
      desc: '拿到一台陌生机器，先确认发行版与版本，才能决定用 `yum` 还是 `apt`、用 `firewalld` 还是 `ufw`。最小化安装可能没装这个命令，`/etc/os-release` 是更通用的替代方案。',
      params: [
        { flag: '-a', desc: '显示全部信息：发行版、描述、版本号、代号' },
        { flag: '-d', desc: '只显示描述信息' },
        { flag: '-r', desc: '只显示版本号，脚本里判断版本用' },
        { flag: '-c', desc: '显示版本代号，如 jammy、noble、Core' }
      ],
      examples: [
        { cmd: 'lsb_release -a', desc: '确认发行版与版本，决定后面用 yum 还是 apt' },
        { cmd: 'lsb_release -r', desc: '只取版本号，写安装脚本时判断分支' },
        { cmd: 'cat /etc/os-release', desc: '没装 lsb_release 时的通用替代方案，所有现代发行版都有' }
      ],
      notes: [
        '最小化安装的云主机常常没有这个命令：CentOS 装 `yum install redhat-lsb-core`，Ubuntu 装 `apt install lsb-release`',
        '脚本里判断发行版优先读 `/etc/os-release`（或 `source /etc/os-release` 后用 `$ID`、`$VERSION_ID`），不依赖 lsb_release',
        'Ubuntu 的 `-c` 输出代号（jammy、noble），换源时版本号与代号要对齐，抄错会导致 apt 更新失败'
      ],
      related: ['lu-uname', 'lu-lscpu', 'lu-hostnamectl', 'lu-dmidecode'],
      docs: 'https://manpages.debian.org/bookworm/lsb-release/lsb_release.1.en.html',
      tags: ['发行版', '版本', '系统信息']
    },

    /* ---------- 31 / 56 ---------- */
    {
      id: 'lu-lscpu',
      name: 'lscpu',
      alias: ['nproc', 'CPU核数', 'vCPU'],
      level: 1,
      syntax: 'lscpu [选项]',
      summary: '汇总 CPU 架构、物理核、线程与主频，买完 ECS 核对规格用。',
      desc: '数据来自 `/proc/cpuinfo` 与 sysfs，`lscpu` 帮你算好物理核、每核线程、NUMA 节点与缓存层级。`nproc` 则返回当前进程可用的处理器数，编译时常用 `make -j$(nproc)`。',
      params: [
        { flag: '-e', desc: '以表格形式列出每个逻辑 CPU 及其所属插槽与核' },
        { flag: '-p', desc: '输出可解析格式，便于脚本二次处理' },
        { flag: '--all', desc: '包含离线 CPU 在内的全部信息' }
      ],
      examples: [
        { cmd: 'lscpu', desc: '看架构、vCPU 数量与主频，核对是否与购买规格一致' },
        { cmd: 'lscpu | grep -E "Model name|^CPU\\(s\\)|Thread|Socket"', desc: '只看型号、核数、线程与物理插槽' },
        { cmd: 'nproc', desc: '显示可用处理单元数，编译脚本里常用 make -j$(nproc)' }
      ],
      notes: [
        '容器里 `nproc` 可能返回宿主机的核数，据此做 `make -j` 容易把整台宿主机资源打满，容器内建议显式指定并发数',
        '`nproc` 受 cgroup 与 CPU 亲和性限制，显示的是"可用"而不是"物理"数量，`nproc --all` 才是全部',
        '物理核（Core(s) per socket × Socket(s)）与逻辑 CPU（CPU(s)）之比就是超线程倍数，云主机规格里的 vCPU 指逻辑 CPU',
        '`lscpu` 显示的 CPU 型号在云主机上是虚拟化层透传的，可能与实际物理机型不同，采购核对以控制台规格为准'
      ],
      related: ['lu-uname', 'lu-dmidecode', 'lu-lsb-release', 'lu-uptime'],
      docs: 'https://man7.org/linux/man-pages/man1/lscpu.1.html',
      tags: ['CPU', '核数', '规格']
    },

    /* ---------- 32 / 56 ---------- */
    {
      id: 'lu-dmidecode',
      name: 'dmidecode',
      alias: ['硬件信息', '序列号', 'DMI'],
      level: 3,
      syntax: 'dmidecode [选项]',
      summary: '读取 SMBIOS/DMI 硬件信息，查厂商、内存槽与序列号，需要 root。',
      desc: '直接解析主板固件提供的 DMI 表，输出整机厂商、型号、序列号、BIOS 版本、内存槽位等物理信息。报修、资产登记、物理机扩容前确认空槽时用得上。',
      params: [
        { flag: '-t system', desc: '查看整机厂商、型号、序列号与 UUID' },
        { flag: '-t memory', desc: '查看内存槽位、容量、频率与厂商' },
        { flag: '-t processor', desc: '查看 CPU 型号与插槽信息' },
        { flag: '-t bios', desc: '查看 BIOS/UEFI 版本与发布日期' },
        { flag: '-s system-serial-number', desc: '只输出整机序列号，报修工单要用' }
      ],
      examples: [
        { cmd: 'dmidecode -t system', desc: '读取整机厂商、型号与序列号，提工单时填这些信息' },
        { cmd: 'dmidecode -s system-serial-number', desc: '只取序列号，方便直接贴进工单' },
        { cmd: 'dmidecode -t memory', desc: '看内存槽使用情况，物理机扩容前确认是否还有空槽' }
      ],
      notes: [
        '必须用 root 或 sudo 执行，普通用户会报 Permission denied，因为它需要读 `/dev/mem`',
        '云主机上的信息是虚拟化层伪造的：厂商、型号、槽位都是 QEMU 的固定值，不能用来判断真实硬件，规格以云控制台为准',
        '容器内通常无法使用（拿不到 /dev/mem 权限）',
        '原始输出很长，用 `-t` 过滤类型能少看几百行；不确定类型编号时可用 `-t 0` 查看支持的列表'
      ],
      related: ['lu-lscpu', 'lu-uname', 'lu-lsb-release', 'lu-stat'],
      docs: 'https://manpages.debian.org/bookworm/dmidecode/dmidecode.8.en.html',
      tags: ['硬件', '序列号', 'root']
    },

    /* ---------- 33 / 56 ---------- */
    {
      id: 'lu-systemctl',
      name: 'systemctl',
      alias: ['systemctl status', 'systemctl restart', '服务管理'],
      level: 2,
      syntax: 'systemctl <子命令> [单元名]',
      summary: 'systemd 的服务控制中枢，负责启动、停止、重启与查看状态。',
      desc: '单元名可以省略 `.service` 后缀，`systemctl status nginx` 与 `systemctl status nginx.service` 等价。status 输出里 Loaded 行显示 unit 文件路径与是否开机自启，Active 行显示运行状态，末尾还会附带最近 10 行日志，是排障第一站。',
      params: [
        { flag: 'start nginx', desc: '立即启动服务，不影响开机自启设置' },
        { flag: 'stop nginx', desc: '停止服务，已建立的连接会被断开' },
        { flag: 'restart nginx', desc: '重启服务，进程 PID 变化，连接瞬断' },
        { flag: 'reload nginx', desc: '只重读配置不重启进程，需要服务实现 ExecReload' },
        { flag: 'status nginx', desc: '查看运行状态、unit 路径与最近日志' },
        { flag: 'is-active nginx', desc: '只输出 active/inactive，脚本里判断服务是否在跑' },
        { flag: 'mask nginx', desc: '彻底屏蔽服务，连依赖它的单元也拉不起来' },
        { flag: '--no-pager', desc: '不进 less 分页，脚本与管道里必须加' }
      ],
      examples: [
        { cmd: 'systemctl status nginx --no-pager', desc: '看服务状态与最近日志，确认失败原因' },
        { cmd: 'systemctl reload nginx', desc: '平滑重载配置，不断连接，生产环境优先用这个' },
        { cmd: 'systemctl restart nginx', desc: '改完配置需要完整重启时使用，连接会瞬断' },
        { cmd: 'systemctl is-active nginx || systemctl start nginx', desc: '脚本里先判断再启动，避免重复启动' }
      ],
      notes: [
        '`restart` 与 `reload` 不同：reload 不杀进程不断连接，但服务没实现 ExecReload 时会报 Job type reload is not applicable',
        '`start` 失败先看 `systemctl status 服务名`，再看 `journalctl -u 服务名 -n 50 --no-pager`，九成问题在端口占用、配置语法或文件权限',
        '`stop` 只是本次停掉，机器重启后还会自启；要关开机自启得用 `systemctl disable`',
        '`mask` 比 `disable` 更彻底（软链到 /dev/null），被 mask 的服务连依赖都拉不起来，解除用 `unmask`',
        'CentOS 6、Ubuntu 14.04 及更早版本没有 systemd，只能用 `service` 与 `chkconfig`'
      ],
      related: ['lu-systemctl-enable', 'lu-systemctl-list', 'lu-systemctl-daemon-reload', 'lu-journalctl', 'lu-service'],
      docs: 'https://man7.org/linux/man-pages/man1/systemctl.1.html',
      tags: ['systemd', '服务', '排障']
    },

    /* ---------- 34 / 56 ---------- */
    {
      id: 'lu-systemctl-enable',
      name: 'systemctl enable',
      alias: ['开机自启', 'disable', 'is-enabled'],
      level: 2,
      syntax: 'systemctl enable [--now] <单元名>',
      summary: '设置服务开机自启，与立即启动是两件互不影响的事。',
      desc: '`enable` 做的是在 `/etc/systemd/system/multi-user.target.wants/` 下创建指向 unit 文件的软链接，开机时由 systemd 拉起；`start` 是现在就把进程拉起来。enable 了不等于现在在跑，start 了也不等于重启后还在，配 `--now` 才能一步到位。',
      params: [
        { flag: 'enable nginx', desc: '设置开机自启，不立即启动' },
        { flag: 'disable nginx', desc: '取消开机自启，不停止当前进程' },
        { flag: 'is-enabled nginx', desc: '查看自启状态：enabled/disabled/static/masked' },
        { flag: '--now', desc: '同时立即启动（enable）或立即停止（disable）' },
        { flag: '--force', desc: '强制覆盖已有的同名软链接' }
      ],
      examples: [
        { cmd: 'systemctl enable --now nginx', desc: '设置开机自启并立刻启动，部署脚本里最常用的一条' },
        { cmd: 'systemctl is-enabled nginx', desc: '确认自启状态，输出 enabled 才算成功' },
        { cmd: 'systemctl disable --now firewalld', desc: '取消自启并立即停止，注意 disable --now 会真的停服务' }
      ],
      notes: [
        '`is-enabled` 输出 `static` 表示该单元没有 `[Install]` 段，无法也不需要 enable，它由别的单元拉起',
        'enable 之后服务起不来是服务本身的问题，去看 `systemctl status` 与 `journalctl -b -u 服务名`',
        '改过 unit 文件内容再 enable 是没用的，必须先 `systemctl daemon-reload` 让 systemd 重读',
        '老系统对应命令是 `chkconfig nginx on`（CentOS 6）或 `update-rc.d nginx defaults`（Debian 老版本）'
      ],
      related: ['lu-systemctl', 'lu-systemctl-list', 'lu-systemctl-daemon-reload', 'lu-service'],
      docs: 'https://man7.org/linux/man-pages/man1/systemctl.1.html',
      tags: ['开机自启', 'systemd', '服务']
    },

    /* ---------- 35 / 56 ---------- */
    {
      id: 'lu-systemctl-list',
      name: 'systemctl list-units',
      alias: ['list-unit-files', 'systemctl --failed'],
      level: 2,
      syntax: 'systemctl list-units [选项] | systemctl list-unit-files [选项]',
      summary: '列出运行中的单元或已安装单元，快速找出启动失败的服务。',
      desc: '`list-units` 列的是已加载到内存的单元，`list-unit-files` 列的是磁盘上已安装的全部单元及其开机自启状态。接手一台机器、做安全加固、排查开机失败，基本都从这两条命令开始。',
      params: [
        { flag: '--type=service', desc: '只看服务类型单元，还有 socket、timer、mount 等类型' },
        { flag: '--state=running', desc: '只看运行中的，也可用 failed、exited、dead' },
        { flag: '--failed', desc: '只列启动失败的单元，排障第一站' },
        { flag: 'list-unit-files', desc: '列出所有已安装单元及其开机自启状态' },
        { flag: '--all', desc: '包含未激活的单元，不加时默认只显示已加载的' },
        { flag: '--no-pager', desc: '不分页输出，脚本中必加' },
        { flag: 'list-dependencies nginx', desc: '查看单元的依赖关系树' }
      ],
      examples: [
        { cmd: 'systemctl --failed --no-pager', desc: '开机后先跑这条，所有起不来的服务一目了然' },
        { cmd: 'systemctl list-units --type=service --state=running --no-pager', desc: '列出所有正在运行的服务' },
        { cmd: 'systemctl list-unit-files --type=service | grep enabled', desc: '核对开机自启清单，安全加固时筛掉多余服务' }
      ],
      notes: [
        '看不到某个服务时先分清用的是哪条命令：磁盘上装了但没启动的单元只在 `list-unit-files` 里出现',
        '`--failed` 的失败状态会保留到 `systemctl reset-failed`，服务恢复正常后记录不一定自动消失',
        '输出过长会自动进 less，脚本里忘记加 `--no-pager` 会卡住自动化流程',
        '排查依赖问题时用 `list-dependencies`，比逐个猜哪个单元没起来效率高得多'
      ],
      related: ['lu-systemctl', 'lu-systemctl-enable', 'lu-journalctl', 'lu-systemd-analyze'],
      docs: 'https://man7.org/linux/man-pages/man1/systemctl.1.html',
      tags: ['systemd', '服务列表', '排障']
    },

    /* ---------- 36 / 56 ---------- */
    {
      id: 'lu-systemctl-daemon-reload',
      name: 'systemctl daemon-reload',
      alias: ['daemon-reload', '重载unit'],
      level: 2,
      syntax: 'systemctl daemon-reload',
      summary: '新增或修改 unit 文件后重载 systemd 配置，不做这步改动不生效。',
      desc: 'systemd 会把 unit 文件解析后缓存在内存中，直接用编辑器改 `/etc/systemd/system/` 下的 `.service` 文件，systemd 并不知道内容变了，必须 `daemon-reload` 让它重新扫描。它只重读配置，不会重启或中断任何服务。',
      params: [
        { flag: '--system', desc: '重载系统级 systemd 配置（默认行为）' },
        { flag: '--user', desc: '重载当前用户的 systemd 配置，作用于 ~/.config/systemd/user/' }
      ],
      examples: [
        { cmd: 'systemctl daemon-reload && systemctl restart myapp', desc: '改完 myapp.service 后的标准两步，缺一不可' },
        { cmd: 'systemctl daemon-reload && systemctl status myapp --no-pager', desc: '重载后确认服务读取的是新配置' },
        { cmd: 'systemctl cat myapp', desc: '查看 systemd 实际生效的 unit 内容，验证改动是否被识别' }
      ],
      notes: [
        '最常见的事故：改了 `ExecStart` 却只 `systemctl restart`，服务跑的还是老命令，排查半天才发现忘了 daemon-reload',
        '只改服务自己的配置文件（如 nginx.conf）不需要 daemon-reload，用 `systemctl reload` 或 `restart` 即可；只有动了 unit 文件才需要',
        'unit 文件放错目录、文件名拼错、权限不是 644，都会导致 systemd 直接忽略它，用 `systemctl cat` 确认是否被识别',
        '`daemon-reload` 不会重启服务，新配置要等下次 start/restart 才真正生效'
      ],
      related: ['lu-systemctl', 'lu-systemd-unit', 'lu-systemctl-enable', 'lu-journalctl'],
      docs: 'https://man7.org/linux/man-pages/man1/systemctl.1.html',
      tags: ['systemd', 'unit', '坑']
    },

    /* ---------- 37 / 56 ---------- */
    {
      id: 'lu-systemd-unit',
      name: 'systemd unit 文件',
      kind: 'recipe',
      alias: ['[Unit]', '[Service]', '[Install]', 'myapp.service'],
      level: 3,
      syntax: '/etc/systemd/system/<名称>.service',
      summary: '自己写一个 systemd 服务单元，让业务程序交给 systemctl 管理。',
      desc: '三段结构：`[Unit]` 写描述与启动顺序，`[Service]` 定义怎么拉起进程，`[Install]` 决定 enable 时挂到哪个 target。查找优先级为 `/etc/systemd/system/` > `/run/systemd/system/` > `/usr/lib/systemd/system/`，自定义文件放 `/etc/systemd/system/`，不要改 `/usr/lib` 下的原件（升级会被覆盖）。',
      params: [
        { flag: 'Description=', desc: '[Unit] 段：服务说明，systemctl status 里会显示' },
        { flag: 'After=network.target', desc: '[Unit] 段：声明在网络就绪之后启动' },
        { flag: 'Type=simple', desc: '[Service] 段：默认类型，ExecStart 拉起的进程即主进程' },
        { flag: 'User=deploy', desc: '[Service] 段：以指定用户运行，降低权限' },
        { flag: 'ExecStart=', desc: '[Service] 段：启动命令，必须写绝对路径' },
        { flag: 'Restart=always', desc: '[Service] 段：进程退出后自动拉起，也可用 on-failure' },
        { flag: 'WorkingDirectory=', desc: '[Service] 段：工作目录，程序使用相对路径时必须设置' },
        { flag: 'WantedBy=multi-user.target', desc: '[Install] 段：enable 时挂载的目标，文本多用户模式' }
      ],
      examples: [
        {
          cmd: "cat > /etc/systemd/system/myapp.service <<'EOF'\n[Unit]\nDescription=My App Service\nAfter=network.target\n\n[Service]\nType=simple\nUser=deploy\nWorkingDirectory=/opt/myapp\nExecStart=/usr/bin/java -jar /opt/myapp/app.jar\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\nEOF",
          desc: '一键写入 unit 文件，注意 EOF 必须顶格、前后不能有空格'
        },
        { cmd: 'systemd-analyze verify /etc/systemd/system/myapp.service', desc: '写完先做语法与依赖校验，比启动失败后翻日志快' },
        { cmd: 'systemctl daemon-reload && systemctl enable --now myapp', desc: '新建 unit 后的标准动作：重载配置并设置自启启动' }
      ],
      notes: [
        '`ExecStart` 必须写绝对路径，写 `java`、`python3` 这类裸命令会直接报 No such file or directory',
        '`Type=simple` 与 `Type=forking` 选错会导致 systemd 认为进程已退出并反复重启：常驻前台程序用 simple，自己 daemonize 的老程序用 forking',
        '改完 unit 文件一定要 `systemctl daemon-reload`，只 restart 读不到新内容',
        '`User=` 指定普通用户后，程序要写的目录、日志、PID 文件都必须有对应权限，否则报 Permission denied 而 systemctl 只显示失败',
        '给已有服务加配置优先用 `systemctl edit 服务名` 生成 override 片段，别直接改 `/usr/lib/systemd/system/` 下的原文件',
        '写 systemd timer 时，`OnCalendar` 的字段顺序是"年-月-日 时:分:秒"，与 cron 完全不同'
      ],
      related: ['lu-systemctl-daemon-reload', 'lu-systemctl', 'lu-systemctl-enable', 'lu-systemd-timer'],
      docs: 'https://man7.org/linux/man-pages/man5/systemd.service.5.html',
      tags: ['systemd', 'unit', '服务']
    },

    /* ---------- 38 / 56 ---------- */
    {
      id: 'lu-journalctl',
      name: 'journalctl',
      alias: ['journalctl -u', 'journalctl -f', '查看日志'],
      level: 2,
      syntax: 'journalctl [选项] [匹配条件]',
      summary: '查看 systemd 统一日志，按服务、时间、级别精准定位问题。',
      desc: 'systemd 把内核、各服务以及程序 stdout/stderr 统一收进 journal。默认日志放在内存的 `/run/log/journal`，重启就丢；要让日志持久化，需在 `/etc/systemd/journald.conf` 里设 `Storage=persistent` 并创建 `/var/log/journal` 目录。',
      params: [
        { flag: '-u nginx', desc: '只看指定服务的日志，可写多个 -u' },
        { flag: '-f', desc: '实时跟踪新日志，等价于 tail -f' },
        { flag: '--since "10 min ago"', desc: '按时间过滤，支持 today、-1h、2024-05-01 10:00:00' },
        { flag: '-n 100', desc: '只看最后 100 行，默认只显示 10 行' },
        { flag: '-p err', desc: '按级别过滤：emerg/alert/crit/err/warning/notice/info/debug' },
        { flag: '--no-pager', desc: '不分页直接输出，脚本里必须加' },
        { flag: '-b', desc: '只看本次启动，-b -1 看上一次启动' },
        { flag: '--disk-usage', desc: '查看日志占用了多少磁盘空间' }
      ],
      examples: [
        { cmd: 'journalctl -u nginx --since "10 min ago" --no-pager', desc: '排障黄金组合：最近 10 分钟该服务的全部日志' },
        { cmd: 'journalctl -u myapp -f', desc: '实时跟踪服务输出，配合重启操作观察启动过程' },
        { cmd: 'journalctl -p err -b --no-pager', desc: '看本次开机以来所有 error 及以上级别的日志' },
        { cmd: 'journalctl --disk-usage', desc: '确认日志占用，系统盘吃紧时先看这个' }
      ],
      notes: [
        '默认日志只存在内存里，重启后全部丢失；要保留历史必须在 `/etc/systemd/journald.conf` 设 `Storage=persistent`，并 `mkdir -p /var/log/journal` 后 `systemctl restart systemd-journald`',
        '普通用户只能看自己的日志，要看全部日志需把账号加入 `systemd-journal` 组（Debian/Ubuntu 是 `adm` 组）或用 sudo',
        '`--no-pager` 在脚本与 CI 里必须加，否则会停在 less 里等按键',
        '日志默认不自动清理，长期运行会撑大 `/var/log/journal`，配合 `--vacuum-time` 与 `SystemMaxUse` 控制',
        '容器里通常没有 systemd，`journalctl` 会报 No journal files were found，容器日志要用 `docker logs`',
        '`-b -1` 查看上一次启动的日志，是判断"服务重启前发生了什么"的关键用法'
      ],
      related: ['lu-journalctl-vacuum', 'lu-systemctl', 'lu-last', 'lu-w'],
      docs: 'https://man7.org/linux/man-pages/man1/journalctl.1.html',
      tags: ['日志', '排障', 'systemd']
    },

    /* ---------- 39 / 56 ---------- */
    {
      id: 'lu-journalctl-vacuum',
      name: 'journalctl --vacuum',
      alias: ['--vacuum-time', '--vacuum-size', '日志清理'],
      level: 3,
      syntax: 'journalctl --vacuum-time=<时间> | --vacuum-size=<容量>',
      summary: '清理 systemd 日志释放磁盘，日志把系统盘撑满时用它救急。',
      desc: 'journal 默认会一直增长，云主机系统盘通常只有 40G，长期运行后 `/var/log/journal` 可能吃掉几十 G，进而导致服务起不来。清理有两种维度：按时间保留或按容量限制。',
      params: [
        { flag: '--vacuum-time=2d', desc: '只保留最近 2 天的日志，其余删除' },
        { flag: '--vacuum-size=500M', desc: '把日志压缩到 500M 以内，从最旧的开始删' },
        { flag: '--vacuum-files=5', desc: '最多保留 5 个日志归档文件' },
        { flag: '--rotate', desc: '先把当前日志文件切分再清理，通常与 vacuum 连用' },
        { flag: '--disk-usage', desc: '查看清理前后的占用空间' }
      ],
      examples: [
        { cmd: 'journalctl --disk-usage', desc: '先看日志占了多少，确认是不是它撑满了磁盘' },
        { cmd: 'journalctl --vacuum-time=7d', desc: '只保留 7 天日志，云主机磁盘告警时的常规处置' },
        { cmd: 'journalctl --vacuum-size=500M', desc: '按容量清理，适合日志量波动大的机器' }
      ],
      notes: [
        '清理只是治标：不改 `/etc/systemd/journald.conf` 里的 `SystemMaxUse`，日志很快又会长回来',
        '永久限制建议同时设置 `SystemMaxUse=500M` 与 `MaxRetentionSec=1month`，然后 `systemctl restart systemd-journald`',
        '删掉的日志不可恢复，事故复盘期间先确认不再需要取证，必要时先 `journalctl -u 服务名 > /data/incident.log` 导出',
        '`/var/log` 满会让服务起不来、SSH 也可能登录失败，长期方案是把日志目录挂到数据盘'
      ],
      related: ['lu-journalctl', 'lu-systemctl', 'lu-systemctl-list', 'lu-stat'],
      docs: 'https://man7.org/linux/man-pages/man1/journalctl.1.html',
      tags: ['日志', '磁盘', '清理']
    },

    /* ---------- 40 / 56 ---------- */
    {
      id: 'lu-service',
      name: 'service',
      alias: ['/etc/init.d', 'chkconfig', 'SysV'],
      level: 1,
      syntax: 'service <服务名> <start|stop|restart|reload|status>',
      summary: '老式 SysV 服务管理命令，在 systemd 系统上会转交 systemctl 执行。',
      desc: '命令与 systemctl 的对应关系：`service nginx start` 对应 `systemctl start nginx`，`chkconfig nginx on` 对应 `systemctl enable nginx`。CentOS 7+ 与 Ubuntu 16.04+ 上 `service` 仍然存在，背后是 systemd 的兼容层，脚本实体在 `/etc/init.d/`。',
      params: [
        { flag: 'start', desc: '启动服务' },
        { flag: 'stop', desc: '停止服务' },
        { flag: 'restart', desc: '重启服务' },
        { flag: 'reload', desc: '重载配置不中断连接' },
        { flag: 'status', desc: '查看状态，输出比 systemctl status 简略得多' },
        { flag: '--status-all', desc: 'Debian/Ubuntu 专有：列出所有服务的运行状态' }
      ],
      examples: [
        { cmd: 'service nginx status', desc: '快速看服务状态，老脚本与老文档里很常见' },
        { cmd: 'service nginx reload', desc: '等价于 systemctl reload nginx' },
        { cmd: 'service --status-all', desc: 'Ubuntu 上列出全部服务状态，标 [ + ] 的是运行中' }
      ],
      notes: [
        '新系统上排障统一用 `systemctl status` 与 `journalctl -u`，`service status` 看不到失败原因与最近日志',
        '`service` 只能操作 `/etc/init.d/` 下存在或 systemd 已注册的服务，自定义的 `myapp.service` 用 `service myapp start` 可能找不到',
        '开机自启的老命令是 `chkconfig 服务名 on`（CentOS 6）与 `update-rc.d 服务名 defaults`（Debian），新系统请统一用 `systemctl enable`'
      ],
      related: ['lu-systemctl', 'lu-systemctl-enable', 'lu-systemctl-list', 'lu-journalctl'],
      docs: 'https://manpages.debian.org/bookworm/init-system-helpers/service.8.en.html',
      tags: ['服务', 'SysV', '兼容']
    },

    /* ---------- 41 / 56 ---------- */
    {
      id: 'lu-crontab',
      name: 'crontab',
      alias: ['cron', 'crontab -e', '定时任务'],
      level: 2,
      syntax: 'crontab [-u 用户] [-e|-l|-r]',
      summary: '管理用户的周期定时任务，五段式时间字段决定执行频率。',
      desc: '五个字段依次是：分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-7，0 和 7 都表示周日)，后面跟要执行的命令。用户任务存放在 `/var/spool/cron/<用户>`（RHEL）或 `/var/spool/cron/crontabs/<用户>`（Debian）；系统级任务放在 `/etc/crontab` 与 `/etc/cron.d/`，那里多一个"用户名"字段。',
      params: [
        { flag: '-e', desc: '编辑当前用户的定时任务，保存即生效，不需要重启服务' },
        { flag: '-l', desc: '列出当前用户的定时任务' },
        { flag: '-r', desc: '删除当前用户的全部定时任务，没有二次确认' },
        { flag: '-u deploy', desc: '指定用户（只有 root 能用），配合 -l/-e/-r' },
        { flag: '*/5', desc: '分钟字段写 */5 表示每 5 分钟执行一次' },
        { flag: '1-5', desc: '范围写法，周字段 1-5 表示周一到周五' },
        { flag: '1,15', desc: '列表写法，日字段 1,15 表示每月 1 号和 15 号' },
        { flag: '@reboot', desc: '简写：开机后执行一次，还有 @daily、@hourly、@weekly' }
      ],
      examples: [
        { cmd: 'crontab -l', desc: '列出当前用户的定时任务，接手一台机器先看这个' },
        { cmd: '0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1', desc: '每天凌晨 3 点执行备份，输出重定向避免邮件堆积' },
        { cmd: '*/5 * * * * /usr/bin/curl -s http://127.0.0.1:8080/health >> /var/log/health.log 2>&1', desc: '每 5 分钟做一次健康检查，命令写绝对路径' },
        { cmd: 'crontab -u deploy -l', desc: 'root 查看 deploy 的定时任务，交接与审计时用' }
      ],
      notes: [
        '经典坑：cron 的环境变量极少，PATH 通常只有 `/usr/bin:/bin`，任务里的命令必须写绝对路径（如 `/usr/bin/curl`），否则手动能跑、cron 里报 command not found',
        '命令中的 `%` 会被 cron 解释为换行，日期格式化必须转义：`0 2 * * * tar czf /data/www-$(date +\\%F).tar.gz /data/www`',
        'cron 任务的 stdout/stderr 默认以邮件形式发送，机器上没配 MTA 会静默丢失，务必加 `>> 日志文件 2>&1`',
        '`crontab -r` 不做确认直接清空全部任务且不可恢复，误删只能从备份恢复；删除前先 `crontab -l > /data/cron-backup.txt`',
        '周字段与日字段同时被限定时是"或"的关系：`0 0 1 * 1` 表示每月 1 号**或**每周一都执行，不是两者同时满足',
        'cron 精度只到分钟，秒级需求要用 systemd timer 或循环脚本；`crontab -e` 保存后立即生效，但 cron 服务本身要在跑（CentOS 是 crond，Debian 是 cron）',
        '时区跟随系统：云主机默认 UTC 时任务会在北京时间凌晨 8 点执行，配 cron 前先用 `timedatectl` 确认时区'
      ],
      related: ['lu-cron-format', 'lu-systemd-timer', 'lu-at', 'lu-timedatectl'],
      docs: 'https://man7.org/linux/man-pages/man5/crontab.5.html',
      tags: ['定时任务', 'cron', '备份']
    },

    /* ---------- 42 / 56 ---------- */
    {
      id: 'lu-cron-format',
      name: 'cron 时间字段',
      kind: 'recipe',
      alias: ['cron 表达式', '*/5 * * * *', '时间字段'],
      level: 2,
      syntax: '分 时 日 月 周 <命令>',
      summary: 'cron 五段式时间字段速查，写任务前对照确认执行频率。',
      desc: '字段顺序固定为：分钟 小时 日期 月份 星期。取值范围：分 0-59、时 0-23、日 1-31、月 1-12、周 0-7（0 与 7 都表示周日）。通配符：`*` 任意值、`*/n` 每 n 个单位、`a-b` 范围、`a,b` 列举、`a-b/n` 范围内每隔 n 个。',
      params: [
        { flag: '0 3 * * *', desc: '每天 03:00 执行一次' },
        { flag: '*/10 * * * *', desc: '每 10 分钟执行一次' },
        { flag: '0 */2 * * *', desc: '每 2 小时的整点执行一次' },
        { flag: '30 1 * * 1-5', desc: '周一到周五 01:30 执行' },
        { flag: '0 0 1 * *', desc: '每月 1 号 00:00 执行' },
        { flag: '0 4 * * 6,0', desc: '每周六与周日 04:00 执行' },
        { flag: '@daily', desc: '等价 0 0 * * *，还有 @hourly、@weekly、@monthly、@reboot' }
      ],
      examples: [
        { cmd: '0 2 * * * /usr/bin/find /data/logs -name "*.log" -mtime +7 -delete', desc: '每天 02:00 清理 7 天前的日志' },
        { cmd: '*/30 8-20 * * 1-5 /opt/scripts/sync.sh >> /var/log/sync.log 2>&1', desc: '工作日 8 点到 20 点之间每 30 分钟同步一次' },
        { cmd: '0 1 1 */3 * /opt/scripts/archive.sh', desc: '每 3 个月的 1 号 01:00 归档一次，月字段用 */3' }
      ],
      notes: [
        '最容易写错的是字段位置：`* 3 * * *` 表示 3 点这一小时里每分钟都跑（一小时 60 次），要每天 3 点只跑一次必须写 `0 3 * * *`',
        '周与日字段同时不是 `*` 时按"或"匹配，容易造成远超预期的执行次数，需要"且"的逻辑时应在脚本里自行判断日期',
        'cron 表达式没有官方校验工具，写复杂表达式时先用 `date` 推算，或改用 systemd timer 的 `OnCalendar` 配合 `systemd-analyze calendar` 验证'
      ],
      related: ['lu-crontab', 'lu-systemd-timer', 'lu-at', 'lu-date'],
      docs: 'https://man7.org/linux/man-pages/man5/crontab.5.html',
      tags: ['定时任务', '速查', 'cron']
    },

    /* ---------- 43 / 56 ---------- */
    {
      id: 'lu-at',
      name: 'at',
      alias: ['atq', 'atrm', '一次性任务'],
      level: 2,
      syntax: 'at [-f 脚本] <时间>',
      summary: '安排只执行一次的定时任务，适合夜里做单次重启或数据迁移。',
      desc: '与 cron 的区别只执行一次，执行完任务自动从队列里消失。时间写法很灵活：`now + 10 minutes`、`03:00`、`teatime`。任务内容保存在 `/var/spool/at/`，重启机器也不会丢。',
      params: [
        { flag: 'now + 10 minutes', desc: '相对时间：10 分钟后执行' },
        { flag: '03:00', desc: '绝对时间：今天凌晨 3 点，时间已过则为明天' },
        { flag: '-l', desc: '列出待执行任务，等价于 atq' },
        { flag: '-c 3', desc: '查看编号为 3 的任务的具体内容' },
        { flag: '-d 3', desc: '删除编号为 3 的任务，等价于 atrm 3' },
        { flag: '-f /opt/scripts/job.sh', desc: '从文件读入要执行的命令' }
      ],
      examples: [
        { cmd: 'echo "/opt/scripts/restart-app.sh" | at 03:00', desc: '安排今天凌晨 3 点执行一次重启脚本' },
        { cmd: 'at now + 30 minutes -f /opt/scripts/collect.sh', desc: '30 分钟后采集一次现场信息' },
        { cmd: 'atq', desc: '列出所有待执行的一次性任务及其编号' }
      ],
      notes: [
        '`at` 依赖 `atd` 服务，任务不执行先确认 `systemctl status atd`（Debian 与 CentOS 都叫 atd）',
        '任务输出同样走邮件，需要留存就在命令里重定向到文件',
        '云主机上用它安排"稍后关机"很实用，但关机后无法远程开机，需配合控制台操作',
        '普通用户默认可能被 `/etc/at.allow`、`/etc/at.deny` 限制使用，任务提交失败先查这两个文件'
      ],
      related: ['lu-crontab', 'lu-systemd-timer', 'lu-cron-format', 'lu-shutdown'],
      docs: 'https://manpages.debian.org/bookworm/at/at.1.en.html',
      tags: ['定时任务', '一次性', '运维']
    },

    /* ---------- 44 / 56 ---------- */
    {
      id: 'lu-systemd-timer',
      name: 'systemd timer',
      alias: ['OnCalendar', 'list-timers', '持久化定时'],
      level: 3,
      syntax: '/etc/systemd/system/<名称>.timer 与同名 .service',
      summary: '用 timer 单元替代 cron，支持错过补跑、日志入 journal 与依赖管理。',
      desc: '一个定时任务由两个文件组成：`.service` 定义做什么，`.timer` 定义什么时候做。核心是 `OnCalendar=`（绝对时间）或 `OnUnitActiveSec=`（相对上次执行的间隔），`Persistent=true` 让关机期间错过的任务在开机后补跑一次，这是 cron 做不到的能力。',
      params: [
        { flag: 'OnCalendar=*-*-* 03:00:00', desc: '每天 03:00 触发，字段顺序是 年-月-日 时:分:秒' },
        { flag: 'OnCalendar=Mon..Fri *-*-* 09:00', desc: '工作日 9 点触发，支持 Mon..Fri 范围写法' },
        { flag: 'OnUnitActiveSec=10min', desc: '相对上次执行后 10 分钟再次触发' },
        { flag: 'Persistent=true', desc: '关机期间错过的任务开机后补跑一次' },
        { flag: 'RandomizedDelaySec=60', desc: '随机延迟，避免多台机器同时触发打爆后端' },
        { flag: 'Unit=backup.service', desc: '指定要触发的服务单元，不写则默认找同名 .service' },
        { flag: 'WantedBy=timers.target', desc: '[Install] 段的固定写法，enable 时挂到 timers.target' }
      ],
      examples: [
        { cmd: 'systemctl list-timers --all', desc: '列出所有定时器及下次触发时间，替代 crontab -l' },
        { cmd: 'systemctl enable --now backup.timer', desc: '启用并立即装载定时器，注意启动的是 timer 不是服务' },
        { cmd: 'systemd-analyze calendar "Mon..Fri *-*-* 09:00:00"', desc: '验证 OnCalendar 表达式并打印下次触发时间' }
      ],
      notes: [
        'timer 必须与同名 service 配对，或显式写 `Unit=`；只有 timer 没有对应 service 会报找不到单元',
        '改动 `.timer` 或 `.service` 后必须 `systemctl daemon-reload`，再 `systemctl restart xxx.timer` 才会按新时间表走',
        '`OnCalendar` 的字段顺序是"年-月-日 时:分:秒"，与 cron 的"分 时 日 月 周"完全不同，照抄 cron 表达式必错',
        '调试时先手工 `systemctl start xxx.service` 跑一次，确认服务本身没问题再交给 timer 调度',
        '执行记录统一进 journal，`journalctl -u xxx.service` 就能看到每次任务的输出，不必再重定向日志'
      ],
      related: ['lu-crontab', 'lu-systemd-unit', 'lu-systemctl-daemon-reload', 'lu-systemctl-list'],
      docs: 'https://man7.org/linux/man-pages/man5/systemd.timer.5.html',
      tags: ['定时任务', 'systemd', 'timer']
    },

    /* ---------- 45 / 56 ---------- */
    {
      id: 'lu-shutdown',
      name: 'shutdown',
      alias: ['关机', 'shutdown -h now', 'shutdown -c'],
      level: 2,
      syntax: 'shutdown [选项] <时间> [消息]',
      summary: '按计划关机或重启，会提前通知所有登录用户，可随时取消。',
      desc: '生产环境停机的标准做法：先广播通知、留出缓冲时间、再执行。`+10` 表示 10 分钟后，`-c` 可以取消已经排定的计划，避免手滑直接断掉线上连接。',
      params: [
        { flag: '-h now', desc: '立即关机，等价于 poweroff' },
        { flag: '-h +10', desc: '10 分钟后关机，给在线用户留出保存时间' },
        { flag: '-r +5', desc: '5 分钟后重启' },
        { flag: '-c', desc: '取消已经排定的关机或重启计划' },
        { flag: '23:00', desc: '指定绝对时间执行，如 shutdown -h 23:00' },
        { flag: '-k', desc: '只广播警告消息，不真的关机' }
      ],
      examples: [
        { cmd: 'shutdown -h +10 "系统将于 10 分钟后维护关机，请保存工作"', desc: '生产环境停机前先广播，避免直接断人连接' },
        { cmd: 'shutdown -r +5', desc: '5 分钟后重启，排障后需要重启时用' },
        { cmd: 'shutdown -c', desc: '取消已排定的关机计划，误操作后的补救命令' }
      ],
      notes: [
        '`shutdown -h now` 在云主机上执行后 SSH 立即断开，实例不会自动开机，要到控制台点"开机"',
        '关机不会等待业务优雅退出，数据库类服务应先 `systemctl stop` 再关机，避免数据损坏',
        '华为云等按需计费实例关机后是否继续计费取决于计费模式与"关机不收费"设置，成本敏感的业务要确认',
        '`shutdown -c` 能取消本机上任何人排定的计划，只要有权限执行'
      ],
      related: ['lu-reboot', 'lu-poweroff', 'lu-halt', 'lu-systemctl'],
      docs: 'https://man7.org/linux/man-pages/man8/shutdown.8.html',
      tags: ['关机', '重启', '维护']
    },

    /* ---------- 46 / 56 ---------- */
    {
      id: 'lu-reboot',
      name: 'reboot',
      alias: ['重启', 'systemctl reboot'],
      level: 1,
      syntax: 'reboot [选项]',
      summary: '立即重启系统，改内核参数或升级内核后必须执行。',
      desc: '正常重启会先停止所有服务、同步磁盘再重启，等价于 `systemctl reboot`。升级内核、修改 `/etc/fstab`、调整 sysctl 参数后都需要重启才真正生效。',
      params: [
        { flag: '（无参数）', desc: '正常重启，优雅停止服务并同步文件系统' },
        { flag: '-f', desc: '强制重启，不通知服务也不卸载文件系统，可能丢数据' },
        { flag: '-p', desc: '关机而不是重启（部分实现支持）' }
      ],
      examples: [
        { cmd: 'reboot', desc: '正常重启，等价于 systemctl reboot' },
        { cmd: 'shutdown -r +1', desc: '更稳妥的写法：1 分钟后重启并广播通知' },
        { cmd: 'last reboot', desc: '查看重启历史，确认机器是否被意外重启过' }
      ],
      notes: [
        '`reboot -f` 跳过服务停止与文件系统卸载，云主机上等同硬重启，只在系统完全卡死时用',
        '重启前确认没有未完成的数据写入或挂载的 NFS、云盘，必要时手工 `sync` 并 `umount` 数据盘',
        '云主机重启通常需要 1~3 分钟，公网 IP 在弹性公网 IP 绑定后保持不变，按需分配的场景可能变化',
        '内核升级后要重启才能生效，重启前可用 `uname -r` 记录当前版本，重启后再核对'
      ],
      related: ['lu-shutdown', 'lu-poweroff', 'lu-halt', 'lu-uptime'],
      docs: 'https://man7.org/linux/man-pages/man8/reboot.8.html',
      tags: ['重启', '维护', '内核']
    },

    /* ---------- 47 / 56 ---------- */
    {
      id: 'lu-halt',
      name: 'halt',
      alias: ['停机', 'systemctl halt'],
      level: 2,
      syntax: 'halt [选项]',
      summary: '停止系统运行，物理机上停 CPU，云主机上表现为关机。',
      desc: '传统语义是"停 CPU 不断电"，需要人工断电；在 systemd 系统上 `halt`、`poweroff`、`reboot` 都是指向 `systemctl` 的软链接，最终行为由 systemd 与虚拟化平台决定。',
      params: [
        { flag: '-p', desc: '停机并断电，等价于 poweroff' },
        { flag: '-f', desc: '强制停机，不停止服务' },
        { flag: '-n', desc: '不做 sync 直接停机，非常危险' }
      ],
      examples: [
        { cmd: 'halt', desc: '停止系统运行，云主机上通常表现为关机' },
        { cmd: 'halt -p', desc: '停机并断电，需要彻底关机时用这个' },
        { cmd: 'systemctl halt', desc: 'systemd 下的等价写法，效果一致' }
      ],
      notes: [
        '`halt` 与 `poweroff` 的差别在物理机上才明显：halt 停在 "System halted" 等待断电，poweroff 会发 ACPI 断电信号',
        'CentOS 7+、Ubuntu 16.04+ 中 `halt`、`poweroff`、`reboot` 都是指向 systemctl 的软链接，实际行为由 systemd 决定',
        '云主机上执行 `halt` 后实例通常表现为关机，但不同虚拟化平台对停机指令的模拟不一致，要明确关机请用 `poweroff` 或控制台操作',
        '`-f`、`-n` 都会跳过正常的服务停止流程，可能丢数据，只在系统无响应时使用'
      ],
      related: ['lu-poweroff', 'lu-shutdown', 'lu-reboot', 'lu-systemctl'],
      docs: 'https://man7.org/linux/man-pages/man8/halt.8.html',
      tags: ['关机', '停机', 'systemd']
    },

    /* ---------- 48 / 56 ---------- */
    {
      id: 'lu-poweroff',
      name: 'poweroff',
      alias: ['关机断电', 'systemctl poweroff'],
      level: 1,
      syntax: 'poweroff [选项]',
      summary: '关机并切断电源，云主机上等于在控制台点了一次关机。',
      desc: '先优雅停止所有服务、同步磁盘，再发出断电信号，等价于 `systemctl poweroff` 与 `shutdown -h now`。批量运维脚本里关机用 `shutdown -h +1` 更稳妥，留出取消窗口。',
      params: [
        { flag: '（无参数）', desc: '优雅关机：停止服务、同步磁盘后断电' },
        { flag: '-f', desc: '强制关机，跳过服务停止流程' },
        { flag: '--no-wall', desc: '不向登录用户广播关机消息' }
      ],
      examples: [
        { cmd: 'poweroff', desc: '正常关机，等价于 systemctl poweroff' },
        { cmd: 'shutdown -h +5 "5 分钟后关机维护"', desc: '有在线用户时更推荐这种带通知的写法' },
        { cmd: 'last -x | grep shutdown', desc: '查看历史关机记录，确认关机时间点' }
      ],
      notes: [
        '关机后无法通过 SSH 唤醒，云主机要到控制台点"开机"；弹性公网 IP 一般不变，按需实例关机后是否计费要看计费模式',
        '直接关机不会等业务优雅退出，MySQL、Kafka 这类服务应先 `systemctl stop` 再关机',
        '`poweroff -f` 相当于拔电源，只在系统完全无响应时使用，可能损坏文件系统',
        '关机前建议确认数据盘已 `umount` 或写入完成，云硬盘异常卸载有丢数据风险'
      ],
      related: ['lu-shutdown', 'lu-halt', 'lu-reboot', 'lu-systemctl'],
      docs: 'https://man7.org/linux/man-pages/man8/poweroff.8.html',
      tags: ['关机', '云主机', '维护']
    },

    /* ---------- 49 / 56 ---------- */
    {
      id: 'lu-runlevel',
      name: 'runlevel',
      alias: ['init', 'telinit', '运行级别', 'target'],
      level: 2,
      syntax: 'runlevel | init <0-6> | systemctl get-default',
      summary: '查看与切换系统运行级别，systemd 下用 target 表达同一概念。',
      desc: '传统运行级别：0 关机、1 单用户、2 多用户无网络、3 多用户文本、5 图形界面、6 重启。systemd 用 target 替代：`multi-user.target` 对应 3，`graphical.target` 对应 5，`rescue.target` 对应 1，`poweroff.target` 对应 0。',
      params: [
        { flag: 'runlevel', desc: '显示上次与当前的运行级别，输出如 N 3' },
        { flag: 'init 3', desc: '切换到多用户文本模式，服务器常用' },
        { flag: 'init 6', desc: '重启系统' },
        { flag: 'init 0', desc: '关机' },
        { flag: 'systemctl get-default', desc: '查看默认启动 target' },
        { flag: 'systemctl set-default multi-user.target', desc: '设置默认启动为文本模式，服务器推荐' }
      ],
      examples: [
        { cmd: 'runlevel', desc: '查看当前运行级别，输出 N 3 表示文本多用户模式' },
        { cmd: 'systemctl get-default', desc: '查看默认 target，服务器应为 multi-user.target' },
        { cmd: 'systemctl isolate multi-user.target', desc: '不重启就切到文本模式，图形界面机器省内存' }
      ],
      notes: [
        '`init 0`、`init 6` 在云主机上等于远程关机或重启，SSH 会立刻断开，操作前确认能通过控制台恢复',
        'systemd 系统上不要用 `init` 切换运行级别，它只是兼容层，正确做法是 `systemctl isolate <target>`',
        '`systemctl isolate` 会停止不属于目标 target 的服务，生产环境谨慎使用',
        '`who -r` 也能看运行级别，输出里还带上次切换的时间'
      ],
      related: ['lu-systemctl', 'lu-shutdown', 'lu-reboot', 'lu-systemd-analyze'],
      docs: 'https://man7.org/linux/man-pages/man8/runlevel.8.html',
      tags: ['运行级别', 'target', '启动']
    },

    /* ---------- 50 / 56 ---------- */
    {
      id: 'lu-systemd-analyze',
      name: 'systemd-analyze',
      alias: ['blame', '启动耗时', 'critical-chain'],
      level: 3,
      syntax: 'systemd-analyze [子命令]',
      summary: '分析开机各阶段耗时，找出拖慢启动的服务并量化优化效果。',
      desc: '把启动过程拆成内核、initrd、用户空间三段分别计时，`blame` 按耗时排序所有服务，`critical-chain` 指出真正的串行瓶颈。云主机重启慢、开机后要等很久才能登录时用它定位。',
      params: [
        { flag: '（无参数）', desc: '显示内核、initrd、用户空间三个阶段的总耗时' },
        { flag: 'blame', desc: '按耗时从长到短列出各服务的启动时间' },
        { flag: 'critical-chain', desc: '显示关键启动链路，指出真正的瓶颈依赖' },
        { flag: 'verify <unit文件>', desc: '校验 unit 文件语法与依赖是否正确' },
        { flag: 'plot > boot.svg', desc: '生成启动时序图，便于对比优化前后' }
      ],
      examples: [
        { cmd: 'systemd-analyze', desc: '看总启动耗时，重启慢的第一条命令' },
        { cmd: 'systemd-analyze blame | head -20', desc: '列出最慢的 20 个服务，定位优化目标' },
        { cmd: 'systemd-analyze verify /etc/systemd/system/myapp.service', desc: '自定义 unit 写完后先做语法校验' }
      ],
      notes: [
        '`blame` 列出的耗时是并行启动下的时间，直接相加没有意义，真正的瓶颈要看 `critical-chain`',
        '网络等待（NetworkManager-wait-online.service）常是云主机启动慢的主因，不需要网络的机器可以 mask 掉',
        '`verify` 只检查写法与依赖关系，不检查 ExecStart 指向的程序是否真的能运行',
        '对比优化效果时用 `systemd-analyze plot` 导出 svg，比看数字直观得多'
      ],
      related: ['lu-systemctl', 'lu-systemctl-list', 'lu-uptime', 'lu-systemd-unit'],
      docs: 'https://man7.org/linux/man-pages/man1/systemd-analyze.1.html',
      tags: ['启动', '性能', 'systemd']
    },

    /* ---------- 51 / 56 ---------- */
    {
      id: 'lu-w',
      name: 'w',
      alias: ['who', '在线用户', '当前登录'],
      level: 1,
      syntax: 'w [选项] [用户名]',
      summary: '列出当前登录的用户、来源 IP 与正在执行的命令，兼看负载。',
      desc: '第一行与 `uptime` 输出一致，下面是每个登录会话的详细信息：终端、来源、登录时间、空闲时间、当前进程。发现异常登录时这是最快的一眼确认方式。`who` 是它的精简版，只列用户与终端。',
      params: [
        { flag: '-h', desc: '不输出表头，便于脚本解析' },
        { flag: '-s', desc: '简洁模式，省略登录时间与 CPU 时间' },
        { flag: '-i', desc: '来源显示为 IP 地址而不是主机名，解析更快' },
        { flag: 'deploy', desc: '只看指定用户的会话' }
      ],
      examples: [
        { cmd: 'w', desc: '一眼看清谁在线、从哪个 IP 登录、在跑什么命令' },
        { cmd: 'w -h', desc: '去掉表头，方便脚本或 awk 处理' },
        { cmd: 'who', desc: '只看登录用户与终端，不显示负载与当前命令' }
      ],
      notes: [
        '第一行与 `uptime` 一致，系统负载可以顺手一起看',
        '看到陌生来源 IP 或可疑命令（如 `wget` 拉取脚本）要按安全事件处理：先 `loginctl terminate-user` 踢掉，再改密码与密钥',
        '`who am i`（带空格）只看自己这一次登录，`whoami` 是另一回事（查当前有效用户）',
        'WHAT 列显示的是当前进程命令行，长命令会被截断'
      ],
      related: ['lu-last', 'lu-lastlog', 'lu-loginctl', 'lu-uptime'],
      docs: 'https://man7.org/linux/man-pages/man1/w.1.html',
      tags: ['登录', '会话', '安全']
    },

    /* ---------- 52 / 56 ---------- */
    {
      id: 'lu-last',
      name: 'last',
      alias: ['last reboot', 'lastb', '登录历史'],
      level: 1,
      syntax: 'last [选项] [用户名|tty]',
      summary: '读取登录历史记录，查看谁在什么时候登录过、机器何时重启。',
      desc: '数据来自 `/var/log/wtmp`，按时间倒序显示登录、注销与系统重启事件。排障时用来确认"服务异常的时间点有没有人登录过""机器是不是被重启过"。',
      params: [
        { flag: '-n 20', desc: '只显示最近 20 条记录' },
        { flag: 'reboot', desc: '只看重启历史，即关机与启动事件' },
        { flag: '-x', desc: '包含关机、运行级别切换等系统事件' },
        { flag: '-i', desc: '来源显示为 IP 而不是主机名，避免反解慢' },
        { flag: '-F', desc: '显示完整的登录与登出时间' }
      ],
      examples: [
        { cmd: 'last -n 20', desc: '看最近 20 次登录记录，安全排查第一步' },
        { cmd: 'last reboot', desc: '查看重启历史，确认服务器是否被意外重启' },
        { cmd: 'last deploy', desc: '只看某个账号的登录历史，交接与审计时用' }
      ],
      notes: [
        '数据来自 `/var/log/wtmp`，会随日志轮转被清理，历史有限；长期留存要开启 journal 持久化或把日志集中收集',
        '失败登录记录要用 `lastb`（读 `/var/log/btmp`），需要 root 权限，爆破攻击的特征在这里最明显',
        '被入侵的机器上 wtmp、btmp 可能已被清理，`last` 正常不代表没被登录过，要结合 `journalctl` 与云平台的操作审计',
        '`last -x` 能把关机与运行级别切换事件一起列出来，定位"谁在什么时候重启了机器"很有效'
      ],
      related: ['lu-lastlog', 'lu-w', 'lu-loginctl', 'lu-journalctl'],
      docs: 'https://man7.org/linux/man-pages/man1/last.1.html',
      tags: ['登录', '审计', '安全']
    },

    /* ---------- 53 / 56 ---------- */
    {
      id: 'lu-lastlog',
      name: 'lastlog',
      alias: ['最近登录', '从未登录', '账号审计'],
      level: 1,
      syntax: 'lastlog [选项]',
      summary: '列出每个账号最后一次登录时间，找出从未使用的闲置账号。',
      desc: '数据来自 `/var/log/lastlog`，按 UID 顺序为每个账号记录最后一次登录的时间与来源。做账号收敛时，"Never logged in"的列表就是最直接的清理依据。',
      params: [
        { flag: '-u deploy', desc: '只看指定用户的最后登录时间' },
        { flag: '-t 30', desc: '只显示最近 30 天内登录过的账号' },
        { flag: '-b 7', desc: '只显示 7 天以前登录过的账号' }
      ],
      examples: [
        { cmd: 'lastlog', desc: '全量列出，标 Never logged in 的账号就是清理对象' },
        { cmd: 'lastlog -u deploy', desc: '确认运维账号是否真的被使用过' },
        { cmd: 'lastlog -t 30', desc: '筛出近 30 天有登录的账号，收敛可登录账号范围' }
      ],
      notes: [
        '`/var/log/lastlog` 是稀疏文件，`ls -lh` 可能显示几 GB 而实际占用极小，不要被大小吓到',
        '`Never logged in` 的账号要区分对待：服务账号属正常，能登录的系统账号（如 adm、lp）应考虑锁掉或改成 nologin',
        '普通用户只能看到自己的记录，做全量审计需要 root',
        '`lastlog` 只有最后一次记录，要看完整时间线用 `last`'
      ],
      related: ['lu-last', 'lu-w', 'lu-passwd', 'lu-chage'],
      docs: 'https://man7.org/linux/man-pages/man8/lastlog.8.html',
      tags: ['审计', '账号', '安全']
    },

    /* ---------- 54 / 56 ---------- */
    {
      id: 'lu-loginctl',
      name: 'loginctl',
      alias: ['list-sessions', 'terminate-user', '踢人'],
      level: 2,
      syntax: 'loginctl <子命令> [会话|用户]',
      summary: '管理登录会话，查看谁在线并强制踢掉指定用户的全部会话。',
      desc: 'systemd-logind 的客户端工具，能看到会话编号、TTY、来源与登录时间。应急响应时用它把可疑会话连同该用户的所有进程一起终止，比逐个 `kill` 干净。',
      params: [
        { flag: 'list-sessions', desc: '列出所有会话及其编号' },
        { flag: 'list-users', desc: '列出当前有活动会话的用户' },
        { flag: 'session-status 3', desc: '查看 3 号会话的详情：终端、来源、登录时间' },
        { flag: 'show-user deploy', desc: '查看用户会话详情，含 Linger 设置' },
        { flag: 'terminate-user deploy', desc: '终止该用户的所有会话与进程' },
        { flag: 'terminate-session 3', desc: '只终止 3 号会话' },
        { flag: 'enable-linger deploy', desc: '允许该用户未登录时也运行 systemd 用户服务' }
      ],
      examples: [
        { cmd: 'loginctl list-sessions', desc: '列出所有登录会话及编号，排查异常登录' },
        { cmd: 'loginctl terminate-user deploy', desc: '强制踢掉 deploy 的所有会话，会同时杀掉其全部进程' },
        { cmd: 'loginctl enable-linger deploy', desc: '让用户的 systemctl --user 服务在退出登录后继续运行' }
      ],
      notes: [
        '`terminate-user` 会杀掉该用户的所有进程，包括他启动的业务程序与后台任务，生产环境执行前先确认影响面',
        '踢掉会话不等于封禁账号：对方持有密钥可以立刻重新登录，要真正阻断需改密码、清 `authorized_keys` 或用 `usermod -L` 锁定',
        '`enable-linger` 配合 `systemctl --user` 是让普通用户运行常驻服务的关键开关，不开启则退出登录后用户服务全部停止',
        'CentOS 6 等老系统没有 systemd-logind，对应做法是 `pkill -u 用户名`'
      ],
      related: ['lu-w', 'lu-last', 'lu-su', 'lu-systemctl'],
      docs: 'https://man7.org/linux/man-pages/man1/loginctl.1.html',
      tags: ['会话', '登录', '应急']
    },

    /* ---------- 55 / 56 ---------- */
    {
      id: 'lu-localectl',
      name: 'localectl',
      alias: ['set-locale', 'LANG', '乱码'],
      level: 2,
      syntax: 'localectl [set-locale <语言>] [set-keymap <键盘>]',
      summary: '查看和设置系统语言与键盘布局，解决中文乱码与控制台输入问题。',
      desc: '设置结果写入 `/etc/locale.conf`，影响所有用户的语言环境。`LANG` 决定报错信息语言、排序规则与字符编码，云主机默认常见 `LANG=C` 或未设置，中文文件名与日志会显示成问号。',
      params: [
        { flag: 'status', desc: '显示当前语言环境与键盘布局' },
        { flag: 'set-locale LANG=en_US.UTF-8', desc: '设置系统语言，写入 /etc/locale.conf' },
        { flag: 'list-locales', desc: '列出系统已生成的可用语言环境' },
        { flag: 'set-keymap us', desc: '设置虚拟控制台键盘布局' },
        { flag: 'set-x11-keymap us', desc: '设置图形界面键盘布局' }
      ],
      examples: [
        { cmd: 'localectl', desc: '查看当前 LANG 与键盘设置' },
        { cmd: 'localectl set-locale LANG=en_US.UTF-8', desc: '统一为英文加 UTF-8，脚本输出与日志最稳定' },
        { cmd: 'localectl list-locales | grep zh_CN', desc: '确认中文语言环境是否已生成，没有就要先 locale-gen' }
      ],
      notes: [
        '云主机默认 `LANG=C` 或未设置时，中文文件名、日志与 systemctl 输出会乱码或显示问号，装业务前先确认编码',
        '`LANG=C` 也有好处：报错是英文、排序结果稳定，写自动化脚本时反而推荐临时 `export LANG=C`',
        'Debian/Ubuntu 上只设 localectl 可能不够，还要 `locale-gen zh_CN.UTF-8` 生成语言包，并检查 `/etc/default/locale`',
        '语言与时间无关：语言用 localectl，时区与 NTP 用 timedatectl，两者不要混用'
      ],
      related: ['lu-timedatectl', 'lu-hostnamectl', 'lu-date'],
      docs: 'https://man7.org/linux/man-pages/man1/localectl.1.html',
      tags: ['语言', '编码', '乱码']
    },

    /* ---------- 56 / 56 ---------- */
    {
      id: 'lu-update-alternatives',
      name: 'update-alternatives',
      alias: ['alternatives', '切换版本', '多版本管理'],
      level: 3,
      syntax: 'update-alternatives --install <链接> <名称> <路径> <优先级>',
      summary: '管理同一命令的多个版本，做软链接层面的版本切换与回退。',
      desc: 'Debian/Ubuntu 用 `update-alternatives`，CentOS/RHEL 用 `alternatives`，参数完全一致。它把 `/usr/bin/java` 这类入口链接到 `/etc/alternatives/java`，再由它指向真正的版本文件，从而做到不改脚本就能换版本。',
      params: [
        { flag: '--install /usr/bin/java java /usr/lib/jvm/jdk-11/bin/java 1100', desc: '注册候选版本，最后的数字是优先级' },
        { flag: '--config java', desc: '交互式选择要使用的版本' },
        { flag: '--set java /usr/lib/jvm/jdk-11/bin/java', desc: '非交互直接指定版本，脚本里用' },
        { flag: '--display java', desc: '查看当前指向与全部候选版本' },
        { flag: '--list java', desc: '只列出候选版本路径' },
        { flag: '--remove java /usr/lib/jvm/jdk-8/bin/java', desc: '移除某个候选版本' },
        { flag: '--auto java', desc: '恢复自动模式，按优先级自动选择' }
      ],
      examples: [
        { cmd: 'update-alternatives --display java', desc: '查看 java 当前指向哪个 JDK、还有哪些候选版本' },
        { cmd: 'update-alternatives --config java', desc: '交互式切换 JDK 版本，装完多版本后必做' },
        { cmd: 'update-alternatives --set java /usr/lib/jvm/jdk-11/bin/java', desc: '脚本里非交互切换，按路径精确指定' }
      ],
      notes: [
        'CentOS/RHEL 上命令名是 `alternatives`，参数完全相同，不要以为系统里没有这个工具',
        '`/etc/alternatives` 是这套机制的核心，不要手工删改里面的链接，否则一批命令会同时失效',
        '注册时给的路径必须是真实存在的可执行文件，写错会导致 `--config` 选完之后命令直接找不到',
        '切换版本后用 `java -version` 验证；`JAVA_HOME` 不会跟着自动变，需要手工设置或写进 `/etc/profile.d/`',
        '手工 `ln -sf` 改 `/usr/bin/java` 会被系统更新覆盖，多版本共存统一用 alternatives 管理'
      ],
      related: ['lu-localectl', 'lu-uname', 'lu-chmod'],
      docs: 'https://man7.org/linux/man-pages/man1/update-alternatives.1.html',
      tags: ['多版本', '软链接', 'Java']
    }
  );
})();
