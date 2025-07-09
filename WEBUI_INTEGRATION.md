# WebUI集成功能说明

## 功能概述

本次更新为MaiMbot部署系统添加了WebUI支持，用户现在可以在部署实例时选择安装WebUI管理界面。

## 主要功能

### 1. WebUI分支选择
- 支持从GitHub获取WebUI分支列表
- 用户可以选择不同的分支版本（如main、dev等）
- 显示分支的提交SHA和说明信息

### 2. Node.js环境检测
- 自动检测系统是否安装了Node.js和npm
- 如果未安装，提供自动安装选项
- 支持Windows、macOS和Linux系统

### 3. 自动下载和安装
- 从GitHub自动下载选定的WebUI分支
- 解压并安装到指定目录
- 自动执行npm install安装依赖

### 4. 配置集成
- WebUI路径自动保存到实例配置文件
- 在部署完成后提供使用说明
- 集成到现有的部署流程中

## 使用流程

1. **启动部署** - 选择"部署新实例"
2. **选择版本** - 选择MaiMbot版本
3. **配置信息** - 输入实例基本信息
4. **WebUI选择** - 系统会询问是否安装WebUI
5. **环境检测** - 自动检测Node.js环境
6. **自动安装** - 如需要，自动安装Node.js
7. **分支选择** - 选择WebUI分支版本
8. **自动下载** - 下载和安装WebUI
9. **依赖安装** - 执行npm install
10. **完成部署** - WebUI路径保存到配置

## 技术实现

### 文件结构
```
src/modules/
├── webui_installer.py  # WebUI安装器模块
└── deployment.py       # 主部署模块（已更新）
```

### 核心类
- `WebUIInstaller`: 负责WebUI的下载、安装和配置
- `DeploymentManager`: 主部署管理器（已集成WebUI功能）

### 主要方法
- `check_nodejs_installed()`: 检查Node.js安装状态
- `install_nodejs()`: 自动安装Node.js
- `get_webui_branches()`: 获取WebUI分支列表
- `download_webui()`: 下载WebUI源码
- `install_webui_dependencies()`: 安装WebUI依赖
- `check_and_install_webui()`: 完整的WebUI安装流程

### 配置保存
WebUI路径会保存到实例配置文件中：
```json
{
    "webui_path": "/path/to/webui/directory",
    // ...其他配置
}
```

## 支持的操作系统

### Windows
- 自动下载Node.js MSI安装包
- 启动图形化安装程序
- 验证安装结果

### macOS
- 优先使用Homebrew安装
- 提供手动安装指导

### Linux
- 支持apt-get（Ubuntu/Debian）
- 支持yum（CentOS/RHEL）
- 提供手动安装指导

## 错误处理

- 网络连接失败时的降级处理
- Node.js安装失败时的用户指导
- WebUI下载失败时的错误提示
- 依赖安装失败时的手动处理建议

## 使用说明

部署完成后，用户可以：
1. 进入WebUI目录
2. 执行 `npm start` 启动WebUI
3. 通过浏览器访问管理界面

## 注意事项

1. WebUI功能需要网络连接才能正常使用
2. 首次安装Node.js可能需要管理员权限
3. npm install过程可能需要一些时间
4. 建议使用最新版本的Node.js LTS

## 测试

可以运行 `test_webui_integration.py` 进行基本功能测试：
```bash
python test_webui_integration.py
```

## 后续扩展

1. 支持更多WebUI版本选择
2. 添加WebUI配置文件自动生成
3. 集成WebUI启动脚本
4. 添加WebUI更新功能
