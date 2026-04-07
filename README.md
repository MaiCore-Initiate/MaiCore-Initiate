<div align="center">

# 🚀 MaiCore-Start 麦麦核心启动器

**智能聊天机器人一站式部署、管理与控制平台**

[![GitHub release](https://img.shields.io/github/v/release/MaiCore-Start/MaiCore-Start?style=for-the-badge&logo=github)](https://github.com/MaiCore-Start/MaiCore-Start/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg?style=for-the-badge&logo=python)](https://www.python.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6.svg?style=for-the-badge&logo=windows)](https://www.microsoft.com/windows/)
[![GitHub stars](https://img.shields.io/github/stars/MaiCore-Start/MaiCore-Start?style=for-the-badge&logo=github)](https://github.com/MaiCore-Start/MaiCore-Start/stargazers)

**一键部署 · 多实例管理 · 知识库构建 · 数据库迁移**

</div>

---

## [文档中心](https://docs.mmcstart.cn:8850)

## [MCStart_部署模版开发文档](MOD\MCStart_部署模版开发文档.md)


## 📖 目录

- [✨ 特性概览](#-特性概览)
- [📥 快速开始](#-快速开始)
- [🎛️ 功能详解](#-功能详解)
- [⚙️ 系统要求](#-系统要求)
- [🤝 社区交流](#-社区交流)
- [📋 更新日志](#-更新日志)
- [🔧 故障排查](#-故障排查)
- [📄 许可证](#-许可证)

---

## ✨ 特性概览

### 🎯 核心功能


| 功能模块           | 功能描述                                         | 技术亮点                           |
| :----------------- | :----------------------------------------------- | :--------------------------------- |
| **🚀 组件化启动**  | 麦麦本体、适配器、NapCat、控制面板的灵活组合启动 | 模块化架构，按需加载，资源占用更低 |
| **🔧 多实例管理**  | 创建、配置、切换多个独立的麦麦实例               | TOML配置格式，支持可视化编辑       |
| **📦 自动化部署**  | 一键部署classical/0.6.x~0.10.x/dev版本           | 智能依赖检测，自动环境配置         |
| **🧠 知识库构建**  | LPMM知识库构建（文本分割、实体提取、图谱导入）   | 多模型支持，高精度实体识别         |
| **🔄 数据库迁移**  | MongoDB → SQLite 无缝迁移                       | 数据完整性校验，支持增量迁移       |
| **🎨 现代化UI**    | 基于Rich库的精美命令行界面                       | 彩色输出、进度条、实时状态显示     |
| **📊 进程监控**    | 实时查看运行状态、资源占用                       | 多进程管理，一键停止所有服务       |
| **🌐 Web控制面板** | 基于Bun的Dashboard，浏览器管理配置               | 自动端口分配，热重载支持           |
| **🔌 网络代理**    | 支持HTTP/HTTPS/SOCKS代理，可视化配置             | 自动应用环境变量，连接测试功能     |

### 🌟 技术特性

- **🏗️ 面向对象架构** - 模块化设计，高内聚低耦合，易于扩展和维护
- **📝 结构化日志** - 使用structlog记录详细日志，便于问题追踪和调试
- **🛡️ 智能路径验证** - 自动检测中文路径、特殊字符等常见问题
- **⚡ 版本自适应** - 自动识别0.6.x~0.10.x各版本，智能选择启动策略
- **🔒 安全防护** - 多重确认机制，防止误删配置和实例数据
- **🌐 环境自检** - 自动检测Python、Git、MongoDB、Node.js等依赖
- **🎯 异常恢复** - 完善的错误处理和异常恢复机制
- **🖥️ 系统托盘** - 最小化到托盘，不占用任务栏空间
- **🔌 网络代理** - 支持多种代理协议，可视化配置界面，一键测试连接

---

## 📥 快速开始

### 🔽 下载安装

<div align="center">


| 版本           | 发布日期 | 状态      | 下载链接                                                                            |
| :------------- | :------- | :-------- | :---------------------------------------------------------------------------------- |

| **V4.2.0-beta** | 2026-01  | 🚧 可用 | [📦 下载](https://github.com/MaiCore-Start/MaiCore-Start/releases)                  |


</div>

### 🚀 安装步骤

```bash
# 方式1：使用安装程序（推荐）
# 1. 下载 MaiBotInitiate-V4.0.0.3-dev-Install.exe
# 2. 双击运行，按提示完成安装
# 3. 安装完成后可使用全局命令启动

mcs420b

# 方式2：从源码运行
git clone https://github.com/MaiCore-Start/MaiCore-Start.git
cd MaiCore-Start
pip install -r requirements.txt
python run.py
```

### ⚡ 快速上手（5分钟教程）

```mermaid
graph LR
    A[启动程序] --> B[选择 F - 部署实例]
    B --> C[选择版本部署]
    C --> D[自动下载并配置]
    D --> E[创建配置集]
    E --> F[选择 A - 运行麦麦]
    F --> G[开始使用]
  
    style A fill:#e1f5ff
    style G fill:#c8e6c9
```

**第一次使用？跟着这个流程走：**

1. **📦 部署实例** `[F] → [A]`

   - 选择推荐版本（如 0.11.6-beta）
   - 等待自动下载和配置完成
   - 系统会自动创建配置集
2. **🚀 启动麦麦** `[A]`

   - 选择刚创建的配置集
   - 选择启动模式（推荐"主程序+适配器+控制面板"）
   - 在浏览器中打开 http://localhost:7999 进行配置
3. **✅ 开始使用**

   - 配置QQ账号、API密钥等信息
   - 享受智能对话机器人服务！

### 📖 详细功能导航

<details>
<summary><strong>🔍 点击展开完整菜单结构</strong></summary>

```yaml
主菜单:
  A - 启动实例/实例多开:
    功能: 启动已配置的麦麦实例/多个实例运行
    选项:
      1: 仅启动主程序
      2: 主程序 + 适配器
      3: 主程序 + 适配器 + NapCat
      4: 主程序 + 适配器 + 控制面板 (推荐)
      5: 主程序 + 适配器 + NapCat + 控制面板 (完整模式)
      6: 高级启动 (自定义组件组合)
  
  B - 配置管理:
    A - 自动检索麦麦: 自动发现本地麦麦实例并创建配置
    B - 手动配置: 手动指定各组件路径
    C - 配置管理:
      A: 查看配置详情
      B: 直接编辑配置文件 (TOML)
      C: 可视化编辑配置 (Web界面)
      D: 验证配置可用性
      E: 新建配置集
      F: 删除配置集
      G: 打开配置文件所在文件夹
  
  C - 知识库构建:
    A: LPMM知识库一条龙构建 (文本分割 + 实体提取 + 导入)
    B: 仅文本分割
    C: 仅实体提取
    D: 仅知识图谱导入
    E: 旧版知识库构建 (0.6.0-alpha及更早)
  
  D - 数据库迁移:
    功能: MongoDB → SQLite 数据迁移
    支持: 0.7.0以下版本的数据迁移
  
  E - 插件管理:
    状态: 🚧 开发中
  
  F - 部署辅助系统:
    A - 实例部署: 
      支持版本:
        - classical (经典版)
        - 0.6.x-alpha
        - 0.7.0/8.0/9.0-alpha
        - 0.10.0-alpha (最新)
        - dev/main (开发版)
    B - 实例更新: 将现有实例更新到任意版本
    C - 实例删除: 完整删除实例及其配置
  
  G - 查看运行状态:
    A: 刷新状态 (显示所有进程及资源占用)
    B: 停止所有进程
  
  H - 杂项:
    A: 关于本程序
    B: 程序设置:
      - 日志保留天数
      - 退出时进程处理策略
      - 最小化到托盘开关
      - Windows通知开关
      - 主题颜色配置
    C: 组件下载 (Python/Node.js/MongoDB等)
    D: 查看实例运行数据统计
  
  Q - 退出程序: 安全退出（可选择保留/关闭后台进程）
```

</details>

---

## 📊 进程监控刷新设置（新增）

**用途**：自定义进程监控的刷新节奏，在不同机器间平衡实时性与 CPU 占用。

**可调参数**：
- 数据刷新间隔：获取进程表的周期（默认 2.0 秒，最小 0.5 秒）。
- UI 刷新间隔：重绘界面的周期（默认 0.3 秒，最小 0.1 秒）。
- 输入轮询间隔：检查键盘输入的周期（默认 0.05 秒，最小 0.01 秒）。

**通过界面调整**：主菜单 `H` → 程序设置 `B` → 进程监控刷新间隔 `M`，按提示输入新值（回车可保留当前值）。

**通过配置文件调整**：修改 `config/P-config.toml`，在 `[monitor]` 下设置：

```toml
[monitor]
data_refresh_interval = 2.0   # 数据刷新
ui_refresh_interval = 0.3      # UI 重绘
input_poll_interval = 0.05     # 输入轮询
```

**生效方式**：保存设置后，新开启的“进程状态监控”界面将使用最新参数。

**建议**：
- 低功耗模式：数据 3~5 秒，UI 0.5~1 秒，输入 0.1~0.2 秒。
- 高实时模式：保持默认或略微调低，但避免低于最小值以免占用升高。

---

## 🎛️ 功能详解

### 📋 主菜单功能概览

<div align="center">


| 选项       | 功能类别 | 功能名称   | 核心价值                                  |
| :--------- | :------- | :--------- | :---------------------------------------- |
| **🚀 A**   | 启动类   | 运行麦麦   | 灵活的组件化启动、多进程管理              |
| **🔧 B**   | 配置类   | 配置管理   | 多实例管理、可视化编辑                    |
| **🧠 C**   | 功能类   | 知识库构建 | 智能知识管理、多模型支持                  |
| **📊 D**   | 功能类   | 数据库迁移 | MongoDB→SQLite无缝迁移（仅部分版本可用） |
| **🧩 E**   | 功能类   | 插件管理   | 仅支持MaiBot                                 |
| **📦 F**   | 部署类   | 部署系统   | 自动化部署、版本管理                      |
| **📊 G**   | 监控类   | 运行状态   | 实时进程监控、批量操作                    |
| **⚙️ H** | 设置类   | 杂项设置   | 个性化定制、主题配置                      |
| **👋 Q**   | 退出类   | 安全退出   | 优雅退出、进程清理                        |

</div>

### 🎯 核心功能详解

<details>
<summary><strong>🚀 组件化启动系统</strong></summary>

**启动模式：**

- **模式1** - 仅主程序：纯命令行使用
- **模式2** - 主程序+适配器：基础QQ机器人
- **模式3** - 主程序+适配器+NapCat：完整QQ功能
- **模式4** - 主程序+适配器+控制面板：Web管理界面（推荐）
- **模式5** - 完整模式：生产环境首选
- **高级模式** - 自定义组合：专业用户

**技术特性：**

- ✅ 独立进程管理，组件互不影响
- ✅ 自动端口分配，避免冲突
- ✅ 实时状态监控与异常恢复
- ✅ 优雅关闭机制

</details>

<details>
<summary><strong>🔧 配置管理系统</strong></summary>

**配置文件示例：**

```toml
[mai_config]
name = "我的麦麦实例"
bot_type = "MaiBot"
mai_path = "D:/MaiBot/bot.py"
adapter_path = "D:/MaiAdapter/main.py"
napcat_path = "D:/NapCat"
webui_path = "D:/MaiBot-Dashboard"
```

**功能：**

- 📝 TOML格式，易读易写
- 🌐 Web可视化编辑器
- ✅ 实时配置验证
- 📦 配置导入/导出

</details>

<details>
<summary><strong>📦 自动化部署系统</strong></summary>

**支持版本：**

- ✅ **0.11.0-alpha** - 推荐（⭐⭐⭐⭐⭐）
- ✅ **0.11.6-beta** - 最新实验版
- ✅ **0.7.0/8.0-alpha** - 稳定版本
- ✅ **classical/0.6.x** - 旧版支持
- ⚠️ **dev/main** - 开发版（不稳定）

**部署流程：**

```
版本选择 → 环境检测 → 下载源码 → 安装依赖 
→ 初始化配置 → 创建配置集 → 完成 ✅
```

</details>

---

### 📋 主菜单功能一览

<div align="center">


| 选项       | 功能类别 | 功能描述           | 使用场景                              |
| :--------- | :------- | :----------------- | :------------------------------------ |
| **🚀 A**   | 启动类   | 运行麦麦           | 健壮的启动选项                        |
| **🔧 B**   | 配置类   | 多实例配置管理     | 新建/修改/删除配置                    |
| **🧠 C**   | 功能类   | 知识库构建         | 构建智能的LPMM知识库                  |
| **📊 D**   | 功能类   | 数据库迁移工具     | MongoDB→SQLite迁移（仅部分版本可用） |
| **🧩 E**   | 功能类   | 插件管理           | 管理麦麦的插件          |
| **📦 F**   | 部署类   | 实例部署与管理     | 自动化部署新实例                      |
| **📊 G**   | 进程管理 | 查看运行状态       | 便捷的管理您的麦麦进程                |
| **ℹ️ G** | 关于类   | 程序信息与更新日志 | 查看版本信息                          |
| **👋 Q**   | 退出类   | 安全退出程序       | 关闭启动器                            |

</div>

### 🎯 核心功能详解

#### 🚀 启动管理

- **麦麦本体启动 (A)**: 快速启动聊天功能
  - 包含所有组件的全功能启动
  - 自动检测NapCat运行状态
  - 智能启动MongoDB服务
  - 多窗口管理，便于调试

#### ⚙️ 配置管理 (B)

- **多实例支持**: 管理多个独立的麦麦配置
- **智能检索**: 自动发现本地麦麦程序
- **版本识别**: 自动适配不同版本的配置需求
- **路径验证**: 实时检查路径有效性和中文字符

#### 🧠 知识库构建 (C)

```mermaid
graph LR
    A[原始文本] --> B[文本分割]
    B --> C[实体提取]
    C --> D[知识图谱]
    D --> E[导入数据库]
```

- **文本分割**: 智能处理大文本文件
- **实体提取**: 多模型支持，高精度识别
- **知识图谱**: 构建结构化知识网络

#### 📦 自动化部署 (F)

支持版本：

- `classical` - 经典稳定版
- `0.6.x-alpha` - 历史版本系列
- `0.7/8/9.0-alpha` - 稳定推荐版
- `0.10.0-alpha` - 最新功能版 ⭐
- `dev` / `main` - 开发版本/主要版本

部署流程：

```
版本选择 → 环境检测 → 依赖安装 → 配置初始化 → 完成部署
```

---

## ⚙️ 系统要求

### 🖥️ 硬件要求


| 配置级别     | CPU          | 内存  | 存储空间 | 适用场景        |
| :----------- | :----------- | :---- | :------- | :-------------- |
| **最低配置** | 双核 2.0GHz  | 4GB   | 10GB     | 基础功能测试    |
| **推荐配置** | 四核 2.5GHz  | 8GB   | 20GB     | 日常使用        |
| **最佳配置** | 八核 3.0GHz+ | 16GB+ | 50GB+    | 多实例/生产环境 |

### 💻 软件要求

#### 必需环境

- **操作系统**: Windows 10/11 (64位)
- **Python**: ≥ 3.10（推荐 3.12+）
  ```bash
  python --version  # 检查版本
  ```

#### 可选组件

- **Git**: 用于实例部署和更新
  - 下载：[Git for Windows](https://git-scm.com/download/win)
- **Node.js**: 控制面板需要（程序可自动下载）
  - 版本要求：≥ 18.0
- **MongoDB**: 仅0.7.0以下版本需要
  - 7.0以上版本使用SQLite，无需MongoDB

### ⚠️ 重要注意事项

<div align="center">


| ⚠️ 限制项  | 说明               | 正确示例      | 错误示例             |
| :----------- | :----------------- | :------------ | :------------------- |
| **路径规范** | 不能包含中文       | `D:\MaiBot\`  | `D:\麦麦机器人\` ❌  |
| **特殊字符** | 避免空格和特殊符号 | `D:\Mai_Bot\` | `D:\Mai Bot!\` ❌    |
| **路径深度** | 避免过深的路径     | `D:\Bot\`     | `D:\a\b\c\d\e\f\` ❌ |
| **权限要求** | 确保完全控制权限   | ✅ 管理员权限 | ❌ 受限用户          |

</div>

### 🔍 环境检测

程序启动时会自动检测：

- ✅ Python版本及环境变量
- ✅ Git可用性
- ✅ Node.js/Bun安装状态
- ✅ 必要的系统权限
- ⚠️ 中文路径警告

---

## 🤝 社区交流

### 💬 加入我们

<div align="center">


| 平台              | 群号/链接                                                       | 用途                 | 特色                  |
| :---------------- | :-------------------------------------------------------------- | :------------------- | :-------------------- |
| **🆘 麦麦答疑群** | `1025509724`                                                    | 技术支持、知识库交流 | ⚠️ 禁止接入麦麦测试 |
| **🎮 麦麦交流群** | `902093437`                                                     | 功能测试、问题反馈   | 可以接入麦麦测试      |
| **📺 B站**        | [@小城之雪](https://space.bilibili.com/3546384380725382)        | 视频教程、更新动态   | 部署教程、问题解答    |
| **📦 GitHub**     | [MaiCore-Start](https://github.com/MaiCore-Start/MaiCore-Start) | 源码、Issues、PR     | 开源协作              |

</div>

### 📚 学习资源

- 🎥 **部署教程** - B站视频教程
- 📝 **更新日志** - [更新日志.md](更新日志.md)
- 🐛 **问题追踪** - [GitHub Issues](https://github.com/MaiCore-Start/MaiCore-Start/issues)
- 📚 **文档中心** - [文档中心](https://docs.mmcstart.cn:8850)

### 🆘 获取帮助的正确姿势

<div align="center">

```mermaid
graph TD
    A[遇到问题] --> B{查阅文档?}
    B -->|是| C{找到解决方案?}
    B -->|否| D[先查文档和教程]
    C -->|是| E[✅ 问题解决]
    C -->|否| F{搜索Issues?}
    D --> F
    F -->|找到| E
    F -->|未找到| G[询问社区]
    G --> H{选择提问对象}
    H -->|上上策| I[智慧的小草神 🌱]
    H -->|上策| J[万能的千石可乐 🥤]
    H -->|下策| K[焊武姬@一闪 / 猫娘@ikun ⚡]
    H -->|下下策| L[废物@小城之雪 ❄️]
    I --> E
    J --> E
    K --> E
    L --> E
  
    style E fill:#c8e6c9
    style I fill:#fff9c4
    style L fill:#ffccbc
```

</div>

**提问建议：**

1. 📸 提供错误截图/日志
2. 🔍 说明操作步骤
3. 💻 提供系统环境信息
4. ✅ 描述预期效果vs实际效果

---

## 📋 更新日志
### 🔥 V4.2.1-beta
- 优化新手引导，添加API获取教程
- 优化配置集UI，添加批量管理功能
### V4.2.0-beta
- 实现基于Git的部署逻辑
- 更新适配器选择逻辑，统一使用最新版启动器（main分支）
- 新增新手引导任务
- 添加基于Git的插件管理逻辑（仅支持MaiBot）

### V4.1.5-beta

实现内置/外部 WebUI 检测的复合 WebUI 管理系统
- 添加用于外部 WebUI 安装的 WebUI 下载器组件
- 实现基于版本的内置 WebUI 检测（>=0.12.2/main/dev 分支）
- 重构 WebUI 启动流程：内置版本使用代理端口 8001，外部版本使用独立端口
- 使用 Rich 组件和重试机制增强下载进度显示
- 更新组件管理器以支持新的 WebUI 下载器
- 改进部署和配置系统中对机器人类型的识别
- 为内置 WebUI 版本添加多实例端口冲突解决方案
- 更新 MoFox-Core 和存储库引用
- 增强启动器以区分内置和外部 WebUI 的处理方式

重大变更：WebUI 配置处理方式已重构。内置 WebUI 版本自动使用代理端口 8001，而外部 WebUI 版本沿用之前的独立端口模型。现有配置将根据版本检测自动进行适配。

### V4.1.0-beta

**架构升级：**

- 🏗️ 重构为面向对象设计
- 🧩 模块化组件系统
- 📝 结构化日志（structlog）
- 🎨 现代化UI（rich库）

**新增功能：**

- ✨ Web控制面板支持
- ✨ 系统托盘最小化
- ✨ Windows通知集成
- ✨ 组件下载管理器
- ✨ 实例运行数据统计

**优化改进：**

- ⚡ 启动速度提升30%+
- 💾 内存占用降低20%
- 🔍 错误诊断更精确
- 🎯 配置验证更完善

---

#### V4.1.1-beta~V4.1.3-beta

**优化改进**
- 修复Windows通知的依赖库需要本地编译的问题
- 添加进程监控的刷新频率设置 #4 
- 修复MaiBot控制面板的部署BUG
- 优化部分菜单文本

**新增功能**
- 添加更加严格的Python版本检测机制
- 新增实例多开功能，智能分配端口

**引入新的编程语言-C++**
- 引入C++作为新的编程语言，编写MCStart的启动模块及虚拟环境创建模块，缩小程序体积
---

<details>
<summary><strong>📚 查看历史版本</strong></summary>

## 🔥 V4.1.x-beta
### V4.1.0
**架构升级**
- 重构为面向对象设计
- 引入模块化组件系统
- 使用 structlog 记录结构化日志
- 基于 rich 的现代化命令行 UI

**新增功能**
- Web 控制面板支持（Dashboard）
- 系统托盘最小化
- Windows 通知集成
- 组件下载管理器（Python / Node.js / MongoDB 等）
- 实例运行数据统计

**优化改进**
- 启动速度提升约 30%+
- 内存占用降低约 20%
- 错误诊断信息更完整、定位更精准
- 配置验证流程更完善，减少配置类错误

### ~~V4.1.4
- 启动模块及虚拟环境创建模块使用C编写，缩小程序体积
- 支持MoFox-Core及MoFoxWebUI部署
- 优化菜单文本

### V4.0.0.3 (2024-12)

**新增：**

- 📦 部署辅助系统完善
- 🔄 实例更新功能
- 📊 进程状态监控
- ℹ️ 关于程序界面

**修复：**

- 🐛 部署流程稳定性问题
- 🐛 多实例配置冲突
- 🐛 路径验证误报

### V4.0.0 (2024-11)

**重大更新：**

- 🏗️ 全新架构设计
- 🧩 组件化启动系统
- 🌐 可视化配置编辑
- 📊 实时进程管理
- 🎨 Rich UI界面

### V3.4.2

**新增：**

- 📝 实例更新功能完善
- ℹ️ 关于本程序增强

**修复：**

- 🔧 部署系统稳定性

### V3.4.0

**重大更新：**

- 📦 部署辅助系统
- 🗑️ 实例删除功能
- 🎨 RGB彩色输出
- 🔒 许可证变更（MIT → Apache 2.0）

**优化：**

- 🎯 菜单重新设计
- ⚙️ 配置流程优化
- 🚀 启动逻辑增强

### V3.3

- 🔄 JSON → TOML配置迁移
- 🎯 多实例管理
- 🔀 数据库迁移工具

### V3.2

- 🧠 LPMM知识库支持
- 📋 子菜单系统
- 🔒 操作确认机制

### V3.1

- 🐍 PowerShell → Python迁移
- 🎨 彩色终端
- 🔍 智能路径检索

### V2.x - V1.x

- 🚀 NapCat集成
- 📝 配置管理系统
- ⚙️ 基础功能实现

</details>

---

## 🔧 故障排查

### 🚨 常见问题及解决方案

<details>
<summary><strong>❌ 启动失败 / 进程异常退出</strong></summary>

**问题诊断：**

1. **检查路径配置**

   ```
   ❌ 错误: C:\用户\麦麦\bot.py  (包含中文)
   ✅ 正确: D:\MaiBot\bot.py     (纯英文)
   ```
2. **验证文件完整性**

   ```bash
   # 检查必需文件是否存在
   dir D:\MaiBot\bot.py
   dir D:\MaiAdapter\main.py
   ```
3. **Python版本检查**

   ```bash
   python --version  # 应该 ≥ 3.10
   ```
4. **查看详细日志**

   - 位置：`log/` 目录下的`.jsonl`文件
   - 查找ERROR级别的错误信息

**解决方案：**

- 🔧 重新配置正确路径
- 📦 重新部署实例
- 🔄 更新Python版本
- 📝 根据日志提示修复问题

</details>

<details>
<summary><strong>🔄 数据库迁移失败</strong></summary>

**检查清单：**

1. **MongoDB服务状态**

   ```powershell
   # 检查MongoDB是否运行
   Get-Service | Where-Object {$_.Name -like "*MongoDB*"}

   # 或在CMD中
   net start | findstr MongoDB
   ```
2. **迁移脚本存在性**

   ```bash
   # 确认脚本路径
   dir D:\MaiBot\mongodb_to_sqlite.bat
   ```
3. **数据库连接配置**

   - 检查MongoDB连接字符串
   - 验证数据库名称正确性

**解决方案：**

- 🔄 启动MongoDB服务
- 📝 检查配置文件中的数据库设置
- 🔍 查看迁移日志了解具体错误

</details>

<details>
<summary><strong>📦 部署中断 / 下载失败</strong></summary>

**原因分析：**


| 问题         | 原因           | 解决方案           |
| :----------- | :------------- | :----------------- |
| 网络超时     | GitHub访问受限 | 使用代理/镜像源    |
| 磁盘空间不足 | 可用空间<1GB   | 清理磁盘，保留2GB+ |
| 权限不足     | 用户权限受限   | 以管理员身份运行   |
| Git未安装    | 缺少Git环境    | 下载安装Git        |

**推荐操作：**

```bash
# 1. 配置Git代理（科学上网）
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 2. 使用镜像源（国内）
git clone https://gitee.com/mirrors/...  # 程序会自动尝试
```

</details>

<details>
<summary><strong>🌐 Web控制面板无法访问</strong></summary>

**检查步骤：**

1. **确认Dashboard进程运行**

   - 在"查看运行状态"中检查
   - 应显示`bun run dev`进程
2. **端口占用检查**

   ```powershell
   # 检查7999端口是否被占用
   netstat -ano | findstr :7999
   ```
3. **浏览器访问**

   ```
   http://localhost:7999
   http://127.0.0.1:7999
   ```
4. **防火墙规则**

   - 检查Windows防火墙是否阻止
   - 添加7999端口入站规则

**解决方案：**

- 🔄 重启Dashboard组件
- 🔌 更换端口（修改配置）
- 🛡️ 配置防火墙规则

</details>

<details>
<summary><strong>🔐 权限/执行策略问题</strong></summary>

**PowerShell执行策略：**

```powershell
# 查看当前策略
Get-ExecutionPolicy

# 设置为RemoteSigned
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# 或临时绕过
PowerShell -ExecutionPolicy Bypass -File script.ps1
```

**文件夹权限：**

1. 右键文件夹 → 属性 → 安全
2. 编辑 → 添加当前用户
3. 勾选"完全控制"

**管理员权限：**

- 右键程序 → 以管理员身份运行
- 或在快捷方式属性中设置"始终以管理员身份运行"

</details>

<details>
<summary><strong>💾 配置丢失 / 损坏</strong></summary>

**恢复步骤：**

1. **查找备份配置**

   ```
   config/config.toml.bak
   config/config.toml.old
   ```
2. **重新创建配置**

   - 使用`[B] → [C] → [E]`新建配置
   - 手动填写路径信息
3. **验证配置**

   - 使用`[B] → [C] → [D]`验证配置
4. **导入配置**

   - 如果有其他设备的配置备份
   - 直接复制`config.toml`文件

</details>

### 🆘 需要更多帮助？

如果以上方法无法解决问题：

1. 📸 **准备信息**：

   - 错误截图
   - 日志文件（`log/`目录）
   - 系统信息（Windows版本、Python版本）
   - 操作步骤
2. 💬 **寻求帮助**：

   - GitHub Issues: 提交详细问题报告
   - QQ群：1025509724（答疑群）或902093437（交流群）
   - B站私信：@小城之雪

---

## 📄 许可证

本项目采用 [Apache License 2.0](LICENSE) 开源许可证。

<details>
<summary><strong>📜 查看许可证摘要</strong></summary>

### ✅ 您可以：

- ✔️ **商业使用** - 用于商业项目
- ✔️ **修改** - 修改源代码
- ✔️ **分发** - 分发原始或修改后的代码
- ✔️ **专利使用** - 使用贡献者的专利
- ✔️ **私有使用** - 私下使用和修改

### ⚠️ 您必须：

- 📋 **包含许可证** - 保留原始许可证和版权声明
- 📝 **声明更改** - 标明对源代码的修改
- 🔔 **提供通知** - 包含NOTICE文件（如果存在）

### ❌ 限制：

- 🚫 **商标使用** - 不授予商标权
- 🚫 **责任** - 提供"按原样"，无保证
- 🚫 **保修** - 无任何形式的保修

</details>

```text
Copyright (c) 2023-2025 MaiCore-Start Team

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## 🌟 贡献者

### 核心团队

<div align="center">


| 贡献者                                     | 角色                    | 主要贡献               |
| :----------------------------------------- | :---------------------- | :--------------------- |
| **[@xiaoCZX](https://github.com/xiaoCZX)** | 项目发起人 & 主要开发者 | 整体架构、核心功能     |
| **[@一闪](https://github.com/)**           | 核心贡献者              | V4.0架构重构、技术支持 |
| **其他贡献者**                             | -                       | Bug修复、功能建议      |

</div>

### 🙏 特别鸣谢

- 💡 所有提供建议和反馈的用户
- 🐛 提交Bug报告的测试者
- 📝 完善文档的贡献者
- ⭐ 给予Star支持的开发者

### 🤝 如何贡献

1. **Fork** 本项目
2. **创建**特性分支 (`git checkout -b feature/AmazingFeature`)
3. **提交**更改 (`git commit -m 'Add some AmazingFeature'`)
4. **推送**到分支 (`git push origin feature/AmazingFeature`)
5. **提交** Pull Request

---

<div align="center">

### 🌟 如果这个项目对您有帮助，请给一个Star！

[![GitHub stars](https://img.shields.io/github/stars/MaiCore-Start/MaiCore-Start?style=social)](https://github.com/MaiCore-Start/MaiCore-Start/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/MaiCore-Start/MaiCore-Start?style=social)](https://github.com/MaiCore-Start/MaiCore-Start/network/members)
[![GitHub watchers](https://img.shields.io/github/watchers/MaiCore-Start/MaiCore-Start?style=social)](https://github.com/MaiCore-Start/MaiCore-Start/watchers)

---

**Made with ❤️ by [MaiCore-Start Team](https://github.com/MaiCore-Start) and [Contributors](https://github.com/MaiCore-Start/MaiCore-Start/graphs/contributors)**

*<p align="center">促进多元化艺术创作发展普及</p>*

---

```
ooo        ooooo  .oooooo.           .oooooo..o     .                          .   
 &&.       .&&&` d&P`  `Y&b         d&P`    `Y&   .o&                        .o&  
 &&&b     d'&&& &&&                 Y&&bo.      .o&&&oo  .oooo.   ooo  q&b .o&&&oo
 & Y&&. .P  &&& &&&         &&&&&&&  `*Y&&&&o.    &&&   `P  )&&   `&&&``&P   &&&  
 &  `&&&'   &&& &&&         *******      `“Y&&b   &&&    .oP&&&    &&&       &&&  
 &    Y     &&& `&&b    ooo         oo     .d&P   &&& . d&(  &&&   &&&       &&& .
o&o        o&&&o `Y&bood&P'         &*`&&&&&P'    `&&&` `Y&&&``qo d&&&b      `&&&`
```

**MaiCore-Start - 让AI聊天机器人部署更简单** 🚀

</div>

---

## 📊 项目统计

<div align="center">

### 仓库活跃度

![Alt](https://repobeats.axiom.co/api/embed/bcff8618d3f09eea1081f4fbcfb9fde5e464409a.svg "Repobeats analytics image")

### Star历史

[![Star History Chart](https://api.star-history.com/svg?repos=MaiCore-Start/MaiCore-Start&type=Date)](https://star-history.com/#MaiCore-Start/MaiCore-Start&Date)

### 贡献统计

![GitHub Contributors Image](https://contrib.rocks/image?repo=MaiCore-Start/MaiCore-Start)

</div>

---

<div align="center">

**[⬆ 回到顶部](#-maicore-start-麦麦核心启动器)**

</div>
