# X2 · OpenStack DevStack 私有云

这是私有云方向选修项目，目标是在独立实验机上完成身份认证、镜像、网络与云主机的完整路径，再用证据定位一次失败创建。前置：[云网络](03A-云网络与安全组.md)与 [Kubernetes 发布](05-Kubernetes发布与回滚.md)。依据 [DevStack 官方单机指南](https://docs.openstack.org/devstack/latest/guides/single-machine.html)、[DevStack 首页](https://docs.openstack.org/devstack/latest/)及 [OpenStackClient 的 server 命令文档](https://docs.openstack.org/python-openstackclient/latest/cli/command-objects/server.html)。DevStack 是开发测试工具，不是生产 OpenStack 部署方案。

## 环境与边界

- 使用一台**新建的、可销毁的** Linux 实验机或虚拟机。建议预留约 16 GB 内存、足够的 CPU/磁盘与可用虚拟化能力作为本实验的资源预算；这不是官方统一最低配置，实际以选定 OpenStack 版本、启用服务及宿主环境为准。现有 4 GB CloudCmd 服务器不适合承担这个实验。
- 实验网络地址不能与宿主、公司或云 VPC 冲突。先确认管理入口、可回退的快照或控制台访问，以及实验机清理方式；DevStack 会修改系统网络与服务配置，不要在承载其他业务的主机运行。
- 记录仓库提交、系统版本、虚拟化支持、实验网段和服务清单。密码放在实验机受限配置中，提交或截图时脱敏。

## 逐步操作

1. 按官方单机指南准备全新系统和网络，创建独立的 `stack` 用户，克隆 `https://opendev.org/openstack/devstack`。先读该版本 `samples/local.conf` 与指南，写入不冲突的测试网段、管理地址和实验密码，再运行 `./stack.sh`。保存成功摘要、版本和服务状态；若失败，先分析 `stack.sh` 日志，不要直接重复在污染状态上重装。
2. 在实验机加载管理员环境：`source openrc admin admin`。运行 `openstack token issue` 与 `openstack service list`，说明 Keystone token 有效但某项服务异常时应如何继续查。不要把 token、密码或 `openrc` 内容提交仓库。
3. 依次查看 `openstack image list`、`openstack flavor list`、`openstack network list`、`openstack security group list`。选定一个**当前环境真实存在**的镜像、规格和网络，记录各自 ID；不要照抄某篇旧教程里的 CirrOS ID 或网络名。
4. 用 `openstack server create --flavor <规格ID> --image <镜像ID> --network <网络ID> lab-vm` 创建实验实例。执行 `openstack server show lab-vm`、`openstack console log show lab-vm`，再从 Horizon 或允许的网络路径确认启动结果。若实例进入 `ERROR`，结合实例 fault、Nova 日志、镜像、配额、网络与虚拟化能力逐层定位。
5. 制造一次**可控的失败创建**：例如指定不存在的镜像 ID，记录 CLI 错误、服务端日志和相同参数改正后的成功结果。再在实验网络中核对安全组规则对访问的影响。区分“认证失败”“实例调度失败”“实例已运行但网络不可达”三种现象。
6. 用 `openstack server delete lab-vm` 删除实验实例，核对实例、浮动 IP、卷等没有残留。最后按原资源清单销毁**明确命名的实验机/快照**，不把 DevStack 的清理脚本用于共享主机。

## 验收

### 逐条命令与检查点（专用实验机 Bash）

只在**新建可销毁**的 Linux 实验机操作。DevStack 会改主机网络与服务；先通过控制台或快照确保即使 SSH 断开仍可回退。

1. **预检系统与资源：**

   ```bash
   lsb_release -a
   free -h
   df -h .
   nproc
   ip -4 route
   grep -E 'vmx|svm' /proc/cpuinfo | head -1 || true
   ```

   **检查：**系统符合当前 DevStack 指南，内存/磁盘符合本实验预算，实验网段不与已有路由冲突；虚拟化标志缺失时先确认宿主是否允许嵌套虚拟化，不盲目安装。
2. **按官方步骤安装：**以普通 sudo 用户安装 Git 和 `openssl` 后执行以下命令。`HOST_IP` 必须是这台实验机供其他节点访问的地址；两个网段要先与 `ip -4 route` 对照，确认不与宿主/VPC 冲突。

   ```bash
   git clone https://opendev.org/openstack/devstack
   cd devstack
   git rev-parse HEAD
   read -rp '实验机管理IP: ' HOST_IP
   read -rp '实验浮动地址CIDR: ' FLOATING_RANGE
   read -rp '实验租户地址CIDR: ' FIXED_RANGE
   ADMIN_PASSWORD="$(openssl rand -hex 16)"
   umask 077
   printf '%s\n' '[[local|localrc]]' "HOST_IP=$HOST_IP" \
     "FLOATING_RANGE=$FLOATING_RANGE" "FIXED_RANGE=$FIXED_RANGE" \
     "ADMIN_PASSWORD=$ADMIN_PASSWORD" "DATABASE_PASSWORD=$ADMIN_PASSWORD" \
     "RABBIT_PASSWORD=$ADMIN_PASSWORD" "SERVICE_PASSWORD=$ADMIN_PASSWORD" > local.conf
   chmod 600 local.conf
   ./stack.sh
   ```

   **检查：**脚本正常结束并显示 Horizon、认证端点等摘要；记录提交、配置的**非敏感部分**和日志路径。`local.conf` 含实验密码，只留在该实验机。失败先读 `stack.sh` 的首个错误，不在业务主机重试。
3. **逐服务验证：**

   ```bash
   source openrc admin admin
   openstack token issue
   openstack service list
   openstack image list
   openstack flavor list
   openstack network list
   openstack security group list
   ```

   **检查：**token 有效；至少存在可用镜像、规格和网络。逐条记录将用于实验实例的真实 ID；不把 token 或 `openrc` 内容存入报告。
4. **创建并验证一台实例：**以下三个变量要填第 3 步选定的**真实 ID**，不是示例名称。

   ```bash
   IMAGE_ID='<真实镜像ID>'
   FLAVOR_ID='<真实规格ID>'
   NETWORK_ID='<真实网络ID>'
   openstack server create --flavor "$FLAVOR_ID" --image "$IMAGE_ID" --network "$NETWORK_ID" lab-vm
   openstack server show lab-vm
   openstack console log show lab-vm
   openstack server list
   ```

   **检查：**状态最终为 `ACTIVE`、控制台日志显示正常启动；进入 `ERROR` 时查 `openstack server show` 的 fault、Nova 服务、镜像、配额和虚拟化能力。再按实验网络/安全组允许的路径做一次实际访问，不能仅以 ACTIVE 算成功。
5. **制造一次可解释的错误：**运行 `openstack server create --flavor "$FLAVOR_ID" --image 00000000-0000-0000-0000-000000000000 --network "$NETWORK_ID" lab-invalid`。**检查：**预期返回“镜像不存在”或相应失败；记录 CLI 信息并用 `openstack server list` 确认没有留下待清理的异常实例。若创建出残留实例，只按其真实 ID 删除。将镜像 ID 改回真实值后重试 `lab-vm` 的正常路径，区别认证、镜像与网络错误。
6. **若 Cinder 已启用，再验证块存储：**先用 `openstack service list` 确认存在 `volumev3`，然后运行 `openstack volume create --size 1 lab-volume`、`openstack volume show lab-volume`、`openstack server add volume lab-vm lab-volume`、`openstack server show lab-vm`。**检查：**卷最终处于已挂载状态且实例详情含该卷；若 Cinder 没启用，记录“未启用”，不要为了凑验收临时改 DevStack 服务集。完成后先 `openstack server remove volume lab-vm lab-volume`，确认卷为 `available`，再 `openstack volume delete lab-volume`。这一步是扩展，不影响 X2 主线通过。
7. **清理：**运行 `openstack server delete lab-vm`、`openstack server list`、`openstack floating ip list`、`openstack volume list`，核对无实验残留后销毁**明确命名**的 DevStack 虚拟机或测试主机。**检查：**台账中的实例、卷、浮动 IP 及宿主计费项都已处理。

交付一张 Keystone → Glance/Neutron/Nova → 实例的请求链图、认证与资源列表输出、实例创建和访问结果、一次失败定位与修复证据、资源释放记录。能够说清 Cinder 块存储和 Swift 对象存储与 Nova 实例的关系，才算完成。该项目目前**仅核对官方文档和操作路径，尚未在本工作区的独立 OpenStack 实验机上实测**。
