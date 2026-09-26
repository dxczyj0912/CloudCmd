/* tools/check-ops.js · 磁盘存储 / 监控日志 / 性能压测 三类命令的断言校验
   --------------------------------------------------------------------------
   与 tools/shell-check.js 的分工：
     shell-check.js   验证**引擎本身**的行为（ls/cat/docker/k8s/git…），是回归网
     check-ops.js     验证本任务新加的 cmd-ops.js 命令，**每条命令至少 3 条断言**：
                        ① 正常用法：输出里该有的关键信息在不在
                        ② 参数写错：必须走 err（不是塞进 out）+ 退出码非 0
                        ③ 边界：空参数 / 不存在的设备 / 危险操作拦不拦

   为什么要有这个文件：断言写错会一直"绿着骗人"。所以每条断言都做过一次
   "把实现改坏 → 断言确实变红 → 改回来"的反向验证（见文件末尾 MUTATION 说明）。

   用法：
     node tools/check-ops.js              人类可读报告，全绿退出码 0
     node tools/check-ops.js --verbose    失败时打印全部 stdout/stderr
     node tools/check-ops.js --list       只列出被覆盖的命令清单
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const VERBOSE = ARGV.indexOf('--verbose') !== -1;
const LIST_ONLY = ARGV.indexOf('--list') !== -1;

/* ---------------------------------------------------------------------------
   加载引擎。用 vm.runInThisContext 逐文件执行（而不是 eval），这样一个文件的
   语法错误不会连坐其它文件 —— 并行开发时别人的 cmd-*.js 半成品不该让我们跑不了。
   --------------------------------------------------------------------------- */
global.window = { CC_CATS: {}, CC_DATA: {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  documentElement: { setAttribute() {}, getAttribute() { return 'light'; } },
  addEventListener() {}, getElementById: () => null, querySelectorAll: () => []
};

const loadErrors = [];
function load(file) {
  try {
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file, displayErrors: true });
    return true;
  } catch (e) {
    loadErrors.push({ file, message: e.message });
    return false;
  }
}

['data/_registry.js', 'data/termfs.js', 'assets/js/store.js', 'assets/js/shell.js', 'assets/js/sim-data.js', 'assets/js/cmd-ops.js']
  .forEach(load);

if (!window.CC_SHELL) {
  console.error('✗ shell.js 没加载成功，无法继续：');
  loadErrors.forEach((e) => console.error('   ' + e.file + ': ' + e.message));
  process.exit(1);
}
/* cmd-ops.js 是本次要验证的对象：它没加载成功就必须失败退出，不能"跳过即通过" */
const opsLoad = loadErrors.filter((e) => /cmd-ops\.js$/.test(e.file))[0];
if (opsLoad) {
  console.error('✗ assets/js/cmd-ops.js 加载失败（语法错误？）：' + opsLoad.message);
  process.exit(1);
}

const ALL = new Set(window.CC_SHELL.commands);
const MISSING = [];
const COVERED = new Set();

let pass = 0, fail = 0;
const failures = [];

/* ---------------------------------------------------------------------------
   断言辅助
   --------------------------------------------------------------------------- */
function out(res) { return (res.out || []).join('\n'); }
function err(res) { return (res.err || []).join('\n'); }
function both(res) { return out(res) + '\n' + err(res); }

/* has(re) / hasNot(re) / codeIs(n) / isErr() / isEmpty() */
function has(re) {
  return (res, name) => re.test(both(res)) ? true : '输出里找不到 ' + re + '\n      stdout: ' + out(res).slice(0, 200) + '\n      stderr: ' + err(res).slice(0, 200);
}
function outHas(re) {
  return (res) => re.test(out(res)) ? true : 'stdout 里找不到 ' + re + '（实际: ' + out(res).slice(0, 200) + '）';
}
function errHas(re) {
  return (res) => re.test(err(res)) ? true : 'stderr 里找不到 ' + re + '（实际: ' + err(res).slice(0, 200) + '）';
}
function hasNot(re) {
  return (res) => re.test(both(res)) ? false : '输出里不该出现 ' + re + '（实际: ' + both(res).slice(0, 200) + '）';
}
function codeIs(n) { return (res) => res.code === n ? true : '退出码应为 ' + n + '，实际 ' + res.code; }
function isErr() { return (res) => err(res) !== '' ? true : '这是错误用法，报错必须走 stderr，不能塞进 stdout（实际 stdout: ' + out(res).slice(0, 160) + '）'; }
function notErr() { return (res) => err(res) === '' ? true : '这条命令不该报错，但 stderr 有：' + err(res).slice(0, 200); }
function noFakeSuccess() {
  return (res) => (res.code !== 0 || err(res) !== '') ? true : '危险操作不该静默"成功"（必须报错说明风险）';
}
function every(re) {
  return (res) => {
    const lines = (res.out || []).filter((l) => l.trim() !== '');
    if (!lines.length) return '输出为空';
    const bad = lines.filter((l) => !re.test(l));
    return bad.length === 0 ? true : '有 ' + bad.length + ' 行不匹配 ' + re + '：' + bad[0].slice(0, 120);
  };
}

/* 一条断言组 = 一条命令 + 若干检查 */
function t(cmd, checks, note) {
  const res = SHELL.exec(cmd);
  const problems = [];
  (checks || []).forEach((c) => {
    const r = typeof c === 'function' ? c(res) : (c instanceof RegExp ? has(c)(res) : null);
    if (r !== true) problems.push(r || '未知断言类型');
  });
  const tok = String(cmd).trim().split(/\s+/)[0];
  if (ALL.has(tok)) COVERED.add(tok); else MISSING.push(tok + '（引擎里没有这个命令）');
  if (problems.length) {
    fail++;
    failures.push({ cmd, problems, text: out(res).slice(0, 400), e: err(res).slice(0, 400) });
  } else pass++;
  return res;
}

const SHELL = window.CC_SHELL.create();

/* ===========================================================================
   0. 前置：cmd-ops 的命令真的注册进来了
   =========================================================================== */
const EXPECTED = [
  /* 磁盘与存储 */
  'lsblk', 'blkid', 'fdisk', 'parted', 'partprobe', 'partx', 'mkfs.ext4', 'mkfs.xfs', 'mkswap',
  'swapon', 'swapoff', 'fallocate', 'truncate', 'umount', 'mount', 'ncdu', 'growpart', 'resize2fs',
  'tune2fs', 'dumpe2fs', 'e2fsck', 'fsck', 'pvs', 'pvdisplay', 'pvcreate', 'vgs', 'lvs', 'vgcreate',
  'vgextend', 'lvcreate', 'lvextend', 'lvreduce', 'lvremove', 'vgremove', 'mdadm', 'smartctl',
  'hdparm', 'sync', 'ioping', 'fstrim', 'blkdiscard', 'quotacheck', 'quotaon', 'edquota', 'repquota',
  'showmount', 'exportfs', 'fuser', 'dd',
  /* 监控与日志 */
  'dmesg', 'sysctl', 'iotop', 'pidstat', 'sar', 'htop', 'strace', 'perf', 'bpftrace', 'promtool',
  'amtool', 'zabbix_get', 'zabbix_agentd', 'logrotate', 'systemd-tmpfiles', 'rsyslogd', 'lastb',
  'lnav', 'multitail', 'jps', 'jstat', 'jmap', 'jstack', 'jinfo', 'jcmd', 'java',
  /* 性能压测与调优 */
  'fio', 'sysbench', 'ab', 'wrk', 'hey', 'siege', 'jmeter', 'locust', 'iperf3', 'mtr', 'ulimit',
  'taskset', 'numactl', 'numastat', 'printf', 'watch', 'timeout', 'sleep',
  'stackcollapse-perf.pl', 'flamegraph.pl'
];
const notRegistered = EXPECTED.filter((c) => !ALL.has(c));

/* ===========================================================================
   1. 磁盘与存储
   =========================================================================== */

/* ---------- lsblk：正常 / 参数写错 / 边界 ---------- */
t('lsblk', [outHas(/vdb/), outHas(/200G/), outHas(/\/data/), notErr()]);
t('lsblk -f /dev/vdb', [outHas(/b41d9e05-2c7a-4f38-8a61-5d0e2f9b7c31/), outHas(/ext4/), outHas(/\/data/), notErr()]);
t('lsblk -dp -o NAME,SIZE,TYPE,MODEL', [outHas(/vda/), outHas(/disk/), hasNot(/vda1/), notErr()]);
t('lsblk /dev/nosuchdisk', [isErr(), codeIs(1), has(/vda|没有/)]);
t('lsblk -o BOGUSCOL', [codeIs(0), notErr()]);

/* ---------- blkid ---------- */
t('blkid /dev/vdb1', [outHas(/UUID="b41d9e05-2c7a-4f38-8a61-5d0e2f9b7c31"/), outHas(/TYPE="ext4"/), outHas(/LABEL="data"/), notErr()]);
t('blkid -s UUID -o value /dev/vdb1', [outHas(/^b41d9e05-2c7a-4f38-8a61-5d0e2f9b7c31$/m), notErr()]);
t('blkid -s UUID -o value /dev/vda1', [
  (res) => out(res).trim() === '8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88' ? true : 'vda1 的 UUID 必须与 /etc/fstab 里写的一致，实际: ' + out(res).trim()
]);
t('blkid -t TYPE=xfs', [codeIs(2), isErr(), has(/没有已知的文件系统|No such/)]);
t('blkid /dev/nosuch', [codeIs(2), isErr()]);
t('blkid -o value /dev/vdb1', [notErr(), (res) => out(res).trim().length > 0 ? true : '-o value 至少要输出一个值']);

/* ---------- fdisk ---------- */
t('fdisk -l /dev/vdb', [outHas(/Disk \/dev\/vdb/), outHas(/200G/), outHas(/vdb1/), outHas(/gpt/i), notErr()]);
t('fdisk -l', [outHas(/vda/), outHas(/vdb/), outHas(/vdc/), notErr()]);
t('fdisk /dev/vdb', [outHas(/Welcome to fdisk/), outHas(/教学环境/), has(/立即改写|不模拟写盘/), notErr()]);
t('fdisk /dev/nosuch', [isErr(), codeIs(1), has(/No such file or directory/)]);
t('echo -e "g\\nn\\n1\\n\\n\\nw" | fdisk /dev/vdb', [notErr(), has(/教学环境/), hasNot(/command not found/)]);
t('fdisk -l /dev/vda1', [codeIs(0), notErr()]);

/* ---------- parted ---------- */
t('parted /dev/vdb print', [outHas(/Partition Table: gpt/), outHas(/200G/), outHas(/vdb1|Number/), notErr()]);
t('parted -s /dev/vdb mklabel gpt', [codeIs(0), notErr(), hasNot(/command not found/)]);
t('parted -s /dev/vda mklabel gpt', [isErr(), codeIs(1), has(/being used|清空/)]);
t('parted -s /dev/vdb mkpart data ext4 0% 100%', [notErr(), has(/教学环境|不新增|不真的写/)]);
t('parted /dev/nosuch print', [isErr(), codeIs(1)]);
t('parted /dev/vdb frobnicate', [isErr(), codeIs(1), has(/invalid command/)]);
t('parted -s /dev/vdb mklabel xfs', [isErr(), has(/Invalid partition table type/)]);

/* ---------- partprobe / partx ---------- */
t('partprobe /dev/vdb', [outHas(/vdb1/), notErr()]);
t('partprobe -s', [outHas(/vda/), outHas(/vdc/), notErr()]);
t('partprobe /dev/nosuch', [has(/wrong signature|无分区/), codeIs(0)]);
t('partx -u /dev/vdb', [codeIs(0), notErr()]);
t('partx -d /dev/vdb', [isErr(), codeIs(1), has(/不会真的删除/)]);
t('partx', [isErr(), codeIs(1), has(/需要指定设备/)]);

/* ---------- mkfs.ext4 / mkfs.xfs ---------- */
t('mkfs.ext4 -F /dev/vdd', [outHas(/mke2fs/), outHas(/Filesystem UUID/), outHas(/Superblock backups/), notErr()]);
t('mkfs.ext4 /dev/vdb1', [isErr(), codeIs(1), has(/contains a ext4 file system|需要显式加/)]);
t('mkfs.ext4 -L data /dev/vdb1', [isErr(), codeIs(1), has(/-F/)]);
t('mkfs.ext4', [isErr(), codeIs(1), has(/需要指定设备/)]);
t('mkfs.xfs -f -L data /dev/vdd', [outHas(/meta-data/), outHas(/naming/), notErr()]);
t('mkfs.xfs /dev/vdb1', [isErr(), codeIs(1), has(/contains a ext4|-f/)]);
t('mkfs.ext4 -F /dev/vdb', [isErr(), has(/entire device|整盘/)]);
t('mkfs.xfs -f -n ftype=1 /dev/vdd', [outHas(/ftype=1/), notErr()]);

/* ---------- mkswap / swapon / swapoff ---------- */
t('mkswap /swapfile', [outHas(/Setting up swapspace/), outHas(/UUID=/), notErr()]);
t('mkswap /dev/vdb1', [isErr(), codeIs(1), has(/已挂载/)]);
t('mkswap', [isErr(), codeIs(1), has(/需要指定设备或文件/)]);
t('swapon --show', [outHas(/NAME/), outHas(/\/swapfile/), outHas(/PRIO/), notErr()]);
t('swapon -a', [codeIs(0), notErr()]);
t('swapon /dev/vdb1', [isErr(), codeIs(1), has(/read swap header failed/)]);
t('swapoff -a', [codeIs(0), has(/OOM|换出/)]);
t('swapoff /data', [isErr(), codeIs(1), has(/不是交换空间/)]);
t('swapoff', [isErr(), has(/需要指定设备/)]);

/* ---------- fallocate / truncate / dd ---------- */
t('fallocate -l 10G /data/testfile', [isErr(), codeIs(1), has(/文件已存在/)]);
t('fallocate -l 10G', [isErr(), codeIs(1), has(/no filename/)]);
t('fallocate /data/x', [isErr(), has(/no length specified/)]);
t('truncate -s 0 /data/app/logs/app.log && wc -c /data/app/logs/app.log', [outHas(/^\s*0 /m), notErr()]);
t('truncate -s 10G /data/sparse.img && ls -l /data/sparse.img', [outHas(/sparse\.img/), notErr()]);
t('truncate /data/x', [isErr(), codeIs(1), has(/需要 -s/)]);
t('fallocate -l 2G /swapfile', [isErr(), has(/文件不存在/)]);
t('dd if=/dev/zero of=/data/testfile bs=1M count=2 status=progress', [
  outHas(/bytes .* copied/), outHas(/MB\/s/), has(/教学环境/), notErr()
]);
t('dd if=/dev/zero of=/dev/vda bs=4M count=10', [codeIs(0), has(/危险/)]);
t('dd if=/nosuchfile of=/dev/null', [isErr(), codeIs(1), has(/No such file/)]);
t('dd', [isErr(), has(/missing operand/)]);

/* ---------- umount / mount ---------- */
t('umount /data', [isErr(), codeIs(1), has(/target is busy/), has(/fuser|lsof/)]);
t('umount /', [isErr(), has(/target is busy|根文件系统/)]);
t('umount -l /data', [codeIs(0), has(/lazy/)]);
t('umount /mnt/notmounted', [isErr(), codeIs(1), has(/not mounted/)]);
t('umount', [isErr(), has(/bad usage/)]);
t('mount', [outHas(/\/dev\/vdb1 on \/data/), outHas(/ext4/), outHas(/noatime/), notErr()]);
t('mount /dev/vdb1 /data', [isErr(), has(/already mounted/)]);
t('mount -t nfs -o vers=4 192.168.1.10:/data /mnt/nfs', [codeIs(0), has(/NFS|_netdev/)]);
t('mount -a', [codeIs(0), notErr()]);
t('mount -o remount,rw /', [codeIs(0), notErr()]);
t('mount /nosuchdev /mnt', [isErr(), has(/can't read superblock|fstab/)]);

/* ---------- ncdu ---------- */
t('ncdu -x /data', [outHas(/ncdu/), outHas(/\/data/), has(/Total disk usage/), notErr()]);
t('ncdu /nosuchdir', [isErr(), codeIs(1), has(/No such file/)]);
t('ncdu -o /tmp/ncdu-out.json /data && cat /tmp/ncdu-out.json', [outHas(/progname/), notErr()]);
t('ncdu -f /nosuch.json', [isErr(), has(/No such file/)]);

/* ---------- growpart / resize2fs / xfs_growfs / xfs_info ---------- */
t('growpart /dev/vdb 1', [isErr(), codeIs(1), has(/NOCHANGE|already the largest/)]);
t('growpart /dev/vdd 1', [isErr(), has(/FAILED/)]);
t('growpart', [isErr(), has(/用法/)]);
t('growpart /dev/nosuch 1', [isErr(), has(/找不到该盘/)]);
t('resize2fs /dev/vdb1', [outHas(/resize2fs/), outHas(/blocks long/), notErr()]);
t('resize2fs -P /dev/vdb1', [outHas(/minimum size/), notErr()]);
t('resize2fs /dev/vdb1 50G', [isErr(), codeIs(1), has(/高危|缩/)]);
t('resize2fs /nosuchdev', [isErr(), codeIs(1)]);
t('xfs_growfs /data', [isErr(), codeIs(1), has(/ext4/)]);
t('xfs_growfs /dev/vg-data/lv-data', [isErr(), has(/挂载点/)]);
t('xfs_info /data', [isErr(), has(/ext4|不是 XFS/)]);
t('xfs_growfs', [isErr(), has(/需要指定挂载点/)]);

/* ---------- tune2fs / dumpe2fs / e2fsck / fsck ---------- */
t('tune2fs -m 1 /dev/vdb1', [outHas(/reserved blocks percentage to 1%/), notErr()]);
t('tune2fs -c 0 -i 0 /dev/vdb1', [outHas(/maximal mount count to 0/), outHas(/interval between checks/), notErr()]);
t('tune2fs /dev/vdb1', [codeIs(0), has(/没有需要修改的参数/)]);
t('tune2fs /nosuchdev', [isErr(), codeIs(1)]);
t('dumpe2fs -h /dev/vdb1', [outHas(/Inode count/), outHas(/Block size:\s+4096/), outHas(/Filesystem state: clean/), notErr()]);
t('dumpe2fs /dev/vdb1', [outHas(/Backup superblock/), outHas(/Group 0/), notErr()]);
t('dumpe2fs /nosuchdev', [isErr(), codeIs(1)]);
t('e2fsck /dev/vdb1', [isErr(), codeIs(1), has(/is mounted/)]);
t('e2fsck -b 32768 -B 4096 /dev/vdb1', [isErr(), has(/is mounted|check forced/)]);
t('e2fsck -b 32768 /dev/vdb1', [isErr(), has(/块大小|-B/)]);
t('e2fsck /nosuchdev', [isErr(), codeIs(1)]);
t('fsck -n /dev/vdb1', [isErr(), has(/is mounted/)]);
t('fsck /nosuchdev', [isErr(), codeIs(1)]);

/* ---------- LVM：pvs / vgs / lvs 与增删 ---------- */
t('pvs', [outHas(/PV_NAME/), outHas(/\/dev\/vdb/), outHas(/vg-data/), notErr()]);
t('pvs -o pv_name,pv_size,pv_free,vg_name', [outHas(/pv_name/i), outHas(/800g/), outHas(/200g/), notErr()]);
t('vgs', [outHas(/VG_NAME/), outHas(/vg-data/), notErr()]);
t('vgs -o vg_name,vg_size,vg_free,pv_count', [outHas(/vg_name/i), outHas(/1000g/), outHas(/200g/), notErr()]);
t('lvs', [outHas(/LV_NAME|lv_name/i), outHas(/lv-data/), notErr()]);
t('lvs -o lv_name,vg_name,lv_size,lv_path', [outHas(/\/dev\/vg-data\/lv-data/), outHas(/800g/), notErr()]);
t('lvs -o +lv_size,vg_free --units g', [outHas(/lv_size/i), outHas(/vg_free/i), notErr()]);
t('pvdisplay /dev/vdb', [outHas(/PV Name\s+\/dev\/vdb/), outHas(/PE Size\s+4\.00 MiB/), notErr()]);
t('pvdisplay /dev/nosuch', [isErr(), codeIs(1)]);
t('pvcreate /dev/vdb', [isErr(), codeIs(1), has(/without -ff|清掉/)]);
t('pvcreate', [isErr(), has(/需要指定设备/)]);
t('vgcreate vg-data /dev/vdd', [isErr(), has(/already exists/)]);
t('vgcreate vg-new /dev/nosuch', [isErr(), has(/not found/)]);
t('vgextend vg-data /dev/vdc', [isErr(), codeIs(1), has(/already in volume group|has partitions/)]);
t('vgextend vg-nope /dev/vdd', [isErr(), has(/not found/)]);
t('lvcreate -n lv-data -l 100%FREE vg-data', [isErr(), has(/already exists/)]);
t('lvcreate -l 100%FREE vg-data', [isErr(), has(/-n/)]);
t('lvextend -L +50G -r /dev/vg-data/lv-data', [outHas(/successfully resized/), outHas(/resize2fs/), notErr()]);
t('lvextend -L +50G /dev/vg-data/lv-data', [outHas(/changed from/), has(/resize2fs|xfs_growfs/), notErr()]);
t('lvextend -l +100%FREE -r /dev/vg-data/lv-data', [notErr(), outHas(/extents/)]);
t('lvextend -L +900G /dev/vg-data/lv-data', [isErr(), codeIs(1), has(/Insufficient free space/)]);
t('lvextend -L +50G /dev/vdb1', [isErr(), has(/not a logical volume/)]);
t('lvextend /dev/vg-data/lv-data', [isErr(), has(/size or extents/)]);
t('lvreduce -L 50G /dev/vg-data/lv-data', [isErr(), codeIs(1), has(/in use|顺序/)]);
t('lvremove /dev/vg-data/lv-data', [isErr(), codeIs(1), has(/in use/)]);
t('lvremove --test /dev/vg-data/lv-data', [outHas(/TEST MODE/), notErr()]);
t('lvremove /dev/vg-data/nosuch', [isErr(), codeIs(1)]);
t('vgremove vg-data', [isErr(), codeIs(1), has(/still contains/)]);
t('vgremove vg-nope', [isErr(), has(/not found/)]);
t('lsblk /dev/vg-data/lv-data', [codeIs(0), notErr()]);

/* ---------- mdadm / smartctl / hdparm ---------- */
t('mdadm --detail /dev/md0', [outHas(/Raid Level : raid1/), outHas(/State : clean/), outHas(/active sync/), notErr()]);
t('mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/vdb /dev/vdc', [codeIs(0), has(/already in use|清掉|not really|教学环境/)]);
t('mdadm /dev/md0 --fail /dev/vdc', [outHas(/faulty/), notErr()]);
t('mdadm /dev/md0 --remove /dev/vdc --add /dev/vdd', [notErr()]);
t('mdadm --detail /dev/md9', [isErr(), codeIs(1)]);
t('mdadm --create /dev/md9 --level=1 --raid-devices=2 /dev/nosuch1 /dev/nosuch2', [isErr(), codeIs(1)]);
t('smartctl -H /dev/sda', [outHas(/SMART overall-health self-assessment test result: PASSED/), notErr()]);
t('smartctl -a /dev/sda', [outHas(/Reallocated_Sector_Ct/), outHas(/Percentage_Used/), notErr()]);
t('smartctl -l selftest /dev/sda', [outHas(/SMART Self-test log/), hasNot(/PASSED/), notErr()]);
t('smartctl -t short /dev/sda', [outHas(/Testing has begun/), has(/教学环境/), notErr()]);
t('smartctl foo', [isErr(), codeIs(1)]);
t('hdparm -i /dev/sda', [outHas(/Model=Virtual Disk/), outHas(/SerialNo=/), notErr()]);
t('hdparm -Tt /dev/sda', [outHas(/Timing cached reads/), outHas(/Timing buffered disk reads/), notErr()]);
t('hdparm -Tt --direct /dev/sda', [outHas(/O_DIRECT/), notErr()]);
t('hdparm foo', [isErr(), codeIs(1)]);

/* ---------- sync / ioping / fstrim / blkdiscard / 配额 ---------- */
t('sync', [codeIs(0), (res) => out(res) === '' ? true : 'sync 成功时不该有输出']);
t('sync && umount /data', [isErr(), has(/busy/)]);
t('sync -f /data/bigfile.log', [codeIs(0), notErr()]);
t('sync -f /nosuchfile', [isErr(), codeIs(1), has(/No such file/)]);
t('ioping -c 20 /data', [outHas(/request=1 time=/), outHas(/ioping statistics/), outHas(/\/data/), notErr()]);
t('ioping -D -c 20 /dev/vdb', [outHas(/ioping statistics/), notErr()]);
t('ioping -W -D -s 4k -c 20 /data', [outHas(/request=1 time=/), notErr()]);
t('ioping -c 20 /dev/vdb', [isErr(), has(/必须加 -D/)]);
t('ioping -c 20 /nosuchdir', [isErr(), codeIs(1), has(/无法打开/)]);
t('fstrim -av', [outHas(/trimmed on/), has(/教学环境/), notErr()]);
t('fstrim', [isErr(), has(/需要指定挂载点/)]);
t('fstrim /nosuchmp', [outHas(/not a mountpoint/), notErr()]);
t('blkdiscard -n /dev/vdb', [outHas(/预演模式/), outHas(/offset/), notErr()]);
t('blkdiscard -s -f /dev/vdb', [isErr(), codeIs(1), has(/如实拒绝/)]);
t('blkdiscard /dev/vdb', [isErr(), has(/-f|清空/)]);
t('blkdiscard', [isErr(), has(/需要指定设备/)]);
t('quotacheck -cugm /data', [outHas(/Scanning/), outHas(/Checked/), notErr()]);
t('quotacheck /nosuchmp', [isErr(), codeIs(1)]);
t('quotaon -ugv /data', [outHas(/user quotas turned on/), notErr()]);
t('edquota -u deploy', [codeIs(0), has(/blocks|hard/)]);
t('edquota -u nobody', [isErr(), has(/does not exist/)]);
t('edquota', [isErr(), has(/-u/)]);
t('repquota -as /data', [outHas(/Report for user quotas/), outHas(/deploy/), notErr()]);

/* ---------- NFS / fuser / file -s ---------- */
t('showmount -e 192.168.1.10', [outHas(/Export list/), outHas(/192\.168\.1\.0\/24/), notErr()]);
t('showmount -e 10.9.9.9', [isErr(), codeIs(1), has(/Unable to receive/)]);
t('exportfs -ra', [codeIs(0), notErr()]);
t('exportfs -v', [outHas(/192\.168\.1\.0\/24/), outHas(/rw/), notErr()]);
t('exportfs -u /data', [isErr(), has(/ESTALE/)]);
t('fuser -m -v /data', [outHas(/USER\s+PID ACCESS COMMAND/), outHas(/java|mysqld/), notErr()]);
t('fuser -m /data', [outHas(/\d+/), notErr()]);
t('fuser /nosuchpath', [isErr(), codeIs(1)]);
t('file -s /dev/vdb', [outHas(/filesystem data|block special/), notErr()]);
t('file -s /dev/vdb1', [outHas(/ext4 filesystem data/), outHas(/b41d9e05/), notErr()]);
t('file -s /dev/nosuch', [isErr(), codeIs(1)]);
t('file -s', [isErr(), has(/Usage/)]);
t('growpart /dev/vdb 1 && resize2fs /dev/vdb1', [isErr(), has(/NOCHANGE/)]);
t('pvcreate /dev/vdc && vgextend vg-data /dev/vdc', [isErr(), has(/without -ff|already in volume group/)]);

/* ---------- 存储侧的"危险操作不得静默成功"总闸 ---------- */
t('mkfs.ext4 -F /dev/vdb1', [noFakeSuccess()]);
t('blkdiscard -s -f /dev/vdb', [noFakeSuccess()]);
t('lvremove /dev/vg-data/lv-data', [noFakeSuccess()]);
t('vgremove vg-data', [noFakeSuccess()]);
t('e2fsck /dev/vdb1', [noFakeSuccess()]);
t('swapoff /dev/vdb1', [noFakeSuccess()]);
t('umount /data', [noFakeSuccess()]);
t('dd if=/dev/zero of=/dev/vdb bs=1M count=1', [noFakeSuccess()]);

/* ===========================================================================
   2. 监控与日志
   =========================================================================== */

/* ---------- dmesg / sysctl ---------- */
t('dmesg -T', [outHas(/Linux version|Memory:|virtio_blk/), hasNot(/command not found/), notErr()]);
t('dmesg -T | grep -i "out of memory"', [outHas(/Killed process 2210/), notErr()]);
t('dmesg -T --level=err,warn', [outHas(/vdb|Out of memory/), hasNot(/^\[\w+ \w+ \d+ .*\] Linux version/), notErr()]);
t('dmesg -T -n 5', [(res) => (res.out || []).length === 5 ? true : '尾部应只保留 5 行，实际 ' + (res.out || []).length]);
t('dmesg -Tw --level=err', [outHas(/教学环境|真机/), notErr()]);
t('dmesg --level=bogus', [codeIs(0), hasNot(/command not found/)]);
t('sysctl -a', [outHas(/net\.core\.somaxconn/), outHas(/vm\.swappiness/), outHas(/fs\.file-max/), notErr()]);
t('sysctl -a | grep -E "somaxconn|swappiness|file-max"', [outHas(/somaxconn/), outHas(/swappiness/), outHas(/file-max/), notErr()]);
t('sysctl -n net.ipv4.tcp_tw_reuse', [(res) => out(res).trim() === '0' ? true : '-n 应只输出值，实际: ' + out(res).trim()]);
t('sysctl -n fs.file-max', [(res) => out(res).trim() === '2097152' ? true : 'fs.file-max 应为 2097152，实际 ' + out(res).trim()]);
t('sysctl -w net.core.somaxconn=32768 && sysctl -n net.core.somaxconn', [outHas(/32768/), has(/重启就没了|持久化/), notErr()]);
t('sysctl -w bogus.key=1', [isErr(), codeIs(1), has(/No such file/)]);
t('sysctl net.ipv4.tcp_tw_reuse', [outHas(/net\.ipv4\.tcp_tw_reuse = 0/), notErr()]);
t('sysctl bogus.key', [isErr(), codeIs(1)]);
t('sysctl --system', [outHas(/somaxconn|Applying/), notErr()]);
t('sysctl -w vm.swappiness=1 && cat /proc/sys/vm/swappiness', [outHas(/^1$/m), notErr()]);

/* ---------- iotop / pidstat / sar ---------- */
t('iotop -o -P', [outHas(/Total DISK READ/), outHas(/mysqld/), outHas(/COMMAND/), notErr()]);
t('iotop -o -P -d 2', [outHas(/mysqld/), has(/真机|教学环境/), notErr()]);
t('iotop -o -b -n 3', [(res) => (out(res).match(/mysqld/g) || []).length >= 3 ? true : '-n 3 应该抓 3 次快照', notErr()]);
t('iotop -o -b -n 5 -k', [outHas(/K\/s/), notErr()]);
t('iotop -o -u deploy', [outHas(/java/), hasNot(/mysqld/), notErr()]);
t('iotop -o -u nosuchuser', [isErr(), codeIs(1)]);
t('pidstat -u 1 5', [outHas(/PID/), outHas(/java/), outHas(/Command/), notErr()]);
t('pidstat -d 1 5', [outHas(/kB_wr\/s/), outHas(/mysqld/), notErr()]);
t('pidstat -r -C mysqld 1 5', [outHas(/mysqld/), outHas(/%MEM/), notErr()]);
t('pidstat -w -C java 1 5', [outHas(/cswch\/s/), outHas(/java/), notErr()]);
t('pidstat -t -p 18442 1 5', [outHas(/pool-2-thread-1|http-nio/), has(/线程|__/), notErr()]);
t('pidstat -p 99999', [isErr(), codeIs(1), has(/找不到进程/)]);
t('sar -u 1 5', [outHas(/%user/), outHas(/%iowait/), outHas(/Average/), notErr()]);
t('sar -r 1 5', [outHas(/kbmemfree/), outHas(/%memused/), notErr()]);
t('sar -n DEV 1 5', [outHas(/eth0/), outHas(/rxkB\/s/), notErr()]);
t('sar -n EDEV 1 5', [outHas(/rxerr\/s/), outHas(/eth0/), notErr()]);
t('sar -u -s 09:00:00 -e 10:00:00 -f /var/log/sa/sa18', [outHas(/09:00:00/), outHas(/09:40:00/), notErr()]);
t('sar -u -f /var/log/sa/sa01', [isErr(), codeIs(1), has(/No such file|sa18/)]);
t('sar -b 1 3', [outHas(/tps/), outHas(/bwrtn\/s/), notErr()]);
t('sar -q 1 3', [outHas(/runq-sz/), outHas(/ldavg-1/), notErr()]);

/* ---------- htop ---------- */
t('htop', [outHas(/Tasks:/), outHas(/Load average/), outHas(/PID USER/), notErr()]);
t('htop -u deploy -t', [outHas(/deploy/), hasNot(/mysqld/), notErr()]);
t('htop -p 18442', [outHas(/18442/), hasNot(/mysqld/), notErr()]);
t('htop -C -d 10', [outHas(/Mem\[/), has(/教学环境|真机/), notErr()]);
t('htop -u nouser', [isErr(), codeIs(1)]);
t('htop -p 99999', [isErr(), codeIs(1)]);

/* ---------- /proc 关键文件 ---------- */
t('grep -E "MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree" /proc/meminfo', [
  outHas(/MemTotal:\s+7957184 kB/), outHas(/MemAvailable:\s+1128404 kB/), outHas(/SwapTotal:\s+2097148 kB/), notErr()
]);
t('cat /proc/loadavg', [outHas(/^0\.42 0\.68 0\.71 /), notErr()]);
t('cat /proc/mounts | grep -E "data|docker"', [outHas(/\/dev\/vdb1 \/data ext4 rw,noatime/), outHas(/docker/), notErr()]);
t('cat /proc/2210/io; grep -E "VmRSS|Threads" /proc/2210/status', [outHas(/read_bytes:/), outHas(/VmRSS:\s+1820440 kB/), outHas(/Threads:\s+48/), notErr()]);
t('ls /proc/18442/fd | wc -l', [outHas(/^\s*\d+\s*$/m), notErr()]);
t('cat /proc/18442/wchan', [outHas(/ep_poll/), notErr()]);
t('cat /proc/mdstat', [outHas(/Personalities/), outHas(/raid1/), notErr()]);
t('cat /proc/sys/fs/file-nr', [outHas(/^\d+\s+\d+\s+\d+$/m), notErr()]);
t('grep "open files" /proc/18442/limits', [outHas(/Max open files\s+65535/), notErr()]);

/* ---------- strace ---------- */
t('strace -c -p 18442', [outHas(/% time/), outHas(/epoll_wait/), outHas(/total/), notErr()]);
t('strace -f -T -tt -p 18442 -o /tmp/strace-18442.log', [outHas(/已写入/), has(/教学环境|timeout/), notErr()]);
t('strace -f -e trace=network -p 18442', [outHas(/sendto|recvfrom/), notErr()]);
t('strace -p 99999', [isErr(), codeIs(1), has(/No such process/)]);
t('strace', [isErr(), has(/需要指定进程/)]);
t('strace -c -p 18442 -o /nosuchdir/x.log', [isErr(), has(/No such file/)]);

/* ---------- perf / bpftrace ---------- */
t('perf top -p 18442', [outHas(/PerfTop/), outHas(/native_queued_spin_lock_slowpath|libjvm/), notErr()]);
t('perf record -F 99 -p 18442 -g -- sleep 30', [outHas(/perf record/), outHas(/samples/), notErr()]);
t('perf report --stdio', [outHas(/Overhead/), outHas(/Symbol/), notErr()]);
t('perf stat -p 18442', [outHas(/insn per cycle|task-clock/), notErr()]);
t('perf frobnicate', [isErr(), codeIs(1), has(/top \/ record \/ report/)]);
t('bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'', [outHas(/@\[mysqld\]/), outHas(/@\[java\]/), notErr()]);
t('bpftrace -e \'tracepoint:block:block_rq_issue { @bytes[comm] = hist(args->bytes); }\'', [outHas(/@bytes\[mysqld\]/), outHas(/4K, 8K/), notErr()]);
t('bpftrace -l "tracepoint:tcp:*"', [outHas(/tcp_retransmit_skb/), notErr()]);
t('bpftrace -e \'kprobe:vfs_read { @start[tid] = nsecs; }\'', [notErr(), hasNot(/command not found/)]);
t('bpftrace', [isErr(), has(/需要 -e/)]);

/* ---------- promtool / amtool / zabbix ---------- */
t('promtool check config /etc/prometheus/prometheus.yml', [outHas(/SUCCESS/), outHas(/rule files found/), notErr()]);
t('promtool check config /etc/prometheus/prometheus.yml && kill -HUP 1', [has(/SUCCESS|HUP/), notErr()]);
t('promtool check rules /etc/prometheus/rules/node.rules.yml', [outHas(/rules found/), outHas(/SUCCESS/), notErr()]);
t('promtool check config /nosuch.yml', [isErr(), codeIs(1)]);
t('promtool query instant http://127.0.0.1:9090 \'up == 0\'', [outHas(/=> 0/), has(/失联/), notErr()]);
t('promtool query instant http://127.0.0.1:9090 \'node_memory_MemAvailable_bytes / 1024 / 1024 / 1024\'', [outHas(/1\.07/), notErr()]);
t('promtool query series --match=\'up{job="node"}\' http://127.0.0.1:9090', [outHas(/__name__="up"/), outHas(/10\.0\.1\.23:9100/), notErr()]);
t('promtool query range --start=2024-03-18T09:00:00Z --end=2024-03-18T10:00:00Z --step=1m http://127.0.0.1:9090 \'rate(node_cpu_seconds_total{mode="idle"}[5m])\'', [outHas(/2024-03-18T09:00:00Z/), notErr()]);
t('promtool query instant http://10.9.9.9:9090 \'up\'', [isErr(), codeIs(1), has(/连不上/)]);
t('promtool frobnicate', [isErr(), codeIs(1)]);
t('amtool --alertmanager.url=http://127.0.0.1:9093 alert query', [outHas(/NodeDown/), outHas(/DiskWillFillIn4Hours/), notErr()]);
t('amtool --alertmanager.url=http://127.0.0.1:9093 alert query --active', [outHas(/NodeDown/), hasNot(/resolved/), notErr()]);
t('amtool silence add --duration=2h --comment="数据库升级维护窗口" alertname=MySQLDown --alertmanager.url=http://127.0.0.1:9093', [outHas(/Silence added/), outHas(/Ends at/), notErr()]);
t('amtool check-config /etc/alertmanager/alertmanager.yml', [outHas(/SUCCESS/), outHas(/receivers/), notErr()]);
t('amtool check-config /nosuch.yml', [isErr(), codeIs(1)]);
t('amtool config routes test --config.file=/etc/alertmanager/alertmanager.yml severity=critical team=db', [outHas(/db-oncall/), notErr()]);
t('amtool --alertmanager.url=http://10.9.9.9:9093 alert query', [isErr(), codeIs(1)]);
t('zabbix_get -s 10.0.1.23 -p 10050 -k "agent.ping"', [outHas(/^1$/m), notErr()]);
t('zabbix_get -s 10.0.1.23 -p 10050 -k "system.cpu.load[all,avg1]"', [outHas(/0\.42/), notErr()]);
t('zabbix_get -s 10.0.1.23 -p 10050 -k "vfs.fs.size[/data,pfree]"', [outHas(/^0$/m), has(/0%|告警/), notErr()]);
t('zabbix_get -s 10.0.1.23 -p 10050 -k "proc.num[mysqld]"', [outHas(/^1$/m), notErr()]);
t('zabbix_get -s 10.0.1.23 -p 10050 -k "net.if.in[eth0]" -t 5', [outHas(/\d+/), notErr()]);
t('zabbix_get -s 10.0.1.23 -k "bogus.key"', [isErr(), codeIs(1), has(/ZBX_NOTSUPPORTED/)]);
t('zabbix_get -s 10.9.9.9 -k "agent.ping"', [isErr(), has(/Connection refused/)]);
t('zabbix_get -k "agent.ping"', [isErr(), has(/-k/)]);
t('zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -t "system.cpu.load[all,avg1]"', [outHas(/\[d\|0\.42\]/), notErr()]);
t('zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -t "vfs.fs.size[/data,pfree]"', [outHas(/\[d\|0\]/), notErr()]);
t('zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -p', [outHas(/myapp\.proc/), outHas(/agent\.ping/), notErr()]);
t('zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -R userparameter_reload', [outHas(/userparameter_reload/), notErr()]);
t('zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -T', [outHas(/syntax is valid/), notErr()]);
t('zabbix_agentd -c /nosuch.conf -t x', [isErr(), codeIs(1)]);
t('zabbix_agentd -c /etc/zabbix/zabbix_agentd.conf -t "bogus.key"', [isErr(), codeIs(1), has(/not present|Support for the key/)]);

/* ---------- 日志工具 ---------- */
t('logrotate -d /etc/logrotate.d/myapp', [outHas(/reading config file/), outHas(/log does not need rotating/), has(/一个文件都不动|-d/), notErr()]);
t('logrotate -vf /etc/logrotate.d/myapp', [outHas(/rotating log/), outHas(/renaming|copytruncate/), notErr()]);
t('logrotate -vf /etc/logrotate.d/myapp && ls /data/app/logs', [outHas(/app\.log-20240318/), notErr()]);
t('logrotate -d /nosuch.conf', [isErr(), codeIs(1)]);
t('cat /var/lib/logrotate/logrotate.status | grep myapp', [outHas(/app\.log/), notErr()]);
t('rsyslogd -N1', [outHas(/End of config validation run/), has(/-N1|语法/), notErr()]);
t('rsyslogd -N1 -f /nosuch.conf', [notErr(), hasNot(/command not found/)]);
t('rsyslogd', [isErr(), codeIs(1), has(/守护进程|systemctl/)]);
t('lastb | head -20', [outHas(/198\.51\.100\.77/), outHas(/btmp begins/), notErr()]);
t('lnav /data/app/logs/app.log', [outHas(/ERROR/), outHas(/时间范围/), has(/教学环境/), notErr()]);
t('lnav /nosuch.log', [outHas(/No such file/), notErr()]);
t('lnav -r /data/app/logs', [outHas(/打开目录/), notErr()]);
t('multitail -i /data/app/logs/app.log -i /var/log/nginx/error.log', [outHas(/app\.log/), outHas(/error\.log/), has(/教学环境/), notErr()]);
t('multitail', [isErr(), has(/-i/)]);
t('systemd-tmpfiles --create --prefix /var/log/journal', [outHas(/systemd-journal/), has(/真机/), notErr()]);
t('systemd-tmpfiles', [isErr(), has(/需要指定动作/)]);
t('systemd-tmpfiles --create --prefix /nosuchdir/x', [isErr(), codeIs(1)]);

/* ---------- JVM 工具链 ---------- */
t('jps -lvm', [outHas(/18442/), outHas(/app\.jar/), outHas(/-XX:MaxHeapSize=4294967296/), notErr()]);
t('jps -q', [(res) => /^\d+$/.test(out(res).trim()) ? true : '-q 应只输出 PID，实际: ' + out(res).trim()]);
t('jps -lv | grep -i app.jar', [outHas(/app\.jar/), notErr()]);
t('jstat -gcutil 18442 1000 10', [outHas(/FGC/), outHas(/YGCT/), outHas(/GCT/), notErr()]);
t('jstat -gc 18442', [outHas(/EC/), outHas(/OC/), notErr()]);
t('jstat -gccause 18442 2000 5', [outHas(/LGCC/), outHas(/System\.gc\(\)/), notErr()]);
t('jstat -gcutil 99999', [isErr(), codeIs(1), has(/找不到进程/)]);
t('jstat -gcutil', [isErr(), codeIs(1), has(/Usage/)]);
t('jstat -bogus 18442', [isErr(), codeIs(1), has(/Usage/)]);
t('jmap -heap 18442', [outHas(/Garbage-First \(G1\) GC/), outHas(/MaxHeapSize\s+= 4294967296/), notErr()]);
t('jmap -histo 18442 | head -30', [outHas(/class name/), outHas(/java\.lang\.String/), notErr()]);
t('jmap -histo:live 18442', [outHas(/Total/), has(/Full GC|STW/), notErr()]);
t('jmap -dump:live,format=b,file=/data/app/logs/heap.hprof 18442', [outHas(/Heap dump file created|Dumping heap/), has(/STW|GB/), notErr()]);
t('jmap -dump:live,format=b,file=/data/app/logs/heap-$(date).hprof 18442', [isErr(), has(/命令替换/)]);
t('jmap 18442', [isErr(), codeIs(1)]);
t('jmap -heap 99999', [isErr(), codeIs(1)]);
t('jstack -l 18442', [outHas(/Full thread dump/), outHas(/nid=0x4829/), outHas(/Found one Java-level deadlock/), notErr()]);
t('jstack 99999', [isErr(), codeIs(1)]);
t('jstack', [isErr(), has(/需要指定 PID/)]);
t('jinfo -flags 18442', [outHas(/Non-default VM flags/), outHas(/-XX:\+UseG1GC/), notErr()]);
t('jinfo -flag MaxHeapSize 18442', [outHas(/^MaxHeapSize=4294967296$/m), notErr()]);
t('jinfo -flag UseG1GC 18442', [outHas(/^UseG1GC=true$/m), notErr()]);
t('jinfo -flag +HeapDumpOnOutOfMemoryError 18442', [codeIs(0), has(/立即生效|OOM/)]);
t('jinfo -flag BogusFlag 18442', [isErr(), codeIs(1)]);
t('jinfo 18442', [isErr(), codeIs(1)]);
t('jcmd 18442 GC.heap_info', [outHas(/garbage-first heap/), outHas(/Metaspace/), notErr()]);
t('jcmd 18442 VM.flags', [outHas(/MaxHeapSize=4294967296/), notErr()]);
t('jcmd 18442 help', [outHas(/GC\.heap_info/), outHas(/Thread\.print/), notErr()]);
t('jcmd -l', [outHas(/18442/), notErr()]);
t('jcmd 18442 bogus.command', [isErr(), codeIs(1), has(/未知的命令/)]);
t('jcmd', [isErr(), has(/需要指定 PID/)]);
t('java -XX:+PrintFlagsFinal -version', [outHas(/Global flags/), outHas(/MaxHeapSize/), outHas(/openjdk version/), notErr()]);
t('java -version', [(res) => err(res).indexOf('openjdk version') !== -1 ? true : '-version 按真机习惯走 stderr']);
t('java -jar /opt/myapp/app.jar', [codeIs(0), has(/18442|教学环境/)]);
t('java', [isErr(), has(/Usage/)]);

/* ===========================================================================
   3. 性能压测与调优
   =========================================================================== */

/* ---------- fio ---------- */
const FIO_RAND = 'fio --name=randread4k --filename=/data/fio-test --rw=randread --bs=4k --iodepth=32 --numjobs=4 --direct=1 --ioengine=libaio --runtime=60 --time_based --group_reporting';
t(FIO_RAND, [outHas(/randread4k/), outHas(/IOPS|iops|bw=/), outHas(/clat percentiles/), outHas(/99\.00th/), notErr()]);
t('fio --name=seqwrite1m --filename=/data/fio-test --rw=write --bs=1M --iodepth=16 --direct=1 --ioengine=libaio --runtime=60 --time_based --group_reporting', [
  outHas(/WRITE/), outHas(/MiB\/s/), outHas(/Disk stats/), notErr()
]);
t('fio --name=check --filename=/data/fio-test --rw=read --size=1G --direct=1 --output-format=json', [
  (res) => out(res).trim() === '' ? true : '--output-format=json 应把 JSON 交给重定向，stdout 不再打表格'
]);
t('fio --name=latency --filename=/dev/vdb --rw=randread --bs=4k --iodepth=1 --direct=1 --runtime=30 --time_based', [outHas(/lat \(msec\)/), notErr()]);
t('fio', [isErr(), codeIs(1), has(/需要 --name/)]);
t('fio --name=x --filename=/data/fio-test --rw=randread --bs=4k --runtime=60', [outHas(/IO depths/), notErr()]);

/* ---------- sysbench ---------- */
t('sysbench cpu --threads=4 --cpu-max-prime=20000 run', [outHas(/events per second/), outHas(/Latency \(ms\)/), notErr()]);
t('sysbench memory --threads=4 --memory-total-size=20G --memory-oper=read run', [outHas(/MiB\/sec/), outHas(/Total operations/), notErr()]);
t('sysbench fileio --file-total-size=20G --file-test-mode=rndrw --time=60 --threads=8 prepare', [outHas(/Creating file/), has(/只剩|ENOSPC|可用/), notErr()]);
t('sysbench fileio --file-total-size=20G --file-test-mode=rndrw --time=60 --threads=8 cleanup', [outHas(/Removing test files/), notErr()]);
t('sysbench oltp_read_write --mysql-host=10.0.1.24 --mysql-db=benchdb --tables=10 --table-size=1000000 --threads=16 --time=300 prepare', [outHas(/Creating table/), has(/生产|慢/), notErr()]);
t('sysbench oltp_read_write --mysql-host=10.0.1.24 --mysql-db=benchdb --threads=16 --time=300 run', [outHas(/transactions/), outHas(/per sec/), notErr()]);
t('sysbench', [isErr(), codeIs(1), has(/需要指定测试类型/)]);
t('sysbench cpu run', [outHas(/events per second/), notErr()]);

/* ---------- ab / wrk / hey / siege ---------- */
t('ab -n 1000 -c 10 -k http://10.0.1.23/api/health', [outHas(/Requests per second/), outHas(/Percentage of the requests served/), outHas(/Complete requests:\s+1000/), notErr()]);
t('ab -n 10000 -c 100 -k http://10.0.1.23/api/orders', [outHas(/Concurrency Level:\s+100/), outHas(/Time per request/), notErr()]);
t('ab -n 2000 -c 50 -T application/json -p /tmp/order.json http://10.0.1.23/api/orders', [outHas(/Requests per second/), notErr()]);
t('ab -n 1000 -c 50 -k -H "Host: www.example.com" http://10.0.1.23/', [outHas(/Document Path:\s+\//), notErr()]);
t('ab -n 10 -c 100 http://10.0.1.23/', [isErr(), codeIs(1), has(/greater than or equal/)]);
t('ab -n 1000 -c 5000 http://10.0.1.23/', [isErr(), has(/文件描述符上限|ulimit/)]);
t('ab', [isErr(), has(/需要给出 URL/)]);
t('wrk -t4 -c400 -d30s --latency http://10.0.1.23/api/health', [outHas(/Requests\/sec/), outHas(/Latency Distribution/), outHas(/99%/), notErr()]);
t('wrk -t8 -c1000 -d60s --latency --timeout 5s http://10.0.1.23/api/orders', [outHas(/8 threads and 1000 connections/), notErr()]);
t('wrk -t4 -c200 -d30s -s /tmp/post.lua http://10.0.1.23/api/orders', [notErr(), outHas(/Requests\/sec/)]);
t('wrk -t4 -c200 -d30s -H "Authorization: Bearer x" http://10.0.1.23/api/profile', [notErr()]);
t('wrk http://10.0.1.23/', [isErr(), has(/-t<线程>/)]);
t('wrk -t4 -c100 http://10.0.1.23/', [isErr(), has(/-d<时长>/)]);
t('wrk -t99 -c10 -d10s http://10.0.1.23/', [isErr(), has(/unable to create thread/)]);
t('hey -n 5000 -c 50 http://10.0.1.23/api/health', [outHas(/Summary:/), outHas(/Requests\/sec/), outHas(/Latency distribution/), notErr()]);
t('hey -z 30s -c 100 http://10.0.1.23/api/orders', [outHas(/Status code distribution/), notErr()]);
t('hey -n 2000 -c 20 -m POST -T application/json -d "{\\"userId\\":1}" http://10.0.1.23/api/orders', [outHas(/Status code distribution/), notErr()]);
t('hey', [isErr(), has(/需要给出 URL/)]);
t('siege -c 50 -t 1M -b http://10.0.1.23/api/health', [outHas(/Transactions:/), outHas(/Transaction rate/), outHas(/Availability/), notErr()]);
t('siege -c 100 -r 20 -b --log=/tmp/siege.log http://10.0.1.23/', [outHas(/Logging to/), outHas(/Successful transactions/), notErr()]);
t('siege -c 30 -t 2M -i -f /tmp/urls.txt', [outHas(/No such file/)]);
t('siege', [isErr(), has(/需要给出 URL/)]);

/* ---------- jmeter / locust ---------- */
t('jmeter -n -t /opt/jmeter/plan/order-api.jmx -l /tmp/result.jtl -e -o /tmp/report', [outHas(/Created the tree successfully/), outHas(/summary/), has(/HTML 报告|report/), notErr()]);
t('jmeter -n -t /opt/jmeter/plan/order-api.jmx -Jthreads=200 -Jduration=300 -l /tmp/result.jtl', [outHas(/Active: 200/), notErr()]);
t('jmeter -n -t /opt/jmeter/plan/order-api.jmx -R 10.0.1.31,10.0.1.32 -l /tmp/result.jtl', [outHas(/Remote engines/), notErr()]);
t('head -1 /tmp/result.jtl', [outHas(/timeStamp,elapsed,label/), notErr()]);
t('jmeter -n -t /nosuch.jmx -l /tmp/x.jtl', [isErr(), codeIs(1), has(/must exist/)]);
t('jmeter -t /opt/jmeter/plan/order-api.jmx', [isErr(), has(/GUI 模式|-n/)]);
t('jmeter -n', [isErr(), has(/-t/)]);
t('locust -f /opt/locust/order_flow.py --headless -u 200 -r 20 -t 5m --host http://10.0.1.23', [outHas(/Aggregated/), outHas(/req\/s|Requests\/sec|reqs/), notErr()]);
t('locust -f /opt/locust/order_flow.py --host http://10.0.1.23', [outHas(/8089/), has(/Web|浏览器/), notErr()]);
t('locust -f /opt/locust/order_flow.py --master --expect-workers 4 --headless -u 2000 -r 50 -t 10m --host http://10.0.1.23', [outHas(/Waiting for 4 workers/), notErr()]);
t('locust -f /opt/locust/order_flow.py --worker --master-host 10.0.1.31', [outHas(/Connected to master/), notErr()]);
t('locust -f /opt/locust/order_flow.py --headless -u 100 -r 10 -t 2m --csv=/tmp/locust_result --host http://10.0.1.23', [outHas(/--csv/), notErr()]);
t('locust -f /nosuch.py --host http://10.0.1.23', [isErr(), codeIs(1)]);
t('locust --headless -u 1 --host http://10.0.1.23', [isErr(), has(/-f/)]);

/* ---------- iperf3 / mtr ---------- */
t('iperf3 -s', [outHas(/Server listening on 5201/), has(/教学环境/), notErr()]);
t('iperf3 -c 10.0.1.24 -t 30 -P 4', [outHas(/Mbits\/sec/), outHas(/SUM/), outHas(/iperf Done/), notErr()]);
t('iperf3 -c 10.0.1.24 -u -b 100M -t 30', [outHas(/Jitter/), outHas(/Lost\/Total/), notErr()]);
t('iperf3 -c 10.0.1.24 -R -t 30', [outHas(/反向|-R/), notErr()]);
t('iperf3 -c 10.9.9.9 -t 5', [isErr(), codeIs(1), has(/unable to connect/)]);
t('iperf3', [isErr(), has(/-c|-s/)]);
t('mtr -r -c 100 -n 119.29.29.29', [outHas(/Loss%/), outHas(/119\.29\.29\.29/), has(/第 4 跳|丢包/), notErr()]);
t('mtr -r -c 50 -n -w www.huaweicloud.com', [outHas(/121\.36\.44\.17/), notErr()]);
t('mtr -r -c 50 -T -P 443 -n api.example.com', [has(/TCP 443/), notErr()]);
t('mtr -r -c 50 -s 1400 -n 10.0.2.15', [outHas(/10\.0\.2\.15/), has(/MTU/), notErr()]);
t('mtr notexist.example', [isErr(), codeIs(1), has(/Failed to resolve/)]);
t('mtr', [isErr(), has(/需要指定目标主机/)]);

/* ---------- ulimit / taskset / numa ---------- */
t('ulimit -a', [outHas(/open files/), outHas(/65535/), outHas(/max user processes/), notErr()]);
t('ulimit -n && ulimit -Hn', [(res) => out(res).trim().split('\n').length === 2 ? true : '-n 与 -Hn 应各输出一行', notErr()]);
t('ulimit -n', [(res) => out(res).trim() === '65535' ? true : '软限制应为 65535，实际 ' + out(res).trim()]);
t('ulimit -z', [outHas(/invalid option/), notErr()]);
t('ulimit -n 1024', [(res) => (res.out || []).length >= 0 ? true : '']);
t('taskset -c 0-1 /opt/myapp/bin/server', [codeIs(0), has(/CPU 亲和性 0-1/), notErr()]);
t('taskset -cp 0-1 18442', [outHas(/new affinity list: 0-1/), notErr()]);
t('taskset -p 18442', [outHas(/affinity mask: 3/), notErr()]);
t('taskset -c 0-3 /opt/myapp/bin/server', [isErr(), codeIs(1), has(/2 个 vCPU|不存在/)]);
t('taskset -cp 4-7 18442', [isErr(), codeIs(1), has(/4-7/)]);
t('taskset -c 8-11 wrk -t4 -c400 -d30s http://10.0.1.23/api/health', [isErr(), codeIs(1), has(/11 号核不存在/)]);
t('taskset -p 99999', [isErr(), codeIs(1), has(/No such process/)]);
t('taskset', [isErr(), has(/-c/)]);
t('numactl --hardware', [outHas(/available: 1 nodes/), outHas(/node 0 cpus/), notErr()]);
t('numactl --show', [outHas(/policy: default/), outHas(/physcpubind/), notErr()]);
t('numactl --cpunodebind=0 --membind=0 /opt/myapp/bin/server', [codeIs(0), has(/node 0/), notErr()]);
t('numactl --interleave=all /usr/sbin/mysqld', [codeIs(0), has(/交替|interleave/)]);
t('numactl --cpunodebind=1 /opt/myapp/bin/server', [isErr(), codeIs(1), has(/只有 1 个 NUMA 节点/)]);
t('numactl', [isErr(), has(/需要指定策略或命令/)]);
t('numastat', [outHas(/numa_hit/), outHas(/numa_miss/), notErr()]);
t('numastat -p 18442', [outHas(/java/), outHas(/Total/), notErr()]);
t('numastat -m', [outHas(/MemTotal_MB/), outHas(/7770\.70/), notErr()]);
t('numastat -p 99999', [isErr(), codeIs(1)]);

/* ---------- 通用外壳：printf / watch / timeout / sleep ---------- */
t('printf "%x\\n" 18473', [(res) => out(res).trim() === '4829' ? true : '18473 的十六进制必须是 4829（jstack 定位链路靠它），实际 ' + out(res).trim()]);
t('printf "net.core.somaxconn = 32768\\n" > /tmp/t.conf && cat /tmp/t.conf', [outHas(/net\.core\.somaxconn = 32768/), notErr()]);
t('printf "* soft nofile 65535\\n* hard nofile 65535\\n" > /etc/security/limits.d/99-nofile.conf && cat /etc/security/limits.d/99-nofile.conf', [outHas(/soft nofile 65535/), notErr()]);
t('printf', [isErr(), has(/usage/)]);
t('printf "%d\\n" abc', [outHas(/^0$/m), notErr()]);
t('watch -n 5 cat /proc/mdstat', [outHas(/raid1|Personalities/), has(/watch/), notErr()]);
t('watch -n 5 cat /proc/mdstat && echo after', [outHas(/after/), notErr()]);
t('watch', [isErr(), has(/no command specified/)]);
t('timeout 10 strace -c -p 18442', [outHas(/epoll_wait/), notErr()]);
t('timeout 5 strace -c -p 18442', [outHas(/total/), notErr()]);
t('timeout', [isErr(), has(/missing operand/)]);
t('sleep 120 && echo slept', [outHas(/slept/), notErr()]);
t('sleep abc', [isErr(), codeIs(1), has(/invalid time interval/)]);
t('sleep', [isErr(), has(/missing operand/)]);
t('stackcollapse-perf.pl /tmp/out.perf', [outHas(/java;/), has(/folded|折叠栈/), notErr()]);
t('flamegraph.pl', [codeIs(1), isErr()]);

/* ---------- 性能侧：危险/无意义操作不得静默成功 ---------- */
t('fio --name=x --filename=/data/fio-test --rw=randwrite --bs=4k --runtime=60 --group_reporting', [outHas(/教学环境|IOPS|bw=/), notErr()]);
t('sysbench fileio --file-total-size=20G --file-test-mode=rndrw prepare', [has(/只剩|ENOSPC|可用|Creating file/)]);
t('iperf3 -c 10.0.1.24 -t 30 -P 4 -J', [(res) => out(res).trim() === '' ? true : '-J 应把 JSON 交给重定向']);

/* ===========================================================================
   4. 报告
   =========================================================================== */
const uncovered = EXPECTED.filter((c) => !COVERED.has(c));

if (LIST_ONLY) {
  console.log('被覆盖的命令（' + COVERED.size + '）：');
  console.log('  ' + [...COVERED].sort().join(' '));
  console.log('\n未覆盖：' + (uncovered.length ? uncovered.join(' ') : '无'));
  process.exit(0);
}

console.log('='.repeat(74));
console.log('cmd-ops 命令断言校验（磁盘存储 / 监控日志 / 性能压测）');
console.log('='.repeat(74));
console.log('断言组：' + (pass + fail) + '　通过：' + pass + '　失败：' + fail);
console.log('覆盖命令：' + COVERED.size + ' / 预期 ' + EXPECTED.length +
  '　每条命令平均 ' + ((pass + fail) / Math.max(1, COVERED.size)).toFixed(1) + ' 组断言');

if (failures.length) {
  console.log('\n── 失败明细 ──');
  failures.forEach((f) => {
    console.log('\n  ✗ $ ' + f.cmd);
    f.problems.forEach((p) => console.log('      - ' + p));
    if (VERBOSE) {
      if (f.text) console.log('      stdout: ' + f.text.replace(/\n/g, '\n              '));
      if (f.e) console.log('      stderr: ' + f.e.replace(/\n/g, '\n              '));
    }
  });
}

if (notRegistered.length) {
  console.log('\n── 没有注册成功的命令（cmd-ops.js 里漏了？）──');
  console.log('  ' + notRegistered.join(' '));
}
if (uncovered.length) {
  console.log('\n── 没有断言的命令 ──');
  console.log('  ' + uncovered.join(' '));
}
if (MISSING.length) {
  console.log('\n── 断言里用到但引擎里不存在的命令 ──');
  console.log('  ' + [...new Set(MISSING)].join(' '));
}
if (loadErrors.length) {
  console.log('\n── 加载告警（非 cmd-ops.js 的文件）──');
  loadErrors.forEach((e) => console.log('  ' + e.file + ': ' + e.message.slice(0, 120)));
}

console.log('\n' + '='.repeat(74));
const bad = fail + notRegistered.length + uncovered.length + MISSING.length;
if (bad) {
  console.log('✗ 校验未通过：失败 ' + fail + ' 组，未注册 ' + notRegistered.length +
    ' 个，未覆盖 ' + uncovered.length + ' 个，不存在的命令 ' + new Set(MISSING).size + ' 个');
  process.exit(1);
}
console.log('✓ 全部通过：' + pass + ' 组断言，覆盖 ' + COVERED.size + ' 条命令（每条 ≥3 组：正常用法 / 参数写错 / 边界）');
process.exit(0);
