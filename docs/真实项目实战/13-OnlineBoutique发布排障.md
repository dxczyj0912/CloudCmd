# M3 · Online Boutique 多服务发布与排障

在资源充足的**本机隔离 kind 集群**做本项目，不连接生产或现有 CloudCmd 集群。以下命令在 PowerShell 执行。依据 [Online Boutique 源码](https://github.com/GoogleCloudPlatform/microservices-demo)、[官方 Kubernetes 清单](https://github.com/GoogleCloudPlatform/microservices-demo/blob/main/release/kubernetes-manifests.yaml)与[开发指南](https://github.com/GoogleCloudPlatform/microservices-demo/blob/main/docs/development-guide.md)。这是完整多服务应用，初次拉镜像可能较慢。每个检查点通过后才继续。

1. **确认目标和资源。**先确认 Docker 运行、kind/kubectl 可用、至少具备官方指南要求的本地 CPU/内存/磁盘空间；不要把 4 GB 云服务器当实验机。

   ```powershell
   docker info --format '{{.ServerVersion}}'
   kind version
   kubectl version --client
   kind get clusters
   ```

   **检查：**三种工具正常；`boutique-lab` 不应已存在。若已存在，先确认它是否为自己的未完成实验，不自动覆盖。

2. **固定上游版本并建集群。**

   ```powershell
   git clone https://github.com/GoogleCloudPlatform/microservices-demo.git "$env:TEMP\boutique-lab-src"
   $src = Join-Path $env:TEMP 'boutique-lab-src'
   git -C $src rev-parse HEAD
   kind create cluster --name boutique-lab
   kubectl config current-context
   kubectl get nodes -o wide
   ```

   **检查：**context 为 `kind-boutique-lab`，节点 `Ready`，记录上游提交。若目标源码目录已存在，先核对仓库与未提交改动，不重新 clone 覆盖。

3. **发布并检查全部服务。**用上游仓库当前提交中的清单，避免网页链接指向未来版本。

   ```powershell
   kubectl create namespace boutique-lab
   kubectl -n boutique-lab apply -f "$src\release\kubernetes-manifests.yaml"
   kubectl -n boutique-lab get deployment,service,pod
   kubectl -n boutique-lab wait --for=condition=available deployment --all --timeout=600s
   kubectl -n boutique-lab get pods --field-selector=status.phase!=Running
   ```

   **检查：**全部 Deployment available，最后一条不应列出异常 Pod；若超时，先查 `kubectl -n boutique-lab get events --sort-by=.lastTimestamp` 和异常 Pod 的 `describe`、`logs`，不要直接打勾。

4. **走一次用户流程。**另开 PowerShell 窗口执行 `kubectl -n boutique-lab port-forward svc/frontend 18080:80` 并保持运行；在第三个窗口执行：

   ```powershell
   (Invoke-WebRequest http://127.0.0.1:18080/).StatusCode
   kubectl -n boutique-lab get svc frontend,productcatalogservice,cartservice,checkoutservice
   kubectl -n boutique-lab get endpointslices -l kubernetes.io/service-name=frontend
   ```

   **检查：**HTTP 200；浏览器能浏览商品、加入购物车并完成演示结账。画出 frontend → 商品/购物车/结账依赖图，记录页面时间和相关 Pod 名称。

5. **故意发布错误镜像并回滚。**先保存真实镜像，确认 Deployment 的容器名为 `server` 后再改。只在 `boutique-lab` namespace 操作。

   ```powershell
   $baseline = kubectl -n boutique-lab get deployment frontend -o jsonpath='{.spec.template.spec.containers[0].image}'
   kubectl -n boutique-lab get deployment frontend -o jsonpath='{.spec.template.spec.containers[0].name}'
   kubectl -n boutique-lab set image deployment/frontend server=example.invalid/boutique/frontend:missing
   kubectl -n boutique-lab rollout status deployment/frontend --timeout=90s
   kubectl -n boutique-lab get pods -l app=frontend
   kubectl -n boutique-lab describe deployment frontend
   kubectl -n boutique-lab get events --sort-by=.lastTimestamp
   ```

   **检查：**`rollout status` 预期失败，新 Pod 出现拉取镜像错误；旧 Pod 可能继续提供页面。保存 Events 后执行回滚：

   ```powershell
   kubectl -n boutique-lab rollout undo deployment/frontend
   kubectl -n boutique-lab rollout status deployment/frontend --timeout=300s
   $after = kubectl -n boutique-lab get deployment frontend -o jsonpath='{.spec.template.spec.containers[0].image}'
   if ($after -ne $baseline) { throw '回滚镜像与基线不同' }
   (Invoke-WebRequest http://127.0.0.1:18080/).StatusCode
   ```

   **检查：**镜像恢复为基线，完整购物流程再次可用。只看到 HTTP 200、但镜像仍错误，不算回滚成功。

6. **定位一次依赖故障。**在实验 namespace 将 `productcatalogservice` 缩到零副本，记录前端用户现象与故障层，再恢复原副本数。

   ```powershell
   $replicas = [int](kubectl -n boutique-lab get deployment productcatalogservice -o jsonpath='{.spec.replicas}')
   kubectl -n boutique-lab scale deployment/productcatalogservice --replicas=0
   kubectl -n boutique-lab get pods,service,endpointslices | Select-String 'productcatalog|frontend'
   kubectl -n boutique-lab logs deployment/frontend --tail=80
   kubectl -n boutique-lab scale deployment/productcatalogservice --replicas=$replicas
   kubectl -n boutique-lab rollout status deployment/productcatalogservice --timeout=300s
   ```

   **检查：**故障时 Endpoints 缺后端，恢复后重新出现并完成购物流程。不要把前端日志中的单条错误直接当根因；要同时核对 Service、Endpoints 和 Pod 状态。

7. **清理并留证。**停端口转发，执行 `kubectl config current-context` 确认仍是 `kind-boutique-lab`，再运行 `kind delete cluster --name boutique-lab`。交付基线、失败发布、回滚、依赖故障、恢复后的用户流程与清理记录。此文档的清单路径和容器名已按上游源码核对；**本工作区未运行完整集群**。
