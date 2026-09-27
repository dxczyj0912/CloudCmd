/* ==========================================================================
   tools/lab-check.js · academy-lab.html（实时练习平台）冒烟测试
   --------------------------------------------------------------------------
   用 CDP 驱动无头 Chrome（零第三方依赖）跑真实 DOM 断言。断言的对象是
   **当前这版设计**：CloudCmd 自有品牌的练习平台，不含平台外壳复刻件。

     1) 顶栏与首屏：返回手册 / 品牌 / 「实时练习」标识；终端打印使用提示
     2) 终端由真 shell 驱动：50+ 命令、管道、环境是 cloudcmd-lab01
     3) 讲义由课程数据渲染：命令块 = 本节步骤数、运行 / 复制联动
     4) 步骤判定与打卡：执行即打勾、全做完自动打卡、讲解展开
     5) 课程与路由：31 节可切、上一节 / 下一节、#/practice/<id> 兼容
     6) 布局：终端占比、讲义独立滚动、无横向溢出
   用法：node tools/lab-check.js
   ========================================================================== */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));

if (!CHROME) { console.error('找不到 Chrome/Edge，无法运行冒烟测试'); process.exit(2); }

const PORT = 9334;
const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file:///' + path.resolve(__dirname, '..', 'academy-lab.html').replace(/\\/g, '/').replace(/ /g, '%20').replace(/[\u4e00-\u9fa5]/g, c => encodeURIComponent(c));
const MAIN_PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/').replace(/ /g, '%20').replace(/[\u4e00-\u9fa5]/g, c => encodeURIComponent(c));

const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(require('os').tmpdir(), 'dsh-lab-check-' + Date.now()),
  '--window-size=1600,900', 'about:blank',
];

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); } catch (e) { /* 还没起来 */ }
  }
  if (!targets) { child.kill(); throw new Error('Chrome 调试端口未就绪'); }

  const ws = targets.find(t => t.type === 'page').webSocketDebuggerUrl;
  if (typeof WebSocket !== 'function') {
    child.kill();
    console.error('Node 缺少内置 WebSocket（需要 Node 22+），无法运行冒烟测试');
    process.exit(2);
  }
  const sock = new WebSocket(ws);

  await new Promise((res, rej) => {
    sock.addEventListener('open', res, { once: true });
    sock.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const pageErrors = [];
  sock.addEventListener('message', ev => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params && msg.params.exceptionDetails;
      pageErrors.push((d && d.exception && d.exception.description) || (d && d.text) || 'unknown');
    }
  });
  function send(method, params) {
    return new Promise(resolve => {
      const mid = ++id;
      pending.set(mid, resolve);
      sock.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
  }
  async function evalJS(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text || 'eval failed');
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
  const type = async (cmd) => {
    await evalJS('(function(){var i=document.getElementById("term-real-input");i.focus();i.value=' + JSON.stringify(cmd) +
      ';i.dispatchEvent(new Event("input"));i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));})()');
    await new Promise(r => setTimeout(r, 140));
  };
  const termText = () => evalJS('document.getElementById("term-out").textContent');
  const settle = (ms) => new Promise(r => setTimeout(r, ms || 220));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });
  await settle(1800);

  console.log('\n[1] 顶栏与首屏');
  ok('顶栏「返回手册」指向 index.html', /index\.html$/.test(await evalJS('document.getElementById("back-home").getAttribute("href")')));
  ok('品牌区是 CloudCmd', /CloudCmd/.test(await evalJS('document.querySelector(".brand-text strong").textContent')));
  ok('标识为「实时练习」', /实时练习/.test(await evalJS('document.querySelector(".academy-kicker strong").textContent')));
  ok('标注模拟环境 · 离线可用', /模拟环境/.test(await evalJS('document.querySelector(".academy-status").textContent')));
  ok('终端标题是 cloudcmd 实验机', /cloudcmd/.test(await evalJS('document.querySelector(".term-bar-text strong").textContent')));
  ok('提示符为 root@cloudcmd-lab01', /root@cloudcmd-lab01:~#/.test(await evalJS('document.querySelector(".term-prompt").textContent')));
  const boot = await termText();
  ok('首屏打印使用提示', /CloudCmd/.test(boot) && /按右侧步骤执行命令/.test(boot));
  ok('首屏不残留参考截图的历史输出', !/Non-authoritative answer/.test(boot));

  console.log('\n[2] 终端由真 shell 驱动');
  await type('ip addr');
  ok('ip addr 输出本机网卡配置', /ens160/.test(await termText()) && /192\.168\.17\.10/.test(await termText()));
  await type('host www.163.com');
  ok('host 输出 canonical name 链', /canonical name = opencdn126music\.jomodns\.com\./.test(await termText()));
  await type('ls -l /var/log/nginx');
  const t2 = await termText();
  ok('ls -l 能真跑（不是硬编码命令表）', /access\.log/.test(t2) && !/未收录/.test(t2));
  await type('docker ps -a');
  ok('docker ps -a 能跑', /old-web/.test(await termText()));
  await type('kubectl get pods -n my-app');
  ok('kubectl get pods 能跑', /CrashLoopBackOff/.test(await termText()));
  await type("awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -3");
  ok('管道组合命令能跑', /203\.0\.113\.25/.test(await termText()));
  await type('netstat -rn');
  ok('netstat -rn 输出路由表', /Kernel IP routing table/.test(await termText()));
  await evalJS('(function(){var i=document.getElementById("term-real-input");i.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}));})()');
  ok('↑ 召回历史命令', (await evalJS('document.getElementById("term-real-input").value')) === 'netstat -rn');
  await evalJS('document.getElementById("term-real-input").dispatchEvent(new KeyboardEvent("keydown",{key:"l",ctrlKey:true,bubbles:true}))');
  ok('Ctrl+L 清屏', (await termText()).length === 0);

  console.log('\n[3] 讲义由课程数据渲染');
  const nBlocks = await evalJS('document.querySelectorAll(".cmdblock").length');
  const nSteps = await evalJS('window.CC_LAB.stepStats(window.CC_LAB.current()).total');
  ok('命令块数量 = 本节步骤数（7）', nBlocks === 7 && nSteps === 7, nBlocks + ' 块 / ' + nSteps + ' 步');
  ok('每个命令块都有运行与复制按钮',
    (await evalJS('document.querySelectorAll(".cb-run[data-run]").length')) === nBlocks &&
    (await evalJS('document.querySelectorAll(".cb-copy[data-copy]").length')) === nBlocks);
  ok('讲义含分节标题与导语', (await evalJS('document.querySelectorAll(".lesson-doc h2").length')) >= 3);
  ok('讲义显示步骤进度', /\d+\/7 个步骤/.test(await evalJS('document.getElementById("lesson-count").textContent')));
  ok('胶囊行显示本节步数与已完成数', /本节 7 步/.test(await evalJS('document.querySelector(".lesson-tab-meta").textContent')));
  await evalJS('document.querySelectorAll(".cmdblock")[1].querySelector(".cb-run").click()');
  await settle(180);
  const t3 = await termText();
  ok('「运行」把命令送进终端', /netstat -rn/.test(t3) && /Kernel IP routing table/.test(t3));
  ok('命令块被高亮', (await evalJS('document.querySelectorAll(".cmdblock")[1].classList.contains("is-hot")')) === true);

  console.log('\n[3b] 渐进式提示与练习模式');
  /* 提示数据在课程里（hint: [概念提示, 命令骨架]），页面上必须有消费者，
     否则"数据齐、校验过"但学员看不到 —— 这正是最容易漏掉的一环。
     先在 Node 端挑一节**真有提示数据**的课再切过去，别拿自带的两节复刻课当样本
     （它们没有 hint，会让断言永远绿着）。 */
  const hintLessonId = await evalJS('(function(){var ls=window.CC_LAB.lessons();for(var i=0;i<ls.length;i++){var st=ls[i].steps||[];for(var j=0;j<st.length;j++){if(st[j].hint&&st[j].hint.length===2)return ls[i].id}}return ""})()');
  ok('课程库里存在带提示的课', !!hintLessonId, hintLessonId || '一节都没有');
  await evalJS('window.CC_LAB.open(' + JSON.stringify(hintLessonId) + ')');
  await settle(200);
  const nHintBlocks = await evalJS('document.querySelectorAll(".cmdblock").length');
  const nHintSteps = await evalJS('window.CC_LAB.stepsOf(window.CC_LAB.current()).filter(function (s) { return s.hint && s.hint.length === 2; }).length');
  const nHintBtns = await evalJS('document.querySelectorAll(".cb-hint-btn").length');
  ok('有提示数据的步骤都渲染出提示按钮', nHintSteps > 0 && nHintBtns === nHintSteps, nHintBtns + ' 个按钮 / ' + nHintSteps + ' 步有提示');
  ok('提示内容是两级 + 一条答案位', (await evalJS('document.querySelectorAll(".cmdblock .cb-hints .cb-hint[data-hint-level]").length')) === nHintSteps * 3, '期望每步 3 个元素');
  ok('提示初始全部隐藏', (await evalJS('(function(){var a=document.querySelectorAll(".cb-hint[data-hint-level]");for(var i=0;i<a.length;i++){if(!a[i].hidden)return false}return true})()')) === true);
  /* 练习模式关闭时不该露出提示/答案按钮（避免讲义变成"满屏按钮"） */
  ok('默认不开练习模式时不显示提示按钮',
    (await evalJS('(function(){var b=document.querySelector(".cb-hint-btn");return !!b && window.getComputedStyle(b).display === "none"})()')) === true);
  await evalJS('document.getElementById("btn-practice").click()');
  await settle(120);
  ok('打开练习模式后命令被遮住',
    (await evalJS('document.body.classList.contains("practice-mode") && document.querySelectorAll(".cmdblock.masked").length > 0')) === true);
  ok('遮罩是视觉模糊而不是删掉 DOM',
    (await evalJS('(function(){var c=document.querySelector(".cmdblock.masked .cmdblock-code code");if(!c)return false;var f=window.getComputedStyle(c).filter||"";return f.indexOf("blur")!==-1})()')) === true);
  ok('练习模式下提示按钮可见', (await evalJS('window.getComputedStyle(document.querySelector(".cb-hint-btn")).display')) !== 'none');
  await evalJS('document.querySelector(".cb-hint-btn").click()');
  await settle(120);
  ok('点一次提示只露出第一级',
    (await evalJS('(function(){var a=document.querySelectorAll(".cmdblock .cb-hint[data-hint-level]");return !a[0].hidden && a[1].hidden})()')) === true);
  await evalJS('document.querySelector(".cb-hint-btn").click()');
  await settle(120);
  ok('点两次提示露出骨架，且骨架含留空标记',
    (await evalJS('(function(){var a=document.querySelectorAll(".cmdblock .cb-hint[data-hint-level]");if(!a[1].hidden)return /____/.test(a[1].textContent);return false})()')) === true);
  await evalJS('document.querySelector(".cb-hint-btn").click()');
  await settle(120);
  ok('点第三次直接给出答案（解除遮罩）',
    (await evalJS('document.querySelectorAll(".cmdblock.revealed").length') > 0 && (await evalJS('document.querySelectorAll(".cmdblock.masked.revealed").length')) === 0));
  await evalJS('document.getElementById("btn-practice").click()');
  await settle(120);
  ok('关掉练习模式后遮罩全部解除',
    (await evalJS('document.body.classList.contains("practice-mode") || document.querySelectorAll(".cmdblock.masked").length === 0')) === true);
  /* 属性选择器里带 # 与 / 容易在注入时被折腾坏，所以分两步：
     先数元素个数，再用 Node 端正则校验 href 的形态。 */
  const nManual = await evalJS('document.querySelectorAll(".cb-manual").length');
  ok('每步有回指命令手册的链接', nManual === nHintBlocks, nManual + ' 个链接 / ' + nHintBlocks + ' 块');
  const sampleRef = await evalJS('(function(){var a=document.querySelector(".cb-manual");return a?a.getAttribute("href"):""})()');
  /* 这里只校验链接的形态：练习平台的页面并不加载 data/<分类>.js，
     window.CC_DATA 在它是空的，没法就地核对 id 是否存在。
     "每个 ref 都能解析到真实条目"由 Node 端的 tools/wire-continuity.js --check 负责
     （它会把 157 个步骤的 ref 逐条对一遍），两边分工，不重复也不遗漏。 */
  ok('手册链接形态正确（index.html#/cmd/<id>）',
    /^index\.html#\/cmd\/[a-z0-9-]+$/.test(sampleRef || ''), sampleRef);

  console.log('\n[4] 步骤判定与打卡');
  ok('初始为未完成状态', (await evalJS('document.querySelector(".tb-check").classList.contains("is-done")')) === false);
  ok('未完成时徽标标注「未完成」', /未完成/.test(await evalJS('document.getElementById("tb-check-label").textContent')));
  await evalJS('window.CC_LAB.open("builtin-6-8")');
  await settle();
  ok('切课后标题更新', /永久配置 IP/.test(await evalJS('document.querySelector(".lh-title").textContent')));
  ok('切课后命令块 = 4 步', (await evalJS('document.querySelectorAll(".cmdblock").length')) === 4);
  ok('切课后仍是未完成', (await evalJS('document.querySelector(".tb-check").classList.contains("is-done")')) === false);

  await type('nmcli con mod ens160 ipv4.addresses 192.168.17.10/24');
  ok('执行第一步后步骤打勾', (await evalJS('window.CC_LAB.stepStats(window.CC_LAB.current()).done')) === 1);
  ok('终端给出步骤完成反馈', /✓ 步骤 1 完成/.test(await termText()));
  ok('未全部完成时仍未打卡', (await evalJS('document.querySelector(".tb-check").classList.contains("is-done")')) === false);

  await type('nmcli con mod ens160 ipv4.gateway 192.168.17.1');
  await type('nmcli con up ens160');
  await type('ip addr');
  ok('四步做完后自动打卡', (await evalJS('document.querySelector(".tb-check").classList.contains("is-done")')) === true);
  ok('打卡后徽标文案变为已完成', /已完成/.test(await evalJS('document.getElementById("tb-check-label").textContent')));
  ok('讲解在完成后展开', (await evalJS('(function(){var e=document.querySelector(".cb-teach");return !!e && !e.hidden})()')) === true);
  ok('打卡进度写入本地存储', (await evalJS('window.CC_LAB.isLessonDone("builtin-6-8")')) === true);
  ok('终端打印打卡绿字', /打卡成功/.test(await termText()));

  await evalJS('window.CC_LAB.open("cc-ls-long")');
  await settle();
  ok('主站课程的目标断言传到练习平台', (await evalJS('!!window.CC_LAB.current().expect')) === true);
  await evalJS('window.CC_LAB.current().expect = /^此结果不可能出现$/');
  await type('ls /var/log/nginx');
  await type('ls -l /var/log/nginx');
  await type('ls -lh /var/log/nginx');
  ok('目标结果不符时三步完成但不能打卡',
    (await evalJS('window.CC_LAB.stepStats(window.CC_LAB.current()).done')) === 3 &&
    (await evalJS('window.CC_LAB.isLessonDone("cc-ls-long")')) === false);
  await evalJS('window.CC_LAB.current().expect = window.CC_LAB.current().cc.expect');
  await type('echo access.log');
  ok('非课程步骤即使输出命中也不记录证据',
    (await evalJS('window.CC_STORE.hasLessonEvidence("cc-ls-long")')) === false);
  await type('ls -lh /var/log/nginx');
  ok('重跑有效步骤命中目标后补证据并打卡',
    (await evalJS('window.CC_STORE.hasLessonEvidence("cc-ls-long")')) === true &&
    (await evalJS('window.CC_LAB.isLessonDone("cc-ls-long")')) === true);
  await evalJS('window.CC_LAB.open("cc-basic-handover-zip")');
  await settle();
  await evalJS('window.__ccOriginalStepExpect = window.CC_LAB.current().steps[0].expect; window.CC_LAB.current().steps[0].expect = /^此步骤不可能通过$/');
  await type('tree /data/app');
  ok('步骤级输出不符时即使命令成功也不打勾',
    (await evalJS('window.CC_LAB.stepStats(window.CC_LAB.current()).done')) === 0);
  await evalJS('window.CC_LAB.current().steps[0].expect = window.__ccOriginalStepExpect; delete window.__ccOriginalStepExpect');
  await type('tree /data/app');
  ok('步骤级输出匹配后才打勾',
    (await evalJS('window.CC_LAB.stepStats(window.CC_LAB.current()).done')) === 1);

  console.log('\n[5] 课程与路由');
  const nCC = await evalJS('(window.CC_LESSONS||[]).length');
  const nAll = await evalJS('window.CC_LAB.lessons().length');
  ok('课程总数 = 自带 2 节 + 主站 ' + nCC + ' 节', nAll === 2 + nCC, '实际 ' + nAll);
  ok('主站课程都带步骤', (await evalJS('window.CC_LAB.lessons().filter(function(l){return l.id.indexOf("cc-")===0 && (l.steps||[]).length>0}).length')) === nCC);
  /* 每节课的场景名都要来自注册表（或人工覆盖表），不能落到「综合练习」这个兜底值：
     兜底值出现就意味着有人加了新分类的课程却忘了登记场景名。 */
  const badScene = await evalJS(
    'window.CC_LAB.lessons().filter(function(l){return !l.scene || l.scene === "综合练习"}).map(function(l){return l.id}).join(",")'
  );
  ok('每节课都有真实场景名', badScene === '', '落到兜底值：' + badScene);

  await evalJS('window.CC_LAB.open("cc-dk-ps-all")');
  await settle(180);
  await type('docker ps -a');
  ok('主站课程也能判定步骤', (await evalJS('window.CC_LAB.stepStats(window.CC_LAB.current()).done')) >= 1);
  ok('深链同步到 #/lab/', /^#\/lab\/cc-dk-ps-all$/.test(await evalJS('location.hash')));

  await evalJS('location.hash="#/practice/awk-topip"');
  await settle(260);
  ok('兼容主站 #/practice/<id> 形式', (await evalJS('window.CC_LAB.current().id')) === 'cc-awk-topip');
  await evalJS('location.hash="#/lab/builtin-6-7"');
  await settle(260);
  ok('#/lab/<id> 也能进', (await evalJS('window.CC_LAB.current().id')) === 'builtin-6-7');

  const foot = await evalJS('document.querySelector(".lesson-foot").innerHTML');
  ok('底部有上一节 / 下一节按钮', /data-open=/.test(foot));
  ok('未收录的邻节做成不可点的灰标记', /is-ghost/.test(foot) && !/<a[^>]*is-ghost/.test(foot));
  await evalJS('document.querySelector(".lesson-foot [data-open]").click()');
  await settle(220);
  ok('点上一节 / 下一节能切课', (await evalJS('window.CC_LAB.current().id')) !== 'builtin-6-7');

  console.log('\n[6] 布局与稳定性');
  ok('讲义可独立滚动', await evalJS('(function(){var b=document.querySelector(".lesson-body");return b.scrollHeight>b.clientHeight})()'));
  ok('终端占主体约 38%（给讲义更多阅读宽度）', await evalJS('(function(){var t=document.querySelector(".term"),l=document.querySelector(".lab");var ratio=t.getBoundingClientRect().width/l.getBoundingClientRect().width;return Math.abs(ratio-0.38)<0.035})()'));
  const resized = await evalJS(`(function(){
    var lab=document.querySelector('.lab'), term=document.querySelector('.term');
    var split=document.getElementById('lab-resizer'), input=document.getElementById('term-input-dock');
    var handle=document.getElementById('term-input-resizer');
    var leftBefore=term.getBoundingClientRect().width, inputBefore=input.getBoundingClientRect().height;
    function pointer(el,type,x,y,id){el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'mouse',button:0,clientX:x,clientY:y}));}
    var s=split.getBoundingClientRect();
    pointer(split,'pointerdown',s.x+5,s.y+30,11);
    pointer(split,'pointermove',s.x+125,s.y+30,11);
    pointer(split,'pointerup',s.x+125,s.y+30,11);
    var leftAfter=term.getBoundingClientRect().width;
    split.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowLeft'}));
    var leftKey=term.getBoundingClientRect().width;
    var h=handle.getBoundingClientRect();
    pointer(handle,'pointerdown',h.x+30,h.y+5,12);
    pointer(handle,'pointermove',h.x+30,h.y-55,12);
    pointer(handle,'pointerup',h.x+30,h.y-55,12);
    var inputAfter=input.getBoundingClientRect().height;
    handle.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowDown'}));
    var inputKey=input.getBoundingClientRect().height;
    return {
      leftBefore:leftBefore,leftAfter:leftAfter,leftKey:leftKey,
      inputBefore:inputBefore,inputAfter:inputAfter,inputKey:inputKey,
      savedLeft:localStorage.getItem('cloudcmd.lab.left'),
      savedInput:localStorage.getItem('cloudcmd.lab.inputHeight'),
      splitNow:split.getAttribute('aria-valuenow'),inputNow:handle.getAttribute('aria-valuenow'),
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1
    };
  })()`);
  ok('拖动中线能改变左右宽度', resized.leftAfter > resized.leftBefore + 70, `${resized.leftBefore} → ${resized.leftAfter}`);
  ok('中线支持键盘方向键', resized.leftKey < resized.leftAfter - 10);
  ok('拖动输入区把手能改变高度', resized.inputAfter > resized.inputBefore + 35, `${resized.inputBefore} → ${resized.inputAfter}`);
  ok('输入区把手支持键盘方向键', resized.inputKey < resized.inputAfter - 5);
  ok('两处尺寸已保存并更新无障碍数值', !!resized.savedLeft && !!resized.savedInput && !!resized.splitNow && !!resized.inputNow);
  ok('拖动后页面仍无横向溢出', !resized.overflow);
  await send('Page.navigate', { url: PAGE });
  await settle(900);
  ok('刷新后保留拖动尺寸', await evalJS(`(function(){
    var lab=document.querySelector('.lab'),term=document.querySelector('.term');
    var input=document.getElementById('term-input-dock');
    return Math.abs(term.getBoundingClientRect().width/lab.getBoundingClientRect().width*100-Number(localStorage.getItem('cloudcmd.lab.left')))<1 &&
      Math.abs(input.getBoundingClientRect().height-Number(localStorage.getItem('cloudcmd.lab.inputHeight')))<2;
  })()`));
  await evalJS('localStorage.removeItem("cloudcmd.lab.left");localStorage.removeItem("cloudcmd.lab.inputHeight")');
  ok('页面无横向溢出', await evalJS('document.documentElement.scrollWidth<=window.innerWidth+1'));
  ok('页面无未捕获 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  /* ======================================================================
     [7] 手机视口（iPhone SE 尺寸 375×667）
     ----------------------------------------------------------------------
     桌面断言全绿不代表手机上能用：手机上必须做到「讲义看得清 + 终端同时在场」
     —— 看一步、点运行、立刻看到输出。这里全部用真实测量，不靠截图。
     ====================================================================== */
  console.log('\n[7] 手机视口 375×667');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 3, mobile: true });
  await send('Page.navigate', { url: PAGE });
  await settle(1800);

  const mob = await evalJS(`(function(){
    var t = document.querySelector('.term').getBoundingClientRect();
    var l = document.querySelector('.lesson').getBoundingClientRect();
    var keys = document.getElementById('term-keys');
    var kr = keys ? keys.getBoundingClientRect() : null;
    var inp = document.getElementById('term-real-input');
    return {
      vh: window.innerHeight, vw: window.innerWidth,
      vvh: window.visualViewport ? Math.round(window.visualViewport.height) : -1,
      bodyBottom: Math.round(document.body.getBoundingClientRect().bottom),
      labBottom: Math.round(document.querySelector('.lab').getBoundingClientRect().bottom),
      labPadBottom: getComputedStyle(document.querySelector('.lab')).paddingBottom,
      footDisplay: getComputedStyle(document.querySelector('.lab-footer')).display,
      termTop: Math.round(t.top), termBottom: Math.round(t.bottom), termH: Math.round(t.height),
      lessonTop: Math.round(l.top), lessonBottom: Math.round(l.bottom), lessonH: Math.round(l.height),
      /* 只断言"讲义面板 ≥200px"是不够的：面板里的头图 + 步骤条 + 工具栏 + 页脚
         会把正文挤没（实测过正文只剩 49px，而面板仍有 332px）。
         真正要保证的是**正文可视高度**。 */
      docViewH: (function(){
        var lb = document.querySelector('.lesson-body');
        var doc = document.querySelector('.lesson-doc');
        if (!lb || !doc) return 0;
        var lbR = lb.getBoundingClientRect(), dR = doc.getBoundingClientRect();
        return Math.round(Math.min(lbR.bottom, dR.bottom) - Math.max(lbR.top, dR.top));
      })(),
      keysVisible: !!(kr && kr.width > 0 && kr.height > 0),
      keysH: kr ? Math.round(kr.height) : 0,
      keyMinH: (function(){
        var els = document.querySelectorAll('#term-keys .tk');
        var m = 999;
        for (var i = 0; i < els.length; i++) {
          var h = els[i].getBoundingClientRect().height;
          if (h > 0 && h < m) m = h;
        }
        return els.length ? Math.round(m) : -1;
      })(),
      inputFont: parseFloat(getComputedStyle(inp).fontSize),
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      termBtnVisible: (function(){ var b = document.getElementById('term-full'); return !!b && b.getBoundingClientRect().width > 0; })(),
      vvh: getComputedStyle(document.documentElement).getPropertyValue('--vvh').trim(),
      runBtnH: (function(){ var b = document.querySelector('.cb-run'); return b ? Math.round(b.getBoundingClientRect().height) : 0; })(),
      copyBtnH: (function(){ var b = document.querySelector('.cb-copy'); return b ? Math.round(b.getBoundingClientRect().height) : 0; })()
    };
  })()`);

  ok('手机视口生效（375 宽）', mob.vw === 375 && mob.vh === 667, `实际 ${mob.vw}×${mob.vh}`);
  ok('讲义在手机上占满剩余空间（≥200px 高）', mob.lessonH >= 200, '讲义只有 ' + mob.lessonH + 'px');
  ok('讲义正文可视高度 ≥150px（头图/步骤条不能把正文挤没）', mob.docViewH >= 150,
    '正文只有 ' + mob.docViewH + 'px（面板 ' + mob.lessonH + 'px）');
  /* 「贴底」的判据是终端下沿与布局可视区下沿齐平。
     不拿 window.innerHeight 比：无头模拟下 visualViewport.height（661）与
     innerHeight（667）会差几个像素，那不是布局问题而是模拟环境的度量差异。 */
  ok('终端贴底常驻（与可视区下沿齐平）', Math.abs(mob.termBottom - mob.bodyBottom) <= 2,
    `终端底 ${mob.termBottom} / 正文底 ${mob.bodyBottom} / lab 底 ${mob.labBottom} / lab padding-bottom ${mob.labPadBottom} / footer ${mob.footDisplay}`);
  ok('讲义与终端之间无大片空白', mob.termTop - mob.lessonBottom <= 12,
    `间隙 ${mob.termTop - mob.lessonBottom}px`);
  ok('讲义在终端上方（先看再练）', mob.lessonTop < mob.termTop, `讲义 ${mob.lessonTop} / 终端 ${mob.termTop}`);
  ok('两者同时在视口内（不用来回切）', mob.lessonTop >= 0 && mob.termTop < mob.vh && mob.lessonH > 0);
  ok('终端高度合理（170~420px）', mob.termH >= 170 && mob.termH <= 420, '终端高 ' + mob.termH + 'px');
  ok('手机端无横向溢出', mob.hOverflow === false);
  ok('快捷键条可见', mob.keysVisible && mob.keysH > 0);
  ok('快捷键按钮触摸目标 ≥36px', mob.keyMinH >= 36, '最矮 ' + mob.keyMinH + 'px');
  ok('输入框字号 ≥16px（防 iOS 聚焦自动放大）', mob.inputFont >= 16, mob.inputFont + 'px');
  ok('步骤「运行」按钮 ≥40px 高', mob.runBtnH >= 40, mob.runBtnH + 'px');
  ok('步骤「复制」按钮 ≥40px 高', mob.copyBtnH >= 40, mob.copyBtnH + 'px');
  ok('全屏终端开关在手机上出现', mob.termBtnVisible === true);
  ok('--vvh 已由 visualViewport 写入', /^\d+px$/.test(mob.vvh), '实际 "' + mob.vvh + '"');
  /* 无头输入框在手机上不能放到屏幕外：聚焦屏幕外元素会让浏览器先滚动过去，
     软键盘再弹出来，画面会跳一下。断言它落在可视区内。 */
  ok('隐藏输入框位于可视区内（聚焦时画面不跳）', await evalJS(`(function(){
    var r = document.getElementById('term-real-input').getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth + 1 && r.top >= 0 && r.bottom <= window.innerHeight + 1;
  })()`));

  /* 快捷键条真的能用：点 `|` 应插进输入框，点 ↑ 应取回上一条命令 */
  await evalJS('(function(){var i=document.getElementById("term-real-input");i.value="df ";i.dispatchEvent(new Event("input"));})()');
  await evalJS('window.CC_LAB.key("|")');
  ok('点快捷键「|」插入字符到输入框', (await evalJS('window.CC_LAB.inputValue()')) === 'df |',
    '实际 "' + (await evalJS('window.CC_LAB.inputValue()')) + '"');
  await evalJS('window.CC_LAB.key("clear")');
  ok('点「清屏」清空终端输出', (await evalJS('document.getElementById("term-out").textContent.length')) === 0);

  await type('df -h');
  await evalJS('window.CC_LAB.key("up")');
  ok('点「↑」取回上一条命令', (await evalJS('window.CC_LAB.inputValue()')) === 'df -h',
    '实际 "' + (await evalJS('window.CC_LAB.inputValue()')) + '"');
  await evalJS('(function(){var i=document.getElementById("term-real-input");i.value="";i.dispatchEvent(new Event("input"));})()');

  /* 全屏终端：讲义让位、终端吃满 */
  ok('切到全屏终端', (await evalJS('window.CC_LAB.fullTerm(true)')) === true);
  await settle(320);
  ok('全屏时讲义隐藏、终端吃满视口', await evalJS(`(function(){
    var l = document.querySelector('.lesson').getBoundingClientRect();
    var t = document.querySelector('.term');
    var lh = getComputedStyle(document.querySelector('.lesson')).display;
    return lh === 'none' && t.getBoundingClientRect().height > window.innerHeight * 0.6;
  })()`));
  ok('切回「讲义 + 终端」分栏', (await evalJS('window.CC_LAB.fullTerm(false)')) === true);
  await settle(320);
  ok('恢复后讲义重新出现', await evalJS('document.querySelector(".lesson").getBoundingClientRect().height >= 200'));

  /* 软键盘的可测代理：键盘弹出 = visualViewport 变矮。
     把 --vvh 按键盘高度压下去，body 必须跟着矮，且终端仍完整落在可视区内。 */
  const kb = await evalJS(`(function(){
    var root = document.documentElement;
    root.style.setProperty('--vvh', '367px');
    document.body.classList.add('kb-open');
    var b = document.body.getBoundingClientRect();
    var t = document.querySelector('.term').getBoundingClientRect();
    return { bodyH: Math.round(b.height), termBottom: Math.round(t.bottom), termTop: Math.round(t.top) };
  })()`);
  ok('软键盘弹出时 body 高度跟着可视高度收缩', kb.bodyH <= 380, 'body 高 ' + kb.bodyH + 'px');
  ok('软键盘弹出时终端仍在可视区内（输入行不会被盖住）', kb.termBottom <= 380 && kb.termTop >= 0,
    `终端 ${kb.termTop}~${kb.termBottom}`);
  await evalJS('document.documentElement.style.removeProperty("--vvh");document.body.classList.remove("kb-open")');
  await evalJS('window.CC_LAB.fullTerm(false)');
  await settle(300);

  /* ---- 手机上的完整学习闭环：看一步 → 点运行 → 立刻看到输出 + 打勾 ----
     用一节前面所有段落都没碰过的课，否则进度已经满了，点了也不会变。 */
  await evalJS('window.CC_LAB.open("cc-ls-time")');
  await settle(450);
  const beforeDone = await evalJS('window.CC_LAB.stepStats(window.CC_LAB.current()).done');
  await evalJS('document.querySelector(".cb-run") && document.querySelector(".cb-run").click()');
  await settle(600);
  const loop = await evalJS(`(function(){
    var st = window.CC_LAB.stepStats(window.CC_LAB.current());
    var t = document.querySelector('.term').getBoundingClientRect();
    var out = document.getElementById('term-out').textContent || '';
    return {
      done: st.done, total: st.total,
      termVisible: t.top < window.innerHeight && t.bottom > 0,
      /* 输出必须落在终端可视区内，而不是被顶到屏幕外 —— 这正是"贴底终端"存在的理由 */
      bodyGap: Math.round(document.getElementById('term-body').scrollHeight -
        document.getElementById('term-body').scrollTop - document.getElementById('term-body').clientHeight),
      hasOutput: out.length > 0
    };
  })()`);
  ok('手机上点「运行」能真的打勾', loop.done > beforeDone, `${beforeDone} → ${loop.done}/${loop.total}`);
  ok('手机运行后有真实输出', loop.hasOutput === true);
  ok('运行后终端在可视区内（输出就在眼前）', loop.termVisible === true);
  ok('终端自动滚到底（不用手动翻）', loop.bodyGap <= 8, '距底部 ' + loop.bodyGap + 'px');

  /* ======================================================================
     [8] 手机版主站（同一个 375 视口下再验一次浏览体验）
     ====================================================================== */
  console.log('\n[8] 手机版主站 375×667');
  await send('Page.navigate', { url: MAIN_PAGE });
  await settle(1600);
  const mweb = await evalJS(`(function(){
    var nav = document.getElementById('nav');
    var docEl = document.documentElement;
    var nr = nav ? nav.getBoundingClientRect() : null;
    var small = 0, total = 0;
    document.querySelectorAll('a,button,.btn,[role=button]').forEach(function(el){
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && el.offsetParent !== null) {
        total++;
        if (r.height < 36 || r.width < 36) small++;
      }
    });
    var inputs = [];
    document.querySelectorAll('input').forEach(function(i){ inputs.push(parseFloat(getComputedStyle(i).fontSize)); });
    return {
      vw: window.innerWidth,
      clientW: docEl.clientWidth,
      scrollW: docEl.scrollWidth,
      /* ⚠️ 判"横向溢出"必须用 scrollWidth 比 **clientWidth**（布局视口）。
         比 innerWidth 是错的：页面一旦真被撑宽，浏览器会把视觉视口一起撑大
         （375 的屏上 innerWidth 也变成 434），两边同时变大 → 永远测不出溢出。
         顶栏溢出 59px 就是这么藏了很久的。 */
      hOverflow: docEl.scrollWidth > docEl.clientWidth + 1,
      shrunkToFit: Math.abs(window.innerWidth - docEl.clientWidth) > 1,
      navOffscreen: !!nr && nr.left < -1,
      hasBurger: !!document.querySelector('.only-mobile, #nav-toggle, [data-nav-toggle]'),
      small: small, total: total,
      minInputFont: inputs.length ? Math.min.apply(null, inputs) : 99
    };
  })()`);
  ok('主站手机端无横向溢出', mweb.hOverflow === false,
    `scrollWidth ${mweb.scrollW} > clientWidth ${mweb.clientW}`);
  ok('主站没有被"缩小适应"（说明没有元素把页面撑宽）', mweb.shrunkToFit === false,
    `innerWidth ${mweb.vw} vs clientWidth ${mweb.clientW}`);
  ok('侧栏默认收起为抽屉', mweb.navOffscreen === true);
  ok('有抽屉开关（汉堡键）', mweb.hasBurger === true);
  ok('主站输入框字号 ≥16px（防 iOS 聚焦放大）', mweb.minInputFont >= 16, mweb.minInputFont + 'px');
  ok('主站触摸目标基本达标（<36px 的占比 <15%）', mweb.small / Math.max(1, mweb.total) < 0.15,
    mweb.small + '/' + mweb.total + ' 个偏小');

  /* 手机上「可练」的入口链路：分类页 → 分类练习列表（#/practice/c/<id>）→ 练习平台深链 */
  await evalJS('location.hash="#/c/cloud-cli"');
  await settle(700);
  const entry = await evalJS(`(function(){
    var a = document.querySelector('a[href*="#/practice/c/"]');
    if (!a) return { ok: false, hrefs: [].map.call(document.querySelectorAll('a[href*="practice"]'), function(x){return x.getAttribute('href');}) };
    var r = a.getBoundingClientRect();
    return { ok: true, href: a.getAttribute('href'), h: Math.round(r.height) };
  })()`);
  ok('分类页有「实时练习」入口（手机上可点）', entry.ok === true,
    '页面上 practice 链接：' + JSON.stringify(entry.hrefs || []));
  ok('入口按钮触摸目标 ≥36px', (entry.h || 0) >= 36, (entry.h || 0) + 'px');

  await evalJS('location.hash="#/practice/c/cloud-cli"');
  await settle(700);
  const cards = await evalJS(`(function(){
    var list = document.querySelectorAll('a[href*="academy-lab.html#/"]');
    if (!list.length) return { n: 0 };
    var minH = 1e9, sample = '';
    for (var i = 0; i < list.length; i++) {
      var h = list[i].getBoundingClientRect().height;
      if (h > 0 && h < minH) minH = h;
    }
    sample = list[0].getAttribute('href');
    return { n: list.length, minH: Math.round(minH), sample: sample };
  })()`);
  ok('分类练习列表在手机上列出场景', cards.n > 0, '共 ' + cards.n + ' 张卡');
  ok('练习卡指向练习平台深链', /academy-lab\.html#\/lab\/cc-/.test(cards.sample || ''), cards.sample || '');
  ok('练习卡触摸目标 ≥36px', cards.minH >= 36, '最矮 ' + cards.minH + 'px');

  await evalJS('document.getElementById("btn-shell").click()');
  await settle(500);
  const sh = await evalJS(`(function(){
    var p = document.getElementById('shell-panel');
    if (!p) return { open: false };
    var r = p.getBoundingClientRect();
    var i = document.querySelector('#shell-panel .term-input');
    return {
      open: true,
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
      inView: r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1,
      inputFont: i ? parseFloat(getComputedStyle(i).fontSize) : 0,
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  })()`);
  ok('手机端能打开临时 Shell 面板', sh.open === true);
  ok('临时 Shell 面板完整落在视口内', sh.inView === true,
    `left ${sh.left} right ${sh.right} top ${sh.top} bottom ${sh.bottom}`);
  ok('临时 Shell 输入框 ≥16px（防 iOS 聚焦放大）', sh.inputFont >= 16, sh.inputFont + 'px');
  ok('打开面板后仍无横向溢出', sh.hOverflow === false);
  const shellHeight = await evalJS(`(function(){
    var row = document.getElementById('shell-input-row');
    var handle = document.querySelector('#shell-panel .term-input-resizer');
    if (!row || !handle) return { before: 0, after: 0, saved: 0 };
    var before = row.getBoundingClientRect().height;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    return { before: before, after: row.getBoundingClientRect().height,
      saved: Number(localStorage.getItem('cloudcmd.shellInputHeight')) };
  })()`);
  ok('手机端临时 Shell 输入区可调高', shellHeight.after > shellHeight.before + 10,
    `${shellHeight.before} → ${shellHeight.after}`);
  await send('Page.navigate', { url: MAIN_PAGE });
  await settle(1000);
  ok('临时 Shell 输入区刷新后保留高度', await evalJS(`(function(){
    var row = document.getElementById('shell-input-row');
    return !!row && Math.abs(row.getBoundingClientRect().height -
      Number(localStorage.getItem('cloudcmd.shellInputHeight'))) < 2;
  })()`));
  await evalJS('document.getElementById("btn-shell").click()');
  await evalJS('localStorage.removeItem("cloudcmd.shellInputHeight")');

  /* ======================================================================
     [9] 手机横屏 667×375
     ----------------------------------------------------------------------
     横屏时宽度 667 仍然命中 ≤760px 的手机布局，但**高度只有 375px**。
     按竖屏的比例分（终端 34dvh + 头图 + 步骤条）会把讲义正文再挤没一次 ——
     这正是竖屏那版踩过的坑，换个方向就会重演。所以单独验一遍。
     ====================================================================== */
  console.log('\n[9] 手机横屏 667×375');
  await send('Emulation.setDeviceMetricsOverride', { width: 667, height: 375, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: PAGE });
  await settle(1800);
  const land = await evalJS(`(function(){
    function h(sel){ var e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height) : -1; }
    function r(sel){ var e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; }
    var lb = document.querySelector('.lesson-body'), doc = document.querySelector('.lesson-doc');
    var docView = (lb && doc) ? Math.round(Math.min(lb.getBoundingClientRect().bottom, doc.getBoundingClientRect().bottom) -
      Math.max(lb.getBoundingClientRect().top, doc.getBoundingClientRect().top)) : 0;
    var t = r('.term'), l = r('.lesson');
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      termH: Math.round(t.height), termRight: Math.round(t.right), termBottom: Math.round(t.bottom),
      lessonLeft: Math.round(l.left), lessonH: Math.round(l.height),
      sideBySide: t.right <= l.left + 1,
      docViewH: docView,
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      keysVisible: (function(){ var k = document.getElementById('term-keys'); return !!k && k.getBoundingClientRect().height > 0; })(),
      headHidden: getComputedStyle(document.querySelector('.lesson-head')).display === 'none'
    };
  })()`);
  ok('横屏视口生效（667×375）', land.vw === 667 && land.vh === 375, `实际 ${land.vw}×${land.vh}`);
  ok('横屏无横向溢出', land.hOverflow === false);
  /* 横屏宽够高不够：堆叠会让两边都不够用（实测正文 -77px），所以必须并排 */
  ok('横屏改为并排两栏（不是堆叠）', land.sideBySide === true,
    `终端右边 ${land.termRight} / 讲义左边 ${land.lessonLeft}`);
  ok('横屏头图让位（高度太紧）', land.headHidden === true);
  ok('横屏讲义正文可视高度 ≥90px', land.docViewH >= 90, '正文 ' + land.docViewH + 'px（面板 ' + land.lessonH + 'px）');
  ok('横屏终端仍可见（≥130px）', land.termH >= 130, '终端 ' + land.termH + 'px');
  ok('横屏两栏都占满可用高度', land.termH >= land.vh - 120 && land.lessonH >= land.vh - 120,
    `终端 ${land.termH} / 讲义 ${land.lessonH} / 视口 ${land.vh}`);
  ok('横屏快捷键条仍在', land.keysVisible === true);

  sock.close();
  child.kill();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
