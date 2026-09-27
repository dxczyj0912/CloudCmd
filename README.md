# CloudCmd · 云计算命令手册

> 一个**零依赖、离线可用、可搜索**的云计算命令速查与学习网站。
> 双击 `index.html` 就能用，不需要装任何东西，断网也能查。
> Android 版可构建为默认离线、带可选 `INTERNET` 权限的 APK；调试构建可不签名，正式安装必须使用仓库外的签名密钥。

---

## 快速开始

### 方式一：直接打开（推荐）

双击 **`index.html`** 即可。已针对 `file://` 协议做过兼容（复制功能会自动降级，不依赖 https）。

### 方式二：起个本地服务（可选）

```bash
# 任选一种
npx serve .            # 或
python -m http.server 8080
```

然后浏览器访问提示的地址。两种方式功能完全一致。

### 方式三：部署网页与跨设备同步

需要网页、手机和 App 共享进度时，在服务器运行：

```bash
node server.js
# 或
docker compose up -d --build
```

默认访问 `http://服务器地址:8787/`。生产环境请放在 HTTPS 反向代理后，打开页面的“进度备份与同步”，用同步码配对设备。部署版每 30 秒检查内容版本，`data/` 或 `assets/` 更新后会提示刷新。完整配置见 [部署与同步](docs/部署与同步.md)。

如果部署目录中放了更高版本的正式签名 APK（例如 `CloudCmd-1.3.apk`），Android App 在连接同步服务后也会提示“下载更新”；点击后由系统浏览器下载并确认安装。

### 方式四：构建 Android 版

正式安装或分发必须使用仓库外的签名凭证重建并验证签名。`--no-sign` 只用于调试构建，不能安装或覆盖升级。

| | |
| --- | --- |
| 离线 | 整个网站打包在 APK 里，飞行模式也能用 |
| 权限 | `INTERNET` 仅用于用户主动配置同步服务；不配置时站内仍可完全离线 |
| 系统要求 | minSdk 24（Android 7.0+）｜ targetSdk 34 |
| 重建 | `node tools/build-apk.js --no-sign --version-code=3 --version-name=1.2`（工具链见下方） |
| 验证 | `node tools/apk-check.js` —— 逐字节比对包内文件，并在 375×667 下真渲染一遍 |

> **APK 只是新增一个分发形态，没有动这个项目的立身之本。**
> `index.html` 依然是零依赖零构建、双击就能用的那份文件；APK 是把同一批文件套了个
> WebView 外壳（`android/`）。构建**也不用 Gradle** —— 直接调 SDK 自带的
> `aapt2` / `javac` / `d8` / `zipalign` / `apksigner`，见 `tools/build-apk.js`。
> 第一次需要装工具链（约 350 MB，装到标准的 `%LOCALAPPDATA%\Android\`）：
> `powershell -ExecutionPolicy Bypass -File tools/android/setup-toolchain.ps1`

调试包使用 `--no-sign`，不会携带仓库内私钥。正式签名时由构建环境提供
`CLOUDCMD_KEYSTORE`、`CLOUDCMD_KEY_ALIAS`、`CLOUDCMD_KEYSTORE_PASS` 和
`CLOUDCMD_KEY_PASS` 四个环境变量；密码和 keystore 不写入项目文件。

正式发布前运行 `node tools/release-check.js --apk=CloudCmd-版本.apk`，并按
[正式发布验收](docs/发布验收.md)完成签名、升级安装、真机输入法和进度迁移检查。

---

## 功能

| 功能 | 说明 |
| --- | --- |
| 🎴 **每日一练** | 间隔重复的卡片复习：正面给**现象**（"磁盘满了但 `du` 找不到大文件"），背面给命令 + **判据** + 反向排除，并能把命令**送进模拟终端跑一遍**。每天 12 张，记连续天数 |
| ⌨️ **实时练习（练习平台）** | 独立页面 `academy-lab.html`：左侧大终端 + 右侧步骤讲义；分类页有「实时练习」入口 → 该分类的练习列表 → 具体某节；执行命令自动打勾，全部完成即过关并展开讲解 |
| 🔍 **全局搜索** | 同时搜命令名、中文说明、参数、示例、注意事项；支持中文与英文混搜与自然语言提问 |
| 📋 **一键复制** | 每条命令与每个示例都能一键复制，`file://` 下同样可用 |
| ⭐ **收藏与进度** | 标记“已掌握”、收藏常用命令、练习完成状态，都存在浏览器本地，刷新不丢 |
| ⇄ **进度备份与同步** | 首页和实时练习页都能复制/下载 JSON 备份；部署版可用同步码在网页、手机和 App 之间合并进度，并通过 SSE 实时通知 |
| 🗺️ **学习路线图** | 9 个阶段，每阶段有目标、关键命令、实战项目、验收标准 |
| 🚑 **故障速查** | 按“现象”找“命令组合”，如 CPU 高、磁盘满、Pod 起不来、502 |
| 🚦 **难度分级** | 每条命令标 L1 入门 → L4 专家，可按难度筛选 |
| 🌙 **深色模式** | 跟随系统 / 手动切换，选择会被记住 |
| 🖨️ **打印速查卡** | 每个分类可打印成 PDF，打印时自动展开全部命令详情 |
| 📱 **手机可用可看可练** | 浏览：侧栏变抽屉、触摸目标达标、代码块可横滑、输入框防 iOS 自动放大。练习：讲义占满屏幕 + 终端贴底常驻，可一键切全屏终端，带快捷键条（`\|` `~` `$` `↑` `↓` 等），软键盘弹出不会盖住输入行 |
| 🪟 **临时 Shell 窗口** | 顶栏图标或 `Ctrl` + 反引号，在右侧空白处开一个临时终端，边看文档边敲；会话独立、状态记住 |

### 快捷键

| 按键 | 作用 |
| --- | --- |
| `/` 或 `Ctrl` + `K` | 聚焦搜索框 |
| `Enter` | 跳到搜索结果第一条 |
| `Esc` | 清空搜索 / 收起（也用来关临时 Shell 窗口） |
| `Ctrl` + `` ` `` | 开 / 关右侧的**临时 Shell 窗口** |
| 终端内 `↑` `↓` | 翻历史命令 |
| 终端内 `←` `→` | 输入框为空时：上一题 / 下一题 |
| 终端内 `Tab` | 命令名补全 |
| 终端内 `Ctrl` + `L` | 清屏 |

### 🖥️ 临时 Shell 窗口：一边看文档一边练

顶栏的终端图标（或 `Ctrl` + `` ` ``）会在**右侧开一栏**临时 Shell，与文档**并排**显示，看命令说明的同时就能在旁边敲：

```
┌───────────────────────────────┬───────────────────────┐
│ 首页 / 网络与排障              │ ⌨ 临时 Shell    ✕ 关闭 │
│ 网络与排障                     ├───────────────────────┤
│ ip / ss / curl / tcpdump · 56 条│ ● ● ● student@web-…   │
│ ┌ 难度 全部 L1 L2 L3 L4 ┐       │ [root@web-prod-01 ~]# ip addr │
│ ① ip addr      L1 入门   ⭐  › │ 1: lo: <LOOPBACK,UP,…>│
│ ② ip link      L2 进阶   ⭐  › │ 2: eth0: <BROADCAST,…>│
│ ③ ip route     L2 进阶   ⭐  › │    inet 10.0.1.23/24  │
│ ④ ip neigh     L3 高级   ⭐  › │ [root@web-prod-01 ~]# │
└───────────────────────────────┴───────────────────────┘
```

- **并排，不遮挡**：面板是右侧一栏（`sticky`，跟着页面滚），文档列自动让位 —— 实测 1920 / 1600 / 1366 / 1084 四档宽度都不重叠、无横向滚动
- **窄屏自动降级**：≤1439px 先把左侧分类栏让出来给文档和终端；≤900px 才变成整屏抽屉（右下角有悬浮开关）
- 面板里的会话**不属于任何练习课**：随便敲不会写进度、不影响练习判定；「重置」只重置这台模拟机
- **四种关闭方式**：面板右上角 `✕ 关闭`、顶栏开关（开着时按钮是按下态）、`Esc`（光标在终端里也能关）、抽屉模式下点面板外
- **每次开关都会在控制台留一行**：`[CloudCmd] 临时 Shell → 关闭（Esc）`，一眼看出是哪条路径生效
- 开合状态记在本地（`cloudcmd.shellPanel`），刷新后保持原样；每个页面都在——分类列表、命令详情、速查、路线图
- 与练习平台同一套 `shell.js` 引擎：`ls` / `grep` / `ip` / `docker` / `kubectl`、管道与重定向都能用

这是一个**浏览器内的模拟终端**：用自己的 shell 引擎 + 虚拟文件系统跑起来，不用装 Docker、不用连服务器、不用买云主机。

### ⌨️ 练习平台：`academy-lab.html`

**这个页面就是练习平台本体** —— 主站的练习列表点「开始 / 继续」后**整页跳到这里**，一节练习 = 一个页面：

```
index.html#/practice            →  academy-lab.html#/lab/builtin-6-7
index.html#/practice/awk-topip  →  academy-lab.html#/lab/cc-awk-topip
```

```
+--------------------------------------------------------------------+
| <返回手册   CloudCmd    实时练习 | Linux 网络与排障   模拟环境 · 离线可用|
+--------------------------------+-----------------------------------+
| o o o  root@cloudcmd           | Linux 网络与排障      0/7 个步骤  未完成|
|        Linux 网络与排障 · 模拟终端| Linux 网络排障与路由跟踪            |
+--------------------------------+ 1. 查看服务器IP地址                |
| CloudCmd Linux 网络排障练习     |   [ 命令           >运行  []复制 ]  |
| 按右侧步骤执行命令，或直接输入。  |   [ 01  ip addr                 ]  |
|                                | 2. 查看服务器网关                  |
| root@cloudcmd-lab01:~# ip addr |   [ 命令           >运行  []复制 ]  |
| 1: lo: <LOOPBACK,UP,LOWER_UP>  |   [ 02  netstat -rn             ]  |
| 2: ens160: <BROADCAST,...>     |                                   |
|    inet 192.168.17.10/24       | 上一节 <-            下一节 ->      |
| root@cloudcmd-lab01:~# _       |                                   |
+--------------------------------+-----------------------------------+
```

- **190 节可进入的练习课**：主站 188 节（764 步），练习平台另有 2 节网络课
- **终端由 `assets/js/shell.js` 驱动**：**338 个命令名**真跑（`ls` / `grep` / `ip` / `docker` / `kubectl` / `mysql` / `redis-cli` / `nginx` / `helm` / `git` / `hcloud` / `obsutil`，含管道与重定向），输出是真实格式
- **讲义由课程数据渲染**：命令块数量 = 本节步骤数，每条带「运行」「复制」
- **步骤级判定**：命令、退出码与已配置的输出/文件状态断言一起判定；目前 278 / 764 步有步骤证据，全部步骤完成且整课目标出现后才打卡
- **环境是"另一台机器"**：`root@cloudcmd-lab01` / `ens160` / `192.168.17.10` / 网关 `192.168.17.1`，与主站默认环境（`web-prod-01` / `eth0`）隔离，互不污染
- **进度统一存**：主站和练习平台共用 `cloudcmd.v1`；旧版 `cloudcmd.practice.v1` 会自动迁移，跨标签页实时同步
- **深链可分享**：`academy-lab.html#/lab/cc-awk-topip`；主站旧写法 `#/practice/<id>` 也照样能进
- **未收录的邻节做成灰标记**（`is-ghost`，无 `href`），不留点了没反应的假链接

**手机上怎么用**（≤760px 自动切换）：

```
+-----------------------------------+
| 讲义：步骤 / 运行 / 复制  （可滚动）  |  ← 占满剩余空间，正文可视 ≥150px
+-----------------------------------+
| 终端：贴底常驻，点「运行」立刻看到输出  |
| [↑][↓][|][-][/][~][$][*][>][']["]  |  ← 快捷键条：符号键盘里难敲的字符
| root@cloudcmd-lab01:~# _           |
+-----------------------------------+
```

- 手机上**不是**把桌面布局堆起来：那样终端会吃掉固定高度、讲义只剩几十像素（实测过），
  结果是"看得见终端、看不见讲义"。手机上的真实动作是「看一步 → 点运行 → 看输出」，两者必须同时在场。
- 终端右上角可**一键切全屏终端**（讲义让位），看完再切回来
- **软键盘适配**：用 `visualViewport` 把页面高度压到可视区，输入行不会被键盘盖住
- 触摸目标全部放大（运行/复制 40px、快捷键 38px、星标 42px）；输入框 ≥16px（否则 iOS 聚焦会自动放大整页）
- 自检：`node tools/lab-check.js`（**133 项断言**，其中 37 项专门跑手机视口：竖屏 375×667 与横屏 667×375）

**它不能做什么**（页面上也明确标注了）：

- ❌ 不会真的执行任何命令，不会碰你的电脑 —— 输出全部由仿真数据算出
- ❌ 无法模拟需要真实网络的命令（`ssh`、`scp`、`rsync` 传输），会明确告诉你原因而不是假装成功
- ❌ 无法模拟交互式程序（`vim`、实时刷新的 `top`、`mysql` 交互式客户端）
- ❌ **不能替代真机验证**。输出是照着真机格式写的，用来建立肌肉记忆和排查直觉；学完请务必在真机上再敲一遍

> 演进说明：这一页最初是"按截图 1:1 复刻某在线实验平台"的复刻件（含对方品牌、四个菜单、XP 进度条、
> 字号档位、命令手册等）。后来改成 **CloudCmd 自己的练习平台**：只保留"左终端 + 右步骤讲义"这个
> 真正承载学习闭环的结构，去掉模仿他方品牌的外壳与用不上的 LMS 控件。
> 相关的历史标定记录见 `docs/峻熙Linux学院实验台复刻.md`（已标注为历史）。
---

## 内容规模

**Phase 1 与 Phase 2 全部交付：18 个分类、830 条命令**，全部离线可用。

| 分类 | 条数 | 说明 |
| --- | --- | --- |
| 🐧 Linux 基础与文件操作 | 60 | 目录导航、文件增删改查、打包压缩、远程传输 |
| ✂️ 文本处理三剑客 | 42 | grep / sed / awk / jq，日志分析实战组合 |
| 👤 用户权限与系统管理 | 56 | 用户组、权限位、systemd、cron |
| 🌐 网络与排障 | 56 | ip / ss / curl / tcpdump / ssh 端口转发 / 防火墙 |
| 💾 磁盘与存储 | 46 | 分区、LVM 扩容、挂载、容量与 IO 排查、华为云 EVS 挂盘流程 |
| 📜 Shell 脚本编程 | 36 | 变量与引号、流程控制、重定向管道、严格模式与健壮性、实战模板 |
| 🐳 Docker 容器 | 56 | 镜像、容器、网络、数据卷、Compose、华为云 SWR |
| ☸️ Kubernetes | 80 | 资源对象、调度与 RBAC、kubeadm/etcdctl 运维、四条排错链路、华为云 CCE |
| ⛵ Helm 包管理 | 25 | Chart 安装/升级/回滚、`helm template` 本地渲染调试 |
| 🧩 中间件 | 30 | Nginx / Tomcat / HAProxy / Keepalived / ETCD |
| 🗄️ 数据库与缓存 | 56 | MySQL 备份与慢查询、Redis 大 key、Kafka、MongoDB、RabbitMQ |
| 📊 监控与日志 | 42 | 系统观测四件套、日志体系、Prometheus/Grafana、JVM |
| ☁️ **华为云 CLI** | **71** | KooCLI `hcloud`、`obsutil`、ECS/VPC/EVS/ELB/RDS/IAM/CES/CCE、AWS/Azure 对照 |
| 🏗️ Terraform / Ansible | 45 | `init/plan/apply`、状态管理与远端后端、Ansible 模块与 Playbook |
| 🔁 CI/CD 与 Git | 41 | Git 常用流程、Jenkinsfile、`.gitlab-ci.yml` |
| 📦 虚拟化与镜像 | 25 | KVM/`virsh`、`qemu-img`、cloud-init、镜像制作 |
| 🔐 安全与合规 | 38 | openssl 证书、SELinux、审计与入侵排查、镜像扫描、AK/SK 泄露应急 |
| ⚡ 性能压测与调优 | 25 | ab/wrk/sysbench/fio、内核参数、JVM 线程栈分析 |

外加 **37 条故障速查链路**、**9 阶段学习路线图**、**188 个主站交互式练习课（764 步）** 与 **398 张每日一练卡片**。

数据、终端行为与卡片由自动检查把关，可随时运行 `node tools/check-all.js`：

```bash
node tools/validate-data.js     # 数据契约：字段完整性、id 唯一性、裸占位符、related 断链、summary 长度、路线图覆盖
node tools/shell-check.js       # 模拟终端行为（含全部课程的答案、备用答案、逐步命令、静默错误回归）
node tools/render-check.js      # 无头 Chrome 里跑 132 项真实 DOM 冒烟测试（含每日一练的翻面/打分/送终端/进度备份）
node tools/lab-check.js         # 练习平台：133 项冒烟测试（真 shell / 讲义 / 步骤打卡 / 路由 / 手机竖屏与横屏）
node tools/card-check.js        # 每日一练卡片：398 张，18 分类全覆盖；289 张有 run 且都在模拟器里跑通
node tools/coverage-report.js   # 生成命令/课程/卡片覆盖率报告，列出仍需补课的命令
node tools/learning-chain-inventory.js # 生成 830 条命令的完整教/练/实战清单与 CSV
node tools/progress-judge-check.js # 统一进度迁移与严格判题契约
node tools/lesson-assertion-check.js # 逐课验证步骤输出和文件状态，不以模拟提示文字判通过
node tools/real-lab-check.js --manifest=docs/真实环境验收模板.json # 只校验证据清单，不执行真实命令
node tools/security-check.js    # 检查 APK 构建不携带固定签名密码或私钥
node tools/apk-check.js         # APK 内容：逐字节比对包内文件 + 在 375×667 下真渲染
node tools/link-check.js        # 658 个官方文档链接体检（约 5 分钟；真死链与反爬/限流分开报）
```

> **新分类怎么上线**：`node tools/wire-phase2.js` 一次搞定「改注册表状态 + 引入数据文件」两处，
> 幂等可反复跑；`--check` 只看状态不改文件。详见 `docs/内容规范.md` §6。
>
> **练习课的硬前提**：课程的每一步都是在模拟引擎里**真跑**的，所以只有引擎实现过的命令
> 才能出练习课。目前 338 个命令名的覆盖对照表在 `docs/内容规范.md` §5.3。

学习链路的逐条盘点见 [学习链路全量清单](docs/学习链路全量清单.md)；
[CSV 明细](docs/学习链路命令明细.csv)包含全部 830 条命令的课程、卡片和故障剧本关联。
哪些缺口值得补、哪些应暂缓或避免机械自动化，见 [学习链路补强取舍](docs/学习链路补强取舍.md)（含逐条 CSV）。
模拟器之外的网络、权限、云资源和数据恢复验收见 [真实环境验收](docs/真实环境验收.md)。

---

## 目录结构

```
云计算-DS/
├─ index.html                 主站唯一页面（SPA 外壳，双击即可打开）
├─ academy-lab.html           实时练习平台（左终端 + 右步骤讲义，独立页面）
├─ CloudCmd-1.2.apk           Android 未签名构建产物（不能直接安装）
├─ android/                    Android 外壳工程（WebView + 图标资源，不含站点内容）
│  ├─ AndroidManifest.xml      可选 INTERNET + adjustResize + configChanges
│  ├─ java/…/MainActivity.java 单 Activity：WebView 配置、外链分流、返回键
│  ├─ res/                     图标（自适应 vector + 各密度 PNG 由脚本生成）
│  └─ keystore/                （不提交私钥；正式签名由构建环境注入）
├─ assets/
│  ├─ css/main.css            全部样式（主题变量 + 布局 + 组件）
│  ├─ css/print.css           打印样式
│  ├─ css/lab.css             练习平台样式
│  ├─ ref/                    参考截图（实拍原图，供比对）
│  └─ js/
│     ├─ store.js             localStorage：进度 / 收藏 / 主题
│     ├─ search.js            搜索引擎（索引构建 + 打分排序）
│     ├─ render.js            视图渲染层
│     ├─ router.js            hash 路由
│     ├─ app.js               入口：初始化、事件、快捷键、复制降级
│     ├─ shell.js             模拟 shell 引擎（338 个命令名、管道/重定向、虚拟文件系统）
│     ├─ terminal.js          练习列表与步骤推导（分类页「实时练习」的落点）
│     ├─ drill.js             每日一练：间隔重复算法 + 每日队列
│     └─ academy-lab.js       练习平台：终端 + 讲义 + 步骤判定 + 路由 + 手机端交互
├─ data/
│  ├─ _registry.js            分类注册表（数据契约的唯一定义处，18 个分类）
│  ├─ linux-basic.js          分类 01  Linux 基础与文件操作    60 条
│  ├─ linux-text.js           分类 02  文本处理三剑客          42 条
│  ├─ linux-user.js           分类 03  用户权限与系统管理      56 条
│  ├─ linux-net.js            分类 04  网络与排障              56 条
│  ├─ linux-storage.js        分类 05  磁盘与存储              46 条
│  ├─ shell.js                分类 06  Shell 脚本编程          35 条
│  ├─ docker.js               分类 07  Docker 容器             56 条
│  ├─ kubernetes.js           分类 08  Kubernetes              80 条
│  ├─ helm.js                 分类 09  Helm 包管理             25 条
│  ├─ middleware.js           分类 10  中间件                  30 条
│  ├─ db-cache.js             分类 11  数据库与缓存            55 条
│  ├─ monitor.js              分类 12  监控与日志              40 条
│  ├─ cloud-cli.js            分类 13  华为云 CLI              71 条
│  ├─ iac.js                  分类 14  Terraform / Ansible     45 条
│  ├─ cicd.js                 分类 15  CI/CD 与 Git            40 条
│  ├─ kvm.js                  分类 16  虚拟化与镜像            25 条
│  ├─ security.js             分类 17  安全与合规              35 条
│  ├─ perf.js                 分类 18  性能压测与调优          25 条
│  ├─ cheat.js                故障速查（37 条链路）
│  ├─ roadmap.js              学习路线图（9 阶段）
│  ├─ cards.js                每日一练卡片 —— **同时是卡片的数据契约与质量样板**
│  ├─ cards-linux.js          卡片：Linux 地基
│  ├─ cards-container.js      卡片：容器与编排
│  ├─ cards-data.js           卡片：服务与数据
│  ├─ cards-cloud.js          卡片：云平台与保障
│  ├─ termfs.js               模拟终端的虚拟环境（文件系统 / 容器 / K8s 状态）
│  ├─ lessons.js              课程数据入口（课程按主题拆在 lessons-*.js）
├─ tools/
│  ├─ validate-data.js        数据契约校验
│  ├─ shell-check.js          模拟终端行为验证
│  ├─ render-check.js         主站无头浏览器冒烟测试
│  ├─ lab-check.js            练习平台冒烟测试（CDP 驱动，含手机视口）
│  ├─ card-check.js           每日一练卡片校验（含 run 真跑）
│  ├─ apk-check.js            APK 内容验证（逐字节比对 + 真渲染）
│  ├─ build-apk.js            打 APK（不用 Gradle，直接用 SDK 工具链）
│  ├─ link-check.js           官方文档链接体检
│  ├─ android/                Android 构建相关
│  │  ├─ setup-toolchain.ps1   一次性安装 JDK + Android SDK
│  │  ├─ icons.js              用代码生成各密度 PNG 图标（不往仓库塞二进制）
│  │  ├─ zip.js                极简 ZIP 读写（只为把 dex 合进 APK）
│  │  └─ grab-window.ps1       抓模拟器窗口截图（调试用）
│  ├─ _smoke-harness.js       冒烟测试用例（注入页面执行）
│  └─ wire-phase2.js          新分类接线：注册表改 ready + index.html 引入数据文件
└─ docs/
   ├─ 项目文档.md              项目总纲：需求、架构、内容清单、分期、已修复缺陷
   ├─ 内容规范.md              命令录入规范（数据契约冻结版）
   └─ 峻熙Linux学院实验台复刻.md  历史文档：早年"按截图复刻某平台"的尺寸/配色标定记录（该形态已废弃）
```

---

## 怎么加一条命令

### 1. 找到对应分类文件

比如要给 Docker 加命令，就编辑 `data/docker.js`，在 `push(` 的参数列表里追加一个对象（**注意上一个对象后面要有逗号**）：

```js
    {
      id: 'dk-xxx',                    // 全局唯一，前缀 dk-，kebab-case
      name: 'docker xxx',              // 命令名
      alias: ['别名', '常见误写'],       // 可选，参与搜索加权
      level: 2,                        // 1 入门 / 2 进阶 / 3 高级 / 4 专家
      syntax: 'docker xxx [选项] <镜像>',
      summary: '一句话说清它是干嘛的，20~45 字。',
      desc: '补充说明：原理、与别的命令的区别、适用场景。',   // 可选
      params: [                        // 可选，只收高频参数，3~6 个为宜
        { flag: '-f, --force', desc: '强制操作，不加会询问' }
      ],
      examples: [                      // 必填，至少 1 个，必须是可直接复制执行的命令
        { cmd: 'docker xxx -f nginx:1.25', desc: '这条示例在解决什么问题' }
      ],
      notes: ['踩坑提醒；危险命令必须有'],   // 可选
      related: ['dk-run', 'dk-ps'],    // 可选，必须是站内真实存在的 id
      docs: 'https://docs.docker.com/...',
      tags: ['容器', '镜像']            // 可选，2~4 个中文关键词
    }
```

**必填字段**：`id` / `name` / `level` / `syntax` / `summary` / `examples`。

完整规范见 `docs/内容规范.md`。

### 2. 加完必须跑校验

```bash
node tools/validate-data.js       # 字段、id 唯一性、裸占位符、related 断链、summary 长度
node tools/render-check.js        # 真实浏览器里跑一遍
```

两条都通过才算加完。

### 3. 想加一条练习 / 往模拟终端里加文件

- **加练习**：编辑 `data/lessons.js`，追加一个课程对象。**必须写 `steps[]`**（每步 `title` 短标题 / `about` 作用说明 / `cmd` 命令 / `note` 要点）。加完跑 `node tools/shell-check.js` —— 它会验证 `answer`、所有 `alt` 备用答案，**以及每一步的 `cmd`** 都能真正跑通（逐步验证按累积 shell 顺序执行，与学员真机上的操作一致）。
  ⚠️ **先确认引擎实现过这门课要用的命令**：练习的每一步都是真跑的，引擎没有的命令只会返回 `command not found`，步骤永远打不上勾。可用命令清单见 `docs/内容规范.md` §5.3。
- **加虚拟文件/容器/节点**：编辑 `data/termfs.js`。文件用 `{ $f: '内容' }`，目录就是普通对象，软链用 `{ $l: '目标' }`；文件的大小/权限/属主在 `FILE_META` 里补。
- **加命令支持**：在 `assets/js/shell.js` 的 `CMDS` 表里加一个实现，然后在 `tools/shell-check.js` 里补断言。命令签名统一是 `function (argv, ctx, stdin, HOST)`。

---

## 开发说明

### 为什么不用框架 / 不用构建工具

因为第一使用场景是**本地双击打开**。`file://` 协议下 ES Module 的 `import` 和 `fetch('data.json')` 都会被 CORS 拦死，所以：

- 数据用传统 `<script>` 标签注入 `window.CC_DATA`；
- 逻辑用 IIFE 包裹，不写 `import`/`export`；
- 图标用内联 SVG / Emoji，不引图标库；
- 依赖数 **0**。

这是刻意的设计取舍，不是技术债。

### 数据流

```
data/*.js  ──注入──▶  window.CC_DATA
                          │
                    search.js 建索引
                          │
   hash 路由 ──▶ router.js ──▶ render.js 出 HTML ──▶ app.js 绑事件
                          │
                     store.js 存进度/收藏/主题

data/termfs.js ──▶ shell.js 建虚拟文件系统 ──▶ terminal.js 出终端 UI
data/lessons.js ──┘        （管道/重定向/命令实现）      （输入、判定、讲解）
                              ▲
                              └── academy-lab.js（练习平台复用同一个 shell 引擎）
```

### 新增一个分类

```bash
# 1. 写数据文件（照抄 docs/内容规范.md v2.1 的骨架）
#    data/<分类id>.js ，条数 > 0

# 2. 一条命令接线（自动做两件事：注册表 status → ready、index.html 引入它）
node tools/wire-phase2.js

# 3. 跑测试
node tools/validate-data.js && node tools/shell-check.js && node tools/render-check.js && node tools/lab-check.js
```

`wire-phase2.js` 会自己判断哪些数据文件已经写好（有文件且条数 > 0），**只接可用的那些**，没写的自动跳过。加 `--check` 只看状态不改文件。它是**幂等**的：重复跑第二次会显示"0 个分类 status → ready / 已全部引入"。

> 手工等价操作（工具没覆盖时用）：
> ① `data/_registry.js` 里该分类的 `status: 'soon'` 改成 `'ready'`；
> ② `index.html` 的 `<script>` 列表里加一行 `<script src="data/<分类id>.js"></script>`（插在 `termfs.js` 之前）。
>
> ⚠️ 别用「`id: 'x'` 之后若干字内的第一个 `status: 'soon'`」这类正则批量改注册表：分类已是 `ready` 时它会**越过自己的对象块**改掉下一个分类，级联把没写数据的分类误标成已上线。
>
> ⚠️ **练习课是可选加分项**：新分类不补 `data/lessons.js` 条目的话，分类页的「实时练习」入口会显示"整理中"。要补，先确认引擎实现过相关命令（见上文 §3 的提醒）。

### 写文件的两条注意事项

1. **中文文件不要用 PowerShell 的 `Set-Content` / `Out-File` 改写**。Windows PowerShell 5.1 默认编码不是 UTF-8，会把已经是 UTF-8 的中文文件二次编码成乱码（`README.md` 就被这么毁过一次，只能用编辑器重写）。要改文本文件就用编辑器 / Node 的 `fs.writeFileSync(..., 'utf8')`。
2. **布局问题要用 DOM 测量，不要靠截图猜**：无头浏览器在部分环境下 `--window-size` 给出的视口高度与窗口不一致（实测 800 的窗口得到 649 的视口），截图会呈现“顶栏跑到画面中间”这种**假象**。可靠做法是注入测量脚本，用 `getBoundingClientRect()` / `scrollWidth vs clientWidth` 拿真实数字。

---

## 交接 / 深入

**如果你是接手这个项目的人，先读 `docs/交接文档.md`** —— 它是为"从没看过这个项目的人"写的，
内容包括：五分钟跑起来、十条不可违反的硬约束、架构图、数据结构、**引擎的边界（写课前必读）**、
五个常见任务的配方、检查器怎么看结果、脚本清单、当前基线数字、已知缺口，以及一整节"踩过的坑"。

| 文档 | 作用 |
| --- | --- |
| **`docs/交接文档.md`** | **交接入口** —— 从零到能改内容 |
| `docs/项目文档.md` | 总纲（2300 行）：设计决策、版本历史、功能细节 |
| `docs/内容规范.md` | 数据契约：字段定义与写法约束（**写内容前必读**） |
| `docs/待更新清单.md` | 逐轮执行结果记录 |
| `docs/会话摘要.md` | 早期交接摘要（部分内容已过期，以交接文档为准） |

---

## 免责声明

站内命令均以“可在标准 Linux 发行版 / Docker / Kubernetes 上执行”为准则编写，但**不同发行版、不同版本、不同云厂商的具体行为可能存在差异**。执行任何删除、格式化、`dd`、`iptables -F`、`kubectl delete` 之类的破坏性命令前，请务必确认目标环境并做好备份。华为云相关命令请以 [华为云官方文档](https://support.huaweicloud.com/) 为准。

练习平台的终端是**模拟环境**，输出由引擎按虚拟环境现场算出（不是预置的假输出，也**不能替代在真机上验证**）。页面顶部标了「模拟环境 · 离线可用」，无法模拟的命令会明确说明原因，而不是假装成功。
