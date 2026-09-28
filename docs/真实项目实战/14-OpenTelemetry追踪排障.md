# M5 · OpenTelemetry Demo 指标与链路排障

以下命令在**独立 Linux 实验机的 Bash**执行，不在当前 CloudCmd 服务器上运行。依据 [OpenTelemetry Demo 官方 Docker 指南](https://opentelemetry.io/docs/demo/docker_deployment/)与[项目源码](https://github.com/open-telemetry/opentelemetry-demo)。官方完整模式建议约 6 GB 可用内存、14 GB 磁盘；本项目需要 Jaeger/Grafana，因此不要使用没有可观测后端的最小模式。每步完成检查后再继续。

1. **预检资源、端口与 Docker。**

   ```bash
   docker info --format '{{.ServerVersion}}'
   docker compose version
   free -h
   df -h .
   ss -lntp | grep ':8080 ' || true
   ```

   **检查：**Docker 正常、资源足够、8080 未被其他业务占用。若 Docker 不是当前用户可用，先按官方 Docker 文档配置，不用 `chmod 666 /var/run/docker.sock` 绕过权限。

2. **固定源码并启动完整可观测栈。**

   ```bash
   git clone https://github.com/open-telemetry/opentelemetry-demo.git
   cd opentelemetry-demo
   git rev-parse HEAD
   docker compose --env-file .env --env-file .env.override \
     -f compose.yaml -f compose.full.yaml -f compose.observability.yaml -f compose.extras.yaml \
     config --quiet
   docker compose --env-file .env --env-file .env.override \
     -f compose.yaml -f compose.full.yaml -f compose.observability.yaml -f compose.extras.yaml \
     up --force-recreate --remove-orphans --detach
   ```

   **检查：**配置解析通过，记录提交与镜像版本。启动可能需要数分钟；出错先查当前项目的 Compose 日志，不删除其他项目容器。

3. **确认用户入口与观测后台。**

   ```bash
   curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
   curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/grafana/
   curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/jaeger/ui/
   docker compose --env-file .env --env-file .env.override \
     -f compose.yaml -f compose.full.yaml -f compose.observability.yaml -f compose.extras.yaml ps
   ```

   **检查：**三个入口均能访问；浏览器走一次“浏览商品 → 购物车 → 结账”，记下时间。Jaeger 中按前端服务和该时间窗口找到一条请求 trace，记录 trace ID、跨服务 span 与耗时；Grafana 中找到对应指标。仅看见页面不能算完成。

4. **制造一次可恢复的依赖故障。**先保存正常请求结果与 trace。停止 `product-catalog`，重做浏览商品动作，记录失败现象；查看前端与商品服务日志，并在 Jaeger 中找到异常或延迟 span。

   ```bash
   docker compose --env-file .env --env-file .env.override \
     -f compose.yaml -f compose.full.yaml -f compose.observability.yaml -f compose.extras.yaml \
     stop product-catalog
   docker compose --env-file .env --env-file .env.override \
     -f compose.yaml -f compose.full.yaml -f compose.observability.yaml -f compose.extras.yaml \
     ps product-catalog frontend
   docker compose --env-file .env --env-file .env.override \
     -f compose.yaml -f compose.full.yaml -f compose.observability.yaml -f compose.extras.yaml \
     logs --since=5m --tail=100 frontend product-catalog
   ```

   **检查：**证明失败请求的用户现象、异常 span、对应日志和停止的容器状态指向同一依赖；不要只凭某张看板截图断言根因。

5. **恢复并用同一口径复测。**

   ```bash
   docker compose --env-file .env --env-file .env.override \
     -f compose.yaml -f compose.full.yaml -f compose.observability.yaml -f compose.extras.yaml \
     start product-catalog
   curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
   ```

   **检查：**重做同一用户流程，比较同一时间窗口的成功率、P95 延迟、trace/span 和日志。写一页事故报告，含开始/恢复时间、假设、证据、根因、动作和残余风险。

6. **清理。**核对当前目录仍是刚克隆的实验仓库，再按上面的四个 `-f` 参数执行 `docker compose ... down`。保留脱敏报告和源码提交；不要运行 `docker system prune`。本工作区只核对官方文档和 Compose 服务名，**未实际拉取完整镜像运行**。
