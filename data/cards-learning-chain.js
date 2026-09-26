/* 课程后迁移练习：从故障或验收目标回忆判据，不重复讲义里的步骤。 */
(function () {
  'use strict';
  window.CC_CARDS = window.CC_CARDS || [];
  window.CC_CARDS.push(
    {
      id: 'card-chain-disk-baseline', cat: 'linux-storage', kind: 'distinguish', level: 3,
      front: '一块盘的随机读延迟偶尔飙高。先测单次 I/O 延迟，还是直接用吞吐压测数字下结论？',
      answer: 'ioping -c 20 /data',
      why: '先看多次 I/O 的延迟分布，确认抖动是否稳定存在；吞吐压测需要同时固定块大小、队列深度和读写模式，否则两个数字不可比。',
      contrast: '用 fio 做基线时保存完整参数和测试时间，并选独立测试文件；不要在业务高峰对生产盘做写入压测。',
      run: 'ioping -c 20 /data', cmdIds: ['ls9-ioping', 'ls9-fio'], lesson: 'ls-disk-perf-baseline'
    },
    {
      id: 'card-chain-lvm-grow', cat: 'linux-storage', kind: 'distinguish', level: 3,
      front: '卷组还有空闲空间，业务卷需要扩容。动手前先确认哪两层的大小，扩容后再核对什么？',
      answer: 'pvs -o pv_name,pv_size,pv_free,vg_name',
      why: '物理卷空闲量和逻辑卷当前大小是扩容的两个边界；修改后重新看逻辑卷大小，并确认文件系统容量同步增长。',
      contrast: '只扩大逻辑卷而没扩文件系统，应用可用空间仍不变；使用 -r 时也要核对命令是否真的完成。',
      run: 'pvs -o pv_name,pv_size,pv_free,vg_name', cmdIds: ['ls9-pvcreate', 'ls9-lvcreate'], lesson: 'ls-lvm-why'
    },
    {
      id: 'card-chain-smart-warning', cat: 'linux-storage', kind: 'diagnose', level: 3,
      front: '磁盘还可读，但近期出现未决扇区和重映射计数增长。上线判断应先看哪类健康证据？',
      answer: 'smartctl -a /dev/sda',
      why: '总健康结论可能仍显示 PASSED；需要比较 Reallocated_Sector_Ct 和 Current_Pending_Sector 的趋势，并结合自检记录与内核 I/O 错误。',
      contrast: '单次计数不一定足以判坏；计数持续增长时先保证备份与替换窗口，不要等磁盘完全失效。',
      run: 'smartctl -a /dev/sda', cmdIds: ['ls9-smartctl'], lesson: 'ls-smart-disk-failing'
    },
    {
      id: 'card-chain-raid-degraded', cat: 'linux-storage', kind: 'diagnose', level: 3,
      front: '业务还能读写，但阵列告警少了一块成员盘。第一眼应核对阵列的哪项状态？',
      answer: 'cat /proc/mdstat',
      why: '成员标记如 [U_] 表示阵列已降级；再用 mdadm --detail 定位缺失成员和重建进度。能访问不等于冗余仍在。',
      contrast: '确认故障盘设备名后再换盘，不要仅凭 /dev/sdX 顺序判断；误选健康盘会把可恢复故障变成数据丢失。',
      run: 'cat /proc/mdstat', cmdIds: ['ls9-mdstat'], lesson: 'ls-raid-degraded'
    },
    {
      id: 'card-chain-annotation-audit', cat: 'kubernetes', kind: 'distinguish', level: 2,
      front: '发布后要让下一班知道一次变更的原因和负责人。把说明写在哪里，怎样确认它确实保存了？',
      answer: 'kubectl annotate deploy web description="订单服务，负责人 张三" -n my-app --overwrite',
      why: 'annotation 适合存非选择器的描述性元数据；写后用 get -o jsonpath 读取 metadata.annotations，确认目标命名空间与对象正确。',
      contrast: 'label 用于筛选与调度，不能把长篇变更说明误放进 label；正式审计仍需关联变更单。',
      cmdIds: ['k8s-annotate'], lesson: 'k8s-annotate-change-cause'
    },
    {
      id: 'card-chain-etcd-backup', cat: 'kubernetes', kind: 'diagnose', level: 3,
      front: '集群控制面备份文件已经生成。哪一步能避免把空文件或损坏文件当作可恢复快照？',
      answer: 'ETCDCTL_API=3 etcdctl --write-out=table snapshot status /var/backups/etcd-20240601.db',
      why: '快照状态应能读出 revision、key 数和大小；还要定期在隔离环境演练恢复，确认凭证、证书和版本匹配。',
      contrast: '仅看到备份目录里有文件不算验收；也不能在生产控制面上为验证而直接执行恢复。',
      run: 'ETCDCTL_API=3 etcdctl --write-out=table snapshot status /var/backups/etcd-20240601.db',
      cmdIds: ['k8s-etcdctl-snapshot-save'], lesson: 'k8s-etcd-backup'
    },
    {
      id: 'card-chain-one-off-job', cat: 'kubernetes', kind: 'distinguish', level: 2,
      front: '数据库迁移只应执行一次。先检查创建出来的资源清单，再提交到集群，用哪种工作负载？',
      answer: 'kubectl create job db-migrate --image=busybox --dry-run=client -o yaml',
      why: 'Job 有完成和失败状态，适合一次性任务；dry-run 先确认镜像、命名空间和命令，再执行真实创建并看 Job 状态与日志。',
      contrast: 'Deployment 会维持副本，迁移进程退出后可能被再次拉起；迁移本身也必须设计幂等或加锁。',
      run: 'kubectl create job db-migrate --image=busybox --dry-run=client -o yaml', cmdIds: ['k8s-create-job'], lesson: 'k8s-one-off-job'
    },
    {
      id: 'card-chain-elb-backend', cat: 'cloud-cli', kind: 'diagnose', level: 3,
      front: '负载均衡的一半请求返回 502，但两台主机进程都在。下一步应看主机存活还是后端健康状态？',
      answer: 'hcloud ELB ShowLoadBalancerStatus/v3 --cli-region=cn-north-4',
      why: '后端可能因健康检查路径、端口或安全组被判 OFFLINE；先按后端成员看健康状态，再核对检查配置和实例日志。',
      contrast: '进程运行不代表探针可达；不要在尚未确认故障范围时重启全部后端。',
      run: 'hcloud ELB ShowLoadBalancerStatus/v3 --cli-region=cn-north-4', cmdIds: ['hw-elb-list', 'hw-elb-health-check'], lesson: 'hw-elb-backend-down'
    },
    {
      id: 'card-chain-rds-backup', cat: 'cloud-cli', kind: 'distinguish', level: 3,
      front: '审计问“数据库每天都有备份吗”。只看已配置的策略足够吗，还应核对哪项实物证据？',
      answer: 'hcloud RDS ListBackups --cli-region=cn-north-4',
      why: '策略说明计划，备份列表说明任务是否实际成功；还要确认最近备份时间、保留期，并做隔离恢复演练。',
      contrast: '有备份记录不保证可以恢复到业务可接受时间点；恢复目标和权限也要单独验证。',
      run: 'hcloud RDS ListBackups --cli-region=cn-north-4', cmdIds: ['hw-rds-list', 'hw-rds-power-backup'], lesson: 'hw-rds-backup-audit'
    },
    {
      id: 'card-chain-git-staged-diff', cat: 'cicd', kind: 'distinguish', level: 2,
      front: '提交前看到工作区有改动。想确认“下一次提交实际包含哪些行”，只看工作区差异够吗？',
      answer: 'git diff --cached',
      why: '普通 diff 看未暂存的变化，--cached 看已暂存、即下一次提交会包含的变化；提交前还要核对 status 中有没有意外文件。',
      contrast: '只跑 git status 能看文件名单，但看不到每行改动；先审差异再提交，避免把密钥或调试代码带入。',
      run: 'cd /data/app && git diff --cached --stat', cmdIds: ['ci-git-status'], lesson: 'ci-diff-before-commit'
    },
    {
      id: 'card-chain-strace-wait', cat: 'monitor', kind: 'diagnose', level: 3,
      front: '进程没日志、CPU 也不高，却一直不响应。怎样先判断它是在等 I/O、网络还是锁？',
      answer: 'timeout 5 strace -c -p 18442',
      why: '短时间附加并汇总系统调用可看等待类型与耗时；结合 /proc/<pid>/wchan 判断是否卡在内核等待点。',
      contrast: '跟踪会有性能开销且涉及权限，生产上先限制时长与目标 PID，不要全机长时间追踪。',
      run: 'cat /proc/18442/wchan', cmdIds: ['mo-strace'], lesson: 'mon-strace-stuck-process'
    },
    {
      id: 'card-chain-cpu-hotspot', cat: 'monitor', kind: 'diagnose', level: 3,
      front: 'CPU 长时间偏高，普通进程列表只能指出 PID。下一步怎样看到热点函数和调用链？',
      answer: 'perf record -F 99 -p 18442 -g -- sleep 30',
      why: '采样记录调用栈后再看报告，可区分用户态计算、内核开销与锁争用；保留采样窗口和负载条件才能复现。',
      contrast: '单看 top 不能定位代码路径；采样前确认符号文件和权限，否则报告可能只剩地址。',
      run: 'perf report --stdio | head -40',
      cmdIds: ['mo-perf'], lesson: 'mon-cpu-hotspot-flame'
    },
    {
      id: 'card-chain-alert-silence', cat: 'monitor', kind: 'distinguish', level: 2,
      front: '计划维护两小时，只想暂时屏蔽一个确定的告警。应关掉规则，还是创建有到期时间的匹配窗口？',
      answer: 'amtool silence add --duration=2h --comment="数据库升级维护窗口" alertname=MySQLDown --alertmanager.url=http://127.0.0.1:9093',
      why: '静默要写清匹配器、时长和原因；到期自动恢复，值班人员仍能看到事件，并可核对当前静默列表。',
      contrast: '直接删规则会丢失告警覆盖；匹配器过宽会把其他真实故障一并吞掉。',
      run: 'amtool --alertmanager.url=http://127.0.0.1:9093 alert query',
      cmdIds: ['mo-amtool'], lesson: 'mon-alert-silence'
    },
    {
      id: 'card-chain-kvm-rescue', cat: 'kvm', kind: 'diagnose', level: 3,
      front: '虚机启动失败，反复重启会继续改写磁盘。先怎样只读查看镜像里的挂载配置？',
      answer: 'virt-cat -a /data/vmstore/broken-vm.qcow2 /etc/fstab',
      why: '离线读取 fstab 可发现错误 UUID 或不存在的挂载点；确认镜像路径、快照链和备份后再决定是否修复。',
      contrast: '直接对原盘做写入式救援可能扩大损失；优先用只读工具采证，修复前复制镜像。',
      run: 'virt-cat -a /data/vmstore/broken-vm.qcow2 /etc/fstab', cmdIds: ['vm-img-guestfish'], lesson: 'kvm-offline-rescue'
    },
    {
      id: 'card-chain-release-signature', cat: 'security', kind: 'distinguish', level: 3,
      front: '安装包哈希值和发布页一致，但发布页也可能被替换。怎样证明包来自持有私钥的发布者？',
      answer: 'gpg --verify /opt/pkg/app-1.2.3.tar.gz.asc /opt/pkg/app-1.2.3.tar.gz',
      why: '数字签名同时绑定内容与签名者；验证时还要通过可信渠道核对公钥指纹，避免导入攻击者的假公钥。',
      contrast: '单独计算摘要只能发现与某个摘要不一致，无法证明摘要或包的来源；加密也不等于签名。',
      run: 'openssl dgst -sha256 /opt/pkg/app-1.2.3.tar.gz', cmdIds: ['sec-openssl-dgst', 'sec-gpg'], lesson: 'sec-release-sign-gpg'
    },
    {
      id: 'card-chain-path-parts', cat: 'linux-basic', kind: 'distinguish', level: 2,
      front: '交接文档既要写关键配置的文件名，也要写它所在的目录；从同一个绝对路径分别取哪两部分？',
      answer: 'basename /data/app/config.yaml；dirname /data/app/config.yaml',
      why: '前者取最后一段 config.yaml，后者取父目录 /data/app；两者组合后可以生成准确的文件清单与恢复位置。',
      contrast: '不要靠固定字符数截取路径，目录层级和文件名长度变化后会截错。',
      run: 'basename /data/app/config.yaml', cmdIds: ['lb-basename', 'lb-dirname'], lesson: 'basic-handover-zip'
    },
    {
      id: 'card-chain-zip-audit', cat: 'linux-basic', kind: 'distinguish', level: 2,
      front: '项目目录打成包以后，文件确实生成了。发送给同事前还缺哪一步验收？',
      answer: 'unzip -l /data/backup/app-handover.zip',
      why: '只读列出包内文件，确认关键配置和目录层级都在；打包时要递归包含子目录，不能把“文件存在”当成“内容完整”。',
      contrast: '解压到生产路径才发现遗漏就太晚了；先在原地看清单，必要时再到隔离目录试解。',
      run: 'zip -r /data/backup/app-handover.zip /data/app && unzip -l /data/backup/app-handover.zip',
      cmdIds: ['lb-tree', 'lb-zip', 'lb-unzip'], lesson: 'basic-handover-zip'
    }
  );
})();
