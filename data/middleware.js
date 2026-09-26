/* data/middleware.js · 分类 10 中间件 */
(function () {
  'use strict';

  var catId = 'middleware';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. Nginx ================= */

    /* ---------- 1 / 30 ---------- */
    {
      id: 'mw-nginx-test',
      name: 'nginx -t',
      alias: ['nginx -t -q', 'nginx 配置校验', 'nginx -t -c'],
      level: 1,
      syntax: 'nginx -t [-q] [-c <配置文件>] [-p <前缀目录>]',
      summary: '改完配置先跑一遍，语法错误当场报出行号，避免 reload 把服务带崩。',
      desc: '校验时 Nginx 只解析配置语法与文件路径，不影响正在运行的 worker，线上可以随时执行。`-t` 会把 `include` 进来的文件全部读一遍，证书路径打不开、`upstream` 里的静态域名解析不了都会直接报错；但它**不检查后端端口是否在监听**，`-t` 通过不代表服务就正常。',
      params: [
        { flag: '-t', desc: '测试配置文件语法，成功输出 `syntax is ok` 与 `test is successful`' },
        { flag: '-q', desc: '静默模式，只在出错时输出，脚本里常写 `nginx -t -q && nginx -s reload`' },
        { flag: '-c <路径>', desc: '指定主配置文件，默认取编译时的 `--conf-path`' },
        { flag: '-p <路径>', desc: '指定 Nginx 前缀目录（prefix），影响配置里相对路径的解析' },
        { flag: '-T', desc: '校验的同时把合并后的完整配置打印出来，见 `mw-nginx-dump`' }
      ],
      examples: [
        { cmd: 'nginx -t', desc: '最常用的一条：改完 `/etc/nginx/nginx.conf` 立刻校验' },
        { cmd: 'nginx -t -c /etc/nginx/nginx.conf -p /etc/nginx', desc: '显式指定配置文件与前缀目录，一台机器多个 Nginx 实例时必须写' },
        { cmd: 'nginx -t -q && nginx -s reload', desc: '校验通过才平滑重载，写在一行里避免手抖；`-q` 只在出错时说话' }
      ],
      notes: [
        '`-t` 只验证语法，**不代表业务正常**：配置里 `proxy_pass` 指向的 `10.0.1.31:8080` 挂掉时，`-t` 依旧输出 `test is successful`',
        '项目里配置写在 `/etc/nginx/nginx.conf` 的 `http` 块内，校验通过后才是 `nginx -s reload`，两步不要颠倒',
        '`yum`/`apt` 装的 Nginx 与源码编译安装的 Nginx 配置路径不同，先用 `which nginx` 与 `nginx -V` 确认校验的是哪个二进制、哪份配置',
        '容器里的 Nginx 要在容器内校验：`docker exec -it <容器名> nginx -t`，在宿主机上跑 `nginx -t` 校验的是宿主机的配置'
      ],
      related: ['mw-nginx-signal', 'mw-nginx-dump', 'mw-nginx-version', 'dk-exec'],
      docs: 'https://nginx.org/en/docs/switches.html',
      tags: ['Nginx', '配置', '校验']
    },

    /* ---------- 2 / 30 ---------- */
    {
      id: 'mw-nginx-signal',
      name: 'nginx -s',
      alias: ['nginx -s reload', 'nginx 平滑重载', 'nginx -s quit', 'nginx 信号'],
      level: 2,
      syntax: 'nginx -s <reload|stop|quit|reopen>',
      summary: '用信号控制 Nginx 平滑重载、优雅退出或立即停止，避免连接被硬切。',
      desc: '`-s` 只是"给 master 进程发信号"的语法糖，等价于直接 `kill -HUP/QUIT/TERM/USR1 <master pid>`。`reload` 会先启动新 worker、老 worker 把手上请求处理完再退出，所以不断连接；`quit` 是优雅退出（同 `SIGQUIT`），`stop` 是立即退出（同 `SIGTERM`）会直接掐断。改配置的标准姿势是：`nginx -t` → `nginx -s reload`。',
      params: [
        { flag: 'reload', desc: '平滑重载配置（`HUP`），老 worker 处理完存量请求再退出，连接不断' },
        { flag: 'quit', desc: '优雅停止（`QUIT`），等当前请求处理完再退出进程，维护窗口用' },
        { flag: 'stop', desc: '立即停止（`TERM`），**直接断开所有连接**，生产环境禁止用于"重启"' },
        { flag: 'reopen', desc: '重新打开日志文件（`USR1`），配合 `logrotate` 做日志切割' },
        { flag: 'kill -HUP <master pid>', desc: '完全等价的信号写法，pid 可从 `logs/nginx.pid` 或 `ps -ef | grep nginx` 取' }
      ],
      examples: [
        { cmd: 'nginx -t && nginx -s reload', desc: '改完配置的标准两步：先校验再平滑重载，用户完全无感知' },
        { cmd: 'nginx -s quit', desc: '优雅退出：等正在处理的请求结束再停，停机维护用这个而不是 stop' },
        { cmd: 'nginx -s reopen', desc: '重新打开日志文件，`logrotate` 切割后执行它（等价于 `kill -USR1 $(cat /run/nginx.pid)`）' }
      ],
      notes: [
        '**危险：`nginx -s stop` 会直接掐断所有连接**，正在下载和上传的请求全部中断，用户侧看到的是空白页或连接重置；生产环境禁止用它做"重启"，要生效新配置一律 `nginx -s reload`，要停机维护用 `nginx -s quit`',
        '`reload` 不是万能的：改了 `worker_processes`、`user`、`pid`、`listen` 端口这类只能在启动时确定的指令，`reload` 会失败并在 error.log 里写明原因，这种情况下才需要 `stop` + 重新启动（或 `systemctl restart nginx`）',
        '老 worker 迟迟不退出说明有长连接或大文件传输卡着，可用 `ps -ef | grep "nginx: worker"` 观察；`worker_shutdown_timeout` 可以设一个强制兜底时间',
        '`-s` 找不到 pid 文件会报 `invalid PID number` 或 `open() "/run/nginx.pid" failed`，先确认 master 进程在跑、`nginx.pid` 的真实路径在哪'
      ],
      related: ['mw-nginx-test', 'mw-nginx-log', 'mw-nginx-dump', 'lu-systemctl'],
      docs: 'https://nginx.org/en/docs/control.html',
      tags: ['Nginx', '重载', '信号', '关闭']
    },

    /* ---------- 3 / 30 ---------- */
    {
      id: 'mw-nginx-dump',
      name: 'nginx -T',
      alias: ['nginx 导出配置', 'nginx 打印完整配置', 'nginx 改了没生效'],
      level: 2,
      syntax: 'nginx -T [-c <配置文件>]',
      summary: '把 include 合并后的完整配置打印出来，确认线上真正加载了什么。',
      desc: '`-T` 是 `-t` 的超集：先做语法测试，再把 `nginx.conf` 与所有 `include` 进来的 `conf.d/*.conf`、`mime.types` 按实际加载顺序完整输出，每个片段上方带 `# configuration file /etc/nginx/...` 分隔注释。排查"改了配置没生效""到底加载的是哪一份"时，它比翻目录可靠得多。',
      params: [
        { flag: '-T', desc: '测试并打印完整配置，唯一能证明"这份文件真的被加载了"的手段' },
        { flag: '-c <路径>', desc: '指定主配置，用于确认多份配置里实际生效的是哪一份' },
        { flag: '-p <路径>', desc: '指定前缀目录，影响 `include` 中相对路径的解析结果' }
      ],
      examples: [
        { cmd: 'nginx -T', desc: '打印合并后的完整配置，先看每个片段上方的 `# configuration file` 注释' },
        { cmd: 'nginx -T | grep -n "proxy_pass"', desc: '在完整配置里定位所有 `proxy_pass`，确认改的那份是否真被 include 进来' },
        { cmd: 'nginx -T > /tmp/nginx-full-$(date +%F).conf', desc: '导出留档，方便与上一次的配置做对比或提交工单' }
      ],
      notes: [
        '`-T` 的输出**含证书路径、`auth_basic_user_file`、上游内网 IP 等敏感信息**，贴到工单或群里之前先脱敏',
        '输出里出现 `# configuration file /etc/nginx/conf.d/default.conf` 才说明这份文件被加载了；改了配置没生效，先确认你改的文件在不在这个列表里',
        '`include conf.d/*.conf` 按字典序加载，`00-default.conf` 会先于 `10-api.conf` 生效，同名指令后者会覆盖前者',
        '在 `bash` 里可用 `diff <(nginx -T) /tmp/nginx-full-last.conf` 快速看出这次改了什么，`sh` 不支持进程替换'
      ],
      related: ['mw-nginx-test', 'mw-nginx-signal', 'mw-nginx-location', 'lt-grep'],
      docs: 'https://nginx.org/en/docs/switches.html',
      tags: ['Nginx', '配置', '排查']
    },

    /* ---------- 4 / 30 ---------- */
    {
      id: 'mw-nginx-version',
      name: 'nginx -V',
      alias: ['nginx -v', 'nginx 编译参数', 'nginx 模块', 'configure arguments'],
      level: 2,
      syntax: 'nginx -V',
      summary: '查看版本与编译参数，判断某个模块是否真的编进了这个二进制。',
      desc: '输出分两部分：第一行是版本号（`nginx version: nginx/1.24.0`），第二行 `configure arguments:` 后面是编译时定下的全部参数。排查"为什么 `ssl`、`http_v2`、`stream` 这些指令报 `unknown directive`"，看的就是这一行；`--prefix`、`--conf-path`、`--pid-path` 决定了默认配置与 pid 文件在哪。',
      params: [
        { flag: '-v', desc: '只打印版本号，不带编译参数' },
        { flag: '-V', desc: '打印版本号与全部编译参数，排查模块是否存在必须用它' },
        { flag: '--with-http_ssl_module', desc: '出现才说明支持 HTTPS，`yum`/`apt` 装的包默认带' },
        { flag: '--with-http_v2_module', desc: 'HTTP/2 支持；HTTP/3 对应 `--with-http_v3_module`，开源版 1.25 起才有' },
        { flag: '--prefix=/etc/nginx', desc: '安装前缀，决定默认的 `conf`、`logs`、`sbin` 路径' },
        { flag: '--add-module=<路径>', desc: '第三方模块，升级二进制前要确认它有对应版本，否则 reload 报 `unknown directive`' }
      ],
      examples: [
        { cmd: 'nginx -V', desc: '一次看到版本号与全部 `configure arguments`' },
        { cmd: 'nginx -V 2>&1 | tr \' \' \'\\n\' | grep -E "with-http_ssl|with-http_v2|with-stream"', desc: '把编译参数拆成一行一个，快速确认关键模块是否存在' },
        { cmd: 'nginx -V 2>&1 | tr \' \' \'\\n\' | grep -E "prefix|conf-path|pid-path"', desc: '确认默认配置与 pid 文件路径，一台机器多个实例时必查' }
      ],
      notes: [
        '`nginx -V` 的内容输出到**标准错误**，脚本里重定向要写 `2>&1`，否则管道抓不到任何东西',
        '`yum install nginx` 装的包配置在 `/etc/nginx`，源码编译安装常在 `/usr/local/nginx/conf`，两者默认路径完全不同',
        '`openresty` 是 Nginx 加 LuaJIT 的分支，`-V` 里会出现 `ngx_lua` 之类的模块路径，不要按官方 Nginx 的模块清单去套',
        '升级前先把 `nginx -V` 的输出存档，新版本少了一项 `--with-*` 就可能导致配置起不来'
      ],
      related: ['mw-nginx-test', 'mw-nginx-dump', 'lu-systemctl', 'dk-exec'],
      docs: 'https://nginx.org/en/docs/switches.html',
      tags: ['Nginx', '版本', '模块']
    },

    /* ---------- 5 / 30 ---------- */
    {
      id: 'mw-nginx-location',
      name: 'location',
      alias: ['nginx location', 'location 匹配优先级', 'root 与 alias 的区别'],
      level: 3,
      syntax: 'location [ = | ~ | ~* | ^~ ] <匹配模式> { ... }',
      summary: '决定请求 URL 由哪个规则处理，优先级写错会出现诡异 404。',
      desc: '匹配顺序不是"从上到下取第一个"，而是：先找 `=` 精确匹配，命中立即结束；再找 `^~` 前缀匹配并记住**最长**的那个，命中后不再试正则；然后按出现顺序试 `~`/`~*` 正则，第一个命中即结束；最后回退到上面记住的最长前缀匹配。`root` 是把 URI 追加到根目录后面（`root /data/www` 配 `/img/a.png` 得到 `/data/www/img/a.png`），`alias` 是直接替换掉 location 前缀，两边斜杠写法不一致就会差一个目录层级。',
      params: [
        { flag: '=', desc: '精确匹配，如 `location = /health`，只匹配这一个 URI，速度最快' },
        { flag: '^~', desc: '前缀匹配且命中后不再尝试正则，静态资源目录常用它' },
        { flag: '~', desc: '正则匹配，区分大小写' },
        { flag: '~*', desc: '正则匹配，不区分大小写，匹配图片、静态文件后缀常用' },
        { flag: 'root', desc: '把 URI 原样拼在根目录后面，可写在 `http`/`server`/`location` 层' },
        { flag: 'alias', desc: '用 alias 直接替换 location 匹配到的前缀，**只能写在 location 里且末尾斜杠必须与 location 一致**' }
      ],
      examples: [
        { cmd: 'location = /health {\n    access_log off;\n    return 200 "ok";\n}\n\nlocation ^~ /static/ {\n    root /data/www;\n}\n\nlocation ~* \\.(jpg|png|css|js)$ {\n    expires 7d;\n    access_log off;\n}', desc: '精确匹配健康检查、静态目录走前缀匹配、图片走正则，三段互不干扰' },
        { cmd: 'curl -I http://web.example.com/health', desc: '验证 `=` 精确匹配是否生效：返回 200 且不带 access_log' },
        { cmd: 'location /img/ {\n    alias /data/images/;\n}', desc: '`alias` 末尾斜杠与 location 保持一致，`/img/a.png` 才会映射到 `/data/images/a.png`' }
      ],
      notes: [
        '`alias` 的**末尾斜杠坑**：写成 `location /img/ { alias /data/images; }` 时，`/img/a.png` 会去找 `/data/imagesa.png` 并返回 404，两边要么都带斜杠要么都不带',
        '正则 location 一旦命中就立刻结束，后面的更长前缀不会再被考虑；想保护某个目录不被正则截走，给它加 `^~`',
        '`location /` 是兜底规则，几乎所有请求都会落到它；在它里面写 `proxy_pass` 会把静态文件也一起转给后端应用',
        '`proxy_pass` 在 location 里带不带末尾 URI 会改变路径拼接方式，这是另一个高频坑，见 `mw-nginx-proxy-pass`',
        '`rewrite ... last` 会重新走一遍 location 匹配，`break` 不会，两者优先级容易混，见 `mw-nginx-rewrite`'
      ],
      related: ['mw-nginx-proxy-pass', 'mw-nginx-rewrite', 'mw-nginx-dump', 'mw-nginx-502-504-499'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_core_module.html',
      tags: ['Nginx', 'location', '匹配']
    },

    /* ---------- 6 / 30 ---------- */
    {
      id: 'mw-nginx-proxy-pass',
      name: 'proxy_pass',
      alias: ['nginx 反向代理', 'proxy_pass 斜杠', 'X-Forwarded-For', 'X-Real-IP'],
      level: 3,
      syntax: 'proxy_pass <http://上游名或IP:端口>[URI];',
      summary: '把请求转发给后端应用，末尾斜杠决定路径是原样透传还是被替换。',
      desc: '最常见的坑是**末尾斜杠**：`proxy_pass http://app_backend;`（不带 URI）会把客户端原始路径原样透传，`/api/user` 到后端还是 `/api/user`；`proxy_pass http://app_backend/;`（带 `/`）会把 location 匹配到的前缀替换成 `/`，`location /api/` 时 `/api/user` 到后端就变成 `/user`。转发时还要手工补 `Host`、`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto`，后端才能拿到真实域名、真实客户端 IP 和原始协议。',
      params: [
        { flag: 'proxy_set_header Host $host', desc: '把原始域名传给后端；不设时后端收到的是 upstream 名 `app_backend`' },
        { flag: 'proxy_set_header X-Real-IP $remote_addr', desc: '传客户端 IP；前面还有一层代理时 `$remote_addr` 是那层代理的 IP' },
        { flag: 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for', desc: '追加式记录整条代理链，取真实 IP 要取第一段' },
        { flag: 'proxy_set_header X-Forwarded-Proto $scheme', desc: '告诉后端原始请求是 http 还是 https，避免应用把跳转写回 http' },
        { flag: 'proxy_http_version 1.1', desc: '必须与 `proxy_set_header Connection ""` 同用才能和后端保持长连接，默认是 1.0 短连接' },
        { flag: 'proxy_read_timeout 60s', desc: '等待后端响应的超时，超了记 504，默认 60s' }
      ],
      examples: [
        { cmd: 'location /api/ {\n    proxy_pass http://app_backend/;\n    proxy_http_version 1.1;\n    proxy_set_header Connection "";\n    proxy_set_header Host $host;\n    proxy_set_header X-Real-IP $remote_addr;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_set_header X-Forwarded-Proto $scheme;\n}', desc: '带 URI 的写法：`/api/user` 到后端变成 `/user`，同时补齐真实 IP 与协议头' },
        { cmd: 'curl -sv http://web.example.com/api/user', desc: '从 Nginx 侧验证转发是否正常，同时 `tail` 访问日志看 `$upstream_addr` 落到哪台' },
        { cmd: 'nginx -T | grep -n -B2 -A8 "proxy_pass"', desc: '导出完整配置定位所有 `proxy_pass`，确认改的那一份真的被加载了' }
      ],
      notes: [
        '**末尾斜杠是最高频事故点**：`location /api/` 配 `proxy_pass http://app_backend;` 后端收到 `/api/user`，配 `proxy_pass http://app_backend/;` 后端收到 `/user`，两者不能凭印象混用',
        '不设 `Host` 头时后端收到的是 `app_backend`，Spring Boot 的绝对地址重定向、Tomcat 的 `redirectPort` 跳转、后端的域名白名单校验都会出问题',
        '`X-Forwarded-For` 是客户端可以伪造的头，只信任自己这层 Nginx 用 `$proxy_add_x_forwarded_for` 追加的结果；日志里用 `$http_x_forwarded_for` 记录时才看得到完整链路',
        '默认 `proxy_http_version 1.0` 并带 `Connection: close`，高并发下后端 TIME_WAIT 会暴涨；要改成 1.1 并给 `upstream` 配 `keepalive` 才真正生效',
        '`proxy_pass` 里带变量（如 `proxy_pass http://$backend;`）时必须配 `resolver`，否则 reload 时报 `no resolver defined to resolve`'
      ],
      related: ['mw-nginx-upstream', 'mw-nginx-location', 'mw-nginx-502-504-499', 'ln-curl'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html',
      tags: ['Nginx', '反向代理', '转发']
    },

    /* ---------- 7 / 30 ---------- */
    {
      id: 'mw-nginx-upstream',
      name: 'upstream',
      alias: ['nginx 负载均衡', 'upstream 健康检查', 'max_fails', 'fail_timeout'],
      level: 3,
      syntax: 'upstream <名称> { server <IP:端口> [weight=] [max_fails=] [fail_timeout=]; }',
      summary: '把多台后端组成负载均衡池，并按权重、连接数或 IP 分配流量。',
      desc: '不带参数时默认 `roundrobin`（轮询，支持权重），`least_conn` 按当前连接数最少的优先，`ip_hash` 按客户端 IP 取模做会话保持。开源版只有**被动健康检查**：真实请求失败累计到 `max_fails` 次就把这台标记为不可用，`fail_timeout` 内不再转发给它，超时后放一个请求去探测，成功就恢复。',
      params: [
        { flag: 'weight=3', desc: '权重，默认 1，按比例分流；新老机器规格不同时常用' },
        { flag: 'max_fails=3', desc: '`fail_timeout` 窗口内失败几次算不可用，默认 1；设 0 表示不做失败统计' },
        { flag: 'fail_timeout=10s', desc: '摘除后的冷却时间，同时也是失败次数的统计窗口' },
        { flag: 'backup', desc: '备用机，只有主机组全部不可用才接流量' },
        { flag: 'down', desc: '手工标记下线，扩容或维护时用，不会自动恢复探测' },
        { flag: 'keepalive 32', desc: '与每台后端保持的闲置长连接数，**必须配合 `proxy_http_version 1.1` 与 `Connection ""` 才生效**' }
      ],
      examples: [
        { cmd: 'upstream app_backend {\n    least_conn;\n    server 10.0.1.31:8080 weight=2 max_fails=3 fail_timeout=10s;\n    server 10.0.1.32:8080 weight=1 max_fails=3 fail_timeout=10s;\n    server 10.0.1.33:8080 backup;\n    keepalive 32;\n}', desc: '最贴近生产的写法：least_conn 分流、权重区分机器规格、backup 兜底、keepalive 复用长连接' },
        { cmd: 'nginx -T | grep -n -A8 "upstream app_backend"', desc: '确认线上真正生效的 upstream 成员与参数' },
        { cmd: 'for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code}\\n" http://web.example.com/health; done', desc: '连续请求 10 次，再看访问日志里的 `$upstream_addr` 是否在两台后端之间轮转' }
      ],
      notes: [
        '**开源 Nginx 没有主动健康检查**：`health_check` 指令属于 Nginx Plus 商业版，开源版写了会报 `unknown directive`；只能用 `max_fails`/`fail_timeout` 被动摘除，要主动探测得靠外部脚本定时 `curl /health`，或改用 OpenResty / tengine',
        '被动摘除有**滞后**：`max_fails=3` 意味着前 3 个用户请求注定失败，`fail_timeout` 期间第 4 个请求才会被转到健康节点，对可用性要求高的业务要在前面再加一层 HAProxy 或云负载均衡',
        '`ip_hash` 在客户端走 NAT 或代理时会大量哈希到同一台，负载严重倾斜；会话保持更推荐后端统一用 Redis 存 session',
        '`keepalive` 写的是**每台后端**的闲置长连接数而不是总数，且漏了 `proxy_http_version 1.1` 与 `Connection ""` 时它完全不生效',
        '`server` 后面写域名时 Nginx 只在启动或 `reload` 时解析一次并缓存，后端 IP 变了必须 `reload`，云上 RDS/ELB 域名场景常踩',
        '若 `backup` 节点（如 `10.0.1.33`）长期在接流量，说明主组两台已被 `max_fails` 全部摘除，先查后端健康状态与 `fail_timeout` 设置，再怀疑负载算法'
      ],
      related: ['mw-nginx-proxy-pass', 'mw-nginx-502-504-499', 'mw-nginx-test', 'mw-haproxy-config'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_upstream_module.html',
      tags: ['Nginx', '负载均衡', '健康检查']
    },

    /* ---------- 8 / 30 ---------- */
    {
      id: 'mw-nginx-rewrite',
      name: 'rewrite',
      alias: ['nginx return', 'rewrite last break', 'nginx 重定向', '301 跳转'],
      level: 3,
      syntax: 'rewrite <正则> <替换目标> [last|break|redirect|permanent];  return <状态码> [文本或URL];',
      summary: '改写请求 URI 或直接返回指定状态码，处理跳转与旧链接兼容。',
      desc: '`rewrite` 只能改 URI 或发跳转，`return` 直接给状态码，**不需要跑正则引擎**，所以能用 `return` 就别用 `rewrite`。四个标志位里：`last` 改完 URI 后重新走一遍 location 匹配（可能死循环，最多 10 次后报 500），`break` 就在当前 location 里继续处理，`redirect` 返回 302 临时跳转，`permanent` 返回 301 永久跳转、浏览器会长期缓存。',
      params: [
        { flag: 'last', desc: '重写后重新匹配 location（默认行为），注意可能形成循环' },
        { flag: 'break', desc: '重写后停在当前 location 继续执行后续指令，不再匹配其他 location' },
        { flag: 'redirect', desc: '返回 302 临时重定向，会多一次往返，改错了好回滚' },
        { flag: 'permanent', desc: '返回 301 永久重定向，**客户端会强缓存，确认无误再用**' },
        { flag: 'return 301 https://$host$request_uri', desc: '建站最常用的全站 HTTPS 跳转写法' },
        { flag: 'return 444', desc: 'Nginx 私有码，直接关连接不回任何响应，常用于挡扫描器' }
      ],
      examples: [
        { cmd: 'server {\n    listen 80;\n    server_name web.example.com;\n    return 301 https://$host$request_uri;\n}\n\nserver {\n    listen 443 ssl;\n    server_name web.example.com;\n    location /old-api/ {\n        rewrite ^/old-api/(.*)$ /api/$1 permanent;\n    }\n}', desc: 'HTTP 全站跳 HTTPS 用 `return`，旧接口路径映射用 `rewrite ... permanent`；这段要与现有 `server` 块合并，不要直接覆盖线上文件' },
        { cmd: 'curl -I http://web.example.com/old-api/user', desc: '`-I` 只看响应头，确认返回 301 以及 `Location` 指向的新地址' },
        { cmd: 'nginx -T | grep -nE "return|rewrite"', desc: '导出完整配置检查所有跳转规则，确认没有互相打架的旧规则' }
      ],
      notes: [
        '**能用 `return` 就别用 `rewrite`**：`return` 由 Nginx 直接返回，不进正则引擎；`rewrite` 每条请求都要做一次 PCRE 匹配，规则多了差距明显',
        '`permanent`（301）会被浏览器和 CDN 长期缓存，跳错地址后用户清缓存才能恢复；不确定时先用 `redirect`（302）验证',
        '`rewrite ... last` 最多执行 10 次，超过报 `500 Internal Server Error`，error.log 里的关键字是 `rewrite or internal redirection cycle`',
        '`rewrite` 只作用于 URI 部分，**不会**改写 `?` 后面的查询串；想保留原参数在替换目标末尾加 `?`，想丢弃就不加',
        '写在 `server` 层的 `rewrite` 在 location 匹配之前执行，写在 `location` 里的在匹配之后执行，放错层级结果可能完全不同',
        '`return 444` 是 Nginx 私有码，客户端看到的是连接被直接关闭，访问日志里记的就是 444，监控要单独识别'
      ],
      related: ['mw-nginx-location', 'mw-nginx-proxy-pass', 'mw-nginx-dump', 'mw-nginx-log'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_rewrite_module.html',
      tags: ['Nginx', '重写', '跳转']
    },

    /* ---------- 9 / 30 ---------- */
    {
      id: 'mw-nginx-log',
      name: 'log_format',
      alias: ['nginx 日志格式', 'access_log', 'nginx 日志切割', 'logrotate nginx'],
      level: 3,
      syntax: 'log_format <格式名> "<变量串>";  access_log <路径> <格式名>;',
      summary: '自定义访问日志字段并配合切割，让排障时能一眼看出慢在哪一段。',
      desc: '默认的 `combined` 格式只有客户端 IP、时间、请求行、状态码、大小和 UA，**没有耗时**，出问题只能靠猜。加上 `$request_time`（Nginx 视角的总耗时）与 `$upstream_response_time`（后端耗时）后，两者一减就知道慢在 Nginx 到客户端的网络还是慢在后端。`access_log` 与 `error_log` 都要显式配路径，容器里建议直接写 `/dev/stdout`、`/dev/stderr`。',
      params: [
        { flag: '$request_time', desc: '从读到请求第一个字节到发完响应的总耗时，单位为秒、精度到毫秒' },
        { flag: '$upstream_response_time', desc: '后端响应耗时；重试过多个后端时是逗号分隔的一串' },
        { flag: '$upstream_addr', desc: '实际处理该请求的后端地址，定位"打到哪台"的关键字段' },
        { flag: '$upstream_status', desc: '后端返回的状态码，与 `$status` 对照可区分错误是谁返回的' },
        { flag: '$http_x_forwarded_for', desc: '客户端原始 IP 链；前面还有 ELB/CDN 时 `$remote_addr` 只是那层代理的 IP' },
        { flag: 'buffer=32k flush=5s', desc: '`access_log` 的写入缓冲，高并发下减少磁盘 IO，代价是崩溃时可能丢最后几秒日志' }
      ],
      examples: [
        { cmd: 'log_format main \'$remote_addr - $remote_user [$time_local] "$request" \'\n                \'$status $body_bytes_sent "$http_referer" \'\n                \'"$http_user_agent" "$http_x_forwarded_for" \'\n                \'rt=$request_time urt=$upstream_response_time \'\n                \'ua=$upstream_addr us=$upstream_status\';\n\naccess_log /var/log/nginx/access.log main buffer=32k flush=5s;\nerror_log  /var/log/nginx/error.log warn;', desc: '在默认 `main` 格式上补耗时与上游信息，直接替换 `/etc/nginx/nginx.conf` 里已有的 `log_format`；改完先 `nginx -t`' },
        /* ⚠️ 顺序有讲究：**先分析、后切割**。
           这两条曾经是反过来的，而同一条记录里的示例是**接力执行**的
           （学员在同一个终端里一条条敲），于是"切割"先把 access.log 改名走了，
           后面那条 `awk … /var/log/nginx/access.log` 就报文件不存在 ——
           一条完全正确的命令，因为**上一条的副作用**而跑不通。
           调换顺序既符合真实运维习惯（先看当前日志，再归档），
           也让两条示例都能跑出结果。 */
        { cmd: 'awk \'{print $1}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10', desc: '统计访问量 Top 10 的客户端 IP（默认格式第一列就是 `$remote_addr`）' },
        { cmd: 'mv /var/log/nginx/access.log /var/log/nginx/access.log.$(date +%F) && nginx -s reopen', desc: '手动切割：改名后 `reopen` 让 Nginx 打开新文件，老文件可以安全压缩或删除' }
      ],
      notes: [
        '**`error_log` 的级别别长期开 `debug`**：debug 日志每秒能写几百 MB，把磁盘打满比故障本身更致命，排查完立刻改回 `warn` 并 reload',
        '`logrotate` 切割 Nginx 日志要配 `postrotate` 执行 `nginx -s reopen`（或 `kill -USR1 $(cat /run/nginx.pid)`）；直接用 `copytruncate` 虽然不用发信号，但写入量大时会**丢日志**，两种方案按业务取舍',
        '`$upstream_response_time` 可能出现 `-`（没走 upstream）或 `1.2, 3.4`（重试过多个后端），脚本里按字符串处理，别直接当数字比较',
        '`$request_time` 明显大于 `$upstream_response_time` 说明时间花在客户端上传或下游网络；两者都大才是后端真的慢',
        '容器里要把日志写到 `/dev/stdout`、`/dev/stderr`（`access_log /dev/stdout main;`），否则 `docker logs` 什么都看不到',
        '访问日志不记录请求体，排查 413 与 499 要靠 error.log 里的 `client intended to send too large body`、`client closed connection` 这类提示'
      ],
      related: ['mw-nginx-502-504-499', 'mw-nginx-signal', 'lt-nginx-top-ip', 'lt-nginx-status'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_log_module.html',
      tags: ['Nginx', '日志', '耗时']
    },

    /* ---------- 10 / 30 ---------- */
    {
      id: 'mw-nginx-502-504-499',
      name: 'Nginx 502 / 504 / 499 排查',
      kind: 'recipe',
      alias: ['nginx 502', 'nginx 504', 'nginx 499', 'Bad Gateway', 'upstream timed out'],
      level: 3,
      syntax: 'tail -f /var/log/nginx/access.log → 看 $status 与 $upstream_addr → curl 直连后端 → 对齐 error.log',
      summary: '按固定顺序排查三种高频错误码，先分清是后端挂了、后端慢了还是客户端跑了。',
      desc: '**502 Bad Gateway**：Nginx 连不上后端，或后端返回的内容不合法（连接被 RST、响应头残缺）。**504 Gateway Time-out**：连接建立了，但 `proxy_read_timeout`（默认 60s）内后端一直没吐数据。**499** 是 Nginx 自定义码：客户端在 Nginx 返回响应之前主动断开，用户刷新、客户端超时短于后端处理时间、大文件上传被中断都会记 499；它**不代表后端故障**，但大量 499 通常伴随后端变慢。三种码的处置方向完全不同，所以第一步永远是先看日志分布，而不是直接去调超时。',
      params: [
        { flag: '$status', desc: '访问日志里的最终状态码，先用它统计 502/504/499 各占多少' },
        { flag: '$upstream_addr', desc: '判断是全部后端都出错还是只打到某一台；值全是 `-` 说明压根没连上后端' },
        { flag: '$upstream_status', desc: '后端真实返回码，和 `$status` 不一致时说明错误是 Nginx 自己产生的' },
        { flag: '$upstream_response_time', desc: '后端耗时，与 `$request_time` 对比可判断慢在哪一段链路' },
        { flag: 'proxy_connect_timeout', desc: '与后端建立连接的超时（默认 60s），连不上会直接记 502' },
        { flag: 'proxy_read_timeout', desc: '等待后端响应的超时（默认 60s），超了记 504；盲目调大会把连接和内存一起拖住' }
      ],
      examples: [
        { cmd: 'grep -c \' 502 \' /var/log/nginx/access.log\ngrep -c \' 504 \' /var/log/nginx/access.log\ngrep -c \' 499 \' /var/log/nginx/access.log\nawk \'{print $9}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head', desc: '第一步：数出 502/504/499 各有多少、整体状态码分布如何（默认 `main` 格式里第 9 列就是 `$status`）' },
        { cmd: 'awk \'$9==502||$9==504{n++} END{printf "502+504 占比: %.2f%%\\n", n/NR*100}\' /var/log/nginx/access.log\ngrep -E \' (502|504|499) \' /var/log/nginx/access.log | tail -50', desc: '第二步：算清 502/504 的占比，并拉出最近 50 条错误请求，看是持续发生还是集中在某个时间点' },
        { cmd: 'curl -v http://10.0.1.31:8080/health\nss -lntp | grep 8080\ntail -f /var/log/nginx/error.log', desc: '第三步：绕过 Nginx 直连后端，确认 8080 在监听、`/health` 返回 200；再盯 error.log 里的 `connect() failed` 与 `upstream timed out`' }
      ],
      notes: [
        '**① 统计分布**：先看 502/504/499 各占多少、从什么时候开始。持续报错通常是后端挂了，整点集中报错多半是定时任务把后端压死。',
        '**② 定位范围**：在 `log_format` 里加上 `$upstream_addr` 与 `$upstream_status`（见 `mw-nginx-log`），看错误集中在某一台后端还是两台都报；`$upstream_addr` 全是 `-` 说明根本没连上后端。',
        '**③ 绕过 Nginx 验证**：在应用机上执行 `curl -v http://10.0.1.31:8080/health` 与 `ss -lntp | grep 8080`，确认端口在监听、健康检查返回 200。直连正常而经 Nginx 报 502，问题就在 Nginx 这一层。',
        '**④ 对齐时间点**：`tail -f /var/log/nginx/error.log` 与后端 `app.jar` 的日志按时间戳对照。error.log 里 `connect() failed`/`no live upstreams` 对应 502，`upstream timed out` 对应 504，`client prematurely closed connection` 对应 499。',
        '**⑤ 查拦截**：CentOS 上 `getenforce` 为 `Enforcing` 时 SELinux 默认禁止 Nginx 向外连端口，执行 `setsebool -P httpd_can_network_connect 1` 放行；再核对安全组与防火墙是否放通了 Nginx 到 `10.0.1.31:8080` 的流量。',
        '**⑥ 看后端存活**：后端进程被 OOM Killer 杀掉、或 `max_fails` 把两台都摘除后，error.log 会写 `no live upstreams while connecting to upstream` 并返回 502；用 `dmesg -T | grep -i oom` 与 `systemctl status app` 确认。',
        '**⑦ 最后才动超时**：504 先分清是后端慢还是网络慢——`$request_time` 远大于 `$upstream_response_time` 说明慢在客户端或网络，两者都大才是后端慢。盲目调大 `proxy_read_timeout` 只会让连接越堆越多，用户等得更久。',
        '**499 不是后端故障**：用户刷新页面、APP 端超时设成 3s 而后端要跑 10s、`proxy_read_timeout` 比客户端超时还长、大文件上传中途取消，都会记 499；数量大说明后端确实慢了，要优化后端而不是找 Nginx 麻烦。'
      ],
      related: ['mw-nginx-log', 'mw-nginx-upstream', 'ln-troubleshoot-connect-refused', 'ln-ss'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html',
      tags: ['Nginx', '502', '504', '499']
    },

    /* ---------- 11 / 30 ---------- */
    {
      id: 'mw-nginx-limit',
      name: 'limit_req / limit_conn',
      alias: ['nginx 限流', 'limit_req_zone', 'limit_conn_zone', 'nginx 429'],
      level: 3,
      syntax: 'limit_req_zone <键> zone=<名称>:<内存> rate=<速率>;  limit_req zone=<名称> [burst=<n>] [nodelay];',
      summary: '按 IP 或连接数给请求限速，挡住突发流量与恶意刷接口的行为。',
      desc: '`limit_req` 按请求速率限流（漏桶模型），`limit_conn` 按并发连接数限流，两者按业务叠加使用：接口用 `limit_req` 防刷，下载与大文件用 `limit_conn` 防单个 IP 占满带宽。`zone` 定义必须放在 `http` 块，`limit_req`/`limit_conn` 可以放在 `http`、`server` 或 `location` 块。默认被限流时返回 **503**，改成 `limit_req_status 429` 语义更准确，监控也更容易和后端故障区分开。',
      params: [
        { flag: 'limit_req_zone $binary_remote_addr zone=req_one:10m rate=10r/s', desc: '定义限流区；`10m` 大约能存 16 万个 IP，`$binary_remote_addr` 比 `$remote_addr` 省内存' },
        { flag: 'limit_req zone=req_one burst=20 nodelay', desc: '允许突发 20 个请求，`nodelay` 让突发请求立刻处理而不是排队变慢' },
        { flag: 'limit_conn_zone $binary_remote_addr zone=conn_one:10m', desc: '定义并发连接统计区，同样放在 `http` 块' },
        { flag: 'limit_conn conn_one 10', desc: '同一个 IP 最多 10 个并发连接，超了直接拒绝' },
        { flag: 'limit_req_status 429', desc: '限流返回码，默认是 503；改成 429 更符合语义' },
        { flag: 'limit_conn_status 503', desc: '并发限流的返回码，默认就是 503，客户端对 429 不友好时可以保持' }
      ],
      examples: [
        { cmd: 'http {\n    limit_req_zone  $binary_remote_addr zone=req_one:10m rate=10r/s;\n    limit_conn_zone $binary_remote_addr zone=conn_one:10m;\n    limit_req_status  429;\n    limit_conn_status 503;\n\n    server {\n        listen 80;\n        server_name web.example.com;\n\n        location /api/ {\n            limit_req  zone=req_one burst=20 nodelay;\n            limit_conn conn_one 10;\n            proxy_pass http://app_backend;\n        }\n\n        location / {\n            limit_req zone=req_one burst=5;\n            proxy_pass http://app_backend;\n        }\n    }\n}', desc: 'zone 放在 `http` 块、规则放在 `location` 块：接口放开突发，首页收紧并排队；改完先 `nginx -t` 再 `nginx -s reload`' },
        { cmd: 'for i in $(seq 1 50); do curl -s -o /dev/null -w "%{http_code}\\n" http://web.example.com/api/user; done | sort | uniq -c', desc: '压一把看限流是否生效：正常返回 200，被限的返回 429' },
        { cmd: 'tail -f /var/log/nginx/error.log', desc: '被限流的请求会记 `limiting requests, excess: ... by zone "req_one"` 或 `limiting connections by zone "conn_one"`' }
      ],
      notes: [
        '**默认返回 503 而不是 429**：触发限流时 Nginx 回 503，很容易被误判成后端故障并触发告警；显式写 `limit_req_status 429` 把两者区分开',
        '`rate=10r/s` 是**每秒**，写成 `10r/m` 才是每分钟；`burst=20 nodelay` 表示瞬时可以有 20 个请求立刻被处理，压测时容易误以为限流没生效',
        '`limit_req_zone` 必须在 `http` 块定义，写在 `server` 或 `location` 里会报 `directive is not allowed here`',
        '`$binary_remote_addr` 只占 4 字节（IPv4），`$remote_addr` 要 7~15 字节，同样内存能存的 IP 数差一倍；按 `10m` 约 16 万个 IP 估算',
        '前面还有 ELB/CDN 时 `$binary_remote_addr` 拿到的是 ELB 的 IP，会把所有用户限成"一家人"，此时要用 `$http_x_forwarded_for` 的**第一段**建 zone（先用 `map` 清洗），并确认前置代理可信',
        '`limit_conn` 限制的是**并发连接数**，HTTP/2 或长轮询下一个客户端也会占多个连接，阈值要给够'
      ],
      related: ['mw-nginx-log', 'mw-nginx-proxy-pass', 'mw-nginx-test', 'lt-nginx-status'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_limit_req_module.html',
      tags: ['Nginx', '限流', '429']
    },

    /* ---------- 12 / 30 ---------- */
    {
      id: 'mw-nginx-body-size',
      name: 'client_max_body_size',
      alias: ['nginx 413', 'Request Entity Too Large', '上传大小限制'],
      level: 2,
      syntax: 'client_max_body_size <大小>;   # 可写在 http / server / location 块',
      summary: '限制请求体大小，管住上传接口，超限时直接返回 413 拒绝。',
      desc: '默认值是 `1m`，超过就返回 `413 Request Entity Too Large`，而且**请求体根本没被转发到后端**，后端日志里什么都看不到，这是排查上传失败时最容易走弯路的地方。改大只是第一步，链路上每一层都有自己的限制：外层 Nginx、内层 Nginx、Tomcat 的 `maxPostSize`/`maxSwallowSize`、Spring Boot 的 `spring.servlet.multipart.max-file-size`，任何一层小都会把请求拦下来。',
      params: [
        { flag: 'client_max_body_size 100m', desc: '放在 `location /upload/` 里只放大上传接口，不要全局放开' },
        { flag: 'client_body_buffer_size 128k', desc: '超过这个大小的请求体会先落到 `client_body_temp_path` 临时文件，磁盘要有余量' },
        { flag: 'client_body_temp_path /var/cache/nginx/client_temp', desc: '请求体临时目录；413 与磁盘写满经常一起出现' },
        { flag: 'client_body_timeout 60s', desc: '读取请求体的超时，客户端上传中断会记 408 或 499' },
        { flag: 'client_max_body_size 0', desc: '表示不限制，等于把内存和磁盘交给任意客户端，**生产禁止**' }
      ],
      examples: [
        { cmd: 'location /upload/ {\n    client_max_body_size 100m;\n    client_body_temp_path /var/cache/nginx/client_temp;\n    proxy_pass http://app_backend;\n}', desc: '只给上传接口放大到 100m，改完先 `nginx -t` 再 `nginx -s reload`' },
        { cmd: 'curl -v -F "file=@/tmp/app.jar" http://web.example.com/upload/', desc: '用真实文件复现上传，`-v` 看返回的到底是 413 还是 200' },
        { cmd: 'grep -c " 413 " /var/log/nginx/access.log', desc: '统计 413 次数；error.log 里对应的提示是 `client intended to send too large body`' }
      ],
      notes: [
        '**413 不会出现在后端日志里**：Nginx 读完请求头就按 `Content-Length` 拒绝了，请求体没有转发。先看 Nginx 的 access.log 与 error.log，再去查后端配置',
        '链路上每一层都要放开：外层 Nginx 的 `client_max_body_size`、内层 Nginx（如果有）、Tomcat 的 `maxPostSize`（默认 2MB，只对表单类型生效）与 `maxSwallowSize`（默认 2MB，超了连接会被断开）、Spring Boot 的 `max-file-size`/`max-request-size`',
        'Tomcat 的 `maxSwallowSize` 太小会让 Nginx 看到连接被重置，现象从 413 变成 **502**，很容易误判成后端挂了',
        '云上如果前面还挂了 ELB，七层转发的监听器与转发策略也有请求体限制，要单独确认（四层转发不限制）',
        '别为了省事写 `client_max_body_size 0`，任意客户端都能用超大文件把 Nginx 的临时目录写满，进而拖垮整台机器'
      ],
      related: ['mw-nginx-502-504-499', 'mw-tomcat-serverxml', 'mw-nginx-log', 'mw-nginx-test'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_core_module.html',
      tags: ['Nginx', '上传', '413']
    },

    /* ================= B. Tomcat ================= */

    /* ---------- 13 / 30 ---------- */
    {
      id: 'mw-tomcat-catalina',
      name: 'catalina.sh',
      alias: ['startup.sh', 'shutdown.sh', 'catalina.sh run', 'tomcat 启动脚本'],
      level: 2,
      syntax: 'catalina.sh <run|start|stop|version|configtest>',
      summary: 'Tomcat 的主控制脚本，负责启动、停止与前台运行，容器里必须用 run。',
      desc: '`startup.sh` 与 `shutdown.sh` 只是 `catalina.sh start` / `catalina.sh stop` 的薄包装，最终都调到同一个脚本。`catalina.sh run` 在前台运行并接管标准输出，Docker 里如果写成 `start` 又没有前台进程，容器会起来就退出；`systemd` 的 `Type=simple` 同样必须配 `run`。改完配置先用 `configtest` 校验，再决定是否重启。',
      params: [
        { flag: 'run', desc: '前台启动，日志直接打到标准输出；Docker 与 `systemd Type=simple` 必须用它' },
        { flag: 'start', desc: '后台启动，日志进 `logs/catalina.out`' },
        { flag: 'stop', desc: '通过 `8005` 端口发 SHUTDOWN 指令优雅停止，默认等 5 秒' },
        { flag: 'stop -force', desc: '5 秒没停就按 `CATALINA_PID` 记录的 PID 强杀，**先确认 pid 文件没串实例**' },
        { flag: 'configtest', desc: '解析 `server.xml` 等配置，只校验不启动，报错会给出文件名与行号' },
        { flag: 'version', desc: '打印 Tomcat 版本与 `JAVA_HOME` 对应的 JVM 版本，排"JDK 版本不对"时先跑它' }
      ],
      examples: [
        { cmd: '/opt/tomcat/bin/catalina.sh run', desc: '前台运行、日志直接打屏；Dockerfile 的 `CMD` 或 `systemd` 的 `ExecStart` 用这条' },
        { cmd: '/opt/tomcat/bin/catalina.sh configtest', desc: '改完 `conf/server.xml` 先校验，避免重启失败导致服务起不来' },
        { cmd: 'CATALINA_PID=/opt/tomcat/tomcat.pid /opt/tomcat/bin/catalina.sh start', desc: '指定 pid 文件后再启动，后续 `stop -force` 才能精确杀掉这个实例（多实例机器必配）' }
      ],
      notes: [
        '**容器里用 `start` 会导致容器启动即退出**：`start` 会 fork 到后台，PID 1 的进程一结束容器就结束；Dockerfile 里要写 `CMD ["catalina.sh", "run"]`',
        '`JAVA_OPTS` 会同时传给启动与停止流程，堆参数写在这里会让 `stop` 也去申请一遍内存；只影响运行的参数（`-Xms`/`-Xmx`/`-XX`）应写在 `CATALINA_OPTS`，见 `mw-tomcat-context`',
        '`JAVA_HOME` 没设会报 `Neither the JAVA_HOME nor the JRE_HOME environment variable is defined`；CentOS/RHEL 写 `bin/setenv.sh`，Ubuntu 装包版写 `/etc/default/tomcat9`',
        '没有 `CATALINA_PID` 时 `stop -force` 会拒绝执行，只能靠 `ps -ef | grep tomcat` 手工定位再杀',
        '`shutdown.sh` 依赖 `server.xml` 里 `8005` 端口的 SHUTDOWN 指令；端口被占或指令被禁用时 `stop` 会一直卡住，此时用 `stop 5 -force` 或直接 `kill`',
        '`kill -9` 不会执行 JVM 的 shutdown hook，连接池、临时文件、session 持久化都可能留下脏数据，只在进程真的无响应时使用'
      ],
      related: ['mw-tomcat-serverxml', 'mw-tomcat-context', 'mw-tomcat-log', 'lu-systemctl'],
      docs: 'https://tomcat.apache.org/tomcat-9.0-doc/index.html',
      tags: ['Tomcat', '启动', '容器']
    },

    /* ---------- 14 / 30 ---------- */
    {
      id: 'mw-tomcat-serverxml',
      name: 'conf/server.xml',
      alias: ['tomcat Connector', 'maxThreads', 'acceptCount', 'AJP 8009'],
      level: 3,
      syntax: '<Connector port="8080" protocol="HTTP/1.1" maxThreads="500" acceptCount="200" />',
      summary: '配置 Tomcat 的连接器与线程池，决定它能扛住多少并发请求。',
      desc: '`maxThreads` 是处理请求的工作线程上限，满了以后新请求进 `acceptCount` 队列排队，队列也满客户端就会看到连接被拒或超时。`maxConnections` 是同一时刻接受的连接数上限（NIO 默认 10000），超过后仍然接受连接但不处理。生产上一般用 `<Executor>` 单独定义线程池，再让 Connector 通过 `executor="tomcatThreadPool"` 引用它，这样多个 Connector 可以共享同一个池。',
      params: [
        { flag: 'maxThreads="500"', desc: '工作线程上限，按"每请求 CPU 密集度 × 核数"估算，盲目调大只会加重上下文切换' },
        { flag: 'acceptCount="200"', desc: '线程满了以后的排队长度，超出直接拒绝；它只是让请求多等一会儿' },
        { flag: 'maxConnections="10000"', desc: 'NIO 模式下同时打开的连接数上限，Nginx 的 `keepalive` 会长期占着这些连接' },
        { flag: 'connectionTimeout="20000"', desc: '建连后等待请求行的超时（毫秒）' },
        { flag: 'URIEncoding="UTF-8"', desc: 'URI 解码字符集；老配置里可能是 ISO-8859-1，中文参数会乱码' },
        { flag: 'executor="tomcatThreadPool"', desc: '引用 `<Executor>` 定义的共享线程池；配了它就不要在 Connector 上再写 `maxThreads`' }
      ],
      examples: [
        { cmd: '<Executor name="tomcatThreadPool" namePrefix="catalina-exec-"\n          maxThreads="500" minSpareThreads="50" maxIdleTime="60000"/>\n\n<Connector port="8080" protocol="HTTP/1.1"\n           executor="tomcatThreadPool"\n           connectionTimeout="20000"\n           maxConnections="10000"\n           acceptCount="200"\n           redirectPort="8443"\n           URIEncoding="UTF-8"\n           compression="on"\n           compressionMinSize="2048"\n           compressibleMimeType="text/html,text/xml,text/plain,text/css,text/javascript,application/json"/>', desc: '生产常用写法：共享线程池 + 显式并发参数 + 只压缩文本类型；改完先 `catalina.sh configtest` 再重启' },
        { cmd: 'grep -n -A3 "AJP" /opt/tomcat/conf/server.xml\nss -lntp | grep -E "8080|8009"', desc: '检查是否还留着 AJP 连接器（`8009`），并确认实际监听的端口' },
        { cmd: 'curl -s -o /dev/null -w "%{http_code}\\n" http://10.0.1.31:8080/health', desc: '直连 Tomcat 验证服务正常，与经过 Nginx 的结果对照来区分 502 是谁的问题' }
      ],
      notes: [
        '`maxThreads` 满了之后请求进 `acceptCount` 队列，**队列也满就直接拒绝**，现象是客户端偶发连接超时而不是 502，要和 Nginx 的 502 区分开',
        '`acceptCount` 是**队列长度**不是线程数，调大只是让请求多等一会儿；真正的瓶颈在后端处理速度与数据库连接池',
        '`AJP`（`8009`）是给 Apache httpd 用的老协议，现代前后端分离架构用 Nginx 反代 HTTP 即可，**建议注释掉 AJP Connector**：少一个暴露面，也避开 Ghostcat 这类历史漏洞',
        '改 `server.xml` 必须**重启** Tomcat 才生效，`reloadable="true"` 只影响应用的类重载，不影响 Connector 参数',
        '`compression="on"` 会消耗 CPU，Nginx 层已经开 gzip 时这里就是重复劳动；只压文本类型，别压图片和视频',
        '`redirectPort` 指向 8443，如果 8443 上并没有 HTTPS Connector，`security-constraint` 触发的跳转会把用户带到打不开的端口'
      ],
      related: ['mw-tomcat-catalina', 'mw-tomcat-context', 'mw-tomcat-log', 'mw-nginx-502-504-499'],
      docs: 'https://tomcat.apache.org/tomcat-9.0-doc/config/http.html',
      tags: ['Tomcat', '连接器', '并发']
    },

    /* ---------- 15 / 30 ---------- */
    {
      id: 'mw-tomcat-context',
      name: 'conf/context.xml',
      alias: ['RemoteIpValve', 'tomcat JVM 参数', 'setenv.sh', 'HeapDumpOnOutOfMemoryError'],
      level: 3,
      syntax: '<Context reloadable="false"> ... </Context>   与   CATALINA_OPTS="-Xms2g -Xmx2g ..."',
      summary: '调整会话持久化、真实 IP 还原与 JVM 内存参数，是调优的落脚点。',
      desc: '`<Context reloadable="false">` 关掉类变更自动重载，生产环境开着会持续扫描 `WEB-INF/classes` 白耗 CPU；`<Manager pathname="" />` 关掉 session 持久化到 `SESSIONS.ser`，重启后不会把老会话带回来。`RemoteIpValve` 用来把 Nginx 传来的 `X-Forwarded-For` 还原成 `request.getRemoteAddr()`，否则应用日志里记录的永远是 Nginx 的 IP。JVM 参数写在 `setenv.sh` 的 `CATALINA_OPTS` 里，不要写进 `JAVA_OPTS`。',
      params: [
        { flag: 'reloadable="false"', desc: '生产必须关闭；自动重载会持续扫描类目录，而且重载不释放 Metaspace' },
        { flag: '<Manager pathname="" />', desc: '关闭 session 持久化，重启不再读写 `SESSIONS.ser`' },
        { flag: 'RemoteIpValve', desc: '配 `remoteIpHeader="X-Forwarded-For"` 还原真实客户端 IP' },
        { flag: 'protocolHeader="X-Forwarded-Proto"', desc: '告诉 Tomcat 原始协议，`request.getScheme()` 才会是 https' },
        { flag: '-Xms2g -Xmx2g', desc: '堆初始值与最大值设成相等，避免运行期反复扩缩容引起 Full GC' },
        { flag: '-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/heapdump', desc: 'OOM 时自动 dump 堆，事后才有得查；目录要先建好并留足空间' }
      ],
      examples: [
        { cmd: '<Context reloadable="false">\n    <Manager pathname="" />\n    <Valve className="org.apache.catalina.valves.RemoteIpValve"\n           remoteIpHeader="X-Forwarded-For"\n           protocolHeader="X-Forwarded-Proto"\n           internalProxies="10\\.0\\.1\\.\\d+" />\n</Context>', desc: '关掉自动重载与会话持久化，并让 Tomcat 从 `X-Forwarded-For` 还原真实客户端 IP' },
        { cmd: 'export CATALINA_OPTS="-Xms2g -Xmx2g -XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m"\nexport CATALINA_OPTS="$CATALINA_OPTS -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/heapdump"\nexport CATALINA_OPTS="$CATALINA_OPTS -Duser.timezone=Asia/Shanghai -Dfile.encoding=UTF-8"', desc: '写到 `$CATALINA_HOME/bin/setenv.sh`（Ubuntu 装包版写 `/etc/default/tomcat9`），堆大小按机器内存的一半以内规划' },
        { cmd: 'mkdir -p /data/heapdump && chown tomcat:tomcat /data/heapdump && grep -n "CATALINA_OPTS" /opt/tomcat/bin/setenv.sh', desc: '提前建好 dump 目录并确认参数已生效；等 OOM 了再补目录就来不及了' }
      ],
      notes: [
        '`-Xms` 与 `-Xmx` **设成相等**可以避免堆在运行期反复扩缩容；容器里 JVM 会按宿主机内存而不是 limit 算默认堆，不显式指定迟早被 OOMKilled',
        '`HeapDumpPath` 指向的目录**必须先建好并且有写权限**，否则 OOM 那一刻 dump 写不进去等于白配；dump 文件大小约等于堆大小，`/data` 要留够空间',
        '`RemoteIpValve` 不配时应用拿到的 `getRemoteAddr()` 是 Nginx 的 IP，风控、限流、审计全部失真；`internalProxies` 只写可信代理网段，写宽了等于允许客户端伪造',
        '`<Manager pathname="" />` 关掉持久化后重启 Tomcat 所有用户都要重新登录，这是**有意的取舍**：换来的是不会读到上一次运行留下的脏会话',
        '`-Duser.timezone=Asia/Shanghai` 防止容器（UTC）里时间戳差 8 小时，`-Dfile.encoding=UTF-8` 防止中文文件名与参数乱码',
        '`-XX:MetaspaceSize` 是触发第一次 Metaspace GC 的阈值而不是上限；不设时默认约 21MB，启动期会多几次 Full GC，通常从 256m 起设'
      ],
      related: ['mw-tomcat-catalina', 'mw-tomcat-serverxml', 'mw-tomcat-log', 'mw-nginx-proxy-pass'],
      docs: 'https://tomcat.apache.org/tomcat-9.0-doc/config/valve.html',
      tags: ['Tomcat', 'JVM', '真实IP']
    },

    /* ---------- 16 / 30 ---------- */
    {
      id: 'mw-tomcat-log',
      name: 'catalina.out 与 AccessLogValve',
      kind: 'recipe',
      alias: ['tomcat 日志', 'logging.properties', 'AccessLogValve', 'catalina.out 切割'],
      level: 2,
      syntax: 'tail -f $CATALINA_HOME/logs/catalina.out   与   <Valve className="org.apache.catalina.valves.AccessLogValve" ... />',
      summary: '分清 Tomcat 的几类日志文件并开启访问日志，让排障有据可查。',
      desc: '`catalina.out` 是 Tomcat 的标准输出与标准错误，**不会自动切割**，跑几个月能涨到几十 GB，必须自己配 `logrotate`；`catalina.<日期>.log` 是 JULI 按天滚动的容器日志，`localhost.<日期>.log` 记录应用初始化异常，`localhost_access_log.<日期>.txt` 才是访问日志。日志级别与格式由 `conf/logging.properties` 控制，排障时临时把 `org.apache.catalina` 调成 `FINE`，查完记得改回来。',
      params: [
        { flag: 'logs/catalina.out', desc: '标准输出汇总，**不会自动切割**，是磁盘被写满的头号嫌疑人' },
        { flag: 'logs/catalina.<日期>.log', desc: '容器级日志，按天滚动，保留份数由 `logging.properties` 的 `maxDays` 决定' },
        { flag: 'logs/localhost.<日期>.log', desc: '应用启动失败、`ContextLoaderListener` 抛异常都在这里' },
        { flag: 'conf/logging.properties', desc: 'JULI 的级别与 Handler 配置，默认 `INFO`，临时排障可调到 `FINE`' },
        { flag: 'pattern="%h %l %u %t \'%r\' %s %b %D"', desc: '访问日志格式；`%D` 是毫秒耗时，`%{X-Forwarded-For}i` 取真实客户端 IP' },
        { flag: 'directory="logs" prefix="localhost_access_log" suffix=".txt" rotatable="true"', desc: 'AccessLogValve 的输出位置与滚动方式' }
      ],
      examples: [
        { cmd: '<Valve className="org.apache.catalina.valves.AccessLogValve"\n       directory="logs"\n       prefix="localhost_access_log" suffix=".txt"\n       pattern="%h %l %u %t &quot;%r&quot; %s %b %D %{X-Forwarded-For}i"\n       rotatable="true" />', desc: '加在 `conf/server.xml` 的 `<Host>` 里开启访问日志，`%D` 是毫秒耗时、`%{X-Forwarded-For}i` 是真实客户端 IP' },
        { cmd: 'tail -f /opt/tomcat/logs/catalina.out', desc: '实时看应用输出；容器里改用 `docker logs -f <容器名>`，日志直接进标准输出' },
        { cmd: 'ls -lh /opt/tomcat/logs/ && du -sh /opt/tomcat/logs/', desc: '定期检查日志目录大小，`catalina.out` 异常膨胀通常伴随刷屏的异常堆栈' }
      ],
      notes: [
        '**`catalina.out` 不会自动切割**：Tomcat 自带的 JULI 只滚动 `catalina.<日期>.log`，`catalina.out` 由 `catalina.sh` 的 `>>` 重定向产生，必须自己配 `logrotate`',
        '`logrotate` 切 `catalina.out` 用 `copytruncate` 时 Tomcat 仍持有原文件句柄，写入会继续落到被截断的文件上；写量大时中间可能丢日志，宁可安排在低峰期重启',
        '`catalina.out` 涨到几十 GB 时 `tail`/`grep` 都极慢，用 `tail -n 5000` 或 `grep -n "OutOfMemoryError" catalina.out | tail` 缩小范围，别直接 `cat`',
        '`AccessLogValve` 默认是关闭的，很多人以为"Tomcat 没有访问日志"是故障，其实是没开；开了以后要确认 `rotatable="true"` 并安排清理',
        '应用日志框架（Logback/Log4j2）自己也会写文件，`logging.properties` 只管 Tomcat 自身与 `java.util.logging` 的输出，两套不要混着找',
        '`%D` 是毫秒耗时，和 Nginx 的 `$request_time`（秒）对比，能快速判断慢在 Tomcat 还是慢在链路上'
      ],
      related: ['mw-tomcat-context', 'mw-tomcat-serverxml', 'mw-nginx-log', 'dk-logs'],
      docs: 'https://tomcat.apache.org/tomcat-9.0-doc/logging.html',
      tags: ['Tomcat', '日志', '切割']
    },

    /* ================= C. HAProxy ================= */

    /* ---------- 17 / 30 ---------- */
    {
      id: 'mw-haproxy-check',
      name: 'haproxy -c',
      alias: ['haproxy 配置检查', 'haproxy -f', 'systemctl reload haproxy'],
      level: 2,
      syntax: 'haproxy -c -f <配置文件> [-V] [-W] [-p <pidfile>]',
      summary: '启动前校验 HAProxy 配置，避免改错一行把负载均衡整个带下线。',
      desc: '`-c` 只解析配置做语法与语义检查，不监听端口、不接管流量，任何改动都应该先跑一遍。HAProxy 的 reload 是新起一个进程、把监听 socket 交给它、再停掉老进程，所以 `systemctl reload haproxy` 依赖配置里的 `-W`（master-worker 模式）才能真正做到不断连接；手工平滑重启时 `-sf` 传老进程 PID 让它优雅退出，`-st` 则是硬停。',
      params: [
        { flag: '-c', desc: '只检查配置不启动；有问题会指出文件、行号与原因' },
        { flag: '-f <文件>', desc: '指定配置文件，可写多次加载多个片段（`-f a.cfg -f b.cfg`）' },
        { flag: '-V', desc: '校验同时打印版本与加载的配置内容，debug 时常用' },
        { flag: '-d', desc: '前台 debug 模式运行，日志直接打屏，排查启动失败最直观' },
        { flag: '-sf <PID>', desc: '新进程起来后让这些老进程优雅退出，实现平滑重启' },
        { flag: '-W', desc: 'master-worker 模式，`systemctl reload` 与多进程管理的前提' }
      ],
      examples: [
        { cmd: 'haproxy -c -f /etc/haproxy/haproxy.cfg', desc: '改完配置必跑：输出 `Configuration file is valid` 才算通过' },
        { cmd: 'haproxy -c -f /etc/haproxy/haproxy.cfg -V', desc: '校验的同时打印版本与加载的配置内容，确认改的片段真的被读到了' },
        { cmd: 'systemctl reload haproxy && systemctl status haproxy --no-pager', desc: '平滑重载（依赖 `-W` master-worker 模式），随后确认 Active 状态与日志没有报错' }
      ],
      notes: [
        '**`-c` 通过不代表服务能用**：后端 IP 与端口是否可达、证书文件能否读取、`stats socket` 目录权限，都不在校验范围内',
        '`systemctl reload haproxy` 在**没有 `-W`** 的配置下等价于重启，会造成连接瞬断；要不断连接必须在 `global` 段写 `master-worker` 或启动参数里加 `-W`',
        '校验时 `-f` 指定的文件必须与 `systemd` 单元里 `ExecStart` 用的一致；拿 `/etc/haproxy/haproxy.cfg` 校验、实际加载 `/etc/haproxy/conf.d/*.cfg` 是常见乌龙',
        '`-sf` 与 `-st` 的区别要记牢：`-sf` 是优雅停止（处理完存量连接），`-st` 是立刻终止，脚本里写错会把在线用户直接踢掉',
        'HAProxy 2.x 的报错会给出精确行号，例如 `[ALERT] ... : parsing [/etc/haproxy/haproxy.cfg:42]`，直接跳过去看那一行'
      ],
      related: ['mw-haproxy-config', 'mw-haproxy-stats', 'lu-systemctl', 'mw-nginx-upstream'],
      docs: 'https://docs.haproxy.org/2.8/management.html',
      tags: ['HAProxy', '配置', '校验']
    },

    /* ---------- 18 / 30 ---------- */
    {
      id: 'mw-haproxy-config',
      name: 'haproxy.cfg',
      alias: ['haproxy frontend backend', 'option httpchk', 'haproxy 负载均衡配置'],
      level: 3,
      syntax: 'frontend <名称> / backend <名称> / listen <名称> 三段式配置',
      summary: '按 frontend、backend 分段定义入口与后端，并配好健康检查。',
      desc: '`frontend` 负责监听端口并决定把请求交给哪个 `backend`（靠 `acl` + `use_backend` 或 `default_backend`），`backend` 定义一组 `server` 与调度算法，`listen` 是两者的合并写法，统计页与简单转发常用它。HAProxy 的健康检查是**主动探测**：`option httpchk GET /health` 会按 `inter` 间隔主动请求每个后端，配合 `rise`/`fall` 决定上下线，这一点比开源 Nginx 的被动摘除可靠得多。',
      params: [
        { flag: 'mode http', desc: '七层模式，可做基于路径与域名的路由；纯四层转发用 `mode tcp`' },
        { flag: 'balance roundrobin', desc: '调度算法；还可选 `leastconn`、`source`（按源 IP）' },
        { flag: 'option httpchk GET /health', desc: '主动健康检查发起的请求，等价于定时去 curl 后端健康接口' },
        { flag: 'http-check expect status 200', desc: '只有返回 200 才算健康；不配的话 404、500 也会被当成健康' },
        { flag: 'server web1 10.0.1.31:8080 check inter 2s rise 2 fall 3 weight 100', desc: '后端定义：`check` 开健康检查，`fall 3` 连续 3 次失败下线、`rise 2` 连续 2 次成功上线' },
        { flag: 'timeout connect/client/server', desc: '三段超时都要写，在 `defaults` 段里配全，缺一个都启动不了' }
      ],
      examples: [
        { cmd: 'global\n    log /dev/log local0 info\n    maxconn 20000\n    daemon\n\ndefaults\n    log     global\n    mode    http\n    option  httplog\n    option  dontlognull\n    timeout connect 5s\n    timeout client  30s\n    timeout server  30s\n\nfrontend web_front\n    bind *:80\n    acl is_api path_beg /api/\n    use_backend app_backend if is_api\n    default_backend app_backend\n\nbackend app_backend\n    balance roundrobin\n    option httpchk GET /health\n    http-check expect status 200\n    server web1 10.0.1.31:8080 check inter 2s rise 2 fall 3 weight 100\n    server web2 10.0.1.32:8080 check inter 2s rise 2 fall 3 weight 100', desc: '最小可用配置：入口收 80、按路径选后端、主动探测 `/health`；改完先 `haproxy -c -f /etc/haproxy/haproxy.cfg`' },
        { cmd: 'systemctl reload haproxy', desc: '校验通过后平滑重载，需要 `-W` master-worker 模式，见 `mw-haproxy-check`' },
        { cmd: 'listen stats\n    bind *:8404\n    mode http\n    stats enable\n    stats uri /stats\n    stats refresh 10s\n    stats auth admin:Adm1n_2024', desc: '用 `listen` 挂一个统计页；`stats auth` 必须改掉默认口令且只在内网开放，更推荐 socket 方案，见 `mw-haproxy-stats`' }
      ],
      notes: [
        '`defaults` 段里的 `timeout connect`/`timeout client`/`timeout server` **一个都不能少**，缺任何一个 HAProxy 都会拒绝启动并报 `missing timeouts`',
        '只写 `option httpchk` 时**任何 HTTP 响应都算健康**（包括 404 和 500），一定要配 `http-check expect status 200` 才是真的探活',
        '`inter`/`rise`/`fall` 要配套看：`inter 2s` 配 `fall 3` 意味着后端挂掉后最多 6 秒才被摘除，这几秒内的请求仍会失败',
        '`stats` 页即使只在内网也可能被扫到，`stats auth` 的默认口令必须换掉；更稳妥的做法是只留 `stats socket` 不开放 HTTP 端口',
        '不做 SSL 卸载时用 `mode tcp` 透传即可；要卸载证书用 `bind *:443 ssl crt /etc/haproxy/certs/web.example.com.pem`，证书文件必须是证书与私钥拼接的 PEM',
        '`balance source` 会在客户端走 NAT 时把大量用户哈希到同一台后端，会话保持更推荐后端统一用 Redis 做'
      ],
      related: ['mw-haproxy-check', 'mw-haproxy-stats', 'mw-nginx-upstream', 'mw-keepalive-conf'],
      docs: 'https://docs.haproxy.org/2.8/configuration.html',
      tags: ['HAProxy', '负载均衡', '健康检查']
    },

    /* ---------- 19 / 30 ---------- */
    {
      id: 'mw-haproxy-stats',
      name: 'stats socket',
      alias: ['haproxy socat', 'show stat', 'haproxy 运行时状态', 'disable server'],
      level: 3,
      syntax: 'echo "show stat" | socat stdio /var/run/haproxy.sock',
      summary: '通过运行时 socket 查看后端状态并在线摘除或恢复某台服务器。',
      desc: '在 `global` 段配好 `stats socket` 后，就能用 `socat` 连上去执行运行时命令：`show stat` 看每个后端的连接数与错误计数，`show info` 看进程与连接总量，`show servers state` 看运维状态，`disable server`/`enable server` 在线把某台摘掉或放回。这套接口是排查"后端没挂但流量不均""某台一直连接被拒"最快的入口，也是做灰度下线的正规手段。',
      params: [
        { flag: 'stats socket /var/run/haproxy.sock mode 660 level admin', desc: '定义 socket 路径与权限；`level admin` 才能执行 `disable server` 这类写操作' },
        { flag: 'show stat', desc: '所有 frontend/backend/server 的统计表，重点看 `status`、`check_status`、`scur`、`ereq`、`econ`' },
        { flag: 'show info', desc: '进程信息：版本、`nbthread`、`CurrConns`、`MaxConn`、`CumConns` 总量' },
        { flag: 'show servers state', desc: '各服务器的运维状态：`srv_op_state`、`srv_admin_state`、`srv_check_status`' },
        { flag: 'disable server <backend>/<server>', desc: '在线摘除某台后端，存量连接处理完后不再接新流量' },
        { flag: 'set server <backend>/<server> state maint', desc: '直接置为维护态，配合发布流程使用' }
      ],
      examples: [
        { cmd: 'echo "show stat" | socat stdio /var/run/haproxy.sock\necho "show info" | socat stdio /var/run/haproxy.sock\necho "show servers state" | socat stdio /var/run/haproxy.sock', desc: '先看状态：`show stat` 是 CSV 格式，重点看每个 server 的 `status` 与 `check_status` 列' },
        { cmd: 'echo "show stat" | socat stdio /var/run/haproxy.sock | cut -d, -f1,2,18,19,20\necho "disable server app_backend/web1" | socat stdio /var/run/haproxy.sock', desc: '摘掉 `app_backend` 下的 `web1` 做维护，发布完成后用 `enable server` 放回去' },
        { cmd: 'yum install -y socat || apt install -y socat', desc: '`socat` 默认不装：CentOS/RHEL 用 `yum install -y socat`，Ubuntu/Debian 用 `apt install -y socat`' }
      ],
      notes: [
        '`stats socket` 的 `level` 默认是 `user`，**不写 `level admin` 就执行不了 `disable server`**，会返回 `Permission denied`',
        '`socat` 不是系统自带：CentOS 需要 `yum install -y socat`，Ubuntu 需要 `apt install -y socat`；没有 socat 时可用 `nc -U /var/run/haproxy.sock` 临时顶替',
        'socket 文件的属主与 `mode 660` 要配好，通常设成 `haproxy:haproxy`；权限给太宽等于把"下线任意后端"的能力开放出去',
        '`show stat` 输出是 CSV，按列号 `cut` 最省事；但升级 HAProxy 大版本时列顺序可能变化，脚本里建议按表头定位而不是写死列号',
        '`disable server` 只是不再往里发新请求，**不会断开已建立的连接**；要彻底摘干净得等 `scur`（当前会话数）归零',
        'HAProxy 2.x 还支持 `show cli level`、`show errors` 等命令；容器化部署时把 socket 挂到宿主机上排查会方便很多'
      ],
      related: ['mw-haproxy-check', 'mw-haproxy-config', 'ln-ss', 'dk-exec'],
      docs: 'https://docs.haproxy.org/2.8/management.html',
      tags: ['HAProxy', '运行时', 'socat']
    },

    /* ================= D. Keepalived ================= */

    /* ---------- 20 / 30 ---------- */
    {
      id: 'mw-keepalive-conf',
      name: 'keepalived.conf vrrp_instance',
      alias: ['keepalived 配置', 'vrrp_instance', 'virtual_ipaddress', 'keepalived 双机热备'],
      level: 3,
      syntax: 'vrrp_instance <实例名> { state <MASTER|BACKUP>; interface <网卡>; virtual_router_id <1-255>; priority <1-254>; virtual_ipaddress { <VIP/掩码> }; }',
      summary: '配置 VRRP 实例与虚拟 IP，实现主备双机自动接管对外服务。',
      desc: '两台机器用同一个 `virtual_router_id` 组成一个 VRRP 组，`priority` 大的当 MASTER 持有 VIP 并周期性发通告，BACKUP 在默认 `advert_int` 的 3 倍时间内收不到通告就抢占成为新 MASTER。`track_script` 让本机健康状况参与选举：脚本返回非 0 时按 `weight` 调整优先级，从而做到"Nginx 挂了就把 VIP 让出去"。`nopreempt` 让节点恢复后不主动抢回，避免 VIP 来回漂移。',
      params: [
        { flag: 'interface eth0', desc: '绑定 VIP 的网卡；**写错网卡名 Keepalived 直接起不来**，云主机常见 ens160、ens3' },
        { flag: 'virtual_router_id 51', desc: 'VRRP 组编号（1~255），同一广播域内必须唯一，冲突会导致两组互抢 VIP' },
        { flag: 'priority 100', desc: '优先级（1~254），数值大的当 MASTER；两台写相同值会打成双主' },
        { flag: 'virtual_ipaddress { 192.168.1.100/24 dev eth0 label eth0:1 }', desc: '对外提供服务的 VIP，可写多个；`label` 是网卡别名' },
        { flag: 'track_script { chk_nginx }', desc: '引用 `vrrp_script` 定义的健康检查，脚本失败时按 `weight` 调整优先级' },
        { flag: 'authentication { auth_type PASS; auth_pass Vrrp2024 }', desc: '同一 VRRP 组内密码必须一致且不超过 8 个字符，不一致会互相忽略通告' }
      ],
      examples: [
        { cmd: 'global_defs {\n    router_id nginx-ha-01\n}\n\nvrrp_script chk_nginx {\n    script "/usr/bin/killall -0 nginx"\n    interval 2\n    weight -20\n    fall 3\n    rise 2\n}\n\nvrrp_instance VI_1 {\n    state MASTER\n    interface eth0\n    virtual_router_id 51\n    priority 100\n    advert_int 1\n    authentication {\n        auth_type PASS\n        auth_pass Vrrp2024\n    }\n    virtual_ipaddress {\n        192.168.1.100/24 dev eth0 label eth0:1\n    }\n    track_script {\n        chk_nginx\n    }\n}', desc: 'MASTER 节点（`192.168.1.101`）的完整配置；BACKUP 节点（`192.168.1.102`）只改 `router_id`、`state BACKUP`、`priority 90`，其余保持一致' },
        { cmd: 'systemctl restart keepalived && systemctl status keepalived --no-pager', desc: '改完配置重启并确认状态；配置语法错会直接起不来，用 `journalctl -u keepalived -n 50` 看原因' },
        { cmd: 'ip addr show eth0 | grep -w 192.168.1.100', desc: '确认本机是否持有 VIP，输出为空说明当前是 BACKUP 角色' }
      ],
      notes: [
        '`interface` 写错网卡名（云主机常见是 `eth0`、`ens160`、`ens3`）Keepalived 会**直接启动失败**，先用 `ip -br addr` 确认真实网卡名',
        '同一 VLAN/广播域里两组 Keepalived 用了**相同的 `virtual_router_id`**（模板默认常写 51）会互相抢 VIP，表现为 VIP 在两个集群之间乱跳，改成不同值即可',
        '两台 `priority` 相同会打成**双主**，两台同时持有 VIP，客户端流量随机落到两边；主备要明确区分（100 与 90）',
        '`auth_pass` 最多 8 个字符，且两端必须完全一致；不一致时对端通告会被静默丢弃，现象就是"怎么都不切换"',
        '`nopreempt` 只能配合 `state BACKUP` 使用（老版本限制），作用是原 MASTER 恢复后不抢回 VIP，适合切换代价大、宁可手工切回的场景',
        '`track_script` 的脚本要能快速返回且**不要有副作用**：脚本卡住或返回码混乱会让节点反复上下线，优先级抖动直接引起 VIP 漂移',
        '华为云等 VPC 默认**不转发 VRRP 多播**，标准 `keepalived.conf` 在云上根本漂移不了；要么改成 `unicast_peer` 单播，要么直接用云平台的虚拟 IP/ELB 方案'
      ],
      related: ['mw-keepalive-vip', 'mw-keepalive-tcpdump', 'mw-keepalive-troubleshoot', 'mw-nginx-signal'],
      docs: 'https://www.keepalived.org/documentation/keepalived-conf/',
      tags: ['Keepalived', 'VRRP', '高可用']
    },

    /* ---------- 21 / 30 ---------- */
    {
      id: 'mw-keepalive-vip',
      name: 'ip addr show',
      alias: ['keepalived VIP 漂移', '查看虚拟 IP', 'VIP 在哪台'],
      level: 2,
      syntax: 'ip addr show <网卡> | grep -w <VIP>',
      summary: '确认虚拟 IP 当前落在哪台机器上，是验证主备切换是否成功的直接证据。',
      desc: 'VIP 不是配置出来的静态地址，而是 Keepalived 成为 MASTER 时用 `ip addr add` 动态加到网卡上的，所以 `ip addr show eth0` 的输出里会多出一行 `192.168.1.100/24`（通常还带 `label eth0:1` 的别名）。切换时旧 MASTER 先撤销地址、新 MASTER 再添加，中间有几秒不可用。观察迁移过程除了看地址，还要配合 `journalctl -u keepalived -f` 看 `Entering MASTER STATE`/`Entering BACKUP STATE` 日志。',
      params: [
        { flag: 'ip addr show eth0', desc: '看指定网卡的全部地址，VIP 会以 secondary 形式出现在这里' },
        { flag: 'ip -4 addr show', desc: '只看 IPv4，输出更干净，适合快速扫一眼' },
        { flag: 'ip -br addr', desc: '一行一个接口的简表，确认网卡名最快' },
        { flag: 'grep -w 192.168.1.100', desc: '精确匹配 VIP，避免匹配到前缀相同的其他地址' },
        { flag: 'journalctl -u keepalived -f', desc: '实时跟踪状态迁移与 VRRP 通告日志' },
        { flag: 'systemctl status keepalived', desc: '看进程是否在跑、最近有没有异常重启' }
      ],
      examples: [
        { cmd: 'ip addr show eth0\nip addr show eth0 | grep -w 192.168.1.100\nip -4 addr show | grep inet', desc: '三连看：先在地址列表里找 VIP，再精确匹配确认，最后看全部 IPv4 地址' },
        { cmd: 'journalctl -u keepalived -f', desc: '实时盯状态迁移；CentOS/RHEL 也可看 `/var/log/messages`，Ubuntu/Debian 看 `/var/log/syslog`' },
        { cmd: 'systemctl status keepalived --no-pager', desc: '确认进程存活与最近一次重启时间，`Active: active (running)` 才说明守护进程正常' }
      ],
      notes: [
        '`ip addr` 里 VIP 显示时**带掩码**（`192.168.1.100/24`），`grep -w` 能匹配是因为它把 `/` 当分隔符；不带 `-w` 容易误匹配',
        '两台同时出现 VIP 就是**双主**，说明 `priority` 相同或通告收不到；此时 ARP 冲突会让部分客户端访问异常，要立刻处理',
        '`ifconfig` 在老系统上也能看到 VIP，但新发行版默认不装 `net-tools`，统一用 `ip addr` 更稳',
        '切换后客户端仍访问不通，多半是**上游交换机或路由器的 ARP 缓存**没更新；VRRP 会发免费 ARP 刷新，若被安全策略拦掉就要抓包确认',
        '极端情况下 Keepalived 被 `kill -9` 后 VIP 可能残留在网卡上，需要手工 `ip addr del 192.168.1.100/24 dev eth0` 清理'
      ],
      related: ['mw-keepalive-conf', 'mw-keepalive-tcpdump', 'mw-keepalive-troubleshoot', 'ln-ip-addr'],
      docs: 'https://www.keepalived.org/documentation/keepalived-conf/',
      tags: ['Keepalived', 'VIP', '漂移']
    },

    /* ---------- 22 / 30 ---------- */
    {
      id: 'mw-keepalive-tcpdump',
      name: 'tcpdump vrrp',
      alias: ['抓 VRRP 包', 'keepalived 抓包', 'vrrp 多播 224.0.0.18'],
      level: 3,
      syntax: 'tcpdump -i <网卡> -nn [-vv] [-e] [-c <数量>] vrrp',
      summary: '抓取 VRRP 通告包，判断备机到底有没有收到主机的通告。',
      desc: 'VRRP 是独立的 IP 协议（协议号 **112**），既不是 TCP 也不是 UDP，所以不能用 `port 112` 过滤，`tcpdump` 里直接写 `vrrp` 关键字即可。MASTER 默认每 1 秒向多播地址 `224.0.0.18` 发一个通告，加 `-vv` 能看到报文里的 `vrid` 与 `priority`，这两个字段正是判断"为什么没切换"的关键。在 BACKUP 上抓不到任何通告，说明多播在链路上被挡了，或者对端根本没起来。',
      params: [
        { flag: '-i eth0', desc: '指定网卡；不确定网卡名先用 `ip -br addr` 确认' },
        { flag: '-nn', desc: '不做端口与主机名解析，输出更干净也更快' },
        { flag: '-e', desc: '打印二层 MAC 头，能看到 VRRP 的组播目的 MAC `01:00:5e:00:00:12`' },
        { flag: '-vv', desc: '详细模式，展开 VRRP 报文体里的 `vrid`、`priority`、`adver_int`' },
        { flag: '-c 20', desc: '抓够 20 个包自动停止，避免一直刷屏' },
        { flag: 'vrrp', desc: '过滤表达式，等价于 `ip proto 112`，两种写法都能用' }
      ],
      examples: [
        { cmd: 'tcpdump -i eth0 -nn vrrp', desc: '最常用的一条：在 BACKUP 节点上执行，能持续看到通告就说明多播通了' },
        { cmd: 'tcpdump -i any -nn -e -c 20 vrrp', desc: '所有网卡抓 20 个包并打印 MAC 头，先确认通告从哪个网卡进来' },
        { cmd: 'tcpdump -i eth0 -nn -vv vrrp', desc: '展开报文体，核对 `vrid` 与 `priority` 是否与配置一致、两台是否配成了同一个 vrid' }
      ],
      notes: [
        '**VRRP 没有端口**：它是 IP 协议号 112，写 `tcpdump port 112` 什么也抓不到，必须用 `vrrp` 或 `ip proto 112`',
        '抓包需要 root 权限（或 `CAP_NET_RAW`）；容器里要加 `--cap-add=NET_RAW`，更省事的做法是在宿主机上抓',
        'BACKUP 上完全抓不到通告有三种常见原因：**防火墙挡了多播**、**交换机或云 VPC 不转发 VRRP 多播**（华为云等环境默认如此）、**对端 Keepalived 没起来**',
        '看到两台都在发通告且 `priority` 相同，就是**双主**的现场证据，按 `mw-keepalive-troubleshoot` 的顺序处理',
        '`-i any` 在部分内核上抓不到 VRRP 这类链路层多播，指定具体网卡名更可靠',
        '生产上抓包要限包数或限时间（`-c 20`、`timeout 10 tcpdump -i eth0 -nn vrrp`），忘了按 `Ctrl+C` 容易把磁盘写满'
      ],
      related: ['mw-keepalive-troubleshoot', 'mw-keepalive-vip', 'mw-keepalive-conf', 'ln-tcpdump'],
      docs: 'https://www.tcpdump.org/manpages/tcpdump.1.html',
      tags: ['Keepalived', 'tcpdump', 'VRRP']
    },

    /* ---------- 23 / 30 ---------- */
    {
      id: 'mw-keepalive-troubleshoot',
      name: 'VIP 漂移失败排查',
      kind: 'recipe',
      alias: ['keepalived 不切换', 'VIP 不漂移', 'keepalived 双主', 'VRRP 排错'],
      level: 4,
      syntax: 'systemctl status keepalived → tcpdump 抓 vrrp → 查防火墙 → 核对 vrid 与 priority → 确认云环境多播策略',
      summary: '按从进程到链路的顺序排查 VIP 不漂移，最快定位多播被挡或双主。',
      desc: 'VIP 漂移失败的原因集中在四类：**Keepalived 根本没起来**（配置语法错、网卡名写错）、**通告收不到**（防火墙挡多播、云 VPC 不转发 VRRP、交换机限制）、**选举参数错**（`virtual_router_id` 冲突、`priority` 相同导致双主）、**健康检查误判**（`track_script` 脚本返回非 0 把自己降级）。排查要按"进程 → 通告 → 防火墙 → 参数 → 环境"的顺序走，先确认现象到底是压根没切、切了又切回来、还是两台都有 VIP，再动手改配置。',
      params: [
        { flag: 'systemctl status keepalived', desc: '第一步看进程是否在跑、有没有反复重启' },
        { flag: 'tcpdump -i eth0 -nn vrrp', desc: '第二步在 BACKUP 上抓通告，抓不到就是链路问题' },
        { flag: 'firewall-cmd --add-protocol=vrrp --permanent', desc: '放行 VRRP（IP 协议 112），加完要执行 `--reload` 生效' },
        { flag: 'virtual_router_id', desc: '同一广播域内必须唯一，冲突会让两组 Keepalived 互相抢 VIP' },
        { flag: 'priority', desc: '数值大的当 MASTER；两台相同会打成双主，必须区别开' },
        { flag: 'unicast_peer', desc: '云环境不支持 VRRP 多播时的替代方案，改成指定单播对等体' }
      ],
      examples: [
        { cmd: 'systemctl status keepalived --no-pager\njournalctl -u keepalived -n 50 --no-pager\ntcpdump -i eth0 -nn vrrp', desc: '① 看进程与报错，② 在 BACKUP 上抓通告；日志里出现 `Unable to access interface` 就是网卡名写错了' },
        { cmd: 'firewall-cmd --add-protocol=vrrp --permanent && firewall-cmd --reload\niptables -I INPUT -p vrrp -j ACCEPT\nufw status verbose', desc: '③ 按发行版选一条执行：CentOS 7/8 用 `firewall-cmd` 放行 VRRP 协议，老环境或 Ubuntu 用 `iptables`；Ubuntu 先确认 ufw 是否开着' },
        { cmd: 'ip addr show eth0\nip -4 addr show | grep inet\ntcpdump -i eth0 -nn arp', desc: '⑧ 确认 VIP 落在哪台、有没有双主；两台都持有 VIP 时用 `tcpdump` 抓 ARP 观察冲突' }
      ],
      notes: [
        '**① 看进程**：`systemctl status keepalived --no-pager` 与 `journalctl -u keepalived -n 50`。配置语法错、`interface eth0` 网卡名写错（云主机可能是 `ens160`/`ens3`）会让它在启动阶段就退出，日志里会有 `Unable to access interface` 或 `Invalid config`。',
        '**② 确认 BACKUP 收得到通告**：在备机执行 `tcpdump -i eth0 -nn vrrp`。MASTER 默认每秒发一个，看不到任何包说明通告没到，继续第 ③ 步；能看到包则跳到第 ④ 步查参数。',
        '**③ 防火墙放行 VRRP**：`firewall-cmd --add-protocol=vrrp --permanent && firewall-cmd --reload`（firewalld），CentOS 7 老环境用 `iptables -I INPUT -p vrrp -j ACCEPT`；Ubuntu 上先 `ufw status verbose` 确认 ufw 是否启用。VRRP 是 IP 协议 112、没有端口，按端口放行是无效的。',
        '**④ 排查 `virtual_router_id` 冲突**：同一广播域/VLAN 里两组 Keepalived 都用默认的 51 会互相抢 VIP，现象是 VIP 在两个集群之间乱跳、日志里频繁 `Entering MASTER STATE`。改成互不相同的 1~255 即可。',
        '**⑤ 核对 `priority` 与 `state`**：`priority` 大的当 MASTER；两台写成相同值（模板里常常都是 100）会打平导致**双主**，必须区分开（100 与 90）。`nopreempt` 决定原 MASTER 恢复后是否抢回 VIP，配与不配的现象完全不同。',
        '**⑥ 云环境与交换机限制**：华为云等 VPC 默认**不转发 VRRP 多播**，这是云上漂移失败最常见的原因。改用 `unicast_peer { 192.168.1.102 }` 单播对等体并去掉对多播的依赖，或者直接使用云平台的虚拟 IP / ELB 方案，不要在云上硬套传统 VRRP。',
        '**⑦ 参数都对还是不通**：检查 `track_script` 是否误判——脚本返回非 0 会把本机优先级降下去甚至主动让位；再核对两端的 `authentication` 密码与 `auth_type` 是否一致，不一致的通告会被直接丢弃。',
        '**⑧ 最后确认现象**：用 `ip addr show eth0` 确认 VIP 当前在哪台。双主时两台都会有 VIP，可用 `tcpdump -i eth0 -nn arp` 观察 ARP 冲突；切换后业务仍不通，再检查上游交换机的 ARP 缓存与安全组。'
      ],
      related: ['mw-keepalive-conf', 'mw-keepalive-vip', 'mw-keepalive-tcpdump', 'ln-firewall-cmd', 'ln-iptables'],
      docs: 'https://www.keepalived.org/documentation/keepalived-conf/',
      tags: ['Keepalived', '漂移', '排错', 'VRRP']
    },

    /* ================= E. ETCD ================= */

    /* ---------- 24 / 30 ---------- */
    {
      id: 'mw-etcd-health',
      name: 'etcdctl endpoint health',
      alias: ['etcd 健康检查', 'endpoint health', 'etcd 集群健康'],
      level: 2,
      syntax: 'etcdctl endpoint health [--cluster] [--endpoints=<列表>] [-w table]',
      summary: '逐个探测 etcd 节点能否正常读写，快速判断集群是否可用。',
      desc: '`endpoint health` 会真的向每个节点发一次请求（内含写探测），返回 `is healthy: successfully committed proposal` 才算通过。不带 `--cluster` 时只探测 `--endpoints` 里给的地址，带上 `--cluster` 会先取一次成员列表再逐个探测，所以它是判断"整个集群"的标准做法。它只看可用性，不看数据量与延迟，容量与 leader 信息要用 `endpoint status`（见 `mw-etcd-status`）。',
      params: [
        { flag: '--cluster', desc: '探测集群全部成员（内部先拉一次 member list），排障必加' },
        { flag: '--endpoints=<列表>', desc: '指定节点列表，逗号分隔；三个节点全写上才能看出是单点还是全挂' },
        { flag: '-w table', desc: '表格输出，比默认的逐行格式更适合多节点对照' },
        { flag: '--command-timeout=5s', desc: '单条命令的超时，节点假死时避免命令一直卡着不动' },
        { flag: '--cacert / --cert / --key', desc: '集群开启 TLS 时必填，kubeadm 环境的证书在 `/etc/kubernetes/pki/etcd/`' },
        { flag: '--insecure-skip-tls-verify', desc: '跳过服务端证书校验，仅限临时排障，不要写进脚本' }
      ],
      examples: [
        { cmd: 'ETCDCTL_API=3 etcdctl endpoint health --endpoints=https://10.0.1.11:2379,https://10.0.1.12:2379,https://10.0.1.13:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key -w table', desc: 'kubeadm 集群的标准健康检查，三个节点一次看完' },
        { cmd: 'etcdctl endpoint health --cluster --command-timeout=5s -w table', desc: '`--cluster` 自动探测全部成员；配合 `ETCDCTL_ENDPOINTS` 环境变量后命令可以写得很短' },
        { cmd: 'export ETCDCTL_API=3\nexport ETCDCTL_ENDPOINTS=https://10.0.1.11:2379,https://10.0.1.12:2379,https://10.0.1.13:2379\nexport ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt\nexport ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt\nexport ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key\netcdctl endpoint health --cluster -w table', desc: '把连接参数导成环境变量，后续 `etcdctl` 命令就不用重复写长参数了' }
      ],
      notes: [
        '返回 `is unhealthy: failed to commit proposal: context deadline exceeded` 说明该节点**能连上但提交不了写请求**，多半是磁盘 IO 太慢或与其他成员失联，不是网络不通那么简单',
        '`--cluster` 只探测成员列表里登记过的节点；某个节点被 `member remove` 过但进程还在跑，`endpoint health` 是发现不了的',
        '证书路径写错时报 `tls: failed to find any PEM data`，先确认 `/etc/kubernetes/pki/etcd/server.crt` 存在且 `etcd` 用户可读',
        '**单节点健康不代表集群健康**：少数节点不健康时集群仍可能在 quorum 内正常工作，反过来两个节点失联就会整体只读',
        '健康检查命令本身也走网络，跨公网探测会严重失真；排障一律在集群内网执行'
      ],
      related: ['mw-etcd-status', 'mw-etcd-env', 'mw-etcd-member-list', 'k8s-cluster-info'],
      docs: 'https://etcd.io/docs/v3.5/dev-guide/interacting_v3/',
      tags: ['etcd', '健康检查', '集群']
    },

    /* ---------- 25 / 30 ---------- */
    {
      id: 'mw-etcd-status',
      name: 'etcdctl endpoint status',
      alias: ['etcd 状态', 'DB SIZE', 'etcd 容量', 'mvcc database space exceeded'],
      level: 3,
      syntax: 'etcdctl endpoint status [--cluster] [-w table|json|fields]',
      summary: '查看每个节点的版本、Leader、数据量与 raft 进度，判断集群是否健康。',
      desc: '输出里最需要盯的是 `DB SIZE` 与 `DB SIZE IN USE`：前者是数据文件（含历史版本与碎片）的实际大小，后者是真实存活数据。etcd 默认配额 2GiB（`--quota-backend-bytes`），逼近配额时会先报 `etcdserver: mvcc: database space exceeded`，随后整个集群进入**只读**，所有写操作（包括 K8s 创建 Pod）全部失败。恢复步骤是 `compact` 回收历史版本再加上 `defrag` 整理碎片，两者要按节点逐个做。',
      params: [
        { flag: '--cluster', desc: '列出全部成员的状态，一眼看出谁是 leader、谁落后' },
        { flag: '-w table', desc: '表格输出，`DB SIZE`、`IS LEADER`、`RAFT INDEX` 直接可比' },
        { flag: 'DB SIZE IN USE', desc: '真实数据量；与 `DB SIZE` 差距越大说明碎片越多，越该 `defrag`' },
        { flag: 'RAFT TERM / RAFT INDEX', desc: '各节点的任期与日志索引，明显落后说明该节点同步跟不上' },
        { flag: 'etcdctl compact <rev>', desc: '压缩掉指定版本之前的历史，让这部分空间变成可回收' },
        { flag: 'etcdctl defrag', desc: '整理碎片、真正把文件缩小；**执行期间该节点会短暂不可读写**' }
      ],
      examples: [
        { cmd: 'ETCDCTL_API=3 etcdctl endpoint status --cluster -w table --endpoints=https://10.0.1.11:2379,https://10.0.1.12:2379,https://10.0.1.13:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key', desc: 'kubeadm 集群的标准状态查询，重点看 `DB SIZE`、`IS LEADER` 与 `ERRORS` 三列' },
        { cmd: 'etcdctl endpoint status --cluster -w table\netcdctl endpoint status -w json', desc: '表格给人看趋势，JSON 给脚本取值（`dbSize`、`dbSizeInUse`、`leader`、`raftIndex`）' },
        { cmd: 'REV=$(etcdctl endpoint status -w json | grep -o \'"revision":[0-9]*\' | head -1 | cut -d: -f2)\netcdctl compact $REV\netcdctl defrag --cluster', desc: '压缩到当前 revision 再整理碎片；`defrag` 逐节点执行期间该节点会短暂不可读写，务必避开业务高峰' }
      ],
      notes: [
        '**配额默认 2GiB**：写满后集群变只读并报 `etcdserver: mvcc: database space exceeded`，K8s 侧表现为"所有资源都创建不了"，`kubectl` 的报错也会指向 etcd',
        '`compact` 只是标记历史版本可回收，**不会释放磁盘空间**；必须再 `defrag` 才能真正缩小文件，两步要成对做',
        '`defrag` 期间该节点**阻塞读写**，多节点集群要逐个执行并确认恢复后再做下一台；单节点集群 `defrag` 等于一次停机',
        '`DB SIZE` 长期贴着 2GiB 说明该调大 `--quota-backend-bytes`，但更该先查是谁在频繁写（K8s 里常见是频繁更新的 Event 与大量 ConfigMap 变更）',
        '`ERRORS` 列非空要立刻处理，常见是 `etcdserver: request timed out`（磁盘慢）与 `lost leader`（网络抖动）',
        '`RAFT INDEX` 明显落后的节点不要马上重启，先看是不是磁盘 IO 跟不上；贸然重启可能触发新一轮选举'
      ],
      related: ['mw-etcd-health', 'mw-etcd-snapshot', 'mw-etcd-env', 'k8s-cluster-info'],
      docs: 'https://etcd.io/docs/v3.5/op-guide/maintenance/',
      tags: ['etcd', '容量', '配额']
    },

    /* ---------- 26 / 30 ---------- */
    {
      id: 'mw-etcd-member-list',
      name: 'etcdctl member list',
      alias: ['etcd 成员', 'member add', 'member remove', 'learner'],
      level: 2,
      syntax: 'etcdctl member list [-w table]    /    etcdctl member add|remove <成员名或ID>',
      summary: '查看集群成员清单，并在扩容或故障时安全地增删节点。',
      desc: '输出包含 `ID`、`STATUS`（`started`/`unstarted`）、`NAME`、`PEER ADDRS`（节点间通信地址，2380 端口）、`CLIENT ADDRS`（客户端访问地址，2379 端口）与 `IS LEARNER`。`member add` 只是把新成员登记进集群，新节点必须用 `--initial-cluster-state existing` 启动才会真正加入；`member remove` 会永久删掉该成员的数据视图，**先加后删**才能保证 quorum 不丢。',
      params: [
        { flag: '-w table', desc: '表格输出，`PEER ADDRS` 与 `CLIENT ADDRS` 对照最直观' },
        { flag: 'member add <名称> --peer-urls=https://10.0.1.14:2380', desc: '登记新成员，返回的 `ETCD_INITIAL_CLUSTER` 要填进新节点配置' },
        { flag: 'member remove <成员ID>', desc: '移除成员，必须在节点已下线或确定不再需要之后执行' },
        { flag: 'member update <成员ID> --peer-urls=...', desc: '成员 IP 变更（机房搬迁、网段调整）时更新 peer 地址' },
        { flag: 'IS LEARNER', desc: 'learner 只同步数据不参与投票，先加 learner 再提升可避免扩容时丢 quorum' },
        { flag: '--endpoints', desc: '指定任一健康节点即可，成员信息在整个集群里是一致的' }
      ],
      examples: [
        { cmd: 'ETCDCTL_API=3 etcdctl member list -w table --endpoints=https://10.0.1.11:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key', desc: '查看成员清单；`STATUS` 是 `unstarted` 说明成员已登记但进程还没起来' },
        { cmd: 'etcdctl member add etcd-04 --peer-urls=https://10.0.1.14:2380\netcdctl member list -w table', desc: '扩容第一步：登记新成员，然后把输出里的 `ETCD_INITIAL_CLUSTER` 写进新节点的启动参数并启动' },
        { cmd: 'etcdctl member remove 8e9e05c52164694d\netcdctl endpoint health --cluster -w table', desc: '缩容或替换故障节点：移除前先确认该节点进程已停，移除后立刻复查集群健康' }
      ],
      notes: [
        '**先加后删**：替换节点时必须先把新成员加进来并同步完成，再 `member remove` 老成员；否则成员数临时减少可能丢掉 quorum（3 节点集群丢 2 个就整体不可写）',
        '`member remove` 之后该节点上的数据就"孤"了，重新加入必须**清空 `/var/lib/etcd`** 并用 `--initial-cluster-state existing` 启动，直接启动会报 `etcdserver: re-configuration failed due to not enough started members`',
        '成员列表里出现 `unstarted` 成员会影响 quorum 计算，扩容失败后要么让新节点起来、要么 `member remove` 掉它，不要放着不管',
        '`member add` 返回的 `ETCD_INITIAL_CLUSTER` 字符串必须**完整复制**到新节点的 `--initial-cluster` 里，漏掉老成员会让新节点自己组成一个新集群',
        '扩容成偶数（2、4 个投票成员）并不提高容错，推荐 3 或 5 个；跨机房部署要接受跨机房延迟带来的写入变慢',
        'kubeadm 环境的成员变更后，`/etc/kubernetes/manifests/etcd.yaml` 里的 `--initial-cluster` 也要同步更新，否则重启 kubelet 后配置又变回去'
      ],
      related: ['mw-etcd-health', 'mw-etcd-status', 'mw-etcd-env', 'k8s-cluster-info'],
      docs: 'https://etcd.io/docs/v3.5/op-guide/runtime-configuration/',
      tags: ['etcd', '成员', '扩容']
    },

    /* ---------- 27 / 30 ---------- */
    {
      id: 'mw-etcd-kv',
      name: 'etcdctl put / get / del',
      alias: ['etcdctl get --prefix', 'etcdctl del --prefix', 'etcd 键值操作'],
      level: 2,
      syntax: 'etcdctl put <key> <value>  /  get <key> [--prefix]  /  del <key> [--prefix]',
      summary: '读写删除 etcd 里的键值，是查看 K8s 底层数据最直接的手段。',
      desc: 'etcd 是扁平的 key-value 存储，K8s 的所有对象都存在 `/registry/<资源类型>/<命名空间>/<名字>` 这样的 key 下（如 `/registry/pods/default/web-0`）。`get --prefix` 可以按前缀批量取，`--keys-only` 只列 key 不看 value（快得多），`--limit` 限制条数，`-w json` 输出结构化结果便于用脚本解析。`del` 同样支持 `--prefix`，执行后会返回删除的条数。',
      params: [
        { flag: 'get <key>', desc: '读单个 key；key 不存在时返回空而不是报错' },
        { flag: 'get --prefix <前缀>', desc: '按前缀取一批，K8s 场景基本只用这种写法' },
        { flag: '--keys-only', desc: '只返回 key 列表，排查"有哪些对象"时比拉全量 value 快几个数量级' },
        { flag: '--limit=10', desc: '限制返回条数，避免一次刷出几万行把终端卡死' },
        { flag: '-w json', desc: 'JSON 输出，便于配合 `jq` 或脚本处理' },
        { flag: 'del --prefix <前缀>', desc: '按前缀批量删除，**没有回收站、不可恢复**' }
      ],
      examples: [
        { cmd: 'etcdctl get --prefix --keys-only /registry/pods/default/ | head -20\netcdctl get --prefix --keys-only /registry/pods/ --limit=10', desc: '列出 default 命名空间下的 Pod key；先看清楚范围再决定要不要动' },
        { cmd: 'etcdctl get /registry/pods/default/web-0 -w json', desc: '取单个对象的 JSON 内容，可以看它归哪个控制器管理、最后修改时间是多少' },
        { cmd: 'etcdctl get --prefix --keys-only /registry/configmaps/default/ | wc -l\netcdctl snapshot save /data/backup/etcd-before-cleanup.db\netcdctl del --prefix /registry/configmaps/default/', desc: '真要删之前的标准动作：先用 `--keys-only` 确认范围与条数，再存一份快照，最后才执行 `del --prefix`' }
      ],
      notes: [
        '**`etcdctl del --prefix /registry/` 会把 K8s 里所有对象直接删掉**：Pod、Deployment、Service、Secret、RBAC 全在这一棵前缀树里，删完集群等于被清空，而且 **etcd 没有回收站、没有 undo**，`kubectl` 也救不回来',
        '**执行任何 `del --prefix` 之前必须做两件事**：先 `etcdctl get --prefix --keys-only <前缀> | wc -l` 确认影响范围，再 `etcdctl snapshot save` 存一份备份；两步都做完再动手，见 `mw-etcd-snapshot`',
        '`etcdctl put` 是**覆盖**语义，不检查原值，误写会直接改掉生产数据；要改 K8s 对象请用 `kubectl apply`/`kubectl patch`，不要直接改 etcd',
        '精确取某个 key 不要带 `--prefix`；带上之后 `web-0` 的前缀会把 `web-01`、`web-0x` 一起取出来',
        '要读历史版本用 `--rev=<版本号>`，配 `-w json` 还能看到 `create_revision`、`mod_revision`，用于排查"某个对象是什么时候被改的"',
        '`ETCDCTL_API=3` 未导出时 `etcdctl get` 会落到 v2 接口上，报 `Error: unknown command` 或直接没有输出，见 `mw-etcd-env`'
      ],
      related: ['mw-etcd-watch', 'mw-etcd-snapshot', 'mw-etcd-env', 'k8s-delete'],
      docs: 'https://etcd.io/docs/v3.5/dev-guide/interacting_v3/',
      tags: ['etcd', '键值', '危险操作']
    },

    /* ---------- 28 / 30 ---------- */
    {
      id: 'mw-etcd-watch',
      name: 'etcdctl watch',
      alias: ['etcdctl watch --prefix', 'etcd 监听', '谁删了我的对象'],
      level: 3,
      syntax: 'etcdctl watch <key> [--prefix] [--rev=<版本>] [--prev-kv] [-i]',
      summary: '持续监听某个 key 的变更事件，用来抓出谁在改或删对象。',
      desc: '`watch` 会保持连接，每当匹配的 key 发生变化就打印一条事件：`PUT` 表示新增或更新，`DELETE` 表示删除。`--prefix` 可以盯住一整棵子树（如 `/registry/pods/default/`），`--rev` 能从指定历史版本开始补放事件（对排查"刚刚发生的删除"特别有用，前提是那些版本还没被 `compact` 掉），`-i` 进入交互模式，可以边看边敲下一条命令。',
      params: [
        { flag: 'watch <key>', desc: '监听单个 key，任何变更都会实时打印出来' },
        { flag: '--prefix', desc: '监听整棵子树，K8s 场景盯 `/registry/...` 必备' },
        { flag: '--rev=<版本号>', desc: '从指定历史版本开始回放事件，用于复盘已经发生的变更' },
        { flag: '-i', desc: '交互模式，可以连续敲多条 etcdctl 命令' },
        { flag: '--prev-kv', desc: '事件里同时打印变更前的旧值，判断"被覆盖成了什么"很有用' }
      ],
      examples: [
        { cmd: 'ETCDCTL_API=3 etcdctl watch --prefix /registry/pods/default/ --endpoints=https://10.0.1.11:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key', desc: '盯住 default 命名空间的 Pod，任何创建与删除都会实时打印事件' },
        { cmd: 'etcdctl watch --prefix --prev-kv /registry/configmaps/default/app-config', desc: '带旧值输出，能看出配置被改成了什么（`--prev-kv` 会同时打印变更前的 value）' },
        { cmd: 'REV=$(etcdctl endpoint status -w json | grep -o \'"revision":[0-9]*\' | head -1 | cut -d: -f2)\netcdctl watch --rev=$((REV-1000)) --prefix /registry/pods/default/', desc: '从 1000 个版本之前开始回放，复盘刚刚发生的删除操作（前提是这些版本还没被 `compact` 清理）' }
      ],
      notes: [
        '`--rev` 只能回放到**还没被 `compact` 掉的版本**；一旦压缩过就取不回来了，所以排查要趁早做',
        '`watch` 是长连接，**会一直占着终端**，用 `Ctrl+C` 退出；脚本里建议写 `timeout 60 etcdctl watch ...` 限制时长',
        '前缀监听范围别开太大：`--prefix /registry/` 在大集群上每秒可能刷出成百上千条事件，先用 `--prefix /registry/pods/default/` 缩小范围',
        '删除事件里的 value 是空的，想知道被删内容要加 `--prev-kv`，而且只有事件发生时带上才有效，事后补不回来',
        '对象被删后要找"是谁干的"：`watch` 只能证明什么时候被删，操作者身份要看 kube-apiserver 的审计日志或云平台的审计服务',
        'watch 的 key 里命名空间与名字都是明文（如 `/registry/pods/default/web-0`），不要在生产会话里把敏感 key 截图外发'
      ],
      related: ['mw-etcd-kv', 'mw-etcd-env', 'mw-etcd-snapshot', 'k8s-get-events'],
      docs: 'https://etcd.io/docs/v3.5/dev-guide/interacting_v3/',
      tags: ['etcd', '监听', '排查']
    },

    /* ---------- 29 / 30 ---------- */
    {
      id: 'mw-etcd-snapshot',
      name: 'etcdctl snapshot',
      alias: ['etcd 备份', 'etcd 恢复', 'snapshot save', 'snapshot restore', '灾难恢复'],
      level: 4,
      syntax: 'etcdctl snapshot save <文件>  /  snapshot status <文件>  /  snapshot restore <文件> --data-dir=<新目录>',
      summary: '备份与离线恢复 etcd 数据，是集群被误删或磁盘损坏后的最后手段。',
      desc: '`snapshot save` 走 etcd 的 gRPC 接口做在线备份，**不需要停集群**，文件是一份完整的数据副本；`snapshot status` 用来校验文件头与 revision，确认备份不是空的或半截的；`snapshot restore` 是**纯离线操作**：不连集群、直接读文件写出一份新的 `--data-dir`，再把 etcd 指向这个目录启动。恢复时要改 `--data-dir`（二进制部署）或 static pod 的 `hostPath`（kubeadm 部署），并在恢复后 `chown -R etcd:etcd` 修正属主。`etcdctl` 的版本要与集群 etcd 版本一致，跨大版本恢复很容易失败。',
      params: [
        { flag: 'snapshot save <文件>', desc: '在线备份；目标目录必须已存在且 etcd 用户可写，文件名建议带时间戳' },
        { flag: 'snapshot status -w table', desc: '校验备份文件，看 `totalKey`、`totalSize`、`revision`；**恢复前必做**' },
        { flag: 'snapshot restore <文件> --data-dir=<目录>', desc: '离线恢复，输出到新目录，**不会覆盖现有数据**' },
        { flag: '--endpoints', desc: '备份时需要连集群，指定任一健康节点即可（数据是全量的）' },
        { flag: '--cacert / --cert / --key', desc: '备份时的 TLS 证书参数，kubeadm 环境在 `/etc/kubernetes/pki/etcd/`' },
        { flag: '--skip-hash-check', desc: '跳过 restore 的哈希校验，仅在确认备份文件校验误报时临时使用，平时别开' }
      ],
      examples: [
        { cmd: 'mkdir -p /data/backup\nETCDCTL_API=3 etcdctl snapshot save /data/backup/etcd-$(date +%F-%H%M).db --endpoints=https://10.0.1.11:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key\nls -lh /data/backup/', desc: '在线备份三节点集群（连任一节点即可，数据是全量的），文件名带时间戳；建议放进 crontab 每小时跑一次' },
        { cmd: 'ls -lh /data/backup/\netcdctl snapshot status /data/backup/etcd-2024-05-20-0300.db -w table', desc: '恢复前必做：确认备份文件存在，且 `status` 输出的 `totalKey`、`revision`、`totalSize` 正常' },
        { cmd: 'ETCDCTL_API=3 etcdctl snapshot restore /data/backup/etcd-2024-05-20-0300.db --data-dir=/var/lib/etcd-restore\nchown -R etcd:etcd /var/lib/etcd-restore\nls -ld /var/lib/etcd-restore', desc: '离线恢复：把备份展开成一份新的数据目录，再让 etcd 用 `--data-dir=/var/lib/etcd-restore` 启动并修正属主' }
      ],
      notes: [
        '**K8s 集群的 etcd 备份就是集群的命根子**：集群里的 Pod、Deployment、Service、ConfigMap、Secret、PV/PVC 绑定关系、RBAC 权限、ServiceAccount token 全部只存在 etcd 里，kubelet 与容器运行时都没有第二份副本；etcd 数据丢了没法从别处还原，只能重建集群再把业务重新 apply 一遍',
        '**恢复是纯离线操作**：`snapshot restore` 不需要连集群、也不需要证书（证书只在 `save` 时用），但要先**停掉 etcd**——kubeadm 环境把 `/etc/kubernetes/manifests/etcd.yaml` 临时移走，kubelet 会自动停掉 static pod，恢复完成后再把 `--data-dir` 指到新目录，或把新数据覆盖回 `/var/lib/etcd`',
        '**`etcdctl` 版本必须与集群 etcd 版本一致**：`snapshot restore` 是跨版本最容易出问题的一步，恢复前先用 `etcdctl version` 与 `etcd --version` 对齐，必要时换成与集群同版本的二进制',
        'kubeadm 环境恢复后要执行 `chown -R etcd:etcd /var/lib/etcd`，否则 etcd 容器会因为目录属主不对反复重启，`kubectl get pods -n kube-system` 里能看到 `etcd-xxx` 一直 CrashLoopBackOff',
        '恢复是**整集群回滚**：`snapshot restore` 会把数据退回到备份那一刻，备份之后创建的所有资源都会消失；恢复前先确认备份的时间点，并把当前数据目录改名留档（`mv /var/lib/etcd /var/lib/etcd.bak`）而不是直接删',
        '备份文件要**定期做恢复演练**并异地保存：只 `save` 不 `status` 校验、或者备份和数据放在同一块盘上，都是"以为有备份、真出事时打不开"',
        '三节点集群只需对**任一节点**执行 `snapshot save`（数据一致），但要定期轮换目标节点，避免总压在同一台上；大集群建议放在业务低峰做',
        '`snapshot save` 报 `context deadline exceeded` 多为 etcd 磁盘 IO 慢或 `--command-timeout` 太短；不要为了备份成功盲目调大超时，先看 `endpoint status` 里的 `DB SIZE` 与 IO 延迟'
      ],
      related: ['k8s-cluster-info', 'k8s-describe', 'k8s-apply', 'mw-etcd-status', 'mw-etcd-kv'],
      docs: 'https://etcd.io/docs/v3.5/op-guide/recovery/',
      tags: ['etcd', '备份', '恢复', '灾难恢复']
    },

    /* ---------- 30 / 30 ---------- */
    {
      id: 'mw-etcd-env',
      name: 'ETCDCTL_API',
      alias: ['ETCDCTL_ENDPOINTS', 'ETCDCTL_CACERT', 'etcdctl 证书', 'etcdctl 环境变量'],
      level: 2,
      syntax: 'export ETCDCTL_API=3 && export ETCDCTL_ENDPOINTS=<节点列表>',
      summary: '设置 etcdctl 的接口版本、集群地址与证书，免去每条命令重复写长参数。',
      desc: '`ETCDCTL_API=3` 在 etcd 3.4 及以上已是默认值，但 3.3 及更早版本默认走 v2 接口，不导出就会出现"`etcdctl get` 没有输出"或 `Error: unknown command` 这类莫名其妙的现象，**连 K8s 集群时永远显式导出这一行**。其余 `ETCDCTL_*` 变量与命令行同名参数等价，且命令行参数的优先级更高。',
      params: [
        { flag: 'ETCDCTL_API=3', desc: '使用 v3 接口；3.3 及以前必须显式导出，否则命令会落到 v2 上' },
        { flag: 'ETCDCTL_ENDPOINTS', desc: '集群地址列表，等价于每条命令都写 `--endpoints=`' },
        { flag: 'ETCDCTL_CACERT / ETCDCTL_CERT / ETCDCTL_KEY', desc: 'TLS 证书三件套，kubeadm 环境在 `/etc/kubernetes/pki/etcd/`' },
        { flag: '--insecure-skip-tls-verify', desc: '跳过服务端证书校验，仅临时排障使用' },
        { flag: '-w table|json|fields', desc: '输出格式；`table` 给人看，`json` 给脚本用' },
        { flag: 'ETCDCTL_WRITE_OUT', desc: '输出格式的等价环境变量，脚本里导出一次就不必每行都带 `-w`' }
      ],
      examples: [
        { cmd: 'export ETCDCTL_API=3\nexport ETCDCTL_ENDPOINTS=https://10.0.1.11:2379,https://10.0.1.12:2379,https://10.0.1.13:2379\nexport ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt\nexport ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt\nexport ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key\netcdctl endpoint health --cluster -w table', desc: '写进 `~/.bashrc` 或排障脚本，之后任何 `etcdctl` 命令都不用再带证书参数' },
        { cmd: 'etcdctl --endpoints=https://10.0.1.11:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key endpoint status -w table', desc: '命令行形式的完整写法，适合一次性执行或写进别人也要用的脚本里' },
        { cmd: 'export ETCDCTL_API=3\netcdctl get --prefix --keys-only /registry/namespaces/ | head', desc: '验证 v3 接口是否生效：能列出 K8s 命名空间的 key 就说明 `ETCDCTL_API` 已正确导出' }
      ],
      notes: [
        '**`ETCDCTL_API=3` 必须显式导出**：etcd 3.3 及以前默认走 v2，`etcdctl get /registry/...` 会因为 v2 的 key 结构与 v3 不同而查不到数据，报错信息还很有迷惑性',
        '环境变量只在**当前 shell 会话**有效，`sudo -i` 或新开的终端里要重新导出；脚本里建议直接在命令前加 `ETCDCTL_API=3`，不要依赖环境',
        '`--endpoints` 写成 `https://` 就必须配证书，忘了 `--cacert` 报的是 `x509: certificate signed by unknown authority`，而不是连接失败',
        'kubeadm 默认证书在 `/etc/kubernetes/pki/etcd/`，`server.crt` 与 `server.key` 就是客户端访问用的，`ca.crt` 用来校验服务端，三个都要给',
        '命令行参数优先于环境变量，临时只想连某一个节点时直接加 `--endpoints=https://10.0.1.12:2379` 即可，不必先 `unset`',
        '`ETCDCTL_WRITE_OUT` 支持 `simple`、`table`、`json`、`fields` 四种取值：脚本里用 `json` 最省事，人看用 `table`'
      ],
      related: ['mw-etcd-health', 'mw-etcd-kv', 'mw-etcd-snapshot', 'k8s-cce-kubeconfig'],
      docs: 'https://etcd.io/docs/v3.5/op-guide/configuration/',
      tags: ['etcd', '环境变量', '证书']
    }

    /* 后续命令同样追加在这里，用逗号分隔 */
  );
})();
