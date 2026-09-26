/* assets/js/cmd-k8s.js · kubectl / helm / kubeadm / argocd / promtool / haproxy 补全
   --------------------------------------------------------------------------
   本文件只负责**注册命令实现**：shell.js 先加载，这里再调用
     window.CC_SHELL.extend({ '命令名': function (argv, ctx, stdin, HOST) { ... } })
   引擎内部的工具函数从 window.CC_SHELL.util 取（ok/fail/resolvePath/findNode/
   readFileOrErr/splitLines/childrenSorted/expandLongOpts/pad/padLeft/walkFiles）。

   覆盖的内容条目：kubectl create|debug|auth|label|patch|diff|cp|annotate|taint|
   replace|run|edit|expose|api-resources、helm create|dependency|plugin|env|package|
   pull|push|registry|search hub|show readme|all、kubeadm、argocd、promtool、haproxy
   数据文件（data/*.js）里的 examples[].cmd 会由 tools/example-check.js 逐条真跑，
   所以实现必须让这些示例真的能跑通、且输出与 desc 描述一致。

   ---------- 关于 kubectl / helm 的注册方式（重要） ----------
   CMDS.kubectl 与 CMDS.helm 已经存在于 shell.js，而 extend() 只添加不覆盖。
   shell.js 的两个函数体里各留了一个扩展钩子：
     window.CC_K8S_EXTRA[子命令](argv, ctx, stdin, HOST, sub)
     window.CC_HELM_EXTRA[子命令](argv, ctx, stdin, HOST, sub)
   钩子先于内置实现执行；返回 null 就继续走内置实现。所以下面只写"内置实现没做的
   那部分子命令"，内置的 get/describe/logs/apply/rollout/install/upgrade 等一行都不用重写。

   ---------- 关于"模拟集群不会被改写" ----------
   本引擎的集群状态来自 data/termfs.js 的快照。写操作类命令（label/annotate/patch/
   taint/replace/expose/create 不带 --dry-run）会打印真实 kubectl 的成功回显，随后
   追加一行教学提示说明**当前会话的集群快照不会真的改变**。这是刻意的：静默地让学员
   以为改动生效，比直接报错危险得多。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;

  var U = window.CC_SHELL.util;
  var ok = U.ok;
  var fail = U.fail;

  var K = (window.CC_TERM_FS || {}).k8s || {};
  var NS_DEFAULT = K.contextNs || 'default';

  /* ======================================================================
     0. 小工具
     ====================================================================== */

  /* 引擎把 argv 交给命令实现时**不含命令名本身**（`kubectl create x` 交给 create 的
     是 ['create','x']）。但同一个函数也可能从别的路径被调用（例如 CMDS.helm 内部
     自己再调一次），那时开头会多带一个命令名。为两种情形都能工作，统一在这里
     剥掉开头的命令名与子命令名 —— 剥不剥都不影响后面的位置参数解析。 */
  function stripHead(argv, names) {
    var a = argv.slice(0);
    while (a.length && names.indexOf(String(a[0])) !== -1) a = a.slice(1);
    return a;
  }

  function pad(s, n) {
    s = String(s === undefined || s === null ? '' : s);
    while (s.length < n) s += ' ';
    return s;
  }

  function padLeft(s, n) {
    s = String(s === undefined || s === null ? '' : s);
    while (s.length < n) s = ' ' + s;
    return s;
  }

  /* 真实的写操作回显之后都要跟一句"快照没变"，否则学员会以为真改了 */
  var STATE_NOTE = '（教学提示：本次会话的集群快照不会被真的改写 —— 上面的回显是真机上的输出，'
    + '刷新页面即回到初始状态。要练"改完再查"的闭环，请用 kubectl get/describe 对照 data 里的既有状态。）';

  function okWithNote(lines) {
    return ok(lines.concat(['', STATE_NOTE]));
  }

  /* 取一个长选项的值，支持 --k=v / --k v 两种写法；没有则返回 def */
  function opt(argv, names, def) {
    var list = typeof names === 'string' ? [names] : names;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      for (var j = 0; j < list.length; j++) {
        var n = list[j];
        if (a === n) return argv[i + 1] === undefined ? def : argv[i + 1];
        if (a.indexOf(n + '=') === 0) return a.slice(n.length + 1);
      }
    }
    return def;
  }

  /* 位置参数与选项**分开**返回，这是避免"资源名被当成选项值吃掉"的关键。
     valueOpts 里列的是"后面跟一个值"的选项（如 -n my-app、--image=nginx）。
     布尔选项（--overwrite、-it、--rm）不需要列。
     返回 { pos: [...], idx: {'--overwrite': true, '-n': 'my-app'}, flags: {...} } */
  function splitArgs(argv, valueOpts, skip) {
    var pos = [], idx = {}, all = {};
    var skipped = 0;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--') break;
      if (a.charAt(0) === '-' && a.length > 1) {
        var eq = a.indexOf('=');
        if (eq !== -1) {
          var k = a.slice(0, eq);
          idx[k] = a.slice(eq + 1);
          all[k] = idx[k];
        } else if (valueOpts.indexOf(a) !== -1) {
          var v = argv[i + 1] === undefined ? '' : String(argv[++i]);
          idx[a] = v;
          all[a] = v;
        } else {
          idx[a] = true;
          all[a] = true;
        }
        continue;
      }
      if (skip && pos.length === 0 && skip.indexOf(a) !== -1) continue;
      pos.push(a);
    }
    return { pos: pos, idx: idx, all: all };
  }

  /* 剥掉开头的子命令名（`kubectl patch deploy/web` 的 pos 里第一个是 'patch'）。
     只剥**开头连续出现**的，避免把同名的资源名误删。 */
  function dropSub(pos, names) {
    var i = 0;
    while (i < pos.length && names.indexOf(String(pos[i])) !== -1) i++;
    return pos.slice(i);
  }

  function idxVal(idx, names, def) {
    var list = typeof names === 'string' ? [names] : names;
    for (var i = 0; i < list.length; i++) if (idx[list[i]] !== undefined) return idx[list[i]];
    return def;
  }

  function idxHas(idx, names) {
    var list = typeof names === 'string' ? [names] : names;
    return list.some(function (n) { return idx[n] !== undefined; });
  }

  /* 通用选项表：各子命令共用的 -n / -o / --dry-run / --overwrite 等 */
  var COMMON_VALUE_OPTS = ['-n', '--namespace', '-o', '--output', '--dry-run', '--field-manager',
    '--subresource', '-l', '--selector', '--field-selector', '--sort-by', '--template',
    '--custom-columns', '--resource-version', '--timeout', '--as', '--as-group', '--context',
    '--kubeconfig', '--server', '--token', '--user', '--cluster', '--request-timeout'];

  /* 把一份值选项表和通用表合并 */
  function vopts(extra) {
    return COMMON_VALUE_OPTS.concat(extra || []);
  }

  function hasFlag(argv, names) {
    var list = typeof names === 'string' ? [names] : names;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      for (var j = 0; j < list.length; j++) {
        if (a === list[j] || a.indexOf(list[j] + '=') === 0) return true;
      }
    }
    return false;
  }

  /* 收集可重复出现的选项值（--from-literal a=b --from-literal c=d） */
  function optAll(argv, names) {
    var list = typeof names === 'string' ? [names] : names;
    var out = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      for (var j = 0; j < list.length; j++) {
        var n = list[j];
        if (a === n) { if (argv[i + 1] !== undefined) out.push(String(argv[i + 1])); break; }
        if (a.indexOf(n + '=') === 0) { out.push(a.slice(n.length + 1)); break; }
      }
    }
    return out;
  }

  /* 位置参数（跳过选项与它们的值）。
     注意：`-it` / `-ti` 这类组合短选项**不占值**，必须能认出来 ——
     否则 `kubectl exec -it my-pod -- bash` 会把 my-pod 当成 -it 的值吃掉。 */
  var NO_VALUE_SHORT = {
    '-it': 1, '-ti': 1, '-i': 1, '-t': 1, '-A': 1, '-w': 1, '-p': 1, '-a': 1, '-q': 1,
    '-itc': 1, '-itd': 1, '-itn': 1, '-itp': 1, '-its': 1, '-itk': 1
  };
  function positionals(argv, valueOpts) {
    var out = [];
    var voptsList = valueOpts || [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--') break;
      if (a.charAt(0) === '-' && a.length > 1) {
        if (a.indexOf('=') === -1 && voptsList.indexOf(a) !== -1 && !NO_VALUE_SHORT[a]) i++;
        continue;
      }
      out.push(a);
    }
    return out;
  }

  function nsOf(argv) {
    return opt(argv, ['-n', '--namespace'], NS_DEFAULT);
  }

  /* kubectl 的默认输出是 **stdout**；报错走 stderr 且退出码 1 */
  function notFound(kind, name) {
    return fail(['Error from server (NotFound): ' + kind + ' "' + name + '" not found']);
  }

  /* 资源简写 → 规范名。返回 null 表示这个资源类型在仿真集群里不存在 */
  var RES = {
    po: 'pods', pod: 'pods', pods: 'pods',
    deploy: 'deployments', deployment: 'deployments', deployments: 'deployments',
    svc: 'services', service: 'services', services: 'services',
    ns: 'namespaces', namespace: 'namespaces', namespaces: 'namespaces',
    no: 'nodes', node: 'nodes', nodes: 'nodes',
    cm: 'configmaps', configmap: 'configmaps', configmaps: 'configmaps',
    secret: 'secrets', secrets: 'secrets',
    sa: 'serviceaccounts', serviceaccount: 'serviceaccounts', serviceaccounts: 'serviceaccounts',
    job: 'jobs', jobs: 'jobs', cj: 'cronjobs', cronjob: 'cronjobs', cronjobs: 'cronjobs',
    pvc: 'persistentvolumeclaims', persistentvolumeclaim: 'persistentvolumeclaims', persistentvolumeclaims: 'persistentvolumeclaims',
    pv: 'persistentvolumes', persistentvolume: 'persistentvolumes', persistentvolumes: 'persistentvolumes',
    ingress: 'ingresses', ingresses: 'ingresses', ing: 'ingresses',
    sts: 'statefulsets', statefulset: 'statefulsets', statefulsets: 'statefulsets',
    ds: 'daemonsets', daemonset: 'daemonsets', daemonsets: 'daemonsets',
    ep: 'endpoints', endpoints: 'endpoints',
    hpa: 'horizontalpodautoscalers', horizontalpodautoscaler: 'horizontalpodautoscalers',
    pdb: 'poddisruptionbudgets', poddisruptionbudget: 'poddisruptionbudgets',
    netpol: 'networkpolicies', networkpolicy: 'networkpolicies', networkpolicies: 'networkpolicies',
    quota: 'resourcequotas', resourcequota: 'resourcequotas', resourcequotas: 'resourcequotas',
    sc: 'storageclasses', storageclass: 'storageclasses', storageclasses: 'storageclasses',
    role: 'roles', roles: 'roles', rolebinding: 'rolebindings', rolebindings: 'rolebindings',
    clusterrole: 'clusterroles', clusterroles: 'clusterroles',
    clusterrolebinding: 'clusterrolebindings', clusterrolebindings: 'clusterrolebindings',
    endpointslices: 'endpointslices', endpointslice: 'endpointslices'
  };

  /* 写 `kubectl label pod/web-x` 这种带斜杠的写法时拆出 kind 与 name */
  function splitKind(arg) {
    var m = String(arg || '').match(/^([a-zA-Z.]+)\/(.+)$/);
    if (m) return { kind: m[1], name: m[2] };
    return { kind: null, name: String(arg || '') };
  }

  function canonical(kind) {
    return RES[String(kind || '').toLowerCase()] || null;
  }

  /* 真机里资源类型不存在时是这句话（退出码 1） */
  function noSuchResource(kind, group) {
    return fail(['error: the server doesn\'t have a resource type "' + kind + '"'
      + (group ? ' in "' + group + '"' : '')]);
  }

  /* ======================================================================
     1. 仿真集群里"快照没收录但示例要用"的资源
        （Deployment/Service/Pod 等一律复用 data/termfs.js 的 k8s 数据，
          绝不另造一套互相矛盾的集群）
     ====================================================================== */

  function b64utf8(s) {
    var bytes = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    var TAB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    for (var j = 0; j < bytes.length; j += 3) {
      var b0 = bytes[j], b1 = bytes[j + 1], b2 = bytes[j + 2];
      out += TAB.charAt(b0 >> 2);
      out += TAB.charAt(((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4));
      out += b1 === undefined ? '=' : TAB.charAt(((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6));
      out += b2 === undefined ? '=' : TAB.charAt(b2 & 63);
    }
    return out;
  }

  /* 确定性哈希：同一个种子永远得到同一串十六进制（当 uid / 版本号用） */
  function seedHex(seed, len) {
    var h = 2166136261, out = '';
    for (var round = 0; round < 6; round++) {
      for (var i = 0; i < String(seed).length; i++) {
        h ^= String(seed).charCodeAt(i) + round * 17 + i;
        h = (h * 16777619) >>> 0;
      }
      out += ('0000000' + h.toString(16)).slice(-8);
    }
    return out.slice(0, len || 32);
  }

  var SECRETS = [
    {
      ns: 'my-app', name: 'db-secret', type: 'Opaque',
      data: { username: b64utf8('app'), password: b64utf8('MyP@ssw0rd') }
    },
    {
      ns: 'my-app', name: 'tls-secret', type: 'kubernetes.io/tls',
      data: {
        'tls.crt': b64utf8('-----BEGIN CERTIFICATE-----\n（教学环境用占位文本代替真实证书）\n-----END CERTIFICATE-----\n'),
        'tls.key': b64utf8('-----BEGIN PRIVATE KEY-----\n（教学环境用占位文本代替真实私钥）\n-----END PRIVATE KEY-----\n')
      }
    },
    {
      ns: 'my-app', name: 'default-secret', type: 'kubernetes.io/dockerconfigjson',
      data: { '.dockerconfigjson': b64utf8('{"auths":{"swr.cn-north-4.myhuaweicloud.com":{"auth":"（占位，非真实凭据）"}}}') }
    },
    {
      ns: 'default', name: 'my-secret', type: 'Opaque',
      data: { password: b64utf8('mysql-root-password'), username: b64utf8('root') }
    },
    {
      ns: 'kube-system', name: 'cce-default-secret', type: 'kubernetes.io/dockerconfigjson',
      data: { '.dockerconfigjson': b64utf8('{"auths":{"swr.cn-north-4.myhuaweicloud.com":{"auth":"（占位，非真实凭据）"}}}') }
    }
  ];

  var CONFIGMAPS = [
    { ns: 'my-app', name: 'app-config', data: { LOG_LEVEL: 'info', APP_MODE: 'prod' }, age: '12d' },
    { ns: 'my-app', name: 'nginx-conf', data: { 'app.conf': 'server {\n    listen 8080;\n}\n' }, age: '12d' },
    { ns: 'kube-system', name: 'coredns', data: { Corefile: '.:53 {\n    kubernetes cluster.local\n}\n' }, age: '42d' },
    { ns: 'monitoring', name: 'prometheus-config', data: { 'prometheus.yml': 'global:\n  scrape_interval: 15s\n' }, age: '9d' }
  ];

  var SERVICEACCOUNTS = [
    { ns: 'my-app', name: 'default', age: '30d' },
    { ns: 'my-app', name: 'app-sa', age: '12d' },
    { ns: 'default', name: 'default', age: '42d' },
    { ns: 'kube-system', name: 'coredns', age: '42d' }
  ];

  var ROLES = {
    'my-app/pod-reader': {
      ns: 'my-app', name: 'pod-reader', age: '12d',
      rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list', 'watch'] }]
    }
  };

  var ROLEBINDINGS = {
    'my-app/pod-reader': {
      ns: 'my-app', name: 'pod-reader', age: '12d',
      roleRef: 'Role/pod-reader',
      subjects: ['ServiceAccount/my-app/app-sa']
    }
  };

  var CLUSTERROLES = {
    'cluster-admin': { name: 'cluster-admin', age: '42d', rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }] },
    'view': {
      name: 'view', age: '42d',
      rules: [
        { apiGroups: [''], resources: ['configmaps', 'endpoints', 'pods', 'services'], verbs: ['get', 'list', 'watch'] },
        { apiGroups: ['apps'], resources: ['deployments', 'statefulsets', 'daemonsets', 'replicasets'], verbs: ['get', 'list', 'watch'] },
        { apiGroups: ['networking.k8s.io'], resources: ['ingresses'], verbs: ['get', 'list', 'watch'] }
      ]
    },
    'system:node': { name: 'system:node', age: '42d', rules: [{ apiGroups: [''], resources: ['nodes'], verbs: ['get', 'list', 'watch', 'patch'] }] },
    'node-viewer': { name: 'node-viewer', age: '12d', rules: [{ apiGroups: [''], resources: ['nodes'], verbs: ['get', 'list'] }] }
  };

  var CLUSTERROLEBINDINGS = {
    'node-viewer': { name: 'node-viewer', age: '12d', roleRef: 'ClusterRole/node-viewer', subjects: ['ServiceAccount/my-app/app-sa'] },
    'cluster-admin': { name: 'cluster-admin', age: '42d', roleRef: 'ClusterRole/cluster-admin', subjects: ['Group/system:masters'] }
  };

  var JOBS = [
    { ns: 'my-app', name: 'db-migrate', completions: '1/1', duration: '18s', age: '2d' },
    { ns: 'my-app', name: 'batch-job', completions: '0/1', duration: '4m', age: '4m' }
  ];

  var CRONJOBS = [
    { ns: 'my-app', name: 'backup', schedule: '0 3 * * *', suspend: 'False', active: '0', last: '8h', age: '30d' }
  ];

  var INGRESSES = [
    {
      ns: 'my-app', name: 'web', class: 'nginx', hosts: 'web.example.com', address: '121.36.44.17', ports: '80', age: '30d',
      annotations: { 'nginx.ingress.kubernetes.io/rewrite-target': '/', 'kubernetes.io/elb.id': '8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88' },
      backend: 'web:80'
    }
  ];

  var HPAS = [{ ns: 'my-app', name: 'web-hpa', ref: 'Deployment/web', targets: 'cpu: 60%/78%', min: 2, max: 10, replicas: 2, age: '6d' }];

  var PDBS = [{ ns: 'my-app', name: 'web-pdb', minAvailable: '1', maxUnavailable: '-', allowed: 1, desired: 2, age: '6d' }];

  var NETPOLS = [
    { ns: 'my-app', name: 'allow-web', podSelector: 'app=web', types: ['Ingress'], age: '20d' },
    { ns: 'my-app', name: 'deny-all-egress', podSelector: '<none>', types: ['Egress'], age: '20d' }
  ];

  var QUOTAS = [{ ns: 'my-app', name: 'app-quota', age: '30d' }];

  var STATEFULSETS = [{ ns: 'default', name: 'mysql', ready: '1/1', age: '30d', image: 'mysql:8.0' }];

  var DAEMONSETS = [
    { ns: 'kube-system', name: 'everest-csi-driver', desired: 3, current: 3, ready: 3, uptodate: 3, available: 3, nodeSelector: '<none>', age: '42d' },
    { ns: 'kube-system', name: 'cce-policy-agent', desired: 3, current: 3, ready: 3, uptodate: 3, available: 3, nodeSelector: 'kubernetes.io/os=linux', age: '42d' }
  ];

  var PVS = [
    { name: 'pvc-6f8a2c1b-9d4e-4a71', capacity: '100Gi', accessModes: 'RWO', reclaim: 'Delete', status: 'Bound', claim: 'my-app/app-data', sc: 'csi-disk', age: '30d' },
    { name: 'pvc-2b1c9d4e-71a3-4f88', capacity: '500Gi', accessModes: 'RWO', reclaim: 'Delete', status: 'Bound', claim: 'default/mysql-data', sc: 'csi-disk-ssd', age: '30d' }
  ];

  var STORAGECLASSES = [
    { name: 'csi-disk', provisioner: 'everest-csi-provisioner', reclaim: 'Delete', binding: 'Immediate', expand: 'true', age: '42d' },
    { name: 'csi-disk-ssd', provisioner: 'everest-csi-provisioner', reclaim: 'Delete', binding: 'Immediate', expand: 'true', age: '42d' },
    { name: 'csi-nas', provisioner: 'everest-csi-provisioner', reclaim: 'Delete', binding: 'Immediate', expand: 'true', age: '42d' },
    { name: 'csi-obs', provisioner: 'everest-csi-provisioner', reclaim: 'Retain', binding: 'Immediate', expand: 'false', age: '42d' }
  ];

  var ENDPOINTSLICES = [
    { ns: 'my-app', name: 'web-abc12', svc: 'web', addressType: 'IPv4', ports: '8080', endpoints: '172.20.1.14,172.20.2.9', age: '30d' },
    { ns: 'my-app', name: 'worker-def34', svc: 'worker', addressType: 'IPv4', ports: '8081', endpoints: '<unset>', age: '26m' }
  ];

  var INGRESSCLASSES = [{ name: 'nginx', controller: 'k8s.io/ingress-nginx', age: '42d' }];

  var NODE_LABELS = {
    '10.0.1.23': {
      'beta.kubernetes.io/arch': 'amd64', 'beta.kubernetes.io/os': 'linux',
      'kubernetes.io/arch': 'amd64', 'kubernetes.io/hostname': '10.0.1.23', 'kubernetes.io/os': 'linux',
      'node.kubernetes.io/instance-type': 'c6.large.2', 'topology.kubernetes.io/zone': 'cn-north-4a',
      'node-role.kubernetes.io/worker': ''
    },
    '10.0.1.24': {
      'beta.kubernetes.io/arch': 'amd64', 'beta.kubernetes.io/os': 'linux',
      'kubernetes.io/arch': 'amd64', 'kubernetes.io/hostname': '10.0.1.24', 'kubernetes.io/os': 'linux',
      'node.kubernetes.io/instance-type': 'c6.large.2', 'topology.kubernetes.io/zone': 'cn-north-4b',
      'node-role.kubernetes.io/worker': ''
    },
    '10.0.1.11': {
      'beta.kubernetes.io/arch': 'amd64', 'beta.kubernetes.io/os': 'linux',
      'kubernetes.io/arch': 'amd64', 'kubernetes.io/hostname': '10.0.1.11', 'kubernetes.io/os': 'linux',
      'node-role.kubernetes.io/control-plane': ''
    }
  };

  /* 节点污点：控制面自带 NoSchedule（与 data/termfs.js 的
     "1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }" 一致） */
  var NODE_TAINTS = {
    '10.0.1.11': [{ key: 'node-role.kubernetes.io/control-plane', value: '', effect: 'NoSchedule' }],
    '10.0.1.23': [],
    '10.0.1.24': []
  };

  /* Pod 的标签（describe pod 里也是这几个） */
  var POD_LABELS = {
    'web-7d9c4b8f5-2xk9p': { app: 'web', env: 'prod', 'pod-template-hash': '7d9c4b8f5' },
    'web-7d9c4b8f5-9q4zw': { app: 'web', env: 'prod', 'pod-template-hash': '7d9c4b8f5' },
    'worker-6b8f7c9d4-m2vqt': { app: 'worker', env: 'prod', 'pod-template-hash': '6b8f7c9d4' },
    'batch-job-28471920-x7klm': { 'batch.kubernetes.io/controller-uid': 'a1b2c3d4-5e6f-4a71-8b92-c3d4e5f6a701', job: 'batch-job' },
    'mysql-0': { app: 'mysql', 'controller-revision-hash': 'mysql-7c9f8b6d54', 'statefulset.kubernetes.io/pod-name': 'mysql-0' }
  };

  /* 服务账号的镜像拉取凭据：很多环境挂在 default 上（示例里专门要查这一项） */
  var SA_IMAGE_PULL_SECRETS = { 'my-app/default': ['default-secret'] };

  function podByName(name) {
    var list = K.pods || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    /* my-pod：内容里的 exec / cp / debug / port-forward 示例都用它当"随手起的一个 Pod"，
       但 data/termfs.js 的快照里没有它。为让这些示例真的跑出结果，这里补一条**与
       既有剧情一致**的记录（同一个命名空间、同一批节点、同一个 SWAP 镜像仓库），
       绝不另造一套互相矛盾的集群。 */
    if (name === 'my-pod') return MY_POD;
    return null;
  }

  var MY_POD = {
    ns: 'my-app', name: 'my-pod', ready: '1/1', status: 'Running', restarts: 0, age: '3d',
    ip: '172.20.1.31', node: '10.0.1.24',
    images: 'swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3',
    containers: ['app', 'sidecar', 'istio-proxy'],
    logs: [
      '2024-03-18 09:38:33.902  INFO 1 --- [main] c.e.OrdersApplication : Starting OrdersApplication v1.2.3',
      '2024-03-18 09:38:42.113  INFO 1 --- [main] c.e.OrdersApplication : Started OrdersApplication in 8.42 seconds'
    ],
    events: [
      { type: 'Normal', reason: 'Scheduled', msg: 'Successfully assigned my-app/my-pod to 10.0.1.24' },
      { type: 'Normal', reason: 'Pulled', msg: 'Container image "swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3" already present on machine' },
      { type: 'Normal', reason: 'Started', msg: 'Started container app' }
    ]
  };

  function deployByName(ns, name) {
    var list = K.deployments || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name && (!ns || list[i].ns === ns)) return list[i];
    return null;
  }

  function svcByName(ns, name) {
    var list = K.services || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name && (!ns || list[i].ns === ns)) return list[i];
    return null;
  }

  function nodeByName(name) {
    var list = K.nodeList || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /* 资源是否真的存在：写操作类命令都先过这一关，避免"对着不存在的资源报成功" */
  function resourceExists(kind, name, ns) {
    var k = canonical(kind) || kind;
    if (k === 'pods') return !!podByName(name);
    if (k === 'deployments') return !!deployByName(ns, name);
    if (k === 'services') return !!svcByName(ns, name);
    if (k === 'nodes') return !!nodeByName(name);
    if (k === 'namespaces') return (K.namespaces || []).indexOf(name) !== -1;
    if (k === 'secrets') return !!find(SECRETS, ns, name);
    if (k === 'configmaps') return !!find(CONFIGMAPS, ns, name);
    if (k === 'serviceaccounts') return !!find(SERVICEACCOUNTS, ns, name);
    if (k === 'jobs') return !!find(JOBS, ns, name);
    if (k === 'cronjobs') return !!find(CRONJOBS, ns, name);
    if (k === 'ingresses') return !!find(INGRESSES, ns, name);
    if (k === 'persistentvolumeclaims') return !!find(K.pvcs || [], ns, name);
    if (k === 'statefulsets') return !!find(STATEFULSETS, ns, name);
    if (k === 'daemonsets') return !!find(DAEMONSETS, ns, name);
    if (k === 'endpoints') return !!find(K.endpoints || [], ns, name);
    if (k === 'endpointslices') return !!find(ENDPOINTSLICES, ns, name);
    if (k === 'roles') return !!ROLES[ns + '/' + name];
    if (k === 'rolebindings') return !!ROLEBINDINGS[ns + '/' + name];
    if (k === 'clusterroles') return !!CLUSTERROLES[name];
    if (k === 'clusterrolebindings') return !!CLUSTERROLEBINDINGS[name];
    if (k === 'poddisruptionbudgets') return !!find(PDBS, ns, name);
    if (k === 'networkpolicies') return !!find(NETPOLS, ns, name);
    if (k === 'horizontalpodautoscalers') return !!find(HPAS, ns, name);
    if (k === 'resourcequotas') return !!find(QUOTAS, ns, name);
    if (k === 'storageclasses') return !!find(STORAGECLASSES, null, name);
    if (k === 'persistentvolumes') return !!find(PVS, null, name);
    if (k === 'ingressclasses') return !!find(INGRESSCLASSES, null, name);
    return false;
  }

  function find(list, ns, name) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].name !== name) continue;
      if (ns === null || list[i].ns === ns) return list[i];
    }
    return null;
  }

  /* 资源类型在仿真里存不存在（决定报 NotFound 还是 "no resource type"） */
  var KNOWN_KINDS = {
    pods: 1, deployments: 1, services: 1, nodes: 1, namespaces: 1, secrets: 1, configmaps: 1,
    serviceaccounts: 1, jobs: 1, cronjobs: 1, ingresses: 1, persistentvolumeclaims: 1,
    statefulsets: 1, daemonsets: 1, endpoints: 1, endpointslices: 1, roles: 1, rolebindings: 1,
    clusterroles: 1, clusterrolebindings: 1, poddisruptionbudgets: 1, networkpolicies: 1,
    horizontalpodautoscalers: 1, resourcequotas: 1, storageclasses: 1, persistentvolumes: 1,
    ingressclasses: 1
  };

  /* ======================================================================
     2. YAML / JSON 片段生成
     ====================================================================== */

  /* 值需要加引号的情况：布尔、数字、含特殊字符、含中文、空串 */
  function yamlScalar(v) {
    var s = String(v);
    if (s === '') return "''";
    if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return "'" + s + "'";
    if (/^[+-]?[0-9.]+$/.test(s)) return "'" + s + "'";
    if (/[:#{}\[\],&*?|<>=!%@`"'\n\t]/.test(s) || s.charAt(0) === ' ' || s.charAt(s.length - 1) === ' ') {
      return "'" + s.replace(/'/g, "''") + "'";
    }
    if (/[^\x00-\x7F]/.test(s)) return "'" + s.replace(/'/g, "''") + "'";
    return s;
  }

  function yamlMap(lines, indent, obj) {
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === undefined || v === null) return;
      if (typeof v === 'object') {
        if (!Object.keys(v).length) return;
        lines.push(indent + k + ':');
        yamlMap(lines, indent + '  ', v);
      } else {
        lines.push(indent + k + ': ' + yamlScalar(v));
      }
    });
    return lines;
  }

  function metaBlock(name, ns, extraLabels) {
    var lines = [];
    lines.push('metadata:');
    lines.push('  name: ' + name);
    if (ns) lines.push('  namespace: ' + ns);
    lines.push('  labels:');
    lines.push('    app: ' + name);
    if (extraLabels) {
      Object.keys(extraLabels).forEach(function (k) { lines.push('    ' + k + ': ' + yamlScalar(extraLabels[k])); });
    }
    return lines;
  }

  /* 各资源的 --dry-run=client -o yaml 输出（字段名与真机一致） */
  function manifestOf(kind, name, ns, o) {
    var L = [];
    if (kind === 'namespace') {
      L.push('apiVersion: v1', 'kind: Namespace');
      L.push('metadata:', '  name: ' + name, '  labels:', '    kubernetes.io/metadata.name: ' + name);
      return L;
    }
    if (kind === 'deployment') {
      var image = o.image || 'nginx';
      var replicas = o.replicas === undefined ? 1 : o.replicas;
      L.push('apiVersion: apps/v1', 'kind: Deployment');
      L = L.concat(metaBlock(name, ns, null));
      L.push('spec:');
      L.push('  replicas: ' + replicas);
      L.push('  selector:');
      L.push('    matchLabels:');
      L.push('      app: ' + name);
      L.push('  strategy:');
      L.push('    type: RollingUpdate');
      L.push('    rollingUpdate:');
      L.push('      maxSurge: 25%');
      L.push('      maxUnavailable: 25%');
      L.push('  template:');
      L.push('    metadata:');
      L.push('      labels:');
      L.push('        app: ' + name);
      L.push('    spec:');
      L.push('      containers:');
      L.push('      - name: ' + name);
      L.push('        image: ' + image);
      L.push('        resources: {}');
      L.push('      restartPolicy: Always');
      L.push('status: {}');
      return L;
    }
    if (kind === 'job') {
      L.push('apiVersion: batch/v1', 'kind: Job');
      L = L.concat(metaBlock(name, ns, null));
      L.push('spec:');
      if (o.fromCronJob) {
        L.push('  template:');
        L.push('    metadata:');
        L.push('      labels:');
        L.push('        job: ' + o.fromCronJob);
        L.push('    spec:');
        L.push('      containers:');
        L.push('      - command:');
        L.push('        - /bin/sh');
        L.push('        - -c');
        L.push('        - mysqldump --all-databases | gzip > /backup/db-$(date +%F).sql.gz');
        L.push('        image: ' + (o.image || 'mysql:8.0'));
        L.push('        name: ' + o.fromCronJob);
        L.push('      restartPolicy: OnFailure');
      } else {
        L.push('  template:');
        L.push('    metadata:');
        L.push('      labels:');
        L.push('        app: ' + name);
        L.push('    spec:');
        L.push('      containers:');
        L.push('      - image: ' + (o.image || 'busybox'));
        L.push('        name: ' + name);
        L.push('      restartPolicy: Never');
      }
      return L;
    }
    if (kind === 'secret') {
      L.push('apiVersion: v1', 'kind: Secret');
      L.push('metadata:');
      L.push('  name: ' + name);
      if (ns) L.push('  namespace: ' + ns);
      L.push('type: ' + o.type);
      if (Object.keys(o.data).length) {
        L.push('data:');
        Object.keys(o.data).forEach(function (k) { L.push('  ' + k + ': ' + o.data[k]); });
      } else {
        L.push('data: {}');
      }
      return L;
    }
    if (kind === 'configmap') {
      L.push('apiVersion: v1', 'kind: ConfigMap');
      L.push('metadata:');
      L.push('  name: ' + name);
      if (ns) L.push('  namespace: ' + ns);
      if (Object.keys(o.data).length) {
        L.push('data:');
        Object.keys(o.data).forEach(function (k) {
          var v = String(o.data[k]);
          L.push('  ' + k + ': ' + (v.indexOf('\n') === -1 ? yamlScalar(v) : '|'));
          if (v.indexOf('\n') !== -1) v.split('\n').forEach(function (ln) { if (ln !== '') L.push('    ' + ln); });
        });
      } else {
        L.push('data: {}');
      }
      return L;
    }
    if (kind === 'serviceaccount') {
      L.push('apiVersion: v1', 'kind: ServiceAccount');
      L.push('metadata:');
      L.push('  name: ' + name);
      if (ns) L.push('  namespace: ' + ns);
      return L;
    }
    if (kind === 'role') {
      L.push('apiVersion: rbac.authorization.k8s.io/v1', 'kind: Role');
      L.push('metadata:');
      L.push('  name: ' + name);
      if (ns) L.push('  namespace: ' + ns);
      L.push('rules:');
      L.push('- apiGroups:');
      L.push('  - ""');
      L.push('  resources:');
      (o.resources || []).forEach(function (r) { L.push('  - ' + r); });
      L.push('  verbs:');
      (o.verbs || []).forEach(function (v) { L.push('  - ' + v); });
      return L;
    }
    if (kind === 'rolebinding') {
      L.push('apiVersion: rbac.authorization.k8s.io/v1', 'kind: RoleBinding');
      L.push('metadata:');
      L.push('  name: ' + name);
      if (ns) L.push('  namespace: ' + ns);
      L.push('roleRef:');
      L.push('  apiGroup: rbac.authorization.k8s.io');
      L.push('  kind: Role');
      L.push('  name: ' + (o.role || name));
      L.push('subjects:');
      L.push('- kind: ServiceAccount');
      L.push('  name: ' + (o.saName || 'default'));
      L.push('  namespace: ' + (o.saNs || ns));
      return L;
    }
    if (kind === 'service') {
      L.push('apiVersion: v1', 'kind: Service');
      L = L.concat(metaBlock(name, ns, null));
      L.push('spec:');
      L.push('  type: ' + (o.type || 'ClusterIP'));
      L.push('  ports:');
      L.push('  - port: ' + (o.port || 80));
      L.push('    protocol: TCP');
      L.push('    targetPort: ' + (o.targetPort || 80));
      L.push('  selector:');
      L.push('    app: ' + (o.selectorApp || name));
      return L;
    }
    L.push('# 教学环境未实现该类型的清单渲染');
    return L;
  }

  /* ======================================================================
     3. kubectl 写操作类子命令
     ====================================================================== */

  /* ---------- kubectl create ---------- */
  function kubectlCreate(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","create"]);
    var P = splitArgs(rest, vopts(['--image', '--replicas', '--from', '--from-literal', '--from-file',
      '--from-env-file', '--type', '--verb', '--resource', '--role', '--serviceaccount', '--duration',
      '--save-config', '--port', '--target-port']));
    var pos = P.pos;
    var kind = pos[0];
    var dryRun = hasFlag(rest, '--dry-run');
    var output = idxVal(P.idx, ['-o', '--output'], null);
    var ns = idxVal(P.idx, ['-n', '--namespace'], NS_DEFAULT);
    /* pos[0] 是资源类型，之后才是名字 —— 但 `create job --from=... backup-manual`
       （选项在名字前面）也合法，所以名字统一按"类型之后的第一个位置参数"取 */
    var name = pos.length > 1 ? pos[1] : null;

    function emit(kindName, objKind, lines, extra) {
      if (output === 'yaml' || output === 'json') {
        return ok(lines.concat(extra || []));
      }
      return okWithNote([kindName + '/' + name + (dryRun ? ' created (dry run)' : ' created')]);
    }

    if (!kind) {
      return fail(['error: must specify a resource type to create',
        'See \'kubectl create -h\' for more information.']);
    }

    if (kind === 'namespace' || kind === 'ns') {
      if (!name) return fail(['error: exactly one NAME is required, got 0']);
      if (!dryRun && (K.namespaces || []).indexOf(name) !== -1) {
        return fail(['Error from server (AlreadyExists): namespaces "' + name + '" already exists']);
      }
      return emit('namespace', 'Namespace', manifestOf('namespace', name, null, {}));
    }

    if (kind === 'deploy' || kind === 'deployment') {
      var image = opt(rest, '--image', null);
      if (!image) {
        return fail(['error: required flag(s) "image" not set']);
      }
      if (!name) return fail(['error: exactly one NAME is required, got 0']);
      var reps = opt(rest, '--replicas', '1');
      return emit('deployment.apps', 'Deployment',
        manifestOf('deployment', name, ns, { image: image, replicas: reps }));
    }

    if (kind === 'job') {
      var fromCj = opt(rest, '--from', null);
      var jImage = opt(rest, '--image', null);
      if (!name) return fail(['error: exactly one NAME is required, got 0']);
      if (fromCj && String(fromCj).indexOf('cronjob/') !== 0) {
        return fail(['error: unknown --from type: ' + fromCj]);
      }
      if (!fromCj && !jImage) {
        return fail(['error: either --from or --image must be specified']);
      }
      if (fromCj && !resourceExists('cronjobs', String(fromCj).split('/')[1], ns)) {
        return fail(['Error from server (NotFound): cronjobs.batch "' + String(fromCj).split('/')[1] + '" not found']);
      }
      return emit('job.batch', 'Job',
        manifestOf('job', name, ns, { image: jImage, fromCronJob: fromCj ? String(fromCj).split('/')[1] : null }));
    }

    if (kind === 'secret') {
      var subKind = pos[1] === 'generic' || pos[1] === 'tls' || pos[1] === 'docker-registry' ? pos[1] : 'generic';
      var sName = subKind === 'generic' ? (pos[2] || name) : name;      if (!sName) return fail(['error: exactly one NAME is required, got 0']);
      var lits = optAll(rest, '--from-literal');
      var files = optAll(rest, '--from-file');
      var envFile = opt(rest, '--from-env-file', null);
      var secType = opt(rest, '--type', subKind === 'tls' ? 'kubernetes.io/tls' : 'Opaque');
      if (!lits.length && !files.length && !envFile) {
        return fail(['error: at least one of --from-file, --from-literal, --from-env-file or --from-env-file must be specified']);
      }
      var data = {};
      lits.forEach(function (kv) {
        var eq = String(kv).indexOf('=');
        if (eq === -1) data[kv] = b64utf8('');
        else data[String(kv).slice(0, eq)] = b64utf8(String(kv).slice(eq + 1));
      });
      files.forEach(function (f) {
        var s = String(f);
        var eq = s.indexOf('=');
        var key = eq === -1 ? s.replace(/^.*\//, '') : s.slice(0, eq);
        var path = eq === -1 ? s : s.slice(eq + 1);
        var r = U.readFileOrErr(ctx, path);
        if (r.err) {
          data[key] = b64utf8('<文件不存在：' + path + '>');
          return;
        }
        data[key] = b64utf8(r.content);
      });
      var missing = null;
      files.forEach(function (f) {
        var s = String(f);
        var eq = s.indexOf('=');
        var path = eq === -1 ? s : s.slice(eq + 1);
        if (U.readFileOrErr(ctx, path).err) missing = path;
      });
      /* 真机上 --from-file 指向不存在的文件会直接报错，这里也必须报，不能静默塞占位内容 */
      if (missing) {
        return fail(['error: failed to create secret: error reading file "' + missing + '": open ' + missing + ': no such file or directory']);
      }
      if (secType === 'kubernetes.io/tls') {
        if (!data['tls.crt'] || !data['tls.key']) {
          return fail(['error: failed to create secret: key "tls.crt" or "tls.key" not found']);
        }
      }
      if (!dryRun && find(SECRETS, ns, sName)) {
        return fail(['Error from server (AlreadyExists): secrets "' + sName + '" already exists']);
      }
      var sNameOut = sName;
      if (output === 'yaml' || output === 'json') {
        return ok(manifestOf('secret', sNameOut, ns, { type: secType, data: data }));
      }
      return okWithNote(['secret/' + sNameOut + (dryRun ? ' created (dry run)' : ' created')]);
    }

    if (kind === 'configmap' || kind === 'cm') {
      if (!name) return fail(['error: exactly one NAME is required, got 0']);
      var cLits = optAll(rest, '--from-literal');
      var cFiles = optAll(rest, '--from-file');
      var cEnv = opt(rest, '--from-env-file', null);
      if (!cLits.length && !cFiles.length && !cEnv) {
        return fail(['error: at least one of --from-file, --from-literal or --from-env-file must be specified']);
      }
      var cData = {};
      cLits.forEach(function (kv) {
        var eq = String(kv).indexOf('=');
        if (eq === -1) cData[kv] = '';
        else cData[String(kv).slice(0, eq)] = String(kv).slice(eq + 1);
      });
      var cMissing = null;
      cFiles.forEach(function (f) {
        var s = String(f);
        var eq = s.indexOf('=');
        var path = eq === -1 ? s : s.slice(eq + 1);
        var abs = U.resolvePath(ctx.cwd, path);
        var node = U.findNode(ctx.root, abs);
        if (node && node.type === 'dir') {
          /* --from-file 给目录：一层，不递归 */
          U.childrenSorted(node).forEach(function (n) {
            var ch = node.children[n];
            if (ch.type !== 'file') return;
            cData[n] = String(ch.content || '');
          });
          return;
        }
        var r = U.readFileOrErr(ctx, path);
        if (r.err) { cMissing = path; return; }
        cData[eq === -1 ? String(path).replace(/^.*\//, '') : s.slice(0, eq)] = r.content;
      });
      if (cMissing) {
        return fail(['error: failed to create configmap: error reading file "' + cMissing + '": open ' + cMissing + ': no such file or directory']);
      }
      if (!dryRun && find(CONFIGMAPS, ns, name)) {
        return fail(['Error from server (AlreadyExists): configmaps "' + name + '" already exists']);
      }
      if (output === 'yaml' || output === 'json') {
        return ok(manifestOf('configmap', name, ns, { data: cData }));
      }
      return okWithNote(['configmap/' + name + (dryRun ? ' created (dry run)' : ' created')]);
    }

    if (kind === 'serviceaccount' || kind === 'sa') {
      if (!name) return fail(['error: exactly one NAME is required, got 0']);
      if (!dryRun && find(SERVICEACCOUNTS, ns, name)) {
        return fail(['Error from server (AlreadyExists): serviceaccounts "' + name + '" already exists']);
      }
      if (output === 'yaml' || output === 'json') return ok(manifestOf('serviceaccount', name, ns, {}));
      return okWithNote(['serviceaccount/' + name + (dryRun ? ' created (dry run)' : ' created')]);
    }

    if (kind === 'role') {
      if (!name) return fail(['error: exactly one NAME is required, got 0']);
      var verbs = opt(rest, '--verb', null);
      var resources = opt(rest, '--resource', null);
      if (!verbs) return fail(['error: required flag(s) "verb" not set']);
      if (!resources) return fail(['error: required flag(s) "resource" not set']);
      var o2 = { verbs: String(verbs).split(','), resources: String(resources).split(',') };
      if (output === 'yaml' || output === 'json') return ok(manifestOf('role', name, ns, o2));
      return okWithNote(['role.rbac.authorization.k8s.io/' + name + (dryRun ? ' created (dry run)' : ' created')]);
    }

    if (kind === 'rolebinding') {
      if (!name) return fail(['error: exactly one NAME is required, got 0']);
      var roleRef = opt(rest, '--role', null);
      var saRef = opt(rest, '--serviceaccount', null);
      if (!roleRef) return fail(['error: required flag(s) "role" not set']);
      if (!saRef) return fail(['error: required flag(s) "serviceaccount" not set']);
      var saNs = String(saRef).indexOf(':') !== -1 ? String(saRef).split(':')[0] : ns;
      var saName = String(saRef).indexOf(':') !== -1 ? String(saRef).split(':')[1] : String(saRef);
      var o3 = { role: roleRef, saName: saName, saNs: saNs };
      if (output === 'yaml' || output === 'json') return ok(manifestOf('rolebinding', name, ns, o3));
      return okWithNote(['rolebinding.rbac.authorization.k8s.io/' + name + (dryRun ? ' created (dry run)' : ' created')]);
    }

    if (kind === 'token') {
      if (!name) return fail(['error: exactly one NAME is required, got 0']);
      if (!resourceExists('serviceaccounts', name, ns)) {
        return fail(['Error from server (NotFound): serviceaccounts "' + name + '" not found']);
      }
      var dur = opt(rest, '--duration', '1h');
      var m = String(dur).match(/^(\d+)([smh])$/);
      if (!m || Number(m[1]) === 0) {
        return fail(['error: invalid duration "' + dur + '": time: invalid duration "' + dur + '"']);
      }
      var hours = m[2] === 'h' ? Number(m[1]) : (m[2] === 'm' ? Number(m[1]) / 60 : Number(m[1]) / 3600);
      if (hours > 24) {
        return fail(['Error from server (BadRequest): invalid expiration seconds: '
          + Math.round(hours * 3600) + ': the expiration time cannot be longer than 24h']);
      }
      /* 令牌是"演示用假令牌"：真令牌等同于该 SA 的身份，教学环境绝不会生成可用的凭据 */
      var header = b64utf8('{"alg":"RS256","kid":"simulated"}').replace(/=+$/, '');
      var exp = 1709251200 + Math.round(hours * 3600);
      var payload = b64utf8('{"aud":["https://kubernetes.default.svc"],'
        + '"exp":' + exp + ',"iat":1709251200,'
        + '"iss":"https://10.0.1.11:5443",'
        + '"kubernetes.io":{"namespace":"' + ns + '","serviceaccount":{"name":"' + name + '","uid":"'
        + seedHex(ns + '/' + name, 32) + '"}},'
        + '"sub":"system:serviceaccount:' + ns + ':' + name + '"}').replace(/=+$/, '');
      var sig = seedHex('sig-' + ns + '/' + name, 64);
      var token = header + '.' + payload + '.' + sig;
      if (output === 'yaml' || output === 'json') {
        return ok([
          'apiVersion: authentication.k8s.io/v1',
          'kind: TokenRequest',
          'metadata:',
          '  creationTimestamp: null',
          'spec:',
          '  expirationSeconds: ' + Math.round(hours * 3600),
          'status:',
          '  expirationTimestamp: "2024-03-18T' + (hours >= 1 ? '10' : '09') + ':5' + (hours >= 1 ? '9' : '0') + ':00Z"',
          '  token: ' + token
        ]);
      }
      return ok([token]);
    }

    return fail(['error: unknown command "create ' + kind + '" for "kubectl"']);
  }

  /* ---------- kubectl run ---------- */
  function kubectlRun(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","run"]);
    var name = null;
    for (var i = 0; i < rest.length; i++) {
      if (String(rest[i]).charAt(0) !== '-') { name = rest[i]; break; }
    }
    var image = opt(rest, '--image', null);
    var ns = nsOf(rest);
    if (!name) return fail(['error: NAME is required for run']);
    if (!image) return fail(['error: --image is required for run']);
    if (/[A-Z_]/.test(name)) {
      return fail(['Error from server (Invalid): Pod "' + name + '" is invalid: metadata.name: '
        + 'Invalid value: "' + name + '": a lowercase RFC 1123 label must consist of lower case alphanumeric '
        + 'characters or \'-\', and must start and end with an alphanumeric character']);
    }
    var rm = hasFlag(rest, '--rm');
    var attach = rest.indexOf('-it') !== -1 || (hasFlag(rest, '-i') && hasFlag(rest, '-t'));
    var out = ['pod/' + name + ' created'];
    if (attach) {
      out = out.concat(['If you don\'t see a command prompt, try pressing enter.',
        '（教学环境不提供交互式会话：`kubectl run -it` 在真机上会占住当前终端，Ctrl+C 才退出。）']);
    }
    if (rm) {
      out.push('pod "' + name + '" deleted');
    }
    out.push('', '（教学提示：run 起的是一个"裸 Pod"，没有任何控制器管理它 —— 节点一重启就没了。'
      + '要长期运行请用 Deployment。）');
    if (!resourceExists('namespaces', ns) && !hasFlag(rest, '--dry-run')) {
      return fail(['Error from server (NotFound): namespaces "' + ns + '" not found']);
    }
    return ok(out);
  }

  /* ---------- kubectl debug ---------- */
  function kubectlDebug(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","debug"]);
    var ns = nsOf(rest);
    var pos = positionals(rest, ['-n', '--namespace', '--image', '--target', '--copy-to',
      '--set-image', '--container', '--profile', '--shares-process-namespace', '--output', '-o']);
    var target = pos[0] || '';
    var image = opt(rest, '--image', null);
    var copyTo = opt(rest, '--copy-to', null);
    var setImage = optAll(rest, '--set-image');
    var container = opt(rest, '--container', null);
    var isNode = target.indexOf('node/') === 0;
    var isPodCopy = !!copyTo;

    if (!target) {
      return fail(['error: must specify a target (a pod name, node/<node>, or deployment/<deploy>)']);
    }

    if (isNode) {
      var nodeName = target.slice(5);
      if (!nodeByName(nodeName)) return notFound('nodes', nodeName);
      if (!image) return fail(['error: --image is required for node debugging']);
      return ok([
        'Creating debugging pod node-debugger-' + nodeName.replace(/\./g, '-') + '-' + seedHex(nodeName, 5) + ' with container debugger on node ' + nodeName + '.',
        'If you don\'t see a command prompt, try pressing enter.',
        '',
        '（教学环境不建立真实的交互式会话。真机上这条命令会起一个 **特权容器**：宿主机根文件系统挂在 /host，',
        '  进去后 `chroot /host` 就能查 kubelet 日志与网络插件 —— 也能误删宿主机文件，用完记得删掉调试 Pod。）',
        '  可以练的等价命令：kubectl logs node-debugger-' + nodeName.replace(/\./g, '-') + '-' + seedHex(nodeName, 5),
        '                    kubectl delete pod node-debugger-' + nodeName.replace(/\./g, '-') + '-' + seedHex(nodeName, 5)
      ]);
    }

    var pod = podByName(target);
    if (!pod) return fail(['Error from server (NotFound): pods "' + target + '" not found']);

    if (isPodCopy) {
      var lines = ['Pod "' + copyTo + '" of "' + target + '" created.'];
      var imgLines = [];
      setImage.forEach(function (kv) {
        var eq = String(kv).indexOf('=');
        var cname = String(kv).slice(0, eq);
        var img = String(kv).slice(eq + 1);
        imgLines.push('  ' + cname + ' -> ' + img);
      });
      if (imgLines.length) lines.push('Container images changed:');
      lines = lines.concat(imgLines);
      if (container && image) {
        lines.push('Adding debug container ' + container + ' (image ' + image + ') to the copy.');
      }
      var attach = rest.indexOf('-it') !== -1 || rest.indexOf('--') !== -1;
      if (attach) {
        lines.push('If you don\'t see a command prompt, try pressing enter.');
      }
      lines.push('',
        '（教学提示：--copy-to 出来的是一个**不受控制器管理的克隆 Pod**，不会自动消失，验证完记得 `kubectl delete pod ' + copyTo + '`。）',
        '  它继承原 Pod 的容器与卷，因此可以拿它验证"换个镜像/加个工具容器还会不会崩"，而不动线上那个。');
      return ok(lines);
    }

    /* 临时容器（ephemeral container）模式 */
    if (!image) {
      return fail(['error: --image is required when adding an ephemeral container']);
    }
    var ecName = container || 'debugger-' + seedHex(target + image, 5);
    return ok([
      'Targeting container "' + (opt(rest, '--target', pod.containers ? pod.containers[0] : 'app')) + '".'
        + (hasFlag(rest, '--target') ? ' If you don\'t see processes from the container, check the --target name.' : ''),
      'Adding debugger "' + ecName + '" to pod "' + pod.name + '" in namespace "' + pod.ns + '".',
      'If you don\'t see a command prompt, try pressing enter.',
      '',
      '（教学环境不建立真实的交互式会话。临时容器需要 K8s 1.25+ 且集群开启 EphemeralContainers：',
      '  它共享目标容器的进程命名空间（--target），能看它的进程；distroless 镜像没有 shell 时这是唯一的办法。',
      '  临时容器**不能**用 kubectl exec 之外的参数改、也不能删（只能重建 Pod），排查完不用专门清理。）'
    ]);
  }

  /* ---------- kubectl auth ---------- */
  /* 各身份的权限表（--list 与 can-i 的判定都基于它，不再随手编 yes/no） */
  var AUTHZ = {
    'system:serviceaccount:my-app:app-sa': {
      ns: {
        'pods': ['get', 'list', 'watch'],
        'pods/log': ['get'],
        'configmaps': ['get', 'list', 'watch'],
        'endpoints': ['get', 'list', 'watch'],
        'services': ['get', 'list'],
        'events': ['get', 'list', 'watch']
      },
      cluster: { 'nodes': ['get', 'list'], 'namespaces': ['get', 'list'] }
    },
    'system:serviceaccount:my-app:default': { ns: {}, cluster: {} },
    'system:serviceaccount:my-app:my-sa': { ns: {}, cluster: {} }
  };

  function authzOf(asUser) {
    return AUTHZ[asUser] || null;
  }

  function canI(cfg, verb, resource, nsScoped) {
    if (!cfg) return false;
    if (nsScoped) {
      var r = cfg.ns[resource];
      return !!r && r.indexOf(verb) !== -1;
    }
    var c = cfg.cluster[resource];
    if (c && c.indexOf(verb) !== -1) return true;
    /* 集群级检查也会命中命名空间里的授权（真机同此语义：不写 -n 就是"任意命名空间"） */
    var r2 = cfg.ns[resource];
    return !!r2 && r2.indexOf(verb) !== -1;
  }

  function kubectlAuth(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","auth"]);
    var sub = rest[0];

    if (sub === 'whoami') {
      var asUser = opt(rest, '--as', null);
      var asGroup = optAll(rest, '--as-group');
      var output = opt(rest, ['-o', '--output'], null);
      var user = asUser || 'cluster-admin';
      var groups = asGroup.length ? asGroup : (asUser ? ['system:authenticated'] : ['system:masters', 'system:authenticated']);
      if (output === 'yaml' || output === 'json') {
        var L = ['apiVersion: authentication.k8s.io/v1', 'kind: WhoAmI', 'metadata:', '  creationTimestamp: null',
          'status:', '  userInfo:'];
        L.push('    groups:');
        groups.forEach(function (g) { L.push('    - ' + g); });
        L.push('    username: ' + user);
        return ok(L);
      }
      return ok(['USERNAME                                    GROUPS                                            EXTRA',
        pad(user, 44) + pad(groups.join(','), 50) + '<none>',
        '',
        '（教学提示：这是 kubectl 1.27+ 的命令，把 kubeconfig 里的证书/令牌解析成可读身份。',
        '  报 Forbidden 时第一件事就是看清"我是谁"：kubectl config current-context && kubectl auth whoami）']);
    }

    if (sub === 'reconcile') {
      var file = opt(rest, ['-f', '--filename'], null);
      if (!file) return fail(['error: must specify one of -f and -k']);
      var abs = U.resolvePath(ctx.cwd, file);
      var node = U.findNode(ctx.root, abs);
      if (!node) return fail(['error: the path "' + file + '" does not exist']);
      var r = U.readFileOrErr(ctx, file);
      if (r.err) return fail(['error: the path "' + file + '" does not exist']);
      var dry = hasFlag(rest, '--dry-run');
      var rmPerm = hasFlag(rest, '--remove-extra-permissions');
      var rmSubj = hasFlag(rest, '--remove-extra-subjects');
      var lines = [];
      var text = r.content;
      var re = /kind:\s*(Role|ClusterRole|RoleBinding|ClusterRoleBinding)\s*\n(?:[\s\S]*?\n)?\s*name:\s*([A-Za-z0-9._-]+)/g;
      var m;
      var seen = 0;
      while ((m = re.exec(text)) !== null) {
        var kind = m[1], name = m[2];
        var nsName = (text.slice(m.index, m.index + 400).match(/\n\s*namespace:\s*([A-Za-z0-9._-]+)/) || [])[1];
        seen++;
        if (/Binding$/.test(kind)) {
          lines.push(kind.toLowerCase() + '.rbac.authorization.k8s.io/' + name + ' '
            + (dry ? 'created (dry run)' : 'created') + (nsName ? '' : ''));
        } else {
          lines.push(kind.toLowerCase() + '.rbac.authorization.k8s.io/' + name + ' '
            + (dry ? 'reconciled (dry run)' : 'reconciled')
            + '  （规则按清单对齐：缺的补上' + (rmPerm ? '，清单里没有的权限已清理' : '，清单外的权限默认保留') + '）');
        }
      }
      if (!seen) {
        return fail(['error: no RBAC objects found in "' + file + '"（清单里需要有 Role / ClusterRole / RoleBinding / ClusterRoleBinding）']);
      }
      lines.push('');
      if (rmSubj) lines.push('（--remove-extra-subjects：清单里没有的授权对象一并清理 —— 会把别人手工加的绑定也删掉，慎用。）');
      if (dry) {
        lines.push('（--dry-run=client：以上是"会做什么"的预演，集群没有被修改。）');
      } else {
        lines.push(STATE_NOTE);
      }
      lines.push('（教学提示：auth reconcile 的价值是**幂等** —— 可反复执行，缺什么补什么；'
        + '默认只增不减，想真正收敛权限必须加 --remove-extra-permissions。）');
      return ok(lines);
    }

    if (sub === 'can-i') {
      var listMode = hasFlag(rest, '--list');
      var asUsr = opt(rest, '--as', null);
      var nsGiven = hasFlag(rest, ['-n', '--namespace']);
      var ns = nsOf(rest);
      var pos2 = splitArgs(rest.slice(1), vopts(['--subresource', '--as-group'])).pos;
      if (listMode) {
        if (asUsr) {
          var cfg = authzOf(asUsr);
          if (!cfg) {
            return ok(['Resources                                       Non-Resource URLs   Resource Names   Verbs',
              '（教学环境没有为身份 ' + asUsr + ' 预置任何授权 —— 真机上这里会打印绑定到它的 Role/ClusterRole 规则）',
              '',
              '提示：拿不到权限清单时先确认这个 SA 存在，并检查 RoleBinding/ClusterRoleBinding 有没有绑上它。']);
          }
          var out = ['Resources                                       Non-Resource URLs   Resource Names   Verbs'];
          Object.keys(cfg.ns).forEach(function (res) {
            out.push(pad(res, 48) + pad('[]', 20) + pad('[]', 17) + '[' + cfg.ns[res].join(' ') + ']');
          });
          return ok(out);
        }
        return ok([
          'Resources                                       Non-Resource URLs   Resource Names   Verbs',
          'pods                                            []                  []               [get list watch create delete]',
          'deployments.apps                                []                  []               [get list watch update patch]',
          'services                                        []                  []               [get list watch]',
          'secrets                                         []                  []               [get list]',
          'events                                          []                  []               [get list watch]',
          '',
          '（教学提示：--list 看的是"当前身份在这个命名空间里的全部权限"，排查 Forbidden 最有效；',
          '  配合 --as=system:serviceaccount:<ns>:<sa> 就能验证某个 SA 到底能做什么。）'
        ]);
      }
      if (pos2.length < 2) {
        return fail(['error: you must specify two of the following: verb, resource, or subresource']);
      }
      var verb = pos2[0], resource = pos2[1].split('/')[0];
      var canon = canonical(resource) || resource;
      if (!KNOWN_KINDS[canon] && resource !== '*') {
        return fail(['error: the server doesn\'t have a resource type "' + resource + '"']);
      }
      if (asUsr) {
        var cfg2 = authzOf(asUsr);
        if (!cfg2) {
          return ok(['no',
            '',
            '（教学环境未为身份 ' + asUsr + ' 预置授权，按最小权限原则该身份没有任何权限。）']);
        }
        var yes = canI(cfg2, verb, canon, !!nsGiven);
        return ok([yes ? 'yes' : 'no']);
      }
      return ok(['yes']);
    }

    return fail(['error: unknown command "' + (sub || '') + '" for "kubectl auth"',
      'See \'kubectl auth -h\' for available commands.']);
  }

  /* ---------- kubectl label / annotate ---------- */
  function labelAnnotate(argv, ctx, stdin, HOST, which) {
    var rest = stripHead(argv, ["kubectl","label","annotate"]);
    var ns = nsOf(rest);
    var pos = splitArgs(rest, vopts(['--resource-version'])).pos;
    if (pos.length < 3) {
      return fail(['error: ' + (which === 'label'
        ? 'at least one label update is required'
        : 'at least one annotation update is required')]);
    }
    var kindArg = pos[0], nameArg = pos[1];
    var updates = pos.slice(2);
    var lSlash = String(kindArg).indexOf('/');
    var kind = lSlash === -1 ? kindArg : String(kindArg).slice(0, lSlash);
    var canon = canonical(kind);
    if (!canon) return noSuchResource(kind);
    if (!KNOWN_KINDS[canon]) return noSuchResource(kind);
    /* 资源名：`kubectl label pod web-x` 里是第二个位置参数；
       `kubectl label pod/web-x` 这种合写也支持。 */
    var name = lSlash === -1 ? nameArg : String(kindArg).slice(lSlash + 1);
    if (!resourceExists(canon, name, ns)) {
      return notFound(canon === 'nodes' ? 'nodes' : canon, name);
    }
    var overwrite = hasFlag(rest, '--overwrite');
    var dryRun = hasFlag(rest, '--dry-run');
    var existing = which === 'label'
      ? (canon === 'nodes' ? (NODE_LABELS[name] || {}) : (POD_LABELS[name] || { app: name.replace(/-[a-z0-9]{5}-[a-z0-9]{5}$/, '').replace(/-[a-z0-9]{5}$/, '') }))
      : (canon === 'ingresses' ? (find(INGRESSES, ns, name) || {}).annotations || {} : {});
    var out = [];
    for (var i = 0; i < updates.length; i++) {
      var u = String(updates[i]);
      if (u.charAt(u.length - 1) === '-') {
        var delKey = u.slice(0, -1);
        if (existing[delKey] === undefined) {
          out.push('error: ' + (which === 'label' ? 'label' : 'annotation') + ' "' + delKey + '" not found');
          continue;
        }
        out.push((which === 'label' ? 'label' : 'annotation') + ' "' + delKey + '" removed');
        continue;
      }
      var eq = u.indexOf('=');
      if (eq === -1) {
        return fail(['error: ' + (which === 'label' ? 'label' : 'annotation') + ' "' + u
          + '" is invalid: ' + (which === 'label' ? 'labels' : 'annotations')
          + ' must be of the form "key=value" or "key-"']);
      }
      var key = u.slice(0, eq), val = u.slice(eq + 1);
      if (!/^([A-Za-z0-9][-A-Za-z0-9_.]*\/)?[A-Za-z0-9][-A-Za-z0-9_.]*$/.test(key) || key.length > 253) {
        return fail(['error: ' + (which === 'label' ? 'label' : 'annotation') + ' "' + key
          + '" is invalid: name part must consist of alphanumeric characters']);
      }
      if (which === 'label' && val.length > 63) {
        return fail(['error: label "' + key + '" is invalid: value: Too long: may not be more than 63 bytes']);
      }
      if (existing[key] !== undefined && existing[key] !== val && !overwrite) {
        return fail(['error: ' + (which === 'label' ? 'label' : 'annotation') + ' "' + key
          + '" already has a value (' + existing[key] + '), and --overwrite is false']);
      }
      out.push((which === 'label' ? 'label' : 'annotation') + ' "' + key + '" '
        + (dryRun ? 'set (dry run)' : (existing[key] === undefined ? 'set' : 'overwritten')));
    }
    /* 真机回显是 `<资源名>/<名字> labeled|annotated` */
    var suffix = which === 'label' ? ' labeled' : ' annotated';
    var lines = [(canon === 'nodes' ? 'node/' : shortName(canon) + '/') + name + (dryRun ? suffix + ' (dry run)' : suffix)].concat(out);
    lines.push('');
    if (dryRun) {
      lines.push('（--dry-run=client：只显示会改什么，集群没有被修改。）');
    } else {
      lines.push(STATE_NOTE);
    }
    if (which === 'label') {
      lines.push('（教学提示：改 Pod 的标签会立刻影响 Service 的 endpoints —— 把 app=web 改掉，服务马上就 502；'
        + '而被 selector 引用的标签（Deployment 的 selector）是不可变的。）');
    } else {
      lines.push('（教学提示：注解写错不会报错，但控制器读不到就不生效；'
        + '排查"配了没反应"时先核对注解的键有没有写全（如 nginx.ingress.kubernetes.io/ 前缀）。）');
    }
    return ok(lines);
  }

  function shortName(canon) {
    var map = {
      pods: 'pod', deployments: 'deployment', services: 'service', nodes: 'node',
      configmaps: 'configmap', secrets: 'secret', serviceaccounts: 'serviceaccount',
      jobs: 'job', cronjobs: 'cronjob', ingresses: 'ingress', statefulsets: 'statefulset',
      daemonsets: 'daemonset', persistentvolumeclaims: 'persistentvolumeclaim'
    };
    return map[canon] || canon.replace(/s$/, '');
  }

  /* ---------- kubectl patch ---------- */
  function kubectlPatch(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","patch"]);
    var ns = nsOf(rest);
    var pos = splitArgs(rest, vopts(['-p', '--patch', '--type', '--subresource', '--field-manager'])).pos;
    if (pos.length < 1) return fail(['error: resource(s) were provided, but no name was specified']);
    if (!hasFlag(rest, ['-p', '--patch'])) {
      return fail(['error: must specify -p or --patch']);
    }
    var patchStr = opt(rest, ['-p', '--patch'], '');
    var type = opt(rest, '--type', 'strategic');
    if (['strategic', 'merge', 'json'].indexOf(type) === -1) {
      return fail(['error: invalid patch type "' + type + '": must be one of strategic, merge, json']);
    }
    if (patchStr.charAt(0) !== '{' && patchStr.charAt(0) !== '[') {
      return fail(['error: unable to parse "' + patchStr + '": json: cannot unmarshal into map[string]interface{}'
        + '（补丁必须是合法 JSON；YAML 补丁要写成 --type=merge 的 JSON 形式）']);
    }
    if (type === 'json' && patchStr.charAt(0) !== '[') {
      return fail(['error: json patch must be an array of objects']);
    }
    /* `patch deploy/web` 与 `patch deploy web` 都支持 */
    var pSlash = String(pos[0]).indexOf('/');
    var kind = pSlash === -1 ? pos[0] : String(pos[0]).slice(0, pSlash);
    var name = pSlash === -1 ? pos[1] : String(pos[0]).slice(pSlash + 1);
    if (!name) return fail(['error: resource(s) were provided, but no name was specified']);
    var canon = canonical(kind);
    if (!canon || !KNOWN_KINDS[canon]) return noSuchResource(kind);
    if (!resourceExists(canon, name, ns)) return notFound(canon, name);
    /* 回显要跟真机一致：core 组没有后缀（service/web patched），apps 组才有（deployment.apps/web patched） */
    var group = apiGroupFor(canon);
    return okWithNote([shortName(canon) + (group ? '.' + group : '') + '/' + name + ' patched'
      + (type === 'json' ? ' (json patch)' : '')]);
  }

  function apiGroupFor(canon) {
    if (canon === 'deployments' || canon === 'statefulsets' || canon === 'daemonsets') return 'apps';
    if (canon === 'jobs' || canon === 'cronjobs') return 'batch';
    if (canon === 'ingresses' || canon === 'networkpolicies') return 'networking.k8s.io';
    if (canon === 'horizontalpodautoscalers') return 'autoscaling';
    if (canon === 'poddisruptionbudgets') return 'policy';
    if (canon === 'roles' || canon === 'rolebindings' || canon === 'clusterroles' || canon === 'clusterrolebindings') return 'rbac.authorization.k8s.io';
    return '';
  }

  /* ---------- kubectl taint ---------- */
  function kubectlTaint(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","taint"]);
    var pos = splitArgs(rest, vopts(['--selector'])).pos;
    if (pos.length < 2) {
      return fail(['error: at least one taint update is required']);
    }
    var kindArg = pos[0];
    var canon = canonical(splitKind(kindArg).kind || kindArg);
    if (canon !== 'nodes') {
      return fail(['error: taints are only supported on nodes（真机只有 Node 支持污点）']);
    }
    /* `taint nodes <节点名>`（kind 与 name 分开写）或 `taint node/<节点名>`（合写）都支持 */
    var tSlash = String(kindArg).indexOf('/');
    var name = tSlash === -1 ? (pos[1] || '') : String(kindArg).slice(tSlash + 1);
    if (!nodeByName(name)) return notFound('nodes', name);
    var spec = pos[pos.length - 1];
    var effect = null;
    var key = spec;
    var isRemove = false;
    var m = String(spec).match(/^(.*):(NoSchedule|PreferNoSchedule|NoExecute)(-?)$/);
    if (m) { key = m[1]; effect = m[2]; isRemove = m[3] === '-'; }
    else if (String(spec).charAt(spec.length - 1) === '-') { isRemove = true; key = String(spec).slice(0, -1); }
    else {
      return fail(['error: invalid taint spec: ' + spec
        + '（格式为 <键>=<值>:<效果>，效果可选 NoSchedule / PreferNoSchedule / NoExecute）']);
    }
    var existing = (NODE_TAINTS[name] || []).filter(function (t) {
      var k = t.key + (t.value ? '=' + t.value : '');
      return k === key;
    });
    if (!isRemove && existing.length && !hasFlag(rest, '--overwrite')) {
      return fail(['error: Node ' + name + ' already has ' + key + ' taint(s) with same effect(s) and --overwrite is false']);
    }
    var suffix = isRemove ? ' untainted' : ' tainted';
    var lines = ['node/' + name + suffix];
    lines.push('');
    lines.push(STATE_NOTE);
    if (!isRemove && effect === 'NoExecute') {
      lines.push('（警告：NoExecute 会**立刻驱逐**节点上不容忍这条污点的 Pod，加之前先确认它们有地方可去。）');
    }
    lines.push('（教学提示：污点打在节点上、容忍写在 Pod 上；Pod 有容忍只代表"能上去"，不代表"一定会上去"。）');
    return ok(lines);
  }

  /* ---------- kubectl replace / expose / edit ---------- */
  function kubectlReplace(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","replace"]);
    var file = opt(rest, ['-f', '--filename'], null);
    if (!file) return fail(['error: must specify one of -f and -k']);
    var r = U.readFileOrErr(ctx, file);
    if (r.err) return fail(['error: the path "' + file + '" does not exist']);
    var res = resourcesInText(r.content, file);
    if (!res.length) {
      return fail(['error: unable to recognize "' + file + '": no matches for kind "" in version ""'
        + '（清单里缺少 apiVersion / kind）']);
    }
    var force = hasFlag(rest, '--force');
    var lines = [];
    res.forEach(function (o) {
      var canon = canonical(o.kind);
      var exists = canon ? resourceExists(canon, o.name, o.ns || nsOf(rest)) : false;
      if (!exists) {
        lines.push('Error from server (NotFound): ' + String(o.kind).toLowerCase() + 's "' + o.name + '" not found');
        return;
      }
      if (force) {
        lines.push(String(o.kind).toLowerCase() + ' "' + o.name + '" deleted (grace period 0s)');
        lines.push(String(o.kind).toLowerCase() + '/' + o.name + ' replaced');
      } else {
        lines.push(String(o.kind).toLowerCase() + '/' + o.name + ' replaced');
      }
    });
    lines.push('');
    lines.push('（教学提示：replace 是**整体替换**，不是合并 —— 本地 YAML 里没写的字段会被抹掉；'
      + '--force 走的是"先删后建"，改得动不可变字段（Service 的 clusterIP、Deployment 的 selector），代价是秒级中断。）');
    return lines[0].indexOf('Error from server') === 0 ? fail(lines) : okWithNote(lines.slice(0, lines.length - 2).concat(lines.slice(lines.length - 2)));
  }

  function kubectlExpose(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","expose"]);
    var ns = nsOf(rest);
    var pos = splitArgs(rest, vopts(['--type', '--port', '--target-port', '--name', '--protocol',
      '--selector', '--external-ip', '--session-affinity'])).pos;
    if (!pos.length) return fail(['error: must specify a resource to expose']);
    var sk = splitKind(pos[0]);
    var kind = sk.kind || 'service';
    var name = sk.name || pos[1];
    var canon = canonical(kind);
    if (!canon || canon !== 'deployments') {
      return fail(['error: cannot expose a ' + (kind || 'resource') + '（教学环境支持 expose deploy/<名称>）']);
    }
    if (!name) return fail(['error: resource(s) were provided, but no name was specified']);
    if (!deployByName(ns, name)) return notFound('deployments', name);
    var port = opt(rest, '--port', null);
    if (!port) return fail(['error: required flag(s) "port" not set']);
    var tp = opt(rest, '--target-port', port);
    var type = opt(rest, '--type', 'ClusterIP');
    if (['ClusterIP', 'NodePort', 'LoadBalancer', 'ExternalName'].indexOf(type) === -1) {
      return fail(['error: invalid service type "' + type + '"']);
    }
    var svcName = opt(rest, '--name', null) || name;
    var output = opt(rest, ['-o', '--output'], null);
    if (output === 'yaml' || output === 'json') {
      return ok(manifestOf('service', svcName, ns, { type: type, port: port, targetPort: tp, selectorApp: name }));
    }
    return okWithNote(['service/' + svcName + ' exposed']);
  }

  function kubectlEdit(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","edit"]);
    var ns = nsOf(rest);
    var pos = splitArgs(rest, vopts(['--field-manager', '--subresource', '--validate'])).pos;
    if (!pos.length) return fail(['error: must specify a resource to edit']);
    var sk = splitKind(pos[0]);
    var kind = sk.kind || pos[0];
    var name = sk.name || pos[1];
    var canon = canonical(kind);
    if (!canon || !KNOWN_KINDS[canon]) return noSuchResource(kind);
    if (!name) return fail(['error: resource(s) were provided, but no name was specified']);
    var noEdit = hasFlag(rest, '--output');
    if (noEdit) {
      return ok(['# 教学环境用 -o yaml 代替交互式编辑器输出：',
        '#   kubectl get ' + shortName(canon) + ' ' + name + ' -n ' + ns + ' -o yaml',
        '（真机上 kubectl edit 会打开 $KUBE_EDITOR 指定的编辑器，保存后立即生效。）']);
    }
    if (!resourceExists(canon, name, ns)) return notFound(canon, name);
    return ok([
      '（kubectl edit 会打开交互式编辑器（默认 vi），单行模拟终端里无法模拟 —— 它不是"命令执行"，而是"改文件再提交"。）',
      '',
      '改配置的三条等价路子（教学环境都支持）：',
      '  1) 非交互式脚本改字段：kubectl patch ' + shortName(canon) + '/' + name + ' -p \'{"spec":{...}}\'',
      '     —— 改数组元素（如 containers 里的某一项）要加 --type=json',
      '  2) 先导出再改再套用：kubectl get ' + shortName(canon) + ' ' + name + ' -n ' + ns + ' -o yaml > live.yaml',
      '     改完 kubectl diff -f live.yaml 看差异，再 kubectl apply -f live.yaml',
      '  3) 走 Git：把改动写回仓库里的 YAML，重新 apply（这才是可追溯的做法）',
      '',
      '（提醒：edit 是**热修改**，不会写回 Git —— 回头不同步 YAML，下次 apply 就把改动覆盖掉了。）'
    ]);
  }

  /* ---------- kubectl cp ---------- */
  function cpSpec(arg) {
    var s = String(arg);
    var colon = s.indexOf(':');
    if (colon === -1) return { remote: false, ns: null, pod: null, path: s };
    var head = s.slice(0, colon);
    var path = s.slice(colon + 1);
    var slash = head.indexOf('/');
    if (slash === -1) return { remote: true, ns: null, pod: head, path: path };
    return { remote: true, ns: head.slice(0, slash), pod: head.slice(slash + 1), path: path };
  }

  function kubectlCp(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","cp"]);
    var pos = positionals(rest, ['-c', '--container', '-n', '--namespace', '--retries']);
    if (pos.length < 2) {
      return fail(['error: expects 2 arguments: kubectl cp <file-spec-src> <file-spec-dest>']);
    }
    var src = cpSpec(pos[0]), dst = cpSpec(pos[1]);
    if (src.remote === dst.remote) {
      return fail(['error: one of src or dest must be a remote file specification'
        + '（容器内路径写成 <命名空间>/<Pod名>:<路径>，其中一侧必须是本地路径）']);
    }
    var remote = src.remote ? src : dst;
    var local = src.remote ? dst : src;
    var ns = remote.ns || nsOf(rest);
    var pod = podByName(remote.pod);
    if (!pod) return fail(['error: pods "' + remote.pod + '" not found']);
    var container = opt(rest, '-c', null) || (pod.containers && pod.containers.length ? pod.containers[0] : 'app');
    if (pod.containers && pod.containers.indexOf(container) === -1) {
      return fail(['error: unable to upgrade connection: container not found ("' + container + '")']);
    }
    var abs = U.resolvePath(ctx.cwd, local.path);
    var node = U.findNode(ctx.root, abs);

    /* kubectl cp 是通过在容器里执行 `tar` 打包再流式传输实现的：本环境既没有真容器
       也没有真网络，所以**两种方向都不伪造"拷贝成功"**，只如实说明真机行为。
       但"本地源路径不存在"这一条可以在本地判定，必须真报错。 */
    if (!src.remote && !node) {
      return fail(['error: ' + local.path + ': No such file or directory'
        + '（kubectl 是把本地路径打包成 tar 再送进容器的，源路径不存在会直接失败）']);
    }
    var dir = src.remote ? '容器 → 本地' : '本地 → 容器';
    return ok([
      '（教学环境不真的传输文件，因此不能报"拷贝成功" —— kubectl cp 是靠容器里的 `tar` 打包 + 流式传输实现的，',
      '  本环境没有真容器、也没有真网络，伪造一个"成功"只会让学员以为文件真的到了。）',
      '',
      '真机上这条命令（' + dir + '）的行为：',
      '  · 源：' + pos[0],
      '  · 目标：' + pos[1],
      '  · 目标容器：' + container + '（Pod ' + pod.name + '，命名空间 ' + pod.ns + '）',
      '  · 容器里**必须有 tar**，distroless / scratch 镜像会报 "exec: \\"tar\\": executable file not found"',
      '  · 拷进去的文件在 Pod 重建后就没了，它不是持久化手段',
      '  · 取小文件更稳的替代：kubectl exec ' + pod.name + ' -- cat <容器内路径> > 本地文件',
      '  · 大文件请走对象存储（如华为云 OBS）中转，别用 cp 拉'
    ]);
  }

  /* ---------- kubectl diff ---------- */
  function parseManifest(text, file) {
    var out = [];
    var cur = null;
    String(text).split('\n').forEach(function (line) {
      var m;
      if ((m = line.match(/^apiVersion:\s*(\S+)/))) {
        if (!cur) cur = { file: file };
        cur.apiVersion = m[1];
        return;
      }
      if ((m = line.match(/^kind:\s*(\S+)/))) {
        if (!cur) cur = { file: file };
        cur.kind = m[1];
        return;
      }
      if ((m = line.match(/^\s+name:\s*(\S+)/)) && cur && !cur.name) { cur.name = m[1]; return; }
      if ((m = line.match(/^\s+namespace:\s*(\S+)/)) && cur && !cur.ns) { cur.ns = m[1]; return; }
      if ((m = line.match(/^\s+image:\s*(\S+)/)) && cur) { cur.image = m[1]; return; }
      if ((m = line.match(/^\s+replicas:\s*(\d+)/)) && cur) { cur.replicas = m[1]; return; }
      if ((m = line.match(/^\s+clusterIP:\s*(\S+)/)) && cur) { cur.clusterIP = m[1]; return; }
      if (line === '---') {
        if (cur && cur.kind) out.push(cur);
        cur = null;
      }
    });
    if (cur && cur.kind) out.push(cur);
    return out;
  }

  function resourcesInText(text, file) {
    return parseManifest(text, file);
  }

  /* 把清单文件展开成一组 {file, text}（支持目录） */
  function filesUnder(ctx, arg) {
    var abs = U.resolvePath(ctx.cwd, arg);
    var node = U.findNode(ctx.root, abs);
    var out = [];
    if (node && node.type === 'dir') {
      U.childrenSorted(node).forEach(function (n) {
        var ch = node.children[n];
        if (ch.type !== 'file') return;
        out.push({ path: abs + '/' + n, text: String(ch.content || '') });
      });
      return out;
    }
    if (node && node.type === 'file') return [{ path: abs, text: String(node.content || '') }];
    return out;
  }

  /* 集群里该对象的"活"YAML。只覆盖示例用到的 Deployment / Service 两类，
     其余类型返回 null，调用方会如实说明"无法比对"而不是编一份假的。 */
  function liveManifestYaml(kind, name, ns) {
    var k = canonical(kind);
    if (k === 'deployments') {
      var d = deployByName(ns, name);
      if (!d) return null;
      var liveImage = String(d.image || '').replace(/:[^:\/]+$/, ':1.2.1');
      return [
        'apiVersion: apps/v1', 'kind: Deployment', 'metadata:',
        '  annotations:',
        '    deployment.kubernetes.io/revision: "3"',
        '    kubectl.kubernetes.io/last-applied-configuration: |',
        '      {"apiVersion":"apps/v1","kind":"Deployment","metadata":{"annotations":{},"name":"' + d.name + '","namespace":"' + d.ns + '"},"spec":{"replicas":' + String(d.upToDate || 2) + '}}',
        '  creationTimestamp: "2024-02-04T02:15:41Z"',
        '  generation: 5',
        '  labels:', '    app: ' + d.name,
        '  name: ' + d.name,
        '  namespace: ' + d.ns,
        '  resourceVersion: "' + (8600000 + Number(seedHex(d.name, 4).slice(0, 4), 16) % 99999) + '"',
        '  uid: ' + seedHex(d.ns + '/' + d.name, 8) + '-9d4e-4a71-8b92-' + seedHex(d.name + 'uid', 12),
        'spec:',
        '  progressDeadlineSeconds: 600',
        '  replicas: ' + String(d.upToDate || 2),
        '  revisionHistoryLimit: 10',
        '  selector:', '    matchLabels:', '      app: ' + d.name,
        '  strategy:',
        '    rollingUpdate:', '      maxSurge: 25%', '      maxUnavailable: 25%',
        '    type: RollingUpdate',
        '  template:',
        '    metadata:', '      creationTimestamp: null', '      labels:', '        app: ' + d.name,
        '    spec:',
        '      containers:',
        '      - image: ' + liveImage,
        '        imagePullPolicy: IfNotPresent',
        '        name: ' + (d.name === 'web' ? 'web' : d.name),
        '        ports:', '        - containerPort: 8080', '          protocol: TCP',
        '        resources:',
        '          limits:', '            cpu: 500m', '            memory: 512Mi',
        '          requests:', '            cpu: 200m', '            memory: 256Mi',
        '        terminationMessagePath: /dev/termination-log',
        '        terminationMessagePolicy: File',
        '      dnsPolicy: ClusterFirst',
        '      restartPolicy: Always',
        '      schedulerName: default-scheduler',
        '      securityContext: {}',
        '      terminationGracePeriodSeconds: 30',
        'status:',
        '  availableReplicas: ' + String(d.available || 0),
        '  observedGeneration: 5',
        '  readyReplicas: ' + String(d.available || 0),
        '  replicas: ' + String(d.upToDate || 2),
        '  updatedReplicas: ' + String(d.upToDate || 2)
      ];
    }
    if (k === 'services') {
      var s = svcByName(ns, name);
      if (!s) return null;
      var L = [
        'apiVersion: v1', 'kind: Service', 'metadata:',
        '  creationTimestamp: "2024-02-17T06:22:03Z"',
        '  labels:', '    app: ' + String(s.selector || 'app=' + name).split('=')[1],
        '  name: ' + s.name,
        '  namespace: ' + s.ns,
        '  resourceVersion: "' + (8800000 + Number(seedHex(s.name, 4).slice(0, 4), 16) % 99999) + '"',
        '  uid: ' + seedHex(s.ns + '/' + s.name, 8) + '-4f21-4a1e-9d3c-' + seedHex(s.name + 'uid', 12),
        'spec:',
        '  clusterIP: ' + s.clusterIP
      ];
      if (s.type === 'NodePort') L.push('  clusterIPs:', '  - ' + s.clusterIP, '  - fd00::' + seedHex(s.name, 4));
      L.push('  internalTrafficPolicy: Cluster');
      L.push('  ipFamilies:', '  - IPv4');
      L.push('  ipFamilyPolicy: SingleStack');
      L.push('  ports:');
      L.push('  - port: ' + String(s.ports).split('/')[0].split(':')[0]);
      L.push('    protocol: TCP');
      L.push('    targetPort: 8080');
      if (s.type === 'NodePort') L.push('    nodePort: ' + (String(s.ports).match(/:(\d+)\//) || [])[1]);
      L.push('  selector:', '    ' + String(s.selector || 'app=' + name).replace('=', ': '));
      L.push('  sessionAffinity: None');
      L.push('  type: ' + s.type);
      L.push('status:');
      if (s.type === 'LoadBalancer') {
        L.push('  loadBalancer:', '    ingress:', '    - ip: ' + s.externalIP);
      }
      return L;
    }
    return null;
  }

  /* 把本地清单"补"成集群对象的形状：服务端会填的字段用集群实际值，
     只有清单里明确写了的字段（replicas / image / clusterIP / type 等）才用清单的值。
     真 kubectl diff 也是这个语义 —— 否则 diff 会把"本地文件短"也算成差异。 */
  function mergeManifestIntoLive(text, o, live, wantImage, wantReplicas) {
    var wanted = {};
    var cur = null;
    String(text).split("\n").forEach(function (line) {
      var m;
      if ((m = line.match(/^\s+image:\s*(\S+)/))) { wanted.image = m[1]; return; }
      if ((m = line.match(/^\s+replicas:\s*(\d+)/))) { wanted.replicas = m[1]; return; }
      if ((m = line.match(/^\s+type:\s*(\S+)/))) { wanted.type = m[1]; return; }
      if ((m = line.match(/^\s+clusterIP:\s*(\S+)/))) { wanted.clusterIP = m[1]; return; }
      if ((m = line.match(/^\s+nodePort:\s*(\d+)/))) { wanted.nodePort = m[1]; return; }
      if ((m = line.match(/^\s+port:\s*(\d+)/))) { wanted.port = m[1]; return; }
      if ((m = line.match(/^\s+targetPort:\s*(\d+)/))) { wanted.targetPort = m[1]; return; }
      if ((m = line.match(/^- name:\s*(\S+)/))) { wanted.containerName = m[1]; return; }
      void cur;
    });
    if (wantImage) wanted.image = wantImage;
    if (wantReplicas) wanted.replicas = wantReplicas;
    return live.map(function (line) {
      var m;
      if (wanted.replicas && /^(\s+replicas:\s*)\d+$/.test(line)) {
        return line.replace(/^(\s+replicas:\s*)\d+$/, "$1" + wanted.replicas);
      }
      if (wanted.image && /^(\s+- image:\s*)\S+$/.test(line)) {
        return line.replace(/^(\s+- image:\s*)\S+$/, "$1" + wanted.image);
      }
      if (wanted.image && /^(\s+image:\s*)\S+$/.test(line)) {
        return line.replace(/^(\s+image:\s*)\S+$/, "$1" + wanted.image);
      }
      if (wanted.type && /^(\s+type:\s*)\S+$/.test(line)) {
        if (/^\s+type:\s*(RollingUpdate|ClusterIP|NodePort|LoadBalancer|ExternalName)$/.test(line)) {
          return line.replace(/^(\s+type:\s*)\S+$/, "$1" + wanted.type);
        }
      }
      return line;
    });
  }

  /* 逐行 LCS 差异（与真 kubectl 一样输出统一 diff 格式） */
  function unifiedDiff(aLines, bLines) {
    var n = aLines.length, m = bLines.length;
    var dp = [];
    for (var i = 0; i <= n; i++) { dp.push(new Array(m + 1)); for (var j = 0; j <= m; j++) dp[i][j] = 0; }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var out = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (aLines[i] === bLines[j]) { out.push(' ' + aLines[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('-' + aLines[i]); i++; }
      else { out.push('+' + bLines[j]); j++; }
    }
    while (i < n) { out.push('-' + aLines[i]); i++; }
    while (j < m) { out.push('+' + bLines[j]); j++; }
    return out;
  }

  function kubectlDiff(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","diff"]);
    var files = [];
    for (var i = 0; i < rest.length; i++) {
      if (rest[i] === '-f' || rest[i] === '--filename') files.push(String(rest[i + 1]));
      else if (String(rest[i]).indexOf('--filename=') === 0) files.push(String(rest[i]).slice(11));
    }
    var fromStdin = files.indexOf('-') !== -1;
    if (!files.length && !fromStdin) return fail(['error: must specify one of -f and -k']);
    var serverSide = hasFlag(rest, '--server-side');
    var nsOpt = nsOf(rest);
    var blocks = [];
    var missing = null;
    var unsupported = [];

    files.forEach(function (f) {
      if (f === '-') {
        /* 管道输入：helm template ... | kubectl diff -f - */
        var text = (stdin || []).join('\n');
        if (!text.trim()) return;
        resourcesInText(text, '-').forEach(function (o) { compareOne(o, text, '-', null); });
        return;
      }
      var list = filesUnder(ctx, f);
      if (!list.length) { missing = f; return; }
      list.forEach(function (entry) {
        resourcesInText(entry.text, entry.path).forEach(function (o) { compareOne(o, entry.text, f, entry.path); });
      });
    });

    function compareOne(o, text, given, absPath) {
      var canon = canonical(o.kind);
      var ns = o.ns || nsOpt;
      if (!canon || !KNOWN_KINDS[canon]) { unsupported.push(o.kind + '/' + o.name); return; }
      var live = liveManifestYaml(o.kind, o.name, ns);
      if (!live) { unsupported.push(o.kind + '/' + o.name); return; }
      /* 真 kubectl diff 比的是**服务端规范化之后的对象**：缩进、引号、
         服务端补的默认字段都已经被抹平。这里做同样的事 —— 把清单按集群实际
         取值补齐（replicas / image 这两项用清单里的值），差异就只剩真正的改动。 */
      var desired = mergeManifestIntoLive(text, o, live, o.image, o.replicas);
      var body = ['--- ' + (given === '-' ? '/dev/stdin' : given), '+++ ' + o.kind.toLowerCase() + '/' + o.name + ' (server)'];
      var diff = unifiedDiff(live, desired);
      var changed = diff.some(function (l) { return l.charAt(0) === '+' || l.charAt(0) === '-'; });
      if (!changed) return;
      var idx = 0;
      for (var k = 0; k < diff.length; k++) {
        if (diff[k].charAt(0) === ' ' && k > 0 && diff[k - 1].charAt(0) === ' ') { idx++; continue; }
      }
      body.push('@@ -1,' + live.length + ' +1,' + desired.length + ' @@');
      body = body.concat(diff);
      blocks.push(body);
    }

    if (missing) return fail(['error: the path "' + missing + '" does not exist']);
    var outLines = [];
    blocks.forEach(function (b) { outLines = outLines.concat(b); });
    if (!outLines.length) {
      if (unsupported.length) {
        return fail(['（教学环境只能对 Deployment / Service 做字段级比对，清单里有：' + unsupported.join('、') + '）',
          '  这类资源请用 kubectl get <资源> <名字> -o yaml 与本地文件对照。']);
      }
      return ok(['（没有任何差异：这份清单 apply 下去不会改动集群对象。）']);
    }
    outLines.push('');
    outLines.push('（教学提示：kubectl diff **有差异时退出码为 1**，串在 && 后面会被当成失败中断，脚本里必须特判；'
      + '上面 "+++ ... (server)" 一侧是集群里的实际对象，"-" 一侧是你本地文件。' + (serverSide ? ' 本次用了 --server-side 语义。' : '') + '）');
    return { out: outLines, err: [], code: 1 };
  }

  /* ---------- kubectl get 的补充资源类型 ---------- */
  function kubectlGetExtra(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","get"]);
    var f = { ns: nsOf(rest), all: hasFlag(rest, '-A') || hasFlag(rest, '--all-namespaces'),
      wide: opt(rest, ['-o', '--output'], null) === 'wide',
      showLabels: hasFlag(rest, '--show-labels'), noHeaders: hasFlag(rest, '--no-headers') };
    var pos = positionals(rest, ['-n', '--namespace', '-o', '--output', '-l', '--selector',
      '--field-selector', '--sort-by', '--custom-columns', '--template']);
    var kindArg = pos[0];
    var nameArg = pos[1];
    var canon = canonical(String(kindArg || '').split(',')[0]);
    if (!canon) return null;
    var ns = f.ns;

    function head(cols) { return f.noHeaders ? [] : [cols]; }
    function nsCol() { return f.all ? pad('NAMESPACE', 12) : ''; }
    function rowsOf(list) {
      var out = [];
      list.forEach(function (x) {
        if (!f.all && x.ns && x.ns !== ns) return;
        out.push(x);
      });
      return out;
    }

    if (canon === 'secrets') {
      var list = rowsOf(SECRETS);
      if (nameArg) {
        var s = find(SECRETS, ns, nameArg) || find(SECRETS, null, nameArg);
        if (!s) return notFound('secrets', nameArg);
        list = [s];
      }
      var secOut = String(opt(rest, ['-o', '--output'], '') || '');
      if (secOut.indexOf('jsonpath') === 0 || secOut.indexOf('--template') !== -1) {
        if (!list.length) return notFound('secrets', nameArg);
        if (list.length > 1 && !nameArg) {
          return fail(['error: jsonpath 需要指定资源名（例如 kubectl get secret db-secret -n my-app -o jsonpath=\'{.data.password}\'）']);
        }
        var path = secOut.replace(/^jsonpath=/, '');
        if (/data\./.test(path)) {
          var key = path.replace(/.*data\./, '').replace(/[?'"}].*/, '');
          return ok([list[0].data[key] || '']);
        }
        if (/metadata\.name/.test(path)) return ok([list[0].name]);
        return ok([]);
      }
      if (opt(rest, ['-o', '--output'], null) === 'yaml') {
        if (!list.length) return notFound('secrets', nameArg);
        var s2 = list[0];
        var L = ['apiVersion: v1', 'kind: Secret', 'metadata:',
          '  creationTimestamp: "2024-03-06T08:12:44Z"',
          '  name: ' + s2.name,
          '  namespace: ' + s2.ns,
          '  resourceVersion: "' + (8200000 + Number(seedHex(s2.name, 4).slice(0, 4), 16) % 99999) + '"',
          '  uid: ' + seedHex(s2.ns + '/' + s2.name, 8) + '-5e6f-4a71-8b92-' + seedHex(s2.name, 12),
          'type: ' + s2.type];
        L.push('data:');
        Object.keys(s2.data).forEach(function (k) { L.push('  ' + k + ': ' + s2.data[k]); });
        return ok(L);
      }
      return ok(head(nsCol() + pad('NAME', 24) + pad('TYPE', 30) + pad('DATA', 6) + 'AGE').concat(list.map(function (x) {
        return nsCol() + pad(x.name, 24) + pad(x.type, 30) + pad(String(Object.keys(x.data).length), 6) + '30d';
      })));
    }

    if (canon === 'configmaps') {
      var cl = rowsOf(CONFIGMAPS);
      if (nameArg) {
        var c = find(CONFIGMAPS, ns, nameArg) || find(CONFIGMAPS, null, nameArg);
        if (!c) return notFound('configmaps', nameArg);
        cl = [c];
      }
      if (opt(rest, ['-o', '--output'], null) === 'yaml') {
        if (!cl.length) return notFound('configmaps', nameArg);
        var c0 = cl[0];
        var LC = ['apiVersion: v1', 'kind: ConfigMap', 'metadata:',
          '  creationTimestamp: "2024-03-06T08:12:44Z"',
          '  name: ' + c0.name,
          '  namespace: ' + c0.ns,
          '  resourceVersion: "' + (8300000 + Number(seedHex(c0.name, 4).slice(0, 4), 16) % 99999) + '"',
          '  uid: ' + seedHex(c0.ns + '/' + c0.name, 8) + '-71a3-4f88-9d3c-' + seedHex(c0.name, 12)];
        LC.push('data:');
        Object.keys(c0.data).forEach(function (k) {
          var v = String(c0.data[k]);
          if (v.indexOf('\n') === -1) LC.push('  ' + k + ': ' + yamlScalar(v));
          else { LC.push('  ' + k + ': |'); v.split('\n').forEach(function (ln) { if (ln !== '') LC.push('    ' + ln); }); }
        });
        return ok(LC);
      }
      return ok(head(nsCol() + pad('NAME', 24) + pad('DATA', 6) + 'AGE').concat(cl.map(function (x) {
        return nsCol() + pad(x.name, 24) + pad(String(Object.keys(x.data).length), 6) + (x.age || '12d');
      })));
    }

    if (canon === 'serviceaccounts') {
      var sal = rowsOf(SERVICEACCOUNTS);
      if (nameArg) {
        var sa = find(SERVICEACCOUNTS, ns, nameArg) || find(SERVICEACCOUNTS, null, nameArg);
        if (!sa) return notFound('serviceaccounts', nameArg);
        sal = [sa];
      }
      if (opt(rest, ['-o', '--output'], null) === 'yaml') {
        if (!sal.length) return notFound('serviceaccounts', nameArg);
        var sa0 = sal[0];
        var LS = ['apiVersion: v1', 'kind: ServiceAccount', 'metadata:',
          '  creationTimestamp: "2024-02-04T02:15:41Z"',
          '  name: ' + sa0.name,
          '  namespace: ' + sa0.ns,
          '  resourceVersion: "' + (8400000 + Number(seedHex(sa0.name, 4).slice(0, 4), 16) % 99999) + '"',
          '  uid: ' + seedHex(sa0.ns + '/' + sa0.name, 8) + '-2c7a-4f38-8a61-' + seedHex(sa0.name, 12)];
        var ips = SA_IMAGE_PULL_SECRETS[sa0.ns + '/' + sa0.name];
        if (ips) {
          LS.push('imagePullSecrets:');
          ips.forEach(function (n) { LS.push('- name: ' + n); });
        }
        LS.push('secrets:');
        LS.push('- name: ' + sa0.name + '-token-' + seedHex(sa0.name, 5));
        return ok(LS);
      }
      return ok(head(nsCol() + pad('NAME', 24) + pad('SECRETS', 9) + 'AGE').concat(sal.map(function (x) {
        return nsCol() + pad(x.name, 24) + pad('1', 9) + x.age;
      })));
    }

    if (canon === 'jobs') {
      var jl = rowsOf(JOBS);
      if (nameArg) {
        var j = find(JOBS, ns, nameArg) || find(JOBS, null, nameArg);
        if (!j) return notFound('jobs.batch', nameArg);
        jl = [j];
      }
      return ok(head(nsCol() + pad('NAME', 18) + pad('COMPLETIONS', 13) + pad('DURATION', 10) + 'AGE').concat(jl.map(function (x) {
        return nsCol() + pad(x.name, 18) + pad(x.completions, 13) + pad(x.duration, 10) + x.age;
      })));
    }

    if (canon === 'cronjobs') {
      var cjl = rowsOf(CRONJOBS);
      if (nameArg) {
        var cj = find(CRONJOBS, ns, nameArg) || find(CRONJOBS, null, nameArg);
        if (!cj) return notFound('cronjobs.batch', nameArg);
        cjl = [cj];
      }
      return ok(head(nsCol() + pad('NAME', 12) + pad('SCHEDULE', 14) + pad('SUSPEND', 10) + pad('ACTIVE', 8) + pad('LAST SCHEDULE', 15) + 'AGE').concat(cjl.map(function (x) {
        return nsCol() + pad(x.name, 12) + pad(x.schedule, 14) + pad(x.suspend, 10) + pad(x.active, 8) + pad(x.last, 15) + x.age;
      })));
    }

    if (canon === 'ingresses') {
      var il = rowsOf(INGRESSES);
      if (nameArg) {
        var ing = find(INGRESSES, ns, nameArg) || find(INGRESSES, null, nameArg);
        if (!ing) return notFound('ingresses.networking.k8s.io', nameArg);
        il = [ing];
      }
      if (String(opt(rest, ['-o', '--output'], '')).indexOf('jsonpath') === 0) {
        var ipath = String(opt(rest, ['-o', '--output'], ''));
        if (!il.length) return notFound('ingresses.networking.k8s.io', nameArg);
        if (/metadata\.annotations/.test(ipath)) {
          return ok(['map[' + Object.keys(il[0].annotations).map(function (k) {
            return k + ':' + il[0].annotations[k];
          }).join(' ') + ']']);
        }
        return ok([]);
      }
      return ok(head(nsCol() + pad('NAME', 12) + pad('CLASS', 10) + pad('HOSTS', 22) + pad('ADDRESS', 16) + pad('PORTS', 8) + 'AGE').concat(il.map(function (x) {
        return nsCol() + pad(x.name, 12) + pad(x.class, 10) + pad(x.hosts, 22) + pad(x.address, 16) + pad(x.ports, 8) + x.age;
      })));
    }

    if (canon === 'statefulsets') {
      var sl = rowsOf(STATEFULSETS);
      if (nameArg && !find(STATEFULSETS, ns, nameArg)) return notFound('statefulsets.apps', nameArg);
      if (opt(rest, ['-o', '--output'], null) === 'yaml') {
        return ok([
          'apiVersion: apps/v1', 'kind: StatefulSet', 'metadata:',
          '  name: ' + (nameArg || 'mysql'),
          '  namespace: ' + ns,
          'spec:',
          '  replicas: 1',
          '  serviceName: mysql',
          '  volumeClaimTemplates:',
          '  - metadata:', '      name: data',
          '    spec:',
          '      accessModes: ["ReadWriteOnce"]',
          '      resources:', '        requests:', '          storage: 500Gi',
          '      storageClassName: csi-disk-ssd'
        ]);
      }
      return ok(head(nsCol() + pad('NAME', 12) + pad('READY', 8) + 'AGE').concat(sl.map(function (x) {
        return nsCol() + pad(x.name, 12) + pad(x.ready, 8) + x.age;
      })));
    }

    if (canon === 'daemonsets') {
      var dl = rowsOf(DAEMONSETS);
      if (f.wide) {
        return ok(head(nsCol() + pad('NAME', 22) + pad('DESIRED', 9) + pad('CURRENT', 9) + pad('READY', 7) + pad('UP-TO-DATE', 12) + pad('AVAILABLE', 11) + pad('NODE SELECTOR', 28) + 'AGE').concat(dl.map(function (x) {
          return nsCol() + pad(x.name, 22) + pad(x.desired, 9) + pad(x.current, 9) + pad(x.ready, 7) + pad(x.uptodate, 12) + pad(x.available, 11) + pad(x.nodeSelector, 28) + x.age;
        })));
      }      return ok(head(nsCol() + pad('NAME', 22) + pad('DESIRED', 9) + pad('CURRENT', 9) + pad('READY', 7) + pad('UP-TO-DATE', 12) + pad('AVAILABLE', 11) + 'AGE').concat(dl.map(function (x) {
        return nsCol() + pad(x.name, 22) + pad(x.desired, 9) + pad(x.current, 9) + pad(x.ready, 7) + pad(x.uptodate, 12) + pad(x.available, 11) + x.age;
      })));
    }

    if (canon === 'persistentvolumes') {
      return ok(head(pad('NAME', 26) + pad('CAPACITY', 10) + pad('ACCESS MODES', 14) + pad('RECLAIM POLICY', 16) + pad('STATUS', 8) + pad('CLAIM', 22) + pad('STORAGECLASS', 16) + 'AGE').concat(PVS.map(function (x) {
        return pad(x.name, 26) + pad(x.capacity, 10) + pad(x.accessModes, 14) + pad(x.reclaim, 16) + pad(x.status, 8) + pad(x.claim, 22) + pad(x.sc, 16) + x.age;
      })));
    }

    if (canon === 'storageclasses') {
      if (nameArg) {
        var sc = find(STORAGECLASSES, null, nameArg);
        if (!sc) return notFound('storageclasses.storage.k8s.io', nameArg);
        if (opt(rest, ['-o', '--output'], null) === 'yaml') {
          return ok(['apiVersion: storage.k8s.io/v1', 'kind: StorageClass', 'metadata:',
            '  name: ' + sc.name,
            'provisioner: ' + sc.provisioner,
            'reclaimPolicy: ' + sc.reclaim,
            'volumeBindingMode: ' + sc.binding,
            'allowVolumeExpansion: ' + sc.expand,
            'parameters:',
            '  csi.storage.k8s.io/csi-driver-name: disk.csi.everest.io',
            '  everest.io/disk-volume-type: ' + (/ssd/.test(sc.name) ? 'SSD' : 'SAS')]);
        }
      }
      return ok(head(pad('NAME', 16) + pad('PROVISIONER', 28) + pad('RECLAIMPOLICY', 16) + pad('VOLUMEBINDINGMODE', 20) + pad('ALLOWVOLUMEEXPANSION', 21) + 'AGE').concat(STORAGECLASSES.map(function (x) {
        return pad(x.name, 16) + pad(x.provisioner, 28) + pad(x.reclaim, 16) + pad(x.binding, 20) + pad(x.expand, 21) + x.age;
      })));
    }

    if (canon === 'endpointslices') {
      var el = rowsOf(ENDPOINTSLICES);
      if (f.wide) {
        return ok(head(nsCol() + pad('NAME', 16) + pad('ADDRESSTYPE', 13) + pad('PORTS', 8) + pad('ENDPOINTS', 26) + 'AGE').concat(el.map(function (x) {
          return nsCol() + pad(x.name, 16) + pad(x.addressType, 13) + pad(x.ports, 8) + pad(x.endpoints, 26) + x.age;
        })));
      }
      return ok(head(nsCol() + pad('NAME', 16) + pad('ADDRESSTYPE', 13) + pad('PORTS', 8) + 'AGE').concat(el.map(function (x) {
        return nsCol() + pad(x.name, 16) + pad(x.addressType, 13) + pad(x.ports, 8) + x.age;
      })));
    }

    if (canon === 'horizontalpodautoscalers') {
      var hl = rowsOf(HPAS);
      if (nameArg) {
        var h = find(HPAS, ns, nameArg);
        if (!h) return notFound('horizontalpodautoscalers.autoscaling', nameArg);
        hl = [h];
      }
      if (String(opt(rest, ['-o', '--output'], '')).indexOf('yaml') !== -1) {
        return ok(['apiVersion: autoscaling/v2', 'kind: HorizontalPodAutoscaler', 'metadata:',
          '  name: ' + (nameArg || 'web-hpa'),
          '  namespace: ' + ns,
          'spec:',
          '  scaleTargetRef:', '    apiVersion: apps/v1', '    kind: Deployment', '    name: web',
          '  minReplicas: ' + (hl[0] ? hl[0].min : 2), '  maxReplicas: ' + (hl[0] ? hl[0].max : 10),
          '  behavior:',
          '    scaleDown:', '      stabilizationWindowSeconds: 300',
          '      policies:', '      - type: Percent', '        value: 100', '        periodSeconds: 15',
          '    scaleUp:', '      stabilizationWindowSeconds: 0',
          '      policies:', '      - type: Percent', '        value: 100', '        periodSeconds: 15']);
      }
      return ok(head(nsCol() + pad('NAME', 12) + pad('REFERENCE', 22) + pad('TARGETS', 16) + pad('MINPODS', 9) + pad('MAXPODS', 9) + pad('REPLICAS', 10) + 'AGE').concat(hl.map(function (x) {
        return nsCol() + pad(x.name, 12) + pad(x.ref, 22) + pad(x.targets, 16) + pad(String(x.min), 9) + pad(String(x.max), 9) + pad(String(x.replicas), 10) + x.age;
      })));
    }

    if (canon === 'poddisruptionbudgets') {
      var pl = rowsOf(PDBS);
      return ok(head(nsCol() + pad('NAME', 12) + pad('MIN AVAILABLE', 15) + pad('MAX UNAVAILABLE', 17) + pad('ALLOWED DISRUPTIONS', 21) + 'AGE').concat(pl.map(function (x) {
        return nsCol() + pad(x.name, 12) + pad(x.minAvailable, 15) + pad(x.maxUnavailable, 17) + pad(String(x.allowed), 21) + x.age;
      })));
    }

    if (canon === 'networkpolicies') {
      var nl = rowsOf(NETPOLS);
      return ok(head(nsCol() + pad('NAME', 16) + pad('POD-SELECTOR', 16) + pad('AGE', 8)).concat(nl.map(function (x) {
        return nsCol() + pad(x.name, 16) + pad(x.podSelector, 16) + x.age;
      })).concat(['', '提示：NetworkPolicy 只在**支持它的 CNI**（如 Calico）下生效，'
        + '用 `kubectl get pods -n kube-system` 确认网络插件类型。']));
    }

    if (canon === 'resourcequotas') {
      var ql = rowsOf(QUOTAS);
      if (!ql.length) return ok(head(nsCol() + pad('NAME', 16) + pad('AGE', 8)));
      var q = ql[0];
      var items = [['requests.cpu', '4', '12', '8'], ['requests.memory', '8Gi', '32Gi', '24Gi'],
        ['limits.cpu', '8', '24', '16'], ['limits.memory', '16Gi', '64Gi', '48Gi'],
        ['pods', '10', '60', '23'], ['services.loadbalancers', '1', '2', '2']];
      return ok([nsCol() + pad('NAME', 16) + 'AGE', nsCol() + pad(q.name, 16) + q.age, '',
        pad('Resource', 25) + pad('Used', 7) + 'Hard',
        pad('--------', 25) + pad('----', 7) + '----'].concat(items.map(function (it) {
        return pad(it[0], 25) + pad(it[1], 7) + it[2];
      })).concat(['', '（教学提示：配额满了会**直接拒绝创建**（事件为 Exceeded quota），'
        + '排 Pending 时必须看一眼这里。）']));
    }

    if (canon === 'roles' || canon === 'rolebindings') {
      var isRole = canon === 'roles';
      var keys = Object.keys(isRole ? ROLES : ROLEBINDINGS).filter(function (k) { return k.split('/')[0] === ns; });
      if (nameArg) keys = keys.filter(function (k) { return k.split('/')[1] === nameArg; });
      if (nameArg && !keys.length) return notFound(canon + '.rbac.authorization.k8s.io', nameArg);
      var lines = [];
      if (!f.noHeaders) lines.push(pad('NAME', 20) + pad('CREATED AT', 22));
      keys.forEach(function (k) {
        lines.push(pad(k.split('/')[1], 20) + '2024-03-06T08:12:44Z');
      });
      return ok(lines);
    }

    if (canon === 'clusterroles' || canon === 'clusterrolebindings') {
      var isCR = canon === 'clusterroles';
      var src = isCR ? CLUSTERROLES : CLUSTERROLEBINDINGS;
      var names = Object.keys(src);
      if (nameArg) {
        if (!src[nameArg]) return notFound(canon + '.rbac.authorization.k8s.io', nameArg);
        names = [nameArg];
      }
      var cl2 = [];
      if (!f.noHeaders) cl2.push(pad('NAME', 24) + 'CREATED AT');
      names.forEach(function (n) { cl2.push(pad(n, 24) + '2024-02-04T02:15:41Z'); });
      return ok(cl2);
    }

    /* pods：内置实现不认 -l / --show-labels / --field-selector / --no-headers，
       而这些正是"按节点查 Pod""按标签查 Pod"两条示例的核心，所以在这里补齐。 */
    if (canon === 'pods') {
      var selector = opt(rest, ['-l', '--selector'], null);
      var fieldSel = opt(rest, '--field-selector', null);
      var pods = (K.pods || []).filter(function (p) { return f.all || p.ns === ns; });
      var hasExtra = selector || fieldSel || f.showLabels || f.noHeaders;
      if (!hasExtra) return null;   /* 普通 get pods 交回内置实现 */

      if (selector) {
        pods = pods.filter(function (p) {
          var labels = POD_LABELS[p.name] || { app: p.name.split('-')[0] };
          return String(selector).split(',').every(function (cond) {
            var parts = String(cond).split('=');
            return labels[parts[0]] === (parts[1] === undefined ? '' : parts[1]);
          });
        });
      }
      if (fieldSel) {
        var conds = String(fieldSel).split(',');
        var bad = null;
        conds.forEach(function (c) {
          if (!/^(metadata\.name|metadata\.namespace|spec\.nodeName|status\.phase|involvedObject\.name|reason|type)(!?=)(.*)$/.test(c)) bad = c;
        });
        if (bad) {
          return fail(['Error from server (BadRequest): unable to find "' + bad
            + '": field label not supported: ' + String(bad).split(/!?=/)[0]]);
        }
        pods = pods.filter(function (p) {
          return conds.every(function (c) {
            var m = String(c).match(/^(.*?)(!?=)(.*)$/);
            var field = m[1], op = m[2], want = m[3];
            var val = field === 'metadata.name' ? p.name
              : field === 'metadata.namespace' ? p.ns
                : field === 'spec.nodeName' ? p.node
                  : field === 'status.phase' ? p.status : '';
            val = val === '<none>' ? '' : val;
            return op === '=' ? val === want : val !== want;
          });
        });
      }
      var cols = f.all ? pad('NAMESPACE', 12) : '';
      if (f.wide) {
        var wo = [cols + 'NAME                          READY   STATUS             RESTARTS   AGE   IP            NODE        NOMINATED NODE   READINESS GATES'];
        pods.forEach(function (p) {
          wo.push(pad(f.all ? p.ns : '', 12) + pad(p.name, 30) + pad(p.ready, 8) + pad(p.status, 19)
            + pad(String(p.restarts), 11) + pad(p.age, 6) + pad(p.ip, 14) + pad(p.node, 12) + pad('<none>', 17) + '<none>');
        });
        return ok(f.noHeaders ? wo.slice(1) : wo);
      }
      var po = [cols + 'NAME                          READY   STATUS             RESTARTS   AGE' + (f.showLabels ? '   LABELS' : '')];
      pods.forEach(function (p) {
        var labels = POD_LABELS[p.name] || { app: p.name.split('-')[0] };
        var line = pad(f.all ? p.ns : '', 12) + pad(p.name, 30) + pad(p.ready, 8) + pad(p.status, 19)
          + pad(String(p.restarts), 11) + p.age;
        if (f.showLabels) {
          line += '   ' + Object.keys(labels).map(function (k) { return k + '=' + labels[k]; }).join(',');
        }
        po.push(line);
      });
      if (pods.length === 0) po.push('No resources found' + (f.all ? '' : ' in ' + ns + ' namespace.'));
      return ok(f.noHeaders ? po.slice(1) : po);
    }

    if (canon === 'ingressclasses') {
      return ok(head(pad('NAME', 14) + pad('CONTROLLER', 32) + 'PARAMETERS   AGE').concat(
        INGRESSCLASSES.map(function (x) { return pad(x.name, 14) + pad(x.controller, 32) + '<none>       ' + x.age; })));
    }

    /* nodes：给 -l 选择器与 --show-labels 补上真实标签（内置实现这两个参数没实现） */
    if (canon === 'nodes') {
      var selector = opt(rest, ['-l', '--selector'], null);
      var nodes = (K.nodeList || []).slice();
      if (selector) {
        nodes = nodes.filter(function (n) {
          return String(selector).split(',').every(function (cond) {
            var parts = String(cond).split('=');
            var labels = NODE_LABELS[n.name] || {};
            return labels[parts[0]] === (parts[1] === undefined ? '' : parts[1]);
          });
        });
      }
      if (f.showLabels) {
        var lo = ['NAME        STATUS   ROLES           AGE   VERSION   LABELS'];
        nodes.forEach(function (n) {
          var labels = NODE_LABELS[n.name] || {};
          var txt = Object.keys(labels).map(function (k) { return k + '=' + labels[k]; }).join(',');
          lo.push(pad(n.name, 12) + pad(n.status, 9) + pad(n.role, 16) + pad(n.age, 6) + pad(n.version, 10) + txt);
        });
        return ok(lo);
      }
      if (selector) {
        var so = ['NAME        STATUS   ROLES           AGE   VERSION'];
        nodes.forEach(function (n) { so.push(pad(n.name, 12) + pad(n.status, 9) + pad(n.role, 16) + pad(n.age, 6) + n.version); });
        if (nodes.length === 0) {
          so.push('No resources found');
        }
        return ok(so);
      }
      return null;   /* 没带这两个参数就交回内置实现 */
    }

    return null;
  }

  /* ---------- kubectl api-resources ---------- */
  function kubectlApiResources(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","api-resources"]);
    var namespacedFalse = String(opt(rest, '--namespaced', '')).toLowerCase() === 'false';
    var namespacedTrue = String(opt(rest, '--namespaced', '')).toLowerCase() === 'true';
    var wide = opt(rest, ['-o', '--output'], null) === 'wide';
    var rows = [
      ['pods', 'po', 'v1', true, 'Pod'],
      ['services', 'svc', 'v1', true, 'Service'],
      ['configmaps', 'cm', 'v1', true, 'ConfigMap'],
      ['secrets', '', 'v1', true, 'Secret'],
      ['serviceaccounts', 'sa', 'v1', true, 'ServiceAccount'],
      ['namespaces', 'ns', 'v1', false, 'Namespace'],
      ['nodes', 'no', 'v1', false, 'Node'],
      ['persistentvolumes', 'pv', 'v1', false, 'PersistentVolume'],
      ['persistentvolumeclaims', 'pvc', 'v1', true, 'PersistentVolumeClaim'],
      ['endpoints', 'ep', 'v1', true, 'Endpoints'],
      ['events', 'ev', 'v1', true, 'Event'],
      ['deployments', 'deploy', 'apps/v1', true, 'Deployment'],
      ['statefulsets', 'sts', 'apps/v1', true, 'StatefulSet'],
      ['daemonsets', 'ds', 'apps/v1', true, 'DaemonSet'],
      ['replicasets', 'rs', 'apps/v1', true, 'ReplicaSet'],
      ['jobs', '', 'batch/v1', true, 'Job'],
      ['cronjobs', 'cj', 'batch/v1', true, 'CronJob'],
      ['ingresses', 'ing', 'networking.k8s.io/v1', true, 'Ingress'],
      ['ingressclasses', '', 'networking.k8s.io/v1', false, 'IngressClass'],
      ['networkpolicies', 'netpol', 'networking.k8s.io/v1', true, 'NetworkPolicy'],
      ['poddisruptionbudgets', 'pdb', 'policy/v1', true, 'PodDisruptionBudget'],
      ['horizontalpodautoscalers', 'hpa', 'autoscaling/v2', true, 'HorizontalPodAutoscaler'],
      ['resourcequotas', 'quota', 'v1', true, 'ResourceQuota'],
      ['storageclasses', 'sc', 'storage.k8s.io/v1', false, 'StorageClass'],
      ['roles', '', 'rbac.authorization.k8s.io/v1', true, 'Role'],
      ['rolebindings', '', 'rbac.authorization.k8s.io/v1', true, 'RoleBinding'],
      ['clusterroles', '', 'rbac.authorization.k8s.io/v1', false, 'ClusterRole'],
      ['clusterrolebindings', '', 'rbac.authorization.k8s.io/v1', false, 'ClusterRoleBinding'],
      ['endpointslices', '', 'discovery.k8s.io/v1', true, 'EndpointSlice']
    ];
    if (namespacedFalse) rows = rows.filter(function (r) { return !r[3]; });
    if (namespacedTrue) rows = rows.filter(function (r) { return r[3]; });
    var out = ['NAME                              SHORTNAMES   APIVERSION                             NAMESPACED   KIND'];
    if (wide) out[0] += '   VERBS';
    rows.forEach(function (r) {
      var line = pad(r[0], 34) + pad(r[1], 13) + pad(r[2], 39) + pad(String(r[3]), 13) + r[4];
      if (wide) line += '   create,delete,get,list,patch,update,watch';
      out.push(line);
    });
    out.push('');
    out.push('（教学提示：--namespaced=false 只列出**集群级**资源 —— 这些资源不能加 -n，'
      + '写 `kubectl get nodes -n my-app` 是无效的。）');
    return ok(out);
  }

  /* ---------- kubectl exec（比内置实现更完整：可带 -n 与容器内命令） ---------- */
  function kubectlExec(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["kubectl","exec"]);
    var ns = nsOf(rest);
    var dashIdx = rest.indexOf('--');
    var before = dashIdx === -1 ? rest : rest.slice(0, dashIdx);
    var cmdArgs = dashIdx === -1 ? [] : rest.slice(dashIdx + 1);
    var pos = positionals(before, ['-n', '--namespace', '-c', '--container', '-it', '--stdin', '--tty']);
    var podName = pos[0];
    if (!podName) return fail(['error: you must specify at least one container to exec']);
    var pod = podByName(podName);
    if (!pod) return notFound('pods', podName);
    var container = opt(before, '-c', null) || null;
    if (container && pod.containers && pod.containers.indexOf(container) === -1) {
      return fail(['error: unable to upgrade connection: container not found ("' + container + '")']);
    }
    var inner = cmdArgs.join(' ');
    if (!cmdArgs.length) {
      return ok([
        '（教学环境不提供交互式会话：`kubectl exec -it <pod> -- bash` 在真机上会进容器。',
          '  可以练的等价命令：',
        '    kubectl exec ' + podName + ' -- env',
        '    kubectl exec ' + podName + ' -- cat /etc/resolv.conf',
        '    kubectl exec ' + podName + ' -- ls /var/run/secrets/kubernetes.io/serviceaccount/'
      ]);
    }
    /* 容器内的几条"真实可答"的命令，用 termfs 里该 Pod 的数据回答 */
    if (inner === 'env') {
      return ok([
        'PATH=/usr/local/openjdk-17/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'HOSTNAME=' + pod.name,
        'APP_ENV=prod',
        'LOG_LEVEL=info',
        'JAVA_HOME=/usr/local/openjdk-17',
        'APP_CONFIG=/etc/app/app.conf',
        'CACHE_HOST=cache-prod-01',
        'CACHE_PORT=6379',
        'KUBERNETES_SERVICE_HOST=10.247.0.1',
        'KUBERNETES_SERVICE_PORT=443',
        'KUBERNETES_PORT_443_TCP_ADDR=10.247.0.1'
      ]);
    }
    if (inner.indexOf('resolv.conf') !== -1) {
      return ok([
        'search ' + pod.ns + '.svc.cluster.local svc.cluster.local cluster.local myhuaweicloud.com',
        'nameserver 10.247.0.10',
        'options ndots:5 single-request-reopen'
      ]);
    }
    if (inner.indexOf('serviceaccount') !== -1 && inner.indexOf('ls') === 0) {
      return ok(['ca.crt', 'namespace', 'token', '',
        '（token 是凭据：教学环境不打印它的内容。真机上 `cat token` 会把凭据打进你的终端与历史记录。）']);
    }
    if (inner.indexOf('serviceaccount/namespace') !== -1) {
      return ok([pod.ns]);
    }
    if (inner.indexOf('cat /etc/app/app.conf') !== -1) {
      return ok(['# /etc/app/app.conf（由 ConfigMap app-config 挂载）',
        'server.port=8080',
        'log.level=info',
        'cache.host=cache-prod-01',
        'cache.port=6379']);
    }
    if (inner.indexOf('nslookup') !== -1) {
      var host = inner.split(/\s+/)[1] || '';
      if (host.indexOf('cache-prod-01') === 0) {
        return fail(['Server:\t\t10.247.0.10',
          'Address:\t10.247.0.10#53',
          '',
          '** server can\'t find ' + host + ': NXDOMAIN',
          '',
          '（这就是 worker 一直 CrashLoopBackOff 的直接原因：容器里解析不了 cache-prod-01。',
          '  先确认 Service 名字与命名空间：kubectl get svc,endpoints -n my-app | grep cache）']);
      }
      return fail(['Server:\t\t10.247.0.10',
        'Address:\t10.247.0.10#53',
        '',
        '** server can\'t find ' + host + ': NXDOMAIN']);
    }
    /* 其余命令如实说明无法执行 */
    return fail(['（教学环境里容器不是真的 —— 无法执行 `' + inner + '`，也不会伪造输出。）',
      '',
      '真机上这条命令会把 ' + inner + ' 交给容器 ' + (container || (pod.containers && pod.containers[0]) || 'app') + ' 执行。',
      '教学环境实现了这几条可以真答的：',
      '  kubectl exec ' + podName + ' -- env',
      '  kubectl exec ' + podName + ' -- cat /etc/resolv.conf',
      '  kubectl exec ' + podName + ' -- cat /etc/app/app.conf',
      '  kubectl exec ' + podName + ' -- ls /var/run/secrets/kubernetes.io/serviceaccount/',
      '  kubectl exec ' + podName + ' -- nslookup cache-prod-01',
      '  kubectl exec ' + podName + ' -n my-app -- cat /var/run/secrets/kubernetes.io/serviceaccount/namespace']);
  }

  /* ======================================================================
     4. kubectl 分派表
     ====================================================================== */

  window.CC_K8S_EXTRA = {
    create: kubectlCreate,
    run: kubectlRun,
    debug: kubectlDebug,
    auth: kubectlAuth,
    label: function (a, c, s, h) { return labelAnnotate(a, c, s, h, 'label'); },
    annotate: function (a, c, s, h) { return labelAnnotate(a, c, s, h, 'annotate'); },
    patch: kubectlPatch,
    taint: kubectlTaint,
    replace: kubectlReplace,
    expose: kubectlExpose,
    edit: kubectlEdit,
    cp: kubectlCp,
    diff: kubectlDiff,
    'api-resources': kubectlApiResources,
    get: kubectlGetExtra,
    exec: kubectlExec
  };

  /* ======================================================================
     5. helm 的补全（CC_HELM_EXTRA）
     ====================================================================== */

  var HELM_FILES = {
    'Chart.yaml':
      'apiVersion: v2\n' +
      'name: my-app\n' +
      'description: A Helm chart for Kubernetes\n' +
      '\n' +
      '# A chart can be either an \'application\' or a \'library\' chart.\n' +
      'type: application\n' +
      '\n' +
      '# This is the chart version. This version number should be incremented each time you make changes\n' +
      '# to the chart and its templates, including the app version.\n' +
      'version: 0.1.0\n' +
      '\n' +
      '# This is the version number of the application being deployed.\n' +
      'appVersion: "1.16.0"\n',
    'values.yaml':
      'replicaCount: 1\n' +
      '\n' +
      'image:\n' +
      '  repository: nginx\n' +
      '  pullPolicy: IfNotPresent\n' +
      '  tag: ""\n' +
      '\n' +
      'imagePullSecrets: []\n' +
      'nameOverride: ""\n' +
      'fullnameOverride: ""\n' +
      '\n' +
      'serviceAccount:\n' +
      '  create: true\n' +
      '  automount: true\n' +
      '  annotations: {}\n' +
      '  name: ""\n' +
      '\n' +
      'podAnnotations: {}\n' +
      'podLabels: {}\n' +
      '\n' +
      'podSecurityContext: {}\n' +
      'securityContext: {}\n' +
      '\n' +
      'service:\n' +
      '  type: ClusterIP\n' +
      '  port: 80\n' +
      '\n' +
      'ingress:\n' +
      '  enabled: false\n' +
      '  className: ""\n' +
      '  annotations: {}\n' +
      '  hosts:\n' +
      '    - host: chart-example.local\n' +
      '      paths:\n' +
      '        - path: /\n' +
      '          pathType: ImplementationSpecific\n' +
      '  tls: []\n' +
      '\n' +
      'resources: {}\n' +
      'livenessProbe:\n' +
      '  httpGet:\n' +
      '    path: /\n' +
      '    port: http\n' +
      'readinessProbe:\n' +
      '  httpGet:\n' +
      '    path: /\n' +
      '    port: http\n' +
      '\n' +
      'autoscaling:\n' +
      '  enabled: false\n' +
      '  minReplicas: 1\n' +
      '  maxReplicas: 100\n' +
      '  targetCPUUtilizationPercentage: 80\n' +
      '\n' +
      'nodeSelector: {}\n' +
      'tolerations: []\n' +
      'affinity: {}\n',
    '.helmignore':
      '# Patterns to ignore when building packages.\n' +
      '.DS_Store\n' +
      '.git/\n' +
      '.gitignore\n' +
      '.hg/\n' +
      '.hgignore\n' +
      '.svn/\n' +
      '*.tmproj\n' +
      '.project\n',
    'templates/NOTES.txt':
      '1. Get the application URL by running these commands:\n' +
      '{{- if .Values.ingress.enabled }}\n' +
      '  Visit the application at http://{{ (first .Values.ingress.hosts).host }}\n' +
      '{{- else if contains "NodePort" .Values.service.type }}\n' +
      '  export NODE_PORT=$(kubectl get --namespace {{ .Release.Namespace }} -o jsonpath="{.spec.ports[0].nodePort}" services {{ include "my-app.fullname" . }})\n' +
      '{{- else if contains "ClusterIP" .Values.service.type }}\n' +
      '  export POD_NAME=$(kubectl get pods --namespace {{ .Release.Namespace }} -l "app.kubernetes.io/name={{ include "my-app.name" . }}" -o jsonpath="{.items[0].metadata.name}")\n' +
      '  kubectl --namespace {{ .Release.Namespace }} port-forward $POD_NAME 8080:80\n' +
      '{{- end }}\n',
    'templates/_helpers.tpl':
      '{{/*\n' +
      'Expand the name of the chart.\n' +
      '*/}}\n' +
      '{{- define "my-app.name" -}}\n' +
      '{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}\n' +
      '{{- end }}\n' +
      '\n' +
      '{{/*\n' +
      'Create a default fully qualified app name.\n' +
      '*/}}\n' +
      '{{- define "my-app.fullname" -}}\n' +
      '{{- if .Values.fullnameOverride }}\n' +
      '{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}\n' +
      '{{- else }}\n' +
      '{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}\n' +
      '{{- end }}\n' +
      '{{- end }}\n' +
      '\n' +
      '{{/*\n' +
      'Common labels\n' +
      '*/}}\n' +
      '{{- define "my-app.labels" -}}\n' +
      'helm.sh/chart: {{ include "my-app.chart" . }}\n' +
      'app.kubernetes.io/name: {{ include "my-app.name" . }}\n' +
      'app.kubernetes.io/instance: {{ .Release.Name }}\n' +
      'app.kubernetes.io/managed-by: {{ .Release.Service }}\n' +
      '{{- end }}\n',
    'templates/deployment.yaml':
      'apiVersion: apps/v1\n' +
      'kind: Deployment\n' +
      'metadata:\n' +
      '  name: {{ include "my-app.fullname" . }}\n' +
      '  labels:\n' +
      '    {{- include "my-app.labels" . | nindent 4 }}\n' +
      'spec:\n' +
      '  {{- if not .Values.autoscaling.enabled }}\n' +
      '  replicas: {{ .Values.replicaCount }}\n' +
      '  {{- end }}\n' +
      '  selector:\n' +
      '    matchLabels:\n' +
      '      {{- include "my-app.selectorLabels" . | nindent 6 }}\n' +
      '  template:\n' +
      '    metadata:\n' +
      '      labels:\n' +
      '        {{- include "my-app.selectorLabels" . | nindent 8 }}\n' +
      '    spec:\n' +
      '      serviceAccountName: {{ include "my-app.serviceAccountName" . }}\n' +
      '      containers:\n' +
      '        - name: {{ .Chart.Name }}\n' +
      '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"\n' +
      '          ports:\n' +
      '            - name: http\n' +
      '              containerPort: {{ .Values.service.port }}\n' +
      '          livenessProbe:\n' +
      '            {{- toYaml .Values.livenessProbe | nindent 12 }}\n' +
      '          readinessProbe:\n' +
      '            {{- toYaml .Values.readinessProbe | nindent 12 }}\n' +
      '          resources:\n' +
      '            {{- toYaml .Values.resources | nindent 12 }}\n',
    'templates/service.yaml':
      'apiVersion: v1\n' +
      'kind: Service\n' +
      'metadata:\n' +
      '  name: {{ include "my-app.fullname" . }}\n' +
      '  labels:\n' +
      '    {{- include "my-app.labels" . | nindent 4 }}\n' +
      'spec:\n' +
      '  type: {{ .Values.service.type }}\n' +
      '  ports:\n' +
      '    - port: {{ .Values.service.port }}\n' +
      '      targetPort: http\n' +
      '      protocol: TCP\n' +
      '      name: http\n' +
      '  selector:\n' +
      '    {{- include "my-app.selectorLabels" . | nindent 4 }}\n',
    'templates/serviceaccount.yaml':
      '{{- if .Values.serviceAccount.create -}}\n' +
      'apiVersion: v1\n' +
      'kind: ServiceAccount\n' +
      'metadata:\n' +
      '  name: {{ include "my-app.serviceAccountName" . }}\n' +
      '  labels:\n' +
      '    {{- include "my-app.labels" . | nindent 4 }}\n' +
      'automountServiceAccountToken: {{ .Values.serviceAccount.automount }}\n' +
      '{{- end }}\n',
    'templates/hpa.yaml':
      '{{- if .Values.autoscaling.enabled }}\n' +
      'apiVersion: autoscaling/v2\n' +
      'kind: HorizontalPodAutoscaler\n' +
      'metadata:\n' +
      '  name: {{ include "my-app.fullname" . }}\n' +
      'spec:\n' +
      '  scaleTargetRef:\n' +
      '    apiVersion: apps/v1\n' +
      '    kind: Deployment\n' +
      '    name: {{ include "my-app.fullname" . }}\n' +
      '  minReplicas: {{ .Values.autoscaling.minReplicas }}\n' +
      '  maxReplicas: {{ .Values.autoscaling.maxReplicas }}\n' +
      '{{- end }}\n',
    'templates/ingress.yaml':
      '{{- if .Values.ingress.enabled -}}\n' +
      'apiVersion: networking.k8s.io/v1\n' +
      'kind: Ingress\n' +
      'metadata:\n' +
      '  name: {{ include "my-app.fullname" . }}\n' +
      'spec:\n' +
      '  ingressClassName: {{ .Values.ingress.className }}\n' +
      '  rules:\n' +
      '    {{- range .Values.ingress.hosts }}\n' +
      '    - host: {{ .host | quote }}\n' +
      '    {{- end }}\n' +
      '{{- end }}\n',
    'templates/tests/test-connection.yaml':
      'apiVersion: v1\n' +
      'kind: Pod\n' +
      'metadata:\n' +
      '  name: "{{ include "my-app.fullname" . }}-test-connection"\n' +
      '  annotations:\n' +
      '    "helm.sh/hook": test\n' +
      'spec:\n' +
      '  containers:\n' +
      '    - name: wget\n' +
      '      image: busybox\n' +
      '      command: [\'wget\']\n' +
      '      args: [\'{{ include "my-app.fullname" . }}:{{ .Values.service.port }}\']\n' +
      '  restartPolicy: Never\n'
  };

  function fsFiles(ctx, prefix) {
    var abs = U.resolvePath(ctx.cwd, prefix);
    var node = U.findNode(ctx.root, abs);
    var out = [];
    if (!node) return out;
    (function walk(n, rel) {
      U.childrenSorted(n).forEach(function (name) {
        var ch = n.children[name];
        var p = rel === '' ? name : rel + '/' + name;
        if (ch.type === 'dir') walk(ch, p);
        else out.push({ rel: p, content: String(ch.content || '') });
      });
    })(node, '');
    return out;
  }

  function helmCreate(argv, ctx, stdin, HOST) {
    var pos = positionals(stripHead(argv, ['helm', 'create']), ['-p', '--starter', '--description']);
    var name = pos[0];
    if (!name) return fail(['Error: chart name is required']);
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) {
      return fail(['Error: chart name "' + name + '" is invalid: must match regex ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
        + '（Chart 名会同时作为目录名与 K8s 资源名，只能用小写字母、数字与连字符）']);
    }
    var abs = U.resolvePath(ctx.cwd, name);
    if (U.findNode(ctx.root, abs)) {
      return fail(['Error: dir "' + name + '" already exists']);
    }
    var files = {};
    Object.keys(HELM_FILES).forEach(function (k) {
      files[name + '/' + k] = { content: HELM_FILES[k].replace(/my-app/g, name), mode: '644', user: 'root', mtime: '2024-03-18 09:00' };
    });
    files[name + '/charts/.gitkeep'] = { content: '', mode: '644', user: 'root', mtime: '2024-03-18 09:00' };
    window.CC_SHELL.fsAdd(files);
    /* fsAdd 只登记，下一次 createShell 才生效 —— 这里必须立刻把文件写进当前会话的
       虚拟文件系统，否则 `helm create my-app && cat my-app/Chart.yaml` 会读不到。 */
    var parentAbs = U.resolvePath(ctx.cwd, '.');
    var parent = U.findNode(ctx.root, parentAbs);
    var dirName = name;
    if (parent) {
      var dir = { type: 'dir', name: dirName, children: {}, content: '', mode: '755', user: 'root', group: 'root', mtime: '2024-03-18 09:00', target: null };
      Object.keys(files).forEach(function (k) {
        var rel = k.slice(name.length + 1);
        var segs = rel.split('/');
        var cur = dir;
        for (var i = 0; i < segs.length - 1; i++) {
          if (!cur.children[segs[i]]) {
            cur.children[segs[i]] = { type: 'dir', name: segs[i], children: {}, content: '', mode: '755', user: 'root', group: 'root', mtime: '2024-03-18 09:00', target: null };
          }
          cur = cur.children[segs[i]];
        }
        cur.children[segs[segs.length - 1]] = {
          type: 'file', name: segs[segs.length - 1], children: null,
          content: files[k].content, mode: '644', user: 'root', group: 'root',
          mtime: '2024-03-18 09:00', target: null
        };
      });
      parent.children[dirName] = dir;
    }
    return ok(['Creating ' + name]);
  }

  function helmEnv(argv, ctx, stdin, HOST) {
    var home = (HOST && HOST.home) || '/root';
    return ok([
      'HELM_BIN="helm"',
      'HELM_CACHE_HOME="' + home + '/.cache/helm"',
      'HELM_CONFIG_HOME="' + home + '/.config/helm"',
      'HELM_DATA_HOME="' + home + '/.local/share/helm"',
      'HELM_DEBUG="false"',
      'HELM_KUBEAPISERVER=""',
      'HELM_KUBEASUSER=""',
      'HELM_KUBECAFILE=""',
      'HELM_KUBECONTEXT=""',
      'HELM_KUBETOKEN=""',
      'HELM_MAX_HISTORY="10"',
      'HELM_NAMESPACE="' + NS_DEFAULT + '"',
      'HELM_PLUGINS="' + home + '/.local/share/helm/plugins"',
      'HELM_REGISTRY_CONFIG="' + home + '/.config/helm/registry/config.json"',
      'HELM_REPOSITORY_CACHE="' + home + '/.cache/helm/repository"',
      'HELM_REPOSITORY_CONFIG="' + home + '/.config/helm/repositories.yaml"',
      'KUBECONFIG="' + home + '/.kube/config"',
      '',
      '（教学提示："本地能跑、流水线不行"多看一眼这个输出：容器里 HOME 不同，'
      + 'HELM_CACHE_HOME 没挂载会每次重新拉索引，HELM_REPOSITORY_CONFIG 不在就找不到仓库。）'
    ]);
  }

  function helmPlugin(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","plugin"]);
    var act = rest[0];
    var pos = splitArgs(rest, ['--version', '--kubeconfig', '--namespace', '-n']).pos;
    if (act === 'install') {
      var url = pos[1];
      if (!url) return fail(['Error: plugin install requires a plugin URL']);
      var ver = opt(rest, '--version', null);
      if (!/^(https?:\/\/|git@|oci:\/\/)/.test(url)) {
        return fail(['Error: plugin URL must start with http://, https://, git@ or oci://']);
      }
      if (url.indexOf('github.com') === -1 && url.indexOf('helm') === -1) {
        return fail(['Error: plugin install failed: cannot fetch "' + url + '": dial tcp: lookup '
          + String(url).split('/')[2] + ': no such host（教学环境不联网）']);
      }
      var pluginName = String(url).replace(/\.git$/, '').split('/').pop();
      var spec = {
        'helm-diff': { ver: ver || '3.9.1', use: 'helm diff upgrade/apply/revision' },
        'helm-unittest': { ver: ver || '0.5.1', use: 'helm unittest ./charts/my-app' },
        'helm-secrets': { ver: ver || '4.5.1', use: 'helm secrets enc/dec' }
      }[pluginName] || { ver: ver || '1.0.0', use: 'helm ' + pluginName };
      return ok([
        'Installed plugin: ' + pluginName,
        '',
        '（教学环境只登记插件，不下载二进制。真机上 helm plugin install 会把插件脚本放到'
          + ' $HELM_PLUGINS 目录（' + ((HOST && HOST.home) || '/root') + '/.local/share/helm/plugins），'
          + '之后 `' + spec.use + '` 就能用。）',
        '  第三方插件会执行本地命令，只从可信来源安装；团队协作要在 CI 镜像里固定插件版本。'
      ]);
    }
    if (act === 'list' || act === undefined) {
      return ok([
        'NAME           \tVERSION\tDESCRIPTION',
        'diff           \t3.9.1  \tPreview helm upgrade changes as a diff',
        'unittest       \t0.5.1  \tUnit test for helm chart in YAML with ease',
        '',
        '（教学环境预置了 helm-diff 与 helm-unittest 两条示例记录；helm plugin install 可以再加。）'
      ]);
    }
    if (act === 'uninstall' || act === 'remove' || act === 'rm') {
      var pn = pos[1];
      if (!pn) return fail(['Error: plugin name is required']);
      return ok(['Uninstalled plugin: ' + pn]);
    }
    if (act === 'update') {
      return ok(['Updated plugin: diff', 'Updated plugin: unittest']);
    }
    return fail(['Error: unknown command "' + act + '" for "helm plugin"']);
  }

  function helmDependency(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","dependency"]);
    var act = rest[0];
    var pos = splitArgs(rest, ['--verify', '--keyring']).pos;
    var chart = pos[1];
    if (!act) return fail(['Error: "helm dependency" requires a subcommand (update / build / list)']);
    if (!chart) return fail(['Error: chart directory is required（例如 helm dependency ' + act + ' ./charts/my-app）']);
    var abs = U.resolvePath(ctx.cwd, chart);
    var node = U.findNode(ctx.root, abs);
    if (!node) return fail(['Error: file "' + chart + '" does not exist']);
    var chartYaml = U.readFileOrErr(ctx, chart.replace(/\/$/, '') + '/Chart.yaml');
    var chartName = chart.replace(/^.*\//, '');
    var deps = [];
    if (!chartYaml.err) {
      var txt = chartYaml.content;
      chartName = (txt.match(/^name:\s*(\S+)/m) || [])[1] || chartName;
      var dblock = txt.match(/dependencies:([\s\S]*)$/);
      var nameRe = /-\s*name:\s*(\S+)/g, verRe = /version:\s*"?([0-9][^"\s]*)"?/g, repoRe = /repository:\s*"?([^"\s]+)"?/g;
      var names = [], vers = [], repos = [];
      var mm;
      var src = dblock ? dblock[1] : '';
      while ((mm = nameRe.exec(src)) !== null) names.push(mm[1]);
      while ((mm = verRe.exec(src)) !== null) vers.push(mm[1]);
      while ((mm = repoRe.exec(src)) !== null) repos.push(mm[1]);
      names.forEach(function (n, i) {
        deps.push({ name: n, ver: vers[i] || '1.0.0', repo: repos[i] || 'file://../' + n });
      });
    }

    if (act === 'list') {
      var out = ['NAME\tVERSION\tREPOSITORY\tSTATUS'];
      if (!deps.length) {
        return ok(['WARNING: no dependencies at ' + chart + '/charts',
          '',
          '（Chart.yaml 里没有 dependencies，所以没有子 Chart 可列。）']);
      }
      deps.forEach(function (d) {
        out.push(d.name + '\t' + d.ver + '\t' + d.repo + '\tok');
      });
      return ok(out);
    }

    if (act === 'update' || act === 'build') {
      if (act === 'build' && !hasFlag(rest, '--skip-refresh')) {
        /* build 严格按 Chart.lock 重建；没有 lock 就是明确的错误 */
        var lock = U.readFileOrErr(ctx, chart.replace(/\/$/, '') + '/Chart.lock');
        if (lock.err) {
          return fail(['Error: no lock file found: ' + chart + '/Chart.lock'
            + '（helm dependency build 严格按 Chart.lock 重建依赖；先用 helm dependency update 生成它并提交进 Git）']);
        }
      }
      if (!deps.length) {
        return ok(['Saving ' + deps.length + ' charts',
          'Deleting outdated charts',
          '',
          '（Chart.yaml 里没有 dependencies —— update/build 无事可做。）']);
      }
      var lines = ['Hang tight while we grab the latest from your chart repositories...'];
      lines.push('...Successfully got an update from the "myorg" chart repository');
      lines.push('Update Complete. ⎈Happy Helming!⎈');
      lines.push('Saving ' + deps.length + ' charts');
      lines.push('Downloading ' + deps[0].name + ' from repo ' + deps[0].repo);
      lines.push('Deleting outdated charts');
      /* 真的把子 Chart 与 Chart.lock 写进文件系统：后面 cat / git add 才有东西可看 */
      var writes = {};
      var lockLines = ['dependencies:'];
      deps.forEach(function (d) {
        writes[chart.replace(/\/$/, '') + '/charts/' + d.name + '-v' + d.ver + '.tgz'] = { content: '<binary> chart archive ' + d.name + '-' + d.ver + '.tgz', size: 4096 };
        lockLines.push('- name: ' + d.name);
        lockLines.push('  repository: ' + d.repo);
        lockLines.push('  version: ' + d.ver);
      });
      lockLines.push('digest: sha256:' + seedHex(chart + deps.length, 64));
      lockLines.push('generated: "' + '2024-03-18T01:41:22.114382+08:00' + '"');
      writes[chart.replace(/\/$/, '') + '/Chart.lock'] = { content: lockLines.join('\n') + '\n' };
      if (act === 'build' && !hasFlag(rest, '--skip-refresh')) delete writes[chart.replace(/\/$/, '') + '/Chart.lock'];
      writes[chart.replace(/\/$/, '') + '/charts/' + deps[0].name + '/Chart.yaml'] = {
        content: 'apiVersion: v2\nname: ' + deps[0].name + '\nversion: ' + deps[0].ver + '\nappVersion: "1.2.3"\n'
      };
      writeIntoVfs(ctx, writes);
      lines.push('');
      lines.push('（教学提示：' + (act === 'update'
        ? 'update 会**重新解析版本**并生成 Chart.lock —— Chart.lock 必须提交进 Git，团队与 CI 才拿到同一批依赖；'
        : 'build 严格按已有 Chart.lock 重建，可复现，CI 的构建阶段应该用它而不是 update；')
        + (hasFlag(rest, '--skip-refresh') ? '本次 --skip-refresh 表示不刷新索引、直接用本地缓存。' : '') + '）');
      return ok(lines);
    }

    return fail(['Error: unknown command "' + act + '" for "helm dependency"']);
  }

  /* 立刻把文件写进当前会话的虚拟文件系统（fsAdd 只对"下一次 createShell"生效） */
  function writeIntoVfs(ctx, map) {
    Object.keys(map).forEach(function (p) {
      var abs = U.resolvePath(ctx.cwd, p);
      var segs = abs.split('/').filter(Boolean);
      var cur = ctx.root;
      for (var i = 0; i < segs.length - 1; i++) {
        if (!cur.children[segs[i]]) {
          cur.children[segs[i]] = { type: 'dir', name: segs[i], children: {}, content: '', mode: '755', user: 'root', group: 'root', mtime: '2024-03-18 09:00', target: null };
        }
        cur = cur.children[segs[i]];
        if (cur.type !== 'dir') return;   /* 路径被同名文件占了，放弃写入 */
      }
      var last = segs[segs.length - 1];
      var d = map[p] || {};
      cur.children[last] = {
        type: 'file', name: last, children: null,
        content: d.content === undefined ? '' : d.content,
        mode: d.mode || '644', user: d.user || 'root', group: d.group || 'root',
        mtime: d.mtime || '2024-03-18 09:00', target: null,
        explicitSize: d.size
      };
    });
  }

  function helmPackage(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","package"]);
    var P = splitArgs(rest, ['-d', '--destination', '--version', '--app-version', '--key', '--keyring']);
    var pos = P.pos;
    var dir = pos[0];
    if (!dir) return fail(['Error: must specify a chart directory to package']);
    var abs = U.resolvePath(ctx.cwd, dir);
    var node = U.findNode(ctx.root, abs);
    if (!node || node.type !== 'dir') {
      return fail(['Error: stat ' + dir + ': no such file or directory'
        + '（helm package 只接受 Chart **目录**，不是 tgz）']);
    }
    var cy = U.readFileOrErr(ctx, dir.replace(/\/$/, '') + '/Chart.yaml');
    if (cy.err) {
      return fail(['Error: ' + dir + ' is not a chart directory: Chart.yaml not found']);
    }
    var name = (cy.content.match(/^name:\s*(\S+)/m) || [])[1] || dir.replace(/^.*\//, '');
    var version = idxVal(P.idx, '--version', null) || (cy.content.match(/^version:\s*"?([^"\s]+)"?/m) || [])[1] || '0.1.0';
    var appVersion = idxVal(P.idx, '--app-version', null) || (cy.content.match(/^appVersion:\s*"?([^"\s]+)"?/m) || [])[1] || '1.16.0';
    var dest = idxVal(P.idx, ['-d', '--destination'], '.') || '.';
    var tgz = name + '-' + version + '.tgz';
    var destAbs = U.resolvePath(ctx.cwd, dest);
    var writes = {};
    writes[destAbs.replace(/\/$/, '') + '/' + tgz] = {
      content: '<binary> gzip 压缩的 Helm chart（教学环境用占位内容代替真实的 tar.gz）',
      size: 3721, mtime: '2024-03-18 09:00'
    };
    writeIntoVfs(ctx, writes);
    var lines = ['Successfully packaged chart and saved it to: ' + dest.replace(/\/$/, '') + '/' + tgz];
    lines.push('');
    lines.push('（教学提示：version 是 Chart 版本（tgz 文件名用它），appVersion 是应用版本（只作展示，'
      + '改了不会改文件名）。本次 appVersion 记录为 ' + appVersion + '。');
    lines.push('  打包前先 helm dependency update，charts/ 里的子 Chart 才会一起进包；'
      + '.helmignore 用来排除测试文件与大体积资源。）');
    return ok(lines);
  }

  function helmPull(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","pull"]);
    var P = splitArgs(rest, ['--version', '--untar-dir', '-d', '--destination', '--repo', '--ca-file',
      '--cert-file', '--key-file', '--username', '--password', '--prov']);
    var pos = P.pos;
    var ref = pos[0];
    if (!ref) return fail(['Error: must specify a chart to pull（例如 helm pull bitnami/nginx）']);
    var version = idxVal(P.idx, '--version', null) || '15.14.0';
    var untar = hasFlag(rest, '--untar');
    var untarDir = idxVal(P.idx, '--untar-dir', null);
    var dest = idxVal(P.idx, ['-d', '--destination'], '.') || '.';
    var isOci = ref.indexOf('oci://') === 0;
    var chartName = ref.replace(/^.*\//, '');
    if (isOci) {
      if (!/^oci:\/\/swr\./.test(ref)) {
        return fail(['Error: could not load chart oci://' + ref.replace(/^oci:\/\//, '')
          + ': dial tcp: lookup ' + ref.replace(/^oci:\/\//, '').split('/')[0] + ': no such host（教学环境不联网）']);
      }
      var lastName = ref.replace(/^.*\//, '');
      var tgzO = lastName + '-' + version + '.tgz';
      var w = {};
      w[dest.replace(/\/$/, '') + '/' + tgzO] = { content: '<binary> 来自 SWR OCI 仓库的 chart 包（占位内容）', size: 5120 };
      if (untar) {
        w[(untarDir || '.').replace(/\/$/, '') + '/' + lastName + '/Chart.yaml'] = {
          content: 'apiVersion: v2\nname: ' + lastName + '\nversion: ' + version + '\nappVersion: "1.4.2"\ndescription: 订单 Web 服务\n'
        };
        w[(untarDir || '.').replace(/\/$/, '') + '/' + lastName + '/values.yaml'] = {
          content: 'replicaCount: 2\nimage:\n  repository: swr.cn-north-4.myhuaweicloud.com/myorg/' + lastName + '\n  tag: "1.4.2"\n'
        };
        w[(untarDir || '.').replace(/\/$/, '') + '/' + lastName + '/templates/deployment.yaml'] = {
          content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ include "' + lastName + '.fullname" . }}\n'
        };
        w[(untarDir || '.').replace(/\/$/, '') + '/' + lastName + '/charts/.gitkeep'] = { content: '' };
      }
      writeIntoVfs(ctx, w);
      return ok(['Pulled: ' + ref + ':' + version,
        'Digest: sha256:' + seedHex(ref + version, 64),
        untar ? '（已解包到 ' + (untarDir || '.') + '/' + lastName + '/）' : '（已保存 ' + dest + '/' + tgzO + '）',
        '',
        '（教学提示：OCI 仓库里的 Chart **只能**用 helm pull / helm show chart oci://... 访问，'
        + '不能用 helm repo add + helm search repo 检索。）']);
    }
    if (ref.indexOf('/') === -1) {
      return fail(['Error: repo ' + ref + ': chart "' + ref + '" not found'
        + '（仓库里的 Chart 要写全 `<仓库>/<Chart>`，例如 bitnami/nginx）']);
    }
    var repo = ref.split('/')[0];
    var chart = ref.split('/')[1];
    var known = { bitnami: ['nginx', 'mysql', 'redis', 'kube-prometheus'], myorg: ['web', 'worker', 'gateway'], 'prometheus-community': ['kube-prometheus-stack'] };
    if (!known[repo] || known[repo].indexOf(chart) === -1) {
      return fail(['Error: repo ' + repo + ': chart "' + chart + '" not found in ' + repo
        + ' index. (try \'helm repo update\'): no chart name found']);
    }
    var writes2 = {};
    var tgzName = chart + '-' + version + '.tgz';
    if (untar) writes2[(untarDir || '.') + '/' + chart + '/Chart.yaml'] = {
      content: 'apiVersion: v2\nname: ' + chart + '\nversion: ' + version + '\nappVersion: "1.25.3"\ndescription: ' + chart + ' chart\n'
    };
    else writes2[dest.replace(/\/$/, '') + '/' + tgzName] = { content: '<binary> chart archive', size: 8192 };
    if (untar) {
      writes2[(untarDir || '.') + '/' + chart + '/values.yaml'] = { content: 'replicaCount: 1\nimage:\n  repository: ' + chart + '\n  tag: "1.25.3"\n' };
      writes2[(untarDir || '.') + '/' + chart + '/templates/deployment.yaml'] = { content: 'apiVersion: apps/v1\nkind: Deployment\n' };
      writes2[(untarDir || '.') + '/' + chart + '/charts/.gitkeep'] = { content: '' };
    }
    writeIntoVfs(ctx, writes2);
    return ok(['Pulled: ' + repo + '/' + chart + ':' + version,
      'Digest: sha256:' + seedHex(ref + version, 64),
      untar ? '（已解包到 ' + (untarDir || '.') + '/' + chart + '/）' : '（已保存 ' + dest.replace(/\/$/, '') + '/' + tgzName + '）',
      '',
      '（教学提示：pull 下来改属于 fork 上游 Chart，升级时要自己合并变更；'
      + '长期维护成本高，优先用 values 覆盖而不是改模板。）']);
  }

  function helmPush(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","push"]);
    var pos = splitArgs(rest, ['--ca-file', '--cert-file', '--key-file']).pos;
    var tgz = pos[0], dest = pos[1];
    if (!tgz || !dest) return fail(['Error: "helm push" requires 2 arguments: <chart.tgz> <oci://...>']);
    if (dest.indexOf('oci://') !== 0) {
      return fail(['Error: cannot push chart to a non-OCI registry: ' + dest
        + '（helm push 只支持 OCI，地址必须以 oci:// 开头）']);
    }
    var r = U.readFileOrErr(ctx, tgz);
    if (r.err) {
      return fail(['Error: stat ' + tgz + ': no such file or directory'
        + '（helm push 只接受 **tgz 包**，不接受目录：先 helm package ./charts/my-app -d ./dist）']);
    }
    if (String(tgz).indexOf('.tgz') === -1) {
      return fail(['Error: ' + tgz + ' is not a chart archive (.tgz)']);
    }
    var base = String(tgz).replace(/^.*\//, '').replace(/\.tgz$/, '');
    var m = base.match(/^(.*)-([0-9][^-]*)$/);
    var cname = m ? m[1] : base;
    var cver = m ? m[2] : '0.1.0';
    return ok(['Pushed: ' + dest + '/' + cname + ':' + cver,
      'Digest: sha256:' + seedHex(tgz + cver, 64),
      '',
      '（教学提示：OCI 地址结尾只写到**组织名/命名空间**（' + dest + '），'
        + '再拼 Chart 名会变成多套一层、安装路径对不上。）',
      '  推送到 OCI 之后**不能**用 helm repo add + helm search repo 检索，'
        + '只能用 helm show chart oci://... 或 helm pull oci://... 验证。',
      '  版本号已存在时会被覆盖（取决于仓库策略），生产发布请保证版本号只增不改。'
    ]);
  }

  function helmRegistry(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","registry"]);
    var act = rest[0];
    var pos = splitArgs(rest, ['-u', '--username', '-p', '--password', '--password-stdin', '--ca-file', '--cert-file', '--key-file']).pos;
    if (act === 'login') {
      var user = opt(rest, ['-u', '--username'], null);
      var host = pos[pos.length - 1];
      if (!user || !host) return fail(['Error: username and hostname are required for login']);
      if (pos.length < 2) return fail(['Error: hostname is required for login']);
      var reg = pos[1] || host;
      return ok(['Login Succeeded',
        '',
        '（教学环境不真的登录：真机上 helm registry login 会把凭据写进'
        + ' ~/.config/helm/registry/config.json，密码建议用 --password-stdin 或临时登录指令，别写进脚本。）']);
    }
    if (act === 'logout') {
      var h2 = pos[1];
      if (!h2) return fail(['Error: hostname is required for logout']);
      return ok(['Removing login credentials for ' + h2]);
    }
    return fail(['Error: unknown command "' + act + '" for "helm registry"']);
  }

  /* helm search hub：需要访问 Artifact Hub，离线环境必须如实说明 */
  function helmSearchHub(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","search","hub"]);
    var pos = splitArgs(rest, ['--endpoint', '--max-col-width', '-o', '--output']).pos;
    var kw = pos[2] || pos[1] || '';
    return fail(['Error: looks like "https://hub.helm.sh/api/v1/charts" is not a valid chart repository or cannot be reached: '
      + 'Get "https://hub.helm.sh/api/v1/charts": dial tcp: lookup hub.helm.sh: no such host',
      '',
      '（`helm search hub` 要访问公网的 Artifact Hub，教学环境不联网，所以这里如实报网络错误，'
      + '而不是编一份搜索结果。）',
      '',
      '离线可用的替代：',
      '  helm search repo ' + (kw || 'nginx') + '        # 在**已添加的仓库**索引里搜（教学环境内置了 myorg 与 bitnami）',
      '  helm repo add bitnami https://charts.bitnami.com/bitnami && helm repo update',
      '  helm show chart bitnami/nginx            # 看某个 Chart 的元数据',
      '',
      '（Artifact Hub 收录的是**第三方仓库**的 Chart，装了之后仍需 helm repo add 才能 install。）']);
  }

  /* helm diff upgrade（helm-diff 插件） */
  function helmDiff(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","search","hub"]);
    /* ⚠️ stripHead 只剥掉了 `helm`，rest 里第一个词是 **`diff`**（子命令组名），
       真正的动作在 rest[1]。早先直接 `act = rest[0]`，于是每次调用 act 都是 "diff"，
       直接命中下面那句"未知子命令"，报出 `unknown command "helm diff diff"` ——
       站内 hl-plugin 的示例 `helm diff upgrade my-app ./charts/my-app -n prod`
       一条完全正确的命令永远跑不通。这里先把 `diff` 剥掉，后面的下标才对得上。 */
    if (rest[0] === 'diff') rest = rest.slice(1);
    var act = rest[0];
    var pos = splitArgs(rest, ['-n', '--namespace', '-f', '--values', '--set', '--set-string', '--version', '--kube-context']).pos;
    if (act !== 'upgrade') {
      return fail(['Error: unknown command "helm diff ' + (act || '') + '"（教学环境实现了 helm diff upgrade）']);
    }
    var name = pos[1], chart = pos[2];
    var ns = opt(rest, ['-n', '--namespace'], NS_DEFAULT);
    if (!name || !chart) return fail(['Error: "helm diff upgrade" requires 2 arguments: <release> <chart>']);
    var files = optAll(rest, ['-f', '--values']);
    var sets = optAll(rest, ['--set', '--set-string']);
    var newTag = null;
    sets.forEach(function (s) {
      var kv = String(s).split('=');
      if (kv[0] === 'image.tag') newTag = kv.slice(1).join('=');
    });
    var lines = [
      'default, ' + name + ', Deployment (' + 'apps/v1' + ') has changed:',
      '  - Deployment/' + (chart.replace(/^.*\//, '') || name) + ' (was ReplicaSet/' + name + '-7d9c4b8f5)',
      '  + Deployment/' + (chart.replace(/^.*\//, '') || name) + ' (new ReplicaSet/' + name + '-5f7b9c8d6)',
      '  - spec.replicas: 2',
      '  + spec.replicas: 3',
      '  - spec.template.spec.containers[0].image: ...web:1.2.3',
      '  + spec.template.spec.containers[0].image: ...web:' + (newTag || '1.2.4'),
      '',
      '（教学提示：helm diff 由 **helm-diff 插件**提供，比 --dry-run 直观得多 —— 它渲染后与集群里的实际对象逐字段比，'
      + '能看清"这次升级会改哪些资源、改哪些字段"，是升级前的最后一道闸。）',
      '  安装：helm plugin install https://github.com/databus23/helm-diff',
      '  本次用到的 values 文件：' + (files.length ? files.join(', ') : '（无）')
        + (newTag ? '；--set image.tag=' + newTag : '')
    ];
    return ok(lines);
  }

  /* helm show readme / crds / all：内置实现只做了 values / chart，
     另外三个同样是常用子命令，这里补齐（readme 尤其常看）。 */
  function helmShow(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","show"]);
    var what = rest[1];
    if (['readme', 'crds', 'all'].indexOf(what) === -1) return null;   /* values/chart 交回内置 */
    var ref = rest[2];
    if (!ref) return fail(['Error: chart not specified']);
    var repo = String(ref).split('/')[0];
    var chart = String(ref).split('/')[1] || '';
    var k = chart.toLowerCase();
    var READMES = {
      mysql: [
        '# Bitnami MySQL',
        '',
        'MySQL 是开源的关系型数据库。这个 Chart 会用 StatefulSet 部署一主多从，',
        '并用 Secret 保存 root 密码。',
        '',
        '## TL;DR',
        '',
        '```console',
        '$ helm install my-release oci://registry-1.docker.io/bitnamicharts/mysql',
        '```',
        '',
        '## ⚠️ 生产环境必读',
        '',
        '1. **必须**用 `auth.rootPassword` 或 `auth.existingSecret` 指定密码，不要用默认随机密码后不管；',
        '2. 持久化必须开 `primary.persistence.enabled=true`，副本数大于 1 时**不共享存储**，每副本一块盘；',
        '3. 从库复制账号由 `auth.replicationPassword` 控制，轮转密码会导致复制中断；',
        '4. 备份请在业务低峰做（xtrabackup / mysqldump 都会占 IO），并验证备份可恢复。'
      ].join('\n'),
      redis: [
        '# Bitnami Redis',
        '',
        'Redis 是内存键值库。这个 Chart 默认部署主从 + Sentinel，可用 `architecture=standalone` 换成单机。',
        '',
        '## 常用参数',
        '',
        '| 参数 | 说明 | 默认 |',
        '| --- | --- | --- |',
        '| `architecture` | `replication` 或 `standalone` | `replication` |',
        '| `auth.enabled` | 是否启用密码 | `true` |',
        '| `auth.password` | 密码（不写就随机生成） | `""` |',
        '| `master.persistence.enabled` | 是否持久化 | `true` |',
        '| `metrics.enabled` | 是否开 Prometheus 指标 | `false` |',
        '',
        '## 注意',
        '',
        '- Redis 是**缓存不是数据库**：开了持久化也不等于不会丢数据（AOF/RDB 都有窗口），关键数据必须有源可回灌；',
        '- `maxmemory-policy` 不设的话内存满了会写失败，生产建议 `allkeys-lru` 并配好 `maxmemory`。'
      ].join('\n'),
      nginx: [
        '# Bitnami Nginx',
        '',
        'Nginx 静态站点与反向代理。默认用 Deployment + Service(ClusterIP) 部署。',
        '',
        '## 常用参数',
        '',
        '- `service.type`：`ClusterIP` / `NodePort` / `LoadBalancer`',
        '- `ingress.enabled=true`：自动生成 Ingress',
        '- `serverBlock` / `extraConfigMapMounts`：注入自定义配置',
        '- `cloneStaticSiteFromGit`：启动时从 Git 仓库拉静态文件'
      ].join('\n')
    };
    var readme = READMES[k] || ('# ' + (chart || ref) + '\n\n（教学环境只内置了 bitnami/mysql、bitnami/redis、bitnami/nginx 三个 Chart 的 README 文本。）');
    var CHART_YAML = [
      'annotations:',
      '  category: Infrastructure',
      'apiVersion: v2',
      'appVersion: "' + (k === 'mysql' ? '8.0.36' : k === 'redis' ? '7.2.4' : '1.25.3') + '"',
      'description: ' + (k === 'mysql' ? 'MySQL 主从 StatefulSet' : k === 'redis' ? 'Redis 主从 + Sentinel' : 'Nginx 静态站点与反向代理'),
      'home: https://github.com/bitnami/charts/tree/main/bitnami/' + (chart || 'app'),
      'icon: https://bitnami.com/assets/stacks/' + (chart || 'app') + '/img/' + (chart || 'app') + '-stack-220x234.png',
      'keywords:', '  - ' + (chart || 'app'), '  - database',
      'maintainers:',
      '  - name: Bitnami',
      '    url: https://github.com/bitnami/charts',
      'name: ' + (chart || 'app'),
      'sources:', '  - https://github.com/bitnami/containers/tree/main/bitnami/' + (chart || 'app'),
      'version: ' + (k === 'mysql' ? '9.14.1' : k === 'redis' ? '18.19.1' : '15.14.0')
    ].join('\n');

    if (what === 'readme') return ok(readme.split('\n'));
    if (what === 'crds') {
      return ok(['（该 Chart 不包含 CRD —— CRD 只在 Operator 类 Chart（如 prometheus-operator）里才有。）',
        '',
        '判断方法：helm show crds <chart> 有输出说明它带 CRD；装带 CRD 的 Chart 要留意',
        'upgrade 时 CRD **不会被自动升级**，需要手工 apply 新的 CRD。']);
    }
    var L = ['---'];
    L = L.concat(CHART_YAML.split('\n'));
    L.push('---');
    L = L.concat(readme.split('\n'));
    L.push('---');
    L = L.concat(['replicaCount: ' + (k === 'mysql' ? '1' : '2'), 'image:', '  repository: bitnami/' + (chart || 'app'), '  tag: "' + (k === 'mysql' ? '8.0.36' : k === 'redis' ? '7.2.4' : '1.25.3') + '"']);
    L.push('');
    L.push('（教学提示：helm show all = chart + readme + values + crds 一次打完，几百上千行，'
      + '实际排查时按需只看其中一段更高效。）');
    return ok(L);
  }

  /* helm get（--revision 取历史版本）：内置实现只认当前版本 */
  function helmGet(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["helm","get"]);
    var what = rest[1];
    if (what !== 'manifest' && what !== 'values' && what !== 'all' && what !== 'notes' && what !== 'hooks') return null;
    var rev = opt(rest, '--revision', null);
    if (rev === null) return null;   /* 不带 --revision 就交回内置实现 */
    var name = positionals(rest, ['-n', '--namespace', '--revision', '-o', '--output'])[2];
    var ns = nsOf(rest);
    if (!/^\d+$/.test(String(rev))) {
      return fail(['Error: invalid argument "' + rev + '" for "--revision" flag: strconv.ParseInt: parsing "' + rev + '": invalid syntax']);
    }
    if (String(rev) === '0') {
      return fail(['Error: release: not found（revision 0 不是有效版本号，从 1 开始）']);
    }
    if (what === 'manifest') {
      return ok([
        '---',
        '# Source: my-app/templates/serviceaccount.yaml',
        'apiVersion: v1',
        'kind: ServiceAccount',
        'metadata:',
        '  name: ' + name,
        '  namespace: ' + ns,
        '---',
        '# Source: my-app/templates/service.yaml',
        'apiVersion: v1',
        'kind: Service',
        'metadata:',
        '  name: ' + name + '-my-app',
        '  namespace: ' + ns,
        'spec:',
        '  type: ClusterIP',
        '  ports:',
        '    - port: 80',
        '      targetPort: http',
        '---',
        '# Source: my-app/templates/deployment.yaml',
        'apiVersion: apps/v1',
        'kind: Deployment',
        'metadata:',
        '  name: ' + name + '-my-app',
        '  namespace: ' + ns,
        'spec:',
        '  replicas: ' + (String(rev) === '3' ? '2' : '2'),
        '  template:',
        '    spec:',
        '      containers:',
        '        - name: my-app',
        '          image: "swr.cn-north-4.myhuaweicloud.com/myorg/my-app:' + (String(rev) === '3' ? '1.4.2' : '1.4.1') + '"',
        '',
        '（教学提示：**这与当前线上生效的清单不同** —— --revision ' + rev + ' 取的是历史版本 ' + rev + ' 渲染并提交的结果，'
        + '用它和 `helm get manifest ' + name + '` 对比就能看清"这次升级到底改了什么"。）'
      ]);
    }
    return ok(['REVISION: ' + rev,
      'USER-SUPPLIED VALUES:',
      'image:',
      '  tag: ' + (String(rev) === '3' ? '1.4.2' : '1.4.1'),
      'replicaCount: 2',
      '',
      '（教学提示：--revision 取历史版本的值，用于回答"上一版到底配了什么"。）']);
  }

  window.CC_HELM_EXTRA = {
    create: helmCreate,
    env: helmEnv,
    plugin: helmPlugin,
    dependency: helmDependency,
    dep: helmDependency,
    package: helmPackage,
    pull: helmPull,
    fetch: helmPull,
    push: helmPush,
    registry: helmRegistry,
    diff: helmDiff,
    search: function (argv, ctx, stdin, HOST) {
      if (argv[1] === 'hub') return helmSearchHub(argv, ctx, stdin, HOST);
      return null;   /* search repo 交回内置实现 */
    },
    show: helmShow,
    get: helmGet
  };

  /* ======================================================================
     6. kubeadm / argocd / promtool / haproxy
     ====================================================================== */

  var KUBEADM_VERSION = 'v1.27.5';
  var KUBEADM_JOIN_TOKEN = 'abcdef.0123456789abcdef';

  function kubeadmParse(argv, withValue) {
    var idx = {}, pos = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.charAt(0) === '-' && a.length > 1) {
        var eq = a.indexOf('=');
        if (eq !== -1) {
          idx[a.slice(0, eq)] = a.slice(eq + 1);
        } else if (withValue.indexOf(a) !== -1) {
          idx[a] = argv[i + 1] === undefined ? '' : String(argv[++i]);
        } else {
          idx[a] = true;
        }
        continue;
      }
      pos.push(a);
    }
    return { idx: idx, pos: pos };
  }

  function optAllIdx(idx, names) {
    var out = [];
    names.forEach(function (n) { if (idx[n] !== undefined) out.push(String(idx[n])); });
    return out;
  }

  var KUBEADM_VALUE_OPTS = ['--token', '--ttl', '--cri-socket', '--pod-network-cidr',
    '--image-repository', '--control-plane-endpoint', '--discovery-token-ca-cert-hash',
    '--apiserver-advertise-address', '--kubernetes-version', '--config',
    '--ignore-preflight-errors', '--certificate-key', '--node-name', '--patches', '--feature-gates'];

  function kubeadm(argv, ctx, stdin, HOST) {
    /* 引擎传给命令实现的 argv **不含命令名本身**（与 docker 子命令的写法一致），
       但为了容错，argv[0] 万一就是 'kubeadm' 也能正确处理。 */
    var rest = stripHead(argv, ["kubeadm"]);
    var sub = rest[0];
    var P = kubeadmParse(rest, KUBEADM_VALUE_OPTS);
    var pos = [null].concat(P.pos);   /* pos[0] 占住子命令位，与旧代码的索引保持一致 */
    var opt = function (names, def) {
      var list = typeof names === 'string' ? [names] : names;
      for (var i = 0; i < list.length; i++) if (P.idx[list[i]] !== undefined) return P.idx[list[i]];
      return def;
    };
    var hasFlag = function (names) {
      var list = typeof names === 'string' ? [names] : names;
      return list.some(function (n) { return P.idx[n] !== undefined; });
    };

    if (!sub) {
      return ok(['kubeadm: 管理集群生命周期的官方工具',
        '',
        '常用的几类：',
        '  kubeadm init        初始化第一个控制面节点',
        '  kubeadm join        把节点加进已有集群',
        '  kubeadm token       管理加入集群用的引导令牌',
        '  kubeadm upgrade     升级集群（plan → apply → node）',
        '  kubeadm reset       把当前节点从集群里摘除',
        '',
        '（教学环境实现的子命令：init / join / token create|list|delete / upgrade plan|apply|node / reset / version）']);
    }

    if (sub === 'version') {
      return ok(['kubeadm version: &version.Info{Major:"1", Minor:"27", GitVersion:"' + KUBEADM_VERSION
        + '", GitCommit:"a8673e74b0e9e5b6f1d0e6e7a1b2c3d4e5f60718", GitTreeState:"clean", '
        + 'BuildDate:"2023-09-13T09:23:11Z", GoVersion:"go1.20.10", Compiler:"gc", Platform:"linux/amd64"}']);
    }

    if (sub === 'init') {
      var cidr = opt(rest, '--pod-network-cidr', null);
      var repo = opt(rest, '--image-repository', 'registry.k8s.io');
      var endpoint = opt(rest, '--control-plane-endpoint', null);
      if (!cidr) {
        return fail(['error: --pod-network-cidr is required when using kubeadm init'
          + '（不会写就照抄：kubeadm init --pod-network-cidr=10.244.0.0/16 --image-repository=registry.aliyuncs.com/google_containers）']);
      }
      if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(cidr)) {
        return fail(['error: invalid CIDR "' + cidr + '": invalid CIDR address: ' + cidr]);
      }
      var uploadCerts = hasFlag(rest, '--upload-certs');
      return ok([
        '[init] Using Kubernetes version: ' + KUBEADM_VERSION,
        '[preflight] Running pre-flight checks',
        '\t[WARNING SystemVerification]: missing cgroups: memory',
        '[preflight] Pulling images required for setting up a Kubernetes cluster',
        '  · ' + repo + '/kube-apiserver:' + KUBEADM_VERSION,
        '  · ' + repo + '/kube-controller-manager:' + KUBEADM_VERSION,
        '  · ' + repo + '/kube-scheduler:' + KUBEADM_VERSION,
        '  · ' + repo + '/kube-proxy:' + KUBEADM_VERSION,
        '  · ' + repo + '/pause:3.9',
        '  · ' + repo + '/etcd:3.5.7-0',
        '  · ' + repo + '/coredns:v1.10.1',
        '[certs] Using certificateDir folder "/etc/kubernetes/pki"',
        '[certs] Generating "ca" certificate and key',
        '[kubeconfig] Using kubeconfig folder "/etc/kubernetes"',
        '[kubeconfig] Writing "admin.conf" kubeconfig file',
        '[etcd] Creating static Pod manifest for local etcd in "/etc/kubernetes/manifests"',
        '[control-plane] Creating static Pod manifest for "kube-apiserver"',
        '[control-plane] Creating static Pod manifest for "kube-controller-manager"',
        '[control-plane] Creating static Pod manifest for "kube-scheduler"',
        '[mark-control-plane] Marking the node as control-plane by adding the labels: [node-role.kubernetes.io/control-plane node.kubernetes.io/exclude-from-external-load-balancers]',
        '[mark-control-plane] Marking the node as control-plane by adding the taints [node-role.kubernetes.io/control-plane:NoSchedule]',
        '[bootstrap-token] Using token: ' + KUBEADM_JOIN_TOKEN,
        '[addons] Applied essential addon: CoreDNS',
        '[addons] Applied essential addon: kube-proxy',
        '',
        'Your Kubernetes control-plane has initialized successfully!',
        '',
        'To start using your cluster, you need to run the following as a regular user:',
        '',
        '  mkdir -p $HOME/.kube',
        '  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config',
        '  sudo chown $(id -u):$(id -g) $HOME/.kube/config',
        '',
        'You should now deploy a pod network to the cluster.',
        'Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:',
        '  https://kubernetes.io/docs/concepts/cluster-administration/addons/',
        '',
        'Then you can join any number of worker nodes by running the following on each as root:',
        '',
        'kubeadm join ' + (endpoint || '10.0.1.11:6443') + ' --token ' + KUBEADM_JOIN_TOKEN + ' \\',
        '        --discovery-token-ca-cert-hash sha256:' + seedHex('ca-cert-hash', 64),
        uploadCerts ? '\n（--upload-certs：控制面证书已加密上传到 kubeadm-certs Secret，'
          + '其它控制面节点可用 --control-plane --certificate-key <key> 加入。）' : '',
        '',
        '（教学提示：init 之后**必须装网络插件**（Calico/Flannel），否则 CoreDNS 一直是 Pending、'
        + '节点也一直 NotReady。--pod-network-cidr 要与插件声明的网段一致。）',
        '（pod 网段本次为 ' + cidr + '；镜像仓库为 ' + repo + ' —— 国内环境常用阿里云镜像站，'
        + '否则 kubeadm 会卡在拉 registry.k8s.io 的镜像上。）'
      ].filter(function (x) { return x !== ''; }));
    }

    if (sub === 'join') {
      var addr = pos[1];
      var token = opt(rest, '--token', null);
      var hash = opt(rest, '--discovery-token-ca-cert-hash', null);
      if (!addr) return fail(['error: <control-plane-address> is required（kubeadm join 10.0.1.11:6443 --token ...）']);
      if (!token) {
        return fail(['error: --token is required（在控制面节点上用 kubeadm token create --print-join-command 取一条完整的加入命令）']);
      }
      if (!/^[a-z0-9]{6}\.[a-z0-9]{16}$/.test(String(token))) {
        return fail(['error: invalid token "' + token + '": token must be of the form [a-z0-9]{6}.[a-z0-9]{16}']);
      }
      if (!hash) {
        return fail(['error: --discovery-token-ca-cert-hash is required'
          + '（它的作用是校验控制面证书，少了这一项等于放弃身份校验）']);
      }
      if (!/^sha256:[0-9a-f]{64}$/.test(String(hash))) {
        return fail(['error: invalid hash "' + hash + '": expected sha256:<64 位十六进制>']);
      }
      return ok([
        '[preflight] Running pre-flight checks',
        '[preflight] Reading configuration from the cluster...',
        '[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"',
        '[kubelet-start] Starting the kubelet',
        '[kubelet-start] Waiting for the kubelet to perform the TLS Bootstrap...',
        '',
        'This node has joined the cluster:',
        '* Certificate signing request was sent to apiserver and a response was received.',
        '* The Kubelet was informed of the new secure connection details.',
        '',
        'Run \'kubectl get nodes\' on the control-plane to see this node join the cluster.',
        '',
        '（教学提示：join 成功后节点先是 NotReady，要等网络插件的 DaemonSet 在这个节点上就绪；'
        + '令牌默认 24 小时过期，过期了就重新 kubeadm token create --print-join-command。）'
      ]);
    }

    if (sub === 'token') {
      var tact = rest[1];
      if (tact === 'list') {
        return ok(['TOKEN                     TTL         EXPIRES                USAGES                   DESCRIPTION                                                EXTRA GROUPS',
          KUBEADM_JOIN_TOKEN + '   <forever>   <never>                authentication,signing   <none>                                                     system:bootstrappers:kubeadm:default-node-token',
          '9f8e7d.6c5b4a3d2e1f0a9b   <invalid>   2024-03-17T09:41:02Z   authentication,signing   <none>                                                     system:bootstrappers:kubeadm:default-node-token',
          '',
          '（<invalid> 表示已过期：节点加不进来时先看这一列，用 kubeadm token create 重新生成。）']);
      }
      if (tact === 'create') {
        var ttl = opt(rest, '--ttl', '24h');
        if (!/^\d+[smh]$/.test(String(ttl)) && ttl !== '0') {
          return fail(['error: invalid --ttl "' + ttl + '": must be a duration such as 2h, 30m']);
        }
        var printJoin = hasFlag(rest, '--print-join-command');
        var newToken = 'k3n8fa.' + seedHex('token-' + ttl, 16);
        if (printJoin) {
          return ok(['kubeadm join 10.0.1.11:6443 --token ' + newToken + ' --discovery-token-ca-cert-hash sha256:' + seedHex('ca-cert-hash', 64),
            '',
            '（教学提示：这条命令直接粘到新节点上执行即可 —— 令牌默认 24 小时过期，本次 --ttl=' + ttl + '。'
            + 'ca-cert-hash 是控制面 CA 证书的指纹，用来校验你连的是不是真的控制面。）']);
        }
        return ok([newToken]);
      }
      if (tact === 'delete') {
        var delTok = rest[2];
        if (!delTok) return fail(['error: token is required']);
        if (!/^[a-z0-9]{6}\.[a-z0-9]{16}$/.test(String(delTok))) {
          return fail(['error: invalid token "' + delTok + '": token must be of the form [a-z0-9]{6}.[a-z0-9]{16}']);
        }
        return ok(['（教学环境不真的吊销令牌；真机上这条命令会让持有该令牌的节点再也无法重新加入 —— '
          + '节点被回收时应该吊销它。）']);
      }
      return fail(['error: unknown command "kubeadm token ' + (tact || '') + '"']);
    }

    if (sub === 'upgrade') {
      var uact = rest[1];
      if (uact === 'plan') {
        return ok([
          '[upgrade/versions] Cluster version: v1.27.5',
          '[upgrade/versions] kubeadm version: ' + KUBEADM_VERSION,
          'Components that must be upgraded manually after you have upgraded the control plane with \'kubeadm upgrade apply\':',
          'COMPONENT   CURRENT       TARGET',
          'kubelet     3 x v1.27.5   v1.29.0',
          '',
          'Upgrade to the latest stable version:',
          '',
          'COMPONENT                 CURRENT   TARGET',
          'kube-apiserver            v1.27.5   v1.29.0',
          'kube-controller-manager   v1.27.5   v1.29.0',
          'kube-scheduler            v1.27.5   v1.29.0',
          'kube-proxy                v1.27.5   v1.29.0',
          'CoreDNS                   v1.10.1   v1.11.1',
          'etcd                      3.5.7-0   3.5.10-0',
          '',
          'You can now apply the upgrade by executing the following command:',
          '',
          '	kubeadm upgrade apply v1.29.0',
          '',
          '（教学提示：升级**不能跳小版本**（1.27 → 1.29 要经过 1.28），且必须先备份 etcd。'
          + '升级顺序：控制面 → kubelet/kubectl 包 → 工作节点。）'
        ]);
      }
      if (uact === 'apply') {
        var target = rest[2];
        if (!target) return fail(['error: <version> is required（kubeadm upgrade apply v1.29.0）']);
        if (!/^v1\.\d+\.\d+$/.test(String(target))) {
          return fail(['error: invalid version "' + target + '": must be a semantic version like v1.29.0']);
        }
        var cur = [1, 27, 5];
        var want = String(target).replace(/^v/, '').split('.').map(Number);
        if (want[0] !== cur[0] || want[1] - cur[1] > 1) {
          return fail(['[upgrade/version] FATAL: the version skew between the current version and the target version is not supported',
            '  当前 v1.27.5 → 目标 ' + target + '：kubeadm 只允许**逐个小版本**升级（v1.27 → v1.28 → v1.29）。',
            '  跨版本请先 kubeadm upgrade apply v1.28.x，再升到 ' + target + '。']);
        }
        return ok([
          '[upgrade/preflight] Running pre-flight checks',
          '[upgrade] Reading configuration from the cluster...',
          '[upgrade] Running cluster health checks',
          '[upgrade/version] You have chosen to change the cluster version to "' + target + '"',
          '[upgrade/apply] Upgrading your Static Pod-hosted control plane to version "' + target + '"...',
          '[upgrade/staticpods] Writing new Static Pod manifests to "/etc/kubernetes/manifests"',
          '[upgrade/staticpods] Moved new manifest to "/etc/kubernetes/manifests/kube-apiserver.yaml"',
          '[upgrade/staticpods] Restarting the kubelet',
          '[upgrade/apply] Upgrading the kube-proxy DaemonSet',
          '[upgrade/apply] Upgrading CoreDNS',
          '[upgrade/apply] Upgrading your kubelet configuration',
          '[addons] Applied essential addon: CoreDNS',
          '[addons] Applied essential addon: kube-proxy',
          '',
          '[upgrade/successful] SUCCESS! Your cluster was upgraded to "' + target + '". Enjoy!',
          '',
          '[upgrade/kubelet] Now that your control plane is upgraded, please proceed with upgrading your kubelets if you haven\'t already done so.',
          '',
          '（教学提示：升级前**一定先备份 etcd**（etcdctl snapshot save）。升级完控制面后，'
          + '再逐台 kubelet upgrade node → 装新版 kubelet/kubectl → 重启 kubelet → uncordon。）'
        ]);
      }
      if (uact === 'node') {
        return ok([
          '[preflight] Running pre-flight checks',
          '[upgrade] Reading configuration from the cluster...',
          '[upgrade] Upgrading the kubelet configuration to ' + KUBEADM_VERSION + '...',
          '[upgrade] The configuration for this node was successfully updated!',
          '[upgrade] Now you should use your package manager to upgrade the kubelet and kubectl packages',
          '',
          '（教学提示：工作节点的顺序是 —— kubectl drain <节点> --ignore-daemonsets → kubeadm upgrade node '
          + '→ 升级 kubelet/kubectl 包 → systemctl daemon-reload && systemctl restart kubelet → kubectl uncordon <节点>。'
          + '别忘了最后那一步 uncordon，否则节点会一直空着。）'
        ]);
      }
      return fail(['error: unknown command "kubeadm upgrade ' + (uact || '') + '"']);
    }

    if (sub === 'reset') {
      var cri = opt(rest, '--cri-socket', null);
      var out = [
        '[preflight] Running pre-flight checks',
        '[reset] Reading configuration from the cluster...',
        '[reset] WARNING: Changes made to this host by \'kubeadm init\' or \'kubeadm join\' will be reverted.',
        '[reset] Stopping the kubelet service',
        '[reset] Unmounting mounted directories in "/var/lib/kubelet"',
        '[reset] Deleting contents of directories: [/etc/kubernetes/manifests /etc/kubernetes/pki]',
        '[reset] Deleting files: [/etc/kubernetes/admin.conf /etc/kubernetes/kubelet.conf]',
        '[reset] Deleting contents of stateful directories: [/var/lib/etcd /var/lib/kubelet /var/lib/dockershim]',
        '[reset] Deleting contents of config directories: [/etc/kubernetes/manifests /etc/kubernetes/pki]'
      ];
      if (cri) out.push('[reset] Using the "unix:///run/containerd/containerd.sock" CRI socket');
      out.push('');
      out.push('The reset process does not clean CNI configuration. To do so, you must remove /etc/cni/net.d');
      out.push('The reset process does not reset or clean up iptables rules or IPVS tables.');
      out.push('If you wish to reset iptables, you must do so manually by using the "iptables" command.');
      out.push('');
      out.push('（教学提示：reset 会**删掉本机 etcd 数据与证书**。如果这台是唯一的控制面节点，'
        + 'reset 之后集群就彻底没了；如果只是想让某台节点重新加入，reset 完记得手动清 CNI 配置与 iptables 规则。）');
      if (!cri) {
        out.push('（本次未指定 --cri-socket：如果机器上装了多个容器运行时，kubeadm 会报 '
          + '"found multiple CRI sockets, please use --cri-socket to select one" —— 用 '
          + '--cri-socket=unix:///run/containerd/containerd.sock 指定。）');
      }
      return ok(out);
    }

    return fail(['error: unknown command "' + (sub || '') + '" for "kubeadm"',
      'Run \'kubeadm --help\' for usage.']);
  }

  /* ---------- argocd ---------- */
  var ARGOCD_APP = {
    name: 'myapp-prod',
    project: 'default',
    ns: 'argocd',
    targetNs: 'my-app',
    repo: 'https://codehub.devcloud.cn-north-4.huaweicloud.com/myorg/orders-app.git',
    path: 'manifests/prod',
    revision: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    sync: 'Synced',
    health: 'Healthy',
    history: [
      { id: 12, rev: 'a1b2c3d', at: '2024-03-17 21:14:02 +0800 CST', by: 'ci@myorg' },
      { id: 11, rev: '9f8e7d6', at: '2024-03-15 18:02:11 +0800 CST', by: 'zhangsan@myorg' },
      { id: 10, rev: '5c4b3a2', at: '2024-03-11 10:41:55 +0800 CST', by: 'ci@myorg' }
    ],
    resources: [
      { kind: 'Deployment', name: 'web', ns: 'my-app', status: 'Synced', health: 'Healthy' },
      { kind: 'Service', name: 'web', ns: 'my-app', status: 'Synced', health: 'Healthy' },
      { kind: 'Ingress', name: 'web', ns: 'my-app', status: 'Synced', health: 'Healthy' },
      { kind: 'ConfigMap', name: 'app-config', ns: 'my-app', status: 'Synced', health: '' }
    ]
  };

  function argocd(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["argocd"]);
    var sub = rest[0];
    if (!sub || sub === 'version') {
      return ok(['argocd: v2.10.1+8f3c1a7',
        '  BuildDate: 2024-02-15T09:12:44Z',
        '  GitCommit: 8f3c1a72d4e5b6a7c8d9e0f1a2b3c4d5e6f70819',
        '  GitTreeState: clean',
        '  GoVersion: go1.21.5',
        '  Compiler: gc',
        '  Platform: linux/amd64',
        '  Ksonnet Version: v0.13.1',
        '  Kustomize Version: v5.3.0',
        '  Helm Version: v3.14.0+gc3fc9f4b']);
    }
    if (sub !== 'app') {
      return fail(['Error: unknown command "' + sub + '" for "argocd"（教学环境实现了 argocd app get|diff|sync|wait|rollback|history）']);
    }
    var act = rest[1];
    var pos = positionals(rest, ['--timeout', '--revision', '--server', '--auth-token', '--grpc-web',
      '--prune', '--dry-run', '--force', '--async', '--health', '--operation', '--resource', '-o', '--output']);
    var appName = pos[2];
    if (!appName) return fail(['Error: application name is required（例如 argocd app sync myapp-prod）']);
    if (appName !== ARGOCD_APP.name) {
      return fail(['Error: rpc error: code = NotFound desc = applications.argoproj.io "' + appName + '" not found'
        + '（教学环境内置的应用只有 ' + ARGOCD_APP.name + '）']);
    }

    if (act === 'get') {
      var A = ARGOCD_APP;
      var L = [
        'Name:               ' + A.name,
        'Project:            ' + A.project,
        'Server:             https://kubernetes.default.svc',
        'Namespace:          ' + A.ns,
        'URL:                https://argocd.internal.example.com/applications/' + A.name,
        'Repo:               ' + A.repo,
        'Target:             ' + A.path,
        'Path:               ' + A.path,
        'SyncWindow:         Sync Allowed',
        'Sync Policy:        Automated (Prune Enabled)',
        'Sync Status:        ' + A.sync + ' to ' + A.revision.slice(0, 7) + ' (' + A.revision.slice(0, 7) + ')',
        'Health Status:      ' + A.health,
        '',
        'Operation:          Synced to ' + A.revision.slice(0, 7) + ' (' + A.revision.slice(0, 7) + ')',
        'Sync Revision:      ' + A.revision,
        '',
        'GROUP  KIND        NAMESPACE  NAME          STATUS  HEALTH   HOOK  MESSAGE'
      ];
      A.resources.forEach(function (r) {
        L.push(pad(r.kind === 'Deployment' || r.kind === 'ConfigMap' ? 'apps' : '', 7)
          + pad(r.kind, 12) + pad(r.ns, 11) + pad(r.name, 14) + pad(r.status, 8) + pad(r.health, 9) + pad('', 6)
          + (r.kind === 'Deployment' ? 'deployment.apps/' + r.name + ' ' + r.status.toLowerCase() : r.kind.toLowerCase() + '/' + r.name + ' ' + r.status.toLowerCase()));
      });
      L.push('');
      L.push('（教学提示：GitOps 里 **Git 是唯一事实来源** —— Sync Status 表示"集群与 Git 是否一致"，'
        + 'Health Status 表示"工作负载本身健不健康"。两者都绿才算发布成功；'
        + 'OutOfSync 说明有人手工改了集群（或被别人 apply 过）。）');
      return ok(L);
    }

    if (act === 'diff') {
      return ok([
        '===== apps/Deployment my-app/web ======',
        '  spec.template.spec.containers[0].image:',
        '    - swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3',
        '    + swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.4',
        '  spec.replicas:',
        '    - 2',
        '    + 3',
        '',
        '（教学提示：app diff 与 kubectl diff 的区别是"比的对象"：app diff 是 **Git 里的目标状态 vs 集群实际状态**。'
        + '  加 --local 可以拿本地未提交的改动与集群比，写 YAML 时很有用。）']);
    }

    if (act === 'sync') {
      var rev = opt(rest, '--revision', ARGOCD_APP.revision.slice(0, 7));
      var dry = hasFlag(rest, '--dry-run');
      var prune = hasFlag(rest, '--prune');
      var timeout = opt(rest, '--timeout', '0');
      if (String(rev).length < 7) {
        return fail(['Error: rpc error: code = InvalidArgument desc = revision "' + rev + '" is not a valid revision'
          + '（要写 Git 提交 SHA 的前 7 位以上、分支名或 tag）']);
      }
      var S = [
        'TIMESTAMP                  GROUP        KIND   NAMESPACE  NAME   STATUS   HEALTH   HOOK  MESSAGE'
      ];
      var when = '2024-03-18T09:52:11+08:00';
      ARGOCD_APP.resources.forEach(function (r) {
        S.push(pad(when, 27) + pad(r.kind === 'Deployment' || r.kind === 'ConfigMap' ? 'apps' : '', 13)
          + pad(r.kind, 7) + pad(r.ns, 11) + pad(r.name, 7) + pad(dry ? 'Synced' : 'Synced', 9)
          + pad(r.health, 9) + pad('', 6)
          + r.kind.toLowerCase() + '/' + r.name + ' ' + (dry ? 'configured (dry run)' : 'configured'));
      });
      S.push('');
      S.push('Name:               ' + ARGOCD_APP.name);
      S.push('Project:            ' + ARGOCD_APP.project);
      S.push('Server:             https://kubernetes.default.svc');
      S.push('Namespace:          ' + ARGOCD_APP.ns);
      S.push('Repo:               ' + ARGOCD_APP.repo);
      S.push('Target:             ' + rev);
      S.push('Sync Policy:        Automated (Prune Enabled)');
      S.push('Sync Status:        ' + (dry ? 'OutOfSync' : 'Synced') + ' to ' + rev);
      S.push('Health Status:      ' + ARGOCD_APP.health);
      S.push('');
      S.push('Operation:          ' + (dry ? 'Sync dry-run' : 'Sync') + ' to ' + rev);
      S.push('Phase:              ' + (dry ? 'Succeeded (dry run)' : 'Succeeded'));
      S.push('Message:            ' + (dry
        ? 'dry-run: no changes were applied to the cluster'
        : 'successfully synced (all tasks run)'));
      if (prune) S.push('Prune:              enabled（Git 里删掉的资源会一并从集群删除）');
      if (timeout !== '0') S.push('Timeout:            ' + timeout + 's');
      S.push('');
      S.push('（教学提示：不加 --prune 时 Git 里删掉的资源**不会**从集群删除，长期会留下一批孤儿资源；'
        + '发布前后各跑一次 argocd app diff 能提前看清影响面。）');
      return ok(S);
    }

    if (act === 'wait') {
      var want = hasFlag(rest, '--health') ? 'Healthy' : 'Synced';
      var to = opt(rest, '--timeout', '0');
      return ok([
        'TIMESTAMP                  GROUP  KIND  NAMESPACE  NAME  STATUS  HEALTH  HOOK  MESSAGE',
        '',
        'Name:               ' + ARGOCD_APP.name,
        'Sync Status:        ' + ARGOCD_APP.sync,
        'Health Status:      ' + ARGOCD_APP.health,
        '',
        '（教学提示：CI 里用 `argocd app wait --health --timeout <秒>` 判断发布是否真的成功 —— '
        + 'sync 返回成功只代表"提交了同步"，不代表"Pod 都起来了"。本次等待条件：' + want
        + '，timeout=' + to + 's。这个命令在真机上会**阻塞**直到满足条件或超时。）']);
    }

    if (act === 'rollback') {
      var id = pos[3];
      if (!id) return fail(['Error: application rollback requires a revision ID（argocd app history myapp-prod 可以查）']);
      var hit = null;
      ARGOCD_APP.history.forEach(function (h) { if (String(h.id) === String(id)) hit = h; });
      if (!hit) {
        return fail(['Error: rpc error: code = NotFound desc = application ' + ARGOCD_APP.name
          + ' has no deployment with id ' + id + '（用 argocd app history ' + ARGOCD_APP.name + ' 看可回滚的版本号）']);
      }
      return ok([
        'TIMESTAMP                  GROUP  KIND  NAMESPACE  NAME  STATUS  HEALTH  HOOK  MESSAGE',
        '2024-03-18T09:53:02+08:00  apps   Deployment  my-app  web  Synced  Healthy      deployment.apps/web configured',
        '',
        'Name:               ' + ARGOCD_APP.name,
        'Sync Status:        Synced to ' + hit.rev,
        'Health Status:      Healthy',
        '',
        '（教学提示：Argo CD 的回滚**不是**改 Git，而是把应用暂时钉到历史 revision —— '
        + 'Git 里的 HEAD 不变，所以下一次自动同步会**又把它改回最新**。真要回滚，正确做法是 git revert 那个提交。）']);
    }

    if (act === 'history') {
      var H = ['ID  DATE                           REVISION        SUBMITTED BY'];
      ARGOCD_APP.history.forEach(function (h) {
        H.push(pad(h.id, 4) + pad(h.at, 31) + pad(h.rev, 16) + h.by);
      });
      return ok(H);
    }

    return fail(['Error: unknown command "argocd app ' + (act || '') + '"（教学环境实现了 get / diff / sync / wait / rollback / history）']);
  }

  /* ---------- promtool ---------- */
  function promtool(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["promtool"]);
    var sub = rest[0];

    if (sub === 'check') {
      var what = rest[1];
      var pos = positionals(rest, ['--url', '--syntax-only', '-s', '--extended', '--lint', '--timeout']);
      var file = pos[2];
      if (what === 'config') {
        if (!file) return fail(['promtool: error: file argument is required（promtool check config /etc/prometheus/prometheus.yml）']);
        var r = U.readFileOrErr(ctx, file);
        if (r.err) return fail(['promtool: error: could not read file "' + file + '": No such file or directory']);
        var syntaxOnly = hasFlag(rest, ['--syntax-only', '-s']);
        var rules = String(r.content).match(/rule_files:[\s\S]*?(?=\n[a-z]|$)/);
        var ruleCount = 0, groups = 0;
        var problems = [];
        if (String(r.content).indexOf('scrape_configs') === -1) {
          problems.push('  "scrape_configs" is missing: Prometheus 不会抓任何目标，监控等于没装');
        }
        if (String(r.content).indexOf('global:') === -1) {
          problems.push('  "global" section is missing: 没有全局默认，scrape_interval 只能每个 job 单独写');
        }
        if (rules) {
          var ruleFiles = [];
          var re = /-\s*(\S+\.ya?ml)/g, mm;
          while ((mm = re.exec(rules[0])) !== null) ruleFiles.push(mm[1]);
          ruleFiles.forEach(function (rf) {
            var rr = U.readFileOrErr(ctx, rf);
            if (rr.err) {
              if (!syntaxOnly) problems.push('  rule file "' + rf + '" does not exist');
              return;
            }
            var g = String(rr.content).match(/^\s*-\s*name:/gm);
            groups += g ? g.length : 0;
            var al = String(rr.content).match(/^\s*-\s*alert:/gm);
            ruleCount += al ? al.length : 0;
          });
        }
        if (problems.length) {
          return fail(['FAILED: ' + file + ' 校验未通过：'].concat(problems).concat([
            '',
            '（教学提示：**坏配置会导致 SIGHUP 热加载整体失败**，而 Prometheus 只会记一条日志、继续用旧配置，'
            + '监控静默失效比服务宕机更可怕。所以必须"先 promtool check，再 kill -HUP"。）']));
        }
        var out = ['SUCCESS: ' + file + ' is valid prometheus config file syntax'
          + (syntaxOnly ? ' (syntax-only)' : ''),
          '',
          'Checking ' + file];
        if (!syntaxOnly && rules) {
          out.push('  ' + groups + ' rule files found');
          out.push('  ' + ruleCount + ' rules found');
        }
        out.push('');
        out.push('（教学提示：校验通过 ≠ 逻辑正确 —— 表达式能解析但可能算错（如 counter 忘了 rate()）。'
          + '通过后热加载：kill -HUP $(pidof prometheus)；容器里的配置要 kubectl exec 进容器校验挂载后的真实文件。）');
        return ok(out);
      }
      if (what === 'rules') {
        if (!file) return fail(['promtool: error: file argument is required']);
        var rr2 = U.readFileOrErr(ctx, file);
        if (rr2.err) return fail(['promtool: error: could not read file "' + file + '": No such file or directory']);
        var cnt = (String(rr2.content).match(/^\s*-\s*alert:/gm) || []).length;
        var cnt2 = (String(rr2.content).match(/^\s*-\s*record:/gm) || []).length;
        var out2 = ['Checking ' + file, '  SUCCESS: ' + (cnt + cnt2) + ' rules found',
          '  告警规则 ' + cnt + ' 条，记录规则 ' + cnt2 + ' 条'];
        out2.push('');
        out2.push('（教学提示：`promtool check rules` 只校验规则文件本身（表达式能否解析、标签是否合法），'
          + '不检查 rule_files 的引用关系；规则文件路径写错是"告警不触发"的头号原因。）');
        return ok(out2);
      }
      if (what === 'healthy') {
        var url = opt(rest, '--url', 'http://127.0.0.1:9090');
        return fail(['FAILED: ' + url + '/-/healthy: Get "' + url + '/-/healthy": dial tcp ' + String(url).replace(/^https?:\/\//, '').split('/')[0] + ': connect: connection refused',
          '',
          '（教学环境没有真的 Prometheus 进程在监听 —— 这里如实报连接失败。',
          '  真机上 Prometheus 默认监听 9090，集群内要先 kubectl port-forward -n monitoring svc/prometheus-server 9090:9090。）']);
      }
      if (what === 'service-discovery') {
        return ok(['SUCCESS: ' + (file || '/etc/prometheus/prometheus.yml') + ' is valid prometheus service discovery config',
          '',
          '（教学提示：K8s 服务发现（kubernetes_sd_configs）依赖 RBAC —— '
          + 'ServiceAccount 没有 list/watch pods 权限时，targets 会是空的，而 Prometheus 自己不报错。）']);
      }
      return fail(['promtool: error: unknown check type "' + (what || '') + '"（可选 config / rules / healthy / service-discovery）']);
    }

    if (sub === 'query') {
      var kind = rest[1];
      var pos2 = positionals(rest, ['--match', '--start', '--end', '--step', '--header', '-o', '--output', '--timeout']);
      var url2 = null, expr = null;
      pos2.slice(2).forEach(function (a) {
        if (/^https?:\/\//.test(a)) url2 = a;
        else if (expr === null) expr = a;
      });
      if (!url2) {
        return fail(['promtool: error: an HTTP API address is required（例如 promtool query instant http://127.0.0.1:9090 \'up == 0\'）']);
      }
      if (kind === 'instant') {
        if (!expr) return fail(['promtool: error: a PromQL expression is required']);
        if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url2)) {
          return fail(['FAILED: ' + url2 + ': Get "' + url2 + '/api/v1/query": dial tcp: lookup '
            + String(url2).replace(/^https?:\/\//, '').split(':')[0] + ': no such host（教学环境不联网）']);
        }
        var samples = fakeQuery(expr);
        if (!samples.length) {
          return ok(['（查询返回空结果：没有匹配的时间序列。先 `promtool query instant ' + url2 + ' \'up\'` 确认指标名与标签。）']);
        }
        var lines = [];
        samples.forEach(function (s) { lines.push('{' + s.labels + '} => ' + s.value + ' @[' + s.ts + ']'); });
        lines.push('');
        lines.push('（教学提示：上面是**教学环境按已知的仿真集群算出来的示意样本**，不是从真 Prometheus 拉的 —— '
          + '本机 127.0.0.1:9090 没有进程在监听，所以这里绝不能说"连上了"。');
        lines.push('  真机上要先把集群内的 Prometheus 转发到本地：'
          + 'kubectl port-forward -n monitoring svc/prometheus-server 9090:9090。）');
        return ok(lines);
      }
      if (kind === 'series') {
        var match = opt(rest, '--match', null);
        if (!match) return fail(['promtool: error: --match is required for "promtool query series"']);
        if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url2)) {
          return fail(['FAILED: ' + url2 + ': dial tcp: lookup '
            + String(url2).replace(/^https?:\/\//, '').split(':')[0] + ': no such host（教学环境不联网）']);
        }
        var series = fakeSeries(match);
        if (!series.length) return ok(['（没有匹配的时间序列。）']);
        var sl = series.map(function (s) { return '{' + s + '}'; });
        sl.push('');
        sl.push('（教学提示：示意数据 —— 来自本站仿真集群（node_exporter 抓 10.0.1.23 / 10.0.1.24 / 10.0.1.11）。'
          + '真机上用 --match=\'up{job="node"}\' 就能列出所有实例。）');
        return ok(sl);
      }
      if (kind === 'range') {
        var start = opt(rest, '--start', null), end = opt(rest, '--end', null), step = opt(rest, '--step', null);
        if (!start || !end || !step) {
          return fail(['promtool: error: --start, --end and --step are required for "promtool query range"'
            + '（时间用 RFC3339 格式，如 --start=2024-03-18T09:00:00Z --step=1m）']);
        }
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(start)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(end))) {
          return fail(['promtool: error: cannot parse "' + (String(start).match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/) ? end : start)
            + '" to a valid timestamp（必须是 RFC3339，如 2024-03-18T09:00:00Z）']);
        }
        if (!/^\d+[smhdw]$/.test(String(step))) {
          return fail(['promtool: error: cannot parse "' + step + '" to a valid duration（如 1m / 30s / 1h）']);
        }
        return ok(['{instance="10.0.1.23:9100", job="node"}',
          '0.0819 @[1709251200]', '0.0822 @[1709251260]', '0.0815 @[1709251320]',
          '',
          '（教学提示：示意数据 —— 区间查询要同时给 --start/--end/--step，时间必须是 RFC3339（带 Z），'
          + '写错会直接报解析错误。真机上的数据量可能很大，先在 Grafana 里框好时间窗再来命令行。）']);
      }
      if (kind === 'labels') {
        return ok(['__name__', 'container', 'endpoint', 'instance', 'job', 'namespace', 'node', 'pod', 'service',
          '',
          '（教学提示：`promtool query labels <标签名>` 可以列出某个标签的全部取值，'
          + '构造聚合维度（sum by (...)）前先看这里有哪些标签可用。）']);
      }
      return fail(['promtool: error: unknown query type "' + (kind || '') + '"（可选 instant / range / series / labels / analyze）']);
    }

    return fail(['promtool: error: unknown command "' + (sub || '') + '" for "promtool"',
      'Run \'promtool --help\' for usage.']);
  }

  /* 依据仿真集群给出"看起来对得上"的样本（明确标注是示意数据） */
  function fakeQuery(expr) {
    var e = String(expr);
    if (/up\s*==\s*0/.test(e)) {
      return [
        { labels: 'instance="10.0.1.31:9100", job="node"', value: '0', ts: '1709251200.114' },
        { labels: 'instance="10.0.1.32:9100", job="node"', value: '0', ts: '1709251200.114' }
      ];
    }
    if (/^up/.test(e)) {
      return [
        { labels: 'instance="10.0.1.11:9100", job="node"', value: '1', ts: '1709251200.108' },
        { labels: 'instance="10.0.1.23:9100", job="node"', value: '1', ts: '1709251200.111' },
        { labels: 'instance="10.0.1.24:9100", job="node"', value: '1', ts: '1709251200.112' }
      ];
    }
    if (/node_memory_MemAvailable_bytes/.test(e)) {
      return [
        { labels: 'instance="10.0.1.11:9100", job="node"', value: '4.8125', ts: '1709251200.201' },
        { labels: 'instance="10.0.1.23:9100", job="node"', value: '7.2344', ts: '1709251200.201' },
        { labels: 'instance="10.0.1.24:9100", job="node"', value: '12.1094', ts: '1709251200.201' }
      ];
    }
    if (/node_cpu_seconds_total/.test(e)) {
      return [
        { labels: 'instance="10.0.1.23:9100", job="node"', value: '0.3912', ts: '1709251200.301' },
        { labels: 'instance="10.0.1.24:9100", job="node"', value: '0.1408', ts: '1709251200.301' },
        { labels: 'instance="10.0.1.11:9100", job="node"', value: '0.1604', ts: '1709251200.301' }
      ];
    }
    if (/node_filesystem_avail_bytes/.test(e)) {
      return [
        { labels: 'instance="10.0.1.23:9100", job="node"', value: '1.2', ts: '1709251200.401' }
      ];
    }
    return [];
  }

  function fakeSeries(match) {
    if (/job="node"/.test(match) || /up/.test(match)) {
      return ['__name__="up", instance="10.0.1.11:9100", job="node"',
        '__name__="up", instance="10.0.1.23:9100", job="node"',
        '__name__="up", instance="10.0.1.24:9100", job="node"'];
    }
    if (/node_cpu/.test(match)) {
      return ['__name__="node_cpu_seconds_total", cpu="0", instance="10.0.1.23:9100", job="node", mode="idle"'];
    }
    return [];
  }

  /* ---------- haproxy ---------- */
  function haproxy(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["haproxy"]);
    var check = hasFlag(rest, '-c');
    var verbose = hasFlag(rest, '-V');
    var files = optAll(rest, ['-f', '--config']);
    var pos = positionals(rest, ['-f', '--config', '-p', '--pidfile', '-sf', '-st', '-C', '-n', '-N', '-L', '-m', '-d', '-D', '-W', '-q', '-V', '-c', '-v', '-cc', '-vv']);
    if (!files.length && pos.length && pos[0].charAt(0) !== '-') files = [pos[0]];

    if (!check && !verbose) {
      return fail(['（教学环境只实现配置检查：haproxy -c -f <配置文件>。',
        '  真机上不加 -c 会**真的启动进程并监听端口** —— 教学环境不会假装启动一个负载均衡器。）',
        '',
        '可以练的：',
        '  haproxy -c -f /etc/haproxy/haproxy.cfg          校验配置',
        '  haproxy -c -f /etc/haproxy/haproxy.cfg -V       校验并打印版本与配置内容',
        '  systemctl reload haproxy && systemctl status haproxy --no-pager   平滑重载（依赖 -W master-worker 模式）']);
    }

    if (!files.length) {
      return fail(['[ALERT] 077/095211 (11842) : config : no configuration file specified',
        '  用法：haproxy -c -f /etc/haproxy/haproxy.cfg']);
    }

    var missing = null, bad = null, text = '';
    files.forEach(function (f) {
      var r = U.readFileOrErr(ctx, f);
      if (r.err) { missing = f; return; }
      text += r.content;
    });
    if (missing) {
      return fail(['[ALERT] 077/095211 (11842) : config : cannot open configuration file \'' + missing + '\'',
        '  （配置文件不存在。systemd 单元里 ExecStart 用的 -f 路径必须和这里一致，'
        + '校验 /etc/haproxy/haproxy.cfg 而实际加载 /etc/haproxy/conf.d/*.cfg 是常见乌龙。）']);
    }
    /* 三条最容易踩的语义错误：超时缺失、只有 httpchk 没有 expect、backend 没有 server */
    var problems = [];
    ['timeout connect', 'timeout client', 'timeout server'].forEach(function (t) {
      if (text.indexOf(t) === -1) {
        problems.push('  [ALERT] (11842) : config : missing timeouts for proxy \'defaults\'\n'
          + '     配置里缺 `' + t + '` —— HAProxy 的 timeout connect/client/server 三个一个都不能少。');
      }
    });
    if (text.indexOf('option httpchk') !== -1 && text.indexOf('http-check expect') === -1) {
      problems.push('  [WARNING] (11842) : config : backend has "option httpchk" but no "http-check expect status" ——\n'
        + '     此时**任何 HTTP 响应都算健康**（404、500 也算），必须补 `http-check expect status 200`。');
    }
    if (text.indexOf('listen') === -1 && text.indexOf('frontend') !== -1 && text.indexOf('backend') === -1) {
      problems.push('  [ALERT] (11842) : config : frontend \'web_front\' : no backend specified（缺 default_backend 或 use_backend）');
    }
    if (problems.length) {
      return fail(['[NOTICE] (11842) : haproxy version is 2.8.5-1e6a2b3'].concat(problems).concat([
        '[ALERT] (11842) : Error(s) found in configuration file : ' + files[0],
        '[ALERT] (11842) : Fatal errors found in configuration.',
        '',
        '（教学提示：-c 只做语法与语义检查，**通过不代表服务能用** —— 后端 IP/端口是否可达、'
        + '证书文件能否读取、stats socket 目录权限都不在检查范围内。）']));
    }
    var out = ['[NOTICE] (11842) : haproxy version is 2.8.5-1e6a2b3',
      '[NOTICE] (11842) : path to executable is /usr/sbin/haproxy',
      '[ALERT] (11842) : config : [/etc/haproxy/haproxy.cfg:1] : \'log /dev/log\' : 已配置日志目标'];
    /* 真机 -c 的输出里 ALERT 行只在校验报错时出现，干净配置是下面这条 */
    out = ['[NOTICE] (11842) : haproxy version is 2.8.5-1e6a2b3',
      '[NOTICE] (11842) : path to executable is /usr/sbin/haproxy'];
    if (verbose) {
      out.push('Configuration file is valid');
      out.push('');
      out.push('Configuration file: ' + files[0]);
      text.split('\n').forEach(function (l, i) { out.push(padLeft(String(i + 1), 4) + '  ' + l); });
    } else {
      out.push('Configuration file is valid');
    }
    out.push('');
    out.push('（教学提示：**`-c` 通过只代表语法没问题**：后端 IP/端口是否可达、证书能否读取、'
      + 'stats socket 目录权限都不在校验范围内。');
    out.push('  校验通过后平滑重载：systemctl reload haproxy（依赖 global 段的 master-worker / -W，'
      + '否则等价于重启、会造成连接瞬断），再 systemctl status haproxy --no-pager 确认没有报错。）');
    return ok(out);
  }

  /* ======================================================================
     7. base64（Secret 的 data 是 base64，取明文必须靠它）
        kubectl 的示例大量使用 `kubectl get secret ... | base64 -d`，
        引擎里没有 base64 会让这些示例报 "command not found"。
     ====================================================================== */

  var B64TAB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function b64Encode(text) {
    return b64utf8(String(text));
  }
  function b64Decode(text) {
    var clean = String(text).replace(/[^A-Za-z0-9+/=]/g, '');
    var bytes = [];
    for (var i = 0; i < clean.length; i += 4) {
      var c0 = B64TAB.indexOf(clean.charAt(i));
      var c1 = B64TAB.indexOf(clean.charAt(i + 1));
      var c2 = clean.charAt(i + 2) === '=' ? -1 : B64TAB.indexOf(clean.charAt(i + 2));
      var c3 = clean.charAt(i + 3) === '=' ? -1 : B64TAB.indexOf(clean.charAt(i + 3));
      if (c0 < 0 || c1 < 0) return { err: 'base64: invalid input' };
      bytes.push((c0 << 2) | (c1 >> 4));
      if (c2 >= 0) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
      if (c3 >= 0) bytes.push(((c2 & 3) << 6) | c3);
    }
    /* 字节流按 UTF-8 还原（base64 -d 输出的是原始字节，这里按 UTF-8 呈现） */
    var out = '';
    for (var k = 0; k < bytes.length;) {
      var b = bytes[k];
      if (b < 0x80) { out += String.fromCharCode(b); k += 1; }
      else if (b >= 0xc0 && b < 0xe0 && k + 1 < bytes.length) {
        out += String.fromCharCode(((b & 31) << 6) | (bytes[k + 1] & 63)); k += 2;
      } else if (b >= 0xe0 && k + 2 < bytes.length) {
        out += String.fromCharCode(((b & 15) << 12) | ((bytes[k + 1] & 63) << 6) | (bytes[k + 2] & 63)); k += 3;
      } else { out += String.fromCharCode(b); k += 1; }
    }
    return { text: out };
  }

  function base64Cmd(argv, ctx, stdin, HOST) {
    var rest = stripHead(argv, ["base64"]);
    var decode = false, wrap = 76;
    var files = [];
    for (var i = 0; i < rest.length; i++) {
      var a = String(rest[i]);
      if (a === '-d' || a === '--decode' || a === '-D') { decode = true; continue; }
      if (a === '-i' || a === '--ignore-garbage') continue;
      if (a === '-w' || a === '--wrap') { wrap = Number(rest[++i]); continue; }
      if (/^-w\d+$/.test(a)) { wrap = Number(a.slice(2)); continue; }
      if (a === '--help') return ok(['Usage: base64 [OPTION]... [FILE]',
        'Base64 encode or decode FILE, or standard input, to standard output.',
        '  -d, --decode          解码',
        '  -w, --wrap=COLS       每 COLS 个字符换行（默认 76，0 表示不换行）']);
      if (a.charAt(0) === '-' && a.length > 1) {
        return fail(['base64: invalid option -- \'' + a.replace(/^-+/, '').charAt(0) + '\'',
          'Try \'base64 --help\' for more information.']);
      }
      files.push(a);
    }
    var text = null;
    if (files.length) {
      var r = U.readFileOrErr(ctx, files[0]);
      if (r.err) return fail([r.err.replace(/^cat:/, 'base64:')]);
      if (r.gz) return fail(['base64: ' + files[0] + ': 二进制文件（gzip 压缩），请先 zcat 再管道给 base64']);
      text = r.content;
    } else if (stdin && stdin.length) {
      text = stdin.join('\n') + '\n';
    } else {
      return fail(['base64: 缺少输入（用法：base64 [-d] [文件]，或从管道读取）']);
    }

    if (decode) {
      var d = b64Decode(text);
      if (d.err) return fail([d.err]);
      var lines = d.text.split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      return ok(lines);
    }
    var enc = b64Encode(text);
    if (wrap === 0) return ok([enc]);
    var out = [];
    for (var p = 0; p < enc.length; p += wrap) out.push(enc.slice(p, p + wrap));
    return ok(out.length ? out : ['']);
  }

  /* ======================================================================
     9. diff（GNU diffutils 的常用子集）
        内容里 `helm get manifest ... > 文件` 之后再 `diff - 文件` 的写法需要它。
        只做"两个文本输入的统一 diff"，不做目录递归比对。
     ====================================================================== */

  function diffCmd(argv, ctx, stdin, HOST) {
    var args = stripHead(argv, ["diff"]);
    var unified = false, context = false, brief = false, ignoreCase = false, ignoreSpace = false;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var a = String(args[i]);
      if (a === '-u' || a === '--unified' || /^-u\d+$/.test(a) || /^--unified=\d+$/.test(a)) { unified = true; continue; }
      if (a === '-c' || a === '-C' || /^-[cC]\d+$/.test(a)) { context = true; continue; }
      if (a === '-q' || a === '--brief') { brief = true; continue; }
      if (a === '-i' || a === '--ignore-case') { ignoreCase = true; continue; }
      if (a === '-w' || a === '-b' || a === '--ignore-all-space') { ignoreSpace = true; continue; }
      if (a === '-r' || a === '--recursive' || a === '-N' || a === '--new-file') continue;
      if (a === '--normal') continue;
      if (a.charAt(0) === '-' && a !== '-') {
        return fail(['diff: unrecognized option \'' + a + '\'',
          'Try \'diff --help\' for more information.']);
      }
      files.push(a);
    }
    if (files.length !== 2) {
      return fail(['diff: missing operand' + (files.length === 1 ? ' after \'' + files[0] + '\'' : ''),
        'diff: Try \'diff --help\' for more information.']);
    }

    function read(input, label) {
      if (input === '-') return { lines: (stdin || []).slice() };
      var node = U.findNode(ctx.root, U.resolvePath(ctx.cwd, input));
      if (!node) return { err: 'diff: ' + input + ': No such file or directory' };
      if (node.type === 'dir') return { err: 'diff: ' + input + ': Is a directory' };
      return { lines: U.splitLines(String(node.content || '')) };
    }

    var A = read(files[0], files[0]);
    if (A.err) return fail([A.err, 'diff: Try \'diff --help\' for more information.']);
    var B = read(files[1], files[1]);
    if (B.err) return fail([B.err, 'diff: Try \'diff --help\' for more information.']);

    function norm(l) {
      var s = String(l);
      if (ignoreCase) s = s.toLowerCase();
      if (ignoreSpace) s = s.replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
      return s;
    }
    var a = A.lines.map(norm), b = B.lines.map(norm);
    var same = a.length === b.length && a.every(function (x, i) { return x === b[i]; });
    if (same) return ok([]);   /* 真机：无差异时不输出任何内容，退出码 0 */

    if (brief) {
      return { out: ['Files ' + files[0] + ' and ' + files[1] + ' differ'], err: [], code: 1 };
    }

    if (!unified && !context) {
      /* 普通格式：逐个差异块给出 `序号c序号` 与 `<` / `>` 行 */
      var out = [];
      var n = a.length, m = b.length;
      var dp = [];
      for (var x2 = 0; x2 <= n; x2++) { dp.push([]); for (var y2 = 0; y2 <= m; y2++) dp[x2][y2] = 0; }
      for (x2 = n - 1; x2 >= 0; x2--) {
        for (y2 = m - 1; y2 >= 0; y2--) {
          dp[x2][y2] = a[x2] === b[y2] ? dp[x2 + 1][y2 + 1] + 1 : Math.max(dp[x2 + 1][y2], dp[x2][y2 + 1]);
        }
      }
      var ops = [], i2 = 0, j2 = 0;
      while (i2 < n && j2 < m) {
        if (a[i2] === b[j2]) { ops.push({ t: ' ', a: A.lines[i2] }); i2++; j2++; }
        else if (dp[i2 + 1][j2] >= dp[i2][j2 + 1]) { ops.push({ t: '<', a: A.lines[i2] }); i2++; }
        else { ops.push({ t: '>', a: B.lines[j2] }); j2++; }
      }
      while (i2 < n) { ops.push({ t: '<', a: A.lines[i2] }); i2++; }
      while (j2 < m) { ops.push({ t: '>', a: B.lines[j2] }); j2++; }

      var k = 0;
      while (k < ops.length) {
        if (ops[k].t === ' ') { k++; continue; }
        var start = k, left = [], right = [];
        while (k < ops.length && ops[k].t !== ' ') {
          if (ops[k].t === '<') left.push(ops[k].a); else right.push(ops[k].a);
          k++;
        }
        var lStart = ops.slice(0, start).filter(function (o) { return o.t !== '>'; }).length + 1;
        var rStart = ops.slice(0, start).filter(function (o) { return o.t !== '<'; }).length + 1;
        var op = left.length && right.length ? 'c' : (left.length ? 'd' : 'a');
        var lRange = left.length > 1 ? lStart + ',' + (lStart + left.length - 1) : String(lStart);
        var rRange = right.length > 1 ? rStart + ',' + (rStart + right.length - 1) : String(rStart);
        out.push(lRange + op + rRange);
        left.forEach(function (l) { out.push('< ' + l); });
        if (op === 'c') out.push('---');
        right.forEach(function (l) { out.push('> ' + l); });
      }
      out.push('');
      out.push('（教学提示：`diff` 有差异时**退出码是 1**、无差异是 0、出错是 2 —— '
        + '脚本里 `diff a b && echo 一致` 用的就是这个语义。）');
      return { out: out, err: [], code: 1 };
    }

    /* 统一格式（-u）：与 kubectl diff / git diff 一致 */
    var head = ['--- ' + (files[0] === '-' ? '/dev/stdin' : files[0]),
      '+++ ' + (files[1] === '-' ? '/dev/stdin' : files[1])];
    var body = unifiedDiff(A.lines, B.lines);
    head.push('@@ -1,' + A.lines.length + ' +1,' + B.lines.length + ' @@');
    head.push('');
    head.push('（教学提示：diff 有差异时退出码是 1，无差异是 0。）');
    return { out: head.concat(body), err: [], code: 1 };
  }

  /* ======================================================================
     8. 注册
     ====================================================================== */

  window.CC_SHELL.extend({
    kubeadm: kubeadm,
    argocd: argocd,
    promtool: promtool,
    haproxy: haproxy,
    base64: base64Cmd,
    /* diff：文件与文件的逐行差异。示例里 `helm get manifest ... | diff - /tmp/deployed.yaml`
       就要用它（`-` 表示标准输入）。只做文本比对，不解释任何格式。 */
    diff: diffCmd
  });

  /* ======================================================================
     8. 模拟数据：内容里引用到、但 termfs.js 里没有的文件
        （fsAdd 只登记，父目录会自动创建）
     ====================================================================== */

  var DEPLOY_YAML = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: web',
    '  namespace: my-app',
    '  labels:',
    '    app: web',
    'spec:',
    '  replicas: 3',
    '  selector:',
    '    matchLabels:',
    '      app: web',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: web',
    '    spec:',
    '      containers:',
    '      - name: web',
    '        image: swr.cn-north-4.myhuaweicloud.com/myorg/web:1.2.3',
    '        ports:',
    '        - containerPort: 8080',
    '        resources:',
    '          requests: { cpu: 200m, memory: 256Mi }',
    '          limits:   { cpu: 500m, memory: 512Mi }',
    '        readinessProbe:',
    '          httpGet: { path: /healthz, port: 8080 }',
    '          initialDelaySeconds: 5'
  ].join('\n') + '\n';

  var SVC_YAML = [
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    '  name: web',
    '  namespace: my-app',
    '  labels:',
    '    app: web',
    'spec:',
    '  type: NodePort',
    '  ports:',
    '  - port: 80',
    '    targetPort: 8080',
    '    nodePort: 30080',
    '    protocol: TCP',
    '  selector:',
    '    app: web'
  ].join('\n') + '\n';

  var RBAC_YAML = [
    '# RBAC 清单：Role + RoleBinding（用 kubectl auth reconcile 幂等交付）',
    'apiVersion: rbac.authorization.k8s.io/v1',
    'kind: Role',
    'metadata:',
    '  name: pod-reader',
    '  namespace: my-app',
    'rules:',
    '- apiGroups: [""]',
    '  resources: ["pods", "pods/log"]',
    '  verbs: ["get", "list", "watch"]',
    '---',
    'apiVersion: rbac.authorization.k8s.io/v1',
    'kind: RoleBinding',
    'metadata:',
    '  name: pod-reader',
    '  namespace: my-app',
    'roleRef:',
    '  apiGroup: rbac.authorization.k8s.io',
    '  kind: Role',
    '  name: pod-reader',
    'subjects:',
    '- kind: ServiceAccount',
    '  name: app-sa',
    '  namespace: my-app'
  ].join('\n') + '\n';

  var APP_CONF = [
    '# /root/app.conf —— kubectl create configmap --from-file 的输入',
    'server.port=8080',
    'log.level=info',
    'cache.host=cache-prod-01',
    'cache.port=6379'
  ].join('\n') + '\n';

  var PROM_YML = [
    'global:',
    '  scrape_interval: 15s',
    '  evaluation_interval: 15s',
    '  external_labels:',
    '    cluster: cce-cn-north-4-prod',
    '',
    'rule_files:',
    '  - /etc/prometheus/rules/myapp.yml',
    '',
    'scrape_configs:',
    '  - job_name: prometheus',
    '    static_configs:',
    '      - targets: [\'127.0.0.1:9090\']',
    '',
    '  - job_name: node',
    '    static_configs:',
    '      - targets: [\'10.0.1.11:9100\', \'10.0.1.23:9100\', \'10.0.1.24:9100\']',
    '',
    '  - job_name: myapp',
    '    metrics_path: /actuator/prometheus',
    '    static_configs:',
    '      - targets: [\'10.0.1.23:8080\', \'10.0.1.24:8080\']',
    '',
    '  - job_name: kubernetes-pods',
    '    kubernetes_sd_configs:',
    '      - role: pod'
  ].join('\n') + '\n';

  var PROM_RULES = [
    'groups:',
    '  - name: myapp.rules',
    '    rules:',
    '      - alert: MyAppDown',
    '        expr: up{job="myapp"} == 0',
    '        for: 1m',
    '        labels:',
    '          severity: critical',
    '        annotations:',
    '          summary: "myapp 实例失联"',
    '          description: "{{ $labels.instance }} 已经 1 分钟抓不到指标"',
    '      - alert: NodeDiskWillFillIn4Hours',
    '        expr: predict_linear(node_filesystem_avail_bytes{mountpoint="/data"}[6h], 4*3600) < 0',
    '        for: 10m',
    '        labels:',
    '          severity: warning',
    '        annotations:',
    '          summary: "磁盘预计 4 小时内写满"',
    '      - record: instance:node_cpu_usage:rate5m',
    '        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
  ].join('\n') + '\n';

  var HAPROXY_CFG = [
    'global',
    '    log         /dev/log local0 info',
    '    maxconn     20000',
    '    daemon',
    '    master-worker',
    '',
    'defaults',
    '    log     global',
    '    mode    http',
    '    option  httplog',
    '    option  dontlognull',
    '    timeout connect 5s',
    '    timeout client  30s',
    '    timeout server  30s',
    '',
    'frontend web_front',
    '    bind *:80',
    '    acl is_api path_beg /api/',
    '    use_backend app_backend if is_api',
    '    default_backend app_backend',
    '',
    'backend app_backend',
    '    balance roundrobin',
    '    option httpchk GET /health',
    '    http-check expect status 200',
    '    server web1 10.0.1.31:8080 check inter 2s rise 2 fall 3 weight 100',
    '    server web2 10.0.1.32:8080 check inter 2s rise 2 fall 3 weight 100',
    '',
    'listen stats',
    '    bind *:8404',
    '    mode http',
    '    stats enable',
    '    stats uri /stats',
    '    stats refresh 10s',
    '    stats auth admin:Adm1n_2024'
  ].join('\n') + '\n';

  window.CC_SHELL.fsAdd({
    '/root/deploy.yaml': { content: DEPLOY_YAML, mode: '644', user: 'root', mtime: '2024-03-18 09:00' },
    '/root/svc.yaml': { content: SVC_YAML, mode: '644', user: 'root', mtime: '2024-03-18 09:00' },
    '/root/rbac.yaml': { content: RBAC_YAML, mode: '644', user: 'root', mtime: '2024-03-18 09:00' },
    '/root/app.conf': { content: APP_CONF, mode: '644', user: 'root', mtime: '2024-03-18 09:00' },
    /* kubectl cp 的本地源文件（示例里写的就是 ./config.yaml） */
    '/root/config.yaml': {
      content: [
        '# 应用配置（会被 kubectl cp 塞进容器 /tmp 下临时排错用）',
        'server:',
        '  port: 8080',
        'cache:',
        '  host: cache-prod-01',
        '  port: 6379'
      ].join('\n') + '\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/conf.d/app.conf': { content: APP_CONF, mode: '644', user: 'root', mtime: '2024-03-18 09:00' },
    '/root/conf.d/upstream.conf': {
      content: 'upstream app_backend {\n    server 10.0.1.31:8080;\n    server 10.0.1.32:8080;\n}\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/manifests/deploy.yaml': { content: DEPLOY_YAML, mode: '644', user: 'root', mtime: '2024-03-18 09:00' },
    '/root/manifests/svc.yaml': { content: SVC_YAML, mode: '644', user: 'root', mtime: '2024-03-18 09:00' },
    '/root/manifests/ns.yaml': {
      content: 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: my-app\n  labels:\n    kubernetes.io/metadata.name: my-app\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/certs/server.crt': {
      content: '-----BEGIN CERTIFICATE-----\n'
        + 'MIIDazCCAlOgAwIBAgIUJ（教学环境用占位文本代替真实证书，长度与结构按真实 PEM 写）\n'
        + '-----END CERTIFICATE-----\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/certs/server.key': {
      content: '-----BEGIN PRIVATE KEY-----\n'
        + 'MIIEvQIBADANBgkqhkiG9w0B（教学环境用占位文本代替真实私钥，绝不是可用凭据）\n'
        + '-----END PRIVATE KEY-----\n',
      mode: '600', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/server.crt': {
      content: '-----BEGIN CERTIFICATE-----\n'
        + 'MIIDazCCAlOgAwIBAgIUJ（教学环境用占位文本代替真实证书，长度与结构按真实 PEM 写）\n'
        + '-----END CERTIFICATE-----\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/server.key': {
      content: '-----BEGIN PRIVATE KEY-----\n'
        + 'MIIEvQIBADANBgkqhkiG9w0B（教学环境用占位文本代替真实私钥，绝不是可用凭据）\n'
        + '-----END PRIVATE KEY-----\n',
      mode: '600', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/values.yaml': {
      content: '# 公共默认值（所有环境共用）\nreplicaCount: 2\nimage:\n  repository: swr.cn-north-4.myhuaweicloud.com/myorg/my-app\n  tag: "1.4.2"\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/values-prod.yaml': {
      content: '# 生产环境覆盖值（覆盖顺序：从左到右，右侧赢）\nreplicaCount: 3\nimage:\n  tag: "1.4.2"\nresources:\n  requests: { cpu: 500m, memory: 1Gi }\n  limits:   { cpu: 1000m, memory: 2Gi }\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/values-test.yaml': {
      content: '# 测试环境覆盖值\nreplicaCount: 1\nimage:\n  tag: "1.4.2-rc1"\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/etc/haproxy/haproxy.cfg': { content: HAPROXY_CFG, mode: '644', user: 'root', mtime: '2024-03-16 10:20' },
    /* 两份"故意写错"的配置：给 `haproxy -c` / `promtool check config` 的失败分支用 ——
       校验命令真正的价值就是拦住这种配置，示例里也应该能亲手跑一遍。 */
    '/root/haproxy-bad.cfg': {
      content: [
        'global',
        '    log         /dev/log local0 info',
        '    maxconn     20000',
        '    daemon',
        '',
        'defaults',
        '    log     global',
        '    mode    http',
        '    option  httplog',
        '    timeout connect 5s',
        '    timeout client  30s',
        '',
        'frontend web_front',
        '    bind *:80',
        '    default_backend app_backend',
        '',
        'backend app_backend',
        '    balance roundrobin',
        '    option httpchk GET /health',
        '    server web1 10.0.1.31:8080 check inter 2s rise 2 fall 3 weight 100'
      ].join('\n') + '\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/tmp/bad-haproxy.cfg': {
      content: [
        'global',
        '    daemon',
        '',
        'defaults',
        '    mode    http',
        '    timeout connect 5s',
        '    timeout client  30s',
        '',
        'frontend web_front',
        '    bind *:80',
        '    default_backend app_backend',
        '',
        'backend app_backend',
        '    balance roundrobin',
        '    option httpchk GET /health',
        '    server web1 10.0.1.31:8080 check'
      ].join('\n') + '\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/tmp/bad-prom.yml': {
      content: [
        'global:',
        '  scrape_interval: 15s',
        '',
        'rule_files:',
        '  - /etc/prometheus/rules/myapp.yml',
        '',
        '# 故意漏掉 scrape_configs：Prometheus 会启动成功，但一个目标都不抓',
        '# （这正是 promtool check config 应该在 CI 里拦下来的那种改动）'
      ].join('\n') + '\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/etc/prometheus/prometheus.yml': { content: PROM_YML, mode: '644', user: 'root', mtime: '2024-03-16 10:30' },
    '/etc/prometheus/rules/myapp.yml': { content: PROM_RULES, mode: '644', user: 'root', mtime: '2024-03-16 10:31' },
    /* helm push 的输入：先 helm package 才会生成，这里预置一份，方便单独练 push */
    '/root/dist/my-app-1.4.2.tgz': {
      content: '<binary> gzip 压缩的 Helm chart my-app-1.4.2（教学环境用占位内容代替真实的 tar.gz）',
      size: 3721, mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    /* `helm get manifest my-app -n prod > /tmp/deployed.yaml` 之后再 diff 的对照文件 */
    '/tmp/deployed.yaml': {
      content: [
        '---',
        '# Source: my-app/templates/serviceaccount.yaml',
        'apiVersion: v1',
        'kind: ServiceAccount',
        'metadata:',
        '  name: my-app',
        '  namespace: prod',
        '---',
        '# Source: my-app/templates/service.yaml',
        'apiVersion: v1',
        'kind: Service',
        'metadata:',
        '  name: my-app-my-app',
        '  namespace: prod',
        'spec:',
        '  type: ClusterIP',
        '  ports:',
        '    - port: 80',
        '      targetPort: http',
        '---',
        '# Source: my-app/templates/deployment.yaml',
        'apiVersion: apps/v1',
        'kind: Deployment',
        'metadata:',
        '  name: my-app-my-app',
        '  namespace: prod',
        'spec:',
        '  replicas: 2',
        '  template:',
        '    spec:',
        '      containers:',
        '        - name: my-app',
        '          image: "swr.cn-north-4.myhuaweicloud.com/myorg/my-app:1.4.2"'
      ].join('\n') + '\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:50'
    },
    /* helm template / lint 的本地 chart 骨架（示例里引用了 ./charts/my-app） */    '/root/charts/my-app/Chart.yaml': {
      content: 'apiVersion: v2\nname: my-app\ndescription: 订单 Web 服务\ntype: application\nversion: 1.4.2\nappVersion: "1.4.2"\nkubeVersion: ">=1.24.0-0"\ndependencies:\n  - name: worker\n    version: 1.2.3\n    repository: https://swr.cn-north-4.myhuaweicloud.com/chartrepo/myorg\n    condition: worker.enabled\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/charts/my-app/values.yaml': {
      content: 'replicaCount: 2\nimage:\n  repository: swr.cn-north-4.myhuaweicloud.com/myorg/my-app\n  tag: "1.4.2"\nworker:\n  enabled: true\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/charts/my-app/templates/deployment.yaml': {
      content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ include "my-app.fullname" . }}\n  labels:\n    {{- include "my-app.labels" . | nindent 4 }}\nspec:\n  replicas: {{ .Values.replicaCount }}\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/charts/my-app/templates/_helpers.tpl': {
      content: '{{- define "my-app.fullname" -}}\n{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}\n{{- end }}\n',
      mode: '644', user: 'root', mtime: '2024-03-18 09:00'
    },
    '/root/charts/my-app/charts/.gitkeep': { content: '', mode: '644', user: 'root', mtime: '2024-03-18 09:00' }
  });
})();
