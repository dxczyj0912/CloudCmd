// tools/split-lessons.js · 把 data/lessons.js 按分类拆成按主题分组的文件
/* --------------------------------------------------------------------------
   48 节课挤在一个 900 行的文件里，几个人没法同时写。
   拆成 4 个主题文件后，谁写「容器」就只动 lessons-container.js。

   产出：
     data/lessons.js            只保留契约说明 + `window.CC_LESSONS = []`
     data/lessons-linux.js      基础 / 文本 / 存储 / 用户 / 网络
     data/lessons-container.js  Docker / Kubernetes / Helm
     data/lessons-cloud.js      华为云 CLI / CI-CD
     data/lessons-data.js       数据库缓存 / 中间件 / 监控

   用法：
     node tools/split-lessons.js --check   只报告（不写盘）
     node tools/split-lessons.js           执行拆分
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.indexOf('--check') !== -1;

const GROUPS = [
  { file: 'lessons-linux.js', title: 'Linux 地基（基础 / 文本 / 存储 / 用户 / 网络）', caps: ['linux-basic', 'linux-text', 'linux-storage', 'linux-user', 'linux-net'] },
  { file: 'lessons-container.js', title: '容器与云原生（Docker / Kubernetes / Helm）', caps: ['docker', 'kubernetes', 'helm'] },
  { file: 'lessons-cloud.js', title: '云平台与交付（华为云 CLI / CI-CD）', caps: ['cloud-cli', 'cicd'] },
  { file: 'lessons-data.js', title: '数据与可观测（数据库缓存 / 中间件 / 监控）', caps: ['db-cache', 'middleware', 'monitor'] }
];

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* 用大括号深度把一个 JS 源码切成顶层对象块 */
function topLevelObjects(src) {
  const start = src.indexOf('window.CC_LESSONS');
  const arrStart = src.indexOf('[', start);
  const lines = src.split('\n');
  let lineOfArrStart = src.slice(0, arrStart).split('\n').length - 1;
  const blocks = [];
  let depth = 0, objStart = -1;
  for (let i = lineOfArrStart; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === "'" || ch === '"' || ch === '`') {
        const q = ch; j++;
        while (j < line.length && line[j] !== q) { if (line[j] === '\\') j++; j++; }
        continue;
      }
      if (ch === '{') { depth++; if (depth === 1) objStart = i; }
      else if (ch === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) { blocks.push([objStart, i]); objStart = -1; }
        if (depth < 0) { i = lines.length; break; }   /* 数组结束 */
      }
    }
  }
  return blocks.map((b) => ({
    text: lines.slice(b[0], b[1] + 1).join('\n'),
    cat: (lines.slice(b[0], b[1] + 1).join('\n').match(/^\s*cat:\s*'([^']+)'/m) || [])[1],
    id: (lines.slice(b[0], b[1] + 1).join('\n').match(/^\s*id:\s*'([^']+)'/m) || [])[1]
  }));
}

const src = read('data/lessons.js');
const lessons = topLevelObjects(src);
console.log('读到 ' + lessons.length + ' 节课');

if (CHECK) {
  const known = {};
  GROUPS.forEach((g) => g.caps.forEach((c) => { known[c] = g.file; }));
  const missing = lessons.filter((l) => !l.cat || !known[l.cat]);
  console.log(missing.length ? '有 ' + missing.length + ' 节课不属于任何分组：' + missing.map((l) => l.id + '(' + l.cat + ')').join(', ')
                             : '所有课程都能归入分组');
  const files = GROUPS.map((g) => 'data/' + g.file).filter((f) => fs.existsSync(path.join(ROOT, f)));
  console.log('已存在的分组文件：' + (files.join(', ') || '（无）'));
  process.exit(missing.length ? 1 : 0);
}

/* 主文件只留契约与初始化 */
const header = [
  '/* ==========================================================================',
  '   data/lessons.js · 交互式练习课程（**只负责初始化**）',
  '   --------------------------------------------------------------------------',
  '   每课定义（写在各分组文件里）：',
  '     cat                 所属分类（必须与 data/_registry.js 里的分类 id 一致）',
  '     prompt/task         右侧讲义顶部的场景与目标',
  '     steps[]             讲义里的编号步骤：',
  '                           title 这一步在干什么',
  '                           about 一句话说明',
  '                           cmd   要敲的命令（引擎会真的执行）',
  '                           ref   这条命令在命令手册里的条目 id（连贯性的关键：',
  '                                 有了它，课 ↔ 命令 ↔ 卡片才能互相跳转）',
  '                           note  结果里该注意什么',
  '                           hint  **渐进式提示**，两级：',
  '                                 hint[0] 概念提示（点破思路，不给命令）',
  '                                 hint[1] 命令骨架（给出结构，留空关键部分）',
  '                                 第三级直接显示 cmd 本身，不需要数据',
  '     answer / alt        参考答案与等价写法（tools/shell-check.js 会逐个验证能跑通）',
  '     expect              输出里必须出现的关键内容（用于"结果正确"判定）',
  '     teach               讲解，全部步骤完成后展开',
  '',
  '   终端输出全部由 assets/js/shell.js 现场算出（不是预置的假输出）。',
  '   课程按主题拆在 lessons-*.js 里，加载顺序见 index.html 与 tools/_lessonlist.js。',
  '   ========================================================================== */',
  '(function () {',
  "  'use strict';",
  '',
  '  window.CC_LESSONS = window.CC_LESSONS || [];',
  '})();',
  ''
].join('\n');

const used = {};
GROUPS.forEach((g) => {
  const items = lessons.filter((l) => g.caps.indexOf(l.cat) !== -1);
  used[g.file] = items.length;
  const body = [
    '/* data/' + g.file + ' · ' + g.title,
    '   --------------------------------------------------------------------------',
    '   契约说明见 data/lessons.js 顶部。这里只放课程数据。',
    '   -------------------------------------------------------------------------- */',
    '(function () {',
    "  'use strict';",
    '',
    '  window.CC_LESSONS = window.CC_LESSONS || [];',
    '',
    '  window.CC_LESSONS.push(',
    '',
    items.map((l) => l.text.replace(/^/gm, '  ')).join(',\n\n'),
    '',
    '  );',
    '})();',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'data', g.file), body, 'utf8');
  console.log('✓ data/' + g.file + ' （' + items.length + ' 节）');
});

fs.writeFileSync(path.join(ROOT, 'data/lessons.js'), header, 'utf8');
console.log('✓ data/lessons.js 已改为只做初始化');

const listFile = [
  '// tools/_lessonlist.js · 课程文件清单（顺序即课程顺序，浏览器端必须一致）',
  "'use strict';",
  'module.exports = [',
  "  'data/lessons.js',",
  ...GROUPS.map((g) => "  'data/" + g.file + "',"),
  '];',
  ''
].join('\n');
fs.writeFileSync(path.join(ROOT, 'tools', '_lessonlist.js'), listFile, 'utf8');
console.log('✓ tools/_lessonlist.js');
