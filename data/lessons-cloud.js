/* data/lessons-cloud.js · 云平台与交付（华为云 CLI / CI-CD）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。这里只放课程数据。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

      {
        id: 'hw-cli-profile',
        cat: 'cloud-cli',
        title: '先确认你在操作哪个区域',
        prompt: '同事让你帮忙查一台机器，你敲完命令却发现"查不到资源"——最可能的原因是当前 profile 指向的不是你以为的那个区域。',
        task: '确认当前 KooCLI 用的是哪个 profile、哪个区域',
        steps: [
          { title: '看当前配置', about: 'profile 与 region 一目了然', cmd: 'hcloud configure list', ref: 'hw-hcloud-config-list', hint: ['凭据配好不等于配对了：当前身份还带着区域和项目两个属性，动手前先把这几项打印出来跟预期对齐', 'hcloud configure ____'], note: 'region 是 cn-north-4（北京四）；换成别的区域就是另一批资源' },
          { title: '再拉一次清单', about: '区域对了才看得到机器', cmd: 'hcloud ECS ListServersDetails', ref: 'hw-ecs-list', hint: ['配置只说明客户端指向哪里，证明不了机器在不在：真拉一次云服务器清单，返回是空还是有内容才是判据', 'hcloud ECS ____'], note: '区域不对时不会报错，只会返回空列表 —— 这是最容易踩的坑' }
        ],
        answer: 'hcloud configure list',
        alt: [
          'hcloud configure list --cli-profile=default',
          'hcloud configure list --cli-region=cn-north-4'
        ],
        expect: /cn-north-4/,
        teach: '**"查不到资源"几乎都是 region 或 project_id 不对**，而不是权限问题。KooCLI 的每个请求都要带 region，配置里写错或者换区域时忘了改，结果就是空列表 —— 不报错，最容易被忽略。量产脚本里一定显式写 `--cli-region=`，别依赖默认值。'
      },

      {
        id: 'hw-ecs-inventory',
        cat: 'cloud-cli',
        title: '从 CLI 里取出机器名清单',
        prompt: '要做一次资产盘点，你需要把北京四所有云服务器的名字列出来，而不是把一大段 JSON 直接甩给同事。',
        task: '列出云服务器，并只取出名字',
        steps: [
          { title: '先看完整返回', about: '确认返回结构再动手切', cmd: 'hcloud ECS ListServersDetails', ref: 'hw-ecs-list', hint: ['别急着切字段：先要一份完整返回，看清外层容器叫什么、机器名藏在哪个数组的哪个键下，后面才有依据', 'hcloud ECS ____'], note: '先看清结构：外层是 count/servers，名字在 servers[].name' },
          { title: '只取名字', about: '用 jq 挑字段', cmd: 'hcloud ECS ListServersDetails | jq -r ".servers[].name"', ref: 'hw-ecs-list', hint: ['机器名不在顶层，而是列表里每个元素自己的键：数组要先展开成逐个元素，再把这条路径写进过滤器', 'hcloud ECS ListServersDetails | jq -r "____"'], note: '-r 去掉 JSON 自带的引号，输出才能直接喂给下一个命令' },
          { title: '顺手确认状态', about: '名字和状态一起看', cmd: 'hcloud ECS ListServersDetails | grep ACTIVE', ref: 'hw-ecs-list', hint: ['整段 JSON 也能按关键字逐行过滤：状态字段是输出里原样的大写英文单词，拿它当过滤词，剩下的就都是在跑的', 'hcloud ECS ListServersDetails | grep ____'], note: '两台都是 ACTIVE（运行中）' }
        ],
        answer: 'hcloud ECS ListServersDetails | jq -r ".servers[].name"',
        alt: [
          'hcloud ecs ListServersDetails | jq -r ".servers[].name"',
          'hcloud ECS ListServersDetails | jq -r ".servers[].name"',
          'hcloud ECS ListServersDetails | jq ".servers[].name"'
        ],
        expect: /web-prod-01/,
        teach: '`--cli-output` 换成 `json` 再用 **jq 挑字段**，是 CLI 盘点的标准姿势。`jq -r` 的 `-r` 表示 raw：不加它输出会带双引号，没法直接当参数用。机器一多还要处理分页（`--limit`/`--offset`），**不翻页一定会漏机器**。'
      },

      {
        id: 'hw-sg-3306',
        cat: 'cloud-cli',
        title: '数据库连不上，先去查安全组',
        prompt: '应用报"数据库连接超时"，机器都在跑、端口也在监听，你怀疑是安全组没放行。',
        task: '查看安全组入方向规则，确认 3306 有没有被放行',
        steps: [
          { title: '确认数据库还在跑', about: '先排除机器本身的问题', cmd: 'hcloud ECS ListServersDetails', ref: 'hw-ecs-list', hint: ['连不上数据库先分层排查：第一步是确认那台机器本身还在运行，云服务器归哪个服务码管就去哪儿拉清单', 'hcloud ____ ListServersDetails'], note: 'db-prod-01 是 ACTIVE —— 机器没问题，往网络层查' },
          { title: '看安全组规则', about: '入方向放行了哪些端口', cmd: 'hcloud VPC ListSecurityGroups', ref: 'hw-vpc-sg-list', hint: ['安全组是网络层资源，不归云服务器那个服务管；要放行端口，得换一个服务码去列它的规则', 'hcloud ____ ListSecurityGroups'], note: '只放行了 80、22、8080，**没有 3306**' },
          { title: '验证一下', about: '规则里根本没有 3306', cmd: 'hcloud VPC ListSecurityGroups | grep 3306', ref: 'hw-vpc-sg-list', hint: ['别用眼睛在整段规则里逐行找：把端口号当过滤词，命中为空本身就是结论——白名单里根本没有它', 'hcloud VPC ListSecurityGroups | grep ____'], note: '确认规则列表里确实找不到 3306' }
        ],
        answer: 'hcloud VPC ListSecurityGroups',
        alt: [
          'hcloud vpc ListSecurityGroups',
          'hcloud VPC ListSecurityGroups --cli-region=cn-north-4'
        ],
        expect: /3306|security_groups/,
        teach: '**华为云安全组是白名单：没写进去的端口一律拒绝**，和 iptables 的默认策略不同（安全组没有"默认全通"这回事）。云上"端口不通"的排查顺序固定是：安全组 → 网络 ACL → 系统防火墙 → 服务是否监听。少查一层就会白折腾半天。'
      },

      {
        id: 'hw-obs-publish',
        cat: 'cloud-cli',
        title: '把前端产物发到 OBS',
        prompt: '静态站点要发布：本地 `./dist` 目录已经构建好，需要同步到 OBS 桶 `prod-static` 的 `web/` 前缀下。',
        task: '用 obsutil 把 ./dist 同步到 obs://prod-static/web/',
        steps: [
          { title: '先看有哪些桶', about: '确认桶名没写错', cmd: 'obsutil ls', ref: 'hw-obsutil-ls', hint: ['桶名打错不会报错，只会白跑一次全量上传：先把当前账号下能看到的桶列出来，跟目标名对一遍', 'obsutil ____'], note: '桶名写错会浪费一次全量上传的时间' },
          { title: '演练一次', about: '只打印要传的文件', cmd: 'obsutil sync ./dist obs://prod-static/web/ -dryRun', ref: 'hw-obsutil-sync', hint: ['正式写目标之前，先让工具把打算做的事打印出来：这一遍不动任何对象，是发现敏感文件被误传的机会', 'obsutil sync ./dist obs://prod-static/web/ ____'], note: '正式发之前必跑：能看出有没有把 .env 这类敏感文件传上去' },
          { title: '正式同步', about: '增量上传', cmd: 'obsutil sync ./dist obs://prod-static/web/', ref: 'hw-obsutil-sync', hint: ['上传类子命令不止一个：能只补缺失或已变更、不重复传全量的那个动词，才是发布流水线里该用的', 'obsutil ____ ./dist obs://prod-static/web/'], note: '只传"缺失或已变更"的文件，这是它比 cp -r 快的根本原因' }
        ],
        answer: 'obsutil sync ./dist obs://prod-static/web/',
        alt: [
          'obsutil sync ./dist/ obs://prod-static/web/',
          'obsutil sync ./dist obs://prod-static/web',
          'obsutil sync ./dist obs://prod-static/web/ -j=5 -p=5'
        ],
        expect: /Upload successfully/,
        teach: '`obsutil sync` 是**单向补齐**：只上传本地有、目标没有或已变更的文件，**不会删除 OBS 上多出来的对象**。所以前端每次构建产生带 hash 的新文件会越积越多，要另外做旧版本清理。发布前先 `-dryRun`，这是发现"误传敏感文件"的唯一机会。'
      },

      {
        id: 'ci-git-commit-config',
        cat: 'cicd',
        title: '从 git status 到 commit：把配置改动提交上去',
        prompt: '同事把 `/data/app/config.yaml` 里的数据库地址从写死的 IP 改成了内网域名，改完就下班了，改动还躺在工作区里。你要看清他改了什么、提交、然后推到远端。',
        task: '用 status 看状态、用 diff 看具体改动、add + commit 提交、最后 push',
        steps: [
          { title: '先看工作区状态', about: 'git status 给出分支与改动清单', cmd: 'cd /data/app && git status', ref: 'lb-cd', hint: ['先进到仓库目录，再问三件事：在哪个分支、哪些文件被改过、哪些已经登记进暂存区——一条只读子命令给全', 'cd /data/app && git ____'], note: 'modified: config.yaml —— 已跟踪但未暂存' },
          { title: '看清到底改了什么', about: '逐行看清工作区到底改成了什么', cmd: 'cd /data/app && git diff', ref: 'ci-git-diff', hint: ['状态只告诉你哪个文件被改了，不告诉你改成了什么：要看那一行 IP 变成域名的逐行差异，用哪个子命令？', 'cd /data/app && git ____'], note: '一行 IP 变成域名：这就是同事的改动' },
          { title: '把改动放进暂存区', about: '先登记进暂存区，再用短格式核对', cmd: 'cd /data/app && git add config.yaml && git status -s', ref: 'ci-git-add', hint: ['改动先要靠一个动词登记进暂存区，再用短格式核对：两列位置固定，第一列已暂存、第二列改了没暂存', 'cd /data/app && git add config.yaml && git status ____'], note: '短格式里 `M ` 在第一列表示已暂存' },
          { title: '提交', about: '把改动固化成一个提交，写清为什么改', cmd: 'cd /data/app && git commit -m "fix: 数据源改用内网域名"', ref: 'ci-git-commit', hint: ['提交信息要写清"为什么改"而不是复述文件名；而且要在命令行里一次给完，别让它弹出编辑器', 'cd /data/app && git commit ____ "fix: 数据源改用内网域名"'], note: '提交信息要写清意图，不是复述文件名' },
          { title: '确认提交进去了', about: '回头看历史，确认刚才那次在里面', cmd: 'cd /data/app && git log --oneline -2', ref: 'ci-git-log', hint: ['历史默认输出太啰嗦：有个选项能把每个提交压成一行，配合时间倒序，新提交永远排在最上面', 'cd /data/app && git log ____ -2'], note: '新提交在最上面，HEAD -> main 指向它' },
          { title: '看与远端的关系', about: '看本地比远端多出了几个提交', cmd: 'cd /data/app && git status', ref: 'ci-git-status', hint: ['提交完先别急着推：问一句本地比远端领先几个提交，这条只读子命令会直接把 ahead 的数量报给你', 'cd /data/app && git ____'], note: "ahead of 'origin/main' by 1 commit" },
          { title: '推到远端', about: '把本地提交同步给远端，同事才看得到', cmd: 'cd /data/app && git push', ref: 'ci-git-push', hint: ['本地提交现在只存在于这台机器上：把它送到远端，同事和流水线才看得到，这一步不需要额外参数', 'cd /data/app && git ____'], note: '推完再看 status 就是 up to date' }
        ],
        answer: 'cd /data/app && git add config.yaml && git commit -m "fix: 数据源改用内网域名" && git push',
        alt: [
          'cd /data/app && git commit -am "fix: 数据源改用内网域名" && git push',
          'cd /data/app && git add -A && git commit -m "fix: 数据源改用内网域名" && git push'
        ],
        expect: /main -> main/,
        teach: '**Git 的三段式：工作区（你改的文件）→ 暂存区（`git add` 过的）→ 版本库（`git commit` 后的）**。`git status` 的三块输出正好对应这三段：`Changes to be committed`（已暂存）、`Changes not staged for commit`（已跟踪但没 add）、`Untracked files`（从没被跟踪过的新文件）。三个高频参数：`git add -A` 把新增/修改/删除全部暂存；`git commit -am "..."` 等于"对已跟踪文件先 add 再 commit"（**它不会带上新文件**）；`git commit` 不带 `-m` 会打开编辑器，在脚本与教学终端里要避免。推之前先 `git status` 确认"领先几个提交"是个好习惯 —— 多人协作时更该 `git pull --rebase` 再看一眼，而不是闭着眼睛 `push -f`。'
      },

      {
        id: 'ci-git-branch-fix',
        cat: 'cicd',
        title: '在 hotfix 分支上修问题，别在主分支裸改',
        prompt: '生产要热修一个配置项。团队纪律是：`main` 随时可发布，任何改动都要走分支 + 合并请求。你要开一个 hotfix 分支，改完推上去。',
        task: '从 main 建一个 hotfix 分支，改配置并提交，然后把分支推到远端',
        steps: [
          { title: '先看清在哪个分支', about: 'git branch 标出当前分支', cmd: 'cd /data/app && git branch', ref: 'ci-git-branch', hint: ['动手改之前先看清脚站在哪个分支：有一条只读子命令会列出所有本地分支，并用星号标出当前所在的那个', 'cd /data/app && git ____'], note: '`* main` 表示现在在 main 上' },
          { title: '建分支并切过去', about: '从当前提交切出一个新分支来改', cmd: 'cd /data/app && git checkout -b hotfix/datasource', ref: 'ci-git-switch', hint: ['新建分支和切过去本可以分两步，有一个短选项能把它们合成一步；少了它就变成切换到一个已存在的分支', 'cd /data/app && git checkout ____ hotfix/datasource'], note: '等价于 git branch + git checkout 两步' },
          { title: '确认切换成功', about: '再看一次分支列表', cmd: 'cd /data/app && git branch', ref: 'ci-git-branch', hint: ['切换成功没有，不能凭感觉：再列一次本地分支，看星号挂在哪个名字前面，那才是当前所在的位置', 'cd /data/app && git ____'], note: '星号跑到 hotfix/datasource 上了' },
          { title: '改配置', about: '追加一行会话超时设置', cmd: 'echo "server.servlet.session.timeout: 30m" >> config.yaml', ref: 'sh-echo', hint: ['要在已有配置的末尾添一行，而不是把整个文件覆盖掉：重定向符用错一次，原有内容就没了', 'echo "server.servlet.session.timeout: 30m" ____ config.yaml'], note: '在分支上改，main 不受影响' },
          { title: '确认只有这一个文件变了', about: '用短格式确认两列状态各代表什么', cmd: 'cd /data/app && git status -s', ref: 'ci-git-status', hint: ['短格式两列的位置固定：左边一列空着、右边一列有字母，就说明这个文件改了但还没登记进暂存区', 'cd /data/app && git status ____'], note: '` M` 表示已跟踪文件有未暂存修改' },
          { title: '提交这次热修', about: 'commit -am 一步暂存已跟踪文件并提交', cmd: 'cd /data/app && git commit -am "fix: 会话超时调整为 30 分钟"', ref: 'ci-git-commit', hint: ['改的是已被跟踪的老文件，可以跳过单独登记那一步：有没有一个组合短选项，把暂存与提交一次做完？', 'cd /data/app && git commit ____ "fix: 会话超时调整为 30 分钟"'], note: '提交信息里写清影响面' },
          { title: '推送分支并建立追踪', about: '把分支推上去并建立跟踪关系，之后直接推', cmd: 'cd /data/app && git push -u origin hotfix/datasource', ref: 'ci-git-push', hint: ['第一次推一个新分支时，顺手把本地分支与远端分支的对应关系记下来；之后这个分支就不用每次再写远端名', 'cd /data/app && git push ____ origin hotfix/datasource'], note: '-u 之后这个分支的 push/pull 就不用再写远端名了' }
        ],
        answer: 'cd /data/app && git checkout -b hotfix/datasource && echo "server.servlet.session.timeout: 30m" >> config.yaml && git commit -am "fix: 会话超时调整为 30 分钟" && git push -u origin hotfix/datasource',
        alt: [
          'cd /data/app && git checkout -b hotfix/datasource && echo "a: 1" >> config.yaml && git add config.yaml && git commit -m "fix: 会话超时" && git push -u origin hotfix/datasource'
        ],
        expect: /hotfix\/datasource -> hotfix\/datasource/,
        teach: '**分支是"改动隔离"的最小单位**，也是代码评审的载体：`main` 保持随时可发布，功能走 `feature/*`、紧急修复走 `hotfix/*`、发布线走 `release/*`。`git checkout -b <名字>` 会在当前位置（HEAD）创建分支并切过去，**新分支与旧分支此刻指向同一个提交**，之后的提交才分叉。`git push -u origin <分支>` 里的 `-u` 建立本地分支与远端分支的追踪关系，之后 `git status` 才会告诉你"领先/落后几个提交"。两条纪律：**不要在共享分支上 `git push -f`**（会覆盖别人的提交）；**改完立刻推分支、开合并请求**，让改动手上有据可查 —— 出问题时能顺着提交回滚到具体那一次。'
      },

      {
        id: 'ci-git-log-tag',
        cat: 'cicd',
        title: '出事时怎么找到可以回滚的版本',
        prompt: '线上出问题，你要在几分钟内回答两个问题：**现在跑的是哪个版本？上一个可用版本是哪个提交？** 光看 Pod 的镜像 tag 不够，你要回到代码库里确认。',
        task: '用 git log 与 git tag 找到 HEAD、对应发布标签与远端地址',
        steps: [
          { title: '看最近几次提交与 HEAD 位置', about: 'git log --oneline 一行一个提交', cmd: 'cd /data/app && git log --oneline -3', ref: 'ci-git-log', hint: ['回答"现在跑的是哪个版本"不需要刷完整部历史：先限定只看最近几条，再读每行括号里的装饰信息', 'cd /data/app && git log --oneline ____'], note: '括号里是装饰信息：HEAD -> main 表示当前在 main 的这个提交上' },
          { title: '看发布标签', about: '列出所有发布标签，确认版本停在哪', cmd: 'cd /data/app && git tag', ref: 'ci-git-tag', hint: ['代码库里的版本锚点不是分支名，而是打在提交上的标记，它和镜像标签一一对应——先把它们全列出来', 'cd /data/app && git ____'], note: 'v1.2.1 / v1.2.2 / v1.2.3 与镜像 tag 一一对应' },
          { title: '看 HEAD 的完整信息', about: '作者与提交时间', cmd: 'cd /data/app && git log -1', ref: 'ci-git-log', hint: ['要的是这一个提交的完整信息：作者、时间、message——历史上只取最新那一条，靠什么限定条数？', 'cd /data/app && git log ____'], note: '排查"这次改动是谁什么时候提的"最快的方式' },
          { title: '确认远端地址', about: '回滚要从这里取代码，先核对地址没写错', cmd: 'cd /data/app && git remote -v', ref: 'ci-git-branch-remote', hint: ['回滚要从远端取代码，先确认本地仓库认的远端名字和地址：加上那个选项，取与推两个地址会一起打出来', 'cd /data/app && git remote ____'], note: '回滚要从这里取代码，先确认地址没写错' },
          { title: '确认工作区干净', about: '一条输出都没有，才说明工作区是干净的', cmd: 'cd /data/app && git diff HEAD', ref: 'ci-git-diff', hint: ['发布机上最危险的是有人改了文件没提交：要连已登记进暂存的那部分一起比出来，比较的基准得写成当前提交那个引用', 'cd /data/app && git diff ____'], note: '发布机上工作区有未提交改动是最危险的状况之一' }
        ],
        answer: 'cd /data/app && git log --oneline -3 && git tag',
        alt: [
          'cd /data/app && git log --oneline -3',
          'cd /data/app && git tag && git log --oneline -1'
        ],
        expect: /tag: v1\.2\.3/,
        teach: '发布排障的第一件事是**把"镜像 tag / git tag / helm chart APP VERSION"三者的对应关系锚死**：这台机器上镜像 tag 是 `1.2.3`、git tag 是 `v1.2.3`、helm 的 APP VERSION 也是 `1.2.3`，三码合一时，看任何一个都能定位到同一份代码。`git log --oneline` 括号里的装饰要会读：`HEAD -> main` 是"当前所在位置"、`tag: v1.2.3` 是"这个提交被打过发布标签"、`origin/main` 是"远端同名分支跟到这里"（有它说明本地与远端一致）。止血与追溯要分开：**先止血**（`helm rollback` 或把镜像 tag 退回上一个版本），**再追溯**（`git log`/`git diff` 找到引入问题的提交），最后才是修代码重新发布。别在故障中一边查代码一边等发布。'
      },

      /* ══════════════════════════════════════════════════════════════════
         下面几节补的是 cloud-cli 分类的空白：71 条记录原先只有 4 节课。
         选题标准是"云上排查最常被问到、而且**只用只读命令就能回答**"的那几件事。
         对应新增的引擎能力见 assets/js/cmd-cloud.js（ELB / EVS / EIP / RDS / IAM / CES 只读子集）。
         ══════════════════════════════════════════════════════════════════ */

      {
        id: 'hw-elb-backend-down',
        cat: 'cloud-cli',
        title: '一半请求 502，机器却都在跑',
        prompt: '用户反馈网站"一会儿好一会儿 502"。你登上两台后端机器，`systemctl status` 都是 active、`curl localhost:8080/health` 也都正常 —— 那问题就不在后端本身，而在**负载均衡把它当成了不健康**。',
        task: '查看负载均衡的后端健康状态，找出被判为离线的后端',
        steps: [
          { title: '先看负载均衡本身在不在线', about: 'provisioning_status 与 operating_status', cmd: 'hcloud ELB ListLoadBalancers/v3 --cli-region=cn-north-4 --cli-output=table', ref: 'hw-elb-list', hint: ['502 是网关侧的错误码，先确认网关自己是不是健康的：负载均衡属于哪个服务码，就用那个服务码去列它的实例', 'hcloud ____ ListLoadBalancers/v3 --cli-region=cn-north-4 --cli-output=table'], note: 'elb-web-prod 是 ACTIVE/ONLINE —— 网关本身没问题，往它背后看' },
          { title: '看后端成员的健康状态', about: '关键字段是 operating_status', cmd: 'hcloud ELB ShowLoadBalancerStatus/v3 --cli-region=cn-north-4', ref: 'hw-elb-health-check', hint: ['网关健康不代表后端健康：要拉的是"这台负载均衡下每个监听器、每个后端组里每个成员的实时状态"', 'hcloud ELB Show____/v3 --cli-region=cn-north-4'], note: '10.0.1.23 是 ONLINE，10.0.1.24 是 **OFFLINE** —— 这就是"一半请求 502"的来源' },
          { title: '把离线的挑出来', about: '整段 JSON 也能按关键字过滤', cmd: 'hcloud ELB ShowLoadBalancerStatus/v3 --cli-region=cn-north-4 | grep -B2 OFFLINE', ref: 'hw-elb-health-check', hint: ['状态是输出里原样的大写英文单词：直接拿它当过滤词；再往前带两行上下文，就能看到是哪个 IP 出的问题', 'hcloud ELB ShowLoadBalancerStatus/v3 --cli-region=cn-north-4 | grep ____ OFFLINE'], note: '定位到具体是哪个后端成员被判离线' }
        ],
        answer: 'hcloud ELB ShowLoadBalancerStatus/v3 --cli-region=cn-north-4',
        alt: [
          'hcloud ELB ShowLoadBalancerStatus/v3 --cli-region=cn-north-4 --cli-output=json',
          'hcloud elb ShowLoadBalancerStatus/v3 --cli-region=cn-north-4'
        ],
        expect: /OFFLINE/,
        teach: '**"机器在跑"与"网关认为它在跑"是两件事。** 负载均衡按自己配置的健康检查去探测后端：`delay`（多久探一次）、`timeout`（多久算超时）、`max_retries`（连续失败几次判离线）、`url_path` + `expected_codes`（探哪个路径、什么响应码算成功）。所以后端进程活着、端口也通，照样可能被判 OFFLINE —— 常见原因有四种：**健康检查路径写错**（探 `/health` 但应用没这个路由）、**端口探错**（探 80 而后端在 8080）、**安全组没放行"健康检查的源地址"**（探测包从网关发出，被后端的安全组挡了）、**响应太慢**（`timeout` 设 3 秒而接口要 5 秒）。注意这次"一半 502"的形态：两个后端挂了一个，网关把请求轮询到坏的那个就报错 —— **后端数量越少，单台故障的影响面越大**，这也是为什么至少要有 2 台。'
      },

      {
        id: 'hw-evs-unattached',
        cat: 'cloud-cli',
        title: '找出"买了但没挂"的云盘',
        prompt: '月度成本复盘，老板问"这个月为什么涨了"。云硬盘按容量计费，**只要创建了就一直在收费** —— 而云上最常见的浪费就是：机器删了、盘留着；或者盘建好了、忘了挂上去。',
        task: '列出所有"可用但未挂载"的云盘，算出白花的容量',
        steps: [
          { title: '先看全部云盘', about: 'status 与 attachments 两列最关键', cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-output=table', ref: 'hw-evs-list', hint: ['云硬盘归哪个服务码管就用哪个服务码列；把它打成表格，先看有没有 status 不是 in-use 的', 'hcloud ____ ListVolumes --cli-region=cn-north-4 --cli-output=table'], note: 'vol-old-backup 的 status 是 **available**、attachments 是空的 —— 它没挂在任何机器上' },
          { title: '只挑出没挂载的', about: '用 --cli-query 筛 status', cmd: "hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query=\"volumes[?status=='available']\"", ref: 'hw-evs-list', hint: ['表格里靠眼睛找不可靠，要让 CLI 自己筛：JMESPath 的条件过滤写成"数组名[?字段==值]"', "hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query=\"volumes[?____=='available']\""], note: 'available = 已创建但未挂载，这种状态**一直在计费却没有任何作用**' },
          { title: '只要名字和容量', about: '投影出要汇报的字段', cmd: "hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query=\"volumes[?status=='available'].{name:name,size:size}\"", ref: 'hw-evs-list', hint: ['给老板看不需要整段 JSON，只要名字和容量：在过滤后面接一个花括号，写"输出字段:来源字段"', "hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query=\"volumes[?status=='available'].{____:name,size:size}\""], note: '1000GB 的盘，按 SSD 计费一个月就是实打实的钱' }
        ],
        answer: "hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query=\"volumes[?status=='available'].{name:name,size:size}\"",
        alt: [
          "hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query=\"volumes[?status=='available']\"",
          'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-output=table'
        ],
        expect: /vol-old-backup/,
        teach: '**云硬盘是"创建即计费"，与有没有挂载、有没有读写完全无关。** 判断一块盘是不是浪费，看两个字段：`status`（`in-use` 已挂载 / `available` 未挂载 / `error` 异常）和 `attachments`（空数组就是没挂）。清理前必须确认三件事，缺一件都可能出事故：① **盘里有没有数据**（挂到一台临时机器上 `lsblk` + `mount` 看一眼，别只看名字）；② **是不是别的盘的备份基础**（快照依赖它，删了快照一起没）；③ **是不是刚解绑、正准备挂到新机器上**（生产迁移期间很常见）。确认无用之后也要**先做快照再删**，快照的费用远低于盘。同类浪费还有：闲置的弹性公网 IP（没绑实例照样按带宽计费）、长期关机的按需实例（关机后计算资源不收费，但挂着的盘和 EIP 还在收）、以及到期没释放的旧镜像。'
      },

      {
        id: 'hw-eip-idle-billing',
        cat: 'cloud-cli',
        title: '没绑机器的公网 IP 也在扣钱',
        prompt: '成本清单上有一项"弹性公网 IP"每月都在扣，但你印象里这几台机器都没动过。EIP 的计费与"绑没绑实例"无关 —— 只要持有就在收费。',
        task: '找出没有绑定任何实例的弹性公网 IP',
        steps: [
          { title: '列出全部 EIP', about: 'status 与 port_id 是两个关键字段', cmd: 'hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-output=table', ref: 'hw-ecs-eip-bind', hint: ['弹性公网 IP 归 EIP 这个服务码管：先把它全部列出来，重点看状态与它绑定的端口', 'hcloud ____ ListPublicips --cli-region=cn-north-4 --cli-output=table'], note: 'status 为 DOWN、port_id 为 null 的那个就是没人用的' },
          { title: '筛出闲置的', about: 'DOWN 表示未绑定', cmd: "hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query=\"publicips[?status=='DOWN'].{ip:public_ip_address,bw:bandwidth_size}\"", ref: 'hw-ecs-eip-bind', hint: ['未绑定的状态词是 DOWN（绑定后是 ACTIVE）：加上条件过滤，再把 IP 与带宽投影出来就够汇报了', "hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query=\"publicips[?____=='DOWN'].{ip:public_ip_address,bw:bandwidth_size}\""], note: '203.0.113.91 没绑任何实例，但还是 100Mbps **按带宽计费**' },
          { title: '确认它确实没在用', about: 'port_id 为空才是真闲置', cmd: 'hcloud EIP ListPublicips --cli-region=cn-north-4 | grep -A3 DOWN', ref: 'hw-ecs-eip-bind', hint: ['删除前再人工核一遍：把状态当过滤词，并往后带三行上下文，看它的 port_id 与别名到底有没有内容', 'hcloud EIP ListPublicips --cli-region=cn-north-4 | grep ____ DOWN'], note: 'port_id 为 null + 别名为"未绑定任何实例" —— 可以释放了' }
        ],
        answer: "hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query=\"publicips[?status=='DOWN'].{ip:public_ip_address,bw:bandwidth_size}\"",
        alt: [
          "hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query=\"publicips[?status=='DOWN']\"",
          'hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-output=table'
        ],
        expect: /203\.0\.113\.91/,
        teach: '**弹性公网 IP 的计费对象是"持有"而不是"使用"**：绑在实例上按带宽/流量计费，**没绑也照收**（很多云厂商对闲置 EIP 甚至收更高的"保留费"，就是为了促使你释放）。判断闲置看 `status`（`DOWN` 未绑定 / `ACTIVE` 已绑定）和 `port_id`（`null` 就是没绑）。这类"隐形扣费"还有几个同类：**未挂载的云硬盘**、**长期关机的按需实例挂着的盘**、**没删的负载均衡**（即使没流量也有实例费）、**过期的快照**。做法上建议：每月跑一次这样的清单，把"资源存在但没有绑定关系"的挑出来 —— 这是一条**通用**的成本排查思路，换成 AWS/Azure 也只是命令名不同（`aws ec2 describe-addresses` 看 `AssociationId` 是否为空）。删之前务必确认它不是某个白名单里写死的出口 IP ——**换 IP 会导致对端防火墙失效**，这个坑比省下的钱贵得多。'
      },

      {
        id: 'hw-rds-backup-audit',
        cat: 'cloud-cli',
        title: '数据库的备份策略经得起问吗',
        prompt: '安全合规检查问了一句："你们的数据库备份保留多久？"你不能只说"我们开了自动备份"——要能拿出**具体的保留天数和备份时间窗**。',
        task: '查出数据库实例的备份保留天数与备份时间窗',
        steps: [
          { title: '先确认实例清单', about: '实例 ID 与引擎版本', cmd: 'hcloud RDS ListInstances --cli-region=cn-north-4 --cli-output=table', ref: 'hw-rds-list', hint: ['回答备份问题之前先确认"是哪几个库"：数据库实例归 RDS 服务码管，先列出来', 'hcloud ____ ListInstances --cli-region=cn-north-4 --cli-output=table'], note: 'rds-order-prod，MySQL 8.0 单机版' },
          { title: '看备份策略', about: 'keep_days 就是保留天数', cmd: 'hcloud RDS ShowBackupPolicy --cli-region=cn-north-4', ref: 'hw-rds-power-backup', hint: ['策略是实例的一个属性：用 Show 而不是 List，把它单独取出来', 'hcloud RDS Show____ --cli-region=cn-north-4'], note: 'keep_days=7、start_time=02:00-03:00 —— 这两个值就是合规检查要的答案' },
          { title: '看实际产生了哪些备份', about: '策略是一回事，跑没跑成是另一回事', cmd: 'hcloud RDS ListBackups --cli-region=cn-north-4', ref: 'hw-rds-power-backup', expect: /"status": "COMPLETED"/, hint: ['策略写了不代表真的备份成功：要列出实际生成的备份记录，确认状态是 COMPLETED', 'hcloud RDS ____Backups --cli-region=cn-north-4'], note: '最近两天都有 COMPLETED 的自动备份 —— 策略确实在生效' }
        ],
        answer: 'hcloud RDS ShowBackupPolicy --cli-region=cn-north-4',
        alt: [
          'hcloud RDS ShowBackupPolicy --cli-region=cn-north-4 --cli-output=json',
          'hcloud rds ShowBackupPolicy --cli-region=cn-north-4'
        ],
        expect: /keep_days/,
        teach: '**"开了自动备份"和"备份可用"是三件不同的事，要分别证明**：① **策略存在**（`keep_days` 保留天数、`start_time` 备份窗口、`period` 哪几天备份）；② **备份真的生成了**（列出备份记录，状态必须是 `COMPLETED`，失败的要能发现）；③ **备份真的能恢复**（这条最容易被跳过 —— 定期做一次恢复到临时实例的演练，否则等于没有备份）。三个实务要点：**保留天数要按业务定**：7 天只够发现"昨天改错了"，如果财务月底才核对上月数据，7 天前的数据就救不回来，通常要 30 天以上，关键库要 180 天或归档到 OBS；**备份窗口要避开业务高峰**（`02:00-03:00` 是常见选择，备份会占 IO）；**删库跑路式的误操作要靠"备份 + binlog"双保险**，只靠每天一次的全量备份，最多只能恢复到昨天，中间一天的增量要靠 binlog 回放（这就引出了"备份保留"和"日志保留"是两个独立配置）。'
      },

      {
        id: 'hw-iam-ak-audit',
        cat: 'cloud-cli',
        title: '哪把钥匙从来没换过',
        prompt: '安全扫描报了一条"长期访问密钥未轮转"。你要在多把 AK/SK 里找出**哪一把是风险点** —— 判断依据不是名字，而是创建时间。',
        task: '列出所有永久访问密钥，找出最早创建、从未轮转的那把',
        steps: [
          { title: '先看有哪些子用户', about: '谁在用程序访问（access_mode）', cmd: 'hcloud IAM ListUsers --cli-region=cn-north-4 --cli-output=table', ref: 'hw-iam-user', hint: ['密钥是挂在"人"下面的：先列出身份（子用户），重点看哪些是程序访问模式', 'hcloud ____ ListUsers --cli-region=cn-north-4 --cli-output=table'], note: 'ops-user 与 ci-deploy 是 programmatic（程序访问），才需要 AK/SK' },
          { title: '列出永久访问密钥', about: 'create_time 是判断依据', cmd: 'hcloud IAM ListPermanentAccessKeys --cli-region=cn-north-4', ref: 'hw-iam-aksk-leak', hint: ['密钥本身也是资源：列出"永久访问密钥"，重点读每把的创建时间', 'hcloud IAM List____AccessKeys --cli-region=cn-north-4'], note: '9J****Q2 创建于 **2023-06-11**，一年多没换过 —— 这就是扫描报的那把' },
          { title: '确认有更安全的替代方案', about: '委托可以完全不用长期密钥', cmd: 'hcloud IAM ListAgencies --cli-region=cn-north-4', ref: 'hw-iam-agency', hint: ['先别急着换密钥：云上对"机器访问云资源"有不用长期密钥的做法，列出委托（agency）看看有没有现成的', 'hcloud IAM List____ --cli-region=cn-north-4'], note: '已经有 ecs-to-obs 委托 —— 说明这条路走得通，长期密钥本可以不发' }
        ],
        answer: 'hcloud IAM ListPermanentAccessKeys --cli-region=cn-north-4',
        alt: [
          'hcloud IAM ListPermanentAccessKeys --cli-region=cn-north-4 --cli-output=json',
          'hcloud iam ListPermanentAccessKeys --cli-region=cn-north-4'
        ],
        expect: /2023-06-11/,
        teach: '**长期密钥（AK/SK）是云上最常见的一类泄露源**，因为它必然要落在某个地方：CI 的变量、脚本、配置文件、甚至某人的笔记里。判断"哪把该换"看 `create_time`（越老越危险，因为泄露窗口越长）和 `description`（标注用途才知道能不能安全轮转）。治理的顺序是**先消除、再轮转**：① **能不用就不用** —— 云内机器访问云服务优先用**委托（agency）**，容器里用 **IAM 的临时凭证**（OIDC 联邦），这样根本不产生长期密钥；② **必须用的降到最小权限** —— 给 CI 单独建子用户，只授它真正需要的几个 API；③ **定期轮转** —— 建议 90 天，做法是"新建一把 → 把所有使用方切过去 → 确认旧密钥没有调用记录 → 停用 → 观察一段 → 删除"，**不要直接删**（会有你没想到的地方在用它，直接删就是一次故障）；④ **怀疑泄露时的应急顺序**：**先停用（disable）而不是删除** —— 停用立刻止血且可恢复，删除则不可逆，而且删了就看不出"谁在用它"了。'
      },

      {
        id: 'hw-ces-metric-first',
        cat: 'cloud-cli',
        title: '用户说"卡"，先问"哪个指标在抖"',
        prompt: '业务反馈"晚上八点左右特别慢"。这种"偶发、时段性"的问题，靠登机器看 `top` 是抓不到的 —— 你要的是**那段时间的历史指标**，而不是此刻的快照。',
        task: '查出 ECS 有哪些可用监控指标，并取回 CPU 使用率的历史数据点',
        steps: [
          { title: '先看这台机器上报了哪些指标', about: '先知道"能问什么"', cmd: 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.ECS', ref: 'hw-ces-list-metrics', hint: ['监控数据不是随便问的：先列出"这台机器上报了哪些指标名"，再决定拉哪一个', 'hcloud CES ListMetrics --cli-region=cn-north-4 --____=SYS.ECS'], note: 'cpu_util / mem_util / disk_util_inband —— 三个基础指标都在上报' },
          { title: '把指标名挑出来', about: '投影出 metric_name', cmd: 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.ECS --cli-query="metrics[].metric_name"', ref: 'hw-ces-list-metrics', hint: ['整段 JSON 太长：展开数组后只取指标名这一列', 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.ECS --cli-query="metrics[].____"'], note: '一行一个指标名，方便直接拿去拉数据' },
          { title: '取回历史数据点', about: '回答"那段时间到底发生了什么"', cmd: 'hcloud CES ShowMetricData --cli-region=cn-north-4 --namespace=SYS.ECS --metric_name=cpu_util --period=300', ref: 'hw-ces-show-metric-data', hint: ['要回答"晚上八点慢"就得取**历史数据点**而不是当前值：用 Show 开头的操作，指定指标名与聚合周期', 'hcloud CES Show____ --cli-region=cn-north-4 --namespace=SYS.ECS --metric_name=cpu_util --period=300'], note: '87.4% → 91.2% → 78.6% → 93.8%：确实在那段时间冲到了 90% 以上' }
        ],
        answer: 'hcloud CES ShowMetricData --cli-region=cn-north-4 --namespace=SYS.ECS --metric_name=cpu_util --period=300',
        alt: [
          'hcloud CES ShowMetricData --cli-region=cn-north-4 --namespace=SYS.ECS --metric_name=cpu_util',
          'hcloud ces ShowMetricData --cli-region=cn-north-4 --namespace=SYS.ECS --metric_name=cpu_util --period=300'
        ],
        expect: /datapoints|average/,
        teach: '**"偶发问题"要用时间序列回答，不能用当前快照回答。** 登机器敲 `top` 看到的是"此刻"，而用户抱怨的是"昨晚八点" —— 这时候唯一的证据是监控留存的历史数据点。查监控要先把三个坐标定死：**命名空间**（`SYS.ECS` 是云服务自带的，自定义指标是另一套）、**指标名**（`cpu_util` 使用率 / `mem_util` 内存 / `disk_util_inband` 磁盘 IO）、**聚合周期**（`period=300` 是 5 分钟一个点；周期越细保留越短，要长期看趋势就用大周期）。看数据点时**重点看平均值之外的极值**：平均值 60% 但每秒都冲到 100%，体感就是"卡"，所以实际排查要同时看 `max`。另外几个经验：**CPU 高不一定是应用的问题**（先看是不是 `%steal`，虚拟机被邻居抢占也会让 CPU 看起来很高）；**内存要看趋势而不是绝对值**（缓慢上涨才是泄漏，高位平稳通常只是缓存）；**磁盘指标要看 `disk_util_inband` 而不是剩余空间**（空间够但 IO 打满一样卡）。最后：监控只解决"看到"，要长期回答这类问题还得配告警（阈值 + 持续时间），否则下次还是靠人翻历史。'
      },

      {
        id: 'hw-obs-publish-dryrun',
        cat: 'cloud-cli',
        title: '发布前先预演一次',
        prompt: '要把前端产物同步到 OBS 静态托管桶。直接 `sync` 有两个风险：**传错桶**（把测试包传到生产）、**误删对象**（带 `-delete` 时会删掉桶里多出来的文件）。发布动作没有撤销键，所以要能先"空跑"一遍。',
        task: '先预演一次同步（不真正上传），确认要传哪些文件',
        steps: [
          { title: '先确认桶里现在有什么', about: '看清目标位置', cmd: 'obsutil ls obs://prod-static/web/', ref: 'hw-obsutil-ls', hint: ['发布前先看清目标位置现在有什么：OBS 工具列对象用的是哪个动词？把桶和前缀写全', 'obsutil ____ obs://prod-static/web/'], note: '先掌握目标现状，后面才能判断"这次会新增/覆盖什么"' },
          { title: '预演同步（关键一步）', about: '加上 dryRun 参数，只报告不改动', cmd: 'obsutil sync ./dist obs://prod-static/web/ -dryRun', ref: 'hw-cross-dryrun', hint: ['正式同步前先空跑：同步子命令有一个"只展示将要做什么、但不真的做"的参数，写法是短横线加 dryRun', 'obsutil sync ./dist obs://prod-static/web/ ____'], note: '列出"将要上传 1842 个文件"——确认数量与体积合理，再决定是否真传' },
          { title: '核对桶名没写错', about: '预演输出里会回显目标桶', cmd: 'obsutil ls', ref: 'hw-obsutil-ls', hint: ['把可用桶再列一遍，与预演输出里的目标桶名逐字比对——生产桶和测试桶名字通常只差几个字符', 'obsutil ____'], note: 'prod-backup 与 prod-static 是两个桶，别把静态站传到备份桶' }
        ],
        answer: 'obsutil sync ./dist obs://prod-static/web/ -dryRun',
        alt: [
          'obsutil sync ./dist obs://prod-static/web/ -dryRun -f',
          'obsutil sync ./dist obs://prod-static/web/ -dryRun -f -j=3'
        ],
        expect: /Upload successfully|Start at/,
        teach: '**任何"批量改远端状态"的命令，先用它的预演参数跑一遍。** 这是发布类操作最重要的一条纪律，而且各家的写法高度一致：`obsutil sync … -dryRun`、`aws s3 sync … --dryrun`、`rsync … -n`（`--dry-run`）、`terraform plan`、`helm diff upgrade`、`kubectl apply --dry-run=server`、`ansible-playbook --check`。**预演要看三件事**：① **目标对不对**（桶名、前缀、区域 —— 传错桶是最常见的事故）；② **动作符不符合预期**（只有上传？还是有删除？数量与体积合理吗）；③ **有没有意外的删除**（差一个字符的 `-delete` 就会把桶里别的东西清掉）。另外两个 OBS 发布的实务点：**静态托管要设对桶策略与 MIME**（HTML 是 `text/html`，少了会让浏览器下载而不是渲染；`obsutil cp` 可以用 `-meta` 指定）；**前端产物要避免缓存错配**（`index.html` 必须短缓存或不缓存，带 hash 的 JS/CSS 可以长缓存 —— 否则用户会拿到旧页面配新资源而白屏）。最后：OBS 的 CLI 有两个不同的工具（`hcloud OBS …` 与 `obsutil`），**它们的参数不通用**，别把两边的写法混着抄。'
      }
,

      {
        id: 'ci-which-version-to-rollback',
        cat: 'cicd',
        title: '要回滚，但我怎么知道回滚到哪个版本号',
        prompt: '线上 v1.2.3 出故障，运维说"回滚一下"。**可你手上只有一包镜像和一堆提交记录** —— 回滚到哪个 tag？那个 tag 对应什么改动？**选错版本号等于把另一个 bug 放上去。**',
        task: '用带装饰的日志把"提交、分支、tag"三者的对应关系看清楚，再定位目标版本',
        steps: [
          { title: '先看提交历史与装饰信息', about: '一行里同时看到分支与 tag', cmd: 'cd /data/app && git log --oneline --decorate -4', ref: 'ci-git-log', hint: ['要在一行里同时看到"提交、分支、tag"三种引用，得让日志带上装饰信息（`--decorate`），并把每条压成一行', 'cd /data/app && git log --oneline ____ -4'], note: '**`(HEAD -> main, tag: v1.2.3, origin/main)`** 这一段信息量极大：当前在 main、这个提交就是 v1.2.3、且已推到远端' },
          { title: '读出"哪个 tag 对应哪次改动"', about: 'tag 是发布的可引用锚点', cmd: 'cd /data/app && git log --oneline --decorate -4', ref: 'ci-git-log', hint: ['再读一遍同一份输出，这次把注意力放在"每个 tag 后面那句提交信息"上 —— 它就是那次发布的意图说明', 'cd /data/app && git log --oneline --decorate ____'], note: '**v1.2.3 是"订单列表接 Redis 缓存"** —— 故障与缓存上线同时发生，这就是回滚目标的判断依据' },
          { title: '确认候选版本确实在发布分支上', about: '回滚要回到"发布过的"版本', cmd: 'cd /data/app && git log --oneline --decorate -4', ref: 'ci-git-log', hint: ['回滚目标必须是**发布过**的版本，而"发布过"的证据是它同时被 tag 与发布分支引用 —— 在同一份输出里找这条双重引用', 'cd /data/app && git log --oneline --decorate ____'], note: '**v1.2.2 同时挂着 `release/1.2` 与 `tag: v1.2.2`** —— 双重引用说明它是正式发布过的版本，比"只在主干上的某个提交"更适合当回滚目标' },
          { title: '列出全部 tag 确认版本序列', about: '确认 v1.2.2 是上一版', cmd: 'cd /data/app && git tag -l', ref: 'ci-git-log', hint: ['要确认"上一版是哪个"，把所有 tag 列出来 —— 版本号的连续性本身就是判据', 'cd /data/app && git ____ -l'], note: 'v1.2.1 / v1.2.2 / v1.2.3 三个连续版本 —— **回滚的默认目标就是 v1.2.2**，除非有证据表明它是坏的' },
          { title: '看当前分支状态', about: '回滚前先确认工作区干净', cmd: 'cd /data/app && git status', ref: 'ci-git-status', hint: ['动手回滚前先确认工作区状态：有没有未提交的改动？**带着脏工作区切分支会冲突或把改动带过去**', 'cd /data/app && git ____'], note: '`On branch main` + 有未提交的 `config.yaml` —— **这段未提交改动必须先处理**（提交或还原），否则回滚操作会受影响' }
        ],
        answer: 'cd /data/app && git log --oneline --decorate -4',
        alt: [
          'cd /data/app && git log --oneline --decorate -4',
          'cd /data/app && git tag -l && git log --oneline --decorate -4'
        ],
        expect: /tag: v1\.2\.[123]|release\/1\.2/,
        teach: '**"回滚到哪个版本"是一个决策，而不是一次操作 —— 决策依据是"tag ↔ 提交 ↔ 改动意图"三者的对应关系。** `git log --oneline --decorate` 是看清这层关系的核心命令：**`--oneline`** 每条提交压成一行（看得下更多历史），**`--decorate`** 在旁边标注**分支、tag、远端跟踪引用**。没有 `--decorate` 时你只看到一串哈希与提交信息，**看不出"哪个提交是发布版"**；加上它，`(HEAD -> main, tag: v1.2.3, origin/main)` 一行就交代了三件事：当前在哪、这个提交是不是发布版、有没有推到远端。**选回滚目标的三条判据**：**① 它必须是"发布过"的版本** —— 证据是它同时被 tag 与发布分支引用（`release/1.2` + `tag: v1.2.2` 这种双重引用），只在主干上的普通提交**没有经过发布验证**，拿它回滚等于换一个未验证的版本上去；**② 版本号相邻**（`git tag -l` 确认序列）—— 回滚默认选**上一个版本**，而不是"任意一个以前的版本"（跨版本回滚会一次带回很多不相关的改动）；**③ 提交信息要能解释"为什么它是好的"** —— 这一条最容易被跳过，但它是唯一能回答"上一版真的没问题吗"的证据（历史上出现过"回滚到同样有问题的那一版"）。**动手前的两个前提**：**工作区必须干净**（`git status` 确认，带着脏工作区切分支会冲突，或把未提交改动带到目标分支上）；**确认远端状态**（`origin/main` 的存在说明本地与远端同步，回滚后要一起推）。**三条工程习惯**：**① tag 要打得有意义** —— 用 `v1.2.3` 这种**带语义的版本号**而不是日期或 `release-final`（版本号能表达"向后兼容"与否：`1.2.3` → `1.2.4` 是修 bug、`1.3.0` 是有新功能、`2.0.0` 是不兼容）；**② 发布必须打 tag，回滚才有锚点** —— "只推镜像不打 tag"是回滚困难的根源；**③ 回滚后也要打新 tag**（比如 `v1.2.4` 指向回滚后的状态），否则下一个人看历史会以为线上还跑着 v1.2.3 的内容。**最后一条与 K8s 那边呼应**：代码回滚不等于系统回滚 —— **数据库迁移、缓存里的数据结构、消息格式都不会跟着回去**，所以"回滚完还是报错"时，要先确认是不是有状态的部分已经变了。'
      },

      {
        id: 'ci-diff-before-commit',
        cat: 'cicd',
        title: '提交前先看一遍会提交什么',
        prompt: '你改了个配置打算提交。**`git commit -am "fix"` 一条命令下去，连同调试时留下的临时改动一起上了主干。** 而那个临时改动把缓存关掉了 —— 上线后才发现。**怎么在提交前拦住这种事？**',
        task: '用 diff 与 status 在提交前复核改动，区分"工作区"与"暂存区"两个视角',
        steps: [
          { title: '先看工作区改了什么', about: '未暂存的改动', cmd: 'cd /data/app && git status', ref: 'ci-git-status', hint: ['提交前的第一眼应该是"现在有什么状态"：已修改、未跟踪、已暂存分别是哪些 —— 这一步能立刻发现"多出来的东西"', 'cd /data/app && git ____'], note: '`modified: config.yaml` + 一批 `Untracked files` —— **未跟踪文件也在这个列表里**，一不留神就会被 `-a` 带进去' },
          { title: '看改动的统计摘要', about: '先看范围，再看细节', cmd: 'cd /data/app && git diff --stat', ref: 'ci-git-status', hint: ['看细节之前先看范围：哪个文件、改了几行 —— 摘要比全文快得多，也更容易发现"不该在这里的文件"', 'cd /data/app && git diff ____'], note: '**只有 `config.yaml` 一个文件、改了 1 行** —— 范围符合预期才值得往下看细节' },
          { title: '看改动的具体内容', about: '逐行确认改对了', cmd: 'cd /data/app && git diff', ref: 'ci-git-status', hint: ['范围没问题后再看逐行差异 —— 重点看"删掉的那行"和"新增的那行"是不是你想改的那一处', 'cd /data/app && git ____'], note: '**`-` 是原来的值、`+` 是新值** —— 提交前逐行确认，这就是"改动评审"最小可行的形态' },
          { title: '暂存后再看一次', about: '暂存区是"将要提交的那个快照"', cmd: 'cd /data/app && git add config.yaml && git diff --cached --stat', ref: 'ci-git-status', expect: /config\.yaml \| 2/, hint: ['`git add` 之后，改动的归属从"工作区"变成"暂存区" —— 要复核暂存区的内容，得换一个选项来看', 'cd /data/app && git add config.yaml && git diff ____ --stat'], note: '**`--cached`（等价 `--staged`）看的是"将要提交的快照"** —— 它才是 `commit` 真正会写进去的东西' },
          { title: '确认没有意外文件被暂存', about: '防"顺手带进去"', cmd: 'cd /data/app && git status', ref: 'ci-git-status', hint: ['暂存之后再看一次状态：确认"将要提交"那一栏里只有你想提交的文件 —— 这一步拦住的是"顺手 add ."造成的事故', 'cd /data/app && git ____'], note: '**"Changes to be committed" 这一栏就是提交内容** —— 里面出现任何非预期文件，都在这一步拦住' }
        ],
        answer: 'cd /data/app && git diff --stat && git diff',
        alt: [
          'cd /data/app && git diff --stat && git diff',
          'cd /data/app && git status && git diff --stat'
        ],
        expect: /config\.yaml|files? changed|diff --git/,
        teach: '**Git 有三个"看改动"的视角，混用它们正是"提交了不该提交的东西"的根源。** **① 工作区 vs 暂存区**（`git diff`）—— 你改了但还没 `add` 的内容；**② 暂存区 vs 上次提交**（`git diff --cached` / `--staged`）—— **这才是 `git commit` 真正会写进去的快照**；**③ 工作区 vs 上次提交**（`git diff HEAD`）—— 两者合起来看。**为什么必须分清**：`git commit -a` 会把**所有已跟踪文件的改动**一起提交，而 `git commit`（不带 `-a`）只提交**已暂存**的内容 —— 两者的差异就是"我以为提交了 A、实际把 B 也带上了"。**提交前的四步复核**（比"看一眼 diff"更可靠）：**① `git status`** 看全景（**特别注意 `Untracked files` 与 `Changes to be committed` 两栏**）；**② `git diff --stat`** 看范围（**先范围后细节**，摘要能一眼发现"多出来的文件"）；**③ `git diff`** 看逐行（确认删的、加的都是预期）；**④ `git add` 之后用 `git diff --cached` 再看一次** —— 这一步最容易被跳过，而它才是提交的真实内容。**三个习惯能省掉大部分事故**：**① 少用 `git add .` 与 `git commit -a`**（它们把"你没想到的文件"也纳入提交，`.gitignore` 没覆盖到的日志、临时文件、本地配置会一起上去）；**② `.gitignore` 要早写**（**已经提交过的文件再加进 `.gitignore` 是无效的**，必须先 `git rm --cached` 把它从版本控制里摘出来）；**③ 提交信息写"为什么"而不是"改了什么"** —— `git diff` 已经说明了改什么，信息里该写的是**动机**（本项目 `k8s-annotate-change-cause` 一节讲的同一条道理）。**一个与本项目相关的提醒**：`git diff` 的输出是**逐行文本差异**，它看不出语义 —— **配置文件里改了一个字符可能改变整个行为**（`max-size: 10m` 改成 `1m` 只是 1 个字符的差异），所以配置类改动**必须逐行读到值本身**，不能只看"改了 1 行"就放过。**最后**：仓库里出现不该有的文件时，排查顺序是"`git status` 看它在哪一栏 → 该忽略的补 `.gitignore` → 已经跟踪的用 `git rm --cached` 摘掉（**保留本地文件**）"。'
      },

      {
        id: 'ci-hotfix-branch',
        cat: 'cicd',
        title: '线上故障：从当前版本开一个修复分支',
        prompt: '线上 v1.2.3 的缓存配置写错了要立刻修。**直接在当前分支上改然后提交？** 可你手上还有一堆没完成的开发改动 —— **一提交就把没验证过的东西一起带上线了**。',
        task: '从当前已发布状态开一个修复分支，只提交这一个修复，并验证历史干净',
        steps: [
          { title: '先确认当前状态', about: '开分支前的现场检查', cmd: 'cd /data/app && git status', ref: 'ci-git-status', hint: ['开分支前先看清工作区：哪些是已修改、哪些是未跟踪 —— 这决定了"开分支会不会把半成品带过去"', 'cd /data/app && git ____'], note: '当前在 `main`、`config.yaml` 已修改、还有一批未跟踪文件 —— **这就是"不能直接提交"的原因**' },
          { title: '确认当前版本号', about: '修复要基于已发布版本', cmd: 'cd /data/app && git log --oneline --decorate -1', ref: 'ci-git-log', hint: ['确认你要修的是哪个版本：看最新提交挂着哪个 tag —— 修复分支必须从**已发布的那一版**开出来', 'cd /data/app && git log --oneline --decorate ____'], note: '`HEAD -> main, tag: v1.2.3` —— 当前状态就是线上那一版，从这里开分支是对的' },
          { title: '开一个语义明确的修复分支', about: '分支名要能说明意图', cmd: 'cd /data/app && git checkout -b hotfix/order-redis', ref: 'ci-git-switch', hint: ['专门开一个分支而不是在主分支上改 —— 命名要有语义：修复类分支用固定的前缀 + 简短英文描述', 'cd /data/app && git checkout ____ hotfix/order-redis'], note: '**`-b` 表示"新建并切换"** —— 分支名 `hotfix/order-redis` 一眼看出是"订单+Redis 的紧急修复"' },
          { title: '把修复提交上去', about: '一次提交只做一件事', cmd: 'cd /data/app && git add config.yaml && git commit -m "fix: 回退 Redis 缓存开关"', ref: 'ci-git-status', hint: ['把这一处修改暂存并提交 —— 提交信息用"类型: 做了什么"的格式，且**这次提交只包含这一个修复**', 'cd /data/app && git add config.yaml && git commit -m "____: 回退 Redis 缓存开关"'], note: '**提交信息以 `fix:` 开头**（约定式提交）—— 它让这条提交在历史里可被检索、也能驱动自动化生成变更日志' },
          { title: '确认历史里只有这一条新提交', about: '验证没有夹带', cmd: 'cd /data/app && git status && git log --oneline --decorate -2', ref: 'ci-git-log', hint: ['提交完要验证两件事：一是那些未跟踪文件**没有被带进来**，二是历史里只多出这一条提交', 'cd /data/app && git status && git log --oneline --decorate ____'], note: '**未跟踪文件仍在"Untracked"栏**（没被夹带），历史只多这一条 —— 这就是"干净的修复提交"' }
        ],
        answer: 'cd /data/app && git checkout -b hotfix/order-redis && git add config.yaml && git commit -m "fix: 回退 Redis 缓存开关"',
        alt: [
          'cd /data/app && git checkout -b hotfix/order-redis && git add config.yaml && git commit -m "fix: 回退 Redis 缓存开关"',
          'cd /data/app && git status && git log --oneline --decorate -2'
        ],
        expect: /Switched to a new branch|hotfix\/order-redis|master|main/,
        teach: '**紧急修复的第一原则是"隔离"：把修复与在途的开发改动分开，让上线的内容可预期。** **为什么不能在主干上直接改**：主干上往往混着未完成的功能、没验证的依赖升级、别人提交的半成品 —— **在主干上提交一个修复，推送时会把这一切一起带上去**。`git checkout -b <name>` 从**当前提交**开一条新分支，**已修改但未提交的改动会跟着过去**（它们属于工作区，不属于任何分支）—— 所以"开分支"本身不能隔离工作区的脏改动，**这正是第一步必须先 `git status` 的原因**。**分支命名的工程价值**：**`hotfix/` 前缀**说明"这是对已发布版本的紧急修复"（区别于 `feature/` 的在途功能、`release/` 的发布准备）；**描述部分用英文短横线连接**（`order-redis`），不用中文、不用空格、不带日期 —— **分支名会出现在 CI 流水线、日志、与工单系统里**，可检索性比可读性更重要。**一次提交只做一件事**：把修复与格式化、顺手的重构混在一个提交里，会让审查与回滚都变难（**回滚时会把有用的改动一起回掉**）。**提交信息的约定式格式**（`fix: 回退 Redis 缓存开关`）有三个实际好处：**① 可在历史里按类型检索**（本项目引擎的 `git log --grep` 是子集实现、会静默忽略筛选参数，但真机可用）；**② 能自动生成变更日志与版本号**（`feat:` → minor、`fix:` → patch、`BREAKING CHANGE` → major）；**③ 让"这次提交的意图"在半年后依然可读**。**紧急修复的完整流程**应该是：`git status` 确认现场 → 从**已发布的 tag 或发布分支**开 `hotfix/*` → 只改必要的那一处 → 提交并推送 → **CI 构建与测试** → 打新的 tag 发布 → 再合并回主干（**这一步最容易漏，漏了下次发布会把修复丢掉**）。**最后一条**：紧急修复期间**不要顺手做其它改动** —— 人在压力下容易"顺便把这个也改了"，而这些改动没有经过完整的测试流程；**修复分支的唯一目标是"让系统回到已知良好状态"**，其余事情等故障解除后按正常流程走。'
      }

  );
})();
