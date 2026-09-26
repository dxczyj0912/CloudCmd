#!/usr/bin/env node
/* 生成完整学习链路盘点：所有命令的教/练/实战引用，以及需要人工补强的入口。 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs');

global.window = { CC_CATS: {}, CC_DATA: {}, CC_CARDS: [], CC_LESSONS: [], CC_CHEAT: [] };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.document = {
  documentElement: { setAttribute() {}, getAttribute() { return 'light'; } },
  addEventListener() {}, getElementById: () => null, querySelectorAll: () => []
};
function load(file) { require(path.join(ROOT, file)); }
load('data/_registry.js');
const cats = Object.keys(window.CC_CATS);
cats.forEach(id => load('data/' + id + '.js'));
fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^cards.*\.js$/.test(f)).sort().forEach(f => load('data/' + f));
require('./_lessonlist').forEach(load);
['data/roadmap.js', 'data/cheat.js', 'data/termfs.js', 'assets/js/shell.js'].forEach(load);
require('./_cmdlist').forEach(load);

const lessons = window.CC_LESSONS || [];
const cards = window.CC_CARDS || [];
const cheats = window.CC_CHEAT || [];
const roadmap = window.CC_ROADMAP || [];
const implemented = new Set(window.CC_SHELL.commands);
const stageOf = new Map();
roadmap.forEach(s => (s.catIds || []).forEach(cat => stageOf.set(cat, s)));
const rows = [];
const byId = new Map();
cats.forEach(cat => (window.CC_DATA[cat] || []).forEach(rec => {
  const row = {
    id: rec.id, name: rec.name, cat, catName: window.CC_CATS[cat].name || cat,
    stage: (stageOf.get(cat) || {}).no || '', level: rec.level || '',
    kind: rec.kind || 'command', runnableHead: implemented.has(String(rec.name).trim().split(/\s+/)[0]),
    lessons: [], cards: [], cheats: []
  };
  if (byId.has(row.id)) throw new Error('重复命令 ID: ' + row.id);
  byId.set(row.id, row); rows.push(row);
}));

const lessonRows = lessons.map(l => ({
  id: l.id, cat: l.cat, title: l.title || l.prompt || l.task || l.id,
  steps: (l.steps || []).length,
  weakSteps: (l.steps || []).filter(s => s.expect == null && s.state == null).length,
  refs: [...new Set((l.steps || []).map(s => s.ref).filter(Boolean))],
  cards: []
}));
const lessonById = new Map(lessonRows.map(l => [l.id, l]));
lessonRows.forEach(l => l.refs.forEach(id => {
  if (!byId.has(id)) throw new Error('课程 ' + l.id + ' 引用不存在: ' + id);
  byId.get(id).lessons.push(l.id);
}));
cards.forEach(card => (card.cmdIds || []).forEach(id => {
  if (!byId.has(id)) throw new Error('卡片 ' + card.id + ' 引用不存在: ' + id);
  byId.get(id).cards.push(card.id);
}));
cheats.forEach(cheat => (cheat.cmdIds || []).forEach(id => {
  if (!byId.has(id)) throw new Error('故障剧本 ' + cheat.id + ' 引用不存在: ' + id);
  byId.get(id).cheats.push(cheat.id);
}));

rows.forEach(r => {
  r.status = r.lessons.length ? (r.cards.length ? '已教已练' : '有课无卡') :
    (r.cards.length ? '有卡无课' : '无课无卡');
  r.action = r.status === '无课无卡' ? '按命令补强取舍逐条复核，不因首词可执行而直接补课' :
    r.status === '有课无卡' ? '评估补迁移/辨析卡' :
    r.status === '有卡无课' ?
      (r.runnableHead ? '评估补课程步骤' : '评估补真实环境操作讲解') : '已贯通';
});
lessonRows.forEach(l => {
  l.cards = [...new Set(l.refs.flatMap(id => byId.get(id).cards)
    .concat(cards.filter(c => c.lesson === l.id).map(c => c.id)))];
});

const statusOrder = ['无课无卡', '有卡无课', '有课无卡', '已教已练'];
const groups = Object.fromEntries(statusOrder.map(s => [s, rows.filter(r => r.status === s)]));
const unanchoredCards = cards.filter(c => !(c.cmdIds || []).some(id => byId.get(id) && byId.get(id).lessons.length));
const noRunRunnable = cards.filter(c => !c.run && (c.cmdIds || []).some(id => byId.get(id) && byId.get(id).runnableHead));
const noRunReference = cards.filter(c => !c.run && !noRunRunnable.includes(c));
const lessonsNoReview = lessonRows.filter(l => !l.cards.length);
const lessonsWeak = lessonRows.filter(l => l.weakSteps);
const weakStepCount = lessonRows.reduce((sum, l) => sum + l.weakSteps, 0);
const stepCount = lessonRows.reduce((sum, l) => sum + l.steps, 0);
const outcomeCount = lessons.filter(l => !!l.expect).length;
const earlyCandidates = groups['无课无卡'].filter(r => Number(r.stage) <= 4 && Number(r.level) <= 2 && r.runnableHead);
const cheatsNoTaught = cheats.filter(c => !(c.cmdIds || []).some(id => byId.get(id) && byId.get(id).lessons.length));

const clean = v => String(v == null ? '' : v).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const yes = v => v ? '是' : '否';
const lines = [];
const add = s => lines.push(s);
add('# 学习链路全量清单');
add('');
add('> 由 `node tools/learning-chain-inventory.js` 从当前数据生成。这里的“有课”以课程步骤 `ref` 为准，“有卡”以卡片 `cmdIds` 为准；“首词可执行”只说明模拟引擎识别命令名，**不保证该条记录的所有示例都能仿真**。');
add('');
add('## 总览');
add('');
add('| 指标 | 数量 | 处理含义 |');
add('| --- | ---: | --- |');
add(`| 命令条目 | ${rows.length} | 全部逐条列在 [CSV 明细](学习链路命令明细.csv) |`);
statusOrder.forEach(s => add(`| ${s} | ${groups[s].length} | ${s === '无课无卡' ? '优先审核是否应进入学习路径' : s === '有卡无课' ? '可补操作课或真机讲解' : s === '有课无卡' ? '可补迁移与辨析复习' : '已有完整教练链接'} |`));
add(`| 无关联已教授命令的卡片 | ${unanchoredCards.length} | 核对是否需前置课程；并非引用错误 |`);
add(`| 有可执行首词、但无 run 的卡片 | ${noRunRunnable.length} | 逐张评估是否能安全送终端；不是自动判定缺陷 |`);
add(`| 无 run 且没有可执行首词的卡片 | ${noRunReference.length} | 以概念或真机操作为主 |`);
add(`| 没有任何复习卡对应的课程 | ${lessonsNoReview.length} | 可补课程后的回忆练习 |`);
add(`| 有步骤缺少输出/状态断言的课程 | ${lessonsWeak.length} | 审核是否需要结果验收 |`);
add(`| 未声明步骤级输出/状态断言 | ${weakStepCount} / ${stepCount} 步 | 命令和退出码仍会校验 |`);
add(`| 故障剧本中无任何已教命令的剧本 | ${cheatsNoTaught.length} / ${cheats.length} | 按剧本 cmdIds 统计，不代表有完整场景课 |`);
add('');
add('这是一份**候选清单**：命令手册里有只适合速查的低频或危险操作，不应为追求 100% 覆盖率机械补课。课程、复习卡和故障剧本的教学价值需要按场景审核。');
add('');
add('## 后续按需复核');
add('');
add('| 顺序 | 工作 | 范围 | 完成判据 |');
add('| ---: | --- | --- | --- |');
add(`| 1 | 复核剩余步骤 | ${weakStepCount} 步沿用命令、退出码与整课目标；逐步取舍见 [步骤 CSV](步骤断言取舍.csv) | 出现新的真实状态能力或故障样本时，再补能区分结果的断言 |`);
add(`| 2 | 按实际需求复核低阶段入口 | 阶段 1–4、L1/L2、首词可执行且无课无卡的 ${earlyCandidates.length} 条；逐条决定见 [命令 CSV](命令补强取舍.csv) | 只有形成独立场景与验收证据时才进入课程，不为覆盖率单开课 |`);
add(`| 3 | 把已有课程接到复习 | ${lessonsNoReview.length} 节完全没有关联复习卡；另有 ${groups['有课无卡'].length} 条命令有课无卡 | 完课后一周内能从症状/目标回忆命令，而不只是照抄步骤 |`);
add(`| 4 | 给复习卡补前置讲解 | ${unanchoredCards.length} 张卡不关联任何已教授的命令；${groups['有卡无课'].length} 条命令有卡无课 | 复杂卡能跳到课程或真机操作讲解；概念辨析卡可保留无课状态 |`);
add(`| 5 | 维护阶段项目验收 | ${roadmap.filter(s => s.acceptance && s.acceptance.artifact && (s.acceptance.verify || []).length >= 2).length} / ${roadmap.length} 个阶段已明确交付物和人工核验表 | 真机项目保留交付证据，人工核验后再标记通过 |`);
add(`| 6 | 核对送终端按钮 | ${noRunRunnable.length} 张无 run 的卡关联了可执行首词 | 只给可安全复现的卡补 run；云账号、危险操作和交互程序保留真机说明 |`);
add('');
add(`**判题现状**：${outcomeCount} / ${lessons.length} 节课有整课 \`expect\`，${stepCount - weakStepCount} / ${stepCount} 个步骤配置了 \`step.expect\` 或 \`step.state\`。主站和练习平台均要求全部步骤完成，并且在合法课程步骤的标准输出中至少一次观察到整课目标结果，才可打卡。步骤级断言仍需按风险逐步补强；读操作和前置探索不必机械添加。`);
add('');
add('## 分类与阶段');
add('');
add('| 阶段 | 分类 | 条目 | 无课无卡 | 有卡无课 | 有课无卡 | 已教已练 |');
add('| ---: | --- | ---: | ---: | ---: | ---: | ---: |');
cats.forEach(cat => {
  const a = rows.filter(r => r.cat === cat);
  add(`| ${a[0].stage} | ${clean(a[0].catName)} (${cat}) | ${a.length} | ${a.filter(r => r.status === '无课无卡').length} | ${a.filter(r => r.status === '有卡无课').length} | ${a.filter(r => r.status === '有课无卡').length} | ${a.filter(r => r.status === '已教已练').length} |`);
});
add('');
add('## 路线图阶段验收');
add('');
add('9 个阶段都有交付物和人工核验表；真机项目由学员提交证据并人工核验，模拟课程的自动打卡不代表真机项目已经通过。');
add('');
add('| 阶段 | 主题 | 分类 | 课程 | 命令无课无卡 | 交付物 |');
add('| ---: | --- | --- | ---: | ---: | --- |');
roadmap.forEach(st => {
  const a = rows.filter(r => (st.catIds || []).includes(r.cat));
  const n = lessons.filter(l => (st.catIds || []).includes(l.cat)).length;
  add(`| ${st.no} | ${clean(st.title)} | ${(st.catIds || []).join('、')} | ${n} | ${a.filter(r => r.status === '无课无卡').length} | ${clean(st.acceptance && st.acceptance.artifact)} |`);
});

function commandSection(title, arr) {
  add(''); add('## ' + title + '（' + arr.length + '）'); add('');
  add('| 分类 | ID | 条目 | 级别 | 类型 | 首词可执行 | 建议动作 |');
  add('| --- | --- | --- | ---: | --- | --- | --- |');
  arr.forEach(r => add(`| ${r.cat} | ${r.id} | ${clean(r.name)} | L${r.level} | ${r.kind} | ${yes(r.runnableHead)} | ${r.action} |`));
}
commandSection('完全未进入课程或复习卡', groups['无课无卡']);
commandSection('已有复习卡，但没有课程步骤', groups['有卡无课']);
commandSection('已有课程步骤，但没有复习卡', groups['有课无卡']);

add(''); add('## 复习卡与课程的局部断点'); add('');
add('### 无关联已教授命令的卡片（' + unanchoredCards.length + '）'); add('');
add('| 卡片 | 分类 | 关联命令 | 已指定课程 |'); add('| --- | --- | --- | --- |');
unanchoredCards.forEach(c => add(`| ${c.id} | ${c.cat} | ${(c.cmdIds || []).join('、')} | ${c.lesson || '—'} |`));
add(''); add('### 有可执行首词但未设置 run 的卡片（' + noRunRunnable.length + '）'); add('');
add('| 卡片 | 分类 | 关联命令 |'); add('| --- | --- | --- |');
noRunRunnable.forEach(c => add(`| ${c.id} | ${c.cat} | ${(c.cmdIds || []).join('、')} |`));
add(''); add('### 没有对应复习卡的课程（' + lessonsNoReview.length + '）'); add('');
add('| 课程 | 分类 | 步骤 | 关联命令 |'); add('| --- | --- | ---: | --- |');
lessonsNoReview.forEach(l => add(`| ${l.id} | ${l.cat} | ${l.steps} | ${l.refs.join('、')} |`));
add(''); add('### 有步骤缺少输出/状态断言的课程（' + lessonsWeak.length + '）'); add('');
add('命令匹配与退出码仍会检查；只列出需要人工判断“是否应该验证结果”的课程。'); add('');
add('| 课程 | 分类 | 无输出/状态断言步骤 / 总步骤 |'); add('| --- | --- | ---: |');
lessonsWeak.forEach(l => add(`| ${l.id} | ${l.cat} | ${l.weakSteps} / ${l.steps} |`));
add('');

function csvCell(value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; }
const headers = ['阶段', '分类ID', '分类', '命令ID', '条目', '级别', '类型', '首词可执行', '状态', '课程ID', '卡片ID', '故障剧本ID', '建议动作'];
const csv = [headers.map(csvCell).join(',')];
rows.forEach(r => csv.push([r.stage, r.cat, r.catName, r.id, r.name, r.level, r.kind,
  yes(r.runnableHead), r.status, r.lessons.join(';'), r.cards.join(';'), r.cheats.join(';'), r.action]
  .map(csvCell).join(',')));
fs.writeFileSync(path.join(OUT, '学习链路全量清单.md'), lines.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUT, '学习链路命令明细.csv'), '\uFEFF' + csv.join('\r\n') + '\r\n', 'utf8');
console.log('学习链路：' + rows.length + ' 条命令；无课无卡 ' + groups['无课无卡'].length +
  '、有卡无课 ' + groups['有卡无课'].length + '、有课无卡 ' + groups['有课无卡'].length +
  '、已教已练 ' + groups['已教已练'].length);
console.log('已生成 docs/学习链路全量清单.md 与 docs/学习链路命令明细.csv');
