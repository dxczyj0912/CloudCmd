#!/usr/bin/env node
/* 把学习链路缺口分为值得补、暂不单独补、以及强行自动化会误导三类。
   命令清单是人工审过的显式 ID；步骤清单是基于命令、讲义和模拟输出的初筛，
   落地断言前仍需逐条核对真实状态与模拟器能力。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
global.window = { CC_CATS: {}, CC_DATA: {}, CC_CARDS: [], CC_LESSONS: [] };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.document = { documentElement: { setAttribute() {}, getAttribute() { return 'light'; } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };
function load(file) { require(path.join(ROOT, file)); }
load('data/_registry.js');
Object.keys(window.CC_CATS).forEach(cat => load('data/' + cat + '.js'));
fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^cards.*\.js$/.test(f)).sort().forEach(f => load('data/' + f));
require('./_lessonlist').forEach(load);
load('data/termfs.js'); load('assets/js/shell.js');
require('./_cmdlist').forEach(load);

const groups = text => new Set(text.trim().split(/\s+/));
/* 值得补的是能产生可迁移判断、可在沙箱/测试账号复现的内容。
   真机任务可以是合适的学习方式；这里不把“引擎识别首词”当成可真实操作。 */
const DO = groups(`
lb-nl lb-scp lb-sftp lb-curl-o lb-watch lb-history lb-alias lb-cd-dash
lt-sed-delete lt-sed-insert lt-sed-change lt-awk-begin-end lt-awk-sum lt-paste lt-join lt-column lt-iconv lt-printf lt-log-error-rate lt-jq-k8s-pod
lu-usermod lu-groupadd lu-gpasswd lu-su lu-chgrp lu-getfacl lu-setfacl lu-systemd-analyze lu-lastlog lu-loginctl
ln-openssl-sclient ln-ufw ln-ssh ln-ssh-copy-id ln-ssh-nopass ln-known-hosts ln-ssh-config-alias ln-sftp ln-sshd-config ln-nft
ls9-ncdu ls9-parted ls9-partprobe ls9-mkfs-ext4 ls9-mkfs-xfs ls9-mkswap ls9-swapon ls9-nfs-server ls9-quota
sh-array sh-break-continue sh-function sh-getopts sh-heredoc sh-shift sh-screen-tmux sh-wait sh-timeout
dk-buildx dk-tag dk-push dk-save dk-history dk-dockerfile dk-start dk-cp dk-diff dk-troubleshoot-timezone
k8s-version k8s-daemonset k8s-job k8s-cronjob k8s-ingress k8s-create-configmap k8s-crictl k8s-troubleshoot-imagepull
hl-pull hl-push hl-create hl-helpers
mw-etcd-watch
db-mysql-mydumper db-pg-dump db-mongo-dump db-rocket-cluster db-rocket-topic db-rocket-consumer-progress db-mysqldumpslow
mo-htop mo-iotop mo-log-multitail mo-zabbix-agentd mo-jvm-jinfo mo-pmap
hw-ecs-az-flavor hw-vpc-list hw-ims-list-images hw-obsutil-help hw-flow-cloud-init hw-cross-aksk-best-practice
iac-tf-console iac-tf-log iac-tf-variable iac-tf-locals iac-tf-count-foreach iac-ans-galaxy iac-ans-doc iac-ans-copy iac-ans-file iac-ans-template iac-ans-user-group iac-ans-yum-apt iac-ans-service iac-ans-lineinfile iac-ans-become iac-ans-roles iac-ans-when-loop
ci-git-cherry-pick ci-git-submodule ci-git-bisect ci-git-worktree ci-jenkins-archive ci-gitlab-variables ci-gitlab-needs ci-gitlab-rules
vm-img-virt-customize vm-cloud-user-data vm-cloud-image-flow
sec-openssl-req sec-openssl-genrsa sec-aa-status sec-kube-bench sec-chroot sec-getsebool
`);
/* “负提升”指强行加一键模拟操作、自动判通过会产生错误信心；
   不等于从手册删除这些条目。安全的隔离演练或风险辨析仍可做。 */
const HARM = groups(`
lb-dd
lu-userdel lu-groupdel lu-chattr lu-shutdown lu-reboot lu-halt lu-poweroff
ln-iptables-save ln-ipset
ls9-lvreduce ls9-lvremove ls9-dd ls9-mdadm ls9-hdparm ls9-blkdiscard
sh-template-batch-ssh
dk-commit dk-network-rm
k8s-auth-reconcile k8s-sa-token k8s-kubeadm-init k8s-kubeadm-join k8s-kubeadm-token k8s-kubeadm-upgrade k8s-kubeadm-reset k8s-etcdctl-snapshot-restore
db-mysql-change-replication-source db-kafka-console-producer db-rabbit-plugins
hw-ecs-create hw-ecs-update-resize hw-ecs-keypair-group hw-obs-put-object hw-vpc-create hw-evs-create hw-elb-create-listener hw-rds-create hw-obsutil-mb hw-obsutil-sign hw-obsutil-restore-resume hw-aws-ec2-power hw-aws-s3-sync hw-aws-s3-presign hw-az-vm hw-az-storage-blob-upload
iac-tf-refresh
ci-gitlab-runner
sec-masscan sec-nikto sec-setenforce sec-setsebool
`);

const lessons = window.CC_LESSONS || [];
const cards = window.CC_CARDS || [];
const taught = new Set(lessons.flatMap(l => (l.steps || []).map(s => s.ref).filter(Boolean)));
const reviewed = new Set(cards.flatMap(c => c.cmdIds || []));
const absent = Object.keys(window.CC_DATA).flatMap(cat => (window.CC_DATA[cat] || [])
  .filter(c => !taught.has(c.id) && !reviewed.has(c.id)).map(c => Object.assign({ cat }, c)));
const absentIds = new Set(absent.map(c => c.id));
const knownIds = new Set(Object.keys(window.CC_DATA).flatMap(cat => (window.CC_DATA[cat] || []).map(c => c.id)));
const staleDo = [...DO].filter(id => !knownIds.has(id));
const staleHarm = [...HARM].filter(id => !knownIds.has(id) || DO.has(id));
if (staleDo.length || staleHarm.length) throw new Error('清单 ID 失效：适合做 [' + staleDo.join(', ') + ']；负提升 [' + staleHarm.join(', ') + ']');
const baselineSteps = require('./_target-step-ids.json');
const baselineCovered = baselineSteps.filter(key => {
  const [id, no] = key.split('#');
  const lesson = lessons.find(l => l.id === id);
  const step = lesson && lesson.steps[Number(no) - 1];
  return step && (step.expect != null || step.state != null);
});
/* 初筛的剩余项经逐课核对后不宜自动判：以下理由记录在逐步 CSV。 */
const AUDITED_SKIP = {
  'lu-host-identity#1': ['不建议做', '只读主机名，精确命令和退出码已足够；固定示例主机名没有迁移价值', '保留整课目标验收'],
  'k8s-secret-not-in-yaml#3': ['负提升', '模拟器回显明文密钥，继续断言它会鼓励在终端或记录中暴露凭证', '改为真实测试环境的权限与审计核验'],
  'k8s-sa-token-permission#2': ['负提升', '令牌是固定教学回显，不是可验证的短期凭证', '真实集群检查过期时间、受众和最小权限'],
  'k8s-sa-token-permission#4': ['负提升', 'TokenRequest 是静态示例，不能证明实际签发或权限范围', '用真实测试集群核对请求与授权'],
  'k8s-pod-running-but-broken#1': ['负提升', '模拟器忽略 jsonpath，返回的是普通表格', '先修复 jsonpath 仿真再添加字段断言'],
  'k8s-pod-running-but-broken#3': ['负提升', '模拟器忽略 jsonpath，返回的是普通表格', '先修复 jsonpath 仿真再添加字段断言'],
  'k8s-annotate-change-cause#3': ['负提升', '前面的 annotate 不保存集群状态，此处读出的还是旧注解', '在有状态测试集群核对写入后的键和值'],
  'k8s-label-scheduling#3': ['负提升', '前面的 label 不保存集群状态，此处仍显示 No resources found', '先实现状态转移再自动判节点筛选结果'],
  'dk-remove-container-and-image#6': ['不建议做', '静态列表只能说明仿真样例里有悬空镜像，不能证明清理结果', '保留人工确认资源与磁盘占用'],
  'hl-upgrade-diff-before-apply#3': ['不建议做', '升级回显只说明命令接受，整课已有渲染结果和差异验收', '真机再核对实际 release revision 与工作负载'],
  'hl-release-inventory-audit#5': ['不建议做', '静态 yes 是当前角色的示例权限，精确命令和退出码已覆盖', '真实账号需按 namespace 和身份复核'],
  'hw-sg-3306#3': ['负提升', 'grep 得到的是教学提示，非云 API 返回的真实安全组规则', '测试账号按方向、源地址和端口逐条核对'],
  'mon-process-vanished#1': ['负提升', '模拟 dmesg 没有本课要找的 OOM 证据，断言会教错定位方向', '保留人工判断并补充真实 OOM 样本后再判'],
  'db-metadata-lock-wait#2': ['不建议做', '筛选结果为空并不能证明没有阻塞会话', '以事务和锁等待链的后续证据验收'],
  'sh-hosts-inventory-loop#1': ['不建议做', '只是读取输入清单，后续循环结果才是验收点', '保留命令及退出码校验']
};
const unreviewed = baselineSteps.filter(key => !baselineCovered.includes(key) && !AUDITED_SKIP[key]);
if (unreviewed.length) throw new Error('仍有未复核的步骤候选: ' + unreviewed.join(', '));

function commandChoice(c) {
  if (HARM.has(c.id)) {
    if (/^hw-/.test(c.id)) return ['负提升', '真实调用会改资源、产生费用或泄露访问能力；模拟成功不等于云端状态已验证', '只做参数辨析与带费用边界的真实测试账号演练'];
    if (/^(lu-(shutdown|reboot|halt|poweroff)|ls9-(lvreduce|lvremove|dd|mdadm|hdparm|blkdiscard)|lb-dd|k8s-(kubeadm|etcdctl-snapshot-restore))/.test(c.id))
      return ['负提升', '可能中断系统或毁坏数据；把模拟回显做成“通过”会训练错误操作习惯', '保留风险说明；只能在可恢复隔离环境按检查表练'];
    if (c.id === 'iac-tf-refresh') return ['负提升', '旧式直接刷新状态的路径容易掩盖漂移，不应作为推荐操作课', '讲清 plan -refresh-only 与状态备份/审查'];
    if (c.id === 'dk-commit') return ['负提升', '把临时容器改动固化成推荐构建流程，会弱化 Dockerfile 可复现性', '用反例卡辨析 Dockerfile 与 commit'];
    return ['负提升', '直接模拟副作用或自动判通过会掩盖权限、范围和真实状态', '只在隔离环境或人工审查中演练，保留回滚证据'];
  }
  if (DO.has(c.id)) {
    if (!window.CC_SHELL.runnable(String(c.name || '').trim().split(/\s+/)[0]))
      return ['适合做', '知识点有实际迁移价值，但当前模拟器未实现首词', '先做决策卡或双机/真机任务，不伪造终端结果'];
    if (/^(hw-|ln-ssh|lb-scp|lb-sftp|ln-sftp|dk-push|hl-push)/.test(c.id))
      return ['适合做', '真实场景有价值，但涉及远端或账号状态', '用隔离账号/测试主机；结果由真实资源和清单核验'];
    return ['适合做', '可串入真实场景，产出可观察的文件、配置或诊断证据', '补场景步骤与辨析卡；验收看状态/结构，不背固定回显'];
  }
  if (/^hw-(aws|az)-/.test(c.id)) return ['不建议做', '跨云平台资料与当前华为云主线不同，缺少账号环境时独立模拟课容易变成命令背诵', '保留跨云对照；有实际 AWS/Azure 项目时再设计完整任务'];
  if (/^(ci-jenkins|ci-gitlab)/.test(c.id)) return ['不建议做', '流水线配置片段脱离完整仓库和 Runner 很难形成可核验练习', '放进完整流水线项目，先验证真实配置与作业日志'];
  if (c.kind === 'recipe') return ['不建议做', '是概念、模板或组合配方，单独做一个模拟命令课容易碎片化', '保留速查；在相关场景课中按需引用'];
  if (Number(c.level) >= 3) return ['不建议做', '低频或强依赖具体平台/版本，当前没有独立课程的足够收益', '保留手册，遇到实际案例再补定向练习'];
  return ['不建议做', '与现有命令或课程高度相邻，单独补课容易重复', '保留手册，必要时补到现有讲义而非新增整课'];
}

const mockOutput = /教学环境|教学提示|模拟环境|模拟成功|不会真的|只展示归档清单示例|真机上这些改动/;
const irreversible = /\b(?:rm\s+-rf|wipefs|mkfs\.|lvreduce|lvremove|blkdiscard|kubeadm\s+reset|terraform\s+destroy|docker\s+(?:system|volume|network)\s+prune|kubectl\s+(?:delete|drain)|setenforce\s+0)\b/i;
const observableGoal = /验证|校验|核对|复核|确认|判断|定位|读出|找出|找大|检查.*(?:结果|状态|配置)|看.*(?:状态|原因|错误|占用|上限|延迟|等待|线程|健康|结果)|回看|验包/;
const safeMutation = /\b(?:touch|mkdir|cp|mv|chmod|chown|git\s+(?:add|switch|commit|stash)|zip\s+-r|nmcli\s+con\s+mod|systemctl\s+(?:start|enable|restart)|docker\s+(?:run|start|tag|cp)|kubectl\s+(?:annotate|label|create))\b/i;
function stepChoice(lesson, step, result, index) {
  const audited = AUDITED_SKIP[lesson.id + '#' + (index + 1)];
  if (audited) return audited;
  const command = String(step.cmd || '');
  const output = (result.out || []).concat(result.err || []).join('\n');
  if (mockOutput.test(output)) return ['负提升', '模拟器明确提示回显/副作用是教学替身；对这段文字加断言会把假状态判成真', '保留模拟说明；真机结果用后置状态或人工证据验收'];
  if (!/--dry-run|--check|\bplan\b/.test(command) && irreversible.test(command))
    return ['负提升', '不可逆或大范围操作不应靠一次模拟回显自动判通过', '只在可恢复隔离环境用前置清单与后置状态验收'];
  if (observableGoal.test(String(step.title || '') + ' ' + String(step.about || '')))
    return ['适合做', '步骤目标指向可核对的结果或状态，补结构性断言有教学收益', '优先校验字段/状态转移，避免固定 IP、时间戳、PID 和资源 ID'];
  if (safeMutation.test(command))
    return ['适合做', '步骤会改变可观察对象，仅校验命令和退出码可能漏掉错误目标', '先确认模拟器保存了状态，再查文件/配置/资源；无状态则改人工验收'];
  return ['不建议做', '主要是探索、铺垫或只读观察；精确命令、退出码和整课目标已有基本约束', '不逐字断言样例回显；必要时在后续验收步骤检查结论'];
}

const commandRows = absent.map(c => {
  const [decision, reason, next] = commandChoice(c);
  return [c.cat, c.id, c.name, c.level, c.kind || 'command', decision, reason, next,
    DO.has(c.id) || HARM.has(c.id) ? '显式 ID 标注' : '默认暂缓，需按真实需求复核'];
});
const stepRows = [];
for (const lesson of lessons) {
  const shell = window.CC_SHELL.create();
  (lesson.steps || []).forEach((step, index) => {
    const result = shell.exec(step.cmd);
    if (step.expect != null || step.state != null) return;
    const [decision, reason, next] = stepChoice(lesson, step, result, index);
    stepRows.push([lesson.cat, lesson.id, index + 1, step.title, step.cmd, step.ref || '', decision, reason, next,
      AUDITED_SKIP[lesson.id + '#' + (index + 1)] ? '逐步复核，模拟器实跑' : '规则初筛，未验证断言设计']);
  });
}
function csv(rows, headers) {
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  return '\uFEFF' + [headers].concat(rows).map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
fs.writeFileSync(path.join(OUT, '命令补强取舍.csv'), csv(commandRows, ['分类', '命令ID', '名称', '级别', '类型', '建议', '理由', '下一步', '筛选方式']), 'utf8');
fs.writeFileSync(path.join(OUT, '步骤断言取舍.csv'), csv(stepRows, ['分类', '课程ID', '步骤序号', '步骤标题', '命令', '关联命令ID', '建议', '理由', '下一步', '筛选方式']), 'utf8');
function counts(rows, at) { return ['适合做', '不建议做', '负提升'].map(k => [k, rows.filter(r => r[at] === k).length]); }
const cc = counts(commandRows, 5), sc = counts(stepRows, 6);
const lines = [
  '# 学习链路补强取舍', '',
  '> 基于当前课程、卡片、命令手册和模拟器逐项盘点。这里判断的是“是否值得新增独立课程/卡片或步骤级自动断言”，不是命令是否值得了解。`负提升` 特指强行一键模拟执行或对固定回显自动判通过；安全的讲解与风险辨析仍然可以做。', '',
  '## 结论', '',
  '| 缺口 | 适合做 | 不建议做 | 强行做是负提升 | 明细 |', '| --- | ---: | ---: | ---: | --- |',
  `| 无课无卡命令（${commandRows.length}） | ${cc[0][1]} | ${cc[1][1]} | ${cc[2][1]} | [逐条决定](命令补强取舍.csv) |`,
  `| 无步骤级断言（${stepRows.length}） | ${sc[0][1]} | ${sc[1][1]} | ${sc[2][1]} | [逐步取舍](步骤断言取舍.csv) |`, '',
  `上一轮的 237 条无课无卡命令中，适合补的 ${DO.size} 条已全部接入场景卡，其中可稳定复现的部分还补了课程。上一轮 ${baselineSteps.length} 个步骤候选已对 ${baselineCovered.length} 个配置并逐课验证步骤级断言；余下 ${baselineSteps.length - baselineCovered.length} 个逐项复核后改列为暂缓或负提升。当前 CSV 只列剩余缺口，不能把基线与剩余量相加。`, '',
  '## 适合做', '',
  '- **命令**：已按真实问题补场景、判据和反向排除；基础类如 `nl`、路径传输、`watch`，文本类如 `sed`、`awk`、`iconv`，云原生类如 Job/CronJob，数据类如备份与消费积压。远端操作用测试主机或测试账号，不把本地模拟回显当成功。',
  '- **步骤断言**：已补验收字段、文件存在性/权限及状态转移，并逐课验证；没有把示例机器的 IP、PID、时间和云资源 ID 写成判据。', '',
  '## 不建议单独做', '',
  '- **命令**：`more`、`fgrep`、`service`、`runlevel`、`terraform workspace` 等已有更常用替代或强烈依赖平台；低频格式选项、Jenkins/GitLab 的零散配置字段更适合放在现有课的讲义或速查，不必为覆盖率各开一课。',
  '- **步骤断言**：开场摸底和只读探索（例如先 `ls`、`cat`、`kubectl get` 看现状）已经检查精确命令及退出码，整课还有目标结果。每步都固定样例输出会让练习从“判断问题”退化成“复述模拟器”。', '',
  '## 强行做会负提升', '',
  '- **命令**：关机重启、卷缩小/删除、磁盘擦除、`kubeadm reset`、etcd 恢复、无边界扫描以及真实云资源创建/扩容。将这些命令做成“一键送终端并显示已掌握”会隐去范围、权限、费用和回滚条件。`docker commit` 和旧式 `terraform refresh` 若当作推荐流程，也会教错工程习惯。',
  '- **步骤断言**：模拟器明确说“不会真的改写集群”“模拟 apply 成功”“只展示归档清单示例”的回显，不能当状态证据。例如 `kubectl port-forward` 的模拟回显固定显示 3306，即使请求其他端口；给这种回显加精确匹配只会奖励假成功。',
  '- **替代**：可讲风险与决策，可在可恢复隔离环境做人工验收；必要时先把模拟器补成真正有状态，再设计自动判题。', '',
  '## 分类口径', '',
  '| 决定 | 对命令意味着 | 对步骤意味着 |', '| --- | --- | --- |',
  '| 适合做 | 设计场景、迁移卡与可核验结果 | 补结构化输出或状态断言 |',
  '| 不建议做 | 保留速查，按实际需求合并进已有课程 | 沿用命令与退出码、整课目标 |',
  '| 负提升 | 不做危险的一键模拟成功或错误推荐 | 不以静态回显证明真实副作用 |', '',
  '这份取舍与 [全量清单](学习链路全量清单.md) 使用相同数据口径，可运行 `node tools/learning-chain-triage.js` 更新。'
];
const categories = Object.keys(window.CC_CATS);
const categoryTable = [
  '## 按分类查看', '',
  '| 分类 | 命令：适合 | 命令：暂缓 | 命令：负提升 | 步骤：适合 | 步骤：暂缓 | 步骤：负提升 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'
];
categories.forEach(cat => {
  const n = (rows, catAt, decisionAt, choice) => rows.filter(r => r[catAt] === cat && r[decisionAt] === choice).length;
  categoryTable.push(`| ${cat} | ${n(commandRows, 0, 5, '适合做')} | ${n(commandRows, 0, 5, '不建议做')} | ${n(commandRows, 0, 5, '负提升')} | ${n(stepRows, 0, 6, '适合做')} | ${n(stepRows, 0, 6, '不建议做')} | ${n(stepRows, 0, 6, '负提升')} |`);
});
categoryTable.push('', '步骤的数字是规则初筛，尤其“暂缓”表示当前不值得机械添加固定回显断言，不表示这些课不需要教学验收。适合组里也要先确认模拟器会保存相关状态；首词可执行不保证整条命令都可复现。', '');
lines.splice(lines.indexOf('## 适合做'), 0, ...categoryTable);
fs.writeFileSync(path.join(OUT, '学习链路补强取舍.md'), lines.join('\n') + '\n', 'utf8');
console.log('命令 ' + commandRows.length + '：' + cc.map(x => x.join(' ')).join('、'));
console.log('步骤 ' + stepRows.length + '：' + sc.map(x => x.join(' ')).join('、'));
