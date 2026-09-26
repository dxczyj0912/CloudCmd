/* data/lessons-sec.js · 安全与合规（练习课）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。每节课的 steps[].cmd 必须是**引擎真能跑通**的
   命令（tools/shell-check.js 会把每节课的 answer/alt/step.cmd 逐条执行验证），
   每步都要有 ref（回指命令手册条目 id）与两级 hint。

   本文件的场景与站内剧情一致：
     · 站点证书 web.example.com 2024-04-01 到期；api.example.com 的链只回 1 张
     · firewalld 的 public 域只放行 80/tcp 与 8080/tcp，**没有 3306**（与
       data/lessons-cloud.js 的 hw-sg-3306 是同一条排障线的云上 / 本机两段）
     · /data/www 的文件标签是 default_t，策略库里没有它的规则
     · /var/log/secure 与 btmp 里留着 198.51.100.77 的爆破痕迹

   写法约定：
     · 步骤对象**一行一个** —— tools/hint-check.js 与 about-leak-check.js 按行解析
     · 命令里的字符串一律用双引号，避免与外层单引号冲突
     · 同一条命令里不要混用 `||` 与 `;`（引擎遇到 `A || B; C` 且 A 成功时会跳过 C）
     · 每一步的 cmd 都必须以 0 退出：像 `--query-port`（没放行时退出码 1）、
       `clamscan`（命中时退出码 1）这类"非零也是结论"的命令，要自己补一句 echo
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

      /* ================= 1 · 证书链不完整 ================= */
      {
        id: 'sec-chain-incomplete',
        cat: 'security',
        title: '浏览器能打开，Java 却说不信任这张证书',
        prompt: '监控报 api.example.com 的接口调用失败：Java 客户端抛 unable to get local issuer certificate，可运维用浏览器打开同一个地址却完全正常。同一个域名，两种结论。',
        task: '确认 api.example.com 下发的证书链比正常域名少了中间证书，并留下可复核的证据',
        steps: [
          { title: '先用正常域名立个基线', about: '对正常域名走一次握手，只看最后的校验结论', cmd: 'openssl s_client -connect web.example.com:443 -servername web.example.com -brief </dev/null', ref: 'sec-openssl-sclient', hint: ['先立一个"正常"的基线：同一台服务上另一个域名的握手结论长什么样，后面才有对照物。', 'openssl s_client -connect web.example.com:443 -servername web.example.com ____ </dev/null'], note: 'Verification: OK —— 这张链是完整的，可以当对照' },
          { title: '换上报错的那个域名', about: '对报错域名再握一次手，比对两次结论的差别', cmd: 'openssl s_client -connect api.example.com:443 -servername api.example.com -brief </dev/null', ref: 'sec-openssl-sclient', hint: ['把域名换成报错的那一个，重点看最后一行结论从 OK 变成了什么。', 'openssl s_client -connect api.example.com:443 -servername api.example.com ____ </dev/null'], note: 'Verification: unable to verify the first certificate (code 21)：客户端补不上链' },
          { title: '把完整握手结果落盘', about: '把整段输出写进一个文件，便于反复查看', cmd: 'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null > /tmp/chain-api.txt', ref: 'sec-cert-chain', hint: ['完整输出太长，终端刷过去就没了：先把它落到一个文件里，后面才好反复数、反复看。', 'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null > ____'], note: '长输出落盘是排障的标准手法：终端不再刷屏，证据也留在了文件里' },
          { title: '数一数服务端发了几张证书', about: '在刚才那份文件里数证书块的条数', cmd: 'grep -c "BEGIN CERTIFICATE" /tmp/chain-api.txt', ref: 'sec-cert-chain', hint: ['在刚才那份文件里数证书块的条数 —— 数出来的是"服务端实际发了几张"，不是"链上应该有几张"。', 'grep ____ "BEGIN CERTIFICATE" /tmp/chain-api.txt'], note: '返回 1 = 只有叶子证书；正常应该是 2（叶子 + 中间证书）' },
          { title: '对正常域名做同一套动作', about: '把正常域名的输出另存一份，别覆盖证据', cmd: 'openssl s_client -connect web.example.com:443 -servername web.example.com -showcerts </dev/null > /tmp/chain-web.txt', ref: 'sec-cert-chain', hint: ['把同一套动作套到正常域名上：落盘的文件换个名字，别把刚才那份证据覆盖掉。', 'openssl s_client -connect web.example.com:443 -servername web.example.com -showcerts </dev/null > ____'], note: '两份文件分开存，最后才能并排比较' },
          { title: '比较两份文件的数字', about: '数出正常域名那份里的证书块条数', cmd: 'grep -c "BEGIN CERTIFICATE" /tmp/chain-web.txt', ref: 'sec-cert-chain', hint: ['用同一套数法量正常域名：它给出的数字就是"完整"的标准，差值就是漏发的那张。', 'grep ____ "BEGIN CERTIFICATE" /tmp/chain-web.txt'], note: '2 = 叶子 + 中间证书。少的那张只能由服务端补发，客户端变不出来' }
        ],
        answer: 'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null > /tmp/chain-api.txt && grep -c "BEGIN CERTIFICATE" /tmp/chain-api.txt',
        alt: [
          'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null > /tmp/chain-api.txt && grep -c "BEGIN CERT" /tmp/chain-api.txt',
          'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null > /tmp/chain-api.txt && cat /tmp/chain-api.txt | grep -c "BEGIN CERTIFICATE"'
        ],
        /* 判据是"数出来 1 张证书"。不能用 /^1$/ —— 引擎会把教学提示追加在 stderr 上，
           而 shell-check 与终端都把 stdout+stderr 一起看，整串就不等于 "1" 了。
           用 /(^|\D)1(\D|$)/ 要求"1 是独立的一个数字"，既不会漏判也不会被 12、21 这类数字骗过。 */
        expect: /(^|\D)1(\D|$)/,
        teach: '证书链的排查顺序固定：先握手看 `Verify return code`（0 正常 / 21 缺中间证书 / 10 过期 / 62 域名不匹配）→ 再用 `-showcerts` 把服务端下发的证书落盘数张数 → 最后才谈改配置。`21` 的含义是"服务端只发了叶子证书"：浏览器会自动去补链（AIA fetching），Java、Python、curl、Go 这类客户端不会，于是出现"浏览器正常、程序报错"的经典分裂。修复办法是把中间证书按「叶子在前、中间在后」拼成 fullchain，Nginx 的 `ssl_certificate` 指向 fullchain、`ssl_certificate_key` 仍只指私钥，reload 之后再数一次确认变成 2 张。另外记住：链不完整和证书到期是两类问题 —— 前者任何时刻都报错，后者到点才报错，`openssl x509 -noout -enddate` / `-checkend` 管的是后者。'
      },

      /* ================= 2 · 本机防火墙没放行 3306 ================= */
      {
        id: 'sec-fw-3306-blocked',
        cat: 'security',
        title: '数据库连不上：本机防火墙这一层也得查',
        prompt: '应用日志里全是连 db-prod-01:3306 超时。安全组那边已经确认放行过 3306，DBA 也说数据库活着、账号密码没动过 —— 那就只剩本机这一层了。',
        task: '在本机确认 3306 没有被放行，把它放行，并复核规则真的生效',
        steps: [
          { title: '先确认防火墙这一层是开着的', about: '看本机防火墙当前是运行还是停用', cmd: 'firewall-cmd --state', ref: 'ln-firewall-cmd', hint: ['规则只在防火墙进程活着的时候才算数：先确认这一层是启用状态，再谈放行。', 'firewall-cmd ____'], note: 'running 才需要往下查；not running 说明拦包的不是它' },
          { title: '确认数据库到底有没有在听', about: '列出本机监听的端口与持有进程', cmd: 'ss -lntp', ref: 'ln-ss', hint: ['顺序是"服务先监听、防火墙再放行"——先把本机正在听的口子列出来，确认 3306 上有人。', 'ss ____'], note: 'LISTEN 列表里 mysqld 正占着 0.0.0.0:3306 —— 服务端没问题，往防火墙查' },
          { title: '把当前区域放行了什么一次看全', about: '一次列出这个区域放行的服务与端口', cmd: 'firewall-cmd --list-all', ref: 'ln-firewall-cmd', hint: ['不要逐个端口去猜：把当前活动区域的服务、端口、富规则一次看全，缺口自己会露出来。', 'firewall-cmd ____'], note: 'services 里有 ssh、http，ports 里只有 80/tcp 与 8080/tcp —— 3306 不在其中' },
          { title: '用能当脚本判据的写法问一次', about: '直接问 3306 放没放行，并把结论打出来', cmd: 'firewall-cmd --query-port=3306/tcp || echo "3306/tcp 未放行：拦包的是本机防火墙"', ref: 'ln-troubleshoot-firewall', hint: ['这一步只要"放行 / 没放行"两种结论之一；而且脚本要靠退出码判断，所以查不到时顺手把结论打出来。', 'firewall-cmd ____ || echo "3306/tcp 未放行：拦包的是本机防火墙"'], note: '输出 no 且退出码为 1 —— 这就是"数据库连不上"在本机的根因' },
          { title: '放行它并当场复核', about: '写进持久配置、重新加载、再问一次', cmd: 'firewall-cmd --permanent --add-port=3306/tcp && firewall-cmd --reload && firewall-cmd --query-port=3306/tcp', ref: 'ln-firewall-cmd', hint: ['永久配置与运行时是两套规则集：写完配置必须重新加载，最后再问一次确认真的通了。', 'firewall-cmd --permanent --add-port=3306/tcp && firewall-cmd ____ && firewall-cmd --query-port=3306/tcp'], note: 'success → success → yes；少了 --reload 这一步，规则不会在当前生效' }
        ],
        answer: 'firewall-cmd --permanent --add-port=3306/tcp && firewall-cmd --reload && firewall-cmd --query-port=3306/tcp',
        alt: [
          'firewall-cmd --permanent --add-port=3306/tcp && firewall-cmd --reload && firewall-cmd --query-port=3306/tcp --zone=public',
          'firewall-cmd --permanent --add-port=3306/tcp; firewall-cmd --reload; firewall-cmd --query-port=3306/tcp'
        ],
        expect: /^yes$/m,
        teach: 'firewalld 有两套**互相独立**的规则集：不加 `--permanent` 只改运行时（立即生效、重启即失），加了 `--permanent` 不执行 `--reload` 则当前不生效 —— 所以正确姿势永远是「`--permanent --add-port` + `--reload`」两步都做。云主机上排查端口不通的顺序是：**安全组 → 本机防火墙 → 服务是否监听 → 应用绑定地址**，跳过任何一层都会白折腾。`firewall-cmd --query-port=xxx/tcp` 是给脚本用的：它把 `yes`/`no` 打到标准输出，同时用退出码表达结论，所以可以写成 `if firewall-cmd --query-port=3306/tcp; then ...`。最后注意 `--reload` 会重建规则链并断开已建立的连接，生产上避开业务高峰执行。'
      },

      /* ================= 3 · SELinux 文件标签 ================= */
      {
        id: 'sec-selinux-www-403',
        cat: 'security',
        title: '权限位都对，Nginx 还是 403',
        prompt: '网站目录从 /var/www/html 搬到了 /data/www，权限位与属主都照抄了旧目录，Nginx 却开始回 403，错误日志里只有一句笼统的 Permission denied。',
        task: '确认这次拒绝来自 SELinux，定位被拒的对象，并按正确顺序把标签修好',
        steps: [
          { title: '先看强制访问控制处在哪种模式', about: '确认这套机制当前是拦截还是只记录', cmd: 'getenforce', ref: 'sec-getenforce', hint: ['被拦的前提是这套机制真的在拦：先看它当前处在三种模式里的哪一种。', '____'], note: 'Enforcing 表示策略真的在拦截；Permissive 只记录不拦，问题就不在它身上' },
          { title: '从审计日志里读拒绝记录', about: '读最近这段时间的拒绝记录', cmd: 'ausearch -m avc -ts recent -i', ref: 'sec-ausearch', hint: ['应用日志只有一句笼统的拒绝，真正的判决记在审计子系统里：按类型捞拒绝，再把时间限定在"最近"。', 'ausearch -m avc ____ -i'], note: '读法：scontext 是发起方域（httpd_t），tcontext 是目标标签（default_t），tclass 是对象类型（file / tcp_socket），denied { } 里是被拒的动作' },
          { title: '查策略库里有没有这个目录的规则', about: '把策略库里的路径规则整张表列出来', cmd: 'semanage fcontext -l', ref: 'sec-semanage-fcontext', hint: ['文件被拒往往不是权限位的问题，而是"该给它什么标签"这件事在策略库里根本没定义 —— 先把规则表列出来看。', 'semanage fcontext ____'], note: '与 /data 有关的只有 /data/backup 一条，/data/www 完全没被定义 —— 所以重打标签也无从下手' },
          { title: '改之前先空跑一遍', about: '演练一次，看按现有规则会改成什么', cmd: 'restorecon -Rnv /data/www', ref: 'sec-restorecon', hint: ['动生产目录之前先空跑：它只告诉你按现有规则重打之后应该是什么，不碰任何文件。', 'restorecon ____ /data/www'], note: '全是"已是 default_t，无需修改"：策略库里没有规则，单独用它救不了这个目录' },
          { title: '把规则写进策略库', about: '给这个目录定义一个"该被当成哪类内容"的规则', cmd: 'semanage fcontext -a -t httpd_sys_content_t /data/www || echo "（规则已存在，跳过）"', ref: 'sec-semanage-fcontext', hint: ['权限位管不了标签：得先在策略库里写明这个目录该被当成哪一类内容，标签才有依据。', 'semanage fcontext -a -t ____ /data/www || echo "（规则已存在，跳过）"'], note: '成功的 semanage 什么都不打印 —— 没有输出就是好消息；类型写错等于没修' },
          { title: '把规则套到文件上并看改动明细', about: '让标签真正落到文件，并逐行打出改动', cmd: 'restorecon -Rv /data/www', ref: 'sec-restorecon', hint: ['规则只是"应该是什么"，还要让它落到实际文件上，并把改了哪些对象一行行打出来。', 'restorecon ____ /data/www'], note: '看到 Relabeled ... to httpd_sys_content_t 才算真的修好；这一步不做，规则就只是躺在策略库里' }
        ],
        answer: 'semanage fcontext -a -t httpd_sys_content_t /data/www; restorecon -Rv /data/www',
        alt: [
          'semanage fcontext -a -t httpd_sys_content_t /data/www; restorecon -R -v /data/www'
        ],
        expect: /httpd_sys_content_t/,
        teach: 'SELinux 拒绝的处置顺序是四步：① 看模式 → ② 从审计日志读 AVC → ③ **按 `tclass` 分流** —— `file`/`dir` 类是标签问题（`semanage fcontext -a` + `restorecon`），`tcp_socket` 类是端口或布尔开关问题（`setsebool -P httpd_can_network_connect on` 或 `semanage port -a`）→ ④ 复查确认不再产生新拒绝。三个最常见的坑：用 `chcon` 改标签（`restorecon` 或系统重打标签时会被冲掉，生产上必须用 `semanage fcontext` + `restorecon` 的组合）；直接 `setenforce 0` 长期运行（等于关掉一层强制访问控制，等保测评直接扣分）；只加规则不 `restorecon`（规则躺在策略库里，文件标签一点没变）。'
      },

      /* ================= 4 · SSH 爆破取证 ================= */
      {
        id: 'sec-ssh-brute-force',
        cat: 'security',
        title: '有人在猜 SSH 密码：把证据翻出来',
        prompt: '这一夜监控没有告警，早上你顺手看了一眼安全日志：有一批来自同一个公网地址的登录失败记录，时间挨得很密。',
        task: '找出爆破的来源与被猜的用户名，确认历史记录里是不是同一伙人，再看自动封禁有没有生效',
        steps: [
          { title: '先数一数失败登录有多少条', about: '量化失败登录的次数', cmd: 'grep -c "Failed password" /var/log/secure', ref: 'sec-secure-log', hint: ['先量化：这类记录有多少条，是判断"偶发输错密码"还是"正在被爆破"的第一手数字。', 'grep ____ "Failed password" /var/log/secure'], note: '3 条集中在十几秒内 —— 这个密度不是人手敲得出来的' },
          { title: '把被猜的用户名统计出来', about: '按字段切出用户名并统计出现次数', cmd: 'grep "Failed password" /var/log/secure | cut -d" " -f11 | sort | uniq -c', ref: 'sec-secure-log', hint: ['日志每行的字段位置是固定的：按空格切开，取出用户名那一列，再统计每个名字出现了几次。', 'grep "Failed password" /var/log/secure | cut -d" " ____ | sort | uniq -c'], note: 'admin / root / test 各被猜一次 —— 攻击者拿常见账号名在广撒网' },
          { title: '翻一翻轮转压缩过的历史日志', about: '到压缩归档里找同一来源更早的动作', cmd: 'zgrep "Failed password" /var/log/secure-20240317.gz', ref: 'sec-secure-log', hint: ['当前日志只是一小段：轮转并压缩过的归档里往往藏着同一来源更早的动作，压缩文件要换个命令来搜。', 'zgrep "Failed password" ____'], note: '昨天也有来自 198.51.100.77 的失败记录 —— 这不是第一次' },
          { title: '看失败登录账本里最近记了谁', about: '打印失败登录账本的最近几条', cmd: 'lastb | head -5', ref: 'sec-lastb', hint: ['系统单独维护了一份"登录失败"的账本，把最近几条打出来，能看到来源地址与时间。', 'lastb | head ____'], note: 'admin / root / test 都来自 198.51.100.77，和日志里的来源一致' },
          { title: '确认自动封禁有没有生效', about: '看封禁看守当前的状态与封禁名单', cmd: 'fail2ban-client status sshd', ref: 'sec-fail2ban', hint: ['光看日志不够：还要确认自动封禁的看守是不是已经把可疑地址关在门外，当前封了几个。', 'fail2ban-client status ____'], note: 'Banned IP list 里已经有 198.51.100.77；但 ignoreip 必须写上跳板机与内网网段，否则容易把自己人关在门外' }
        ],
        answer: 'grep "Failed password" /var/log/secure | cut -d" " -f11 | sort | uniq -c',
        alt: [
          'grep "Failed password" /var/log/secure | cut -d" " -f11 | sort | uniq -c | sort -rn',
          'grep "Failed password" /var/log/secure | cut -d" " -f11 | sort | uniq -c | head -3'
        ],
        expect: /admin/,
        teach: '取证顺序：**量化**（失败次数与密度）→ **归因**（来源 IP + 被猜的用户名）→ **历史**（轮转归档，判断是不是持续了几天）→ **处置**（fail2ban 封禁、安全组收紧 22 端口来源、只留密钥登录、必要时改端口）。两个容易被忽略的细节：日志轮转后是 `.gz`，要用 `zgrep` / `zcat` 才搜得到；`lastb` 读的是 `/var/log/btmp`（失败记录，权限 600），而 `last` 读的是 `/var/log/wtmp`（成功登录）。封禁一定要留后路 —— `ignoreip` 里写清跳板机与内网网段，把运维自己关在门外是 fail2ban 最著名的事故。'
      },

      /* ================= 5 · 恶意文件与加固基线 ================= */
      {
        id: 'sec-upload-scan-baseline',
        cat: 'security',
        title: '交付前那台机器：恶意文件与加固基线一起过一遍',
        prompt: '交付前夜，这台机器明天要交给甲方验收。账号和端口都清过一轮了，剩下两件事：确认没被塞进恶意文件，以及拿出一份日后能对比的加固基线。',
        task: '更新病毒库、扫出中转目录里的感染文件，再取一份主机加固基线与被改动过的系统文件清单',
        steps: [
          { title: '先把病毒库更新到最新', about: '确认特征库版本与更新时间', cmd: 'freshclam', ref: 'sec-clamav', hint: ['库过期等于白扫：先确认特征库的版本与更新时间，必要时先更新再扫。', '____'], note: 'daily / main / bytecode 三个库都是 up-to-date，扫描结果才可信' },
          { title: '先在干净目录上认一认正常输出', about: '扫描一个确定干净的目录，建立对照', cmd: 'clamscan -r /data/www', ref: 'sec-clamav', hint: ['先拿一个确定干净的目录试手：这一步是为了认清"扫描通过"时的输出形状与最后的统计行。', 'clamscan ____ /data/www'], note: 'Infected files: 0 —— 干净目录是后面所有结论的对照' },
          { title: '扫描外部文件进来的中转目录', about: '只打印命中的文件，并补出退出码结论', cmd: 'clamscan -r -i /data/upload || echo "命中感染文件：退出码 1 表示需要处置"', ref: 'sec-clamav', hint: ['上传中转目录是外部文件进来的地方：只打印命中的那些行；命中时命令以非零退出码结束，把结论补出来。', 'clamscan -r -i /data/upload || echo "____"'], note: 'xlsm 命中宏病毒；退出码 1 正是脚本里判断"要不要拉响警报"的依据' },
          { title: '取一份主机加固基线', about: '拿一个能复算的加固评分与警告清单', cmd: 'lynis --quick', ref: 'sec-lynis', hint: ['验收要的不是"我觉得挺安全"，而是一个能复算的分数与警告清单；只输出摘要的那种跑法最快。', 'lynis ____'], note: 'Hardening index 68 —— 分数本身不说明问题，下次跑完和这次的差值才说明问题' },
          { title: '找出与包数据库对不上的文件', about: '逐个文件与安装包记录做完整性比对', cmd: 'rpm -Va', ref: 'sec-rpm-va', hint: ['被换过的二进制、被改过的配置都会在这里露头：逐个文件与包数据库里的记录比对一遍。', 'rpm ____'], note: 'S.5....T. 表示大小/校验和/时间戳有变化；/usr/bin/ps 与 netstat 被动过，是典型的后门藏身处' }
        ],
        answer: 'clamscan -r -i /data/upload || echo "命中感染文件：退出码 1 表示需要处置"',
        alt: [
          'clamscan -r --infected /data/upload || echo "命中感染文件：退出码 1 表示需要处置"',
          'clamscan -r -i /data/upload/20240318-report.xlsm || echo "命中感染文件：退出码 1 表示需要处置"'
        ],
        expect: /FOUND/,
        teach: '交付前的自查清单：① **先更新病毒库再扫**（库过期等于没扫）→ ② 用干净目录建立对照 → ③ 扫外部文件进入的目录（上传、共享、下载）→ ④ 取主机加固基线（lynis 的分数与警告列表，下次对比差值）→ ⑤ 做文件完整性校验（`rpm -Va` / `debsums`）看系统二进制有没有被动过。命中之后**先隔离再处置**：`--move` 到隔离区而不是直接 `--remove`，保留样本才能做后续分析与溯源。另外要心里有数：`clamscan` 命中时会以退出码 1 结束，所以自动化脚本里必须显式处理这个"预期内的失败"，否则扫描任务天天报红，最后没人再看它。'
      },

      /* ================= 6 · 交付包签名与备份加密 ================= */
      {
        id: 'sec-release-sign-gpg',
        cat: 'security',
        title: '怎么证明这个安装包没被人动过',
        prompt: '测试组要把安装包带到客户现场部署，客户安全部门提了两个要求：给出这个包的校验值，并且要能证明它确实出自从你们团队之手。',
        task: '算出安装包的摘要、签一份独立签名并当场验签，顺手把要外送的数据库备份加密',
        steps: [
          { title: '先算出这个包的摘要值', about: '给安装包算一个固定长度的指纹', cmd: 'openssl dgst -sha256 /opt/pkg/app-1.2.3.tar.gz', ref: 'sec-openssl-dgst', hint: ['完整性核对的第一步是拿到一个固定长度的"指纹"：文件变一个字节，这个值就完全不同。', 'openssl dgst ____ /opt/pkg/app-1.2.3.tar.gz'], note: '这串 64 位十六进制要随发布说明一起公布，客户下载后自行复算比对' },
          { title: '用私钥签一份独立签名', about: '为这个包生成一个独立签名文件', cmd: 'gpg --detach-sign --armor /opt/pkg/app-1.2.3.tar.gz', ref: 'sec-gpg', hint: ['摘要只能证明"没坏"，证明不了"谁发的"—— 用私钥签一份独立签名，随包一起交付。', 'gpg ____ --armor /opt/pkg/app-1.2.3.tar.gz'], note: '产出 .asc 文本签名，便于贴进工单或发布邮件；签名用私钥，验签用公钥，方向不能反' },
          { title: '立刻用公钥验一遍', about: '验证刚生成的签名文件', cmd: 'gpg --verify /opt/pkg/app-1.2.3.tar.gz.asc /opt/pkg/app-1.2.3.tar.gz', ref: 'sec-gpg', expect: /Good signature/, hint: ['签发方必须自己先验一遍：验签通过时会打印一句固定的话，别和"已创建"那种提示混淆。', 'gpg ____ /opt/pkg/app-1.2.3.tar.gz.asc /opt/pkg/app-1.2.3.tar.gz'], note: 'Good signature 才算通过；后面跟着的 not certified with a trusted signature 只说明你没给这把公钥设信任级别' },
          { title: '把要外送的备份加密', about: '用一个口令给数据库备份加一层保护', cmd: 'gpg -c --cipher-algo AES256 /data/backup/db-20240318.sql', ref: 'sec-gpg', hint: ['备份文件要离开这台机器：先加一层口令保护，一个口令就能加解密，不涉及密钥对。', 'gpg ____ --cipher-algo AES256 /data/backup/db-20240318.sql'], note: '产出 .gpg 文件；对称加密忘记口令没有任何找回途径，口令要进密码管理系统' },
          { title: '确认加密后的文件还能还原', about: '当场解一次，确认口令能打开且内容没坏', cmd: 'gpg -d /data/backup/db-20240318.sql.gpg | head -3', ref: 'sec-gpg', hint: ['加密完必须当场解一次：确认口令能打开、内容没坏，别等真要恢复时才发现打不开。', 'gpg ____ /data/backup/db-20240318.sql.gpg | head -3'], note: '能看到 SQL 头部说明加密链路可用' }
        ],
        answer: 'gpg --detach-sign --armor /opt/pkg/app-1.2.3.tar.gz && gpg --verify /opt/pkg/app-1.2.3.tar.gz.asc /opt/pkg/app-1.2.3.tar.gz',
        alt: [
          'gpg -b --armor /opt/pkg/app-1.2.3.tar.gz && gpg --verify /opt/pkg/app-1.2.3.tar.gz.asc /opt/pkg/app-1.2.3.tar.gz'
        ],
        expect: /Good signature/,
        teach: '交付三件套：**安装包 + 校验值 + 独立签名**（连同公钥指纹一起给客户）。分工要分清：摘要（`openssl dgst` / `sha256sum`）只能证明"内容没变"，签名（`gpg --detach-sign` 配上 `--verify`）才能证明"谁发的"，两者缺一不可 —— 只给摘要的话，中间人把包和摘要一起换掉你也发现不了。私钥永远不出内网，导出的私钥备份等于身份本身，必须离线加密保存；对称加密的备份口令要进密码管理系统（Vault 之类），写在脚本注释里等于没有保护。'
      }
,

      {
        id: 'sec-baseline-eye',
        cat: 'security',
        title: '安全巡检第一眼：三个只读检查',
        prompt: '"这台机器安全吗？"听起来是个大问题。**但它可以拆成三个能用只读命令回答的小问题**：我是谁、敏感文件谁能读、有没有人在猜密码。**不做任何改动，先把基线看清楚。**',
        task: '用三条只读命令看清身份、关键文件权限、以及认证失败记录',
        steps: [
          { title: '确认自己是什么身份', about: '巡检从"我是谁"开始', cmd: 'id', ref: 'lu-id', hint: ['第一眼确认身份：`uid=0` 意味着你是超级用户，此时**任何误操作都没有权限拦住你** —— 这本身就是风险', '____'], note: '**uid 0 的终端要格外小心**：权限系统此时是你的敌人而不是朋友；`groups=` 里的附加组还决定了你能读哪些敏感文件' },
          { title: '看最敏感的文件谁能读', about: '/etc/shadow 是密码哈希', cmd: 'ls -l /etc/shadow', ref: 'lb-ls', hint: ['第二眼看文件权限：**系统的密码哈希都在 `/etc/shadow` 里** —— 看它的权限位（谁能读/写）', 'ls -l ____'], note: '**`----------` 表示连 root 都没有读位** —— 这是刻意的：root 靠"绕过权限检查"读它，而**万一权限被放开，任何用户都能拖走哈希离线爆破**' },
          { title: '看谁能提权', about: '谁在特权组里', cmd: 'getent group wheel', ref: 'lu-id', hint: ['第三眼看"谁能提权"：这个组里的成员可以用 `sudo` 拿到 root —— 列出来看看都有谁', 'getent group ____'], note: '**这个组的成员名单就是"谁能拿到 root"的名单** —— 巡检时要能说清每一个成员为什么在里面' },
          { title: '数一下认证失败次数', about: '有没有人在猜密码', cmd: "grep -c 'Failed password' /var/log/secure || echo 0", ref: 'sec-secure-log', hint: ['第四眼看暴力破解迹象：认证日志里"密码错误"的行数 —— `-c` 只输出数量；**没匹配到时退出码是 1，所以接一个兜底分支输出 0**', "grep -c 'Failed password' /var/log/secure ____ echo 0"], note: '**次数本身不是判据，趋势与来源才是** —— 几十次可能是自己敲错，几千次且来自同一 IP 就是有人在扫' },
          { title: '看失败都来自哪里', about: '定位来源 IP', cmd: "grep 'Failed password' /var/log/secure | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -5", ref: 'sec-secure-log', hint: ['第五眼把失败按来源 IP 聚合 —— **一条 IP 占绝大多数**才是攻击特征；分散在很多 IP 则是分布式扫描', "grep 'Failed password' /var/log/secure | awk '{print $(____)}' | sort | uniq -c | sort -rn | head -5"], note: '**看到断层（第一名远超其余）就该处置**：封 IP、改端口、或上密钥登录 + 禁密码' }
        ],
        answer: 'id && ls -l /etc/shadow',
        alt: [
          'id && ls -l /etc/shadow',
          'getent group wheel'
        ],
        expect: /uid=\d+|----------|wheel/,
        teach: '**安全巡检的第一步不是"加固"，而是"看清现状"** —— 在不知道基线是什么样的情况下做改动，既无法判断是否有效，也可能把正常业务搞挂。**三条只读检查分别回答三个问题，缺一不可**：**① 身份（`id`）** —— `uid=0` 意味着当前 shell **没有任何权限约束**，这时"手滑"的后果与普通用户完全不同；`groups` 里的附加组则决定了对 docker socket、系统日志等资源的访问权。**② 敏感文件权限（`ls -l /etc/shadow`）** —— `/etc/shadow` 存的是**密码哈希**，正常权限是 `----------`（**root 也不是靠读位读它，而是靠"绕过权限检查"**）。为什么这个权限位如此关键：**哈希一旦泄露就能离线爆破**，不需要再碰你的服务器；所以巡检时要确认它**没有被改成 644 之类**（历史上有过因备份脚本 `chmod -R` 把整个 `/etc` 放开的事故）。同理要看的还有 `~/.ssh/id_*`（私钥必须 `600`）、`~/.ssh/authorized_keys`（`600`）、以及 `/etc/sudoers`（`440`）。**③ 认证失败（`/var/log/secure`）** —— **"有多少次失败"本身不是判据，"分布形态"才是**：几十次且来源分散，可能只是有人敲错密码；**上千次且集中在少数 IP，那就是在爆破**。判据与处置的对应关系要记住：**看断层**（第一名远超其余 = 单一来源攻击）、**看时间密度**（短时间内大量失败 = 自动化脚本）、**看目标账号**（专挑 `root`/`admin`/`test` = 字典扫描）。**处置手段按性价比排序**：**改用密钥登录并关闭密码认证**（`PasswordAuthentication no`，**这一步能消灭绝大多数爆破**）、**限制来源网段**（安全组只放行办公 IP）、**改默认端口**（只减少日志噪音，不是安全措施）、**上 fail2ban 之类自动封禁**（治标但有效）。**最后一条观念**：**安全是"最小权限"的持续实践，不是一次性配置** —— 每次加账号、加 sudo 权限、放开端口时问一句"真的需要吗、需要这么大范围吗"，比事后装一堆检测工具有效得多。'
      }

  );
})();
