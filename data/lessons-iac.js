/* data/lessons-iac.js · Terraform / Ansible（练习课）
   --------------------------------------------------------------------------
   契约说明见 data/lessons.js 顶部。每节课的 steps[].cmd 必须是**引擎真能跑通**的
   命令（tools/shell-check.js 会把每节课的 answer/alt 逐条执行验证），
   每步都要有 ref（回指命令手册条目 id）与两级 hint。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  window.CC_LESSONS = window.CC_LESSONS || [];

  window.CC_LESSONS.push(

    {
      id: 'iac-tf-plan-review',
      cat: 'iac',
      title: '同事提的 Terraform 改动，合入前先算清它会动哪些资源',
      prompt: '/data/iac 是生产网络与三台 ECS 的 Terraform 工程。同事提了个 MR：在 main.tf 里新增一条 huaweicloud_vpc_eip.web_eip（给 ELB 预留的弹性公网 IP），顺手把 OBS 日志桶的 versioning 也打开了。你要在合入前说清楚：这次变更到底会动哪些资源、有没有夹带别的东西。',
      task: '先把工作目录初始化好，再确认 state 里现在管着哪些资源，最后让执行计划把新增 / 修改 / 销毁三类动作全部摆出来',
      steps: [
        { title: '拿到配置目录先补齐依赖', about: '任何子命令都要求这个目录已经初始化过', cmd: 'cd /data/iac && terraform init', ref: 'iac-tf-init', hint: ['拿到一个不熟的配置目录，第一件事是把 provider 插件与锁文件准备好：不做这一步，后面每条子命令都会因为依赖不一致直接失败', 'cd /data/iac && terraform ____'], note: '它下载 provider、写出 .terraform.lock.hcl，后面所有子命令都以这一步为前提' },
        { title: '看 state 里现在管着哪些资源', about: '状态文件里的地址清单才是唯一可信的现状', cmd: 'cd /data/iac && terraform state list', ref: 'iac-tf-state-list', hint: ['配置写的是期望状态，真正的现状在状态文件里：先把被管的资源地址一条条列出来，才知道这次改动会不会碰到别的资源', 'cd /data/iac && terraform state ____'], note: '1 个 VPC、2 个子网、3 台 ECS、1 个 OBS 桶，外加 module.legacy 下一条老 EIP —— 最后这条是接下来出问题的关键' },
        { title: '让执行计划把三类动作都摆出来', about: '新增 / 原地修改 / 销毁各有几条，谁会被动', cmd: 'cd /data/iac && terraform plan', ref: 'iac-tf-plan', hint: ['只看现状不够，要把配置与现状的差异算出来：一条资源一行，行首符号标明是新增、原地改还是删除，末尾还有一行汇总', 'cd /data/iac && terraform ____'], note: '汇总行是「1 to add, 1 to change, 1 to destroy」：新增预留 EIP、修改桶的版本控制、销毁那条已经没人声明的老 EIP' },
        { title: '把新增的那条单独拉出来核对', about: '只对一个地址算计划，确认它就是需求里那一个', cmd: 'cd /data/iac && terraform plan -target=huaweicloud_vpc_eip.web_eip', ref: 'iac-tf-plan', hint: ['需求只说加一条预留的公网 IP：把范围缩到这一个地址，确认规格、带宽、计费方式都对，再谈合不合', 'cd /data/iac && terraform plan ____=huaweicloud_vpc_eip.web_eip'], note: '10M 带宽、按流量计费、type = 5_bgp，与需求一致；但它要绑到哪台机器上 MR 里没写，这就是该回去问清楚的地方' },
        { title: '确认这次改动没连坐网络那一层', about: '按模块前缀再列一遍，确认没被顺手挪走', cmd: 'cd /data/iac && terraform state list module.vpc', ref: 'iac-tf-state-list', hint: ['这次只动了根模块，网络那部分一个字节都没改：按模块前缀再列一遍，确认它的三条地址都还在', 'cd /data/iac && terraform state list ____'], note: 'VPC 与两个子网都还在 module.vpc 下 —— 能给出这个结论，这次评审才算做完' }
      ],
      answer: 'cd /data/iac && terraform init && terraform plan',
      alt: [
        'cd /data/iac && terraform init && terraform plan -out=tfplan',
        'cd /data/iac && terraform init && terraform plan -no-color'
      ],
      expect: /1 to add, 1 to change, 1 to destroy/,
      teach: '审 Terraform 改动的固定顺序：**先 state list 看现状 → 再 plan 看差异 → 最后才谈 apply**。plan 的汇总行就是评审结论页：`1 to add` 是需求里的 EIP，`1 to change` 是 OBS 桶的 versioning（配置写了 true、云端还是 false，属于真实漂移），`1 to destroy` 是 module.legacy.huaweicloud_vpc_eip.old_eip —— 配置里已经没有任何 module "legacy" 块声明它，Terraform 只能理解成"你不要它了"。评审时最该盯住 destroy 那一行：删的是线上真资源，而且没有回收站。生产上的推荐姿势是 `terraform plan -out=tfplan` 存档、人眼核对、再 `terraform apply tfplan`，保证真正执行的就是你看过的那一份；计划文件可能含密码等敏感值，不要提交 Git。'
    },

    {
      id: 'iac-tf-destroy-triage',
      cat: 'iac',
      title: '计划里冒出一条要销毁的资源，先别点同意',
      prompt: '刚才的计划除了新增，还多出一行 destroy：module.legacy.huaweicloud_vpc_eip.old_eip。同事说"我没动过它"。你要在合入前查清它是谁的、为什么会被删、删了会不会出事。',
      task: '顺着「差异 → 现状 → 配置」这条线，把这条待销毁资源的来历查清楚，再决定是让它删还是留',
      steps: [
        { title: '先把差异算出来', about: '销毁动作只会出现在差异里，先看清有几条', cmd: 'cd /data/iac && terraform init && terraform plan', ref: 'iac-tf-plan', hint: ['要判断一条资源会不会被删，先得把配置与现状的差异算出来：行首的减号就是删除动作，末尾汇总行还会给出条数', 'cd /data/iac && terraform ____ && terraform plan'], note: '汇总行 1 to add, 1 to change, 1 to destroy —— 那条 destroy 就是本次要查的对象' },
        { title: '看这个模块名下登记了什么', about: '按 module. 前缀列一遍，确认它是孤儿还是成组存在', cmd: 'cd /data/iac && terraform state list module.legacy', ref: 'iac-tf-state-list', hint: ['计划里那条地址带 module. 前缀：先把这个模块名下登记的资源全列出来，看它是孤零零一条还是和别的资源成组存在', 'cd /data/iac && terraform state list ____'], note: 'module.legacy 下只有这一条 EIP —— 没有子资源、没有跟它绑在一起的机器' },
        { title: '读它的真实属性', about: '从状态里读出这条资源到底是什么、还在不在用', cmd: 'cd /data/iac && terraform state show module.legacy.huaweicloud_vpc_eip.old_eip', ref: 'iac-tf-state-list', hint: ['判断能不能删，靠的是它自己的属性：地址是多少、状态是 UP 还是 DOWN、有没有绑定到某台实例上 —— 这些都在状态里存着', 'cd /data/iac && terraform state show ____'], note: '121.36.44.17、status = DOWN、instance_id 为空：这条 2023 年的老 EIP 早就没绑任何东西了，删掉不影响业务' },
        { title: '确认配置侧还声明不声明它', about: '导出的依赖图里只有配置里真正写了的资源', cmd: 'cd /data/iac && terraform graph', ref: 'iac-tf-graph', hint: ['配置侧的依赖关系可以整个导出来：图里的节点就是配置里真正声明了的资源。说要删的那个地址如果压根不在图里，就说明配置侧已经没人认领它了', 'cd /data/iac && terraform ____'], note: '图里只有 VPC、两个子网、三台 ECS、OBS 桶和新增的 EIP，**没有 module.legacy** —— 原因清楚了：配置不再声明、state 还登记着，所以计划要销毁它' }
      ],
      answer: 'cd /data/iac && terraform state show module.legacy.huaweicloud_vpc_eip.old_eip',
      alt: [
        'cd /data/iac && terraform state list module.legacy',
        'cd /data/iac && terraform state show module.legacy.huaweicloud_vpc_eip.old_eip | head -20'
      ],
      expect: /old_eip/,
      teach: '一条资源被判成 destroy，只有两种可能：**state 里有、配置里没有**（有人删了配置块），或者配置块还在但属性改成了不支持原地修改（会显示 `-/+` 重建）。这里属于第一种，定位顺序就是本课的四步：plan 看有几条 → state list 缩小到模块 → state show 读真实属性 → graph 确认配置侧不再声明它。处置有三种：① 确认是历史遗留、确实不要了 —— 让它按计划销毁，但要先确认没有别的资源在依赖它；② 还在用 —— 把配置块补回来（或把资源 `terraform state mv` 到新模块下）再重新 plan；③ 暂时不想动它 —— 用 `lifecycle { prevent_destroy = true }` 挡住，或 `terraform state rm` 放弃管理（**云上资源不会被删，但 Terraform 从此不再管它**，会变成没人管的孤儿）。动手之前先 `terraform state pull > 备份文件`，远端 backend 场景下这几乎是唯一的后悔药。'
    },

    {
      id: 'iac-tf-validate-before-commit',
      cat: 'iac',
      title: '提交前过两道闸门：格式与配置各管什么',
      prompt: '你把 /data/iac 的改动做完了，准备提 MR。上一次合并之所以难 review，是因为有人把整仓库重新格式化了一遍，diff 里全是缩进；另一次是变量名写错，等到 plan 阶段才发现。这次你要在提交前把两道闸门都跑掉。',
      task: '把格式门禁与配置校验各跑一遍，弄清它们分别能拦住什么、拦不住什么，并把 CI 起手式串起来',
      steps: [
        { title: '校验也需要先装好 provider', about: '配置校验要用到 provider 提供的 schema', cmd: 'cd /data/iac && terraform init', ref: 'iac-tf-init', hint: ['配置校验不是纯文本比对，它要用 provider 的 schema 判断参数名与类型：所以这个目录得先初始化过，否则报的是缺 provider 而不是配置错', 'cd /data/iac && terraform ____'], note: '先 init 再校验，才不会把"没装 provider"误读成"配置写错了"' },
        { title: '只报告、不修改的格式门禁', about: '递归检查整个仓库，有不整齐的文件就返回非零', cmd: 'cd /data/iac && terraform fmt -check -recursive', ref: 'iac-tf-fmt', hint: ['格式问题不该混进业务提交里：要一种只报告、不改文件、发现不合规就返回非零退出码的用法，还要连子目录一起查', 'cd /data/iac && terraform fmt ____ -recursive'], note: '真机上全部合规时**没有任何输出**（这里那行教学说明是模拟终端加的）；CI 里它返回非零就是格式门禁失败' },
        { title: '跑一遍配置本身的校验', about: '语法、引用、必填参数、类型自洽', cmd: 'cd /data/iac && terraform validate', ref: 'iac-tf-validate', hint: ['格式对了不等于写得对：还要检查变量与资源引用是否存在、必填参数有没有漏、类型是否匹配 —— 这一步不访问云端、也不碰状态文件', 'cd /data/iac && terraform ____'], note: 'Success! The configuration is valid. —— 它只保证配置自洽，不保证云上一定建得出来' },
        { title: '给流水线要一份结构化结果', about: '拿机器可读的结论判断是否放行', cmd: 'cd /data/iac && terraform validate -json', ref: 'iac-tf-validate', hint: ['让人眼看的输出没法接到流水线里做判断：换一种输出格式，把 valid、错误条数、诊断列表都给成结构化字段', 'cd /data/iac && terraform validate ____'], note: '"valid": true 与 error_count: 0 就是 CI 里可以直接判断的两个字段' },
        { title: '把两道闸门串成 CI 起手式', about: '先查格式再查配置，两步都过才进 plan', cmd: 'cd /data/iac && terraform fmt -check -recursive && terraform validate', ref: 'iac-tf-fmt', hint: ['两道闸门各自跑一次太慢，流水线里通常串成一行：前一步失败就直接短路，后面的不再执行 —— 这样最便宜的检查永远排在前面', 'cd /data/iac && terraform fmt -check -recursive && terraform ____'], note: '格式问题几秒钟就能拦掉，比等 plan 打到云上再失败划算得多' }
      ],
      answer: 'cd /data/iac && terraform init && terraform validate',
      alt: [
        'cd /data/iac && terraform init && terraform fmt -check -recursive && terraform validate',
        'cd /data/iac && terraform init -upgrade && terraform validate'
      ],
      expect: /The configuration is valid/,
      teach: '两道闸门的分工完全不同：**fmt 管"写得整不整齐"，validate 管"写得对不对"**。fmt 只动缩进、等号对齐与列表换行，不碰语义；validate 查 HCL 语法、变量与资源引用、必填参数与类型。两者不能互相替代：缩进全对也可能引用一个不存在的变量，validate 全过也可能格式一团糟。更重要的是 **validate 通过 ≠ 能 apply**：配额不足、规格在该可用区售罄、镜像 ID 与区域不匹配，这些只有 plan/apply 真正打到云上才知道 —— validate 阶段它连云 API 都不调。CI 的起手式是 `terraform fmt -check -recursive && terraform validate`，然后才 `plan -out=tfplan`；另外记得格式化提交与业务提交分开，否则 review 里看不到真正的逻辑改动。'
    },

    {
      id: 'iac-tf-import-handover',
      cat: 'iac',
      title: '接手别人管的资源：先纳管，再谈重构地址',
      prompt: '运维在控制台上手工给应用集群补了第三台机器 app-prod-03（实例 ID 5f9eab32-74d3-4d81-be50-ac9f4b3a7d26），当时扩容来不及走流程。现在这套配置必须接管它 —— 否则下一次 apply 会把它当成多余的东西处理掉。',
      task: '把控制台上的存量机器纳管进状态，读出它的真实属性，再练习一次只改地址、不动云上资源的搬迁',
      steps: [
        { title: '先补齐依赖', about: '接管会写状态，前提是这个目录已初始化', cmd: 'cd /data/iac && terraform init', ref: 'iac-tf-init', hint: ['接管动作要读写状态文件，前提仍是把 provider 与锁文件准备齐：没初始化过会直接报依赖不一致', 'cd /data/iac && terraform ____'], note: 'init 是幂等的，重复执行不会重建任何资源' },
        { title: '确认它确实还没被管起来', about: '列出现有地址，看那台手建的机器在不在里面', cmd: 'cd /data/iac && terraform state list', ref: 'iac-tf-state-list', hint: ['接管之前先自证"它不在管理范围内"：把状态里登记的地址列一遍，应用机那几条只到下标 1 为止', 'cd /data/iac && terraform state ____'], note: '应用机只有 app[0]、app[1] 两台，控制台上那第三台确实没人管 —— 这就是隐患' },
        { title: '把存量机器登记进状态', about: '用资源地址加云上实例 ID 完成接管', cmd: 'cd /data/iac && terraform import \'huaweicloud_compute_instance.app[2]\' 5f9eab32-74d3-4d81-be50-ac9f4b3a7d26', ref: 'iac-tf-import', hint: ['云上有、状态里没有的资源，要按「配置里的地址 + 云资源 ID」绑进来；地址带下标时记得整体引起来，免得方括号被 shell 吃掉', 'cd /data/iac && terraform import \'____\' 5f9eab32-74d3-4d81-be50-ac9f4b3a7d26'], note: 'Import successful! —— 它**只写状态、不生成配置**：配置里先得有对应的 resource 块，否则会直接报 not found in configuration' },
        { title: '读出它的真实属性', about: '规格、内网地址、系统盘这些要回写进配置', cmd: 'cd /data/iac && terraform state show \'huaweicloud_compute_instance.app[2]\'', ref: 'iac-tf-state-list', hint: ['导进来只是登记，配置块还得自己写：先把这台机器在状态里的属性读出来，照抄真实规格才不会触发重建', 'cd /data/iac && terraform state show \'____\''], note: 'app-prod-03：内网 192.168.1.20、规格 s6.small.1、系统盘 SAS 40G —— 这些就是要回写进配置的值' },
        { title: '确认三台都在管理之下了', about: '按资源类型过滤，看下标有没有补齐', cmd: 'cd /data/iac && terraform state list huaweicloud_compute_instance', ref: 'iac-tf-state-list', hint: ['接管成功的标志是它出现在清单里：按资源类型把这一类地址全列出来，确认三台应用机加入口机都在', 'cd /data/iac && terraform state list ____'], note: '三台应用机（下标 0、1、2）加入口机 web 都在了；但真正的验收标准是计划能做到 No changes' },
        { title: '只改地址、不动云上资源', about: '把下标地址换成键名地址，对应配置改用键寻址', cmd: 'cd /data/iac && terraform state mv \'huaweicloud_compute_instance.app[2]\' \'huaweicloud_compute_instance.app["app-03"]\'', ref: 'iac-tf-state-mv', hint: ['下标寻址有个老毛病：删掉中间一台，后面的索引全部前移、连带重建。这次要把下标地址换成键名地址：源地址与目标地址都要写全，方括号与引号一个都不能少，搬迁本身只改状态里的地址记录', 'cd /data/iac && terraform state mv ____'], note: '搬迁成功、云上机器一动不动；但配置块也必须同步改成键寻址，否则下一次计划里这台机器会被判成待销毁 —— 这正是接管后最经典的翻车方式' }
      ],
      answer: 'cd /data/iac && terraform init && terraform import \'huaweicloud_compute_instance.app[2]\' 5f9eab32-74d3-4d81-be50-ac9f4b3a7d26',
      alt: [
        'cd /data/iac && terraform init && terraform import -lock-timeout=5m \'huaweicloud_compute_instance.app[2]\' 5f9eab32-74d3-4d81-be50-ac9f4b3a7d26',
        'cd /data/iac && terraform init && terraform import -input=false \'huaweicloud_compute_instance.app[2]\' 5f9eab32-74d3-4d81-be50-ac9f4b3a7d26'
      ],
      expect: /Import successful/,
      teach: '**import 与 state mv 的分工要分清**：`import` 解决"云上有、状态里没有"（存量接管），`state mv` 解决"云上有、状态里也有，但地址写错了或要重构"（改名不改物）。两条都只写状态、都不生成配置：import 完必须手工补 resource 块、用 `state show` 的真实属性回写、再 plan 磨到 No changes —— 否则下一次 apply 就会把"状态里有、配置里没有"的资源删掉，这是 import 最经典的翻车方式。count 与 for_each 之间的地址迁移必须**逐个资源**执行，漏一个就是一次「删 N 台建 N 台」的事故；动手前先 `terraform state pull > state-备份.tfstate`，远端 backend 下还要避开别人正在跑的 apply（会撞状态锁）。'
    },

    {
      id: 'iac-ans-idempotent-check',
      cat: 'iac',
      title: '用 Ansible 给一批主机做一次幂等的配置检查',
      prompt: '三台 ECS 刚交付完（10.0.1.31、10.0.1.32、10.0.2.15），site.yml 里写的是初始化那些事：建运维用户、改时区、装时间同步服务、装 Docker、下发 Nginx 配置。上线前你要先确认两件事：这批机器连不连得上、这套任务跑下去会改什么。',
      task: '先验证连通性并圈定主机范围，再让 playbook 干跑一遍看清会改什么 —— 全程不改任何一台机器',
      steps: [
        { title: '第一步永远先验连通性', about: '验证的是能登录且远端有可用的解释器，不是 ICMP', cmd: 'cd /data/iac && ansible all -i inventory.ini -m ping', ref: 'iac-ans-adhoc', hint: ['批量操作之前先确认三台都摸得到：返回里会写明远端解释器的路径，这比"能不能 ping 通"更能说明问题', 'cd /data/iac && ansible all -i inventory.ini -m ____'], note: '三台都返回 pong 才谈后面的批量操作；有一台不通就先把它从范围里摘出去' },
        { title: '顺手看一眼这批机器的负载', about: '一台一行的压缩输出最适合贴进变更单', cmd: 'cd /data/iac && ansible web -i inventory.ini -m command -a "uptime" -o', ref: 'iac-ans-adhoc', hint: ['改配置之前先看机器闲不闲：对 web 组执行一条查看负载的远端命令，输出压成一台一行最好读', 'cd /data/iac && ansible web -i inventory.ini -m command -a "____" -o'], note: '两台 web 的负载都在 1 以下，可以安排变更窗口；注意这里用的是 command 模块，不经过远端 shell' },
        { title: '确认主机模式会命中谁', about: '组名写错不会报错，只会"没有匹配到主机"', cmd: 'cd /data/iac && ansible-inventory -i inventory.ini --graph', ref: 'iac-ans-inventory', hint: ['批量的第一风险是打错范围：把清单解析出来的分组树打出来，确认 web、app、db 这些组里到底各有哪些地址', 'cd /data/iac && ansible-inventory -i inventory.ini ____'], note: '10.0.1.31 与 10.0.1.32 同时在 web 和 app 组里，db 组只有 10.0.2.15 —— 后面按组命中时要记住这一点' },
        { title: '执行前先过语法闸门', about: '只校验结构与模块名，不连主机也不改东西', cmd: 'cd /data/iac && ansible-playbook -i inventory.ini site.yml --syntax-check', ref: 'iac-ans-playbook', hint: ['正式执行前花一秒做最便宜的检查：只校验 YAML 结构与模块名，一个主机都不连', 'cd /data/iac && ansible-playbook -i inventory.ini site.yml ____'], note: '语法检查查不出变量名拼错、路径不存在这类问题 —— 它只管结构' },
        { title: '干跑一遍，看清会改什么', about: '只判断"会不会变更"，不落地任何改动', cmd: 'cd /data/iac && ansible-playbook -i inventory.ini site.yml --check --diff -t common', ref: 'iac-ans-playbook', hint: ['真正执行之前先演练：只报告会不会变更、不落地任何改动，并用标签把范围限在通用初始化那几项上，避开没有仿真输出的命令', 'cd /data/iac && ansible-playbook -i inventory.ini site.yml --check --diff -t ____'], note: 'PLAY RECAP 里 failed=0、changed=3：三个通用任务都"会改"（真机第一次跑本来就会改）；干跑通过不代表真跑没问题，脚本类任务在检查模式下会被跳过' },
        { title: '弄清配置从哪儿来', about: '为什么当前目录里不带清单参数也能找到主机', cmd: 'cd /data/iac && ansible-config dump --only-changed', ref: 'iac-ans-config', hint: ['同一个终端换个目录跑行为就变了，原因通常在配置文件：把被改动过的配置项与它们的来源文件一起打出来，就有确定答案', 'cd /data/iac && ansible-config ____ --only-changed'], note: 'CONFIG_FILE 与 DEFAULT_HOST_LIST 都指向 /data/iac/ansible.cfg —— 当前工作目录里的配置优先于 ~/.ansible.cfg 与 /etc/ansible/ansible.cfg' }
      ],
      answer: 'cd /data/iac && ansible-playbook -i inventory.ini site.yml --check --diff -t common',
      alt: [
        'cd /data/iac && ansible-playbook -i inventory.ini site.yml -C -D -t common',
        'cd /data/iac && ansible-playbook -i inventory.ini site.yml --check --diff -t common -l 10.0.1.31'
      ],
      expect: /failed=0/,
      teach: 'ad-hoc 与 Playbook 的分工：**看一眼、改一下用 ad-hoc；有逻辑、要留痕、要复现的写成 Playbook**。Playbook 的标准三步走是先 `--syntax-check`（结构）→ 再 `--check --diff`（干跑看会改什么）→ 最后正式执行，首次上生产一律 `-l` 限一台。读 PLAY RECAP 是基本功：`ok` 是没变的、`changed` 是这次真会改的（**第二次跑 changed=0 才叫幂等达标**）、`failed` 是任务失败、`unreachable` 是连不上 —— 后两者不为 0 时别急着往下走。两个常被忽略的边界：`--check` 对 `command`/`shell` 这类任务默认跳过（要它执行得配 `check_mode: false`），所以"检查通过"不等于"跑起来没问题"；ad-hoc 命令**不支持** `--check`，要干跑就必须写成 Playbook。'
    },

    {
      id: 'iac-ans-vault-secrets',
      cat: 'iac',
      title: '密码不该明文躺在仓库里：把敏感变量交给 vault',
      prompt: '有人把 SSH 登录密码和数据库密码明文写进了 /data/iac/group_vars/all/vault.yml，而这个目录是要提交到 Git 的。你要在不改任何 Playbook 逻辑的前提下把这些值加密，并且让流水线依然跑得起来。',
      task: '先看清明文现状，再做整体加密与单条变量加密，最后确认带上密码来源后 playbook 依然能跑',
      steps: [
        { title: '先看清风险面', about: '明文密码就在要提交的目录里，字段名叫什么', cmd: 'cd /data/iac && cat group_vars/all/vault.yml', ref: 'iac-ans-vault', hint: ['动手之前先看清这个文件里到底写了什么、有几个值、字段名怎么拼 —— 它就在要提交 Git 的目录里', 'cd /data/iac && ____ group_vars/all/vault.yml'], note: '两个明文密码。vars.yml 里是用 {{ vault_ssh_pass }} 引用的，所以只要把这个文件加密，Playbook 一行都不用改' },
        { title: '把整个文件加密', about: '密码来源指向权限 600、不进 Git 的密码文件', cmd: 'cd /data/iac && ansible-vault encrypt --vault-password-file /root/.vault_pass group_vars/all/vault.yml', ref: 'iac-ans-vault', hint: ['要让这个文件可以放心提交，就整体加密它；密码别交互输入，指向一个权限 600、不进 Git 的密码文件，流水线里才能无人值守复现', 'cd /data/iac && ansible-vault encrypt --vault-password-file ____ group_vars/all/vault.yml'], note: 'Encryption successful。加密是 AES256 对称加密，**密码丢了没有后门**；密码文件要 chmod 600 并写进 .gitignore' },
        { title: '确认文件形态真的变了', about: '看文件头有没有变成加密标志，明文是否还在', cmd: 'cd /data/iac && head -3 group_vars/all/vault.yml', ref: 'iac-ans-vault', hint: ['加密完要验证而不是相信：看文件开头几行，第一行会变成标识加密格式的文件头，后面是密文', 'cd /data/iac && ____ -3 group_vars/all/vault.yml'], note: '$ANSIBLE_VAULT;1.1;AES256 这一行就是加密标志；只要看到它、且看不到明文值，这个文件就可以提交 Git 了' },
        { title: '给零散的值单独加密', about: '生成可以直接贴进 YAML 的加密块', cmd: 'cd /data/iac && ansible-vault encrypt_string --vault-password-file /root/.vault_pass \'Huawei@12345\' --name \'vault_db_password\'', ref: 'iac-ans-vault', hint: ['有些值散落在普通变量文件里，不值得为它单独建一个加密文件：把单个字符串加密成可直接粘贴的块，并顺手把变量名标好', 'cd /data/iac && ansible-vault ____ --vault-password-file /root/.vault_pass \'Huawei@12345\' --name \'vault_db_password\''], note: '生成的加密块缩进必须与所在 YAML 层级一致，贴错缩进会直接报 YAML 解析错误' },
        { title: '加密之后流水线还能跑', about: '执行时把同一个密码来源一起带上', cmd: 'cd /data/iac && ansible-playbook -i inventory.ini site.yml --syntax-check --vault-password-file /root/.vault_pass', ref: 'iac-ans-playbook', hint: ['加密的代价是执行时要提供密码：把密码来源一起传给 playbook，先做一次不连主机的语法检查确认链路没断', 'cd /data/iac && ansible-playbook -i inventory.ini site.yml --syntax-check ____ /root/.vault_pass'], note: '不带密码来源会直接报解密失败；CI 里由凭据服务下发这个文件，不要写进脚本或流水线变量里' }
      ],
      answer: 'cd /data/iac && ansible-vault encrypt --vault-password-file /root/.vault_pass group_vars/all/vault.yml',
      alt: [
        'cd /data/iac && ansible-vault encrypt --vault-password-file=/root/.vault_pass group_vars/all/vault.yml',
        'cd /data/iac && ansible-vault encrypt group_vars/all/vault.yml --vault-password-file /root/.vault_pass'
      ],
      expect: /Encryption successful/,
      teach: 'vault 的三条铁律：**加密文件进 Git、密码文件不进 Git、改内容用 `edit` 不用 `decrypt`**。`decrypt` 会把明文写到磁盘上，误提交一次就前功尽弃；`edit` 是把内容解密到临时文件交给编辑器，保存后自动重新加密。多环境建议用 `--vault-id dev@dev_pass --vault-id prod@prod_pass` 区分密码，避免测试环境的密码能解开生产密钥。还要记住两点边界：vault 只保护**静态存储**，运行期变量在远端仍是明文（`no_log: true` 才能挡住日志回显）；加密只解决"仓库里不能有明文"，不解决"谁能读仓库" —— 有仓库读权限的人拿到密码文件照样能解开。'
    }

  );
})();
