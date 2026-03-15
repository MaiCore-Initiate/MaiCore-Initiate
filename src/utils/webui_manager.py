# -*- coding: utf-8 -*-
"""
WebUI进程管理工具
用于启动、停止和检查WebUI守护进程
"""
import os
import sys
import socket
import subprocess
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class WebUIManager:
    """WebUI守护进程管理器"""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.pid_file = project_root / "webui_backend.pid"
        self.daemon_script = project_root / "webui" / "backend" / "webui_daemon.py"

    def is_running(self, port: int = 10086) -> bool:
        """检查WebUI服务是否在运行"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(1)
                result = sock.connect_ex(('localhost', port))
                return result == 0
        except Exception:
            return False

    def get_pid(self) -> Optional[int]:
        """从PID文件读取进程ID"""
        try:
            if self.pid_file.exists():
                with open(self.pid_file, 'r') as f:
                    return int(f.read().strip())
        except Exception as e:
            logger.error(f"读取PID文件失败: {e}")
        return None

    def start(self, port: int = 10086) -> bool:
        """启动WebUI守护进程（完全后台运行，无窗口）"""
        try:
            # 检查是否已在运行
            if self.is_running(port):
                logger.info("WebUI服务已在运行")
                return True

            # 检查守护进程脚本是否存在
            if not self.daemon_script.exists():
                logger.error(f"守护进程脚本不存在: {self.daemon_script}")
                return False

            env = os.environ.copy()
            env["PYTHONUTF8"] = "1"
            env["PYTHONIOENCODING"] = "utf-8"

            # 启动守护进程（完全后台，无窗口）
            if sys.platform == "win32":
                # Windows: 使用pythonw.exe（无窗口）+ DETACHED_PROCESS
                python_exe = sys.executable
                # 尝试使用pythonw.exe（无窗口版本）
                pythonw_exe = python_exe.replace("python.exe", "pythonw.exe")
                if not os.path.exists(pythonw_exe):
                    pythonw_exe = python_exe  # 回退到普通python.exe

                process = subprocess.Popen(
                    [pythonw_exe, str(self.daemon_script)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    env=env,
                    creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
                    close_fds=True
                )
            else:
                # Linux/Mac: 使用nohup + 新会话
                process = subprocess.Popen(
                    [sys.executable, str(self.daemon_script)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    env=env,
                    start_new_session=True,
                    close_fds=True
                )

            logger.info(f"WebUI守护进程已启动 (PID: {process.pid})")
            return True

        except Exception as e:
            logger.error(f"启动WebUI守护进程失败: {e}")
            return False

    def stop(self) -> bool:
        """停止WebUI守护进程"""
        try:
            pid = self.get_pid()
            if not pid:
                logger.info("未找到WebUI进程PID")
                return False

            import psutil
            try:
                process = psutil.Process(pid)
                process.terminate()
                process.wait(timeout=5)
                logger.info("WebUI守护进程已停止")
                return True
            except psutil.NoSuchProcess:
                logger.info("WebUI进程已不存在")
                # 清理PID文件
                if self.pid_file.exists():
                    self.pid_file.unlink()
                return True
            except psutil.TimeoutExpired:
                process.kill()
                logger.warning("WebUI进程强制终止")
                return True

        except Exception as e:
            logger.error(f"停止WebUI守护进程失败: {e}")
            return False

    def restart(self, port: int = 10086) -> bool:
        """重启WebUI守护进程"""
        logger.info("正在重启WebUI服务...")
        self.stop()
        import time
        time.sleep(2)
        return self.start(port)

    def get_status(self, port: int = 10086) -> dict:
        """获取WebUI服务状态"""
        running = self.is_running(port)
        pid = self.get_pid()

        status = {
            "running": running,
            "pid": pid,
            "port": port,
            "url": f"http://localhost:{port}"
        }

        if running and pid:
            try:
                import psutil
                process = psutil.Process(pid)
                status["cpu_percent"] = process.cpu_percent(interval=0.1)
                status["memory_mb"] = round(process.memory_info().rss / (1024 ** 2), 2)
                status["create_time"] = process.create_time()
            except Exception:
                pass

        return status
