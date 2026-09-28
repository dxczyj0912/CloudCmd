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

### 逐步命令与检查点（PowerShell）

下面只操作新建的 `argocd-lab` kind 集群。准备 `kind`、`kubectl`、`argocd` CLI 和足够运行 Online Boutique 的本机资源；`argocd version --client` 不成功时，按[官方 CLI 安装](https://argo-cd.readthedocs.io/en/stable/cli_installation/)先安装。

1. **确认集群，再安装控制器：**

   ```powershell
   kind create cluster --name argocd-lab
   kubectl config current-context
   kubectl create namespace argocd
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   kubectl -n argocd wait --for=condition=available deployment --all --timeout=600s
   kubectl -n argocd get pods
   ```

   **检查：**context 必须为 `kind-argocd-lab`，控制器 Pod Ready；若失败先查 `kubectl -n argocd get events --sort-by=.lastTimestamp`。安装 URL 的 `stable` 会移动，实验报告记录当次 Argo CD 镜像版本。
2. **登录本地 Argo CD：**另开窗口保持 `kubectl -n argocd port-forward svc/argocd-server 18082:443`。在主窗口运行 `argocd admin initial-password -n argocd`，**只在自己屏幕上读取**，随后运行 `argocd login localhost:18082 --username admin --insecure` 并在提示时输入密码，再执行 `argocd app list`。**检查：**能列出 Application；密码不放进命令历史、截图或仓库。
3. **先跑 Guestbook，再发布多服务应用：**把 Guestbook 与 [Online Boutique 清单](https://github.com/GoogleCloudPlatform/microservices-demo/blob/main/release/kubernetes-manifests.yaml)分别放入自己的实验 Git 仓库 `guestbook/`、`online-boutique/` 目录并 push，记录两个上游提交。把 `$repo` 改成**自己的公开实验仓库地址**；私有仓库需先按官方文档配置 Argo CD 的只读仓库凭据。

   ```powershell
   $repo = 'https://github.com/<你的账号>/<实验仓库>.git'
   argocd app create guestbook-lab --repo $repo --path guestbook --revision HEAD --dest-server https://kubernetes.default.svc --dest-namespace guestbook-lab --sync-option CreateNamespace=true
   argocd app sync guestbook-lab
   argocd app wait guestbook-lab --health --timeout 300
   argocd app create boutique-gitops --repo $repo --path online-boutique --revision HEAD --dest-server https://kubernetes.default.svc --dest-namespace boutique-gitops --sync-option CreateNamespace=true
   argocd app sync boutique-gitops
   argocd app wait boutique-gitops --health --timeout 600
   kubectl -n boutique-gitops get deployment,pod,service
   ```

   **检查：**两个应用 `Synced/Healthy`、Online Boutique 全部服务就绪，购物流程可用。若 M3 的 Skaffold 仍在管理同一 namespace，先停掉它，不让两个控制器互相改资源。
4. **Git 变更、漂移与回退：**在自己的仓库修改 frontend 的一个安全副本数或镜像标签，提交后执行 `argocd app diff boutique-gitops`、`argocd app sync boutique-gitops`、`kubectl -n boutique-gitops get deployment frontend -o wide`。**检查：**Git 提交、差异、Deployment 版本和用户页面按顺序对应。随后手工 `kubectl -n boutique-gitops scale deployment/frontend --replicas=2`，执行 `argocd app get boutique-gitops` 观察漂移；若自动修复已开启，记录收敛时间而非强行等待 OutOfSync。最后提交一次**仅在实验仓库**的错误镜像，观察失败 Events，用 `git revert <造成问题的提交ID>` 回退、push、`argocd app sync boutique-gitops`、`argocd app wait boutique-gitops --health --timeout 600`，验证购物流程恢复。
5. **清理：**先记录 `argocd app list` 和 `kubectl config current-context`；确认只有自己的两个实验 Application 后，依次执行 `argocd app delete guestbook-lab`、`argocd app delete boutique-gitops`，确认实验 namespace 无业务残留，再 `kind delete cluster --name argocd-lab`。**通过条件：**Guestbook 只算预热；最终证据必须来自 Online Boutique 的 Git 提交、同步、漂移、失败和恢复。

交付 Git 提交链、Online Boutique 同步/漂移/失败/恢复证据、购物与结账流程验证和运行手册。清理 Application、namespace 和**明确命名的实验集群**。能说清“Git 是期望状态、集群是实际状态、控制器负责收敛”，才算完成。只完成 Guestbook 不算通过 M4。
