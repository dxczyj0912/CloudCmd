# X1 · Ceph 三节点存储与故障恢复

这是存储方向选修项目，目标是亲手部署一个可观察 OSD、PG 与副本变化的实验集群。前置：[云盘与快照](03C-云盘与快照.md)、[备份恢复](04-备份恢复与故障演练.md)。以 [Ceph Squid 的 cephadm 部署指南](https://docs.ceph.com/en/squid/cephadm/install/)、[主机管理](https://docs.ceph.com/en/squid/cephadm/host-management/)、[OSD 管理](https://docs.ceph.com/en/squid/cephadm/services/osd/) 和 [RBD 命令指南](https://docs.ceph.com/en/squid/rbd/rados-rbd-cmds/) 为操作依据。文档版本要与实际安装版本核对。

## 环境与边界

- 本手册以三台**专用 Rocky Linux 9 实验节点**为例，同一私网互通、时间同步、主机名可解析。每台另配一块可销毁的**空白实验盘**，数据盘与系统盘分开。Ceph、容器运行时、内存和磁盘要求以选定版本的官方文档为准；建议在本地虚拟化平台或独立按量付费测试资源上练，先估算费用。不要用现有 4 GB CloudCmd 服务器、已有业务盘或唯一备份盘。
- 记录三台节点的主机名、IP、系统版本、Ceph 版本及实验盘的稳定设备路径。执行任何 OSD 创建前，再用 `lsblk -f` 和 `ceph orch device ls` 对照；**OSD 初始化会清除目标盘原有数据**。
- 单节点 bootstrap 只验证安装；本项目的故障验收必须有三台节点和跨节点 OSD。真实生产还涉及故障域、容量规划、安全、升级和备份，不由这个小集群代替。

## 逐步操作

1. 按官方指南在第一台实验节点安装 cephadm 并执行 `cephadm bootstrap --mon-ip <第一台私网IP>`。保存生成的集群标识、版本和 `ceph -s` 输出；管理员 keyring 只留在实验机，不提交仓库。
2. 按官方主机管理指南配置 cephadm 到另外两台节点的 SSH 信任并加入主机。执行 `ceph orch host ls`、`ceph orch ps`，确认 MON/MGR 与三个主机的关系。不要把“主机已加入”误判为“已经有三份数据副本”。
3. 在每台节点核对空白实验盘后，按 OSD 管理指南对**明确选中的盘**逐个添加 OSD。记录每一步前后的 `ceph orch device ls`、`ceph osd tree`、`ceph -s`。如果设备显示不可用，先读拒绝原因；不要运行全盘自动接管命令来绕过检查。
4. 新建只用于实验的 RBD pool，初始化并创建 1 GiB 镜像。按官方 RBD 指南完成镜像列表、详情、快照创建与查看；记录 `ceph df` 和 `ceph pg stat`，解释逻辑容量与副本占用的区别。pool 名、镜像名和容量都写入实验记录，避免误操作其他资源。
5. 先保存健康基线。在**自己的三节点实验集群**停掉一台节点，持续观察 `ceph health detail`、`ceph osd tree`、`ceph pg stat` 和 RBD 读取结果；记录出现降级、恢复节点、回到 `active+clean` 的时间。若数据不可用，先核对副本数与 `min_size`，不要随意降低保护参数或宣称“数据一定安全”。
6. 恢复节点后重复健康和 RBD 验证。按资源清单删除实验快照、镜像与 pool，最后释放**明确命名**的实验节点和空白数据盘；保留脱敏证据及费用记录。

## 验收

### 逐条命令与检查点（第一台节点 Bash，除非注明）

只有在三台**独立实验节点**及其数据盘 ID 均已登记后，才运行以下命令。`node1` 等名称、IP 和 `/dev/vdb` 仅是示例，每一步要替换为实测值；任何设备指向系统盘即停止。

1. **确认主机与实验盘：**三台各自执行 `hostname -f`、`ip -4 addr`、`lsblk -f`、`timedatectl status`。**检查：**主机名/IP 唯一、时间同步；目标空盘没有文件系统、挂载点，容量与虚拟化平台登记一致。保存设备与节点对应表。
2. **第一台 bootstrap：**三台节点先分别安装并启用官方所需的容器运行时、LVM、时间同步和 SSH。第一台按 [Ceph Squid 安装文档](https://docs.ceph.com/en/squid/cephadm/install/)下载对应 EL9 的 cephadm（下例下载地址已核对存在），安装仓库后启动：

   ```bash
   sudo dnf install -y podman lvm2 chrony curl openssh-server
   sudo systemctl enable --now chronyd sshd
   curl --fail --silent --show-error --location \
     https://download.ceph.com/rpm-19.2.3/el9/noarch/cephadm -o cephadm
   chmod +x cephadm
   sudo ./cephadm add-repo --release squid
   sudo ./cephadm install
   cephadm version
   MON_IP='替换为node1真实私网IP'
   sudo cephadm bootstrap --mon-ip "$MON_IP"
   sudo cephadm shell -- ceph -s
   ```

   **检查：**有 MON、MGR，能读到集群 FSID；`cephadm version` 与最终集群版本需记录。初始化只有一台主机时**不能宣称具备三节点容错**。node2、node3 也要用官方方式安装依赖并启用 SSH/时间同步，但不要在它们上面 bootstrap 第二个集群。
3. **加入主机并形成 MON quorum：**先按[主机管理文档](https://docs.ceph.com/en/squid/cephadm/host-management/)把 cephadm 的公钥安装到 node2、node3，再执行：

   ```bash
   NODE2_IP='替换为node2真实私网IP'
   NODE3_IP='替换为node3真实私网IP'
   sudo cephadm shell -- ceph orch host add node2 "$NODE2_IP"
   sudo cephadm shell -- ceph orch host add node3 "$NODE3_IP"
   sudo cephadm shell -- ceph orch host ls
   sudo cephadm shell -- ceph orch apply mon 3
   sudo cephadm shell -- ceph quorum_status --format json-pretty
   ```

   **检查：**三个主机均出现，MON quorum 达到预期；若 SSH、时间或网络不通，先修基础环境，不继续建 OSD。
4. **逐盘部署 OSD：**在对应主机重新执行 `lsblk -f`，确认空盘后，第一台执行 `sudo cephadm shell -- ceph orch device ls --wide`，再**一台一条**执行 `sudo cephadm shell -- ceph orch daemon add osd node1:/dev/vdb`（随后替换为 node2、node3 及真实设备）。每加一块就运行 `sudo cephadm shell -- ceph osd tree`、`sudo cephadm shell -- ceph -s`。**检查：**三个 OSD 分属三台主机、状态 `up/in`，PG 最终达到 `active+clean`；任何设备拒绝原因未解决时不要改用全盘自动接管。
5. **建立实验 RBD 并验证快照：**

   ```bash
   sudo cephadm shell -- ceph osd pool create lab-rbd 32
   sudo cephadm shell -- rbd pool init lab-rbd
   sudo cephadm shell -- rbd create --size 1024 lab-rbd/proof
   sudo cephadm shell -- rbd info lab-rbd/proof
   sudo cephadm shell -- rbd snap create lab-rbd/proof@s1
   sudo cephadm shell -- rbd snap ls lab-rbd/proof
   sudo cephadm shell -- ceph df
   sudo cephadm shell -- ceph pg stat
   ```

   **检查：**镜像 1 GiB、快照 `s1` 可见、PG 健康；保存逻辑容量和物理使用量。容量因副本和其他元数据不会简单相等。
6. **故障与恢复：**在虚拟化平台只关掉 node2 这台**实验节点**；第一台每隔约 30 秒运行 `sudo cephadm shell -- ceph -s`、`sudo cephadm shell -- ceph health detail`、`sudo cephadm shell -- ceph osd tree`，记录降级/不可用情况。启动 node2 后持续检查，直至 PG `active+clean`，再查 `rbd info lab-rbd/proof` 和快照。**检查：**给出故障前、故障期间、恢复后的 OSD/PG 状态与时间线；若数据不可读，先查副本数和 `min_size`，不得盲目降低保护参数。
7. **清理：**先核对只有实验镜像与快照，执行 `sudo cephadm shell -- rbd snap rm lab-rbd/proof@s1`、`sudo cephadm shell -- rbd rm lab-rbd/proof`。pool 与三台 VM 的释放按资源清单逐项确认，不在共享集群运行清空命令。**检查：**实验镜像不再列出、节点与云盘计费项已清理。

交付三节点拓扑、OSD 与 PG 的健康基线、RBD 镜像和快照结果、单节点故障到恢复的时间线，以及资源清理清单。能够解释 MON、MGR、OSD、PG、CRUSH 的职责和“HEALTH_OK 不等于有异地备份”，才算完成。没有真实三节点故障与恢复证据，只能标为安装演示。此项目目前**仅核对官方文档和操作路径，尚未在本工作区的真实三节点环境验收**。
