/* data/lessons-shell.js · Shell 脚本编程（练习课）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。每节课的 steps[].cmd 必须是**引擎真能跑通**的
   命令（tools/shell-check.js 会把每节课的 answer/alt/step.cmd 逐条执行验证），
   每步都要有 ref（回指命令手册条目 id）与两级 hint。

   写法约定：
     · 步骤对象**一行一个** —— tools/hint-check.js 与 about-leak-check.js 按行解析
     · 命令里的 Shell 字符串一律用双引号，外层用单引号，避免转义打架
     · 同一条命令里不要混用 `||` 与 `;`（引擎遇到 `A || B; C` 且 A 成功时会跳过 C）
     · 每一步的 cmd 都必须以 0 退出；像 `grep` 无匹配返回 1 这类"非零也是结论"的
       命令，一律改用 `grep -c` 或配上 `&&` / `||` 让整条命令落到 0

   【重要】本站引擎的 Shell 控制流能力清单（2026-xx 一轮大修后**逐条实测**过）：
     能跑：for ... in <列表 | 通配符 | 命令替换 $(…)>、`{1..5}`、
           算术展开 $((…))（+ - * / % 比较与 ++/--）、
           数字比较 -eq -ne -gt -ge -lt -le、字符串比较 = != 与 [[ ]]=~、
           if ... then ... elif ... else ... fi（可嵌在循环体里）、
           while / until（含 while IFS= read -r ... < 文件、管道 | while read）、
           case ... in ... esac（含通配分支与 | 多模式）、break / continue、
           命令替换（里面可以再带管道与分号）、参数展开（取长度 / 去前后缀 / 切片 /
           ${VAR:-} ${VAR:=} ${VAR:?} ${VAR:+}）、
           > >> 2> &> 以及**多重定向** `> out 2> err`、`> all 2>&1`、$?、&& / ||、
           `cd -`、管道（每段在独立子 shell 里，变量改动不回传 —— 与教材一致）

     仍然不支持（所以本文件里一条都没用，写课时请避开）：
       `set -- a b c` 与位置参数（$1/$# 在终端里恒为空/0）、数组、函数、trap、
       进程替换 `<(…)`、here-doc / here-string、C 风格 for 的某些写法、
       `done | 命令`（把整条循环的输出接进管道）、`rmdir`、`2>&1 > 文件` 之外的重定向顺序细节

     两条写课纪律（踩过的坑）：
       · 步骤对象必须**一行一个** —— hint-check / about-leak-check 按行解析，
         拆成多行会被整份跳过而工具照样报"全部通过"
       · 每步 cmd 都要以 0 退出：像 `grep` 无匹配返回 1、`${VAR:?}` 报错退出这类
         "非零也是结论"的命令，要用 `grep -c` / `|| echo …` 让整条落到 0

   场景取自 data/termfs.js 的真实文件：/data/backup 的归档、/opt/scripts/hosts.txt
   的多主机清单、/var/log/nginx 的 access.log 与 error.log。
    -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

      /* ================= 1 · 清归档目录 ================= */
      {
        id: 'sh-log-archive-loop',
        cat: 'shell',
        title: '清归档目录：从"看清范围"到"真删一个"',
        prompt: '/data/backup 已经堆了 16 个文件、撑到 15G，运维让你按保留策略清掉最老的那批。可你打开目录一看：里面既有能安全删掉的压缩归档，也有几张昨天刚被人拿去做恢复演练的裸 SQL 文件 —— 一刀切下去就出事了。',
        task: '在动删除之前，用循环先把「准备清理哪些归档」列出来演练一遍，确认无误后再真删一个',
        steps: [
          { title: '先摸清目录里都有什么', about: '看清归档目录的完整清单，这一步不改动任何东西', cmd: 'ls /data/backup', ref: 'lb-ls', hint: ['定保留策略之前先摸清家底：这个目录里既有可以直接删的压缩归档，也有别人正在做恢复演练用的裸文件，混在一起删一定出事。', '____ /data/backup'], note: '十几个条目：4 个 .tar.gz 归档、一堆 .sql 裸文件与压缩包、还有个 xtra-20240318 子目录' },
          { title: '把范围收窄到压缩归档', about: '只挑出已经打包压好的那一类，裸文件一律不碰', cmd: 'ls /data/backup/*.tar.gz', ref: 'sh-for', hint: ['用通配符把范围收窄：真正安全可删的只有已经压好的归档，留下没压缩的裸备份文件不动。', 'ls /data/backup/____'], note: '只剩 4 个 —— app-2024-01-01、db_20240101、www-2024-03-16、www-2024-03-17' },
          { title: '把日期戳那一段单独取出来看', about: '去掉目录前缀和扩展名之后，剩下的那一段才是判断新旧的依据', cmd: 'basename /data/backup/www-2024-03-16.tar.gz .tar.gz', ref: 'sh-string-ops', hint: ['清单要给人看就得去掉噪音：目录前缀和扩展名对判断"这是哪一天的备份"没有帮助，留下的那一段才是关键。', '____ /data/backup/www-2024-03-16.tar.gz .tar.gz'], note: 'www-2024-03-16 —— 光看这一行就知道该先动哪一份' },
          { title: '让循环逐个报一遍要清理的对象', about: '让循环一个个报出准备清理的归档名，先只打印不删任何东西', cmd: 'for f in /data/backup/*.tar.gz; do echo "${f##*/}"; done', ref: 'sh-for', hint: ['范围确认了就开始演练：让循环一个个报出要清理的对象，这一步只说不做，出错了也不会丢数据。打印时只显示文件名，别把整条路径都刷出来。', 'for f in /data/backup/*.tar.gz; do echo "____"; done'], note: '四行输出，全是文件名 —— 这就是演练：删之前先把动作演一遍' },
          { title: '确认无误再真删，而且第一次只删一个副本', about: '确认删掉的那一份真的没了，而归档目录里的原件一个不少', cmd: 'cp /data/backup/www-2024-03-16.tar.gz /tmp/old-www.tar.gz && rm -f /tmp/old-www.tar.gz && ls /tmp/old-www.tar.gz 2>/dev/null; ls /data/backup/*.tar.gz | wc -l', ref: 'sh-for', hint: ['演练通过才真动手，而且第一次只删一份：删完立刻回看，确认它确实没了。', 'cp /data/backup/www-2024-03-16.tar.gz /tmp/old-www.tar.gz && ____ /tmp/old-www.tar.gz && ls /tmp/old-www.tar.gz 2>/dev/null; ls /data/backup/*.tar.gz | wc -l'], note: '副本删掉了（`ls` 找不到、退出码 2），归档目录里仍然是 4 份 —— 先在副本上走通删除，再对真下手，这就是"演练"的全部意义' }
        ],
        answer: 'for f in /data/backup/*.tar.gz; do echo "${f##*/}"; done',
        alt: [
          'ls /data/backup/*.tar.gz',
          'for f in /data/backup/*.tar.gz; do echo "$f"; done'
        ],
        expect: /app-2024-01-01/,
        teach: '批量清理的固定三步：**先只列出 → 再只打印 → 最后才真动手**。第一步不碰任何文件，第二步把循环跑一遍但不删（也就是演练），第三步才删，而且第一次只删一份、删完立刻回头看。真正的事故不是"少删了"，而是"多删了"——删掉的归档如果没有异地副本就再也回不来。\n\n循环头里的 `/data/backup/*.tar.gz` 是**通配符**，shell 会在执行 `for` 之前就把它展开成四个独立的名字，所以循环体里拿到的 `$f` 是一个完整路径；打印时用 `${f##*/}` 把目录前缀切掉，输出才是给人看的。这里**没有按天数筛**（真机上一般写 `find ... -mtime +7`），因为本教学终端的文件时间戳是固定的、天数筛选跑不出结果，真机上把它接在 `for` 的列表位置即可。'
      },

      /* ================= 2 · 多主机巡检 ================= */
      {
        id: 'sh-hosts-inventory-loop',
        cat: 'shell',
        title: '多主机巡检：清单里混着注释行怎么办',
        prompt: '运维丢给你一份 /opt/scripts/hosts.txt，说「这上面的机器都看一眼」。你打开一看：5 台地址里夹着一行注释（维护中的机器），还有一行是空的。直接把整个文件丢进循环，那行注释会被当成一台主机去连。',
        task: '先把清单洗干净、数清楚有几台，再逐台走一遍并把整批结果写进一份巡检日志',
        steps: [
          { title: '先看清清单本身长什么样', about: '把清单内容原样看一遍，找出混在里面的注释行', cmd: 'cat /opt/scripts/hosts.txt', ref: 'sh-var-export', hint: ['批量操作的第一原则：先看清清单本身。里面有注释行、有维护中的机器，直接拿去循环会把注释放到命令行里去执行。', '____ /opt/scripts/hosts.txt'], note: '6 行里有 1 行注释（维护中的那台），另外 5 行是真地址' },
          { title: '把注释行滤掉', about: '把注释行反向排除掉，只留下真正要连的地址', cmd: "grep -v '^#' /opt/scripts/hosts.txt", ref: 'lt-grep', hint: ['清单里的注释行不能进循环，得先滤掉。判据是"这一行以什么字符开头"，要让这类行反过来被排除。', "grep -v '____' /opt/scripts/hosts.txt"], note: '从 6 行变 5 行，维护中那台被正确排除了' },
          { title: '数清楚到底有多少台', about: '滤干净之后统计行数，知道这一批的规模', cmd: "grep -v '^#' /opt/scripts/hosts.txt | wc -l", ref: 'lt-grep', hint: ['滤干净之后要有个数：这一批一共几台机器，决定了你后面分几批做、要不要先在测试机上验证。', "grep -v '^#' /opt/scripts/hosts.txt | ____"], note: '5 台 —— 这个数字要跟清单长度对得上，对不上就是过滤条件写错了' },
          { title: '把干净的清单落成文件', about: '把过滤结果存成文件，让循环和别的脚本都能重复使用', cmd: "grep -v '^#' /opt/scripts/hosts.txt > /tmp/hosts-clean.txt && cat /tmp/hosts-clean.txt", ref: 'sh-redirect', hint: ['每次都重新过滤一遍既慢又容易写错，把结果落成一个文件更稳：以后循环读这个文件，别人接手时也知道机器从哪来。', "grep -v '^#' /opt/scripts/hosts.txt ____ /tmp/hosts-clean.txt && cat /tmp/hosts-clean.txt"], note: '`>` 是覆盖写入；清单类文件用 `>` 正好，不会越攒越多' },
          { title: '逐台走一遍，读的是刚洗好的清单文件', about: '让循环从干净清单里一行一行读主机地址，逐台报一句', cmd: 'while IFS= read -r h; do echo "检查 $h"; done < /tmp/hosts-clean.txt', ref: 'sh-read', hint: ['机器多起来之后就不该把地址抄进循环：让循环直接从洗好的清单里一行行读，清单变了脚本不用改。两个参数是重点——一个保住行首尾空白，一个禁止反斜杠被转义。', 'while ____ read -r h; do echo "检查 $h"; done < /tmp/hosts-clean.txt'], note: '5 行输出，正好对应清单里的 5 台；注释行没有出现 —— 因为它在第 2 步已经被滤掉了' },
          { title: '把整批结果收进一份巡检日志', about: '把整批输出写进一份带日期的日志文件，供后面核对', cmd: 'while IFS= read -r h; do echo "检查 $h"; done < /tmp/hosts-clean.txt > /tmp/batch-2024-03-18.log && cat /tmp/batch-2024-03-18.log', ref: 'sh-redirect', hint: ['几十台的输出直接刷屏就没法核对了，把整批结果收进一份日志文件。重定向写在 `done` 之后，收走的是整条循环的输出。', 'while IFS= read -r h; do echo "检查 $h"; done < /tmp/hosts-clean.txt ____ /tmp/batch-2024-03-18.log && cat /tmp/batch-2024-03-18.log'], note: '输入重定向 `<` 和输出重定向 `>` 可以同时写：清单从左边进、日志从右边出' },
          { title: '顺手数一遍这一批有多少台', about: '用一个计数器统计实际处理的台数，用来和清单长度对账', cmd: 'N=0; while IFS= read -r h; do N=$((N+1)); done < /tmp/hosts-clean.txt; echo "共 $N 台"', ref: 'sh-special-vars', hint: ['处理完要跟清单对账：用一个计数器在循环里累加，看看实际处理的台数对不对得上。计数器的自增要用算术展开，`N++` 这种写法在这里是不成立的。', 'N=0; while IFS= read -r h; do N=$((____)); done < /tmp/hosts-clean.txt; echo "共 $N 台"'], note: '`< 文件` 形式的 while 是在**当前 shell** 里跑的，所以 `N` 能带出循环；换成 `cat 清单 | while` 就读不到了（后面第 6 课会专门验证这个陷阱）' }
        ],
        answer: "grep -v '^#' /opt/scripts/hosts.txt > /tmp/hosts-clean.txt && while IFS= read -r h; do echo \"检查 $h\"; done < /tmp/hosts-clean.txt > /tmp/batch-2024-03-18.log && cat /tmp/batch-2024-03-18.log",
        alt: [
          "while IFS= read -r h; do echo \"检查 $h\"; done < /opt/scripts/hosts.txt > /tmp/batch-2024-03-18.log && cat /tmp/batch-2024-03-18.log",
          "grep -v '^#' /opt/scripts/hosts.txt > /tmp/hosts-clean.txt && while read -r h; do echo \"检查 $h\"; done < /tmp/hosts-clean.txt > /tmp/batch-2024-03-18.log && cat /tmp/batch-2024-03-18.log"
        ],
        expect: /10\.0\.1\.21/,
        teach: '批量运维脚本的第一条纪律是**清单必须先洗**：注释行、空行、行尾的 `\\r`（Windows 上传的清单）都不能直接进循环，否则轻则报 command not found，重则把一行注释当成主机名去执行。标准动作就是 `grep -v \'^#\' 清单 > 干净清单`，再 `wc -l` 确认台数对得上。\n\n第二条纪律是**逐行读文件要用 `while IFS= read -r`**，而不是 `for h in $(cat 清单)`。这里的两个参数各有各的用处：`IFS=` 把字段分隔符清空，行首尾的空格/制表符才不会被吃掉；`-r` 禁止把反斜杠当转义符（Windows 路径、含 `\\` 的密码全靠它）。`for h in $(cat 清单)` 的问题在于命令替换的结果会**按空白切词**——清单里一旦有带空格的字段就会被拆成两台"主机"，而正确的写法不会。\n\n第三条纪律是**输出要留痕**：几十台机器的结果全刷在屏幕上根本没法核对，把整批输出重定向到一个带日期的日志文件，出问题时有据可查。注意重定向写在 `done` 之后，是**整条循环**的输出一起收走，不是循环体里每行各写一次。\n\n真机上这一段还要加**连接超时与批量模式**（`ssh -n -o BatchMode=yes -o ConnectTimeout=5` 外加 `timeout`），并且**先跑 1~2 台验证再全量**——批量脚本最大的事故是一条错命令同时影响几百台机器。本教学终端不会真的连远端主机（`ssh` 会明确提示「未实现」），所以这里练的是清单处理、逐行读取与留痕这三件真功夫。'
      },

      /* ================= 3 · 命令替换与参数展开 ================= */
      {
        id: 'sh-timestamp-filename',
        cat: 'shell',
        title: '备份文件名里的日期：命令替换与参数展开',
        prompt: '你写了一段备份逻辑，第一版把日期写死成 db-2024-03-18.sql。同事看了一眼说：明天它就会把今天的备份覆盖掉。要让它每天自己算出日期，还得在不调用 basename / cut 的前提下把路径拆开。',
        task: '用命令替换取到当天日期存进变量，再用参数展开把完整路径拆成「文件名」和「去后缀的名字」',
        steps: [
          { title: '先确认这台机器给出的日期长什么样', about: '确认这台机器此刻算出来的日期格式', cmd: 'date +%F', ref: 'sh-var-export', hint: ['写脚本时最怕把日期写死：时间一过脚本就废。先确认这台机器此刻给出的日期格式，再决定怎么用它。', '____ +%F'], note: '2024-03-18 —— `%F` 就是"年-月-日"这个可排序的格式' },
          { title: '把日期存进变量', about: '把上一步的结果存进变量，让后面每次引用都是同一个值', cmd: 'STAMP=$(date +%F); echo "$STAMP"', ref: 'sh-pipe-cmdsub', hint: ['同一条命令里的日期只能取一次：先存进变量再复用，否则跨零点时前后两次取到不同日期，文件名和内容就对不上了。', '____=$(date +%F); echo "$STAMP"'], note: '变量名后面不要留空格，赋值时等号两边也不能有空格' },
          { title: '把日期拼进文件名', about: '用同一个日期戳拼出一条完整路径', cmd: 'STAMP=$(date +%F); echo "/data/backup/db-$STAMP.sql"', ref: 'sh-quotes', hint: ['把日期戳拼进文件名：变量要能正确展开，就要放在双引号里面；单引号里的那一段会原样输出。', 'STAMP=$(date +%F); echo "/data/backup/____"'], note: '双引号里 `$STAMP` 正常展开；换成单引号的话这里会原样打印 `$STAMP`' },
          { title: '从完整路径里只取文件名', about: '从一整条路径里只取出最后那一段文件名', cmd: 'REPORT=/var/log/app/app-2024-03-18.log; echo "${REPORT##*/}"', ref: 'sh-string-ops', hint: ['脚本里经常要把完整路径拆成"只要文件名"或"只要目录"：不用去调外部命令，参数展开里去掉最长前缀那一种写法就能做到。', 'REPORT=/var/log/app/app-2024-03-18.log; echo "____"'], note: '两个井号是从左边删到最后一个斜杠，等价于 `basename`，但不启动任何子进程' },
          { title: '去掉后缀，留下干净的名字', about: '去掉文件名末尾的旧后缀，得到能换新后缀的干净名字', cmd: 'REPORT=/var/log/app/app-2024-03-18.log; echo "${REPORT%.log}"', ref: 'sh-string-ops', hint: ['要给它换后缀，就得先把旧后缀切掉：去掉后缀的写法用的是百分号，单百分号是最短匹配，双百分号是最长匹配。', 'REPORT=/var/log/app/app-2024-03-18.log; echo "____"'], note: '去掉 `.log` 之后就能拼新名字，比如 `${REPORT%.log}.log.1`' }
        ],
        answer: 'STAMP=$(date +%F); echo "/data/backup/db-$STAMP.sql"',
        alt: [
          'date +%F',
          'STAMP=$(date +%F); echo "$STAMP"'
        ],
        expect: /2024-03-18/,
        teach: '**日期只取一次**：`STAMP=$(date +%F)` 之后再到处重用，不要在每个用到日期的地方各调一次 `date`——跨零点执行时前后两次会取到不同日期。这一点在备份脚本里是硬要求：文件名、日志名、保留策略必须基于同一个时间点。\n\n**参数展开是零成本的字符串手术刀**：取文件名、取目录、去后缀、取长度全都是 shell 内建操作，不启动任何子进程。在几千次的循环里，它比反复调 `basename` / `sed` 快几个数量级。记口诀：**井号在键盘上位于美元符号左边，所以删的是前缀；百分号在右边，删的是后缀**；单符号最短匹配、双符号最长匹配。\n\n**命令替换统一用 `$(...)`**，反引号虽等价但**不能嵌套**、转义规则反直觉，新脚本不要再写。命令替换里可以再放管道与分号（`N=$(grep -v "^#" 清单 | wc -l)` 是常见写法），也可以直接放进 `for` 的列表位置：`for f in $(ls /data/backup/*.tar.gz); do …; done`。**但列表来源要挑**——命令替换的结果会按空白切词，文件名里带空格就会被拆开，这种场合该用 `while IFS= read -r` 而不是 `for`。'
      },

      /* ================= 4 · 参数兜底值 ================= */
      {
        id: 'sh-param-fallback',
        cat: 'shell',
        title: '脚本被漏传参数：兜底值怎么给',
        prompt: '同事的清理脚本里写着 `KEEP_DAYS=$1`，结果有人执行时漏了参数，变量成了空字符串，脚本里的 `find "$LOG_DIR" -mtime +"$KEEP_DAYS"` 直接变成了一条「扫全盘」的危险命令。他问你：有没有一种写法，能在参数没传时自动退回默认值，而不是留下一个空变量到处跑？',
        task: '看清未定义变量展开出来是什么，再用参数展开给它兜底值，并把它用在一条待处理清单上',
        steps: [
          { title: '先看清没人赋值的变量长什么样', about: '先看清一个没人设置过的变量引用出来是什么样', cmd: 'echo "$KEEP"', ref: 'sh-special-vars', hint: ['先看清"没人给它赋过值"的时候会得到什么：空的不是报错，但拼进路径里就会变成一条指向根目录的危险命令。', 'echo "____"'], note: '什么也没有 —— 空值不会报错，这正是危险所在' },
          { title: '给它一个兜底值', about: '给变量一个兜底值，它为空或没定义时就用这个', cmd: 'echo "${KEEP:-7}"', ref: 'sh-param-default', hint: ['兜底值的写法是冒号加短横：变量有值就用它自己，为空或没定义才用冒号后面那个。注意这个写法只是临时取值，不会写入变量。', 'echo "${KEEP:-____}"'], note: '展开成 7，但变量 `KEEP` 本身**还是空的** —— 冒号短横不修改原变量' },
          { title: '把兜底值真正存回变量', about: '把兜底值写回变量本身，后面统一用它', cmd: 'KEEP=${KEEP:-7}; echo "保留 $KEEP 天"', ref: 'sh-param-default', hint: ['如果后面还要用很多次，就把兜底值存回变量本身，别在每个引用点都写一遍默认值——写漏一处就是一个坑。', 'KEEP=${KEEP:-____}; echo "保留 $KEEP 天"'], note: '这一步之后 `$KEEP` 真的有值了，后面几十处引用都不用再写默认值' },
          { title: '同一个手法用在目录上', about: '把兜底值用在路径变量上，直接得到一条待处理清单', cmd: 'LOG_DIR=${LOG_DIR:-/var/log/nginx}; ls "$LOG_DIR"/*.log', ref: 'sh-param-default', hint: ['同样的手法用在目录上：没传参数就退回默认目录，然后直接拿这个变量去列文件。变量引用要加引号，防止路径里有空格时被拆开。', 'LOG_DIR=${LOG_DIR:-____}; ls "$LOG_DIR"/*.log'], note: '目录变量加引号、通配符留在引号外 —— 这两个位置的引号各有各的用处' },
          { title: '换成"必须传"的写法：缺参数就当场失败', about: '让缺失的必填参数直接报错并停下来，而不是留个空值往下跑', cmd: 'DB=${DB_NAME:?必须提供数据库名} || echo "缺少必填参数，脚本就该在这里停下"', ref: 'sh-param-default', hint: ['兜底值适合"有默认值"的参数，但数据库名、环境标识这类**没有合理默认值**的参数不能兜底——缺了就该当场报错停下来。这种写法的意思是"没有值就带着这句提示失败"。', 'DB=${DB_NAME:?____} || echo "缺少必填参数，脚本就该在这里停下"'], note: '报错信息里带上了你自己写的那句提示，而且退出码非 0（`||` 因此被执行）—— 这正是"缺参数就停下"的效果' },
          { title: '有值时它照样正常工作', about: '确认同一个写法在参数齐全时不会误报，值能正常取到', cmd: 'DB_NAME=appdb; DB=${DB_NAME:?必须提供数据库名}; echo "连接 $DB"', ref: 'sh-param-default', hint: ['校验写法在参数齐全时必须是透明的：给它一个值，它就应该老老实实把值交出来、一个字都不多打。', 'DB_NAME=appdb; DB=${DB_NAME:?____}; echo "连接 $DB"'], note: '有值就直接用，没有任何多余输出 —— 校验只在缺失时才发声' }
        ],
        answer: 'KEEP=${KEEP:-7}; echo "保留 $KEEP 天"',
        alt: [
          'echo "${KEEP:-7}"',
          'echo "保留 ${KEEP:-7} 天"'
        ],
        expect: /7/,
        teach: '**`${VAR:-默认值}` 是参数校验的第一道防线**：变量未定义或为空字符串时临时取默认值。去掉冒号的写法只判断「未定义」，**变量为空串时不生效**——日常几乎总是要带冒号。\n\n和它同族的还有三个，记法规律是「冒号代表也处理空值」：`${VAR:=默认}` 会把默认值**写回变量**（本课第 3 步就是它的等价手艺，跑一下 `K=; echo "${K:=兜底}"; echo "$K"` 能看到区别）；`${VAR:?错误信息}` 在变量为空时**直接报错退出**，一句顶一段 `if` 判断，是脚本开头校验必填参数的最佳实践（本课第 5、6 步练的就是它）；`${VAR:+替代值}` 反过来，变量**有值**时才替换，常用来按开关追加参数。\n\n**兜底和校验要分清场合**：有合理默认值的参数（保留天数、日志目录）用 `:-` 兜底；**没有合理默认值**的参数（数据库名、环境标识、集群名）绝不能用兜底糊过去——一个指向错误数据库的脚本比一个当场报错的脚本危险得多。判断标准很简单：**这个默认值错了会不会造成事故**。\n\n最后一条纪律：**变量引用一律加双引号** `"$LOG_DIR"`。不加引号时变量为空会让参数错位（`rm -rf $DIR/` 会变成删根目录），值里有空格会被拆成两个参数——脚本事故里排第一的就是这一条。'
      },

      /* ================= 5 · stderr 与退出码 ================= */
      {
        id: 'sh-stderr-log',
        cat: 'shell',
        title: '把抱怨收进文件：stderr 与退出码',
        prompt: '你写了一条检查语句想确认备份在不在，直接跑了一遍，屏幕上立刻糊了一行红字。同事说：这种「预期内就可能失败」的探测，不该把噪音留给用户看，也不该靠「跑一遍看看报不报错」来判断。',
        task: '看清这条命令失败时把话说给谁听、退出码是多少，再把它的抱怨单独收进文件，最后换成更稳的存在性判断',
        steps: [
          { title: '看清失败时它把话说给谁听', about: '确认目标不存在时，命令的输出去了哪里、最后的判定值是多少', cmd: 'ls -l /data/backup/nginx.tar.gz; echo "退出码 $?"', ref: 'sh-log-error', hint: ['被操作的对象不存在时，命令的抱怨不会混在正常输出里，而且它最后的"生死判定"是个非零值——脚本就是靠这个值决定要不要继续的。', 'ls -l /data/backup/nginx.tar.gz; echo "退出码 ____"']},
          { title: '把抱怨单独收进文件', about: '把出错的那一路收进文件，屏幕留给正常输出', cmd: 'ls -l /data/backup/nginx.tar.gz 2>/tmp/err.txt; echo "退出码 $?"', ref: 'sh-redirect', hint: ['要让屏幕干净、但又不丢掉现场证据，就得把出错的那一路单独收进文件：标准错误用文件描述符编号 2 来表示。', 'ls -l /data/backup/nginx.tar.gz ____/tmp/err.txt; echo "退出码 $?"'], note: '屏幕上不再有红字，但退出码一样是 2 —— 重定向只搬家，不改判定' },
          { title: '确认证据真的落到了文件里', about: '确认错误信息确实写进了文件，而不是凭空消失', cmd: 'ls -l /data/backup/nginx.tar.gz 2>/tmp/err.txt; wc -l /tmp/err.txt', ref: 'sh-redirect', hint: ['重定向有没有生效不能靠感觉：去看那个文件里到底有没有内容、有几行，比在屏幕上猜靠谱得多。', 'ls -l /data/backup/nginx.tar.gz 2>/tmp/err.txt; ____ /tmp/err.txt'], note: '1 行 —— 证据在文件里，排障时随时能翻出来' },
          { title: '换成不吭声的探测', about: '确认目标在不在，但整个过程一个字都不打印', cmd: 'grep -q nginx /tmp/err.txt && echo 探测到报错记录', ref: 'lt-grep', hint: ['要确认目标在不在、又不想让任何东西打印出来，就要挑一个「只回答、不说话」的方式，再用成功才执行的后缀接上你要的动作。', 'grep ____ nginx /tmp/err.txt && echo 探测到报错记录'], note: '只回了退出码，屏幕上干干净净 —— 探测类判断要的就是这个' },
          { title: '把「先判断再动作」写成一份小脚本', about: '按上一步的探测结果分两路走，成功和失败各说一句话', cmd: 'if grep -q nginx /tmp/err.txt; then echo 找到报错记录; else echo 记录里没有这一条; fi', ref: 'sh-if', hint: ['脚本里更稳的写法是先判断再做：条件成立走第一条路，不成立走另一条；条件是"上一条命令成不成功"，而不是去比对文字。', 'if grep -q nginx /tmp/err.txt; then echo 找到报错记录; else echo ____; fi'], note: '`if` 后面直接跟命令，用的是它的退出码 —— 比去比较字符串稳得多' },
          { title: '把两路合进同一个文件：顺序不能反', about: '把正常输出和报错一起收进同一个文件，并确认文件里确实两条路都有', cmd: 'ls -l /data/backup/nginx.tar.gz > /tmp/all.log 2>&1; cat /tmp/all.log', ref: 'sh-redirect', hint: ['有时两路都要留：想让报错也进同一个文件，就要在写文件的后面追加"把标准错误并到标准输出现在去的地方"。**顺序是关键**——它必须写在 `>` 之后。', 'ls -l /data/backup/nginx.tar.gz > /tmp/all.log ____; cat /tmp/all.log'], note: '文件里出现了那句 No such file or directory，而屏幕上干干净净 —— 报错确实被并进文件了' },
          { title: '亲手验证一次顺序写反的后果', about: '看清把合并写在写文件之前会漏掉什么，理解为什么顺序不能反', cmd: 'ls -l /data/backup/nginx.tar.gz 2>&1 > /tmp/wrong.log; echo "文件行数 $(wc -l < /tmp/wrong.log)"', ref: 'sh-redirect', hint: ['顺序反了会怎样？先合并、后写文件，等于"先把 stderr 接到当时的屏幕上，再把 stdout 改到文件里"，文件里只剩 stdout（这里是空的），报错仍在屏幕上。', 'ls -l /data/backup/nginx.tar.gz 2>&1 ____ /tmp/wrong.log; echo "文件行数 $(wc -l < /tmp/wrong.log)"'], note: '文件行数是 0，而报错仍然出现在屏幕上 —— 这就是"顺序写反"的真实后果：你以为两路都收了，其实只收到一半' }
        ],
        answer: 'ls -l /data/backup/nginx.tar.gz > /tmp/all.log 2>&1; cat /tmp/all.log',
        alt: [
          'ls -l /data/backup/nginx.tar.gz > /tmp/alt-all.log 2>&1; cat /tmp/alt-all.log',
          'ls -l /data/backup/nginx.tar.gz 2>&1 | cat'
        ],
        expect: /No such file or directory/,
        teach: '**退出码是脚本的神经系统**：`$?` 只看**紧邻的上一条命令**，0 是成功、非 0 是失败。`&&`（前一条成功才执行后一条）和 `||`（前一条失败才执行后一条）就是它的两个开关。\n\n**注意「非 0 不一定等于出事」**：`grep` 找不到匹配返回 1，这是它正常的表达方式，不是错误。所以判断方式要按意图选——想统计命中次数就用 `grep -c`；想确认「有没有」就用 `grep -q` 配 `&&` / `||`（`-q` 只回答不打印）；**千万不要**简单地把「非 0」一律当成「任务失败」，那会让定时任务天天误告警。\n\n**stderr 和 stdout 是两条独立的通道**：正常结果走 stdout（`>` 收它），报错走 stderr（`2>` 单独收）。四个常用组合要背下来：`> f 2> e` 分开存两份；`> f 2>&1` 两路都进 f；`> /dev/null 2>&1` 两路都丢掉（静默探测）；`2>&1 > f` **是错的**——顺序反了，stderr 去了原来的屏幕、只有 stdout 进文件。\n\n为什么顺序这么重要：`2>&1` 的语义是「把 fd 2 指向 **fd 1 此刻指向的地方**」，它是一次性的复制动作，不是永久的"绑定"。所以 `> f 2>&1` 先让 fd 1 指向 f，再让 fd 2 也指向 f；而 `2>&1 > f` 是先让 fd 2 指向当时的终端，然后把 fd 1 改成 f —— 报错留在屏幕上，文件里空空的。这一点在写日志采集脚本时天天用得到。'
      },

      /* ================= 6 · 管道里的循环（子 shell 陷阱） ================= */
      {
        id: 'sh-pipe-subshell-trap',
        cat: 'shell',
        title: '管道里的 while 数不出数：子 shell 陷阱',
        prompt: '你写了个脚本统计"这次要处理多少台机器"：把清单 grep 一遍接进 while 循环，循环里 `N=$((N+1))` 累加，最后 `echo "共 $N 台"`。脚本跑完，报出来是「共 0 台」——可清单里明明有 5 台。同一段逻辑换成另一种写法又是对的。',
        task: '先复现这个"数出来是 0"的现象，再用两种正确写法各数一遍，最后把数字接进一个判断',
        steps: [
          { title: '先复现：管道里的循环数不到数', about: '先看清"把清单接进管道再循环"时，循环里的累加为什么出不来', cmd: 'N=0; grep -v \'^#\' /opt/scripts/hosts.txt | while read -r h; do N=$((N+1)); done; echo "管道里数到 $N 台"', ref: 'sh-while-until', hint: ['先把这个 bug 亲手复现出来：计数器在循环里明明加了，循环外面读到的却还是初始值。注意循环里那句累加有没有真的执行过。', 'N=0; grep -v \'^#\' /opt/scripts/hosts.txt | while read -r h; do N=$((____)); done; echo "管道里数到 $N 台"'], note: '「数到 0 台」—— 循环确实跑了 5 次，但每次加的都是**另一个** N，父 shell 里那个从来没变' },
          { title: '换成输入重定向：同一个逻辑就有数了', about: '换成"从文件读进来"的写法，确认同样的累加这次能带出循环', cmd: 'N=0; while read -r h; do N=$((N+1)); done < /opt/scripts/hosts.txt; echo "重定向数到 $N 台"', ref: 'sh-read', hint: ['改法只有一处：把"管道喂给它"换成"从文件读进来"。这两种写法在真机上跑起来看着一模一样，但一个在子进程里、一个在当前进程里。', 'N=0; while read -r h; do N=$((N+1)); done ____ /opt/scripts/hosts.txt; echo "重定向数到 $N 台"'], note: '这次是 6 台（清单含注释行）—— 计数器带出来了。差别就在于这次 while 是在当前 shell 里跑的' },
          { title: '先把清单洗干净，再数一遍', about: '滤掉注释行之后重新计数，得到真正要处理的台数', cmd: 'grep -v \'^#\' /opt/scripts/hosts.txt > /tmp/hc2.txt && N=0; while read -r h; do N=$((N+1)); done < /tmp/hc2.txt; echo "干净的清单 $N 台"', ref: 'sh-redirect', hint: ['上一轮把注释行也数进去了。先把清单洗成文件，再对这个文件计数，这个数字才是真正要处理的台数。', 'grep -v \'^#\' /opt/scripts/hosts.txt > /tmp/hc2.txt && N=0; while read -r h; do N=$((N+1)); done < /tmp/hc2.txt; echo "干净的清单 ____ 台"'], note: '5 台 —— 这才是"要连的机器数"，和清单总行数（6）差的那一行就是维护中的那台' },
          { title: '还有第二种正确写法：for 接命令替换', about: '用另一种常见写法数同样的清单，确认两种写法结果一致', cmd: 'N=0; for h in $(grep -v \'^#\' /opt/scripts/hosts.txt); do N=$((N+1)); done; echo "for 列表数到 $N 台"', ref: 'sh-for', hint: ['把命令替换的结果直接当 for 的列表也能数对：for 不经过管道，所以它就在当前 shell 里跑。这种写法更短，但清单里一旦有带空格的字段就会被拆开。', 'N=0; for h in $(grep -v \'^#\' /opt/scripts/hosts.txt); do N=$((____)); done; echo "for 列表数到 $N 台"'], note: '也是 5 台 —— 两种正确写法结果必须一致；不一致就说明清单里有空格之类的脏数据' },
          { title: '把数出来的结果接进一个判断', about: '拿这个台数做一次分支：少就抽查，多就分批', cmd: 'N=0; while read -r h; do N=$((N+1)); done < /tmp/hc2.txt; if [ $N -lt 3 ]; then echo "只有 $N 台，先抽查"; else echo "$N 台，可以分批执行"; fi', ref: 'sh-if', hint: ['数字的用处是参与判断：台数少就直接做、台数多就分批。比较用的是数字比较运算符，跟比较字符串不是一套写法。', 'N=0; while read -r h; do N=$((N+1)); done < /tmp/hc2.txt; if [ $N ____ 3 ]; then echo "只有 $N 台，先抽查"; else echo "$N 台，可以分批执行"; fi'], note: '5 台走了 else 分支 —— `-lt` 是"小于"，数字比较必须用它，不能用 `<`' }
        ],
        answer: 'N=0; while read -r h; do N=$((N+1)); done < /opt/scripts/hosts.txt; echo "重定向数到 $N 台"',
        alt: [
          'N=0; while read -r h; do N=$((N+1)); done < /opt/scripts/hosts.txt; if [ $N -gt 5 ]; then echo "$N 行（含注释）"; fi',
          'echo "共 $(grep -c . /opt/scripts/hosts.txt) 行"'
        ],
        expect: /6/,
        teach: '**管道右边的每一段都在子进程里执行**，这是 shell 里最著名的坑之一。`cat 清单 | while read -r h; do N=$((N+1)); done` 里的 `while` 跑在一个子 shell 中，它有自己的变量副本；循环结束时子 shell 连同里面的 `N` 一起消失，父 shell 看到的 `N` 还是 0。\n\n**两种正确改法**：① 把输入改成重定向 —— `while read -r h; do …; done < 清单`，这样 while 在当前 shell 里跑；② 用进程替换（`done < <(cat 清单)`，本教学终端未实现）或者干脆用 `for h in $(…)`。判断该用哪种很简单：**需要把循环里算出来的变量带出来，就别把循环放在管道右边**。\n\n顺带记住管道的另外两个特性：① 管道的退出码默认是**最后一段**的退出码，前面命令失败会被掩盖，这正是 `set -o pipefail` 存在的理由；② 只有 stdout 进管道，stderr 不进（除非写 `2>&1`）。\n\n最后一个实用结论：**"数一数有多少"优先用专门的工具**，不要自己写循环累加 —— `grep -c` 直接给出行数、`wc -l` 数管道行数、`ls | wc -l` 数文件数，都快得多也不会有子 shell 的坑。只有"循环里还要做别的事、顺带统计一下"时才需要计数器。'
      },

      /* ================= 7 · case 分支 ================= */
      {
        id: 'sh-case-dispatch',
        cat: 'shell',
        title: '同一个脚本服务多个场景：用 case 分派动作',
        prompt: '你要写一个巡检脚本，同一个入口要按"机器角色"决定检查什么：web 机器看连接数、db 机器看主从延迟、缓存机器看内存。用一串 `if ... elif` 能写，但角色一多就变成一堵墙，而且加一个角色就要改三处。',
        task: '先按日志级别做一次最简分派，再把通配模式、多模式分支用起来，最后把它塞进循环里逐台分派',
        steps: [
          { title: '先确认要分派的那个值', about: '看清待分派的值本身长什么样，它是后面所有判断的依据', cmd: 'LEVEL=warn; echo "级别 $LEVEL"', ref: 'sh-var-export', hint: ['分派之前先确认"要分派的值"是什么、长什么样：它可能来自配置、环境变量，也可能来自上一个命令的输出。', 'LEVEL=warn; echo "____ $LEVEL"'], note: 'warn —— 后面所有分支都围着这个值转' },
          { title: '三行搞定三种情况', about: '按值精确匹配走不同分支，并确认没匹配上的会落到兜底分支', cmd: 'LEVEL=warn; case $LEVEL in error) echo "只看错误";; warn) echo "看警告以上";; *) echo "全都看";; esac', ref: 'sh-case', hint: ['这种"一个值、多个固定选项"的分派，用 case 比一串 if 清楚得多：每个分支以右括号开头、以两个分号结束，最后那条星号分支负责兜底。', 'LEVEL=warn; case $LEVEL in error) echo "只看错误";; warn) echo "____";; *) echo "全都看";; esac'], note: '`warn` 命中了第二个分支。`*)` 是兜底分支，相当于"其他所有情况"，放在最后' },
          { title: '用通配符按前缀归类', about: '用模式匹配把一整类名字归到同一个分支', cmd: 'HOST=web-prod-01; case $HOST in web-*) echo "Web 层";; db-*) echo "数据库层";; *) echo "其他";; esac', ref: 'sh-case', hint: ['分支的模式可以是通配符，按命名前缀归类最常用：这样新增一台 web 机器不用改脚本，它会自动落进 Web 那一支。', 'HOST=web-prod-01; case $HOST in web-*) echo "____";; db-*) echo "数据库层";; *) echo "其他";; esac'], note: '`web-*` 匹配上了 —— 分支模式支持通配符，这是 case 比 if 好用最明显的地方' },
          { title: '一个分支接多个模式', about: '把几种应该走同样处理的值合并到同一个分支里', cmd: 'CODE=404; case $CODE in 200|301) echo "正常或跳转";; 4*) echo "客户端错误";; 5*) echo "服务端错误";; esac', ref: 'sh-case', hint: ['几种值要走同样的处理时，用竖线把它们并进同一个分支，别把同一段代码抄三遍。注意这里的竖线不是管道，它是"或者"的意思。', 'CODE=404; case $CODE in 200|301) echo "正常或跳转";; 4*) echo "____";; 5*) echo "服务端错误";; esac'], note: '`404` 命中了 `4*` 这一支；`200|301` 那种写法表示两个模式共用一段处理' },
          { title: '塞进循环：逐台分派角色', about: '对一批主机逐个判断角色，每台输出它属于哪一类', cmd: 'for H in web-prod-01 db-prod-01 cache-prod-01; do case $H in web-*) T=Web;; db-*) T=DB;; *) T=缓存;; esac; echo "$H 属于 $T"; done', ref: 'sh-case', hint: ['真正的用法是把它放进循环：循环负责"对每一台做一遍"，case 负责"这一台该怎么处理"。注意 case 结束时要用 esac 收尾，别把后面的命令吞进分支里。', 'for H in web-prod-01 db-prod-01 cache-prod-01; do case $H in web-*) T=Web;; db-*) T=DB;; *) T=缓存;; esac; echo "$H 属于 ____"; done'], note: '三台各归各类 —— 这就是"一个脚本服务多个场景"的骨架：循环 × 分派' }
        ],
        answer: 'for H in web-prod-01 db-prod-01 cache-prod-01; do case $H in web-*) T=Web;; db-*) T=DB;; *) T=缓存;; esac; echo "$H 属于 $T"; done',
        alt: [
          'for H in web-prod-01 db-prod-01; do case $H in web-*) echo "$H 是 Web";; *) echo "$H 是其他";; esac; done',
          'HOST=web-prod-01; case $HOST in web-*) echo "Web 层";; *) echo "其他";; esac'
        ],
        expect: /Web/,
        teach: '**`case` 是"一个值 → 多个固定选项"的分派结构**，比一串 `if ... elif` 更清楚、也更好扩展（加一个角色只加一行，不用改已有分支）。语法要点：每个分支写成 `模式)` 开头、`;;` 结尾，最后用 `esac` 收尾，`*)` 是兜底分支。\n\n**三个比 if 好用的地方**：① 模式支持**通配符**（`web-*`、`*.log`、`prod-??`），按命名前缀/后缀归类时不用写额外的字符串切割；② 一个分支可以接**多个模式**（`200|301)`），几种值共用一段处理时不抄代码；③ 结构扁平，几十个分支也能一眼扫完。\n\n**三个必须记住的细节**：① 每个分支末尾的 `;;` 不能漏，漏了会把下一个分支的模式当成命令执行；② `esac` 和 `if` 的 `fi` 一样是**成对**的，循环体里写 case 时别把它后面那条命令吞进分支；③ case 匹配的是**模式**不是正则 —— `*` 是通配符、`|` 是"或者"，想在分支里用正则得配合 `[[ =~ ]]`，那是另一套写法。\n\n最后一个工程习惯：**分派的分支要有兜底**。`*)` 那一支打印"未知角色，按默认处理"并留下一条日志，比默默什么都不做安全得多 —— 新增一类机器时你会立刻发现脚本没认出来。'
      }
,

      {
        id: 'sh-first-script',
        cat: 'shell',
        title: '第一个脚本：把一条命令变成"可重复执行的动作"',
        prompt: '你每天都要重复敲同一串命令查日志。**手动敲的问题不是慢，而是会敲错、会漏参数、也没法交给别人执行。** 脚本的第一个价值就是"固定下来"。',
        task: '从变量与 echo 开始，做一个能接收参数、并能自我检查的最小脚本',
        steps: [
          { title: '先看变量怎么用', about: '把值存起来再引用', cmd: 'LOG=/var/log/app.log && echo "$LOG"', ref: 'sh-echo', hint: ['脚本的第一块积木是"变量"：给一个名字赋值，再用 `$名字` 取出来。注意**取值时要加双引号**（下面会讲为什么）', 'LOG=/var/log/app.log && echo "____"'], note: '**赋值时 `=` 两边不能有空格**（有空格就变成"执行一条叫 LOG 的命令"）；取值时用 `$` 前缀' },
          { title: '把多件事串起来', about: '脚本就是命令的集合', cmd: 'echo "开始检查 $(hostname)"', ref: 'sh-echo', hint: ['`$( )` 能把一条命令的输出嵌进字符串 —— 这是"把命令结果写进脚本输出"的标准做法', 'echo "开始检查 ____(hostname)"'], note: '`$(hostname)` 会先执行、再把结果拼进字符串 —— **脚本能"自己知道在哪台机器上跑"，靠的就是它**' },
          { title: '看一眼脚本要处理的文件', about: '先确认对象存在', cmd: 'ls -l /var/log/app.log', ref: 'lb-ls', hint: ['写脚本前先确认要处理的文件真的在、以及权限够不够读 —— 这一步能避免脚本里出现"莫名其妙的失败"', 'ls -l ____'], note: '**先看权限位再动手**：如果属主是别人且没有 `r` 位，脚本里读到它就是空结果，而不是报错' },
          { title: '做一次参数检查', about: '好脚本在输入不对时要说话', cmd: 'test -n "$LOG" && echo "变量已设置"', ref: 'sh-if', hint: ['脚本健壮性的第一课：**执行前检查输入**。有一个专门用于条件判断的命令，`-n` 表示「字符串非空」，非空才继续', '____ -n "$LOG" && echo "变量已设置"'], note: '**`&&` 表示"前面成功才执行后面"** —— 这就是脚本里最常见的"守卫"写法，比 `if` 更紧凑' },
          { title: '把结果落成文件', about: '脚本产出的东西要能留下', cmd: 'echo "检查完成 $(date)" > /tmp/check.log && cat /tmp/check.log', ref: 'sh-echo', hint: ['把输出写进文件（`>` 覆盖、`>>` 追加），再读出来确认 —— **这一步是从"敲命令"到"做工具"的分界**', 'echo "检查完成 $(date)" ____ /tmp/check.log && cat /tmp/check.log'], note: '**`>` 会覆盖原文件内容**（不是追加）—— 写日志要用 `>>`，这个区别造成过很多次事故' }
        ],
        answer: 'echo "开始检查 $(hostname)"',
        alt: [
          'echo "开始检查 $(hostname)"',
          'LOG=/var/log/app.log && echo "$LOG"'
        ],
        expect: /开始检查 \S+|app\.log/,
        teach: '**脚本不是"命令的高级用法"，而是"把一次性的操作固定成可重复、可检查、可交接的东西"。** 最小可用脚本只需四块积木：**变量**（`NAME=值`，取值 `$NAME`）、**命令替换**（`$(命令)` 把输出嵌进字符串）、**判断**（`test`/`[ ]` 配合 `&&`/`||`）、**重定向**（`>` 覆盖、`>>` 追加、`2>` 收错误）。**四条最容易踩的坑，全部来自"看起来很对"**：**① 赋值时 `=` 两边不能有空格** —— `LOG = x` 会被当成"执行 LOG 命令"，而报错信息常常不知所云；**② 取值一定要加双引号** —— 变量为空或含空格时，`rm $FILE` 会变成 `rm`（参数消失）甚至误删别的路径，写成 `rm "$FILE"` 才对；**③ `>` 与 `>>` 的区别** —— 写日志时用错 `>` 会把历史记录清空，且**不报错**；**④ 退出码决定 `&&`/`||` 走哪条分支** —— 而很多命令"失败"时也返回 0（或"成功但有输出"时返回非 0，如 `grep` 没匹配到），所以守卫条件要选对判据。**让脚本从"能用"到"可靠"的三个动作**：**开头写 `set -euo pipefail`**（`-e` 遇错即停、`-u` 用未定义变量报错、`pipefail` 让管道里任一环失败都算失败 —— **不加这三条，脚本会带着错误继续往下跑，产出看似正常的结果**）；**参数做检查并对缺失给用法提示**（`${1:?用法: $0 <日志路径>}` 一行就能做到，缺参数时自动报错退出）；**输出里带上时间与主机名**（出事时能对上时间线，多机环境下更是必需）。**最后一个观念**：**手工敲错的命令只影响一次，脚本里写错的命令会被执行上千次** —— 所以脚本里每一条破坏性命令（`rm`、`>`、`mv`）都值得先写成"只打印不执行"的形态跑一遍，确认范围对了再去掉 `echo`。'
      }

  );
})();
