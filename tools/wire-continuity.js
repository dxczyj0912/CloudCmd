// tools/wire-continuity.js · 给内容打上「连贯性」的骨架
/* --------------------------------------------------------------------------
   连贯性 = 内容之间能不能互相找到对方。这个工具负责三件事：

     1. 配方标记   把 name 含中文的主题/组合条目打上 kind: 'recipe'
                    → 命令手册只留纯命令，配方单独成册（不至于手册定位模糊）
     2. 步骤回指   给 lessons[].steps[] 补 ref: '<命令id>'
                    → 有了它，课 ↔ 命令 ↔ 卡 三者才连得起来
                    （命令页能说"这命令在哪课学过"，卡能回指"教它的那节课"）
     3. 阶段前置   roadmap[] 补 prereq: 'stage-N' | null
                    → 学习路线图不再是一条无方向的直线

   用法：
     node tools/wire-continuity.js            写入（幂等，已存在的不动）
     node tools/wire-continuity.js --report    只报告匹配情况，不写盘
     node tools/wire-continuity.js --check     断言骨架完整，缺一处就非零退出
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const REPORT = ARGV.indexOf('--report') !== -1;
const CHECK = ARGV.indexOf('--check') !== -1;

const CJK = /[\u4e00-\u9fa5]/;

/* ── 载入数据（和站点一样用经典 script 注入 window）──────────────────── */
global.window = { CC_CATS: {}, CC_DATA: {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };

const loadFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const evalData = (rel) => eval(loadFile(rel));

evalData('data/_registry.js');
const CAT_IDS = Object.keys(window.CC_CATS);
CAT_IDS.forEach((id) => evalData('data/' + id + '.js'));
require('./_lessonlist').forEach(function (f) { evalData(f); });
evalData('data/roadmap.js');
evalData('data/termfs.js');
evalData('assets/js/store.js');
evalData('assets/js/shell.js');
require('./_cmdlist').forEach(function (f) { evalData(f); });

const DATA = window.CC_DATA;
const LESSONS = window.CC_LESSONS;
const ROADMAP = window.CC_ROADMAP;
const IMPL = new Set(window.CC_SHELL.commands);

const records = [];
CAT_IDS.forEach((cat) => (DATA[cat] || []).forEach((c) => records.push({ rec: c, cat: cat })));
const byId = new Map();
records.forEach((x) => byId.set(x.rec.id, x));

let problems = [];
let changed = 0;
const TABLE_ROWS = [];

/* ══════════════════════════════════════════════════════════════════════════
   1. 配方标记：name 含中文 = 主题/组合条目，不是单条命令
   ══════════════════════════════════════════════════════════════════════════ */

/* 按大括号深度扫出每条记录的文本块，绝不用跨块的正则
   （wire-phase2.js 曾经因为正则跨块误判过一次，这里用深度计数避免重演） */
function recordBlocks(src) {
  const lines = src.split('\n');
  const blocks = [];
  let depth = 0, start = -1, arrayDepth = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    /* 逐字符数括号，忽略字符串里的括号（数据里中文引号多，双引号字符串少） */
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        j++;
        while (j < line.length && lines[i][j] !== quote) { if (lines[i][j] === '\\') j++; j++; }
        continue;
      }
      if (ch === '[') { depth++; if (depth === 1) arrayDepth = i; }
      else if (ch === ']') { depth--; }
      else if (ch === '{') {
        depth++;
        /* 只有"整行就是一个左大括号"才算记录开始 ——
           否则 `if (window.CC_DATA[catId].length > 0) { return; }` 这类语句
           会被当成记录，扫出假块（这个坑与 wire-phase2.js 的跨块误判同源）。 */
        if (depth === 2 && line.trim() === '{') start = i;
      }
      else if (ch === '}') {
        depth--;
        if (depth === 1 && start !== -1) { blocks.push([start, i]); start = -1; }
      }
    }
  }
  return blocks;
}

function tagRecipes() {
  let tagged = 0, verified = 0, bad = [];
  CAT_IDS.forEach((cat) => {
    const rel = 'data/' + cat + '.js';
    const src = loadFile(rel);
    const blocks = recordBlocks(src);
    const lines = src.split('\n');
    const inserts = [];
    blocks.forEach(([a, b]) => {
      const body = lines.slice(a, b + 1).join('\n');
      const idM = body.match(/^\s*id:\s*'([^']+)'/m);
      const nameM = body.match(/^\s*name:\s*'((?:[^'\\]|\\.)*)'/m);
      if (!idM || !nameM) { bad.push(rel + ' 第 ' + (a + 1) + ' 行: 记录缺 id 或 name'); return; }
      const isRecipe = CJK.test(nameM[1]);
      const hasKind = /^\s*kind:\s*'recipe'/m.test(body);
      if (isRecipe && !hasKind) {
        /* 插在 name 那一行后面，保持可读 */
        const nameLine = lines.findIndex((l, i) => i >= a && i <= b && /^\s*name:\s*'/.test(l));
        inserts.push({ line: nameLine, text: "      kind: 'recipe'," });
        tagged++;
      } else if (isRecipe && hasKind) verified++;
      else if (!isRecipe && hasKind) bad.push(idM[1] + ': 名字不含中文却标了 recipe');
    });
    if (!REPORT && !CHECK && inserts.length) {
      inserts.sort((x, y) => y.line - x.line).forEach((ins) => lines.splice(ins.line + 1, 0, ins.text));
      fs.writeFileSync(path.join(ROOT, rel), lines.join('\n'), 'utf8');
      changed += inserts.length;
    }
  });
  bad.forEach((b) => problems.push('配方标记: ' + b));
  return { tagged: tagged, verified: verified };
}

/* ══════════════════════════════════════════════════════════════════════════
   2. 步骤回指：给每个 step 找到它对应的命令条目
   ══════════════════════════════════════════════════════════════════════════ */

/* 只认词对齐的前缀匹配：`kubectl get pods -n kube-system`
   会优先命中名为 `kubectl get pods` 的条目，而不是 `kubectl`。
   配方条目不参与匹配（它们本来就不是一条命令）。 */
const pureRecords = records.filter((x) => !CJK.test(x.rec.name));
const byFirstToken = new Map();
pureRecords.forEach((x) => {
  const tok = x.rec.name.trim().split(/\s+/)[0];
  if (!byFirstToken.has(tok)) byFirstToken.set(tok, []);
  byFirstToken.get(tok).push(x);
});

function stripSudo(cmd) {
  return String(cmd || '').replace(/^\s*(sudo|time|nohup|env)\s+/, '').trim();
}

/* 把一条命令行按管道/逻辑运算符切成若干段（引号内的不切）。
   一条教学步骤常常是 `cd /data/app && git status` 这种复合命令，
   整串去匹配会命中 `cd` —— 而那一步真正在教的是 `git status`。 */
function splitSegments(cmd) {
  const out = [];
  let buf = '', quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) { buf += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue; }
    const two = cmd.slice(i, i + 2);
    if (two === '&&' || two === '||') { out.push(buf); buf = ''; i++; continue; }
    if (ch === '|' || ch === ';') { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/* 名字里带 ` / ` 的条目（如 `hcloud VPC ListSecurityGroups / ListSecurityGroupRules`、
   `git switch / git checkout`）把每个变体都当成可匹配的名字；
   `alias` 里那些**看起来还是命令**的别名（`nginx -v`、`git checkout`）也算 ——
   否则 `nginx -v` 这一步只能挂到别的条目上。中文别名（"nginx 编译参数"）跳过。 */
function nameVariants(name, alias) {
  const head = name.trim().split(/\s+/)[0];
  const raw = name.split(/\s+\/\s+/).map((v) => v.trim()).filter(Boolean);
  (alias || []).forEach((a) => {
    const t = String(a).trim();
    if (!t || /[\u4e00-\u9fa5]/.test(t)) return;
    if (t.split(/\s+/)[0] !== head) return;
    raw.push(t);
  });
  return raw.map((v) => {
    const toks = v.split(/\s+/);
    /* 变体可能省略了命令前缀（`helm plugin / version / env`），补上第一段的前缀 */
    if (toks.length === 1 && !/[\u4e00-\u9fa5]/.test(v)) {
      if (head !== v) return head + ' ' + v;
    }
    return v;
  });
}

const NAME_TOKENS = new Map(); /* record.id → 各变体的 token 数组 */
pureRecords.forEach((x) => NAME_TOKENS.set(x.rec.id, nameVariants(x.rec.name, x.rec.alias).map((v) => v.split(/\s+/))));

function matchSegment(seg, lessonCat) {
  const cmd = stripSudo(seg);
  const tok = cmd.split(/\s+/)[0];
  if (!tok) return null;
  const cands = byFirstToken.get(tok) || [];
  const cmdTokens = cmd.split(/\s+/);
  let best = null;
  cands.forEach((x) => {
    NAME_TOKENS.get(x.rec.id).forEach((nameTokens) => {
      let hit = 0;
      for (let i = 0; i < nameTokens.length; i++) {
        if (cmdTokens[i] !== nameTokens[i]) break;
        hit++;
      }
      if (hit !== nameTokens.length) return; /* 整个变体必须完整出现 */
      const score = nameTokens.length;
      if (!best || score > best.score ||
          (score === best.score && x.cat === lessonCat && best.sameCat !== 1)) {
        best = { rec: x.rec, cat: x.cat, score: score, sameCat: x.cat === lessonCat ? 1 : 0 };
      }
    });
  });
  return best;
}

function matchRef(stepCmd, lessonCat) {
  const segs = splitSegments(String(stepCmd || ''));
  let best = null;
  for (let i = 0; i < segs.length; i++) {
    const m = matchSegment(segs[i], lessonCat);
    if (!m) continue;
    /* 命中的名字变体越长越可信；一样长时取靠后的那段
       （`cd /data/app && git status` 的真意在后半句） */
    if (!best || m.score > best.score || (m.score === best.score && i > best.segIdx)) {
      best = { rec: m.rec, cat: m.cat, score: m.score, segIdx: i, seg: segs[i] };
    }
  }
  if (!best) return null;
  return { ref: best.rec.id, name: best.rec.name, score: best.score, seg: best.seg };
}

/* 课程已经按主题拆成多个文件（见 tools/_lessonlist.js），
   回指要被回填到**每一个**文件里。 */
const LESSON_FILES = require('./_lessonlist');

function eachLessonFile(fn) {
  LESSON_FILES.forEach((rel) => {
    if (rel === 'data/lessons.js') return;   /* 这个只剩初始化，没有课程对象 */
    fn(rel, loadFile(rel));
  });
}

function wireStepRefs() {
  const insertsByFile = {};
  const report = { total: 0, already: 0, matched: 0, unmatched: [], ambiguous: [] };

  eachLessonFile((rel, src) => {
  const lines = src.split('\n');
  const inserts = [];
  insertsByFile[rel] = inserts;

  lines.forEach((line, i) => {
    /* cmd 可能是单引号也可能是双引号（命令里含单引号时作者会改用双引号） */
    const m = line.match(/^(\s*\{\s*title:.*?)\bcmd:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")(.*)$/);
    if (!m) return;
    const cmdText = (m[2] !== undefined ? m[2] : m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"');
    report.total++;
    if (/ref:\s*'/.test(line)) { report.already++; return; }
    /* 向上找这一课属于哪个分类与课号 */
    let cat = '', lesson = '';
    for (let k = i; k >= 0; k--) {
      if (!lesson) { const lm = lines[k].match(/^\s*id:\s*'([^']+)'/); if (lm) lesson = lm[1]; }
      const cm = lines[k].match(/^\s*cat:\s*'([^']+)'/);
      if (cm) { cat = cm[1]; break; }
    }
    const r = matchRef(cmdText, cat);
    if (!r) { report.unmatched.push(lesson + ' · ' + cmdText); return; }
    report.matched++;
    TABLE_ROWS.push([lesson, cat, cmdText, r.ref + '  (' + r.name + ')'].join(' | '));
    inserts.push({ line: i, cmd: cmdText, ref: r.ref });
  });

  if (!REPORT && !CHECK && inserts.length) {
    /* 从后往前插，避免行号漂移；每行只在 note 前插一个 ref */
    inserts.sort((a, b) => b.line - a.line).forEach((ins) => {
      const line = lines[ins.line];
      const at = line.indexOf('note:');
      const piece = "ref: '" + ins.ref + "', ";
      lines[ins.line] = at === -1
        ? line.replace(/,\s*\}\s*$,/, ", " + piece + "}")
        : line.slice(0, at) + piece + line.slice(at);
      changed++;
    });
    fs.writeFileSync(path.join(ROOT, rel), lines.join('\n'), 'utf8');
  }
  });

  /* 所有文件都扫完之后再统计（report 是跨文件共享的） */
  void insertsByFile;
  return report;
}

/* --check：已有的 ref 必须解析得到，且分的类要对得上 */
function checkStepRefs() {
  let n = 0, missing = 0, broken = 0, crossCat = 0;
  eachLessonFile((rel, src) => {
  const lines = src.split('\n');
  let cat = '';
  lines.forEach((line, i) => {
    const cm = line.match(/^\s*cat:\s*'([^']+)'/);
    if (cm) cat = cm[1];
    if (!/^\s*\{\s*title:.*\bcmd:\s*(?:'|")/.test(line)) return;
    n++;
    const rm = line.match(/ref:\s*'([^']+)'/);
    if (!rm) { missing++; problems.push('步骤缺 ref（第 ' + (i + 1) + ' 行）: ' + line.trim().slice(0, 70)); return; }
    const hit = byId.get(rm[1]);
    if (!hit) { broken++; problems.push('步骤 ref 断链: ' + rm[1]); return; }
    /* 跨分类引用是允许的（cloud-cli 的课讲到 shell 的重定向很正常），
       只统计不判错 —— 判错会逼着把命令塞进错误的分类。 */
    if (hit.cat !== cat) crossCat++;
  });
  });
  return { steps: n, missing: missing, broken: broken, crossCat: crossCat };
}

/* ══════════════════════════════════════════════════════════════════════════
   3. 阶段前置
   ══════════════════════════════════════════════════════════════════════════ */
function wirePrereq() {
  const rel = 'data/roadmap.js';
  let src = loadFile(rel);
  const inserts = [];
  ROADMAP.forEach((st, idx) => {
    if (/'prereq'|prereq:/.test(src)) { /* 已有就不重复插 */ }
    const prev = idx === 0 ? null : ROADMAP[idx - 1].id;
    const want = '      prereq: ' + (prev ? "'" + prev + "'" : 'null') + ',';
    /* 定位该阶段块里的 duration 行，插在它后面 */
    const re = new RegExp("(id: '" + st.id + "'[\\s\\S]*?\\n\\s*duration: '[^']*',)");
    const m = src.match(re);
    if (!m) { problems.push('阶段 ' + st.id + ' 找不到 duration 行'); return; }
    if (new RegExp("id: '" + st.id + "'[\\s\\S]{0,400}?prereq:").test(src)) return;
    inserts.push({ anchor: m[1], want: want });
  });
  if (!REPORT && !CHECK && inserts.length) {
    inserts.forEach((ins) => { src = src.replace(ins.anchor, ins.anchor + '\n' + ins.want); changed++; });
    fs.writeFileSync(path.join(ROOT, rel), src, 'utf8');
  }
  return inserts.length;
}

/* ══════════════════════════════════════════════════════════════════════════
   跑
   ══════════════════════════════════════════════════════════════════════════ */
console.log('='.repeat(70));
console.log(CHECK ? '连贯性骨架校验' : (REPORT ? '连贯性骨架匹配报告（不写盘）' : '连贯性骨架写入'));
console.log('='.repeat(70));

const recipes = tagRecipes();
console.log('\n[1] 配方标记  ' + (REPORT || CHECK ? '需补 ' : '新标记 ') + recipes.tagged + ' 条，已标记 ' + recipes.verified + ' 条');

const steps = wireStepRefs();
console.log('[2] 步骤回指  共 ' + steps.total + ' 步 | 已有 ref ' + steps.already + ' | 匹配到 ' + steps.matched +
            ' | 未匹配 ' + steps.unmatched.length + ' | 有歧义 ' + steps.ambiguous.length);
if (steps.unmatched.length) {
  console.log('    未匹配的步骤命令：');
  steps.unmatched.slice(0, 40).forEach((c) => console.log('      ' + c));
}
if (steps.ambiguous.length) {
  console.log('    有歧义（同名条目跨分类）：');
  steps.ambiguous.slice(0, 20).forEach((c) => console.log('      ' + c));
}
if (ARGV.indexOf('--table') !== -1) {
  console.log('\n    课 | 分类 | 步骤命令 | 回指条目');
  TABLE_ROWS.forEach((r) => console.log('    ' + r));
}

const pre = wirePrereq();
console.log('[3] 阶段前置  ' + (REPORT || CHECK ? '需补 ' : '新写入 ') + pre + ' 个阶段');

if (CHECK) {
  const r = checkStepRefs();
  console.log('\n[校验] 步骤 ' + r.steps + ' 个 | 缺 ref ' + r.missing + ' | 断链 ' + r.broken + ' | 跨分类 ' + r.crossCat);
}

if (problems.length) {
  console.log('\n问题 ' + problems.length + ' 处：');
  problems.slice(0, 30).forEach((p) => console.log('  ✗ ' + p));
  if (problems.length > 30) console.log('  … 还有 ' + (problems.length - 30) + ' 处');
} else {
  console.log('\n没有发现问题。');
}
if (!REPORT && !CHECK) console.log('本次共写入 ' + changed + ' 处。');
console.log('='.repeat(70));
process.exit(problems.length ? 1 : 0);
