# -*- coding: utf-8 -*-
"""
终端管理 API
提供 WebShell 终端创建、管理和通信功能
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import structlog
import uuid
import threading
import platform
from datetime import datetime
import asyncio

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/terminal", tags=["terminal"])


class CreateTerminalRequest(BaseModel):
    """创建终端请求"""
    shell: Optional[str] = None  # cmd, powershell, bash


class CreateTerminalResponse(BaseModel):
    """创建终端响应"""
    terminal_id: str
    shell: str
    cwd: str


class TerminalInfo(BaseModel):
    """终端信息"""
    terminal_id: str
    shell: str
    cwd: str
    created_at: str
    last_active: str


# 终端会话存储
_terminal_sessions: Dict[str, Dict[str, Any]] = {}
_sessions_lock = threading.Lock()


def _get_default_shell() -> str:
    """获取默认 shell"""
    system = platform.system().lower()
    if system == "windows":
        return "powershell"  # Windows 使用 PowerShell
    else:
        return "bash"


def _create_pty_process(shell: str, rows: int = 24, cols: int = 80):
    """创建 PTY 进程"""
    import os
    system = platform.system().lower()

    if system == "windows":
        # Windows 使用 winpty
        try:
            from winpty import PtyProcess
            import time

            shell_cmd = "powershell.exe" if shell == "powershell" else "cmd.exe"

            # 创建 pty 进程，设置环境变量确保正确显示
            # PowerShell 添加 -NoLogo 参数减少启动输出，但保留提示符
            if shell == "powershell":
                proc = PtyProcess.spawn(
                    [shell_cmd, "-NoLogo"],
                    dimensions=(rows, cols),
                    env={**os.environ, 'TERM': 'xterm-256color'}
                )
            else:
                proc = PtyProcess.spawn(
                    shell_cmd,
                    dimensions=(rows, cols),
                    env={**os.environ, 'TERM': 'xterm-256color'}
                )

            # 等待一小段时间让 shell 初始化
            time.sleep(0.2)

            return proc
        except ImportError:
            logger.error("pywinpty 未安装，无法创建终端")
            raise HTTPException(status_code=500, detail="pywinpty 未安装")
        except Exception as e:
            logger.error("创建 winpty 进程失败", error=str(e))
            raise HTTPException(status_code=500, detail=f"创建终端失败: {str(e)}")
    else:
        # Linux/Mac 使用 pty
        import pty
        import fcntl

        pid, fd = pty.fork()
        if pid == 0:  # 子进程
            os.execvp(shell, [shell])
        else:  # 父进程
            # 设置非阻塞
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            return {"pid": pid, "fd": fd}


def _start_output_reader(terminal_id: str, proc):
    """启动输出读取线程"""
    import time
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    logger.info("准备启动输出读取线程", terminal_id=terminal_id)

    def read_loop():
        system = platform.system().lower()

        logger.info("输出读取线程已启动", terminal_id=terminal_id, system=system)

        # 创建新的事件循环用于这个线程
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            if system == "windows":
                # winpty 使用阻塞读取
                logger.info("开始读取终端输出", terminal_id=terminal_id)
                while True:
                    try:
                        # 尝试读取输出，使用较小的块大小
                        # winpty 的 read() 是阻塞的，但会在有数据时立即返回
                        try:
                            output = proc.read(256)  # 减小读取块大小
                        except Exception as read_error:
                            logger.error("读取失败", terminal_id=terminal_id, error=str(read_error))
                            time.sleep(0.1)
                            continue

                        logger.debug("读取到输出", terminal_id=terminal_id, length=len(output) if output else 0, data=repr(output[:50] if output else ""))
                        if output:
                            # 更新最后活跃时间
                            with _sessions_lock:
                                if terminal_id in _terminal_sessions:
                                    _terminal_sessions[terminal_id]["last_active"] = datetime.now().isoformat()

                            # 使用线程的事件循环广播输出
                            from webui.backend.main import manager
                            loop.run_until_complete(manager.broadcast(
                                f"terminal_{terminal_id}",
                                {"type": "terminal_output", "terminal_id": terminal_id, "data": output}
                            ))
                            logger.debug("已广播输出", terminal_id=terminal_id)
                    except EOFError:
                        # 进程退出
                        exit_code = proc.exitstatus if hasattr(proc, 'exitstatus') else 0
                        from webui.backend.main import manager
                        loop.run_until_complete(manager.broadcast(
                            f"terminal_{terminal_id}",
                            {"type": "terminal_exit", "terminal_id": terminal_id, "exit_code": exit_code}
                        ))
                        logger.info("终端进程退出", terminal_id=terminal_id, exit_code=exit_code)
                        break
                    except Exception as e:
                        # 检查是否是连接关闭错误
                        error_msg = str(e).lower()
                        if "winerror" in error_msg or "closed" in error_msg or "invalid" in error_msg:
                            logger.info("终端连接已关闭", terminal_id=terminal_id)
                            break
                        logger.error("读取终端输出时出错", terminal_id=terminal_id, error=str(e))
                        time.sleep(0.1)
            else:
                # Linux/Mac 使用 select
                import select
                import os
                fd = proc["fd"]
                while True:
                    readable, _, _ = select.select([fd], [], [], 0.1)
                    if readable:
                        try:
                            output = os.read(fd, 4096).decode('utf-8', errors='replace')
                            if output:
                                with _sessions_lock:
                                    if terminal_id in _terminal_sessions:
                                        _terminal_sessions[terminal_id]["last_active"] = datetime.now().isoformat()

                                from webui.backend.main import manager
                                loop.run_until_complete(manager.broadcast(
                                    f"terminal_{terminal_id}",
                                    {"type": "terminal_output", "terminal_id": terminal_id, "data": output}
                                ))
                        except OSError:
                            # 进程退出
                            from webui.backend.main import manager
                            loop.run_until_complete(manager.broadcast(
                                f"terminal_{terminal_id}",
                                {"type": "terminal_exit", "terminal_id": terminal_id, "exit_code": 0}
                            ))
                            logger.info("终端进程退出", terminal_id=terminal_id)
                            break
        except Exception as e:
            logger.error("终端输出读取异常", terminal_id=terminal_id, error=str(e))
        finally:
            # 清理会话
            with _sessions_lock:
                if terminal_id in _terminal_sessions:
                    del _terminal_sessions[terminal_id]
            loop.close()

    thread = threading.Thread(target=read_loop, daemon=True)
    thread.start()
    logger.info("输出读取线程已启动", terminal_id=terminal_id, thread_id=thread.ident)
    return thread


@router.post("/create", response_model=CreateTerminalResponse, summary="创建新终端")
def create_terminal(request: CreateTerminalRequest):
    """创建新的终端会话"""
    try:
        shell = request.shell or _get_default_shell()
        terminal_id = str(uuid.uuid4())[:8]

        logger.info("创建终端会话", terminal_id=terminal_id, shell=shell)

        # 创建 PTY 进程
        proc = _create_pty_process(shell)

        # 获取当前工作目录
        import os
        cwd = os.getcwd()

        # 保存会话
        with _sessions_lock:
            _terminal_sessions[terminal_id] = {
                "process": proc,
                "shell": shell,
                "cwd": cwd,
                "created_at": datetime.now().isoformat(),
                "last_active": datetime.now().isoformat(),
                "reader_thread": None
            }

        # 启动输出读取线程
        reader_thread = _start_output_reader(terminal_id, proc)
        with _sessions_lock:
            _terminal_sessions[terminal_id]["reader_thread"] = reader_thread

        logger.info("终端会话创建成功", terminal_id=terminal_id)

        return CreateTerminalResponse(
            terminal_id=terminal_id,
            shell=shell,
            cwd=cwd
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("创建终端失败", error=str(e))
        raise HTTPException(status_code=500, detail=f"创建终端失败: {str(e)}")


@router.get("/list", response_model=List[TerminalInfo], summary="列出所有终端")
def list_terminals():
    """列出所有活动的终端会话"""
    try:
        with _sessions_lock:
            terminals = []
            for terminal_id, session in _terminal_sessions.items():
                terminals.append(TerminalInfo(
                    terminal_id=terminal_id,
                    shell=session["shell"],
                    cwd=session["cwd"],
                    created_at=session["created_at"],
                    last_active=session["last_active"]
                ))
            return terminals
    except Exception as e:
        logger.error("列出终端失败", error=str(e))
        raise HTTPException(status_code=500, detail=f"列出终端失败: {str(e)}")


@router.delete("/{terminal_id}", summary="关闭终端")
def close_terminal(terminal_id: str):
    """关闭指定的终端会话"""
    try:
        with _sessions_lock:
            if terminal_id not in _terminal_sessions:
                raise HTTPException(status_code=404, detail="终端不存在")

            session = _terminal_sessions[terminal_id]
            proc = session["process"]

            # 关闭进程
            system = platform.system().lower()
            if system == "windows":
                proc.close()
            else:
                import os
                import signal
                os.kill(proc["pid"], signal.SIGTERM)
                os.close(proc["fd"])

            # 移除会话
            del _terminal_sessions[terminal_id]

        logger.info("终端会话已关闭", terminal_id=terminal_id)
        return {"success": True, "message": "终端已关闭"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("关闭终端失败", terminal_id=terminal_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"关闭终端失败: {str(e)}")


def write_to_terminal(terminal_id: str, data: str):
    """写入数据到终端（由 WebSocket 调用）"""
    try:
        with _sessions_lock:
            if terminal_id not in _terminal_sessions:
                logger.warning("终端不存在", terminal_id=terminal_id)
                return False

            session = _terminal_sessions[terminal_id]
            proc = session["process"]

            # 写入数据
            system = platform.system().lower()
            if system == "windows":
                proc.write(data)
            else:
                import os
                os.write(proc["fd"], data.encode('utf-8'))

            # 更新最后活跃时间
            session["last_active"] = datetime.now().isoformat()
            return True
    except Exception as e:
        logger.error("写入终端失败", terminal_id=terminal_id, error=str(e))
        return False


def resize_terminal(terminal_id: str, rows: int, cols: int):
    """调整终端大小（由 WebSocket 调用）"""
    try:
        with _sessions_lock:
            if terminal_id not in _terminal_sessions:
                logger.warning("终端不存在", terminal_id=terminal_id)
                return False

            session = _terminal_sessions[terminal_id]
            proc = session["process"]

            # 调整大小
            system = platform.system().lower()
            if system == "windows":
                proc.setwinsize(rows, cols)
            else:
                import fcntl
                import termios
                import struct
                fd = proc["fd"]
                fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

            logger.info("终端大小已调整", terminal_id=terminal_id, rows=rows, cols=cols)
            return True
    except Exception as e:
        logger.error("调整终端大小失败", terminal_id=terminal_id, error=str(e))
        return False


def handle_terminal_input(terminal_id: str, data: str):
    """处理终端输入（WebSocket 消息处理器调用）"""
    write_to_terminal(terminal_id, data)


def handle_terminal_resize(terminal_id: str, rows: int, cols: int):
    """处理终端大小调整（WebSocket 消息处理器调用）"""
    resize_terminal(terminal_id, rows, cols)
