# MaiCore 桌宠前端 (Neo-MoFox 架构)

基于 Neo-MoFox 的 desktop_pet_scheduler 插件迁移而来，使用 Lit + Electron + pixi.js 技术栈。

## 技术栈

- **前端框架**: Lit (Web Components)
- **桌面框架**: Electron
- **Live2D 渲染**: pixi.js + pixi-live2d-display
- **UI 设计**: Material Design 3
- **构建工具**: Vite + TypeScript

## 功能特性

- ✅ Live2D 桌宠渲染（支持 Cubism 4 .moc3 模型）
- ✅ 透明无边框窗口
- ✅ 鼠标跟踪（眼神跟随）
- ✅ 滚轮缩放
- ✅ 拖拽移动
- ✅ 日程管理
- ✅ 待办事项
- ✅ AI 智能对话
- ✅ 系统托盘

## 安装依赖

```bash
cd desktop_pet_frontend
npm install
```

## 开发模式

### 1. 启动 MaiCore 后端

```bash
# 在 MaiCore 根目录
python webui/backend/main.py
```

后端默认运行在 `http://localhost:10086`

### 2. 启动前端开发服务器

```bash
# 在 desktop_pet_frontend 目录
npm run dev
```

Vite 开发服务器会运行在 `http://localhost:5500`，并自动代理 `/api` 请求到 MaiCore 后端。

### 3. 启动 Electron 桌宠窗口

```bash
# 在 desktop_pet_frontend 目录
npm run dev:electron
```

这会构建前端并启动 Electron 应用，显示桌宠窗口。

## 生产构建

```bash
npm run build
```

会生成：
- `dist/` - 前端静态文件
- `dist-electron/` - Electron 主进程文件
- 打包后的可执行文件（根据平台不同）

## 项目结构

```
desktop_pet_frontend/
├── electron/           # Electron 主进程和预加载脚本
│   ├── main.ts        # 主进程（窗口管理、托盘）
│   ├── preload.ts     # 预加载脚本（IPC 桥接）
│   └── tray-icon.png  # 托盘图标
├── src/
│   ├── api/           # API 客户端
│   │   └── client.ts  # 与 MaiCore 后端通信
│   ├── components/    # Lit 组件
│   │   ├── live2d-viewer.ts      # Live2D 渲染器
│   │   ├── schedule-view.ts      # 日程视图
│   │   ├── todo-panel.ts         # 待办面板
│   │   ├── chat-bubble.ts        # 聊天气泡
│   │   ├── pet-overlay.ts        # 桌宠悬浮窗
│   │   ├── panel-shell.ts        # 管理面板
│   │   └── settings-page.ts      # 设置页面
│   ├── styles/        # 样式文件
│   ├── types.ts       # TypeScript 类型定义
│   └── main.ts        # 前端入口
├── index.html         # HTML 模板
├── package.json       # 依赖配置
├── tsconfig.json      # TypeScript 配置
└── vite.config.ts     # Vite 配置
```

## API 端点

前端通过以下 API 与 MaiCore 后端通信：

### 日程管理
- `GET /api/pet-v2/schedules` - 获取日程列表
- `POST /api/pet-v2/schedules` - 创建日程
- `PUT /api/pet-v2/schedules/{id}` - 更新日程
- `DELETE /api/pet-v2/schedules/{id}` - 删除日程

### 待办事项
- `GET /api/pet-v2/todos` - 获取待办列表
- `POST /api/pet-v2/todos` - 创建待办
- `PATCH /api/pet-v2/todos/{id}/toggle` - 切换待办状态
- `DELETE /api/pet-v2/todos/{id}` - 删除待办
- `GET /api/pet-v2/todos/stats` - 获取统计数据

### AI 对话
- `POST /api/pet-v2/chat` - 发送消息给 AI

### Live2D
- 使用 MaiCore 现有的 Live2D API (`/api/settings/live2d/*`)

## 配置

### 修改后端地址

编辑 `vite.config.ts`：

```typescript
function getBackendTarget(): string {
  const host = '127.0.0.1';
  const port = 10086; // 修改为你的 MaiCore 端口
  return `http://${host}:${port}`;
}
```

或使用环境变量：

```bash
export MAICORE_HOST=127.0.0.1
export MAICORE_PORT=10086
npm run dev
```

## 窗口说明

### 桌宠窗口 (Pet Window)
- 透明无边框
- 始终置顶
- 可拖拽移动
- 滚轮缩放
- 显示 Live2D 模型

### 管理面板 (Panel Window)
- 日程管理
- 待办事项
- 设置页面
- 模型切换

### 右键菜单 (Context Menu)
- 表情切换
- 动作播放
- 打开管理面板
- 退出应用

## 故障排除

### 1. 后端连接失败
- 确保 MaiCore 后端正在运行
- 检查端口是否正确（默认 10086）
- 查看浏览器控制台的网络请求

### 2. Live2D 模型不显示
- 确保模型文件路径正确
- 检查 `/api/settings/live2d/models` 是否返回模型列表
- 查看控制台是否有加载错误

### 3. Electron 窗口无法启动
- 删除 `node_modules` 重新安装
- 检查 Electron 版本兼容性
- 查看终端错误信息

## 开发注意事项

1. **API 路径**: 所有 API 请求都通过 `/api/pet-v2` 前缀
2. **认证**: 需要携带 MaiCore 的认证 cookie
3. **CORS**: Vite 开发服务器已配置代理，无需担心跨域
4. **热更新**: 修改 Lit 组件后会自动刷新

## 与原 MaiCore WebUI 的区别

| 特性 | 原 WebUI (React) | 新桌宠 (Lit + Electron) |
|------|------------------|------------------------|
| 框架 | React | Lit Web Components |
| 桌面 | pywebview | Electron |
| Live2D | 简单集成 | pixi.js 完整渲染 |
| 透明度 | 有问题 | 完美透明 |
| 缩放 | 不支持 | 滚轮缩放 |
| 眼神跟踪 | 不支持 | 完整支持 |
| UI 风格 | 自定义 | Material Design 3 |

## 许可证

继承自 Neo-MoFox desktop_pet_scheduler 插件，遵循相同的开源协议。
