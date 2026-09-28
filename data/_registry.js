/* ==========================================================================
   data/_registry.js · 分类注册表（数据契约的唯一来源）
   --------------------------------------------------------------------------
   status: 'ready'  → 已有数据文件，可点击
           'soon'   → Phase 2 计划中，侧栏灰显占位
   ========================================================================== */
(function () {
  'use strict';

  var CATS = [
    /* ---------------- 领域一：操作系统地基 ---------------- */
    {
      id: 'linux-basic', index: 1, name: 'Linux 基础与文件操作', icon: '🐧',
      tagline: '目录导航、文件增删改查、打包压缩、远程传输',
      domain: '操作系统地基', stage: 1, status: 'ready', file: 'linux-basic.js'
    },
    {
      id: 'linux-text', index: 2, name: '文本处理三剑客', icon: '✂️',
      tagline: 'grep / sed / awk 与 jq，日志分析的看家本领',
      domain: '操作系统地基', stage: 2, status: 'ready', file: 'linux-text.js'
    },
    {
      id: 'linux-user', index: 3, name: '用户权限与系统管理', icon: '👤',
      tagline: '用户组、权限位、systemd 服务、定时任务',
      domain: '操作系统地基', stage: 2, status: 'ready', file: 'linux-user.js'
    },
    {
      id: 'linux-net', index: 4, name: '网络与排障', icon: '🌐',
      tagline: 'ip / ss / curl / tcpdump / ssh 端口转发',
      domain: '操作系统地基', stage: 2, status: 'ready', file: 'linux-net.js'
    },
    {
      id: 'linux-storage', index: 5, name: '磁盘与存储', icon: '💾',
      tagline: '分区、LVM、Ceph、挂载、容量排查与 IO 观测',
      domain: '操作系统地基', stage: 2, status: 'ready', file: 'linux-storage.js'
    },
    {
      id: 'shell', index: 6, name: 'Shell 脚本编程', icon: '📜',
      tagline: '变量、流程控制、函数、调试与后台任务',
      domain: '操作系统地基', stage: 2, status: 'ready', file: 'shell.js'
    },

    /* ---------------- 领域二：容器与云原生 ---------------- */
    {
      id: 'docker', index: 7, name: 'Docker 容器', icon: '🐳',
      tagline: '镜像、容器、网络、数据卷、Compose',
      domain: '容器与云原生', stage: 4, status: 'ready', file: 'docker.js'
    },
    {
      id: 'kubernetes', index: 8, name: 'Kubernetes', icon: '☸️',
      tagline: 'kubectl 查询、排错、调试与集群信息',
      domain: '容器与云原生', stage: 5, status: 'ready', file: 'kubernetes.js'
    },
    {
      id: 'helm', index: 9, name: 'Helm 包管理', icon: '⛵',
      tagline: 'Chart 安装、升级、回滚与模板调试',
      domain: '容器与云原生', stage: 5, status: 'ready', file: 'helm.js'
    },

    /* ---------------- 领域三：服务与数据 ---------------- */
    {
      id: 'middleware', index: 10, name: '中间件', icon: '🧩',
      tagline: 'Nginx、Tomcat、Redis、消息队列、HAProxy 与 etcd',
      domain: '服务与数据', stage: 3, status: 'ready', file: 'middleware.js'
    },
    {
      id: 'db-cache', index: 11, name: '数据库与缓存', icon: '🗄️',
      tagline: 'MySQL、Redis、MongoDB、Kafka 运维命令',
      domain: '服务与数据', stage: 3, status: 'ready', file: 'db-cache.js'
    },
    {
      id: 'monitor', index: 12, name: '监控与日志', icon: '📊',
      tagline: '性能观测、日志检索、Prometheus / ELK',
      domain: '服务与数据', stage: 7, status: 'ready', file: 'monitor.js'
    },

    /* ---------------- 领域四：云平台与自动化 ---------------- */
    {
      id: 'cloud-cli', index: 13, name: '公有云 CLI', icon: '☁️',
      tagline: '华为云 KooCLI/obsutil、AWS CLI 与 Azure CLI',
      domain: '云平台与自动化', stage: 6, status: 'ready', file: 'cloud-cli.js'
    },
    {
      id: 'iac', index: 14, name: 'Terraform / Ansible', icon: '🏗️',
      tagline: '基础设施即代码与批量配置管理',
      domain: '云平台与自动化', stage: 6, status: 'ready', file: 'iac.js'
    },
    {
      id: 'cicd', index: 15, name: 'CI/CD 与 Git', icon: '🔁',
      tagline: 'Git 版本控制、Jenkins、GitLab CI',
      domain: '云平台与自动化', stage: 6, status: 'ready', file: 'cicd.js'
    },
    {
      id: 'kvm', index: 16, name: '虚拟化与私有云', icon: '📦',
      tagline: 'KVM/virsh、qemu-img、cloud-init、OpenStack',
      domain: '云平台与自动化', stage: 6, status: 'ready', file: 'kvm.js'
    },

    /* ---------------- 领域五：保障体系 ---------------- */
    {
      id: 'security', index: 17, name: '安全与合规', icon: '🔐',
      tagline: 'openssl、SELinux、审计、镜像扫描、加固',
      domain: '保障体系', stage: 7, status: 'ready', file: 'security.js'
    },
    {
      id: 'perf', index: 18, name: '性能压测与调优', icon: '⚡',
      tagline: 'ab/wrk/sysbench/fio 与内核参数调优',
      domain: '保障体系', stage: 7, status: 'ready', file: 'perf.js'
    }
  ];

  var DOMAIN_ORDER = ['操作系统地基', '容器与云原生', '服务与数据', '云平台与自动化', '保障体系'];

  var LEVEL_NAMES = { 1: '入门', 2: '进阶', 3: '高级', 4: '专家' };

  window.CC_CATS_META = {
    list: CATS,
    domainOrder: DOMAIN_ORDER,
    levelNames: LEVEL_NAMES,
    phase: 'Phase 1',
    /* 便于后续扩展：按 id 取分类 */
    byId: function (id) {
      for (var i = 0; i < CATS.length; i++) { if (CATS[i].id === id) return CATS[i]; }
      return null;
    }
  };

  /* 同时登记到分类表，保证即使用户没加载数据文件侧栏也能渲染 */
  for (var i = 0; i < CATS.length; i++) {
    window.CC_CATS[CATS[i].id] = CATS[i];
  }
})();
