/* assets/js/cmd-cloud.js · 华为云 CLI 的只读服务子集（云上排查最常用的那几步）
   --------------------------------------------------------------------------
   为什么单独一个文件：手册的 cloud-cli 分类有 71 条记录，覆盖 ECS / VPC / ELB /
   RDS / EVS / CES / IAM / CCE / IMS / EIP / OBS。而 shell.js 里的 `hcloud`
   原来只实现了 ECS / VPC / configure —— 其余服务的示例**全部只能标"未实现"**，
   可它们讲的恰恰是云上排查最常用的动作：
     · 负载均衡后端全挂 → 看 ELB 的后端健康状态
     · "买了盘但没挂" → 查 available 状态的云盘（这是最常见的浪费）
     · "是不是在抖" → 拉 CES 监控指标
     · AK/SK 疑似泄露 → 查永久访问密钥
   这些**都是只读操作**，模拟它们没有安全风险，却能让一整批内容活起来。

   ── 三条纪律 ──
   1. **只做只读**（List 与 Show 开头的操作；这里原本写成星号通配，结果那个
      "星号加斜杠"提前闭合了块注释 —— 这个坑本项目已经踩过三次，写注释时务必避开）。
      创建/删除/开关机一律如实说"不真的执行"——与 ECS BatchStopServers 的处理保持一致。
   2. **数据与 termfs 对齐**：机器名、IP、规格都用同一套（web-prod-01 / db-prod-01 /
      10.0.1.x / s6.xlarge.4），这样 ELB 后端里的 IP 能和 `hcloud ECS ListServersDetails`
      对得上，学员跨命令核对时才不会自相矛盾。
   3. **支持 --cli-query 与 --cli-output=table**：这两个是 KooCLI 的通用能力，
      不该每个服务各写一遍 —— 统一在 dispatch 里处理。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL) return;

  /* ---------------- 模拟数据（与 termfs / ECS 的清单保持一致） ---------------- */
  var ECS = [
    { id: '8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88', name: 'web-prod-01', ip: '10.0.1.23', flavor: 's6.xlarge.4', az: 'cn-north-4a', status: 'ACTIVE' },
    { id: 'b41d9e05-2c7a-4f38-8a61-5d0e2f9b7c31', name: 'db-prod-01', ip: '10.0.2.15', flavor: 's6.xlarge.4', az: 'cn-north-4a', status: 'ACTIVE' }
  ];

  var DATA = {
    /* ---- 弹性负载均衡：后端健康状态 ---- */
    ELB: {
      ListLoadBalancers: {
        loadbalancers: [
          { id: 'd3f7a1c9-5b2e-4d8a-9c1f-7e6b3a0d5c24', name: 'elb-web-prod', vip_address: '10.0.1.100',
            provisioning_status: 'ACTIVE', operating_status: 'ONLINE', provider: 'vlb', listeners: 2 }
        ]
      },
      'ListLoadBalancers/v3': null, /* 见下方别名处理 */
      ShowLoadBalancerStatus: {
        statuses: [{
          id: 'd3f7a1c9-5b2e-4d8a-9c1f-7e6b3a0d5c24', name: 'elb-web-prod',
          listeners: [{
            id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', name: 'listener-http-80', protocol_port: 80,
            pools: [{
              id: 'f9e8d7c6-b5a4-4392-8170-6f5e4d3c2b1a', name: 'pool-web',
              healthmonitor: { type: 'HTTP', delay: 5, timeout: 3, max_retries: 3, url_path: '/health', expected_codes: '200' },
              members: [
                { id: 'm1', address: '10.0.1.23', protocol_port: 8080, operating_status: 'ONLINE', weight: 1 },
                { id: 'm2', address: '10.0.1.24', protocol_port: 8080, operating_status: 'OFFLINE', weight: 1 }
              ]
            }]
          }]
        }]
      },
      ListHealthMonitors: {
        healthmonitors: [
          { id: 'h1', name: 'hc-web', type: 'HTTP', delay: 5, timeout: 3, max_retries: 3, url_path: '/health', expected_codes: '200', monitor_port: 8080 }
        ]
      },
      ListMembers: {
        members: [
          { id: 'm1', address: '10.0.1.23', protocol_port: 8080, operating_status: 'ONLINE', weight: 1 },
          { id: 'm2', address: '10.0.1.24', protocol_port: 8080, operating_status: 'OFFLINE', weight: 1 }
        ]
      }
    },

    /* ---- 云硬盘：找"买了但没挂"的盘 ---- */
    EVS: {
      ListVolumes: {
        volumes: [
          { id: 'v-1a2b3c4d', name: 'vol-web-data', status: 'in-use', size: 100, volume_type: 'SSD',
            availability_zone: 'cn-north-4a', attachments: [{ server_id: ECS[0].id, device: '/dev/vdb' }], created_at: '2024-01-11T08:20:00Z' },
          { id: 'v-5e6f7a8b', name: 'vol-db-data', status: 'in-use', size: 500, volume_type: 'SSD',
            availability_zone: 'cn-north-4a', attachments: [{ server_id: ECS[1].id, device: '/dev/vdb' }], created_at: '2024-02-04T10:22:00Z' },
          { id: 'v-9c0d1e2f', name: 'vol-old-backup', status: 'available', size: 1000, volume_type: 'SAS',
            availability_zone: 'cn-north-4a', attachments: [], created_at: '2023-11-02T03:14:00Z' }
        ],
        count: 3
      }
    },

    /* ---- 云数据库：实例与备份策略 ---- */
    RDS: {
      ListInstances: {
        instances: [
          { id: 'rds-3f2a9c1e', name: 'rds-order-prod', status: 'ACTIVE', type: 'Single', engine: 'MySQL',
            datastore: { type: 'MySQL', version: '8.0' }, flavor_ref: 'rds.mysql.n1.xlarge.2', volume: { size: 500, type: 'ULTRAHIGH' },
            private_ips: ['10.0.2.31'], port: 3306, created: '2024-02-04T10:30:00Z' }
        ],
        total_count: 1
      },
      ShowBackupPolicy: {
        backup_policy: { keep_days: 7, start_time: '02:00-03:00', period: '1,2,3,4,5,6,7', type: 'auto' }
      },
      ListBackups: {
        backups: [
          { id: 'bk-1', name: 'rds-order-prod-20240318', status: 'COMPLETED', type: 'auto', size: 512, begin_time: '2024-03-18T02:00:12Z' },
          { id: 'bk-2', name: 'rds-order-prod-20240317', status: 'COMPLETED', type: 'auto', size: 508, begin_time: '2024-03-17T02:00:09Z' }
        ]
      }
    },

    /* ---- 云监控：回答"是不是在抖" ---- */
    CES: {
      ListMetrics: {
        metrics: [
          { namespace: 'SYS.ECS', metric_name: 'cpu_util', unit: '%', dimensions: [{ name: 'instance_id', value: ECS[0].id }] },
          { namespace: 'SYS.ECS', metric_name: 'mem_util', unit: '%', dimensions: [{ name: 'instance_id', value: ECS[0].id }] },
          { namespace: 'SYS.ECS', metric_name: 'disk_util_inband', unit: '%', dimensions: [{ name: 'instance_id', value: ECS[0].id }] },
          { namespace: 'SYS.ELB', metric_name: 'unhealthy_backend_server_count', unit: 'count', dimensions: [{ name: 'lbaas_instance_id', value: 'd3f7a1c9-5b2e-4d8a-9c1f-7e6b3a0d5c24' }] }
        ]
      },
      ShowMetricData: {
        datapoints: [
          { average: 87.4, timestamp: 1710729000000 },
          { average: 91.2, timestamp: 1710729600000 },
          { average: 78.6, timestamp: 1710730200000 },
          { average: 93.8, timestamp: 1710730800000 }
        ]
      }
    },

    /* ---- 统一身份认证：查子用户与"永久访问密钥" ---- */
    IAM: {
      ListUsers: {
        users: [
          { id: 'u-1', name: 'ops-user', enabled: true, pwd_status: false, access_mode: 'programmatic', description: '运维自动化' },
          { id: 'u-2', name: 'ci-deploy', enabled: true, pwd_status: false, access_mode: 'programmatic', description: 'CI 发布专用' },
          { id: 'u-3', name: 'intern-readonly', enabled: false, pwd_status: false, access_mode: 'console', description: '实习生只读（已停用）' }
        ]
      },
      ListPermanentAccessKeys: {
        credentials: [
          { access: '9J**************Q2', user_id: 'u-1', status: 'active', create_time: '2023-06-11T02:14:00Z',
            description: '运维自动化（**2023 年创建、从未轮转过**）' },
          { access: 'K7**************M4', user_id: 'u-2', status: 'active', create_time: '2024-03-01T09:00:00Z',
            description: 'CI 发布专用（90 天轮转）' }
        ]
      },
      ListAgencies: {
        agencies: [
          { id: 'ag-1', name: 'ecs-to-obs', duration: '永久', trust_domain_name: 'op_svc_ecs',
            description: '让 ECS 免 AK/SK 访问 OBS（**推荐做法**：不落任何长期密钥）' }
        ]
      }
    },

    /* ---- 云容器引擎 ---- */
    CCE: {
      ListClusters: {
        items: [
          { metadata: { name: 'cce-prod', uid: 'c-1' }, spec: { type: 'VirtualMachine', flavor: 'cce.s2.small', version: 'v1.27' },
            status: { phase: 'Available', endpoint: 'https://cce-prod-xxxxx.cn-north-4.myhuaweicloud.com:5443' } }
        ]
      }
    },

    /* ---- 镜像服务 ---- */
    IMS: {
      ListImages: {
        images: [
          { id: 'img-1', name: 'EulerOS_2.0_SP10_x86_64', status: 'active', visibility: 'public', size: 4294967296, __os_type: 'Linux' },
          { id: 'img-2', name: 'order-api-golden-v3', status: 'active', visibility: 'private', size: 8589934592, __os_type: 'Linux' }
        ]
      }
    },

    /* ---- 云服务器：详情 / 规格 / 可用区 ----
       ⚠️ 这几个动作在 shell.js 的 ECS 分支里**没有**，会落到本模块。
       手册里 hw-ecs-show / hw-ecs-update-resize / hw-ecs-delete 三条记录的示例
       全都依赖它们；不补的话那三条记录连一条可跑示例都没有。 */
    ECS: {
      NovaShowServer: {
        server: {
          id: '8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88', name: 'web-prod-01', status: 'ACTIVE',
          flavor: { id: 's6.xlarge.4', name: 's6.xlarge.4' },
          addresses: { '0e5b1c8a-4f21-4a1e-9d3c-6b2f8e7a1c05': [{ addr: '10.0.1.23', version: 4, 'OS-EXT-IPS:type': 'fixed' }] },
          created: '2024-01-11T08:20:44Z', availability_zone: 'cn-north-4a',
          image: { id: 'img-1' }, key_name: 'prod-key',
          'os:scheduler_hints': {}, metadata: { charging_mode: '0' }
        }
      },
      ListFlavors: {
        flavors: [
          { id: 's6.small.1', name: 's6.small.1', vcpus: 1, ram: 1024, disk: 0 },
          { id: 's6.medium.2', name: 's6.medium.2', vcpus: 1, ram: 2048, disk: 0 },
          { id: 's6.xlarge.2', name: 's6.xlarge.2', vcpus: 2, ram: 4096, disk: 0 },
          { id: 's6.xlarge.4', name: 's6.xlarge.4', vcpus: 4, ram: 8192, disk: 0 },
          { id: 'c6.2xlarge.4', name: 'c6.2xlarge.4', vcpus: 8, ram: 16384, disk: 0 }
        ]
      },
      NovaListAvailabilityZones: {
        availabilityZoneInfo: [
          { zoneName: 'cn-north-4a', zoneState: { available: true } },
          { zoneName: 'cn-north-4b', zoneState: { available: true } },
          { zoneName: 'cn-north-4c', zoneState: { available: true } }
        ]
      }
    },

    /* ---- 虚拟私有云：VPC / 子网 / 端口 / 安全组规则 ---- */
    VPC: {
      ListVpcs: {
        vpcs: [
          { id: '0e5b1c8a-4f21-4a1e-9d3c-6b2f8e7a1c05', name: 'vpc-prod', status: 'ACTIVE',
            cidr: '10.0.0.0/16', routes: 3, created_at: '2024-01-05T06:12:00Z' }
        ]
      },
      ListSubnets: {
        subnets: [
          { id: 'a1c2e3f4-5b6d-4e7f-8a9b-0c1d2e3f4a5b', name: 'subnet-web', cidr: '10.0.1.0/24',
            gateway_ip: '10.0.1.1', status: 'ACTIVE', availability_zone: 'cn-north-4a' },
          { id: 'b2d3f4a5-6c7e-4f8a-9b0c-1d2e3f4a5b6c', name: 'subnet-db', cidr: '10.0.2.0/24',
            gateway_ip: '10.0.2.1', status: 'ACTIVE', availability_zone: 'cn-north-4a' }
        ]
      },
      ListPorts: {
        ports: [
          { id: 'p-web-01', name: 'web-prod-01', status: 'ACTIVE', device_id: ECS[0].id, device_owner: 'compute:nova',
            fixed_ips: [{ ip_address: '10.0.1.23', subnet_id: 'a1c2e3f4-5b6d-4e7f-8a9b-0c1d2e3f4a5b' }] },
          { id: 'p-db-01', name: 'db-prod-01', status: 'ACTIVE', device_id: ECS[1].id, device_owner: 'compute:nova',
            fixed_ips: [{ ip_address: '10.0.2.15', subnet_id: 'b2d3f4a5-6c7e-4f8a-9b0c-1d2e3f4a5b6c' }] }
        ]
      },
      ListSecurityGroupRules: {
        security_group_rules: [
          { id: 'r-80', direction: 'ingress', protocol: 'tcp', port_range_min: 80, port_range_max: 80, remote_ip_prefix: '0.0.0.0/0', description: 'HTTP 对全网开放' },
          { id: 'r-22', direction: 'ingress', protocol: 'tcp', port_range_min: 22, port_range_max: 22, remote_ip_prefix: '203.0.113.0/24', description: '只允许办公网 SSH' },
          { id: 'r-8080', direction: 'ingress', protocol: 'tcp', port_range_min: 8080, port_range_max: 8080, remote_ip_prefix: '10.0.0.0/16', description: '内网访问应用端口' }
        ]
      },
      CreateSecurityGroup: null,     /* 显式标为写操作（下面 dispatch 会给统一口径） */
      CreateSecurityGroupRule: null,
      DeleteSecurityGroupRule: null
    },

    /* ---- 云日志服务：查日志组/日志流 ---- */
    LTS: {
      ListLogs: {
        logs: [
          { log_group_name: 'lts-group-web', log_stream_name: 'nginx-access', log_group_id: 'lg-1', log_stream_id: 'ls-1', ttl_in_days: 30 },
          { log_group_name: 'lts-group-web', log_stream_name: 'nginx-error', log_group_id: 'lg-1', log_stream_id: 'ls-2', ttl_in_days: 30 },
          { log_group_name: 'lts-group-app', log_stream_name: 'order-api', log_group_id: 'lg-2', log_stream_id: 'ls-3', ttl_in_days: 7 }
        ]
      }
    },

    /* ---- 弹性公网 IP：找闲置的（没绑任何实例 = 白花钱） ---- */
    EIP: {
      ListPublicips: {
        publicips: [
          { id: 'eip-1', public_ip_address: '203.0.113.25', status: 'ACTIVE', type: '5_bgp', bandwidth_size: 10,
            port_id: 'p-1', profile: { user_id: 'u-1' }, alias: 'web-prod-01 出网' },
          { id: 'eip-2', public_ip_address: '203.0.113.91', status: 'DOWN', type: '5_bgp', bandwidth_size: 100,
            port_id: null, profile: { user_id: 'u-1' }, alias: '**未绑定任何实例**（100Mbps 按带宽计费，一直在计费）' }
        ]
      }
    }
  };

  /* ---------------- 通用参数处理 ---------------- */
  /* `--cli-region=` / `--project_id=` / `--cli-output=table` / `--cli-query="…"` /
     `--limit` / `--offset` 是 KooCLI 的**通用**参数，不该每个服务各写一遍。 */
  function parseCommon(argv) {
    var o = { output: 'json', query: null, limit: null, offset: null, region: null, debug: false };
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      var m;
      if ((m = a.match(/^--cli-output=(.*)$/))) { o.output = m[1] || 'json'; continue; }
      if (a === '--cli-output') { o.output = String(argv[++i] || 'json'); continue; }
      if ((m = a.match(/^--cli-query=(.*)$/))) { o.query = m[1]; continue; }
      if (a === '--cli-query') { o.query = String(argv[++i] || ''); continue; }
      if ((m = a.match(/^--cli-region=(.*)$/))) { o.region = m[1]; continue; }
      if (a === '--cli-region') { o.region = String(argv[++i] || ''); continue; }
      if ((m = a.match(/^--limit=(\d+)$/))) { o.limit = Number(m[1]); continue; }
      if (a === '--limit') { o.limit = Number(argv[++i]); continue; }
      if ((m = a.match(/^--offset=(\d+)$/))) { o.offset = Number(m[1]); continue; }
      if (a === '--offset') { o.offset = Number(argv[++i]); continue; }
      if (a === '--debug') { o.debug = true; continue; }
    }
    return o;
  }

  /* `--cli-query` 是 JMESPath。真 KooCLI 支持完整 JMESPath，这里只做
     教学示例里出现的几种形态，**认不出来就如实说**，绝不静默返回空
     （静默返回空会让人以为"云上没有这个资源"，那是最危险的错法）。 */
  function runQuery(data, q) {
    if (!q) return { ok: true, value: data };
    var s = String(q).trim();
    /* 形如 `a[?k=='v']` 或 `a[?k=='v'].b` 或 `a[*].b` 或 `a[].b` */
    var m = s.match(/^([A-Za-z_][\w]*)\[\?([\w.]+)\s*==\s*'([^']*)'\]\s*(?:\.(.*))?$/);
    if (m) {
      var arr = data[m[1]];
      if (!Array.isArray(arr)) return { ok: false, why: '路径 ' + m[1] + ' 不是数组' };
      var keyPath = m[2].split('.');
      var got = arr.filter(function (it) {
        var cur = it;
        for (var k = 0; k < keyPath.length; k++) { if (cur == null) return false; cur = cur[keyPath[k]]; }
        return String(cur) === m[3];
      });
      return { ok: true, value: m[4] ? project(got, m[4]) : got };
    }
    var m2 = s.match(/^([A-Za-z_][\w]*)\[\*?\](?:\.(.*))?$/);
    if (m2) {
      var arr2 = data[m2[1]];
      if (!Array.isArray(arr2)) return { ok: false, why: '路径 ' + m2[1] + ' 不是数组' };
      return { ok: true, value: m2[2] ? project(arr2, m2[2]) : arr2 };
    }
    var m3 = s.match(/^([A-Za-z_][\w]*)\.(.*)$/);
    if (m3) {
      var cur2 = data[m3[1]];
      if (cur2 === undefined) return { ok: false, why: '找不到路径 ' + m3[1] };
      return { ok: true, value: project([cur2], m3[2])[0] };
    }
    return { ok: false, why: '教学环境只实现了 `a[?k==\'v\']`、`a[*].b`、`a.b` 这几种 --cli-query 写法' };
  }
  /* `{name:name,size:size}` 这种"挑字段并改名"的投影。
     ⚠️ **不支持的形状必须报错，不能悄悄给 null**：
     早先 `statuses[].listeners[].pools[].members[?…].address` 这种嵌套查询
     会走到这里、逐段取键，取到 undefined 之后渲染成 `[null]` ——
     一个**看起来像结果、其实毫无意义**的输出。这类"静默给错"比报错危险得多：
     学员会拿 `[null]` 当"没有离线后端"，而真相是"这个查询本站不支持"。 */
  function project(arr, spec) {
    var sp = String(spec).trim();
    if (sp.indexOf('[') !== -1) return UNSUPPORTED;
    var mm = sp.match(/^\{(.*)\}$/);
    if (!mm) {
      return arr.map(function (it) {
        var cur = it;
        sp.split('.').forEach(function (k) { if (cur != null) cur = cur[k]; });
        return cur;
      });
    }
    var pairs = mm[1].split(',').map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) {
      var kv = p.split(':');
      return { out: kv[0].trim(), from: (kv[1] || kv[0]).trim() };
    });
    return arr.map(function (it) {
      var o = {};
      pairs.forEach(function (pr) {
        var cur = it;
        pr.from.split('.').forEach(function (k) { if (cur != null) cur = cur[k]; });
        o[pr.out] = cur;
      });
      return o;
    });
  }
  /* 用一个独特标记表示"这段投影本站不会算"，让上层如实报错 */
  var UNSUPPORTED = { __ccUnsupportedProjection: true };

  function toTable(obj) {
    /* 找对象里第一个"数组字段"当表格主体（KooCLI 的 table 输出就是这么选的） */
    var key = null;
    if (Array.isArray(obj)) return arrToTable(obj);
    Object.keys(obj).forEach(function (k) { if (!key && Array.isArray(obj[k])) key = k; });
    if (!key) return arrToTable([obj]);
    return arrToTable(obj[key]);
  }
  function cell(v) {
    if (v === null || v === undefined) return '-';
    if (Array.isArray(v)) return v.map(cell).join(',');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function arrToTable(arr) {
    arr = arr.filter(function (x) { return x && typeof x === 'object'; });
    if (!arr.length) return ['(空)'];
    var cols = [];
    arr.forEach(function (it) {
      Object.keys(it).forEach(function (k) { if (cols.indexOf(k) === -1 && cols.length < 8) cols.push(k); });
    });
    var rows = arr.map(function (it) { return cols.map(function (c) { return cell(it[c]); }); });
    var widths = cols.map(function (c, i) {
      return Math.max(c.length, Math.max.apply(null, rows.map(function (r) { return r[i].length; })));
    });
    function line(cells) {
      return cells.map(function (c, i) { return c + new Array(Math.max(1, widths[i] - c.length + 2)).join(' '); }).join('').replace(/\s+$/, '');
    }
    return [line(cols)].concat(rows.map(line));
  }

  /* ---------------- 分发 ---------------- */
  function handle(svcRaw, actRaw, argv, ctx, ok, fail) {
    var svc = String(svcRaw || '').toUpperCase();
    var act = String(actRaw || '');
    /* `ListLoadBalancers/v3` 这类带版本后缀的写法：真 KooCLI 认，这里也认 */
    var actBase = act.replace(/\/v\d+$/, '');
    var table = DATA[svc];
    if (!table) return null;                    /* 不是本模块管的服务 → 交回 shell.js */
    var entry = table[act] || table[actBase];
    /* `null` 表示"这个动作是写操作，本站刻意不模拟" —— 与 ECS BatchStopServers 同一口径：
       真机上它会真的改云上资源，而在仿真环境里"成功"了没有任何意义，反而让人低估风险。 */
    if (entry === null) {
      return fail(['（教学环境）`hcloud ' + svc + ' ' + act + '` 属于**写操作**，本站不模拟。',
        '它会在真机上真的改动云上资源 —— 仿真环境里假装"成功"没有任何意义，',
        '反而容易让人低估操作风险。请对照 record 里的参数说明，在真机或测试账号上练习。',
        '本站对这些服务只提供**只读**动作：' + Object.keys(table).filter(function (k) {
          return table[k] !== null && !/\/v\d+$/.test(k);
        }).sort().join(' / ')]);
    }
    if (!entry) {
      var names = Object.keys(table).filter(function (k) { return table[k] !== null && !/\/v\d+$/.test(k); }).sort();
      return fail(['hcloud: 教学环境对 ' + svc + ' 只实现了这些只读操作：' + names.join(' / '),
        '（创建 / 删除 / 开关机这类**写操作**一律不模拟 —— 它们会真的改云上资源，'
        + '而仿真环境里"成功"了也没有任何意义，反而会让人低估操作风险。）']);
    }
    var o = parseCommon(argv);
    var data = JSON.parse(JSON.stringify(entry));   /* 每次返回独立副本，避免被下游改坏 */
    /* 单对象查询：`--server_id=X` / `--volume_id=X` / `--instance_id=X` 等。
       真机上传了 ID 就只返回那一个；传了不存在的 ID 要**如实报 404**，
       不能"随便返回一个" —— 学员会据此以为"这个 ID 是有效的"。 */
    var idKey = null, idVal = null;
    argv.forEach(function (a) {
      var m = String(a).match(/^--(server_id|volume_id|instance_id|loadbalancer_id|publicip_id|security_group_id)=(.+)$/);
      if (m) { idKey = m[1]; idVal = m[2]; }
    });
    if (idKey && idVal) {
      var arrKey = null;
      Object.keys(data).forEach(function (k) { if (!arrKey && Array.isArray(data[k])) arrKey = k; });
      if (act === 'NovaShowServer' || act === 'ShowLoadBalancerStatus') {
        /* 这两个的返回是"对象里再包一层"（`{server:{…}}` / `{statuses:[{…}]}`），
           形状特殊，按"数组里的元素或内层对象的 id"来核对。
           ⚠️ 第一版只扫数组，于是 `NovaShowServer --server_id=<真ID>` 反而报找不到 ——
           因为它的 id 在 `data.server.id` 里，不在任何数组元素上。 */
        var okId = false;
        (function scan(node, depth) {
          if (okId || !node || typeof node !== 'object' || depth > 4) return;
          if (node.id === idVal) { okId = true; return; }
          Object.keys(node).forEach(function (k) { scan(node[k], depth + 1); });
        })(data, 0);
        if (!okId) return fail(['hcloud: 找不到 ' + idKey + '=' + idVal + ' 对应的资源（真机会返回 404 NotFound）'], 1);
      } else if (arrKey) {
        var items = data[arrKey];
        /* 只有"元素本身带这个字段"时才按它过滤。
           ⚠️ `ListSecurityGroupRules --security_group_id=X` 是个特例：
           规则元素上并没有 `security_group_id`（规则属于哪个组是调用参数决定的），
           所以这里**不能**因为过滤后为空就报 404 —— 那会把一条正确的命令判成失败。 */
        var fieldPresent = items.some(function (it) {
          return it && (Object.prototype.hasOwnProperty.call(it, idKey));
        });
        if (fieldPresent) {
          var filtered = items.filter(function (it) {
            return String(it[idKey]) === idVal || it.id === idVal ||
              (it.fixed_ips || []).some(function (f) { return f.subnet_id === idVal; });
          });
          if (!filtered.length) return fail(['hcloud: 找不到 ' + idKey + '=' + idVal + ' 对应的资源（真机会返回 404 NotFound）'], 1);
          data[arrKey] = filtered;
        }
      }
    }
    /* `--device_id=X`（VPC ListPorts 按云服务器查端口） */
    var devVal = null;
    argv.forEach(function (a) {
      var m = String(a).match(/^--device_id=(.+)$/);
      if (m) devVal = m[1];
    });
    if (devVal && Array.isArray(data.ports)) {
      data.ports = data.ports.filter(function (p) { return p.device_id === devVal; });
      if (!data.ports.length) return fail(['hcloud: 该云服务器没有已绑定的端口'], 1);
    }
    var q = runQuery(data, o.query);
    if (!q.ok) return fail(['hcloud: --cli-query 解析失败：' + q.why]);
    var value = q.value;
    /* 投影里出现本站算不了的形状 → 如实报错，而不是把 `[null]` 端出去 */
    if (value === UNSUPPORTED || (Array.isArray(value) && value.indexOf(UNSUPPORTED) !== -1)) {
      return fail(['hcloud: --cli-query 的这段投影教学环境算不了：' + o.query,
        '（本站只实现 `a[?k==\'v\']`、`a[*].b`、`a.b`、`{字段:字段}` 这几种。',
        '**不给你一个看起来像结果的东西** —— 那比报错更容易误导人。）']);
    }
    if (o.output === 'table') return ok(toTable(value));
    if (o.output === 'tsv') {
      var tsvRows = Array.isArray(value) ? value : [value];
      return ok(tsvRows.map(function (r) { return Object.keys(r).map(function (k) { return cell(r[k]); }).join('\t'); }));
    }
    return ok(JSON.stringify(value, null, 2).split('\n'));
  }

  window.CC_CLOUD_EXTRA = { handle: handle, DATA: DATA, toTable: toTable, runQuery: runQuery };
})();
