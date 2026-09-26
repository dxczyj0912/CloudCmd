/* data/shell.js · 分类 06 Shell 脚本编程 */
(function () {
  'use strict';

  var catId = 'shell';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. 变量与引号 ================= */

    /* ---------- 1 / 36 ---------- */
    {
      id: 'sh-var-export',
      name: '变量赋值与 export',
      kind: 'recipe',
      alias: ['export', '环境变量', '变量作用域'],
      level: 1,
      syntax: '变量名=值  # 赋值（等号两边不能有空格）\nexport 变量名=值  # 导出为环境变量',
      summary: '给变量赋值并把需要的变量导出给子进程使用，写脚本的第一步。',
      desc: '**赋值时等号两边绝对不能有空格**：`NAME=value` 是赋值，`NAME = value` 会被 shell 解析成"执行 NAME 命令并传两个参数"，这是初学者最常踩的坑。\n\n**普通变量与导出变量的区别**是理解 Shell 作用域的关键：`NAME=value` 定义的变量只在当前 shell 中可见；`export NAME=value` 定义的变量会进入环境变量表，**被当前 shell 启动的子进程继承**。判断标准很简单：子进程（脚本、命令）能不能读到它。\n\n**几个实用细节**：\n- 变量值包含空格时必须引号包起来：`MSG="hello world"`；\n- 命令结果赋给变量用命令替换：`NOW=$(date +%F)`；\n- 引用变量务必加双引号：`"$NAME"`。**不加引号时值为空会变成"少一个参数"，值是 `*` 还会被展开成文件名列表**，这是脚本 bug 的高频来源；\n- `readonly NAME` 可以定义只读变量，防止被后续代码覆盖；\n- `unset NAME` 删除变量。\n\n**变量名规范**：只用字母、数字、下划线，且不能以数字开头。**不要用全大写的自定义变量名**（如 `PATH`、`HOME`、`LANG` 都是有特殊含义的环境变量，覆盖它们会造成严重后果，例如把 `PATH` 写坏后所有命令都找不到）。',
      params: [
        { flag: 'NAME=value', desc: '赋值，**等号两边不能有空格**' },
        { flag: 'export NAME=value', desc: '定义并导出为环境变量，子进程可见' },
        { flag: 'export -n NAME', desc: '取消导出（变量仍在当前 shell 中）' },
        { flag: 'readonly NAME', desc: '设为只读，后续赋值会报错' },
        { flag: 'unset NAME', desc: '删除变量' },
        { flag: 'declare -r / -i / -a', desc: '声明只读 / 整数 / 数组变量' },
        { flag: 'env / printenv', desc: '查看当前环境变量' }
      ],
      examples: [
        { cmd: 'APP_HOME=/opt/myapp && echo "$APP_HOME"', desc: '普通赋值并引用，注意等号两边没有空格' },
        { cmd: 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk && $JAVA_HOME/bin/java -version', desc: '导出环境变量供子进程使用' },
        { cmd: 'NOW=$(date +%F) && LOG=/var/log/app-$NOW.log && echo "$LOG"', desc: '用命令替换生成带日期的变量' },
        { cmd: 'export PATH="$PATH:/opt/myapp/bin"', desc: '追加 PATH 时必须引用原值，否则会把 PATH 写坏' },
        { cmd: 'declare -r CONFIG=/etc/myapp/app.conf', desc: '定义只读变量，防止后续被误改' },
        { cmd: 'env | grep -E "JAVA_HOME|APP_HOME"', desc: '确认变量是否已导出到环境中' }
      ],
      notes: [
        '**`NAME = value` 有空格是语法错误**，shell 会尝试执行 `NAME` 命令；这是最高频的语法坑',
        '**引用变量一律加双引号 `"$VAR"`**：不加时变量为空会导致参数错位，值含通配符会被展开成文件名',
        '**不要覆盖 PATH、HOME、IFS、LANG 等系统变量**：把 PATH 写坏后连 `ls`、`cp` 都找不到，脚本会全线崩溃',
        '自定义变量用大写是惯例，但要避开系统保留名；脚本内局部用途的变量建议小写加前缀（如 `myapp_tmp`）',
        '子脚本读不到父 shell 的普通变量，**需要传递时必须 `export`**，或用命令行参数/环境变量显式传递',
        '`declare` 在函数内使用时会创建局部变量，等价于 `local`（见 `sh-function`）'
      ],
      related: ['sh-quotes', 'sh-param-default', 'sh-special-vars', 'sh-function'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Shell-Parameters.html',
      tags: ['变量', '环境变量', '作用域', '基础']
    },

    /* ---------- 2 / 36 ---------- */
    {
      id: 'sh-quotes',
      name: '单引号 / 双引号 / 反引号',
      kind: 'recipe',
      alias: ['引号区别', '单引号双引号', '命令替换'],
      level: 2,
      syntax: "'原样输出'  \"允许变量与命令替换\"  `命令替换（已过时）`",
      summary: '三种引号的行为完全不同，用错会导致变量不展开或意外展开。',
      desc: '**单引号（一对单引号）**：完全原样输出，里面的 `$`、反引号、`\\`、`!` 全部失去特殊含义。适合写正则、awk 脚本、包含 `$` 的字面量。\n\n**双引号 `"..."`**：保留 `$`（变量展开）、反引号与 `$(...)`（命令替换）、`\\`（转义）的特殊含义。**日常写脚本一律优先用双引号**，因为它同时做到了"允许变量展开"和"防止单词分割与通配符展开"。\n\n**反引号 `` `...` ``**：命令替换的老写法，等价于 `$(...)`。**新脚本不要再使用**：它不能嵌套（嵌套要反斜杠转义，可读性极差）、内部的反斜杠处理规则反直觉、容易与单引号混淆。统一用 `$(...)`。\n\n**必须用双引号（或单引号）的场景**：变量赋值、命令参数、`[[ ]]` 里的模式之外的所有地方。**不加引号的经典事故**：文件名为 `my file.txt` 时 `rm $FILE` 会删掉两个文件；变量为空时 `rm -rf $DIR/` 会变成 `rm -rf /`。\n\n**特殊字符处理技巧**：字符串里同时含单引号与双引号时，需要用"结束单引号 + 转义单引号 + 重开单引号"的拼接技巧，比较绕，更推荐用 here-document 或把内容写进文件；此外 ANSI-C 引用（美元符号紧跟单引号）支持 `\\n`、`\\t` 等转义序列，按语言环境翻译的字符串则极少用到。',
      params: [
        { flag: "'...'", desc: '单引号：完全原样，不展开变量与命令' },
        { flag: '"..."', desc: '双引号：允许变量、命令替换与反斜杠转义，**日常首选**' },
        { flag: '$(...)', desc: '命令替换的现代写法，可嵌套，**推荐**' },
        { flag: '`...`', desc: '命令替换的老写法，不可嵌套，**已不推荐**' },
        { flag: '$"..."', desc: '按语言环境翻译的字符串，脚本中极少使用' },
        { flag: "$'...'", desc: 'ANSI-C 引用，支持 `\\n`、`\\t`、`\\x41` 等转义序列' }
      ],
      examples: [
        { cmd: 'NAME=world && echo "hello $NAME"', desc: '双引号内变量正常展开' },
        { cmd: 'NAME=world && echo \'hello $NAME\'', desc: '单引号内变量不展开，原样输出 $NAME' },
        { cmd: 'echo "今天是 $(date +%F)，用户是 $(whoami)"', desc: '双引号内嵌套命令替换，推荐写法' },
        { cmd: 'grep -E \'^[0-9]{4}-[0-9]{2}-[0-9]{2}\' /var/log/app.log', desc: '正则表达式用单引号，避免 shell 解释特殊字符' },
        { cmd: 'FILE="my report.txt" && ls -l "$FILE"', desc: '文件名含空格时必须加引号，否则会被拆成两个参数' },
        { cmd: 'MSG=$ \'line1\\nline2\' && printf \'%s\\n\' "$MSG"', desc: '用 $ 单引号写转义字符' }
      ],
      notes: [
        '**不加引号的变量是脚本 bug 的头号来源**：变量为空或含空格/通配符时会展开成意外的参数，**一律写 `"$VAR"`**',
        '**反引号不要再用了**：不能嵌套、转义规则怪异，全部改用 `$(...)`',
        '单引号内部无法直接写单引号，需要用 `\'\\\'\'` 拼接或改用 here-document；这在写含引号的 SQL、JSON 时很常见',
        '双引号内的 `$`、`` ` ``、`\\` 仍特殊，若需要字面量要加反斜杠转义（`\\$`、`` \\` ``、`\\\\`）',
        '`"$@"` 与 `"$*"` 完全不同：前者把每个参数保留为独立单词（**处理参数必须用 `"$@"`**），后者把全部参数合并成一个字符串',
        '`$` 后面紧跟字母才会被当作变量名；`$1`、`$@`、`$?` 这类位置与特殊参数不受影响',
        '写 SQL 或 JSON 字符串时，单双引号混用很容易出错，建议用 here-document（`<<\'EOF\'`）避免转义地狱'
      ],
      related: ['sh-var-export', 'sh-heredoc', 'sh-special-vars', 'sh-pipe-cmdsub'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Quoting.html',
      tags: ['引号', '转义', '命令替换', '语法']
    },

    /* ---------- 3 / 36 ---------- */
    {
      id: 'sh-param-default',
      name: '${var:-默认值} 系列',
      kind: 'recipe',
      alias: ['参数默认值', '${VAR:=}', '${VAR:?}', '参数展开'],
      level: 3,
      syntax: '${var:-默认} | ${var:=默认} | ${var:?错误信息} | ${var:+替代值}',
      summary: '在变量为空或未定义时提供默认值、报错退出或替换内容。',
      desc: '这四个展开式是 Shell 脚本健壮性的基石，**记住"冒号代表也处理空值"这个规律**，去掉冒号则只判断"未定义"：\n\n- **`${var:-默认}`**：变量未定义或为空时用默认值，**但不修改变量本身**。最常用，适合"配置文件没写就用默认值"；\n- **`${var:=默认}`**：同上，但会**把默认值赋给变量**。适合"初始化一次后续都用它"；\n- **`${var:?错误信息}`**：变量未定义或为空时打印错误信息并**退出脚本**（非交互式 shell 退出码 1）。这是**参数校验的最佳实践**，比手写 `if [ -z ... ]` 简洁得多；\n- **`${var:+替代值}`**：变量**有值**时才用替代值，常用来做条件判断，如 `${DEBUG:+--verbose}` 表示"DEBUG 有值就加 --verbose"。\n\n**去掉冒号的版本**（`${var-默认}`、`${var=默认}`、`${var?错误}`）只判断"未定义"，**变量为空字符串时不生效**。日常几乎总是用带冒号的版本。\n\n**在脚本中的典型用法**：脚本开头做参数检查，如 `: "${BACKUP_DIR:?请设置 BACKUP_DIR 环境变量}"`，这一行就能替代一大段 if 判断；配置读取时用 `TIMEOUT=${TIMEOUT:-30}` 给默认值。\n\n还有一批相关展开：`${var:2:5}` 取子串、`${#var}` 取长度、`${var^^}`/`${var,,}` 大小写转换——注意 Bash 4 才支持大小写转换，`#!/bin/sh`（dash）下不可用。',
      params: [
        { flag: '${var:-默认}', desc: '未定义或为空时用默认值，**不修改变量**' },
        { flag: '${var:=默认}', desc: '未定义或为空时用默认值并**赋值给变量**' },
        { flag: '${var:?错误信息}', desc: '未定义或为空时报错退出，**参数校验首选**' },
        { flag: '${var:+替代值}', desc: '变量有值时用替代值，常用于条件添加参数' },
        { flag: '${#var}', desc: '取字符串长度' },
        { flag: '${var:2:5}', desc: '从第 3 个字符起取 5 个字符（子串）' },
        { flag: '${var^^} / ${var,,}', desc: '转大写 / 转小写（Bash 4+）' }
      ],
      examples: [
        { cmd: 'TIMEOUT=${TIMEOUT:-30} && echo "超时设置为 $TIMEOUT 秒"', desc: '未设置时使用默认值，配置脚本的常见写法' },
        { cmd: ': "${BACKUP_DIR:?用法: backup.sh 需要先设置 BACKUP_DIR 环境变量}"', desc: '参数校验：未设置直接报错退出，比 if 判断更简洁' },
        { cmd: 'DEBUG=1 && CMD="curl -s ${DEBUG:+--verbose} http://10.0.1.23/health" && echo "$CMD"', desc: '有值时追加参数，用于按开关调整命令行' },
        { cmd: 'COUNT=${COUNT:=10} && echo "$COUNT"', desc: '未设置则赋值并继续使用' },
        { cmd: 'LOG=/var/log/app-20240318.log && echo "文件名长度 ${#LOG}"', desc: '取字符串长度' },
        { cmd: 'DATE=20240318 && echo "${DATE:0:4}-${DATE:4:2}-${DATE:6:2}"', desc: '用子串展开格式化日期字符串' }
      ],
      notes: [
        '**冒号 `:` 表示"还要处理空字符串"**：`${var:-默认}` 在变量为空串时也生效，`${var-默认}` 则不生效；日常几乎总是要带冒号',
        '**`${var:?错误}` 会让脚本直接退出**，在函数里使用会退出整个脚本（不是只退出函数），交互式 shell 下则是返回上一级',
        '`${var:=默认}` 有副作用（修改变量），在只读变量上使用会报错',
        '**大小写转换 `${var^^}` 是 Bash 4+ 特性**：macOS 自带的 Bash 3.2 与 `sh`（dash）都不支持，跨平台脚本要避免或做兼容判断',
        '默认值里如果含有 `$` 或空格，也要加引号：`${MSG:-"hello world"}` 实际应写成 `"${MSG:-hello world}"`',
        '这些展开是**纯字符串操作**，不做数值计算；数值运算要用 `$(( ))`'
      ],
      related: ['sh-special-vars', 'sh-string-ops', 'sh-shift', 'sh-set-euo-pipefail'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Shell-Parameter-Expansion.html',
      tags: ['参数展开', '默认值', '参数校验', '健壮性']
    },

    /* ---------- 4 / 36 ---------- */
    {
      id: 'sh-string-ops',
      name: '${var#} / ${var%} / ${var//}',
      alias: ['字符串截取', '${var%%.*}', '字符串替换'],
      level: 3,
      syntax: '${var#模式} ${var##模式} ${var%模式} ${var%%模式} ${var/旧/新} ${var//旧/新}',
      summary: '不调用外部命令就能去掉路径前缀后缀、替换字符串，效率极高。',
      desc: '这组展开是**纯 Shell 内置操作**，不启动任何子进程，在循环里处理几万次比 `sed`/`basename` 快几个数量级。\n\n**去掉前缀（`#`）与后缀（`%`）**，记忆口诀：**`#` 在键盘上位于 `$` 左边（前面），`%` 位于右边（后面）**；单符号是最短匹配，双符号是最长匹配：\n- `${path#*/}`：从开头删到**第一个** `/`，`/a/b/c` → `a/b/c`；\n- `${path##*/}`：从开头删到**最后一个** `/`，`/a/b/c` → `c`（等价于 `basename`）；\n- `${file%.*}`：从**最后一个** `.` 起删到结尾，`app.log.1` → `app.log`；\n- `${file%%.*}`：从**第一个** `.` 起删到结尾，`app.log.1` → `app`；\n- `${file##*.}`：取最后一段扩展名，`app.tar.gz` → `gz`。\n\n**替换（`/`）**：`${var/旧/新}` 只替换**第一处**，`${var//旧/新}` 替换**全部**；`${var/#旧/新}` 只匹配开头，`${var/%旧/新}` 只匹配结尾。\n\n**两个高频实战场景**：① 处理文件名——给定 `/data/backup/app-20240318.tar.gz`，用 `${f##*/}` 取文件名、`${f%.tar.gz}` 去掉后缀、`${f##*.}` 取扩展名，全部零开销；② 处理配置字符串——把逗号分隔的列表用 `${list//,/ }` 一次转成空格分隔。\n\n**注意**：模式匹配用的是 glob 通配符（`*`、`?`、`[...]`），**不是正则表达式**。要正则请用 `sed`、`awk` 或 Bash 的 `=~`。',
      params: [
        { flag: '${var#模式}', desc: '从开头删除最短匹配（`#` 在前）' },
        { flag: '${var##模式}', desc: '从开头删除最长匹配，`${var##*/}` 等价于 `basename`' },
        { flag: '${var%模式}', desc: '从结尾删除最短匹配，`${var%.*}` 去扩展名' },
        { flag: '${var%%模式}', desc: '从结尾删除最长匹配，`${var%%.*}` 只留第一段' },
        { flag: '${var/旧/新}', desc: '替换第一处匹配' },
        { flag: '${var//旧/新}', desc: '替换全部匹配' },
        { flag: '${var/#旧/新} / ${var/%旧/新}', desc: '只匹配开头 / 只匹配结尾' }
      ],
      examples: [
        { cmd: 'f=/data/backup/app-20240318.tar.gz && echo "${f##*/}"', desc: '取文件名（等价 basename，零开销）' },
        { cmd: 'f=/data/backup/app-20240318.tar.gz && echo "${f%%.*}"', desc: '从第一个点截断，得到 app-20240318' },
        { cmd: 'f=/data/backup/app-20240318.tar.gz && echo "${f%.tar.gz}"', desc: '精确去掉指定后缀' },
        { cmd: 'LIST="nginx,mysql,redis" && echo "${LIST//,/ }"', desc: '把逗号分隔列表转成空格分隔' },
        { cmd: 'V=1.2.3 && echo "${V//./-}"', desc: '把版本号里的点全部换成短横线' },
        { cmd: 'for f in /var/log/*.log; do echo "处理 ${f##*/}"; done', desc: '循环中零开销取文件名，比 basename 快得多' }
      ],
      notes: [
        '**模式是 glob 通配符不是正则**：`${var#*.}` 里的 `.` 就是普通字符，`*` 才代表任意字符',
        '**单符号最短、双符号最长**，这是最容易记混的地方：`${f#*/}` 与 `${f##*/}` 结果可能完全不同',
        '变量未定义时展开为空字符串，**不会报错**；要严格校验请配合 `${var:?}` 或先判空',
        '**替换操作不会修改原变量**，要用 `var=${var//a/b}` 的形式回写',
        '处理含空格的文件名时整个展开式要加双引号：`"${f##*/}"`',
        '`#!/bin/sh`（dash）下这组展开同样可用，但 `${var^^}` 之类的 Bash 4 扩展不可用，跨 shell 脚本要注意'
      ],
      related: ['sh-param-default', 'sh-quotes', 'sh-for', 'lt-sed'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Shell-Parameter-Expansion.html',
      tags: ['字符串处理', '路径截取', '替换', '零开销']
    },

    /* ---------- 5 / 36 ---------- */
    {
      id: 'sh-array',
      name: '数组与关联数组',
      kind: 'recipe',
      alias: ['bash 数组', '关联数组', 'declare -A'],
      level: 3,
      syntax: 'arr=(a b c) | ${arr[@]} | ${#arr[@]} | declare -A map; map[key]=value',
      summary: '用索引数组存列表、关联数组存键值对，替代逗号拼接字符串。',
      desc: '**索引数组**（Bash 默认）：`arr=(a b c)` 定义，下标从 0 开始。四种高频用法：\n- `${arr[@]}`：所有元素（**必须加双引号写成 `"${arr[@]}"`**，才能保留每个元素的独立性与空格）；\n- `${#arr[@]}`：元素个数；\n- `${arr[0]}`：第一个元素；\n- `"${arr[@]:1:2}"`：切片（从下标 1 起取 2 个）。\n\n**追加元素**用 `arr+=(d e)`，**删除元素**用 `unset \'arr[1]\'`（注意删除后下标不连续，遍历时不要用 `for ((i=0;i<${#arr[@]};i++))`）。\n\n**关联数组**（Bash 4+）必须先声明：`declare -A map`，然后 `map[key]=value`。遍历键用 `"${!map[@]}"`，遍历值用 `"${map[@]}"`。它是脚本里替代"用变量名拼字符串"（如 `var_$key`）的正确工具。\n\n**为什么数组比字符串拼接好**：命令参数含空格时，`CMD="ls -l $FILE"` 再 `$CMD` 执行会因为分词而出错，而用数组 `CMD=(ls -l "$FILE")` 加 `"${CMD[@]}"` 执行则完全安全。**"把参数存数组，用 `"${CMD[@]}"` 执行"是写健壮脚本的关键技巧**。\n\n`#!/bin/sh`（dash）**不支持数组**，需要数组就必须用 `#!/bin/bash` 并在脚本里明确声明。',
      params: [
        { flag: 'arr=(a b c)', desc: '定义索引数组，元素用空格分隔' },
        { flag: '"${arr[@]}"', desc: '展开全部元素，**双引号必加**，否则含空格的元素会被拆分' },
        { flag: '${#arr[@]}', desc: '数组长度（元素个数）' },
        { flag: 'arr+=(d)', desc: '追加元素' },
        { flag: '"${!arr[@]}"', desc: '取所有下标（关联数组里就是所有键）' },
        { flag: 'declare -A map', desc: '声明关联数组（Bash 4+），必须先声明才能用字符串键' },
        { flag: 'unset \'arr[1]\'', desc: '删除指定下标的元素（**下标会留下空洞**）' }
      ],
      examples: [
        { cmd: 'HOSTS=(10.0.1.21 10.0.1.22 10.0.1.23) && for h in "${HOSTS[@]}"; do echo "检查 $h"; done', desc: '定义数组并遍历，处理多主机列表的标准写法' },
        { cmd: 'HOSTS=(10.0.1.21 10.0.1.22) && echo "共 ${#HOSTS[@]} 台"', desc: '取数组长度' },
        { cmd: 'declare -A PORT && PORT[web]=80 && PORT[db]=3306 && for k in "${!PORT[@]}"; do echo "$k -> ${PORT[$k]}"; done', desc: '关联数组存键值对并遍历' },
        { cmd: 'ARGS=(curl -s -H "X-Token: abc123" http://10.0.1.23/health) && "${ARGS[@]}"', desc: '把含空格的参数放数组里执行，避免分词问题' },
        { cmd: 'FILES=(/var/log/a.log /var/log/b.log) && FILES+=(/var/log/c.log) && echo "${FILES[@]}"', desc: '追加元素' },
        { cmd: 'LIST=("a b" c) && printf "[%s]\\n" "${LIST[@]}"', desc: '验证双引号能保留含空格元素，不加引号则会拆成 a 和 b' }
      ],
      notes: [
        '**`"${arr[@]}"` 的双引号不能省**：不加引号时含空格的元素会被拆成多个单词，这是数组最常见的误用',
        '**`${arr[*]}` 与 `${arr[@]}` 不同**：前者把所有元素合并成一个字符串（用 IFS 首字符连接），遍历时几乎总是该用后者',
        '**`#!/bin/sh`（dash）不支持数组**，用数组必须写 `#!/bin/bash`；Ubuntu 上 `/bin/sh` 是 dash，这一点经常引发"脚本在服务器上跑不通"',
        '**关联数组需要 Bash 4+**：macOS 自带的 Bash 3.2 不支持，会报 `declare: -A: invalid option`',
        '删除中间元素后下标不连续，`${#arr[@]}` 仍是剩余个数但最大下标没变，遍历请用 `"${arr[@]}"` 而不是数字下标',
        '数组元素里含 glob 字符时记得加引号，否则展开时会被当文件名匹配',
        '定义数组时元素之间**用空格分隔，不要用逗号**（`(a,b,c)` 是一个元素 `a,b,c`）'
      ],
      related: ['sh-for', 'sh-quotes', 'sh-var-export', 'sh-case'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Arrays.html',
      tags: ['数组', '关联数组', '参数传递', 'Bash']
    },

    /* ---------- 6 / 36 ---------- */
    {
      id: 'sh-special-vars',
      name: '$? / $# / $@ / $* / $$',
      alias: ['特殊变量', '位置参数', '脚本退出码'],
      level: 2,
      syntax: '$? 上条命令退出码 | $# 参数个数 | $@ / $* 参数列表 | $$ 当前 PID | $0 脚本名',
      summary: '一批只读特殊变量，用于取参数、判断上条命令成败与当前进程号。',
      desc: '**`$?`**：上一条命令的退出码，**0 表示成功，非 0 表示失败**。使用要点是"**必须紧跟在命令之后立即取值**"——中间插一条 `echo` 就会把 `$?` 覆盖成 echo 的退出码，这是高频 bug。\n\n**`$#`**：参数个数，配合 `[ $# -lt 2 ]` 做参数数量校验。\n\n**`$@` 与 `$*` 的区别**（传参时必须搞清楚）：\n- `"$@"`：每个参数保持独立，**转发参数一律用它**；\n- `"$*"`：所有参数合并成一个字符串，用空格（IFS 首字符）连接，适合打印全部参数；\n- 不加引号时两者行为几乎一样（都会被分词），**因此要加引号**。\n\n**`$$`**：当前 shell 的 PID，最常用于生成锁文件与临时文件名（`/tmp/myscript.$$`）——**但要意识到 PID 会复用**，安全性要求高的场景请用 `mktemp`。**`$!`** 是最近一个后台进程的 PID，配合 `wait` 使用。\n\n**`$0`**：脚本名（含调用路径），用于打印用法提示。**`$1`~`$9`** 是位置参数，超过 9 个要写 `${10}`。**`$_`** 是上一条命令的最后一个参数。**`$LINENO`** 是当前行号，报错信息里带上它很有用。',
      params: [
        { flag: '$?', desc: '上条命令退出码，0 成功；**必须紧跟命令取值**' },
        { flag: '$#', desc: '位置参数个数，用于参数数量校验' },
        { flag: '"$@"', desc: '所有参数，每个保持独立，**转发参数必须用它**' },
        { flag: '"$*"', desc: '所有参数合并成一个字符串，适合打印' },
        { flag: '$$', desc: '当前 shell 的 PID，常用于临时文件与锁文件命名' },
        { flag: '$!', desc: '最近一个后台进程的 PID，配合 `wait` 使用' },
        { flag: '$0', desc: '脚本名（含路径），用于打印用法信息' },
        { flag: '$1..$9 / ${10}', desc: '位置参数，第 10 个起必须用花括号' }
      ],
      examples: [
        { cmd: 'systemctl is-active nginx >/dev/null 2>&1; echo "退出码: $?"', desc: '判断服务是否运行，0 表示运行中' },
        { cmd: 'if [ $# -lt 2 ]; then echo "用法: $0 <源目录> <目标目录>"; exit 1; fi', desc: '参数数量校验的标准写法' },
        { cmd: 'for arg in "$@"; do echo "参数: $arg"; done', desc: '遍历所有参数，保留含空格参数的完整性' },
        { cmd: 'echo "参数个数 $#，全部参数: $*"', desc: '打印参数数量与合并后的参数列表' },
        { cmd: 'TMPFILE=/tmp/myapp.$$.tmp && echo "$TMPFILE" > "$TMPFILE"', desc: '用 PID 生成临时文件名（安全性要求高请改用 mktemp）' },
        { cmd: 'sleep 30 & BG=$! && echo "后台进程 PID: $BG" && wait $BG', desc: '配合 $! 与 wait 等待后台任务完成' }
      ],
      notes: [
        '**`$?` 只反映紧邻的上一条命令**：中间插入任何命令（包括 `echo`）都会覆盖它，要先用变量存下来：`rc=$?`',
        '**转发参数一律写 `"$@"`**：写成 `$@` 或 `"$*"` 会在参数含空格时出错，这是包装脚本最常见的 bug',
        '**`$10` 是 `$1` 后面跟一个 `0`，不是第 10 个参数**，必须写 `${10}`',
        '`$$` 在子 shell 中保持不变（`(echo $$)` 与父进程相同），要获取子 shell 自己的 PID 用 `$BASHPID`',
        'PID 会被系统复用，**用 `$$` 做锁文件在高并发下不可靠**，请使用 `flock` 或 `mktemp`',
        '`$?` 在 `if` / `while` / `&&` / `||` 的条件位置里被隐式使用，条件判断内不要再引用它',
        '管道（`cmd1 | cmd2`）的 `$?` 默认是**最后一个命令**的退出码，要看整条管道是否出错必须开 `set -o pipefail`'
      ],
      related: ['sh-shift', 'sh-set-euo-pipefail', 'sh-getopts', 'sh-wait'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Special-Parameters.html',
      tags: ['特殊变量', '退出码', '位置参数', '基础']
    },

    /* ================= B. 流程控制 ================= */

    /* ---------- 7 / 36 ---------- */
    {
      id: 'sh-if',
      name: 'if / elif / else',
      alias: ['条件判断', 'if 语句', 'if else fi'],
      level: 1,
      syntax: 'if <命令>; then ...; elif <命令>; then ...; else ...; fi',
      summary: '按条件分支执行代码，Shell 里所有流程控制的起点。',
      desc: '**关键认知：`if` 判断的是"命令的退出码"，不是"真假值"**。退出码 0 走 `then`，非 0 走 `else`。所以 `if grep -q foo file; then` 是完全合法的写法——把命令当条件用是 Shell 的特色，比 `[ $(grep ...) ]` 更简洁也更安全。\n\n**语法要点**：`then` 与 `if` 在同一行时必须用 `;` 分隔（`if [ ... ]; then`）；`fi` 是 `if` 的反写，不能漏；`elif` 可以有多层。\n\n**常见条件写法**：\n- `if [ "$a" = "$b" ]; then`：字符串比较（**变量要加引号**）；\n- `if [ $# -lt 2 ]; then`：数值比较用 `-lt`（不能用 `<`，`<` 在 `[ ]` 里是重定向符）；\n- `if [ -f /etc/nginx/nginx.conf ]; then`：文件存在性判断；\n- `if command -v docker >/dev/null 2>&1; then`：判断命令是否可用（比 `which` 更可移植）；\n- `if [ -z "${VAR:-}" ]; then`：判断变量是否为空。\n\n**嵌套与简洁写法**：简单赋值可用 `VAR=${1:-default}` 代替 if（见 `sh-param-default`）；简单二选一可用 `[ 条件 ] && 成功动作 || 失败动作`，但要注意**如果成功动作本身失败，`||` 分支也会执行**，逻辑复杂时仍应写完整的 if。\n\n**风格建议**：脚本里尽量"早失败、早退出"——参数校验不通过就直接 `exit 1`，避免层层嵌套导致可读性变差。',
      params: [
        { flag: 'if <命令>; then', desc: '命令退出码为 0 时执行 then 分支' },
        { flag: 'elif <命令>; then', desc: '多分支，可重复出现' },
        { flag: 'else', desc: '所有条件都不成立时执行' },
        { flag: 'fi', desc: '结束 if 语句（**不能漏**）' },
        { flag: '[ ... ] / [[ ... ]]', desc: '条件表达式，区别见 `sh-test`' },
        { flag: 'command -v <命令>', desc: '判断命令是否存在，比 which 更可移植' },
        { flag: '-q', desc: 'grep 的静默参数，只返回退出码不输出内容，配合 if 使用' }
      ],
      examples: [
        { cmd: 'if [ ! -f /etc/nginx/nginx.conf ]; then echo "配置文件缺失"; exit 1; fi', desc: '文件存在性判断，缺失则退出' },
        { cmd: 'if command -v docker >/dev/null 2>&1; then echo "docker 已安装"; else echo "需要先安装 docker"; fi', desc: '判断命令是否可用，配置脚本常用' },
        { cmd: 'if [ $# -lt 2 ]; then echo "用法: $0 <源目录> <目标目录>"; exit 1; elif [ ! -d "$1" ]; then echo "源目录不存在: $1"; exit 1; fi', desc: '多分支参数校验：数量与目录有效性' },
        { cmd: 'if grep -q "ERROR" /var/log/app.log; then echo "发现错误日志"; fi', desc: '把命令直接当条件，利用退出码判断' },
        { cmd: 'if systemctl is-active --quiet nginx; then echo "nginx 运行中"; else systemctl restart nginx; fi', desc: '服务健康检查与自动重启的最小骨架' },
        { cmd: 'if [ "$(id -u)" -ne 0 ]; then echo "请用 root 运行"; exit 1; fi', desc: '判断当前是否为 root，需要权限的脚本开头必写' }
      ],
      notes: [
        '**`if` 判断的是退出码，不是布尔值**：0 为真、非 0 为假，这一点与大多数编程语言相反，务必记牢',
        '**`then` 与条件在同一行时必须加分号**：`if [ -f a ]; then` 正确，`if [ -f a ] then` 会报语法错误',
        '**`[` 是命令不是语法符号**：`[` 后面与 `]` 前面必须有空格，写成 `[ -f a]` 会报 `[: missing ]`',
        '**`[ ]` 内的变量必须加双引号**：变量为空时 `[ -n $var ]` 会变成 `[ -n ]` 从而判断错误；用 `[[ ]]` 可以避免这个问题',
        '**不要用 `<` 做数值比较**：在 `[ ]` 里 `<` 是重定向符，数值比较请用 `-lt`、`-gt`，或用 `(( a < b ))`',
        '`&&` 与 `||` 在 `[ ]` 里不可用（那是 `[[ ]]` 的特性），`[ ]` 内必须用 `-a`、`-o`（已不推荐，可读性差）',
        '条件里执行了耗时命令（如网络探测）时要评估失败场景，避免脚本卡住；必要时配合 `timeout`'
      ],
      related: ['sh-test', 'sh-case', 'sh-special-vars', 'sh-set-euo-pipefail'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Conditional-Constructs.html',
      tags: ['条件判断', '分支', '语法', '基础']
    },

    /* ---------- 8 / 36 ---------- */
    {
      id: 'sh-test',
      name: 'test / [ ] / [[ ]] 的区别',
      kind: 'recipe',
      alias: ['test', '[[ ]]', '[ ]', '条件表达式'],
      level: 3,
      syntax: 'test <表达式> | [ <表达式> ] | [[ <表达式> ]] | (( <算术表达式> ))',
      summary: '三种条件判断形式差异很大，选错会导致脚本在边界值上出错。',
      desc: '**三者的本质区别**：\n- **`test` 与 `[`** 是**普通命令**（`[` 就是 `test` 的别名，只是要求最后一个参数是 `]`）。既然是命令，参数就会经过 shell 的分词与通配符展开，所以变量**必须加引号**，且不支持 `&&`、`||`、`=~`；\n- **`[[ ]]`** 是 **Bash 的关键字**，不经过分词，因此 `[[ -n $var ]]` 在变量为空时也安全；支持 `&&`、`||`、`=~`（正则）、`==`（glob 模式匹配）；\n- **`(( ))`** 专门做**算术运算与比较**，内部用 `>`、`<`、`==` 等数学符号，不需要 `$`，如 `(( count > 10 ))`。\n\n**为什么推荐 `[[ ]]`**：三个实打实的好处——① 不用为每个变量加引号（更不容易出错）；② 支持 `&&`/`||` 组合条件，不必嵌套多个 `[ ]`；③ 支持正则与模式匹配：`[[ $file == *.log ]]`（glob 模式）与 `[[ $ip =~ ^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$ ]]`（正则）。\n\n**代价是可移植性**：`[[ ]]` 与 `(( ))` 都是 Bash/Ksh 扩展，**POSIX sh（dash、busybox sh）不支持**。脚本第一行写 `#!/bin/sh` 时不能用，必须写 `#!/bin/bash`。容器基础镜像（Alpine）默认是 busybox ash，这一点尤其要注意。\n\n**常用判断运算符速查**：\n- 数值：`-eq -ne -lt -le -gt -ge`；\n- 字符串：`=`（POSIX）/ `==`（Bash）、`!=`、`-z`（空）、`-n`（非空）；\n- 文件：`-e`（存在）、`-f`（普通文件）、`-d`（目录）、`-s`（非空文件）、`-r/-w/-x`（权限）、`-L`（软链接）、`-nt/-ot`（新旧比较）。\n\n**`[ ]` 里最经典的坑**：`[ $var = "x" ]` 在 `var` 为空时变成 `[ = x ]`，报 `unary operator expected`；而 `[[ $var = "x" ]]` 完全没问题——这就是"边界值才暴露"的 bug，测试时容易漏。',
      params: [
        { flag: 'test <表达式>', desc: 'POSIX 命令形式，与 `[ ]` 等价' },
        { flag: '[ <表达式> ]', desc: '命令形式，**空格与引号一个都不能少**' },
        { flag: '[[ <表达式> ]]', desc: 'Bash 关键字：不分词、支持 &&/||/=~，**推荐**' },
        { flag: '(( <算术表达式> ))', desc: '整数运算与比较，内部用 >、<、== 等符号' },
        { flag: '-z / -n', desc: '字符串为空 / 非空' },
        { flag: '-e -f -d -s -L', desc: '文件存在 / 普通文件 / 目录 / 非空 / 软链接' },
        { flag: '=~', desc: '正则匹配，**仅 `[[ ]]` 支持**' },
        { flag: '==', desc: '在 `[[ ]]` 里是 glob 模式匹配，如 `[[ $f == *.log ]]`' }
      ],
      examples: [
        { cmd: 'if [[ -f /etc/nginx/nginx.conf && -r /etc/nginx/nginx.conf ]]; then echo "配置可读"; fi', desc: '组合条件用 &&，`[ ]` 无法这样写' },
        { cmd: 'if [[ "$FILE" == *.log ]]; then echo "这是日志文件"; fi', desc: 'glob 模式匹配，仅在 `[[ ]]` 中可用' },
        { cmd: 'if [[ "$IP" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then echo "IPv4 格式正确"; fi', desc: '正则校验，`[ ]` 做不到' },
        { cmd: 'count=15 && if (( count > 10 )); then echo "超过阈值"; fi', desc: '算术比较，用数学符号更直观' },
        { cmd: 'if [ -z "${NAME:-}" ]; then echo "NAME 未设置"; fi', desc: '`[ ]` 里判断变量为空必须加引号并用默认值兜底' },
        { cmd: 'var= && if [ -n $var ]; then echo yes; else echo no; fi', desc: '反面示例：不加引号在变量为空时会报 unary operator expected' }
      ],
      notes: [
        '**`[` 前后必须有空格**：`[ -f a]` 会报 `missing ]`，`[-f a]` 会报 `command not found`',
        '**`[ ]` 内的变量必须加双引号**，否则变量为空或含空格时会报错或判断错误；用 `[[ ]]` 可以规避',
        '**`[[ ]]` 与 `(( ))` 不是 POSIX 标准**：`#!/bin/sh`（dash、busybox ash）不支持，用它们必须写 `#!/bin/bash`',
        '**`[[ ]]` 里 `==` 是模式匹配不是纯字符串比较**：`[[ $a == $b ]]` 中的 `$b` 会被当模式；要字面比较请把右侧加引号 `[[ $a == "$b" ]]`',
        '**`(( ))` 里不要写 `$`**：`(( $count > 10 ))` 虽然能跑但不规范，写 `(( count > 10 ))` 更清晰',
        '**`(( ))` 的退出码是"表达式是否为 0 之外的值"**：`(( count ))` 在 count 为 0 时返回假，这个语义在条件里要留意',
        '**软链接判断用 `-L` 而不是 `-f`**：`-f` 会跟随链接，链接目标不存在时返回假，容易误判',
        '数值比较千万不要用 `=`（那是字符串比较）：`[ "01" = "1" ]` 为假，但 `[ "01" -eq 1 ]` 为真'
      ],
      related: ['sh-if', 'sh-case', 'sh-param-default', 'sh-set-euo-pipefail'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Bash-Conditional-Expressions.html',
      tags: ['条件表达式', '中括号', '正则', '可移植性']
    },

    /* ---------- 9 / 36 ---------- */
    {
      id: 'sh-case',
      name: 'case',
      alias: ['case 语句', '模式匹配分支', 'case esac'],
      level: 2,
      syntax: 'case <值> in\n  模式1) 命令 ;; \n  模式2|模式3) 命令 ;;\n  *) 默认命令 ;;\nesac',
      summary: '按模式匹配做多分支选择，比多层 if 更清晰，尤其适合解析参数。',
      desc: '`case` 用 **glob 模式**（不是正则）匹配一个字符串，命中第一个匹配的分支后执行并结束。相比多层 `elif`，它把"值 vs 模式"对齐成表格，可读性明显更好。\n\n**语法要点**：每个分支以 `)` 开始、以 `;;` 结束（**漏掉 `;;` 会导致语法错误**），`*)` 是默认分支（相当于 else），整体以 `esac` 结束（case 的反写）。\n\n**模式写法**：支持 glob 通配符——`*.log`、`start|stop|restart`（多值用 `|`）、`[Yy]*`（字符集）。**注意模式是 glob，`?` 表示任意单字符、`*` 表示任意字符串，不是正则的 `.*`**。\n\n**最典型的两个用途**：\n① **服务控制脚本**：`case "$1" in start) ... ;; stop) ... ;; restart) ... ;; *) echo "用法: $0 {start|stop|restart}"; exit 1 ;; esac`，这是 SysV 初始化脚本的标准结构；\n② **按扩展名/类型分派处理**：`case "$file" in *.tar.gz) tar -xzf ... ;; *.zip) unzip ... ;; *.gz) gunzip ... ;; esac`。\n\n**小技巧**：可以在模式里用变量（`case "$x" in $PATTERN)`），也可以用 `;&`（fall through，继续执行下一分支）与 `;;&`（继续测试后续模式），这两个是 Bash 4+ 扩展，`#!/bin/sh` 下不可用。',
      params: [
        { flag: 'case <值> in', desc: '开始匹配，值是待判断的字符串' },
        { flag: '模式)', desc: '分支开始，模式支持 glob 通配符与 `|` 多值' },
        { flag: ';;', desc: '分支结束（**必写，漏掉就是语法错误**）' },
        { flag: '*)', desc: '默认分支，相当于 else，建议总是写上' },
        { flag: 'esac', desc: '结束 case 语句' },
        { flag: ';& / ;;&', desc: 'Bash 4+ 扩展：继续执行下一分支 / 继续测试后续模式' }
      ],
      examples: [
        { cmd: 'case "$1" in start) systemctl start nginx ;; stop) systemctl stop nginx ;; restart) systemctl restart nginx ;; *) echo "用法: $0 {start|stop|restart}"; exit 1 ;; esac', desc: '服务控制脚本的标准结构' },
        { cmd: 'case "$file" in *.tar.gz) tar -xzf "$file" ;; *.zip) unzip -q "$file" ;; *.gz) gunzip "$file" ;; *) echo "不支持的格式: $file" ;; esac', desc: '按扩展名分派解压方式' },
        { cmd: 'case "$(uname -s)" in Linux) pkg=dnf ;; Darwin) pkg=brew ;; *) pkg=unknown ;; esac && echo "包管理器: $pkg"', desc: '按操作系统选择不同命令，跨平台脚本常用' },
        { cmd: 'read -r -p "确认删除? [y/N] " ans; case "$ans" in [Yy]|[Yy][Ee][Ss]) echo "执行删除" ;; *) echo "已取消" ;; esac', desc: '交互式确认，只有 y/yes 才继续' }
      ],
      notes: [
        '**每个分支末尾必须有 `;;`**：漏写会导致后续分支被当成同一分支的代码，报语法错误或行为异常',
        '**`case` 用 glob 模式不是正则**：`*.log` 有效，`.*\\.log$` 无效；要正则请用 `[[ =~ ]]` 或 `grep`',
        '**一定要写 `*)` 默认分支**：否则传入意料之外的参数时脚本会静默什么都不做，排查困难',
        '模式里的 `$var` 会先在定义处展开（不加引号时会当模式用），需要字面匹配时给变量加引号',
        '`;&`（fall through）与 `;;&` 是 Bash 4+ 特性，`#!/bin/sh` 下不可用，写 POSIX 脚本时避免',
        '`case` 只做字符串匹配，**数值范围判断（如"大于 100"）不适合用 case**，请用 if 与算术比较'
      ],
      related: ['sh-if', 'sh-test', 'sh-getopts', 'sh-function'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Conditional-Constructs.html',
      tags: ['分支', '模式匹配', '服务脚本', '语法']
    },

    /* ---------- 10 / 36 ---------- */
    {
      id: 'sh-for',
      name: 'for',
      alias: ['for 循环', 'for in', 'C 风格 for'],
      level: 1,
      syntax: 'for <变量> in <列表>; do 命令; done  |  for ((i=0; i<10; i++)); do 命令; done',
      summary: '遍历列表或按次数循环，批量处理文件与主机的核心结构。',
      desc: '**两种形式**：\n- **`for x in 列表`**：遍历列表，最常用。列表可以是字面量、变量、命令替换结果、通配符展开的文件名、`{1..10}` 序列；\n- **C 风格 `for ((i=0;i<10;i++))`**：需要计数或步长时使用（Bash 专属）。\n\n**列表的常见来源**：\n- 文件：`for f in /var/log/*.log`（**通配符由 shell 展开，文件名含空格时会出问题**，安全做法是 `find ... -print0 | while IFS= read -r -d "" f`）；\n- 命令输出：`for h in $(cat hosts.txt)`（**文件名/内容含空格会被拆开**）；\n- 序列：`for i in {1..5}`、`for i in $(seq 1 2 10)`（步长为 2）；\n- 数组：`for x in "${ARR[@]}"`（**必须加引号**）。\n\n**两个必须掌握的安全写法**：\n① 遍历文件用 `for f in "$dir"/*.log; do [ -e "$f" ] || continue; ...` —— `[ -e ]` 判断是为了处理"没有匹配文件时通配符原样保留"的情况；\n② 遍历命令输出/文件列表优先用 `while IFS= read -r line`，它能正确处理空格与反斜杠。\n\n**性能提示**：循环体内调用外部命令（`grep`、`sed`、`curl`）时，每次迭代都要启动进程，几万次循环会非常慢。能在循环外做的过滤就放到循环外（如先用 `grep` 缩小范围再循环）。',
      params: [
        { flag: 'for x in 列表; do ...; done', desc: '遍历列表，最常用的形式' },
        { flag: 'for ((i=0;i<n;i++))', desc: 'C 风格计数循环（Bash 专属）' },
        { flag: '{1..10} / {a..e}', desc: '花括号序列展开，支持数字与字母' },
        { flag: '"${ARR[@]}"', desc: '遍历数组，**双引号必加**以保留含空格的元素' },
        { flag: 'IFS= read -r', desc: '按行读取时保留原始内容（不裁剪空白、不解释反斜杠）' },
        { flag: 'continue / break', desc: '跳过本次 / 跳出整个循环，见 `sh-break-continue`' }
      ],
      examples: [
        { cmd: 'for h in 10.0.1.21 10.0.1.22 10.0.1.23; do ping -c 1 -W 1 "$h" >/dev/null && echo "$h 可达" || echo "$h 不可达"; done', desc: '批量探测主机连通性' },
        { cmd: 'for f in /var/log/*.log; do [ -e "$f" ] || continue; echo "$(basename "$f"): $(wc -l < "$f") 行"; done', desc: '遍历日志文件统计行数，含"无匹配文件"保护' },
        { cmd: 'for i in {1..5}; do echo "第 $i 次重试"; sleep 2; done', desc: '固定次数循环，常用于重试逻辑' },
        { cmd: 'for ((i=0; i<${#HOSTS[@]}; i++)); do echo "${HOSTS[$i]}"; done', desc: 'C 风格按下标遍历数组' },
        { cmd: 'while IFS= read -r host; do echo "处理 $host"; done < hosts.txt', desc: '按行读取文件的安全写法，推荐用于主机清单' },
        { cmd: 'for d in /data/app /data/log /data/backup; do echo "$d: $(du -sh "$d" 2>/dev/null | cut -f1)"; done', desc: '批量统计目录占用' }
      ],
      notes: [
        '**遍历文件时通配符无匹配会原样保留**：`for f in *.log` 在没有日志文件时会循环一次、值为字面量 `*.log`，务必加 `[ -e "$f" ] || continue` 保护',
        '**`for f in $(cat list.txt)` 会在文件名含空格时出错**：应改用 `while IFS= read -r line` 或 `find -print0`',
        '**遍历数组必须写 `"${ARR[@]}"`**，写成 `${ARR[@]}` 或 `${ARR[*]}` 都会在元素含空格时出错',
        '**循环体内的变量会被后续迭代覆盖**，需要在循环外累加时先初始化（如 `total=0`），并注意管道中的循环在子 shell 里执行（变量修改不会保留）',
        '**`while ... | read` 的经典陷阱**：管道右侧在子 shell 中运行，循环里赋的变量在循环外读不到；解决方案是改用进程替换 `done < <(命令)`',
        '循环里执行 `ssh`、`curl` 等命令时建议加超时与错误处理，否则单个目标卡住会让整个脚本挂死',
        '几万次迭代且每次调用外部命令时性能很差，能用 `xargs -P` 并行的场景优先并行化'
      ],
      related: ['sh-while-until', 'sh-array', 'sh-break-continue', 'lb-xargs'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Looping-Constructs.html',
      tags: ['循环', '批量处理', '遍历', '基础']
    },

    /* ---------- 11 / 36 ---------- */
    {
      id: 'sh-while-until',
      name: 'while / until',
      alias: ['while 循环', 'until 循环', 'while read'],
      level: 2,
      syntax: 'while <条件>; do 命令; done  |  until <条件>; do 命令; done  |  while IFS= read -r line; do ...; done < <文件>',
      summary: '条件成立（while）或不成立（until）时反复执行，适合等待与逐行处理。',
      desc: '`while` 在条件为真（退出码 0）时循环，`until` 恰好相反——**条件为假时循环，为真时停止**。两者可以互相改写，`until` 在语义上更贴合"等到某件事发生"（如等待服务就绪）。\n\n**三大典型用途**：\n① **等待与轮询**：等端口就绪、等文件出现、等任务结束。例如 `until curl -sf http://127.0.0.1:8080/health >/dev/null; do sleep 2; done`。**必须配超时**，否则目标永不就绪时脚本会永久挂住（见 `sh-timeout`）；\n② **逐行处理文件**：`while IFS= read -r line; do ...; done < file`，这是**处理文本文件最安全的方式**（`IFS=` 保留行首尾空白，`-r` 禁止解释反斜杠）；\n③ **无限循环 + 手工退出**：`while true; do ...; done`，配合 `break` 与信号处理（见 `sh-trap`）做常驻脚本。\n\n**必须记住的经典陷阱——管道里的 while 在子 shell 中执行**：\n```\ncount=0\ncat file | while read -r line; do count=$((count+1)); done\necho $count   # 输出 0！因为循环在子 shell，count 的修改没有带回父 shell\n```\n两种正确写法：用输入重定向 `while read ...; done < file`，或用进程替换 `while read ...; done < <(cat file)`。\n\n**读取文件的三种方式对比**：`while read` 逐行处理（内存友好、可改流程）、`$(cat file)` 一次性读入变量（文件大时占内存）、`for line in $(cat file)`（**最危险，会按空白分词**，绝不要用于含空格的内容）。\n\n**`until` 的实用场景**：`until kubectl get pod my-pod -o jsonpath="{.status.phase}" | grep -q Running; do sleep 5; done` —— 等待 Pod 就绪，比 `sleep 60` 猜时间可靠得多。',
      params: [
        { flag: 'while <条件>; do ...; done', desc: '条件成立时循环' },
        { flag: 'until <条件>; do ...; done', desc: '条件不成立时循环，适合等待场景' },
        { flag: 'while true', desc: '无限循环，配合 `break` 与 trap 退出' },
        { flag: 'IFS= read -r', desc: '逐行读取的安全写法，保留空白且不解释反斜杠' },
        { flag: 'done < <文件>', desc: '输入重定向（**避免子 shell 问题**）' },
        { flag: 'done < <(命令)', desc: '进程替换，把命令输出喂给循环且不产生子 shell' },
        { flag: 'sleep <秒>', desc: '轮询间隔，避免忙等耗尽 CPU' }
      ],
      examples: [
        { cmd: 'n=0; until curl -sf http://127.0.0.1:8080/health >/dev/null; do n=$((n+1)); [ $n -gt 30 ] && { echo "等待超时"; exit 1; }; sleep 2; done; echo "服务已就绪"', desc: '等待服务就绪并带超时保护，比固定 sleep 可靠' },
        { cmd: 'while IFS= read -r host; do echo "检查 $host"; done < hosts.txt', desc: '逐行读取主机清单，最安全的写法' },
        { cmd: 'count=0; while IFS= read -r line; do count=$((count+1)); done < /var/log/app.log; echo "共 $count 行"', desc: '用输入重定向统计行数，变量修改能带出循环' },
        { cmd: 'while IFS= read -r line; do count=$((count+1)); done < <(grep -c ERROR /var/log/app.log); echo "$count"', desc: '进程替换写法，同样避免子 shell 问题' },
        { cmd: 'while true; do if [ -f /tmp/stop.flag ]; then echo "收到停止标志，退出"; break; fi; sleep 5; done', desc: '常驻循环配合标志文件优雅退出' },
        { cmd: 'until systemctl is-active --quiet nginx; do echo "等待 nginx 启动"; sleep 1; done', desc: '等待服务进入运行状态' }
      ],
      notes: [
        '**管道里的 while 在子 shell 中执行，循环内的变量修改会丢失**：这是最经典的坑，改用 `done < file` 或 `done < <(命令)`',
        '**轮询必须有超时**：`until`/`while` 等一个永不满足的条件会让脚本永久挂住，务必加计数上限或配合 `timeout`',
        '**轮询要加 `sleep`**：忙等（无 sleep 的循环）会吃满一个 CPU 核，拖慢整台机器',
        '**读文件必须用 `IFS= read -r`**：只写 `read line` 会裁剪行首尾空白并解释反斜杠，处理路径与配置时容易出错',
        '**最后一行没有换行符时会漏读**：`while read` 在文件末尾无换行时会丢弃最后一行，处理外部生成的文件时要留意（可用 `|| [ -n "$line" ]` 补读）',
        '`while true` 常驻脚本必须处理信号（`trap`）与退出条件，否则只能 `kill -9` 强杀，无法优雅收尾',
        '大文件用 `while read` 是内存友好的；但若循环体内每条都启动外部命令，性能会明显下降，可考虑 `awk` 一次性处理'
      ],
      related: ['sh-for', 'sh-break-continue', 'sh-timeout', 'sh-trap'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Looping-Constructs.html',
      tags: ['循环', '轮询', '逐行读取', '子shell陷阱']
    },

    /* ---------- 12 / 36 ---------- */
    {
      id: 'sh-break-continue',
      name: 'break / continue',
      alias: ['break', 'continue', '跳出循环'],
      level: 2,
      syntax: 'break [n] | continue [n]  # n 表示跳出/继续第 n 层循环',
      summary: '提前结束循环或跳过本次迭代，控制循环流程的两个关键字。',
      desc: '`break` 立即**终止整个循环**，`continue` **跳过本次迭代的剩余部分**直接进入下一次。两者都可以带数字参数表示层级：`break 2` 跳出两层嵌套循环，`continue 2` 继续外层循环的下一轮——**嵌套循环里这个参数能省掉大量标志变量**。\n\n**典型用法**：\n- **重试逻辑**：循环尝试 N 次，成功就 `break`；\n- **提前退出**：遍历查找目标，找到就 `break`，避免无谓的剩余迭代；\n- **跳过异常数据**：`while read` 读到空行或注释行时 `continue`；\n- **无限循环 + 条件退出**：`while true; do ...; break; done`。\n\n**`break` 与 `exit` 的区别必须分清**：`break` 只跳出循环，脚本继续往下执行；`exit` 直接结束整个脚本（并返回指定退出码）。在函数里的 `break` 只影响该函数内的循环。\n\n**注意 `case` 里不能混用**：`case` 分支用的是 `;;`，不是 `break`；但 `break` 可以用在 `case` 外层的循环里（这也是 `case` 中跳出循环的常用手法）。\n\n**`continue` 在 `while read` 中的常见坑**：如果循环用 `while read` 并从标准输入读取，循环体里的命令（如 `ssh`）会**抢走标准输入**，导致后续读取错乱。解决方式是给循环体内的命令加 `</dev/null` 或 `ssh -n`。',
      params: [
        { flag: 'break', desc: '立即终止当前循环' },
        { flag: 'break n', desc: '跳出 n 层嵌套循环' },
        { flag: 'continue', desc: '跳过本次迭代剩余部分，进入下一次循环' },
        { flag: 'continue n', desc: '继续第 n 层循环的下一轮' },
        { flag: 'exit <码>', desc: '结束整个脚本（**与 break 完全不同**）' },
        { flag: 'return <码>', desc: '从函数返回（仅函数内有效）' }
      ],
      examples: [
        { cmd: 'for i in 1 2 3 4 5; do [ "$i" -eq 3 ] && break; echo "$i"; done', desc: '到 3 就跳出循环，只输出 1 2' },
        { cmd: 'for i in 1 2 3 4 5; do [ "$i" -eq 3 ] && continue; echo "$i"; done', desc: '跳过 3，输出 1 2 4 5' },
        { cmd: 'for i in 1 2 3; do for j in a b c; do [ "$j" = b ] && continue 2; echo "$i-$j"; done; done', desc: 'continue 2 直接进入外层循环的下一轮' },
        { cmd: 'while IFS= read -r line; do [ -z "$line" ] && continue; case "$line" in \\#*) continue ;; esac; echo "处理: $line"; done < config.txt', desc: '跳过空行与注释行，解析配置文件的常见写法' },
        { cmd: 'for i in 1 2 3; do if curl -sf http://10.0.1.23/health >/dev/null; then echo "第 $i 次成功"; break; fi; sleep 3; done', desc: '重试直到成功，成功后立即跳出' }
      ],
      notes: [
        '**`break` 与 `exit` 完全不同**：`break` 只跳出循环继续执行脚本，`exit` 结束整个脚本；误用 `break` 会导致后续代码意外执行',
        '**在函数内的 `break` 只跳出函数里的循环**，不会结束函数，函数会继续执行剩余语句',
        '`case` 的分支结束符是 `;;` 不是 `break`，两者混用是常见语法错误',
        '**`break n` / `continue n` 的 n 是层数不是次数**，写大了没有额外效果，写错层会跳到意料之外的位置',
        '`while read` 循环体内调用 `ssh`、`mysql` 等会读取标准输入的命令时，**必须加 `-n` 或 `</dev/null`** 防止吞掉循环的输入',
        '在 `select` 菜单里 `break` 退出菜单、`continue` 重新显示菜单，是交互式脚本的常见结构'
      ],
      related: ['sh-for', 'sh-while-until', 'sh-case', 'sh-function'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Looping-Constructs.html',
      tags: ['循环控制', '跳出', '重试', '语法']
    },

    /* ---------- 13 / 36 ---------- */
    {
      id: 'sh-function',
      name: '函数定义与 local',
      kind: 'recipe',
      alias: ['shell 函数', 'function', 'local 局部变量', 'return'],
      level: 2,
      syntax: 'name() { local var=值; 命令; return <退出码>; }',
      summary: '把重复逻辑封装成函数，配合 local 隔离变量避免互相污染。',
      desc: '**两种定义形式**：`name() { ...; }`（推荐，POSIX 兼容）与 `function name { ...; }`（Bash 扩展）。**函数必须在调用之前定义**，Shell 是顺序解释执行的。\n\n**参数传递**：函数内部用 `$1`、`$2`、`$@`、`$#` 获取参数，与脚本的位置参数互不干扰（函数有自己的参数栈）。**`return` 只能返回 0~255 的退出码，不能返回字符串**——这是初学者最大的困惑。\n\n**如何"返回"数据**：三种标准做法——\n① **`echo` 输出 + 命令替换**：`result=$(get_ip)`（最常用，但函数内的其他输出会污染结果，日志请写到 `stderr`）；\n② **修改全局变量**：函数内直接赋值给外部变量；\n③ **通过传入的变量名间接赋值**（`local -n ref=$1`，Bash 4.3+ 的 nameref）。\n\n**`local` 是必写的**：不加 `local` 的变量是全局的，函数调用会污染外部同名变量——这是大型脚本里最难查的 bug 之一。`local` 只能在函数内使用，且**必须在赋值同一行或之前声明**：`local x; x=1` 或 `local x=1`。\n\n**`return` 与退出码**：`return 0` 表示成功、非 0 表示失败，调用方用 `$?` 或 `if func; then` 判断。**函数最后一条命令的退出码会成为函数的退出码**，所以要在函数末尾显式 `return 0` 避免意外返回非 0。\n\n**注意 `set -e` 与函数的关系**：开启 `set -e` 后，函数内任意命令失败都会导致整个脚本退出（除非在条件位置调用），写"允许失败"的函数要特别小心。',
      params: [
        { flag: 'name() { ...; }', desc: 'POSIX 兼容的定义形式，**推荐**' },
        { flag: 'function name { ...; }', desc: 'Bash 扩展形式' },
        { flag: 'local var=值', desc: '声明局部变量，**强烈建议函数内所有变量都加 local**' },
        { flag: 'return <码>', desc: '返回 0~255 的退出码，**不能返回字符串**' },
        { flag: '$1 / $@ / $#', desc: '函数自己的参数，与脚本位置参数独立' },
        { flag: 'local -n ref=$1', desc: 'nameref 引用（Bash 4.3+），用于"返回"数组等复杂数据' }
      ],
      examples: [
        { cmd: 'log() { echo "[$(date "+%F %T")] $*"; } && log "开始执行备份"', desc: '定义日志函数，最常用的函数封装' },
        { cmd: 'get_ip() { hostname -I | awk "{print \\$1}"; } && IP=$(get_ip) && echo "本机 IP: $IP"', desc: '用 echo + 命令替换"返回"字符串' },
        { cmd: 'check_port() { local host=$1 port=$2; timeout 2 bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null; } && if check_port 10.0.1.23 80; then echo "端口可达"; fi', desc: '带局部变量的端口探测函数，用退出码返回结果' },
        { cmd: 'die() { echo "错误: $*" >&2; exit 1; } && [ -f /etc/myapp/app.conf ] || die "配置文件不存在"', desc: '错误处理函数，配合 || 使用' },
        { cmd: 'retry() { local n=$1; shift; local i; for ((i=1;i<=n;i++)); do "$@" && return 0; sleep 3; done; return 1; } && retry 3 curl -sf http://10.0.1.23/health', desc: '通用重试函数：参数透传给命令，成功即返回' }
      ],
      notes: [
        '**函数必须定义在调用之前**：Shell 顺序执行，把函数写在脚本末尾再在开头调用会报 `command not found`',
        '**`return` 只能返回 0~255 的整数**：想返回字符串请用 `echo` + `$( )`，想返回数组请用 nameref 或全局变量',
        '**函数内变量不加 `local` 就是全局变量**：会污染调用方，这是最难排查的一类 bug，**养成"函数内所有变量都加 local"的习惯**',
        '**函数内 `echo` 的输出会混入命令替换结果**：日志与提示信息请写到 `stderr`（`echo ... >&2`），否则 `result=$(func)` 会拿到脏数据',
        '**函数最后一个命令的退出码会成为函数退出码**：为了让 `if func` 判断可靠，末尾显式 `return 0`',
        '`set -e` 下函数内任何命令失败都会退出整个脚本，写"允许失败"的逻辑要显式 `|| true` 或在 if 条件中调用',
        '导出函数给子进程用 `export -f name`，但这是 Bash 扩展且传递不安全，跨脚本复用更推荐用 `source` 加载函数库文件',
        '把常用函数集中写到 `lib.sh` 再用 `source ./lib.sh`（或 `. ./lib.sh`）加载，是脚本工程化的第一步'
      ],
      related: ['sh-log-error', 'sh-getopts', 'sh-var-export', 'sh-set-euo-pipefail'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Shell-Functions.html',
      tags: ['函数', '局部变量', '复用', '返回值']
    },

    /* ---------- 14 / 36 ---------- */
    {
      id: 'sh-getopts',
      name: 'getopts',
      alias: ['getopts 解析参数', '命令行选项', '参数解析'],
      level: 3,
      syntax: 'while getopts "ab:c:" opt; do case "$opt" in a) ... ;; b) val=$OPTARG ;; ?) usage ;; esac; done; shift $((OPTIND-1))',
      summary: '解析 -a -b value 形式的命令行选项，写出专业脚本的参数接口。',
      desc: '`getopts` 是 Shell 内置的选项解析器，支持"短选项 + 选项值"，比手工遍历 `$@` 可靠得多。\n\n**用法要点**：`getopts "ab:c:" opt` 中，**字母后的冒号表示该选项需要一个值**（`b:` 表示 `-b value`），不带冒号则是开关（`-a`）。循环中 `$opt` 是当前选项名，`$OPTARG` 是它的值。\n\n**标准骨架**（写脚本直接套用）：\n```\nwhile getopts "hvf:o:" opt; do\n  case "$opt" in\n    h) usage; exit 0 ;;\n    v) VERBOSE=1 ;;\n    f) FILE=$OPTARG ;;\n    o) OUT=$OPTARG ;;\n    \\?) usage; exit 1 ;;\n  esac\ndone\nshift $((OPTIND-1))\n```\n\n**三个关键细节**：\n① **`\\?` 分支必须写**：用户传了未定义的选项时 `opt` 为 `?`，必须给出用法提示并退出，否则脚本会静默忽略错误参数；\n② **`shift $((OPTIND-1))` 不能漏**：`getopts` 只把选项解析掉，处理完必须把位置参数移到第一个非选项参数，才能继续用 `$1`、`$@` 读取剩余参数；\n③ **`OPTARG` 与 `OPTIND` 是 getopts 提供的变量**：前者是选项值，后者是下一个待处理参数的索引。\n\n**能力边界**：`getopts` **只支持短选项**（`-f`），不支持长选项（`--file`）。需要 `--file=value` 这种风格时，要么用 `getopt`（外部命令，支持长选项但解析规则更复杂），要么手工写 `case "$1" in --file) ...` 循环。\n\n**选项值带空格**时要加引号：`./deploy.sh -f "my report.txt"`，`$OPTARG` 取值时也要加引号。',
      params: [
        { flag: '"ab:c:"', desc: '选项字符串：不带冒号是开关，带冒号表示需要一个值' },
        { flag: '$opt', desc: '当前解析到的选项字母' },
        { flag: '$OPTARG', desc: '当前选项的值（对应带冒号的选项）' },
        { flag: '$OPTIND', desc: '下一个待处理参数的索引，配合 shift 使用' },
        { flag: '\\?)', desc: '遇到未知选项时的分支，**必须处理并给出用法提示**' },
        { flag: 'shift $((OPTIND-1))', desc: '把位置参数移到首个非选项参数，**处理完必写**' },
        { flag: 'OPTERR=0', desc: '关闭 getopts 自带的错误输出，自己控制报错信息' }
      ],
      examples: [
        { cmd: 'while getopts "hvf:o:" opt; do case "$opt" in h) echo "用法: $0 [-v] [-f 输入文件] [-o 输出文件]"; exit 0 ;; v) VERBOSE=1 ;; f) FILE=$OPTARG ;; o) OUT=$OPTARG ;; \\?) echo "未知选项，使用 -h 查看用法"; exit 1 ;; esac; done; shift $((OPTIND-1))', desc: '标准参数解析骨架，直接套用到自己的脚本' },
        { cmd: 'VERBOSE=0; while getopts "v" opt; do [ "$opt" = v ] && VERBOSE=1; done; [ "$VERBOSE" = 1 ] && echo "详细模式已开启"', desc: '最简单的开关选项解析' },
        { cmd: './deploy.sh -f "my config.yaml" -o /tmp/out.log', desc: '选项值含空格时加引号，脚本内取 $OPTARG 也要加引号' },
        { cmd: 'while getopts ":f:" opt; do case "$opt" in f) FILE=$OPTARG ;; :) echo "选项 -$OPTARG 缺少值"; exit 1 ;; \\?) echo "未知选项: -$OPTARG"; exit 1 ;; esac; done', desc: '选项串以冒号开头可自定义缺值报错（$OPTARG 为缺少值的选项名）' }
      ],
      notes: [
        '**`\\?` 分支不能省**：不处理未知选项时脚本会静默忽略错误参数，用户敲错命令却毫无提示',
        '**`shift $((OPTIND-1))` 必须写**：漏掉它会让后续的 `$1` 仍然是选项而不是业务参数，导致"参数错位"的怪异 bug',
        '**`getopts` 不支持长选项**（`--file`）：需要长选项请用外部 `getopt` 命令或手工解析',
        '`getopts` **每次调用都会用一个新的 OPTIND**：在函数里多次使用要注意先把 `OPTIND=1` 重置',
        '选项串第一个字符是 `:` 时进入"静默模式"，缺少值不会自动报错，而是把 `:` 作为 opt 返回并把选项名放进 `$OPTARG`',
        '**`$OPTARG` 取值要加引号**，否则选项值含空格时会被拆成多个单词',
        '不要在 `while getopts` 循环内部使用 `shift`，会打乱 getopts 自己的位置计数'
      ],
      related: ['sh-special-vars', 'sh-shift', 'sh-case', 'sh-function'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html',
      tags: ['参数解析', '命令行选项', '脚本规范', 'getopts']
    },

    /* ================= C. 重定向与管道 ================= */

    /* ---------- 15 / 36 ---------- */
    {
      id: 'sh-redirect',
      name: '> / >> / 2> / &> / 2>&1',
      alias: ['输出重定向', '2>&1', '&>', '标准错误'],
      level: 2,
      syntax: '命令 > <文件>  |  命令 >> <文件>  |  命令 2> <文件>  |  命令 &> <文件>  |  命令 > <文件> 2>&1',
      summary: '把标准输出与错误分开或合并写入文件，日志与排障的基础操作。',
      desc: '**先记住三个文件描述符**：`0` 标准输入、`1` 标准输出、`2` 标准错误。重定向的本质就是"把这些描述符指向别处"。\n\n**五个高频写法**：\n- **`>`**：覆盖写入（**文件原有内容立即被清空**，这是最危险的常见操作）；\n- **`>>`**：追加写入，日志场景用；\n- **`2>`**：只重定向错误输出，把正常结果留在屏幕；\n- **`2>&1`**：把错误输出"合并到标准输出"，**必须写在 `>` 之后**；\n- **`&>`**：Bash 的简写，等价于 `> file 2>&1`（**POSIX sh 不支持**，写 `#!/bin/sh` 时不能用）。\n\n**最经典的坑是顺序**：`cmd > file 2>&1` 与 `cmd 2>&1 > file` **完全不同**。前者先把 stdout 指向文件、再把 stderr 也指向 stdout 当前的目标（即文件），两者都进文件；后者先把 stderr 指向当前 stdout（终端），再把 stdout 改到文件——结果是**错误仍然打印在屏幕上**。原因：重定向是从左到右依次生效的，`2>&1` 复制的是"此刻 1 指向哪里"。\n\n**丢弃输出**：`>/dev/null 2>&1` 是"完全静默"的标准写法；只需要静默错误则用 `2>/dev/null`。\n\n**补充技巧**：`exec > file 2>&1` 可以让整个脚本后续输出都进文件（见 `sh-tee-exec`）；`&>>file` 是追加版合并重定向（Bash 4+）。写脚本时，"日志与错误分别落到不同文件"通常比全部合并更好排查。',
      params: [
        { flag: '> <文件>', desc: '覆盖写入标准输出（**原内容立即丢失**）' },
        { flag: '>> <文件>', desc: '追加写入标准输出' },
        { flag: '2> <文件>', desc: '只重定向标准错误' },
        { flag: '2>&1', desc: '把标准错误合并到标准输出，**必须写在 `>` 之后**' },
        { flag: '&> <文件>', desc: 'Bash 简写，等价于 `> 文件 2>&1`（**POSIX sh 不支持**）' },
        { flag: '&>> <文件>', desc: '追加重定向（Bash 4+）' },
        { flag: '> /dev/null 2>&1', desc: '完全丢弃输出，静默执行的标准写法' },
        { flag: '2>&1 | 命令', desc: '把错误合并进管道传给下游命令' }
      ],
      examples: [
        { cmd: 'df -h > /tmp/disk-report.txt', desc: '覆盖写入（注意会清空原文件）' },
        { cmd: 'echo "检查时间: $(date)" >> /var/log/health.log', desc: '追加写入日志' },
        { cmd: 'find /data -name "*.tmp" -delete 2>/tmp/find-error.log', desc: '错误单独落文件，正常结果留在屏幕' },
        { cmd: 'systemctl restart nginx > /tmp/nginx-restart.log 2>&1', desc: '正确写法：输出与错误都进同一个日志' },
        { cmd: 'systemctl restart nginx 2>&1 > /tmp/nginx-restart.log', desc: '反面示例：错误仍打印到终端，顺序写反了' },
        { cmd: 'curl -s http://10.0.1.23/health >/dev/null 2>&1; echo "退出码 $?"', desc: '静默执行只看退出码' },
        { cmd: 'tar -czf /tmp/app.tar.gz /data/app 2>&1 | tee /var/log/backup.log', desc: '合并错误进管道，同时用 tee 落盘并显示' }
      ],
      notes: [
        '**`>` 会立刻清空目标文件**：写日志请用 `>>`；`> 重要文件` 敲错一次内容就没了，操作前想清楚',
        '**`2>&1` 的位置决定结果**：必须放在 `>` 之后（`> file 2>&1`），写成 `2>&1 > file` 错误仍会打到终端',
        '**`&>` 是 Bash 扩展**：`#!/bin/sh`（dash、busybox）不支持，POSIX 写法是 `> file 2>&1`',
        '**重定向在命令执行前就生效**：即使命令本身报"找不到"，目标文件也已经被创建或清空',
        '**不要用 `> file` 覆盖正在被程序写入的文件**：日志文件的正确清理方式是 `truncate -s 0` 或 `logrotate` 的 `copytruncate`',
        '`2>&1 | tee file` 能让错误同时进管道与文件，但**管道的退出码是 tee 的**，要判断原命令是否成功需配合 `PIPESTATUS` 或 `set -o pipefail`',
        '多个重定向按从左到右顺序生效，理解这个规则就能推导出所有组合的结果'
      ],
      related: ['sh-tee-exec', 'sh-devnull-devtcp', 'sh-pipe-cmdsub', 'sh-heredoc'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Redirections.html',
      tags: ['重定向', '标准错误', '日志', '2>&1']
    },

    /* ---------- 16 / 36 ---------- */
    {
      id: 'sh-heredoc',
      name: '<< here-document 与 <<< here-string',
      kind: 'recipe',
      alias: ['heredoc', 'here-document', 'here-string', '多行输入'],
      level: 3,
      syntax: '命令 <<EOF\n多行内容\nEOF    |    命令 <<< "字符串"    |    命令 <<\'EOF\'（禁用变量展开）',
      summary: '把多行文本直接喂给命令，写配置与 SQL 时不必转义引号。',
      desc: '**here-document（`<<`）** 把一段多行文本作为命令的标准输入，是生成配置文件、执行 SQL、发多行邮件的最佳方式。结束标记（通常写 `EOF`）必须**独占一行且顶格**（前面有空格或 Tab 就不会被识别，除非用 `<<-` 允许前置 Tab）。\n\n**是否展开变量是核心区别**：\n- `<<EOF`（默认）：内容里的 `$VAR`、`$(命令)`、反引号**会被展开**，适合动态生成配置；\n- `<<\'EOF\'`（标记加引号）：**完全原样输出**，不展开任何变量，适合写入含 `$` 的脚本或模板；\n- `<<-EOF`：允许结束标记与内容行前置 Tab（**只支持 Tab，不支持空格**），用于让脚本缩进美观。\n\n**典型场景**：① 生成 Nginx/应用配置（变量展开版）；② 用 `mysql <<EOF ... EOF` 执行多行 SQL；③ 写一段内含 `${}` 的脚本文件（必须用 `<<\'EOF\'` 否则变量会被外层脚本提前展开）；④ `cat <<EOF > file` 或 `tee file <<EOF`（需要 root 权限写文件时用 `sudo tee`，因为重定向符本身不受 sudo 影响）。\n\n**here-string（`<<<`）** 是单行版本：`命令 <<< "文本"`，等价于 `echo "文本" | 命令`，但**不产生额外的子进程**，且自动追加一个换行符。常用于 `read`、`bc`、`grep` 等：`read -r a b <<< "1 2"`。\n\n**注意**：`<<<` 与 `<<-` 都是 Bash 扩展，POSIX sh 不支持 here-string。',
      params: [
        { flag: '<<EOF ... EOF', desc: '多行输入，内容中的变量会被展开' },
        { flag: "<<'EOF' ... EOF", desc: '单引号包裹结束标记，**禁止变量展开**，写模板必用' },
        { flag: '<<-EOF', desc: '允许结束标记与内容行使用 Tab 缩进（**不支持空格**）' },
        { flag: '<<< "文本"', desc: 'here-string：单行输入，等价于 echo 管道但不额外起进程' },
        { flag: 'cat <<EOF > <文件>', desc: '用 here-document 生成文件' },
        { flag: 'sudo tee <文件> <<EOF', desc: '需要 root 权限写文件时用 tee（重定向符不受 sudo 影响）' }
      ],
      examples: [
        { cmd: 'cat <<EOF > /etc/myapp/app.conf\n[server]\nlisten = 8080\ndata_dir = /data/myapp\nEOF\ncat /etc/myapp/app.conf', desc: '生成配置文件，变量会被展开' },
        { cmd: "cat <<'EOF' > /opt/scripts/env.sh\nexport APP_HOME=/opt/myapp\necho \"HOME is $APP_HOME\"\nEOF", desc: '用引号标记写入含变量的脚本，防止被外层提前展开' },
        { cmd: 'mysql -u root -p<数据库密码> mydb <<EOF\nSELECT COUNT(*) FROM orders WHERE created_at > CURDATE();\nEOF', desc: '执行多行 SQL，不必处理引号转义' },
        { cmd: 'sudo tee /etc/sysctl.d/99-tuning.conf > /dev/null <<EOF\nnet.core.somaxconn = 32768\nnet.ipv4.tcp_tw_reuse = 1\nEOF', desc: '用 tee + here-document 以 root 身份写配置（重定向符本身不继承 sudo）' },
        { cmd: 'read -r user host <<< "ops 10.0.1.23" && echo "用户 $user 主机 $host"', desc: 'here-string 拆分字符串到多个变量' },
        { cmd: 'bc <<< "scale=2; 100/3"', desc: 'here-string 给 bc 传算式做浮点计算' }
      ],
      notes: [
        '**结束标记必须独占一行**：前面有空格（用 `<<-` 时也只认 Tab）或后面跟了内容都不会被识别，脚本会一直等待输入直到文件结束',
        '**`<<EOF` 里的 `$` 会被展开**：写入含 `${VAR}` 的脚本或模板时，**必须写成 `<<\'EOF\'`**，否则变量会被外层脚本替换掉——这是写配置模板最容易踩的坑',
        '**`sudo` 不会作用于重定向符**：`sudo echo x > /etc/file` 仍然会因权限不足失败，正确写法是 `echo x | sudo tee /etc/file`',
        '`<<-` 的缩进只支持 **Tab**，用空格无效；很多编辑器默认把 Tab 转成空格，会导致 here-document 失效',
        '**here-string `<<<` 是 Bash 扩展**：`#!/bin/sh` 下不可用，POSIX 写法是 `echo "文本" | 命令`',
        'here-document 内容中的反斜杠仍特殊（`\\$`、`\\\\`），需要字面反斜杠时要加引号标记或做转义',
        '在循环里用大段 here-document 生成文件时注意缩进与变量展开的配合，出错时先用 `cat <<EOF` 打印而不写文件来调试'
      ],
      related: ['sh-redirect', 'sh-tee-exec', 'sh-quotes', 'sh-pipe-cmdsub'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Here-Documents.html',
      tags: ['here-document', '多行输入', '配置生成', '变量展开']
    },

    /* ---------- 17 / 36 ---------- */
    {
      id: 'sh-pipe-cmdsub',
      name: '管道与 $() 命令替换',
      kind: 'recipe',
      alias: ['管道', '命令替换', '$()', 'PIPESTATUS'],
      level: 2,
      syntax: '命令1 | 命令2  |  var=$(命令)  |  var=`命令`（不推荐）  |  echo "${PIPESTATUS[@]}"',
      summary: '用管道串联命令、用命令替换取结果，Shell 组合能力的核心。',
      desc: '**管道（`|`）** 把前一个命令的标准输出接到后一个命令的标准输入，是 Shell "小工具组合"哲学的基础：`awk ... | sort | uniq -c | sort -rn | head` 这种五段管道能在一行内完成统计排序取前十。\n\n**管道的三个关键认知**：\n① **只有标准输出进管道，标准错误不进**（除非 `2>&1`）；\n② **每个管道段都在独立子进程中执行**，所以 `cmd | while read; do total=$((total+1)); done` 里的变量修改**在管道外读不到**（经典陷阱）；\n③ **管道的退出码默认是最后一段的退出码**，前面命令失败会被掩盖——`set -o pipefail` 就是为解决这个问题而存在。\n\n**查看各段退出码**：Bash 提供 `PIPESTATUS` 数组，`echo "${PIPESTATUS[@]}"` 会打印每一段的退出码，排障时非常有用。\n\n**命令替换 `$(...)`**：把命令的输出当作字符串使用，如 `NOW=$(date +%F)`。**推荐 `$(...)` 而不是反引号**：可嵌套（`$(basename $(pwd))`）、引号处理直观、可读性好。\n\n**两个使用细节**：① **命令替换会去掉末尾的换行符**（保留中间换行），所以 `$(cat file)` 得到的字符串没有末尾空行；② **命令替换的结果不加引号会分词**：`for f in $(ls)` 在文件名含空格时会出错，要保留换行结构请用 `while IFS= read -r`。\n\n**性能提示**：管道每段都是进程，几千次循环里反复用 `$(...)` 调用外部命令会明显变慢；能用内置字符串操作（见 `sh-string-ops`）替代的尽量替代。',
      params: [
        { flag: '|', desc: '管道：前一个命令的标准输出接到后一个命令的标准输入' },
        { flag: '2>&1 |', desc: '把标准错误也送进管道' },
        { flag: '$(命令)', desc: '命令替换的现代写法，**推荐**，可嵌套' },
        { flag: '`命令`', desc: '命令替换的老写法，不能嵌套，**不推荐**' },
        { flag: '"${PIPESTATUS[@]}"', desc: '查看管道中每一段的退出码' },
        { flag: 'set -o pipefail', desc: '让管道中任意一段失败都算整体失败' },
        { flag: 'xargs', desc: '把管道内容转成后续命令的参数（有些命令只接受参数不接受 stdin）' }
      ],
      examples: [
        { cmd: "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10", desc: '统计访问量前 10 的 IP，经典五段管道' },
        { cmd: 'NOW=$(date +%F) && LOG=/var/log/app-$NOW.log && echo "$LOG"', desc: '命令替换取日期构造文件名' },
        { cmd: 'COUNT=$(grep -c "ERROR" /var/log/app.log) && echo "错误行数: $COUNT"', desc: '命令替换取统计结果' },
        { cmd: 'grep -v "^#" /etc/nginx/nginx.conf | grep -v "^$" | wc -l', desc: '过滤注释与空行后统计有效行数' },
        { cmd: 'ls /var/log/*.log 2>&1 | head -3; echo "各段退出码: ${PIPESTATUS[@]}"', desc: '查看管道中每一段的退出码，排查"管道掩盖错误"' },
        { cmd: 'find /data -name "*.log" -print0 | xargs -0 rm -f', desc: '用 -print0 与 -0 安全处理含空格的文件名' }
      ],
      notes: [
        '**管道中的每一段都在子 shell 里**：循环里赋的变量在管道外读不到，这是最常见的逻辑 bug（改用 `done < file` 或进程替换）',
        '**管道的退出码只反映最后一段**：`false | true` 的退出码是 0，**必须开 `set -o pipefail`** 才能捕获前面的失败',
        '**命令替换会去掉末尾换行**：需要保留原始内容（如逐行处理）时不要用 `$(cat file)`，改用重定向或 `while read`',
        '**命令替换结果不加引号会被分词与通配符展开**：`rm $(ls)` 在文件名含空格时会误删，请加引号或用数组',
        '管道只能传标准输出，**标准错误默认直接打到终端**；需要一起传给下游得写 `2>&1 |`',
        '`xargs` 默认按空白分词，文件名含空格时**必须用 `find -print0 | xargs -0`**',
        '长管道排障时逐段注释掉后半部分、观察中间输出，比盯着最终结果猜要快得多'
      ],
      related: ['sh-redirect', 'sh-quotes', 'sh-for', 'lt-awk'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Pipelines.html',
      tags: ['管道', '命令替换', '组合命令', 'PIPESTATUS']
    },

    /* ---------- 18 / 36 ---------- */
    {
      id: 'sh-tee-exec',
      name: 'tee 与 exec 重定向',
      kind: 'recipe',
      alias: ['tee', 'exec 重定向', '日志落盘', 'tee -a'],
      level: 3,
      syntax: '命令 | tee [-a] <文件>  |  exec > <文件> 2>&1  |  exec 3< <文件>',
      summary: 'tee 让输出同时进屏幕与文件，exec 让整个脚本的输出重定向到日志。',
      desc: '**`tee`** 把标准输入"一分为二"：一份写到文件、一份送到标准输出。它解决的是"既要看到又要留痕"的需求——直接 `> file` 就看不到输出了，而 `tee` 两者兼顾。\n\n**关键参数**：`-a` 追加（**不加是覆盖，会清掉历史日志**）；`-i` 忽略中断信号；`-p` 检测写错误（默认即使写失败也会继续）。**配合 sudo 写系统文件**是它的高频用途：`echo x | sudo tee /etc/file`，因为重定向符本身不继承 sudo 权限。\n\n**管子里的退出码问题**：`命令 | tee log` 的退出码是 `tee` 的，要保留原命令的退出码可以用 `set -o pipefail`，或让 tee 把退出码透传（新版 coreutils 的 `tee` 会以输入流的失败为准）。\n\n**`exec` 重定向**改的是**当前 shell 自身的文件描述符**，一次设置、后续所有命令都生效：\n- `exec > /var/log/myscript.log 2>&1`：脚本从这里开始的所有输出（含错误）都进日志文件，**写运维脚本的标准开场**；\n- `exec >> file`：追加模式，不覆盖历史；\n- `exec 3< file`：打开文件描述符 3 用于读取，避免循环里的 `read` 与其他命令争抢标准输入；\n- `exec 3>&-`：关闭描述符。\n\n**组合用法（脚本模板级）**：脚本开头做"既输出到终端又记录到文件"的效果，可以先用 `tee` 重定向自己：`exec > >(tee -a "$LOG") 2>&1`（进程替换，Bash 4+）。这是运维脚本里非常常见的写法。\n\n**注意 `exec` 的重定向无法撤销**：一旦执行，后续输出就进文件了；需要在脚本中间恢复屏幕输出得提前保存描述符（`exec 3>&1` 保存，`exec >&3` 恢复）。',
      params: [
        { flag: 'tee <文件>', desc: '输出同时写文件与屏幕（**默认覆盖**）' },
        { flag: 'tee -a <文件>', desc: '追加模式，日志场景必用' },
        { flag: 'sudo tee <文件>', desc: '需要 root 权限写文件时的标准写法' },
        { flag: 'exec > <文件> 2>&1', desc: '把当前 shell 后续全部输出重定向到文件' },
        { flag: 'exec >> <文件>', desc: '追加重定向，保留历史日志' },
        { flag: 'exec 3< <文件>', desc: '打开额外的文件描述符，避免 read 与命令争抢标准输入' },
        { flag: 'exec > >(tee -a "$LOG") 2>&1', desc: '同时输出到屏幕与日志文件（Bash 4+ 进程替换）' }
      ],
      examples: [
        { cmd: 'df -h | tee /var/log/disk-check.log', desc: '查看磁盘同时记录到日志（**注意是覆盖**）' },
        { cmd: 'df -h | tee -a /var/log/disk-check.log', desc: '追加写入日志，日常巡检用这个' },
        { cmd: 'echo "net.core.somaxconn = 32768" | sudo tee /etc/sysctl.d/99-tuning.conf', desc: '用 tee 以 root 身份写文件（重定向符不受 sudo 影响）' },
        { cmd: 'exec >> /var/log/backup.log 2>&1 && echo "备份开始 $(date +%F\\ %T)"', desc: '脚本开场把后续所有输出写入日志（含错误）' },
        { cmd: 'exec 3< /etc/hosts && while IFS= read -r line <&3; do echo "$line"; done && exec 3<&-', desc: '用描述符 3 读文件，避免循环内命令吞掉标准输入' },
        { cmd: 'LOG=/var/log/deploy.log; exec > >(tee -a "$LOG") 2>&1; echo "部署开始"', desc: '同时输出到屏幕与日志的脚本模板写法' }
      ],
      notes: [
        '**`tee` 不加 `-a` 是覆盖**：日志会被清空，长期巡检脚本务必用 `tee -a`',
        '**`exec > file` 之后无法简单地恢复屏幕输出**：需要提前用 `exec 3>&1` 保存标准输出，之后用 `exec >&3` 还原',
        '**`sudo cmd > /etc/file` 会失败**：重定向由当前 shell 完成，与 sudo 无关；正确写法是 `cmd | sudo tee /etc/file`',
        '`exec > >(tee ...)` 使用进程替换（Bash 4+），`#!/bin/sh` 不支持；且脚本退出时 tee 可能还没写完，重要日志建议在结尾 `sync` 或显式 `wait`',
        '**`exec` 在管道/子 shell 中的影响范围有限**：`(exec > file; ...)` 只影响该子 shell',
        '重定向到同一文件既读又写（`cmd < file > file`）会先把文件清空再读，结果是空——需要借助临时文件',
        '频繁写日志的生产脚本建议由 `logrotate` 管理轮转，而不是自己反复覆盖写同一个文件'
      ],
      related: ['sh-redirect', 'sh-heredoc', 'sh-log-error', 'sh-template-backup'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/tee-invocation.html',
      tags: ['tee', 'exec', '日志', '重定向']
    },

    /* ---------- 19 / 36 ---------- */
    {
      id: 'sh-devnull-devtcp',
      name: '/dev/null 与 /dev/tcp',
      kind: 'recipe',
      alias: ['/dev/null', '/dev/tcp', '端口探测', '丢弃输出'],
      level: 3,
      syntax: '命令 > /dev/null 2>&1  |  (echo > /dev/tcp/<主机>/<端口>) 2>/dev/null && echo 通',
      summary: '丢弃不需要的输出，或用纯 Bash 内建能力做端口探测。',
      desc: '**`/dev/null`** 是"黑洞设备"，写入的内容全部丢弃、读取立即返回 EOF。它是三个习惯用法的基础：\n- `>/dev/null`：丢弃正常输出；\n- `2>/dev/null`：丢弃错误输出（**"悄悄失败"**）；\n- `>/dev/null 2>&1`：两者都丢弃，只保留退出码。\n\n典型用途：在 `if` 判断里屏蔽命令输出、脚本里屏蔽无关警告、测试命令是否存在（`command -v docker >/dev/null 2>&1`）。\n\n**`/dev/tcp/<主机>/<端口>`** 是 Bash 的**伪设备**：shell 会真的发起一次 TCP 连接，因此可以**不依赖 telnet/nc 就能测端口连通性**。写法是 `(echo > /dev/tcp/10.0.1.23/80) 2>/dev/null` 并用 `$?` 判断成败。这是救援环境（精简镜像没有 nc/telnet）里非常实用的技巧。\n\n**注意**：它是 **Bash 编译时的特性**，需要 `--enable-net-redirections`（主流发行版的 Bash 都开启了），但 **dash、busybox sh 完全不支持**，写 `#!/bin/sh` 时会报 `No such file or directory`。\n\n**更健壮的替代方案**：`nc -z -w2 <主机> <端口>`（需要安装 nc）、`curl -sS --connect-timeout 2 telnet://<主机>:<端口>`、或用 `timeout` 包住防止卡死。生产脚本建议优先用这些标准工具，`/dev/tcp` 作为兜底手段。\n\n**同类伪设备**：`/dev/udp/<主机>/<端口>` 可发 UDP 包（**UDP 无连接，无法据此判断端口是否开放**）；`/dev/stdin`、`/dev/stdout`、`/dev/stderr` 是标准流；`/dev/zero` 提供无限零字节（常配合 `dd` 造空文件）。',
      params: [
        { flag: '> /dev/null', desc: '丢弃标准输出' },
        { flag: '2> /dev/null', desc: '丢弃标准错误（"悄悄失败"）' },
        { flag: '> /dev/null 2>&1', desc: '两者都丢弃，只保留退出码' },
        { flag: '/dev/tcp/<主机>/<端口>', desc: 'Bash 伪设备，发起真实 TCP 连接用于探测端口' },
        { flag: '/dev/udp/<主机>/<端口>', desc: 'UDP 版本；**UDP 无连接，不能据此判断端口开放**' },
        { flag: '/dev/zero', desc: '无限零字节，常配合 dd 生成空文件或测试写入' },
        { flag: 'timeout <秒>', desc: '配合使用，避免探测时长时间挂起' }
      ],
      examples: [
        { cmd: 'command -v docker >/dev/null 2>&1 && echo "docker 已安装"', desc: '静默判断命令是否存在，只关心退出码' },
        { cmd: '(echo > /dev/tcp/10.0.1.23/80) 2>/dev/null && echo "80 端口可达" || echo "80 端口不可达"', desc: '纯 Bash 端口探测，救援环境无 nc 时可用' },
        { cmd: 'for p in 22 80 443 3306; do (echo > /dev/tcp/10.0.1.23/$p) 2>/dev/null && echo "$p 开放" || echo "$p 关闭"; done', desc: '批量探测端口开放情况' },
        { cmd: 'timeout 3 bash -c "echo > /dev/tcp/10.0.1.23/3306" 2>/dev/null && echo "可达"', desc: '加超时保护，避免目标丢弃 SYN 时脚本长时间卡住' },
        { cmd: 'dd if=/dev/zero of=/tmp/testfile bs=1M count=100 2>/dev/null && ls -lh /tmp/testfile', desc: '用 /dev/zero 生成固定大小的测试文件' },
        { cmd: 'df -h >/dev/null 2>&1; echo "df 退出码 $?"', desc: '只取退出码、丢弃全部输出' }
      ],
      notes: [
        '**`/dev/tcp` 是 Bash 专属特性**：dash、busybox sh 不支持，`#!/bin/sh` 下会报 `No such file or directory`；且必须写在 `bash -c` 里才能在 sh 脚本中调用',
        '**探测端口务必加超时**：目标丢弃 SYN 时连接会挂起很久，必须用 `timeout` 包住',
        '**`/dev/udp` 无法判断端口是否开放**：UDP 无连接，写入成功不代表对端在监听',
        '**不要用 `2>/dev/null` 掩盖所有错误**：排障阶段把错误藏起来会让问题更难定位，只在明确知道该错误可忽略时使用',
        '`>/dev/null` 仍然会执行命令并产生副作用，"丢弃输出"不等于"不执行"',
        '生产脚本里测端口优先用 `nc -z -w2`、`curl --connect-timeout` 这类标准工具，可读性与兼容性更好；`/dev/tcp` 适合作为无工具环境的兜底',
        '注意 `command -v x >/dev/null 2>&1` 与 `which x` 的区别：前者是内置命令、可移植、不依赖外部程序，**推荐用前者**'
      ],
      related: ['sh-redirect', 'sh-pipe-cmdsub', 'sh-timeout', 'ln-nc'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Redirections.html',
      tags: ['/dev/null', '端口探测', '伪设备', '静默执行']
    },

    /* ================= D. 健壮性 ================= */

    /* ---------- 20 / 36 ---------- */
    {
      id: 'sh-set-euo-pipefail',
      name: 'set -euo pipefail',
      alias: ['set -e', 'set -u', 'pipefail', '脚本严格模式'],
      level: 3,
      syntax: 'set -euo pipefail  # 通常写在脚本头部（shebang 之后）',
      summary: '开启严格模式让脚本遇错即停，把"静默失败"变成"立刻暴露"。',
      desc: 'Shell 默认非常"宽容"：命令失败会继续往下跑、引用未定义变量会得到空字符串、管道中间失败会被忽略。结果是脚本"跑完了但结果是错的"，问题在很久以后才爆发。`set -euo pipefail` 是让脚本"早暴露、早失败"的标准做法，**逐项说明每个字母的作用**：\n\n**`-e`（errexit，遇错即退）**：任何命令返回非 0 就立即退出脚本。**但它有一批例外，必须记住**：\n- 用于 `if` / `elif` / `while` / `until` 条件位置的命令失败不退出；\n- `&&` 与 `||` 连接的命令中，**除最后一个之外**的失败不退出；\n- 用 `!` 取反的命令失败不退出；\n- 函数在条件位置被调用时，函数**内部**的 `-e` 也会失效（"set -e 被穿透"的经典问题）。\n- **还有个大坑**：`((count++))` 在 `count` 为 0 时返回 1（因为表达式值为 0），会直接让脚本退出——请改用 `((++count))` 或 `count=$((count+1))`。\n\n**`-u`（nounset，未定义变量报错）**：引用未定义变量时报错退出，能抓住变量名拼错、环境变量忘记导出这类问题。**注意**：位置参数在无参数时会让 `$1` 触发错误，要用 `${1:-}` 兜底；老版本 Bash（< 4.4）下空数组的 `"${arr[@]}"` 也会触发。\n\n**`-o pipefail`（管道严格）**：**这是最容易被忽略但最关键的一项**。没有它时，管道的退出码只看最后一段，`grep 找不到 | wc -l` 会"成功"；有了它，管道中任意一段失败，整条管道就算失败。**日志分析、备份、数据同步这类以管道为主的脚本必须开**。\n\n**组合使用时的其他建议**：`set -E`（errtrace）让 `ERR` trap 在函数与子 shell 中也被继承，配合 `trap` 做统一错误处理；`set -x` 用于调试（见 `sh-debug`），**不要留在生产脚本里**。\n\n**要不要用严格模式？** 新脚本一律建议加，但迁移老脚本要谨慎：很多老脚本依赖"命令失败继续跑"的行为，直接加 `-e` 会导致大面积中断，应逐段验证。',
      params: [
        { flag: '-e, -o errexit', desc: '命令失败立即退出（有 if/&&/||/! 等例外）' },
        { flag: '-u, -o nounset', desc: '引用未定义变量时报错退出' },
        { flag: '-o pipefail', desc: '管道中任意一段失败都算整体失败，**最容易被漏掉的一项**' },
        { flag: '-E, -o errtrace', desc: '让 ERR trap 在函数与子 shell 中被继承' },
        { flag: '-x, -o xtrace', desc: '打印每条执行的命令，调试用，**不要留在生产脚本**' },
        { flag: 'set +e / set +u', desc: '临时关闭某项严格检查（按需恢复）' },
        { flag: 'IFS=$\'\\n\\t\'', desc: '常与严格模式一起设置的更保守的分词符' }
      ],
      examples: [
        { cmd: 'head -3 /opt/scripts/strict-demo.sh', desc: '查看严格模式脚本的标准开头写法' },
        { cmd: 'printf "#!/bin/bash\\nset -Eeuo pipefail\\ntrap \'echo \\"第 \\$LINENO 行失败\\" >&2\' ERR\\necho \\"开始执行\\"\\n" > /tmp/strict.sh && chmod +x /tmp/strict.sh && /tmp/strict.sh', desc: '生成带 ERR trap 的严格模式脚本并执行' },
        { cmd: 'set -e; false; echo "这行不会执行"', desc: '验证 -e 的效果：false 之后脚本立即退出' },
        { cmd: 'set -o pipefail; false | true; echo "退出码 $?"', desc: '开启 pipefail 后管道返回非 0（未开启时是 0）' },
        { cmd: 'set -u; echo "${UNDEFINED_VAR:-默认值}"; echo "仍然继续执行"', desc: '用默认值兜底避免 -u 导致退出，这是 -u 下的标准写法' },
        { cmd: 'set -e; if false; then echo yes; else echo "条件位置失败不退出"; fi', desc: '验证 if 条件位置的例外，理解 -e 的边界' }
      ],
      notes: [
        '**`set -e` 不会捕获管道中间命令的失败**：必须同时开 `-o pipefail`，否则 `cmd1 | cmd2` 中 cmd1 失败会被完全掩盖',
        '**`((count++))` 在 count 为 0 时返回 1，会让 `set -e` 直接杀掉脚本**：改用 `((++count))` 或 `count=$((count+1))`，这是严格模式下最著名的坑',
        '**`set -e` 在条件上下文里会失效**：`if func; then` 中函数内部的失败不会触发退出（"穿透"问题），需要函数内部自己做错误处理',
        '**`-u` 会让 `$1` 在无参数时报错**：位置参数与可能为空的变量一律用 `${VAR:-}` 兜底',
        '老版本 Bash（< 4.4）下空数组配合 `-u` 的 `"${arr[@]}"` 会报未定义错误，跨版本脚本要注意',
        '**严格模式不是万能药**：`cmd || true` 之类的"吞错误"写法会绕过 `-e`，团队里要约定不允许无理由地吞错误',
        '迁移老脚本时不要直接加 `set -e`：先加 `-u` 与 `pipefail` 观察，逐段修正后再加 `-e`，否则可能大面积中断',
        '`set -x` 的输出会包含变量展开后的实际值，**可能把密码、AK/SK 打到日志里**，生产脚本严禁常开'
      ],
      related: ['sh-trap', 'sh-log-error', 'sh-special-vars', 'sh-debug'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html',
      tags: ['严格模式', '健壮性', '错误处理', 'pipefail']
    },

    /* ---------- 21 / 36 ---------- */
    {
      id: 'sh-trap',
      name: 'trap 清理与信号处理',
      kind: 'recipe',
      alias: ['trap', '信号处理', '脚本清理', 'ERR trap'],
      level: 4,
      syntax: 'trap \'<命令>\' <信号...>  |  trap - <信号>  |  trap -l',
      summary: '在脚本退出、被中断或出错时自动执行清理动作，避免留下垃圾。',
      desc: '`trap` 让脚本能"兜住"信号与退出事件，是写可靠运维脚本的关键。**最常用的四类信号**：\n- **`EXIT`**：脚本无论以何种方式结束（正常结束、`exit`、出错退出）都会执行，**清理临时文件、删除锁文件的首选**；\n- **`INT` / `TERM`**：收到 Ctrl+C（SIGINT）或被 `kill`（SIGTERM）时执行，用于优雅收尾；\n- **`ERR`**：任意命令失败时执行（**配合 `set -E` 才能在函数与子 shell 中继承**），用于统一记录错误与行号；\n- **`HUP`**：终端断开时触发，常用来实现"重新加载配置"（很多守护进程用 SIGHUP 做配置热加载）。\n\n**注意信号名称可以不带 `SIG` 前缀**：`trap \'...\' INT TERM` 与 `trap \'...\' SIGINT SIGTERM` 等价；`trap -l` 列出所有信号编号与名称。\n\n**清除 trap**：`trap - EXIT` 或 `trap \'\' EXIT` 取消之前的设置。**恢复默认行为**（例如让 Ctrl+C 在清理逻辑之后仍能终止脚本）常写成 `trap - INT; kill -INT $$`。\n\n**`EXIT` trap 的三个实战要点**：\n① **锁文件与临时文件必须在 EXIT 里清理**，否则脚本被中断后会留下残留（见 `sh-mktemp`、备份模板）；\n② **EXIT trap 里可以读取 `$?`** 来判断脚本是正常结束还是失败退出（但只能读一次，要立刻存进变量）；\n③ **EXIT trap 在子 shell 退出时也会触发**，写清理逻辑时注意别把父 shell 需要的资源删掉。\n\n**典型组合（运维脚本标准开头）**：`set -Eeuo pipefail` + `trap \'cleanup\' EXIT` + `trap \'echo 收到中断，正在退出...\' INT TERM`，这一套能让脚本在异常场景下也不留垃圾、不静默失败。',
      params: [
        { flag: "trap '命令' EXIT", desc: '脚本退出时执行，**清理临时文件与锁文件的标准位置**' },
        { flag: "trap '命令' INT TERM", desc: '收到 Ctrl+C 或 kill 时执行，做优雅退出' },
        { flag: "trap '命令' ERR", desc: '命令失败时执行，配合 `set -E` 在函数中生效' },
        { flag: "trap '命令' HUP", desc: '终端断开时执行，也可用于配置热加载' },
        { flag: 'trap - <信号>', desc: '取消已设置的 trap，恢复默认行为' },
        { flag: 'trap -l', desc: '列出所有信号名称与编号' },
        { flag: '$LINENO / $BASH_COMMAND', desc: '在 ERR trap 里取当前行号与出错的命令，定位问题非常有用' }
      ],
      examples: [
        { cmd: 'tmp=$(mktemp) && trap "rm -f $tmp" EXIT && echo "临时文件: $tmp"', desc: '脚本退出时自动删除临时文件' },
        { cmd: 'lock=/var/lock/myapp.lock && trap "rm -f $lock" EXIT INT TERM && touch "$lock"', desc: '锁文件的清理，防止脚本中断后永久残留' },
        { cmd: "trap 'echo \"错误发生在第 $LINENO 行: $BASH_COMMAND\" >&2' ERR", desc: '统一错误处理：打印出错行号与命令' },
        { cmd: "trap 'echo 收到中断信号，正在收尾...; exit 130' INT TERM", desc: '捕获中断并优雅退出（退出码 130 是 SIGINT 的惯例）' },
        { cmd: "trap 'rc=$?; echo 脚本退出，退出码 $rc' EXIT; false", desc: '在 EXIT trap 中读取退出码判断成败' },
        { cmd: 'trap -l | head -20', desc: '查看系统支持的信号列表' }
      ],
      notes: [
        '**`EXIT` trap 是清理资源的唯一可靠位置**：只在正常路径写清理，脚本被 Ctrl+C 或 kill 中断时就会留垃圾',
        '**`ERR` trap 默认不会在函数与子 shell 中生效**：必须同时 `set -E`（errtrace），否则"函数里出错了却没触发 trap"',
        '**EXIT trap 里读 `$?` 只能读一次**：第一条命令执行后 `$?` 就被覆盖，要先 `rc=$?` 存下来',
        '**`kill -9` 无法被捕获**：SIGKILL 不能 trap，这是设计如此；所以关键状态不能只靠 trap 维护，还要有幂等的启动检查',
        'trap 的清理逻辑要**幂等且不报错**（`rm -f`、`|| true`），否则清理本身失败会让退出码变得混乱',
        '**子 shell 退出也会触发 EXIT trap**：在函数或 `( )` 中设置 EXIT trap 时注意作用范围，避免误删父进程的资源',
        '在 trap 处理函数里不要做耗时操作（如等待网络），否则脚本会"卡在退出过程"中，看起来像失去响应',
        '要"清理完再退出"时记得在处理函数最后显式 `exit <码>`，否则脚本可能继续执行中断点之后的逻辑'
      ],
      related: ['sh-set-euo-pipefail', 'sh-mktemp', 'sh-background', 'sh-log-error'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Bourne-Shell-Builtins.html',
      tags: ['trap', '信号', '清理', '健壮性']
    },

    /* ---------- 22 / 36 ---------- */
    {
      id: 'sh-shift',
      name: 'shift 与参数校验',
      kind: 'recipe',
      alias: ['shift', '位置参数移位', '参数个数校验'],
      level: 2,
      syntax: 'shift [n]  |  [ $# -lt <最少个数> ] && { echo 用法; exit 1; }',
      summary: '把位置参数左移，用于逐个消费参数或跳过已解析的选项。',
      desc: '`shift` 把位置参数整体左移一位：`$2` 变成 `$1`、`$3` 变成 `$2`，`$#` 减 1。`shift n` 一次移 n 位。**`$0`（脚本名）不受影响**，它不属于位置参数。\n\n**三个高频用途**：\n① **逐个消费参数**：`while [ $# -gt 0 ]; do echo "处理 $1"; shift; done`；\n② **跳过已解析的选项**：`getopts` 解析完后必须 `shift $((OPTIND-1))`，才能用 `$1`、`$@` 访问剩余的业务参数（**漏写会导致参数错位**）；\n③ **实现"第一个参数是子命令"的结构**：`cmd=$1; shift; case "$cmd" in start|stop|restart) ... esac`，此时 `$@` 已经是子命令之后的参数。\n\n**参数校验的标准写法**（脚本开头必做）：\n```\nif [ $# -lt 2 ]; then\n  echo "用法: $0 <源目录> <目标目录>" >&2\n  exit 1\nfi\n```\n更进阶的校验还包括：目录是否存在（`[ -d "$1" ]`）、是否有写权限（`[ -w "$2" ]`）、是否为 root（`[ "$(id -u)" -ne 0 ]`）。\n\n**边界行为要留意**：参数已经为 0 时再 `shift` 会返回非 0（**在 `set -e` 下会导致脚本退出**），所以在循环里用 `shift` 要确保 `$#` 大于 0；`shift n` 中 n 超过 `$#` 同样失败。\n\n**参数转发**：`shift` 之后要把剩余参数原样传给别的命令，必须写 `"$@"`（带引号），否则含空格的参数会被拆开。',
      params: [
        { flag: 'shift', desc: '位置参数左移一位，`$#` 减 1' },
        { flag: 'shift n', desc: '一次左移 n 位' },
        { flag: '$#', desc: '参数个数，用于校验与循环条件' },
        { flag: 'shift $((OPTIND-1))', desc: 'getopts 解析完后跳过选项，**必写**' },
        { flag: '"$@"', desc: '剩余参数列表，转发时必须加引号' },
        { flag: '[ $# -lt N ]', desc: '参数个数校验，脚本开头的标准动作' }
      ],
      examples: [
        { cmd: 'while [ $# -gt 0 ]; do echo "处理参数: $1"; shift; done', desc: '逐个消费所有参数' },
        { cmd: 'if [ $# -lt 2 ]; then echo "用法: $0 <源目录> <目标目录>" >&2; exit 1; fi', desc: '参数个数校验，脚本开头的必备动作' },
        { cmd: 'cmd=$1; shift; case "$cmd" in start) echo "启动: $*" ;; stop) echo "停止: $*" ;; *) echo "未知子命令" ;; esac', desc: '子命令 + 参数的结构，shift 后 $@ 是子命令的参数' },
        { cmd: 'while getopts "f:v" opt; do case "$opt" in f) FILE=$OPTARG ;; v) VERBOSE=1 ;; esac; done; shift $((OPTIND-1)); echo "剩余参数: $*"', desc: 'getopts 后必须 shift 才能拿到非选项参数' },
        { cmd: 'print_all() { echo "共 $# 个参数"; }; print_all "$@"', desc: '转发参数时必须写 "$@"，保留含空格参数的完整性' }
      ],
      notes: [
        '**`shift` 在参数已为 0 时返回非 0**：`set -e` 下会直接终止脚本，循环里务必先判断 `[ $# -gt 0 ]`',
        '**`$0` 不受 shift 影响**：它始终是脚本名，别指望 shift 能跳过它',
        '**`getopts` 解析后忘写 `shift $((OPTIND-1))`** 会导致后续 `$1` 仍是选项，产生"参数莫名其妙不对"的 bug',
        '`shift n` 中 n 超过 `$#` 会失败并返回非 0，动态计算 n 时要先校验',
        'shift 之后原来的 `$1` 就永久丢失了，**需要保留原参数时请提前备份**（如 `ORIG_ARGS=("$@")`）',
        '转发剩余参数一定写 `"$@"`：写成 `$@` 或 `"$*"` 会在参数含空格时出错',
        '在函数内部 `shift` 只影响该函数自己的位置参数，不会动到脚本的参数'
      ],
      related: ['sh-getopts', 'sh-special-vars', 'sh-param-default', 'sh-set-euo-pipefail'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Bourne-Shell-Builtins.html',
      tags: ['位置参数', '参数校验', 'shift', '脚本规范']
    },

    /* ---------- 23 / 36 ---------- */
    {
      id: 'sh-mktemp',
      name: 'mktemp 与临时文件安全',
      kind: 'recipe',
      alias: ['mktemp', 'mktemp -d', '临时文件', '安全临时目录'],
      level: 3,
      syntax: 'mktemp [-d] [-p <目录>] [-t] [<模板>]  # 模板必须含至少 3 个 X',
      summary: '安全创建唯一命名的临时文件或目录，避免竞态与符号链接攻击。',
      desc: '**不要自己拼临时文件名**：`/tmp/myapp.$$` 这种基于 PID 的命名可预测，攻击者可以提前建好同名软链接，脚本（尤其以 root 运行）写入时就变成了往 `/etc/passwd` 之类的目标写数据——这是经典的**符号链接攻击**。`mktemp` 用 `O_EXCL` 原子创建 + 随机后缀，从根本上避免这个问题。\n\n**常用形式**：\n- `mktemp`：在 `$TMPDIR`（默认 `/tmp`）下创建随机名的文件，输出完整路径；\n- `mktemp -d`：创建临时**目录**，需要放多个文件时用；\n- `mktemp -p /data/tmp`：指定父目录（**跨文件系统时务必指定，否则可能因 `/tmp` 空间不足失败**）；\n- `mktemp -t myapp.XXXXXX`：加前缀便于识别（**模板必须含至少 3 个连续的 `X`**）；\n- `mktemp -u`：只生成名字不创建文件，**存在竞态，不要用于需要真正创建文件的场景**。\n\n**必须配套 `trap` 清理**：临时文件不会自动删除，脚本被中断就会残留。标准写法是创建后立即注册清理：\n```\ntmp=$(mktemp) || exit 1\ntrap "rm -f $tmp" EXIT\n```\n\n**其他注意点**：`/tmp` 常被挂载为 `tmpfs`（内存盘），**写大文件会消耗内存**，大文件请显式 `-p` 到数据盘；`TMPDIR` 环境变量可以改变默认位置；多个脚本共用 `/tmp` 时命名前缀能避免互相干扰；容器中 `/tmp` 可能是只读或容量很小，需要确认后使用。',
      params: [
        { flag: 'mktemp', desc: '创建唯一命名的临时文件并输出路径' },
        { flag: '-d', desc: '创建临时目录而非文件' },
        { flag: '-p <目录>', desc: '指定父目录，**跨文件系统或大文件时必须指定**' },
        { flag: '-t <模板>', desc: '在临时目录下按模板命名（**模板需含至少 3 个 X**）' },
        { flag: '--suffix=<后缀>', desc: '给临时文件加后缀，便于某些工具识别格式' },
        { flag: '-u', desc: '只生成名字不创建（**有竞态风险，慎用**）' },
        { flag: 'TMPDIR', desc: '环境变量，改变 mktemp 的默认父目录' }
      ],
      examples: [
        { cmd: 'tmp=$(mktemp) && trap "rm -f $tmp" EXIT && df -h > "$tmp" && wc -l < "$tmp"', desc: '安全创建临时文件并注册退出清理' },
        { cmd: 'workdir=$(mktemp -d -p /data/tmp) && trap "rm -rf $workdir" EXIT && echo "工作目录: $workdir"', desc: '创建临时目录（放数据盘），适合需要多个中间文件的场景' },
        { cmd: 'tmp=$(mktemp -p /data/tmp) && trap "rm -f $tmp" EXIT && dd if=/dev/zero of="$tmp" bs=1M count=100', desc: '大文件写到数据盘而不是内存盘 /tmp' },
        { cmd: 'tmp=$(mktemp -p /data/tmp) || { echo "创建临时文件失败" >&2; exit 1; }', desc: '对 mktemp 失败做处理（磁盘满或目录不可写时会失败）' },
        { cmd: 'df -h /tmp && mount | grep " /tmp "', desc: '确认 /tmp 的容量与是否挂载为 tmpfs，决定能否放大文件' }
      ],
      notes: [
        '**不要用 `$$` 或时间戳拼临时文件名**：名字可预测会导致符号链接攻击，尤其以 root 运行时会覆盖系统文件',
        '**`mktemp` 创建的临时文件不会自动删除**：必须配 `trap ... EXIT` 清理，否则脚本中断后 /tmp 会堆满垃圾',
        '**`mktemp -u` 只给名字不创建文件，存在竞态**：除非确实只想要名字，否则不要使用',
        '**模板必须含至少 3 个连续的 `X`**：写 `mktemp myapp.XX` 会报错',
        '**`/tmp` 可能是 tmpfs（内存盘）**：写几 GB 的文件会消耗内存并可能触发 OOM，大文件请用 `-p` 指定数据盘',
        '容器中的 `/tmp` 容量、权限与只读属性都可能与宿主机不同，批量脚本要处理创建失败的情况',
        '多个脚本共用临时目录时，用带前缀的模板（`mktemp -t myapp.XXXXXX`）便于排查残留文件来源',
        '清理逻辑要幂等：`rm -rf` 加 `-f`，避免清理时报错影响退出码'
      ],
      related: ['sh-trap', 'sh-set-euo-pipefail', 'sh-template-backup', 'sh-read'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html',
      tags: ['临时文件', '安全', '清理', '竞态']
    },

    /* ---------- 24 / 36 ---------- */
    {
      id: 'sh-read',
      name: 'read -r -p 交互输入',
      kind: 'recipe',
      alias: ['read', 'read -p', 'read -s', '读取输入'],
      level: 2,
      syntax: 'read [-r] [-p "提示"] [-s] [-n <字符数>] [-t <秒>] [-a <数组>] [变量名...]',
      summary: '从标准输入或用户交互读取一行内容，交互脚本与逐行处理的基础。',
      desc: '`read` 从标准输入读一行，按 `IFS` 切分后依次赋给变量：**最后一个变量会拿到剩余全部内容**（多余的分隔符不会被继续切分）。多余的输入留在缓冲区，下一次 `read` 会继续读——这是"循环读两行"看起来错位的原因。\n\n**必学参数**：\n- **`-r`**：禁止解释反斜杠（**几乎总是要加**，否则路径里的 `\\` 会被吃掉）；\n- **`-p "提示"`**：打印提示（仅交互式 shell 有效，脚本里更推荐显式 `echo -n`）；\n- **`-s`**：不回显，**输入密码必须加**；\n- **`-t <秒>`**：超时未输入返回非 0，**交互脚本防止永久等待的关键参数**；\n- **`-n <数量>`**：读够 N 个字符就返回，用于"按任意键继续"；\n- **`-a <数组>`**：把整行按 IFS 切分存进数组。\n\n**判断输入结束**：`read` 在遇到 EOF（Ctrl+D）时返回非 0，所以 `while read -r line; do ...; done < file` 能自动结束循环；脚本里也要据此判断"用户是否按了 Ctrl+D"。\n\n**逐行读文件的标准写法**：`while IFS= read -r line; do ...; done < file`。`IFS=` 保留行首尾空白、`-r` 保留反斜杠。**注意文件最后一行若没有换行符会被漏读**，需要补 `|| [ -n "$line" ]`。\n\n**管道陷阱**：`cat file | while read -r line` 中的循环在子 shell 里，循环内修改的变量在循环外读不到，应改用输入重定向。',
      params: [
        { flag: '-r', desc: '禁止解释反斜杠，**处理路径与配置时必加**' },
        { flag: '-p "提示"', desc: '打印提示信息（交互式 shell）' },
        { flag: '-s', desc: '静默模式不回显，**输入密码必用**' },
        { flag: '-t <秒>', desc: '超时未输入则返回非 0，防止脚本永久等待' },
        { flag: '-n <数量>', desc: '读够指定字符数就返回，可实现"按任意键继续"' },
        { flag: '-a <数组>', desc: '把输入按分隔符存入数组' },
        { flag: 'IFS= read -r', desc: '逐行读取时不裁剪空白、不解释反斜杠的完整写法' }
      ],
      examples: [
        { cmd: 'read -r -p "请输入目标主机 IP: " host && echo "将操作 $host"', desc: '带提示读取用户输入' },
        { cmd: 'read -r -s -p "请输入数据库密码: " dbpass && echo && echo "已接收 ${#dbpass} 位密码"', desc: '读取密码时不回显（`echo` 换行是必要的，否则后续输出会接在提示后面）' },
        { cmd: 'read -r -t 10 -p "10 秒内确认继续执行? [y/N] " ans; case "$ans" in [Yy]*) echo "继续" ;; *) echo "已取消" ;; esac', desc: '带超时的确认，无人值守时自动走取消分支' },
        { cmd: 'while IFS= read -r line; do echo "处理: $line"; done < hosts.txt', desc: '逐行读文件的安全写法' },
        { cmd: 'while IFS= read -r line || [ -n "$line" ]; do echo "$line"; done < /tmp/no-newline.txt', desc: '处理最后一行没有换行符的文件' },
        { cmd: 'read -r -a parts <<< "nginx 80 running" && echo "服务 ${parts[0]} 端口 ${parts[1]}"', desc: '把一行拆进数组，取用更灵活' },
        { cmd: 'read -r -n 1 -s -p "按任意键继续..." && echo "继续执行"', desc: '实现"按任意键继续"的交互效果' }
      ],
      notes: [
        '**`read` 几乎总要加 `-r`**：不加时输入里的反斜杠会被当作转义符吃掉，处理 Windows 路径与正则时必出问题',
        '**逐行读文件用 `IFS= read -r`**：只写 `read line` 会裁剪行首尾空白并处理反斜杠，解析配置时容易出错',
        '**管道中的 `while read` 在子 shell 执行**：循环内变量修改在循环外读不到，改用 `done < file` 或进程替换',
        '**文件最后一行没有换行符会被漏读**：用 `|| [ -n "$line" ]` 兜底',
        '**交互脚本必须加 `-t` 超时**：否则在无人值守环境（cron、CI）里会永久挂住',
        '`-s` 读密码后记得补一个 `echo` 换行，否则后续输出会接在提示行后面',
        '**不要把密码通过 `read` 存进变量后写进日志或 `ps` 可见的地方**：需要传递时用环境变量或文件描述符，且注意 `set -x` 会把它打印出来',
        '`read` 的返回值表示"是否成功读到内容"，EOF 时返回非 0，这个特性正是 `while read` 能自动结束的原因'
      ],
      related: ['sh-while-until', 'sh-devnull-devtcp', 'sh-mktemp', 'sh-trap'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html',
      tags: ['交互输入', '逐行读取', '超时', '密码']
    },

    /* ---------- 25 / 36 ---------- */
    {
      id: 'sh-log-error',
      name: '错误处理与日志函数',
      kind: 'recipe',
      alias: ['日志函数', 'log 函数', 'die 函数', '错误处理'],
      level: 3,
      syntax: 'log() { echo "[$(date +%F\\ %T)] $*" | tee -a "$LOG"; }  |  die() { echo "错误: $*" >&2; exit 1; }',
      summary: '封装统一的日志与错误处理函数，让脚本输出规范且便于排障。',
      desc: '没有统一封装的脚本，日志格式五花八门，出问题时既不好 grep 也不好对接日志平台。**一套最小可用的日志函数只需四个**：\n\n```\nLOG=/var/log/myapp/script.log\nlog()  { echo "[$(date "+%F %T")] [INFO]  $*" | tee -a "$LOG"; }\nwarn() { echo "[$(date "+%F %T")] [WARN]  $*" | tee -a "$LOG" >&2; }\nerr()  { echo "[$(date "+%F %T")] [ERROR] $*" | tee -a "$LOG" >&2; }\ndie()  { err "$*"; exit 1; }\n```\n\n**几个关键设计点**：\n① **错误信息写 stderr**（`>&2`）：这样正常输出仍可被管道或 `$(...)` 捕获，而错误能立刻显示在终端，也符合 Unix 惯例；\n② **日志带时间戳与级别**：便于按时间对齐多个服务、也便于日志平台解析；\n③ **`die` 统一"记录 + 退出"**：比到处写 `echo` + `exit 1` 更不容易漏；\n④ **函数内的额外提示写到 stderr**：否则会污染 `result=$(func)` 的结果（见 `sh-function`）。\n\n**与严格模式的配合**：`set -Eeuo pipefail` 加 `trap \'err "第 $LINENO 行执行失败: $BASH_COMMAND"\' ERR`，可以在任何未处理的失败处自动打印出错位置，比逐条判断省事得多。\n\n**日志落盘的两个实务问题**：① **日志目录要先创建**（`mkdir -p "$(dirname "$LOG")"`），否则第一条日志就失败；② **日志必须轮转**，用 `logrotate` 管理，否则长期运行的脚本会把磁盘写满。用 `tee -a` 会同时输出到屏幕与文件，配合 `exec > >(tee -a "$LOG") 2>&1` 可以让整个脚本的输出都被记录。',
      params: [
        { flag: 'log() { ...; }', desc: '信息级日志函数，带时间戳与级别' },
        { flag: 'err() { ... >&2; }', desc: '错误级日志，**必须写 stderr**' },
        { flag: 'die() { err "$*"; exit 1; }', desc: '记录错误并退出，标准错误出口' },
        { flag: 'tee -a "$LOG"', desc: '同时输出到屏幕与日志文件（追加模式）' },
        { flag: '>&2', desc: '把输出重定向到标准错误，不污染正常输出' },
        { flag: '$LINENO / $BASH_COMMAND', desc: '在 ERR trap 中定位出错行与命令' },
        { flag: 'mkdir -p "$(dirname "$LOG")"', desc: '确保日志目录存在，否则第一条日志就写不进去' }
      ],
      examples: [
        { cmd: 'LOG=/tmp/myapp.log; log() { echo "[$(date "+%F %T")] [INFO] $*" | tee -a "$LOG"; }; log "脚本开始执行"', desc: '最小可用的日志函数：带时间戳并同时输出到屏幕与文件' },
        { cmd: 'die() { echo "[$(date "+%F %T")] [ERROR] $*" >&2; exit 1; }; [ -f /etc/myapp/app.conf ] || die "配置文件不存在: /etc/myapp/app.conf"', desc: '错误处理函数：写 stderr 并退出' },
        { cmd: 'set -Eeuo pipefail; trap \'echo "[$(date "+%F %T")] [ERROR] 第 $LINENO 行失败: $BASH_COMMAND" >&2\' ERR', desc: '与严格模式配合的统一错误捕获' },
        { cmd: 'LOG=/var/log/myapp/deploy.log; mkdir -p "$(dirname "$LOG")" && exec >> "$LOG" 2>&1 && echo "部署开始 $(date "+%F %T")"', desc: '脚本开场把全部输出写入日志，含目录自动创建' },
        { cmd: 'count=$(grep -c ERROR /var/log/app.log 2>/dev/null || echo 0); echo "错误数: $count" >&2; echo "$count"', desc: '函数内提示写 stderr，保证命令替换拿到干净结果' }
      ],
      notes: [
        '**错误与提示信息必须写 stderr（`>&2`）**：否则 `result=$(func)` 会把日志混进结果里，这是最难查的一类 bug',
        '**日志目录要先 `mkdir -p`**：目录不存在时第一条日志就失败，而日志函数本身失败往往又被忽略，导致"什么都没记录"',
        '**日志必须轮转**：长期运行的脚本会持续追加，务必用 `logrotate` 或在脚本里做大小检查，否则会写满磁盘',
        '**不要在日志里打印密码、AK/SK、Token**：脚本日志常被集中收集，属于凭据泄露高发点；需要排查时打印前几位加掩码',
        '`tee -a` 会同时占用屏幕输出，定时任务里建议直接 `>>` 到文件，避免产生无用的邮件通知',
        '`die` 里用 `exit 1` 而不是 `return`：确保在任何位置调用都能终止脚本；在函数中若只想返回错误请单独写 `return 1`',
        '多个脚本共用日志文件时，写入可能交错，建议每个脚本独立日志文件或接入统一日志采集'
      ],
      related: ['sh-function', 'sh-set-euo-pipefail', 'sh-trap', 'sh-tee-exec'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Shell-Functions.html',
      tags: ['日志', '错误处理', '函数封装', '规范']
    },

    /* ---------- 26 / 36 ---------- */
    {
      id: 'sh-debug',
      name: 'bash -x / set -x 调试',
      kind: 'recipe',
      alias: ['bash -x', 'set -x', '脚本调试', 'shellcheck', 'bash -n'],
      level: 3,
      syntax: 'bash -x <脚本>  |  bash -n <脚本>  |  set -x / set +x  |  PS4=\'+ $LINENO: \' | shellcheck <脚本>',
      summary: '打开执行跟踪看清脚本每一步做了什么，定位"为什么不进这个分支"。',
      desc: 'Shell 脚本没有断点调试器，但有几种非常有效的替代手段，**按排查成本从低到高排列**：\n\n**① `bash -n <脚本>`**：只做语法检查不执行，改写完脚本先跑一次，能在动手前发现括号/引号/`fi` 缺失这类低级问题（相当于 `node --check`）。\n\n**② `bash -x <脚本>` / `set -x`**：打印每条实际执行的命令（**变量已展开后的样子**），是排查"变量值不对""条件为什么判 false"的最快手段。配合自定义提示符 `PS4=\'+ $LINENO: \'` 能显示行号，定位几乎是一瞬间的事。在脚本里可以用 `set -x` / `set +x` 只包围可疑片段，避免输出刷屏。\n\n**③ `trap ... DEBUG`**：在每条命令执行前触发，可以打印行号与命令，做精细跟踪。\n\n**④ `shellcheck <脚本>`**：静态分析工具，能抓出未加引号的变量、`[ ]` 与 `[[ ]]` 混用、`for f in $(ls)`、未定义变量、常见逻辑错误等**几十类问题**。**这是投入产出比最高的工具**：写完脚本先跑一遍 shellcheck，很多 bug 不用运行就能发现（安装：CentOS 用 `yum install ShellCheck`，Ubuntu 用 `apt install shellcheck`）。\n\n**调试的实用技巧**：在可疑处插入 `echo "DEBUG: var=$var" >&2`（**写 stderr 以免污染输出**）；`set -e` 场景下想知道哪一行退出，用 `set -x` 或 `trap \'echo 第 $LINENO 行\' ERR`；对比"预期命令"与"实际命令"的最快方式是 `echo` 出拼接好的命令行。\n\n**安全警告**：`set -x` 会把**变量展开后的真实值**打印出来，密码、AK/SK、Token 会直接进终端与日志。**生产脚本严禁常开 `-x`**，调试完必须关闭。',
      params: [
        { flag: 'bash -n <脚本>', desc: '只做语法检查不执行，**改完脚本先跑这个**' },
        { flag: 'bash -x <脚本>', desc: '执行并打印每条命令（变量已展开）' },
        { flag: 'set -x / set +x', desc: '在脚本内开关跟踪，可只包围可疑片段' },
        { flag: "PS4='+ $LINENO: '", desc: '自定义跟踪提示符，加行号后定位极快' },
        { flag: "trap '...' DEBUG", desc: '每条命令执行前触发，做精细跟踪' },
        { flag: 'shellcheck <脚本>', desc: '静态分析，抓出几十类常见错误，**强烈推荐**' },
        { flag: 'echo "DEBUG: x=$x" >&2', desc: '手工插桩，写 stderr 避免污染正常输出' }
      ],
      examples: [
        { cmd: 'bash -n /opt/scripts/backup.sh && echo "语法检查通过"', desc: '只检查语法不执行，改完脚本的第一步' },
        { cmd: 'bash -x /opt/scripts/backup.sh /data/app /data/backup 2>/tmp/debug.log', desc: '带跟踪执行并把调试输出单独落文件' },
        { cmd: 'PS4=\'+ $LINENO: \'; set -x; host=10.0.1.23; ping -c 1 "$host"; set +x', desc: '自定义提示符带行号，只跟踪可疑片段' },
        { cmd: 'shellcheck /opt/scripts/backup.sh', desc: '静态分析脚本，抓出引号、变量、逻辑类问题' },
        { cmd: "set -Eeuo pipefail; trap 'echo \"失败于第 $LINENO 行: $BASH_COMMAND\" >&2' ERR", desc: '不用 -x 也能定位失败位置的低成本方案' },
        { cmd: 'bash -x /opt/scripts/deploy.sh 2>&1 | grep -n "curl" | head -5', desc: '从跟踪输出里筛出关心的命令' }
      ],
      notes: [
        '**`set -x` 会打印变量展开后的真实值**：密码、AK/SK、Token 会直接进入终端与日志，**生产脚本严禁常开**',
        '**`bash -x` 输出量非常大**：长脚本建议配合 `2>/tmp/debug.log` 落文件后 grep，或只用 `set -x` 包围可疑片段',
        '`bash -n` 只检查语法，**不检查变量名拼错、命令不存在**这类运行期问题，静态问题请用 `shellcheck`',
        '`set -x` 的输出默认走 stderr，因此 `bash -x script.sh > out.log` 时跟踪信息不会进 out.log，需要 `2>&1` 才合并',
        '**`shellcheck` 的告警要逐条判断**：少数场景（如故意依赖分词）需要加 `# shellcheck disable=SC2086` 注释豁免，但别滥用',
        '调试 `set -e` 相关问题时，先用 `set +e` 观察完整执行流程，定位后再恢复严格模式',
        '**调试完记得删除临时插桩的 echo 与 `set -x`**：遗留的调试输出会污染日志、也可能泄露敏感值'
      ],
      related: ['sh-set-euo-pipefail', 'sh-log-error', 'sh-trap', 'sh-function'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html',
      tags: ['调试', 'shellcheck', 'set -x', '排障']
    },

    /* ================= E. 进程与定时 ================= */

    /* ---------- 27 / 36 ---------- */
    {
      id: 'sh-background',
      name: 'nohup / & / disown / setsid',
      alias: ['nohup', '后台运行', 'disown', 'setsid'],
      level: 3,
      syntax: 'nohup <命令> > <日志> 2>&1 &  |  命令 &  |  disown -h %1  |  setsid <命令> &',
      summary: '让任务脱离终端在后台长期运行，四种方式适用场景各不相同。',
      desc: '**四种方式的区别是"脱离了什么"**：\n\n**`&`**：把命令放到后台执行，但**仍然是当前 shell 的子进程，且共享终端**。终端关闭（SSH 断开）时收到 SIGHUP，进程多半会死。只适合临时并行跑几个任务。\n\n**`nohup`**：让命令**忽略 SIGHUP**，终端断开也能继续跑。注意它**只处理 SIGHUP 这一个信号**，标准输出默认重定向到 `nohup.out`（在工作目录或 `$HOME`），实践中一律显式重定向：`nohup ./app.sh > /var/log/app.log 2>&1 &`。\n\n**`disown`**：把一个**已经在后台运行**的作业从 shell 的作业表中移除，这样 shell 退出时不会向它发 SIGHUP。用法是 `./app.sh &` 然后 `disown -h %1`（`-h` 表示仍保留在作业表中但不接收 SIGHUP）。它解决的是"忘了加 nohup"的补救场景。\n\n**`setsid`**：让命令**在全新的会话（session）中运行**，彻底脱离当前终端。即使终端关闭、父进程退出，它也不受影响——**这是四种方式里脱离最彻底的一种**。`setsid ./app.sh > /var/log/app.log 2>&1 &` 可以放心退出 SSH。\n\n**怎么选**：临时并行用 `&`；简单后台常驻用 `nohup ... &`；忘了 nohup 用 `disown`；需要彻底脱离终端（尤其是从脚本里启动长期任务）用 `setsid`；**真正长期运行的服务请用 systemd 封装**（见 `sh-systemd-wrapper`），它会处理开机自启、崩溃重启和日志收集，比这四个都可靠。\n\n**查看与收尾**：`jobs -l` 看当前 shell 的后台作业，`ps -ef | grep <关键词>` 找进程，`kill <PID>` 结束；后台任务的标准输出如果没有重定向，可能因终端缓冲区满而阻塞。',
      params: [
        { flag: '&', desc: '放到后台执行，**仍然绑定当前终端，SSH 断开可能被杀**' },
        { flag: 'nohup <命令> &', desc: '忽略 SIGHUP，终端断开可继续运行' },
        { flag: '> <日志> 2>&1', desc: '显式重定向输出，否则 nohup 会写到 nohup.out' },
        { flag: 'disown -h %1', desc: '把已在后台的作业从 shell 作业表移除，避免收到 SIGHUP' },
        { flag: 'setsid <命令> &', desc: '在新会话中运行，**脱离终端最彻底**' },
        { flag: 'jobs -l', desc: '查看当前 shell 的后台作业及其 PID' },
        { flag: 'kill <PID> / kill -9', desc: '结束进程；`-9` 无法被捕获，仅在无响应时使用' }
      ],
      examples: [
        { cmd: 'nohup /opt/myapp/start.sh > /var/log/myapp/start.log 2>&1 & echo "已启动 PID: $!"', desc: '后台启动并显式重定向日志，记录的 PID 便于后续管理' },
        { cmd: 'setsid /opt/myapp/batch.sh > /var/log/myapp/batch.log 2>&1 & echo "已在新会话启动: $!"', desc: '彻底脱离终端启动长期任务，退出 SSH 也不受影响' },
        { cmd: '/opt/myapp/long-task.sh & disown -h %1', desc: '已经启动才发现忘了 nohup 时的补救办法' },
        { cmd: 'jobs -l && ps -ef | grep -v grep | grep myapp', desc: '查看后台作业与进程实际状态' },
        { cmd: 'for i in 1 2 3 4; do (curl -s "http://10.0.1.2$i/health" > /tmp/h$i.log 2>&1 &); done; wait', desc: '并行跑多个任务并等待全部完成' }
      ],
      notes: [
        '**只用 `&` 的进程在 SSH 断开时多半会被杀掉**：因为终端关闭会向会话内的进程发 SIGHUP，长期任务必须用 `nohup` 或 `setsid`',
        '**`nohup` 不加输出重定向会写到 `nohup.out`**：可能在当前目录堆积大文件，务必显式 `> 日志 2>&1`',
        '**`nohup` 只忽略 SIGHUP**：`kill` 或系统 OOM 依然能杀掉它，它不是"守护进程"工具',
        '**后台任务的 `$!` 要立刻存下来**：不记录 PID 后续想停任务就只能靠 `ps` 找，容易误杀同名进程',
        '**网络文件系统与容器场景要注意**：容器主进程退出后容器就结束，`nohup` 出来的后台进程也随之消失',
        '真正需要"开机自启 + 崩溃自动重启 + 日志收集"的长期服务，**请用 systemd 封装而不是 nohup**',
        '用管道或重定向把后台任务输出接到终端时，终端缓冲区满会导致进程阻塞——这也是必须重定向到文件的原因'
      ],
      related: ['sh-systemd-wrapper', 'sh-screen-tmux', 'sh-wait', 'lu-systemctl'],
      docs: 'https://man7.org/linux/man-pages/man1/nohup.1.html',
      tags: ['后台运行', 'nohup', 'setsid', '会话']
    },

    /* ---------- 28 / 36 ---------- */
    {
      id: 'sh-screen-tmux',
      name: 'screen / tmux 会话保持',
      kind: 'recipe',
      alias: ['screen', 'tmux', '会话保持', '断线不中断'],
      level: 2,
      syntax: 'tmux new -s <名称> | tmux ls | tmux attach -t <名称> | screen -S <名称> | screen -ls | screen -r <名称>',
      summary: '在可重连的会话里跑长任务，SSH 断线也不会中断执行。',
      desc: '`nohup` 解决了"进程不被杀"，但你看不到它的实时输出、也没法中途交互；**会话工具解决了这个痛点**：任务在服务端的会话里运行，你随时可以"贴"回去继续操作。**做任何长时间操作（大文件传输、数据库导入、内核升级、镜像转换）前，先开一个会话是最重要的运维习惯**。\n\n**tmux 常用操作**（前缀键默认 `Ctrl+B`）：\n- `tmux new -s deploy` 新建命名会话；\n- `Ctrl+B` 然后 `D` 脱离（detach），任务继续运行；\n- `tmux ls` 列出会话，`tmux attach -t deploy` 重新接入；\n- `tmux kill-session -t deploy` 结束会话；\n- 分屏：`Ctrl+B` `%`（左右）、`Ctrl+B` `"`（上下）；\n- **滚动查看历史**：`Ctrl+B` `[` 进入复制模式，方向键/PageUp 翻页，`q` 退出——这是新手最常问的问题。\n\n**screen 常用操作**（前缀键 `Ctrl+A`）：`screen -S work` 新建、`Ctrl+A` `D` 脱离、`screen -ls` 列表、`screen -r work` 接入、`screen -d -r work` 强制从别处接管（会话被占用时用）、`exit` 结束。\n\n**两者的选择**：tmux 功能更强（分屏、可配置、脚本化好），screen 更老更轻、几乎所有系统都有。**新环境优先 tmux，老系统或最小化安装用 screen**。\n\n**脚本化用法**：`tmux new -d -s deploy \'bash /opt/deploy.sh\'` 可以非交互地创建会话并执行命令，适合从 CI 或跳板机发起长任务。',
      params: [
        { flag: 'tmux new -s <名称>', desc: '新建命名会话，**做长任务前先开一个**' },
        { flag: 'tmux ls / tmux attach -t <名称>', desc: '列出会话 / 重新接入会话' },
        { flag: 'Ctrl+B 然后 D', desc: 'tmux 脱离会话（任务继续运行）' },
        { flag: 'Ctrl+B 然后 [', desc: 'tmux 进入滚动查看模式，`q` 退出' },
        { flag: 'screen -S / -ls / -r', desc: 'screen 的新建 / 列表 / 接入' },
        { flag: 'Ctrl+A 然后 D', desc: 'screen 脱离会话' },
        { flag: 'screen -d -r <名称>', desc: '强制接管被占用的会话（如断线后残留）' },
        { flag: 'tmux new -d -s <名称> \'<命令>\'', desc: '后台创建会话并执行命令，脚本化用法' }
      ],
      examples: [
        { cmd: 'tmux new -s deploy', desc: '新建名为 deploy 的会话，进入后执行长任务' },
        { cmd: 'tmux ls', desc: '列出所有会话（SSH 断线重连后先执行这条）' },
        { cmd: 'tmux attach -t deploy', desc: '重新接入 deploy 会话，接着看任务输出' },
        { cmd: 'tmux new -d -s convert \'qemu-img convert -p -O qcow2 /data/a.raw /data/a.qcow2\'', desc: '后台会话中执行镜像转换，断开也不影响' },
        { cmd: 'screen -S dbload && screen -ls && screen -r dbload', desc: 'screen 的完整流程：新建、列表、接入' },
        { cmd: 'screen -d -r dbload', desc: '会话显示被占用时强制接管（常见于断线残留）' }
      ],
      notes: [
        '**做长任务前先开会话，是最便宜的风险控制**：内核升级、大文件传输、数据库导入被 SSH 断线打断的代价往往很高',
        '**`Ctrl+B` `D` 是脱离，`exit` 是结束会话**：脱离后任务继续跑，误用 `exit` 会把任务一起结束',
        '滚动历史是 `Ctrl+B` 然后 `[`，`q` 退出，不是鼠标滚轮；这条不会用会以为"输出丢了"',
        'SSH 断线后会话仍存在，重连后用 `tmux ls` / `screen -ls` 找回；screen 显示 Attached 时用 `screen -d -r` 接管',
        '**服务器重启会丢失所有会话**：会话保持不等于持久化，需要开机自启请用 systemd',
        '不要在一个会话里塞太多任务，分屏或建多个命名会话更清晰（如 `deploy`、`logs`、`debug`）',
        '容器里通常没有 tmux/screen，需要额外安装；容器的最佳实践是前台运行主进程而不是会话保持'
      ],
      related: ['sh-background', 'sh-systemd-wrapper', 'sh-timeout', 'ln-ssh-tunnel'],
      docs: 'https://github.com/tmux/tmux/wiki',
      tags: ['会话保持', 'tmux', 'screen', '长任务']
    },

    /* ---------- 29 / 36 ---------- */
    {
      id: 'sh-wait',
      name: 'wait 与并发控制',
      kind: 'recipe',
      alias: ['wait', '并发执行', '等待后台任务'],
      level: 3,
      syntax: 'wait [<PID或作业号>]  |  wait -n  |  命令 & 命令 & wait',
      summary: '等待后台任务结束并收集退出码，是 Shell 里实现并发的核心。',
      desc: 'Shell 没有线程，但有进程：**"后台启动多个任务 + `wait` 等它们全部结束"就是最朴素的并发模型**。相比一条条串行执行，把 100 台主机的检查并行跑能把耗时从几分钟压到几秒。\n\n**基本用法**：\n- `wait`：等待**所有**后台子进程结束；\n- `wait <PID>`：等待指定进程；\n- `wait %1`：等待指定作业号（配合 `jobs` 使用）；\n- `wait -n`：等待**任意一个**任务结束就返回（Bash 4.3+），适合"维持固定并发数"的调度。\n\n**收集退出码**：`wait <PID>` 的返回值就是那个进程的退出码，所以可以判断某个并行任务是否成功。若只写一个 `wait`（等全部），返回值是最后被等待的那个进程的状态——**要区分每个任务的成败，必须逐个 `wait $pid` 并把结果记下来**。\n\n**控制并发数的标准骨架**（避免一次起几百个进程打爆机器）：\n```\nMAX=10\nfor h in "${HOSTS[@]}"; do\n  ( check "$h" ) &\n  while [ "$(jobs -rp | wc -l)" -ge "$MAX" ]; do sleep 0.2; done\ndone\nwait\n```\n更简洁的现代写法是用 `xargs -P <并发数>`（见 `lb-xargs`）或 `parallel`，**能用 xargs 的优先用 xargs**，它更短也更快。\n\n**注意**：`wait` 只能等待**当前 shell 的子进程**，`$(...)` 或管道里的进程不属于它；后台任务的标准输出若未重定向，多个任务会交错输出，建议每个任务写到独立文件再汇总。',
      params: [
        { flag: 'wait', desc: '等待所有后台子进程结束' },
        { flag: 'wait <PID>', desc: '等待指定进程，返回它的退出码' },
        { flag: 'wait %1', desc: '按作业号等待（配合 `jobs` 查看）' },
        { flag: 'wait -n', desc: '等待任意一个任务结束就返回（Bash 4.3+）' },
        { flag: 'jobs -rp', desc: '列出运行中的后台任务 PID，用于统计并发数' },
        { flag: 'xargs -P <并发>', desc: '更简洁的并发方案，**推荐优先使用**' }
      ],
      examples: [
        { cmd: 'for i in 1 2 3; do (sleep $i; echo "任务 $i 完成") & done; wait; echo "全部完成"', desc: '并发执行多个任务并等待全部结束' },
        { cmd: 'for h in 10.0.1.21 10.0.1.22 10.0.1.23; do (ping -c 1 -W 1 "$h" >/dev/null && echo "$h 可达" || echo "$h 不可达") & done; wait', desc: '并行探测多台主机，比串行快数倍' },
        { cmd: 'MAX=5; for h in $(seq 1 20); do (sleep 1; echo "处理 $h") & while [ "$(jobs -rp | wc -l)" -ge "$MAX" ]; do sleep 0.2; done; done; wait', desc: '控制最大并发数为 5，避免一次起太多进程' },
        { cmd: 'pids=(); for h in 10.0.1.21 10.0.1.22; do (check_host "$h") & pids+=($!); done; for p in "${pids[@]}"; do wait "$p" || echo "PID $p 的任务失败"; done', desc: '逐个 wait 并收集每个任务的退出码' },
        { cmd: 'seq 1 20 | xargs -P 5 -I{} sh -c "sleep 1; echo 处理 {}"', desc: '用 xargs -P 实现并发，比手写 wait 更简洁' }
      ],
      notes: [
        '**`wait` 只能等当前 shell 自己的子进程**：命令替换 `$(...)`、管道、`setsid` 脱离出去的进程都不在其管理范围',
        '**只写一个 `wait` 时返回值是最后等待的进程状态**：要判断每个任务的成败必须逐个 `wait $pid`',
        '**并发数必须限制**：不加控制地启动几百个 `ssh` 或 `curl` 会耗尽本机资源、也可能触发对端的连接限制',
        '**后台任务的输出会交错**：每个任务应重定向到独立文件，最后再合并汇总',
        '`wait` 在 `set -e` 下要注意：若被等待进程返回非 0，可能触发脚本退出，需要显式处理（如 `wait "$p" || true`）',
        '`jobs` 只在**当前 shell** 中有效，脚本里新起的子 shell 看不到父 shell 的作业表',
        '**能用 `xargs -P` 或 `parallel` 的场景优先用它们**：并发控制更简单，代码更短，出错处理也更清晰'
      ],
      related: ['sh-background', 'sh-for', 'sh-special-vars', 'lb-xargs'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/Job-Control.html',
      tags: ['并发', 'wait', '后台任务', '作业控制']
    },

    /* ---------- 30 / 36 ---------- */
    {
      id: 'sh-timeout',
      name: 'timeout',
      alias: ['timeout 命令', '命令超时', '带超时执行'],
      level: 2,
      syntax: 'timeout [选项] <时长> <命令> [参数...]  |  timeout -s KILL 5 <命令>',
      summary: '给命令加执行时间上限，避免卡死的操作把整个脚本拖住。',
      desc: '脚本里调用外部命令（`ssh`、`curl`、`ping`、挂载网络存储）时，如果对端无响应，命令可能挂几分钟甚至永久阻塞，进而让 cron 任务堆积、监控误报。`timeout` 就是给这类命令加上"到时即杀"的保险。\n\n**关键参数**：\n- `<时长>`：支持 `5`（秒）、`30s`、`5m`、`1h`；\n- **`-s <信号>`**：指定超时后发送的信号，默认 `TERM`（SIGTERM）；对不服软的进程用 `-s KILL`；\n- **`-k <时长>`**：发完 TERM 后再等多久发 KILL（"先礼后兵"），如 `timeout -k 5 30 cmd` 表示 30 秒后发 TERM、再等 5 秒发 KILL；\n- **`--preserve-status`**：超时后返回命令自身的退出码，而不是 timeout 的 124。\n\n**判读退出码**：**`124` 表示超时**（这是最需要记住的一个），`125` 表示 timeout 自身出错，`126` 表示命令不可执行，`127` 表示命令不存在，其余为被调用命令的退出码。脚本里据此判断"是超时还是命令本身失败"。\n\n**典型场景**：\n- `timeout 5 ssh -o BatchMode=yes host uptime`：批量巡检时防止某台机器卡住整个循环；\n- `timeout 3 bash -c \'echo > /dev/tcp/10.0.1.23/3306\'`：端口探测必须带超时；\n- `timeout 600 tar -czf backup.tar.gz /data`：给备份加时间上限，超时就告警；\n- `timeout -k 5 30 systemctl restart nginx`：给服务重启加保险。\n\n**注意**：`timeout` 只能杀掉**它直接启动的进程**；如果命令内部又 fork 了子进程，需要用 `--foreground` 或把命令包在 `bash -c` 中配合进程组处理，否则可能留下孤儿进程。',
      params: [
        { flag: '<时长>', desc: '支持 `5`（秒）、`30s`、`5m`、`1h` 等格式' },
        { flag: '-s <信号>', desc: '超时后发送的信号，默认 TERM，顽固进程用 KILL' },
        { flag: '-k <时长>', desc: '发送 TERM 后再等多久发 KILL（先礼后兵）' },
        { flag: '--preserve-status', desc: '超时后返回命令自身的退出码而不是 124' },
        { flag: '--foreground', desc: '前台模式运行，便于交互式命令与信号传递' },
        { flag: '退出码 124', desc: '**表示超时发生**，脚本里据此区分超时与命令失败' }
      ],
      examples: [
        { cmd: 'timeout 5 ssh -o BatchMode=yes -o ConnectTimeout=3 10.0.1.23 uptime || echo "连接超时或失败"', desc: '批量巡检时给 SSH 加超时，避免单台卡住整个循环' },
        { cmd: 'timeout 3 bash -c "echo > /dev/tcp/10.0.1.23/3306" 2>/dev/null && echo "端口可达" || echo "不可达或超时"', desc: '端口探测必须加超时' },
        { cmd: 'timeout -k 5 30 systemctl restart nginx; rc=$?; [ "$rc" = 124 ] && echo "重启超时，需要人工介入"', desc: '给服务重启加保险并识别超时' },
        { cmd: 'timeout 600 tar -czf /data/backup/app.tar.gz /data/app; [ $? = 124 ] && echo "备份超时告警" >&2', desc: '给备份任务加时间上限并在超时时告警' },
        /* 卡死的任务用 `-s KILL` 强杀。这里用 `sleep 9999` 充当"卡住不动的进程"
           （真机上就是一个不响应 TERM 的脚本，例如 /data/app/stubborn-task.sh ——
           教学终端不执行脚本文件，所以换成等价的常驻进程来演示同一件事）。 */
        { cmd: 'timeout -s KILL 10 sleep 9999; echo "退出码 $?（124 = 已按超时强杀）"', desc: '对不服 TERM 的进程直接发 KILL（SIGKILL 无法被捕获，进程没有清理机会）' }
      ],
      notes: [
        '**超时的退出码是 124**：脚本里必须区分"超时"与"命令自身失败"，两者处理方式完全不同（超时通常要告警）',
        '**`timeout` 只杀掉它直接启动的进程**：命令内部 fork 的子进程可能变成孤儿，复杂命令建议用 `--foreground` 或包在 `bash -c` 里',
        '**默认发 SIGTERM 可能被忽略**：某些程序会捕获 TERM 做清理，若一直不退出要加 `-k` 或改成 `-s KILL`',
        '**超时时间不要设得太短**：正常业务被误杀会造成故障，取值应基于实测的 P99 耗时再留余量',
        '`timeout` 是 coreutils 的一部分，几乎所有 Linux 都有；但 **busybox 的精简版可能不支持 `-k`、`--preserve-status`**，容器里要注意',
        '给 `ssh` 加超时最好同时用 `-o ConnectTimeout=` 与 `-o BatchMode=yes`，前者管建连、后者避免卡在密码提示',
        '在 `set -e` 脚本里 `timeout` 返回 124 会导致脚本退出，需要用 `|| true` 或显式判断来处理'
      ],
      related: ['sh-while-until', 'sh-read', 'sh-for', 'ln-ssh'],
      docs: 'https://man7.org/linux/man-pages/man1/timeout.1.html',
      tags: ['超时', '健壮性', '批量巡检', '退出码']
    },

    /* ---------- 31 / 36 ---------- */
    {
      id: 'sh-systemd-wrapper',
      name: '脚本自启动与 systemd 封装',
      kind: 'recipe',
      alias: ['systemd unit', '脚本开机自启', 'systemctl 封装脚本'],
      level: 3,
      syntax: '/etc/systemd/system/<名称>.service  # [Unit]/[Service]/[Install] 三段\nsystemctl daemon-reload && systemctl enable --now <名称>',
      summary: '把 Shell 脚本包装成 systemd 服务，获得开机自启与崩溃自动重启。',
      desc: '用 `nohup` 跑脚本只能"活着"，但机器重启后就没了、崩溃了也没人拉起。**把脚本封装成 systemd 服务是运维脚本的终点形态**，它一次解决四个问题：开机自启、崩溃自动重启、日志统一进 journald、启停用标准命令管理。\n\n**最小可用单元文件**（`/etc/systemd/system/myapp-backup.service`）：\n```\n[Unit]\nDescription=MyApp 每日备份任务\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=oneshot\nUser=backup\nWorkingDirectory=/opt/myapp\nEnvironmentFile=-/etc/myapp/backup.env\nExecStart=/opt/myapp/bin/backup.sh\nTimeoutStartSec=3600\n\n[Install]\nWantedBy=multi-user.target\n```\n\n**关键字段说明**：\n- **`Type=oneshot`**：一次性任务（跑完即退出），备份、清理类脚本用这个；常驻服务用 `Type=simple`（默认）；\n- **`User=`**：以低权限账户运行，**这是安全加固的重要一环**，不要让脚本跑在 root 下；\n- **`Restart=on-failure` + `RestartSec=10`**：崩溃后 10 秒自动重启（**oneshot 类型不支持 Restart，常驻脚本才需要**）；\n- **`EnvironmentFile=`**：从文件加载环境变量，把密码等敏感配置与脚本分离（**文件权限要设 600**）；\n- **`TimeoutStartSec=`**：给启动（执行）加超时，防止脚本卡死；\n- **`StandardOutput=journal`**：输出进 journald，用 `journalctl -u <名称>` 查看，不用自己管日志文件轮转。\n\n**定时任务的两种做法**：① 用 systemd timer（`<名称>.timer` 配 `<名称>.service`），比 cron 多了日志、依赖管理与"错过的任务可补跑"；② 直接沿用 cron 调用 `systemctl start <名称>`。\n\n**上线流程**：写完单元文件 → `systemctl daemon-reload`（**每次改单元文件都必须执行**）→ `systemctl start <名称>` 试跑 → `systemctl status <名称>` 看结果 → 确认无误后 `systemctl enable <名称>` 设置开机自启。',
      params: [
        { flag: '[Unit] Description=', desc: '服务描述，`systemctl status` 里显示' },
        { flag: 'After/Wants=network-online.target', desc: '确保网络就绪后再启动（依赖网络的脚本必加）' },
        { flag: 'Type=oneshot', desc: '一次性任务（备份、清理），跑完即退出' },
        { flag: 'User= / Group=', desc: '以低权限账户运行，**安全加固关键项**' },
        { flag: 'ExecStart=', desc: '要执行的脚本，**必须写绝对路径**' },
        { flag: 'Restart=on-failure / RestartSec=', desc: '崩溃自动重启及间隔（**oneshot 不适用**）' },
        { flag: 'EnvironmentFile=', desc: '从文件加载环境变量，敏感配置与脚本分离' },
        { flag: 'WantedBy=multi-user.target', desc: '[Install] 段必写，否则 `systemctl enable` 无效' }
      ],
      examples: [
        { cmd: 'printf "[Unit]\\nDescription=MyApp 备份任务\\nAfter=network-online.target\\n\\n[Service]\\nType=oneshot\\nUser=backup\\nWorkingDirectory=/opt/myapp\\nExecStart=/opt/myapp/bin/backup.sh\\nTimeoutStartSec=3600\\n\\n[Install]\\nWantedBy=multi-user.target\\n" | sudo tee /etc/systemd/system/myapp-backup.service', desc: '写入最小可用的 oneshot 服务单元（用 tee 以获得 root 权限）' },
        { cmd: 'sudo systemctl daemon-reload && sudo systemctl start myapp-backup', desc: '重载配置并试跑一次，验证脚本能正常工作' },
        { cmd: 'systemctl status myapp-backup && journalctl -u myapp-backup -n 50 --no-pager', desc: '查看执行状态与日志输出' },
        { cmd: 'sudo systemctl enable myapp-backup', desc: '确认无误后设置开机自启' },
        { cmd: 'printf "[Unit]\\nDescription=MyApp 备份定时器\\n\\n[Timer]\\nOnCalendar=daily\\nPersistent=true\\n\\n[Install]\\nWantedBy=timers.target\\n" | sudo tee /etc/systemd/system/myapp-backup.timer', desc: '配合 timer 实现定时执行，`Persistent=true` 表示错过的任务开机后补跑' },
        { cmd: 'systemctl list-timers --all | grep myapp', desc: '确认定时器已生效并查看下次执行时间' }
      ],
      notes: [
        '**改完单元文件必须 `systemctl daemon-reload`**：否则 systemd 仍用旧配置，表现为"改了没用"',
        '**`[Install]` 段漏写 `WantedBy=` 会导致 `systemctl enable` 静默无效**，开机自启不生效',
        '**`ExecStart` 必须写绝对路径**：systemd 不读用户 PATH，写 `backup.sh` 会直接启动失败',
        '**`Type=oneshot` 不支持 `Restart=`**：一次性任务崩溃重启没有意义，需要重启能力请改成常驻脚本 + `Type=simple`',
        '**脚本里不要再用 `nohup`/`&`**：systemd 要求主进程前台运行，脚本自己 fork 到后台会让 systemd 认为服务已退出',
        '**敏感配置用 `EnvironmentFile=` 而不是写进单元文件**：单元文件常被复制与查看，环境变量文件要 `chmod 600` 且属主为服务用户',
        '**尽量用 `User=` 降权运行**：备份、清理类脚本跑在 root 下，一旦脚本有漏洞或被篡改影响面极大',
        '脚本中若依赖某些环境变量（如 `JAVA_HOME`），systemd 下不会自动继承用户 shell 的配置，需要在单元里显式设置或写进 EnvironmentFile',
        '调试时先 `systemctl start` 前台试跑并看 `journalctl -u`，比直接 `enable` 后等定时触发再排查高效得多'
      ],
      related: ['lu-systemd-unit', 'lu-systemd-timer', 'sh-background', 'sh-log-error'],
      docs: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html',
      tags: ['systemd', '开机自启', '服务封装', '定时任务']
    },

    /* ================= F. 实战脚本模板 ================= */

    /* ---------- 32 / 36 ---------- */
    {
      id: 'sh-template-backup',
      name: '备份脚本模板（日志/锁/告警）',
      kind: 'recipe',
      alias: ['备份脚本', 'tar 备份模板', 'flock 锁', '运维脚本模板'],
      level: 4,
      syntax: '#!/bin/bash + set -Eeuo pipefail + flock 锁 + tar 打包 + find 清理 + 日志函数',
      summary: '可直接落地的备份脚本骨架，含日志、互斥锁、失败退出与保留策略。',
      desc: '这是生产上真正能用的备份脚本骨架，**每一行都在解决一个具体的坑**：\n\n- **`set -Eeuo pipefail`**：任何一步失败立即停止，不会出现"备份失败了但脚本报成功"；\n- **`flock` 互斥锁**：备份耗时长，上一次还没跑完下一次 cron 又触发会造成 IO 争抢与文件冲突，**锁是必备的**；\n- **`trap ... EXIT`**：无论正常结束还是被中断，都清掉半成品临时文件，避免留下损坏的 `.tmp` 被误当成备份；\n- **先写 `.tmp` 再 `mv` 改名**：`mv` 在同一文件系统内是原子操作，这样"存在且名字正确"的备份文件一定是完整的；\n- **`find -mtime +N -delete`**：按保留天数清理旧备份，**不做清理的备份脚本迟早会把磁盘写满**；\n- **日志带时间戳并同时输出到屏幕**：cron 场景下会被邮件捕获，人工执行时也能看到。\n\n**部署建议**：用 systemd 服务或 timer 调度（见 `sh-systemd-wrapper`），失败时通过 `OnFailure=` 或脚本内追加告警（企业微信/钉钉 webhook、邮件）通知到人；备份完成后**务必定期做恢复演练**，没验证过能恢复的备份等于没有备份。',
      params: [
        { flag: 'set -Eeuo pipefail', desc: '严格模式，任何一步失败立即停止' },
        { flag: 'exec 9>"$LOCK" + flock -n 9', desc: '非阻塞互斥锁，防止上一次备份未完成时重复执行' },
        { flag: "trap 'rm -f \"$TMP\"' EXIT", desc: '异常退出时清理半成品文件' },
        { flag: 'tar -czf "$TMP" -C "$SRC" .', desc: '用 -C 指定源目录，避免备份文件里带上绝对路径' },
        { flag: 'mv "$TMP" "$FINAL"', desc: '原子改名，保证最终文件一定完整' },
        { flag: 'find ... -mtime +N -delete', desc: '按保留天数清理旧备份，避免磁盘写满' },
        { flag: 'du -h "$FINAL" | cut -f1', desc: '记录备份文件大小，便于观察异常（如突然变小）' }
      ],
      examples: [
        { cmd: "#!/bin/bash\nset -Eeuo pipefail\n\nSRC=/data/app\nDST=/data/backup\nRETENTION=7\nLOG=/var/log/backup.log\nLOCK=/var/lock/backup.lock\n\nlog() { echo \"[$(date '+%F %T')] [INFO] $*\" | tee -a \"$LOG\"; }\ndie() { echo \"[$(date '+%F %T')] [ERROR] $*\" >&2 | tee -a \"$LOG\"; exit 1; }\n\nmkdir -p \"$DST\" \"$(dirname \"$LOG\")\"\nexec 9>\"$LOCK\"\nflock -n 9 || die \"已有备份任务在运行，本次退出\"\n\n[ -d \"$SRC\" ] || die \"源目录不存在: $SRC\"\n\nSTAMP=$(date +%F)\nFINAL=\"$DST/app-$STAMP.tar.gz\"\nTMP=\"$FINAL.tmp\"\ntrap 'rm -f \"$TMP\"' EXIT\n\nlog \"开始备份 $SRC\"\ntar -czf \"$TMP\" -C \"$SRC\" . || die \"打包失败\"\nmv \"$TMP\" \"$FINAL\"\n\nfind \"$DST\" -name 'app-*.tar.gz' -mtime +\"$RETENTION\" -delete\nlog \"备份完成: $FINAL 大小 $(du -h \"$FINAL\" | cut -f1)\"", desc: '完整可用的备份脚本：严格模式 + 锁 + 临时文件 + 保留策略 + 日志' },
        { cmd: 'tar -tzf /data/backup/app-2024-03-18.tar.gz | head -5', desc: '验证备份内容可读（恢复演练的第一步）' },
        { cmd: 'mkdir -p /tmp/restore-test && tar -xzf /data/backup/app-2024-03-18.tar.gz -C /tmp/restore-test && ls /tmp/restore-test', desc: '在临时目录做恢复演练，确认备份真的可用' },
        { cmd: 'printf "net.core.somaxconn = 32768\\n" > /dev/null; flock -n /var/lock/backup.lock -c "echo 锁可用"', desc: '手工验证锁文件是否可用，排查"一直提示已有任务在运行"' }
      ],
      notes: [
        '**没有 `flock` 锁的备份脚本迟早出事故**：备份耗时长，cron 下一次触发时两个进程同时读写同一个目标文件会导致备份损坏',
        '**先写 `.tmp` 再 `mv` 是保证文件完整的标准手法**：直接用最终文件名写入，中断后会留下"看起来正常但实际损坏"的备份',
        '**备份必须配保留策略**：`find -mtime +N -delete` 是底线，否则磁盘写满引发的事故比数据丢失更频繁',
        '**没验证过恢复的备份不算备份**：至少每季度做一次恢复演练，并把演练结果记录下来',
        '`set -e` 下 `tar` 失败会直接退出，配合 `die` 能让日志里明确写出失败原因',
        '**备份文件不要与被备份数据放在同一块盘**：本地目录只是中转，最终应同步到 OSS/OBS 或异地存储（可用 `obsutil`、`rsync`）',
        '**告警要接到人**：只在日志里写 ERROR 而没人看等于没有告警，建议配 systemd 的 `OnFailure=` 或脚本内调用 webhook',
        '含数据库的场景要先做逻辑备份（`mysqldump`）或用快照保证一致性，直接 `tar` 正在写入的数据目录可能得到不可用的备份'
      ],
      related: ['sh-set-euo-pipefail', 'sh-trap', 'sh-systemd-wrapper', 'lb-tar'],
      docs: 'https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html',
      tags: ['备份', '脚本模板', 'flock', '运维实战']
    },

    /* ---------- 33 / 36 ---------- */
    {
      id: 'sh-template-log-clean',
      name: '日志清理脚本模板',
      kind: 'recipe',
      alias: ['日志清理', '日志轮转脚本', 'truncate 日志', 'logrotate'],
      level: 3,
      syntax: 'find 按时间删除 + gzip 压缩历史 + truncate 截断超大文件',
      summary: '按时间清理与压缩日志、截断超大文件，防止磁盘被日志写满。',
      desc: '日志写满磁盘是运维最常见的故障之一，但**清理方式用错会造成更大的问题**：\n\n**三种清理手段，适用场景完全不同**：\n① **`rm`**：只能删**没有被进程打开**的旧日志（如已轮转的历史文件）；对正在被写入的日志 `rm` 只是删掉目录项，**空间不会释放**（`lsof +L1` 能看到 deleted 状态），必须重启进程才能回收；\n② **`truncate -s 0`**：把文件截断为 0 字节但**保留 inode 与文件句柄**，进程继续写入不受影响，**这是处理"正在被写入的超大日志"的正确方式**；\n③ **`gzip`**：把历史日志压缩归档，一般能压到原体积的 10%~20%，是"既要保留又不占空间"的折中。\n\n**模板的三段逻辑**：先按天数删除过期日志、再压缩 N 天前的历史日志、最后扫描单个文件是否超过阈值并截断。这样既控制了总量，又保留了近期可查的日志。\n\n**更好的方案是 `logrotate`**：系统自带、支持按大小/时间轮转、压缩、`postrotate` 通知进程重新打开日志文件，配置集中在 `/etc/logrotate.d/`。**自研脚本适合"临时救火"或"logrotate 不方便接入"的场景**，长期方案仍推荐 logrotate。',
      params: [
        { flag: 'find -mtime +N -delete', desc: '按修改时间删除过期日志' },
        { flag: 'truncate -s 0 <文件>', desc: '截断正在被写入的日志，**不破坏文件句柄**' },
        { flag: 'gzip -q', desc: '压缩历史日志，通常可压到原体积的 10%~20%' },
        { flag: 'du -m | cut -f1', desc: '取文件大小（MB）用于阈值判断' },
        { flag: 'find -print -delete', desc: '打印并删除，便于日志记录清理了哪些文件' },
        { flag: 'lsof +L1', desc: '检查已删除但空间未释放的文件，确认是否需要用 truncate' },
        { flag: 'logrotate -d <配置>', desc: '演练模式，测试 logrotate 配置而不实际执行' }
      ],
      examples: [
        { cmd: "#!/bin/bash\nset -Eeuo pipefail\n\nLOG_DIR=/var/log/myapp\nKEEP_DAYS=14\nMAX_SIZE_MB=500\nLOG=/var/log/logclean.log\n\nlog() { echo \"[$(date '+%F %T')] $*\" | tee -a \"$LOG\"; }\n\n[ -d \"$LOG_DIR\" ] || { echo \"日志目录不存在: $LOG_DIR\" >&2; exit 1; }\n\nlog \"开始清理 $LOG_DIR\"\nfind \"$LOG_DIR\" -type f -name '*.log' -mtime +\"$KEEP_DAYS\" -print -delete | wc -l\nfind \"$LOG_DIR\" -type f -name '*.log' -mtime +7 ! -name '*.gz' -exec gzip -q {} \\;\n\nwhile IFS= read -r f; do\n  size=$(du -m \"$f\" | cut -f1)\n  if [ \"$size\" -gt \"$MAX_SIZE_MB\" ]; then\n    truncate -s 0 \"$f\"\n    log \"已截断超大日志: $f (${size}MB)\"\n  fi\ndone < <(find \"$LOG_DIR\" -type f -name '*.log')\n\nlog \"清理完成，当前占用: $(du -sh \"$LOG_DIR\" | cut -f1)\"", desc: '完整可用的日志清理脚本：按时间删除 + 压缩历史 + 截断超大文件' },
        { cmd: 'lsof +L1 | grep deleted | head -10', desc: '找出"已删除但空间未释放"的日志文件，确认是哪个进程还持有句柄' },
        { cmd: 'truncate -s 0 /var/log/myapp/app.log && ls -lh /var/log/myapp/app.log', desc: '截断正在被写入的大日志，进程无需重启' },
        { cmd: 'logrotate -d /etc/logrotate.d/myapp', desc: '演练模式测试 logrotate 配置，确认轮转规则符合预期' }
      ],
      notes: [
        '**对正在被写入的日志用 `rm` 不会释放空间**：文件句柄仍被进程持有，必须用 `truncate -s 0` 才能立即回收，或用 `logrotate` 的 `copytruncate`',
        '**`truncate` 会丢掉历史内容**：执行前确认不需要这些日志用于审计或排障，重要日志请先压缩归档再截断',
        '**清理脚本自身也可能误删**：路径变量务必校验（`[ -d "$LOG_DIR" ]`），避免变量为空时 `find /` 扫全盘',
        '**优先使用 `logrotate`**：系统自带、经过充分验证、支持压缩与 `postrotate` 通知进程重开日志，自研脚本适合临时救火',
        '`find -mtime` 的粒度是"天"，需要更精确的保留策略可以配合 `-newermt` 指定具体时间点',
        '**不要删除当天正在写的日志**：会导致应用日志断档，排障时缺少关键证据',
        '清理策略要与合规要求对齐：等保与审计通常要求日志保留 6 个月以上，不能只按"磁盘快满了"来定保留天数'
      ],
      related: ['sh-template-backup', 'sh-tee-exec', 'ls9-df', 'lu-journalctl-vacuum'],
      docs: 'https://www.gnu.org/software/coreutils/manual/html_node/truncate-invocation.html',
      tags: ['日志清理', '磁盘告警', 'truncate', '脚本模板']
    },

    /* ---------- 34 / 36 ---------- */
    {
      id: 'sh-template-health',
      name: '健康检查与自动重启模板',
      kind: 'recipe',
      alias: ['健康检查脚本', '自动重启', '探活脚本', 'curl 健康检查'],
      level: 3,
      syntax: 'curl -sf -m <秒> <健康检查URL> → 重试 N 次 → systemctl restart <服务> → 复检',
      summary: '探测服务健康接口，连续失败后自动重启并复检，减少人工介入。',
      desc: '这个模板解决的是"服务进程还在但已经不可用"的场景——**只检查进程存在是不够的**，端口假死、线程池打满、依赖数据库断开时进程都还活着，但业务已经不可用。**检查真实业务接口才是有效的探活**。\n\n**设计要点**：\n- **连续失败才重启**：单次失败可能是网络抖动或瞬时高峰，立刻重启会造成"雪崩式重启"，所以要重试 N 次；\n- **`curl -sf -m 5`**：`-f` 让 HTTP 4xx/5xx 返回非 0（**不加 `-f` 时 500 也算成功，这是最常见的误用**），`-m 5` 限制超时防止卡住；\n- **重启后必须复检**：重启命令返回成功不代表服务真的起来了，要等待并再次探测，否则会陷入"重启→失败→再重启"的循环；\n- **退出码分级**：0 正常、2 重启后仍失败、3 重启命令失败，便于监控系统区分严重程度；\n- **日志保留**：每次检查与重启动作都记录，用于事后统计"这个服务一个月重启了多少次"——**频繁重启说明有根因问题，自动化只是掩盖症状**。\n\n**更强的方案**：Kubernetes 用 `livenessProbe` / `readinessProbe`；传统部署用 systemd 的 `WatchdogSec=` 配合服务自身的 `sd_notify`；云上可用华为云 AOM/ CES 的告警 + 函数工作流做自动化处置。**这个脚本适合"没有上述机制时的兜底"**，配合 cron 每分钟执行一次。',
      params: [
        { flag: 'curl -sf -m 5 <URL>', desc: '静默探测并在 HTTP 错误时返回非 0，`-m` 限制超时' },
        { flag: 'for i in $(seq 1 "$RETRY")', desc: '重试循环，避免单次抖动触发重启' },
        { flag: 'systemctl restart <服务>', desc: '重启动作，也可替换为 `docker restart`、`kubectl rollout restart`' },
        { flag: 'sleep <秒>', desc: '重启后等待服务完成启动再复检' },
        { flag: 'exit <码>', desc: '用分级退出码区分"恢复正常"与"需要人工介入"' },
        { flag: 'livenessProbe / readinessProbe', desc: 'K8s 场景的对应机制，比脚本更可靠' }
      ],
      examples: [
        { cmd: "#!/bin/bash\nset -Eeuo pipefail\n\nURL=http://127.0.0.1:8080/health\nSERVICE=myapp\nRETRY=3\nINTERVAL=5\nLOG=/var/log/healthcheck.log\n\nlog() { echo \"[$(date '+%F %T')] $*\" | tee -a \"$LOG\"; }\n\nfor i in $(seq 1 \"$RETRY\"); do\n  if curl -sf -m 5 \"$URL\" >/dev/null; then\n    log \"健康检查通过（第 $i 次）\"\n    exit 0\n  fi\n  log \"第 $i 次检查失败，${INTERVAL} 秒后重试\"\n  sleep \"$INTERVAL\"\ndone\n\nlog \"连续 ${RETRY} 次检查失败，重启服务 $SERVICE\"\nif systemctl restart \"$SERVICE\"; then\n  sleep 10\n  if curl -sf -m 5 \"$URL\" >/dev/null; then\n    log \"重启后服务已恢复\"\n    exit 0\n  fi\n  log \"重启后仍未恢复，需要人工介入\"\n  exit 2\nfi\nlog \"重启命令执行失败\"\nexit 3", desc: '完整可用的健康检查与自动重启脚本，含重试、复检与分级退出码' },
        { cmd: 'curl -sf -m 5 -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:8080/health; echo "退出码 $?"', desc: '手工验证探测命令的行为：HTTP 500 时退出码非 0' },
        { cmd: 'crond 环境下手动测试: /opt/scripts/healthcheck.sh; echo "退出码 $?"', desc: '按调度环境的用户身份试跑一次，确认权限与路径都没问题' },
        { cmd: 'grep -c "重启服务" /var/log/healthcheck.log', desc: '统计一段时间内的重启次数，频繁重启说明需要查根因' }
      ],
      notes: [
        '**`curl` 不加 `-f` 时 HTTP 500 也被视为成功**：探活必须用 `curl -sf`，这是最常见的误判来源',
        '**必须连续失败才重启**：单次失败就重启会在流量高峰时把服务反复打断，形成雪崩',
        '**重启后一定要复检**：只判断 `systemctl restart` 的返回码不够，服务可能启动后又立刻崩溃',
        '**自动重启是掩盖症状而不是解决问题**：重启次数频繁时应去查内存泄漏、连接池耗尽、依赖超时等根因',
        '**探活接口要选有意义的**：只返回 200 的 `/ping` 无法反映依赖是否正常，理想情况下应检查关键依赖（数据库、缓存）的连通性，但也要避免探活本身成为负担',
        '**避免探活风暴**：多台机器或高频 cron 同时探测会给服务带来额外压力，建议错开时间或使用带缓存的探活端点',
        '不要用 `pkill -f` 之类模糊匹配来"重启"：容易误杀其他进程，**一律用 systemctl 或容器编排接口**',
        '脚本以 root 运行才能 `systemctl restart`，注意用 `User=` 降权与 sudoers 精细授权之间的平衡'
      ],
      related: ['sh-template-log-clean', 'sh-timeout', 'sh-systemd-wrapper', 'sh-log-error'],
      docs: 'https://curl.se/docs/manpage.html',
      tags: ['健康检查', '自动重启', '探活', '脚本模板']
    },

    /* ---------- 35 / 36 ---------- */
    {
      id: 'sh-template-batch-ssh',
      name: '批量多主机操作模板',
      kind: 'recipe',
      alias: ['批量执行脚本', '多主机巡检', 'xargs 并发 ssh', '批量运维'],
      level: 4,
      syntax: '主机清单文件 + run_one 函数 + xargs -P 控制并发 + 每台独立输出文件',
      summary: '对几十上百台主机并发执行同一命令，输出按主机分别留存便于核对。',
      desc: '批量运维脚本的关键不是"能跑"，而是"**跑得住、看得清、不误伤**"。这个模板把四个工程细节都做进去了：\n\n**① 并发但可控**：用 `xargs -P` 控制并发数（默认 5）。**并发过高会把自己的出口带宽、对端 sshd 连接数打满**，几百台一起连很可能被判定为异常行为；\n\n**② 每台机器独立输出文件**：`> "$OUTDIR/$host.out" 2>&1`。如果所有输出都打到终端，几十台的结果会交错在一起完全没法看；\n\n**③ 强制非交互与超时**：`ssh -n`（不读标准输入，**防止 ssh 吞掉循环的输入**）、`-o BatchMode=yes`（禁止密码提示，没配密钥就直接失败而不是挂住）、`-o ConnectTimeout=5`、外层再套 `timeout 15`（防止命令执行阶段卡死）；\n\n**④ 结果汇总可核对**：脚本最后打印结果目录，`[OK]`/`[FAIL]` 逐台输出，失败的主机可以逐个去看它的 `.out` 文件。\n\n**上线前的三件准备**：主机清单文件（一行一个 IP 或域名，支持 `#` 注释）、免密登录已配置好（`ssh-copy-id` 或统一分发密钥）、**先在 1~2 台测试机上验证命令再全量执行**。\n\n**做危险操作（重启服务、删文件、改配置）时必须加二次确认与灰度**：先跑一台，确认没问题再分批扩大范围。批量脚本最大的事故就是"一条命令误伤了全部机器"。',
      params: [
        { flag: 'HOSTS_FILE', desc: '主机清单文件，一行一个地址，支持 `#` 注释与空行' },
        { flag: 'xargs -P <并发>', desc: '控制并发数，**并发过高会打满出口或触发对端限制**' },
        { flag: 'xargs -I{} bash -c \'run_one "$@"\' _ {}', desc: '把每行交给函数处理，配合 `export -f` 传递函数' },
        { flag: 'ssh -n', desc: '不读标准输入，防止 ssh 吞掉循环/管道的输入' },
        { flag: '-o BatchMode=yes', desc: '禁止密码交互，未配置免密时直接失败而不是挂住' },
        { flag: '-o ConnectTimeout=5', desc: '建连超时，避免个别主机拖慢整体' },
        { flag: 'timeout 15 ssh ...', desc: '外层再加执行超时，防止命令本身卡死' },
        { flag: 'OUTDIR/$host.out', desc: '每台主机独立输出文件，便于逐台核对' }
      ],
      examples: [
        { cmd: "#!/bin/bash\nset -Eeuo pipefail\n\nHOSTS_FILE=${1:-/opt/scripts/hosts.txt}\nSSH_USER=${SSH_USER:-ops}\nCONCURRENCY=${CONCURRENCY:-5}\nCMD=${2:-uptime}\nOUTDIR=/var/log/batch-$(date +%F_%H%M%S)\n\n[ -f \"$HOSTS_FILE\" ] || { echo \"主机清单不存在: $HOSTS_FILE\" >&2; exit 1; }\nmkdir -p \"$OUTDIR\"\n\nrun_one() {\n  local host=$1\n  if timeout 15 ssh -n -p 22 -o BatchMode=yes -o ConnectTimeout=5 \"$SSH_USER@$host\" \"$CMD\" > \"$OUTDIR/$host.out\" 2>&1; then\n    echo \"[OK]   $host\"\n  else\n    echo \"[FAIL] $host\"\n  fi\n}\nexport -f run_one\nexport SSH_USER OUTDIR CMD\n\ngrep -vE '^[[:space:]]*(#|$)' \"$HOSTS_FILE\" | xargs -P \"$CONCURRENCY\" -I{} bash -c 'run_one \"$@\"' _ {}\n\necho \"全部完成，逐台结果见: $OUTDIR\"\nls -1 \"$OUTDIR\" | wc -l", desc: '完整可用的批量执行脚本：并发可控、逐台独立输出、带连接与执行超时' },
        { cmd: "printf '10.0.1.21\\n10.0.1.22\\n# 10.0.1.23 维护中\\n' > /opt/scripts/hosts.txt && cat /opt/scripts/hosts.txt", desc: '准备主机清单，支持注释行' },
        { cmd: 'bash /opt/scripts/batch.sh /opt/scripts/hosts.txt "uptime"', desc: '对清单内所有主机并发执行 uptime' },
        { cmd: 'cat /var/log/batch-*/10.0.1.21.out', desc: '查看某台主机的完整输出，排查失败原因' },
        { cmd: 'ssh -n -o BatchMode=yes -o ConnectTimeout=5 ops@10.0.1.21 "hostname"', desc: '先对单台验证免密与命令可用，再全量执行' },
        { cmd: 'bash /opt/scripts/batch.sh /opt/scripts/hosts.txt "sudo systemctl restart myapp"', desc: '批量重启服务（**危险操作，建议先单台验证并分批执行**）' }
      ],
      notes: [
        '**并发数要保守**：`-P 50` 同时连 50 台可能打满本机出口、触发对端 sshd 的 MaxStartups 限制，反而大面积失败；建议从 5 开始',
        '**必须先单台验证再全量**：批量脚本最大的事故就是一条错误的命令同时影响几百台机器；危险操作建议先跑 1 台，再扩大到 10%，最后全量',
        '**`ssh -n` 不能省**：不加时 ssh 会读走循环或 xargs 的标准输入，导致只处理了第一台主机——这是批量脚本最经典的 bug',
        '**`-o BatchMode=yes` 不能省**：否则未配置免密的主机会卡在密码提示上，整个批处理挂起',
        '**每台输出独立成文件**：终端里几十台输出交错会完全无法阅读；失败的主机逐个查 `.out` 才是正确姿势',
        '**要区分"连接失败"和"命令执行失败"**：两者排查方向完全不同，脚本里可以再细分退出码（255 通常是 ssh 连接层错误）',
        '**不要在批量脚本里用 `pkill -f`、`rm -rf` 等模糊匹配的命令**：一旦匹配范围超出预期就是批量事故',
        '敏感信息（如带密码的命令）不要直接写在命令行参数里，`ps` 在其他主机与本机都能看到，应改用环境变量或凭据文件',
        '上百台以上或需要编排（分批、依赖、回滚）的场景，应该换用 Ansible、SaltStack 或云厂商的批量运维工具，而不是继续堆 Shell'
      ],
      related: ['sh-template-health', 'sh-for', 'sh-wait', 'sh-timeout'],
      docs: 'https://man7.org/linux/man-pages/man1/ssh.1.html',
      tags: ['批量运维', '并发执行', 'ssh', '脚本模板']
    },
    /* ---------- 36 / 36 ---------- */
    {
      id: 'sh-echo',
      name: 'echo',
      alias: ['-n', '-e', '追加重定向', '写一行到文件'],
      level: 1,
      syntax: 'echo [-n] [-e] <内容> [> 文件 | >> 文件]',
      summary: '把内容送到标准输出；配 `>` / `>>` 就是往文件里写一行。',
      desc: '`>` 是**覆盖**（原内容全丢），`>>` 是**追加**（保留原内容）。这两者的区别是配置文件被写坏的头号原因：`echo "x" > /etc/nginx/nginx.conf` 会把整个配置换成一行。引号规则同样关键：双引号里 `$变量` 会展开，单引号里原样输出 —— 写 `$host`、`${DB_PASSWORD}` 这类内容时用单引号才不会在本机就被替换掉。`-n` 不换行、`-e` 才解释 `\\n` `\\t`（bash 内建 `echo` 默认不解释，`printf` 才是可移植的写法）。',
      params: [
        { flag: '> 文件', desc: '覆盖写入，文件原有内容全部丢失' },
        { flag: '>> 文件', desc: '追加到文件末尾，保留原内容 —— 改配置用这个' },
        { flag: '-n', desc: '结尾不输出换行符' },
        { flag: '-e', desc: '解释反斜杠转义（`\\n` `\\t`），需要可移植时改用 `printf`' }
      ],
      examples: [
        { cmd: 'echo "app.timeout=30m" >> /data/app/config.yaml', desc: '追加一行配置，原文件内容不受影响' },
        { cmd: 'echo "a=1" > /tmp/tmp.conf', desc: '覆盖写入；文件原有内容会被清空' },
        { cmd: 'echo -n "no-newline"', desc: '不换行，拼提示信息时用' },
        { cmd: 'echo -e "line1\\nline2"', desc: '解释 `\\n` 转义；不加 `-e` 会原样打出反斜杠 n' }
      ],
      notes: [
        '**`>` 与 `>>` 一定要分清楚**：改配置文件用 `>>`，用 `>` 会把整个文件替换成你这一行 —— 这是最典型的"改配置改挂服务"',
        '双引号展开变量、单引号不展开。写 `systemctl` unit、`nginx` 配置里带 `$` 的内容时，用单引号才不会在写入时就被本机 shell 替换掉',
        '`echo` 是 shell 内建命令，`/bin/echo` 是另一个程序，两者对 `-e`/`-n` 的处理在不同系统上不一致；要可移植就用 `printf \'%s\\n\' "内容"`',
        '写系统配置文件时常用 `echo ... | sudo tee -a /etc/xxx`：`sudo` 只作用于它后面那条命令，`sudo echo x > /etc/xxx` 里的重定向其实仍以当前用户执行，会 Permission denied',
        '只需要看变量值就别重定向，直接 `echo "$VAR"`；排查脚本时这一步能省掉一半的猜测'
      ],
      related: ['sh-redirect', 'sh-quotes', 'lb-tee', 'sh-tee-exec'],
      docs: 'https://man7.org/linux/man-pages/man1/echo.1.html',
      tags: ['输出', '重定向', '配置修改']
    }
  );
})();
