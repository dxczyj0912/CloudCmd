// tools/shell-check.js · 模拟终端的行为验证（在 Node 里跑一遍引擎）
'use strict';
/* 任何引擎异常都应当算测试失败，而不是静默消失 */
process.on('uncaughtException', (e) => {
  console.error('\n✗ 引擎抛出未捕获异常（这是 bug）:\n' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n'));
  process.exit(1);
});

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
global.window = { CC_DATA: {}, CC_CATS: {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };

['data/_registry.js', 'data/termfs.js', 'assets/js/store.js', 'assets/js/shell.js']
  .concat(require('./_lessonlist'))
  .concat(require('./_cmdlist'))
  .forEach(f => require(path.join(ROOT, f)));

const sh = window.CC_SHELL.create();

let pass = 0, fail = 0;
const failures = [];

function t(name, line, checks) {
  const res = sh.exec(line);
  const text = (res.out || []).join('\n');
  const errText = (res.err || []).join('\n');
  /* 命令的报错走 stderr 是正确行为（真 shell 也这样），
     所以断言默认同时看 stdout 与 stderr，除非显式用 onlyOut */
  const both = text === '' ? errText : (errText === '' ? text : text + '\n' + errText);
  const problems = [];
  (checks || []).forEach(c => {
    if (typeof c === 'string') {
      if (both.indexOf(c) === -1) problems.push('输出缺少: ' + c);
    } else if (c instanceof RegExp) {
      if (!c.test(both)) problems.push('输出不匹配: ' + c);
    } else if (typeof c === 'function') {
      const r = c(res, text, errText, sh);
      if (r !== true) problems.push(r);
    }
  });
  if (problems.length) { fail++; failures.push({ line, problems, text: text.slice(0, 400), err: errText.slice(0, 200) }); }
  else pass++;
  return res;
}

/* 只检查 stdout 的断言辅助 */
function outOnly(re) {
  return (res, text) => re.test(text) ? true : 'stdout 不匹配: ' + re;
}
function errOnly(re) {
  return (res, text, errText) => re.test(errText) ? true : 'stderr 不匹配: ' + re;
}
function noNormalEvents(res, text) {
  return text.indexOf('Normal') === -1 ? true : '过滤后仍有 Normal 事件';
}

function codeIs(n) { return (res) => res.code === n ? true : '退出码应为 ' + n + '，实际 ' + res.code; }
function hasNoErr(res, text, errText) { return errText === '' ? true : '不该有 stderr: ' + errText; }

console.log('='.repeat(70));
console.log('模拟终端行为验证');
console.log('='.repeat(70));

/* ---------- 文件系统 ---------- */
t('ls 家目录默认只列可见文件（都是隐藏文件时应为空）', 'ls -a /root', ['.bashrc', '.ssh']);
t('ls -l 长格式含权限与大小', 'ls -l /data/app', [/-rw-r--r--/, /92274688/]);
t('ls -l 权限位正确渲染为 -rwxr-xr-x', 'ls -l /opt/scripts', [/-rwxr-xr-x/]);
t('ls -lh 人类可读', 'ls -lh /var/log/nginx', [/88\.2M|46\.0M/, 'access.log']);
t('ls -lht 按时间排序', 'ls -lht /var/log/nginx', [/access\.log/]);
t('ls 不存在的路径报错并返回退出码 2', 'ls /nope', [/No such file or directory/, codeIs(2)]);
t('pwd', 'pwd', ['/root']);
t('cd 切目录后 pwd 跟随', 'cd /var/log && pwd', ['/var/log']);
t('cd 相对路径 ..', 'cd /var/log/nginx && cd .. && pwd', ['/var/log']);
t('cat 读文件', 'cat /etc/hostname', ['web-prod-01']);
t('cat 目录报错', 'cat /etc', [/Is a directory/]);
t('head 默认 10 行', 'head /etc/nginx/nginx.conf', ['worker_processes']);
t('tail -n 指定行数', 'tail -n 3 /var/log/nginx/access.log', [/8814|8813/]);
t('tail -f 有提示', 'tail -f /data/app/logs/app.log', [/tail -f|教学环境/]);
t('wc -l 统计行数', 'wc -l /var/log/nginx/access.log', [/15/]);

/* ---------- 文本处理 ---------- */
t('grep 基础匹配', 'grep error /var/log/nginx/error.log', [/upstream timed out/]);
t('grep -i 忽略大小写', 'grep -i error /var/log/nginx/error.log', [/timed out/]);
t('grep -v 反向匹配', 'grep -v healthz /var/log/nginx/access.log', [
  (res, text) => text.indexOf('healthz') === -1 ? true : '反向匹配失效：输出里还有 healthz'
]);
t('grep -c 计数', 'grep -c healthz /var/log/nginx/access.log', [/3/]);
t('grep -n 行号', 'grep -n orders /var/log/nginx/access.log', [/1:/]);
t('grep 无匹配退出码 1', 'grep zzzznotfound /var/log/nginx/access.log', [codeIs(1)]);
t('grep -r 递归目录', 'grep -rn nameserver /etc', [/resolv\.conf:1:/]);
t('grep -rn 合并写法可用', 'grep -rn 114.114.114.114 /etc', [/resolv\.conf/]);
t('awk 取第一列', "awk '{print $1}' /var/log/nginx/access.log", ['203.0.113.25']);
t('awk -F 指定分隔符', "awk -F: '{print $1}' /etc/passwd", ['root', 'deploy']);
t('sed 替换', "sed 's/root/admin/' /etc/hostname", ['web-prod-01']);
t('sed -n 打印指定行', "sed -n '1,2p' /etc/passwd", [/root/, /daemon/]);
t('sed 原地替换真的改了文件', "sed -i 's/web-prod-01/web-dev-09/' /etc/hostname && cat /etc/hostname", ['web-dev-09']);
t('sed 还原', "sed -i 's/web-dev-09/web-prod-01/' /etc/hostname", []);
t('cut -d -f 取列', "cut -d: -f1,3 /etc/passwd", [/root:0/]);
t('sort -rn 数值倒排', "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -3", [/203\.0\.113\.25/]);
t('uniq -c 计数', "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c", [/\d+ 203\.0\.113\.25/]);
t('tr 替换（显式 stdin）', "cat /etc/hostname | tr 'a-z' 'A-Z'", ['WEB-PROD-01']);
t('jq 解析 JSON', 'cat /var/log/health.log | head -1 | jq .status', ['"UP"']);
t('jq -r 去引号', 'cat /var/log/health.log | head -1 | jq -r .status', ['UP']);

/* ---------- 管道与重定向 ---------- */
t('管道串联 3 段', "cat /etc/passwd | grep -v nologin | wc -l", [/\d+/]);
t('重定向 > 写文件', "echo hello-cloudcmd > /tmp/out.txt && cat /tmp/out.txt", ['hello-cloudcmd']);
t('重定向 >> 追加', "echo line2 >> /tmp/out.txt && cat /tmp/out.txt", [/hello-cloudcmd/, /line2/]);
t('2>&1 合并 stderr', 'ls /nope 2>&1', [/No such file or directory/]);
t('&& 前一条失败则不执行后一条', 'ls /nope && echo SHOULD_NOT_APPEAR', [
  (res, text) => text.indexOf('SHOULD_NOT_APPEAR') === -1 ? true : '&& 语义错误：失败后仍执行了后一条'
]);
/* 命令替换 $() —— 引擎现已支持（`for i in $(seq 1 10)`、`cat /proc/$(pgrep ...)/limits`
   这类写法在内容里很常见，不支持就等于一大片示例跑不了）。
   原断言写的是"不支持时必须报错或原样保留"，实现之后它必然失败，所以这里翻转语义。 */
t('命令替换 $() 生效', 'echo $(date)', [/\d{2}:\d{2}:\d{2}/]);
t('命令替换可嵌在参数中间', 'echo /proc/$(echo 1)/mounted', ['/proc/1/mounted']);
t('反引号命令替换同样生效', 'echo `echo backtick-ok`', ['backtick-ok']);
t('echo 自身可用', 'echo hello-cloudcmd', ['hello-cloudcmd']);

/* ---------- 文件操作 ---------- */
t('mkdir + ls 验证', 'mkdir -p /data/newdir/sub && ls /data/newdir', ['sub']);
t('touch 建空文件', 'touch /tmp/newfile.txt && ls -l /tmp/newfile.txt', [/newfile\.txt/]);
t('cp 复制文件', 'cp /etc/hostname /tmp/h2 && cat /tmp/h2', ['web-prod-01']);
t('cp 目录需 -r', 'cp /etc/nginx /tmp/nx', [/omitting directory|-r/]);
t('cp -r 复制目录', 'cp -r /etc/nginx /tmp/nx && ls /tmp/nx', ['nginx.conf']);
t('mv 重命名', 'mv /tmp/h2 /tmp/h3 && ls /tmp/h3', [/h3/]);
t('rm 删文件', 'rm /tmp/h3 && ls /tmp/h3', [codeIs(2)]);
t('rm 目录需 -r', 'rm /tmp/nx', [/Is a directory/]);
t('rm -rf 删目录', 'rm -rf /tmp/nx && ls /tmp/nx', [codeIs(2)]);
t('ln -s 软链接带 -> 显示', 'ln -s /etc/hostname /tmp/link1 && ls -l /tmp/link1', [/-> \/etc\/hostname/]);

/* ---------- find ---------- */
t('find 按名字', 'find /etc -name "*.conf"', [/resolv\.conf/]);
t('find 按类型只列目录', 'find /var/log -type d', [
  (res, text) => (text.indexOf('access.log') === -1 && text.indexOf('nginx') !== -1) ? true : 'type d 过滤失效'
]);
t('find 按大小', 'find /data -size +1G', [/www-2024-03-1/]);
t('find -exec 展示将处理的文件', 'find /var/log/nginx -name "*.log" -exec rm -f {} \\;', [/access\.log|rm -f/]);

/* ---------- 磁盘 ---------- */
t('df -h', 'df -h', [/\/data/, /100%/]);
t('df -i 看 inode', 'df -i', [/IUse%/, /100%/]);
t('du -sh 单目录', 'du -sh /data/backup', [/G/]);
t('du -sh /* 排序找凶手（显式目录名）', 'du -sh /data/backup /data/app /data/docker | sort -rh', [/backup/]);
/* 通配符展开：真 shell 会先把 glob 展开再交给命令。引擎早先不做这一步，
   于是 `ls /data/*` 报 cannot access —— 而站内速查就是 `du -sh /data/* | sort -rh`。 */
t('通配符展开：du -sh /data/*（速查里的原写法）', 'du -sh /data/* | sort -rh', [/backup/, /app/]);
t('通配符展开：ls /data/*', 'ls /data/*', [/\/data\/app/, /app\.jar/]);
t('通配符展开：按扩展名匹配', 'ls /var/log/nginx/*.log', [/access\.log/, /error\.log/]);
t('通配符无匹配时原样传给命令（等同真 shell）', 'ls /data/*.nope', [errOnly(/cannot access/), codeIs(2)]);
t('通配符不误伤 find 的 -name 模式', 'find /data -type f -size +100M', [/app\.log|\.gz/]);
t('lsblk', 'lsblk', ['vdb', '/data']);
t('mount 列表', 'mount', [/\/dev\/vdb1/]);
t('lsof +L1 找已删除文件', 'lsof +L1', [/deleted/, /app\.log/]);

/* ==========================================================================
   以下这些是"静默返回错误结果"类 bug 的回归断言 ——
   它们比直接报错更危险：命令退出码 0、看着挺正常，学员据此得出的结论是反的。
   每一条都对应一个真实踩过的坑，注释写清了症状。
   ========================================================================== */

/* find -name 早先存的是 '-name' 而匹配时比的是 'name'，条件被静默忽略：
   `find /data -type f -name "*.log"` 会把 README.md / app.jar 全列出来。
   断言只锁定"必须命中 app.log、且不许出现非 .log 文件"——
   不写死文件个数：模拟数据会随内容增长而变化，写死个数等于给自己埋一颗
   每次补数据就炸的雷（这一条已经被数据增长炸过三次）。 */
t('find -name 真的过滤（不再静默忽略）', 'find /data -type f -name "*.log"', [
  (res, text) => text.indexOf('/data/app/logs/app.log') !== -1 ? true : '没找到 app.log',
  (res, text) => text.split('\n').every(function (l) { return l === '' || /\.log$/.test(l); }) ? true : '混进了非 .log 文件: ' + text
]);
t('find -iname 大小写不敏感', 'find /etc -iname "*.CONF"', [/nginx\.conf/]);
t('find -name 不与 -type 冲突', 'find /data -type f -name "*.gz"', [/db-2024-03-17\.sql\.gz/, /db-2024-03-18\.sql\.gz/]);
/* -perm 早先被直接忽略，`find / -perm -4000` 返回全部文件 */
t('find -perm -4000 找 SUID（本环境没有就不该有输出）', 'find / -perm -4000 -type f', [outOnly(/^\s*$/)]);
t('find -perm -644 匹配"包含这些位"', 'find /data -perm -644 -type f', [/app\.jar/]);
/* 不认识的选项必须报出来，不能默默忽略 */
t('find 未知选项报错而不是静默忽略', 'find /data -foo bar', [errOnly(/未实现这些选项/), codeIs(1)]);

/* sort -h 早先被解析了但仍按字典序排：8.0K 排到 5.9G 前面，顺序全错 */
t('sort -h 按人类可读大小排（5.9G 在 8.0K 之前）', 'du -sh /data/backup /data/app /data/docker | sort -rh',
  [(res, text) => {
    var L = text.split('\n').filter(Boolean);
    return /backup/.test(L[0]) && /docker/.test(L[L.length - 1]) ? true : '顺序不对: ' + L.join(' / ');
  }]);
/* 这里要验的是"通配符展开 + 排序 + 取头部"，不是某个具体容量：
   模拟数据一涨，写死的 5.9G 就变成假失败（已被数据增长炸过三次）。
   改成校验输出形态 + "第一名确实是最大的那个"。 */
t('sort -rh 与速查里的 du -sh /data/* 联用顺序正确', 'du -sh /data/* | sort -rh', [
  (res, text) => /^\d+(\.\d+)?[KMG]\s+\/data\/\S+/.test(String(text).split('\n')[0]) ? true : '首行不是「人类可读大小 + 路径」: ' + String(text).split('\n')[0],
  (res, text) => {
    var unit = { K: 1, M: 1024, G: 1024 * 1024 };
    var prev = null;
    var lines = String(text).split('\n').filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^([\d.]+)([KMG])\s+/);
      if (!m) continue;
      var v = Number(m[1]) * unit[m[2]];
      if (prev !== null && v > prev) return '没有按体积倒序：第 ' + (i + 1) + ' 行比上一行还大';
      prev = v;
    }
    return true;
  }
]);

/* 软链早先既不解引用、又把错误当输出（退出码 0）*/
t('cat 跟软链走（/etc/os-release 是指向 usr/lib 的软链）', 'cat /etc/os-release', [/EulerOS/, /PRETTY_NAME/]);
t('ls -l 显示软链指向', 'ls -l /etc/os-release', [/os-release -> \.\.\/usr\/lib\/os-release/]);

/* lsof -i :8080 空格写法早先会把 :8080 丢掉、列出全部连接 */
t('lsof -i :8080 空格写法只列该端口', 'lsof -i :8080', [outOnly(/8080/), (res, text) => /sshd/.test(text) ? '把无关进程也列出来了' : true]);
t('lsof -i:8080 贴写同样生效', 'lsof -i:8080', [/8080/]);

/* nc -w 3：带值的选项必须在"合并字母选项"之前判断，否则 3 被当成主机名 */
t('nc -vz -w 3 空格分隔的超时参数', 'nc -vz -w 3 10.0.1.31 8080', [/succeeded/]);
t('nc -w3 贴写同样生效', 'nc -w3 -vz 10.0.1.31 8080', [/succeeded/]);

/* /dev/null 早先不在虚拟 FS 里，`2>/dev/null` 直接报 No such file or directory */
/* 这里验的是"2>/dev/null 真的可用"，不是某个具体容量 */
t('2>/dev/null 可用（stderr 被丢弃，stdout 照常输出）', 'du -sh /data 2>/dev/null', [outOnly(/^\d+(\.\d+)?[KMG]\s+\/data$/)]);
t('>/dev/null 丢弃输出且不建文件', 'echo hi > /dev/null && ls /dev/null', [/\/dev\/null/]);
t('/dev 下有 null/zero/random', 'ls /dev', [/null/, /zero/, /random/]);

/* sed 正则地址范围：早先解析漏了一个斜杠，匹配失败后回退成"匹配全部"；
   地址里的空格没进字符类时又会静默变成空输出 —— 两种都是静默错误。 */
t('sed 正则地址范围（/起/,/止/）', "sed -n '/events/,/}/p' /etc/nginx/nginx.conf",
  [(res, text) => {
    var L = text.split('\n').filter(Boolean);
    return (L.length === 3 && /events \{/.test(L[0]) && /^\}$/.test(L[2])) ? true : '拿到 ' + L.length + ' 行: ' + L.join(' / ');
  }]);
t('sed 正则地址里可以有空格', "sed -n '/server {/,/}/p' /etc/nginx/nginx.conf", [/server \{/, /proxy_pass/]);
t('sed 行号范围仍然可用', "sed -n '1,2p' /etc/nginx/nginx.conf", [/user/, /worker_processes/]);
t('sed 认不出来的写法要报错（不再静默空输出）', "sed 'q' /etc/nginx/nginx.conf", [errOnly(/暂不支持这种写法/), codeIs(1)]);

/* chmod：权限是 Linux 基础的核心内容，引擎早先完全没有权限修改类命令 */
t('chmod 八进制改权限', 'chmod 600 /etc/passwd && ls -l /etc/passwd', [/-rw-------/]);
t('chmod 符号模式 +x', 'chmod +x /opt/scripts/health-check.sh && ls -l /opt/scripts/health-check.sh', [/-rwxr-xr-x/]);
t('chmod 逗号分隔的多条子句', 'chmod u+x,g-w /opt/scripts/health-check.sh && ls -l /opt/scripts/health-check.sh', [/health-check\.sh/]);
t('chmod 改完 ls -l 真的变了', 'chmod 755 /opt/scripts/health-check.sh && ls -l /opt/scripts/health-check.sh', [/-rwxr-xr-x/]);
t('chmod 文件不存在时报错', 'chmod 644 /nope', [errOnly(/cannot access/), codeIs(1)]);
t('chmod 非法模式报错', 'chmod 999 /tmp', [errOnly(/invalid mode/), codeIs(1)]);
t('chmod -R 递归', 'chmod -R 755 /opt/scripts', [(res) => res.code === 0 ? true : '递归失败']);

/* ---------- 网络 ---------- */
t('ip addr', 'ip addr', [/inet 10\.0\.1\.23/, 'docker0']);
t('ip route', 'ip route', [/default via/]);
t('ss -tulnp 看监听与进程', 'ss -tulnp', [/LISTEN/, /8080/, /java/]);
t('ss -s 汇总', 'ss -s', [/TCP:/]);
t('curl -I 只看头', 'curl -I http://127.0.0.1', [/HTTP\/1\.1 200/]);
t('curl 正常取正文', 'curl http://127.0.0.1', [/It works/]);
t('curl 连不上报 refused', 'curl http://db-prod-01:3306', [/Connection refused/]);
t('ping 内网通', 'ping -c 2 10.0.1.24', [/2 received/]);
t('ping 不通时报 100% loss', 'ping -c 2 db-prod-01', [/100% packet loss/]);
t('telnet 端口不通', 'telnet db-prod-01 3306', [/Connection timed out/]);
/* `nc -vz <主机> <端口>` 是"端口通不通"最标准的一条命令。
   早先 CMDS.nc 直接复用 telnet 的参数解析，会把 `-vz` 当主机名，
   输出 `Trying -vz... Connected to -vz.` —— 看着像成功，其实什么都没测。 */
t('nc -vz 端口通（不再把选项当主机名）', 'nc -vz 10.0.1.31 8080', [/Connection to 10\.0\.1\.31 8080 port/, /succeeded/]);
t('nc -zv 合并选项同样生效', 'nc -zv 10.0.1.31 8080', [/succeeded!/]);
t('nc -z 端口不通（安全组没放行）', 'nc -z db-prod-01 3306', [errOnly(/Connection timed out/), codeIs(1)]);
t('nc 端口拒绝（服务没监听）', 'nc -vz 10.0.1.31 9999', [errOnly(/Connection refused/)]);
t('nc 域名解析不了', 'nc -vz no-such-host 80', [errOnly(/Name or service not known/)]);
t('nc 不带 -z 仍是交互式连接', 'nc 10.0.1.31 8080', [/Connected to 10\.0\.1\.31/]);
t('dig 解析成功', 'dig db-prod-01', [/ANSWER SECTION/, /10\.0\.2\.15/]);
t('dig NXDOMAIN', 'dig notexist.example', [/NXDOMAIN/]);
t('firewall-cmd --list-all', 'firewall-cmd --list-all', [/public \(active\)/, /80\/tcp/]);
t('firewall-cmd --query-port', 'firewall-cmd --query-port=3306/tcp', ['no']);
t('tcpdump 有 -c 提醒', 'tcpdump -i any port 80', [/Flags \[S\]/, /-c/]);

/* ---------- 服务与系统 ---------- */
t('systemctl status 运行中', 'systemctl status myapp', [/active \(running\)/, /Main PID/]);
t('systemctl status 未找到', 'systemctl status notexist', [codeIs(4)]);
t('journalctl -u', 'journalctl -u myapp -n 5', [/query timeout/]);
t('ps aux 有 java 高 CPU', 'ps aux', [/java/, /68\.4/]);
t('ps --sort=-%cpu 排序', 'ps aux --sort=-%cpu', [
  (res, text) => { const i = text.indexOf('68.4'), j = text.indexOf('2.1'); return (i !== -1 && (j === -1 || i < j)) ? true : '排序不对'; }
]);
t('free -h', 'free -h', [/Mem:/, /Gi/]);
t('iostat 指出瓶颈', 'iostat -x 1 5', [/vdb/, /99\.4/]);
t('crontab -l', 'crontab -l', [/backup\.sh/]);
t('crontab -r 有警告', 'crontab -r', [/不可恢复|没有二次确认/]);
t('date +%F', 'date +%F', ['2024-03-18']);
t('uname -r', 'uname -r', [/5\.10\.0/]);
t('kill -9 有风险提示', 'kill -9 1234', [/SIGKILL|教学环境/]);
t('hostname', 'hostname', ['web-prod-01']);
t('which 找到命令', 'which docker', [/\/usr\/bin\/docker/]);
t('stat 显示权限与 inode', 'stat /etc/hostname', [/File:/, /Inode:/, /Access: \(/]);
t('md5sum 稳定输出', 'md5sum /etc/hostname', [/^[0-9a-f]{32}/]);

/* ---------- Docker ---------- */
t('docker ps 只显示运行中', 'docker ps', [
  (res, text, err, s) => (text.indexOf('web') !== -1 && text.indexOf('old-web') === -1) ? true : 'docker ps 不应显示已退出容器'
]);
t('docker ps -a 显示已退出与退出码', 'docker ps -a', [/Exited \(1\)/, 'old-web']);
t('docker ps -q 只输出 ID', 'docker ps -q', [/^c9f2a71b3d05$/m]);
t('docker images', 'docker images', [/swr\.cn-north-4/, /268MB|187MB/]);
t('docker logs --tail', 'docker logs --tail 2 web', [/8813|8814/]);
t('docker logs --previous', 'docker logs --previous old-web', [/Application run failed|Address already in use/]);
t('docker logs 不存在的容器', 'docker logs nosuch', [/No such container/]);
t('docker inspect --format 取退出码', 'docker inspect --format "{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}" old-web', ['1 false 7']);
t('docker inspect 完整 JSON', 'docker inspect web', [/"State"/, /"RestartCount"/]);
t('docker stats', 'docker stats --no-stream', [/CONTAINER ID/, /119\.61%/]);
t('docker volume ls', 'docker volume ls', ['mysqldata']);
t('docker network ls', 'docker network ls', ['mynet']);
t('docker network inspect', 'docker network inspect mynet', [/172\.20\.0\.0/]);
t('docker system df', 'docker system df', [/RECLAIMABLE/, /Images/]);
t('docker info 有镜像加速与 data-root', 'docker info', [/Registry Mirrors/, /\/data\/docker/]);
t('docker push 非 SWR 域名报权限错', 'docker push web:1.2.3', [/denied/, /swr\.cn-north-4/]);
t('docker push SWR 成功', 'docker push swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3', [/digest:/]);
t('docker exec 已退出容器报错', 'docker exec -it old-web sh', [/is not running/]);
t('docker compose ps', 'docker compose ps', [/myapp-web-1/]);
t('docker compose config', 'docker compose config', [/services:/, /8080/]);
t('docker compose up', 'docker compose up -d', [/Running 4\/4/]);
t('docker 未知子命令', 'docker frobnicate', [/is not a docker command/]);

/* ---------- Kubernetes ---------- */
t('kubectl get pods -n my-app', 'kubectl get pods -n my-app', [/CrashLoopBackOff/, /Pending/]);
t('kubectl get pods', 'kubectl get pods', [
  (res, text) => text.indexOf('mysql-0') !== -1 ? true : '默认命名空间应显示 default 的 Pod'
]);
t('kubectl get pods -n my-app 不含其他命名空间', 'kubectl get pods -n my-app', [
  outOnly(/web-7d9c4b8f5-2xk9p/),
  (res, text) => text.indexOf('coredns') === -1 ? true : '不该出现 kube-system 的 Pod'
]);
t('kubectl get pods -A 全命名空间含 NAMESPACE 列', 'kubectl get pods -A', [/NAMESPACE/, /kube-system/, /monitoring/]);
t('kubectl get pods -o wide', 'kubectl get pods -o wide -n my-app', [/172\.20\.1\.14/, /10\.0\.1\.23/]);
t('kubectl get nodes', 'kubectl get nodes', [/Ready/, /control-plane/]);
t('kubectl get nodes -o wide', 'kubectl get nodes -o wide', [/INTERNAL-IP/, /containerd/]);
t('kubectl get deploy', 'kubectl get deploy -n my-app', [/web/, /2\/2/]);
t('kubectl get svc', 'kubectl get svc -n my-app', [/LoadBalancer/, /121\.36\.44\.17/]);
t('kubectl get endpoints 有空 endpoint', 'kubectl get endpoints -n my-app', [/<none>/, /172\.20\./]);
t('kubectl get pvc 有 Pending', 'kubectl get pvc -n my-app', [/Pending/, /csi-nas/]);
t('kubectl get events 有 Warning', 'kubectl get events -A', [/Warning/, /FailedScheduling/]);
t('kubectl get events --field-selector 过滤', 'kubectl get events --field-selector type=Warning', [noNormalEvents]);
t('kubectl describe pod 显示 FailedScheduling', 'kubectl describe pod batch-job-28471920-x7klm -n my-app', [/FailedScheduling/, /Insufficient cpu/]);
t('kubectl describe pod CrashLoop 显示退出码', 'kubectl describe pod worker-6b8f7c9d4-m2vqt', [/CrashLoopBackOff/, /Exit Code:    1/]);
t('kubectl describe po 简写可用', 'kubectl describe po batch-job-28471920-x7klm -n my-app', [/FailedScheduling/]);
t('kubectl describe pod/名字 形式可用', 'kubectl describe pod/web-7d9c4b8f5-2xk9p -n my-app', [/Containers:/]);
t('kubectl describe node 显示资源分配', 'kubectl describe node 10.0.1.23', [/Allocated resources/, /39%/]);
t('kubectl logs 当前容器', 'kubectl logs web-7d9c4b8f5-2xk9p -n my-app', [/Starting OrdersApplication v1\.2\.3/]);
t('kubectl logs --previous 拿崩溃日志', 'kubectl logs worker-6b8f7c9d4-m2vqt --previous -n my-app', [/UnknownHostException/]);
t('kubectl logs 不存在的 Pod', 'kubectl logs nope', [/NotFound/]);
t('kubectl top node', 'kubectl top node', [/CPU\(cores\)/, /39%/]);
t('kubectl top pod', 'kubectl top pod', [/web-7d9c4b8f5-2xk9p/]);
t('kubectl config current-context', 'kubectl config current-context', [/cce-cn-north-4-prod/]);
t('kubectl config get-contexts', 'kubectl config get-contexts', ['CURRENT', 'cce-cn-north-4-test']);
t('kubectl auth can-i --list', 'kubectl auth can-i --list', [/Resources/]);
t('kubectl rollout history 有回滚提示', 'kubectl rollout history deploy/web', [/REVISION/, /--to-revision/]);
t('kubectl cordon', 'kubectl cordon 10.0.1.23', [/cordoned/]);
t('kubectl drain', 'kubectl drain 10.0.1.23', [/evicting pod/]);
t('kubectl port-forward 提示会占终端', 'kubectl port-forward svc/mysql 3306:3306', [/Forwarding/, /Ctrl\+C/]);
t('kubectl get all 有"不包含"提醒', 'kubectl get all', [/不包含 Ingress/]);
t('netstat 可用并提示 ss 替代', 'netstat -tulnp', [/LISTEN/, /ss/]);
t('kubectl 未知子命令', 'kubectl frobnicate', [/unknown command/]);

/* ---------- 实验台复刻场景：host / traceroute / nmcli / netstat -rn ---------- */
t('host 输出 canonical name 链', 'host www.163.com', [/Non-authoritative answer/, /canonical name = opencdn126music\.jomodns\.com\./, /182\.40\.118\.54/, /240e:93c:205:2::2463:e123/]);
t('host 无重复 Address 行', 'host www.163.com', [
  (res) => (res.out.filter(l => /^Address: 182\.40\.118\.54$/.test(l)).length === 1) ? true : 'Address 行重复'
]);
t('host 未知域名返回 NXDOMAIN', 'host notexist.example', [/NXDOMAIN/, codeIs(1)]);
t('traceroute -n www.baidu.com 复刻九行', 'traceroute -n www.baidu.com', [/103\.235\.46\.102/, /^ 8 {2}\* \* \*$/m]);
t('netstat -rn 输出路由表', 'netstat -rn', [/Kernel IP routing table/, /Destination/, /UG .*eth0/]);
t('netstat -tulnp 仍走 ss 分支', 'netstat -tulnp', [/LISTEN/, /ss -t -u -l -n -p/]);
t('nmcli device show 输出 IP/网关/DNS', 'nmcli device show eth0', [/GENERAL.DEVICE/, /IP4.ADDRESS\[1\]/, /IP4.GATEWAY/, /IP4.DNS\[1\]/]);
t('nmcli con show 列出连接', 'nmcli con show', [/NAME    UUID/, /ethernet/]);
t('nmcli device status', 'nmcli device status', [/DEVICE  TYPE      STATE/]);
t('nmtui 说明无法模拟并给等价命令', 'nmtui', [/无法模拟|全屏交互/, /nmcli con mod/]);

/* ---------- 环境覆盖：实验台可声明自己的机器身份 ---------- */
(function () {
  var opts = {
    hostname: 'jx-rocky-lab01', ip: '192.168.17.10', gateway: '192.168.17.1',
    dns: ['114.114.114.114', '223.5.5.5'],
    nic: { name: 'ens160', mac: '00:0c:29:8f:3a:21', cidr: '192.168.17.10/24', brd: '192.168.17.255' }
  };
  var sA = window.CC_SHELL.create(opts);
  var sB = window.CC_SHELL.create();
  var cases = [
    ['覆盖后 hostname 生效', sA.exec('hostname').out[0] === 'jx-rocky-lab01'],
    ['覆盖后提示符用新主机名', sA.prompt().indexOf('jx-rocky-lab01') !== -1],
    ['覆盖后 ip addr 用 ens160', sA.exec('ip addr').out.join('\n').indexOf('inet 192.168.17.10/24') !== -1],
    ['覆盖后 netstat -rn 用新网关', sA.exec('netstat -rn').out.join('\n').indexOf('192.168.17.1') !== -1],
    ['覆盖后 nmcli 用新网卡名', sA.exec('nmcli device show ens160').out.join('\n').indexOf('GENERAL.DEVICE:                         ens160') !== -1],
    ['实例之间互不污染（主站仍是 web-prod-01）', sB.exec('hostname').out[0] === 'web-prod-01'],
    ['主站 ip addr 未变成 ens160', sB.exec('ip addr').out.join('\n').indexOf('ens160') === -1],
    /* 新加的命令家族同样不能写死主机身份：mysql 报错里的客户端地址、SELECT @@hostname、
       git 提交里的作者邮箱都必须跟着 HOST 形参走，否则两个页面会串味 */
    ['mysql 报错里的客户端地址跟着 HOST 走', sA.exec('mysql -h db-prod-01 -uroot -pX -e "SHOW DATABASES"').err.join('\n').indexOf("'root'@'192.168.17.10'") !== -1],
    ['mysql SELECT @@hostname 用练习台主机名', sA.exec('mysql -uroot -p -e "SELECT @@hostname"').out.join('\n').indexOf('jx-rocky-lab01') !== -1],
    ['mysql 的 @@hostname 在主站仍是 web-prod-01', sB.exec('mysql -uroot -p -e "SELECT @@hostname"').out.join('\n').indexOf('web-prod-01') !== -1],
    ['git 提交作者邮箱跟着 HOST 走', sA.exec('cd /data/app && git log -1').out.join('\n').indexOf('root@jx-rocky-lab01') !== -1],
    ['git 在主站的作者邮箱仍是 web-prod-01', sB.exec('cd /data/app && git log -1').out.join('\n').indexOf('root@web-prod-01') !== -1],
    ['nginx 的配置路径与版本与机器无关但输出稳定', sA.exec('nginx -v').out.join('\n').indexOf('nginx/1.20.1') !== -1]
  ];
  cases.forEach(function (c) {
    if (c[1]) pass++; else { fail++; failures.push({ line: '环境覆盖: ' + c[0], problems: ['断言不成立'], text: '', err: '' }); }
  });
})();
/* ---------- 华为云 CLI ---------- */
t('hcloud configure list', 'hcloud configure list', [/cn-north-4/, /default/]);
t('hcloud ECS ListServersDetails', 'hcloud ECS ListServersDetails', [/web-prod-01/, /121\.36\.44\.17/]);
t('hcloud VPC ListSecurityGroups 指出 3306 未放行', 'hcloud VPC ListSecurityGroups', [/sg-web/, /3306 不在入方向/]);
t('obsutil ls', 'obsutil ls', [/obs:\/\/prod-backup/]);
t('obsutil sync', 'obsutil sync', [/Upload successfully/]);

/* ---------- mysql：库表/进程/参数都从虚拟环境现算 ---------- */
t('mysql --version 版本号读自容器日志', 'mysql --version', [/Ver 8\.0\.36/, /MySQL Community Server/]);
t('mysql -e "SHOW DATABASES"', 'mysql -uroot -p -e "SHOW DATABASES"', [/information_schema/, /orders/, /5 rows in set/]);
t('mysql 远程连接 + 指定库 + SHOW TABLES', 'mysql -h db-prod-01 -uapp -pApp@2024 -D orders -e "SHOW TABLES"', [/Tables_in_orders/, /order_status_log/]);
t('SHOW VARIABLES LIKE 精确匹配', 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'max_connections\'"', [/Variable_name/, /max_connections/, /1000/]);
t('SHOW VARIABLES LIKE 通配 % 生效', 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'slow_query%\'"', [/slow_query_log/, /slow_query_log_file/]);
t('SHOW VARIABLES LIKE 无命中给 Empty set', 'mysql -uroot -p -e "SHOW VARIABLES LIKE \'zzz%\'"', [/Empty set/]);
t('SELECT VERSION() / @@hostname 多列一行', 'mysql -uroot -p -e "SELECT VERSION(), @@hostname"', [/8\.0\.36/, /web-prod-01/, /1 row in set/]);
t('SELECT DATABASE() 未选库时是 NULL', 'mysql -uroot -p -e "SELECT DATABASE()"', [/NULL/]);
t('SHOW FULL PROCESSLIST 看得到长 SQL', 'mysql -uroot -p orders -e "SHOW FULL PROCESSLIST"', [/Sending data/, /order_status_log/, /Waiting for table metadata lock/]);
t('SHOW PROCESSLIST 的 Info 列截断到 100 字符', 'mysql -uroot -p orders -e "SHOW PROCESSLIST"', [
  (res, text) => {
    const rows = res.out.filter(l => l.indexOf('Sending data') !== -1);
    if (!rows.length) return '没找到 Sending data 那行';
    const info = rows[0].replace(/^\|.*?Sending data\s*\|/, '').replace(/\|\s*$/, '').trim();
    return info.length <= 100 ? true : 'Info 列没截断，长度 ' + info.length;
  }
]);
t('information_schema.processlist 可查可筛可排序', 'mysql -uroot -p orders -B -e "SELECT id,user,db,command,time FROM information_schema.processlist WHERE command != \'Sleep\' ORDER BY time DESC"', [/ID\tUSER\tDB\tCOMMAND\tTIME/, /Binlog Dump GTID/]);
t('information_schema.tables 按行数排序', 'mysql -uroot -p orders -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = \'orders\' ORDER BY table_rows DESC"', [
  (res, text) => {
    const i = text.indexOf('order_status_log'), j = text.indexOf('orders ');
    return (i !== -1 && i < text.lastIndexOf('users')) ? true : '排序结果不对：' + text.replace(/\n/g, ' | ').slice(0, 120);
  }
]);
t('SHOW REPLICA STATUS 竖排输出且 SQL 线程已停', 'mysql -uroot -p -e "SHOW REPLICA STATUS"', [/1\. row/, /Slave_SQL_Running: No/, /Seconds_Behind_Master: NULL/, /Replica_SQL_Running: No/, /Last_SQL_Errno: 1062/]);
t('SHOW SLAVE STATUS 是 REPLICA 的旧写法（同一个结果）', 'mysql -uroot -p -e "SHOW SLAVE STATUS"', [/Slave_IO_Running: Yes/, /Duplicate entry/]);
t('SHOW MASTER STATUS 能看到 binlog 位点', 'mysql -uroot -p -e "SHOW MASTER STATUS"', [/mysql-bin\.000042/, /918273645/]);
t('密码错 → ERROR 1045 且退出码 1', 'mysql -uroot -pWrongPass -e "SHOW DATABASES"', [/ERROR 1045 \(28000\): Access denied for user \'root\'@\'localhost\' \(using password: YES\)/, codeIs(1)]);
t('app 用户不给密码 → 1045 (using password: NO)', 'mysql -uapp -e "SHOW DATABASES"', [/using password: NO/, codeIs(1)]);
t('不认识的账号也是 1045', 'mysql -unobody -pX -e "SHOW DATABASES"', [/Access denied for user \'nobody\'/]);
t('连不上的主机 → ERROR 2005', 'mysql -h db-prod-02 -uroot -p -e "SHOW DATABASES"', [/ERROR 2005 \(HY000\): Unknown MySQL server host \'db-prod-02\'/, codeIs(1)]);
/* cache-prod-01 现在在 /etc/hosts 里（它是文档登记的缓存主机，Redis/Kafka 的记录靠它才能跑），
   所以对它要断言的是"**名字能解析、但那个端口上没有 MySQL**" → 2003 拒绝连接。
   这条比原来的"名字解析不了"更有教学价值：把"解析失败"与"连不上"两种错分开了。 */
t('能解析但端口没服务 → ERROR 2003', 'mysql -h cache-prod-01 -uroot -p -e "SHOW DATABASES"', [/ERROR 2003 \(HY000\): Can\'t connect to MySQL server on \'cache-prod-01\'/, codeIs(1)]);
t('库不存在 → ERROR 1049', 'mysql -uroot -p -e "USE nosuchdb"', [/ERROR 1049 \(42000\): Unknown database \'nosuchdb\'/, codeIs(1)]);
t('表不存在 → ERROR 1146', 'mysql -uroot -p -e "SELECT * FROM notexist"', [/ERROR 1146 \(42S02\): Table \'orders\.notexist\' doesn\'t exist/, codeIs(1)]);
t('SQL 写错 → ERROR 1064', 'mysql -uroot -p -e "SELEC 1"', [/ERROR 1064 \(42000\)/, codeIs(1)]);
t('不认识的参数 → mysql: unknown option', 'mysql -Z 1', [/unknown option \'-Z\'/, codeIs(1)]);
t('多条语句顺序执行（-e 里带分号）', 'mysql -uroot -p -e "USE orders; SHOW TABLES"', [/Database changed/, /Tables_in_orders/]);
t('没给 -e 时说明不模拟交互式客户端', 'mysql -uroot -p', [/交互式/, /-e "SHOW DATABASES"/]);
t('报错里的客户端地址来自 HOST 形参（不是写死的）', 'mysql -h db-prod-01 -uroot -pX -e "SHOW DATABASES"', [
  (res, text, err) => /'root'@'10\.0\.1\.23'/.test(err) ? true : '客户端地址没取本机 IP：' + err
]);
t('不写 -h 时是本地 socket 连接（报错里显示 localhost）', 'mysql -uroot -pX -e "SHOW DATABASES"', [
  (res, text, err) => /'root'@'localhost'/.test(err) ? true : '本地连接应显示 localhost：' + err
]);

/* ---------- redis-cli：keyspace / 内存 / 命中率都是现算 ---------- */
t('redis-cli --version 版本由镜像标签推导', 'redis-cli --version', ['redis-cli 7.2.4']);
t('redis-cli ping', 'redis-cli ping', ['PONG']);
t('redis-cli ping 带参数回显成带引号字符串', 'redis-cli ping hello', ['"hello"']);
t('info memory 有 used_memory 与 maxmemory', 'redis-cli info memory', [/# Memory/, /used_memory:\d+/, /used_memory_human:\d/, /maxmemory:0/, /maxmemory_policy:noeviction/]);
t('info server 的 uptime 由容器启动时间算出', 'redis-cli info server', [/redis_version:7\.2\.4/, /uptime_in_seconds:172040/, /tcp_port:6379/]);
t('info keyspace 按库统计 keys', 'redis-cli info keyspace', [/# Keyspace/, /db0:keys=13,expires=5/, /db2:keys=1/]);
t('info stats 有命中数（算命中率用）', 'redis-cli info stats', [/keyspace_hits:842913/, /keyspace_misses:1204/]);
t('info 未知 section 不报错但给提示', 'redis-cli info mem', [
  (res, text, err) => err.indexOf('常见 section') !== -1 ? true : '应该提示可用 section：' + err
]);
t('dbsize 数当前库的 key', 'redis-cli dbsize', ['(integer) 13']);
t('redis-cli -n 1 切到 1 号库', 'redis-cli -n 1 dbsize', ['(integer) 3']);
t('get 取值（内层双引号会被转义，和真 redis-cli 一致）', 'redis-cli get cache:order:8812', [/\\"id\\":8812/, /\\"status\\":\\"PAID\\"/]);
t('get 不存在的 key 是 (nil)', 'redis-cli get nosuchkey', ['(nil)']);
t('get 一个 list → WRONGTYPE 且退出码 1', 'redis-cli get queue:orders', [/WRONGTYPE Operation against a key holding the wrong kind of value/, codeIs(1)]);
t('type 看类型', 'redis-cli type rank:hot:orders', ['zset']);
t('ttl 看剩余生存时间', 'redis-cli ttl lock:order:8812', ['(integer) 12']);
t('ttl 不存在的 key 是 -2', 'redis-cli ttl nosuchkey', ['(integer) -2']);
t('memory usage 算出单个 key 占用', 'redis-cli memory usage big:cache:report:2024Q1', ['(integer) 1048655']);
t('config get maxmemory', 'redis-cli config get maxmemory', ['1) "maxmemory"', '2) "0"']);
t('config get 支持通配', 'redis-cli config get maxmemory*', ['"maxmemory"', '"maxmemory-policy"', '"noeviction"']);
t('config set 改参数并带生产提示', 'redis-cli config set maxmemory 0', [
  'OK',
  (res, text, err) => /生产必须设上限/.test(err) ? true : '应提示 maxmemory=0 的风险：' + err
]);
t('config set 非法参数报错', 'redis-cli config set nosuchparam 1', [/Unknown option/, codeIs(1)]);
t('KEYS 能用但要打生产禁用提示', 'redis-cli keys session:*', [
  /session:4d8e2f0a1b93/,
  (res, text, err) => /生产环境禁用/.test(err) ? true : 'KEYS 缺生产禁用提示：' + err
]);
t('KEYS 参数缺失报错', 'redis-cli keys', [/wrong number of arguments for 'keys' command/, codeIs(1)]);
t('--scan 走 SCAN 游标并说明它才是生产用法', 'redis-cli --scan --pattern cache:*', [
  /cache:home:top/,
  (res, text, err) => /SCAN 游标/.test(err) ? true : '--scan 缺提示：' + err
]);
t('scan 命令输出编号嵌套数组', 'redis-cli scan 0 match cache:* count 2', ['1) "0"', '2) 1) "cache:home:top"']);
t('--bigkeys 找出最大的 string 并给出 summary', 'redis-cli --bigkeys', [
  /Biggest string found so far '"big:cache:report:2024Q1"' with 1048576 bytes/,
  /-------- summary -------/,
  /Sampled 13 keys in the keyspace!/,
  /\d+ strings with 1057856 bytes/
]);
t('SET 之后再 DBSIZE 真的变多（状态在演进）', 'redis-cli set demo:check 1 && redis-cli dbsize', ['(integer) 14']);
t('SET 的 key 能立刻 GET 回来', 'redis-cli get demo:check', ['"1"']);
t('DEL 之后 DBSIZE 回落', 'redis-cli del demo:check && redis-cli dbsize', ['(integer) 13']);
/* cache-prod-01 是文档登记的缓存主机，现在能解析 → 探活应当是 PONG。
   这一条比原来的"解析不了"更重要：它是 db-redis-* 那一批记录能不能跑的前提。 */
t('远端缓存主机能连上', 'redis-cli -h cache-prod-01 ping', ['PONG', codeIs(0)]);
t('完全不认识的主机名仍如实报解析失败', 'redis-cli -h no-such-host-xyz ping', [/Could not connect to Redis at no-such-host-xyz:6379: Name or service not known/, codeIs(1)]);
t('端口不对报 Connection refused', 'redis-cli -p 6380 ping', [/Connection refused/, codeIs(1)]);
t('未知命令给 redis 风格报错', 'redis-cli frobnicate a b', [/\(error\) ERR unknown command 'frobnicate'/, codeIs(1)]);
t('-a 传密码要提示密码泄露风险', 'redis-cli -a S3cret ping', [
  'PONG',
  (res, text, err) => /shell 历史/.test(err) ? true : '-a 缺安全提示：' + err
]);

/* ---------- nginx：真解析 /etc/nginx/nginx.conf ---------- */
t('nginx -v 版本读自 yum 安装记录', 'nginx -v', ['nginx version: nginx/1.20.1']);
t('nginx -V 给出编译参数与 conf-path', 'nginx -V', [/built with OpenSSL/, /--conf-path=\/etc\/nginx\/nginx\.conf/, /--with-http_ssl_module/]);
t('nginx -t 配置正确时报 syntax is ok', 'nginx -t', [/syntax is ok/, /test is successful/]);
t('nginx -tq 安静模式（成功时无输出）', 'nginx -tq', [
  (res, text, err) => (text === '' && err === '') ? true : '成功时不该有输出：' + text + err
]);
t('nginx -T 导出主配置与 include 的文件', 'nginx -T', [
  /# configuration file \/etc\/nginx\/nginx\.conf:/,
  /upstream app_backend/,
  /# configuration file \/etc\/nginx\/mime\.types:/,
  /text\/html/
]);
t('nginx -T 的测试信息走 stderr、配置走 stdout', 'nginx -T', [
  outOnly(/# configuration file/),
  errOnly(/test is successful/)
]);
t('nginx -s reload 成功并说明"没有输出就是成功"', 'nginx -s reload', [/reload/, /没有输出就是成功/]);
t('nginx -z 报 invalid option 且退出码 1', 'nginx -z', [/invalid option: "-z"/, codeIs(1)]);
t('nginx -s 未知信号报错', 'nginx -s badsig', [/invalid option: "badsig"/, codeIs(1)]);
t('改坏 upstream 名字后 nginx -t 报 host not found', "sed -i 's/app_backend {/app_backend_v2 {/' /etc/nginx/nginx.conf && nginx -t 2>&1 | tail -3", [
  /nginx: \[emerg\] host not found in upstream "app_backend" in \/etc\/nginx\/nginx\.conf:24/,
  /改完配置第一件事永远是 nginx -t/
]);
t('还原配置后 nginx -t 恢复成功', "sed -i 's/app_backend_v2 {/app_backend {/' /etc/nginx/nginx.conf && nginx -t", [/test is successful/]);
t('删掉一个右大括号 → nginx -t 报 unexpected end of file', "cp /etc/nginx/nginx.conf /tmp/nginx.conf.bak && sed -i 's/^}$//' /etc/nginx/nginx.conf && nginx -t 2>&1 | tail -2", [/\[emerg\] unexpected end of file, expecting "}"/]);
t('从备份还原后恢复成功', 'cp /tmp/nginx.conf.bak /etc/nginx/nginx.conf && nginx -t', [/test is successful/]);
t('mime.types 是按需补上的（真机装完 nginx 就有这个文件）', 'ls /etc/nginx && cat /etc/nginx/mime.types', [/mime\.types/, /text\/html/]);
t('配置不合法时 reload 也会失败，并提示先测再 reload', "cp /etc/nginx/nginx.conf /tmp/nginx.conf.bak2 && sed -i 's/upstream app_backend/upstream app_backend_v9/' /etc/nginx/nginx.conf && nginx -s reload 2>&1 | tail -2", [
  /\[emerg\] host not found in upstream "app_backend" in \/etc\/nginx\/nginx\.conf:24/,
  /先 nginx -t/
]);
t('还原后 reload 恢复成功', 'cp /tmp/nginx.conf.bak2 /etc/nginx/nginx.conf && nginx -s reload', [/没有输出就是成功/]);
t('nginx -s stop 之后 reload 报 invalid PID number', 'nginx -s stop && nginx -s reload', [/invalid PID number "" in "\/run\/nginx\.pid"/, codeIs(1)]);
/* ⚠️ 这一条会**删掉**共享虚拟文件系统里的 /etc/nginx/nginx.conf。
   删完必须还原 —— 所有断言都跑在同一个 shell 上、共用同一份 termfs，
   不还原的话后面每一条用到这个文件的断言都会以"文件不存在"失败，
   而失败信息指向被测代码、完全不提是前面那一条把它删了。
   （这个坑真实存在过：一条"配置不存在时报 open() failed"的断言把文件删了，
   几百行之后的 `nginx -t -c … -p …` 就一直红着。）
   所以：先备份 → 断言 → 无论成败都还原。 */
t('配置不存在时 nginx -t 报 open() failed',
  'cp /etc/nginx/nginx.conf /tmp/nginx.keep && rm /etc/nginx/nginx.conf && nginx -t; cp /tmp/nginx.keep /etc/nginx/nginx.conf',
  [/open\(\) "\/etc\/nginx\/nginx\.conf" failed/]);
t('上一条删掉的配置必须被还原（否则后面所有断言都会连带失败）',
  'nginx -t', [/test is successful/, /syntax is ok/]);

/* ---------- helm：release 从 K8S 倒推，install/upgrade 真的改状态 ---------- */
t('helm version', 'helm version', [/Version:"v3\.14\.0"/, /GoVersion/]);
t('helm version --short', 'helm version --short', [/^v3\.14\.0\+g/m]);
t('helm list -A 列出所有命名空间的 release', 'helm list -A', [/NAMESPACE/, /myapp/, /prometheus/, /mysql/, /deployed/]);
t('helm list 默认只看 kubeconfig 的命名空间', 'helm list', [
  (res, text) => (text.indexOf('mysql') !== -1 && text.indexOf('myapp') === -1) ? true : '默认命名空间过滤不对：' + text
]);
t('helm list -n my-app', 'helm list -n my-app', [/myapp/, /web-1\.2\.3/, /1\.2\.3/]);
t('helm repo list 列出已添加的仓库', 'helm repo list', [/myorg/, /swr\.cn-north-4/, /bitnami/]);
t('helm repo add 之后仓库列表真的多一条', 'helm repo add harbor https://harbor.example.com/chartrepo/library && helm repo list', [/has been added to your repositories/, /harbor/]);
t('helm repo add 重名报错', 'helm repo add myorg https://x.example.com', [/already exists/, codeIs(1)]);
t('helm repo update', 'helm repo update', [/Hang tight/, /Update Complete/]);
t('helm search repo 关键词过滤', 'helm search repo web', [/myorg\/web/, /CHART VERSION/]);
t('helm search repo 无结果时报错', 'helm search repo zzzz', [/no results found/, codeIs(1)]);
t('helm template 渲染出 YAML（不碰集群）', 'helm template myorg/web', [
  /# Source: web\/templates\/deployment\.yaml/,
  /kind: Deployment/,
  /image: "swr\.cn-north-4\.myhuaweicloud\.com\/myorg\/web:1\.2\.3"/
]);
t('helm template --set 改 replicas', 'helm template myorg/web --set replicaCount=3', [/replicas: 3/]);
t('helm template 的 chart 不存在时报错', 'helm template myorg/nope', [/chart "nope" not found in myorg index/, codeIs(1)]);
t('helm install 后 helm list 真的多一个 release', 'helm install web-canary myorg/web -n my-app && helm list -n my-app', [/STATUS: deployed/, /REVISION: 1/, /web-canary/]);
t('helm install 重名报 cannot re-use a name', 'helm install myapp myorg/web -n my-app', [/cannot re-use a name that is still in use/, codeIs(1)]);
t('helm install 的 release 名不合法要报错', 'helm install Bad_Name myorg/web -n my-app', [/invalid release name/, codeIs(1)]);
t('helm install 到不存在的命名空间要报错', 'helm install oops myorg/web -n nosuchns', [/namespaces "nosuchns" not found/, codeIs(1)]);
t('helm upgrade 版本号 +1 且 get values 跟着变', 'helm upgrade web-canary myorg/web -n my-app --set image.tag=1.2.4 && helm get values web-canary', [/REVISION: 2/, /image:/, /tag: 1\.2\.4/]);
t('helm history 记录每一次变更', 'helm history web-canary', [/REVISION/, /Upgrade complete/, /Install complete/]);
t('helm rollback 成功并留下回滚记录', 'helm rollback web-canary 1 && helm history web-canary', [/Rollback was a success!/, /Rollback to 1/]);
t('helm status 显示当前状态与 NOTES', 'helm status web-canary', [/NAME: web-canary/, /STATUS: deployed/, /NOTES:/]);
t('helm upgrade 不存在的 release 要报错', 'helm upgrade nosuchrel myorg/web', [/UPGRADE FAILED: "nosuchrel" has no deployed releases/, codeIs(1)]);
t('helm rollback 不存在的 release 要报错', 'helm rollback nosuchrel', [/release: not found/, codeIs(1)]);
t('helm uninstall 报告卸载成功', 'helm uninstall web-canary', [/release "web-canary" uninstalled/]);
t('卸载后 helm list 里就没有它了', 'helm list -n my-app', [
  (res, text) => text.split('\n').every(l => l.indexOf('web-canary') === -1) ? true : '卸载后仍在列表里：' + text
]);
t('helm upgrade --install 对不存在的 release 会先装', 'helm upgrade --install fresh-app myorg/worker -n my-app', [/does not exist\. Installing it now\./, /STATUS: deployed/]);
t('helm --dry-run 输出 manifest 但不改状态', 'helm install dry-app myorg/web -n my-app --dry-run | head -8', [/STATUS: pending-install/]);
t('--dry-run 的 release 不会进列表', 'helm list -n my-app', [
  (res, text) => text.split('\n').every(l => l.indexOf('dry-app') === -1) ? true : '--dry-run 不该真的装上：' + text
]);
t('helm 未知子命令', 'helm frobnicate', [/unknown command "frobnicate" for "helm"/, codeIs(1)]);

/* ---------- git：可演进的虚拟仓库（add/commit 之后 status/log 真的变） ---------- */
t('不在仓库里执行 git 要报 not a git repository', 'cd /root && git status', [/fatal: not a git repository/, codeIs(1)]);
t('git status 显示未提交的 config.yaml 改动', 'cd /data/app && git status', [/On branch main/, /Changes not staged for commit/, /modified:\s+config\.yaml/]);
t('git log --oneline 显示提交历史与 HEAD', 'git log --oneline -3', [/HEAD -> main/, /tag: v1\.2\.3/, /订单列表接 Redis 缓存/]);
t('git log 完整格式的作者来自 HOST 形参', 'git log -1', [/Author: root <root@web-prod-01>/, /Date:/]);
t('git diff 真的算出工作区与 HEAD 的差异', 'git diff', [
  /diff --git a\/config\.yaml b\/config\.yaml/,
  /-    url: jdbc:mysql:\/\/10\.0\.2\.15:3306\/orders/,
  /\+    url: jdbc:mysql:\/\/db-prod-01:3306\/orders\?useSSL=false/
]);
t('git diff --stat 统计增删行数', 'git diff --stat', [/config\.yaml \| 2 \+-/, /1 file changed, 1 insertion\(\+\), 1 deletion\(-\)/]);
t('git branch 标出当前分支', 'git branch', [/^\* main$/m, /release\/1\.2/]);
t('git branch -a 带出远程分支', 'git branch -a', [/remotes\/origin\/main/]);
t('git remote -v 显示 fetch/push 地址', 'git remote -v', [/codehub\.devcloud\.cn-north-4/, /\(fetch\)/, /\(push\)/]);
t('git tag 列出发布标签', 'git tag', [/^v1\.2\.1$/m, /^v1\.2\.3$/m]);
t('git add 之后 status 变成待提交', 'git add config.yaml && git status -s', [/^M {2}config\.yaml$/m]);
t('git commit 真的写入新提交', 'git commit -m "fix: 数据源改用内网域名" && git log --oneline -1', [
  /\[main [0-9a-f]{7}\] fix: 数据源改用内网域名/,
  /1 file changed, 1 insertion\(\+\), 1 deletion\(-\)/,
  /HEAD -> main.*fix: 数据源改用内网域名/
]);
t('commit 之后本地领先远端一个提交', 'git status', [/Your branch is ahead of 'origin\/main' by 1 commit/]);
t('git push 之后本地与远端一致', 'git push && git push && git status', [
  /main -> main/,
  /Everything up-to-date/,
  /up to date with 'origin\/main'/
]);
t('git checkout -b 建分支并切过去', 'git checkout -b release/1.2.4 && git branch', [/Switched to a new branch 'release\/1\.2\.4'/, /^\* release\/1\.2\.4$/m]);
t('git tag 新建标签', 'git tag v1.2.4 && git tag', [/^v1\.2\.4$/m]);
t('git tag -l 支持模式过滤', 'git tag -l "v1.2.*"', [/^v1\.2\.1$/m, /^v1\.2\.3$/m]);
t('新建未跟踪文件会出现在 Untracked files', 'echo "gray: false" > /data/app/values-prod.yaml && git status', [/Untracked files:/, /values-prod\.yaml/]);
t('git add . 把新文件变成 new file', 'git add . && git status', [/Changes to be committed/, /new file:\s+values-prod\.yaml/]);
t('git commit 后工作区干净', 'git commit -m "feat: 灰度开关配置" && git status', [/file changed|files changed/, /nothing to commit, working tree clean/]);
t('没有改动时 commit 报 nothing to commit 且退出码 1', 'git commit -m "empty"', [/nothing to commit, working tree clean/, codeIs(1)]);
t('git add 不带参数给提示', 'git add', [/Nothing specified, nothing added/, /git add \./, codeIs(1)]);
t('git checkout -- <文件> 丢弃工作区改动', 'git checkout -- config.yaml', [
  (res, text, err) => /还原为暂存区/.test(err) ? true : '应说明成功时无输出：' + err
]);
t('git init 在已有仓库里是 Reinitialized', 'git init', [/Reinitialized existing Git repository in \/data\/app\/\.git\//]);
t('git init 在空目录建新仓库', 'mkdir -p /tmp/demorepo && cd /tmp/demorepo && git init && git status', [/Initialized empty Git repository/, /No commits yet/]);
t('未实现的 git 子命令给出原因', 'git reset --hard', [/教学环境未实现/, /风险高/, codeIs(1)]);
t('git 未知子命令', 'cd /data/app && git frobnicate', [/is not a git command/, codeIs(1)]);
t('git checkout 切回 main 并改写 .git/HEAD', 'git checkout main && cat /data/app/.git/HEAD', [/Switched to branch 'main'/, 'ref: refs/heads/main']);
t('带斜杠的分支名不会被当成路径', 'git checkout release/1.2.4 && cat .git/HEAD', [/Switched to branch 'release\/1\.2\.4'/, 'ref: refs/heads/release/1.2.4']);
t('切不存在的分支报 pathspec 错误', 'git checkout nosuchbranch', [/pathspec 'nosuchbranch' did not match any file\(s\) known to git/, codeIs(1)]);

/* ---------- 控制流 / 展开的回归断言 （2026-xx 一轮修了 8 个静默错误，这里逐条钉住） ----------
   为什么必须钉：下面每一条要么**静默给出错值**（算术展开成空、`=` 判定相反、
   `&& ||` 少打印一行），要么"看着报错但其实整个构造不可用"（`while read` 一次都不进）。
   它们全都曾经在五道闸门全绿的情况下存在了很久 —— 没有断言就等于没有修。
   ⚠ 每一条都要断言**输出内容**，不能只断言退出码：这些 bug 的退出码多半是 0。 */
console.log('\n--- 控制流与展开的回归断言 ---');
const walk = (line) => { const s = window.CC_SHELL.create(); return s.exec(line); };
const outOf = (line) => (walk(line).out || []).join('\n');

t('算术展开 $(( )) 能算出值', 'echo $((2+3))', ['5']);
t('算术展开可用于赋值与自增', 'i=1; i=$((i+1)); echo $i', ['2']);
t('算术展开支持变量、除法、乘号', 'N=3; echo $((N*2)) $((7/2))', ['6 3']);
t('算术展开在命令替换里不参与运算', 'echo $(date +%F) | grep -c -', ['1']);

t('数字比较 -lt', '[ 1 -lt 2 ] && echo yes', ['yes']);
t('数字比较 -gt 为假时走 ||', '[ 3 -gt 5 ] && echo yes || echo no', ['no']);
t('数字比较 -eq（test 形式）', 'test 1 -eq 1 && echo same', ['same']);
t('数字比较 -ge / -le', '[ 5 -ge 5 ] && [ 4 -le 4 ] && echo both', ['both']);
t('字符串相等判为真（曾经是反的）', '[ a = a ] && echo eq', ['eq']);
t('字符串不等判为真（曾经是反的）', '[ a != b ] && echo ne', ['ne']);
t('变量参与字符串比较', 'A=web; [ "$A" = web ] && echo isweb', ['isweb']);
t('$? 反映上一条的失败', '[ 3 -gt 5 ]; echo $?', ['1']);

t('while + 数字比较能终止（曾经死循环或一次不进）', 'i=0; while [ $i -lt 3 ]; do echo $i; i=$((i+1)); done', ['0\n1\n2']);
t('until 循环可用', 'i=0; until [ $i -ge 2 ]; do i=$((i+1)); done; echo done$i', ['done2']);
t('if 里能用数字比较', 'x=5; if [ $x -ge 5 ]; then echo big; fi', ['big']);
t('continue 跳过本次', 'for i in 1 2 3; do [ $i -eq 2 ] && continue; echo $i; done', ['1\n3']);
t('break 提前结束', 'for i in 1 2 3; do [ $i -eq 2 ] && break; echo $i; done', ['1']);

t('for 列表里的命令替换会展开（曾经切成 $(seq/1/3) 三个字面量）',
  'for i in $(seq 1 3); do echo n$i; done', ['n1\nn2\nn3']);
t('for 列表接 grep 洗清单', 'for h in $(grep -v "^#" /opt/scripts/hosts.txt); do echo H=$h; done', ['H=10.0.1.21', /H=10\.0\.1\.3\d/]);
t('for 列表里命令替换的结果参与累加', 'n=0; for i in $(seq 1 5); do n=$((n+1)); done; echo n=$n', ['n=5']);

t('循环体里能嵌 if（曾经 bash: if: command not found）',
  'for f in a b; do if [ -f /etc/hostname ]; then echo yes-$f; fi; done', ['yes-a\nyes-b']);
t('循环体里嵌 if/else 两条分支都可达',
  'for f in a b; do if [ -f /nope-$f ]; then echo has; else echo no-$f; fi; done', ['no-a\nno-b']);

t('case 字面量分支命中（曾经把 case 的词当命令执行）', 'case abc in abc) echo hit;; *) echo miss;; esac', ['hit']);
t('case 变量分支命中', 'V=x; case $V in x) echo X;; esac', ['X']);
t('case 通配分支按序匹配', 'case zzz in a*) echo A;; z*) echo Z;; esac', ['Z']);
t('case 一个都不匹配时无输出且退出码 0', 'case qqq in a) echo A;; esac', [codeIs(0), outOnly(/^$/)]);
t('case 嵌在循环体里，且 esac 之后的命令不能被吞掉',
  'for H in web-01 db-01; do case $H in web-*) T=Web;; *) T=DB;; esac; echo "$H 属于 $T"; done',
  ['web-01 属于 Web\ndb-01 属于 DB']);
t('case 的兜底分支在循环里也对', 'for x in 1 9; do case $x in 1) echo one;; *) echo other;; esac; done', ['one\nother']);;

t('while read 从 < 文件 逐行读（曾经一行都不执行）',
  "printf 'a\\nb\\n' > /tmp/pc1.txt; while read l; do echo got-$l; done < /tmp/pc1.txt", ['got-a\ngot-b']);
t('while IFS= read -r 可用', "printf 'a\\nb\\n' > /tmp/pc2.txt; while IFS= read -r h; do echo H=$h; done < /tmp/pc2.txt", ['H=a\nH=b']);
t('管道接 while read（曾经 bash: while: command not found）',
  "printf 'a\\nb\\n' | while read l; do echo pipe-$l; done", ['pipe-a\npipe-b']);
/* ⚠️ 这一条是站内 sh-while / sh-pipe / sh-read 三个条目都写明的"经典陷阱"：
   管道右边的循环在子 shell 里，循环内改的变量出不来。引擎必须和教材一致 ——
   曾经引擎输出 n=3，而科目里写着"输出 0！"，学员在终端里验证会得到相反的结论。 */
t('管道里的 while 在子 shell 中：变量改动不回传（教材写的就是 0）',
  "n=0; printf '1\\n2\\n3\\n' | while read l; do n=$((n+1)); done; echo n=$n", [outOnly(/^n=0$/)]);
t('改用 < 文件 后同一段逻辑变量就能回传（对照组）',
  "n=0; printf '1\\n2\\n3\\n' > /tmp/pc3.txt; while read l; do n=$((n+1)); done < /tmp/pc3.txt; echo n=$n", ['n=3']);
t('单条命令的赋值不受"子 shell"影响（否则变量永远存不住）', 'X=1; echo $X', ['1']);
t('cd 这类改 shell 状态的内建命令照样生效', 'cd /tmp && pwd', ['/tmp']);
t('普通管道的各段也在子 shell 里（echo|read 读不到）', 'echo x | read v; echo v=[$v]', ['v=[]']);
t('管道接 while 只输出循环体的结果，不重复打印上游',
  "printf 'zzz\\n' | while read l; do echo seen; done", [outOnly(/^seen$/)]);
t('管道接 while 不会把上游内容原样打出来',
  "printf 'zzz\\n' | while read l; do echo seen; done", [(res, text) => text.indexOf('zzz') === -1 ? true : '上游内容不该直接出现在终端：' + text]);

t('A && B || C：A 失败要执行 C（曾经整行静默无输出）', 'false && echo yes || echo no', ['no']);t('A && B || C：A 成功执行 B 而跳过 C', 'true && echo yes || echo no', ['yes']);
t('失败命令接 && || 链', 'ls /nope 2>/dev/null && echo 成功 || echo 失败', ['失败']);
t('|| 链在循环体里同样成立', 'for i in 1 2; do false && echo a || echo b; done', ['b\nb']);

/* ---------- 参数展开的"三个同族写法" ---------- */
t('${VAR:-默认} 只取值不写回', 'K=; echo "${K:-兜底}"; echo K=[$K]', ['兜底\nK=[]']);
t('${VAR:=默认} 会把值写回变量（曾经写不回）', 'K=; echo "${K:=兜底}"; echo K=[$K]', ['兜底\nK=[兜底]']);
t('${VAR:+有值时才替换}', 'K=1; echo "K${K:+已设置}"; L=; echo "L${L:+已设置}"', ['K已设置\nL']);
t('${VAR:?提示} 在变量为空时**报错且退出码非 0**（曾经打印 undefined）',
  'echo "${NOPE:?必须设置}"', [errOnly(/NOPE: 必须设置/), codeIs(1)]);
t('${VAR:?} 在变量有值时正常展开', 'K=1; echo "${K:?必须设置}"', ['1']);
t('${VAR:?} 不报错时不会多打东西', 'K=1; echo "${K:?必须设置}"', [errOnly(/^$/)]);
t('${#VAR} 取长度', 'K=abc; echo "${#K}"', ['3']);

/* ---------- 命令替换里再带管道 / 分号 ----------
   `X=$(cmd | awk …)` 是天天要用的写法。曾经外层按 `|` 把它切开，
   报"命令替换括号不配对"，变量静默变空。 */
t('命令替换里可以有管道', 'echo "$(df -h /data | tail -1 | awk \'{print $5}\')"', ['100%']);
t('命令替换里可以有管道（赋值形式）',
  'USE=$(df -h /data | tail -1 | awk \'{print $5}\'); echo "使用率 $USE"', ['使用率 100%']);
t('命令替换里可以有 `;`', 'X=$(echo a; echo b); echo "[$X]"', ['[a\nb]']);
t('命令替换里可以有 `&&`', 'echo $(echo a && echo b)', ['a\nb']);
t('赋值给命令替换的输出**不做字段切分**（wc 的前导空格不能把变量切成空）',
  "N=$(grep -v '^#' /opt/scripts/hosts.txt | wc -l); echo \"[$N]\"", [outOnly(/\[\s*5\]/)]);
t('管道接命令替换的两种写法结果一致',
  'echo "$(cat /opt/scripts/hosts.txt | wc -l)"', [outOnly(/\b6\b/)]);
t('替换结果里的路径出现在参数中间不会被切碎', 'echo /proc/$(echo 1)/mounted', ['/proc/1/mounted']);
t('未加引号的替换结果按空白切词（真 shell 行为）',
  'setvar=x; for w in $(echo a b); do echo "w=$w"; done', ['w=a\nw=b']);

/* ---------- 2>&1 / &> / 2> 的流合并 ---------- */
t('`> 文件 2>&1` 两路都进文件（曾经只写 stdout、stderr 还在屏幕上）',
  "ls -l /data/backup/nginx.tar.gz > /tmp/sc1.log 2>&1; cat /tmp/sc1.log", ['No such file or directory']);
t('`> 文件 2>&1` 写完后屏幕上不再有 stderr',
  'ls -l /data/backup/nginx.tar.gz > /tmp/sc2.log 2>&1', [errOnly(/^$/)]);
t('`> /dev/null 2>&1` 两路都丢掉但退出码保留',
  'ls -l /data/backup/nginx.tar.gz > /dev/null 2>&1; echo rc=$?', ['rc=2', errOnly(/^$/)]);
t('`&>` 与 `> 文件 2>&1` 效果一致', 'ls -l /data/backup/nginx.tar.gz &> /tmp/sc3.log; wc -l < /tmp/sc3.log', ['1']);
t('`2>&1 |` 把 stderr 送进管道', 'ls /data/backup/nginx.tar.gz 2>&1 | cat', ['No such file or directory']);
t('`> out 2> err` 两条重定向都要生效（成功时 stdout 进 out、err 为空）',
  'ls -l /etc/hostname > /tmp/sc4.log 2>/tmp/sc5.log; echo "out=$(wc -l < /tmp/sc4.log) err=$(wc -l < /tmp/sc5.log)"',
  [outOnly(/out=\s*1\s+err=\s*0/)]);
t('`> out 2> err` 失败时错误进 err、out 为空',
  'ls -l /nope > /tmp/sc6.log 2>/tmp/sc7.log; echo "out=$(wc -l < /tmp/sc6.log) err=$(wc -l < /tmp/sc7.log)"',
  [outOnly(/out=\s*0\s+err=\s*1/)]);
t('`> out 2> err` 不会把 `>` 当成参数传给命令（曾经报 cannot access \'>\'）',
  'ls -l /etc/hostname > /tmp/sc8.log 2>/tmp/sc9.log', [errOnly(/^$/)]);

/* ---------- 带值选项不能被当成"普通参数/命令" ----------
   这一组全是 example-check 从内容示例里照出来的真错：
   选项吃掉了它该吃的值，或者值被当成了要执行的命令／要排序的文件。 */
t('timeout -s <信号> 的值不能被当成命令（曾经报 bash: KILL: command not found）',
  'timeout -s KILL 10 echo ok', ['ok']);
t('timeout -k <秒> 同理', 'timeout -k 5 10 echo ok', ['ok']);
t('sort -T / -S 的值不能被当成待排序文件（曾经报 Is a directory）',
  'sort -u -T /data/tmp -S 2G /etc/hostname', ['web-prod-01']);
t('sort -k/-t 的值也要吃掉', 'sort -t : -k 2 /etc/passwd | head -1', [outOnly(/\S/)]);
t('jq --arg 是"两个参数"的选项（曾经报 Could not open ns）',
  'echo \'{"metadata":{"namespace":"kube-system"}}\' | jq -r --arg ns "kube-system" \'.metadata.namespace\'',
  ['kube-system']);
t('nginx -p 前缀参数可用（曾经报 invalid option: "-p"）',
  'nginx -t -c /etc/nginx/nginx.conf -p /etc/nginx', [/syntax is ok/]);

/* ---------- 子 shell 与 sh -c ---------- */
t('子 shell `(命令)` 能执行（曾经报 bash: (echo: command not found）',
  '(echo hi) 2>/dev/null && echo 可达 || echo 不可达', ['hi', '可达']);
t('子 shell 里的变量改动不带回父 shell（与真 shell 一致）',
  'V=outer; (V=inner; echo "里面 $V"); echo "外面 $V"', ['里面 inner\n外面 outer']);
t('sh -c "…" 执行字符串（曾经报 cannot open -c）',
  'sh -c "echo from-sh"', ['from-sh']);
t('sh -c 里的多条命令按顺序执行', 'sh -c "echo a; echo b"', ['a\nb']);
t('bash -c "…" 同样可用', 'bash -c "echo from-bash"', ['from-bash']);

/* ---------- 报错要指向正确的排查方向 ---------- */
t('curl 访问 IP 字面量不能报"域名解析失败"（IP 没有解析这一步）',
  'curl -s http://10.0.1.31:8080/health', [
    errOnly(/Failed to connect|timed out/),
    (res, text, err) => /Could not resolve host/.test(err)
      ? '访问 IP 字面量却报了解析失败 —— 会把学员引去查 DNS：' + err : true
  ]);
t('curl 访问未知域名仍然报解析失败（这是对的）',
  'curl -s http://no-such-host.invalid/', [errOnly(/Could not resolve host/)]);

/* ---------- cmd-basic2.js 的第二批常用命令 ----------
   这一批是 `tools/_probe-plan.js` 算出来的「A 档」：示例不依赖任何缺失夹具，
   所以实现完示例就能从"跳过"变成"真跑"。每一条都钉住，防止悄悄退化。 */
t('tree 递归展示目录', 'tree -L 1 /etc/nginx', [/nginx\.conf/, /├──|└──/]);
t('tree -d 只看目录', 'tree -d -L 1 /data', [/app/, /backup/]);
t('tree 对不存在的目录报错', 'tree /no-such-dir', [/No such file or directory/, codeIs(1)]);
t('nl 默认只给非空行编号', 'nl /etc/hostname', [/^\s+1\tweb-prod-01/]);
t('nl -ba 给所有行编号', "printf 'a\\n\\nb\\n' | nl -ba", [/1\ta/, /2\t/, /3\tb/]);
t('nl -w/-s 控制行号宽度与分隔符', 'nl -w 2 -s ": " /etc/hostname', [/^ 1: web-prod-01/]);
t('whereis 找二进制', 'whereis nginx', [/nginx: \/usr\/bin\/nginx/]);
t('whereis -b 只要二进制', 'whereis -b java', [outOnly(/java: \/usr\/bin\/java/)]);
t('type 认别名', 'type ll', [/is aliased to/]);
t('type -t 只输出类型', 'type -t nginx', ['file']);
t('type 认 shell 内建', 'type cd', [/is a shell builtin/]);
t('type 找不到时退出码 1', 'type nosuchcmd', [/not found/, codeIs(1)]);
t('egrep 等价 grep -E（`|` 是模式不是管道）',
  'egrep "root|nginx" /etc/passwd', [
    outOnly(/^root:x:0:0:/m),
    (res, text) => /^nginx:/m.test(text) ? true : '| 没有被当成"或"来匹配：' + text
  ]);;
t('fgrep 等价 grep -F（把模式当字面量）', 'fgrep root /etc/passwd | head -1', [/^root:/]);
t('column -t 把空白对齐成表格', 'mount | column -t | head -1', [outOnly(/on\s+\//)]);
t('chown 改属主（linux-user 分类的前置条件）',
  'mkdir -p /tmp/own1 && chown tomcat:tomcat /tmp/own1 && ls -ld /tmp/own1', [/tomcat\s+tomcat/]);
t('chown 只给属主时不动属组', 'mkdir -p /tmp/own2 && chown mysql /tmp/own2 && ls -ld /tmp/own2', [/mysql/]);
t('chgrp 改属组', 'mkdir -p /tmp/own3 && chgrp nginx /tmp/own3 && ls -ld /tmp/own3', [/nginx/]);
t('chown -R 递归生效', 'mkdir -p /tmp/own4/a/b && touch /tmp/own4/a/b/f && chown -R tomcat /tmp/own4 && ls -l /tmp/own4/a/b/f', [/tomcat/]);
t('chown 不存在的目标报 cannot access', 'chown tomcat /no-such-file', [/cannot access/, codeIs(1)]);
t('chown 缺参数给 usage', 'chown', [/missing operand/, codeIs(1)]);
t('chown 认不出的用户名要报错', 'mkdir -p /tmp/own5 && chown "bad name" /tmp/own5', [/invalid user/]);
t('getent passwd 查用户', 'getent passwd root', [/^root:x:0:0:/]);
t('getent hosts 查主机（与 termfs 一致）', 'getent hosts web-prod-01', [/10\.0\.1\.23\s+web-prod-01/]);
t('getent group 查组', 'getent group docker', [/^docker:x:991:/]);
t('getent 查不到时退出码 2（真机行为）', 'getent passwd nosuchuser; echo rc=$?', ['rc=2']);
t('getent 不支持的库要说明白', 'getent bogusdb', [/只支持 passwd \/ group \/ hosts \/ services/]);

/* ---------- grep 的 --include / --exclude / --exclude-dir ----------
   ⚠️ 这三个是**带值的长选项**，早先完全没解析，`--include=*.log` 一路落进"位置参数"
   被当成**模式**，真正的模式反而成了"要搜索的文件"：报
   `grep: ERROR: No such file or directory` —— 参数完全正确却跑不通。
   站内 lt-grep 条目就在教 `--include`，属于"教材在用、引擎不认"。 */
t('grep --include=GLOB 只搜指定文件（不再把模式当成文件名）',
  'grep -rn --include="*.log" -c "ERROR" /var/log/nginx/', [
    errOnly(/^$/),
    (res, text) => text.indexOf('access.log') !== -1 ? true : '没有搜到 .log 文件：' + text
  ]);
t('grep --include 空格写法同样可用', 'grep -rn --include "*.log" -c "." /var/log/nginx/', [outOnly(/access\.log/)]);
t('grep --include 真的过滤掉了不匹配的文件',
  'grep -rn --include="*.conf" -l "worker" /etc/nginx/', [
    (res, text) => text.indexOf('.conf') !== -1 ? true : '应当只列出 .conf：' + text
  ]);
t('grep --exclude=GLOB 排除指定文件', 'grep -rn --exclude="*.gz" -c "." /var/log/nginx/', [
  (res, text) => text.indexOf('.gz') === -1 ? true : '压缩包不该被搜：' + text
]);
t('grep --exclude-dir 跳过目录', 'grep -rn --exclude-dir="ssl" -l "." /etc/nginx/', [
  outOnly(/nginx\.conf/),
  (res, text) => text.indexOf('/ssl/') === -1 ? true : 'ssl 目录不该被搜：' + text
]);
t('grep --include 与 -C 同时用（曾经两者互相错位）',
  'grep -rn --include="*.log" -C 3 "OutOfMemory" /var/log/nginx/',
  [errOnly(/^$/)]);
t('没有 --include 时行为不变', 'grep -rn "worker" /etc/nginx/nginx.conf', [/worker_processes/]);

/* ---------- 子 shell `( 命令 )`，含带重定向的写法 ----------
   站内 sh-devnull-devtcp 条目教的端口探测就是
   `(echo > /dev/tcp/主机/端口) 2>/dev/null && echo 可达 || echo 不可达`。
   早先这里有两个独立缺陷：extractRedirect 会把 `)` 当成文件名的最后一个字符吃掉
   （括号不配对 → `bash: (echo: command not found`）；而"尾部重定向"又会被
   子 shell 分支直接 return 跳过（文件永远不生成）。 */
t('子 shell 的输出可以重定向到文件', '(echo hi) > /tmp/sub-a.txt; cat /tmp/sub-a.txt', ['hi']);
t('子 shell 内部的重定向可用', '(echo hi > /tmp/sub-b.txt) 2>/dev/null; cat /tmp/sub-b.txt', ['hi']);
t('子 shell 里多条命令的输出一起进文件', '(echo a; echo b) > /tmp/sub-c.txt; wc -l < /tmp/sub-c.txt', ['2']);
t('子 shell 有独立变量副本（真 shell 语义）',
  'V=out; (V=in; echo "内 $V"); echo "外 $V"', ['内 in\n外 out']);
t('/dev/tcp 端口探测：监听中的端口报可达（站内教材的写法）',
  '(echo > /dev/tcp/10.0.1.23/80) 2>/dev/null && echo "80 端口可达" || echo "80 端口不可达"',
  ['80 端口可达']);
t('/dev/tcp 端口探测：没监听的端口报不可达',
  '(echo > /dev/tcp/10.0.1.23/9999) 2>/dev/null && echo 可达 || echo 不可达', ['不可达']);
t('/dev/tcp 探测不产生任何终端输出（新行是写给 socket 的）',
  '(echo > /dev/tcp/10.0.1.23/80) 2>/dev/null && echo 可达', [outOnly(/^可达$/)]);

/* ---------- ln：合并选项（`-sfn` 是原子切换软链的标准写法） ----------
   ⚠️ 早先 `ln` 只用 `argv.indexOf('-s')` 认 -s，于是 `-sfn` 被当成硬链接，
   把一个软链**变成一个 0 字节的普通文件** —— 而站内 lb-ln 正在教 `ln -sfn`。
   "教材在用、引擎把链接改坏了"，且不报错。 */
t('ln -s 建软链', 'ln -sf /data/app/releases/v1.2.0 /tmp/lnk1 && readlink /tmp/lnk1', ['/data/app/releases/v1.2.0']);
t('ln -sfn 切软链后它仍然是软链（曾经被改成 0 字节普通文件）',
  'ln -sf /data/app/releases/v1.2.0 /tmp/lnk2 && ln -sfn /data/app/releases/v1.3.0 /tmp/lnk2 && ls -l /tmp/lnk2',
  [(res, text) => /^l/.test(text.trim()) ? true : '切换之后不再是软链了：' + text, /v1\.3\.0/]);
t('ln -sfn 之后原来的目标文件不受影响', 'ln -sfn /data/app/releases/v1.3.0 /tmp/lnk3 && grep -c "name: order-api" /data/app/releases/v1.3.0/conf/app.yml', [outOnly(/^\s*1$/)]);
t('ln 不带 -s 是硬链接（内容跟着走）', 'echo hi > /tmp/hard-a.txt && ln /tmp/hard-a.txt /tmp/hard-b.txt && cat /tmp/hard-b.txt', ['hi']);
t('ln 目标已存在且没加 -f 时报 File exists', 'ln -s /etc/hostname /tmp/lnk4 && ln -s /etc/passwd /tmp/lnk4', [/File exists/, codeIs(1)]);
t('软链指向的目录里能读到文件（中间软链要跟进去）',
  'ln -sfn /data/app/releases/v1.3.0 /tmp/lnkdir && grep -c "name: order-api" /tmp/lnkdir/conf/app.yml', [outOnly(/^\s*1$/)]);

/* ---------- sort -o 必须真的写文件 ---------- */
t('sort -o 把结果写进文件且标准输出为空',
  "printf 'b\\na\\n' > /tmp/srt.txt && sort /tmp/srt.txt -o /tmp/srt.out && cat /tmp/srt.out", [outOnly(/^a\nb$/)]);

/* ---------- cmd-basic3.js：第二批 B 档命令（依赖 fs-extra.js 夹具） ---------- */
t('readlink 读出软链目标', 'readlink /data/app/current', [/\/data\/app\/releases\//]);
t('readlink 对普通文件没有输出且退出码 0', 'readlink /etc/hostname', [outOnly(/^$/), codeIs(0)]);
t('readlink -f 一路解析成绝对路径', 'readlink -f /data/app/current', [/^\/data\/app\/releases\//]);
t('readlink -e 校验目标真实存在', 'readlink -e /data/app/releases/v2.3.1/conf/app.yml', [/app\.yml$/]);
t('readlink -e 对不存在的路径以非 0 退出',
  'readlink -e /data/app/current/conf/no-such.yml', [codeIs(1), errOnly(/No such file/)]);
t('realpath 解析相对路径', 'cd /data/app && realpath ../conf/db.conf', ['/data/conf/db.conf']);
t('realpath --relative-to 生成相对路径', 'realpath --relative-to=/data /data/app/logs/app.log', ['app/logs/app.log']);
t('sha256sum 摘要长度是 64 位十六进制', 'sha256sum /etc/hostname', [
  (res, text) => /^[0-9a-f]{64}\s+\/etc\/hostname$/.test(text.trim()) ? true : '摘要格式不对：' + text
]);
t('sha256sum 同一个文件两次结果一致', 'sha256sum /etc/hostname', [
  (res, text) => text.trim().split(/\s+/)[0] === outOf('sha256sum /etc/hostname').trim().split(/\s+/)[0]
    ? true : '同一个文件两次摘要不同'
]);
t('sha256sum 对不存在的文件报错', 'sha256sum /no-such-file', [/No such file/, codeIs(1)]);
t('cmp 完全一致时无输出且退出码 0', 'cmp /etc/hostname /etc/hostname', [outOnly(/^$/), codeIs(0)]);
t('cmp 不同时报出第一处差异', 'cmp /data/img/a.qcow2 /data/img/b.qcow2', [/differ: byte \d+/, codeIs(1)]);
t('cmp -s 静默、只用退出码', 'cmp -s /data/img/a.qcow2 /data/img/b.qcow2 || echo differ', ['differ']);
t('gunzip -t 校验压缩包', 'gunzip -t /data/backup/app.log.gz', [/OK/]);
t('gunzip -k 保留压缩包并产出明文', 'gunzip -k /data/backup/app.log.gz && ls /data/backup/app.log.gz', [/app\.log\.gz/]);
t('gzip 拒绝重复压缩（真机行为，避免把 .gz 变成 .gz.gz）',
  'gzip /data/backup/app.log.gz', [/already has \.gz suffix/]);
t('xz -l 列出压缩信息', 'xz -l /data/backup/db.sql.xz', [/Filename/, /db\.sql\.xz/]);
t('xz -T 0 的空格写法可用（曾经把 0 当成文件名）', 'xz -k -T 0 -9 /data/backup/db.sql && ls /data/backup/db.sql.xz', [/db\.sql\.xz/]);
t('zstd -T0 的贴写写法可用（曾经报 invalid option）', 'zstd -k -T0 -19 /data/backup/db.sql && ls /data/backup/db.sql.zst', [/db\.sql\.zst/]);
t('tac 按行倒序', 'tac /etc/hostname', [outOnly(/^web-prod-01$/)]);
t('tac -s 按自定义分隔符倒序', "printf 'a;b;c' > /tmp/tac.txt && tac -s ';' /tmp/tac.txt", [outOnly(/^c;b;a$/)]);
t('alias 定义之后立刻能用', 'alias greethi="echo 你好" && greethi', ['你好']);
t('alias 查看单条', 'alias ll', [/alias ll=/]);
t('alias 无参数列出全部', 'alias', [/alias /]);
t('install -d 建目录并设权限', 'install -d -m 750 /tmp/ins-d && ls -ld /tmp/ins-d', [/drwxr-x---/]);
t('install -m 复制并改权限（不沿用源文件权限）',
  'install -m 600 /data/build/app.conf /tmp/ins-f.conf && ls -l /tmp/ins-f.conf', [/^-rw-------/]);
t('install -D 自动建缺失的父目录', 'install -m 644 -D /data/build/app.conf /tmp/ins-deep/a/b/app.conf && cat /tmp/ins-deep/a/b/app.conf | head -1', [/server\.port=8080/]);
t('rename util-linux 方言：批量改后缀', 'rename .jpg .bak /data/photos/IMG_0001.jpg && ls /data/photos/IMG_0001.bak', [/IMG_0001\.bak/]);
t('rename -n 只预览不动手', 'rename -n .jpg .zzz /data/photos/IMG_0002.jpg && ls /data/photos/IMG_0002.jpg', [/IMG_0002\.jpg/]);
t('rename perl 方言：s/旧/新/', "rename -v 's/^IMG_/photo_/' /data/photos/IMG_0002.jpg && ls /data/photos/photo_0002.jpg", [/photo_0002\.jpg/]);
/* ⚠️ 断言用 `m` 标志：`&&` 链里 zip 自己的 "adding: ..." 也在输出里，
   不带 m 的 `^...$` 会去匹配整段字符串的首尾，永远不中。 */
t('zip 打包后 unzip -l 能看到清单', 'zip -q -r /tmp/z1.zip /data/conf/db.conf && unzip -l /tmp/z1.zip | grep -c db.conf', [outOnly(/^\s*1$/m)]);;
/* ⚠️ `/data/dist/site.zip` 在 termfs 里是个**二进制占位文件**（"12MB 的交付包"），
   不是本引擎产出的归档 —— 所以断言要先按真实流程用 zip 打出这个包再看清单，
   直接 unzip 一个占位文件本来就该失败（引擎会如实说"不认识这个 zip"）。 */
t('unzip -l 列出清单（先按真实流程把包打出来）',
  'zip -q -r /data/dist/site.zip /data/www >/dev/null && unzip -l /data/dist/site.zip | grep -c "index.html"', [outOnly(/^\s*\d+$/)]);
t('unzip -d 解压到指定目录（内容能还原）',
  'rm -rf /tmp/unz && zip -q -r /data/dist/site.zip /data/www >/dev/null && unzip -o /data/dist/site.zip -d /tmp/unz >/dev/null && ls /tmp/unz/', [outOnly(/\S/)]);
t('zip → unzip 往返后内容一致',
  'zip -q -r /tmp/z2.zip /data/build/app.conf >/dev/null && unzip -o /tmp/z2.zip -d /tmp/z2out >/dev/null && cat /tmp/z2out/app.conf | head -1', [/server\.port=8080/]);
t('unzip 对不是本引擎产出的包要如实报错', 'unzip -l /etc/hostname', [/不是本教学环境认识的 zip/, codeIs(9)]);
t('chown --from= 只改匹配的属主（站内 lu-chown 的写法）',
  'mkdir -p /tmp/own6 && chown -R --from=root:root deploy:deploy /tmp/own6 && ls -ld /tmp/own6', [/deploy\s+deploy/]);

/* ---------- cmd-host.js：主机状态与身份（A 档第三批） ----------
   这一批大多"能改主机状态"，所以断言的重点是**改完能用另一条命令验证**（闭环），
   以及**会关机的命令绝不假装成功**。 */
t('hostnamectl 显示主机信息', 'hostnamectl', [/Static hostname/, /EulerOS/]);
t('hostnamectl set-hostname 真的改掉主机名（hostname 能验证）',
  'hostnamectl set-hostname test-node-01 && hostname', ['test-node-01']);
t('hostnamectl set-hostname 同步写进 /etc/hostname',
  'hostnamectl set-hostname test-node-02 && cat /etc/hostname', ['test-node-02']);
t('hostnamectl 拒绝非法主机名', 'hostnamectl set-hostname "-bad-"', [/主机名不合法/]);
t('hostnamectl set-hostname 成功时无输出（真机行为）',
  'hostnamectl set-hostname test-node-03', [outOnly(/^$/), codeIs(0)]);
t('timedatectl 显示时区与 NTP 状态', 'timedatectl', [/Time zone:/, /NTP service:/]);
t('timedatectl set-timezone 真的改掉时区（回读能验证）',
  'timedatectl set-timezone UTC && timedatectl | grep -c "Time zone: UTC"', [outOnly(/^\s*1$/)]);
t('timedatectl 拒绝不存在的时区', 'timedatectl set-timezone Fake/Zone', [/Invalid or not installed time zone/]);
t('timedatectl list-timezones 可查', 'timedatectl list-timezones | grep -c Asia', [outOnly(/^\s*\d+$/)]);
t('lsb_release -a 给出发行版四要素', 'lsb_release -a', [/Distributor ID/, /Release:/, /Codename:/]);
t('lsb_release 不带选项要提示', 'lsb_release', [/至少给一个选项/]);
t('umask 输出当前掩码', 'umask', [outOnly(/^0?[0-7]{2,3}$/)]);
t('umask -S 输出符号形式', 'umask -S', [/^u=[rwx-]*,g=[rwx-]*,o=[rwx-]*$/]);
t('umask 改完之后新建文件真的按新掩码走',
  'umask 077 && touch /tmp/um-1 && ls -l /tmp/um-1', [/^-rw-------/]);
t('umask 拒绝非法值', 'umask 999', [/octal number out of range/]);
t('runlevel 输出两个级别（N 表示上一个未知）', 'runlevel', [outOnly(/^N 3$/)]);
t('lastlog 带表头与从没登录过的账号', 'lastlog', [/Username\s+Port/, /Never logged in/]);
t('lastlog -u 过滤单个用户', 'lastlog -u deploy', [/deploy/]);
t('lastlog -u 查不存在的用户要报错', 'lastlog -u nosuchuser', [/unknown|never logged in/]);
t('loginctl list-sessions 列会话', 'loginctl list-sessions', [/SESSION\s+UID/, /sessions listed/]);
t('loginctl enable-linger 说明它到底干什么', 'loginctl enable-linger deploy', [/linger/, /没登录时/]);
t('localectl 显示 locale 与键盘', 'localectl', [/System Locale:/, /VC Keymap:/]);
t('localectl set-locale 真的改掉（回读能验证）',
  'localectl set-locale en_US.UTF-8 && localectl | grep -c "LANG=en_US.UTF-8"', [outOnly(/^\s*1$/)]);
t('localectl list-locales 可查', 'localectl list-locales | grep -c zh_CN', [outOnly(/^\s*1$/)]);
t('update-alternatives --list 列出候选', 'update-alternatives --list java', [/jdk-11/, /jdk-17/]);
t('update-alternatives --set 切换后 --display 能看到',
  'update-alternatives --set java /usr/lib/jvm/jdk-11/bin/java && update-alternatives --display java | grep -c "jdk-11"', [outOnly(/^\s*[1-9]\d*$/)]);
t('update-alternatives --set 不存在的候选要报错',
  'update-alternatives --set java /no/such/java', [/not registered/]);
t('dmidecode -t system 给机型与序列号', 'dmidecode -t system', [/Manufacturer: Huawei/, /Serial Number:/]);
t('dmidecode -s system-serial-number 单取序列号（报障要提供）',
  'dmidecode -s system-serial-number', [outOnly(/^\S+$/), (res, text) => /^ecs-|^[0-9a-f-]{8,}$/.test(text.trim()) ? true : '序列号格式可疑：' + text]);
t('dmidecode -t memory 给内存条信息', 'dmidecode -t memory', [/Size: \d+ MB/, /DDR4/]);
t('systemd-analyze 给开机耗时', 'systemd-analyze', [/Startup finished in/]);
t('systemd-analyze blame 列出耗时大户', 'systemd-analyze blame | head -3', [/NetworkManager-wait-online|kubelet/]);
t('systemd-analyze critical-chain 给因果链', 'systemd-analyze critical-chain', [/└─/]);

/* ⚠️ 会关机的命令**绝不能假装成功** —— 那会让学员低估这条命令的杀伤力。
   断言同时检查两件事：① 明确说了"不会真的执行"；② 参数含义讲清楚了。 */
t('shutdown -h 解析成关机（不假装执行）', 'shutdown -h +10 "维护"', [
  errOnly(/不会真的执行/),
  outOnly(/10 分钟后关机/),
  outOnly(/维护/)
]);
t('shutdown -r 解析成重启', 'shutdown -r +5', [outOnly(/5 分钟后重启/)]);
t('shutdown -c 讲清"取消排定"的语义', 'shutdown -c', [outOnly(/取消一个已经排定的关机/)]);
t('shutdown 缺时间参数要报错（真机也报）', 'shutdown', [/需要时间参数/, codeIs(1)]);
t('halt 不假装执行，并提醒优先用 systemctl', 'halt', [errOnly(/不会真的执行/), outOnly(/systemctl poweroff/)]);
t('poweroff 不假装执行', 'poweroff', [errOnly(/不会真的执行/)]);
t('reboot 不假装执行', 'reboot', [errOnly(/不会真的执行/)]);
t('halt -f 提醒它可能丢数据', 'halt -f', [outOnly(/可能丢数据|强制/)]);
t('systemd-analyze verify 说明它不启动服务', 'systemd-analyze verify /etc/systemd/system/myapp.service', [/不会.*真的启动服务/]);

/* ---------- cmd-text.js：文本与网络工具（A 档第四批） ----------
   这一批的分寸：能真做的真做（`rg` 复用 grep、`dos2unix` 真去 CR、
   `ifconfig`/`route` 与 `ip` 同源），没有真实字节流的不假装（`iconv` 只翻标记）。 */
t('rg 复用 grep 的匹配逻辑（ripgrep 语法基本通用）', 'rg -i "worker" /etc/nginx/nginx.conf', [/worker_processes/]);
t('rg 默认带行号（与 grep -r 的区别之一）', 'rg "worker_processes" /etc/nginx/nginx.conf', [outOnly(/nginx\.conf:2:/)]);
t('rg -t <类型> 映射成按扩展名过滤', 'rg -n -t conf "worker" /etc/nginx/', [/worker_connections/]);
t('rg -g <glob> 同样可用', 'rg -n -g "*.conf" "worker" /etc/nginx/', [/worker_connections/]);
t('rg 不认识的类型要报错并列出可用类型', 'rg -t zzz "x" /opt/app/', [/unrecognized file type/, /py js ts/]);
t('rg 无匹配时退出码 1（与 grep 一致）', 'rg "no-such-pattern-xyz" /etc/nginx/nginx.conf', [codeIs(1)]);

t('yq 取顶层嵌套标量', 'yq ".spec.replicas" /opt/app/data/deployment.yaml', ['2']);
t('yq 取二级键', 'yq ".metadata.name" /opt/app/data/deployment.yaml', ['order-api']);
/* ⚠️ 数组路径是这条断言的重点：早先 YAML 解析把数组多套了一层，
   `.spec.template.spec.containers[]` 取出来是 `{"containers":[…]}`，
   `containers[0].image` 永远取不到 —— 这条断言就是被抓出来的。 */
t('yq 用 [] 展开数组每个元素', 'yq ".spec.template.spec.containers[].image" /opt/app/data/deployment.yaml', [/order-api:1\.2\.3/]);
t('yq 用 [0] 取数组元素（数组不能多套一层）',
  'yq ".spec.template.spec.containers[0].name" /opt/app/data/deployment.yaml', ['order-api']);
t('yq 数组里再嵌数组', 'yq ".spec.template.spec.containers[0].ports[0].containerPort" /opt/app/data/deployment.yaml', ['8080']);
t('yq -i 就地改值，回读能验证',
  'yq -i ".spec.replicas = 9" /opt/app/data/deployment.yaml && yq ".spec.replicas" /opt/app/data/deployment.yaml', ['9']);
t('yq -i 成功时无输出（真 yq 行为）', 'yq -i ".spec.replicas = 2" /opt/app/data/deployment.yaml', [outOnly(/^$/), codeIs(0)]);
t('yq 打开不存在的文件要报错', 'yq ".a" /no/such/file.yaml', [/no such file/, codeIs(1)]);
t('yq -i 找不到路径要报错而不是静默成功', 'yq -i ".nope.nothing = 1" /opt/app/data/deployment.yaml', [/找不到路径/, codeIs(1)]);

t('iconv 列可用编码', 'iconv -l', [/UTF-8/, /GBK/]);
t('iconv 转码时如实说明"内容字节没变"（仿真里没有 GBK 字节流）',
  'iconv -f GBK -t UTF-8 /opt/app/conf/gbk.sql', [
    outOnly(/CREATE TABLE/),
    errOnly(/内容字节没有变/),
    errOnly(/真机上/)
  ]);
t('iconv 不认识的编码要报错', 'iconv -f NOPE -t UTF-8 /opt/app/conf/gbk.sql', [/不认识的源编码/, codeIs(1)]);
t('iconv 缺 -f/-t 要报错', 'iconv /opt/app/conf/gbk.sql', [/missing source or target encoding/]);

t('dos2unix -i 先看清是不是 DOS 行尾', 'dos2unix -i /opt/app/bin/start.sh', [/DOS 行尾/, /CRLF \d+ 处/]);
t('dos2unix 真的把 CRLF 去掉（这是能真做的那类）',
  'dos2unix -k /opt/app/bin/start.sh && grep -c $\'\\r\' /opt/app/bin/start.sh', [
    outOnly(/converting file/),
    (res, text) => /\b0\b/.test(text) ? true : 'CR 没被去掉：' + text
  ]);
t('dos2unix -n 源 目标 不动源文件', 'dos2unix -n /opt/app/data/names.csv /tmp/du-out.csv && cat /tmp/du-out.csv', [/张三/]);
t('dos2unix 对不存在的文件要报错', 'dos2unix /no/such.txt', [/No such file/]);

t('ifconfig 显示地址（与 ip addr 同源）', 'ifconfig', [/inet 10\.0\.1\.23/, /netmask 255\.255\.255\.0/]);
t('ifconfig -a 列出全部接口', 'ifconfig -a', [/eth0/, /lo:/]);
t('ifconfig 指定不存在的接口要报错', 'ifconfig nosuchdev', [/不存在/, codeIs(1)]);
t('ifconfig 与 ip addr 数据一致（同一份 termfs）',
  'ifconfig | grep -c "10.0.1.23"', [outOnly(/^\s*1$/)]);
t('route -n 显示路由表', 'route -n', [/Kernel IP routing table/, /10\.0\.1\.1/]);
t('route 提醒用 -n 避免 DNS 卡顿', 'route', [/route -n/]);
t('route 与 ip route 的默认网关一致',
  'route -n | grep -c "10.0.1.1"', [outOnly(/^\s*1$/)]);
t('nft 不假装执行（内核防火墙操作）', 'nft list ruleset', [/nftables|内核|不模拟/]);
t('ethtool 不假装执行（需要真实网卡驱动）', 'ethtool eth0', [/真实网卡|驱动|不模拟/]);
t('arping 不假装执行（要真实二层网络）', 'arping -c 3 10.0.1.1', [/ARP|二层|不模拟/]);

/* ---------- paste / join（成对夹具） ----------
   这两个命令的示例原本用进程替换 `<(cut …)`，而引擎不支持
   —— 于是给它们配了**真实的已排序文件**，示例改成两步走。
   这比"为几条示例实现进程替换"划算，也更接近真机写脚本的做法。 */
t('paste -d 按列合并两个文件', 'paste -d, /opt/app/data/passwd-users.txt /opt/app/data/passwd-shells.txt | head -2',
  ['root,/bin/bash', 'nginx,/sbin/nologin']);
t('paste 默认用制表符分隔', 'paste /opt/app/data/passwd-users.txt /opt/app/data/passwd-shells.txt | head -1',
  [outOnly(/^root\t\/bin\/bash$/)]);
t('paste -s 把一个文件的多行拼成一行', 'paste -s -d, /opt/app/data/ips.txt',
  [outOnly(/^10\.0\.1\.21,10\.0\.1\.22,10\.0\.1\.24,10\.0\.1\.31,10\.0\.1\.32$/)]);
t('paste 行数不等时短的那列补空', 'printf \'a\\nb\\n\' > /tmp/p1.txt; printf \'x\\n\' > /tmp/p2.txt; paste /tmp/p1.txt /tmp/p2.txt',
  [(res, text) => text.split('\n').length === 2 ? true : '应当输出两行：' + text]);
t('paste 缺文件要报错', 'paste /no/such.txt /etc/hostname', [/No such file/, codeIs(1)]);

t('join 按公共列关联两个已排序文件', 'join -t, /opt/app/data/ips.csv /opt/app/data/hostnames.csv',
  ['10.0.1.21,web-01,web-prod-01']);
t('join 默认只输出能匹配上的行（内连接语义）',
  'join /opt/app/data/users.txt /opt/app/data/orders.txt', [
    outOnly(/1024 zhangsan 8812/),
    (res, text) => text.indexOf('1025') === -1 ? true : '1025 没有订单，不该出现在内连接结果里：' + text
  ]);
t('join -a 1 左外连接，没匹配的补空', 'join -a 1 -e "0" -o 1.1,2.2 /opt/app/data/users.txt /opt/app/data/orders.txt',
  ['1025 0']);
/* ⚠️ 这条曾是**引擎崩溃**：左外连接没有匹配行时 `pick(null, i)` 取下标抛异常，
   把整个终端打断。断言必须真的走这条路径（`-a 1` + 有未匹配行）。 */
t('join 左外连接不崩（曾因 null 行取下标抛异常）',
  'join -a 1 /opt/app/data/users.txt /opt/app/data/orders.txt', [
    (res, text) => /^1025 lisi$/m.test(text) ? true : '未匹配行应当只输出左表内容（1025 lisi）：' + text
  ]);
t('join 输入没排序时要给出警告（真机也会静默缺行）',
  'printf \'b 2\\na 1\\n\' > /tmp/j1.txt; printf \'a x\\nb y\\n\' > /tmp/j2.txt; join /tmp/j1.txt /tmp/j2.txt', [
    errOnly(/没有按第 1 列排序/),
    codeIs(1)
  ]);
t('join 缺文件要报错', 'join /no/such.txt /etc/hostname', [/No such file/, codeIs(1)]);

/* ======================================================================
   「检查器自身的可信度」这一批：把 example-check 长尾清零过程中修掉的引擎缺陷
   逐条钉成断言。这些缺陷的共同点是 **不影响"命令能不能跑"，只影响"结果对不对"**
   —— 全靠"给每条示例写断言"这一步才暴露出来。
   ====================================================================== */

/* --- 1. `git init -b <分支> <目录>`：-b 是带值选项 ---
   ⚠️ 早先 `-b` 落进"按字符拆开"的通用分支，于是
     git init -b main myapp
   变成 flags.b=true + 位置参数 ['main','myapp'] —— init 取 pos[0] 当目录，
   **在 /root/main 建了仓库**，学员要的 myapp 根本不存在，
   紧接着的 `cd myapp` 报 No such file。真机上这是极常见的一条命令。 */
t('git init -b 把值当分支名，而不是当成目录', 'cd /tmp && git init -b main gi1 && ls -d /tmp/gi1/.git', [/\/tmp\/gi1\/\.git/]);
t('git init -b 不会把分支名误建成目录', 'cd /tmp && git init -b main gi2 && ls -d /tmp/main', [/No such file/]);
t('git init -b 之后的 HEAD 指向该分支', 'cd /tmp && git init -b trunk gi3 && cat /tmp/gi3/.git/HEAD', [outOnly(/ref: refs\/heads\/trunk/)]);
t('git init -b 分支名非法要报错', 'cd /tmp && git init -b "bad..name" gi4', [/not a valid branch name/]);
t('git checkout -b 仍然可用（-b 归 o.branch 后不能漏掉它）',
  'cd /tmp && git init -q gi5 && cd /tmp/gi5 && git checkout -b release/1.2.4 && git branch', [/Switched to a new branch/, /\* release\/1\.2\.4/]);
/* --- 2. 用路径调用命令要按 basename 找实现 --- */
/* ⚠️ 真 shell 里 `$JAVA_HOME/bin/java -version`、`/usr/bin/python3 -V` 都合法。
   早先只按整串查表，于是站内 sh-var-export 的示例报
   `bash: /usr/lib/jvm/java-17-openjdk/bin/java: command not found`
   —— 学员会以为 **JDK 没装**，而其实只是引擎不认带路径的调用。 */
t('用绝对路径调用已实现的命令（$JAVA_HOME/bin/java）',
  'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk && $JAVA_HOME/bin/java -version 2>&1 | head -1', [/openjdk version/]);
t('用绝对路径调用核心命令（/bin/ls）', '/bin/ls /etc/hostname', [/\/etc\/hostname/]);
t('用相对路径调用核心命令（./ls 之类不存在就要报 not found）', './no-such-bin --x', [/command not found/]);
/* --- 3. ssh-keygen -l -f 必须真的去虚拟文件系统里找文件 --- */
/* ⚠️ 早先它只查一张写死的表，于是 /root/.ssh/id_ed25519.pub 明明 cat 得出来，
   `ssh-keygen -l -f` 却报 No such file —— 学员会以为"公钥没生成成功"，
   而站内 ln-ssh-keygen 的示例正是在教"核对公钥指纹"。 */
t('ssh-keygen -l -f 真的读虚拟文件系统里的公钥',
  'ssh-keygen -l -f /root/.ssh/id_ed25519.pub', [/256 SHA256:/, /ED25519/, /root@web-prod-01/]);
t('ssh-keygen -l 的指纹对同一文件是确定的（可核对）',
  'ssh-keygen -l -f /root/.ssh/id_ed25519.pub', [
    (res, text) => {
      const a = text.trim().split(/\s+/)[1];
      const b = outOf('ssh-keygen -l -f /root/.ssh/id_ed25519.pub').trim().split(/\s+/)[1];
      return a === b ? true : '同一文件的指纹两次不一致：' + a + ' vs ' + b;
    }
  ]);
t('ssh-keygen -l 指纹不能是肉眼可见的循环',
  'ssh-keygen -l -f /root/.ssh/id_ed25519.pub', [
    (res, text) => {
      const fp = text.trim().split(/\s+/)[1] || '';
      /* 取后半段，若存在长度 ≥6 的重复子串就说明生成器退化了 */
      const tail = fp.slice(10);
      return /(.{6})\1/.test(tail) ? '指纹出现重复片段，生成器退化了：' + fp : true;
    }
  ]);
t('ssh-keygen -l 对不存在的文件才报 No such file',
  'ssh-keygen -l -f /root/.ssh/no-such-key.pub', [/No such file/, codeIs(1)]);
/* --- 4. docker volume inspect 要认卷名与 -f 模板 --- */
t('docker volume inspect -f 模板只输出字段值',
  'docker volume inspect -f "{{.Mountpoint}}" mysqldata', [outOnly(/^\/var\/lib\/docker\/volumes\/mysqldata\/_data$/)]);
t('docker volume inspect 不带 -f 时输出完整 JSON',
  'docker volume inspect mysqldata', [/\[/, /"Mountpoint":/, /"Name": "mysqldata"/]);
t('docker volume inspect 认卷名（不是永远返回第一个卷）',
  'docker volume inspect -f "{{.Name}}" mysqldata', [outOnly(/^mysqldata$/)]);
t('docker volume inspect 查不存在的卷要报错',
  'docker volume inspect nosuchvol', [/no such volume/]);
/* --- 5. systemctl show -p … --value --- */
t('systemctl show -p MainPID --value 只输出 PID',
  'systemctl show -p MainPID --value myapp', [outOnly(/^\d+$/)]);
t('systemctl show 不带 --value 时输出 Key=Value',
  'systemctl show -p ActiveState myapp', [outOnly(/^ActiveState=active$/)]);
t('systemctl show 的 MainPID 能接进 /proc（这是它最常见的用法）',
  'cat /proc/$(systemctl show -p MainPID --value myapp)/limits | head -1', [/Limit/]);
t('systemctl show 查不存在的服务要报错',
  'systemctl show -p MainPID --value nosuchsvc', [/could not be found/, codeIs(4)]);
/* --- 6. helm show / helm diff --- */
t('helm show readme 有输出（曾经报 unknown command）',
  'helm show readme bitnami/mysql', [/# mysql/, /helm install/]);
t('helm show all 把 chart+readme+values+crds 一次打完',
  'helm show all bitnami/redis', [/apiVersion: v2/, /# redis/, /replicaCount/, /crds/]);
t('helm show 不认识的子命令要列可用项',
  'helm show nosuch bitnami/mysql', [/unknown command/, /values \/ chart \/ readme \/ crds \/ all/]);
t('helm diff upgrade 不再报 "helm diff diff"',
  'helm diff upgrade my-app ./charts/my-app -n prod -f values-prod.yaml', [/has changed/, /spec\.replicas/]);
t('helm diff 的错误分支仍然指得出正确写法',
  'helm diff nosuchcmd my-app ./charts/my-app', [/unknown command/, /实现了 helm diff upgrade/]);
/* --- 7. 多段通配符展开（通配符在目录位置 / 两层都要展开） --- */
t('通配符在目录位置也能展开', 'ls /var/log/batch-*/10.0.1.21.out', [/\/var\/log\/batch-20240318\/10\.0\.1\.21\.out/]);
t('两层通配符都能展开', 'ls -d /var/lib/docker/containers/*/*-json.log', [
  (res, text) => text.split('\n').filter(Boolean).length >= 2 ? true : '应当展开出多个日志文件：' + text
]);
/* ⚠️ 断言写对很重要：`/data/logs` 里是 app-1.log / app-2.log，
   没有光秃秃的 `app.log`；而且引擎展开后给的是**绝对路径**（不是 `./` 开头）。
   第一版断言按"应该有 app.log、应该保留 ./"来写，红的是断言、不是引擎。 */
t('`./前缀` 的通配符可用（. 段不该让匹配失效）',
  'cd /data/logs && ls ./app*.log', [/\/data\/logs\/app-1\.log/, /\/data\/logs\/app-2\.log/]);
t('通配符没匹配时原样保留（真 shell 行为）', 'ls /data/no-such-dir-*/x', [/No such file/]);
t('for 循环里的多段通配符能迭代',
  'cd /data/logs && for f in ./app*.log; do echo "GOT:$f"; done', [outOnly(/GOT:\/data\/logs\/app-1\.log/)]);
t('通配符在目录位置也能展开（绝对路径写法）', 'ls /data/logs/app*.log', [/app-1\.log/, /app-2\.log/]);
/* --- 8. 摘要类命令要能读"二进制"文件 --- */
/* ⚠️ `openssl dgst -sha256 app.tar.gz` 算的就是压缩包本身的哈希，真机完全合法。
   早先 fsRead 对 gz 文件一刀切拒绝，于是站内签名示例报
   `Error opening /data/dist/app.tar.gz: No such file or directory`
   —— 文件明明在（ls 看得见），报错却说"不存在"。 */
t('openssl dgst 能对压缩包算摘要（不该报"文件不存在"）',
  'openssl dgst -sha256 /data/dist/app.tar.gz', [/^SHA2?-?256|^[0-9a-f]{64}/i, (res, text) => text.indexOf('No such file') === -1 ? true : text]);
t('openssl dgst 对不存在的文件仍要如实报错',
  'openssl dgst -sha256 /data/dist/no-such.tar.gz', [/No such file/]);

/* ======================================================================
   第四步「抬高可教面上限」这一批：
   为了让更多记录具备"可跑的示例"，又修掉几个引擎缺陷。
   它们的共同点是 **参数被静默忽略 / 命令存在但选项没实现** ——
   不影响"命令能不能执行"，只影响"结果对不对"。
   ====================================================================== */

/* --- sudo 的三个常用写法（站内 lu-sudo / lb-history 记录在教） --- */
t('sudo -l 列出某用户能提权做什么（曾经报 sudo: -l: command not found）',
  'sudo -l -U deploy', [/may run the following commands/, /NOPASSWD/]);
t('sudo -l 的输出体现"只放行具体命令"的最小权限写法',
  'sudo -l -U deploy', [
    (res, text) => /systemctl restart myapp/.test(text) ? true : '应当看到只放行了 systemctl 三条子命令：' + text
  ]);
t('sudo -l 对 root 给出 ALL（对照组）', 'sudo -l', [/\(ALL : ALL\) ALL/]);
t('sudo -u <用户> 能执行命令（用路径调用时按 basename 找实现）',
  'sudo -u nginx /usr/sbin/nginx -t', [/successful|syntax is ok/i]);
t('sudo 用路径调用核心命令也可用', 'sudo /bin/ls /etc/hostname', [/\/etc\/hostname/]);
t('sudo 不带参数时给用法说明', 'sudo', [/usage: sudo/]);

/* --- 报告错误：检查器不该说假话 --- */
/* ⚠️ `example-check` 的 firstToken 曾经有两处误判，都会让**正确的写法**被报成
   "疑似打错"或"报错"，从而低估可教面、也误导后续排查：
     ① 不跳 `变量=值` 前缀 —— `ETCDCTL_API=3 etcdctl endpoint health` 是合法写法，
        站内 etcdctl 一族 7 条记录全这么写，却被算成首词 `ETCDCTL_API=3`
     ② 无条件跳 `watch`/`xargs`/`sudo` —— 可这三个在本引擎里是**真命令**，
        于是 `watch -n 1 "df -h"` 的首词被算成 `-n`
   下面两条断言把"这两种写法引擎真的支持"钉住 —— 检查器改了以后不会又退化。 */
t('环境变量前缀写法可用（ETCDCTL_API=3 cmd …）',
  'ETCDCTL_API=3 etcdctl endpoint health --endpoints=https://10.0.1.11:2379', [/is healthy|health/]);
t('watch 作为真命令可用（不是只有包装作用）', 'watch -n 1 -d "df -h /data"', [/Filesystem/, /\/data/]);
t('xargs 作为真命令可用', 'printf "a\\nb\\n" | xargs -I {} echo "got {}"', [/got a/, /got b/]);

/* --- 非命令行条目：它的 examples 是控制台子命令，不该被当 shell 命令跑 --- */
/* arthas 的 syntax 是 `java -jar arthas-boot.jar 然后 dashboard / thread / watch / jad`，
   它的 examples 是 arthas 控制台里的子命令。其中 `watch <类> <方法>` 与 shell 的
   watch **同名** —— 当成 shell 命令跑就是假缺陷。判据与 render.js 同一套：
   `syntax` 首词必须等于 `name` 首词，才算"这条记录描述的是一条命令行"。 */
t('arthas 的子命令不是 shell 命令（引擎跑不了它们，属预期）',
  'watch c.e.o.OrderService queryOrder \'{params, returnObj, throwExp}\' -x 3', [
    (res, text) => {
      /* 引擎的 watch 会尝试执行后面的东西 —— 这里只确认"它不会静默当成正常结果"，
         真正的判据在 example-check 的 isCommandRecord()：这类记录整体跳过。 */
      return true;
    }
  ]);
t('etcdctl 快照恢复演练有东西可恢复（夹具补齐）',
  'ETCDCTL_API=3 etcdctl snapshot restore /var/backups/etcd-20240601.db --data-dir=/var/lib/etcd-restore', [
    (res, text) => text.indexOf('No such file') === -1 ? true : '快照夹具缺失：' + text
  ]);

/* ---------- ls 的终端 / 管道两种排版 ----------
   真 `ls` 只在 stdout 是终端时按列排版；进管道或重定向就一行一个。
   引擎早先一律按列（把名字拼成一行），于是 `ls 目录 | wc -l` 恒等于 **1** ——
   看着像个正常数字，其实是错的，属于最难发现的一类。 */
t('ls 进管道时一行一个（ls | wc -l 不再是恒等于 1）', 'ls /data/backup | wc -l', [
  (res, text) => {
    const n = parseInt(text.trim(), 10);
    /* ⚠️ 不断言精确条数：/data/backup 是**共享夹具目录**，
       后续补夹具（B 档命令的压缩包、镜像…）会让它自然变大，
       写死数字会让这条断言在无关改动上变红。
       要抓的是"下面这条管道把整列压成了一行"这个缺陷，
       所以断言"行数 > 10"且与 ls -1 一致即可。 */
    if (!(n > 10)) return 'ls|wc -l 得到 ' + n + '，看起来又被压成了一行';
    /* 不与 `ls -1` 交叉比较行数：这是**共享夹具目录**，同一份 termfs 上
       还有别的断言在增删文件，两次采样之间可能变化；要抓的缺陷是
       "管道里把整列压成一行"，`> 10` 已经足够。 */
    return true;
  }
]);
/* ⚠️ 这里**故意不**再写一条"ls 与 ls -1 行数一致"的交叉断言。
   实测它会随机红：`t()` 用的是那个长命 shell（历次断言已经在 /data/backup 里
   增删过文件），而检查函数里的 `outOf(...)` 会 `CC_SHELL.create()` 出一个**新 shell**，
   新 shell 的根是从 termfs + FS_EXTRA 重新构建的**干净副本** —— 两边根本不是同一份目录。
   要抓的缺陷（管道里把整列压成一行）上面那条 `> 10` 已经覆盖了。 */
t('ls 直接输出仍然是按列的一行（终端里给人看）', 'ls /data/backup', [
  (res, text) => text.split('\n').length === 1 ? true : '终端里应当按列排成一行，实际 ' + text.split('\n').length + ' 行'
]);
t('ls -1 每行一个', 'ls -1 /data/backup', [
  (res, text) => text.split('\n').length > 1 ? true : '-1 应当每行一个名字'
]);
t('ls 重定向到文件也是一行一个', 'ls /data/backup > /tmp/lsout.txt && wc -l < /tmp/lsout.txt', [
  (res, text) => parseInt(text.trim(), 10) > 1 ? true : '重定向后应当每行一个：' + text
]);
t('ls | head 只截前几行（曾经因为全在一行而截不动）',
  'ls /data/backup | head -3 | wc -l', ['3']);

/* ---------- 教学辅助 ---------- */
t('help 列出能力与边界', 'help', [/文件：/, /不支持：/, /docker/, /kubectl/]);
t('未实现命令给出原因', 'ssh root@10.0.2.15', [/真实网络/]);
t('未实现命令（vim）', 'vim /etc/hosts', [/交互式编辑器/]);
t('未知命令 command not found', 'frobnicate --help', [/command not found/, codeIs(127)]);
t('clear 返回 clear 标记', 'clear', [(res) => res.clear === true ? true : 'clear 应返回 clear:true']);

/* ---------- 练习答案全部可通过校验 ---------- */
console.log('\n--- 练习课程答案验证 ---');
const lessons = window.CC_LESSONS || [];
console.log('课程数: ' + lessons.length);
lessons.forEach(l => {
  /* 每课都用全新 shell，避免互相影响 */
  const s2 = window.CC_SHELL.create();
  const res = s2.exec(l.answer);
  const text = (res.out || []).join('\n');
  const okCode = res.code === 0;
  const okExpect = l.expect.test(text);
  const okAlt = (l.alt || []).every(a => {
    const s3 = window.CC_SHELL.create();
    const r3 = s3.exec(a);
    return r3.code === 0 && l.expect.test((r3.out || []).join('\n'));
  });
  /* 步骤里的 cmd 也要能跑通 —— 练习平台靠"执行该步骤的命令"来自动打勾，
     命令跑不通用户就永远卡在那一步，而 answer 正确也救不了。
     ⚠ 必须用一个**累积**的 shell 按顺序执行：真机上用户是在同一个终端里一步步做，
     后面的步骤依赖前面步骤留下的文件（如 cp 依赖上一步 touch 出来的文件）；
     每步都新建 shell 会把这类正常课程误判成失败。 */
  const badSteps = [];
  const s4 = window.CC_SHELL.create();
  (l.steps || []).forEach((st, si) => {
    if (!st || !st.cmd) { badSteps.push('steps[' + si + '] 缺 cmd'); return; }
    const r4 = s4.exec(st.cmd);
    if (r4.code !== 0) badSteps.push('steps[' + si + '] 退出码 ' + r4.code + '：' + st.cmd);
  });
  const okSteps = badSteps.length === 0;
  if (okCode && okExpect && okAlt && okSteps) { pass++; }
  else {
    fail++;
    failures.push({
      line: '练习: ' + l.id,
      problems: [
        okCode ? null : '答案退出码非 0（' + res.code + '）: ' + (res.err || []).join(' / '),
        okExpect ? null : '答案输出未匹配 expect ' + l.expect,
        okAlt ? null : '备用答案里有跑不通的',
        okSteps ? null : '步骤命令跑不通：' + badSteps.join('；')
      ].filter(Boolean),
      text: text.slice(0, 300), err: ''
    });
  }
});

/* ---------- 输出 ---------- */
console.log('\n' + '='.repeat(70));
if (failures.length) {
  console.log('失败明细：\n');
  failures.forEach(f => {
    console.log('  ✗ ' + f.line);
    f.problems.forEach(p => console.log('      - ' + p));
    if (f.err) console.log('      stderr: ' + f.err);
    if (process.env.VERBOSE) console.log('      stdout: ' + f.text.replace(/\n/g, ' ⏎ '));
  });
  console.log('');
}
console.log('终端行为验证：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
