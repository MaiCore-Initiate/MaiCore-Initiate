

# MCStart 部署模版开发文档 V2.0

---

## 目录

- [1. 概述](#1-概述)
  - [1.1 什么是 MCStart 部署模版](#11-什么是-mcstart-部署模版)
  - [1.2 模版能做什么](#12-模版能做什么)
  - [1.3 模版生命周期](#13-模版生命周期)
- [2. 快速开始](#2-快速开始)
  - [2.1 最小可运行模版](#21-最小可运行模版)
  - [2.2 文件组织结构](#22-文件组织结构)
- [3. 模版文件结构总览](#3-模版文件结构总览)
- [4. 区块详解](#4-区块详解)
  - [4.1 \[MCStart\] — 模版标识](#41-mcstart--模版标识)
  - [4.2 \[MODINFO\] — 模版元信息](#42-modinfo--模版元信息)
  - [4.3 \[COMPONENTS\] 与 \[\[Component\]\] — 组件管理](#43-components-与-component--组件管理)
    - [4.3.1 \[COMPONENTS\] 区块字段](#431-components-区块字段)
    - [4.3.2 \[\[Component\]\] 基础信息与安装选择模块](#432-component-基础信息与安装选择模块)
    - [4.3.3 版本检查模块](#433-版本检查模块)
    - [4.3.4 获取方式模块](#434-获取方式模块)
    - [4.3.5 版本选择模块](#435-版本选择模块)
    - [4.3.6 版本号格式化模块](#436-版本号格式化模块)
    - [4.3.7 安装方式模块](#437-安装方式模块)
    - [4.3.8 安装路径模块](#438-安装路径模块)
    - [4.3.9 命令行安装模块](#439-命令行安装模块)
    - [4.3.10 安装前/后命令模块](#4310-安装前后命令模块)
    - [4.3.11 链接拼接模块](#4311-链接拼接模块)
    - [4.3.12 环境变量导入/导出模块](#4312-环境变量导入导出模块)
  - [4.4 \[DEPLOY\] 与 \[\[Deployment\]\] — 部署管理](#44-deploy-与-deployment--部署管理)
    - [4.4.1 \[DEPLOY\] 区块字段](#441-deploy-区块字段)
    - [4.4.2 \[\[Deployment\]\] 基础信息](#442-deployment-基础信息)
    - [4.4.3 部署方式模块](#443-部署方式模块)
    - [4.4.4 获取方式与版本选择模块](#444-获取方式与版本选择模块)
    - [4.4.5 部署路径模块](#445-部署路径模块)
    - [4.4.6 命令行部署模块](#446-命令行部署模块)
    - [4.4.7 部署前/后命令模块](#447-部署前后命令模块)
    - [4.4.8 链接拼接模块](#448-链接拼接模块)
    - [4.4.9 环境变量导入/导出模块](#449-环境变量导入导出模块)
  - [4.5 \[LAUNCH\] 与 \[\[LaunchItem\]\] — 启动管理](#45-launch-与-launchitem--启动管理)
    - [4.5.1 \[LAUNCH\] 区块字段](#451-launch-区块字段)
    - [4.5.2 \[\[LaunchItem\]\] 字段](#452-launchitem-字段)
  - [4.6 \[CONFIG\] 与 \[\[ConfigItem\]\] — 配置管理](#46-config-与-configitem--配置管理)
    - [4.6.1 \[CONFIG\] 区块字段](#461-config-区块字段)
    - [4.6.2 \[\[ConfigItem\]\] 字段](#462-configitem-字段)
  - [4.7 \[UNINSTALL\] 与 \[\[UninstallItem\]\] — 卸载管理](#47-uninstall-与-uninstallitem--卸载管理)
    - [4.7.1 \[UNINSTALL\] 区块字段](#471-uninstall-区块字段)
    - [4.7.2 \[\[UninstallItem\]\] 字段](#472-uninstallitem-字段)
- [5. 占位符系统](#5-占位符系统)
  - [5.1 静态引用 `{{key|路径}}`](#51-静态引用-key路径)
    - [5.1.1 路径语法](#511-路径语法)
    - [5.1.2 定位规则](#512-定位规则)
    - [5.1.3 类型输出规则](#513-类型输出规则)
    - [5.1.4 完整示例](#514-完整示例)
    - [5.1.5 边界情况](#515-边界情况)
  - [5.2 动态引用（运行时占位符）](#52-动态引用运行时占位符)
  - [5.3 跨文件引用 `{{file_key|文件名.键}}`](#53-跨文件引用-file_key文件名键)
  - [5.4 两套机制的区别与选用](#54-两套机制的区别与选用)
- [6. 环境变量导入导出机制](#6-环境变量导入导出机制)
  - [6.1 导出（env\_output）](#61-导出env_output)
  - [6.2 导入（env\_input）](#62-导入env_input)
  - [6.3 作用域与执行顺序](#63-作用域与执行顺序)
  - [6.4 完整数据流示例](#64-完整数据流示例)
  - [6.5 自动导出用户输入](#65-自动导出用户输入)
- [7. 路径变量参考](#7-路径变量参考)
- [8. 版本获取与格式化](#8-版本获取与格式化)
  - [8.1 版本获取方式](#81-版本获取方式)
  - [8.2 版本号格式化](#82-版本号格式化)
  - [8.3 版本选择与 choose\_list](#83-版本选择与-choose_list)
- [9. 执行流程](#9-执行流程)
  - [9.1 总体执行顺序](#91-总体执行顺序)
  - [9.2 组件安装流程](#92-组件安装流程)
  - [9.3 部署流程](#93-部署流程)
  - [9.4 启动流程](#94-启动流程)
  - [9.5 配置流程](#95-配置流程)
  - [9.6 卸载流程](#96-卸载流程)
- [10. 完整字段速查表](#10-完整字段速查表)
- [11. FAQ](#11-faq)

---

## 1. 概述

### 1.1 什么是 MCStart 部署模版

MCStart 部署模版是一个基于 **TOML** 格式编写的声明式配置文件，用于描述一个软件项目从「组件安装 → 源码/物料部署 → 启动运行 → 配置编辑」的完整生命周期。模版文件的扩展名为 `.toml`。

MCStart 引擎读取该模版后，会按照模版中声明的流程自动或半自动地完成所有步骤，实现「一键部署」，并在需要时按实例安全卸载。

### 1.2 模版能做什么

| 能力 | 说明 |
|------|------|
| **组件安装** | 自动下载并安装 Python、SQLiteStudio 等运行时依赖 |
| **版本管理** | 从 GitHub Release、文件链接或自定义脚本获取版本号，支持用户选择版本 |
| **源码部署** | 通过 Git Clone 或下载压缩包的方式部署项目源码 |
| **环境搭建** | 自动创建虚拟环境、安装依赖、复制配置文件模板 |
| **启动管理** | 按顺序启动多个服务，支持用户选择性启动 |
| **配置编辑** | 自动打开配置文件供用户编辑，优先使用 VSCode |
| **安全卸载** | 按实例恢复上下文，删除部署目录、运行时状态和模板托管组件 |
| **变量传递** | 通过环境变量导入/导出机制实现跨阶段的数据传递 |

### 1.3 模版生命周期

```
注册 → 解析 → 组件安装 → 部署 → 启动 → 配置 → 卸载
```

每个阶段都可以独立存在，也可以组合使用。模版至少需要包含 `[MCStart]` 和 `[MODINFO]` 区块才能被 MCStart 识别和注册。卸载阶段始终基于已存在的实例运行，用于回收部署结果而不是参与完整部署流程。

---

## 2. 快速开始

### 2.1 最小可运行模版

以下是一个最小的合法模版，它仅声明了标识和元信息：

```toml
[MCStart]
MCStart = true

[MODINFO]
author = "YourGitHubUsername"
tags = ["example"]
description = "我的第一个部署模版"
mod_id = "YourGitHubUsername.MyFirstMod"
mod_name = "我的第一个模组"
version = "1.0.0"
min_version = ""
max_version = ""
file_import = false
file_import_list = []
runtime = "powershell"
platforms = ["windows"]
schema_version = "2.0"
```

### 2.2 文件组织结构

```
my-mod/
├── my-mod.toml              # 模版主文件
├── example.txt              # （可选）需要导入的附属文件
├── version.json             # （可选）需要导入的附属文件
└── GetVersion.ps1           # （可选）需要导入的附属文件
```

当 `file_import = true` 时，`file_import_list` 中声明的文件必须与模版文件位于同一目录下。

---

## 3. 模版文件结构总览

一个完整的模版包含以下区块，按出现顺序排列：

```
[MCStart]              ← 模版标识（必须）
[MODINFO]              ← 模版元信息（必须）
[COMPONENTS]           ← 组件管理区块级配置（可选）
  [[Component]]        ← 组件定义（可重复，可选）
  [[Component]]
  ...
[DEPLOY]               ← 部署管理区块级配置（可选）
  [[Deployment]]       ← 部署项定义（可重复，可选）
  [[Deployment]]
  ...
[LAUNCH]               ← 启动管理区块级配置（可选）
  [[LaunchItem]]       ← 启动项定义（可重复，可选）
  [[LaunchItem]]
  ...
[CONFIG]               ← 配置管理区块级配置（可选）
  [[ConfigItem]]       ← 配置项定义（可重复，可选）
  [[ConfigItem]]
  ...
[UNINSTALL]            ← 卸载管理区块级配置（可选）
  [[UninstallItem]]    ← 卸载项定义（可重复，可选）
  [[UninstallItem]]
  ...
```

> **约定**：`[SectionName]` 是 TOML 的普通表（table），`[[SectionName]]` 是 TOML 的表数组（array of tables），每个 `[[SectionName]]` 块代表数组中的一个元素。

---

## 4. 区块详解

### 4.1 [MCStart] — 模版标识

此区块是模版的入口标识。缺少此区块或 `MCStart` 字段不为 `true` 时，MCStart 将无法识别和注册该模版。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `MCStart` | Boolean | **是** | 必须为 `true`，标记此文件为 MCStart 模版 |

```toml
[MCStart]
MCStart = true
```

---

### 4.2 [MODINFO] — 模版元信息

此区块包含模版的注册信息、版本约束、运行环境声明和文件导入配置。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `author` | String | **是** | — | 模版作者名称 |
| `tags` | Array\[String\] | **是** | — | 模版标签，用于搜索和分类 |
| `description` | String | **是** | — | 模版描述文本 |
| `mod_id` | String | **是** | — | 模版唯一 ID，格式：`GitHub用户名.模组名称`，建议驼峰命名法 |
| `mod_name` | String | **是** | — | 模版显示名称 |
| `version` | String | **是** | — | 模版版本号（建议 SemVer 格式） |
| `min_version` | String | 否 | `""` | MCStart 最低支持版本，为空不限制 |
| `max_version` | String | 否 | `""` | MCStart 最高支持版本，为空不限制 |
| `file_import` | Boolean | **是** | — | 是否启用文件导入功能 |
| `file_import_list` | Array\[String\] | 条件必填 | `[]` | 需要导入的文件列表，仅当 `file_import = true` 时需要提供 |
| `runtime` | String | **是** | — | 模版运行时环境，见下表 |
| `platforms` | Array\[String\] | **是** | — | 平台限制，为空数组时不限制平台 |
| `schema_version` | String | **是** | — | 模版格式版本号 |

#### runtime 可选值

| 值 | 说明 |
|----|------|
| `"powershell"` | Windows PowerShell |
| `"cmd"` | Windows 命令提示符 |
| `"bash"` | Bash（Linux/macOS 原生，Windows 需安装 Git Bash） |
| `"python3"` | Python 3 脚本 |

#### platforms 可选值

| 值 | 说明 |
|----|------|
| `"windows"` | Microsoft Windows |
| `"linux"` | Linux 发行版 |
| `"macos"` | Apple macOS |

#### 文件导入功能

当 `file_import = true` 时，MCStart 会将 `file_import_list` 中声明的文件导入，并将每个文件的实际路径以 `{{file_path|文件名}}` 的格式作为占位符供模版中的命令使用。

```toml
[MODINFO]
file_import = true
file_import_list = [
    "example.txt",
    "version.json",
    "GetVersion.ps1"
]
```

导入后可用的占位符：
- `{{file_path|example.txt}}` → 该文件的实际绝对路径
- `{{file_path|version.json}}` → 该文件的实际绝对路径
- `{{file_path|GetVersion.ps1}}` → 该文件的实际绝对路径

---

### 4.3 [COMPONENTS] 与 [[Component]] — 组件管理

组件管理负责声明模版依赖的外部软件（如 Python、数据库工具等），并定义它们的检查、下载、安装流程。

#### 4.3.1 [COMPONENTS] 区块字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | **是** | 是否启用组件模块的环境变量导出功能 |
| `env_input` | Boolean | **是** | 是否启用组件模块的环境变量导入功能 |
| `list` | Array\[String\] | **是** | 组件 ID 列表，决定安装顺序。用户可选择安装其中部分组件 |

```toml
[COMPONENTS]
env_output = false
env_input = false
list = ["python3-12-8", "SQLiteStudio"]
```

> `list` 中的每个字符串必须对应一个 `[[Component]]` 块的 `id` 字段。

---

#### 4.3.2 [[Component]] 基础信息与安装选择模块

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | String | **是** | 组件显示名称 |
| `id` | String | **是** | 组件唯一 ID。格式：小写字母、数字和 `-` 的组合，建议使用组件名称的小写加连字符形式 |
| `choose` | Boolean | 条件必填 | 是否让用户选择安装。`true` = 用户可选，`false` = 强制安装。仅当 `install = true` 时有意义 |
| `install` | Boolean | **是** | 是否需要安装此组件。`true` = 需要安装，`false` = 不安装 |

```toml
[[Component]]
name = "Python 3.12.8"
id = "python3-12-8"
choose = false
install = true
```

---

#### 4.3.3 版本检查模块

用于在安装前检测系统中是否已安装了指定版本的组件。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `check` | Boolean | **是** | 是否需要检查组件是否已安装 |
| `check_command` | Array\[String\] | 条件必填 | 检查命令列表。仅当 `check = true` 时需要提供 |
| `check_version_contains` | Array\[String\] | 条件必填 | 版本关键字列表。MCStart 检查命令输出中是否包含这些关键字来判断组件是否已安装。仅当 `check = true` 时需要提供 |
| `check_version_regex` | Array\[String\] | 否 | 正则表达式列表。MCStart 检查命令输出中必须匹配这些正则后才会判定为已安装。支持使用捕获组提取版本号 |

**检查逻辑**：

1. 执行 `check_command`
2. 只有当命令执行成功（退出码为 `0`）时，才继续匹配
3. 若配置了 `check_version_contains`，则输出必须包含其中所有关键字
4. 若配置了 `check_version_regex`，则输出还必须匹配其中所有正则表达式
5. 同时满足以上条件时，才认为组件已安装，将跳过安装

`check_version_contains` 适合做固定关键字判断，`check_version_regex` 适合处理带前缀、括号、路径、复杂版本字符串等场景。两者可以同时使用。

```toml
check = true
check_command = ["python --version"]
check_version_contains = ["3.12.8"]
```

**示例 — 使用正则表达式匹配版本**：

```toml
check = true
check_command = ["node --version"]
check_version_regex = ["^v(\\d+\\.\\d+\\.\\d+)$"]
```

---

#### 4.3.4 获取方式模块

定义如何获取组件的安装包或下载链接。

| 字段 | 类型 | 必填 | 可选值 | 说明 |
|------|------|------|--------|------|
| `get_method` | String | **是** | `"direct"` / `"get_version"` / `"get_link"` | 获取方法 |
| `direct_link` | String | 条件必填 | — | 组件的直接下载链接。仅当 `get_method = "direct"` 时需要提供 |
| `get_version` | String | 条件必填 | `"github_repo"` / `"filelink"` / `"custom"` | 版本获取方式。仅当 `get_method = "get_version"` 时需要提供 |
| `github_repo` | String | 条件必填 | — | 组件的 GitHub 仓库链接。仅当 `get_version = "github_repo"` 时需要提供。MCStart 通过 GitHub API 获取版本号 |
| `get_link` | String | 条件必填 | `"filelink"` / `"custom"` / `"user_input"` | 链接获取方式。仅当 `get_method = "get_link"` 时需要提供 |
| `get_link_provide_list` | Array\[String\] | 条件必填 | — | 可选链接列表，供用户选择。仅当 `get_method = "get_link"` 且 `get_link` 为 `"filelink"` 或 `"custom"` 时需要提供 |

##### get_method 详解

| 值 | 行为 | 必须搭配的字段 |
|----|------|---------------|
| `"direct"` | 直接下载，不需要获取版本号 | `direct_link` |
| `"get_version"` | 先获取版本号，再拼接下载链接 | `get_version` + `splicing_link` |
| `"get_link"` | 动态获取完整下载链接 | `get_link` |

##### get_version 详解

| 值 | 行为 | 必须搭配的字段 |
|----|------|---------------|
| `"github_repo"` | 通过 GitHub API 获取仓库的最新 Release / Tag 版本号 | `github_repo` |
| `"filelink"` | 通过远程或本地文件链接获取版本号，支持 `txt` / `json` / `xml` 等格式，也支持 `file:///` 协议 | 文件链接相关字段 |
| `"custom"` | 通过自定义脚本获取版本号。支持 `.py` / `.bat` / `.exe` / `.ps1` / `.sh`（Windows 需 Git Bash）/ `.js`（需 Node.js）等脚本 | 脚本路径相关字段 |

##### get_link 详解

| 值 | 行为 | 说明 |
|----|------|------|
| `"filelink"` | 从远程或本地文件中读取下载链接列表，支持 `txt` / `json` / `xml` 等格式，每行一个链接 | 用户可像选择版本一样选择链接 |
| `"custom"` | 通过自定义脚本获取下载链接，脚本返回链接列表 | 支持 `.py` / `.bat` / `.exe` / `.ps1` / `.sh` / `.js` 等脚本 |
| `"user_input"` | 由用户在运行时手动输入下载链接 | 适用于链接不固定的场景 |

**示例 — 直接下载**：

```toml
get_method = "direct"
direct_link = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"
```

**示例 — 获取版本拼接链接**：

```toml
get_method = "get_version"
get_version = "github_repo"
github_repo = "https://github.com/pawelsalawa/sqlitestudio"
splicing_link = "https://sqlitestudio.pl/files/sqlitestudio-{{version|SQLiteStudio}}-portable.zip"
```

---

#### 4.3.5 版本选择模块

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_choose` | Boolean | 否 | 是否让用户选择安装哪个版本。`true` = 用户选择，`false` = 自动安装最新版本 |
| `choose_list` | Array | 条件必填 | 版本选择列表。仅当 `user_choose = true` 时需要提供 |

##### choose_list 特殊规则

`choose_list` 中的元素可以是 **字符串** 或 **整数**，二者含义不同：

| 元素类型 | 含义 | 示例 |
|----------|------|------|
| String | 指定具体的可选版本号 | `"1.5.1"`, `"3.12.8"` |
| Integer（正整数） | 展示从最新版本往前数 N 个版本，优先显示分支 | `15` 表示展示最近 15 个版本 |
| Integer（`0`）或空数组 | 展示所有版本 | `0` 或 `[]` |

```toml
user_choose = true
choose_list = ["1.5.1"]        # 只展示 1.5.1 这个版本

# 或者
choose_list = [15]             # 展示最近 15 个版本

# 或者
choose_list = [0]              # 展示所有版本
```

---

#### 4.3.6 版本号格式化模块

当从 GitHub 等来源获取的版本号格式与下载链接中需要的格式不一致时，使用此模块进行转换。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `format_version` | Boolean | 条件必填 | 是否需要格式化版本号。仅当 `get_method = "get_version"` 时有意义 |
| `version_formatting_formula` | Array\[InlineTable\] | 条件必填 | 版本格式化规则列表，按从上到下的顺序依次执行。仅当 `format_version = true` 时需要提供 |

##### version_formatting_formula 内联表字段

| 键 | 类型 | 说明 |
|----|------|------|
| `match` | String | 正则表达式匹配模式 |
| `replace` | String | 替换字符串 |

**示例**：将 `v1.5-1` 转换为 `1.5.1`

```toml
format_version = true
version_formatting_formula = [
    {match = "v", replace = ""},      # v1.5-1 → 1.5-1
    {match = "-", replace = "."},     # 1.5-1  → 1.5.1
]
```

---

#### 4.3.7 安装方式模块

定义组件下载后的处理方式。仅当 `install = true` 且 `command_install = false` 时使用。

| 字段 | 类型 | 必填 | 可选值 | 说明 |
|------|------|------|--------|------|
| `install_operate` | String | 条件必填 | `"auto"` / `"no"` / `"custom"` | 安装操作方式。仅当 `install = true` 时需要提供 |
| `install_custom_list` | Array\[InlineTable\] | 条件必填 | — | 自定义安装规则列表。仅当 `install_operate = "custom"` 时需要提供 |

##### install_operate 详解

| 值 | 行为 |
|----|------|
| `"auto"` | 自动处理：`.exe` 和 `.msi` 文件自动运行安装，`.zip` 等压缩包自动解压 |
| `"no"` | 仅下载，不做任何安装操作。文件将存放在 `install_path` 指定的目录中 |
| `"custom"` | 自定义安装方式，根据文件扩展名匹配不同的处理规则 |

##### install_custom_list 内联表字段

| 键 | 类型 | 说明 |
|----|------|------|
| `extension` | String | 文件扩展名，用于匹配下载的安装文件 |
| `operate` | Boolean | `true` = 自动处理（压缩包解压、安装程序执行），`false` = 不做操作 |

```toml
install_operate = "custom"
install_custom_list = [
    {extension = ".zip", operate = true},     # zip 文件自动解压
    {extension = ".msi", operate = true},     # msi 文件自动安装
    {extension = ".exe", operate = false},    # exe 文件不自动运行
]
```

---

#### 4.3.8 安装路径模块

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `install_path` | String | 条件必填 | 安装路径，支持路径变量（见 [第 7 节](#7-路径变量参考)）。仅当 `install = true` 时需要提供。MCStart 会自动处理为绝对路径 |
| `custom_path` | String | 条件必填 | 自定义安装路径。仅当 `install_path = "$CustomPath"` 时需要提供 |

##### custom_path 特殊值

| 值 | 含义 |
|----|------|
| `"$input$"` | 运行时由用户输入路径，MCStart 会自动替换为用户输入的绝对路径 |
| 其他字符串 | 作为固定的绝对路径使用，如 `"C:\\temp"` |

安装路径确定后，将作为 `{{install_path|组件ID}}` 占位符的值传递给该组件内的所有命令。

```toml
install_path = "$CustomPath"
custom_path = "C:\\temp"
```

---

#### 4.3.9 命令行安装模块

当标准安装方式无法满足需求时，可以通过自定义命令行来完成安装。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command_install` | Boolean | 条件必填 | 是否通过命令行安装。仅当 `install = true` 时需要提供 |
| `install_command_list` | Array\[String\] | 条件必填 | 命令行安装指令列表。仅当 `install = true` 且 `command_install = true` 时需要提供 |

**当 `command_install = true` 时**：MCStart 不会自动下载安装包，组件的下载和安装完全由 `install_command_list` 中的命令负责。

**当 `command_install = false` 时**：MCStart 使用 `install_operate` 指定的方式处理已下载的安装包。

> 每个字符串元素等同于一行命令。Windows 环境下默认使用 PowerShell 执行。

```toml
command_install = true
install_command_list = [
    "$file_path = \"{{install_path|SQLiteStudio}}\"",
    "Expand-Archive -Path $file_path\\sqlitestudio-{{version|SQLiteStudio}}-portable.zip -DestinationPath \"temp\" -Force",
]
```

---

#### 4.3.10 安装前/后命令模块

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `before_command` | Boolean | **是** | 是否需要安装前操作 |
| `before_command_list` | Array\[String\] | 条件必填 | 安装前执行的命令列表。仅当 `before_command = true` 时需要提供 |
| `after_command` | Boolean | **是** | 是否需要安装后操作 |
| `after_command_list` | Array\[String\] | 条件必填 | 安装后执行的命令列表。仅当 `after_command = true` 时需要提供 |

> 安装前/后命令的工作目录为 `install_path`。

```toml
before_command = true
before_command_list = [
    "remove {{install_path|SQLiteStudio}}"
]

after_command = true
after_command_list = [
    "move {{install_path|SQLiteStudio}} \"C:\\Program Files\\SQLiteStudio\"",
]
```

---

#### 4.3.11 链接拼接模块

当 `get_method = "get_version"` 时，使用获取到的版本号拼接出完整的下载链接。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `splicing_link` | String | 条件必填 | 版本拼接基础链接模板。其中的 `{{version|组件ID}}` 会被替换为实际版本号。仅当 `get_method = "get_version"` 时需要提供 |

```toml
splicing_link = "https://sqlitestudio.pl/files/sqlitestudio-{{version|SQLiteStudio}}-portable.zip"
```

假设获取到的格式化后版本号为 `1.5.1`，则拼接结果为：

```
https://sqlitestudio.pl/files/sqlitestudio-1.5.1-portable.zip
```

---

#### 4.3.12 环境变量导入/导出模块

详见 [第 6 节 — 环境变量导入导出机制](#6-环境变量导入导出机制)。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | 否 | 是否导出环境变量 |
| `env_output_list` | Array\[InlineTable\] | 条件必填 | 导出变量列表。仅当 `env_output = true` 时需要提供 |
| `env_input` | Boolean | 否 | 是否导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 条件必填 | 导入变量列表。仅当 `env_input = true` 时需要提供 |

##### 内联表字段

| 键 | 类型 | 说明 |
|----|------|------|
| `name` | String | 变量名称 |
| `value` | String | 变量值（支持占位符） |

```toml
env_output = true
env_output_list = [
    {name = "SQLITESTUDIO_HOME", value = "{{install_path|SQLiteStudio}}"}
]

env_input = true
env_input_list = [
    {name = "PYTHON_HOME", value = "{{env|PYTHON_HOME}}"}
]
```

---

### 4.4 [DEPLOY] 与 [[Deployment]] — 部署管理

部署管理负责将项目源码或物料文件部署到指定位置，并执行部署后的环境搭建工作（如创建虚拟环境、安装依赖等）。

#### 4.4.1 [DEPLOY] 区块字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | **是** | 是否启用部署模块的环境变量导出功能 |
| `env_input` | Boolean | **是** | 是否启用部署模块的环境变量导入功能 |
| `list` | Array\[String\] | **是** | 部署项 ID 列表，决定部署顺序。用户可选择部署其中部分项 |

```toml
[DEPLOY]
env_output = true
env_input = true
list = ["MaiBot", "Adapter"]
```

---

#### 4.4.2 [[Deployment]] 基础信息

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | String | **是** | 部署项显示名称 |
| `id` | String | **是** | 部署项唯一 ID |
| `choose` | Boolean | **是** | 是否让用户选择部署。`true` = 用户可选，`false` = 强制部署 |
| `deploy` | Boolean | **是** | 是否需要部署 |

```toml
[[Deployment]]
name = "MaiBot"
id = "MaiBot"
choose = false
deploy = true
```

---

#### 4.4.3 部署方式模块

| 字段 | 类型 | 必填 | 可选值 | 说明 |
|------|------|------|--------|------|
| `deploy_method` | String | 条件必填 | `"auto"` / `"gitclone"` / `"!gitclone"` / `"getfile"` | 部署方式。仅当 `deploy = true` 且 `command_deploy = false` 时需要提供 |
| `base_link` | String | 条件必填 | — | 部署基础链接。仅当 `deploy = true` 时需要提供 |

##### deploy_method 详解

| 值 | 行为 |
|----|------|
| `"auto"` | **自动判断**。通过链接后缀判断部署方式：<br>• 链接以 `.git` 结尾 → 先尝试浅层 `git clone`（`--depth 1`）main 分支；若失败则自动回退到下载仓库压缩包并解压<br>• 链接为 `.zip`、`.exe` 等文件 → 直接下载并运行或解压 |
| `"gitclone"` | **Git Clone 模式**（带回退）。优先执行 `git clone`，失败时自动回退到下载仓库压缩包 |
| `"!gitclone"` | **强制 Git Clone**（无回退）。仅执行 `git clone`，失败则报错 |
| `"getfile"` | **文件获取模式**。从链接下载文件：压缩包自动解压，可执行程序或脚本自动执行 |

##### 部署结果目录结构

当部署方式为 `clone` 仓库或解压压缩包时，最终在 `deploy_path` 指定的目录下会生成一个以部署项 `id` 命名的文件夹。例如：

```
deploy_path/
└── MaiBot/          ← 以 id 命名
    ├── src/
    ├── config/
    └── ...
```

##### 版本与 Clone 的配合

当配置了版本获取（`get_method = "get_version"`）并且用户选择了特定版本时，MCStart 会根据版本号构造 clone 命令。例如用户选择 `v1.2.0`：

```bash
git clone -b v1.2.0 --depth 1 https://github.com/Mai-with-u/MaiBot.git
```

如果 `deploy_method = "auto"` 且 clone 失败，MCStart 会自动生成 GitHub Release 源码压缩包链接进行下载并解压部署。

---

#### 4.4.4 获取方式与版本选择模块

部署项的版本获取和选择机制与组件基本一致，但有以下差异：

| 字段 | 类型 | 必填 | 可选值 | 说明 |
|------|------|------|--------|------|
| `get_method` | String | 条件必填 | `"get_version"` / `"get_link"` | 获取方法。注意部署项**没有** `"direct"` 选项 |
| `get_version` | String | 条件必填 | `"github_repo"` / `"filelink"` / `"custom"` | 版本获取方式 |
| `github_repo` | String | 条件必填 | — | GitHub 仓库链接 |
| `get_link` | String | 条件必填 | `"filelink"` / `"custom"` / `"user_input"` | 链接获取方式 |
| `get_link_provide_list` | Array\[String\] | 条件必填 | — | 可选链接列表 |
| `user_choose` | Boolean | 否 | — | 是否让用户选择版本 |
| `choose_list` | Array | 条件必填 | — | 版本选择列表（规则同组件的 `choose_list`） |
| `format_version` | Boolean | 条件必填 | — | 是否格式化版本号 |
| `version_formatting_formula` | Array\[InlineTable\] | 条件必填 | — | 格式化规则（同组件） |

```toml
get_method = "get_version"
get_version = "github_repo"
github_repo = "https://github.com/Mai-with-u/MaiBot"
user_choose = true
choose_list = [15]            # 展示最近 15 个版本
format_version = false
```

---

#### 4.4.5 部署路径模块

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `deploy_path` | String | 条件必填 | 部署路径，支持路径变量（见 [第 7 节](#7-路径变量参考)）。仅当 `deploy = true` 时需要提供 |
| `custom_path` | String | 条件必填 | 自定义部署路径。仅当 `deploy_path = "$CustomPath"` 时需要提供。`"$input$"` 表示由用户输入 |

部署路径确定后，将作为 `{{deploy_path|部署ID}}` 占位符的值传递给该部署项内的所有命令。

```toml
deploy_path = "$CustomPath"
custom_path = "$input$"        # 用户运行时输入路径
```

---

#### 4.4.6 命令行部署模块

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command_deploy` | Boolean | 条件必填 | 是否通过命令行部署。仅当 `deploy = true` 时需要提供 |
| `deploy_command_list` | Array\[String\] | 条件必填 | 部署命令列表。仅当 `command_deploy = true` 时需要提供 |

**当 `command_deploy = true` 时**：源码/物料的下载和部署完全由 `deploy_command_list` 中的命令负责，MCStart 不会自动处理。

**当 `command_deploy = false` 时**：MCStart 使用 `deploy_method` 和 `base_link` 自动完成部署。

```toml
command_deploy = true
deploy_command_list = [
    "cd \"{{deploy_path|MaiBot}}\"",
    "git clone https://github.com/Mai-with-u/MaiBot.git --depth=1 --branch=main \"{{deploy_path|MaiBot}}\""
]
```

---

#### 4.4.7 部署前/后命令模块

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `before_command` | Boolean | **是** | 是否需要部署前操作 |
| `before_command_list` | Array\[String\] | 条件必填 | 部署前命令列表。仅当 `before_command = true` 时需要提供 |
| `after_command` | Boolean | **是** | 是否需要部署后操作 |
| `after_command_list` | Array\[String\] | 条件必填 | 部署后命令列表。仅当 `after_command = true` 时需要提供 |

> 部署前/后命令的工作目录为 `deploy_path`。

**示例 — 部署后搭建环境**：

```toml
after_command = true
after_command_list = [
    "$deploy = \"{{deploy_path|MaiBot}}\"",
    "cd $deploy",
    "pip install uv",
    "uv venv",
    "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass",
    ".\\.venv\\Scripts\\activate",
    "uv pip install -r $deploy\\MaiBot\\requirements.txt",
    "mkdir $deploy\\MaiBot\\config",
    "cp \"$deploy\\MaiBot\\template\\bot_config_template.toml\" \"$deploy\\MaiBot\\config\\bot_config.toml\"",
    "cp \"$deploy\\MaiBot\\template\\model_config_template.toml\" \"$deploy\\MaiBot\\config\\model_config.toml\"",
    "cp \"$deploy\\MaiBot\\template\\template.env\" \"$deploy\\MaiBot\\.env\""
]
```

---

#### 4.4.8 链接拼接模块

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `splicing_link` | String | 条件必填 | 版本拼接基础链接模板。其中 `{{version|部署ID}}` 会被替换为实际版本号。当使用 `base_link` 进行 clone 时此字段可为空 |

```toml
splicing_link = ""   # 使用 base_link 直接 clone，不需要拼接
```

---

#### 4.4.9 环境变量导入/导出模块

与组件的环境变量模块完全一致。详见 [4.3.12](#4312-环境变量导入导出模块) 和 [第 6 节](#6-环境变量导入导出机制)。

**示例 — 导出部署路径**：

```toml
env_output = true
env_output_list = [
    {name = "MAIBOT_HOME", value = "{{deploy_path|MaiBot}}"},
    {name = "MAIBOT_ROOT", value = "{{deploy_path|MaiBot}}\\{{key|Deployment.MaiBot.id}}"}
]
```

在此示例中：
- `{{deploy_path|MaiBot}}` 是运行时解析的实际部署路径（如 `D:\Projects\Mai`）
- `{{key|Deployment.MaiBot.id}}` 是静态引用，读取模版中 MaiBot 部署项的 `id` 字段（值为 `"MaiBot"`）
- 最终 `MAIBOT_ROOT` 的值为 `D:\Projects\Mai\MaiBot`

---

### 4.5 [LAUNCH] 与 [[LaunchItem]] — 启动管理

启动管理负责定义各服务的启动命令和顺序。

#### 4.5.1 [LAUNCH] 区块字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | **是** | 是否启用启动模块的环境变量导出功能 |
| `env_input` | Boolean | **是** | 是否启用启动模块的环境变量导入功能 |
| `list` | Array\[String\] | **是** | 启动项 ID 列表，按顺序执行。用户可选择启动其中部分项 |

```toml
[LAUNCH]
env_output = true
env_input = true
list = ["MaiBot", "Adapter"]
```

---

#### 4.5.2 [[LaunchItem]] 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | String | **是** | 启动项唯一 ID |
| `name` | String | **是** | 启动项显示名称 |
| `choose` | Boolean | **是** | 是否让用户选择启动。`true` = 用户可选，`false` = 强制启动 |
| `launch` | Boolean | **是** | 是否需要启动 |
| `launch_command` | Array\[String\] | 条件必填 | 启动命令列表。仅当 `launch = true` 时需要提供 |
| `env_input` | Boolean | 否 | 是否导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 条件必填 | 导入变量列表 |
| `env_output` | Boolean | 否 | 是否导出环境变量 |
| `env_output_list` | Array\[InlineTable\] | 条件必填 | 导出变量列表 |

**示例**：

```toml
[[LaunchItem]]
id = "MaiBot"
name = "MaiBot"
choose = false
launch = true
env_input = true
env_input_list = [
    {name = "MAIBOT_HOME", value = "{{env|MAIBOT_HOME}}"}
]
launch_command = [
    "cd \"{{env|MAIBOT_HOME}}\"",
    "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass",
    ".\\.venv\\Scripts\\activate",
    "cd MaiBot",
    "uv pip install -r requirements.txt",
    "python bot.py"
]
```

---

### 4.6 [CONFIG] 与 [[ConfigItem]] — 配置管理

配置管理负责在部署完成后引导用户编辑必要的配置文件。

> **文件打开优先级**：MCStart 优先使用 `code` 命令（VSCode）打开配置文件。如果用户未安装 VSCode 或未将 `code` 添加到环境变量，则尝试其他主流 IDE。若都不存在，则使用系统默认方式打开（如 Windows 上的 `notepad`）。

#### 4.6.1 [CONFIG] 区块字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | **是** | 是否启用配置模块的环境变量导出功能 |
| `env_input` | Boolean | **是** | 是否启用配置模块的环境变量导入功能 |
| `list` | Array\[String\] | **是** | 配置项列表。格式为 `"从属ID\|文件相对路径"` |

##### list 格式说明

`list` 中的每个元素格式为：

```
从属ID|相对于从属根目录的文件路径
```

其中「从属 ID」对应某个 `[[Deployment]]` 的 `id`，「文件路径」是相对于该部署项根目录的路径。

```toml
[CONFIG]
list = [
    "MaiBot|config/bot_config.toml",      # {{deploy_path|MaiBot}}/MaiBot/config/bot_config.toml
    "MaiBot|config/model_config.toml",     # {{deploy_path|MaiBot}}/MaiBot/config/model_config.toml
    "MaiBot|.env",                         # {{deploy_path|MaiBot}}/MaiBot/.env
    "Adapter|config.toml"                  # {{deploy_path|Adapter}}/Adapter/config.toml
]
```

---

#### 4.6.2 [[ConfigItem]] 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | String | 建议提供 | 配置项唯一 ID，格式同 `list` 中的元素：`"从属ID\|相对路径"` |
| `name` | String | **是** | 配置项显示名称，通常与 `id` 相同 |
| `file_path` | String | **是** | 配置文件的完整路径，支持占位符 |
| `choose` | Boolean | **是** | 是否让用户选择是否打开此配置文件 |
| `env_input` | Boolean | 否 | 是否导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 条件必填 | 导入变量列表 |

**示例**：

```toml
[[ConfigItem]]
id = "MaiBot|config/bot_config.toml"
name = "MaiBot|config/bot_config.toml"
file_path = "{{env|MAIBOT_ROOT}}\\config\\bot_config.toml"
choose = true
env_input = true
env_input_list = [
    {name = "MAIBOT_ROOT", value = "{{env|MAIBOT_ROOT}}"}
]
```

---

### 4.7 [UNINSTALL] 与 [[UninstallItem]] — 卸载管理

卸载管理用于对已部署实例执行安全回收。它不会参与完整部署流程，而是单独通过实例序列号进入，恢复该实例的运行时状态后再执行停止、清理和解绑动作。

#### 4.7.1 [UNINSTALL] 区块字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | **是** | 是否启用卸载模块的环境变量导出功能 |
| `env_input` | Boolean | **是** | 是否启用卸载模块的环境变量导入功能 |
| `list` | Array\[String\] | **是** | 卸载项 ID 列表，决定卸载顺序 |

```toml
[UNINSTALL]
env_output = false
env_input = true
list = ["OpenClaw"]
```

#### 4.7.2 [[UninstallItem]] 字段

| 字段 | 类型 | 必填 | 条件 | 说明 |
|------|------|------|------|------|
| `id` | String | ✅ | — | 卸载项 ID |
| `name` | String | ✅ | — | 卸载项显示名称 |
| `choose` | Boolean | ✅ | — | 是否让用户选择执行该卸载项 |
| `uninstall` | Boolean | ✅ | — | 默认是否执行该卸载项 |
| `stop_before_uninstall` | Boolean | ❌ | — | 是否在清理前执行停止命令 |
| `stop_command_list` | Array\[String\] | 📎 | `stop_before_uninstall=true` | 卸载前停止命令列表 |
| `remove_instance_config` | Boolean | ❌ | — | 是否在卸载结束后删除实例配置 |
| `remove_runtime_files` | Boolean | ❌ | — | 是否删除 `.mcstart-template.env` 与 `.mcstart-template-state.toml` |
| `remove_deploy_root` | Boolean | ❌ | — | 是否删除部署目录 |
| `remove_component` | Boolean | ❌ | — | 是否删除组件安装目录 |
| `deployment_targets` | Array\[String\] | ❌ | — | 要删除的部署项 ID 列表；为空时默认清理当前实例全部部署目录 |
| `component_targets` | Array\[String\] | ❌ | — | 要删除的组件 ID 列表；为空时默认清理当前实例全部模板托管组件 |
| `before_command` | Boolean | ✅ | — | 卸载前命令开关 |
| `before_command_list` | Array\[String\] | 📎 | `before_command=true` | 卸载前命令列表 |
| `after_command` | Boolean | ✅ | — | 卸载后命令开关 |
| `after_command_list` | Array\[String\] | 📎 | `after_command=true` | 卸载后命令列表 |
| `env_output` | Boolean | ❌ | — | 导出环境变量 |
| `env_output_list` | Array\[InlineTable\] | 📎 | `env_output=true` | 导出变量列表 |
| `env_input` | Boolean | ❌ | — | 导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 📎 | `env_input=true` | 导入变量列表 |

**重要行为约定**：

- `remove_component = true` 仅会删除模板运行时记录为“由模板托管安装”的组件目录；如果组件是在部署时检查到系统已存在而被跳过安装，则不会被删除。
- `remove_instance_config = true` 会在所有卸载项执行结束后删除 `config/config.toml` 中对应的 `instance_xxx` 配置。
- 卸载阶段依赖实例目录中的 `.mcstart-template.env` 和 `.mcstart-template-state.toml` 恢复上下文，因此建议只有在最后一个卸载项中才启用 `remove_runtime_files = true`。

**示例**：

```toml
[UNINSTALL]
env_output = false
env_input = true
list = ["OpenClaw"]

[[UninstallItem]]
id = "OpenClaw"
name = "卸载 OpenClaw"
choose = false
uninstall = true
stop_before_uninstall = true
stop_command_list = [
    "taskkill /f /im node.exe >nul 2>nul",
]
remove_instance_config = true
remove_runtime_files = true
remove_deploy_root = true
remove_component = false
deployment_targets = ["OpenClaw"]
component_targets = []
before_command = false
after_command = false
env_input = true
env_input_list = [
    {name = "OPENCLAW_PROJECT", value = "{{env|OPENCLAW_PROJECT}}"},
]
```

---

## 5. 占位符系统

MCStart 模版中存在两套占位符机制，分别用于不同的场景。

### 5.1 静态引用 `{{key|路径}}`

#### 作用

读取模版文件中**写死的原始值**。全局可用，不依赖执行流程，不需要导入导出。

#### 5.1.1 路径语法

```
{{key|区块.定位符.字段名[.数组索引[.内联表键名]]}}
```

各段的含义：

| 段 | 含义 | 示例 |
|----|------|------|
| 第 1 段 | 区块名称 | `MODINFO`、`Component`、`Deployment`、`DEPLOY` |
| 第 2 段 | 定位符（非数组区块直接是字段名；数组区块是 `id` 值或数字索引） | `MaiBot`、`python3-12-8`、`0` |
| 第 3 段 | 字段名 | `name`、`id`、`base_link` |
| 第 4 段（可选） | 数组元素索引 | `0`、`1` |
| 第 5 段（可选） | 内联表键名 | `name`、`value`、`extension` |

#### 5.1.2 定位规则

**非数组区块**（如 `MODINFO`、`DEPLOY`、`LAUNCH`、`CONFIG`、`COMPONENTS`）：

```
{{key|区块名.字段名}}
```

```
{{key|MODINFO.mod_id}}        → "MaiCore-Start.DeploymentMOD"
{{key|DEPLOY.list.0}}         → "MaiBot"
{{key|DEPLOY.list}}           → "MaiBot,Adapter"
```

**数组区块**（如 `Component`、`Deployment`、`LaunchItem`、`ConfigItem`）：

第 2 段的定位方式取决于值的类型：

| 值类型 | 定位方式 | 示例 |
|--------|---------|------|
| **非纯数字** | 按 `id` 字段值匹配 | `{{key|Component.SQLiteStudio.name}}` |
| **纯数字** | 按数组索引（从 0 开始） | `{{key|Component.0.name}}` |

#### 5.1.3 类型输出规则

所有值最终**统一输出为字符串**：

| 原始类型 | 输出规则 | 示例 |
|----------|---------|------|
| String | 原样输出 | `"MaiBot"` → `MaiBot` |
| Boolean | 小写 | `true` → `"true"`, `false` → `"false"` |
| Integer | 转字符串 | `15` → `"15"` |
| Array（整体引用） | 逗号拼接 | `["a", "b"]` → `"a,b"` |
| Array（索引引用） | 对应元素的值 | — |
| InlineTable（整体） | ⚠️ **不允许**，必须指定键 | 报错或返回空 |

特殊索引 `.length` 可获取数组长度：

```
{{key|DEPLOY.list.length}}   → "2"
```

#### 5.1.4 完整示例

```toml
# 顶层非数组区块
{{key|MODINFO.version}}                                          → "1.0.0"
{{key|MODINFO.mod_id}}                                           → "MaiCore-Start.DeploymentMOD"
{{key|MODINFO.file_import}}                                      → "false"
{{key|MODINFO.tags.0}}                                           → "test"
{{key|MODINFO.file_import_list.1}}                               → "version.json"
{{key|MODINFO.file_import_list.2}}                               → "GetVersion.ps1"

# 简单数组
{{key|DEPLOY.list}}                                              → "MaiBot,Adapter"
{{key|DEPLOY.list.0}}                                            → "MaiBot"
{{key|DEPLOY.list.1}}                                            → "Adapter"
{{key|DEPLOY.list.length}}                                       → "2"

# 数组区块 — 按 id 定位
{{key|Component.SQLiteStudio.choose}}                            → "true"
{{key|Component.SQLiteStudio.name}}                              → "SQLiteStudio"
{{key|Deployment.MaiBot.base_link}}                              → "https://github.com/Mai-with-u/MaiBot.git"

# 数组区块 — 按索引定位
{{key|Component.0.name}}                                         → "Python 3.12.8"
{{key|Component.0.id}}                                           → "python3-12-8"

# 嵌套数组
{{key|Component.python3-12-8.check_command.0}}                   → "python --version"
{{key|Component.python3-12-8.check_version_contains.0}}          → "3.12.8"
{{key|Component.python3-12-8.check_version_regex.0}}             → "^v(\\d+\\.\\d+\\.\\d+)$"

# 内联表数组
{{key|Deployment.MaiBot.env_output_list.0.name}}                 → "MAIBOT_HOME"
{{key|Deployment.MaiBot.env_output_list.0.value}}                → "{{deploy_path|MaiBot}}"
{{key|Deployment.MaiBot.env_output_list.1.name}}                 → "MAIBOT_ROOT"
{{key|Deployment.MaiBot.env_output_list.length}}                 → "2"

# 自定义安装列表
{{key|Component.SQLiteStudio.install_custom_list.0.extension}}   → ".zip"
{{key|Component.SQLiteStudio.install_custom_list.0.operate}}     → "true"
{{key|Component.SQLiteStudio.install_custom_list.2.extension}}   → ".exe"
{{key|Component.SQLiteStudio.install_custom_list.2.operate}}     → "false"

# 版本格式化公式
{{key|Component.SQLiteStudio.version_formatting_formula.0.match}}   → "v"
{{key|Component.SQLiteStudio.version_formatting_formula.0.replace}} → ""

# 混合类型数组
{{key|Deployment.MaiBot.choose_list.0}}                          → "15"
```

#### 5.1.5 边界情况

| 情况 | 行为 |
|------|------|
| `{{key|不存在的路径}}` | 报错或返回空字符串并警告 |
| `{{key|Deployment.MaiBot}}` | 报错：不允许引用整个表 |
| `{{key|DEPLOY.list.99}}` | 报错：索引越界 |
| `{{key|Component.SQLiteStudio.install_custom_list.0}}` | 报错：内联表必须指定键 |

#### 完整路径解析流程示例

```
输入：{{key|Deployment.MaiBot.env_output_list.0.name}}

解析步骤：
│
├─ 第1段: "Deployment"
│  → 定位到 [[Deployment]] 数组
│
├─ 第2段: "MaiBot"
│  → 非纯数字，按 id 字段匹配
│  → 找到 id="MaiBot" 的那个 [[Deployment]]
│
├─ 第3段: "env_output_list"
│  → 该表中的字段 env_output_list
│  → 类型: Array[InlineTable]
│
├─ 第4段: "0"
│  → 纯数字，按索引取第1个元素
│  → 类型: InlineTable {name="MAIBOT_HOME", value="..."}
│
└─ 第5段: "name"
   → 内联表中的键
   → 输出: "MAIBOT_HOME"
```

---

### 5.2 动态引用（运行时占位符）

动态引用读取的是**运行时解析后的实际值**，包括用户输入的路径、格式化后的版本号、实际的安装或部署路径等。

| 占位符 | 含义 | 作用域 | 输出值 |
|--------|------|--------|--------|
| `{{install_path\|组件ID}}` | 组件的实际安装路径 | 当前 `[[Component]]` 块内 | 运行时解析后的绝对路径 |
| `{{deploy_path\|部署ID}}` | 部署项的实际部署路径 | 当前 `[[Deployment]]` 块内 | 运行时解析后的绝对路径 |
| `{{version\|ID}}` | 获取到的实际版本号 | 当前 `[[Component]]` 或 `[[Deployment]]` 块内 | 经过格式化处理后的版本号字符串 |
| `{{file_path\|文件名}}` | 导入文件的实际路径 | 全局（需 `file_import = true`） | 文件在本地的绝对路径 |
| `{{env\|变量名}}` | 环境变量池中的变量值 | 需在当前块中声明导入后使用 | 对应变量被导出时写入的实际运行时值 |

**使用示例**：

```toml
# 在 Component 中使用 install_path
install_command_list = [
    "Expand-Archive -Path {{install_path|SQLiteStudio}}\\file.zip -DestinationPath temp"
]

# 在 Deployment 中使用 deploy_path
after_command_list = [
    "cd \"{{deploy_path|MaiBot}}\""
]

# 在 LaunchItem 中使用导入的环境变量
launch_command = [
    "cd \"{{env|MAIBOT_HOME}}\""
]

# 使用导入的文件路径
install_command_list = [
    "powershell -File {{file_path|GetVersion.ps1}}"
]
```

---

### 5.3 跨文件引用 `{{file_key|文件名.键}}`

当通过 `file_import` 导入了外部文件（如 `version.json`、`config.xml` 等）时，可以通过此占位符读取外部文件中的结构化数据。

**语法**：

```
{{file_key|文件名.键路径}}
```

**支持的文件格式**：JSON、XML、TOML 等结构化文件。MCStart 会将文件内容解析为虚拟键值树。

**示例**：

假设 `version.json` 的内容为：

```json
{
    "version": "1.0.0",
    "build": {
        "number": 42
    }
}
```

则可以通过以下方式访问：

```
{{file_key|version.json.version}}       → "1.0.0"
{{file_key|version.json.build.number}}  → "42"
```

> **注意**：`{{key|}}` 只能访问当前 TOML 模版文件中的数据，不能访问导入文件的内容。访问导入文件内容必须使用 `{{file_key|}}`。

---

### 5.4 两套机制的区别与选用

| 维度 | 静态引用 `{{key\|}}` | 动态引用 `{{env\|}}` 等 |
|------|----------------------|-------------------------|
| **数据来源** | 模版文件中的原始文本 | 运行时产生的实际值 |
| **作用域** | 全局，任意位置可用 | 需要先导出后导入，有作用域限制 |
| **是否依赖执行顺序** | 否 | 是 |
| **典型用途** | 引用固定配置（组件名、ID、链接等） | 引用运行时值（用户输入路径、实际安装路径、格式化版本号等） |
| **能否获取用户输入** | ❌ 只能获取 `$input$` 原始字符串 | ✅ 通过导出导入获取实际输入值 |

**选用原则**：

- 如果引用的值在模版文件中可以直接看到并且**不会随运行环境变化** → 用 `{{key|}}`
- 如果这个值需要**等程序运行起来之后才知道**是什么 → 用 `{{env|}}` 等动态占位符

---

## 6. 环境变量导入导出机制

### 6.1 导出（env_output）

在任意区块（`[[Component]]`、`[[Deployment]]`、`[[LaunchItem]]`）中设置 `env_output = true` 并提供 `env_output_list`，可以将该区块运行时产生的值写入模版内部的**环境变量池**。

```toml
env_output = true
env_output_list = [
    {name = "MAIBOT_HOME", value = "{{deploy_path|MaiBot}}"},
    {name = "MAIBOT_ROOT", value = "{{deploy_path|MaiBot}}\\MaiBot"}
]
```

导出时，`value` 字段中的占位符会**先被解析为实际值**再存入变量池。例如：

```
变量池写入：
  MAIBOT_HOME = D:\Projects\Mai
  MAIBOT_ROOT = D:\Projects\Mai\MaiBot
```

### 6.2 导入（env_input）

在另一个区块中设置 `env_input = true` 并提供 `env_input_list`，声明需要从变量池中读取哪些变量。导入完成后，该区块内所有 `{{env|变量名}}` 都会被替换为变量池中的实际值。

```toml
env_input = true
env_input_list = [
    {name = "MAIBOT_HOME", value = "{{env|MAIBOT_HOME}}"}
]
```

### 6.3 作用域与执行顺序

导入导出的生效取决于模版的**执行流程**：

```
组件安装 → 部署 → 启动 → 配置
```

**只有在某个变量被导出之后，后续的区块才能成功导入它。** 如果尝试导入一个尚未被导出的变量，将无法获取到有效值。

同一阶段内的多个区块，按 `list` 中的顺序依次执行。例如在 `[DEPLOY]` 中：

```toml
list = ["MaiBot", "Adapter"]
```

先执行 `MaiBot` 的部署（及其导出），再执行 `Adapter` 的部署。因此 `Adapter` 部署时可以导入 `MaiBot` 导出的变量。

### 6.4 完整数据流示例

```
┌─────────────────────────────────────────────────────┐
│ 阶段1: 组件安装                                       │
│                                                     │
│ [[Component]] python3-12-8                          │
│   env_output_list: (无)                              │
│                                                     │
│ [[Component]] SQLiteStudio                          │
│   env_output_list:                                  │
│     SQLITESTUDIO_HOME = C:\temp                     │
│                                                     │
│ ─── 变量池: {SQLITESTUDIO_HOME: "C:\temp"} ───       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 阶段2: 部署                                          │
│                                                     │
│ [[Deployment]] MaiBot                               │
│   deploy_path → D:\Projects\Mai                     │
│   env_output_list:                                  │
│     MAIBOT_HOME = D:\Projects\Mai                   │
│     MAIBOT_ROOT = D:\Projects\Mai\MaiBot            │
│                                                     │
│ [[Deployment]] Adapter                              │
│   env_output_list:                                  │
│     ADAPTER_HOME = D:\Projects\Adapter              │
│     ADAPTER_ROOT = D:\Projects\Adapter\Adapter      │
│                                                     │
│ ─── 变量池: {SQLITESTUDIO_HOME, MAIBOT_HOME,         │
│              MAIBOT_ROOT, ADAPTER_HOME,              │
│              ADAPTER_ROOT} ───                       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 阶段3: 启动                                          │
│                                                     │
│ [[LaunchItem]] MaiBot                               │
│   env_input: MAIBOT_HOME ← 变量池                    │
│   {{env|MAIBOT_HOME}} → D:\Projects\Mai             │
│                                                     │
│ [[LaunchItem]] Adapter                              │
│   env_input: ADAPTER_HOME, ADAPTER_ROOT ← 变量池     │
│   {{env|ADAPTER_HOME}} → D:\Projects\Adapter        │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 阶段4: 配置                                          │
│                                                     │
│ [[ConfigItem]] MaiBot|config/bot_config.toml        │
│   env_input: MAIBOT_ROOT ← 变量池                    │
│   file_path → D:\Projects\Mai\MaiBot\config\...     │
└─────────────────────────────────────────────────────┘
```

### 6.5 自动导出用户输入

MCStart 引擎在执行组件安装阶段之前，会**自动将所有用户输入的表单字段导出到环境变量池**，无需模板显式声明 `env_output`。

这意味着以下用户输入可以直接通过 `{{env|...}}` 引用：

| 字段 Key | 来源 | 说明 |
|----------|------|------|
| `nickname` | 系统内置表单 | 实例名称，用于创建实例隔离目录 |
| `serial_number` | 系统内置表单 | 实例唯一业务序列号 |
| `qq_account` | 系统内置表单 | QQ 账号（可选） |
| `bot_type` | 系统内置表单 | 部署画像（如 MaiBot、MoFox-Core 等） |
| `path::deployment::<部署ID>` | 表单字段（path_value = "$CustomPath" 时自动生成） | 用户输入的部署路径 |
| `path::component::<组件ID>` | 同上 | 用户输入的组件安装路径 |
| `version::<stage>::<ID>` | 用户选择版本后自动生成 | 用户选择的版本号 |
| `deployment::<部署ID>` | 表单字段（choose = true 时） | 用户是否选择部署该部署项 |
| `component::<组件ID>` | 同上 | 用户是否选择安装该组件 |

**使用示例**：

```toml
# 在组件中使用用户输入的路径 + nickname 拼接实例目录
[[Component]]
name = "NapCat"
id = "napcat-download"
install_path = "{{env|path::deployment::MaiBot}}\\{{env|nickname}}"
# 用户输入路径 D:\test，nickname = 111
# → install_path = D:\test\111

# 在部署项中使用用户输入的路径
[[Deployment]]
name = "MaiBot"
id = "MaiBot"
deploy_path = "$CustomPath"
custom_path = "$input$"
# → 用户输入的路径存入 path::deployment::MaiBot

# 在另一个部署项中引用同一个路径
[[Deployment]]
name = "NapCat-Adapter"
id = "NapCat-Adapter"
deploy_path = "{{env|path::deployment::MaiBot}}"
# → 复用 MaiBot 的用户输入路径

# 在配置项中使用 nickname
[[ConfigItem]]
name = "MaiBot|config/bot_config.toml"
file_path = "{{env|path::deployment::MaiBot}}\\{{env|nickname}}\\MaiBot\\config\\bot_config.toml"
```

**自动导出机制说明**：

```
用户输入表单
    ↓
plan.template_inputs 填充
    ↓
引擎启动时自动遍历并导出到 env_pool
    ↓
模板中任意位置通过 {{env|...}} 引用
```

> 注意：自动导出发生在**组件安装阶段之前**，因此组件阶段和部署阶段均可在 `after_command`、`deploy_command_list`、`launch_command` 等命令中引用用户输入的值。

---

## 7. 路径变量参考

`install_path` 和 `deploy_path` 字段支持以下路径变量。MCStart 会自动将其解析为对应系统目录的绝对路径。

| 变量 | Windows 下的典型值 | 说明 |
|------|-------------------|------|
| `$Temporary` | `<MCStart安装目录>\Temporary` | MCStart 根目录下的临时目录 |
| `$ProgramFiles` | `C:\Program Files` | 系统 Program Files 目录 |
| `$ProgramFiles(x86)` | `C:\Program Files (x86)` | 系统 Program Files (x86) 目录 |
| `$AppData` | `C:\Users\<用户>\AppData\Roaming` | 用户应用数据漫游目录 |
| `$LocalAppData` | `C:\Users\<用户>\AppData\Local` | 用户应用数据本地目录 |
| `$UserProfile` | `C:\Users\<用户>` | 用户主目录 |
| `$UserProfile\Desktop` | `C:\Users\<用户>\Desktop` | 用户桌面 |
| `$UserProfile\Documents` | `C:\Users\<用户>\Documents` | 用户文档 |
| `$UserProfile\Downloads` | `C:\Users\<用户>\Downloads` | 用户下载 |
| `$UserProfile\Music` | `C:\Users\<用户>\Music` | 用户音乐 |
| `$UserProfile\Pictures` | `C:\Users\<用户>\Pictures` | 用户图片 |
| `$UserProfile\Videos` | `C:\Users\<用户>\Videos` | 用户视频 |
| `$CustomPath` | 由 `custom_path` 字段指定 | 自定义路径 |

当使用 `$CustomPath` 时，需要搭配 `custom_path` 字段：

| `custom_path` 值 | 说明 |
|-------------------|------|
| `"$input$"` | 运行时提示用户输入路径 |
| 具体路径字符串 | 直接使用该绝对路径（如 `"C:\\temp"`） |

---

## 8. 版本获取与格式化

### 8.1 版本获取方式

MCStart 支持三种版本获取方式，适用于 `[[Component]]` 和 `[[Deployment]]`：

```
版本获取流程
│
├─ get_method = "direct"        （仅 Component）
│  → 不获取版本，直接使用 direct_link 下载
│
├─ get_method = "get_version"
│  ├─ get_version = "github_repo"
│  │  → 通过 GitHub API 获取 Release/Tag 列表
│  │  → 取最新版本或由用户选择
│  │
│  ├─ get_version = "filelink"
│  │  → 从远程/本地文件中读取版本号
│  │  → 支持 txt/json/xml 等格式
│  │  → 支持 file:/// 本地协议
│  │
│  └─ get_version = "custom"
│     → 运行自定义脚本获取版本号
│     → 支持 .py/.bat/.exe/.ps1/.sh/.js
│
└─ get_method = "get_link"
   ├─ get_link = "filelink"
   │  → 从文件中读取链接列表，用户选择
   │
   ├─ get_link = "custom"
   │  → 运行脚本获取链接列表，用户选择
   │
   └─ get_link = "user_input"
      → 用户手动输入下载链接
```

### 8.2 版本号格式化

获取到的原始版本号（如 `v1.5-1`）可能与下载链接中需要的格式不一致。`version_formatting_formula` 提供了一套基于正则表达式的顺序替换规则：

```toml
format_version = true
version_formatting_formula = [
    {match = "v", replace = ""},     # 步骤1: v1.5-1 → 1.5-1
    {match = "-", replace = "."},    # 步骤2: 1.5-1  → 1.5.1
]
```

格式化后的版本号会替换 `splicing_link` 或命令中的 `{{version|ID}}` 占位符。

### 8.3 版本选择与 choose_list

当 `user_choose = true` 时，MCStart 会向用户展示可选版本列表。

**`choose_list` 规则速查**：

| 内容 | 行为 |
|------|------|
| `["1.5.1", "1.5.0"]` | 只展示指定的版本 |
| `[15]` | 展示最近 15 个版本（优先显示分支） |
| `[0]` 或 `[]` | 展示所有版本 |
| `["1.5.1", 10]` | 混合：展示指定版本 + 最近 10 个版本 |

---

## 9. 执行流程

### 9.1 总体执行顺序

```
1. 模版注册与解析
   └─ 验证 [MCStart]、[MODINFO]
   └─ 验证 schema_version、min_version、max_version、platforms

2. 组件安装阶段 [COMPONENTS] → [[Component]]
   └─ 按 list 顺序逐个处理
   └─ 完成后导出环境变量

3. 部署阶段 [DEPLOY] → [[Deployment]]
   └─ 按 list 顺序逐个处理
   └─ 完成后导出环境变量

4. 启动阶段 [LAUNCH] → [[LaunchItem]]
   └─ 按 list 顺序逐个处理
   └─ 导入所需环境变量

5. 配置阶段 [CONFIG] → [[ConfigItem]]
   └─ 按 list 顺序打开配置文件
   └─ 导入所需环境变量
```

### 9.2 组件安装流程

```
对于 list 中的每个组件 ID：
│
├─ 查找对应的 [[Component]] 块
│
├─ choose = true ?
│  └─ 是 → 询问用户是否安装 → 用户拒绝则跳过
│
├─ install = false ?
│  └─ 是 → 跳过
│
├─ check = true ?
│  └─ 是 → 执行 check_command
│     └─ 退出码 = 0 且匹配 check_version_contains / check_version_regex → 已安装，跳过
│
├─ 导入环境变量（若 env_input = true）
│
├─ 获取版本 / 链接
│  ├─ get_method = "direct" → 使用 direct_link
│  ├─ get_method = "get_version" → 获取版本号
│  │  └─ user_choose = true → 展示版本选择
│  │  └─ format_version = true → 格式化版本号
│  │  └─ 拼接 splicing_link
│  └─ get_method = "get_link" → 获取链接
│
├─ before_command = true → 执行安装前命令
│
├─ command_install = true ?
│  ├─ 是 → 执行 install_command_list
│  └─ 否 → 下载文件 → 按 install_operate 处理
│     ├─ "auto" → 自动安装/解压
│     ├─ "no" → 仅下载
│     └─ "custom" → 按 install_custom_list 匹配处理
│
├─ after_command = true → 执行安装后命令
│
└─ env_output = true → 导出环境变量到变量池
```

### 9.3 部署流程

```
对于 list 中的每个部署 ID：
│
├─ 查找对应的 [[Deployment]] 块
│
├─ choose = true ?
│  └─ 是 → 询问用户是否部署 → 用户拒绝则跳过
│
├─ deploy = false ?
│  └─ 是 → 跳过
│
├─ 导入环境变量（若 env_input = true）
│
├─ 获取版本 / 链接（同组件流程）
│
├─ before_command = true → 执行部署前命令
│
├─ command_deploy = true ?
│  ├─ 是 → 执行 deploy_command_list
│  └─ 否 → 根据 deploy_method 自动部署
│     ├─ "auto"
│     │  ├─ 链接以 .git 结尾 → 尝试 git clone
│     │  │  ├─ 成功 → 完成
│     │  │  └─ 失败 → 回退到下载压缩包并解压
│     │  └─ 链接为文件 → 下载并处理
│     ├─ "gitclone" → git clone（带回退）
│     ├─ "!gitclone" → 强制 git clone（无回退）
│     └─ "getfile" → 下载文件，压缩包解压，可执行程序运行
│
├─ 部署结果目录命名为部署项 id
│
├─ after_command = true → 执行部署后命令
│
└─ env_output = true → 导出环境变量到变量池
```

### 9.4 启动流程

```
对于 list 中的每个启动项 ID：
│
├─ 查找对应的 [[LaunchItem]] 块
│
├─ choose = true ?
│  └─ 是 → 询问用户是否启动 → 用户拒绝则跳过
│
├─ launch = false ?
│  └─ 是 → 跳过
│
├─ env_input = true → 从变量池导入环境变量
│
├─ 执行 launch_command
│
└─ env_output = true → 导出环境变量到变量池（如需要）
```

### 9.5 配置流程

```
对于 list 中的每个配置项 ID：
│
├─ 查找对应的 [[ConfigItem]] 块
│
├─ choose = true ?
│  └─ 是 → 询问用户是否打开配置文件 → 用户拒绝则跳过
│
├─ env_input = true → 从变量池导入环境变量
│
├─ 解析 file_path 中的占位符 → 得到实际文件路径
│
└─ 打开文件
   ├─ 优先: VSCode (code 命令)
   ├─ 其次: 其他主流 IDE
   └─ 兜底: 系统默认编辑器 (notepad 等)
```

### 9.6 卸载流程

```
根据实例序列号恢复上下文：
│
├─ 读取 config/config.toml 中的实例绑定信息
├─ 读取实例目录下的 .mcstart-template.env
└─ 读取实例目录下的 .mcstart-template-state.toml
   → 恢复 env_pool / install_paths / deployment_roots / managed_components

对于 list 中的每个卸载项 ID：
│
├─ 查找对应的 [[UninstallItem]] 块
│
├─ choose = true ?
│  └─ 是 → 询问用户是否执行 → 用户拒绝则跳过
│
├─ env_input = true → 从变量池导入环境变量
│
├─ stop_before_uninstall = true ?
│  └─ 是 → 执行 stop_command_list
│
├─ before_command = true → 执行 before_command_list
│
├─ remove_deploy_root = true ?
│  └─ 是 → 删除 deployment_targets 指定的部署目录
│         （为空时默认删除该实例全部部署目录）
│
├─ remove_component = true ?
│  └─ 是 → 删除 component_targets 指定的组件目录
│         （仅限模板托管安装的组件）
│
├─ remove_runtime_files = true ?
│  └─ 是 → 删除 .mcstart-template.env / .mcstart-template-state.toml
│
├─ after_command = true → 执行 after_command_list
│
└─ remove_instance_config = true ?
   └─ 所有卸载项结束后删除 instance_xxx 配置
```

---

## 10. 完整字段速查表

### [MCStart]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `MCStart` | Boolean | ✅ | 必须为 `true` |

### [MODINFO]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `author` | String | ✅ | 作者名 |
| `tags` | Array\[String\] | ✅ | 标签列表 |
| `description` | String | ✅ | 描述 |
| `mod_id` | String | ✅ | 唯一 ID，格式 `GitHubUser.ModName` |
| `mod_name` | String | ✅ | 显示名称 |
| `version` | String | ✅ | 模版版本 |
| `min_version` | String | ❌ | 最低 MCStart 版本 |
| `max_version` | String | ❌ | 最高 MCStart 版本 |
| `file_import` | Boolean | ✅ | 是否启用文件导入 |
| `file_import_list` | Array\[String\] | 📎 | 文件列表（`file_import=true` 时） |
| `runtime` | String | ✅ | 运行环境 |
| `platforms` | Array\[String\] | ✅ | 平台限制 |
| `schema_version` | String | ✅ | 格式版本 |

### [COMPONENTS]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | ✅ | 环境变量导出 |
| `env_input` | Boolean | ✅ | 环境变量导入 |
| `list` | Array\[String\] | ✅ | 组件 ID 列表 |

### [[Component]]

| 字段 | 类型 | 必填 | 条件 | 说明 |
|------|------|------|------|------|
| `name` | String | ✅ | — | 组件名称 |
| `id` | String | ✅ | — | 组件 ID |
| `choose` | Boolean | 📎 | `install=true` | 用户可选安装 |
| `install` | Boolean | ✅ | — | 是否安装 |
| `check` | Boolean | ✅ | — | 是否检查已安装 |
| `check_command` | Array\[String\] | 📎 | `check=true` | 检查命令 |
| `check_version_contains` | Array\[String\] | 📎 | `check=true` | 版本关键字 |
| `check_version_regex` | Array\[String\] | ❌ | — | 版本正则匹配 |
| `command_install` | Boolean | 📎 | `install=true` | 是否命令行安装 |
| `install_command_list` | Array\[String\] | 📎 | `command_install=true` | 安装命令列表 |
| `get_method` | String | ✅ | — | 获取方法 |
| `direct_link` | String | 📎 | `get_method="direct"` | 直接下载链接 |
| `get_version` | String | 📎 | `get_method="get_version"` | 版本获取方式 |
| `github_repo` | String | 📎 | `get_version="github_repo"` | GitHub 仓库链接 |
| `get_link` | String | 📎 | `get_method="get_link"` | 链接获取方式 |
| `get_link_provide_list` | Array\[String\] | 📎 | `get_link="filelink"/"custom"` | 可选链接列表 |
| `user_choose` | Boolean | ❌ | — | 用户可选版本 |
| `choose_list` | Array | 📎 | `user_choose=true` | 版本选择列表 |
| `format_version` | Boolean | 📎 | `get_method="get_version"` | 是否格式化版本号 |
| `version_formatting_formula` | Array\[InlineTable\] | 📎 | `format_version=true` | 格式化规则 |
| `install_operate` | String | 📎 | `install=true` | 安装操作方式 |
| `install_custom_list` | Array\[InlineTable\] | 📎 | `install_operate="custom"` | 自定义安装规则 |
| `install_path` | String | 📎 | `install=true` | 安装路径 |
| `custom_path` | String | 📎 | `install_path="$CustomPath"` | 自定义路径 |
| `splicing_link` | String | 📎 | `get_method="get_version"` | 版本拼接链接 |
| `before_command` | Boolean | ✅ | — | 安装前操作 |
| `before_command_list` | Array\[String\] | 📎 | `before_command=true` | 安装前命令 |
| `after_command` | Boolean | ✅ | — | 安装后操作 |
| `after_command_list` | Array\[String\] | 📎 | `after_command=true` | 安装后命令 |
| `env_output` | Boolean | ❌ | — | 导出环境变量 |
| `env_output_list` | Array\[InlineTable\] | 📎 | `env_output=true` | 导出变量列表 |
| `env_input` | Boolean | ❌ | — | 导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 📎 | `env_input=true` | 导入变量列表 |

> 图例：✅ = 必填，📎 = 条件必填，❌ = 可选

### [DEPLOY]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | ✅ | 环境变量导出 |
| `env_input` | Boolean | ✅ | 环境变量导入 |
| `list` | Array\[String\] | ✅ | 部署项 ID 列表 |

### [[Deployment]]

| 字段 | 类型 | 必填 | 条件 | 说明 |
|------|------|------|------|------|
| `name` | String | ✅ | — | 部署项名称 |
| `id` | String | ✅ | — | 部署项 ID |
| `choose` | Boolean | ✅ | — | 用户可选部署 |
| `deploy` | Boolean | ✅ | — | 是否部署 |
| `command_deploy` | Boolean | 📎 | `deploy=true` | 是否命令行部署 |
| `deploy_command_list` | Array\[String\] | 📎 | `command_deploy=true` | 部署命令列表 |
| `deploy_method` | String | 📎 | `deploy=true, command_deploy=false` | 部署方式 |
| `base_link` | String | 📎 | `deploy=true` | 部署基础链接 |
| `deploy_path` | String | 📎 | `deploy=true` | 部署路径 |
| `custom_path` | String | 📎 | `deploy_path="$CustomPath"` | 自定义路径 |
| `get_method` | String | 📎 | `deploy=true` | 获取方法 |
| `get_version` | String | 📎 | `get_method="get_version"` | 版本获取方式 |
| `github_repo` | String | 📎 | `get_version="github_repo"` | GitHub 仓库链接 |
| `get_link` | String | 📎 | `get_method="get_link"` | 链接获取方式 |
| `get_link_provide_list` | Array\[String\] | 📎 | `get_link="filelink"/"custom"` | 可选链接列表 |
| `user_choose` | Boolean | ❌ | — | 用户可选版本 |
| `choose_list` | Array | 📎 | `user_choose=true` | 版本选择列表 |
| `format_version` | Boolean | 📎 | `get_method="get_version"` | 是否格式化版本号 |
| `version_formatting_formula` | Array\[InlineTable\] | 📎 | `format_version=true` | 格式化规则 |
| `splicing_link` | String | 📎 | `get_method="get_version"` | 版本拼接链接 |
| `before_command` | Boolean | ✅ | — | 部署前操作 |
| `before_command_list` | Array\[String\] | 📎 | `before_command=true` | 部署前命令 |
| `after_command` | Boolean | ✅ | — | 部署后操作 |
| `after_command_list` | Array\[String\] | 📎 | `after_command=true` | 部署后命令 |
| `env_output` | Boolean | ❌ | — | 导出环境变量 |
| `env_output_list` | Array\[InlineTable\] | 📎 | `env_output=true` | 导出变量列表 |
| `env_input` | Boolean | ❌ | — | 导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 📎 | `env_input=true` | 导入变量列表 |

### [LAUNCH]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | ✅ | 环境变量导出 |
| `env_input` | Boolean | ✅ | 环境变量导入 |
| `list` | Array\[String\] | ✅ | 启动项 ID 列表 |

### [[LaunchItem]]

| 字段 | 类型 | 必填 | 条件 | 说明 |
|------|------|------|------|------|
| `id` | String | ✅ | — | 启动项 ID |
| `name` | String | ✅ | — | 启动项名称 |
| `choose` | Boolean | ✅ | — | 用户可选启动 |
| `launch` | Boolean | ✅ | — | 是否启动 |
| `launch_command` | Array\[String\] | 📎 | `launch=true` | 启动命令列表 |
| `env_output` | Boolean | ❌ | — | 导出环境变量 |
| `env_output_list` | Array\[InlineTable\] | 📎 | `env_output=true` | 导出变量列表 |
| `env_input` | Boolean | ❌ | — | 导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 📎 | `env_input=true` | 导入变量列表 |

### [CONFIG]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | ✅ | 环境变量导出 |
| `env_input` | Boolean | ✅ | 环境变量导入 |
| `list` | Array\[String\] | ✅ | 配置项列表，格式 `"从属ID\|相对路径"` |

### [[ConfigItem]]

| 字段 | 类型 | 必填 | 条件 | 说明 |
|------|------|------|------|------|
| `id` | String | 建议 | — | 配置项 ID，格式 `"从属ID\|相对路径"` |
| `name` | String | ✅ | — | 配置项名称 |
| `file_path` | String | ✅ | — | 配置文件完整路径（支持占位符） |
| `choose` | Boolean | ✅ | — | 用户可选配置 |
| `env_input` | Boolean | ❌ | — | 导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 📎 | `env_input=true` | 导入变量列表 |

### [UNINSTALL]

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env_output` | Boolean | ✅ | 环境变量导出 |
| `env_input` | Boolean | ✅ | 环境变量导入 |
| `list` | Array\[String\] | ✅ | 卸载项 ID 列表 |

### [[UninstallItem]]

| 字段 | 类型 | 必填 | 条件 | 说明 |
|------|------|------|------|------|
| `id` | String | ✅ | — | 卸载项 ID |
| `name` | String | ✅ | — | 卸载项名称 |
| `choose` | Boolean | ✅ | — | 用户可选卸载 |
| `uninstall` | Boolean | ✅ | — | 默认是否执行 |
| `stop_before_uninstall` | Boolean | ❌ | — | 是否先执行停止命令 |
| `stop_command_list` | Array\[String\] | 📎 | `stop_before_uninstall=true` | 停止命令列表 |
| `remove_instance_config` | Boolean | ❌ | — | 是否删除实例配置 |
| `remove_runtime_files` | Boolean | ❌ | — | 是否删除运行时状态文件 |
| `remove_deploy_root` | Boolean | ❌ | — | 是否删除部署目录 |
| `remove_component` | Boolean | ❌ | — | 是否删除组件目录 |
| `deployment_targets` | Array\[String\] | ❌ | — | 要删除的部署项 ID 列表 |
| `component_targets` | Array\[String\] | ❌ | — | 要删除的组件项 ID 列表 |
| `before_command` | Boolean | ✅ | — | 卸载前操作 |
| `before_command_list` | Array\[String\] | 📎 | `before_command=true` | 卸载前命令 |
| `after_command` | Boolean | ✅ | — | 卸载后操作 |
| `after_command_list` | Array\[String\] | 📎 | `after_command=true` | 卸载后命令 |
| `env_output` | Boolean | ❌ | — | 导出环境变量 |
| `env_output_list` | Array\[InlineTable\] | 📎 | `env_output=true` | 导出变量列表 |
| `env_input` | Boolean | ❌ | — | 导入环境变量 |
| `env_input_list` | Array\[InlineTable\] | 📎 | `env_input=true` | 导入变量列表 |

---

## 11. FAQ

### Q1: `mod_id` 应该怎么命名？

**A**: 格式为 `GitHub用户名.模组名称`，使用驼峰命名法。`mod_id` 必须全局唯一，它是模版在 MCStart 注册系统中的唯一标识。

```toml
mod_id = "MaiCore-Start.DeploymentMOD"    # ✅ 正确
mod_id = "my-mod"                          # ❌ 缺少用户名前缀
```

### Q2: `command_install`/`command_deploy` 为 `true` 和为 `false` 时行为有什么区别？

**A**:

| 场景 | `command_install = true` | `command_install = false` |
|------|--------------------------|---------------------------|
| 下载 | 由命令自行完成 | MCStart 根据 `get_method` 和链接自动下载 |
| 安装 | 由 `install_command_list` 完成 | 由 `install_operate` 指定方式处理（auto/no/custom） |
| 适用 | 安装逻辑复杂或非标准的组件 | 标准的 exe/msi/zip 安装包 |

部署的 `command_deploy` 同理。

### Q3: `deploy_method = "auto"` 时的具体行为是什么？

**A**: MCStart 检查 `base_link` 的后缀来判断行为：

1. **链接以 `.git` 结尾** → 先尝试 `git clone --depth 1`；如果 clone 失败（网络问题、仓库不可达等），自动回退到下载 GitHub Release 源码压缩包并解压
2. **链接为 `.zip`/`.exe` 等文件** → 直接下载并处理（解压或执行）

如果同时配置了版本获取，会将版本号传递给 clone 命令作为分支/标签参数。

### Q4: `{{key|}}` 能读取到用户输入的路径吗？

**A**: **不能**。`{{key|}}` 是静态引用，只能读取模版文件中的原始文本。如果 `custom_path = "$input$"`，那么 `{{key|Deployment.MaiBot.custom_path}}` 的值是字符串 `"$input$"`，而不是用户实际输入的路径。

要获取用户实际输入的路径，需要通过环境变量机制：

1. 在部署块中导出 `{{deploy_path|MaiBot}}`（这是运行时解析后的实际路径）
2. 在后续块中导入使用 `{{env|MAIBOT_HOME}}`

### Q5: `{{key|}}` 和 `{{env|}}` 应该怎么选？

**A**: 简单判断：

- 值在模版文件中**写死了**，运行时不会变 → `{{key|}}`
- 值要**运行起来才知道** → `{{env|}}`

典型场景对照：

| 需求 | 用法 |
|------|------|
| 引用另一个组件的 `id` 名称 | `{{key|Deployment.MaiBot.id}}` |
| 引用模版版本号 | `{{key|MODINFO.version}}` |
| 引用部署后的实际安装路径 | `{{env|MAIBOT_HOME}}`（需先导出后导入） |
| 引用格式化后的版本号 | `{{version|SQLiteStudio}}`（在同一块内使用） |

### Q6: 环境变量导入时，如果目标变量还没被导出会怎样？

**A**: **无法获取到有效值**。环境变量的导入/导出严格依赖执行顺序。只有在某个变量被导出之后，后续的区块才能成功导入。

执行顺序为：`组件安装 → 部署 → 启动 → 配置`。在同一阶段内，按 `list` 声明顺序执行。

因此：
- ✅ 部署阶段导出的变量可以在启动和配置阶段导入
- ✅ `list = ["MaiBot", "Adapter"]` 中 MaiBot 导出的变量可以在 Adapter 中导入
- ❌ 启动阶段导出的变量不能在部署阶段导入（因为部署在启动之前执行）

### Q7: `choose_list` 中同时写了字符串和整数是什么效果？

**A**: 数组中的元素类型不同，含义不同：
- **字符串**：指定特定的可选版本号
- **整数**：展示最近 N 个版本

两者可以混合使用。例如 `choose_list = ["1.5.1", 10]` 表示展示版本 `1.5.1` 以及最近的 10 个版本。

### Q8: `install_operate = "custom"` 和 `command_install = true` 有什么区别？

**A**:

| 方式 | 下载 | 安装 | 使用场景 |
|------|------|------|---------|
| `command_install = true` | 命令自行完成 | 命令自行完成 | 完全自定义的安装流程 |
| `install_operate = "custom"` | MCStart 自动下载 | 根据文件扩展名匹配规则处理 | MCStart 能下载但需要自定义安装行为 |

简而言之：如果 MCStart 能帮你下载文件但你只是需要控制「下载完之后怎么处理」，用 `install_operate = "custom"` + `install_custom_list`。如果整个下载和安装流程都需要你自己控制，用 `command_install = true` + `install_command_list`。

### Q9: 如何让用户输入部署路径？

**A**: 组合使用 `$CustomPath` 和 `$input$`：

```toml
deploy_path = "$CustomPath"
custom_path = "$input$"
```

MCStart 运行时会提示用户输入路径，并自动将其处理为绝对路径。

### Q10: `splicing_link` 和 `base_link` 有什么关系？

**A**: 它们用于不同的场景：

- **`base_link`**：部署基础链接，用于 `deploy_method` 的自动部署（clone/下载）。是实际执行部署动作的链接。
- **`splicing_link`**：版本拼接链接模板，用于构造特定版本的下载链接。当 `get_method = "get_version"` 时，MCStart 会将版本号替换到模板中生成完整链接。

一个部署项可以同时拥有两者。例如 `base_link` 用于 clone 仓库，而当 clone 失败回退时，MCStart 可能使用 `splicing_link` 构造压缩包下载链接。

如果使用 `deploy_method = "auto"` 且 `base_link` 是 `.git` 链接，clone 成功时 `splicing_link` 不会被使用，此时 `splicing_link` 可以为空。

### Q11: `file_import` 导入的文件能做什么？

**A**: 导入的文件有两种用途：

1. **路径引用**：通过 `{{file_path|文件名}}` 在命令中引用文件的实际路径，例如运行导入的脚本
2. **内容读取**：通过 `{{file_key|文件名.键路径}}` 读取结构化文件中的值（支持 JSON、XML、TOML 等）

```toml
# 引用文件路径（在命令中使用）
install_command_list = [
    "powershell -File {{file_path|GetVersion.ps1}}"
]

# 读取文件内容
# 假设 version.json = {"version": "1.0.0"}
# {{file_key|version.json.version}} → "1.0.0"
```

### Q12: `version_formatting_formula` 中的 `match` 支持完整正则表达式吗？

**A**: 是的，`match` 字段的值是正则表达式。格式化规则按数组中的顺序从上到下依次执行，每一步的输出作为下一步的输入。

```toml
version_formatting_formula = [
    {match = "^v", replace = ""},       # 只移除开头的 v
    {match = "-beta$", replace = ""},   # 移除末尾的 -beta
    {match = "-", replace = "."},       # 所有 - 替换为 .
]
```

### Q13: 一个区块中可以同时导入和导出环境变量吗？

**A**: 可以。`env_input` 和 `env_output` 是独立的功能。执行顺序为：先导入 → 执行命令 → 后导出。因此你可以在一个区块中导入上一个阶段的变量，经过处理后再导出新的变量给下一个阶段使用。

### Q14: `platforms` 为空数组时是什么行为？

**A**: 不限制平台。模版将在所有平台上可用。

```toml
platforms = []       # 不限制平台
platforms = ["windows", "linux"]  # 仅 Windows 和 Linux
```

### Q15: 我的组件不需要安装，只需要检查是否存在，怎么配置？

**A**: 设置 `install = false`，同时配置检查模块：

```toml
[[Component]]
name = "Git"
id = "git"
choose = false
install = false         # 不安装
check = true            # 但需要检查
check_command = ["git --version"]
check_version_contains = ["git version"]
before_command = false
after_command = false
get_method = "direct"
direct_link = ""
```

这样 MCStart 会检查 Git 是否已安装，如果未安装会提示用户，但不会自动安装。

### Q16: `deploy_method = "!gitclone"` 和 `"gitclone"` 的区别是什么？

**A**:

| 方式 | clone 失败时 |
|------|-------------|
| `"gitclone"` | 自动回退到下载仓库压缩包并解压 |
| `"!gitclone"` | 直接报错，不回退 |

如果你确定目标环境一定有 Git 且网络可达，可以使用 `"!gitclone"` 避免回退到压缩包方式导致的目录结构差异。

### Q17: `deploy_method` 部署后的目录结构是什么样的？

**A**: 无论是 clone 还是解压压缩包，最终在 `deploy_path` 下会有一个以部署项 `id` 命名的文件夹：

```
deploy_path/              ← 用户指定的部署目录
└── {id}/                 ← 以部署项 id 命名
    ├── src/
    ├── config/
    └── ...
```

例如 `deploy_path = "D:\Projects\Mai"`，`id = "MaiBot"`，则项目位于 `D:\Projects\Mai\MaiBot\`。

### Q18: 区块级的 `env_output`/`env_input`（如 `[COMPONENTS]` 中的）和元素级的（如 `[[Component]]` 中的）有什么关系？

**A**: 区块级的是**总开关**，元素级的是**个体开关**。两者都必须为 `true` 时，对应的导入/导出才会生效。

```toml
[COMPONENTS]
env_output = true    # 总开关打开

[[Component]]
id = "python3-12-8"
env_output = true    # 个体开关打开 → ✅ 生效
env_output_list = [{name = "PYTHON_HOME", value = "..."}]

[[Component]]
id = "SQLiteStudio"
env_output = false   # 个体开关关闭 → ❌ 不生效
```

### Q19: 配置文件打开的 IDE 优先级是什么？

**A**: MCStart 按以下顺序尝试打开配置文件：

1. **VSCode**（`code` 命令）— 最优先
2. **其他主流 IDE**（按可用性尝试）
3. **系统默认编辑器**（如 Windows 上的 `notepad`）— 兜底

如果想让用户获得最佳体验，建议在模版描述中提示用户安装 VSCode 并将 `code` 命令添加到系统 PATH。

### Q20: `schema_version` 的作用是什么？

**A**: `schema_version` 标识当前模版使用的模版格式版本。MCStart 会根据此版本号选择对应的解析器来处理模版。当 MCStart 未来升级模版格式时，旧版本的模版仍然可以通过此字段被正确识别和兼容处理。当前版本为 `"2.0"`。

### Q21: 卸载阶段会删除系统里已经存在的共享组件吗？

**A**: 默认不会。MCStart 会根据实例运行时状态判断组件是否由模板托管安装。只有模板实际安装过的组件目录，且卸载项显式设置了 `remove_component = true`，才会尝试删除；如果组件是在部署时检查到系统中已存在而被跳过安装，则卸载阶段只会跳过，不会删除共享组件。

### Q22: 版本获取失败后如何处理？

**A**: MCStart 实现了智能的版本获取失败处理机制：

1. **指数退避重试**：版本获取时会进行 3 次指数退避重试（延迟分别为 1s、2s、4s），应对临时网络问题
2. **失败后用户选项**：如果重试 3 次后仍然失败，会向用户提供三个选项：
   - **[1] 手动重试**：重新尝试获取版本列表
   - **[2] 自行输入版本号**：用户可以直接输入版本号或分支名
   - **[3] 跳过（使用默认版本）**：跳过版本选择，使用默认行为

3. **版本优先级**：获取版本时优先展示 Release（分发版本），其次是 Tag（标签），最后是 Branch（分支）

### Q23: 命令执行的显示格式是什么？

**A**: MCStart 在执行命令时会实时显示命令内容和输出，格式如下：

```bash
● Bash <命令内容>
  ⎿ 工作目录: <路径>
  ⎿ <命令输出内容>
```

**示例**：
```bash
● Bash python --version
  ⎿ 工作目录: C:\Users\xxx
  ⎿ Python 3.12.8
```

这种格式让用户可以清晰地看到：
- 当前正在执行的命令
- 命令的工作目录
- 命令的实际输出内容

### Q24: 组件检查的结果会显示吗？

**A**: 是的，组件检查的结果会实时显示。当执行 `check_command` 时：

1. **检查中**：显示 "正在检查组件是否已安装..."
2. **检查通过**：显示 "✓ 检查通过，已安装版本: x.x.x"
3. **检查未通过**：显示 "✗ 检查未通过，将执行安装"
4. **检查异常**：如果命令退出码非 `0`，会显示检查失败并按“未安装”处理

如果配置了 `check_version_regex`，MCStart 会在输出中执行正则匹配；当正则包含捕获组时，会优先使用第一个捕获组作为显示的版本号。检查命令的输出也会按照上述命令执行显示格式实时展示。

### Q25: 部署下载失败时的回退策略是什么？

**A**: 当使用 `deploy_method = "gitclone"` 或 `"auto"` 时，如果 Git Clone 失败：

1. **优先使用分支回退**：如果用户选择了特定版本（Release/Tag），会尝试下载该版本的源码压缩包
2. **分支优先**：如果版本类型是 Branch，会使用 `archive/refs/heads/{branch_name}.zip` 格式的链接
3. **Release 优先**：如果版本类型是 Release/Tag，会使用 `archive/refs/tags/{tag_name}.zip` 格式的链接

这确保了在网络问题导致 clone 失败时，仍能通过下载源码包的方式完成部署。

### Q26: 如何在模板中引用用户输入的 `nickname` 或自定义路径？

**A**: MCStart 引擎在启动时会**自动将所有用户输入的表单字段导出到环境变量池**，无需模板显式声明 `env_output`。因此可以直接在任意命令中使用 `{{env|...}}` 引用：

| 字段 | 说明 | 示例 |
|------|------|------|
| `nickname` | 用户输入的实例名称 | `{{env\|nickname}}` → `111` |
| `serial_number` | 实例唯一序列号 | `{{env\|serial_number}}` → `222` |
| `path::deployment::MaiBot` | 用户输入的部署路径 | `{{env\|path::deployment::MaiBot}}` → `D:\test` |
| `path::component::napcat` | 用户输入的组件路径 | `{{env\|path::component::napcat}}` → `D:\test` |

**典型用法 — 多实例隔离目录**：

```toml
# 用户基础路径：D:\test，nickname：111
# 期望目录结构：D:\test\111\
#   ├── MaiBot/
#   ├── NapCat-Adapter/
#   └── NapCat/

# 组件安装路径：基础路径 + nickname
[[Component]]
name = "NapCat"
id = "napcat-download"
install_path = "{{env|path::deployment::MaiBot}}\\{{env|nickname}}"
# → D:\test\111

# 部署路径：直接用用户输入的基础路径
[[Deployment]]
name = "MaiBot"
id = "MaiBot"
deploy_path = "$CustomPath"
custom_path = "$input$"

# 另一个部署项复用同一个基础路径
[[Deployment]]
name = "NapCat-Adapter"
id = "NapCat-Adapter"
deploy_path = "{{env|path::deployment::MaiBot}}"
# → D:\test
```

自动导出发生在**组件安装阶段之前**，因此组件、部署、启动、配置等所有阶段的命令中均可使用。
