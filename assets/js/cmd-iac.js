/* assets/js/cmd-iac.js · IaC（Terraform / Ansible）
   --------------------------------------------------------------------------
   本文件只负责**注册命令实现**：shell.js 先加载，这里再调用
     window.CC_SHELL.extend({ '命令名': function (argv, ctx, stdin, HOST) { ... } })
   引擎内部的工具函数从 window.CC_SHELL.util 取（ok/fail/resolvePath/findNode/
   readFileOrErr/splitLines/childrenSorted/expandLongOpts/pad/padLeft/walkFiles）。

   覆盖的内容条目：data/iac.js 的 45 条（terraform 全生命周期 + Ansible 命令行）
   --------------------------------------------------------------------------
   仿真的华为云场景（区域 cn-north-4）：
     1 个 VPC（module.vpc）+ 2 个子网 + 3 台 ECS（web 1 台 + app 2 台）
     + 1 个 OBS 日志桶；配置里新增了 1 个待创建的 EIP（huaweicloud_vpc_eip.web_eip），
     state 里还留着 1 个已迁走的老模块 module.legacy（计划里显示为待销毁）。
     所以 terraform plan = 1 to add + 1 to change + 1 to destroy，全部由
     “解析 .tf 配置 vs 读取 terraform.tfstate” 现算，不预置输出文本。

   --------------------------------------------------------------------------
   诚实边界（绝不假装成功，也不静默给错结果）：
     · 只做本地能验证的事：读 .tf / 读 state / 写 .terraform、lock、tfplan、格式化，
       以及纯本地的 state mv / state rm / taint / workspace / import 记账。
     · 需要真云 API 的动作（apply / destroy / refresh / force-unlock / 远端 backend）
       会打印真实格式的输出，并**明确标注**教学环境没有调用华为云 API、state 未改写。
     · Ansible 同理：不做真实 SSH，不改远端主机；inventory / group_vars / playbook
       解析与输出结构是真的，远端执行结果标注为教学仿真。
     · Ansible Vault 用可逆的本地混淆演示文件格式与命令行为，并明确说明真实 AES256
       由 ansible-vault 自己完成（教学环境没有加密库）。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;

  var U = window.CC_SHELL.util;
  var NOTE = '（教学提示）';

  /* ======================================================================
     0. 通用小工具（只能用 ES5）
     ====================================================================== */
  function trim(s) { return String(s == null ? '' : s).replace(/^\s+/, '').replace(/\s+$/, ''); }
  function padEnd(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function padStart(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function spaces(n) { var s = ''; while (s.length < n) s += ' '; return s; }
  function isDir(n) { return !!n && n.type === 'dir'; }
  function isFile(n) { return !!n && (n.type === 'file' || n.type === 'link'); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function keysOf(o) { return Object.keys(o || {}).sort(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function repeat(ch, n) { var s = ''; while (s.length < n) s += ch; return s; }
  function hclQuote(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function jsonOut(lines) { return { out: lines, err: [], code: 0 }; }
  function warnOut(out, err, code) { return { out: out || [], err: err || [], code: code || 0 }; }

  /* ---------- 文件系统小助手（自己解析软链，保证读写落到同一处） ---------- */
  function nodeAt(ctx, abs) { return U.findNode(ctx.root, abs); }

  /* 跟着软链走到真实节点（最多 8 跳，与引擎的 readFileOrErr 一致） */
  function realNode(ctx, abs) {
    var node = nodeAt(ctx, abs), hops = 0;
    while (node && node.type === 'link' && hops < 8) {
      var t = String(node.target || '');
      var tAbs = t.charAt(0) === '/' ? t : U.resolvePath(U.parentOf(abs), t);
      abs = tAbs;
      node = nodeAt(ctx, tAbs);
      hops++;
    }
    return { node: node, abs: abs };
  }

  function readText(ctx, abs) {
    var r = realNode(ctx, abs);
    if (!r.node) return null;
    if (r.node.type === 'dir') return null;
    return String(r.node.content == null ? '' : r.node.content);
  }

  function fileExists(ctx, abs) {
    var r = realNode(ctx, abs);
    return !!(r.node && r.node.type !== 'dir');
  }
  function dirExists(ctx, abs) {
    var r = realNode(ctx, abs);
    return !!(r.node && r.node.type === 'dir');
  }

  /* 建目录（含递归），返回真实绝对路径 */
  function mkdirp(ctx, abs) {
    var r = realNode(ctx, abs);
    if (isDir(r.node)) return r.abs;
    var segs = String(abs).split('/').filter(Boolean);
    var cur = ctx.root, curPath = '';
    for (var i = 0; i < segs.length; i++) {
      curPath += '/' + segs[i];
      var rr = realNode(ctx, curPath);
      if (isDir(rr.node)) { cur = rr.node; continue; }
      if (rr.node && rr.node.type !== 'dir') return null;
      var d = { type: 'dir', name: segs[i], children: {}, mode: '755', user: 'root', group: 'root', mtime: nowStamp() };
      cur.children[segs[i]] = d;
      cur = d;
    }
    return abs;
  }

  function nowStamp() { return '2024-03-18 09:10'; }

  function writeText(ctx, abs, content) {
    var r = realNode(ctx, abs);
    var target = r.abs;
    var parentAbs = U.parentOf(target);
    if (!mkdirp(ctx, parentAbs)) return false;
    var parent = nodeAt(ctx, parentAbs);
    if (!parent) return false;
    var name = U.baseName(target);
    var node = parent.children[name];
    if (node && node.type === 'file') { node.content = content; return true; }
    if (node && node.type === 'link') {
      var rr = realNode(ctx, target);
      if (rr.node && rr.node.type === 'file') { rr.node.content = content; return true; }
    }
    var f = { type: 'file', name: name, content: content, mode: '644', user: 'root', group: 'root', mtime: nowStamp() };
    parent.children[name] = f;
    return true;
  }

  function relPath(ctx, abs) {
    if (abs === ctx.cwd) return '.';
    if (abs.indexOf(ctx.cwd + '/') === 0) return abs.slice(ctx.cwd.length + 1);
    return abs;
  }

  /* 列出目录下的文件名（排序），dir 可以是目录或指向目录的软链 */
  function listNames(ctx, abs) {
    var r = realNode(ctx, abs);
    if (!isDir(r.node)) return [];
    return Object.keys(r.node.children).sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
  }

  /* 收集目录下（含子目录）匹配后缀的文件，返回相对路径数组 */
  function collectFiles(ctx, abs, suffixes, recursive) {
    var found = [];
    (function walk(dirAbs, depth) {
      var names = listNames(ctx, dirAbs);
      for (var i = 0; i < names.length; i++) {
        var childAbs = dirAbs === '/' ? '/' + names[i] : dirAbs + '/' + names[i];
        var r = realNode(ctx, childAbs);
        if (!r.node) continue;
        if (r.node.type === 'dir') {
          if (recursive && names[i].charAt(0) !== '.' && names[i] !== '.terraform') walk(r.abs, depth + 1);
          continue;
        }
        if (r.node.type !== 'file') continue;
        var okSuffix = false;
        for (var s = 0; s < suffixes.length; s++) {
          if (names[i].length > suffixes[s].length &&
              names[i].slice(names[i].length - suffixes[s].length) === suffixes[s]) okSuffix = true;
        }
        if (okSuffix) found.push({ abs: childAbs, realAbs: r.abs, rel: relPath(ctx, childAbs) });
      }
    })(abs, 0);
    return found;
  }

  /* ======================================================================
     1. 模拟数据：一套华为云 Terraform 项目 + 一套 Ansible 项目
        （/data/iac 与默认工作目录 ~ 各放一份，内容相同、各持自己的 tfstate）
     ====================================================================== */

  var MAIN_TF = [
    '# ===========================================================================',
    '# main.tf · 华为云生产环境基础配置（区域 cn-north-4）',
    '#   管理：1 个 VPC、2 个子网、3 台 ECS、1 个 OBS 日志桶',
    '#   本实验项目同时放在 /data/iac 与 ~（默认工作目录）两份，内容相同，',
    '#   各自持有自己的 terraform.tfstate —— 在哪个目录都能直接跑示例。',
    '# ===========================================================================',
    '',
    'locals {',
    '  name_prefix = "prod-ecs"',
    '',
    '  common_tags = {',
    '    Project     = "cloud-manual"',
    '    Environment = "prod"',
    '    ManagedBy   = "terraform"',
    '  }',
    '',
    '  # 子网网段用 cidrsubnet 自动切，避免手写错：192.168.1.0/24 与 192.168.2.0/24',
    '  subnet_cidrs = [for i in range(1, 3) : cidrsubnet("192.168.0.0/16", 8, i)]',
    '}',
    '',
    'module "vpc" {',
    '  source = "./modules/vpc"',
    '',
    '  name_prefix  = local.name_prefix',
    '  cidr         = "192.168.0.0/16"',
    '  subnet_cidrs = local.subnet_cidrs',
    '  tags         = local.common_tags',
    '}',
    '',
    '# ---------------------------------------------------------------------------',
    '# ECS：web 是一台带弹性公网 IP 的入口机（Ansible 从这里交付）',
    '#      app 用 count 批量创建两台应用机',
    '# ---------------------------------------------------------------------------',
    'resource "huaweicloud_compute_instance" "web" {',
    '  name              = "web-prod-01"',
    '  image_id          = "ad091b52-742f-469e-8f3c-fd81cadf0743"',
    '  flavor_id         = "s6.large.2"',
    '  key_pair          = var.key_pair',
    '  availability_zone = var.az',
    '  eip_type          = "5_bgp"',
    '',
    '  system_disk_type = "SAS"',
    '  system_disk_size = 40',
    '',
    '  tags = local.common_tags',
    '',
    '  bandwidth {',
    '    share_type  = "PER"',
    '    name        = "web-prod-01-bw"',
    '    size        = 5',
    '    charge_mode = "traffic"',
    '  }',
    '',
    '  network {',
    '    uuid = module.vpc.subnet_app_id',
    '  }',
    '}',
    '',
    'resource "huaweicloud_compute_instance" "app" {',
    '  count = var.instance_count',
    '',
    '  name              = "app-prod-0${count.index + 1}"',
    '  image_id          = "ad091b52-742f-469e-8f3c-fd81cadf0743"',
    '  flavor_id         = "s6.medium.2"',
    '  key_pair          = var.key_pair',
    '  availability_zone = var.az',
    '',
    '  system_disk_type = "SAS"',
    '  system_disk_size = 40',
    '',
    '  tags = local.common_tags',
    '',
    '  network {',
    '    uuid = module.vpc.subnet_app_id',
    '  }',
    '}',
    '',
    '# ---------------------------------------------------------------------------',
    '# OBS：日志桶。桶名全局唯一，版本控制（versioning）是防误删的最后一道保险，',
    '#      force_destroy 保持 false：桶非空时删不掉，正是我们要的保护。',
    '# ---------------------------------------------------------------------------',
    'resource "huaweicloud_obs_bucket" "logs" {',
    '  bucket        = "logs-prod-cn-north-4"',
    '  acl           = "private"',
    '  storage_class = "STANDARD"',
    '  versioning    = true',
    '  force_destroy = false',
    '',
    '  tags = local.common_tags',
    '}',
    '',
    '# ---------------------------------------------------------------------------',
    '# EIP：给 ELB / 第二台入口机预留的弹性公网 IP（2024-03-18 新增，还没 apply）',
    '# ---------------------------------------------------------------------------',
    'resource "huaweicloud_vpc_eip" "web_eip" {',
    '  name = "web-eip-prod"',
    '',
    '  publicip {',
    '    type = "5_bgp"',
    '  }',
    '',
    '  bandwidth {',
    '    name        = "web-eip-bw"',
    '    size        = 10',
    '    share_type  = "PER"',
    '    charge_mode = "traffic"',
    '  }',
    '',
    '  tags = local.common_tags',
    '}'
  ].join('\n');

  var VERSIONS_TF = [
    '# ===========================================================================',
    '# versions.tf · provider 与版本约束',
    '# ===========================================================================',
    'terraform {',
    '  required_version = ">= 1.5.0"',
    '',
    '  required_providers {',
    '    huaweicloud = {',
    '      source  = "huaweicloud/huaweicloud"',
    '      version = "~> 1.60"',
    '    }',
    '  }',
    '',
    '  # 生产环境把 state 放华为云 OBS（兼容 S3 协议）：打开下面这段，再执行',
    '  # terraform init -migrate-state 迁移。注意 Terraform **没有** backend "obs"，',
    '  # 华为云统一用 backend "s3" + OBS 端点（详见分类条目 iac-tf-backend）。',
    '  #',
    '  # backend "s3" {',
    '  #   bucket = "tfstate-prod-cn-north-4"',
    '  #   key    = "ecs/terraform.tfstate"',
    '  #   region = "cn-north-4"',
    '  #',
    '  #   endpoints {',
    '  #     s3 = "https://obs.cn-north-4.myhuaweicloud.com"',
    '  #   }',
    '  #',
    '  #   use_path_style              = true',
    '  #   skip_credentials_validation = true',
    '  #   skip_region_validation      = true',
    '  #   skip_metadata_api_check     = true',
    '  #   skip_requesting_account_id  = true',
    '  # }',
    '}',
    '',
    'provider "huaweicloud" {',
    '  region = var.region',
    '}'
  ].join('\n');

  var VARIABLES_TF = [
    '# ===========================================================================',
    '# variables.tf · 输入变量（AK/SK 不写进这里，走环境变量 HW_ACCESS_KEY / HW_SECRET_KEY）',
    '# ===========================================================================',
    'variable "region" {',
    '  type        = string',
    '  description = "华为云区域，本项目固定 cn-north-4（华北-北京四）"',
    '  default     = "cn-north-4"',
    '}',
    '',
    'variable "az" {',
    '  type        = string',
    '  description = "ECS 所在可用区，cn-north-4 下常用 4a / 4b"',
    '  default     = "cn-north-4a"',
    '}',
    '',
    'variable "instance_count" {',
    '  type        = number',
    '  description = "应用服务器数量，生产固定 2 台"',
    '  default     = 2',
    '}',
    '',
    'variable "key_pair" {',
    '  type        = string',
    '  description = "登录用的 SSH 密钥对名称（比密码登录安全，且能在云上轮换）"',
    '  default     = "my_key_pair_name"',
    '}'
  ].join('\n');

  var TFVARS = [
    '# terraform.tfvars · 自动加载（不需要 -var-file）',
    'region         = "cn-north-4"',
    'az             = "cn-north-4a"',
    'instance_count = 2',
    'key_pair       = "my_key_pair_name"'
  ].join('\n');

  var PROD_TFVARS = [
    '# prod.tfvars · 生产变量文件，用 terraform plan -var-file=prod.tfvars 指定',
    '# （生产多留一台，规格与可用区都与测试环境不同）',
    'region         = "cn-north-4"',
    'az             = "cn-north-4a"',
    'instance_count = 2',
    'key_pair       = "prod_key_pair"'
  ].join('\n');

  var OUTPUTS_TF = [
    '# ===========================================================================',
    '# outputs.tf · 部署结果导出（Ansible 交付脚本取值用）',
    '# ===========================================================================',
    'output "vpc_id" {',
    '  value       = module.vpc.vpc_id',
    '  description = "生产 VPC 的 ID"',
    '}',
    '',
    'output "subnet_ids" {',
    '  value       = [module.vpc.subnet_app_id, module.vpc.subnet_db_id]',
    '  description = "两个子网的 ID：应用子网 + 数据子网"',
    '}',
    '',
    'output "ecs_private_ips" {',
    '  value = {',
    '    web = huaweicloud_compute_instance.web.access_ip_v4',
    '    app = huaweicloud_compute_instance.app[*].access_ip_v4',
    '  }',
    '  description = "三台 ECS 的内网地址，Nginx upstream 与 Ansible 清单都对得上"',
    '}',
    '',
    'output "ecs_public_ip" {',
    '  value       = huaweicloud_compute_instance.web.public_ip',
    '  description = "入口机 web-prod-01 的弹性公网 IP，登录与 Ansible 交付都用它"',
    '}',
    '',
    'output "obs_bucket_name" {',
    '  value       = huaweicloud_obs_bucket.logs.bucket',
    '  description = "日志桶名称，备份脚本 /data/scripts/backup.sh 会用到"',
    '}',
    '',
    'output "web_eip_address" {',
    '  value       = huaweicloud_vpc_eip.web_eip.address',
    '  description = "给 ELB 预留的 EIP 地址（apply 之后 state 里才会有值）"',
    '}'
  ].join('\n');

  var MODULE_VPC_MAIN = [
    '# modules/vpc/main.tf · VPC 与子网（可复用的网络模块）',
    'resource "huaweicloud_vpc" "main" {',
    '  name        = "${var.name_prefix}-vpc"',
    '  cidr        = var.cidr',
    '  description = "生产环境 VPC（cn-north-4）"',
    '',
    '  tags = var.tags',
    '}',
    '',
    'resource "huaweicloud_vpc_subnet" "app" {',
    '  name              = "${var.name_prefix}-subnet-app"',
    '  cidr              = var.subnet_cidrs[0]',
    '  gateway_ip        = cidrhost(var.subnet_cidrs[0], 1)',
    '  vpc_id            = huaweicloud_vpc.main.id',
    '  availability_zone = "cn-north-4a"',
    '',
    '  primary_dns   = "100.125.1.250"',
    '  secondary_dns = "114.114.114.114"',
    '',
    '  tags = var.tags',
    '}',
    '',
    'resource "huaweicloud_vpc_subnet" "db" {',
    '  name              = "${var.name_prefix}-subnet-db"',
    '  cidr              = var.subnet_cidrs[1]',
    '  gateway_ip        = cidrhost(var.subnet_cidrs[1], 1)',
    '  vpc_id            = huaweicloud_vpc.main.id',
    '  availability_zone = "cn-north-4b"',
    '',
    '  primary_dns   = "100.125.1.250"',
    '  secondary_dns = "114.114.114.114"',
    '',
    '  tags = var.tags',
    '}'
  ].join('\n');

  var MODULE_VPC_VARS = [
    '# modules/vpc/variables.tf',
    'variable "name_prefix" {',
    '  type        = string',
    '  description = "资源名前缀，由根模块传入"',
    '}',
    '',
    'variable "cidr" {',
    '  type        = string',
    '  description = "VPC 网段"',
    '}',
    '',
    'variable "subnet_cidrs" {',
    '  type        = list(string)',
    '  description = "两个子网的网段，顺序：应用子网、数据子网"',
    '}',
    '',
    'variable "tags" {',
    '  type        = map(string)',
    '  description = "公共标签"',
    '  default     = {}',
    '}'
  ].join('\n');

  var MODULE_VPC_OUTPUTS = [
    '# modules/vpc/outputs.tf',
    'output "vpc_id" {',
    '  value = huaweicloud_vpc.main.id',
    '}',
    '',
    'output "subnet_app_id" {',
    '  value = huaweicloud_vpc_subnet.app.id',
    '}',
    '',
    'output "subnet_db_id" {',
    '  value = huaweicloud_vpc_subnet.db.id',
    '}'
  ].join('\n');

  var MODULE_ECS_MAIN = [
    '# modules/ecs/main.tf · 可复用的 ECS 模块骨架（本项目暂未引用，留着做练习）',
    'variable "name" {',
    '  type        = string',
    '  description = "实例名"',
    '}',
    '',
    'variable "subnet_id" {',
    '  type        = string',
    '  description = "网卡所在子网 ID"',
    '}',
    '',
    'variable "tags" {',
    '  type        = map(string)',
    '  description = "公共标签"',
    '  default     = {}',
    '}',
    '',
    'resource "huaweicloud_compute_instance" "this" {',
    '  name      = var.name',
    '  image_id  = "ad091b52-742f-469e-8f3c-fd81cadf0743"',
    '  flavor_id = "s6.small.1"',
    '',
    '  system_disk_type = "SAS"',
    '  system_disk_size = 40',
    '',
    '  tags = var.tags',
    '',
    '  network {',
    '    uuid = var.subnet_id',
    '  }',
    '}',
    '',
    'output "id" {',
    '  value = huaweicloud_compute_instance.this.id',
    '}'
  ].join('\n');

  /* ---------- Ansible 项目文件 ---------- */
  var INVENTORY_INI = [
    '# inventory.ini · 华为云 ECS 清单（cn-north-4）',
    '# 主机名直接用内网 IP：与 /etc/hosts、Nginx upstream 里的写法保持一致，',
    '# 免得「Ansible 里的名字」和「机器实际地址」对不上。',
    '',
    '[web]',
    '10.0.1.31',
    '10.0.1.32',
    '',
    '[app]',
    '10.0.1.31',
    '10.0.1.32',
    '',
    '[db]',
    '10.0.2.15',
    '',
    '[web:vars]',
    'ansible_user=deploy',
    'ansible_python_interpreter=/usr/bin/python3',
    '',
    '[db:vars]',
    'ansible_user=deploy',
    'ansible_become=yes',
    'ansible_become_user=root',
    '',
    '[all:vars]',
    'ansible_ssh_common_args=-o StrictHostKeyChecking=no'
  ].join('\n');

  var SITE_YML = [
    '# site.yml · 华为云 ECS 交付后初始化（建用户 / 改时区 / 装 Docker / 下发 Nginx 配置）',
    '---',
    '- hosts: web',
    '  become: yes',
    '  vars:',
    '    timezone: Asia/Shanghai',
    '    docker_version: "24.0.7"',
    '',
    '  tasks:',
    '    - name: 创建运维用户',
    '      ansible.builtin.user:',
    '        name: deploy',
    '        groups: wheel',
    '        append: yes',
    '        shell: /bin/bash',
    '        state: present',
    '      tags:',
    '        - common',
    '',
    '    - name: 设置时区为东八区',
    '      community.general.timezone:',
    '        name: "{{ timezone }}"',
    '      tags:',
    '        - common',
    '',
    '    - name: 安装时间同步服务',
    '      ansible.builtin.yum:',
    '        name: chrony',
    '        state: present',
    '      when: ansible_os_family == "RedHat"',
    '      tags:',
    '        - common',
    '',
    '    - name: 安装 Docker',
    '      ansible.builtin.shell:',
    '        cmd: curl -fsSL https://get.docker.com | sh',
    '        executable: /bin/bash',
    '        creates: /usr/bin/docker',
    '      tags:',
    '        - docker',
    '',
    '    - name: 启动 Docker 并设置开机自启',
    '      ansible.builtin.systemd:',
    '        name: docker',
    '        state: started',
    '        enabled: yes',
    '        daemon_reload: yes',
    '      tags:',
    '        - docker',
    '',
    '    - name: 打印本次交付使用的 Docker 版本',
    '      ansible.builtin.debug:',
    '        msg: "docker_version = {{ docker_version }}"',
    '      tags:',
    '        - docker',
    '',
    '    - name: 下发 Nginx 配置',
    '      ansible.builtin.template:',
    '        src: templates/nginx.conf.j2',
    '        dest: /etc/nginx/nginx.conf',
    '        owner: root',
    '        group: root',
    '        mode: "0644"',
    '        validate: "nginx -t -c %s"',
    '      notify: reload nginx',
    '      tags:',
    '        - nginx',
    '',
    '  handlers:',
    '    - name: reload nginx',
    '      ansible.builtin.systemd:',
    '        name: nginx',
    '        state: reloaded'
  ].join('\n');

  var REQUIREMENTS_YML = [
    '# requirements.yml · 角色与集合依赖清单（版本一律锁死，别用浮动版本）',
    '---',
    'roles:',
    '  - name: geerlingguy.nginx',
    '    version: 3.1.4',
    '',
    'collections:',
    '  - name: community.general',
    '    version: ">=6.0.0"'
  ].join('\n');

  var ANSIBLE_CFG = [
    '# 项目级配置：当前工作目录下的 ansible.cfg 优先于 ~/.ansible.cfg 与 /etc/ansible/ansible.cfg',
    '[defaults]',
    'inventory           = ./inventory.ini',
    'host_key_checking   = False',
    'retry_files_enabled = False',
    'timeout             = 30',
    'forks               = 10',
    'gathering           = smart',
    '',
    '[privilege_escalation]',
    'become          = False',
    'become_method   = sudo',
    'become_user     = root',
    'become_ask_pass = False',
    '',
    '[ssh_connection]',
    'pipelining = True'
  ].join('\n');

  var GROUP_VARS_ALL = [
    '# group_vars/all/vars.yml · 全组变量（密码类只放 vault 变量的引用）',
    '---',
    'timezone: Asia/Shanghai',
    'docker_version: "24.0.7"',
    'nginx_worker_connections: 10240',
    'ansible_ssh_pass: "{{ vault_ssh_pass }}"'
  ].join('\n');

  var VAULT_YML = [
    '# group_vars/all/vault.yml · 这个文件整体加密后再提交 Git：',
    '#   ansible-vault encrypt group_vars/all/vault.yml',
    '---',
    'vault_ssh_pass: "Huawei@12345"',
    'vault_db_password: "Huawei@12345"'
  ].join('\n');

  var HOST_VARS_WEB01 = [
    '# host_vars/10.0.1.31.yml · 这台机器是入口机，单独覆盖几个变量',
    '---',
    'nginx_worker_connections: 20480',
    'app_role: frontend'
  ].join('\n');

  var NGINX_J2 = [
    '# {{ ansible_managed | default("Ansible managed") }}',
    'user  nginx;',
    'worker_processes  auto;',
    '',
    'events {',
    '    worker_connections  {{ nginx_worker_connections | default(10240) }};',
    '}',
    '',
    'http {',
    '    include       /etc/nginx/mime.types;',
    '    default_type  application/octet-stream;',
    '    sendfile        on;',
    '    keepalive_timeout  65;',
    '',
    '    upstream app_backend {',
    '{% for host in groups["app"] %}',
    '        server {{ host }}:8080 max_fails=3 fail_timeout=10s;',
    '{% endfor %}',
    '    }',
    '',
    '    server {',
    '        listen       80;',
    '        server_name  web.example.com;',
    '',
    '        location / {',
    '            proxy_pass http://app_backend;',
    '            proxy_set_header Host $host;',
    '            proxy_set_header X-Real-IP $remote_addr;',
    '        }',
    '    }',
    '}'
  ].join('\n');

  var DAEMON_JSON = [
    '{',
    '  "registry-mirrors": ["https://docker.mirrors.example.com"],',
    '  "data-root": "/data/docker",',
    '  "log-driver": "json-file",',
    '  "log-opts": { "max-size": "10m", "max-file": "3" },',
    '  "insecure-registries": []',
    '}'
  ].join('\n');

  var HUAWEICLOUD_YML = [
    '# huaweicloud.yml · 华为云动态清单的等价落地文件',
    '#',
    '# dynamic-inventory-demo: true',
    '#',
    '# 真实环境用华为云官方的 hwc_ecs 动态清单（huaweicloud-ansible-modules 里的',
    '# contrib/inventory/hwc_ecs.py + hwc_ecs.ini），按 region / availability_zone /',
    '# vpc_id / security_group / 实例名 自动分组，凭据走环境变量：',
    '#   ANSIBLE_HWC_ACCESS_KEY / ANSIBLE_HWC_SECRET_KEY / ANSIBLE_HWC_REGION / ANSIBLE_HWC_PROJECT_ID',
    '#',
    '# 教学终端不连华为云 API，这里把动态清单的结果落成等价的 YAML 清单，',
    '# 分组维度与上面插件完全一致，好让 ansible-inventory 直接跑出结果。',
    'all:',
    '  children:',
    '    cn_north_4:',
    '      children:',
    '        region_cn_north_4:',
    '          hosts:',
    '            10.0.1.31:',
    '            10.0.1.32:',
    '            10.0.2.15:',
    '        az_cn_north_4a:',
    '          hosts:',
    '            10.0.1.31:',
    '            10.0.1.32:',
    '        az_cn_north_4b:',
    '          hosts:',
    '            10.0.2.15:',
    '    tag_env_prod:',
    '      hosts:',
    '        10.0.1.31:',
    '        10.0.1.32:',
    '        10.0.2.15:',
    '    vpc_prod_ecs:',
    '      hosts:',
    '        10.0.1.31:',
    '        10.0.1.32:',
    '    secgroup_web:',
    '      hosts:',
    '        10.0.1.31:',
    '        10.0.1.32:',
    '        10.0.2.15:',
    '  hosts:',
    '    10.0.1.31:',
    '      ansible_host: 10.0.1.31',
    '      ansible_user: deploy',
    '      instance_name: web-prod-01',
    '      instance_id: b11b407c-e604-4e8d-8bc4-92398320b847',
    '    10.0.1.32:',
    '      ansible_host: 10.0.1.32',
    '      ansible_user: deploy',
    '      instance_name: app-prod-01',
    '      instance_id: 3d7c9a10-52b1-4b6f-9c3e-8a7d2f1e5b04',
    '    10.0.2.15:',
    '      ansible_host: 10.0.2.15',
    '      ansible_user: deploy',
    '      instance_name: db-prod-01',
    '      instance_id: f0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6071'
  ].join('\n');

  var IAC_README = [
    '# /data/iac · IaC 实验项目（Terraform + Ansible）',
    '',
    '这是一套**仿真**的华为云配置，用于在模拟终端里练习 Terraform / Ansible：',
    '',
    '- 区域：cn-north-4（华北-北京四）',
    '- 管理对象：1 个 VPC、2 个子网（应用/数据）、3 台 ECS（web 1 台 + app 2 台）、1 个 OBS 日志桶',
    '- 状态：terraform.tfstate（本地 backend，default 工作区）；prod 工作区在 terraform.tfstate.d/prod/',
    '- 待执行：新增的 huaweicloud_vpc_eip.web_eip 尚未创建，OBS 桶的 versioning 配置与云端不一致',
    '',
    '常用命令：',
    '',
    '    terraform init && terraform plan',
    '    terraform state list && terraform output',
    '    ansible all -i inventory.ini -m ping',
    '    ansible-playbook -i inventory.ini site.yml --syntax-check',
    '',
    '教学终端不会真的调用华为云 API，也不会 SSH 到远端主机：需要云端动作的命令会',
    '打印真实格式的输出并明确标注「未调用云 API / state 未改写」。'
  ].join('\n');

  /* ---------- 模拟的 tfstate（由对象生成，保证是合法 JSON） ---------- */
  var SUB_APP_ID = '6a1f2b3c-4d5e-4f60-9a1b-2c3d4e5f6071';
  var SUB_DB_ID = '7b2e3c4d-5e6f-4a71-8b2c-3d4e5f607182';
  var VPC_ID = '0f8f7c1a-1a3b-4c6e-9a4a-1c1f0f0ff1a1';
  var ECS_WEB_ID = 'b11b407c-e604-4e8d-8bc4-92398320b847';
  var ECS_APP1_ID = '3d7c9a10-52b1-4b6f-9c3e-8a7d2f1e5b04';
  var ECS_APP2_ID = '4e8dab21-63c2-4c70-ad4f-9b8e3a2f6c15';
  var LEGACY_EIP_ID = '9c5a1d3e-7f80-4a2b-9c1d-0e2f3a4b5c6d';
  var SG_ID = '8d1f7a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

  var COMMON_TAGS = { Environment: 'prod', ManagedBy: 'terraform', Project: 'cloud-manual' };

  function ecsAttrs(o) {
    return {
      access_ip_v4: o.ip,
      access_ip_v6: '',
      availability_zone: o.az,
      bandwidth: [{ charge_mode: 'traffic', extend_param: {}, id: '', name: o.name + '-bw', share_type: 'PER', size: 5 }],
      charging_mode: 'postPaid',
      created_at: o.created,
      delete_disks_on_termination: false,
      delete_eip_on_termination: true,
      description: '',
      eip_id: o.eipId || '',
      eip_type: o.eipType || '',
      enterprise_project_id: '0',
      expired_time: '',
      flavor_id: o.flavor,
      flavor_name: o.flavor,
      hostname: o.name,
      id: o.id,
      image_id: 'ad091b52-742f-469e-8f3c-fd81cadf0743',
      image_name: 'EulerOS 2.9 64bit',
      key_pair: 'my_key_pair_name',
      metadata: {},
      name: o.name,
      network: [{ access_network: false, fixed_ip_v4: o.ip, fixed_ip_v6: '', ipv6_enable: false, mac: o.mac, port: o.port, source_dest_check: true, uuid: SUB_APP_ID }],
      power_action: '',
      public_ip: o.publicIp || '',
      region: 'cn-north-4',
      scheduler_hints: [],
      security_group_ids: [SG_ID],
      security_groups: ['sg-prod-default'],
      spot_duration: 0,
      status: 'ACTIVE',
      stop_before_destroy: false,
      system_disk_id: o.diskId,
      system_disk_size: 40,
      system_disk_type: 'SAS',
      tags: COMMON_TAGS,
      updated_at: o.created,
      user_data: '',
      volume_attached: [{ boot_index: 0, delete_on_termination: true, device: '/dev/vda', id: o.diskId, is_sys_volume: true, size: 40, type: 'SAS' }]
    };
  }

  function buildState() {
    return {
      version: 4,
      terraform_version: '1.5.7',
      serial: 12,
      lineage: '7f8c1c2e-6f4a-4a1e-9d1e-2b8f4c5a6d70',
      outputs: {
        ecs_private_ips: {
          value: { app: ['192.168.1.11', '192.168.1.12'], web: '192.168.1.10' },
          type: ['object', { app: ['list', 'string'], web: 'string' }]
        },
        ecs_public_ip: { value: '121.36.44.88', type: 'string' },
        obs_bucket_name: { value: 'logs-prod-cn-north-4', type: 'string' },
        subnet_ids: { value: [SUB_APP_ID, SUB_DB_ID], type: ['list', 'string'] },
        vpc_id: { value: VPC_ID, type: 'string' }
      },
      resources: [
        {
          module: 'module.vpc',
          mode: 'managed',
          type: 'huaweicloud_vpc',
          name: 'main',
          provider: 'provider["registry.terraform.io/huaweicloud/huaweicloud"]',
          instances: [{
            schema_version: 0,
            attributes: {
              cidr: '192.168.0.0/16',
              description: '生产环境 VPC（cn-north-4）',
              enterprise_project_id: '0',
              id: VPC_ID,
              name: 'prod-ecs-vpc',
              region: 'cn-north-4',
              routes: [],
              status: 'ACTIVE',
              tags: COMMON_TAGS
            },
            sensitive_attributes: []
          }]
        },
        {
          module: 'module.vpc',
          mode: 'managed',
          type: 'huaweicloud_vpc_subnet',
          name: 'app',
          provider: 'provider["registry.terraform.io/huaweicloud/huaweicloud"]',
          instances: [{
            schema_version: 0,
            attributes: {
              availability_zone: 'cn-north-4a',
              cidr: '192.168.1.0/24',
              description: '',
              dhcp_enable: true,
              dhcp_lease_time: '24h',
              dns_list: ['100.125.1.250', '114.114.114.114'],
              gateway_ip: '192.168.1.1',
              id: SUB_APP_ID,
              ipv4_subnet_id: '5c4b3a29-1f8e-4d7a-9b6c-0a1b2c3d4e5f',
              ipv6_cidr: '',
              ipv6_enable: false,
              ipv6_gateway: '',
              ipv6_subnet_id: '',
              name: 'prod-ecs-subnet-app',
              ntp_server_address: '',
              primary_dns: '100.125.1.250',
              region: 'cn-north-4',
              secondary_dns: '114.114.114.114',
              status: 'ACTIVE',
              tags: COMMON_TAGS,
              vpc_id: VPC_ID
            },
            sensitive_attributes: []
          }]
        },
        {
          module: 'module.vpc',
          mode: 'managed',
          type: 'huaweicloud_vpc_subnet',
          name: 'db',
          provider: 'provider["registry.terraform.io/huaweicloud/huaweicloud"]',
          instances: [{
            schema_version: 0,
            attributes: {
              availability_zone: 'cn-north-4b',
              cidr: '192.168.2.0/24',
              description: '',
              dhcp_enable: true,
              dhcp_lease_time: '24h',
              dns_list: ['100.125.1.250', '114.114.114.114'],
              gateway_ip: '192.168.2.1',
              id: SUB_DB_ID,
              ipv4_subnet_id: '6d5c4b3a-2a9f-4e8b-8c7d-1b2c3d4e5f60',
              ipv6_cidr: '',
              ipv6_enable: false,
              ipv6_gateway: '',
              ipv6_subnet_id: '',
              name: 'prod-ecs-subnet-db',
              ntp_server_address: '',
              primary_dns: '100.125.1.250',
              region: 'cn-north-4',
              secondary_dns: '114.114.114.114',
              status: 'ACTIVE',
              tags: COMMON_TAGS,
              vpc_id: VPC_ID
            },
            sensitive_attributes: []
          }]
        },
        {
          mode: 'managed',
          type: 'huaweicloud_compute_instance',
          name: 'web',
          provider: 'provider["registry.terraform.io/huaweicloud/huaweicloud"]',
          instances: [{
            schema_version: 0,
            attributes: ecsAttrs({
              name: 'web-prod-01', id: ECS_WEB_ID, ip: '192.168.1.10', az: 'cn-north-4a',
              flavor: 's6.large.2', mac: 'fa:16:3e:8c:1a:2b', port: '1a2b3c4d-5e6f-4071-8a9b-0c1d2e3f4a5b',
              diskId: 'aa11bb22-cc33-4d44-8e55-ff66aa77bb88', publicIp: '121.36.44.88',
              eipType: '5_bgp', eipId: 'cc9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f', created: '2024-03-15T14:26:03Z'
            }),
            sensitive_attributes: []
          }]
        },
        {
          mode: 'managed',
          type: 'huaweicloud_compute_instance',
          name: 'app',
          provider: 'provider["registry.terraform.io/huaweicloud/huaweicloud"]',
          instances: [
            {
              schema_version: 0,
              index_key: 0,
              attributes: ecsAttrs({
                name: 'app-prod-01', id: ECS_APP1_ID, ip: '192.168.1.11', az: 'cn-north-4a',
                flavor: 's6.medium.2', mac: 'fa:16:3e:2d:4e:6f', port: '2b3c4d5e-6f70-4182-9b0c-1d2e3f4a5b6c',
                diskId: 'bb22cc33-dd44-4e55-9f66-aa77bb88cc99', created: '2024-03-15T14:31:47Z'
              }),
              sensitive_attributes: []
            },
            {
              schema_version: 0,
              index_key: 1,
              attributes: ecsAttrs({
                name: 'app-prod-02', id: ECS_APP2_ID, ip: '192.168.1.12', az: 'cn-north-4a',
                flavor: 's6.medium.2', mac: 'fa:16:3e:3e:5f:70', port: '3c4d5e6f-7081-4293-8c1d-2e3f4a5b6c7d',
                diskId: 'cc33dd44-ee55-4f66-a077-bb88cc99ddaa', created: '2024-03-15T14:33:12Z'
              }),
              sensitive_attributes: []
            }
          ]
        },
        {
          mode: 'managed',
          type: 'huaweicloud_obs_bucket',
          name: 'logs',
          provider: 'provider["registry.terraform.io/huaweicloud/huaweicloud"]',
          instances: [{
            schema_version: 0,
            attributes: {
              acl: 'private',
              bucket: 'logs-prod-cn-north-4',
              bucket_domain_name: 'logs-prod-cn-north-4.obs.cn-north-4.myhuaweicloud.com',
              bucket_version: '3.0',
              encryption: false,
              enterprise_project_id: '0',
              force_destroy: false,
              id: 'logs-prod-cn-north-4',
              multi_az: false,
              parallel_fs: false,
              region: 'cn-north-4',
              storage_class: 'STANDARD',
              tags: COMMON_TAGS,
              versioning: false
            },
            sensitive_attributes: []
          }]
        },
        {
          module: 'module.legacy',
          mode: 'managed',
          type: 'huaweicloud_vpc_eip',
          name: 'old_eip',
          provider: 'provider["registry.terraform.io/huaweicloud/huaweicloud"]',
          instances: [{
            schema_version: 0,
            attributes: {
              address: '121.36.44.17',
              associate_id: '',
              associate_type: '',
              bandwidth: [{ charge_mode: 'traffic', id: '', name: 'old-eip-bw', share_type: 'PER', size: 5 }],
              charging_mode: 'postPaid',
              created_at: '2023-11-02T08:12:40Z',
              enterprise_project_id: '0',
              id: LEGACY_EIP_ID,
              instance_id: '',
              instance_type: '',
              ipv6_address: '',
              name: 'old-eip-legacy',
              port_id: '',
              private_ip: '',
              publicip: [{ ip_address: '121.36.44.17', ip_version: 4, type: '5_bgp' }],
              region: 'cn-north-4',
              status: 'DOWN',
              tags: { Environment: 'prod', ManagedBy: 'terraform' },
              updated_at: '2023-11-02T08:12:40Z'
            },
            sensitive_attributes: []
          }]
        }
      ]
    };
  }

  /* prod 工作区的 state：与 default 工作区内容相同（生产资源只多不少地记在这里） */
  var STATE_TEXT = JSON.stringify(buildState(), null, 2) + '\n';

  /* ---------- 模拟的“云端”清单：import 时按 ID 找到对象 ---------- */
  var CLOUD_OBJECTS = [
    { type: 'huaweicloud_vpc', id: VPC_ID, address: 'module.vpc.huaweicloud_vpc.main', name: 'prod-ecs-vpc' },
    { type: 'huaweicloud_vpc', id: '1a2b3c4d-5e6f-4071-8a9b-0c1d2e3f4a5b', address: '', name: 'legacy-vpc-cn-north-4' },
    { type: 'huaweicloud_compute_instance', id: ECS_WEB_ID, address: 'huaweicloud_compute_instance.web', name: 'web-prod-01' },
    { type: 'huaweicloud_compute_instance', id: ECS_APP1_ID, address: 'huaweicloud_compute_instance.app[0]', name: 'app-prod-01' },
    { type: 'huaweicloud_compute_instance', id: ECS_APP2_ID, address: 'huaweicloud_compute_instance.app[1]', name: 'app-prod-02' },
    { type: 'huaweicloud_compute_instance', id: '5f9eab32-74d3-4d81-be50-ac9f4b3a7d26', address: '', name: 'app-prod-03' },
    { type: 'huaweicloud_obs_bucket', id: 'logs-prod-cn-north-4', address: 'huaweicloud_obs_bucket.logs', name: 'logs-prod-cn-north-4' },
    { type: 'huaweicloud_obs_bucket', id: 'archive-prod-cn-north-4', address: '', name: 'archive-prod-cn-north-4' },
    { type: 'huaweicloud_vpc_eip', id: LEGACY_EIP_ID, address: 'module.legacy.huaweicloud_vpc_eip.old_eip', name: 'old-eip-legacy' },
    { type: 'huaweicloud_vpc_eip', id: '2c7f39f3-702b-48d1-940c-b50384177ee1', address: '', name: 'elb-eip-cn-north-4' },
    { type: 'huaweicloud_vpc_subnet', id: SUB_APP_ID, address: 'module.vpc.huaweicloud_vpc_subnet.app', name: 'prod-ecs-subnet-app' },
    { type: 'huaweicloud_vpc_subnet', id: SUB_DB_ID, address: 'module.vpc.huaweicloud_vpc_subnet.db', name: 'prod-ecs-subnet-db' }
  ];

  /* ---------- 把文件写进模拟文件系统 ---------- */
  function projectFiles(prefix) {
    var p = prefix === '/' ? '' : prefix;
    var map = {};
    function add(rel, content, mode, mtime) {
      var text = String(content);
      if (text.charAt(text.length - 1) !== '\n') text += '\n';
      map[p + '/' + rel] = { content: text, mode: mode || '644', user: 'root', group: 'root', mtime: mtime || '2024-03-18 09:10' };
    }
    add('main.tf', MAIN_TF, '644', '2024-03-18 09:02');
    add('versions.tf', VERSIONS_TF, '644', '2024-03-15 11:31');
    add('variables.tf', VARIABLES_TF, '644', '2024-03-15 11:33');
    add('terraform.tfvars', TFVARS, '644', '2024-03-15 11:35');
    add('prod.tfvars', PROD_TFVARS, '644', '2024-03-15 11:36');
    add('outputs.tf', OUTPUTS_TF, '644', '2024-03-18 09:05');
    add('terraform.tfstate', STATE_TEXT, '600', '2024-03-18 09:10');
    add('modules/vpc/main.tf', MODULE_VPC_MAIN, '644', '2024-03-15 11:20');
    add('modules/vpc/variables.tf', MODULE_VPC_VARS, '644', '2024-03-15 11:21');
    add('modules/vpc/outputs.tf', MODULE_VPC_OUTPUTS, '644', '2024-03-15 11:22');
    add('modules/ecs/main.tf', MODULE_ECS_MAIN, '644', '2024-03-15 11:25');
    add('inventory.ini', INVENTORY_INI, '644', '2024-03-18 09:20');
    add('site.yml', SITE_YML, '644', '2024-03-18 09:24');
    add('requirements.yml', REQUIREMENTS_YML, '644', '2024-03-18 09:26');
    add('ansible.cfg', ANSIBLE_CFG, '644', '2024-03-18 09:18');
    add('hosts', INVENTORY_INI, '644', '2024-03-18 09:20');
    add('group_vars/all/vars.yml', GROUP_VARS_ALL, '644', '2024-03-18 09:30');
    add('group_vars/all/vault.yml', VAULT_YML, '600', '2024-03-18 09:31');
    add('host_vars/10.0.1.31.yml', HOST_VARS_WEB01, '644', '2024-03-18 09:33');
    add('templates/nginx.conf.j2', NGINX_J2, '644', '2024-03-18 09:28');
    add('files/daemon.json', DAEMON_JSON, '644', '2024-03-18 09:27');
    add('huaweicloud.yml', HUAWEICLOUD_YML, '644', '2024-03-18 09:36');
    add('README.md', IAC_README, '644', '2024-03-18 09:40');
    /* state mv -state/-state-out 示例要用的两份 state 与父目录 */
    map[p + '/old/terraform.tfstate'] = {
      content: JSON.stringify(legacyState(), null, 2) + '\n', mode: '600', user: 'root', group: 'root', mtime: '2024-02-01 10:00'
    };
    map[p + '/new'] = { type: 'dir', mode: '755', user: 'root', group: 'root', mtime: '2024-02-01 10:00' };
    map[p + '/prod'] = { type: 'dir', mode: '755', user: 'root', group: 'root', mtime: '2024-02-01 10:00' };
    /* prod 工作区的 state（terraform workspace select prod 之后读它） */
    map[p + '/terraform.tfstate.d/prod/terraform.tfstate'] = {
      content: STATE_TEXT, mode: '600', user: 'root', group: 'root', mtime: '2024-03-15 16:40'
    };
    return map;
  }

  /* old/terraform.tfstate：一份只剩 VPC 的旧 state（用于 -state / -state-out 示例） */
  function legacyState() {
    var st = buildState();
    var keep = [];
    for (var i = 0; i < st.resources.length; i++) {
      var r = st.resources[i];
      if (r.module === 'module.vpc' && r.type === 'huaweicloud_vpc') {
        var c = clone(r);
        c.module = undefined;
        delete c.module;
        keep.push(c);
      }
    }
    return {
      version: 4,
      terraform_version: '1.5.7',
      serial: 3,
      lineage: 'a1b2c3d4-1111-4222-8333-444455556666',
      outputs: {},
      resources: keep
    };
  }

  function mirrorFiles() {
    var map = {};
    var base = '/data/terraform-mirror/registry.terraform.io/huaweicloud/huaweicloud';
    map[base + '/1.60.1/linux_amd64/terraform-provider-huaweicloud_v1.60.1'] = {
      content: '<binary>terraform-provider-huaweicloud v1.60.1 (linux_amd64, 教学环境占位文件)', size: 268435456,
      mode: '755', user: 'root', group: 'root', mtime: '2024-03-01 10:00'
    };
    map[base + '/1.60.1/linux_amd64/SHA256SUMS'] = {
      content: '6f1c2b3a4d5e60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9  terraform-provider-huaweicloud_v1.60.1\n',
      mode: '644', user: 'root', group: 'root', mtime: '2024-03-01 10:00'
    };
    map[base + '/1.60.1/linux_arm64/terraform-provider-huaweicloud_v1.60.1'] = {
      content: '<binary>terraform-provider-huaweicloud v1.60.1 (linux_arm64, 教学环境占位文件)', size: 251658240,
      mode: '755', user: 'root', group: 'root', mtime: '2024-03-01 10:00'
    };
    map['/data/terraform-mirror/registry.terraform.io/huaweicloud/huaweicloud/index.json'] = {
      content: '{"versions":{"1.60.1":{}}}', mode: '644', user: 'root', group: 'root', mtime: '2024-03-01 10:00'
    };
    return map;
  }

  function seedAll() {
    var map = projectFiles('/data/iac');
    var home = projectFiles('/root');
    var k;
    for (k in home) if (has(home, k)) map[k] = home[k];
    map['/root/.vault_pass'] = {
      content: 'Huawei@12345\n', mode: '600', user: 'root', group: 'root', mtime: '2024-03-18 09:34'
    };
    var mirror = mirrorFiles();
    for (k in mirror) if (has(mirror, k)) map[k] = mirror[k];
    window.CC_SHELL.fsAdd(map);
  }
  seedAll();

  /* 导出给同文件的其它段落使用（不挂到 window 上，保持命名空间干净） */
  var API = {
    MAIN_TF: MAIN_TF, VERSIONS_TF: VERSIONS_TF, VARIABLES_TF: VARIABLES_TF,
    OUTPUTS_TF: OUTPUTS_TF, TFVARS: TFVARS, PROD_TFVARS: PROD_TFVARS,
    MODULE_VPC_MAIN: MODULE_VPC_MAIN, MODULE_ECS_MAIN: MODULE_ECS_MAIN,
    INVENTORY_INI: INVENTORY_INI, SITE_YML: SITE_YML, REQUIREMENTS_YML: REQUIREMENTS_YML,
    ANSIBLE_CFG: ANSIBLE_CFG, GROUP_VARS_ALL: GROUP_VARS_ALL, VAULT_YML: VAULT_YML,
    NGINX_J2: NGINX_J2, HUAWEICLOUD_YML: HUAWEICLOUD_YML, STATE_TEXT: STATE_TEXT,
    CLOUD_OBJECTS: CLOUD_OBJECTS, COMMON_TAGS: COMMON_TAGS,
    SUB_APP_ID: SUB_APP_ID, SUB_DB_ID: SUB_DB_ID, VPC_ID: VPC_ID,
    ECS_WEB_ID: ECS_WEB_ID, ECS_APP1_ID: ECS_APP1_ID, ECS_APP2_ID: ECS_APP2_ID,
    LEGACY_EIP_ID: LEGACY_EIP_ID, SG_ID: SG_ID
  };

  /* ======================================================================
     2. HCL 解析（教学版：只认本实验用到的写法，遇到不认识的写法会报出来）
     ====================================================================== */
  function stripComment(line) {
    var out = '', q = null;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (q) {
        out += ch;
        if (ch === q && line.charAt(i - 1) !== '\\') q = null;
        continue;
      }
      if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
      if (ch === '#') break;
      if (ch === '/' && line.charAt(i + 1) === '/') break;
      out += ch;
    }
    return out;
  }

  function balance(s) {
    var round = 0, square = 0, curly = 0, q = null;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (q) { if (ch === q && s.charAt(i - 1) !== '\\') q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === '(') round++;
      else if (ch === ')') round--;
      else if (ch === '[') square++;
      else if (ch === ']') square--;
      else if (ch === '{') curly++;
      else if (ch === '}') curly--;
    }
    return { round: round, square: square, curly: curly, inString: q !== null };
  }
  function isBalanced(s) { var b = balance(s); return !b.inString && b.round === 0 && b.square === 0 && b.curly === 0; }

  /* 顶层逗号切分（忽略字符串与嵌套括号里的逗号） */
  function splitTop(s, sep) {
    var parts = [], cur = '', depth = 0, q = null;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (q) { cur += ch; if (ch === q && s.charAt(i - 1) !== '\\') q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '[' || ch === '{' || ch === '(') depth++;
      if (ch === ']' || ch === '}' || ch === ')') depth--;
      if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (trim(cur) !== '') parts.push(cur);
    return parts;
  }

  function unescapeHcl(s) {
    return String(s).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  /* 把一段 HCL 值文本解析成 { kind, value, text, literal } */
  function parseValue(raw) {
    var t = trim(raw);
    if (t === '') return { kind: 'expr', text: t, literal: false };
    if (t.charAt(0) === '"') {
      if (t.length < 2 || t.charAt(t.length - 1) !== '"') return { kind: 'expr', text: t, literal: false };
      var body = t.slice(1, t.length - 1);
      if (body.indexOf('${') !== -1 || body.indexOf('{{') !== -1) {
        return { kind: 'string', value: body, text: t, literal: false, interp: true };
      }
      return { kind: 'string', value: unescapeHcl(body), text: t, literal: true };
    }
    if (/^-?\d+(\.\d+)?$/.test(t)) return { kind: 'number', value: Number(t), text: t, literal: true };
    if (t === 'true' || t === 'false') return { kind: 'bool', value: t === 'true', text: t, literal: true };
    if (t === 'null') return { kind: 'null', value: null, text: t, literal: true };
    if (t.charAt(0) === '[' && t.charAt(t.length - 1) === ']') {
      var items = splitTop(t.slice(1, t.length - 1), ',');
      var arr = [], lit = true, i;
      for (i = 0; i < items.length; i++) {
        var v = parseValue(items[i]);
        if (!v.literal) lit = false;
        arr.push(v);
      }
      return { kind: 'list', value: arr, text: t, literal: lit };
    }
    if (t.charAt(0) === '{' && t.charAt(t.length - 1) === '}') {
      var pairs = splitTop(t.slice(1, t.length - 1), ',');
      var obj = {}, lit2 = true, order = [];
      for (i = 0; i < pairs.length; i++) {
        var p = pairs[i], eq = -1, q = null;
        for (var j = 0; j < p.length; j++) {
          var c = p.charAt(j);
          if (q) { if (c === q) q = null; continue; }
          if (c === '"') { q = c; continue; }
          if (c === '=' || c === ':') { eq = j; break; }
        }
        if (eq < 0) { lit2 = false; continue; }
        var key = trim(p.slice(0, eq)).replace(/^"|"$/g, '');
        var pv = parseValue(p.slice(eq + 1));
        if (!pv.literal) lit2 = false;
        obj[key] = pv;
        order.push(key);
      }
      return { kind: 'map', value: obj, order: order, text: t, literal: lit2 };
    }
    return { kind: 'expr', text: t, literal: false };
  }

  /* 解析一个 .tf 文件 → 声明列表 + 语法错误 */
  function parseHclText(text, file) {
    var lines = String(text).split('\n');
    var root = { kind: 'root', attrs: {}, attrOrder: [], blocks: [], line: 0, file: file };
    var stack = [root], errors = [], i;
    var pending = null;   /* 多行值累积 */

    function top() { return stack[stack.length - 1]; }
    function addAttr(node, name, raw) {
      var v = parseValue(raw);
      if (!has(node.attrs, name)) node.attrOrder.push(name);
      node.attrs[name] = v;
    }

    for (i = 0; i < lines.length; i++) {
      var raw = stripComment(lines[i]);
      var line = trim(raw);
      if (pending) {
        pending.text += '\n' + line;
        if (isBalanced(pending.text)) {
          addAttr(pending.node, pending.name, pending.text);
          pending = null;
        }
        continue;
      }
      if (line === '') continue;
      if (line === '}') {
        if (stack.length > 1) stack.pop();
        else errors.push({ file: file, line: i + 1, msg: 'unexpected "}"' });
        continue;
      }
      var open = line.match(/^([A-Za-z_][A-Za-z0-9_\-]*)((?:\s+"[^"]*")*)\s*\{\s*$/);
      if (open) {
        var labels = [];
        var m, re = /"([^"]*)"/g;
        while ((m = re.exec(open[2])) !== null) labels.push(m[1]);
        var blk = {
          kind: open[1], labels: labels, attrs: {}, attrOrder: [], blocks: [],
          line: i + 1, file: file, parent: top()
        };
        top().blocks.push(blk);
        stack.push(blk);
        continue;
      }
      var attr = line.match(/^([A-Za-z_][A-Za-z0-9_\-]*)\s*=\s*(.*)$/);
      if (attr) {
        var valText = attr[2];
        if (!isBalanced(valText)) {
          pending = { node: top(), name: attr[1], text: valText };
        } else {
          addAttr(top(), attr[1], valText);
        }
        continue;
      }
      if (line.charAt(0) === '}') {
        /* 形如 `} else {` 之类，本项目不出现；按语法错误报出 */
        errors.push({ file: file, line: i + 1, msg: 'unexpected token after "}"' });
        continue;
      }
      errors.push({
        file: file, line: i + 1,
        msg: 'Argument or block definition required',
        text: line
      });
    }
    if (pending) {
      errors.push({ file: file, line: i, msg: 'Unclosed expression for "' + pending.name + '"' });
    }
    if (stack.length > 1) {
      for (var s = 1; s < stack.length; s++) {
        errors.push({
          file: stack[s].file, line: stack[s].line,
          msg: 'Unclosed configuration block',
          block: stack[s].kind,
          text: 'There is no closing brace for this block before the end of the file.'
        });
      }
    }
    return { decls: root.blocks, errors: errors };
  }

  /* ======================================================================
     3. 表达式求值（教学版：支持本实验用到的函数与引用）
     ====================================================================== */
  function ipToInt(ip) {
    var p = String(ip).split('.');
    if (p.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      var v = Number(p[i]);
      if (!(v >= 0 && v <= 255) || String(v) !== String(Number(p[i]))) return null;
      n = n * 256 + v;
    }
    return n;
  }
  function intToIp(n) {
    return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
  }
  function cidrsubnetCalc(prefix, newbits, netnum) {
    var parts = String(prefix).split('/');
    var base = ipToInt(parts[0]);
    var bits = Number(parts[1]);
    if (base === null || !(bits >= 0 && bits <= 32)) return { err: 'invalid CIDR expression: ' + prefix };
    newbits = Number(newbits); netnum = Number(netnum);
    if (bits + newbits > 32) return { err: 'prefix extension of ' + newbits + ' does not fit into an IPv4 address of 32 bits' };
    if (netnum >= Math.pow(2, newbits)) return { err: 'prefix extension of ' + newbits + ' is too small for the value ' + netnum };
    var size = Math.pow(2, 32 - bits - newbits);
    return { value: intToIp(base + netnum * size) + '/' + (bits + newbits) };
  }
  function cidrhostCalc(prefix, num) {
    var parts = String(prefix).split('/');
    var base = ipToInt(parts[0]);
    var bits = Number(parts[1]);
    if (base === null) return { err: 'invalid CIDR expression: ' + prefix };
    var size = Math.pow(2, 32 - bits);
    num = Number(num);
    if (num < 0 || num >= size) return { err: 'host number ' + num + ' is out of range for ' + prefix };
    return { value: intToIp(base + num) };
  }
  function fmtStr(f, args) {
    var i = 0;
    return String(f).replace(/%[sdvq%]/g, function (m) {
      if (m === '%%') return '%';
      var v = args[i++];
      return m === '%q' ? hclQuote(v) : String(v);
    });
  }
  function typeName(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'boolean') return 'bool';
    if (Object.prototype.toString.call(v) === '[object Array]') return 'list';
    return 'map';
  }
  function ctyRender(v, indent) {
    indent = indent || '';
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return hclQuote(v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Object.prototype.toString.call(v) === '[object Array]') {
      if (!v.length) return '[]';
      var out = '[', k;
      for (k = 0; k < v.length; k++) out += '\n' + indent + '  ' + ctyRender(v[k], indent + '  ') + ',';
      return out + '\n' + indent + ']';
    }
    var ks = keysOf(v), o = '{', j;
    if (!ks.length) return '{}';
    var w = 0;
    for (j = 0; j < ks.length; j++) w = Math.max(w, hclQuote(ks[j]).length);
    for (j = 0; j < ks.length; j++) o += '\n' + indent + '  ' + padEnd(hclQuote(ks[j]), w) + ' = ' + ctyRender(v[ks[j]], indent + '  ');
    return o + '\n' + indent + '}';
  }

  /* env: { vars, locals(lazy), resAttrs(地址前缀→属性), groups, workspace, moduleOut } */
  function evalExpr(expr, env, depth) {
    depth = depth || 0;
    if (depth > 12) return { ok: false, err: 'expression recursion too deep' };
    var t = trim(expr);
    if (t === '') return { ok: false, err: 'empty expression' };
    var lit = parseValue(t);
    if (lit.literal) return { ok: true, value: litToJs(lit), type: lit.kind };

    /* 字符串插值 */
    if (t.charAt(0) === '"' && t.charAt(t.length - 1) === '"' && t.indexOf('${') !== -1) {
      var body = t.slice(1, t.length - 1), out = '', idx = 0;
      while (idx < body.length) {
        var start = body.indexOf('${', idx);
        if (start === -1) { out += body.slice(idx); break; }
        out += body.slice(idx, start);
        var end = start + 2, depthB = 1;
        while (end < body.length && depthB > 0) {
          if (body.charAt(end) === '{') depthB++;
          else if (body.charAt(end) === '}') depthB--;
          if (depthB === 0) break;
          end++;
        }
        var sub = evalExpr(body.slice(start + 2, end), env, depth + 1);
        if (!sub.ok) return sub;
        if (sub.unknown) return { ok: true, unknown: true, type: 'string' };
        out += String(sub.value);
        idx = end + 1;
      }
      return { ok: true, value: unescapeHcl(out), type: 'string' };
    }

    /* for 表达式：[for x in 集合 : 表达式] */
    var fo = t.match(/^\[\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([\s\S]+?)\s*:\s*([\s\S]+)\]$/);
    if (fo) {
      var coll = evalExpr(fo[2], env, depth + 1);
      if (!coll.ok) return coll;
      if (coll.unknown) return { ok: true, unknown: true, type: 'list' };
      var list = coll.value;
      if (typeof list === 'number') { list = []; for (var q = 0; q < coll.value; q++) list.push(q); }
      if (Object.prototype.toString.call(list) !== '[object Array]') return { ok: false, err: 'for expression requires a list or set' };
      var res = [];
      for (var li = 0; li < list.length; li++) {
        var sub2 = cloneEnv(env);
        sub2.scope = cloneEnv(env.scope || {});
        sub2.scope[fo[1]] = list[li];
        var one = evalExpr(fo[3], sub2, depth + 1);
        if (!one.ok) return one;
        res.push(one.unknown ? null : one.value);
      }
      return { ok: true, value: res, type: 'list' };
    }

    /* 三元 */
    var tern = splitTernary(t);
    if (tern) {
      var cond = evalExpr(tern.cond, env, depth + 1);
      if (!cond.ok) return cond;
      return evalExpr(truthy(cond.value) ? tern.yes : tern.no, env, depth + 1);
    }
    /* 比较 */
    var cmp = matchTopOp(t, ['==', '!=']);
    if (cmp) {
      var a = evalExpr(cmp.left, env, depth + 1), b = evalExpr(cmp.right, env, depth + 1);
      if (!a.ok) return a;
      if (!b.ok) return b;
      if (a.unknown || b.unknown) return { ok: true, unknown: true, type: 'bool' };
      var eq = JSON.stringify(a.value) === JSON.stringify(b.value);
      return { ok: true, value: cmp.op === '==' ? eq : !eq, type: 'bool' };
    }

    /* 函数调用 */
    var fn = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/);
    if (fn) return callFunction(fn[1], splitTop(fn[2], ','), env, depth);

    /* 列表 / 映射字面量 */
    if (t.charAt(0) === '[') {
      var items = splitTop(t.slice(1, -1), ','), arr2 = [];
      for (var ii = 0; ii < items.length; ii++) {
        var iv = evalExpr(items[ii], env, depth + 1);
        if (!iv.ok) return iv;
        arr2.push(iv.unknown ? null : iv.value);
      }
      return { ok: true, value: arr2, type: 'list' };
    }
    if (t.charAt(0) === '{') {
      var pairs = splitTop(t.slice(1, -1), ','), obj2 = {};
      for (var pi = 0; pi < pairs.length; pi++) {
        var eqi = pairs[pi].indexOf('=');
        if (eqi < 0) eqi = pairs[pi].indexOf(':');
        if (eqi < 0) return { ok: false, err: 'invalid map element: ' + pairs[pi] };
        var key2 = trim(pairs[pi].slice(0, eqi)).replace(/^"|"$/g, '');
        var pv2 = evalExpr(pairs[pi].slice(eqi + 1), env, depth + 1);
        if (!pv2.ok) return pv2;
        obj2[key2] = pv2.unknown ? null : pv2.value;
      }
      return { ok: true, value: obj2, type: 'map' };
    }

    /* 引用：var.x / local.x / 资源属性 / module.x.out / each.key / 作用域变量 */
    if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_\[\]"\-]+)*$/.test(t)) {
      return lookupRef(t, env, depth);
    }
    return { ok: false, err: 'unsupported expression: ' + t };
  }

  function cloneEnv(env) {
    var e = {};
    for (var k in env) if (has(env, k)) e[k] = env[k];
    return e;
  }
  function truthy(v) { return !(v === false || v === null || v === undefined || v === 0 || v === ''); }
  function litToJs(lit) {
    if (lit.kind === 'list') {
      var a = [];
      for (var i = 0; i < lit.value.length; i++) a.push(litToJs(lit.value[i]));
      return a;
    }
    if (lit.kind === 'map') {
      var o = {};
      for (var j = 0; j < lit.order.length; j++) o[lit.order[j]] = litToJs(lit.value[lit.order[j]]);
      return o;
    }
    return lit.value;
  }
  function matchTopOp(t, ops) {
    var depth = 0, q = null;
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (q) { if (ch === q && t.charAt(i - 1) !== '\\') q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (depth === 0) {
        for (var o = 0; o < ops.length; o++) {
          if (t.slice(i, i + ops[o].length) === ops[o]) {
            return { left: t.slice(0, i), op: ops[o], right: t.slice(i + ops[o].length) };
          }
        }
      }
    }
    return null;
  }
  function splitTernary(t) {
    var depth = 0, q = null, qm = -1, colon = -1;
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (q) { if (ch === q && t.charAt(i - 1) !== '\\') q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (depth === 0 && ch === '?' && qm < 0 && t.charAt(i + 1) !== '?') qm = i;
      else if (depth === 0 && ch === ':' && qm >= 0) { colon = i; break; }
    }
    if (qm < 0 || colon < 0) return null;
    return { cond: t.slice(0, qm), yes: t.slice(qm + 1, colon), no: t.slice(colon + 1) };
  }

  function lookupRef(t, env, depth) {
    var segs = t.split('.'), path = [], indices = [], i;
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      var m = s.match(/^([^\[\]]*)((\[[^\]]*\])*)$/);
      if (!m) return { ok: false, err: 'Unknown reference: ' + t };
      path.push(m[1]);
      if (m[2]) {
        var re = /\[([^\]]*)\]/g, mm;
        while ((mm = re.exec(m[2])) !== null) {
          indices.push(/^\d+$/.test(mm[1]) ? Number(mm[1]) : mm[1].replace(/^"|"$/g, ''));
        }
      }
    }
    function withIdx(val, ok, unknown) {
      if (!ok) return { ok: true, unknown: true, type: 'string' };
      var v = val, k;
      for (k = 0; k < indices.length; k++) {
        if (v === null || v === undefined) return { ok: true, unknown: true, type: 'string' };
        v = v[indices[k]];
      }
      if (v === null || v === undefined) return { ok: true, unknown: true, type: 'string' };
      return { ok: true, value: v, type: typeName(v) };
    }
    function readPath(obj, from) {
      var v = obj;
      for (var k = from; k < path.length; k++) {
        if (v === null || v === undefined) return undefined;
        v = v[path[k]];
      }
      return v;
    }
    var scope = env.scope || {};
    if (has(scope, path[0])) {
      var sv = readPath(scope, 0);
      return withIdx(sv, sv !== undefined, false);
    }
    if (path[0] === 'var') {
      if (!has(env.vars, path[1])) return { ok: false, err: 'Reference to undeclared input variable: var.' + path[1] };
      return withIdx(readPath(env.vars, 1), true, false);
    }
    if (path[0] === 'local') {
      if (!has(env.locals, path[1])) return { ok: false, err: 'Reference to undeclared local value: local.' + path[1] };
      var lv = env.locals[path[1]];
      if (lv && lv.__lazy) {
        if (lv.busy) return { ok: false, err: 'Cycle: local.' + path[1] };
        lv.busy = true;
        var got = evalExpr(lv.expr, env, depth + 1);
        lv.busy = false;
        if (!got.ok) return got;
        lv.__lazy = false; lv.value = got.value;
      }
      var lval = (lv && has(lv, 'value')) ? lv.value : lv;
      return withIdx(readPath({ x: lval }, 0) === undefined ? lval : readPath({ x: lval }, 0), true, false);
    }
    if (path[0] === 'terraform' && path[1] === 'workspace') {
      return { ok: true, value: env.workspace || 'default', type: 'string' };
    }
    if (path[0] === 'module') {
      var mk = path[1] + '.' + path[2];
      if (env.moduleOut && has(env.moduleOut, mk) && env.moduleOut[mk] !== null) {
        return withIdx(env.moduleOut[mk], true, false);
      }
      if (env.moduleOut && has(env.moduleOut, mk)) return { ok: true, unknown: true, type: 'string' };
      return { ok: true, unknown: true, type: 'string' };
    }
    if (path[0] === 'data') return { ok: true, unknown: true, type: 'string' };
    /* 资源属性：type.name.attr（可能带模块前缀） */
    var key = '';
    for (i = 0; i < path.length && i < 3; i++) key += (i ? '.' : '') + path[i];
    if (env.resAttrs && has(env.resAttrs, key)) {
      return withIdx(env.resAttrs[key], true, false);
    }
    var key2 = path[0] + '.' + path[1] + '.' + path[2];
    if (env.resAttrs && has(env.resAttrs, key2)) return withIdx(env.resAttrs[key2], true, false);
    if (/^huaweicloud_|^data\./.test(path[0])) return { ok: true, unknown: true, type: 'string' };
    return { ok: false, err: 'Unknown reference: ' + t };
  }

  function callFunction(name, argTexts, env, depth) {
    var args = [], i, a;
    for (i = 0; i < argTexts.length; i++) {
      a = evalExpr(argTexts[i], env, depth + 1);
      if (!a.ok) return a;
      if (a.unknown) return { ok: true, unknown: true, type: 'string' };
      args.push(a.value);
    }
    var r;
    switch (name) {
      case 'cidrsubnet':
        r = cidrsubnetCalc(args[0], args[1], args[2]);
        return r.err ? { ok: false, err: r.err } : { ok: true, value: r.value, type: 'string' };
      case 'cidrhost':
        r = cidrhostCalc(args[0], args[1]);
        return r.err ? { ok: false, err: r.err } : { ok: true, value: r.value, type: 'string' };
      case 'range':
        var from = args.length > 1 ? Number(args[0]) : 0, to = Number(args.length > 1 ? args[1] : args[0]);
        var out = [];
        for (var n = from; n < to; n++) out.push(n);
        return { ok: true, value: out, type: 'list' };
      case 'format': return { ok: true, value: fmtStr(args[0], args.slice(1)), type: 'string' };
      case 'join': return { ok: true, value: (args[1] || []).join(args[0]), type: 'string' };
      case 'split': return { ok: true, value: String(args[1]).split(args[0]), type: 'list' };
      case 'replace': return { ok: true, value: String(args[0]).split(args[1]).join(args[2]), type: 'string' };
      case 'upper': return { ok: true, value: String(args[0]).toUpperCase(), type: 'string' };
      case 'lower': return { ok: true, value: String(args[0]).toLowerCase(), type: 'string' };
      case 'trimspace': return { ok: true, value: trim(args[0]), type: 'string' };
      case 'length':
        if (typeof args[0] === 'string') return { ok: true, value: args[0].length, type: 'number' };
        if (Object.prototype.toString.call(args[0]) === '[object Array]') return { ok: true, value: args[0].length, type: 'number' };
        return { ok: true, value: keysOf(args[0]).length, type: 'number' };
      case 'merge':
        var merged = {};
        for (i = 0; i < args.length; i++) for (var k in args[i]) if (has(args[i], k)) merged[k] = args[i][k];
        return { ok: true, value: merged, type: 'map' };
      case 'lookup':
        return { ok: true, value: has(args[0], args[1]) ? args[0][args[1]] : (args.length > 2 ? args[2] : null), type: 'string' };
      case 'element': return { ok: true, value: args[0][args[1] % args[0].length], type: 'string' };
      case 'concat': return { ok: true, value: args[0].concat(args[1]), type: 'list' };
      case 'toset': case 'tolist': return { ok: true, value: args[0], type: 'list' };
      case 'tomap': return { ok: true, value: args[0], type: 'map' };
      case 'keys': return { ok: true, value: keysOf(args[0]), type: 'list' };
      case 'values':
        var ks = keysOf(args[0]), vs = [];
        for (i = 0; i < ks.length; i++) vs.push(args[0][ks[i]]);
        return { ok: true, value: vs, type: 'list' };
      case 'contains': return { ok: true, value: args[0].indexOf(args[1]) !== -1, type: 'bool' };
      case 'coalesce':
        for (i = 0; i < args.length; i++) if (args[i] !== null && args[i] !== '' && args[i] !== undefined) return { ok: true, value: args[i], type: typeName(args[i]) };
        return { ok: true, value: null, type: 'null' };
      case 'try':
        return args.length ? { ok: true, value: args[0], type: typeName(args[0]) } : { ok: true, value: null, type: 'null' };
      case 'jsonencode': return { ok: true, value: JSON.stringify(args[0]), type: 'string' };
      case 'max': return { ok: true, value: Math.max.apply(null, args), type: 'number' };
      case 'min': return { ok: true, value: Math.min.apply(null, args), type: 'number' };
      case 'abs': return { ok: true, value: Math.abs(args[0]), type: 'number' };
      default:
        return { ok: false, err: 'Call to unknown function: "' + name + '"' };
    }
  }

  /* ======================================================================
     4. 配置模型与 state 模型
     ====================================================================== */
  function currentWorkspace(ctx) {
    var txt = readText(ctx, ctx.cwd + '/.terraform/environment');
    var w = txt === null ? '' : trim(txt);
    return w === '' ? 'default' : w;
  }
  function stateFilePath(ctx, ws) {
    var w = ws || currentWorkspace(ctx);
    if (!w || w === 'default') return ctx.cwd + '/terraform.tfstate';
    return ctx.cwd + '/terraform.tfstate.d/' + w + '/terraform.tfstate';
  }

  function loadState(ctx, explicitPath, ws) {
    var p = explicitPath ? U.resolvePath(ctx.cwd, explicitPath) : stateFilePath(ctx, ws);
    var txt = readText(ctx, p);
    if (txt === null) return { ok: true, state: null, path: p, missing: true };
    var data;
    try { data = JSON.parse(txt); }
    catch (e) {
      return { ok: false, path: p, err: 'Error: Failed to load state\n\n  Failed to read the state file "' + relPath(ctx, p) + '": the file is not valid JSON (' + e.message + ').' };
    }
    return { ok: true, state: data, path: p, text: txt };
  }

  function stateInstances(st) {
    var out = [];
    if (!st || !st.resources) return out;
    for (var i = 0; i < st.resources.length; i++) {
      var r = st.resources[i];
      for (var j = 0; j < (r.instances || []).length; j++) {
        var inst = r.instances[j];
        var addr = (r.module ? r.module + '.' : '') + r.type + '.' + r.name;
        if (inst.index_key !== undefined && inst.index_key !== null) {
          addr += '[' + (typeof inst.index_key === 'number' ? inst.index_key : '"' + inst.index_key + '"') + ']';
        }
        out.push({
          address: addr, type: r.type, name: r.name, module: r.module || '', mode: r.mode || 'managed',
          indexKey: inst.index_key, attributes: inst.attributes || {}, status: inst.status || '',
          resource: r, instance: inst
        });
      }
    }
    return out;
  }

  function addrSortKey(a) {
    return a.replace(/\[(\d+)\]/g, function (m, d) { return '[' + padStart(d, 10, '0') + ']'; });
  }
  function sortAddrs(list) {
    return list.slice().sort(function (a, b) {
      var ka = addrSortKey(a), kb = addrSortKey(b);
      return ka < kb ? -1 : (ka > kb ? 1 : 0);
    });
  }

  /* 解析 cwd 下的配置 → 模型（根模块只认 cwd 下的 *.tf，模块目录单独解析） */
  function loadConfig(ctx, opts) {
    opts = opts || {};
    var rootFiles = collectFiles(ctx, ctx.cwd, ['.tf'], false);
    var allFiles = collectFiles(ctx, ctx.cwd, ['.tf'], true);
    if (!rootFiles.length) {
      return { ok: false, noConfig: true, errors: [], files: [] };
    }
    var decls = [], errors = [], i, localBlocks = [];
    for (i = 0; i < rootFiles.length; i++) {
      var txt = readText(ctx, rootFiles[i].abs);
      var parsed = parseHclText(txt === null ? '' : txt, rootFiles[i].rel);
      for (var d = 0; d < parsed.decls.length; d++) decls.push(parsed.decls[d]);
      for (var e = 0; e < parsed.errors.length; e++) errors.push(parsed.errors[e]);
    }
    var model = {
      ok: true, files: allFiles, rootFiles: rootFiles, decls: decls, errors: errors,
      variables: {}, locals: {}, outputs: {}, outputsOrder: [],
      resources: [], modules: {}, requiredProviders: {}, backend: null,
      providers: [], tfBlock: null
    };
    for (i = 0; i < decls.length; i++) {
      var b = decls[i];
      if (b.kind === 'resource' && b.labels.length >= 2) {
        model.resources.push({ type: b.labels[0], name: b.labels[1], block: b, module: '', file: b.file, line: b.line });
      }
    }
    /* 模块目录：只有本文件先用到的两个变量块（variables/locals/outputs）之外，
       根模块的 variable/output/locals 也必须先收集 —— 单独一趟遍历。 */
    for (i = 0; i < decls.length; i++) {
      b = decls[i];
      if (b.kind === 'variable' && b.labels[0]) { model.variables[b.labels[0]] = b; }
      else if (b.kind === 'locals') localBlocks.push(b);
      else if (b.kind === 'output' && b.labels[0]) { model.outputs[b.labels[0]] = b; model.outputsOrder.push(b.labels[0]); }
      else if (b.kind === 'module' && b.labels[0]) {
        var srcAttr = b.attrs['source'];
        model.modules[b.labels[0]] = { name: b.labels[0], block: b, source: srcAttr ? srcAttr.value : '', resources: [], dir: null };
      } else if (b.kind === 'provider' && b.labels[0]) {
        model.providers.push({ name: b.labels[0], block: b });
      } else if (b.kind === 'terraform') {
        model.tfBlock = b;
        for (var tb = 0; tb < b.blocks.length; tb++) {
          if (b.blocks[tb].kind === 'required_providers') {
            var rp = b.blocks[tb];
            for (var ra = 0; ra < rp.attrOrder.length; ra++) {
              model.requiredProviders[rp.attrOrder[ra]] = rp.attrs[rp.attrOrder[ra]];
            }
            for (var rb = 0; rb < rp.blocks.length; rb++) {
              model.requiredProviders[rp.blocks[rb].kind] = rp.blocks[rb];
            }
          }
          if (b.blocks[tb].kind === 'backend') model.backend = b.blocks[tb];
        }
      }
    }
    /* 变量默认值 + tfvars 覆盖 */
    var vars = {};
    for (var vn in model.variables) {
      if (!has(model.variables, vn)) continue;
      var vd = model.variables[vn].attrs['default'];
      if (vd) {
        var ev = evalExpr(vd.text, { vars: {}, locals: {} });
        vars[vn] = ev.ok ? (ev.unknown ? null : ev.value) : null;
      }
    }
    var tfvars = readText(ctx, ctx.cwd + '/terraform.tfvars');
    if (tfvars !== null) {
      var auto = parseTfvars(tfvars, 'terraform.tfvars');
      for (var ak in auto.values) if (has(auto.values, ak)) vars[ak] = auto.values[ak];
      if (auto.unknown && !opts.silent) { /* 未声明变量在下面统一报错 */ }
      model._autoVarUnknown = auto.unknown;
    }
    if (opts.varFiles) {
      for (var vf = 0; vf < opts.varFiles.length; vf++) {
        var fname = opts.varFiles[vf];
        var fpath = U.resolvePath(ctx.cwd, fname);
        var ftext = readText(ctx, fpath);
        if (ftext === null) return { ok: false, varFileMissing: fname, errors: errors };
        var pv = parseTfvars(ftext, fname);
        for (var pk in pv.values) if (has(pv.values, pk)) vars[pk] = pv.values[pk];
        if (pv.unknown) model._varFileUnknown = pv.unknown;
      }
    }
    if (opts.vars) {
      for (var ck in opts.vars) if (has(opts.vars, ck)) vars[ck] = opts.vars[ck];
    }
    model.vars = vars;
    model.varOrder = keysOf(model.variables);

    /* locals（惰性求值） */
    var locals = {};
    for (i = 0; i < localBlocks.length; i++) {
      var lb = localBlocks[i];
      for (var la = 0; la < lb.attrOrder.length; la++) {
        var lname = lb.attrOrder[la], lval = lb.attrs[lname];
        locals[lname] = lval.literal ? { value: litToJs(lval) } : { __lazy: true, expr: lval.text };
      }
    }
    model.locals = locals;

    /* 资源实例地址（count / for_each） */
    var env0 = { vars: vars, locals: locals, workspace: currentWorkspace(ctx), resAttrs: stAttrs(ctx, opts) };
    for (i = 0; i < model.resources.length; i++) {
      var res = model.resources[i];
      var cnt = res.block.attrs['count'];
      res.instances = [];
      if (cnt) {
        var cv = evalExpr(cnt.text, env0);
        var cn = cv.ok && !cv.unknown ? Number(cv.value) : null;
        if (cn !== null && isFinite(cn) && cn >= 0) {
          for (var ci = 0; ci < cn; ci++) res.instances.push({ address: res.type + '.' + res.name + '[' + ci + ']', indexKey: ci });
        } else {
          res.instances.push({ address: res.type + '.' + res.name, indexKey: undefined, unknownCount: true });
        }
      } else if (res.block.attrs['for_each']) {
        var fv = evalExpr(res.block.attrs['for_each'].text, env0);
        if (fv.ok && !fv.unknown) {
          var kk = Object.prototype.toString.call(fv.value) === '[object Array]' ? fv.value : keysOf(fv.value);
          for (var fi = 0; fi < kk.length; fi++) {
            res.instances.push({ address: res.type + '.' + res.name + '["' + kk[fi] + '"]', indexKey: kk[fi] });
          }
        } else {
          res.instances.push({ address: res.type + '.' + res.name, indexKey: undefined });
        }
      } else {
        res.instances.push({ address: res.type + '.' + res.name, indexKey: undefined });
      }
    }
    /* 模块调用里的资源（本地目录模块） */
    for (var mn in model.modules) {
      if (!has(model.modules, mn)) continue;
      var mod = model.modules[mn];
      if (!mod.source || mod.source.charAt(0) !== '.') continue;
      var mdir = U.resolvePath(ctx.cwd, mod.source);
      mod.dir = mdir;
      if (!dirExists(ctx, mdir)) { mod.missing = true; continue; }
      var mfiles = collectFiles(ctx, mdir, ['.tf'], true);
      for (var mf = 0; mf < mfiles.length; mf++) {
        var mtxt = readText(ctx, mfiles[mf].abs);
        var mp = parseHclText(mtxt === null ? '' : mtxt, mfiles[mf].rel);
        for (var md = 0; md < mp.decls.length; md++) {
          var mb = mp.decls[md];
          if (mb.kind === 'resource' && mb.labels.length >= 2) {
            mod.resources.push({ type: mb.labels[0], name: mb.labels[1], block: mb, module: 'module.' + mn, file: mb.file, line: mb.line });
          } else if (mb.kind === 'output' && mb.labels[0]) {
            if (!mod.outputs) mod.outputs = {};
            mod.outputs[mb.labels[0]] = mb;
          } else if (mb.kind === 'variable' && mb.labels[0]) {
            if (!mod.variables) mod.variables = {};
            mod.variables[mb.labels[0]] = mb;
          } else if (mb.kind === 'locals') {
            if (!mod.locals) mod.locals = {};
            for (var mla = 0; mla < mb.attrOrder.length; mla++) {
              var mv = mb.attrs[mb.attrOrder[mla]];
              mod.locals[mb.attrOrder[mla]] = mv.literal ? { value: litToJs(mv) } : { __lazy: true, expr: mv.text };
            }
          }
        }
        for (var me = 0; me < mp.errors.length; me++) model.errors.push(mp.errors[me]);
      }
      for (var mr = 0; mr < mod.resources.length; mr++) {
        var mres = mod.resources[mr];
        var mcnt = mres.block.attrs['count'];
        mres.instances = [];
        if (mcnt) {
          var mcv = evalExpr(mcnt.text, env0);
          var mcn = mcv.ok && !mcv.unknown ? Number(mcv.value) : 1;
          for (var mi = 0; mi < mcn; mi++) mres.instances.push({ address: 'module.' + mn + '.' + mres.type + '.' + mres.name + '[' + mi + ']', indexKey: mi });
        } else {
          mres.instances.push({ address: 'module.' + mn + '.' + mres.type + '.' + mres.name, indexKey: undefined });
        }
      }
      /* 模块输入：把 module 块的参数在根环境里求值，绑成模块内的 var.* */
      var modEnv = {
        vars: {}, locals: mod.locals || {}, workspace: env0.workspace,
        resAttrs: {}, scope: {}, moduleOut: {}
      };
      for (var ai = 0; ai < mod.block.attrOrder.length; ai++) {
        var an = mod.block.attrOrder[ai];
        if (an === 'source' || an === 'version' || an === 'providers' || an === 'depends_on' ||
            an === 'count' || an === 'for_each' || an === 'meta') continue;
        var aev = evalExpr(mod.block.attrs[an].text, env0);
        if (aev.ok && !aev.unknown) modEnv.vars[an] = aev.value;
      }
      /* 没传的模块变量用它的 default 兜底 */
      var mvs = mod.variables || {};
      for (var mvn in mvs) {
        if (!has(mvs, mvn) || has(modEnv.vars, mvn)) continue;
        var mvd = mvs[mvn].attrs['default'];
        if (mvd) {
          var mvev = evalExpr(mvd.text, modEnv);
          modEnv.vars[mvn] = mvev.ok && !mvev.unknown ? mvev.value : null;
        }
      }
      mod.env = modEnv;
    }
    /* 全部实例（含模块） */
    model.allResources = model.resources.slice();
    for (mn in model.modules) {
      if (!has(model.modules, mn)) continue;
      var m2 = model.modules[mn];
      for (var x = 0; x < m2.resources.length; x++) model.allResources.push(m2.resources[x]);
    }
    return model;
  }

  /* 读取 tfvars（只认本实验的简单写法：key = 字面量） */
  function parseTfvars(text, file) {
    var lines = String(text).split('\n'), values = {}, unknown = [];
    var pending = null;
    for (var i = 0; i < lines.length; i++) {
      var line = trim(stripComment(lines[i]));
      if (line === '') continue;
      if (pending) {
        pending.text += '\n' + line;
        if (isBalanced(pending.text)) { values[pending.name] = litToJs(parseValue(pending.text)); pending = null; }
        continue;
      }
      var m = line.match(/^([A-Za-z_][A-Za-z0-9_\-]*)\s*=\s*(.*)$/);
      if (!m) continue;
      if (!isBalanced(m[2])) { pending = { name: m[1], text: m[2] }; continue; }
      var v = parseValue(m[2]);
      if (!v.literal) { unknown.push(m[1]); continue; }
      values[m[1]] = litToJs(v);
    }
    return { values: values, unknown: unknown, file: file };
  }

  /* 资源属性表：给表达式求值用（从 state 与“云端清单”取已知值） */
  function stAttrs(ctx, opts) {
    var st = loadState(ctx, opts && opts.statePath);
    var attrs = {};
    var insts = st.ok && st.state ? stateInstances(st.state) : [];
    for (var i = 0; i < insts.length; i++) {
      var it = insts[i];
      var prefix = it.address;
      for (var k in it.attributes) {
        if (!has(it.attributes, k)) continue;
        var v = it.attributes[k];
        if (v === null || typeof v === 'object') continue;
        attrs[prefix + '.' + k] = v;
      }
    }
    return attrs;
  }

  /* ======================================================================
     5. 计划：配置 vs state 现算差异
     ====================================================================== */
  var FORCE_NEW = {
    huaweicloud_compute_instance: ['availability_zone', 'network', 'eip_type', 'eip_id', 'system_disk_type', 'system_disk_iops', 'data_disks', 'scheduler_hints', 'image_id', 'region', 'user_id'],
    huaweicloud_vpc_subnet: ['cidr', 'gateway_ip', 'vpc_id', 'availability_zone', 'region'],
    huaweicloud_vpc: ['region'],
    huaweicloud_obs_bucket: ['bucket', 'region', 'parallel_fs', 'multi_az', 'ies_location', 'edge_location'],
    huaweicloud_vpc_eip: ['region']
  };
  var SCHEMA_COMPUTED = {
    huaweicloud_vpc: ['id', 'status', 'routes', 'enterprise_project_id'],
    huaweicloud_vpc_subnet: ['id', 'status', 'ipv4_subnet_id', 'ipv6_subnet_id', 'ipv6_cidr', 'ipv6_gateway'],
    huaweicloud_compute_instance: ['id', 'status', 'system_disk_id', 'flavor_name', 'security_groups', 'public_ip', 'access_ip_v4', 'access_ip_v6', 'hostname', 'created_at', 'updated_at'],
    huaweicloud_obs_bucket: ['id', 'bucket_domain_name', 'bucket_version', 'region'],
    huaweicloud_vpc_eip: ['id', 'address', 'ipv6_address', 'private_ip', 'port_id', 'status', 'created_at', 'updated_at', 'associate_type', 'associate_id']
  };

  function computePlan(ctx, cfg, st, opts) {
    opts = opts || {};
    var insts = stateInstances(st);
    var byAddr = {};
    for (var i = 0; i < insts.length; i++) byAddr[insts[i].address] = insts[i];
    var actions = [], seen = {};
    var wanted = cfg.allResources || cfg.resources;

    for (var r = 0; r < wanted.length; r++) {
      var res = wanted[r];
      if (res.instances.length === 1 && res.instances[0].unknownCount) {
        actions.push({ kind: 'create', address: res.instances[0].address, res: res, instance: res.instances[0], unknownCount: true });
        continue;
      }
      for (var n = 0; n < res.instances.length; n++) {
        var ri = res.instances[n];
        seen[ri.address] = true;
        var s = byAddr[ri.address];
        if (!s) {
          actions.push({ kind: 'create', address: ri.address, res: res, instance: ri });
          continue;
        }
        var diffs = diffAttrs(res, s, ri);
        if (diffs.length) {
          var isReplace = false;
          for (var d = 0; d < diffs.length; d++) if (diffs[d].forceNew) isReplace = true;
          actions.push({ kind: isReplace ? 'replace' : 'update', address: ri.address, res: res, instance: ri, state: s, diffs: diffs });
        }
      }
    }
    /* state 里有、配置里没有的 → 销毁 */
    for (i = 0; i < insts.length; i++) {
      if (seen[insts[i].address]) continue;
      if (insts[i].mode !== 'managed') continue;
      if (cfg.modules[insts[i].module.replace(/^module\./, '')] && !opts.forceDestroy) {
        /* 模块在配置里存在但实例地址对不上，例如 count 变化，仍然按销毁处理 */
      }
      actions.push({ kind: 'destroy', address: insts[i].address, state: insts[i] });
    }
    /* -replace / -taint 标记 */
    var replaced = opts.replace || [];
    for (i = 0; i < actions.length; i++) {
      if (actions[i].kind === 'update' && replaced.indexOf(actions[i].address) !== -1) {
        actions[i].kind = 'replace';
      }
      if (actions[i].kind === 'create' && actions[i].state === undefined) {
        for (var rp = 0; rp < replaced.length; rp++) {
          if (replaced[rp] === actions[i].address) actions[i].replaceOnly = true;
        }
      }
    }
    /* taint 标记（state 里 status=tainted 的实例按重建处理） */
    for (i = 0; i < actions.length; i++) {
      if (actions[i].kind === 'update' && actions[i].state && String(actions[i].state.instance.status || '') === 'tainted') {
        actions[i].kind = 'replace';
      }
    }
    /* 被 -replace 指定的资源如果还在 state 里，即使配置没变也要重建 */
    for (i = 0; i < replaced.length; i++) {
      var found = false;
      for (var a = 0; a < actions.length; a++) if (actions[a].address === replaced[i]) found = true;
      if (!found && byAddr[replaced[i]]) {
        actions.push({ kind: 'replace', address: replaced[i], state: byAddr[replaced[i]], forcedReplace: true, diffs: [] });
      }
    }
    if (opts.targets && opts.targets.length) {
      var kept = [];
      for (i = 0; i < actions.length; i++) {
        for (var t = 0; t < opts.targets.length; t++) {
          if (actions[i].address === opts.targets[t]) kept.push(actions[i]);
        }
      }
      actions = kept;
    }
    if (opts.destroy) {
      var kills = [];
      for (i = 0; i < insts.length; i++) kills.push({ kind: 'destroy', address: insts[i].address, state: insts[i] });
      if (opts.targets && opts.targets.length) {
        kills = kills.filter(function (k) { return opts.targets.indexOf(k.address) !== -1; });
      }
      actions = kills;
    }
    actions.sort(function (a, b) { return addrSortKey(a.address) < addrSortKey(b.address) ? -1 : 1; });
    var summary = { add: 0, change: 0, destroy: 0 };
    for (i = 0; i < actions.length; i++) {
      if (actions[i].kind === 'create') summary.add++;
      else if (actions[i].kind === 'destroy') summary.destroy++;
      else if (actions[i].kind === 'replace') { summary.change++; summary.destroy++; }
      else summary.change++;
    }
    return { actions: actions, summary: summary, byAddr: byAddr };
  }

  function diffAttrs(res, stateInst, ri) {
    var out = [], forceList = FORCE_NEW[res.type] || [];
    var env = cloneEnv(res.__env || { vars: {}, locals: {}, resAttrs: {} });
    env.scope = {};
    if (ri && ri.indexKey !== undefined) {
      env.scope['count'] = { index: ri.indexKey };
      env.scope['each'] = { key: ri.indexKey, value: ri.indexKey };
    }
    for (var i = 0; i < res.block.attrOrder.length; i++) {
      var name = res.block.attrOrder[i];
      if (name === 'count' || name === 'for_each' || name === 'lifecycle' || name === 'depends_on' || name === 'provider' || name === 'tags') continue;
      var av = res.block.attrs[name];
      var ev = evalExpr(av.text, env);
      if (!ev.ok || ev.unknown) continue;
      var cur = stateInst.attributes[name];
      if (cur === undefined) continue;
      var same = JSON.stringify(cur) === JSON.stringify(ev.value);
      if (!same) {
        out.push({
          name: name, from: cur, to: ev.value,
          forceNew: forceList.indexOf(name) !== -1
        });
      }
    }
    return out;
  }

  /* ---------- 计划输出渲染 ---------- */
  var UNKNOWN = { __unknown: true };

  function resolveAttrForPlan(res, name, ri, env) {
    var av = res.block.attrs[name];
    if (!av) return undefined;
    var ev = evalExpr(av.text, env);
    if (ev.ok && !ev.unknown) return ev.value;
    return UNKNOWN;
  }

  function envForInstance(res, ri) {
    var env = cloneEnv(res.__env || { vars: {}, locals: {}, resAttrs: {} });
    env.scope = {};
    if (ri && ri.indexKey !== undefined) {
      env.scope['count'] = { index: ri.indexKey };
      env.scope['each'] = { key: ri.indexKey, value: ri.indexKey };
    }
    return env;
  }

  function renderCreateBody(res, ri, envIn, indent) {
    var env = envForInstance(res, ri);
    var pad = spaces(indent), lines = [], rows = [], i;
    var attrNames = [];
    for (i = 0; i < res.block.attrOrder.length; i++) {
      var n = res.block.attrOrder[i];
      if (n === 'count' || n === 'for_each' || n === 'lifecycle' || n === 'depends_on' || n === 'provider') continue;
      attrNames.push(n);
    }
    var vals = {};
    var width = 0;
    var comp = SCHEMA_COMPUTED[res.type] || [];
    for (i = 0; i < attrNames.length; i++) {
      var v = resolveAttrForPlan(res, attrNames[i], ri, env);
      if (v === undefined) continue;
      vals[attrNames[i]] = v;
      width = Math.max(width, attrNames[i].length);
    }
    for (i = 0; i < comp.length; i++) {
      if (has(vals, comp[i])) continue;
      width = Math.max(width, comp[i].length);
    }
    for (i = 0; i < attrNames.length; i++) {
      if (!has(vals, attrNames[i])) continue;
      var val = vals[attrNames[i]];
      lines.push(pad + '  + ' + padEnd(attrNames[i], width) + ' = ' + (val === UNKNOWN ? '(known after apply)' : ctyRender(val, pad + '  ')));
    }
    for (i = 0; i < res.block.blocks.length; i++) {
      var nb = res.block.blocks[i];
      lines.push(pad + '  + ' + nb.kind + ' {');
      var inner = [];
      var iw = 0, k;
      for (k = 0; k < nb.attrOrder.length; k++) iw = Math.max(iw, nb.attrOrder[k].length);
      for (k = 0; k < nb.attrOrder.length; k++) {
        var ie = evalExpr(nb.attrs[nb.attrOrder[k]].text, env);
        inner.push(pad + '      + ' + padEnd(nb.attrOrder[k], iw) + ' = ' + (ie.ok && !ie.unknown ? ctyRender(ie.value, pad + '      ') : '(known after apply)'));
      }
      lines = lines.concat(inner);
      lines.push(pad + '    }');
    }
    var comp = SCHEMA_COMPUTED[res.type] || [];
    var shown = {};
    for (i = 0; i < comp.length; i++) {
      if (has(vals, comp[i])) continue;
      if (comp[i] === 'id' && shown['id']) continue;
      shown[comp[i]] = true;
      lines.push(pad + '  + ' + padEnd(comp[i], width) + ' = (known after apply)');
    }    return lines;
  }

  function renderPlan(cfg, plan, opts) {
    opts = opts || {};
    var lines = [], i, a;
    var has = { create: false, update: false, destroy: false, replace: false };
    for (i = 0; i < plan.actions.length; i++) has[plan.actions[i].kind] = true;
    if (!plan.actions.length && !opts.out) {
      return {
        lines: [
          'No changes. Your infrastructure matches the configuration.',
          '',
          'Terraform has compared your real infrastructure against your configuration',
          'and found no differences, so no changes are needed.'
        ],
        summary: plan.summary
      };
    }
    lines.push('Terraform used the selected providers to generate the following execution');
    lines.push('plan. Resource actions are indicated with the following symbols:');
    if (has.create) lines.push('  + create');
    if (has.update) lines.push('  ~ update in-place');
    if (has.replace) lines.push('  -/+ destroy and then create replacement');
    if (has.destroy) lines.push('  - destroy');
    lines.push('');
    lines.push('Terraform will perform the following actions:');
    lines.push('');

    var envBase = cfg.__env;
    for (i = 0; i < plan.actions.length; i++) {
      a = plan.actions[i];
      if (a.kind === 'create') {
        lines.push('  # ' + a.address + ' will be created');
        lines.push('  + resource "' + a.res.type + '" "' + a.res.name + '" {');
        lines = lines.concat(renderCreateBody(a.res, a.instance, envBase, 4));
        lines.push('    }');
      } else if (a.kind === 'update') {
        lines.push('  # ' + a.address + ' will be updated in-place');
        lines.push('  ~ resource "' + a.state.type + '" "' + a.state.name + '" {');
        var w = 0, k;
        for (k = 0; k < a.diffs.length; k++) w = Math.max(w, a.diffs[k].name.length);
        for (k = 0; k < a.diffs.length; k++) {
          lines.push('      ~ ' + padEnd(a.diffs[k].name, w) + ' = ' + ctyRender(a.diffs[k].from) + ' -> ' + ctyRender(a.diffs[k].to));
        }
        var total = keysOf(a.state.attributes).length;
        lines.push('        # (' + Math.max(0, total - a.diffs.length) + ' unchanged attributes hidden)');
        lines.push('    }');
      } else if (a.kind === 'replace') {
        lines.push('  # ' + a.address + ' must be replaced');
        lines.push('  -/+ resource "' + (a.state ? a.state.type : a.res.type) + '" "' + (a.state ? a.state.name : a.res.name) + '" {');
        for (var d = 0; d < (a.diffs || []).length; d++) {
          lines.push('      ~ ' + padEnd(a.diffs[d].name, 20) + ' = ' + ctyRender(a.diffs[d].from) + ' -> ' + ctyRender(a.diffs[d].to) + ' # forces replacement');
        }
        lines.push('        # (其余属性不变，重建后 id 会变化)');
        lines.push('    }');
      } else {
        lines.push('  # ' + a.address + ' will be destroyed');
        lines.push('  - resource "' + a.state.type + '" "' + a.state.name + '" {');
        var ks = keysOf(a.state.attributes), shownN = 0, ww = 0;
        var pick = [];
        for (k = 0; k < ks.length; k++) {
          var v = a.state.attributes[ks[k]];
          if (v === null || typeof v === 'object') continue;
          if (v === '') continue;
          pick.push(ks[k]);
          if (pick.length >= 8) break;
        }
        for (k = 0; k < pick.length; k++) ww = Math.max(ww, pick[k].length);
        for (k = 0; k < pick.length; k++) {
          lines.push('      - ' + padEnd(pick[k], ww) + ' = ' + ctyRender(a.state.attributes[pick[k]]) + ' -> null');
          shownN++;
        }
        lines.push('        # (其余 ' + Math.max(0, ks.length - shownN) + ' 个属性省略，' + NOTE + '真实 terraform 会全部列出)');
        lines.push('    }');
      }
      lines.push('');
    }
    lines.push('Plan: ' + plan.summary.add + ' to add, ' + plan.summary.change + ' to change, ' + plan.summary.destroy + ' to destroy.');
    /* Changes to Outputs */
    var outChanges = outputChanges(cfg, plan);
    if (outChanges.length) {
      lines.push('');
      lines.push('Changes to Outputs:');
      var ow = 0;
      for (i = 0; i < outChanges.length; i++) ow = Math.max(ow, outChanges[i].name.length);
      for (i = 0; i < outChanges.length; i++) {
        lines.push('  ' + outChanges[i].marker + ' ' + padEnd(outChanges[i].name, ow) + ' = ' + outChanges[i].value);
      }
    }
    return { lines: lines, summary: plan.summary };
  }

  function outputChanges(cfg, plan) {
    var st = cfg.__state;
    var known = (st && st.outputs) || {};
    var out = [];
    for (var i = 0; i < cfg.outputsOrder.length; i++) {
      var name = cfg.outputsOrder[i];
      var blk = cfg.outputs[name];
      var val = blk.attrs['value'];
      if (!val) continue;
      var willChange = false;
      var ev = evalExpr(val.text, cfg.__env);
      for (var a = 0; a < plan.actions.length; a++) {
        var act = plan.actions[a];
        if (act.kind === 'update') continue;
        var base = act.address.replace(/\[\d+\]$/, '');
        if (val.text.indexOf(base) !== -1) willChange = true;
      }
      /* update：只有被改动的属性才影响输出值 */
      for (a = 0; a < plan.actions.length; a++) {
        var act2 = plan.actions[a];
        if (act2.kind !== 'update' || !act2.diffs) continue;
        var base2 = act2.address.replace(/\[\d+\]$/, '');
        for (var d = 0; d < act2.diffs.length; d++) {
          if (val.text.indexOf(base2 + '.' + act2.diffs[d].name) !== -1) willChange = true;
        }
      }
      if (!willChange) continue;
      if (has(known, name)) out.push({ name: name, marker: '~', value: ev.ok && !ev.unknown ? ctyRender(ev.value) : '(known after apply)' });
      else out.push({ name: name, marker: '+', value: ev.ok && !ev.unknown ? ctyRender(ev.value) : '(known after apply)' });
    }
    return out;
  }

  /* ======================================================================
     6. 选项解析
     ====================================================================== */
  function parseOpts(argv, spec) {
    var o = { flags: {}, values: {}, pos: [], unknown: [], given: {} };
    for (var i = 0; i < argv.length; i++) {
      var a = argv[i], name = a, val = null;
      var eq = a.indexOf('=');
      if (a.charAt(0) === '-' && eq > 0) { name = a.slice(0, eq); val = a.slice(eq + 1); }
      if (a.charAt(0) !== '-') { o.pos.push(a); continue; }
      if (!has(spec, name)) { o.unknown.push(a); continue; }
      var kind = spec[name];
      if (kind === 'bool') { o.flags[name] = true; o.given[name] = true; continue; }
      if (val === null) {
        if (spec[name] === 'optbool') { o.flags[name] = true; o.given[name] = true; continue; }
        val = argv[i + 1];
        if (val === undefined || (val.charAt(0) === '-' && !/^-\d/.test(val) && spec[name] !== 'value')) { o.unknown.push(a); continue; }
        i++;
      }
      if (kind === 'list') { if (!o.values[name]) o.values[name] = []; o.values[name].push(val); }
      else o.values[name] = val;
      o.given[name] = true;
    }
    return o;
  }

  function flagError(sub, unknown) {
    return U.fail([
      'Error: Failed to parse command-line flags',
      '',
      'flag provided but not defined: ' + unknown[0],
      '',
      'Usage: terraform ' + sub + ' [options]',
      NOTE + '想确认某个选项是否存在，用 terraform ' + sub + ' -help（或查 iac.js 里该条目的 params）。'
    ]);
  }

  function noConfigError(cmd, ctx) {
    var lines = ['Error: No configuration files', ''];
    lines.push(cmd + ' requires configuration to be present. ' + cmd + ' requires a root module,');
    lines.push('which contains the configuration for the resources Terraform will manage.');
    lines.push('');
    lines.push(NOTE + '当前目录 ' + ctx.cwd + ' 下没有 *.tf 文件。本实验的华为云配置在 /data/iac/ 与默认目录 ~ 下，');
    lines.push('先 cd /data/iac 再执行 terraform ' + cmd.toLowerCase() + '。');
    return U.fail(lines);
  }

  function initRequiredError(dir) {
    return U.fail([
      'Error: Inconsistent dependency lock file',
      '',
      'The following dependency selections recorded in the lock file are',
      'inconsistent with the current configuration:',
      '  - provider registry.terraform.io/huaweicloud/huaweicloud: required by this configuration but no version is selected',
      '',
      'To make the initial dependency selections that will initialize the dependency',
      'lock file, run:',
      '  terraform init',
      '',
      NOTE + '这条报错不是配置写错了：先 terraform init 装好 provider，再执行当前命令。'
    ]);
  }

  function requireConfigAndInit(ctx, opts, cmdName, needInit) {
    var cfg = loadConfig(ctx, opts);
    if (!cfg.ok) return { error: noConfigError(cmdName, ctx) };
    if (cfg.errors.length) return { error: configErrors(cfg, cmdName) };
    if (needInit && !dirExists(ctx, ctx.cwd + '/.terraform')) return { error: initRequiredError(ctx.cwd) };
    return { cfg: cfg };
  }

  function configErrors(cfg, cmdName) {
    var lines = [];
    for (var i = 0; i < cfg.errors.length && i < 6; i++) {
      var e = cfg.errors[i];
      lines.push('Error: ' + e.msg);
      lines.push('');
      lines.push('  on ' + e.file + ' line ' + e.line + (e.block ? ', in ' + e.block : '') + ':');
      lines.push('  ' + padStart(String(e.line), 4) + ': ' + (e.text || ''));
      if (e.msg === 'Unclosed configuration block') {
        lines.push('');
        lines.push('There is no closing brace for this block before the end of the file.');
        lines.push('This may be caused by incorrect brace nesting elsewhere in this file.');
      }
      lines.push('');
    }
    if (!lines.length) return U.fail(['Error: Invalid configuration']);
    return U.fail(lines);
  }

  /* 把配置里的 var/local 环境准备好（plan / validate / console 共用） */
  function prepareEnv(ctx, cfg) {
    var resAttrs = stAttrs(ctx, {});
    var env = {
      vars: cfg.vars || {}, locals: cfg.locals || {}, workspace: currentWorkspace(ctx),
      resAttrs: resAttrs, scope: {}, moduleOut: {}
    };
    cfg.__env = env;
    var i;
    for (i = 0; i < (cfg.resources || []).length; i++) cfg.resources[i].__env = env;
    for (var mn in cfg.modules) {
      if (!has(cfg.modules, mn)) continue;
      var mod = cfg.modules[mn];
      var menv = mod.env || env;
      /* 模块输出（用于根模块里 module.x.y 的引用） */
      var outs = mod.outputs || {};
      for (var on in outs) {
        if (!has(outs, on)) continue;
        var oev = evalExpr(outs[on].attrs['value'] ? outs[on].attrs['value'].text : '', menv);
        env.moduleOut[mn + '.' + on] = (oev.ok && !oev.unknown) ? oev.value : null;
      }
      for (i = 0; i < mod.resources.length; i++) mod.resources[i].__env = menv;
    }
    return env;
  }

  /* ======================================================================
     7. terraform 各子命令
     ====================================================================== */
  var TF_VERSION = '1.5.7';
  var HWC_VERSION = '1.60.1';
  var HWC_VERSION_NEW = '1.62.0';

  function providerHashes(version) {
    var seed = 2166136261, i;
    for (i = 0; i < version.length; i++) { seed ^= version.charCodeAt(i); seed = (seed * 16777619) >>> 0; }
    function next() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; }
    var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var hexChars = '0123456789abcdef';
    function hex(n) { var s = '', k; for (k = 0; k < n; k++) s += hexChars.charAt(next() % 16); return s; }
    function b64s(n) { var s = '', k; for (k = 0; k < n; k++) s += b64.charAt(next() % 64); return s; }
    return ['h1:' + b64s(43) + '=', 'zh:' + hex(64)];
  }

  function lockFileText(version, constraints, platforms) {
    var lines = [
      '# This file is maintained automatically by "terraform init".',
      '# Manual edits may be lost in future updates.',
      '',
      'provider "registry.terraform.io/huaweicloud/huaweicloud" {',
      '  version     = "' + version + '"',
      '  constraints = "' + constraints + '"',
      '  hashes = ['
    ];
    var hs = providerHashes(version);
    for (var i = 0; i < hs.length; i++) lines.push('    "' + hs[i] + '",');
    lines.push('  ]');
    lines.push('}');
    return lines.join('\n') + '\n';
  }

  function backendStateText() {
    return JSON.stringify({
      version: 3, serial: 1, lineage: '3f2b1c0a-9e8d-4c7b-8a6f-5d4e3c2b1a09',
      backend: { type: 'local', config: null, hash: 0 },
      modules: [{ path: ['root'], outputs: {}, resources: {} }]
    }, null, 2) + '\n';
  }

  function tfInit(argv, ctx) {
    var o = parseOpts(argv, {
      '-upgrade': 'bool', '-reconfigure': 'bool', '-migrate-state': 'bool',
      '-backend-config': 'list', '-plugin-dir': 'value', '-get': 'bool',
      '-input': 'value', '-lock-timeout': 'value', '-no-color': 'bool', '-json': 'bool', '-help': 'bool'
    });
    if (o.unknown.length) return flagError('init', o.unknown);
    if (o.flags['-migrate-state']) {
      return U.ok([
        'Initializing the backend...',
        'Backend configuration changed!',
        '',
        'Terraform has detected that the configuration specified for the backend',
        'has changed. Terraform will now check for existing state in the backends.',
        '',
        NOTE + '教学环境不会连华为云 OBS：真实执行这里会提示把本地 state 复制到 OBS 桶',
        '（会问 yes 确认）。远端 state 的配置见 versions.tf 里注释掉的 backend "s3" 块，',
        '以及分类条目 iac-tf-backend。state 未做任何迁移。'
      ]);
    }
    var rootFiles = collectFiles(ctx, ctx.cwd, ['.tf'], false);
    if (!rootFiles.length) {
      return U.ok([
        'Terraform initialized in an empty directory!',
        '',
        'The directory has no Terraform configuration files. You may begin working',
        'with Terraform immediately by creating Terraform configuration files.',
        '',
        NOTE + '本实验的华为云配置在 /data/iac/ 与默认目录 ~（当前就是 ~）下：',
        'cd /data/iac 再执行 terraform init，就能看到完整的 provider 下载过程。'
      ]);
    }
    var cfg = loadConfig(ctx, {});
    if (!cfg.ok) return noConfigError('Init', ctx);
    var lines = ['Initializing the backend...', ''];
    if (o.values['-backend-config'] && o.values['-backend-config'].length) {
      lines.push(NOTE + '当前目录的 backend 是默认的 local（versions.tf 里的 backend "s3" 还注释着），');
      lines.push('所以 -backend-config 传入的参数这次不生效；生产上把 backend 块打开后再执行：');
      lines.push('  terraform init -reconfigure -backend-config=access_key=$HW_ACCESS_KEY -backend-config=secret_key=$HW_SECRET_KEY');
      lines.push('AK/SK 只走环境变量或 -backend-config，绝不写进 .tf 文件。');
      lines.push('');
    }
    lines.push('Initializing provider plugins...');
    var ver = HWC_VERSION;
    if (o.flags['-upgrade']) {
      lines.push('- Finding huaweicloud/huaweicloud versions matching "~> 1.60"...');
      lines.push('- Installing huaweicloud/huaweicloud v' + HWC_VERSION_NEW + '...');
      lines.push('- Installed huaweicloud/huaweicloud v' + HWC_VERSION_NEW + ' (self-signed, key ID 3B1B1B1B1B1B1B1B)');
      ver = HWC_VERSION_NEW;
    } else {
      lines.push('- Finding huaweicloud/huaweicloud versions matching "~> 1.60"...');
      lines.push('- Installing huaweicloud/huaweicloud v' + HWC_VERSION + '...');
      lines.push('- Installed huaweicloud/huaweicloud v' + HWC_VERSION + ' (self-signed, key ID 3B1B1B1B1B1B1B1B)');
    }
    lines.push('');
    lines.push('Partner and community providers are signed by their developers.');
    lines.push('If you\'d like to know more about provider signing, you can read about it here:');
    lines.push('https://developer.hashicorp.com/terraform/cli/plugins/signing');
    lines.push('');
    lines.push('Terraform has created a lock file .terraform.lock.hcl to record the provider');
    lines.push('selections it made above. Include this file in your version control repository');
    lines.push('so that Terraform can guarantee to make the same selections by default when');
    lines.push('you run "terraform init" in the future.');
    lines.push('');
    lines.push('Terraform has been successfully initialized!');
    lines.push('');
    lines.push('You may now begin working with Terraform. Try running "terraform plan" to see');
    lines.push('any changes that are required for your infrastructure. All Terraform commands');
    lines.push('should now work.');
    lines.push('');
    lines.push('If you ever set or change modules or backend configuration for Terraform,');
    lines.push('rerun this command to reinitialize your working directory. If you forget, other');
    lines.push('commands will detect it and remind you to do so if necessary.');

    /* 真的落地 .terraform/ 与 lock 文件（本地操作，可验证） */
    var base = ctx.cwd + '/.terraform';
    mkdirp(ctx, base + '/modules');
    mkdirp(ctx, base + '/providers/registry.terraform.io/huaweicloud/huaweicloud/' + ver + '/linux_amd64');
    writeText(ctx, base + '/environment', currentWorkspace(ctx) + '\n');
    writeText(ctx, base + '/terraform.tfstate', backendStateText());
    var modJson = { Modules: [{ Key: '', Source: '', Dir: '.' }] };
    for (var m in cfg.modules) {
      if (!has(cfg.modules, m)) continue;
      modJson.Modules.push({ Key: m, Source: cfg.modules[m].source, Dir: cfg.modules[m].source.replace(/^\.\//, '') });
    }
    writeText(ctx, base + '/modules/modules.json', JSON.stringify(modJson) + '\n');
    writeText(ctx, base + '/providers/registry.terraform.io/huaweicloud/huaweicloud/' + ver + '/linux_amd64/terraform-provider-huaweicloud_v' + ver,
      '<binary>terraform-provider-huaweicloud v' + ver + ' (教学环境占位文件)');
    writeText(ctx, ctx.cwd + '/.terraform.lock.hcl', lockFileText(ver, '~> 1.60'));
    /* 变量文件里的未声明变量：init 不检查，plan 才报 */
    return U.ok(lines);
  }

  function tfPlan(argv, ctx) {
    var o = parseOpts(argv, {
      '-out': 'value', '-var': 'list', '-var-file': 'list', '-target': 'list', '-replace': 'list',
      '-destroy': 'bool', '-refresh': 'value', '-refresh-only': 'bool', '-detailed-exitcode': 'bool',
      '-parallelism': 'value', '-lock': 'value', '-lock-timeout': 'value', '-input': 'value',
      '-compact-warnings': 'bool', '-no-color': 'bool', '-json': 'bool', '-state': 'value', '-help': 'bool'
    });
    if (o.unknown.length) return flagError('plan', o.unknown);
    if (o.pos.length) {
      return U.fail([
        'Error: Too many command line arguments',
        '',
        'To specify a working directory for the plan, use the global -chdir flag.',
        NOTE + '用法：terraform plan [选项]（不接受位置参数）。'
      ]);
    }
    return runPlanLike(ctx, o, 'plan');
  }

  function runPlanLike(ctx, o, mode) {
    var prep = requireConfigAndInit(ctx, {
      varFiles: o.values['-var-file'], vars: parseVarPairs(o.values['-var']), statePath: o.values['-state']
    }, 'Plan', true);
    if (prep.error) return prep.error;
    var cfg = prep.cfg;
    var env = prepareEnv(ctx, cfg);
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    cfg.__state = st.state;
    var plan = computePlan(ctx, cfg, st.state, {
      targets: o.values['-target'], replace: o.values['-replace'], destroy: o.flags['-destroy']
    });
    var rendered = renderPlan(cfg, plan, { out: o.values['-out'] });
    var out = [], err = [];
    if (o.values['-target'] && o.values['-target'].length) {
      err.push('Warning: Resource targeting is in effect');
      err.push('');
      err.push('You are creating a plan with the -target option, which means that the result');
      err.push('of this plan may not represent all of the changes requested by the current');
      err.push('configuration.');
      err.push('');
      err.push('The -target option is not for routine use, and is provided only for exceptional');
      err.push('situations such as recovering from errors or mistakes, or when Terraform');
      err.push('specifically suggests it. Remember that -target is a debugging tool, and using');
      err.push('it routinely will cause your state to drift from your configuration.');
    }
    if (o.flags['-refresh-only']) {
      out.push('Refreshing state...');
      var insts = stateInstances(st.state);
      for (var i = 0; i < insts.length; i++) {
        out.push(insts[i].address + ': Refreshing state... [id=' + (insts[i].attributes.id || '') + ']');
      }
      out.push('');
      out.push('No changes. Your infrastructure matches the configuration.');
      out.push('');
      out.push(NOTE + '教学环境没有华为云 API：这是按本地 terraform.tfstate 仿真出来的刷新结果，');
      out.push('真实环境会逐个资源调 Read 接口，并把云上的真实属性写回 state（state 未改写）。');
      return warnOut(out, err, 0);
    }
    out = out.concat(rendered.lines);
    var code = 0;
    if (o.flags['-detailed-exitcode']) {
      err.push(NOTE + '-detailed-exitcode：本次计划有变更，退出码 2（0=无变更 / 1=出错 / 2=有变更）。');
      code = (plan.actions.length && !o.values['-out']) ? 2 : (plan.actions.length ? 2 : 0);
      if (!plan.actions.length) code = 0;
    }
    /* plan -out=FILE：真的写一份可读的计划文件（真实 terraform 是二进制格式） */
    if (o.values['-out']) {
      var f = U.resolvePath(ctx.cwd, o.values['-out']);
      var payload = {
        format: 'teaching-sim-plan',
        note: '教学环境写的计划文件是可读 JSON；真实 terraform 的 tfplan 是二进制格式，含敏感值，不要提交 Git',
        terraform_version: TF_VERSION,
        cwd: ctx.cwd,
        created: nowStamp(),
        serial: (st.state && st.state.serial) || 0,
        destroy: !!o.flags['-destroy'],
        summary: plan.summary,
        actions: []
      };
      for (var a = 0; a < plan.actions.length; a++) {
        var act = plan.actions[a];
        payload.actions.push({
          kind: act.kind, address: act.address,
          type: act.res ? act.res.type : act.state.type,
          name: act.res ? act.res.name : act.state.name
        });
      }
      writeText(ctx, f, JSON.stringify(payload, null, 2) + '\n');
      out.push('');
      out.push(NOTE + '已把计划写入 ' + o.values['-out'] + '（教学环境用可读 JSON 保存；真实 terraform 的');
      out.push('tfplan 是二进制格式且可能含敏感值，别提交 Git）。执行方式：terraform apply ' + o.values['-out']);
    }
    return warnOut(out, err, code);
  }

  function parseVarPairs(list) {
    var out = {};
    if (!list) return out;
    for (var i = 0; i < list.length; i++) {
      var s = list[i], eq = s.indexOf('=');
      if (eq < 0) continue;
      var k = trim(s.slice(0, eq)), v = parseValue(s.slice(eq + 1));
      out[k] = v.literal ? litToJs(v) : s.slice(eq + 1);
    }
    return out;
  }

  function varsFromUnknownFiles(cfg) {
    /* tfvars 里写了未声明的变量：plan/apply 会直接报错 */
    var bad = [];
    var unk = (cfg._autoVarUnknown || []).concat(cfg._varFileUnknown || []);
    for (var i = 0; i < unk.length; i++) {
      if (!has(cfg.variables, unk[i])) bad.push(unk[i]);
    }
    return bad;
  }

  function tfApply(argv, ctx) {
    var o = parseOpts(argv, {
      '-auto-approve': 'bool', '-replace': 'list', '-target': 'list', '-var': 'list', '-var-file': 'list',
      '-parallelism': 'value', '-lock': 'value', '-lock-timeout': 'value', '-input': 'value',
      '-refresh': 'value', '-refresh-only': 'bool', '-destroy': 'bool', '-compact-warnings': 'bool',
      '-no-color': 'bool', '-json': 'bool', '-state': 'value', '-state-out': 'value', '-backup': 'value', '-help': 'bool'
    });
    if (o.unknown.length) return flagError('apply', o.unknown);
    var planFile = o.pos.length ? o.pos[0] : null;
    if (o.pos.length > 1) {
      return U.fail(['Error: Too many command line arguments', '', 'Only one plan file may be given to terraform apply.']);
    }
    if (planFile) return applySavedPlan(ctx, o, planFile);
    if (o.flags['-refresh-only']) return refreshOnly(ctx, o);
    return applyComputedPlan(ctx, o);
  }

  function loadPlanFile(ctx, fname) {
    var abs = U.resolvePath(ctx.cwd, fname);
    var txt = readText(ctx, abs);
    if (txt === null) {
      return { err: U.fail([
        'Error: Failed to read the given plan file',
        '',
        'The plan file "' + fname + '" could not be read. Please check the path and try again.',
        NOTE + '计划文件要先由 terraform plan -out=' + fname + ' 生成。'
      ]) };
    }
    try {
      var data = JSON.parse(txt);
      if (data.format !== 'teaching-sim-plan') return { err: U.fail(['Error: Failed to read the given plan file', '', 'The file "' + fname + '" is not a plan file created by terraform plan -out.']) };
      return { plan: data, abs: abs };
    } catch (e) {
      return { err: U.fail(['Error: Failed to read the given plan file', '', 'The file "' + fname + '" is not a valid plan file (' + e.message + ').']) };
    }
  }

  function applySavedPlan(ctx, o, fname) {
    var loaded = loadPlanFile(ctx, fname);
    if (loaded.err) return loaded.err;
    var p = loaded.plan;
    var out = ['', 'Terraform will perform the following actions:', ''];
    for (var i = 0; i < p.actions.length; i++) {
      var a = p.actions[i];
      var verb = a.kind === 'create' ? 'will be created' : (a.kind === 'destroy' ? 'will be destroyed' : (a.kind === 'replace' ? 'must be replaced' : 'will be updated in-place'));
      out.push('  # ' + a.address + ' ' + verb);
    }
    out.push('');
    out.push('Plan: ' + p.summary.add + ' to add, ' + p.summary.change + ' to change, ' + p.summary.destroy + ' to destroy.');
    out.push('');
    out = out.concat(applyProgress(p.actions));
    out.push('');
    out.push('Apply complete! Resources: ' + p.summary.add + ' added, ' + p.summary.change + ' changed, ' + p.summary.destroy + ' destroyed.');
    out.push('');
    out = out.concat(noCloudNote(p.destroy ? 'destroy' : 'apply'));
    return U.ok(out);
  }

  function applyProgress(actions) {
    var lines = [], i;
    for (i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a.kind === 'create') {
        lines.push(a.address + ': Creating...');
        lines.push(a.address + ': Creation complete after ' + (3 + i * 2) + 's [id=' + fakeIdFor(a.address) + ']');
      } else if (a.kind === 'update') {
        lines.push(a.address + ': Modifying... [id=' + fakeIdFor(a.address) + ']');
        lines.push(a.address + ': Modifications complete after 1s [id=' + fakeIdFor(a.address) + ']');
      } else if (a.kind === 'replace') {
        lines.push(a.address + ': Destroying... [id=' + fakeIdFor(a.address) + ']');
        lines.push(a.address + ': Destruction complete after 2s');
        lines.push(a.address + ': Creating...');
        lines.push(a.address + ': Creation complete after 24s [id=' + fakeIdFor(a.address) + ']');
      } else {
        lines.push(a.address + ': Destroying... [id=' + fakeIdFor(a.address) + ']');
        lines.push(a.address + ': Destruction complete after 2s');
      }
    }
    return lines;
  }

  function fakeIdFor(addr) {
    if (addr.indexOf('web_eip') !== -1) return '2c7f39f3-702b-48d1-940c-b50384177ee1';
    if (addr.indexOf('old_eip') !== -1) return API.LEGACY_EIP_ID;
    if (addr.indexOf('obs_bucket') !== -1) return 'logs-prod-cn-north-4';
    if (addr.indexOf('compute_instance.web') !== -1) return API.ECS_WEB_ID;
    if (addr.indexOf('compute_instance.app[0]') !== -1) return API.ECS_APP1_ID;
    if (addr.indexOf('compute_instance.app[1]') !== -1) return API.ECS_APP2_ID;
    if (addr.indexOf('vpc_subnet.app') !== -1) return API.SUB_APP_ID;
    if (addr.indexOf('vpc_subnet.db') !== -1) return API.SUB_DB_ID;
    if (addr.indexOf('huaweicloud_vpc.main') !== -1) return API.VPC_ID;
    return '3f7a1c2e-0000-4000-8000-000000000001';
  }

  function noCloudNote(kind) {
    var lines = [];
    lines.push(NOTE + '教学环境不会真的调用华为云 API：上面这些资源 ID、耗时是按本地配置与 state 仿真出来的，');
    lines.push('terraform.tfstate **没有**被改写（真实环境 ' + kind + ' 结束后 state 会记下这些资源）。');
    lines.push('要真建资源：装好 Terraform 与华为云 AK/SK，先 terraform plan -out=tfplan 人眼核对，');
    lines.push('再 terraform apply tfplan；生产账号里务必收掉 destroy 权限、给数据类资源加 prevent_destroy。');
    return lines;
  }

  function applyComputedPlan(ctx, o) {
    var prep = requireConfigAndInit(ctx, {
      varFiles: o.values['-var-file'], vars: parseVarPairs(o.values['-var']), statePath: o.values['-state']
    }, 'Apply', true);
    if (prep.error) return prep.error;
    var cfg = prep.cfg;
    prepareEnv(ctx, cfg);
    var bad = varsFromUnknownFiles(cfg);
    if (bad.length) {
      return U.fail([
        'Error: Value for undeclared variable',
        '',
        'A variable named "' + bad[0] + '" was assigned in a tfvars file, but the root module does',
        'not declare a variable using that name.',
        '',
        NOTE + '删掉变量时记得同步清理 terraform.tfvars / prod.tfvars。'
      ]);
    }
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    cfg.__state = st.state;
    var plan = computePlan(ctx, cfg, st.state, {
      targets: o.values['-target'], replace: o.values['-replace'], destroy: o.flags['-destroy']
    });
    var rendered = renderPlan(cfg, plan, {});
    var out = rendered.lines.slice();
    /* 交互确认 */
    var needPrompt = !o.flags['-auto-approve'];
    if (needPrompt) {
      out.push('');
      out.push('Do you want to perform these actions?');
      out.push('  Terraform will perform the actions described above.');
      out.push('  Only \'yes\' will be accepted to approve.');
      out.push('');
      out.push('  Enter a value: ');
      out.push('');
      out.push(NOTE + '单行教学终端没有交互输入，所以这里停下、什么都不会执行（真实环境会等你输入 yes）。');
      out.push('要无人值守执行：先 terraform plan -out=tfplan 存档，再 terraform apply tfplan；');
      out.push('或者在测试环境直接 terraform apply -auto-approve（省掉的是人眼检查，不是步骤）。');
      return U.ok(out);
    }
    out.push('');
    out = out.concat(applyProgress(plan.actions));
    out.push('');
    out.push('Apply complete! Resources: ' + plan.summary.add + ' added, ' + plan.summary.change + ' changed, ' + plan.summary.destroy + ' destroyed.');
    var oc = outputChanges(cfg, plan);
    if (oc.length) {
      out.push('');
      out.push('Outputs:');
      out.push('');
      for (var i = 0; i < oc.length; i++) out.push(oc[i].name + ' = ' + (oc[i].value === '(known after apply)' ? '"（apply 之后才有值）"' : oc[i].value));
    }
    var known = st.state && st.state.outputs ? st.state.outputs : {};
    var ks = keysOf(known), printed = false;
    for (i = 0; i < ks.length; i++) {
      var nm = ks[i];
      var dup = false;
      for (var j = 0; j < oc.length; j++) if (oc[j].name === nm) dup = true;
      if (dup) continue;
      if (!printed) { out.push(''); out.push('Outputs:'); out.push(''); printed = true; }
      var ov = known[nm];
      out.push(nm + ' = ' + (ov.sensitive ? '<sensitive>' : ctyRender(ov.value)));
    }
    out.push('');
    out = out.concat(noCloudNote('apply'));
    return U.ok(out);
  }

  function refreshOnly(ctx, o) {
    var prep = requireConfigAndInit(ctx, {
      varFiles: o.values['-var-file'], vars: parseVarPairs(o.values['-var'])
    }, 'Apply', true);
    if (prep.error) return prep.error;
    var cfg = prep.cfg;
    prepareEnv(ctx, cfg);
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    var insts = stateInstances(st.state);
    var out = [];
    for (var i = 0; i < insts.length; i++) out.push(insts[i].address + ': Refreshing state... [id=' + (insts[i].attributes.id || '') + ']');
    out.push('');
    out.push('No changes. Your infrastructure matches the configuration.');
    out.push('');
    out.push('Terraform has compared your real infrastructure against your configuration and');
    out.push('found no differences, so no changes are needed.');
    out.push('');
    out.push('Apply complete! Resources: 0 added, 0 changed, 0 destroyed.');
    out.push('');
    out.push(NOTE + '教学环境没有华为云 API，-refresh-only 只按本地 state 仿真，state 未改写；');
    out.push('真实环境这一步只刷新 state、不碰资源，是 0.15.4 起官方推荐的 refresh 写法。');
    return U.ok(out);
  }

  function tfDestroy(argv, ctx) {
    var o = parseOpts(argv, {
      '-auto-approve': 'bool', '-target': 'list', '-var': 'list', '-var-file': 'list', '-refresh': 'value',
      '-parallelism': 'value', '-lock': 'value', '-lock-timeout': 'value', '-input': 'value',
      '-no-color': 'bool', '-compact-warnings': 'bool', '-state': 'value', '-help': 'bool'
    });
    if (o.unknown.length) return flagError('destroy', o.unknown);
    var prep = requireConfigAndInit(ctx, {
      varFiles: o.values['-var-file'], vars: parseVarPairs(o.values['-var'])
    }, 'Destroy', true);
    if (prep.error) return prep.error;
    var cfg = prep.cfg;
    prepareEnv(ctx, cfg);
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    cfg.__state = st.state;
    var plan = computePlan(ctx, cfg, st.state, { destroy: true, targets: o.values['-target'] });
    var rendered = renderPlan(cfg, plan, {});
    var out = rendered.lines.slice();
    if (!o.flags['-auto-approve']) {
      out.push('');
      out.push('Do you really want to destroy all resources?');
      out.push('  Terraform will destroy all your managed infrastructure, as shown above.');
      out.push('  There is no undo. Only \'yes\' will be accepted to confirm.');
      out.push('');
      out.push('  Enter a value: ');
      out.push('');
      out.push(NOTE + '单行教学终端无法输入 yes，所以这里停下，**没有删除任何东西**。');
      out.push('真实环境的推荐姿势：terraform plan -destroy -out=destroy.tfplan → 人眼核对清单 →');
      out.push('terraform apply destroy.tfplan；删单台机器用 -target，比整体 destroy 安全得多。');
      return U.ok(out);
    }
    out.push('');
    out = out.concat(applyProgress(plan.actions));
    out.push('');
    out.push('Destroy complete! Resources: ' + plan.summary.destroy + ' destroyed.');
    out.push('');
    out = out.concat(noCloudNote('destroy'));
    out.push(NOTE + '提醒：ECS 删除后系统盘一起消失、EIP 默认随实例释放；OBS 桶非空时删不掉');
    out.push('（force_destroy 默认 false 就是防误删）。');
    return U.ok(out);
  }

  function tfValidate(argv, ctx) {
    var o = parseOpts(argv, { '-json': 'bool', '-no-color': 'bool', '-help': 'bool' });
    if (o.unknown.length) return flagError('validate', o.unknown);
    var cfg = loadConfig(ctx, {});
    if (!cfg.ok) {
      if (o.flags['-json']) {
        return U.fail([JSON.stringify({
          format_version: '1.0', valid: false, error_count: 1, warning_count: 0,
          diagnostics: [{
            severity: 'error', summary: 'No configuration files',
            detail: 'Validate requires configuration to be present. Create a *.tf file in the current directory first.',
            range: null
          }]
        }, null, 2)]);
      }
      return noConfigError('Validate', ctx);
    }
    var diags = [];
    if (!dirExists(ctx, ctx.cwd + '/.terraform')) {
      if (o.flags['-json']) {
        return U.fail([JSON.stringify({
          format_version: '1.0', valid: false, error_count: 1, warning_count: 0,
          diagnostics: [{
            severity: 'error', summary: 'Missing required provider',
            detail: 'This configuration requires provider registry.terraform.io/huaweicloud/huaweicloud, but that provider isn\'t available. Run "terraform init" first.',
            range: null
          }]
        }, null, 2)]);
      }
      return U.fail([
        'Error: Missing required provider',
        '',
        'This configuration requires provider registry.terraform.io/huaweicloud/huaweicloud,',
        'but that provider isn\'t available. You may be able to install it automatically by running:',
        '  terraform init',
        '',
        NOTE + 'validate 必须在 terraform init 之后跑：它要用 provider 的 schema 才能校验参数。'
      ]);
    }
    for (var i = 0; i < cfg.errors.length; i++) {
      var e = cfg.errors[i];
      diags.push({
        severity: 'error', summary: e.msg,
        detail: e.msg === 'Unclosed configuration block'
          ? 'There is no closing brace for this block before the end of the file. This may be caused by incorrect brace nesting elsewhere in this file.'
          : 'The block/argument on line ' + e.line + ' of ' + e.file + ' is not valid HCL.',
        range: { filename: e.file, start: { line: e.line, column: 1 }, end: { line: e.line, column: 1 } }
      });
    }
    /* 引用检查：var./local./resource 是否声明 */
    var refErrors = checkReferences(ctx, cfg);
    for (i = 0; i < refErrors.length; i++) diags.push(refErrors[i]);
    if (o.flags['-json']) {
      var jr = {
        format_version: '1.0',
        valid: diags.length === 0,
        error_count: diags.length,
        warning_count: 0,
        diagnostics: diags
      };
      return diags.length ? { out: [JSON.stringify(jr, null, 2)], err: [], code: 1 } : U.ok([JSON.stringify(jr, null, 2)]);
    }
    if (diags.length) {
      var lines = [];
      for (i = 0; i < diags.length; i++) {
        lines.push('Error: ' + diags[i].summary);
        lines.push('');
        if (diags[i].range) {
          lines.push('  on ' + diags[i].range.filename + ' line ' + diags[i].range.start.line + ':');
          lines.push('');
        }
        lines.push(diags[i].detail);
        lines.push('');
      }
      lines.push(NOTE + '教学环境的 validate 覆盖语法与引用层面的检查；配额、规格售罄、镜像与区域');
      lines.push('不匹配这类问题只有 plan/apply 打到云上才会暴露。');
      return U.fail(lines);
    }
    var okLines = ['Success! The configuration is valid.', ''];
    okLines.push(NOTE + 'validate 只校验配置本身（语法、引用、必填参数），不访问云端、不碰 state；');
    okLines.push('它通过不代表能 apply：配额与规格问题要等 plan 才知道。');
    return U.ok(okLines);
  }

  function checkReferences(ctx, cfg) {
    var diags = [];
    var knownTypes = {
      huaweicloud_vpc: 1, huaweicloud_vpc_subnet: 1, huaweicloud_compute_instance: 1,
      huaweicloud_obs_bucket: 1, huaweicloud_vpc_eip: 1, huaweicloud_networking_secgroup: 1,
      huaweicloud_networking_secgroup_rule: 1, huaweicloud_compute_eip_associate: 1,
      huaweicloud_evs_volume: 1, huaweicloud_compute_volume_attach: 1
    };
    /* 根模块与每个子模块各有一个作用域：变量、locals、资源都不能跨作用域混用 */
    var scopes = [{
      files: cfg.rootFiles, variables: cfg.variables, locals: cfg.locals,
      resources: cfg.resources, title: ''
    }];
    for (var mn in cfg.modules) {
      if (!has(cfg.modules, mn)) continue;
      var mod = cfg.modules[mn];
      if (!mod.dir || mod.missing) continue;
      scopes.push({
        files: collectFiles(ctx, mod.dir, ['.tf'], true),
        variables: mod.variables || {}, locals: mod.locals || {},
        resources: mod.resources, title: 'module.' + mn + ' '
      });
    }
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s], declaredRes = {}, i;
      for (i = 0; i < scope.resources.length; i++) declaredRes[scope.resources[i].type + '.' + scope.resources[i].name] = true;
      for (i = 0; i < scope.files.length; i++) {
        var txt = readText(ctx, scope.files[i].abs);
        var lines = String(txt === null ? '' : txt).split('\n');
        for (var l = 0; l < lines.length; l++) {
          scanRefs(stripComment(lines[l]), scope.files[i].rel, l + 1, scope, declaredRes, knownTypes, diags);
        }
      }
    }
    return diags;
  }

  function scanRefs(text, file, line, scope, declaredRes, knownTypes, diags) {
    var m, re = /\b(var|local)\.([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((m = re.exec(text)) !== null) {
      if (m[1] === 'var' && !has(scope.variables, m[2])) {
        diags.push({
          severity: 'error', summary: 'Reference to undeclared input variable',
          detail: scope.title + 'There is no variable named "' + m[2] + '".',
          range: { filename: file, start: { line: line, column: 1 }, end: { line: line, column: 1 } }
        });
      }
      if (m[1] === 'local' && !has(scope.locals, m[2])) {
        diags.push({
          severity: 'error', summary: 'Reference to undeclared local value',
          detail: scope.title + 'There is no local value named "' + m[2] + '". (引用写法是 local.xxx，不是 locals.xxx)',
          range: { filename: file, start: { line: line, column: 1 }, end: { line: line, column: 1 } }
        });
      }
    }
    var re2 = /\b(huaweicloud_[a-z0-9_]+)\.([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((m = re2.exec(text)) !== null) {
      if (!has(knownTypes, m[1])) continue;
      if (has(declaredRes, m[1] + '.' + m[2])) continue;
      diags.push({
        severity: 'error', summary: 'Reference to undeclared resource',
        detail: scope.title + 'A managed resource "' + m[1] + '" "' + m[2] + '" has not been declared.',
        range: { filename: file, start: { line: line, column: 1 }, end: { line: line, column: 1 } }
      });
    }
  }

  function tfFmt(argv, ctx) {
    var o = parseOpts(argv, {
      '-recursive': 'bool', '-check': 'bool', '-diff': 'bool', '-write': 'value',
      '-list': 'value', '-no-color': 'bool', '-help': 'bool'
    });
    if (o.unknown.length) return flagError('fmt', o.unknown);
    var targets = o.pos.slice();
    var recursive = !!o.flags['-recursive'];
    var check = !!o.flags['-check'];
    var diff = !!o.flags['-diff'];
    var write = !(o.given['-write'] && o.values['-write'] === 'false');
    var listFiles = !(o.given['-list'] && o.values['-list'] === 'false');

    var files = [];
    if (!targets.length) {
      files = collectFiles(ctx, ctx.cwd, ['.tf'], recursive);
    } else {
      for (var t = 0; t < targets.length; t++) {
        var abs = U.resolvePath(ctx.cwd, targets[t]);
        var rn = realNode(ctx, abs);
        if (!rn.node) {
          return U.fail(['Error: No file or directory at ' + targets[t], '', NOTE + 'fmt 只处理 *.tf 文件或目录。']);
        }
        if (isDir(rn.node)) {
          files = files.concat(collectFiles(ctx, rn.abs, ['.tf'], recursive));
        } else {
          if (targets[t].slice(-3) !== '.tf') {
            return U.fail(['Error: Only .tf files can be formatted: ' + targets[t]]);
          }
          files.push({ abs: abs, realAbs: rn.abs, rel: targets[t] });
        }
      }
    }
    var changed = [], out = [], diffs = [];
    for (var i = 0; i < files.length; i++) {
      var text = readText(ctx, files[i].abs);
      if (text === null) continue;
      var formatted = formatHcl(text);
      if (formatted !== text) {
        changed.push(files[i].rel);
        if (diff) diffs.push({ rel: files[i].rel, before: text, after: formatted });
        if (write && !check) writeText(ctx, files[i].abs, formatted);
      }
    }
    for (i = 0; i < changed.length; i++) if (listFiles) out.push(changed[i]);
    if (diff && diffs.length) {
      for (i = 0; i < diffs.length; i++) {
        out.push('--- old/' + diffs[i].rel);
        out.push('+++ new/' + diffs[i].rel);
        out = out.concat(simpleDiff(diffs[i].before, diffs[i].after));
      }
    }
    if (!files.length) {
      out.push(NOTE + '当前目录下没有 *.tf 文件可格式化。');
      return U.ok(out);
    }
    if (!changed.length) {
      out.push(NOTE + '已检查 ' + files.length + ' 个 .tf 文件，全部符合官方格式（fmt 无输出就是真机的正常结果）。');
      return U.ok(out);
    }
    if (check) {
      out.push(NOTE + '-check 只报告不修改：上面 ' + changed.length + ' 个文件需要 terraform fmt（退出码 3，CI 里据此拦提交）。');
      return { out: out, err: [], code: 3 };
    }
    if (!write) {
      out.push(NOTE + '-write=false：只把结果打印出来，没有写文件。');
      return U.ok(out);
    }
    out.push(NOTE + '共格式化 ' + changed.length + ' 个文件（缩进与 = 对齐，不改语义）。');
    return U.ok(out);
  }

  /* 极简 HCL 格式化：tab→2 空格、块内 = 对齐、去行尾空格 */
  function formatHcl(text) {
    var lines = String(text).split('\n');
    var out = [], width = 0, bucket = [];
    function flush() {
      for (var i = 0; i < bucket.length; i++) {
        var parts = bucket[i];
        out.push(parts.indent + padEnd(parts.key, width) + ' = ' + parts.val);
      }
      bucket = []; width = 0;
    }
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/\t/g, '  ').replace(/\s+$/, '');
      var line = trim(raw);
      var m = raw.match(/^(\s*)([A-Za-z_][A-Za-z0-9_\-]*)\s+=\s+(.*)$/);
      var isAttr = m && line.charAt(0) !== '#' && !/^\s*#/.test(raw);
      if (isAttr) {
        var vtext = trim(m[3]);
        /* `key = {` / `key = [` 后面还有内容（多行对象/列表）时单独成组，
           单行写法的 {} / [] 仍然参与本组对齐（与 hclwrite 一致） */
        if ((vtext.charAt(0) === '{' || vtext.charAt(0) === '[') && !isBalanced(vtext)) {
          flush();
          out.push(m[1] + m[2] + ' = ' + vtext);
          continue;
        }
        bucket.push({ indent: m[1], key: m[2], val: vtext });
        width = Math.max(width, m[2].length);
        continue;
      }
      flush();
      out.push(raw);
    }
    flush();
    while (out.length && trim(out[out.length - 1]) === '') out.pop();
    return out.join('\n') + '\n';
  }

  function simpleDiff(before, after) {
    var a = String(before).split('\n'), b = String(after).split('\n');
    var lines = [], i;
    var max = Math.max(a.length, b.length);
    lines.push('@@ -1,' + a.length + ' +1,' + b.length + ' @@');
    for (i = 0; i < max; i++) {
      if (a[i] === b[i]) { if (a[i] !== undefined) lines.push(' ' + a[i]); continue; }
      if (a[i] !== undefined) lines.push('-' + a[i]);
      if (b[i] !== undefined) lines.push('+' + b[i]);
    }
    return lines;
  }

  function tfOutput(argv, ctx) {
    var o = parseOpts(argv, {
      '-json': 'bool', '-raw': 'optbool', '-state': 'value', '-no-color': 'bool', '-help': 'bool'
    });
    if (o.unknown.length) return flagError('output', o.unknown);
    var name = o.pos.length ? o.pos[0] : null;
    if (o.pos.length > 1) return U.fail(['Error: Too many command line arguments', '', 'Usage: terraform output [options] [NAME]']);
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    var outputs = (st.state && st.state.outputs) || {};
    var rawName = null;
    if (o.given['-raw']) rawName = o.values['-raw'] || (o.pos.length ? o.pos[0] : null);
    var name = rawName ? null : (o.pos.length ? o.pos[0] : null);
    if (o.given['-raw'] && !rawName) {
      return U.fail([
        'Error: Output name is required',
        '',
        'The -raw option requires the name of a single output to print.',
        NOTE + '用法：terraform output -raw ecs_public_ip'
      ]);
    }

    if (o.flags['-json']) {
      var obj = {};
      var ks = keysOf(outputs);
      for (var i = 0; i < ks.length; i++) {
        if (name && ks[i] !== name) continue;
        obj[ks[i]] = { sensitive: !!outputs[ks[i]].sensitive, type: outputs[ks[i]].type, value: outputs[ks[i]].value };
      }
      if (name && !has(outputs, name)) return notFoundOutput(name);
      return U.ok([JSON.stringify(obj, null, 2)]);
    }
    if (rawName) {
      if (!has(outputs, rawName)) return notFoundOutput(rawName);
      var t = outputs[rawName].type;
      var tp = Object.prototype.toString.call(t) === '[object Array]' ? t[0] : t;
      if (tp !== 'string' && tp !== 'number' && tp !== 'bool') {
        return U.fail([
          'Error: Invalid output format',
          '',
          'The -raw option is only supported for outputs of primitive types. The value for',
          'output "' + rawName + '" is a ' + (tp === 'list' ? 'list' : 'map') + ', which is not a primitive type.',
          '',
          NOTE + '取列表用：terraform output -json ' + rawName + ' | jq -r ".value[]"'
        ]);
      }
      var val = outputs[rawName].value;
      return U.ok([tp === 'string' ? String(val) : String(val)]);
    }
    if (name) {
      if (!has(outputs, name)) return notFoundOutput(name);
      var ov = outputs[name];
      if (ov.sensitive) return U.ok(['<sensitive>']);
      return U.ok([renderOutputValue(name, ov)]);
    }
    var names = keysOf(outputs);
    if (!names.length) {
      return warnOut([], [
        'Warning: No outputs found',
        '',
        'The state file either has no outputs defined, or all the defined outputs are',
        'empty. Please define an output in your configuration with the `output` keyword',
        'and run `terraform refresh` for it to become available.'
      ], 0);
    }
    var lines = [];
    for (i = 0; i < names.length; i++) {
      var oo = outputs[names[i]];
      lines.push(oo.sensitive ? names[i] + ' = <sensitive>' : renderOutputValue(names[i], oo));
    }
    return U.ok(lines);
  }

  function renderOutputValue(name, oo) {
    var t = oo.type;
    var tp = Object.prototype.toString.call(t) === '[object Array]' ? t[0] : t;
    var v = oo.value;
    if (tp === 'list' || tp === 'set') {
      if (!v || !v.length) return name + ' = tolist([])';
      var s = name + ' = tolist([';
      for (var i = 0; i < v.length; i++) s += '\n  ' + ctyRender(v[i], '  ') + ',';
      return s + '\n])';
    }
    if (tp === 'map' || tp === 'object') {
      var ks = keysOf(v);
      if (!ks.length) return name + ' = {}';
      var w = 0, j;
      for (j = 0; j < ks.length; j++) w = Math.max(w, hclQuote(ks[j]).length);
      var out = name + ' = {';
      for (j = 0; j < ks.length; j++) out += '\n  ' + padEnd(hclQuote(ks[j]), w) + ' = ' + ctyRender(v[ks[j]], '  ');
      return out + '\n}';
    }
    return name + ' = ' + ctyRender(v);
  }

  function notFoundOutput(name) {
    return U.fail([
      'Error: Output "' + name + '" not found',
      '',
      'The output variable requested could not be found in the state file. If you recently',
      'added this, you may need to run `terraform refresh`.',
      NOTE + '不带名字执行 terraform output 可以看当前 state 里全部输出值。'
    ]);
  }

  function tfRefresh(argv, ctx) {
    var o = parseOpts(argv, {
      '-target': 'list', '-var': 'list', '-var-file': 'list', '-state': 'value', '-lock': 'value',
      '-lock-timeout': 'value', '-parallelism': 'value', '-input': 'value', '-no-color': 'bool', '-help': 'bool'
    });
    if (o.unknown.length) return flagError('refresh', o.unknown);
    var prep = requireConfigAndInit(ctx, {
      varFiles: o.values['-var-file'], vars: parseVarPairs(o.values['-var'])
    }, 'Refresh', true);
    if (prep.error) return prep.error;
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    var insts = stateInstances(st.state);
    var out = [], i;
    for (i = 0; i < insts.length; i++) {
      if (o.values['-target'] && o.values['-target'].length && o.values['-target'].indexOf(insts[i].address) === -1) continue;
      out.push(insts[i].address + ': Refreshing state... [id=' + (insts[i].attributes.id || '') + ']');
    }
    out.push('');
    out.push(NOTE + '教学环境没有华为云 API：上面的刷新是按本地 terraform.tfstate 仿真的，state 未改写。');
    out.push('真实环境会逐个资源调 Read 接口，把云上真实属性写回 state —— 别人在控制台手工改过的');
    out.push('东西一旦被刷进来，就等于承认了那个改动，之后 plan 不再提示差异。');
    out.push('Terraform 0.15.4 起官方推荐用 terraform apply -refresh-only（会先让你确认刷新计划）。');
    return U.ok(out);
  }

  /* ---------- terraform state ---------- */
  function tfState(argv, ctx) {
    var sub = argv[0] || '';
    var rest = argv.slice(1);
    if (sub === 'list') return stateList(ctx, rest);
    if (sub === 'show') return stateShow(ctx, rest);
    if (sub === 'mv') return stateMv(ctx, rest);
    if (sub === 'rm') return stateRm(ctx, rest);
    if (sub === 'pull') return statePull(ctx, rest);
    if (sub === 'push') return statePush(ctx, rest);
    if (sub === 'replace-provider') return U.ok([NOTE + '教学环境不模拟 replace-provider：它只在换 provider 源地址（如 fork）时用。']);
    if (!sub) {
      return U.fail([
        'Usage: terraform state <subcommand> [options] [args]',
        '',
        'Subcommands:',
        '    list              List resources in the state',
        '    mv                Move an item in the state',
        '    pull              Pull current state and output to stdout',
        '    push              Update remote state from a local state file',
        '    replace-provider  Replace provider in the state',
        '    rm                Remove instances from the state',
        '    show              Show a resource in the state'
      ]);
    }
    return U.fail(['Error: This command has no subcommand "' + sub + '".', '', 'Run "terraform state" for usage.']);
  }

  function stateArgs(rest, extraSpec) {
    var spec = {
      '-state': 'value', '-id': 'value', '-backup': 'value', '-lock': 'value', '-lock-timeout': 'value',
      '-ignore-remote-version': 'bool', '-no-color': 'bool', '-help': 'bool'
    };
    for (var k in (extraSpec || {})) if (has(extraSpec, k)) spec[k] = extraSpec[k];
    return parseOpts(rest, spec);
  }

  function stateList(ctx, rest) {
    var o = stateArgs(rest);
    if (o.unknown.length) return flagError('state list', o.unknown);
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    var insts = stateInstances(st.state);
    var lines = [], i;
    if (o.values['-id']) {
      var want = o.values['-id'], found = [];
      for (i = 0; i < insts.length; i++) if (String(insts[i].attributes.id || '') === want) found.push(insts[i].address);
      if (!found.length) {
        return U.fail([
          'Error: No instance found with the given id',
          '',
          'No resource instance in the state has id "' + want + '".',
          NOTE + '用 terraform state list 看全部地址；-id 是拿云上资源 ID 反查地址，ID 抄错就查不到。'
        ]);
      }
      return U.ok(found);
    }
    var addrs = [];
    var prefix = o.pos.length ? o.pos[0] : null;
    for (i = 0; i < insts.length; i++) {
      if (insts[i].mode !== 'managed') continue;
      if (prefix && insts[i].address.indexOf(prefix) !== 0) continue;
      addrs.push(insts[i].address);
    }
    addrs = sortAddrs(addrs);
    if (!addrs.length && prefix) {
      return U.fail([
        'Error: No matching resources found',
        '',
        'No resources in the state match the address prefix "' + prefix + '".',
        NOTE + '地址前缀要写成 module.vpc 或 huaweicloud_compute_instance 这种形式。'
      ]);
    }
    return U.ok(addrs);
  }

  function stateShow(ctx, rest) {
    var o = stateArgs(rest);
    if (o.unknown.length) return flagError('state show', o.unknown);
    if (!o.pos.length) return U.fail(['Error: You must specify a resource address to show.', '', 'Usage: terraform state show [options] ADDRESS']);
    var addr = o.pos[0];
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    if (!st.state) {
      return U.fail([
        'Error: No state file exists at "' + st.path + '"',
        '',
        'This command requires an existing state file. Run "terraform apply" to create one.',
        NOTE + '当前目录还没有 state：先 terraform init && terraform apply。'
      ]);
    }
    var insts = stateInstances(st.state), found = null, i;
    for (i = 0; i < insts.length; i++) if (insts[i].address === addr) found = insts[i];
    if (!found) {
      return U.fail(resNotFound(addr, st.state));
    }
    var lines = ['# ' + found.address + ':'];
    lines = lines.concat(renderStateResource(found.type, found.name, found.attributes, 0));
    return U.ok(lines);
  }

  function resNotFound(addr, st) {
    var lines = [
      'Error: Resource instance address not found in state',
      '',
      'No resource instance in the state matches the address "' + addr + '".',
      ''
    ];
    var all = stateInstances(st);
    var like = [];
    for (var i = 0; i < all.length && like.length < 6; i++) {
      if (all[i].address.indexOf(addr.split('[')[0]) !== -1) like.push(all[i].address);
    }
    if (like.length) {
      lines.push('Did you mean one of these?');
      for (i = 0; i < like.length; i++) lines.push('  ' + like[i]);
      lines.push('');
    }
    lines.push(NOTE + '先 terraform state list 看有哪些地址，再复制准确的地址（带 count/for_each 的');
    lines.push('资源必须写上 [0] 或 ["键"] 这样的实例下标）。');
    return U.fail(lines);
  }

  function renderStateResource(type, name, attrs, indent) {
    var pad = spaces(indent);
    var lines = [pad + 'resource "' + type + '" "' + name + '" {'];
    var ks = keysOf(attrs), i, j;
    var scalars = [], blocks = [];
    for (i = 0; i < ks.length; i++) {
      var v = attrs[ks[i]];
      if (v === null || v === undefined || typeof v !== 'object') { scalars.push(ks[i]); continue; }
      if (Object.prototype.toString.call(v) === '[object Array]') {
        var allScalar = true;
        for (j = 0; j < v.length; j++) if (v[j] !== null && typeof v[j] === 'object') allScalar = false;
        if (allScalar) { scalars.push(ks[i]); continue; }
        blocks.push(ks[i]);
        continue;
      }
      scalars.push(ks[i]);   /* map / object 字面量按属性渲染 */
    }
    var w = 0;
    for (i = 0; i < scalars.length; i++) w = Math.max(w, scalars[i].length);
    for (i = 0; i < scalars.length; i++) {
      var val = attrs[scalars[i]];
      if (val === undefined) continue;
      lines.push(pad + '    ' + padEnd(scalars[i], w) + ' = ' + ctyRender(val, pad + '    '));
    }
    for (i = 0; i < blocks.length; i++) {
      var bv = attrs[blocks[i]];
      if (Object.prototype.toString.call(bv) === '[object Array]') {
        for (j = 0; j < bv.length; j++) {
          if (bv[j] && typeof bv[j] === 'object') {
            lines.push(pad + '    ' + blocks[i] + ' {');
            lines = lines.concat(renderBlockBody(bv[j], indent + 8));
            lines.push(pad + '    }');
          } else {
            lines.push(pad + '    ' + blocks[i] + ' = ' + ctyRender(bv[j]));
          }
        }
      } else if (bv && typeof bv === 'object') {
        var bk = keysOf(bv);
        if (!bk.length) { lines.push(pad + '    ' + padEnd(blocks[i], w) + ' = {}'); continue; }
        lines.push(pad + '    ' + padEnd(blocks[i], w) + ' = {');
        var bw = 0;
        for (j = 0; j < bk.length; j++) bw = Math.max(bw, hclQuote(bk[j]).length);
        for (j = 0; j < bk.length; j++) lines.push(pad + '      ' + padEnd(hclQuote(bk[j]), bw) + ' = ' + ctyRender(bv[bk[j]], pad + '      '));
        lines.push(pad + '    }');
      }
    }
    lines.push(pad + '}');
    return lines;
  }
  function renderBlockBody(obj, indent) {
    var pad = spaces(indent), ks = keysOf(obj), lines = [], i, w = 0;
    for (i = 0; i < ks.length; i++) w = Math.max(w, ks[i].length);
    for (i = 0; i < ks.length; i++) {
      var v = obj[ks[i]];
      if (v !== null && typeof v === 'object') {
        if (Object.prototype.toString.call(v) === '[object Array]') {
          lines.push(pad + padEnd(ks[i], w) + ' = ' + ctyRender(v, pad));
        } else {
          lines.push(pad + padEnd(ks[i], w) + ' = ' + ctyRender(v, pad));
        }
        continue;
      }
      lines.push(pad + padEnd(ks[i], w) + ' = ' + ctyRender(v, pad));
    }
    return lines;
  }

  function stateMv(ctx, rest) {
    var o = stateArgs(rest, { '-state-out': 'value', '-ignore-remote-version': 'bool' });
    if (o.unknown.length) return flagError('state mv', o.unknown);
    if (o.pos.length < 2) {
      return U.fail([
        'Error: You must specify both a source and destination address.',
        '',
        'Usage: terraform state mv [options] SOURCE DESTINATION'
      ]);
    }
    var src = o.pos[0], dst = o.pos[1];
    var srcPath = o.values['-state'];
    var srcState = loadState(ctx, srcPath);
    if (!srcState.ok) return U.fail([srcState.err]);
    if (!srcState.state) {
      return U.fail(['Error: No state file exists at "' + srcState.path + '"', '', NOTE + '先用 terraform apply（或 -state 指定一份 state）再做搬迁。']);
    }
    var dstPath = o.values['-state-out'];
    var dstState = dstPath ? loadState(ctx, dstPath) : { ok: true, state: srcState.state, path: srcState.path, missing: true };
    if (dstPath && !dstState.ok) return U.fail([dstState.err]);
    if (dstPath && dstState.missing) {
      dstState.state = { version: 4, terraform_version: TF_VERSION, serial: 1, lineage: 'new-' + Date.now(), outputs: {}, resources: [] };
    }
    var srcInsts = stateInstances(srcState.state), found = null, i, j;
    for (i = 0; i < srcInsts.length; i++) if (srcInsts[i].address === src) found = srcInsts[i];
    if (!found) return U.fail(resNotFound(src, srcState.state));
    /* 目标地址已存在 → 报错（真机行为） */
    var dstInsts = stateInstances(dstState.state);
    for (i = 0; i < dstInsts.length; i++) {
      if (dstInsts[i].address === dst && dstState.state !== srcState.state) {
        return U.fail(['Error: Destination address already exists in the state', '', 'The address "' + dst + '" is already in use.']);
      }
    }
    /* 真搬：改 state 里的 module/type/name/index */
    var parts = parseAddress(dst);
    if (!parts) {
      return U.fail([
        'Error: Invalid resource address',
        '',
        'The address "' + dst + '" is not a valid resource address.',
        NOTE + '地址形如 huaweicloud_vpc.main、module.vpc.huaweicloud_vpc.main、web[0] 或 web["web-01"]。'
      ]);
    }
    var res = found.resource, inst = found.instance;
    var moved = { resource: res, instance: inst };
    if (dstState.state === srcState.state) {
      res.module = parts.module || undefined;
      if (!parts.module) delete res.module;
      res.type = parts.type; res.name = parts.name;
      if (parts.indexKey === undefined) { delete inst.index_key; }
      else inst.index_key = parts.indexKey;
    } else {
      /* 跨 state：从源里删掉，加到目标里 */
      var idx = res.instances.indexOf(inst);
      if (idx >= 0) res.instances.splice(idx, 1);
      if (!res.instances.length) {
        var ri = srcState.state.resources.indexOf(res);
        if (ri >= 0) srcState.state.resources.splice(ri, 1);
      }
      var target = null;
      for (i = 0; i < dstState.state.resources.length; i++) {
        var rr = dstState.state.resources[i];
        if ((rr.module || '') === (parts.module || '') && rr.type === parts.type && rr.name === parts.name) target = rr;
      }
      if (!target) {
        target = { mode: 'managed', type: parts.type, name: parts.name, provider: res.provider, instances: [] };
        if (parts.module) target.module = parts.module;
        dstState.state.resources.push(target);
      }
      if (parts.indexKey !== undefined) inst.index_key = parts.indexKey; else delete inst.index_key;
      target.instances.push(inst);
    }
    bumpSerial(srcState.state);
    if (dstState.state !== srcState.state) bumpSerial(dstState.state);
    writeText(ctx, srcState.path, JSON.stringify(srcState.state, null, 2) + '\n');
    if (dstState.state !== srcState.state) writeText(ctx, dstState.path, JSON.stringify(dstState.state, null, 2) + '\n');
    var out = ['Successfully moved 1 object(s).', ''];
    out.push(NOTE + '搬迁只改 state 里的地址记录，云上资源纹丝不动 —— 这就是「重构配置不重建资源」。');
    out.push('搬完立刻 terraform plan：应该是 No changes；出现「销毁 + 新建」说明地址或配置块对不上。');
    if (src.indexOf('[') !== -1 || dst.indexOf('[') !== -1) {
      out.push(NOTE + 'count 与 for_each 之间的地址迁移必须逐个资源执行，漏一个就是一次「删 N 台建 N 台」的事故。');
    }
    return U.ok(out);
  }

  function bumpSerial(st) { if (st && typeof st.serial === 'number') st.serial = st.serial + 1; }

  function parseAddress(addr) {
    var s = String(addr), module = '', indexKey;
    var idx = s.indexOf('[');
    if (idx !== -1) {
      var close = s.lastIndexOf(']');
      if (close < idx) return null;
      var inside = s.slice(idx + 1, close);
      indexKey = /^\d+$/.test(inside) ? Number(inside) : inside.replace(/^"|"$/g, '');
      s = s.slice(0, idx);
    }
    var parts = s.split('.');
    var i = 0;
    while (parts[i] === 'module') { module = (module ? module + '.' : '') + 'module.' + parts[i + 1]; i += 2; }
    if (parts.length - i < 2) return null;
    return { module: module, type: parts[i], name: parts[i + 1], indexKey: indexKey };
  }

  function stateRm(ctx, rest) {
    var o = stateArgs(rest);
    if (o.unknown.length) return flagError('state rm', o.unknown);
    if (!o.pos.length) return U.fail(['Error: You must specify at least one resource address to remove.', '', 'Usage: terraform state rm [options] ADDRESS...']);
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    if (!st.state) return U.fail(['Error: No state file exists at "' + st.path + '"', '', NOTE + '当前目录没有 state 可摘：先 apply 出资源。']);
    var removed = [], missing = [];
    for (var a = 0; a < o.pos.length; a++) {
      var addr = o.pos[a];
      var insts = stateInstances(st.state), hit = [];
      for (var i = 0; i < insts.length; i++) {
        if (insts[i].address === addr || insts[i].address.indexOf(addr + '.') === 0) hit.push(insts[i]);
        else if (insts[i].address.indexOf(addr) === 0) hit.push(insts[i]);
      }
      if (!hit.length) { missing.push(addr); continue; }
      for (i = 0; i < hit.length; i++) {
        var res = hit[i].resource, inst = hit[i].instance;
        var at = res.instances.indexOf(inst);
        if (at >= 0) res.instances.splice(at, 1);
        if (!res.instances.length) {
          var ri = st.state.resources.indexOf(res);
          if (ri >= 0) st.state.resources.splice(ri, 1);
        }
        removed.push(hit[i].address);
      }
    }
    var out = [], err = [];
    if (removed.length) {
      bumpSerial(st.state);
      writeText(ctx, st.path, JSON.stringify(st.state, null, 2) + '\n');
      for (i = 0; i < removed.length; i++) out.push('Removed ' + removed[i]);
      out.push('Successfully removed ' + removed.length + ' resource instance(s).');
      out.push('');
      out.push(NOTE + 'state rm 只把资源从 state 里摘出去，**云上机器不会被删**：它从此不受 Terraform 管理，');
      out.push('destroy 也不会再碰它。想删资源用 terraform destroy -target=<地址>。');
    }
    if (missing.length) {
      err = err.concat([
        'Error: Resource instance address not found in state',
        '',
        'No resource instance in the state matches the address "' + missing[0] + '".',
        '',
        NOTE + '先 terraform state list 确认地址（带 count/for_each 的要写 [0] / ["键"]）；',
        '如果它本来就不在 state 里，说明没纳管过，用 terraform import 接管。'
      ]);
    }
    if (err.length) return { out: out, err: err, code: 1 };
    return U.ok(out);
  }

  function statePull(ctx, rest) {
    var o = stateArgs(rest);
    if (o.unknown.length) return flagError('state pull', o.unknown);
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    if (!st.state) {
      return U.fail([
        'Error: No state file exists at "' + st.path + '"',
        '',
        'Nothing to pull: the current backend has no state yet.',
        NOTE + '先 terraform apply 生成 state；这一步常用于动手前备份 state。'
      ]);
    }
    try { return U.ok([JSON.stringify(JSON.parse(st.text), null, 2)]); }
    catch (e) { return U.fail(['Error: Failed to read the state file: ' + e.message]); }
  }

  function statePush(ctx, rest) {
    var o = stateArgs(rest);
    if (o.unknown.length) return flagError('state push', o.unknown);
    if (!o.pos.length) return U.fail(['Error: You must specify a state file to push.', '', 'Usage: terraform state push [options] PATH']);
    var srcAbs = U.resolvePath(ctx.cwd, o.pos[0]);
    var txt = readText(ctx, srcAbs);
    if (txt === null) return U.fail(['Error: Failed to read the state file "' + o.pos[0] + '": no such file.']);
    try { JSON.parse(txt); }
    catch (e) { return U.fail(['Error: The state file "' + o.pos[0] + '" is not valid JSON (' + e.message + ').']); }
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    writeText(ctx, st.path, txt);
    return U.ok([
      'Pushed state to ' + relPath(ctx, st.path) + '.',
      '',
      NOTE + 'state push 会用本地文件**整体覆盖**远端 state，是核弹级操作：只在远端 state 已损坏、',
      '本地有可信备份、且确认没有任何人在跑 apply 时才用。'
    ]);
  }

  /* ---------- terraform show ---------- */
  function tfShow(argv, ctx) {
    var o = parseOpts(argv, { '-json': 'bool', '-no-color': 'bool', '-state': 'value', '-help': 'bool' });
    if (o.unknown.length) return flagError('show', o.unknown);
    var target = o.pos.length ? o.pos[0] : null;
    if (target) {
      var loaded = loadPlanFile(ctx, target);
      if (loaded.err) {
        /* 不是计划文件：按 state 文件试一次 */
        var stTry = loadState(ctx, target);
        if (stTry.ok && stTry.state) return showStateJson(ctx, stTry.state, o);
        return loaded.err;
      }
      var p = loaded.plan;
      var lines = ['Terraform will perform the following actions:', ''];
      for (var i = 0; i < p.actions.length; i++) {
        var verb = p.actions[i].kind === 'create' ? 'will be created' : (p.actions[i].kind === 'destroy' ? 'will be destroyed' : 'will be updated in-place');
        lines.push('  # ' + p.actions[i].address + ' ' + verb);
      }
      lines.push('');
      lines.push('Plan: ' + p.summary.add + ' to add, ' + p.summary.change + ' to change, ' + p.summary.destroy + ' to destroy.');
      return U.ok(lines);
    }
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    if (!st.state) {
      return U.ok(['No state.', '', NOTE + '当前目录还没有 state：先 terraform init && terraform apply。']);
    }
    if (o.flags['-json']) return showStateJson(ctx, st.state, o);
    var out = [], insts = stateInstances(st.state);
    var addrs = sortAddrs(insts.map(function (x) { return x.address; }));
    for (var a = 0; a < addrs.length; a++) {
      for (i = 0; i < insts.length; i++) {
        if (insts[i].address === addrs[a]) {
          out.push('# ' + insts[i].address + ':');
          out = out.concat(renderStateResource(insts[i].type, insts[i].name, insts[i].attributes, 0));
        }
      }
    }
    var outs = (st.state.outputs) || {}, ks = keysOf(outs);
    if (ks.length) {
      out.push('');
      out.push('Outputs:');
      out.push('');
      for (i = 0; i < ks.length; i++) {
        out.push(outs[ks[i]].sensitive ? ks[i] + ' = <sensitive>' : renderOutputValue(ks[i], outs[ks[i]]));
      }
    }
    return U.ok(out);
  }

  function showStateJson(ctx, state, o) {
    var values = { outputs: {}, root_module: { resources: [] } };
    var outs = state.outputs || {}, ks = keysOf(outs);
    for (var i = 0; i < ks.length; i++) {
      values.outputs[ks[i]] = { sensitive: !!outs[ks[i]].sensitive, type: outs[ks[i]].type, value: outs[ks[i]].value };
    }
    var insts = stateInstances(state);
    for (i = 0; i < insts.length; i++) {
      var it = insts[i];
      values.root_module.resources.push({
        address: it.address, mode: it.mode, type: it.type, name: it.name,
        provider_name: 'registry.terraform.io/huaweicloud/huaweicloud',
        schema_version: 0, values: it.attributes, sensitive_values: {}
      });
    }
    return U.ok([JSON.stringify({ format_version: '1.0', terraform_version: state.terraform_version || TF_VERSION, values: values }, null, 2)]);
  }

  /* ---------- terraform console ---------- */
  function tfConsole(argv, ctx, stdin) {
    var o = parseOpts(argv, { '-state': 'value', '-no-color': 'bool', '-help': 'bool' });
    if (o.unknown.length) return flagError('console', o.unknown);
    var cfg = loadConfig(ctx, {});
    if (!cfg.ok) return noConfigError('Console', ctx);
    var env = prepareEnv(ctx, cfg);
    var input = (stdin && stdin.length) ? trim(stdin.join('\n')) : '';
    if (!input) {
      return U.ok([
        'Terraform v' + TF_VERSION + ' (教学终端)',
        '',
        '（教学提示）console 是交互式求值器，单行终端进不去交互提示符；',
        '用管道喂一条表达式就能得到同样的结果，例如：',
        '  echo \'cidrsubnet("10.0.1.0/24", 4, 3)\' | terraform console',
        '  echo \'huaweicloud_compute_instance.web.public_ip\' | terraform console',
        '  echo \'local.common_tags\' | terraform console',
        '',
        '真实环境：输入表达式回车即求值，Ctrl+D 退出；它会读取并刷新 state，',
        '对远端 backend 来说同样涉及 state 锁，生产目录里排障优先在副本上跑。'
      ]);
    }
    var ev = evalExpr(input, env);
    if (!ev.ok) {
      return U.fail([
        'Error: ' + ev.err,
        '',
        NOTE + '教学环境的 console 只实现了一部分函数（cidrsubnet/cidrhost/format/join/length/merge/',
        'lookup/try/toset/jsonencode 等）与 var./local./资源属性 引用；真机可以求值全部 HCL 表达式。'
      ]);
    }
    if (ev.unknown) {
      return U.fail([
        'Error: The expression refers to a value that is not yet known',
        '',
        'Expression: ' + input,
        NOTE + '这个属性要等资源创建完（apply）之后才有值，state 里现在没有它。'
      ]);
    }
    return U.ok([ctyRender(ev.value, '')]);
  }

  /* ---------- terraform import ---------- */
  function tfImport(argv, ctx) {
    var o = parseOpts(argv, {
      '-var': 'list', '-var-file': 'list', '-state': 'value', '-state-out': 'value',
      '-input': 'value', '-lock': 'value', '-lock-timeout': 'value', '-ignore-remote-version': 'bool',
      '-no-color': 'bool', '-help': 'bool', '-config': 'value'
    });
    if (o.unknown.length) return flagError('import', o.unknown);
    if (o.pos.length < 2) {
      return U.fail([
        'Error: Invalid number of arguments',
        '',
        'The import command expects two arguments:',
        '  terraform import [options] ADDRESS ID',
        NOTE + '华为云不同资源的 ID 形式不同：ECS/EVS/EIP/VPC/子网/安全组都是 UUID，OBS 桶直接用桶名。'
      ]);
    }
    var addr = o.pos[0], id = o.pos[1];
    var prep = requireConfigAndInit(ctx, { varFiles: o.values['-var-file'], vars: parseVarPairs(o.values['-var']) }, 'Import', true);
    if (prep.error) return prep.error;
    var cfg = prep.cfg;
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    var insts = stateInstances(st.state);
    var i;
    /* 同一个云对象只能被一个地址管理：先按 ID 判断是否已被别的地址纳管 */
    var objFirst = null;
    for (i = 0; i < API.CLOUD_OBJECTS.length; i++) {
      if (API.CLOUD_OBJECTS[i].id === id) objFirst = API.CLOUD_OBJECTS[i];
    }
    for (i = 0; i < insts.length; i++) {
      if (insts[i].address === addr) {
        return U.fail([
          'Error: Resource already managed by Terraform',
          '',
          'Terraform is already managing a remote object for ' + addr + '. To import to this',
          'address you must first remove the existing object from the state.',
          '',
          NOTE + '这个地址已经在 state 里了（terraform state list 能看到它）：import 只用于接管',
          '**尚未纳管**的存量资源。真要重新导入，先用 terraform state rm ' + addr + ' 摘掉。'
        ]);
      }
    }
    if (objFirst && objFirst.address && objFirst.address !== addr) {
      return U.fail([
        'Error: Resource already managed by Terraform',
        '',
        'Terraform is already managing this remote object under the address "' + objFirst.address + '".',
        'Importing the same object to a second address would make Terraform manage it twice.',
        '',
        NOTE + '同一个云资源只能被一个 state 地址管理（地址含 module. 前缀时要写全）：',
        '要换地址请用 terraform state mv ' + objFirst.address + ' ' + addr + '，不要重复 import。'
      ]);
    }
    /* 配置里必须有对应的 resource 块 */
    var parts = parseAddress(addr);
    var declared = false;
    if (parts) {
      for (i = 0; i < (cfg.allResources || []).length; i++) {
        var r = cfg.allResources[i];
        var full = (r.module ? r.module + '.' : '') + r.type + '.' + r.name;
        if (full === parts.type + '.' + parts.name || full === addr) declared = true;
      }
    }
    if (!declared) {
      return U.fail([
        'Error: Resource not found in configuration',
        '',
        'The address "' + addr + '" is not declared in the root module. Terraform cannot import',
        'a resource that is not in the configuration.',
        '',
        NOTE + '先写好（哪怕是空的）resource 块，再执行 import —— import 只写 state，不生成配置。'
      ]);
    }
    /* 云上是否存在这个 ID（按模拟的云端清单判断） */
    var obj = objFirst;
    if (!obj) {
      return U.fail([
        'Error: Cannot import non-existent remote object',
        '',
        'While attempting to import an existing object to "' + addr + '", the provider detected that no',
        'object was found with the given id (' + id + '). Only pre-existing objects can be imported;',
        'check that the id is correct and that it is associated with the provider\'s configured',
        'region or endpoint, or use "terraform apply" to create a new remote object for this resource.',
        '',
        NOTE + '教学环境里的“云端”只有这些对象：ECS ' + API.ECS_WEB_ID + ' / ' + API.ECS_APP1_ID + ' / ' + API.ECS_APP2_ID,
        'VPC ' + API.VPC_ID + '，子网 ' + API.SUB_APP_ID + '，OBS 桶 logs-prod-cn-north-4 等。'
      ]);
    }
    /* 该对象已被别的地址纳管？（已在前面按 ID 拦过，这里兜底） */
    if (obj.address && obj.address !== addr) {
      return U.fail([
        'Error: Resource already managed by Terraform',
        '',
        'Terraform is already managing this remote object under the address "' + obj.address + '".',
        '',
        NOTE + '同一个云资源只能被一个 state 地址管理；要换地址请用 terraform state mv。'
      ]);
    }
    /* 真写 state：从云端清单造出属性 */
    var attrs = synthAttributes(parts, id, obj);
    var target = null;
    var moduleName = parts.module || '';
    for (i = 0; i < st.state.resources.length; i++) {
      var rr = st.state.resources[i];
      if ((rr.module || '') === moduleName && rr.type === parts.type && rr.name === parts.name) target = rr;
    }
    if (!target) {
      target = { mode: 'managed', type: parts.type, name: parts.name, provider: 'provider["registry.terraform.io/huaweicloud/huaweicloud"]', instances: [] };
      if (moduleName) target.module = moduleName;
      st.state.resources.push(target);
    }
    var inst = { schema_version: 0, attributes: attrs, sensitive_attributes: [] };
    if (parts.indexKey !== undefined) inst.index_key = parts.indexKey;
    target.instances.push(inst);
    bumpSerial(st.state);
    writeStateFile(ctx, o.values['-state'] || o.values['-state-out'], st.state, st);
    return U.ok([
      'huaweicloud import: Importing ' + addr + '...',
      'Import successful!',
      '',
      NOTE + '教学环境不会真的调用华为云 API：上面的属性是按本地“云端清单”仿真写进 state 的。',
      '真实环境 import 会用云 API 读回真实属性，但**不会生成配置** —— 导完必须手工补 resource 块，',
      '然后用 terraform state show ' + addr + ' 看真实属性、回写配置，再 terraform plan 磨到 No changes，',
      '否则下一次 apply 会把「state 里有、配置里没有」的资源判成待销毁。'
    ]);
  }

  function writeStateFile(ctx, explicitPath, state, st) {
    var p = explicitPath ? U.resolvePath(ctx.cwd, explicitPath) : st.path;
    writeText(ctx, p, JSON.stringify(state, null, 2) + '\n');
  }

  function synthAttributes(parts, id, obj) {
    if (parts.type === 'huaweicloud_compute_instance') {
      return {
        access_ip_v4: '192.168.1.20', availability_zone: 'cn-north-4a',
        flavor_id: 's6.small.1', flavor_name: 's6.small.1', hostname: obj.name, id: id,
        image_id: 'ad091b52-742f-469e-8f3c-fd81cadf0743', key_pair: 'my_key_pair_name',
        name: obj.name, network: [{ fixed_ip_v4: '192.168.1.20', uuid: API.SUB_APP_ID }],
        public_ip: '', region: 'cn-north-4', status: 'ACTIVE', system_disk_size: 40,
        system_disk_type: 'SAS', tags: {} 
      };
    }
    if (parts.type === 'huaweicloud_vpc') {
      return { cidr: '192.168.0.0/16', description: '', id: id, name: obj.name, region: 'cn-north-4', routes: [], status: 'ACTIVE', tags: {} };
    }
    if (parts.type === 'huaweicloud_obs_bucket') {
      return { acl: 'private', bucket: id, force_destroy: false, id: id, region: 'cn-north-4', storage_class: 'STANDARD', tags: {}, versioning: false };
    }
    if (parts.type === 'huaweicloud_vpc_eip') {
      return { address: '121.36.44.99', id: id, name: obj.name, region: 'cn-north-4', status: 'DOWN', tags: {} };
    }
    if (parts.type === 'huaweicloud_vpc_subnet') {
      return { cidr: '192.168.3.0/24', gateway_ip: '192.168.3.1', id: id, name: obj.name, region: 'cn-north-4', status: 'ACTIVE', tags: {}, vpc_id: API.VPC_ID };
    }
    return { id: id, name: obj.name, region: 'cn-north-4' };
  }

  /* ---------- terraform taint / untaint ---------- */
  function tfTaint(argv, ctx, untaint) {
    var o = parseOpts(argv, { '-allow-missing': 'bool', '-state': 'value', '-lock': 'value', '-lock-timeout': 'value', '-no-color': 'bool', '-help': 'bool' });
    if (o.unknown.length) return flagError(untaint ? 'untaint' : 'taint', o.unknown);
    if (!o.pos.length) return U.fail(['Error: You must specify a resource address.', '', 'Usage: terraform ' + (untaint ? 'untaint' : 'taint') + ' [options] ADDRESS']);
    var addr = o.pos[0];
    var st = loadState(ctx, o.values['-state']);
    if (!st.ok) return U.fail([st.err]);
    if (!st.state) return U.fail(['Error: No state file exists at "' + st.path + '"', '', NOTE + '先 terraform apply 生成 state。']);
    var insts = stateInstances(st.state), found = null, i;
    for (i = 0; i < insts.length; i++) if (insts[i].address === addr) found = insts[i];
    if (!found) {
      if (o.flags['-allow-missing']) return U.ok(['Resource ' + addr + ' not found in state, but -allow-missing was given; nothing to do.']);
      return U.fail(resNotFound(addr, st.state));
    }
    found.instance.status = untaint ? '' : 'tainted';
    bumpSerial(st.state);
    writeText(ctx, st.path, JSON.stringify(st.state, null, 2) + '\n');
    /* taint 会真的改 state（纯本地标记），这里要如实说明；real terraform 还会打印弃用警告 */
    var out = [];
    out.push('Resource ' + addr + ' has been ' + (untaint ? 'untainted' : 'marked as tainted') + ' in the state.');
    out.push('');
    if (!untaint) {
      out.push(NOTE + 'taint 只改 state 里的标记、不动资源：下一次 terraform apply 才会先删后建这台机器。');
      out.push('官方推荐的新写法是 terraform apply -replace=' + addr + '（一步完成，不用分两次）。');
      out.push('重建意味着服务中断：先把流量摘走（负载均衡下线 / Keepalived 降优先级）再执行。');
    } else {
      out.push(NOTE + '标记已取消，现有机器会被保留。');
    }
    return U.ok(out);
  }

  /* ---------- terraform providers ---------- */
  function tfProviders(argv, ctx) {
    var sub = argv[0] || '';
    if (sub === 'lock') return providersLock(argv.slice(1), ctx);
    if (sub === 'mirror') return U.ok([NOTE + 'terraform providers mirror 需要联网下载 provider 包，教学环境不模拟。可看 iac-tf-providers-lock。']);
    if (sub === 'schema') return U.ok([NOTE + 'terraform providers schema -json 会打印 provider 的完整 schema（几千行），教学环境不展开。']);
    var o = parseOpts(argv, { '-no-color': 'bool', '-help': 'bool' });
    if (o.unknown.length) return flagError('providers', o.unknown);
    var cfg = loadConfig(ctx, {});
    if (!cfg.ok) return noConfigError('Providers', ctx);
    var out = ['Providers required by configuration:', '.'];
    var names = keysOf(cfg.requiredProviders);
    for (var i = 0; i < names.length; i++) {
      out.push('├── provider[registry.terraform.io/' + (names[i] === 'huaweicloud' ? 'huaweicloud/huaweicloud' : names[i]) + '] ' + versionConstraint(cfg, names[i]));
    }
    if (!names.length) out.push('└── (无 required_providers 声明)');
    out.push('');
    out.push(NOTE + '看已安装的 provider 与锁定版本：cat .terraform.lock.hcl；跨平台补哈希：terraform providers lock。');
    return U.ok(out);
  }
  function versionConstraint(cfg, name) {
    var rp = cfg.requiredProviders[name];
    if (!rp) return '';
    if (rp.attrs && rp.attrs['version']) return rp.attrs['version'].text.replace(/"/g, '');
    if (rp.blocks) {
      for (var i = 0; i < rp.blocks.length; i++) if (rp.blocks[i].kind === 'version') return '';
    }
    var vs = rp.attrs ? rp.attrs['version'] : null;
    return vs ? vs.text : '';
  }

  function providersLock(argv, ctx) {
    var o = parseOpts(argv, {
      '-platform': 'list', '-fs-mirror': 'value', '-net-mirror': 'value', '-no-color': 'bool', '-help': 'bool'
    });
    if (o.unknown.length) return flagError('providers lock', o.unknown);
    var cfg = loadConfig(ctx, {});
    if (!cfg.ok) return noConfigError('Providers', ctx);
    var providers = o.pos.slice();
    if (!providers.length) providers = keysOf(cfg.requiredProviders).map(function (n) { return n === 'huaweicloud' ? 'huaweicloud/huaweicloud' : n; });
    for (var p = 0; p < providers.length; p++) {
      if (providers[p].indexOf('/') === -1) {
        return U.fail(['Error: Invalid provider address', '', 'Provider addresses must be of the form hostname/namespace/type, e.g. huaweicloud/huaweicloud.', NOTE + '位置参数是 provider 地址，不是资源地址。']);
      }
    }
    var platforms = o.values['-platform'] || [];
    for (var i = 0; i < platforms.length; i++) {
      if (!/^[a-z0-9]+_[a-z0-9]+$/.test(platforms[i])) {
        return U.fail(['Error: Invalid platform', '', 'The platform "' + platforms[i] + '" is not in the form os_arch (例如 linux_amd64、linux_arm64、darwin_arm64)。']);
      }
    }
    var out = [];
    if (o.values['-fs-mirror']) {
      var mirror = U.resolvePath(ctx.cwd, o.values['-fs-mirror']);
      if (!dirExists(ctx, mirror)) {
        return U.fail(['Error: Failed to read filesystem mirror directory', '', 'The directory "' + o.values['-fs-mirror'] + '" does not exist.', NOTE + '本实验的离线镜像目录是 /data/terraform-mirror。']);
      }
      out.push('Fetching huaweicloud/huaweicloud v' + HWC_VERSION + ' from filesystem mirror at ' + o.values['-fs-mirror'] + '...');
    } else if (o.values['-net-mirror']) {
      out.push('Fetching huaweicloud/huaweicloud v' + HWC_VERSION + ' from network mirror ' + o.values['-net-mirror'] + '...');
    }
    for (i = 0; i < providers.length; i++) {
      var plats = platforms.length ? platforms : ['linux_amd64'];
      for (var j = 0; j < plats.length; j++) {
        out.push('- Fetching ' + providers[i] + ' ' + HWC_VERSION + ' for ' + plats[j] + '...');
        out.push('- Retrieved ' + providers[i] + ' ' + HWC_VERSION + ' for ' + plats[j] + ' (self-signed, key ID 3B1B1B1B1B1B1B1B)');
      }
    }
    writeText(ctx, ctx.cwd + '/.terraform.lock.hcl', lockFileText(HWC_VERSION, '~> 1.60', platforms));
    out.push('');
    out.push('Success! Terraform has written lock information to .terraform.lock.hcl. You should');
    out.push('now commit this file to version control.');
    out.push('');
    out.push(NOTE + '教学环境不联网下载 provider 包：上面的抓取过程是按平台列表仿真的，lock 文件已经真的写好。');
    out.push('真实执行会为每个平台取包并写入哈希，团队里 Windows/macOS/Linux 混用时一次加全，别人 init 才不会');
    out.push('报「没有可用包」或校验和不匹配。');
    return U.ok(out);
  }

  /* ---------- terraform workspace ---------- */
  function tfWorkspace(argv, ctx) {
    var sub = argv[0] || 'show';
    var o = parseOpts(argv.slice(1), { '-no-color': 'bool', '-help': 'bool', '-force': 'bool', '-lock': 'value', '-lock-timeout': 'value' });
    if (o.unknown.length) return flagError('workspace', o.unknown);
    var wsDir = ctx.cwd + '/terraform.tfstate.d';
    var cur = currentWorkspace(ctx);
    var names = ['default'];
    var dirNames = listNames(ctx, wsDir);
    for (var i = 0; i < dirNames.length; i++) {
      if (dirExists(ctx, wsDir + '/' + dirNames[i])) names.push(dirNames[i]);
    }
    names.sort(function (a, b) { return a < b ? -1 : 1; });

    if (sub === 'list') {
      var out = [];
      for (i = 0; i < names.length; i++) out.push((names[i] === cur ? '*' : ' ') + ' ' + names[i]);
      return U.ok(out);
    }
    if (sub === 'show') return U.ok([cur]);
    if (sub === 'new') {
      var nm = o.pos[0];
      if (!nm) return U.fail(['Error: You must specify a workspace name.', '', 'Usage: terraform workspace new NAME']);
      if (names.indexOf(nm) !== -1) {
        return U.fail(['Error: Workspace "' + nm + '" already exists', '', NOTE + 'terraform workspace list 可以看现有工作区；切换用 terraform workspace select ' + nm + '。']);
      }
      if (!dirExists(ctx, ctx.cwd + '/.terraform')) return initRequiredError(ctx.cwd);
      mkdirp(ctx, wsDir + '/' + nm);
      writeText(ctx, wsDir + '/' + nm + '/terraform.tfstate', JSON.stringify({
        version: 4, terraform_version: TF_VERSION, serial: 0, lineage: 'ws-' + nm + '-' + Date.now(), outputs: {}, resources: []
      }, null, 2) + '\n');
      writeText(ctx, ctx.cwd + '/.terraform/environment', nm + '\n');
      return U.ok([
        'Created and switched to workspace "' + nm + '"!',
        '',
        'You\'re now on a new, empty workspace. Workspaces isolate their state,',
        'so if you run "terraform plan" Terraform will not see any existing state',
        'for this configuration.',
        '',
        NOTE + '新工作区的 state 是空的：里面的资源要重新 apply（同名资源可能撞名，先想清楚）。'
      ]);
    }
    if (sub === 'select') {
      var nm2 = o.pos[0];
      if (!nm2) return U.fail(['Error: You must specify a workspace name.', '', 'Usage: terraform workspace select NAME']);
      if (names.indexOf(nm2) === -1) {
        return U.fail(['Error: Workspace "' + nm2 + '" doesn\'t exist.', '', 'You can create this workspace with the "new" command.', NOTE + 'terraform workspace new ' + nm2 + ' 会新建并切过去。']);
      }
      if (!dirExists(ctx, ctx.cwd + '/.terraform')) return initRequiredError(ctx.cwd);
      writeText(ctx, ctx.cwd + '/.terraform/environment', nm2 + '\n');
      return U.ok([
        'Switched to workspace "' + nm2 + '".',
        '',
        NOTE + '切换只是换 state：' + (nm2 === 'prod' ? '现在 apply 打到的就是生产环境，命令之前先看清楚环境名！' : '当前工作区 ' + nm2 + '。')
      ]);
    }
    if (sub === 'delete') {
      var nm3 = o.pos[0];
      if (!nm3) return U.fail(['Error: You must specify a workspace name.', '', 'Usage: terraform workspace delete NAME']);
      if (nm3 === cur) {
        return U.fail(['Error: cannot delete the active workspace', '', 'The workspace "' + nm3 + '" is currently active. Switch to another workspace first.', NOTE + '先 terraform workspace select default，再删。']);
      }
      if (names.indexOf(nm3) === -1) return U.fail(['Error: Workspace "' + nm3 + '" doesn\'t exist.']);
      var p = wsDir + '/' + nm3;
      var rn = realNode(ctx, p);
      if (rn.node && rn.node.type === 'dir') {
        var parent = nodeAt(ctx, U.parentOf(rn.abs));
        if (parent) delete parent.children[U.baseName(rn.abs)];
      }
      return U.ok([
        'Deleted workspace "' + nm3 + '"!',
        '',
        NOTE + '删的是 state 记录，**云上资源不会消失**，会直接变成没人管的孤儿资源：删工作区前',
        '先确认里面的资源是不是真的不要了。'
      ]);
    }
    return U.fail(['Error: This command has no subcommand "' + sub + '".', '', 'Usage: terraform workspace <list|new|select|show|delete> [NAME]']);
  }

  /* ---------- terraform graph ---------- */
  function tfGraph(argv, ctx) {
    var o = parseOpts(argv, { '-type': 'value', '-draw-cycles': 'bool', '-plan': 'value', '-no-color': 'bool', '-help': 'bool' });
    if (o.unknown.length) return flagError('graph', o.unknown);
    var type = o.values['-type'] || 'plan';
    var allowed = ['plan', 'plan-refresh-only', 'plan-destroy', 'apply'];
    if (allowed.indexOf(type) === -1) {
      return U.fail(['Error: Invalid graph type', '', 'The graph type "' + type + '" is not supported. Valid types are: ' + allowed.join(', ') + '.']);
    }
    var prep = requireConfigAndInit(ctx, {}, 'Graph', true);
    if (prep.error) return prep.error;
    var cfg = prep.cfg;
    prepareEnv(ctx, cfg);
    var st = loadState(ctx, {});
    var insts = stateInstances(st.state);
    var nodes = [], edges = [], i, j;
    for (i = 0; i < (cfg.allResources || []).length; i++) {
      var r = cfg.allResources[i];
      for (j = 0; j < r.instances.length; j++) nodes.push({ id: r.instances[j].address, label: r.instances[j].address });
      /* 依赖：从属性的表达式里抓资源引用 */
      var refs = resourceRefs(r);
      for (var k = 0; k < refs.length; k++) {
        for (j = 0; j < r.instances.length; j++) edges.push({ from: r.instances[j].address, to: refs[k] });
      }
    }
    if (type === 'plan-destroy') {
      nodes = [];
      for (i = 0; i < insts.length; i++) nodes.push({ id: insts[i].address, label: insts[i].address });
    }
    if (!nodes.length) {
      return U.ok(['digraph {', '\tcompound = "true"', '\tnewrank = "true"', '\tsubgraph "root" {', '\t}', '}']);
    }
    var lines = ['digraph {', '\tcompound = "true"', '\tnewrank = "true"', '\tsubgraph "root" {'];
    for (i = 0; i < nodes.length; i++) {
      var shape = nodes[i].id.indexOf('module.') === 0 ? 'box' : 'box';
      lines.push('\t\t"[root] ' + nodes[i].id + '" [label = "' + nodes[i].label + '", shape = "' + shape + '"]');
    }
    for (i = 0; i < edges.length; i++) {
      lines.push('\t\t"[root] ' + edges[i].from + '" -> "[root] ' + edges[i].to + '"');
    }
    if (o.flags['-draw-cycles']) {
      lines.push('\t\t# （教学提示）没有发现依赖环：出现环时 terraform 会直接报 Cycle 错误，');
      lines.push('\t\t# 这里只把节点与边画出来，真实 -draw-cycles 会用红色标出环上的边。');
    }
    lines.push('\t}');
    lines.push('}');
    return U.ok(lines);
  }

  function resourceRefs(res) {
    var refs = [], seen = {};
    function scan(txt) {
      var re = /(?:module\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+)|(?:huaweicloud_[a-z0-9_]+\.[A-Za-z0-9_]+)/g, m;
      var s = String(txt);
      while ((m = re.exec(s)) !== null) {
        var v = m[0];
        if (/^huaweicloud_[a-z0-9_]+\.[a-z0-9_]+$/.test(v)) continue;
        if (!has(seen, v)) { seen[v] = 1; refs.push(v); }
      }
    }
    var b = res.block;
    for (var i = 0; i < b.attrOrder.length; i++) scan(b.attrs[b.attrOrder[i]].text);
    for (i = 0; i < b.blocks.length; i++) {
      var nb = b.blocks[i];
      for (var j = 0; j < nb.attrOrder.length; j++) scan(nb.attrs[nb.attrOrder[j]].text);
    }
    return refs;
  }

  /* ---------- terraform force-unlock ---------- */
  function tfForceUnlock(argv, ctx) {
    var o = parseOpts(argv, { '-force': 'bool', '-no-color': 'bool', '-help': 'bool' });
    if (o.unknown.length) return flagError('force-unlock', o.unknown);
    if (!o.pos.length) return U.fail(['Error: You must specify a lock ID to unlock.', '', 'Usage: terraform force-unlock [options] LOCK_ID']);
    var id = o.pos[0];
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return U.fail([
        'Error: Invalid lock ID',
        '',
        'The given lock ID does not appear to be valid: ' + id,
        '',
        NOTE + '锁 ID 就是报错信息里 ID: 后面那串 UUID，照抄即可，别自己编。'
      ]);
    }
    if (!o.flags['-force']) {
      return U.ok([
        'Do you really want to force-unlock?',
        '  If you do, this other process may be able to continue running, but it',
        '  may also be able to corrupt the state.',
        '',
        '  Only \'yes\' will be accepted to confirm.',
        '',
        '  Enter a value: ',
        '',
        NOTE + '单行教学终端无法输入 yes，所以没有执行解锁。无人值守场景加 -force：',
        'terraform force-unlock -force ' + id,
        '',
        '强解前必须确认原任务真的结束了（ps -ef | grep terraform）：锁还在被别人持有时强解，',
        '两边同时写 state 会把远端状态写坏。锁信息里的 Who 是执行者与主机名，看到陌生主机先问人。'
      ]);
    }
    return U.ok([
      'Force-unlock succeeded. If you were expecting that the lock was being held by a',
      'process that is still running, please take appropriate action. If the lock is still',
      'held, you may need to force-unlock again.',
      '',
      NOTE + '解锁后第一件事是 terraform plan 确认 state 可用；报 state 损坏就用最近的备份恢复',
      '（terraform state pull 的产物或 OBS 桶的对象版本）。频繁撞锁说明流程要改：CI 里按目录串行执行，',
      '并给命令统一加 -lock-timeout=5m。'
    ]);
  }

  /* ---------- terraform 主调度 ---------- */
  function tfVersion() {
    return U.ok([
      'Terraform v' + TF_VERSION + ' (教学终端)',
      'on linux_amd64',
      '',
      '+ provider registry.terraform.io/huaweicloud/huaweicloud v' + HWC_VERSION,
      '',
      NOTE + '版本号用于教学演示；真机请以 terraform version 的输出为准，并保持团队内版本一致。'
    ]);
  }

  function tfHelp() {
    return U.ok([
      'Usage: terraform [global options] <subcommand> [args]',
      '',
      'Main commands:',
      '  init          Prepare your working directory for other commands',
      '  validate      Check whether the configuration is valid',
      '  plan          Show changes required by the current configuration',
      '  apply         Create or update infrastructure',
      '  destroy       Destroy previously-created infrastructure',
      '',
      'All other commands:',
      '  console       Try Terraform expressions at an interactive command prompt',
      '  fmt           Reformat your configuration in the standard style',
      '  force-unlock  Release a stuck lock on the current workspace',
      '  graph         Generate a Graphviz graph of the steps in an operation',
      '  import        Associate existing infrastructure with a Terraform resource',
      '  output        Show output values from your root module',
      '  providers     Show the providers required for this configuration',
      '  refresh       Update the state to match remote systems',
      '  show          Show the current state or a saved plan',
      '  state         Advanced state management',
      '  taint         Mark a resource instance as not fully functional',
      '  untaint       Remove the "tainted" marker from a resource instance',
      '  version       Show the current Terraform version',
      '  workspace     Workspace management',
      '',
      'Global options (must come before the subcommand):',
      '  -chdir=DIR    Switch to a different working directory before executing',
      '  -help         Show this help output',
      '  -version      Show version'
    ]);
  }

  function dispatchTerraform(argv, ctx, stdin, HOST) {
    var args = argv.slice();
    /* 全局选项：-chdir=DIR */
    var cwdOverride = null;
    while (args.length && args[0].charAt(0) === '-' && args[0] !== '-') {
      var g = args[0];
      if (g.indexOf('-chdir=') === 0) {
        cwdOverride = U.resolvePath(ctx.cwd, g.slice(7));
        args = args.slice(1);
        continue;
      }
      if (g === '-help' || g === '--help' || g === '-h') return tfHelp();
      if (g === '-version') return tfVersion();
      if (g === '-no-color' || g === '-json') { args = args.slice(1); continue; }
      return U.fail([
        'Error: Failed to parse global flags',
        '',
        'flag provided but not defined: ' + g,
        NOTE + 'terraform 的全局选项只有 -chdir=DIR / -help / -version，其他选项要写在子命令后面。'
      ]);
    }
    if (cwdOverride) {
      var rn = realNode(ctx, cwdOverride);
      if (!isDir(rn.node)) {
        return U.fail(['Error: Failed to switch to the given directory', '', 'The -chdir directory "' + cwdOverride + '" does not exist.']);
      }
      ctx = cloneCtxAt(ctx, rn.abs);
    }
    var sub = args[0] || '';
    var rest = args.slice(1);
    switch (sub) {
      case '': case 'help': return tfHelp();
      case 'version': return tfVersion();
      case 'init': return tfInit(rest, ctx);
      case 'plan': return tfPlan(rest, ctx);
      case 'apply': return tfApply(rest, ctx);
      case 'destroy': return tfDestroy(rest, ctx);
      case 'validate': return tfValidate(rest, ctx);
      case 'fmt': return tfFmt(rest, ctx);
      case 'output': return tfOutput(rest, ctx);
      case 'refresh': return tfRefresh(rest, ctx);
      case 'state': return tfState(rest, ctx);
      case 'show': return tfShow(rest, ctx);
      case 'console': return tfConsole(rest, ctx, stdin);
      case 'import': return tfImport(rest, ctx);
      case 'taint': return tfTaint(rest, ctx, false);
      case 'untaint': return tfTaint(rest, ctx, true);
      case 'providers': return tfProviders(rest, ctx);
      case 'workspace': return tfWorkspace(rest, ctx);
      case 'graph': return tfGraph(rest, ctx);
      case 'force-unlock': return tfForceUnlock(rest, ctx);
      case 'get': return U.ok([NOTE + 'terraform get 只在用远端 module 时有用（下载 module 到 .terraform/modules）；本项目用本地 ./modules/vpc。']);
      case 'login': case 'logout': return U.ok([NOTE + '教学环境不连 Terraform Cloud，' + sub + ' 无实际效果。']);
      default:
        return U.fail([
          'Error: This command is not available in this teaching terminal: ' + sub,
          '',
          NOTE + '求值表达式用 terraform console，看状态用 terraform state list / show。',
          '实现覆盖：init / plan / apply / destroy / validate / fmt / output / refresh / state / show /',
          'console / import / taint / untaint / providers / workspace / graph / force-unlock / version。'
        ]);
    }
  }

  /* -chdir 用的 ctx 副本（cwd 换成别的目录，其它引用保持不变） */
  function cloneCtxAt(ctx, abs) {
    var c = {};
    for (var k in ctx) if (has(ctx, k)) c[k] = ctx[k];
    c.cwd = abs;
    return c;
  }

  /* 引擎不切分分号：`terraform plan -detailed-exitcode; echo "exit=$?"` 的
     后半段在这里补执行，$? 用前半段的退出码替换（与真 shell 的 ; 语义一致）。 */
  function tfWithSemicolon(argv, ctx, stdin, HOST) {
    var idx = -1, head = [], tail = [];
    for (var i = 0; i < argv.length; i++) {
      var t = argv[i];
      if (t === ';') { idx = i; break; }
      if (t.length > 1 && t.charAt(t.length - 1) === ';') {
        head.push(t.slice(0, t.length - 1));
        idx = i + 1;
        break;
      }
      head.push(t);
    }
    if (idx === -1) return { head: argv, tail: null };
    for (var j = idx; j < argv.length; j++) tail.push(argv[j]);
    return { head: head, tail: tail };
  }

  function terraformCmd(argv, ctx, stdin, HOST) {
    var split = tfWithSemicolon(argv, ctx, stdin, HOST);
    var res = dispatchTerraform(split.head, ctx, stdin, HOST);
    if (!split.tail || !split.tail.length) return res;
    var line = split.tail.join(' ').replace(/\$\?/g, String(res.code));
    if (!ctx.shell || typeof ctx.shell.exec !== 'function') {
      return { out: res.out || [], err: (res.err || []).concat(['bash: 无法执行分号后的命令：' + line]), code: res.code };
    }
    var next = ctx.shell.exec(line);
    return {
      out: (res.out || []).concat(next.out || []),
      err: (res.err || []).concat(next.err || []),
      code: next.code
    };
  }

  /* ======================================================================
     8. Ansible 基础：YAML 子集解析 / 清单 / 变量 / vault
     ====================================================================== */
  function stripYamlComment(line) {
    var q = null, out = '';
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (q) { out += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
      if (ch === '#' && (i === 0 || /\s/.test(line.charAt(i - 1)))) break;
      out += ch;
    }
    return out;
  }

  function parseYamlScalar(v) {
    var t = trim(v);
    if (t === '') return null;
    if (t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') return t.slice(1, -1);
    if (t.charAt(0) === "'" && t.charAt(t.length - 1) === "'") return t.slice(1, -1);
    if (t === 'true' || t === 'yes' || t === 'True') return true;
    if (t === 'false' || t === 'no' || t === 'False') return false;
    if (t === 'null' || t === '~') return null;
    if (/^-?\d+$/.test(t)) return Number(t);
    if (t.charAt(0) === '[' && t.charAt(t.length - 1) === ']') {
      var parts = splitTop(t.slice(1, -1), ','), arr = [], i;
      for (i = 0; i < parts.length; i++) arr.push(parseYamlScalar(parts[i]));
      return arr;
    }
    if (t.charAt(0) === '{' && t.charAt(t.length - 1) === '}') {
      var ps = splitTop(t.slice(1, -1), ','), obj = {};
      for (i = 0; i < ps.length; i++) {
        var ci = ps[i].indexOf(':');
        if (ci < 0) continue;
        obj[trim(ps[i].slice(0, ci))] = parseYamlScalar(ps[i].slice(ci + 1));
      }
      return obj;
    }
    return t;
  }

  /* YAML 子集解析：够 Ansible 清单 / playbook / 变量文件用（缩进式 + 列表 + 内联标量） */
  function parseYaml(text) {
    var rawLines = String(text).split('\n'), lines = [], i;
    for (i = 0; i < rawLines.length; i++) {
      var noComment = stripYamlComment(rawLines[i]).replace(/\t/g, '    ');
      if (trim(noComment) === '') continue;
      var t = trim(noComment);
      if (t === '---' || t === '...') continue;
      lines.push({ indent: noComment.length - trim(noComment).length, text: t, raw: rawLines[i], line: i + 1 });
    }
    var pos = 0;
    function parseBlock(minIndent) {
      if (pos >= lines.length || lines[pos].indent < minIndent) return null;
      if (/^-(\s|$)/.test(lines[pos].text)) return parseList(lines[pos].indent);
      return parseMap(lines[pos].indent);
    }
    function readBlockScalar(baseIndent) {
      var out = [];
      while (pos < lines.length && lines[pos].indent > baseIndent) {
        out.push(lines[pos].raw.replace(/^\s{0,100}/, function (m) { return m.length > baseIndent + 2 ? m.slice(baseIndent + 2) : ''; }));
        pos++;
      }
      return out.join('\n') + (out.length ? '\n' : '');
    }
    function parseMap(minIndent) {
      var obj = {};
      while (pos < lines.length) {
        var ln = lines[pos];
        if (ln.indent < minIndent || /^-(\s|$)/.test(ln.text)) break;
        var ci = ln.text.indexOf(':');
        if (ci < 0) { pos++; continue; }
        var key = trim(ln.text.slice(0, ci));
        var val = trim(ln.text.slice(ci + 1));
        pos++;
        if (/^[|>][-+]?$/.test(val)) { obj[key] = readBlockScalar(ln.indent); continue; }
        if (val === '') {
          if (pos < lines.length && lines[pos].indent > ln.indent) obj[key] = parseBlock(ln.indent + 1);
          else obj[key] = null;
          continue;
        }
        obj[key] = parseYamlScalar(val);
      }
      return obj;
    }
    function parseList(minIndent) {
      var arr = [];
      while (pos < lines.length) {
        var ln = lines[pos];
        if (ln.indent < minIndent || !/^-(\s|$)/.test(ln.text)) break;
        var body = ln.text.replace(/^-\s*/, '');
        var itemIndent = ln.indent;
        if (body === '') {
          pos++;
          if (pos < lines.length && lines[pos].indent > itemIndent) arr.push(parseBlock(itemIndent + 1));
          else arr.push(null);
          continue;
        }
        var ci = body.indexOf(':');
        if (ci > 0 && !/^["']/.test(body)) {
          /* `- key: value` 起头的一项：把该行改写成 map 的第一行再解析 */
          lines[pos] = { indent: itemIndent + 2, text: body, raw: ln.raw, line: ln.line };
          arr.push(parseMap(itemIndent + 2));
          continue;
        }
        pos++;
        arr.push(parseYamlScalar(body));
      }
      return arr;
    }
    var value = parseBlock(0);
    return value === null ? {} : value;
  }

  /* ---------- 清单（INI / YAML） ---------- */
  function newInventory() {
    return { groups: {}, hosts: {}, groupOrder: [], warnings: [], sources: [] };
  }
  function invGroup(inv, name) {
    if (!has(inv.groups, name)) {
      inv.groups[name] = { name: name, hosts: [], children: [], vars: {} };
      inv.groupOrder.push(name);
    }
    return inv.groups[name];
  }
  function invHost(inv, name) {
    if (!has(inv.hosts, name)) inv.hosts[name] = { name: name, vars: {}, groups: [] };
    return inv.hosts[name];
  }
  function invAddHost(inv, group, host, vars) {
    var h = invHost(inv, host);
    for (var k in (vars || {})) if (has(vars, k)) h.vars[k] = vars[k];
    if (group) {
      var g = invGroup(inv, group);
      if (g.hosts.indexOf(host) === -1) g.hosts.push(host);
      if (h.groups.indexOf(group) === -1) h.groups.push(group);
    }
  }

  function parseIniInventory(text, inv) {
    var lines = String(text).split('\n'), cur = null, mode = 'hosts';
    for (var i = 0; i < lines.length; i++) {
      var line = trim(lines[i]);
      if (line === '' || line.charAt(0) === '#' || line.charAt(0) === ';') continue;
      var sec = line.match(/^\[([^\]]+)\]$/);
      if (sec) {
        var name = trim(sec[1]);
        if (/:vars$/.test(name)) { cur = trim(name.replace(/:vars$/, '')); mode = 'vars'; }
        else if (/:children$/.test(name)) { cur = trim(name.replace(/:children$/, '')); mode = 'children'; }
        else { cur = name; mode = 'hosts'; }
        invGroup(inv, cur);
        continue;
      }
      if (mode === 'vars') {
        var vi = line.indexOf('=');
        if (vi > 0) invGroup(inv, cur).vars[trim(line.slice(0, vi))] = parseYamlScalar(line.slice(vi + 1));
        continue;
      }
      if (mode === 'children') { invGroup(inv, cur).children.push(line); continue; }
      var toks = line.split(/\s+/);
      var host = toks[0], vars = {};
      for (var k = 1; k < toks.length; k++) {
        var eq = toks[k].indexOf('=');
        if (eq > 0) vars[toks[k].slice(0, eq)] = parseYamlScalar(toks[k].slice(eq + 1));
      }
      invAddHost(inv, cur, host, vars);
    }
    return inv;
  }

  function parseYamlInventory(text, inv) {
    var doc = parseYaml(text);
    function walk(name, node, parent) {
      if (!node || typeof node !== 'object') return;
      var g = invGroup(inv, name);
      if (parent && invGroup(inv, parent).children.indexOf(name) === -1) invGroup(inv, parent).children.push(name);
      var hostNodes = node.hosts;
      if (hostNodes) {
        if (Object.prototype.toString.call(hostNodes) === '[object Array]') {
          for (var i = 0; i < hostNodes.length; i++) invAddHost(inv, name, String(hostNodes[i]), {});
        } else {
          for (var hn in hostNodes) {
            if (!has(hostNodes, hn)) continue;
            var hv = hostNodes[hn] || {};
            if (typeof hv !== 'object') hv = {};
            invAddHost(inv, name, hn, hv);
          }
        }
      }
      if (node.vars && typeof node.vars === 'object') {
        for (var vk in node.vars) if (has(node.vars, vk)) g.vars[vk] = node.vars[vk];
      }
      if (node.children && typeof node.children === 'object') {
        for (var cn in node.children) if (has(node.children, cn)) walk(cn, node.children[cn], name);
      }
    }
    for (var top in doc) {
      if (!has(doc, top)) continue;
      walk(top, doc[top], null);
    }
    return inv;
  }

  function inventoryPathFromCfg(ctx) {
    var cfg = readText(ctx, ctx.cwd + '/ansible.cfg');
    if (cfg === null) return null;
    var lines = String(cfg).split('\n'), section = '';
    for (var i = 0; i < lines.length; i++) {
      var line = trim(stripComment(lines[i]));
      if (line === '') continue;
      var sec = line.match(/^\[([^\]]+)\]$/);
      if (sec) { section = trim(sec[1]); continue; }
      if (section !== 'defaults') continue;
      var m = line.match(/^inventory\s*=\s*(.*)$/);
      if (m) return trim(m[1]);
    }
    return null;
  }

  /* 加载清单：-i 可给多个（逗号分隔），也支持内联主机 `10.0.1.31,` */
  function loadInventory(ctx, spec, opts) {
    var inv = newInventory();
    var specs = [];
    if (spec) {
      var raw = String(spec).split(',');
      for (var i = 0; i < raw.length; i++) {
        var s = trim(raw[i]);
        if (s !== '') specs.push(s);
      }
      /* `10.0.1.31,` 这种内联写法：最后一段为空 → 说明是 IP 列表 */
      if (/,\s*$/.test(String(spec))) {
        var ips = String(spec).split(',').filter(function (x) { return trim(x) !== ''; });
        for (var j = 0; j < ips.length; j++) invAddHost(inv, 'all', trim(ips[j]), {});
        inv.sources.push('inline:' + ips.join(','));
        if (!specs.length) { loadVarsDirs(ctx, inv); return { ok: true, inv: inv }; }
      }
    }
    if (!specs.length) {
      var fromCfg = inventoryPathFromCfg(ctx);
      if (fromCfg) specs.push(fromCfg);
      else specs.push('/etc/ansible/hosts');
    }
    var found = false;
    for (i = 0; i < specs.length; i++) {
      var p = U.resolvePath(ctx.cwd, specs[i]);
      var txt = readText(ctx, p);
      if (txt === null) {
        inv.warnings.push('Unable to parse ' + p + ' as an inventory source');
        continue;
      }
      found = true;
      inv.sources.push(specs[i]);
      if (/\.ya?ml$/i.test(specs[i])) {
        if (/^\s*plugin\s*:/m.test(txt)) {
          inv.dynamic = true;
          inv.warnings.push('动态清单插件 ' + trim((txt.match(/^\s*plugin\s*:\s*(.+)$/m) || [])[1] || '') + ' 需要连华为云 API，教学环境按文件里的静态分组解析');
        }
        if (/dynamic-inventory-demo/.test(txt)) inv.dynamicNote = true;
        parseYamlInventory(txt, inv);
      } else {
        parseIniInventory(txt, inv);
      }
    }
    if (!found) {
      inv.warnings.push('No inventory was parsed, only implicit localhost is available');
    }
    loadVarsDirs(ctx, inv);
    return { ok: true, inv: inv };
  }

  /* group_vars/ 与 host_vars/（目录或单文件都支持） */
  function loadVarsDirs(ctx, inv) {
    var gv = ctx.cwd + '/group_vars', hv = ctx.cwd + '/host_vars';
    var names = listNames(ctx, gv);
    for (var i = 0; i < names.length; i++) {
      var p = gv + '/' + names[i];
      var r = realNode(ctx, p);
      if (isDir(r.node)) {
        var files = listNames(ctx, p);
        for (var f = 0; f < files.length; f++) {
          if (!/\.ya?ml$/.test(files[f])) continue;
          applyVars(inv, 'group', names[i], readText(ctx, p + '/' + files[f]));
        }
      } else if (/\.ya?ml$/.test(names[i])) {
        applyVars(inv, 'group', names[i].replace(/\.ya?ml$/, ''), readText(ctx, p));
      }
    }
    var hnames = listNames(ctx, hv);
    for (i = 0; i < hnames.length; i++) {
      var hp = hv + '/' + hnames[i];
      var hr = realNode(ctx, hp);
      if (isDir(hr.node)) {
        var hfiles = listNames(ctx, hp);
        for (f = 0; f < hfiles.length; f++) {
          if (!/\.ya?ml$/.test(hfiles[f])) continue;
          applyVars(inv, 'host', hnames[i], readText(ctx, hp + '/' + hfiles[f]));
        }
      } else if (/\.ya?ml$/.test(hnames[i])) {
        applyVars(inv, 'host', hnames[i].replace(/\.ya?ml$/, ''), readText(ctx, hp));
      }
    }
  }
  function applyVars(inv, kind, name, text) {
    if (text === null) return;
    if (isVaultText(text)) {
      inv.vaultFiles = inv.vaultFiles || [];
      inv.vaultFiles.push({ kind: kind, name: name, text: text });
      return;
    }
    var doc = parseYaml(text);
    if (!doc || typeof doc !== 'object') return;
    if (kind === 'group') {
      var g = invGroup(inv, name);
      for (var k in doc) if (has(doc, k)) g.vars[k] = doc[k];
    } else {
      var h = invHost(inv, name);
      for (var k2 in doc) if (has(doc, k2)) h.vars[k2] = doc[k2];
    }
  }

  /* 变量优先级：group_vars/all < 父组 < 子组 < host_vars < -e */
  function hostVars(inv, host, extraVars, facts) {
    var out = {}, i, k;
    var all = inv.groups['all'];
    if (all) for (k in all.vars) if (has(all.vars, k)) out[k] = all.vars[k];
    var h = inv.hosts[host];
    var chain = h ? h.groups.slice() : [];
    /* 组继承：父组先、子组后（简化处理：按 groupOrder 顺序叠加） */
    for (i = 0; i < inv.groupOrder.length; i++) {
      var g = inv.groups[inv.groupOrder[i]];
      if (g.name === 'all') continue;
      for (var j = 0; j < chain.length; j++) {
        if (chain[j] === g.name || g.hosts.indexOf(host) !== -1) {
          for (k in g.vars) if (has(g.vars, k)) out[k] = g.vars[k];
          break;
        }
      }
    }
    if (h) for (k in h.vars) if (has(h.vars, k)) out[k] = h.vars[k];
    if (facts) for (k in facts) if (has(facts, k)) out[k] = facts[k];
    if (extraVars) for (k in extraVars) if (has(extraVars, k)) out[k] = extraVars[k];
    return out;
  }

  /* 主机模式：支持 all、*、组名、主机名、逗号/冒号分隔、! 排除 */
  function matchHosts(pattern, inv, warnings) {
    var result = [], seen = {};
    function add(host) { if (!seen[host]) { seen[host] = 1; result.push(host); } }
    var parts = String(pattern || 'all').split(/[,:]/);
    for (var i = 0; i < parts.length; i++) {
      var p = trim(parts[i]);
      if (p === '') continue;
      var neg = p.charAt(0) === '!';
      if (neg) p = p.slice(1);
      var hits = [];
      if (p === 'all' || p === '*') {
        hits = Object.keys(inv.hosts);
      } else if (has(inv.groups, p)) {
        hits = inv.groups[p].hosts.slice();
      } else if (has(inv.hosts, p)) {
        hits = [p];
      } else if (/[*?]/.test(p)) {
        var re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        hits = Object.keys(inv.hosts).filter(function (h) { return re.test(h); });
      }
      if (!hits.length) {
        if (warnings) warnings.push('Could not match supplied host pattern, ignoring: ' + p);
        continue;
      }
      if (neg) { for (var n = 0; n < hits.length; n++) { var at = result.indexOf(hits[n]); if (at >= 0) result.splice(at, 1); } }
      else for (var m = 0; m < hits.length; m++) add(hits[m]);
    }
    return result;
  }

  /* ---------- Ansible Vault（教学环境用可逆混淆代替 AES256，格式保持一致） ---------- */
  var VAULT_HEADER = '$ANSIBLE_VAULT;1.1;AES256';
  function isVaultText(text) { return String(text).indexOf(VAULT_HEADER) === 0; }
  function vaultKey(pass) {
    var key = [], seed = 5381, i;
    for (i = 0; i < pass.length; i++) seed = ((seed * 33) ^ pass.charCodeAt(i)) >>> 0;
    for (i = 0; i < 32; i++) { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; key.push(seed % 256); }
    return key;
  }
  function utf8Bytes(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 128) out.push(c);
      else if (c < 2048) { out.push(192 | (c >> 6), 128 | (c & 63)); }
      else { out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
    }
    return out;
  }
  function bytesToUtf8(bytes) {
    var out = '', i = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      if (b < 128) { out += String.fromCharCode(b); i++; }
      else if (b < 224) { out += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63)); i += 2; }
      else { out += String.fromCharCode(((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)); i += 3; }
    }
    return out;
  }
  function vaultTransform(bytes, pass) {
    var key = vaultKey(pass), out = [], i;
    for (i = 0; i < bytes.length; i++) out.push(bytes[i] ^ key[i % key.length]);
    return out;
  }
  function vaultEncrypt(text, pass) {
    var bytes = vaultTransform(utf8Bytes(text), pass), hex = '', i;
    for (i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    var lines = [];
    for (i = 0; i < hex.length; i += 80) lines.push(hex.slice(i, i + 80));
    return VAULT_HEADER + '\n' + lines.join('\n') + '\n';
  }
  function vaultDecrypt(text, pass) {
    var body = String(text).split('\n').slice(1).join('').replace(/\s/g, '');
    if (body.length % 2 !== 0) return { err: 'invalid ciphertext length' };
    var bytes = [], i;
    for (i = 0; i < body.length; i += 2) bytes.push(parseInt(body.slice(i, i + 2), 16));
    return { text: bytesToUtf8(vaultTransform(bytes, pass)) };
  }
  function vaultPassFromArgs(ctx, o) {
    var f = o.values['--vault-password-file'] || o.values['--vault-password-file'];
    if (Array.isArray(f)) f = f[0];
    if (!f) return { err: 'ERROR! Attempting to decrypt but no vault secrets found' };
    var abs = U.resolvePath(ctx.cwd, f);
    var txt = readText(ctx, abs);
    if (txt === null) return { err: 'ERROR! The vault password file ' + abs + ' was not found' };
    return { pass: String(txt).split('\n')[0].replace(/\r$/, '') };
  }

  /* ======================================================================
     9. Ansible 模块元数据（ansible-doc 用；参数名与官方一致）
     ====================================================================== */
  var ANSIBLE_MODULES = {
    ping: {
      short: 'Try to connect to host, verify a usable python and return `pong` on success',
      desc: 'A trivial test module, this module always returns `pong` on successful contact. It does not make sense in playbooks, but it is useful from C(/usr/bin/ansible) to verify the ability to login and that a usable Python is configured.',
      opts: [['data', 'Data to return for the `ping` return value.', null, 'string']],
      examples: ['- name: Example from an Ansible Playbook\n  ansible.builtin.ping:'],
      readOnly: true
    },
    command: {
      short: 'Execute commands on targets',
      desc: 'The C(command) module takes the command name followed by a list of space-delimited arguments. The given command will be executed on all selected nodes. The command will B(not) be processed through the shell, so variables like C($HOSTNAME) and operations like C("*"), C("<"), C(">"), C("|"), C(";") and C("&") will not work.',
      opts: [
        ['cmd', 'The command to run.', null, 'string'],
        ['argv', 'Passes the command as a list rather than a string.', null, 'list'],
        ['chdir', 'Change into this directory before running the command.', null, 'path'],
        ['creates', 'A filename or (since 2.0) glob pattern. If it already exists, this step B(won\'t) be run.', null, 'path'],
        ['removes', 'A filename or (since 2.0) glob pattern. If it already exists, this step B(will) be run.', null, 'path'],
        ['stdin', 'Set the stdin of the command directly to the specified value.', null, 'string'],
        ['warn', 'Turn off the warning about using this module.', null, 'bool']
      ],
      examples: ['- name: Return motd to registered var\n  ansible.builtin.command: cat /etc/motd\n  register: mymotd'],
      readOnly: false
    },
    shell: {
      short: 'Execute shell commands on targets',
      desc: 'The C(shell) module takes the command name followed by a list of space-delimited arguments. It is almost exactly like the C(ansible.builtin.command) module but runs the command through a shell (C(/bin/sh)) on the remote node.',
      opts: [
        ['cmd', 'The command to run.', null, 'string'],
        ['chdir', 'Change into this directory before running the command.', null, 'path'],
        ['creates', 'A filename or glob pattern. If it already exists, this step won\'t be run.', null, 'path'],
        ['removes', 'A filename or glob pattern. If it already exists, this step will be run.', null, 'path'],
        ['executable', 'Change the shell used to execute the command.', null, 'path'],
        ['stdin', 'Set the stdin of the command directly to the specified value.', null, 'string']
      ],
      examples: ['- name: Run a pipe\n  ansible.builtin.shell: ps -ef | grep -c "[j]ava"\n  args:\n    executable: /bin/bash'],
      readOnly: false
    },
    copy: {
      short: 'Copy files to remote locations',
      desc: 'The C(copy) module copies a file from the local or remote machine to a location on the remote machine. Use the M(ansible.builtin.fetch) module to copy files from remote locations to the local box.',
      opts: [
        ['src', 'Local path to a file to copy to the remote server.', null, 'path'],
        ['content', 'When used instead of C(src), sets the contents of a file directly to the specified value.', null, 'string'],
        ['dest', 'Remote absolute path where the file should be copied to.', 'required', 'path'],
        ['backup', 'Create a backup file including the timestamp information.', 'no', 'bool'],
        ['force', 'If C(yes) and C(dest) is a file, the file will be replaced when contents differ.', 'yes', 'bool'],
        ['mode', 'The permissions of the destination file or directory.', null, 'raw'],
        ['owner', 'Name of the user that should own the file/directory.', null, 'string'],
        ['group', 'Name of the group that should own the file/directory.', null, 'string'],
        ['validate', 'The validation command to run before copying into place, with %s as the placeholder.', null, 'string'],
        ['remote_src', 'If C(no), it will search for C(src) at originating/master machine.', 'no', 'bool']
      ],
      examples: ['- name: Copy Docker config\n  ansible.builtin.copy:\n    src: files/daemon.json\n    dest: /etc/docker/daemon.json\n    owner: root\n    group: root\n    mode: "0644"\n    backup: yes'],
      readOnly: false
    },
    file: {
      short: 'Manage files and file properties',
      desc: 'Set attributes of files, directories, or symlinks and their targets. Or remove files, directories or symlinks. Many other modules support the same options as the C(file) module - including M(ansible.builtin.copy), M(ansible.builtin.template), and M(ansible.builtin.assemble).',
      opts: [
        ['path', 'Path to the file being managed.', 'required', 'path'],
        ['state', 'If C(directory), all intermediate subdirectories will be created if they do not exist.', 'file', 'string'],
        ['owner', 'Name of the user that should own the filesystem object.', null, 'string'],
        ['group', 'Name of the group that should own the filesystem object.', null, 'string'],
        ['mode', 'The permissions the resulting filesystem object should have.', null, 'raw'],
        ['recurse', 'Recursively set the specified file attributes on directory contents.', 'no', 'bool'],
        ['src', 'Path of the file to link to (applies only to C(state=link) and C(state=hard)).', null, 'path'],
        ['force', 'Force the creation of the symlinks in two cases.', 'no', 'bool']
      ],
      examples: ['- name: Create app dirs\n  ansible.builtin.file:\n    path: "{{ item }}"\n    state: directory\n    owner: deploy\n    mode: "0755"\n  loop: [/opt/app, /opt/app/logs]'],
      readOnly: false
    },
    template: {
      short: 'Template a file out to a target host',
      desc: 'Templates are processed by the Jinja2 templating language. Use the M(ansible.builtin.copy) module for copying files that do not need to be rendered.',
      opts: [
        ['src', 'Path of a Jinja2 formatted template on the Ansible controller.', 'required', 'path'],
        ['dest', 'Location to render the template to on the remote machine.', 'required', 'path'],
        ['owner', 'Name of the user that should own the file/directory.', null, 'string'],
        ['group', 'Name of the group that should own the file/directory.', null, 'string'],
        ['mode', 'The permissions of the destination file or directory.', null, 'raw'],
        ['validate', 'The validation command to run before copying into place (%s is the temp file).', null, 'string'],
        ['backup', 'Create a backup file including the timestamp information.', 'no', 'bool'],
        ['force', 'If C(no), the file will only be transferred if it does not exist.', 'yes', 'bool']
      ],
      examples: ['- name: Render nginx.conf\n  ansible.builtin.template:\n    src: nginx.conf.j2\n    dest: /etc/nginx/nginx.conf\n    validate: "nginx -t -c %s"\n  notify: reload nginx'],
      readOnly: false
    },
    user: {
      short: 'Manage user accounts',
      desc: 'Manage user accounts and user attributes on remote hosts.',
      opts: [
        ['name', 'Name of the user to create, remove or modify.', 'required', 'string'],
        ['uid', 'Optionally sets the I(UID) of the user.', null, 'int'],
        ['group', 'Optionally sets the user\'s primary group.', null, 'string'],
        ['groups', 'A list of supplementary groups which the user is also a member of.', null, 'list'],
        ['append', 'If C(yes), add the user to the groups specified in C(groups).', 'no', 'bool'],
        ['shell', 'Optionally set the user\'s shell.', null, 'string'],
        ['create_home', 'Unless set to C(no), a home directory will be made for the user.', 'yes', 'bool'],
        ['password', 'Optionally set the user\'s password to this crypted value.', null, 'string'],
        ['system', 'Create an account for a system user (UID below 1000).', 'no', 'bool'],
        ['state', 'Whether the account should exist or not.', 'present', 'string'],
        ['remove', 'When used with C(state=absent), remove the user\'s home directory.', 'no', 'bool']
      ],
      examples: ['- name: Create deploy user\n  ansible.builtin.user:\n    name: deploy\n    groups: wheel\n    append: yes\n    shell: /bin/bash'],
      readOnly: false
    },
    group: {
      short: 'Add or remove groups',
      desc: 'Manage presence of groups on a host.',
      opts: [
        ['name', 'Name of the group to manage.', 'required', 'string'],
        ['gid', 'Optional I(GID) to set for the group.', null, 'int'],
        ['system', 'Indicates that the group should be a system group.', 'no', 'bool'],
        ['state', 'Whether the group should be present or not.', 'present', 'string']
      ],
      examples: ['- name: Create deploy group\n  ansible.builtin.group:\n    name: deploy\n    gid: 2000'],
      readOnly: false
    },
    yum: {
      short: 'Manages packages with the I(yum) package manager',
      desc: 'Installs, upgrade, downgrades, removes, and lists packages and groups with the I(yum) package manager. This module only works on Python 2, and the M(ansible.builtin.dnf) module is used for Python 3.',
      opts: [
        ['name', 'A package name or package specifier with version, like C(name-1.0).', 'required', 'list'],
        ['state', 'Whether to install (C(present)/C(installed)/C(latest)) or remove (C(absent)/C(removed)) a package.', null, 'string'],
        ['enablerepo', 'Repoid of repositories to enable for the install/update operation.', null, 'list'],
        ['disablerepo', 'Repoid of repositories to disable for the install/update operation.', null, 'list'],
        ['update_cache', 'Force yum to check if cache is out of date and redownload if needed.', 'no', 'bool'],
        ['autoremove', 'If C(yes), removes all "leaf" packages from the system that were originally installed as dependencies.', 'no', 'bool'],
        ['disable_gpg_check', 'Whether to disable the GPG checking of signatures of packages being installed.', 'no', 'bool'],
        ['security', 'If set to C(yes), and C(state=latest) then only installs updates that have been marked security related.', 'no', 'bool']
      ],
      examples: ['- name: Install chrony\n  ansible.builtin.yum:\n    name: chrony\n    state: present'],
      readOnly: false
    },
    yum_repository: {
      short: 'Add or remove YUM repositories',
      desc: 'Add or remove YUM repositories in RPM-based Linux distributions.',
      opts: [
        ['name', 'A name for the repository, used as the .repo file name.', 'required', 'string'],
        ['baseurl', 'The URL to the directory where the yum repository\'s "repodata" directory lives.', null, 'list'],
        ['description', 'A human readable description of the repository.', null, 'string'],
        ['enabled', 'This tells yum whether or not use this repository.', 'yes', 'bool'],
        ['gpgcheck', 'Whether to validate the packages via GPG signature.', null, 'bool'],
        ['state', 'Whether the repository should be present or absent.', 'present', 'string']
      ],
      examples: ['- name: Add internal repo\n  ansible.builtin.yum_repository:\n    name: huawei-mirror\n    baseurl: http://repo.huaweicloud.com/euler/$releasever/os/$basearch/\n    gpgcheck: no'],
      readOnly: false
    },
    dnf: {
      short: 'Manages packages with the I(dnf) package manager',
      desc: 'Installs, upgrade, removes, and lists packages and groups with the I(dnf) package manager.',
      opts: [
        ['name', 'A package name or package specifier with version.', null, 'list'],
        ['state', 'Whether to install or remove a package.', null, 'string'],
        ['update_cache', 'Force dnf to check if cache is out of date and redownload if needed.', 'no', 'bool'],
        ['enablerepo', 'Repoid of repositories to enable for the install/update operation.', null, 'list'],
        ['disablerepo', 'Repoid of repositories to disable for the install/update operation.', null, 'list']
      ],
      examples: ['- name: Install chrony\n  ansible.builtin.dnf:\n    name: chrony\n    state: present'],
      readOnly: false
    },
    apt: {
      short: 'Manages apt-packages',
      desc: 'Manages I(apt) packages (such as for Debian/Ubuntu).',
      opts: [
        ['name', 'A list of packages to install or remove.', null, 'list'],
        ['state', 'Indicates the desired package state.', null, 'string'],
        ['update_cache', 'Run the equivalent of C(apt-get update) before the operation.', 'no', 'bool'],
        ['cache_valid_time', 'Update the apt cache if it is older than this value (seconds).', null, 'int'],
        ['autoremove', 'If C(yes), remove unused dependency packages.', 'no', 'bool'],
        ['deb', 'Path to a .deb package on the remote machine.', null, 'path'],
        ['force_apt_get', 'Force usage of apt-get instead of aptitude.', 'no', 'bool']
      ],
      examples: ['- name: Install tools on Ubuntu\n  ansible.builtin.apt:\n    name: [chrony, tcpdump]\n    state: present\n    update_cache: yes\n    cache_valid_time: 3600'],
      readOnly: false
    },
    package: {
      short: 'Generic OS package manager',
      desc: 'This modules manages packages on a target without specifying a package manager module (like M(ansible.builtin.yum), M(ansible.builtin.apt), ...).',
      opts: [
        ['name', 'Package name, or package specifier with version.', 'required', 'list'],
        ['state', 'Whether to install or remove a package.', null, 'string'],
        ['use', 'The required package manager module to use (yum, apt, ...).', 'auto', 'string']
      ],
      examples: ['- name: Install chrony\n  ansible.builtin.package:\n    name: chrony\n    state: present'],
      readOnly: false
    },
    systemd: {
      short: 'Manage systemd units',
      desc: 'Controls systemd units (services, timers, mounts, sockets...).',
      opts: [
        ['name', 'Name of the unit. Can be a partial unit name.', 'required', 'string'],
        ['state', 'C(started)/C(stopped) are idempotent actions, C(restarted) will always bounce the unit.', null, 'string'],
        ['enabled', 'Whether the unit should be enabled or disabled at boot.', null, 'bool'],
        ['daemon_reload', 'Run C(daemon-reload) before doing any other operation.', 'no', 'bool'],
        ['masked', 'Whether the unit should be masked or not.', null, 'bool'],
        ['scope', 'Run the operation on system or user scope.', 'system', 'string'],
        ['no_block', 'Do not synchronously wait for the requested operation to finish.', 'no', 'bool']
      ],
      examples: ['- name: Start docker\n  ansible.builtin.systemd:\n    name: docker\n    state: started\n    enabled: yes\n    daemon_reload: yes'],
      readOnly: false
    },
    systemd_service: {
      short: 'Manage systemd units',
      desc: 'Alias of M(ansible.builtin.systemd) added in ansible-core 2.14.',
      opts: [
        ['name', 'Name of the unit.', 'required', 'string'],
        ['state', 'started / stopped / restarted / reloaded', null, 'string'],
        ['enabled', 'Whether the unit should start on boot.', null, 'bool'],
        ['daemon_reload', 'Run daemon-reload before doing any other operation.', 'no', 'bool']
      ],
      examples: ['- name: Restart nginx\n  ansible.builtin.systemd_service:\n    name: nginx\n    state: restarted'],
      readOnly: false
    },
    service: {
      short: 'Manage services',
      desc: 'Controls services on remote hosts. Supported init systems include BSD init, OpenRC, SysV, Solaris SMF, systemd, upstart.',
      opts: [
        ['name', 'Name of the service.', 'required', 'string'],
        ['state', 'C(started)/C(stopped)/C(restarted)/C(reloaded).', null, 'string'],
        ['enabled', 'Whether the service should start on boot.', null, 'bool'],
        ['pattern', 'If the service does not respond to the status command, name a substring to look for as would be found in the output of the C(ps) command.', null, 'string'],
        ['arguments', 'Additional arguments provided on the command line.', null, 'string']
      ],
      examples: ['- name: Start nginx\n  ansible.builtin.service:\n    name: nginx\n    state: started'],
      readOnly: false
    },
    lineinfile: {
      short: 'Manage lines in text files',
      desc: 'This module ensures a particular line is in a file, or replace an existing line using a back-referenced regular expression.',
      opts: [
        ['path', 'The file to modify.', 'required', 'path'],
        ['regexp', 'The regular expression to look for in every line of the file.', null, 'string'],
        ['line', 'The line to insert/replace into the file.', null, 'string'],
        ['state', 'Whether the line should be present or absent.', 'present', 'string'],
        ['insertafter', 'If specified, the line will be inserted after the last match of this regular expression (C(EOF) for end of file).', null, 'string'],
        ['insertbefore', 'If specified, the line will be inserted before the last match of this regular expression.', null, 'string'],
        ['backrefs', 'Used with C(state=present). If set, C(line) can contain backreferences.', 'no', 'bool'],
        ['validate', 'The validation command to run before copying into place.', null, 'string'],
        ['backup', 'Create a backup file including the timestamp information.', 'no', 'bool'],
        ['create', 'Used with C(state=present). If specified, the file will be created if it does not already exist.', 'no', 'bool']
      ],
      examples: ['- name: Disable password auth\n  ansible.builtin.lineinfile:\n    path: /etc/ssh/sshd_config\n    regexp: "^#?PasswordAuthentication"\n    line: "PasswordAuthentication no"\n    validate: "sshd -t -f %s"'],
      readOnly: false
    },
    debug: {
      short: 'Print statements during execution',
      desc: 'This module prints statements during execution and can be useful for debugging variables or expressions without necessarily halting the playbook.',
      opts: [
        ['msg', 'The customized message that is printed.', null, 'string'],
        ['var', 'A variable name to debug.', null, 'string'],
        ['verbosity', 'A number that controls when the debug is run.', '0', 'int']
      ],
      examples: ['- name: Show version\n  ansible.builtin.debug:\n    msg: "docker_version = {{ docker_version }}"'],
      readOnly: true
    },
    setup: {
      short: 'Gathers facts about remote hosts',
      desc: 'This module is automatically called by playbooks to gather useful variables about remote hosts that can be used in playbooks.',
      opts: [
        ['gather_subset', 'Restrict facts gathered to a subset.', 'all', 'list'],
        ['gather_timeout', 'Set the default timeout in seconds for individual fact gathering.', '10', 'int'],
        ['filter', 'Only return facts that match this shell-style pattern.', null, 'string']
      ],
      examples: ['- name: Gather facts\n  ansible.builtin.setup:'],
      readOnly: true
    },
    uri: {
      short: 'Interacts with webservices',
      desc: 'Interacts with HTTP and HTTPS web services and supports Digest, Basic and WSSE HTTP authentication mechanisms.',
      opts: [
        ['url', 'HTTP or HTTPS URL in the form (http|https)://host.domain[:port]/path.', 'required', 'string'],
        ['method', 'The HTTP method of the request.', 'GET', 'string'],
        ['status_code', 'A valid, numeric, comma separated list of expected status codes.', '200', 'list'],
        ['body', 'The body of the http request/response to the web service.', null, 'string'],
        ['headers', 'Add custom HTTP headers to a request in the format of a dictionary.', null, 'dict'],
        ['return_content', 'Whether to return the body of the response as a "content" key.', 'no', 'bool'],
        ['validate_certs', 'If C(no), SSL certificates will not be validated.', 'yes', 'bool'],
        ['timeout', 'The socket level timeout in seconds.', '30', 'int']
      ],
      examples: ['- name: Health check\n  ansible.builtin.uri:\n    url: http://127.0.0.1/health\n    status_code: 200'],
      readOnly: true
    },
    stat: {
      short: 'Retrieve file or file system status',
      desc: 'Retrieves facts for a file similar to the Linux/Unix C(stat) command.',
      opts: [
        ['path', 'The full path of the file/object to get the facts of.', 'required', 'path'],
        ['follow', 'Whether to follow symlinks.', 'no', 'bool'],
        ['get_checksum', 'Whether to return a checksum of the file.', 'yes', 'bool'],
        ['checksum_algorithm', 'Algorithm to determine checksum of file.', 'sha1', 'string']
      ],
      examples: ['- name: Check docker binary\n  ansible.builtin.stat:\n    path: /usr/bin/docker\n  register: docker_bin'],
      readOnly: true
    },
    authorized_key: {
      short: 'Adds or removes an SSH authorized key',
      desc: 'Adds or removes SSH authorized keys for particular user accounts.',
      opts: [
        ['user', 'The username on the remote host whose authorized_keys file will be modified.', 'required', 'string'],
        ['key', 'The SSH public key(s), as a string or (since 2.4) url.', 'required', 'string'],
        ['state', 'Whether the given key should be present or absent.', 'present', 'string'],
        ['exclusive', 'Whether to remove all other non-specified keys from the authorized_keys file.', 'no', 'bool'],
        ['path', 'Alternate path to the authorized_keys file.', null, 'path']
      ],
      examples: ['- name: Install public key\n  ansible.posix.authorized_key:\n    user: deploy\n    key: "{{ lookup(\'file\', \'files/id_ed25519.pub\') }}"'],
      readOnly: false
    },
    hostname: {
      short: 'Manage hostname',
      desc: 'Set system hostname.',
      opts: [
        ['name', 'Name of the host.', 'required', 'string'],
        ['use', 'Which strategy to use to update the hostname.', 'auto', 'string']
      ],
      examples: ['- name: Set hostname\n  ansible.builtin.hostname:\n    name: web-prod-01'],
      readOnly: false
    },
    cron: {
      short: 'Manage cron.d and crontab entries',
      desc: 'Use this module to manage crontab and environment variables entries.',
      opts: [
        ['name', 'Description of a crontab entry or, if env is set, the name of environment variable.', 'required', 'string'],
        ['minute', 'Minute when the job should run.', '*', 'string'],
        ['hour', 'Hour when the job should run.', '*', 'string'],
        ['job', 'The command to execute or, if env is set, the value of environment variable.', null, 'string'],
        ['user', 'The specific user whose crontab should be modified.', 'root', 'string'],
        ['state', 'Whether to ensure the job or environment variable is present or absent.', 'present', 'string'],
        ['disabled', 'Whether to disable the job (comment it out) without removing it.', 'no', 'bool']
      ],
      examples: ['- name: Daily backup\n  ansible.builtin.cron:\n    name: backup\n    hour: 3\n    job: /opt/scripts/backup.sh'],
      readOnly: false
    },
    get_url: {
      short: 'Downloads files from HTTP, HTTPS, or FTP to node',
      desc: 'Downloads files from HTTP, HTTPS, or FTP to the remote server.',
      opts: [
        ['url', 'HTTP, HTTPS, or FTP URL in the form (http|https|ftp)://[user[:pass]]@host.domain[:port]/path.', 'required', 'string'],
        ['dest', 'Absolute path where the file should be downloaded to.', 'required', 'path'],
        ['mode', 'The permissions of the destination file.', null, 'raw'],
        ['checksum', 'If a checksum is passed to this parameter, the digest of the destination file will be calculated.', null, 'string'],
        ['timeout', 'Timeout in seconds for the request.', '10', 'int'],
        ['force', 'If C(yes) and C(dest) is not a directory, will download the file every time.', 'no', 'bool']
      ],
      examples: ['- name: Download release\n  ansible.builtin.get_url:\n    url: https://example.com/app.tar.gz\n    dest: /tmp/app.tar.gz'],
      readOnly: false
    },
    unarchive: {
      short: 'Unpacks an archive after (optionally) copying it from the local machine',
      desc: 'The C(unarchive) module unpacks an archive. It will not unpack a compressed file that does not contain an archive.',
      opts: [
        ['src', 'The remote or local path to the archive.', 'required', 'path'],
        ['dest', 'Remote absolute path where the archive should be unpacked.', 'required', 'path'],
        ['remote_src', 'Set to C(yes) to indicate the archived file is already on the remote system.', 'no', 'bool'],
        ['creates', 'A filename (or glob) that must not exist for this task to run.', null, 'path'],
        ['owner', 'Name of the user that should own the files.', null, 'string'],
        ['mode', 'Mode that should be applied to the unpacked files.', null, 'raw']
      ],
      examples: ['- name: Unpack app\n  ansible.builtin.unarchive:\n    src: /tmp/app.tar.gz\n    dest: /opt/app\n    remote_src: yes\n    creates: /opt/app/app.jar'],
      readOnly: false
    },
    pip: {
      short: 'Manages Python library dependencies',
      desc: 'Manage Python library dependencies. To use this module, one of the following keys is required: C(name) or C(requirements).',
      opts: [
        ['name', 'The name of a Python library to install or the url of the remote package.', null, 'list'],
        ['requirements', 'The path to a pip requirements file.', null, 'string'],
        ['state', 'Whether to install or remove a package.', 'present', 'string'],
        ['virtualenv', 'An optional path to a virtualenv directory to install into.', null, 'path']
      ],
      examples: ['- name: Install pip packages\n  ansible.builtin.pip:\n    name: requests\n    state: present'],
      readOnly: false
    },
    git: {
      short: 'Deploy software (or files) from git checkouts',
      desc: 'Manage I(git) checkouts of repositories to deploy files or software.',
      opts: [
        ['repo', 'The git repository address to clone.', 'required', 'path'],
        ['dest', 'The path of where the repository should be checked out.', 'required', 'path'],
        ['version', 'What version of the repository to check out.', 'HEAD', 'string'],
        ['force', 'If C(yes), any modified files in the working repository will be discarded.', 'no', 'bool'],
        ['update', 'If C(no), do not retrieve new revisions from the origin repository.', 'yes', 'bool']
      ],
      examples: ['- name: Checkout app\n  ansible.builtin.git:\n    repo: https://git.example.com/app.git\n    dest: /opt/app\n    version: v1.2.3'],
      readOnly: false
    },
    raw: {
      short: 'Executes a low-down and dirty command',
      desc: 'Executes a low-down and dirty SSH command, not going through the module subsystem.',
      opts: [['_raw_params', 'The command to run.', 'required', 'string']],
      examples: ['- name: Install python\n  ansible.builtin.raw: yum install -y python3'],
      readOnly: false
    },
    script: {
      short: 'Runs a local script on a remote node after transferring it',
      desc: 'The C(script) module takes the script name followed by a list of space-delimited arguments.',
      opts: [
        ['_raw_params', 'Path to the local script followed by optional arguments.', 'required', 'string'],
        ['chdir', 'Change into this directory on the remote node before running the script.', null, 'path'],
        ['creates', 'A filename or glob pattern that must not exist for this task to run.', null, 'path'],
        ['removes', 'A filename or glob pattern that must exist for this task to run.', null, 'path'],
        ['executable', 'Name of the executable used to run the script.', null, 'string']
      ],
      examples: ['- name: Run init script\n  ansible.builtin.script: /opt/scripts/init.sh'],
      readOnly: false
    },
    set_fact: {
      short: 'Set host variable(s) and fact(s)',
      desc: 'This action allows setting variables associated to the target host.',
      opts: [['key_value', 'The C(set_fact) module takes C(key=value) pairs or C(key: value) (YAML syntax) and sets those variables.', 'required', 'string']],
      examples: ['- name: Set a fact\n  ansible.builtin.set_fact:\n    app_version: "1.2.3"'],
      readOnly: true
    },
    include_role: {
      short: 'Load and execute a role',
      desc: 'Loads and executes a role as a task, this frees roles from the C(roles) keyword and allows them to be used in the middle of a task list.',
      opts: [
        ['name', 'The name of the role to be executed.', 'required', 'string'],
        ['tasks_from', 'File to load from a role\'s C(tasks/) directory.', 'main', 'string'],
        ['vars_from', 'File to load from a role\'s C(vars/) directory.', 'main', 'string'],
        ['allow_duplicates', 'Overrides the role\'s metadata setting to allow using a role more than once.', 'yes', 'bool']
      ],
      examples: ['- name: Include docker role\n  ansible.builtin.include_role:\n    name: docker'],
      readOnly: false
    },
    import_role: {
      short: 'Import a role into a play',
      desc: 'Much like the C(roles) keyword, this task imports the whole role into the play.',
      opts: [
        ['name', 'The name of the role to be executed.', 'required', 'string'],
        ['tasks_from', 'File to load from a role\'s C(tasks/) directory.', 'main', 'string']
      ],
      examples: ['- name: Import role\n  ansible.builtin.import_role:\n    name: myapp'],
      readOnly: false
    },
    meta: {
      short: 'Execute Ansible "meta" tasks',
      desc: 'Meta tasks are a special kind of task which can influence Ansible internal execution or state.',
      opts: [['_raw_params', 'The meta task to execute: flush_handlers, refresh_inventory, noop, clear_facts, end_play, reset_connection.', 'required', 'string']],
      examples: ['- name: Force handlers\n  ansible.builtin.meta: flush_handlers'],
      readOnly: true
    }
  };
  /* 集合里的模块（教学环境内置文档，供 ansible-doc 演示） */
  ANSIBLE_MODULES['community.general.timezone'] = {
    short: 'Configure timezone setting',
    collection: 'community.general',
    desc: 'This module configures the timezone setting, both of the system clock and of the hardware clock.',
    opts: [
      ['name', 'Name of the timezone.', 'required', 'string'],
      ['hwclock', 'Whether the hardware clock is in UTC or in local time.', 'localtime', 'string']
    ],
    examples: ['- name: Set timezone\n  community.general.timezone:\n    name: Asia/Shanghai'],
    readOnly: false
  };
  ANSIBLE_MODULES['ansible.posix.authorized_key'] = {
    short: 'Adds or removes an SSH authorized key',
    collection: 'ansible.posix',
    desc: 'Adds or removes SSH authorized keys for particular user accounts.',
    opts: [
      ['user', 'The username on the remote host whose authorized_keys file will be modified.', 'required', 'string'],
      ['key', 'The SSH public key(s).', 'required', 'string'],
      ['state', 'Whether the given key should be present or absent.', 'present', 'string'],
      ['exclusive', 'Whether to remove all other non-specified keys.', 'no', 'bool']
    ],
    examples: ['- name: Add key\n  ansible.posix.authorized_key:\n    user: deploy\n    key: "{{ lookup(\'file\', \'files/id_ed25519.pub\') }}"'],
    readOnly: false
  };

  /* ansible-doc -l 用的模块清单（教学环境内置常用模块；真实环境有上千个） */
  var MODULE_LIST = [
    ['ansible.builtin.add_host', 'Add a host (and alternatively a group) to the ansible-playbook in-memory inventory'],
    ['ansible.builtin.apt', 'Manages apt-packages'],
    ['ansible.builtin.apt_repository', 'Add and remove APT repositories'],
    ['ansible.builtin.assert', 'Asserts given expressions are true'],
    ['ansible.builtin.authorized_key', 'Adds or removes an SSH authorized key'],
    ['ansible.builtin.blockinfile', 'Insert/update/remove a text block surrounded by marker lines'],
    ['ansible.builtin.command', 'Execute commands on targets'],
    ['ansible.builtin.copy', 'Copy files to remote locations'],
    ['ansible.builtin.cron', 'Manage cron.d and crontab entries'],
    ['ansible.builtin.debug', 'Print statements during execution'],
    ['ansible.builtin.dnf', 'Manages packages with the I(dnf) package manager'],
    ['ansible.builtin.fail', 'Fail with custom message'],
    ['ansible.builtin.fetch', 'Fetch files from remote nodes'],
    ['ansible.builtin.file', 'Manage files and file properties'],
    ['ansible.builtin.find', 'Return a list of files based on specific criteria'],
    ['ansible.builtin.gather_facts', 'Gathers facts about remote hosts'],
    ['ansible.builtin.get_url', 'Downloads files from HTTP, HTTPS, or FTP to node'],
    ['ansible.builtin.getent', 'A wrapper to the unix getent utility'],
    ['ansible.builtin.git', 'Deploy software (or files) from git checkouts'],
    ['ansible.builtin.group', 'Add or remove groups'],
    ['ansible.builtin.group_by', 'Create Ansible groups based on facts'],
    ['ansible.builtin.hostname', 'Manage hostname'],
    ['ansible.builtin.import_playbook', 'Import a playbook'],
    ['ansible.builtin.import_role', 'Import a role into a play'],
    ['ansible.builtin.import_tasks', 'Import a task list'],
    ['ansible.builtin.include_role', 'Load and execute a role'],
    ['ansible.builtin.include_tasks', 'Dynamically include a task list'],
    ['ansible.builtin.include_vars', 'Load variables from files, dynamically within a task'],
    ['ansible.builtin.iptables', 'Modify iptables rules'],
    ['ansible.builtin.known_hosts', 'Add or remove a host from the C(known_hosts) file'],
    ['ansible.builtin.lineinfile', 'Manage lines in text files'],
    ['ansible.builtin.meta', 'Execute Ansible "meta" tasks'],
    ['ansible.builtin.package', 'Generic OS package manager'],
    ['ansible.builtin.package_facts', 'Package information as facts'],
    ['ansible.builtin.pause', 'Pause playbook execution'],
    ['ansible.builtin.ping', 'Try to connect to host, verify a usable python and return `pong` on success'],
    ['ansible.builtin.pip', 'Manages Python library dependencies'],
    ['ansible.builtin.raw', 'Executes a low-down and dirty command'],
    ['ansible.builtin.reboot', 'Reboot a machine, wait for it to go down, come back up'],
    ['ansible.builtin.replace', 'Replace all instances of a particular string in a file'],
    ['ansible.builtin.rpm_key', 'Adds or removes a gpg key from the rpm db'],
    ['ansible.builtin.script', 'Runs a local script on a remote node after transferring it'],
    ['ansible.builtin.service', 'Manage services'],
    ['ansible.builtin.service_facts', 'Return service state information as fact data'],
    ['ansible.builtin.set_fact', 'Set host variable(s) and fact(s)'],
    ['ansible.builtin.setup', 'Gathers facts about remote hosts'],
    ['ansible.builtin.shell', 'Execute shell commands on targets'],
    ['ansible.builtin.slurp', 'Slurps a file from remote nodes'],
    ['ansible.builtin.stat', 'Retrieve file or file system status'],
    ['ansible.builtin.subversion', 'Deploys a subversion repository'],
    ['ansible.builtin.sysctl', 'Manage entries in sysctl configuration file'],
    ['ansible.builtin.systemd', 'Manage systemd units'],
    ['ansible.builtin.systemd_service', 'Manage systemd units'],
    ['ansible.builtin.tempfile', 'Creates temporary files and directories'],
    ['ansible.builtin.template', 'Template a file out to a target host'],
    ['ansible.builtin.unarchive', 'Unpacks an archive after (optionally) copying it from the local machine'],
    ['ansible.builtin.uri', 'Interacts with webservices'],
    ['ansible.builtin.user', 'Manage user accounts'],
    ['ansible.builtin.wait_for', 'Waits for a condition before continuing'],
    ['ansible.builtin.wait_for_connection', 'Waits until remote system is reachable/usable'],
    ['ansible.builtin.yum', 'Manages packages with the I(yum) package manager'],
    ['ansible.builtin.yum_repository', 'Add or remove YUM repositories'],
    ['ansible.posix.authorized_key', 'Adds or removes an SSH authorized key'],
    ['community.general.timezone', 'Configure timezone setting'],
    ['community.general.ufw', 'Manage firewall with UFW'],
    ['community.general.parted', 'Manage block devices and their partitions'],
    ['community.general.lvol', 'Manage LVM logical volumes'],
    ['community.general.nmcli', 'Manage Networking']
  ];

  /* ansible-config 的配置项（节选常用项，名称与官方一致） */
  var ANSIBLE_CONFIG_ENTRIES = [
    ['CONFIG_FILE', 'defaults', 'Path to the configuration file', 'string', null, '/etc/ansible/ansible.cfg'],
    ['DEFAULT_HOST_LIST', 'defaults', 'Comma separated list of Ansible inventory sources', 'pathspec', 'ANSIBLE_INVENTORY', '/etc/ansible/hosts'],
    ['DEFAULT_REMOTE_USER', 'defaults', 'The remote user as whom Ansible should log in', 'string', 'ANSIBLE_REMOTE_USER', null],
    ['DEFAULT_FORKS', 'defaults', 'Maximum number of forks Ansible will use to execute tasks on target hosts', 'int', 'ANSIBLE_FORKS', '5'],
    ['DEFAULT_TIMEOUT', 'defaults', 'Number of seconds to wait for a connection before giving up', 'int', 'ANSIBLE_TIMEOUT', '10'],
    ['DEFAULT_GATHERING', 'defaults', 'Gathering behaviour: implicit, explicit or smart', 'string', 'ANSIBLE_GATHERING', 'implicit'],
    ['HOST_KEY_CHECKING', 'defaults', 'Set this to false to disable host key checking (a security trade-off)', 'boolean', 'ANSIBLE_HOST_KEY_CHECKING', 'True'],
    ['RETRY_FILES_ENABLED', 'defaults', 'Whether to create a .retry file on failed plays', 'boolean', 'ANSIBLE_RETRY_FILES_ENABLED', 'True'],
    ['DEFAULT_STDOUT_CALLBACK', 'defaults', 'The callback plugin used for standard output', 'string', 'ANSIBLE_STDOUT_CALLBACK', 'default'],
    ['DEFAULT_PRIVATE_KEY_FILE', 'defaults', 'Path to the private key file used for SSH connections', 'path', 'ANSIBLE_PRIVATE_KEY_FILE', null],
    ['DEFAULT_VERBOSITY', 'defaults', 'Verbosity level (-v/-vv/-vvv)', 'int', 'ANSIBLE_VERBOSITY', '0'],
    ['BECOME', 'privilege_escalation', 'Whether to enable privilege escalation by default', 'boolean', 'ANSIBLE_BECOME', 'False'],
    ['BECOME_METHOD', 'privilege_escalation', 'Privilege escalation method (sudo, su, doas...)', 'string', 'ANSIBLE_BECOME_METHOD', 'sudo'],
    ['BECOME_USER', 'privilege_escalation', 'User to become after escalation', 'string', 'ANSIBLE_BECOME_USER', 'root'],
    ['BECOME_ASK_PASS', 'privilege_escalation', 'Ask for the privilege escalation password', 'boolean', 'ANSIBLE_BECOME_ASK_PASS', 'False'],
    ['PIPELINING', 'ssh_connection', 'Pipelining reduces the number of SSH operations required', 'boolean', 'ANSIBLE_PIPELINING', 'False'],
    ['SSH_ARGS', 'ssh_connection', 'Arguments to pass to ssh', 'string', 'ANSIBLE_SSH_ARGS', '-C -o ControlMaster=auto'],
    ['GALAXY_SERVER', 'galaxy', 'The Galaxy server to use when downloading roles and collections', 'string', null, 'https://galaxy.ansible.com'],
    ['GALAXY_SERVER_LIST', 'galaxy', 'List of Galaxy servers to use, in order', 'list', null, null]
  ];

  /* ======================================================================
     10. Ansible：远端事实与模块执行（教学仿真，不做真实 SSH）
     ====================================================================== */
  var HOST_FACTS = {
    '10.0.1.31': { ansible_hostname: 'web-prod-01', ansible_distribution: 'EulerOS', ansible_distribution_version: '2.0 (SP10)', ip: '10.0.1.31', uptime: 'up 14 days, 20:39', load: '0.42, 0.68, 0.71', mem: 'Mem: 7957 4120 1128 128 2708 3240' },
    '10.0.1.32': { ansible_hostname: 'app-prod-01', ansible_distribution: 'EulerOS', ansible_distribution_version: '2.0 (SP10)', ip: '10.0.1.32', uptime: 'up 9 days, 4:02', load: '0.18, 0.24, 0.31', mem: 'Mem: 7957 2980 2210 116 2767 4410' },
    '10.0.2.15': { ansible_hostname: 'db-prod-01', ansible_distribution: 'EulerOS', ansible_distribution_version: '2.0 (SP10)', ip: '10.0.2.15', uptime: 'up 41 days, 7:15', load: '0.05, 0.11, 0.09', mem: 'Mem: 15914 9224 1520 208 5170 6103' }
  };
  function factsFor(host) {
    var f = HOST_FACTS[host] || { ansible_hostname: host.replace(/\./g, '-'), ansible_distribution: 'EulerOS', ansible_distribution_version: '2.0 (SP10)', ip: host, uptime: 'up 3 days, 1:20', load: '0.10, 0.12, 0.15', mem: 'Mem: 7957 2000 3000 100 2957 5600' };
    return {
      ansible_os_family: 'RedHat', ansible_pkg_mgr: 'yum', ansible_service_mgr: 'systemd',
      ansible_distribution: f.ansible_distribution, ansible_distribution_version: f.ansible_distribution_version,
      ansible_hostname: f.ansible_hostname, ansible_fqdn: f.ansible_hostname + '.myhuaweicloud.com',
      ansible_default_ipv4: { address: f.ip, interface: 'eth0', gateway: f.ip.replace(/\.\d+$/, '.1') },
      ansible_processor_vcpus: host === '10.0.2.15' ? 4 : 2,
      ansible_memtotal_mb: host === '10.0.2.15' ? 15914 : 7957,
      ansible_kernel: '5.10.0-60.18.0.50.oe2203.x86_64',
      ansible_python_interpreter: '/usr/bin/python3'
    };
  }
  function hostFactDisplay(host) { return HOST_FACTS[host] || { uptime: 'up 3 days, 1:20', load: '0.10, 0.12, 0.15' }; }

  /* 已知远端命令的仿真输出（只覆盖常见的几条，其余如实说明没有仿真数据） */
  function remoteCommandResult(host, cmd) {
    var f = hostFactDisplay(host), t = trim(cmd);
    var m;
    if ((m = t.match(/^uptime$/))) {
      return { rc: 0, stdout: ' 09:41:02 ' + f.uptime + ',  2 users,  load average: ' + f.load + '\n' };
    }
    if ((m = t.match(/^hostname$/))) return { rc: 0, stdout: (HOST_FACTS[host] || {}).ansible_hostname || host + '\n' };
    if ((m = t.match(/^id$/))) return { rc: 0, stdout: 'uid=1000(deploy) gid=1000(deploy) groups=1000(deploy),10(wheel)\n' };
    if ((m = t.match(/^uname -a$/))) return { rc: 0, stdout: 'Linux ' + ((HOST_FACTS[host] || {}).ansible_hostname || host) + ' 5.10.0-60.18.0.50.oe2203.x86_64 #1 SMP Wed Mar 22 03:16:53 UTC 2023 x86_64 GNU/Linux\n' };
    if ((m = t.match(/^free -m$/))) return { rc: 0, stdout: '              total        used        free\n' + f.mem + '\n' };
    if ((m = t.match(/^df -h\s*\/?$/))) return { rc: 0, stdout: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        40G   12G   26G  32% /\n' };
    if ((m = t.match(/^docker --version$/))) return { rc: 0, stdout: 'Docker version 24.0.7, build afdd53b\n' };
    if ((m = t.match(/^docker ps/))) return { rc: 0, stdout: 'CONTAINER ID   IMAGE                     STATUS         PORTS\na1b2c3d4e5f6   nginx:1.24                Up 14 days     0.0.0.0:80->80/tcp\n' };
    if ((m = t.match(/^java -version$/))) return { rc: 0, stdout: '', stderr: 'openjdk version "1.8.0_382"\nOpenJDK Runtime Environment (build 1.8.0_382-b13)\n' };
    if ((m = t.match(/^(\/usr\/bin\/)?docker --version/))) return { rc: 0, stdout: 'Docker version 24.0.7, build afdd53b\n' };
    if ((m = t.match(/^(systemctl is-active\s+)?(\S+)$/)) && /systemctl is-active/.test(t)) {
      return { rc: 0, stdout: 'active\n' };
    }
    if ((m = t.match(/^\/(usr\/)?bin\/(java|docker|rpm|unzip)\b/))) {
      if (/docker/.test(t)) return { rc: 0, stdout: 'Docker version 24.0.7, build afdd53b\n' };
      if (/rpm/.test(t)) return { rc: 1, stdout: '', stderr: 'package chrony is not installed\n' };
    }
    if ((m = t.match(/^ps -ef \| grep -c/))) return { rc: 0, stdout: '3\n' };
    if ((m = t.match(/^cat \/etc\/motd$/))) return { rc: 0, stdout: '登录本机表示你已获得授权，操作将被审计。\n' };
    return null;
  }

  /* 模块执行（返回 ansible 风格的结果字段） */
  function runModule(mod, args, host, ctx) {
    var facts = factsFor(host), hd = hostFactDisplay(host);
    var name = mod.indexOf('.') === -1 ? 'ansible.builtin.' + mod : mod;
    var res = { changed: false };
    var mutating = ['user', 'group', 'yum', 'apt', 'dnf', 'package', 'copy', 'template', 'file', 'lineinfile', 'systemd', 'systemd_service', 'service', 'cron', 'get_url', 'unarchive', 'hostname', 'raw', 'script', 'pip', 'git', 'sysctl', 'authorized_key', 'community.general.timezone', 'ansible.posix.authorized_key', 'iptables'];
    var shortName = name.replace(/^ansible\.builtin\./, '').replace(/^ansible\.posix\./, '');
    if (shortName === 'ping') {
      return { rc: 0, result: { ansible_facts: { discovered_interpreter_python: facts.ansible_python_interpreter }, changed: false, ping: 'pong' }, changed: false };
    }
    if (shortName === 'setup' || shortName === 'gather_facts') {
      return { rc: 0, result: { ansible_facts: facts, changed: false }, changed: false };
    }
    if (shortName === 'debug') {
      var msg = args.msg !== undefined ? args.msg : (args.var !== undefined ? args.var : 'Hello world!');
      return { rc: 0, result: { msg: String(msg), changed: false }, changed: false };
    }
    if (shortName === 'command' || shortName === 'shell' || shortName === 'raw' || shortName === 'script') {
      var cmd = args.cmd || args._raw_params || args.free_form || '';
      if (args.creates && fileExists(ctx, args.creates)) {
        return { rc: 0, result: { changed: false, rc: 0, stdout: '', stdout_lines: [], skipped: true, msg: 'skipped, since ' + args.creates + ' exists' }, changed: false, skipped: true };
      }
      var out = remoteCommandResult(host, cmd);
      if (!out) {
        return {
          rc: 127, changed: false,
          result: {
            changed: false, rc: 127, stdout: '', stdout_lines: [],
            stderr: NOTE + '教学终端只内置了少量远端命令的仿真输出（uptime / hostname / id / uname -a / free -m / df -h / docker --version / rpm -q ...），这条命令没有仿真数据，不会假装有输出。',
            msg: 'non-zero return code'
          }
        };
      }
      var changed = !(args.changed_when === false || args.changed_when === 'false');
      var r = { changed: changed, rc: out.rc, stdout: out.stdout || '', stdout_lines: String(out.stdout || '').split('\n') };
      if (out.stderr) { r.stderr = out.stderr; r.stderr_lines = String(out.stderr).split('\n'); }
      return { rc: out.rc, result: r, changed: changed };
    }
    if (shortName === 'stat') {
      var p = args.path || args.dest || '';
      var exists = fileExists(ctx, p);
      return { rc: 0, result: { changed: false, stat: { exists: exists, path: p, isdir: dirExists(ctx, p), mode: exists ? '0644' : '0000', size: exists ? 1024 : 0 } }, changed: false };
    }
    if (shortName === 'uri') {
      return { rc: 0, result: { changed: false, status: 200, url: args.url || '', content_length: 2, elapsed: 0.012 }, changed: false };
    }
    if (mutating.indexOf(shortName) !== -1 || mutating.indexOf(name) !== -1) {
      var r2 = { changed: true };
      if (shortName === 'copy' || shortName === 'template') {
        r2.dest = args.dest || '';
        r2.checksum = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4';
        r2.mode = String(args.mode || '0644');
        r2.owner = args.owner || 'root';
        r2.group = args.group || 'root';
        r2.size = 1024;
      } else if (shortName === 'user') {
        r2.name = args.name; r2.state = args.state || 'present'; r2.groups = args.groups || '';
        r2.append = args.append === true || args.append === 'yes';
        r2.shell = args.shell || '/bin/bash';
        r2.comment = ''; r2.home = '/home/' + args.name; r2.uid = args.uid || 1000;
        if (r2.groups && !r2.append) r2.warning = 'groups is not additive, use append=yes to add supplementary groups';
      } else if (shortName === 'group') {
        r2.name = args.name; r2.state = args.state || 'present'; r2.gid = args.gid || 2000;
      } else if (shortName === 'yum' || shortName === 'dnf' || shortName === 'apt' || shortName === 'package') {
        r2.results = [String(args.name || '').split(/\s+/).join(', ') + ' 已是最新版本（教学仿真）'];
        r2.msg = 'Nothing to do. Packages are already installed (教学仿真).';
      } else if (shortName === 'systemd' || shortName === 'systemd_service' || shortName === 'service') {
        r2.name = args.name; r2.state = args.state || 'started'; r2.status = { ActiveState: 'active', UnitFileState: args.enabled ? 'enabled' : 'disabled' };
      } else if (shortName === 'file') {
        r2.path = args.path || args.dest; r2.state = args.state || 'file';
      } else if (shortName === 'lineinfile') {
        r2.path = args.path; r2.line = args.line;
      } else if (shortName === 'hostname') {
        r2.name = args.name;
      } else if (shortName === 'cron') {
        r2.name = args.name; r2.job = args.job;
      }
      return { rc: 0, result: r2, changed: true };
    }
    return { rc: 0, result: { changed: false, msg: NOTE + '教学环境没有 ' + name + ' 的仿真结果，不会假装执行成功。' }, changed: false, unknownModule: true };
  }

  /* ======================================================================
     11. Jinja2 模板子集渲染（{{ var }} / {% for %} / default 过滤器）
     ====================================================================== */
  function renderJinja(text, vars) {
    var out = String(text);
    /* {% for x in coll %} ... {% endfor %} */
    var reFor = /\{%\s*for\s+(\w+)\s+in\s+([^%]+?)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/;
    var guard = 0;
    while (reFor.test(out) && guard++ < 10) {
      out = out.replace(reFor, function (m, item, collExpr, body) {
        var coll = resolveJinjaRef(trim(collExpr), vars);
        if (!coll) return '';
        var arr = Object.prototype.toString.call(coll) === '[object Array]' ? coll : keysOf(coll);
        var buf = '';
        for (var i = 0; i < arr.length; i++) {
          var sub = {};
          for (var k in vars) if (has(vars, k)) sub[k] = vars[k];
          sub[item] = arr[i];
          buf += renderJinja(body, sub);
        }
        return buf;
      });
    }
    out = out.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (m, expr) {
      var v = evalJinjaExpr(trim(expr), vars);
      return v === undefined || v === null ? '' : String(v);
    });
    return out;
  }
  function resolveJinjaRef(expr, vars) {
    var m = expr.match(/^(\w+)(?:\[['"]([^'"]+)['"]\])?$/);
    if (!m) return undefined;
    var v = vars[m[1]];
    if (m[2] !== undefined && v) return v[m[2]];
    return v;
  }
  function evalJinjaExpr(expr, vars) {
    var parts = expr.split('|');
    var base = trim(parts[0]), v;
    if (/^['"].*['"]$/.test(base)) v = base.slice(1, -1);
    else if (/^-?\d+$/.test(base)) v = Number(base);
    else {
      var mm = base.match(/^(\w+)\[['"]([^'"]+)['"]\]$/);
      if (mm) v = (vars[mm[1]] || {})[mm[2]];
      else v = vars[base];
    }
    for (var i = 1; i < parts.length; i++) {
      var f = trim(parts[i]);
      var fm = f.match(/^(\w+)\((.*)\)$/);
      if (!fm) continue;
      var arg = trim(fm[2]).replace(/^['"]|['"]$/g, '');
      if (fm[1] === 'default' && (v === undefined || v === null || v === '')) v = arg;
      if (fm[1] === 'bool') v = !(v === false || v === 'false' || v === 'no' || v === 'False');
    }
    return v;
  }

  /* ======================================================================
     12. ansible（ad-hoc）
     ====================================================================== */
  var ANS_OPTS = {
    '-i': 'value', '--inventory': 'value', '-m': 'value', '--module-name': 'value',
    '-a': 'value', '--args': 'value', '-u': 'value', '--user': 'value',
    '-b': 'bool', '--become': 'bool', '-K': 'bool', '--ask-become-pass': 'bool',
    '-o': 'bool', '-l': 'value', '--limit': 'value', '-e': 'list', '--extra-vars': 'list',
    '-f': 'value', '--forks': 'value', '-T': 'value', '--timeout': 'value',
    '-v': 'bool', '--verbose': 'bool', '--list-hosts': 'bool', '--private-key': 'value',
    '--vault-password-file': 'value', '--vault-id': 'value', '--version': 'bool',
    '-h': 'bool', '--help': 'bool', '-C': 'bool', '--check': 'bool', '-D': 'bool', '--diff': 'bool',
    '-P': 'value', '--poll': 'value', '-B': 'value', '--background': 'value', '--become-user': 'value', '--become-method': 'value'
  };
  function ansOptError(cmd, unknown) {
    return U.fail([
      'usage: ' + cmd + ' [-h] [--version] [-v] [-b] [-i INVENTORY] [-m MODULE_NAME] [-a MODULE_ARGS] host-pattern',
      cmd + ': error: unrecognized arguments: ' + unknown.join(' '),
      '',
      NOTE + '常用选项：-i 清单 -m 模块 -a 参数 -u 远程用户 -b 提权 -o 单行输出 --list-hosts 先看主机。'
    ]);
  }

  function ansibleAdhoc(argv, ctx) {
    var o = parseOpts(argv, ANS_OPTS);
    if (o.unknown.length) return ansOptError('ansible', o.unknown);
    if (o.flags['--version']) return U.ok(['ansible [core 2.15.5]', '  config file = ' + (readText(ctx, ctx.cwd + '/ansible.cfg') !== null ? ctx.cwd + '/ansible.cfg' : 'None'), '  python version = 3.9.9 (教学终端仿真)']);
    if (o.flags['-h'] || o.flags['--help']) {
      return U.ok([
        'usage: ansible <host-pattern> [options]',
        '',
        'Options: -i 清单 -m 模块（默认 command）-a 模块参数 -u 远程用户 -b 提权 -K 询问提权密码',
        '         -o 一行一台 -l 限定主机 -e 额外变量 --list-hosts 只看命中的主机',
        NOTE + 'ad-hoc 适合「看一眼、改一下」；复杂逻辑写 Playbook。'
      ]);
    }
    var pattern = o.pos.length ? o.pos[0] : 'all';
    if (!o.pos.length && !o.flags['--list-hosts']) {
      return U.fail(['ERROR! Missing target hosts', '', 'Usage: ansible <host-pattern> [options]', NOTE + '例如：ansible all -i inventory.ini -m ping']);
    }
    var li = loadInventory(ctx, o.values['-i'] || o.values['--inventory']);
    var inv = li.inv;
    var err = [], warnings = inv.warnings.slice();
    if (o.values['-l'] || o.values['--limit']) {
      var lim = o.values['-l'] || o.values['--limit'];
      var limHits = matchHosts(lim, inv, warnings);
      if (!limHits.length) {
        warnings.push('Specified hosts and/or --limit does not match any hosts');
        pattern = lim;
      } else pattern = lim;
    }
    var hosts = matchHosts(pattern, inv, warnings);
    for (var w = 0; w < warnings.length; w++) err.push('[WARNING]: ' + warnings[w]);
    if (!hosts.length) {
      err.push('[WARNING]: No hosts matched, nothing to do');
      return { out: [], err: err, code: 0 };
    }
    if (o.flags['--list-hosts']) {
      var out = ['', '  hosts (' + hosts.length + '):'];
      for (var i = 0; i < hosts.length; i++) out.push('    ' + hosts[i]);
      return warnOut(out, err, 0);
    }
    if (o.flags['-C'] || o.flags['--check']) {
      return U.fail([
        'ERROR! Ad-hoc commands do not support --check',
        '',
        NOTE + 'ad-hoc 没有干跑能力（只有 Playbook 有 --check）。改配置类操作先在一台上试，成功再全量；',
        '需要干跑就写成 Playbook：ansible-playbook --check --diff。'
      ]);
    }
    var mod = o.values['-m'] || o.values['--module-name'] || 'command';
    var modArgs = o.values['-a'] || o.values['--args'] || '';
    var extra = parseExtraVars(o.values['-e'] || o.values['--extra-vars']);
    var res = runAdhocOnHosts(ctx, inv, hosts, mod, modArgs, extra, o);
    var code = 0;
    for (i = 0; i < res.results.length; i++) if (res.results[i].failed) code = 2;
    return { out: res.out, err: err.concat(res.err), code: code };
  }

  function parseExtraVars(list) {
    var out = {};
    if (!list) return out;
    for (var i = 0; i < list.length; i++) {
      var s = String(list[i]);
      if (trim(s).charAt(0) === '{') {
        try {
          var obj = JSON.parse(s);
          for (var k in obj) if (has(obj, k)) out[k] = obj[k];
          continue;
        } catch (e) { /* 交给下面的 k=v 解析 */ }
      }
      var pairs = s.split(/\s+/);
      for (var p = 0; p < pairs.length; p++) {
        var eq = pairs[p].indexOf('=');
        if (eq > 0) out[pairs[p].slice(0, eq)] = pairs[p].slice(eq + 1);
      }
    }
    return out;
  }

  function parseModuleArgs(raw) {
    var args = {}, t = trim(raw);
    if (t === '') return args;
    if (t.charAt(0) === '{') {
      try { return JSON.parse(t); } catch (e) { /* 继续按 k=v */ }
    }
    var parts = t.split(/\s+/), free = [];
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[i].slice(0, eq))) args[parts[i].slice(0, eq)] = parts[i].slice(eq + 1);
      else free.push(parts[i]);
    }
    if (free.length) args.free_form = free.join(' ');
    if (args.free_form && (args.cmd === undefined)) args.cmd = args.free_form;
    return args;
  }

  function runAdhocOnHosts(ctx, inv, hosts, mod, rawArgs, extra, o) {
    var out = [], err = [], results = [];
    var args = parseModuleArgs(rawArgs);
    if (o.flags['-o']) {
      for (var i = 0; i < hosts.length; i++) {
        var r = runModule(mod, args, hosts[i], ctx);
        var status = r.skipped ? 'SUCCESS' : (r.rc !== 0 ? 'FAILED' : (r.changed ? 'CHANGED' : 'SUCCESS'));
        var line = hosts[i] + ' | ' + status + ' | rc=' + r.rc + ' | (stdout) ' + (r.result.stdout || '');
        if (r.result.stderr) line += ' | (stderr) ' + trim(r.result.stderr);
        out.push(line);
        results.push({ host: hosts[i], failed: r.rc !== 0 });
      }
      return { out: out, err: err, results: results };
    }
    for (i = 0; i < hosts.length; i++) {
      var res = runModule(mod, args, hosts[i], ctx);
      var status2 = res.rc !== 0 ? 'FAILED!' : 'SUCCESS';
      out.push(hosts[i] + ' | ' + status2 + ' => ' + JSON.stringify(res.result, null, 4));
      results.push({ host: hosts[i], failed: res.rc !== 0 });
    }
    if (mod.replace(/^ansible\.builtin\./, '') === 'ping' || mod === 'ping') {
      err.push(NOTE + '-m ping 验证的是「SSH 能登录 + 远端有可用的 Python」，不是 ICMP：');
      err.push('教学环境不做真实 SSH，上面的 pong 是按清单仿真出来的。真机上第一步永远是 ansible all -i inventory.ini -m ping。');
    } else {
      err.push(NOTE + '教学环境不做真实 SSH、不会改远端主机：上面的返回结构按模块语义仿真，用于说明输出格式。');
    }
    return { out: out, err: err, results: results };
  }

  /* ======================================================================
     13. ansible-playbook
     ====================================================================== */
  function ansiblePlaybook(argv, ctx) {
    var o = parseOpts(argv, {
      '-i': 'value', '--inventory': 'value', '--syntax-check': 'bool', '-C': 'bool', '--check': 'bool',
      '-D': 'bool', '--diff': 'bool', '-t': 'value', '--tags': 'value', '--skip-tags': 'value',
      '-l': 'value', '--limit': 'value', '-e': 'list', '--extra-vars': 'list',
      '--vault-password-file': 'value', '--vault-id': 'value', '--list-tasks': 'bool', '--list-hosts': 'bool',
      '--list-tags': 'bool', '-b': 'bool', '--become': 'bool', '-K': 'bool', '--ask-become-pass': 'bool',
      '-v': 'bool', '--verbose': 'bool', '--step': 'bool', '--start-at-task': 'value', '-f': 'value',
      '--forks': 'value', '-u': 'value', '--user': 'value', '--private-key': 'value',
      '--force-handlers': 'bool', '--version': 'bool', '-h': 'bool', '--help': 'bool'
    });
    if (o.unknown.length) return ansOptError('ansible-playbook', o.unknown);
    if (!o.pos.length) {
      return U.fail(['ERROR! You must specify a playbook file to run.', '', NOTE + '用法：ansible-playbook -i inventory.ini site.yml']);
    }
    var file = o.pos[0];
    var abs = U.resolvePath(ctx.cwd, file);
    var text = readText(ctx, abs);
    if (text === null) {
      return U.fail([
        'ERROR! the playbook: ' + file + ' could not be found',
        '',
        NOTE + '本实验的 playbook 在 /data/iac/site.yml 与默认目录 ~ 下（当前目录 ' + ctx.cwd + '）。'
      ]);
    }
    var plays;
    try {
      plays = parseYaml(text);
    } catch (e) {
      return U.fail(['ERROR! Syntax Error while loading YAML.', '  ' + e.message, '', "The error appears to be in '" + file + "'"]);
    }
    if (Object.prototype.toString.call(plays) !== '[object Array]') plays = [plays];
    var syntaxErr = syntaxCheckPlaybook(plays, file);
    if (syntaxErr.length) return U.fail(syntaxErr);
    if (o.flags['--syntax-check']) return U.ok(['playbook: ' + file]);

    var li = loadInventory(ctx, o.values['-i'] || o.values['--inventory']);
    var inv = li.inv;
    var err = [], i, j;
    for (i = 0; i < inv.warnings.length; i++) err.push('[WARNING]: ' + inv.warnings[i]);
    var tags = o.values['-t'] || o.values['--tags'];
    var tagList = tags ? String(tags).split(',') : null;
    var skipTags = o.values['--skip-tags'] ? String(o.values['--skip-tags']).split(',') : null;
    var extra = parseExtraVars(o.values['-e'] || o.values['--extra-vars']);
    var limit = o.values['-l'] || o.values['--limit'];
    var vault = null;
    if (!o.values['--vault-password-file'] && !o.values['--vault-id']) {
      for (i = 0; i < (inv.vaultFiles || []).length; i++) {
        return U.fail([
          'ERROR! Attempting to decrypt but no vault secrets found',
          '',
          NOTE + 'group_vars/all/vault.yml 是 ansible-vault 加密的：执行时必须给密码，',
          '例如 --vault-password-file ~/.vault_pass（CI 里由凭据服务下发这个文件）。'
        ]);
      }
    } else {
      vault = vaultPassFromArgs(ctx, o);
      if (vault.err) return U.fail([vault.err]);
    }
    /* 解密 vault 变量 */
    var vaultVars = {};
    if (vault && vault.pass && inv.vaultFiles) {
      for (i = 0; i < inv.vaultFiles.length; i++) {
        var dec = vaultDecrypt(inv.vaultFiles[i].text, vault.pass);
        if (dec.err) return U.fail(['ERROR! Decryption failed (no vault secrets were found that could decrypt)']);
        var doc = parseYaml(dec.text);
        for (var vk in doc) if (has(doc, vk)) vaultVars[vk] = doc[vk];
      }
    }

    if (o.flags['--list-tasks']) {
      var lt = ['playbook: ' + file, ''];
      for (i = 0; i < plays.length; i++) {
        var pl = plays[i] || {};
        lt.push('  play #' + (i + 1) + ' (' + (pl.hosts || 'all') + '): ' + (pl.name || pl.hosts || 'all') + '\tTAGS: [' + (tagList ? tagList.join(', ') : '') + ']');
        lt.push('    tasks:');
        var tks = pl.tasks || [];
        for (j = 0; j < tks.length; j++) {
          var tk = tks[j] || {};
          lt.push('      ' + (tk.name || moduleNameOf(tk)) + '\tTAGS: [' + (tk.tags ? [].concat(tk.tags).join(', ') : '') + ']');
        }
        if (pl.handlers) {
          lt.push('    handlers:');
          for (j = 0; j < pl.handlers.length; j++) lt.push('      ' + (pl.handlers[j].name || moduleNameOf(pl.handlers[j])));
        }
      }
      return warnOut(lt, err, 0);
    }
    if (o.flags['--list-hosts']) {
      var lh = ['playbook: ' + file, ''];
      for (i = 0; i < plays.length; i++) {
        var pl2 = plays[i] || {};
        lh.push('  play #' + (i + 1) + ' (' + (pl2.hosts || 'all') + '): ' + (pl2.name || pl2.hosts || 'all') + '\tTAGS: []');
        var warns2 = [];
        var hs = matchHosts(pl2.hosts || 'all', inv, warns2);
        if (limit) hs = matchHosts(limit, inv, warns2);
        lh.push("    pattern: ['" + (pl2.hosts || 'all') + "']");
        if (!hs.length) lh.push('    hosts (0):');
        else {
          lh.push('    hosts (' + hs.length + '):');
          for (j = 0; j < hs.length; j++) lh.push('      ' + hs[j]);
        }
        for (j = 0; j < warns2.length; j++) err.push('[WARNING]: ' + warns2[j]);
      }
      return warnOut(lh, err, 0);
    }

    var out = [];
    if (o.flags['-K'] || o.flags['--ask-become-pass']) {
      err.push(NOTE + '-K 会交互式询问提权（sudo）密码，单行教学终端无法输入：这里按「已输入密码」继续演示；');
      err.push('真机上没配 NOPASSWD 时要么输密码，要么让远端 sudoers 放行后加 -K 从 stdin 读。');
    }
    var recap = {};
    for (i = 0; i < plays.length; i++) {
      var play = plays[i] || {};
      var warns = [];
      var hosts = matchHosts(play.hosts || 'all', inv, warns);
      if (limit) hosts = matchHosts(limit, inv, warns);
      for (j = 0; j < warns.length; j++) err.push('[WARNING]: ' + warns[j]);
      out.push('');
      out.push('PLAY [' + (play.name || play.hosts || 'all') + '] ' + repeat('*', Math.max(3, 79 - ('PLAY [' + (play.name || play.hosts || 'all') + '] ').length)));
      if (!hosts.length) {
        out.push('');
        out.push('skipping: no hosts matched');
        err.push(NOTE + '主机模式没命中任何机器：本清单里的主机名就是 IP（' + Object.keys(inv.hosts).slice(0, 3).join('、') + '），');
        err.push('没有叫 web-01 的主机。真机同样只警告不报错；要限定一台请写 -l <清单里的主机名>。');
        continue;
      }
      for (j = 0; j < hosts.length; j++) recap[hosts[j]] = recap[hosts[j]] || { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, rescued: 0, ignored: 0 };
      var playVars = play.vars || {};
      var gather = play.gather_facts === false ? false : true;
      if (gather) {
        out.push('');
        out.push('TASK [Gathering Facts] ' + repeat('*', Math.max(3, 76 - 'TASK [Gathering Facts] '.length)));
        for (j = 0; j < hosts.length; j++) { out.push('ok: [' + hosts[j] + ']'); recap[hosts[j]].ok++; }
      }
      var notified = [];
      var tasks = play.tasks || [];
      if (play.roles) {
        err.push(NOTE + 'play 里的 roles: 是静态引入（先于 tasks 执行）：教学环境不解析角色目录内容，只按顺序占位。');
        for (j = 0; j < play.roles.length; j++) {
          var rn = typeof play.roles[j] === 'string' ? play.roles[j] : (play.roles[j].role || play.roles[j].name);
          out.push('');
          out.push('TASK [' + rn + ' : ' + rn + '] ' + repeat('*', 20));
          for (var h = 0; h < hosts.length; h++) { out.push('ok: [' + hosts[h] + ']'); recap[hosts[h]].ok++; }
        }
      }
      runTaskList(ctx, out, err, tasks, hosts, inv, playVars, extra, vaultVars, tagList, skipTags, o, recap, notified);
      if (notified.length) {
        var handlers = play.handlers || [];
        for (j = 0; j < notified.length; j++) {
          var hname = notified[j], hd = null;
          for (var hh = 0; hh < handlers.length; hh++) if ((handlers[hh].name || '') === hname) hd = handlers[hh];
          out.push('');
          out.push('RUNNING HANDLER [' + hname + '] ' + repeat('*', Math.max(3, 76 - ('RUNNING HANDLER [' + hname + '] ').length)));
          if (!hd) { out.push('skipping: handler not found'); continue; }
          for (var hx = 0; hx < hosts.length; hx++) { out.push('changed: [' + hosts[hx] + ']'); recap[hosts[hx]].changed++; }
        }
      }
    }
    out.push('');
    out.push('PLAY RECAP ' + repeat('*', 68));
    var hostNames = keysOf(recap);
    var pad = 26;
    for (i = 0; i < hostNames.length; i++) {
      var rc = recap[hostNames[i]];
      out.push(padEnd(hostNames[i], pad) + ' : ok=' + rc.ok + '    changed=' + rc.changed + '    unreachable=' + rc.unreachable +
        '    failed=' + rc.failed + '    skipped=' + rc.skipped + '    rescued=' + rc.rescued + '    ignored=' + rc.ignored);
    }
    err.push(NOTE + '教学环境不做真实 SSH、不改远端主机：任务结果按模块语义与 when 条件仿真；');
    err.push('playbook 的 YAML 结构、tags/limit/extra-vars 过滤、handler 触发顺序都是真的。');
    var code = 0;
    for (i = 0; i < hostNames.length; i++) if (recap[hostNames[i]].failed) code = 2;
    return { out: out, err: err, code: code };
  }

  function moduleNameOf(task) {
    var keys = Object.keys(task || {});
    for (var i = 0; i < keys.length; i++) {
      if (['name', 'tags', 'when', 'register', 'notify', 'become', 'become_user', 'loop', 'with_items', 'vars', 'changed_when', 'failed_when', 'ignore_errors', 'args', 'until', 'retries', 'delay', 'no_log', 'delegate_to', 'run_once', 'check_mode', 'loop_control', 'listen'].indexOf(keys[i]) === -1 &&
          (keys[i].indexOf('ansible.') === 0 || keys[i].indexOf('community.') === 0 || /^[a-z_]+$/.test(keys[i]))) {
        return keys[i];
      }
    }
    return '(unknown)';
  }

  function syntaxCheckPlaybook(plays, file) {
    for (var i = 0; i < plays.length; i++) {
      var p = plays[i];
      if (!p || typeof p !== 'object') {
        return ['ERROR! A play must be a dictionary, not a ' + (typeof p) + '.', '', "The error appears to be in '" + file + "', play #" + (i + 1) + '.'];
      }
      if (!p.hosts && !p.import_playbook) {
        return ['ERROR! the field \'hosts\' is required but was not set', '', "The error appears to be in '" + file + "', play #" + (i + 1) + '.'];
      }
      var tasks = p.tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        var t = tasks[j];
        if (!t || typeof t !== 'object') return ['ERROR! A malformed block was encountered while loading a block', '', "The error appears to be in '" + file + "', play #" + (i + 1) + ', task #' + (j + 1) + '.'];
        var name = moduleNameOf(t);
        if (name === '(unknown)') {
          return ['ERROR! no module/action detected in task.', '', "The error appears to be in '" + file + "', task '" + (t.name || ('#' + (j + 1))) + "'."];
        }
        var short = name.replace(/^ansible\.builtin\./, '').replace(/^ansible\.posix\./, '').replace(/^community\.general\./, '');
        if (!has(ANSIBLE_MODULES, short) && !has(ANSIBLE_MODULES, name)) {
          return [
            'ERROR! couldn\'t resolve module/action \'' + name + '\'. This often indicates a misspelling, missing collection, or incorrect module path.',
            '',
            "The error appears to be in '" + file + "', task '" + (t.name || ('#' + (j + 1))) + "'.",
            NOTE + '集合里的模块要先 ansible-galaxy collection install 才认得，Playbook 里要写全限定名。'
          ];
        }
      }
    }
    return [];
  }

  function runTaskList(ctx, out, err, tasks, hosts, inv, playVars, extra, vaultVars, tagList, skipTags, o, recap, notified) {
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i] || {};
      var taskTags = task.tags ? [].concat(task.tags).map(String) : [];
      if (tagList && !taskTags.some(function (t) { return tagList.indexOf(t) !== -1; })) continue;
      if (skipTags && taskTags.some(function (t) { return skipTags.indexOf(t) !== -1; })) continue;
      var name = task.name || moduleNameOf(task);
      out.push('');
      out.push('TASK [' + name + '] ' + repeat('*', Math.max(3, 76 - ('TASK [' + name + '] ').length)));
      var modName = moduleNameOf(task);
      var args = task[modName];
      if (args === undefined) args = {};
      if (typeof args === 'string') args = { free_form: args, cmd: args, _raw_params: args };
      if (!args || typeof args !== 'object') args = {};
      if (task.args && typeof task.args === 'object') {
        for (var ak in task.args) if (has(task.args, ak)) args[ak] = task.args[ak];
      }
      var loops = task.loop || task.with_items;
      var short = modName.replace(/^ansible\.builtin\./, '').replace(/^ansible\.posix\./, '');
      if (['command', 'shell', 'raw', 'script'].indexOf(short) !== -1 && o.flags['-C']) {
        for (var s = 0; s < hosts.length; s++) { out.push('skipping: [' + hosts[s] + ']'); recap[hosts[s]].skipped++; }
        if (!err.__cmdNote) {
          err.__cmdNote = true;
          err.push(NOTE + '--check 干跑时 command/shell 默认被跳过：它们没法判断「会不会变更」，');
          err.push('检查通过 ≠ 真跑没问题。要强制执行得给任务加 check_mode: false。');
        }
        continue;
      }
      for (var h = 0; h < hosts.length; h++) {
        var host = hosts[h];
        var vars = hostVars(inv, host, extra, factsFor(host));
        for (var pk in playVars) if (has(playVars, pk)) vars[pk] = playVars[pk];
        for (var vk in vaultVars) if (has(vaultVars, vk)) vars[vk] = vaultVars[vk];
        if (task.vars) for (var tvk in task.vars) if (has(task.vars, tvk)) vars[tvk] = tvk.value === undefined ? task.vars[tvk] : task.vars[tvk];
        var whenOk = true;
        if (task.when) {
          var conds = [].concat(task.when);
          for (var c = 0; c < conds.length; c++) {
            var verdict = evalWhen(String(conds[c]), vars);
            if (verdict === null) {
              if (!err.__whenNote) {
                err.__whenNote = true;
                err.push(NOTE + '教学环境只解析简单的 when 表达式（形如 var == "x"、var | default(false) | bool）；');
                err.push('未识别的条件按 true 处理，真机请以 ansible-playbook --check 的结果为准。');
              }
            } else if (!verdict) whenOk = false;
          }
        }
        if (!whenOk) { out.push('skipping: [' + host + ']'); recap[host].skipped++; continue; }
        var items = loops ? [].concat(loops) : [null];
        for (var it = 0; it < items.length; it++) {
          var one = {};
          for (var kk in args) if (has(args, kk)) one[kk] = args[kk];
          if (items[it] !== null) {
            if (items[it] && typeof items[it] === 'object') { for (var ik in items[it]) if (has(items[it], ik)) one[ik] = items[it][ik]; }
            one.item = items[it];
          }
          var res = runModule(modName, one, host, ctx);
          if (res.skipped) { out.push('ok: [' + host + ']'); recap[host].ok++; continue; }
          if (short === 'template' && o.flags['-D']) {
            var dest = one.dest || '';
            var srcText = readText(ctx, U.resolvePath(ctx.cwd, one.src || ''));
            var rendered = srcText === null ? null : renderJinja(srcText, vars);
            if (rendered !== null && dest) {
              var before = readText(ctx, dest);
              out = out.concat(diffLines(dest, before === null ? '' : before, rendered));
            }
          } else if (short === 'copy' && o.flags['-D'] && one.content !== undefined) {
            var before2 = readText(ctx, one.dest || '');
            out = out.concat(diffLines(one.dest || '', before2 === null ? '' : before2, String(one.content)));
          }
          if (res.rc !== 0) {
            out.push('fatal: [' + host + ']: FAILED! => ' + JSON.stringify(res.result, null, 4));
            recap[host].failed++;
            continue;
          }
          if (short === 'debug') {
            out.push('ok: [' + host + '] => ' + JSON.stringify(res.result, null, 4));
            recap[host].ok++;
            continue;
          }
          var changed = res.changed && one.changed_when !== false && one.changed_when !== 'false';
          if (one.changed_when === false || one.changed_when === 'false') changed = false;
          if (changed && o.flags['-C']) {
            /* 干跑：会变更的任务报 changed（这正是 --check 的用途） */
          }
          out.push((changed ? 'changed' : 'ok') + ': [' + host + ']');
          if (changed) recap[host].changed++; else recap[host].ok++;
          if (changed && task.notify) {
            var nlist = [].concat(task.notify);
            for (var n = 0; n < nlist.length; n++) if (notified.indexOf(String(nlist[n])) === -1) notified.push(String(nlist[n]));
          }
        }
      }
    }
  }

  function diffLines(dest, before, after) {
    var b = String(before).split('\n'), a = String(after).split('\n');
    var out = ['--- before: ' + dest, '+++ after: ' + dest];
    var max = Math.max(b.length, a.length), i;
    var first = -1;
    for (i = 0; i < max; i++) if (b[i] !== a[i]) { first = i; break; }
    if (first < 0) return out.concat(['@@ -0,0 +1,0 @@']);
    out.push('@@ -' + (first + 1) + ',' + Math.max(1, b.length - first) + ' +' + (first + 1) + ',' + Math.max(1, a.length - first) + ' @@');
    for (i = first; i < max; i++) {
      if (b[i] === a[i]) { if (b[i] !== undefined && i < first + 6) out.push(' ' + b[i]); continue; }
      if (b[i] !== undefined && i < first + 12) out.push('-' + b[i]);
      if (a[i] !== undefined && i < first + 12) out.push('+' + a[i]);
    }
    return out;
  }

  function evalWhen(expr, vars) {
    var e = trim(expr);
    if (e === '') return true;
    if (e === 'true' || e === 'yes') return true;
    if (e === 'false' || e === 'no') return false;
    var not = false;
    if (/^not\s+/.test(e)) { not = true; e = trim(e.replace(/^not\s+/, '')); }
    var m = e.match(/^([A-Za-z_][A-Za-z0-9_.]*)(\s*\|[^=!<>]*)?\s*(==|!=)\s*['"]?([^'"]*)['"]?$/);
    if (m) {
      var v = resolveWhenVar(m[1], vars);
      if (m[3] === '==') {
        var eq = String(v) === m[4];
        return not ? !eq : eq;
      }
      var ne = String(v) !== m[4];
      return not ? !ne : ne;
    }
    var m2 = e.match(/^([A-Za-z_][A-Za-z0-9_.]*)(\s*\|[^=!<>]*)?$/);
    if (m2) {
      var val = resolveWhenVar(m2[1], vars);
      var filt = m2[2] || '';
      if (/default\(/.test(filt) && (val === undefined || val === null)) {
        var dm = filt.match(/default\(([^)]*)\)/);
        val = dm ? dm[1].replace(/['"]/g, '') : true;
      }
      if (/\|\s*bool/.test(filt)) val = !(val === false || val === 'false' || val === 'no' || val === 'False' || val === undefined || val === null);
      var t = truthy(val);
      return not ? !t : t;
    }
    var m3 = e.match(/^(.+?)\s+(not\s+)?in\s+\[(.*)\]$/);
    if (m3) {
      var needle = String(resolveWhenVar(trim(m3[1]), vars));
      var hay = splitTop(m3[3], ',').map(function (x) { return trim(x).replace(/['"]/g, ''); });
      var inn = hay.indexOf(needle) !== -1;
      return m3[2] ? !inn : inn;
    }
    return null;
  }
  function resolveWhenVar(name, vars) {
    if (has(vars, name)) return vars[name];
    var parts = name.split('.');
    var v = vars[parts[0]];
    for (var i = 1; i < parts.length && v !== undefined; i++) v = v[parts[i]];
    return v;
  }

  /* ======================================================================
     14. ansible-vault
     ====================================================================== */
  function ansibleVault(argv, ctx) {
    var o = parseOpts(argv, {
      '--vault-password-file': 'value', '--vault-id': 'value', '--new-vault-password-file': 'value',
      '--name': 'value', '--stdin': 'bool', '--output': 'value', '--encrypt-vault-id': 'value',
      '-h': 'bool', '--help': 'bool'
    });
    if (o.unknown.length) return ansOptError('ansible-vault', o.unknown);
    var sub = o.pos[0] || '';
    var target = o.pos[1];
    var pass = vaultPassFromArgs(ctx, o);
    if (!sub || o.flags['-h'] || o.flags['--help']) {
      return U.ok([
        'usage: ansible-vault [-h] [--vault-password-file VAULT_PASSWORD_FILES] {encrypt,decrypt,edit,view,create,encrypt_string,rekey} ...',
        '',
        'Commands: encrypt / decrypt / edit / view / create / encrypt_string / rekey',
        NOTE + '密码文件 ~/.vault_pass 权限要 600 且不要提交 Git；decrypt 会明文落盘，改内容一律用 edit。'
      ]);
    }
    if (sub === 'encrypt_string') {
      var payload = target !== undefined ? target : (o.flags['--stdin'] ? '（stdin）' : '');
      if (target === undefined && !o.flags['--stdin']) {
        return U.fail(['ERROR! enroll requires a string to encrypt', '', 'Usage: ansible-vault encrypt_string \'secret\' --name \'var_name\'', NOTE + '要加密的字符串用单引号包起来，避免被 shell 吃掉特殊字符。']);
      }
      if (pass.err) return U.fail([pass.err]);
      var enc = vaultEncrypt(payload, pass.pass);
      var body = enc.replace(VAULT_HEADER + '\n', '').replace(/\n+$/, '').split('\n');
      var indent = '          ';
      var out = [];
      if (o.values['--name']) {
        out.push(o.values['--name'] + ': !vault |');
      } else {
        out.push('!vault |');
      }
      out.push(indent + VAULT_HEADER);
      for (var i = 0; i < body.length; i++) out.push(indent + body[i]);
      out.push('');
      out.push(NOTE + '教学环境用可逆的本地混淆演示 vault 的文件格式（真实 ansible-vault 是 AES256，需要密码才能解）；');
      out.push('生成的加密块可以直接贴进 YAML，缩进要与所在层级一致。');
      return U.ok(out);
    }
    if (!target) {
      return U.fail(['ERROR! The following required arguments were not provided: vault_file', '', 'Usage: ansible-vault ' + sub + ' <file>']);
    }
    var abs = U.resolvePath(ctx.cwd, target);
    var text = readText(ctx, abs);
    if (text === null) {
      if (sub === 'create') return U.fail(['ERROR! The interactive editor is not available in this teaching terminal.', NOTE + 'create 会打开编辑器写新文件；请用 copy/content 或 ansible-vault encrypt 处理已有文件。']);
      return U.fail(['ERROR! The file ' + abs + ' does not exist', '', NOTE + '路径写错或文件不在当前目录；本实验的加密变量文件是 group_vars/all/vault.yml。']);
    }
    if (sub === 'encrypt') {
      if (isVaultText(text)) return U.fail(['ERROR! input is already encrypted', '', NOTE + '已经是加密文件了；要改内容用 ansible-vault edit。']);
      if (pass.err) return U.fail([pass.err]);
      writeText(ctx, abs, vaultEncrypt(text, pass.pass));
      return U.ok(['Encryption successful', '', NOTE + '文件已被整体加密（教学环境为可逆混淆，真实为 AES256）：加密后可以放心提交 Git。']);
    }
    if (sub === 'decrypt') {
      if (!isVaultText(text)) return U.fail(['ERROR! input is not encrypted']);
      if (pass.err) return U.fail([pass.err]);
      var d = vaultDecrypt(text, pass.pass);
      if (d.err) return U.fail(['ERROR! Decryption failed']);
      var outp = o.values['--output'];
      if (outp) { writeText(ctx, U.resolvePath(ctx.cwd, outp), d.text); return U.ok(['Decryption successful', '', NOTE + '已解密到 ' + outp + '（明文落盘，改内容请优先用 edit）。']); }
      writeText(ctx, abs, d.text);
      return U.ok(['Decryption successful', '', NOTE + 'decrypt 会把明文写到磁盘，误提交就前功尽弃：日常改内容一律用 ansible-vault edit。']);
    }
    if (sub === 'view') {
      if (!isVaultText(text)) return U.ok(U.splitLines(text));
      if (pass.err) return U.fail([pass.err]);
      var dv = vaultDecrypt(text, pass.pass);
      if (dv.err) return U.fail(['ERROR! Decryption failed']);
      return U.ok(U.splitLines(dv.text));
    }
    if (sub === 'edit') {
      var cur = text;
      if (isVaultText(text)) {
        if (pass.err) return U.fail([pass.err]);
        var de = vaultDecrypt(text, pass.pass);
        if (de.err) return U.fail(['ERROR! Decryption failed']);
        cur = de.text;
      }
      return U.ok([
        NOTE + '教学终端没有交互式编辑器，edit 无法进入 vim：下面是这个文件当前的内容（真实环境会在编辑器里改，',
        '保存后自动重新加密，明文不落盘）。',
        ''
      ].concat(U.splitLines(cur)));
    }
    if (sub === 'create') {
      return U.ok([NOTE + '教学终端没有交互式编辑器，create 无法输入内容。']);
    }
    if (sub === 'rekey') {
      var np = o.values['--new-vault-password-file'];
      if (!np) {
        return U.fail([
          'ERROR! The following required arguments were not provided: --new-vault-password-file',
          '',
          NOTE + 'rekey 会交互式询问新密码；无人值守时用 --new-vault-password-file 指定新密码文件。'
        ]);
      }
      if (!isVaultText(text)) return U.fail(['ERROR! input is not encrypted']);
      if (pass.err) return U.fail([pass.err]);
      var oldText = vaultDecrypt(text, pass.pass);
      if (oldText.err) return U.fail(['ERROR! Decryption failed']);
      var npAbs = U.resolvePath(ctx.cwd, np);
      var npText = readText(ctx, npAbs);
      if (npText === null) return U.fail(['ERROR! The vault password file ' + npAbs + ' was not found']);
      writeText(ctx, abs, vaultEncrypt(oldText.text, String(npText).split('\n')[0]));
      return U.ok(['Rekey successful', '', NOTE + '密码换好后记得同步更新 CI / 凭据服务里的密码文件。']);
    }
    return U.fail(['ERROR! Invalid vault command: ' + sub]);
  }

  /* ======================================================================
     15. ansible-doc
     ====================================================================== */
  function ansibleDoc(argv, ctx) {
    var o = parseOpts(argv, {
      '-l': 'bool', '--list': 'bool', '-s': 'bool', '--snippet': 'bool', '-F': 'value', '--filter': 'value',
      '-t': 'value', '--type': 'value', '-M': 'value', '-j': 'bool', '--json': 'bool', '-h': 'bool', '--help': 'bool'
    });
    if (o.unknown.length) return ansOptError('ansible-doc', o.unknown);
    var type = o.values['-t'] || o.values['--type'] || 'module';
    if (o.flags['-l'] || o.flags['--list']) {
      var out = [], i;
      var w = 0;
      for (i = 0; i < MODULE_LIST.length; i++) w = Math.max(w, MODULE_LIST[i][0].length);
      for (i = 0; i < MODULE_LIST.length; i++) out.push(padEnd(MODULE_LIST[i][0], w + 2) + MODULE_LIST[i][1]);
      out.push('');
      out.push(NOTE + '教学环境内置了 ' + MODULE_LIST.length + ' 个常用模块的文档（真机上是本机已安装的全部模块，上千个）。');
      return U.ok(out);
    }
    if (o.values['-F'] || o.values['--filter']) {
      var kw = String(o.values['-F'] || o.values['--filter']).toLowerCase();
      var hits = [];
      for (i = 0; i < MODULE_LIST.length; i++) if (MODULE_LIST[i][0].toLowerCase().indexOf(kw) !== -1 || MODULE_LIST[i][1].toLowerCase().indexOf(kw) !== -1) hits.push(MODULE_LIST[i]);
      if (!hits.length) return U.fail(['ERROR! No modules found matching the keyword: ' + kw]);
      var w2 = 0;
      for (i = 0; i < hits.length; i++) w2 = Math.max(w2, hits[i][0].length);
      return U.ok(hits.map(function (h) { return padEnd(h[0], w2 + 2) + h[1]; }));
    }
    if (type === 'become') {
      var plugin = o.pos[0] || '';
      if (plugin !== 'sudo') {
        return U.fail(['ERROR! Cannot find a plugin, become: ' + (plugin || '(none)'), '', NOTE + '教学环境内置的 become 插件文档只有 sudo（其它如 su/doas/pbrun 参数不同）。']);
      }
      return U.ok([
        '> SUDO    (' + '/usr/lib/python3/dist-packages/ansible/plugins/become/sudo.py' + ')',
        '',
        '        This become plugins allows your remote/login user to execute commands as',
        '        another user via the sudo utility.',
        '',
        'OPTIONS (= is mandatory):',
        '',
        '- become_exe',
        '        Sudo executable',
        '        [Default: sudo]',
        '        type: string',
        '',
        '- become_flags',
        '        Options to pass to sudo',
        '        [Default: -H -S -n]',
        '        type: string',
        '',
        '- become_user',
        '        User you \'become\' to execute the task',
        '        [Default: root]',
        '        type: string',
        '',
        '- prompt',
        '        List of prompts expected before the password is entered',
        '        [Default: [sudo] password for]',
        '        type: list',
        '',
        NOTE + 'sudoers 里没配 NOPASSWD 时，必须用 -K 提供密码，否则任务会卡在密码提示直到超时。'
      ]);
    }
    if (type !== 'module') {
      return U.fail(['ERROR! Cannot find a plugin, ' + type + ': ' + (o.pos[0] || ''), '', NOTE + '教学环境只内置了 become/sudo 的插件文档示例。']);
    }
    var name = o.pos[0] || '';
    if (!name) {
      return U.fail([
        'ERROR! Missing module name',
        '',
        'Usage: ansible-doc [-l|-F] [--type TYPE] [-s] [module...]',
        NOTE + '不带参数只会报这个错；列出全部模块用 ansible-doc -l（很长，接 grep）。'
      ]);
    }
    var mod = lookupModule(name);
    if (!mod) {
      return U.fail([
        'ERROR! module ' + name + ' not found in configured module paths',
        '',
        NOTE + '模块名要写对（如 copy、yum、ansible.builtin.copy）；集合里的模块要先 ansible-galaxy collection install 才查得到。'
      ]);
    }
    if (o.flags['-s'] || o.flags['--snippet']) {
      var sn = ['', '- name: ' + snipTitle(name, mod), '  ' + (mod.fqcn || name) + ':'];
      for (var s = 0; s < mod.opts.length; s++) sn.push('      ' + mod.opts[s][0] + ':');
      return U.ok(sn);
    }
    var doc = [
      '',
      '> ' + (mod.fqcn || name).toUpperCase() + '    (/usr/lib/python3/dist-packages/ansible/modules/' + ((mod.fqcn || name).split('.').pop()) + '.py)',
      '',
      '        ' + mod.short,
      '',
      'DESCRIPTION:',
      '      ' + mod.desc,
      '',
      'OPTIONS (= is mandatory):',
      ''
    ];
    for (var i2 = 0; i2 < mod.opts.length; i2++) {
      var op = mod.opts[i2];
      var head = (op[2] === 'required' ? '= ' : '- ') + op[0];
      doc.push(head);
      var lines = wrapText(op[1], 72);
      for (var l = 0; l < lines.length; l++) doc.push('        ' + lines[l]);
      if (op[2] && op[2] !== 'required') doc.push('        [Default: ' + op[2] + ']');
      if (op[2] === 'required') doc.push('        (required)');
      doc.push('        type: ' + op[3]);
      doc.push('');
    }
    doc.push('EXAMPLES:');
    doc.push('');
    var exs = mod.examples || [];
    for (var e = 0; e < exs.length; e++) {
      var elines = String(exs[e]).split('\n');
      for (var el = 0; el < elines.length; el++) doc.push('  ' + elines[el]);
    }
    doc.push('');
    doc.push(NOTE + 'ansible-doc 反映的是本机安装的版本，与官网文档可能不一致，现场排障以本机为准。');
    return U.ok(doc);
  }

  function snipTitle(name, mod) {
    var n = (mod.fqcn || name).replace(/^ansible\.builtin\./, '');
    var titles = {
      copy: 'Copy files to remote locations', yum: 'Manages packages with the I(yum) package manager',
      template: 'Template a file out to a target host', file: 'Manage files and file properties',
      user: 'Manage user accounts', systemd: 'Manage systemd units', lineinfile: 'Manage lines in text files',
      command: 'Execute commands on targets', shell: 'Execute shell commands on targets'
    };
    return titles[n] || mod.short;
  }
  function wrapText(text, width) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      if ((cur + ' ' + words[i]).length > width) { lines.push(cur); cur = words[i]; }
      else cur = cur === '' ? words[i] : cur + ' ' + words[i];
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function lookupModule(name) {
    var n = String(name);
    if (has(ANSIBLE_MODULES, n)) return mkMod(n);
    var short = n.indexOf('.') === -1 ? n : n.split('.').pop();
    if (has(ANSIBLE_MODULES, short)) return mkMod(short);
    if (has(ANSIBLE_MODULES, 'ansible.builtin.' + short)) return mkMod('ansible.builtin.' + short);
    if (has(ANSIBLE_MODULES, 'ansible.posix.' + short)) return mkMod('ansible.posix.' + short);
    if (has(ANSIBLE_MODULES, 'community.general.' + short)) return mkMod('community.general.' + short);
    return null;
  }
  function mkMod(key) {
    var m = ANSIBLE_MODULES[key];
    var out = { short: m.short, desc: m.desc, opts: m.opts, examples: m.examples, readOnly: m.readOnly };
    out.fqcn = key.indexOf('.') === -1 ? 'ansible.builtin.' + key : key;
    if (m.collection) out.fqcn = key;
    return out;
  }

  /* ======================================================================
     16. ansible-galaxy
     ====================================================================== */
  function ansibleGalaxy(argv, ctx) {
    var o = parseOpts(argv, {
      '-r': 'value', '--role-file': 'value', '-p': 'value', '--roles-path': 'value', '-f': 'bool', '--force': 'bool',
      '--version': 'bool', '--force-with-deps': 'bool', '-c': 'bool', '--ignore-certs': 'bool',
      '-s': 'value', '--server': 'value', '-h': 'bool', '--help': 'bool', '--no-deps': 'bool'
    });
    if (o.unknown.length) return ansOptError('ansible-galaxy', o.unknown);
    if (o.flags['--version']) return U.ok(['ansible-galaxy [core 2.15.5]']);
    var sub = o.pos[0] || '';
    var sub2 = o.pos[1] || '';
    var name = o.pos[2] || '';
    if (sub === 'init') {
      var target = sub2;
      if (!target) return U.fail(['ERROR! Invalid role name. The name must be a valid directory path', '', 'Usage: ansible-galaxy init <role-name>']);
      var abs = U.resolvePath(ctx.cwd, target);
      if (dirExists(ctx, abs) && !o.flags['-f'] && !o.flags['--force']) {
        return U.fail([
          'ERROR! The directory ' + target + ' already exists.',
          '',
          'Use --force to overwrite the existing role',
          NOTE + '角色已存在：要么换个名字，要么 --force 覆盖（覆盖会丢掉你自己改过的 tasks）。'
        ]);
      }
      var files = {
        'README.md': '# ' + U.baseName(abs) + '\n\n角色说明：写清楚这个角色做什么、有哪些变量。\n',
        'defaults/main.yml': '---\n# defaults file for ' + U.baseName(abs) + '\n',
        'files/.gitkeep': '',
        'handlers/main.yml': '---\n# handlers file for ' + U.baseName(abs) + '\n',
        'meta/main.yml': 'galaxy_info:\n  author: your name\n  description: your role description\n  license: license (GPL-2.0-or-later, MIT, etc)\n  min_ansible_version: "2.15"\n  platforms:\n    - name: EulerOS\n      versions:\n        - all\ndependencies: []\n',
        'tasks/main.yml': '---\n# tasks file for ' + U.baseName(abs) + '\n',
        'templates/.gitkeep': '',
        'tests/inventory': 'localhost\n',
        'tests/test.yml': '---\n- hosts: localhost\n  remote_user: root\n  roles:\n    - ' + U.baseName(abs) + '\n',
        'vars/main.yml': '---\n# vars file for ' + U.baseName(abs) + '\n'
      };
      mkdirp(ctx, abs);
      for (var f in files) if (has(files, f)) writeText(ctx, abs + '/' + f, files[f]);
      return U.ok([
        '- Role ' + target + ' was created successfully',
        '',
        NOTE + '已经真的建出标准骨架：tasks / handlers / templates / files / defaults / vars / meta —— 目录名要与',
        'roles: 里引用的名字一致；能改的参数放 defaults/main.yml，别放 vars/main.yml（后者外部覆盖不了）。'
      ]);
    }
    if (sub === 'role' || sub === 'roles' || sub === 'collection' || sub === 'collections') {
      var kind = sub.indexOf('collection') === 0 ? 'collection' : 'role';
      var action = sub2;
      if (action === 'list' || action === 'list') {
        var base = o.values['-p'] || o.values['--roles-path'] || (kind === 'role' ? ctx.cwd + '/roles' : '/root/.ansible/collections');
        var names = listNames(ctx, base);
        if (!names.length) return U.ok(['# ' + base + ' contains no ' + kind + 's']);
        var ol = ['# ' + base];
        for (var i = 0; i < names.length; i++) {
          var rn = realNode(ctx, base + '/' + names[i]);
          if (!isDir(rn.node)) continue;
          ol.push('- ' + names[i] + ' (unknown version)');
        }
        return U.ok(ol);
      }
      if (action !== 'install' && action !== 'remove' && action !== 'delete') {
        return U.fail(['ERROR! Invalid action "' + (action || '') + '" for ansible-galaxy ' + sub, '', NOTE + 'role/collection 支持 init / install / list / remove；老写法 ansible-galaxy install <角色> 现在统一成 ansible-galaxy role install。']);
      }
      if (action === 'remove' || action === 'delete') {
        var rname = name || o.pos[2];
        if (!rname) return U.fail(['ERROR! The following required arguments were not provided: role_name']);
        return U.ok([
          '- removing ' + rname + ' ... ' + (kind === 'role' ? 'roles' : 'collections'),
          '- successfully removed ' + rname,
          '',
          NOTE + (kind === 'role' ? '角色已从安装目录删除（改动随代码提交时删除的是仓库里的 roles/ 目录）。' : '集合已从安装目录删除。')
        ]);
      }
      var reqFile = o.values['-r'] || o.values['--role-file'];
      var out = [];
      if (reqFile) {
        var rp = U.resolvePath(ctx.cwd, reqFile);
        var rtext = readText(ctx, rp);
        if (rtext === null) {
          return U.fail([
            'ERROR! - the requirements file \'' + reqFile + '\' does not exist',
            '',
            NOTE + '批量安装要先有 requirements.yml（本实验在 /data/iac 与默认目录 ~ 下）。'
          ]);
        }
        var doc = parseYaml(rtext);
        out.push('Starting galaxy ' + kind + ' install process');
        var list = (kind === 'role' ? doc.roles : doc.collections) || [];
        for (i = 0; i < list.length; i++) {
          var item = list[i] || {};
          var nm = item.name || (typeof list[i] === 'string' ? list[i] : '');
          var ver = item.version || '';
          if (kind === 'role') {
            out.push('- downloading role \'' + String(nm).split('.').pop() + '\', owned by ' + String(nm).split('.')[0]);
            out.push('- downloading role from https://github.com/' + String(nm).split('.')[0] + '/ansible-role-' + String(nm).split('.').pop() + '/archive/' + (ver || 'master') + '.tar.gz');
            out.push('- extracting ' + nm + ' to ' + (o.values['-p'] || 'roles') + '/' + nm);
            out.push('- ' + nm + ' (' + (ver || 'master') + ') was installed successfully');
          } else {
            out.push('Installing \'' + nm + ':' + (ver || 'latest') + '\' to \'/root/.ansible/collections/ansible_collections/' + String(nm).split('.').join('/') + '\'');
            out.push(nm + ':' + (ver || 'latest') + ' was installed successfully');
          }
        }
      } else {
        var single = name || o.pos[1];
        if (!single) {
          return U.fail(['ERROR! The following required arguments were not provided: ' + kind + '_name', '', 'Usage: ansible-galaxy ' + kind + ' install <name> [-p path]']);
        }
        out.push('Starting galaxy ' + kind + ' install process');
        out.push('Process install dependency map');
        if (kind === 'role') {
          out.push('- downloading role \'' + String(single).split('.').pop() + '\', owned by ' + String(single).split('.')[0]);
          out.push('- ' + single + ' was installed successfully');
        } else {
          out.push('Installing \'' + single + ':latest\' to \'/root/.ansible/collections/ansible_collections/' + String(single).split('.').join('/') + '\'');
          out.push(single + ':latest was installed successfully');
        }
      }
      out.push('');
      out.push(NOTE + '教学环境不联网：上面是真实 ansible-galaxy 会打印的过程，这里**没有真的下载**任何角色/集合文件。');
      out.push('真实环境从公网 Galaxy 装角色等于把第三方代码引进生产：requirements.yml 里锁死版本，');
      out.push('国内直连超时的话在 ansible.cfg 的 [galaxy] server_list 指向内网镜像，或用 git+https 从内部仓库装。');
      return U.ok(out);
    }
    if (!sub) {
      return U.fail(['usage: ansible-galaxy [-h] [--version] TYPE NAME ...', '', 'Valid TYPE actions: role, collection', NOTE + '常用：ansible-galaxy init roles/nginx / role install -r requirements.yml -p roles/']);
    }
    return U.fail(['ERROR! Invalid type "' + sub + '" for ansible-galaxy', '', NOTE + 'TYPE 只能是 role 或 collection（老写法 ansible-galaxy install 已被 role install 取代）。']);
  }

  /* ======================================================================
     17. ansible-inventory
     ====================================================================== */
  function ansibleInventory(argv, ctx) {
    var o = parseOpts(argv, {
      '-i': 'list', '--inventory': 'list', '--graph': 'bool', '--list': 'bool', '--host': 'value',
      '--yaml': 'bool', '--export': 'bool', '--toml': 'bool', '--playbook-dir': 'value',
      '--vault-password-file': 'value', '--vault-id': 'value', '-h': 'bool', '--help': 'bool'
    });
    if (o.unknown.length) return ansOptError('ansible-inventory', o.unknown);
    var iSpec = o.values['-i'] || o.values['--inventory'];
    var li = loadInventory(ctx, iSpec ? iSpec.join(',') : null);
    var inv = li.inv;
    var err = [], i, j;
    for (i = 0; i < inv.warnings.length; i++) err.push('[WARNING]: ' + inv.warnings[i]);
    var vaultVars = {};
    if (inv.vaultFiles && inv.vaultFiles.length) {
      var vp = vaultPassFromArgs(ctx, o);
      if (vp.err) {
        err.push('[WARNING]: ' + (inv.vaultFiles[0].kind === 'group' ? 'group_vars' : 'host_vars') + ' 里的加密文件未能解密（' + trim(vp.err.replace('ERROR! ', '')) + '）');
      } else {
        for (i = 0; i < inv.vaultFiles.length; i++) {
          var dec = vaultDecrypt(inv.vaultFiles[i].text, vp.pass);
          if (dec.err) { err.push('[WARNING]: Decryption failed for ' + inv.vaultFiles[i].name); continue; }
          var doc = parseYaml(dec.text);
          for (var vk in doc) if (has(doc, vk)) vaultVars[vk] = doc[vk];
        }
      }
    }
    if (o.values['--host'] !== undefined) {
      var host = o.values['--host'];
      if (!has(inv.hosts, host)) {
        err.push('[WARNING]: Could not match supplied host pattern, ignoring: ' + host);
        return warnOut([JSON.stringify({}, null, 4)], err, 0);
      }
      var hv = hostVars(inv, host, vaultVars, null);
      var rh = inv.hosts[host];
      for (var rk in rh.vars) if (has(rh.vars, rk)) hv[rk] = rh.vars[rk];
      return warnOut([JSON.stringify(hv, null, 4)], err, 0);
    }
    var groupNames = ['all'];
    for (i = 0; i < inv.groupOrder.length; i++) if (inv.groupOrder[i] !== 'all' && groupNames.indexOf(inv.groupOrder[i]) === -1) groupNames.push(inv.groupOrder[i]);
    if (groupNames.indexOf('ungrouped') === -1) groupNames.push('ungrouped');
    var ungrouped = [];
    for (var hn in inv.hosts) {
      if (!has(inv.hosts, hn)) continue;
      if (!inv.hosts[hn].groups.length) ungrouped.push(hn);
    }
    if (o.flags['--graph']) {
      var out = ['@all:'];
      out.push('  |--@ungrouped:');
      for (i = 0; i < ungrouped.length; i++) out.push('  |  |--' + ungrouped[i]);
      for (i = 0; i < inv.groupOrder.length; i++) {
        var g = inv.groups[inv.groupOrder[i]];
        if (g.name === 'all' || g.name === 'ungrouped') continue;
        out.push('  |--@' + g.name + ':');
        var gh = g.hosts.slice().sort();
        for (j = 0; j < gh.length; j++) out.push('  |  |--' + gh[j]);
        var ch = g.children.slice().sort();
        for (j = 0; j < ch.length; j++) out.push('  |  |--@' + ch[j] + ':');
      }
      if (inv.dynamicNote) {
        err.push(NOTE + '教学终端不连华为云 API：这份 huaweicloud.yml 是等价的静态 YAML 清单，分组维度与');
        err.push('华为云官方 hwc_ecs 动态清单一致（region / availability_zone / vpc_id / security_group / 标签）。');
        err.push('真实环境用 hwc_ecs.py + hwc_ecs.ini（或集合里的 inventory 插件）按标签自动拉取 ECS，凭据走 ANSIBLE_HWC_* 环境变量。');
      }
      return warnOut(out, err, 0);
    }
    var data = { _meta: { hostvars: {} } };
    for (hn in inv.hosts) {
      if (!has(inv.hosts, hn)) continue;
      var all = hostVars(inv, hn, vaultVars, null);
      var rh2 = inv.hosts[hn];
      for (var rk2 in rh2.vars) if (has(rh2.vars, rk2)) all[rk2] = rh2.vars[rk2];
      if (!o.flags['--export']) {
        for (var fk in factsFor(hn)) if (has(factsFor(hn), fk)) all[fk] = factsFor(hn)[fk];
      }
      data._meta.hostvars[hn] = all;
    }
    data.all = { children: groupNames.filter(function (x) { return x !== 'all'; }) };
    if (ungrouped.length) data.ungrouped = { hosts: ungrouped.sort() };
    for (i = 0; i < inv.groupOrder.length; i++) {
      var g2 = inv.groups[inv.groupOrder[i]];
      if (g2.name === 'all') continue;
      var node = {};
      if (g2.hosts.length) node.hosts = g2.hosts.slice().sort();
      if (g2.children.length) node.children = g2.children.slice().sort();
      var gv = keysOf(g2.vars);
      if (gv.length) {
        node.vars = {};
        for (j = 0; j < gv.length; j++) node.vars[gv[j]] = g2.vars[gv[j]];
      }
      data[g2.name] = node;
    }
    if (o.flags['--yaml']) {
      return warnOut(yamlDump(data).split('\n'), err, 0);
    }
    return warnOut(JSON.stringify(data, null, 4).split('\n'), err, 0);
  }

  function yamlDump(v, indent) {
    indent = indent || '';
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return /[:#\-{}\[\],&*?|>'"%@`]/.test(v) || v === '' ? hclQuote(v) : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    var i;
    if (Object.prototype.toString.call(v) === '[object Array]') {
      if (!v.length) return '[]';
      var lines = [];
      for (i = 0; i < v.length; i++) {
        var item = yamlDump(v[i], indent + '  ');
        lines.push(indent + '- ' + (item.indexOf('\n') === -1 ? item : '\n' + item));
      }
      return lines.join('\n');
    }
    var ks = keysOf(v);
    if (!ks.length) return '{}';
    var out = [];
    for (i = 0; i < ks.length; i++) {
      var val = v[ks[i]];
      var rendered = yamlDump(val, indent + '  ');
      if (val !== null && typeof val === 'object' && keysOf(val).length && Object.prototype.toString.call(val) !== '[object Array]' && !(Object.prototype.toString.call(val) === '[object Array]' && val.length)) {
        out.push(indent + ks[i] + ':' + (Object.prototype.toString.call(val) === '[object Array]' ? '' : '\n' + rendered));
      } else if (Object.prototype.toString.call(val) === '[object Array]') {
        out.push(indent + ks[i] + ':' + (val.length ? '\n' + rendered : ' []'));
      } else {
        out.push(indent + ks[i] + ': ' + rendered);
      }
    }
    return out.join('\n');
  }

  /* ======================================================================
     18. ansible-config
     ====================================================================== */
  function ansibleConfig(argv, ctx) {
    var o = parseOpts(argv, {
      '-c': 'value', '--config-file': 'value', '--only-changed': 'bool', '-t': 'list', '--type': 'list',
      '--disabled': 'bool', '--enabled': 'bool', '-h': 'bool', '--help': 'bool', '-d': 'bool', '--diff': 'bool'
    });
    if (o.unknown.length) return ansOptError('ansible-config', o.unknown);
    var sub = o.pos[0] || '';
    var cfgPath = o.values['-c'] || o.values['--config-file'];
    var abs = cfgPath ? U.resolvePath(ctx.cwd, cfgPath) : (readText(ctx, ctx.cwd + '/ansible.cfg') !== null ? ctx.cwd + '/ansible.cfg' : null);
    var cfgText = abs ? readText(ctx, abs) : null;
    var parsed = { defaults: {}, privilege_escalation: {}, ssh_connection: {}, galaxy: {} };
    if (cfgText) parsed = parseAnsibleCfg(cfgText);
    if (sub === 'view') {
      if (!cfgText) return U.ok(['# 没有找到生效的 ansible.cfg（当前目录 ' + ctx.cwd + ' 下没有，~/.ansible.cfg 与 /etc/ansible/ansible.cfg 也不存在）',
        NOTE + '查找顺序：ANSIBLE_CONFIG 指定的文件 → 当前工作目录 → ~/.ansible.cfg → /etc/ansible/ansible.cfg，先找到的生效。']);
      return U.ok(U.splitLines(cfgText));
    }
    if (sub === 'dump') {
      var lines = ['CONFIG_FILE() = ' + (abs || 'None')];
      if (abs) {
        lines.push('DEFAULT_HOST_LIST(' + abs + ') = ' + renderCfgValue(parsed.defaults.inventory === undefined ? null : [parsed.defaults.inventory]));
        lines.push('DEFAULT_FORKS(' + abs + ') = ' + (parsed.defaults.forks === undefined ? '5' : parsed.defaults.forks));
        lines.push('DEFAULT_TIMEOUT(' + abs + ') = ' + (parsed.defaults.timeout === undefined ? '10' : parsed.defaults.timeout));
      }
      for (var i = 0; i < ANSIBLE_CONFIG_ENTRIES.length; i++) {
        var ent = ANSIBLE_CONFIG_ENTRIES[i];
        var sec = parsed[ent[1]] || {};
        var key = ent[0].toLowerCase().replace(/^default_/, '').replace(/^become_/, 'become_').replace(/^pipelining$/, 'pipelining');
        var iniKey = iniKeyOf(ent);
        var fromFile = has(sec, iniKey);
        if (o.flags['--only-changed'] && !fromFile) continue;
        var val = fromFile ? sec[iniKey] : ent[5];
        var src = fromFile ? abs : 'default';
        lines.push(ent[0] + '(' + src + ') = ' + renderCfgValue(val));
      }
      return U.ok(lines);
    }
    if (sub === 'init') {
      /* ⚠️ configTemplate() 返回的是**行数组**，不是一整串文本。
         早先这里写 `tpl.split('\n')` —— 数组没有 split 方法，整条命令直接抛
         `tpl.split is not a function`，学员看到的是"引擎抛异常"而不是配置模板。
         （`ansible-config init --disabled -t all > ansible.cfg` 正是 site 里的示例。） */
      var tpl = configTemplate(o.flags['--disabled']);
      return { out: tpl, err: [NOTE + '教学环境输出的是常用配置项的注释模板（真机 -t all 会打印全部上千项）；'], code: 0 };
    }
    if (sub === 'list' || sub === '') {
      var outLines = [];
      var wantTypes = o.values['-t'] || o.values['--type'];
      for (i = 0; i < ANSIBLE_CONFIG_ENTRIES.length; i++) {
        var e2 = ANSIBLE_CONFIG_ENTRIES[i];
        if (wantTypes && wantTypes.length && wantTypes.indexOf(e2[1]) === -1) continue;
        var sec2 = parsed[e2[1]] || {};
        var ik = iniKeyOf(e2);
        var changed = has(sec2, ik);
        if (o.flags['--only-changed'] && !changed) continue;
        outLines.push(e2[0] + ':');
        outLines.push('  default: ' + (e2[5] === null ? 'null' : e2[5]));
        outLines.push('  description: ' + e2[2]);
        if (e2[4]) {
          outLines.push('  env:');
          outLines.push('  - name: ' + e2[4]);
        }
        outLines.push('  ini:');
        outLines.push('  - key: ' + ik);
        outLines.push('    section: ' + e2[1]);
        outLines.push('  name: ' + e2[2].replace(/\.$/, ''));
        outLines.push('  type: ' + e2[3]);
        if (changed) outLines.push('  # 当前值来自 ' + abs + '：' + sec2[ik]);
        outLines.push('');
      }
      if (!outLines.length) outLines.push('# 没有匹配的配置项');
      return U.ok(outLines);
    }
    return U.fail(['usage: ansible-config [-h] [--version] {list,dump,view,init} ...', '', 'Invalid action "' + sub + '"', NOTE + '支持 list / dump / view / init（dump --only-changed 最快看出环境差异）。']);
  }

  function iniKeyOf(ent) {
    var map = {
      DEFAULT_HOST_LIST: 'inventory', DEFAULT_REMOTE_USER: 'remote_user', DEFAULT_FORKS: 'forks',
      DEFAULT_TIMEOUT: 'timeout', DEFAULT_GATHERING: 'gathering', HOST_KEY_CHECKING: 'host_key_checking',
      RETRY_FILES_ENABLED: 'retry_files_enabled', DEFAULT_STDOUT_CALLBACK: 'stdout_callback',
      DEFAULT_PRIVATE_KEY_FILE: 'private_key_file', DEFAULT_VERBOSITY: 'verbosity',
      BECOME: 'become', BECOME_METHOD: 'become_method', BECOME_USER: 'become_user', BECOME_ASK_PASS: 'become_ask_pass',
      PIPELINING: 'pipelining', SSH_ARGS: 'ssh_args', GALAXY_SERVER: 'server', GALAXY_SERVER_LIST: 'server_list'
    };
    return map[ent[0]] || ent[0].toLowerCase();
  }
  function renderCfgValue(v) {
    if (v === null || v === undefined) return 'None';
    if (Object.prototype.toString.call(v) === '[object Array]') return '[' + v.map(function (x) { return hclQuote(x); }).join(', ') + ']';
    if (v === 'True' || v === 'False') return v;
    if (String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'false') return v === 'true' || v === 'True' ? 'True' : 'False';
    if (/^\d+$/.test(String(v))) return String(v);
    return hclQuote(String(v));
  }
  function parseAnsibleCfg(text) {
    var out = {}, section = '';
    var lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = trim(stripComment(lines[i]));
      if (line === '') continue;
      var sec = line.match(/^\[([^\]]+)\]$/);
      if (sec) { section = trim(sec[1]); out[section] = out[section] || {}; continue; }
      var eq = line.indexOf('=');
      if (eq < 0 || section === '') continue;
      out[section][trim(line.slice(0, eq))] = trim(line.slice(eq + 1));
    }
    return out;
  }
  function configTemplate(disabled) {
    var head = [
      '# config file for ansible -- https://ansible.com/',
      '# ===============================================',
      '',
      '# nearly all parameters can be overridden in ansible-playbook',
      '# or with command line flags. ansible will read ANSIBLE_CONFIG,',
      '# ansible.cfg in the current working directory, .ansible.cfg in',
      '# the home directory or /etc/ansible/ansible.cfg, whichever it',
      '# finds first',
      ''
    ];
    var body = [
      '[defaults]',
      '',
      '# some basic default values...',
      '#inventory      = /etc/ansible/hosts',
      '#remote_user    = root',
      '#forks          = 5',
      '#timeout        = 10',
      '#gathering      = implicit',
      '#host_key_checking = True',
      '#retry_files_enabled = False',
      '#stdout_callback = default',
      '#private_key_file = /path/to/file',
      '#verbosity      = 0',
      '',
      '[privilege_escalation]',
      '#become          = False',
      '#become_method   = sudo',
      '#become_user     = root',
      '#become_ask_pass = False',
      '',
      '[ssh_connection]',
      '#pipelining = False',
      '#ssh_args = -C -o ControlMaster=auto -o ControlPersist=60s',
      '',
      '[galaxy]',
      '#server_list = release_galaxy',
      '',
      '[galaxy_server.release_galaxy]',
      '#url = https://galaxy.ansible.com/'
    ];
    return head.concat(body.map(function (l) {
      if (!disabled) return l.charAt(0) === '#' ? l.slice(1) : l;
      return l.indexOf('#') === 0 ? l : (l === '' ? l : '# ' + l);
    }));
  }

  /* --------------------------------------------------------------------------
     命令注册。
     注意：这一段是**事后重建**的 —— 原文件（约 6900 行）在并行写入时被截断，
     丢失的正好是文件末尾的 `CC_SHELL.extend({...})`。上面 190 个函数都还在，
     所以这里按入口函数名把命令重新挂回引擎；如发现某个子命令不再响应，
     先看它对应的入口函数是否在上面（`grep -n "^  function "` 可列全）。
     -------------------------------------------------------------------------- */
  window.CC_SHELL.extend({
    'terraform': function (argv, ctx, stdin, HOST) { return terraformCmd(argv, ctx, stdin, HOST); },
    'ansible': function (argv, ctx, stdin, HOST) { return ansibleAdhoc(argv, ctx, stdin, HOST); },
    'ansible-playbook': function (argv, ctx, stdin, HOST) { return ansiblePlaybook(argv, ctx, stdin, HOST); },
    'ansible-vault': function (argv, ctx, stdin, HOST) { return ansibleVault(argv, ctx, stdin, HOST); },
    'ansible-doc': function (argv, ctx, stdin, HOST) { return ansibleDoc(argv, ctx, stdin, HOST); },
    'ansible-galaxy': function (argv, ctx, stdin, HOST) { return ansibleGalaxy(argv, ctx, stdin, HOST); },
    'ansible-inventory': function (argv, ctx, stdin, HOST) { return ansibleInventory(argv, ctx, stdin, HOST); },
    'ansible-config': function (argv, ctx, stdin, HOST) { return ansibleConfig(argv, ctx, stdin, HOST); }
  });
})();
