# 工作台调试模式

工作台调试模式用于在运行部署模板时按画布块记录执行过程、子进程和耗时。

## 能力

- 支持完整调试、分区调试、单块调试。
- 单块调试可选择是否补上下文；开启后会按实例序列号恢复已持久化的运行环境。
- 右侧调试面板负责运行参数、监控级别、暂停、恢复、停止和进程详情。
- 左侧调试侧栏按块分组展示子进程摘要。
- 会话、块、命令、进程都会记录 `started_at`、`ended_at` 和 `duration_ms`。

## 监控级别

- 常规级：使用 `psutil` 递归扫描模板主进程的进程树。
- 严格级：Windows 下使用 WMI 进程创建事件监听，并保留 `psutil` 扫描兜底。严格级需要安装 `WMI` 与 `pywin32`。

## 暂停与停止

- 暂停会挂起当前已知进程树，并在运行时块边界和输出循环处等待。
- 恢复会恢复已知进程树，并继续原会话。
- 停止会请求运行时退出，并终止当前已知进程树。

## 接口

- `POST /api/deployment-mod/workbench/{sequence}/debug/start`
- `GET /api/deployment-mod/debug/{session_id}`
- `POST /api/deployment-mod/debug/{session_id}/pause`
- `POST /api/deployment-mod/debug/{session_id}/resume`
- `POST /api/deployment-mod/debug/{session_id}/stop`

WebSocket 频道为 `deployment_debug`。
