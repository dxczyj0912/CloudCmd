#!/usr/bin/env node
/* ==========================================================================
   tools/validate-data.js · 数据契约校验
   用法： node tools/validate-data.js
   校验项：
     1. 每个数据文件能被加载（语法正确）
     2. 必填字段齐全：id / name / level / syntax / summary / examples
     3. id 全局唯一（跨分类也不能重复，因为 related 是全局查的）
     4. examples[].cmd 非空且不含裸占位符（尖括号 <...> 占位符是正式约定，不算裸占位符）
     5. tags / notes 类型正确，params 结构正确
     6. related 引用的 id 必须存在（警告级）
     7. docs 必须是 http(s) 链接（警告级）
     8. 汇总各分类条数，与 Phase 1 目标对比
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

/* 建立浏览器全局的模拟环境 */
global.window = { CC_CATS: {}, CC_DATA: {}, CC_ROADMAP: [], CC_CHEAT: [] };

function banner(s) {
  console.log('\n' + '='.repeat(64) + '\n' + s + '\n' + '='.repeat(64));
}

/* ---------- 1. 加载全部数据文件 ---------- */
const files = fs.readdirSync(DATA_DIR)
  .filter(f => f.endsWith('.js'))
  .sort();

const loadErrors = [];
for (const f of files) {
  try {
    require(path.join(DATA_DIR, f));
  } catch (e) {
    loadErrors.push({ file: f, error: e.message });
  }
}

banner('1. 数据文件加载');
console.log(`扫描到 ${files.length} 个文件：${files.join(', ')}`);
if (loadErrors.length) {
  for (const e of loadErrors) console.log(`  ✗ ${e.file} 加载失败：${e.error}`);
} else {
  console.log('  ✓ 全部文件语法正确、可加载');
}

const CATS = window.CC_CATS;
const DATA = window.CC_DATA;
const CHEAT = window.CC_CHEAT || [];
const ROADMAP = window.CC_ROADMAP || [];

/* ---------- 2. 契约校验 ---------- */
const REQUIRED = ['id', 'name', 'level', 'syntax', 'summary', 'examples'];
/* 裸占位符：必须"看起来就是占位符"才算，避免误报真路径/真域名
   （例：/srv/git/myapp.git 不该命中；而 "你的服务器"、"your-value" 该命中） */
const PLACEHOLDER_RE = /xxx+|XXX+|你的[^\s/]|your-[a-z0-9]|\bfoo\b|\bbar\b|示例值|placeholder|TODO:|待填/;
/* 尖括号占位符是本项目的正式约定（如 obs://<桶名>/web/、--cli-access-key=<你的AK>），
   它是有意标注的"这里要换成你自己的值"，不算裸占位符。
   检测前先剥掉 <...> 片段，这样 <你的AK> 放行、而裸写的 "你的服务器" 仍然报错。 */
const stripAnglePlaceholders = s => String(s).replace(/<[^<>]*>/g, ' ');
const problems = [];   // 错误
const warnings = [];   // 警告

const seenIds = Object.create(null);
let totalCmds = 0;
const perCat = [];

for (const catId of Object.keys(CATS)) {
  const cat = CATS[catId];
  if (cat.id !== catId) problems.push(`分类键与 id 不一致：CC_CATS['${catId}'].id = '${cat.id}'`);

  const list = DATA[catId] || [];
  perCat.push({ catId, name: cat.name, status: cat.status, count: list.length });
  totalCmds += list.length;

  if (cat.status === 'ready' && list.length === 0) {
    problems.push(`分类 ${catId} 标记为 ready 但没有任何命令`);
  }
  if (!Array.isArray(list)) { problems.push(`CC_DATA['${catId}'] 不是数组`); continue; }

  list.forEach((cmd, i) => {
    const where = `${catId}[${i}] ${cmd && cmd.name ? cmd.name : '(无名)'}`;

    for (const f of REQUIRED) {
      const v = cmd[f];
      const empty = v === undefined || v === null || v === '' ||
        (Array.isArray(v) && v.length === 0);
      if (empty) problems.push(`${where} 缺少必填字段 ${f}`);
    }

    if (cmd.id) {
      if (seenIds[cmd.id]) problems.push(`id 重复：${cmd.id}（已在 ${seenIds[cmd.id]} 出现）`);
      else seenIds[cmd.id] = where;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(cmd.id)) {
        warnings.push(`${where} 的 id 不是 kebab-case：${cmd.id}`);
      }
    }

    if (cmd.level !== undefined && ![1, 2, 3, 4].includes(cmd.level)) {
      problems.push(`${where} 的 level 非法：${cmd.level}（应为 1~4）`);
    }

    /* summary 规范：一句话 20~45 字（《内容规范》§2）。
       定成警告而不是错误：它不影响功能，但卡片上过长会被截断、过短又说不清，
       而"内容一多就悄悄跑偏"正是这类软约束最容易发生的事。 */
    if (typeof cmd.summary === 'string') {
      const n = cmd.summary.length;
      if (n < 20 || n > 45) {
        warnings.push(`${where} 的 summary 长度 ${n} 越界（应在 20~45 字）：${cmd.summary}`);
      }
      if (/^该命令用于/.test(cmd.summary)) {
        warnings.push(`${where} 的 summary 以「该命令用于」开头，规范禁止`);
      }
    }

    // examples
    if (Array.isArray(cmd.examples)) {
      cmd.examples.forEach((ex, ei) => {
        if (!ex || typeof ex.cmd !== 'string' || !ex.cmd.trim()) {
          problems.push(`${where} 的 examples[${ei}] 缺少 cmd`);
          return;
        }
        if (PLACEHOLDER_RE.test(stripAnglePlaceholders(ex.cmd))) {
          problems.push(`${where} 的 examples[${ei}] 含裸占位符：${ex.cmd}`);
        }
        if (ex.cmd.includes('\t')) {
          warnings.push(`${where} 的 examples[${ei}] 含制表符，可能显示异常`);
        }
      });
    }

    // params
    if (cmd.params !== undefined) {
      if (!Array.isArray(cmd.params)) problems.push(`${where} 的 params 不是数组`);
      else cmd.params.forEach((p, pi) => {
        if (!p || !p.flag || !p.desc) problems.push(`${where} 的 params[${pi}] 缺 flag 或 desc`);
      });
    }

    // notes / tags / alias / related 类型
    for (const arrField of ['notes', 'tags', 'alias', 'related']) {
      if (cmd[arrField] !== undefined && !Array.isArray(cmd[arrField])) {
        problems.push(`${where} 的 ${arrField} 不是数组`);
      }
    }

    // docs 链接
    if (cmd.docs !== undefined && !/^https?:\/\//.test(cmd.docs)) {
      warnings.push(`${where} 的 docs 不是 http(s) 链接：${cmd.docs}`);
    }

    // 粗体标记必须成对（渲染层支持 **粗体**，落单会显示成星号）
    const textFields = [cmd.summary, cmd.desc].concat(cmd.notes || []);
    textFields.forEach((txt, fi) => {
      if (typeof txt !== 'string') return;
      const n = (txt.match(/\*\*/g) || []).length;
      if (n % 2 !== 0) {
        problems.push(`${where} 有落单的 ** 粗体标记（字段 #${fi}）：${txt.slice(0, 60)}`);
      }
    });
  });
}

/* related 引用完整性（在全部命令都登记完后统一查） */
let relatedTotal = 0, relatedBroken = 0;
for (const catId of Object.keys(DATA)) {
  for (const cmd of DATA[catId]) {
    if (!Array.isArray(cmd.related)) continue;
    for (const rid of cmd.related) {
      relatedTotal++;
      if (!seenIds[rid]) { relatedBroken++; warnings.push(`related 断链：${cmd.id} → ${rid}（不存在）`); }
    }
  }
}

banner('2. 契约校验结果');
console.log(`必填字段错误：${problems.length}`);
console.log(`警告：${warnings.length}（related 断链 ${relatedBroken}/${relatedTotal}）`);

if (problems.length) {
  console.log('\n--- 错误明细 ---');
  problems.slice(0, 60).forEach(p => console.log('  ✗ ' + p));
  if (problems.length > 60) console.log(`  … 还有 ${problems.length - 60} 条`);
}
if (warnings.length) {
  console.log('\n--- 警告明细（前 40 条）---');
  warnings.slice(0, 40).forEach(w => console.log('  ! ' + w));
  if (warnings.length > 40) console.log(`  … 还有 ${warnings.length - 40} 条`);
}

/* ---------- 3. 条数汇总 ---------- */
banner('3. 各分类条数');
/* Phase 1 的 7 个分类 */
const PHASE1_TARGET = {
  'linux-basic': 60, 'linux-text': 40, 'linux-user': 55, 'linux-net': 55,
  'linux-storage': 45, 'docker': 55, 'kubernetes': 80
};
/* Phase 2 的 11 个分类（见 docs/待更新清单.md §C） */
const PHASE2_TARGET = {
  'shell': 35, 'helm': 25, 'middleware': 30, 'db-cache': 55, 'monitor': 40,
  'cloud-cli': 70, 'iac': 45, 'cicd': 40, 'kvm': 25, 'security': 35, 'perf': 25
};
let p1Got = 0, p1Target = 0, p2Got = 0, p2Target = 0;
for (const row of perCat) {
  const t = PHASE1_TARGET[row.catId] || PHASE2_TARGET[row.catId];
  if (PHASE1_TARGET[row.catId]) { p1Target += t; p1Got += row.count; }
  else if (PHASE2_TARGET[row.catId]) { p2Target += t; p2Got += row.count; }
  const status = row.status === 'ready' ? '✓' : '·';
  const target = t ? `（目标 ${t}）` : '';
  const flag = t && row.count < t * 0.9 ? '  ← 未达标' : '';
  console.log(`  ${status} ${row.name.padEnd(22, '　')} ${String(row.count).padStart(4)} 条${target}${flag}`);
}
console.log(`\n  Phase 1 合计：${p1Got} / ${p1Target} 条`);
if (p2Target) console.log(`  Phase 2 合计：${p2Got} / ${p2Target} 条`);
console.log(`  全站命令总数：${totalCmds} 条`);
console.log(`  故障速查：${CHEAT.length} 条`);
console.log(`  学习路线图：${ROADMAP.length} 个阶段`);

/* 路线图引用的分类必须存在 */
banner('4. 路线图 / 速查校验');
let rmBad = 0;
const rmCovered = Object.create(null);
ROADMAP.forEach(s => {
  (s.catIds || []).forEach(cid => {
    if (!CATS[cid]) { rmBad++; problems.push(`路线图 ${s.id} 引用了不存在的分类 ${cid}`); }
    if (rmCovered[cid]) warnings.push(`分类 ${cid} 同时出现在 ${rmCovered[cid]} 与 ${s.id} 里`);
    rmCovered[cid] = s.id;
  });
  if (!s.no || !s.title || !s.goal) problems.push(`路线图 ${s.id} 缺 no/title/goal`);
  if (!s.acceptance || !s.acceptance.artifact || !Array.isArray(s.acceptance.verify) || s.acceptance.verify.length < 2) {
    problems.push(`路线图 ${s.id} 缺项目交付物或人工核验表`);
  }
});

/* 每个分类都必须能被路线图找到，而且阶段号要和注册表里的 stage 对上。
   这条是补出来的：内容从 7 类扩到 18 类时，`shell` 与 `helm` 两个分类
   确实漏在了路线图外面 —— 跟着路线图学的人永远遇不到它们，而校验器
   当时只检查"路线图引用的分类存在"，不检查"分类都被路线图引用了"。 */
const rmStageOf = Object.create(null);
ROADMAP.forEach(s => {
  const n = parseInt(String(s.id).replace(/[^0-9]/g, ''), 10);
  (s.catIds || []).forEach(cid => { rmStageOf[cid] = n; });
});
const orphanCats = Object.keys(CATS).filter(cid => !rmCovered[cid]);
if (orphanCats.length) {
  warnings.push(`这些分类没进任何路线图阶段（学员无从发现）：${orphanCats.join('、')}`);
}
Object.keys(CATS).forEach(cid => {
  const reg = CATS[cid].stage;
  const rm = rmStageOf[cid];
  if (reg && rm && reg !== rm) {
    warnings.push(`分类 ${cid} 的注册表 stage=${reg} 与路线图阶段 ${rm} 不一致`);
  }
});

CHEAT.forEach((c, i) => {
  if (!c.id || !c.title || !Array.isArray(c.chain) || !c.chain.length) {
    problems.push(`故障速查[${i}] 缺 id/title/chain`);
  }
  /* chain 是"能直接复制去执行的一串命令"，写空的或只有一条就失去了速查的意义 */
  if (Array.isArray(c.chain) && c.chain.length < 3) {
    warnings.push(`故障速查 ${c.id} 的 chain 只有 ${c.chain.length} 条命令，太短`);
  }
  if (c.chain && c.chain.some(x => !String(x).trim())) {
    warnings.push(`故障速查 ${c.id} 的 chain 里有空命令`);
  }
});
console.log(`  路线图分类引用错误：${rmBad}`);
console.log(`  路线图未覆盖的分类：${orphanCats.length ? orphanCats.join('、') : '无'}`);
console.log(`  速查条目结构错误：${CHEAT.filter(c => !c.chain || !c.chain.length).length}`);

/* ---------- 5. 结论 ---------- */
banner('5. 结论');
if (problems.length === 0) {
  console.log('  ✅ 校验通过：必填字段齐全、id 全局唯一、示例无裸占位符');
} else {
  console.log(`  ❌ 存在 ${problems.length} 个错误，需要修复`);
}
console.log(`  提示：${warnings.length} 条警告不阻断构建，但建议清理`);

process.exit(problems.length ? 1 : 0);
