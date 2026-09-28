# X1 · Ceph 三节点存储与故障恢复

这是存储方向选修项目，目标是亲手部署一个可观察 OSD、PG 与副本变化的实验集群。前置：[云盘与快照](03C-云盘与快照.md)、[备份恢复](04-备份恢复与故障演练.md)。以 [Ceph Squid 的 cephadm 部署指南](https://docs.ceph.com/en/squid/cephadm/install/)、[主机管理](https://docs.ceph.com/en/squid/cephadm/host-management/)、[OSD 管理](https://docs.ceph.com/en/squid/cephadm/services/osd/) 和 [RBD 命令指南](https://docs.ceph.com/en/squid/rbd/rados-rbd-cmds/) 为操作依据。文档版本要与实际安装版本核对。

## 环境与边界

- 准备三台**专用** Linux 实验节点，同一私网互通、时间同步、主机名可解析。每台另配一块可销毁的**空白实验盘**，数据盘与系统盘分开。Ceph、容器运行时、内存和磁盘要求以选定版本的官方文档为准；建议在本地虚拟化平台或独立按量付费测试资源上练，先估算费用。不要用现有 4 GB CloudCmd 服务器、已有业务盘或唯一备份盘。
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

交付三节点拓扑、OSD 与 PG 的健康基线、RBD 镜像和快照结果、单节点故障到恢复的时间线，以及资源清理清单。能够解释 MON、MGR、OSD、PG、CRUSH 的职责和“HEALTH_OK 不等于有异地备份”，才算完成。没有真实三节点故障与恢复证据，只能标为安装演示。此项目目前**仅核对官方文档和操作路径，尚未在本工作区的真实三节点环境验收**。
