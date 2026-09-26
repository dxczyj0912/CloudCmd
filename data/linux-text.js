/* data/linux-text.js · 分类 02 文本处理三剑客 */
(function () {
  'use strict';

  var catId = 'linux-text';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ---------- 1 / 42 ---------- */
    {
      id: 'lt-grep',
      name: 'grep',
      alias: ['grep -r', 'grep -i', 'grep -v', 'grep -E', 'grep -o', 'grep -c', 'grep -n', 'grep -l', 'grep -A', 'grep -B', 'grep -C', 'grep -q', 'grep -w'],
      level: 1,
      syntax: 'grep [选项] <模式> [文件|目录]',
      summary: '按行筛选文本，日志排障与代码检索的第一把刀。',
      desc: '默认输出匹配到的整行，不改动任何文件。排障最常用的组合是 `-n` 定位行号、`-C 3` 看上下文、`-c` 数次数、`-v` 排除噪声；代码检索常用 `-r --include="*.log"` 限定范围、`-l` 只列文件名。',
      params: [
        { flag: '-r', desc: '递归搜索目录下所有文件，常配 `--include="*.log"` 限定后缀、`--exclude-dir=.git` 跳过目录' },
        { flag: '-i', desc: '忽略大小写，ERROR 与 error 一次搜全' },
        { flag: '-v', desc: '反向匹配：输出“不包含”该模式的行，用来排除噪声' },
        { flag: '-E', desc: '使用扩展正则，`+ ? | ( )` 直接写；基础正则里必须写成 `\\+ \\? \\| \\(`' },
        { flag: '-o', desc: '只输出匹配到的片段而不是整行，适合从日志里抠 IP、时间戳' },
        { flag: '-c / -n / -l', desc: '`-c` 只输出命中行数，`-n` 每行带上行号，`-l` 只列出命中的文件名' },
        { flag: '-A -B -C', desc: '`-A n` 显示命中行之后 n 行，`-B n` 显示之前 n 行，`-C n` 前后各 n 行' },
        { flag: '-w / -q', desc: '`-w` 整词匹配，`-q` 静默模式只用退出码判断（写进 `if` 里）' }
      ],
      examples: [
        { cmd: 'grep -rn --include="*.log" -C 3 "OutOfMemory" /var/log/nginx/', desc: '递归搜日志目录，命中行前后各显示 3 行上下文' },
        { cmd: 'grep -v -E "^#|^$" /etc/nginx/nginx.conf', desc: '排除注释行与空行，只看真正生效的配置项' },
        { cmd: 'grep -q "welcome" /usr/share/nginx/html/index.html && echo 页面正常', desc: '`-q` 不打印内容，只用退出码在脚本里做判断' }
      ],
      notes: [
        '`-v` 是反向匹配（排除），不是“详细模式”：`grep -v error app.log` 输出的是不含 error 的行',
        '基础正则（BRE）里 `+ ? | ( )` 都是普通字符，想用元字符含义要写 `\\+ \\? \\| \\(`，或者直接加 `-E`',
        '`grep -r` 命中二进制文件时只打印 `Binary file ... matches`，加 `-I` 跳过二进制，或加 `--include` 限定后缀',
        '`grep -q` 没匹配到时退出码是 1，配 `set -e` 的脚本会直接退出，应写成 `if grep -q ...; then`'
      ],
      related: ['lt-egrep', 'lt-fgrep', 'lt-grep-pcre', 'lt-rg'],
      docs: 'https://www.gnu.org/software/grep/manual/grep.html',
      tags: ['文本搜索', '正则', '日志', '过滤', '反向匹配', '取反', '排除']
    },

    /* ---------- 2 / 42 ---------- */
    {
      id: 'lt-egrep',
      name: 'egrep',
      alias: ['grep -E', 'grep -e', '扩展正则'],
      level: 2,
      syntax: 'egrep [选项] "<扩展正则>" [文件]',
      summary: '扩展正则版的 grep，写 + ? | () 不必再加反斜杠。',
      desc: '`egrep` 完全等价于 `grep -E`，输出一模一样。新版 GNU grep 已把它标记为废弃（obsolescent），启动时会提示一行警告，脚本里建议统一写 `grep -E` 以便长期维护；老脚本和考试题里的 `egrep` 见到要认识。',
      params: [
        { flag: '+ ? | ( )', desc: '扩展正则元字符：`a+` 一个或多个 a、`a?` 零或一个、`|` 或、`()` 分组；基础正则里要写成 `a\\+`、`a\\?`、`\\|`、`\\(\\)`' },
        { flag: '{n,m}', desc: '重复次数区间，如 `[0-9]{1,3}` 表示 1~3 位数字' },
        { flag: '-o', desc: '只输出匹配到的片段' },
        { flag: '-c', desc: '只输出命中行数' },
        { flag: '-v', desc: '反向匹配，输出不命中的行' }
      ],
      examples: [
        { cmd: 'egrep -c "ERROR|WARN" /var/log/app/app.log', desc: '一次统计两种日志级别各占多少行' },
        { cmd: 'egrep -o "GET|POST|PUT|DELETE" /var/log/nginx/access.log | sort | uniq -c | sort -rn', desc: '统计各 HTTP 方法的请求量' }
      ],
      notes: [
        '新版 GNU grep 会提示 `egrep is obsolescent; using grep -E`，功能与 `grep -E` 完全相同，换成 `grep -E` 即可消除',
        '写成 `grep "a|b"` 只能匹配字母 a、竖线或字母 b；要“或”的语义必须 `grep -E "a|b"` 或 `grep "a\\|b"`'
      ],
      related: ['lt-grep', 'lt-fgrep', 'lt-grep-pcre'],
      docs: 'https://www.gnu.org/software/grep/manual/html_node/Basic-vs-Extended.html',
      tags: ['正则', '扩展正则', '统计']
    },

    /* ---------- 3 / 42 ---------- */
    {
      id: 'lt-fgrep',
      name: 'fgrep',
      alias: ['grep -F', '固定字符串', 'fixed strings'],
      level: 2,
      syntax: 'fgrep [选项] "<固定字符串>" [文件]',
      summary: '把模式当纯字符串匹配，速度快且不用管正则元字符。',
      desc: '`fgrep` 等价于 `grep -F`。要搜的内容里带 `.` `*` `[` `$` `\\` 时（例如 IP `10.0.0.1`、`$PATH`、`a[0]`），用它可以省掉逐个转义，也不会因为正则写错而漏匹配；实现上是多模式匹配算法，关键词很多时比正则快一大截。',
      params: [
        { flag: '-c', desc: '只输出命中行数' },
        { flag: '-x', desc: '整行完全相等才算命中' },
        { flag: '-w', desc: '整词匹配，避免短词命中更长的词' },
        { flag: '-i', desc: '忽略大小写' },
        { flag: '-o', desc: '只输出命中的字符串本身' }
      ],
      examples: [
        { cmd: 'fgrep -c "10.0.0.1" /var/log/nginx/access.log', desc: '纯字符串计数，其中的点号不会被当成“任意字符”' },
        { cmd: 'grep -F -f /opt/app/conf/keywords.txt -r /var/log/app/ | head', desc: '把关键词文件里的词全部当纯字符串，批量扫日志目录' }
      ],
      notes: [
        'GNU grep 同样把 `fgrep` 视为废弃写法，脚本里建议用 `grep -F`，行为完全一致',
        '`fgrep` 不做正则解释，想用 `^` `$` 锚定行首行尾必须换成 `grep` 或 `grep -E`'
      ],
      related: ['lt-grep', 'lt-grep-file', 'lt-egrep'],
      docs: 'https://www.gnu.org/software/grep/manual/grep.html',
      tags: ['固定字符串', '查找', '性能']
    },

    /* ---------- 4 / 42 ---------- */
    {
      id: 'lt-grep-pcre',
      name: 'grep -P',
      alias: ['grep -P', 'PCRE', '零宽断言', 'lookahead', 'lookbehind'],
      level: 3,
      syntax: 'grep -P [选项] "<PCRE 模式>" [文件]',
      summary: '用 PCRE 语法做零宽断言与简写字符类，基础正则做不到的匹配。',
      desc: 'GNU grep 的 `-P` 调用 PCRE 引擎，于是 `\\d`、`\\s`、`\\w`、`\\b`、`(?=)`、`(?<=)`、`(?!` 都能用。断言是“零宽”的：只检查条件是否成立，不把字符算进匹配结果，所以 `-o` 打出来的内容里不含断言那部分，取键值对时特别好用。部分精简系统（busybox grep）不支持 `-P`。',
      params: [
        { flag: '-P', desc: '启用 PCRE 引擎（GNU grep 特有，busybox 不支持）' },
        { flag: '-o', desc: '只打印匹配片段，配断言可精确抠出目标值' },
        { flag: '\\d \\s \\w \\b', desc: 'PCRE 简写字符类：数字、空白、单词字符、单词边界' },
        { flag: '(?=) (?<=) (?!)', desc: '正向先行、正向后行、否定先行断言（零宽，不消耗字符）' },
        { flag: '\\K', desc: '丢弃左侧已匹配的内容，比反向断言更直观的写法' }
      ],
      examples: [
        { cmd: 'grep -oP "(?<=user=)[^&]+" /var/log/app/access.log | sort -u | head', desc: '取 user= 后面的值，且结果里不含 user= 本身' },
        { cmd: 'grep -oP "\\d{1,3}(\\.\\d{1,3}){3}(?=:)" /var/log/nginx/access.log | head', desc: '只取冒号前的 IP，冒号不进结果' }
      ],
      notes: [
        '`-P` 不是 POSIX 标准，busybox 或部分精简镜像里会报错，此时改用 `-E` 或安装 `ripgrep`',
        '断言零宽：`(?=x)` 不消耗 x，因此 `-o` 的结果里不会包含 x，别以为匹配丢了',
        '`\\d` 在基础正则里只是字母 d，只有加了 `-P` 才有“数字”的含义'
      ],
      related: ['lt-grep', 'lt-rg', 'lt-egrep'],
      docs: 'https://www.gnu.org/software/grep/manual/grep.html',
      tags: ['正则', 'PCRE', '零宽断言']
    },

    /* ---------- 5 / 42 ---------- */
    {
      id: 'lt-grep-file',
      name: 'grep -f',
      alias: ['grep -f', '批量关键词', 'grep -F -f'],
      level: 2,
      syntax: 'grep -f <模式文件> [选项] [文件]',
      summary: '从文件里批量读取匹配模式，一次筛出上百个关键词。',
      desc: '模式文件每行一个模式，`grep -f` 把它们一次性拿去匹配，等价于 `grep -e p1 -e p2` 但不受命令行长度限制，关键词几百上千个也不怕。默认按基础正则解释，关键词里含元字符时配 `-F` 当纯字符串用；配 `-v` 就成了“黑名单排除”。',
      params: [
        { flag: '-f <文件>', desc: '从文件读取模式，一行一个' },
        { flag: '-F', desc: '把模式当固定字符串，不做正则解释（推荐）' },
        { flag: '-w', desc: '整词匹配，避免关键词命中更长的单词' },
        { flag: '-v', desc: '反向：把命中关键词的行排除掉' },
        { flag: '-c', desc: '只统计命中行数，不给内容' }
      ],
      examples: [
        { cmd: 'grep -F -f /opt/app/conf/blacklist.txt /var/log/nginx/access.log | head', desc: '按黑名单关键词筛出可疑请求' },
        { cmd: 'grep -v -F -f /opt/app/conf/whitelist.txt /var/log/nginx/access.log | wc -l', desc: '用白名单反向排除，数出白名单之外的请求量' }
      ],
      notes: [
        '模式文件里不要留空行：空行会匹配所有行，配 `-v` 时会把整份日志全部排除',
        '关键词多的时候 `-F` 比正则快很多，关键词里含 `.` `*` `[` 时更应该加 `-F`，否则会被当正则解释'
      ],
      related: ['lt-grep', 'lt-fgrep', 'lt-grep-pcre'],
      docs: 'https://www.gnu.org/software/grep/manual/grep.html',
      tags: ['批量匹配', '关键词', '白名单']
    },

    /* ---------- 6 / 42 ---------- */
    {
      id: 'lt-zgrep',
      name: 'zgrep',
      alias: ['zgrep -i', '压缩日志搜索', 'bzgrep', 'xzgrep'],
      level: 2,
      syntax: 'zgrep [选项] "<模式>" <文件.log.gz>',
      summary: '不解压直接搜 .gz 压缩日志，省磁盘也省时间。',
      desc: '`zgrep` 是 gzip 套件带的脚本，内部用 `gzip -cdfq` 边解压边喂给 grep，因此选项写法与 grep 一致（`-i`、`-c`、`-E`、`-o`、`-l` 都可用）。归档日志通常按天切成 `access.log-20240501.gz`，翻历史问题全靠它；`.bz2` 用 `bzgrep`，`.xz` 用 `xzgrep`，`.zst` 用 `zstdgrep`。',
      params: [
        { flag: '-i', desc: '忽略大小写' },
        { flag: '-c', desc: '只输出命中行数' },
        { flag: '-E', desc: '使用扩展正则' },
        { flag: '-l', desc: '只列出命中的文件名' },
        { flag: '-r', desc: '递归搜索目录下的压缩文件' }
      ],
      examples: [
        { cmd: 'zgrep -c " 500 " /var/log/nginx/access.log-20240501.gz', desc: '从压缩归档里数出 5xx 请求条数' },
        { cmd: 'zgrep -i -r "OutOfMemory" /var/log/app/', desc: '在日志目录里递归搜所有压缩与未压缩文件' }
      ],
      notes: [
        '老版本 gzip 的 zgrep 不认 `--include`，可用 `find /var/log/nginx -name "*.gz" -exec zgrep -l "500" {} +` 代替',
        '压缩文件损坏时会报 `unexpected end of file`，先用 `gzip -t 文件.gz` 验证完整性再搜'
      ],
      related: ['lt-zgrep-r', 'lt-grep', 'lt-log-time-window'],
      docs: 'https://www.gnu.org/software/gzip/manual/gzip.html',
      tags: ['压缩日志', '检索', '归档']
    },

    /* ---------- 7 / 42 ---------- */
    {
      id: 'lt-zgrep-r',
      name: 'zgrep -r',
      alias: ['zgrep -r', 'zgrep -rl', '递归搜压缩日志'],
      level: 2,
      syntax: 'zgrep -r [选项] "<模式>" <目录>',
      summary: '在目录里递归搜全部压缩日志，一次翻遍历史归档。',
      desc: '按天切割并压缩的日志目录用一条 `zgrep -r` 就能搜完 `.gz` 与未压缩文件，是“用户三天前报的错现在要定位”的常用起手式。它对每个文件单独调用一次 grep，所以输出的行号是文件内行号而不是全局行号；文件很多时是串行解压，先用 `-l` 定位再精读更省时间。',
      params: [
        { flag: '-r', desc: '递归搜索目录' },
        { flag: '-l', desc: '只输出命中的文件名，先定位是哪天的日志' },
        { flag: '-c', desc: '每个文件输出命中行数' },
        { flag: '-i', desc: '忽略大小写' },
        { flag: '--include', desc: '限定文件名，如 `--include="*.gz"`（新版本支持）' }
      ],
      examples: [
        { cmd: 'zgrep -rl "NullPointerException" /var/log/tomcat/', desc: '先找出哪几天的归档里出现过这个异常' },
        { cmd: 'zgrep -rc " 500 " /var/log/nginx/ | sort -t: -k2 -rn | head', desc: '按文件的命中次数排序，找出 5xx 最集中的那一天' }
      ],
      notes: [
        '递归搜大目录会瞬间吃满一个 CPU 核（gzip 解压很费 CPU），生产机上先用 `-l` 或用日期范围收窄',
        '老版本 zgrep 不支持 `--include`，可改成 `find /var/log/nginx -name "*.gz" -exec zgrep -l "500" {} +`'
      ],
      related: ['lt-zgrep', 'lt-grep', 'lt-log-time-window'],
      docs: 'https://www.gnu.org/software/gzip/manual/gzip.html',
      tags: ['压缩日志', '递归', '排障']
    },

    /* ---------- 8 / 42 ---------- */
    {
      id: 'lt-rg',
      name: 'rg',
      alias: ['ripgrep', 'rg -t', '现代 grep'],
      level: 2,
      syntax: 'rg [选项] "<模式>" [路径]',
      summary: '比 grep 快数倍的现代搜索工具，默认递归并遵守 .gitignore。',
      desc: 'ripgrep 用 Rust 写成，并行遍历目录 + Rust regex 引擎，默认就递归、默认跳过 `.gitignore` 里的文件与二进制文件，还能按文件类型过滤。它用的是 PCRE 风格语法（`\\d`、`\\b`、`\\s` 直接可用，不必加 `-P`），输出按文件分组并带行号，交互式找代码基本可以完全替代 `grep -r`。',
      params: [
        { flag: '-t py / -T js', desc: '按文件类型只搜（`-t`）或排除（`-T`）某一类文件' },
        { flag: '-S', desc: '智能大小写：模式全小写时忽略大小写，含大写时精确匹配' },
        { flag: '-l / --files', desc: '`-l` 只列命中的文件名，`--files` 只列文件不做匹配' },
        { flag: '-g "!*.min.js"', desc: 'glob 过滤，`!` 开头表示排除' },
        { flag: '-A -B -C', desc: '上下文行，用法与 grep 一致' },
        { flag: '--hidden', desc: '连隐藏文件一起搜（默认跳过 `.` 开头的路径）' },
        { flag: '--no-ignore', desc: '不理会 `.gitignore`，把被忽略的目录也搜一遍' },
        { flag: '-P', desc: '切换到 PCRE2 引擎，需要 lookaround 或反向引用时使用' }
      ],
      examples: [
        { cmd: 'rg -n -t py "import requests" /opt/app/', desc: '只在 Python 文件里搜，自动跳过 .git 与二进制文件' },
        { cmd: 'rg -i "timeout" -g "*.conf" /etc/nginx/', desc: '只在 .conf 文件里忽略大小写搜 timeout' }
      ],
      notes: [
        '默认遵守 `.gitignore`，所以搜不到被忽略的文件；要一起搜得同时加 `--no-ignore --hidden`',
        '多数系统没预装：Ubuntu 用 `apt install ripgrep`，CentOS 用 `yum install ripgrep`，也可直接下载单文件二进制',
        'rg 默认的 Rust regex 不支持反向引用 `\\1` 与 lookaround，需要时加 `-P` 切到 PCRE2'
      ],
      related: ['lt-grep', 'lt-grep-pcre', 'lt-egrep'],
      docs: 'https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md',
      tags: ['搜索', '代码检索', '性能']
    },

    /* ---------- 9 / 42 ---------- */
    {
      id: 'lt-sed',
      name: 'sed',
      alias: ['sed s///g', 'sed -E', '替换', '流编辑'],
      level: 2,
      syntax: 'sed [选项] "<脚本>" [文件]',
      summary: '流式编辑文本，做批量替换与按行增删改的瑞士军刀。',
      desc: 'sed 按行读入、按脚本处理后输出，默认不改动原文件（想看效果就先不加 `-i`）。核心脚本是 `s/旧/新/标志`：不带 `g` 只替换每行第一处，带 `g` 替换全部；替换部分里 `&` 代表整个匹配内容，`\\1` 引用第 1 个分组。地址决定命令作用在哪些行，`1,10s///` 就是只改前 10 行。',
      params: [
        { flag: 's/旧/新/g', desc: '替换命令；不加 `g` 只换每行第一处，这是“替换没生效”的头号原因' },
        { flag: '-n', desc: '关闭默认输出，只打印脚本里带 `p` 的行' },
        { flag: '-i', desc: '原地修改文件（危险，见 `lt-sed-i`）' },
        { flag: '-E / -r', desc: '使用扩展正则，`+ ? | ( )` 不必转义' },
        { flag: '-e', desc: '追加一段脚本，可重复多次，等效于用分号分隔' },
        { flag: '&', desc: '在替换内容里代表“整个匹配到的字符串”' },
        { flag: '\\1 \\2', desc: '引用第 1、2 个捕获分组（配 `-E` 或 BRE 的 `\\( \\)`）' },
        { flag: '-f <脚本文件>', desc: '从文件读取 sed 脚本，脚本很长时用' }
      ],
      examples: [
        { cmd: 'sed "s/8080/9090/g" /etc/nginx/conf.d/app.conf', desc: '只输出到屏幕预览，确认无误后再考虑加 `-i`' },
        { cmd: 'sed -E "s#([0-9]{4})-([0-9]{2})-([0-9]{2})#\\3/\\2/\\1#" /var/log/app/app.log | head -3', desc: '用分组把 2024-05-01 改成 01/05/2024，分隔符换成 `#` 免得转义斜杠' },
        { cmd: 'sed "s/^/[backup] &/" /etc/crontab', desc: '`&` 代表整行内容，给每行统一加前缀' }
      ],
      notes: [
        '不加 `-i` 时 sed 只把结果打到屏幕，这是最安全的预览方式；加了 `-i` 的替换写错无法撤销',
        '`s///` 默认只替换每行第一处，忘了写 `g` 是“替换不生效”的最常见原因',
        '基础正则里 `+ ? | ( )` 要转义成 `\\+ \\? \\| \\(\\)`，少写反斜杠就加 `-E`',
        '`$` 在双引号里会被 shell 先展开，写脚本时优先用单引号包住 sed 脚本，或把 `$` 转义成 `\\$`'
      ],
      related: ['lt-sed-i', 'lt-sed-address', 'lt-awk', 'lt-grep'],
      docs: 'https://www.gnu.org/software/sed/manual/sed.html',
      tags: ['替换', '正则', '流编辑']
    },

    /* ---------- 10 / 42 ---------- */
    {
      id: 'lt-sed-i',
      name: 'sed -i',
      alias: ['sed -i', '原地修改', 'in-place', 'sed -i.bak'],
      level: 2,
      syntax: 'sed -i[\'.bak\'] "<脚本>" <文件>',
      summary: '直接改写文件内容，批量改配置的高效工具也是高危操作。',
      desc: '`-i` 表示 in-place：处理结果写回原文件。它并不是“生成新文件再改名”，而是重写同一个 inode，因此指向该文件的硬链接会一起变，已被进程打开的文件句柄仍指向旧内容（改完 `nginx.conf` 要 reload 才生效）。GNU sed 支持 `-i.bak` 先备份，macOS/BSD 的 sed 则强制要求 `-i` 后面跟后缀。',
      params: [
        { flag: '-i', desc: '原地修改；写成 `-i.bak` 会在修改前把原文件存一份 `文件.bak`' },
        { flag: '-i \'\'', desc: 'macOS/BSD sed 的写法：`-i` 后必须跟一个后缀，空串表示不留备份' },
        { flag: '-n', desc: '关闭默认输出，只打印带 `p` 的行' },
        { flag: '-E', desc: '使用扩展正则' },
        { flag: '-s', desc: '把多个输入文件当独立文件处理，行号与 `$` 各自独立（GNU 扩展）' }
      ],
      examples: [
        { cmd: 'sed -i.bak "s/8080/9090/g" /etc/nginx/conf.d/app.conf', desc: '改动前自动留一份 app.conf.bak，出问题能立刻还原' },
        { cmd: 'grep -rl "old.example.com" /etc/nginx/ | xargs sed -i.bak "s/old.example.com/new.example.com/g"', desc: '先列出含旧域名的配置文件，再批量原地替换' }
      ],
      notes: [
        '`-i` 不可撤销：模式写错会静默破坏文件，务必先用 `sed "s/…/…/" 文件` 预览，或加 `-i.bak` 留备份',
        'macOS（BSD sed）必须写 `sed -i \'\' "s/a/b/" 文件`，直接写 `-i` 会报 `invalid command code`；而 GNU sed 会把 `\'\'` 当成一个文件名',
        '`-i` 重写的是同一个 inode：硬链接会同步变化，被进程占用的文件要重启或 reload 服务才生效',
        '批量替换前先 `cp` 备份或确认有版本管理，`/etc` 下的文件改错可能直接导致服务起不来'
      ],
      related: ['lt-sed', 'lt-sed-address', 'lt-dos2unix'],
      docs: 'https://www.gnu.org/software/sed/manual/sed.html',
      tags: ['原地修改', '批量替换', '危险操作']
    },

    /* ---------- 11 / 42 ---------- */
    {
      id: 'lt-sed-print',
      name: 'sed -n',
      alias: ['sed -n p', '打印指定行', 'sed 取行'],
      level: 2,
      syntax: 'sed -n "<地址>p" [文件]',
      summary: '只打印指定行或匹配行，比 head 与 tail 组合更精确。',
      desc: '`-n` 关掉 sed 的默认全量输出，只有脚本里写了 `p`（print）的行才会出现。地址可以是行号（`5p`）、区间（`1,10p`）、步长（`1~2p`）、正则（`/ERROR/p`）或最后一行（`$p`）。它比 `head`/`tail` 更适合“取日志中间某一段”和“打印配置文件里的某个段落”。',
      params: [
        { flag: '-n', desc: '关闭默认输出，只打印脚本里显式 `p` 的行（不加会每行打印两遍）' },
        { flag: '5p', desc: '打印第 5 行' },
        { flag: '1,10p', desc: '打印 1~10 行' },
        { flag: '$p', desc: '打印最后一行' },
        { flag: '/正则/p', desc: '打印匹配该正则的行' },
        { flag: '1~2p', desc: '步长地址：从第 1 行起每隔 2 行（奇数行）' }
      ],
      examples: [
        { cmd: 'sed -n "100,120p" /var/log/nginx/access.log', desc: '只看第 100~120 行，排障时定位某个请求' },
        { cmd: 'sed -n "/\\[error\\]/,/^$/p" /var/log/app/app.log | head -40', desc: '打印从 [error] 到下一个空行之间的整段异常堆栈' }
      ],
      notes: [
        '忘了 `-n` 会让匹配行输出两遍（默认输出一次 + `p` 再一次），这是“输出重复”的常见原因',
        '`sed -n "$p"` 写在双引号里会被 shell 当成变量展开，脚本里要写单引号或写成 `\\$p`'
      ],
      related: ['lt-sed', 'lt-sed-delete', 'lt-sed-address'],
      docs: 'https://www.gnu.org/software/sed/manual/sed.html',
      tags: ['取行', '打印', '日志']
    },

    /* ---------- 12 / 42 ---------- */
    {
      id: 'lt-sed-delete',
      name: 'sed d',
      alias: ['sed d', 'sed 删除行', '删除空行'],
      level: 2,
      syntax: 'sed \'<地址>d\' [文件]',
      summary: '按行号或正则删除行，常用来清掉注释与空行。',
      desc: '`d` 删除被地址选中的行，其余行照常输出；不加 `-i` 时只是“输出里没有这些行”，原文件不受影响。常用场景两个：去掉配置文件的注释与空行看有效配置，以及过滤日志里的健康检查噪声。`/正则/!d` 是取反写法，效果等于“只保留匹配行”。',
      params: [
        { flag: 'Nd', desc: '删除第 N 行' },
        { flag: '1,10d', desc: '删除 1~10 行' },
        { flag: '/正则/d', desc: '删除匹配该正则的行' },
        { flag: '/正则/!d', desc: '取反：只保留匹配行，其余全部删掉' },
        { flag: '$d', desc: '删除最后一行' },
        { flag: '-i', desc: '真正写回文件（删除不可撤销，先预览）' }
      ],
      examples: [
        { cmd: 'sed "/^#/d; /^$/d" /etc/nginx/nginx.conf', desc: '去掉注释行与空行，只看真正生效的配置' },
        { cmd: 'sed "/healthz/!d" /var/log/nginx/access.log | head', desc: '只保留含 healthz 的行，`!d` 取反的经典用法' }
      ],
      notes: [
        '多个删除条件写在同一个脚本里用分号或 `-e` 分隔，拆成两次 sed 会多扫一遍文件',
        '想真正删除文件内容必须加 `-i`，删除不可撤销；先用不带 `-i` 的写法确认输出，再决定是否落盘'
      ],
      related: ['lt-sed', 'lt-sed-print', 'lt-sed-address'],
      docs: 'https://www.gnu.org/software/sed/manual/sed.html',
      tags: ['删除行', '过滤', '配置文件']
    },

    /* ---------- 13 / 42 ---------- */
    {
      id: 'lt-sed-insert',
      name: 'sed a/i',
      alias: ['sed a', 'sed i', '追加行', '插入行'],
      level: 2,
      syntax: 'sed \'<地址>a <文本>\' / \'<地址>i <文本>\' [文件]',
      summary: '在匹配行后面追加或前面插入新行，改配置不动原内容。',
      desc: '`a`（append）在该行之后插入，`i`（insert）在该行之前插入；GNU sed 支持 `a 文本` 一行式写法，BSD/macOS 的 sed 要求写成反斜杠加真实换行。典型用途：给配置文件加一行参数、给文件头加维护说明、在某个 section 后补配置。配合 `-i.bak` 就是自动化改配置的常用套路。',
      params: [
        { flag: 'a', desc: '在匹配行之后追加一行' },
        { flag: 'i', desc: '在匹配行之前插入一行' },
        { flag: '$a', desc: '在文件末尾追加' },
        { flag: '1i', desc: '在文件第一行之前插入' },
        { flag: '/正则/a', desc: '在匹配该正则的行之后追加' },
        { flag: '-i', desc: '写回文件（改配置前先备份）' }
      ],
      examples: [
        { cmd: 'sed "/^\\[mysqld\\]/a max_connections = 1000" /etc/my.cnf', desc: '在 [mysqld] 段后面加一行参数，先预览效果' },
        { cmd: 'sed "1i # 本文件由运维脚本自动维护" /etc/nginx/nginx.conf | head -3', desc: '在文件开头插入一行维护说明' }
      ],
      notes: [
        '`&` 只在 `s///` 的替换部分代表匹配内容，在 `a`/`i` 的文本里就是普通字符，别混用',
        'GNU sed 支持 `a 文本` 一行式写法，BSD/macOS sed 必须写成 `a\\` 加换行再加文本，跨平台脚本建议改用 `awk`',
        '改生产配置前先 `cp /etc/my.cnf /etc/my.cnf.bak`，插入的行写错不会自动回滚'
      ],
      related: ['lt-sed', 'lt-sed-change', 'lt-sed-i'],
      docs: 'https://www.gnu.org/software/sed/manual/sed.html',
      tags: ['插入', '追加', '配置文件']
    },

    /* ---------- 14 / 42 ---------- */
    {
      id: 'lt-sed-change',
      name: 'sed c',
      alias: ['sed c', '整行替换', 'change'],
      level: 2,
      syntax: 'sed \'<地址>c <新文本>\' [文件]',
      summary: '把匹配到的整行换成新内容，比替换行内片段更彻底。',
      desc: '`c`（change）用新文本整体替换被地址选中的行，而不是替换行内的一部分，因此不必关心原行的格式。它和 `s/.*/新内容/` 结果相近，但 `c` 能一次替换整个区间：`/^\\[debug\\]/,/^\\[/c [debug]`。改配置时“删掉旧的整段、写入新段”用它最省事。',
      params: [
        { flag: 'Nc 新文本', desc: '把第 N 行换成新文本' },
        { flag: '/正则/c 新文本', desc: '把匹配行换成新文本' },
        { flag: '1,10c 新文本', desc: '把 1~10 行整体换成一行' },
        { flag: '$c 新文本', desc: '替换最后一行' },
        { flag: '-i', desc: '写回文件（先备份）' }
      ],
      examples: [
        { cmd: 'sed "/^PermitRootLogin/c PermitRootLogin no" /etc/ssh/sshd_config', desc: '不管原值是什么，整行改成禁止 root 直接登录' },
        { cmd: 'sed "/^\\[debug\\]/,/^\\[/c [debug]" /etc/app/app.conf', desc: '把整个 [debug] 段落压缩成一行' }
      ],
      notes: [
        '`c` 是整行替换：用区间地址时会把区间内多行合并成一条文本，输出行数变少是正常的',
        '替换文本要写多行，GNU sed 用 `\\n`，BSD sed 需要反斜杠加真实换行；跨平台时建议改用 `awk` 或分步 `sed`'
      ],
      related: ['lt-sed', 'lt-sed-insert', 'lt-sed-address'],
      docs: 'https://www.gnu.org/software/sed/manual/sed.html',
      tags: ['整行替换', '配置修改', '地址']
    },

    /* ---------- 15 / 42 ---------- */
    {
      id: 'lt-sed-address',
      name: 'sed 地址范围',
      kind: 'recipe',
      alias: ['sed 1,10', 'sed 区间', 'sed 步长'],
      level: 3,
      syntax: 'sed \'<起始地址>,<结束地址><命令>\' [文件]',
      summary: '用行号、正则或步长圈定处理范围，精确改动文件的一段。',
      desc: '地址决定 sed 命令作用在哪些行：单地址（`5d`）、行号区间（`1,10s///`）、正则区间（`/BEGIN/,/END/d`）、步长（`1~2p` 奇数行）、取反（`/keep/!d`）、末行（`$`）。区间是“从第一个匹配行开始，到下一个匹配行结束”，只匹配一次，然后继续寻找新的起点。',
      params: [
        { flag: '1,10s/旧/新/', desc: '只在前 10 行做替换' },
        { flag: '/BEGIN/,/END/d', desc: '删除两个标记之间的全部内容（含首尾行）' },
        { flag: '1~2p', desc: '步长地址：从第 1 行起每隔 2 行取一行' },
        { flag: '/正则/!d', desc: '取反，只保留匹配行' },
        { flag: '$', desc: '最后一行；`1,$` 就是全文' },
        { flag: '0,/正则/', desc: '从文件开头到该正则首次出现（GNU 扩展，避免漏掉第一行）' }
      ],
      examples: [
        { cmd: 'sed -n "1,10s/old.example.com/new.example.com/gp" /etc/nginx/nginx.conf', desc: '只在前 10 行替换并打印命中行（`p` 需要配 `-n`）' },
        { cmd: 'sed "/<VirtualHost/,/<\\/VirtualHost>/d" /etc/httpd/conf/httpd.conf | head', desc: '整段删掉 VirtualHost 配置后再观察结果' }
      ],
      notes: [
        '区间结束正则不会匹配起始行本身：`/a/,/a/` 从第一个 a 开始，到它后面的下一个 a 结束',
        '想“从文件开头”就用 `1,/正则/`；直接写 `/正则/,/结束/` 会漏掉正则匹配行之前的内容',
        '`sed -n "1,10s/…/…/p"` 少了 `-n` 时，未命中替换的行会因默认输出而全部打印，看着像替换失效'
      ],
      related: ['lt-sed', 'lt-sed-print', 'lt-sed-delete'],
      docs: 'https://www.gnu.org/software/sed/manual/sed.html',
      tags: ['地址', '区间', '精确编辑']
    },

    /* ---------- 16 / 42 ---------- */
    {
      id: 'lt-sed-e',
      name: 'sed -e',
      alias: ['sed -e', 'sed -E', '多条件替换'],
      level: 2,
      syntax: 'sed [-e \'脚本1\'] [-e \'脚本2\'] [-E] [文件]',
      summary: '一条命令里串多个编辑脚本，或用 -E 打开扩展正则。',
      desc: 'sed 允许把多个编辑脚本按顺序作用在同一份输入上，写法有三种：`-e` 多次、分号分隔、`-f 脚本文件`。`-e` 的好处是不用担心里面的分号被 shell 或文本内容搞混。`-E`（GNU 也接受 `-r`）切到扩展正则：`grep -E` 里能直接写的 `+ ? | ( ) {n,m}`，在 sed 里同样不用转义。',
      params: [
        { flag: '-e \'脚本\'', desc: '追加一段编辑脚本，可以重复出现多次' },
        { flag: ';', desc: '在同一段脚本里分隔多条命令，如 `"s/a/b/; s/c/d/"`' },
        { flag: '-E / -r', desc: '使用扩展正则，`+ ? | ( )` 不必转义' },
        { flag: '-f <脚本文件>', desc: '从文件读取脚本，脚本很长或需要复用时用' },
        { flag: '-n', desc: '关闭默认输出，与 `p` 搭配' }
      ],
      examples: [
        { cmd: 'sed -e "s/8080/9090/g" -e "s/localhost/10.0.0.10/g" /etc/nginx/conf.d/app.conf', desc: '两个替换一次完成，结果只输出到屏幕' },
        { cmd: 'sed -E "s/([0-9]+)ms/\\1 毫秒/g" /var/log/app/app.log | head', desc: '`-E` 下 `+` 与 `()` 不用转义，用 `\\1` 引用分组' }
      ],
      notes: [
        '`-e` 的脚本按书写顺序依次执行，前一段改过的内容会被后一段继续处理，顺序写反结果就会不同',
        '基础正则里写 `+` 只是字面加号，必须写成 `\\+`；要少写反斜杠就加 `-E`',
        '`\\1` `\\2` 是分组引用，`&` 是整段匹配，混用时先想清楚要哪一个'
      ],
      related: ['lt-sed', 'lt-sed-address', 'lt-egrep'],
      docs: 'https://www.gnu.org/software/sed/manual/sed.html',
      tags: ['多条件', '扩展正则', '脚本']
    },

    /* ---------- 17 / 42 ---------- */
    {
      id: 'lt-awk',
      name: 'awk',
      alias: ['awk print', 'awk $1', 'awk NR', 'awk NF'],
      level: 2,
      syntax: 'awk \'<模式> {<动作>}\' [文件]',
      summary: '按列处理文本的编程语言，统计、过滤、报表一把抓。',
      desc: 'awk 自动把每一行按分隔符切成字段，`$1` 是第一列、`$NF` 是最后一列、`$0` 是整行；`NR` 是当前行号，`NF` 是本行字段总数。程序结构是 `模式 {动作}`：模式决定哪几行生效（省略则每行都生效），动作默认是 `print $0`。它在一次扫描里就能完成取列、过滤、累加、格式化，是日志统计的主力工具。',
      params: [
        { flag: '$0', desc: '整行内容；`print $0` 就是原样输出这一行' },
        { flag: '$1 $2 $NF', desc: '第 1 列、第 2 列、最后一列；`$(NF-1)` 是倒数第二列' },
        { flag: 'NR / NF', desc: '`NR` 当前行号（记录号），`NF` 当前行的字段数；`$NF` 里的 NF 不写 `$`' },
        { flag: '-F', desc: '指定字段分隔符，如 `-F:` 处理 /etc/passwd（详见 `lt-awk-f`）' },
        { flag: '-v', desc: '从 shell 传入变量，如 `-v n=10`，在脚本里用 `n` 引用' },
        { flag: 'BEGIN{}/END{}', desc: '处理前/处理后各执行一次的代码块（详见 `lt-awk-begin-end`）' },
        { flag: '{print a, b}', desc: '逗号用 OFS（默认空格）连接输出，用空格拼则会连成一串' },
        { flag: '-f <脚本文件>', desc: '从文件读取 awk 程序' }
      ],
      examples: [
        { cmd: "awk '{print $1}' /var/log/nginx/access.log | head", desc: '取出第一列，Nginx 默认格式里就是客户端 IP' },
        { cmd: "awk '{print $1, $7, $9}' /var/log/nginx/access.log | head -5", desc: '一次取出 IP、请求路径、状态码三列' },
        { cmd: "awk '{print NR\": \"$0}' /etc/nginx/nginx.conf | head -10", desc: '给每行加上行号（NR 从 1 开始），方便对着报错定位' }
      ],
      notes: [
        '`$0` 是整行，`$1` 是第一列，`$NF` 是最后一列，`$(NF-1)` 是倒数第二列；`$NF` 里的 NF 不加 `$`',
        'awk 默认按“连续空白”切分并去掉首尾空白，所以 Nginx 日志里 `[10/Oct/2000:13:55:36 -0700]` 会被切成两列，状态码才落在 `$9`',
        '脚本一定要用单引号包住（`awk \'{...}\'`），写在双引号里 `$1` 会先被 shell 展开成空值',
        '`print $1 $2` 会把两列连在一起（没有分隔符），要分隔必须写逗号 `print $1, $2`'
      ],
      related: ['lt-awk-f', 'lt-awk-filter', 'lt-sed', 'lt-cut'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['按列处理', '统计', '日志分析', '报表']
    },

    /* ---------- 18 / 42 ---------- */
    {
      id: 'lt-awk-f',
      name: 'awk -F',
      alias: ['awk -F', '字段分隔符', 'FS', 'awk 逗号分隔'],
      level: 2,
      syntax: 'awk -F"<分隔符>" \'{print $1}\' <文件>',
      summary: '指定字段分隔符，解析 CSV、冒号分隔与制表符文本。',
      desc: '`-F` 支持单字符、转义写法（`-F\'\\t\'`）和多字符字符串（按整体匹配）。等价写法是在脚本开头 `BEGIN{FS=","}`，需要同时改输出分隔符时用 `BEGIN{FS=",";OFS="|"}`。记住默认行为是“按连续空白切分并压缩”，一旦写了 `-F` 就变成精确匹配该分隔符。',
      params: [
        { flag: '-F,', desc: '按逗号切分，处理 CSV' },
        { flag: '-F\'\\t\'', desc: '按制表符切分，处理 TSV 或 `docker ps` 之类对齐输出' },
        { flag: '-F:', desc: '按冒号切分，`/etc/passwd`、`/etc/group` 都用它' },
        { flag: '-F"[][]"', desc: '分隔符本身是正则元字符时的写法（放在方括号里当字符集）' },
        { flag: 'BEGIN{FS=";"}', desc: '在脚本里设置分隔符，可同时写 `OFS` 设置输出分隔符' }
      ],
      examples: [
        { cmd: "awk -F: '{print $1, $7}' /etc/passwd | head", desc: '打印用户名与登录 shell 两列' },
        { cmd: "awk -F, '{print $2, $3}' /opt/app/data/users.csv | head", desc: '取 CSV 的第 2、3 列' }
      ],
      notes: [
        '默认（不写 `-F`）是“连续空白算一个分隔符”，写成 `-F" "` 就变成“一个空格切一刀”，多空格会产生一堆空字段',
        'CSV 字段里本身含逗号或被引号包住时 `-F,` 会切错，应改用 `csvkit`、Python 的 `csv` 模块或 `mlr --icsv`'
      ],
      related: ['lt-awk', 'lt-cut', 'lt-awk-filter'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['分隔符', 'CSV', '按列']
    },

    /* ---------- 19 / 42 ---------- */
    {
      id: 'lt-awk-filter',
      name: 'awk 条件过滤',
      kind: 'recipe',
      alias: ['awk 条件', 'awk 大于', 'awk 正则匹配'],
      level: 2,
      syntax: 'awk \'<条件> {print <字段>}\' <文件>',
      summary: '按列做数值或正则条件筛选，比 grep 精确到某一列。',
      desc: 'awk 的模式部分可以写数值比较（`$3 > 100`）、字符串比较（`$2 == "GET"`）、正则匹配（`$9 ~ /^5/`）、逻辑组合（`&&`、`||`、`!`）和行号范围（`NR > 1 && NR <= 20`）。因为条件落在具体列上，所以能做到 grep 做不到的事，例如“只看状态码 5xx 的请求”“只看第 3 列超过 100 的记录”。',
      params: [
        { flag: '$3 > 100', desc: '第 3 列大于 100（数值比较）' },
        { flag: '$9 ~ /^5/', desc: '第 9 列匹配正则；取反用 `!~`' },
        { flag: '$2 == "GET"', desc: '字符串相等比较' },
        { flag: '&& / ||', desc: '逻辑与、逻辑或，可组合多个条件' },
        { flag: 'NR>1', desc: '跳过表头行（从第 2 行开始处理）' },
        { flag: '$5+0 > 80', desc: '把 `85%` 这类带单位的值强制转成数字再比较' }
      ],
      examples: [
        { cmd: "awk '$9 >= 500 {print $1, $7, $9}' /var/log/nginx/access.log | head -20", desc: '只看报 5xx 的请求的 IP、URL、状态码' },
        { cmd: "df -h | awk 'NR>1 && $5+0 > 80 {print $6, $5}'", desc: '列出使用率超过 80% 的挂载点' }
      ],
      notes: [
        '`$5+0` 是把 `85%` 转成数字的技巧：awk 取开头的数字部分；不转换的话 `"85%" > 80` 会按字符串比较，结果不可靠',
        '正则匹配用 `~`、取反用 `!~`，正则必须写在 `/ /` 之间：`$9 ~ 5` 是错的，要写 `$9 ~ /5/`',
        '条件里引用不存在的列（如 `$9` 但只有 5 列）会得到空字符串，比较时不报错但结果为空，先 `head -1` 数一下列数'
      ],
      related: ['lt-awk', 'lt-awk-sum', 'lt-grep'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['条件', '过滤', '统计']
    },

    /* ---------- 20 / 42 ---------- */
    {
      id: 'lt-awk-begin-end',
      name: 'awk BEGIN/END',
      alias: ['awk BEGIN', 'awk END', 'awk -v'],
      level: 2,
      syntax: 'awk \'BEGIN{...} {<逐行动作>} END{...}\' <文件>',
      summary: '在处理前后各跑一段代码，用于初始化变量与输出汇总结果。',
      desc: '`BEGIN` 块在读取任何输入之前执行一次，适合打印表头、初始化累加器、设置 `FS`/`OFS`；中间的块对每一行执行一次；`END` 块在全部输入处理完后执行一次，是输出总数、总和、平均值的标准位置。shell 变量要通过 `-v` 传进 awk，否则会被当成字段引用。',
      params: [
        { flag: 'BEGIN{}', desc: '读入数据前执行一次，用来初始化' },
        { flag: 'END{}', desc: '所有行处理完后执行一次，用来输出汇总' },
        { flag: '-v n=10', desc: '把 shell 变量传进 awk，脚本里用 `n` 引用' },
        { flag: 'BEGIN{OFS=","}', desc: '设置输出字段分隔符，`print $1,$2` 就输出逗号' },
        { flag: 'NR', desc: 'END 块里读取它得到总行数' }
      ],
      examples: [
        { cmd: "awk 'BEGIN{print \"状态码 次数\"} {s[$9]++} END{for (k in s) print k, s[k]}' /var/log/nginx/access.log", desc: '先打印表头，再按状态码分组统计' },
        { cmd: "awk -v limit=500 'BEGIN{OFS=\",\"} $9>=limit {print $1, $9}' /var/log/nginx/access.log | head", desc: '用 `-v` 传入阈值、用 `OFS` 输出逗号分隔' }
      ],
      notes: [
        'shell 变量不能直接写进 awk 脚本，必须 `-v` 传（`awk -v n="$N" \'NR<=n\'`），否则 `$N` 会被 awk 当成第 N 列',
        '`END{print sum/NR}` 在空文件上会除以 0 得到 `-nan`，先判断 `if (NR > 0)` 再算'
      ],
      related: ['lt-awk', 'lt-awk-sum', 'lt-awk-filter'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['BEGIN', 'END', '汇总', '变量']
    },

    /* ---------- 21 / 42 ---------- */
    {
      id: 'lt-awk-sum',
      name: 'awk 求和求平均',
      kind: 'recipe',
      alias: ['awk sum', 'awk 平均值', 'awk 累加'],
      level: 2,
      syntax: 'awk \'{sum+=$1} END{print sum}\' <文件>',
      summary: '对某一列累加、计数、求平均，一行命令出统计报表。',
      desc: 'awk 的变量默认视为 0，所以 `sum+=$10` 这种写法不需要事先初始化，非数字字段会被当成 0。同一个套路还能求平均（`sum/NR`）、计数（`n++`）、求最值（`if ($3 > max) max = $3`）、按组累加（`a[$1] += $9`），比 `cut` 加 `bc` 或多次 `grep -c` 简单得多。',
      params: [
        { flag: 'sum+=$3', desc: '把第 3 列累加到 sum' },
        { flag: 'n++', desc: '计数器加一，用来算平均值或总数' },
        { flag: 'END{print sum}', desc: '输出总和' },
        { flag: 'END{print sum/n}', desc: '输出平均值' },
        { flag: 'a[$1]+=$9', desc: '按第 1 列分组累加第 9 列（分组汇总）' },
        { flag: 'max = $3>max ? $3 : max', desc: '用三元表达式求最大值' }
      ],
      examples: [
        { cmd: "awk '{sum+=$10} END{print sum/1024/1024\" MB\"}' /var/log/nginx/access.log", desc: '把第 10 列（响应字节数）累加，换算成 MB 看总出流量' },
        { cmd: "awk '{t+=$3; n++} END{print \"平均耗时\", t/n, \"ms\"}' /var/log/app/access.log", desc: '求第 3 列（响应耗时）的平均值' }
      ],
      notes: [
        '结果明显偏小多半是选错列：Nginx combined 格式里字节数是第 10 列，状态码才是第 9 列',
        '`NR` 是处理过的总行数，文件带表头时平均值应除以 `NR-1`，否则会被表头拉低'
      ],
      related: ['lt-awk', 'lt-awk-filter', 'lt-awk-begin-end'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['求和', '平均', '统计']
    },

    /* ---------- 22 / 42 ---------- */
    {
      id: 'lt-awk-func',
      name: 'awk 内置函数',
      kind: 'recipe',
      alias: ['awk length', 'awk substr', 'awk gsub', 'awk split'],
      level: 3,
      syntax: 'awk \'<函数调用> {print <结果>}\' <文件>',
      summary: '用 length、substr、gsub、split 在 awk 里直接做字符串加工。',
      desc: 'awk 自带的字符串函数足够应付大多数加工：`length` 取长度、`substr(s,m,n)` 从第 m 个字符起取 n 个（下标从 1 开始）、`gsub(/旧/,"新")` 全局替换并返回替换次数、`sub` 只替换第一处、`split(s,arr,分隔符)` 拆成数组、`index` 找子串位置、`toupper`/`tolower` 改大小写、`sprintf` 拼字符串。全部在一次扫描里完成，不需要再套一层 sed。',
      params: [
        { flag: 'length(s)', desc: '取字符串长度，`length($0)` 是整行长度' },
        { flag: 'substr($4, 2, 11)', desc: '从第 2 个字符起取 11 个字符' },
        { flag: 'gsub(/re/, "新")', desc: '全局替换，返回替换次数' },
        { flag: 'sub(/re/, "新")', desc: '只替换第一处' },
        { flag: 'split($7, a, "/")', desc: '按分隔符拆成数组 a，返回元素个数' },
        { flag: 'index(s, "子串")', desc: '子串首次出现的位置，找不到返回 0' },
        { flag: 'toupper / tolower', desc: '转成大写 / 小写' }
      ],
      examples: [
        { cmd: "awk '{print substr($4, 2, 11), $1, $9}' /var/log/nginx/access.log | head -5", desc: '从 `[10/Oct/2000:13:55:36` 里截出日期 `10/Oct/2000`（去掉 `[` 后取 11 个字符）' },
        { cmd: 'echo "10.0.0.1,GET,200" | awk \'{gsub(/,/, " | "); print}\'', desc: 'gsub 把逗号换成竖线，让输出更好读' }
      ],
      notes: [
        '`substr` 下标从 1 开始，不是 0；写 `substr(s, 0, 2)` 时 awk 会自动修正并给出警告',
        '`gsub` 会真的修改字段内容，之后再 `print $0` 就是替换后的结果；只想拿替换次数就单独接返回值，别和修改后的输出混在一起'
      ],
      related: ['lt-awk', 'lt-awk-printf', 'lt-sed'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['字符串', '函数', '加工']
    },

    /* ---------- 23 / 42 ---------- */
    {
      id: 'lt-awk-printf',
      name: 'awk printf',
      alias: ['awk printf', 'awk 对齐', 'awk 格式化'],
      level: 2,
      syntax: 'awk \'{printf "<格式串>", <字段>}\' <文件>',
      summary: '按格式串输出，控制小数位、列宽与对齐，做出整齐报表。',
      desc: '`printf` 不自动换行（要在格式串里写 `\\n`），也不会自动用空格分隔参数，一切由格式串决定：`%s` 字符串、`%d` 整数、`%.2f` 两位小数、`%-10s` 左对齐占 10 列、`%5d` 右对齐占 5 列。做“对齐的 Top 排行榜”“带单位的内存占用表”比 `print` 好用；如果你只是想快速对齐现成文本，也可以直接用 `column -t`。',
      params: [
        { flag: '%s', desc: '字符串占位符' },
        { flag: '%d', desc: '整数；`%5d` 右对齐占 5 列，`%05d` 左侧补零' },
        { flag: '%.2f', desc: '保留两位小数' },
        { flag: '%-10s', desc: '左对齐占 10 列，列宽不够时自动撑开' },
        { flag: '\\n', desc: '换行，printf 不会自动加' },
        { flag: '%%', desc: '输出百分号字面量' }
      ],
      examples: [
        { cmd: 'awk \'{printf "%-16s %s\\n", $1, $9}\' /var/log/nginx/access.log | head -10', desc: 'IP 左对齐占 16 列，状态码跟在后面，输出成两列表格' },
        { cmd: 'df -h | awk \'NR>1 {printf "%-20s %6s\\n", $6, $5}\'', desc: '挂载点与使用率对齐输出' }
      ],
      notes: [
        '`printf` 不自动换行，忘了写 `\\n` 会把所有结果挤成一行',
        '格式串里的 `%` 数量与参数不匹配时不会报错：少给参数输出空值，多给参数被忽略，出错时先核对这两者'
      ],
      related: ['lt-awk', 'lt-printf', 'lt-column'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['格式化', '对齐', '报表']
    },

    /* ---------- 24 / 42 ---------- */
    {
      id: 'lt-awk-dedupe',
      name: 'awk 去重统计',
      kind: 'recipe',
      alias: ['awk 去重', 'awk seen', 'awk 分组计数'],
      level: 3,
      syntax: 'awk \'!seen[$1]++\' <文件>',
      summary: '不排序就能按列去重，也能一次算出分组计数。',
      desc: '`!seen[$1]++` 是经典惯用法：某个 key 第一次出现时 `seen[$1]++` 返回 0，取反为真于是打印该行，之后再出现就返回非 0 被跳过，效果是“保留第一次出现的行”。`sort -u` 需要先把整个文件排序，而 awk 只做一次顺序扫描；把 `!seen[$1]++` 换成 `a[$1]++` 加 `END{for (k in a) print k, a[k]}` 就等价于 `sort | uniq -c`。',
      params: [
        { flag: '!seen[$1]++', desc: '按第 1 列去重并保留首次出现的行' },
        { flag: 'a[$1]++', desc: '按第 1 列分组计数' },
        { flag: 'END{for (k in a) print k, a[k]}', desc: '遍历数组输出统计结果' },
        { flag: 'a[$1"|"$9]', desc: '多列拼成 key 做联合去重' },
        { flag: '-F', desc: '指定分隔符，处理结构化文本时配合使用' }
      ],
      examples: [
        { cmd: "awk '!seen[$1]++' /var/log/nginx/access.log | wc -l", desc: '统计出现过多少个不同的客户端 IP' },
        { cmd: "awk '!seen[$1\"|\"$9]++ {print $1, $9}' /var/log/nginx/access.log | head", desc: 'IP 与状态码的组合去重' }
      ],
      notes: [
        '去重保留的是“第一次出现”的行；要保留最后一次可写成 `{line[$1]=$0} END{for (k in line) print line[k]}`',
        'awk 把 key 全部放在内存里，唯一值上亿时会 OOM；超大文件应该用 `sort -u`（能借磁盘做外部归并）'
      ],
      related: ['lt-awk', 'lt-uniq', 'lt-dedupe-large-file'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['去重', '分组统计', '内存']
    },

    /* ---------- 25 / 42 ---------- */
    {
      id: 'lt-cut',
      name: 'cut',
      alias: ['cut -d', 'cut -f', '取列'],
      level: 1,
      syntax: 'cut [选项] [文件]',
      summary: '按分隔符或字符位置切出指定列，最轻量的取列工具。',
      desc: '`cut` 只有三种用法：`-d` 配 `-f` 按分隔符取字段、`-c` 按字符位置取、`-b` 按字节取。要注意它默认的分隔符是制表符而不是空格，所以处理以空格对齐的输出时通常得先 `tr -s " " "\\t"` 转一下。相比 awk，cut 不能重排列、不能按条件过滤，但胜在简单和快。',
      params: [
        { flag: '-d","', desc: '指定分隔符，只接受单个字符' },
        { flag: '-f1,3', desc: '取第 1、3 个字段；`-f2-` 取第 2 个字段到末尾' },
        { flag: '-c1-10', desc: '取第 1~10 个字符' },
        { flag: '--complement', desc: '取反：输出未被选中的列' },
        { flag: '-s', desc: '不含分隔符的行不输出（默认会原样打印）' }
      ],
      examples: [
        { cmd: 'cut -d: -f1,7 /etc/passwd | head', desc: '取用户名与登录 shell 两列' },
        { cmd: 'ps aux | tr -s " " "\\t" | cut -f1,11 | head', desc: 'ps 输出是空格对齐的，先压成制表符再取属主与命令列' }
      ],
      notes: [
        '默认分隔符是 TAB 而不是空格：直接 `cut -f1 access.log` 会整行原样输出，必须先把空格换成制表符',
        '`-d` 只接受单个字符，`cut -d", "` 是无效的；多字符分隔符要用 `awk -F` 或 `tr`'
      ],
      related: ['lt-awk-f', 'lt-paste', 'lt-tr'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/cut-invocation.html',
      tags: ['取列', '分隔符', '文本切分']
    },

    /* ---------- 26 / 42 ---------- */
    {
      id: 'lt-paste',
      name: 'paste',
      alias: ['paste -d', 'paste -s', '横向合并'],
      level: 2,
      syntax: 'paste [选项] <文件1> <文件2>',
      summary: '把两个文件的对应行横向拼在一起，正好与 cut 相反。',
      desc: '`paste` 按行号把多个文件并排合并，默认用 TAB 连接，常用来把两份命令输出对起来看，例如一份 IP 列表配一份次数列表，或者把 `cut` 出来的两列重新拼成 CSV。`-d` 换成逗号即可做 CSV，`-s` 则把同一个文件的所有行串成一行输出。',
      params: [
        { flag: '-d","', desc: '指定连接符（默认 TAB）' },
        { flag: '-s', desc: '把每个文件的所有行合并成一行（serial）' },
        { flag: '- -', desc: '同一个文件写两次，让内容两两配对' },
        { flag: '-z', desc: '用 NUL 而不是换行做行分隔' }
      ],
      examples: [
        { cmd: 'paste -d, /opt/app/data/passwd-users.txt /opt/app/data/passwd-shells.txt | head', desc: '把两个文件按列拼成 CSV —— 真机上也可以写 `paste -d, <(cut …) <(cut …)`，教学终端不支持进程替换，所以先把两列各存一个文件' },
        { cmd: 'paste -s -d, /opt/app/data/ips.txt', desc: '把多行 IP 变成一行逗号分隔，方便塞进循环或 JSON' }
      ],
      notes: [
        '两个文件行数不同时，短的那个用空列补位，不会报错；做数据核对时要留意这种错位',
        '`<(命令)` 是 bash 的进程替换，sh/dash 不支持；只能用 sh 时先重定向到中间文件'
      ],
      related: ['lt-cut', 'lt-join', 'lt-column'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/paste-invocation.html',
      tags: ['合并', '按行拼接', 'CSV']
    },

    /* ---------- 27 / 42 ---------- */
    {
      id: 'lt-tr',
      name: 'tr',
      alias: ['tr -d', 'tr -s', '删除回车', '大小写转换'],
      level: 1,
      syntax: 'tr [选项] <字符集1> [字符集2]',
      summary: '逐字符替换、删除或压缩，清理脏字符最拿手。',
      desc: '`tr` 只从标准输入读、往标准输出写，所以必须用管道或重定向，不能直接跟文件名。它的替换是“字符对字符”的映射表：`tr "a-z" "A-Z"` 转大写、`tr -d "\\r"` 删掉 Windows 回车、`tr -s " "` 把连续空格压成一个。它不理解“字符串”这个概念，这正是最常见的误用来源。',
      params: [
        { flag: '-d', desc: '删除字符集中的字符，如 `tr -d "\\r"`、`tr -d "[:space:]"' },
        { flag: '-s', desc: '压缩连续重复的字符，如 `tr -s " "` 把多个空格变成一个' },
        { flag: '-c', desc: '取字符集的补集，如 `tr -cd "0-9\\n"` 只保留数字和换行' },
        { flag: '[:lower:] [:upper:]', desc: 'POSIX 字符类，用于大小写转换' },
        { flag: '-t', desc: '截断字符集1，使其与字符集2 等长' }
      ],
      examples: [
        { cmd: 'tr -d "\\r" < /opt/app/conf/windows.conf > /opt/app/conf/linux.conf', desc: '去掉 Windows 的回车符，转换前先确认落地路径' },
        { cmd: 'cat /var/log/nginx/access.log | tr -s " " | cut -d" " -f1 | head', desc: '先把连续空格压成一个，再按空格切出第一列' }
      ],
      notes: [
        '`tr` 只能做单字符到单字符的映射，不能替换字符串：`tr "http" "https"` 是把 h→h、t→t、t→p、p→s，完全不是想要的效果，换字符串要用 `sed`',
        '`tr` 不接受文件名参数，`tr "a" "b" file.txt` 不会按预期工作，必须写 `tr "a" "b" < file.txt` 或用管道',
        '处理中文等多字节字符时 `tr` 会按字节操作，容易把字拆坏，清理二进制脏数据前先备份'
      ],
      related: ['lt-dos2unix', 'lt-sed', 'lt-cut'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/tr-invocation.html',
      tags: ['字符替换', '删除字符', '压缩']
    },

    /* ---------- 28 / 42 ---------- */
    {
      id: 'lt-join',
      name: 'join',
      alias: ['join -1', 'join -a', '按字段连接'],
      level: 3,
      syntax: 'join [选项] <文件1> <文件2>',
      summary: '按共同字段把两个文件连起来，命令行里的简易 SQL JOIN。',
      desc: '`join` 取两个已排序文件的第一列作为连接键，输出“键 + 文件1其余列 + 文件2其余列”，默认按空白分隔。它是 `paste` 的“按内容对齐”版：`paste` 只按行号硬拼，`join` 才真正按键匹配。两个输入都必须先按连接键排好序，否则会静默丢行，这是 join 最常踩的坑。',
      params: [
        { flag: '-1 2 -2 1', desc: '左文件用第 2 列、右文件用第 1 列做连接键' },
        { flag: '-t,', desc: '指定字段分隔符（默认空白）' },
        { flag: '-a 1', desc: '左外连接：左文件里没匹配上的行也输出（`-a 2` 为右外，两个都写是全外）' },
        { flag: '-o 1.1,2.2', desc: '只输出指定列（文件号.列号）' },
        { flag: '-e "-"', desc: '匹配不到的字段用指定字符串填充' }
      ],
      examples: [
        { cmd: 'join -t, /opt/app/data/ips.csv /opt/app/data/hostnames.csv', desc: '按第一列关联两份 CSV（两边都已排序）—— 真机上也常写 `<(sort …)`，教学终端不支持进程替换' },
        { cmd: 'join -a 1 -e "0" -o 1.1,2.2 /opt/app/data/users.txt /opt/app/data/orders.txt', desc: '左外连接，没有订单的用户补 0' }
      ],
      notes: [
        '两个输入都要按连接键排序（`sort -k1,1`）；没排序时 join 不报错但会丢行，结果看着“少了很多”就是这个原因',
        '处理 CSV 时两边都要加 `-t,`，分隔符不一致会导致键对不上、结果为空'
      ],
      related: ['lt-paste', 'lt-sort-column', 'lt-cut'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/join-invocation.html',
      tags: ['连接', '关联', '排序']
    },

    /* ---------- 29 / 42 ---------- */
    {
      id: 'lt-column',
      name: 'column',
      alias: ['column -t', '对齐表格', 'pretty print'],
      level: 2,
      syntax: 'column [选项] [文件]',
      summary: '把杂乱的分隔文本排成对齐表格，可读性立刻提升。',
      desc: '`column -t` 会先测量每列最宽的字段再按列对齐，是把 `mount`、`docker ps`、CSV 这类输出变成“能贴进工单的表格”的最快办法。`-s` 指定输入分隔符，`-o` 指定输出分隔符，`-N` 定义列名后还能用 `-R` 让指定列右对齐。它来自 util-linux，主流发行版都自带。',
      params: [
        { flag: '-t', desc: '进入表格模式，按列对齐' },
        { flag: '-s,', desc: '指定输入分隔符（默认空白）' },
        { flag: '-o" | "', desc: '指定输出分隔符（默认两个空格）' },
        { flag: '-N 名称1,名称2', desc: '指定列名并输出表头' },
        { flag: '-R 2', desc: '让第 2 列右对齐（数字列常用）' },
        { flag: '-c 120', desc: '指定输出宽度，避免超宽时折行混乱' }
      ],
      examples: [
        { cmd: 'column -t -s, /opt/app/data/report.csv | head', desc: '把 CSV 排成对齐的表格' },
        { cmd: 'mount | column -t | head', desc: '让 mount 的输出一眼能看清' }
      ],
      notes: [
        '`column -t` 要先读入全部输入才能算出列宽，千万行级的大文件会很吃内存，别直接怼在日志上',
        '它会把连续分隔符按一个处理，如果原文本靠空格对齐（如 `ls -l` 的某些输出），排版会跟原来不一样'
      ],
      related: ['lt-printf', 'lt-awk-printf', 'lt-cut'],
      docs: 'https://man7.org/linux/man-pages/man1/column.1.html',
      tags: ['表格', '对齐', '可读性']
    },

    /* ---------- 30 / 42 ---------- */
    {
      id: 'lt-sort-column',
      name: 'sort',
      alias: ['sort -k', 'sort -t', 'sort -u', '按列排序'],
      level: 2,
      syntax: 'sort [选项] [文件]',
      summary: '按指定列做多级排序与去重，是 uniq 与 join 的前置步骤。',
      desc: '基础分类里讲的是整行排序，这里聚焦“按列排序与去重”：`-k2,2n` 表示只按第 2 列做数值排序，`-k1,1 -k3,3nr` 是先按第 1 列升序、再按第 3 列数值降序。`-u` 在排序的同时按排序键去重，比 `sort | uniq` 少一趟；`-t` 指定分隔符。注意 `-k` 要写成 `-k2,2` 才能限定在单列。',
      params: [
        { flag: '-k2,2n', desc: '按第 2 列做数值排序（`n` 数值、`r` 降序）' },
        { flag: '-t,', desc: '指定字段分隔符（默认空白）' },
        { flag: '-u', desc: '排序键相同的行只保留一条，即排序同时去重' },
        { flag: '-k1,1 -k3,3nr', desc: '多级排序：先第 1 列升序，再第 3 列数值降序' },
        { flag: '-h', desc: '按人类可读数字排序，能正确排 `1K`/`2M`/`3G`（配 `du -h`）' },
        { flag: '-V', desc: '版本号排序，让 `1.10` 排在 `1.9` 之后' }
      ],
      examples: [
        { cmd: 'sort -t, -k3,3nr /opt/app/data/report.csv | head', desc: '按第 3 列数值从大到小排序' },
        { cmd: "awk '{print $1}' /var/log/nginx/access.log | sort -u | wc -l", desc: '统计不同 IP 的数量（`-u` 排序时顺手去重）' }
      ],
      notes: [
        '`-k2` 与 `-k2,2` 含义不同：前者从第 2 列一直比到行尾，做“按第 2 列排序”必须写 `-k2,2`',
        '排序结果受 `LC_ALL` 影响：`export LC_ALL=C` 既能让大文件排得更快，也能让结果与字节序一致（脚本里更可控）',
        '大文件排序会用磁盘做临时归并文件，空间不够时用 `-T /data/tmp` 指到大盘，并注意清理残留的 `sort*` 临时文件'
      ],
      related: ['lt-uniq', 'lt-join', 'lt-awk-dedupe', 'lt-dedupe-large-file'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/sort-invocation.html',
      tags: ['排序', '去重', '按列']
    },

    /* ---------- 31 / 42 ---------- */
    {
      id: 'lt-uniq',
      name: 'uniq',
      alias: ['uniq -c', 'uniq -d', 'uniq -u', '去重计数'],
      level: 2,
      syntax: 'uniq [选项] [文件]',
      summary: '合并相邻的重复行，统计重复次数前必须先排序。',
      desc: '`uniq` 只比较“相邻”的行，相同的行只要不相邻就不会被合并，所以正确用法永远是 `sort 文件 | uniq -c`。`-c` 在行首加上出现次数，`-d` 只显示重复过的行，`-u` 只显示只出现一次的行，`-i` 忽略大小写，`-f` 跳过前 N 个字段。日志里做 Top 榜的标准套路是 `sort | uniq -c | sort -rn | head`。',
      params: [
        { flag: '-c', desc: '在每行前面加上出现次数' },
        { flag: '-d', desc: '只输出重复出现过的行' },
        { flag: '-u', desc: '只输出只出现一次的行' },
        { flag: '-i', desc: '比较时忽略大小写' },
        { flag: '-f 2', desc: '跳过前 2 个字段后再比较' }
      ],
      examples: [
        { cmd: "awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", desc: '统计各 HTTP 状态码出现次数' },
        { cmd: 'sort -u /var/log/app/ips.txt | wc -l', desc: '只想去重计数时 `sort -u` 更省事，uniq 的价值在 `-c`/`-d`/`-u`' }
      ],
      notes: [
        '不排序直接用 `uniq` 几乎一定得到错误结果：它只合并相邻重复行，这是它最经典的坑',
        '`uniq -c` 输出带前导空格，取次数列用 `awk \'{print $1}\'`，别用 `cut -c1`'
      ],
      related: ['lt-sort-column', 'lt-awk-dedupe', 'lt-nginx-top-ip'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/uniq-invocation.html',
      tags: ['去重', '计数', '排序']
    },

    /* ---------- 32 / 42 ---------- */
    {
      id: 'lt-jq',
      name: 'jq',
      alias: ['jq -r', 'jq select', 'jq map', 'json 解析'],
      level: 2,
      syntax: 'jq [选项] \'<过滤器>\' [文件]',
      summary: '命令行解析与改造 JSON，Kubernetes 与云 API 排障必备。',
      desc: '`jq` 把 JSON 当流来处理，过滤器决定输出什么：`.` 原样输出、`.key` 取字段、`.a.b` 取嵌套字段、`.[]` 遍历数组或对象的所有值、`.[0]` 取第一个元素。默认输出带缩进和颜色的格式化 JSON，`-r` 去掉字符串两端的引号（方便再喂给 shell），`-c` 压成一行一条。`-e` 让退出码跟随结果真假，可以直接写在 `if` 里做判断；多个文件一起处理时按顺序读入，配 `-s` 会把它们合成一个数组。',
      params: [
        { flag: '. / .key / .a.b', desc: '原样输出 / 取字段 / 取嵌套字段' },
        { flag: '.[] / .[0]', desc: '`.[]` 遍历所有元素（输出多条），`.[0]` 只取第一个；对对象用 `.[]` 会丢掉键名' },
        { flag: '-r', desc: '输出原始字符串，去掉两端引号' },
        { flag: '-c', desc: '紧凑输出，一行一条 JSON，方便逐行处理' },
        { flag: 'select(<条件>)', desc: '过滤，如 `select(.status != "Running")`' },
        { flag: 'map(<表达式>)', desc: '对数组每个元素做同样的变换' },
        { flag: 'keys / length', desc: '取所有键名 / 取元素或键的个数' },
        { flag: '--arg k v / --argjson', desc: '把 shell 变量以字符串（`--arg`）或 JSON（`--argjson`）形式传进过滤器' }
      ],
      examples: [
        { cmd: "kubectl get pod -A -o json | jq -r '.items[] | .metadata.name' | head", desc: '列出所有 Pod 名，一行一个' },
        { cmd: "kubectl get pod -A -o json | jq -c '.items[] | {name: .metadata.name, ns: .metadata.namespace, phase: .status.phase}' | head", desc: '把每个 Pod 压成一行 JSON，方便再喂给别的程序' },
        { cmd: "kubectl get pod -A -o json > /data/k8s/pods.json && jq -r --arg ns \"kube-system\" '.items[] | select(.metadata.namespace == $ns) | .metadata.name' /data/k8s/pods.json", desc: '用 `--arg` 把 shell 变量安全地传进过滤器，避免手工拼引号' },
        { cmd: "kubectl get pod my-app -n prod -o json > /data/k8s/pod.json && jq -e '.status.phase == \"Running\"' /data/k8s/pod.json > /dev/null && echo 运行中", desc: '`-e` 让结果为 false/null 时返回退出码 1，脚本里做判断很可靠' }
      ],
      notes: [
        '`.[]` 是“遍历所有元素”，`.[0]` 是“取第一个”；对对象用 `.[]` 只输出值、丢掉键名，要键值对用 `to_entries[]`',
        '字段名里含 `-` 或 `/` 时必须用引号：`.["app.kubernetes.io/name"]`；写成 `.app.kubernetes.io/name` 会被当成 4 层嵌套',
        'jq 默认给终端输出上色，重定向到文件会混进 ANSI 转义符，管道里加 `-c` 或 `-M` 关掉颜色',
        '多个文件按顺序处理：`jq -r ".items[].metadata.name" a.json b.json`；要合成一个数组用 `jq -s . a.json b.json`',
        '`-e` 的退出码：结果为 false 或 null 返回 1，没有产生任何输出也返回 1，比解析文本判断更稳'
      ],
      related: ['lt-jq-k8s-pod', 'lt-yq', 'lt-awk'],
      docs: 'https://jqlang.github.io/jq/manual/',
      tags: ['JSON', 'Kubernetes', '解析', 'API']
    },

    /* ---------- 33 / 42 ---------- */
    {
      id: 'lt-yq',
      name: 'yq',
      alias: ['yq -i', 'yaml 解析', 'yaml 修改'],
      level: 2,
      syntax: 'yq [选项] \'<表达式>\' <文件.yaml>',
      summary: '处理 YAML 与 JSON 的 jq 表亲，改 K8s 清单不用数缩进。',
      desc: '`yq` 有两个常见实现：Go 版（mikefarah/yq，单二进制，用 `-i` 原地修改）和 Python 版（kislyuk/yq，是 jq 的 YAML 包装）。两者语法相近但不完全通用，写脚本前先 `yq --version` 确认。常用法：读字段 `yq ".spec.replicas" deploy.yaml`、改字段 `yq -i ".spec.replicas = 3" deploy.yaml`、遍历 `yq ".items[].metadata.name" list.yaml`。',
      params: [
        { flag: '-i', desc: '原地写回文件（Go 版）' },
        { flag: '.spec.replicas', desc: '按路径取嵌套字段' },
        { flag: '.a.b = "值"', desc: '赋值修改，配 `-i` 才会写回文件' },
        { flag: '.items[]', desc: '遍历数组，逐个输出元素' },
        { flag: '-o json', desc: '以 JSON 输出（`-P` 反向美化输出 YAML）' },
        { flag: '-N', desc: '不输出 `---` 文档分隔符，便于再喂给 kubectl' }
      ],
      examples: [
        { cmd: 'yq ".spec.template.spec.containers[].image" deployment.yaml', desc: '一次列出清单里所有容器的镜像' },
        { cmd: 'yq -i ".spec.replicas = 3" deployment.yaml && kubectl apply -f deployment.yaml', desc: '改副本数并立即应用到集群' }
      ],
      notes: [
        'Go 版与 Python 版参数不同（Go 版是 `yq -i`，Python 版要 `yq -y -i`），执行前先 `yq --version` 确认是哪一个',
        'YAML 1.1 里 `yes`/`no`/`on`/`off` 会被解析成布尔值，改这类键名时先 `yq -o json . 文件` 看解析结果再动手',
        '`-i` 会直接覆盖原文件，改 K8s 清单前先 `cp deployment.yaml deployment.yaml.bak` 或用 Git 管理'
      ],
      related: ['lt-jq', 'lt-jq-k8s-pod', 'lt-sed-i'],
      docs: 'https://mikefarah.gitbook.io/yq/',
      tags: ['YAML', 'Kubernetes', '配置修改']
    },

    /* ---------- 34 / 42 ---------- */
    {
      id: 'lt-iconv',
      name: 'iconv',
      alias: ['iconv -f', 'iconv -t', '编码转换', 'GBK 转 UTF-8'],
      level: 2,
      syntax: 'iconv -f <源编码> -t <目标编码> [文件]',
      summary: '转换文件字符编码，解决中文乱码与跨平台编码不一致。',
      desc: 'Windows 上编辑的文件常是 GBK/GB18030，传到 Linux 后中文变乱码，用 `iconv -f GBK -t UTF-8` 转一次即可。`-l` 列出系统支持的所有编码名，`-c` 丢弃无法转换的字符（否则遇到非法字节会中断），`//TRANSLIT` 让目标字符集不支持的字符退化成近似写法。动手前先用 `file -i 文件` 确认真实编码。',
      params: [
        { flag: '-f GBK', desc: '源编码（from），写错不会报错只会输出乱码' },
        { flag: '-t UTF-8', desc: '目标编码（to）' },
        { flag: '-l', desc: '列出系统支持的全部编码名' },
        { flag: '-c', desc: '丢弃无法转换的字符，不中断转换' },
        { flag: '-t UTF-8//TRANSLIT', desc: '目标字符集不支持的字符用近似字符代替' }
      ],
      examples: [
        { cmd: 'iconv -f GBK -t UTF-8 /opt/app/conf/gbk.sql > /opt/app/conf/utf8.sql', desc: '把 GBK 文件转成 UTF-8 另存，原文件不动' },
        { cmd: 'file -i /opt/app/conf/app.properties', desc: '先确认文件实际编码，再决定 `-f` 写什么' }
      ],
      notes: [
        '`-f` 写错编码不会报错，只会输出另一种乱码，务必先用 `file -i` 确认原编码',
        '遇到非法字节时 iconv 默认报 `illegal input sequence` 并中途停下，会留下不完整的输出文件，可加 `-c` 跳过',
        '用 `-c` 转换后要抽查中文内容，被丢掉的字符不会有任何提示'
      ],
      related: ['lt-dos2unix', 'lt-tr', 'lt-grep'],
      docs: 'https://man7.org/linux/man-pages/man1/iconv.1.html',
      tags: ['编码', '乱码', 'UTF-8']
    },

    /* ---------- 35 / 42 ---------- */
    {
      id: 'lt-dos2unix',
      name: 'dos2unix',
      alias: ['dos2unix', 'unix2dos', 'CRLF', 'bad interpreter'],
      level: 1,
      syntax: 'dos2unix [选项] <文件>',
      summary: '把 Windows 换行转成 Linux 换行，脚本报错的头号元凶。',
      desc: 'Windows 上编辑过的 shell 脚本带 `\\r\\n`，拿到 Linux 上执行会报 `bad interpreter: /bin/bash^M` 或 `syntax error near unexpected token`，根因就是行尾多出来的 CR。`dos2unix` 就地把它改成 `\\n`，`unix2dos` 反向转换。不想装包时可用 `sed -i "s/\\r$//" 文件` 或 `tr -d "\\r" < 旧 > 新` 应急。',
      params: [
        { flag: '-k', desc: '保留文件原有的修改时间' },
        { flag: '-n <旧> <新>', desc: '输出到新文件，不覆盖原文件（最安全）' },
        { flag: '-f', desc: '强制转换（文件被判定为二进制时）' },
        { flag: '-q', desc: '安静模式，不打印转换统计' },
        { flag: '--strip-bom', desc: '顺带去掉 UTF-8 BOM 头' }
      ],
      examples: [
        { cmd: 'dos2unix -k /opt/app/bin/start.sh', desc: '就地转换启动脚本并保留时间戳' },
        { cmd: 'dos2unix -n /mnt/share/app.conf /etc/app/app.conf', desc: '从共享目录读入、转换后写到目标路径，原文件不动' }
      ],
      notes: [
        '`dos2unix` 默认原地覆盖且不留备份，重要文件先用 `-n` 输出到新文件或自己 `cp` 一份',
        'CentOS 用 `yum install dos2unix`，Ubuntu 用 `apt install dos2unix`；应急可用 `sed -i "s/\\r$//" 文件`',
        '判断文件是不是 CRLF：`cat -A 文件 | head`，行尾出现 `^M$` 就是 Windows 换行'
      ],
      related: ['lt-tr', 'lt-sed-i', 'lt-iconv'],
      docs: 'https://dos2unix.sourceforge.net/',
      tags: ['换行符', '脚本报错', '跨平台']
    },

    /* ---------- 36 / 42 ---------- */
    {
      id: 'lt-printf',
      name: 'printf',
      alias: ['printf %s', 'printf 对齐', 'printf 补零'],
      level: 2,
      syntax: 'printf "<格式串>" [参数...]',
      summary: '按格式串输出文本，精确控制对齐、补零与小数位。',
      desc: '`printf` 既是 shell 内置也有 `/usr/bin/printf` 版本。它和 `echo` 的关键区别是：不自动换行、不处理 `-n`，输出完全由 `%` 占位符决定。做终端表格用 `%-10s` 左对齐、`%5d` 右对齐、`%05d` 补零、`%.2f` 保留两位小数；格式串里的转义要写 `\\n`、`\\t`。参数比占位符多时，格式串会被循环使用到参数用完。',
      params: [
        { flag: '%s / %-10s', desc: '字符串；`-` 表示左对齐，数字表示占位宽度' },
        { flag: '%d / %05d', desc: '整数；`05` 表示不足 5 位时左侧补零' },
        { flag: '%.2f', desc: '浮点数保留两位小数' },
        { flag: '%x / %o', desc: '十六进制 / 八进制输出' },
        { flag: '\\n \\t', desc: '换行与制表符，必须写在格式串里' },
        { flag: '%%', desc: '输出百分号字面量' }
      ],
      examples: [
        { cmd: 'printf "%-12s %5s\\n" app-01 82 app-02 7', desc: '格式串被复用，一次输出两行对齐的表格' },
        { cmd: 'printf "[%s] %-8s %s\\n" "$(date +%Y-%m-%d)" INFO "服务启动完成"', desc: '脚本里拼一行格式统一的日志' }
      ],
      notes: [
        '`printf` 不会自动换行，格式串末尾要自己写 `\\n`，这是它和 `echo` 最大的区别',
        '参数多于占位符时格式串会循环使用，多出来的参数依次填入下一轮输出',
        '`printf "%d" abc` 不报错而是输出 0，想校验输入别依赖 printf 的类型检查'
      ],
      related: ['lt-awk-printf', 'lt-column', 'lt-cut'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/printf-invocation.html',
      tags: ['格式化', '对齐', '补零']
    },

    /* ---------- 37 / 42 ---------- */
    {
      id: 'lt-nginx-top-ip',
      name: 'awk + sort + uniq 统计 Top IP',
      kind: 'recipe',
      alias: ['nginx top ip', '访问量 top10', 'sort uniq -c sort -rn', '统计来源 IP'],
      level: 2,
      syntax: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10",
      summary: '从 Nginx 访问日志里统计访问量最高的 10 个客户端 IP。',
      desc: '整条链路共五步：`awk` 取第一列（客户端 IP）→ `sort` 把相同 IP 排到相邻位置 → `uniq -c` 合并相邻重复行并计数 → `sort -rn` 按次数倒序 → `head -10` 取前十。之所以必须先 `sort`，是因为 `uniq` 只合并相邻的重复行。想看某一天的 Top IP，先 `grep "01/May/2024" /var/log/nginx/access.log` 再接同样的管道即可。',
      params: [
        { flag: "awk '{print $1}'", desc: '提取第一列，Nginx 默认格式里就是客户端 IP' },
        { flag: 'sort', desc: '把相同 IP 排到相邻位置，是 `uniq` count 的前置条件' },
        { flag: 'uniq -c', desc: '合并相邻重复行，并在行首写上出现次数' },
        { flag: 'sort -rn', desc: '按数值倒序，把次数最多的排到最前' },
        { flag: 'head -10', desc: '取前 10 条；改成 `head -20` 就是 Top 20' }
      ],
      examples: [
        { cmd: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10", desc: '统计访问量 Top 10 的客户端 IP' },
        { cmd: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20 | awk '{print $2}' > /tmp/top-ip.txt", desc: '把 Top 20 的 IP 单独存成文件，交给封禁脚本处理' }
      ],
      notes: [
        '`uniq` 不 sort 就无效：它只比较相邻行，日志里同一个 IP 分散在各处，不先 `sort` 会统计出一堆“只出现一次”的假结果',
        '`sort` 在千万行日志上会同时吃内存和 `/tmp` 空间，磁盘紧张时加 `-T /data/tmp`，只想看趋势可以先 `tail -100000` 采样',
        '经过 CDN 或 Nginx 反代后 `$1` 是代理的 IP，真实客户端 IP 在 `X-Forwarded-For` 里，需要在 `log_format` 里记下 `$http_x_forwarded_for` 才能统计准确'
      ],
      related: ['lt-uniq', 'lt-sort-column', 'lt-nginx-status', 'lt-log-time-window'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_log_module.html',
      tags: ['Nginx', '日志分析', '统计', 'Top榜']
    },

    /* ---------- 38 / 42 ---------- */
    {
      id: 'lt-nginx-status',
      name: 'awk + sort + uniq 统计状态码分布',
      kind: 'recipe',
      alias: ['状态码统计', 'http status', '5xx 统计', '404 统计'],
      level: 2,
      syntax: "awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn",
      summary: '统计 HTTP 状态码分布，一眼看出 4xx 与 5xx 有没有突增。',
      desc: 'Nginx 默认 combined 格式里第 9 列是状态码：`$remote_user` 为空时占一个 `-`，时区 `+0800` 也单独占一列，所以状态码正好落在 `$9`。按状态码统计能区分“客户端在刷 404”和“后端挂了导致大量 502”。再往下定位是哪些 URL 报错，把取列脚本换成过滤条件即可。',
      params: [
        { flag: "awk '{print $9}'", desc: '取状态码列' },
        { flag: 'sort | uniq -c', desc: '先排序再计数，顺序不能颠倒' },
        { flag: 'sort -rn', desc: '按次数从多到少排列' },
        { flag: "awk '$9 >= 500 {print $7}'", desc: '只看 5xx 的请求 URL' },
        { flag: 'grep -c " 500 "', desc: '快速数某一种状态码的条数（前后带空格避免误匹配字节数）' }
      ],
      examples: [
        { cmd: "awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", desc: '看当天各状态码的分布' },
        { cmd: "awk '$9 >= 500 {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20", desc: '找出报 5xx 最多的 URL' }
      ],
      notes: [
        '状态码在第几列取决于 `log_format`：自定义格式挪动了 `$status` 或加了字段，`$9` 就不对了，先 `head -1` 看一行日志数数列',
        '`404` 多通常是扫描器或前端资源路径写错，`499` 是客户端主动断开（Nginx 特有），`502/504` 才是后端问题',
        '历史日志是压缩包时，把 `cat` 换成 `zcat /var/log/nginx/access.log-*.gz` 一起统计'
      ],
      related: ['lt-nginx-top-ip', 'lt-log-error-rate', 'lt-uniq', 'lt-awk-filter'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_log_module.html',
      tags: ['Nginx', '状态码', '统计', '告警']
    },

    /* ---------- 39 / 42 ---------- */
    {
      id: 'lt-log-time-window',
      name: 'sed + awk 提取时间段日志',
      kind: 'recipe',
      alias: ['时间区间日志', 'sed -n 区间', '日志时间段', 'journalctl --since'],
      level: 3,
      syntax: 'sed -n "/01\\/May\\/2024:10:00/,/01\\/May\\/2024:11:00/p" /var/log/nginx/access.log',
      summary: '按时间区间截取日志片段，排障时只看事发那几十分钟。',
      desc: 'Nginx 日志天然按时间递增，用 `sed -n "/起始/,/结束/p"` 按首尾特征行截取最省事，时间里的斜杠要转义成 `\\/`。系统日志用 `journalctl --since "2024-05-01 10:00" --until "2024-05-01 11:00"` 更规范，结构化 JSON 日志则用 `jq \'select(.ts >= "...")\'`。截出来的片段通常再接统计管道看这段窗口里发生了什么。',
      params: [
        { flag: 'sed -n "/起点/,/终点/p"', desc: '按特征行区间打印，首尾两行都会包含在内' },
        { flag: '\\/', desc: '时间里的斜杠在 sed 地址中需要转义' },
        { flag: "awk '$4 >= \"[01/May/2024:10:00\"'", desc: '用字段字符串比较做时间窗（格式一致时才有效）' },
        { flag: 'journalctl --since --until', desc: 'systemd 日志按时间过滤，支持 "1 hour ago" 这类写法' },
        { flag: 'wc -l', desc: '看这个时间窗里一共有多少条请求' }
      ],
      examples: [
        { cmd: 'sed -n "/01\\/May\\/2024:10:00/,/01\\/May\\/2024:11:00/p" /var/log/nginx/access.log | head -50', desc: '截取 10:00 到 11:00 之间的日志' },
        { cmd: 'sed -n "/01\\/May\\/2024:10:00/,/01\\/May\\/2024:11:00/p" /var/log/nginx/access.log | awk \'$9 >= 500\' | wc -l', desc: '数出这段时间里有多少条 5xx 请求' }
      ],
      notes: [
        '`sed` 的区间是“从第一个匹配行到下一个匹配行”：结束时间在日志里不存在时会一直打印到文件末尾，而且不报错',
        '日志轮转后单个文件不一定覆盖整个时间窗，跨天查询要先用 `zcat`/`zgrep` 把多个归档一起处理',
        '时间字符串比较只适用于格式完全一致的日志；ISO8601 与 `dd/Mon/yyyy` 混用，或跨年时，必须先解析成时间再比'
      ],
      related: ['lt-sed-address', 'lt-zgrep-r', 'lt-nginx-top-ip', 'lt-log-error-rate'],
      docs: 'https://nginx.org/en/docs/http/ngx_http_log_module.html',
      tags: ['时间段', '日志', '排障', '区间']
    },

    /* ---------- 40 / 42 ---------- */
    {
      id: 'lt-log-error-rate',
      name: 'awk 统计错误率',
      kind: 'recipe',
      alias: ['错误率', '5xx 占比', 'error rate', '可用性统计'],
      level: 3,
      syntax: "awk '{t++; if ($9 >= 500) e++} END{printf \"5xx %d / 总 %d = %.2f%%\\n\", e, t, e*100/t}' /var/log/nginx/access.log",
      summary: '一次扫描算出 5xx 错误率，比多次 grep 更快也更准。',
      desc: '把“总请求数”和“错误数”放在同一次 `awk` 扫描里累加，最后在 `END` 块算比值，比先 `grep -c` 再 `wc -l` 跑两遍更快，也不会因为两次统计时文件正在写入而对不上。要按分钟看错误率趋势，就用 `substr($4,2,17)` 取到分钟做分组键，再逐组算比值。',
      params: [
        { flag: 't++ / e++', desc: '总请求数与错误数各自累加' },
        { flag: '$9 >= 500', desc: '判定服务端错误；只看某一种可用 `$9 == 502`' },
        { flag: 'END{printf ...}', desc: '结束时输出比值，`%.2f%%` 控制小数位' },
        { flag: 'substr($4,2,17)', desc: '从时间字段里取出到分钟的时间键，用于分时段统计' },
        { flag: 'a[k]++', desc: '按时间键分组计数' }
      ],
      examples: [
        { cmd: "awk '{t++; if ($9 >= 500) e++} END{printf \"5xx %d / 总 %d = %.3f%%\\n\", e, t, e*100/t}' /var/log/nginx/access.log", desc: '一个文件算一次整体 5xx 错误率' },
        { cmd: "awk '{m=substr($4,2,17); t[m]++; if ($9>=500) e[m]++} END{for (k in t) printf \"%s %6.2f%% (%d/%d)\\n\", k, e[k]*100/t[k], e[k], t[k]}' /var/log/nginx/access.log | sort | tail -20", desc: '按分钟输出错误率，看是哪几分钟开始恶化' }
      ],
      notes: [
        '空文件或过滤后没有数据时 `t` 为 0，`e*100/t` 会输出 `-nan`，脚本里先判断 `t > 0` 再算',
        '只盯 5xx 会漏掉“4xx 突增”：扫描器探测、鉴权失败通常表现为 401/403/404 激增，做告警阈值时按 `>= 400` 更敏感',
        '日志跨多个归档文件时用 `zcat /var/log/nginx/access.log-*.gz | awk ...` 合并统计，只算当前文件会低估总量'
      ],
      related: ['lt-nginx-status', 'lt-log-time-window', 'lt-awk-sum', 'lt-awk-begin-end'],
      docs: 'https://www.gnu.org/software/gawk/manual/gawk.html',
      tags: ['错误率', '日志分析', '告警', '统计']
    },

    /* ---------- 41 / 42 ---------- */
    {
      id: 'lt-jq-k8s-pod',
      name: 'kubectl + jq 提取 Pod 名与状态',
      kind: 'recipe',
      alias: ['kubectl jq', 'pod 状态导出', 'json 提取 pod', 'k8s 巡检'],
      level: 2,
      syntax: 'kubectl get pod -A -o json | jq -r \'.items[] | "\\(.metadata.namespace)/\\(.metadata.name) \\(.status.phase)"\'',
      summary: '从 kubectl 的 JSON 输出里批量提取 Pod 名、命名空间与状态。',
      desc: '`kubectl get pod -o json` 返回的是完整的 PodList 对象，`.items[]` 把它展开成一个个 Pod，再用 `"\\(...)"` 字符串插值拼出“命名空间/名字 状态”。相比 `kubectl get pod -o wide` 的表格，jq 取到的字段更稳定、不受终端宽度影响，适合写巡检脚本或导出成报表；同一套路还能取就绪状态、重启次数、所在节点和容器镜像。',
      params: [
        { flag: '-o json', desc: '让 kubectl 输出完整 JSON 而不是表格' },
        { flag: '.items[]', desc: '展开列表里的每个对象（少了 `[]` 就无法逐行处理）' },
        { flag: '"\\(.a)/\\(.b)"', desc: 'jq 字符串插值，把多个字段拼成一行' },
        { flag: '-r', desc: '去掉输出字符串两端的引号' },
        { flag: '.status.phase', desc: 'Pod 阶段：Running / Pending / Succeeded / Failed / Unknown' },
        { flag: 'select(.status.phase != "Running")', desc: '只挑出非 Running 的 Pod' },
        { flag: '.status.containerStatuses[].restartCount', desc: '容器重启次数，判断是否反复崩溃' },
        { flag: '-c', desc: '一行一条 JSON，便于再喂给 `while read` 处理' }
      ],
      examples: [
        { cmd: 'kubectl get pod -A -o json | jq -r \'.items[] | "\\(.metadata.namespace)/\\(.metadata.name) \\(.status.phase)"\'', desc: '列出全部 Pod 的“命名空间/名字 状态”' },
        { cmd: 'kubectl get pod -A -o json | jq -r \'.items[] | select(.status.phase != "Running") | "\\(.metadata.namespace)/\\(.metadata.name) \\(.status.phase)"\'', desc: '只输出非 Running 的 Pod，巡检时一眼看到异常' },
        { cmd: 'kubectl get pod -A -o json | jq -r \'.items[] | "\\(.metadata.name) \\(.status.containerStatuses[0].restartCount)"\' | sort -k2,2nr | head', desc: '按容器重启次数做 Top 排行' }
      ],
      notes: [
        '`-A` 才是所有命名空间；`.items[]` 是数组展开，误写成 `.items` 会整段输出、无法逐行处理',
        '容器还没起来时 `.status.containerStatuses` 可能是 `null`，直接取 `[0].restartCount` 会报 `Cannot index null`，稳妥写法是 `// 0` 兜底',
        '过滤表达式整体用 shell 单引号包住，jq 的插值模板 `"\\(...)"` 内部才用双引号；两处引号写反会得不到结果'
      ],
      related: ['lt-jq', 'lt-yq', 'lt-awk'],
      docs: 'https://jqlang.github.io/jq/manual/',
      tags: ['Kubernetes', 'JSON', '巡检', 'Pod']
    },

    /* ---------- 42 / 42 ---------- */
    {
      id: 'lt-dedupe-large-file',
      name: 'sort -u 大文件去重',
      kind: 'recipe',
      alias: ['大文件去重', 'sort -u', '外部归并排序', '去重思路'],
      level: 3,
      syntax: 'sort -u -T <临时目录> -S <内存上限> <大文件> > <去重结果>',
      summary: '用外部归并排序给超大文件去重，内存占用可控不撑爆机器。',
      desc: '`sort` 在数据量超过 `-S` 指定的内存上限时，会自动把中间结果写成临时归并文件，所以 20 GB 的文件也能在 4 GB 内存的机器上跑完 `sort -u`；关键是把 `-T` 指到大容量磁盘、把 `-S` 调到物理内存的 50%~70%。只想按某一列去重就写 `sort -t, -k1,1 -u`；而 awk 的 `!seen[$1]++` 只适合“唯一值不多、能全放进内存”的场景。',
      params: [
        { flag: '-u', desc: '排序的同时按排序键去重，等价于 `sort | uniq` 但只走一趟' },
        { flag: '-T /data/tmp', desc: '指定临时文件目录（默认 `/tmp`，很容易把根分区写满）' },
        { flag: '-S 2G', desc: '允许使用的内存上限，给得越大速度越快' },
        { flag: '-k1,1 -u', desc: '只按第 1 列去重（保留该列第一次出现的那一整行）' },
        { flag: '--parallel=4', desc: '并行排序的线程数' },
        { flag: 'split -l 5000000', desc: '先切片再分别去重，最后 `sort -m` 归并，适合必须限制单进程内存的场合' }
      ],
      examples: [
        { cmd: 'sort -u -T /data/tmp -S 2G /data/logs/all-ids.txt > /data/logs/uniq-ids.txt', desc: '千万行以上的 ID 文件去重，临时文件落在大容量磁盘上' },
        { cmd: 'split -l 5000000 /data/logs/all-ids.txt part- && for f in ./part-*; do sort -u -T /data/tmp "$f" -o "$f.u"; done && sort -m -u -T /data/tmp ./part-*.u > /data/logs/uniq-ids.txt', desc: '先切片各自去重，再用 `sort -m -u` 归并成最终结果（教学终端的通配符只在带 `/` 的写法上展开，所以这里写 `./part-*`）' }
      ],
      notes: [
        '先估算磁盘：`sort` 的临时文件可能达到输入量的 2~3 倍，动手前 `df -h /data/tmp` 看一眼剩余空间',
        '`sort -u` 是整行去重；只想去重某一列又不丢其他列时要写 `-k1,1 -u`，它保留的是该列首次出现的那一行',
        '千万别把结果重定向回原文件（`sort -u a.txt > a.txt`）：shell 会先清空文件，数据直接全丢，必须先写临时文件再 `mv`',
        'awk 的 `!seen[$1]++` 写法更简单，但 key 全放内存，唯一值上亿时会 OOM；`sort` 能用磁盘换内存，才是超大文件的正解'
      ],
      related: ['lt-sort-column', 'lt-uniq', 'lt-awk-dedupe'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/sort-invocation.html',
      tags: ['大文件', '去重', '内存控制', '排序']
    }

  );
})();
