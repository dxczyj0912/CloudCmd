# 08 · Argo CD GitOps 发布与配置漂移

这是中级路线的发布项目。前置：完成[Kubernetes 基本发布](05-Kubernetes发布与回滚.md)与[Online Boutique 多服务实战](06-中级实战路线.md)。只在新的本地实验集群做，不连接现有业务集群。按 [Argo CD 官方入门](https://argo-cd.readthedocs.io/en/stable/getting_started/)安装；[Argo CD Example Apps](https://github.com/argoproj/argocd-example-apps)中的 Guestbook 仅用于快速熟悉控制器，最终交付对象是 M3 已运行过的 Online Boutique。

## 逐步操作

1. 创建独立且资源充足的实验集群，执行 `kubectl config current-context` 核对目标，再按官方入门文档安装 Argo CD。记录集群和 Argo CD 版本，确认全部控制组件 Ready。管理员初始密码只在本机读取，不截图、不提交。
2. Fork 示例仓库或复制 Guestbook 清单到自己的实验仓库。创建 Argo CD Application，源指向**自己的 Git 仓库和明确路径**，目标指向专用 namespace。首次同步后检查 Application、Deployment、Service、Pod 和页面功能。这一步只验证基本控制链。
3. 将 M3 使用的 [Online Boutique Kubernetes 清单](https://github.com/GoogleCloudPlatform/microservices-demo/blob/main/release/kubernetes-manifests.yaml)复制到自己的实验仓库，记录上游仓库提交及镜像版本。为它创建第二个 Application，指向独立 namespace；避免让 Skaffold 和 Argo CD 同时管理同一套资源。核对购物与结账流程后，把这套多服务应用作为本项目的正式验收对象。
4. 在 Git 中修改一个可见且安全的 Online Boutique 配置，提交并同步。记录“Git 提交 → Argo CD 差异 → 集群新状态 → 用户可见结果”四个时间点。解释自动同步、手动同步和健康状态各代表什么。
5. 在集群里手工修改同一资源，观察 Argo CD 显示 `OutOfSync`。先保存差异证据，再从 Git 恢复预期状态；不要把手工集群改动误当作长期配置源。
6. 提交一次错误配置，让发布失败，记录 Argo CD 事件与 Pod/Deployment 证据；用 `git revert` 回退造成问题的提交，重新同步并验证完整用户流程。不要只在 Argo CD 页面点回历史版本而让 Git 仍保留错误期望状态。

## 验收与收尾

交付 Git 提交链、Online Boutique 同步/漂移/失败/恢复证据、购物与结账流程验证和运行手册。清理 Application、namespace 和**明确命名的实验集群**。能说清“Git 是期望状态、集群是实际状态、控制器负责收敛”，才算完成。只完成 Guestbook 不算通过 M4。
