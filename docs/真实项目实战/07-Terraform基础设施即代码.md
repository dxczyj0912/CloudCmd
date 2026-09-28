# 07 · Terraform 管理可重建的实验资源

这是中级路线的 IaC 项目。前置：已完成[资源台账](00-云账号与成本边界.md)、[云网络](03A-云网络与安全组.md)和[Docker](02-Docker隔离部署.md)，理解资源创建、清理和费用。先按 [HashiCorp 官方 Docker 教程](https://developer.hashicorp.com/terraform/tutorials/docker-get-started)在本地练 `init`、`plan`、`apply`、`show`、`destroy`；再参考[腾讯云 Terraform Provider 文档](https://registry.terraform.io/providers/tencentcloudstack/tencentcloud/latest/docs)把一个**全新测试资源**纳入代码。不要直接导入正在运行的 CloudCmd 服务器。

## 逐步操作

1. 新建独立实验目录与 Git 仓库，记录 Terraform 和 Provider 版本；初始化后检查 `.terraform.lock.hcl`。凭证通过实验身份的环境变量或安全存储注入，禁止写进 `.tf`、`.tfvars`、日志和提交。
2. 完成官方 Docker 教程：先运行 `terraform fmt -check`、`terraform validate`、`terraform plan -out=lab.tfplan`；人工读懂新增、修改和删除数量，再 `terraform apply lab.tfplan`。访问创建出的本地容器服务，记录实际结果。
3. 修改一个安全参数，例如本地容器名称或端口。再次 `plan`，逐项解释为何是原地修改或替换；保存修改前后计划。若计划出现实验范围外资源，立即停止。
4. 在独立云测试项目里，用官方 Provider 的**最小示例**创建一个新资源，如测试安全组。先确认区域、账号、费用和资源名，再 plan → 审核 → apply。控制台核对资源 ID 与 Terraform state 一致。对该资源做一次人工漂移，然后再次 plan，解释 Terraform 想如何纠正。
5. 在不影响其他资源的前提下清理测试云资源和本地容器。`terraform destroy` 前先运行 destroy plan 并核对目标 ID，清理后查控制台与账单。state 文件按敏感资料处理，不提交公开仓库。

## 验收

交付代码、锁文件、两份脱敏 plan、实际资源 ID、一次漂移检测和销毁后资源消失的证据。能解释“代码、state、真实资源”三者不一致时如何处理，才算完成。项目以真实 `plan` 差异和清理结果为判据，不能只贴 `apply complete`。
