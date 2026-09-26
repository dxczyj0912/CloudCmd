/* data/cicd.js · 分类 15 CI/CD 与 Git */
(function () {
  'use strict';

  var catId = 'cicd';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. Git 基础与日常 ================= */

    /* ---------- 1 / 41 ---------- */
    {
      id: 'ci-git-init',
      name: 'git init',
      alias: ['git init -b main', '初始化仓库'],
      level: 1,
      syntax: 'git init [选项] [目录]',
      summary: '把普通目录变成 Git 仓库，第一次纳管代码时执行。',
      desc: '执行后目录里多出 `.git/`，所有版本数据都在里面，删掉它仓库历史就没了。默认初始分支名由 `init.defaultBranch` 决定，新版本建议显式写 `-b main`，避免出现 `master`/`main` 两种叫法混用。',
      params: [
        { flag: '-b, --initial-branch', desc: '指定初始分支名，如 `-b main`' },
        { flag: '--bare', desc: '创建裸仓库（无工作区），用作服务端中央仓库' },
        { flag: '--template', desc: '指定模板目录，可预置 hooks 与 gitignore' },
        { flag: '-q, --quiet', desc: '不打印初始化输出' }
      ],
      examples: [
        { cmd: 'cd /data/app && git init -b main', desc: '在当前目录初始化仓库并把主分支命名为 main' },
        { cmd: 'cd /data/app && git init --bare /srv/git/myapp.git', desc: '在服务器上建一个裸仓库作为中央仓库' },
        { cmd: 'git init -b main myapp && cd myapp && git status', desc: '新建项目目录并立刻确认仓库状态' }
      ],
      notes: [
        '在已有仓库的父目录里误执行 `git init` 会造出嵌套仓库，`git status` 看到的文件范围会变得很奇怪，确认后删掉多余的 `.git` 即可',
        '初始分支名建议一开始就统一成 `main`，中途改名要同步改 CI 配置、流水线触发分支和保护分支规则',
        '`--bare` 仓库没有工作区，不能直接 `git add`/`git commit`，只用于服务端或镜像仓库'
      ],
      related: ['ci-git-clone', 'ci-git-add', 'ci-git-commit', 'ci-git-config'],
      docs: 'https://git-scm.com/docs/git-init',
      tags: ['仓库', '初始化', '入门']
    },

    /* ---------- 2 / 41 ---------- */
    {
      id: 'ci-git-clone',
      name: 'git clone',
      alias: ['git clone -b', 'git clone --depth', '克隆仓库'],
      level: 1,
      syntax: 'git clone [选项] <仓库地址> [本地目录]',
      summary: '把远端仓库整套拉到本地，接手项目和 CI 拉代码都用它。',
      desc: '克隆会带上完整历史和所有分支引用，并在本地自动建好 `origin`。CI 里为了快，常配 `--depth 1` 做浅克隆，需要历史（如 `git describe`、`git log` 统计）时再加 `--fetch-depth` 或改回全量。华为云 CodeArts Repo 的地址形如 `https://codehub-cn-north-4.devcloud.huaweicloud.com/<项目ID>/<仓库名>.git`。',
      params: [
        { flag: '-b, --branch', desc: '只检出指定分支或标签，如 `-b release/1.4`' },
        { flag: '--depth', desc: '浅克隆只取最近 N 次提交，CI 提速最有效' },
        { flag: '--single-branch', desc: '只拉一个分支，配合 `--depth` 进一步省流量' },
        { flag: '--recursive', desc: '连子模块一起克隆' },
        { flag: '-o, --origin', desc: '自定义远端名，默认 `origin`' }
      ],
      examples: [
        { cmd: 'cd /data/app && git clone https://codehub-cn-north-4.devcloud.huaweicloud.com/abc123/myapp.git', desc: '克隆华为云 CodeArts Repo 上的业务仓库' },
        { cmd: 'cd /data/app && git clone -b release/1.4 --single-branch --depth 1 https://gitee.com/myorg/myapp.git', desc: 'CI 里浅克隆指定发布分支，拉取速度最快' },
        { cmd: 'cd /data/app && git clone --recursive git@github.com:myorg/platform.git', desc: '带子模块一起克隆，编译型项目常用' },
        { cmd: 'cd /data/app && git clone git@github.com:myorg/myapp.git myapp-hotfix', desc: '克隆到指定目录名，同一台机器上并行处理多个分支' }
      ],
      notes: [
        '浅克隆（`--depth`）的仓库缺少历史，`git log`、`git describe`、`git rebase` 都可能受限，需要时用 `git fetch --unshallow` 补全',
        'HTTPS 地址每次要输账号密码，建议配置 SSH 密钥或凭据管理器；CI 里用访问令牌（Token）注入，不要写死在脚本里',
        '克隆大仓库慢可以加 `--filter=blob:none` 做部分克隆（Git 2.19+），只在需要时下载文件内容'
      ],
      related: ['ci-git-fetch', 'ci-git-pull', 'ci-git-branch-remote', 'ci-git-submodule', 'ln-ssh-keygen'],
      docs: 'https://git-scm.com/docs/git-clone',
      tags: ['克隆', '仓库', 'CI']
    },

    /* ---------- 3 / 41 ---------- */
    {
      id: 'ci-git-add',
      name: 'git add',
      alias: ['git add -p', 'git add -A', '暂存改动'],
      level: 1,
      syntax: 'git add [选项] <路径|.>',
      summary: '把工作区改动放进暂存区，决定这次提交包含哪些内容。',
      desc: 'Git 的提交只包含暂存区内容，所以 `git add` 是「挑选要提交的改动」的动作。`git add -p` 可以按代码块逐段确认，是写出干净提交的关键习惯；`git add -A` 一把梭虽然快，但容易把调试代码、临时文件一起提交上去。',
      params: [
        { flag: '-p, --patch', desc: '交互式逐块选择要暂存的改动，强烈推荐' },
        { flag: '-A, --all', desc: '暂存所有改动，含新增、修改与删除' },
        { flag: '-u, --update', desc: '只暂存已跟踪文件的改动，不含新文件' },
        { flag: '-n, --dry-run', desc: '只显示会暂存哪些文件，不真正执行' },
        { flag: '-f, --force', desc: '强制添加被 `.gitignore` 忽略的文件，慎用' }
      ],
      examples: [
        { cmd: 'cd /data/app && git add src/main/java/com/myorg/OrderService.java', desc: '只暂存这个业务文件，提交粒度更清晰' },
        { cmd: 'cd /data/app && git add -p', desc: '逐块挑选改动，把一次大改拆成多个语义清晰的提交' },
        { cmd: 'cd /data/app && git add -A && git status', desc: '全部暂存并立刻确认暂存内容，提交前固定动作' },
        { cmd: 'cd /data/app && git add -n .', desc: '预演一遍，看看会加进来哪些文件，防止误提交'
        }
      ],
      notes: [
        '`git add .` 在仓库根目录执行才会覆盖全仓库，在子目录执行只作用于当前目录及其子目录',
        '被 `.gitignore` 忽略的文件用 `-f` 强加进去后依然会被后续操作忽略，正确做法是改 `.gitignore` 规则',
        '提交前用 `git diff --staged` 复核暂存内容，这一步能拦掉绝大多数「误提交密钥/大文件」的事故'
      ],
      related: ['ci-git-commit', 'ci-git-diff', 'ci-git-reset', 'ci-git-stash'],
      docs: 'https://git-scm.com/docs/git-add',
      tags: ['暂存', '提交', '入门']
    },
    /* ---------- 4 / 41 ---------- */
    {
      id: 'ci-git-status',
      name: 'git status',
      alias: ['git status -s', 'git status --short', '工作区状态'],
      level: 1,
      syntax: 'git status [-s|--short] [-b|--branch]',
      summary: '一眼看清当前分支、与远端的领先/落后、哪些改动已暂存、哪些还没。',
      desc: '提交前的第一眼，也是"我刚才到底改了什么"的唯一权威答案。完整格式分三段：`Changes to be committed`（已暂存，会进这次提交）、`Changes not staged for commit`（改了但没 `git add`）、`Untracked files`（新文件）。短格式 `-s` 一行一个文件，**前两列的含义是固定的**：第一列是暂存区、第二列是工作区 —— `M ` 表示已暂存、` M` 表示改了没暂存、`MM` 表示暂存之后又改了、`??` 是未跟踪。判断"这次提交到底包含什么"，看第一列就够了。',
      params: [
        { flag: '-s, --short', desc: '短格式，一行一个文件，脚本里解析用这个' },
        { flag: '-b, --branch', desc: '额外显示分支名与领先/落后远端的提交数' },
        { flag: '--porcelain', desc: '给脚本用的稳定格式（与 `-s` 类似，但输出不随版本变化）' },
        { flag: '-uall / -uno', desc: '控制未跟踪文件是否逐个列出，大仓库里 `-uno` 能快很多' }
      ],
      examples: [
        { cmd: 'cd /data/app && git status', desc: '完整三段：已暂存 / 未暂存 / 未跟踪，提交前必看' },
        { cmd: 'cd /data/app && git status -s', desc: '短格式，两列分别是暂存区与工作区状态' },
        { cmd: 'cd /data/app && git status --short --branch', desc: '短格式 + 分支与领先/落后信息，日常最常用的一条' }
      ],
      notes: [
        '短格式**第一列是暂存区、第二列是工作区**，顺序反了就会把"没暂存"当成"已暂存"，提交内容与预期不符',
        '`git status` 里的 `Your branch is ahead of \'origin/main\' by 1 commit` 是推送前最该看的一行：领先了却没推，别人就看不到你的修复',
        '`??` 是未跟踪文件。提交前先想清楚它该不该进仓库 —— 密钥、日志、`node_modules` 进去了很难干净地拿出来',
        '仓库根目录之外执行会报 `fatal: not a git repository`，先 `cd` 到项目目录再操作',
        '频繁 `git status` 不会改变仓库任何状态，是**零风险**的命令；拿不准当前情况时就先敲它'
      ],
      related: ['ci-git-add', 'ci-git-commit', 'ci-git-diff', 'ci-git-branch-remote'],
      docs: 'https://git-scm.com/docs/git-status',
      tags: ['Git', '工作区', '入门']
    },

    /* ---------- 5 / 41 ---------- */
    {
      id: 'ci-git-commit',
      name: 'git commit',
      alias: ['git commit --amend', 'git commit -m', '提交改动'],
      level: 1,
      syntax: 'git commit [选项] [-m "提交信息"]',
      summary: '把暂存区内容固化成一次提交记录，写清信息很重要。',
      desc: '每次提交都带作者、时间、父提交指针和一段说明。团队一般约定提交信息规范（如 Conventional Commits：`feat`/`fix`/`chore`），因为发布说明、版本号自动化都靠它解析。`--amend` 用于修改**最近一次**提交，会改变提交 ID。',
      params: [
        { flag: '-m, --message', desc: '直接给出提交信息，可重复传实现标题+正文' },
        { flag: '-a, --all', desc: '自动暂存已跟踪文件的修改再提交，不含新文件' },
        { flag: '--amend', desc: '修改最后一次提交（信息或内容），会生成新提交 ID' },
        { flag: '--no-verify', desc: '跳过 pre-commit / commit-msg 钩子，紧急时用但会绕过检查' },
        { flag: '--signoff', desc: '追加 Signed-off-by 签名，部分开源项目强制要求' },
        { flag: '--allow-empty', desc: '允许空提交，常用于触发一次流水线' }
      ],
      examples: [
        { cmd: 'cd /data/app && git commit -m "feat(order): 新增订单超时自动关闭"', desc: '按 Conventional Commits 规范提交一个功能' },
        { cmd: 'cd /data/app && git commit -am "fix(order): 修复并发下单重复扣库存"', desc: '一次性提交已跟踪文件的修改' },
        { cmd: 'cd /data/app && git commit --amend -m "fix(order): 修复并发下单重复扣库存 (#482)"', desc: '补上关联的 issue 编号，只改信息不改内容' },
        { cmd: 'cd /data/app && git commit -m "chore(ci): 流水线增加镜像扫描" -m "关联需求 REQ-2024-118"', desc: '标题与正文分开写，正文补充背景信息' }
      ],
      notes: [
        '`--amend` 会重写提交 ID，**已推送到公共分支的提交不要 amend**，否则同事拉取后会分叉，只能靠 `--force-with-lease` 强推',
        '`--no-verify` 会跳过代码检查钩子，只应在确认问题无害时使用，别养成习惯',
        '提交信息尽量写清「为什么改」而不是「改了什么」，`git log` 才有长期价值',
        '不要把密码、AK/SK、证书提交进仓库；一旦提交，即便后续删除，历史里依然能翻出来，必须换密钥并清理历史'
      ],
      related: ['ci-git-add', 'ci-git-push', 'ci-git-log', 'ci-git-reset', 'ci-git-reflog'],
      docs: 'https://git-scm.com/docs/git-commit',
      tags: ['提交', '规范', '入门']
    },

    /* ---------- 6 / 41 ---------- */
    {
      id: 'ci-git-push',
      name: 'git push',
      alias: ['git push -u', 'git push origin', '推送远端'],
      level: 1,
      syntax: 'git push [选项] [远端] [分支]',
      summary: '把本地提交推送到远端仓库，协作与触发流水线的动作。',
      desc: '首次推新分支加 `-u`（`--set-upstream`）建立跟踪关系，之后直接 `git push` 即可。推送被拒（`non-fast-forward`）说明远端有你本地没有的提交，正确做法是先 `git pull --rebase` 再推，而不是直接强推。',
      params: [
        { flag: '-u, --set-upstream', desc: '建立本地分支与远端分支的跟踪关系' },
        { flag: '--tags', desc: '把所有本地标签一起推送' },
        { flag: '--force-with-lease', desc: '安全强推：远端被别人更新过就拒绝，比 `--force` 安全得多' },
        { flag: '--force', desc: '无条件覆盖远端分支，危险' },
        { flag: '--delete', desc: '删除远端分支，如 `git push origin --delete feature/old`' },
        { flag: '--dry-run', desc: '预演会推送哪些引用' }
      ],
      examples: [
        { cmd: 'cd /data/app && git push -u origin feature/order-timeout', desc: '首次推送功能分支并建立跟踪关系' },
        { cmd: 'cd /data/app && git push', desc: '建立跟踪后推送当前分支，日常最高频' },
        { cmd: 'cd /data/app && git push origin v1.4.2', desc: '推送标签，触发 CI 里的发版流水线' },
        { cmd: 'cd /data/app && git push --force-with-lease origin feature/order-timeout', desc: 'rebase 后推送自己的功能分支，加了安全阀' },
        { cmd: 'cd /data/app && git push origin --delete feature/order-timeout', desc: '功能合并后删除远端分支' }
      ],
      notes: [
        '`git push --force` 会**覆盖远端历史**，如果别人基于被覆盖的提交做了工作，那些提交会变成孤儿；禁止对 `main`、`release/*` 等公共分支使用',
        '确需强推自己的功能分支，用 `--force-with-lease`：远端有他人新提交时会拒绝，避免误伤',
        '推送被拒先执行 `git pull --rebase` 把本地提交移到远端最新提交之后，再推一次',
        '推送到华为云 CodeArts Repo 时若报权限错误，检查账号是否有该仓库的推送权限以及分支保护规则是否禁止直推',
        '受保护分支直推会被服务端拒绝，正常流程是推功能分支后提合并请求（MR/PR）'
      ],
      related: ['ci-git-commit', 'ci-git-pull', 'ci-git-rebase', 'ci-git-branch-remote', 'ci-git-reflog'],
      docs: 'https://git-scm.com/docs/git-push',
      tags: ['推送', '协作', '危险']
    },

    /* ---------- 7 / 41 ---------- */
    {
      id: 'ci-git-pull',
      name: 'git pull',
      alias: ['git pull --rebase', 'git pull --ff-only', '拉取并合并'],
      level: 1,
      syntax: 'git pull [选项] [远端] [分支]',
      summary: '拉取远端更新并合入当前分支，等价于 fetch 加合并。',
      desc: '`git pull` = `git fetch` + `git merge`（或 `rebase`）。默认的 merge 行为在有本地提交时会造出一条合并提交，历史很快变乱，所以现代团队普遍配置 `pull.rebase = true` 或直接 `git pull --rebase`，让本地提交线性地叠在远端最新提交之上。',
      params: [
        { flag: '--rebase', desc: '用 rebase 代替 merge 整合远端更新，历史更线性' },
        { flag: '--ff-only', desc: '只允许快进，本地有分叉时直接报错，最安全的默认策略' },
        { flag: '--no-rebase', desc: '显式使用 merge 方式整合' },
        { flag: '--autostash', desc: '拉取前自动 stash、拉完自动恢复，配合 `--rebase` 很省心' },
        { flag: '--prune', desc: '顺便清理远端已删除的分支引用' }
      ],
      examples: [
        { cmd: 'cd /data/app && git pull --rebase origin main', desc: '把远端 main 的最新提交拉下来，本地提交线性叠在其后' },
        { cmd: 'cd /data/app && git pull --rebase --autostash', desc: '有未提交改动时也敢拉，Git 会自动暂存再恢复' },
        { cmd: 'cd /data/app && git config --global pull.ff only && git pull', desc: '设为只允许快进，避免手滑产生意外合并提交' },
        { cmd: 'cd /data/app && git pull --prune', desc: '拉取更新并清理远端已删除的分支引用' }
      ],
      notes: [
        'rebase 过程中出现冲突要逐个文件修改后 `git add <文件>`，再 `git rebase --continue`；想放弃就 `git rebase --abort` 回到拉取前的状态',
        '多个分支共享的工作目录里不要贸然 `git pull`，先 `git status` 确认当前分支和未提交改动',
        '习惯用 `git fetch` + `git log HEAD..@{u}` 先看远端带来了什么，再决定 merge 还是 rebase，比直接 pull 更可控'
      ],
      related: ['ci-git-fetch', 'ci-git-merge', 'ci-git-rebase', 'ci-git-stash', 'ci-git-config'],
      docs: 'https://git-scm.com/docs/git-pull',
      tags: ['拉取', '同步', '协作']
    },

    /* ---------- 8 / 41 ---------- */
    {
      id: 'ci-git-fetch',
      name: 'git fetch',
      alias: ['git fetch --prune', 'git fetch origin', '只拉取不合并'],
      level: 2,
      syntax: 'git fetch [选项] [远端] [分支]',
      summary: '只把远端更新取回本地引用，不改动工作区，最安全的同步。',
      desc: '`git fetch` 更新的是 `origin/main` 这类远程跟踪分支，你自己的 `main` 和文件内容都不动。所以「先 fetch 看清差异，再决定合并方式」是排查同步问题最稳的路径，也是 `git pull --ff-only` 失败后应该做的第一步。',
      params: [
        { flag: '--all', desc: '拉取所有远端的最新引用' },
        { flag: '--prune', desc: '删除远端已不存在的远程跟踪分支' },
        { flag: '-t, --tags', desc: '同时拉取标签；`--no-tags` 则相反' },
        { flag: '--depth', desc: '浅拉取指定深度，CI 里按需补历史' },
        { flag: '--unshallow', desc: '把浅克隆补成完整克隆' }
      ],
      examples: [
        { cmd: 'cd /data/app && git fetch origin && git log HEAD..origin/main --oneline', desc: '看清远端多了哪些提交，再决定怎么合并' },
        { cmd: 'cd /data/app && git fetch --all --prune', desc: '同步所有远端并清理已删除的分支引用' },
        { cmd: 'cd /data/app && git fetch origin main', desc: '只取 main 分支的更新，不切分支不合并' },
        { cmd: 'cd /data/app && git fetch --unshallow', desc: 'CI 浅克隆后需要完整历史时补全' }
      ],
      notes: [
        '`git fetch` 不动工作区，所以它不会产生冲突，任何「怕搞乱代码」的场景都优先用它',
        'fetch 之后 `git status` 会提示「您的分支落后 N 个提交」，此时再选 merge 或 rebase 都不迟',
        '长期不 `--prune` 会积累一堆远端已删除的引用，`git branch -r` 输出会误导人'
      ],
      related: ['ci-git-pull', 'ci-git-branch-remote', 'ci-git-branch', 'ci-git-log'],
      docs: 'https://git-scm.com/docs/git-fetch',
      tags: ['拉取', '同步', '安全']
    },

    /* ---------- 9 / 41 ---------- */
    {
      id: 'ci-git-branch',
      name: 'git branch',
      alias: ['git branch -d', 'git branch -a', 'git branch -m', '分支管理'],
      level: 1,
      syntax: 'git branch [选项] [分支名]',
      summary: '查看、创建、删除、重命名分支，管理并行开发线。',
      desc: '分支在 Git 里只是一个指向提交的指针，创建和切换的成本极低。团队普遍采用 `main` + `feature/*` + `release/*` + `hotfix/*` 的分支模型：功能分支开发、发布分支冻结、热修分支直接对应生产事故。`-d` 只能删已合并分支，`-D` 强制删除。',
      params: [
        { flag: '-a, --all', desc: '列出本地与远程跟踪分支' },
        { flag: '-v, --verbose', desc: '显示每个分支最新提交的 ID 与信息' },
        { flag: '--merged / --no-merged', desc: '只列已合并/未合并到当前分支的分支，清理时最有用' },
        { flag: '-d / -D', desc: '删除分支（`-d` 拒绝未合并分支，`-D` 强制）' },
        { flag: '-m / -M', desc: '重命名分支（`-M` 强制覆盖同名分支）' },
        { flag: '-r, --remotes', desc: '只列远程跟踪分支' }
      ],
      examples: [
        { cmd: 'cd /data/app && git branch -a', desc: '查看全部本地与远程分支' },
        { cmd: 'cd /data/app && git branch --merged main', desc: '列出已合入 main 的分支，用来清理陈旧的开发分支' },
        { cmd: 'cd /data/app && git branch -d feature/order-timeout', desc: '删除已合并的功能分支（未合并会拒绝）' },
        { cmd: 'cd /data/app && git branch -m feature/user-login feature/auth-login', desc: '重命名分支，统一命名规范' },
        { cmd: 'cd /data/app && git branch -vv', desc: '查看每个分支的跟踪关系与领先/落后情况' }
      ],
      notes: [
        '`git branch -D` 会丢弃未合并的提交，删除前确认 `git log <分支> --not main --oneline` 里没有还需要的提交',
        '删除分支只是删指针，被它指向的提交还能通过 `git reflog` 或提交 ID 找回一段时间',
        '重命名已推送的分支后，远端旧分支仍需单独删除，同事的本地跟踪引用也要各自更新'
      ],
      related: ['ci-git-switch', 'ci-git-merge', 'ci-git-branch-remote', 'ci-git-log', 'ci-git-reflog'],
      docs: 'https://git-scm.com/docs/git-branch',
      tags: ['分支', '管理', '模型']
    },

    /* ---------- 10 / 41 ---------- */
    {
      id: 'ci-git-switch',
      name: 'git switch / checkout',
      alias: ['git checkout -b', 'git switch -c', '切换分支'],
      level: 1,
      syntax: 'git switch [选项] <分支名>\ngit checkout [选项] <分支名|提交|文件>',
      summary: '切换分支或恢复文件，switch 管分支、restore 管文件。',
      desc: 'Git 2.23 起把 `checkout` 的两种职责拆开：`git switch` 只切分支，`git restore` 只恢复文件。老写法 `git checkout` 依然可用，但语义容易混淆——`git checkout -- <文件>` 会**丢弃工作区改动**，与切分支是完全不同的风险等级。',
      params: [
        { flag: '-c / -b', desc: '`switch -c` 与 `checkout -b` 都是创建并切换到新分支' },
        { flag: '-C / -B', desc: '创建分支时若已存在则重置到当前起点（有丢弃风险）' },
        { flag: '--detach', desc: '切到分离头指针状态，查看历史时用，此时提交不属于任何分支' },
        { flag: '-t, --track', desc: '基于远端分支创建并建立跟踪关系' },
        { flag: '-', desc: '切回上一个分支，两个分支间来回跳很方便' },
        { flag: '-- <文件>', desc: '`checkout -- <文件>` 用暂存区内容覆盖工作区文件，会丢改动' }
      ],
      examples: [
        { cmd: 'cd /data/app && git switch -c feature/user-login', desc: '从当前分支创建并切换到新的功能分支' },
        { cmd: 'cd /data/app && git switch main && git pull --rebase', desc: '回到主干并同步最新代码，开发前的固定动作' },
        { cmd: 'cd /data/app && git switch -', desc: '在上一个分支和当前分支之间来回切换' },
        { cmd: 'cd /data/app && git switch --track origin/release/1.4', desc: '基于远端发布分支创建本地跟踪分支' },
        { cmd: 'cd /data/app && git restore --staged src/main.js && git restore src/main.js', desc: '新版写法：先取消暂存，再丢弃工作区改动（两步都可回退）' }
      ],
      notes: [
        '`git checkout -- <文件>` 与 `git restore <文件>` 会**永久丢弃工作区未提交的改动**，执行前用 `git diff <文件>` 确认，或先 `git stash` 保底',
        '切换分支时未提交的改动会被带过去；如果目标分支上该文件版本冲突，Git 会拒绝切换，此时先提交或 stash',
        '分离头指针（`--detach`）状态下的提交不属于任何分支，切走后就只能靠 `git reflog` 找回，需要保留就先 `git switch -c <新分支>`'
      ],
      related: ['ci-git-branch', 'ci-git-stash', 'ci-git-reset', 'ci-git-merge', 'ci-git-worktree'],
      docs: 'https://git-scm.com/docs/git-switch',
      tags: ['分支', '切换', '恢复']
    },

    /* ---------- 11 / 41 ---------- */
    {
      id: 'ci-git-merge',
      name: 'git merge',
      alias: ['git merge --no-ff', 'git merge --squash', '合并分支'],
      level: 2,
      syntax: 'git merge [选项] <分支名>',
      summary: '把另一个分支的提交合并进当前分支，功能收口的标准动作。',
      desc: '快进合并（fast-forward）只是把指针往前挪，不产生新提交；加 `--no-ff` 会强制生成一个合并提交，好处是 `git log --graph` 里能清楚看到「一个功能一条合并记录」，便于整体回滚。`--squash` 则把对方所有提交压成一次改动放进暂存区，由你自己提交。',
      params: [
        { flag: '--no-ff', desc: '强制生成合并提交，保留功能分支的合并痕迹' },
        { flag: '--squash', desc: '压缩成一次改动暂存，不保留对方的提交历史' },
        { flag: '--ff-only', desc: '只允许快进，否则报错，防止意外产生合并提交' },
        { flag: '--abort', desc: '冲突无法解决时放弃本次合并，回到合并前状态' },
        { flag: '-X ours / -X theirs', desc: '冲突时偏向某一方的自动取舍策略，慎用（会静默丢改动）' },
        { flag: '--no-commit', desc: '合并后先不提交，便于人工检查结果再提交' }
      ],
      examples: [
        { cmd: 'cd /data/app && git switch main && git merge --no-ff feature/order-timeout', desc: '主干上保留一条完整的功能合并记录' },
        { cmd: 'cd /data/app && git merge --squash feature/order-timeout && git commit -m "feat(order): 订单超时自动关闭"', desc: '把杂乱的功能提交压成一条干净的提交' },
        { cmd: 'cd /data/app && git merge --abort', desc: '冲突太多、想重新来过时放弃合并' },
        { cmd: 'cd /data/app && git log --graph --oneline -10', desc: '合并后看图形化历史，确认合并结构符合预期' }
      ],
      notes: [
        '冲突出现在 `<<<<<<<` / `=======` / `>>>>>>>` 标记之间，解决后要 `git add` 标记为已解决，再 `git commit` 完成合并',
        '`-X ours` / `-X theirs` 会**静默丢弃**另一侧的改动，只能用于确认无风险的场景（如生成文件）',
        '合并公共分支（如把 main 合进功能分支）会产生大量合并提交，团队一般改用 `git rebase main` 保持线性历史',
        '合并前先 `git fetch` 并确保本地 main 是最新的，否则合并结果可能不是真正的集成分支状态'
      ],
      related: ['ci-git-branch', 'ci-git-rebase', 'ci-git-cherry-pick', 'ci-git-log', 'ci-git-revert'],
      docs: 'https://git-scm.com/docs/git-merge',
      tags: ['合并', '冲突', '协作']
    },

    /* ---------- 12 / 41 ---------- */
    {
      id: 'ci-git-rebase',
      name: 'git rebase',
      alias: ['git rebase -i', 'git rebase main', '变基'],
      level: 3,
      syntax: 'git rebase [选项] <上游分支>\ngit rebase -i <起点提交>',
      summary: '把本地提交重新叠到新基点上，让提交历史保持线性。',
      desc: 'rebase 会**逐个重放提交并生成新的提交 ID**，所以只适合整理自己尚未共享的提交。`git rebase main` 把当前分支的提交挪到 main 最新提交之后；`git rebase -i` 提供交互式清单，可合并（squash）、改写信息（reword）、删除（drop）、拆分提交，是提 MR 前整理历史的利器。',
      params: [
        { flag: '-i, --interactive', desc: '交互式改写提交：`pick`/`reword`/`edit`/`squash`/`fixup`/`drop`' },
        { flag: '--onto', desc: '把一段提交搬到另一个基点上，如 `--onto main old-base topic`' },
        { flag: '--continue / --abort / --skip', desc: '冲突解决后继续、放弃整个变基、跳过当前提交' },
        { flag: '--autosquash', desc: '自动把 `fixup!`/`squash!` 提交排到目标提交之后' },
        { flag: '--autostash', desc: '变基前后自动 stash 与恢复未提交改动' },
        { flag: '--force-rebase', desc: '即使可以快进也重新生成提交' }
      ],
      examples: [
        { cmd: 'cd /data/app && git switch feature/order-timeout && git rebase main', desc: '把功能分支的提交挪到 main 最新提交之后' },
        { cmd: 'cd /data/app && git rebase -i HEAD~3', desc: '整理最近 3 次提交：合并琐碎提交、改写说明' },
        { cmd: 'cd /data/app && git rebase --continue', desc: '冲突解决并 `git add` 之后继续变基' },
        { cmd: 'cd /data/app && git rebase --abort', desc: '变基过程太乱，一键回到变基前的状态' },
        { cmd: 'cd /data/app && git fetch origin && git rebase origin/main && git push --force-with-lease', desc: '同步主干后更新自己的功能分支，用安全强推更新远端' }
      ],
      notes: [
        '**不要 rebase 已经推送到公共分支的提交**（尤其是 `main`、`release/*`）：提交 ID 会全部改变，其他人在旧 ID 上的工作会分叉，只能靠强推收拾',
        'rebase 自己的功能分支后，远端分支需要用 `git push --force-with-lease` 更新，用 `--force` 有覆盖同事提交的风险',
        '变基过程中冲突要「改文件 → `git add` → `git rebase --continue`」，不要用 `git commit` 收尾，否则会产生多余的合并提交',
        '真想彻底放弃，`git rebase --abort` 一定有效；如果已经变基完才发现要回去，用 `git reflog` 找到变基前的提交 ID 再 `git reset --hard <ID>`'
      ],
      related: ['ci-git-merge', 'ci-git-pull', 'ci-git-reflog', 'ci-git-reset', 'ci-git-cherry-pick'],
      docs: 'https://git-scm.com/docs/git-rebase',
      tags: ['变基', '历史', '危险']
    },

    /* ---------- 13 / 41 ---------- */
    {
      id: 'ci-git-stash',
      name: 'git stash',
      alias: ['git stash pop', 'git stash -u', '暂存工作区'],
      level: 2,
      syntax: 'git stash [push|list|pop|apply|drop] [选项]',
      summary: '把未提交的改动临时收起来，切分支和拉代码前救急用。',
      desc: 'stash 把工作区与暂存区的改动打包存进一个栈里，工作区回到干净状态。`pop` 取出并删除该记录，`apply` 取出但保留记录，`-u` 连未跟踪的新文件一起收。它是「马上要切分支，但手上的活还没写完」的标准解法。',
      params: [
        { flag: '-u, --include-untracked', desc: '连未跟踪的新文件一起暂存（最常用）' },
        { flag: '-a, --all', desc: '连被忽略的文件也一起暂存' },
        { flag: '-m, --message', desc: '给这次暂存写说明，栈多了才分得清' },
        { flag: 'list', desc: '列出所有暂存记录及编号，如 `stash@{0}`' },
        { flag: 'pop / apply', desc: '`pop` 取出并删除，`apply` 取出但保留' },
        { flag: 'drop / clear', desc: '删除指定暂存记录 / 清空整个栈（`clear` 不可恢复）' }
      ],
      examples: [
        { cmd: 'cd /data/app && git stash push -u -m "订单超时逻辑未完成"', desc: '连新文件一起收起并写明原因' },
        { cmd: 'cd /data/app && git stash list', desc: '查看所有暂存记录及其编号' },
        { cmd: 'cd /data/app && git stash pop', desc: '恢复最近一次暂存并删除该记录' },
        { cmd: 'cd /data/app && git stash apply stash@{1}', desc: '恢复指定记录但保留它，适合在多个分支上试用同一份改动' },
        { cmd: 'cd /data/app && git stash branch fix/urgent-482 stash@{0}', desc: '基于暂存内容新建分支并恢复，冲突最少的方式' }
      ],
      notes: [
        'stash 默认**不含未跟踪文件**，新写的文件不会进去，记得加 `-u`',
        '`git stash clear` 与 `drop` 删除的暂存记录不在 `git reflog` 的常规视图里，但可以通过 `git fsck --unreachable` 找到悬空提交抢救，操作门槛高，别指望它兜底',
        'stash 是本地栈，不随 push 上传，换机器或换同事都看不到',
        '长期把改动放在 stash 里容易忘，用 `-m` 写清说明，并尽快落成提交或分支'
      ],
      related: ['ci-git-switch', 'ci-git-pull', 'ci-git-reset', 'ci-git-diff'],
      docs: 'https://git-scm.com/docs/git-stash',
      tags: ['暂存', '切换', '救急']
    },

    /* ---------- 14 / 41 ---------- */
    {
      id: 'ci-git-log',
      name: 'git log',
      alias: ['git log --oneline', 'git log --graph', 'git log -p', '提交历史'],
      level: 1,
      syntax: 'git log [选项] [范围|路径]',
      summary: '查看提交历史，找改动、查责任人和定位回归都靠它。',
      desc: '`--oneline` 看概览，`--graph` 看分支结构，`-p` 看每次提交的具体 diff，`-S "字符串"`（pickaxe）能翻出「哪次提交增删了这段代码」，是定位回归最有效的姿势。`--since`、`--author`、`--grep` 用来缩小范围。',
      params: [
        { flag: '--oneline', desc: '每个提交一行（短 ID + 说明），最常用概览' },
        { flag: '--graph', desc: 'ASCII 图形显示分支与合并结构，配 `--oneline` 效果最好' },
        { flag: '-p, --patch', desc: '显示每次提交的完整 diff' },
        { flag: '--stat', desc: '只显示改动文件与增删行数统计' },
        { flag: '-S "字符串"', desc: '找出增删过该字符串的提交（pickaxe），排回归神器' },
        { flag: '--author / --since / --grep', desc: '按作者、时间、提交信息过滤' },
        { flag: '-n / --follow', desc: '限制条数 / 追踪文件重命名前的历史' }
      ],
      examples: [
        { cmd: 'cd /data/app && git log --oneline -10', desc: '看最近 10 次提交的概览' },
        { cmd: 'cd /data/app && git log --graph --oneline --all --decorate', desc: '一眼看清所有分支的合并结构' },
        { cmd: 'cd /data/app && git log -p -- src/main/java/com/myorg/OrderService.java', desc: '只看这个文件的每次改动内容' },
        { cmd: 'cd /data/app && git log -S "timeoutSeconds" --oneline --since="2 weeks ago"', desc: '找出最近两周哪次提交动了这个配置，定位回归' },
        { cmd: 'cd /data/app && git log --author="zhangsan" --since="2024-01-01" --pretty=format:"%h %ad %s" --date=short', desc: '导出某人的提交清单，用于周报或复盘' }
      ],
      notes: [
        '`git log` 默认只显示当前分支可达的提交，看不到别的分支，用 `--all` 或指定分支名',
        '浅克隆（`--depth`）的仓库历史不全，`git log` 只能看到拉取到的那部分',
        '`-S` 匹配的是「字符串增删」，改写而没增删该字符串的提交不会被列出，必要时配合 `-G`（正则匹配 diff）',
        'CI 里做变更范围判断常用 `git log --name-only <旧tag>..<新tag>`，能算出这次发布涉及哪些模块'
      ],
      related: ['ci-git-diff', 'ci-git-bisect', 'ci-git-tag', 'ci-git-reflog'],
      docs: 'https://git-scm.com/docs/git-log',
      tags: ['历史', '查改动', '排错']
    },

    /* ---------- 15 / 41 ---------- */
    {
      id: 'ci-git-diff',
      name: 'git diff',
      alias: ['git diff --staged', 'git diff HEAD', '比较差异'],
      level: 1,
      syntax: 'git diff [选项] [提交A] [提交B] [-- 路径]',
      summary: '比较工作区、暂存区、提交之间的差异，提交前必看。',
      desc: '不带参数比较「工作区 vs 暂存区」；`--staged` 比较「暂存区 vs 最近提交」，也就是**这次提交将要包含的内容**；`git diff HEAD` 则是工作区相对最近提交的全部改动。发布前用 `git diff v1.4.1 v1.4.2 --stat` 可以快速摸清两次发布之间的改动范围。',
      params: [
        { flag: '--staged / --cached', desc: '比较暂存区与最近提交，提交前复核用' },
        { flag: 'HEAD', desc: '比较工作区与最近提交，含未暂存改动' },
        { flag: '--stat', desc: '只显示文件与增删行数统计，便于快速评审' },
        { flag: '--name-only / --name-status', desc: '只列改动文件名 / 含 A/M/D 状态' },
        { flag: '--color-words', desc: '按词高亮，适合看文档与长行改动' },
        { flag: '-w, --ignore-all-space', desc: '忽略空白差异，排除格式化噪音' }
      ],
      examples: [
        { cmd: 'cd /data/app && git diff', desc: '看工作区里还没暂存的改动' },
        { cmd: 'cd /data/app && git diff --staged', desc: '提交前复核将要提交的内容，最该养成的习惯' },
        { cmd: 'cd /data/app && git diff v1.4.1 v1.4.2 --stat', desc: '看两个发布版本之间的改动范围' },
        { cmd: 'cd /data/app && git diff main...feature/order-timeout', desc: '三点语法：只看功能分支相对分叉点新增的改动' },
        { cmd: 'cd /data/app && git diff HEAD -- src/main/resources/application.yml', desc: '只比较某个配置文件的改动' }
      ],
      notes: [
        '两点 `A..B` 是「两个提交之间的差异」，三点 `A...B` 是「B 相对共同祖先的差异」，做代码评审时用三点才是「这个分支改了什么」',
        '`git diff` 输出走分页器，按 `q` 退出、`/` 搜索；`git --no-pager diff` 可直接全量打印便于重定向',
        '二进制文件与锁文件（如 `pnpm-lock.yaml`）的 diff 噪音很大，评审时优先看 `--stat` 与关键源码'
      ],
      related: ['ci-git-log', 'ci-git-add', 'ci-git-commit', 'ci-git-revert'],
      docs: 'https://git-scm.com/docs/git-diff',
      tags: ['差异', '评审', '提交']
    },

    /* ================= B. Git 进阶与救火 ================= */

    /* ---------- 16 / 41 ---------- */
    {
      id: 'ci-git-cherry-pick',
      name: 'git cherry-pick',
      alias: ['git cherry-pick -n', '摘取提交', 'hotfix 合并'],
      level: 3,
      syntax: 'git cherry-pick [选项] <提交ID...>',
      summary: '把指定提交挑到当前分支，热修回合并到多个版本时用。',
      desc: 'cherry-pick 会读取目标提交的改动内容，在当前分支上**生成一个新的提交**（ID 不同）。典型场景：线上问题在 `main` 上修好后，需要把同一个修复摘到 `release/1.3`、`release/1.4` 两条发布分支上。',
      params: [
        { flag: '-n, --no-commit', desc: '只应用改动不自动提交，便于合并多提交后再一起提交' },
        { flag: '-x', desc: '在提交信息里追加 `(cherry picked from commit ...)`，留下溯源记录' },
        { flag: '-e, --edit', desc: '应用后编辑提交信息' },
        { flag: '--continue / --abort / --skip', desc: '冲突解决后继续、放弃、跳过当前提交' },
        { flag: '-m <父号>', desc: '挑取合并提交时需指定以哪个父提交为基准（通常 `-m 1`）' }
      ],
      examples: [
        { cmd: 'cd /data/app && git switch release/1.4 && git cherry-pick -x a1b2c3d', desc: '把 main 上的修复摘到 1.4 发布分支并保留来源记录' },
        { cmd: 'cd /data/app && git cherry-pick -n a1b2c3d e4f5a6b && git commit -m "fix(order): 订单并发修复合入 1.3"', desc: '一次摘多个提交，最后合成一个提交' },
        { cmd: 'cd /data/app && git cherry-pick --abort', desc: '摘取过程中冲突太多，放弃并回到操作前' },
        { cmd: 'cd /data/app && git log --oneline main --not release/1.4', desc: '先看 main 上有哪些提交不在发布分支，确定要摘哪些' }
      ],
      notes: [
        'cherry-pick 产生的是**副本**，不是同一个提交；同一修复在多分支存在不同 ID，后续再合并这些分支时可能出现冲突或重复改动',
        '提交 ID 会变，所以后续用 `git log --grep` 或 `-x` 的溯源信息来确认修复是否已合入某分支',
        '长期大量使用 cherry-pick 说明分支策略有问题，优先考虑「先在发布分支修、再向上合并」的正向流程',
        '冲突解决后要用 `git cherry-pick --continue`，不要 `git commit`，否则会丢掉剩余待摘的提交'
      ],
      related: ['ci-git-merge', 'ci-git-rebase', 'ci-git-revert', 'ci-git-log', 'ci-git-tag'],
      docs: 'https://git-scm.com/docs/git-cherry-pick',
      tags: ['热修', '多分支', '发布']
    },

    /* ---------- 17 / 41 ---------- */
    {
      id: 'ci-git-reset',
      name: 'git reset',
      alias: ['git reset --soft', 'git reset --mixed', 'git reset --hard', '回退提交'],
      level: 3,
      syntax: 'git reset [--soft|--mixed|--hard] [目标提交] [-- 路径]',
      summary: '把分支指针回退到某个提交，三种模式决定丢弃到哪一层。',
      desc: '这是最容易造成数据丢失、也最需要理解清楚的一条命令。三个模式的区别只看「分支指针、暂存区、工作区」谁被重置：`--soft` 只挪指针，改动全留在暂存区；`--mixed`（默认）挪指针并清空暂存区，改动留在工作区；`--hard` 三者一起重置，**未提交的改动直接消失**。另外 `git reset HEAD -- <文件>` 是「取消暂存」，不动提交历史。',
      params: [
        { flag: '--soft', desc: '只移动分支指针，改动保留在暂存区，适合「撤提交重新组织」' },
        { flag: '--mixed', desc: '默认模式：移动指针并取消暂存，改动留在工作区' },
        { flag: '--hard', desc: '指针、暂存区、工作区全部重置，未提交改动永久丢失' },
        { flag: 'HEAD~N', desc: '相对回退 N 个提交，如 `HEAD~1` 是上一个提交' },
        { flag: 'HEAD -- <文件>', desc: '把文件从暂存区取出（取消 `git add`），不动工作区' },
        { flag: '--keep / --merge', desc: '回退指针但保留本地改动，冲突时更保守的选择' }
      ],
      examples: [
        { cmd: 'cd /data/app && git reset --soft HEAD~1', desc: '撤销最近一次提交，改动回到暂存区，可以改了信息重新提交' },
        { cmd: 'cd /data/app && git reset HEAD~1', desc: '撤销最近一次提交并取消暂存，改动留在工作区继续改' },
        { cmd: 'cd /data/app && git reset --hard HEAD~1', desc: '彻底丢弃最近一次提交及其改动，慎用' },
        { cmd: 'cd /data/app && git reset --hard origin/main', desc: '把本地 main 强行对齐远端最新状态，丢弃本地所有改动' },
        { cmd: 'cd /data/app && git reset HEAD -- src/main/java/com/myorg/OrderService.java', desc: '只把这个文件撤出暂存区，不动提交历史' }
      ],
      notes: [
        '`git reset --hard` 是**破坏性操作**：所有未提交的改动与被回退的提交都会从工作区消失，执行前先 `git status` 与 `git diff --staged` 确认，或先 `git stash -u` 兜底',
        '`--hard` 丢掉的提交并非彻底消失，`git reflog` 里还能找到提交 ID，用 `git reset --hard <ID>` 可以恢复——但**未提交的改动 reflog 救不回来**',
        '已经推送到公共分支的提交不要用 reset 回退，应该用 `git revert` 生成反向提交，否则同事的分支会分叉',
        '`--soft` / `--mixed` / `--hard` 记忆法：soft 只动指针、mixed 再动暂存区、hard 连工作区一起动，力度依次加大',
        '在共享分支上执行 `git reset --hard` 后强推，会覆盖他人提交，属于高风险操作'
      ],
      related: ['ci-git-reflog', 'ci-git-revert', 'ci-git-commit', 'ci-git-push', 'ci-git-stash'],
      docs: 'https://git-scm.com/docs/git-reset',
      tags: ['回退', '危险', '救火']
    },

    /* ---------- 18 / 41 ---------- */
    {
      id: 'ci-git-revert',
      name: 'git revert',
      alias: ['git revert HEAD', 'git revert --no-commit', '反向提交'],
      level: 2,
      syntax: 'git revert [选项] <提交ID...>',
      summary: '生成一个反向提交来抵消某次改动，安全撤销公共分支。',
      desc: 'revert 不删除历史，而是新增一个「把那次改动改回去」的提交，所以对已经推送到公共分支的内容，它是唯一安全的撤销方式。撤销合并提交要指定主父提交（`-m 1`），否则 Git 不知道该按哪条线反向。',
      params: [
        { flag: '-n, --no-commit', desc: '只应用反向改动不自动提交，可批量撤销后一起提交' },
        { flag: '-m <父号>', desc: '撤销合并提交时指定主父，通常用 `-m 1` 表示保留主干线' },
        { flag: '--continue / --abort / --skip', desc: '冲突处理：继续、放弃、跳过' },
        { flag: '-e, --edit', desc: '提交前编辑默认的反向提交信息' }
      ],
      examples: [
        { cmd: 'cd /data/app && git revert HEAD', desc: '撤销最近一次提交，生成一条新的反向提交' },
        { cmd: 'cd /data/app && git revert a1b2c3d e4f5a6b', desc: '按顺序撤销多个提交（从新到旧写更稳）' },
        { cmd: 'cd /data/app && git revert -m 1 9f8e7d6', desc: '撤销一个合并提交，保留主干线内容' },
        { cmd: 'cd /data/app && git revert --no-commit HEAD~2..HEAD && git commit -m "revert: 回滚订单超时改动"', desc: '把最近两次提交一起撤销并合成一条回滚提交' }
      ],
      notes: [
        '撤销合并提交后用 `-m 1`，之后再想重新合并该分支时，Git 会认为那些提交「已经合并过」，需要再 revert 一次 revert 才能恢复，记牢这个来回',
        'revert 目标是「抵消改动」，如果后续提交已经改过同一段代码，会产生冲突需要手工处理',
        '生产出问题时优先 revert 而不是 reset：历史完整、可追溯，也不需要强推',
        '回滚后要重新走一遍流水线发布，别只改代码不部署'
      ],
      related: ['ci-git-reset', 'ci-git-reflog', 'ci-git-cherry-pick', 'ci-git-merge', 'ci-git-log'],
      docs: 'https://git-scm.com/docs/git-revert',
      tags: ['回滚', '安全', '发布']
    },

    /* ---------- 19 / 41 ---------- */
    {
      id: 'ci-git-reflog',
      name: 'git reflog',
      alias: ['git reflog', 'git reflog --all', '恢复误删提交'],
      level: 3,
      syntax: 'git reflog [show] [选项] [引用]\ngit reset --hard <reflog 里的 SHA>',
      summary: '记录 HEAD 与分支指针的每次移动，误删误回退的救命稻草。',
      desc: 'reflog 是本地的一份「指针移动流水账」：切分支、提交、reset、rebase、merge、cherry-pick 全都会留下记录，格式是 `<短SHA> HEAD@{n}: <动作> <说明>`。所以只要提交曾经存在过，哪怕 `git reset --hard` 把它从分支上抹掉了，也能在这里找到 SHA 再用 `git reset --hard <SHA>` 把分支指回去。注意 reflog 只记录本地操作，且默认保留 90 天（不可达对象 30 天）。',
      params: [
        { flag: '（无参数）', desc: '`git reflog` 等价于 `git reflog show HEAD`，看 HEAD 的移动记录' },
        { flag: '--all', desc: '显示所有引用（含各分支与远端）的移动记录' },
        { flag: '--date=iso', desc: '显示绝对时间，排查「几点几分丢的」时更直观' },
        { flag: '<分支名>', desc: '如 `git reflog show main`，只看某个分支指针的移动' },
        { flag: '--grep / -n', desc: '过滤动作说明 / 只看最近 N 条' },
        { flag: 'expire', desc: '`git reflog expire --expire=now --all` 手动清理记录，清理后不可恢复' }
      ],
      examples: [
        { cmd: 'cd /data/app && git reflog -20', desc: '看最近 20 次指针移动，确认刚才那步操作之前的状态' },
        { cmd: 'cd /data/app && git reflog --date=iso | head -20', desc: '带时间戳查看，排查「几点出的问题」' },
        { cmd: 'cd /data/app && git reset --hard HEAD@{1}', desc: '撤销上一次指针移动：比如误执行 reset --hard 后把分支指回原处' },
        { cmd: 'cd /data/app && git reset --hard a1b2c3d', desc: '从 reflog 里找到被删提交的 SHA，直接把分支恢复过去' },
        { cmd: 'cd /data/app && git switch -c rescue/lost-commits a1b2c3d', desc: '更稳的做法：基于丢失的提交新建分支，不覆盖当前状态' },
        { cmd: 'cd /data/app && git reflog show main --date=iso', desc: '只看 main 分支指针的移动历史，定位被谁在什么时候改过' }
      ],
      notes: [
        'reflog 是**本地**记录：换机器、重新 clone 都没有，所以在 CI 容器里丢失的提交无法用它找回',
        '默认保留策略是 90 天（`gc.reflogExpire`）、不可达对象 30 天（`gc.reflogExpireUnreachable`），超期被 `git gc` 清理后就真没了',
        '`git reset --hard <SHA>` 配合 reflog 能救回「已提交过」的内容，但**从未提交过的改动救不回来**——所以重要改动先 commit 再折腾',
        '误删分支也能救：reflog 里的分支移动记录保留了终点 SHA，`git switch -c <分支名> <SHA>` 即可重建',
        '执行 `git reflog expire --expire=now --all && git gc --prune=now` 会永久清理这些记录，之后无法恢复，别在出问题时执行'
      ],
      related: ['ci-git-reset', 'ci-git-revert', 'ci-git-commit', 'ci-git-branch', 'ci-git-stash'],
      docs: 'https://git-scm.com/docs/git-reflog',
      tags: ['救火', '恢复', '误删']
    },

    /* ---------- 20 / 41 ---------- */
    {
      id: 'ci-git-tag',
      name: 'git tag',
      alias: ['git tag -a', 'git push --tags', '打标签'],
      level: 2,
      syntax: 'git tag [-a] <标签名> [提交] [-m "说明"]',
      summary: '给某个提交打上版本标签，发版与回滚的锚点。',
      desc: '标签是「不动的分支指针」，指向发布版本的提交。轻量标签只是一个名字，附注标签（`-a`）带打标签人、时间和说明，正式发布应该用附注标签。**标签默认不会被 push 带上去**，必须显式 `git push origin <标签名>` 或 `git push --tags`，CI 的发版流水线通常由推送标签触发。',
      params: [
        { flag: '-a <标签名>', desc: '创建附注标签，含作者、时间与说明' },
        { flag: '-m "说明"', desc: '标签说明，附注标签必给' },
        { flag: '-l, --list', desc: '列出标签，可配通配符如 `-l "v1.4.*"' },
        { flag: '-d', desc: '删除本地标签（远端要单独 `git push origin --delete <标签>`）' },
        { flag: '-f', desc: '强制覆盖同名标签（会改变他人拉到的内容，慎用）' },
        { flag: '--sort=-v:refname', desc: '按版本号倒序排列，避免 `v1.10` 排在 `v1.9` 前面' }
      ],
      examples: [
        { cmd: 'cd /data/app && git tag -a v1.4.2 -m "发布 1.4.2：订单超时修复"', desc: '给当前提交打附注版本标签' },
        { cmd: 'cd /data/app && git push origin v1.4.2', desc: '推送单个标签，触发发版流水线' },
        { cmd: 'cd /data/app && git tag -l "v1.4.*" --sort=-v:refname', desc: '按版本号倒序列出 1.4 系列标签' },
        { cmd: 'cd /data/app && git tag -a v1.4.1 a1b2c3d -m "补打 1.4.1 标签"', desc: '给历史提交补打标签' },
        { cmd: 'cd /data/app && git describe --tags --abbrev=0', desc: '取当前提交之前的最近一个标签，脚本里算版本号常用' }
      ],
      notes: [
        '`git push` 默认不推标签，忘了推标签会导致 CI 发版流水线不触发，这是最常见的「打了标签没反应」原因',
        '标签名一旦发布就不要改：`-f` 覆盖后别人拉到的内容与你不同，会引发难以排查的构建差异',
        '删除远端标签用 `git push origin --delete v1.4.2`，只删本地标签不影响远端',
        '`v1.10` 与 `v1.9` 按字符串排序会反，脚本里一律用 `--sort=-v:refname`'
      ],
      related: ['ci-git-push', 'ci-git-log', 'ci-image-tag', 'ci-docker-buildx', 'hl-package'],
      docs: 'https://git-scm.com/docs/git-tag',
      tags: ['标签', '发布', '版本']
    },

    /* ---------- 21 / 41 ---------- */
    {
      id: 'ci-git-branch-remote',
      name: 'git remote / git branch -r',
      alias: ['git remote -v', 'git remote set-url', 'git remote prune', '远端管理'],
      level: 2,
      syntax: 'git remote [-v|add|remove|rename|set-url|prune|show] [名称] [地址]\ngit branch -r',
      summary: '管理远端仓库地址与引用，换仓库域名或加镜像仓时用。',
      desc: '一个本地仓库可以挂多个远端：`origin` 通常是主仓，`upstream` 常用于上游开源项目，也可以再加一个华为云 CodeArts 或 SWR 旁边的镜像仓。`git branch -r` 列出的是远程跟踪分支，它们是 fetch 时同步下来的本地快照，不是实时状态。',
      params: [
        { flag: '-v, --verbose', desc: '显示远端名与对应的 fetch/push 地址' },
        { flag: 'add <名> <地址>', desc: '新增一个远端' },
        { flag: 'set-url <名> <新地址>', desc: '修改远端地址，仓库迁移时用' },
        { flag: 'rename / remove', desc: '重命名 / 移除远端（remove 会一并删掉其远程跟踪分支）' },
        { flag: 'prune', desc: '清理远端已删除分支对应的本地跟踪引用' },
        { flag: 'show <名>', desc: '查看某远端的地址与跟踪关系详情' }
      ],
      examples: [
        { cmd: 'cd /data/app && git remote -v', desc: '确认当前仓库的推送与拉取地址，提交前先看清目标' },
        { cmd: 'cd /data/app && git remote add upstream https://github.com/kubernetes/kubernetes.git', desc: '添加上游仓库，便于同步官方更新' },
        { cmd: 'cd /data/app && git remote set-url origin https://codehub-cn-north-4.devcloud.huaweicloud.com/abc123/myapp.git', desc: '仓库迁移到华为云 CodeArts Repo 后更新地址' },
        { cmd: 'cd /data/app && git remote prune origin && git branch -r', desc: '清理远端已删除的分支引用并确认结果' },
        { cmd: 'cd /data/app && git push upstream main', desc: '把本地 main 推到指定名字的远端（默认是 origin）' }
      ],
      notes: [
        '`git remote remove` 会删掉该远端的所有跟踪分支引用，但不会删除远端服务器上的仓库',
        '改了远端地址后 `git push` 目标随之改变，多远端仓库里务必用 `git remote -v` 确认，避免推错仓库',
        '`git branch -r` 显示的是上次 fetch 的快照，看到的分支可能已经在服务端被删除，用 `--prune` 同步'
      ],
      related: ['ci-git-fetch', 'ci-git-push', 'ci-git-clone', 'ci-git-branch', 'ci-git-submodule'],
      docs: 'https://git-scm.com/docs/git-remote',
      tags: ['远端', '仓库', '迁移']
    },

    /* ---------- 22 / 41 ---------- */
    {
      id: 'ci-git-submodule',
      name: 'git submodule',
      alias: ['git submodule update --init', 'git submodule foreach', '子模块'],
      level: 3,
      syntax: 'git submodule add <仓库地址> <路径>\ngit submodule update --init --recursive [--remote]',
      summary: '在一个仓库里引用另一个仓库的固定提交，管理公用组件。',
      desc: '主仓只记录子模块的**提交 ID**，不保存其内容。所以克隆主仓后子模块目录是空的，必须 `git submodule update --init --recursive` 才能取到代码——这也是 CI 里最常见的「编译找不到公共库」原因。子模块默认停在锁定的提交上，要更新到远端最新需显式 `--remote`。',
      params: [
        { flag: '--init', desc: '初始化并拉取尚未检出的子模块，克隆后必加' },
        { flag: '--recursive', desc: '递归处理嵌套子模块' },
        { flag: '--remote', desc: '更新到子模块远端分支的最新提交，而不是锁定的提交' },
        { flag: 'foreach', desc: '在每个子模块里执行命令，如 `git submodule foreach git pull origin main`' },
        { flag: 'status', desc: '查看子模块状态，`+` 前缀表示子模块提交与主仓记录不一致' },
        { flag: 'deinit', desc: '反初始化子模块，用于彻底移除' }
      ],
      examples: [
        { cmd: 'cd /data/app && git submodule add https://gitee.com/myorg/common-protocol.git libs/common-protocol', desc: '在主仓里新增一个子模块' },
        { cmd: 'cd /data/app && git clone --recursive https://gitee.com/myorg/platform.git', desc: '克隆主仓时连同子模块一起拉取' },
        { cmd: 'cd /data/app && git submodule update --init --recursive', desc: '已经克隆完但子模块是空的，补拉全部子模块' },
        { cmd: 'cd /data/app && git submodule update --remote --merge libs/common-protocol', desc: '把子模块更新到其远端最新提交' },
        { cmd: 'cd /data/app && git submodule foreach --recursive git status -s', desc: '批量检查所有子模块是否有未提交改动' }
      ],
      notes: [
        '主仓记录的是子模块的**具体提交 ID**，同事更新了子模块却没在主仓提交新的引用，你拉下来还是旧代码，这是子模块最容易踩的坑',
        'CI 里必须在拉取脚本里加 `git submodule update --init --recursive`，浅克隆时还要加 `--depth` 参数',
        '子模块切分支后主仓会出现「new commits」提示，需要在主仓提交这次引用变更，否则别人拿不到',
        '团队若不熟悉子模块，改用包管理器（Maven/npm/Go module）发布公共库通常更省心'
      ],
      related: ['ci-git-clone', 'ci-git-branch-remote', 'ci-git-fetch', 'ci-jenkins-pipeline'],
      docs: 'https://git-scm.com/docs/git-submodule',
      tags: ['子模块', '依赖', 'CI']
    },

    /* ---------- 23 / 41 ---------- */
    {
      id: 'ci-git-bisect',
      name: 'git bisect',
      alias: ['git bisect run', 'git bisect start', '二分查找 bug'],
      level: 4,
      syntax: 'git bisect start [坏提交] [好提交]\ngit bisect good|bad|skip|run <脚本>|reset',
      summary: '用二分法在提交历史里定位引入 bug 的那一次提交。',
      desc: '给出一好一坏两个端点后，Git 每次自动检出中间提交，你验证后标记 `good` 或 `bad`，范围按对数缩小。100 个提交只需约 7 次验证。如果 bug 能用脚本判定，`git bisect run <脚本>` 可以全自动跑完，是排查「上周还好、这周就坏」这类问题的终极手段。',
      params: [
        { flag: 'start [坏] [好]', desc: '开始二分；不传参数则交互式标记' },
        { flag: 'good / bad', desc: '标记当前检出的提交是正常 / 有问题' },
        { flag: 'run <命令>', desc: '自动执行脚本判定：退出码 0 为好、1~124 与 126/127 为坏、125 表示跳过' },
        { flag: 'skip', desc: '当前提交无法测试（比如编译不过）时跳过' },
        { flag: 'log', desc: '查看二分过程的记录' },
        { flag: 'reset', desc: '结束二分并回到开始前的分支状态，必须执行' }
      ],
      examples: [
        { cmd: 'cd /data/app && git bisect start && git bisect bad && git bisect good v1.4.1', desc: '当前版本有问题、v1.4.1 正常，开始二分' },
        { cmd: 'cd /data/app && git bisect run mvn -q test -Dtest=OrderServiceTest', desc: '用测试结果自动判定，跑完直接给出首个坏提交' },
        { cmd: 'cd /data/app && git bisect run ./scripts/check-health.sh', desc: '用自定义健康检查脚本自动二分（脚本退出码 0 表示正常）' },
        { cmd: 'cd /data/app && git bisect skip', desc: '中间某个提交编译不过，跳过它继续' },
        { cmd: 'cd /data/app && git bisect reset', desc: '二分结束（或中途放弃）后回到原来的分支' }
      ],
      notes: [
        '开始前先提交或 stash 未完成的改动，`git bisect` 会切换工作区，脏工作区会导致检出失败',
        '结束时**一定要 `git bisect reset`**，否则仓库会停在某个历史提交的分离头指针状态，很容易误改代码',
        '`git bisect run` 的脚本退出码规则要记牢：0 = good，125 = skip，其余非 0 = bad；脚本里别用 `set -e` 掩盖真实退出码',
        '历史里有合并提交时结果可能不准，加 `--first-parent` 只在主干线上二分能避免追到功能分支内部',
        '二分依赖「好提交真的没问题」，端点选错会得出错误结论，先用可复现的用例确认两端状态'
      ],
      related: ['ci-git-log', 'ci-git-diff', 'ci-git-switch', 'ci-git-tag'],
      docs: 'https://git-scm.com/docs/git-bisect',
      tags: ['排查', '二分', '回归']
    },

    /* ---------- 24 / 41 ---------- */
    {
      id: 'ci-git-worktree',
      name: 'git worktree',
      alias: ['git worktree add', 'git worktree list', '多工作区'],
      level: 3,
      syntax: 'git worktree add [选项] <路径> [分支]\ngit worktree list|remove|prune',
      summary: '一个仓库挂多个工作目录，同时开发两个分支不用来回切。',
      desc: '`git worktree` 让同一个仓库在不同目录里检出不同分支，共享同一份 `.git` 数据（省磁盘、省克隆时间）。典型场景：主干上跑着构建或联调，同时要在另一个目录改 hotfix；或者在 CCE 环境验证时保留一份稳定版本目录。',
      params: [
        { flag: 'add <路径> <分支>', desc: '在指定路径检出已有分支' },
        { flag: '-b <新分支>', desc: '创建新分支并在该路径检出' },
        { flag: 'list', desc: '列出所有工作区及各自检出的分支' },
        { flag: 'remove <路径>', desc: '移除工作区（工作区有未提交改动会拒绝，需 `--force`）' },
        { flag: 'prune', desc: '清理已被手动删除目录的工作区记录' },
        { flag: 'lock / unlock', desc: '锁定工作区，防止被 `prune` 清理或误删' }
      ],
      examples: [
        { cmd: 'cd /data/app && git worktree add ../myapp-hotfix hotfix/urgent-482', desc: '在隔壁目录检出 hotfix 分支，当前目录的开发不中断' },
        { cmd: 'cd /data/app && git worktree add -b release/1.5 ../myapp-1.5 main', desc: '基于 main 新建发布分支并单独放在一个目录里' },
        { cmd: 'cd /data/app && git worktree list', desc: '查看当前所有工作区与分支对应关系' },
        { cmd: 'cd /data/app && git worktree remove ../myapp-hotfix', desc: 'hotfix 合并后清理工作区（未提交改动会拒绝）' },
        { cmd: 'cd /data/app && git worktree prune', desc: '目录被手动删掉后，清理残留的工作区记录' }
      ],
      notes: [
        '同一个分支**不能在两个工作区同时检出**，Git 会直接拒绝，没有 `--force` 可绕（这是保护机制）',
        '`remove` 拒绝执行说明工作区里有未提交改动，先提交或 stash，再用 `--force` 有丢改动风险',
        '工作区目录不要放在主仓库目录内部，否则会被主仓库当作未跟踪文件，`git status` 一片红',
        '删工作区目录要用 `git worktree remove` 或删完补 `git worktree prune`，直接 `rm -rf` 会留下垃圾记录'
      ],
      related: ['ci-git-switch', 'ci-git-branch', 'ci-git-stash', 'ci-git-clone'],
      docs: 'https://git-scm.com/docs/git-worktree',
      tags: ['多工作区', '并行', '效率']
    },

    /* ---------- 25 / 41 ---------- */
    {
      id: 'ci-git-config',
      name: 'git config 常用项',
      kind: 'recipe',
      alias: ['git config --global', 'pull.rebase', 'core.autocrlf', 'git alias'],
      level: 1,
      syntax: 'git config [--local|--global|--system] <键> [值]',
      summary: '配置用户名、别名与换行符策略，装机后第一批要设的项。',
      desc: '配置分三层，优先级由高到低是 `--local`（当前仓库 `.git/config`）、`--global`（`~/.gitconfig`）、`--system`。提交前必须设好 `user.name` 与 `user.email`，否则提交作者信息是错的。跨平台协作还要关注换行符：Windows 与 Linux 混用时建议统一用 LF。',
      params: [
        { flag: 'user.name / user.email', desc: '提交作者信息，不设置会拒绝提交或写成机器名' },
        { flag: 'core.autocrlf', desc: '换行符转换：Windows 常用 `true`，Linux/macOS 用 `input`，统一 LF 的项目用 `false`' },
        { flag: 'core.safecrlf', desc: '遇到会丢失换行信息的转换时给出警告，设为 `warn` 更安全' },
        { flag: 'pull.rebase', desc: '`git pull` 是否默认用 rebase，设为 `true` 可避免多余的合并提交' },
        { flag: 'core.longpaths', desc: 'Windows 上允许超长路径，深层目录检出失败时打开' },
        { flag: 'alias.<名>', desc: '自定义命令别名，如 `alias.st status`' },
        { flag: 'credential.helper', desc: '凭据缓存方式，避免每次输密码' }
      ],
      examples: [
        { cmd: 'cd /data/app && git config --global user.name "张三" && git config --global user.email "zhangsan@example.com"', desc: '装完 Git 第一件事：设置提交作者信息' },
        { cmd: 'cd /data/app && git config --global pull.rebase true', desc: '让 pull 默认走 rebase，保持提交历史线性' },
        { cmd: 'cd /data/app && git config --global alias.lg "log --graph --oneline --all --decorate"', desc: '定义别名，之后 `git lg` 一键看分支图' },
        { cmd: 'cd /data/app && git config --global core.autocrlf input', desc: 'Linux/macOS 上统一以 LF 入库，避免 CRLF 污染' },
        { cmd: 'cd /data/app && git config --global core.longpaths true', desc: 'Windows 上启用长路径支持，解决深层目录检出失败' },
        { cmd: 'cd /data/app && git config --list --show-origin', desc: '查看所有生效配置及其来源文件，排查配置冲突' }
      ],
      notes: [
        '`core.autocrlf` 设置不一致会让整个文件显示为「全部改动」，团队里要统一并在仓库加 `.gitattributes`（`* text=auto eol=lf`）彻底固定策略',
        '`--global` 只影响当前用户，服务器上用另一个账号跑 CI 时配置不生效，必要时对仓库单独 `--local` 设置',
        '别名只在本机有效，别在文档或脚本里依赖别名，脚本一律写完整命令',
        'Windows 中文用户名可能导致部分工具读取 `~/.gitconfig` 路径异常，可用 `git config --list --show-origin` 确认实际生效文件'
      ],
      related: ['ci-git-init', 'ci-git-commit', 'ci-git-push', 'ci-git-pull', 'ci-git-branch-remote'],
      docs: 'https://git-scm.com/docs/git-config',
      tags: ['配置', '换行符', '别名']
    },

    /* ================= C. Jenkins ================= */

    /* ---------- 26 / 41 ---------- */
    {
      id: 'ci-jenkins-cli',
      name: 'jenkins-cli',
      alias: ['java -jar jenkins-cli.jar', 'jenkins cli', 'jenkins 命令行'],
      level: 3,
      syntax: 'java -jar jenkins-cli.jar -s <Jenkins地址> -auth <用户名:API Token> <子命令> [参数]',
      summary: '在终端触发构建、看日志、管任务，不用打开浏览器。',
      desc: 'Jenkins 自带 CLI 客户端（`<Jenkins地址>/jnlpJars/jenkins-cli.jar`），认证推荐用「用户名:API Token」而不是密码。常用子命令覆盖构建触发、日志查看、任务增删与重启，适合脚本化运维和紧急排障。',
      params: [
        { flag: '-s <URL>', desc: 'Jenkins 服务地址，如 `http://jenkins.internal.example.com:8080`' },
        { flag: '-auth <用户名:Token>', desc: '认证信息；Token 在「用户设置 → API Token」里生成' },
        { flag: 'build <任务> -p K=V', desc: '触发参数化构建' },
        { flag: 'console <任务> [-f]', desc: '查看构建控制台输出，`-f` 持续跟踪' },
        { flag: '-webSocket', desc: '走 WebSocket 传输，绕过反向代理对 CLI 协议的限制' },
        { flag: 'list-jobs / who-am-i', desc: '列出任务 / 确认当前认证身份与权限' }
      ],
      examples: [
        { cmd: 'java -jar jenkins-cli.jar -s http://jenkins.internal.example.com:8080 -auth zhangsan:11ab22cd33ef44 jenkins-cli-version', desc: '先验证 CLI 与认证是否可用' },
        { cmd: 'java -jar jenkins-cli.jar -s http://jenkins.internal.example.com:8080 -auth zhangsan:11ab22cd33ef44 build myapp-deploy -p BRANCH=release/1.4 -p IMAGE_TAG=1.4.2 -f', desc: '触发参数化部署任务并跟踪输出' },
        { cmd: 'java -jar jenkins-cli.jar -s http://jenkins.internal.example.com:8080 -auth zhangsan:11ab22cd33ef44 console myapp-deploy -f', desc: '实时跟踪构建日志，排障时不用刷页面' },
        { cmd: 'java -jar jenkins-cli.jar -s http://jenkins.internal.example.com:8080 -auth zhangsan:11ab22cd33ef44 list-jobs', desc: '列出所有任务名，用于批量脚本' },
        { cmd: 'java -jar jenkins-cli.jar -s http://jenkins.internal.example.com:8080 -auth zhangsan:11ab22cd33ef44 safe-restart', desc: '等所有构建结束后安全重启 Jenkins' }
      ],
      notes: [
        'API Token 等同于密码，写进脚本会留在历史记录里，CI 场景要用凭据管理而不是明文',
        '反向代理只放行 HTTP 时 CLI 可能连不上，加 `-webSocket` 或改用 HTTP 的 REST 接口（`/job/<任务>/buildWithParameters`）',
        '`restart` 会立刻中断正在跑的构建，优先用 `safe-restart`',
        'CLI 版本要与 Jenkins 主版本匹配，直接从服务端下载 `jnlpJars/jenkins-cli.jar` 最稳'
      ],
      related: ['ci-jenkins-pipeline', 'ci-jenkins-params', 'ci-gitlab-runner', 'ci-argocd-sync'],
      docs: 'https://www.jenkins.io/doc/book/managing/cli/',
      tags: ['Jenkins', '命令行', '运维']
    },

    /* ---------- 27 / 41 ---------- */
    {
      id: 'ci-jenkins-pipeline',
      name: 'Jenkinsfile 声明式流水线结构',
      kind: 'recipe',
      alias: ['Jenkinsfile', 'pipeline agent stages steps post'],
      level: 3,
      syntax: 'pipeline { agent any; stages { stage("名称") { steps { ... } } } post { always { ... } } }',
      summary: '用声明式语法描述整条流水线，从拉代码到部署收尾。',
      desc: '声明式流水线（`pipeline {}`）比脚本式（`node {}`）结构更严格、更容易被 Jenkins 校验和可视化。核心块：`agent` 决定在哪台节点跑、`environment` 定义环境变量、`stages` 里是顺序执行的阶段、`post` 按构建结果收尾（发通知、清 workspace）。把 Jenkinsfile 放进代码仓库，流水线就跟着代码一起版本化。',
      params: [
        { flag: 'agent', desc: '执行节点：`any` / `none` / `label "build"` / `kubernetes { yaml "..." }' },
        { flag: 'environment', desc: '环境变量，支持凭据函数 `credentials("id")`' },
        { flag: 'options', desc: '`timeout`、`retry`、`timestamps`、`disableConcurrentBuilds` 等流水线级配置' },
        { flag: 'stages / stage / steps', desc: '阶段与步骤，步骤是真正执行 shell、docker、sh 的地方' },
        { flag: 'post', desc: '收尾块：`always`/`success`/`failure`/`unstable`/`cleanup`' },
        { flag: 'parameters', desc: '声明构建参数，见 `ci-jenkins-params`' },
        { flag: 'when', desc: '阶段执行条件，见 `ci-jenkins-when`' }
      ],
      examples: [
        { cmd: 'pipeline {\n  agent { label "build-node" }\n  options { timeout(time: 30, unit: "MINUTES"); timestamps() }\n  environment {\n    REGISTRY = "swr.cn-north-4.myhuaweicloud.com/myorg"\n  }\n  stages {\n    stage("检出代码") {\n      steps { checkout scm }\n    }\n    stage("单元测试") {\n      steps { sh "mvn -B clean test" }\n    }\n    stage("构建镜像") {\n      steps {\n        sh "docker build -t $REGISTRY/myapp:$BUILD_NUMBER ."\n      }\n    }\n    stage("推送镜像") {\n      steps {\n        withCredentials([usernamePassword(credentialsId: "swr-login", usernameVariable: "SWR_USER", passwordVariable: "SWR_PASS")]) {\n          sh "docker login -u $SWR_USER -p $SWR_PASS swr.cn-north-4.myhuaweicloud.com"\n          sh "docker push $REGISTRY/myapp:$BUILD_NUMBER"\n        }\n      }\n    }\n    stage("部署到 CCE") {\n      steps {\n        sh "helm upgrade --install myapp ./charts/myapp -n prod --set image.tag=$BUILD_NUMBER --wait --timeout 10m"\n      }\n    }\n  }\n  post {\n    success { echo "发布成功：$BUILD_NUMBER" }\n    failure { echo "构建失败，请查看控制台日志" }\n    always { cleanWs() }\n  }\n}', desc: '一份完整可读的声明式 Jenkinsfile：拉码 → 测试 → 构建 → 推 SWR → 用 Helm 发布到 CCE' },
        { cmd: 'stage("打包") {\n  agent { docker { image "maven:3.9-eclipse-temurin-17" args "-v $HOME/.m2:/root/.m2" } }\n  steps { sh "mvn -B -DskipTests package" }\n}', desc: '用容器化的 stage 级 agent，工具链由镜像保证，不依赖节点上装了什么' },
        { cmd: 'stage("构建镜像") {\n  steps {\n    script {\n      def tag = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()\n      sh "docker build -t $REGISTRY/myapp:$tag ."\n    }\n  }\n}', desc: '在 steps 里用 `script {}` 嵌一小段 Groovy，取 commit 短哈希当镜像标签' }
      ],
      notes: [
        '声明式流水线里写 Groovy 逻辑必须放进 `script {}` 块，直接写在 `steps` 里会报语法错误',
        '`agent` 声明在 `pipeline` 顶层时整个流水线占用同一个节点；用 `agent none` + 每个 stage 单独声明，才能让不同阶段跑在不同节点或容器里',
        '敏感信息一律用 `credentials()` 或 `withCredentials`，不要 `environment { PASSWORD = "xxx" }` 写死在 Jenkinsfile 里',
        '`options { disableConcurrentBuilds() }` 对共享环境（同一套 CCE 命名空间）的部署流水线很关键，否则并发发布容易互相覆盖',
        'Jenkinsfile 建议放进代码仓库根目录并用「Pipeline script from SCM」加载，日志里会显示该版本的提交 ID，便于追溯'
      ],
      related: ['ci-jenkins-credentials', 'ci-jenkins-params', 'ci-jenkins-parallel', 'ci-jenkins-when', 'ci-jenkins-archive', 'hl-upgrade-install'],
      docs: 'https://www.jenkins.io/doc/book/pipeline/syntax/',
      tags: ['Jenkins', '流水线', 'YAML']
    },

    /* ---------- 28 / 41 ---------- */
    {
      id: 'ci-jenkins-credentials',
      name: 'Jenkins credentials 引用',
      kind: 'recipe',
      alias: ['withCredentials', 'credentials()', '凭据管理'],
      level: 3,
      syntax: 'environment { VAR = credentials("凭据ID") }\nwithCredentials([usernamePassword(credentialsId: "凭据ID", usernameVariable: "U", passwordVariable: "P")]) { ... }',
      summary: '把账号密钥从 Jenkins 凭据库注入流水线，避免明文外泄。',
      desc: '凭据在「系统管理 → 凭据」里集中维护（支持用户名密码、Secret 文本、SSH 私钥、证书等），Jenkinsfile 里只引用 ID。`credentials()` 用于 `environment` 块，会同时生成 `VAR`、`VAR_USR`、`VAR_PSW` 三个变量；`withCredentials` 更灵活，作用域限定在块内，且日志会自动把密码打码。',
      params: [
        { flag: 'credentials("id")', desc: '在 `environment` 里使用；生成 `VAR`、`VAR_USR`（用户名）、`VAR_PSW`（密码）' },
        { flag: 'usernamePassword(...)', desc: '用户名密码型凭据，指定 `credentialsId` 与两个变量名' },
        { flag: 'string(...)', desc: 'Secret 文本型，如 AK/SK、Token' },
        { flag: 'sshUserPrivateKey(...)', desc: 'SSH 私钥型，可取出 `keyFileVariable` 路径给 `ssh -i` 用' },
        { flag: 'file(...)', desc: '文件型凭据，如 kubeconfig、证书，取出临时文件路径' },
        { flag: 'certificate(...)', desc: '证书型凭据（PKCS#12），用于签名场景' }
      ],
      examples: [
        { cmd: 'environment {\n  SWR = credentials("swr-cn-north-4")\n}\nsteps {\n  sh "docker login -u $SWR_USR -p $SWR_PSW swr.cn-north-4.myhuaweicloud.com"\n}', desc: '在 environment 里引用凭据，自动拆出用户名与密码变量登录 SWR' },
        { cmd: 'withCredentials([file(credentialsId: "cce-kubeconfig", variable: "KUBECONFIG")]) {\n  sh "kubectl get nodes"\n  sh "helm upgrade --install myapp ./charts/myapp -n prod -f values-prod.yaml --wait"\n}', desc: '把 CCE 的 kubeconfig 作为文件凭据挂进流水线，后续 kubectl/helm 直接可用' },
        { cmd: 'withCredentials([sshUserPrivateKey(credentialsId: "deploy-key", keyFileVariable: "SSH_KEY")]) {\n  sh "ssh -i $SSH_KEY -o StrictHostKeyChecking=no root@<ECS弹性公网IP> \\"systemctl restart myapp\\""\n}', desc: '用 SSH 私钥凭据登录 ECS 执行重启' },
        { cmd: 'withCredentials([string(credentialsId: "obs-ak-sk", variable: "OBS_AK")]) {\n  sh "obsutil ls obs://myapp-release -i=$OBS_AK"\n}', desc: '用 Secret 文本凭据取华为云 AK，配合 obsutil 上传制品' }
      ],
      notes: [
        '凭据 ID 写错会在运行时才报 `CredentialNotFoundException`，声明式流水线可在 Jenkins 的流水线语法生成器里核对 ID',
        'Jenkins 会对控制台输出里的密码做打码，但如果脚本把密码写进文件或 URL，仍可能泄露，避免 `echo $PWD_VAR`',
        '`environment` 里的 `credentials()` 在整个流水线生命周期内有效；只在某个阶段用到的凭据应改用 `withCredentials` 缩小暴露范围',
        '凭据在 Jenkins 里是加密存储的，但拥有管理员权限的人可以读取，生产密钥建议结合 Vault 或云凭据服务',
        '把 kubeconfig 作为文件凭据注入后，`KUBECONFIG` 变量只在该 `withCredentials` 块内有效，出块就失效'
      ],
      related: ['ci-jenkins-pipeline', 'ci-jenkins-params', 'ci-gitlab-variables', 'ci-argocd-sync', 'hl-push'],
      docs: 'https://www.jenkins.io/doc/book/pipeline/jenkinsfile/#handling-credentials',
      tags: ['Jenkins', '凭据', '安全']
    },

    /* ---------- 29 / 41 ---------- */
    {
      id: 'ci-jenkins-parallel',
      name: 'Jenkins parallel 并行阶段',
      kind: 'recipe',
      alias: ['parallel', '并行执行', 'failFast'],
      level: 3,
      syntax: 'stage("测试") { parallel { stage("单元测试") { steps { ... } } stage("集成测试") { steps { ... } } } }',
      summary: '让多个独立阶段同时跑，明显缩短流线总时长。',
      desc: '`parallel` 块里的子 stage 会并发执行，适合相互独立的单元测试、代码扫描、镜像构建等。也可以写成 `parallel firstBranch: { ... }, secondBranch: { ... }` 的 map 形式。加 `failFast true` 后，任一分支失败会立刻取消其他分支，节省资源。',
      params: [
        { flag: 'parallel { }', desc: '块形式：内部若干 stage 并发执行' },
        { flag: 'failFast true', desc: '任一分支失败即中止其余分叉' },
        { flag: 'parallel map 形式', desc: '`parallel a: { ... }, b: { ... }`，可传 `failFast` 参数' },
        { flag: 'agent', desc: '每个并行分支可单独指定 agent，让它们真正跑在不同节点/容器上' }
      ],
      examples: [
        { cmd: 'stage("质量检查") {\n  failFast true\n  parallel {\n    stage("单元测试") {\n      steps { sh "mvn -B test" }\n    }\n    stage("静态扫描") {\n      steps { sh "mvn -B sonar:sonar -Dsonar.projectKey=myapp" }\n    }\n    stage("依赖漏洞检查") {\n      steps { sh "mvn -B org.owasp:dependency-check-maven:check" }\n    }\n  }\n}', desc: '把测试、扫描、漏洞检查并行跑，总耗时从十几分钟压到几分钟' },
        { cmd: 'stage("多架构镜像") {\n  parallel {\n    stage("amd64") {\n      agent { label "build-amd64" }\n      steps { sh "docker buildx build --platform linux/amd64 -t $REGISTRY/myapp:$TAG-amd64 ." }\n    }\n    stage("arm64") {\n      agent { label "build-arm64" }\n      steps { sh "docker buildx build --platform linux/arm64 -t $REGISTRY/myapp:$TAG-arm64 ." }\n    }\n  }\n}', desc: '在两个不同架构的节点上并行构建镜像' },
        { cmd: 'parallel(\n  "构建": { sh "mvn -B package" },\n  "文档": { sh "mkdocs build" },\n  failFast: true\n)', desc: 'map 形式的 parallel，用 Groovy 变量作为分支名' }
      ],
      notes: [
        '并行分支若跑在同一个节点上，会争抢 CPU、内存和本地端口，可能互相干扰；共享资源（如固定端口、本地 MySQL）的测试不要并行',
        '并行阶段输出到控制台时会交错，排障时按分支名字看，或让每个分支把日志写到独立文件再归档',
        '`failFast` 只影响同级的并行分叉，不会中止已经在跑的 `post` 块',
        '并行阶段里不要操作同一份 workspace 的同一文件（如都往 `target/` 写），容易互相覆盖；用 `agent` 分开工作区最稳妥',
        '并行度太高会把 Jenkins 节点压满，建议配合 `options { parallelsAlwaysFailFast() }` 或限制节点执行器数量'
      ],
      related: ['ci-jenkins-pipeline', 'ci-jenkins-when', 'ci-jenkins-archive', 'ci-docker-buildx'],
      docs: 'https://www.jenkins.io/doc/book/pipeline/syntax/#parallel',
      tags: ['Jenkins', '并行', '提速']
    },

    /* ---------- 30 / 41 ---------- */
    {
      id: 'ci-jenkins-when',
      name: 'Jenkins when 条件',
      kind: 'recipe',
      alias: ['when', 'when branch', '条件执行阶段'],
      level: 3,
      syntax: 'stage("名称") { when { branch "main" } steps { ... } }',
      summary: '按分支、环境变量或文件变化决定某个阶段是否执行。',
      desc: '`when` 是声明式流水线的条件闸门：不满足条件的阶段会被标记为 skipped，不执行 `steps`，也不会让构建失败。常见条件有 `branch`（分支匹配）、`environment`（环境变量值）、`changeset`（指定文件有改动）、`expression`（Groovy 表达式）、`not/allOf/anyOf`（组合条件）。',
      params: [
        { flag: 'branch "main"', desc: '当前分支匹配时执行，支持通配，如 `branch "release/*"' },
        { flag: 'tag "v*"', desc: '按标签匹配，常配合 `buildingTag()` 用于发版阶段' },
        { flag: 'environment name: "DEPLOY_ENV", value: "prod"', desc: '按环境变量值判断' },
        { flag: 'changeset "src/**"', desc: '指定路径的文件有改动时才执行，做增量构建很有用' },
        { flag: 'expression { return params.DEPLOY }', desc: 'Groovy 表达式，返回 true 才执行' },
        { flag: 'allOf / anyOf / not', desc: '组合多个条件，如 `allOf { branch "main"; expression { ... } }`' },
        { flag: 'beforeAgent true', desc: '先判断条件再分配 agent，跳过的阶段不占用节点' }
      ],
      examples: [
        { cmd: 'stage("部署生产") {\n  when {\n    allOf {\n      branch "main"\n      environment name: "DEPLOY_ENV", value: "prod"\n    }\n  }\n  steps {\n    sh "helm upgrade --install myapp ./charts/myapp -n prod -f values-prod.yaml --atomic --wait"\n  }\n}', desc: '只有 main 分支才允许部署生产，双条件把住发布闸门' },
        { cmd: 'stage("发布版本") {\n  when { tag "v*" }\n  steps {\n    sh "helm package ./charts/myapp -d ./dist"\n    sh "helm push ./dist/myapp-*.tgz oci://swr.cn-north-4.myhuaweicloud.com/myorg"\n  }\n}', desc: '打上 v 开头的标签时才发布 Chart 到 SWR' },
        { cmd: 'stage("前端构建") {\n  when { changeset "web/**" }\n  steps { sh "pnpm -C web install && pnpm -C web build" }\n}', desc: '只有前端目录有改动才构建前端，避免无谓耗时' },
        { cmd: 'stage("灰度发布") {\n  when {\n    beforeAgent true\n    expression { return params.CANARY == "true" }\n  }\n  steps { sh "./scripts/canary-release.sh $IMAGE_TAG" }\n}', desc: '按构建参数决定是否走灰度流程，`beforeAgent true` 让跳过时不必等待节点' }
      ],
      notes: [
        '`when` 判断为假时阶段状态是 skipped，构建整体算成功，别把安全闸门只放在 `when` 上，关键校验还应配合 `input` 人工确认',
        '`branch` 只对多分支流水线有意义；普通流水线里应改用 `expression { env.BRANCH_NAME == "main" }` 或构建参数',
        '`changeset` 依赖 SCM 的变更信息，浅克隆或非多分支流水线下可能判断不出，需要保证 checkout 带了足够信息',
        '复杂条件写成 `expression` 时注意返回布尔值，写成字符串会被当作 false，导致阶段静默跳过',
        '`beforeAgent true` 能省节点资源，但条件里就不能引用依赖 agent 的变量了'
      ],
      related: ['ci-jenkins-pipeline', 'ci-jenkins-params', 'ci-jenkins-parallel', 'ci-gitlab-rules'],
      docs: 'https://www.jenkins.io/doc/book/pipeline/syntax/#when',
      tags: ['Jenkins', '条件', '发布闸门']
    },

    /* ---------- 31 / 41 ---------- */
    {
      id: 'ci-jenkins-params',
      name: 'Jenkins 构建参数与 parameters',
      kind: 'recipe',
      alias: ['parameters', 'params', '参数化构建'],
      level: 3,
      syntax: 'parameters { string(name: "BRANCH", defaultValue: "main", description: "分支") }\n使用：params.BRANCH 或 ${params.BRANCH}',
      summary: '声明构建参数，让同一条流水线按输入跑不同环境。',
      desc: '`parameters` 块声明的参数会出现在「Build with Parameters」页面，也能通过 CLI 或 API 传入。类型有 `string`、`text`、`booleanParam`、`choice`、`password`、`file`。声明式流水线里用 `params.名称` 读取；`choice` 常用于让发布人从固定分支/环境列表里选，避免手输错。',
      params: [
        { flag: 'string', desc: '字符串参数，如分支名、镜像标签' },
        { flag: 'booleanParam', desc: '布尔开关，常用于「是否部署到生产」' },
        { flag: 'choice', desc: '下拉单选，如环境列表 dev/test/prod' },
        { flag: 'text', desc: '多行文本，如一段配置或发布说明' },
        { flag: 'password', desc: '密码型参数，输入框打码' },
        { flag: 'params.名称', desc: '读取方式；在 shell 步骤里是环境变量 `${params.名称}` 或 `$名称`' }
      ],
      examples: [
        { cmd: 'parameters {\n  choice(name: "DEPLOY_ENV", choices: ["dev", "test", "prod"], description: "部署环境")\n  string(name: "IMAGE_TAG", defaultValue: "latest", description: "镜像标签，留空则用构建号")\n  booleanParam(name: "RUN_MIGRATION", defaultValue: false, description: "是否执行数据库迁移")\n}', desc: '声明环境、镜像标签与迁移开关三个参数' },
        { cmd: 'stage("部署") {\n  steps {\n    sh "helm upgrade --install myapp ./charts/myapp -n ${params.DEPLOY_ENV} -f values-${params.DEPLOY_ENV}.yaml --set image.tag=${params.IMAGE_TAG} --wait"\n  }\n}', desc: '用参数拼出命名空间与 values 文件，一条流水线覆盖三套环境' },
        { cmd: 'stage("数据库迁移") {\n  when { expression { return params.RUN_MIGRATION } }\n  steps { sh "./scripts/migrate.sh ${params.DEPLOY_ENV}" }\n}', desc: '用布尔参数控制是否执行迁移，避免误操作' },
        { cmd: 'java -jar jenkins-cli.jar -s http://jenkins.internal.example.com:8080 -auth zhangsan:11ab22cd33ef44 build myapp-deploy -p DEPLOY_ENV=prod -p IMAGE_TAG=1.4.2 -f', desc: '从命令行带参数触发发布，便于与其他系统集成' }
      ],
      notes: [
        '`parameters` 块**只在第一次运行后生效**：新建的流水线首次构建时参数尚未注册，此时读 `params.X` 会得到 null，脚本里要给默认值兜底',
        '参数是字符串类型，布尔参数传进 shell 时是 `true`/`false` 字符串，做数值比较前先转换',
        '别把敏感值做成 `string` 参数，用 `password` 类型或凭据；参数值会出现在构建历史与日志里',
        '`choice` 的选项变更需要重新运行一次流水线才会刷新，改完记得提交并触发一次构建',
        '生产发布建议同时用 `input` 做人工确认，光靠参数选择器防不住手滑'
      ],
      related: ['ci-jenkins-pipeline', 'ci-jenkins-when', 'ci-jenkins-cli', 'ci-jenkins-credentials'],
      docs: 'https://www.jenkins.io/doc/book/pipeline/syntax/#parameters',
      tags: ['Jenkins', '参数', '多环境']
    },

    /* ---------- 32 / 41 ---------- */
    {
      id: 'ci-jenkins-archive',
      name: 'Jenkins archiveArtifacts 制品归档',
      kind: 'recipe',
      alias: ['archiveArtifacts', 'junit', '制品归档'],
      level: 2,
      syntax: 'archiveArtifacts artifacts: "target/*.jar", fingerprint: true, allowEmptyArchive: false',
      summary: '把构建产物与测试报告留存下来，供下载和版本追溯。',
      desc: '`archiveArtifacts` 把指定的文件保存到 Jenkins 构建记录里（可在构建页面下载），并支持指纹追踪「这个 jar 被哪些下游构建使用过」。配合 `junit` 解析测试报告、`publishHTML` 归档覆盖率页面，一次构建的产物、报告、日志就都齐了。',
      params: [
        { flag: 'artifacts', desc: '文件通配符，如 `"target/*.jar, dist/**/*.tar.gz"`' },
        { flag: 'fingerprint', desc: '开启指纹追踪，记录该制品被谁使用' },
        { flag: 'allowEmptyArchive', desc: '允许匹配为空而不报错，默认 false（没产物会让构建失败）' },
        { flag: 'onlyIfSuccessful', desc: '只在构建成功时归档' },
        { flag: 'junit', desc: '解析 JUnit XML 测试报告，生成趋势图' },
        { flag: 'excludes', desc: '排除某些文件，避免归档体积失控' }
      ],
      examples: [
        { cmd: 'post {\n  always {\n    junit allowEmptyResults: true, testResults: "target/surefire-reports/*.xml"\n    archiveArtifacts artifacts: "target/*.jar", fingerprint: true\n  }\n}', desc: '无论成败都归档测试报告与 jar 包，作为发布依据' },
        { cmd: 'archiveArtifacts artifacts: "dist/*.tar.gz, dist/*.sha256", fingerprint: true, allowEmptyArchive: false', desc: '归档打包产物与校验和，缺产物时直接让构建失败' },
        { cmd: 'archiveArtifacts artifacts: "coverage/**", excludes: "coverage/**/*.tmp", onlyIfSuccessful: true', desc: '只在成功时归档覆盖率报告并排除临时文件' },
        { cmd: 'sh "tar -czf myapp-$BUILD_NUMBER.tar.gz -C target myapp.jar"\narchiveArtifacts artifacts: "myapp-$BUILD_NUMBER.tar.gz", fingerprint: true', desc: '先打成带构建号的压缩包再归档，避免同名覆盖' }
      ],
      notes: [
        '归档文件存在 Jenkins 主目录（`$JENKINS_HOME/jobs/<任务>/builds/<编号>/archive`），大量大文件会迅速吃满磁盘，设置保留策略（`buildDiscarder`）与定期清理',
        '`allowEmptyArchive` 默认 false，通配符没匹配到文件会让构建失败，用 `when` 跳过阶段时要留意',
        '大镜像、大型二进制不要用 `archiveArtifacts`，应推到 SWR / OBS 等制品库，归档里只留校验和与清单',
        '开启 `fingerprint: true` 后能追踪制品流向，是排查「哪个版本被部署到生产」的可靠依据',
        '`junit` 报告路径写错不会报错、只会没有趋势图，首次配置后要在构建页面确认数据已生成'
      ],
      related: ['ci-jenkins-pipeline', 'ci-jenkins-parallel', 'ci-docker-buildx', 'ci-argocd-sync', 'hl-push'],
      docs: 'https://www.jenkins.io/doc/pipeline/steps/core/',
      tags: ['Jenkins', '制品', '归档']
    },

    /* ================= D. GitLab CI ================= */

    /* ---------- 33 / 41 ---------- */
    {
      id: 'ci-gitlab-yml',
      name: '.gitlab-ci.yml 结构',
      kind: 'recipe',
      alias: ['gitlab-ci.yml', 'stages script rules artifacts cache'],
      level: 3,
      syntax: 'stages: [...]\n<job名>: { stage, script, rules, artifacts, cache, tags }',
      summary: '定义 GitLab 流水线的阶段与作业，随代码一起版本化。',
      desc: '一个 `.gitlab-ci.yml` 由 `stages`（阶段顺序）和若干 job（作业）组成，job 通过 `stage` 归属到某个阶段，同阶段内的 job 并行执行、阶段之间串行。`script` 是必填的 Shell 片段；`rules` 控制是否执行；`artifacts` 在阶段间传文件；`cache` 缓存依赖加速；`tags` 决定用哪个 Runner。',
      params: [
        { flag: 'stages', desc: '阶段顺序数组，未声明时默认 `build`/`test`/`deploy`' },
        { flag: 'script', desc: '必填，Shell 命令数组，每一项在多行 YAML 里可用 `-` 列出' },
        { flag: 'rules', desc: '执行条件，支持 `if`、`changes`、`when`、`exists`' },
        { flag: 'only / except', desc: '旧版条件语法，新项目建议统一用 `rules`' },
        { flag: 'artifacts', desc: '归档产物并传给后续阶段，可设 `paths`、`expire_in`、`reports`' },
        { flag: 'cache', desc: '缓存依赖目录（如 `.m2`、`node_modules`），按 `key` 隔离' },
        { flag: 'tags', desc: '选择带对应标签的 GitLab Runner' },
        { flag: 'needs', desc: '跳过阶段顺序，直接依赖指定 job（DAG），见 `ci-gitlab-needs`' }
      ],
      examples: [
        { cmd: 'stages:\n  - build\n  - test\n  - package\n  - deploy\n\nvariables:\n  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository"\n\ncache:\n  key: "$CI_COMMIT_REF_SLUG"\n  paths:\n    - .m2/repository\n\nbuild-job:\n  stage: build\n  image: maven:3.9-eclipse-temurin-17\n  script:\n    - mvn -B -DskipTests clean package\n  artifacts:\n    paths:\n      - target/*.jar\n    expire_in: 1 week\n\ntest-job:\n  stage: test\n  image: maven:3.9-eclipse-temurin-17\n  script:\n    - mvn -B test\n  artifacts:\n    when: always\n    reports:\n      junit: target/surefire-reports/TEST-*.xml\n\ndeploy-prod:\n  stage: deploy\n  image: alpine/helm:3.14.0\n  rules:\n    - if: \'$CI_COMMIT_BRANCH == "main"\'\n      when: manual\n  script:\n    - helm upgrade --install myapp ./charts/myapp -n prod --create-namespace -f values-prod.yaml --set image.tag=$CI_COMMIT_SHORT_SHA --wait --timeout 10m\n  environment:\n    name: prod\n    url: https://myapp.example.com', desc: '完整的 Java 项目流水线：构建、测试、归档、手动确认后部署到生产' },
        { cmd: 'include:\n  - local: "/ci/common-rules.yml"\n  - project: "devops/ci-templates"\n    ref: "v1.2.0"\n    file: "/templates/maven.yml"', desc: '用 include 复用公共流水线模板，多项目共享一套 CI 逻辑' },
        { cmd: 'default:\n  image: maven:3.9-eclipse-temurin-17\n  before_script:\n    - echo "当前分支 $CI_COMMIT_BRANCH，提交 $CI_COMMIT_SHORT_SHA"\n  retry:\n    max: 2\n    when: runner_system_failure', desc: '用 default 给所有 job 设默认镜像、前置脚本与重试策略' }
      ],
      notes: [
        '`artifacts` 只在**同一流水线的后续阶段**可用，跨流水线取文件要用制品库或 `needs:project`',
        '`cache` 是尽力而为的加速手段，可能命中失败甚至被清理，不能当作产物传递机制（传产物用 `artifacts`）',
        '`cache:key` 不区分分支时，不同分支会互相污染依赖目录，用 `$CI_COMMIT_REF_SLUG` 做 key 更安全',
        '`rules` 与 `only/except` 不能在同一 job 混用，混用会导致语法错误',
        '改 `.gitlab-ci.yml` 后可用 GitLab 界面的 CI Lint 或 `/ci/lint` 接口先校验语法，别直接推到主干试错'
      ],
      related: ['ci-gitlab-rules', 'ci-gitlab-variables', 'ci-gitlab-needs', 'ci-gitlab-services', 'ci-gitlab-runner'],
      docs: 'https://docs.gitlab.com/ee/ci/yaml/',
      tags: ['GitLab', '流水线', 'YAML']
    },

    /* ---------- 34 / 41 ---------- */
    {
      id: 'ci-gitlab-runner',
      name: 'gitlab-runner register',
      alias: ['gitlab-runner', '注册 runner', 'Runner 安装'],
      level: 3,
      syntax: 'gitlab-runner register --non-interactive --url <GitLab地址> --token <令牌> --executor <执行器> [--docker-image <镜像>]',
      summary: '把一台机器注册成 GitLab Runner，让它能接走流水线作业。',
      desc: 'Runner 是真正执行 job 的进程，注册时要用 GitLab 项目/群组里生成的 Runner 认证令牌（新版界面在「设置 → CI/CD → Runners」里创建）。注册信息写入 `/etc/gitlab-runner/config.toml`，可以后续手工调整并发与 docker 参数。常用执行器：`docker`（隔离好、最常用）、`shell`（最简单但污染主机）、`kubernetes`（跑在 CCE 集群里，弹性最好）。',
      params: [
        { flag: '--url', desc: 'GitLab 实例地址，如 `https://gitlab.example.com/`' },
        { flag: '--token', desc: 'Runner 认证令牌（新版为 `glrt-` 开头），不是注册令牌' },
        { flag: '--executor', desc: '执行器：`docker` / `shell` / `kubernetes` / `docker-machine`' },
        { flag: '--docker-image', desc: 'docker 执行器的默认镜像，如 `maven:3.9-eclipse-temurin-17`' },
        { flag: '--tag-list', desc: '打标签，job 里用 `tags` 选择该 Runner，如 `--tag-list "build,linux"' },
        { flag: '--description', desc: 'Runner 描述，界面上便于识别' },
        { flag: 'list / verify / unregister', desc: '查看已注册 Runner / 验证连通性 / 注销' }
      ],
      examples: [
        { cmd: 'gitlab-runner register --non-interactive --url https://gitlab.example.com/ --token glrt-<Runner认证令牌> --executor docker --docker-image maven:3.9-eclipse-temurin-17 --description "build-node-01" --tag-list "build,linux"', desc: '注册一台 docker 执行器的 Runner 并打上 build 标签' },
        { cmd: 'gitlab-runner list', desc: '查看本机已注册的 Runner 及其配置' },
        { cmd: 'gitlab-runner verify', desc: '验证 Runner 与 GitLab 的连通性' },
        { cmd: 'gitlab-runner run --config /etc/gitlab-runner/config.toml', desc: '前台运行，便于直接观察日志排障' },
        { cmd: 'gitlab-runner register --non-interactive --url https://gitlab.example.com/ --token glrt-<Runner认证令牌> --executor kubernetes --kubernetes-namespace gitlab-runner', desc: '注册 kubernetes 执行器，把构建负载跑在 CCE 集群里' }
      ],
      notes: [
        'GitLab 16 起新 Runner 使用 `glrt-` 开头的**认证令牌**，旧的注册令牌方式已弃用，注册前先在界面创建 Runner 拿到令牌',
        '`shell` 执行器直接跑在主机上，构建脚本能改主机环境、残留文件，多项目共用时要谨慎；优先用 `docker` 执行器',
        'docker 执行器需要 Runner 容器能访问宿主机的 Docker（挂载 `/var/run/docker.sock` 或使用 dind），构建镜像前确认这一层通了',
        '`tags` 不匹配会导致 job 一直卡在 pending，报「This job is stuck」先检查 Runner 标签与 `tags` 是否对得上，以及 Runner 是否勾选了「运行未打标签的作业」',
        '并发数受 `config.toml` 里 `concurrent` 限制，默认 1 会让多项目排队，按机器规格调整',
        '注册命令里的令牌等同于凭据，不要提交进仓库或写进镜像'
      ],
      related: ['ci-gitlab-yml', 'ci-gitlab-services', 'ci-gitlab-variables', 'ci-docker-buildx', 'ci-jenkins-pipeline'],
      docs: 'https://docs.gitlab.com/runner/register/',
      tags: ['GitLab', 'Runner', '注册']
    },

    /* ---------- 35 / 41 ---------- */
    {
      id: 'ci-gitlab-services',
      name: 'GitLab CI services',
      alias: ['services', '流水线起 MySQL', 'CI 里的 Redis'],
      level: 3,
      syntax: 'job:\n  services:\n    - name: <镜像>\n      alias: <网络别名>\n  variables:\n    <连接变量>: <值>',
      summary: '在流水线里临时拉起 MySQL、Redis 等依赖，供测试连接。',
      desc: 'GitLab Runner 会把 `services` 里的镜像与 job 容器接到同一个 Docker 网络，用 `alias`（或镜像名里的主机名）作为连接地址。测试用的数据库、缓存、消息队列都可以这样随用随起，测完即销毁，比维护一套常驻测试环境省事得多。',
      params: [
        { flag: 'name', desc: '服务镜像，如 `mysql:8.0`、`redis:7.2-alpine`' },
        { flag: 'alias', desc: '网络别名，作为连接主机名；不写时用镜像名去掉标签与斜杠后的形式' },
        { flag: 'entrypoint', desc: '覆盖镜像入口命令，某些服务需要清空 entrypoint 才能带参数启动' },
        { flag: 'command', desc: '覆盖启动命令，如给 Redis 指定配置文件' },
        { flag: 'variables（job 级）', desc: '设置 `MYSQL_ROOT_PASSWORD`、`MYSQL_DATABASE` 等初始化变量' }
      ],
      examples: [
        { cmd: 'integration-test:\n  stage: test\n  image: maven:3.9-eclipse-temurin-17\n  services:\n    - name: mysql:8.0\n      alias: mysql\n    - name: redis:7.2-alpine\n      alias: redis\n  variables:\n    MYSQL_ROOT_PASSWORD: testroot123\n    MYSQL_DATABASE: myapp_test\n    SPRING_DATASOURCE_URL: "jdbc:mysql://mysql:3306/myapp_test?useSSL=false"\n    SPRING_REDIS_HOST: "redis"\n  script:\n    - mvn -B test -Dspring.profiles.active=ci', desc: '一次拉起 MySQL 与 Redis，跑完整集成测试，连的地址就是 `alias`' },
        { cmd: 'db-migration-check:\n  stage: test\n  image: mysql:8.0\n  services:\n    - name: mysql:8.0\n      alias: mysql\n  variables:\n    MYSQL_ROOT_PASSWORD: testroot123\n    MYSQL_DATABASE: myapp_test\n  script:\n    - mysql -h mysql -uroot -ptestroot123 myapp_test < db/migration/V1__init.sql\n    - mysql -h mysql -uroot -ptestroot123 myapp_test -e "SHOW TABLES;"', desc: '用 mysql 客户端容器连服务容器，验证建表脚本可执行' },
        { cmd: 'api-test:\n  stage: test\n  image: postgres:16\n  services:\n    - name: postgres:16\n      alias: postgres\n  variables:\n    POSTGRES_PASSWORD: testpass123\n    POSTGRES_DB: myapp_test\n  script:\n    - psql -h postgres -U postgres -d myapp_test -c "select version();"', desc: '换成 PostgreSQL 服务容器，验证数据库连接' }
      ],
      notes: [
        'job 里连服务要用 `alias`（或 `mysql`、`redis` 这样的短名），写 `localhost` 一定连不上——那是 job 容器自己',
        '服务容器启动需要时间，job 一上来就连库容易报连接拒绝，脚本里要加等待重试（如 `until mysqladmin ping ...; do sleep 2; done`）',
        '服务镜像里的数据在 job 结束后随容器销毁，需要保留的测试数据要落到 `artifacts` 或外部存储',
        '`variables` 里的密码是明文写在 `.gitlab-ci.yml` 里的，仅适用于一次性测试库；真实凭据放 CI/CD Variables 并勾选 Masked',
        '每个 job 都会新建一套服务容器，job 多时资源消耗大，测试可用的服务不要声明在全局 `default` 里'
      ],
      related: ['ci-gitlab-yml', 'ci-gitlab-variables', 'ci-gitlab-runner', 'ci-gitlab-needs', 'dk-run'],
      docs: 'https://docs.gitlab.com/ee/ci/services/',
      tags: ['GitLab', '测试', '依赖服务']
    },

    /* ---------- 36 / 41 ---------- */
    {
      id: 'ci-gitlab-variables',
      name: 'GitLab CI 变量与 CI_* 内置变量',
      kind: 'recipe',
      alias: ['CI_COMMIT_SHA', 'CI_COMMIT_REF_NAME', 'CI_REGISTRY', '流水线变量'],
      level: 2,
      syntax: '变量引用：$CI_COMMIT_SHORT_SHA / ${VAR}\n自定义：项目「设置 → CI/CD → Variables」或 yml 里的 variables:',
      summary: '引用内置变量拿分支与提交信息，并安全注入自定义密钥。',
      desc: 'GitLab 为每次流水线预置了一批 `CI_*` 变量：提交 ID、分支/标签名、项目路径、镜像仓库地址与临时凭据等，脚本里直接用即可，无需自己查。自定义变量建议在项目设置里添加并勾选 Masked（日志打码）与 Protected（仅保护分支可用），避免密钥泄露。',
      params: [
        { flag: 'CI_COMMIT_SHA / CI_COMMIT_SHORT_SHA', desc: '完整 / 短提交 ID，常用于镜像标签' },
        { flag: 'CI_COMMIT_REF_NAME / CI_COMMIT_BRANCH / CI_COMMIT_TAG', desc: '分支或标签名；标签流水线里 `CI_COMMIT_TAG` 有值' },
        { flag: 'CI_PIPELINE_ID / CI_JOB_ID', desc: '流水线与作业 ID，做唯一版本号可用' },
        { flag: 'CI_REGISTRY / CI_REGISTRY_IMAGE / CI_REGISTRY_USER / CI_REGISTRY_PASSWORD', desc: 'GitLab 内置容器仓库地址与临时登录凭据' },
        { flag: 'CI_PROJECT_DIR / CI_PROJECT_PATH', desc: '构建目录绝对路径 / 项目全路径（含群组）' },
        { flag: 'CI_DEFAULT_BRANCH / CI_ENVIRONMENT_NAME', desc: '默认分支名；部署 job 里是环境名' },
        { flag: 'GITLAB_USER_LOGIN / CI_PIPELINE_SOURCE', desc: '触发者用户名；触发来源（`push`/`merge_request_event`/`schedule`）' }
      ],
      examples: [
        { cmd: 'variables:\n  IMAGE_TAG: "$CI_COMMIT_SHORT_SHA"\n\nbuild-image:\n  stage: package\n  image: docker:27-cli\n  script:\n    - docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" "$CI_REGISTRY"\n    - docker build -t "$CI_REGISTRY_IMAGE:$IMAGE_TAG" .\n    - docker push "$CI_REGISTRY_IMAGE:$IMAGE_TAG"', desc: '用内置变量拼出镜像地址与标签，凭据由 GitLab 自动注入' },
        { cmd: 'deploy-prod:\n  stage: deploy\n  script:\n    - echo "部署 $CI_COMMIT_REF_NAME 的提交 $CI_COMMIT_SHORT_SHA 到生产"\n    - helm upgrade --install myapp ./charts/myapp -n prod -f values-prod.yaml --set image.tag="$CI_COMMIT_SHORT_SHA" --wait', desc: '把分支名与提交 ID 打进发布记录，配合 Helm 部署到 CCE' },
        { cmd: 'notify:\n  stage: .post\n  script:\n    - curl -s -X POST "$WECOM_WEBHOOK" -H "Content-Type: application/json" -d "{\\"msgtype\\":\\"text\\",\\"text\\":{\\"content\\":\\"流水线 $CI_PIPELINE_ID 在 $CI_COMMIT_BRANCH 分支完成，状态 $CI_JOB_STATUS\\"}}"\n  rules:\n    - if: \'$CI_PIPELINE_SOURCE == "push"\'', desc: '用项目变量里的 Webhook 地址在流水线结束时推送通知' },
        { cmd: 'release-tag:\n  stage: package\n  rules:\n    - if: \'$CI_COMMIT_TAG\'\n  script:\n    - helm package ./charts/myapp --version "${CI_COMMIT_TAG#v}" -d ./dist\n    - helm push ./dist/myapp-*.tgz oci://swr.cn-north-4.myhuaweicloud.com/myorg', desc: '标签流水线里用 `CI_COMMIT_TAG` 作为 Chart 版本并推送到 SWR' }
      ],
      notes: [
        '自定义密钥一律放「设置 → CI/CD → Variables」，别写进 `.gitlab-ci.yml`；即使变量是 Masked，也不要 `echo` 出来，长度过短或含特殊字符的变量无法被打码',
        'Protected 变量只在受保护分支/标签的流水线上可用，合并请求流水线里取到空值通常是这个原因',
        '`$VAR` 与 `${VAR}` 在 YAML 里可能被解析器干扰，含冒号或特殊字符时务必加引号并写成 `${VAR}`',
        '`CI_COMMIT_BRANCH` 在标签流水线里为空，要兼容发版场景就判断 `CI_COMMIT_TAG`',
        '用 `CI_COMMIT_SHORT_SHA` 做镜像标签可避免重复，但短 SHA 有极小概率碰撞，需要严格唯一时用完整 `CI_COMMIT_SHA`',
        '内置变量很多是「预定义但可能为空」的，脚本里用 `${VAR:-默认值}` 兜底更稳'
      ],
      related: ['ci-gitlab-yml', 'ci-gitlab-rules', 'ci-gitlab-needs', 'ci-image-tag', 'ci-docker-buildx'],
      docs: 'https://docs.gitlab.com/ee/ci/variables/predefined_variables.html',
      tags: ['GitLab', '变量', '镜像标签']
    },

    /* ---------- 37 / 41 ---------- */
    {
      id: 'ci-gitlab-needs',
      name: 'GitLab CI needs 与 DAG',
      kind: 'recipe',
      alias: ['needs', 'DAG 流水线', 'needs:project'],
      level: 4,
      syntax: 'job:\n  stage: <阶段>\n  needs: ["<上游job>", { job: "<job>", artifacts: true }]',
      summary: '让作业跳过阶段顺序直接依赖指定上游，流水线跑得更快。',
      desc: '默认情况下同一阶段的 job 必须全部结束，下一阶段才能开始。加了 `needs` 之后，job 只等自己声明的上游 job 完成就能开跑，形成有向无环图（DAG）。一个典型收益：单元测试和镜像构建不必互相等待，各自沿着自己的依赖链尽早启动。',
      params: [
        { flag: 'needs: [job名]', desc: '只依赖列出的 job，可在上游 job 属于更早阶段时提前执行' },
        { flag: 'needs: [{ job, artifacts }]', desc: '指定是否下载该上游 job 的 artifacts（默认 true）' },
        { flag: 'needs: [{ job, optional: true }]', desc: '上游 job 可能不存在时不报错（条件性 job 常用）' },
        { flag: 'needs:project', desc: '跨项目依赖：引用其他项目流水线的 artifacts' },
        { flag: 'needs: []', desc: '显式声明不依赖任何 job，该 job 立即开始' },
        { flag: 'needs:parallel:matrix', desc: '依赖并行矩阵中的部分实例，配合 `parallel: matrix` 使用' }
      ],
      examples: [
        { cmd: 'stages:\n  - build\n  - test\n  - package\n\ncompile:\n  stage: build\n  script:\n    - mvn -B -DskipTests package\n  artifacts:\n    paths:\n      - target/*.jar\n\nunit-test:\n  stage: test\n  needs: ["compile"]\n  script:\n    - mvn -B test\n\nbuild-image:\n  stage: package\n  needs: ["compile"]\n  script:\n    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA" .\n    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"', desc: '测试与镜像构建都只等 compile，不再互相阻塞，流水线明显变快' },
        { cmd: 'deploy-test:\n  stage: deploy\n  needs:\n    - job: build-image\n      artifacts: false\n  script:\n    - helm upgrade --install myapp ./charts/myapp -n test -f values-test.yaml --set image.tag="$CI_COMMIT_SHORT_SHA" --wait', desc: '只依赖镜像构建、不下载产物（镜像已在仓库里，省传输时间）' },
        { cmd: 'lint:\n  stage: .pre\n  script:\n    - helm lint ./charts/myapp --strict\n\npackage-chart:\n  stage: package\n  needs:\n    - job: lint\n      optional: true\n  script:\n    - helm package ./charts/myapp -d ./dist', desc: '用 `optional: true` 容忍条件性上游 job 缺失' },
        { cmd: 'e2e:\n  stage: test\n  needs:\n    - project: devops/ci-templates\n      job: build-image\n      ref: main\n      artifacts: true\n  script:\n    - ./scripts/e2e.sh', desc: '跨项目依赖另一个项目流水线产出的产物' }
      ],
      notes: [
        '同阶段的 job 之间不能互相 `needs`，否则流水线报循环依赖错误',
        '`needs` 与 `dependencies` 别混用：`needs` 控制执行顺序，`dependencies` 只控制下载哪些 artifacts，两者同时出现时行为容易混乱',
        '被 `needs` 依赖的 job 如果因 `rules` 被跳过，缺少 `optional: true` 会让整条流水线失败',
        'DAG 不是越多越好：依赖链交错复杂后，`stages` 的可读性优势就没了，团队要能看懂这张图',
        '用 `needs` 提前启动的 job 仍然共用同一套 CI/CD 变量与 Runner 资源，注意并发时的资源争抢'
      ],
      related: ['ci-gitlab-yml', 'ci-gitlab-rules', 'ci-gitlab-variables', 'ci-gitlab-services'],
      docs: 'https://docs.gitlab.com/ee/ci/yaml/#needs',
      tags: ['GitLab', 'DAG', '提速']
    },

    /* ---------- 38 / 41 ---------- */
    {
      id: 'ci-gitlab-rules',
      name: 'GitLab CI rules 与 only',
      kind: 'recipe',
      alias: ['rules', 'only', 'except', 'when: manual'],
      level: 3,
      syntax: 'job:\n  rules:\n    - if: \'$CI_COMMIT_BRANCH == "main"\'\n      when: manual',
      summary: '用规则控制作业何时执行，是分支与环境保护的第一道闸门。',
      desc: '`rules` 按顺序自上而下匹配，命中第一条就决定该 job 的 `when`（`on_success`/`manual`/`always`/`never`/`delayed`）。`only`/`except` 是旧语法，功能有限，新项目统一用 `rules`。把「主干自动部署测试环境、生产必须人工点确认」写成规则，是流水线里最实用的保护措施。',
      params: [
        { flag: 'if', desc: 'CI 变量表达式，如 `$CI_COMMIT_BRANCH == "main"`、`$CI_PIPELINE_SOURCE == "merge_request_event"`' },
        { flag: 'changes', desc: '指定路径有变更才执行，如 `changes: ["src/**/*.java"]`' },
        { flag: 'exists', desc: '仓库中存在指定文件才执行' },
        { flag: 'when', desc: '命中后的行为：`on_success`（默认）、`manual`、`always`、`never`、`delayed`' },
        { flag: 'allow_failure', desc: '允许失败但不阻断流水线，手动 job 默认即为 true' },
        { flag: 'only / except', desc: '旧语法：`only: [main, tags]` 等，仅维护老项目时使用' }
      ],
      examples: [
        { cmd: 'deploy-dev:\n  stage: deploy\n  rules:\n    - if: \'$CI_COMMIT_BRANCH == "develop"\'\n  script:\n    - helm upgrade --install myapp ./charts/myapp -n dev -f values-dev.yaml --wait', desc: 'develop 分支推送时自动部署开发环境' },
        { cmd: 'deploy-prod:\n  stage: deploy\n  rules:\n    - if: \'$CI_COMMIT_BRANCH == "main"\'\n      when: manual\n      allow_failure: false\n    - when: never\n  script:\n    - helm upgrade --install myapp ./charts/myapp -n prod -f values-prod.yaml --atomic --wait --timeout 10m', desc: '只有 main 分支才出现「手动部署生产」按钮，其他分支永远不执行' },
        { cmd: 'build-backend:\n  stage: build\n  rules:\n    - changes:\n        - "src/**/*"\n        - "pom.xml"\n      when: on_success\n    - when: never\n  script:\n    - mvn -B -DskipTests package', desc: '只有后端代码有改动才构建后端，节省 Runner 资源' },
        { cmd: 'release-chart:\n  stage: package\n  rules:\n    - if: \'$CI_COMMIT_TAG =~ /^v\\d+\\.\\d+\\.\\d+$/\'\n  script:\n    - helm package ./charts/myapp --version "${CI_COMMIT_TAG#v}" -d ./dist\n    - helm push ./dist/myapp-*.tgz oci://swr.cn-north-4.myhuaweicloud.com/myorg', desc: '只有符合语义化版本的标签才触发发版' }
      ],
      notes: [
        '`rules` 是从上往下匹配、命中即停，最后一条常写 `- when: never` 作为兜底，否则「没命中任何规则」的 job 会被跳过而不是失败，容易误判',
        '`rules` 与 `only/except` 混用在同一个 job 会导致配置错误，迁移时整份 yml 一起改',
        '`when: manual` 的手动 job 默认 `allow_failure: true`，即使没点也不会让流水线失败；生产发布要显式设 `allow_failure: false`',
        '`changes` 在合并请求流水线里才可靠，普通分支推送时可能拿不到差异信息，需要配合 `$CI_PIPELINE_SOURCE` 判断',
        '合并请求触发的流水线要显式写 `if: $CI_PIPELINE_SOURCE == "merge_request_event"`，否则 MR 事件不会跑你期望的 job'
      ],
      related: ['ci-gitlab-yml', 'ci-gitlab-needs', 'ci-gitlab-variables', 'ci-jenkins-when', 'ci-image-tag'],
      docs: 'https://docs.gitlab.com/ee/ci/yaml/#rules',
      tags: ['GitLab', '规则', '发布闸门']
    },

    /* ================= E. 制品与发布 ================= */

    /* ---------- 39 / 41 ---------- */
    {
      id: 'ci-docker-buildx',
      name: 'docker buildx build --push',
      alias: ['buildx', '多架构构建', 'docker buildx create'],
      level: 3,
      syntax: 'docker buildx build --platform <平台列表> -t <镜像地址> --push <构建上下文>',
      summary: '一次构建多架构镜像并直接推送，鲲鹏与 x86 共用一套交付。',
      desc: '`buildx` 是 BuildKit 的前端，`--platform linux/amd64,linux/arm64` 能构建多架构清单（manifest list），推上去后同一条 `docker pull` 指令在不同架构机器上自动取对应镜像。在华为云上这意味着同一份交付物可以同时跑在 x86 的 CCE 节点和鲲鹏（ARM）节点上。多架构构建需要 `docker-container` 驱动的 builder，普通 `docker` 驱动不支持。',
      params: [
        { flag: '--platform', desc: '目标平台列表，如 `linux/amd64,linux/arm64`' },
        { flag: '-t, --tag', desc: '镜像名与标签，可重复传打多个标签' },
        { flag: '--push', desc: '构建完成后直接推送（多平台构建必须用 `--push` 或 `--load` 单一平台）' },
        { flag: '--cache-from / --cache-to', desc: '指定外部缓存，如 `type=registry,ref=<仓库>:cache`，CI 提速关键' },
        { flag: '--build-arg', desc: '传入构建参数，如 `--build-arg JAR_FILE=target/myapp.jar`' },
        { flag: '--provenance=false', desc: '关闭 provenance 证明，兼容部分不支持 OCI 附件的镜像仓库' },
        { flag: '--output', desc: '输出方式：`type=registry`（推仓库）、`type=docker`（载入本地）、`type=local`（导出目录）' }
      ],
      examples: [
        { cmd: 'docker buildx create --name multiarch --driver docker-container --use', desc: '创建并切换到支持多架构的 builder 实例' },
        { cmd: 'docker buildx build --platform linux/amd64,linux/arm64 -t swr.cn-north-4.myhuaweicloud.com/myorg/myapp:1.4.2 --push .', desc: '一次构建 x86 与鲲鹏两种架构并推送华为云 SWR' },
        { cmd: 'docker buildx build --platform linux/amd64 -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA" --cache-from type=registry,ref="$CI_REGISTRY_IMAGE:cache" --cache-to type=registry,ref="$CI_REGISTRY_IMAGE:cache",mode=max --push .', desc: 'GitLab CI 里构建单架构镜像并用镜像仓库做层缓存，显著提速' },
        { cmd: 'docker buildx build --platform linux/amd64,linux/arm64 -t swr.cn-north-4.myhuaweicloud.com/myorg/myapp:1.4.2 -t swr.cn-north-4.myhuaweicloud.com/myorg/myapp:latest --push .', desc: '同时打版本标签与 latest 标签' },
        { cmd: 'docker buildx imagetools inspect swr.cn-north-4.myhuaweicloud.com/myorg/myapp:1.4.2', desc: '查看推送后的多架构清单，确认两种架构都在' }
      ],
      notes: [
        '`--push` 与 `--load` 不能同时使用；多平台构建的结果只能 `--push` 到仓库，`--load` 仅支持单一平台',
        '默认的 `docker` 驱动不支持跨平台构建，必须先 `docker buildx create --driver docker-container` 并 `--use`',
        '构建 ARM 镜像时基础镜像必须有 arm64 版本，否则会报 `no match for platform in manifest`',
        'CI 里每次 job 都是新容器，builder 实例不会保留，需要用 `--cache-from`/`--cache-to` 或 `docker buildx create --append` 复用',
        '国内网络拉 Docker Hub 基础镜像慢，可在 Dockerfile 里改用华为云 SWR 的镜像中心地址或配置镜像加速',
        '推送到 SWR 前记得 `docker login swr.cn-north-4.myhuaweicloud.com`，CI 里用凭据注入而不是明文'
      ],
      related: ['ci-image-tag', 'ci-gitlab-variables', 'ci-jenkins-pipeline', 'ci-argocd-sync', 'dk-buildx', 'dk-push'],
      docs: 'https://docs.docker.com/reference/cli/docker/buildx/build/',
      tags: ['多架构', '镜像', 'SWR']
    },

    /* ---------- 40 / 41 ---------- */
    {
      id: 'ci-argocd-sync',
      name: 'argocd app sync / get',
      alias: ['argocd', 'argocd app sync', 'GitOps 同步'],
      level: 4,
      syntax: 'argocd app get <应用名>\nargocd app sync <应用名> [--prune] [--revision <版本>] [--dry-run]',
      summary: '查看应用与 Git 的差异并触发同步，GitOps 发布的核心动作。',
      desc: 'Argo CD 以 Git 仓库里的清单为唯一事实来源，持续比对集群实际状态。`app get` 看 `Sync Status`（是否与 Git 一致）和 `Health Status`（工作负载是否健康）；`app sync` 手动把 Git 里的目标状态应用到集群；`app diff` 则预览会改哪些资源。CI 里通常只做 `sync` 触发，真正的一致性由控制器持续保证。',
      params: [
        { flag: 'app get <应用>', desc: '查看同步状态、健康状态与资源树' },
        { flag: 'app sync <应用>', desc: '触发同步，把 Git 中的目标状态应用到集群' },
        { flag: '--prune', desc: '同步时删除 Git 中已移除的资源（默认保留，会造成残留）' },
        { flag: '--dry-run', desc: '只预览会做哪些改动，不真正执行' },
        { flag: '--revision', desc: '同步到指定 Git 提交/分支/标签，用于精确发布或回滚到某个版本' },
        { flag: '--timeout / --async', desc: '同步超时时间 / 立即返回不等结果' },
        { flag: 'app history / app rollback', desc: '查看部署历史 / 回滚到历史版本' },
        { flag: '--server / --auth-token', desc: '指定 Argo CD 服务地址与令牌，CI 里用令牌认证' },
        { flag: '--grpc-web', desc: '服务走 Ingress/网关时改用 grpc-web 传输，穿透代理' }
      ],
      examples: [
        { cmd: 'argocd app get myapp-prod', desc: '查看生产应用的同步与健康状态，发布前后各看一次' },
        { cmd: 'argocd app diff myapp-prod', desc: '预览 Git 与集群之间的差异，确认这次会改什么' },
        { cmd: 'argocd app sync myapp-prod --prune --timeout 300', desc: '同步并清理 Git 中已删除的资源，最常用的发布命令' },
        { cmd: 'argocd app sync myapp-prod --revision a1b2c3d --timeout 300', desc: '把生产同步到指定提交，实现「按提交发布」和精确回滚' },
        { cmd: 'argocd app wait myapp-prod --health --timeout 300', desc: '等待应用变为健康状态，CI 里用来判断发布是否真的成功' },
        { cmd: 'argocd app rollback myapp-prod 12', desc: '回滚到历史部署版本 12（需应用启用了历史记录）' }
      ],
      notes: [
        '不加 `--prune` 时，Git 里删掉的资源不会被删除，长期会积累一批「孤儿」资源，同步前用 `app diff` 看清影响',
        '同步到生产前先 `--dry-run`，`--prune` 在没有预览的情况下执行属于高风险操作',
        'CI 里认证要在 Argo CD 里创建本地账号或项目角色并生成令牌，用 `--auth-token` 传入，不要用管理员密码',
        'Argo CD 的自动同步（auto-sync）打开后，手工 `kubectl edit` 的改动会被自动纠正，排障时要意识到这一点',
        '应用处于 `OutOfSync` 且健康正常，多半是有人手工改过资源或 Git 分支切错了，先 `app get` 看来源 revision',
        '华为云 CCE 集群接入 Argo CD 时，注意集群 API 地址要从集群内或专线可达，公网访问需开放对应端口'
      ],
      related: ['ci-gitlab-yml', 'ci-image-tag', 'hl-upgrade-install', 'k8s-cce-kubeconfig', 'k8s-rollout'],
      docs: 'https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd_app_sync/',
      tags: ['GitOps', 'ArgoCD', '发布']
    },

    /* ---------- 41 / 41 ---------- */
    {
      id: 'ci-image-tag',
      name: '镜像 tag 策略与灰度发布',
      kind: 'recipe',
      alias: ['镜像标签策略', '语义化版本', '蓝绿发布', '金丝雀发布'],
      level: 4,
      syntax: 'docker tag <源镜像> <仓库>/<应用>:<标签>\nkubectl set image deployment/<名称> <容器>=<镜像>:<标签>',
      summary: '定好镜像标签规则并落地灰度或蓝绿，让每次发布可回滚。',
      desc: '标签策略决定「能不能回滚、能不能追溯」：只用 `latest` 一定会出事；主流做法是「不可变标签用 commit 短哈希，可读标签用语义化版本」，两者指向同一镜像。发布方式上，滚动发布靠 `kubectl rollout`/Helm 的 `--wait`，蓝绿靠切换 Service 选择器或 Ingress 后端，灰度（金丝雀）靠按比例分流或先放一个小 Deployment 验证流量。',
      params: [
        { flag: '<仓库>/<应用>:<标签>', desc: '标签建议组合：`1.4.2`（语义化版本）、`a1b2c3d`（commit 短哈希）、`1.4.2-a1b2c3d`' },
        { flag: 'kubectl set image', desc: '直接更新 Deployment 镜像，触发滚动更新' },
        { flag: 'kubectl rollout status / undo', desc: '观察滚动进度 / 回退到上一版本' },
        { flag: 'kubectl scale', desc: '蓝绿场景里调整新旧版本的副本数配比' },
        { flag: 'kubectl patch service', desc: '蓝绿切换：改 Service 的 selector 指向新版本 Pod' },
        { flag: 'kubectl annotate ingress', desc: '配合 Nginx Ingress 的 `canary-weight` 注解做按比例灰度' }
      ],
      examples: [
        { cmd: 'docker tag myapp:build swr.cn-north-4.myhuaweicloud.com/myorg/myapp:1.4.2 && docker tag myapp:build swr.cn-north-4.myhuaweicloud.com/myorg/myapp:$(git rev-parse --short HEAD)', desc: '同一次构建打「语义化版本」与「commit 短哈希」两个标签，兼顾可读与可追溯' },
        { cmd: 'kubectl set image deployment/myapp myapp=swr.cn-north-4.myhuaweicloud.com/myorg/myapp:1.4.2 -n prod && kubectl rollout status deployment/myapp -n prod --timeout=180s', desc: '滚动发布并盯着进度，超时立刻介入' },
        { cmd: 'kubectl rollout undo deployment/myapp -n prod', desc: '发现问题一键回退到上一个 ReplicaSet' },
        { cmd: 'kubectl scale deployment/myapp-green -n prod --replicas=3 && kubectl patch service myapp -n prod -p \'{"spec":{"selector":{"version":"green"}}}\'', desc: '蓝绿发布：先把新版本扩到全量副本，再切 Service 选择器完成流量切换' },
        { cmd: 'kubectl scale deployment/myapp-canary -n prod --replicas=1 && kubectl annotate ingress myapp -n prod nginx.ingress.kubernetes.io/canary-weight="10" --overwrite', desc: '金丝雀发布：先放 1 个副本并把 10% 流量导入新版本' },
        { cmd: 'helm upgrade --install myapp ./charts/myapp -n prod -f values-prod.yaml --set image.tag=1.4.2 --atomic --wait --timeout 10m', desc: '用 Helm 做发布，`--atomic` 让失败自动回滚，是最省心的方式' }
      ],
      notes: [
        '禁止把 `latest` 用于生产：同名标签内容会变，回滚时拉到的是新镜像，事故现场无法复现',
        '镜像标签应视为不可变：同一个版本号被反复覆盖推送，会让「1.4.2 到底跑的是什么」变成无解问题，SWR 上也建议开启镜像不可变或加版本校验',
        '蓝绿发布要求两套环境的数据兼容（尤其是数据库 schema），切流前先确认迁移脚本向后兼容',
        '金丝雀发布必须配套监控指标（错误率、响应时间），否则「灰度」只是把故障范围缩小，仍然要靠人肉发现',
        '`kubectl set image` 会绕过 Helm 的发布记录，之后 `helm upgrade` 可能把镜像改回去，用 Helm 管理就统一走 Helm',
        '发布后保留最近几个版本的镜像与 ReplicaSet，回滚才有依托；清理策略不要激进到删掉上一版'
      ],
      related: ['ci-docker-buildx', 'ci-argocd-sync', 'ci-gitlab-variables', 'ci-git-tag', 'k8s-set-image', 'k8s-rollout', 'hl-rollback'],
      docs: 'https://docs.docker.com/engine/reference/commandline/tag/',
      tags: ['发布', '灰度', '标签策略']
    }

  );
})();
