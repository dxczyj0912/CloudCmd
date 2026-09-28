# 05 · Kubernetes 发布与回滚

目标：在**本机一次性 kind 集群**中发布 CloudCmd，故意指向不存在的镜像，观察失败并回滚。此关只验证网页服务的发布过程，**不用于持久化同步数据**：示例 Deployment 没有持久卷，Pod 重建会丢失同步会话。以下命令在仓库根目录的 PowerShell 中执行。

## 准备

- Docker 已启动，已安装 `kind` 与 `kubectl`；建议本机至少有 8 GB 内存。
- 本机 18790 端口空闲，且没有同名 `cloudcmd-lab` kind 集群。
- 用 `kind version`、`kubectl version --client`、`docker info` 记录工具版本。安装方法见 [kind 官方快速开始](https://kind.sigs.k8s.io/docs/user/quick-start/)；Kubernetes 版本以创建出的集群为准。

## 构建、加载与发布

```powershell
docker build -t cloudcmd:lab-1 .
kind create cluster --name cloudcmd-lab
kind load docker-image cloudcmd:lab-1 --name cloudcmd-lab
kubectl apply -f docs/真实项目实战/files/k8s-cloudcmd.yaml
kubectl -n cloudcmd-lab rollout status deployment/cloudcmd --timeout=120s
kubectl -n cloudcmd-lab get deployment,pod,service -o wide
```

Deployment 应为 `1/1`，Pod 为 `Running` 且 `READY 1/1`。在一个新 PowerShell 窗口执行端口转发并保持运行：

```powershell
kubectl -n cloudcmd-lab port-forward svc/cloudcmd 18790:8787
```

在第三个窗口验证：

```powershell
Invoke-RestMethod http://127.0.0.1:18790/api/health
```

## 故意发布错误版本，再回滚

在第一个窗口把镜像改为一个本地与仓库都不存在的标签，模拟发布包缺失：

```powershell
kubectl -n cloudcmd-lab set image deployment/cloudcmd cloudcmd=cloudcmd:missing-lab
kubectl -n cloudcmd-lab rollout status deployment/cloudcmd --timeout=60s
kubectl -n cloudcmd-lab get pods
kubectl -n cloudcmd-lab describe pod -l app=cloudcmd
```

`rollout status` 预期超时，新的 Pod 可能显示 `ErrImagePull` 或 `ImagePullBackOff`；`describe` 的 Events 能解释原因。旧 Pod 可能继续服务，因此健康检查仍成功**不代表新版本发布成功**。执行回滚并重新验收：

```powershell
kubectl -n cloudcmd-lab rollout undo deployment/cloudcmd
kubectl -n cloudcmd-lab rollout status deployment/cloudcmd --timeout=120s
kubectl -n cloudcmd-lab get deployment cloudcmd -o jsonpath='{.spec.template.spec.containers[0].image}'
Invoke-RestMethod http://127.0.0.1:18790/api/health
```

镜像应回到 `cloudcmd:lab-1`，Deployment 为 `1/1`，健康检查返回 `ok: true`。

## 验收与收尾

记录集群版本、成功发布的资源状态、失败发布的 Events、回滚前后镜像标签与健康结果。先在端口转发窗口按 `Ctrl+C`，再确认正在操作的是本机 `cloudcmd-lab` 集群，最后删除这个**一次性实验集群**：

```powershell
kubectl config current-context
kind delete cluster --name cloudcmd-lab
```

若回滚后仍不健康，查看 `kubectl -n cloudcmd-lab logs deployment/cloudcmd` 与 Pod Events。真实生产发布还需要镜像仓库、镜像摘要、资源限制、持久化和变更审批；本关先建立发布失败后能定位并回退的最小闭环。Kubernetes 发布与回滚语义见 [官方 Deployment 文档](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)。
