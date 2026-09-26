// tools/example-check.js · 把 3000+ 条示例真的跑一遍
/* --------------------------------------------------------------------------
   写在这里的每条示例，学员都会照着敲。所以示例不能只是"看起来对"——
   必须真的能在模拟终端里跑出结果。

   这个工具逐条执行 examples[].cmd，把结果分成五类：

     ok         跑通，没有错误输出
     notimpl    首词是「内容里收录、引擎不实现」的命令（如 ssh/virsh），预期内
     skip       含 <占位符> 或跨行片段（YAML/SQL/脚本），无法直接执行
     unknown    首词既不在引擎、也不在任何一条命令条目里 —— 多半是**打错字**
     broken     跑起来了但报错（文件不存在、参数不认、路径错），**这是内容缺陷**

   `broken` 里有一部分是**故意演示报错**的示例（例如"删掉右大括号看报错"）。
   这类写进 tools/example-allow.txt，格式：一行一条子串匹配，`#` 开头是注释。

   用法：
     node tools/example-check.js             人类可读报告（有问题时非零退出）
     node tools/example-check.js --json      机器可读
     node tools/example-check.js --cat docker  只看某个分类
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const JSON_OUT = ARGV.indexOf('--json') !== -1;
const catArgIdx = ARGV.indexOf('--cat');
const ONLY_CAT = catArgIdx === -1 ? null : ARGV[catArgIdx + 1];

global.window = { CC_CATS: {}, CC_DATA: {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };

const load = (f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
load('data/_registry.js');
const CATS = Object.keys(window.CC_CATS).filter((c) => !ONLY_CAT || c === ONLY_CAT);
CATS.forEach((id) => load('data/' + id + '.js'));
load('data/termfs.js');
load('assets/js/store.js');
load('assets/js/shell.js');
require('./_cmdlist').forEach(function (f) { load(f); });

const SHELL = window.CC_SHELL.create();
const IMPL = new Set(window.CC_SHELL.commands);
const NOT_IMPL = new Set(window.CC_SHELL.notImplemented);

/* ── 测试隔离：每条示例都在**自己的 shell** 里跑 ──────────────────────────────
   ⚠️ 这里曾经用**一个共享 shell** 跑完全部 3000+ 条示例，后果是一批
   "完全正确、而且本来就是这么用的"示例被误判成报错：
     mv /data/app/logs/order.log  /data/app/logs/order.log.$(date +%F)
     rename .log .log.bak /data/app/logs/*.log
     gzip -9 /data/backup/db.sql
     mv /var/log/nginx/access.log /var/log/nginx/access.log.$(date +%F) && nginx -s reopen
   这些示例**改了共享夹具**（把文件改名/压缩掉），而排在它们后面的示例
   还要读同一个文件 —— 于是报 `cat: /data/app/logs/app.log: No such file or directory`。
   被误判的示例有 5+ 条，而**真正的缺陷被淹没在这些噪音里**。
   对照实验（先跑 4 条破坏性示例，再看后续示例）：
     共享 shell → 8 条里 8 条失败；每条重置 shell → 8 条里只剩 4 条真失败。
/* ── 测试隔离：每条命令条目一个 shell（记录内共享，跨记录隔离）──
   见上方长注释：粒度是实测选出来的（38 → 32 → 48）。 */
function freshShell() { return window.CC_SHELL.create(); }
void SHELL;
const ALIAS = { ll: 'ls', la: 'ls', dir: 'ls', egrep: 'grep', fgrep: 'grep', mawk: 'awk', gawk: 'awk', less: 'cat', more: 'cat', zcat: 'zcat' };

/* 每条命令条目名的首词，用来判断"unknown"到底是不是打错字 */
const DOC_TOKENS = new Set();
Object.keys(window.CC_CATS).forEach((id) => (window.CC_DATA[id] || []).forEach((c) => {
  DOC_TOKENS.add(c.name.trim().split(/\s+/)[0]);
}));

const ALLOW = (() => {
  const p = path.join(ROOT, 'tools/example-allow.txt');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.charAt(0) !== '#');
})();

const ERROR_PATTERNS = [
  /No such file or directory/,
  /not a directory/,
  /Is a directory/,
  /command not found/,
  /invalid option/i,
  /unrecognized option/i,
  /unexpected argument/i,
  /Unknown command/i,
  /could not resolve host/i,
  /Permission denied/,
  /not a git repository/
];

function firstToken(cmd) {
  let t = String(cmd).trim();
  const parts = t.split(/\s+/);
  let i = 0;
  /* 前缀词要跳过去再判断"首词是哪个命令"。
     两条修正（都是**检查器在说假话**的情形）：
       ① **`变量=值` 赋值前缀**要跳。真 shell 里
          `ETCDCTL_API=3 etcdctl endpoint health` 是合法写法，
          站内 etcdctl 一族 7 条记录全这么写；不跳就会把 `ETCDCTL_API=3`
          当成命令名，归进"疑似打错"。
       ② **只跳"本身没被实现"的包装词**。早先无条件跳 `watch`/`xargs`/`sudo`，
          可这三个在本引擎里都是**真命令**：
            watch -n 1 -d "df -h /data"   → 首词被算成 `-n`，落进"疑似打错"
            xargs -I {} mv {} /dst/       → 首词被算成 `-I`
          `sudo -l` 也因此被算成 `sudo: -l` 而不是 `sudo`。
          改法：包装词只在**它自己不在 IMPL 里**时才跳，
          这样 `time cmd`（time 未实现）仍然会看到 `cmd`，
          而 `watch`/`xargs`/`sudo`（已实现）就地停下、按真命令去跑。 */
  while (i < parts.length && (/^(sudo|time|nohup|env|watch|nice|xargs)$/.test(parts[i]) && !IMPL.has(parts[i]) ||
    /^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[i]))) i++;
  let tok = (parts[i] || '').replace(/^[([{]+/, '');
  return ALIAS[tok] || tok;
}

/* 这条记录**描述的是一条命令行**吗？
   判据与 assets/js/render.js 的 runnability() 同一套：`syntax` 的首词必须与 `name`
   的首词一致。`obsutil ls` ✓ ｜ `arthas`（syntax 是 `java -jar arthas-boot.jar 然后 …`）✗
   为什么 here 也要判：像 arthas 这种记录，它的 examples 是**它自己控制台里的子命令**
   （`dashboard` / `thread -n 3` / `watch <类> <方法>`），根本不是 shell 命令。
   其中恰好有一个子命令叫 `watch` —— 与 shell 的 watch 同名，于是检查器**真的去跑**它，
   报 `command not found`，在"报错"栏里留下一条**假缺陷**。
   （同理还有 thread/trace/jad 之类；它们此前落在"疑似打错"栏，也是误报。） */
function isCommandRecord(rec) {
  const nameTok = String(rec.name || '').trim().split(/\s+/)[0];
  const syn = String(rec.syntax || '').trim();
  if (!syn) return false;
  return syn.split(/\s+/)[0] === nameTok;
}

const rows = [];
CATS.forEach((cat) => (window.CC_DATA[cat] || []).forEach((rec) => {
  /* 每条**记录**一个 shell：记录内示例可以接力（ex1 建文件、ex2 用它），
     跨记录互不影响 —— 这样"某条示例把共享夹具改坏了"就不会误伤后面的记录。 */
  const recShell = freshShell();
  const cmdRec = isCommandRecord(rec);
  (rec.examples || []).forEach((ex, ei) => {
    const cmd = String(ex.cmd || '');
    const row = { cat: cat, id: rec.id, name: rec.name, ei: ei, cmd: cmd, desc: ex.desc || '', kind: 'ok', detail: '' };
    if (!cmd.trim()) { row.kind = 'skip'; row.detail = '空命令'; rows.push(row); return; }
    if (cmd.indexOf('<') !== -1) { row.kind = 'skip'; row.detail = '含占位符'; rows.push(row); return; }
    if (cmd.indexOf('\n') !== -1) { row.kind = 'skip'; row.detail = '跨行片段'; rows.push(row); return; }
    /* 非命令行条目（控制台子命令 / 配置片段 / 流程）：示例不是 shell 输入，跳过 */
    if (!cmdRec) { row.kind = 'skip'; row.detail = '非命令行条目（控制台/配置/流程）'; rows.push(row); return; }
    const tok = firstToken(cmd);
    if (IMPL.has(tok)) {
      let res;
      try { res = recShell.exec(cmd); }
      catch (e) { row.kind = 'broken'; row.detail = '引擎抛异常: ' + e.message; rows.push(row); return; }
      const errText = (res.err || []).join('\n');
      const hit = ERROR_PATTERNS.filter((re) => re.test(errText))[0];
      if (hit) {
        const allowed = ALLOW.some((a) => cmd.indexOf(a) !== -1);
        row.kind = allowed ? 'ok' : 'broken';
        row.detail = (allowed ? '（已豁免）' : '') + errText.slice(0, 120).replace(/\n/g, ' / ');
      }
      rows.push(row);
      return;
    }
    if (NOT_IMPL.has(tok) || DOC_TOKENS.has(tok)) { row.kind = 'notimpl'; row.detail = tok; rows.push(row); return; }
    row.kind = 'unknown'; row.detail = tok; rows.push(row);
  });
}));

const counts = {};
rows.forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });

if (JSON_OUT) {
  console.log(JSON.stringify({ counts: counts, rows: rows.filter((r) => r.kind === 'broken' || r.kind === 'unknown') }, null, 1));
  process.exit(counts.broken ? 1 : 0);
}

console.log('='.repeat(78));
console.log('示例可执行性检查（' + (ONLY_CAT || '全部分类') + '）');
console.log('='.repeat(78));
console.log('共 ' + rows.length + ' 条示例：' +
  ' 跑通 ' + (counts.ok || 0) +
  ' | 未实现命令 ' + (counts.notimpl || 0) +
  ' | 跳过 ' + (counts.skip || 0) +
  ' | **报错 ' + (counts.broken || 0) + '**' +
  ' | 疑似打错 ' + (counts.unknown || 0));

function group(list, keyFn) {
  const g = new Map();
  list.forEach((r) => { const k = keyFn(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); });
  return g;
}

const broken = rows.filter((r) => r.kind === 'broken');
if (broken.length) {
  console.log('\n── 报错的示例（内容缺陷，必须修）──');
  const byMsg = group(broken, (r) => r.detail.replace(/^（已豁免）/, '').replace(/'[^']*'/g, "'…'").slice(0, 60));
  [...byMsg.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([msg, list]) => {
    console.log('\n  [' + list.length + ' 条] ' + msg);
    const byCat = group(list, (r) => r.cat);
    [...byCat.entries()].forEach(([cat, l]) => {
      console.log('    ' + cat + ' (' + l.length + ')');
      l.slice(0, 4).forEach((r) => console.log('      · ' + r.id + ' → ' + r.cmd.slice(0, 110)));
      if (l.length > 4) console.log('      … 另 ' + (l.length - 4) + ' 条');
    });
  });
}

const unknown = rows.filter((r) => r.kind === 'unknown');
if (unknown.length) {
  console.log('\n── 首词疑似打错（引擎与条目里都找不到）──');
  const byTok = group(unknown, (r) => r.detail);
  [...byTok.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 25).forEach(([tok, list]) => {
    console.log('  ' + tok + ' × ' + list.length + '  例: ' + list[0].cmd.slice(0, 90));
  });
}

const notimpl = rows.filter((r) => r.kind === 'notimpl');
if (notimpl.length) {
  const byTok = group(notimpl, (r) => r.detail);
  const top = [...byTok.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log('\n── 引擎未实现（可接受，但要心里有数）前 20 个命令 ──');
  console.log('  ' + top.slice(0, 20).map(([t, l]) => t + '×' + l.length).join('  '));
  console.log('  未实现命令共 ' + byTok.size + ' 个，涉及 ' + notimpl.length + ' 条示例');
}

console.log('\n' + '='.repeat(78));
process.exit(broken.length ? 1 : 0);
