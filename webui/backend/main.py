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
from typing import Dict, Any, Set

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))
os.chdir(project_root)  # 确保相对路径基于项目根目录

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import uvicorn

# 导入API路由
from src.webui_api import (
    deploy_router,
    launcher_router,
    multi_instance_router,
    knowledge_router,
    port_router,
    process_router
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
    
    # 配置根日志记录器
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(jsonl_handler)
    
    # 禁用uvicorn的默认日志处理器，避免重复输出
    uvicorn_logger = logging.getLogger("uvicorn")
    uvicorn_logger.handlers.clear()
    uvicorn_logger.addHandler(jsonl_handler)
    uvicorn_logger.setLevel(logging.INFO)
    
    return root_logger


# Token管理
class TokenManager:
    """WebUI Token管理器 - 始终读取项目根目录的配置文件"""

    def __init__(self):
        self.config_path = project_root / "config" / "P-config.toml"
        self._ensure_token()

    def _load_config(self) -> dict:
        """从项目根目录加载配置"""
        try:
            if self.config_path.exists():
                import toml as toml_lib
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    return toml_lib.load(f)
        except Exception as e:
            logging.error(f"读取配置文件失败: {e}")
        return {}

    def _save_config(self, config: dict):
        """保存配置到项目根目录"""
        try:
            import toml as toml_lib
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_path, 'w', encoding='utf-8') as f:
                toml_lib.dump(config, f)
        except Exception as e:
            logging.error(f"保存配置文件失败: {e}")

    def _ensure_token(self):
        """确保token存在，如果不存在则生成"""
        config = self._load_config()
        token = config.get("webui", {}).get("webui_token", "")
        if not token:
            token = secrets.token_hex(16)
            config.setdefault("webui", {})["webui_token"] = token
            self._save_config(config)
            logging.info("已生成新的WebUI Token")

    def get_token(self) -> str:
        """获取当前token - 每次从文件读取，确保一致"""
        config = self._load_config()
        return config.get("webui", {}).get("webui_token", "")

    def verify_token(self, input_token: str) -> bool:
        """验证token"""
        return input_token == self.get_token()


# 全局Token管理器
token_manager = TokenManager()

# 登录会话管理
class SessionManager:
    """登录会话管理 - 带指数退避锁定"""

    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.max_attempts = 5

    def create_session(self, session_id: str) -> Dict[str, Any]:
        self.sessions[session_id] = {
            "attempts": 0,
            "lock_count": 0,
            "locked_until": None,
            "login_time": None
        }
        return self.sessions[session_id]

    def get_session(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.sessions:
            return self.create_session(session_id)
        return self.sessions[session_id]

    def _check_unlock(self, session: Dict[str, Any]):
        """检查锁定是否已过期，过期则解锁"""
        locked_until = session.get("locked_until")
        if locked_until and datetime.now() >= datetime.fromisoformat(locked_until):
            session["locked_until"] = None
            session["attempts"] = 0

    def is_locked(self, session_id: str) -> bool:
        session = self.get_session(session_id)
        self._check_unlock(session)
        return session.get("locked_until") is not None

    def get_lock_remaining_seconds(self, session_id: str) -> int:
        """获取锁定剩余秒数"""
        session = self.get_session(session_id)
        locked_until = session.get("locked_until")
        if not locked_until:
            return 0
        remaining = (datetime.fromisoformat(locked_until) - datetime.now()).total_seconds()
        return max(0, int(remaining))

    def verify_login(self, session_id: str, input_token: str) -> bool:
        session = self.get_session(session_id)
        self._check_unlock(session)

        if session.get("locked_until"):
            return False

        if token_manager.verify_token(input_token):
            session["attempts"] = 0
            session["lock_count"] = 0
            session["login_time"] = datetime.now().isoformat()
            return True

        session["attempts"] = session.get("attempts", 0) + 1

        if session["attempts"] >= self.max_attempts:
            # 指数退避：1m, 2m, 4m, 8m...
            session["lock_count"] = session.get("lock_count", 0) + 1
            lock_minutes = 2 ** (session["lock_count"] - 1)
            from datetime import timedelta
            session["locked_until"] = (datetime.now() + timedelta(minutes=lock_minutes)).isoformat()
            logging.warning(f"登录尝试过多，会话锁定 {lock_minutes} 分钟: {session_id}")

        return False

    def is_logged_in(self, session_id: str) -> bool:
        session = self.get_session(session_id)
        return session.get("login_time") is not None and not session.get("locked_until")

    def get_remaining_attempts(self, session_id: str) -> int:
        session = self.get_session(session_id)
        return max(0, self.max_attempts - session.get("attempts", 0))


# 全局会话管理器
session_manager = SessionManager()


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


# 全局连接管理器
manager = ConnectionManager()

# 日志记录器
logger = logging.getLogger(__name__)


# --- 登录验证依赖 ---

def verify_session(request: Request):
    """验证会话是否已登录"""
    session_id = request.cookies.get("webui_session", "")
    if not session_id:
        raise HTTPException(status_code=401, detail="请先登录")
    
    if not session_manager.is_logged_in(session_id):
        raise HTTPException(status_code=401, detail="请先登录")
    
    return session_id


# --- API路由注册 ---

auth_dep = [Depends(verify_session)]

# 部署管理API
app.include_router(deploy_router, prefix="/api/deploy", tags=["部署管理"], dependencies=auth_dep)

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
async def login(request: LoginRequest, http_request: Request):
    """登录验证"""
    session_id = http_request.cookies.get("webui_session", "")
    if not session_id:
        session_id = secrets.token_hex(16)

    # 检查是否被锁定
    if session_manager.is_locked(session_id):
        lock_seconds = session_manager.get_lock_remaining_seconds(session_id)
        return {
            "success": False,
            "message": f"登录已锁定，请等待",
            "locked": True,
            "lock_seconds": lock_seconds
        }

    if session_manager.verify_login(session_id, request.token):
        return {
            "success": True,
            "message": "登录成功",
            "session_id": session_id
        }
    else:
        remaining = session_manager.get_remaining_attempts(session_id)
        lock_seconds = session_manager.get_lock_remaining_seconds(session_id)
        locked = lock_seconds > 0
        return {
            "success": False,
            "message": f"Token错误，剩余尝试次数: {remaining}" if not locked else "登录已锁定，请等待",
            "remaining_attempts": remaining,
            "locked": locked,
            "lock_seconds": lock_seconds
        }


@app.get("/api/auth/status")
async def auth_status(http_request: Request):
    """检查登录状态"""
    session_id = http_request.cookies.get("webui_session", "")
    if not session_id:
        return {
            "logged_in": False,
            "message": "未登录"
        }
    
    logged_in = session_manager.is_logged_in(session_id)
    remaining = session_manager.get_remaining_attempts(session_id) if not logged_in else 0
    
    return {
        "logged_in": logged_in,
        "remaining_attempts": remaining
    }


@app.post("/api/auth/logout")
async def logout(http_request: Request):
    """登出"""
    session_id = http_request.cookies.get("webui_session", "")
    if session_id and session_id in session_manager.sessions:
        del session_manager.sessions[session_id]
    
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
            filter: brightness(-2%) blur(50px);
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
            filter: brightness(10%) blur(30px);
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
            filter: brightness(25%) blur(30px);
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

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """根路径 - 检查登录状态"""
    session_id = request.cookies.get("webui_session", "")
    if session_id and session_manager.is_logged_in(session_id):
        # 已登录，返回主页HTML（这里可以返回前端构建的页面）
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>MaiCore WebUI</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
            <h1>MaiCore WebUI</h1>
            <p>已成功登录！</p>
            <p>API地址: <a href="/api">/api</a></p>
        </body>
        </html>
        """
    else:
        # 未登录，返回登录页
        return HTMLResponse(content=LOGIN_HTML, status_code=200)


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    """登录页面"""
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

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket实时通信端点"""
    # 验证 session
    session_id = websocket.cookies.get("webui_session", "")
    if not session_id or not session_manager.is_logged_in(session_id):
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
                    elif msg_type == "publish":
                        # 客户端发布消息到频道
                        target_channel = message.get("channel", channel)
                        data = message.get("data", {})
                        await manager.broadcast(target_channel, {
                            "type": "message",
                            "channel": target_channel,
                            "data": data,
                            "timestamp": datetime.now().isoformat()
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
    # 启动后台任务
    asyncio.create_task(periodic_status_update())


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("MaiCore WebUI API 服务关闭")


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
