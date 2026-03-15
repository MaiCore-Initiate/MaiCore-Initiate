# -*- coding: utf-8 -*-
"""
WebUI后端守护进程
独立运行，带托盘图标和进程管理
"""
import os
import sys
import signal
import logging
from pathlib import Path
from threading import Thread

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))
os.chdir(project_root)

from src.core.p_config import p_config_manager


class WebUIDaemon:
    """WebUI守护进程管理器"""

    def __init__(self):
        self.running = True
        self.tray_icon = None
        self.server_thread = None
        self.pid_file = project_root / "webui_backend.pid"
        self.uvicorn_server = None

    def write_pid(self):
        """写入PID文件"""
        try:
            with open(self.pid_file, 'w') as f:
                f.write(str(os.getpid()))
            logging.info(f"PID文件已写入: {self.pid_file}")
        except Exception as e:
            logging.error(f"写入PID文件失败: {e}")

    def remove_pid(self):
        """删除PID文件"""
        try:
            if self.pid_file.exists():
                self.pid_file.unlink()
                logging.info("PID文件已删除")
        except Exception as e:
            logging.error(f"删除PID文件失败: {e}")

    def setup_tray(self):
        """设置托盘图标"""
        try:
            import pystray
            from PIL import Image

            # 使用根目录的output.ico
            icon_path = project_root / "output.ico"

            if not icon_path.exists():
                logging.warning(f"未找到图标文件: {icon_path}，使用默认图标")
                # 创建简单的默认图标
                icon_image = Image.new('RGB', (64, 64), color='blue')
            else:
                icon_image = Image.open(icon_path)

            # 自定义托盘菜单
            def on_open_webui(icon, item):
                """打开WebUI"""
                import webbrowser
                port = p_config_manager.get("webui.port", 10086)
                url = f"http://localhost:{port}"
                webbrowser.open(url)
                logging.info(f"从托盘打开WebUI: {url}")

            def on_show_status(icon, item):
                """显示状态信息"""
                port = p_config_manager.get("webui.port", 10086)
                status_msg = f"WebUI服务运行中\n端口: {port}\nPID: {os.getpid()}"
                logging.info(f"状态查询: {status_msg}")
                # Windows通知
                try:
                    icon.notify(status_msg, "MaiCoreStart WebUI")
                except:
                    pass

            def on_exit(icon, item):
                """退出服务"""
                logging.info("用户从托盘请求退出WebUI服务")
                icon.stop()
                self.running = False
                self.stop_server()

            # 创建托盘菜单
            menu = pystray.Menu(
                pystray.MenuItem("打开 WebUI", on_open_webui, default=True),
                pystray.MenuItem("查看状态", on_show_status),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("退出服务", on_exit)
            )

            # 创建托盘图标
            self.tray_icon = pystray.Icon(
                "MaiCoreStart WebUI",
                icon_image,
                "MaiCoreStart WebUI 服务",
                menu
            )

            # 在单独线程运行托盘（非守护线程，确保主程序不会提前退出）
            tray_thread = Thread(target=self.tray_icon.run, daemon=False)
            tray_thread.start()

            logging.info("托盘图标已启动")

        except Exception as e:
            logging.error(f"托盘图标设置失败: {e}")
            import traceback
            logging.error(traceback.format_exc())

    def start_server(self):
        """启动FastAPI服务器"""
        from webui.backend.main import app, setup_logging
        import uvicorn

        # 配置日志
        setup_logging()

        # 获取配置
        host = p_config_manager.get("webui.host", "0.0.0.0")
        port = p_config_manager.get("webui.port", 10086)

        logging.info(f"WebUI服务器启动中: {host}:{port}")

        # 创建uvicorn配置
        config = uvicorn.Config(
            app,
            host=host,
            port=port,
            log_level="info",
            access_log=False
        )
        self.uvicorn_server = uvicorn.Server(config)

        # 在单独线程运行服务器
        def run_server():
            import asyncio
            asyncio.run(self.uvicorn_server.serve())

        self.server_thread = Thread(target=run_server, daemon=True)
        self.server_thread.start()

        logging.info("WebUI服务器线程已启动")

    def stop_server(self):
        """停止服务器"""
        logging.info("正在停止WebUI服务器...")
        self.running = False

        # 停止uvicorn服务器
        if self.uvicorn_server:
            try:
                self.uvicorn_server.should_exit = True
                logging.info("已发送停止信号到uvicorn服务器")
            except Exception as e:
                logging.error(f"停止uvicorn服务器失败: {e}")

        # 停止托盘图标
        if self.tray_icon:
            try:
                self.tray_icon.stop()
                logging.info("托盘图标已停止")
            except Exception as e:
                logging.error(f"停止托盘图标失败: {e}")

        # 清理PID文件
        self.remove_pid()

        logging.info("WebUI服务器已完全停止")

        # 等待一小段时间让线程清理
        import time
        time.sleep(1)

        # 强制退出
        os._exit(0)

    def setup_signal_handlers(self):
        """设置信号处理器"""
        def signal_handler(signum, frame):
            logging.info(f"收到信号 {signum}，准备退出")
            self.stop_server()

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        if sys.platform == "win32":
            signal.signal(signal.SIGBREAK, signal_handler)

    def run(self):
        """运行守护进程"""
        try:
            # 写入PID
            self.write_pid()

            # 设置信号处理
            self.setup_signal_handlers()

            # 启动服务器
            self.start_server()

            # 等待服务器启动
            import time
            time.sleep(2)

            # 设置托盘图标
            self.setup_tray()

            # 自动打开浏览器
            try:
                import webbrowser
                port = p_config_manager.get("webui.port", 10086)
                webbrowser.open(f"http://localhost:{port}")
            except Exception as e:
                logging.warning(f"自动打开浏览器失败: {e}")

            # 保持运行
            while self.running:
                time.sleep(1)

        except KeyboardInterrupt:
            logging.info("收到键盘中断")
        except Exception as e:
            logging.error(f"守护进程运行错误: {e}")
        finally:
            self.stop_server()


def main():
    """主函数"""
    daemon = WebUIDaemon()
    daemon.run()


if __name__ == "__main__":
    main()
