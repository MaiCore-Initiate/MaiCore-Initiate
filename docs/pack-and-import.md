# 实例打包与导入 (.mcsins)

## 概述

`mcsb` 提供实例打包（`-o` / `output`）和导入（`import` / `-in`）功能，允许将已注册的实例打包为 `.mcsins` 文件分发，并在其他环境中导入还原。

**前提条件**：打包前必须通过 `mcsb login github.com` 登录 GitHub（导入无需登录）。

---

## .mcsins 文件格式

`.mcsins` 是 **ISO 9660 (Joliet Level 3)** 文件，内部包含两个文件：

```
<name>.mcsins  (ISO 9660 Joliet)
├── meta.json          ← 实例元数据（UTF-8 JSON）
└── <cfg_name>.zip     ← 实例内容压缩包（ZIP DEFLATED）
```

### meta.json 完整结构

```json
{
  "meta": {
    "name": "实例昵称（nickname_path）",
    "serial": "实例序列号（serial_number）",
    "author": "GitHub 用户名",
    "mail": "作者邮箱",
    "account": "https://github.com/xxx",
    "time": "2026-05-14T10:00:00Z",
    "type": "MaiBot",
    "version": "0.0.0",
    "description": "Markdown 格式的描述（-des 参数内容）",
    "components": ["NapCat", "napcat-adapter"],
    "plugins": ["MCPServers", "ImaAPI"],
    "pack-source": "MaiCoreStart",
    "zip_file": "<cfg_name>.zip",

    "napcat_version": "NapCat.Shell",
    "qq_account": "123456789",

    "napcat_path_rel": "NapCat/NapCatWinBootMain.exe",
    "adapter_path_rel": "MaiBot/config/plugins/napcat_adapter",
    "venv_path_rel": "MaiBot/.venv",
    "mongodb_path_rel": "",
    "webui_path_rel": "builtin"
  }
}
```

#### 字段说明

| 字段 | 来源 | 说明 |
|------|------|------|
| `name` | `nickname_path` | 实例昵称 |
| `serial` | `serial_number` | 实例序列号 |
| `author` | GitHub 账户 | 打包者 GitHub 用户名 |
| `mail` | GitHub 账户 | 打包者邮箱 |
| `account` | GitHub 账户 | 打包者 GitHub 主页 URL |
| `time` | 打包时刻 | ISO 8601 UTC 时间戳 |
| `type` | `bot_type` | MaiBot / MoFox-Core / Neo-MoFox |
| `version` | `version_path` | 实例版本 |
| `description` | `-des` 参数 | Markdown 格式描述（导入时渲染展示） |
| `components` | 实际打包内容 | 打包进 zip 的组件名称列表 |
| `plugins` | 实际打包内容 | 打包进 zip 的插件文件夹名称列表 |
| `pack-source` | 固定值 | 始终为 `"MaiCoreStart"` |
| `zip_file` | 自动生成 | zip 文件名，导入时用于定位压缩包 |
| `napcat_version` | `napcat_version` | NapCatQQ 版本标识 |
| `qq_account` | `qq_account` | QQ 账号（仅信息参考，不含敏感数据） |
| `*_path_rel` | 各路径字段 | 相对于 `extract_dir` 的相对路径，导入时还原；若路径在 nickname_dir 之外则为空字符串 |

### zip 内部目录结构

```
<BotType>/          ← 如 MaiBot/、MoFox-Core/、Neo-MoFox/
  *.py / *.toml ... ← 源码（!src 可排除）
  config/           ← 配置文件（!config 可排除，api_key 自动脱敏）
  data/             ← 用户数据（!data 可排除）
  plugins/          ← 插件目录（!plugins 可排除）
  venv/ 或 .venv/   ← 虚拟环境（默认不打包，!+venv 显式包含）
NapCat/             ← 组件（!components 可排除）
...
```

---

## 命令速查

### 打包

```
mcsb -o <序列号[,序列号...]> [选项]
mcsb output <序列号[,序列号...]> [选项]
```

| 选项 | 长格式 | 说明 |
|------|--------|------|
| `-f <过滤参数>` | `--filter` | 自定义打包内容（见下表） |
| `-s <路径>` | `--site` | 指定输出路径或目录 |
| `-des <描述>` | `--description` | 描述文字（支持 `\n`）或 `.md` 文件路径 |

#### -f 过滤参数

多个参数用逗号分隔：

| 参数 | 说明 |
|------|------|
| `!data` | 排除 data 文件夹 |
| `!config` | 排除 config 文件夹 |
| `!components` | 排除所有组件 |
| `!src` | 排除源码部分 |
| `!plugins` | 排除所有插件 |
| `!venv` | 排除虚拟环境（默认已排除） |
| `!+venv` | **包含**虚拟环境 |
| `--c{A,B}` | 只打包指定组件 A、B |
| `--p{A,B}` | 只打包指定插件 A、B |
| `@components` | 交互式选择组件（列出表格后手动输入序号，输入 `!` 全不选） |
| `@plugins` | 交互式选择插件（列出表格后手动输入序号，输入 `!` 全不选） |

> **PowerShell 注意**：`@components` 和 `@plugins` 中的 `@` 在 PowerShell 中是 splatting 运算符，必须对 `-f` 参数值加引号：
> ```powershell
> mcsb -o 1 -f "!data,@plugins" -s "C:\output"
> ```
> CMD 和 bash 不受此限制。

### 导入

```
mcsb import <文件.mcsins> [-s <目标目录>]
mcsb -in <文件.mcsins> [-s <目标目录>]
```

默认导入到当前目录下的 `<序列号>/` 子文件夹。导入后：
- 自动注册到配置，`source` 字段设为 `import`
- 从 `meta.json` 还原 napcat_path、adapter_path、venv_path 等相对路径
- 若 zip 内无虚拟环境，询问是否自动创建 venv 并安装依赖（按 bot 类型分发：Neo-MoFox 用 `uv sync`，其他用 pip）

---

## 用例示例

```bash
# 默认打包（排除 venv），输出到实例目录同级
mcsb -o 1

# 打包多个实例到指定目录
mcsb output abc,def -s "D:\mcsins\"

# 只打包 config 和指定插件
mcsb -o 1 -f "!data,!src,!components,--p{MCPServers}" -s "D:\dist\1.mcsins"

# 包含 venv，交互式选择组件
mcsb -o 1 -f "!+venv,@components"

# 附加描述（文字或 .md 文件）
mcsb -o 1 -des "这是一个测试实例"
mcsb -o 1 -des "README.md"

# 导入到指定目录
mcsb import test.mcsins -s "D:\instances\"
```

---

## 安全说明

1. **GitHub 登录必须**：打包前必须通过 `mcsb login github.com` 登录，作者信息从本地账户数据读取。导入不需要登录。

2. **API Key 脱敏**：打包含 `config/` 的实例时，`model_config.toml` 和 `model.toml` 中所有 `api_key = "..."` 的值会被替换为 `"sk-xxxxxx"`，防止密钥泄露。

3. **路径相对化**：`napcat_path`、`adapter_path`、`venv_path` 等路径在打包时转换为相对路径存入 `meta.json`，仅对位于 `nickname_dir` 之下的路径有效；NapCat 等位于外部的路径不会记录。

---

## source 字段说明

每个已注册实例在 `config/config.toml` 中有一个 `source` 字段，标识来源：

| 值 | 含义 | WebUI 徽章颜色 |
|----|------|----------------|
| `register` | 手动注册的本地实例 | 蓝色 |
| `deploy` | 通过联网部署创建 | 绿色 |
| `import` | 从 `.mcsins` 导入 | 黄色 |
| `onekey` | 一键部署（预留） | 紫色 |

---

## 相关源文件

| 文件 | 说明 |
|------|------|
| `src/cli/pack.py` | 打包/导入核心逻辑 |
| `src/cli/mcsb_cli.py` | CLI 参数解析入口 |
| `src/core/config.py` | 配置管理，含 source 字段定义 |
| `src/webui_api/webui_config_api.py` | WebUI API，暴露 source 字段 |
| `webui/frontend/src/pages/Config.tsx` | 来源徽章 UI |
| `bin/mcsb.cmd` | Windows CMD 入口脚本 |
| `bin/mcsb.ps1` | Windows PowerShell 入口脚本 |
| `bin/mcsb.sh` | Linux/macOS 入口脚本 |
