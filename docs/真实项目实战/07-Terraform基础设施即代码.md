# 07 · Terraform 管理可重建的实验资源

这是中级路线的 IaC 项目。前置：已完成[资源台账](00-云账号与成本边界.md)、[云网络](03A-云网络与安全组.md)和[Docker](02-Docker隔离部署.md)，理解资源创建、清理和费用。先按 [HashiCorp 官方 Docker 教程](https://developer.hashicorp.com/terraform/tutorials/docker-get-started)在本地练 `init`、`plan`、`apply`、`show`、`destroy`；再参考[腾讯云 Terraform Provider 文档](https://registry.terraform.io/providers/tencentcloudstack/tencentcloud/latest/docs)把一个**全新测试资源**纳入代码。不要直接导入正在运行的 CloudCmd 服务器。

## 逐步操作

1. 新建独立实验目录与 Git 仓库，记录 Terraform 和 Provider 版本；初始化后检查 `.terraform.lock.hcl`。凭证通过实验身份的环境变量或安全存储注入，禁止写进 `.tf`、`.tfvars`、日志和提交。
2. 完成官方 Docker 教程：先运行 `terraform fmt -check`、`terraform validate`、`terraform plan -out=lab.tfplan`；人工读懂新增、修改和删除数量，再 `terraform apply lab.tfplan`。访问创建出的本地容器服务，记录实际结果。
3. 修改一个安全参数，例如本地容器名称或端口。再次 `plan`，逐项解释为何是原地修改或替换；保存修改前后计划。若计划出现实验范围外资源，立即停止。
4. 在独立云测试项目里，用官方 Provider 的**最小示例**创建一个新资源，如测试安全组。先确认区域、账号、费用和资源名，再 plan → 审核 → apply。控制台核对资源 ID 与 Terraform state 一致。对该资源做一次人工漂移，然后再次 plan，解释 Terraform 想如何纠正。
5. 在不影响其他资源的前提下清理测试云资源和本地容器。`terraform destroy` 前先运行 destroy plan 并核对目标 ID，清理后查控制台与账单。state 文件按敏感资料处理，不提交公开仓库。

## 验收

### 每步命令与检查点

本地阶段在仓库根目录 **PowerShell** 中执行。示例代码为 [`terraform-docker.tf`](files/terraform-docker.tf)，只会创建一个本机 Docker 容器；先确认 18081 端口空闲，且没有同名容器。`terraform` 和 Docker Desktop 必须已安装。

1. **准备隔离工作目录：**

   ```powershell
   terraform version
   docker info --format '{{.ServerVersion}}'
   $repoRoot = (Get-Location).Path
   $lab = Join-Path $env:TEMP 'cloudcmd-terraform-docker'
   if (Test-Path $lab) { throw '实验目录已存在，先核对 state 与资源' }
   New-Item -ItemType Directory -Path $lab | Out-Null
   Copy-Item docs/真实项目实战/files/terraform-docker.tf (Join-Path $lab 'main.tf')
   Set-Location $lab
   terraform init
   terraform fmt -check
   terraform validate
   ```

   **检查：**`init`、`fmt`、`validate` 均成功，生成 `.terraform.lock.hcl`；若 provider 下载失败，先查网络/代理，不修改 state。
2. **先审计划，再创建：**

   ```powershell
   terraform plan -out=lab.tfplan
   terraform show -no-color lab.tfplan
   terraform apply lab.tfplan
   terraform state list
   docker ps --filter name=cloudcmd-tf-lab
   (Invoke-WebRequest http://127.0.0.1:18081/).StatusCode
   ```

   **检查：**plan 只新增实验镜像和容器，HTTP 200；若计划涉及任何其他资源，立刻停止。记录镜像摘要和容器 ID。
3. **验证漂移：**只在本实验容器执行 `docker rm -f cloudcmd-tf-lab`，然后 `terraform plan -out=drift.tfplan` 与 `terraform show -no-color drift.tfplan`。**检查：**计划显示容器需要重建；若状态不符，先检查当前目录及 state，不盲目 apply。确认后运行 `terraform apply drift.tfplan`，再查 HTTP 200。
4. **有审核地清理：**

   ```powershell
   terraform plan -destroy -out=destroy.tfplan
   terraform show -no-color destroy.tfplan
   terraform apply destroy.tfplan
   terraform state list
   docker ps -a --filter name=cloudcmd-tf-lab
   ```

   **检查：**销毁计划只含实验资源，最后两个列表不再出现实验容器。`keep_locally = true` 使镜像缓存可能保留，这不表示容器仍在运行。

云阶段在**独立测试账号/项目**做，示例代码为 [`terraform-tencentcloud.tf`](files/terraform-tencentcloud.tf)；官方[安全组资源文档](https://registry.terraform.io/providers/tencentcloudstack/tencentcloud/latest/docs/resources/security_group)给出字段。先在 CAM 创建只允许管理实验安全组的身份，凭证经 `TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY`、`TENCENTCLOUD_REGION` 注入终端，**不写入 tf 文件或截图**。回到仓库根目录后依次执行：

```powershell
Set-Location $repoRoot
$cloudLab = Join-Path $env:TEMP 'cloudcmd-terraform-cloud'
if (Test-Path $cloudLab) { throw '云实验目录已存在，先核对 state 和资源' }
New-Item -ItemType Directory -Path $cloudLab | Out-Null
Copy-Item docs/真实项目实战/files/terraform-tencentcloud.tf (Join-Path $cloudLab 'main.tf')
Set-Location $cloudLab
if (-not $env:TENCENTCLOUD_SECRET_ID -or -not $env:TENCENTCLOUD_SECRET_KEY -or -not $env:TENCENTCLOUD_REGION) { throw '实验身份或区域未配置' }
terraform init
terraform fmt -check
terraform validate
terraform plan -out=cloud.tfplan
terraform show -no-color cloud.tfplan
```

**检查点 A：**先核对当前云账号、区域与 plan，确认只新增 `cloudcmd-tf-lab` 安全组；否则停止。审核通过后运行 `terraform apply cloud.tfplan`、`terraform output lab_security_group_id`，在控制台按 ID 验证资源。**检查点 B：**控制台 ID 与输出一致；不一致停止。只对该测试安全组手工修改描述，再执行 `terraform plan`，应显示描述漂移。最后运行 `terraform plan -destroy -out=destroy.tfplan`、`terraform show -no-color destroy.tfplan`，确认待删 ID 仅为实验资源，才执行 `terraform apply destroy.tfplan`；回控制台确认 ID 消失。任何阶段发现账号、区域或 ID 不匹配，都不运行 apply/destroy。

交付代码、锁文件、两份脱敏 plan、实际资源 ID、一次漂移检测和销毁后资源消失的证据。能解释“代码、state、真实资源”三者不一致时如何处理，才算完成。项目以真实 `plan` 差异和清理结果为判据，不能只贴 `apply complete`。
