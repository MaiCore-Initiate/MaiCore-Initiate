<div align="center">

# 🚀 MaiMbot 一键启动器 V4.0.0

**智能聊天机器人一站式部署与管理工具**

[![GitHub release](https://img.shields.io/github/v/release/xiaoCZX/MaiMbot-initiate?style=for-the-badge&logo=github)](https://github.com/xiaoCZX/MaiMbot-initiate/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg?style=for-the-badge&logo=python)](https://www.python.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey.svg?style=for-the-badge&logo=windows)](https://www.microsoft.com/windows/)

</div>

---

## ⚠️ 重要通知

> ### 官方启动器已发布
> 
> 🎉 由于官方启动器功能日趋完善，本启动器的GUI开发将**无限期停更**
> 
> - 🔗 [官方启动器](https://github.com/MaiM-with-u/mailauncher) - 推荐使用
> - 🔗 [官方启动器后端](https://github.com/MaiM-with-u/mailauncher-backend) - 后端支持
> 
> *本启动器将继续维护命令行版本，为有特殊需求的用户提供支持*

---

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

- **🚀 一键启动** - 支持麦麦本体、适配器、NapCat、MongoDB的集成启动
- **🔧 多实例管理** - 支持创建、管理多个独立的麦麦实例
- **📦 自动化部署** - 支持classical、0.6.x至0.8.x版本的一键部署
- **🧠 知识库构建** - 集成LPMM知识库构建工具（文本分割、实体提取）
- **🔄 数据迁移** - MongoDB到SQLite的无缝迁移工具
- **🎨 可视化界面** - 彩色控制台界面，操作直观友好

### 🌟 高级特性

- **🛡️ 智能路径验证** - 自动检测中文路径问题，避免常见错误
- **⚡ 版本自适应** - 自动识别新旧版本，采用对应启动策略
- **🔒 安全防护** - 多重确认机制，防止误操作导致数据丢失
- **🌐 环境检测** - 自动检测Python、Git、MongoDB等依赖环境

---

## 📥 快速开始

### 🔽 下载安装

| 版本 | 描述 | 下载链接 |
|------|------|----------|
| **V4.0.0 标准版** | 基础版本，功能完整 | [📦 下载](https://github.com/xiaoCZX/MaiMbot-initiate/releases/tag/v4.0.0) |
| **V4.0.0-PATH 增强版** | 添加环境变量支持，可通过 `mbl` 命令全局启动 | [📦 下载](https://github.com/xiaoCZX/MaiMbot-initiate/releases/tag/v4.0.0-PATH) |

### 🚀 启动程序

```bash
# 双击运行
MaiLauncher-v4.0.0.exe

# 或使用 PATH 版本的全局命令
mbl
```

### ⚡ 快速上手指南

1. **🆕 首次使用**
   
   ```
   运行程序 → 选择 F (部署新实例) → 选择版本 → 自动配置
   ```
2. **📝 配置管理**
   
   ```
   选择 C → 新建配置集 → 设置路径 → 保存配置
   ```
3. **🎯 日常启动**
   
   ```
   选择 A (仅麦麦) 或 B (完整启动) → 选择实例 → 启动
   ```

---

## 🎛️ 功能详解

### 📋 主菜单功能一览

<div align="center">

| 选项 | 功能类别 | 功能描述 | 使用场景 |
|:----|:--------|:----------|:----------|
| **🚀 A** | 启动类 | 仅运行麦麦本体 | 日常使用，轻量启动 |
| **🔥 B** | 启动类 | 完整启动（麦麦+适配器+NapCat+MongoDB） | 完整功能，生产环境 |
| **⚙️ C** | 配置类 | 多实例配置管理 | 新建/修改/删除配置 |
| **🧠 D** | 功能类 | LPMM知识库构建 | 构建智能知识库 |
| **🔄 E** | 功能类 | 数据库迁移工具 | MongoDB→SQLite迁移 |
| **📦 F** | 部署类 | 实例部署与管理 | 自动化部署新实例 |
| **ℹ️ G** | 关于类 | 程序信息与更新日志 | 查看版本信息 |
| **❌ Q** | 退出类 | 安全退出程序 | 关闭启动器 |

</div>

### 🎯 核心功能详解

#### 🚀 启动管理

- **麦麦本体启动 (A)**: 快速启动基础聊天功能
- **完整环境启动 (B)**: 包含所有组件的全功能启动
  - 自动检测NapCat运行状态
  - 智能启动MongoDB服务
  - 多窗口管理，便于调试

#### ⚙️ 配置管理 (C)

- **多实例支持**: 管理多个独立的麦麦配置
- **智能检索**: 自动发现本地麦麦程序
- **版本识别**: 自动适配不同版本的配置需求
- **路径验证**: 实时检查路径有效性和中文字符

#### 🧠 知识库构建 (D)

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
- `0.7.0-alpha` - 稳定推荐版
- `0.8.0/1-alpha` - 最新功能版 ⭐
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
- 🎥 完整部署教程
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
---88b         d88           88 888888ba                                ,ad88ba,  88                                
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

