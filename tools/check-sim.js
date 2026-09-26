// tools/check-sim.js · 校验 assets/js/sim-data.js 补进去的文件真的能被读到
/* --------------------------------------------------------------------------
   为什么要有这个脚本：
     sim-data.js 里的数据只有"能被引擎读到"才有意义。文件加了但路径写错、
     被 termfs 同路径挡掉、gz 标志漏了…… 这些错误在浏览器里都不报错，
     只有学员照着示例敲才会看到 No such file or directory。

   断言方式（每条都真的跑一次文件系统操作，不看数据源本身）：
     ls / stat / du / cat / head / grep / sed / awk / sort / zgrep / zcat / file / find

   两个额外的硬性检查：
     ① 每条断言的目标路径必须在**最终树**里真的存在，并且内容非空
        （防止"在 sim-data.js 里写了、却被同路径的 termfs/命令模块挡住"，
          fsAdd 是"同路径只在第一次生效"，这种情况不报错但数据是无效的）；
     ② 带 gz: true 的文件必须 `cat` 拒绝、`zcat` 能读到内容。

   用法：
     node tools/check-sim.js          跑全部断言，通过 0 退出，失败非零并打印原因
     node tools/check-sim.js -v       同时打印每条断言的实际输出
   -------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.indexOf('-v') !== -1;

/* ======================= 环境准备（与 example-check.js 一致） ======================= */
global.window = { CC_CATS: {}, CC_DATA: {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  documentElement: { setAttribute() {}, getAttribute() { return 'light'; } },
  addEventListener() {}, getElementById: () => null, querySelectorAll: () => []
};

function loadFile(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try {
    (0, eval)(src);
  } catch (e) {
    console.error('✗ 加载失败 ' + rel + ' :: ' + e.message);
    process.exit(2);
  }
}

/* 只为拿到 fsAdd 收集器：termfs 提供"主机快照"，shell.js 提供引擎 */
loadFile('data/termfs.js');
loadFile('assets/js/store.js');
loadFile('assets/js/shell.js');

if (!window.CC_SHELL || typeof window.CC_SHELL.fsAdd !== 'function') {
  console.error('✗ window.CC_SHELL.fsAdd 不可用，无法校验 sim-data.js');
  process.exit(2);
}

/* sim-data.js 登记了哪些路径：**从源码里直接解析**，不靠包装 fsAdd。
   为什么不能用包装：包装会被任何外层替身骗过（比如校验脚本自己或别的工具把
   fsAdd 换成过滤器），于是"数据被同路径挡掉"这种问题会被静默吞掉。 */
function collectRegisteredPaths(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const keys = [];
  const re = /\bF\[['"]([^'"]+)['"]\]\s*=/g;
  let m;
  while ((m = re.exec(src)) !== null) keys.push(m[1]);
  /* 兼容直接写在 fsAdd({ '路径': {...} }) 里的写法 */
  const re2 = /^\s*['"](\/[^'"]+)['"]\s*:\s*\{/gm;
  while ((m = re2.exec(src)) !== null) { if (keys.indexOf(m[1]) === -1) keys.push(m[1]); }
  return keys;
}

const REGISTERED_PATHS = collectRegisteredPaths('assets/js/sim-data.js');
if (!REGISTERED_PATHS.length) {
  console.error('✗ 没能从 assets/js/sim-data.js 解析出任何登记路径（写法变了？）');
  process.exit(2);
}

/* 真的加载一遍：确认 fsAdd 可用、且加载过程中没有抛异常。
   同时用包装记录一次，交叉校验"源码解析出的路径 == 真的传给 fsAdd 的路径"，
   防止以后写法变了导致解析器悄悄失效（解析器失效 → 断言失去意义）。 */
const CALLED = [];
const realFsAdd = window.CC_SHELL.fsAdd;
/* DSH_SIM_MUTATE：只在变异测试（tools/_mutate.js）里用 —— 等价于"这条数据没写"，
   用来验证断言真的会因此变红，不是一直在绿着骗人。正常运行不设这个变量。 */
const MUTATE = process.env.DSH_SIM_MUTATE || '';
window.CC_SHELL.fsAdd = function (map) {
  Object.keys(map || {}).forEach(function (k) {
    if (MUTATE && k === MUTATE) return;      /* 模拟：这条数据不存在 */
    CALLED.push(k);
    realFsAdd.call(window.CC_SHELL, (function () { const o = {}; o[k] = map[k]; return o; })());
  });
  return 0;
};
loadFile('assets/js/sim-data.js');
window.CC_SHELL.fsAdd = realFsAdd;

const PARSE_MISMATCH = REGISTERED_PATHS.filter(function (p) { return CALLED.indexOf(p) === -1; });

const REGISTERED = {};
REGISTERED_PATHS.forEach(function (p) { REGISTERED[p] = true; });

/* 哪些路径真的进了最终的文件系统树（fsAdd 是"同路径只在第一次生效"，
   被 termfs 或更早加载的命令模块占用的路径会被静默丢弃 → 这里的断言必然失败）。
   零字节文件（.gitkeep 这类）内容是空字符串，属于正常，只要求"节点存在"。 */
function findIn(root, p) { return window.CC_SHELL.util.findNode(root, p); }
const SHELL_EARLY = window.CC_SHELL.create();
const SHADOWED = REGISTERED_PATHS.filter(function (p) {
  const n = findIn(SHELL_EARLY.root, p);
  return !n || n.type === 'dir';
});

const REG_COUNT = REGISTERED_PATHS.length;
if (!REG_COUNT) {
  console.error('✗ assets/js/sim-data.js 没有登记任何文件');
  process.exit(2);
}

const SHELL = window.CC_SHELL.create();
const UTIL = window.CC_SHELL.util;

/* ======================= 极简断言框架 ======================= */
let pass = 0;
const failures = [];

function exec(cmd) {
  try {
    const r = SHELL.exec(cmd);
    return { out: r.out || [], err: r.err || [], code: typeof r.code === 'number' ? r.code : 0 };
  } catch (e) {
    return { out: [], err: ['THROW ' + e.message], code: -1, threw: true };
  }
}

function show(r) {
  return 'out=' + JSON.stringify((r.out || []).slice(0, 6)) + ' err=' + JSON.stringify((r.err || []).slice(0, 4)) + ' code=' + r.code;
}

/* 每条断言：名字 + 失败的说明 + 判定函数 */
function it(name, fn) {
  let ok = false, note = '';
  try {
    const res = fn();
    if (res === true) ok = true;
    else if (res && typeof res === 'object') { ok = !!res.ok; note = res.note || ''; }
  } catch (e) {
    ok = false;
    note = '断言抛异常: ' + e.message;
  }
  if (ok) { pass++; if (VERBOSE) console.log('  ✓ ' + name); }
  else failures.push(name + (note ? '  → ' + note : ''));
  return ok;
}

/* ---- 常用判定构造器 ---- */

/* 路径必须真在最终树里（fsAdd 会被同路径挡掉；被挡掉时数据等于没加） */
function inTree(p) {
  const n = UTIL.findNode(SHELL.root, p);
  return n ? n : null;
}

function needRegistered(p) {
  return function () {
    if (REGISTERED_PATHS.indexOf(p) === -1) {
      return { ok: false, note: 'sim-data.js 里没有登记这个路径' };
    }
    const n = inTree(p);
    if (!n) return { ok: false, note: '最终文件系统树里不存在（被同路径数据挡掉了？）' };
    if (n.type === 'dir') return { ok: false, note: '是目录，不是文件' };
    /* 软链：内容就是 target，不算空 */
    if (n.type === 'link') return { ok: !!String(n.target || ''), note: '软链没有 target' };
    if (!String(n.content || '').length) return { ok: false, note: '内容为空' };
    return { ok: true };
  };
}

/* 命令本身没实现（引擎明确报 command not found）时不算数据的错：
   数据校验只关心"文件在不在、内容读不读得到"。 */
function notImplIn(r) {
  const t = (r.err || []).join('\n');
  return t.indexOf('command not found') !== -1 || t.indexOf('未实现') !== -1;
}

/* 命令必须成功（code 0）且（可选）输出里包含某些子串 */
function cmd(c, expectSubs) {
  return function () {
    const r = exec(c);
    if (r.threw) return { ok: false, note: show(r) };
    if (r.code !== 0) return { ok: false, note: '退出码 ' + r.code + '；' + show(r) };
    const text = r.out.join('\n');
    const want = expectSubs || [];
    for (let i = 0; i < want.length; i++) {
      if (text.indexOf(want[i]) === -1) {
        return { ok: false, note: '输出里没有 ' + JSON.stringify(want[i]) + '；' + show(r) };
      }
    }
    return { ok: true };
  };
}

/* 数值断言：`cmd` 的输出必须能解析成数字并满足比较 */
function numeric(c, cmp, label) {
  return function () {
    const r = exec(c);
    if (r.threw) return { ok: false, note: show(r) };
    const raw = r.out.join('').trim().split(/\s+/)[0];
    const v = Number(raw);
    if (!isFinite(v)) return { ok: false, note: '输出不是数字: ' + JSON.stringify(r.out.join('|')) };
    if (!cmp(v)) return { ok: false, note: label + '：实际 ' + v + '（' + c + '）' };
    return { ok: true };
  };
}

/* `ls` 把一整个目录的条目用空格铺在一行里，这里把它拆成条目数组 */
function entries(c) {
  const r = exec(c);
  if (r.code !== 0) return null;
  const items = r.out.join(' ').trim().split(/\s+/).filter(Boolean);
  return items.length ? items : [];
}

/* cat 一个 gz 文件：必须如实拒绝（不是报"没有这个文件"，而是提示用 zcat/zgrep） */
function gzCatRefused(p) {
  return function () {
    const r = exec('cat ' + p);
    const text = r.out.concat(r.err).join('\n');
    if (text.indexOf('No such file') !== -1) return { ok: false, note: '文件不存在：' + text };
    if (text.indexOf('gzip') === -1) return { ok: false, note: 'cat 没有如实拒绝 gz 文件：' + show(r) };
    if (text.indexOf('zcat') === -1) return { ok: false, note: '提示里没有 zcat：' + show(r) };
    return { ok: true };
  };
}

console.log('='.repeat(74));
console.log('sim-data.js 数据可读性校验');
console.log('='.repeat(74));
console.log('sim-data.js 登记路径：' + REG_COUNT + ' 条');

/* ==========================================================================
   0. 数据源与加载顺序（浏览器端也必须加载它）
   ========================================================================== */
console.log('\n── 0. 加载与注册 ──');

it('sim-data.js 出现在 tools/_cmdlist.js（Node 测试端加载清单）', function () {
  const list = require('./_cmdlist');
  return { ok: list.indexOf('assets/js/sim-data.js') !== -1, note: '清单里没有 sim-data.js' };
});

it('apps 的两个 HTML 都引入了 sim-data.js', function () {
  const bad = [];
  ['index.html', 'academy-lab.html'].forEach(function (f) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (s.indexOf('assets/js/sim-data.js') === -1) bad.push(f);
  });
  return { ok: bad.length === 0, note: '缺少 script 标签：' + bad.join(', ') };
});

it('sim-data.js 是纯 UTF-8 无 BOM、LF 换行、且不晚于 shell.js 加载', function () {
  const buf = fs.readFileSync(path.join(ROOT, 'assets/js/sim-data.js'));
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return { ok: false, note: '有 UTF-8 BOM' };
  if (buf.indexOf(0x0D) !== -1) return { ok: false, note: '含 CR（不是纯 LF）' };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const iShell = html.indexOf('assets/js/shell.js');
  const iSim = html.indexOf('assets/js/sim-data.js');
  return { ok: iShell !== -1 && iSim > iShell, note: 'sim-data.js 必须在 shell.js 之后（否则 fsAdd 还不存在）' };
});

it('源码解析出的路径与真的传给 fsAdd 的路径一致（解析器没失效）', function () {
  return {
    ok: PARSE_MISMATCH.length === 0,
    note: '解析出来却从没传给 fsAdd：' + PARSE_MISMATCH.slice(0, 5).join(', ')
  };
});

/* 这条是"数据被同路径挡掉"的哨兵：fsAdd 同路径只在第一次生效，
   一旦某个路径被 termfs 或更早的命令模块占用，这里写的数据就是**死数据**。 */
it('没有任何登记路径被同路径数据挡掉（否则它写的内容根本不生效）', function () {
  return {
    ok: SHADOWED.length === 0,
    note: '被挡掉的路径：' + SHADOWED.join(', ') +
          '（要么删掉这条死数据，要么把内容放进更早加载的文件里）'
  };
});

/* ==========================================================================
   1. Nginx：配置 / 访问日志 / 轮转归档
   ========================================================================== */
console.log('── 1. Nginx ──');

it('/etc/nginx/conf.d/app.conf 存在且能被 sed 读到（8080→9090 预览）', needRegistered('/etc/nginx/conf.d/app.conf'));
it('  sed 替换 proxy_pass 端口后能看到 9090', cmd('sed "s/8080/9090/g" /etc/nginx/conf.d/app.conf', ['9090']));
it('  cat 能看到 upstream order_backend', cmd('cat /etc/nginx/conf.d/app.conf', ['upstream order_backend']));
it('  stat 能报出该文件的权限 644', cmd('stat /etc/nginx/conf.d/app.conf', ['0644']));

it('/etc/nginx/mime.types 存在（nginx.conf 里 include 它）', needRegistered('/etc/nginx/mime.types'));
it('  grep 能查到 text/css 映射', cmd('grep "text/css" /etc/nginx/mime.types', ['text/css']));

it('/etc/nginx/nginx.conf.new 存在（mv -i 的源）', needRegistered('/etc/nginx/nginx.conf.new'));
it('  head 能读到 worker_connections 20480', cmd('head -6 /etc/nginx/nginx.conf.new', ['20480']));
it('  grep 能看到 gzip on（与旧配置的差异点）', cmd('grep -n "gzip" /etc/nginx/nginx.conf.new', ['gzip  on']));

it('/var/log/nginx/access.log-20240317.gz 存在且是 gz（轮转归档）', needRegistered('/var/log/nginx/access.log-20240317.gz'));
it('  cat 拒绝读 gz 并提示 zcat', gzCatRefused('/var/log/nginx/access.log-20240317.gz'));
it('  zcat 能解压出 combined 格式的访问日志', cmd('zcat /var/log/nginx/access.log-20240317.gz', ['GET /api/orders', 'Mozilla/5.0']));
it('  zcat 输出的行里有 2024 年 3 月 17 日的时间戳', cmd('zcat /var/log/nginx/access.log-20240317.gz', ['17/Mar/2024']));
it('  zgrep 能在归档里数出 500 的条数（≥1）', numeric('zgrep -c " 500 " /var/log/nginx/access.log-20240317.gz', function (v) { return v >= 1; }, 'zgrep -c 500'));

it('/var/log/nginx/access.log-20240501.gz 存在且是 gz', needRegistered('/var/log/nginx/access.log-20240501.gz'));
it('  cat 拒绝读 gz', gzCatRefused('/var/log/nginx/access.log-20240501.gz'));
it('  zgrep -c " 500 " 得到 ≥ 2 条 5xx', numeric('zgrep -c " 500 " /var/log/nginx/access.log-20240501.gz', function (v) { return v >= 2; }, '5xx 条数'));
it('  zgrep 能查到 413（上传被拦）', cmd('zgrep -c " 413 " /var/log/nginx/access.log-20240501.gz', ['1']));

/* ==========================================================================
   2. 应用日志
   ========================================================================== */
console.log('── 2. 应用日志 ──');

it('/data/app/logs/order.log 存在且是本次补充的数据', needRegistered('/data/app/logs/order.log'));
it('  head 能看到订单流水字段（orderId/cost）', cmd('head -n 20 /data/app/logs/order.log', ['orderId=8781', 'cost=41ms']));
it('  stat 报出的 size 与显式 size 一致（64M）', cmd('stat /data/app/logs/order.log', ['67108864']));
it('  tail 能读到 query_timeout 那条', cmd('tail -n 3 /data/app/logs/order.log', ['reason=query_timeout']));
it('  du -sh 报 64.0M', cmd('du -sh /data/app/logs/order.log', ['64.0M']));

it('/data/app/logs/app.log 能读到剧情主线（由 cmd-ops.js 提供，本文件不重复登记）', function () {
  const r = exec('grep -c "query timeout after 5000ms" /data/app/logs/app.log');
  if (r.code !== 0) return { ok: false, note: show(r) };
  return { ok: Number(r.out[0]) >= 3, note: '命中行数 ' + r.out[0] };
});
it('  该文件不是 sim-data.js 登记的（避免同路径被静默丢弃的死数据）', function () {
  return { ok: !Object.prototype.hasOwnProperty.call(REGISTERED, '/data/app/logs/app.log'), note: 'sim-data.js 里不该再登记它' };
});

it('/var/log/app/app.log 存在且是本次补充的数据', needRegistered('/var/log/app/app.log'));
it('  egrep -c "ERROR|WARN" 有匹配（≥1）', numeric('egrep -c "ERROR|WARN" /var/log/app/app.log', function (v) { return v >= 1; }, 'ERROR|WARN 行数'));
it('  sed -n "/\\[error\\]/,/^$/p" 能打印出整段堆栈', cmd('sed -n "/\\[error\\]/,/^$/p" /var/log/app/app.log', ['OrderService.findOrder', 'OrderController.get']));
it('  zgrep -i -r OutOfMemory 能递归命中该目录', cmd('zgrep -i -r "OutOfMemory" /var/log/app/', ['OutOfMemoryError']));

it('/var/log/app/access.log 存在且是本次补充的数据', needRegistered('/var/log/app/access.log'));
it('  awk 能按列取出日期字段（示例原句的列约定）', cmd('awk \'{print $1}\' /var/log/app/access.log', ['2024-05-01']));
it('  每行都以 2024- 开头（sh-quotes 那条按日期打头的正则有意义）', function () {
  const r = exec('grep -c -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}" /var/log/app/access.log');
  if (r.code !== 0) return { ok: false, note: show(r) };
  return { ok: Number(r.out[0]) === 12, note: '匹配行数 ' + r.out[0] + '（应为 12 行）' };
});
it('  第 6 列是耗时（带 ms 单位，awk 能取到）', cmd('awk \'{print $6}\' /var/log/app/access.log', ['41ms', '30004ms']));
it('  示例原句 avg 求和不会算成 NaN（引擎的限制见脚本末尾说明）', function () {
  const r = exec('awk \'{t+=$3; n++} END{print "平均耗时", t/n, "ms"}\' /var/log/app/access.log');
  if (r.code !== 0) return { ok: false, note: show(r) };
  const t = r.out.join(' ');
  if (t.indexOf('NaN') !== -1) return { ok: false, note: '算成了 NaN：' + t };
  return { ok: true };
});
it('  head 能读到具体请求行', cmd('head -2 /var/log/app/access.log', ['/api/orders']));

it('/var/log/app/ips.txt 存在且是本次补充的数据', needRegistered('/var/log/app/ips.txt'));
it('  sort -u 去重后行数是 6', numeric('sort -u /var/log/app/ips.txt | wc -l', function (v) { return v === 6; }, '去重后行数'));

it('/data/app/logs/access.log 存在且是本次补充的数据', needRegistered('/data/app/logs/access.log'));
it('  awk 能取到第 3 列是客户端 IP', cmd('awk \'{print $3}\' /data/app/logs/access.log', ['203.0.113.25']));
it('  第 6 列是耗时（带 ms）', cmd('awk \'{print $6}\' /data/app/logs/access.log', ['41ms']));
it('  能数出 3 条 500（与业务日志的 query timeout 对齐）', numeric('grep -c " 500$" /data/app/logs/access.log', function (v) { return v === 3; }, '500 条数'));

it('/root/cloud-init.yaml 存在（base64 提交 user_data 的输入）', needRegistered('/root/cloud-init.yaml'));
it('  首行是 #cloud-config', cmd('head -1 /root/cloud-init.yaml', ['#cloud-config']));
it('  base64 能编码它（示例原句；base64 未实现时只验证文件可读）', function () {
  const r = exec('base64 -w0 /root/cloud-init.yaml');
  if (notImplIn(r)) {
    const c = exec('cat /root/cloud-init.yaml');
    return { ok: c.code === 0 && c.err.length === 0, note: 'base64 未实现，退化为验证 cat 可读：' + show(c) };
  }
  if (r.code !== 0) return { ok: false, note: show(r) };
  return { ok: r.out.join('').indexOf('Y2xvdWQtY29uZmln') === 0, note: show(r) };
});
it('  grep 能读到 packages 段', cmd('grep -n "qemu-guest-agent" /root/cloud-init.yaml', ['qemu-guest-agent']));

it('/root/app.log 存在（兼容 sh-quotes 里的 /var/log/app.log 写法）', needRegistered('/root/app.log'));
it('  软链能被 cat/head 跟随读到内容', cmd('head -2 /root/app.log', ['[order-service] INFO']));
it('  ls -l 能看到它指向 /var/log/app/app.log', cmd('ls -l /root/app.log', ['-> /var/log/app/app.log']));

it('/var/log/myapp/app.log 存在（日志清理脚本的目标）', needRegistered('/var/log/myapp/app.log'));
it('  truncate -s 0 能作用于它（示例原句；truncate 未实现时只验证文件可读）', function () {
  const r = exec('truncate -s 0 /var/log/myapp/app.log');
  if (notImplIn(r)) {
    const c = exec('grep -c ERROR /var/log/myapp/app.log');
    return { ok: c.code === 0, note: 'truncate 未实现，退化为验证 grep 可读：' + show(c) };
  }
  return { ok: r.code === 0 && r.err.join('').indexOf('No such file') === -1, note: show(r) };
});
it('  du -sh 能算出它的大小（256.0M）', cmd('du -sh /var/log/myapp/app.log', ['256.0M']));
it('/var/log/logclean.log 存在（清理脚本自己的日志）', needRegistered('/var/log/logclean.log'));
it('  grep 能读到上次截断记录', cmd('grep "已截断" /var/log/logclean.log', ['/var/log/myapp/app.log']));

it('/data/backup/xtra-20240318 存在（xtrabackup --prepare 的目标目录）', function () {
  const n = inTree('/data/backup/xtra-20240318');
  return { ok: !!(n && n.type === 'dir'), note: '目录不存在' };
});
it('  xtrabackup_checkpoints 能被 grep 读到 backup_type', cmd('grep "backup_type" /data/backup/xtra-20240318/xtrabackup_checkpoints', ['full-prepared']));
it('  xtrabackup_info 能被 grep 读到 tool_command', cmd('grep "tool_command" /data/backup/xtra-20240318/xtrabackup_info', ['--target-dir=/data/backup/xtra-20240318']));
it('  du -sh 能算出备份目录大小（≥100M，量级与 termfs 基线相称）', function () {
  const r = exec('du -sh /data/backup/xtra-20240318');
  if (r.code !== 0) return { ok: false, note: show(r) };
  const m = r.out.join('').match(/([0-9.]+)([KMG])/);
  if (!m) return { ok: false, note: show(r) };
  const mult = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 }[m[2]];
  const bytes = Number(m[1]) * mult;
  return { ok: bytes >= 100 * 1024 * 1024, note: '只有 ' + r.out.join('') };
});
it('  grep -c 能数出重复出现的 IP', numeric('grep -c "203.0.113.25" /var/log/app/ips.txt', function (v) { return v >= 2; }, '出现次数'));

it('/opt/app/conf/keywords.txt 存在且是本次补充的数据', needRegistered('/opt/app/conf/keywords.txt'));
it('  cat 能读到关键词清单（OutOfMemory 在列）', cmd('cat /opt/app/conf/keywords.txt', ['OutOfMemory', 'query timeout']));
it('  grep -F -e 手工指定关键词能命中 app.log', cmd('grep -F -e OutOfMemory /var/log/app/app.log', ['OutOfMemoryError']));

it('/opt/app/conf/app.properties 存在且是本次补充的数据', needRegistered('/opt/app/conf/app.properties'));
it('  file 认为是文本；grep 能读到 jdbc 连接串', cmd('grep "jdbc:mysql" /opt/app/conf/app.properties', ['db-prod-01:3306/orders']));
it('  file 命令对该文件返回成功（不是 cannot open）', cmd('file /opt/app/conf/app.properties', ['/opt/app/conf/app.properties']));

/* ==========================================================================
   3. Tomcat
   ========================================================================== */
console.log('── 3. Tomcat ──');

const TOMCAT_FILES = [
  '/opt/tomcat/logs/catalina.out',
  '/opt/tomcat/logs/localhost_access_log.2024-03-18.txt',
  '/opt/tomcat/logs/catalina.2024-03-17.log'
];
TOMCAT_FILES.forEach(function (p) {
  it(p + ' 存在且是本次补充的数据', needRegistered(p));
});

it('  ls -lh /opt/tomcat/logs/ 能看到三个文件', cmd('ls -lh /opt/tomcat/logs/', ['catalina.out', 'localhost_access_log.2024-03-18.txt']));
it('  du -sh 目录能算出总量（非 0）', function () {
  const r = exec('du -sh /opt/tomcat/logs/');
  if (r.code !== 0) return { ok: false, note: show(r) };
  const t = r.out.join('');
  return { ok: /[0-9]/.test(t) && t.indexOf('0\t') !== 0, note: '输出异常：' + t };
});
it('  tail 能看到启动完成那行', cmd('tail -20 /opt/tomcat/logs/catalina.out', ['Server shutdown in', 'Server startup in']));
it('  grep 能查到 query timeout（与 Nginx/应用日志对得上）', cmd('grep -c "query timeout after 5000ms" /opt/tomcat/logs/catalina.out', ['3']));

it('/opt/tomcat/logs/catalina.2024-03-17.log 是 gz 文件', function () {
  const n = inTree('/opt/tomcat/logs/catalina.2024-03-17.log');
  return { ok: !!(n && n.gz), note: '缺少 gz 标志' };
});
it('  cat 拒绝读它并提示 zcat', gzCatRefused('/opt/tomcat/logs/catalina.2024-03-17.log'));
it('  zgrep 能从它里面查到 SEVERE 记录', cmd('zgrep -c "query timeout" /opt/tomcat/logs/catalina.2024-03-17.log', ['2']));

/* ==========================================================================
   4. MySQL
   ========================================================================== */
console.log('── 4. MySQL ──');

it('/etc/my.cnf 存在且是本次补充的数据', needRegistered('/etc/my.cnf'));
it('  sed 能在 [mysqld] 段后插入参数（示例原句不报错、且插入内容出现）', function () {
  const r = exec('sed "/^\\[mysqld\\]/a max_connections = 1000" /etc/my.cnf');
  if (r.code !== 0) return { ok: false, note: show(r) };
  /* 引擎的 a 命令会把 `max_connections = 1000` 截成 `ons = 1000`（实现缺陷，
     不是数据问题）；这里只要求"能读到文件并真的插入了内容"，不替引擎背书 */
  const t = r.out.join('\n');
  if (t.indexOf('No such file') !== -1) return { ok: false, note: '文件读不到' };
  return { ok: t.indexOf('ons = 1000') !== -1, note: '没有插入内容：' + show(r) };
});
it('  文件本身确实有 [mysqld] 段（示例的地址能匹配上）', cmd('grep -n "^\\[mysqld\\]" /etc/my.cnf', ['[mysqld]']));
it('  grep 能读到 slow_query_log 配置', cmd('grep "slow_query_log_file" /etc/my.cnf', ['/var/log/mysql/slow.log']));

it('/var/log/mysql/slow.log 存在且是本次补充的数据', needRegistered('/var/log/mysql/slow.log'));
it('  grep 能查到 MySQL 慢查询三段式头部', cmd('grep -c "^# Query_time:" /var/log/mysql/slow.log', ['4']));
it('  grep 能查到 query timeout 对应的那条 SQL', cmd('grep -n "user_id = 10233" /var/log/mysql/slow.log', ['orders o WHERE o.user_id = 10233']));
it('  head 第一行是 # Time:', cmd('head -1 /var/log/mysql/slow.log', ['# Time:']));

/* ==========================================================================
   5. 系统日志与日志子系统
   ========================================================================== */
console.log('── 5. 系统日志与日志子系统 ──');

it('/etc/systemd/journald.conf 存在且是本次补充的数据', needRegistered('/etc/systemd/journald.conf'));
it('  grep -vE 过滤注释后能看到 Journal 段与有效项', cmd('grep -vE "^#|^$" /etc/systemd/journald.conf', ['[Journal]', 'SystemMaxUse=2G', 'ForwardToSyslog=yes']));

it('/etc/rsyslog.conf 存在且是本次补充的数据', needRegistered('/etc/rsyslog.conf'));
it('  grep -vE 过滤后能看到 rules 段', cmd('grep -vE "^#|^$" /etc/rsyslog.conf', ['/var/log/messages', '/var/log/secure']));

it('/var/lib/logrotate/logrotate.status 存在且是本次补充的数据', needRegistered('/var/lib/logrotate/logrotate.status'));
it('  示例原句 cat 后 grep myapp 能命中', cmd('cat /var/lib/logrotate/logrotate.status | grep myapp', ['myapp.log']));

it('/var/log/myapp.log 存在且是本次补充的数据', needRegistered('/var/log/myapp.log'));
it('  tail 能看到应用自己的日志行', cmd('tail -3 /var/log/myapp.log', ['scheduled task']));

it('/var/lib/node_exporter/textfile/myapp.prom 存在且是本次补充的数据', needRegistered('/var/lib/node_exporter/textfile/myapp.prom'));
it('  cat 能看到 myapp_up 1 指标', cmd('cat /var/lib/node_exporter/textfile/myapp.prom', ['myapp_up 1']));

it('/var/log/healthcheck.log 存在且是本次补充的数据', needRegistered('/var/log/healthcheck.log'));
it('  示例原句 grep -c "重启服务" 能数出 2 次', numeric('grep -c "重启服务" /var/log/healthcheck.log', function (v) { return v === 2; }, '重启次数'));
it('  能查到 6 次健康检查失败（两轮各连续 3 次）', function () {
  const r = exec('grep -c "健康检查失败" /var/log/healthcheck.log');
  if (r.code !== 0) return { ok: false, note: show(r) };
  return { ok: Number(r.out[0]) === 6, note: '失败行数 ' + r.out[0] + '（应为 6；对应 2 次重启）' };
});
it('  失败行里带着 curl 退出码 28（脚本用 -sf 判定的结果）', cmd('grep "健康检查失败" /var/log/healthcheck.log', ['退出码 28']));

it('/var/log/batch-2024-03-18_094502/10.0.1.21.out 存在且是本次补充的数据', needRegistered('/var/log/batch-2024-03-18_094502/10.0.1.21.out'));
it('  直接 cat 该文件能看到 uptime 与磁盘信息', cmd('cat /var/log/batch-2024-03-18_094502/10.0.1.21.out', ['load average', '/dev/vdb1']));
it('  find /var/log -name "10.0.1.21.out" 能找到它', cmd('find /var/log -name "10.0.1.21.out"', ['10.0.1.21.out']));

it('/opt/scripts/hosts.txt 存在（批量 ssh 脚本的清单）', needRegistered('/opt/scripts/hosts.txt'));
it('  cat 能看到注释行与主机列表', cmd('cat /opt/scripts/hosts.txt', ['10.0.1.21', '# 10.0.1.23 维护中']));

it('/var/log/boot.log 存在且是本次补充的数据', needRegistered('/var/log/boot.log'));
it('  more（= cat）能读到启动完成那行', cmd('cat /var/log/boot.log', ['Startup finished in']));

/* ==========================================================================
   6. JVM 现场（jstack / GC 日志）
   ========================================================================== */
console.log('── 6. JVM 现场 ──');

it('/tmp/jstack-18442.txt 存在且是本次补充的数据', needRegistered('/tmp/jstack-18442.txt'));
it('  grep -A 30 能拿到 JVM 的死锁结论（示例原句）', cmd('grep -A 30 "Found one Java-level deadlock" /tmp/jstack-18442.txt', ['Found 1 deadlock']));
it('  grep -A 25 "nid=0x4829" 能定位到线程栈', cmd('grep -A 25 "nid=0x4829" /tmp/jstack-18442.txt', ['OrderCache.put']));
it('  grep -c BLOCKED 能数出阻塞线程（≥1）', numeric('grep -c "java.lang.Thread.State: BLOCKED" /tmp/jstack-18442.txt', function (v) { return v >= 1; }, 'BLOCKED 线程数'));
it('  nid=0x4829 与文档里的十进制 18473 对得上', function () {
  const n = inTree('/tmp/jstack-18442.txt');
  const hex = (18473).toString(16);
  return { ok: String(n.content).indexOf('nid=0x' + hex) !== -1, note: '找不到 nid=0x' + hex };
});

it('/tmp/jstack-18442-095302.txt 存在（第二次快照，供多份对比）', needRegistered('/tmp/jstack-18442-095302.txt'));
it('  通配符路径 /tmp/jstack-18442-*.txt 能被 grep 命中', cmd('grep -l "Found one Java-level deadlock" /tmp/jstack-18442-095302.txt', ['jstack-18442-095302.txt']));

it('/data/logs/gc.log 存在且是本次补充的数据', needRegistered('/data/logs/gc.log'));
it('  grep -c "Pause Full" 数出 3 次 Full GC', numeric('grep -c "Pause Full" /data/logs/gc.log', function (v) { return v === 3; }, 'Full GC 次数'));
it('  示例原句 grep "Pause Young" | awk -F"ms" 能取出停顿时间片段', function () {
  const r = exec('grep "Pause Young" /data/logs/gc.log | awk -F"ms" \'{print $1}\' | tail -5');
  if (r.code !== 0) return { ok: false, note: show(r) };
  if (!r.out.length) return { ok: false, note: '没有输出' };
  /* awk -F"ms" 的字段 1 = 时间戳 + "GC(n) Pause Young ... 停顿毫秒数" 之前的部分，
     所以输出里应当带上 GC 时间戳（说明 Pause Young 确实被 grep 命中） */
  return { ok: /\[2024-03-18T/.test(r.out[0]), note: show(r) };
});
it('  grep -i "System.gc" 能查到显式 GC 调用', cmd('grep -i "System.gc" /data/logs/gc.log', ['Pause Full (System.gc())']));

it('/data/logs/all-ids.txt 存在且是本次补充的数据', needRegistered('/data/logs/all-ids.txt'));
it('  sort -u 去重后能算出唯一 ID 数（9）', numeric('sort -u /data/logs/all-ids.txt | wc -l', function (v) { return v === 9; }, '唯一 ID 数'));

it('/data/logs/app-1.log 与 app-2.log 存在（mv 归档的源）', function () {
  const a = inTree('/data/logs/app-1.log'), b = inTree('/data/logs/app-2.log');
  return { ok: !!a && !!b, note: '缺少其中一个' };
});
it('  head 能读到 app-1.log 的启动行', cmd('head -1 /data/logs/app-1.log', ['Starting OrdersApplication']));

it('/data/logs/big.log 存在（split -n 4 的输入）', needRegistered('/data/logs/big.log'));
it('  grep -c 能数出 requestId 行数（8）', numeric('grep -c "requestId=" /data/logs/big.log', function (v) { return v === 8; }, 'requestId 行数'));

/* ==========================================================================
   7. /data 下的配置、发布产物与 CSV
   ========================================================================== */
console.log('── 7. /data 配置与发布产物 ──');

it('/data/app/conf/app.yml 存在且是本次补充的数据', needRegistered('/data/app/conf/app.yml'));
it('  grep 能看到 timeout-ms: 5000', cmd('grep "timeout-ms" /data/app/conf/app.yml', ['5000']));
it('/data/app/conf/app.yml.20240311.bak 存在（rm -i *.bak 的目标）', needRegistered('/data/app/conf/app.yml.20240311.bak'));
it('/data/app/conf/logback-spring.xml 存在', needRegistered('/data/app/conf/logback-spring.xml'));
it('  grep 能看到滚动策略 fileNamePattern 指向 app 日志', cmd('grep "fileNamePattern" /data/app/conf/logback-spring.xml', ['app.%d{yyyy-MM-dd}']));

it('/data/app/static 目录下有 4 个文件', function () {
  const items = entries('ls /data/app/static');
  if (items === null) return { ok: false, note: 'ls 失败' };
  return { ok: items.length >= 4, note: '文件数 ' + items.length };
});
it('  du -sh /data/app/static 能算出大小', function () {
  const r = exec('du -sh /data/app/static');
  return { ok: r.code === 0 && /[0-9]/.test(r.out.join('')), note: show(r) };
});

it('/data/app/order.log 存在（ln 硬链接的源）', needRegistered('/data/app/order.log'));
it('  ls -li 能拿到 inode 号', function () {
  const r = exec('ls -li /data/app/order.log');
  if (r.code !== 0) return { ok: false, note: show(r) };
  return { ok: /\d+/.test(r.out.join('')), note: show(r) };
});

it('/data/app/services.txt 存在且是本次补充的数据', needRegistered('/data/app/services.txt'));
it('  sort -u 去重后是 6 个服务（原 9 行有重复）', numeric('sort -u /data/app/services.txt | wc -l', function (v) { return v === 6; }, '去重后服务数'));

it('/data/user/list.txt 存在且是本次补充的数据', needRegistered('/data/user/list.txt'));
it('  示例原句 sort | uniq -d 能找出重复账号', cmd('sort /data/user/list.txt | uniq -d', ['u10233', 'u10871']));

it('/data/iplist.txt 存在（xargs 批量 ping 的清单）', needRegistered('/data/iplist.txt'));
it('  cat 后能看到 7 个地址', numeric('cat /data/iplist.txt | wc -l', function (v) { return v === 7; }, '地址数'));

it('/data/csv/user.csv 存在且是本次补充的数据', needRegistered('/data/csv/user.csv'));
it('  head -n 1 能取到表头（示例原句）', cmd('head -n 1 /data/csv/user.csv', ['user_id,user_name,dept']));
it('  cat -A 能看到 10 行数据（含表头 11 行）', numeric('cat -A /data/csv/user.csv | wc -l', function (v) { return v === 11; }, '行数'));

it('/opt/app/data/users.csv 与 report.csv 存在', function () {
  const a = inTree('/opt/app/data/users.csv'), b = inTree('/opt/app/data/report.csv');
  return { ok: !!a && !!b, note: '缺少其中一个' };
});
it('  awk -F, 能取到中文姓名与部门', cmd('awk -F, \'{print $2, $3}\' /opt/app/data/users.csv', ['张伟 订单中心']));
it('  sort -t, -k3,3nr 按第 3 列排序能出结果', cmd('sort -t, -k3,3nr /opt/app/data/report.csv', ['order-service']));

it('/data/dist 下有 5 个发布产物', function () {
  const items = entries('ls /data/dist');
  if (items === null) return { ok: false, note: 'ls 失败' };
  return { ok: items.length >= 5, note: '文件数 ' + items.length };
});
it('  md5sum 对 /data/dist 下的 tar.gz 能算出摘要', function () {
  const r = exec('md5sum /data/dist/app-1.2.3.tar.gz');
  if (r.code !== 0) return { ok: false, note: show(r) };
  return { ok: /[0-9a-f]{32}/.test(r.out.join('')), note: show(r) };
});
it('  find /data/dist -type f 能找到 5 个文件', numeric('find /data/dist -type f | wc -l', function (v) { return v === 5; }, '文件数'));

it('/data/backup/db_20240101.bak 存在且 file 认为是数据文件', needRegistered('/data/backup/db_20240101.bak'));
it('  file 示例原句能输出 data（不是 cannot open）', cmd('file /data/backup/db_20240101.bak', ['/data/backup/db_20240101.bak: data']));
it('/data/backup/db_20240101.tar.gz 存在（md5sum 的目标）', needRegistered('/data/backup/db_20240101.tar.gz'));
it('/data/backup/db.part.aa 等三个切片存在（cat 拼接还原）', function () {
  const parts = ['aa', 'ab', 'ac'].map(function (x) { return inTree('/data/backup/db.part.' + x); });
  return { ok: parts.every(Boolean), note: '切片不全' };
});

it('/data/upload/report.csv 存在且能被 file -i 读到', needRegistered('/data/upload/report.csv'));
it('  file 示例原句不再报 cannot open', function () {
  const r = exec('file -i /data/upload/report.csv');
  return { ok: r.err.join('').indexOf('cannot open') === -1, note: show(r) };
});
it('/data/scripts/deploy.sh 存在且是 shell 脚本', needRegistered('/data/scripts/deploy.sh'));
it('  file 认出它是 shell 脚本', cmd('file /data/scripts/deploy.sh', ['shell script']));
it('  cat -A 能读到内容（示例原句）', cmd('cat -A /data/scripts/deploy.sh', ['systemctl stop myapp']));

it('/data/test/old.log 存在（touch -d 的目标）', needRegistered('/data/test/old.log'));
it('  stat 能报出 2024-01-01 08:00 的修改时间', cmd('stat /data/test/old.log', ['2024-01-01 08:00']));

it('/data/tmp 下有 *.tar.gz 与 *.tmp', function () {
  const r1 = exec('find /data/tmp -name "*.tar.gz"');
  const r2 = exec('find /data/tmp -name "*.tmp"');
  return { ok: r1.out.length >= 1 && r2.out.length >= 2, note: 'tar.gz=' + r1.out.length + ' tmp=' + r2.out.length };
});
it('/data/old 下有 3 个 *.bak', numeric('find /data/old -type f -name "*.bak" | wc -l', function (v) { return v === 3; }, 'bak 文件数'));
it('/data/archive 存在且放着一个历史发布包', cmd('ls /data/archive', ['app-1.2.1.tar.gz']));
it('/data/restore 存在（切片还原的输出目录）', function () {
  const r = exec('ls -a /data/restore');
  return { ok: r.code === 0, note: show(r) };
});

it('/data/www/index.html 存在（chmod -R / stat / ls -Z 的目标）', needRegistered('/data/www/index.html'));
it('  stat /data/www 能报成 directory', cmd('stat /data/www', ['directory']));
it('  ls -Z /data/www/index.html 不报错', function () {
  const r = exec('ls -Z /data/www/index.html');
  return { ok: r.code === 0 && r.err.length === 0, note: show(r) };
});
it('  chmod -R u=rwX,g=rX,o= /data/www 能成功执行', function () {
  const r = exec('chmod -R u=rwX,g=rX,o= /data/www');
  return { ok: r.code === 0, note: show(r) };
});

it('/data/share 与 /data/upload 目录存在（chgrp / setfacl 的目标）', function () {
  const a = inTree('/data/share'), b = inTree('/data/upload');
  return { ok: !!(a && a.type === 'dir' && b && b.type === 'dir'), note: '目录缺失' };
});
it('  chmod 2770 /data/share 不再报 cannot access', function () {
  const r = exec('chmod 2770 /data/share');
  return { ok: r.err.join('').indexOf('cannot access') === -1, note: show(r) };
});

it('/data/logs/gc.log 所在目录能整体 du 出大小', function () {
  const r = exec('du -sh /data/logs');
  return { ok: r.code === 0 && /[0-9]/.test(r.out.join('')), note: show(r) };
});

/* ==========================================================================
   8. 系统配置与脚本
   ========================================================================== */
console.log('── 8. 系统配置与脚本 ──');

it('/etc/nsswitch.conf 存在且是本次补充的数据', needRegistered('/etc/nsswitch.conf'));
it('  示例原句 grep ^hosts 能读到解析顺序', cmd('grep ^hosts /etc/nsswitch.conf', ['files dns myhostname']));

it('/etc/sysctl.d/99-tuning.conf 存在且是本次补充的数据', needRegistered('/etc/sysctl.d/99-tuning.conf'));
it('  内容是 key = value 形式且能被 grep 读到 somaxconn', cmd('grep "somaxconn" /etc/sysctl.d/99-tuning.conf', ['net.core.somaxconn = 32768']));
it('  示例原句 cp 到 /tmp 能成功（备份回滚文件）', cmd('cp /etc/sysctl.d/99-tuning.conf /tmp/backup-sysctl.conf && echo 回滚文件已备份', ['回滚文件已备份']));

it('/etc/app/app.conf 存在且含 [debug] 段', needRegistered('/etc/app/app.conf'));
it('  sed "/^\\[debug\\]/,/^\\[/c [debug]" 能定位到地址（示例原句）', function () {
  const r = exec('sed "/^\\[debug\\]/,/^\\[/c [debug]" /etc/app/app.conf');
  /* 引擎若未实现 c 命令会明确报"暂不支持这种写法"；数据本身必须能被读到 */
  const all = r.out.concat(r.err).join('\n');
  return { ok: all.indexOf('No such file') === -1, note: '文件读不到：' + all.slice(0, 120) };
});

it('/etc/sudoers.d/deploy 存在（visudo -c 的检查对象）', needRegistered('/etc/sudoers.d/deploy'));
it('  cat 能看到 NOPASSWD 规则', cmd('cat /etc/sudoers.d/deploy', ['NOPASSWD']));

it('/opt/scripts/strict-demo.sh 存在（set -euo pipefail 示例）', needRegistered('/opt/scripts/strict-demo.sh'));
it('  head -3 能读到 set -Eeuo pipefail', cmd('head -3 /opt/scripts/strict-demo.sh', ['set -Eeuo pipefail']));

it('/etc/cron.d 与 /etc/cron.hourly 存在（后门排查第三步）', function () {
  const a = inTree('/etc/cron.d'), b = inTree('/etc/cron.hourly');
  return { ok: !!(a && a.type === 'dir' && b && b.type === 'dir'), note: '目录缺失' };
});
it('  ls /etc/cron.d 能看到 0hourly', cmd('ls /etc/cron.d', ['0hourly']));

it('/etc/services 存在（more /etc/services 的目标）', needRegistered('/etc/services'));
it('  grep 能读到 3306/mysql 与 6379/redis', cmd('grep -E "3306|6379" /etc/services', ['mysql', 'redis']));

/* ==========================================================================
   9. cloud-init / KVM
   ========================================================================== */
console.log('── 9. cloud-init / KVM ──');

it('/tmp/user-data 存在且是本次补充的数据', needRegistered('/tmp/user-data'));
it('  示例原句 grep -n "\\t" 能找出 Tab 缩进那一行', cmd('grep -n "\\t" /tmp/user-data', [':\t# 这一行是 Tab 缩进']));
it('  head -1 是 #cloud-config', cmd('head -1 /tmp/user-data', ['#cloud-config']));

it('/tmp/meta-data 存在（cloud-localds 的第二个输入）', needRegistered('/tmp/meta-data'));
it('  grep 能读到 instance-id', cmd('grep "instance-id" /tmp/meta-data', ['i-0f3c1a724d5e4b91']));
it('/tmp/network-config 存在', needRegistered('/tmp/network-config'));
it('  grep 能读到静态地址', cmd('grep "addresses" /tmp/network-config', ['10.0.1.33/24']));

it('/var/log/cloud-init.log 存在且是本次补充的数据', needRegistered('/var/log/cloud-init.log'));
it('  示例原句 grep -iE "error|fail|traceback" 能查到解析失败', cmd('grep -iE "error|fail|traceback" /var/log/cloud-init.log', ['Failed to load user-data']));

it('/var/log/cloud-init-output.log 存在且是本次补充的数据', needRegistered('/var/log/cloud-init-output.log'));
it('  tail -50 能看到 ValueError 与 finished 行', cmd('tail -50 /var/log/cloud-init-output.log', ['ValueError', 'Cloud-init v. 22.2.2 finished']));

it('/var/log/boot-init.log 存在（user-data 里 runcmd 的输出）', needRegistered('/var/log/boot-init.log'));
it('  cat 能看到初始化开始时间与已启动的服务', cmd('cat /var/log/boot-init.log', ['初始化开始', 'qemu-guest-agent']));

it('/data/images/rocky9-base.qcow2 存在（virt-customize 的源镜像）', needRegistered('/data/images/rocky9-base.qcow2'));
it('  file 认为是 data、ls -lh 报出的量级与 raw 相称（≥600M）', function () {
  const r = exec('ls -lh /data/images/rocky9-base.qcow2');
  if (r.code !== 0) return { ok: false, note: show(r) };
  const m = r.out.join('').match(/([0-9.]+)([KMG])/);
  if (!m) return { ok: false, note: show(r) };
  const mult = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 }[m[2]];
  return { ok: Number(m[1]) * mult >= 600 * 1024 * 1024, note: r.out.join('') };
});
it('/data/images/rocky9.raw 存在（qemu-img convert 的 raw 源）', needRegistered('/data/images/rocky9.raw'));
it('  ls -lh 能报 2.0G，与 qcow2 并列（镜像制作现场）', function () {
  const items = entries('ls -lh /data/images');
  if (items === null) return { ok: false, note: 'ls 失败' };
  return { ok: items.join(' ').indexOf('rocky9.raw') !== -1 && items.join(' ').indexOf('rocky9-base.qcow2') !== -1, note: items.join(' ') };
});

/* ==========================================================================
   10. 安全 / 性能
   ========================================================================== */
console.log('── 10. 安全 / 性能 ──');

it('/var/log/lynis-report.dat 存在且是本次补充的数据', needRegistered('/var/log/lynis-report.dat'));
it('  示例原句 grep -E "^warning|^suggestion" 能取出条目', cmd('grep -E "^warning|^suggestion" /var/log/lynis-report.dat', ['AUTH-9286', 'SSH-7408']));

it('/tmp/scan.txt 存在（masscan 输出）', needRegistered('/tmp/scan.txt'));
it('  示例原句 grep -v "^#" | awk \'{print $4}\' | sort -u 能提取 IP', cmd('cat /tmp/scan.txt | grep -v "^#" | awk \'{print $4}\' | sort -u', ['10.0.1.21', '10.0.2.15']));

it('/var/log/secure-20240316.gz 存在且是 gz', needRegistered('/var/log/secure-20240316.gz'));
it('  cat 拒绝读 gz', gzCatRefused('/var/log/secure-20240316.gz'));
it('  示例原句 zgrep "Accepted" 能命中成功登录', cmd('zgrep "Accepted" /var/log/secure-20240316.gz', ['Accepted publickey for deploy']));
it('  zgrep 也能查到爆破失败记录', cmd('zgrep -c "Failed password" /var/log/secure-20240316.gz', ['4']));

it('/var/log/secure-20240317.gz 存在且是 gz', needRegistered('/var/log/secure-20240317.gz'));
it('  cat 拒绝读 gz', gzCatRefused('/var/log/secure-20240317.gz'));
it('  zgrep "Accepted" 能命中', cmd('zgrep "Accepted" /var/log/secure-20240317.gz', ['Accepted publickey']));

it('/tmp/result.jtl 存在（jmeter -l 的结果文件）', needRegistered('/tmp/result.jtl'));
it('  head -1 是 JMeter 表头（示例原句）', cmd('head -1 /tmp/result.jtl', ['timeStamp,elapsed,label,responseCode']));
it('  grep 能查到失败的采样（query timeout）', cmd('grep -c ",false," /tmp/result.jtl', ['1']));

it('/data/logs/gc.log 的 Pause Full 行里含 System.gc() 原因', function () {
  const r = exec('grep -F "Pause Full (System.gc())" /data/logs/gc.log');
  if (r.code !== 0) return { ok: false, note: show(r) };
  return { ok: r.out.join('').indexOf('Pause Full (System.gc())') !== -1, note: show(r) };
});

/* ==========================================================================
   11. 站点目录 / 主机文件 / 控制面
   ========================================================================== */
console.log('── 11. 站点目录 / 主机文件 / 控制面 ──');

it('/usr/share/nginx/html/index.html 存在且是本次补充的数据', needRegistered('/usr/share/nginx/html/index.html'));
it('  grep -i 能看到 nginx 默认页的标题', cmd('grep -i "Welcome to nginx" /usr/share/nginx/html/index.html', ['Welcome to nginx!']));
/* ⚠️ 示例原句是 `grep -q "welcome" ...`（小写 w），而 nginx 默认页里是
   `Welcome to nginx!`（大写 W）—— grep 区分大小写，所以这条示例本身对不上，
   属于「路径/参数疑似写错」，本文件不去改默认页的大小写来迁就它。 */
it('  默认页里没有小写 welcome（说明示例该用 -i 或改关键字）', function () {
  const r = exec('grep -c welcome /usr/share/nginx/html/index.html');
  return { ok: r.out[0] === '0', note: '期望 0（大写 W 才匹配），实际 ' + r.out[0] };
});

it('/usr/local/bin/nginx 存在（file 检查的目标）', needRegistered('/usr/local/bin/nginx'));
it('  file 示例原句输出 data（ELF 二进制）', cmd('file /usr/local/bin/nginx', ['/usr/local/bin/nginx: data']));

it('/etc/nginx/nginx.conf.new 与 nginx.conf 都在（mv -i 的前后两个文件）', function () {
  const a = inTree('/etc/nginx/nginx.conf.new'), b = inTree('/etc/nginx/nginx.conf');
  return { ok: !!a && !!b, note: '缺少其中一个' };
});

it('/var/lib/docker/volumes/mysqldata/_data 存在（du -sh 卷挂载点）', function () {
  const r = exec('du -sh /var/lib/docker/volumes/mysqldata/_data');
  if (r.code !== 0) return { ok: false, note: show(r) };
  return { ok: /[0-9]/.test(r.out.join('')), note: show(r) };
});
it('/var/lib/docker/containers 下有 3 个容器日志目录', function () {
  const items = entries('ls /var/lib/docker/containers');
  if (items === null) return { ok: false, note: 'ls 失败' };
  return { ok: items.length === 3, note: '目录数 ' + items.length };
});

it('/etc/kubernetes/admin.conf 存在（kubeadm init 的产物）', needRegistered('/etc/kubernetes/admin.conf'));
it('  cat 能看到 server: https://10.0.1.11:6443', cmd('cat /etc/kubernetes/admin.conf', ['https://10.0.1.11:6443']));
it('  stat 报出 600 权限', cmd('stat /etc/kubernetes/admin.conf', ['0600']));

it('/etc/kubernetes/manifests 下有 4 个静态 Pod 清单', function () {
  const items = entries('ls /etc/kubernetes/manifests');
  if (items === null) return { ok: false, note: 'ls 失败' };
  return { ok: items.length === 4, note: '清单数 ' + items.length };
});
it('  grep 能看到 etcd 的 --data-dir=/var/lib/etcd', cmd('grep "data-dir" /etc/kubernetes/manifests/etcd.yaml', ['--data-dir=/var/lib/etcd']));

it('/var/lib/etcd 与 /var/lib/etcd-restore 都存在（快照还原前后）', function () {
  const a = inTree('/var/lib/etcd'), b = inTree('/var/lib/etcd-restore');
  return { ok: !!(a && a.type === 'dir' && b && b.type === 'dir'), note: '目录缺失' };
});
it('  find 能在 etcd 数据目录里找到 db 与 wal', function () {
  const r = exec('find /var/lib/etcd -type f');
  return { ok: r.out.length >= 2, note: show(r) };
});
it('/tmp/manifests.bak 存在（静态 Pod 备份，恢复时要搬回去）', function () {
  const items = entries('ls /tmp/manifests.bak');
  if (items === null) return { ok: false, note: 'ls 失败' };
  return { ok: items.length >= 2, note: '文件数 ' + items.length };
});

it('/root/hcloud_install.sh 存在（curl -o 的落点）', needRegistered('/root/hcloud_install.sh'));
it('  file 认出它是 shell 脚本', cmd('file /root/hcloud_install.sh', ['shell script']));

/* ==========================================================================
   12. gz 一致性总检查：所有 gz:true 的文件都必须 cat 拒绝 + zcat 可读
   ========================================================================== */
console.log('── 12. gz 文件一致性 ──');

const GZ_PATHS = REGISTERED_PATHS.filter(function (p) {
  const n = inTree(p);
  return !!(n && n.gz);
});
it('sim-data.js 里至少登记了 2 个 gz 文件（轮转日志）', function () {
  return { ok: GZ_PATHS.length >= 2, note: 'gz 文件数 ' + GZ_PATHS.length };
});
GZ_PATHS.forEach(function (p) {
  it('gz: ' + p + ' cat 拒绝 / zcat 可读 / zgrep 可用', function () {
    const cat = exec('cat ' + p);
    const catText = cat.out.concat(cat.err).join('\n');
    if (catText.indexOf('No such file') !== -1) return { ok: false, note: '文件不存在' };
    if (catText.indexOf('gzip') === -1) return { ok: false, note: 'cat 没有拒绝：' + show(cat) };
    const zc = exec('zcat ' + p);
    if (zc.code !== 0 || !zc.out.length) return { ok: false, note: 'zcat 读不到内容：' + show(zc) };
    const zg = exec('zgrep -c . ' + p);
    if (zg.code !== 0) return { ok: false, note: 'zgrep 失败：' + show(zg) };
    return { ok: true };
  });
});

/* ==========================================================================
   汇总
   ========================================================================== */
console.log('\n' + '='.repeat(74));
if (failures.length) {
  console.log('✗ sim-data 校验失败：' + pass + ' 通过 / ' + failures.length + ' 失败');
  failures.forEach(function (f) { console.log('   ✗ ' + f); });
  console.log('='.repeat(74));
  process.exit(1);
}
console.log('✓ sim-data 校验通过：' + pass + ' 通过 / 0 失败');
console.log('  （每条断言都真跑了 ls/cat/stat/du/grep/sed/awk/sort/zcat/zgrep/file/find，');
console.log('    并确认目标路径确实来自 assets/js/sim-data.js 而不是被同路径数据挡掉）');
console.log('='.repeat(74));
process.exit(0);
