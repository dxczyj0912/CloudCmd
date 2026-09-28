# M1 · Gitea + PostgreSQL 双服务恢复

本项目在**本机 PowerShell、独立 Docker 项目**中执行。准备 Docker Desktop、约 4 GB 可用内存、未占用的本机 13000 端口。配置文件 [`files/gitea.compose.yml`](files/gitea.compose.yml) 固定 Gitea 1.25.5 / PostgreSQL 16.10；动手前仍须核对 [Gitea Docker 安装](https://docs.gitea.com/installation/install-with-docker)与[备份恢复](https://docs.gitea.com/administration/backup-and-restore)文档的当前版本。下列命令均从 CloudCmd 仓库根目录执行，**每一检查点不通过就停下排查，不继续下一步**。

1. **准备独立密码并检查配置。**密码文件位于仓库的 `.gitignore` 覆盖范围内。若该路径已有文件，先检查并改用另一个实验目录，不覆盖。

   ```powershell
   $envFile = 'docs/真实项目实战/files/.env'
   if (Test-Path $envFile) { throw '实验密码文件已存在，先检查内容' }
   $password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
   Set-Content -Path $envFile -Value "GITEA_DB_PASSWORD=$password" -Encoding utf8
   $compose = 'docs/真实项目实战/files/gitea.compose.yml'
   docker compose --env-file $envFile -p gitea-lab -f $compose config --quiet
   ```

   **检查：**最后一条退出码为 0；`git status --short` 不应列出 `.env`。不要打印密码或把 Compose 完整渲染结果贴进公开报告。

2. **启动两个服务并记录镜像。**

   ```powershell
   docker compose --env-file $envFile -p gitea-lab -f $compose up -d
   docker compose --env-file $envFile -p gitea-lab -f $compose ps
   docker image inspect gitea/gitea:1.25.5 --format '{{index .RepoDigests 0}}'
   docker image inspect postgres:16.10 --format '{{index .RepoDigests 0}}'
   (Invoke-WebRequest http://127.0.0.1:13000/).StatusCode
   ```

   **检查：**数据库显示 `healthy`，Gitea 显示 `running`，HTTP 为 200。初次启动可能需要数十秒；若未达到，先看 `docker compose ... logs --tail=80 db gitea`，不要重建数据卷。记录两条镜像摘要。

3. **完成首次安装和 Git 写入。**浏览器打开 `http://127.0.0.1:13000/`，按安装页核对 PostgreSQL 连接并创建**仅用于实验**的管理员及仓库 `lab-proof`。然后在 PowerShell 用实验账号的 Git 凭据（不要写进命令行 URL）执行：

   ```powershell
   $labUser = '<替换为刚创建的实验用户名>'
   $sourceDir = Join-Path $env:TEMP 'gitea-lab-proof'
   if (Test-Path $sourceDir) { throw '测试仓库目录已存在，先检查' }
   git clone "http://127.0.0.1:13000/$labUser/lab-proof.git" $sourceDir
   Set-Content "$env:TEMP\gitea-lab-proof\proof.txt" 'gitea-lab-v1'
   git -C "$env:TEMP\gitea-lab-proof" add proof.txt
   git -C "$env:TEMP\gitea-lab-proof" -c user.name=Lab -c user.email=lab@example.invalid commit -m 'add recovery proof'
   git -C "$env:TEMP\gitea-lab-proof" push
   git -C "$env:TEMP\gitea-lab-proof" rev-parse HEAD
   ```

   **检查：**push 成功，网页能看到 `proof.txt` 和同一个提交哈希。若目标目录已有内容，改用新的临时目录，不删已有文件。

4. **分别定位应用与数据库故障。**先停 Gitea、访问首页、看日志，再恢复；随后用同样方法停数据库。

   ```powershell
   docker compose --env-file $envFile -p gitea-lab -f $compose stop gitea
   docker compose --env-file $envFile -p gitea-lab -f $compose ps
   docker compose --env-file $envFile -p gitea-lab -f $compose start gitea
   docker compose --env-file $envFile -p gitea-lab -f $compose stop db
   docker compose --env-file $envFile -p gitea-lab -f $compose logs --tail=80 gitea db
   docker compose --env-file $envFile -p gitea-lab -f $compose start db
   docker compose --env-file $envFile -p gitea-lab -f $compose ps
   ```

   **检查：**两种故障在容器状态与日志中的表现不同；数据库恢复 `healthy` 后重新访问仓库并核对提交哈希。若 Gitea 未自动重连，可只重启 Gitea 容器，不删除卷。

5. **做冷备份并在空卷恢复。**先记录原仓库哈希并停止原项目。用只读挂载分别打包 Gitea 数据卷与 PostgreSQL 数据卷；恢复到新项目的**新卷**，不能覆盖原卷。

   ```powershell
   $proofHash = git -C "$env:TEMP\gitea-lab-proof" rev-parse HEAD
   $backupDir = Join-Path $env:TEMP 'gitea-lab-backup'
   New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
   docker compose --env-file $envFile -p gitea-lab -f $compose down
   docker run --rm --mount "type=volume,source=gitea-lab_gitea-data,target=/src,readonly" --mount "type=bind,source=$backupDir,target=/backup" alpine:3.20 tar -czf /backup/gitea.tgz -C /src .
   docker run --rm --mount "type=volume,source=gitea-lab_pg-data,target=/src,readonly" --mount "type=bind,source=$backupDir,target=/backup" alpine:3.20 tar -czf /backup/postgres.tgz -C /src .
   Get-FileHash "$backupDir\gitea.tgz","$backupDir\postgres.tgz" -Algorithm SHA256
   docker volume create gitea-restore_gitea-data
   docker volume create gitea-restore_pg-data
   docker run --rm --mount "type=volume,source=gitea-restore_gitea-data,target=/dst" --mount "type=bind,source=$backupDir,target=/backup,readonly" alpine:3.20 tar -xzf /backup/gitea.tgz -C /dst
   docker run --rm --mount "type=volume,source=gitea-restore_pg-data,target=/dst" --mount "type=bind,source=$backupDir,target=/backup,readonly" alpine:3.20 tar -xzf /backup/postgres.tgz -C /dst
   docker compose --env-file $envFile -p gitea-restore -f $compose up -d
   docker compose --env-file $envFile -p gitea-restore -f $compose ps
   ```

   **检查：**两个压缩包非空，恢复项目的两个服务正常。在浏览器检查测试仓库，并逐条运行：

   ```powershell
   $restoreDir = Join-Path $env:TEMP 'gitea-restored-proof'
   if (Test-Path $restoreDir) { throw '恢复验证目录已存在，先检查' }
   git clone "http://127.0.0.1:13000/$labUser/lab-proof.git" $restoreDir
   $restoredHash = git -C $restoreDir rev-parse HEAD
   if ($restoredHash -ne $proofHash) { throw '恢复后的提交哈希不一致' }
   ```

   数据库原始目录备份只适用于同一 PostgreSQL 主版本、兼容平台和停机状态；跨版本迁移应按官方文档使用逻辑备份。

6. **收尾。**在资源清单核对项目和卷名后停恢复项目。保留备份直到确认通过，再决定是否手工删除实验卷与临时文件。

   ```powershell
   docker compose --env-file $envFile -p gitea-restore -f $compose down
   docker volume ls --filter label=com.docker.compose.project=gitea-lab
   docker volume ls --filter label=com.docker.compose.project=gitea-restore
   ```

   **通过条件：**从两份备份在新卷恢复同一仓库和提交哈希；能凭日志区分应用、数据库故障。备份文件和 `.env` 含密码或用户资料，不提交 Git。本手册已核对命令与官方资料，**尚未在本工作区的 Docker 引擎实测**。
