/* data/lessons-linux.js · Linux 地基（基础 / 文本 / 存储 / 用户 / 网络）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。这里只放课程数据。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

      {
        id: 'ls-long',
        cat: 'linux-basic',
        title: '看清文件的大小与时间',
        prompt: '你想知道 /var/log/nginx 下有哪些文件、各自多大、什么时候改过。',
        task: '用人类可读的格式，长列表查看 /var/log/nginx',
        steps: [
          { title: '看清目录里有什么', about: '列出 /var/log/nginx', cmd: 'ls /var/log/nginx', ref: 'lb-ls', hint: ['先别急着加选项：这一步只是确认目录里有哪些文件，默认输出就够了，排序和细节都还不用管。', 'ls ____'], note: '默认只给文件名，看不到大小和时间' },
          { title: '加上长格式', about: '查看权限、属主、大小与时间', cmd: 'ls -l /var/log/nginx', ref: 'lb-ls', hint: ['光有文件名看不出门道：权限、属主、大小、时间都藏在另一种输出格式里 —— 哪个字母代表「长格式」？', 'ls -____ /var/log/nginx'], note: '多了权限、属主、字节数、修改时间' },
          { title: '让大小变成人类可读', about: '把字节数换成 K/M/G', cmd: 'ls -lh /var/log/nginx', ref: 'lb-ls', hint: ['字节数堆成一长串读不出量级 —— 哪个选项能让大小自动换算成 K、M、G？', 'ls -l____ /var/log/nginx'], note: '字节数变成 46M / 4.2M 这种好读的形式' }
        ],
        answer: 'ls -lh /var/log/nginx',
        alt: ['ls -hl /var/log/nginx', 'ls -lh /var/log/nginx/', 'ls -l -h /var/log/nginx'],
        expect: /access\.log/,
        teach: '`-l` 是长格式，`-h` 把字节数变可读（K/M/G）。两个必须一起用，单敲 `ls -h` 不报错但什么都不会变 —— 这是新手最常见的无效参数组合。'
      },

      {
        id: 'ls-time',
        cat: 'linux-basic',
        title: '找最近改动的文件',
        prompt: '日志目录里文件很多，你想先看最近被写过的那个。',
        task: '按修改时间倒序，长列表查看 /var/log/nginx',
        steps: [
          { title: '先复习上一步', about: '长格式 + 可读大小', cmd: 'ls -lh /var/log/nginx', ref: 'lb-ls', hint: ['先把上一关的基线摆好：可读大小的长列表。留意这时输出是按文件名排的，还看不出谁新谁旧。', 'ls ____ /var/log/nginx'], note: '这是基线，注意顺序是按名称排的' },
          { title: '按修改时间倒序', about: '最近改动的排最前', cmd: 'ls -lht /var/log/nginx', ref: 'lb-ls', hint: ['排障最想知道谁刚被写过 —— 在可读大小的长格式上，再补一个「按修改时间、新的在前」的排序字母。', 'ls -lh____ /var/log/nginx'], note: '最近改动的排到最前面' }
        ],
        answer: 'ls -lht /var/log/nginx',
        alt: ['ls -lth /var/log/nginx', 'ls -thl /var/log/nginx'],
        expect: /error\.log/,
        teach: '`-t` 按时间排序（新的在前）。排障第一步几乎都是 `ls -lht`：先看谁刚被写过，再决定读哪个文件。'
      },

      {
        id: 'basic-free-space',
        cat: 'linux-basic',
        title: '磁盘快满了，先看清是谁在占空间',
        prompt: '/data 分区的告警一直在响，你要在被逼着删日志之前，先弄清到底是谁在吃空间。',
        task: '确认 /data 的剩余容量，并按目录逐层找出占用最大的地方',
        steps: [
          { title: '先看分区还剩多少', about: '先确认这个分区到底还剩多少、挂在哪', cmd: 'df -h /data', ref: 'ls9-df', hint: ['报警了不等于真的满了：找到挂载点是 /data 的那一行，盯住已用百分比 —— 顺便让容量数字好读一点。', 'df ____ /data'], note: '先确认是不是真的满了 —— "报警了"和"满了"是两件事' },
          { title: '看目录里都有什么', about: '长格式列出 /data', cmd: 'ls -lh /data', ref: 'lb-ls', hint: ['知道分区紧张之后，先看这一层有哪几个子目录，才知道该往哪个方向继续钻。', 'ls ____ /data'], note: '先知道有哪几个目录，才有往下钻的方向' },
          { title: '逐层量目录占用', about: '量出整个目录在磁盘上的合计占用', cmd: 'du -sh /data/app', ref: 'ls9-du', hint: ['注意别被文件大小骗了：这一步要的是整个目录在磁盘上的合计占用，而不是逐个文件的字节数。', 'du ____ /data/app'], note: 'du 算的是磁盘占用，和 ls 看到的文件大小不是一回事' },
          { title: '定位到具体目录', about: '再量一层，锁定大头', cmd: 'du -sh /data/backup', ref: 'ls9-du', hint: ['把范围换到另一个候选目录再量一次 —— 备份里的归档包往往是这种告警的真凶。', 'du ____ /data/backup'], note: '备份目录里的归档往往就是元凶，删之前先确认能不能重打' }
        ],
        answer: 'df -h /data && ls -lh /data && du -sh /data/app && du -sh /data/backup',
        alt: ['df -h /data && ls -l /data && du -sh /data/app && du -sh /data/backup'],
        expect: /backup/,
        teach: '排"磁盘满"的固定顺序：先 df -h 找分区，再 du -sh 逐层缩小范围，最后才决定删什么。反过来先删日志，十有八九删错地方，还丢了排障证据。'
      },

      {
        id: 'basic-copy-move',
        cat: 'linux-basic',
        title: '/tmp 里的临时文件：复制、改名、清理',
        prompt: '你要在 /tmp 下准备一个临时文件，复制一份之后再改名，确认无误后清理干净。',
        task: '在 /tmp 下创建 demo.txt，复制成 demo.bak，改名为 note.txt，确认后删除',
        steps: [
          { title: '创建临时文件', about: '先造一个空的占位文件，不用写内容', cmd: 'touch /tmp/demo.txt', ref: 'lb-touch', hint: ['先造一个空道具：不用写任何内容，只要文件在目录里存在、时间戳是当下就行。', 'touch /tmp/____'], note: 'touch 除了建文件，也用来把时间戳刷新成当前时间' },
          { title: '复制一份', about: '不动原文件，多出一份同内容的副本', cmd: 'cp /tmp/demo.txt /tmp/demo.bak', ref: 'lb-cp', hint: ['要在不动原文件的前提下多出一份副本；复制和改名是两件事，这一步只做前一件。', 'cp /tmp/demo.txt /tmp/____'], note: 'cp 是复制：原文件还在，多出一份副本' },
          { title: '改名（移动）', about: '把同一个文件挪到新名字，旧名字随之消失', cmd: 'mv /tmp/demo.bak /tmp/note.txt', ref: 'lb-mv', hint: ['改名不是重新生成一个文件：把同一个文件挪到新名字上，旧名字随之消失。', 'mv /tmp/demo.bak /tmp/____'], note: 'mv 是移动或改名：原来的 demo.bak 已经不存在了' },
          { title: '确认结果', about: '长格式列出 /tmp', cmd: 'ls -lh /tmp', ref: 'lb-ls', hint: ['先确认目录里现在是哪两个文件、大小是否一致，再动手做不可逆的那一步。', 'ls ____ /tmp'], note: '能看到 demo.txt 与 note.txt 两个文件，大小一致' },
          { title: '清理掉不需要的', about: '删掉这两个临时文件，删前先核对路径', cmd: 'rm /tmp/demo.txt /tmp/note.txt', ref: 'lb-rm', hint: ['删除不可恢复，唯一的保险是删之前确认路径写对了；这一步一次带走两个临时文件。', 'rm /tmp/demo.txt /tmp/____'], note: 'rm 不可恢复；删之前先 ls 确认路径，这是唯一的安全习惯' }
        ],
        answer: 'touch /tmp/demo.txt && cp /tmp/demo.txt /tmp/demo.bak && mv /tmp/demo.bak /tmp/note.txt && ls -lh /tmp && rm /tmp/demo.txt /tmp/note.txt',
        alt: ['touch /tmp/demo.txt && cp /tmp/demo.txt /tmp/demo.bak && mv /tmp/demo.bak /tmp/note.txt && ls -l /tmp && rm /tmp/demo.txt /tmp/note.txt'],
        expect: /demo\.txt/,
        teach: 'cp 是复制（原文件保留）、mv 是移动或改名（原位置没了）、rm 是删除（不可恢复）。最容易踩的坑是拿 mv 当 cp 用：跨目录"备份"完一看，原文件已经不在原地了。'
      },

      {
        id: 'basic-perm-tree',
        cat: 'linux-basic',
        title: '看清目录结构与权限归属',
        prompt: '接手一台别人维护的机器，先要摸清 /data/app 里有哪些文件、权限和属主是怎么给的。',
        task: '看清 /data/app 的目录层级与权限，并用 stat 确认关键文件的详细信息',
        steps: [
          { title: '看目录层级', about: '一次看完整棵子树，机器上没装工具也不怕', cmd: 'ls -R /data/app', ref: 'lb-ls', hint: ['机器上不一定装了树形工具，但这个选项能让列表自己钻进每一层子目录，一次看完整棵子树。', 'ls -____ /data/app'], note: '机器上不一定装了 tree，ls -R 是通用替代' },
          { title: '看权限与属主', about: '长格式第一列就是权限', cmd: 'ls -l /data/app', ref: 'lb-ls', hint: ['权限和属主都写在输出的第一列，要让它露出来得换成另一种格式；那 9 位分属主、属组、其他人三段。', 'ls -____ /data/app'], note: 'drwxr-xr-x 的 d 是目录，后 9 位分属主 / 属组 / 其他人三段' },
          { title: '看文件的详细信息', about: '看单个文件的 inode 与三个精确时间戳', cmd: 'stat /data/app/config.yaml', ref: 'lb-stat', hint: ['长列表给不了 inode，也给不了精确到秒的三个时间戳 —— 哪个命令专门看单个文件的元数据？', 'stat /data/app/____'], note: 'stat 比 ls -l 多给 inode、访问时间、修改时间、变更时间' },
          { title: '看日志文件的权限', about: '日志目录通常权限更严', cmd: 'ls -l /data/app/logs', ref: 'lb-ls', hint: ['生产环境的日志目录权限通常更严，只有属主和属组读得到；这一步重点看第一列。', 'ls -____ /data/app/logs'], note: '生产上日志常常只给属主属组读，别人看不到 —— 这就是 rw-r----- 的含义' }
        ],
        answer: 'ls -R /data/app && ls -l /data/app && stat /data/app/config.yaml && ls -l /data/app/logs',
        alt: ['ls -R /data/app && ls -l /data/app && stat /data/app/config.yaml && ls -l /data/app/logs'],
        expect: /config\.yaml/,
        teach: '看权限先看 ls -l 第一列：- 是普通文件、d 是目录、l 是软链；后面 9 位分属主 / 属组 / 其他人三段。要 inode 与精确时间戳就用 stat。改权限前先 ls -l 存一份原样，出问题好还原。'
      },

      {
        id: 'basic-tar-backup',
        cat: 'linux-basic',
        title: '把日志目录打包留档并验证',
        prompt: '要清理 /var/log/nginx 之前，先把整个目录打包留档，并且确认这个包是好的。',
        task: '把 /var/log/nginx 打包成 /data/backup/nginx-logs.tar.gz，并列出包内清单验证',
        steps: [
          { title: '先看要打包什么', about: '确认目录里有哪些文件、多大', cmd: 'ls -lh /var/log/nginx', ref: 'lb-ls', hint: ['打包前先清点：看清里面有几个文件、各自多大，才知道打完包应该包含哪几样东西。', 'ls ____ /var/log/nginx'], note: '打包前先看清内容，才知道打完应该包含哪几个文件' },
          { title: '打包并压缩', about: '一步完成归档与压缩，注意保留目录结构', cmd: 'tar -czf /data/backup/nginx-logs.tar.gz /var/log/nginx', ref: 'lb-tar', hint: ['一条命令同时做完归档和压缩：要凑齐创建、走 gzip、指定包名三件事，少一个都会报错或存错地方。', 'tar ____ /data/backup/nginx-logs.tar.gz /var/log/nginx'], note: '-c 创建、-z 走 gzip、-f 指定包名，三个参数缺一不可' },
          { title: '列出包内清单', about: '不解开压缩包，回读一遍包内清单', cmd: 'tar -tzf /data/backup/nginx-logs.tar.gz', ref: 'lb-tar', hint: ['压缩中途出错不会当场报，所以打完包必须回读一次 —— 哪个选项是「只列清单、不解开」？', 'tar -____f /data/backup/nginx-logs.tar.gz'], note: '-t 是列出，与 -c 只能二选一；打完包必跑这一步' },
          { title: '确认归档文件已落地', about: '再看一次备份目录', cmd: 'ls -lh /data/backup', ref: 'lb-ls', hint: ['回头看备份目录里那个新文件在不在、时间戳是不是刚刚 —— 别打完包自己都不知道存哪了。', 'ls ____ /data/backup'], note: '看时间戳是不是刚刚，别打完包自己都不知道存哪了' }
        ],
        answer: 'ls -lh /var/log/nginx && tar -czf /data/backup/nginx-logs.tar.gz /var/log/nginx && tar -tzf /data/backup/nginx-logs.tar.gz && ls -lh /data/backup',
        alt: ['ls -lh /var/log/nginx && tar -czf /data/backup/nginx-logs.tar.gz /var/log/nginx && tar -tzf /data/backup/nginx-logs.tar.gz && ls -l /data/backup'],
        expect: /access\.log/,
        teach: 'tar -czf 包 源 是打包、tar -tzf 包 是看清单、tar -xzf 包 -C 目标 是还原。打完包一定跑一次 -t：压缩中途出错不会立刻报，等你要恢复那天才发现包是坏的，就来不及了。'
      },

      {
        id: 'grep-context',
        cat: 'linux-text',
        title: '在日志里只捞错误行',
        prompt: 'nginx 的 error.log 里全是超时报错，你想把所有 error 级别的行找出来。',
        task: '在 /var/log/nginx/error.log 中搜索包含 error 的行（忽略大小写）',
        steps: [
          { title: '先看看日志长什么样', about: '日志每行都带 [error] 和时间', cmd: 'cat /var/log/nginx/error.log', ref: 'lb-cat', hint: ['先读原文再谈过滤：看清每行以什么级别标记开头、都带哪些字段，才知道该拿什么当关键词。', 'cat /var/log/nginx/____'], note: '每行都以 [error] 开头，还有 upstream timed out' },
          { title: '按关键词过滤', about: '把整份日志压成只看命中的那些行', cmd: 'grep error /var/log/nginx/error.log', ref: 'lt-grep', hint: ['要把整份日志压成「只看命中行」：哪个命令专门负责按关键词筛行、其余原样输出？', 'grep ____ /var/log/nginx/error.log'], note: '小写 error 已经能匹配到' },
          { title: '忽略大小写', about: '避免漏掉 Error / ERROR', cmd: 'grep -i error /var/log/nginx/error.log', ref: 'lt-grep', hint: ['真实日志里大小写是混着写的，漏掉一行就可能漏掉真因 —— 哪个选项让匹配不再区分大小写？', 'grep ____ error /var/log/nginx/error.log'], note: '日志里可能出现 Error、ERROR，加 -i 一个都不漏' }
        ],
        answer: 'grep -i error /var/log/nginx/error.log',
        alt: ['grep -i "error" /var/log/nginx/error.log', 'grep --ignore-case error /var/log/nginx/error.log'],
        expect: /upstream timed out/,
        teach: '`-i` 忽略大小写。日志里可能是 `error`、`Error`、`ERROR`，不加 `-i` 会漏掉一部分 —— 这是搜不到日志的头号原因。'
      },

      {
        id: 'grep-invert',
        cat: 'linux-text',
        title: '排除掉健康检查的噪音',
        prompt: '日志里 kube-probe 的健康检查刷屏，你想看"除了健康检查之外"的请求。',
        task: '在 /var/log/nginx/access.log 中输出【不包含】healthz 的行',
        steps: [
          { title: '先确认噪音长什么样', about: '健康检查把业务请求淹了', cmd: 'grep healthz /var/log/nginx/access.log', ref: 'lt-grep', hint: ['先确认噪音长什么样、来得有多勤：把健康检查的请求单独拎出来看一眼，再决定怎么排除它。', 'grep ____ /var/log/nginx/access.log'], note: 'kube-probe 每 30 秒来一次，把真正的业务请求淹了' },
          { title: '反向匹配排除它', about: '只留下非健康检查的请求', cmd: 'grep -v healthz /var/log/nginx/access.log', ref: 'lt-grep', hint: ['要看的是「除了它之外」的请求：哪个选项把命中反过来，只输出不匹配的那些行？', 'grep ____ healthz /var/log/nginx/access.log'], note: '剩下的就是真实业务请求' }
        ],
        answer: 'grep -v healthz /var/log/nginx/access.log',
        alt: ['grep -v "healthz" /var/log/nginx/access.log'],
        expect: /GET \/api\/orders/,
        teach: '`-v` 是**反向匹配**（输出不命中的行），不是"详细模式"。这个坑几乎人人都踩过：搜 `grep -v` 的文档时会看到 `--invert-match`，记它更准。'
      },

      {
        id: 'awk-topip',
        cat: 'linux-text',
        title: '统计访问量最高的 IP',
        prompt: '你想知道哪个客户端 IP 请求得最多。',
        task: '统计 access.log 里出现次数最多的前几个 IP',
        steps: [
          { title: '取出第一列', about: 'Nginx 默认格式第一列就是客户端 IP', cmd: "awk '{print $1}' /var/log/nginx/access.log", ref: 'lt-awk', hint: ['默认日志格式里客户端地址固定落在第一个字段 —— 先想办法把它单独取出来成为一列。', "awk '{print $____}' /var/log/nginx/access.log"], note: 'Nginx 默认日志格式里第一列就是 IP' },
          { title: '排序', about: '让相同 IP 挨在一起，uniq 才能计数', cmd: "awk '{print $1}' /var/log/nginx/access.log | sort", ref: 'lt-sort-column', hint: ['计数工具只会合并相邻的重复行，所以先把相同地址排到一起，否则同一个地址会被算成好几段。', "awk '{print $1}' /var/log/nginx/access.log | ____"], note: 'uniq 只能合并相邻的重复行，所以必须先 sort' },
          { title: '计数', about: '统计每个 IP 出现多少次', cmd: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c", ref: 'lt-uniq', hint: ['排好序还看不出谁多谁少：要合并连续相同的行并数出条数，哪个选项负责「计数」？', "awk '{print $1}' /var/log/nginx/access.log | sort | uniq ____"], note: '行首出现次数' },
          { title: '倒序取前几', about: '得到访问量 Top 榜', cmd: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -3", ref: 'lb-head', hint: ['次数已经数出来了，接下来要的是排行榜：按数值从大到小排，再只留下最前面几条。', "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort ____ | head -3"], note: 'Top 3 就出来了' }
        ],
        answer: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head",
        alt: [
          "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5",
          "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5",
          "cut -d' ' -f1 /var/log/nginx/access.log | sort | uniq -c | sort -rn | head"
        ],
        expect: /203\.0\.113\.25/,
        teach: '这是运维最经典的一条管道：`awk` 取第一列 → `sort` 把相同 IP 排到相邻 → `uniq -c` 计数 → `sort -rn` 按次数倒排 → `head` 取前几。**`sort` 不能省**，因为 `uniq` 只合并相邻的重复行。'
      },

      {
        id: 'tail-follow',
        cat: 'linux-basic',
        title: '实时看日志',
        prompt: '应用正在跑，你想持续看到新写入的日志。',
        task: '持续跟踪 /data/app/logs/app.log 的最后 20 行',
        steps: [
          { title: '看最后几行', about: '确认日志内容再决定跟不跟', cmd: 'tail -n 20 /data/app/logs/app.log', ref: 'lb-tail', hint: ['默认只给最后 10 行，但你要的是明确的条数 —— 哪个选项能把「看多少行」写死？', 'tail ____ 20 /data/app/logs/app.log'], note: 'tail 默认给最后 10 行，-n 指定行数' },
          { title: '持续跟踪新日志', about: 'Ctrl+C 才退出', cmd: 'tail -f -n 20 /data/app/logs/app.log', ref: 'lb-tail', hint: ['一次性看完不够：要让输出一直挂在终端上，文件有新内容就追加出来，靠哪个选项？', 'tail ____ -n 20 /data/app/logs/app.log'], note: '会一直占用终端，Ctrl+C 退出' }
        ],
        answer: 'tail -f -n 20 /data/app/logs/app.log',
        alt: ['tail -n 20 -f /data/app/logs/app.log', 'tail -20f /data/app/logs/app.log', 'tail -f /data/app/logs/app.log -n 20'],
        expect: /query timeout/,
        teach: '`-f` 是 follow，会一直占用当前终端，`Ctrl+C` 才退出。生产上一定要配 `-n` 限制初始行数，否则一个几百 MB 的日志会瞬间刷屏。'
      },

      {
        id: 'du-culprit',
        cat: 'linux-storage',
        title: '找出谁把磁盘占满了',
        prompt: '`df -h` 显示 /data 已经 100%，你要找出是哪个子目录占的。',
        task: '统计 /data 下每个目录的总占用，按人类可读格式、由大到小排序',
        steps: [
          { title: '确认确实满了', about: '看 /data 的 Use%', cmd: 'df -h', ref: 'ls9-df', hint: ['先确认到底满没满：在整张容量表里找到 /data 那一行，盯住已用百分比 —— 数字要一眼读得出量级。', 'df ____'], note: '看 /data 那一行的 Use% 和 Mounted on' },
          { title: '统计备份目录', about: '先量一个最大的候选', cmd: 'du -sh /data/backup', ref: 'ls9-du', hint: ['先量一个最大的嫌疑对象：只要这一个目录的合计占用，不要它下面每个文件的明细。', 'du ____ /data/backup'], note: '-s 只要汇总，-h 人类可读' },
          { title: '对比各目录并排序', about: '找出真正的占用大头', cmd: 'du -sh /data/backup /data/app /data/docker | sort -rh', ref: 'lb-sort', hint: ['把几个候选目录放进同一次比较，再让结果自己从大到小排；注意要按数值排，不是按字母排。', 'du -sh /data/backup /data/app /data/docker | sort ____'], note: 'sort -rh 按可读数值倒排，占最大的排最前' }
        ],
        answer: 'du -sh /data/backup /data/app /data/docker | sort -rh',
        alt: ['du -sh /data/backup /data/docker /data/app | sort -rh', 'du -sh /data/backup', 'du -sh /data/backup /data/app'],
        expect: /backup/,
        teach: '`du -sh` 给出每个目录的总大小，`sort -rh` 按人类可读的数值倒排。排到第一名是 `/data/backup` —— 那三个 2GB 的归档包。定位到之后再决定是删、是转 OBS、还是加盘。'
      },

      {
        id: 'df-inode',
        cat: 'linux-storage',
        title: '磁盘没满但写不进去？查 inode',
        prompt: '`df -h` 看 /data 还有空间，可程序就是报"No space left on device"。',
        task: '查看 inode 的使用情况（而不是容量）',
        steps: [
          { title: '先看容量视图', about: '显示 100%，但看不出原因', cmd: 'df -h /data', ref: 'ls9-df', hint: ['先看容量视图：这一列已经顶到 100%，但它解释不了「明明还有空间却写不进」。', 'df ____ /data'], note: 'Use% 是 100%，先看到这个' },
          { title: '换成 inode 视图', about: '看是不是 inode 用满了', cmd: 'df -i /data', ref: 'ls9-df', hint: ['空间没满却写不进去，多半是另一种资源被耗尽 —— 数的是「个数」而不是字节，哪个选项切过去？', 'df ____ /data'], note: 'IUse% 同样是 100% —— 真的是 inode 用满了' }
        ],
        answer: 'df -i /data',
        alt: ['df -i', 'df -ih'],
        expect: /IUse%|IUsed/,
        teach: '**空间没满但写不进，第一反应就是 inode 用满**：小文件太多时 `du` 和 `df -h` 都看不出来，只有 `df -i` 能发现。删掉大量小文件即可恢复。'
      },

      {
        id: 'systemctl-status',
        cat: 'linux-user',
        title: '服务起不来，先看状态',
        prompt: 'myapp 服务访问不了，你要先确认它现在是什么状态。',
        task: '查看 myapp 服务的运行状态',
        steps: [
          { title: '看服务状态', about: '先确认是活着还是挂了', cmd: 'systemctl status myapp', ref: 'lu-systemctl', hint: ['服务能不能访问先别猜配置：哪个子命令给出它现在是活着还是挂了，顺带最近几行日志？', 'systemctl ____ myapp'], note: '只看状态用 status，它会给出 active/inactive 与最近几行日志' },
          { title: '确认是否开机自启', about: '重启后服务消失常是这里的问题', cmd: 'systemctl is-enabled myapp', ref: 'lu-systemctl', hint: ['现在活着不代表重启后还在：要查的是「开机自启」这个开关，看它是 enabled 还是 disabled。', 'systemctl ____ myapp'], note: 'enabled 表示开机自启；服务能做起来但重启后没了，问题常在这里' }
        ],
        answer: 'systemctl status myapp',
        alt: ['systemctl status myapp.service', 'systemctl status myapp -l'],
        expect: /active \(running\)|Main PID/,
        teach: '`status` 只给结论（active/inactive + 最近几行日志）。真正的报错原因要接着敲 `journalctl -u myapp -n 200` —— 这两条命令是排服务的固定组合。'
      },

      {
        id: 'journalctl-unit',
        cat: 'linux-user',
        title: '翻出服务日志的真正原因',
        prompt: '`systemctl status myapp` 说服务在跑，但业务报错。你要看它的详细日志。',
        task: '查看 myapp 服务最近 50 行日志',
        steps: [
          { title: '先确认服务在跑', about: '状态正常不代表业务正常', cmd: 'systemctl status myapp', ref: 'lu-systemctl', hint: ['先确认进程层面没挂 —— 状态正常不代表业务正常，但它是往下查日志的前提。', 'systemctl ____ myapp'], note: '状态正常不代表业务正常' },
          { title: '看服务日志', about: '真正的报错原因在这里', cmd: 'journalctl -u myapp -n 50', ref: 'lu-journalctl', hint: ['真正的报错原因在单元日志里：一个条件限定是哪个服务，另一个条件限定看多少行。', 'journalctl ____ myapp -n 50'], note: '-u 指定服务，-n 指定行数' }
        ],
        answer: 'journalctl -u myapp -n 50',
        alt: ['journalctl -u myapp.service -n 50', 'journalctl -u myapp --lines 50', 'journalctl -n 50 -u myapp'],
        expect: /query timeout/,
        teach: '`-u` 指定 unit，`-n` 指定行数。加 `-f` 可以实时跟踪，加 `--since "10 min ago"` 只看最近十分钟。**改完服务别只看 status，一定要看 journalctl。**'
      },

      {
        id: 'ss-listen',
        cat: 'linux-net',
        title: '确认端口到底有没有在监听',
        prompt: '外网访问不了 8080，第一步要确认本机服务是否真的在监听。',
        task: '查看所有 TCP/UDP 监听端口，并显示对应进程（不做域名解析）',
        steps: [
          { title: '看所有监听端口', about: '不解析域名，输出更干净', cmd: 'ss -tuln', ref: 'ln-ss', hint: ['先只回答一个问题：本机到底有没有在听这个端口。协议、监听状态、端口号要一起看，还别让它做域名解析。', 'ss -____'], note: '-t TCP、-u UDP、-l 只看监听、-n 不做域名解析' },
          { title: '看是哪个进程占的', about: '确认服务是否真的在监听', cmd: 'ss -tulnp', ref: 'ln-ss', hint: ['端口确实在听了，但还不知道是谁在听 —— 再补一个字母，把占用端口的进程也列出来。', 'ss -tuln____'], note: '能看到 java 占着 8080 —— 服务确实起来了' }
        ],
        answer: 'ss -tulnp',
        alt: ['ss -tuln -p', 'ss -t -u -l -n -p', 'netstat -tulnp', 'ss -tlnp'],
        expect: /LISTEN/,
        teach: '`-t` TCP、`-u` UDP、`-l` 只看监听、`-n` 不做域名解析（不加会卡在 DNS 上）、`-p` 显示进程。**没看到 8080 就说明服务没起来，不用去查防火墙** —— 这一步能省掉一半无效排查。'
      },

      {
        id: 'curl-head',
        cat: 'linux-net',
        title: '只看 HTTP 响应头',
        prompt: '你想快速确认本地 Nginx 返回的状态码和响应头，不要正文。',
        task: '向 http://127.0.0.1 发请求，只输出响应头',
        steps: [
          { title: '先取一次完整响应', about: '看看正文有多长', cmd: 'curl http://127.0.0.1', ref: 'ln-curl', hint: ['先用最朴素的形式请求一次：不加任何选项，看看正文有多长、状态码是什么，再决定要不要精简。', 'curl ____'], note: '正文只有几行 HTML' },
          { title: '只看响应头', about: '发 HEAD 请求，输出更干净', cmd: 'curl -I http://127.0.0.1', ref: 'ln-curl', hint: ['正文根本不用下载：只发一次「只要头部」的请求，输出会干净得多，哪个大写选项负责？', 'curl ____ http://127.0.0.1'], note: '发的是 HEAD 请求，输出干净得多' }
        ],
        answer: 'curl -I http://127.0.0.1',
        alt: ['curl --head http://127.0.0.1', 'curl -I http://127.0.0.1/', 'curl -I localhost'],
        expect: /HTTP\/1\.1 200/,
        teach: '`-I` 发 HEAD 请求，只看头不看正文，比 `curl -v` 干净得多。排 502/504 时配合 `-i`（带头带正文）和 `-w`（自定义耗时输出）就是完整三件套。'
      },

      {
        id: 'lsof-deleted',
        cat: 'linux-net',
        title: '磁盘满但 du 算不出来（进阶）',
        prompt: '`df` 说 /data 满了，`du` 加起来却差一大截。这是典型的"文件被删了但句柄没释放"。',
        task: '列出所有 link count 为 0 的已删除但被占用的文件',
        steps: [
          { title: '确认容量与占用对不上', about: '确认分区确实告满，且占用对不上账', cmd: 'df -h /data', ref: 'ls9-df', hint: ['容量和实际占用对不上，是这类问题的特征：先确认分区确实告满，再去解释算不出来的差额。', 'df ____ /data'], note: 'df 说 100%，但前面 du 加起来的量对不上' },
          { title: '找出被删但仍占用的文件', about: 'link count 为 0 的文件', cmd: 'lsof +L1', ref: 'mo-lsof', hint: ['文件已从目录里消失，但进程还攥着句柄，空间就不会释放 —— 要按「链接数小于 1」这个阈值筛，不按文件名找。', 'lsof +L____'], note: '+L1 表示 link count 小于 1，也就是已被删除' }
        ],
        answer: 'lsof +L1',
        alt: ['lsof -L1'],
        expect: /deleted/,
        teach: '输出里 `java 18442 root 7u REG ... /data/app/logs/app.log (deleted)` 就是元凶：文件已经不在目录里，但进程还持有句柄，空间没释放。处理办法是重启该进程，或用 `> /proc/<pid>/fd/<n>` 把它清空。'
      },

      /* ══════════════════════════════════════════════════════════════════
         下面几节补 linux-user 的空白：56 条记录原先只有 2 节课。
         这个分类讲的是**身份、权限、服务与主机状态**，也是接手一台陌生机器
         最先要问清楚的四件事：我是谁、谁能提权、文件归谁、服务在不在跑。
         用到的命令大多是这一轮新补齐的（chown / umask / hostnamectl / timedatectl /
         systemctl show / journalctl --disk-usage / update-alternatives …）。
         ══════════════════════════════════════════════════════════════════ */

      {
        id: 'lu-who-can-sudo',
        cat: 'linux-user',
        title: '这台机器上，谁可以提权',
        prompt: '接手一台别人搭好的生产机器，安全审计第一个问题就是："除了 root，还有谁能拿到 root 权限？" 答案不在 `/etc/passwd` 里，而在 sudo 的配置与用户所属的组里。',
        task: '查出 deploy 账号的身份、所属组，以及它为什么能提权',
        steps: [
          { title: '先看这个账号是谁', about: '一行拿到数字身份与全部所属组', cmd: 'id deploy', ref: 'lu-id', hint: ['要判断一个账号的权限，先拿到它的数字身份与全部所属组 —— 一条命令就能打全', 'id ____'], note: '注意 groups= 后面那一串：**附加组才是权限的真正来源**' },
          { title: '看它属于哪个提权组', about: '组的成员列表单独存在组数据库里', cmd: 'getent group wheel', ref: 'lu-getent', hint: ['组的成员列表单独存在组数据库里：用按名字查数据库的那条命令去查组，不是查 passwd', 'getent ____ wheel'], note: 'wheel 组的成员都有 sudo 权限（Debian 系对应的是 sudo 组）' },
          { title: '看它的 sudo 授权', about: '真正决定"能提权做什么"的文件', cmd: 'cat /etc/sudoers.d/deploy', ref: 'lu-sudo', hint: ['加入 wheel 只是"允许用 sudo"，**具体能执行哪些命令**写在单独的授权文件里，把它读出来', 'cat /etc/____.d/deploy'], note: 'NOPASSWD 且只放行了 systemctl 的三条子命令 —— 这是最小权限的正确写法' }
        ],
        answer: 'id deploy',
        alt: [
          'id deploy && getent group wheel',
          'id deploy | head -1'
        ],
        expect: /uid=\d+\(deploy\)/,
        teach: '**"能不能提权"由两件事共同决定，缺一不可**：① **是否在提权组**（RHEL 系是 `wheel`、Debian 系是 `sudo`，用 `getent group <组名>` 查成员）；② **sudoers 里授了什么**（`/etc/sudoers` 与 `/etc/sudoers.d/*`）。只看第一件事会得出错误结论 —— 进了 wheel 组但 sudoers 里被 `!` 排除、或者反过来单独给某个用户写了规则，都很常见。审计时按这个顺序查：`id` 拿全部组 → `getent group` 确认提权组成员 → 读 `sudoers.d/` 里的具体授权。三条实务纪律：**改 sudoers 必须用 `visudo`**（它保存时做语法检查；直接 `vim` 写错一个字符，所有人就都无法提权了，只能进单用户模式救）；**优先"授权具体命令"而不是 `ALL`**，像上面那样只放行 `systemctl restart myapp` 三条，即使这个账号被攻破，攻击者也只能重启这一个服务；**`NOPASSWD` 要慎用**（它让拿到该账号的人无需口令即可提权，适合自动化，不适合人）。'
      },

      {
        id: 'lu-key-perm-600',
        cat: 'linux-user',
        title: 'SSH 私钥权限不对，连不上',
        prompt: '刚把私钥拷到新机器上，`ssh` 却报 `WARNING: UNPROTECTED PRIVATE KEY FILE!` 并拒绝使用。这不是密钥坏了，而是**权限太开放**——SSH 认为"别人也能读的私钥"等于已经泄露。',
        task: '查看私钥当前权限，改成只有属主可读，并确认生效',
        steps: [
          { title: '先看权限到底是什么', about: '把权限、属主、属组、文件名一次打出来', cmd: 'stat -c "%a %U:%G %n" /root/.ssh/id_ed25519', ref: 'lu-stat', hint: ['用能自定义输出格式的那条命令，把权限、属主、属组、文件名四样一起打出来 —— 权限要八进制数字形式', 'stat -c "____" /root/.ssh/id_ed25519'], note: '权限 600、属主属组都是 root —— 这个是正确的状态' },
          { title: '顺手核对影子文件', about: '口令文件权限是最经典的检查项', cmd: 'stat -c "%a %U:%G %n" /etc/passwd /etc/shadow', ref: 'lu-stat', hint: ['同一类检查还有一处必看：存放口令哈希的那个文件，它的权限**必须比 passwd 更严**（000 或 640）', 'stat -c "%a %U:%G %n" /etc/passwd ____'], note: 'passwd 是 644（人人可读）、shadow 是 000 —— 这个反差就是要记住的点' },
          { title: '收紧权限并验证', about: '改完必须回读一次', cmd: 'chmod 600 /root/.ssh/id_ed25519 && stat -c "%a %n" /root/.ssh/id_ed25519', ref: 'lu-chmod', hint: ['改成"只有属主能读写"：三位八进制里，属主给读写、组和其他人什么都不给', 'chmod ____ /root/.ssh/id_ed25519 && stat -c "%a %n" /root/.ssh/id_ed25519'], note: '改完立刻回读 —— 这是权限类操作的标准收尾动作' }
        ],
        answer: 'stat -c "%a %U:%G %n" /etc/passwd /etc/shadow',
        alt: [
          'stat -c "%a %U:%G %n" /etc/shadow /etc/passwd',
          'stat -c "%a %U:%G %n" /etc/passwd /etc/shadow /etc/gshadow'
        ],
        expect: /shadow/,
        teach: '**SSH 对私钥权限是"宁可错杀"的**：只要组或其他人有任何权限，它就直接拒绝加载并给出 `UNPROTECTED PRIVATE KEY FILE` 警告。正确权限是 **`600`**（属主读写，其余无），`~/.ssh` 目录本身要 **`700`**，公钥 `644` 即可。对应的修复命令是 `chmod 600 私钥`。这一类"按权限做安全判断"的地方还有几处，值得一起记住：**`/etc/shadow` 必须 000 或 640**（口令哈希绝不能人人可读，而 `/etc/passwd` 是 644，两者反差正好用来记）、**`/etc/sudoers` 必须 440**（写宽了 sudo 会拒绝工作，所以 `visudo` 会强制检查）、**crontab 与 systemd unit 不能是组可写**（否则等于给了提权通道）。排查权限问题的通用三步：`stat -c "%a %U:%G %n"` 看清现状 → 对照"应该是什么"找出差异 → 改完**回读验证**。最后一条经验：**别用 `chmod -R 777` 解决问题**——它经常能把报错消掉，但同时把"谁能改这个文件"的边界彻底抹掉了，是安全审计里必报的项。'
      },

      {
        id: 'lu-umask-newfile',
        cat: 'linux-user',
        title: '为什么新建的文件别人能看',
        prompt: '你在生产机上写了个脚本，里面带数据库口令。`chmod 600` 之后一切正常 —— 但三天后同事说"你那个脚本我怎么也能读"。问题不在 `chmod`，而在**你创建它的时候**权限就已经是 644 了，中间那段时间谁都能读。',
        task: '查看当前 umask，改严之后验证新建文件的默认权限',
        steps: [
          { title: '看当前的权限掩码', about: '决定新建文件的默认权限', cmd: 'umask', ref: 'lu-umask', hint: ['新建文件的权限不是凭空来的，而是由一条"掩码"从默认值里减掉一些位。先把当前掩码打出来——这条命令本身就是答案，不带任何参数', '____'], note: '022 意味着：新建文件 644、新建目录 755 —— 同组和其他人都能读' },
          { title: '用符号形式看清楚', about: '加一个选项换成符号表示', cmd: 'umask -S', ref: 'lu-umask', hint: ['八进制数字不好读，加一个选项会换成"允许哪些权限"的符号形式', 'umask ____'], note: 'u=rwx,g=rx,o=rx —— 其他人和同组都能读' },
          { title: '改严并验证', about: '改完新建一个文件回读', cmd: 'umask 077 && touch /tmp/lu-secret.txt && stat -c "%a %n" /tmp/lu-secret.txt', ref: 'lu-umask', hint: ['把掩码改成"属主之外什么都不给"，然后**新建**一个文件验证 —— 注意：改掩码不影响已存在的文件', 'umask ____ && touch /tmp/lu-secret.txt && stat -c "%a %n" /tmp/lu-secret.txt'], note: '新建的文件直接就是 600，不需要再 chmod 一次' }
        ],
        answer: 'umask 077 && touch /tmp/lu-secret.txt && stat -c "%a %n" /tmp/lu-secret.txt',
        alt: [
          'umask 077 && touch /tmp/lu-secret.txt && stat -c "%a %n" /tmp/lu-secret.txt',
          'umask 077 && touch /tmp/lu-secret2.txt && ls -l /tmp/lu-secret2.txt'
        ],
        expect: /600 |rw-------/,
        teach: '**umask 是"默认权限的减法器"**：新建文件从 `666` 里减、新建目录从 `777` 里减。所以 `umask 022` 得到文件 `644`（**同组和其他人都能读**），`umask 077` 得到 `600`（只有属主能动）。这里有个非常实际的时序问题：**`touch secret.txt && chmod 600 secret.txt` 之间有窗口期**，文件已经以 644 存在过了，同期登录的人完全来得及读走。所以**敏感文件要靠 umask 在创建时就收紧，而不是事后 chmod**。几个适用场景：写含口令的脚本前先 `umask 077`；生产机的 `/etc/profile` 里设 `umask 027`（同组可读、其他人不可读，适合有运维组的场景）；CI 里生成凭据文件时显式设 umask。注意三条：**umask 只影响"之后新建"的对象**（改它不会动已有文件）；**umask 是进程属性、随 shell 走**（写在命令行里只对当前会话有效，要持久得写进 `~/.bashrc` 或 `/etc/profile`）；**目录的执行位有特殊含义**（目录没有 `x` 就进不去，所以 `777 - 022 = 755` 对目录是必要的，别把目录也压成 600）。'
      },

      {
        id: 'lu-service-wont-start',
        cat: 'linux-user',
        title: '服务起不来，日志在哪',
        prompt: '`systemctl start myapp` 之后 `status` 显示 `failed`，但屏幕上只有一句笼统的"启动失败"。要看**真正的报错**，得去 journal 里找 —— 而查日志的关键是"限定范围"，否则你会在几千行里翻。',
        task: '确认 myapp 的状态，并从 journal 里取出它最近的日志',
        steps: [
          { title: '看服务状态', about: 'status 会给出最近几行日志与退出码', cmd: 'systemctl status myapp --no-pager', ref: 'lu-systemctl', hint: ['排查服务问题永远从状态开始：它会给当前状态、主进程号，以及**最后几行日志**', 'systemctl status myapp ____'], note: '`--no-pager` 在脚本与非交互环境里必须加，否则会卡在分页器里' },
          { title: '看这个服务的全部日志', about: '按 unit 过滤 journal', cmd: 'journalctl -u myapp --no-pager', ref: 'lu-journalctl', hint: ['状态只给最后几行，要看完整输出得去 journal：用 `-u` 把范围限定到这一个服务', 'journalctl ____ myapp --no-pager'], note: '按 unit 过滤是查日志最基本的一步 —— 不带它就是在全系统日志里捞' },
          { title: '限定时间范围', about: '--since 把范围缩到最近', cmd: 'journalctl -u myapp --since "10 min ago" --no-pager', ref: 'lu-journalctl', hint: ['重启服务之后再查，日志又多了一截：把时间范围限定到最近十分钟，噪声立刻少下来', 'journalctl -u myapp --____ "10 min ago" --no-pager'], note: '`--since "10 min ago"` 支持这种自然语言写法，比记时间戳方便' },
          { title: '看服务到底是怎么配的', about: '连 drop-in 覆盖一起看', cmd: 'systemctl cat myapp', ref: 'lu-systemctl', hint: ['如果日志里说"找不到启动命令"或"参数不对"，就要回到 unit 文件本身：有一条子命令能把 unit 与所有覆盖片段一次打出来', 'systemctl ____ myapp'], note: '真正的配置可能被 /etc/systemd/system/*.service.d/ 里的 drop-in 覆盖 —— 这就是"改了没生效"的常见原因' }
        ],
        answer: 'journalctl -u myapp --since "10 min ago" --no-pager',
        alt: [
          'journalctl -u myapp --no-pager',
          'journalctl -u myapp --since "10 min ago"'
        ],
        expect: /My Web App|java\[/,
        teach: '**服务排障的顺序是固定的四步，顺序错了就要多绕**：① `systemctl status <服务> --no-pager` 看当前状态与最后几行；② `journalctl -u <服务>` 看这个服务的完整日志（**`-u` 是关键，不带它就是在全系统日志里捞**）；③ 日志不够就加 `--since "10 min ago"` / `--until` 限定时间窗，或 `-p err` 只看错误级别、`-f` 实时跟踪；④ 日志里指向配置问题时，`systemctl cat <服务>` 看 unit 与所有 drop-in 覆盖（**"改了没生效"十有八九是 drop-in 覆盖了你的值**），再用 `systemctl show -p <配置项>` 看最终生效值。两个必须记住的细节：**`--no-pager`** —— 不加它，`journalctl` 会进分页器，在脚本或非交互环境里直接卡住；**journal 自己会占磁盘** —— 排查完顺手 `journalctl --disk-usage` 看一眼，长期不清理的机器 journal 涨到几个 G 很常见，用 `journalctl --vacuum-size=500M` 或 `--vacuum-time=30d` 收缩（这也是"磁盘莫名其妙满了"的常见元凶之一，另一个是 `lsof +L1` 找被删但没释放的文件）。'
      },

      {
        id: 'lu-host-identity',
        cat: 'linux-user',
        title: '我到底在哪台机器上',
        prompt: '通过跳板机连了三层，`ssh` 窗口开了好几个。现在要执行一条**有破坏性**的操作，你得先百分之百确认：这是哪台机器、什么系统、什么内核、什么时间。敲错窗口的事故就是这么来的。',
        task: '确认当前主机名、发行版、内核版本与系统时间',
        steps: [
          { title: '确认主机名', about: '最直接的一条', cmd: 'hostname', ref: 'lu-hostname', hint: ['先拿到最不容易搞错的那个标识：这台机器叫什么名字。这条命令不带任何参数', '____'], note: 'web-prod-01 —— 与跳板机、测试机区分开' },
          { title: '看发行版与内核', about: '发行版与代号一起打出来', cmd: 'lsb_release -a', ref: 'lu-lsb-release', hint: ['装什么包、用什么包管理器取决于发行版：把它连代号一起打出来（加"全部"那个选项）', 'lsb_release ____'], note: 'EulerOS 2.0 (SP10) —— 属 RHEL 系，用 yum/dnf，不是 apt' },
          { title: '看内核版本', about: '内核决定可用的特性与模块', cmd: 'uname -r', ref: 'lu-uname', hint: ['遇到"某个特性不支持"，答案往往在内核版本上：只取内核版本号这一项', 'uname ____'], note: '5.10.0-60.18.0.50.oe2203.x86_64' },
          { title: '看时间与时区', about: '时间不对，日志排查全乱', cmd: 'timedatectl', ref: 'lu-timedatectl', hint: ['排查日志前必须确认时间是对的：看时区、看 NTP 是否同步 —— 一条命令全给，不带参数', '____'], note: 'Asia/Shanghai、NTP service: active —— 时间可信，日志时间线才有意义' }
        ],
        answer: 'lsb_release -a',
        alt: [
          'lsb_release -a',
          'cat /etc/os-release'
        ],
        expect: /EulerOS|Distributor ID/,
        teach: '**在敲任何有破坏性的命令之前，先花三秒确认"我在哪"。** 这四件事各管一摊：**主机名**（`hostname`）—— 区分生产/测试/跳板机，多窗口时最容易搞错；**发行版**（`lsb_release -a` 或 `cat /etc/os-release`）—— 决定包管理器（RHEL 系 `yum/dnf`、Debian 系 `apt`）与配置文件路径（`/etc/sysconfig/` vs `/etc/default/`），**照着网上的 Ubuntu 教程在 CentOS 上敲是经典事故**；**内核版本**（`uname -r`）—— 决定能用哪些特性（cgroup v2、eBPF、某些文件系统参数都跟内核版本绑定）；**时间与时区**（`timedatectl`）—— **时间不对，日志排查就是白费**，因为你没法把多个服务的日志按时间线对齐。两条实务建议：**把这一步做成习惯**（可以写进 `~/.bashrc` 的登录横幅，或在跳板机上把 `PS1` 带上主机名与生产标记，让"我在哪"一直可见）；**时间必须靠 NTP 同步而不是手工 `date -s`**（手工改时间会破坏日志时间线，而且容器与数据库对时间跳变非常敏感；`timedatectl set-ntp true` 才是正确做法，改时区用 `timedatectl set-timezone Asia/Shanghai`，注意时区只影响显示、不影响时间戳本身）。'
      },

      /* ══════════════════════════════════════════════════════════════════
         下面几节补 linux-storage 的空白：46 条记录原先只有 2 节课。
         选题都是"云主机上一定会遇到"的存储问题。
         ══════════════════════════════════════════════════════════════════ */

      {
        id: 'ls-growpart-after-resize',
        cat: 'linux-storage',
        title: '云盘扩容了，df 怎么还是原来的大小',
        prompt: '在控制台把数据盘从 200G 扩到了 500G，可登机器一看 `df -h /data` 还是 200G。这不是控制台没生效 —— 云上扩容分**三步**，你只做了第一步。',
        task: '看清磁盘与分区的实际大小，把分区和文件系统都扩到新容量',
        steps: [
          { title: '看磁盘与分区的大小', about: '磁盘已经变大、分区还没有', cmd: 'lsblk /dev/vdb', ref: 'ls9-lsblk', hint: ['先分别看"盘"和"盘上的分区"各自多大 —— 这一步能立刻看出卡在哪一级', 'lsblk ____'], note: '盘是 500G、分区 vdb1 还是 200G —— 差额就是"还没扩的部分"' },
          { title: '把分区扩到整块盘', about: '第二步：扩分区', cmd: 'growpart /dev/vdb 1', ref: 'ls9-growpart', hint: ['分区表还停在旧容量，要让它吃掉盘上新增的空间：参数是"设备名 + 分区号"，中间有空格', 'growpart /dev/vdb ____'], note: 'CHANGED: partition=1 —— 分区表已扩，但文件系统还是旧的' },
          { title: '扩文件系统并验证', about: '第三步：扩文件系统', cmd: 'resize2fs /dev/vdb1 && df -h /data', ref: 'ls9-growpart', hint: ['分区变大了，但文件系统自己的记录还是老大小，得再扩一次；扩完立刻回读确认', 'resize2fs ____ && df -h /data'], note: 'df 从 200G 变成 500G —— 三步走完才真正可用' },
          { title: 'XFS 要用另一个命令', about: '不同文件系统扩容方式不同', cmd: 'xfs_growfs /data', ref: 'ls9-growpart', hint: ['如果这块盘上是另一种常见文件系统（CentOS 默认那个），扩容命令完全不同 —— 它接收的是**挂载点**而不是设备名', '____ /data'], note: 'XFS 只能扩不能缩，且按挂载点操作 —— 与 ext4 的 resize2fs 正好相反' }
        ],
        answer: 'lsblk /dev/vdb',
        alt: [
          'lsblk /dev/vdb',
          'lsblk'
        ],
        expect: /vdb|NAME/,
        teach: '**云盘扩容是三步，少一步就等于没扩**：① **控制台扩容**（把云硬盘买大 —— 这一步之后 `lsblk` 里盘变大了）；② **扩分区**（`growpart /dev/vdb 1` —— 让分区表吃掉新增空间）；③ **扩文件系统**（`resize2fs /dev/vdb1` 或 `xfs_growfs /data` —— 让文件系统认得新容量）。**只在控制台点一下，`df` 永远不变** —— 这是云上最高频的"我明明扩容了"投诉。三个关键差异要记住：**ext4 用 `resize2fs`（接设备名，可扩可缩）**，**XFS 用 `xfs_growfs`（接挂载点，只能扩不能缩）** —— 用错命令会直接报错，不会静默改坏；**扩分区前先确认分区在盘的最后**（如果后面还有别的分区，`growpart` 无法把它们之间的空隙合并，得先规划）；**扩容前务必做快照** —— 分区表操作出错会让整块盘不可读，而云上快照是最便宜的保险。最后：`lsblk` 看的是"块设备层"，`df -h` 看的是"文件系统层"，**两者数字不一致就说明中间那一步没做**。'
      },

      {
        id: 'ls-umount-busy',
        cat: 'linux-storage',
        title: '卸载不掉：target is busy',
        prompt: '要换一块盘，`umount /data` 却报 `target is busy`。你没有在往那个目录读写，但系统就是不让卸 —— 因为**有进程正拿着它**。',
        task: '找出占用挂载点的进程，理解强制卸载的代价',
        steps: [
          { title: '查是谁占着这个目录', about: '按目录反查打开的进程', cmd: 'lsof +D /data', ref: 'ls9-umount', hint: ['`umount` 报 busy 不是系统抽风，而是"有进程拿着它"：要按**目录**去反查进程，有一个选项表示"递归看这个目录下的所有打开文件"', 'lsof ____ /data'], note: '能看到具体是哪个进程、打开了哪个文件 —— 常见元凶是自己 `cd` 进去过的那个 shell' },
          { title: '换一种更直观的看法', about: '按挂载点列占用者', cmd: 'fuser -m -v /data', ref: 'ls9-umount', hint: ['同一个问题的另一种问法：按"挂载点"列出所有正在使用它的进程，并且带上用户与命令名', 'fuser -m -v ____'], note: 'USER / PID / COMMAND 三列直接告诉你去退出哪个 shell、或停掉哪个服务' },
          { title: '看懒卸载是什么行为', about: '强制卸载的代价', cmd: 'umount -l /data', ref: 'ls9-umount', hint: ['如果实在等不了，有一种"先把挂载点从目录树摘掉、等占用者自己退出再真正释放"的做法 —— 它不是安全的常规手段', 'umount ____ /data'], note: 'lazy umount 只摘掉挂载点，**进程的写入还在继续**，此时拔盘/释放云盘会丢数据' }
        ],
        answer: 'lsof +D /data',
        alt: [
          'lsof +D /data',
          'fuser -m -v /data'
        ],
        expect: /COMMAND|USER|java|bash/,
        teach: '**`target is busy` 从来不是"系统抽风"，而是"有进程拿着它"**，而且最常见的元凶是**你自己**：某个 shell 的当前目录就在这个挂载点下（`pwd` 一看便知），或者某个服务的工作目录在里面。排查顺序是固定的：`lsof +D <挂载点>` 或 `fuser -m -v <挂载点>` 找出占用者 → 让它退出（退出 shell / `systemctl stop` 服务 / `kill` 进程）→ 再 `umount`。**三个"不要"**：**不要一上来就 `umount -l`**（lazy umount 只是把挂载点从目录树摘掉，**进程的写入仍在继续**，此时拔盘/释放云盘等于丢数据）；**不要在没停服务时 `umount -f`**（强制卸载会让进程拿到 I/O 错误，数据库可能因此损坏）；**不要用 `fuser -k` 图省事**（它是直接 kill 掉占用进程，生产上可能正好杀掉正在写数据的服务）。正确做法是**先停服务再卸盘**，并且在 `/etc/fstab` 里用 `nofail` 防止开机时因为盘没挂上而进不去系统。'
      },

      {
        id: 'ls-df-du-mismatch',
        cat: 'linux-storage',
        title: 'df 说用了 190G，du 加起来只有 120G',
        prompt: '磁盘告警了，`df` 显示 `/data` 用了 190G。你 `du -sh` 把每个目录加起来，只有 120G —— **中间那 70G 去哪了？** 先别急着找"被删的文件"，有两个更常见的原因。',
        task: '确认文件系统的预留空间，并算出它对大磁盘意味着多少容量',
        steps: [
          { title: '看文件系统的完整参数', about: '其中就有预留比例', cmd: 'dumpe2fs -h /dev/vdb1', ref: 'ls9-tune2fs', hint: ['文件系统的元数据里记着一项"给 root 预留多少百分比"：把它完整打出来找那一行', '____ -h /dev/vdb1'], note: 'Reserved block count 对应的就是默认 5% 的预留 —— **普通用户看不到、df 却算进"已用"**' },
          { title: '把预留比例降到 1%', about: '大磁盘上 5% 是几十 G', cmd: 'tune2fs -m 1 /dev/vdb1', ref: 'ls9-tune2fs', hint: ['纯数据盘（不装系统、不需要"盘满时还能登录"的保险）可以把预留降到 1%：改的是百分比那个选项', 'tune2fs -____ 1 /dev/vdb1'], note: '500G 的盘上，5% → 1% 直接释放出 20G' },
          { title: '回读确认改动生效', about: '改完必须复核', cmd: 'dumpe2fs -h /dev/vdb1 | grep -i "reserved block count"', ref: 'ls9-tune2fs', hint: ['改完要证明它真的生效了：把同一份参数再打一次，用关键词筛出那一行', 'dumpe2fs -h /dev/vdb1 | grep -i "____ block count"'], note: '预留块数变小 —— 这就是"多出来"的容量' }
        ],
        answer: 'dumpe2fs -h /dev/vdb1',
        alt: [
          'dumpe2fs -h /dev/vdb1 | grep -i "reserved block count"',
          'tune2fs -m 1 /dev/vdb1'
        ],
        expect: /reserved|Filesystem|Reserved/i,
        teach: '**`df` 和 `du` 对不上是正常的，而且有三个各不相同的经典原因**，要按顺序排除：① **预留空间**（ext4 默认给 root 留 5%，`df` 把它算进已用，`du` 看不到 —— **大磁盘上这是几十 G**，用 `tune2fs -m 1` 调到 1%；纯数据盘推荐这么做，系统盘保留 5% 以免盘满后连 root 都登不进去）；② **被删除但仍有进程持有句柄的文件**（`lsof +L1` 能查出来 —— 文件目录项没了、inode 还占着块，**重启进程或 `> /proc/<pid>/fd/<n>` 才释放**）；③ **稀疏文件 / 快照 / 硬链接重复计数**（`du` 对硬链接只算一次，`df` 不区分）。判断顺序建议：**先看预留**（一条 `dumpe2fs -h` 就知道，改一行就解决）→ **再用 `lsof +L1` 查句柄** → 最后才怀疑文件系统元数据。另外两个认知点：**`du` 统计的是"文件占了块"、`df` 统计的是"文件系统块分配情况"**，小文件多时两者本来就有差异（块对齐）；`df -i` 看的是 inode 用量 —— **inode 满了磁盘还有空间也写不进去**，那是另一类告警。'
      },

      {
        id: 'ls-lsblk-before-mount',
        cat: 'linux-storage',
        title: '接手一台机器：先搞清哪块盘挂在哪',
        prompt: '别人交接给你一台机器，上面挂了好几块盘。在动任何东西之前，你得先能回答三个问题：**有几块盘？各自多大？分别挂在哪、什么文件系统？**',
        task: '理清块设备与挂载点的对应关系，并看清盘与分区的层级',
        steps: [
          { title: '看整体拓扑', about: '盘、分区、挂载点的树形关系', cmd: 'lsblk', ref: 'ls9-lsblk', hint: ['要的是一张"盘 → 分区 → 挂载点"的树：不加任何参数就能看到层级缩进与挂载点那一列', '____'], note: '缩进表示父子关系；MOUNTPOINTS 一列为空说明那块盘还没挂上' },
          { title: '看单块盘的文件系统信息', about: 'UUID、类型、标签', cmd: 'lsblk -f /dev/vdb', ref: 'ls9-lsblk', hint: ['要写进 fstab 就得拿到 UUID 与文件系统类型：加一个选项把它们一起打出来', 'lsblk ____ /dev/vdb'], note: 'FSTYPE 与 UUID 正是 /etc/fstab 里要填的两项' },
          { title: '看物理盘本身', about: '型号与容量（不带分区）', cmd: 'lsblk -dp -o NAME,SIZE,TYPE,MODEL', ref: 'ls9-lsblk', hint: ['上一层的视角：只列物理设备、不展开分区，并且自定义要看的列（名字、容量、类型、型号）', 'lsblk ____ -o NAME,SIZE,TYPE,MODEL'], note: '-d 只看设备本身、-p 显示完整路径 —— 判断"这块盘是本地盘还是云盘"看 MODEL 列' }
        ],
        answer: 'lsblk',
        alt: [
          'lsblk',
          'lsblk -f /dev/vdb'
        ],
        expect: /NAME|vdb|MOUNTPOINT/,
        teach: '**`lsblk` 是存储排查的第一条命令**，因为它一次给出四个信息：**设备名、容量、层级关系、挂载点** —— 而 `df` 只给"已挂载的文件系统"，`fdisk -l` 只给分区表，两者都看不到"哪块盘没挂"。两个关键认知：**① 盘和分区是两层**（`/dev/vdb` 是盘、`/dev/vdb1` 是它上面的分区，扩容时要分别处理 —— 这正是上一节课的内容）；**② `MOUNTPOINTS` 为空 = 这块盘/分区没挂上**（云上最常见的浪费就是"买了盘忘了挂"，`df` 里根本看不到它，只有 `lsblk` 能发现）。写 `/etc/fstab` 时要用的三项：**UUID**（`lsblk -f` 的 UUID 列，比设备名可靠 —— 换插槽后 `/dev/sdb` 可能变成 `/dev/sdc`，UUID 不会变）、**文件系统类型**、**挂载选项**（数据盘建议加 `nofail`，避免盘不在时开机卡住）。最后一条经验：**动存储之前先 `lsblk` 截个图**，出问题时才知道"原来是什么样"。'
      },

      /* ══════════════════════════════════════════════════════════════════
         下面几节补 linux-net 的空白：56 条记录原先只有 3 节课。
         选题都是"网络说不清、必须靠数据分层定位"的那几类。
         ══════════════════════════════════════════════════════════════════ */

      {
        id: 'net-where-is-the-latency',
        cat: 'linux-net',
        title: '接口"很慢"，是网络慢还是服务端慢',
        prompt: '用户说接口慢。你没法登对方的机器，也没法看服务端的代码 —— 但你可以从**发起端**把这一次请求的耗时**拆成几段**：DNS 花了多久、建连接花了多久、TLS 握手花了多久、服务端思考了多久。',
        task: '把一次请求的耗时拆解，并重复采样看它是否稳定',
        steps: [
          { title: '把耗时拆成几段', about: '一次请求各阶段的耗时', cmd: 'curl -o /dev/null -s -w "DNS:%{time_namelookup} 连接:%{time_connect} TLS:%{time_appconnect} 首字节:%{time_starttransfer} 总计:%{time_total}\\n" https://www.huaweicloud.com/', ref: 'ln-curl-timing', hint: ['关键是把一次请求拆成阶段耗时：用自定义输出模板，把域名解析、建连、TLS 握手、首字节各自的耗时都打出来', 'curl -o /dev/null -s -w "DNS:%{____} 连接:%{time_connect} TLS:%{time_appconnect} 首字节:%{time_starttransfer} 总计:%{time_total}\\n" https://www.huaweicloud.com/'], note: '首字节 - 连接 = **服务端真正处理的时间**；这一段长就是服务端的问题，不是网络' },
          { title: '看状态码与下载量', about: '确认请求本身是成功的', cmd: 'curl -o /dev/null -s -w "状态:%{http_code} 大小:%{size_download}字节\\n" https://www.huaweicloud.com/', ref: 'ln-curl-timing', hint: ['慢也可能是"其实失败了在重试"：把状态码与响应体大小一起打出来，确认这次请求本身是成功的', 'curl -o /dev/null -s -w "状态:%{____} 大小:%{size_download}字节\\n" https://www.huaweicloud.com/'], note: '200 且大小正常 —— 请求是成功的，问题只在耗时' },
          { title: '重复采样看是否稳定', about: '区分"一直慢"与"偶发慢"', cmd: 'for i in 1 2 3; do curl -o /dev/null -s -w "%{time_total}\\n" https://api.example.com/v1/users; done', ref: 'ln-curl-timing', hint: ['一次快一次慢说明是抖动而非容量问题：在循环里重复请求，只输出总耗时，看几次之间的差异', 'for i in 1 2 3; do curl -o /dev/null -s -w "%{____}\\n" https://api.example.com/v1/users; done'], note: '三次都是同一个值 —— 稳定；若忽高忽低，方向就转向链路抖动或服务端排队' }
        ],
        answer: 'curl -o /dev/null -s -w "DNS:%{time_namelookup} 连接:%{time_connect} TLS:%{time_appconnect} 首字节:%{time_starttransfer} 总计:%{time_total}\\n" https://www.huaweicloud.com/',
        alt: [
          'curl -o /dev/null -s -w "DNS:%{time_namelookup} 连接:%{time_connect} TLS:%{time_appconnect} 首字节:%{time_starttransfer} 总计:%{time_total}\\n" https://api.example.com/v1/users',
          'for i in 1 2 3; do curl -o /dev/null -s -w "%{time_total}\\n" https://api.example.com/v1/users; done'
        ],
        expect: /DNS:|time_total|\d+\.\d+/,
        teach: '**"接口慢"要先分层，再定责** —— 而 `curl -w` 是客户端唯一能自己完成的拆解手段。几个字段的减法关系必须记住：**`time_namelookup`**（DNS 解析耗时，几十毫秒以上就有问题）；**`time_connect - time_namelookup`**（TCP 建连，跨地域通常几毫秒到几十毫秒）；**`time_appconnect - time_connect`**（TLS 握手，多了 2~3 个 RTT，所以长连接能省掉这部分）；**`time_starttransfer - time_appconnect`**（服务端处理 + 首字节传输 —— **这一段长就是服务端的问题**）；**`time_total`**（全程）。定责结论很直接：**DNS 长** → 换解析器或加本地缓存；**建连长** → 网络路径或对端 backlog 满；**TLS 长** → 会话复用没开（`--session-reuse`）或证书链太长；**首字节长** → 后端慢（去查应用与数据库，别再折腾网络）；**总计长但各段都短** → 传输大、带宽小。三个实务要点：**`-o /dev/null` 丢弃正文、`-s` 静默进度条**，否则输出会被污染；**要多次采样**（一次结果可能正好撞上抖动）；**`-w` 的模板里 `\\n` 要转义**，否则所有请求会挤在一行。最后一条经验：**加 `-w` 时别忘 `-s`**，否则进度条会和你的输出混在一起，脚本里解析会出错。'
      },

      {
        id: 'net-dns-resolution-wrong',
        cat: 'linux-net',
        title: '解析出来的 IP 不对',
        prompt: '应用连不上某个域名 —— 你在本地 `ping` 一下，发现解析出来的 IP 跟你预期的不一样。**是 DNS 缓存、是解析器配错、还是权威记录本身变了？** 需要一个能指定解析器来对照的工具。',
        task: '查清本机的解析器配置，分别用默认与指定的 DNS 服务器解析同一个域名',
        steps: [
          { title: '先看本机在用哪个解析器', about: '解析配置从哪来', cmd: 'cat /etc/resolv.conf', ref: 'ln-resolv-conf', hint: ['解析结果不对，先确认"本机问的是谁"：把解析器列表与 search 域打出来', 'cat /etc/____'], note: 'nameserver 有两行、还有 search 域 —— search 会决定短名字被补成什么后缀' },
          { title: '用本机解析器解析', about: '默认走系统的配置', cmd: 'dig +short www.huaweicloud.com', ref: 'ln-dig', hint: ['先问默认解析器拿一次结果，作为对照的基准', 'dig ____ www.huaweicloud.com'], note: '拿到一组 IP 作为基准' },
          { title: '换成公共 DNS 再解析一次', about: '对照是不是解析器的问题', cmd: 'dig @8.8.8.8 www.example.com', ref: 'ln-dig', hint: ['关键一步：**显式指定**一个外部解析器再问一次 —— 两次结果不同就说明是本机解析器或缓存的问题', 'dig ____ www.example.com'], note: '两次结果一致 → 权威记录就是这样，问题不在解析器' },
          { title: '反向解析确认归属', about: 'IP 反查域名', cmd: 'dig -x 192.168.1.10', ref: 'ln-dig', hint: ['反过来问：拿到一个 IP，想知道它对应哪个名字（排查"这个 IP 是谁"时常用）', 'dig ____ 192.168.1.10'], note: '反查依赖 PTR 记录，**内网 IP 反查不出来是正常的**，不能据此判断"没这台机器"' }
        ],
        answer: 'dig @8.8.8.8 www.example.com',
        alt: [
          'dig +short www.huaweicloud.com',
          'dig -x 192.168.1.10'
        ],
        expect: /ANSWER SECTION|DiG|PTR|IN\s+A/,
        teach: '**"解析不对"要分清三层**：**本机解析器配置**（`/etc/resolv.conf` 的 `nameserver` 与 `search`）、**递归解析器的缓存**（可能缓存了旧的 TTL）、**权威记录本身**（真的被改了）。`dig` 的价值就在于它能**显式指定要问哪台解析器**（`dig @8.8.8.8 …`），从而把前两层与第三层分开：**指定两个不同解析器结果不同 → 是缓存或解析器的问题**；**结果一致但和你预期不同 → 权威记录就是这样**。几个用法要点：**`+short` 只输出答案**（给脚本用），**不带它看完整报文**（要关注 `status`、`ANSWER SECTION`、`TTL` 三处 —— `status: NXDOMAIN` 是"域名不存在"、`SERVFAIL` 是"解析器自己出错"）；**`-x` 做反向解析**（依赖 PTR 记录，**内网 IP 反查不到很正常**，别据此判断机器不存在）；**`+trace` 从根域逐级问**（排查权威服务器配置错误时用，能看清是哪一级授权断的）；**`dig MX/TXT/NS` 查其它记录类型**（邮件与域名验证常要 TXT）。两个高频坑：**`/etc/hosts` 优先级高于 DNS**（解析结果和 `dig` 不一致时先看它 —— 那里常常躺着一条几年前加的临时记录）；**`search` 域会自动补后缀**（`ping db` 实际问的是 `db.<search域>`，跨命名空间访问失败经常是这个原因）。要长期确认解析是否正常，别靠 `ping`（它受 hosts、缓存、IPv6 优先级多重影响），**一律用 `dig` 或 `getent hosts`**。'
      },

      {
        id: 'net-tcpdump-did-it-arrive',
        cat: 'linux-net',
        title: '"我发出去了，对方说没收到"——抓包看真相',
        prompt: '应用日志说请求已发出，对端却说没收到。双方各执一词时，**唯一的事实来源是网卡上的包** —— 它到没到、有没有被拒绝、有没有重传，抓一次就知道。',
        task: '按端口抓一次包，再按"主机 + 端口"精确过滤并导出到文件',
        steps: [
          { title: '按端口抓一小批包', about: '先确认有没有流量', cmd: 'tcpdump -i any -nn port 80 -c 20', ref: 'ln-tcpdump', hint: ['要确认"包到底有没有来"，就得在网卡上抓：指定任意网卡、不做域名解析、按端口过滤、并且限制条数避免刷屏', 'tcpdump -i any -____ port 80 -c 20'], note: '-nn 不做名字解析（否则输出里全是反查、又慢又乱）；-c 20 抓够就停' },
          { title: '按主机与端口精确过滤', about: '缩小到关心的那条连接', cmd: 'tcpdump -i any -nn host 192.168.1.10 and port 3306 -c 50', ref: 'ln-tcpdump', hint: ['只按端口抓会把所有机器的流量都混进来：把"对端主机"也加进过滤条件，两个条件用逻辑与连接', 'tcpdump -i any -nn host 192.168.1.10 ____ port 3306 -c 50'], note: '只看这一对主机之间的 3306 —— 是"连不上"还是"连上了但慢"，包序列直接告诉你' },
          { title: '带内容抓包看报文', about: '看应用层到底发了什么', cmd: 'tcpdump -i any -nn -A -s 0 port 8080 -c 10', ref: 'ln-tcpdump', hint: ['协议层没问题时就要看内容了：加上"按 ASCII 打印"和"抓完整包长"两个选项', 'tcpdump -i any -nn -____ -s 0 port 8080 -c 10'], note: '-A 打印可读内容、-s 0 抓完整长度（默认只抓前 96 字节，会把内容截断）' }
        ],
        answer: 'tcpdump -i any -nn host 192.168.1.10 and port 3306 -c 50',
        alt: [
          'tcpdump -i any -nn port 80 -c 20',
          'tcpdump -i any -nn -A -s 0 port 8080 -c 10'
        ],
        expect: /listening on|IP |tcpdump:/,
        teach: '**抓包是"网络层事实"的唯一来源** —— 应用日志会说谎（缓冲区没刷、异步发送失败没记），对端也会说谎（日志级别不够、看错时间窗），而网卡上的包不会。判断"请求到没到"只要看一件事：**有没有对应的 SYN 包**。常见的三种抓包结论：**只有 SYN、没有 SYN-ACK** → 对端没响应（防火墙 DROP 掉了，而不是 REJECT，否则会有 RST）；**有 SYN 也有 RST** → 对端明确拒绝（端口没监听，或被 REJECT）；**三次握手完整但没有后续数据** → 连上了但应用没发/没回（问题在应用层，别再看网络）。`tcpdump` 的几个关键选项必须记牢：**`-i any`**（所有网卡，容器环境里尤其重要 —— **默认只抓第一块网卡，容器流量可能根本不经过它**）；**`-nn`**（不做主机名与端口名解析，否则会卡在 DNS 上）；**`-c N`**（抓够就停，**不加它 Ctrl+C 之前会一直刷**）；**`-s 0`**（抓完整包长，默认 96 字节会把内容截断）；**`-A`/`-X`**（ASCII / 十六进制打印载荷）；**`-w file.pcap`**（写文件，**生产上强烈推荐** —— 现场抓几秒，拿回本地用 Wireshark 慢慢分析，比在终端里看滚动输出高效得多）。三条纪律：**抓包有性能开销**（高流量机器上要限 `-c` 与过滤条件，别裸跑）；**内容可能含敏感信息**（`-A` 抓到的是明文，别随手贴到群里）；**容器与云环境要选对抓包点**（容器内抓、宿主机抓 docker0、还是云上的镜像流量，看到的包不一样 —— 这是"抓不到"的头号原因）。'
      },

      {
        id: 'net-kill-one-connection',
        cat: 'linux-net',
        title: '不重启服务，踢掉一条卡住的连接',
        prompt: '一台 Redis 客户端连接卡在异常状态，应用线程被它拖住。**重启服务能解决，但会伤到所有其它正常连接** —— 你要能只针对某一条连接动手。',
        task: '按目标地址与端口筛选出要处理的连接，并演示如何只关掉它们',
        steps: [
          { title: '按对端地址筛选连接', about: '只看与某个地址的连接', cmd: 'ss -K dst 203.0.113.10', ref: 'ln-ss-kill', hint: ['要精确处理某一条连接，先得能"按对端地址筛出来"：这个连接管理工具支持用一个表达式做过滤', 'ss -K dst ____'], note: '输出里列出被处理掉的连接 —— **它不只是"看"，而是真的把连接关掉**' },
          { title: '按目标端口筛选', about: 'Redis 的 6379', cmd: "ss -Kta 'dport = :6379'", ref: 'ln-ss-kill', hint: ['按服务维度处理更常见：用"目标端口等于某值"的表达式筛出所有连到那个服务的连接', "ss -Kta '____ = :6379'"], note: '这一条会一次性关掉所有指向 6379 的连接 —— **动手前务必先用不带关闭的形式确认范围**' },
          { title: '按状态筛选卡住的连接', about: '只踢异常状态的那些', cmd: "ss -Kta 'sport = :8080 state close-wait'", ref: 'ln-ss-kill', hint: ['最精准的用法是"按状态筛"：只处理处于某一种异常状态的连接（CLOSE-WAIT 表示对端已关闭、本端没关）', "ss -Kta 'sport = :8080 state ____'"], note: 'CLOSE-WAIT 堆积是"应用没正确关闭连接"的典型信号 —— 踢掉只是止血，根因要改代码' }
        ],
        answer: "ss -Kta 'dport = :6379'",
        alt: [
          'ss -K dst 203.0.113.10',
          "ss -Kta 'sport = :8080 state close-wait'"
        ],
        expect: /Netid|State|ESTAB/,
        teach: '**`ss -K` 的 K 是 kill** —— 它不是查看工具，是**按表达式关掉匹配的连接**，所以"先看清范围再动手"这条纪律在这里格外重要（正确姿势是先用不带 `-K` 的 `ss` 加上**同样的过滤表达式**看一遍，确认清单无误再真的执行）。语法是 `ss -K [状态] [表达式]`，常用表达式：**`dst <地址>` / `src <地址>`**（按对端或本端地址）、**`dport = :端口` / `sport = :端口`**（按端口）、**`state <状态>`**（按 TCP 状态）。它解决的是**"一条坏连接拖住整个进程"**这类问题，而重启服务是"用大锤打钉子"——会断开所有正常连接、清空连接池、可能触发下游雪崩。配套要认识的两个状态：**`CLOSE-WAIT`**（**对端已发 FIN，本端没关** —— 堆积说明应用的连接没被正确关闭，是代码/连接池的 bug，`ss -tan state close-wait | wc -l` 是常规巡检项）；**`TIME-WAIT`**（本端主动关闭后的正常等待，短连接压测时堆积是正常现象，靠 `tcp_tw_reuse` 缓解）。两个注意点：**内核要支持 `CONFIG_INET_DIAG_DESTROY`**（较新内核才有，老内核上 `-K` 会报错）；**它只关内核里的连接，应用侧的连接池仍以为这条连接可用**，所以踢完之后应用要能处理"连接被重置"（`Connection reset by peer`），否则会引发新的报错 —— **能用重启单个连接池/优雅摘流量解决时，优先用应用层手段**，`ss -K` 是最后的手段。'
      },

      {
        id: 'ls-findmnt-which-device',
        cat: 'linux-storage',
        title: '这个目录到底是哪块盘挂上来的',
        prompt: '`/data` 快满了，你要确认它**物理上落在哪块盘、什么文件系统、什么挂载参数**。`df` 只给设备名，而设备名可能是 LVM 逻辑卷、可能是软 RAID、也可能只是某个更大分区的子目录 —— 你需要一条**能反查挂载来源**的命令。',
        task: '反查某个目录的挂载来源，并校验挂载配置有没有问题',
        steps: [
          { title: '反查目录的挂载来源', about: '从路径倒推设备与参数', cmd: 'findmnt -T /data', ref: 'ls9-findmnt', hint: ['要从一个**目录**倒推出"它是谁挂上来的"：用专门做挂载关系查询的命令，参数指向那个目录', 'findmnt ____ /data'], note: 'TARGET/SOURCE/FSTYPE/OPTIONS 四列一次给全 —— 比 `df` 多了挂载参数' },
          { title: '校验整个挂载配置', about: '开机能不能挂上', cmd: 'findmnt --verify --verbose', ref: 'ls9-findmnt', hint: ['改过 fstab 之后最该做的一件事：让系统**逐条校验挂载配置**能不能成立（找出写错的 UUID、不存在的挂载点）', 'findmnt --verify --____'], note: '校验不通过的对象会在**下次开机时挂不上** —— 数据盘挂不上还只是服务异常，根分区挂不上就是起不来' }
        ],
        answer: 'findmnt -T /data',
        alt: [
          'findmnt -T /data',
          'findmnt --verify --verbose'
        ],
        expect: /TARGET|SOURCE|FSTYPE|fstab/,
        teach: '**`findmnt` 是"挂载关系"的专用查询工具，比 `df` 和 `mount` 都更适合排障**：`df` 只按文件系统汇总容量（看不到挂载参数、看不到未挂载的设备），`mount` 把全部挂载点一次性倒出来（几十行、难筛）。而 `findmnt` 支持**按目录反查**（`-T /data`）、**按设备反查**（`-S /dev/vdb1`）、**按类型筛**（`-t nfs4`）、**自定义输出列**（`-o TARGET,SOURCE,OPTIONS`），输出还是树形结构 —— **能直接看出"哪个挂载点在哪个挂载点之下"**（这对识别"分区挂在目录上、而目录里又挂了别的盘"很关键）。三个高频用法：**`findmnt -T <路径>`**（这个目录是谁挂的）；**`findmnt --verify --verbose`**（校验 `/etc/fstab`，**改完 fstab 必跑** —— 它能在重启前发现写错的 UUID 或拼错的挂载点，避免机器起不来）；**`findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS`**（一次性核对全部挂载的参数，尤其要看 `rw`/`ro`、`noatime`、`nofail` 这几项）。为什么"哪块盘"这件事值得单独学：因为**同一个路径背后可能是完全不同的存储层** —— 直接分区、LVM 逻辑卷、软 RAID、网络存储（NFS/iSCSI）、甚至容器里的绑定挂载。**扩容方式、性能特征、故障影响面全都不同** —— 不搞清底层就动手，很容易在 LVM 上直接去扩物理分区（无效），或者对 NFS 目录做本地快照（不存在）。'
      },

      {
        id: 'ls-io-bottleneck',
        cat: 'linux-storage',
        title: '服务变慢，怀疑磁盘 IO 打满了',
        prompt: '应用响应变慢，`top` 里 CPU 不高、`free` 里内存也够，**但 `%wa`（IO 等待）那一列很高**。你要回答两个问题：**磁盘是不是真饱和了**，以及**是哪个进程在读写**。',
        task: '按设备看 IO 饱和度，再按进程定位读写来源',
        steps: [
          { title: '按设备看 IO 饱和度', about: '关键看 %util 与 await', cmd: 'iostat -x -d -m 1 5', ref: 'ls9-iostat', hint: ['要判断"盘是不是忙不过来"，看的是每个设备的**扩展统计**：按秒采样若干次，容量用 MB 显示', 'iostat -____ -d -m 1 5'], note: '**`%util` 接近 100% 说明设备饱和**；`await` 是平均等待毫秒数，机械盘超过 20ms、SSD 超过几 ms 就该警惕' },
          { title: '只看目标盘并滤掉噪声', about: '盯着那一块盘看', cmd: 'iostat -x -d -y 2 10 | grep -E "Device|vdb"', ref: 'ls9-iostat', hint: ['设备多的时候输出会刷屏：跳过第一次统计（那次含开机以来的平均值）、只看关心的那块盘', 'iostat -x -d -____ 2 10 | grep -E "Device|vdb"'], note: '`-y` 跳过首次的累计平均值 —— 不加它，第一次输出会把开机以来的均值混进来' },
          { title: '按进程看谁在读写', about: '从设备下钻到进程', cmd: 'iotop -o -P', ref: 'ls9-iotop', hint: ['设备层确认饱和之后，要找出是谁：按进程维度看实时读写速率（只看真正在读写的那几个）', 'iotop ____ -P'], note: '`-o` 只显示有 IO 的进程、`-P` 按进程聚合（不按线程）—— 不加 `-o` 会列出一屏空转进程' },
          { title: '看读写量与累计', about: '换个维度核对', cmd: 'iotop -o -k -d 2', ref: 'ls9-iotop', hint: ['把速率单位换成 KB 更直观（默认是人性化单位），再指定刷新间隔', 'iotop -o -____ -d 2'], note: '输出里同时有**实际磁盘读写**与 **swap 换入换出** —— 后者非 0 说明内存压力已经在用磁盘顶了' }
        ],
        answer: 'iostat -x -d -m 1 5',
        alt: [
          'iostat -x -d -m 1 5',
          'iotop -o -P'
        ],
        expect: /Device|%util|await|TID|DISK READ/,
        teach: '**IO 瓶颈的判读要抓住三个量**：**`%util`**（设备有请求的时长占比 —— 接近 100% 就是饱和，**但要注意它衡量的是"有没有请求"，单线程顺序写也能把它打到 100% 而带宽远未跑满**）；**`await`**（平均完成时间，毫秒 —— 与设备类型对比：机械盘 10~20ms 正常、SSD 应该在个位数 ms、NVMe 更低，**突然变大就是盘或队列出问题了**）；**`r/s` + `w/s` 与 `rkB/s` + `wkB/s`**（IOPS 与带宽 —— **判断是"小随机 IO 打满 IOPS"还是"大顺序 IO 打满带宽"，这两类的优化方向完全不同**）。另外几个必须认识的列：**`aqu-sz`**（平均队列深度，持续大于设备能承受的值说明排队严重）、**`%iowait`**（这是 `top`/`vmstat` 里的 CPU 视角，**它高只说明"CPU 在等磁盘"，并不等于磁盘已饱和** —— 设备可能是闲着但单个请求很慢）、**`%steal`**（虚拟机被宿主机抢走的 CPU，云上常见）。排查顺序是**"设备层 → 进程层 → 应用层"**：`iostat -x` 确认是哪个设备饱和 → `iotop -o` 找出是哪个进程 → `pidstat -d` 或 `strace` 看它在做什么。三条实务要点：**`iostat` 第一次输出是开机以来的平均值，必须用 `-y` 跳过或用 `-d` 指定间隔**；**云盘的 IOPS/带宽有上限**（云厂商按盘型给配额，超了就排队 —— 这时的解法是升级盘型或拆分，不是调内核参数）；**别忽略 swap**（`si`/`so` 非 0 说明内存不足正在换页，那是"磁盘 IO 高"最常见的伪装）。'
      },

      {
        id: 'ls-disk-perf-baseline',
        cat: 'linux-storage',
        title: '这块盘的性能到底有多少',
        prompt: '云厂商说这台是"高性能 SSD"，但你感觉数据库就是慢。**"感觉慢"不是证据** —— 你需要用命令量出这块盘的**实际**随机读写 IOPS 与访问延迟，再和它的规格对比。',
        task: '量出目录的访问延迟，并对块设备做一次随机读基准测试',
        steps: [
          { title: '先量目录访问延迟', about: '最贴近应用的指标', cmd: 'ioping -c 20 /data', ref: 'ls9-ioping', hint: ['最快能拿到的一个指标是**访问延迟**：对目标目录做若干次小 IO，看平均与最坏耗时', 'ioping -c ____ /data'], note: '`min/avg/max/mdev` 四个值 —— **`max` 比 `avg` 更能反映体感**（平均值好看但毛刺多，应用照样卡）' },
          { title: '绕过缓存直接量块设备', about: '测真实设备而非页缓存', cmd: 'ioping -D -c 20 /dev/vdb', ref: 'ls9-ioping', hint: ['上一步可能命中了操作系统的页缓存：加一个"绕过缓存、直接访问块设备"的选项再测一次', 'ioping ____ -c 20 /dev/vdb'], note: '`-D` 走 O_DIRECT 绕过缓存 —— 与上一步的差值就是"缓存带来的加速"' },
          { title: '指定块大小再测一遍', about: '不同块大小的性能差很多', cmd: 'ioping -W -D -s 4k -c 20 /data', ref: 'ls9-ioping', hint: ['块大小直接影响延迟：加上"写测试"与"指定块大小"两个选项，按数据库最典型的值（4K）再测', 'ioping -W -D -____ 4k -c 20 /data'], note: '**随机写通常比随机读慢得多** —— 这个差值在机械盘上尤其明显' },
          { title: '跑一次标准随机读基准', about: '给出体面的 IOPS 数字', cmd: 'fio --name=randread --filename=/data/fio.test --ioengine=libaio --direct=1 --rw=randread --bs=4k --iodepth=32 --runtime=10 --size=1G --group_reporting', ref: 'ls9-fio', hint: ['要给出一份"能拿去汇报"的数字就得用专业工具：指定随机读、4K 块、队列深度 32、绕过缓存、跑 10 秒', 'fio --name=randread --filename=/data/fio.test --ioengine=libaio --direct=1 --rw=____ --bs=4k --iodepth=32 --runtime=10 --size=1G --group_reporting'], note: '输出里的 `IOPS=` 就是这块盘的随机读能力 —— 与云厂商规格对比即可' }
        ],
        answer: 'ioping -c 20 /data',
        alt: [
          'ioping -c 20 /data',
          'ioping -D -c 20 /dev/vdb'
        ],
        expect: /min\/avg\/max|ioping|IOPS|bw=/,
        teach: '**存储性能只看三个数：IOPS（每秒多少次 IO）、带宽（每秒多少 MB）、延迟（每次 IO 多少毫秒）—— 而这三者互相制约**，不同业务关心不同的那个：**数据库（OLTP）关心随机小 IO 的 IOPS 与延迟**（典型 4K 随机读），**大数据/备份关心顺序大 IO 的带宽**（典型 1M 顺序写），**虚拟化关心混合负载下的延迟毛刺**（`max` 比 `avg` 重要）。测量工具分两档：**`ioping`** 轻量、立刻可用、适合"快速拿一个数"（`-c` 次数、`-D` 绕过缓存、`-s` 块大小、`-W` 写测试）；**`fio`** 专业、参数多、能精确模拟任意负载（`--rw` 读写模式、`--bs` 块大小、`--iodepth` 队列深度、`--direct=1` 绕过缓存、`--runtime` 时长）。三个测量纪律：**必须绕过缓存**（`-D` / `--direct=1`，否则量到的是内存速度）；**必须给足预热与时长**（云盘有突发额度，前几秒的数字不代表稳态）；**必须清掉测试文件**（`fio` 会真的写出大文件，忘了删就是一次磁盘告警）。**测出来偏慢怎么办**：先确认**是不是云盘配额到顶**（云厂商按盘型限 IOPS/带宽，超了排队 —— 升级盘型或拆多块盘做条带）；再看**挂载参数**（`noatime` 能减少元数据写、`discard` 影响 SSD 寿命）；最后才考虑内核 IO 调度器（**NVMe/SSD 用 `none`、机械盘用 `mq-deadline`**）。最后一条经验：**别在业务高峰期做基准测试** —— 它本身就会把盘打满。'
      },

      {
        id: 'ls-lvm-why',
        cat: 'linux-storage',
        title: '为什么生产环境都用 LVM',
        prompt: '你的 `/data` 是直接建在分区上的（`/dev/vdb1`），现在要扩容 —— 于是你得停机、改分区表、再扩文件系统。**而同事那台用 LVM 的机器，可以直接在线加空间**。这层抽象到底带来了什么。',
        task: '看清物理卷、卷组、逻辑卷三层结构，并演示在线扩容',
        steps: [
          { title: '看物理卷层', about: '最底层的盘与剩余空间', cmd: 'pvs -o pv_name,pv_size,pv_free,vg_name', ref: 'ls9-pvcreate', hint: ['LVM 分三层，从最底层看起：每块物理盘（或分区）被标记成"物理卷"，这一层能看到它们的容量与**还剩多少没分配**', '____ -o pv_name,pv_size,pv_free,vg_name'], note: '`PFree` 那一列是关键 —— **它大于 0 就意味着"还能扩，而且不用停机"**' },
          { title: '看逻辑卷层', about: '实际被格式化的那些卷', cmd: 'lvs -o lv_name,vg_name,lv_size,lv_path', ref: 'ls9-lvcreate', hint: ['最上层是"逻辑卷"—— 它才是被格式化、被挂载的那个对象：把名字、所属卷组、大小与设备路径列出来', '____ -o lv_name,vg_name,lv_size,lv_path'], note: '`LV Path` 是 `/dev/vg-data/lv-data` 这种形式 —— **它就是 `/dev/mapper/...` 的另一种写法**' },
          { title: '在线扩一个逻辑卷', about: '一步完成扩容与扩文件系统', cmd: 'lvextend -L +50G -r /dev/vg-data/lv-data', ref: 'ls9-lvcreate', hint: ['LVM 最大的价值就在这一步：加"再加 50G"并**顺带把文件系统也扩了**（那个 `-r` 就是干这个的）', 'lvextend -L ____ -r /dev/vg-data/lv-data'], note: '**`-r` 会自动调 resize2fs / xfs_growfs** —— 没有它，扩了卷还得手工扩文件系统' },
          { title: '回读确认新容量', about: '改完必须验证', cmd: 'lvs -o lv_name,vg_name,lv_size,lv_path', ref: 'ls9-lvcreate', hint: ['扩完立刻回读：同一个列表再看一遍，确认大小真的变了', '____ -o lv_name,vg_name,lv_size,lv_path'], note: '大小已经变成新的值 —— 而且**服务全程没有中断**' }
        ],
        answer: 'lvs -o lv_name,vg_name,lv_size,lv_path',
        alt: [
          'lvs -o lv_name,vg_name,lv_size,lv_path',
          'pvs -o pv_name,pv_size,pv_free,vg_name'
        ],
        expect: /LV|VG|LSize|PV|PFree/,
        teach: '**LVM 在"物理盘"与"文件系统"之间插了一层抽象，换来四件事**：**① 在线扩容**（卷组里还有空闲空间时，`lvextend -r` 一条命令完成，不用停机 —— 这正是云上"盘不够了"的标准解法）；**② 跨盘拼容量**（卷组可以把多块盘合成一个池子，逻辑卷可以大于单块盘）；**③ 快照**（`lvcreate -s` 做写时复制快照 —— **备份数据库前打一个快照，就能拿到一致性副本**，这是它最被低估的价值）；**④ 灵活切分**（先在卷组里留出空闲，之后按需切给不同的卷，不用一开始就规划死）。**三层概念必须分清**：**PV 物理卷**（一块盘或一个分区被 LVM 接管，`pvs` 看）→ **VG 卷组**（PV 组成的池子，容量可以跨盘，`vgs` 看）→ **LV 逻辑卷**（从池子里切出来给文件系统用的"虚拟分区"，`lvs` 看）。扩容时的检查顺序是**"卷组还有没有空闲 → 有就直接 lvextend；没有就先加盘做成 PV 再 vgextend 扩卷组"** —— 所以 `pvs` 的 `PFree` 与 `vgs` 的 `VFree` 是日常最该看的两个数字。三个实务要点：**LVM 只解决"块设备层"，文件系统层的扩容靠 `-r` 代劳**（ext4 用 `resize2fs`、XFS 用 `xfs_growfs`，前者可扩可缩、后者只能扩）；**LVM 快照不是备份**（快照与源卷在同一组盘上，盘坏了快照一起没 —— 它的价值是"拿到一致性时间点"，之后要拷到别处）；**`lvextend -L +50G` 的加号别漏**（不带 `+` 是"改成 50G"，**如果原卷比 50G 大会直接报错或缩容，那是灾难**）。'
      },

      {
        id: 'ls-smart-disk-failing',
        cat: 'linux-storage',
        title: '磁盘要坏了：怎么提前知道',
        prompt: '一块数据盘开始报 IO 错误，应用偶尔卡一下又恢复。**磁盘故障通常不是突然发生的** —— 它在彻底坏掉之前会先出现"重分配扇区""待定扇区"这类预警信号。问题是：**这些信号默认不会主动通知你**。',
        task: '查看磁盘的健康自评与关键预警计数，并演示发起一次自检',
        steps: [
          { title: '看健康自评结论', about: '一句话的健康判断', cmd: 'smartctl -H /dev/sda', ref: 'ls9-smartctl', hint: ['最先看的那一项是"整体健康自评"：一条命令就能拿到 PASSED 或 FAILED 的结论', 'smartctl -____ /dev/sda'], note: '**PASSED 不等于没问题** —— 它只说明"还没烂到阈值以下"，真正的预警在下面的计数值里' },
          { title: '看几个关键预警计数', about: '比总评更早发现问题', cmd: 'smartctl -a /dev/sda | grep -E "Reallocated_Sector_Ct|Current_Pending_Sector|Percentage_Used"', ref: 'ls9-smartctl', hint: ['要更早知道，就得看具体计数值：把"已重分配扇区""待定扇区""寿命已用百分比"三项筛出来', 'smartctl -a /dev/sda | grep -E "Reallocated_Sector_Ct|Current_Pending_Sector|____"'], note: '**Reallocated 在涨 = 盘已经在用备用扇区了**；Current_Pending 非 0 = 有扇区读不出来等着重试' },
          { title: '发起一次自检', about: '让盘自己跑一遍', cmd: 'smartctl -t short /dev/sda && sleep 120 && smartctl -l selftest /dev/sda', ref: 'ls9-smartctl', hint: ['还可以让磁盘自己跑一遍自检（短自检约两分钟），跑完再看自检日志', 'smartctl -____ short /dev/sda && sleep 120 && smartctl -l selftest /dev/sda'], note: '自检日志里最近一次的 `%` 与结论就是它自己的判断 —— **短自检只查盘体，不查数据可读性（那是 long 自检的事）**' }
        ],
        answer: 'smartctl -a /dev/sda | grep -E "Reallocated_Sector_Ct|Current_Pending_Sector|Percentage_Used"',
        alt: [
          'smartctl -a /dev/sda | grep -E "Reallocated_Sector_Ct|Current_Pending_Sector|Percentage_Used"',
          'smartctl -H /dev/sda'
        ],
        expect: /Reallocated|Pending|PASSED|Used|not found|Usage/i,
        teach: '**SMART 是磁盘自己的健康报告，但它有三个"坑"必须知道**：**① 默认不主动报警** —— 需要装 `smartd`（或监控系统的 smart 插件）才会在异常时通知，否则你得自己定期跑；**② PASSED 是滞后指标** —— 它只在"已经烂到厂商阈值"时才变 FAILED，而**`Reallocated_Sector_Ct` 增长、`Current_Pending_Sector` 非 0 出现得早得多**，那才是你能提前介入的窗口；**③ 虚拟磁盘常常没有 SMART** —— 云盘、RAID 卡后面的盘、某些 NVMe 在虚机里读不到，报 `Unable to detect device type` 是正常的，此时要靠云厂商的盘健康指标。四个最该盯的属性：**`Reallocated_Sector_Ct`**（已用备用扇区替换的坏扇区数 —— **非 0 且持续增长 = 盘在恶化**）、**`Current_Pending_Sector`**（读写失败等待重映射的扇区 —— **非 0 就意味着有数据读不出来**）、**`Offline_Uncorrectable`**（离线扫描也修不好的扇区）、**`Percentage_Used`**（SSD 寿命已用百分比 —— 到 100% 不代表立刻坏，但写入会变慢、可靠性下降）。**发现预警怎么办**：**立刻备份数据**（这是第一位，不要先研究盘）、**准备替换**（云上直接换盘/换实例，物理机走 RAID 重建或迁移）、**记录取证**（`smartctl -x` 存一份完整输出，报障与索赔都要它）。最后：**SMART 只覆盖单块盘** —— RAID 卡后面、LVM 之下、云盘之上都还有别的故障模式，所以**"SMART 全绿"不等于"存储没问题"**，多层都要有自己的监控。'
      },

      {
        id: 'ls-raid-degraded',
        cat: 'linux-storage',
        title: '软 RAID 少了一块盘，你知道吗',
        prompt: '服务器的 RAID1 有一块盘坏了，但**机器照常运行、服务毫无感觉** —— 这正是 RAID 的设计目的，也正是它危险的地方：**不主动查，你不会知道现在只剩一块盘在扛**。',
        task: '查看软 RAID 的健康状态与阵列明细',
        steps: [
          { title: '看阵列状态', about: '一行看出有没有降级', cmd: 'cat /proc/mdstat', ref: 'ls9-mdstat', hint: ['软 RAID 的状态暴露在一个 proc 文件里：把它读出来，看每个阵列后面跟的是 `[UU]` 还是 `[U_]`', 'cat /proc/____'], note: '**`[UU]` 表示两块都在；`[U_]` 就是降级运行** —— 方括号里的每个字符对应一块盘' },
          { title: '看阵列明细', about: '哪块盘掉了、还能不能重建', cmd: 'cat /proc/mdstat && mdadm --detail /dev/md0', ref: 'ls9-mdstat', hint: ['要知道"具体是哪块盘、能不能重建"，得看阵列的详细信息（成员盘的状态、RAID 级别、重建进度）', 'cat /proc/mdstat && ____ --detail /dev/md0'], note: '`State` 一行会写明 `degraded`，`Active Devices` 会显示实际可用盘数' }
        ],
        answer: 'cat /proc/mdstat',
        alt: [
          'cat /proc/mdstat',
          'cat /proc/mdstat && mdadm --detail /dev/md0'
        ],
        expect: /md0|raid|UU|U_|Active/,
        teach: '**RAID 的核心承诺是"坏一块盘业务不中断"，但这个承诺有前提：你要在下一块盘坏之前把它换掉。** 而 RAID **不会主动告诉你**它降级了 —— 这就是为什么"巡检"必须包含这一项。读 `/proc/mdstat` 的要领就一个字：**方括号里的 `U` 与 `_`**（`[UU]` 全好、`[U_]` 降级、`[U__]` 只剩一块）；`mdadm --detail` 会给更多信息：RAID 级别、成员盘与它们的状态（`active sync` / `faulty` / `removed`）、`State: clean, degraded`、以及重建时的进度条。**发现降级后的处理顺序**：**① 先确认备份可用**（重建有风险，重建过程中再坏一块就全没了）；**② 查清是哪块盘坏**（`smartctl` 看它是不是真坏了，还是只是接触不良/被误拔）；**③ 换盘并重建**（热插拔换上新盘，`mdadm --add` 加进去，它会自动开始 rebuild）；**④ 重建期间别做重 IO 的事**（重建本身就要读遍所有盘，此时性能本来就降，再压上去会拖长窗口）。三个必须知道的点：**RAID 不是备份**（它防硬件故障，不防误删、不防勒索病毒、不防机房级灾难 —— 误删会同步到所有盘上）；**重建期间是最脆弱的窗口**（此时阵列没有冗余，且重建会给剩余盘很大压力，老盘很容易在这次压力下也挂掉）；**软 RAID 用 CPU 做校验**（RAID5/6 的写入性能受 CPU 影响，而 RAID10 更简单也更快，所以生产上 RAID10 比 RAID5 常见得多）。云上还有一层：**云盘本身已经是多副本的**（云厂商在底层做了冗余），所以在云上自己再做 RAID1 通常是浪费 —— **云上的冗余交给云盘，你要做的是跨可用区复制与备份**。'
      },

      {
        id: 'ls-new-disk-not-visible',
        cat: 'linux-storage',
        title: '新加的盘，操作系统怎么看不到',
        prompt: '你在控制台给这台机器挂了一块新盘，可 `df` 里没有它、`lsblk` 里也没有。**盘没坏，只是操作系统还不知道它存在** —— 从"硬件上线"到"能用"，中间还有好几步。',
        task: '查看磁盘的分区表，并确认块设备是否被系统识别',
        steps: [
          { title: '看这块盘的分区表', about: '盘在不在、有没有分区', cmd: 'fdisk -l /dev/vdb', ref: 'ls9-fdisk', hint: ['先确认这块盘本身在不在、有没有分区：用分区表工具列出它的信息（只列不改）', 'fdisk ____ /dev/vdb'], note: '能看到盘的容量与已有分区 —— **如果这里都看不到，说明盘根本没被识别**' },
          { title: '看系统识别到的块设备', about: '从设备层确认', cmd: 'lsblk /dev/vdb', ref: 'ls9-lsblk', hint: ['换个工具从块设备层确认：它给出的是"盘 → 分区 → 挂载点"的树形关系', 'lsblk ____'], note: '盘在但分区为空 —— 说明下一步要建分区表' },
          { title: '看设备的文件系统标识', about: '有没有格式化过', cmd: 'blkid /dev/vdb1', ref: 'ls9-blkid', hint: ['要确认"这个设备有没有被格式化过、是什么文件系统"：用专门读设备标识的命令（注意要指向**分区**而不是整块盘 —— 裸盘上本来就没有文件系统）', '____ /dev/vdb1'], note: '输出里有 UUID、TYPE、LABEL 三项 —— **UUID 正是写 fstab 要用的东西**（它比设备名可靠，换插槽也不变）' },
          { title: '进分区工具的交互界面', about: '看清它能做什么', cmd: 'fdisk /dev/vdb', ref: 'ls9-fdisk', hint: ['真要建分区得进交互界面：只敲设备名（不带任何选项）就会进入它自己的命令行，按 m 看帮助', '____ /dev/vdb'], note: '注意界面里的提示：**所有改动在按 w 之前都不会落盘** —— 这是它比图形工具安全的地方' }
        ],
        answer: 'fdisk -l /dev/vdb',
        alt: [
          'fdisk -l /dev/vdb',
          'lsblk /dev/vdb'
        ],
        expect: /Disk \/dev\/vdb|NAME|vdb|size|Sector/,
        teach: '**一块云盘从"挂上"到"能用"要经过五步，任何一步没做都会表现为"系统看不到这块盘"**：**① 控制台挂载**（把云盘挂到实例上）→ **② 系统识别块设备**（`lsblk` / `fdisk -l` 能看到裸设备；**看不到就 `partprobe` 重读分区表，或重新扫描 SCSI 总线** —— 热插的盘有时需要这一步）→ **③ 分区**（`fdisk` / `parted` 建分区；**大容量盘要用 GPT，MBR 只支持 2TB**）→ **④ 格式化**（`mkfs.ext4` / `mkfs.xfs`）→ **⑤ 挂载 + 写 fstab**（`mount` 并写进 `/etc/fstab` 才能开机自动挂）。判断"卡在哪一步"的方法：**`lsblk` 看得到裸盘、看不到分区 → 卡在 ③**；**看得到分区、`blkid` 没输出 TYPE → 卡在 ④**；**有 TYPE 但 `df` 里没有 → 卡在 ⑤**。三个高频坑：**`fdisk` 改动不按 `w` 不落盘**（这是它的保护机制，不是 bug —— 看到 "Changes will remain in memory only" 就说明还在缓冲）；**建完分区后内核可能没重读分区表**（`partprobe /dev/vdb` 或 `partx -u /dev/vdb` 让它重新识别，否则 `mkfs` 会报设备不存在）；**格式化会清空数据**（`mkfs` 执行前务必 `blkid` 确认这块盘是空的、`lsblk` 确认没挂载 —— 对已有数据的盘执行 mkfs 是不可逆的灾难，而且 `mkfs` 不会问你要不要确认）。'
      },      {
        id: 'net-route-missing',
        cat: 'linux-net',
        title: '能连外网，却连不上隔壁网段',
        prompt: '这台机器能访问公网，但**连不上 10.0.2.0/24 那批数据库**。`ping` 报 `Network is unreachable` 或根本没响应。这类"部分网段不通"几乎总是**路由表**的问题，而不是防火墙。',
        task: '查看路由表，查清到某个目标地址会走哪条路由',
        steps: [
          { title: '看完整路由表', about: '本机认识哪些网段', cmd: 'ip route show', ref: 'ln-ip-route', hint: ['先看本机"认识哪些网段"：把路由表完整打出来 —— 重点看有没有你需要的那个目标网段', 'ip ____ show'], note: '`default via …` 是默认路由（所有不认识的都走它）；其余每行是一个直连或静态网段' },
          { title: '查某个地址会走哪条路由', about: '让内核替你做匹配', cmd: 'ip route get 8.8.8.8', ref: 'ln-ip-route', hint: ['与其人肉比对掩码，不如直接问内核"去这个地址你会走哪条路" —— 这是最省事的判据', 'ip route ____ 8.8.8.8'], note: '输出会明确告诉你走哪个网卡、源地址是什么 —— **路由匹配是"最长前缀优先"，人肉比很容易错**' },
          { title: '加一条静态路由', about: '补上缺失的网段', cmd: 'ip route add 10.0.0.0/24 via 192.168.1.1 dev eth0', ref: 'ln-ip-route', hint: ['确认缺路由之后补一条：指定目标网段、下一跳地址与出接口', 'ip route add 10.0.0.0/24 ____ 192.168.1.1 dev eth0'], note: '**`ip route add` 是临时的，重启就没了** —— 要持久化得写进网络配置文件或 netplan' }
        ],
        answer: 'ip route get 8.8.8.8',
        alt: [
          'ip route get 8.8.8.8',
          'ip route show'
        ],
        expect: /via|dev|default|src/,
        teach: '**"部分网段不通"的排查顺序是"路由 → ARP → 防火墙"，而且必须按这个顺序** —— 因为三者的报错形态不同：**路由缺失**表现为 `Network is unreachable`（内核根本不知道该从哪出去，包都没发）；**ARP 解析不到**表现为 `Destination Host Unreachable`（知道该走哪，但下一跳的 MAC 拿不到）；**被防火墙 DROP** 表现为**超时无响应**（包发出去了但没人回）。能把这三者分开，就省掉了一半排查时间。`ip route` 的读法：**`default via <网关> dev <网卡>`** 是默认路由（不认识的目标都走它）；**`10.0.1.0/24 dev eth0 proto kernel scope link src 10.0.1.23`** 是直连网段（内核自动生成，`proto kernel` 标识）；**`10.0.2.0/24 via 10.0.1.1 dev eth0`** 是静态路由（有人手工加的）。**判断该走哪条路要按"最长前缀优先"**（不是按添加顺序！）—— 所以**别自己比掩码，用 `ip route get <目标IP>` 让内核回答**，它还会一并给出源地址（多网卡机器上"源地址选错"也是常见坑）。三个实务要点：**`ip route add` 是临时的**（重启失效，持久化要写 `/etc/sysconfig/network-scripts/` 或 netplan / NetworkManager）；**改默认网关很容易把自己关在门外**（远程操作时用 `ip route replace` 而不是先删后加 —— 中间那一瞬会断）；**容器/多网卡环境下要确认策略路由**（`ip rule` 决定"用哪张路由表"，只改 `main` 表可能不生效 —— 这是"改了路由却没效果"的常见原因）。'
      },

      {
        id: 'net-traceroute-where-broken',
        cat: 'linux-net',
        title: '连不上远端：断在哪一跳',
        prompt: '`ping` 一个外部地址不通。是**本机网关的问题**、**运营商链路的问题**，还是**对端根本没响应**？`ping` 只给你"通/不通"，你需要看到**逐跳**的结果。',
        task: '逐跳追踪到目标地址的路径，并用指定协议与端口探测',
        steps: [
          { title: '逐跳追踪（不做反解）', about: '看断在第几跳', cmd: 'traceroute -n 8.8.8.8', ref: 'ln-traceroute', hint: ['要看清"断在哪一跳"：逐跳探测到目标的路径，并且**不做域名反解**（否则每跳都要等 DNS，慢且乱）', 'traceroute ____ 8.8.8.8'], note: '每行是一个跳点与三次探测的延迟 —— **从哪一跳开始全是 `*`，问题就在那一跳之前**' },
          { title: '用 TCP 到指定端口探测', about: '绕过 ICMP 被限速的干扰', cmd: 'traceroute -T -p 443 -n example.com', ref: 'ln-traceroute', hint: ['默认用的是 ICMP，而很多网络对 ICMP 限速或直接丢弃：换成 TCP 并且指定一个真实在用的端口（比如 443）', 'traceroute ____ -p 443 -n example.com'], note: '**`-T` 用 TCP SYN 探测** —— 结果更接近真实业务流量的路径，是排障首选' },
          { title: '只探一跳确认直连', about: '最快的连通性判断', cmd: 'traceroute -I -q 1 -n 192.168.1.10', ref: 'ln-traceroute', hint: ['只想确认"隔壁这台通不通"时不用跑完整路径：限制到一跳、并且每跳只探一次', 'traceroute ____ -q 1 -n 192.168.1.10'], note: '`-q 1` 每跳只发一个包（默认三个）—— 快很多，适合脚本里做健康检查' }
        ],
        answer: 'traceroute -T -p 443 -n example.com',
        alt: [
          'traceroute -T -p 443 -n example.com',
          'traceroute -n 8.8.8.8'
        ],
        expect: /traceroute|hops|max|\d+\.\d+\.\d+\.\d+/,
        teach: '**`traceroute` 的原理是"逐步增大 TTL"** —— 发一个 TTL=1 的包，第一跳路由器把它丢掉并回一个 ICMP 超时消息，于是你就知道了第一跳是谁；再发 TTL=2 的包拿到第二跳……**所以它的每一行都是"那一跳路由器的回应"**，而 `*` 表示**那次探测没收到回应**。**读结果的关键是分清"三种 `*`"**：**中间某跳是 `*` 但后面的跳有响应** → 那一跳**只是不回应 ICMP**（很多路由器这么配以省 CPU），路径其实是通的，**不是故障**；**从某一跳开始全是 `*` 直到结束** → 那一跳之后确实断了（或对端不回 ICMP）；**每一跳都超时** → 本机出不去（查路由与网关）。这也是为什么 **`-T`（TCP 探测）比默认的 ICMP 更可靠** —— 它用业务真实的协议与端口，不会被"路由器不响应 ICMP"误导，也不容易被 QoS 降级。几个实用选项：**`-n`**（不反解 —— 必加，否则每跳等 DNS 会慢到无法忍受）；**`-q 1`**（每跳一个包，快）；**`-I`**（用 ICMP Echo，某些网络只有这个能过）；**`-w`**（等待超时秒数）；**`-m`**（最大跳数）。三个注意点：**`traceroute` 的结果是"去程"**（回程路径可能不同 —— 网络设备多路径时，"去通回不通"很常见，此时要看双向）；**它需要 ICMP 或特定端口的权限**（容器里可能要 `--cap-add=NET_RAW`）；**它给出的延迟是往那一跳的往返**（不能把每跳的差值当成"这一段耗时" —— 因为路由器处理探测包的优先级很低，可能引入虚高延迟）。最后：**`mtr` 是 `traceroute` 的"持续版"**（跑一段时间看每跳丢包率，比单次 traceroute 更能区分"偶发丢包"与"持续丢包"），生产排障更推荐。'
      },

      {
        id: 'net-port-who-holds-it',
        cat: 'linux-net',
        title: '端口被谁占着：从端口反查进程',
        prompt: '要启动一个服务，报 `Address already in use`。你知道端口号，但**不知道是哪个进程占着它** —— 可能是上次没退干净的自己，也可能是别人偷偷起的服务。',
        task: '按端口反查占用进程，并看某个进程打开了哪些网络文件',
        steps: [
          { title: '按端口反查进程', about: '最直接的问法', cmd: 'lsof -i:80', ref: 'ln-lsof', hint: ['最直接的问法：把"哪个进程打开了这个端口"列出来（按端口筛，格式是冒号加端口号）', 'lsof ____:80'], note: '输出里有 COMMAND、PID、USER 与连接状态 —— **拿到 PID 就能决定是协商还是直接停**' },
          { title: '列出全部网络连接', about: '看清这台机器的对外关系', cmd: 'lsof -i -P -n', ref: 'ln-lsof', hint: ['要看全貌：列出所有网络文件，并且**不做端口名与主机名解析**（否则输出既慢又难读）', 'lsof -i ____ -n'], note: '`-P` 不把端口号转成服务名、`-n` 不做 IP 反解 —— **这两个几乎是排障时的必加项**' },
          { title: '反查一个进程打开的网络', about: '换个方向问', cmd: 'lsof -p 12345', ref: 'ln-lsof', hint: ['反过来也能问：给一个进程号，看它打开了哪些文件（含网络连接、日志文件、库文件）', 'lsof ____ 12345'], note: '**"这个进程到底在读写什么"是排查"文件被占用/磁盘不释放"的核心手段**' },
          { title: '找已删除但被占用的文件', about: 'df 满而 du 算不出来的元凶', cmd: 'lsof +L1', ref: 'ln-lsof', hint: ['还有一类"看不见的占用"：文件已被删除、但进程还攥着句柄（空间因此不释放）—— 按"链接数小于 1"筛', 'lsof ____'], note: '**这是"df 说满了、du 加起来却不够"的经典原因之一** —— 处理办法是重启那个进程' }
        ],
        answer: 'lsof -i:80',
        alt: [
          'lsof -i:80',
          'lsof -p 12345'
        ],
        expect: /COMMAND|PID|USER|java|nginx/,
        teach: '**`lsof` 的字面意思是"list open files"，而 Linux 里"一切皆文件" —— 所以它能列出网络连接、设备、管道、目录，不只是普通文件**。这个视角带来三条高频用途：**① 从端口反查进程**（`lsof -i:<端口>` —— 解决 `Address already in use`）；**② 从进程反查它在读写什么**（`lsof -p <PID>` —— 排查"配置改了没生效""日志写到哪了"）；**③ 找"已删除但被占用"的文件**（`lsof +L1` —— **`df` 满而 `du` 算不出来的头号原因**）。几个必加的选项：**`-n`**（不反解 IP）、**`-P`**（不把端口转服务名）—— **不加这两个，`lsof -i` 会卡在 DNS 上几秒到几十秒**；**`-i`**（只列网络文件）、**`-u <用户>`**（只看某用户的）、**`-c <命令名>`**（只看某类进程）。与 `ss`/`netstat` 的分工：**`ss` 更擅长"看连接状态"**（ESTAB / TIME-WAIT / CLOSE-WAIT 的统计与过滤，更快更全），**`lsof` 更擅长"关联到进程与文件"**（能看到进程打开了哪些日志与库文件）。所以常规做法是：**用 `ss -tlnp` 快速定位端口 → 用 `lsof -p <PID>` 深入看这个进程在干什么**。两个注意点：**`lsof` 需要权限**（看别的用户的进程要 root —— 否则输出里那些进程会消失，**看起来像"没人在用这个端口"，反而误导**）；**它在大机器上很慢**（几十万文件描述符时要跑几秒，脚本里慎用）。最后一句经验：**`Address already in use` 的第一反应应该是"是不是我自己的上一个进程没退干净"** —— 尤其在你刚改完代码重启服务时。'
      },

      {
        id: 'net-link-mtu-down',
        cat: 'linux-net',
        title: '能 ping 通却传不了大文件',
        prompt: '一个小请求正常，**一传大数据就卡死或超时**。这类"小包能过、大包过不去"的现象，十有八九是 **MTU** 问题 —— 常见于 VPN、隧道、容器网络这些"多包了一层"的环境。',
        task: '查看网卡的链路状态与统计，并演示临时调整 MTU',
        steps: [
          { title: '看所有网卡的链路状态', about: 'up/down 与 MTU 一眼看到', cmd: 'ip link show', ref: 'ln-ip-link', hint: ['先看链路层：每块网卡是 up 还是 down、MTU 是多少、MAC 是什么 —— 一条命令全给', 'ip ____ show'], note: '`<BROADCAST,MULTICAST,UP,LOWER_UP>` 里 **`UP` 是管理状态、`LOWER_UP` 是物理链路真的通了** —— 两者都亮才算正常' },
          { title: '看某块网卡的详细信息', about: 'MTU 与链路层细节', cmd: 'ip link show eth0', ref: 'ln-ip-link', hint: ['要看**单块**网卡的细节（MTU、qdisc、状态标志、MAC）：把设备名作为参数传给链路查询', 'ip link show ____'], note: '`mtu 1500` 就是这块网卡的路径 MTU —— **隧道 / VPN / 容器 overlay 场景下它应当比默认值小**' },
          { title: '把 MTU 调小试试', about: '验证是不是大包过不去', cmd: 'ip link set eth0 mtu 1400', ref: 'ln-ip-link', hint: ['怀疑 MTU 时最直接的验证：把这块网卡的 MTU 临时改小（隧道/VPN 常用 1400 或更低）', 'ip link set eth0 ____ 1400'], note: '**改小之后大包能过就基本确认是 MTU 问题** —— 但这是临时验证，重启即失效' }
        ],
        answer: 'ip link show',
        alt: [
          'ip link show',
          'ip link show eth0'
        ],
        expect: /mtu|state|eth0|RX|TX/,
        teach: '**MTU（最大传输单元）问题的典型特征是"小包通、大包不通"** —— 因为 TCP 握手、DNS 查询、ping（默认小包）都能过，而一旦要传超过路径 MTU 的数据包就卡住。为什么难查：**路径上最小的那个 MTU 才是真正的限制**，而它可能出现在任何一跳（隧道封装、VPN 加密、容器 overlay 网络都会"吃掉"几十字节）。**验证方法**：`ping -M do -s <大小> <目标>`（`-M do` 禁止分片，从大到小试出能通过的临界值）—— **如果 1472 不通而 1400 通，就说明路径 MTU 大约是 1400+28**。三个层面的处理：**网卡 MTU**（`ip link set eth0 mtu 1400`，临时）、**路由级 MTU**（`ip route add ... advmss 1360`）、**MSS 钳制**（在网关上 `iptables -t mangle ... --clamp-mss-to-pmtu` —— **生产上最推荐这个，因为它对所有经过的流量生效**）。`ip link show` 的输出要会读：**`UP` 是管理状态**（`ip link set eth0 up` 控制）、**`LOWER_UP` 是物理链路**（插没插网线、对端有没有亮）—— **只有 `UP` 没有 `LOWER_UP` 说明网线/对端有问题**；`qdisc` 是排队规则（影响限速与延迟）；`-s` 的统计里 **`dropped` 常见于队列满、`errors`/`frame` 常见于物理层问题（网线、光模块、双工不匹配）**。最后三个高频场景：**容器网络**（overlay 网络 MTU 通常要比宿主机小 50~100 字节，**这是"容器里传大文件卡住"的经典原因**）；**VPN/隧道**（同样要多扣掉封装开销）；**云环境的安全组或中间设备**（有些会丢弃超大包而不回 ICMP "fragmentation needed"，导致 PMTUD 失效 —— 这就是为什么要显式钳制 MSS）。'
      },

      {
        id: 'lt-top-ip-谁在压站',
        cat: 'linux-text',
        title: '网站变慢：谁在压我 —— 从访问日志数出 Top IP',
        prompt: '站点白天开始变慢。运维第一反应是"有人在刷接口"。**访问日志有一百万行，你不可能肉眼找。** 你要在几秒钟内回答一个问题：**哪个 IP 请求最多？**',
        task: '用 awk 取字段、sort 排序、uniq 计数，找出请求量最大的来源 IP',
        steps: [
          { title: '先看清日志长什么样', about: '字段位置决定后面取第几列', cmd: 'head -2 /var/log/nginx/access.log', ref: 'lb-head', hint: ['动手前先看清数据格式：读前两行就知道每一列是什么 —— 第一列是来源 IP，第 4 列带时间，第 9 列是状态码', 'head -2 /var/log/nginx/____.log'], note: '**先看格式再写命令** —— 字段位置错了，后面所有统计都是错的（而且不报错）' },
          { title: '把第一列切出来', about: '只要 IP 这一列', cmd: "awk '{print $1}' /var/log/nginx/access.log | head -5", ref: 'lt-awk', hint: ['统计的第一步是"降维"：只把第一列留下 —— 按列处理的工具里，`$1` 就代表第一列', "awk '{print $____}' /var/log/nginx/access.log | head -5"], note: '**awk 默认按空白切列**，所以 `$1` 就是 IP' },
          { title: '排序后计数', about: 'uniq 只能数相邻的重复行', cmd: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5", ref: 'lt-nginx-top-ip', hint: ['计数要用三步走：**先 sort 把相同的排到一起**（uniq 只统计相邻重复行），再用 uniq 计数，最后按次数倒序排', "awk '{print $1}' /var/log/nginx/access.log | sort | ____ -c | sort -rn | head -5"], note: '**顺序不能换**：`sort | uniq -c` 是固定搭配，反过来 uniq 会把同一个 IP 数成好几条' },
          { title: '看前几名的绝对量', about: '判断是不是"异常得离谱"', cmd: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -3", ref: 'lt-nginx-top-ip', hint: ['缩小到前三名看清具体数字 —— 判据是"第一名比第二名高出一个数量级"才算异常流量', "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | ____ -3"], note: '**要看"断层"**：第一名远超其余说明是单一来源在压；前几名差不多则是正常流量分布' },
          { title: '把结果落盘留档', about: '排障证据要留下来', cmd: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5 | awk '{print $2}' > /tmp/top-ip.txt && cat /tmp/top-ip.txt", ref: 'lt-nginx-top-ip', hint: ['分析结果要留证据：把前几名的 IP 单独写进文件（再用一次同一条按列取值的命令，只取 IP 列、去掉前面的计数），方便后续封禁或交给安全同学', "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5 | awk '{print $____}' > /tmp/top-ip.txt && cat /tmp/top-ip.txt"], note: '**`uniq -c` 的输出是"计数 + 值"两列**，所以要再 `$2` 把纯 IP 取出来 —— 这个细节决定了封禁脚本能不能直接用' }
        ],
        answer: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5",
        alt: [
          "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5",
          "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -3"
        ],
        expect: /\d+ \d+\.\d+\.\d+\.\d+/,
        teach: "**`awk | sort | uniq -c | sort -rn | head` 是日志统计的\"万能骨架\"，值得背下来 —— 换一个 `$n` 就能回答一整类问题。** 四个环节各自不可替代：**`awk '{print $n}'`** 负责**降维**（把宽表切成只要的那一列）；**`sort`** 负责**把相同值排到一起** —— 这一步最容易被跳过，而 **`uniq` 只统计\"相邻\"的重复行**，不先排序会把同一个 IP 数成好几条（**这条命令最经典的错误就是这个**）；**`uniq -c`** 负责计数（`-c` 前缀计数）；**`sort -rn`** 负责按数值倒序（**`-n` 不能省**：不加它是按字典序，`9` 会排在 `10` 后面）。**换成别的列，就是另一个问题**：`$9` 是状态码 → 状态码分布；`$7` 是请求路径 → 最热的接口；`$1` 是来源 IP → Top 来源。**判断\"是不是攻击\"的判据**：**看断层** —— 第一名比第二名高一个数量级才是单一来源异常；前几名数量接近，那就是正常的流量分布（此时该查的是**接口本身变慢**，而不是\"谁在刷\"）。**一个必须知道的坑**：`uniq -c` 的输出是\"**计数 + 原值**\"两列，所以想拿纯 IP 再喂给封禁脚本，得再 `awk '{print $2}'` 一次 —— 很多人直接把带计数的输出贴进 `iptables`，结果规则写错了却不报错。**日志量大时的两个替代**：一是**先按时间窗截取再统计**（用 `sed -n \"/起/,/止/p\"`，见下一课）；二是**边读边聚合**（`awk` 里用数组累加，不需要 sort，适合上千万行：`awk '{c[$1]++} END{for (k in c) print c[k], k}' | sort -rn | head` —— **它的代价是全表进内存的哈希表**，字段基数特别大时要留意内存）。"
      },
      {
        id: 'lt-dedupe-large-file-大文件去重',
        cat: 'linux-text',
        title: '两个 G 的文件要去重，内存和磁盘都不够',
        prompt: '你要给一个 2GB 的 ID 文件去重（合并过几批导出，重复很多）。**`sort -u` 一跑机器就开始 swap，其他服务跟着报警。** 你既不能加内存，也不能停机 —— 怎么办？',
        task: '先用受限内存跑一次，再用分片归并的方式把内存占用压到可控',
        steps: [
          { title: '先看文件多大、有多少行', about: '规模决定策略', cmd: 'ls -lh /data/logs/all-ids.txt && wc -l /data/logs/all-ids.txt', ref: 'lb-wc', hint: ['策略由规模决定：先看清文件体积与行数 —— 这决定了"能不能一把 sort 下来"', 'ls -lh /data/logs/all-ids.txt && ____ -l /data/logs/all-ids.txt'], note: '**先量规模再选工具** —— 2GB / 千万行这个量级，直接 sort 会吃掉大量内存' },
          { title: '看一眼数据长什么样', about: '确认是不是纯 ID', cmd: 'head -3 /data/logs/all-ids.txt', ref: 'lb-head', hint: ['确认每行是不是就是一个 ID（如果一行里有多个字段，去重前得先切列）', 'head -____ /data/logs/all-ids.txt'], note: '每行一个 ID —— 这种结构最适合 `sort -u`（**如果一行多个字段，要先 `cut` 切出要比较的那一列**）' },
          { title: '指定临时目录与内存上限', about: '把压力从内存移到磁盘', cmd: 'sort -u -T /data/tmp -S 2G /data/logs/all-ids.txt > /data/logs/uniq-ids.txt && wc -l /data/logs/uniq-ids.txt', ref: 'lt-dedupe-large-file', hint: ['排序工具本身支持"内存不够就落盘"：把临时目录指到大盘上、并把内存上限调小，它就会自动分块排序再归并', 'sort -u -T /data/tmp -S ____ /data/logs/all-ids.txt > /data/logs/uniq-ids.txt && wc -l /data/logs/uniq-ids.txt'], note: '**`-T` 指定临时目录（要选空间大的盘）、`-S` 限制内存用量** —— 这是"用小内存排大文件"的正规做法' },
          { title: '切成分片再各自去重', about: '把大问题拆成小问题', cmd: 'split -l 5000000 /data/logs/all-ids.txt part- && ls part-* | head -5', ref: 'lb-split', hint: ['另一种思路是"分而治之"：先把大文件按行数切成若干小片，每片单独去重 —— 单片小到能放进内存', '____ -l 5000000 /data/logs/all-ids.txt part- && ls part-* | head -5'], note: '**`split -l` 按行数切** —— 切完之后每个分片都能独立处理，互不依赖（可并行）' },
          { title: '把分片结果归并起来', about: 'sort -m 是"归并"不是"重排"', cmd: 'for f in ./part-*; do sort -u -T /data/tmp "$f" -o "$f.u"; done && sort -m -u -T /data/tmp ./part-*.u > /data/logs/uniq-ids.txt && wc -l /data/logs/uniq-ids.txt', ref: 'lt-dedupe-large-file', hint: ['每片排好序后，因为"各片内部有序"，可以用**归并**（`-m`）而不是重新排序把它们合起来 —— 归并只需要同时读几个文件的开头，内存占用极小', 'for f in ./part-*; do sort -u -T /data/tmp "$f" -o "$f.u"; done && sort ____ -u -T /data/tmp ./part-*.u > /data/logs/uniq-ids.txt && wc -l /data/logs/uniq-ids.txt'], note: '**`-m`（merge）要求输入已经各自有序** —— 这是它能省内存的原因；乱序文件用 `-m` 会得到错误结果' }
        ],
        answer: 'sort -u -T /data/tmp -S 2G /data/logs/all-ids.txt > /data/logs/uniq-ids.txt && wc -l /data/logs/all-ids.txt /data/logs/uniq-ids.txt',
        alt: [
          'sort -u -T /data/tmp -S 2G /data/logs/all-ids.txt > /data/logs/uniq-ids.txt && wc -l /data/logs/uniq-ids.txt',
          'sort -u /data/logs/all-ids.txt | wc -l'
        ],
        expect: /^\s*\d+(\s+\S+)?\s*$/m,
        teach: '**大文件处理的核心矛盾是"内存放不下"，两条解法分别对应两种思路。** **思路一：让工具自己落盘（外部排序）** —— GNU `sort` 本来就会"内存放不下就写临时文件，最后归并"，所以你要做的是**把它的行为调对**：`-S`（或 `--buffer-size`）**限制内存用量**（默认会尽量多吃内存，正是它把机器压垮的原因），`-T`（`--temporary-directory`）**指定临时目录**（默认是 `/tmp`，常常是小盘或 tmpfs —— **tmpfs 用的是内存，等于没省**）。这一条命令就能解决大部分场景，**优先用它**。**思路二：自己分而治之** —— `split` 切片 → 各片 `sort -u` → `sort -m -u` 归并。它的额外好处是**可分片并行**（多核机器上比单进程 sort 快），代价是要管中间文件（**注意留足磁盘空间：中间产物可能比原文件还大**）。**`sort -m` 的语义必须记住**：它是**归并**，前提是**每个输入文件内部已经有序** —— 直接对乱序分片用 `-m` 会得到**看起来正常但实际错误**的结果（**这是本节最危险的一个坑，因为它不报错**）。**几个配套细节**：`-u` 可以去重（在排序过程中顺便做，比 `sort | uniq` 省一次遍历）；`-o file` 可以**原地写回同一个文件**（`sort -o f f` 是安全的，而 `sort f > f` 会**清空文件** —— 这是经典的自我毁灭写法）；**去重前先确认"什么算重复"**（整行相同？还是只看某列？后者要 `sort -u -k1,1` 或先 `cut`）。**最后一条排障经验**：这类命令**跑之前先看磁盘余量**（`df -h` 看 `-T` 指向的盘），**跑的时候用 `top` 确认内存没被吃光** —— 因为它们的失败方式往往是"把整台机器拖垮"，而不是自己报错退出。'
      },

      {
        id: 'lt-log-status-distribution',
        cat: 'linux-text',
        title: '日志里到底有多少错：状态码分布与错误归因',
        prompt: '业务反馈"接口偶尔 500"。你打开访问日志一看，**几万行里混着 200、404、500**，肉眼数不出来。老板问"错误率多少、坏的是哪个接口" —— 你要用两条命令回答。',
        task: '先数出各类状态码各有多少条，再把 5xx 归因到具体接口',
        steps: [
          { title: '先看清字段位置', about: '第几列是状态码', cmd: 'head -2 /var/log/nginx/access.log', ref: 'lb-head', hint: ['统计前先确认"状态码在第几列" —— 读前两行数一下：IP、时间、请求、状态码、字节数、来源……', 'head -____ /var/log/nginx/access.log'], note: '**第 9 列是状态码** —— 数错列是这类统计最常见的错误，而且它不报错，只是给出错的数字' },
          { title: '把状态码那一列切出来', about: '只留状态码', cmd: "awk '{print $9}' /var/log/nginx/access.log | head -5", ref: 'lt-awk', hint: ['降维：只要第 9 列 —— 按列处理的工具里 `$9` 就是第 9 列，先用 head 看几行确认切对了', "awk '{print $____}' /var/log/nginx/access.log | head -5"], note: '200 / 404 / 201 / 200 / 500 —— **先验证再统计**，这一步能挡住"列号写错"' },
          { title: '数出各类状态码各多少条', about: '排序后计数', cmd: "awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", ref: 'lt-nginx-status', hint: ['计数三步走：先排序把相同值排到一起（计数工具只统计相邻重复），再计数，最后按次数倒序', "awk '{print $9}' /var/log/nginx/access.log | sort | ____ -c | sort -rn"], note: '**8 个 200、3 个 500、3 个 404** —— 总数 15 行，所以 5xx 占 3/15 = 20%，这就是"错误率"' },
          { title: '把 5xx 归因到接口', about: '坏的是哪个接口', cmd: "awk '$9 >= 500 {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", ref: 'lt-nginx-status', hint: ['"错误率多少"只是现象，"哪个接口坏了"才是可行动的信息 —— 改成筛出 5xx，再按请求路径（第 7 列）计数', "awk '$9 >= ____ {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn"], note: '三个 `/api/orders/88xx` 各一条 —— **同一类接口集中报错**，这就能直接派给开发去查了' },
          { title: '单独确认 5xx 的条数', about: '用一个独立口径交叉验证', cmd: "grep -cE ' (500|502|503|504) ' /var/log/nginx/access.log", ref: 'lt-grep', hint: ['换个工具交叉验证同一个数字：用计数模式统计含 5xx 状态码的行数 —— **两个口径对得上才说明统计没错**', "____ -cE ' (500|502|503|504) ' /var/log/nginx/access.log"], note: '**3 条** —— 与上面 uniq 统计的 3 个 500 一致。**两条独立路径得到同一个数**，这个数字才敢往外报' }
        ],
        answer: "awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn",
        alt: [
          "awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn",
          "awk '$9 >= 500 {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn"
        ],
        expect: /\d+ (200|201|404|500)|\d+ \/api/,
        teach: "**报\"错误率\"之前必须把口径钉死，否则这个数字没有意义 —— 这是本项目反复强调的同一条道理。** 三个必须说清的口径：**① 分子是什么** —— 只算 5xx，还是 4xx 也算？（**4xx 是客户端问题，混进来会虚高，还会掩盖真正的服务端故障**；本站日志里 3 个 404 与 3 个 500 数量相同，混在一起算就是 40%，分开算各自 20%）；**② 分母是什么** —— 全部请求，还是只算动态接口？（静态资源占比高会把错误率稀释得很低）；**③ 时间范围** —— 全天平均，还是故障那几分钟？（**一次持续 3 分钟的雪崩，在\"全天 0.08%\"里完全看不出来**）。所以对外报数字的正确说法是\"**10:00–10:03 之间 /api/orders 的 5xx 占比 31%**\"这种带限定的描述。**`awk | sort | uniq -c | sort -rn` 是日志统计的万能骨架**，四个环节各自不可替代：`awk '{print $n}'` **降维**（切出要统计的那一列）；`sort` **把相同值排到一起**（**这一步最容易被跳过，而 `uniq` 只统计相邻重复行** —— 不先排序会把同一个值数成好几条，这是这条命令最经典的错误）；`uniq -c` 计数；`sort -rn` 按数值倒序（**`-n` 不能省**：不加它按字典序，`9` 会排在 `10` 后面）。**换一个列号就是另一个问题**：`$9` 状态码分布、`$7` 最热接口、`$1` Top IP、`$10` 流量大小。**最后一条工程习惯**：**用两条独立路径验证同一个数字**（`uniq -c` 与 `grep -c` 各算一遍）—— 这类统计最容易出的不是语法错，而是**列号写错导致的静默错误**，交叉验证是唯一能挡住它的办法。"
      },

      {
        id: 'lt-jq-json-fields',
        cat: 'linux-text',
        title: '从 JSON 里取值：别用 grep 去抠字段',
        prompt: '你要写个巡检脚本读配置文件（比如 Docker 的 `daemon.json`）。**用 `grep` 配正则去抠字段值？** 只要 JSON 换成单行、或者同样的键名出现在别处，你的正则就会给错值 —— **而且不报错**。',
        task: '用 JSON 处理器按键取值：取单项、取数组元素、验证字段是否存在',
        steps: [
          { title: '先看清 JSON 长什么样', about: '确认键名与嵌套结构', cmd: 'cat /data/iac/files/daemon.json', ref: 'lb-cat', hint: ['取值前先看清楚结构：哪些是顶层键、哪个键下面还嵌着对象 —— 键名要一字不差（注意连字符）', '____ /data/iac/files/daemon.json'], note: '顶层键有 `registry-mirrors` / `data-root` / `log-driver` / `log-opts` / `insecure-registries` —— **`log-opts` 里还嵌了一层**' },
          { title: '取一个顶层字段的值', about: '按键取值，不带引号', cmd: "jq -r '.log-driver' /data/iac/files/daemon.json", ref: 'lt-jq', hint: ['按路径取值：`.键名` 就是"顶层里的这个键"；加 `-r` 输出原始字符串（不加会带 JSON 引号，脚本里没法直接用）', "jq -r '.____' /data/iac/files/daemon.json"], note: '`json-file` —— **`-r` 是关键**：不加它输出是 `"json-file"`（带引号），拼进 shell 变量就会多两个引号' },
          { title: '取数组里的元素', about: '[] 展开数组', cmd: "jq -r '.registry-mirrors[]' /data/iac/files/daemon.json", ref: 'lt-jq', hint: ['这个键的值是个数组：用 `[]` 把它展开成多行 —— 一个元素一行，正好可以喂给下一个命令', "jq -r '.registry-mirrors____' /data/iac/files/daemon.json"], note: '`[]` 让数组"摊平"成逐行输出 —— **这是 jq 最实用的一个语法**，摊平后就能直接接 `sort`/`while read`' },
          { title: '用紧凑模式看整体', about: '-c 压成一行便于比对', cmd: 'jq -c . /data/iac/files/daemon.json', ref: 'lt-jq', hint: ['要对比两个版本的配置文件时，多行格式很占屏幕 —— 用紧凑模式把整个 JSON 压成一行输出', 'jq ____ . /data/iac/files/daemon.json'], note: '**`-c` 压成一行** —— 做配置 diff、或把 JSON 塞进日志一行里时用它' },
          { title: '确认取到的不是空值', about: '键写错会静默返回 null', cmd: "jq -r '.log-driver' /data/iac/files/daemon.json | grep -q json-file && echo '键存在且取值正确'", ref: 'lt-jq', hint: ['取值工具**路径写错时返回 `null` 而不是报错** —— 所以脚本里要显式验证：把取到的值交给判断，成立才继续', "jq -r '.log-driver' /data/iac/files/daemon.json | ____ -q json-file && echo '键存在且取值正确'"], note: '**这条验证不是多余的** —— 键名打错时 jq 会安静地给出 `null`，脚本继续往下跑，直到某个奇怪的地方才炸' }
        ],
        answer: "jq -r '.log-driver' /data/iac/files/daemon.json",
        alt: [
          "jq -r '.log-driver' /data/iac/files/daemon.json",
          "jq -r '.registry-mirrors[]' /data/iac/files/daemon.json"
        ],
        expect: /json-file|docker\.mirrors/,
        teach: '**"不要用正则解析结构化数据"是脚本化取值的头号原则 —— 而 JSON 是最容易踩这个坑的地方。** 用 `grep`/`sed` 抠 JSON 字段会在三种情况下**静默给出错值**：**① 格式变了**（JSON 压成一行、缩进改了，你的正则就匹配不到或匹配错）；**② 同名键出现在别处**（嵌套对象里有同名键，正则取到的是另一个）；**③ 值是数组或对象**（正则拿到的是 `[` 或者半个对象，而不是你要的值）。这三种都不报错 —— **这是最危险的一类失败**。正确做法是**用理解 JSON 语法的工具**：`jq`（通用）、`python -c "import json…"`、或语言自带的解析器。**jq 的四个必会点**：**`-r`**（原始输出，不加会带 JSON 引号）；**`.键名`**（按路径取值，嵌套就 `.a.b.c`）；**`[]`**（展开数组，一个元素一行 —— **摊平后能直接接管道**）；**`-c`**（紧凑输出，一行一个对象，适合 diff 与日志）。**三个必须知道的坑**：**① 路径写错返回 `null` 而不是报错** —— 所以脚本里要显式验证（`| grep -q 期望值 && echo ok`，或用 `jq -e` 让它按真假返回退出码）；**② 键名含连字符必须加引号** —— `.log-opts` 会被解析成"`.log` 减 `opts`"，要写成 `."log-opts"`（**这是 jq 最容易踩的语法坑，而且报错信息不直观**）；**③ 字段可能不存在**（不同版本的配置文件缺某个键是常态），要用 `// 默认值` 兜底或 `?` 抑制错误。**同类工具怎么选**：**`jq`** 管 JSON；**`yq`** 管 YAML（K8s 清单、CI 配置）；**CLI 自带的输出选项**（`kubectl -o jsonpath`、`docker --format`、云厂商 CLI 的 `--cli-query`）能在**不依赖外部工具**的前提下取值 —— 精简镜像里往往没有 jq，这时它们就是唯一选择。**最后一条判断标准**：如果你发现自己在为"取一个配置值"写正则，**停一下，先问这个格式有没有专门的解析工具** —— 有就用它，正则留给真正的非结构化文本。'
      }
,

      {
        id: 'lu-who-and-where',
        cat: 'linux-user',
        title: '我登的是哪台机器、以什么身份',
        prompt: '你 SSH 连上一台服务器，**同时开着好几个终端窗口**，其中一台是测试机、一台是生产库。敲错一条命令的代价可能完全不同。**开口执行任何操作之前，先确认"我在哪、我是谁"。**',
        task: '把当前机器与当前身份查清楚：主机名、内核、身份、登录来源',
        steps: [
          { title: '看我是谁', about: '身份决定了很多命令能不能执行', cmd: 'id', ref: 'lu-id', hint: ['第一件事确认身份：三条信息 —— 用户 id、主组 id、以及**附加组**（附加组往往决定了你能不能操作 docker、能不能提权）', '____'], note: '`uid=0(root)` —— **uid 0 就是超级用户**；注意 `groups=` 那一段，它列出你能访问哪些资源' },
          { title: '看机器叫什么', about: '主机名是最快的"我在哪"判据', cmd: 'hostnamectl', ref: 'lu-hostnamectl', hint: ['确认机器身份：一条命令给出主机名、虚拟化类型、以及系统标识', '____'], note: '`Static hostname: web-prod-01` —— **主机名一般就写着它的角色**（web / db / cache），这是运维给机器起名时的约定' },
          { title: '看内核版本', about: '装软件、查文档都要对版本', cmd: 'uname -r', ref: 'lu-uname', hint: ['看内核版本 —— 装驱动、对文档、报 bug 时都要用它；`-r` 只要版本号', 'uname ____'], note: '`5.10.0-…oe2203.x86_64` —— **`oe2203` 是 openEuler 22.03 的标记**，能一眼看出发行版' },
          { title: '看开机多久了', about: '刚重启过？还是跑了两周？', cmd: 'uptime', ref: 'lu-uptime', hint: ['看运行时长与负载 —— 排查"为什么要重启"或"负载高不高"时的第一眼', '____'], note: '`up 14 days` —— **刚重启过的机器要留意**（是不是有人重启来"解决"问题）；后面三个数是 1/5/15 分钟平均负载' },
          { title: '看谁在这台机器上', about: '有没有别人也在操作', cmd: 'w', ref: 'lu-w', hint: ['确认"只有我一个人在操作吗" —— 列出当前登录的会话和它们来自哪个 IP', '____'], note: '`FROM 203.0.113.25` —— **要养成看来源的习惯**：陌生 IP 登录是需要立刻警觉的信号' }
        ],
        answer: 'id',
        alt: [
          'id',
          'id deploy'
        ],
        expect: /uid=\d+\(/,
        teach: '**"我在哪、我是谁"是所有运维操作的前置检查，它只需要三条命令、两秒钟。** `id` 给出**身份三要素**：`uid`（用户）、`gid`（主组）、`groups`（附加组）—— **附加组最容易被忽略，但它决定了实际权限**：能不能操作 `/var/run/docker.sock`（即能不能用 docker）、能不能读某些日志、能不能提权，都看它。`id <用户名>` 还能查**别人**的身份（本站 `id deploy` 能看到它在 `wheel` 与 `docker` 组里）—— 这是审计「谁能提权」的第一步。**`uid=0` 就是 root**，而现代发行版更常见的做法是普通用户加入 `wheel` 组再用 `sudo` 提权 —— 这比直接用 root 更安全，因为**每条提权命令都会留审计记录**。`hostnamectl` 一条命令给出主机名、虚拟化类型（`kvm` / `docker` / 物理机）、操作系统标识；**主机名往往是"这台机器干什么"的第一线索**（`web-prod-01` 这种命名把角色、环境、序号都编进去了，是行业惯例，值得效仿）。`uname -r` 看内核版本，与 `lsb_release -a` / `cat /etc/os-release` 配合能拼出完整的"系统是什么"。`uptime` 的三个负载数（1/5/15 分钟）要**与 CPU 核数一起看**（`nproc`）—— 4 核机器上负载 4.0 就是满载，8 核上则只到一半。最后 `w` 与 `last`：**`w` 看"现在谁在"、`last` 看"最近谁来过"**，两者都是安全排查的入口 —— 出现陌生来源 IP 的登录，就该去查认证日志了。**一个能救命的小习惯**：让提示符常年显示"用户@主机:目录"（在 `~/.bashrc` 里定制 `PS1`，用它的用户、主机、目录三个转义符），或者至少在生产机器上把主机名贴在终端标题里 —— **"在错误的机器上敲了正确的命令"是运维最经典的事故**。'
      },

      {
        id: 'net-basic-reachability',
        cat: 'linux-net',
        title: '网络通不通：四步确定"卡在哪一段"',
        prompt: '同事说"连不上那台服务器"。**"连不上"这三个字包含至少四种完全不同的故障**：网卡没起来、路由不通、DNS 解析不了、服务没在听。**你需要一套固定顺序，把范围一段段缩小。**',
        task: '按"本机地址 → 网关 → 目标端口 → 应用响应"的顺序逐段验证',
        steps: [
          { title: '先确认本机有没有地址', about: '网卡没起来一切免谈', cmd: 'ip addr show eth0', ref: 'ln-ip-addr', hint: ['第一段：本机网卡有没有拿到 IP —— 一条命令看指定网卡的地址、状态与 MTU', 'ip addr show ____'], note: '**`state UP` + `inet 10.0.1.23/24`** —— 有地址才谈得上后面；`/24` 是掩码，决定了"哪些地址算同一个网段"' },
          { title: '看默认网关是谁', about: '出网的唯一出口', cmd: 'ip route', ref: 'ln-ip-addr', hint: ['第二段：要出本网段就得有默认路由 —— 看路由表里那条 `default` 指向谁', 'ip ____'], note: '`default via 10.0.1.1 dev eth0` —— **`via` 后面就是网关**；没有这一行就出不了网段（表现是"能连隔壁机器、连不上外网"）' },
          { title: 'ping 一下网关', about: '验证二层到网关这一段', cmd: 'ping -c 3 10.0.1.1', ref: 'ln-ping', hint: ['第三段：网关到底通不通 —— `-c 3` 只发 3 个包就停（不加会一直 ping，得按 Ctrl+C）', 'ping -c 3 ____'], note: '`0% packet loss` —— **丢包率与 RTT 都要看**；能 ping 通说明"本机到网关"这段链路与 ARP 都正常' },
          { title: '确认端口在不在听', about: '区分"网络不通"与"服务没起"', cmd: 'ss -tuln', ref: 'ln-ss', hint: ['第四段：地址通了不代表服务在 —— 列出本机所有监听端口，看你要的那个在不在', 'ss -____'], note: '**`0.0.0.0:8080` 说明在听所有网卡；如果是 `127.0.0.1:6379` 则只允许本机访问** —— 后者是"本机连得上、外面连不上"的头号原因' },
          { title: '确认应用真的会响应', about: '端口在听 ≠ 应用正常', cmd: 'curl -I http://127.0.0.1:8080/', ref: 'ln-curl', hint: ['最后一段：端口通了还要看应用回不回 —— `-I` 只要响应头（不下载正文），一眼看到状态码', 'curl -I http://127.0.0.1:____/'], note: '**`HTTP/1.1 404 Not Found` 本身就是好消息**：应用活着并回应了，只是这个路径不存在 —— 与"连不上"是完全不同的两类问题' }
        ],
        answer: 'ip route',
        alt: [
          'ip route',
          'ss -tuln'
        ],
        expect: /default via|LISTEN/,
        teach: '**"连不上"必须拆成四段来查，因为每段的判据和责任人完全不同。** **① 本机地址（`ip addr`）** —— 网卡有没有 IP、状态是不是 `UP`；没地址的话后面全是空谈。**② 路由（`ip route`）** —— 有没有 `default via <网关>`；**同网段互通不需要默认路由，跨网段才需要** —— 这解释了"能连隔壁机器但连不上外网"这类现象。**③ 端口（`ss -tuln`）** —— 服务有没有在听、听在哪个地址上；**`0.0.0.0` 与 `127.0.0.1` 的区别是排查"外面连不上"的第一判据**（绑定到回环地址的服务，从别的机器永远连不上，这不是防火墙问题）。**④ 应用（`curl -I`）** —— 端口通了不代表应用正常；**能拿到 HTTP 状态码就说明链路全通**，哪怕是 404/500 —— 那已经是"应用层问题"，与"网络不通"分属两个方向。**两个必须分清的错误信息**：**`Connection refused`** 表示**对端明确拒绝了**（端口没在听、或被防火墙 reject）—— 责任在"服务/规则"；**`Connection timed out`** 表示**包发出去了没有任何回应**（被防火墙 drop、路由黑洞、对端主机挂了）—— 责任在"路径/可达性"。**前者通常几毫秒就返回，后者要等几十秒超时**，这个时间差本身就是判据。**工具的分工**：`ping` 测的是 ICMP 可达性（**`ping` 不通不等于服务不通** —— 很多云主机的安全组默认禁 ICMP）；`curl` 测的是应用可达性；`ss` 测的是本机监听状态；**从"本机"能测到的只有前三段，第四段（外部能不能到）必须在对面或链路上测** —— 这就是为什么"我这边测是好的"经常说服不了对方。**云上还要多一层**：安全组与网络 ACL 在主机之外，**主机上看不到它们** —— 所以排查顺序应当是 `ss`（服务在不在）→ 本机 `curl`（应用通不通）→ 安全组放行（云控制台）→ 对端 `curl`（外部视角），**每一步都要留下证据**（命令与输出），而不是靠"应该没问题"。'
      },

      {
        id: 'basic-handover-zip',
        cat: 'linux-basic',
        title: '项目交接：看目录、拆路径、验压缩包',
        prompt: '要把 /data/app 交给同事。先确认目录层级与配置文件位置，再打成 ZIP；发送前必须核对压缩包里确实包含关键配置。',
        task: '看清项目结构与路径，把项目打包到 /data/backup，并列出包内清单验收',
        steps: [
          { title: '看项目层级', about: '快速确认子目录和关键配置文件是否存在', cmd: 'tree /data/app', ref: 'lb-tree', expect: /config\.yaml/, hint: ['交接前先看清目录层级；比递归的长列表更适合人工快速扫一眼的树形工具是什么？', '____ /data/app'], note: '先确认 config.yaml 真在项目里，别压错目录。' },
          { title: '只取文件名', about: '从绝对路径里剥掉目录前缀', cmd: 'basename /data/app/config.yaml', ref: 'lb-basename', expect: /^config\.yaml$/, hint: ['告知同事关键文件名时不需要整条绝对路径；取路径最后一段用哪个工具？', '____ /data/app/config.yaml'], note: '只返回 config.yaml，适合生成清单标题。' },
          { title: '只取所在目录', about: '确认关键文件应放回哪一层', cmd: 'dirname /data/app/config.yaml', ref: 'lb-dirname', expect: /^\/data\/app$/, hint: ['交接清单还要写明这个文件所在目录；与上一步相反，应留下路径前半段。', '____ /data/app/config.yaml'], note: '只返回 /data/app；文件名和父目录是两种不同信息。' },
          { title: '递归打包项目', about: '创建含完整子目录的交接包', cmd: 'zip -r /data/backup/app-handover.zip /data/app', ref: 'lb-zip', expect: /adding: app\/config\.yaml/, hint: ['目标是 ZIP 格式，源是整个目录；一定要打开递归选项，否则目录里的文件不会进去。', 'zip ____ /data/backup/app-handover.zip /data/app'], note: '确认输出包含 app/config.yaml；模拟终端使用教学格式，真实 ZIP 在真机上生成。' },
          { title: '验包内清单', about: '发送前检查关键配置是否真的在包里', cmd: 'unzip -l /data/backup/app-handover.zip', ref: 'lb-unzip', expect: /app\/config\.yaml/, hint: ['不必先解压；只列出归档清单，就能检查文件名与层级。', 'unzip ____ /data/backup/app-handover.zip'], note: '清单里看见 app/config.yaml 才算完成；仅看到 ZIP 文件存在不够。' }
        ],
        answer: 'zip -r /data/backup/app-handover.zip /data/app && unzip -l /data/backup/app-handover.zip',
        expect: /app\/config\.yaml/,
        teach: '交接的判据是压缩包内的文件清单，不是命令退出码或 ZIP 文件名。tree 用来先确认源目录；basename / dirname 分别取文件名和父目录；zip -r 收集整个目录；unzip -l 只读列清单。真实环境里还应把校验和与接收方核验步骤写进交接单。'
      }

  );
})();
