# -*- coding: utf-8 -*-
"""
WebUI后端服务器入口
作为子进程运行，监听端口10086
"""
import os
import sys
import json
import logging
import asyncio
import secrets
import platform
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Set, Optional

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))
os.chdir(project_root)  # 确保相对路径基于项目根目录


def _force_utf8_stdio() -> None:
    """强制 WebUI 后端进程在 Windows 打包环境下使用 UTF-8 标准流。"""
    os.environ["PYTHONUTF8"] = "1"
    os.environ["PYTHONIOENCODING"] = "utf-8"

    for stream_name in ("stdout", "stderr", "stdin"):
        stream = getattr(sys, stream_name, None)
        if stream is None or not hasattr(stream, "reconfigure"):
            continue
        try:
            if stream_name == "stdin":
                stream.reconfigure(encoding="utf-8", errors="replace")
            else:
                stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


_force_utf8_stdio()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import uvicorn

# 导入API路由
from src.webui_api import (
    auth_router,
    deploy_router,
    launcher_router,
    multi_instance_router,
    knowledge_router,
    port_router,
    process_router,
    runtime_status_router,
    logs_router,
    settings_router,
    components_router,
    terminal_router,
    pet_router,
    deployment_mod_router,
)
from src.webui_api.pet_api_v2 import router as pet_v2_router
from webui.backend.api.template_workbench import router as template_workbench_router
from webui.backend.api.workbench_files import router as workbench_files_router
from src.webui_api.auth_core import (
    account_store,
    attach_request_auth_state,
    request_rate_limiter,
    resolve_request_auth,
    session_manager,
    token_manager,
)

# 导入配置管理器
from src.core.p_config import p_config_manager


# JSONL日志处理器
class JsonLHandler(logging.Handler):
    """将日志写入JSONL文件"""
    
    def __init__(self, log_dir: str):
        super().__init__()
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.current_date = datetime.now().strftime("%Y-%m-%d")
        self._update_file()
    
    def _update_file(self):
        """更新日志文件路径"""
        log_file = self.log_dir / f"webui_{self.current_date}.jsonl"
        self.log_file = log_file
    
    def emit(self, record: logging.LogRecord):
        """写入日志记录"""
        try:
            # 每天创建新的日志文件
            current_date = datetime.now().strftime("%Y-%m-%d")
            if current_date != self.current_date:
                self.current_date = current_date
                self._update_file()
            
            # 构建日志JSON
            log_data = {
                "timestamp": datetime.now().isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }
            
            # 添加异常信息
            if record.exc_info:
                log_data["exception"] = self.format(record)
            
            # 写入文件
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_data, ensure_ascii=False) + '\n')
                
        except Exception:
            self.handleError(record)


# 配置日志
def setup_logging():
    """配置日志系统"""
    log_dir = project_root / "log"

    # 创建JSONL处理器
    jsonl_handler = JsonLHandler(str(log_dir))
    jsonl_handler.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    jsonl_handler.setFormatter(formatter)

    # 创建控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    # 配置根日志记录器
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(jsonl_handler)
    root_logger.addHandler(console_handler)  # 添加控制台输出

    # 禁用uvicorn的默认日志处理器，避免重复输出
    uvicorn_logger = logging.getLogger("uvicorn")
    uvicorn_logger.handlers.clear()
    uvicorn_logger.addHandler(jsonl_handler)
    uvicorn_logger.addHandler(console_handler)  # 添加控制台输出
    uvicorn_logger.setLevel(logging.INFO)
    
    return root_logger


# 创建FastAPI应用
app = FastAPI(
    title="MaiCore WebUI API",
    description="MaiCore-Start WebUI后端API服务",
    version="1.0.0"
)

# 配置CORS — 仅允许本地来源
_cors_origins = [
    "http://localhost:10086", "http://127.0.0.1:10086",
    "http://localhost:3000", "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket连接管理器
class ConnectionManager:
    """WebSocket连接管理器"""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {
            "instance_status": set(),
            "deployment_progress": set(),
            "process_resources": set(),
            "logs": set()
        }
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop):
        """绑定主事件循环，供线程安全广播使用。"""
        self._loop = loop
        logging.info("ConnectionManager 已绑定主事件循环")
    
    async def connect(self, websocket: WebSocket, channel: str):
        """WebSocket连接"""
        if channel not in self.active_connections:
            self.active_connections[channel] = set()
        self.active_connections[channel].add(websocket)
        logging.info(f"WebSocket客户端连接到频道: {channel}")
    
    def disconnect(self, websocket: WebSocket, channel: str):
        """WebSocket断开"""
        if channel in self.active_connections:
            self.active_connections[channel].discard(websocket)
            logging.info(f"WebSocket客户端断开频道: {channel}")
    
    async def broadcast(self, channel: str, message: Dict[str, Any]):
        """广播消息到指定频道"""
        if channel in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[channel]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logging.error(f"发送WebSocket消息失败: {e}")
                    disconnected.add(connection)
            
            # 清理断开的连接
            for conn in disconnected:
                self.active_connections[channel].discard(conn)

    def broadcast_threadsafe(self, channel: str, message: Dict[str, Any]):
        """
        在线程中安全广播消息：
        将广播协程投递到主事件循环执行，避免在子线程直接操作 WebSocket。
        """
        if self._loop is None or self._loop.is_closed():
            logging.warning(f"主事件循环不可用，跳过广播: {channel}")
            return None

        try:
            return asyncio.run_coroutine_threadsafe(
                self.broadcast(channel, message),
                self._loop
            )
        except Exception as e:
            logging.error(f"线程安全广播失败: {e}")
            return None


# 全局连接管理器
manager = ConnectionManager()

# 日志记录器
logger = logging.getLogger(__name__)


SESSION_COOKIE_NAME = "webui_session"
SESSION_MAX_AGE = 7 * 24 * 60 * 60


def _should_use_secure_cookie(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
    return forwarded_proto == "https"


def _set_session_cookie(response: Response, request: Request, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        max_age=SESSION_MAX_AGE,
        path="/",
        httponly=True,
        secure=_should_use_secure_cookie(request),
        samesite="strict",
    )


def _clear_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=_should_use_secure_cookie(request),
        samesite="strict",
    )


def _enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    retry_after = request_rate_limiter.check(key, limit=limit, window_seconds=window_seconds)
    if retry_after > 0:
        raise HTTPException(status_code=429, detail=f"请求过于频繁，请在 {retry_after} 秒后重试")


def _is_allowed_ws_channel(channel: str, user: Dict[str, Any]) -> bool:
    if channel.startswith("terminal_"):
        return account_store.can_action(user, "misc.webshell.access")

    page_channel_map = {
        "deployment_progress": "deploy",
        "process_resources": "status",
        "logs": "logs",
        "instance_status": "status",
    }
    page = page_channel_map.get(channel)
    if not page:
        return False
    return account_store.can_page(user, page)


# --- 登录验证依赖 ---

def verify_session(request: Request):
    """验证会话是否已登录（支持 Cookie session 和 Bearer Token）"""
    # 登录页背景需要在未登录时也能读取：
    # 1) 背景偏好（是否启用自定义、固定文件等）
    # 2) 背景文件列表（用于随机选择）
    path = request.url.path
    if request.method == "GET" and path in {
        "/api/preferences/bg_settings",
        "/api/settings/backgrounds",
    }:
        return "public"

    user = resolve_request_auth(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")

    return getattr(request.state, "session_id", None) or getattr(request.state, "auth_type", "session")


# --- API路由注册 ---

auth_dep = [Depends(verify_session)]

# 账号系统 API
app.include_router(auth_router, prefix="/api/account", tags=["账号系统"])

# 部署管理API
app.include_router(deploy_router, prefix="/api/deploy", tags=["部署管理"], dependencies=auth_dep)

# MOD 模板部署 API
app.include_router(deployment_mod_router, prefix="/api/deployment-mod", tags=["模板部署"], dependencies=auth_dep)

# 启动器管理API
app.include_router(launcher_router, prefix="/api/launcher", tags=["启动器"], dependencies=auth_dep)

# 多开管理API
app.include_router(multi_instance_router, prefix="/api/multi-instance", tags=["多开管理"], dependencies=auth_dep)

# 知识库API（路由内部已含 /knowledge/ 前缀）
app.include_router(knowledge_router, prefix="/api", tags=["知识库"], dependencies=auth_dep)

# 端口管理API
app.include_router(port_router, prefix="/api/port", tags=["端口管理"], dependencies=auth_dep)

# 进程管理API
app.include_router(process_router, prefix="/api/process", tags=["进程管理"], dependencies=auth_dep)

# 运行状态可视化API
app.include_router(runtime_status_router, prefix="/api/runtime", tags=["运行状态"], dependencies=auth_dep)

# 日志查看API
from src.webui_api import logs_router
app.include_router(logs_router, prefix="/api/logs", tags=["日志查看"], dependencies=auth_dep)

# 统计API
from src.webui_api import stats_router
app.include_router(stats_router, prefix="/api/stats", tags=["统计"], dependencies=auth_dep)

# WebUI配置API
from src.webui_api import webui_config_router
app.include_router(webui_config_router, prefix="/api/webui", tags=["WebUI配置"], dependencies=auth_dep)

# 用户偏好API
from src.webui_api import preferences_router
app.include_router(preferences_router, prefix="/api/preferences", tags=["用户偏好"], dependencies=auth_dep)

# 插件管理API
from src.webui_api import plugin_router
app.include_router(plugin_router, prefix="/api/plugins", tags=["插件管理"], dependencies=auth_dep)

# 设置管理API
app.include_router(settings_router, prefix="/api/settings", tags=["设置管理"], dependencies=auth_dep)

# 组件下载API
app.include_router(components_router, tags=["组件下载"], dependencies=auth_dep)

# 模板工作台API
app.include_router(template_workbench_router, prefix="/api/template-workbench", tags=["模板工作台"], dependencies=auth_dep)
# 模板工作台 - 文件块 API（与 template_workbench_router 共用前缀）
app.include_router(workbench_files_router, prefix="/api/template-workbench", tags=["工作台文件"], dependencies=auth_dep)

# 终端管理API
app.include_router(terminal_router, tags=["终端管理"], dependencies=auth_dep)

# 桌宠AI API
app.include_router(pet_router, prefix="/api/pet", tags=["桌宠AI"], dependencies=auth_dep)

# 桌宠AI API v2 (Neo-MoFox架构)
app.include_router(pet_v2_router, prefix="/api/pet-v2", tags=["桌宠AI v2"], dependencies=auth_dep)


# --- 登录相关API ---

class LoginRequest(BaseModel):
    """登录请求"""
    token: str


class VerifyRequest(BaseModel):
    """验证Token请求"""
    token: str


@app.post("/api/auth/verify")
async def verify_token(request: VerifyRequest, http_request: Request):
    """验证Token是否正确"""
    # 验证token
    is_valid = token_manager.verify_token(request.token)
    
    if is_valid:
        return {
            "success": True,
            "message": "Token验证成功"
        }
    else:
        return {
            "success": False,
            "message": "Token验证失败"
        }


@app.post("/api/auth/login")
async def login(request: LoginRequest, http_request: Request, response: Response):
    """登录验证"""
    client_host = http_request.client.host if http_request.client else "unknown"
    _enforce_rate_limit(f"legacy-token-login:{client_host}", limit=10, window_seconds=300)
    session_id = http_request.cookies.get(SESSION_COOKIE_NAME, "") or secrets.token_hex(16)

    result = session_manager.login_with_token(session_id, request.token)
    if result.get("success"):
        rotated_session_id = secrets.token_hex(16)
        session_manager.rotate_session(session_id, rotated_session_id)
        _set_session_cookie(response, http_request, rotated_session_id)
        result["session_id"] = rotated_session_id
    return result


@app.get("/api/auth/status")
async def auth_status(http_request: Request):
    """检查登录状态"""
    user = resolve_request_auth(http_request)
    session_id = http_request.cookies.get("webui_session", "")
    remaining = session_manager.get_remaining_attempts(session_id) if session_id and not user else 0

    return {
        "logged_in": user is not None,
        "remaining_attempts": remaining,
        "auth_type": getattr(http_request.state, "auth_type", "anonymous"),
        "current_user": account_store._public_user(user) if user else None,
        "admin_token_configured": bool(token_manager.get_token()),
    }


@app.post("/api/auth/logout")
async def logout(http_request: Request, response: Response):
    """登出"""
    session_id = http_request.cookies.get(SESSION_COOKIE_NAME, "")
    if session_id:
        session_manager.logout(session_id)
    _clear_session_cookie(response, http_request)
    return {
        "success": True,
        "message": "已登出"
    }


# --- 登录页面HTML ---

LOGIN_HTML = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MaiCore WebUI - 登录</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .login-card {
            width: 420px;
            padding: 48px 40px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            backdrop-filter: blur(50px);
            -webkit-backdrop-filter: blur(50px);
            filter: brightness(98%) blur(50px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .login-title {
            text-align: center;
            color: #fff;
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .login-subtitle {
            text-align: center;
            color: rgba(255, 255, 255, 0.6);
            font-size: 14px;
            margin-bottom: 32px;
        }
        
        .form-group {
            margin-bottom: 24px;
        }
        
        .form-label {
            display: block;
            color: rgba(255, 255, 255, 0.8);
            font-size: 14px;
            margin-bottom: 8px;
        }
        
        .form-input {
            width: 100%;
            padding: 14px 16px;
            font-size: 16px;
            color: #fff;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            outline: none;
            transition: all 0.3s ease;
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            filter: brightness(110%) blur(30px);
        }
        
        .form-input::placeholder {
            color: rgba(255, 255, 255, 0.4);
        }
        
        .form-input:focus {
            border-color: rgba(100, 200, 255, 0.5);
            box-shadow: 0 0 0 3px rgba(100, 200, 255, 0.1);
        }
        
        .login-btn {
            width: 100%;
            padding: 16px;
            font-size: 16px;
            font-weight: 600;
            color: #fff;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            filter: brightness(125%) blur(30px);
        }
        
        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
        }
        
        .login-btn:active {
            transform: translateY(0);
        }
        
        .error-msg {
            color: #ff6b6b;
            font-size: 13px;
            text-align: center;
            margin-top: 16px;
            min-height: 20px;
        }
        
        .attempts-info {
            color: rgba(255, 255, 255, 0.5);
            font-size: 12px;
            text-align: center;
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="login-card">
        <h1 class="login-title">MaiCore WebUI</h1>
        <p class="login-subtitle">请输入访问令牌以继续</p>
        
        <form id="loginForm">
            <div class="form-group">
                <label class="form-label" for="token">访问令牌</label>
                <input 
                    type="password" 
                    id="token" 
                    name="token" 
                    class="form-input" 
                    placeholder="请输入Token" 
                    autocomplete="off"
                    required
                >
            </div>
            
            <button type="submit" class="login-btn">登 录</button>
            
            <p class="error-msg" id="errorMsg"></p>
            <p class="attempts-info" id="attemptsInfo"></p>
        </form>
    </div>
    
    <script>
        const loginForm = document.getElementById('loginForm');
        const tokenInput = document.getElementById('token');
        const errorMsg = document.getElementById('errorMsg');
        const attemptsInfo = document.getElementById('attemptsInfo');
        
        // 检查当前登录状态
        fetch('/api/auth/status')
            .then(res => res.json())
            .then(data => {
                if (data.logged_in) {
                    // 已登录，跳转到主页
                    window.location.href = '/';
                } else if (data.remaining_attempts !== undefined && data.remaining_attempts < 5) {
                    attemptsInfo.textContent = `剩余尝试次数: ${data.remaining_attempts}`;
                }
            });
        
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const token = tokenInput.value.trim();
            if (!token) {
                errorMsg.textContent = '请输入Token';
                return;
            }
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ token })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // 登录成功，设置cookie并跳转
                    document.cookie = `webui_session=${data.session_id}; path=/; max-age=86400`;
                    window.location.href = '/';
                } else {
                    errorMsg.textContent = data.message;
                    attemptsInfo.textContent = `剩余尝试次数: ${data.remaining_attempts}`;
                    tokenInput.value = '';
                    tokenInput.focus();
                }
            } catch (error) {
                errorMsg.textContent = '登录请求失败，请重试';
                console.error(error);
            }
        });
    </script>
</body>
</html>
"""


# --- 根路由 ---

@app.get("/")
async def root(request: Request):
    """
    根路径统一返回前端 SPA 入口。
    说明：
    - 旧版内置登录页保留为 dist 不存在时的兜底
    - 登录态校验交由前端 + /api/auth/* 接口处理
    """
    frontend_index = project_root / "webui" / "frontend" / "dist" / "index.html"
    if frontend_index.is_file():
        return FileResponse(str(frontend_index))
    return HTMLResponse(content=LOGIN_HTML, status_code=200)


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    """兼容旧登录路径，统一返回前端 SPA 入口。"""
    frontend_index = project_root / "webui" / "frontend" / "dist" / "index.html"
    if frontend_index.is_file():
        return FileResponse(str(frontend_index))
    return HTMLResponse(content=LOGIN_HTML, status_code=200)


@app.get("/api/system/info")
async def system_info():
    """获取系统静态信息"""
    import psutil
    gpu_name = "N/A"
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            gpu_name = result.stdout.strip().split("\n")[0]
    except Exception:
        pass
    return {
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "processor": platform.processor() or "Unknown",
        "gpu": gpu_name,
        "total_memory_mb": round(psutil.virtual_memory().total / (1024**2)),
        "cpu_count": psutil.cpu_count(),
    }


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }


# --- WebSocket端点 ---

@app.websocket("/ws/settings")
async def settings_ws_endpoint(websocket: WebSocket):
    """WebSocket 热重载端点：LLM 配置变更时广播给 Electron 桌宠。
    支持 Bearer Token 认证（通过 query param token=xxx）。
    """
    # 允许 Cookie session 或 Bearer token（query param）验证
    session_id = websocket.cookies.get("webui_session", "")
    bearer_token = websocket.query_params.get("token", "")
    authenticated = (
        (session_id and session_manager.is_logged_in(session_id))
        or (bearer_token and token_manager.verify_token(bearer_token))
    )
    if not authenticated:
        await websocket.close(code=4001)
        return

    from src.webui_api.settings_api import settings_ws_manager
    await settings_ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive
    except WebSocketDisconnect:
        settings_ws_manager.disconnect(websocket)
    except Exception:
        settings_ws_manager.disconnect(websocket)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket实时通信端点"""
    # 验证 session
    session_id = websocket.cookies.get("webui_session", "")
    if not session_id or not session_manager.is_logged_in(session_id):
        await websocket.close(code=4001)
        return
    user = session_manager.get_current_user(session_id)
    if not user:
        await websocket.close(code=4001)
        return

    channel = None

    try:
        await websocket.accept()
        # 接收订阅消息
        initial_message = await websocket.receive_json()
        
        if initial_message.get("type") == "subscribe":
            channel = initial_message.get("channel")
            if not channel:
                await websocket.send_json({
                    "type": "error",
                    "message": "未指定订阅频道"
                })
                return

            if not _is_allowed_ws_channel(channel, user):
                await websocket.send_json({
                    "type": "error",
                    "message": "当前账号无权订阅该频道"
                })
                await websocket.close(code=4003)
                return

            if channel.startswith("terminal_"):
                terminal_id = channel.removeprefix("terminal_")
                from src.webui_api.terminal_api import can_access_terminal_session
                if not can_access_terminal_session(terminal_id, user):
                    await websocket.send_json({
                        "type": "error",
                        "message": "当前账号无权访问该终端会话"
                    })
                    await websocket.close(code=4003)
                    return
            
            # 连接频道
            await manager.connect(websocket, channel)
            
            # 发送确认消息
            await websocket.send_json({
                "type": "subscribed",
                "channel": channel,
                "message": f"已订阅频道: {channel}"
            })
            
            # 保持连接并处理消息
            while True:
                try:
                    message = await websocket.receive_json()
                    
                    # 处理各种消息类型
                    msg_type = message.get("type")
                    
                    if msg_type == "ping":
                        await websocket.send_json({"type": "pong"})
                    elif msg_type == "unsubscribe":
                        channel_to_leave = message.get("channel", channel)
                        manager.disconnect(websocket, channel_to_leave)
                        await websocket.send_json({
                            "type": "unsubscribed",
                            "channel": channel_to_leave
                        })
                    elif msg_type == "terminal_input":
                        # 终端输入
                        from src.webui_api.terminal_api import handle_terminal_input
                        terminal_id = message.get("terminal_id")
                        data = message.get("data", "")
                        if terminal_id:
                            ok = handle_terminal_input(terminal_id, data, user)
                            if not ok:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": "当前账号无权操作该终端"
                                })
                    elif msg_type == "terminal_resize":
                        # 终端大小调整
                        from src.webui_api.terminal_api import handle_terminal_resize
                        terminal_id = message.get("terminal_id")
                        rows = message.get("rows", 24)
                        cols = message.get("cols", 80)
                        if terminal_id:
                            ok = handle_terminal_resize(terminal_id, rows, cols, user)
                            if not ok:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": "当前账号无权操作该终端"
                                })
                    
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    logging.error(f"WebSocket消息处理错误: {e}")
                    break
                    
        else:
            await websocket.send_json({
                "type": "error",
                "message": "无效的初始消息类型"
            })
            
    except WebSocketDisconnect:
        logging.info(f"WebSocket客户端断开连接")
    except Exception as e:
        logging.error(f"WebSocket错误: {e}")
    finally:
        if channel:
            manager.disconnect(websocket, channel)


# --- 广播功能 ---

async def broadcast_instance_status(serial: str, status: Dict[str, Any]):
    """广播实例状态更新"""
    await manager.broadcast("instance_status", {
        "type": "instance_status",
        "serial": serial,
        "data": status,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_deployment_progress(serial: str, progress: Dict[str, Any]):
    """广播部署进度更新"""
    await manager.broadcast("deployment_progress", {
        "type": "deployment_progress",
        "serial": serial,
        "data": progress,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_process_resources(pid: int, resources: Dict[str, Any]):
    """广播进程资源更新"""
    await manager.broadcast("process_resources", {
        "type": "process_resources",
        "pid": pid,
        "data": resources,
        "timestamp": datetime.now().isoformat()
    })


# --- 后台任务 ---

async def periodic_status_update():
    """定期广播系统状态"""
    import psutil
    
    while True:
        try:
            # 获取系统资源
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            
            await manager.broadcast("process_resources", {
                "type": "system_resources",
                "data": {
                    "cpu_percent": cpu_percent,
                    "memory_percent": memory.percent,
                    "memory_used_mb": round(memory.used / (1024**2)),
                    "memory_total_mb": round(memory.total / (1024**2)),
                    "cpu_count": psutil.cpu_count(),
                },
                "timestamp": datetime.now().isoformat()
            })

        except Exception as e:
            logging.error(f"定期状态更新错误: {e}")

        await asyncio.sleep(1)  # 每1秒更新一次


@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    logger.info("MaiCore WebUI API 服务启动")
    manager.bind_loop(asyncio.get_running_loop())
    # 启动后台任务
    asyncio.create_task(periodic_status_update())

    # 启动提醒服务
    try:
        from src.core.pet_database import PetDatabase
        from src.services.reminder_service import ReminderService

        pet_db = PetDatabase()
        reminder_service = ReminderService(pet_db)
        await reminder_service.start()

        # 保存到全局变量以便关闭时使用
        app.state.reminder_service = reminder_service
        logger.info("提醒服务已启动")
    except Exception as e:
        logger.error(f"提醒服务启动失败: {e}")


# 挂载前端静态文件
frontend_dist = project_root / "webui" / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dist / "assets")), name="static")
    # 挂载 public 目录中的资源
    frontend_public = project_root / "webui" / "frontend" / "public"
    live2d_assets = project_root / "data" / "Live_2D"
    desktop_pet_web = project_root / "src" / "modules" / "desktop_pet_web"
    if frontend_public.exists():
        app.mount("/fonts", StaticFiles(directory=str(frontend_public / "fonts")), name="fonts")
        app.mount("/backgrounds", StaticFiles(directory=str(frontend_public / "backgrounds")), name="backgrounds")
        app.mount("/default_backgrounds", StaticFiles(directory=str(frontend_public / "default_backgrounds")), name="default_backgrounds")
    if live2d_assets.exists():
        app.mount("/live2d", StaticFiles(directory=str(live2d_assets)), name="live2d")
    if desktop_pet_web.exists():
        app.mount("/desktop-pet", StaticFiles(directory=str(desktop_pet_web)), name="desktop-pet")

    # 添加根路径和 SPA 路由支持
    from fastapi.responses import FileResponse

    @app.get("/")
    async def serve_root():
        """返回前端首页"""
        return FileResponse(str(frontend_dist / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """支持 SPA 路由，所有未匹配的路径返回 index.html"""
        # 如果是 API 或 WebSocket 路径，跳过
        if full_path.startswith(("api/", "ws", "static/", "fonts/", "backgrounds/", "default_backgrounds/", "live2d/", "desktop-pet/")):
            return {"detail": "Not Found"}

        # 检查文件是否存在
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))

        # 否则返回 index.html（SPA 路由）
        return FileResponse(str(frontend_dist / "index.html"))

    logger.info(f"已挂载静态文件目录: {frontend_dist}")
else:
    logger.warning(f"前端构建目录不存在: {frontend_dist}，静态文件服务未启用")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("MaiCore WebUI API 服务关闭")

    # 停止提醒服务
    if hasattr(app.state, 'reminder_service'):
        try:
            await app.state.reminder_service.stop()
            logger.info("提醒服务已停止")
        except Exception as e:
            logger.error(f"提醒服务停止失败: {e}")


# 运行应用
if __name__ == "__main__":
    # 配置日志
    setup_logging()
    
    # 获取配置
    host = p_config_manager.get("webui.host", "0.0.0.0")
    port = p_config_manager.get("webui.port", 10086)
    
    logger.info(f"WebUI服务器配置: host={host}, port={port}")
    
    # 启动服务器
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=False  # 禁用访问日志以减少输出
    )
