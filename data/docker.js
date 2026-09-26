/* data/docker.js · 分类 07 Docker 容器 */
(function () {
  'use strict';

  var catId = 'docker';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. 镜像 ================= */

    /* ---------- 1 / 56 ---------- */
    {
      id: 'dk-pull',
      name: 'docker pull',
      alias: ['docker image pull', '拉取镜像'],
      level: 1,
      syntax: 'docker pull [选项] <镜像名>[:标签]',
      summary: '从仓库把镜像拉到本地，部署任何服务的第一步。',
      desc: '不写标签默认拉 `latest`，生产环境必须写死版本号或 digest（`镜像@sha256:...`）。华为云场景从 SWR（容器镜像服务）拉私有镜像时，镜像名要带仓库域名：`swr.cn-north-4.myhuaweicloud.com/<组织名>/<镜像名>:<标签>`；拉之前先 `docker login` 对应仓库地址。',
      params: [
        { flag: '--platform linux/amd64', desc: '指定镜像架构；在鲲鹏（ARM）机器上拉 x86 镜像时必须写' },
        { flag: '-a, --all-tags', desc: '拉取该仓库所有标签，慎用（可能几十上百 GB）' },
        { flag: '-q, --quiet', desc: '只输出镜像 ID，脚本里用' },
        { flag: '--disable-content-trust', desc: '跳过镜像签名校验（默认已关闭签名校验，一般不用）' }
      ],
      examples: [
        { cmd: 'docker pull nginx:1.25', desc: '拉取固定版本的 Nginx，生产不要用 latest' },
        { cmd: 'docker login swr.cn-north-4.myhuaweicloud.com && docker pull swr.cn-north-4.myhuaweicloud.com/myorg/web:1.0.0', desc: '登录华为云 SWR 并拉取私有镜像' },
        { cmd: 'docker pull --platform linux/amd64 mysql:8.0', desc: '在 ARM 机器上强制拉 x86_64 版本（走 QEMU 模拟）' }
      ],
      notes: [
        '私有仓库拉取前必须先 `docker login swr.cn-north-4.myhuaweicloud.com`（地址按 region 替换，如 cn-east-3）；登录凭证存在 `~/.docker/config.json`，只是 base64 编码不是加密，别提交到 Git',
        '`latest` 是浮动标签，今天和明天的内容可能完全不同，生产环境用明确版本号或 digest 才能保证可回滚',
        '拉取慢或超时先 `docker info` 看 `Registry Mirrors` 是否为空，为空说明没配镜像加速，见 `dk-daemon-json`',
        '报 `manifest unknown` 多为标签写错，报 `unauthorized` 多为没登录或组织名不对'
      ],
      related: ['dk-images', 'dk-push', 'dk-info', 'dk-daemon-json'],
      docs: 'https://docs.docker.com/reference/cli/docker/image/pull/',
      tags: ['镜像', '仓库', 'SWR']
    },

    /* ---------- 2 / 56 ---------- */
    {
      id: 'dk-images',
      name: 'docker images',
      alias: ['docker image ls', 'docker images -a', '列出镜像'],
      level: 1,
      syntax: 'docker images [选项] [仓库名[:标签]]',
      summary: '列出本地镜像和体积，清理磁盘前先看这里。',
      desc: '默认只显示顶层镜像，`-a` 会连中间层一起列出来（输出很长）。`SIZE` 是各层压缩后的累加值，多个镜像共享的底层会被重复计算，所以列表相加通常大于实际磁盘占用——真实占用看 `docker system df`。',
      params: [
        { flag: '-a, --all', desc: '显示中间层镜像（含大量 <none>，排障时才用）' },
        { flag: '-q, --quiet', desc: '只输出镜像 ID，配合 `docker rmi` 批量删除' },
        { flag: '--format', desc: 'Go 模板自定义列，如 "{{.Repository}}:{{.Tag}} {{.Size}}"' },
        { flag: '-f, --filter', desc: '过滤：`dangling=true`（悬空）、`reference=nginx`、`label=env=prod`' },
        { flag: '--no-trunc', desc: '显示完整镜像 ID 与摘要' }
      ],
      examples: [
        { cmd: 'docker images', desc: '列出本地全部顶层镜像' },
        { cmd: 'docker images -f dangling=true', desc: '只看 <none> 悬空镜像，这些是可以安全清理的构建残留' },
        { cmd: 'docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}"', desc: '自定义输出仓库、标签与大小' },
        { cmd: 'docker images -q -f reference=web', desc: '只取 web 相关镜像的 ID，喂给删除命令' }
      ],
      notes: [
        '看到 `<none>:<none>` 别慌，那是被覆盖标签或构建过程丢弃的层，用 `docker image prune` 清理即可',
        '同一个 IMAGE ID 出现多行说明一个镜像挂了多个标签，删其中一个标签不会释放空间，删到最后一个引用才会真正删层',
        '镜像大小不等于拉取流量：共享层只下载一次，同机多次 `docker pull` 不同版本会比想象中省流量'
      ],
      related: ['dk-pull', 'dk-rmi', 'dk-history', 'dk-df', 'dk-prune-image'],
      docs: 'https://docs.docker.com/reference/cli/docker/image/ls/',
      tags: ['镜像', '列表', '清理']
    },

    /* ---------- 3 / 56 ---------- */
    {
      id: 'dk-build',
      name: 'docker build',
      alias: ['docker image build', 'docker buildx build', '构建镜像'],
      level: 2,
      syntax: 'docker build [选项] <构建上下文路径>',
      summary: '按 Dockerfile 构建镜像，把代码和运行环境打成可分发镜像。',
      desc: '构建上下文就是命令末尾那个路径（通常是 `.`），整个目录会被打包给 daemon，所以必须写 `.dockerignore` 排除 `.git`、`node_modules`、`target`、日志。多阶段构建（`FROM xxx AS builder` + `--target`）是减小镜像体积的主要手段：构建工具留在 builder 阶段，最终镜像只拷产物。新版 Docker 里 `docker build` 已经是 `docker buildx build` 的别名，多架构构建见 `dk-buildx`。',
      params: [
        { flag: '-t, --tag 名称:标签', desc: '给镜像打名字；推 SWR 要直接写成完整的仓库地址' },
        { flag: '-f, --file Dockerfile路径', desc: '指定 Dockerfile，默认是上下文根目录下的 `Dockerfile`' },
        { flag: '--build-arg KEY=值', desc: '传入 Dockerfile 中 `ARG` 声明的变量，只在构建期可见' },
        { flag: '--no-cache', desc: '不使用构建缓存，强制每层重跑，排"改了代码镜像没变"时用' },
        { flag: '--target 阶段名', desc: '只构建多阶段中的某个阶段，如 builder，用于调试或分阶段产出' },
        { flag: '--platform linux/amd64', desc: '指定目标架构，配合 buildx 做多架构镜像' },
        { flag: '--pull', desc: '每次都尝试重新拉取基础镜像，避免用到本地过期层' },
        { flag: '--label key=value', desc: '给镜像加元数据标签，便于 `docker images -f label=` 筛选' }
      ],
      examples: [
        { cmd: 'docker build -t web:1.0.0 .', desc: '用当前目录的 Dockerfile 构建并打标签' },
        { cmd: 'docker build -t web:1.0.0 -f docker/Dockerfile.prod --build-arg PROFILE=prod --no-cache .', desc: '指定生产 Dockerfile、传构建参数并禁用缓存' },
        { cmd: 'docker build -t swr.cn-north-4.myhuaweicloud.com/myorg/web:1.0.0 .', desc: '直接按 SWR 地址命名，构建完可立刻 push' },
        { cmd: 'docker build --target builder -t web:debug .', desc: '只构建到 builder 阶段，进这个镜像里查编译期问题' }
      ],
      notes: [
        '上下文里的文件会全部传给 daemon：`node_modules`、`target`、`.git` 不写进 `.dockerignore`，构建会慢十倍甚至卡死',
        '每条 `RUN`/`COPY` 产生一层，层越多镜像越大；把 `apt-get update && apt-get install -y xxx && rm -rf /var/lib/apt/lists/*` 写成一条 `RUN`，否则缓存和索引文件会留在镜像里',
        '`--no-cache` 不是万能：只要被 `COPY` 的文件内容没变，Docker 仍会复用层；确认缓存命中情况用 `docker build --progress=plain .`',
        '用 `--build-arg` 传密码会写进镜像历史（`docker history --no-trunc` 能看到），密钥要用 BuildKit 的 `--mount=type=secret`',
        '在无外网的内网机器上构建要先配好内网 yum/apt 源与基础镜像，否则 `RUN yum install` 必然失败'
      ],
      related: ['dk-dockerfile', 'dk-buildx', 'dk-tag', 'dk-push', 'dk-history', 'dk-commit'],
      docs: 'https://docs.docker.com/reference/cli/docker/buildx/build/',
      tags: ['构建', 'Dockerfile', '多阶段', '镜像']
    },

    /* ---------- 4 / 56 ---------- */
    {
      id: 'dk-buildx',
      name: 'docker buildx',
      alias: ['docker buildx build', 'docker buildx create', '多架构构建'],
      level: 3,
      syntax: 'docker buildx build [选项] <构建上下文>',
      summary: 'BuildKit 构建前端，一条命令产出 amd64/arm64 多架构镜像。',
      desc: '多架构镜像靠 `--platform linux/amd64,linux/arm64` + `--push` 直接推仓库，生成 manifest list；x86 与鲲鹏/ARM 节点会自动拉到对应版本，CCE 混合架构节点池正好用得上。新增的 builder 是独立容器，`docker buildx ls` 能看到它支持的平台。',
      params: [
        { flag: '--platform linux/amd64,linux/arm64', desc: '目标平台列表，逗号分隔' },
        { flag: '--push', desc: '构建完直接推送仓库（多架构必须用它或 --output，不能 --load）' },
        { flag: '--builder 名称', desc: '指定使用哪个 builder 实例' },
        { flag: '--cache-from type=registry,ref=...', desc: '从仓库拉取构建缓存，CI 里加速用' },
        { flag: '--cache-to type=registry,ref=...,mode=max', desc: '把构建缓存推回仓库' },
        { flag: '--provenance=false', desc: '关闭来源证明信息的生成，某些私有仓库不接受额外 manifest 时用' }
      ],
      examples: [
        { cmd: 'docker buildx create --name multiarch --driver docker-container --use', desc: '创建并启用一个支持多架构的 builder' },
        { cmd: 'docker buildx build --platform linux/amd64,linux/arm64 -t swr.cn-north-4.myhuaweicloud.com/myorg/web:1.0.0 --push .', desc: '一次构建双架构并直接推送到 SWR' },
        { cmd: 'docker buildx ls', desc: '查看当前 builder 与它支持的平台' },
        { cmd: 'docker buildx rm multiarch', desc: '不用了删掉 builder，释放它占用的容器与磁盘' }
      ],
      notes: [
        '多架构构建结果必须 `--push` 或 `--output type=oci,dest=web.tar`，不能 `--load` 进本地镜像库（本地库一次只存一个架构）',
        'ARM 镜像走 QEMU 模拟，速度比原生慢几倍；量大时用华为云 ARM 规格 ECS 做原生 builder',
        'builder 容器（`docker-container` 驱动）会一直存在并占磁盘，长期不用记得 `docker buildx rm`',
        '推送后可以在 SWR 控制台看到同一标签下多个架构的 manifest，用 `docker buildx imagetools inspect <镜像>` 核对'
      ],
      related: ['dk-build', 'dk-push', 'dk-tag', 'dk-dockerfile'],
      docs: 'https://docs.docker.com/reference/cli/docker/buildx/',
      tags: ['多架构', 'BuildKit', 'ARM']
    },

    /* ---------- 5 / 56 ---------- */
    {
      id: 'dk-tag',
      name: 'docker tag',
      alias: ['docker image tag', '打标签'],
      level: 1,
      syntax: 'docker tag <源镜像> <目标镜像名:标签>',
      summary: '给镜像再加一个名字，推送仓库前必做的一步。',
      desc: '不复制任何数据，只是给同一个 IMAGE ID 增加一个引用。推送到 SWR 必须先把镜像名改成 `swr.<region>.myhuaweicloud.com/<组织名>/<镜像名>:<标签>` 的完整格式，因为 `docker push` 是"按名字推"，名字里不带仓库域名就只能推到 Docker Hub。',
      examples: [
        { cmd: 'docker tag web:1.0.0 swr.cn-north-4.myhuaweicloud.com/myorg/web:1.0.0', desc: '按 SWR 地址打标签，之后才能 push' },
        { cmd: 'docker tag nginx:1.25 swr.cn-east-3.myhuaweicloud.com/myorg/nginx:1.25', desc: '把第三方基础镜像同步到自己的 SWR 组织，加速 CCE 拉取' },
        { cmd: 'docker tag web:1.0.0 web:latest', desc: '同一个镜像再挂 latest 标签（生产不建议依赖 latest）' }
      ],
      notes: [
        '打标签不占额外磁盘空间；删掉某个标签只是去掉一个引用，删到最后一个引用镜像才真正消失',
        '镜像名必须与 `docker login` 的仓库地址前缀完全一致，否则 `docker push` 报 `denied: requested access to the resource is denied`',
        '同一个镜像打了多个标签，`docker rmi` 要逐个删；`docker images` 里看到多行相同 IMAGE ID 属于正常现象'
      ],
      related: ['dk-push', 'dk-build', 'dk-images', 'dk-rmi'],
      docs: 'https://docs.docker.com/reference/cli/docker/image/tag/',
      tags: ['标签', '镜像', 'SWR']
    },

    /* ---------- 6 / 56 ---------- */
    {
      id: 'dk-push',
      name: 'docker push',
      alias: ['docker image push', '推送镜像'],
      level: 2,
      syntax: 'docker push <仓库域名>/<组织名>/<镜像名>:<标签>',
      summary: '把本地镜像推送到 SWR 等镜像仓库，供 CCE 节点拉取部署。',
      desc: '华为云的镜像仓库是 SWR（容器镜像服务）。标准三步：`docker login swr.<region>.myhuaweicloud.com` → `docker tag` 改成完整地址 → `docker push`。推送按层上传，仓库里已有的层会自动跳过，所以第一次慢、后续增量很快；推完在 SWR 控制台"我的镜像"里能看到。',
      params: [
        { flag: '-a, --all-tags', desc: '把这个仓库下所有标签一起推送' },
        { flag: '-q, --quiet', desc: '只输出镜像摘要，适合 CI 脚本' },
        { flag: '--platform linux/amd64', desc: '多架构 manifest 存在时，只推送指定架构' }
      ],
      examples: [
        { cmd: 'docker login swr.cn-north-4.myhuaweicloud.com', desc: '先登录 SWR（用户名密码从控制台"客户端上传"的登录指令里取）' },
        { cmd: 'docker tag web:1.0.0 swr.cn-north-4.myhuaweicloud.com/myorg/web:1.0.0', desc: '改成 SWR 完整地址' },
        { cmd: 'docker push swr.cn-north-4.myhuaweicloud.com/myorg/web:1.0.0', desc: '推送到 myorg 组织下（组织需先在 SWR 控制台创建）' }
      ],
      notes: [
        '镜像名必须是完整域名格式：`swr.<region>.myhuaweicloud.com/<组织名>/<镜像名>:<标签>`；写成 `myorg/web:1.0.0` 会被推到 Docker Hub 并报权限错误',
        'SWR 控制台给出的登录指令分两种：长期有效的（用户名是华为云账号/子用户）和带临时 AK/SK 的（24 小时过期），CI 流水线要用长期凭证',
        '推送报 `denied` 先查三件事：是否已 login、组织名是否正确、该组织是否属于当前账号；跨账号拉取要在 SWR 里配置共享或授权',
        '别只用 `latest`：CCE 的 `imagePullPolicy: Always` 场景下，滚动更新时缓存层不确定容易拉不到新版本，用版本号或 digest 最稳'
      ],
      related: ['dk-tag', 'dk-pull', 'dk-build', 'dk-images'],
      docs: 'https://docs.docker.com/reference/cli/docker/image/push/',
      tags: ['推送', 'SWR', '镜像仓库']
    },

    /* ---------- 7 / 56 ---------- */
    {
      id: 'dk-rmi',
      name: 'docker rmi',
      alias: ['docker image rm', 'docker rmi -f', '删除镜像'],
      level: 2,
      syntax: 'docker rmi [选项] <镜像> [镜像...]',
      summary: '删除指定的本地镜像，释放镜像占用的磁盘空间。',
      desc: '镜像被容器引用（包括已停止的容器）时删不掉，得先 `docker rm` 容器。多标签镜像删一个标签只是去掉引用，删到最后一个才真正释放层数据。删除后用 `docker system df` 看回收效果，别只看命令没报错就以为空间回来了。',
      params: [
        { flag: '-f, --force', desc: '强制删除，包括被已停止容器引用的镜像（会留下悬空容器，不推荐）' },
        { flag: '--no-prune', desc: '保留被删镜像产生的中间层（默认会一起清掉）' }
      ],
      examples: [
        { cmd: 'docker rmi nginx:1.25', desc: '删除指定标签的镜像' },
        { cmd: 'docker rmi $(docker images -f dangling=true -q)', desc: '批量清理 <none> 悬空镜像（Linux Shell 写法）' },
        { cmd: 'docker rmi -f web:1.0.0', desc: '强制删除，连引用它的已停止容器一起放弃（慎用）' }
      ],
      notes: [
        '报 `image is being used by stopped container` 时先 `docker ps -a` 找到容器并 `docker rm`，不要习惯性 `-f`',
        '删镜像不等于释放等量磁盘：被其他镜像共享的层、仍被容器引用的层都不会释放，看 `docker system df -v` 的 RECLAIMABLE 列',
        '"镜像删了磁盘没释放"通常是三种情况：容器还在用、只是删了标签、或者占空间的其实是容器日志，先看 `dk-df`'
      ],
      related: ['dk-images', 'dk-rm', 'dk-df', 'dk-prune-image', 'dk-system-prune'],
      docs: 'https://docs.docker.com/reference/cli/docker/image/rm/',
      tags: ['删除', '镜像', '磁盘']
    },

    /* ---------- 8 / 56 ---------- */
    {
      id: 'dk-save',
      name: 'docker save / docker load',
      alias: ['docker save', 'docker load', '离线导入镜像', '镜像导出'],
      level: 2,
      syntax: 'docker save -o <文件名.tar> <镜像> / docker load -i <文件名.tar>',
      summary: '把镜像导出成 tar 再导入，用于无外网环境离线搬运镜像。',
      desc: '`save` 导出完整镜像层（含标签、ENV、CMD 等元数据），`load` 在目标机器导入后镜像名与标签原样保留，适合内网 ECS、离线机房、跨网络迁移。注意 `docker export/import` 操作的是容器文件系统快照，会丢元数据，两者不要混用。',
      params: [
        { flag: '-o, --output 文件名', desc: 'save 的写法：导出到指定 tar 文件（也可以用重定向 `>`）' },
        { flag: '-i, --input 文件名', desc: 'load 的写法：从 tar 文件导入' },
        { flag: '-q, --quiet', desc: '静默模式，不输出进度' }
      ],
      examples: [
        { cmd: 'docker save -o web-1.0.0.tar swr.cn-north-4.myhuaweicloud.com/myorg/web:1.0.0', desc: '把镜像导出为 tar 包' },
        { cmd: 'docker save web:1.0.0 | gzip > web-1.0.0.tar.gz', desc: '边导出边压缩，体积通常能小一半以上' },
        { cmd: 'gunzip -c web-1.0.0.tar.gz | docker load', desc: '在无外网的目标机器上导入镜像' },
        { cmd: 'scp web-1.0.0.tar.gz root@<目标ECS弹性公网IP>:/tmp/', desc: '先把压缩包传到内网机器，再导入' }
      ],
      notes: [
        '导出的是未压缩 tar，几 GB 很常见，务必 `gzip` 后再传；超大文件用 `split -b 2G` 分卷，落地后 `cat part-* > web.tar.gz` 合并',
        '`docker export` 导的是容器文件系统，导入后没有 CMD/ENV/端口等元数据，镜像基本不可直接运行；要保完整信息只能用 `docker save`',
        '导入后台机器上的镜像 ID 不变，但如果你要推送到另一套 SWR 地址，记得重新 `docker tag`',
        '离线环境同样要准备基础镜像：`nginx`、`mysql` 这类上游镜像也得先 save 一份带过去'
      ],
      related: ['dk-pull', 'dk-push', 'dk-images', 'dk-cp'],
      docs: 'https://docs.docker.com/reference/cli/docker/image/save/',
      tags: ['离线', '导入导出', '迁移']
    },

    /* ---------- 9 / 56 ---------- */
    {
      id: 'dk-history',
      name: 'docker history',
      alias: ['docker image history', '镜像层', '镜像瘦身'],
      level: 2,
      syntax: 'docker history [选项] <镜像>',
      summary: '按层查看镜像的构建历史与每层大小，定位镜像为什么这么大。',
      desc: '从新到旧列出每一层的创建命令与体积。`SIZE` 为 0B 的多是 `ENV`/`CMD`/`WORKDIR` 这类只改元数据的指令；真正的体积大头通常是某条 `RUN yum install` 或 `COPY` 了一个大文件。想瘦身，先在这里找到最大的一层，再回到 Dockerfile 合并 `RUN`、加 `.dockerignore` 或改多阶段构建。',
      params: [
        { flag: '--no-trunc', desc: '显示完整创建命令，不加会被截断成 `...`' },
        { flag: '--format', desc: '自定义输出，如 "{{.Size}} {{.CreatedBy}}"' },
        { flag: '-q, --quiet', desc: '只输出层 ID' },
        { flag: '-H, --human', desc: '人类可读的大小（默认开启）' }
      ],
      examples: [
        { cmd: 'docker history --no-trunc nginx:1.25', desc: '看完整构建命令，找出哪条 RUN 撑大了镜像' },
        { cmd: 'docker history --format "{{.Size}} {{.CreatedBy}}" web:1.0.0 | head -20', desc: '按"大小 + 命令"列出前 20 层，快速找大头' },
        { cmd: 'docker history --format "{{.Size}} {{.CreatedBy}}" web:1.0.0 | sort -hr | head -5', desc: '按体积排序，直接看最大的 5 层' }
      ],
      notes: [
        '`docker history` 只反映构建过程，容器运行后产生的改动不在其中，那部分看 `docker diff`',
        '`--no-trunc` 会暴露构建时 `--build-arg` 的真实取值，密码类参数不要用 build-arg 传',
        '同一层会被多个镜像共享，所以各层相加大于实际磁盘占用；真实占用看 `docker system df -v`'
      ],
      related: ['dk-images', 'dk-build', 'dk-diff', 'dk-inspect', 'dk-dockerfile'],
      docs: 'https://docs.docker.com/reference/cli/docker/image/history/',
      tags: ['镜像层', '瘦身', '排障']
    },

    /* ---------- 10 / 56 ---------- */
    {
      id: 'dk-inspect',
      name: 'docker inspect',
      alias: ['docker container inspect', 'docker image inspect', 'docker port', '查看容器元数据'],
      level: 2,
      syntax: 'docker inspect [选项] <容器|镜像|网络|卷>',
      summary: '查看容器、镜像等对象的完整元数据，常配合 --format 精确取值。',
      desc: '默认输出一大段 JSON，实际排障九成场景是用 `--format` 提一个字段：退出码、容器 IP、挂载路径、重启次数、健康状态。它对容器、镜像、网络、数据卷四类对象都适用；`docker port` 本质上就是它端口字段的快捷查询。',
      params: [
        { flag: '-f, --format "{{.字段}}"', desc: 'Go 模板取值，最常用的方式' },
        { flag: '-t, --type container', desc: '限定对象类型（container/image/network/volume），避免同名歧义' },
        { flag: '-s, --size', desc: '显示容器可写层大小（仅对容器有效）' }
      ],
      examples: [
        { cmd: 'docker inspect --format "{{.State.Status}} ExitCode={{.State.ExitCode}} Restarts={{.RestartCount}}" web', desc: '一条命令看状态、退出码、重启次数（排反复重启必备）' },
        { cmd: 'docker inspect --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" web', desc: '取容器 IP' },
        { cmd: 'docker inspect --format "{{json .Mounts}}" mysql8', desc: '看容器挂了哪些卷、对应宿主机哪个路径' },
        { cmd: 'docker port web', desc: '查端口映射关系，输出形如 80/tcp -> 0.0.0.0:8080' }
      ],
      notes: [
        '`docker port <容器>` 等价于 `docker inspect --format "{{json .NetworkSettings.Ports}}" <容器>`，只看端口时直接用它更省事',
        '`--format` 里是 Go template，字段名区分大小写，写错会报 `map has no entry for key`；先 `docker inspect web` 看原始 JSON 再抄字段名',
        '字段太长不好翻时可以用 `docker inspect web | jq .State`，但生产机器上不一定装了 jq'
      ],
      related: ['dk-ps', 'dk-logs', 'dk-troubleshoot-restart', 'dk-network-inspect', 'dk-stats'],
      docs: 'https://docs.docker.com/reference/cli/docker/inspect/',
      tags: ['元数据', '格式化', '排障']
    },

    /* ---------- 11 / 56 ---------- */
    {
      id: 'dk-commit',
      name: 'docker commit',
      alias: ['docker container commit', '容器存镜像'],
      level: 3,
      syntax: 'docker commit [选项] <容器> <镜像名:标签>',
      summary: '把容器当前的文件改动固化成一个新镜像，应急可用但不推荐。',
      desc: '原理是把容器可写层打包成新的一层。它上手快，代价是构建过程不可复现、不可评审：镜像里会残留日志与临时文件，别人拿不到"这个镜像怎么来的"。正确姿势是把改动回写进 Dockerfile 重新 `docker build`，或者先在容器里试出正确配置，再整理成文件。',
      params: [
        { flag: '-m, --message "说明"', desc: '提交信息，等价于 git 的 commit message' },
        { flag: '-a, --author "作者"', desc: '记录作者信息' },
        { flag: '-c, --change', desc: '提交时顺带修改镜像指令，如 -c \'CMD ["nginx","-g","daemon off;"]\'，可重复使用' },
        { flag: '-p, --pause', desc: '提交期间暂停容器（默认 true），避免文件系统不一致' }
      ],
      examples: [
        { cmd: 'docker commit -m "临时加了一次性排查工具" web web:hotfix', desc: '应急：把容器改动存成新镜像' },
        { cmd: 'docker commit -c \'CMD ["nginx","-g","daemon off;"]\' web web:1.0.1', desc: '提交时顺手修正启动命令' },
        { cmd: 'docker diff web', desc: '提交前先看清楚容器里改了哪些文件' }
      ],
      notes: [
        '不要在流水线或生产用 `commit`：镜像无法从 Dockerfile 重建，出事故查不到改动来源，也无法做代码评审与漏洞扫描',
        '`commit` 不会保存挂载卷（`-v`/`--mount`）里的数据，卷内容是宿主机上的文件，不进镜像',
        '提交前用 `docker diff <容器>` 过滤日志、缓存等噪音，否则镜像会被临时文件撑大',
        '应急提交出来的镜像应该当成"临时过渡"，当天就要把改动落回 Dockerfile 并用 `docker build` 重新产出'
      ],
      related: ['dk-build', 'dk-diff', 'dk-dockerfile', 'dk-save'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/commit/',
      tags: ['镜像', '反模式', '应急']
    },

    /* ---------- 12 / 56 ---------- */
    {
      id: 'dk-dockerfile',
      name: 'Dockerfile 关键指令',
      kind: 'recipe',
      alias: ['Dockerfile', 'CMD ENTRYPOINT 区别', 'FROM RUN COPY'],
      level: 2,
      syntax: 'FROM <基础镜像> [AS <阶段>] ...（这是文件格式，不是命令）',
      summary: 'Dockerfile 核心指令速查：构建、启动、环境与健康检查。',
      desc: 'Dockerfile 是镜像的"源码"，构建期指令（`FROM`/`RUN`/`COPY`/`ADD`/`WORKDIR`/`ENV`/`ARG`/`USER`/`VOLUME`/`EXPOSE`）在 `docker build` 时执行并固化进层；运行期指令（`CMD`/`ENTRYPOINT`/`HEALTHCHECK`/`STOPSIGNAL`）在 `docker run` 时生效。一句话记忆：`ENTRYPOINT` 是"固定入口"，`CMD` 是"默认参数"，后者能被命令行覆盖。',
      params: [
        { flag: 'FROM 镜像:标签 [AS 阶段]', desc: '基础镜像；多阶段构建写多个 FROM 并用 AS 命名阶段' },
        { flag: 'RUN 命令', desc: '构建期执行命令；多条用 `&&` 合成一条，并在末尾清理缓存' },
        { flag: 'COPY 源 目标', desc: '从构建上下文复制文件（推荐），配合 `.dockerignore` 使用' },
        { flag: 'ADD 源 目标', desc: '比 COPY 多了自动解压 tar 与远程 URL 能力；除非要解压，否则用 COPY' },
        { flag: 'WORKDIR /app', desc: '设置后续指令的工作目录，目录不存在会自动创建' },
        { flag: 'ENV KEY=值', desc: '设置环境变量，写进镜像元数据，运行时仍可见' },
        { flag: 'ARG KEY=默认值', desc: '构建期变量，用 --build-arg 传入，运行时不可见' },
        { flag: 'EXPOSE 8080', desc: '声明容器监听端口（只是文档性说明，不会真的映射，映射要用 -p）' }
      ],
      examples: [
        { cmd: 'FROM eclipse-temurin:17-jre-alpine', desc: 'Java 应用常用基础镜像，alpine 版体积小（约 180MB）' },
        { cmd: 'CMD ["java","-jar","/app/app.jar"]', desc: 'exec 数组写法，java 直接成为 PID 1，能正确接收 SIGTERM 优雅退出' },
        { cmd: 'ENTRYPOINT ["nginx","-g","daemon off;"]', desc: '把 nginx 按在前台运行，这就是官方 nginx 镜像不会秒退的原因' },
        { cmd: 'USER 10001:10001', desc: '切到普通用户运行，避免容器内 root 带来的逃逸风险' },
        { cmd: 'HEALTHCHECK --interval=30s --timeout=3s CMD curl -fsS http://localhost/ || exit 1', desc: '容器健康检查，Docker 只记录状态，不会自动重启' }
      ],
      notes: [
        '**`CMD` 与 `ENTRYPOINT` 的区别**：`ENTRYPOINT ["java","-jar","app.jar"]` 是固定入口，`docker run 镜像 --debug` 里的额外参数会**追加**到它后面；`CMD ["java","-jar","app.jar"]` 是默认命令，`docker run 镜像 sh` 会把整条 CMD **覆盖**掉。两者同时存在时，CMD 的内容作为 ENTRYPOINT 的默认参数',
        '`CMD`/`ENTRYPOINT` 必须用 exec 数组形式（`["nginx","-g","daemon off;"]`）；shell 形式（`CMD nginx -g "daemon off;"`）会多套一层 `/bin/sh -c`，sh 不会转发信号，导致 `docker stop` 每次都要等满 10 秒被强杀',
        '`USER` 不写时容器内以 root 运行，有逃逸风险；生产镜像建议 `RUN useradd -u 10001 app` 后 `USER 10001`，同时注意挂载目录的属主',
        '`VOLUME /data` 会声明匿名卷，容易在不知情的情况下攒出一堆匿名卷占磁盘；一般用运行时 `-v` 挂载即可',
        '`HEALTHCHECK` 只在 `docker ps` 的 STATUS 里体现为 `healthy/unhealthy`，Docker 自身不会因此重启容器，要配合编排平台（CCE/K8s 的 livenessProbe）才有实际动作',
        '改 Dockerfile 后一定要重新 `docker build`：只重启容器不会应用任何 Dockerfile 改动'
      ],
      related: ['dk-build', 'dk-commit', 'dk-history', 'dk-buildx'],
      docs: 'https://docs.docker.com/reference/dockerfile/',
      tags: ['Dockerfile', '构建', '速查']
    },

    /* ================= B. 容器生命周期 ================= */

    /* ---------- 13 / 56 ---------- */
    {
      id: 'dk-run',
      name: 'docker run',
      alias: ['docker container run', 'docker run -d', 'docker run -it', '启动容器'],
      level: 2,
      syntax: 'docker run [选项] <镜像>[:标签] [命令] [参数...]',
      summary: '创建并启动一个新容器，Docker 最核心也最容易踩坑的命令。',
      desc: '流程是"先 create 再 start"，镜像名后面写的内容会覆盖 Dockerfile 里的 `CMD`。容器不是虚拟机：容器里 PID 1 退出，容器就结束——这就是 nginx 官方镜像非要写 `nginx -g "daemon off;"` 的原因。所有参数都是"创建时固化"的，想改端口、卷、环境变量只能删掉容器重新 run，长期服务建议写进 compose 文件用 `docker compose up -d` 管理。',
      params: [
        { flag: '-d, --detach', desc: '后台运行并返回容器 ID；不加会占住当前终端' },
        { flag: '-it', desc: '`-i` 保持标准输入 + `-t` 分配伪终端，进容器交互必备，常与 `--rm` 连用' },
        { flag: '--rm', desc: '容器退出后自动删除，适合一次性调试，不留垃圾容器' },
        { flag: '-p 8080:80', desc: '端口映射"宿主机端口:容器端口"；默认监听 0.0.0.0，只给本机用写 `-p 127.0.0.1:8080:80`' },
        { flag: '-v /data/mysql:/var/lib/mysql', desc: 'bind mount 挂载；**宿主机目录会遮住容器内原内容**' },
        { flag: '--mount type=volume,src=mydata,dst=/var/lib/mysql', desc: '新式挂载语法，语义清晰、支持 readonly，生产脚本推荐' },
        { flag: '-e MYSQL_ROOT_PASSWORD=Root@1234', desc: '注入环境变量，MySQL/Redis 等官方镜像靠它做初始化' },
        { flag: '--name web', desc: '指定容器名，便于后续 exec/stop；重名会直接报 Conflict' },
        { flag: '--restart unless-stopped', desc: '重启策略：`no`（默认）/ `on-failure[:次数]` / `always` / `unless-stopped`' }
      ],
      examples: [
        { cmd: 'docker run -d --name web -p 80:80 -v /data/www:/usr/share/nginx/html:ro nginx:1.25', desc: '后台跑 Nginx，静态目录挂到宿主机并只读' },
        { cmd: 'docker run -d --name mysql8 -p 3306:3306 -e MYSQL_ROOT_PASSWORD=Root@1234 -v mysqldata:/var/lib/mysql --restart unless-stopped mysql:8.0', desc: 'MySQL 生产式起法：固定版本、数据落具名卷、异常自动重启' },
        { cmd: 'docker run -it --rm --network mynet alpine:3.19 sh', desc: '起个临时容器进自定义网络里调试，退出即删' },
        { cmd: 'docker run -d --name app --network mynet -e TZ=Asia/Shanghai --memory 1g --cpus 1.5 web:1.0.0', desc: '加入自定义网络、设时区并限制资源' }
      ],
      notes: [
        '**容器内 PID 1 必须是前台进程**：1 号进程一退出容器立刻结束。`systemctl start nginx`、`service xxx start`、脚本里 `nohup &` 这类"后台化"写法都会让容器秒退，正确做法是让服务前台运行（官方 nginx 镜像用 `nginx -g "daemon off;"`，Java 用 `java -jar` 直接前台跑）',
        '**`-v /宿主机目录:/容器目录` 时宿主机目录会覆盖容器内原内容**：挂一个空目录上去，容器里那份默认配置就"看不见"了（不是被删，是被遮住）。挂配置文件前先准备好宿主机文件；想保留镜像原内容就别挂那个目录',
        '宿主机目录不存在时 Docker 会自动创建一个**空目录**（属主 root:root），"挂载后服务起不来"很多是这里的属主/权限问题，必要时加 `:z`（SELinux）或改成具名卷',
        '`--restart always` 与 `unless-stopped` 的差别：手动 `docker stop` 之后，`always` 在 docker 服务重启时还会把容器拉起来，`unless-stopped` 不会',
        '`--rm` 不能与 `--restart` 同时用，会直接报错；要保留退出现场就别加 `--rm`',
        '其他高频参数速查：`--network mynet` 加入自定义网络、`--env-file .env` 从文件批量读环境变量、`--entrypoint /bin/sh` 覆盖入口点、`-u 1000:1000` 指定运行用户、`-w /app` 指定工作目录、`--hostname web01` 设容器主机名、`--add-host db:192.168.1.10` 写容器 hosts、`-P` 随机映射镜像 EXPOSE 的端口、`--log-opt max-size=10m` 限制日志大小',
        '`docker run` 出来的容器不受 compose 管理，改了参数只能删了重建；生产环境优先用 compose 或 CCE 描述文件，保证可追溯'
      ],
      related: ['dk-ps', 'dk-exec', 'dk-logs', 'dk-stop', 'dk-rm', 'dk-network-modes', 'dk-volume-vs-bind', 'dk-compose-up'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/run/',
      tags: ['容器', '启动', '端口', '挂载']
    },

    /* ---------- 14 / 56 ---------- */
    {
      id: 'dk-ps',
      name: 'docker ps',
      alias: ['docker container ls', 'docker ps -a', '查看容器'],
      level: 1,
      syntax: 'docker ps [选项]',
      summary: '列出容器及其状态、端口、名称，排障第一步就看它。',
      desc: '默认只显示运行中的容器，`-a` 才包含已退出的。`STATUS` 列信息量很大：`Up 3 minutes` 是正常运行，`Exited (1) 2 minutes ago` 是启动后报错退出，`Restarting (1) 5 seconds ago` 说明 `--restart` 策略正在反复拉起一个起不来的容器。',
      params: [
        { flag: '-a, --all', desc: '显示所有容器，含已退出与已创建的' },
        { flag: '-q, --quiet', desc: '只输出容器 ID，喂给脚本处理' },
        { flag: '--format', desc: 'Go 模板自定义列，如 "{{.Names}} {{.Status}} {{.Ports}}"' },
        { flag: '-f, --filter', desc: '过滤：`status=exited`、`name=web`、`ancestor=nginx:1.25`、`label=env=prod`' },
        { flag: '-n, --last 5', desc: '显示最近创建的 n 个容器（含已退出）' },
        { flag: '-s, --size', desc: '显示容器可写层大小' }
      ],
      examples: [
        { cmd: 'docker ps', desc: '看当前运行中的容器' },
        { cmd: 'docker ps -a -f status=exited', desc: '只看已退出的容器，排查异常结束的服务' },
        { cmd: 'docker ps --format "{{.Names}} {{.Status}} {{.Image}}"', desc: '自定义精简输出，适合截图或巡检记录' },
        { cmd: 'docker ps -q -f ancestor=nginx:1.25', desc: '找出由某个镜像创建的所有容器 ID' }
      ],
      notes: [
        '看不到容器不代表没容器：`docker ps` 默认过滤掉已退出的，先 `docker ps -a` 再下结论',
        '`PORTS` 列里 `0.0.0.0:8080->80/tcp` 表示宿主机所有网卡 8080 转发到容器 80；只显示 `80/tcp` 说明没做映射，外网访问不了',
        '华为云 ECS 上"映射了端口还访问不通"，先查安全组是否放行该端口，再看 firewalld/ufw，最后才是容器网络',
        '`STATUS` 里的 `(unhealthy)` 来自镜像的 `HEALTHCHECK`，此时容器进程还在跑但业务可能已经不可用'
      ],
      related: ['dk-run', 'dk-logs', 'dk-inspect', 'dk-stats', 'dk-rm', 'dk-troubleshoot-restart'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/ls/',
      tags: ['容器', '状态', '查看']
    },

    /* ---------- 15 / 56 ---------- */
    {
      id: 'dk-start',
      name: 'docker start',
      alias: ['docker container start', '启动已停止容器'],
      level: 1,
      syntax: 'docker start [选项] <容器> [容器...]',
      summary: '启动已创建或已停止的容器，端口与挂载配置全部保留。',
      desc: '启动的是"同一个容器"：`docker run` 时的端口、卷、环境变量都还在，容器可写层里没被删掉的改动也还在。它不会重新拉镜像，也不会应用任何新参数——想改配置只能删容器重建。',
      params: [
        { flag: '-a, --attach', desc: '启动后把容器输出附着到当前终端（Ctrl+C 会中断，注意）' },
        { flag: '-i, --interactive', desc: '附着时保持标准输入，与 `-a` 同用' }
      ],
      examples: [
        { cmd: 'docker start web', desc: '启动名为 web 的容器' },
        { cmd: 'docker start -ai web', desc: '启动并把终端接进去（Ctrl+P Ctrl+Q 脱离而不停容器）' },
        { cmd: 'docker start $(docker ps -aq -f status=exited)', desc: '批量启动所有已退出的容器（生产先确认清单）' }
      ],
      notes: [
        '`docker start` 不会拉取新镜像，容器里跑的仍是当初创建时的那个版本；要换版本得重建容器',
        '启动后又立刻退出，是容器内主进程自己的问题，看 `docker logs` 与退出码，别反复 start 掩盖问题',
        '`docker start` 与 `docker restart` 的区别：start 只启动已停止的，restart 是"停掉再启"，对运行中的容器也能用'
      ],
      related: ['dk-stop', 'dk-restart', 'dk-ps', 'dk-run', 'dk-logs'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/start/',
      tags: ['生命周期', '启动']
    },

    /* ---------- 16 / 56 ---------- */
    {
      id: 'dk-stop',
      name: 'docker stop',
      alias: ['docker container stop', '优雅停止容器'],
      level: 1,
      syntax: 'docker stop [选项] <容器> [容器...]',
      summary: '优雅停止容器：先发 SIGTERM，宽限期过后再 SIGKILL 强杀。',
      desc: '默认给容器内 PID 1 发 `SIGTERM`，等 10 秒仍未退出就发 `SIGKILL`。所以应用必须正确处理 `SIGTERM` 才能优雅退出：Java 要注册 shutdown hook、Shell 脚本要用 `exec` 让业务进程成为 PID 1、Nginx 要能响应 `SIGQUIT`。不处理信号的后果是每次停止都"等满 10 秒被强杀"，数据可能写到一半。镜像也可以用 Dockerfile 的 `STOPSIGNAL` 指令改默认信号。',
      params: [
        { flag: '-t, --timeout 30', desc: '发 SIGKILL 前的等待秒数，默认 10；`-1` 表示无限等待直到容器自己退出' },
        { flag: '-s, --signal SIGTERM', desc: '改发其他信号（默认由镜像的 STOPSIGNAL 决定，通常是 SIGTERM）' }
      ],
      examples: [
        { cmd: 'docker stop web', desc: '优雅停止单个容器（最多等 10 秒）' },
        { cmd: 'docker stop -t 60 mysql8', desc: '给 MySQL 60 秒做 checkpoint 与收尾，避免非正常关闭' },
        { cmd: 'docker stop $(docker ps -q)', desc: '停止所有运行中的容器（危险：会中断线上服务）' }
      ],
      notes: [
        '`docker stop` = SIGTERM + 宽限期（默认 10 秒）+ SIGKILL；`docker kill` 默认直接 SIGKILL，不给收尾机会',
        '停止操作总要耗满 10 秒，说明应用根本没处理 SIGTERM：检查启动命令是不是被 shell 包住导致信号没转发（用 `exec` 解决），或者 sig 被前台进程忽略',
        '`docker stop` 只停止不删除，容器与可写层都还在；重启宿主机后会不会自动起来取决于 `--restart` 策略',
        '`docker stop $(docker ps -q)` 会停掉整机上所有业务容器，生产执行前必须用 `docker ps` 核对清单'
      ],
      related: ['dk-kill', 'dk-restart', 'dk-start', 'dk-rm', 'dk-troubleshoot-restart'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/stop/',
      tags: ['停止', 'SIGTERM', '优雅退出']
    },

    /* ---------- 17 / 56 ---------- */
    {
      id: 'dk-restart',
      name: 'docker restart',
      alias: ['docker container restart', '重启容器'],
      level: 1,
      syntax: 'docker restart [选项] <容器> [容器...]',
      summary: '重启容器，等价于先 stop 再 start，创建参数完全保留。',
      desc: '常用来在改完挂载的配置文件后让服务重新读取。它重启的是"这个容器"，不会重新拉镜像、也不会应用新的 `docker run` 参数，`-t` 控制停止阶段的等待时间。能平滑重载的服务（Nginx、Redis 的部分场景）优先用服务自身的 reload，减少中断。',
      params: [
        { flag: '-t, --timeout 60', desc: '停止阶段的超时秒数，默认 10；数据库类服务建议调大' },
        { flag: '-s, --signal SIGTERM', desc: '停止阶段发送的信号（默认沿用容器配置）' }
      ],
      examples: [
        { cmd: 'docker restart web', desc: '重启 Nginx 容器，让新的 nginx.conf 生效' },
        { cmd: 'docker restart -t 60 mysql8', desc: '给数据库更长的优雅关闭时间' },
        { cmd: 'docker restart $(docker ps -q -f name=app)', desc: '按名称批量重启应用容器' }
      ],
      notes: [
        '改完配置文件能用 `docker exec web nginx -s reload` 平滑重载就别 restart，重启期间服务会短暂中断',
        '容器"起来就退出"的问题重启一百次也没用，先看 `docker logs` 与 `docker inspect --format "{{.State.ExitCode}}"`',
        'restart 会重置容器内的临时文件（可写层保留，但进程状态、临时目录内容按镜像/卷重新生成），有状态服务的中间态数据要落在卷里'
      ],
      related: ['dk-stop', 'dk-start', 'dk-logs', 'dk-update', 'dk-exec'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/restart/',
      tags: ['重启', '生命周期']
    },

    /* ---------- 18 / 56 ---------- */
    {
      id: 'dk-kill',
      name: 'docker kill',
      alias: ['docker container kill', 'docker kill -s'],
      level: 2,
      syntax: 'docker kill [选项] <容器> [容器...]',
      summary: '向容器内 PID 1 发送信号，默认 SIGKILL 直接强杀进程。',
      desc: '与 `docker stop` 的核心区别：kill 默认发 `SIGKILL`（进程无法捕获，立即死亡），stop 先发 `SIGTERM` 并等 10 秒。`-s` 让它变成一把"信号枪"，例如给 Nginx 发 `SIGHUP` 重载配置、给 Java 发 `SIGQUIT` 打线程栈，这在不能进容器的场景很好用。',
      params: [
        { flag: '-s, --signal SIGKILL', desc: '指定信号，默认 SIGKILL；可用 SIGHUP / SIGTERM / SIGUSR1 / SIGQUIT 等，也可写数字如 9' }
      ],
      examples: [
        { cmd: 'docker kill web', desc: '强杀容器（不给收尾机会，可能丢数据）' },
        { cmd: 'docker kill -s SIGHUP web', desc: '给 Nginx 发 SIGHUP，平滑重载配置' },
        { cmd: 'docker kill -s SIGTERM mysql8', desc: '手动发 SIGTERM，验证应用能否优雅退出' }
      ],
      notes: [
        '`SIGKILL` 无法被捕获，进程没有清理现场的机会；数据库容器慎用，可能触发崩溃恢复甚至数据损坏',
        '被强杀的容器退出码是 `137`（128 + 9 = SIGKILL）；如果 `docker inspect` 里 `OOMKilled=true`，那 137 是内核 OOM Killer 干的，不是人为 kill',
        '信号只发给容器内 PID 1，PID 1 需要负责把信号转发给子进程，否则子进程会变孤儿进程；这也是很多镜像用 tini/dumb-init 的原因',
        'kill 之后容器处于 Exited 状态，`docker start` 还能拉起来；要彻底清除得 `docker rm`'
      ],
      related: ['dk-stop', 'dk-rm', 'dk-troubleshoot-restart', 'dk-pause', 'dk-events'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/kill/',
      tags: ['信号', '强杀', '137']
    },

    /* ---------- 19 / 56 ---------- */
    {
      id: 'dk-rm',
      name: 'docker rm',
      alias: ['docker container rm', 'docker rm -f', '删除容器'],
      level: 1,
      syntax: 'docker rm [选项] <容器> [容器...]',
      summary: '删除已停止的容器，加 -v 可一并删除它的匿名数据卷。',
      desc: '容器必须先停止才能删，除非加 `-f`。删除容器**不会**动 `-v` 挂载的宿主机目录内容，但会丢掉容器可写层里没落盘的改动。删之前建议先 `docker inspect --format "{{json .Mounts}}"` 确认数据在哪，别把唯一一份数据随容器带走。',
      params: [
        { flag: '-f, --force', desc: '强制删除运行中的容器（相当于先 kill 再删），生产慎用' },
        { flag: '-v, --volumes', desc: '同时删除容器关联的匿名卷；不会动 bind mount 的宿主机目录' },
        { flag: '-l, --link', desc: '删除指定的网络连接（旧 --link 体系遗留，基本不用）' }
      ],
      examples: [
        { cmd: 'docker rm web', desc: '删除已停止的容器' },
        { cmd: 'docker rm -f web', desc: '强制删除运行中的容器（会直接 kill 掉进程）' },
        { cmd: 'docker rm -v old-mysql', desc: '删容器并清掉它的匿名卷' },
        { cmd: 'docker rm $(docker ps -aq -f status=exited)', desc: '批量清理所有已退出容器' }
      ],
      notes: [
        '**`docker rm` 不会删除具名数据卷**，也不动 bind mount 的宿主机目录；要批量清未使用的卷只能用 `docker volume prune`，而它会删掉所有没被容器使用的卷，慎用',
        '容器删了数据还在不在，取决于数据是否落在 `-v`/`--mount` 的宿主机路径或具名卷上——这就是"容器无状态、数据要外置"的核心原则',
        '`docker rm -f` 不让应用优雅退出，数据库容器别这么干，先 `docker stop` 再 rm',
        '`docker rm $(docker ps -aq)` 会把整机容器（含运行中的）删光，执行前先用 `docker ps -a` 核对；删掉的容器无法恢复'
      ],
      related: ['dk-ps', 'dk-rmi', 'dk-volume-rm', 'dk-system-prune', 'dk-run'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/rm/',
      tags: ['删除', '容器', '数据卷']
    },

    /* ---------- 20 / 56 ---------- */
    {
      id: 'dk-pause',
      name: 'docker pause / docker unpause',
      alias: ['docker unpause', 'docker container pause', '暂停容器'],
      level: 3,
      syntax: 'docker pause <容器> / docker unpause <容器>',
      summary: '暂停容器内所有进程并冻结在内存，恢复后从原地继续。',
      desc: '底层用 cgroup freezer 把容器内进程全部冻住：CPU 占用归零，但内存、文件句柄、TCP 连接全部保留。适合"临时让某个服务不干活"的场景，比如备份前冻结写入、压测时摘掉一个副本。`docker ps -f status=paused` 可以筛出暂停中的容器。',
      examples: [
        { cmd: 'docker pause worker01', desc: '暂停一个消费任务，不再取新消息但连接不断' },
        { cmd: 'docker unpause worker01', desc: '恢复运行，从暂停点继续' },
        { cmd: 'docker ps -f status=paused', desc: '列出处于暂停状态的容器' }
      ],
      notes: [
        '暂停不是停止：端口仍被占用、内存不释放、TCP 连接保持打开，调用方看到的是请求超时而不是连接拒绝，很容易被误判成"服务在但很慢"',
        '暂停中的容器无法 `docker exec`（会报 `Container is paused, unpause the container before exec`），也无法处理 SIGTERM，`docker stop` 会卡在等待里；先 `unpause` 再操作',
        '长时间暂停会占用内存不放，宿主机内存紧张时反而更危险，用完及时 unpause'
      ],
      related: ['dk-stop', 'dk-kill', 'dk-stats', 'dk-ps'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/pause/',
      tags: ['暂停', 'cgroup', '调试']
    },

    /* ---------- 21 / 56 ---------- */
    {
      id: 'dk-wait',
      name: 'docker wait',
      alias: ['docker container wait', '等待容器退出'],
      level: 3,
      syntax: 'docker wait <容器> [容器...]',
      summary: '阻塞等待容器退出并返回它的退出码，脚本编排时使用。',
      desc: '脚本里"等一个一次性任务容器跑完再继续"的利器，比如等数据库初始化容器、等数据迁移 Job 结束。它只等已经存在的容器，对不存在或从未启动的容器会立刻返回错误。',
      examples: [
        { cmd: 'docker wait initdb && echo "初始化任务已结束"', desc: '等一次性任务容器退出' },
        { cmd: 'docker run -d --name initdb mysql:8.0 sleep 30 && docker wait initdb', desc: '后台起容器再阻塞等它跑完，返回退出码' },
        { cmd: 'timeout 300 docker wait initdb', desc: '给等待加超时，避免脚本永远卡住' }
      ],
      notes: [
        '`docker wait` 返回的就是容器退出码，脚本里必须判断是否为 0，非 0 说明任务失败（1 应用错误、137 被强杀、143 被 SIGTERM 终止）',
        '等待期间会占住当前终端；生产脚本里建议配合 `timeout` 使用',
        '等容器退出只说明进程结束了，业务是否真的成功还要看日志或业务校验'
      ],
      related: ['dk-run', 'dk-ps', 'dk-logs', 'dk-events'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/wait/',
      tags: ['脚本', '退出码', '等待']
    },

    /* ---------- 22 / 56 ---------- */
    {
      id: 'dk-rename',
      name: 'docker rename',
      alias: ['docker container rename', '容器改名'],
      level: 2,
      syntax: 'docker rename <容器> <新名称>',
      summary: '给容器改名，容器名同时是自定义网络里的 DNS 域名。',
      desc: '容器名在自定义 bridge 网络里充当 DNS 记录，改了名字意味着依赖这个名字访问它的其他容器会解析失败。容器 ID、IP、hostname 都不变，运行中的容器也能改名。',
      examples: [
        { cmd: 'docker rename web web-prod-01', desc: '改成带环境标识的名字，便于多环境共存' },
        { cmd: 'docker rename 3f9a1b2c web', desc: '用容器 ID 前几位改名，省去复制长 ID' },
        { cmd: 'docker ps -a --format "{{.Names}} {{.ID}}"', desc: '先确认当前名字与 ID 再改' }
      ],
      notes: [
        '改名不影响容器内 `hostname`（那由 `--hostname` 决定），也不影响 IP；但会影响同网络其他容器对它的名字解析，可能造成短暂连接失败',
        '名字必须全局唯一，重名报 `Conflict`；已被占用的名字要先处理旧容器',
        '生产建议一次性规划好命名规范（如 `<项目>-<环境>-<序号>`），别频繁改名'
      ],
      related: ['dk-ps', 'dk-run', 'dk-network-modes', 'dk-update'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/rename/',
      tags: ['改名', 'DNS', '容器名']
    },

    /* ---------- 23 / 56 ---------- */
    {
      id: 'dk-update',
      name: 'docker update',
      alias: ['docker container update', '在线改资源限制'],
      level: 3,
      syntax: 'docker update [选项] <容器> [容器...]',
      summary: '在线修改运行中容器的资源限制与重启策略，不用重建容器。',
      desc: '容器跑起来才发现内存给少了、重启策略写错了，可以用它热修改。能改的是 CPU/内存/进程数/重启策略这一类 cgroup 与策略参数；端口映射、挂载、环境变量、网络属于"创建时固化"，改不了，只能删了重建。',
      params: [
        { flag: '-m, --memory 2g', desc: '限制最大内存；超限会被 OOM Killer 杀掉（退出码 137）' },
        { flag: '--memory-swap 2g', desc: '内存 + swap 的总上限；与 --memory 同值表示禁用 swap' },
        { flag: '--cpus 2', desc: '限制可用 CPU 核数，可以是小数，如 1.5' },
        { flag: '--cpuset-cpus 0-1', desc: '绑定到指定 CPU 核，做隔离或 NUMA 优化时用' },
        { flag: '--restart unless-stopped', desc: '修改重启策略' },
        { flag: '--pids-limit 500', desc: '限制容器内最大进程/线程数，防 fork 炸弹' }
      ],
      examples: [
        { cmd: 'docker update --memory 2g --memory-swap 2g mysql8', desc: '在线把 MySQL 内存上限调到 2G（swap 同值即不用 swap）' },
        { cmd: 'docker update --cpus 1.5 --restart unless-stopped web', desc: '限制 CPU 并修正重启策略' },
        { cmd: 'docker update --pids-limit 500 app', desc: '提高进程数上限，解决容器内 fork 失败' }
      ],
      notes: [
        '把 `--memory` 调到低于当前占用不会立刻杀容器，但下一次内存分配就可能触发 OOM，缩容要留余量',
        '端口、卷、环境变量、网络都改不了；要改这些只能 `docker rm` 后按新参数 `docker run`，或者改用 compose 管理',
        '`--cpus` 依赖 cgroup CPU 子系统；CentOS 7 这类 cgroup v1 环境要确认 `/sys/fs/cgroup/cpu` 已挂载，cgroup v2 环境（Ubuntu 22.04+/openEuler）写法一致',
        '改完用 `docker stats --no-stream` 或 `docker inspect --format "{{.HostConfig.Memory}}"` 确认生效'
      ],
      related: ['dk-run', 'dk-stats', 'dk-troubleshoot-restart', 'dk-inspect'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/update/',
      tags: ['资源限制', '内存', 'CPU']
    },

    /* ================= C. 交互与调试 ================= */

    /* ---------- 24 / 56 ---------- */
    {
      id: 'dk-exec',
      name: 'docker exec',
      alias: ['docker container exec', 'docker exec -it', 'docker attach', '进容器'],
      level: 2,
      syntax: 'docker exec [选项] <容器> <命令> [参数...]',
      summary: '在运行中的容器里执行命令或开一个交互式 shell。',
      desc: '排障主力：进容器看配置、查进程、连数据库、看日志文件。前提是**镜像里得有 shell**——`scratch`、`distroless` 以及部分精简镜像里没有 `/bin/sh`，这时只能靠 `docker logs` 和 `docker cp`，K8s/CCE 场景改用 `kubectl debug` 注入临时调试容器。它新开一个进程，不影响容器主进程，退出 shell 容器照常运行。命令必须是可执行文件，链式命令要交给 shell：`docker exec -it web sh -c "echo a && echo b"`。',
      params: [
        { flag: '-it', desc: '`-i` 保持输入 + `-t` 分配终端；交互式 shell 必须带上，脚本里用 `-i` 不加 `-t`' },
        { flag: '-u root', desc: '以指定用户执行（可写 `-u 0`），镜像默认非 root 时用它提权' },
        { flag: '-w /app', desc: '指定工作目录，省去进容器再 cd' },
        { flag: '-e KEY=值', desc: '临时注入环境变量，只对本次 exec 的进程有效' },
        { flag: '-d', desc: '后台执行，不占终端，适合在容器里跑一次性任务' },
        { flag: '--privileged', desc: '以特权模式执行（调试网络/挂载问题偶尔用，风险高）' },
        { flag: '--detach-keys ctrl-x', desc: '自定义脱离组合键（默认 Ctrl+P Ctrl+Q，属于 attach 那套语义）' }
      ],
      examples: [
        { cmd: 'docker exec -it web bash', desc: '进 Nginx 容器交互操作（镜像里没有 bash 就换 sh）' },
        { cmd: 'docker exec -it mysql8 mysql -uroot -p', desc: '直接在容器里连 MySQL 客户端' },
        { cmd: 'docker exec -u root -w /app app java -version', desc: '以 root 身份在 /app 目录下执行命令' },
        { cmd: 'docker exec -d web touch /tmp/health', desc: '后台在容器里执行一条命令' },
        { cmd: 'docker attach web', desc: '接管容器主进程的输入输出（Ctrl+P Ctrl+Q 脱离；直接 Ctrl+C 会把容器停掉）' }
      ],
      notes: [
        '**容器里必须有 shell**：`scratch`、`distroless` 镜像没有 `/bin/sh`，`docker exec -it xxx sh` 报 `executable file not found in $PATH`；这类镜像排障靠 `docker logs`、`docker cp`，CCE 里用 `kubectl debug`',
        '`docker exec` 起的进程不是 PID 1，它的退出码不影响容器状态，也不能用它重启容器内主进程',
        '`docker attach` 与 `docker exec` 的区别：attach 接的是 PID 1 的标准输入输出，在里面按 `Ctrl+C` 会把主进程打断导致容器退出（要用 `Ctrl+P Ctrl+Q` 脱离）；exec 是新开进程，退出不影响容器',
        '命令必须是可执行文件，`docker exec web "echo a && echo b"` 不会工作，要写成 `docker exec web sh -c "echo a && echo b"`',
        '暂停（paused）的容器不能 exec，先 `docker unpause`',
        '进容器里 `apt install` 的工具在容器删除后就没了，只适合临时排查；正式改动要落到 Dockerfile 重新构建'
      ],
      related: ['dk-logs', 'dk-run', 'dk-cp', 'dk-stats', 'dk-inspect', 'dk-troubleshoot-restart'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/exec/',
      tags: ['交互', '排障', 'shell']
    },

    /* ---------- 25 / 56 ---------- */
    {
      id: 'dk-logs',
      name: 'docker logs',
      alias: ['docker container logs', 'docker logs -f', '容器日志'],
      level: 1,
      syntax: 'docker logs [选项] <容器>',
      summary: '查看容器主进程的标准输出与错误，排障第一现场。',
      desc: '只抓容器内 PID 1 的 stdout/stderr，也就是前台打印出来的内容；写进容器内文件的日志（如 `/var/log/nginx/access.log`）**不在**这里，得 `docker exec` 去看或挂载出来。日志默认以 json 文件存在 `/var/lib/docker/containers/<容器ID>/<容器ID>-json.log`，**不限大小**，是撑满磁盘的头号元凶，处理方式见 `dk-container-logs-size`。',
      params: [
        { flag: '-f, --follow', desc: '持续跟踪输出，相当于 tail -f；Ctrl+C 只退出查看，不影响容器' },
        { flag: '--tail 200', desc: '只看最后 n 行；与 `-f` 连用时必须先加，否则会把全量历史一次刷出来' },
        { flag: '--since 30m', desc: '从指定时间开始，支持 `30m`、`2h`、`2026-02-01T10:00:00`' },
        { flag: '--until 10m', desc: '只看到指定时间为止，与 `--since` 组合查历史区间' },
        { flag: '-t, --timestamps', desc: '每行前加时间戳（UTC 时区，和北京时间差 8 小时）' },
        { flag: '--details', desc: '显示日志驱动附加的额外字段' }
      ],
      examples: [
        { cmd: 'docker logs --tail 200 -f web', desc: '实时跟踪 Nginx 最近 200 行日志' },
        { cmd: 'docker logs --since 10m --timestamps web', desc: '看最近 10 分钟带时间戳的日志' },
        { cmd: 'docker logs --tail 100 myapp 2>&1 | grep -i exception', desc: '只看异常行，Java 应用排错常用' },
        { cmd: 'docker logs web > web.log 2>&1', desc: '先落盘再慢慢分析，避免日志被轮转掉' }
      ],
      notes: [
        '**日志不加限制会撑满 `/var/lib/docker`**：`docker run` 时加 `--log-opt max-size=10m --log-opt max-file=3`，或在 `/etc/docker/daemon.json` 里配 `log-opts` 做全局默认（只对新建容器生效）',
        '`-t` 输出的时间戳是 UTC，容器内 `date` 默认也是 UTC，看到和北京时间差 8 小时属于正常现象，不是日志丢了',
        '日志驱动不是 `json-file`/`local` 时（如 `journald`、`syslog`），`docker logs` 可能没有输出，要去 `journalctl -u docker` 或对应后端查',
        '容器重建后日志文件重新开始，`docker logs -f` 会中断；生产环境建议把日志投递到华为云 LTS 或 ELK 长期留存'
      ],
      related: ['dk-exec', 'dk-events', 'dk-troubleshoot-restart', 'dk-container-logs-size', 'dk-compose-logs', 'k8s-logs'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/logs/',
      tags: ['日志', '排障', 'tail']
    },

    /* ---------- 26 / 56 ---------- */
    {
      id: 'dk-stats',
      name: 'docker stats',
      alias: ['docker container stats', 'docker top', '容器资源占用'],
      level: 2,
      syntax: 'docker stats [选项] [容器...]',
      summary: '实时查看容器 CPU、内存、网络与磁盘 IO 占用，容器版 top。',
      desc: '默认滚动刷新所有运行中容器，`--no-stream` 取一次快照，适合脚本与巡检记录。内存列是"使用量 / 限制"，没有 `--memory` 时限制显示的是宿主机总内存。想看容器里到底跑了哪些进程，用 `docker top <容器>`，它执行的是宿主机视角的 ps，能看到容器内进程对应的宿主机 PID。',
      params: [
        { flag: '--no-stream', desc: '只取一次快照就退出，脚本/巡检必备' },
        { flag: '--format', desc: '自定义输出，如 "{{.Name}} {{.CPUPerc}} {{.MemUsage}}"' },
        { flag: '-a, --all', desc: '包含已停止的容器' },
        { flag: '--no-trunc', desc: '不截断容器 ID 与名称' }
      ],
      examples: [
        { cmd: 'docker stats --no-stream', desc: '所有容器的一次性资源快照' },
        { cmd: 'docker stats --no-stream --format "{{.Name}} CPU={{.CPUPerc}} MEM={{.MemUsage}}"', desc: '自定义巡检输出，方便记进日报' },
        { cmd: 'docker top web', desc: '看容器里实际运行的进程，确认 PID 1 是什么' },
        { cmd: 'docker top mysql8 -o pid,args', desc: '自定义 ps 输出列，只看 PID 与命令行' }
      ],
      notes: [
        '`CPU %` 可能超过 100%：多核容器里 200% 表示吃满两个核，属正常现象',
        '`LIMIT` 列显示宿主机总内存说明没设内存限制，一个容器就能把整台 ECS 拖垮，生产必须用 `--memory`/`--cpus` 兜底',
        '在容器内执行 `top`/`free` 看到的是宿主机数据（共享内核，不是虚拟化），判断容器占用要在宿主机上用 `docker stats`',
        '`docker stats` 数据来自 cgroup，短命进程的瞬时峰值可能采不到，定位性能问题最终还是要看 `top`、`iostat`、`pidstat`'
      ],
      related: ['dk-ps', 'dk-inspect', 'dk-update', 'dk-diff'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/stats/',
      tags: ['监控', '资源', '性能']
    },

    /* ---------- 27 / 56 ---------- */
    {
      id: 'dk-cp',
      name: 'docker cp',
      alias: ['docker container cp', '容器拷文件'],
      level: 2,
      syntax: 'docker cp [选项] <容器>:<路径> <宿主机路径>  （或反向）',
      summary: '在容器与宿主机之间复制文件，容器运行中或已停止都能用。',
      desc: '排障时把容器里的配置、日志拷出来看，或把宿主机上的文件塞进去应急。它不做增量同步、不保留属主映射（默认按 root 复制），大量文件应该用挂载或 rsync 解决。写进容器的文件不会进入镜像，容器重建就丢。',
      params: [
        { flag: '-a, --archive', desc: '保留文件属主与权限，等价于 cp -a' },
        { flag: '-L, --follow-link', desc: '跟随源路径中的符号链接（默认拷链接本身）' }
      ],
      examples: [
        { cmd: 'docker cp web:/etc/nginx/nginx.conf ./nginx.conf', desc: '把容器内配置拷出来对比分析' },
        { cmd: 'docker cp ./nginx.conf web:/etc/nginx/nginx.conf', desc: '把改好的配置塞回容器，再 `docker exec web nginx -s reload`' },
        { cmd: 'docker cp mysql8:/var/log/mysql/error.log ./mysql-error.log', desc: '拷出数据库错误日志' },
        { cmd: 'docker cp ./dist/. web:/usr/share/nginx/html/', desc: '发布前端静态文件（结尾的 `/.` 表示拷目录内容）' }
      ],
      notes: [
        '拷进容器的文件不会写进镜像，容器一重建就没了；正式改动要落到 Dockerfile 或挂载目录',
        '目录复制语义容易搞混：`docker cp src/. ctr:/dst/` 拷的是 src 里的内容，`docker cp src ctr:/dst/` 会把 src 目录整个放进去',
        '宿主机路径权限不足或 SELinux（CentOS）上下文不对时会报 `Permission denied`，检查目录属主与 `:z` 标签',
        '要拷的数据很大时改用卷挂载 + `rsync`，`docker cp` 会走 daemon 中转，效率和稳定性都差'
      ],
      related: ['dk-exec', 'dk-diff', 'dk-volume-vs-bind', 'dk-save'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/cp/',
      tags: ['复制', '文件', '排障']
    },

    /* ---------- 28 / 56 ---------- */
    {
      id: 'dk-diff',
      name: 'docker diff',
      alias: ['docker container diff', '容器文件改动'],
      level: 3,
      syntax: 'docker diff <容器>',
      summary: '列出容器可写层里被改动的文件，看清容器到底动了什么。',
      desc: '三类标记：`A` 新增、`C` 修改、`D` 删除。用来查"镜像里的默认配置被改成了什么"、审计运行期的临时改动、判断某个文件是否被挂载覆盖。只覆盖容器可写层，挂载进容器的卷不在检查范围内。',
      examples: [
        { cmd: 'docker diff web', desc: '看 Nginx 容器运行时改了哪些文件' },
        { cmd: 'docker diff web | grep -v "^C /var/log"', desc: '过滤日志噪音，只关注配置类改动' },
        { cmd: 'docker diff app | grep -E "^A|^D"', desc: '只看新增和删除的文件' }
      ],
      notes: [
        '输出可能非常长，先 `docker diff web | wc -l` 看规模再配合 grep 缩小范围',
        '挂载卷（`-v`/`--mount`）里的改动不会显示，因为那不是可写层；"容器里改了文件却没生效"往往就是被挂载覆盖了，参考 `dk-volume-vs-bind`',
        '`docker diff` 只给文件名，要看内容差异得 `docker cp` 拷出来用 `diff` 比对'
      ],
      related: ['dk-commit', 'dk-cp', 'dk-history', 'dk-inspect', 'dk-volume-vs-bind'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/diff/',
      tags: ['文件', '改动', '审计']
    },

    /* ---------- 29 / 56 ---------- */
    {
      id: 'dk-events',
      name: 'docker events',
      alias: ['docker system events', 'Docker 事件流', '容器突然消失'],
      level: 3,
      syntax: 'docker events [选项]',
      summary: '实时输出 Docker 守护进程事件流，查"容器为什么突然没了"。',
      desc: '"容器自己消失了""服务莫名重启了"这类问题的关键工具：事件流会记录 `create`/`start`/`die`/`stop`/`kill`/`oom`/`health_status` 等动作与时间。`die` 事件带 `exitCode`，配合 `docker inspect` 就能还原现场；`oom` 事件直接说明容器被内核 OOM Killer 杀了。',
      params: [
        { flag: '--since 1h', desc: '从多久之前开始显示（默认只显示当前时刻之后的事件）' },
        { flag: '--until 10m', desc: '截止时间，配合 --since 回看某个时间段' },
        { flag: '-f, --filter', desc: '过滤：`container=web`、`event=die`、`event=oom`、`type=container`、`type=network`' },
        { flag: '--format', desc: '自定义输出，如 "{{.Time}} {{.Action}} {{.Actor.Attributes.name}}"' }
      ],
      examples: [
        { cmd: 'docker events --since 2h --until 10m --filter container=web', desc: '回看 web 容器两小时前的操作与退出记录' },
        { cmd: 'docker events --filter event=die --filter event=oom', desc: '只盯容器退出与 OOM 事件' },
        { cmd: 'docker events --filter type=container --format "{{.Time}} {{.Action}} {{.Actor.Attributes.name}}"', desc: '格式化输出，方便和三方日志对时间' }
      ],
      notes: [
        'Docker 只在内存里保留最近的事件，`--since` 填太久远的时间查不到；长期审计要接 `journald`/syslog',
        '看到 `oom` 说明容器是被内核杀的（退出码 137），要么调大 `--memory`，要么查应用内存泄漏',
        '事件流只记录生命周期动作，不记录业务异常，业务问题还是看 `docker logs`'
      ],
      related: ['dk-logs', 'dk-ps', 'dk-inspect', 'dk-troubleshoot-restart'],
      docs: 'https://docs.docker.com/reference/cli/docker/system/events/',
      tags: ['事件', '排障', 'OOM']
    },

    /* ================= D. 网络 ================= */

    /* ---------- 30 / 56 ---------- */
    {
      id: 'dk-network-ls',
      name: 'docker network ls',
      alias: ['docker network list', '网络列表'],
      level: 1,
      syntax: 'docker network ls [选项]',
      summary: '列出 Docker 网络，确认容器接在哪个网段上。',
      desc: '安装后默认有 `bridge`（默认桥，容器名不能互解）、`host`（共用宿主机网络栈）、`none`（无网络）三个网络。用 `docker compose` 起的项目会自动创建 `<项目名>_default` 自定义网络，容器之间用服务名互访。',
      params: [
        { flag: '-f, --filter', desc: '过滤：`driver=bridge`、`name=mynet`、`type=custom`' },
        { flag: '--format', desc: '自定义输出列，如 "{{.Name}} {{.Driver}} {{.Scope}}"' },
        { flag: '-q, --quiet', desc: '只输出网络 ID' },
        { flag: '--no-trunc', desc: '不截断网络 ID' }
      ],
      examples: [
        { cmd: 'docker network ls', desc: '列出全部网络' },
        { cmd: 'docker network ls -f driver=bridge', desc: '只看 bridge 类型的网络' },
        { cmd: 'docker network ls --format "{{.Name}} {{.Driver}} {{.Scope}}"', desc: '自定义输出网络名、驱动与作用域' }
      ],
      notes: [
        'compose 自动创建的网络名字带项目前缀（`<项目名>_default`），删项目时别把网络漏掉，否则会攒一堆无用网络',
        '`docker network ls` 不显示容器与网络的关联关系，要看 IP 和成员得用 `docker network inspect <网络名>`',
        '华为云 CCE 集群的 Pod 网络由 CNI 插件管理（如 VPC-CNI），不在这里显示，别把两者混为一谈'
      ],
      related: ['dk-network-create', 'dk-network-inspect', 'dk-network-modes', 'dk-network-rm'],
      docs: 'https://docs.docker.com/reference/cli/docker/network/ls/',
      tags: ['网络', '列表', 'bridge']
    },

    /* ---------- 31 / 56 ---------- */
    {
      id: 'dk-network-create',
      name: 'docker network create',
      alias: ['docker network create --driver', '自定义网络'],
      level: 2,
      syntax: 'docker network create [选项] <网络名>',
      summary: '创建自定义网络，让容器之间用容器名互相访问。',
      desc: '自定义 bridge 网络自带内嵌 DNS，容器可以直接用"容器名"当域名互访，这是它相比默认 bridge 最大的价值（默认 bridge 只能用已废弃的 `--link`）。生产上建议一个应用一个网络，并用 `--subnet` 规划网段，避免与华为云 VPC 网段冲突。',
      params: [
        { flag: '-d, --driver bridge', desc: '驱动类型：`bridge`（单机，默认）、`overlay`（跨主机/Swarm）、`macvlan`、`host`、`none`' },
        { flag: '--subnet 172.20.0.0/16', desc: '指定子网，避开 VPC 已用网段（如 192.168.0.0/16、172.16.0.0/12）' },
        { flag: '--gateway 172.20.0.1', desc: '指定网关地址' },
        { flag: '--internal', desc: '创建内部网络，容器之间互通但不能访问外网（数据层隔离常用）' },
        { flag: '--attachable', desc: '允许普通容器加入 overlay 网络（非 Swarm 服务场景）' },
        { flag: '--ipv6', desc: '启用 IPv6（需要 daemon 已开启 ipv6）' }
      ],
      examples: [
        { cmd: 'docker network create mynet', desc: '创建自定义 bridge 网络' },
        { cmd: 'docker network create -d bridge --subnet 172.20.0.0/16 --gateway 172.20.0.1 appnet', desc: '指定网段创建，避免与 VPC 冲突' },
        { cmd: 'docker network create --internal dbnet', desc: '创建只能容器互访、不能出外网的网络，用于数据库层' }
      ],
      notes: [
        'Docker 默认地址池从 `172.17.0.0/16` 开始，容易与华为云 VPC 的 `172.16.0.0/12` 撞车，导致容器访问同网段云服务（RDS、OBS 内网域名）走错路由；在 `/etc/docker/daemon.json` 里用 `default-address-pools` 整体改掉',
        '**自定义网络里的容器能用容器名互相解析，默认 `bridge` 网络不能**——这就是"为什么我 ping 不通另一个容器名"的标准答案',
        '`--subnet` 一旦有容器在用就改不了，网段规划要一次到位',
        '创建的容器要用 `--network appnet` 显式加入，或者用 `docker network connect` 事后接入'
      ],
      related: ['dk-network-ls', 'dk-network-inspect', 'dk-network-connect', 'dk-network-modes', 'dk-daemon-json'],
      docs: 'https://docs.docker.com/reference/cli/docker/network/create/',
      tags: ['网络', '自定义网络', 'DNS']
    },

    /* ---------- 32 / 56 ---------- */
    {
      id: 'dk-network-inspect',
      name: 'docker network inspect',
      alias: ['docker network inspect 容器IP', '看容器IP'],
      level: 2,
      syntax: 'docker network inspect [选项] <网络名>',
      summary: '查看网络的网段、网关与成员容器 IP，定位容器 IP 的入口。',
      desc: '输出里有 `Subnet`、`Gateway`，以及 `Containers` 段中每个容器名对应的 IPv4Address。排查"两个容器为什么不通""容器真实 IP 是多少""网段有没有和 VPC 冲突"都看它。与 `docker inspect <容器>` 的区别：这里是从网络的视角看成员。',
      params: [
        { flag: '-f, --format', desc: '提取字段，如 "{{range .IPAM.Config}}{{.Subnet}}{{end}}"' },
        { flag: '-v, --verbose', desc: '输出更详细的信息（含容器内部视角的网络细节）' }
      ],
      examples: [
        { cmd: 'docker network inspect mynet', desc: '看网段、网关与成员容器' },
        { cmd: 'docker network inspect -f "{{range .Containers}}{{.Name}}={{.IPv4Address}} {{end}}" mynet', desc: '一行列出该网络里所有容器名与 IP' },
        { cmd: 'docker network inspect -f "{{range .IPAM.Config}}{{.Subnet}}{{end}}" mynet', desc: '只看网段，检查是否与 VPC 冲突' }
      ],
      notes: [
        '容器 IP 是动态分配的，容器重建后会变，不要把它写进配置文件——用容器名（自定义网络里的 DNS）代替',
        '`-f` 模板里 `Containers` 是 map 结构，必须 `{{range .Containers}}` 遍历，直接取 `.Containers.IPAddress` 会报错',
        '网络里看不到某个容器，说明它不在这个网络，用 `docker inspect --format "{{json .NetworkSettings.Networks}}" <容器>` 反查'
      ],
      related: ['dk-network-ls', 'dk-network-create', 'dk-inspect', 'dk-troubleshoot-network'],
      docs: 'https://docs.docker.com/reference/cli/docker/network/inspect/',
      tags: ['网络', 'IP', '排障']
    },

    /* ---------- 33 / 56 ---------- */
    {
      id: 'dk-network-connect',
      name: 'docker network connect / disconnect',
      alias: ['docker network disconnect', 'docker network connect'],
      level: 3,
      syntax: 'docker network connect [选项] <网络> <容器> / docker network disconnect <网络> <容器>',
      summary: '把运行中的容器接入或断开某个网络，无需重建容器。',
      desc: '一个容器可以同时接入多个网络（例如同时接 `appnet` 与 `dbnet`），正好用来做分层隔离：数据库网络只对应用层开放，前端容器根本进不去。断开网络不会影响容器运行，但依赖该网络的连接会立刻失败。',
      params: [
        { flag: '--alias mysql', desc: '给容器在该网络里加别名，其他容器可用别名访问' },
        { flag: '--ip 172.20.0.10', desc: '指定静态 IP（要求该网络创建时已指定子网）' },
        { flag: '--ip6', desc: '指定 IPv6 地址' },
        { flag: '-f, --force', desc: 'disconnect 专用：强制断开，即使容器正在使用该网络' }
      ],
      examples: [
        { cmd: 'docker network connect dbnet app', desc: '把应用容器接入数据库专用网络' },
        { cmd: 'docker network connect --alias mysql dbnet mysql8', desc: '接入时加别名，应用里用 `mysql` 主机名就能连' },
        { cmd: 'docker network disconnect dbnet app', desc: '断开网络连接（正在进行的数据库访问会中断）' }
      ],
      notes: [
        '容器要至少保留一个网络连接，把唯一的网络断开后容器就没有网卡了，只能再 connect 回来',
        '`--ip` 指定的静态 IP 不能与已有容器冲突（报 `Address already in use`）；容器重建后需要重新 connect 才能恢复静态 IP',
        '断网是瞬时生效的，生产变更前确认应用有重连机制；数据库地址变更建议用别名而不是 IP'
      ],
      related: ['dk-network-create', 'dk-network-inspect', 'dk-network-modes', 'dk-network-ls'],
      docs: 'https://docs.docker.com/reference/cli/docker/network/connect/',
      tags: ['网络', '接入', '隔离']
    },

    /* ---------- 34 / 56 ---------- */
    {
      id: 'dk-network-rm',
      name: 'docker network rm / prune',
      alias: ['docker network prune', 'docker network rm', '删网络'],
      level: 2,
      syntax: 'docker network rm <网络...> / docker network prune [选项]',
      summary: '删除自定义网络，prune 可批量清理所有无容器使用的网络。',
      desc: '有容器连接着的网络删不掉，要先停容器或 `docker network disconnect`。`prune` 清理所有没有被容器使用的自定义网络（默认的 `bridge`/`host`/`none` 不会被删），compose 项目删除后残留的 `<项目名>_default` 就靠它收尾。',
      params: [
        { flag: '-f, --force', desc: 'prune 专用：跳过交互确认，脚本里用' },
        { flag: '--filter until=24h', desc: 'prune 专用：只清理创建超过指定时长的网络' },
        { flag: '--filter label=env=dev', desc: 'prune 专用：按标签筛选要清理的网络' }
      ],
      examples: [
        { cmd: 'docker network rm mynet', desc: '删除指定网络' },
        { cmd: 'docker network prune', desc: '交互确认后清理所有未使用的网络' },
        { cmd: 'docker network prune -f --filter until=24h', desc: '清理一天前创建且无人使用的网络' }
      ],
      notes: [
        '`docker network prune` 删除的网络**无法恢复**：compose 下次启动会自动重建自己的网络，手工创建的网络要重新 `docker network create`',
        '网络被容器占用时删不掉，报 `network has active endpoints`，先 `docker network inspect` 看谁在里面',
        '默认网络 `bridge`/`host`/`none` 不受 prune 影响；误删自定义网络后容器重启会失败，记得同时检查 compose 文件里的 `networks` 定义'
      ],
      related: ['dk-network-ls', 'dk-network-create', 'dk-system-prune', 'dk-network-inspect'],
      docs: 'https://docs.docker.com/reference/cli/docker/network/rm/',
      tags: ['删除', '清理', '网络']
    },

    /* ---------- 35 / 56 ---------- */
    {
      id: 'dk-network-modes',
      name: 'Docker 网络模式（bridge/host/none/container）',
      kind: 'recipe',
      alias: ['--network host', '网络模式对比', 'bridge host none'],
      level: 2,
      syntax: 'docker run --network <bridge|host|none|container:<容器>|自定义网络名> [选项] <镜像>',
      summary: '四种网络模式的取舍：端口映射还是直接共用宿主机网络栈。',
      desc: '`bridge`（默认）给容器独立网络命名空间，靠 `-p` 做 NAT 端口映射；`host` 直接复用宿主机网络栈，容器里监听 80 就是宿主机 80，没有 NAT 开销、性能略好，但端口唯一且隔离性差；`none` 只有回环口，用于纯计算或离线校验任务；`container:<名字>` 共享另一个容器的网络栈（K8s/CCE 的 Pod 就是这个模型，同 Pod 内容器端口不能重复）。',
      params: [
        { flag: '--network bridge', desc: '默认模式：独立网段 + `-p` 端口映射；默认 bridge 里容器名不能互解' },
        { flag: '--network host', desc: '共用宿主机网络栈，不需要也不能用 `-p`；端口冲突风险高，仅在 Linux 上完全生效' },
        { flag: '--network none', desc: '只有 lo 回环口，完全无外网' },
        { flag: '--network container:web', desc: '与目标容器共享网络栈（同一 IP、同一端口空间）' },
        { flag: '--network mynet', desc: '加入自定义 bridge 网络：容器名可互解，生产推荐' },
        { flag: '-p 8080:80', desc: '端口映射，只在 bridge（含自定义网络）模式下有意义' }
      ],
      examples: [
        { cmd: 'docker run -d --name web --network host nginx:1.25', desc: 'host 模式跑 Nginx，直接占用宿主机 80 端口' },
        { cmd: 'docker run -d --name app --network mynet -p 8080:8080 web:1.0.0', desc: '自定义网络 + 端口映射，生产常规做法' },
        { cmd: 'docker run -it --rm --network none alpine:3.19 sh', desc: '无网络容器，验证纯本地逻辑' },
        { cmd: 'docker run -d --name log-agent --network container:app fluentd:latest', desc: '日志采集容器共享业务容器网络栈（Pod 模式）' }
      ],
      notes: [
        '`--network host` 与 `-p` 是两条路线：host 共用宿主机网络栈，写了 `-p` 也会被忽略；`-p` 走 iptables NAT 映射，灵活、可多容器复用同端口，代价是一层 NAT 转发。选型建议——单机跑一个独占端口的服务（如 Nginx、监控 agent）可以 host；需要多实例、需要清晰端口规划的一律自定义网络 + `-p`',
        '**自定义 bridge 网络里容器能用容器名互相解析，默认 `bridge` 网络不能**（默认 bridge 没有内嵌 DNS，只能靠 IP 或已废弃的 `--link`），所以别再纠结 `--link`，直接建自定义网络',
        '华为云 ECS 上容器端口要被公网访问，除了 `-p` 还要在安全组放行对应端口，这是宿主机层面的事，与容器网络模式无关',
        'Docker Desktop（Windows/macOS）上 `--network host` 语义与 Linux 不同，只有 Linux 宿主机才按预期工作',
        'CCE/K8s 里不用 host 模式暴露服务，交给 Service/Ingress；Pod 内多容器共享网络命名空间正是 `container:` 模式的思路'
      ],
      related: ['dk-run', 'dk-network-create', 'dk-network-inspect', 'dk-troubleshoot-network', 'dk-network-connect'],
      docs: 'https://docs.docker.com/engine/network/',
      tags: ['网络模式', 'host', 'bridge', '端口映射']
    },

    /* ================= E. 数据卷与存储 ================= */

    /* ---------- 36 / 56 ---------- */
    {
      id: 'dk-volume-create',
      name: 'docker volume create',
      alias: ['docker volume create -d local', '创建数据卷'],
      level: 2,
      syntax: 'docker volume create [选项] [卷名]',
      summary: '创建具名数据卷，让数据独立于容器生命周期存在。',
      desc: '不写卷名会创建匿名卷（一长串哈希名，容易忘记清理）。具名卷由 Docker 管理，默认落在 `/var/lib/docker/volumes/<卷名>/_data`。用 `-o` 可以给 local 驱动传参数，把卷落到指定的 NFS 共享上，实现多台 ECS 共享同一份数据。',
      params: [
        { flag: '-d, --driver local', desc: '卷驱动，默认 `local`；跨主机共享可用 local + NFS 参数或第三方驱动' },
        { flag: '-o type=nfs', desc: 'local 驱动的选项：声明使用 NFS 类型' },
        { flag: '-o o=addr=192.168.1.10,rw', desc: 'NFS 挂载参数（addr 为 NFS 服务端地址）' },
        { flag: '-o device=:/data/nfs', desc: 'NFS 服务端导出的路径' },
        { flag: '--label env=prod', desc: '给卷打标签，便于按标签批量清理' }
      ],
      examples: [
        { cmd: 'docker volume create mysqldata', desc: '创建一个具名卷' },
        { cmd: 'docker run -d --name mysql8 -e MYSQL_ROOT_PASSWORD=Root@1234 -v mysqldata:/var/lib/mysql mysql:8.0', desc: '把 MySQL 数据放进具名卷' },
        { cmd: 'docker volume create -d local -o type=nfs -o o=addr=192.168.1.10,rw -o device=:/data/nfs appdata', desc: '用 NFS 共享存储做卷，多台 ECS 共享同一份数据' }
      ],
      notes: [
        '具名卷的生命周期独立于容器：`docker rm -v` 删的是匿名卷，具名卷必须显式 `docker volume rm` 或用 `docker volume prune` 清理',
        '空的具名卷第一次挂到容器时，Docker 会把镜像里该目录的**原内容复制进卷**（bind mount 不会）；卷非空时不会被覆盖，这也是"改了初始化配置没生效"的原因之一',
        'NFS 卷在宿主机挂载异常时容器会起不来，建议加 `soft` 与超时参数，避免网络存储卡死拖垮业务',
        '生产上数据库数据更推荐用云硬盘（EVS）/SFS 托管的 PVC（CCE 场景），单机卷的可靠性受限于这台 ECS'
      ],
      related: ['dk-volume-ls', 'dk-volume-inspect', 'dk-volume-vs-bind', 'dk-run', 'dk-volume-rm'],
      docs: 'https://docs.docker.com/reference/cli/docker/volume/create/',
      tags: ['数据卷', '持久化', 'NFS']
    },

    /* ---------- 37 / 56 ---------- */
    {
      id: 'dk-volume-ls',
      name: 'docker volume ls',
      alias: ['docker volume list', '卷列表'],
      level: 1,
      syntax: 'docker volume ls [选项]',
      summary: '列出所有数据卷，找出没被使用的卷来释放空间。',
      desc: '`DRIVER` 列通常是 `local`，`VOLUME NAME` 是具名卷名或匿名卷的 64 位哈希。配合 `-f dangling=true` 能筛出"没有任何容器引用"的卷，这类卷是可以安全清理的候选。',
      params: [
        { flag: '-f, --filter dangling=true', desc: '只显示没有容器使用的悬空卷' },
        { flag: '-f, --filter driver=local', desc: '按驱动过滤' },
        { flag: '-f, --filter label=env=prod', desc: '按标签过滤' },
        { flag: '-q, --quiet', desc: '只输出卷名，便于脚本处理' },
        { flag: '--format', desc: '自定义输出列，如 "{{.Name}} {{.Driver}}"' }
      ],
      examples: [
        { cmd: 'docker volume ls', desc: '列出全部卷' },
        { cmd: 'docker volume ls -f dangling=true', desc: '找出没有容器使用的卷' },
        { cmd: 'docker volume ls -q | wc -l', desc: '统计卷数量，数量异常增长通常是忘了清理匿名卷' }
      ],
      notes: [
        '匿名卷几乎都来自 Dockerfile 的 `VOLUME` 指令或 `-v /容器内路径` 写法，只有 `docker rm -v` 时才会跟着删',
        '`docker volume ls` 不显示卷大小和归属容器：看大小用 `docker system df -v` 或 `du -sh /var/lib/docker/volumes/*`，看归属用 `docker volume inspect`',
        '卷名带哈希不代表没用，先 `docker volume inspect` 确认它挂在哪，再决定删不删'
      ],
      related: ['dk-volume-create', 'dk-volume-inspect', 'dk-volume-rm', 'dk-volume-vs-bind', 'dk-df'],
      docs: 'https://docs.docker.com/reference/cli/docker/volume/ls/',
      tags: ['数据卷', '列表', '清理']
    },

    /* ---------- 38 / 56 ---------- */
    {
      id: 'dk-volume-inspect',
      name: 'docker volume inspect',
      alias: ['docker volume inspect 挂载点', '卷挂载点'],
      level: 2,
      syntax: 'docker volume inspect [选项] <卷名> [卷名...]',
      summary: '查看卷在宿主机上的真实挂载点，定位数据文件在哪里。',
      desc: '输出里的 `Mountpoint` 就是数据在宿主机上的路径（默认 `/var/lib/docker/volumes/<卷名>/_data`），备份、迁移、统计占用都从这里入手。用 NFS 等驱动时 `Options` 段会显示挂载参数。',
      params: [
        { flag: '-f, --format "{{.Mountpoint}}"', desc: '只取宿主机路径，方便接其他命令' }
      ],
      examples: [
        { cmd: 'docker volume inspect mysqldata', desc: '看卷的挂载点、驱动与选项' },
        { cmd: 'du -sh $(docker volume inspect -f "{{.Mountpoint}}" mysqldata)', desc: '看这个卷实际占了多少磁盘' },
        { cmd: 'docker run --rm -v mysqldata:/data -v $(pwd):/backup alpine tar czf /backup/mysqldata.tgz -C /data .', desc: '用临时容器把卷打包备份到当前目录' }
      ],
      notes: [
        '不要直接在 `Mountpoint` 下改文件：Docker 不感知外部改动，容器可能正在写，容易造成数据损坏',
        '备份有状态服务最稳的方式是服务自带工具（如 `mysqldump`），文件级打包要在停写或快照条件下做',
        '查不到 `Mountpoint` 说明卷名写错或卷不存在，匿名卷名很长，用 `docker volume ls` 复制完整名字',
        '卷的 Mountpoint 通常在 `/var/lib/docker` 所在分区，空间告警时要看那块的容量而不是 `/data`'
      ],
      related: ['dk-volume-ls', 'dk-volume-create', 'dk-volume-vs-bind', 'dk-df', 'dk-volume-rm'],
      docs: 'https://docs.docker.com/reference/cli/docker/volume/inspect/',
      tags: ['数据卷', '挂载点', '备份']
    },

    /* ---------- 39 / 56 ---------- */
    {
      id: 'dk-volume-rm',
      name: 'docker volume rm / prune',
      alias: ['docker volume prune', 'docker volume rm', '删除数据卷'],
      level: 2,
      syntax: 'docker volume rm <卷名...> / docker volume prune [选项]',
      summary: '删除数据卷；prune 会清掉所有没被容器使用的卷，务必谨慎。',
      desc: '`docker rm` 删容器**不会**删数据卷，卷会一直占着 `/var/lib/docker`，这是"磁盘越来越满"的常见原因。`prune` 是批量清理手段，但它删的是"所有未被任何容器使用的卷"——包括你特意留着做备份或回滚的那一份。',
      params: [
        { flag: '-f, --force', desc: 'rm 专用：强制删除（卷正被容器使用时通常仍会失败）' },
        { flag: '-a, --all', desc: 'prune 专用：删除所有未被使用的卷，不限于匿名卷' },
        { flag: '--filter label=env=dev', desc: 'prune 专用：按标签筛选要清理的卷' },
        { flag: '-f, --force', desc: 'prune 专用：跳过确认提示' }
      ],
      examples: [
        { cmd: 'docker volume rm mysqldata', desc: '删除指定卷（使用它的容器必须先停掉并删除）' },
        { cmd: 'docker volume prune -f', desc: '清理所有未使用的卷（不可恢复）' },
        { cmd: 'docker volume prune -f --filter label=env=dev', desc: '只清理带 env=dev 标签的卷，降低误删风险' }
      ],
      notes: [
        '**`docker volume prune` 会删除所有没被容器使用的卷，数据库数据一旦删掉无法恢复**；执行前先 `docker volume ls -f dangling=true` 列出清单逐个确认',
        '卷被容器使用时删不掉（`volume is in use`），要先 `docker rm -f` 容器；但容器一删，卷就变成"未使用"，下次 prune 会顺手清掉它',
        '重要数据要定期备份到 OBS（`obsutil cp`）或用 CCE + EVS/SFS 的 PVC 托管，不要依赖单机卷',
        '误删后的补救很有限：文件系统层面还能尝试 `extundelete` 之类工具，但成功率低，预防（打标签 + 定期备份）才是正解'
      ],
      related: ['dk-volume-ls', 'dk-volume-create', 'dk-rm', 'dk-system-prune', 'dk-df'],
      docs: 'https://docs.docker.com/reference/cli/docker/volume/rm/',
      tags: ['删除', '数据卷', '危险']
    },

    /* ---------- 40 / 56 ---------- */
    {
      id: 'dk-volume-vs-bind',
      name: 'volume、bind mount 与 tmpfs 对比',
      kind: 'recipe',
      alias: ['bind mount', 'tmpfs', '-v 与 --mount 区别', '挂载方式对比'],
      level: 2,
      syntax: 'docker run -v <宿主机路径>:<容器路径> ... / docker run --mount type=volume|bind|tmpfs,...',
      summary: '三种挂载方式的能力对比与选型，选错了会丢数据。',
      desc: '**bind mount**：把宿主机指定目录映射进容器，路径由你管，适合配置文件、代码、静态资源、需要直接看到的日志；**volume**：由 Docker 管理，落在 `/var/lib/docker/volumes/`，可跨容器共享、可备份、性能好，是数据库数据的首选；**tmpfs**：只存在于内存，容器停止即消失，适合敏感临时文件（token、socket）。新式 `--mount` 语法语义更明确且支持 `readonly`，脚本里推荐用它；`-v` 更短，交互式敲命令更快。',
      params: [
        { flag: '-v /data/www:/usr/share/nginx/html', desc: 'bind mount：宿主目录不存在会被自动建为空目录（root 属主），容易踩权限坑' },
        { flag: '-v mysqldata:/var/lib/mysql', desc: 'volume：具名卷，首次挂载空卷时会复制镜像内原目录内容' },
        { flag: '--mount type=bind,src=/data/www,dst=/usr/share/nginx/html,readonly', desc: '新式 bind 语法，支持 readonly，语义清晰' },
        { flag: '--mount type=volume,src=mysqldata,dst=/var/lib/mysql', desc: '与 `-v mysqldata:/var/lib/mysql` 等价' },
        { flag: '--mount type=tmpfs,dst=/run/secrets,tmpfs-size=64m', desc: '内存文件系统，容器停止数据即丢，只支持 Linux' }
      ],
      examples: [
        { cmd: 'docker run -d --name web -v /data/www:/usr/share/nginx/html:ro -p 80:80 nginx:1.25', desc: 'bind mount 发布静态站点并设为只读' },
        { cmd: 'docker run -d --name mysql8 -v mysqldata:/var/lib/mysql -e MYSQL_ROOT_PASSWORD=Root@1234 mysql:8.0', desc: 'volume 存数据库数据，生命周期独立于容器' },
        { cmd: 'docker run -d --name app --mount type=bind,src=/data/app/conf,dst=/app/conf,readonly web:1.0.0', desc: '用 --mount 挂配置目录并设为只读' }
      ],
      notes: [
        '**`-v /宿主机目录:/容器目录` 时宿主机目录会遮住容器内原有内容**：挂一个空目录上去，镜像里那份默认配置就"看不见"了（没被删，是被覆盖）。所以挂配置文件前必须先在宿主机准备好文件；想保留镜像里的原内容就别挂那个目录',
        'bind mount 的宿主机路径不存在时 Docker 会自动创建一个**空目录**（属主 root:root），很多"挂载后服务起不来"都是这里的属主/权限问题；CentOS 上还要注意 SELinux 需要 `:z`/`:Z` 标签',
        '需要持久化的生产数据优先 volume：可 `docker volume inspect` 定位、可用驱动接 NFS、可 `--volumes-from` 复用、`docker volume prune` 时还能按标签保护',
        'Windows/macOS 上 bind mount 走文件共享层，IO 性能明显差，数据库类负载务必跑在 Linux（华为云 ECS）上',
        '`tmpfs` 只支持 Linux，容器重启数据即丢，别拿它放需要持久化的东西；它的价值是"敏感数据不落盘"',
        '一个容器可以同时挂多种类型：配置用 bind mount 只读、数据用 volume、临时密钥用 tmpfs，这是常见组合'
      ],
      related: ['dk-run', 'dk-volume-create', 'dk-volume-inspect', 'dk-cp', 'dk-troubleshoot-restart'],
      docs: 'https://docs.docker.com/engine/storage/volumes/',
      tags: ['挂载', '数据卷', 'bind mount', 'tmpfs']
    },

    /* ---------- 41 / 56 ---------- */
    {
      id: 'dk-system-prune',
      name: 'docker system prune',
      alias: ['docker container prune', 'docker system prune -a', 'docker builder prune'],
      level: 2,
      syntax: 'docker system prune [选项] / docker container prune [选项]',
      summary: '一键清理已停止容器、悬空镜像与无用网络，-a 会连镜像一起删。',
      desc: '不带参数时清理：所有已停止容器、所有未被使用的网络、所有悬空（dangling）镜像、构建缓存。加 `-a` 会扩大到"所有没有被运行中容器使用的镜像"，包括本地构建的版本和回滚用的旧镜像。只想清垃圾就用 `docker container prune`，范围最小最安全。',
      params: [
        { flag: '-a, --all', desc: '连未被使用的镜像一起删（危险，见 notes）' },
        { flag: '-f, --force', desc: '跳过交互确认，脚本里用' },
        { flag: '--volumes', desc: '同时删除未使用的数据卷（**默认不删卷**，加了才删）' },
        { flag: '--filter until=24h', desc: '只清理创建超过指定时长的对象' },
        { flag: '--filter label!=keep', desc: '保留带指定标签的对象（给重要资源打 keep 标签可防误删）' }
      ],
      examples: [
        { cmd: 'docker container prune -f', desc: '只清理已停止容器（最安全的一档）' },
        { cmd: 'docker system prune', desc: '清停止容器、悬空镜像、无用网络与构建缓存（会弹确认）' },
        { cmd: 'docker system prune -a --volumes', desc: '彻底清理（危险：未使用镜像与卷全部删除）' },
        { cmd: 'docker builder prune -f --filter until=168h', desc: '只清 7 天前的构建缓存，保留近期加速效果' }
      ],
      notes: [
        '**`docker system prune -a` 会删掉所有未被容器使用的镜像**，包括本地构建还没部署的版本、回滚用的旧镜像、还没 `docker save` 导出的镜像；生产环境执行前先 `docker system df` 看清将释放多少',
        '`--volumes` 会连未使用的数据卷一起删，**数据库数据删了无法恢复**；不加这个参数时卷是安全的',
        '要保守就到 `docker container prune` 这一档：只删已停止的容器，收益已经不小',
        '清理构建缓存会拖慢下一次构建，CI 机器上保留缓存反而更快，别习惯性加 `-a`',
        '排查中的已退出容器先 `docker logs <容器> > 现场.log` 留存再清，删掉的容器无法恢复'
      ],
      related: ['dk-prune-image', 'dk-rm', 'dk-rmi', 'dk-volume-rm', 'dk-df', 'dk-container-logs-size'],
      docs: 'https://docs.docker.com/reference/cli/docker/system/prune/',
      tags: ['清理', '磁盘', '危险']
    },

    /* ================= F. Docker Compose ================= */

    /* ---------- 42 / 56 ---------- */
    {
      id: 'dk-compose-up',
      name: 'docker compose up',
      alias: ['docker-compose up', 'docker compose up -d', 'docker compose build'],
      level: 2,
      syntax: 'docker compose up [选项] [服务名...]',
      summary: '按 compose 文件创建并启动整套服务，日常最常用的编排命令。',
      desc: '默认前台运行并聚合所有服务的日志（`Ctrl+C` 停全部）；生产一律加 `-d` 后台运行。它会自动创建 `<项目名>_default` 网络，容器之间用**服务名**互访。改了 Dockerfile 或代码要加 `--build` 才会重新构建镜像；改了 compose 文件里无法热更新的配置（端口、卷、环境变量、command）需要 `--force-recreate` 重建容器。',
      params: [
        { flag: '-d, --detach', desc: '后台运行，生产必加' },
        { flag: '--build', desc: '启动前重新构建镜像，等价于先执行 `docker compose build`' },
        { flag: '--force-recreate', desc: '即使配置没变也重建容器，排"改了配置没生效"时用' },
        { flag: '-f docker-compose.yml', desc: '指定 compose 文件，可多次指定实现覆盖合并（后面的覆盖前面的）' },
        { flag: '--env-file .env', desc: '指定环境变量文件，供文件里的 `${VAR}` 插值' },
        { flag: '--remove-orphans', desc: '删掉 compose 文件里已不存在的服务的旧容器' },
        { flag: '-V, --renew-anon-volumes', desc: '重建匿名卷（默认复用旧卷，加了会新建，数据会丢）' },
        { flag: '--scale web=3', desc: '指定服务副本数；与 `container_name` 冲突，不能同用' },
        { flag: '--no-deps', desc: '只启动指定服务，不连带启动它依赖的服务' }
      ],
      examples: [
        { cmd: 'docker compose up -d', desc: '后台启动全部服务' },
        { cmd: 'docker compose up -d --build web', desc: '重建 web 服务镜像并启动它（依赖服务也会一起起来）' },
        { cmd: 'docker compose up -d --force-recreate --remove-orphans', desc: '强制重建所有容器并清理孤儿容器，改配置后常用' },
        { cmd: 'docker compose build --no-cache web', desc: '只构建 web 服务镜像且不用缓存' },
        { cmd: 'docker compose up -d --scale web=3 --no-deps web', desc: '把 web 扩到 3 个副本（不能写 container_name）' }
      ],
      notes: [
        '`docker compose up` 与 `docker run` 的区别：网络、环境变量、依赖顺序、端口都由文件描述，可版本化、可复现；手工 `docker run` 的容器不在 compose 管理范围内，两者混用很容易出现"容器名冲突"',
        '`--force-recreate` 会重建容器，**可写层里没落盘的改动会丢失**，数据必须放在卷或 bind mount 上',
        '`-V/--renew-anon-volumes` 会重建匿名卷，数据库数据会清空，只在确实想"从零开始"时使用',
        '端口冲突报 `port is already allocated` 时先 `ss -lntp | grep <端口>` 找占用进程，可能是上一次没停干净的同名容器',
        '改了 `.env` 或 compose 文件里的 `${VAR}`，必须重新 `up -d`（必要时 `--force-recreate`）才生效，光 `restart` 不会重读文件',
        '生产上把 compose 文件放进 Git 管理，变更走评审；本机调试用 `-f` 叠加 override 文件，别直接改生产文件'
      ],
      related: ['dk-compose-down', 'dk-compose-ps', 'dk-compose-logs', 'dk-compose-config', 'dk-compose-exec', 'dk-compose-yml'],
      docs: 'https://docs.docker.com/reference/cli/docker/compose/up/',
      tags: ['Compose', '编排', '启动']
    },

    /* ---------- 43 / 56 ---------- */
    {
      id: 'dk-compose-down',
      name: 'docker compose down',
      alias: ['docker-compose down', 'docker compose down -v'],
      level: 2,
      syntax: 'docker compose down [选项]',
      summary: '停止并删除 compose 项目的全部容器与网络，默认保留数据卷。',
      desc: '反向操作：停容器 → 删容器 → 删项目网络。**默认不删数据卷**，所以数据库数据是安全的；要连数据一起清必须显式加 `-v`。只想停不想删，用 `docker compose stop`（容器与可写层都保留，随时能 start 回来）。',
      params: [
        { flag: '-v, --volumes', desc: '同时删除 compose 文件里声明的具名卷与匿名卷（数据全丢）' },
        { flag: '--rmi local', desc: '同时删除本项目构建出的镜像（`all` 会连拉取的基础镜像一起删）' },
        { flag: '--remove-orphans', desc: '删掉不属于本 compose 文件的孤儿容器' },
        { flag: '-t, --timeout 60', desc: '关闭前的等待秒数，默认 10' }
      ],
      examples: [
        { cmd: 'docker compose down', desc: '停掉并删除项目容器与网络，保留数据卷' },
        { cmd: 'docker compose down -v', desc: '连数据卷一起删（危险：数据库数据会清空）' },
        { cmd: 'docker compose down --rmi local --remove-orphans', desc: '清理容器、网络、本项目镜像与孤儿容器' },
        { cmd: 'docker compose stop', desc: '只停止不删除，改天还能 start 回来' }
      ],
      notes: [
        '**`docker compose down -v` 会删除 compose 文件里定义的具名卷**，MySQL 等数据库的数据一并消失；执行前用 `docker volume ls` 确认卷名，并确认已有备份',
        '生产环境优先用 `docker compose stop`（或只 down 单个服务），避免误删；确实要清理再 down',
        '`down` 之后 `up -d` 会重新创建容器，容器内未持久化的改动全部丢失（配置文件改了没挂载出来就白改了）',
        '项目名默认取当前目录名，在不同目录执行操作的是不同项目；先 `docker compose ls` 确认项目名再动手',
        '`down` 不会删除用 `docker run` 手工起的、但恰好加入了同一网络的容器'
      ],
      related: ['dk-compose-up', 'dk-compose-ps', 'dk-volume-rm', 'dk-system-prune'],
      docs: 'https://docs.docker.com/reference/cli/docker/compose/down/',
      tags: ['Compose', '停止', '删除']
    },

    /* ---------- 44 / 56 ---------- */
    {
      id: 'dk-compose-ps',
      name: 'docker compose ps',
      alias: ['docker-compose ps', 'compose 状态'],
      level: 1,
      syntax: 'docker compose ps [选项] [服务名...]',
      summary: '查看 compose 项目里各服务的容器状态与端口，比 docker ps 更聚焦。',
      desc: '只列当前项目下的容器，输出包含服务名、状态、端口映射。加 `-a` 能看到已退出的容器（排查"服务起了一半"很有用），`--format json` 适合脚本或 jq 处理。',
      params: [
        { flag: '-a, --all', desc: '包含已停止的容器' },
        { flag: '--format json', desc: '以 JSON 输出（也支持 table），方便脚本解析' },
        { flag: '-q, --quiet', desc: '只输出容器 ID' },
        { flag: '--services', desc: '只列出服务名' },
        { flag: '--status running', desc: '按状态过滤：running / exited / paused 等' }
      ],
      examples: [
        { cmd: 'docker compose ps', desc: '看当前项目各服务容器状态' },
        { cmd: 'docker compose ps -a', desc: '包含已退出的容器，排查启动失败的服务' },
        { cmd: 'docker compose ps --format json', desc: 'JSON 输出，配合 jq 做巡检脚本' },
        { cmd: 'docker compose ps --services', desc: '只列服务名，确认服务名没写错' }
      ],
      notes: [
        '在哪个目录执行就管哪个项目，换个目录执行会返回空或报错，先确认当前目录或显式加 `-f`',
        '`docker compose ps` 只显示本项目容器；要看整机用 `docker ps -a`，两者对不上时检查是否有同名项目跑在不同路径下',
        '状态显示 `Up (unhealthy)` 说明容器进程在但健康检查没过，业务可能已经不可用，别只看 `Up` 就以为正常'
      ],
      related: ['dk-compose-up', 'dk-compose-logs', 'dk-compose-exec', 'dk-ps'],
      docs: 'https://docs.docker.com/reference/cli/docker/compose/ps/',
      tags: ['Compose', '状态', '查看']
    },

    /* ---------- 45 / 56 ---------- */
    {
      id: 'dk-compose-logs',
      name: 'docker compose logs',
      alias: ['docker-compose logs', 'compose 日志'],
      level: 1,
      syntax: 'docker compose logs [选项] [服务名...]',
      summary: '聚合查看 compose 多个服务的日志，不用逐个容器去看。',
      desc: '不指定服务名时按服务名加彩色前缀输出所有服务日志，适合观察启动顺序与依赖问题；指定服务名则只看该服务。日志来源与 `docker logs` 一致，都是容器主进程的 stdout/stderr。',
      params: [
        { flag: '-f, --follow', desc: '持续跟踪输出' },
        { flag: '--tail 100', desc: '每个服务只显示最后 n 行；与 `-f` 连用时必须先加' },
        { flag: '--since 30m', desc: '从指定时间开始（也支持 `--until` 指定截止时间）' },
        { flag: '-t, --timestamps', desc: '显示时间戳（UTC 时区）' },
        { flag: '--no-log-prefix', desc: '不显示服务名前缀，便于管道过滤' },
        { flag: '--no-color', desc: '关闭颜色码，适合重定向到文件' }
      ],
      examples: [
        { cmd: 'docker compose logs --tail 100 -f web', desc: '只看 web 服务并实时跟踪' },
        { cmd: 'docker compose logs --tail 50 --no-color > compose.log', desc: '导出全服务日志到文件（去掉颜色控制码）' },
        { cmd: 'docker compose logs --since 5m db', desc: '看数据库服务最近 5 分钟日志' }
      ],
      notes: [
        '不指定服务名时多服务日志交错输出、顺序不保证，查具体问题要指定服务名',
        '`--tail` 不加就和 `-f` 一起把历史全量刷出来，几万行能把终端卡死',
        'compose 日志同样受容器日志驱动限制，日志暴涨会撑满 `/var/lib/docker`，要在 daemon.json 里配 `max-size`/`max-file`',
        '容器重建后日志重新开始，历史日志靠 `--since` 也找不回来，重要日志要投递到 LTS/ELK'
      ],
      related: ['dk-compose-ps', 'dk-compose-exec', 'dk-logs', 'dk-container-logs-size'],
      docs: 'https://docs.docker.com/reference/cli/docker/compose/logs/',
      tags: ['Compose', '日志', '排障']
    },

    /* ---------- 46 / 56 ---------- */
    {
      id: 'dk-compose-exec',
      name: 'docker compose exec',
      alias: ['docker-compose exec', 'compose 进容器'],
      level: 2,
      syntax: 'docker compose exec [选项] <服务名> <命令> [参数...]',
      summary: '在 compose 服务的容器里执行命令，不用先查容器名。',
      desc: '相当于 `docker exec` + 自动定位服务容器，用服务名就能进。**它默认就分配 TTY 并进入交互模式**，所以不像 `docker exec` 那样必须写 `-it`；脚本里要关掉 TTY 用 `-T`。服务有多个副本时用 `--index` 指定进哪一个。它不会新建容器（那是 `docker compose run`）。',
      params: [
        { flag: '-T, --no-tty', desc: '关闭伪终端分配（默认分配），脚本/管道里用' },
        { flag: '-u root', desc: '以指定用户执行' },
        { flag: '-w /app', desc: '指定工作目录' },
        { flag: '-e KEY=值', desc: '为本次执行注入环境变量' },
        { flag: '--index 2', desc: '服务有多个副本时，指定进入第几个容器' },
        { flag: '-d, --detach', desc: '后台执行命令，不占终端' },
        { flag: '--privileged', desc: '以特权模式执行，风险较高' }
      ],
      examples: [
        { cmd: 'docker compose exec web bash', desc: '进入 web 服务的容器（compose 默认已分配 TTY）' },
        { cmd: 'docker compose exec db mysql -uroot -p', desc: '直接在 db 服务里连 MySQL 客户端' },
        { cmd: 'docker compose exec -T web sh -c "nginx -t"', desc: '脚本里执行命令并关闭 TTY' },
        { cmd: 'docker compose exec -u root -w /app app java -version', desc: '以 root 身份在容器 /app 目录下执行命令' }
      ],
      notes: [
        '`docker compose exec` 默认分配 TTY 且进入交互模式，不需要写 `-it`；反之在 CI 或管道里必须加 `-T`，否则会报 `the input device is not a TTY`',
        '目标容器必须处于运行状态，服务停了要 `docker compose up -d <服务名>` 先把容器拉起来',
        '`exec` 与 `run` 的区别：`exec` 在已有容器里执行，`run` 会新建一个一次性容器（依赖与卷按服务定义创建，适合跑迁移脚本）',
        '在容器里装的工具、改的文件在重建容器后消失，正式改动要回写到镜像或挂载目录'
      ],
      related: ['dk-compose-ps', 'dk-compose-logs', 'dk-exec', 'dk-compose-up'],
      docs: 'https://docs.docker.com/reference/cli/docker/compose/exec/',
      tags: ['Compose', '交互', '排障']
    },

    /* ---------- 47 / 56 ---------- */
    {
      id: 'dk-compose-config',
      name: 'docker compose config',
      alias: ['docker-compose config', 'compose 校验'],
      level: 2,
      syntax: 'docker compose config [选项]',
      summary: '校验 compose 文件语法并渲染出最终生效的完整配置。',
      desc: '排错神器：它会把 `.env` 变量、多个 `-f` 覆盖文件、`extends`、默认值全部合并展开，输出最终真正生效的 YAML。服务起不来先跑它——变量没替换、缩进写错、服务名对不上这类问题在这里一眼可见。',
      params: [
        { flag: '-q, --quiet', desc: '只校验不输出内容，退出码为 0 表示配置合法（可写进 CI）' },
        { flag: '--services', desc: '只列出最终的服务名清单' },
        { flag: '--volumes', desc: '只列出卷名清单' },
        { flag: '--format json', desc: '以 JSON 输出，便于程序处理' },
        { flag: '--no-interpolate', desc: '不做变量插值，只看原始结构' },
        { flag: '--profiles', desc: '列出 profiles' }
      ],
      examples: [
        { cmd: 'docker compose config', desc: '渲染最终配置，逐项核对变量、端口与卷' },
        { cmd: 'docker compose config -q && echo "配置合法"', desc: '只做校验，CI 或提交前检查用' },
        { cmd: 'docker compose -f docker-compose.yml -f docker-compose.prod.yml config', desc: '看多文件覆盖合并后的最终结果' }
      ],
      notes: [
        '`config` 会把 `.env` 里的真实取值展开输出，**里面可能有密码**，别把输出直接贴到工单、聊天记录或 Git 里',
        '多文件覆盖时后面的覆盖前面的，合并结果容易和直觉不一致，改生产配置前先 `config` 确认',
        '`config` 通过只代表语法与变量没问题，端口占用、镜像拉不到、卷权限这些运行期问题它查不出来'
      ],
      related: ['dk-compose-up', 'dk-compose-yml', 'dk-compose-ps', 'dk-daemon-json'],
      docs: 'https://docs.docker.com/reference/cli/docker/compose/config/',
      tags: ['Compose', '校验', '排错']
    },

    /* ---------- 48 / 56 ---------- */
    {
      id: 'dk-compose-yml',
      name: 'compose.yaml 关键字段',
      kind: 'recipe',
      alias: ['docker-compose.yml', 'compose file', 'depends_on', 'healthcheck'],
      level: 2,
      syntax: 'services: <服务名>: { image|build, ports, volumes, environment, ... }（这是文件格式，不是命令）',
      summary: 'compose 文件核心字段速查：服务、端口、卷、依赖与健康检查。',
      desc: 'Compose V2 使用 `compose.yaml`（也兼容 `docker-compose.yml`），顶层是 `services`，下面逐一定义服务。字段与 `docker run` 参数基本一一对应：`ports` ↔ `-p`、`volumes` ↔ `-v`、`environment` ↔ `-e`、`restart` ↔ `--restart`。写好后用 `docker compose config` 校验，再 `docker compose up -d` 启动。',
      params: [
        { flag: 'image: nginx:1.25', desc: '使用现成镜像；与 build 二选一（同时写则以 build 为准）' },
        { flag: 'build: .', desc: '从 Dockerfile 构建，可展开为 {context, dockerfile, args, target}' },
        { flag: 'ports: ["8080:80"]', desc: '端口映射，必须加引号（`80:80` 不加引号会被 YAML 当六十进制数字）' },
        { flag: 'volumes: ["mysqldata:/var/lib/mysql", "./conf:/app/conf:ro"]', desc: '具名卷与 bind mount，同样要加引号' },
        { flag: 'environment: [TZ=Asia/Shanghai]', desc: '环境变量，列表或 map 形式皆可；也可用 `env_file: .env`' },
        { flag: 'depends_on: {db: {condition: service_healthy}}', desc: '启动顺序；只有配合 healthcheck 才是"等就绪"' },
        { flag: 'healthcheck: {test: ["CMD","curl","-fsS","http://localhost/"], interval: 30s, retries: 3}', desc: '健康检查，供 depends_on 的条件与编排平台使用' },
        { flag: 'restart: unless-stopped', desc: '重启策略，取值与 `docker run --restart` 相同' }
      ],
      examples: [
        { cmd: 'image: swr.cn-north-4.myhuaweicloud.com/myorg/web:1.0.0', desc: '直接用 SWR 里的镜像（与 CCE 使用同一份制品）' },
        { cmd: 'ports: ["80:80"]', desc: '端口映射必须加引号，否则 YAML 解析结果不是你想的端口' },
        { cmd: 'depends_on: {db: {condition: service_healthy}}', desc: '等数据库健康后再启动应用，比默认的"先启动"靠谱' },
        { cmd: 'restart: unless-stopped', desc: '异常退出自动重启，手动 stop 后不再拉起' },
        { cmd: 'deploy: {resources: {limits: {cpus: "1.5", memory: 1G}}}', desc: '资源限制，等价于 `docker run --cpus --memory`' }
      ],
      notes: [
        '`depends_on` 默认只保证"先启动"，**不保证"已就绪"**；要让应用等到数据库真正可用，必须配 `healthcheck` + `condition: service_healthy`，否则应用启动时连不上库会直接退出',
        '`ports`/`volumes` 里的 `80:80`、`3306:3306` 不加引号在 YAML 里可能被解析成六十进制整数（`80:80` = 4880），报出莫名其妙的端口错误，**统一加引号**最省事',
        '`environment` 用 map 形式时 `true`/`false`/数字会被 YAML 转成非字符串类型，某些镜像会报类型错误，必要时加引号',
        '顶层还有 `networks`、`volumes`、`configs`、`secrets`；服务级还有 `command`/`entrypoint`/`user`/`working_dir`/`logging`/`ulimits`，含义与 `docker run` 同名参数一致',
        '`version:` 顶层字段在 Compose V2 已废弃，写了会告警，直接省略即可',
        '`container_name` 会让服务无法横向扩容（与 `--scale` 冲突），生产环境尽量依赖 compose 的默认命名'
      ],
      related: ['dk-compose-up', 'dk-compose-config', 'dk-compose-down', 'dk-run'],
      docs: 'https://docs.docker.com/reference/compose-file/',
      tags: ['Compose', '配置文件', '速查']
    },

    /* ================= G. 系统信息与清理 ================= */

    /* ---------- 49 / 56 ---------- */
    {
      id: 'dk-info',
      name: 'docker info',
      alias: ['docker version', 'docker system info', '镜像加速配置'],
      level: 1,
      syntax: 'docker info [选项]',
      summary: '查看 Docker 运行环境：存储驱动、cgroup 版本、镜像加速与数据目录。',
      desc: '排"Docker 到底怎么配的"必看：`Storage Driver`（正常是 overlay2）、`Cgroup Version`（v1/v2 影响资源限制写法）、`Registry Mirrors`（镜像加速是否生效）、`Docker Root Dir`（默认 `/var/lib/docker`，磁盘告警要看它所在分区）、`Total Memory`/`CPUs`。要看客户端与服务端版本用 `docker version`。',
      params: [
        { flag: '-f, --format "{{.Driver}}"', desc: '取单个字段：`{{.Driver}}`、`{{.CgroupVersion}}`、`{{.DockerRootDir}}`、`{{.MemTotal}}`' },
        { flag: '--format "{{json .}}"', desc: '整体输出 JSON，配合 jq 做巡检'
        }
      ],
      examples: [
        { cmd: 'docker info', desc: '查看完整运行环境信息' },
        { cmd: 'docker info --format "{{.DockerRootDir}} {{.Driver}} cgroup{{.CgroupVersion}}"', desc: '取关键字段，巡检脚本里用' },
        { cmd: 'docker version', desc: '分别查看 Client 与 Server 版本，版本不匹配会出现参数不支持' },
        { cmd: 'docker info | grep -A5 "Registry Mirrors"', desc: '确认镜像加速地址是否生效' }
      ],
      notes: [
        '`Registry Mirrors` 为空说明没配镜像加速，拉 Docker Hub 镜像会很慢；在 `/etc/docker/daemon.json` 配好后 `systemctl restart docker` 生效',
        '`Cgroup Version: 2` 与 `1` 在资源限制参数上行为有差异（如 v2 下更严格的 CPU/内存约束），CentOS 7 多为 v1，Ubuntu 22.04+/openEuler 多为 v2',
        '出现 `WARNING: No swap limit support` 说明内核未开启 swap 记账，`--memory-swap` 会失效，需要在内核启动参数加 `cgroup_enable=memory swapaccount=1` 后重启',
        '`docker version` 报 `Cannot connect to the Docker daemon` 说明客户端在但 daemon 没跑，用 `systemctl status docker` 与 `journalctl -u docker -n 50` 查原因'
      ],
      related: ['dk-df', 'dk-daemon-json', 'dk-pull', 'dk-container-logs-size'],
      docs: 'https://docs.docker.com/reference/cli/docker/system/info/',
      tags: ['环境', '存储驱动', 'cgroup', '镜像加速']
    },

    /* ---------- 50 / 56 ---------- */
    {
      id: 'dk-df',
      name: 'docker system df',
      alias: ['docker df', 'docker system df -v', 'Docker 磁盘占用'],
      level: 2,
      syntax: 'docker system df [选项]',
      summary: '统计镜像、容器、卷、构建缓存各占多少磁盘，清理前先看它。',
      desc: '输出 TYPE / TOTAL / ACTIVE / SIZE / RECLAIMABLE 五列，`RECLAIMABLE` 表示"删掉不用的对象后能收回多少"，是清理决策的第一手依据。加 `-v` 展开到每个镜像、容器、卷的明细，直接定位是谁撑满了磁盘。',
      params: [
        { flag: '-v, --verbose', desc: '显示明细：每个镜像/容器/卷各自占用多少' },
        { flag: '--format', desc: '自定义输出列，便于脚本处理' }
      ],
      examples: [
        { cmd: 'docker system df', desc: '看总览，判断该清哪一类' },
        { cmd: 'docker system df -v', desc: '看明细，找出最大的镜像或卷' },
        { cmd: 'du -sh /var/lib/docker/* | sort -hr | head', desc: '宿主机侧核对：哪个子目录在涨（containers 目录多为日志）' }
      ],
      notes: [
        '**"镜像删了磁盘没释放"的三大原因**：① 还有容器（含已停止的）引用该镜像；② 只删了标签，其他标签仍指向同一个镜像 ID；③ 占空间的根本不是镜像而是容器日志或数据卷。分别用 `docker ps -a`、`docker images`、`du -sh /var/lib/docker/containers` 核对',
        '`docker system df` 显示占用很小但 `df -h` 显示分区满，通常是**已删除但仍被进程持有的文件**（日志类），用 `lsof +L1` 找出并重启对应容器即可释放',
        '`RECLAIMABLE` 里的 Build Cache 在 CI 机器上往往很大，可以用 `docker builder prune` 单独清理，不必 `-a` 全清',
        'Docker 数据目录默认在 `/var/lib/docker`（系统盘），生产应该在装机时就把数据盘挂到这里或改 `data-root`'
      ],
      related: ['dk-images', 'dk-volume-ls', 'dk-system-prune', 'dk-container-logs-size', 'dk-info'],
      docs: 'https://docs.docker.com/reference/cli/docker/system/df/',
      tags: ['磁盘', '统计', '清理']
    },

    /* ---------- 51 / 56 ---------- */
    {
      id: 'dk-container-logs-size',
      name: '容器日志占满磁盘的处理（--log-opt）',
      kind: 'recipe',
      alias: ['--log-opt max-size', 'json-file 日志', 'daemon.json log-opts'],
      level: 2,
      syntax: 'docker run --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 <镜像>',
      summary: '限制容器日志文件的大小与数量，避免日志把磁盘写满。',
      desc: '默认日志驱动 `json-file` **不限大小**，全写在 `/var/lib/docker/containers/<容器ID>/<容器ID>-json.log`，流量大的服务一天能写几十 GB。两个办法：单个容器用 `--log-opt` 限制；全局默认写进 `/etc/docker/daemon.json` 的 `log-opts`（对**新建**容器生效）。也可以用 `local` 驱动，它天生自动轮转、更省空间。',
      params: [
        { flag: '--log-driver json-file', desc: '日志驱动，默认值；换成 `local` 可获得更省空间的自动轮转' },
        { flag: '--log-opt max-size=10m', desc: '单个日志文件大小上限，超过即轮转' },
        { flag: '--log-opt max-file=3', desc: '最多保留几个轮转文件，总占用约等于 max-size × max-file' },
        { flag: '--log-driver local --log-opt max-file=3', desc: 'local 驱动用 max-file 控制总量（不需要 max-size）' },
        { flag: '--log-opt labels=env', desc: '把容器标签写进日志，便于按环境区分' }
      ],
      examples: [
        { cmd: 'docker run -d --name web --log-opt max-size=10m --log-opt max-file=3 -p 80:80 nginx:1.25', desc: '创建容器时就限制日志大小（最多约 30MB）' },
        { cmd: 'docker run -d --name app --log-driver local --log-opt max-file=3 web:1.0.0', desc: '改用 local 驱动，自动轮转更省空间' },
        { cmd: 'du -sh /var/lib/docker/containers/*/*-json.log | sort -hr | head -5', desc: '找出最占空间的容器日志' },
        { cmd: 'truncate -s 0 /var/lib/docker/containers/<容器ID>/<容器ID>-json.log', desc: '应急清空某个超大日志文件（用 truncate 不用 rm，rm 会导致空间不释放）' }
      ],
      notes: [
        '`daemon.json` 里的 `log-opts` **只对之后新建的容器生效**，正在运行的容器必须删掉重建（`docker rm` + `docker run`）才能应用新限制',
        '`--log-opt max-size` 仅对 `json-file`/`local` 这类文件驱动有意义；用 `journald`/`syslog` 时日志不进 `/var/lib/docker`，要改 `journald` 的 `SystemMaxUse`',
        '日志文件被 `rm` 删除但容器进程还持有句柄时，磁盘空间不会立即释放，用 `lsof +L1` 确认并重启容器；应急清理用 `truncate -s 0` 更安全',
        '生产建议双管齐下：本地文件限制大小保底，同时把日志投递到华为云 LTS 或 ELK 做长期留存与分析',
        '单个容器日志异常增长往往是应用在打调试日志，限制大小只是兜底，根治要改日志级别'
      ],
      related: ['dk-logs', 'dk-df', 'dk-daemon-json', 'dk-system-prune', 'dk-compose-logs'],
      docs: 'https://docs.docker.com/engine/logging/configure/',
      tags: ['日志', '磁盘', 'max-size']
    },

    /* ---------- 52 / 56 ---------- */
    {
      id: 'dk-prune-image',
      name: 'docker image prune',
      alias: ['docker image prune -a', '清理镜像'],
      level: 2,
      syntax: 'docker image prune [选项]',
      summary: '清理悬空镜像；加 -a 会删掉所有没被容器使用的镜像。',
      desc: '不加参数只删 `<none>` 悬空镜像（多阶段构建残留、被新构建覆盖的旧层），这部分是安全的。加 `-a` 后范围扩大到"所有没有被容器引用的镜像"，也包括你准备回滚用的旧版本和 pull 下来还没部署的镜像，是生产最容易误伤的一档。',
      params: [
        { flag: '-a, --all', desc: '删除所有未被容器使用的镜像（危险）' },
        { flag: '-f, --force', desc: '跳过交互确认' },
        { flag: '--filter until=720h', desc: '只删创建超过指定时长的镜像（720h = 30 天），比直接 -a 稳' },
        { flag: '--filter label!=keep', desc: '保留带指定标签的镜像，给重要镜像打 keep 标签可防误删' }
      ],
      examples: [
        { cmd: 'docker image prune', desc: '只清理悬空镜像（安全，日常用这一档）' },
        { cmd: 'docker image prune -a --filter until=720h', desc: '删掉 30 天内没被使用过的镜像，保留近期构建结果' },
        { cmd: 'docker image prune -a -f', desc: '全部清理（生产慎用，先确认回滚镜像还在不在）' }
      ],
      notes: [
        '**`docker image prune -a` 会删除所有未被容器使用的镜像**，包括回滚用的旧版本、刚构建还没部署的镜像；执行前用 `docker images` 与 `docker system df` 核对清单',
        '清理悬空镜像就能解决大部分"镜像占满磁盘"问题，不必加 `-a`',
        '加 `--filter until=` 是更稳妥的姿势，能保住最近构建的镜像',
        'SWR 上的镜像不受本地清理影响，需要回滚时 `docker pull` 对应版本即可；但如果本地是唯一一份（没推仓库），清了就真没了'
      ],
      related: ['dk-rmi', 'dk-images', 'dk-system-prune', 'dk-df', 'dk-push'],
      docs: 'https://docs.docker.com/reference/cli/docker/image/prune/',
      tags: ['清理', '镜像', '危险']
    },

    /* ---------- 53 / 56 ---------- */
    {
      id: 'dk-daemon-json',
      name: 'daemon.json 关键配置',
      kind: 'recipe',
      alias: ['/etc/docker/daemon.json', '镜像加速', 'data-root', 'insecure-registries', 'default-address-pools'],
      level: 3,
      syntax: '/etc/docker/daemon.json（改完执行 systemctl daemon-reload && systemctl restart docker）',
      summary: 'Docker 守护进程核心配置：镜像加速、数据目录、日志与容器网段。',
      desc: '`daemon.json` 是 dockerd 的配置文件。华为云 ECS 上最常改的四项：`registry-mirrors` 加速拉取、`data-root` 把数据挪到数据盘、`log-opts` 限制日志大小、`default-address-pools` 改容器网段避开 VPC。改完必须重启 docker 才生效，而重启会重启所有容器。',
      params: [
        { flag: '"registry-mirrors": ["https://<加速地址>"]', desc: '镜像加速地址；华为云 SWR 在控制台提供对应 region 的加速地址，配完在 `docker info` 里可见' },
        { flag: '"data-root": "/data/docker"', desc: '数据目录，默认 `/var/lib/docker`；系统盘小的时候必须迁到数据盘' },
        { flag: '"log-driver": "json-file"', desc: '全局日志驱动，配合 log-opts 使用' },
        { flag: '"log-opts": {"max-size": "10m", "max-file": "3"}', desc: '全局日志大小限制，只对新建容器生效' },
        { flag: '"default-address-pools": [{"base": "172.20.0.0/16", "size": 24}]', desc: '容器网段池，避免与 VPC 的 172.16.0.0/12 冲突' },
        { flag: '"insecure-registries": ["registry.example.com:5000"]', desc: '允许 HTTP 或自签证书的仓库（只在确实需要时加，会降低安全性）' },
        { flag: '"exec-opts": ["native.cgroupdriver=systemd"]', desc: 'cgroup 驱动，装 K8s/CCE 节点时 kubelet 与 docker 必须一致' },
        { flag: '"live-restore": true', desc: 'dockerd 重启时保持容器运行（升级 docker 不断业务，注意兼容性）' }
      ],
      examples: [
        { cmd: 'systemctl restart docker && docker info | grep -A3 "Registry Mirrors"', desc: '改完配置重启并验证镜像加速生效' },
        { cmd: 'journalctl -u docker -n 50 --no-pager', desc: 'daemon.json 写法有误会导致 docker 起不来，用它看具体报错' },
        { cmd: 'docker info --format "{{.DockerRootDir}}"', desc: '确认 data-root 是否已生效' },
        { cmd: 'rsync -aP /var/lib/docker/ /data/docker/', desc: '迁移数据目录时先停 docker 再同步（同步完改 data-root 再启动，验证无误后删旧目录）' }
      ],
      notes: [
        '**改 `daemon.json` 后 `systemctl restart docker` 会重启所有容器**（除非配了 `live-restore`），生产必须在维护窗口做，并先确认容器的 `--restart` 策略能让它们自动起来',
        'JSON 不支持注释和尾逗号，多一个逗号 dockerd 就起不来；出现"docker 命令连不上 daemon"先用 `journalctl -u docker -n 50` 确认是不是配置文件语法问题',
        '`registry-mirrors` 与 `log-opts` 只对**之后新建**的容器与新的拉取生效，已有容器不受影响',
        '`data-root` 迁移步骤：停 docker → `rsync -aP /var/lib/docker/ /data/docker/` → 改 daemon.json → 启动 docker → `docker images`/`docker ps -a` 验证 → 确认无误再删旧目录',
        '华为云 SWR 的登录地址与镜像加速地址按 region 不同，务必以控制台"客户端上传/镜像加速"页面给出的为准，不要照抄其他 region 的域名',
        '`insecure-registries` 会让 Docker 跳过 TLS 校验，只应临时用于自建测试仓库；生产请给仓库配上受信任证书'
      ],
      related: ['dk-info', 'dk-container-logs-size', 'dk-network-create', 'dk-pull', 'dk-df'],
      docs: 'https://docs.docker.com/reference/cli/dockerd/',
      tags: ['配置', '镜像加速', 'data-root', 'cgroup']
    },

    /* ================= H. 三大经典坑与实战 ================= */

    /* ---------- 54 / 56 ---------- */
    {
      id: 'dk-troubleshoot-restart',
      name: '容器反复重启排查（ps -a → logs → inspect）',
      kind: 'recipe',
      alias: ['容器启动就退出', '容器反复重启', 'ExitCode', 'Restarting', 'CrashLoop'],
      level: 3,
      syntax: 'docker ps -a → docker logs <容器> → docker inspect --format "{{.State.ExitCode}}" <容器>',
      summary: '容器反复重启或启动即退出的完整排查链路与退出码含义。',
      desc: '现场通常是 `docker ps -a` 里 STATUS 显示 `Exited (1) 3 seconds ago`，或者 `Restarting (1) 5 seconds ago`（说明 `--restart` 策略在不停拉起一个起不来的容器）。排查三步走：一看状态与重启次数，二看日志（应用自己报的错），三看退出码与 OOMKilled 标记（进程是怎么死的）。CCE/K8s 场景的等价思路是 `kubectl describe pod` 看 Events + `kubectl logs --previous` 看上一个容器实例的日志。',
      params: [
        { flag: 'docker ps -a', desc: '看状态、退出码与是否处于 Restarting' },
        { flag: 'docker logs --tail 200 <容器>', desc: '第一现场，应用自己的报错都在这里' },
        { flag: 'docker inspect --format "{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}"', desc: '一条命令拿到退出码、是否被 OOM、重启次数' },
        { flag: 'docker inspect --format "{{.State.Error}} {{.HostConfig.RestartPolicy.Name}}"', desc: '看启动错误与重启策略配置' },
        { flag: 'docker events --since 1h --filter container=<容器>', desc: '事件流，判断是 die、oom 还是被人手工 kill' },
        { flag: 'docker run -it --rm --entrypoint /bin/sh web:1.0.0', desc: '把入口换成 shell 手动执行启动命令，区分是配置问题还是代码问题' }
      ],
      examples: [
        { cmd: 'docker ps -a --filter name=web', desc: '先确认容器状态与退出码' },
        { cmd: 'docker logs --tail 200 web', desc: '看最后 200 行输出，多数问题这里就有答案' },
        { cmd: 'docker inspect --format "{{.State.ExitCode}} OOM={{.State.OOMKilled}} Restarts={{.RestartCount}}" web', desc: '退出码与 OOM 判断' },
        { cmd: 'docker run -it --rm --entrypoint /bin/sh web:1.0.0', desc: '手工执行启动命令复现问题，验证配置文件与依赖' }
      ],
      notes: [
        '**退出码 0**：容器内主进程正常结束。要么它本来就是一次性任务，要么启动命令被写成了后台运行——`nginx` 忘了 `daemon off;`、脚本里用了 `service xxx start` 或 `nohup xxx &`，都会让容器立刻"成功退出"',
        '**退出码 1**：应用自身报错退出，看 `docker logs` 的异常栈；配置写错、连不上数据库、端口被占用多在这一档',
        '**退出码 126/127**：命令无法执行 / 命令不存在。常见于 `ENTRYPOINT`/`CMD` 写错、脚本没有执行权限（`chmod +x`）、基础镜像里没有那个解释器（alpine 里没有 bash）',
        '**退出码 137**：被 `SIGKILL` 杀死（128+9）。两种主因——被 OOM Killer 杀（`OOMKilled=true`，要调大 `--memory` 或查内存泄漏）、或有人执行了 `docker kill`/`docker rm -f`',
        '**退出码 139**：段错误（128+11），常见于二进制与 CPU 架构不匹配（ARM 机器跑 x86 镜像，或反之）与动态库缺失',
        '**退出码 143**：被 `SIGTERM` 正常终止（128+15），来自 `docker stop` 或编排系统缩容，属于正常退出',
        '**根因多数是 PID 1 前台进程**：容器不是虚拟机，1 号进程退出容器就结束。启动命令必须前台运行（官方 nginx 镜像写 `CMD ["nginx","-g","daemon off;"]` 就是这个原因），Shell 脚本要用 `exec java -jar app.jar` 让 java 成为 PID 1 才能收到信号',
        '排查期间把 `--restart always` 先改成 `no` 或 `on-failure:3`，避免坏容器无限重启刷日志、打满 CPU',
        'CCE 场景等价操作：`kubectl describe pod <Pod名>` 看 Events 与 Last State，`kubectl logs <Pod名> --previous` 看上一个容器实例日志'
      ],
      related: ['dk-logs', 'dk-ps', 'dk-inspect', 'dk-events', 'dk-exec', 'dk-run', 'dk-troubleshoot-timezone', 'k8s-describe'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/logs/',
      tags: ['排障', '重启', '退出码', 'OOM']
    },

    /* ---------- 55 / 56 ---------- */
    {
      id: 'dk-troubleshoot-timezone',
      name: '容器时区不对的排查（TZ / localtime）',
      kind: 'recipe',
      alias: ['时区', 'TZ', 'localtime', '时间差8小时', 'CST'],
      level: 2,
      syntax: 'docker run -e TZ=Asia/Shanghai <镜像> / docker run -v /etc/localtime:/etc/localtime:ro <镜像>',
      summary: '容器时间比北京时间少 8 小时的成因与三种修法。',
      desc: '容器默认使用 UTC，且时区配置与宿主机相互独立：`docker run` 起来之后再改宿主机的时区或时间，容器里看到的仍然是 UTC。于是日志时间、数据库写入时间、定时任务全部偏 8 小时。三种修法：设 `TZ` 环境变量、挂载宿主机 `/etc/localtime`、在 Dockerfile 里装 tzdata 并设置时区。',
      params: [
        { flag: '-e TZ=Asia/Shanghai', desc: '首选方案：注入 TZ 环境变量（镜像里得有 `/usr/share/zoneinfo`，否则部分程序不认）' },
        { flag: '-v /etc/localtime:/etc/localtime:ro', desc: '挂载宿主机的时区文件，最直观；要求宿主机已 `timedatectl set-timezone Asia/Shanghai`' },
        { flag: '-v /etc/timezone:/etc/timezone:ro', desc: 'Debian/Ubuntu 系还需要这个文件（CentOS/RHEL 只需 localtime）' },
        { flag: '--env-file .env', desc: '多容器统一从文件注入 TZ，避免逐个写' }
      ],
      examples: [
        { cmd: 'docker run -d --name web -e TZ=Asia/Shanghai -p 80:80 nginx:1.25', desc: '起容器时指定时区' },
        { cmd: 'docker exec web date', desc: '进容器确认时间（应显示 CST +0800）' },
        { cmd: 'docker run -d --name app -v /etc/localtime:/etc/localtime:ro web:1.0.0', desc: '挂载宿主机时区文件（宿主机需已设为 Asia/Shanghai）' },
        { cmd: 'docker run -d --name mysql8 -e TZ=Asia/Shanghai -v mysqldata:/var/lib/mysql mysql:8.0', desc: '数据库容器指定时区（同时确认 my.cnf 的 default-time-zone）' }
      ],
      notes: [
        '**容器内默认是 UTC**：`TZ` 只是告诉程序用哪个时区，内核时钟始终是 UTC；Java 应用还要注意 `-Duser.timezone=Asia/Shanghai`，否则容器时区对了应用日志可能仍是 UTC',
        '**精简镜像里常常没有 tzdata**：`alpine`、`debian-slim` 默认不带时区数据库，只设 `TZ` 会出现识别不了或仍按 UTC 输出的情况；正解是在 Dockerfile 里 `RUN apk add --no-cache tzdata`（alpine）或 `RUN apt-get update && apt-get install -y tzdata`（Debian/Ubuntu）',
        '`docker run` 之后再改宿主机时间/时区**不会**影响容器：容器内时区来自镜像与启动参数，要改只能重建容器或 `docker cp` 时区文件进去',
        '`docker logs -t` 的时间戳是 UTC，看日志时间对不上先想时区，不要以为日志丢了',
        '数据库链路上的时区要全链路一致：容器 `TZ`、MySQL 的 `default-time-zone`、JDBC 连接串的 `serverTimezone` 三处不一致时，写入时间会连续偏两次',
        '给定时任务（cron）排错时特别注意：容器里 cron 按 UTC 触发，表现就是"任务晚 8 小时执行"'
      ],
      related: ['dk-run', 'dk-exec', 'dk-logs', 'dk-troubleshoot-restart', 'dk-compose-yml'],
      docs: 'https://docs.docker.com/reference/cli/docker/container/run/',
      tags: ['时区', 'TZ', '排障']
    },

    /* ---------- 56 / 56 ---------- */
    {
      id: 'dk-troubleshoot-network',
      name: '容器网络不通排查（外网 / 宿主机 / DNS）',
      kind: 'recipe',
      alias: ['容器访问不了外网', 'DNS 不通', '--add-host', 'FORWARD 链', '容器访问宿主机'],
      level: 4,
      syntax: 'docker exec <容器> ping -c3 <目标> → docker inspect --format "{{json .NetworkSettings}}" <容器> → sysctl net.ipv4.ip_forward',
      summary: '容器访问不了外网或宿主机的排查顺序与常见原因。',
      desc: '按现象分三类：① 容器访问不了外网——查宿主机 `net.ipv4.ip_forward`、iptables 的 `FORWARD` 链与 NAT 规则、容器网段是否与 VPC 冲突；② 容器访问不了宿主机上的服务——bridge 模式下 `127.0.0.1` 指容器自己，要用 `172.17.0.1`（默认 bridge 网关）或宿主机内网 IP，host 模式才能用 `127.0.0.1`；③ 容器之间用容器名不通——多半是用了默认 bridge 网络，换自定义网络即可。',
      params: [
        { flag: '--network mynet', desc: '换用自定义 bridge 网络，容器名可互相解析（首选修法）' },
        { flag: '--add-host db:192.168.1.10', desc: '往容器 `/etc/hosts` 写一条静态解析，绕过 DNS 问题' },
        { flag: '--dns 100.125.1.250', desc: '指定 DNS 服务器（华为云内网 DNS 地址请按所在 region 核对）' },
        { flag: '--dns-search internal.example.com', desc: '指定 DNS 搜索域，解析短名时用' },
        { flag: '--network host', desc: '让容器共用宿主机网络栈，直接访问宿主机上的服务与内网' }
      ],
      examples: [
        { cmd: 'docker exec -it app ping -c 3 114.114.114.114', desc: '先测 IP 连通性：IP 都不通是路由/NAT 问题，IP 通而域名不通是 DNS 问题' },
        { cmd: 'docker exec -it app cat /etc/resolv.conf', desc: '看容器 DNS 配置（宿主机用 systemd-resolved 时可能是 127.0.0.53，容器里不可用）' },
        { cmd: 'docker run -d --name app --add-host db:192.168.1.10 web:1.0.0', desc: '写死 hosts 解析，快速绕过内网 DNS 问题' },
        { cmd: 'sysctl net.ipv4.ip_forward && iptables -t nat -L POSTROUTING -n | head', desc: '宿主机上确认 IP 转发与 NAT 规则是否存在' },
        { cmd: 'iptables -L FORWARD -n | head', desc: '检查 FORWARD 链策略是否被改成 DROP（会导致容器 NAT 失效）' }
      ],
      notes: [
        '**宿主机 `net.ipv4.ip_forward=0` 时容器完全出不了外网**：`sysctl -w net.ipv4.ip_forward=1` 临时打开，并写进 `/etc/sysctl.conf` 持久化（Docker 启动时通常会自动开启，被安全加固脚本改回去就会出问题）',
        '**iptables 的 `FORWARD` 链默认策略被改成 DROP**（安全加固、K8s 安装、某些云助手脚本都可能改）会让容器 NAT 立即失效；检查 `iptables -L FORWARD -n`，自定义放行规则应写在 `DOCKER-USER` 链而不是直接改 `FORWARD`',
        '**firewalld 一重启，容器常常就断网了**：它默认会清掉 Docker 插入的转发规则；标准做法是把 docker0 加入 trusted 区域（`firewall-cmd --permanent --zone=trusted --add-interface=docker0` 后 reload），或者统一用 iptables 管理',
        '容器默认网段 `172.17.0.0/16` 与华为云 VPC 的 `172.16.0.0/12` 重叠时，容器访问同网段的云服务（RDS、OBS 内网域名、内网 DNS）会走错路由；用 `--subnet` 或 daemon.json 的 `default-address-pools` 换网段',
        '容器访问宿主机服务：bridge 模式下要用 `172.17.0.1`（默认 bridge 网关）或宿主机内网 IP，`127.0.0.1` 指的是容器自己；只有 `--network host` 时容器内的 `127.0.0.1` 才是宿主机',
        '`--network host` 与 `-p` 互斥：host 模式下端口映射不生效，容器监听的端口就是宿主机端口，端口冲突要等容器起来才发现',
        'DNS 排查顺序：`cat /etc/resolv.conf` → `getent hosts <域名>`（容器内与宿主机各跑一次对比）→ 需要应急时用 `--add-host` 或指定 `--dns`',
        'ECS 安全组只影响"从外部访问容器端口"，不影响容器出网；容器出网走的是宿主机 NAT，两件事不要混'
      ],
      related: ['dk-network-modes', 'dk-network-inspect', 'dk-network-create', 'dk-exec', 'dk-daemon-json', 'dk-troubleshoot-restart'],
      docs: 'https://docs.docker.com/engine/network/',
      tags: ['网络', '排障', 'DNS', 'iptables']
    }

  );
})();
