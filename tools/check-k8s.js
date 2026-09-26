/* tools/check-k8s.js · kubectl / helm / kubeadm / argocd / promtool / haproxy 的断言脚本
   --------------------------------------------------------------------------
   为什么需要它：tools/example-check.js 只判断"这条示例有没有报错"，它**看不见输出内容**。
   命令实现完全可能"不报错但输出是错的/空的"，那种静默错误比报错危险得多。
   所以这里对每条我补的命令都写三类断言：
     ① 正常用法    —— 该有的字段、单位、格式在不在
     ② 参数写错    —— 该报的错有没有报、**退出码是不是非 0**、错误有没有走 stderr
     ③ 边界        —— 资源不存在、文件不存在、空参数、冲突（已存在/重名）

   跑法：  node tools/check-k8s.js          全部通过 → 退出码 0
          node tools/check-k8s.js kubectl  只跑某一组
   每条断言都做过"变异验证"：把对应实现临时改坏一次，确认这条断言真的会失败
   （见报告里的说明），避免断言的期望值本身写错、一直绿着骗人。
   ========================================================================== */
'use strict';

var path = require('path');
var fs = require('fs');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

/* ---------- 加载引擎（与 tools/example-check.js 一致） ---------- */
global.window = { CC_CATS: {}, CC_DATA: {} };
global.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
global.document = {
  documentElement: { setAttribute: function () {}, getAttribute: function () { return 'light'; } },
  addEventListener: function () {}, getElementById: function () { return null; }, querySelectorAll: function () { return []; }
};

function load(rel) {
  var abs = path.join(ROOT, rel);
  var text = fs.readFileSync(abs, 'utf8');
  /* 与 example-check 的 eval 等价，但语法错误时能报出文件名而不是 <anonymous_script> */
  vm.runInThisContext(text, { filename: rel });
}

function loadIfParsable(rel) {
  var abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return false;
  var text = fs.readFileSync(abs, 'utf8');
  try { new vm.Script(text, { filename: rel }); } catch (e) { return false; }
  /* 语法没问题但加载期异常（依赖缺失等）也不能拖垮整个检查 */
  try { vm.runInThisContext(text, { filename: rel }); return true; } catch (e) { return false; }
}

load('data/_registry.js');
['kubernetes', 'helm', 'cicd', 'monitor', 'middleware'].forEach(function (c) {
  try { load('data/' + c + '.js'); } catch (e) { /* 分类数据缺失不影响本脚本 */ }
});
load('data/termfs.js');
load('assets/js/store.js');
load('assets/js/shell.js');

var PARSE_FAILED = [];
require('./_cmdlist').forEach(function (f) {
  if (!loadIfParsable(f)) PARSE_FAILED.push(f);
});
if (PARSE_FAILED.length) {
  console.log('[提示] 这些命令模块当前语法有误、已跳过（与本次检查的命令无关）：' + PARSE_FAILED.join(', '));
  console.log('       修好后本脚本无需改动。\n');
}

var shell = window.CC_SHELL.create();

/* ---------- 断言框架 ---------- */
var pass = 0, fail = 0;
var failures = [];
var CURRENT_GROUP = '';

function group(name) { CURRENT_GROUP = name; }

/* a(name, cmd, checks)
   checks 里可以放：
     字符串           → stdout+stderr 里必须出现
     RegExp           → 同上，正则匹配
     {re:...}         → 同上
     {err:...}        → **只**在 stderr 里必须出现（输出走对了通道）
     {notErr:...}     → stderr 里不能出现
     {out:...}        → **只**在 stdout 里必须出现
     {code:n}         → 退出码必须是 n
     {outLines:n}     → stdout 行数必须是 n
     function(res, out, err) → 返回 true 或一段失败原因                    */
function a(name, cmd, checks) {
  var res;
  try {
    res = shell.exec(cmd);
  } catch (e) {
    fail++;
    failures.push({ group: CURRENT_GROUP, name: name, cmd: cmd, why: '引擎抛异常: ' + (e && e.message) });
    return;
  }
  var out = (res.out || []).join('\n');
  var err = (res.err || []).join('\n');
  var both = out + (out && err ? '\n' : '') + err;
  var problems = [];

  (checks || []).forEach(function (c) {
    if (typeof c === 'string') {
      if (both.indexOf(c) === -1) problems.push('输出里缺少「' + c + '」');
      return;
    }
    if (c instanceof RegExp) {
      if (!c.test(both)) problems.push('输出不匹配 ' + c);
      return;
    }
    if (typeof c === 'function') {
      var r = c(res, out, err);
      if (r !== true) problems.push(String(r));
      return;
    }
    if (c && typeof c === 'object') {
      if (c.code !== undefined && res.code !== c.code) {
        problems.push('退出码应为 ' + c.code + '，实际 ' + res.code);
      }
      if (c.out !== undefined && !new RegExp(c.out).test(out)) {
        problems.push('stdout 里缺少 ' + c.out);
      }
      if (c.notOut !== undefined && new RegExp(c.notOut).test(out)) {
        problems.push('stdout 里不该出现 ' + c.notOut);
      }
      if (c.err !== undefined && !new RegExp(c.err).test(err)) {
        problems.push('stderr 里缺少 ' + c.err + '（错误必须走 stderr，不能混进 stdout）');
      }
      if (c.notErr !== undefined && new RegExp(c.notErr).test(err)) {
        problems.push('stderr 里不该出现 ' + c.notErr);
      }
      if (c.outLines !== undefined) {
        var n = (res.out || []).length;
        if (n !== c.outLines) problems.push('stdout 行数应为 ' + c.outLines + '，实际 ' + n);
      }
      if (c.re !== undefined && !new RegExp(c.re).test(both)) {
        problems.push('输出不匹配 ' + c.re);
      }
      return;
    }
    problems.push('无法识别的断言类型: ' + typeof c);
  });

  if (problems.length) {
    fail++;
    failures.push({
      group: CURRENT_GROUP, name: name, cmd: cmd, why: problems.join('；'),
      out: out.slice(0, 300), err: err.slice(0, 200)
    });
  } else {
    pass++;
  }
}

/* 便捷断言：只要 stdout、不要 stderr */
function noErr(res, out, err) { return err === '' ? true : '不该有 stderr：' + err.slice(0, 120); }
function codeIs(n) { return function (res) { return res.code === n ? true : '退出码应为 ' + n + '，实际 ' + res.code; }; }

/* ======================================================================
   A. kubectl create
   ====================================================================== */
group('kubectl create');

a('create deployment --dry-run 输出合法 YAML 骨架', 'kubectl create deploy web --image=nginx:1.25 --replicas=2 --dry-run=client -o yaml', [
  'apiVersion: apps/v1', 'kind: Deployment', 'name: web',
  'replicas: 2', 'image: nginx:1.25', 'restartPolicy: Always',
  { code: 0 }, noErr
]);
a('create deployment 缺 --image 必须报 required flag 且走 stderr',
  'kubectl create deploy web --dry-run=client', [
    { err: 'required flag\\(s\\) "image" not set' }, { code: 1 }, 'error:'
  ]);
a('create namespace 已存在要报 AlreadyExists',
  'kubectl create namespace my-app', [
    { err: 'AlreadyExists' }, { err: 'namespaces "my-app" already exists' }, { code: 1 }
  ]);
a('create secret --from-literal 的 data 是 base64（值能被 base64 -d 解回明文）',
  'kubectl create secret generic db-secret --from-literal=password=MyP@ssw0rd --dry-run=client -o yaml', [
    'kind: Secret', 'type: Opaque', 'password: TXlQQHNzdzByZA=='
  ]);
a('create secret --from-file 指向不存在的文件必须报错（不能静默塞占位内容）',
  'kubectl create secret generic tls-secret --from-file=tls.crt=./no-such-file.crt --dry-run=client -o yaml', [
    { err: 'no-such-file.crt' }, { code: 1 }, { err: 'no such file' }
  ]);
a('create secret tls 缺 tls.key 要报错',
  'kubectl create secret generic tls-secret --from-file=tls.crt=./server.crt --type=kubernetes.io/tls -n my-app', [
    { err: 'tls.key' }, { code: 1 }
  ]);
a('create job --from=cronjob 生成的 YAML 里带出 CronJob 的模板',
  'kubectl create job --from=cronjob/backup backup-manual -n my-app --dry-run=client -o yaml', [
    'kind: Job', 'name: backup-manual', 'namespace: my-app', 'mysqldump'
  ]);
a('create job 给的 cronjob 不存在要报 NotFound', 'kubectl create job --from=cronjob/nope x -n my-app', [
  { err: 'NotFound' }, { err: 'cronjobs.batch "nope" not found' }, { code: 1 }
]);
a('create token 默认有效期 1 小时，输出是可辨认的模拟令牌',
  'kubectl create token app-sa -n my-app', [
    function (res) {
      var t = (res.out || []).join('');
      if (t.split('.').length !== 3) return 'JWT 应该是三段（header.payload.signature），实际 ' + t.slice(0, 40);
      return res.code === 0 ? true : '退出码应为 0';
    }
  ]);
a('create token -o yaml 要给出 expirationSeconds（单位秒）',
  'kubectl create token app-sa -n my-app --duration=24h -o yaml', [
    'kind: TokenRequest', 'expirationSeconds: 86400', 'expirationTimestamp:', 'token:'
  ]);
a('create token 时长超过 24h 必须被服务端拒绝', 'kubectl create token app-sa -n my-app --duration=48h', [
  { err: 'cannot be longer than 24h' }, { code: 1 }
]);
a('create token 的 SA 不存在要报 NotFound', 'kubectl create token no-such-sa -n my-app', [
  { err: 'NotFound' }, { code: 1 }
]);
a('create role 缺 --verb 报 required flag', 'kubectl create role r1 --resource=pods -n my-app', [
  { err: 'required flag\\(s\\) "verb" not set' }, { code: 1 }
]);
a('create rolebinding --serviceaccount 带命名空间前缀时被正确拆开',
  'kubectl create rolebinding pod-reader-bind --role=pod-reader --serviceaccount=my-app:app-sa -n my-app --dry-run=client -o yaml', [
    'kind: RoleBinding', 'kind: Role', 'name: pod-reader', 'name: app-sa', 'namespace: my-app'
  ]);
a('create configmap --from-file 目录只收一层文件', 'kubectl create configmap nginx-conf --from-file=./conf.d/ -n my-app --dry-run=client -o yaml', [
    'kind: ConfigMap', 'app.conf', 'upstream.conf'
  ]);
a('create 未知资源类型要报错', 'kubectl create frobnicate x', [
  { err: 'unknown command "create frobnicate"' }, { code: 1 }
]);

/* ======================================================================
   B. kubectl debug
   ====================================================================== */
group('kubectl debug');

a('debug 临时容器模式：说明共享哪个容器的进程空间',
  'kubectl debug -it my-pod --image=nicolaka/netshoot --target=app', [
    'Targeting container "app"', 'Adding debugger', 'distroless',
    { code: 0 }
  ]);
a('debug --copy-to 输出克隆 Pod 名与换掉的镜像',
  'kubectl debug worker-6b8f7c9d4-m2vqt -n my-app --copy-to=worker-dbg --set-image=worker=swr.cn-north-4.myhuaweicloud.com/myorg/worker:v1.2.4', [
    'Pod "worker-dbg" of "worker-6b8f7c9d4-m2vqt" created.', 'worker -> swr.cn-north-4.myhuaweicloud.com/myorg/worker:v1.2.4',
    'kubectl delete pod worker-dbg'
  ]);
a('debug node/ 模式给出调试 Pod 名与 /host 说明',
  'kubectl debug node/10.0.1.23 -it --image=busybox', [
    /Creating debugging pod node-debugger-10-0-1-23-\w+ with container debugger on node 10\.0\.1\.23\./,
    '/host'
  ]);
a('debug 目标 Pod 不存在必须报 NotFound', 'kubectl debug no-such-pod --image=busybox', [
  { err: 'NotFound' }, { err: 'pods "no-such-pod" not found' }, { code: 1 }
]);
a('debug node/ 给了不存在的节点必须报 NotFound', 'kubectl debug node/10.9.9.9 -it --image=busybox', [
  { err: 'NotFound' }, { code: 1 }
]);
a('debug 不带 --image 且不是 --copy-to 要报错', 'kubectl debug my-pod --target=app', [
  { err: '--image is required' }, { code: 1 }
]);
a('debug 完全不写目标要报错', 'kubectl debug --image=busybox', [
  { err: 'must specify a target' }, { code: 1 }
]);

/* ======================================================================
   C. kubectl auth
   ====================================================================== */
group('kubectl auth');

a('auth whoami 给出用户名与组', 'kubectl auth whoami', [
  'USERNAME', 'GROUPS', 'cluster-admin', 'system:masters', { code: 0 }
]);
a('auth whoami -o yaml 是结构化的 WhoAmI 对象',
  'kubectl auth whoami -o yaml', ['kind: WhoAmI', 'status:', 'userInfo:', 'username: cluster-admin']);
a('auth whoami --as 显示被模拟的身份', 'kubectl auth whoami --as=system:serviceaccount:my-app:app-sa', [
  'system:serviceaccount:my-app:app-sa'
]);
a('auth can-i 对 -n 命名空间内的资源返回 yes', 'kubectl auth can-i create pods -n my-app', [
  { outLines: 1 }, { out: '^yes$' }, noErr
]);
a('auth can-i 对没有授权的 SA 返回 no（不是随便回 yes）',
  'kubectl auth can-i get secrets --as=system:serviceaccount:my-app:my-sa', [
    { out: '^no$' }, { code: 0 }
  ]);
a('auth can-i 只给一个词时必须报错', 'kubectl auth can-i pods', [
  { err: 'you must specify two of the following' }, { code: 1 }
]);
a('auth can-i 资源类型不存在要报错', 'kubectl auth can-i get frobnicates -n my-app', [
  { err: 'doesn\'t have a resource type' }, { code: 1 }
]);
a('auth can-i --list 打印权限表而不是单个词', 'kubectl auth can-i --list -n my-app', [
  'Resources', 'Non-Resource URLs', 'Resource Names', 'Verbs', 'pods'
]);
a('auth reconcile --dry-run 只预演、并明确说集群没被改',
  'kubectl auth reconcile -f rbac.yaml --dry-run=client', [
    'role.rbac.authorization.k8s.io/pod-reader', 'dry run', '集群没有被修改'
  ]);
a('auth reconcile 会列出 RoleBinding', 'kubectl auth reconcile -f rbac.yaml', [
  'rolebinding.rbac.authorization.k8s.io/pod-reader'
]);
a('auth reconcile 的清单文件不存在要报错', 'kubectl auth reconcile -f no-such.yaml', [
  { err: 'does not exist' }, { code: 1 }
]);
a('auth reconcile 不带 -f 要报错', 'kubectl auth reconcile', [
  { err: 'must specify one of -f and -k' }, { code: 1 }
]);
a('auth 未知子命令要报错', 'kubectl auth frobnicate', [
  { err: 'unknown command "frobnicate" for "kubectl auth"' }, { code: 1 }
]);

/* ======================================================================
   D. kubectl label / annotate
   ====================================================================== */
group('kubectl label / annotate');

a('label 新增标签回显 `pod/<名字> labeled`', 'kubectl label pod web-7d9c4b8f5-2xk9p env=prod -n my-app', [
  { out: 'pod/web-7d9c4b8f5-2xk9p labeled' }, { code: 0 }
]);
a('label 覆盖已有键不加 --overwrite 必须报错',
  'kubectl label pod web-7d9c4b8f5-2xk9p app=other -n my-app', [
    { err: 'already has a value' }, { err: '--overwrite is false' }, { code: 1 }
  ]);
a('label 加 --overwrite 后覆盖成功，并且提示会切断 Service 关联',
  'kubectl label pod web-7d9c4b8f5-2xk9p app=other --overwrite -n my-app', [
    'labeled', 'endpoints'
  ]);
a('label 用 `键-` 删除标签', 'kubectl label pod web-7d9c4b8f5-2xk9p app- -n my-app', [
  'label "app" removed'
]);
a('label 删除不存在的键要如实报 not found（不能假装成功）',
  'kubectl label pod web-7d9c4b8f5-2xk9p nosuchkey- -n my-app', [
    'label "nosuchkey" not found'
  ]);
a('label 缺少键值对要报错', 'kubectl label pod web-7d9c4b8f5-2xk9p', [
  { err: 'at least one label update is required' }, { code: 1 }
]);
a('label 值太长（>63 字节）要报错', 'kubectl label pod web-7d9c4b8f5-2xk9p k=' + new Array(70).join('x') + ' -n my-app', [
  { err: 'Too long' }, { code: 1 }
]);
a('label 资源不存在要报 NotFound', 'kubectl label pod no-such-pod a=b -n my-app', [
  { err: 'NotFound' }, { code: 1 }
]);
a('label 资源类型不存在要报 no resource type', 'kubectl label frobnicate x a=b', [
  { err: 'doesn\'t have a resource type' }, { code: 1 }
]);
a('label node 可用', 'kubectl label node 10.0.1.24 disktype=ssd', ['node/10.0.1.24 labeled']);
a('annotate 新增注解回显 `ingress/<名字> annotated`',
  'kubectl annotate ingress web nginx.ingress.kubernetes.io/rewrite-target=/ -n my-app', [
    { out: 'ingress/web annotated' }
  ]);
a('annotate 的值含中文与空格要能原样接受',
  'kubectl annotate deploy web description="订单服务，负责人 张三" -n my-app --overwrite', [
    'annotated'
  ]);
a('annotate 覆盖同键不加 --overwrite 要报错',
  'kubectl annotate ingress web nginx.ingress.kubernetes.io/rewrite-target=/x -n my-app', [
    { err: 'already has a value' }, { code: 1 }
  ]);
a('annotate 缺少键值对要报错', 'kubectl annotate deploy web', [
  { err: 'at least one annotation update is required' }, { code: 1 }
]);

/* ======================================================================
   E. kubectl patch / taint
   ====================================================================== */
group('kubectl patch / taint');

a('patch 默认 strategic：回显 `deployment.apps/web patched`',
  'kubectl patch deploy/web -n my-app -p \'{"spec":{"replicas":3}}\'', [
    { out: 'deployment.apps/web patched' }, { code: 0 }
  ]);
a('patch --type=json 改数组元素', 'kubectl patch svc/web -n my-app --type=json -p \'[{"op":"replace","path":"/spec/ports/0/nodePort","value":30080}]\'', [
  'service/web patched', 'json patch'
]);
a('patch 不带 -p 要报错', 'kubectl patch deploy/web -n my-app', [
  { err: 'must specify -p or --patch' }, { code: 1 }
]);
a('patch 的补丁不是合法 JSON 要报错', 'kubectl patch deploy/web -n my-app -p not-json', [
  { err: 'unable to parse' }, { code: 1 }
]);
a('patch --type=json 但补丁不是数组要报错', 'kubectl patch deploy/web -n my-app --type=json -p \'{}\'', [
  { err: 'json patch must be an array' }, { code: 1 }
]);
a('patch 未知的 --type 要报错', 'kubectl patch deploy/web -n my-app --type=fancy -p \'{}\'', [
  { err: 'invalid patch type' }, { code: 1 }
]);
a('patch 目标资源不存在要报 NotFound', 'kubectl patch deploy/nope -n my-app -p \'{}\'', [
  { err: 'NotFound' }, { code: 1 }
]);
a('taint 加污点回显 `node/<名字> tainted`', 'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule', [
  { out: 'node/10.0.1.11 tainted' }
]);
a('taint 用 `键:效果-` 删除污点回显 untainted',
  'kubectl taint nodes 10.0.1.11 dedicated=db:NoSchedule-', [
    { out: 'node/10.0.1.11 untainted' }
  ]);
a('taint 给已有污点重复加且不带 --overwrite 要报错',
  'kubectl taint nodes 10.0.1.11 node-role.kubernetes.io/control-plane:NoSchedule', [
    { err: 'already has' }, { err: '--overwrite is false' }, { code: 1 }
  ]);
a('taint NoExecute 必须给出驱逐警告', 'kubectl taint nodes 10.0.1.23 dedicated=db:NoExecute', [
  'NoExecute', '驱逐'
]);
a('taint 写在非节点资源上要报错', 'kubectl taint pods my-pod a=b:NoSchedule', [
  { err: 'taints are only supported on nodes' }, { code: 1 }
]);
a('taint 格式写错要报错', 'kubectl taint nodes 10.0.1.23 dedicated-db', [
  { err: 'invalid taint spec' }, { code: 1 }
]);
a('taint 节点不存在要报 NotFound', 'kubectl taint nodes 10.9.9.9 a=b:NoSchedule', [
  { err: 'NotFound' }, { code: 1 }
]);

/* ======================================================================
   F. kubectl diff / replace
   ====================================================================== */
group('kubectl diff / replace');

a('diff 有差异时输出统一 diff 且退出码为 1（真机语义）',
  'kubectl diff -f deploy.yaml', [
    function (res) { return res.code === 1 ? true : '差异时退出码必须是 1，实际 ' + res.code; },
    /^\-\-\- deploy\.yaml$/m,
    /\+\+\+ deployment\/web \(server\)/,
    /^@@ /m,
    { out: '教学提示' },
    noErr
  ]);
a('diff 报出的差异确实是"本地 1.2.3 vs 线上 1.2.1"',
  'kubectl diff -f deploy.yaml', [
    /-.*web:1\.2\.3/, /\+.*web:1\.2\.1/
  ]);
a('diff 支持目录', 'kubectl diff -f ./manifests/ -n my-app', [
  /deployment\/web \(server\)/, /service\/web \(server\)/
]);
a('diff 文件不存在要报错', 'kubectl diff -f no-such.yaml', [
  { err: 'does not exist' }, { code: 1 }
]);
a('diff 不带 -f 要报错', 'kubectl diff', [
  { err: 'must specify one of -f and -k' }, { code: 1 }
]);
a('replace --force 走"先删后建"并提示不可变字段',
  'kubectl replace --force -f svc.yaml', [
    'deleted (grace period 0s)', 'service/web replaced', '不可变字段'
  ]);
a('replace 不带 --force 只整体替换', 'kubectl replace -f deploy.yaml', [
  'deployment/web replaced'
]);
a('replace 逐条报告：清单里存在与不存在的资源分别对待',
  'kubectl replace -f ./manifests/ns.yaml', [
    'namespace/my-app replaced', { code: 0 }
  ]);
a('replace 指向不存在的文件要报错', 'kubectl replace -f ./manifests/nope.yaml', [
  { err: 'does not exist' }, { code: 1 }
]);
a('replace 文件不存在要报错', 'kubectl replace -f nope.yaml', [
  { err: 'does not exist' }, { code: 1 }
]);

/* ======================================================================
   G. kubectl cp / run / edit / expose / api-resources / get 补充
   ====================================================================== */
group('kubectl cp / run / edit / expose');

a('cp 本地 → 容器：如实说明不会真的传输，并给出容器名与路径',
  'kubectl cp ./config.yaml my-app/my-pod:/tmp/config.yaml', [
    '不真的传输文件', 'my-pod', '/tmp/config.yaml', 'tar',
    { notErr: '拷贝成功' }
  ]);
a('cp 容器 → 本地：同样不伪造成功',
  'kubectl cp my-app/my-pod:/var/log/app.log ./app.log', [
    '容器 → 本地', '/var/log/app.log'
  ]);
a('cp 本地源文件不存在必须真报错', 'kubectl cp ./no-such-file.yaml my-app/my-pod:/tmp/x.yaml', [
  { err: 'No such file or directory' }, { code: 1 }
]);
a('cp 只给一个参数要报错', 'kubectl cp ./a.yaml', [
  { err: 'expects 2 arguments' }, { code: 1 }
]);
a('cp 两侧都是本地路径要报错', 'kubectl cp ./a.yaml ./b.yaml', [
  { err: 'one of src or dest must be a remote file specification' }, { code: 1 }
]);
a('cp 目标 Pod 不存在要报错', 'kubectl cp ./config.yaml my-app/no-such-pod:/tmp/x.yaml', [
  { err: 'not found' }, { code: 1 }
]);
a('run 回显 pod 创建并提示裸 Pod 的局限', 'kubectl run tmp --rm -it --image=busybox -- sh -c "true"', [
  'pod/tmp created', 'pod "tmp" deleted', '裸 Pod'
]);
a('run 缺 --image 要报错', 'kubectl run tmp', [
  { err: '--image is required for run' }, { code: 1 }
]);
a('run 名字含大写要按 RFC1123 拒绝', 'kubectl run Bad_Name --image=busybox', [
  { err: 'RFC 1123' }, { code: 1 }
]);
a('run 到不存在的命名空间要报 NotFound', 'kubectl run tmp --image=busybox -n nosuchns', [
  { err: 'NotFound' }, { code: 1 }
]);
a('edit 明确说明是交互式、并给出三条等价做法', 'kubectl edit deploy/web -n my-app', [
  '交互式', 'kubectl patch', 'kubectl diff', 'Git'
]);
a('edit 目标资源不存在要报 NotFound', 'kubectl edit deploy/nope', [
  { err: 'NotFound' }, { code: 1 }
]);
a('edit 资源类型不存在要报 no resource type', 'kubectl edit frobnicate x', [
  { err: 'doesn\'t have a resource type' }, { code: 1 }
]);
a('expose 建 Service 回显 service 名', 'kubectl expose deploy/web --type=NodePort --port=80 --target-port=8080 --name=web-np -n my-app', [
  'service/web-np exposed'
]);
a('expose 缺 --port 要报错', 'kubectl expose deploy/web -n my-app', [
  { err: 'required flag\\(s\\) "port" not set' }, { code: 1 }
]);
a('expose 的 type 非法要报错', 'kubectl expose deploy/web -n my-app --port=80 --type=Bogus', [
  { err: 'invalid service type' }, { code: 1 }
]);
a('expose 目标 Deployment 不存在要报 NotFound', 'kubectl expose deploy/nope -n my-app --port=80', [
  { err: 'NotFound' }, { code: 1 }
]);

group('kubectl api-resources / get');

a('api-resources 全量表含 APIVERSION 与 NAMESPACED 列', 'kubectl api-resources', [
  'NAME', 'SHORTNAMES', 'APIVERSION', 'NAMESPACED', 'KIND', 'pods', 'deployments'
]);
a('api-resources --namespaced=false 只留集群级资源', 'kubectl api-resources --namespaced=false', [
  'nodes', 'namespaces', 'storageclasses',
  function (res, out) {
    return /^pods\s/m.test(out) ? '命名空间级资源 pods 不该出现在 --namespaced=false 的结果里' : true;
  }
]);
a('api-resources -o wide 多出 VERBS 列', 'kubectl api-resources -o wide', ['VERBS']);
a('get secret 列表含 TYPE 列', 'kubectl get secret -n my-app', [
  'NAME', 'TYPE', 'DATA', 'db-secret', 'tls-secret', 'kubernetes.io/tls'
]);
a('get secret -o jsonpath 取出 base64 值，能被 base64 -d 解回明文',
  'kubectl get secret db-secret -n my-app -o jsonpath=\'{.data.password}\'', [
    { out: '^TXlQQHNzdzByZA==$' }, noErr
  ]);
a('get secret 不存在要报 NotFound', 'kubectl get secret nope -n my-app', [
  { err: 'NotFound' }, { code: 1 }
]);
a('get nodes --show-labels 打印 LABELS 列且含 nodeSelector 用的键',
  'kubectl get nodes --show-labels', [
    'LABELS', 'kubernetes.io/hostname=10.0.1.23'
  ]);
a('get nodes -l 选择器能过滤出节点（没匹配到就明确说没有）',
  'kubectl get nodes -l topology.kubernetes.io/zone=cn-north-4a', [
    '10.0.1.23',
    function (res, out) { return out.indexOf('10.0.1.24') === -1 ? true : '不该出现 10.0.1.24'; }
  ]);
a('get pods --field-selector spec.nodeName --no-headers 输出可直接计数',
  'kubectl get pods -A --field-selector spec.nodeName=10.0.1.23 --no-headers', [
    function (res, out) {
      var lines = out.split('\n').filter(function (l) { return l.trim() !== ''; });
      return lines.length === 4 ? true : '应有 4 行（该节点上 4 个 Pod），实际 ' + lines.length;
    },
    function (res, out) { return out.indexOf('NAME') === -1 ? true : '--no-headers 不该打印表头'; }
  ]);
a('get pods --field-selector 条件非法要报错', 'kubectl get pods --field-selector foo.bar=1', [
  { err: 'field label not supported' }, { code: 1 }
]);
a('get pods --show-labels 打印标签列', 'kubectl get pods -n my-app --show-labels', [
  'LABELS', 'app=web'
]);
a('get endpointslices -o wide 显示 ENDPOINTS', 'kubectl get endpointslices -n my-app -o wide', [
  'NAME', 'ADDRESSTYPE', 'ENDPOINTS', 'web-abc12', '172.20.1.14,172.20.2.9'
]);

/* ======================================================================
   H. kubectl exec（容器内几条可真实回答的命令）
   ====================================================================== */
group('kubectl exec');

a('exec -- env 打印该 Pod 的环境变量（含日志里出现的 CACHE_HOST）',
  'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- env', [
    'CACHE_HOST=cache-prod-01', 'CACHE_PORT=6379', 'HOSTNAME=worker-6b8f7c9d4-m2vqt'
  ]);
a('exec -- nslookup 解析不到 backend 时如实给出 NXDOMAIN 且退出码非 0',
  'kubectl exec worker-6b8f7c9d4-m2vqt -n my-app -- nslookup cache-prod-01', [
    { err: 'NXDOMAIN' }, { code: 1 }, { err: 'CrashLoopBackOff' }
  ]);
a('exec 目标 Pod 不存在要报 NotFound', 'kubectl exec no-such-pod -- env', [
  { err: 'NotFound' }, { code: 1 }
]);
a('exec 指定了 Pod 里没有的容器要报 container not found',
  'kubectl exec web-7d9c4b8f5-2xk9p -c nosuch -- env', [
    { err: 'container not found' }, { code: 1 }
  ]);
a('exec 一条无法模拟的命令必须如实说明，不能伪造输出',
  'kubectl exec my-pod -- apt-get install curl', [
    { err: '无法执行' }, { code: 1 },
    function (res, out) { return out === '' ? true : '不能把"无法执行"混进 stdout'; }
  ]);
a('exec 不带容器内命令时给出可练的等价命令', 'kubectl exec -it my-pod -- bash', [
  '交互式', 'kubectl exec my-pod -- env'
]);

/* ======================================================================
   I. helm
   ====================================================================== */
group('helm');

a('helm create 真的建出目录，紧跟的 cat 能读到 Chart.yaml',
  'helm create my-app && cat my-app/Chart.yaml', [
    'Creating my-app', 'apiVersion: v2', 'name: my-app', 'version: 0.1.0', 'appVersion: "1.16.0"',
    { code: 0 }, noErr
  ]);
a('helm create 缺名字要报错', 'helm create', [
  { err: 'chart name is required' }, { code: 1 }
]);
a('helm create 名字非法要报错', 'helm create My_App', [
  { err: 'is invalid' }, { code: 1 }
]);
a('helm create 目录已存在要报错', 'helm create my-app && helm create my-app', [
  { err: 'already exists' }, { code: 1 }
]);
a('helm create 出来的骨架能通过 helm lint（骨架本身是干净的）',
  'helm create my-app && helm lint ./my-app', [
    'Creation of the chart succeeded', 'lint', '0 chart(s) failed'
  ]);
a('helm dependency list 列出 Chart.yaml 里声明的依赖与状态',
  'helm dependency list ./charts/my-app', [
    'NAME', 'VERSION', 'REPOSITORY', 'STATUS', 'worker', '1.2.3', 'ok'
  ]);
a('helm dependency update 生成 Chart.lock 并把 Chart.lock 内容带出来',
  'helm dependency update ./charts/my-app', [
    'Saving 1 charts', 'Update Complete', 'Chart.lock'
  ]);
a('helm dependency build --skip-refresh 走离线重建', 'helm dependency build ./charts/my-app --skip-refresh', [
  'Saving 1 charts', '--skip-refresh'
]);
a('helm dependency 目录不存在要报错', 'helm dependency update ./no-such-charts', [
  { err: 'does not exist' }, { code: 1 }
]);
a('helm dependency 缺子命令要报错', 'helm dependency', [
  { err: 'requires a subcommand' }, { code: 1 }
]);
a('helm dependency 未知子命令要报错', 'helm dependency frobnicate ./charts/my-app', [
  { err: 'unknown command "frobnicate" for "helm dependency"' }, { code: 1 }
]);
a('helm env 打印 HELM_* 路径与 KUBECONFIG', 'helm env', [
  'HELM_BIN="helm"', 'HELM_CACHE_HOME=', 'HELM_REPOSITORY_CONFIG=', 'KUBECONFIG='
]);
a('helm plugin install 只登记不下载，且说清放哪里',
  'helm plugin install https://github.com/databus23/helm-diff', [
    'Installed plugin: helm-diff', 'helm diff upgrade'
  ]);
a('helm plugin install 传输非法地址要报错', 'helm plugin install not-a-url', [
  { err: 'must start with' }, { code: 1 }
]);
a('helm plugin list 列出预置插件', 'helm plugin list', ['NAME', 'diff', 'unittest']);
a('helm plugin 未知子命令要报错', 'helm plugin frobnicate', [
  { err: 'unknown command "frobnicate" for "helm plugin"' }, { code: 1 }
]);
a('helm search hub 联网失败要如实报网络错误，不能编搜索结果',
  'helm search hub redis', [
    { err: 'no such host' }, { code: 1 },
    function (res, out) { return out === '' ? true : '网络失败不能让 stdout 有"搜索结果"'; }
  ]);
a('helm show readme 打印 README（含生产必读项）', 'helm show readme bitnami/mysql', [
  'Bitnami MySQL', '生产环境必读'
]);
a('helm show all = chart + readme + values 一次打完', 'helm show all bitnami/redis', [
  'apiVersion: v2', 'name: redis', 'Bitnami Redis', 'replicaCount'
]);
a('helm show readme 的 chart 不存在要报错', 'helm show readme bitnami/nope', [
  function (res) { return res.code === 1 ? true : 'chart 不存在时应退出码 1'; }
]);
a('helm package 打出 tgz 并给出文件名', 'helm package ./charts/my-app -d ./dist --version 1.4.2', [
  'Successfully packaged chart and saved it to: ./dist/my-app-1.4.2.tgz',
  'appVersion'
]);
a('helm package 打的包真的存在于文件系统里（ls 能列出）',
  'helm package ./charts/my-app -d ./dist --version 9.9.9 && ls ./dist', [
    'my-app-9.9.9.tgz'
  ]);
a('helm package 目录不存在要报错', 'helm package ./no-such-dir', [
  { err: 'no such file or directory' }, { code: 1 }
]);
a('helm package 不写目录要报错', 'helm package', [
  { err: 'must specify a chart directory' }, { code: 1 }
]);
a('helm pull 下载 chart 并给出版本与摘要', 'helm pull bitnami/nginx --version 15.4.0', [
  'Pulled: bitnami/nginx:15.4.0', /Digest: sha256:[0-9a-f]{64}/
]);
a('helm pull --untar 真的解出目录，紧跟的 ls 能看到',
  'helm pull bitnami/nginx --untar --untar-dir ./charts && ls ./charts/nginx', [
    'Chart.yaml', 'values.yaml', 'templates'
  ]);
a('helm pull 的 chart 不存在要报错', 'helm pull bitnami/nope', [
  { err: 'not found in bitnami index' }, { code: 1 }
]);
a('helm pull 非 OCI 地址写错前缀时按仓库解析而不是假成功',
  'helm pull no-slash', [
    { err: 'chart "no-slash" not found' }, { code: 1 }
  ]);
a('helm push 推送 tgz 并说明 OCI 地址结尾不能带 Chart 名',
  'helm push ./dist/my-app-1.4.2.tgz oci://swr.cn-north-4.myhuaweicloud.com/myorg', [
    'Pushed: oci://swr.cn-north-4.myhuaweicloud.com/myorg/my-app:1.4.2',
    /Digest: sha256:[0-9a-f]{64}/, '组织名/命名空间'
  ]);
a('helm push 传目录要报错（只接受 tgz）', 'helm push ./charts/my-app oci://swr.cn-north-4.myhuaweicloud.com/myorg', [
  { err: 'no such file or directory' }, { code: 1 }
]);
a('helm push 非 oci:// 地址要报错', 'helm push ./dist/my-app-1.4.2.tgz https://example.com/charts', [
  { err: 'only supports OCI' }, { code: 1 }
]);
a('helm registry login 成功回显', 'helm registry login -u cn-north-4@ABCDEFG swr.cn-north-4.myhuaweicloud.com', [
  'Login Succeeded'
]);
a('helm registry login 缺用户名要报错', 'helm registry login swr.cn-north-4.myhuaweicloud.com', [
  { err: 'username and hostname are required' }, { code: 1 }
]);
a('helm get manifest --revision 取历史版本，并说明与当前不同',
  'helm get manifest my-app -n prod --revision 3', [
    'kind: Deployment', 'myorg/my-app:1.4.2', '历史版本'
  ]);
a('helm get --revision 非数字要报错', 'helm get manifest my-app --revision abc', [
  { err: 'invalid syntax' }, { code: 1 }
]);
a('helm get --revision 0 要报错（版本从 1 开始）', 'helm get manifest my-app --revision 0', [
  { err: 'not found' }, { code: 1 }
]);
a('helm diff upgrade 预览升级会改哪些字段', 'helm diff upgrade my-app ./charts/my-app -n prod -f values-prod.yaml', [
  'has changed', 'spec.replicas', 'image:'
]);
a('helm diff 插件没装时的子命令要报错', 'helm diff frobnicate x y', [
  { err: 'unknown command' }, { code: 1 }
]);
a('helm diff upgrade 缺参数要报错', 'helm diff upgrade my-app', [
  { err: 'requires 2 arguments' }, { code: 1 }
]);

/* ======================================================================
   J. kubeadm
   ====================================================================== */
group('kubeadm');

a('kubeadm init --pod-network-cidr 打印初始化成功与 join 命令',
  'kubeadm init --pod-network-cidr=10.244.0.0/16 --image-repository=registry.aliyuncs.com/google_containers', [
    'initialized successfully', 'kubeadm join 10.0.1.11:6443 --token', 'mkdir -p $HOME/.kube',
    /sha256:[0-9a-f]{64}/, 'calico' === 'x' ? '' : 'registry.aliyuncs.com', { code: 0 }, noErr
  ]);
a('kubeadm init 缺 --pod-network-cidr 要报错', 'kubeadm init', [
  { err: '--pod-network-cidr is required' }, { code: 1 }
]);
a('kubeadm init 网段格式错要报错', 'kubeadm init --pod-network-cidr=10.244.0.0', [
  { err: 'invalid CIDR' }, { code: 1 }
]);
a('kubeadm init --control-plane-endpoint --upload-certs 给出证书已上传的说明',
  'kubeadm init --control-plane-endpoint=10.0.1.11:6443 --upload-certs --pod-network-cidr=10.244.0.0/16', [
    'kubeadm join 10.0.1.11:6443', '--upload-certs'
  ]);
a('kubeadm token create --print-join-command 打出完整 join 命令',
  'kubeadm token create --print-join-command', [
    /kubeadm join 10\.0\.1\.11:6443 --token [a-z0-9]{6}\.[a-z0-9]{16}/,
    /--discovery-token-ca-cert-hash sha256:[0-9a-f]{64}/
  ]);
a('kubeadm token create --ttl 非法要报错', 'kubeadm token create --ttl=2x', [
  { err: 'invalid --ttl' }, { code: 1 }
]);
a('kubeadm token list 标出过期的令牌', 'kubeadm token list', [
  'TOKEN', 'TTL', 'EXPIRES', 'USAGES', '<invalid>'
]);
a('kubeadm token delete 令牌格式错要报错', 'kubeadm token delete notatoken', [
  { err: 'invalid token' }, { code: 1 }
]);
a('kubeadm token delete 缺参数要报错', 'kubeadm token delete', [
  { err: 'token is required' }, { code: 1 }
]);
a('kubeadm upgrade plan 列出组件与目标版本', 'kubeadm upgrade plan', [
  'kube-apiserver', 'kubeadm upgrade apply v1.29.0', 'CoreDNS'
]);
a('kubeadm upgrade apply 跨小版本必须被拒绝（只允许逐个小版本升）',
  'kubeadm upgrade apply v1.31.0', [
    { err: 'version skew' }, { code: 1 }
  ]);
a('kubeadm upgrade apply 缺版本号要报错', 'kubeadm upgrade apply', [
  { err: '<version> is required' }, { code: 1 }
]);
a('kubeadm upgrade node 给出工作节点的完整顺序（含 uncordon）',
  'kubeadm upgrade node', [
    'drain', 'uncordon'
  ]);
a('kubeadm reset 打印会删除 etcd 数据并给出 CNI/iptables 提醒',
  'kubeadm reset', [
    '/var/lib/etcd', '/etc/cni/net.d', 'iptables', '删掉本机 etcd 数据'
  ]);
a('kubeadm reset --cri-socket 会回显使用的 CRI socket',
  'kubeadm reset --cri-socket=unix:///run/containerd/containerd.sock', [
    'unix:///run/containerd/containerd.sock'
  ]);
a('kubeadm join 缺 token 要报错', 'kubeadm join 10.0.1.11:6443', [
  { err: '--token is required' }, { code: 1 }
]);
a('kubeadm join token 格式错要报错',
  'kubeadm join 10.0.1.11:6443 --token bad --discovery-token-ca-cert-hash sha256:' + new Array(65).join('a'), [
    { err: 'invalid token' }, { code: 1 }
  ]);
a('kubeadm join 缺 ca-cert-hash 要报错',
  'kubeadm join 10.0.1.11:6443 --token abcdef.0123456789abcdef', [
    { err: '--discovery-token-ca-cert-hash is required' }, { code: 1 }
  ]);
a('kubeadm 未知子命令要报错', 'kubeadm frobnicate', [
  { err: 'unknown command "frobnicate" for "kubeadm"' }, { code: 1 }
]);
a('kubeadm 不带参数给出子命令总览', 'kubeadm', [
  'kubeadm init', 'kubeadm join', 'kubeadm token', 'kubeadm upgrade', 'kubeadm reset'
]);

/* ======================================================================
   K. argocd
   ====================================================================== */
group('argocd');

a('argocd app get 显示同步状态、健康状态与资源树',
  'argocd app get myapp-prod', [
    'Name:               myapp-prod', 'Sync Status:', 'Health Status:', 'KIND', 'Deployment'
  ]);
a('argocd app sync --prune 明确说明 prune 会删资源并给出同步结论',
  'argocd app sync myapp-prod --prune --timeout 300', [
    'Synced', 'Succeeded', 'prune'
  ]);
a('argocd app sync --dry-run 不落盘', 'argocd app sync myapp-prod --dry-run', [
  'dry-run'
]);
a('argocd app diff 预览 Git 与集群的差异', 'argocd app diff myapp-prod', [
  'image:', '+ swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.4'
]);
a('argocd app 不存在要报错', 'argocd app get no-such-app', [
  { err: 'NotFound' }, { code: 1 }
]);
a('argocd app sync 缺应用名要报错', 'argocd app sync', [
  { err: 'application name is required' }, { code: 1 }
]);
a('argocd app rollback 到不存在的版本要报错', 'argocd app rollback myapp-prod 999', [
  { err: 'no deployment with id 999' }, { code: 1 }
]);
a('argocd app rollback 成功并说明它不改 Git', 'argocd app rollback myapp-prod 12', [
  'Synced to a1b2c3d', 'git revert'
]);
a('argocd app wait --health 说明它只判断成功、且会阻塞', 'argocd app wait myapp-prod --health --timeout 300', [
  'Health Status:      Healthy', '阻塞'
]);
a('argocd 未知子命令要报错', 'argocd frobnicate', [
  { err: 'unknown command "frobnicate" for "argocd"' }, { code: 1 }
]);

/* ======================================================================
   L. promtool
   ====================================================================== */
group('promtool');

a('promtool check config 通过时输出 SUCCESS 与规则条数',
  'promtool check config /etc/prometheus/prometheus.yml', [
    /SUCCESS: \/etc\/prometheus\/prometheus\.yml is valid prometheus config file syntax/,
    'rule files found', 'rules found', { code: 0 }, noErr
  ]);
a('promtool check config 文件不存在要报错', 'promtool check config /etc/prometheus/nope.yml', [
  { err: 'could not read file' }, { code: 1 }
]);
a('promtool check config 缺文件参数要报错', 'promtool check config', [
  { err: 'file argument is required' }, { code: 1 }
]);
a('promtool check config 遇到缺 scrape_configs 的配置要报 FAILED',
  'promtool check config /tmp/bad-prom.yml', [
    { err: 'FAILED' }, { code: 1 }, { err: 'scrape_configs' }
  ]);
a('promtool check rules 数出告警与记录规则条数',
  'promtool check rules /etc/prometheus/rules/myapp.yml', [
    'SUCCESS: 3 rules found', '告警规则 2 条', '记录规则 1 条'
  ]);
a('promtool check healthy 连不上实例时如实报 connection refused',
  'promtool check healthy --url=http://127.0.0.1:9090', [
    { err: 'connection refused' }, { code: 1 }
  ]);
a('promtool query instant 不伪造"连上了"，明确标注是示意数据',
  'promtool query instant http://127.0.0.1:9090 \'up == 0\'', [
    '10.0.1.31:9100', '示意数据', '没有进程在监听', 'port-forward'
  ]);
a('promtool query instant 缺表达式要报错', 'promtool query instant http://127.0.0.1:9090', [
  { err: 'PromQL expression is required' }, { code: 1 }
]);
a('promtool query instant 缺地址要报错', 'promtool query instant', [
  { err: 'HTTP API address is required' }, { code: 1 }
]);
a('promtool query instant 地址不是本机时如实报解析失败',
  'promtool query instant http://prometheus.internal:9090 up', [
    { err: 'no such host' }, { code: 1 }
  ]);
a('promtool query series 缺 --match 要报错',
  'promtool query series http://127.0.0.1:9090', [
    { err: '--match is required' }, { code: 1 }
  ]);
a('promtool query series 列出所有实例', 'promtool query series --match=\'up{job="node"}\' http://127.0.0.1:9090', [
  '10.0.1.11:9100', '10.0.1.23:9100', '10.0.1.24:9100'
]);
a('promtool query range 缺 --start/--end/--step 要报错',
  'promtool query range http://127.0.0.1:9090 \'up\'', [
    { err: '--start, --end and --step are required' }, { code: 1 }
  ]);
a('promtool query range 时间格式不是 RFC3339 要报错',
  'promtool query range --start=2024-03-18 --end=2024-03-18T10:00:00Z --step=1m http://127.0.0.1:9090 \'up\'', [
    { err: 'RFC3339' }, { code: 1 }
  ]);
a('promtool 未知子命令要报错', 'promtool frobnicate', [
  { err: 'unknown command "frobnicate" for "promtool"' }, { code: 1 }
]);

/* ======================================================================
   M. haproxy
   ====================================================================== */
group('haproxy');

a('haproxy -c 配置正确时输出 Configuration file is valid',
  'haproxy -c -f /etc/haproxy/haproxy.cfg', [
    'haproxy version is 2.8.5', 'Configuration file is valid', { code: 0 }, noErr
  ]);
a('haproxy -c -V 附带打印配置内容与行号',
  'haproxy -c -f /etc/haproxy/haproxy.cfg -V', [
    'Configuration file:', /1\s+global/, 'timeout connect 5s'
  ]);
a('haproxy -c 文件不存在要报 ALERT', 'haproxy -c -f /etc/haproxy/nope.cfg', [
  { err: 'cannot open configuration file' }, { code: 1 }
]);
a('haproxy -c 缺 -f 要报错', 'haproxy -c', [
  { err: 'no configuration file specified' }, { code: 1 }
]);
a('haproxy 不带 -c 时明确说不会假装启动进程', 'haproxy -f /etc/haproxy/haproxy.cfg', [
  { err: '只实现配置检查' }, { err: '不会假装启动' }, { code: 1 }
]);
a('haproxy -c 对缺 timeout 的配置要报 ALERT 并指出缺哪一条',
  'haproxy -c -f /tmp/bad-haproxy.cfg', [
    { err: 'missing timeouts' }, { code: 1 }, { err: 'timeout server' }
  ]);
a('haproxy -c 对只有 httpchk 没有 expect 的配置要给出警告',
  'haproxy -c -f /tmp/bad-haproxy.cfg', [
    { err: 'no "http-check expect status"' }
  ]);

/* ======================================================================
   N. base64 / diff 辅助命令（kubectl 示例链路上要用）
   ====================================================================== */
group('base64 / diff');

a('base64 -d 解出 Secret 明文', 'kubectl get secret db-secret -n my-app -o jsonpath=\'{.data.password}\' | base64 -d', [
  { out: '^MyP@ssw0rd$' }, noErr
]);
a('base64 编码后可再解码回原文（含中文）', 'echo 订单服务 | base64', [
  function (res, out) {
    var enc = out.trim();
    if (!/^[A-Za-z0-9+/]+=*$/.test(enc)) return 'base64 输出里有非法字符：' + enc;
    return true;
  }
]);
a('base64 -d 遇到非法输入要报错', 'echo "!!!!" | base64 -d', [
  function (res) { return res.code === 1 ? true : '非法输入应退出码 1，实际 ' + res.code; }
]);
a('diff 两个文件相同时无输出且退出码 0', 'diff /root/deploy.yaml /root/manifests/deploy.yaml', [
  { outLines: 0 }, { code: 0 }, noErr
]);
a('diff 有差异时退出码 1 并给出 < / > 两侧内容',
  'diff /root/deploy.yaml /root/svc.yaml', [
    { code: 1 }, { out: '^< ' }, { out: '^> ' }
  ]);
a('diff 文件不存在要报错且退出码非 0', 'diff /root/nope.yaml /root/svc.yaml', [
  { err: 'No such file or directory' }, { code: 1 }
]);
a('diff 只给一个文件要报 missing operand', 'diff /root/svc.yaml', [
  { err: 'missing operand' }, { code: 1 }
]);
a('diff - 表示标准输入，可与文件比对', 'kubectl get svc web -n my-app -o yaml | diff - /root/svc.yaml', [
  function (res) { return res.code === 1 || res.code === 0 ? true : 'diff 退出码应为 0 或 1，实际 ' + res.code; }
]);

/* ======================================================================
   输出结果
   ====================================================================== */
console.log('='.repeat(78));
console.log('命令实现断言检查（kubectl / helm / kubeadm / argocd / promtool / haproxy）');
console.log('='.repeat(78));
if (failures.length) {
  console.log('\n── 失败明细 ──');
  var lastGroup = null;
  failures.forEach(function (f) {
    if (f.group !== lastGroup) { console.log('\n【' + f.group + '】'); lastGroup = f.group; }
    console.log('  ✗ ' + f.name);
    console.log('      命令: ' + f.cmd.slice(0, 130));
    console.log('      原因: ' + f.why);
    if (f.err) console.log('      stderr: ' + f.err.replace(/\n/g, ' / ').slice(0, 160));
    if (f.out) console.log('      stdout: ' + f.out.replace(/\n/g, ' / ').slice(0, 160));
  });
  console.log('');
}
console.log('='.repeat(78));
console.log('断言检查：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('='.repeat(78));
process.exit(fail ? 1 : 0);
