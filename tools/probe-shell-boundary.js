/* tools/probe-shell-boundary.js · Shell 教学引擎控制流边界（可复现探针，零依赖）
   --------------------------------------------------------------------------
   为什么留着它：`data/lessons-shell.js` 里每一条命令都必须在**这个引擎**上真能跑通，
   而引擎的真实边界比任务描述细得多（好几条描述里说"已就绪"的构造实测是坏的）。
   写课/改课之前跑一遍，比事后被 tools/shell-check.js 拦下来省事。

   用法： node tools/probe-shell-boundary.js

   本次实测结论（跑完下面用例即可复核）：
     ✅ 可用  for f in <字面量 | glob | {1..N}>、if/then/elif/else/fi、
              test 的 -f -d -e -s -r -z -n、$(...) 做单值、重定向 > >> 2>file、
              $?、管道给 wc/grep/head/tail、循环整体重定向、[ -e "$f" ] || continue
     ❌ 不可用 $(...) 放在 for 列表位置、$((…))、-gt/-ge/-lt/-le/-eq、[ = ]/[ != ] 与 [[ ]]、
              for/while 体内嵌 if、嵌套 for、case、管道接 while、2>&1 与 &>、
              反引号、函数、trap、数组、进程替换、后台 &、wait、<<< 与 here-doc
     ⚠ 两大陷阱：
        · while 循环体**根本不执行**：`while IFS= read -r h; do echo …; done < file`
          屏幕上什么都没有，重定向或管道只会拿到空文件/零行。要落盘必须改用 for。
        · 管道会被解析但不生效：`for …; done | wc -l` 打印的是那几行本身，不是行数。
   -------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = { CC_CATS: {}, CC_DATA: {}, CC_LESSONS: [] };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };
['data/_registry.js', 'data/termfs.js', 'assets/js/store.js', 'assets/js/shell.js']
  .concat(require('./_cmdlist'))
  .forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const CASES = [
  /* ---- 可用 ---- */
  ['✅', 'for 字面量列表', 'for i in 1 2 3; do echo $i; done'],
  ['✅', 'for 花括号序列', 'for i in {1..3}; do echo "第 $i 台"; done'],
  ['✅', 'for 通配符 glob', 'for f in /data/backup/*.tar.gz; do echo "${f##*/}"; done'],
  ['✅', 'if 文件存在（双分支）', 'if [ -f /etc/hosts ]; then echo yes; else echo no; fi'],
  ['✅', 'if / elif / else', 'if [ -f /nope ]; then echo A; elif [ -d /data ]; then echo B; else echo C; fi'],
  ['✅', 'test 空值 / 非空', 'A=""; if [ -z "$A" ]; then echo 空; else echo 非空; fi'],
  ['✅', 'test -s / -r', 'if [ -s /opt/scripts/hosts.txt ]; then echo 非空文件; fi'],
  ['✅', '命令替换做单值', 'N=$(grep -vc \'^#\' /opt/scripts/hosts.txt); echo "干净清单 $N 台"'],
  ['✅', '命令替换含管道', 'echo "主机数 $(grep -vc \'^#\' /opt/scripts/hosts.txt)"'],
  ['✅', 'if 条件里用命令替换', 'if [ -n "$(echo x)" ]; then echo 非空; else echo 空; fi'],
  ['✅', 'if 条件是多条 test', 'if [ -f /etc/hosts ] && [ -d /data ]; then echo 都在; else echo 缺; fi'],
  ['✅', '参数展开（长度/去前缀/去后缀/默认值）', 'P=/a/b/app.log; echo "${#P} ${P##*/} ${P%.log} ${X:-默认}"'],
  ['✅', '重定向 > >> 与 2>文件', 'echo a > /tmp/pb1.txt && echo b >> /tmp/pb1.txt && ls /nope 2>/tmp/pb2.txt; echo "码 $?"'],
  ['✅', '循环输出整体重定向', 'for i in 1 2; do echo "q$i"; done > /tmp/pb3.txt; cat /tmp/pb3.txt'],
  ['✅', '退出码 $?', 'true; echo "真=$?"; false; echo "假=$?"'],
  ['✅', '管道给 wc / grep', 'grep -v \'^#\' /opt/scripts/hosts.txt | wc -l'],
  ['✅', 'for 里 || continue 兜通配符空匹配', 'for f in /data/backup/*.zzz; do [ -e "$f" ] || continue; echo "$f"; done; echo 结束'],

  /* ---- 不可用 ---- */
  ['❌', 'for 列表位置放命令替换', 'for i in $(seq 1 3); do echo $i; done'],
  ['❌', 'for 列表位置放 find', 'for f in $(find /data/backup -name "*.tar.gz"); do echo "$f"; done'],
  ['❌', '算术展开 $(( ))', 'echo $((2+3))'],
  ['❌', '计数器自增', 'N=0; for i in 1 2 3; do N=$((N+1)); done; echo "共 $N"'],
  ['❌', '数字比较 -gt', 'N=5; if [ $N -gt 3 ]; then echo 大; else echo 小; fi'],
  ['❌', '字符串相等判定', 'A=web; if [ "$A" = web ]; then echo 相等; else echo 不等; fi'],
  ['❌', '双中括号', 'N=5; if [[ $N -gt 3 ]]; then echo 大; else echo 小; fi'],
  ['❌', '裸 test（会报表达式语法错误）', 'A=web; [ "$A" = web ]; echo "码 $?"'],
  ['❌', 'for 体内嵌 if', 'for h in a b; do if [ -n "$h" ]; then echo "$h"; fi; done'],
  ['❌', '嵌套 for', 'for i in 1 2; do for j in a b; do echo "$i$j"; done; done'],
  ['❌', 'if 里嵌 if', 'if [ -f /etc/hosts ]; then if [ -d /data ]; then echo 两级; fi; fi'],
  ['❌', 'case', 'case web in web) echo 是web;; esac'],
  ['❌', '管道接 while', 'grep -v \'^#\' /opt/scripts/hosts.txt | while IFS= read -r h; do echo "$h"; done'],
  ['❌', '流合并 2>&1（stderr 会丢）', 'ls /nope > /tmp/pb4.txt 2>&1; wc -l /tmp/pb4.txt'],
  ['❌', '反引号', 'D=`date +%F`; echo "D=$D"'],
  ['❌', '函数定义', 'f() { echo hi; }; f'],
  ['❌', '数组', 'A=(1 2 3); echo "${A[0]}"'],
  ['❌', '进程替换', 'while read -r l; do echo $l; done < <(cat /etc/hosts)'],
  ['❌', '后台 & 与 wait', 'sleep 1 & wait'],
  ['❌', 'here-document / here-string', "cat <<'EOF'\nhello\nEOF"],

  /* ---- 陷阱 ---- */
  ['⚠', 'while 体内命令根本不执行（屏幕上无输出）', 'while IFS= read -r h; do echo "检查 $h"; done < /opt/scripts/hosts.txt'],
  ['⚠', '同上：重定向只能拿到空文件', 'while IFS= read -r h; do echo "检查 $h"; done < /opt/scripts/hosts.txt > /tmp/pb5.txt; wc -c /tmp/pb5.txt'],
  ['⚠', '管道被解析但不生效（打印的是原几行）', 'for h in 10.0.1.21 10.0.1.22; do echo "检查 $h"; done | wc -l'],
  ['⚠', '预期失败的命令接 && / || 链整体非零退出', 'ls /nope 2>/dev/null && echo 成功 || echo 失败']
];

CASES.forEach((c) => {
  const sh = window.CC_SHELL.create();
  let r;
  try { r = sh.exec(c[2]); }
  catch (e) { console.log(c[0] + ' [' + c[1] + '] 抛出异常: ' + e.message); return; }
  const out = (r.out || []).join(' ⏎ ');
  const err = (r.err || []).join(' ⏎ ');
  console.log(c[0] + ' [' + c[1] + '] code=' + r.code);
  console.log('     命令: ' + c[2].replace(/\n/g, ' ⏎ '));
  if (out) console.log('     输出: ' + out.slice(0, 150));
  if (err) console.log('     stderr: ' + err.slice(0, 120));
});
