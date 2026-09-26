#!/usr/bin/env node
/* ==========================================================================
   tools/link-check.js · 站内官方文档链接体检
   --------------------------------------------------------------------------
   为什么需要它：全站 822 条命令带 600+ 个唯一 docs 链接（分布在 67 个域名）。
   内容是分批产出的，链接是**会烂的**——本轮人工抽查就抓到过 4 个 404
   （keepalived 改版、cloud-init 迁站、libvirt manpage 改名、Terraform 删掉了
    `backend "obs"`）。手工 curl 600 次不可能常态化，所以固化成脚本。

   用法：
     node tools/link-check.js                 # 全量检查（约 1~3 分钟）
     node tools/link-check.js --limit=50      # 只查前 50 个，快速冒烟
     node tools/link-check.js --domain=man7.org
     node tools/link-check.js --strict        # 有失败就退出码 1（可用于 CI 门禁）
     node tools/link-check.js --json          # 机器可读输出

   ⚠️ 默认**不阻断**：外链会因为对方限流、区域网络、临时故障而失败，
   不应该卡住本地开发。只有显式 --strict 才返回非 0。

   两个必须处理的现实问题（都踩过）：
   1. **有些站点拒绝 HEAD**（返回 403/405/501），但对 GET 正常。
      `dev.mysql.com` 是典型：Oracle 的 WAF 对脚本请求直接 403。
      → HEAD 失败时自动降级为"GET 但只读响应头就断开"。
   2. **要带浏览器 UA**：不少文档站对空 UA 或无 UA 的请求返回 403/429。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const argv = process.argv.slice(2);
const has = f => argv.some(a => a === f || a.startsWith(f + '='));
const val = (f, d) => {
  const a = argv.find(x => x.startsWith(f + '='));
  return a ? a.slice(f.length + 1) : d;
};
const STRICT = has('--strict');
const AS_JSON = has('--json');
const LIMIT = parseInt(val('--limit', '0'), 10) || 0;
const ONLY_DOMAIN = val('--domain', '');
const CONCURRENCY = parseInt(val('--concurrency', '8'), 10) || 8;
const TIMEOUT = parseInt(val('--timeout', '12000'), 10) || 12000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/* ---------- 1.1 被 WAF 挡住、但内容有官方镜像的站点 ----------
   `dev.mysql.com` 对任何脚本请求都返回 403（Oracle 的 WAF），浏览器里却正常。
   直接把它算成"死链"是误报，直接跳过又等于不检查。
   办法：走同内容的 docs.oracle.com 镜像做代理校验 ——
   镜像返回 200 说明这一页确实存在；镜像返回 404 说明 MySQL 文档里这一页
   真的没了（改名/删除），那才是需要修的。
   镜像地址由 dev.mysql.com/doc/refman/<版本>/<语言>/<页> 映射到
   docs.oracle.com/cd/E17952_01/mysql-<版本>-<语言>/<页>。 */
const MIRROR = [
  {
    test: /^https:\/\/dev\.mysql\.com\/doc\/refman\/([0-9.]+)\/([a-z]{2})\/(.+)$/,
    to: (m) => 'https://docs.oracle.com/cd/E17952_01/mysql-' + m[1] + '-' + m[2] + '/' + m[3],
    note: 'dev.mysql.com 对脚本请求返回 403（Oracle WAF），已用 docs.oracle.com 官方镜像代理校验',
  },
];

function mirrorOf(url) {
  for (const m of MIRROR) {
    const hit = url.match(m.test);
    if (hit) return { url: m.to(hit), note: m.note };
  }
  return null;
}

/* ---------- 1. 收集站内所有 docs 链接 ---------- */
global.window = { CC_CATS: {}, CC_DATA: {}, CC_LESSONS: [], CC_ROADMAP: [], CC_CHEAT: [] };
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.js')).sort();
for (const f of files) {
  try { require(path.join(DATA_DIR, f)); } catch (e) { /* 语法错误由 validate-data 报 */ }
}

/** url → [ { catId, id, name } ] */
const links = new Map();
let cmdCount = 0, noDocs = 0;
for (const catId of Object.keys(global.window.CC_DATA)) {
  for (const cmd of global.window.CC_DATA[catId] || []) {
    cmdCount++;
    if (!cmd.docs) { noDocs++; continue; }
    if (!links.has(cmd.docs)) links.set(cmd.docs, []);
    links.get(cmd.docs).push({ catId, id: cmd.id, name: cmd.name });
  }
}

let urls = [...links.keys()].sort();
if (ONLY_DOMAIN) urls = urls.filter(u => { try { return new URL(u).hostname.includes(ONLY_DOMAIN); } catch (e) { return false; } });
if (LIMIT) urls = urls.slice(0, LIMIT);

/* ---------- 2. 单条链接体检（HEAD，失败降级 GET） ---------- */
function request(url, method) {
  return new Promise(resolve => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ status: 0, err: 'URL 无法解析' }); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return resolve({ status: 0, err: '非 http(s) 协议' });
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(method === 'GET' ? { 'Range': 'bytes=0-2048' } : {}),
      },
    }, res => {
      /* 拿到响应头就够了，不用等下完（有些页面几百 KB） */
      const status = res.statusCode;
      res.destroy();
      resolve({ status, location: res.headers.location });
    });
    req.setTimeout(TIMEOUT, () => { req.destroy(); resolve({ status: 0, err: '超时 ' + TIMEOUT + 'ms' }); });
    req.on('error', e => resolve({ status: 0, err: e.code || e.message }));
    req.end();
  });
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

async function check(url, opts) {
  opts = opts || {};
  let target = url;
  let lastStatus = 0;
  for (let hop = 0; hop < 6; hop++) {
    let r = await request(target, 'HEAD');
    /* 只要 HEAD 不是 2xx/3xx，就换 GET 再试一次。
       ⚠️ 这里不能用"白名单"（只对 403/405/501 降级）：华为云文档站对 HEAD
       返回的是 **567**，不在任何常见白名单里，于是 31 条华为云链接全被误报成死链。
       实测同一个地址 GET 就是 200。所以规则改成"非 2xx/3xx 一律用 GET 复核"。 */
    if (!(r.status >= 200 && r.status < 400)) {
      const g = await request(target, 'GET');
      if (g.status) r = g;
    }
    lastStatus = r.status;
    if (REDIRECT.has(r.status) && r.location) {
      try { target = new URL(r.location, target).toString(); } catch (e) { return { ok: false, status: r.status, err: '重定向地址异常', url }; }
      continue;
    }
    if (r.status >= 200 && r.status < 400) return { ok: true, status: r.status, finalUrl: target, moved: target !== url };

    /* 被 WAF 挡住（403/429）时，用官方镜像代理校验一次 */
    if (r.status === 403 || r.status === 429 || r.status === 0) {
      const mir = mirrorOf(url);
      if (mir) {
        const mr = await check(mir.url, { noMirror: true });
        if (mr.ok) {
          return { ok: true, status: r.status, viaMirror: mir.url, mirrorNote: mir.note, url };
        }
        return {
          ok: false, status: mr.status, kind: 'dead',
          err: '主站 ' + r.status + '（WAF），镜像 ' + mir.url + ' 返回 ' + mr.status + ' —— 该页面可能已改名或删除',
          url,
        };
      }
    }
    return { ok: false, status: r.status, err: r.err || ('HTTP ' + r.status), url: target };
  }
  return { ok: false, status: lastStatus, err: '重定向次数过多', url: target };
}

/* ---------- 2.1 结果分类 ----------
   600+ 个外链里，"打不开"有好几种完全不同的原因，混在一起报会让人
   以为站里全是死链（实测第一次全量跑：140 个异常，其中真死链只有 18 个）。
     · dead         404/410 —— 页面真的没了，**必须修**
     · blocked      403/418/429/451/567 —— 对方反爬/限流，浏览器里能开
     · unreachable  超时/连接重置/DNS —— 网络或限流，过一会儿再跑
   只有 dead 是内容问题。 */
function classify(r) {
  if (r.ok) return 'ok';
  if (r.status === 404 || r.status === 410 || r.status === 451) return 'dead';
  if ([400, 401, 403, 405, 406, 418, 429, 500, 501, 502, 503, 567].includes(r.status)) return 'blocked';
  if (!r.status) return 'unreachable';
  return 'blocked';
}

/* ---------- 3. 并发跑 ---------- */
(async function main() {
  const t0 = Date.now();
  if (!AS_JSON) {
    console.log('== 官方文档链接体检 ==');
    console.log('  命令总数：' + cmdCount + ' ｜ 无 docs 字段：' + noDocs);
    console.log('  唯一链接：' + links.size + ' ｜ 本次检查：' + urls.length +
      (ONLY_DOMAIN ? '（只查 ' + ONLY_DOMAIN + '）' : ''));
    console.log('  并发 ' + CONCURRENCY + ' ｜ 单条超时 ' + TIMEOUT + 'ms\n');
  }

  const results = [];
  let cursor = 0, done = 0;
  async function worker() {
    while (cursor < urls.length) {
      const i = cursor++;
      const url = urls[i];
      const r = await check(url);
      r.url = r.url || url;
      r.commands = links.get(url);
      r.kind = classify(r);
      results.push(r);
      done++;
      if (!AS_JSON && done % 25 === 0) process.stdout.write('  ...已检查 ' + done + '/' + urls.length + '\r');
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  if (!AS_JSON) process.stdout.write(' '.repeat(40) + '\r');

  /* ---------- 3.1 二次复核 ----------
     超时/连接重置/429 多半是刚才请求太密被限流，不是死链。
     隔一段时间、用更低并发重跑一遍，能救回大部分误报。 */
  const RETRY_KINDS = ['unreachable', 'blocked'];
  const retryList = results.filter(r => RETRY_KINDS.includes(r.kind));
  if (retryList.length && !has('--no-retry')) {
    if (!AS_JSON) console.log('  ' + retryList.length + ' 条失败，等 4 秒后以低并发复核一遍（多半是限流）...\n');
    await new Promise(r => setTimeout(r, 4000));
    const q = [...retryList];
    let qi = 0;
    async function retryWorker() {
      while (qi < q.length) {
        const r = q[qi++];
        const again = await check(r.url);
        r.retried = true;
        r.retryStatus = again.status;
        if (again.ok) {
          Object.assign(r, again, { ok: true, kind: 'ok', url: r.url, commands: r.commands, recoveredOnRetry: true });
        } else if (classify(again) === 'dead') {
          Object.assign(r, again, { ok: false, kind: 'dead', url: r.url, commands: r.commands });
        } else {
          r.retryErr = again.err;
          r.status = again.status || r.status;
        }
        await new Promise(res => setTimeout(res, 120)); /* 慢一点，别再被限流 */
      }
    }
    await Promise.all([retryWorker(), retryWorker()]);
  }

  const bad = results.filter(r => !r.ok);
  const dead = bad.filter(r => r.kind === 'dead');
  const blocked = bad.filter(r => r.kind === 'blocked');
  const unreachable = bad.filter(r => r.kind === 'unreachable');
  const recovered = results.filter(r => r.recoveredOnRetry);
  const moved = results.filter(r => r.ok && r.moved);
  const viaMirror = results.filter(r => r.ok && r.viaMirror);
  const byDomain = {};
  for (const r of results) {
    let h = '?';
    try { h = new URL(r.url).hostname; } catch (e) { /* ignore */ }
    byDomain[h] = byDomain[h] || { ok: 0, dead: 0, other: 0 };
    if (r.ok) byDomain[h].ok++;
    else if (r.kind === 'dead') byDomain[h].dead++;
    else byDomain[h].other++;
  }

  if (AS_JSON) {
    console.log(JSON.stringify({
      total: urls.length, checked: results.length,
      ok: results.length - bad.length, dead, blocked, unreachable, moved, viaMirror, recovered,
    }, null, 2));
  } else {
    console.log('结果：' + (results.length - bad.length) + ' 正常 ｜ ' +
      dead.length + ' 真死链 ｜ ' + blocked.length + ' 反爬/限流 ｜ ' + unreachable.length + ' 网络不通');
    if (recovered.length) console.log('      （二次复核救回 ' + recovered.length + ' 条，说明它们是限流不是死链）');
    console.log('耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's\n');

    if (dead.length) {
      console.log('=== 需要修的：页面真的不存在（404/410）===');
      const g = {};
      for (const r of dead) {
        let h = '?'; try { h = new URL(r.url).hostname; } catch (e) {}
        (g[h] = g[h] || []).push(r);
      }
      for (const h of Object.keys(g).sort()) {
        console.log('\n  [' + h + ']  ' + g[h].length + ' 条');
        for (const r of g[h]) {
          console.log('    ✗ ' + r.status + '  ' + r.url);
          console.log('      被引用于：' + r.commands.slice(0, 4).map(c => c.id).join(', ') +
            (r.commands.length > 4 ? ' 等 ' + r.commands.length + ' 条' : ''));
        }
      }
      console.log('');
    }

    if (blocked.length || unreachable.length) {
      console.log('=== 无法自动校验的（对方反爬/限流/网络，多半浏览器里能开）===');
      const g = {};
      for (const r of blocked.concat(unreachable)) {
        let h = '?'; try { h = new URL(r.url).hostname; } catch (e) {}
        (g[h] = g[h] || []).push(r);
      }
      for (const h of Object.keys(g).sort((a, b) => g[b].length - g[a].length)) {
        const kinds = {};
        g[h].forEach(r => { const k = r.status || r.err || '?'; kinds[k] = (kinds[k] || 0) + 1; });
        console.log('  ' + String(g[h].length).padStart(3) + '  ' + h.padEnd(28) +
          Object.keys(kinds).map(k => k + '×' + kinds[k]).join(' '));
      }
      console.log('\n  单查某个域名：node tools/link-check.js --domain=<域名>');
      console.log('  这些不计入失败（要当门禁用，加 --strict --dead-only）\n');
    }

    if (viaMirror.length) {
      console.log('=== 经官方镜像代理校验通过（主站对脚本返回 403）===');
      console.log('  ' + viaMirror.length + ' 个：' + viaMirror[0].mirrorNote + '\n');
    }

    const domains = Object.keys(byDomain).sort((a, b) => (byDomain[b].ok + byDomain[b].dead + byDomain[b].other) - (byDomain[a].ok + byDomain[a].dead + byDomain[a].other));
    console.log('=== 域名分布（前 12）===');
    for (const d of domains.slice(0, 12)) {
      const s = byDomain[d];
      console.log('  ' + String(s.ok + s.dead + s.other).padStart(4) + '  ' +
        (s.dead ? '✗死链' + s.dead + ' ' : '      ') + (s.other ? '△' + s.other : '  ') + '  ' + d);
    }

    if (moved.length) {
      console.log('\n=== 发生过跳转（建议改成最终地址，少一跳更快更稳）===');
      for (const r of moved.slice(0, 10)) console.log('  ' + r.url + '\n    → ' + r.finalUrl);
      if (moved.length > 10) console.log('  ...还有 ' + (moved.length - 10) + ' 个');
    }

    console.log('\n' + (dead.length
      ? (STRICT ? '❌ 存在 ' + dead.length + ' 个真死链（--strict，退出码 1）'
        : '⚠ 存在 ' + dead.length + ' 个真死链（默认不阻断；加 --strict 可作 CI 门禁）')
      : '✅ 没有真死链'));
  }

  const failCount = has('--dead-only') ? dead.length : dead.length + blocked.length + unreachable.length;
  process.exit(STRICT && failCount ? 1 : 0);
})();
