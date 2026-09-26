/* 可在虚拟文件系统里核对结果的补强课；远端操作仍用复习卡给真实环境验收路径。 */
(function () {
  'use strict';
  window.CC_LESSONS = window.CC_LESSONS || [];
  window.CC_LESSONS.push(
    {
      id: 'lt-numbered-config-review', cat: 'linux-basic', title: '报错行号怎样与原文件对齐',
      prompt: '配置检查指出一行错误，你把带空行的文件发给同事复核。行号不能因为空行被跳过而偏移。',
      task: '比较默认编号与给所有行编号的结果，确认空行也占行号',
      steps: [
        { title: '先看默认编号', about: '看空行在默认规则下是否占号', cmd: 'nl /etc/nginx/nginx.conf | head -5', ref: 'lb-nl', hint: ['先拿到文件开头几行的编号输出，注意空行左侧是什么。', 'nl /etc/nginx/nginx.conf | head -____'], note: '默认只给非空行编号，不能与编辑器中的物理行号一一对应' },
        { title: '让空行也占号', about: '复核编号连续性', cmd: 'nl -ba /etc/nginx/nginx.conf | head -5', ref: 'lb-nl', hint: ['需要让空行也拿到编号；选择给所有行编号的 body 规则。', 'nl -____ /etc/nginx/nginx.conf | head -5'], expect: /^\s*3\s*$/m, note: '第三行是空行，现在仍有编号；原文件没有被修改' }
      ],
      answer: 'nl -ba /etc/nginx/nginx.conf | head -5',
      expect: /^\s*3\s*$/m,
      teach: '`nl` 默认跳过空行；与报错位置对齐时用 `-ba`。这里只改变输出，不会给原配置文件写入行号。'
    },
    {
      id: 'lt-join-host-roster', cat: 'linux-text', title: '两份主机清单按 IP 关联',
      prompt: '一份清单记录 IP 与短名，另一份记录 IP 与正式主机名。要按共同的 IP 关联，不能凭行号盲拼。',
      task: '先核对两份输入的键，再按键合并并排版以便复核',
      steps: [
        { title: '看第一份键', about: '确认连接键所在的列和排序', cmd: 'head -3 /opt/app/data/ips.csv', ref: 'lb-head', hint: ['先只看第一份文件的前三行，确认第一列是不是连接键。', 'head -____ /opt/app/data/ips.csv'], expect: /^(?:\d{1,3}\.){3}\d{1,3},[^,\n]+$/m, note: '按键关联要求两份输入先按键排序' },
        { title: '看第二份键', about: '确认另一份文件使用相同键', cmd: 'head -3 /opt/app/data/hostnames.csv', ref: 'lb-head', hint: ['同样查看另一份输入的前几行，核对键的格式与顺序。', 'head -____ /opt/app/data/hostnames.csv'], expect: /^(?:\d{1,3}\.){3}\d{1,3},[^,\n]+$/m, note: '仅按行并排会在缺行时把主机错配' },
        { title: '按共同键合并', about: '结果中每行应包含 IP、短名与正式名', cmd: 'join -t, /opt/app/data/ips.csv /opt/app/data/hostnames.csv', ref: 'lt-join', hint: ['两份输入都按第一列排序，用逗号作为字段分隔符进行键关联。', 'join -____ /opt/app/data/ips.csv /opt/app/data/hostnames.csv'], expect: /^(?:\d{1,3}\.){3}\d{1,3},[^,\n]+,[^,\n]+$/m, note: '合并后要数行数，并检查未匹配的键是否需要另行处理' },
        { title: '做成可读的三列', about: '只调整展示，仍保留键关联的结果', cmd: 'join -t, /opt/app/data/ips.csv /opt/app/data/hostnames.csv | column -t -s,', ref: 'lt-column', hint: ['先完成关联，再把逗号分隔的结果排齐给人读；最后的工具不负责关联。', 'join -t, /opt/app/data/ips.csv /opt/app/data/hostnames.csv | column -____'], expect: /^(?:\d{1,3}\.){3}\d{1,3}\s+\S+\s+\S+$/m, note: 'column 只是展示工具；机器继续处理时保留原 CSV' }
      ],
      answer: 'join -t, /opt/app/data/ips.csv /opt/app/data/hostnames.csv | column -t -s,',
      expect: /^(?:\d{1,3}\.){3}\d{1,3}\s+\S+\s+\S+$/m,
      teach: '`join` 按共同键匹配，要求双方已排序；`paste` 只是逐行拼接，缺行会错配；`column` 只负责让人看得整齐。'
    },
    {
      id: 'hl-chart-scaffold-check', cat: 'helm', title: '生成 Chart 后先检查骨架',
      prompt: '项目要建立一个内部 Chart。先创建骨架，再确认 Chart.yaml 确实落地且元数据需要按项目修改。',
      task: '创建 my-app Chart，并核对元数据文件',
      steps: [
        { title: '生成骨架', about: '在当前目录新建项目模板', cmd: 'helm create my-app', ref: 'hl-create', hint: ['用 Chart 的初始化命令生成一个指定名字的新目录。', 'helm ____ my-app'], state: { paths: [{ path: '/root/my-app/Chart.yaml', type: 'file' }] }, note: '生成的是示例模板，不能直接当生产配置发布' },
        { title: '核对元数据文件', about: '确认目标目录内确有文件', cmd: 'ls -l my-app/Chart.yaml', ref: 'lb-ls', hint: ['先确认初始化命令留下了具体文件，而不只看创建成功的回显。', 'ls -l ____'], state: { paths: [{ path: '/root/my-app/Chart.yaml', type: 'file' }] }, note: '真实项目还需清理模板默认资源与示例值' },
        { title: '读出版本与名称', about: '核对 Chart 元数据而不是运行状态', cmd: 'cat my-app/Chart.yaml', ref: 'lb-cat', hint: ['打开刚才确认存在的元数据文件，找 apiVersion、name 和 version。', 'cat ____'], expect: /^apiVersion:\s+v2[\s\S]*^name:\s+my-app/m, note: 'Chart version 与 appVersion 是两套版本，发布前都要核对' }
      ],
      answer: 'helm create my-app && cat my-app/Chart.yaml',
      expect: /^apiVersion:\s+v2[\s\S]*^name:\s+my-app/m,
      teach: '`helm create` 只提供起点。正式使用前要替换默认元数据与 values，删除不用的模板，再在真实 Helm 环境执行 lint/template 和测试安装。'
    }
  );
})();
