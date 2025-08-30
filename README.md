# 由于官方启动器完善，该启动器GUI开发将自今日起无限期停更
> # [官方启动器](https://github.com/MaiM-with-u/mailauncher)
> # [官方启动器后端](https://github.com/MaiM-with-u/mailauncher-backend?tab=readme-ov-file)

# MaiMbot一键启动V3.4.2/V3.4.2-PATH版-适配0.6.2、0.6.3、0.7.0等，同时向下兼容，适配更旧版的麦麦
当前一键启动程序适配最新的0.7.0版本，以及向前兼容所有版本，若后续麦麦的启动原理相同，则同样适配。
V3.4.2-PATH版可将程序的安装目录添加至系统环境变量，支持支持在任何命令行中通过输入`mbl`的方式启动。
# 目录

- [使用说明摘要](#麦麦启动器控制台-新版v342-使用说明摘要)
- [使用说明](#麦麦启动器控制台使用说明-1)
- [更新日志](#更新日志)
- [下载启动器V3.4.2](https://github.com/xiaoCZX/MaiMbot-initiate/releases/tag/v3.4.2)
- [下载启动器V3.4.2-PATH](https://github.com/xiaoCZX/MaiMbot-initiate/releases/tag/v3.4.2-PATH)

# 交流与分享
对麦麦部署有疑问的，可以来我的**麦麦答疑群（1025509724）**（本群禁止接入麦麦），这里不仅有顶级大佬帮你解决问题（还是推荐自己看文档解决），还可以在这里交流分享大家的知识库。

你也可以在**麦麦交流群（902093437）** 接入自己的麦麦进行测试与调整。

同时我也会在**B站**发布部署和配置麦麦的教程。
**[B站主页链接：]** (https://space.bilibili.com/3546384380725382)

# 麦麦启动器控制台 (新版V3.4.2) 使用说明摘要

以下是一份简洁的麦麦启动器使用说明摘要：

---

### 🌈 麦麦启动器使用说明

#### 核心功能：
1. **启动类**：
   - `A`：运行麦麦本体
   - `B`：运行麦麦+NapCatQQ+MongoDB

2. **配置类**：
   - `C`：管理多实例配置（创建/修改/检查）

3. **功能类**：
   - `D`：LPMM知识库构建（文本分割/实体提取）
   - `E`：知识库迁移（MongoDB→SQLite）

4. **部署类**：
   - `F`：实例管理（部署/更新/删除实例）
   - 支持版本：classical/0.6.0~0.7.0/dev/main

5. **关于类**：
   - `G`：查看程序信息/更新日志

6. **退出**：
   - `Q`：退出程序

---

### 🚀 快速上手：
1. **首次使用**：
   - 通过`F`部署新实例（需Git环境）
   - 通过`C`配置路径

2. **日常使用**：
   - 选择`A`或`B`启动麦麦
   - 使用`D`构建知识库

3. **维护操作**：
   - `F`→`C`：更新实例（需Git环境）
   - `F`→`B`：删除不再需要的实例
   - `E`：数据库迁移（旧版→新版）

---

### ⚠️ 重要提示：
1. **路径要求**：
   - 所有路径**不能包含中文**
   - 建议使用英文路径

2. **更新建议**：
   - 更新前**必须备份**：
     - `.env`文件
     - `bot_config.toml`
     - `MaiBot.db`(0.7.0+)
   - 推荐部署新实例而非更新

3. **Git要求**：
   - 实例更新功能需要安装Git
   - [下载Git：](https://git-scm.com/downloads)

---

### ℹ️ 更多信息：
[GitHub仓库：](https://github.com/xiaoCZX/MaiMbot-initiate)

---

# 麦麦启动器控制台使用说明

> # V3.4.2版本启动器功能一浏览

  ![alt text](新功能.png)

# 配置管理系统

> **核心功能：**

  - 多实例管理：支持创建多个独立配置

  - 智能路径验证：自动检测中文路径问题

  - 版本自适应：自动识别新旧版本配置需求

> **操作流程**
  ![alt text](功能实现.png)

# 部署辅助系统（新增核心功能）

> **支持版本：**

  - classical

  - 0.6.0-alpha

  - 0.6.2-alpha

  - 0.6.3-alpha

  - 0.6.3-fix3-alpha

  - 0.6.3-fix4-alpha

  - 0.7.0-alpha（最新推荐）

  - dev

  - main

> ## **部署流程：**

  ![alt text](部署流程.png)

  **关键步骤说明：**

  1. 版本选择：输入完整版本号（如0.7.0-alpha）

  2. 环境检测：

    - 自动检查Python 3.10+

    - 旧版本自动检测MongoDB

    - 依赖安装：

  3. 自动创建虚拟环境

    - 使用国内镜像加速安装

    - 配置引导：

    - 自动生成配置文件模板

  4. 提示关键配置位置：

    - .env (API密钥)

    - bot_config.toml (核心配置)

    - lpmm_config.toml (知识库配置)

> ## **实例删除功能**

  **安全防护机制：**

  ![alt text](安全防护.png)

  **删除内容：**

  1. 麦麦本体程序文件

  2. 适配器程序文件（新版本）

  3. 配置集信息

  4. 保留项：数据库文件（需手动备份）

  >特别提示：0.7.0-alpha版本的数据库为MaiBot.db文件

### 麦麦启动器控制台使用说明

---

#### 🚀 一、程序概述
麦麦启动器是一款便捷工具，旨在简化麦麦程序的启动流程，并集成相关程序的启动与配置管理功能。用户通过选择不同选项，可实现管理、部署和运行基于MaiBot框架的聊天机器人实例。支持多实例管理、版本部署、知识库构建等功能，提供直观的彩色交互界面。

---

#### 🛠 二、运行环境要求
1. **操作系统**：Windows（已测试Win10/11）
2. **Python版本**：≥3.10（推荐3.12+）
3. **依赖库**：
   ```bash
   pip install toml requests colorama tqdm
   ```

---

#### 📥 三、启动程序
直接运行主程序：
```bash
MaiLauncher-v3.4.2.exe
```

---

## 🎛️ 功能详解

### 📋 主菜单功能一览

<div align="center">

| 选项 | 功能类别 | 功能描述 | 使用场景 |
|:----|:--------|:----------|:----------|
| **🚀 A** | 启动类 | 运行麦麦 | 健壮的启动选项 |
| **🔧 B** | 配置类 | 多实例配置管理 | 新建/修改/删除配置 |
| **🧠 C** | 功能类 | 知识库构建 | 构建智能的LPMM知识库 |
| **📊 D** | 功能类 | 数据库迁移工具 | MongoDB→SQLite迁移 |
| **🧩 E** | 功能类 | 插件管理 | 管理麦麦的插件（目前只是UI） |
| **📦 F** | 部署类 | 实例部署与管理 | 自动化部署新实例 |
| **📊 G** | 进程管理 | 查看运行状态 | 便捷的管理您的麦麦进程 |
| **ℹ️ G** | 关于类 | 程序信息与更新日志 | 查看版本信息 |
| **👋 Q** | 退出类 | 安全退出程序 | 关闭启动器 |

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

### 🖥️ 基础环境

- **操作系统**: Windows 10/11 (x64)
- **Python**: ≥ 3.10 (推荐 3.12+)
- **内存**: ≥ 4GB RAM
- **存储**: ≥ 10GB 可用空间

### 🔧 可选组件

- **Git**: 用于实例更新和部署
- **MongoDB**: 旧版本（<0.7.0）需要
- **NapCat**: QQ机器人适配器

### ⚠️ 重要注意事项

- 🚫 **路径限制**: 所有路径**不能包含中文字符**
- 📁 **推荐路径**: `D:\MaiBot\` 等纯英文路径
- 🔒 **权限要求**: 确保有足够的文件夹访问权限

---

## 🤝 社区交流

### 💬 QQ群组

- **🆘 麦麦答疑群**: `1025509724`
  
  - 专业技术支持
  - 知识库分享交流
  - ⚠️ 禁止接入麦麦测试
- **🎮 麦麦交流群**: `902093437`
  
  - 麦麦功能测试
  - 实时交流互动
  - 问题反馈收集

### 📺 视频教程

- **B站主页**: [小城之雪](https://space.bilibili.com/3546384380725382)
- 🎥 **过时**部署教程（仅做部署参考）
- 🛠️ 配置优化指南
- 🐛 常见问题解决

### 🆘 技术支持优先级

- **上上策**：询问智慧的小草神
- **上策**：询问万能的千石可乐
- **中策**：不用
- **下策**：进群询问焊武姬@一闪 / 神秘NPC猫娘@ikun两年半
- **下下策**：询问一个废物@小城之雪

*建议优先查阅文档和教程自行解决问题，或在社区寻求帮助。*

---

## 📋 更新日志

<details>
<summary><strong>🔥 V4.0.0 (当前版本)</strong></summary>

- **🏗️ 全新架构**：采用面向对象的设计，代码更清晰、可维护性更高。
- **🧩 组件化启动**：实现按需、动态、灵活的启动组合，资源占用更少。
- **🌐 可视化配置**：新增基于 Web 的配置编辑器，告别手动修改 `config.toml`。
- **📊 进程状态管理**：提供实时的进程监控面板，轻松掌握运行状态。
- **🎨 现代化UI**：基于 `rich` 库重制精美的命令行界面，视觉体验升级。
- **🔌 插件化框架**：为未来的功能扩展奠定坚实基础，更具拓展性。

</details>

<details>
<summary><strong>📚 历史版本</strong></summary>

<details>
<summary><strong>🚀 V3.4.2 - 重大更新</strong></summary>

### ✨ 新增功能

- 📝 完善 `[F] → [G] 实例更新` 功能
- ℹ️ 增强 `[G] 关于本程序` 选项

### 🐛 问题修复

- 🔧 优化部署辅助系统稳定性

</details>

<details>
<summary><strong>🚀 V3.4.0 - 重大更新</strong></summary>

### 🆕 新增功能

1. **📦 部署辅助系统**
   
   - 支持一键部署多版本麦麦实例
   - 自动检测和引导安装依赖环境
   - 内置版本更新日志查询
   - 部署完成后自动创建配置集
2. **🗑️ 实例删除功能**
   
   - 支持彻底删除实例文件
   - 智能释放磁盘空间
3. **🎨 界面优化**
   
   - RGB彩色输出系统
   - 美观的控制台界面

### 🔧 功能优化

- 🎯 菜单界面重新设计，按功能分类
- ⚙️ 配置管理流程优化
- 🚀 启动逻辑增强，提高兼容性
- 🛡️ 路径验证机制强化

### 🔒 安全更新

- 📄 开源许可证从 MIT 变更为 Apache 2.0

</details>

### V3.3

- 🔄 配置文件格式从JSON迁移到TOML
- 🎯 多实例管理系统
- 🔀 数据库迁移工具 (MongoDB→SQLite)

### V3.2

- 🧠 LPMM知识库构建支持
- 📋 子菜单系统
- 🔒 操作确认机制

### V3.1

- 🐍 从PowerShell脚本迁移到Python
- 🎨 彩色终端输出
- 🔍 智能路径检索

### V3.0

- 🚀 新增NapCat集成启动
- 📝 拖拽路径输入支持
- 🛠️ 错误处理增强

### V2.x

- 📋 模块化配置管理
- ✅ 智能路径验证
- 🔄 容错机制

### V1.x

- 🎯 基础启动功能
- ⚙️ 初始配置系统

</details>

---

## 🔧 故障排查

### 🚨 常见问题

<details>
<summary><strong>❌ 启动失败</strong></summary>

1. **检查路径问题**
   
   ```
   ❌ C:\用户\麦麦\bot.py  (包含中文)
   ✅ D:\MaiBot\bot.py     (纯英文路径)
   ```
2. **验证文件存在性**
   
   - 确认 `bot.py` 存在于麦麦本体路径
   - 确认 `main.py` 存在于适配器路径
3. **检查Python版本**
   
   ```bash
   python --version  # 应该 ≥ 3.10
   ```

</details>

<details>
<summary><strong>🔄 数据库迁移失败</strong></summary>

1. **确认MongoDB服务状态**
   
   ```bash
   # 检查MongoDB服务是否运行
   net start | findstr MongoDB
   ```
2. **检查迁移脚本**
   
   - 确认存在 `mongodb_to_sqlite.bat`
   - 验证脚本执行权限

</details>

<details>
<summary><strong>📦 部署中断</strong></summary>

1. **网络连接**
   
   - 确保网络连接稳定
   - 建议使用科学上网工具
2. **磁盘空间**
   
   - 至少保留 10GB+ 可用空间
   - 检查目标磁盘是否有写权限
3. **Git环境**
   
   - 确认已安装Git
   - 验证Git可以正常访问GitHub

</details>

### 🛠️ 权限问题解决

如果遇到权限相关错误：

1. **检查执行策略** (PowerShell)
   
   ```powershell
   Get-ExecutionPolicy
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
2. **确认文件夹权限**
   
   - 右击文件夹 → 属性 → 安全
   - 确保当前用户有完全控制权限
3. **以管理员身份运行**
   
   - 右击程序 → 以管理员身份运行

---

## 📄 许可证

本项目采用 [Apache License 2.0](LICENSE) 开源许可证。

```
Copyright (c) 2023-2025 xiaoCZX

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

<div align="center">

### 🌟 如果这个项目对您有帮助，请给一个Star！

*<p align="center">促进多元化艺术创作发展普及</p>*

**Made with ❤️ by [xiaoCZX](https://github.com/xiaoCZX) and other contributors**

```
88b         d88           88 888888ba                                ,ad88ba,  88                                
888         888           "" 88    "8b            88                d8"'  `"8b 88                    88     
888b       d888              88    ,8P            88               d8'         88                    88     
88 8b     d8'88 ,adPYYba, 88 88aaaa8P'  ,adPYba,  88MMM            88          88,dPPYba,  ,adPPYba, 88MMM  
88 `8b   d8' 88 ""    `Y8 88 88“”“”8b, a8"    "8a 88     aaaaaaaa  88          88P'    "8a ""    `Y8 88     
88  `8b d8'  88 ,adPPPP88 88 88    `8b 8b      d8 88     “”“”“”“”  Y8,         88       88 ,adPPPP88 88     
88   `888'   88 88,   ,88 88 88    a8P "8a,  ,a8" 88,               Y8a.  .a8P 88       88 88,   ,88 88,    
88           88 `"8bdP"Y8 88 888888P"   `"YbdP"'   "Y888             `"Y88Y"'  88       88 `"8bdP"Y8  "Y888
```

</div>

## 仓库状态

![Alt](https://repobeats.axiom.co/api/embed/ff5f6f1d31a3efb31d5d7c64d3eec1899fd93cda.svg "Repobeats analytics image")

## star统计

![GitHub Star Chart](https://starchart.cc/xiaoCZX/MaiMbot-initiate.svg)

