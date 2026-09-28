# 02 · Docker 隔离部署

目标：从源码构建 CloudCmd 镜像，在隔离端口运行，并验证容器重启后数据仍在 Docker 卷中。**以下命令在仓库根目录的 PowerShell 中执行**。

## 准备

- Docker Engine 或 Docker Desktop 已启动；`docker info` 与 `docker compose version` 都能成功。
- 本机 18788 端口空闲。实验配置在 [`files/compose.lab.yml`](files/compose.lab.yml)：只监听 `127.0.0.1:18788`，使用独立的 `cloudcmd-lab` 项目和数据卷。

## 操作

先检查 Compose 最终配置，再构建并启动：

```powershell
docker compose -p cloudcmd-lab -f docs/真实项目实战/files/compose.lab.yml config
docker compose -p cloudcmd-lab -f docs/真实项目实战/files/compose.lab.yml up -d --build
docker compose -p cloudcmd-lab -f docs/真实项目实战/files/compose.lab.yml ps
```

服务状态应为 `running`。检查服务和数据卷：

```powershell
Invoke-RestMethod http://127.0.0.1:18788/api/health
docker volume inspect cloudcmd-lab_cloudcmd-data
$session = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:18788/api/sync/sessions -ContentType 'application/json' -Body '{"state":{}}'
$session.revision
```

重启容器，再查询刚创建的会话：

```powershell
docker compose -p cloudcmd-lab -f docs/真实项目实战/files/compose.lab.yml restart
Invoke-RestMethod "http://127.0.0.1:18788/api/sync/sessions/$($session.code)"
docker compose -p cloudcmd-lab -f docs/真实项目实战/files/compose.lab.yml logs --tail=30
```

重启期间接口可能暂时不可用；等 `ps` 显示 `running` 后再查。会话仍可查询，表示数据保存在卷里。

## 验收与收尾

记录镜像构建结果、服务状态、健康检查、卷名、重启前后的会话版本。用下面的命令停止并移除**本实验容器**，卷会保留给第 4 关恢复演练：

```powershell
docker compose -p cloudcmd-lab -f docs/真实项目实战/files/compose.lab.yml down
docker volume inspect cloudcmd-lab_cloudcmd-data
```

`down` 后卷仍应存在。不要在完成备份前使用 `down --volumes`。如果本机已有其他容器占用 18788，修改实验 Compose 文件的**左侧宿主端口**，并同步修改本页 URL。Docker Compose 的官方说明见 <https://docs.docker.com/compose/>。
