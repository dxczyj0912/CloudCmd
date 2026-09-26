/* data/security.js · 分类 17 安全与合规 */
(function () {
  'use strict';

  var catId = 'security';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. 证书与加密 ================= */

    /* ---------- 1 / 38 ---------- */
    {
      id: 'sec-openssl-sclient',
      name: 'openssl s_client',
      alias: ['openssl s_client -connect', 'TLS 握手排障', '证书链测试'],
      level: 3,
      syntax: 'openssl s_client -connect <主机>:<端口> [-servername <域名>] [-showcerts] [-tls1_2] </dev/null',
      summary: '手工跑一次 TLS 握手，把 HTTPS 报错的锅精确定位到证书还是应用层。',
      desc: '浏览器只给一句笼统的"连接不安全"，`s_client` 却会把 ClientHello、协商版本、加密套件、对端证书链、`Verify return code` 全部打出来，是证书类故障的第一现场。它只做握手不发 HTTP 请求，所以能把 TLS 层和应用层彻底分开：握手成功说明加密没问题，剩下就是业务的事。\n\n**三种最常见的输出含义**：`Verify return code: 0 (ok)` 表示证书链完整可信；`21 (unable to verify the first certificate)` 表示服务端漏发中间证书；`10 (certificate has expired)` 就是证书过期。握手失败时看开头几行 `Alert` 或 `no peer certificate available`。\n\n注意它与 `ln-openssl-sclient` 是同一条命令，那条从"端口通不通"角度收，这条从"证书安全排障"角度收。',
      params: [
        { flag: '-connect <主机>:<端口>', desc: '目标地址，HTTPS 是 443，也可以测 8443、636（LDAPS）等' },
        { flag: '-servername <域名>', desc: '显式发送 SNI；CDN、共享 IP、Nginx 多虚拟主机场景必带，否则拿到默认证书' },
        { flag: '-showcerts', desc: '打印服务端实际下发的全部证书，排查"缺中间证书"的关键参数' },
        { flag: '-tls1_2 / -tls1_3', desc: '锁定协议版本，验证对端是否还能协商旧版本' },
        { flag: '-brief', desc: '只输出一行摘要（协议、套件、校验结果），脚本里比默认输出好用' },
        { flag: '-verify_return_error', desc: '证书校验失败即中断退出，配合 `$?` 做自动化巡检' },
        { flag: '-CAfile <文件>', desc: '指定信任的根证书文件，用于校验自建 CA 签发的证书' }
      ],
      examples: [
        { cmd: 'openssl s_client -connect www.huaweicloud.com:443 -servername www.huaweicloud.com -brief </dev/null', desc: '一行摘要看握手结论：协议版本、加密套件、Verification 是否 OK' },
        { cmd: 'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates', desc: '取服务端第一张证书的主体、签发者与有效期，判断是否即将过期' },
        { cmd: 'openssl s_client -connect api.example.com:443 -servername api.example.com -tls1_2 </dev/null | head -5', desc: '强制走 TLS 1.2，验证老客户端能否接入' },
        { cmd: 'openssl s_client -connect db.example.com:3306 -starttls mysql -brief </dev/null', desc: '测 MySQL 的 TLS 是否开启并能正常握手' }
      ],
      notes: [
        '命令默认会停在交互式输入等待按键，脚本里必须重定向 `</dev/null`，否则会永久挂住；要交互发 HTTP 请求时直接敲 `GET / HTTP/1.1` 再回车',
        '不加 `-servername` 时 SNI 为空，负载均衡会返回默认证书，很容易误判成"证书域名不匹配"',
        '`Verify return code` 非 0 才是真问题；只看到 `verify error:num=20` 之类但最后是 0，说明只是中间证书没随客户端带上，不影响信任',
        '握手失败先确认端口是否被安全组放行，别在证书上白找半天；连通性用 `telnet` 或 `nc -zv` 先过一遍',
        '系统最小化安装可能没有 `openssl` 命令，CentOS 装 `openssl`、Ubuntu 装 `openssl` 包即可'
      ],
      related: ['sec-openssl-x509', 'sec-cert-chain', 'sec-cert-expiry-check', 'ln-openssl-sclient'],
      docs: 'https://docs.openssl.org/3.0/man1/openssl-s_client/',
      tags: ['TLS', '证书', '握手', '排障']
    },

    /* ---------- 2 / 38 ---------- */
    {
      id: 'sec-openssl-x509',
      name: 'openssl x509',
      alias: ['openssl x509 -text', '查看证书详情', '证书解析'],
      level: 2,
      syntax: 'openssl x509 -in <证书文件> -noout [-text | -subject | -issuer | -dates | -fingerprint]',
      summary: '解析单个证书文件，看清域名、签发者、有效期和扩展项。',
      desc: '`x509` 是证书的"阅读器"：输入 PEM 或 DER 格式证书，按需打印某几段信息。生产上最常用的三个动作是看有效期（`-dates`）、看签发链（`-subject -issuer`）、看扩展里的 SAN 列表（`-text` 里的 `X509v3 Subject Alternative Name`）——现代浏览器只认 SAN，不看 CN，域名不匹配十有八九是 SAN 里漏了。\n\n`-text` 输出很长，实际排障建议先用 `-noout -subject -issuer -dates` 拿关键信息，确实需要看扩展再上 `-text`。注意它只解析文件，不联网、不校验信任链，校验要交给 `openssl verify`。',
      params: [
        { flag: '-in <文件>', desc: '输入证书文件，默认 PEM；DER 格式要加 `-inform der`' },
        { flag: '-noout', desc: '不重复输出原始编码内容，否则证书正文会被整段打印' },
        { flag: '-text', desc: '打印全部字段：序列号、签名算法、公钥、扩展、SAN' },
        { flag: '-dates', desc: '只打印 `notBefore` 与 `notAfter`，判断是否过期最快' },
        { flag: '-subject / -issuer', desc: '只打印主体与签发者，用于确认证书是不是签给这个域名的' },
        { flag: '-fingerprint -sha256', desc: '打印 SHA-256 指纹，交接证书时用来核对是不是同一张' },
        { flag: '-checkend <秒>', desc: '判断证书在指定秒数内是否会过期，返回码非 0 表示会过期，适合写巡检脚本' }
      ],
      examples: [
        { cmd: 'openssl x509 -in /etc/nginx/ssl/server.crt -noout -subject -issuer -dates', desc: '一条命令看全：签给谁、谁签的、什么时候到期' },
        { cmd: 'openssl x509 -in /etc/nginx/ssl/server.crt -noout -text | grep -A1 "Subject Alternative Name"', desc: '检查 SAN 里有没有包含实际访问的域名' },
        { cmd: 'openssl x509 -in /etc/nginx/ssl/server.crt -noout -checkend 2592000', desc: '判断证书是否在 30 天内过期，返回码 1 表示快过期了' },
        { cmd: 'openssl x509 -in /etc/nginx/ssl/server.crt -noout -fingerprint -sha256', desc: '打印指纹，用于确认线上证书与证书仓库里的是同一张' }
      ],
      notes: [
        '`-noout` 几乎总要带上，否则终端会刷出一大段 Base64 正文',
        '浏览器早已忽略 CN 字段，只校验 SAN；证书 CN 写对了但 SAN 缺失一样会报"域名不匹配"',
        '证书文件可以是 `.crt`/`.pem`/`.cer`，扩展名不代表格式，放开看内容才算数',
        '一台机器上的证书可能分散在 `/etc/nginx/ssl`、`/etc/pki/tls/certs`、`/etc/ssl/certs`，别忘了 Java 的 `cacerts` 是另一种格式（JKS/PKCS12）',
        '看域名匹配也可以直接用 `openssl x509 -noout -ext subjectAltName`（OpenSSL 1.1.1 以上支持）'
      ],
      related: ['sec-openssl-sclient', 'sec-cert-chain', 'sec-cert-expiry-check', 'sec-openssl-req'],
      docs: 'https://docs.openssl.org/3.0/man1/openssl-x509/',
      tags: ['证书', '有效期', 'SAN', '解析']
    },

    /* ---------- 3 / 38 ---------- */
    {
      id: 'sec-openssl-req',
      name: 'openssl req -new -x509',
      alias: ['openssl req', '自签证书', '生成 CSR'],
      level: 3,
      syntax: 'openssl req -new -x509 -nodes -days <天数> -newkey rsa:2048 -keyout <私钥> -out <证书> -subj "<主题>"',
      summary: '生成自签名证书或提交给 CA 的 CSR，是内网 HTTPS 与测试环境的基础操作。',
      desc: '`req` 一个命令覆盖两件事：生成密钥对并打包成 CSR（`-new`，交给 CA 签名），或者直接自己签自己（`-new -x509`）。内网系统、开发测试、Kubernetes webhook 这类不需要公网信任的场景，自签是最省事的做法。\n\n`-nodes` 是"no DES"的意思，表示**私钥不加密**——带 `-nodes` 后 Nginx 启动不需要输密码，适合服务进程；不带则每次启动都要人工输入。生产上建议不带 `-nodes` 生成，再用 `openssl rsa -aes256` 之类的做法单独处理，或者更常见的是接受 `-nodes` 但把私钥文件权限压到 600 并严控主机访问。',
      params: [
        { flag: '-new', desc: '生成新的证书请求（CSR）' },
        { flag: '-x509', desc: '直接输出自签名证书而不是 CSR，跳过 CA' },
        { flag: '-nodes', desc: '私钥不加密保存，服务进程可直接读取' },
        { flag: '-days <天数>', desc: '自签证书的有效期，默认 30 天，内网可用 3650' },
        { flag: '-newkey rsa:2048', desc: '同时生成 2048 位 RSA 私钥；换 `ecdsa` 需另用 `ecparam`' },
        { flag: '-subj "<主题>"', desc: '非交互式指定主题，避免一条条回答问题；格式 `/C=CN/ST=Beijing/O=Corp/CN=api.internal`' },
        { flag: '-addext "subjectAltName=DNS:api.internal"', desc: '直接给自签证书加上 SAN，OpenSSL 1.1.1 及以上可用' }
      ],
      examples: [
        { cmd: 'openssl req -new -x509 -nodes -days 3650 -newkey rsa:2048 -keyout /etc/nginx/ssl/internal.key -out /etc/nginx/ssl/internal.crt -subj "/C=CN/O=Corp/CN=api.internal" -addext "subjectAltName=DNS:api.internal,DNS:localhost,IP:127.0.0.1"', desc: '为内网域名生成十年期自签证书，含 SAN，可直接配到 Nginx' },
        { cmd: 'openssl req -new -nodes -newkey rsa:2048 -keyout api.example.com.key -out api.example.com.csr -subj "/C=CN/O=Example/CN=api.example.com"', desc: '生成 CSR 提交给 CA 签发，这条不产生证书只有请求文件' },
        { cmd: 'openssl req -in api.example.com.csr -noout -text', desc: '提交前自查 CSR 内容，确认域名和主题没错' }
      ],
      notes: [
        '自签证书浏览器一律报不受信任，别拿去给公网用户访问；内网使用也要把根证书导入客户端信任库才不告警',
        '**私钥文件权限必须收紧**：`chmod 600` 并 `chown root:root`，落到普通用户手里等于证书失效',
        '不带 `-nodes` 时命令会提示输入 PEM pass phrase，自动化脚本里会直接卡死',
        '`-subj` 里不能有空格，路径分隔符是 `/`，写错会报 `Error loading request extension section` 之类的怪错',
        '给 Kubernetes Ingress、webhook 用的证书必须带 SAN，只写 CN 会被 Go 语言的 TLS 校验直接拒绝'
      ],
      related: ['sec-openssl-x509', 'sec-openssl-genrsa', 'sec-cert-chain', 'sec-certbot-renew'],
      docs: 'https://docs.openssl.org/3.0/man1/openssl-req/',
      tags: ['自签证书', 'CSR', '内网HTTPS', '密钥']
    },

    /* ---------- 4 / 38 ---------- */
    {
      id: 'sec-openssl-genrsa',
      name: 'openssl genrsa',
      alias: ['openssl rsa', '生成RSA私钥', '私钥转换'],
      level: 2,
      syntax: 'openssl genrsa -out <私钥文件> <位数> | openssl rsa -in <私钥> -out <新私钥> [-aes256] [-pubout]',
      summary: '生成 RSA 私钥并做格式转换、加密、导出公钥的通用工具。',
      desc: '`genrsa` 只管生成私钥，`rsa` 负责对已有私钥做加工：去掉或加上密码、从 PKCS#1 转成 PKCS#8、导出对应公钥、检查私钥是否与证书匹配。日常排障里 `rsa -noout -modulus` 和 `x509 -noout -modulus` 输出一致，是判断"证书与私钥是不是一对"的经典手法。\n\nOpenSSL 3.x 之后官方更推荐 `openssl genpkey -algorithm RSA`，`genrsa` 仍保留可用。若为兼容老系统的脚本，继续用 `genrsa` 完全没问题。',
      params: [
        { flag: '-out <文件>', desc: '输出文件路径' },
        { flag: '<位数>', desc: '密钥长度，2048 起步，合规要求高的用 4096；1024 已不安全' },
        { flag: '-aes256', desc: '用 AES-256 加密私钥，会提示输入口令（属于 `rsa` 子命令）' },
        { flag: '-pubout', desc: '导出公钥，用于分发或核对（属于 `rsa`/`pkey` 子命令）' },
        { flag: '-noout -modulus', desc: '打印模数，与证书的模数比对可判断是否配对' },
        { flag: '-check', desc: '校验私钥自身一致性，损坏的私钥能提前发现' }
      ],
      examples: [
        { cmd: 'openssl genrsa -out /etc/nginx/ssl/server.key 4096', desc: '生成 4096 位 RSA 私钥' },
        { cmd: 'openssl rsa -in server.key -aes256 -out server.enc.key', desc: '给已存在的私钥加上口令保护，适合离线归档' },
        { cmd: 'openssl rsa -in server.key -pubout -out server.pub', desc: '从私钥导出公钥，交付给对端做验签或加密' },
        { cmd: 'openssl rsa -in server.key -noout -modulus | openssl md5', desc: '算出私钥模数摘要，与证书比对确认是同一对' }
      ],
      notes: [
        '**私钥一旦泄露，对应证书必须立刻吊销重签**，只删文件没有意义，因为可能已被复制',
        '加了口令的私钥在 Nginx/Java 启动时需要交互输入，容器化场景不适用，通常改用无口令 + 严格文件权限',
        '`genrsa` 生成的默认是 PKCS#1 格式（`BEGIN RSA PRIVATE KEY`）；有些系统只认 PKCS#8（`BEGIN PRIVATE KEY`），用 `openssl pkcs8 -topk8 -nocrypt` 转换',
        'RSA 2048 与 4096 在握手性能上差距很小，但 4096 的签名运算更慢，高并发网关可以评估 ECDSA（`openssl ecparam -genkey -name prime256v1`）',
        '比对"私钥与证书是否配对"最可靠的方式是比较 modulus 摘要，两个输出一致就说明配对成功'
      ],
      related: ['sec-openssl-req', 'sec-openssl-x509', 'sec-openssl-dgst', 'sec-ssh-keygen'],
      docs: 'https://docs.openssl.org/3.0/man1/openssl-genrsa/',
      tags: ['RSA', '私钥', '加密', '公钥']
    },

    /* ---------- 5 / 38 ---------- */
    {
      id: 'sec-openssl-dgst',
      name: 'openssl dgst',
      alias: ['openssl sha256', 'openssl dgst -sha256', '文件摘要'],
      level: 2,
      syntax: 'openssl dgst -<算法> [-hmac <密钥>] [-verify <公钥> -signature <签名文件>] <文件>',
      summary: '算文件或数据的哈希摘要，也能用私钥签名、公钥验签。',
      desc: '日常用途是校验文件完整性（下载的镜像、交付的安装包）以及配合 `sha256sum` 双人核对。比 `sha256sum` 多出来的能力是签名与验签：`-sign` 用私钥产出签名文件，`-verify` 用公钥校验，是发布软件包时防篡改的标准做法。\n\n`-hmac` 则用于接口对接：双方共享一个密钥，对请求体算 HMAC 摘要放到请求头，服务端用同样方式复算即可验证来源与完整性。华为云、阿里云的 API 签名体系都是这个思路的变体。',
      params: [
        { flag: '-sha256', desc: '指定摘要算法，常用的还有 `-sha1`（已不推荐）、`-sha512`、`-md5`' },
        { flag: '-hmac <密钥>', desc: '用共享密钥计算 HMAC，接口签名场景使用' },
        { flag: '-sign <私钥> -out <签名文件>', desc: '用私钥对文件摘要做签名' },
        { flag: '-verify <公钥> -signature <签名文件>', desc: '用公钥验证签名，成功输出 `Verified OK`，失败输出 `Verification Failure`' },
        { flag: '-binary', desc: '输出原始二进制摘要而不是十六进制字符串' }
      ],
      examples: [
        { cmd: 'openssl dgst -sha256 /opt/pkg/app-1.2.3.tar.gz', desc: '算安装包的 SHA-256，与官网公布值比对' },
        { cmd: 'openssl dgst -sha256 -sign /data/dist/release.key -out /data/dist/app.tar.gz.sig /data/dist/app.tar.gz', desc: '用私钥给发布包签名，产出 .sig 文件' },
        { cmd: 'openssl dgst -sha256 -verify /data/dist/release.pub -signature /data/dist/app.tar.gz.sig /data/dist/app.tar.gz', desc: '分发方用公钥验证签名，输出 Verified OK 才可信' },
        { cmd: 'echo -n "hello" | openssl dgst -sha256', desc: '对一段字符串算摘要，注意 `-n` 避免把换行也算进去' }
      ],
      notes: [
        'MD5、SHA-1 已被证明可构造碰撞，只用于校验传输损坏，不能用于安全场景',
        '`echo "abc" | openssl dgst -sha256` 与 `echo -n "abc" | ...` 结果不同，多出来的换行也参与计算，接口签名时这是最常见的踩坑点',
        '摘要不能反推原文，所以它能验完整性但不能保密；要保密请用 `openssl enc` 或 gpg',
        '验签方向别搞反：签名用私钥，验签用公钥；把私钥拿去验签会直接报错',
        '大文件算摘要会吃 CPU，几 GB 的镜像建议 `nice` 一下再算，避免影响线上服务'
      ],
      related: ['sec-openssl-genrsa', 'sec-gpg', 'lb-sha256sum', 'lb-md5sum'],
      docs: 'https://docs.openssl.org/3.0/man1/openssl-dgst/',
      tags: ['摘要', '校验和', '签名', '完整性']
    },

    /* ---------- 6 / 38 ---------- */
    {
      id: 'sec-cert-expiry-check',
      name: '证书到期批量巡检（组合）',
      kind: 'recipe',
      alias: ['批量查证书有效期', '证书到期巡检', 'cert expiry scan'],
      level: 3,
      syntax: 'for h in <域名列表>; do echo | openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null | openssl x509 -noout -enddate; done',
      summary: '一条循环把几十个域名的证书到期时间全查一遍，避免半夜证书过期。',
      desc: '证书过期是最"低级"却最常发生的线上事故：没人天天盯着日历，而浏览器和网关往往只在过期那一刻才报错。可用的做法是写一条 for 循环，对域名清单逐个握手取 `notAfter`，再用 `date` 换算成剩余天数，低于阈值就告警。\n\n**完整链路**：① 准备域名清单文件 → ② 循环 `s_client` 取 `-enddate` → ③ 用 `date -d` 把时间字符串转成时间戳算差值 → ④ 按 30 天 / 7 天两档分级输出 → ⑤ 挂到 crontab 或监控系统每天跑一次。本地证书文件多的话，同一套循环换成 `find` + `openssl x509 -checkend` 即可。\n\n本地文件版本比远程版本更可靠：远程握手受 DNS、安全组、SNI 影响，可能因为网络抖动误报，所以线上巡检建议以文件为准、远程为辅。',
      params: [
        { flag: '-enddate / -startdate', desc: '只输出生效与过期时间，脚本里最好解析' },
        { flag: '-checkend <秒>', desc: '直接判断是否在给定秒数内过期，返回码 1 即告警，省去日期换算' },
        { flag: 'find <目录> -name "*.crt"', desc: '批量收集本地证书文件路径' },
        { flag: '-servername', desc: '远程探测时指定 SNI，保证拿到真正服务该域名的证书' },
        { flag: 'date -d "<时间>" +%s', desc: '把 `notAfter` 字符串转成 Unix 时间戳做减法' }
      ],
      examples: [
        { cmd: 'for h in api.example.com www.example.com ops.example.com; do printf "%-24s " "$h"; echo | openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null | openssl x509 -noout -enddate; done', desc: '循环探测多个域名的证书到期时间，输出对齐便于肉眼扫' },
        { cmd: 'for h in api.example.com www.example.com; do end=$(echo | openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2); left=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 )); echo "$h 剩余 ${left} 天"; done', desc: '把到期时间换算成剩余天数，直接看数字判断优先级' },
        { cmd: 'find /etc/nginx/ssl /etc/pki/tls/certs -name "*.crt" -o -name "*.pem" | while read f; do openssl x509 -in "$f" -noout -checkend 2592000 >/dev/null 2>&1 || echo "即将过期: $f"; done', desc: '扫描本地证书目录，只打印 30 天内会过期的文件' },
        { cmd: 'openssl x509 -in /etc/nginx/ssl/server.crt -noout -subject -enddate', desc: '单张证书自查，确认巡检结果时用' }
      ],
      notes: [
        '远程探测必须在脚本里加 `</dev/null` 或 `echo |`，否则 `s_client` 会一直等输入把巡检卡死',
        '`date -d` 依赖 GNU date，Alpine 的 busybox date 不支持这种写法，容器里巡检要改用 `openssl x509 -checkend`',
        '别忘了**中间证书也会过期**：只查叶子证书会漏掉链上第二张，`-showcerts` 把整链都取出来逐张判断才完整',
        '证书过期前应先确认自动续签（certbot / 云厂商托管）是否真的在跑，很多事故是"以为有自动续签"',
        '巡检结果建议接入告警系统而不是只发邮件，邮件最容易被忽略'
      ],
      related: ['sec-openssl-sclient', 'sec-openssl-x509', 'sec-certbot-renew', 'sec-cert-chain'],
      docs: 'https://docs.openssl.org/3.0/man1/openssl-x509/',
      tags: ['证书巡检', '到期', '组合命令', '自动化']
    },

    /* ---------- 7 / 38 ---------- */
    {
      id: 'sec-cert-chain',
      name: '证书链不完整排查（组合）',
      kind: 'recipe',
      alias: ['中间证书缺失', 'certificate chain incomplete', '证书链修复'],
      level: 4,
      syntax: 'openssl s_client -connect <域名>:443 -servername <域名> -showcerts </dev/null > chain.txt  # 再拆分与验证',
      summary: '定位服务端漏发中间证书导致的"部分客户端不信任"故障。',
      desc: '证书链不完整是 HTTPS 里最迷惑人的故障之一：浏览器能正常打开，Java、Python、curl 却报 `unable to get local issuer certificate`。原因是浏览器会自动下载缺失的中间证书（AIA fetching），而多数 SDK 不会。\n\n**完整排查链路**：\n① `openssl s_client -connect <域名>:443 -showcerts` 打印服务端实际下发的证书数量——正常应该是 2 张（叶子 + 中间），只有 1 张基本可以确诊；\n② 看输出的 `Verify return code`，`21 (unable to verify the first certificate)` 是典型信号；\n③ 把 `-showcerts` 输出里的证书块拆成单独文件，用 `openssl verify -CAfile root.crt -untrusted intermediate.crt leaf.crt` 在本地复现校验过程；\n④ 从 CA 处下载中间证书，按"叶子 + 中间（+根可选）"顺序拼成一个 fullchain 文件；\n⑤ 在 Nginx 的 `ssl_certificate` 指向合并后的文件（`ssl_certificate_key` 仍只指私钥），reload 后再跑一次 ① 确认变成 2 张且 return code 为 0。\n\n判断"到底缺哪张"的技巧：`openssl verify -CAfile <根证书>` 报 `unable to get local issuer` 说明缺中间证书；报 `unable to get issuer certificate` 并指出具体 subject 说明链断在那一层。',
      params: [
        { flag: '-showcerts', desc: '打印服务端下发的完整证书列表，数量是关键证据' },
        { flag: '-verify_return_error', desc: '让校验失败直接报错退出，便于脚本判断' },
        { flag: 'openssl verify -CAfile <根> -untrusted <中间> <叶子>', desc: '本地离线验证证书链，可精确指出断点' },
        { flag: '-CAfile <根证书>', desc: '指定信任锚点，自建 CA 场景必须显式指定' },
        { flag: '-partial_chain', desc: '允许以非自签证书作为信任锚，排查特殊链时使用' }
      ],
      examples: [
        { cmd: 'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null 2>/dev/null | grep -c "BEGIN CERTIFICATE"', desc: '数一数服务端发了几张证书，返回 1 基本就是链不完整' },
        { cmd: 'openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null 2>/dev/null > /tmp/chain.txt && grep -E "s:|i:|Verify return code" /tmp/chain.txt', desc: '把链信息落盘，看每张证书的 subject/issuer 与最终校验码' },
        { cmd: 'openssl verify -CAfile /etc/ssl/certs/root-ca.crt -untrusted /etc/ssl/certs/intermediate.crt /etc/nginx/ssl/server.crt', desc: '离线验证：根 + 中间 + 叶子，能精确指出哪一层断裂' },
        { cmd: 'cat server.crt intermediate.crt > fullchain.crt && openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null 2>/dev/null | grep -c "BEGIN CERTIFICATE"', desc: '合并出 fullchain 后重新探测，确认变成 2 张证书' }
      ],
      notes: [
        '**顺序不能错**：fullchain 必须是"叶子证书在前、中间证书在后"，顺序颠倒同样会报链错误',
        'Nginx 用 `ssl_certificate` 指向 fullchain，`ssl_certificate_key` 只指私钥文件；把私钥和证书拼在一起是 Apache 的写法，别混用',
        '根证书一般不放进 fullchain：服务端发根证书会让每次握手多传几 KB，且对端本就信任根',
        '只测 `curl` 可能测不出来——`curl` 用系统 CA 库同样会自动补链，必须用 `openssl verify` 或 Java 客户端复验',
        'Java 应用的信任库是独立的 `cacerts`，即使链完整也可能因为缺根证书报错，要用 `keytool -importcert` 单独导入',
        'ACME 签发的证书（certbot）有效期只有 90 天，链文件是 `fullchain.pem`，别只配 `cert.pem`'
      ],
      related: ['sec-openssl-sclient', 'sec-openssl-x509', 'sec-cert-expiry-check', 'sec-certbot-renew'],
      docs: 'https://docs.openssl.org/3.0/man1/openssl-verify/',
      tags: ['证书链', '中间证书', 'HTTPS', '组合命令']
    },

    /* ---------- 8 / 38 ---------- */
    {
      id: 'sec-certbot-renew',
      name: 'certbot renew',
      alias: ['certbot', 'letsencrypt 续签', '免费证书续签'],
      level: 2,
      syntax: 'certbot renew [--dry-run] [--force-renewal] [--cert-name <名称>] [--deploy-hook "<命令>"]',
      summary: '续签 Let\'s Encrypt 证书，先空跑验证再真续，避免续签失败才发现。',
      desc: 'certbot 申请到的证书只有 90 天有效期，官方推荐用 `certbot renew` 让计划任务每天跑两次，它会自动跳过还有 30 天以上的证书，只在临近过期时真正续签。\n\n`--dry-run` 是运维必做的一步：它走完整的 ACME 流程但用 staging 环境签发测试证书，能提前暴露"80 端口被防火墙挡住""Nginx 配置改了导致验证路径失效""域名解析变了"等问题，而且不会消耗正式环境的签发频率限制。\n\n续签成功后必须让服务重新加载证书，否则新证书躺硬盘上没人用。`--deploy-hook` 就是干这个的，比 `--post-hook` 精确（只在真的续签了才执行）。',
      params: [
        { flag: 'renew', desc: '续签配置目录下所有即将过期的证书（默认 30 天内）' },
        { flag: '--dry-run', desc: '空跑演练，用 staging 环境验证流程是否还能跑通' },
        { flag: '--force-renewal', desc: '无视剩余天数强制续签，会消耗签发频率配额，只在排障时用' },
        { flag: '--cert-name <名称>', desc: '只处理指定证书，列出用 `certbot certificates`' },
        { flag: '--deploy-hook "<命令>"', desc: '成功续签后执行的命令，通常写 `systemctl reload nginx`' },
        { flag: '--webroot -w <目录>', desc: '指定 HTTP-01 验证的网站根目录' },
        { flag: '-q', desc: '静默模式，计划任务里配合日志使用' }
      ],
      examples: [
        { cmd: 'certbot certificates', desc: '列出本机所有证书的域名与剩余有效期，续签前先看清单' },
        { cmd: 'certbot renew --dry-run', desc: '空跑演练，确认验证流程仍然可用，不会消耗正式配额' },
        { cmd: 'certbot renew --deploy-hook "systemctl reload nginx"', desc: '真正续签，并在成功后自动重载 Nginx 让新证书生效' },
        { cmd: 'certbot renew --cert-name api.example.com --force-renewal', desc: '强制续签指定证书，仅用于证书损坏等异常场景' }
      ],
      notes: [
        '**续签成功不等于生效**：没有 reload 服务时，进程还在用内存里的老证书，必须配 `--deploy-hook`',
        'Let\'s Encrypt 正式环境对"同一组域名"有每周签发次数限制，反复 `--force-renewal` 会被限流一周，排障请用 `--dry-run`',
        'certbot 的定时任务在 systemd 系统上是 `certbot.timer`，用 `systemctl list-timers | grep certbot` 确认它真的在跑',
        'HTTP-01 验证需要 80 端口能从公网访问；用云负载均衡或 WAF 时，验证请求可能到不了源站，这种情况要用 DNS-01 插件',
        '证书文件位于 `/etc/letsencrypt/live/<域名>/`，其中 `privkey.pem` 是软链到 `../../archive/` 的，备份时要连 `archive` 一起备',
        'CentOS 用 `yum install certbot python3-certbot-nginx`，Ubuntu 用 `apt install certbot python3-certbot-nginx`，包名不同但命令一致'
      ],
      related: ['sec-cert-expiry-check', 'sec-cert-chain', 'sec-openssl-x509', 'ln-curl'],
      docs: 'https://eff-certbot.readthedocs.io/en/stable/using.html',
      tags: ['证书续签', 'ACME', 'HTTPS', '自动化']
    },

    /* ---------- 9 / 38 ---------- */
    {
      id: 'sec-gpg',
      name: 'gpg',
      alias: ['gpg --encrypt', 'gpg --decrypt', 'gnupg 签名'],
      level: 3,
      syntax: 'gpg --gen-key | gpg -c <文件> | gpg -e -r <收件人> <文件> | gpg --detach-sign <文件> | gpg --verify <签名> <文件>',
      summary: '做文件加解密与数字签名，跨主机传递敏感文件时的标准手段。',
      desc: 'GPG 提供两条独立能力：**对称加密**（`-c`，一个口令加密解密，适合自己存档和临时传文件）和**非对称加密/签名**（生成密钥对，用对方公钥加密、用自己私钥签名）。日常备份脚本里 `-c` 用得最多，软件包发布与合规交付则用签名。\n\n密钥管理是 GPG 最容易出事的地方：私钥丢了加密文件永久打不开，所以生成后第一件事就是导出私钥做离线备份。\n\n`--detach-sign` 生成独立签名文件而不是把签名嵌进原文，便于分发；`--verify` 输出里的 `Good signature` 才是通过，同时要注意它打印的 key ID 是否是你信任的那把。',
      params: [
        { flag: '--gen-key', desc: '交互式生成密钥对，或 `--full-generate-key` 选更细的参数' },
        { flag: '-c, --symmetric', desc: '对称加密，只用一个口令，不涉及密钥对' },
        { flag: '-e -r <收件人>', desc: '用指定公钥加密，只有对应私钥能解' },
        { flag: '-d, --decrypt', desc: '解密，对称与非对称都用这个参数' },
        { flag: '--detach-sign', desc: '生成独立的 `.sig` 签名文件' },
        { flag: '--verify', desc: '验证签名，成功会打印 `Good signature`' },
        { flag: '--armor', desc: '输出 ASCII 文本格式（`.asc`），便于贴进邮件或工单' }
      ],
      examples: [
        { cmd: 'gpg --full-generate-key', desc: '生成密钥对，交互式选择 RSA 3072 与有效期' },
        { cmd: 'gpg -c --cipher-algo AES256 /data/backup/db-20240318.sql', desc: '用口令对称加密备份文件，产出 `.gpg` 文件' },
        { cmd: 'gpg -d /data/backup/db-20240318.sql.gpg > /data/restore/db.sql', desc: '解密还原，会提示输入口令' },
        { cmd: 'gpg -e -r ops@example.com --armor /data/report/finance.csv', desc: '用同事的公钥加密报表，只有他能解' },
        { cmd: 'cd /data/dist && gpg --detach-sign --armor app-1.2.3.tar.gz && gpg --verify app-1.2.3.tar.gz.asc app-1.2.3.tar.gz', desc: '对发布包签名并立即验证，输出 Good signature 才算成功' },
        { cmd: 'gpg --export --armor ops@example.com > ops-pub.asc', desc: '导出公钥分发给需要给你发加密文件的人' },
        { cmd: 'gpg --export-secret-keys --armor ops@example.com > ops-secret.asc', desc: '导出私钥做离线备份，文件必须存放在加密介质中' }
      ],
      notes: [
        '**导出的私钥备份文件等于身份本身**，绝不能放在同一台机器上或提交到 Git；丢失私钥意味着历史加密文件全部无法解密',
        '对称加密忘记口令无任何找回途径，口令要进密码管理系统（如 Vault），不要只写在脚本注释里',
        '脚本里用 `--batch --passphrase-file` 传口令时，注意 `ps` 能看到命令行参数，口令文件权限要设 600',
        '`--verify` 显示 Good signature 但提示 `WARNING: This key is not certified with a trusted signature` 时，说明签名有效但你没有为该公钥建立信任，需要 `gpg --edit-key` 后 `trust` 设为完全信任',
        'GPG 处理大文件会占用较多 CPU 与内存，几十 GB 的备份建议先用 `tar` 打包再加密，或改用 `openssl enc` 提升吞吐',
        '子密钥（subkey）才是日常加密用的，主密钥只用于签名；轮换时要重新发布公钥'
      ],
      related: ['sec-openssl-dgst', 'sec-vault-kv', 'lb-tar', 'sec-ssh-keygen'],
      docs: 'https://gnupg.org/documentation/manuals/gnupg/Invoking-GPG.html',
      tags: ['加密', '签名', '密钥管理', 'GPG']
    },

    /* ---------- 10 / 38 ---------- */
    {
      id: 'sec-ssh-keygen',
      name: 'ssh-keygen（密钥类型选择）',
      kind: 'recipe',
      alias: ['ssh-keygen -t ed25519', 'SSH 密钥算法', '生成运维密钥'],
      level: 2,
      syntax: 'ssh-keygen -t <ed25519|rsa|ecdsa> [-b <位数>] [-C "<注释>"] [-f <路径>] [-a <KDF轮数>]',
      summary: '生成运维 SSH 密钥对，核心是选对算法并给私钥加口令。',
      desc: '安全分类里关注的重点不是"怎么生成"而是"选哪种、怎么保管"。**ed25519 是当前推荐默认**：密钥短（公钥 68 字符）、签名快、无已知实用攻击，且天然抗侧信道；`rsa` 仍需保留，因为老旧的网络设备、部分 Java 客户端、OpenSSH 6.5 之前的系统不认 ed25519。RSA 至少 2048 位，新系统建议 4096。\n\n`ecdsa` 一般不用：它依赖 NIST 曲线参数，且实现上更容易因随机数问题泄露私钥，除非对端只支持 ECDSA。\n\n口令（passphrase）配合 `ssh-agent` 是安全与便利的平衡点：私钥文件被拿走也解不开，日常用 agent 缓存就不用反复输入。运维密钥还应该遵循"一机一钥、一环境一钥"，泄露时可单独吊销而不影响其他系统。',
      params: [
        { flag: '-t ed25519', desc: '推荐算法，密钥短、速度快；位数固定 256，不能用 `-b` 修改' },
        { flag: '-t rsa -b 4096', desc: '兼容老系统时使用，2048 是底线，新部署建议 4096' },
        { flag: '-a <轮数>', desc: 'KDF 迭代轮数，默认 16；提高可增加口令暴力破解成本' },
        { flag: '-C "<注释>"', desc: '写入公钥末尾的注释，建议写"用途@主机"，方便日后在 authorized_keys 里识别' },
        { flag: '-f <路径>', desc: '指定密钥文件路径，实现一机一钥' },
        { flag: '-l -f <公钥>', desc: '查看指纹与算法位数，做密钥资产盘点' },
        { flag: '-p -f <私钥>', desc: '给已有私钥补设或修改口令' }
      ],
      examples: [
        { cmd: 'ssh-keygen -t ed25519 -a 100 -C "ops@ci-runner" -f ~/.ssh/id_ed25519_ci', desc: '生成高迭代轮数的 ed25519 密钥，专用于 CI 发布' },
        { cmd: 'ssh-keygen -t rsa -b 4096 -C "legacy@switch" -f ~/.ssh/id_rsa_switch', desc: '为只支持 RSA 的老设备生成 4096 位密钥' },
        { cmd: 'ssh-keygen -p -f ~/.ssh/id_ed25519_ci', desc: '给已有私钥补设口令，防止私钥文件裸奔' },
        { cmd: 'ssh-keygen -l -f ~/.ssh/id_ed25519_ci.pub', desc: '查看公钥算法与指纹，做密钥盘点时批量执行' },
        { cmd: 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub', desc: '查看主机密钥指纹，可与运维台账比对防止中间人' }
      ],
      notes: [
        '**私钥权限必须是 600、`.ssh` 目录必须是 700**，否则 sshd 直接拒绝使用并报 bad permissions，很多人以为密钥错了其实是权限问题',
        '私钥绝不能进 Git、不能放进镜像、不能通过聊天工具传输；CI 场景请放在凭据管理系统里注入',
        'ed25519 不兼容 CentOS 6 这类老系统（OpenSSH 6.5 之前），跨版本环境请用 RSA',
        '运维密钥建议一律设口令并用 `ssh-agent`；把无口令私钥放在跳板机上等于把整片内网交出去',
        '`authorized_keys` 里可以给每把公钥加限制前缀，如 `from="10.0.1.0/24",command="/usr/local/bin/deploy.sh"`，实现来源限制与命令强制',
        '主机密钥变更（重装系统）后客户端会报 REMOTE HOST IDENTIFICATION HAS CHANGED，确认无误再用 `ssh-keygen -R <主机>` 清理旧记录'
      ],
      related: ['ln-ssh-keygen', 'ln-ssh-copy-id', 'sec-aksk-leak', 'sec-vault-kv'],
      docs: 'https://man7.org/linux/man-pages/man1/ssh-keygen.1.html',
      tags: ['SSH密钥', 'ed25519', '算法选择', '运维安全']
    },

    /* ================= B. SELinux 与 AppArmor ================= */

    /* ---------- 11 / 38 ---------- */
    {
      id: 'sec-getenforce',
      name: 'getenforce / setenforce',
      alias: ['selinux 状态', 'setenforce 0', '关闭 SELinux'],
      level: 2,
      syntax: 'getenforce | setenforce [Enforcing|Permissive|1|0] | sestatus',
      summary: '查看和临时切换 SELinux 运行模式，判断故障是否由 SELinux 引起。',
      desc: 'SELinux 有三种模式：`Enforcing`（真正拦截）、`Permissive`（只记录不拦截）、`Disabled`（完全关闭）。排障时的黄金手法是把模式切到 Permissive，如果问题消失，就基本确定是 SELinux 策略问题，然后去审计日志里找具体拒绝项做精细放行，而不是简单粗暴地永久关闭。\n\n`setenforce` 只影响当前运行状态，重启后失效；要永久修改得改 `/etc/selinux/config` 里的 `SELINUX=`，而且从 Disabled 切回 Enforcing 需要重启并重新打标签，成本很高。`sestatus` 比 `getenforce` 信息更全，能看到策略版本、挂载点与各布尔开关状态。\n\n**国产化与政务云环境普遍要求开启 Enforcing**，直接关闭属于违规操作，等保测评会被扣分。',
      params: [
        { flag: 'getenforce', desc: '一行输出当前模式，适合脚本判断' },
        { flag: 'setenforce 0', desc: '临时切到 Permissive，用于验证问题是否与 SELinux 相关' },
        { flag: 'setenforce 1', desc: '切回 Enforcing，验证完务必执行' },
        { flag: 'sestatus', desc: '查看模式、加载的策略名、策略版本与挂载状态' },
        { flag: 'sestatus -b', desc: '列出所有布尔值开关的当前状态' },
        { flag: 'getsebool -a', desc: '列出全部布尔值，配合 `grep` 找与业务相关的开关' }
      ],
      examples: [
        { cmd: 'getenforce', desc: '查看当前 SELinux 模式' },
        { cmd: 'sestatus', desc: '查看完整状态，包括策略版本和挂载点' },
        { cmd: 'setenforce 0 && systemctl restart nginx && echo 测试中', desc: '临时切 Permissive 后重启服务，验证故障是否与 SELinux 有关' },
        { cmd: 'getsebool -a | grep httpd', desc: '查看与 httpd/nginx 相关的布尔开关，按需开启而非关闭 SELinux' },
        { cmd: 'setsebool -P httpd_can_network_connect on', desc: '永久允许 Web 进程发起网络连接，这是反代场景最常见的放行项' }
      ],
      notes: [
        '**生产环境不要用 `setenforce 0` 长期运行**：等于关掉一层强制访问控制，且违规；正确做法是在 Permissive 下定位拒绝项后做精确策略放行',
        '`setenforce` 重启就失效，要永久关闭得改 `/etc/selinux/config`，但**从 Disabled 改回 Enforcing 需要重启并重新打标签（`touch /.autorelabel`）**，在业务机器上这一步风险极高',
        'Permissive 模式下服务能跑不代表策略正确，只说明没被拦；`/var/log/audit/audit.log` 里会积压大量 AVC 记录',
        '云厂商的公共镜像（如华为云 EulerOS、CentOS）默认多为 Enforcing，应用部署脚本里若假设 SELinux 关闭必然踩坑',
        'Ubuntu/Debian 默认用 AppArmor 而不是 SELinux，`getenforce` 会提示命令不存在，请用 `aa-status`'
      ],
      related: ['sec-ausearch', 'sec-restorecon', 'sec-semanage-fcontext', 'sec-aa-status'],
      docs: 'https://man7.org/linux/man-pages/man8/getenforce.8.html',
      tags: ['SELinux', '强制访问控制', '排障', '安全基线']
    },

    /* ---------- 12 / 38 ---------- */
    {
      id: 'sec-semanage-fcontext',
      name: 'semanage fcontext / port',
      alias: ['semanage', 'SELinux 上下文', '自定义端口放行'],
      level: 4,
      syntax: 'semanage fcontext -a -t <类型> "<路径正则>" | semanage port -a -t <类型> -p <协议> <端口>',
      summary: '永久修改文件的 SELinux 安全上下文或给服务开放非标准端口。',
      desc: 'SELinux 给每个文件、端口、进程都打了标签（context），策略按标签放行。把网站目录挪到 `/data/www` 后 Nginx 报 403，不是权限位的问题，而是 `/data/www` 的标签还是 `default_t` 而不是 `httpd_sys_content_t`——这种情况下 `chmod 777` 毫无用处，必须改标签。\n\n`semanage fcontext` 修改的是**策略数据库里的规则**（永久生效），`restorecon` 才负责把规则应用到实际文件上，两步必须都做。只做 `chcon` 是临时的，`restorecon` 或系统重打标签后会被冲掉。\n\n`semanage port` 用于给服务开放非标准端口：比如 SSH 改到 2222、Nginx 监听 8088，即使防火墙放行了，SELinux 也会拦，必须把端口加进对应类型。',
      params: [
        { flag: 'fcontext -a -t <类型> "<路径>"', desc: '新增路径的上下文规则，路径要用正则写法，如 `/data/www(/.*)?`' },
        { flag: 'fcontext -m -t <类型> "<路径>"', desc: '修改已有规则（`-a` 报已存在时改用 `-m`）' },
        { flag: 'fcontext -d "<路径>"', desc: '删除规则' },
        { flag: 'fcontext -l | grep <关键字>', desc: '查询现有规则，改之前先看系统默认怎么定义的' },
        { flag: 'port -a -t <类型> -p tcp <端口>', desc: '允许服务监听指定端口，如给 ssh_port_t 加 2222' },
        { flag: 'port -l | grep <服务>', desc: '列出某服务被允许的端口，排查端口被拒的必查项' },
        { flag: 'permissive -a <域>', desc: '把某个域单独设为宽容模式，缩小排障影响面（比全局 Permissive 更安全）' }
      ],
      examples: [
        { cmd: 'semanage fcontext -a -t httpd_sys_content_t "/data/www(/.*)?"', desc: '把 /data/www 整个目录树标记为 Web 可读内容' },
        { cmd: 'restorecon -Rv /data/www', desc: '立即把新规则应用到已有文件，此步不做等于没改' },
        { cmd: 'semanage port -a -t ssh_port_t -p tcp 2222', desc: '允许 sshd 监听 2222 端口，改 SSH 端口后必做' },
        { cmd: 'semanage port -l | grep http', desc: '查看 http 相关类型允许的端口清单' },
        { cmd: 'semanage fcontext -l | grep /var/www', desc: '查看系统对 /var/www 的默认标签定义，作为自定义目录的参考' }
      ],
      notes: [
        '**`chcon` 改的标签是临时的**，任何一次 `restorecon` 或系统 relabel 都会还原；生产上必须用 `semanage fcontext` + `restorecon` 的组合',
        '路径必须写正则形式，`/data/www` 只匹配目录本身，`/data/www(/.*)?` 才匹配整个子树，漏写会导致子目录仍被拒',
        '`semanage` 命令不在精简安装里，CentOS 装 `policycoreutils-python-utils`，老版本是 `policycoreutils-python`',
        '改策略前先用 `semanage permissive -a httpd_t` 把相关域设为宽容，确认放行项齐了再切回 Enforcing，避免反复重启业务',
        '端口冲突时 `semanage port -a` 会报 `Port tcp/2222 already defined`，说明该端口已被其他类型占用，需要先 `-d` 删除或改用别的类型',
        '容器场景要注意：宿主机上给目录打的标签与容器内进程的域可能不匹配，SELinux 与 Docker 的组合排障要额外加 `:z`/`:Z` 挂载选项'
      ],
      related: ['sec-restorecon', 'sec-ausearch', 'sec-getenforce', 'lu-chmod'],
      docs: 'https://man7.org/linux/man-pages/man8/semanage.8.html',
      tags: ['SELinux', '上下文', '端口放行', '策略']
    },

    /* ---------- 13 / 38 ---------- */
    {
      id: 'sec-restorecon',
      name: 'restorecon',
      alias: ['恢复 SELinux 标签', 'relabel', 'autorelabel'],
      level: 3,
      syntax: 'restorecon [-R] [-v] [-n] <路径> | restorecon -R -v /data',
      summary: '按策略库把文件标签重新打回正确值，修复被误改的上下文。',
      desc: '文件标签被改乱是 SELinux 环境里最常见的"玄学故障"来源：用 `cp` 从 `/tmp` 拷文件到网站目录、用 `tar` 解压、用 `rsync` 同步，都可能带着旧的或默认的标签落地，导致服务读取被拒。`restorecon` 就是按 `/etc/selinux/<策略>/contexts/files/file_contexts` 里的规则重新贴标签。\n\n`-n` 是"演练模式"，只打印会改什么而不实际修改，处理生产目录前先用它看一眼范围，避免误操作大目录导致长时间 IO。真正的全盘重打标签是 `touch /.autorelabel && reboot`，耗时长且期间服务可能不可用，只在从 Disabled 切回 Enforcing 时使用。',
      params: [
        { flag: '-R, -r', desc: '递归处理子目录' },
        { flag: '-v', desc: '显示每个被修改的文件，便于确认改动范围' },
        { flag: '-n', desc: '演练模式，只报告不修改，生产操作前必跑' },
        { flag: '-F', desc: '强制重置整个上下文（含用户与角色字段），而不仅是类型' },
        { flag: '-e <目录>', desc: '排除指定目录，避免动到挂载点或不需要处理的部分' },
        { flag: '-R -v -n /data', desc: '常见组合：先看后改' }
      ],
      examples: [
        { cmd: 'restorecon -Rv /data/www', desc: '递归恢复网站目录的标签并显示修改明细' },
        { cmd: 'restorecon -Rnv /data/www', desc: '演练模式，先确认会影响哪些文件再执行' },
        { cmd: 'ls -Z /data/www/index.html', desc: '查看文件当前的 SELinux 上下文，对比修复前后差异' },
        { cmd: 'touch /.autorelabel && reboot', desc: '触发全盘重新打标签，仅用于从 Disabled 切回 Enforcing 的场景' }
      ],
      notes: [
        '**全盘 relabel 耗时可能与磁盘容量成正比**，几百 GB 的机器可能几十分钟，期间服务性能明显下降，务必安排维护窗口',
        '`restorecon` 只对策略库里已有规则的路径有效；自定义目录必须先 `semanage fcontext` 加规则，否则执行完标签仍是默认值',
        '`ls -Z` 看类型字段（第三个冒号后的部分），`ps -eZ` 看进程域，两者匹配才可能放行',
        '用 `rsync` 同步网站目录时加 `-X` 可保留 SELinux 上下文，或用 `--chmod`、配合定期 `restorecon` 兜底',
        '看到 `/.autorelabel` 文件存在说明系统下次启动会重打标签，排障时要留意这次启动会变慢'
      ],
      related: ['sec-semanage-fcontext', 'sec-ausearch', 'sec-getenforce', 'lb-rsync'],
      docs: 'https://man7.org/linux/man-pages/man8/restorecon.8.html',
      tags: ['SELinux', '标签', '修复', '上下文']
    },

    /* ---------- 14 / 38 ---------- */
    {
      id: 'sec-ausearch',
      name: 'ausearch / aureport（SELinux 拒绝排查）',
      kind: 'recipe',
      alias: ['ausearch -m avc', 'audit 日志分析', 'AVC denied'],
      level: 3,
      syntax: 'ausearch -m avc -ts recent | ausearch -m avc -ts today | aureport --avc --summary',
      summary: '从审计日志里捞出 SELinux 拒绝记录，把"服务莫名失败"变成具体放行项。',
      desc: '被 SELinux 拦住时，应用日志往往只说"Permission denied"或"failed to open"，真正的原因记在审计子系统里。`ausearch` 负责按类型、时间、进程过滤出 AVC（Access Vector Cache）拒绝记录，`aureport` 负责汇总统计。\n\n**完整排查链路**：\n① 复现故障（如 `systemctl restart nginx`）；\n② `ausearch -m avc -ts recent` 看最近是否有 `denied` 记录，没有则说明问题不在 SELinux；\n③ 找到记录后读关键字段：`scontext` 是发起方域（如 `httpd_t`），`tcontext` 是目标标签（如 `default_t`），`tclass` 是对象类型（file/dir/tcp_socket），`denied { read }` 是被拒的动作；\n④ 按结论分两类处理：**文件标签问题**用 `semanage fcontext` + `restorecon`；**能力/端口问题**用 `setsebool -P` 或 `semanage port -a`；\n⑤ 如果标准策略无法覆盖，再用 `audit2allow -a -M mypol` 生成自定义模块，`semodule -i mypol.pp` 加载；\n⑥ 复查 `ausearch -m avc -ts recent` 确认不再有新的拒绝，再切回 Enforcing 长期运行。\n\n`audit2why` 会把 AVC 记录翻译成人话并给出建议，比直接 `audit2allow` 更安全——后者会把所有拒绝一股脑放行，等于给策略开口子。',
      params: [
        { flag: '-m avc', desc: '只看 AVC 类型的拒绝记录，SELinux 相关几乎都在这类里' },
        { flag: '-ts recent / today', desc: '限定时间范围：最近 10 分钟、今天；也可以写 `-ts 03/18/2024 10:00:00`' },
        { flag: '-i', desc: '把数字 ID 翻译成可读的用户名、进程名，强烈建议加上' },
        { flag: '-p <PID> / -c <命令名>', desc: '按进程或命令过滤，故障范围明确时用它精确定位' },
        { flag: 'aureport --avc --summary', desc: '汇总一段时间内各类拒绝的数量，适合做趋势观察' },
        { flag: 'audit2why < avc.txt', desc: '把 AVC 记录翻译成原因与建议，比 audit2allow 安全' },
        { flag: 'audit2allow -a -M <模块名>', desc: '根据拒绝记录生成自定义策略模块，最后手段' }
      ],
      examples: [
        { cmd: 'ausearch -m avc -ts recent -i', desc: '查看最近 10 分钟的 SELinux 拒绝记录，排障第一步' },
        { cmd: 'ausearch -m avc -ts today -i | grep denied | tail -20', desc: '看今天的拒绝明细，快速抓到刚复现的那条' },
        { cmd: 'ausearch -m avc -ts today -i | audit2why', desc: '把拒绝原因翻译成中文语境下的可读建议' },
        { cmd: 'aureport --avc --summary', desc: '汇总 AVC 拒绝统计，判断是偶发还是持续被拦' },
        { cmd: 'ausearch -m avc -ts recent -i | audit2allow -M nginx_custom && semodule -i nginx_custom.pp', desc: '生成并加载自定义策略模块（确认放行项无误后再执行）' },
        { cmd: 'ausearch -m avc -ts recent -i -c nginx', desc: '只过滤 nginx 相关进程的拒绝记录' }
      ],
      notes: [
        '**`audit2allow` 会把日志里所有拒绝项都放行**，可能导致权限过度授予；务必先用 `audit2why` 逐条判断，能改标签或开布尔值就不要写自定义策略',
        '记录里的 `scontext` 与 `tcontext` 是解开问题的钥匙：前者告诉你"谁被拦"，后者告诉你"访问什么被拦"',
        '`auditd` 没运行就什么都没有；用 `systemctl status auditd` 先确认服务在跑，否则请改用 `dmesg | grep -i avc` 或 `journalctl | grep AVC`',
        '审计日志增长很快，`/var/log/audit/audit.log` 撑满会导致 auditd 停写甚至系统异常，建议配 `max_log_file` 与 `num_logs` 轮转',
        '容器内进程被拦时 `scontext` 会带 `container_t` 之类的域，处理方式与宿主机不同，往往要调整挂载标签而不是改宿主策略',
        '`aureport` 不带参数会输出全部类型的报表，被拒绝项淹没时记得加 `--avc`'
      ],
      related: ['sec-auditctl', 'sec-getenforce', 'sec-semanage-fcontext', 'sec-restorecon'],
      docs: 'https://man7.org/linux/man-pages/man8/ausearch.8.html',
      tags: ['SELinux', 'AVC', '审计日志', '组合命令']
    },

    /* ---------- 15 / 38 ---------- */
    {
      id: 'sec-aa-status',
      name: 'aa-status',
      alias: ['apparmor_status', 'AppArmor 状态', 'aa-enforce'],
      level: 2,
      syntax: 'aa-status [--verbose] | aa-enforce <profile> | aa-complain <profile>',
      summary: '查看 AppArmor 配置装载情况，Debian 系主机的强制访问控制入口。',
      desc: 'Ubuntu、Debian、SUSE 默认用 AppArmor 而不是 SELinux，思路相似但实现不同：AppArmor 按**路径**而非标签来限制程序，配置文件放在 `/etc/apparmor.d/`，可读性好、上手快，但灵活度不如 SELinux。\n\n`aa-status` 输出三部分：已加载的 profile 数量、处于 enforce 模式的列表、处于 complain（只告警不拦截）模式的列表。排障时把可疑 profile 切到 complain 模式（`aa-complain`），问题消失就说明是 AppArmor 拦的，然后去 `/var/log/syslog` 或 `dmesg` 里找 `apparmor="DENIED"` 记录，按需在 profile 里加规则，最后 `aa-enforce` 切回。\n\nDocker 在 Ubuntu 上运行时会自动加载 `docker-default` profile，这是容器逃逸防护的一部分，不要随手把它设成 complain。',
      params: [
        { flag: 'aa-status', desc: '查看已加载的 profile 及各自模式' },
        { flag: '--verbose', desc: '显示每个 profile 的详细限制规则' },
        { flag: 'aa-enforce <profile>', desc: '把指定 profile 切到强制拦截模式' },
        { flag: 'aa-complain <profile>', desc: '切到只记录不拦截模式，用于确认问题是否由 AppArmor 引起' },
        { flag: 'aa-disable <profile>', desc: '卸载指定 profile，风险最高，仅在明确不需要时使用' },
        { flag: 'apparmor_parser -r <文件>', desc: '重新加载修改过的 profile' }
      ],
      examples: [
        { cmd: 'aa-status', desc: '查看 AppArmor 装载概况与 enforce/complain 列表' },
        { cmd: 'aa-status --verbose | head -40', desc: '查看具体 profile 的详细规则' },
        { cmd: 'aa-complain /usr/sbin/nginx', desc: '把 Nginx 的 profile 切到只记录，验证故障是否与 AppArmor 相关' },
        { cmd: 'dmesg | grep -i "apparmor.*DENIED" | tail -20', desc: '查看内核记录的 AppArmor 拒绝明细' },
        { cmd: 'aa-enforce /usr/sbin/nginx', desc: '排查结束后切回强制模式' }
      ],
      notes: [
        '**Debian/Ubuntu 上没有 `getenforce`**，安全基线检查脚本要按发行版分支处理，否则会误报"未开启强制访问控制"',
        '`aa-complain` 会让整套限制失效，属于临时排障手段，排查完必须 `aa-enforce` 恢复',
        '拒绝记录不一定在 `/var/log/audit/`，Debian 系多数在 `/var/log/syslog` 与 `dmesg` 里，关键字是 `apparmor="DENIED"`',
        '**不要随意 `aa-disable docker-default`**，它会削弱容器隔离；容器启动异常时优先检查挂载路径是否在允许范围内',
        'SUSE/openSUSE 上 `aa-status` 命令名可能为 `apparmor_status`，两者等价'
      ],
      related: ['sec-getenforce', 'dk-run', 'sec-ausearch', 'sec-chroot'],
      docs: 'https://gitlab.com/apparmor/apparmor/-/wikis/manpage_aa-status.8',
      tags: ['AppArmor', 'Ubuntu', '强制访问控制', '排障']
    },

    /* ================= C. 审计与入侵排查 ================= */

    /* ---------- 16 / 38 ---------- */
    {
      id: 'sec-auditctl',
      name: 'auditctl',
      alias: ['auditd 规则', 'audit.rules', '关键文件监控'],
      level: 4,
      syntax: 'auditctl -w <文件或目录> -p <权限> -k <关键字> | auditctl -l | auditctl -s',
      summary: '给关键文件与系统调用加审计规则，事后能查清谁在什么时候动了什么。',
      desc: 'auditd 是内核级的审计子系统，能在系统调用层记录"谁改了 `/etc/passwd`""谁执行了 `rm`"。规则分两类：**文件监控**（`-w` 监听路径的读写执行属性变化）和**系统调用监控**（`-a` 按 syscall 过滤，能力更强也更吃性能）。\n\n用 `-k` 给规则打关键字是运维必备习惯：事后用 `ausearch -k <关键字>` 能直接捞出这条规则命中的全部记录，否则只能在海量日志里翻。\n\n`auditctl` 加的规则重启即失效，持久化要写进 `/etc/audit/rules.d/*.rules`（CentOS 7+/RHEL 8+）或 `/etc/audit/audit.rules`，然后 `augenrules --load` 重载。写持久化文件时要先 `-D` 清空旧规则再逐条追加，顺序错了可能导致规则不生效。',
      params: [
        { flag: '-w <路径> -p rwxa', desc: '监控文件/目录的读、写、执行、属性修改，`-p wa` 是最常用组合' },
        { flag: '-k <关键字>', desc: '给规则命名，检索时用 `ausearch -k <关键字>`' },
        { flag: '-a always,exit -F arch=b64 -S <syscall>', desc: '按系统调用过滤，如 `-S execve` 记录所有程序执行（日志量极大）' },
        { flag: '-l', desc: '列出当前生效的规则' },
        { flag: '-s', desc: '查看审计子系统状态：是否启用、丢失事件数、缓冲区大小' },
        { flag: '-D', desc: '清空所有规则，重建规则集前使用' },
        { flag: '-b <数量>', desc: '设置内核审计缓冲区大小，日志突发时避免 `lost` 计数增长' }
      ],
      examples: [
        { cmd: 'auditctl -w /etc/passwd -p wa -k passwd_change', desc: '监控 /etc/passwd 的写入与属性修改，这是入侵排查的核心规则' },
        { cmd: 'auditctl -w /etc/sudoers -p wa -k sudoers_change', desc: '监控 sudoers 变更，权限提升类攻击的第一步往往就是改这里' },
        { cmd: 'auditctl -l && auditctl -s', desc: '查看已加载规则与审计状态，确认规则真的生效' },
        { cmd: 'auditctl -a always,exit -F arch=b64 -S execve -k exec_cmd', desc: '记录所有命令执行（仅建议在短期排查时开启，日志量极大）' },
        { cmd: 'ausearch -k passwd_change -ts today -i', desc: '检索今天所有命中 passwd_change 规则的记录' },
        { cmd: 'service auditd restart', desc: '重启审计服务（注意 auditd 要用 service 而不是 systemctl restart，否则会停掉后不再启动）' }
      ],
      notes: [
        '**`-S execve` 这类全量系统调用规则会产生巨量日志**，几小时内就可能把磁盘写满，只建议在定向排查时短期开启',
        '持久化规则写在 `/etc/audit/rules.d/audit.rules`，文件首行建议 `-D`，然后 `augenrules --load` 与 `systemctl restart auditd` 使其生效',
        '`auditctl -s` 里 `lost` 计数持续增长说明缓冲区不够，需要调大 `-b`，否则关键事件会被丢弃，审计结论不可信',
        '**重启 auditd 请用 `service auditd restart`**：auditd 是特殊的系统服务，用 systemctl 停止后可能无法自动拉起',
        '`-p wa` 表示监控写和属性修改；只写 `-p w` 会漏掉 `chmod`/`chown` 这类攻击者常做的动作',
        '审计日志是法律证据链的一部分，涉及等保合规的机器必须保证 auditd 常开且日志集中收集到远端，避免被入侵者清理'
      ],
      related: ['sec-ausearch', 'sec-lastb', 'sec-backdoor-check', 'lu-journalctl'],
      docs: 'https://man7.org/linux/man-pages/man8/auditctl.8.html',
      tags: ['审计', 'auditd', '合规', '入侵排查']
    },

    /* ---------- 17 / 38 ---------- */
    {
      id: 'sec-lastb',
      name: 'lastb / last',
      alias: ['last -f /var/log/btmp', '登录失败记录', 'wtmp 查询'],
      level: 2,
      syntax: 'lastb [-n <条数>] [-i] | last [-n <条数>] [-a] [-i] [-F] | lastlog',
      summary: '查看登录失败与成功历史，几分钟内判断主机是否正被爆破。',
      desc: '`last` 读 `/var/log/wtmp`（成功登录），`lastb` 读 `/var/log/btmp`（失败登录），两者都是二进制格式，必须用命令解析。`lastb` 输出里出现成百上千条来自同一 IP 的 `root` 失败记录，就是典型的 SSH 爆破。\n\n`-i` 会把 IP 反解成主机名，排查时反而更麻烦（DNS 查询慢且可能失败），建议保持数字形式。`last -a` 把来源地址放到最后一列，长用户名时更整齐。`lastlog` 则显示每个账户"最后一次登录时间"，用来找出长期未用却有登录痕迹的可疑账户。\n\n排查思路：先 `lastb | head` 看攻击源规模 → `last -n 20` 确认有没有真的登录成功 → 若有成功记录立刻按后门排查流程处理；若只有失败，则上 fail2ban、改端口、禁 root 密码登录。',
      params: [
        { flag: 'lastb -n <条数>', desc: '只看最近若干条失败记录，避免刷屏' },
        { flag: '-i', desc: '显示 IP 而不是反解后的主机名' },
        { flag: 'last -a', desc: '来源地址显示在最后一列，输出更整齐' },
        { flag: 'last -F', desc: '显示完整的登录与登出时间' },
        { flag: 'last -x', desc: '额外显示关机、运行级别切换等系统事件' },
        { flag: 'lastlog', desc: '列出每个账户最后一次登录时间，找可疑账户' },
        { flag: 'last -f /var/log/wtmp.1', desc: '读取已轮转的历史文件' }
      ],
      examples: [
        { cmd: 'lastb -n 20 -i', desc: '看最近 20 条登录失败记录与来源 IP' },
        { cmd: 'lastb -i | awk \'{print $3}\' | sort | uniq -c | sort -rn | head -10', desc: '统计失败登录的来源 IP 排行，定位爆破源头' },
        { cmd: 'last -n 20 -a -i', desc: '看最近 20 次成功登录，确认是否存在异常来源' },
        { cmd: 'lastlog | grep -v "Never logged in"', desc: '列出有登录记录的账户，发现被创建的可疑账号' },
        { cmd: 'who -a && w', desc: '看当前在线会话，判断攻击者是否正在进行中' }
      ],
      notes: [
        '**`/var/log/btmp` 权限是 600 且属主 root**，普通用户看不到，这是设计如此；排查需要 root',
        '`btmp` 记录被清空或时间断层，本身就是被入侵后清理痕迹的信号，要结合文件 mtime 与审计日志判断',
        '云主机上暴露 22 端口会在上线几分钟内就开始被扫，`lastb` 几十万条记录并不代表已被攻破，关键是看 `last` 里有没有成功登录',
        '日志轮转后历史记录在 `wtmp.1`、`btmp.1`，用 `last -f` 读取，别以为记录丢了',
        '**只靠 `lastb` 不足以证明没被入侵**：攻击者可以清理 wtmp/btmp，必须结合 auditd 日志与集中式日志平台交叉验证'
      ],
      related: ['sec-secure-log', 'sec-fail2ban', 'sec-backdoor-check', 'lu-last'],
      docs: 'https://man7.org/linux/man-pages/man1/last.1.html',
      tags: ['登录审计', '爆破检测', '入侵排查', 'SSH']
    },

    /* ---------- 18 / 38 ---------- */
    {
      id: 'sec-secure-log',
      name: '登录日志爆破特征分析（组合）',
      kind: 'recipe',
      alias: ['/var/log/secure 分析', 'auth.log 爆破', 'SSH 攻击分析'],
      level: 3,
      syntax: 'grep "Failed password" /var/log/secure | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn | head',
      summary: '从认证日志里统计爆破来源与目标账户，为封禁与加固提供依据。',
      desc: '`/var/log/secure`（CentOS/RHEL）与 `/var/log/auth.log`（Ubuntu/Debian）记录所有认证事件，是判断爆破规模的第一手材料。日志轮转后有 `.1`、`.gz` 历史文件，分析长期趋势要用 `zgrep`。\n\n**完整分析链路**：\n① 统计来源 IP：`grep "Failed password" /var/log/secure | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn | head -20`（注意字段位置会因日志格式略有差异，用 `head -1` 先确认）；\n② 统计被攻击账户：把 IP 换成用户名位置，看攻击者是否在猜特定账号；\n③ 确认是否成功：`grep "Accepted" /var/log/secure | grep -v "127.0.0.1"` —— 只要出现非预期来源的 Accepted，就要立刻按入侵事件处理；\n④ 看是否有账户被锁：`grep "Failed password for invalid user"` 说明攻击者在猜不存在的用户，`pam_unix(...): authentication failure` 则是真实账户被猜；\n⑤ 封禁与加固：临时用 `firewall-cmd --add-rich-rule` 或安全组拉黑来源，长期上 fail2ban、禁 root 直登、只允许密钥认证、暴露面收敛到跳板机。\n\n只统计不处置等于没做，分析结果应落到封禁动作与配置变更上。',
      params: [
        { flag: 'grep "Failed password"', desc: '抓失败认证记录，SSH 爆破的主证据' },
        { flag: 'grep "Accepted"', desc: '抓成功认证记录，判断是否已被攻破，优先级最高' },
        { flag: 'grep "Invalid user"', desc: '识别针对不存在账户的扫描式爆破' },
        { flag: 'awk \'{print $(NF-3)}\'', desc: '取倒数第 4 列，通常是来源 IP；先用 `head -1` 核对字段位置' },
        { flag: 'sort | uniq -c | sort -rn', desc: '经典的计数排序组合，输出"次数 + 对象"排行' },
        { flag: 'zgrep', desc: '直接搜索 `.gz` 轮转日志，分析跨天趋势必备' }
      ],
      examples: [
        { cmd: 'grep "Failed password" /var/log/secure | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn | head -10', desc: '统计失败登录来源 IP 排行，前几名就是重点封禁对象' },
        { cmd: 'grep "Failed password" /var/log/secure | awk \'{print $(NF-5)}\' | sort | uniq -c | sort -rn | head -10', desc: '统计被猜测的用户名排行，判断攻击是否针对特定账号' },
        { cmd: 'grep "Accepted" /var/log/secure | grep -v "127.0.0.1"', desc: '看有没有非本机来源的成功登录，这是入侵判定红线' },
        { cmd: 'grep -c "Failed password" /var/log/secure', desc: '统计当前日志里的失败次数，快速评估爆破强度' },
        { cmd: 'zgrep "Accepted" /var/log/secure-202403*.gz', desc: '在历史轮转日志里回溯搜索成功登录记录' },
        { cmd: 'firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=203.0.113.66 reject" && firewall-cmd --reload', desc: '临时封禁爆破来源 IP（firewalld 环境）' }
      ],
      notes: [
        '**发现非预期的 `Accepted` 记录必须按入侵事件处理**：立即隔离主机、保全日志、轮换该主机上所有密钥与密码，不要只是封 IP 了事',
        'Ubuntu/Debian 上文件是 `/var/log/auth.log`，没有 `/var/log/secure`；报错文件不存在时先按发行版换路径',
        '`awk` 取字段的下标会因日志版本略有差异（有的包含 `port`，有的不含），务必先 `head -3` 看清格式再写脚本',
        '日志被 `logrotate` 轮转后新文件会重置计数，长期统计要合并历史文件或用集中日志平台（ELK/LTS）',
        '**失败次数多不代表被攻破，但成功一次就是事件**；同时要留意 `sudo` 提权记录与 `su` 切换记录',
        '封 IP 只是止血，治本要关掉密码登录（`PasswordAuthentication no`）、禁止 root 直登、把 22 端口收敛到跳板机'
      ],
      related: ['sec-lastb', 'sec-fail2ban', 'sec-backdoor-check', 'sec-aksk-leak'],
      docs: 'https://man7.org/linux/man-pages/man8/sshd.8.html',
      tags: ['爆破检测', '日志分析', 'SSH', '组合命令']
    },

    /* ---------- 19 / 38 ---------- */
    {
      id: 'sec-fail2ban',
      name: 'fail2ban-client status',
      alias: ['fail2ban', '自动封禁', '封禁爆破IP'],
      level: 2,
      syntax: 'fail2ban-client status [<jail名>] | fail2ban-client set <jail> unbanip <IP> | fail2ban-client banned',
      summary: '查看自动封禁状态与黑名单，把反复爆破的 IP 自动挡在门外。',
      desc: 'fail2ban 通过持续读取日志文件，匹配到指定次数的失败记录后就调用防火墙（iptables/firewalld/nftables）把来源 IP 封禁一段时间。相比手工 grep 再封 IP，它把整个闭环自动化了。\n\n`fail2ban-client status` 不带参数列出所有 jail；带 jail 名会显示 `Currently failed`、`Total failed`、`Currently banned`、`Banned IP list`，这是判断"是否真的在封"的关键输出。\n\nUbuntu 系默认 jail 是 `sshd`，CentOS 需要手动装 EPEL 并启用。生产上要注意 `ignoreip` 里必须包含跳板机与内网网段，否则可能把运维自己锁在门外——这是 fail2ban 最著名的事故。',
      params: [
        { flag: 'status', desc: '列出所有 jail 及其启用状态' },
        { flag: 'status <jail>', desc: '查看指定 jail 的失败计数与封禁列表' },
        { flag: 'set <jail> banip <IP>', desc: '手工封禁一个 IP' },
        { flag: 'set <jail> unbanip <IP>', desc: '解封 IP，误封时使用' },
        { flag: 'banned', desc: '列出所有当前被封的 IP（部分版本支持）' },
        { flag: 'reload', desc: '修改配置后重载，不中断已有封禁' }
      ],
      examples: [
        { cmd: 'fail2ban-client status', desc: '查看所有 jail 及其启停状态' },
        { cmd: 'fail2ban-client status sshd', desc: '查看 sshd jail 的失败次数与封禁 IP 列表' },
        { cmd: 'fail2ban-client set sshd unbanip 203.0.113.66', desc: '解封被误封的 IP' },
        { cmd: 'fail2ban-client set sshd banip 203.0.113.66', desc: '手工封禁一个正在爆破的来源' },
        { cmd: 'fail2ban-client reload', desc: '改完 /etc/fail2ban/jail.local 后重载配置' }
      ],
      notes: [
        '**`ignoreip` 必须包含跳板机、内网网段与监控探针地址**，否则一次密码输错就可能把自己或监控系统封掉，是最常见的事故',
        'fail2ban 依赖 `iptables`/`firewalld`/`nftables` 后端，容器内运行通常没有权限操作宿主机防火墙，效果会打折',
        '它只能挡暴力破解，**不能替代密钥认证与端口收敛**：攻击者用分布式 IP 慢速猜时 fail2ban 基本无效',
        'CentOS 需要先装 EPEL（`yum install epel-release`）才能 `yum install fail2ban`，Ubuntu 直接 `apt install fail2ban`',
        '被封 IP 是临时的（默认 10 分钟），要长期封禁得调 `bantime` 或配合云安全组/云 WAF 的黑名单能力',
        '注意区分 `jail.conf` 与 `jail.local`：升级会覆盖 `jail.conf`，自定义配置一律写 `jail.local`'
      ],
      related: ['sec-secure-log', 'sec-lastb', 'ln-firewall-cmd', 'sec-sg-minimal'],
      docs: 'https://github.com/fail2ban/fail2ban/wiki',
      tags: ['自动封禁', 'SSH防护', '防火墙', '爆破']
    },

    /* ---------- 20 / 38 ---------- */
    {
      id: 'sec-lynis',
      name: 'lynis audit system',
      alias: ['lynis', '安全基线检查', '系统加固审计'],
      level: 3,
      syntax: 'lynis audit system [--quick] [--pentest] [--tests-from-group <组名>]',
      summary: '一键跑系统安全基线审计并给出加固建议，上线前的自查利器。',
      desc: 'Lynis 是开源的系统加固审计工具，会检查几百个项目：SSH 配置、密码策略、文件权限、内核参数、日志与审计配置、已安装软件包漏洞、防火墙状态等，最后输出一个 `Hardening index` 分数和按优先级排列的建议列表。\n\n它**只读不写**，不会自动改配置，所有建议都要人工评估后执行——这一点很重要，因为部分建议（如禁用 IPv6、收紧文件权限）可能影响现有业务。\n\n实用的用法是把它做成"上线检查"与"月度巡检"两步：上线前跑一次拿到基线分数，之后每月跑一次对比分数变化。输出报告默认在 `/var/log/lynis.log` 与 `/var/log/lynis-report.dat`，后者是结构化格式，便于接入监控做趋势。',
      params: [
        { flag: 'audit system', desc: '完整审计本机系统' },
        { flag: '--quick', desc: '只显示警告与建议，不逐项滚动输出，适合快速看结论' },
        { flag: '--pentest', desc: '以渗透测试视角审计，会做更多主动检查（需授权）' },
        { flag: '--tests-from-group <组>', desc: '只跑指定组，如 `authentication`、`networking`、`ssh`' },
        { flag: '--no-colors', desc: '关闭颜色输出，便于重定向到文件或工单系统' },
        { flag: '--upload', desc: '把审计结果匿名上传到官方做统计对比（内网环境请勿使用）' }
      ],
      examples: [
        { cmd: 'lynis audit system', desc: '完整审计并输出加固建议（需要 root）' },
        { cmd: 'lynis audit system --quick', desc: '只看警告与建议摘要，快速评估当前风险' },
        { cmd: 'lynis audit system --tests-from-group authentication --no-colors', desc: '只审计认证相关项，聚焦 SSH 与密码策略' },
        { cmd: 'grep -E "^warning|^suggestion" /var/log/lynis-report.dat | head -20', desc: '从报告文件里直接提取警告与建议列表' }
      ],
      notes: [
        '**Lynis 只给建议不会自动改配置**，看到"建议禁用 IPv6"这类项要评估业务影响，别照单全收',
        '审计需要 root 权限，普通用户跑会大量跳过检查项，结论不完整',
        '审计过程中会在 `/var/log/lynis.log` 写入内容，日志留存策略敏感的环境请提前确认，或加 `--no-log`',
        '**`--pentest` 含主动探测行为**，只对自己拥有或已获书面授权的系统使用',
        'CentOS 需要 EPEL 源（`yum install lynis`），Ubuntu 可直接 `apt install lynis`；也可以从官网下载 tar 包免安装运行',
        '它与 `kube-bench`（K8s 基线）、`trivy`（镜像漏洞）是互补关系：Lynis 管主机、kube-bench 管集群、trivy 管镜像'
      ],
      related: ['sec-kube-bench', 'sec-rpm-va', 'sec-sg-minimal', 'sec-auditctl'],
      docs: 'https://cisofy.com/documentation/lynis/',
      tags: ['基线检查', '加固', '合规', '审计']
    },

    /* ---------- 21 / 38 ---------- */
    {
      id: 'sec-rpm-va',
      name: 'rpm -Va / debsums',
      alias: ['rpm -Va', '文件完整性校验', 'debsums -c'],
      level: 3,
      syntax: 'rpm -Va [--nofiledigest] | debsums -c | rpm -V <包名>',
      summary: '校验系统文件是否被篡改，入侵排查里判断"有没有被动过手脚"的硬证据。',
      desc: '包管理器记录了每个文件的原始大小、权限、属主和摘要值，用它反向校验就能发现被替换的命令。攻击者常见的做法是替换 `ps`、`netstat`、`ls` 来隐藏自己，`rpm -Va` 正是治这类 Rootkit 的利器。\n\n`rpm -Va` 输出每行 9 个标记位，含义依次是：`S` 大小、`M` 模式（权限）、`5` 摘要（内容变了，**最需要关注**）、`D` 设备号、`L` 符号链接、`U` 属主、`G` 属组、`T` 修改时间、`P` 能力集。只出现 `T` 或 `U` 通常是正常运维动作；出现 `5` 且有可执行文件被改，就要立刻深挖。\n\nDebian/Ubuntu 对应 `debsums -c`（只列出校验失败的文件），但它默认不校验配置文件且需要先装 `debsums` 包。另一类误报来源是包升级后未更新的配置文件（`.rpmnew`/`.rpmsave`），排查时要先排除。',
      params: [
        { flag: 'rpm -Va', desc: '校验所有已安装包的文件，输出量大但最全面' },
        { flag: 'rpm -V <包名>', desc: '只校验指定包，定位更聚焦，如 `rpm -V coreutils`' },
        { flag: '--nofiledigest', desc: '跳过摘要校验加快速度，只看大小权限时间' },
        { flag: 'rpm -qf <文件>', desc: '反查文件属于哪个包，确认可疑文件是否由正规包安装' },
        { flag: 'debsums -c', desc: 'Debian 系只列出校验失败的文件，输出干净' },
        { flag: 'debsums -e', desc: 'Debian 系只检查配置文件是否被改' }
      ],
      examples: [
        { cmd: 'rpm -Va 2>/dev/null | grep "^..5" | head -30', desc: '只筛出内容被修改（摘要不符）的文件，这是最可疑的一类' },
        { cmd: 'rpm -V coreutils procps-ng net-tools', desc: '定向校验常用命令所在包，排查命令是否被替换' },
        { cmd: 'rpm -qf /usr/bin/ps', desc: '确认 ps 命令属于哪个包，再决定是否重装该包' },
        { cmd: 'debsums -c 2>/dev/null | head -30', desc: 'Debian/Ubuntu 上列出校验失败的文件' },
        { cmd: 'rpm -Va --nofiledigest | grep -E "^.{7}(U|G)" ', desc: '筛出属主或属组被改动的文件，发现提权后门' }
      ],
      notes: [
        '**输出里出现 `5`（摘要不符）且涉及 `/usr/bin`、`/usr/sbin` 下的可执行文件时按入侵处理**，不要简单重装覆盖，先保全样本做取证',
        '首次运行基线是"未知"状态，正常运维改动（装包、改配置、升级内核）也会产生大量输出，建议在干净状态下先存档一份基线输出对比',
        '`/etc` 下配置文件出现 `S.5....T c` 多为正常的配置修改（`c` 表示 config file），不必惊慌，但也要核对内容',
        '软件包升级后遗留的 `.rpmnew`、`.rpmsave` 会产生误报，排查前先 `find /etc -name "*.rpmnew"` 清理判断',
        '**校验工具本身也可能被替换**，入侵场景下应该用 U 盘或救援模式里的干净 `rpm` 二进制来校验；华为云可用"一键式重置密码/救援模式"挂载原盘离线检查',
        '`debsums` 在 Debian 上默认不包含在最小安装中，需要 `apt install debsums`，且它对配置文件的校验要显式加 `-e`'
      ],
      related: ['sec-backdoor-check', 'sec-lynis', 'sec-auditctl', 'sec-clamav'],
      docs: 'https://man7.org/linux/man-pages/man8/rpm.8.html',
      tags: ['完整性校验', 'Rootkit', '入侵排查', '包管理']
    },

    /* ---------- 22 / 38 ---------- */
    {
      id: 'sec-backdoor-check',
      name: '后门排查（组合）',
      kind: 'recipe',
      alias: ['入侵排查流程', '异常进程端口定时任务', '应急响应检查'],
      level: 4,
      syntax: 'ps -ef --sort=-%cpu | ss -tulnp | crontab -l | cat ~/.ssh/authorized_keys  # 四路并行排查',
      summary: '按进程、端口、定时任务、SSH 公钥四条线并行排查，确认主机是否被留后门。',
      desc: '怀疑主机被入侵时，逐条命令东看西看最容易漏，正确做法是按固定清单四路并行排查，任何一条命中就升级为安全事件。\n\n**完整排查链路**：\n① **异常进程**：`ps -ef --sort=-%cpu | head -20` 看有没有吃 CPU 的可疑挖矿进程；`ps -ef | grep -v "^\[" | awk \'{print $8}\' | sort -u` 扫可执行文件路径；特别注意名字伪装成 `[kworker/0:1]`、`systemd-udevd` 却指向 `/tmp`、`/dev/shm` 的进程。\n② **异常端口**：`ss -tulnp` 找监听在非预期端口上的进程（4444、5555、6379 未授权、31337 等）；`lsof -i -P -n | grep LISTEN` 交叉验证；容器环境还要 `docker ps` 看有没有陌生容器。\n③ **异常定时任务**：`crontab -l`（当前用户）、`for u in $(cut -d: -f1 /etc/passwd); do crontab -l -u $u; done`（所有用户）、`ls -la /etc/cron.*`、`systemctl list-timers`；攻击者最常用 `/var/spool/cron/` 与 `/etc/cron.d/` 做持久化。\n④ **异常公钥**：`cat ~/.ssh/authorized_keys`、`find / -name authorized_keys 2>/dev/null`（含其他用户与服务账户）；看到不认识的 key 立即删除并同时改密码、换密钥。\n⑤ **补充检查**：`ls -la /etc/ld.so.preload`（preload 劫持）、`find / -name "*.so" -newer /etc/hostname 2>/dev/null`、`last`/`lastb` 看登录痕迹、`systemctl list-units --type=service --state=running` 找陌生服务、`/etc/rc.local` 与 `/etc/init.d/` 开机自启项。\n⑥ **处置**：断网隔离（改安全组而不是关机，保留内存证据）→ 保全 `/var/log`、`ps`/`ss` 输出到外部存储 → 清除后门 → 全面轮换该主机上出现过的所有凭据（AK/SK、数据库密码、SSH 私钥）→ 用干净镜像重建主机，**不要试图在被入侵的机器上"修好继续用"**。\n\n顺序很关键：**先保全证据再清理**，很多团队一激动直接 `kill -9` 删文件，结果无法溯源。',
      params: [
        { flag: 'ps -ef --sort=-%cpu', desc: '按 CPU 排序看异常高负载进程，挖矿木马的第一特征' },
        { flag: 'ss -tulnp', desc: '列出所有监听端口与对应进程，找非预期监听' },
        { flag: 'lsof -i -P -n', desc: '从文件描述符角度看网络连接，可与 ss 交叉验证' },
        { flag: 'crontab -l -u <用户>', desc: '查看指定用户的定时任务，遍历所有用户才完整' },
        { flag: 'systemctl list-timers --all', desc: '查看 systemd 定时器，比 cron 更隐蔽的持久化位置' },
        { flag: 'find / -name authorized_keys', desc: '全盘搜索 SSH 公钥文件，包括服务账户' },
        { flag: 'ls -la /etc/ld.so.preload', desc: '检查动态库劫持，正常系统该文件不存在' }
      ],
      examples: [
        { cmd: 'ps -ef --sort=-%cpu | head -15', desc: '第一步：看有没有吃满 CPU 的可疑进程' },
        { cmd: 'ss -tulnp', desc: '第二步：找监听在异常端口上的进程' },
        { cmd: 'crontab -l; ls -la /etc/cron.d /etc/cron.hourly /var/spool/cron', desc: '第三步：检查各类定时任务位置' },
        { cmd: 'find / -name authorized_keys -exec ls -l {} \\; 2>/dev/null', desc: '第四步：找出所有 SSH 公钥文件，逐一核对是否认识' },
        { cmd: 'ls -la /etc/ld.so.preload 2>/dev/null; systemctl list-units --type=service --state=running | tail -20', desc: '补充检查：库劫持与陌生运行中服务' },
        { cmd: 'ps -eo pid,lstart,cmd | grep -v "\\[" | sort -k3 | tail -20', desc: '按启动时间看最近启动的进程，入侵往往就发生在这几天' }
      ],
      notes: [
        '**先保全证据再清理**：把 `ps -ef`、`ss -tulnp`、`crontab -l`、`find / -newer` 的输出重定向到外部存储或截图，再动手删文件',
        '**隔离用安全组而不是 `shutdown`**：关机后内存中的恶意进程信息与网络连接全部丢失；正确做法是改安全组只放行管理 IP，或把网卡断开但保持开机',
        '**不要在原机上"清理后继续用"**：被提权过的系统无法证明干净，标准做法是重建；确需保留数据的，只迁移数据文件不迁移可执行文件与配置',
        '**凭据轮换常被遗漏**：主机上的 AK/SK、数据库密码、Redis 密码、SSH 私钥、CI Token 都要视为已泄露并全部更换',
        '攻击者的持久化位置远不止这四处：还有 `/etc/systemd/system/*.service`、`~/.bashrc` 追加的反弹 shell、`/etc/rc.local`、PAM 模块、内核模块（`lsmod`），排查要成体系',
        '使用 `ps`、`ss` 这类命令前，最好用 `rpm -V` 或干净介质中的二进制确认它们没被替换，否则看到的是攻击者想让你看到的结果'
      ],
      related: ['sec-rpm-va', 'sec-auditctl', 'sec-aksk-leak', 'sec-secure-log'],
      docs: 'https://man7.org/linux/man-pages/man1/ps.1.html',
      tags: ['入侵排查', '应急响应', '后门', '组合命令']
    },

    /* ================= D. 扫描与加固 ================= */

    /* ---------- 23 / 38 ---------- */
    {
      id: 'sec-nmap',
      name: 'nmap',
      alias: ['nmap -sT', 'nmap -sV', '端口扫描'],
      level: 2,
      syntax: 'nmap [-sT|-sS] [-sV] [-p <端口>] [--script <脚本>] [-Pn] <目标>',
      summary: '扫描目标主机开放端口与服务版本，用于自查暴露面。',
      desc: 'Nmap 是端口与服务识别的标准工具。运维场景主要有两个用途：**上线前自查**（确认安全组和主机防火墙是否只开了该开的端口）和**资产盘点**（批量确认网段内存活主机与开放服务）。\n\n`-sT` 是完整 TCP 连接扫描，不需要 root，日志里会留下完整连接记录，适合在云环境或需要审计留痕时使用；`-sS` 是 SYN 半开扫描，更快更隐蔽但需要 root，且部分云厂商的流量审计会告警。`-sV` 做服务版本探测，能区分 80 端口上跑的是 Nginx 还是 Tomcat，但耗时明显增加。\n\n`--script` 调用 NSE 脚本引擎，`--script=banner` 只抓 banner（轻量），`--script=vuln` 会尝试漏洞探测（**属于攻击行为，绝不可对非授权目标使用**）。脚本结果只能作为线索，不能当成漏洞结论。',
      params: [
        { flag: '-sT', desc: 'TCP 全连接扫描，不需要 root，适合云主机与合规留痕场景' },
        { flag: '-sS', desc: 'SYN 半开扫描，速度快但需要 root，部分云平台会判定为异常流量' },
        { flag: '-sV', desc: '探测服务与版本，用于确认端口上跑的是什么' },
        { flag: '-p <端口>', desc: '指定端口范围，如 `-p 22,80,443`、`-p 1-1024`、`-p-`（全端口）' },
        { flag: '--script <脚本>', desc: '调用 NSE 脚本，如 `banner`、`http-title`；`vuln` 类脚本具有攻击性' },
        { flag: '-Pn', desc: '跳过主机存活探测，直接扫端口；目标禁 ping 时必须加' },
        { flag: '-T4', desc: '提高扫描速度（0~5），T4 是内网常用档位，T5 可能丢包误判' },
        { flag: '-oN/-oX <文件>', desc: '把结果输出为普通文本或 XML，便于归档与对比' }
      ],
      examples: [
        { cmd: 'nmap -sT -p 1-1024 -Pn 10.0.1.23', desc: '扫描自有 ECS 的常用端口，核对是否有意外开放的服务' },
        { cmd: 'nmap -sT -sV -p 22,80,443,3306,6379 -Pn 10.0.1.23', desc: '对关键端口做版本识别，确认服务与预期一致' },
        { cmd: 'nmap -sT -p 6379,3306,27017 -Pn 10.0.1.0/24 -oN /tmp/db-port-scan.txt', desc: '扫描自有网段里的数据库端口暴露情况并归档结果' },
        { cmd: 'nmap -sT --script=banner -p 22 10.0.1.23', desc: '抓取 SSH banner，确认版本信息是否泄露过多' }
      ],
      notes: [
        '**仅对自有资产使用**：未经书面授权扫描他人网络与主机在《网络安全法》《刑法》第 285 条下属于违法行为，可能承担刑事责任',
        '扫描前先确认云厂商的渗透测试政策：华为云等厂商要求提前提交渗透测试申请，未报备的扫描可能被安全中心判定为攻击并封禁 IP',
        '`-sS` 需要 root；云主机上大规模 SYN 扫描会产生大量半开连接，可能触发云 WAF/ADS 的 DDoS 防护策略',
        '`-p-` 全端口扫描一台主机可能耗时数十分钟，扫整个网段前请评估时间与流量成本',
        '**`--script=vuln` 等攻击性脚本等同于渗透测试**，只允许在取得授权的测试环境中使用',
        '扫描结果里"端口开放"不等于"有漏洞"，要结合版本、认证配置与访问控制综合判断'
      ],
      related: ['sec-masscan', 'sec-nikto', 'sec-sg-minimal', 'ln-nc'],
      docs: 'https://nmap.org/book/man.html',
      tags: ['端口扫描', '暴露面', '资产盘点', '合法授权']
    },

    /* ---------- 24 / 38 ---------- */
    {
      id: 'sec-masscan',
      name: 'masscan',
      alias: ['masscan 全端口扫描', '高速扫描', '大网段扫描'],
      level: 3,
      syntax: 'masscan <网段> -p<端口范围> --rate=<每秒包数> [--wait 3] [-oL <输出文件>]',
      summary: '超高速度的大网段端口扫描，几分钟扫完全网段但极易触发防护。',
      desc: 'masscan 用自定义的异步发包引擎，速度比 nmap 快几个数量级：扫一个 B 类网段的全端口可以在几分钟内完成。代价是它不维护完整 TCP 状态、不做服务识别，只回答"这个端口通不通"，所以典型分工是 **masscan 粗筛 + nmap 精扫**。\n\n`--rate` 是最关键的参数：它决定每秒发多少包。设得太高（如 100000）会瞬间占满出口带宽、把交换机打挂、被云平台判定为 DDoS 攻击并直接封禁 ECS。内网自查建议从 `--rate=1000` 起步，观察网络与告警再逐步提高。\n\n华为云等平台对出方向异常流量有自动检测，扫外网时极易触发封禁，务必只在自有内网、维护窗口、并事先知会网络与安全团队的前提下使用。',
      params: [
        { flag: '<网段>', desc: '目标范围，如 `10.0.1.0/24`；也可以从文件读取 `--include-file`' },
        { flag: '-p<端口>', desc: '端口范围，如 `-p22,80,443`、`-p0-65535`；注意 `-p` 与值之间不写空格' },
        { flag: '--rate=<数值>', desc: '每秒发包数，内网自查从 1000 起，越高风险越大' },
        { flag: '--wait <秒>', desc: '发包结束后等待多久收结果，默认 10 秒，短扫可用 3' },
        { flag: '-oL <文件>', desc: '输出为简单列表格式，便于后续处理' },
        { flag: '--excludefile <文件>', desc: '排除不应扫描的地址段，避免扫到网关或云服务地址' },
        { flag: '--interface <网卡>', desc: '指定发包网卡，多网卡机器必须显式指定' }
      ],
      examples: [
        { cmd: 'masscan 10.0.1.0/24 -p22,80,443,3306 --rate=1000 --wait 3 -oL /tmp/scan.txt', desc: '快速扫自有内网网段的常见端口并输出列表' },
        { cmd: 'masscan 10.0.1.0/24 -p0-65535 --rate=2000 --wait 5 --excludefile /tmp/exclude.txt', desc: '全端口粗筛，用排除文件跳过网关与保留地址' },
        { cmd: 'cat /tmp/scan.txt | grep -v "^#" | awk \'{print $4}\' | sort -u', desc: '从扫描结果里提取开放端口的 IP 列表' },
        { cmd: 'nmap -sT -sV -p 3306 -Pn 10.0.1.35', desc: '对 masscan 发现的端口用 nmap 精扫确认服务' }
      ],
      notes: [
        '**仅对自有资产使用**：masscan 的高速发包特征极其明显，扫描非授权目标属于违法行为，且极易被溯源定位',
        '**`--rate` 设置过高会打瘫网络或触发云平台 DDoS 防护**：可能导致 ECS 被限速、封禁甚至进入黑洞，内网也会压垮接入交换机',
        '云环境中扫外网地址可能触发安全中心的入侵检测告警，务必提前报备；华为云需要提交渗透测试申请',
        'masscan 不维护 TCP 状态，结果存在误报（尤其在有状态防火墙、负载均衡后面），必须用 nmap 复核',
        '它需要 root 或 CAP_NET_RAW 权限；容器内运行要显式加 `--cap-add=NET_RAW --cap-add=NET_ADMIN`',
        '扫描会产生大量并发连接记录，可能把目标主机的日志与连接表打满，扫描生产系统请安排在维护窗口'
      ],
      related: ['sec-nmap', 'sec-sg-minimal', 'sec-nikto', 'ln-ss'],
      docs: 'https://github.com/robertdavidgraham/masscan',
      tags: ['高速扫描', '暴露面', '合法授权', '大网段']
    },

    /* ---------- 25 / 38 ---------- */
    {
      id: 'sec-nikto',
      name: 'nikto',
      alias: ['Web 漏洞扫描', 'nikto -h', 'Web 服务器体检'],
      level: 2,
      syntax: 'nikto -h <URL或IP> [-p <端口>] [-ssl] [-Tuning <类型>] [-o <报告文件>]',
      summary: '对自有 Web 站点做配置类风险体检，发现危险文件与过期组件。',
      desc: 'nikto 是 Web 服务器配置扫描器，检查六千多个潜在问题：危险文件（`/backup.zip`、`/.git/config`、`/phpinfo.php`）、默认页面与示例程序、过期的服务端组件、缺失的安全响应头、目录列表开放等。它**不做漏洞利用**，属于"配置体检"性质。\n\n实际用法是把它当作上线自查清单的一部分：先扫一遍自有站点，把"存在备份文件""开启了目录浏览""Server 头暴露精确版本"这类项清掉。它的输出会有不少误报（尤其是对 SPA 应用，会把前端路由返回的 200 都当成"目录存在"），必须人工核对。\n\n它属于主动扫描器，请求量大且特征明显，会污染访问日志，**只应对自有站点使用**，并且最好在业务低峰期执行。',
      params: [
        { flag: '-h <目标>', desc: '指定主机或 URL' },
        { flag: '-p <端口>', desc: '指定端口，默认 80；HTTPS 常用 443 配合 `-ssl`' },
        { flag: '-ssl', desc: '强制使用 SSL/TLS 连接' },
        { flag: '-Tuning <类型>', desc: '只跑指定类型检查，如 `1`（有趣文件）、`2`（配置错误）、`9`（SQL 注入等，攻击性更强）' },
        { flag: '-o <文件> -Format <格式>', desc: '输出报告，支持 html、csv、txt 等格式' },
        { flag: '-maxtime <时长>', desc: '限制单目标扫描时长，避免长时间占用' },
        { flag: '-useragent <UA>', desc: '自定义 User-Agent，绕过针对扫描器的封禁' }
      ],
      examples: [
        { cmd: 'nikto -h https://www.example.com -ssl -o /tmp/nikto-report.html -Format html', desc: '扫描自有 HTTPS 站点并输出 HTML 报告' },
        { cmd: 'nikto -h 10.0.1.23 -p 8080 -Tuning 12', desc: '只检查有趣文件与配置错误，速度快、噪音小' },
        { cmd: 'nikto -h https://www.example.com -maxtime 600s -nointeractive', desc: '限制扫描时长并关闭交互提示，便于脚本调用' }
      ],
      notes: [
        '**仅对自有或已获书面授权的站点使用**，扫描第三方站点属于违法行为',
        '误报率偏高：现代前端框架对任意路径都返回 200，nikto 会误判为"文件存在"，结果必须逐条人工确认',
        '扫描会在 Web 访问日志里留下大量 404 与可疑请求，可能触发 WAF 封禁、也可能干扰日志分析，请安排在低峰期并知会值班同事',
        '它检查的是配置与已知文件，**不替代代码审计与依赖漏洞扫描**（后者用 `trivy`、`dependency-check` 更合适）',
        '带 `-Tuning 9` 会尝试 SQL 注入等攻击性检测，只允许在授权测试环境中使用',
        '扫描走 HTTPS 时若证书是自签的，可能需要用 `-ssl` 配合 `-nossl` 之类的参数组合，具体看版本'
      ],
      related: ['sec-nmap', 'sec-trivy', 'sec-waf-ddos', 'sec-sg-minimal'],
      docs: 'https://github.com/sullo/nikto',
      tags: ['Web扫描', '配置体检', '合法授权', '上线自查']
    },

    /* ---------- 26 / 38 ---------- */
    {
      id: 'sec-trivy',
      name: 'trivy image',
      alias: ['trivy', '镜像漏洞扫描', '容器镜像安全'],
      level: 2,
      syntax: 'trivy image [--severity <级别>] [--ignore-unfixed] [--exit-code 1] <镜像名>:<标签>',
      summary: '扫描容器镜像里的系统包与依赖漏洞，把不安全镜像挡在上线前。',
      desc: 'trivy 会解包镜像的文件系统，比对 OS 包（apt/yum/apk）与语言依赖（jar、node_modules、go.mod 等）的漏洞库，输出 CVE 列表、严重级别与修复版本。它是把安全左移到 CI 的最实用工具：构建完镜像先扫一遍，高危不过就不推仓库。\n\n`--exit-code 1` 是接入流水线的关键参数：发现符合条件的高危漏洞就以非 0 退出，让 CI 直接失败。`--ignore-unfixed` 过滤掉上游还没发布修复版本的漏洞，能大幅降低噪音——否则基础镜像里的陈年 CVE 会让每一次构建都红。\n\n扫描结果要落地成行动：能用更小的基础镜像（alpine、distroless）就换，能升级就升级，实在无法修复的通过 `.trivyignore` 记录并设置到期时间，而不是永久忽略。',
      params: [
        { flag: 'image <镜像>', desc: '扫描目标，可带标签或 digest' },
        { flag: '--severity HIGH,CRITICAL', desc: '只关注指定级别，减少噪音' },
        { flag: '--ignore-unfixed', desc: '忽略上游尚无修复版本的漏洞，CI 场景强烈建议加' },
        { flag: '--exit-code 1', desc: '发现漏洞时以退出码 1 结束，用于卡住流水线' },
        { flag: '--format json -o <文件>', desc: '输出 JSON 报告，便于接入安全平台做趋势统计' },
        { flag: '--scanners vuln,misconfig,secret', desc: '同时做漏洞、配置错误与密钥泄露扫描' },
        { flag: '--db-repository <地址>', desc: '指定漏洞库地址，内网离线环境用私有镜像仓库' }
      ],
      examples: [
        { cmd: 'trivy image --severity HIGH,CRITICAL --ignore-unfixed nginx:1.25', desc: '扫描基础镜像的高危漏洞，最常用的第一遍' },
        { cmd: 'trivy image --exit-code 1 --severity CRITICAL swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3', desc: '在 CI 里扫描自有业务镜像，有严重漏洞就中断构建' },
        { cmd: 'trivy image --format json -o trivy-report.json --scanners vuln,secret nginx:1.25', desc: '同时扫漏洞与硬编码密钥，输出 JSON 归档' },
        { cmd: 'trivy image --ignore-unfixed --severity HIGH,CRITICAL --format table alpine:3.19', desc: '给基础镜像选型做对比：alpine 通常漏洞更少' }
      ],
      notes: [
        '**首次运行需要联网下载漏洞库**（约几百 MB），内网环境要提前配置私有库或用 `--skip-db-update` 配合离线库文件',
        '不加 `--ignore-unfixed` 时输出会被"暂无修复版本"的漏洞淹没，团队很快就会对告警脱敏，这是最常见的落地失败原因',
        '扫描需要拉取镜像，私有仓库要先 `docker login` 或提供凭据；大镜像扫描耗时与层数成正比',
        '**基础镜像决定了漏洞下限**：`latest`、老版本 `centos:7` 往往有大量已知漏洞，优先换用 alpine 或定期更新的官方镜像',
        '镜像扫描只覆盖"已知 CVE"，业务代码的逻辑漏洞、配置错误需配合代码审计与 `kube-bench` 之类的基线检查',
        '把 `.trivyignore` 当成技术债台账管理，每条忽略都要写原因与复审日期，避免变成永久豁免'
      ],
      related: ['sec-kube-bench', 'dk-pull', 'dk-build', 'sec-clamav'],
      docs: 'https://trivy.dev/docs/latest/guide/target/container_image/',
      tags: ['镜像扫描', 'CVE', 'CI安全', '容器']
    },

    /* ---------- 27 / 38 ---------- */
    {
      id: 'sec-kube-bench',
      name: 'kube-bench',
      alias: ['kube-bench run', 'K8s 基线检查', 'CIS Kubernetes Benchmark'],
      level: 3,
      syntax: 'kube-bench [run] [--targets <目标>] [--benchmark <版本>] [--json] [--check <检查项>]',
      summary: '按 CIS 基线检查 Kubernetes 集群配置，逐项指出不合规的控制面设置。',
      desc: 'kube-bench 把 CIS Kubernetes Benchmark 的检查项自动化：kube-apiserver 是否禁用了匿名认证、etcd 是否开启客户端证书校验、kubelet 是否关闭了匿名访问、审计日志是否配置等。输出按 `[PASS]`、`[FAIL]`、`[WARN]` 分类，每条都给出修复建议。\n\n它既可以在节点上以二进制方式运行（需要有权限读节点上的 kubelet 配置与进程参数），也可以作为 Job 部署进集群以覆盖控制面节点。**它只做检查不做修改**，修复要人工评估——很多加固项（如关闭匿名认证、启用审计）会影响现有组件的兼容性，必须在测试环境验证。\n\n结论里要区分两类：`FAIL` 是明确不合规需要处理；`WARN` 通常是"需要人工确认"的项，比如某些参数在托管集群里由云厂商控制，客户无法修改。',
      params: [
        { flag: 'run', desc: '执行检查（默认子命令）' },
        { flag: '--targets <目标>', desc: '只检查某类目标，如 `master`、`node`、`controlplane`、`etcd`' },
        { flag: '--benchmark <版本>', desc: '指定基线版本，如 `cis-1.23`；不指定则自动探测' },
        { flag: '--check <编号>', desc: '只跑指定检查项，如 `--check 1.2.1`' },
        { flag: '--json', desc: '输出 JSON，便于接入合规平台' },
        { flag: '--nodes', desc: '在集群内 Job 模式下检查所有节点' }
      ],
      examples: [
        { cmd: 'kube-bench run --targets master', desc: '在控制面节点上检查 master 相关基线项' },
        { cmd: 'kube-bench run --targets node --benchmark cis-1.23', desc: '按 1.23 版基线检查工作节点配置' },
        { cmd: 'kube-bench run --check 1.2.1', desc: '只检查"是否禁用匿名认证"这一项' },
        { cmd: 'kube-bench run --json > /tmp/kube-bench.json', desc: '输出 JSON 报告，用于归档与趋势对比' },
        { cmd: 'kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml', desc: '以 Job 形式在集群内运行，检查节点配置' }
      ],
      notes: [
        '**托管集群（如华为云 CCE）中控制面由云厂商托管**，不少检查项无法由客户修改，结果里大量 WARN 属于正常，重点是节点侧与 RBAC 相关项',
        '在节点上直接跑需要 root 且能读到 kubelet 配置文件与进程启动参数，否则会大量报 `[WARN] Unable to determine`',
        '**kube-bench 只检查不修复**，加固参数改动（如启用审计、关闭匿名认证）可能影响现有组件，务必先在测试集群验证',
        '基线版本要与集群实际版本匹配，用错 benchmark 会出现大量无意义的 FAIL',
        '它与 `trivy image`、`lynis` 互补：分别覆盖集群配置、镜像内容与主机系统三层',
        '不要直接照搬互联网上的加固脚本批量改参数，CIS 基线是"应该达到的目标"，具体项要结合业务可用性判断'
      ],
      related: ['sec-trivy', 'sec-lynis', 'k8s-cluster-info', 'k8s-auth-can-i'],
      docs: 'https://github.com/aquasecurity/kube-bench',
      tags: ['Kubernetes', '基线检查', 'CIS', '合规']
    },

    /* ---------- 28 / 38 ---------- */
    {
      id: 'sec-clamav',
      name: 'clamscan / freshclam',
      alias: ['ClamAV', 'Linux 病毒扫描', 'freshclam 更新病毒库'],
      level: 2,
      syntax: 'freshclam | clamscan [-r] [-i] [--remove] <路径> | clamdscan <路径>',
      summary: '开源杀毒引擎，用于扫描上传目录与共享存储里的恶意文件。',
      desc: 'Linux 服务器本身中招"病毒"的概率低于 Windows，但作为**文件中转站**风险很高：用户上传目录、Samba/NFS 共享、邮件附件网关、对象存储的本地缓存，都可能夹带 Windows 恶意程序，最终感染下游的办公终端。ClamAV 就是在这类位置做拦截的。\n\n`freshclam` 负责更新病毒库（默认库文件在 `/var/lib/clamav`），必须在扫描前先跑一次，否则库过期等于没扫。`clamscan` 是单次扫描命令，每次都要重新加载病毒库，适合脚本与定时任务；`clamdscan` 连接常驻的 `clamd` 服务，速度快得多，适合大目录与频繁扫描。\n\n输出里的 `FOUND` 才是命中，`OK` 是干净。发现命中文件时先 `--move` 隔离而不是直接 `--remove`，保留样本便于分析。',
      params: [
        { flag: '-r', desc: '递归扫描子目录，扫描目录时必加' },
        { flag: '-i', desc: '只输出被感染的文件，日志干净' },
        { flag: '--move=<目录>', desc: '把感染文件移动到隔离目录，比直接删除更稳妥' },
        { flag: '--remove', desc: '直接删除感染文件，**有误删风险，谨慎使用**' },
        { flag: '--exclude-dir=<目录>', desc: '排除目录（如 `/proc`、`/sys`），避免扫描卡死' },
        { flag: '--infected', desc: '等价于 `-i`，只报告感染项' },
        { flag: 'freshclam', desc: '更新病毒特征库，通常配成定时任务每天跑几次' }
      ],
      examples: [
        { cmd: 'freshclam', desc: '先更新病毒库，扫描前必做' },
        { cmd: 'clamscan -r -i /data/upload', desc: '递归扫描上传目录，只输出命中项' },
        { cmd: 'clamscan -r -i --move=/data/quarantine /data/share', desc: '扫描共享目录并把感染文件移到隔离区' },
        { cmd: 'clamscan --exclude-dir="^/proc" --exclude-dir="^/sys" -r -i /home', desc: '扫描用户目录并排除伪文件系统' },
        { cmd: 'systemctl enable --now clamav-freshclam', desc: '启用病毒库自动更新服务' },
        { cmd: 'clamdscan -i /data/upload', desc: '使用常驻服务扫描，大目录下速度明显更快' }
      ],
      notes: [
        '**病毒库不更新等于没装**：新出现的恶意样本不在旧库里，务必把 `freshclam` 配成定时任务或启用 `clamav-freshclam` 服务',
        '**`--remove` 有误删风险**，尤其是业务目录里的正常文件被误判时；生产上优先用 `--move` 隔离，人工确认后再处理',
        '`freshclam` 需要联网访问官方库，内网环境要么搭私有镜像源，要么用离线库文件手工更新',
        '`clamscan` 每次都要加载几十 MB 到上百 MB 的病毒库，扫描大目录非常慢；频繁扫描请改用 `clamd`+`clamdscan`',
        '扫描前记得排除 `/proc`、`/sys`、`/dev`，否则会报大量读取错误甚至卡住',
        'ClamAV 主要针对已知特征，**不能替代入侵排查**（`rpm -Va`、后门排查组合）与镜像漏洞扫描（`trivy`）',
        'CentOS 需要 EPEL 源才能装 `clamav`；SELinux 开启时 `clamd` 可能因为端口或文件标签被拦，参考 `ausearch -m avc` 处理'
      ],
      related: ['sec-backdoor-check', 'sec-rpm-va', 'sec-trivy', 'sec-lynis'],
      docs: 'https://docs.clamav.net/manual/Usage/Scanning.html',
      tags: ['杀毒', '文件扫描', '上传目录', '病毒库']
    },

    /* ---------- 29 / 38 ---------- */
    {
      id: 'sec-chroot',
      name: 'chroot 与最小权限运行',
      kind: 'recipe',
      alias: ['chroot', '最小权限', '服务降权运行'],
      level: 3,
      syntax: 'chroot <新根目录> <命令> | useradd -r -s /sbin/nologin <服务用户> | setpriv --reuid=<UID> --regid=<GID> --clear-groups <命令>',
      summary: '用 chroot 隔离文件系统视图，用独立低权限账户让服务"只能干该干的事"。',
      desc: '最小权限原则在 Linux 上落地有三个层次：**账户降权**（服务用专用系统账户而不是 root 运行）、**文件系统隔离**（chroot 改变进程看到的根目录）、**能力收敛**（用 capability 只保留必要特权）。\n\n`chroot` 常被两类场景使用：救援时 `chroot /mnt/sysroot` 进入损坏系统的环境里修 GRUB 或重装内核；以及让 FTP、DNS 这类服务把用户限制在指定目录内。注意 **chroot 不是安全边界**：root 身份的进程可以逃逸，它只适合做"防误操作"与"限制非特权用户"。真要隔离请用容器（namespace + cgroup）或虚拟机。\n\n账户降权的检查方法很直接：`ps -eo user,pid,cmd | grep <服务名>`，看到跑在 root 下的 Web 服务就是明显的加固项。改的时候注意端口绑定问题——1024 以下端口需要特权，通常做法是先用 root 绑定端口再由服务自身降权，或用 `setcap` 给二进制文件授权。',
      params: [
        { flag: 'chroot <目录> <命令>', desc: '把指定目录当作根目录执行命令，需要该目录下有完整的库与可执行文件' },
        { flag: 'useradd -r -s /sbin/nologin', desc: '创建不可登录的系统账户，用于运行服务' },
        { flag: 'setpriv --reuid --regid --clear-groups', desc: '在不重启的情况下切换用户与组执行命令' },
        { flag: 'setcap cap_net_bind_service=+ep <文件>', desc: '允许非 root 进程绑定 1024 以下端口' },
        { flag: 'NoNewPrivileges=yes', desc: 'systemd 单元里的最小权限选项，禁止进程再提权' },
        { flag: 'ProtectSystem=strict / PrivateTmp=yes', desc: 'systemd 沙箱选项，限制服务可写的文件系统范围' }
      ],
      examples: [
        { cmd: 'chroot /mnt/sysroot /bin/bash', desc: '救援场景：进入已挂载的系统根目录修复配置或重装 GRUB' },
        { cmd: 'useradd -r -s /sbin/nologin -d /var/lib/myapp myapp', desc: '为服务创建专用的不可登录系统账户' },
        { cmd: 'ps -eo user,pid,cmd | grep nginx', desc: '检查服务实际以哪个账户运行，确认是否已降权' },
        { cmd: 'setcap cap_net_bind_service=+ep /opt/myapp/bin/server', desc: '让非 root 进程可以监听 80 端口，避免整个服务跑 root' },
        { cmd: 'systemctl edit myapp', desc: '通过 drop-in 为服务添加 NoNewPrivileges、ProtectSystem 等沙箱选项' }
      ],
      notes: [
        '**chroot 不是安全隔离手段**：拥有 root 权限的进程可以轻易逃逸，真正的隔离请用容器或虚拟机；它只能防误操作与限制非特权用户',
        '`chroot` 后命令报 `No such file or directory` 多半是新根目录下缺少动态库，需要把 `/lib64/ld-linux-*.so` 与依赖库一起拷进去',
        '救援模式下的操作顺序是：挂载根分区到 `/mnt/sysroot` → 挂载 `/proc`、`/sys`、`/dev` → 再 `chroot`，否则很多命令不可用',
        '**降权后要重新审视文件权限**：服务账户对日志目录、缓存目录、socket 文件必须有写权限，否则会以"启动成功但功能异常"的形式表现',
        '`setcap` 的能力会随文件更新丢失，升级二进制后需要重新设置；同时注意带 cap 的文件被普通用户利用的风险',
        'systemd 的沙箱选项（`ProtectSystem`、`PrivateTmp`、`ReadWritePaths`）比 chroot 更现代也更安全，新服务优先用它'
      ],
      related: ['lu-useradd', 'lu-chmod', 'dk-run', 'lu-systemd-unit'],
      docs: 'https://man7.org/linux/man-pages/man1/chroot.1.html',
      tags: ['最小权限', '隔离', '降权', '加固']
    },

    /* ================= E. 云上安全 ================= */

    /* ---------- 30 / 38 ---------- */
    {
      id: 'sec-vault-kv',
      name: 'vault kv put / kv get',
      alias: ['vault kv', 'HashiCorp Vault', '密钥管理'],
      level: 3,
      syntax: 'vault kv put <路径> <键>=<值> | vault kv get [-format=json] <路径> | vault kv list <路径>',
      summary: '把数据库密码、AK/SK 等敏感信息集中托管，脚本运行时按需取用。',
      desc: '把密码写在脚本、配置文件、CI 变量里，是配置泄露事故的头号原因。Vault 的思路是"集中存放 + 按需签发 + 全程审计"：应用启动时用受限身份向 Vault 换取凭据，Vault 记录谁在什么时候取过什么。\n\n`kv put` 负责写入（KV v2 引擎默认会保留版本历史，可用 `kv get -version=N` 回看），`kv get` 负责读取。比"取密码"更有价值的是**动态凭据**（database secrets engine）：Vault 可以为每次请求临时创建数据库账号，用完自动回收，彻底消除静态密码。\n\n运维中另一常见用法是配合 CI：流水线用受限 Token 从 Vault 拉取部署所需的密钥，而不是把密钥存在 CI 平台的变量里。',
      params: [
        { flag: 'kv put <路径> k=v', desc: '写入或更新一个密钥条目，KV v2 会自动生成新版本' },
        { flag: 'kv get <路径>', desc: '读取并美化显示，含元数据（创建时间、版本号）' },
        { flag: 'kv get -format=json <路径>', desc: 'JSON 输出，便于用 `jq` 取值喂给脚本' },
        { flag: 'kv get -field=<键> <路径>', desc: '只取某一个字段的值，脚本里最常用' },
        { flag: 'kv patch <路径> k=v', desc: '只更新指定字段，保留其余字段不变' },
        { flag: 'kv list <路径>', desc: '列出某路径下的所有条目名（不含值）' },
        { flag: 'kv metadata get <路径>', desc: '查看版本历史与自定义元数据' }
      ],
      examples: [
        { cmd: 'vault kv put secret/myapp/db username=appuser password=<数据库密码>', desc: '写入数据库连接信息（把尖括号内容换成真实值）' },
        { cmd: 'vault kv get -field=password secret/myapp/db', desc: '只取密码字段，直接喂给启动脚本' },
        { cmd: 'vault kv get -format=json secret/myapp/db | jq -r ".data.data.password"', desc: 'JSON 解析取值，KV v2 的字段在 data.data 下' },
        { cmd: 'vault kv list secret/myapp', desc: '列出该应用下托管了哪些密钥条目' },
        { cmd: 'vault kv put -cas=3 secret/myapp/db password=<新密码>', desc: '带版本校验的写入，防止并发覆盖他人改动' }
      ],
      notes: [
        '**KV v2 的 JSON 路径是 `.data.data.<字段>`**（外层 data 是元信息，内层才是内容），很多脚本取值失败都是这里写错',
        'Token 与 Unseal Key 的保管比密钥本身更关键：Vault 重启后需要 unseal，自动化场景要用云 KMS 自动解封，但要把解封凭据的权限压到最小',
        '**Vault 里存的凭据仍要定期轮换**，它解决的是"集中管理与审计"，不是"永不变更"',
        'CI 中使用的 Token 要设 TTL 与策略限制（只读指定路径），不要使用 root token',
        '审计日志（`vault audit enable file file_path=/var/log/vault_audit.log`）要在生产环境默认开启，否则无法回答"谁取过这个密码"',
        '自建 Vault 涉及高可用与灾备（Raft 存储快照），小团队评估成本后也可以先用云厂商的凭据管理服务（如华为云 DEW）'
      ],
      related: ['sec-aksk-leak', 'sec-huawei-iam', 'sec-gpg', 'sec-ssh-keygen'],
      docs: 'https://developer.hashicorp.com/vault/docs/commands/kv/put',
      tags: ['密钥管理', '凭据', '审计', 'Vault']
    },

    /* ---------- 31 / 38 ---------- */
    {
      id: 'sec-huawei-iam',
      name: '华为云 IAM 子用户与最小权限',
      kind: 'recipe',
      alias: ['IAM 子用户', '委托授权', '最小权限原则'],
      level: 2,
      syntax: 'hcloud configure set --profile=<子用户> --access-key=<AK> --secret-key=<SK> --region=<区域>  # 配合 IAM 策略使用',
      summary: '给人和程序分配子用户身份，按需授权而不是共用账号 AK/SK。',
      desc: '云上最常见的三种权限错误：**所有人共用主账号 AK/SK**（无法审计、泄露即全损）、**给子用户 AdministratorAccess**（等于没做权限控制）、**长期密钥永不轮换**。\n\n正确做法是：主账号只用于创建子用户与设置策略，日常运维与程序调用一律使用子用户；权限按"最小必要"授予，优先使用系统策略（如 ECS FullAccess）而不是自定义大而全的策略；人员权限尽量走"用户组 + 策略"而不是逐个授权。\n\n程序调用建议用**委托（Agency）与临时凭证**代替永久 AK/SK：华为云支持通过 IAM 委托让 ECS、CCE 上的应用免密钥访问其他云服务（类似其他云的实例角色），能从根本上消除"密钥写进代码"的问题。\n\n定期审计两件事：`最近一次使用时间`（长期不用的子用户应停用）与 `权限范围`（是否有超出职责的授权）。',
      params: [
        { flag: '用户组', desc: '把相同职责的人放进同一用户组统一授权，人员变动只改组成员' },
        { flag: '系统策略', desc: '云厂商预置的权限集合，如 ECS FullAccess、OBS ReadOnlyAccess' },
        { flag: '自定义策略', desc: '按具体资源与操作精细授权，可实现"只能操作某个桶/某台机器"' },
        { flag: '委托 / 信任委托', desc: '让云服务或跨账号以临时凭证访问资源，避免下发永久密钥' },
        { flag: 'MFA', desc: '为有敏感权限的子用户强制开启多因素认证' },
        { flag: '访问密钥轮换', desc: '定期更换 AK/SK 并停用旧密钥，降低泄露后的影响窗口' }
      ],
      examples: [
        { cmd: 'hcloud configure set --profile=ops-ro --access-key=<子用户AK> --secret-key=<子用户SK> --region=cn-north-4', desc: '为只读运维子用户配置独立的 CLI 凭据文件' },
        { cmd: 'hcloud IAM ListUsers --cli-region=cn-north-4', desc: '列出当前账号下的子用户，做权限盘点' },
        { cmd: 'hcloud IAM ListPermanentAccessKeys --user_id=<子用户ID>', desc: '列出某子用户的永久访问密钥，核查是否有长期未轮换的 AK' },
        { cmd: 'hcloud IAM ShowUser --user_id=<子用户ID>', desc: '查看子用户详情，包括最近登录时间与状态' },
        { cmd: 'hcloud configure list', desc: '查看本机已配置的凭据档案，确认当前用的是哪个身份' }
      ],
      notes: [
        '**主账号 AK/SK 绝不能下发到任何服务器或个人**：主账号权限不可限制，一旦泄露等于整个云账号失守',
        '**不要给子用户 AdministratorAccess 图省事**，这正是等保与安全审计最常开出的整改项',
        '子用户密码与 AK 属于不同凭据：控制台登录用密码 + MFA，程序调用用 AK/SK，两者要分别管理',
        '长期 AK/SK 存在不可避免的泄露风险，能改成委托临时凭证的场景优先改造',
        'CLI 凭据文件默认在 `~/.hcloud/config.json`，是明文存储，服务器上要设 600 权限，不要留在共享账号或镜像里',
        '定期检查"最近一次使用时间"，超过 90 天未使用的子用户与访问密钥应停用或删除，这是最容易被忽略的收敛项'
      ],
      related: ['sec-aksk-leak', 'sec-vault-kv', 'sec-sg-minimal', 'sec-obs-bucket-acl'],
      docs: 'https://support.huaweicloud.com/iam/index.html',
      tags: ['IAM', '最小权限', '子用户', '华为云']
    },

    /* ---------- 32 / 38 ---------- */
    {
      id: 'sec-aksk-leak',
      name: 'AK/SK 泄露应急响应（组合）',
      kind: 'recipe',
      alias: ['密钥泄露', 'AK SK 泄露处置', '云账号应急'],
      level: 4,
      syntax: '停用密钥 → 排查调用记录 → 清除泄露源 → 轮换全部凭据 → 复核资源',
      summary: '云访问密钥泄露后的标准处置流程，目标是把损失窗口压到最短。',
      desc: 'AK/SK 泄露是最危险的云安全事件：攻击者不需要任何漏洞就能创建资源（挖矿、跑流量）、导出数据、删除备份。**处置速度决定损失规模**，密钥在 Git 上公开后几分钟内就会被打扫工具抓到并利用。\n\n**完整应急链路**：\n\n**① 立即止血（分钟级）**：登录 IAM 控制台，把泄露的访问密钥**停用或直接删除**（停用更快且可回溯），不要先去做别的排查。若泄露的是主账号密钥，同时立刻修改账号密码并开启 MFA。\n\n**② 排查影响范围**：查看操作审计（华为云 CTS 云审计服务）中该密钥在泄露时间点之后的全部调用记录，重点看是否创建了 ECS（挖矿）、是否修改了安全组、是否创建了新的 IAM 用户或密钥（持久化）、是否对 OBS 执行了批量下载或删除。命令侧可用 `hcloud CTS ListTraces --trace_type=system` 拉取审计事件。\n\n**③ 处置已发生的变更**：删除攻击者创建的 ECS/ECS 密钥对、回滚被改的安全组与桶策略、删除新增的子用户与密钥、核对账单是否有异常计费。\n\n**④ 清除泄露源**：从 Git 仓库移除密钥（注意**只删当前版本无效，必须清理历史提交**，否则克隆历史仍能拿到）；删除代码、镜像、CI 变量、聊天记录、工单附件中的密钥；若已推到公开仓库，视为永久泄露。\n\n**⑤ 全量轮换**：新 AK/SK 重新生成，同时轮换该主机上所有可能被读取的凭据：数据库密码、Redis 密码、SSH 私钥、第三方 API Key。凭据之间存在横向移动风险，只换 AK 是不够的。\n\n**⑥ 复核与加固**：确认审计日志中没有残留的异常调用；给该身份配置更小权限；接入密钥扫描（CI 阶段扫描提交内容）；把长期密钥改造为委托临时凭证；开启云安全中心的密钥泄露检测与告警。\n\n整个流程要留痕：每一步的时间点、操作人、证据截图都记录下来，用于事后复盘与合规报告。',
      params: [
        { flag: '停用/删除访问密钥', desc: 'IAM 控制台或 API 操作，止血第一步，优先"停用"以便回溯' },
        { flag: 'hcloud CTS ListTraces', desc: '拉取云审计事件，排查密钥被用于哪些操作' },
        { flag: 'hcloud IAM ListPermanentAccessKeys', desc: '排查账号下所有永久密钥，确认是否被新建' },
        { flag: 'git filter-repo --path <文件> --invert-paths', desc: '从 Git 历史中彻底移除含密钥的文件' },
        { flag: 'git log -p --all -S "<密钥前缀>"', desc: '在全部历史提交中搜索密钥痕迹，确认清理范围' },
        { flag: 'hcloud ECS ListServersDetails', desc: '排查是否有攻击者创建的 ECS 实例（挖矿常用）' }
      ],
      examples: [
        { cmd: 'hcloud CTS ListTraces --trace_type=system --limit=50 --cli-region=cn-north-4', desc: '拉取最近的云审计事件，排查密钥被用来做了什么' },
        { cmd: 'hcloud IAM ListPermanentAccessKeys --user_id=<子用户ID>', desc: '检查是否被攻击者新建了持久化密钥' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4', desc: '列出所有 ECS，找出攻击者创建的挖矿实例' },
        { cmd: 'cd /data/app && git log -p --all -S "AKIA" | head -50', desc: '在 Git 全部历史里搜索密钥痕迹，确认泄露范围' },
        { cmd: 'cd /data/app && git filter-repo --path config/credentials.yml --invert-paths --force', desc: '从 Git 历史中彻底移除含密钥的文件（需先安装 git-filter-repo）' }
      ],
      notes: [
        '**止血与排查的顺序不能颠倒**：先停用密钥再分析，密钥每多活一分钟，攻击者就可能多创建一批资源',
        '**只删除当前版本提交中的密钥是无效的**：Git 历史仍保留，必须用 `git filter-repo` 或 BFG 清理并强推，同时通知所有协作者重新克隆',
        '**密钥一旦进入公开仓库就要视为已泄露**，即使几秒后删除也一样，被抓取工具命中的概率极高',
        '排查范围要覆盖所有云服务：不只是 ECS，还有 OBS（数据外泄）、VPC（安全组被改）、IAM（持久化）、DNS（域名被劫持）、账单（异常计费）',
        '**不要只换 AK/SK**：同一台机器上的数据库密码、SSH 私钥、API Token 都可能被读取，必须一并轮换',
        '处理完要做复盘：为什么密钥会在那里？是硬编码、CI 变量还是配置仓库？没有根因整改，同类事故必然复发',
        '开启云审计（CTS）是这类事件可排查的前提，未开启的账号只能靠账单和资源列表盲猜，务必默认开启并集中存储日志'
      ],
      related: ['sec-huawei-iam', 'sec-vault-kv', 'sec-obs-bucket-acl', 'sec-backdoor-check'],
      docs: 'https://support.huaweicloud.com/iam/index.html',
      tags: ['应急响应', 'AK/SK', '云安全', '组合命令']
    },

    /* ---------- 33 / 38 ---------- */
    {
      id: 'sec-sg-minimal',
      name: '安全组最小开放自查',
      kind: 'recipe',
      alias: ['安全组自查', '0.0.0.0/0 风险', '端口暴露面收敛'],
      level: 2,
      syntax: 'hcloud VPC ListSecurityGroups | hcloud VPC ShowSecurityGroup --security_group_id=<ID>',
      summary: '自查安全组里对全网开放的高危端口，把暴露面收敛到必要来源。',
      desc: '安全组是云主机的第一道门，也是最容易长期失守的地方：为了"先跑通"，把 22、3306、6379、9200 全开成 `0.0.0.0/0`，之后再也无人回收。这类配置在攻防演练与自动化扫描中几乎必然被发现。\n\n**自查的核心是三张清单**：\n① **对全网开放的端口清单**——重点看 SSH（22）、RDP（3389）、数据库（3306/5432/1433）、缓存（6379/11211）、搜索（9200/5601）、Docker API（2375/2376）、K8s（6443/10250）以及 Elasticsearch、ZooKeeper 等；\n② **出方向规则**——很多团队只关注入方向，实际上挖矿木马需要出方向访问矿池，出方向全开会让主机被控后立刻外联，建议只放行必要的目标；\n③ **未绑定的安全组与过期规则**——测试期临时开放的规则往往遗忘。\n\n收敛的原则是：能走跳板机的就不对全网开 SSH；数据库只允许应用层安全组作为源（用**安全组 ID 作为源**而不是 IP 段，这样应用扩容时不用改规则）；对外服务只开 80/443 并且前置 WAF 或负载均衡。\n\n命令侧可以用 CLI 批量导出规则做审计，把结果纳入日常巡检脚本。',
      params: [
        { flag: '0.0.0.0/0', desc: '表示对全网开放，是自查中最需要清理的源地址' },
        { flag: '安全组作为源', desc: '把源地址写成另一个安全组 ID，实现"只允许应用层访问数据库"的动态授权' },
        { flag: '入方向规则', desc: '控制外部访问云主机，风险最高，逐条核查' },
        { flag: '出方向规则', desc: '控制云主机对外访问，影响被控后的横向与外联能力，别只查入方向' },
        { flag: '优先级', desc: '同一安全组内规则的生效顺序，写规则时注意不要被高优先级规则覆盖' },
        { flag: '网络 ACL', desc: '子网级的无状态访问控制，与安全组配合形成两层防护' }
      ],
      examples: [
        { cmd: 'hcloud VPC ListSecurityGroups --cli-region=cn-north-4', desc: '列出所有安全组，先看清有哪些' },
        { cmd: 'hcloud VPC ShowSecurityGroup --security_group_id=<安全组ID>', desc: '查看指定安全组的详细规则，逐条核对源地址与端口' },
        { cmd: 'hcloud VPC ListSecurityGroupRules --security_group_id=<安全组ID>', desc: '列出安全组规则，用于批量审计是否有 0.0.0.0/0 的高危端口' },
        { cmd: 'ss -tulnp', desc: '主机侧对照：确认实际监听端口与安全组放行是否一致，避免开了没用的口子' },
        { cmd: 'nmap -sT -Pn -p 22,3306,6379,9200 <ECS弹性公网IP>', desc: '从外部视角验证高危端口是否真的对公网可达（仅限自有资产）' }
      ],
      notes: [
        '**`0.0.0.0/0` 开放 22/3389/3306/6379/9200 属于高危配置**，会在几分钟内招来爆破与未授权访问尝试，是安全审计的必查项',
        '**安全组是有状态的**：放行了入方向请求，返回流量自动允许，不需要额外配出方向规则；别按传统防火墙思路重复配置',
        '修改安全组会即时生效，**误删规则可能立刻切断业务或把自己关在门外**，改之前先确认有 VNC/控制台登录方式可用',
        '数据库的安全组源地址优先使用"应用层安全组 ID"而不是固定 IP 段，这样应用扩缩容无需改规则',
        '出方向全开是挖矿木马能外联的前提，生产环境建议收敛出方向，至少限制到必要端口与目标',
        '安全组只保护云主机，**负载均衡、WAF、NAT 网关、容器集群都有各自的访问控制**，别以为配了安全组就万事大吉',
        '定期导出一份规则快照做对比，能快速发现"什么时候多了个口子"'
      ],
      related: ['sec-nmap', 'sec-huawei-iam', 'sec-waf-ddos', 'ln-firewall-cmd'],
      docs: 'https://support.huaweicloud.com/vpc/index.html',
      tags: ['安全组', '暴露面', '最小开放', '华为云']
    },

    /* ---------- 34 / 38 ---------- */
    {
      id: 'sec-obs-bucket-acl',
      name: '对象存储桶权限自查',
      kind: 'recipe',
      alias: ['OBS 桶权限', '公开桶风险', '存储桶 ACL'],
      level: 3,
      syntax: 'obsutil ls -acl obs://<桶名> | obsutil chattri obs://<桶名> -acl=private',
      summary: '检查对象存储桶是否对公网可读或可写，避免数据泄露与被恶意上传。',
      desc: '对象存储的权限事故几乎每年都在发生：备份文件、数据库导出、用户资料被匿名下载，或者被匿名上传垃圾内容产生高额流量费。根因通常只有一个——**桶策略或 ACL 被设成了公开**，而设置者以为"只是临时测试"。\n\n自查要覆盖三个层面：\n① **桶 ACL**（`private` / `public-read` / `public-read-write`），`public-read-write` 是最危险的，任何人都能上传与删除；\n② **桶策略**（Bucket Policy），即使是私有 ACL，一条 `Principal: *` 的策略同样会把桶开放；\n③ **对象级 ACL**，单个对象也可能被单独设为公开。\n\n除了"是否公开"，还要检查：是否开启了**服务端加密**、是否开启了**版本控制**（误删可恢复）、是否配置了**生命周期**（旧数据自动转归档/删除）、是否开启了**访问日志**。\n\n公网可读的必要场景（如静态网站托管）应通过 CDN + 回源鉴权实现，而不是直接把桶设为公开；确实需要公开的，也要确保桶内没有混放敏感文件——这是最常见的翻车方式。',
      params: [
        { flag: 'private', desc: '仅桶拥有者与授权用户可访问，默认与推荐值' },
        { flag: 'public-read', desc: '任何人可读，静态资源托管场景才会用到，风险中等' },
        { flag: 'public-read-write', desc: '任何人可读可写，**极高风险，生产环境禁止**' },
        { flag: '桶策略（Bucket Policy）', desc: '基于 JSON 的细粒度授权，重点检查是否有 `Principal: *`' },
        { flag: '服务端加密', desc: '开启后对象落盘即加密，满足等保对数据存储加密的要求' },
        { flag: '版本控制', desc: '开启后可恢复被覆盖或误删的对象，也是勒索软件攻击的防线' },
        { flag: '访问日志', desc: '记录谁访问了哪个对象，安全事件溯源依赖它' }
      ],
      examples: [
        { cmd: 'obsutil ls -acl obs://prod-backup', desc: '查看桶的访问权限，确认是否为 private' },
        { cmd: 'obsutil chattri obs://prod-backup -acl=private', desc: '把权限收敛为私有，发现公开桶后立即执行' },
        { cmd: 'obsutil ls obs://prod-backup', desc: '列出桶内对象，确认是否混放了敏感数据' },
        { cmd: 'curl -s -o /dev/null -w "%{http_code}\\n" https://prod-backup.obs.cn-north-4.myhuaweicloud.com/', desc: '匿名访问测试：返回 200 说明桶可公开列举，403 才是正常' },
        { cmd: 'obsutil stat obs://prod-backup/db/dump.sql', desc: '查看单个对象的元数据与权限，排查对象级 ACL 泄露' }
      ],
      notes: [
        '**发现 `public-read-write` 必须立即改为 `private`**，任何人都能上传与删除，等于把数据交给公网',
        '**ACL 是 private 不代表安全**：桶策略里一条 `Principal: *` 的 Allow 同样会开放访问，必须两者都查',
        '把静态网站与业务数据放在同一个桶里，是公开桶事故的主要成因；公开资源应使用独立桶并只放可公开内容',
        '**备份桶尤其要检查**：数据库导出、日志归档里往往包含用户信息与凭据，一旦公开就是重大数据泄露事件',
        '开启版本控制后，"删除"对象只是加了一个删除标记，数据仍在，这既是有利（可恢复）也是风险（以为删了其实没删），合规销毁要用生命周期规则',
        '**防盗链与流量费**：公开桶被恶意刷流量会产生高额费用，配 CDN + Referer 防盗链 + 流量告警可以缓解',
        '匿名访问测试用 `curl` 直接请求桶域名最直观，别只看控制台显示——策略叠加后的实际效果才是真相'
      ],
      related: ['sec-aksk-leak', 'sec-huawei-iam', 'sec-vault-kv', 'lb-sha256sum'],
      docs: 'https://support.huaweicloud.com/obs/index.html',
      tags: ['对象存储', '数据泄露', '桶策略', '华为云']
    },

    /* ---------- 35 / 38 ---------- */
    {
      id: 'sec-waf-ddos',
      name: 'WAF 与 DDoS 基础配置',
      kind: 'recipe',
      alias: ['WAF 防护', 'Anti-DDoS', '流量清洗'],
      level: 3,
      syntax: '域名接入 WAF → 配置防护策略 → 源站 IP 隐藏 → 开启 Anti-DDoS 流量清洗与告警',
      summary: '把 Web 攻击与流量攻击挡在源站之前，是公网业务的必备外层防护。',
      desc: 'WAF 与 DDoS 防护解决的是两类不同问题：**WAF 防应用层攻击**（SQL 注入、XSS、恶意爬虫、CC 攻击），工作在七层，基于规则与语义分析拦截请求；**Anti-DDoS 防流量层攻击**（SYN Flood、UDP 反射放大），工作在三/四层，通过流量清洗中心把攻击流量过滤掉。\n\n**接入要点（顺序很重要）**：\n① 先把域名接入 WAF，WAF 回源到源站；\n② **隐藏源站 IP**——这一步最容易被忽略：如果源站公网 IP 仍可直连，攻击者会绕过 WAF 直接打源站，WAF 就白配了。做法是源站只允许 WAF 的回源 IP 段访问（安全组/白名单），并更换已被暴露的 IP；\n③ 在源站前面挂 Anti-DDoS（或使用高防 IP），并配置清洗阈值与告警；\n④ WAF 侧配置防护策略：开启基础规则集、按业务设置 CC 防护阈值、配置 IP 黑白名单与地理封禁；\n⑤ 配置告警：带宽突增、QPS 异常、拦截量激增都要通知到人。\n\n调优的重点是**平衡误拦与漏拦**：WAF 规则过严会拦掉正常业务请求（尤其是带富文本、文件上传、JSON 接口的场景），建议先用"仅记录"模式观察一段时间，确认无正常流量被误判后再切到拦截模式。',
      params: [
        { flag: '域名接入', desc: '把域名 CNAME 到 WAF 提供的地址，流量经 WAF 回源' },
        { flag: '源站白名单', desc: '源站安全组只允许 WAF 回源 IP 段访问，防止绕过 WAF 直连' },
        { flag: 'CC 防护', desc: '对单一来源的高频请求做限速与挑战，缓解应用层刷接口' },
        { flag: '防护模式', desc: '建议先"仅记录"观察误报，确认后再切"拦截"' },
        { flag: '清洗阈值', desc: 'Anti-DDoS 触发流量清洗的带宽阈值，过低会误清洗影响正常访问' },
        { flag: '黑洞策略', desc: '攻击超过防护能力时把 IP 拉入黑洞，业务会完全不可用，需与告警联动' },
        { flag: '告警通知', desc: '带宽、QPS、拦截量异常都要配告警，否则攻击发生时无人知晓' }
      ],
      examples: [
        { cmd: 'curl -I --resolve www.example.com:443:<WAF回源地址> https://www.example.com', desc: '验证通过 WAF 访问业务是否正常，回源链路是否通' },
        { cmd: 'nslookup www.example.com', desc: '确认域名已 CNAME 到 WAF 地址，而不是直接解析到源站 IP' },
        { cmd: 'hcloud WAF ListHost --cli-region=cn-north-4', desc: '列出已接入 WAF 的域名，核对是否有遗漏' },
        { cmd: 'hcloud Anti-DDoS ShowAlertConfig --cli-region=cn-north-4', desc: '查看 DDoS 告警配置，确认异常流量能通知到人' },
        { cmd: 'nmap -sT -Pn -p 443 <源站公网IP>', desc: '自查源站是否仍可被直连访问，判断 WAF 是否可被绕过（仅限自有资产）' }
      ],
      notes: [
        '**源站 IP 不隐藏，WAF 等于没上**：攻击者绕过 WAF 直连源站即可，务必用安全组把源站限制为只接受 WAF 回源地址，并更换已泄露的源站 IP',
        '**黑洞是双刃剑**：攻击流量超过防护能力时运营商或云平台会把 IP 拉黑，此时正常用户也访问不了，必须把黑洞告警接到值班电话',
        'WAF 规则过严会造成业务误拦，上线初期建议用"仅记录"模式跑一两天，收集误报后再切拦截',
        '**WAF 不防护非 HTTP 业务**：数据库、Redis、游戏长连接等暴露在公网的端口要靠安全组与 Anti-DDoS，别指望 WAF',
        'CC 攻击与 DDoS 的界限模糊：突发业务高峰（如秒杀、活动）可能被误判为攻击，大促前要提前报备并调整阈值',
        '接入 WAF 后要确认真实客户端 IP 的获取方式（`X-Forwarded-For` 等），否则应用日志与风控会全部记成 WAF 的 IP',
        'DDoS 防护有成本，按防护带宽计费；选型时先评估业务峰值的正常带宽，再决定保底防护能力'
      ],
      related: ['sec-sg-minimal', 'sec-nmap', 'sec-nikto', 'sec-aksk-leak'],
      docs: 'https://support.huaweicloud.com/waf/index.html',
      tags: ['WAF', 'DDoS', '流量清洗', '华为云']
    },
    /* ---------- 36 / 38 ---------- */
    {
      id: 'sec-setenforce',
      name: 'setenforce',
      alias: ['setenforce 0', '临时关闭 SELinux', '宽容模式'],
      level: 2,
      syntax: 'setenforce [0|1]   # 0=Permissive 宽容  1=Enforcing 强制',
      summary: '临时切换 SELinux 模式，确认"是不是它挡的"。',
      desc: '**它是排障工具，不是解决方案。** SELinux 拒绝访问时，应用报错往往很含糊（权限不够、连不上、打不开文件），而 `setenforce 0` 一敲就好 —— 这一步的价值就是**证实"是 SELinux"**。确认之后要回到 Enforcing 去把策略配对（`semanage fcontext` + `restorecon`，或 `setsebool` 开对应布尔值），而不是把 SELinux 关了了事。\n\n**为什么不能长期关**：关掉 SELinux 等于放弃了"即使服务被攻破，攻击者也被限制在策略允许的范围内"这层防护，而且它是**安全合规检查的必查项**。生产上确实有关不掉的历史包袱，那也应该用 `setsebool` / 自定义策略（`audit2allow`）精准放行，而不是全局 Permissive。\n\n**它改的是运行时状态，重启即失效** —— 想持久化要改 `/etc/selinux/config` 里的 `SELINUX=`。这也是个安全设计：临时排障不会悄悄变成永久配置。',
      params: [
        { flag: '0', desc: '切到 Permissive：只记录拒绝、不阻止，用于确认"是不是 SELinux 挡的"' },
        { flag: '1', desc: '切回 Enforcing：真正拦截违规访问，生产必须停在这个状态' },
        { flag: '（无参数）', desc: '不在 Enforcing/Permissive 之间切换，直接切回 Enforcing' }
      ],
      examples: [
        { cmd: 'getenforce', desc: '先看当前模式，Enforcing / Permissive / Disabled 三选一' },
        { cmd: 'setenforce 0 && getenforce', desc: '临时切到 Permissive（排障用），立刻回读确认生效' },
        { cmd: 'setenforce 1 && getenforce', desc: '排障结束**务必**切回 Enforcing' },
        { cmd: 'ausearch -m avc -ts today -i', desc: '在 Enforcing 下把拒绝日志捞出来，这才是要修的东西' }
      ],
      notes: [
        '⚠️ **本教学终端不模拟 `setenforce`**（它会真的改动系统的强制访问控制状态，属于内核级操作）。真机上执行；教学环境用 `getenforce` 看模式、用 `ausearch -m avc` 看拒绝记录这两步来学排障思路。',
        '**最常见的错误用法**：`setenforce 0` 之后问题好了，就把它写进 `rc.local` 长期关掉。正确做法是回 Enforcing，再用 `ausearch` + `audit2allow` 或 `semanage fcontext` + `restorecon` 精准放行。',
        '它**不持久**：重启后回到 `/etc/selinux/config` 里 `SELINUX=` 指定的状态。要永久改就改那个文件（改完需重启）。',
        '`Disabled` 状态下调不了，必须先在配置文件里改成 `permissive` 或 `enforcing` 并重启，SELinux 没有"运行时从 Disabled 恢复"的能力',
        '`setenforce` 需要 root；普通用户执行报 `Permission denied`',
        '容器里通常没有 SELinux 上下文（宿主机的策略管容器），`getenforce` 可能直接说 `Disabled`'
      ],
      related: ['sec-getenforce', 'sec-ausearch', 'sec-semanage-fcontext', 'sec-restorecon', 'sec-aa-status'],
      docs: 'https://man7.org/linux/man-pages/man8/setenforce.8.html',
      tags: ['SELinux', '安全', '排障', '合规']
    },

    /* ---------- 37 / 38 ---------- */
    {
      id: 'sec-getsebool',
      name: 'getsebool',
      alias: ['getsebool -a', 'SELinux 布尔值', '查 SELinux 开关'],
      level: 2,
      syntax: 'getsebool -a | getsebool <布尔值名> [...]',
      summary: '查看 SELinux 的开关（布尔值）当前是开还是关，判断某个功能是否被策略挡住。',
      desc: 'SELinux 的布尔值是**策略预先留好的开关**：`httpd_can_network_connect`、`mysqld_connect_any`、`ftpd_anon_write` 这类名字一看就知道它管什么。很多"SELinux 挡住了"的场景并不需要写自定义策略，只要把对应布尔值打开就行 —— 这比 `setenforce 0` 精准得多。\n\n**典型场景**：Nginx 要反代到后端（`httpd_can_network_connect`）、Web 应用要连数据库（`httpd_can_network_connect_db`）、Samba 要共享家目录（`samba_enable_home_dirs`）。\n\n**怎么找该开哪个**：先 `ausearch -m avc -ts recent` 拿到被拒的 `scontext/tcontext/tclass`，或者在 `audit2allow -w` 的提示里看它建议哪个布尔值（`audit2allow` 有时会直接说"consider using the `xxx` boolean"）。`getsebool -a | grep <关键词>` 用来快速筛。',
      params: [
        { flag: '-a', desc: '列出全部布尔值及其当前状态（几百条，务必配 `grep`）' },
        { flag: '<布尔值名>', desc: '查询单个，输出形如 `httpd_can_network_connect --> off`' }
      ],
      examples: [
        { cmd: 'getsebool httpd_can_network_connect', desc: '查 Nginx 能否主动发起网络连接（反代/连后端的必查项）' },
        { cmd: 'getsebool -a | grep httpd', desc: '筛出所有 httpd 相关开关，看看有哪些可以打开' },
        { cmd: 'getsebool -a | grep -c off', desc: '数一下有多少开关是关的，快速了解这台机器的策略松紧' }
      ],
      notes: [
        '⚠️ **本教学终端不模拟 `getsebool`**（需要真实的 SELinux 策略库）。真机上执行；`getenforce` 与 `ausearch` 是实现了的，可以用它们学排障流程。',
        '它只**读**不改；要改布尔值用 `setsebool`（加 `-P` 才持久化）',
        '`getsebool` 的名字是**下划线**风格（`httpd_can_network_connect`），而 `semanage boolean -l` 显示的是带描述的表格，两者对照着看更清楚',
        '`Disabled` 状态下布尔值没有意义，命令可能直接报错或全返回 off —— 先 `getenforce` 确认 SELinux 是开着的',
        '别把"开关全打开"当成解决方案：每打开一个都是在放宽度量，要按最小权限原则只开必要的那一个'
      ],
      related: ['sec-setsebool', 'sec-getenforce', 'sec-setenforce', 'sec-ausearch', 'sec-semanage-fcontext'],
      docs: 'https://man7.org/linux/man-pages/man8/getsebool.8.html',
      tags: ['SELinux', '安全', '布尔值', '排障']
    },

    /* ---------- 38 / 38 ---------- */
    {
      id: 'sec-setsebool',
      name: 'setsebool',
      alias: ['setsebool -P', '开 SELinux 布尔值', 'SELinux 开关持久化'],
      level: 2,
      syntax: 'setsebool [-P] <布尔值名> <on|off|1|0> [...]',
      summary: '打开或关闭 SELinux 的某个开关，`-P` 才会写进策略永久生效。',
      desc: '**`-P` 是这个命令的全部重点**：不加 `-P` 只改运行时，重启就回去了（临时验证用）；加 `-P` 会把改动写进策略库、重启仍然有效（真正修问题用）。很多人"明明改了却重启又坏"就是这个原因。\n\n**为什么它比 `setenforce 0` 好**：`setenforce 0` 是把整个 SELinux 的强制能力关掉（所有策略一起失效），而 `setsebool` 只放行**一个明确的功能**，其余防护照旧。同类的精准手段还有 `semanage fcontext` + `restorecon`（修文件上下文）、自定义策略模块（`audit2allow -M`）。\n\n**代价要知道**：打开一个布尔值就是放宽一处策略，等于承认"这个访问是业务需要的"。所以它该有变更记录、该在评审时说得清为什么。',
      params: [
        { flag: '-P', desc: '持久化到策略库，重启后仍生效 —— 真正修问题必须带这个' },
        { flag: '<布尔值名>', desc: '要改的开关名，用 `getsebool -a | grep 关键词` 找' },
        { flag: 'on / 1', desc: '打开（两种写法等价）' },
        { flag: 'off / 0', desc: '关闭（两种写法等价）' }
      ],
      examples: [
        { cmd: 'setsebool -P httpd_can_network_connect on && getsebool httpd_can_network_connect', desc: '允许 Nginx 主动外连并持久化，改完立刻回读确认' },
        { cmd: 'setsebool httpd_can_network_connect on', desc: '只改运行时（临时验证用），重启会失效' },
        { cmd: 'getsebool -a | grep -c on', desc: '确认改动生效后，统计当前打开了多少开关，留一份变更前/后的对照' }
      ],
      notes: [
        '⚠️ **本教学终端不模拟 `setsebool`**（要写真实 SELinux 策略库，属于系统级变更）。真机上执行；配套的排障链路（`getenforce` → `ausearch -m avc` → 定位 → 放行）可以在教学环境的故障速查里走一遍。',
        '**忘加 `-P` 是最高频的坑**：当下好了，重启又坏。判断依据：`getsebool` 显示 on，但重启后又变 off。',
        '`-P` 会重建策略库，机器上布尔值很多时可能耗时几秒到几十秒，别以为卡住了',
        '改之前先记录原值（`getsebool <名字>`），便于回滚；变更记录里要写清"为什么需要这个访问"',
        '如果 `audit2allow -w` 提示的是"需要自定义策略"而不是某个布尔值，那说明这个访问策略里没有现成开关，要走 `audit2allow -M` 生成模块（并经过评审）'
      ],
      related: ['sec-getsebool', 'sec-getenforce', 'sec-setenforce', 'sec-ausearch', 'sec-semanage-fcontext'],
      docs: 'https://man7.org/linux/man-pages/man8/setsebool.8.html',
      tags: ['SELinux', '安全', '布尔值', '持久化']
    }
  );
})();
