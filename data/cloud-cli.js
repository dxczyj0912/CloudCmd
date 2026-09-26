/* data/cloud-cli.js · 分类 13 华为云 CLI（hcloud/KooCLI、obsutil、CCE；AWS/Azure 对照） */
(function () {
  'use strict';

  var catId = 'cloud-cli';

  window.CC_DATA[catId] = window.CC_DATA[catId] || [];
  window.CC_DATA[catId].push(

    /* ================= A. KooCLI 安装、配置与自省 ================= */

    /* ---------- 1 / 71 ---------- */
    {
      id: 'hw-hcloud-config-init',
      name: 'hcloud configure init',
      alias: ['KooCLI 初始化配置', 'hcloud 首次配置', '华为云 CLI 配置 AK/SK'],
      level: 1,
      syntax: 'hcloud configure init',
      summary: '首次使用 KooCLI 的交互式配置，填 AK/SK、区域与项目，装完就能跑命令。',
      desc: 'KooCLI（命令名 `hcloud`）是华为云统一命令行工具，覆盖 ECS/OBS/VPC/ELB/RDS 等几乎全部云服务，所有服务共用一份配置。`configure init` 会依次询问 AK、SK、区域（region）、项目 ID 等，写入 `~/.hcloud/config.json`。配置项里还可以保存多套环境（profile），见 `hw-hcloud-config-list`。',
      params: [
        { flag: '--cli-profile=<配置项名称>', desc: '把这次配置存成指定名字，方便多账号/多区域隔离' },
        { flag: '--cli-region=<区域>', desc: '区域标识，如 `cn-north-4`（北京四）、`cn-east-3`（上海一）' },
        { flag: '--cli-output=json|table|tsv', desc: '默认输出格式，脚本里建议 `json`' },
        { flag: '--cli-language=zh-cn|en-us', desc: '提示语言；版本较低时可能不支持，用 `--help` 确认' }
      ],
      examples: [
        { cmd: 'curl -sSL https://hwcloudcli.obs.cn-north-1.myhuaweicloud.com/cli/latest/hcloud_install.sh -o hcloud_install.sh && bash hcloud_install.sh', desc: 'Linux 上一键安装 KooCLI（官方安装脚本），装完才有 `hcloud` 命令' },
        { cmd: 'hcloud configure init', desc: '交互式配置：按提示输入 AK、SK、区域（如 cn-north-4）与项目 ID' },
        { cmd: 'hcloud version', desc: '确认安装成功与当前版本' },
        { cmd: 'hcloud configure list', desc: '查看刚刚写入的配置是否生效' }
      ],
      notes: [
        'AK/SK 只在 `hcloud configure init` 的交互提示里输入，**不要写进脚本、不要提交到 Git**；配置文件 `~/.hcloud/config.json` 是明文的，多用户机器上注意文件权限',
        'region 与项目 ID（project_id）必须属于同一个区域：最常见的错误就是区域填 `cn-north-4` 却填了上海一的 project_id，之后每条命令都报鉴权失败或找不到资源',
        '第一次用建议直接 `configure init`，比手写一长串 `configure set` 参数少踩坑；写完用 `hcloud configure list` 核对一遍',
        '发布到 CI 的机器上不要长期保存主账号 AK/SK，改用 IAM 子用户或临时 AK（见 `hw-iam-aksk-leak`）'
      ],
      related: ['hw-hcloud-config-set', 'hw-hcloud-config-list', 'hw-hcloud-help'],
      docs: 'https://support.huaweicloud.com/hcli/index.html',
      tags: ['KooCLI', 'hcloud', '初始化配置']
    },

    /* ---------- 2 / 71 ---------- */
    {
      id: 'hw-hcloud-config-set',
      name: 'hcloud configure set',
      alias: ['KooCLI 命令行配置', 'hcloud 配置 AK/SK'],
      level: 2,
      syntax: 'hcloud configure set --cli-profile=<配置项名> --cli-access-key=<你的AK> --cli-secret-key=<你的SK> --cli-region=<区域> [--cli-output=json|table|tsv]',
      summary: '用一条命令写完配置项，适合脚本化和多套环境批量初始化。',
      desc: '比 `configure init` 少一层交互，适合写进初始化脚本或 Dockerfile 之外的引导步骤。`--cli-profile` 是这套配置的名字，不写时默认操作 `default`。区域标识必须用真实值：`cn-north-4`（北京四）、`cn-east-3`（上海一）、`cn-south-1`（广州）。',
      params: [
        { flag: '--cli-profile=<名称>', desc: '配置项名字，如 `default`、`bj-prod`、`sh-test`' },
        { flag: '--cli-access-key=<你的AK>', desc: '访问密钥 ID；示例里统一用尖括号占位，不要写真实值' },
        { flag: '--cli-secret-key=<你的SK>', desc: '私有访问密钥，与 AK 成对，泄露等于账号被接管' },
        { flag: '--cli-region=<区域>', desc: '该 profile 默认使用的区域' },
        { flag: '--cli-output=json|table|tsv', desc: '该 profile 默认的输出格式' },
        { flag: '--cli-mode=AKSK', desc: '鉴权方式；部分版本用它区分 AK/SK 与临时凭证，以 `--help` 为准' }
      ],
      examples: [
        { cmd: 'hcloud configure set --cli-profile=default --cli-access-key=<你的AK> --cli-secret-key=<你的SK> --cli-region=cn-north-4', desc: '配置默认 profile 指向北京四' },
        { cmd: 'hcloud configure set --cli-profile=sh-test --cli-access-key=<你的AK> --cli-secret-key=<你的SK> --cli-region=cn-east-3', desc: '再配一套上海一的测试环境，与 default 完全隔离' },
        { cmd: 'hcloud configure set --cli-profile=default --cli-output=table', desc: '把默认输出格式改成表格，人看着更舒服（脚本里仍建议 json）' },
        { cmd: 'hcloud configure list --cli-profile=default', desc: '核对写进去的值，重点看区域与 AK 是否配对正确' }
      ],
      notes: [
        '**AK/SK 绝不硬编码**：示例里统一写 `<你的AK>`/`<你的SK>`，真实值来自控制台「我的凭证」；写到历史命令里同样会泄露，建议用交互式 `configure init` 或从环境变量读取',
        'project_id 不需要写进配置也行：命令里用 `--project_id=<项目ID>` 传即可；**它必须与该命令的 `--cli-region` 属于同一区域**',
        '不确定当前版本支持哪些配置项时，先 `hcloud configure set --help`，以它的输出为准（华为云 API 迭代较快）',
        '临时 AK/SK（委托/STS 场景）需要额外的 securitytoken，普通长期 AK 不传；混用会报鉴权失败'
      ],
      related: ['hw-hcloud-config-init', 'hw-hcloud-config-list', 'hw-iam-aksk-leak', 'hw-cross-aksk-best-practice'],
      docs: 'https://support.huaweicloud.com/hcli/index.html',
      tags: ['KooCLI', '配置', 'AK/SK']
    },

    /* ---------- 3 / 71 ---------- */
    {
      id: 'hw-hcloud-config-list',
      name: 'hcloud configure list',
      alias: ['KooCLI 查看配置', 'hcloud 切换 profile', '多 profile 管理'],
      level: 1,
      syntax: 'hcloud configure list [--cli-profile=<配置项名>]',
      summary: '查看本机保存的所有配置项，多账号、多区域靠 profile 隔离切换。',
      desc: '不带参数时列出全部配置项（default 与自定义 profile）。切换环境有两种方式：`--cli-profile=<名字>` 写在命令末尾临时生效，或把它设成默认值。生产、测试、多账号混用时，用 profile 而不是改 `default`，可以避免"以为是测试环境却删了生产资源"。',
      params: [
        { flag: '--cli-profile=<名称>', desc: '只看指定配置项的明细' },
        { flag: '--cli-region=<区域>', desc: '在单条命令上临时覆盖区域，不影响配置文件' },
        { flag: '--cli-output=json|table|tsv', desc: '临时覆盖输出格式' }
      ],
      examples: [
        { cmd: 'hcloud configure list', desc: '列出本机所有配置项' },
        { cmd: 'hcloud configure list --cli-profile=sh-test', desc: '查看某个配置项的 AK、区域、项目等明细' },
        { cmd: 'hcloud ECS ListServersDetails --cli-profile=sh-test --cli-region=cn-east-3 --cli-output=table', desc: '临时用 sh-test 这套凭证查上海一的机器，不改动默认配置' },
        { cmd: 'hcloud ECS ListServersDetails --cli-profile=default --cli-region=cn-south-1 --cli-output=table', desc: '同一条命令换 region 就是另一批资源，跨区域盘点要逐区跑' }
      ],
      notes: [
        'profile 名字建议带环境与区域信息，如 `bj-prod`、`sh-test`，比 `p1`/`p2` 少出错',
        '配置项里的 AK/SK 是**明文保存**的；离职交接或机器重装前记得清理（删除方式见 `hcloud configure --help`，不同版本命令名略有差异）',
        '多账号盘点资源时写清 `--cli-profile` + `--cli-region` 两个参数，只改其中一个是最常见的"查不到机器"原因',
        '习惯上把 `default` 留给最不常用的账号，能减少误操作面'
      ],
      related: ['hw-hcloud-config-set', 'hw-hcloud-config-init', 'hw-ecs-list'],
      docs: 'https://support.huaweicloud.com/hcli/index.html',
      tags: ['KooCLI', 'profile', '多环境']
    },

    /* ---------- 4 / 71 ---------- */
    {
      id: 'hw-hcloud-help',
      name: 'hcloud --help（服务与操作自省）',
      kind: 'recipe',
      alias: ['hcloud ECS --help', 'hcloud 操作帮助', 'KooCLI 命令查询'],
      level: 1,
      syntax: 'hcloud <服务名> --help  |  hcloud <服务名> <操作名> --help',
      summary: '现场查华为云有哪些操作、每个操作要传什么参数，比翻文档快。',
      desc: 'KooCLI 的命令是**按华为云 OpenAPI 元数据动态生成**的，所以 `--help` 就是最权威、与当前版本一致的说明书：服务级列出该服务全部操作名，操作级列出每个参数的必选性与类型。华为云 API 迭代快，文档与 CLI 版本不一致时**以 `--help` 输出为准**。',
      examples: [
        { cmd: 'hcloud --help', desc: '列出 KooCLI 支持的所有服务（ECS/VPC/EVS/ELB/RDS/OBS/IMS/IAM/CES/CCE 等）' },
        { cmd: 'hcloud ECS --help', desc: '列出 ECS 服务的全部操作名，不确定操作叫什么时先看这里' },
        { cmd: 'hcloud ECS --help | grep -i volume', desc: 'Linux/macOS 下按关键字过滤操作名（PowerShell 用 `Select-String`）' },
        { cmd: 'hcloud ECS ListServersDetails --help', desc: '查看某个操作的完整参数、必选性与参数类型' },
        { cmd: 'hcloud ELB ListLoadBalancers/v3 --help', desc: '带版本号的操作（`/v3`）单独查帮助，共享型与独享型是两套接口' }
      ],
      notes: [
        '服务名大小写不敏感，`hcloud ecs` 与 `hcloud ECS` 等价；操作名**大小写敏感且不统一**（ELB 里既有 `CreateLoadBalancer` 也有 `CloneLoadbalancer`），照抄文档前先 `--help` 核对',
        '同一服务有多个 API 版本时用斜杠指定，如 `hcloud ELB ListLoadBalancers/v3`；不写版本可能命中旧接口',
        '`--help` 输出里的参数名可以直接写进命令（例如 `--server_id=`、`--security_group_id=`），占位值一律用尖括号形式如 `--server_id=<云服务器ID>`',
        '排查"命令不存在"的错误：先 `hcloud <服务> --help` 确认操作名，再确认 region/endpoint 是否支持该服务'
      ],
      related: ['hw-hcloud-config-init', 'hw-hcloud-output', 'hw-obsutil-help'],
      docs: 'https://support.huaweicloud.com/hcli/index.html',
      tags: ['KooCLI', '帮助', '自省']
    },

    /* ---------- 5 / 71 ---------- */
    {
      id: 'hw-hcloud-output',
      name: 'hcloud --cli-output / --cli-query / --cli-jsonInput',
      alias: ['KooCLI 输出格式', 'cli-query JMESPath', 'cli-jsonInput'],
      level: 2,
      syntax: 'hcloud <服务> <操作> --cli-output=json|table|tsv [--cli-query="<JMESPath>"] [--cli-jsonInput=<参数文件>]',
      summary: '控制 KooCLI 的输出格式、字段过滤与复杂入参，是脚本化的关键三件套。',
      desc: '这三个全局参数在任何操作后都能用：`--cli-output` 决定怎么显示，`--cli-query` 用 JMESPath 只取需要的字段，`--cli-jsonInput` 把复杂请求体写成 JSON 文件传进来——华为云的创建类接口参数层层嵌套，命令行里拼字符串极易出错。',
      params: [
        { flag: '--cli-output=json', desc: '完整 JSON，脚本解析用；默认格式' },
        { flag: '--cli-output=table', desc: '表格，列宽自动对齐，给人看；脚本里不要用' },
        { flag: '--cli-output=tsv', desc: '制表符分隔，配合 `--cli-query` 直接喂给 `awk`/`cut`' },
        { flag: '--cli-query="<JMESPath>"', desc: '对返回结果做字段投影与过滤，如 `servers[*].name`' },
        { flag: '--cli-jsonInput=<文件路径>', desc: '用 JSON 文件传参（也支持相对/绝对路径）' }
      ],
      examples: [
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-output=table', desc: '表格输出，人眼看机器列表' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[*].name"', desc: '只取机器名，返回一个纯数组' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[?status==\'ACTIVE\'].{name:name,id:id}" --cli-output=tsv', desc: '只取运行中机器的名字与 ID，制表符分隔' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-output=json > ecs.json', desc: '落盘成 JSON，后续用 `jq` 做复杂分析' },
        { cmd: 'hcloud ECS CreatePostPaidServers --cli-region=cn-north-4 --cli-jsonInput=./create-ecs.json', desc: '创建类接口用 JSON 文件传参，避免命令行拼长字符串' }
      ],
      notes: [
        '`--cli-query` 之后返回结构会变：原来 `{"servers":[...]}` 会变成数组本身，`jq` 路径要跟着改（`.[]` 而不是 `.servers[]`）',
        'JMESPath 里字符串比较用单引号，而 shell 里通常要再加一层双引号包住整个表达式；PowerShell 与 bash 的引号规则不同，写错的表现是查询结果为空而不是报错',
        '`--cli-jsonInput` 文件里同样可以写 `region`、`project_id` 等公共参数，适合把"环境参数"和"业务参数"分开维护',
        '脚本里**只用 `json` 或 `tsv`**：`table` 的列宽会随内容变化，解析必崩',
        '超过 25 条结果时先确认分页（`--limit`/`--offset`），否则脚本会漏资源，见 `hw-cross-paging-backoff`'
      ],
      related: ['hw-ecs-list', 'hw-hcloud-help', 'hw-cross-paging-backoff', 'hw-flow-ssh-inventory'],
      docs: 'https://support.huaweicloud.com/hcli/index.html',
      tags: ['KooCLI', 'JMESPath', '输出格式']
    },

    /* ================= B. ECS 弹性云服务器 ================= */

    /* ---------- 6 / 71 ---------- */
    {
      id: 'hw-ecs-list',
      name: 'hcloud ECS ListServersDetails',
      alias: ['华为云查询云服务器列表', 'hcloud ECS 查实例', 'ecs list'],
      level: 1,
      syntax: 'hcloud ECS ListServersDetails [--cli-region=<区域>] [--project_id=<项目ID>] [--name=<名称>] [--status=<状态>] [--limit=<条数>] [--offset=<偏移>] [--cli-output=json|table]',
      summary: '列出当前区域的云服务器清单，资产盘点与脚本取 IP 的第一条命令。',
      desc: '这是 ECS 新版（v2.1）接口，返回每台机器的 ID、名称、规格、状态与网卡地址。加 `--cli-query` 就能只取需要的字段，比在控制台翻页快得多。拿着它的 `id` 可以去查详情、启停、改规格、删机器。',
      params: [
        { flag: '--cli-region=<区域>', desc: '区域标识，如 `cn-north-4`（北京四）；不写则用配置里的默认区域' },
        { flag: '--project_id=<项目ID>', desc: '项目 ID，必须与该命令的 region 属于同一区域' },
        { flag: '--name=<名称>', desc: '按云服务器名称过滤（支持部分匹配，具体语义见 `--help`）' },
        { flag: '--status=<状态>', desc: '按状态过滤，如 `ACTIVE`（运行中）、`SHUTOFF`（关机）' },
        { flag: '--limit=<条数>', desc: '单页返回条数；默认页大小有限，盘点时必须处理分页' },
        { flag: '--offset=<偏移>', desc: '分页偏移量，与 `--limit` 配合翻页' }
      ],
      examples: [
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --project_id=<项目ID> --cli-output=table', desc: '列出北京四的全部云服务器（表格输出）' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --name=web-01 --cli-output=json', desc: '按名称过滤，找特定的那台机器' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[?status==\'ACTIVE\'].{name:name,id:id}" --cli-output=json', desc: '只看运行中机器的名字与 ID，喂给后续脚本' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --limit=50 --offset=0 --cli-query="servers[*].id" --cli-output=tsv', desc: '分页取 ID 清单，机器多时必须这样循环取' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-east-3 --cli-output=table', desc: '换 region 就是另一批资源；跨区域盘点要逐区执行' }
      ],
      notes: [
        '**region 与 project_id 必须匹配**：KooCLI 的报错绝大多数来自这两者不一致，或者区域写错导致"查不到资源"（不报错但结果是空）',
        '结果默认分页，页大小有限；脚本里不处理 `--limit`/`--offset` 一定会漏机器，见 `hw-cross-paging-backoff`',
        '公网 IP 不在这个接口的顶层字段里：私网地址在 `servers[].addresses`，绑定的公网 IP 要另查 `hcloud EIP ListPublicips`（见 `hw-ecs-eip-bind`）',
        '按标签过滤的入参名在不同版本略有差异，脚本里建议先用 `--cli-query` 在返回结果里筛标签，或到 `hcloud ECS ListServersDetails --help` 确认',
        '只读命令也会产生 API 调用记录（云审计 CTS 可查），但不影响计费'
      ],
      related: ['hw-ecs-show', 'hw-ecs-eip-bind', 'hw-flow-ssh-inventory', 'hw-hcloud-output'],
      docs: 'https://support.huaweicloud.com/clir-ecs/ecs_cli_02.html',
      tags: ['ECS', '云服务器', '查询']
    },

    /* ---------- 7 / 71 ---------- */
    {
      id: 'hw-ecs-show',
      name: 'hcloud ECS NovaShowServer',
      alias: ['华为云查云服务器详情', 'hcloud ECS 单实例详情', 'nova show'],
      level: 2,
      syntax: 'hcloud ECS NovaShowServer --server_id=<云服务器ID> [--cli-region=<区域>] [--cli-query="<JMESPath>"]',
      summary: '按 ID 查单台云服务器的详情与状态，排障时确认机器到底在不在跑。',
      desc: '`NovaShowServer` 属于 Nova 系列接口（OpenStack 时代的 API 集，操作名带 `Nova` 前缀），与新版 ECS 接口（`ListServersDetails` 等）操作的是**同一批云服务器、同一个 ID**。区别在于：Nova 接口字段更贴近 OpenStack 原生结构，适合快速看单台的状态、网卡地址、挂载的镜像与规格。',
      examples: [
        { cmd: 'hcloud ECS NovaShowServer --server_id=8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88 --cli-region=cn-north-4', desc: '查单台云服务器详情（这是教学环境里 web-prod-01 的 ID）' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[*].[id,name,status]" --cli-output=tsv', desc: '要 ID 就先这样把所有机器列成表格 —— **先拿 ID 再查详情**是固定顺序' },
        { cmd: 'hcloud ECS NovaShowServer --server_id=<云服务器ID> --cli-region=cn-north-4', desc: '查看单台机器的完整详情' },
        { cmd: 'hcloud ECS NovaShowServer --server_id=<云服务器ID> --cli-region=cn-north-4 --cli-query="{name:server.name,status:server.status,created:server.created}"', desc: '只取名称、状态与创建时间，输出更清爽' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[?id==\'<云服务器ID>\']"', desc: '同样的机器用新版接口查一次，方便对照两种接口的字段差异' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[*].[id,name,status]" --cli-output=tsv', desc: '批量看状态，比逐台 NovaShowServer 高效' }
      ],
      notes: [
        '**Nova 系列与 ECS 新接口的区别**：`Nova*` 是兼容 OpenStack 的旧接口集，ECS v2.1（`ListServersDetails`/`CreatePostPaidServers`/`BatchStartServers` 等）是华为云自研新版；查询可以混用，**创建与变更类操作优先用新版**，新规格与新特性只在 v2.1 提供',
        '状态值常见的有 `ACTIVE`（运行中）、`SHUTOFF`（关机）、`REBOOT`/`BUILD`（过渡态，说明正在操作中，此时再发命令容易失败）',
        '部分 Nova 字段（如宿主机信息 `OS-EXT-SRV-ATTR:host`）只有管理员可见，普通账号返回为空是正常现象',
        '机器 ID 与 region 绑定：换区域必须换 `--cli-region`，否则报找不到该资源'
      ],
      related: ['hw-ecs-list', 'hw-ecs-batch-power', 'hw-hcloud-help'],
      docs: 'https://support.huaweicloud.com/api-ecs/ecs_02_0210.html',
      tags: ['ECS', 'Nova', '详情']
    },

    /* ---------- 8 / 71 ---------- */
    {
      id: 'hw-ecs-create',
      name: 'hcloud ECS CreatePostPaidServers',
      alias: ['华为云创建云服务器', 'hcloud ECS 按需创建', 'create ecs'],
      level: 2,
      syntax: 'hcloud ECS CreatePostPaidServers --cli-region=<区域> --cli-jsonInput=<创建参数JSON>',
      summary: '按需创建一台或多台云服务器，参数多建议用 JSON 文件传入。',
      desc: '`CreatePostPaidServers` 创建**按需计费**（后付费）的云服务器，支持 `count` 一次批量创建多台。请求体的 `server` 对象里至少要给出：名称、镜像 ID（`imageRef`）、规格 ID（`flavorRef`）、VPC ID、网卡子网（`nics`）、系统盘（`root_volume`），通常还要给 `key_name`（密钥对）。参数层层嵌套，用 `--cli-jsonInput` 比在命令行拼字符串可靠得多。',
      params: [
        { flag: '--cli-jsonInput=<文件>', desc: '把请求体写成 JSON 文件传入，创建类接口的首选方式' },
        { flag: '--server=\'{...}\'', desc: '也可以直接传 JSON 字符串；转义麻烦，仅适合简单场景' },
        { flag: '--cli-region=<区域>', desc: '机器创建到哪个区域，镜像/规格/子网都必须在同一区域' },
        { flag: '--dry_run=true', desc: '部分接口支持预检；不支持时会报参数错误，先用 `--help` 确认' }
      ],
      examples: [
        { cmd: 'hcloud ECS CreatePostPaidServers --cli-region=cn-north-4 --cli-jsonInput=./create-ecs.json', desc: '用 JSON 文件创建，推荐写法' },
        { cmd: 'hcloud ECS CreatePostPaidServers --cli-region=cn-north-4 --server=\'{"name":"web-01","imageRef":"<镜像ID>","flavorRef":"s6.large.2","vpcid":"<VPC ID>","nics":[{"subnet_id":"<子网ID>"}],"root_volume":{"volumetype":"GPSSD","size":40},"key_name":"<密钥对名称>","count":1}\'', desc: '单台创建的完整请求体（字段名以 `--help` 为准）' },
        { cmd: 'hcloud IMS ListImages --cli-region=cn-north-4 --cli-query="images[*].{name:name,id:id}" --cli-output=table', desc: '创建前先取镜像 ID（imageRef）' },
        { cmd: 'hcloud ECS ListFlavors --cli-region=cn-north-4 --cli-query="flavors[?name==\'s6.large.2\'].id"', desc: '创建前先取规格 ID（flavorRef）' }
      ],
      notes: [
        '创建前把三个 ID 备齐：`imageRef`（镜像）、`flavorRef`（规格）、子网 ID；它们必须与 `--cli-region` 在同一区域，跨区 ID 一定失败',
        '不指定安全组时会用 VPC 的默认安全组，**默认安全组入方向基本不放行**，机器起来但端口不通是意料之中（见 `hw-vpc-sg-rule`）',
        '`key_name` 用的密钥对必须已存在（见 `hw-ecs-keypair-group`），否则机器创建后只能用控制台重置密码登录',
        '按需计费**从创建成功那一刻开始计费**，批量创建时 `count` 写错会瞬间多出好几台机器，创建后立刻用 `hw-ecs-list` 核对',
        '生产环境建议用 Terraform/模板管理创建参数，手工 JSON 适合临时验证；创建失败时错误信息通常在返回的 `error_code`/`error_msg` 里'
      ],
      related: ['hw-ecs-list', 'hw-ecs-az-flavor', 'hw-ecs-keypair-group', 'hw-flow-cloud-init'],
      docs: 'https://support.huaweicloud.com/clir-ecs/ecs_cli_02.html',
      tags: ['ECS', '创建', '按需']
    },

    /* ---------- 9 / 71 ---------- */
    {
      id: 'hw-ecs-batch-power',
      name: 'hcloud ECS BatchStartServers / BatchStopServers / BatchRebootServers',
      alias: ['华为云批量开机', 'hcloud 批量关机', '批量重启云服务器'],
      level: 2,
      syntax: 'hcloud ECS BatchStopServers --cli-region=<区域> --os-stop=\'{"servers":[{"id":"<云服务器ID>"}],"type":"SOFT"}\'',
      summary: '一次开机、关机或重启多台云服务器，批量运维与停机省钱的基本操作。',
      desc: '三个操作的结构一致：请求体里给一个**服务器 ID 列表**，可选 `type` 指定关机/重启方式（`SOFT` 优雅、`HARD` 强制）。ID 列表通常这样生成：先用 `ListServersDetails` 取 `servers[*].id`，再拼进 JSON。批量任务提交后不会等结果，状态要自己再查。',
      params: [
        { flag: '--os-start=\'{...}\'', desc: '开机请求体：`{"servers":[{"id":"..."}]}`' },
        { flag: '--os-stop=\'{...}\'', desc: '关机请求体：`{"servers":[{"id":"..."}],"type":"SOFT"}`' },
        { flag: '--reboot=\'{...}\'', desc: '重启请求体：`{"servers":[{"id":"..."}],"type":"SOFT"}`' },
        { flag: '--cli-jsonInput=<文件>', desc: 'ID 多的时候写进 JSON 文件，避免命令行过长' }
      ],
      examples: [
        { cmd: 'hcloud ECS BatchStopServers --cli-region=cn-north-4 --os-stop=\'{"servers":[{"id":"<云服务器ID1>"},{"id":"<云服务器ID2>"}],"type":"SOFT"}\'', desc: '优雅关闭两台机器' },
        { cmd: 'hcloud ECS BatchStartServers --cli-region=cn-north-4 --cli-jsonInput=./batch-start.json', desc: '批量开机用 JSON 文件传参（机器多时推荐）' },
        { cmd: 'hcloud ECS BatchRebootServers --cli-region=cn-north-4 --reboot=\'{"servers":[{"id":"<云服务器ID>"}],"type":"SOFT"}\'', desc: '单台重启也走批量接口' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[*].id" --cli-output=tsv', desc: '先生成 ID 清单，再填进批量请求体' }
      ],
      notes: [
        '`SOFT` 是**优雅**关机/重启（等操作系统响应，可能被应用拦住），`HARD` 相当于拔电源，**可能丢数据**，只在系统无响应时用',
        '关机后计算资源不再计费，但**云硬盘与绑定的 EIP 继续计费**，长期停机不等于省钱（见 `hw-flow-cost-idle`）',
        '批量接口只返回任务受理结果：刚提交时机器状态是 `REBOOT`/`SHUTOFF` 之类的过渡态，脚本里要轮询 `NovaShowServer` 到 `ACTIVE` 才算真的起来',
        '不要对生产核心库主机随手批量重启；重启前确认没有正在跑的备份、也不在维护窗口外',
        '机器 ID 必须属于当前 `--cli-region` 的项目，混用区域会报资源不存在'
      ],
      related: ['hw-ecs-list', 'hw-ecs-show', 'hw-flow-cost-idle'],
      docs: 'https://support.huaweicloud.com/clir-ecs/ecs_cli_02.html',
      tags: ['ECS', '批量', '开关机']
    },

    /* ---------- 10 / 71 ---------- */
    {
      id: 'hw-ecs-update-resize',
      name: 'hcloud ECS UpdateServer / ResizePostPaidServer',
      alias: ['华为云变更规格', 'hcloud ECS 改配置', '云服务器升配'],
      level: 3,
      syntax: 'hcloud ECS UpdateServer --server_id=<云服务器ID> --server=\'{"name":"<新名称>"}\'  |  hcloud ECS ResizePostPaidServer --server_id=<云服务器ID> --resize=\'{"flavorRef":"<规格ID>"}\'',
      summary: '改云服务器名称描述，或者变更 CPU/内存规格，改规格前必须先关机。',
      desc: '两件事分属两个操作：`UpdateServer` 改的是元信息（名称、描述等），`ResizePostPaidServer` 改的是**规格**（CPU/内存），仅适用按需计费实例。变更规格需要先关机，变更完成后要重新开机才生效。规格受实例类型与代际限制（x86 与鲲鹏/ARM 实例不能互转），具体约束以控制台提示与 `--help` 为准。',
      params: [
        { flag: '--server_id=<云服务器ID>', desc: '目标云服务器 ID，两个操作都用它' },
        { flag: '--server=\'{...}\'', desc: '`UpdateServer` 的请求体，如 `{"name":"web-prod-01"}`' },
        { flag: '--resize=\'{...}\'', desc: '`ResizePostPaidServer` 的请求体，如 `{"flavorRef":"<规格ID>"}`' },
        { flag: '--cli-jsonInput=<文件>', desc: '参数多时用 JSON 文件，避免引号转义出错' }
      ],
      examples: [
        { cmd: 'hcloud ECS ListFlavors --cli-region=cn-north-4 --cli-query="flavors[*].[name,vcpus,ram]" --cli-output=tsv', desc: '改规格前先看有哪些规格可选（对照当前规格 s6.xlarge.4）' },
        { cmd: 'hcloud ECS NovaShowServer --server_id=8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88 --cli-region=cn-north-4 --cli-query="server.flavor"', desc: '确认当前规格 —— 变更前必须先记录原值，便于回滚' },
        { cmd: 'hcloud ECS ListFlavors --cli-region=cn-north-4 --cli-query="flavors[?name==\'s6.xlarge.2\'].id"', desc: '先取目标规格的 ID' },
        { cmd: 'hcloud ECS BatchStopServers --cli-region=cn-north-4 --os-stop=\'{"servers":[{"id":"<云服务器ID>"}],"type":"SOFT"}\'', desc: '变更规格前先关机，否则会被拒绝' },
        { cmd: 'hcloud ECS ResizePostPaidServer --server_id=<云服务器ID> --resize=\'{"flavorRef":"<规格ID>"}\' --cli-region=cn-north-4', desc: '把机器升配到新规格' },
        { cmd: 'hcloud ECS UpdateServer --server_id=<云服务器ID> --server=\'{"name":"web-prod-01","description":"prod web 01"}\' --cli-region=cn-north-4', desc: '改名称与描述，机器 ID 不变' },
        { cmd: 'hcloud ECS NovaShowServer --server_id=<云服务器ID> --cli-region=cn-north-4 --cli-query="server.flavor"', desc: '确认规格是否已经改过来' }
      ],
      notes: [
        '变更规格是**不可逆的性能操作**：降配之后业务可能跑不动，升配之前先确认配额够用',
        '关机 → 变更 → 开机，三步缺一不可；变更过程中机器处于过渡态，此时再发命令容易失败，等状态回到 `SHUTOFF`/`ACTIVE` 再操作',
        '规格建议用**规格 ID**（`flavorRef`）而不是规格名：名字在不同区域可能对应不同代际',
        '改主机名不会改 DNS 记录；容器/中间件里配置的是 IP 或内网域名，改名不影响它们，但改名会影响监控、CMDB 与脚本里的名字匹配',
        '重要机器变更前先做快照或镜像（控制台操作），出问题能快速回滚'
      ],
      related: ['hw-ecs-list', 'hw-ecs-az-flavor', 'hw-ecs-batch-power'],
      docs: 'https://support.huaweicloud.com/api-ecs/ecs_02_0210.html',
      tags: ['ECS', '变更规格', '升配']
    },

    /* ---------- 11 / 71 ---------- */
    {
      id: 'hw-ecs-delete',
      name: 'hcloud ECS DeleteServers',
      alias: ['华为云删除云服务器', 'hcloud ECS 退订实例', 'delete servers'],
      level: 3,
      syntax: 'hcloud ECS DeleteServers --servers=\'[{"id":"<云服务器ID>"}]\' [--delete_publicip=true|false] [--delete_volume=true|false] [--cli-region=<区域>]',
      summary: '删除云服务器，可选同时删除绑定的 EIP 与云硬盘，删前务必确认。',
      desc: '请求体给一个服务器列表，`id` 可以是云服务器 ID 或名称。两个开关决定**连带删除**哪些资源：`--delete_publicip` 控制绑定的弹性公网 IP，`--delete_volume` 控制绑定的数据盘（以及是否一并处理系统盘）。默认不删除更安全，但不删的资源会继续计费。',
      params: [
        { flag: '--servers=\'[{"id":"..."}]\'', desc: '要删除的云服务器列表，可给多台' },
        { flag: '--delete_publicip=true|false', desc: '是否同时删除绑定的弹性公网 IP' },
        { flag: '--delete_volume=true|false', desc: '是否同时删除绑定的云硬盘' },
        { flag: '--cli-jsonInput=<文件>', desc: '批量删除时用 JSON 文件传参' }
      ],
      examples: [
        { cmd: 'hcloud ECS NovaShowServer --server_id=8f3c1a72-4d5e-4b91-9c2a-1e7d6b0c4f88 --cli-region=cn-north-4 --cli-query="{name:server.name,status:server.status}"', desc: '删之前先确认**删的是哪一台**（ID → 名字，避免删错）' },
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query="volumes[?status==\'available\'].{name:name,size:size}"', desc: '顺便查有没有遗留的未挂载云盘 —— 删机器不等于删盘，盘还在计费' },
        { cmd: 'hcloud ECS NovaShowServer --server_id=<云服务器ID> --cli-region=cn-north-4 --cli-query="{name:server.name,status:server.status}"', desc: '删之前先确认机器身份，别删错' },
        { cmd: 'hcloud ECS DeleteServers --cli-region=cn-north-4 --servers=\'[{"id":"<云服务器ID>"}]\' --delete_publicip=false --delete_volume=false', desc: '先删机器、保留 EIP 与云盘（最安全的默认姿势）' },
        { cmd: 'hcloud ECS DeleteServers --cli-region=cn-north-4 --servers=\'[{"id":"<云服务器ID>"}]\' --delete_publicip=true --delete_volume=true', desc: '连公网 IP 与云盘一起删，确认数据不需要了再用' },
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query="volumes[?status==\'available\'].{name:name,size:size}" --cli-output=table', desc: '删完检查残留的未挂载云盘，别让它白计费' }
      ],
      notes: [
        '**删除云服务器不可恢复**（除非事先做了镜像或备份）；生产环境删除前先确认业务已下线、数据已备份、没有依赖它的 ELB 后端或 RDS 白名单',
        '`--delete_publicip=true` 会连 EIP 一起释放，如果这个 IP 已被列入白名单/备案/域名解析，释放后**基本拿不回来**',
        '`--delete_volume=true` 会删掉机器上的数据盘内容；拿不准就先用 `false`，确认数据无价值后再手工删盘（见 `hw-flow-cost-idle`）',
        '不删盘的结果是盘变成 `available` 状态并继续计费，容易被忽略——删除任务做完务必回头查一次云盘与 EIP 清单',
        '批量删除前把 ID 列表落盘存档（`--cli-output=json > deleted.json`），便于事后追溯'
      ],
      related: ['hw-ecs-list', 'hw-ecs-batch-power', 'hw-flow-cost-idle', 'hw-evs-list'],
      docs: 'https://support.huaweicloud.com/clir-ecs/ecs_cli_02.html',
      tags: ['ECS', '删除', '危险操作']
    },

    /* ---------- 12 / 71 ---------- */
    {
      id: 'hw-ecs-az-flavor',
      name: 'hcloud ECS NovaListAvailabilityZones / ListFlavors',
      alias: ['华为云查可用区', 'hcloud ECS 查规格', 'flavor 查询'],
      level: 2,
      syntax: 'hcloud ECS NovaListAvailabilityZones --cli-region=<区域>  |  hcloud ECS ListFlavors --cli-region=<区域>',
      summary: '查清目标区域有哪些可用区与规格，创建机器前先把这两个 ID 拿到。',
      desc: '创建云服务器需要 `flavorRef`（规格）与可用区信息，云硬盘挂载还要求盘与机器在同一可用区。可用区列表走 Nova 接口（`NovaListAvailabilityZones`），规格用新版 `ListFlavors`（返回 CPU、内存、代际等扩展信息）。',
      examples: [
        { cmd: 'hcloud ECS NovaListAvailabilityZones --cli-region=cn-north-4 --cli-output=table', desc: '看北京四有哪些可用区（如 cn-north-4a/4b/4c）' },
        { cmd: 'hcloud ECS ListFlavors --cli-region=cn-north-4 --cli-query="flavors[?name==\'s6.large.2\'].{id:id,name:name,vcpus:vcpus,ram:ram}"', desc: '按规格名查规格 ID 与 CPU/内存' },
        { cmd: 'hcloud ECS ListFlavors --cli-region=cn-north-4 --cli-query="flavors[*].[name,vcpus,ram]" --cli-output=tsv', desc: '导出规格清单，选型时对比' },
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query="volumes[*].{name:name,az:availability_zone}" --cli-output=table', desc: '查云盘在哪个可用区，挂载前必须与机器对齐' }
      ],
      notes: [
        '可用区之间**同 VPC 内网默认互通**，但物理上分开：跨 AZ 部署是标准的高可用做法，代价是跨 AZ 流量延迟略高',
        '鲲鹏（ARM）规格是 `k`/`kc` 系列，必须配 ARM 架构的镜像，混用会创建失败',
        '规格名（如 `s6.large.2`）在不同区域可能对应不同代际，脚本里建议用规格 ID 而不是名字',
        '可用区资源不足时创建会报配额/库存类错误，换一个 AZ 再试是最快的绕法',
        '查可用区与规格都是只读操作，不产生资源费用'
      ],
      related: ['hw-ecs-create', 'hw-evs-create', 'hw-ecs-update-resize'],
      docs: 'https://support.huaweicloud.com/clir-ecs/ecs_cli_02.html',
      tags: ['ECS', '可用区', '规格']
    },

    /* ---------- 13 / 71 ---------- */
    {
      id: 'hw-ecs-eip-bind',
      name: 'hcloud EIP UpdatePublicip（绑定/解绑弹性公网 IP）',
      kind: 'recipe',
      alias: ['华为云绑定EIP', 'hcloud 公网IP绑定云服务器', '解绑弹性公网IP'],
      level: 2,
      syntax: 'hcloud EIP UpdatePublicip --publicip_id=<EIP ID> --publicip=\'{"associate_instance_type":"PORT","associate_instance_id":"<网卡端口ID>"}\'',
      summary: '给云服务器绑定或解绑公网 IP，绑定的其实是网卡端口而不是机器本身。',
      desc: '云服务器的公网入口是弹性公网 IP（EIP），绑定/解绑动作属于**弹性公网 IP 服务**（KooCLI 服务名 `EIP`），不在 ECS 里。关键点：EIP 绑定对象是**网卡（port）**，所以要先从 ECS 的机器 ID 换到 port ID。',
      examples: [
        { cmd: 'hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query="publicips[*].{ip:public_ip_address,status:status,id:id}" --cli-output=table', desc: '先看清哪些 EIP 已绑定（ACTIVE）、哪些闲置（DOWN）' },
        { cmd: 'hcloud VPC ListPorts --cli-region=cn-north-4 --cli-query="ports[*].[name,id]" --cli-output=tsv', desc: '绑定要填的是**端口 ID**（不是服务器 ID），先查出来' },
        { cmd: 'hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query="publicips[*].{ip:public_ip_address,status:status,id:id}" --cli-output=table', desc: '看有哪些 EIP 及其状态（未绑定的通常是 `DOWN`）' },
        { cmd: 'hcloud VPC ListPorts --cli-region=cn-north-4 --device_id=<云服务器ID> --cli-query="ports[*].id"', desc: '用机器 ID 查它对应的网卡端口 ID' },
        { cmd: 'hcloud EIP UpdatePublicip --publicip_id=<EIP ID> --publicip=\'{"associate_instance_type":"PORT","associate_instance_id":"<网卡端口ID>"}\' --cli-region=cn-north-4', desc: '把 EIP 绑定到这台机器的网卡上' },
        { cmd: 'hcloud EIP UpdatePublicip --publicip_id=<EIP ID> --publicip=\'{"associate_instance_type":"","associate_instance_id":""}\' --cli-region=cn-north-4', desc: '解绑：两个关联字段传空（字段语义以官方文档与 `--help` 为准）' }
      ],
      notes: [
        'EIP 与云服务器**必须在同一区域**才能绑定；跨区要各自建 EIP',
        '绑错机器的表现是"服务正常但外网访问不到"——先在这个命令的返回里确认 `associate_instance_id` 是不是目标网卡',
        '**解绑后 EIP 不会自动释放，仍按小时计费**；确实不用了要 `hcloud EIP DeletePublicip --publicip_id=<EIP ID> --cli-region=cn-north-4`（释放后 IP 不可找回）',
        '带宽与计费方式（按带宽/按流量）在创建 EIP 时确定，绑定动作不影响计费方式',
        '安全组没放行时，绑定 EIP 也访问不通：EIP 只解决"有没有公网路径"，端口是否开放由安全组决定（见 `hw-vpc-troubleshoot-port`）'
      ],
      related: ['hw-ecs-list', 'hw-vpc-sg-rule', 'hw-flow-cost-idle', 'hw-vpc-troubleshoot-port'],
      docs: 'https://support.huaweicloud.com/api-eip/eip_api_0001.html',
      tags: ['EIP', '公网IP', '绑定']
    },

    /* ---------- 14 / 71 ---------- */
    {
      id: 'hw-ecs-keypair-group',
      name: 'hcloud ECS NovaCreateKeypair / NovaCreateServerGroup',
      alias: ['华为云密钥对管理', 'hcloud 云服务器组', '反亲和性'],
      level: 3,
      syntax: 'hcloud ECS NovaCreateKeypair --keypair=\'{"name":"<密钥对名称>"}\'  |  hcloud ECS NovaCreateServerGroup --server_group=\'{"name":"<组名>","policies":["anti-affinity"]}\'',
      summary: '管理 SSH 密钥对与云服务器组，密钥对决定能不能登录，组决定高可用。',
      desc: '两件常一起做的事：密钥对（keypair）用于创建机器时注入公钥，之后用私钥 `ssh -i` 登录；云服务器组（server group）用反亲和（`anti-affinity`）策略把同一组实例分散到不同物理宿主机，避免一台宿主机故障带走整个集群。',
      examples: [
        { cmd: 'hcloud ECS NovaCreateKeypair --keypair=\'{"name":"prod-key"}\' --cli-region=cn-north-4 --cli-output=json', desc: '创建密钥对，响应里会带一次性的私钥，立刻保存' },
        { cmd: 'hcloud ECS NovaListKeypairs --cli-region=cn-north-4 --cli-query="keypairs[*].keypair.name"', desc: '列出已有密钥对，创建机器时 `key_name` 必须能对上' },
        { cmd: 'hcloud ECS NovaCreateServerGroup --server_group=\'{"name":"web-as-group","policies":["anti-affinity"]}\' --cli-region=cn-north-4', desc: '创建反亲和云服务器组' },
        { cmd: 'hcloud ECS NovaListServerGroups --cli-region=cn-north-4 --cli-output=table', desc: '查看现有云服务器组与策略' },
        { cmd: 'ssh -i ~/.ssh/prod-key.pem root@<云服务器弹性公网IP>', desc: '用私钥登录（权限建议 600，见 `ln-ssh`）' }
      ],
      notes: [
        '**私钥只在创建响应里出现一次**：华为云不保存私钥，丢了只能重建密钥对并重新注入/换绑，务必当场 `--cli-output=json` 落盘并妥善保管',
        '密钥对是**区域级**资源：在 `cn-north-4` 建的密钥对不能直接用于 `cn-east-3` 的机器',
        '反亲和组内的实例分散在不同宿主机，因此**同组能创建的实例数受可用宿主机数量限制**，报资源不足时换 AZ 或拆成多个组',
        '云服务器组主要在创建时指定（`server_group` 字段），改组的成本很高，规划阶段就要想清楚',
        '私钥不要提交到 Git，也不要放进镜像；多人协作时每人用自己的密钥对，便于离职回收'
      ],
      related: ['hw-ecs-create', 'hw-ecs-az-flavor', 'hw-iam-aksk-leak'],
      docs: 'https://support.huaweicloud.com/clir-ecs/ecs_cli_02.html',
      tags: ['ECS', '密钥对', '高可用']
    },

    /* ================= C. OBS 对象存储（KooCLI 入口） ================= */

    /* ---------- 15 / 71 ---------- */
    {
      id: 'hw-obs-bucket',
      name: 'hcloud OBS CreateBucket / ListBuckets',
      alias: ['华为云创建桶', 'hcloud OBS 查桶列表', 'obs bucket'],
      level: 2,
      syntax: 'hcloud OBS CreateBucket --bucket=<全局唯一的桶名> --cli-region=<区域>  |  hcloud OBS ListBuckets --cli-region=<区域>',
      summary: '列出或创建 OBS 桶，KooCLI 入口的操作名与 OBS 接口同名。',
      desc: '`hcloud OBS` 是 KooCLI 里基于 OBS 接口元数据的入口，操作名沿用 OBS 接口名（`CreateBucket`/`ListBuckets`），参数与 `obsutil` 完全是两套写法。桶级管理（建桶、查桶、桶策略）用它没问题；**上传下载优先用 `obsutil`**（见 `hw-obs-vs-obsutil`）。',
      examples: [
        { cmd: 'hcloud OBS ListBuckets --cli-region=cn-north-4 --cli-output=table', desc: '列出当前凭证有权限访问的桶' },
        { cmd: 'hcloud OBS ListBuckets --cli-region=cn-north-4 --cli-query="buckets[*].name"', desc: '只取桶名，喂给后续脚本' },
        { cmd: 'hcloud OBS CreateBucket --cli-region=cn-north-4 --bucket=<全局唯一的桶名>', desc: '创建一个北京四的桶' },
        { cmd: 'hcloud OBS CreateBucket --help', desc: '不确定参数名时先查帮助（桶名在 OBS 接口里是 URI 路径参数 `bucket`）' }
      ],
      notes: [
        'OBS 桶名**全局唯一**：所有华为云用户共享同一命名空间，常见的 `test`、`data` 早被占用，起名时带上项目与用途前缀',
        '桶名只能是**小写字母、数字、中划线、点**，长度 3~63 个字符，不能以点或中划线开头结尾',
        '桶创建后**不能更换区域**，只能新建桶再迁移数据；跨区访问要改 `--cli-region` 或 obsutil 的 endpoint',
        '**KooCLI 与 obsutil 是两套语法**：`hcloud OBS` 用「操作名 + 长参数」（`--bucket=`），obsutil 用「短子命令 + 短选项」（`-i`/`-r`/`-f`），把两者混着写一定报参数错误',
        'AK/SK 权限不足时返回 403；脚本里不要硬编码密钥，统一用 IAM 子用户 + 最小权限（见 `hw-iam-aksk-leak`）'
      ],
      related: ['hw-obs-vs-obsutil', 'hw-obs-put-object', 'hw-obsutil-mb', 'hw-obsutil-ls'],
      docs: 'https://support.huaweicloud.com/obs/index.html',
      tags: ['OBS', '桶', 'KooCLI']
    },

    /* ---------- 16 / 71 ---------- */
    {
      id: 'hw-obs-put-object',
      name: 'hcloud OBS PutObject',
      alias: ['华为云上传对象', 'hcloud OBS 上传文件', 'put object'],
      level: 3,
      syntax: 'hcloud OBS PutObject --bucket=<桶名> --key=<对象名> --body=<本地文件路径> [--cli-region=<区域>]',
      summary: '通过 KooCLI 上传单个对象，参数写法与 obsutil 完全不同，别混用。',
      desc: '对象内容通过 `--body` 指向本地文件，`--key` 就是对象名（OBS 没有真目录，`a/b/c.txt` 里的斜杠只是对象名的一部分）。这个入口适合"顺手传一个文件"，**不适合批量或大文件**：断点续传、并发、校验都要靠 `obsutil cp`/`obsutil sync`。KooCLI 版本升级时 OBS 参数可能微调，用之前先 `--help` 核对。',
      params: [
        { flag: '--bucket=<桶名>', desc: '目标桶，必须是当前 region 里已存在的桶' },
        { flag: '--key=<对象名>', desc: '对象名，可带斜杠模拟目录，如 `web/index.html`' },
        { flag: '--body=<本地文件路径>', desc: '请求体即文件内容；参数名以 `hcloud OBS PutObject --help` 为准' },
        { flag: '--cli-region=<区域>', desc: '桶所在区域，写错会报 404 或签名不匹配' }
      ],
      examples: [
        { cmd: 'obsutil cp ./dist/index.html obs://prod-static/index.html -f', desc: '上传对象（教学环境能跑；hcloud OBS 的写操作不模拟）' },
        { cmd: 'obsutil stat obs://prod-static/index.html', desc: '上传后核对：对象在不在、大小对不对、ContentType 是不是 text/html' },
        { cmd: 'hcloud OBS PutObject --help', desc: '先确认当前版本 PutObject 的参数名与必选性' },
        { cmd: 'hcloud OBS PutObject --cli-region=cn-north-4 --bucket=<桶名> --key=index.html --body=./dist/index.html', desc: '上传单个文件到桶根目录' },
        { cmd: 'obsutil cp ./dist/index.html obs://<桶名>/index.html -f', desc: '同样的活交给 obsutil 更稳（`-f` 表示同名直接覆盖）' },
        { cmd: 'obsutil stat obs://<桶名>/index.html', desc: '上传后核对对象大小与最后修改时间' }
      ],
      notes: [
        '**两个入口不要混用**：`--bucket`/`--key` 是 KooCLI 的写法，obsutil 里对应的是 `obs://<桶名>/<对象名>`，写成 `obsutil cp --bucket=...` 会直接报参数错误',
        '上传大量文件或大文件请用 `obsutil cp -r` / `obsutil sync`：KooCLI 逐个调用没有并发、没有断点续传，几百个文件能跑到你怀疑人生',
        '对象名以 `/` 结尾表示"目录对象"，只在需要占位目录时才这么写，普通文件不要留尾斜杠',
        '权限不足报 403 时检查 IAM 策略里是否有对象上传权限（OBS 的 action 形如 `obs:object:PutObject`）',
        '上传后立刻用 `obsutil stat` 核对大小、用 `obsutil ls obs://<桶名>/ -limit=10` 核对对象名，避免"传到错前缀"'
      ],
      related: ['hw-obs-vs-obsutil', 'hw-obsutil-cp', 'hw-obsutil-sync', 'hw-obs-get-delete-object'],
      docs: 'https://support.huaweicloud.com/obs/index.html',
      tags: ['OBS', '上传', '对象']
    },

    /* ---------- 17 / 71 ---------- */
    {
      id: 'hw-obs-get-delete-object',
      name: 'hcloud OBS GetObject / DeleteObject',
      alias: ['华为云下载对象', 'hcloud OBS 删除对象', 'obs list objects'],
      level: 3,
      syntax: 'hcloud OBS GetObject --bucket=<桶名> --key=<对象名>  |  hcloud OBS DeleteObject --bucket=<桶名> --key=<对象名>',
      summary: '下载或删除 OBS 对象，批量场景请改用 obsutil 而不是循环调 KooCLI。',
      desc: '`GetObject` 把对象内容取回来（内容会输出到标准输出，重定向到文件即可保存），`DeleteObject` 删除单个对象。删除**不可恢复**（除非桶开了多版本控制）。列对象用 `ListObjects`，配合 `--cli-query` 可以只取对象名清单。',
      examples: [
        { cmd: 'obsutil ls obs://prod-static/web/2024/ -limit=10', desc: '删之前先列出前缀下的对象，确认范围' },
        { cmd: 'obsutil cp obs://prod-backup/report/2025-01.xlsx ./ -f', desc: '把对象下载到本地' },
        { cmd: 'obsutil rm obs://prod-static/web/2024/ -r -f', desc: '递归删除（教学环境不会真的删）' },
        { cmd: 'hcloud OBS ListObjects --cli-region=cn-north-4 --bucket=<桶名> --cli-query="contents[*].key"', desc: '列出桶内对象名，确认要删的是哪个前缀' },
        { cmd: 'hcloud OBS GetObject --cli-region=cn-north-4 --bucket=<桶名> --key=report/2025-01.csv > 2025-01.csv', desc: '下载单个对象并重定向保存（二进制文件建议还是用 obsutil）' },
        { cmd: 'hcloud OBS DeleteObject --cli-region=cn-north-4 --bucket=<桶名> --key=web/old-index.html', desc: '删除单个对象，删前先确认路径正确' },
        { cmd: 'obsutil rm obs://<桶名>/web/2024/ -r -f', desc: '按前缀批量删除，比循环调 KooCLI 快得多（见 `hw-obsutil-rm`）' },
        { cmd: 'obsutil cp obs://<桶名>/report/2025-01.csv ./ -f', desc: '下载对象推荐用 obsutil，支持大文件与断点续传' }
      ],
      notes: [
        '**DeleteObject 删除后不可恢复**：执行前先用 `ListObjects` 或 `obsutil ls obs://<桶名>/<前缀> -limit=10` 核对范围',
        '`GetObject` 把内容直接打到标准输出，中文/二进制容易乱码或损坏；下载文件统一用 `obsutil cp`',
        '批量删除用 `obsutil rm -r -f`，但前缀写错会误删一大片，脚本里务必先把前缀变量 echo 出来确认',
        '删除对象不会立即释放存储费用（对象多、版本多时更明显），彻底清理建议配生命周期规则',
        '只读权限的 AK 调 `DeleteObject` 会返回 403，这是权限体系在正常工作，不要误判为命令写错'
      ],
      related: ['hw-obs-put-object', 'hw-obsutil-rm', 'hw-obsutil-ls', 'hw-obs-vs-obsutil'],
      docs: 'https://support.huaweicloud.com/obs/index.html',
      tags: ['OBS', '下载', '删除']
    },

    /* ---------- 18 / 71 ---------- */
    {
      id: 'hw-obs-vs-obsutil',
      name: 'hcloud OBS 与 obsutil 的差异（不要混用）',
      kind: 'recipe',
      alias: ['OBS 两种入口区别', 'hcloud OBS vs obsutil', 'obsutil 与 KooCLI'],
      level: 2,
      syntax: 'hcloud OBS <操作名> [参数]  ←→  obsutil <子命令> [选项]（两套语法，二选一）',
      summary: '把 hcloud OBS 与 obsutil 两套入口的语法差异摆清楚，避免照着一条抄错。',
      desc: '两者操作的是**同一批桶和对象**，但工具本身完全独立：`hcloud OBS` 是 KooCLI 按 OBS 接口元数据生成的操作（`ListBuckets`/`PutObject`，参数是 `--bucket=`/`--key=`，鉴权走 `hcloud configure`）；`obsutil` 是 OBS 专用传输工具（`ls`/`cp`/`sync`，参数是 `-i`/`-k`/`-e`/`-r`/`-f`，鉴权走 `obsutil config`）。',
      examples: [
        { cmd: 'hcloud OBS ListBuckets --cli-region=cn-north-4', desc: 'KooCLI 入口：动宾式操作名，复用 hcloud 的 AK/SK 配置' },
        { cmd: 'obsutil config -i=<你的AK> -k=<你的SK> -e=obs.cn-north-4.myhuaweicloud.com', desc: 'obsutil 入口：必须先单独配置一次 AK/SK 与 endpoint' },
        { cmd: 'obsutil ls -limit=10', desc: 'obsutil 入口：短子命令 + 短选项，和 hcloud 完全不同的写法' },
        { cmd: 'obsutil sync ./dist obs://<桶名>/web/ -dryRun', desc: '日常上传下载/同步一律用 obsutil（见 `hw-obsutil-sync`）' }
      ],
      notes: [
        '**两者语法完全不同，不能混用**：`hcloud OBS` 用长参数 `--bucket=`/`--key=`，`obsutil` 用短选项 `-r`/`-f`/`-j`；把 `--bucket` 写进 obsutil 或把 `-r` 写进 `hcloud OBS` 都会直接报参数错误',
        '**鉴权配置也是分开的两份**：`hcloud configure`（`~/.hcloud/config.json`）与 `obsutil config`（`.obsutilconfig`）；轮换 AK 时两个都要改，这是"KooCLI 好了但 obsutil 还报 403"的典型原因',
        '选择建议：管理类动作（建桶、桶策略、生命周期）看控制台或 `hcloud OBS`；**任何上传/下载/同步/大文件都用 `obsutil`**，它有并发、断点续传与结果清单',
        '区域表达方式不同：KooCLI 用 `--cli-region=cn-north-4`，obsutil 用 endpoint `-e=obs.cn-north-4.myhuaweicloud.com`，别把 region 直接填给 `-e`',
        '`hcloud OBS` 的操作名与参数随 OBS 接口版本变化，脚本里用之前先 `hcloud OBS <操作名> --help` 确认'
      ],
      related: ['hw-obsutil-config', 'hw-obsutil-sync', 'hw-obs-bucket', 'hw-obsutil-cp'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0001.html',
      tags: ['OBS', 'obsutil', '语法差异']
    },

    /* ================= D. VPC 与安全组 ================= */

    /* ---------- 19 / 71 ---------- */
    {
      id: 'hw-vpc-list',
      name: 'hcloud VPC ListVpcs / ListSubnets',
      alias: ['华为云查VPC', 'hcloud 查子网', 'VPC 列表'],
      level: 1,
      syntax: 'hcloud VPC ListVpcs --cli-region=<区域>  |  hcloud VPC ListSubnets --cli-region=<区域> [--vpc_id=<VPC ID>]',
      summary: '列出 VPC 与子网，确认机器在哪张网络里是排查连通性的第一步。',
      desc: '同一个区域可以有多个 VPC，VPC 内部再划子网。云服务器、RDS、ELB、CCE 节点都必须落在某个 VPC 的子网里，**不同 VPC 内网默认不通**（要打通得用对等连接或云连接）。排查"连不上"之前，先用这两条命令把拓扑画清楚。',
      examples: [
        { cmd: 'hcloud VPC ListVpcs --cli-region=cn-north-4 --cli-output=table', desc: '列出北京四的全部 VPC 与网段' },
        { cmd: 'hcloud VPC ListSubnets --cli-region=cn-north-4 --cli-query="subnets[*].{name:name,cidr:cidr,id:id}" --cli-output=table', desc: '列出所有子网及其网段' },
        { cmd: 'hcloud VPC ListSubnets --cli-region=cn-north-4 --vpc_id=<VPC ID> --cli-output=table', desc: '只看某个 VPC 下的子网' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[*].{name:name,addr:addresses}" --cli-output=json', desc: '看机器落在哪个网段，和上面的子网 CIDR 对照' }
      ],
      notes: [
        '**region 必须显式指定**：多区域环境下忘了 `--cli-region` 会查到配置里的默认区域，然后得到"机器不见了"的错觉',
        '子网 CIDR 决定可用 IP 数量，华为云会在每个子网内预留若干地址，实际可用数小于理论值',
        '安全组属于 VPC：同名的安全组在不同 VPC 里是两套东西，排查时先确认机器绑的是哪个',
        '默认 VPC 可以删，但删除前要先清空里面的资源；生产环境建议按环境划分 VPC（prod/test 各一张）',
        '子网内的私网 IP 只在 VPC 内可达，本地办公网访问需要 EIP、VPN 或专线'
      ],
      related: ['hw-vpc-create', 'hw-vpc-sg-list', 'hw-vpc-troubleshoot-port', 'hw-ecs-list'],
      docs: 'https://support.huaweicloud.com/clir-vpc/VPC-cli_v2.html',
      tags: ['VPC', '子网', '网络']
    },

    /* ---------- 20 / 71 ---------- */
    {
      id: 'hw-vpc-create',
      name: 'hcloud VPC CreateVpc / CreateSubnet',
      alias: ['华为云创建VPC', 'hcloud 创建子网', 'vpc create'],
      level: 2,
      syntax: 'hcloud VPC CreateVpc --vpc=\'{"name":"<VPC名>","cidr":"192.168.0.0/16"}\'  |  hcloud VPC CreateSubnet --subnet=\'{"name":"<子网名>","cidr":"192.168.1.0/24","gateway_ip":"192.168.1.1","vpc_id":"<VPC ID>"}\'',
      summary: '新建 VPC 与子网，网段一旦创建就不能改，规划要一次到位。',
      desc: 'VPC 是云上网络的边界，子网是划在 VPC 里的地址段。创建顺序是先 VPC 后子网。**VPC 的 CIDR 创建后不可修改**，所以网段规划要提前想清楚：与本地 IDC、其他 VPC、对端云都不能重叠，否则对等连接建不起来。',
      examples: [
        { cmd: 'hcloud VPC CreateVpc --cli-region=cn-north-4 --vpc=\'{"name":"vpc-prod","cidr":"192.168.0.0/16"}\'', desc: '创建一个 192.168.0.0/16 的生产 VPC' },
        { cmd: 'hcloud VPC ListVpcs --cli-region=cn-north-4 --cli-query="vpcs[?name==\'vpc-prod\'].id"', desc: '拿到刚建好的 VPC ID，下一步建子网要用' },
        { cmd: 'hcloud VPC CreateSubnet --cli-region=cn-north-4 --subnet=\'{"name":"subnet-web","cidr":"192.168.1.0/24","gateway_ip":"192.168.1.1","vpc_id":"<VPC ID>"}\'', desc: '在 VPC 里划一个 192.168.1.0/24 的子网' },
        { cmd: 'hcloud VPC CreateVpc --cli-region=cn-north-4 --cli-jsonInput=./create-vpc.json', desc: '参数多（多子网、多标签）时写成 JSON 文件' }
      ],
      notes: [
        '**网段规划一次到位**：VPC 的 CIDR 不能改，改网段等于重建 VPC + 迁移全部资源',
        '网段不要与本地 IDC、办公网、其他 VPC 重叠；重叠时对等连接、VPN、云连接都会失败或路由不可达',
        '子网的网关地址（`gateway_ip`）必须在子网 CIDR 范围内，不填通常由系统分配第一个可用地址',
        '每个 VPC 会自动生成默认路由表与默认安全组；**默认安全组基本不放行入方向**，建完机器记得加规则',
        '删 VPC 前要先删除内部资源（云服务器、ELB、RDS、CCE 等），否则会被依赖检查拦住',
        '生产建议每个环境一张 VPC，并用企业项目/标签做成本归集'
      ],
      related: ['hw-vpc-list', 'hw-vpc-sg-rule', 'hw-ecs-create'],
      docs: 'https://support.huaweicloud.com/clir-vpc/VPC-cli_v2.html',
      tags: ['VPC', '创建', '网段规划']
    },

    /* ---------- 21 / 71 ---------- */
    {
      id: 'hw-vpc-sg-list',
      name: 'hcloud VPC ListSecurityGroups / ListSecurityGroupRules',
      alias: ['华为云查安全组', 'hcloud 查看安全组规则', 'security group list'],
      level: 1,
      syntax: 'hcloud VPC ListSecurityGroups --cli-region=<区域>  |  hcloud VPC ListSecurityGroupRules --security_group_id=<安全组ID> --cli-region=<区域>',
      summary: '查安全组列表与规则明细，判断某个端口有没有被放行的直接依据。',
      desc: '安全组是 VPC 内的虚拟防火墙，作用在网卡上：一个云服务器可以绑多个安全组，规则取**并集**（任一安全组放行即通）。默认安全组的入方向通常只放行同组互访，所以"新机器端口不通"十有八九是没加规则。',
      examples: [
        { cmd: 'hcloud VPC ListSecurityGroups --cli-region=cn-north-4 --cli-output=table', desc: '列出当前区域的全部安全组' },
        { cmd: 'hcloud VPC ListSecurityGroupRules --cli-region=cn-north-4 --security_group_id=<安全组ID> --cli-output=table', desc: '查看某个安全组的全部规则（入方向 + 出方向）' },
        { cmd: 'hcloud VPC ListSecurityGroupRules --cli-region=cn-north-4 --security_group_id=<安全组ID> --cli-query="security_group_rules[?direction==\'ingress\'].{id:id,proto:protocol,port:port_range_min,remote:remote_ip_prefix}" --cli-output=table', desc: '只看入方向规则，快速判断端口是否放行' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[?name==\'web-01\'].id" --cli-output=tsv', desc: '先拿到机器 ID，再到控制台或接口里确认它绑了哪些安全组' }
      ],
      notes: [
        '安全组规则是**并集**：机器绑了 A、B 两个组，只要 A 放行了 443 就通——排查时容易只看了一个组就下结论',
        '安全组是**有状态**的：放行入方向后，对应的返回流量自动放行，不用为出方向另加规则',
        '规则分入方向（`ingress`）与出方向（`egress`），"端口不通"要查入方向；出方向默认全放行',
        '规则修改**立即生效**，不需要重启机器；但也意味着删错规则业务会立刻断',
        '安全组只管云上这一层，机器里的 `firewalld`/`iptables`/`ufw` 是第二道闸（见 `ln-troubleshoot-firewall`），两层都要看',
        '改规则前先 `--cli-output=json > sg-backup.json` 存档，出问题能对照恢复'
      ],
      related: ['hw-vpc-sg-rule', 'hw-vpc-troubleshoot-port', 'hw-vpc-list'],
      docs: 'https://support.huaweicloud.com/clir-vpc/VPC-cli_v2.html',
      tags: ['安全组', '规则', '排查']
    },

    /* ---------- 22 / 71 ---------- */
    {
      id: 'hw-vpc-sg-rule',
      name: 'hcloud VPC CreateSecurityGroupRule / DeleteSecurityGroupRule',
      alias: ['华为云放行端口', 'hcloud 添加安全组规则', '开放 443 端口'],
      level: 2,
      syntax: 'hcloud VPC CreateSecurityGroupRule --security_group_rule=\'{"security_group_id":"<安全组ID>","direction":"ingress","protocol":"tcp","port_range_min":443,"port_range_max":443,"remote_ip_prefix":"0.0.0.0/0"}\'  |  hcloud VPC DeleteSecurityGroupRule --security_group_rule_id=<规则ID>',
      summary: '建安全组并放行/删除端口规则，云上"端口不通"最常见的修复动作。',
      desc: '规则的关键字段：方向（`direction`）、协议（`protocol`）、端口范围（`port_range_min`/`port_range_max`）、源地址（`remote_ip_prefix`）。新建安全组用 `CreateSecurityGroup`，规则单独加。删规则要的是**规则 ID**，先用 `ListSecurityGroupRules` 查出来。',
      params: [
        { flag: 'direction', desc: '`ingress`（入方向）或 `egress`（出方向）' },
        { flag: 'protocol', desc: '`tcp`/`udp`/`icmp`/`any`；ICMP 用于 ping' },
        { flag: 'port_range_min / port_range_max', desc: '端口范围，放行单个端口时两者写同一个值' },
        { flag: 'remote_ip_prefix', desc: '源地址网段，如 `<公司出口IP>/32`；`0.0.0.0/0` 表示全网开放' },
        { flag: 'security_group_rule_id', desc: '删除规则时使用，先用 `ListSecurityGroupRules` 查' }
      ],
      examples: [
        { cmd: 'hcloud VPC ListSecurityGroupRules --cli-region=cn-north-4 --security_group_id=8a2c5b9d-2e4f-4a1c-8b5d-3e9f2a6c4b8d --cli-output=table', desc: '列安全组规则（教学环境里 sg-web 的 ID 就是这一串）' },
        { cmd: 'hcloud VPC ListSecurityGroups --cli-region=cn-north-4 --cli-output=table', desc: '先列安全组拿到 ID，再查它的规则 —— 规则查询必须带组 ID' },
        { cmd: 'hcloud VPC CreateSecurityGroup --cli-region=cn-north-4 --security_group=\'{"name":"sg-web","vpc_id":"<VPC ID>"}\'', desc: '先建一个专用安全组，别直接改默认安全组' },
        { cmd: 'hcloud VPC CreateSecurityGroupRule --cli-region=cn-north-4 --security_group_rule=\'{"security_group_id":"<安全组ID>","direction":"ingress","protocol":"tcp","port_range_min":443,"port_range_max":443,"remote_ip_prefix":"<公司出口IP>/32"}\'', desc: '只放行公司出口 IP 访问 443，生产推荐这种写法' },
        { cmd: 'hcloud VPC CreateSecurityGroupRule --cli-region=cn-north-4 --security_group_rule=\'{"security_group_id":"<安全组ID>","direction":"ingress","protocol":"icmp","remote_ip_prefix":"0.0.0.0/0"}\'', desc: '临时放行 ICMP 便于 ping 排障，排完记得删' },
        { cmd: 'hcloud VPC ListSecurityGroupRules --cli-region=cn-north-4 --security_group_id=<安全组ID> --cli-query="security_group_rules[*].[id,protocol,port_range_min]" --cli-output=tsv', desc: '查规则 ID，为删除做准备' },
        { cmd: 'hcloud VPC DeleteSecurityGroupRule --security_group_rule_id=<安全组规则ID> --cli-region=cn-north-4', desc: '删除规则；删错会导致业务立刻不通' }
      ],
      notes: [
        '**`0.0.0.0/0` 等于对全网开放**：生产只放行必要网段（如办公出口 IP `/32`、ELB 所在子网 CIDR），数据库端口绝对不要对全网开放',
        '`port_range_min` 与 `port_range_max` 一起给；只给一个容易被当成 0 或直接报参数错误',
        '放行 TCP 不等于 ping 得通：ICMP 是独立协议，要单独放行；反过来 ping 通了也不代表端口通',
        '改完规则**不用重启机器**，但要确认服务真的在监听：机器上 `ss -lntp` 看到 `0.0.0.0:443` 才算对外可访问（只监听 `127.0.0.1` 的话安全组放行也没用）',
        '删规则前把现有规则导出存档（`--cli-output=json > sg-rules.json`），删错了能照着加回来',
        'ELB 后面的后端机器也要放行 **ELB 所在网段** 到后端端口的流量，否则健康检查会失败（见 `hw-elb-health-check`）'
      ],
      related: ['hw-vpc-sg-list', 'hw-vpc-troubleshoot-port', 'hw-elb-health-check', 'hw-vpc-create'],
      docs: 'https://support.huaweicloud.com/clir-vpc/VPC-cli_v2.html',
      tags: ['安全组', '放行端口', '规则']
    },

    /* ---------- 23 / 71 ---------- */
    {
      id: 'hw-vpc-troubleshoot-port',
      name: '云上"端口不通"完整排查链路',
      kind: 'recipe',
      alias: ['安全组排查端口不通', '云主机端口打不开', 'EIP 不通排查'],
      level: 3,
      syntax: '（组合排查，按顺序执行）hcloud ECS ListServersDetails → hcloud VPC ListSecurityGroupRules → ss -lntp → systemctl status firewalld → nc -vz <EIP> <端口> → hcloud EIP ListPublicips',
      summary: '端口不通时按 EIP→安全组→本机防火墙→服务监听的顺序逐层排除。',
      desc: '云上"端口不通"几乎都出在四个地方：公网路径没通（EIP 没绑/带宽为 0）、安全组没放行、机器内防火墙拦截、服务根本没在监听。按下面的顺序从外到内跑一遍，每一步都能定位到具体一层，比反复改安全组高效得多。',
      examples: [
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[?name==\'web-01\'].{id:id,status:status,addresses:addresses}" --cli-output=json', desc: '① 确认机器在运行、拿到私网地址与机器 ID' },
        { cmd: 'hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query="publicips[*].{ip:public_ip_address,status:status}" --cli-output=table', desc: '② 确认 EIP 已绑定且状态正常（未绑定的通常是 `DOWN`）' },
        { cmd: 'hcloud VPC ListSecurityGroupRules --cli-region=cn-north-4 --security_group_id=<安全组ID> --cli-query="security_group_rules[?direction==\'ingress\'].{proto:protocol,port:port_range_min,remote:remote_ip_prefix}" --cli-output=table', desc: '③ 查入方向是否放行了目标端口与来源网段' },
        { cmd: 'ss -lntp | grep :443', desc: '④ 在机器上确认服务监听的是 `0.0.0.0:443` 而不是 `127.0.0.1:443`（见 `ln-ss`）' },
        { cmd: 'systemctl status firewalld; iptables -L -n', desc: '⑤ 检查机器内防火墙；云上安全组放行了但本机 iptables 拦着一样不通' },
        { cmd: 'nc -vz <云服务器弹性公网IP> 443', desc: '⑥ 从外部验证端口（Windows 上可用 `Test-NetConnection`）' },
        { cmd: 'tcpdump -i any port 443', desc: '⑦ 仍不通时抓包确认包有没有到网卡（见 `ln-tcpdump`）：到了是本机问题，没到是安全组/网络问题' }
      ],
      notes: [
        '顺序固定为「公网路径 → 安全组 → 本机防火墙 → 服务监听 → 应用本身」，**不要一上来就改安全组**，那是最容易改坏生产环境的一步',
        '`ping` 通不代表端口通：ICMP 与 TCP 是两条独立规则；反过来很多云环境禁 ICMP，ping 不通但服务正常',
        '安全组规则是**并集**，机器绑多个组时要全部看一眼；改规则前先导出存档',
        '服务只监听 `127.0.0.1` 是最常见的"安全组明明放行了却不通"：让应用监听 `0.0.0.0`，或用 Nginx 反代到本机端口',
        '同 VPC 内两台机器互访也受安全组管：排查内网连不上时同样要看入方向规则（源地址填对端网段或对端安全组）',
        'RDS/Redis 这类托管服务默认只开内网，公网访问要单独开启并加安全组，连不上时先确认连接地址用的是内网还是公网'
      ],
      related: ['hw-vpc-sg-rule', 'hw-vpc-sg-list', 'hw-ecs-eip-bind', 'hw-vpc-list'],
      docs: 'https://support.huaweicloud.com/vpc/index.html',
      tags: ['排查', '安全组', '端口']
    },

    /* ================= E. EVS 云硬盘 ================= */

    /* ---------- 24 / 71 ---------- */
    {
      id: 'hw-evs-list',
      name: 'hcloud EVS ListVolumes',
      alias: ['华为云查云硬盘', 'hcloud 查未挂载磁盘', 'evs list'],
      level: 1,
      syntax: 'hcloud EVS ListVolumes --cli-region=<区域> [--cli-query="<JMESPath>"] [--cli-output=table]',
      summary: '列出云硬盘与挂载关系，找出没挂载却一直在计费的盘。',
      desc: '返回里每块盘都带 `status` 与 `attachments`：`in-use` 表示已挂载（`attachments[].server_id` 是挂在哪台机器上），`available` 表示**未挂载但仍然计费**。这是账单巡检的核心命令之一，配合 `hw-flow-cost-idle` 使用。',
      examples: [
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-output=table', desc: '列出北京四的全部云硬盘' },
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query="volumes[?status==\'available\'].{id:id,name:name,size:size,type:volume_type}" --cli-output=table', desc: '只看未挂载的盘，这些是白花的钱' },
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query="volumes[*].{name:name,size:size,server:attachments[0].server_id}" --cli-output=table', desc: '看每块盘挂在哪台机器上，盘点挂载关系' },
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-east-3 --cli-output=table', desc: '换个 region 继续盘；账单是按区域分开的' }
      ],
      notes: [
        '**未挂载的云盘照样按容量与类型计费**，`available` 状态是成本排查的第一优先级',
        '`availability_zone` 决定这块盘能挂给哪台机器：EVS 盘与云服务器必须在**同一可用区**，跨 AZ 挂不上',
        '结果默认分页，盘多时同样要处理 `--limit`/`--offset`，否则盘点会漏',
        '删盘前确认：没有快照依赖、没有做成镜像、数据确实不需要；**删除后数据不可恢复**',
        '系统盘通常也出现在这个列表里（`attachments` 指向所属机器），不要误删跑着的机器的系统盘'
      ],
      related: ['hw-evs-create', 'hw-evs-attach-detach', 'hw-flow-cost-idle', 'hw-ecs-delete'],
      docs: 'https://support.huaweicloud.com/clir-evs/EVS-cli.html',
      tags: ['EVS', '云硬盘', '成本']
    },

    /* ---------- 25 / 71 ---------- */
    {
      id: 'hw-evs-create',
      name: 'hcloud EVS CreateVolume',
      alias: ['华为云创建云硬盘', 'hcloud 买数据盘', 'evs create'],
      level: 2,
      syntax: 'hcloud EVS CreateVolume --volume=\'{"name":"<盘名>","size":100,"volumetype":"GPSSD","availability_zone":"cn-north-4a"}\' --cli-region=<区域>',
      summary: '创建云硬盘，盘必须与云服务器在同一可用区才能挂载。',
      desc: '必备字段就四个：名称、容量（GB）、盘类型、可用区。盘类型影响 IOPS、吞吐与价格：通用型 SSD（`GPSSD`）是常见起步选择，数据库类业务选更高 IOPS 的类型（具体枚举以 `--help` 为准）。创建后按需计费**立即开始**，挂载是下一步（见 `hw-evs-attach-detach`）。',
      params: [
        { flag: '--volume=\'{...}\'', desc: '请求体，包含名称/容量/类型/可用区等字段' },
        { flag: 'size', desc: '容量，单位 GB；创建后**只能扩容不能缩容**' },
        { flag: 'volumetype', desc: '盘类型，如通用型 SSD（`GPSSD`）；枚举值以 `--help` 为准' },
        { flag: 'availability_zone', desc: '可用区，如 `cn-north-4a`，必须与目标云服务器一致' },
        { flag: 'snapshot_id / imageRef', desc: '从快照或镜像创建数据盘时使用，字段名以 `--help` 为准' }
      ],
      examples: [
        { cmd: 'hcloud ECS NovaListAvailabilityZones --cli-region=cn-north-4 --cli-output=table', desc: '先确认目标可用区（如 cn-north-4a）' },
        { cmd: 'hcloud EVS CreateVolume --cli-region=cn-north-4 --volume=\'{"name":"data-01","size":100,"volumetype":"GPSSD","availability_zone":"cn-north-4a"}\'', desc: '创建一个 100GB 通用型 SSD 数据盘' },
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query="volumes[?name==\'data-01\'].{id:id,status:status}"', desc: '拿到盘的 ID 并确认状态为 `available`' },
        { cmd: 'hcloud EVS AttachVolume --cli-region=cn-north-4 --volume_attachment=\'{"volume_id":"<云硬盘ID>","server_id":"<云服务器ID>","device":"/dev/sdb"}\'', desc: '创建完直接挂到机器上（挂载后还要在系统里格式化）' }
      ],
      notes: [
        '**盘与机器必须在同一可用区**，否则挂载必然失败；跨 AZ 使用只能靠应用层复制数据',
        '按需盘创建成功即开始计费，即使一直没挂载；临时测试用完记得删（见 `hw-flow-cost-idle`）',
        '容量只能扩不能缩：规划时宁可小步多次扩，也不要一次买太大',
        '系统盘与数据盘分开是通用最佳实践：数据盘便于单独扩容、做快照、迁移与回收',
        '创建后必须走完"分区 → 格式化 → 挂载 → 写 fstab"才真能用（见 `ls9-new-disk-flow`），漏了 fstab 重启后会掉盘'
      ],
      related: ['hw-evs-list', 'hw-evs-attach-detach', 'hw-evs-resize-growpart', 'hw-ecs-az-flavor'],
      docs: 'https://support.huaweicloud.com/clir-evs/EVS-cli.html',
      tags: ['EVS', '创建', '数据盘']
    },

    /* ---------- 26 / 71 ---------- */
    {
      id: 'hw-evs-attach-detach',
      name: 'hcloud EVS AttachVolume / DetachVolume',
      alias: ['华为云挂载云硬盘', 'hcloud 卸载云硬盘', 'evs attach'],
      level: 2,
      syntax: 'hcloud EVS AttachVolume --volume_attachment=\'{"volume_id":"<云硬盘ID>","server_id":"<云服务器ID>","device":"/dev/sdb"}\'  |  hcloud EVS DetachVolume --volume_id=<云硬盘ID>',
      summary: '把云硬盘挂到云服务器或从上面卸载，卸载前必须先在系统里 umount。',
      desc: '挂载只是把块设备接到虚拟机上，**系统里还要分区、格式化、挂载**才能用。卸载顺序反过来：先在操作系统里 `umount`，再从控制台/接口卸载，否则可能损坏文件系统。`device` 只是期望设备名的提示，虚拟化环境下实际盘符常见为 `/dev/vdb`，以 `lsblk` 为准。',
      examples: [
        { cmd: 'hcloud EVS AttachVolume --cli-region=cn-north-4 --volume_attachment=\'{"volume_id":"<云硬盘ID>","server_id":"<云服务器ID>","device":"/dev/sdb"}\'', desc: '把数据盘挂到目标机器' },
        { cmd: 'lsblk', desc: '在机器上确认新盘出现（见 `ls9-lsblk`），记下真实设备名' },
        { cmd: 'sudo mkfs.ext4 /dev/vdb && sudo mkdir -p /data && sudo mount /dev/vdb /data', desc: '分区格式化并挂载到 /data（新盘首次使用）' },
        { cmd: 'sudo umount /data && lsblk', desc: '卸载前先 umount，否则接口卸载会失败或丢数据' },
        { cmd: 'hcloud EVS DetachVolume --volume_id=<云硬盘ID> --cli-region=cn-north-4', desc: '再调接口卸载（不同版本参数名可能是 `volume_id` 或附件 ID，以 `--help` 为准）' }
      ],
      notes: [
        '顺序不能反：**先 `umount` 再调接口卸载**；直接卸载正在写的盘可能损坏文件系统',
        '`umount` 报 `target is busy` 时用 `lsof +f -- /data` 找出占用进程（见 `ln-lsof`），别用 `-f` 强卸',
        '挂载后写进 `/etc/fstab` 一定要用 **UUID**（`blkid` 查），用 `/dev/vdb` 这种盘符重启后可能错位',
        '系统盘不能卸载；同一块普通盘同一时间只能挂一台机器（共享盘除外）',
        '卸载后到接口里确认状态变回 `available`，再决定留着还是删除；留着的盘继续计费'
      ],
      related: ['hw-evs-list', 'hw-evs-create', 'hw-evs-resize-growpart'],
      docs: 'https://support.huaweicloud.com/clir-evs/EVS-cli.html',
      tags: ['EVS', '挂载', '卸载']
    },

    /* ---------- 27 / 71 ---------- */
    {
      id: 'hw-evs-resize-growpart',
      name: 'hcloud EVS ResizeVolume + growpart（云盘扩容）',
      kind: 'recipe',
      alias: ['华为云扩容云硬盘', 'hcloud 磁盘扩容', 'growpart resize2fs'],
      level: 3,
      syntax: 'hcloud EVS ResizeVolume --volume_id=<云硬盘ID> --os-extend=\'{"new_size":200}\' --cli-region=<区域>',
      summary: '扩容云硬盘并在系统里把分区与文件系统一起扩大，两步缺一不可。',
      desc: '云盘扩容分两步：控制台/接口把**块设备**变大（本命令），操作系统里再 `growpart` + `resize2fs`/`xfs_growfs` 把**分区与文件系统**变大。只做第一步时 `lsblk` 看到容量涨了、`df -h` 却纹丝不动，这是最典型的"扩了没用"。',
      examples: [
        { cmd: 'hcloud EVS ResizeVolume --volume_id=<云硬盘ID> --os-extend=\'{"new_size":200}\' --cli-region=cn-north-4', desc: '把云硬盘从当前容量扩到 200GB（字段名以 `--help` 为准）' },
        { cmd: 'lsblk', desc: '在机器上确认盘容量已经变大（见 `ls9-lsblk`）' },
        { cmd: 'sudo growpart /dev/vdb 1', desc: '把分区 1 扩到整块盘（见 `ls9-growpart`）；报 NOCHANGE 说明分区已到位' },
        { cmd: 'sudo resize2fs /dev/vdb1', desc: 'ext4 扩文件系统；XFS 用 `sudo xfs_growfs /data`（见 `ls9-xfs-growfs`）' },
        { cmd: 'df -h /data', desc: '确认文件系统可用空间已经变大' }
      ],
      notes: [
        '**扩容 ≠ 完成**：`growpart` + `resize2fs`/`xfs_growfs` 不做，应用看到的还是老容量；ext4 与 XFS 都支持在线扩容，不用卸载',
        '缩容不支持：买大了只能新建小盘再迁数据',
        '`new_size` 必须大于当前容量；扩容立即生效并按新容量计费',
        'LVM 场景要按 `pvresize` → `lvextend` → `resize2fs` 的顺序做（见 `ls9-lvm-extend`），不要直接对物理盘 `growpart`',
        '操作前建议先做快照（控制台或 `hcloud EVS --help` 里的快照相关操作），扩容中途断电/异常时能回滚',
        '扩容后记得回看监控与告警阈值：原本按 100GB 设的告警线要同步调整'
      ],
      related: ['hw-evs-list', 'hw-evs-attach-detach', 'hw-evs-create'],
      docs: 'https://support.huaweicloud.com/clir-evs/EVS-cli.html',
      tags: ['EVS', '扩容', 'growpart']
    },

    /* ================= F. ELB 弹性负载均衡 ================= */

    /* ---------- 28 / 71 ---------- */
    {
      id: 'hw-elb-list',
      name: 'hcloud ELB ListLoadBalancers/v3',
      alias: ['华为云查负载均衡', 'hcloud ELB 列表', 'elb list'],
      level: 2,
      syntax: 'hcloud ELB ListLoadBalancers/v3 --cli-region=<区域> [--cli-output=table]',
      summary: '列出负载均衡实例与后端健康状况，先确认是独享型还是共享型。',
      desc: 'ELB 有**共享型（v2）与独享型（v3）两套接口**，命令名不同（v3 是 `ListLoadBalancers/v3`）。查列表拿到 ELB ID 后，用 `ShowLoadBalancerStatus/v3` 看它下面挂了哪些监听器、后端服务器是否健康，这是排查"访问 502/504"最快的入口。',
      examples: [
        { cmd: 'hcloud ELB ListLoadBalancers/v3 --cli-region=cn-north-4 --cli-output=table', desc: '列出北京四的独享型负载均衡' },
        { cmd: 'hcloud ELB ListLoadBalancers/v3 --cli-region=cn-north-4 --cli-query="loadbalancers[*].{name:name,vip:vip_address,status:provisioning_status}" --cli-output=table', desc: '只取名称、私网 VIP 与状态' },
        { cmd: 'hcloud ELB ShowLoadBalancerStatus/v3 --loadbalancer_id=<ELB ID> --cli-region=cn-north-4', desc: '查看监听器与后端服务器的健康状态树，定位不健康的后端' },
        { cmd: 'hcloud ELB ListFlavors/v3 --cli-region=cn-north-4 --cli-output=table', desc: '查可用规格，创建 ELB 时需要规格 ID' }
      ],
      notes: [
        '**ELB 的操作名大小写不统一**（`CreateLoadBalancer` 与 `UpgradeLoadbalancer`、`CloneLoadbalancer` 并存），写脚本前用 `hcloud ELB --help` 核对，别凭感觉拼',
        '共享型与独享型是两套接口、两套命令；共享型命令参考见官方 CLI 参考（V2），混用会报"操作不存在"',
        'ELB 是**区域级**资源，跨 region 要换 `--cli-region`',
        '`ShowLoadBalancerStatus/v3` 返回每个后端的健康状态，比在控制台点来点去快得多；后端全不健康时先查健康检查配置（见 `hw-elb-health-check`）',
        '`DeleteLoadBalancerCascade/v3` 会连 EIP 一起删，属于破坏性操作，确认清楚再用'
      ],
      related: ['hw-elb-create-listener', 'hw-elb-health-check', 'hw-ecs-list'],
      docs: 'https://support.huaweicloud.com/clir-elb/elb-cli_v3.html',
      tags: ['ELB', '负载均衡', '查询']
    },

    /* ---------- 29 / 71 ---------- */
    {
      id: 'hw-elb-create-listener',
      name: 'hcloud ELB CreateLoadBalancer / CreateListener',
      alias: ['华为云创建负载均衡', 'hcloud 创建监听器', 'elb create'],
      level: 3,
      syntax: 'hcloud ELB CreateLoadBalancer/v3 --loadbalancer=\'{...}\'  |  hcloud ELB CreateListener/v3 --listener=\'{...}\'',
      summary: '创建独享型负载均衡与监听器，公网访问还要再绑定 EIP。',
      desc: '独享型 ELB 创建时必须给：名称、VPC、可用区列表、后端子网（`elb_virsubnet_ids`）、规格 ID（`l4_flavor_id`/`l7_flavor_id`）。监听器（listener）决定"前端用什么协议和端口接收流量"，HTTP/HTTPS 监听器还需要绑定后端服务器组，否则创建可能失败。字段名以 `--help` 为准。',
      examples: [
        { cmd: 'hcloud ELB ListFlavors/v3 --cli-region=cn-north-4 --cli-output=table', desc: '先取规格 ID（`l4_flavor_id`/`l7_flavor_id`）' },
        { cmd: 'hcloud ELB ListAvailabilityZones/v3 --cli-region=cn-north-4', desc: '查可用区，创建时要指定至少一个' },
        { cmd: 'hcloud ELB CreateLoadBalancer/v3 --cli-region=cn-north-4 --loadbalancer=\'{"name":"elb-web","vpc_id":"<VPC ID>","availability_zone_list":["cn-north-4a"],"elb_virsubnet_ids":["<子网ID>"],"l4_flavor_id":"<规格ID>"}\'', desc: '创建独享型 ELB（字段名以 `--help` 为准）' },
        { cmd: 'hcloud ELB CreateListener/v3 --cli-region=cn-north-4 --listener=\'{"name":"http-80","loadbalancer_id":"<ELB ID>","protocol":"HTTP","protocol_port":80}\'', desc: '为 ELB 添加 80 端口监听器' },
        { cmd: 'hcloud ELB ShowLoadBalancerTopology/v3 --loadbalancer_id=<ELB ID> --cli-region=cn-north-4', desc: '确认 ELB、监听器与后端组挂接关系' }
      ],
      notes: [
        '**独享型必须指定可用区与子网**：子网决定 ELB 的私网 IP 从哪儿来，选了机器访问不到的网段，业务就连不上',
        '公网型 ELB 需要绑定 EIP 才能被公网访问；只创建 ELB 而不绑 EIP，得到的是一个纯内网入口',
        'HTTP/HTTPS 监听器要绑定后端服务器组（pool）并指定后端端口；前端 80 转发到后端 8080 靠的是后端组配置，不是监听器',
        'HTTPS 监听器要挂证书：可用 `CreateCertificate/v3` 上传，或引用 CCM 上的证书',
        '创建失败常见原因：子网 IP 不足、配额用尽、规格与 AZ 不匹配；先用 `ShowQuota/v3` 看配额',
        '删 ELB 前先删监听器与后端组，或明确接受 `DeleteLoadBalancerForce/v3`、`DeleteLoadBalancerCascade/v3` 的连带删除范围'
      ],
      related: ['hw-elb-list', 'hw-elb-health-check', 'hw-vpc-create', 'hw-vpc-sg-rule'],
      docs: 'https://support.huaweicloud.com/clir-elb/elb-cli_v3.html',
      tags: ['ELB', '监听器', '创建']
    },

    /* ---------- 30 / 71 ---------- */
    {
      id: 'hw-elb-health-check',
      name: 'hcloud ELB CreateHealthMonitor/v3（健康检查）',
      kind: 'recipe',
      alias: ['华为云健康检查配置', 'hcloud ELB 后端不健康', 'healthmonitor'],
      level: 3,
      syntax: 'hcloud ELB CreateHealthMonitor/v3 --healthmonitor=\'{"pool_id":"<后端服务器组ID>","type":"HTTP","delay":5,"timeout":3,"max_retries":3,"url_path":"/healthz","expected_codes":"200"}\'',
      summary: '配置后端健康检查，参数写错会让后端被误摘除导致业务 502。',
      desc: '健康检查参数决定 ELB 多久探测一次、多久算超时、连续失败几次就摘除后端：`delay` 是探测间隔、`timeout` 是单次超时、`max_retries` 是连续失败次数上限。HTTP 类型按返回码判断，所以 `url_path` 与 `expected_codes` 必须与后端应用实际行为一致。',
      params: [
        { flag: 'pool_id', desc: '后端服务器组 ID，从控制台或 `ShowLoadBalancerStatus/v3` 的返回里取' },
        { flag: 'type', desc: '探测协议：`TCP`/`HTTP`/`HTTPS` 等' },
        { flag: 'delay / timeout / max_retries', desc: '探测间隔（秒）/ 单次超时（秒）/ 连续失败次数' },
        { flag: 'url_path / expected_codes', desc: 'HTTP 探测路径与期望返回码，如 `/healthz` 与 `200`' }
      ],
      examples: [
        { cmd: 'hcloud ELB ShowLoadBalancerStatus/v3 --loadbalancer_id=d3f7a1c9-5b2e-4d8a-9c1f-7e6b3a0d5c24 --cli-region=cn-north-4', desc: '看后端健康状态：能直接看到两个后端里有一个是 **OFFLINE**' },
        { cmd: 'hcloud ELB ListHealthMonitors --cli-region=cn-north-4 --cli-output=table', desc: '看健康检查参数：探哪个路径、多久探一次、几次失败判离线' },
        { cmd: 'curl -s http://127.0.0.1:8080/health', desc: '对照：后端进程自己是活着的 —— "机器在跑"和"网关认为它在跑"是两件事' },
        { cmd: 'hcloud ELB ShowLoadBalancerStatus/v3 --loadbalancer_id=<ELB ID> --cli-region=cn-north-4', desc: '先看当前后端状态与所属后端组' },
        { cmd: 'hcloud ELB CreateHealthMonitor/v3 --cli-region=cn-north-4 --healthmonitor=\'{"pool_id":"<后端服务器组ID>","type":"HTTP","delay":5,"timeout":3,"max_retries":3,"url_path":"/healthz","expected_codes":"200"}\'', desc: '创建 HTTP 健康检查（字段名以 `--help` 为准）' },
        { cmd: 'curl -v http://127.0.0.1:8080/healthz', desc: '在**后端机器上**自测探测路径，返回码与响应体是否符合预期' },
        { cmd: 'hcloud VPC ListSecurityGroupRules --cli-region=cn-north-4 --security_group_id=<后端安全组ID> --cli-output=table', desc: '确认后端安全组放行了 ELB 所在网段到后端端口的流量，否则健康检查永远失败' }
      ],
      notes: [
        '健康检查探测的是**后端真实监听的端口与路径**：`url_path` 写错、返回码不在 `expected_codes` 里、后端只监听 `127.0.0.1`，都会让后端被摘除',
        '`delay` × `max_retries` 决定了故障发现时间，也决定了恢复时间；太长故障切换慢，太短容易因抖动误摘',
        'HTTPS 健康检查还要看证书是否有效；证书过期会直接判不健康',
        '后端全不健康时的排查顺序：后端机器上 `curl` 自测 → 后端安全组是否放行 ELB 网段 → 后端服务是否监听 `0.0.0.0` → 健康检查配置本身',
        '健康检查是 ELB 主动发起，与真实用户流量无关；它持续产生请求，后端日志里看到规律性探测请求是正常的',
        '改完健康检查参数后观察一轮 `ShowLoadBalancerStatus/v3`，确认后端状态回到健康再收工'
      ],
      related: ['hw-elb-list', 'hw-elb-create-listener', 'hw-vpc-sg-rule'],
      docs: 'https://support.huaweicloud.com/clir-elb/elb-cli_v3.html',
      tags: ['ELB', '健康检查', '后端']
    },

    /* ================= G. RDS 关系型数据库 ================= */

    /* ---------- 31 / 71 ---------- */
    {
      id: 'hw-rds-list',
      name: 'hcloud RDS ListInstances',
      alias: ['华为云查数据库实例', 'hcloud RDS 列表', 'rds list'],
      level: 1,
      syntax: 'hcloud RDS ListInstances --cli-region=<区域> [--cli-query="<JMESPath>"] [--cli-output=table]',
      summary: '列出数据库实例与状态，RDS 不能 SSH，只能从同 VPC 的机器连库。',
      desc: 'RDS 是托管数据库：一台"实例"在控制台上是数据库引擎的实例（可能包含主备两个节点），不是一台能登录的虚拟机。它默认只开内网，**必须从同一 VPC 内的机器用 `mysql`/`psql` 等客户端连接**。查列表拿实例 ID 与连接地址是后续所有操作的前提。',
      examples: [
        { cmd: 'hcloud RDS ListInstances --cli-region=cn-north-4 --cli-output=table', desc: '列出北京四的全部 RDS 实例' },
        { cmd: 'hcloud RDS ListInstances --cli-region=cn-north-4 --cli-query="instances[*].{name:name,status:status,type:type,id:id}" --cli-output=table', desc: '看名称、状态、类型（单机/主备）与实例 ID' },
        { cmd: 'hcloud RDS ListInstances --cli-region=cn-north-4 --cli-query="instances[?status==\'ACTIVE\'].name"', desc: '只看状态正常的实例（`ACTIVE` 是可用状态）' },
        { cmd: 'mysql -h <RDS内网地址> -P 3306 -u <数据库用户> -p', desc: '从同 VPC 的云服务器上连库；RDS 不提供 SSH 登录' }
      ],
      notes: [
        '**RDS 不能 SSH**：登录数据库只能走客户端工具，连不上先查网络与安全组，不要试图登录主机',
        'RDS 默认只开**内网访问**，公网访问要单独开启并配安全组；连接地址用内网域名的话，客户端必须在同 VPC',
        '实例状态 `ACTIVE` 才是可用；`FROZEN` 通常与欠费/到期有关，`REBOOTING`/`MODIFYING` 是过渡态',
        '数据库端口、参数组、备份策略都是实例级配置，改之前先确认业务低峰期',
        '实例 ID 在脚本里比名称更可靠（名称可以重名或改名）',
        '多区域盘点同样要逐 region 跑 `--cli-region`'
      ],
      related: ['hw-rds-create', 'hw-rds-power-backup', 'hw-vpc-list'],
      docs: 'https://support.huaweicloud.com/rds/index.html',
      tags: ['RDS', '数据库', '查询']
    },

    /* ---------- 32 / 71 ---------- */
    {
      id: 'hw-rds-create',
      name: 'hcloud RDS CreateInstance',
      alias: ['华为云创建数据库', 'hcloud 买 RDS', 'rds create'],
      level: 3,
      syntax: 'hcloud RDS CreateInstance --cli-region=<区域> --cli-jsonInput=<创建参数JSON>',
      summary: '创建 RDS 实例，VPC、子网与安全组选错会导致应用连不上库。',
      desc: '创建 RDS 要同时定下：引擎与版本（`datastore`）、规格（`flavor_ref`）、存储（`volume`）、VPC 与子网、安全组、初始密码与端口。参数多且嵌套，**强烈建议用 `--cli-jsonInput`**。VPC 与子网决定了哪些云服务器能内网访问它，这是创建时最容易选错、后期最难改的一项。',
      params: [
        { flag: '--cli-jsonInput=<文件>', desc: '把创建参数写成 JSON 文件，避免命令行转义地狱' },
        { flag: '--name=<实例名称>', desc: '实例名称，账号内建议唯一，便于脚本识别' },
        { flag: '--datastore=\'{...}\'', desc: '引擎与版本，如 `{"type":"MySQL","version":"8.0"}`' },
        { flag: '--flavor_ref=<规格ID>', desc: '实例规格 ID，决定 CPU/内存' },
        { flag: '--volume=\'{...}\'', desc: '存储类型与容量，如 `{"type":"CLOUDSSD","size":100}`（枚举值以 `--help` 为准）' },
        { flag: '--vpc_id / --subnet_id / --security_group_id', desc: '网络三件套，决定谁能连到它' }
      ],
      examples: [
        { cmd: 'hcloud VPC ListVpcs --cli-region=cn-north-4 --cli-query="vpcs[*].{name:name,id:id}" --cli-output=table', desc: '先选好 VPC（要和访问它的云服务器在同一个）' },
        { cmd: 'hcloud VPC ListSubnets --cli-region=cn-north-4 --vpc_id=<VPC ID> --cli-output=table', desc: '再选子网，注意剩余可用 IP 数' },
        { cmd: 'hcloud RDS CreateInstance --cli-region=cn-north-4 --cli-jsonInput=./create-rds.json', desc: '用 JSON 文件创建实例（推荐）' },
        { cmd: 'hcloud RDS CreateInstance --cli-region=cn-north-4 --name=<实例名称> --datastore=\'{"type":"MySQL","version":"8.0"}\' --flavor_ref=<规格ID> --volume=\'{"type":"CLOUDSSD","size":100}\' --vpc_id=<VPC ID> --subnet_id=<子网ID> --security_group_id=<安全组ID> --password=<数据库密码> --port=3306', desc: '命令行直传参数（字段名与枚举值以 `--help` 为准）' }
      ],
      notes: [
        '**VPC 选错是最贵的错误**：RDS 建好之后换 VPC 基本等于重建 + 迁移数据；创建前先确认应用所在的 VPC 与子网',
        '安全组默认不放行 3306/5432，创建后要加规则：源地址填应用所在子网网段，不要对 `0.0.0.0/0` 开放数据库端口',
        '主备（`ha`）模式才有高可用，单机版故障恢复要等；生产库别省这一项',
        '一定要配置自动备份（`backup_strategy`），**没有备份的数据库等于裸奔**；备份保留天数按合规要求设置',
        '密码要满足复杂度要求（通常含大小写字母、数字、特殊字符，长度 8~32 位），且**不要写进脚本提交到 Git**',
        '创建成功即开始计费，规格买大了当天就开始烧钱；先按业务量估规格，后续再变更'
      ],
      related: ['hw-rds-list', 'hw-rds-power-backup', 'hw-vpc-create', 'hw-vpc-sg-rule'],
      docs: 'https://support.huaweicloud.com/rds/index.html',
      tags: ['RDS', '创建', 'VPC']
    },

    /* ---------- 33 / 71 ---------- */
    {
      id: 'hw-rds-power-backup',
      name: 'hcloud RDS StartInstance / StopInstance / ShowBackupPolicy',
      alias: ['华为云启停数据库', 'hcloud 查询备份策略', 'RDS 停机'],
      level: 2,
      syntax: 'hcloud RDS ShowBackupPolicy --instance_id=<实例ID>  |  hcloud RDS StopInstance --instance_id=<实例ID>  |  hcloud RDS StartInstance --instance_id=<实例ID>',
      summary: '启停数据库实例并检查自动备份策略，停机省钱但别省掉备份。',
      desc: '`ShowBackupPolicy` 查自动备份的时间窗与保留天数，是例行巡检的必查项；`StopInstance`/`StartInstance` 用于临时停机（如测试环境夜间停库省钱）。停机**不会**停止存储计费，也**不会**自动做备份。',
      examples: [
        { cmd: 'hcloud RDS ListInstances --cli-region=cn-north-4 --cli-query="instances[*].[id,name,status]" --cli-output=tsv', desc: '先拿实例 ID（教学环境里是 rds-order-prod）' },
        { cmd: 'hcloud RDS ShowBackupPolicy --instance_id=rds-3f2a9c1e --cli-region=cn-north-4', desc: '看保留天数与备份窗口 —— 合规检查要的正是这两个值' },
        { cmd: 'hcloud RDS ShowBackupPolicy --instance_id=<实例ID> --cli-region=cn-north-4', desc: '查看自动备份策略：备份时间窗与保留天数' },
        { cmd: 'hcloud RDS ListInstances --cli-region=cn-north-4 --cli-query="instances[?id==\'<实例ID>\'].{name:name,status:status}"', desc: '操作前确认实例当前状态（过渡态下操作会失败）' },
        { cmd: 'hcloud RDS StopInstance --instance_id=<实例ID> --cli-region=cn-north-4', desc: '停止实例；生产库操作前确认业务已切换或已停服' },
        { cmd: 'hcloud RDS StartInstance --instance_id=<实例ID> --cli-region=cn-north-4', desc: '重新启动实例，业务恢复后核对连接与慢查询' }
      ],
      notes: [
        '**停机不省存储费**：计算资源停收，云盘存储继续计费（以费用中心账单为准）；想彻底省钱要么删实例（先备份），要么降规格',
        '停机期间**自动备份不会执行**，长期停机的实例一定要先取一次手动备份',
        '生产库不要随手停：主备实例会主备一起停，应用侧会立刻大量报连接错误',
        '`ShowBackupPolicy` 显示没有自动备份时，去控制台补上策略或用接口设置（`hcloud RDS --help` 里找 backup/policy 相关操作）',
        '恢复备份通常**新建一个实例**而不是覆盖原实例，恢复后记得改应用连接串并做数据核对',
        '删除实例前先确认备份是否随实例一起释放、是否需要先下载备份到 OBS'
      ],
      related: ['hw-rds-list', 'hw-rds-create'],
      docs: 'https://support.huaweicloud.com/api-rds/rds_09_0003.html',
      tags: ['RDS', '备份', '启停']
    },

    /* ================= H. 镜像服务与 IAM ================= */

    /* ---------- 34 / 71 ---------- */
    {
      id: 'hw-ims-list-images',
      name: 'hcloud IMS ListImages',
      alias: ['华为云查镜像', 'hcloud 查询公共镜像', 'ims list images'],
      level: 1,
      syntax: 'hcloud IMS ListImages --cli-region=<区域> [--cli-query="<JMESPath>"] [--cli-output=table]',
      summary: '查镜像列表拿 imageRef，镜像 ID 与区域绑定，不能跨区复用。',
      desc: '创建云服务器时的 `imageRef` 就是从这里查到的镜像 ID。镜像分为公共镜像（华为云提供）、私有镜像（自己做的）、共享镜像与市场镜像。**镜像 ID 与区域绑定**：北京四的公共镜像 ID 拿到上海一去用一定失败。',
      examples: [
        { cmd: 'hcloud IMS ListImages --cli-region=cn-north-4 --cli-output=table', desc: '列出北京四的镜像' },
        { cmd: 'hcloud IMS ListImages --cli-region=cn-north-4 --cli-query="images[*].{name:name,id:id,os:os_version}" --cli-output=table', desc: '取镜像名称、ID 与操作系统版本' },
        { cmd: 'hcloud IMS ListImages --cli-region=cn-north-4 --cli-query="images[?status==\'active\'].{name:name,id:id}" --cli-output=json', desc: '只看可用状态（`active`）的镜像' },
        { cmd: 'hcloud ECS CreatePostPaidServers --cli-region=cn-north-4 --cli-jsonInput=./create-ecs.json', desc: '把选好的镜像 ID 填进创建参数（见 `hw-ecs-create`）' }
      ],
      notes: [
        '**镜像 ID 不能跨区域复用**：同名的公共镜像在北京四与上海一的 ID 不同，脚本里不要写死跨区 ID',
        '鲲鹏（ARM）规格必须配 ARM 架构镜像，x86 镜像创建 ARM 机器会失败',
        '按镜像类型（公共/私有/共享/市场）过滤的参数名以 `hcloud IMS ListImages --help` 为准',
        '镜像列表条目很多，先用 `--cli-query` 过滤再输出，别一次 `table` 刷屏',
        '自制镜像记得打标签与备注（镜像描述），半年后很难分辨哪个是谁做的'
      ],
      related: ['hw-ecs-create', 'hw-ecs-az-flavor', 'hw-flow-cloud-init'],
      docs: 'https://support.huaweicloud.com/ims/index.html',
      tags: ['IMS', '镜像', 'imageRef']
    },

    /* ---------- 35 / 71 ---------- */
    {
      id: 'hw-iam-user',
      name: 'hcloud IAM CreateUser / ListUsers',
      alias: ['华为云创建子用户', 'hcloud IAM 用户列表', 'iam create user'],
      level: 2,
      syntax: 'hcloud IAM CreateUser --user=\'{"name":"<子用户名>","domain_id":"<账号ID>","password":"<初始密码>"}\'  |  hcloud IAM ListUsers',
      summary: '创建与查看 IAM 子用户，日常运维不该用主账号的 AK/SK。',
      desc: 'IAM 子用户（用户）归属于某个账号（`domain_id`），登录名在账号内唯一。创建只是第一步：**必须授权**（加到用户组或直接绑策略），否则子用户登录后什么都看不到。云上安全的第一原则就是"主账号只用来管人，干活一律用子用户"。',
      examples: [
        { cmd: 'hcloud IAM CreateUser --cli-region=cn-north-4 --user=\'{"name":"ops-user","domain_id":"<账号ID>","password":"<初始密码>","description":"运维子用户"}\'', desc: '创建一个运维子用户（字段名以 `--help` 为准）' },
        { cmd: 'hcloud IAM ListUsers --cli-region=cn-north-4 --cli-query="users[*].{name:name,id:id,enabled:enabled}" --cli-output=table', desc: '列出全部子用户，看谁被停用了' },
        { cmd: 'hcloud IAM ListUsers --cli-region=cn-north-4 --cli-output=table', desc: '表格输出，人工核对账号成员' },
        { cmd: 'hcloud IAM ListPermanentAccessKeys --cli-region=cn-north-4 --user_id=<IAM用户ID>', desc: '查看某个子用户有几把永久 AK（见 `hw-iam-aksk-leak`）' }
      ],
      notes: [
        '**创建后必须授权**：不加策略的子用户登录后看不到任何资源，"建了用户却什么都没权限"是常见困惑',
        '权限最小化：按需给只读或指定服务的策略，别一上来给 Administrator',
        '主账号（账号级）AK/SK 权限最大，泄露影响面也最大；CI/CD、脚本、监控一律用子用户或临时凭证',
        '子用户的**登录密码与 AK/SK 是两套凭据**：控制台登录用密码，调 API 用 AK/SK，在"我的凭证"里各自管理',
        '子用户默认不能自行创建 AK/SK，需要管理员放开对应权限',
        'IAM 是**全局级服务**（控制台上不分区域），KooCLI 里仍要带 `--cli-region`；若报 endpoint 相关错误，换 `cn-north-1` 再试（该区域是 IAM 文档的常用示例区域）'
      ],
      related: ['hw-iam-agency', 'hw-iam-aksk-leak', 'hw-cross-aksk-best-practice'],
      docs: 'https://support.huaweicloud.com/api-iam/iam_08_0015.html',
      tags: ['IAM', '子用户', '权限']
    },

    /* ---------- 36 / 71 ---------- */
    {
      id: 'hw-iam-agency',
      name: 'hcloud IAM CreateAgency（委托）',
      kind: 'recipe',
      alias: ['华为云创建委托', 'hcloud IAM agency', '临时凭证 STS'],
      level: 3,
      syntax: 'hcloud IAM CreateAgency --agency=\'{"name":"<委托名>","domain_id":"<账号ID>","trust_domain_id":"<被委托账号ID>","duration":"ONEDAY"}\'',
      summary: '创建委托，让云服务用临时凭证访问其他服务而不是长期 AK。',
      desc: '委托（agency）解决的是"**云服务代替你操作其他云服务**"的授权问题：例如 ECS 上的应用要读写 OBS、CES 要把告警投递到 SMN，都应该用委托而不是把长期 AK/SK 塞进配置文件。委托生效后可以换取**临时 AK/SK**，有效期短、泄露风险小。',
      examples: [
        { cmd: 'hcloud IAM CreateAgency --cli-region=cn-north-4 --agency=\'{"name":"ecs-obs-agency","domain_id":"<账号ID>","trust_domain_id":"<被委托账号ID>","duration":"ONEDAY"}\'', desc: '创建一个委托（字段名与枚举值以 `--help` 为准）' },
        { cmd: 'hcloud IAM ListAgencies --cli-region=cn-north-4 --cli-output=table', desc: '查看已有委托与信任关系' },
        { cmd: 'hcloud IAM ListUsers --cli-region=cn-north-4 --cli-query="users[*].name"', desc: '核对委托与子用户的边界，避免权限重叠' }
      ],
      notes: [
        '委托创建后**还要授权**：给委托绑定策略，否则一样没有权限，只是"有身份没权力"',
        '`duration` 是临时凭证的最长有效期（如 `ONEDAY`/`FOREVER` 之类枚举，具体值以 `--help` 为准）：**能短则短**，长期有效的委托等于长期 AK',
        '被委托方是另一个账号时用 `trust_domain_id` 指定；同账号内给云服务用则填自己的账号 ID',
        '用临时凭证时不要忘记 securitytoken：KooCLI/obsutil 都需要三个值（AK、SK、token）成套使用',
        '定期审计委托列表：离职项目留下的委托是典型的权限残留，删掉长期不用的'
      ],
      related: ['hw-iam-user', 'hw-iam-aksk-leak', 'hw-hcloud-config-set'],
      docs: 'https://support.huaweicloud.com/iam/index.html',
      tags: ['IAM', '委托', '临时凭证']
    },

    /* ---------- 37 / 71 ---------- */
    {
      id: 'hw-iam-aksk-leak',
      name: 'AK/SK 泄露应急响应（查密钥 → 停用 → 新建 → 改配置）',
      kind: 'recipe',
      alias: ['华为云 AK 泄露怎么办', '密钥轮换', '停用访问密钥'],
      level: 3,
      syntax: 'hcloud IAM ListPermanentAccessKeys → UpdatePermanentAccessKey（置为 inactive）→ CreatePermanentAccessKey → 替换所有调用方配置',
      summary: 'AK/SK 泄露后的处置顺序：先停用止血，再新建替换，最后审计滥用。',
      desc: 'AK/SK 一旦进了 Git、日志或聊天记录，就等于把账号交出去。处置顺序**不能反**：先停用泄露的那把密钥止血，再新建一把替换掉所有调用方（CI、脚本、`~/.hcloud/config.json`、`.obsutilconfig`、Terraform），最后回头审计这段时间有没有被滥用。',
      examples: [
        { cmd: 'hcloud IAM ListPermanentAccessKeys --cli-region=cn-north-4 --user_id=<IAM用户ID>', desc: '① 查出该用户的所有永久访问密钥，确认哪把泄露了' },
        { cmd: 'hcloud IAM UpdatePermanentAccessKey --access_key=<泄露的AK> --user_id=<IAM用户ID> --credential=\'{"status":"inactive"}\' --cli-region=cn-north-4', desc: '② 立即停用泄露的密钥（止血）；参数结构以 `--help` 为准' },
        { cmd: 'hcloud IAM CreatePermanentAccessKey --user_id=<IAM用户ID> --credential=\'{"description":"rotated-2026-02"}\' --cli-region=cn-north-4 --cli-output=json', desc: '③ 新建一把密钥，返回值里带新的 AK/SK，当场保存' },
        { cmd: 'hcloud configure set --cli-profile=default --cli-access-key=<新AK> --cli-secret-key=<新SK> --cli-region=cn-north-4', desc: '④ 替换 KooCLI 的本地配置' },
        { cmd: 'obsutil config -i=<新AK> -k=<新SK> -e=obs.cn-north-4.myhuaweicloud.com', desc: '④ 替换 obsutil 的配置（两套配置是分开的，别漏）' },
        { cmd: 'cd /data/app && git log -S "<泄露的AK>" --oneline --all', desc: '⑤ 找出哪个提交把密钥写进了仓库，彻底清理并加 pre-commit 检查' }
      ],
      notes: [
        '**顺序不能反**：先 `inactive` 止血再新建；只新建不失效旧密钥等于没处置，攻击者手里那把照样能用',
        '**删掉 Git 里的文件不等于安全**：历史提交、fork、CI 日志里都还在，唯一正确的做法是**换密钥**，而不是删文件',
        'AK/SK 绝不硬编码：本手册示例统一写 `<你的AK>`/`<你的SK>`，真实值只能来自控制台"我的凭证"或临时凭证；**不要提交到 Git**',
        '优先用 IAM 子用户 + 最小权限策略，更推荐委托（agency）换取的临时 AK/SK，有效期短、泄露面小（见 `hw-iam-agency`）',
        '轮换后把**所有调用方**过一遍：`~/.hcloud/config.json`、`.obsutilconfig`、CI/CD 变量、Terraform、监控脚本、堡垒机、备份工具；漏一个就会出现"部分任务突然 403"',
        '事后审计：在云审计（CTS）里查异常时间段的 API 调用，在费用中心看有没有陌生区域的资源创建与流量；有异常立即提工单并保留证据',
        '日常预防：给密钥设到期提醒、定期轮换（90 天是常见基线）、一人一把密钥便于单独吊销'
      ],
      related: ['hw-iam-user', 'hw-iam-agency', 'hw-hcloud-config-set', 'hw-obsutil-config', 'hw-cross-aksk-best-practice'],
      docs: 'https://support.huaweicloud.com/iam/index.html',
      tags: ['IAM', 'AK/SK', '应急响应']
    },

    /* ================= I. CES 云监控 ================= */

    /* ---------- 38 / 71 ---------- */
    {
      id: 'hw-ces-list-metrics',
      name: 'hcloud CES ListMetrics',
      alias: ['华为云查监控指标', 'hcloud CES 指标列表', 'list metrics'],
      level: 2,
      syntax: 'hcloud CES ListMetrics --namespace=<命名空间> [--cli-region=<区域>] [--cli-output=table]',
      summary: '列出某个服务命名空间下有哪些监控指标与维度，取数前的第一步。',
      desc: 'CES 的指标用**命名空间 + 指标名 + 维度**三层定位。命名空间按服务划分：`SYS.ECS`（云服务器）、`SYS.EVS`（云硬盘）、`SYS.ELB`、`SYS.RDS`、`SYS.OBS`、`SYS.VPC` 等。先用这条命令看清有哪些指标、每个指标带哪些维度，再决定 `ShowMetricData` 怎么传参。',
      examples: [
        { cmd: 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.ECS --cli-output=table', desc: '列出云服务器的全部监控指标' },
        { cmd: 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.ECS --cli-query="metrics[*].{name:metric_name,unit:unit}" --cli-output=table', desc: '只看指标名与单位' },
        { cmd: 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.ECS --cli-query="metrics[?metric_name==\'cpu_util\'].dimensions"', desc: '看 CPU 指标需要哪些维度（通常是 `instance_id`）' },
        { cmd: 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.EVS --cli-query="metrics[*].metric_name"', desc: '换命名空间查云硬盘指标' }
      ],
      notes: [
        '命名空间写错就查不到任何指标（**不报错，只是空列表**），服务与命名空间的对应关系见官方文档或控制台',
        '`dimensions` 是取数的关键：不知道维度名与维度值格式，`ShowMetricData` 一定取不到数据',
        '监控数据有保留期，不同粒度保留时长不同；要长期留存得自己导出或做聚合',
        '实例刚创建时指标可能还没上报，等几分钟再查',
        '只查指标定义不产生费用；查询监控数据本身也不额外计费'
      ],
      related: ['hw-ces-show-metric-data', 'hw-ecs-list'],
      docs: 'https://support.huaweicloud.com/api-ces/ces_03_0001.html',
      tags: ['CES', '监控', '指标']
    },

    /* ---------- 39 / 71 ---------- */
    {
      id: 'hw-ces-show-metric-data',
      name: 'hcloud CES ShowMetricData',
      alias: ['华为云查监控数据', 'hcloud CES 取指标数据', 'show metric data'],
      level: 3,
      syntax: 'hcloud CES ShowMetricData --namespace=<命名空间> --metric_name=<指标名> --dim.0=<维度名>,<维度值> --filter=<聚合方式> --period=<粒度秒> --from=<起始毫秒> --to=<结束毫秒>',
      summary: '按指标、维度与时间段取监控数据，排障时用命令行比控制台快。',
      desc: 'CES 的维度参数是数组形式：`--dim.0=instance_id,<云服务器ID>`，格式是「维度名,维度值」，多个维度依次写 `--dim.0`、`--dim.1`。时间戳是**毫秒**，`period` 只能是固定几档（300/1200/3600/14400/86400 秒），`filter` 常用 `average`（均值）与 `max`（峰值）。',
      params: [
        { flag: '--namespace=<命名空间>', desc: '服务命名空间，如 `SYS.ECS`' },
        { flag: '--metric_name=<指标名>', desc: '指标名，如 `cpu_util`；先用 `ListMetrics` 确认' },
        { flag: '--dim.0=<维度名>,<维度值>', desc: '维度，格式「名字,值」，如 `instance_id,<云服务器ID>`' },
        { flag: '--filter=average|max|min|sum', desc: '聚合方式；排障看峰值用 `max`，看整体水位用 `average`' },
        { flag: '--period=300|1200|3600|14400|86400', desc: '聚合粒度（秒），跨度越大越要用粗粒度' },
        { flag: '--from / --to', desc: '起止时间，**毫秒**时间戳' }
      ],
      examples: [
        { cmd: 'date +%s000', desc: '拿当前时间的毫秒时间戳（示例值 1735689600000 对应 2025-01-01 00:00 UTC）' },
        { cmd: 'hcloud CES ShowMetricData --cli-region=cn-north-4 --namespace=SYS.ECS --metric_name=cpu_util --dim.0=instance_id,<云服务器ID> --filter=average --period=300 --from=1735689600000 --to=1735776000000', desc: '取一天的 CPU 平均使用率（5 分钟粒度）' },
        { cmd: 'hcloud CES ShowMetricData --cli-region=cn-north-4 --namespace=SYS.ECS --metric_name=cpu_util --dim.0=instance_id,<云服务器ID> --filter=max --period=300 --from=1735689600000 --to=1735776000000 --cli-query="datapoints[*].[timestamp,average]"', desc: '取 CPU 峰值序列，--filter 已改为 max' },
        { cmd: 'hcloud CES ListMetrics --cli-region=cn-north-4 --namespace=SYS.ECS --cli-query="metrics[?metric_name==\'disk_util_inband\'].dimensions"', desc: '磁盘类指标还要带挂载点维度，先用 `ListMetrics` 确认维度名' }
      ],
      notes: [
        '时间戳单位是**毫秒**：传成秒会查到 1970 年附近的数据，或直接返回空',
        '`period` 只能取固定档位（300/1200/3600/14400/86400 秒）；时间跨度大却用 300 秒粒度容易被拒或返回巨量数据点',
        '`--dim.0` 的维度名必须与 `ListMetrics` 返回的一致（CPU 是 `instance_id`，磁盘/网卡还要额外维度），写错就取不到数',
        '取不到数据的常见原因：时间范围超出保留期、实例已删除、服务已停止上报、维度值用了名称而不是 ID',
        '`--cli-query` 里的字段名（如 `datapoints[*].average`）随 `filter` 变化，先不加 `--cli-query` 看一次原始结构',
        '监控更适合做**趋势与告警**，单点数据说明不了问题；排障时把同一时段的多个指标一起拉出来对照'
      ],
      related: ['hw-ces-list-metrics', 'hw-ecs-list', 'hw-ecs-show'],
      docs: 'https://support.huaweicloud.com/api-ces/ces_03_0001.html',
      tags: ['CES', '监控数据', '时间戳']
    },

    /* ================= J. CCE 云容器引擎 ================= */

    /* ---------- 40 / 71 ---------- */
    {
      id: 'hw-cce-list-clusters',
      name: 'hcloud CCE ListClusters',
      alias: ['华为云查 CCE 集群', 'hcloud 容器集群列表', 'cce list clusters'],
      level: 2,
      syntax: 'hcloud CCE ListClusters --cli-region=<区域> [--cli-query="<JMESPath>"] [--cli-output=table]',
      summary: '列出 CCE 集群，拿到集群 ID 之后才能下载 kubeconfig 或查节点。',
      desc: 'CCE 是华为云的托管 Kubernetes：控制面由华为云维护，用户拿到的是标准 kubeconfig + 标准 K8s API。集群是**区域级**资源，只能在创建它的区域里查到。返回结构是标准 K8s 风格（`items[].metadata`），状态在 `items[].status.phase`。',
      examples: [
        { cmd: 'hcloud CCE ListClusters --cli-region=cn-north-4 --cli-output=table', desc: '列出北京四的 CCE 集群' },
        { cmd: 'hcloud CCE ListClusters --cli-region=cn-north-4 --cli-query="items[*].{name:metadata.name,id:metadata.uid,phase:status.phase}" --cli-output=table', desc: '取集群名、ID 与状态' },
        { cmd: 'hcloud CCE ListClusters --cli-region=cn-north-4 --cli-query="items[?status.phase==\'Available\'].metadata.name"', desc: '只看可用状态（`Available`）的集群' },
        { cmd: 'kubectl --kubeconfig=./cce-kubeconfig.yaml get nodes -o wide', desc: '拿到 kubeconfig 后查看节点（见 `hw-cce-kubeconfig`）' }
      ],
      notes: [
        '集群只在**创建它的 region** 可见，跨区查不到不是权限问题',
        '`status.phase` 为 `Available` 表示可用；`Creating`/`Unavailable` 时不要在上面做变更操作',
        '集群 ID（`metadata.uid`）在下载 kubeconfig、查节点、装插件时都要用，建议先记下来',
        'CCE 有普通集群与 Autopilot 等不同形态，返回字段会略有差异，脚本里别硬依赖某一形态的字段',
        '删除集群会连带删除节点与工作负载，**删前先备份 YAML 与有状态数据**（见 `k8s-get` 导出资源）'
      ],
      related: ['hw-cce-kubeconfig', 'hw-ecs-list', 'hw-vpc-list'],
      docs: 'https://support.huaweicloud.com/api-cce/cce_02_0001.html',
      tags: ['CCE', 'Kubernetes', '集群']
    },

    /* ---------- 41 / 71 ---------- */
    {
      id: 'hw-cce-kubeconfig',
      name: 'CCE kubeconfig 获取与使用（CCE 与标准 K8s 的关系）',
      kind: 'recipe',
      alias: ['华为云下载 kubeconfig', 'CCE 连接集群', 'cce kubectl'],
      level: 2,
      syntax: '（控制台路径）CCE 控制台 → 集群 → 连接信息 → 下载 kubeconfig  →  kubectl --kubeconfig=<文件> get nodes',
      summary: '从 CCE 控制台下载 kubeconfig，之后就是标准 kubectl 操作。',
      desc: 'CCE 只是把 Kubernetes 控制面托管起来，API 仍是**标准 K8s API**：从 CCE 控制台下载 kubeconfig（也可在"连接信息"里复制 kubectl 命令）之后，`kubectl` 的所有命令、资源类型、排障方法都不变。因此 K8s 相关的命令不需要为华为云单独写一套。',
      examples: [
        { cmd: 'kubectl --kubeconfig=./cce-kubeconfig.yaml get nodes -o wide', desc: '用下载到的 kubeconfig 查看节点' },
        { cmd: 'export KUBECONFIG=~/.kube/cce-prod.yaml', desc: '设为默认配置，后续 kubectl 命令不用再带 `--kubeconfig`（Linux/macOS）' },
        { cmd: 'kubectl config get-contexts && kubectl config use-context <上下文名>', desc: '多集群环境下先确认当前上下文再操作（见 `k8s-config`）' },
        { cmd: 'kubectl get pods -A', desc: '之后就是标准 K8s 用法，本站 `kubernetes` 分类的命令全部适用' },
        { cmd: 'hcloud CCE ListClusters --cli-region=cn-north-4 --cli-query="items[*].metadata.name"', desc: '先用 KooCLI 确认要连的是哪个集群' }
      ],
      notes: [
        'kubeconfig 是**集群管理凭证**（等同管理员权限）：不要提交到 Git、不要放公共网盘、不要在群里传；控制台可设置有效期，过期重新下载',
        'CCE 与标准 K8s 的差异主要在"集群之外"：控制面托管、节点池、插件市场、监控与日志对接；**集群里面的 Pod/Service/Deployment 完全是标准 K8s**',
        'kubeconfig 里写的是集群 apiserver 地址：在集群外使用需要 apiserver 有公网访问（EIP）或走 VPN/专线，否则 `kubectl` 会连不上',
        '命名空间级权限用 IAM + K8s RBAC 一起控制；只给某团队某个 namespace 的权限时不要下发集群管理 kubeconfig',
        '`kubectl` 客户端与服务端版本不要差太多（通常 ±1 个小版本，见 `k8s-version`），版本偏差会引起难以定位的报错',
        '多集群切换靠 context：`kubectl config get-contexts` 看清楚再动手，**在生产集群上执行删除类命令前务必确认上下文**'
      ],
      related: ['hw-cce-list-clusters', 'hw-iam-user', 'hw-vpc-troubleshoot-port'],
      docs: 'https://support.huaweicloud.com/cce/index.html',
      tags: ['CCE', 'kubeconfig', 'kubectl']
    },

    /* ================= K. obsutil 对象存储专用工具 ================= */

    /* ---------- 42 / 71 ---------- */
    {
      id: 'hw-obsutil-config',
      name: 'obsutil config',
      alias: ['obsutil 配置 AK/SK', 'obsutil 初始化', 'obsutil endpoint'],
      level: 1,
      syntax: 'obsutil config -i=<你的AK> -k=<你的SK> -e=<终端节点> [-t=<临时凭证token>]',
      summary: '给 obsutil 配 AK/SK 与 endpoint，是这套工具所有命令的前置条件。',
      desc: 'obsutil 是 OBS 专用传输工具（类似 `aws s3`），配置独立于 KooCLI，保存在用户目录下的 `.obsutilconfig` 里。`-e` 是**终端节点（endpoint）**，形如 `obs.cn-north-4.myhuaweicloud.com`，必须与桶所在区域一致——这里写的是 endpoint，不是 `--cli-region` 那种区域标识。',
      params: [
        { flag: '-i=<你的AK>', desc: '访问密钥 ID；示例统一用尖括号占位，别写真实值' },
        { flag: '-k=<你的SK>', desc: '私有访问密钥，与 AK 成对' },
        { flag: '-e=<终端节点>', desc: '如 `obs.cn-north-4.myhuaweicloud.com`；写错会连接失败' },
        { flag: '-t=<securitytoken>', desc: '临时 AK/SK（委托/STS）场景必填，与 -i/-k 成套使用' },
        { flag: '-config=<配置文件>', desc: '使用自定义配置文件，适合多环境切换' }
      ],
      examples: [
        { cmd: 'obsutil config -i=<你的AK> -k=<你的SK> -e=obs.cn-north-4.myhuaweicloud.com', desc: '配置北京四的 AK/SK 与 endpoint' },
        { cmd: 'obsutil config -i=<你的AK> -k=<你的SK> -e=obs.cn-east-3.myhuaweicloud.com -t=<临时凭证token>', desc: '临时凭证场景：三个值必须成套给' },
        { cmd: 'obsutil ls -limit=5', desc: '验证配置是否生效（能列出桶就说明通了）' },
        { cmd: 'obsutil help', desc: '列出全部子命令，配置完先看一遍有哪些能力' }
      ],
      notes: [
        '**AK/SK 不要提交到 Git**：`-i`/`-k` 只在本地配置一次，配置文件 `.obsutilconfig` 是**明文**的，注意机器权限与备份策略',
        '`-e` 必须写 **OBS 的 endpoint**（`obs.<区域>.myhuaweicloud.com`），把区域标识直接填进去（如 `-e=cn-north-4`）会连接失败',
        '**KooCLI 与 obsutil 的配置是分开的两份**：换 AK 时 `hcloud configure` 与 `obsutil config` 都要改，否则会出现"KooCLI 正常、obsutil 报 403"',
        '临时 AK/SK 必须同时给 `-t=<securitytoken>`，缺一个就签名失败',
        '同一台机器要访问多个区域的桶时，用 `-e` 在命令里临时指定，或用 `-config` 切换不同配置文件'
      ],
      related: ['hw-obsutil-ls', 'hw-obs-vs-obsutil', 'hw-hcloud-config-set', 'hw-iam-aksk-leak'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0005.html',
      tags: ['obsutil', '配置', 'endpoint']
    },

    /* ---------- 43 / 71 ---------- */
    {
      id: 'hw-obsutil-ls',
      name: 'obsutil ls',
      alias: ['obsutil 查看桶', 'obsutil 列出对象', 'obsutil 列目录'],
      level: 1,
      syntax: 'obsutil ls [obs://<桶名>[/前缀]] [-limit=<条数>] [-marker=<起始对象名>]',
      summary: '列出桶与对象，确认上传目标与核对删除范围都靠它。',
      desc: '不带参数列出**当前凭证可访问的桶**；带 `obs://<桶名>/` 则列出该前缀下的对象。OBS 没有真正的目录结构，`a/b/c.txt` 里的斜杠只是对象名的一部分，所以"列目录"实际是按前缀过滤。对象很多时要靠 `-limit` 与 `-marker` 分页。',
      params: [
        { flag: '-limit=<条数>', desc: '单次返回的最大条数；不写会用默认值' },
        { flag: '-marker=<对象名>', desc: '从指定对象名之后继续列举，用于翻页' },
        { flag: 'obs://<桶名>/<前缀>', desc: '只列该前缀下的对象；末尾加 `/` 表示按"目录"前缀列' }
      ],
      examples: [
        { cmd: 'obsutil ls obs://prod-static', desc: '列出 prod-static 桶里的对象（教学环境用这个名字，真机上换成你自己的桶）' },
        { cmd: 'obsutil ls obs://prod-static/web/ -limit=20', desc: '只列 web/ 前缀下的对象 —— OBS 的"目录"其实就是前缀' },
        { cmd: 'obsutil ls', desc: '列出当前 AK 可访问的所有桶' },
        { cmd: 'obsutil ls obs://<桶名>', desc: '列出桶内对象（默认有数量上限）' },
        { cmd: 'obsutil ls obs://<桶名>/web/ -limit=20', desc: '列某个前缀下的对象，限制条数避免刷屏' },
        { cmd: 'obsutil ls obs://<桶名>/logs/ -limit=20 -marker=logs/app-2026-02-01.log', desc: '从上一次的最后一条之后继续列举，做分页巡检' },
        { cmd: 'obsutil stat obs://<桶名>', desc: '看桶的对象总数与总容量，做容量盘点' }
      ],
      notes: [
        '列出的是**当前 AK 有权限访问的桶**，不是账号下的全部桶——"桶不见了"先查权限',
        '对象数量多时**不要** `-limit=100000` 一次拉完：慢、占内存，还可能被限流；用 `-marker` 分批',
        '列桶、列对象本身会产生请求费用（LIST 请求），频繁轮询列表接口要注意成本',
        '删除前务必先 `ls` 一次目标前缀：`obsutil rm -r` 是按前缀批量删，前缀写错就是事故',
        '完整参数（是否显示对象大小、是否只列目录等）以 `obsutil help ls` 为准'
      ],
      related: ['hw-obsutil-config', 'hw-obsutil-stat-chattri', 'hw-obsutil-rm', 'hw-obsutil-mb'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0012.html',
      tags: ['obsutil', '列表', '对象']
    },

    /* ---------- 44 / 71 ---------- */
    {
      id: 'hw-obsutil-mb',
      name: 'obsutil mb',
      alias: ['obsutil 创建桶', 'obsutil make bucket', 'OBS 建桶'],
      level: 1,
      syntax: 'obsutil mb obs://<全局唯一的桶名> [-location=<区域>] [-acl=<预定义策略>] [-sc=<存储类型>]',
      summary: '创建 OBS 桶并指定区域、存储类型与访问策略，桶名必须全局唯一。',
      desc: '`mb` 是 make bucket 的缩写，对应 `hcloud OBS CreateBucket`。`-location` 指定区域（`cn-north-4` 北京四、`cn-east-3` 上海一、`cn-south-1` 广州），不写则用配置文件里 endpoint 所在区域。`-acl=private`（私有读写）是默认也是最安全的选择，静态网站场景才需要放开公共读。',
      params: [
        { flag: '-location=<区域>', desc: '桶所在区域，如 `cn-north-4`；不写则跟随配置的 endpoint' },
        { flag: '-acl=<策略>', desc: '`private`/`public-read`/`public-read-write`/`bucket-owner-full-control`' },
        { flag: '-sc=<存储类型>', desc: '`standard`/`warm`/`cold`/`deep-archive`；冷归档便宜但取回要解冻' },
        { flag: '-fs', desc: '创建支持文件接口（POSIX）的桶；不需要并行文件系统就别加' }
      ],
      examples: [
        { cmd: 'obsutil mb obs://prod-new-bucket -location=cn-north-4', desc: '建桶（教学环境不会真的建；真机上桶名**全局唯一**，被人占了就得换）' },
        { cmd: 'obsutil ls', desc: '建完再列一次，确认新桶出现在清单里' },
        { cmd: 'obsutil mb obs://<全局唯一的桶名> -location=cn-north-4', desc: '在北京四建一个桶（默认私有读写）' },
        { cmd: 'obsutil mb obs://<桶名> -location=cn-north-4 -acl=private -sc=standard', desc: '显式指定访问策略与存储类型，最常用的组合' },
        { cmd: 'obsutil ls -limit=10', desc: '确认桶已创建并可见' },
        { cmd: 'obsutil stat obs://<桶名>', desc: '查看新桶的对象数与容量统计' }
      ],
      notes: [
        '桶名**全局唯一**：`test`、`data`、`backup` 这类名字基本都被占用，命名带上项目/环境前缀，如 `myproj-prod-web`',
        '桶名只能含**小写字母、数字、中划线、点**，3~63 字符，不能以点或中划线开头结尾',
        '**桶创建后不能更换区域**：建错区域只能新建桶再迁数据（`obsutil cp -r` 或 sync）',
        '`-acl=public-read` 会让**所有匿名用户可读**：静态网站发布需要它，但含敏感数据的桶千万别开；更细的权限用桶策略控制',
        '冷归档（`cold`/`deep-archive`）单价低但**取回需要先解冻且按次收费**，只适合几乎不读的备份（见 `hw-obsutil-restore-resume`）',
        '生产桶建议同时配置生命周期规则（控制台）自动清理过期对象，比手工删更安全'
      ],
      related: ['hw-obsutil-ls', 'hw-obs-bucket', 'hw-flow-obs-static-site', 'hw-obsutil-restore-resume'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0012.html',
      tags: ['obsutil', '建桶', 'OBS']
    },

    /* ---------- 45 / 71 ---------- */
    {
      id: 'hw-obsutil-cp',
      name: 'obsutil cp',
      alias: ['obsutil 上传下载', 'obsutil 复制文件', 'obsutil -r -f -u'],
      level: 2,
      syntax: 'obsutil cp <本地路径|obs://桶名/对象名> <obs://桶名/对象名|本地路径> [-r] [-f] [-u] [-flat] [-j=<并发>] [-p=<分段并发>]',
      summary: '上传或下载单个文件与整个目录，不带 -r 传文件夹会直接报错。',
      desc: '`cp` 是最基础的传输命令：本地 → OBS 是上传，OBS → 本地是下载，OBS → OBS 是复制。传文件夹**必须加 `-r`**（递归），`-f` 表示同名文件直接覆盖不再逐条询问。它每次都会重传目标文件，**不做差异比较**；只想要"传变化的文件"，用 `-u` 或直接上 `sync`。',
      params: [
        { flag: '-r', desc: '递归处理文件夹；上传/下载目录时必须加' },
        { flag: '-f', desc: '强制覆盖同名对象，不再交互确认；脚本里必加，人肉操作时可留确认' },
        { flag: '-u', desc: '增量：只处理源比目标新（或目标不存在）的文件，具体比较规则见 `obsutil help cp`' },
        { flag: '-flat', desc: '只传文件、不保留原目录结构（下载/上传到同一层）' },
        { flag: '-j=<并发>', desc: '多文件批量任务的并发数，默认 5' },
        { flag: '-p=<并发>', desc: '单个大文件分段上传的并发数' }
      ],
      examples: [
        { cmd: 'obsutil cp ./app.tar.gz obs://prod-backup/release/app.tar.gz -f', desc: '上传单个对象（-f 覆盖同名对象）' },
        { cmd: 'obsutil cp obs://prod-backup/report/2025-01.xlsx ./ -f', desc: '反向下载：把对象取回本地，路径参数顺序刚好相反' },
        { cmd: 'obsutil cp ./app.tar.gz obs://<桶名>/release/app.tar.gz -f', desc: '上传单个文件并覆盖同名对象' },
        { cmd: 'obsutil cp ./dist obs://<桶名>/web/ -r -f', desc: '上传整个目录（必须带 -r）' },
        { cmd: 'obsutil cp obs://<桶名>/logs/app.log ./app.log -f', desc: '下载单个对象到本地' },
        { cmd: 'obsutil cp ./data obs://<桶名>/data/ -r -u -j=5', desc: '增量上传目录：只传比目标新的文件' },
        { cmd: 'obsutil cp obs://<桶名>/release/app.tar.gz obs://<桶名>/archive/app.tar.gz -f', desc: '在 OBS 内部复制对象（不经过本地）' }
      ],
      notes: [
        '**传目录忘加 `-r` 会直接报错**，这是最常见的用法错误；`-r` 与 `-f` 是两个不同维度的参数',
        '不加 `-f` 时遇到同名对象会**逐条询问**，在脚本或 CI 里会卡住直到超时，所以脚本里一定加 `-f`',
        '`cp` **不做增量比较**，同名文件默认全量重传；前端发布、日志归档这类"大部分文件没变"的场景用 `obsutil sync` 至少快一个数量级',
        '大文件配合 `-threshold`（多大开始分段）、`-ps`（分段大小）、`-p`（分段并发）调优，中断后重跑同一条命令会自动续传',
        '对象 ACL 默认跟随桶策略：需要匿名可读时要显式加 `-acl=public-read`，静态资源忘了这一步会 403',
        '上传后核对：`obsutil stat obs://<桶名>/<对象名>` 看大小，`obsutil ls obs://<桶名>/<前缀> -limit=10` 看名字对不对'
      ],
      related: ['hw-obsutil-sync', 'hw-obsutil-config', 'hw-obsutil-restore-resume', 'hw-flow-obs-static-site'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0013.html',
      tags: ['obsutil', '上传', '下载']
    },

    /* ---------- 46 / 71 ---------- */
    {
      id: 'hw-obsutil-sync',
      name: 'obsutil sync',
      alias: ['obsutil 增量同步', 'obsutil 发布静态网站', 'obsutil 同步上传'],
      level: 2,
      syntax: 'obsutil sync <本地文件夹> obs://<桶名>[/前缀] [-dryRun] [-j=<并发>] [-p=<分段并发>] [-threshold=<字节>] [-include=*.html] [-exclude=*.map] [-vlength] [-fr]',
      summary: '增量同步本地目录到 OBS，前端发布与备份最常用的命令，先跑 dryRun。',
      desc: '把本地目录与 OBS 前缀**对齐**：只上传"目标不存在、大小不同、或本地更新"的文件，逐文件比对后跳过没变的——这就是它比 `cp -r` 快的根本原因。注意它是**单向补齐**：OBS 上多出来的对象**不会被删除**。做前端发布、日志归档、定时备份的首选命令；反过来写就是把 OBS 同步回本地。',
      params: [
        { flag: '-dryRun', desc: '只演练不上传：列出将要上传的文件，正式执行前必跑' },
        { flag: '-j=<并发>', desc: '批量任务的最大并发数（同步文件夹时生效），默认 5' },
        { flag: '-p=<并发>', desc: '每个分段上传任务的并发数，影响单个大文件的速度' },
        { flag: '-threshold=<字节>', desc: '超过该大小走分段上传，默认 52428800（50MB）；支持 `50MB` 这类带单位写法' },
        { flag: '-include= / -exclude=', desc: '按文件名匹配要/不要同步的内容，作用于**文件全路径**，可写多次' },
        { flag: '-vlength / -vmd5', desc: '上传后校验大小 / MD5；MD5 要算本地哈希，大文件会明显变慢' },
        { flag: '-fr', desc: '生成结果清单文件（`sync_succeed_report_时间_TaskId.txt`）' },
        { flag: '-cpd=<目录>', desc: '断点记录目录，默认 `~/.obsutil_checkpoint`' }
      ],
      examples: [
        { cmd: 'obsutil sync ./dist obs://prod-static/web/ -dryRun', desc: '**先预演**：只列出将要做什么，不改动任何东西 —— 发布前必跑' },
        { cmd: 'obsutil sync ./dist obs://prod-static/web/ -j=5', desc: '确认无误再真同步（-j 是并发数）' },
        { cmd: 'obsutil sync ./dist obs://<桶名>/web/ -dryRun', desc: '预演：只打印将要上传的文件，确认没有误传敏感文件' },
        { cmd: 'obsutil sync ./dist obs://<桶名>/web/ -j=5 -p=5 -vlength', desc: '正式同步：5 个并发任务，上传后校验大小一致' },
        { cmd: 'obsutil sync ./dist obs://<桶名>/web/ -include=*.html -include=*.css -include=*.js -exclude=*.map', desc: '只同步指定类型，跳过 sourcemap' },
        { cmd: 'obsutil sync obs://<桶名>/backup/ ./backup/ -j=10 -fr', desc: '反向同步：把 OBS 前缀拉到本地，并生成结果清单' },
        { cmd: 'obsutil sync ./dist obs://<桶名>/web/ -sc=standard -acl=public-read', desc: '同步时指定存储类型与预定义 ACL（静态资源需要公共读）' }
      ],
      notes: [
        '**正式执行前先 `-dryRun`**：它把将要上传的文件完整列出来，是发现"把 `.env`、`node_modules`、`.git` 传上公网"的唯一机会',
        '`sync` 是"本地 → OBS 补齐"语义，**不会删除 OBS 上多出来的对象**；前端每次构建产生带 hash 的新文件会越积越多，需要另外清理旧版本或按版本目录发布',
        '与 `aws s3 sync --delete` 的差别要记牢：**obsutil 没有 `--delete`** 这种"镜像式"同步，别把两者当成同一个东西',
        '比较过程会对每个文件发一次 HEAD 请求，**对象特别多时请求费用不可忽略**；几万个小文件的目录建议先按前缀拆分',
        '`-include`/`-exclude` 的模式作用于**文件全路径**，且 Windows 下用双引号、Linux/macOS 下用单引号包起来，否则通配符会被 shell 提前展开',
        '同步过程中不要修改本地文件：大小或时间在比对后又变化，可能出现重复上传或结果不一致',
        '大文件中途断了不用重来：断点记录在 `~/.obsutil_checkpoint`，**重跑同一条命令**即会自动续传（换目录用 `-cpd`）',
        '发布完做一次验证：`curl -I https://<桶名>.obs.cn-north-4.myhuaweicloud.com/index.html`，确认能匿名访问且 `Content-Type` 正确'
      ],
      related: ['hw-obsutil-cp', 'hw-obsutil-config', 'hw-flow-obs-static-site', 'hw-obsutil-ls', 'hw-obsutil-restore-resume'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0042.html',
      tags: ['obsutil', '同步', '静态网站']
    },

    /* ---------- 47 / 71 ---------- */
    {
      id: 'hw-obsutil-rm',
      name: 'obsutil rm',
      alias: ['obsutil 删除对象', 'obsutil 批量删除', 'obsutil 清空桶'],
      level: 2,
      syntax: 'obsutil rm obs://<桶名>[/<对象名>|<前缀>] [-r] [-f]',
      summary: '删除对象或按前缀批量删除，不可恢复，执行前先用 ls 核对前缀。',
      desc: '删单个对象直接给完整路径；`-r` 表示按**对象名前缀**递归删除。删除是物理删除、**不可恢复**（除非桶开启了多版本控制，那时是打删除标记）。桶里还有对象时删不掉桶，要先清空对象。',
      params: [
        { flag: '-r', desc: '按对象名前缀批量删除（前缀匹配，范围可能比想象的大）' },
        { flag: '-f', desc: '跳过逐条确认；脚本里必须加，人肉操作时建议不加' }
      ],
      examples: [
        { cmd: 'obsutil ls obs://prod-static/web/2024/ -limit=10', desc: '删之前先列出来确认范围 —— OBS 没有回收站' },
        { cmd: 'obsutil rm obs://prod-static/web/2024/ -r -f', desc: '递归删除整个前缀（教学环境不会真的删）' },
        { cmd: 'obsutil ls obs://<桶名>/web/2024/ -limit=10', desc: '删除前先看清前缀下到底有哪些对象' },
        { cmd: 'obsutil rm obs://<桶名>/web/old-index.html -f', desc: '删除单个对象' },
        { cmd: 'obsutil rm obs://<桶名>/web/2024/ -r -f', desc: '按前缀批量删除 2024 年的旧资源' },
        { cmd: 'obsutil stat obs://<桶名>', desc: '删除后看对象数量是否如预期下降' }
      ],
      notes: [
        '**删除不可恢复**：OBS 没有回收站（多版本桶里被删对象也只是变成历史版本，仍占空间与费用）',
        '`-r` 是**前缀匹配**：`obs://<桶名>/web/2` 会连 `web/2025/` 一起删掉，前缀一定要以 `/` 结尾并先 `ls` 确认',
        '`-f` 跳过确认，脚本里必须加（否则会卡在交互询问），但人肉操作时留着确认更安全',
        '桶内有对象时无法删除桶：先清空对象，或配生命周期规则自动过期',
        '日常清理更推荐配**生命周期规则**（按前缀或标签自动过期），一次配置长期生效，比手工 rm 可靠',
        '批量删除是逐个对象请求，几万个对象会跑很久；按前缀分批删，并在结果清单里核对失败项'
      ],
      related: ['hw-obsutil-ls', 'hw-obsutil-stat-chattri', 'hw-obsutil-cp', 'hw-flow-obs-static-site'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0021.html',
      tags: ['obsutil', '删除', '危险操作']
    },

    /* ---------- 48 / 71 ---------- */
    {
      id: 'hw-obsutil-stat-chattri',
      name: 'obsutil stat / chattri（查看与修改对象属性）',
      kind: 'recipe',
      alias: ['obsutil 对象元数据', 'obsutil 修改 ACL', 'obsutil 改存储类型'],
      level: 2,
      syntax: 'obsutil stat obs://<桶名>[/<对象名>]  |  obsutil chattri obs://<桶名>/<对象名> [-acl=<策略>] [-sc=<存储类型>] [-meta=k1:v1#k2:v2]',
      summary: '看对象的元数据与大小，改它的 ACL、存储类型与自定义元数据。',
      desc: '`stat` 是只读的"体检"命令：查桶能看到对象总数与总容量，查对象能看到大小、ETag、最后修改时间与自定义元数据——上传后确认"到底传上没有、传了多少"就看它。`chattri` 改属性**不重新上传对象内容**，改 ACL 与存储类型都是瞬时的。',
      examples: [
        { cmd: 'obsutil stat obs://prod-static', desc: '看桶的对象数、总容量与存储类别' },
        { cmd: 'obsutil stat obs://prod-static/web/index.html', desc: '看单个对象的 ETag、ContentType 与 ACL' },
        { cmd: 'obsutil chattri obs://prod-static/web/index.html -acl=public-read', desc: '改成公共读 —— 静态托管必须，但**别对私有数据这么做**' },
        { cmd: 'obsutil stat obs://<桶名>', desc: '桶级统计：对象数量与总容量（有几分钟延迟）' },
        { cmd: 'obsutil stat obs://<桶名>/web/index.html', desc: '看对象大小、ETag、最后修改时间与自定义元数据' },
        { cmd: 'obsutil chattri obs://<桶名>/web/index.html -acl=public-read', desc: '把对象改成匿名可读（静态网站托管常用）' },
        { cmd: 'obsutil chattri obs://<桶名>/logs/app.log -sc=warm', desc: '把不常读的日志转到低频访问存储省费用' },
        { cmd: 'obsutil chattri obs://<桶名>/web/app.js -meta=env:prod#owner:frontend', desc: '写入自定义元数据，便于资产归属排查' }
      ],
      notes: [
        '上传后怀疑"没传完"，先 `stat` 看**对象大小**是否与本地一致；`chattri` 支持的属性以 `obsutil help chattri` 为准',
        '**分段上传的对象 ETag 不是纯 MD5**（会带 `-分段数` 后缀），拿它跟本地 `md5sum` 比会不一致，别误判为上传损坏',
        '`stat obs://<桶名>` 的统计有延迟，刚传完立刻看数字可能偏小',
        '`-acl=public-read` 让对象**匿名可读**：整个桶都要公开时用桶策略统一设置，比逐个对象改更省事也更不容易漏',
        '`-sc` 改成 `cold`/`deep-archive` 后**必须先解冻才能读**（见 `hw-obsutil-restore-resume`），别把还在读的数据转成归档',
        '改属性本身是请求操作，会产生请求费用；批量修改建议用生命周期规则或桶策略'
      ],
      related: ['hw-obsutil-ls', 'hw-obsutil-sign', 'hw-obsutil-restore-resume', 'hw-flow-obs-static-site'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0041.html',
      tags: ['obsutil', '元数据', 'ACL']
    },

    /* ---------- 49 / 71 ---------- */
    {
      id: 'hw-obsutil-sign',
      name: 'obsutil sign（生成临时下载链接）',
      kind: 'recipe',
      alias: ['obsutil 临时URL', 'obsutil 签名链接', 'OBS 生成下载链接'],
      level: 2,
      syntax: 'obsutil sign obs://<桶名>/<对象名> [-e=<有效期秒>]  |  obsutil sign obs://<桶名>/<前缀> -r [-e=<秒>] [-include=*.xlsx]',
      summary: '生成带签名的临时下载链接，默认只有 300 秒有效，别贴公开群。',
      desc: '私有桶里的对象默认不能匿名下载，`sign` 会生成一条带签名参数的临时 URL（`AccessKeyId`/`Expires`/`Signature`），在有效期内谁拿到都能下载，过期自动失效。`-e` 是**过期时间（秒）**，默认 300、最小 60。加 `-r` 可按前缀批量生成，链接写入结果清单文件。',
      params: [
        { flag: '-e=<秒>', desc: '链接有效期，单位**秒**，默认 300、最小 60' },
        { flag: '-r', desc: '按对象名前缀批量生成链接（会写到结果清单文件）' },
        { flag: '-include= / -exclude=', desc: '批量生成时按文件名匹配筛选对象' },
        { flag: '-timeRange=<time1-time2>', desc: '批量生成时按最后修改时间筛选，UTC 时间，格式 yyyyMMddHHmmss' },
        { flag: '-o=<目录>', desc: '结果清单文件目录，默认 `~/.obsutil_output`' },
        { flag: '-endpoint=<终端节点>', desc: '临时指定 endpoint，用于生成其他区域对象的链接' }
      ],
      examples: [
        { cmd: 'obsutil sign obs://prod-static/report/2025-01.xlsx', desc: '生成临时下载链接，**不用把 AK/SK 给对方**' },
        { cmd: 'obsutil sign obs://prod-static/report/2025-01.xlsx -days=1', desc: '把有效期缩短到 1 天（默认 7 天，越长越危险）' },
        { cmd: 'obsutil sign obs://<桶名>/report/2025-01.xlsx', desc: '生成默认 300 秒有效的下载链接' },
        { cmd: 'obsutil sign obs://<桶名>/report/2025-01.xlsx -e=3600', desc: '生成 1 小时有效的链接（1 小时 = 3600 秒）' },
        { cmd: 'obsutil sign obs://<桶名>/report/ -r -e=600 -include=*.xlsx', desc: '按前缀批量生成，只挑 xlsx 文件' },
        { cmd: 'obsutil ls obs://<桶名>/report/ -limit=5', desc: '生成前先确认对象名，链接是给外部人用的，别签错文件' }
      ],
      notes: [
        '链接里带的是**签名**：谁拿到谁就能下，**不要发到公开群、不要写进工单附件**；用完即弃（短有效期）是正确姿势',
        '`-e` 单位是**秒**：想要 1 小时要写 `-e=3600`，写成 `-e=1` 得到的链接 1 秒后就失效（最小 60 秒）',
        '批量生成（`-r`）时链接**不会全部打印到屏幕**，而是写到 `~/.obsutil_output` 下形如 `sign_succeed_report_时间_TaskId.txt` 的文件里，去那里取',
        '只有私有对象需要签名；`public-read` 的对象直接拼 `https://<桶名>.obs.<区域>.myhuaweicloud.com/<对象名>` 就能访问',
        '临时 URL 的域名是对象所在区域的 endpoint：跨区域对象要用 `-endpoint` 指定，否则链接里的域名不对，访问会 404',
        '需要给外部系统长期访问时，用桶策略 + IAM 子用户，而不是生成一个超长有效期的链接'
      ],
      related: ['hw-obsutil-ls', 'hw-obsutil-stat-chattri', 'hw-aws-s3-presign'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0051.html',
      tags: ['obsutil', '临时链接', '签名']
    },

    /* ---------- 50 / 71 ---------- */
    {
      id: 'hw-obsutil-restore-resume',
      name: 'obsutil restore 与断点续传/分片参数（-j / -p / -cpd / -threshold）',
      kind: 'recipe',
      alias: ['obsutil 解冻归档对象', 'obsutil 断点续传', 'obsutil 分片上传'],
      level: 3,
      syntax: 'obsutil restore obs://<桶名>/<对象名> [-days=<保持天数>]  |  obsutil cp|sync <源> <目标> [-threshold=<字节>] [-ps=<分段大小>] [-p=<并发>] [-j=<并发>] [-cpd=<目录>]',
      summary: '解冻归档对象，以及用分片与断点参数把大文件传输跑稳跑快。',
      desc: '两件与"大文件、冷数据"相关的操作：归档/深度归档存储的对象**不能直接下载**，必须先 `restore` 解冻；大文件传输则靠 `-threshold`（多大开始分段）、`-ps`（每段大小）、`-p`（分段并发）、`-j`（多文件并发）四个参数调优，中断后**重跑同一条命令**即从断点记录续传。',
      params: [
        { flag: '-days=<天数>', desc: '`restore` 解冻后可读状态的保持天数（参数名以 `obsutil help restore` 为准）' },
        { flag: '-threshold=<字节>', desc: '分段阈值，默认 52428800（50MB）；小于它就直传，直传不支持断点续传' },
        { flag: '-ps=<分段大小>', desc: '每个分段的大小，可写 `auto` 让工具按文件大小自动决定' },
        { flag: '-p=<并发>', desc: '单个文件的分段并发数' },
        { flag: '-j=<并发>', desc: '多文件批量任务的并发数（同步文件夹时生效）' },
        { flag: '-cpd=<目录>', desc: '断点记录目录，默认 `~/.obsutil_checkpoint`' }
      ],
      examples: [
        { cmd: 'obsutil stat obs://prod-backup/archive/2024-backup.tar.gz', desc: '先确认对象的存储类别是 Archive（归档不能直接下载）' },
        { cmd: 'obsutil restore obs://prod-backup/archive/2024-backup.tar.gz -days=7', desc: '解冻归档对象，-days 决定解冻后保留几天可读' },
        { cmd: 'obsutil restore obs://<桶名>/archive/2024-backup.tar.gz -days=7', desc: '解冻归档对象并保持 7 天可读（参数以 `obsutil help restore` 为准）' },
        { cmd: 'obsutil stat obs://<桶名>/archive/2024-backup.tar.gz', desc: '解冻是异步的，用 stat 观察对象状态变化' },
        { cmd: 'obsutil cp obs://<桶名>/archive/2024-backup.tar.gz ./ -f', desc: '解冻完成后才能正常下载' },
        { cmd: 'obsutil cp ./big-data.tar obs://<桶名>/data/big-data.tar -threshold=104857600 -ps=52428800 -p=5 -f', desc: '超过 100MB 走分段，每段 50MB，5 个分段并发' },
        { cmd: 'obsutil sync ./static obs://<桶名>/static/ -j=10 -threshold=20971520', desc: '小文件为主时靠 `-j` 提升并发（见 `hw-obsutil-sync`）' },
        { cmd: 'obsutil cp ./big-data.tar obs://<桶名>/data/big-data.tar -cpd=/data/obsutil_checkpoint -f', desc: '把断点记录目录放到大容量磁盘上' }
      ],
      notes: [
        '归档/深度归档对象**不能直接下载**，必须先解冻；解冻是**异步**的，标准解冻可能几小时，加急解冻更快但更贵（速度档位与参数名以 `obsutil help restore` 为准）',
        '解冻后的可读状态按天保持（`-days`），过期又回到不可读；期间会产生额外的取回费用，"冷归档省下的存储费"可能被取回费吃回去',
        '**断点续传只对分段上传生效**：文件小于 `-threshold` 时走直传，中断了只能从头来，所以大文件一定要让它走分段',
        '续传的前提是**命令完全一致**（源路径、目标对象名、参数尽量不变）且本地文件没有被修改；改了文件名就匹配不上断点记录',
        '断点记录在 `~/.obsutil_checkpoint` 的 `upload`/`download` 子目录，**任务成功后自动删除**，失败或被中断的才保留',
        '并发不是越大越好：`-j=50` 在带宽打满后只会让每个任务更慢、本机 IO 更吃紧，一般 5~10 够用',
        '清理断点记录等于放弃续传进度；磁盘紧张时先确认没有正在跑的大任务'
      ],
      related: ['hw-obsutil-cp', 'hw-obsutil-sync', 'hw-obsutil-mb', 'hw-obsutil-help'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0012.html',
      tags: ['obsutil', '断点续传', '归档']
    },

    /* ---------- 51 / 71 ---------- */
    {
      id: 'hw-obsutil-help',
      name: 'obsutil help',
      alias: ['obsutil 查看帮助', 'obsutil 子命令', 'obsutil 参数说明'],
      level: 1,
      syntax: 'obsutil help [子命令]',
      summary: '查 obsutil 全部子命令与某个子命令的完整参数，最权威的本地说明。',
      desc: 'obsutil 版本迭代比 KooCLI 慢，但仍有"文档写 A、实际是 B"的情况。拿不准参数名与默认值时，直接问工具自己最可靠：不带参数列出所有子命令，带子命令名则列出它的完整参数、约束与默认值。',
      examples: [
        { cmd: 'obsutil help', desc: '列出全部子命令（ls/mb/cp/sync/rm/stat/sign/chattri/restore/abort 等）' },
        { cmd: 'obsutil help sync', desc: '查看 sync 的全部参数与默认值（写同步脚本前先看一遍）' },
        { cmd: 'obsutil help cp', desc: '查 cp 的 `-r`/`-f`/`-u`/`-flat` 等参数的确切语义' },
        { cmd: 'obsutil version', desc: '确认版本号：不同版本的参数支持有差异，报"参数不存在"时先看这里' }
      ],
      notes: [
        '写参数名时注意是单横线短选项（`-r`、`-j=5`），`--dryRun`、`--bucket` 这类是 KooCLI/AWS 的写法，obsutil 会直接报未知参数',
        '`obsutil help cp` 的输出很长，终端里配合 `| more` 或用 `obsutil help cp > cp.txt` 落盘再查',
        'KooCLI 的帮助是另一套命令（`hcloud <服务> <操作> --help`，见 `hw-hcloud-help`），两套别混着记',
        '遇到"参数不存在"先 `obsutil version`，再对照 `obsutil help <子命令>` 与官方文档；版本太老时考虑升级工具（升级不影响已上传数据）'
      ],
      related: ['hw-obsutil-config', 'hw-hcloud-help', 'hw-obs-vs-obsutil'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0001.html',
      tags: ['obsutil', '帮助', '参数']
    },

    /* ================= L. 组合实战（一条记录一条链路） ================= */

    /* ---------- 52 / 71 ---------- */
    {
      id: 'hw-flow-ssh-inventory',
      name: '实战：批量查 ECS 并生成 SSH 登录清单',
      kind: 'recipe',
      alias: ['批量导出云服务器清单', 'hcloud 生成 ssh 命令', 'ECS 盘点脚本'],
      level: 2,
      syntax: '（一条链路）hcloud ECS ListServersDetails --cli-output=json > ecs.json  →  jq 提取名称与地址  →  生成 ssh 命令清单',
      summary: '一条链路查出所有云服务器并生成可直接粘贴执行的 SSH 登录清单。',
      desc: '场景：接手一个几十台机器的环境，需要一份"机器名 ↔ IP ↔ 登录命令"的清单。思路是先用 KooCLI 把机器列表落成 JSON（**不要用 table**，表格无法解析），再用 `jq` 生成清单，最后按需补上 EIP 信息。机器名与 IP 会变，清单要现生成现用，不要存着长期用。',
      examples: [
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-output=json > ecs.json', desc: '① 落盘全量 JSON（机器多时记得处理分页，见 `hw-cross-paging-backoff`）' },
        { cmd: 'jq -r \'.servers[] | [.name, .status, .id] | @tsv\' ecs.json', desc: '② 用 jq 输出「名称 状态 ID」清单，先人工过一眼' },
        { cmd: 'jq -r \'.servers[] | [.name, (.addresses | to_entries[0].value[0].addr)] | @tsv\' ecs.json', desc: '③ 提取名称与私网地址（`addresses` 是「网段 → 地址数组」的嵌套结构）' },
        { cmd: 'jq -r \'.servers[] | "ssh -i ~/.ssh/id_rsa root@" + (.addresses | to_entries[0].value[0].addr)\' ecs.json > ssh-list.sh', desc: '④ 生成 SSH 命令清单；私网地址只在 VPC 内可达' },
        { cmd: 'hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query="publicips[*].{ip:public_ip_address,status:status}" --cli-output=table', desc: '⑤ 需要从公网登录时，先确认哪些机器绑了 EIP' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[*].[name,id,status]" --cli-output=tsv > ecs.tsv', desc: '另一种写法：直接让 KooCLI 输出 tsv，省掉 jq' }
      ],
      notes: [
        '脚本里**只用 `json`/`tsv`**：`--cli-output=table` 的列宽会随内容变化，解析必崩',
        '`--cli-query` 之后输出结构会变（顶层从 `{"servers":[...]}` 变成数组），`jq` 路径要跟着改，否则会得到一堆 `null`',
        '**必须处理分页**：不处理 `--limit`/`--offset` 时几十台以上的环境一定会漏机器（见 `hw-cross-paging-backoff`）',
        '私网 IP 只在 VPC 内可达：从本地登录要么绑 EIP，要么走跳板机/VPN；清单里不要写死密码，统一用密钥登录（见 `ln-ssh`）',
        '不要在清单里写真实 AK/SK 或密码；生成的 `ssh-list.sh` 记得加进 `.gitignore`',
        '多区域环境要外层循环 region 列表，把每个区域的 JSON 分别落盘再合并，别指望一条命令查全网'
      ],
      related: ['hw-ecs-list', 'hw-hcloud-output', 'hw-ecs-eip-bind', 'hw-cross-paging-backoff'],
      docs: 'https://support.huaweicloud.com/clir-ecs/ecs_cli_02.html',
      tags: ['实战', 'ECS', '脚本']
    },

    /* ---------- 53 / 71 ---------- */
    {
      id: 'hw-flow-obs-static-site',
      name: '实战：前端项目发布到 OBS 静态托管',
      kind: 'recipe',
      alias: ['OBS 托管静态网站', 'obsutil 发布前端', 'Vue 项目发布 OBS'],
      level: 2,
      syntax: '（一条链路）npm run build → obsutil sync 上传 → 设置桶/对象权限为公共读 → 配置静态网站托管 → 验证访问',
      summary: '前端构建产物同步到 OBS 并开放匿名读，做成可公网访问的静态站点。',
      desc: '场景：把 Vue/React 的构建产物发布成静态网站。核心是 `obsutil sync` 做增量上传，然后用桶策略或对象 ACL 打开匿名读，最后在桶的"静态网站托管"里指定首页与错误页。**权限配置是最容易翻车的一步**：命令行上传一切正常，浏览器访问却是 403。',
      examples: [
        { cmd: 'npm run build', desc: '① 本地构建，产物目录一般是 `dist/`（按项目实际为准）' },
        { cmd: 'obsutil sync ./dist obs://<桶名>/web/ -dryRun', desc: '② 预演：确认不会把 sourcemap、.env 之类的东西传上去' },
        { cmd: 'obsutil sync ./dist obs://<桶名>/web/ -j=10 -vlength', desc: '③ 正式同步（见 `hw-obsutil-sync`），上传后校验大小' },
        { cmd: 'obsutil chattri obs://<桶名>/web/index.html -acl=public-read', desc: '④ 让入口文件匿名可读；整站公开建议用桶策略统一设置' },
        { cmd: 'obsutil ls obs://<桶名>/web/ -limit=10', desc: '⑤ 核对上传结果（对象名、前缀是否正确）' },
        { cmd: 'curl -I https://<桶名>.obs.cn-north-4.myhuaweicloud.com/web/index.html', desc: '⑥ 验证公网可直接访问，返回 200 且 Content-Type 正确' }
      ],
      notes: [
        '**403 是新手必踩的坑**：桶策略/对象 ACL 不是公共读时，浏览器访问返回 `AccessDenied`，而 `obsutil` 一切正常（它用的是 AK/SK）。要么给桶配公共读策略，要么逐个对象 `chattri -acl=public-read`',
        '静态网站托管的**默认首页与错误页要在桶配置里设置**（控制台：桶 → 静态网站托管），否则访问桶根路径只会列出对象或 404',
        'SPA 项目（Vue Router history 模式）要把错误页也指向 `index.html`，否则刷新子路由直接 404',
        '`obsutil sync` **不会删除** OBS 上多出来的旧文件，带 hash 名的构建产物会越积越多；建议按版本目录发布（`/v1.2.3/`）或定期清理旧前缀（见 `hw-obsutil-rm`）',
        '用 OBS 自带域名只能走 HTTP；要 HTTPS + 自定义域名，需要绑 CDN 加速域名或配置自定义域名与证书',
        '发布后检查响应头 `Content-Type`：`.js` 被当成 `application/octet-stream` 时浏览器会拒绝执行（对象名不带扩展名、或元数据被覆盖都可能引起）',
        '发布脚本里不要把 AK/SK 写进 `package.json` 或 CI 配置，用环境变量或平台密钥库注入（见 `hw-cross-aksk-best-practice`）'
      ],
      related: ['hw-obsutil-sync', 'hw-obsutil-mb', 'hw-obsutil-stat-chattri', 'hw-obsutil-rm'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0042.html',
      tags: ['实战', 'OBS', '静态网站']
    },

    /* ---------- 54 / 71 ---------- */
    {
      id: 'hw-flow-cloud-init',
      name: '实战：云主机初始化（cloud-init 用户数据）',
      kind: 'recipe',
      alias: ['ECS user_data 初始化', 'cloud-init 云主机', '开机自动装软件'],
      level: 3,
      syntax: '（一条链路）写 cloud-init YAML → base64 编码 → 创建 ECS 时通过 user_data 传入 → 开机后用 cloud-init status 验证',
      summary: '用 cloud-init 用户数据让云主机开机自动完成初始化配置。',
      desc: '场景：批量开机器时不想一台台登录装软件、建用户、配时区。ECS 创建接口的 `user_data` 支持传入 **cloud-init 格式**的初始化脚本，实例首次启动时自动执行。关键细节：内容必须 **base64 编码**，且只在实例首次启动时执行一次。',
      examples: [
        { cmd: 'printf \'#cloud-config\\nusers:\\n  - name: ops\\n    sudo: ALL=(ALL) NOPASSWD:ALL\\n    ssh-authorized-keys:\\n      - <公钥内容>\\ntimezone: Asia/Shanghai\\n\' > cloud-init.yaml', desc: '① 写一个最小的 cloud-config（建 ops 用户 + 注入公钥 + 设时区）' },
        { cmd: 'base64 -w0 cloud-init.yaml > userdata.txt', desc: '② Linux/macOS 下 base64 编码（-w0 去掉换行）' },
        { cmd: '[Convert]::ToBase64String([IO.File]::ReadAllBytes("cloud-init.yaml"))', desc: '② Windows PowerShell 下的等价写法' },
        { cmd: 'hcloud ECS CreatePostPaidServers --cli-region=cn-north-4 --server=\'{"name":"web-01","imageRef":"<镜像ID>","flavorRef":"s6.large.2","vpcid":"<VPC ID>","nics":[{"subnet_id":"<子网ID>"}],"root_volume":{"volumetype":"GPSSD","size":40},"key_name":"<密钥对名称>","user_data":"<上一步生成的base64>"}\'', desc: '③ 创建机器时把 base64 内容传给 user_data' },
        { cmd: 'cloud-init status --long', desc: '④ 登录后检查初始化结果；`done` 表示成功，`error` 要去看日志' },
        { cmd: 'cat /var/log/cloud-init-output.log', desc: '⑤ 排查初始化失败：脚本里某一步报错都会记在这里' }
      ],
      notes: [
        '`user_data` 必须 **base64 编码**后传：忘了编码就只会上传一段普通文本，cloud-init 不认，机器照样创建成功但什么也没执行',
        '**只在实例首次启动时执行一次**：改内容不会作用到已运行的机器，重跑要么重建实例，要么登录后手工执行；用 `cloud-init clean` + 重启可以强制重跑（谨慎）',
        '镜像必须带 cloud-init：华为云公共镜像都带，自制镜像要自己确认，否则 user_data 完全被忽略',
        '`user_data` 有大小上限（KB 级）：不要把整个安装包塞进去，用脚本里 `curl`/`wget` 从 OBS 拉（见 `hw-obsutil-cp`）',
        '网络不通时 `yum`/`apt` 步骤会失败，但**实例创建仍然"成功"**——所以一定要验证 `cloud-init status`，不要只看控制台的机器状态',
        '公钥内容写进脚本，私钥永远留在本地；不要把私钥或密码写进 user_data（它会存进实例元数据，能被读到）',
        '生产环境更适合"自定义镜像 + 配置管理（Ansible）"，user_data 适合轻量初始化与实验环境'
      ],
      related: ['hw-ecs-create', 'hw-ecs-keypair-group', 'hw-ims-list-images', 'hw-obsutil-cp'],
      docs: 'https://support.huaweicloud.com/ecs/index.html',
      tags: ['实战', 'cloud-init', '初始化']
    },

    /* ---------- 55 / 71 ---------- */
    {
      id: 'hw-flow-cost-idle',
      name: '实战：成本排查（未挂载云盘与闲置 EIP）',
      kind: 'recipe',
      alias: ['华为云省钱排查', '闲置资源巡检', '账单优化'],
      level: 3,
      syntax: '（一条链路）hcloud EVS ListVolumes（找 available 盘）→ hcloud EIP ListPublicips（找未绑定 EIP）→ 确认无依赖后删除',
      summary: '按月巡检未挂载的云盘、闲置 EIP 与长期关机机器，砍掉沉默成本。',
      desc: '场景：账单比预期高，但看不出钱花在哪。云上最典型的"沉默成本"是三类资源：**未挂载的云硬盘**（按容量计费）、**未绑定的弹性公网 IP**（按小时计费）、**长期关机的云服务器**（计算不收费，但云盘与 EIP 继续收费）。这三种用只读查询就能找出来，删除前必须确认无依赖。',
      examples: [
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-north-4 --cli-query="volumes[?status==\'available\'].{id:id,name:name,size:size,type:volume_type}" --cli-output=table', desc: '① 找出未挂载的云硬盘（`available` 状态）= 白花的钱' },
        { cmd: 'hcloud EIP ListPublicips --cli-region=cn-north-4 --cli-query="publicips[?status==\'DOWN\'].{ip:public_ip_address,id:id}" --cli-output=table', desc: '② 找出未绑定的 EIP（状态值以实际返回为准，未绑定通常是 `DOWN`）' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-query="servers[?status==\'SHUTOFF\'].{name:name,id:id}" --cli-output=table', desc: '③ 找出长期关机的机器：计算不收费，但云盘与 EIP 还在收费' },
        { cmd: 'hcloud EVS ListVolumes --cli-region=cn-east-3 --cli-output=table', desc: '④ 换 region 继续跑；**账单是按区域分开的**，只查一个区会漏一大半' },
        { cmd: 'hcloud EVS DeleteVolume --volume_id=<云硬盘ID> --cli-region=cn-north-4', desc: '⑤ 确认数据无用后删盘（**不可恢复**，删前先确认无快照/镜像依赖）' },
        { cmd: 'hcloud EIP DeletePublicip --publicip_id=<EIP ID> --cli-region=cn-north-4', desc: '⑥ 释放闲置 EIP（释放后 IP 不可找回，注意是否已用于白名单/备案）' }
      ],
      notes: [
        '**未挂载的云盘照常计费**，这是账单里最常见的沉默成本；`available` 状态的盘优先处理（见 `hw-evs-list`）',
        'EIP 只要没释放就计费，**闲置的 EIP 每小时都在烧钱**；不用就释放，别只是解绑',
        'ECS 关机后按需实例的计算资源不再计费，但系统盘/数据盘/EIP 继续计费；长期停机的机器不如做镜像后删掉',
        '排查要**逐 region 跑一遍**，多账号环境还要用 `--cli-profile` 切换；把命令写进月度巡检脚本（`--cli-output=json` 落盘）便于环比',
        '删除前的依赖检查：云盘是否被用作镜像/快照源、EIP 是否已加入白名单或解析到域名、机器上是否有未备份的数据',
        '**删除不可恢复**：先用"停止/解绑"观察一周（确认没人报障）再删，比直接删稳妥得多',
        '费用中心能看账单明细，但"哪个资源闲置"只能靠资源清单判断；真正的治理是标签规范 + 预算告警 + 定期巡检三件套'
      ],
      related: ['hw-evs-list', 'hw-ecs-eip-bind', 'hw-ecs-delete', 'hw-ecs-batch-power'],
      docs: 'https://support.huaweicloud.com/evs/index.html',
      tags: ['实战', '成本', '巡检']
    },

    /* ================= M. AWS CLI 对照 ================= */

    /* ---------- 56 / 71 ---------- */
    {
      id: 'hw-aws-configure',
      name: 'aws configure',
      alias: ['AWS CLI 配置', 'aws profile', 'aws 配置区域'],
      level: 1,
      syntax: 'aws configure [--profile <配置名>]  |  aws configure set <键> <值> [--profile <配置名>]',
      summary: '配置 AWS CLI 的 AK/SK、默认区域与输出格式，profile 是一等公民。',
      desc: '与华为云 `hcloud configure` 结构相似但**配置文件不同**：AWS 用 `~/.aws/credentials`（密钥）与 `~/.aws/config`（区域、输出格式），profile 机制更成熟，一条命令就能切换账号。写法上 `--profile` 可以跟在任何子命令后面。',
      examples: [
        { cmd: 'aws configure', desc: '交互式填入 AK/SK、默认区域（如 ap-southeast-1）与输出格式' },
        { cmd: 'aws configure --profile prod', desc: '为生产账号建一套独立 profile' },
        { cmd: 'aws configure set region ap-southeast-1 --profile prod', desc: '单独改某个 profile 的默认区域' },
        { cmd: 'aws configure list-profiles', desc: '列出本机所有 profile' },
        { cmd: 'aws ec2 describe-instances --profile prod --region ap-southeast-1', desc: '在单条命令上同时指定 profile 与区域' }
      ],
      notes: [
        'AK/SK 以**明文**存在 `~/.aws/credentials`：不要提交到 Git，多用户机器注意权限；CI 里优先用 OIDC/实例角色而不是长期 AK',
        '凭证优先级：命令行参数 > 环境变量（`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`）> profile 文件 > 实例角色；"改了 profile 却不生效"通常是环境变量在起作用',
        '`~/.aws/config` 里的 `region` 只是默认值，任何命令都可以用 `--region` 覆盖；`AWS_DEFAULT_REGION` 环境变量优先级更高',
        '多账号环境建议命名成 `组织-环境`（如 `corp-prod`），并在命令里显式写 `--profile`，避免在生产账号上误操作',
        '与华为云对照：华为云用 `hcloud configure set --cli-profile=`（配置项），AWS 用 `aws configure --profile`（文件里的段）'
      ],
      related: ['hw-aws-sts-identity', 'hw-hcloud-config-set', 'hw-cross-aksk-best-practice'],
      docs: 'https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html',
      tags: ['AWS', '配置', 'profile']
    },

    /* ---------- 57 / 71 ---------- */
    {
      id: 'hw-aws-sts-identity',
      name: 'aws sts get-caller-identity',
      alias: ['AWS 确认当前身份', 'aws 当前账号', 'sts identity'],
      level: 1,
      syntax: 'aws sts get-caller-identity [--profile <配置名>] [--query <JMESPath>]',
      summary: '确认当前凭证属于哪个账号或角色，动手改资源之前先跑这一条。',
      desc: '返回当前凭证的账号 ID、用户/角色 ARN 与用户 ID。多账号、多角色切换时，它是**最便宜的一次确认**：一条命令就能防止"以为在测试账号，其实在删生产资源"。华为云没有完全对等的命令，通常用控制台"我的凭证"或 `hcloud IAM ListUsers` 核对。',
      examples: [
        { cmd: 'aws sts get-caller-identity', desc: '查看当前凭证对应的账号与 ARN' },
        { cmd: 'aws sts get-caller-identity --query \'Account\' --output text', desc: '只取账号 ID，适合写进脚本做前置校验' },
        { cmd: 'aws sts get-caller-identity --profile prod --output table', desc: '确认某个 profile 到底指向哪个账号' },
        { cmd: 'aws sts get-caller-identity --query \'Arn\' --output text', desc: '看是用户（`user/`）还是角色（`assumed-role/`）在调用' }
      ],
      notes: [
        '返回的 `Arn` 里出现 `assumed-role` 说明用的是**临时角色凭证**（好现象）；出现 `user/` 说明在用长期 AK',
        '脚本里可以把账号 ID 作为断言：不是预期账号就直接退出，避免误操作（比事后回滚便宜得多）',
        '凭证过期报 `ExpiredToken` 时重新登录（`aws sso login`）或刷新角色凭证；长期 AK 不存在过期问题，但正因为不过期才更危险',
        '与华为云对照：华为云可用 `hcloud IAM ListPermanentAccessKeys --user_id=<IAM用户ID>` 核对密钥，或直接在控制台看"我的凭证"'
      ],
      related: ['hw-aws-configure', 'hw-iam-aksk-leak', 'hw-cross-aksk-best-practice'],
      docs: 'https://docs.aws.amazon.com/cli/latest/reference/sts/get-caller-identity.html',
      tags: ['AWS', 'STS', '身份']
    },

    /* ---------- 58 / 71 ---------- */
    {
      id: 'hw-aws-ec2-describe',
      name: 'aws ec2 describe-instances',
      alias: ['AWS 查询 EC2', 'aws 查看实例', 'describe-instances'],
      level: 2,
      syntax: 'aws ec2 describe-instances [--instance-ids <id>...] [--filters Name=<键>,Values=<值>] [--query <JMESPath>] [--output table|json|text]',
      summary: '列出 EC2 实例，返回结构比华为云多一层 Reservations 嵌套。',
      desc: 'AWS 的返回结构是 `Reservations[].Instances[]` **两层嵌套**（华为云 ECS 是一层 `servers[]`），写 JMESPath 时少写一层是最常见的错误。过滤有两种：`--filters` 是**服务端过滤**（省流量、快），`--query` 是**客户端过滤**（拿到全量再筛）。',
      examples: [
        { cmd: 'aws ec2 describe-instances --query \'Reservations[].Instances[].{ID:InstanceId,Type:InstanceType,State:State.Name,IP:PrivateIpAddress}\' --output table', desc: '列出实例 ID、规格、状态与私网 IP' },
        { cmd: 'aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --query \'Reservations[].Instances[].InstanceId\' --output text', desc: '服务端过滤只看运行中的实例，输出纯 ID 列表' },
        { cmd: 'aws ec2 describe-instances --filters "Name=tag:Env,Values=prod" --profile prod', desc: '按标签过滤（`tag:<键>` 写法，与华为云的标签过滤是两套）' },
        { cmd: 'aws ec2 describe-instances --instance-ids i-0123456789abcdef0 --output json', desc: '查单台实例的全部字段' }
      ],
      notes: [
        '**`Reservations[].Instances[]` 两层嵌套**：只写 `Instances[]` 会永远得到空结果，这是 JMESPath 最常踩的坑',
        '能用 `--filters` 就别用 `--query`：前者由服务端过滤，后者会先把全量数据拉回本地再筛',
        '`--output text` 适合喂给 shell 循环，`table` 适合人看，`json` 适合交给 `jq`',
        '数据量很大时命令会变慢（CLI v2 会自动翻页聚合），必要时用 `--page-size` 控制单次请求量',
        '与华为云对照：`hcloud ECS ListServersDetails --cli-query="servers[*].{...}"`，注意少一层嵌套'
      ],
      related: ['hw-aws-ec2-power', 'hw-aws-configure', 'hw-ecs-list'],
      docs: 'https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instances.html',
      tags: ['AWS', 'EC2', '查询']
    },

    /* ---------- 59 / 71 ---------- */
    {
      id: 'hw-aws-ec2-power',
      name: 'aws ec2 start-instances / stop-instances',
      alias: ['AWS 开关机', 'aws 终止实例', 'terminate-instances'],
      level: 2,
      syntax: 'aws ec2 start-instances --instance-ids <id>...  |  aws ec2 stop-instances --instance-ids <id>...  |  aws ec2 terminate-instances --instance-ids <id>...',
      summary: '开关机与终止 EC2 实例，stop 可恢复而 terminate 是永久删除。',
      desc: '三个动作只差一个词，后果完全不同：`stop` 停机（可再 `start`，EBS 数据保留）、`start` 开机、`terminate` **永久终止实例**（默认连带删除根卷）。批量操作只要在 `--instance-ids` 后跟多个 ID。',
      examples: [
        { cmd: 'aws ec2 stop-instances --instance-ids i-0123456789abcdef0', desc: '停止单台实例（可恢复）' },
        { cmd: 'aws ec2 start-instances --instance-ids i-0123456789abcdef0', desc: '重新启动该实例' },
        { cmd: 'aws ec2 stop-instances --instance-ids i-0123456789abcdef0 i-0abcdef1234567890', desc: '一次停多台：实例 ID 用空格分隔' },
        { cmd: 'aws ec2 terminate-instances --instance-ids i-0123456789abcdef0', desc: '⚠️ 终止实例 = 永久删除，默认连根卷一起删，不可恢复' }
      ],
      notes: [
        '**`stop` 与 `terminate` 差一个词却差一条命**：脚本里把动作写成变量并加白名单校验，别让人手滑',
        '停机后 EBS 卷与弹性 IP 继续计费（仅计算资源停收），长期停机的实例不如做 AMI 后终止',
        'AWS 实例 ID 固定是 `i-` 开头的格式（华为云是 UUID），可以用前缀做基本校验，防止把别的 ID 传进来',
        '开关机是**异步**的：命令返回的是状态变更请求，要再 `describe-instances` 看 `State.Name` 是否到 `running`/`stopped`',
        '`terminate` 默认 `DeleteOnTermination=true` 会删根卷，附加卷默认保留（继续计费）；终止后记得清理残留卷与 EIP',
        '与华为云对照：`hcloud ECS BatchStopServers`/`BatchStartServers`（见 `hw-ecs-batch-power`），华为云用请求体给 ID 列表而不是命令行参数'
      ],
      related: ['hw-aws-ec2-describe', 'hw-ecs-batch-power', 'hw-flow-cost-idle'],
      docs: 'https://docs.aws.amazon.com/cli/latest/reference/ec2/stop-instances.html',
      tags: ['AWS', 'EC2', '开关机']
    },

    /* ---------- 60 / 71 ---------- */
    {
      id: 'hw-aws-s3-sync',
      name: 'aws s3 sync',
      alias: ['AWS 同步 S3', 'aws s3 上传目录', 's3 sync --delete'],
      level: 2,
      syntax: 'aws s3 sync <本地路径|s3://桶名[/前缀]> <s3://桶名[/前缀]|本地路径> [--dryrun] [--delete] [--exclude <模式>] [--include <模式>]',
      summary: '把本地目录同步到 S3，加 --delete 会删除目标端多余对象。',
      desc: 'AWS 的同步是**镜像式**的：默认只补齐新增/变化的文件，加上 `--delete` 后目标端多出来的对象也会被删掉，两边完全一致。这与华为云 `obsutil sync`（只补齐、**不删除**）是关键差异，两个云一起用时最容易搞混。',
      examples: [
        { cmd: 'aws s3 sync ./dist s3://<全局唯一的桶名>/ --dryrun', desc: '预演：逐条打印将要执行的动作，不真正执行' },
        { cmd: 'aws s3 sync ./dist s3://<桶名>/ --delete', desc: '⚠️ 镜像同步：会删除目标端多余对象，务必先 --dryrun 确认' },
        { cmd: 'aws s3 sync s3://<桶名>/backup ./backup', desc: '反向同步：把 S3 前缀拉到本地' },
        { cmd: 'aws s3 sync ./dist s3://<桶名>/ --exclude "*.map" --include "*.js"', desc: '按模式筛选；注意 `--exclude`/`--include` 的**顺序会影响结果**' },
        { cmd: 'aws s3 cp ./app.zip s3://<桶名>/release/app.zip', desc: '传单个文件用 `s3 cp`' }
      ],
      notes: [
        '`--delete` 是**破坏性**的：先 `--dryrun`。华为云的 `obsutil sync` 没有这个参数（也不删对象），别把两边当成同一个命令',
        '`--dryrun` 是**全小写**（obsutil 是 `-dryRun`），写错只会被当成未知参数报错',
        '默认按**大小与修改时间**比较：同名同大小但内容不同的文件不会重传；需要更严格的比较要用 `--exact-timestamps` 等参数（见官方文档）',
        'S3 桶名同样**全局唯一**，且创建时需要指定区域（`--region`），跨区域同步会产生流量费',
        '大文件并发可以调 `aws configure set s3.max_concurrent_requests 20`；并发过高在本机带宽打满时反而更慢',
        '与华为云对照：`obsutil sync ./dist obs://<桶名>/ -dryRun -j=10`（见 `hw-obsutil-sync`）'
      ],
      related: ['hw-obsutil-sync', 'hw-aws-s3-presign', 'hw-flow-obs-static-site'],
      docs: 'https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html',
      tags: ['AWS', 'S3', '同步']
    },

    /* ---------- 61 / 71 ---------- */
    {
      id: 'hw-aws-s3-presign',
      name: 'aws s3 presign',
      alias: ['AWS 临时下载链接', 'aws s3 预签名URL', 'presign'],
      level: 2,
      syntax: 'aws s3 presign s3://<桶名>/<对象名> [--expires-in <秒>]',
      summary: '给 S3 对象生成带签名的临时下载链接，默认有效期一小时。',
      desc: '私有桶里的对象默认不能匿名下载，`presign` 生成一条带签名的临时 URL，在有效期内谁拿到都能访问。默认有效期 3600 秒（1 小时），最长 7 天。华为云对应的是 `obsutil sign`，但**默认有效期只有 300 秒**，参数单位也不同（见 `hw-obsutil-sign`）。',
      examples: [
        { cmd: 'aws s3 presign s3://<桶名>/report/2025-01.xlsx', desc: '生成默认 1 小时有效的下载链接' },
        { cmd: 'aws s3 presign s3://<桶名>/report/2025-01.xlsx --expires-in 3600', desc: '显式指定有效期（单位秒）' },
        { cmd: 'aws s3 presign s3://<桶名>/report/2025-01.xlsx --expires-in 604800', desc: '最长 7 天（604800 秒），慎用长有效期' },
        { cmd: 'aws s3 ls s3://<桶名>/report/', desc: '生成前确认对象名存在，签错文件比签错链接更尴尬' }
      ],
      notes: [
        '`--expires-in` 单位是**秒**，默认 3600、最大 604800（7 天）；超过上限会直接报错',
        '生成的 URL 里带签名参数，**谁拿到谁能下**：不要贴到公开渠道、不要写进工单附件',
        '对象必须先存在，且调用者要有读权限；用角色凭证时 URL 的有效期还受**凭证本身有效期**限制（凭证过期链接就失效）',
        '与华为云对照：`obsutil sign obs://<桶名>/<对象名> -e=3600`；华为云参数是 `-e` 且**默认只有 300 秒**，写成 `-e=1` 得到的链接 1 秒失效'
      ],
      related: ['hw-obsutil-sign', 'hw-aws-s3-sync', 'hw-obsutil-stat-chattri'],
      docs: 'https://docs.aws.amazon.com/cli/latest/reference/s3/presign.html',
      tags: ['AWS', 'S3', '临时链接']
    },

    /* ---------- 62 / 71 ---------- */
    {
      id: 'hw-aws-eks-ecr',
      name: 'aws eks update-kubeconfig / ecr get-login-password',
      alias: ['AWS 连接EKS', 'aws 登录 ECR', '容器服务对接'],
      level: 3,
      syntax: 'aws eks update-kubeconfig --name <集群名> --region <区域>  |  aws ecr get-login-password --region <区域> | docker login --username AWS --password-stdin <账号ID>.dkr.ecr.<区域>.amazonaws.com',
      summary: '把 EKS 集群写进 kubeconfig，以及登录 ECR 私有镜像仓库。',
      desc: '两个容器相关的对接命令：`eks update-kubeconfig` 把集群连接信息写进 `~/.kube/config` 并切换 current-context；`ecr get-login-password` 输出仓库密码，通过管道交给 `docker login`。与华为云的差别：CCE 是**控制台下载静态 kubeconfig**，SWR 是普通 `docker login`（见 `hw-cce-kubeconfig`）。',
      examples: [
        { cmd: 'aws eks update-kubeconfig --name <集群名> --region ap-southeast-1', desc: '把 EKS 集群写进 kubeconfig（需要先 `aws configure`）' },
        { cmd: 'aws eks update-kubeconfig --name <集群名> --region ap-southeast-1 --profile prod', desc: '多账号环境下显式指定 profile' },
        { cmd: 'kubectl config get-contexts', desc: '确认当前上下文，多集群环境必查（见 `k8s-config`）' },
        { cmd: 'aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin <账号ID>.dkr.ecr.ap-southeast-1.amazonaws.com', desc: '登录 ECR 私有仓库，之后才能 docker push' },
        { cmd: 'docker push <账号ID>.dkr.ecr.ap-southeast-1.amazonaws.com/<仓库名>:1.0.0', desc: '推送镜像（见 `dk-push`）' }
      ],
      notes: [
        '`update-kubeconfig` 会**直接切换 current-context**：切完先 `kubectl config get-contexts` 看一遍，避免在错误的集群上执行删除',
        'EKS 的 kubeconfig 里用的是 `aws eks get-token` 这类 **exec 插件**，每条 kubectl 命令都会去调 AWS API 换 token，所以 AWS 凭证过期时 kubectl 会报取凭证失败',
        '`get-login-password` 输出的是**密码明文**，必须用 `--password-stdin` 管道传给 `docker login`；直接写进命令历史等于泄露',
        'ECR 的 registry 地址格式是 `<账号ID>.dkr.ecr.<区域>.amazonaws.com`，区域与仓库所在区域一致',
        '与华为云对照：CCE 用控制台下载 kubeconfig（`hw-cce-kubeconfig`），SWR 用 `docker login swr.cn-north-4.myhuaweicloud.com`（见 `dk-push`）'
      ],
      related: ['hw-cce-kubeconfig', 'hw-cce-list-clusters', 'hw-aws-configure'],
      docs: 'https://docs.aws.amazon.com/cli/latest/reference/eks/update-kubeconfig.html',
      tags: ['AWS', 'EKS', 'ECR']
    },

    /* ================= N. Azure CLI 对照 ================= */

    /* ---------- 63 / 71 ---------- */
    {
      id: 'hw-az-login',
      name: 'az login',
      alias: ['Azure 登录', 'az 登录订阅', 'azure cli login'],
      level: 1,
      syntax: 'az login [--tenant <租户ID>]  |  az login --service-principal -u <应用ID> -p <客户端密钥> --tenant <租户ID>',
      summary: '登录 Azure，交互式登录适合本机，CI 里要用服务主体。',
      desc: '`az login` 会打开浏览器做交互式认证，适合个人机器；无人值守环境（CI/CD）要用**服务主体**（service principal）或托管身份。登录只是认证，具体操作哪个订阅还要靠 `az account set` 切换（见 `hw-az-account-list`）。',
      examples: [
        { cmd: 'az login', desc: '交互式登录（会打开浏览器）' },
        { cmd: 'az login --tenant <租户ID>', desc: '多租户环境下指定租户登录' },
        { cmd: 'az login --service-principal -u <应用ID> -p <客户端密钥> --tenant <租户ID>', desc: 'CI/CD 用服务主体登录（密钥请从平台密钥库注入）' },
        { cmd: 'az account show --output table', desc: '登录后确认当前订阅与登录身份' },
        { cmd: 'az logout', desc: '退出并清理本地凭据缓存' }
      ],
      notes: [
        '`az login` 是**交互式**的，脚本/CI 里跑会卡住；无人值守必须用 `--service-principal` 或托管身份',
        '服务主体的客户端密钥是敏感凭据，放 CI 的密钥库/环境变量，**不要提交到 Git**',
        '登录后默认落在某个订阅上，**务必 `az account set --subscription <订阅ID>` 选对**再操作',
        '与华为云对照：华为云没有浏览器登录，凭据就是 AK/SK（`hcloud configure init`，见 `hw-hcloud-config-init`）'
      ],
      related: ['hw-az-account-list', 'hw-az-aks-credentials', 'hw-cross-aksk-best-practice'],
      docs: 'https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli',
      tags: ['Azure', '登录', '认证']
    },

    /* ---------- 64 / 71 ---------- */
    {
      id: 'hw-az-account-list',
      name: 'az account list / az account set',
      alias: ['Azure 切换订阅', 'az 查看订阅', 'az --output table --query'],
      level: 1,
      syntax: 'az account list [--all] [--output table] [--query "<JMESPath>"]  |  az account set --subscription <订阅ID>',
      summary: '列出并切换订阅，Azure 的账号就是订阅，改错订阅是常见事故。',
      desc: 'Azure 的"账号"是**订阅（subscription）**，一个身份可以访问多个订阅，所有资源都归属于某个订阅。`az account list` 列出来，`az account set` 切过去。`--query` 用的是 JMESPath，但返回通常是**顶层数组**（不像华为云包一层 `{"servers":[...]}`）。',
      params: [
        { flag: '--output table|json|tsv|yaml|none', desc: '输出格式；脚本里优先 `tsv`' },
        { flag: '--query "<JMESPath>"', desc: '客户端过滤与投影，直接作用在返回的顶层结构上' },
        { flag: '--all', desc: '包含被隐藏/禁用的订阅（部分版本支持）' },
        { flag: '--subscription <ID或名称>', desc: '指定订阅，可写在多数命令上临时生效' }
      ],
      examples: [
        { cmd: 'az account list --output table', desc: '列出可访问的订阅' },
        { cmd: 'az account list --query "[?isDefault].{Name:name,ID:id,State:state}" --output table', desc: '只看默认订阅（`--query` 直接作用在顶层数组上）' },
        { cmd: 'az account set --subscription <订阅ID>', desc: '切换默认订阅，切完再 `az account show` 确认' },
        { cmd: 'az account show --query id --output tsv', desc: '取当前订阅 ID，适合脚本里做前置校验' },
        { cmd: 'az vm list --subscription <订阅ID> --output table', desc: '在单条命令上临时指定订阅，不改默认值' }
      ],
      notes: [
        '**改错订阅是最常见的 Azure 事故**：多订阅环境建议每条命令都带 `--subscription`，或在脚本开头断言订阅 ID',
        '`--query` 是 JMESPath，与华为云 `--cli-query`、AWS `--query` 同源，但**返回结构不一样**：Azure 常见顶层数组，华为云是包一层的对象，AWS 有 `Reservations[]` 嵌套',
        '`--output` 可选 `json/jsonc/table/tsv/yaml/yamlc/none`；`tsv` 无表头、字段用制表符分隔，最适合喂给 shell',
        '订阅 ID 是 UUID 形式，与名称都能用，但脚本里用 ID 更稳（名称可改）'
      ],
      related: ['hw-az-login', 'hw-az-vm', 'hw-aws-configure'],
      docs: 'https://learn.microsoft.com/en-us/cli/azure/account',
      tags: ['Azure', '订阅', 'query']
    },

    /* ---------- 65 / 71 ---------- */
    {
      id: 'hw-az-vm',
      name: 'az vm list / az vm create',
      alias: ['Azure 虚拟机', 'az 创建虚拟机', 'az vm list'],
      level: 2,
      syntax: 'az vm list [--show-details] [--query "<JMESPath>"]  |  az vm create --resource-group <资源组> --name <虚拟机名> --image <镜像> --size <规格> [--location <区域>]',
      summary: '列出与创建 Azure 虚拟机，资源组与位置是两个必填的组织维度。',
      desc: 'Azure 的资源必须落在**资源组（resource group）**里，所以几乎所有命令都要 `--resource-group`；`--location` 是区域标识（如 `eastasia`）。`az vm list` 默认**不含电源状态**，要看运行状态必须加 `--show-details`。',
      examples: [
        { cmd: 'az vm list --output table', desc: '列出当前订阅的虚拟机（只有基本字段）' },
        { cmd: 'az vm list --show-details --query "[?powerState==\'VM running\'].name" --output tsv', desc: '只看运行中的机器（要电源状态必须加 `--show-details`）' },
        { cmd: 'az vm list --query "[].{Name:name,RG:resourceGroup,Size:hardwareProfile.vmSize,Loc:location}" --output table', desc: '投影出名称、资源组、规格与区域' },
        { cmd: 'az vm create --resource-group <资源组名> --name <虚拟机名> --image Ubuntu2204 --size Standard_B2s --location eastasia --admin-username azureuser --generate-ssh-keys', desc: '创建一台 Ubuntu 虚拟机并生成 SSH 密钥' },
        { cmd: 'az vm list-ip-addresses --resource-group <资源组名> --name <虚拟机名> --output table', desc: '查虚拟机的公网/私网地址' }
      ],
      notes: [
        '**资源组是 Azure 特有的组织层**：华为云用 VPC/企业项目组织资源，Azure 用资源组（删除资源组会连带删除组内所有资源，慎用）',
        '`az vm list` 默认**不返回电源状态**，判断机器是否在运行要加 `--show-details`（性能稍差但信息完整）',
        '`--location` 是 Azure 的区域标识（`eastasia`、`chinaeast2` 等），与华为云 `cn-north-4` 不是一套命名，不能互相照抄',
        '`--generate-ssh-keys` 会生成并复用 `~/.ssh/id_rsa.pub`；生产建议自己指定 `--ssh-key-values` 并管理好密钥',
        '创建后还要配 NSG（网络安全组，对应华为云安全组）与公网 IP，否则默认可能无法从外部访问（见 `hw-vpc-sg-rule`）'
      ],
      related: ['hw-az-account-list', 'hw-az-aks-credentials', 'hw-ecs-list'],
      docs: 'https://learn.microsoft.com/en-us/cli/azure/vm',
      tags: ['Azure', '虚拟机', '资源组']
    },

    /* ---------- 66 / 71 ---------- */
    {
      id: 'hw-az-storage-blob-upload',
      name: 'az storage blob upload',
      alias: ['Azure Blob 上传', 'az storage 上传目录', 'azure 对象存储'],
      level: 2,
      syntax: 'az storage blob upload --account-name <存储账号> --container-name <容器名> --file <本地文件> --name <blob 名> [--overwrite]  |  az storage blob upload-batch --account-name <存储账号> --destination <容器名> --source <本地目录>',
      summary: '上传文件或整个目录到 Azure Blob 容器，比 OBS 多一层存储账号。',
      desc: 'Azure 的对象存储是"**存储账号 → 容器 → blob**"三层结构（华为云 OBS 是"桶 → 对象"两层），存储账号是命名空间与计费的边界。`blob upload` 传单文件，`blob upload-batch` 传整个目录；批量上传默认是"补齐"语义，**不会删除目标端多余文件**。',
      examples: [
        { cmd: 'az storage container create --account-name <存储账号> --name web --public-access blob', desc: '创建容器并允许匿名读 blob（静态网站需要）' },
        { cmd: 'az storage blob upload --account-name <存储账号> --container-name web --file ./dist/index.html --name index.html --overwrite', desc: '上传单个文件（`--overwrite` 覆盖同名 blob）' },
        { cmd: 'az storage blob upload-batch --account-name <存储账号> --destination web --source ./dist --overwrite', desc: '批量上传整个目录到容器' },
        { cmd: 'az storage blob list --account-name <存储账号> --container-name web --query "[].name" --output tsv', desc: '列出容器内的 blob，核对上传结果' },
        { cmd: 'az storage blob download --account-name <存储账号> --container-name web --name index.html --file ./index.html', desc: '下载单个 blob 做校验' }
      ],
      notes: [
        '**多一层存储账号**：容器名在账号内唯一、账号名全局唯一；排查 403 时先确认账号名、容器名与凭据三件事',
        '认证方式有三种：`az login` 的登录态、`--account-key`（账号密钥）、`--sas-token`（共享访问签名）；密钥与 SAS 都是敏感凭据，**不要提交到 Git**',
        '`--public-access blob` 让容器内所有 blob 匿名可读；静态网站至少要这个级别，含敏感数据的容器保持 `private`',
        '批量上传**不删除**目标端多余文件；要严格一致得用 `azcopy sync`（另一个工具）而不是 `blob upload-batch`',
        '与华为云对照：`obsutil sync ./dist obs://<桶名>/ -dryRun`（见 `hw-obsutil-sync`），华为云没有"存储账号"这一层'
      ],
      related: ['hw-obsutil-sync', 'hw-obsutil-cp', 'hw-flow-obs-static-site'],
      docs: 'https://learn.microsoft.com/en-us/cli/azure/storage/blob',
      tags: ['Azure', 'Blob', '上传']
    },

    /* ---------- 67 / 71 ---------- */
    {
      id: 'hw-az-aks-credentials',
      name: 'az aks get-credentials',
      alias: ['Azure 连接 AKS', 'az 获取集群凭证', 'aks kubeconfig'],
      level: 2,
      syntax: 'az aks get-credentials --resource-group <资源组名> --name <集群名> [--admin] [--overwrite-existing]',
      summary: '把 AKS 集群凭证写进 kubeconfig，admin 凭证权限极大要慎用。',
      desc: '与 AWS 的 `eks update-kubeconfig`、华为云 CCE 的"控制台下载 kubeconfig"目的相同：拿到集群连接信息后，`kubectl` 的用法与标准 Kubernetes 完全一致。区别在于 `--admin` 会取**集群管理员凭证**，绕过 K8s RBAC，权限极大。',
      examples: [
        { cmd: 'az aks get-credentials --resource-group <资源组名> --name <集群名>', desc: '取普通用户凭证（走 K8s RBAC，日常用这个）' },
        { cmd: 'az aks get-credentials --resource-group <资源组名> --name <集群名> --overwrite-existing', desc: '凭证过期或内容变化时覆盖同名条目' },
        { cmd: 'az aks get-credentials --resource-group <资源组名> --name <集群名> --admin', desc: '取管理员凭证：绕过 RBAC，仅在应急时使用' },
        { cmd: 'kubectl config get-contexts', desc: '确认 current-context 指向哪个集群再操作（见 `k8s-config`）' },
        { cmd: 'kubectl get nodes -o wide', desc: '验证连通性；之后的命令与标准 K8s 完全一致' }
      ],
      notes: [
        '`--admin` 拿的是**集群管理员凭证**：权限绕过 K8s RBAC，日常绝不要用，用完记得删掉对应 context',
        '命令会**直接切换 current-context**：多集群环境先 `kubectl config get-contexts`，在生产集群上删除资源前务必确认上下文',
        'AKS 的 kubeconfig 是**静态证书**（有效期内一直可用），与 EKS 的 exec 换 token 机制不同；证书过期后重新执行本命令',
        'kubeconfig 是敏感文件，不要提交到 Git；团队协作按最小权限分发，而不是人手一份 admin 凭证',
        '与华为云对照：CCE 从控制台下载 kubeconfig（见 `hw-cce-kubeconfig`），集群内的 kubectl 用法三家完全一致'
      ],
      related: ['hw-az-account-list', 'hw-cce-kubeconfig', 'hw-aws-eks-ecr'],
      docs: 'https://learn.microsoft.com/en-us/cli/azure/aks',
      tags: ['Azure', 'AKS', 'kubeconfig']
    },

    /* ================= O. 跨云通用 ================= */

    /* ---------- 68 / 71 ---------- */
    {
      id: 'hw-cross-aksk-best-practice',
      name: '跨云 AK/SK 与 IAM 子用户最佳实践',
      kind: 'recipe',
      alias: ['多云凭据管理', 'IAM 子用户最佳实践', '密钥轮换'],
      level: 3,
      syntax: '（跨云对照）华为云 IAM 子用户 + 委托  ←→  AWS IAM user / IAM role  ←→  Azure 服务主体 / 托管身份',
      summary: '三家云的凭据模型对照：主账号只用来管人，干活一律用子身份。',
      desc: '三家云的凭据模型思路一致、名字不同：华为云叫 IAM 子用户与**委托（agency）**，AWS 叫 **IAM user / IAM role**，Azure 叫**服务主体（service principal）/ 托管身份**。共同原则只有一条：**主账号凭据只用来管人，凡是机器在干的活都用子身份 + 最小权限**。',
      examples: [
        { cmd: 'hcloud IAM CreateUser --cli-region=cn-north-4 --user=\'{"name":"ci-deploy","domain_id":"<账号ID>","password":"<初始密码>"}\'', desc: '华为云：创建给 CI 用的子用户（见 `hw-iam-user`）' },
        { cmd: 'aws iam create-user --user-name ci-deploy', desc: 'AWS：创建同名子用户' },
        { cmd: 'az ad sp create-for-rbac --name ci-deploy --role contributor --scopes /subscriptions/<订阅ID>', desc: 'Azure：创建服务主体并授予角色（示例用 contributor，生产请按最小权限收敛）' },
        { cmd: 'hcloud IAM ListPermanentAccessKeys --cli-region=cn-north-4 --user_id=<IAM用户ID>', desc: '定期核对密钥数量与创建时间，清理长期未用的（见 `hw-iam-aksk-leak`）' },
        { cmd: 'aws iam list-access-keys --user-name ci-deploy', desc: 'AWS 侧做同样的密钥盘点' }
      ],
      notes: [
        '三条跨云通用的红线：① 一套系统一把密钥（便于单独吊销）；② 权限最小化（按动作 + 资源范围授权，不给 `*:*`）；③ 定期轮换（90 天是常见基线）并设到期提醒',
        '**绝不把密钥写进**：代码仓库、Docker 镜像、前端代码、日志输出、聊天记录、工单附件；本手册所有示例统一写 `<你的AK>`/`<你的SK>`',
        '优先用**临时凭证**：华为云委托换取的临时 AK/SK（要带 securitytoken）、AWS STS/AssumeRole 或实例角色、Azure 托管身份——有效期短、免轮换、泄露面小',
        '子身份创建后**必须授权**，否则"有身份没权力"；授权从只读策略起步，按需再加',
        '命令形式完全不同（`hcloud IAM` / `aws iam` / `az ad`），但"主账号不用、子身份干活、密钥可轮换"的原则一模一样，跨云方案可以复用同一套管理制度',
        '定期做凭据审计：列出全部用户的密钥与最后使用时间（华为云 IAM + 云审计 CTS、AWS credential report、Azure 登录日志），清理 90 天未使用的'
      ],
      related: ['hw-iam-user', 'hw-iam-agency', 'hw-iam-aksk-leak', 'hw-aws-configure'],
      docs: 'https://support.huaweicloud.com/iam/index.html',
      tags: ['跨云', 'AK/SK', 'IAM']
    },

    /* ---------- 69 / 71 ---------- */
    {
      id: 'hw-cross-dryrun',
      name: '--dryrun / -dryRun（预演）',
      kind: 'recipe',
      alias: ['预演模式', 'dry run 干跑', '执行前先演练'],
      level: 2,
      syntax: 'obsutil sync <源> <目标> -dryRun  |  aws s3 sync <源> <目标> --dryrun  |  aws ec2 <操作> --dry-run  |  hcloud <服务> <操作> --dry_run=true',
      summary: '改生产之前先预演一遍，三家的预演参数写法各不相同。',
      desc: '预演是"改生产之前唯一不花钱的保险"。三家云的写法不统一：obsutil 是 `-dryRun`（单横线 + 大写 R），AWS S3 是 `--dryrun`（全小写），AWS EC2 的 `--dry-run` 是**权限预检**（不真的执行），华为云部分创建类接口支持 `--dry_run=true`。写错的表现通常是"未知参数"直接报错。',
      examples: [
        { cmd: 'obsutil sync ./dist obs://<桶名>/web/ -dryRun', desc: '华为云 OBS：只列出将要上传的文件，不真正上传（见 `hw-obsutil-sync`）' },
        { cmd: 'aws s3 sync ./dist s3://<桶名>/ --dryrun', desc: 'AWS S3：逐条打印将要执行的动作（注意全小写）' },
        { cmd: 'aws ec2 stop-instances --instance-ids i-0123456789abcdef0 --dry-run', desc: 'AWS EC2 权限预检：返回 `DryRunOperation` 说明有权限，`UnauthorizedOperation` 说明没有' },
        { cmd: 'hcloud ECS CreatePostPaidServers --cli-region=cn-north-4 --dry_run=true --cli-jsonInput=./create-ecs.json', desc: '华为云：部分创建接口支持预检，不支持时会报参数错误，先用 `--help` 确认' }
      ],
      notes: [
        '**删除类、同步类、批量类命令一律先预演**：`obsutil rm -r`、`aws s3 sync --delete`、批量关机这类操作没有"撤销"',
        '注意大小写：obsutil 是 `-dryRun`，AWS S3 是 `--dryrun`，写成对方那套会被当成未知参数直接报错',
        '预演**只校验参数与权限**，不校验业务约束（配额、名称冲突、依赖关系、IP 是否够用），所以"预演通过"不等于"一定能成功"',
        '没有预演能力的接口（如华为云多数删除接口），至少先跑一遍**只读查询**确认目标 ID 与范围，再执行写操作',
        '把"预演 → 人工确认 → 执行"写进发布流程；跳过预演的批量操作是云上事故的主要来源之一'
      ],
      related: ['hw-obsutil-sync', 'hw-aws-s3-sync', 'hw-obsutil-rm', 'hw-ecs-delete'],
      docs: 'https://support.huaweicloud.com/utiltg-obs/obs_11_0042.html',
      tags: ['跨云', '预演', '安全']
    },

    /* ---------- 70 / 71 ---------- */
    {
      id: 'hw-cross-paging-backoff',
      name: '分页与限流退避（跨云通用）',
      kind: 'recipe',
      alias: ['API 分页处理', '限流重试', '指数退避'],
      level: 3,
      syntax: '（跨云对照）hcloud <操作> --limit=<n> --offset=<n>  |  aws <服务> <操作> --page-size=<n> --max-items=<n>  |  obsutil ls -limit=<n> -marker=<对象名>',
      summary: '处理分页与限流退避，不处理分页的脚本一定会漏资源。',
      desc: '两个问题在跨云脚本里必然遇到：**分页**（默认只返回一页，剩下的要自己翻）与**限流**（调用太快被服务端拒绝）。三家云的参数名都不一样：华为云用 `--limit`/`--offset`，AWS 用 `--page-size`/`--max-items`（返回里带 `NextToken`），obsutil 用 `-limit`/`-marker`。Azure CLI 多数 list 命令自动翻页，通常靠 `--query` 在客户端筛选。',
      examples: [
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --limit=100 --offset=0 --cli-query="servers[*].id" --cli-output=tsv', desc: '华为云第一页（`--limit` + `--offset`）' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --limit=100 --offset=100 --cli-query="servers[*].id" --cli-output=tsv', desc: '华为云第二页：偏移量累加，直到返回空列表为止' },
        { cmd: 'aws ec2 describe-instances --page-size 50 --max-items 200 --query \'Reservations[].Instances[].InstanceId\' --output text', desc: 'AWS：`--page-size` 控制单次请求量，`--max-items` 控制总返回量' },
        { cmd: 'obsutil ls obs://<桶名>/logs/ -limit=100 -marker=logs/app-2026-02-01.log', desc: 'obsutil：`-limit` + `-marker` 翻页（见 `hw-obsutil-ls`）' }
      ],
      notes: [
        '**默认页大小往往远小于你的想象**：华为云很多接口默认只返回 25 条，不处理分页的盘点脚本会悄悄漏掉大部分资源',
        '分页循环的终止条件写成"取到空列表就停"，比按资源总数循环更稳（总数本身也可能是估算的）',
        '被限流时（HTTP 429，或 `Throttling`/`RequestLimitExceeded` 这类错误）**不要死循环重试**：用指数退避 + 随机抖动（1s、2s、4s、8s…各加随机毫秒），同时降低并发',
        '批量操作前先算请求数：1000 台机器 × 每条命令 1 次调用就可能触发限流，能用批量接口（一次提交多个 ID）就别循环',
        '把 API 调用间隔与并发写成可配置项；云上资源少的测试环境跑得通、生产一跑就失败，通常是并发太高被限流',
        '读接口做重试是安全的，**写接口重试要幂等**：确认接口是否幂等（如按 ID 删除、按名称创建），否则重试可能造成重复资源'
      ],
      related: ['hw-hcloud-output', 'hw-ecs-list', 'hw-obsutil-ls', 'hw-flow-ssh-inventory'],
      docs: 'https://support.huaweicloud.com/hcli/index.html',
      tags: ['跨云', '分页', '限流']
    },

    /* ---------- 71 / 71 ---------- */
    {
      id: 'hw-cross-region-endpoint',
      name: 'region 与 endpoint 对应关系（跨云）',
      kind: 'recipe',
      alias: ['区域标识对照', 'endpoint 与 region', '跨云区域命名'],
      level: 2,
      syntax: '（跨云对照）华为云 --cli-region=cn-north-4  |  AWS --region ap-southeast-1  |  Azure --location eastasia  |  obsutil -e=obs.cn-north-4.myhuaweicloud.com',
      summary: '三家云的区域标识与端点写法完全不同，写错往往不报错只是查不到。',
      desc: '区域决定了 API 端点、资源可见性与计费口径，而三家云的标识风格毫无共通之处：华为云是"国家-方位-序号"（`cn-north-4` 北京四、`cn-east-3` 上海一、`cn-south-1` 广州），AWS 是 `us-east-1`/`ap-southeast-1`，Azure 是 `eastasia`/`chinaeast2`。同一家云内部也不统一：KooCLI 用 `--cli-region`，obsutil 用 endpoint。',
      examples: [
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-north-4 --cli-output=table', desc: '华为云北京四' },
        { cmd: 'hcloud ECS ListServersDetails --cli-region=cn-east-3 --cli-output=table', desc: '华为云上海一：同一条命令换 region 就是另一批资源' },
        { cmd: 'obsutil ls -e=obs.cn-south-1.myhuaweicloud.com', desc: 'obsutil 用 **endpoint** 而不是 region 名（广州）' },
        { cmd: 'aws ec2 describe-instances --region ap-southeast-1 --query \'Reservations[].Instances[].InstanceId\' --output text', desc: 'AWS 亚太（新加坡）' },
        { cmd: 'az vm list --query "[].location" --output tsv', desc: 'Azure 用 `--location`，先看现有资源都落在哪些位置' },
        { cmd: 'hcloud configure list', desc: '不确定当前默认区域时先看一眼配置（见 `hw-hcloud-config-list`）' }
      ],
      notes: [
        '华为云常用 region：`cn-north-4`（北京四）、`cn-east-3`（上海一）、`cn-south-1`（广州）、`cn-north-1`（北京一）——**写错 region 的表现常常不是报错，而是"查不到资源"**',
        '**`project_id` 与 region 必须匹配**：同一账号在不同区域的项目 ID 不同，混用会报鉴权失败或资源不存在，这是 KooCLI 最高频的坑（见 `hw-hcloud-config-set`）',
        '同一家云内部两套写法：KooCLI 用 `--cli-region=cn-north-4`，obsutil 用 `-e=obs.cn-north-4.myhuaweicloud.com`，不能互换',
        'AWS 的全局服务（IAM、STS、Route 53）用全球端点或 `us-east-1`，但**不代表 region 参数可以省**：区域写错可能操作到别的分区（如中国区与全球区隔离）',
        '跨区域复制/同步（OBS 跨区域复制、S3 CRR、快照复制）都会产生**跨区流量费**，规划时要把"数据出区域"算进成本',
        '多区域脚本的正确写法是外层循环 region 列表 + 每区结果分开落盘，**不要把 region 写死在代码里**'
      ],
      related: ['hw-hcloud-config-list', 'hw-hcloud-config-set', 'hw-vpc-list', 'hw-cross-paging-backoff'],
      docs: 'https://support.huaweicloud.com/hcli/index.html',
      tags: ['跨云', 'region', 'endpoint']
    }
  );
})();
