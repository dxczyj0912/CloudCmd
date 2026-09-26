/* data/iac.js · 分类 14 Terraform / Ansible */
(function () {
  'use strict';

  var catId = 'iac';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. Terraform 生命周期 ================= */

    /* ---------- 1 / 45 ---------- */
    {
      id: 'iac-tf-init',
      name: 'terraform init',
      alias: ['tf init', '初始化工作目录'],
      level: 1,
      syntax: 'terraform init [选项]',
      summary: '初始化工作目录、下载 provider 插件并接上远端状态，一切操作的前提。',
      desc: '`init` 一次做四件事：扫描配置里用到的 provider 并下载到 `.terraform/`、初始化 backend（把 state 落到本地或华为云 OBS）、下载 module、生成 `.terraform.lock.hcl` 锁定 provider 版本。只要改过 `backend` 块、`required_providers` 或 module 来源，就必须重新 `init`。它是幂等的，重复执行不会重建已有资源。',
      params: [
        { flag: '-upgrade', desc: '把 provider 升到配置允许的最新版并重写 lock 文件，升级后必须重跑 plan 回归' },
        { flag: '-reconfigure', desc: '忽略已有 backend 配置重新初始化，改了桶名/key 后用它，不迁移旧 state' },
        { flag: '-migrate-state', desc: '把已有 state 迁到新 backend（本地到 OBS、或 OBS 换桶），会交互确认' },
        { flag: '-backend-config=KEY=VALUE', desc: '运行时补 backend 参数，AK/SK 用这个传，不落进 .tf 文件' },
        { flag: '-plugin-dir=PATH', desc: '从本地目录装 provider 插件，内网/离线环境用' }
      ],
      examples: [
        { cmd: 'terraform init', desc: '第一次初始化，或改了 module 来源之后重新执行' },
        { cmd: 'terraform init -upgrade', desc: '把华为云 provider 升到配置允许的最新版，升级完先 terraform plan 看差异' },
        { cmd: 'terraform init -reconfigure -backend-config=access_key=$HWC_ACCESS_KEY -backend-config=secret_key=$HWC_SECRET_KEY', desc: 'backend 里不写密钥，运行时从环境变量注入' },
        { cmd: 'terraform init -migrate-state', desc: '把本地 state 迁到 OBS 远端后端，会问 yes 确认' }
      ],
      notes: [
        'AK/SK 不要写进 `backend` 块或 `.tf` 文件：backend 块不支持变量，密钥只能靠环境变量或 `-backend-config` 传，写进 Git 等于泄露账号',
        '`.terraform.lock.hcl` 必须提交到 Git，它锁的是 provider 版本与哈希；不提交等于每次构建都可能装到不同版本',
        '`-upgrade` 会真的换 provider 版本，华为云 provider 小版本升级有时带字段变化，升完先 `plan` 再谈上线',
        '报 `Backend initialization required` 时按提示跑一次 `init` 即可；报 `Failed to get existing workspaces` 一般是 OBS 桶名、endpoint 或密钥不对',
        '`.terraform/` 目录不要提交 Git，里面是插件二进制'
      ],
      related: ['iac-tf-backend', 'iac-tf-plan', 'iac-tf-validate', 'iac-tf-providers-lock'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/init',
      tags: ['初始化', 'provider', '后端']
    },

    /* ---------- 2 / 45 ---------- */
    {
      id: 'iac-tf-plan',
      name: 'terraform plan',
      alias: ['tf plan', '执行计划'],
      level: 1,
      syntax: 'terraform plan [选项]',
      summary: '预演这次改动会新增、修改、销毁哪些资源，apply 之前的必做检查。',
      desc: '`plan` 先刷新云端真实状态，再把配置与 state 做差异比较，输出一张带 `+`（新增）、`~`（修改）、`-/+`（销毁重建）、`-`（销毁）标记的计划表。最重要的用法是 `-out` 存档：`plan -out=tfplan` 之后 `apply tfplan`，保证真正执行的就是你看过的那份计划，中间别人改了配置也不影响。',
      params: [
        { flag: '-out=tfplan', desc: '把计划存成文件，供 apply 直接执行，生产环境推荐' },
        { flag: '-var-file=prod.tfvars', desc: '指定变量文件，多环境靠它切换' },
        { flag: '-target=ADDRESS', desc: '只处理指定资源及其依赖，排障用，会跳过依赖图的其余部分' },
        { flag: '-destroy', desc: '生成销毁计划，先看看 destroy 会删什么' },
        { flag: '-refresh=false', desc: '跳过刷新，直接拿 state 里的旧状态算差异（云 API 慢或被限流时用）' },
        { flag: '-detailed-exitcode', desc: 'CI 用：退出码 0 无变更、1 出错、2 有变更' }
      ],
      examples: [
        { cmd: 'terraform plan', desc: '最常用，人眼确认计划' },
        { cmd: 'terraform plan -out=tfplan', desc: '存档计划，接着 terraform apply tfplan 保证一致' },
        { cmd: 'terraform plan -var-file=prod.tfvars', desc: '用生产变量文件生成计划' },
        { cmd: 'terraform plan -target=huaweicloud_compute_instance.web -out=fix.tfplan', desc: '只针对一台 ECS 生成计划，用于线上应急修单台' },
        { cmd: 'terraform plan -detailed-exitcode; echo "exit=$?"', desc: 'CI 里判断这次提交到底有没有资源变更' }
      ],
      notes: [
        '计划里的值来自 state 与 cloud 的对比结果，别人在控制台手工改过资源时，plan 显示的差异是真实漂移，不代表配置写错了',
        '`-target` 是排障工具而不是日常用法：它只处理依赖图的一个子图，长期用会让 state 与实际逐渐脱节，用完记得补一次完整 plan',
        '`-detailed-exitcode` 的退出码 2 表示「有计划」不是失败，CI 脚本里别把 2 当错误处理',
        '计划文件里可能含密码等敏感值（`sensitive` 变量也会写进去），`tfplan` 不要提交 Git、不要放共享目录',
        '华为云 provider 在 plan 阶段就会调 Read 类接口，资源多时慢是正常的，可以加 `-parallelism=5` 降低并发避免被限流'
      ],
      related: ['iac-tf-apply', 'iac-tf-init', 'iac-tf-refresh', 'iac-tf-destroy', 'iac-tf-output'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/plan',
      tags: ['计划', '预演', '差异']
    },

    /* ---------- 3 / 45 ---------- */
    {
      id: 'iac-tf-apply',
      name: 'terraform apply',
      alias: ['tf apply', '创建资源'],
      level: 2,
      syntax: 'terraform apply [选项] [计划文件]',
      summary: '按计划真正调用云 API 创建或修改资源，确认前一定要先看过 plan。',
      desc: '不带参数时会先算一次计划再等你输入 `yes`；带计划文件（`terraform apply tfplan`）则直接执行存档的计划，不再重新计算，这是生产推荐姿势。华为云上一次 apply 通常按 VPC → 子网 → 安全组规则 → ECS → EIP → 绑定的顺序串行推进，ECS 创建是异步的，provider 会轮询到实例就绪，默认超时 30 分钟。',
      params: [
        { flag: '-auto-approve', desc: '跳过 yes 确认，CI 里配合存档的 plan 文件使用' },
        { flag: '-replace=ADDRESS', desc: '强制销毁重建指定资源，替代老写法 terraform taint' },
        { flag: '-target=ADDRESS', desc: '只应用指定资源，应急修单台机器' },
        { flag: '-var-file=prod.tfvars', desc: '指定变量文件' },
        { flag: '-parallelism=5', desc: '限制并发资源数，云 API 限流时降低' },
        { flag: '-lock-timeout=5m', desc: '等待 state 锁的时长，CI 并发时避免直接失败' }
      ],
      examples: [
        { cmd: 'terraform apply', desc: '交互确认后执行，适合人工操作的场景' },
        { cmd: 'terraform apply -auto-approve', desc: '无人值守执行，只建议在测试环境直接这么用' },
        { cmd: 'terraform plan -out=tfplan && terraform apply tfplan', desc: '生产推荐：先存档计划再执行，二者完全一致' },
        { cmd: 'terraform apply -replace=huaweicloud_compute_instance.web -auto-approve', desc: '强制重建一台 ECS（会先删后建，注意业务中断）' },
        { cmd: 'terraform apply -target=huaweicloud_vpc_eip.web_eip -auto-approve', desc: '只补建一个弹性公网 IP' }
      ],
      notes: [
        '执行中不要 Ctrl+C：中断会留下「已经建了但没写进 state」的资源，恢复时先 `terraform plan` 看差异，必要时用 `terraform import` 把半成品接管回来',
        '`-auto-approve` 不是省事而是省掉了最后一道人眼检查，配合 `plan -out` 才有意义',
        '华为云 ECS 创建失败常见原因：该可用区没有这个规格、镜像 ID 与区域不匹配、配额不足；报错会带 `Error: ... ` 与资源地址，按地址定位配置块',
        'ECS 的 `delete_disks_on_termination` 默认 false（数据盘保留）、`delete_eip_on_termination` 默认 true（EIP 释放），重建前想清楚哪个要留',
        '重建类变更（`-/+`）意味着服务中断，先在负载均衡或 Keepalived 侧把这台机器摘掉再执行'
      ],
      related: ['iac-tf-plan', 'iac-tf-destroy', 'iac-tf-import', 'iac-tf-taint', 'iac-tf-output-block'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/apply',
      tags: ['创建', '变更', '执行']
    },

    /* ---------- 4 / 45 ---------- */
    {
      id: 'iac-tf-destroy',
      name: 'terraform destroy',
      alias: ['tf destroy', '删除全部资源'],
      level: 2,
      syntax: 'terraform destroy [选项]',
      summary: '按依赖关系反向删除配置管理的全部云资源，等于执行一次销毁计划。',
      desc: '它先生成销毁计划（顶多先删 ECS 再删子网、VPC），确认后逐条调云 API 删除。想删干净又不想漏，正确顺序是 `terraform plan -destroy -out=destroy.tfplan` 存档、人眼核对清单、再 `terraform apply destroy.tfplan`。删单台机器用 `-target`，比直接 destroy 安全得多。',
      params: [
        { flag: '-auto-approve', desc: '跳过确认，危险，只建议在临时测试环境用' },
        { flag: '-target=ADDRESS', desc: '只销毁指定资源，删单台机器时用这个' },
        { flag: '-var-file=prod.tfvars', desc: '变量文件必须与 apply 时一致，否则计划可能不同' },
        { flag: '-refresh=false', desc: '跳过刷新直接按 state 删，云端已手工删过的资源会报错' },
        { flag: '-lock-timeout=5m', desc: '等待 state 锁' }
      ],
      examples: [
        { cmd: 'terraform plan -destroy -out=destroy.tfplan', desc: '先生成销毁计划存档，人眼核对要删什么' },
        { cmd: 'terraform apply destroy.tfplan', desc: '按核对过的计划执行销毁' },
        { cmd: 'terraform destroy', desc: '交互式销毁，输入 yes 才会执行' },
        { cmd: 'terraform destroy -target=huaweicloud_compute_instance.web -auto-approve', desc: '只删一台 ECS，网络与安全组保留' }
      ],
      notes: [
        '**destroy 删的是真实云资源且没有回收站**：ECS 删除后系统盘一起消失，EIP 默认随实例释放（`delete_eip_on_termination` 默认 true），数据盘看 `delete_disks_on_termination`（默认保留）',
        '生产账号里**收掉 destroy 权限**：CI 流水线不放 destroy 步骤，靠 IAM 权限或 `prevent_destroy` 兜底',
        '给关键资源加 `lifecycle { prevent_destroy = true }` 后，destroy 会直接报错停下，而不是悄悄删掉',
        'OBS 桶非空时删除会失败（桶里有对象），`force_destroy` 默认 false 就是防误删，别为了「删干净」随手改 true',
        '销毁顺序由依赖图决定，报 `DependencyViolation`（华为云常见）说明还有子资源占用父资源，检查是否有手工创建的资源不在 state 里'
      ],
      related: ['iac-tf-apply', 'iac-tf-plan', 'iac-tf-lifecycle', 'iac-tf-state-rm', 'iac-tf-refresh'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/destroy',
      tags: ['销毁', '危险', '清理']
    },

    /* ---------- 5 / 45 ---------- */
    {
      id: 'iac-tf-validate',
      name: 'terraform validate',
      alias: ['tf validate', '配置校验'],
      level: 1,
      syntax: 'terraform validate [选项]',
      summary: '只校验配置的语法与引用是否自洽，不访问云端也不碰状态文件。',
      desc: '检查范围包括 HCL 语法、变量与资源引用是否存在、必填参数有没有漏、类型是否匹配。它**不做云 API 层面的校验**：规格在该可用区有没有货、镜像 ID 有没有过期，都得等 `plan` 打到云上才知道。必须在 `terraform init` 之后执行，因为要用到 provider 的 schema。适合放进 CI 第一步或 Git 提交钩子，几秒就能拦住低级错误。',
      params: [
        { flag: '-json', desc: '输出机器可读的 JSON，CI 里解析错误列表用' },
        { flag: '-no-color', desc: '去掉 ANSI 颜色，重定向到文件时用' }
      ],
      examples: [
        { cmd: 'terraform validate', desc: '最常用，改完配置先跑一遍' },
        { cmd: 'terraform validate -json', desc: 'CI 里拿结构化结果判断是否放行' },
        { cmd: 'terraform fmt -check -recursive && terraform validate', desc: 'CI 起手式：先查格式再查语法，两步都过才进 plan' }
      ],
      notes: [
        '没跑过 `terraform init`（缺 `.terraform/`）时会报缺 provider 或提示先 init，这不是配置错',
        '`validate` 通过不等于能 apply：配额不足、规格售罄、镜像与区域不匹配这类问题只有 plan/apply 才会暴露',
        '变量没有 `default` 时 `validate` 仍能过，它不求解变量值，真正的取值检查在 plan 阶段',
        '模块内部写错的引用也会被查出来，但只有在模块被引用到时才检查'
      ],
      related: ['iac-tf-init', 'iac-tf-fmt', 'iac-tf-plan', 'iac-tf-providers-lock'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/validate',
      tags: ['校验', '语法', 'CI']
    },

    /* ---------- 6 / 45 ---------- */
    {
      id: 'iac-tf-fmt',
      name: 'terraform fmt',
      alias: ['tf fmt', '格式化 HCL'],
      level: 1,
      syntax: 'terraform fmt [选项] [文件|目录]',
      summary: '按官方风格统一缩进与等号对齐，团队协作避免无意义的格式差异。',
      desc: '只改格式（缩进、`=` 对齐、列表换行），不改语义：不会重排资源块里的参数顺序，也不会改变量名。默认只处理当前目录，`-recursive` 递归子目录。`-check` 不写文件只报告哪些文件不符合规范并返回非 0 退出码，`-diff` 打印具体差异，这两个组合起来就是 CI 里的格式门禁。',
      params: [
        { flag: '-recursive', desc: '递归处理子目录，多模块仓库必备' },
        { flag: '-check', desc: '只检查不修改，有文件需要格式化时返回非 0 退出码' },
        { flag: '-diff', desc: '打印会改动的内容，配 -check 用来看差在哪' },
        { flag: '-write=false', desc: '不写文件，只把格式化结果输出到标准输出' },
        { flag: '-list=false', desc: '不打印被处理的文件名' }
      ],
      examples: [
        { cmd: 'terraform fmt -recursive', desc: '整个仓库格式化一遍，提交前跑' },
        { cmd: 'terraform fmt -check -diff -recursive', desc: 'CI 门禁：不改文件，只报哪里不合规' },
        { cmd: 'terraform fmt modules/ecs/main.tf', desc: '只格式化单个文件' }
      ],
      notes: [
        '格式化和业务改动别混在一个提交里，否则 Git diff 全是缩进变化，review 时看不到真正的逻辑改动',
        '`-check` 发现不合规文件会返回非 0 退出码，CI 里据此拦提交；注意它和 `validate` 的失败原因完全不同，别混着报错看',
        '`.terraform/`、`*.tfstate` 不要提交 Git；`.terraform.lock.hcl` 要提交'
      ],
      related: ['iac-tf-validate', 'iac-tf-init', 'iac-tf-providers-lock'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/fmt',
      tags: ['格式化', '风格', 'CI']
    },

    /* ---------- 7 / 45 ---------- */
    {
      id: 'iac-tf-output',
      name: 'terraform output',
      alias: ['tf output', '读取输出值'],
      level: 2,
      syntax: 'terraform output [选项] [名字]',
      summary: '读取状态里保存的输出值，部署脚本常用来取公网 IP 和连接串。',
      desc: '输出的是配置里 `output` 块的值，直接从 state 读，不会调用云 API。`-raw` 只对字符串类型的输出有效，直接打印内容、不带引号和 JSON 包装，方便 `$(...)` 取值；`-json` 打印完整结构（含 `type`、`sensitive`、`value`）。不带名字列出全部输出，带名字只输出那一个。',
      params: [
        { flag: '-raw <名字>', desc: '只输出字符串值，脚本取值用这个，list/map 类型会报错' },
        { flag: '-json', desc: 'JSON 格式输出，含 type 与 sensitive 字段，配 jq 解析' },
        { flag: '-state=path', desc: '从指定 state 文件读，而不是当前 backend' },
        { flag: '-no-color', desc: '去掉颜色，重定向到文件时用' }
      ],
      examples: [
        { cmd: 'terraform output', desc: '列出全部输出值，apply 完之后看一眼' },
        { cmd: 'terraform output -json', desc: '结构化输出，CI 里用 jq 取值' },
        { cmd: 'terraform output -raw ecs_public_ip', desc: '只取公网 IP 字符串，直接喂给别的命令' },
        { cmd: 'ssh -i ~/.ssh/id_rsa root@$(terraform output -raw ecs_public_ip)', desc: '拿刚创建出来的 ECS 公网 IP 直接登录' }
      ],
      notes: [
        '`-raw` 遇到 list/map 类型会报错，取列表用 `terraform output -json 名字 | jq -r ".value[]"`',
        '被标成 `sensitive = true` 的输出在列表里显示为敏感值占位，但 `-json` 里的 value 仍是明文——state 里本来就是明文，别把输出贴进工单',
        '输出值来自上一次 apply 写入 state 的结果，别人在控制台把 EIP 换绑了这里不会变，需要先 `terraform refresh`'
      ],
      related: ['iac-tf-output-block', 'iac-tf-apply', 'iac-tf-refresh', 'iac-tf-state-list', 'ln-ssh'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/output',
      tags: ['输出', '取值', '脚本']
    },

    /* ---------- 8 / 45 ---------- */
    {
      id: 'iac-tf-refresh',
      name: 'terraform refresh',
      alias: ['tf refresh', '状态同步'],
      level: 2,
      syntax: 'terraform refresh [选项]',
      summary: '把云上真实状态读回来更新 state，用来消除手工改配置造成的假差异。',
      desc: '它只更新 state，不生成计划、不改配置、不动资源。典型场景：有人在控制台手工改了带宽、加了安全组规则、或者把 EIP 解绑了，之后每次 plan 都报差异，先 refresh 一次再看才准确。Terraform 0.15.4 起官方更推荐 `terraform apply -refresh-only`：同样只刷新，但会先把刷新计划摆出来让你确认，避免在没看清的情况下直接覆盖 state。',
      params: [
        { flag: '-target=ADDRESS', desc: '只刷新指定资源，云 API 慢或被限流时缩小范围' },
        { flag: '-var-file=prod.tfvars', desc: '指定变量文件，保持与 apply 一致' },
        { flag: '-state=path', desc: '刷新的目标 state 文件' },
        { flag: '-lock=false', desc: '不锁 state，只在明确无并发时用' }
      ],
      examples: [
        { cmd: 'terraform refresh', desc: '手工改过云端资源后，先把真实状态同步回来' },
        { cmd: 'terraform apply -refresh-only', desc: '推荐写法：先看刷新计划，确认后再写 state' },
        { cmd: 'terraform refresh -target=huaweicloud_compute_instance.web', desc: '只刷新一台 ECS，缩小影响面' }
      ],
      notes: [
        'refresh 会把云上的真实属性**写进 state**，包括别人手工改的规格；如果那是不该有的改动，刷新等于承认它，之后 plan 就不再提示差异',
        '刷新会逐个资源调 Read 接口，资源多时慢且可能触发云 API 限流，降低并发用 `-parallelism=5`',
        '刷新只记录漂移、不修复漂移：想让配置重新生效还得 `apply`',
        '有远端 backend 时 refresh 会加锁并写远端 state，不要在有人正在 apply 的时候执行'
      ],
      related: ['iac-tf-plan', 'iac-tf-apply', 'iac-tf-state-list', 'iac-tf-import'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/refresh',
      tags: ['状态同步', '漂移', '排障']
    },

    /* ================= B. Terraform 状态管理 ================= */

    /* ---------- 9 / 45 ---------- */
    {
      id: 'iac-tf-state-list',
      name: 'terraform state list / show',
      alias: ['tf state', '查看 state'],
      level: 2,
      syntax: 'terraform state list [选项] [地址前缀]   |   terraform state show [选项] <资源地址>',
      summary: '列出状态里登记的资源地址，或查看某个资源在云端被记录下来的全部属性。',
      desc: '`list` 输出的是资源地址，形如 `huaweicloud_compute_instance.web`、`module.vpc.huaweicloud_vpc.main`；配 `-id` 可以用云资源 ID 反查地址。`show` 打印单个资源的完整属性（JSON 结构），是「照着真实规格回写配置」最快的方式——镜像 ID、磁盘类型、网段、安全组都对得上。排查「destroy 没删干净」「计划里说要删一个我不认识的资源」，都从 `list` 开始。',
      params: [
        { flag: 'list <地址前缀>', desc: '只看某个模块或某类资源的地址，如 terraform state list module.vpc' },
        { flag: '-id=<云资源ID>', desc: 'state list 专用，用华为云上的资源 ID 反查它在 state 里的地址' },
        { flag: 'show <地址>', desc: '打印该资源的全部属性' },
        { flag: '-state=path', desc: '读指定 state 文件，而不是当前 backend' },
        { flag: '-no-color', desc: '去掉颜色，方便重定向到文件比对' }
      ],
      examples: [
        { cmd: 'terraform state list', desc: '列出当前 state 管理的全部资源地址' },
        { cmd: 'terraform state list module.vpc', desc: '只看 vpc 模块下的资源' },
        { cmd: 'terraform state show huaweicloud_compute_instance.web', desc: '看这台 ECS 在 state 里的真实属性，回写配置时照抄' },
        { cmd: 'terraform state list -id=b11b407c-e604-4e8d-8bc4-92398320b847', desc: '用 ECS 实例 ID 反查它对应的资源地址' }
      ],
      notes: [
        '这两个子命令是只读的，但读到的是 state 内容：`show` 的输出里密码、密钥等敏感字段是明文，别把结果贴到工单或聊天窗口',
        '`show` 打印的属性名与 HCL 参数名不完全一致（嵌套块在 state 里常被摊平），照抄之后一定要 `terraform plan` 验证差异',
        '地址里带 `[0]`、`["key"]` 的是用 count/for_each 创建的资源，通配删除前先确认索引对应的是哪台机器',
        '排查「资源在云上但 destroy 不删它」时，先 `terraform state list | grep 关键字`；列表里没有，说明它不在 state 里，需要 `terraform import` 接管'
      ],
      related: ['iac-tf-state-mv', 'iac-tf-state-rm', 'iac-tf-import', 'iac-tf-backend', 'iac-tf-plan'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/state/list',
      tags: ['状态', '资源清单', '排障']
    },

    /* ---------- 10 / 45 ---------- */
    {
      id: 'iac-tf-state-mv',
      name: 'terraform state mv',
      alias: ['tf state mv', '重命名资源地址'],
      level: 3,
      syntax: 'terraform state mv [选项] <源地址> <目标地址>',
      summary: '在状态内部给资源换地址或搬到另一个状态文件，不用重建云上资源。',
      desc: '典型用途有三类：把根模块里的资源挪进 `module.vpc`；把 `count` 改成 `for_each` 时同步改地址（`web[0]` 变成 `web["web-01"]`）；把资源从一个 state 拆到另一个 state。搬迁只改 state 里的地址记录，云上资源纹丝不动，所以是「重构配置不重建资源」的核心手段。跨文件搬迁用 `-state` 指定源、`-state-out` 指定目标。',
      params: [
        { flag: '-state=path', desc: '源 state 文件（默认当前 backend）' },
        { flag: '-state-out=path', desc: '目标 state 文件，跨配置搬迁时用' },
        { flag: '-backup=path', desc: '改写前备份源 state，默认写到同目录的 .backup 文件' },
        { flag: '-lock=false', desc: '不加锁，只在确认没有并发操作时用' },
        { flag: '-ignore-remote-version', desc: '远端 state 由更新版本 Terraform 写过时，跳过版本一致性检查' }
      ],
      examples: [
        { cmd: 'terraform state mv huaweicloud_compute_instance.web module.ecs.huaweicloud_compute_instance.web', desc: '把资源挪进模块，配合新建的 module 块使用，不会重建机器' },
        { cmd: 'terraform state mv \'huaweicloud_compute_instance.web[0]\' \'huaweicloud_compute_instance.web["web-01"]\'', desc: 'count 改 for_each 时必须逐个改地址，否则计划里是删两台建两台' },
        { cmd: 'terraform state mv -state=old/terraform.tfstate -state-out=new/terraform.tfstate huaweicloud_vpc.main huaweicloud_vpc.main', desc: '把 VPC 从一个 state 拆到另一个 state' },
        { cmd: 'terraform plan', desc: '搬完必须确认计划是 No changes，出现重建说明地址或配置块对不上' }
      ],
      notes: [
        '操作前先备份：`terraform state pull > state-$(date +%F-%H%M).tfstate`，搬错了还能用 `state push` 回滚',
        '`count` 与 `for_each` 之间的地址迁移必须**逐个资源**执行，漏一个就会在计划里看到「销毁旧的 + 新建新的」，生产上等于一次事故',
        '搬迁前先把目标配置块写好（模块路径、资源名要与目标地址一致），否则 `plan` 会报 `Resource ... not found in configuration`',
        '远端 backend 下 mv 会写 state，必须在没有并发 apply 时执行；报锁错误先看是不是有人在跑'
      ],
      related: ['iac-tf-state-list', 'iac-tf-state-rm', 'iac-tf-count-foreach', 'iac-tf-import', 'iac-tf-backend'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/state/mv',
      tags: ['重构', '地址', 'state']
    },

    /* ---------- 11 / 45 ---------- */
    {
      id: 'iac-tf-state-rm',
      name: 'terraform state rm',
      alias: ['tf state rm', '移出状态'],
      level: 3,
      syntax: 'terraform state rm [选项] <资源地址>',
      summary: '把资源从状态里摘出去但不动云上资源，用于拆分模块或放弃管理某些资源。',
      desc: '摘掉之后 Terraform 就「不认识」这个资源了：云上东西还在，但之后 `plan`/`destroy` 都不会再碰它，它变成没人管的孤儿资源。最常见的用法是配合 `import` 做搬迁（旧目录 `rm`、新目录 `import`），以及让 `destroy` 跳过某些必须保留的资源。支持地址前缀，可以一次摘掉整个模块或一类资源。',
      params: [
        { flag: '-backup=path', desc: '改写前备份 state 文件，默认会写 .backup' },
        { flag: '-state=path', desc: '操作指定的 state 文件' },
        { flag: '-lock=false', desc: '不加锁，仅限确认无并发时使用' },
        { flag: '-lock-timeout=5m', desc: '等待 state 锁的时长' },
        { flag: '-ignore-remote-version', desc: '跳过远端 state 的版本一致性检查' }
      ],
      examples: [
        { cmd: 'terraform state pull > state-$(date +%F-%H%M).tfstate', desc: '动手之前先把 state 备份到本地，出事能回滚' },
        { cmd: 'terraform state rm huaweicloud_compute_instance.web', desc: '让 Terraform 不再管理这台 ECS，机器不会被删除' },
        { cmd: 'terraform state rm \'huaweicloud_compute_instance.web[0]\'', desc: '只摘掉 count 创建的第一个实例' },
        { cmd: 'terraform state rm module.legacy', desc: '整个模块一起摘掉，搬迁时常用' }
      ],
      notes: [
        '**`state rm` 不删云上资源，但会让 Terraform 彻底忘掉它**：从此它不受管理、destroy 也不会删它。想删资源用 `terraform destroy -target`，想放弃管理才用 `state rm`',
        '**执行前必须备份**：至少 `terraform state pull` 存一份；远端 backend 场景下不要指望本地 `.backup` 文件能救你',
        '摘掉带 `count`/`for_each` 中的某一个后，剩下的索引**不会自动重排**，会出现 `[0]`、`[2]` 这种空洞，要么用 `state mv` 重排，要么改用键稳定的 `for_each`',
        '`rm` 之后如果配置块还留着，下一次 `apply` 会尝试**重新创建**同名资源，华为云上常见 `already exists` 一类冲突报错，先想清楚要不要保留配置块',
        '做「旧目录 → 新目录」搬迁时，正确顺序是：新目录 `import` 成功后，旧目录再 `rm`，中间留一份 state 备份'
      ],
      related: ['iac-tf-state-list', 'iac-tf-state-mv', 'iac-tf-import', 'iac-tf-destroy', 'iac-tf-backend'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/state/rm',
      tags: ['状态', '危险', '解绑']
    },

    /* ---------- 12 / 45 ---------- */
    {
      id: 'iac-tf-import',
      name: 'terraform import',
      alias: ['tf import', '接管已有资源', '纳管存量资源'],
      level: 3,
      syntax: 'terraform import [选项] <资源地址> <云资源ID>',
      summary: '把控制台上手工创建的存量资源纳管进状态，从此由代码统一管理。',
      desc: '这是存量业务上云的必经一步：先在 `.tf` 里写好空的资源骨架，再用 `import` 把云上已有资源的 ID 绑到这个地址上。**它只写 state、不生成配置**，所以导入完必须自己把 `resource` 块补全，否则下一次 `apply` 会把「state 里有、配置里没有」的资源判成待销毁。导入后先 `terraform state show <地址>` 看真实属性并回写配置，再 `terraform plan` 反复调到 `No changes` 为止，才算真正接管成功。华为云不同资源的 ID 形式不同：ECS、EVS、EIP、VPC、子网、安全组都是 UUID，OBS 桶直接用桶名。',
      params: [
        { flag: '-var-file=prod.tfvars', desc: '导入时用的变量文件，必须与后续 apply 一致' },
        { flag: '-state=path', desc: '导入到指定的 state 文件（默认当前 backend）' },
        { flag: '-state-out=path', desc: '把导入结果写到另一个 state 文件' },
        { flag: '-input=false', desc: '禁止交互提问，CI 里必须加，缺变量直接报错而不是卡住' },
        { flag: '-lock-timeout=5m', desc: '等待 state 锁，导入会写 state，并发时容易撞锁' },
        { flag: '-ignore-remote-version', desc: '跳过远端 state 的版本检查' }
      ],
      examples: [
        { cmd: 'terraform import huaweicloud_compute_instance.web b11b407c-e604-4e8d-8bc4-92398320b847', desc: '接管一台已有的华为云 ECS（用实例 ID），先在 .tf 里写同名 resource 块' },
        { cmd: 'terraform import huaweicloud_obs_bucket.logs logs-prod-cn-north-4', desc: '接管一个已有的 OBS 桶，桶资源用桶名作为导入 ID' },
        { cmd: 'terraform import huaweicloud_vpc.main 0f8f7c1a-1a3b-4c6e-9a4a-1c1f0f0ff1a1', desc: '接管已有的 VPC（用 VPC 的 UUID）' },
        { cmd: 'terraform state show huaweicloud_compute_instance.web', desc: '导入后读出真实属性，照着回写 resource 块' },
        { cmd: 'terraform plan', desc: '目标是把差异磨到 No changes；若显示要销毁，说明配置块缺失或参数不一致' }
      ],
      notes: [
        '**`import` 不会生成配置**：它只把资源登记进 state。导完必须手工补 `resource` 块，否则下一次 `apply` 就会把它删掉——这是 import 最常见的翻车方式',
        '导入后 `terraform plan` 必须做到 `No changes`。常见的残留差异：安全组 ID 写法、`system_disk_type` 默认值与实际不符、`network` 块没写；无法回读的属性（如 `admin_pass`、`user_data`）用 `lifecycle { ignore_changes = [...] }` 忽略',
        '导入是**写 state** 的操作，会加锁；CI 并发执行时报锁错误属正常，加 `-lock-timeout=5m` 等锁即可',
        '批量接管建议按「资源地址 + ID」列成清单逐条执行，一条条来，出问题好定位、好回退；每条之前先 `terraform state list | grep 地址` 确认地址没被占用',
        '接管生产资源前先确认配置块里的参数不会触发变更：先跑 `terraform plan`，看到 `-/+`（重建）就必须停下来改配置，绝不能直接 apply'
      ],
      related: ['iac-tf-state-list', 'iac-tf-state-rm', 'iac-tf-plan', 'iac-tf-backend', 'iac-tf-lifecycle', 'iac-tf-state-mv'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/import',
      tags: ['接管', '存量资源', 'state']
    },

    /* ---------- 13 / 45 ---------- */
    {
      id: 'iac-tf-taint',
      name: 'terraform taint / untaint',
      alias: ['tf taint', '强制重建'],
      level: 3,
      syntax: 'terraform taint [选项] <资源地址>   |   terraform untaint <资源地址>',
      summary: '把资源标记成已损坏，让下次执行时销毁并重建它。',
      desc: '`taint` 只改 state 里的标记，不会立刻动资源，下次 `terraform apply` 才会先删后建。Terraform 0.15.2 起官方推荐直接用 `terraform apply -replace=<地址>`：一步完成、不必分两次执行，现在写 `taint` 会有弃用提示。`untaint` 用来取消标记（比如又想保留现有机器了）。',
      params: [
        { flag: 'taint <地址>', desc: '标记资源为损坏，下次 apply 重建' },
        { flag: '-allow-missing', desc: '地址不存在时不报错，脚本里用' },
        { flag: 'untaint <地址>', desc: '取消损坏标记，恢复成正常资源' },
        { flag: 'apply -replace=<地址>', desc: '推荐的新写法：直接在一次 apply 里完成销毁重建' }
      ],
      examples: [
        { cmd: 'terraform taint huaweicloud_compute_instance.web', desc: '标记这台 ECS，下次 apply 时重建（旧写法）' },
        { cmd: 'terraform apply -replace=huaweicloud_compute_instance.web', desc: '推荐写法，一次 apply 完成重建' },
        { cmd: 'terraform untaint huaweicloud_compute_instance.web', desc: '取消标记，保留现有机器' },
        { cmd: 'terraform plan -replace=huaweicloud_compute_instance.web', desc: '重建前先看计划，确认删除与新建的资源清单' }
      ],
      notes: [
        '重建意味着**服务中断**：ECS 重建后系统盘重新安装、实例 ID 变化，绑定的 EIP 需要重新关联，数据盘按 `delete_disks_on_termination` 决定去留',
        '重建前先把流量摘走：负载均衡下线、Keepalived 降优先级、或从 Nginx `upstream` 里注释掉这台机器',
        '`-replace` 可以写多个资源地址，也可以指定模块内的地址；`-target` 与 `-replace` 能同时用，但要清楚自己只处理了子图',
        '如果资源配了 `create_before_destroy`，重建会先建新的再删旧的；云上同名资源（如 OBS 桶名全局唯一）不允许并存时，这个生命周期参数会让重建失败'
      ],
      related: ['iac-tf-apply', 'iac-tf-lifecycle', 'iac-tf-state-list', 'iac-tf-destroy'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/taint',
      tags: ['重建', '标记', '故障恢复']
    },

    /* ---------- 14 / 45 ---------- */
    {
      id: 'iac-tf-workspace',
      name: 'terraform workspace',
      alias: ['tf workspace', '多环境隔离'],
      level: 2,
      syntax: 'terraform workspace <list|new|select|show|delete> [名字]',
      summary: '用同一份配置管理多套环境，每个环境持有互相独立的状态文件。',
      desc: '每个 workspace 有独立的 state，默认那个叫 `default`。远端 backend 下 state 会按 `workspace_key_prefix/工作区名/state 文件` 分开放，所以 default 实际落在 `env:/default/...`。配置里用 `terraform.workspace` 引用当前环境名，做命名后缀或规格区分。**它只隔离 state，不隔离权限与凭据**：`select` 到 prod 再 `apply`，一样会打到生产账号。团队里更稳的做法是「一个环境一个目录 + 不同 backend key」，比 workspace 更难误操作。',
      params: [
        { flag: 'list', desc: '列出全部工作区，当前那个前面带星号' },
        { flag: 'new <名字>', desc: '新建工作区并切换过去，如 new prod' },
        { flag: 'select <名字>', desc: '切换工作区，切换后所有命令都作用于该工作区的 state' },
        { flag: 'show', desc: '只打印当前工作区名字，脚本里判断环境用' },
        { flag: 'delete <名字>', desc: '删除工作区，不能删当前所在的那个' }
      ],
      examples: [
        { cmd: 'terraform workspace list', desc: '看有哪些环境，确认自己当前在哪个工作区' },
        { cmd: 'terraform workspace new dev', desc: '新建并切到 dev 工作区' },
        { cmd: 'terraform workspace select prod', desc: '切到 prod，之后 apply 就是在改生产' },
        { cmd: 'terraform workspace show', desc: '脚本里取当前环境名，配合命名后缀使用' }
      ],
      notes: [
        '`delete` 删的是 state 记录，**云上资源不会消失**，会直接变成无人管理的孤儿资源；删工作区前先确认里面的资源是不是真的不要了',
        '不能删除当前所在的工作区（会报 cannot delete the active workspace），先 `select default` 再删',
        'workspace 不是权限隔离：切到 prod 之后一条命令就能改生产，CI 里必须给 prod 单独加人工审批或独立凭据',
        '`terraform.workspace` 只在配置求值阶段可用，想让它出现在 `terraform output` 里必须显式写到 output 块',
        '同一个目录里混用 workspace 与手工改的 tfvars，很容易出现「环境 A 的变量用到环境 B」，命名前缀统一带环境名能减少这类事故'
      ],
      related: ['iac-tf-backend', 'iac-tf-init', 'iac-tf-state-list', 'iac-tf-apply'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/workspace',
      tags: ['多环境', '工作区', '隔离']
    },

    /* ---------- 15 / 45 ---------- */
    {
      id: 'iac-tf-backend',
      name: 'backend "s3"（华为云 OBS 远端状态）',
      kind: 'recipe',
      alias: ['terraform backend', '远端 state', 'OBS 存 state'],
      level: 3,
      syntax: 'terraform { backend "s3" { bucket = "<桶名>"  key = "<对象路径>"  region = "<区域>" } }',
      summary: '把状态文件放到华为云 OBS 上，实现团队共享、机器换一台也不丢状态。',
      desc: 'Terraform 当前的 backend 类型只有 local、remote、s3、gcs、azurerm、oss、cos、consul、http、pg、kubernetes、oci —— **没有 `backend "obs"`**，网上老教程里那个写法早已被移除。华为云 OBS 兼容 S3 协议，所以用 `backend "s3"` 接 OBS 端点。OBS 没有 IAM、STS、DynamoDB 与实例元数据服务，必须把 `skip_credentials_validation`、`skip_region_validation`、`skip_metadata_api_check`、`skip_requesting_account_id` 打开；OBS 走 path-style 寻址，要设 `use_path_style = true`（老版本写 `force_path_style`）；部分兼容实现对 S3 新校验和支持不全，上传报校验和相关错误时打开 `skip_s3_checksum`。backend 块**不支持变量**，桶名与 key 只能写死或用 `-backend-config` 运行时传，AK/SK 一律走环境变量。',
      params: [
        { flag: 'bucket / key', desc: '必填：桶名与 state 对象路径，如 bucket = "tfstate-prod-cn-north-4"、key = "ecs/terraform.tfstate"' },
        { flag: 'region', desc: 'OBS 所在区域，如 cn-north-4；区域名不在官方列表里时要 skip_region_validation = true' },
        { flag: 'endpoints { s3 = "..." }', desc: '指定 S3 兼容端点，如 https://obs.cn-north-4.myhuaweicloud.com；旧的 endpoint 单独参数已废弃' },
        { flag: 'use_path_style = true', desc: '按「端点/桶名」寻址，OBS 必须开，否则会解析成桶名.端点 形式而失败' },
        { flag: 'skip_credentials_validation / skip_region_validation / skip_metadata_api_check / skip_requesting_account_id', desc: 'OBS 没有 IAM/STS/元数据服务，四项全部设 true' },
        { flag: 'workspace_key_prefix', desc: '多工作区时 state 的目录前缀，默认 env:，所以 default 实际在 env:/default/ 下' }
      ],
      examples: [
        { cmd: 'terraform {\n  backend "s3" {\n    bucket = "tfstate-prod-cn-north-4"\n    key    = "ecs/terraform.tfstate"\n    region = "cn-north-4"\n\n    endpoints {\n      s3 = "https://obs.cn-north-4.myhuaweicloud.com"\n    }\n\n    use_path_style              = true\n    skip_credentials_validation = true\n    skip_region_validation      = true\n    skip_metadata_api_check     = true\n    skip_requesting_account_id  = true\n  }\n}', desc: '放在 versions.tf 里的 backend 配置，改完执行 terraform init -migrate-state' },
        { cmd: 'export AWS_ACCESS_KEY_ID=$HWC_ACCESS_KEY && export AWS_SECRET_ACCESS_KEY=$HWC_SECRET_KEY && terraform init', desc: 'S3 后端读的是 AWS 风格环境变量，值填华为云账号的 AK/SK' },
        { cmd: 'terraform init -migrate-state', desc: '把本地 state 迁到 OBS，或从一个桶换到另一个桶' },
        { cmd: 'terraform state pull > state-backup-$(date +%F).tfstate', desc: '定期把远端 state 备份到本地或另一处存储，误删时可回滚' }
      ],
      notes: [
        '不要写 `backend "obs"`：该类型已从 Terraform 移除，照抄老教程会直接报不支持的后端类型；华为云统一用 `backend "s3"` + OBS 端点',
        'state 里含明文密码与密钥（`admin_pass`、`secret_key`、连接串），OBS 桶必须**私有**、开服务端加密（SSE-KMS）、开多版本（误删可回滚），并禁止匿名读',
        'AK/SK 不要写进 backend 块：用环境变量 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`（S3 后端）与 `HW_ACCESS_KEY`/`HW_SECRET_KEY`（华为云 provider）分别注入，CI 里用凭据管理服务下发',
        '多人协作的锁问题：`dynamodb_table` 在华为云没有对应服务且已废弃，`use_lockfile` 依赖对象存储支持条件写；不确定时把 apply 收敛到 CI 单点串行执行，并且每次前先备份 state',
        '`terraform state push` 会用本地文件**整体覆盖**远端 state，是核弹级操作：只在远端 state 已损坏、本地有可信备份、且确认没有任何人在跑 apply 时才用'
      ],
      related: ['iac-tf-init', 'iac-tf-state-list', 'iac-tf-import', 'iac-tf-force-unlock', 'iac-tf-workspace'],
      docs: 'https://developer.hashicorp.com/terraform/language/backend/s3',
      tags: ['远端状态', 'OBS', '后端']
    },

    /* ================= C. Terraform 调试与进阶 ================= */

    /* ---------- 16 / 45 ---------- */
    {
      id: 'iac-tf-console',
      name: 'terraform console',
      alias: ['tf console', '表达式调试'],
      level: 3,
      syntax: 'terraform console [选项]',
      summary: '交互式求值 HCL 表达式，验证函数与变量取值，不用反复 plan 试错。',
      desc: '进入后可以实时算 `cidrsubnet`、`lookup`、`format`、`try`、`for` 表达式，也能读 `var.xxx`、`local.xxx` 以及 state 里资源的当前属性（如某台 ECS 的公网 IP）。写复杂表达式时，用它验证比改配置再 `plan` 快得多。输入表达式回车即求值，Ctrl+D 退出。',
      params: [
        { flag: 'local.<名字>', desc: '读取 locals 里定义的值，验证表达式时最常用' },
        { flag: 'var.<名字>', desc: '读取变量值，确认 -var/tfvars 是否生效' },
        { flag: '<资源地址>.<属性>', desc: '读取 state 里资源的属性，如 huaweicloud_compute_instance.web.public_ip' },
        { flag: '-state=path', desc: '指定 state 文件，避免影响正在用的远端状态' }
      ],
      examples: [
        { cmd: 'terraform console', desc: '进入交互模式，直接敲表达式求值' },
        { cmd: 'echo \'cidrsubnet("10.0.1.0/24", 4, 3)\' | terraform console', desc: '验证子网切分函数的结果是 10.0.1.48/28' },
        { cmd: 'echo \'huaweicloud_compute_instance.web.public_ip\' | terraform console', desc: '读当前 state 里这台 ECS 的公网 IP' },
        { cmd: 'echo \'local.common_tags\' | terraform console', desc: '确认 locals 拼出来的标签对不对' }
      ],
      notes: [
        '`console` 会读取并刷新状态，对远端 backend 来说是一次真实访问，同样会涉及 state 锁；生产目录里排障优先在副本目录或 `-state` 指向的副本上跑',
        '表达式里看到的资源属性来自 state，控制台上手工改过的东西它看不到，需要先 `terraform refresh`',
        '敏感值在 console 里是明文显示的，别把会话记录贴出去',
        '函数名拼错会直接报 `Call to unknown function`，这也是验证函数是否存在的最快方式'
      ],
      related: ['iac-tf-plan', 'iac-tf-output', 'iac-tf-locals', 'iac-tf-variable'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/console',
      tags: ['表达式', '调试', '函数']
    },

    /* ---------- 17 / 45 ---------- */
    {
      id: 'iac-tf-graph',
      name: 'terraform graph',
      alias: ['tf graph', '依赖关系图'],
      level: 3,
      syntax: 'terraform graph [选项]',
      summary: '导出资源依赖关系图，看清谁先建、谁后建、删谁会连带删谁。',
      desc: '输出 DOT 文本，喂给 Graphviz 的 `dot` 渲染成图片。默认画的是计划阶段的图；排查「apply 顺序不对」「删 A 为什么连带删 B」「配置改完报循环依赖」时最直观。节点名就是资源地址，边表示依赖方向。图太大时先按 `-type` 缩小范围，或者直接看 `-draw-cycles` 标出的环。',
      params: [
        { flag: '-type=plan', desc: '计划阶段图（默认），可选 plan-refresh-only、plan-destroy、apply' },
        { flag: '-type=plan-destroy', desc: '画销毁阶段的依赖顺序，destroy 前确认连带关系用' },
        { flag: '-draw-cycles', desc: '把依赖环高亮出来，排查循环依赖' },
        { flag: '-plan=tfplan', desc: '用存档的计划文件画图，避免重新计算' }
      ],
      examples: [
        /* terraform 是**目录敏感**的：必须先进到有 .tf 的目录，否则一律报
           `Error: No configuration files`。站内配置在 /data/iac，所以示例统一带 cd 前缀 ——
           不带的话学员照着敲只会得到那句报错，而这条示例本身并没错。 */
        { cmd: 'cd /data/iac && terraform graph > graph.dot', desc: '导出 DOT 文件，再用 Graphviz 渲染' },
        { cmd: 'cd /data/iac && terraform graph -type=plan-destroy -draw-cycles | head -20', desc: '看销毁顺序与有没有环（先只看前 20 行，整张图很大）' },
        { cmd: 'cd /data/iac && terraform graph | grep -c huaweicloud', desc: '先数一下图里有多少个华为云资源，心里有个规模' }
      ],
      notes: [
        '`dot` 没装会报命令找不到，CentOS 用 `yum install -y graphviz`，Ubuntu 用 `apt install -y graphviz`',
        '节点名里带引号和方括号，DOT 文件不要用浏览器打开，用文本编辑器或 Graphviz 客户端看',
        '资源多了图会糊成一团，先 `terraform graph | grep 关键字` 定位再渲染局部',
        '图只反映配置里的依赖关系，`depends_on` 写多了会让图变得又长又串行，能靠属性引用表达的依赖别写 `depends_on`'
      ],
      related: ['iac-tf-plan', 'iac-tf-apply', 'iac-tf-lifecycle'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/graph',
      tags: ['依赖', '可视化', '排障']
    },

    /* ---------- 18 / 45 ---------- */
    {
      id: 'iac-tf-providers-lock',
      name: 'terraform providers lock',
      alias: ['tf providers lock', '锁定 provider 版本'],
      level: 3,
      syntax: 'terraform providers lock [选项] [provider 地址...]',
      summary: '为多个平台预生成 provider 锁定信息，解决团队跨系统装不上插件的问题。',
      desc: '团队里 Windows、macOS、Linux 混用时，`.terraform.lock.hcl` 里往往只记录了本机平台的哈希，别人 `init` 就会报「没有可用包」或校验和不匹配。这条命令把各平台的哈希一次性写进 lock 文件并提交，谁拉下来都能装上。内网离线环境可以配 `-fs-mirror` 从本地镜像目录取包，或 `-net-mirror` 指向私有镜像站，再在配置里用 `provider_installation` 块固定安装来源。',
      params: [
        { flag: '-platform=os_arch', desc: '要写入哈希的平台，可重复，如 linux_amd64、linux_arm64、windows_amd64、darwin_arm64' },
        { flag: '-fs-mirror=<目录>', desc: '从本地文件系统镜像目录取 provider 包，离线环境用' },
        { flag: '-net-mirror=<URL>', desc: '从私有网络镜像站取包，内网构建用' },
        { flag: '<provider 地址>', desc: '只锁指定 provider，如 huaweicloud/huaweicloud；省略则锁配置里全部' }
      ],
      examples: [
        { cmd: 'terraform providers lock -platform=linux_amd64 -platform=windows_amd64 -platform=darwin_arm64', desc: '一次把三个常用平台的哈希写进 lock 文件' },
        { cmd: 'terraform providers lock -platform=linux_arm64 huaweicloud/huaweicloud', desc: '给鲲鹏（ARM）机器补上 provider 哈希' },
        { cmd: 'terraform providers lock -fs-mirror=/data/terraform-mirror -platform=linux_amd64', desc: '离线镜像目录里取包并生成锁定信息' }
      ],
      notes: [
        '`.terraform.lock.hcl` 必须提交 Git，不提交等于没锁版本，这条命令也就白跑了',
        '`terraform init -upgrade` 会重写 lock 文件，如果同事之前加过其他平台的哈希，升级后可能被删掉，提交前用 `git diff` 看一眼',
        '只加平台不会拖慢 init，多写几个平台只让 lock 文件变大，团队混合系统时建议一次加全',
        '换了 provider 版本（`required_providers` 里改版本约束）之后，需要重新执行一次再提交'
      ],
      related: ['iac-tf-init', 'iac-tf-validate', 'iac-tf-fmt'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/providers/lock',
      tags: ['provider', '版本锁定', '离线']
    },

    /* ---------- 19 / 45 ---------- */
    {
      id: 'iac-tf-force-unlock',
      name: 'terraform force-unlock',
      alias: ['tf force-unlock', '解锁状态'],
      level: 3,
      syntax: 'terraform force-unlock [选项] <LOCK_ID>',
      summary: '手工解除状态锁，用于上一个任务异常中断后卡住无法执行的场景。',
      desc: '报「获取状态锁失败」时会打印一段锁信息，里面有 `ID`（一串 UUID）、`Who`（执行者与主机）、`Created`（加锁时间）。确认确实没有人在跑 apply（看 CI 队列、看有没有异常退出的进程）之后，用这个 ID 解锁。它**不是**用来绕过并发保护的：锁还在被别人持有时强解，两边同时写 state 会把远端状态写坏。',
      params: [
        { flag: '<LOCK_ID>', desc: '必填，就是报错信息里 ID: 后面那串 UUID' },
        { flag: '-force', desc: '跳过输入 yes 的确认，脚本或无人值守场景用' }
      ],
      examples: [
        { cmd: 'terraform force-unlock 5f0e1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b', desc: '按报错里给出的 ID 解锁，会要求输入 yes' },
        { cmd: 'terraform force-unlock -force 5f0e1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b', desc: '无人值守场景直接解锁' },
        { cmd: 'ps -ef | grep terraform', desc: '解锁前先确认没有残留的 terraform 进程还在跑' }
      ],
      notes: [
        '**强解前必须确认原任务真的结束了**：`apply` 被 Ctrl+C 打断后进程有时还在后台跑，锁是真的被持有，强解会导致两边同时写 state',
        '锁信息里的 `Who` 会写执行者账号与主机名，出现陌生的主机名说明别人正在跑，此时唯一正确的动作是去问人，而不是解锁',
        '解锁后第一件事是 `terraform plan` 确认 state 可用；如果报 state 损坏，用最近的备份（`terraform state pull` 的产物或 OBS 桶的对象版本）恢复',
        '频繁遇到锁问题说明流程要改：CI 里给每个目录串行执行队列，并给 `terraform` 命令统一加 `-lock-timeout=5m`'
      ],
      related: ['iac-tf-backend', 'iac-tf-apply', 'iac-tf-init'],
      docs: 'https://developer.hashicorp.com/terraform/cli/commands/force-unlock',
      tags: ['状态锁', '解锁', '排障']
    },

    /* ---------- 20 / 45 ---------- */
    {
      id: 'iac-tf-log',
      name: 'TF_LOG / TF_LOG_PATH',
      alias: ['terraform 调试日志', 'TF_LOG=TRACE'],
      level: 3,
      syntax: 'TF_LOG=<级别> TF_LOG_PATH=<文件> terraform <命令>',
      summary: '打开调试日志，把 provider 与云 API 的交互细节全部打印出来定位问题。',
      desc: '`TF_LOG` 支持 `TRACE`、`DEBUG`、`INFO`、`WARN`、`ERROR`、`OFF`。`TRACE` 会打印每一次云 API 请求与响应，是排查华为云 provider 报错（参数被服务端改写、请求被拒、超时重试）最有效的手段，代价是输出极大。日志默认写 stderr，用 `TF_LOG_PATH` 落文件；只想看某一侧可以分别用 `TF_LOG_CORE`（Terraform 内核）与 `TF_LOG_PROVIDER`（provider）。PowerShell 里环境变量写法是 `$env:TF_LOG="TRACE"`。',
      params: [
        { flag: 'TF_LOG=TRACE', desc: '日志级别，排查用 TRACE 或 DEBUG，日常用 WARN 或 OFF' },
        { flag: 'TF_LOG_PATH=<文件>', desc: '把日志写到文件，只在设置了 TF_LOG 时生效' },
        { flag: 'TF_LOG_PROVIDER=DEBUG', desc: '只开 provider 侧日志，输出比全量小很多' },
        { flag: 'TF_LOG_CORE=DEBUG', desc: '只开 Terraform 内核日志，排查图与状态问题用' },
        { flag: 'TF_IN_AUTOMATION=1', desc: '声明在自动化环境运行，去掉交互提示与多余输出' },
        { flag: 'TF_INPUT=0', desc: '禁止交互输入，缺变量直接报错，CI 必备，避免任务卡死' }
      ],
      examples: [
        { cmd: 'TF_LOG=TRACE TF_LOG_PATH=/tmp/tf-trace.log terraform plan', desc: '把完整调试日志写到文件，终端只留正常输出' },
        { cmd: 'TF_LOG=DEBUG terraform apply 2>&1 | tee /tmp/tf-debug.log', desc: '日志与屏幕输出同时留一份' },
        { cmd: 'TF_LOG_PROVIDER=DEBUG terraform apply', desc: '只看 provider 与云 API 的交互，输出量小得多' },
        { cmd: 'unset TF_LOG', desc: '排查完立刻关掉，否则后续每条命令都会写巨大日志并且变慢' }
      ],
      notes: [
        '**日志里会带 AK/SK、`admin_pass`、数据库密码与 state 内容**，贴工单或群聊前必须脱敏，重点搜 `secret_key`、`password`、`access_key` 这几个关键字',
        '`TRACE` 级别下 plan 会慢好几倍、日志文件轻松上百 MB，排查完记得 `unset TF_LOG`，CI 里不要长期打开',
        '`TF_LOG_PATH` 只在同时设置了 `TF_LOG` 时才生效，只设路径不会产生日志',
        '`TF_INPUT=0` 是 CI 的保命开关：缺变量时直接失败，而不是等在那里直到流水线超时',
        'PowerShell 里用 `$env:TF_LOG="TRACE"`，会话结束即失效，别写成 `set` 那种持久化的写法'
      ],
      related: ['iac-tf-plan', 'iac-tf-apply', 'iac-tf-validate', 'iac-tf-console'],
      docs: 'https://developer.hashicorp.com/terraform/internals/debugging',
      tags: ['调试', '日志', '排障']
    },

    /* ================= D. HCL 写法速查 ================= */

    /* ---------- 21 / 45 ---------- */
    {
      id: 'iac-tf-variable',
      name: 'variable 与 tfvars',
      kind: 'recipe',
      alias: ['输入变量', 'terraform.tfvars'],
      level: 2,
      syntax: 'variable "<名字>" { type = string  default = "..."  sensitive = true }',
      summary: '声明可由外部传入的输入变量，让一份配置适配多套环境与多种规格。',
      desc: '变量的来源按优先级从低到高是：`default` → 环境变量 `TF_VAR_<名字>` → 同目录的 `terraform.tfvars` 与 `*.auto.tfvars`（自动加载） → 命令行 `-var`、`-var-file`。`variable` 块里写 `type`、`description`、`default`、`sensitive`、`validation`，把密码类变量标 `sensitive = true` 至少能挡住终端明文回显。华为云账号的 AK/SK 更推荐走 provider 自己的环境变量，不要落进 tfvars 文件。',
      params: [
        { flag: 'type', desc: '类型约束：string、number、bool、list(string)、map(string)、object({...})' },
        { flag: 'default', desc: '默认值，给了默认值就不再是必填项' },
        { flag: 'sensitive = true', desc: '标记敏感，plan/apply 输出里不再明文回显（state 里仍是明文）' },
        { flag: 'description', desc: '说明用途，写清楚别人接手时不用猜' },
        { flag: 'validation { condition = ... error_message = ... }', desc: '输入校验，如限定可用区取值，写错直接报错' }
      ],
      examples: [
        { cmd: 'variable "ecs_password" {\n  type        = string\n  description = "ECS 初始密码，长度 8 到 26 位"\n  sensitive   = true\n}\n\nvariable "az" {\n  type        = string\n  description = "ECS 所在可用区"\n  default     = "cn-north-4a"\n}', desc: '声明变量，密码类加 sensitive' },
        { cmd: '# prod.tfvars\nregion       = "cn-north-4"\naz           = "cn-north-4a"\ninstance_num = 2', desc: '环境变量文件，一台环境一个文件，文件名带环境名' },
        { cmd: 'terraform plan -var-file=prod.tfvars', desc: '用生产变量文件执行，避免误用测试环境的规格' },
        { cmd: 'export TF_VAR_ecs_password=\'Huawei@12345\'', desc: '用环境变量传密码，不落盘、不进 Git' }
      ],
      notes: [
        'tfvars 里出现密码就是明文，`*.tfvars` 加进 `.gitignore`，仓库里只放 `prod.tfvars.example` 做模板',
        '同名变量在多处定义时按优先级覆盖，`-var` 高于 tfvars 高于 `TF_VAR_*` 高于 default；CI 里悄悄传 `-var` 覆盖掉你以为生效的配置，是「改了变量没生效」的常见原因',
        '`sensitive = true` 只影响输出显示，state 里仍是明文，所以远端 state 的桶必须私有并加密',
        'tfvars 里写了配置里没声明的变量会报错（可用 `-compact-warnings` 减少噪音），删变量时要同步清理 tfvars',
        '`type = list(string)` 与 `type = list(any)` 约束强度不同，前者能在 plan 阶段拦住类型错误，能用具体类型就别用 any'
      ],
      related: ['iac-tf-locals', 'iac-tf-output-block', 'iac-tf-backend', 'iac-tf-plan', 'iac-tf-log'],
      docs: 'https://developer.hashicorp.com/terraform/language/values/variables',
      tags: ['变量', '多环境', 'tfvars']
    },

    /* ---------- 22 / 45 ---------- */
    {
      id: 'iac-tf-locals',
      name: 'locals',
      alias: ['本地值', '局部变量'],
      level: 2,
      syntax: 'locals { <名字> = <表达式> }',
      summary: '定义只在配置内部使用的中间值，避免同一段表达式到处复制粘贴。',
      desc: '`locals` 不能从外部传入，也不出现在 `terraform output` 里（除非显式引用）。适合放命名前缀、公共标签、镜像 ID 这类常量，以及用 `for` 表达式算出来的派生值。和 `variable` 的分工是：`variable` 是外部给进来的输入，`locals` 是配置内部算出来的值。引用写法是 `local.<名字>`（注意不是 `locals.<名字>`）。',
      params: [
        { flag: 'locals { ... }', desc: '声明块，可以写多个 locals 块，Terraform 会合并' },
        { flag: 'local.<名字>', desc: '引用方式，单数 local 加点加名字' },
        { flag: 'merge(a, b)', desc: '合并 map，公共标签叠环境标签时最常用' },
        { flag: 'try(表达式, 兜底值)', desc: '表达式取不到值时给兜底，避免直接报未定义' },
        { flag: '[for x in 集合 : 表达式]', desc: '推导出列表或 map，做命名列表、子网清单' }
      ],
      examples: [
        { cmd: 'locals {\n  name_prefix = "prod-ecs"\n\n  common_tags = {\n    Project     = "cloud-manual"\n    Environment = "prod"\n    ManagedBy   = "terraform"\n  }\n}', desc: '把命名前缀与公共标签收在一处，改一处全生效' },
        { cmd: 'resource "huaweicloud_vpc" "main" {\n  name = "${local.name_prefix}-vpc"\n  cidr = "192.168.0.0/16"\n\n  tags = local.common_tags\n}', desc: '资源里引用 locals，命名风格统一' },
        { cmd: 'locals {\n  subnet_cidrs = [for i in range(2) : cidrsubnet("192.168.0.0/16", 8, i)]\n}', desc: '用 for 与 cidrsubnet 自动算子网段，避免手写错' },
        { cmd: 'terraform console', desc: '验证 locals 表达式结果，改复杂表达式前先在这里试' }
      ],
      notes: [
        '改了参与 `name`、`cidr`、`availability_zone` 这类字段的 locals 值，计划里就是**销毁重建**（这些属性不支持原地修改），改名前先在测试环境看 `terraform plan` 的结果',
        '`locals` 里不要放会漂移的值（如时间戳、随机数），否则每次 plan 都显示变更，永远做不到幂等',
        '同一作用域里 `locals` 不能引用自己，会报循环依赖；需要中间值就再拆一层',
        '引用写成 `locals.xxx` 会报错，正确的是 `local.xxx`，这个拼写错误新手很常见'
      ],
      related: ['iac-tf-variable', 'iac-tf-console', 'iac-tf-output-block', 'iac-tf-count-foreach'],
      docs: 'https://developer.hashicorp.com/terraform/language/values/locals',
      tags: ['locals', '常量', '标签']
    },

    /* ---------- 23 / 45 ---------- */
    {
      id: 'iac-tf-output-block',
      name: 'output 块',
      kind: 'recipe',
      alias: ['输出变量', 'terraform output 定义'],
      level: 2,
      syntax: 'output "<名字>" { value = <表达式>  description = "..."  sensitive = true }',
      summary: '把资源属性导出成可查看、可被其他配置引用的输出值。',
      desc: '三个用途：用 `terraform output` 查看部署结果（公网 IP、连接串）；供上游配置通过 `terraform_remote_state` 数据源引用，实现「网络目录 → 应用目录」的联动；供 CI 取值继续做后续部署（取到 IP 后跑 Ansible）。名字用小写下划线，和资源命名风格保持一致。敏感值必须标 `sensitive = true`，否则 apply 结束时密码就明文打在终端和 CI 日志里。',
      params: [
        { flag: 'value', desc: '必填，输出值的表达式，通常引用资源属性' },
        { flag: 'description', desc: '说明这个值是什么、怎么用，接手的人全靠它' },
        { flag: 'sensitive = true', desc: '标记敏感，终端输出被遮住（state 里仍是明文）' },
        { flag: 'depends_on', desc: '输出依赖的资源，没有显式引用关系时补依赖' }
      ],
      examples: [
        { cmd: 'output "ecs_public_ip" {\n  value       = huaweicloud_compute_instance.web.public_ip\n  description = "ECS 弹性公网 IP，用于登录与发布"\n}\n\noutput "ecs_password" {\n  value     = var.ecs_password\n  sensitive = true\n}', desc: '导出公网 IP 与密码，密码标 sensitive' },
        { cmd: 'terraform output -raw ecs_public_ip', desc: '取到 IP 字符串，喂给 Ansible 或 ssh' },
        { cmd: 'data "terraform_remote_state" "network" {\n  backend = "s3"\n  config = {\n    bucket = "tfstate-prod-cn-north-4"\n    key    = "network/terraform.tfstate"\n    region = "cn-north-4"\n  }\n}', desc: '下游配置读取上游 state 的输出，实现目录级联动' }
      ],
      notes: [
        '`sensitive = true` 只遮住终端输出，**state 里仍是明文**，别因为在终端看不到就以为安全了',
        '改 output 的名字等于换了 key，CI 里按名字取值的脚本会直接断，改名前先全局搜一遍引用',
        '`terraform output` 读的是上一次 apply 写进 state 的值，云端手工改动不会反映，需要先 `terraform refresh`',
        '跨目录引用上游输出时，`terraform_remote_state` 的 backend 配置必须与上游完全一致（桶名、key、区域），否则会读到一个空的 state 而报找不到输出'
      ],
      related: ['iac-tf-output', 'iac-tf-variable', 'iac-tf-locals', 'iac-tf-backend'],
      docs: 'https://developer.hashicorp.com/terraform/language/values/outputs',
      tags: ['输出', '联动', 'remote_state']
    },

    /* ---------- 24 / 45 ---------- */
    {
      id: 'iac-tf-count-foreach',
      name: 'count / for_each / dynamic',
      alias: ['循环创建', 'meta-arguments'],
      level: 3,
      syntax: 'count = <数字>   |   for_each = <map|set>   |   dynamic "<嵌套块名>" { for_each = ... }',
      summary: '用循环批量创建同类资源，或用 dynamic 生成重复的嵌套配置块。',
      desc: '`count` 靠下标寻址（`web[0]`），删掉中间一个会导致后面全部重排、连带重建，地址也不稳定；`for_each` 用 map 或 set 的键做地址（`web["web-01"]`），增删某个键只影响那一个实例，是多实例与多环境的首选。`dynamic` 用来生成重复的**嵌套块**（如多个 `data_disks`、多个 `network`），写在资源内部配 `for_each` + `content`。华为云批量建 ECS 时，如果各台可用区或规格不同，用 map 把「名字 → 可用区」一起写进 `for_each`。',
      params: [
        { flag: 'count = <数字>', desc: '按数量创建，用 count.index 取下标，适合机器完全一致的场景' },
        { flag: 'for_each = <map|set>', desc: '按键创建，用 each.key、each.value 取值，删除单个不影响其他' },
        { flag: 'toset(<列表>)', desc: '把 list 转成可 for_each 的集合，list 直接传给 for_each 会报错' },
        { flag: 'dynamic "<块名>"', desc: '动态生成嵌套块，内部用 for_each + content' },
        { flag: 'content { ... }', desc: 'dynamic 里描述每一个块的内容，循环变量是块名.key/.value' }
      ],
      examples: [
        { cmd: 'resource "huaweicloud_compute_instance" "web" {\n  for_each = {\n    web-01 = "cn-north-4a"\n    web-02 = "cn-north-4b"\n  }\n\n  name              = each.key\n  availability_zone = each.value\n  image_id          = "ad091b52-742f-469e-8f3c-fd81cadf0743"\n  flavor_id         = "s6.small.1"\n  key_pair          = "my_key_pair_name"\n\n  network {\n    uuid = huaweicloud_vpc_subnet.main.id\n  }\n}', desc: '用 for_each 按名字建两台分布在不同可用区的 ECS，删一台不影响另一台' },
        { cmd: 'resource "huaweicloud_compute_instance" "web" {\n  count = 2\n\n  name              = "web-${count.index + 1}"\n  image_id          = "ad091b52-742f-469e-8f3c-fd81cadf0743"\n  flavor_id         = "s6.small.1"\n  key_pair          = "my_key_pair_name"\n  availability_zone = "cn-north-4a"\n\n  network {\n    uuid = huaweicloud_vpc_subnet.main.id\n  }\n}', desc: '机器完全一致时用 count 最简洁' },
        { cmd: 'dynamic "data_disks" {\n  for_each = toset(["10", "20"])\n\n  content {\n    type = "SAS"\n    size = data_disks.value\n  }\n}', desc: 'dynamic 生成多块数据盘，注意循环变量名是块名，不是 each' }
      ],
      notes: [
        '`count` 与 `for_each` **不能同时用**，同一个资源只能选一种；一个模块里两种混着用，维护成本会明显上升',
        '`for_each` 只接受 map 或 set，直接把 list 传进去会报参数不合适，必须先 `toset()` 或改成 map',
        '**从 `count` 迁到 `for_each` 之前先用 `terraform state mv` 逐条改地址**，否则计划里显示的是「删 2 台建 2 台」，生产上就是一次中断事故',
        '`count` 下标空洞问题：删掉 `web[0]` 后剩下的索引不会前移，出现 `[1]`、`[2]`，再用 count 新增又会撞名，长期项目优先 `for_each`',
        '`dynamic` 里引用循环变量要用块名（`data_disks.value`），写成 `each.value` 会报未定义；不需要循环的块别用 dynamic，直接写更清楚'
      ],
      related: ['iac-tf-state-mv', 'iac-tf-locals', 'iac-tf-lifecycle', 'iac-tf-plan'],
      docs: 'https://developer.hashicorp.com/terraform/language/meta-arguments/for_each',
      tags: ['循环', '批量创建', 'for_each']
    },

    /* ---------- 25 / 45 ---------- */
    {
      id: 'iac-tf-lifecycle',
      name: 'depends_on / lifecycle',
      alias: ['prevent_destroy', 'create_before_destroy', 'ignore_changes'],
      level: 3,
      syntax: 'depends_on = [<资源地址>]   |   lifecycle { <参数> = <值> }',
      summary: '补充显式依赖关系，并控制资源在创建、更新、销毁时的具体行为。',
      desc: '`depends_on` 用来表达「配置里看不出但实际存在」的依赖，比如 ECS 要等安全组规则下完、应用要等 OBS 桶策略生效。`lifecycle` 里四个高频参数：`create_before_destroy` 先建新的再删旧的以减少停机（仅当资源允许同名并存时可用）；`prevent_destroy` 拒绝销毁，给数据库、OBS 桶这类存数据的资源兜底；`ignore_changes` 忽略指定属性的漂移，适合被运维手工调过的 `tags`、以及无法回读的 `user_data`、`admin_pass`；`replace_triggered_by` 让依赖的资源一变就重建自己。',
      params: [
        { flag: 'depends_on = [<资源地址>]', desc: '显式声明依赖，会让执行顺序串行化，能靠属性引用表达就别写' },
        { flag: 'create_before_destroy = true', desc: '先创建新资源再销毁旧的，减少停机；同名资源不支持并存时不能用' },
        { flag: 'prevent_destroy = true', desc: '禁止销毁，destroy 会直接报错停下，生产数据类资源必备' },
        { flag: 'ignore_changes = [<属性>]', desc: '忽略指定属性的差异，如 tags、user_data、被自动伸缩改过的规格' },
        { flag: 'replace_triggered_by = [<资源地址>]', desc: '被引用资源发生变更时触发本资源重建' }
      ],
      examples: [
        { cmd: 'resource "huaweicloud_obs_bucket" "logs" {\n  bucket        = "logs-prod-cn-north-4"\n  acl           = "private"\n  versioning    = true\n  force_destroy = false\n\n  lifecycle {\n    prevent_destroy = true\n    ignore_changes  = [tags]\n  }\n}', desc: '日志桶禁止销毁并忽略标签漂移，防止误删归档数据' },
        { cmd: 'resource "huaweicloud_compute_instance" "web" {\n  name              = "web-prod-01"\n  image_id          = "ad091b52-742f-469e-8f3c-fd81cadf0743"\n  flavor_id         = "s6.small.1"\n  availability_zone = "cn-north-4a"\n\n  network {\n    uuid = huaweicloud_vpc_subnet.main.id\n  }\n\n  depends_on = [huaweicloud_networking_secgroup_rule.ssh]\n\n  lifecycle {\n    ignore_changes = [user_data]\n  }\n}', desc: '等安全组规则生效后再建机器，并忽略云上被改过的 user_data' },
        { cmd: 'terraform plan', desc: '改动 lifecycle 后必须先 plan，确认是 update 还是 replace' }
      ],
      notes: [
        '`ignore_changes` 是双刃剑：忽略某个属性后，控制台上被人改了它你也不会知道，只对「明确由其他系统负责」的字段使用',
        '`prevent_destroy` 会让 `terraform destroy` 直接失败并指出是哪个资源，这既是保护也是坑：临时测试环境记得别加',
        '`create_before_destroy` 在带宽、EIP、OBS 桶名这类全局唯一资源上会失败（新资源建不出来），这类资源只能用默认的先删后建',
        '`depends_on` 会让 Terraform 无法并行，写多了 apply 明显变慢；能用属性引用（如 `huaweicloud_vpc_subnet.main.id`）表达的依赖就交给 Terraform 自己推断',
        '改成 `ignore_changes` 之后，state 里保留的还是旧值，`terraform output` 拿到的也可能与云上实际不一致'
      ],
      related: ['iac-tf-destroy', 'iac-tf-taint', 'iac-tf-count-foreach', 'iac-tf-import', 'iac-tf-plan'],
      docs: 'https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle',
      tags: ['生命周期', '防误删', '依赖']
    },

    /* ================= E. Ansible 命令行 ================= */

    /* ---------- 26 / 45 ---------- */
    {
      id: 'iac-ans-adhoc',
      name: 'ansible（ad-hoc 命令）',
      kind: 'recipe',
      alias: ['ansible all -m ping', '临时命令', 'adhoc'],
      level: 1,
      syntax: 'ansible <主机模式> -m <模块> -a "<参数>" [选项]',
      summary: '不写 Playbook，一条命令对一批主机执行单个模块，巡检和临时操作最顺手。',
      desc: '最经典的用法就是 `ansible all -m ping`：它验证的是 SSH 能登录且远端 Python 可用，返回 `"ping": "pong"` 才算通，**不是** ICMP 探测，Windows 主机要用 `win_ping`。ad-hoc 适合「看一眼、改一下」的临时动作，它不做幂等汇总、也不留执行记录；稍微复杂一点的逻辑就该写成 Playbook。`-a` 后面是模块参数，按字符串传给模块，默认模块是 `command`。',
      params: [
        { flag: '-i <inventory>', desc: '主机清单文件；直接写 IP 时末尾要加逗号，如 10.0.1.31,' },
        { flag: '-m <模块>', desc: '要执行的模块，如 ping、command、yum、systemd' },
        { flag: '-a "<参数>"', desc: '模块参数，command/shell 直接写命令，其他模块写 k=v 形式' },
        { flag: '-b / --become', desc: '提权执行，装包、改系统配置必加；配 -K 交互输入提权密码' },
        { flag: '-u <远程用户>', desc: '指定 SSH 登录用户，如 -u deploy' },
        { flag: '-o', desc: '输出压成一行一台，贴工单时用' }
      ],
      examples: [
        { cmd: 'ansible all -i inventory.ini -m ping', desc: '第一步永远先验证连通性与免密' },
        { cmd: 'ansible web -i inventory.ini -m command -a "uptime" -o', desc: '对 web 组查负载，一台一行输出' },
        { cmd: 'ansible all -i inventory.ini -b -m yum -a "name=chrony state=present"', desc: '批量装时间同步服务（CentOS）' },
        { cmd: 'ansible all -i inventory.ini --list-hosts', desc: '执行前先看主机模式会命中哪些机器，避免误操作' },
        { cmd: 'ansible 10.0.1.31, -i inventory.ini -m ping -u root', desc: '临时对单台机器操作，IP 后面的逗号不能省' }
      ],
      notes: [
        '主机模式写错**不会报错**，只会提示没有匹配到主机：组名必须与 inventory 里的完全一致，拿不准先用 `--list-hosts` 确认',
        '`command` 模块不支持管道、重定向与变量展开，要这些必须换 `shell` 模块（见 iac-ans-command-shell）',
        'ad-hoc 没有 `--check` 干跑能力（Playbook 才有），改配置类操作建议先在一台上试，成功再全量',
        '批量执行前务必用 `--limit` 圈定范围；一条 `ansible all -m systemd -a "name=nginx state=restarted"` 就能把整个生产环境重启一遍',
        '输出顺序与主机清单顺序无关，是并发返回的，看某台机器的结果用 `-o` 或事后查日志'
      ],
      related: ['iac-ans-inventory', 'iac-ans-playbook', 'iac-ans-command-shell', 'iac-ans-doc', 'iac-ans-config'],
      docs: 'https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html',
      tags: ['批量执行', '巡检', 'ping']
    },

    /* ---------- 27 / 45 ---------- */
    {
      id: 'iac-ans-playbook',
      name: 'ansible-playbook',
      alias: ['执行 playbook', 'site.yml'],
      level: 2,
      syntax: 'ansible-playbook -i <inventory> <playbook.yml> [选项]',
      summary: '执行 Playbook 文件，是 Ansible 做批量配置管理与交付的正式入口。',
      desc: '标准三步走：先 `--syntax-check` 检查语法，再 `--check --diff` 干跑看会改什么，最后正式执行。`--check` 是「只判断会不会变更」，**并非所有模块都支持**：`command`/`shell` 在检查模式下默认跳过（要强制执行得配 `check_mode: false`），所以「检查通过」不等于「跑起来一定没问题」。`--diff` 会把文件级别的改动内容打出来，配合 check 最有价值。',
      params: [
        { flag: '-i <inventory>', desc: '主机清单，可用逗号分隔多个清单文件' },
        { flag: '--check / -C', desc: '干跑模式，只报告会做什么改动，不真正执行' },
        { flag: '--diff / -D', desc: '打印文件与配置的具体差异内容' },
        { flag: '-t <tag> / --tags', desc: '只执行打了指定标签的任务' },
        { flag: '-l <模式> / --limit', desc: '限定主机范围，首次上生产先限一台' },
        { flag: '-e "k=v" / --extra-vars', desc: '传额外变量，优先级最高，会覆盖 group_vars 与 play 里的 vars' },
        { flag: '--syntax-check', desc: '只检查语法，秒级完成，CI 第一步' }
      ],
      examples: [
        { cmd: 'ansible-playbook -i inventory.ini site.yml --syntax-check', desc: '提交或执行前先做语法检查' },
        { cmd: 'ansible-playbook -i inventory.ini site.yml --check --diff -l web-01', desc: '对单台机器干跑并看差异，确认无误再全量' },
        { cmd: 'ansible-playbook -i inventory.ini site.yml -t docker -e "docker_version=24.0.7"', desc: '只跑 docker 标签的任务并指定版本' },
        { cmd: '# init-ecs.yml —— 华为云 ECS 交付后初始化\n- hosts: web\n  become: yes\n  vars:\n    timezone: Asia/Shanghai\n  tasks:\n    - name: 创建运维用户\n      ansible.builtin.user:\n        name: deploy\n        groups: wheel\n        append: yes\n        shell: /bin/bash\n        state: present\n    - name: 设置时区为东八区\n      community.general.timezone:\n        name: "{{ timezone }}"\n    - name: 安装时间同步服务\n      ansible.builtin.yum:\n        name: chrony\n        state: present\n      when: ansible_os_family == "RedHat"\n    - name: 安装 Docker\n      ansible.builtin.shell:\n        cmd: curl -fsSL https://get.docker.com | sh\n        executable: /bin/bash\n        creates: /usr/bin/docker\n    - name: 启动 Docker 并设置开机自启\n      ansible.builtin.systemd:\n        name: docker\n        state: started\n        enabled: yes', desc: '一份可直接用的云主机初始化 Playbook：建用户、改时区、装 Docker' }
      ],
      notes: [
        '`--check` 遇到 `command`/`shell` 任务会显示跳过，所以检查通过不代表真跑没问题；关键步骤仍要在一台机器上真跑一次',
        '`-e` 传的变量优先级最高，会盖掉 `group_vars`、`host_vars` 和 play 里的 `vars`，CI 里常用来传版本号，也常常悄悄覆盖掉你以为生效的配置',
        '语法检查只校验 YAML 结构与模块名，查不出变量名拼错、路径不存在这类问题',
        '`-t` 只跑带该标签的任务，但被依赖的 `handlers` 是否触发要单独确认；不确定就先 `--list-tasks -t 标签` 看清单',
        '首次上生产一律 `--limit` 一台，观察一轮再放开；批量重启类任务建议加 `serial` 分批执行'
      ],
      related: ['iac-ans-adhoc', 'iac-ans-vault', 'iac-ans-inventory', 'iac-ans-roles', 'iac-ans-when-loop'],
      docs: 'https://docs.ansible.com/ansible/latest/cli/ansible-playbook.html',
      tags: ['Playbook', '批量配置', '交付']
    },

    /* ---------- 28 / 45 ---------- */
    {
      id: 'iac-ans-vault',
      name: 'ansible-vault',
      alias: ['加密变量', 'vault.yml'],
      level: 2,
      syntax: 'ansible-vault <encrypt|decrypt|edit|view|encrypt_string|rekey> [文件] [选项]',
      summary: '加密 Playbook 里的密码与密钥，让敏感配置也能安全地提交到 Git。',
      desc: '常见做法是把所有密码集中放进 `group_vars/all/vault.yml` 整体加密，普通变量文件里再用 `ansible_ssh_pass: "{{ vault_ssh_pass }}"` 引用，这样业务 Playbook 里看不到任何明文密码。密码来源三种：交互输入、`--vault-password-file` 指定的密码文件、`--vault-id` 的多密码标识（多环境各用一套密码时用）。跑 Playbook 时必须提供密码，否则会报解密失败。',
      params: [
        { flag: 'encrypt <文件>', desc: '整体加密一个文件，加密后可以直接提交 Git' },
        { flag: 'decrypt <文件>', desc: '解密成明文，会明文落盘，尽量别用' },
        { flag: 'edit <文件>', desc: '解密到临时文件用编辑器改，保存后自动重新加密，最安全的改法' },
        { flag: 'view <文件>', desc: '只查看内容不改动' },
        { flag: 'encrypt_string "<内容>"', desc: '加密一段字符串，生成可粘贴进 YAML 的加密块，配 --name 指定变量名' },
        { flag: 'rekey <文件>', desc: '更换加密密码' }
      ],
      examples: [
        { cmd: 'ansible-vault encrypt group_vars/all/vault.yml', desc: '把密码文件整体加密，之后可以放心提交' },
        { cmd: 'ansible-vault encrypt_string --vault-password-file ~/.vault_pass \'Huawei@12345\' --name \'vault_db_password\'', desc: '生成一段加密字符串，直接贴进变量文件' },
        { cmd: 'ansible-playbook -i inventory.ini site.yml --vault-password-file ~/.vault_pass', desc: '执行时提供密码文件，CI 里用凭据服务下发这个文件' },
        { cmd: 'ansible-vault edit group_vars/all/vault.yml', desc: '改密码用 edit，避免明文落盘' }
      ],
      notes: [
        '`decrypt` 会把明文写到磁盘，误提交就前功尽弃；改内容一律用 `edit`（临时文件由编辑器接管，保存后自动加密）',
        '密码文件 `~/.vault_pass` 权限要 `chmod 600`，并且**不要提交 Git**（`.gitignore` 里加上 vault_pass 相关规则）',
        '`encrypt_string` 生成的加密块缩进必须与所在 YAML 层级一致，缩进错了会直接报 YAML 解析错误',
        '加密是 AES256 对称加密，**密码丢了没有后门**；只能从 Git 历史里找回旧的加密文件，或者用旧密码解出来重加密',
        '多环境建议用 `--vault-id dev@dev_pass --vault-id prod@prod_pass` 区分密码，避免测试环境的密码能解开生产密钥'
      ],
      related: ['iac-ans-playbook', 'iac-ans-galaxy', 'iac-ans-roles', 'iac-ans-adhoc'],
      docs: 'https://docs.ansible.com/ansible/latest/cli/ansible-vault.html',
      tags: ['加密', '密码', 'vault']
    },

    /* ---------- 29 / 45 ---------- */
    {
      id: 'iac-ans-galaxy',
      name: 'ansible-galaxy',
      alias: ['安装角色', 'collection install'],
      level: 2,
      syntax: 'ansible-galaxy <role|collection> <init|install|list|remove> [名字] [选项]',
      summary: '管理角色与集合，从 Galaxy 或私有仓库下载依赖、生成标准角色骨架。',
      desc: '老写法 `ansible-galaxy install 角色名` 现在统一成 `ansible-galaxy role install`，集合用 `ansible-galaxy collection install`。批量安装依赖写 `requirements.yml`，CI 里先装依赖再跑 Playbook。`init` 生成标准角色目录骨架（`tasks`、`handlers`、`templates`、`defaults`、`vars`、`meta`），省得手搓目录。国内直连公网 Galaxy 经常超时，可在 `ansible.cfg` 里用 `[galaxy]` 的 `server_list` 指向内网镜像。',
      params: [
        { flag: 'init <角色名>', desc: '生成标准角色目录骨架，如 ansible-galaxy init roles/nginx' },
        { flag: 'role install <角色>', desc: '安装角色，等价于老的 install 写法' },
        { flag: 'collection install <集合>', desc: '安装集合，如 community.general' },
        { flag: '-r <requirements.yml>', desc: '按清单批量安装角色与集合，CI 里必备' },
        { flag: '-p <目录>', desc: '指定安装目录，如 -p roles/ 装到项目内随代码提交' },
        { flag: '-f', desc: '强制覆盖已安装的同名角色' }
      ],
      examples: [
        { cmd: 'ansible-galaxy init roles/nginx', desc: '生成一个干净的 Nginx 角色骨架' },
        { cmd: 'ansible-galaxy role install -r requirements.yml -p roles/', desc: '按清单把角色装到项目目录，跟着代码一起走' },
        { cmd: 'ansible-galaxy collection install community.general', desc: '装通用集合（timezone、ufw 等模块都在里面）' },
        { cmd: '# requirements.yml\nroles:\n  - name: geerlingguy.nginx\n    version: 3.1.4\ncollections:\n  - name: community.general\n    version: ">=6.0.0"', desc: '依赖清单，版本必须写死或给范围，别用浮动版本' }
      ],
      notes: [
        '从公网 Galaxy 装角色等于把第三方代码引进生产，装之前看清来源与版本，`requirements.yml` 里锁定版本号',
        '版本范围要写成字符串（`">=6.0.0"`），写裸数字会被 YAML 当浮点数解析而出错',
        '`-p roles/` 装到项目目录便于随代码提交与 review；默认装到 `~/.ansible/roles`，换台机器或换 CI Runner 就没了',
        '国内网络直连 Galaxy 经常超时导致 CI 失败，生产环境应配置内网镜像或用 `git+https` 方式直接从内部 Git 仓库装角色',
        '集合装了不会自动被 Playbook 使用，Playbook 里要写全限定名（如 `community.general.timezone`）'
      ],
      related: ['iac-ans-roles', 'iac-ans-playbook', 'iac-ans-doc', 'iac-ans-config'],
      docs: 'https://docs.ansible.com/ansible/latest/cli/ansible-galaxy.html',
      tags: ['角色', '集合', '依赖']
    },

    /* ---------- 30 / 45 ---------- */
    {
      id: 'iac-ans-doc',
      name: 'ansible-doc',
      alias: ['查模块文档', '模块参数'],
      level: 1,
      syntax: 'ansible-doc [选项] [模块名]',
      summary: '在命令行查模块的参数与示例，离线可用，比翻网页文档快得多。',
      desc: '不带参数会列出全部已安装模块；带模块名会打印说明、参数表、返回值与 EXAMPLES。写 Playbook 时最常用的是 `-s`：只输出可复制的 YAML 片段，缩进都排好了。不同版本参数会变（比如 `yum` 在 RHEL 9 上由 dnf 提供后端），所以以本机 `ansible-doc` 查到的为准，而不是官网 latest 文档。',
      params: [
        { flag: '-l / --list', desc: '列出全部可用模块，输出上千行，务必接 grep' },
        { flag: '-s / --snippet', desc: '只输出可直接粘贴的 YAML 片段，写 Playbook 首选' },
        { flag: '-F <关键字>', desc: '按关键字搜模块，如 -F docker' },
        { flag: '-t <类型>', desc: '查看其他类型插件：become、cache、callback、inventory 等' },
        { flag: '-M <模块路径>', desc: '加上自定义或第三方模块目录' }
      ],
      examples: [
        { cmd: 'ansible-doc -l | grep -i yum', desc: '找和 yum 相关的模块有哪些' },
        { cmd: 'ansible-doc -s copy', desc: '拿到 copy 模块排好缩进的 YAML 片段，直接贴进 tasks' },
        { cmd: 'ansible-doc yum', desc: '看完整参数表与官方示例' },
        { cmd: 'ansible-doc -t become sudo', desc: '查提权插件 sudo 的可配置项' }
      ],
      notes: [
        '`ansible-doc` 反映的是**本机安装的 ansible-core 与集合版本**，与官网文档可能不一致，现场排障以本机为准',
        '`-l` 输出极长，不接 `grep` 会刷屏；按功能搜用 `-F` 更准',
        '用 `-s` 拿到的片段默认用全限定模块名（如 `ansible.builtin.copy`），老版本 Ansible 上要改成短名才能用',
        '集合里的模块要先装（ansible-galaxy collection install）才查得到，查不到多半是没装'
      ],
      related: ['iac-ans-playbook', 'iac-ans-config', 'iac-ans-command-shell', 'iac-ans-yum-apt'],
      docs: 'https://docs.ansible.com/ansible/latest/cli/ansible-doc.html',
      tags: ['文档', '模块', '速查']
    },

    /* ---------- 31 / 45 ---------- */
    {
      id: 'iac-ans-config',
      name: 'ansible-config',
      alias: ['配置检查', 'ansible.cfg'],
      level: 2,
      syntax: 'ansible-config <list|dump|view|init> [选项]',
      summary: '查看当前生效的全部配置项与它们的来源，排查配置没生效的第一手段。',
      desc: 'Ansible 的配置来自三处：环境变量 `ANSIBLE_*`、`ansible.cfg`、内置默认值。`ansible.cfg` 的查找顺序是 `ANSIBLE_CONFIG` 指定的文件 → **当前工作目录** → `~/.ansible.cfg` → `/etc/ansible/ansible.cfg`，先找到的生效。`dump` 打印最终生效值，`list` 还会标出每一项来自哪个文件或环境变量——「我明明改了 ansible.cfg 为什么没用」这类问题，只有它能给出确定答案。',
      params: [
        { flag: 'list', desc: '列出全部配置项、当前值与来源文件' },
        { flag: 'dump', desc: '只打印生效值，适合与预期做 diff' },
        { flag: 'dump --only-changed', desc: '只显示与默认值不同的项，一眼看出被谁改过' },
        { flag: 'view', desc: '打印当前生效的 ansible.cfg 内容' },
        { flag: 'init --disabled', desc: '生成一份全部注释掉的示例配置，作为新项目起点' },
        { flag: '-c <文件>', desc: '临时指定配置文件路径' }
      ],
      examples: [
        { cmd: 'ansible-config dump --only-changed', desc: '看哪些配置被改动过，最快定位环境差异' },
        { cmd: 'ansible-config list | grep -A3 -i host_key_checking', desc: '查某个配置项的当前值来自哪里' },
        { cmd: 'ansible-config view', desc: '打印当前实际生效的 ansible.cfg' },
        { cmd: 'ansible-config init --disabled -t all > ansible.cfg', desc: '生成一份带注释的完整模板作为项目配置起点' }
      ],
      notes: [
        '**当前工作目录里的 `ansible.cfg` 优先于 `~/.ansible.cfg` 与 `/etc/ansible/ansible.cfg`**，所以「同一台机器换个目录跑行为就变了」是正常现象，先 `pwd` 再查配置',
        '`host_key_checking = False` 能免掉首次连接的指纹确认，但等于放弃主机身份校验；生产环境应改用 `ssh-keyscan` 预置 `known_hosts`',
        '环境变量 `ANSIBLE_*` 优先级高于 `ansible.cfg`，用 `sudo`/`su` 切用户后可能丢失，CI 里别只依赖它',
        '`ansible-config dump` 会把配置文件里的敏感值也打出来，贴出来前先看一眼'
      ],
      related: ['iac-ans-inventory', 'iac-ans-doc', 'iac-ans-playbook', 'iac-ans-adhoc'],
      docs: 'https://docs.ansible.com/ansible/latest/cli/ansible-config.html',
      tags: ['配置', '环境', '排障']
    },

    /* ---------- 32 / 45 ---------- */
    {
      id: 'iac-ans-inventory',
      name: 'ansible-inventory',
      alias: ['主机清单', 'inventory --graph'],
      level: 2,
      syntax: 'ansible-inventory -i <inventory> [--graph|--list|--host <主机>]',
      summary: '解析并打印主机清单的最终结果，确认分组与变量到底生效成什么样。',
      desc: 'inventory 可以写成 INI、YAML，也可以是动态清单（华为云上用清单插件按标签、按企业项目自动拉取 ECS，免去手工维护 IP 列表）。`--graph` 用树形展示分组与主机，一眼看出某台机器属于哪些组；`--list` 输出 JSON，是**变量合并后的结果**（`group_vars`、`host_vars`、加密变量解密后的值都在里面）。排查「主机没被匹配到」「变量没生效」时先看它，而不是靠猜。',
      params: [
        { flag: '-i <inventory>', desc: '清单文件，可重复指定多个，也可直接写主机列表' },
        { flag: '--graph', desc: '树形展示分组与主机归属，最直观' },
        { flag: '--list', desc: '输出 JSON，含合并后的全部变量' },
        { flag: '--host <主机>', desc: '只看某台主机的全部变量，定位变量优先级问题用' },
        { flag: '--export', desc: '只导出清单里定义的变量，不合并 facts 与缓存' },
        { flag: '--yaml', desc: '用 YAML 输出，肉眼比 JSON 好读' }
      ],
      examples: [
        { cmd: 'ansible-inventory -i inventory.ini --graph', desc: '看分组树，确认某台机器属于哪些组' },
        { cmd: 'ansible-inventory -i inventory.ini --host 10.0.1.31', desc: '看这台机器最终生效的全部变量' },
        { cmd: 'ansible-inventory -i inventory.ini --list', desc: 'JSON 输出，喂给脚本做资产盘点' },
        { cmd: 'ansible-inventory -i huaweicloud.yml --graph', desc: '华为云动态清单，按标签自动拉取 ECS 并分组' }
      ],
      notes: [
        '`--list` 打印的是变量合并后的结果，vault 解密后的密码、连接串都会出现，别直接贴到群里或工单',
        '变量优先级是 `group_vars/all` < 父组 < 子组 < `host_vars`，同名变量按这个顺序覆盖，冲突时用 `--host` 看最终值',
        '`--graph` 报无法解析多半是 INI 里组名或主机名写法不合法；主机名带 `-` 或中文都很容易出问题',
        '动态清单插件依赖云 API 凭据，凭据过期时 `--graph` 会直接报错或返回空清单，先确认凭据与区域',
        '需要临时对某台机器操作时，用 `-i "10.0.1.31," -m ping` 这种内联清单最省事（逗号不能省）'
      ],
      related: ['iac-ans-adhoc', 'iac-ans-playbook', 'iac-ans-config', 'iac-ans-vault'],
      docs: 'https://docs.ansible.com/ansible/latest/cli/ansible-inventory.html',
      tags: ['清单', '分组', '变量']
    },

    /* ================= F. Ansible 常用模块 ================= */

    /* ---------- 33 / 45 ---------- */
    {
      id: 'iac-ans-command-shell',
      name: 'command / shell 模块',
      kind: 'recipe',
      alias: ['ansible.builtin.command', 'ansible.builtin.shell', '执行命令'],
      level: 2,
      syntax: 'command: <命令与参数>   |   shell: <命令串>',
      summary: '执行远端命令：command 不走 shell 更安全，shell 支持管道但需防注入。',
      desc: '**两者最核心的区别**：`command` 不经过远端 shell，直接执行程序，所以管道 `|`、重定向 `>`、`&&`、通配符、`$HOME` 这类变量展开**统统不生效**——写 `command: echo hi > /tmp/a.txt` 的结果是把 `>` 和路径当普通参数打印出来，文件根本没建；`shell` 走 `/bin/sh -c`，上面这些全支持，代价是命令串交给远端 shell 解析，一旦拼接了外部变量就有命令注入风险，而且更难做幂等判断。选型原则：能用 `copy`/`file`/`yum`/`systemd` 这类专用模块就别用它们；必须执行命令时优先 `command`；确实需要管道才用 `shell`，并用 `creates`/`removes` 做幂等。',
      params: [
        { flag: 'cmd', desc: '要执行的命令；也可以直接用自由格式写 command: /usr/bin/java -version' },
        { flag: 'chdir', desc: '执行前切换工作目录，等价于先 cd' },
        { flag: 'creates', desc: '目标文件已存在则跳过执行，实现幂等，如 creates: /usr/bin/docker' },
        { flag: 'removes', desc: '目标文件不存在则跳过执行，与 creates 相反' },
        { flag: 'executable', desc: '仅 shell 模块支持，指定解释器；用 set -o pipefail 时必须写 /bin/bash' },
        { flag: 'stdin', desc: '把内容喂给命令的标准输入' },
        { flag: 'argv', desc: '仅 command 模块支持，把命令与参数拆成列表，避免引号解析问题' }
      ],
      examples: [
        { cmd: '- name: 用 command 执行，命令与参数分开写\n  ansible.builtin.command: /usr/bin/java -version\n  register: java_ver\n  changed_when: false', desc: 'command 写法，参数直接跟在后面，不经过 shell' },
        { cmd: '- name: 只有 shell 支持管道与变量展开\n  ansible.builtin.shell:\n    cmd: ps -ef | grep -c "[j]ava"\n    executable: /bin/bash\n  changed_when: false', desc: '统计 Java 进程数，必须用 shell 才能跑管道' },
        { cmd: '- name: 用 creates 保证幂等，文件在就跳过\n  ansible.builtin.command:\n    cmd: /usr/bin/unzip -o /tmp/app.zip -d /opt/app\n    creates: /opt/app/app.jar', desc: '解压过一次后再执行会显示 ok 而不是 changed' },
        { cmd: '- name: 华为云 ECS 初始化时装 Docker\n  ansible.builtin.shell:\n    cmd: |\n      set -euo pipefail\n      curl -fsSL https://get.docker.com | sh\n      systemctl enable --now docker\n    executable: /bin/bash\n    creates: /usr/bin/docker', desc: '多行脚本写法，配 creates 保证重复执行不出事' }
      ],
      notes: [
        '**`command` 不支持管道与重定向**：`command: echo hi > /tmp/a.txt` 不会写文件，只是把 `>` 和路径当参数传给 echo 并打印出来，这是新手最常见的坑',
        '**`shell` 存在命令注入风险**：`shell: rm -rf {{ user_input }}` 这种拼接外部变量的写法等于把远端 shell 交给别人；必须拼接时改用 `command` 的 `argv` 列表，或用 `quote` 过滤器转义',
        '`shell` 里用 `set -o pipefail` 必须同时写 `executable: /bin/bash`：默认的 `/bin/sh` 在 Debian/Ubuntu 上是 dash，不支持 pipefail，会直接报语法错误',
        '这两个模块都要靠 `creates`/`removes`/`changed_when` 保证幂等，否则每次执行都报 `changed`，`--check` 干跑的结果也失去参考价值',
        '`command` 不会展开 `~`、`$HOME` 与通配符，路径一律写绝对路径；脚本类任务建议先 `copy` 到远端再执行，便于 review 与复用'
      ],
      related: ['iac-ans-copy', 'iac-ans-file', 'iac-ans-register', 'iac-ans-when-loop', 'iac-ans-adhoc'],
      docs: 'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/shell_module.html',
      tags: ['模块', '执行命令', '幂等']
    },

    /* ---------- 34 / 45 ---------- */
    {
      id: 'iac-ans-copy',
      name: 'copy 模块',
      kind: 'recipe',
      alias: ['ansible.builtin.copy', '下发文件'],
      level: 2,
      syntax: '- ansible.builtin.copy: { src: <控制机文件>, dest: <远端路径>, mode: "0644" }',
      summary: '把控制机上的文件或一段文本原样送到远端，并设置属主与权限。',
      desc: '两种模式：`src` 把控制机上的文件或目录送到远端；`content` 直接把字符串写成远端文件，省得先造一个本地临时文件。送目录时 `src: files/conf/` 加末尾斜杠表示只复制目录**内容**，不加斜杠会把目录本身一起复制过去。`copy` 天生幂等：内容一致就不重复传输（内部比对校验和）。文件里需要按主机变量渲染时改用 `template` 模块。华为云 ECS 初始化常用来下发 `daemon.json`、`chrony.conf`、`sshd_config` 这些固定内容。',
      params: [
        { flag: 'src', desc: '控制机上的源路径；写成相对路径时基于角色或 Playbook 同级的 files/ 目录' },
        { flag: 'dest', desc: '远端绝对路径；以 / 结尾表示目标是目录' },
        { flag: 'content', desc: '直接写文件内容，与 src 互斥' },
        { flag: 'owner / group', desc: '属主与属组，需要提权（become）才能生效' },
        { flag: 'mode', desc: '权限，统一写引号包裹的 "0644" 或符号写法 u=rw,g=r,o=r' },
        { flag: 'backup', desc: '覆盖前把原文件备份成带时间戳的副本，改关键配置时打开' },
        { flag: 'validate', desc: '落盘前先用命令校验临时文件，如 visudo -cf %s、sshd -t -f %s' }
      ],
      examples: [
        { cmd: '- name: 下发 Docker 配置\n  ansible.builtin.copy:\n    src: files/daemon.json\n    dest: /etc/docker/daemon.json\n    owner: root\n    group: root\n    mode: "0644"\n    backup: yes\n  notify: restart docker', desc: '下发配置并让 handler 负责重启，是标准组合' },
        { cmd: '- name: 目录内容整体同步（src 末尾斜杠）\n  ansible.builtin.copy:\n    src: files/nginx/conf.d/\n    dest: /etc/nginx/conf.d/\n    mode: "0644"', desc: '只同步目录里的文件，不会多出一层 conf.d 目录' },
        { cmd: '- name: 用 content 直接写文件\n  ansible.builtin.copy:\n    content: "登录本机表示你已获得授权，操作将被审计。\\n"\n    dest: /etc/motd\n    mode: "0644"', desc: '一句话内容不值得单独建文件时用 content' }
      ],
      notes: [
        '`mode` 统一写引号字符串（`"0644"`）或符号写法（`u=rw,g=r,o=r`）：不同 YAML 解析器对裸数字的八进制/十进制处理不一致，写 `644` 很容易得到意料外的权限',
        '`src` 以斜杠结尾才是「复制目录内容」，漏了斜杠会多套一层目录，把文件铺到预期之外的位置',
        '`copy` 会连属主与权限一起改，对 `/etc` 下的关键文件加 `backup: yes` 更稳；改 `sshd_config`、`sudoers` 这类文件一定要加 `validate`',
        '目标文件很大或目录很深时，用 `copy` 同步整棵树会非常慢，大量文件同步应该用 `synchronize` 模块（依赖 rsync）或直接打 tar 包',
        '`backup: yes` 会在目标目录留下 `.bak` 文件，长期重复跑会越攒越多，记得定期清理'
      ],
      related: ['iac-ans-template', 'iac-ans-file', 'iac-ans-command-shell', 'iac-ans-handlers'],
      docs: 'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/copy_module.html',
      tags: ['模块', '文件传输', '配置下发']
    },

    /* ---------- 35 / 45 ---------- */
    {
      id: 'iac-ans-file',
      name: 'file 模块',
      kind: 'recipe',
      alias: ['ansible.builtin.file', '目录与权限'],
      level: 2,
      syntax: '- ansible.builtin.file: { path: <路径>, state: <directory|file|link|touch|absent> }',
      summary: '管理远端文件、目录、软链接的存在状态与权限，不负责传内容。',
      desc: '只改「元数据」：`state: directory` 建目录（父目录自动递归创建）、`state: touch` 建空文件或更新时间戳、`state: link` 建软链接（`src` 是真实目标、`path` 是链接位置，顺序与 `copy` 相反）、`state: absent` 删除（目录会递归删除）。配 `recurse: yes` 可以对整棵树批量改权限。和 `copy`/`template` 的分工很清楚：内容用后两者，建目录、改权限、建链接、删文件用 `file`。',
      params: [
        { flag: 'path', desc: '目标路径，必填；旧写法 dest 与 name 仍兼容' },
        { flag: 'state', desc: 'directory 建目录 / file 只改属性 / link 软链接 / touch 建空文件 / absent 删除' },
        { flag: 'owner / group / mode', desc: '属主、属组与权限，建应用目录时一次到位' },
        { flag: 'recurse', desc: '递归应用属性到目录下的所有内容，改权限时用' },
        { flag: 'src', desc: '仅 state=link/hard 时使用，指向真实目标路径' },
        { flag: 'force', desc: 'state=link 时覆盖已存在的同名文件或链接' }
      ],
      examples: [
        { cmd: '- name: 建好应用目录与日志目录\n  ansible.builtin.file:\n    path: "{{ item }}"\n    state: directory\n    owner: deploy\n    group: deploy\n    mode: "0755"\n  loop:\n    - /opt/app\n    - /opt/app/logs\n    - /data/backup', desc: '一次建多个目录，属主权限一起设好' },
        { cmd: '- name: 给静态目录建软链接\n  ansible.builtin.file:\n    src: /data/www/current\n    dest: /usr/share/nginx/html\n    state: link\n    force: yes', desc: '发布目录切换用软链接，回滚只需改链接指向' },
        { cmd: '- name: 删除临时目录\n  ansible.builtin.file:\n    path: /tmp/deploy-cache\n    state: absent', desc: '清理临时目录，目录会被递归删除' }
      ],
      notes: [
        '`state: link` 里 `src` 是**真实目标**、`path`/`dest` 是链接本身，语义与 `copy` 的 `src`（源文件）相反，写反了会得到一个指向不存在路径的死链接',
        '**`state: absent` 对目录是递归删除且不可恢复**：`path` 里引用了未定义变量导致传空值时后果严重，执行前先 `--check` 干跑确认',
        '`recurse: yes` 递归改权限会把目录下**所有文件**的权限一起改掉，对 `/etc`、`/var` 这类目录使用前必须在测试机验证',
        'CentOS 与 Ubuntu 的默认用户组名不同（wheel 与 sudo），建目录时 `owner`/`group` 写死的用户必须先用 `user`/`group` 模块确保存在',
        '只改权限不改内容时用 `file` 比 `copy` 快得多，`copy` 会重新比对内容'
      ],
      related: ['iac-ans-copy', 'iac-ans-user-group', 'iac-ans-template', 'iac-ans-command-shell'],
      docs: 'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/file_module.html',
      tags: ['模块', '目录', '权限']
    },

    /* ---------- 36 / 45 ---------- */
    {
      id: 'iac-ans-template',
      name: 'template 模块',
      kind: 'recipe',
      alias: ['ansible.builtin.template', 'jinja2 模板'],
      level: 3,
      syntax: '- ansible.builtin.template: { src: <模板.j2>, dest: <远端路径>, mode: "0644" }',
      summary: '用 Jinja2 模板渲染配置文件再推到远端，让同一份配置随主机与分组变化。',
      desc: '和 `copy` 的唯一区别是「渲染」：模板文件以 `.j2` 结尾放在角色的 `templates/` 目录，里面可以写 `{{ ansible_hostname }}`、`{{ groups[\'web\'] }}`、`{% for %}` 循环。渲染结果与远端文件不一致才传输并报 `changed`，所以配 `notify` 触发 handler 重启服务是最标准的组合。密码不要直接写进模板，用 vault 变量引用。`validate` 参数能在落盘前校验语法，是改 Nginx、SSH、HAProxy 这类「写错就起不来」的配置时唯一的保险。',
      params: [
        { flag: 'src', desc: '模板文件名，相对角色的 templates/ 目录，也可写绝对路径' },
        { flag: 'dest', desc: '远端目标绝对路径' },
        { flag: 'owner / group / mode', desc: '属主、属组与权限，配置文件通常 root:root 0644' },
        { flag: 'validate', desc: '落盘前用命令校验临时文件，如 nginx -t -c %s、sshd -t -f %s' },
        { flag: 'backup', desc: '覆盖前备份原文件，改核心配置时打开' },
        { flag: 'force', desc: '设为 no 时目标已存在就跳过渲染，防止覆盖人工调整过的文件' }
      ],
      examples: [
        { cmd: '# templates/nginx-upstream.conf.j2\nupstream app_backend {\n{% for host in groups[\'app\'] %}\n    server {{ host }}:8080 max_fails=3 fail_timeout=10s;\n{% endfor %}\n}', desc: '按 app 组的主机动态生成 upstream 列表，扩容不用改配置' },
        { cmd: '- name: 渲染 Nginx 主配置并在落盘前校验\n  ansible.builtin.template:\n    src: nginx.conf.j2\n    dest: /etc/nginx/nginx.conf\n    owner: root\n    group: root\n    mode: "0644"\n    validate: "nginx -t -c %s"\n    backup: yes\n  notify: reload nginx', desc: 'validate 不通过就不落盘，避免把站点配置写坏' },
        { cmd: '- name: 渲染 SSH 配置\n  ansible.builtin.template:\n    src: sshd_config.j2\n    dest: /etc/ssh/sshd_config\n    mode: "0600"\n    validate: "sshd -t -f %s"\n  notify: restart sshd', desc: '改 SSH 配置必须加 validate，否则可能把自己锁在门外' }
      ],
      notes: [
        '模板里出现 `{{` 字面量（某些 Lua、Go 模板、前端框架代码）必须用 `{% raw %}{{ ... }}{% endraw %}` 包起来，否则会被 Jinja2 当表达式处理；Nginx 的 `$host`、`$remote_addr` 是 `$` 不是 `{{`，不受影响',
        '`validate` 是防「模板写错把服务配置写坏」的关键开关，凡是有 `-t`/`-t -f` 校验命令的配置（Nginx、SSH、HAProxy、Keepalived）都应该加上',
        '渲染结果里有密码时，`--diff` 会把明文差异打到日志里，敏感任务要加 `no_log: true` 或去掉 `--diff`',
        '模板里引用未定义变量会直接失败（未定义变量错误），用 `| default(\'...\')` 给兜底值更稳',
        '改了模板忘了 `notify`，配置推上去但服务没重载，表现为「配置是新的、行为还是旧的」，排查时先比对进程启动时间与文件修改时间'
      ],
      related: ['iac-ans-copy', 'iac-ans-handlers', 'iac-ans-when-loop', 'iac-ans-file', 'iac-ans-vault'],
      docs: 'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/template_module.html',
      tags: ['模块', '模板', '配置生成']
    },

    /* ---------- 37 / 45 ---------- */
    {
      id: 'iac-ans-user-group',
      name: 'user / group 模块',
      kind: 'recipe',
      alias: ['ansible.builtin.user', 'ansible.builtin.group', '建用户'],
      level: 2,
      syntax: '- ansible.builtin.user: { name: <用户名>, groups: <附加组>, append: yes, state: present }',
      summary: '批量创建运维用户与用户组，统一 UID、家目录、登录 shell 与密码。',
      desc: '用 `group` 建组、`user` 建用户。加附加组时**必须写 `append: yes`**：不写的话 `groups` 是覆盖语义，会把用户从原有的 docker、adm 等组里踢出去。`password` 只能传**加密后的哈希**（用 `password_hash(\'sha512\')` 过滤器或 `openssl passwd -6` 生成），写明文会导致账号无法登录。公钥登录配合 `authorized_key` 模块下发。云主机初始化的典型顺序是：建 `deploy` 用户 → 加入管理组 → 下发公钥 → 关闭 root 直接登录。',
      params: [
        { flag: 'name', desc: '用户名或组名，必填' },
        { flag: 'group', desc: '用户的主组，如 group: deploy' },
        { flag: 'groups', desc: '附加组列表，配合 append: yes 使用' },
        { flag: 'append', desc: '追加而不是覆盖附加组，加 docker/wheel 组时必写' },
        { flag: 'shell / create_home', desc: '登录 shell（如 /bin/bash）与是否创建家目录' },
        { flag: 'password', desc: '加密后的密码哈希，不能写明文' },
        { flag: 'state', desc: 'present 创建 / absent 删除；删用户连家目录一起删要加 remove: yes' },
        { flag: 'system', desc: 'system: yes 建系统用户（UID 小于 1000），给服务账号用' }
      ],
      examples: [
        { cmd: '- name: 建运维组\n  ansible.builtin.group:\n    name: deploy\n    gid: 2000\n    state: present', desc: '先建组再建用户，UID/GID 固定便于跨机器统一' },
        { cmd: '- name: 建运维用户并加入管理组\n  ansible.builtin.user:\n    name: deploy\n    uid: 2000\n    group: deploy\n    groups: wheel\n    append: yes\n    shell: /bin/bash\n    create_home: yes\n    password: "{{ \'Huawei@12345\' | password_hash(\'sha512\') }}"\n    state: present', desc: '注意 append: yes，否则会把用户从其他附加组里踢出来' },
        { cmd: '- name: 下发免密登录公钥\n  ansible.posix.authorized_key:\n    user: deploy\n    key: "{{ lookup(\'file\', \'files/id_ed25519.pub\') }}"\n    state: present', desc: '把控制机的公钥装到远端用户，实现免密登录' }
      ],
      notes: [
        '**`groups` 不带 `append: yes` 就是覆盖语义**：用户原有的 docker、adm 等附加组会被清空，这是运维脚本里最隐蔽的一类事故',
        '`password` 必须是已加密的哈希（`password_hash(\'sha512\')` 或 `openssl passwd -6` 的结果），写明文密码会让账号登录不了——系统会把它当哈希去比对',
        'CentOS 的管理组是 `wheel`，Ubuntu 是 `sudo`，写死一个在另一种发行版上等于没给提权；用 `when: ansible_os_family == "RedHat"` 分支处理',
        '`state: absent` 默认**保留家目录**，要一起删必须显式写 `remove: yes`，且不可恢复',
        '`uid`/`gid` 显式指定便于多机保持一致（NFS 共享目录要靠 UID 对齐权限），不指定的话每台机器可能分到不同 ID'
      ],
      related: ['iac-ans-file', 'iac-ans-become', 'iac-ans-command-shell', 'iac-ans-copy'],
      docs: 'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/user_module.html',
      tags: ['模块', '用户', '权限']
    },

    /* ---------- 38 / 45 ---------- */
    {
      id: 'iac-ans-yum-apt',
      name: 'yum / apt 模块',
      kind: 'recipe',
      alias: ['ansible.builtin.yum', 'ansible.builtin.apt', 'ansible.builtin.package', '装包'],
      level: 2,
      syntax: '- ansible.builtin.yum: { name: <包名>, state: present }   |   - ansible.builtin.apt: { name: <包名>, state: present }',
      summary: '跨发行版安装软件包，统一处理 CentOS 与 Ubuntu 的包管理差异。',
      desc: '`yum` 面向 RHEL/CentOS/Rocky/openEuler，`apt` 面向 Debian/Ubuntu，两者参数名很像但仓库相关参数不通用（`enablerepo` 只有 yum 有，`cache_valid_time` 只有 apt 有）。`package` 通用模块会自动挑后端，代价是失去发行版特有的参数。生产写法一般是用 `when: ansible_os_family == "RedHat"` 分支，或通用包用 `package`、仓库相关操作单独写。装包前先配好内网镜像源，否则公网源又慢又容易超时。',
      params: [
        { flag: 'name', desc: '包名，可传列表；也可写 "包名-版本" 精确锁定' },
        { flag: 'state', desc: 'present 只保证装了 / latest 升到最新 / absent 卸载' },
        { flag: 'update_cache', desc: 'apt 上等于先执行 apt update，刚换源后必须打开' },
        { flag: 'cache_valid_time', desc: 'apt 专用，缓存多久内不重复更新，如 3600' },
        { flag: 'enablerepo / disablerepo', desc: 'yum 专用，临时启用或禁用某个仓库' },
        { flag: 'autoremove', desc: 'apt 专用，卸载时清理不再需要的依赖' }
      ],
      examples: [
        { cmd: '- name: CentOS 装基础排障工具\n  ansible.builtin.yum:\n    name:\n      - chrony\n      - socat\n      - tcpdump\n      - vim\n    state: present\n  when: ansible_os_family == "RedHat"', desc: '一批常用工具一次装完' },
        { cmd: '- name: Ubuntu 装基础排障工具\n  ansible.builtin.apt:\n    name:\n      - chrony\n      - socat\n      - tcpdump\n      - vim\n    state: present\n    update_cache: yes\n    cache_valid_time: 3600\n  when: ansible_os_family == "Debian"', desc: 'apt 首次装包要更新缓存，cache_valid_time 避免每次都跑' },
        { cmd: '- name: 通用写法，由 package 自动选后端\n  ansible.builtin.package:\n    name: chrony\n    state: present', desc: '只需要装包不涉及仓库时用它最省事' }
      ],
      notes: [
        '`state: latest` 每次执行都会把包装到最新，**不适合追求一致性的生产任务**，会引入未经验证的版本变化；要升级就单开带 `--limit` 的 Playbook',
        '`yum` 模块在 RHEL 9 与 openEuler 上由 dnf 提供后端，模块名仍写 yum 或改用 dnf，两者别在同一任务里混用',
        '刚换完内网源必须清缓存（CentOS 用 `yum clean all && yum makecache`，Ubuntu 用 `apt clean && apt update`），否则会继续用旧元数据、装到旧版本或直接报找不到包',
        '装包依赖网络与仓库可用性，批量执行前先在单台验证一次；国内机器建议统一配华为云内网镜像源',
        '`update_cache: yes` 每次执行都会联网取元数据，Playbook 会明显变慢，配 `cache_valid_time` 才划算'
      ],
      related: ['iac-ans-service', 'iac-ans-command-shell', 'iac-ans-when-loop', 'iac-ans-playbook'],
      docs: 'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/yum_module.html',
      tags: ['模块', '装包', '发行版差异']
    },

    /* ---------- 39 / 45 ---------- */
    {
      id: 'iac-ans-service',
      name: 'service / systemd 模块',
      kind: 'recipe',
      alias: ['ansible.builtin.systemd', 'ansible.builtin.service', '服务管理'],
      level: 2,
      syntax: '- ansible.builtin.systemd: { name: <服务名>, state: started, enabled: yes }',
      summary: '管理服务启停与开机自启，systemd 模块还能重载单元文件。',
      desc: '`service` 是通用后端（自动识别 systemd、sysvinit、upstart），`systemd` 是专用模块，多了 `daemon_reload`（改完 unit 文件必须重载，否则按旧单元启动）、`masked`（屏蔽服务防止被依赖拉起）、`scope`（system 或 user）。CentOS 7 以后与 Ubuntu 16.04 以后一律用 `systemd`。幂等要点：`state: started` 只在没运行时启动，`state: restarted` 是无条件重启——直接写在 tasks 里会每次执行都断服务，正确姿势是写 `started` 再让 `notify` 触发 handler 去 `restarted`。',
      params: [
        { flag: 'name', desc: '服务名，不含 .service 后缀，如 nginx、docker' },
        { flag: 'state', desc: 'started 启动 / stopped 停止 / restarted 重启 / reloaded 重载配置' },
        { flag: 'enabled', desc: '是否开机自启，与 state 是两件独立的事' },
        { flag: 'daemon_reload', desc: 'systemd 专用：重新读取 unit 文件，改完 service 文件必须打开' },
        { flag: 'masked', desc: 'systemd 专用：屏蔽服务，防止被其他服务依赖拉起' },
        { flag: 'scope', desc: 'user 或 system，管理用户级服务时用' }
      ],
      examples: [
        { cmd: '- name: 启动 Docker 并设置开机自启\n  ansible.builtin.systemd:\n    name: docker\n    state: started\n    enabled: yes\n    daemon_reload: yes', desc: '启动 + 自启 + 重载单元文件，一次写全' },
        { cmd: '- name: 下发自定义 unit 文件\n  ansible.builtin.copy:\n    src: files/myapp.service\n    dest: /etc/systemd/system/myapp.service\n    mode: "0644"\n  notify: reload systemd and restart myapp', desc: '改完 unit 交给 handler 去 daemon-reload 再重启' },
        { cmd: '- name: 重载 Nginx 配置（不断连接）\n  ansible.builtin.systemd:\n    name: nginx\n    state: reloaded', desc: '只重载配置，配合 notify 用在配置变更之后' }
      ],
      notes: [
        '改完 unit 文件**必须** `daemon_reload: yes`（或先跑 `systemctl daemon-reload`），否则 systemd 仍按旧单元启动，表现为「文件是新的、行为是旧的」',
        '`state: restarted` 是无条件重启：写在 tasks 里每次执行都会断服务；正确做法是 `state: started` + `notify` 让 handler 决定要不要重启',
        '`enabled: yes` 与 `state: started` 是两件独立的事：只写 state 重启后不会自启，只写 enabled 现在不会启动',
        'Ubuntu 上服务名常与 CentOS 不同（`ssh` 对 `sshd`、`mysql` 对 `mysqld`），写死服务名会让 Playbook 只在一个发行版上工作',
        '服务起来了不代表端口通：CentOS 用 firewalld、Ubuntu 用 ufw，放行规则要另行处理（见 ln-firewall-cmd）'
      ],
      related: ['iac-ans-handlers', 'iac-ans-template', 'iac-ans-yum-apt', 'iac-ans-command-shell'],
      docs: 'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/systemd_module.html',
      tags: ['模块', '服务', 'systemd']
    },

    /* ---------- 40 / 45 ---------- */
    {
      id: 'iac-ans-lineinfile',
      name: 'lineinfile 模块',
      kind: 'recipe',
      alias: ['ansible.builtin.lineinfile', '改一行配置'],
      level: 2,
      syntax: '- ansible.builtin.lineinfile: { path: <文件>, regexp: <正则>, line: <内容> }',
      summary: '按正则修改配置文件中的一行，改 sshd_config 这类文件最常用。',
      desc: '它是「按行」操作：`regexp` 匹配到就替换整行，匹配不到就按 `insertafter`/`insertbefore` 插入（默认追加到文件末尾）。适合「文件有默认配置、只想改其中一行」的场景，比如 `PermitRootLogin`、`net.ipv4.ip_forward`、`SELINUX`。要改多行或整段配置，用 `blockinfile`；要生成整份文件，用 `template`——`lineinfile` 堆太多会变成难以维护的补丁堆。`backrefs: yes` 是个关键开关：打开后正则不匹配时**什么都不做**（不会追加），与默认行为正好相反。',
      params: [
        { flag: 'path', desc: '目标文件绝对路径' },
        { flag: 'regexp', desc: '匹配要替换的行，建议写成 ^KEY 并兼容被注释的默认行，如 ^#?PasswordAuthentication' },
        { flag: 'line', desc: '替换或插入的内容；配 state: absent 时表示要删除的行' },
        { flag: 'insertafter / insertbefore', desc: '插到哪一行前后，EOF 表示文件末尾' },
        { flag: 'backrefs', desc: '用正则分组回填，且不匹配时不追加，行为与默认相反' },
        { flag: 'validate', desc: '落盘前校验，如 sshd -t -f %s、visudo -cf %s' },
        { flag: 'state', desc: 'absent 删除匹配到的行' }
      ],
      examples: [
        { cmd: '- name: 关闭 SSH 密码登录\n  ansible.builtin.lineinfile:\n    path: /etc/ssh/sshd_config\n    regexp: "^#?PasswordAuthentication"\n    line: "PasswordAuthentication no"\n    validate: "sshd -t -f %s"\n    backup: yes\n  notify: restart sshd', desc: '兼容被注释掉的默认行，并加校验防止把自己锁在门外' },
        { cmd: '- name: 开启内核转发（Keepalived、K8s 的前提）\n  ansible.builtin.lineinfile:\n    path: /etc/sysctl.conf\n    regexp: "^net.ipv4.ip_forward"\n    line: "net.ipv4.ip_forward = 1"\n  notify: reload sysctl', desc: '改一行就生效，无需重写整个 sysctl.conf' },
        { cmd: '- name: 删除某一行\n  ansible.builtin.lineinfile:\n    path: /etc/hosts\n    regexp: "^203.0.113.25"\n    state: absent', desc: '把匹配到的整行删掉，用于清理废弃记录' }
      ],
      notes: [
        '`regexp` 只写 `^KEY` 而不带 `^#?` 时，被注释掉的默认行匹配不到，任务会**再追加一行**，文件里出现两条同名配置，而生效的往往是上面那条旧配置',
        '`backrefs: yes` 与默认行为相反：正则不匹配时**不追加**、保持原样，想「有就改、没有就加」就不要打开它',
        '`validate` 是 `sshd_config`、`sudoers`、`fstab` 这类文件唯一的保险，写错正则时校验命令会拦住，文件不落盘',
        '服务名要注意发行版差异：Ubuntu 上是 `ssh`、CentOS 上是 `sshd`，`notify` 的 handler 要用变量区分，否则 Ubuntu 上会报服务不存在',
        '改内核参数文件后还需要 `sysctl -p` 才生效，只写文件不重载等于没改'
      ],
      related: ['iac-ans-template', 'iac-ans-copy', 'iac-ans-handlers', 'iac-ans-command-shell'],
      docs: 'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/lineinfile_module.html',
      tags: ['模块', '配置文件', '正则']
    },

    /* ================= G. Ansible Playbook 写法 ================= */

    /* ---------- 41 / 45 ---------- */
    {
      id: 'iac-ans-become',
      name: 'become / become_user',
      alias: ['提权', 'sudo', 'ansible_become'],
      level: 2,
      syntax: 'become: yes   |   become_user: <用户>   |   become_method: sudo',
      summary: '用 sudo 等方式切换执行身份，避免全程用 root 直接登录远端主机。',
      desc: '三个层级都能声明：命令行（`-b`、`-K`）、play 级、task 级——task 级最精细，可以只给需要的任务提权。默认 `become_method: sudo`、`become_user: root`；要以应用用户身份跑部署脚本就写 `become_user: deploy`。前提是远端 `sudoers` 已放行该用户，否则任务会卡在密码提示直到超时。变量形式 `ansible_become`/`ansible_become_user` 可以写在 inventory 或 `host_vars` 里，按主机粒度控制。',
      params: [
        { flag: 'become: yes', desc: '开启提权，等价于命令行 -b' },
        { flag: 'become_user', desc: '切换到的用户，默认 root，跑应用脚本时写 deploy' },
        { flag: 'become_method', desc: '提权方式：sudo（默认）、su、doas 等' },
        { flag: 'become_flags', desc: '传给提权命令的额外参数，如 -H -S' },
        { flag: '-K / --ask-become-pass', desc: '命令行交互输入提权密码，sudoers 没配 NOPASSWD 时必须加' },
        { flag: 'ansible_become_pass', desc: 'inventory 或 host_vars 里的提权密码，必须配 vault 加密' }
      ],
      examples: [
        { cmd: '- name: 只有这一步需要 root\n  ansible.builtin.systemd:\n    name: docker\n    state: restarted\n  become: yes\n  become_user: root', desc: 'task 级提权，其他任务仍用普通用户跑' },
        { cmd: '- name: 以应用用户身份跑部署脚本\n  ansible.builtin.command:\n    cmd: /opt/app/deploy.sh\n  become: yes\n  become_user: deploy', desc: '切到应用账号执行，避免脚本产物属主变成 root' },
        { cmd: 'ansible-playbook -i inventory.ini site.yml -b -K', desc: '全局提权并交互输入密码' },
        { cmd: '# inventory.ini\n[web]\n10.0.1.31 ansible_user=deploy ansible_become=yes ansible_become_user=root', desc: '按主机声明提权方式，Playbook 里就不用重复写' }
      ],
      notes: [
        '提权的前提是远端 `sudoers` 放行了该用户：没配 `NOPASSWD` 又没加 `-K` 时会卡住直到超时（报缺少 sudo 密码）',
        '`become` 会改变家目录环境（sudo 默认带 `-H` 后 `$HOME` 变成 `/root`），脚本里用 `~` 取路径容易指错，统一写绝对路径',
        '`become_user` 改变的是**命令的执行身份**，SSH 连接仍是 `ansible_user`，两者不要混为一谈',
        '`ansible_become_pass` 写在 inventory 里就是明文密码，必须用 ansible-vault 加密后再提交',
        'Ubuntu 默认不允许 root 直接 SSH 登录，用 `ansible_user=deploy` + `become` 才是标准做法'
      ],
      related: ['iac-ans-vault', 'iac-ans-user-group', 'iac-ans-playbook', 'iac-ans-roles'],
      docs: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_privilege_escalation.html',
      tags: ['提权', 'sudo', '安全']
    },

    /* ---------- 42 / 45 ---------- */
    {
      id: 'iac-ans-handlers',
      name: 'handlers 与 notify',
      kind: 'recipe',
      alias: ['handler', 'notify', 'flush_handlers'],
      level: 3,
      syntax: 'notify: <handler 名>   |   handlers: [ { name: <handler 名>, ... } ]',
      summary: '只在任务真的发生变更时才重启服务，避免每次执行都无条件重启。',
      desc: 'handler 是一种特殊任务：被 `notify` 触发后，默认在整个 play 的普通任务**全部跑完**才执行，且同一个 handler 被多次触发也只跑一次。执行顺序固定在 `tasks` 之后、`post_tasks` 之前；如果后面的任务要立刻用上新配置，必须显式 `ansible.builtin.meta: flush_handlers` 把它提前。handler 名与 `notify` 必须完全一致（含大小写），不一致时**不报错也不执行**，是最隐蔽的坑。多个 handler 可以共用一个 `listen` 主题被一起唤醒。',
      params: [
        { flag: 'notify', desc: '在任务里声明要触发的 handler 名，可写列表' },
        { flag: 'handlers', desc: 'play 级的 handler 定义块，写法与 tasks 一致' },
        { flag: 'listen', desc: '给 handler 挂主题，一次 notify 唤醒同主题的多个 handler' },
        { flag: 'ansible.builtin.meta: flush_handlers', desc: '立即执行已触发的 handler，用于「改配置 → 重启 → 再验证」链路' },
        { flag: '--force-handlers', desc: '即使有任务失败也执行已触发的 handler' }
      ],
      examples: [
        { cmd: '- hosts: web\n  become: yes\n  tasks:\n    - name: 下发 Nginx 配置\n      ansible.builtin.template:\n        src: nginx.conf.j2\n        dest: /etc/nginx/nginx.conf\n        validate: "nginx -t -c %s"\n      notify: reload nginx\n\n    - name: 立即触发 handler，让后面的检查跑在新配置上\n      ansible.builtin.meta: flush_handlers\n\n    - name: 健康检查\n      ansible.builtin.uri:\n        url: http://127.0.0.1/health\n        status_code: 200\n\n  handlers:\n    - name: reload nginx\n      ansible.builtin.systemd:\n        name: nginx\n        state: reloaded', desc: '标准组合：改了配置才 reload，并在验证前显式 flush' },
        { cmd: '- name: 多个任务共用一个 handler\n  ansible.builtin.copy:\n    src: "{{ item }}"\n    dest: /etc/nginx/conf.d/\n  loop:\n    - upstream.conf\n    - site.conf\n  notify: reload nginx', desc: '循环里多次触发，handler 也只在最后执行一次' }
      ],
      notes: [
        'handler 名与 `notify` 不一致时**静默跳过、不报错**：排查时用 `--list-tasks` 看 handler 有没有列出来，或改完名全局搜一遍',
        'handler 默认在 play 末尾才跑：任务中间若依赖「服务已重启」，必须 `ansible.builtin.meta: flush_handlers`，这是「配置改了但验证结果还是旧的」最常见根因',
        'handler 只在任务报 `changed` 时被触发：源文件没变就不会重启服务，这正是我们要的幂等行为，但也会让「改了模板却没触发」变成排查盲区（先确认模板内容真的变了）',
        '任务失败时后续 handler 默认不执行，需要「无论如何都要重启」的场景加 `--force-handlers`',
        '多个 handler 都需要重载同一服务时，用 `listen` 主题合并，避免同一个服务被重启两次'
      ],
      related: ['iac-ans-template', 'iac-ans-service', 'iac-ans-playbook', 'iac-ans-roles'],
      docs: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_handlers.html',
      tags: ['handler', '重启', '幂等']
    },

    /* ---------- 43 / 45 ---------- */
    {
      id: 'iac-ans-roles',
      name: 'roles 与目录结构',
      kind: 'recipe',
      alias: ['角色', 'role 目录', 'include_role'],
      level: 3,
      syntax: 'roles: [ <角色名> ]   |   - ansible.builtin.include_role: { name: <角色名> }',
      summary: '把任务、模板、变量按角色分目录组织，是 Playbook 工程化复用的基本单位。',
      desc: '标准角色骨架由 `ansible-galaxy init` 生成：`tasks/main.yml` 是任务入口，`handlers/main.yml` 放 handler，`templates/` 放 `.j2` 模板，`files/` 放静态文件，`defaults/main.yml` 放**可被外部覆盖**的默认值（优先级最低），`vars/main.yml` 放角色内部固定值（优先级很高），`meta/main.yml` 声明依赖的其他角色。变量优先级记一句就够：`defaults` < `group_vars` < `host_vars` < `vars` < 命令行 `-e`。play 里的 `roles:` 是静态引入且**永远先于 tasks 执行**；要在任务中间插角色，必须用 `include_role`。',
      params: [
        { flag: 'roles:', desc: 'play 级静态引入角色列表，先于 tasks 执行，支持 role/vars/tags 写法' },
        { flag: 'include_role', desc: '运行时动态引入，可配 when、loop、传变量，位置灵活' },
        { flag: 'import_role', desc: '解析期静态引入，能提前暴露拼写错误，不能配循环' },
        { flag: 'defaults/main.yml', desc: '低优先级默认值，想让使用者能改的参数都放这里' },
        { flag: 'vars/main.yml', desc: '高优先级常量，外部 group_vars 覆盖不了' },
        { flag: 'meta/main.yml', desc: '声明角色依赖（dependencies），依赖角色会先执行且默认只跑一次' }
      ],
      examples: [
        { cmd: '# site.yml\n- hosts: web\n  become: yes\n  roles:\n    - role: common\n    - role: nginx\n      vars:\n        nginx_worker_connections: 10240\n      tags: [nginx]\n  tasks:\n    - name: 角色跑完后再做业务部署\n      ansible.builtin.import_role:\n        name: myapp', desc: '公共角色 + 专用角色 + 业务任务的典型编排' },
        { cmd: 'ansible-galaxy init roles/nginx', desc: '生成标准角色目录骨架，tasks/handlers/templates/defaults/vars/meta 一次到位' },
        { cmd: '- name: 按条件动态引入角色\n  ansible.builtin.include_role:\n    name: docker\n  when: install_docker | default(true) | bool', desc: '需要在任务中间插角色时用 include_role' }
      ],
      notes: [
        '`defaults/main.yml` 能被 `group_vars` 与 `-e` 覆盖，`vars/main.yml` **不能**：想让别人调参就放 defaults，放错位置是「改了变量没生效」的头号原因',
        'play 的 `roles:` 段永远先于 `tasks:` 执行，即使你把它写在 tasks 后面也一样；需要穿插执行只能用 `include_role`',
        '`meta/main.yml` 的 `dependencies` 会先执行依赖角色，且多角色共同依赖同一个角色时**默认只执行一次**（不会重复跑）',
        '角色目录名必须与 `roles:` 里引用的名字一致，`meta/main.yml` 里的角色名不影响引用',
        '角色里的 `files/` 与 `templates/` 是相对路径的基准：`copy: src=daemon.json` 实际找的是 `roles/<角色>/files/daemon.json`，写在别处会找不到'
      ],
      related: ['iac-ans-galaxy', 'iac-ans-playbook', 'iac-ans-handlers', 'iac-ans-when-loop'],
      docs: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html',
      tags: ['角色', '复用', '工程化']
    },

    /* ---------- 44 / 45 ---------- */
    {
      id: 'iac-ans-when-loop',
      name: 'when 条件与 loop',
      kind: 'recipe',
      alias: ['条件判断', '循环', 'with_items'],
      level: 3,
      syntax: 'when: <裸表达式>   |   loop: [ <列表> ]',
      summary: '按条件跳过任务，或用循环把同一段配置套到多个对象上。',
      desc: '`when` 里写的是**裸表达式**，不要包 `{{ }}`。多个条件写成列表等价于 `and`，需要 `or` 就用显式表达式。循环推荐用 `loop`（`with_items` 那套是旧写法，仍可用），循环变量固定叫 `item`；`loop_control` 可以改循环变量名（`loop_var`，避免嵌套角色里与外层 `item` 冲突）、加序号（`index_var`）、精简输出（`label`）。`when` 与 `loop` 同时出现时，条件会对**每一项**分别求值。',
      params: [
        { flag: 'when', desc: '裸表达式条件，如 ansible_os_family == "RedHat"，不带 {{ }}' },
        { flag: 'loop', desc: '循环列表（推荐写法），循环变量是 item' },
        { flag: 'loop_control', desc: '控制循环行为：loop_var 改变量名、index_var 取序号、label 精简输出' },
        { flag: 'item', desc: 'loop 的当前元素，取字典用 item.key 形式' },
        { flag: 'ansible_os_family / ansible_distribution', desc: '条件里最常用的系统事实，用于区分 RedHat 与 Debian 系' },
        { flag: 'register + when', desc: '先捕获上一步结果，再用 when 引用它的 rc/stdout 做判断' }
      ],
      examples: [
        { cmd: '- name: CentOS 与 Ubuntu 走不同的包管理\n  ansible.builtin.yum:\n    name: chrony\n    state: present\n  when: ansible_os_family == "RedHat"', desc: '用 facts 区分发行版，避免写两套 Playbook' },
        { cmd: '- name: 循环建目录\n  ansible.builtin.file:\n    path: "{{ item.path }}"\n    state: directory\n    mode: "{{ item.mode }}"\n  loop:\n    - { path: /data/app, mode: "0755" }\n    - { path: /data/logs, mode: "0755" }\n  loop_control:\n    label: "{{ item.path }}"', desc: '循环处理结构不同的多项，label 让输出只显示路径' },
        { cmd: '- name: 只有变量为真时才重启\n  ansible.builtin.systemd:\n    name: docker\n    state: restarted\n  when: restart_docker | default(false) | bool', desc: '用默认值兜底，避免变量未定义直接失败' }
      ],
      notes: [
        '`when` 里**不要再包 `{{ }}`**：`when: "{{ ansible_os_family }} == RedHat"` 会被判为模板定界符用法不当并可能误判，正确写法是裸表达式',
        '循环变量在 `loop` 下固定叫 `item`：在角色里嵌套循环时外层 `item` 会被覆盖，用 `loop_control.loop_var` 改名（如 pkg）',
        '`when` 与 `loop` 同时写时条件对每一项分别判断，被跳过的项显示 skipped，`--check` 下行为一致',
        '`with_items` 会把嵌套列表拍平，`loop` 不会：从旧写法迁移时如果需要拍平要显式加 `| flatten(levels=1)`',
        '条件里引用未定义变量会直接报错而不是跳过，用 `| default(...)` 给兜底值；`| bool` 能把字符串 "yes"/"no" 之类统一成布尔判断'
      ],
      related: ['iac-ans-register', 'iac-ans-playbook', 'iac-ans-roles', 'iac-ans-yum-apt'],
      docs: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_loops.html',
      tags: ['条件', '循环', 'facts']
    },

    /* ---------- 45 / 45 ---------- */
    {
      id: 'iac-ans-register',
      name: 'register 与 failed_when / changed_when',
      kind: 'recipe',
      alias: ['捕获结果', 'failed_when', 'changed_when'],
      level: 3,
      syntax: 'register: <变量名>   |   failed_when: <表达式>   |   changed_when: <表达式>',
      summary: '捕获任务输出供后续判断，并重新定义什么算失败、什么算发生变更。',
      desc: '`register` 把模块返回值存成变量，常用字段有 `rc`（返回码）、`stdout`/`stdout_lines`、`stderr`、`changed`、`failed`。`failed_when` 覆盖「什么算失败」（比如命令返回 2 也是正常结果），`changed_when` 覆盖「什么算变更」（把只读命令标成 `changed: false`，让干跑与幂等报告干净）。两者都写裸表达式。注意 `command`/`shell` 只要返回码非 0 就算失败，所以「用 grep 判断存在性」的写法必须配 `failed_when`，否则任务永远是失败态。',
      params: [
        { flag: 'register', desc: '把任务结果存进变量，之后可用变量.字段 引用' },
        { flag: 'failed_when', desc: '自定义失败条件，如 result.rc not in [0, 2]；写 false 表示永不失败' },
        { flag: 'changed_when', desc: '自定义变更条件；只读查询类任务写 false 让幂等报告干净' },
        { flag: 'until / retries / delay', desc: '失败重试直到条件成立，等端口或服务起来时用' },
        { flag: 'ignore_errors', desc: '忽略失败继续执行，慎用，会掩盖真实错误' },
        { flag: 'no_log', desc: '不把任务输出写进日志，含密码的任务必须加' }
      ],
      examples: [
        { cmd: '- name: 检查 Docker 是否已安装\n  ansible.builtin.command:\n    cmd: /usr/bin/docker --version\n  register: docker_check\n  failed_when: false\n  changed_when: false\n\n- name: 没装才装\n  ansible.builtin.shell:\n    cmd: curl -fsSL https://get.docker.com | sh\n    executable: /bin/bash\n    creates: /usr/bin/docker\n  when: docker_check.rc != 0', desc: '先探测再决定装不装，是云主机初始化的标准套路' },
        { cmd: '- name: 等后端应用起来（最多 60 秒）\n  ansible.builtin.command:\n    cmd: curl -sf http://127.0.0.1:8080/health\n  register: health\n  until: health.rc == 0\n  retries: 20\n  delay: 3\n  changed_when: false', desc: '发版后等服务就绪，避免后续任务打在还没起来的进程上' },
        { cmd: '- name: 按返回码自定义失败判断\n  ansible.builtin.command:\n    cmd: /usr/bin/rpm -q chrony\n  register: rpm_check\n  failed_when: rpm_check.rc not in [0, 1]\n  changed_when: false', desc: 'rpm -q 未安装时返回 1，属于正常结果而不是失败' }
      ],
      notes: [
        '`command`/`shell` 只要返回码非 0 就算失败：用 grep、rpm -q、test 做存在性判断的任务几乎必然「失败」，必须配 `failed_when: false` 或限定返回码范围',
        '`failed_when` 会**覆盖模块自身的失败判断**：写成 `failed_when: false` 后哪怕命令真的出错也当成功，只在明确知道返回码含义时才这么写',
        '`changed_when: false` 是把 `--check` 跑干净的关键：只读查询类任务都该加上，否则每次都显示 changed，幂等性检查形同虚设',
        '`register` 的变量是**按主机**保存的：跨主机取值要写 `hostvars[groups[\'web\'][0]][\'health\']`，别指望在另一台机器上直接引用',
        '输出里含密码或密钥时务必加 `no_log: true`，否则会明文进日志与 `-v` 输出，连 diff 都会打出来'
      ],
      related: ['iac-ans-command-shell', 'iac-ans-when-loop', 'iac-ans-handlers', 'iac-ans-playbook'],
      docs: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_error_handling.html',
      tags: ['结果捕获', '幂等', '重试']
    }

    /* 后续命令同样追加在这里，用逗号分隔 */
  );
})();
