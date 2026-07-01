"""
MCStart主程序
重构版本，使用结构化日志和模块化设计
"""
import argparse
import sys
import os
import time
import threading
from pathlib import Path
from typing import Tuple, Any

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import structlog
from src.core.logging import setup_logging, get_logger
from src.core.config import config_manager
from src.ui.interface import ui
from src.modules.launcher import launcher
from src.modules.config_manager import config_mgr
from src.modules.knowledge import knowledge_builder
from src.utils.common import setup_console
from src.utils.system_tray import SystemTrayManager
from src.core.p_config import p_config_manager
 
# 设置日志
setup_logging()
logger = get_logger(__name__)


class MaiMaiLauncher:
    """MCStart主程序类"""

    def __init__(self):
        self.running = True
        self._keep_processes_on_exit = False
        base_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
        self.tray_manager = SystemTrayManager(base_dir / "output.ico")
        self.tray_manager.apply_console_icon()
        self._tray_restore_event = threading.Event()
        self._tray_exit_event = threading.Event()
        self.webui_process = None  # WebUI后端进程引用（仅用于检查）
        setup_console()
        logger.info("MCStart已启动")

        # 初始化WebUI管理器
        from src.utils.webui_manager import WebUIManager
        self.webui_manager = WebUIManager(Path(__file__).parent)

        # 启动WebUI后端服务器
        self._start_webui_server()

    def _start_webui_server(self):
        """启动WebUI后端服务器（使用WebUIManager）"""
        try:
            import webbrowser
            import time

            # 获取WebUI配置
            webui_port = p_config_manager.get("webui.port", 10086)
            webui_url = f"http://localhost:{webui_port}"

            # 检查是否已在运行
            if self.webui_manager.is_running(webui_port):
                ui.print_info(f"检测到WebUI服务已在运行: {webui_url}")
                logger.info("WebUI服务已在运行，跳过启动")

                # 尝试打开浏览器
                try:
                    webbrowser.open(webui_url)
                except Exception as e:
                    logger.warning(f"打开浏览器失败: {e}")
                return

            # 启动WebUI守护进程
            ui.print_info("正在启动WebUI服务...")
            if not self.webui_manager.start(webui_port):
                ui.print_warning("WebUI服务启动失败")
                logger.error("WebUI服务启动失败")
                return

            # 等待服务器启动并进行健康检查
            ui.print_info("等待WebUI服务就绪...")
            max_retries = 15
            for i in range(max_retries):
                time.sleep(1)
                if self.webui_manager.is_running(webui_port):
                    ui.print_success(f"WebUI服务已就绪: {webui_url}")
                    logger.info(f"WebUI服务健康检查通过 (耗时: {i+1}秒)")

                    # 自动打开浏览器
                    try:
                        webbrowser.open(webui_url)
                        logger.info(f"已自动打开浏览器: {webui_url}")
                    except Exception as e:
                        logger.warning(f"自动打开浏览器失败: {e}")
                        ui.print_info(f"请手动访问: {webui_url}")
                    return

            # 超时未启动成功
            ui.print_warning(f"WebUI服务启动超时，请稍后手动访问: {webui_url}")
            logger.warning("WebUI服务健康检查超时")

        except Exception as e:
            logger.error(f"启动WebUI后端服务器失败: {e}")
            ui.print_warning(f"WebUI服务启动失败: {e}")

    def _stop_webui_server(self):
        """停止WebUI后端服务器（使用WebUIManager）"""
        # 守护进程模式：WebUI独立运行，有自己的托盘图标
        # 主进程退出时根据配置决定是否关闭WebUI服务

        webui_auto_close = p_config_manager.get("webui.auto_close_with_launcher", False)

        if webui_auto_close:
            ui.print_info("正在关闭WebUI服务...")
            if self.webui_manager.stop():
                ui.print_success("WebUI服务已关闭")
                logger.info("WebUI服务已关闭")
            else:
                ui.print_warning("WebUI服务关闭失败，可能需要手动关闭")
                logger.warning("WebUI服务关闭失败")
        else:
            # 不自动关闭，提示用户
            ui.print_info("WebUI服务将继续在后台运行，可通过托盘图标管理")
            logger.info("WebUI守护进程继续运行")

    def handle_launch_mai(self):
        """处理启动实例的菜单"""
        try:
            ui.clear_screen()
            # 选择配置
            config = config_mgr.select_configuration()
            if not config:
                return
            
            # 验证配置
            errors = launcher.validate_configuration(config)
            if errors:
                ui.print_error("发现配置错误：")
                for error in errors:
                    ui.console.print(f"  • {error}", style=ui.colors["error"])
                ui.pause()
                return
            
            # 显示启动选择菜单
            success = launcher.show_launch_menu(config)
            if success:
                ui.print_success("启动操作完成！")
                logger.info("用户启动操作成功")
            else:
                ui.print_info("用户取消启动操作")
                logger.info("用户取消启动操作")
            
            ui.pause()
            
        except Exception as e:
            ui.print_error(f"启动过程出错：{str(e)}")
            logger.error("启动实例异常", error=str(e))
            ui.pause()
    
    def handle_config_menu(self):
        """处理配置菜单"""
        self.handle_config_management()
    
    def handle_config_management(self):
        """处理配置管理"""
        while True:
            ui.show_config_menu()
            choice = ui.get_choice("请选择操作", ["A", "B", "C", "Q"])
            
            if choice == "Q":
                break
            elif choice == "A":
                # 自动检索实例
                name = ui.get_input("请输入新配置集名称：")
                if name:
                    configurations = config_manager.get_all_configurations()
                    if name not in configurations:
                        config_mgr.auto_detect_and_create(name)
                        ui.pause()
                    else:
                        ui.print_error("配置集名称已存在")
                        ui.pause()
            elif choice == "B":
                # 手动配置
                name = ui.get_input("请输入新配置集名称：")
                if name:
                    configurations = config_manager.get_all_configurations()
                    if name not in configurations:
                        config_mgr.manual_create(name)
                        ui.pause()
                    else:
                        ui.print_error("配置集名称已存在")
                        ui.pause()
            elif choice == "C":
                # 统一的配置管理
                self.handle_unified_config_management()
    
    def handle_unified_config_management(self):
        """处理统一的配置管理"""
        while True:
            ui.show_config_management_menu()
            
            # 显示所有配置
            configurations = config_manager.get_all_configurations()
            if not configurations:
                ui.print_warning("当前没有任何配置")
                ui.pause()
                break
            
            
            choice = ui.get_choice("请选择操作", ["A", "B", "C", "D", "E", "F", "G", "H", "Q"])
            
            if choice == "Q":
                break
            elif choice in ["A", "B", "D", "G", "H"]:
                # 需要选择配置的操作
                config = config_mgr.select_configuration()
                if not config:
                    continue
                
                # 找到配置名称
                config_name = None
                for name, cfg in configurations.items():
                    if cfg == config:
                        config_name = name
                        break
                
                if not config_name:
                    ui.print_error("无法找到配置名称")
                    ui.pause()
                    continue
                
                if choice == "A":
                    # 查看配置详情
                    ui.show_config_details(config_name, config)
                    ui.pause()
                elif choice == "B":
                    # 编辑配置
                    config_mgr.edit_configuration(config_name)
                
                elif choice == "D":
                    # 验证配置
                    from src.modules.launcher import launcher
                    errors = launcher.validate_configuration(config)
                    if errors:
                        ui.print_error("发现配置错误：")
                        for error in errors:
                            ui.console.print(f"  • {error}", style=ui.colors["error"])
                    else:
                        ui.print_success("配置验证通过")
                    ui.pause()
                elif choice == "G":
                    # 打开配置文件
                    config_mgr.open_config_files(config)
                    ui.pause()
                elif choice == "H":
                    # 打开实例所在目录
                    config_mgr.open_instance_folder(config)
                    ui.pause()
            
            elif choice == "C":
                # 可视化编辑配置，直接在新窗口中运行 run_with_ui_port.py
                import subprocess
                import sys
                import os
                script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_with_ui_port.py")
                # Windows下用start命令新开窗口
                if sys.platform.startswith("win"):
                    subprocess.Popen(["start", "", sys.executable, script_path], shell=True)
                else:
                    subprocess.Popen([sys.executable, script_path])
                ui.print_info("已在新窗口启动可视化配置界面。请在浏览器中操作。")
                ui.pause()

            elif choice == "E":
                # 新建配置集
                name = ui.get_input("请输入新配置集名称：")
                if name and name not in configurations:
                    method_choice = ui.get_choice("选择配置方式：[A] 自动检索 [B] 手动配置", ["A", "B"])
                    if method_choice == "A":
                        config_mgr.auto_detect_and_create(name)
                    else:
                        config_mgr.manual_create(name)
                    ui.pause()
                elif name in configurations:
                    ui.print_error("配置集名称已存在")
                    ui.pause()
            elif choice == "F":
                # 删除配置集
                serial_input = ui.get_input("请输入要删除的用户序列号（多个用英文逗号分隔）：")
                if serial_input:
                    serials = [s.strip() for s in serial_input.split(',')]
                    config_mgr.delete_configurations(serials)
                    ui.pause()
    
    def handle_knowledge_menu(self):
        """处理知识库菜单"""
        while True:
            ui.clear_screen()
            ui.console.print("[🔧 知识库构建]", style=ui.colors["secondary"])
            ui.console.print("================")
            ui.console.print(">>> LPMM功能仅适用于支持LPMM知识库的版本，如'0.6.3-alpha' <<<", style=ui.colors["error"])
            
            ui.console.print(" [A] LPMM知识库一条龙构建", style=ui.colors["secondary"])
            ui.console.print(" [B] LPMM知识库文本分割", style="#02A18F")
            ui.console.print(" [C] LPMM知识库实体提取", style="#02A18F")
            ui.console.print(" [D] LPMM知识库知识图谱导入", style="#02A18F")
            ui.console.print(" [E] 旧版知识库构建（仅0.6.0-alpha及更早版本）", style="#924444")
            ui.console.print(" [Q] 返回主菜单", style="#7E1DE4")
            ui.console.print(">>> 仍使用旧版知识库的版本（如0.6.0-alpha）请选择选项 [E] <<<", style=ui.colors["error"])
            
            choice = ui.get_choice("请选择操作", ["A", "B", "C", "D", "E", "Q"])
            
            if choice == "Q":
                break
            
            # 选择配置
            config = config_mgr.select_configuration()
            if not config:
                continue
            
            if choice == "A":
                knowledge_builder.pipeline(config)
            elif choice == "B":
                knowledge_builder.text_split(config)
            elif choice == "C":
                knowledge_builder.entity_extract(config)
            elif choice == "D":
                knowledge_builder.knowledge_import(config)
            elif choice == "E":
                knowledge_builder.legacy_knowledge_build(config)
            else:
                ui.print_error("无效选项")
                ui.countdown(1)
            
            ui.pause()
    
    def handle_migration(self):
        """处理数据库迁移"""
        ui.clear_screen()
        ui.console.print("[🔄 知识库迁移]", style="#28DCF0")
        ui.console.print("MongoDB → SQLite 数据迁移")
        ui.console.print("================")
        
        knowledge_builder.migrate_mongodb_to_sqlite()
        ui.pause()
    
    def handle_deployment_menu(self):
        """处理部署菜单"""
        while True:
            ui.clear_screen()
            ui.console.print("[部署辅助系统]", style=ui.colors["primary"])
            ui.console.print("=================")
            
            ui.console.print(" [A] 实例部署", style=ui.colors["success"])
            ui.console.print(" [B] 实例更新", style=ui.colors["warning"])
            ui.console.print(" [C] 实例删除", style=ui.colors["error"])
            ui.console.print(" [Q] 返回主菜单", style="#7E1DE4")
            
            choice = ui.get_choice("请选择操作", ["A", "B", "C", "Q"])
            
            if choice == "Q":
                break
            elif choice == "A":
                # 部署新实例
                from src.modules.deployment import deployment_manager
                deployment_manager.deploy_instance()
                ui.pause()
            elif choice == "B":
                # 更新实例
                from src.modules.deployment import deployment_manager
                deployment_manager.update_instance()
                ui.pause()
            elif choice == "C":
                # 删除实例
                from src.modules.deployment import deployment_manager
                deployment_manager.delete_instance()
                ui.pause()
            else:
                ui.print_error("无效选项")
                ui.countdown(1)
    
    def handle_about_menu(self):
        """处理关于菜单"""
        ui.clear_screen()
        ui.console.print("=========>>>关于本程序<<<=========", style=ui.colors["primary"])
        ui.console.print("麦麦核心启动器控制台 MaiCore Start", style=ui.colors["primary"])
        ui.console.print("=================================")
        
        launcher_version = p_config_manager.get("launcher.version", "5.0.0-beta")
        ui.console.print(f"版本：V{launcher_version}", style=ui.colors["info"])
        ui.console.print("新增亮点：", style=ui.colors["success"])
        ui.console.print("  • WebUI", style="white")
        ui.console.print("  • Neo-MoFox支持", style="white")
        ui.console.print("  • 桌宠功能", style="white")
        ui.console.print("  • WebShell", style="white")
        ui.console.print("  • 日志解析器", style="white")

        ui.console.print("\n技术栈：", style=ui.colors["info"])
        ui.console.print("  • Python", style="white")
        ui.console.print("  • FastAPI", style="white")
        ui.console.print("  • uvicorn", style="white")
        ui.console.print("  • pydantic 等...", style="white")        
        
        ui.console.print("\n开源许可： GNU Affero General Public License v3.0", style=ui.colors["secondary"])
        ui.console.print("GitHub：https://github.com/MaiCore-Start/MaiCore-Start", style="#46AEF8")
        ui.console.print("你喜欢的话，请给个Star支持一下哦~", style="white")
        ui.console.print("欢迎加入我们的社区！（我们的QQ群聊：1025509724）", style="white")
        ui.console.print("查看文档中心获取帮助：", style="white")
        ui.console.print("https://docs.mmcstart.cn:8850/", style="#46AEF8")

        ui.console.print("\n感谢以下为此项目做出贡献的开发者：", style=ui.colors["header"])
        ui.console.print("  • 小城之雪（xiaoCZX） - 整个项目的提出者和主要开发者", style="white")
        ui.console.print("  • 一闪 - 为此项目的v4.0版本重构提供了大量支持", style="white")
        ui.console.print("  • 其他贡献者：Lui", style="white")

        ui.pause()

    def handle_misc_menu(self):
        """处理杂项菜单"""
        while True:
            ui.show_misc_menu()
            choice = ui.get_choice("请选择操作", ["A", "B", "C", "D", "E", "F", "Q"])

            if choice == "Q":
                break
            elif choice == "A":
                self.handle_about_menu()
            elif choice == "B":
                self.handle_program_settings()
            elif choice == "C":
                self.handle_component_download()
            elif choice == "D":
                self.handle_instance_statistics()
            elif choice == "E":
                self.handle_show_webui_token()
            elif choice == "F":
                self.handle_restart_webui()

    def handle_program_settings(self):
        """处理程序设置"""
        while True:
            # 重新加载颜色以反映实时变化
            from src.ui.theme import COLORS
            current_colors = p_config_manager.get_theme_colors()
            current_log_days = p_config_manager.get("logging.log_rotation_days", 30)
            on_exit_action = p_config_manager.get("on_exit.process_action", "ask")
            minimize_to_tray = p_config_manager.get("ui.minimize_to_tray", False)
            notifications_enabled = p_config_manager.get("notifications.windows_center_enabled", False)
            monitor_cfg = p_config_manager.get("monitor", {}) or {}
            monitor_data_interval = monitor_cfg.get("data_refresh_interval", 2.0)
            monitor_ui_interval = monitor_cfg.get("ui_refresh_interval", 0.3)
            monitor_input_interval = monitor_cfg.get("input_poll_interval", 0.05)
            
            # 获取代理配置
            proxy_config = p_config_manager.get_proxy_config()
            proxy_enabled = proxy_config.get("enabled", False)
            proxy_type = proxy_config.get("type", "http")
            proxy_host = proxy_config.get("host", "")
            proxy_port = proxy_config.get("port", "")
            
            ui.show_program_settings_menu(
                current_colors,
                current_log_days,
                on_exit_action,
                minimize_to_tray,
                notifications_enabled,
                monitor_data_interval,
                monitor_ui_interval,
                monitor_input_interval,
                proxy_enabled,
                proxy_type,
                proxy_host,
                proxy_port,
            )
            
            choice = ui.get_choice("请选择操作", ["L", "E", "C", "R", "T", "N", "M", "P", "Q"])
            
            if choice == "Q":
                break
            
            elif choice == "L":
                # 修改日志保留天数
                while True:
                    days_input = ui.get_input("请输入新的日志文件保留天数 (例如: 30): ")
                    try:
                        new_days = int(days_input)
                        if new_days > 0:
                            p_config_manager.set("logging.log_rotation_days", new_days)
                            p_config_manager.save()
                            ui.print_success(f"日志保留天数已更新为 {new_days} 天。")
                            ui.pause()
                            break
                        else:
                            ui.print_error("请输入一个大于0的整数。")
                    except ValueError:
                        ui.print_error("无效输入，请输入一个整数。")
            
            elif choice == "E":
                # 修改退出时操作
                actions = ["ask", "terminate", "keep"]
                action_map = {"ask": "询问", "terminate": "一律关闭", "keep": "一律保留"}
                
                options_text = " / ".join([f"[{action[0].upper()}] {action_map[action]}" for action in actions])
                
                while True:
                    user_input = ui.get_input(f"请选择操作 ({options_text}): ").lower()
                    
                    selected_action = ""
                    if user_input == 'a': selected_action = "ask"
                    elif user_input == 't': selected_action = "terminate"
                    elif user_input == 'k': selected_action = "keep"

                    if selected_action in actions:
                        p_config_manager.set("on_exit.process_action", selected_action)
                        p_config_manager.save()
                        ui.print_success(f"退出时操作已更新为: {action_map[selected_action]}")
                        ui.pause()
                        break
                    else:
                        ui.print_error("无效输入。")

            elif choice == "C":
                color_keys = list(current_colors.keys())
                while True:
                    idx_input = ui.get_input("请输入要修改的颜色选项数字 (或 Q 返回): ")
                    if idx_input.upper() == 'Q':
                        break
                    
                    try:
                        idx = int(idx_input) - 1
                        if 0 <= idx < len(color_keys):
                            key_to_edit = color_keys[idx]
                            new_value = ui.get_input(f"请输入 '{key_to_edit}' 的新颜色值 (例如: #FF00FF 或 red): ")
                            p_config_manager.set(f"theme.{key_to_edit}", new_value)
                            p_config_manager.save()
                            # 动态更新导入的COLORS
                            COLORS[key_to_edit] = new_value
                            ui.print_success(f"'{key_to_edit}' 已更新为 '{new_value}'")
                            ui.pause()
                            break
                        else:
                            ui.print_error("无效的选项数字。")
                    except ValueError:
                        ui.print_error("请输入有效的数字。")

            elif choice == "R":
                if ui.confirm("确定要将所有颜色恢复为默认设置吗？此操作不可逆。"):
                    if p_config_manager.reset_to_default():
                        # 动态更新导入的COLORS
                        default_colors = p_config_manager.DEFAULT_CONFIG['theme']
                        for k, v in default_colors.items():
                            COLORS[k] = v
                        ui.print_success("已成功恢复默认颜色设置。")
                    else:
                        ui.print_error("恢复默认设置失败。")
                    ui.pause()
            elif choice == "T":
                new_value = not minimize_to_tray
                p_config_manager.set("ui.minimize_to_tray", new_value)
                p_config_manager.save()
                state_text = "开启" if new_value else "关闭"
                ui.print_success(f"最小化到托盘功能已{state_text}。")
                ui.pause()
            elif choice == "N":
                new_value = not notifications_enabled
                p_config_manager.set("notifications.windows_center_enabled", new_value)
                p_config_manager.save()
                state_text = "开启" if new_value else "关闭"
                ui.print_success(f"Windows 通知功能已{state_text}。")
                ui.pause()
            
            elif choice == "P":
                # 配置网络代理
                self.handle_proxy_config()

            elif choice == "M":
                # 调整监控刷新间隔
                def _read_positive_float(prompt_text: str, current: float) -> float:
                    while True:
                        val = ui.get_input(prompt_text + f" (当前: {current})，回车保留当前: ")
                        if not val.strip():
                            return current
                        try:
                            num = float(val)
                            if num > 0:
                                return num
                            ui.print_error("请输入大于0的数值。")
                        except ValueError:
                            ui.print_error("请输入有效数字。")

                new_data_interval = _read_positive_float("数据刷新间隔(秒)", monitor_data_interval)
                new_ui_interval = _read_positive_float("UI刷新间隔(秒)", monitor_ui_interval)
                new_input_interval = _read_positive_float("输入轮询间隔(秒)", monitor_input_interval)

                p_config_manager.set("monitor.data_refresh_interval", new_data_interval)
                p_config_manager.set("monitor.ui_refresh_interval", new_ui_interval)
                p_config_manager.set("monitor.input_poll_interval", new_input_interval)
                p_config_manager.save()

                ui.print_success("监控刷新间隔已更新。")
                ui.pause()

    def handle_proxy_config(self):
        """处理代理配置"""
        try:
            from src.utils.proxy_manager import proxy_manager
        except ImportError:
            ui.print_error("代理管理模块不可用，请检查安装。")
            ui.pause()
            return
        
        while True:
            ui.clear_screen()
            
            # 获取当前代理配置
            proxy_info = proxy_manager.get_proxy_info()
            
            # 显示代理配置菜单
            ui.menus.show_proxy_config_menu(
                proxy_enabled=proxy_info.get("enabled", False),
                proxy_type=proxy_info.get("type", "http"),
                proxy_host=proxy_info.get("host", ""),
                proxy_port=proxy_info.get("port", ""),
                proxy_username=proxy_info.get("username", ""),
                has_password=proxy_info.get("has_password", False),
                exclude_hosts=proxy_info.get("exclude_hosts", ""),
            )
            
            choice = ui.get_input("请选择操作: ").upper()
            
            if choice == "Q":
                break
            
            elif choice == "E":
                # 启用代理
                if not proxy_info.get("host") or not proxy_info.get("port"):
                    ui.print_warning("请先设置代理主机和端口！")
                    ui.pause()
                    continue
                proxy_manager.update_config(enabled=True)
                ui.print_success("代理已启用。")
                ui.pause()
            
            elif choice == "D":
                # 禁用代理
                proxy_manager.update_config(enabled=False)
                ui.print_success("代理已禁用。")
                ui.pause()
            
            elif choice == "1":
                # 设置代理类型
                ui.print_info("支持的代理类型：HTTP、HTTPS、SOCKS5、SOCKS4")
                proxy_type = ui.get_input("请输入代理类型 [http/https/socks5/socks4]: ").lower()
                if proxy_type in ["http", "https", "socks5", "socks4"]:
                    proxy_manager.update_config(type=proxy_type)
                    ui.print_success(f"代理类型已设置为: {proxy_type.upper()}")
                else:
                    ui.print_error("无效的代理类型。")
                ui.pause()
            
            elif choice == "2":
                # 设置代理主机
                host = ui.get_input("请输入代理主机地址 (例如: 127.0.0.1): ").strip()
                if host:
                    proxy_manager.update_config(host=host)
                    ui.print_success(f"代理主机已设置为: {host}")
                else:
                    ui.print_error("主机地址不能为空。")
                ui.pause()
            
            elif choice == "3":
                # 设置代理端口
                port = ui.get_input("请输入代理端口 (例如: 7890): ").strip()
                if port.isdigit():
                    proxy_manager.update_config(port=port)
                    ui.print_success(f"代理端口已设置为: {port}")
                else:
                    ui.print_error("端口必须是数字。")
                ui.pause()
            
            elif choice == "4":
                # 设置用户名
                username = ui.get_input("请输入用户名 (留空则不使用): ").strip()
                proxy_manager.update_config(username=username)
                if username:
                    ui.print_success(f"用户名已设置为: {username}")
                else:
                    ui.print_success("已清除用户名。")
                ui.pause()
            
            elif choice == "5":
                # 设置密码
                import getpass
                password = getpass.getpass("请输入密码 (输入时不显示): ").strip()
                proxy_manager.update_config(password=password)
                if password:
                    ui.print_success("密码已设置。")
                else:
                    ui.print_success("已清除密码。")
                ui.pause()
            
            elif choice == "6":
                # 设置排除主机
                ui.print_info("不使用代理的主机列表，用逗号分隔")
                ui.print_info("例如: localhost,127.0.0.1,*.local")
                exclude = ui.get_input("请输入排除主机列表: ").strip()
                if exclude:
                    proxy_manager.update_config(exclude_hosts=exclude)
                    ui.print_success(f"排除主机已设置为: {exclude}")
                else:
                    ui.print_error("排除主机列表不能为空。")
                ui.pause()
            
            elif choice == "T":
                # 测试代理连接
                ui.print_info("正在测试代理连接...")
                result = proxy_manager.test_connection("https://www.baidu.com")
                
                if result.get("success"):
                    ui.print_success(result.get("message", "连接成功"))
                else:
                    ui.print_error(result.get("message", "连接失败"))
                ui.pause()
            
            elif choice == "C":
                # 快速配置 Clash
                proxy_manager.update_config(
                    type="http",
                    host="127.0.0.1",
                    port="7890",
                    username="",
                    password="",
                )
                ui.print_success("已配置为 Clash 默认代理 (HTTP 127.0.0.1:7890)")
                ui.pause()
            
            elif choice == "V":
                # 快速配置 V2rayN
                proxy_manager.update_config(
                    type="socks5",
                    host="127.0.0.1",
                    port="10808",
                    username="",
                    password="",
                )
                ui.print_success("已配置为 V2rayN 默认代理 (SOCKS5 127.0.0.1:10808)")
                ui.pause()
            
            elif choice == "S":
                # 快速配置 Shadowsocks
                proxy_manager.update_config(
                    type="socks5",
                    host="127.0.0.1",
                    port="1080",
                    username="",
                    password="",
                )
                ui.print_success("已配置为 Shadowsocks 默认代理 (SOCKS5 127.0.0.1:1080)")
                ui.pause()
            
            else:
                ui.print_error("无效的选项。")
                ui.pause()

    def handle_component_download(self):
        """处理组件下载"""
        try:
            # 导入组件下载管理器
            from src.modules.component_download.component_manager import component_manager
            
            while True:
                ui.clear_screen()
                ui.components.show_title("组件下载中心", symbol="📥")
                
                # 显示组件选择菜单
                component_key = component_manager.show_component_download_menu()
                if not component_key:
                    break
                
                # 执行组件下载
                success = component_manager.download_component(component_key)
                if success:
                    ui.print_success(f"组件下载完成！")
                else:
                    ui.print_error(f"组件下载失败！")
                
                ui.pause()
                
        except Exception as e:
            ui.print_error(f"组件下载过程出错：{str(e)}")
            logger.error("组件下载异常", error=str(e))
            ui.pause()

    def handle_instance_statistics(self):
        """处理实例运行数据查看"""
        try:
            ui.clear_screen()
            ui.console.print("[📊 实例运行数据查看]", style=ui.colors["secondary"])
            ui.console.print("==================")
            
            ui.console.print("请选择数据来源方式（此功能目前仅支持MaiBot实例）：", style=ui.colors["info"])
            ui.console.print(" [A] 从已配置的实例中选择", style=ui.colors["success"])
            ui.console.print(" [B] 直接输入实例路径", style=ui.colors["warning"])
            ui.console.print(" [Q] 返回上级菜单", style=ui.colors["exit"])
            
            choice = ui.get_choice("请选择操作", ["A", "B", "Q"])
            
            if choice == "Q":
                return
            elif choice == "A":
                # 从已配置的实例中选择
                config = config_mgr.select_configuration()
                if not config:
                    ui.pause()
                    return
                
                # 检查是否为MaiBot
                bot_type = config.get("bot_type", "")
                if bot_type != "MaiBot":
                    ui.print_warning("此功能目前仅支持MaiBot实例")
                    ui.pause()
                    return
                
                # 导入并使用统计管理器
                try:
                    from src.modules.instance_statistics import instance_statistics_manager
                    success = instance_statistics_manager.open_statistics_page(config=config)
                    if success:
                        ui.print_success("统计页面已在浏览器中打开")
                    else:
                        ui.print_error("打开统计页面失败")
                except ImportError as e:
                    ui.print_error(f"无法导入统计模块：{str(e)}")
                    logger.error("导入统计模块失败", error=str(e))
                
                ui.pause()
                
            elif choice == "B":
                # 直接输入实例路径
                instance_path = ui.get_input("请输入MaiBot实例路径：")
                if not instance_path:
                    ui.print_warning("未输入路径")
                    ui.pause()
                    return
                
                # 验证路径是否存在
                if not os.path.exists(instance_path):
                    ui.print_error(f"路径不存在：{instance_path}")
                    ui.pause()
                    return
                
                # 检查是否为有效的MaiBot实例
                if not self._validate_maibot_instance(instance_path):
                    ui.print_warning("该路径似乎不是有效的MaiBot实例")
                    if not ui.confirm("是否继续生成统计页面？"):
                        return
                
                # 导入并使用统计管理器
                try:
                    from src.modules.instance_statistics import instance_statistics_manager
                    success = instance_statistics_manager.open_statistics_page(instance_path=instance_path)
                    if success:
                        ui.print_success("统计页面已在浏览器中打开")
                    else:
                        ui.print_error("打开统计页面失败")
                except ImportError as e:
                    ui.print_error(f"无法导入统计模块：{str(e)}")
                    logger.error("导入统计模块失败", error=str(e))
                
                ui.pause()
                
        except Exception as e:
            ui.print_error(f"查看实例运行数据过程出错：{str(e)}")
            logger.error("实例运行数据查看异常", error=str(e))
            ui.pause()
    
    def handle_show_webui_token(self):
        """处理查看WebUI Token"""
        import re
        
        ui.clear_screen()
        ui.console.print("[🔐 WebUI Token查看]", style=ui.colors["secondary"])
        ui.console.print("==================")
        
        # 获取Token
        from src.core.p_config import p_config_manager
        token = p_config_manager.get("webui.webui_token", "")
        webui_host = p_config_manager.get("webui.host", "0.0.0.0")
        webui_port = p_config_manager.get("webui.port", 10086)
        
        # Token验证函数
        def validate_token(token_str: str) -> tuple[bool, str]:
            """验证Token是否符合安全要求"""
            if len(token_str) < 16:
                return False, "Token长度必须至少16位"
            if not re.search(r"[A-Z]", token_str):
                return False, "Token必须包含至少一个大写英文字母"
            if not re.search(r"[a-z]", token_str):
                return False, "Token必须包含至少一个小写英文字母"
            if not re.search(r"\d", token_str):
                return False, "Token必须包含至少一个数字"
            if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\x5c|,.<>/?]", token_str):
                return False, "Token必须包含至少一个特殊字符 (!@#$%^&*...)"
            return True, "Token验证通过"
        
        # 生成符合安全要求的随机Token
        def generate_secure_token(length: int = 24) -> str:
            import secrets
            import string
            alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
            while True:
                new_token = ''.join(secrets.choice(alphabet) for _ in range(length))
                is_valid, _ = validate_token(new_token)
                if is_valid:
                    return new_token
        
        if not token:
            # 如果没有token，自动生成一个符合要求的
            token = generate_secure_token()
            p_config_manager.set("webui.webui_token", token)
            p_config_manager.save()
            ui.console.print("已自动生成符合安全要求的Token", style=ui.colors["success"])
        
        ui.console.print(f"\nWebUI访问地址: http://localhost:{webui_port}", style=ui.colors["info"])
        ui.console.print(f"\n[bold]当前Token:[/bold] {token}", style=ui.colors["primary"])
        
        # 显示Token安全状态
        is_valid, msg = validate_token(token)
        if is_valid:
            ui.console.print(f"Token状态: ✅ {msg}", style=ui.colors["success"])
        else:
            ui.console.print(f"Token状态: ❌ {msg}", style=ui.colors["error"])
        
        ui.console.print("\n请妥善保管此Token，登录时需要输入", style=ui.colors["warning"])
        
        # 操作选择
        ui.console.print("\n====== 操作 ======")
        ui.console.print(" [A] 设置自定义Token", style=ui.colors["success"])
        ui.console.print(" [B] 重新生成随机Token", style=ui.colors["warning"])
        ui.console.print(" [Q] 返回上级菜单", style=ui.colors["exit"])
        
        choice = ui.get_choice("请选择操作", ["A", "B", "Q"])
        
        if choice == "A":
            # 设置自定义Token
            while True:
                custom_token = ui.get_input("请输入自定义Token（至少16位，包含大写、小写、数字和特殊字符）: ")
                if not custom_token:
                    ui.print_warning("Token不能为空")
                    continue
                
                is_valid, msg = validate_token(custom_token)
                if is_valid:
                    p_config_manager.set("webui.webui_token", custom_token)
                    p_config_manager.save()
                    ui.console.print(f"\n✅ 自定义Token设置成功！", style=ui.colors["success"])
                    ui.console.print(f"新Token: {custom_token}", style=ui.colors["primary"])
                    break
                else:
                    ui.console.print(f"❌ Token不符合要求: {msg}", style=ui.colors["error"])
                    if not ui.confirm("是否重新输入？"):
                        break
                        
        elif choice == "B":
            # 重新生成随机Token
            if ui.confirm("确定要重新生成Token吗？之前的Token将失效！"):
                new_token = generate_secure_token()
                p_config_manager.set("webui.webui_token", new_token)
                p_config_manager.save()
                ui.console.print(f"\n✅ 新Token已生成！", style=ui.colors["success"])
                ui.console.print(f"新Token: {new_token}", style=ui.colors["primary"])
        
        ui.pause()

    def handle_restart_webui(self):
        """处理重启WebUI服务器"""
        ui.clear_screen()
        ui.console.print("[🔄 重启WebUI服务器]", style=ui.colors["secondary"])
        ui.console.print("==================")

        # 获取当前WebUI状态
        webui_port = p_config_manager.get("webui.port", 10086)
        status = self.webui_manager.get_status(webui_port)

        if status["running"]:
            ui.console.print(f"当前WebUI服务状态: 运行中", style=ui.colors["success"])
            ui.console.print(f"PID: {status.get('pid', 'N/A')}", style=ui.colors["info"])
            ui.console.print(f"端口: {status['port']}", style=ui.colors["info"])
            ui.console.print(f"访问地址: {status['url']}", style=ui.colors["info"])
        else:
            ui.console.print(f"当前WebUI服务状态: 未运行", style=ui.colors["warning"])

        ui.console.print()

        if not ui.confirm("确定要重启WebUI服务器吗？"):
            ui.print_info("已取消重启操作")
            ui.pause()
            return

        ui.print_info("正在重启WebUI服务器...")
        logger.info("用户请求重启WebUI服务器")

        # 执行重启
        if self.webui_manager.restart(webui_port):
            ui.print_success("WebUI服务器重启成功！")
            logger.info("WebUI服务器重启成功")

            # 等待服务就绪
            import time
            ui.print_info("等待服务就绪...")
            for i in range(10):
                time.sleep(1)
                if self.webui_manager.is_running(webui_port):
                    ui.print_success(f"WebUI服务已就绪: {status['url']}")

                    # 询问是否打开浏览器
                    if ui.confirm("是否在浏览器中打开WebUI？"):
                        import webbrowser
                        try:
                            webbrowser.open(status['url'])
                            ui.print_success("已在浏览器中打开WebUI")
                        except Exception as e:
                            ui.print_warning(f"打开浏览器失败: {e}")
                    break
            else:
                ui.print_warning("WebUI服务启动超时，请稍后手动检查")
        else:
            ui.print_error("WebUI服务器重启失败！")
            logger.error("WebUI服务器重启失败")

        ui.pause()

    def _validate_maibot_instance(self, instance_path: str) -> bool:
        """验证是否为有效的MaiBot实例"""
        try:
            # 检查关键文件是否存在
            key_files = ["bot.py", "main.py", "package.json"]
            for file in key_files:
                if not os.path.exists(os.path.join(instance_path, file)):
                    return False
            
            # 检查是否有MaiBot相关的目录结构
            subdirs = os.listdir(instance_path)
            maibot_indicators = ["src", "plugins", "config", "adapter"]
            has_maibot_structure = any(indicator in subdirs for indicator in maibot_indicators)
            
            return has_maibot_structure
            
        except Exception:
            return False

    def handle_refresh_daily_quote(self):
        """处理刷新每日一言"""
        ui.clear_screen()
        ui.console.print("[🔄 刷新每日一言]", style=ui.colors["secondary"])
        ui.console.print("==================")
        
        # 获取当前每日一言
        old_quote = ui.menus.daily_quote
        
        # 刷新每日一言
        new_quote = ui.menus.refresh_daily_quote()
        
        # 显示结果
        ui.console.print(f"原每日一言: {old_quote}", style=ui.colors["info"])
        ui.console.print(f"新每日一言: {new_quote}", style=ui.colors["success"])
        
        if old_quote != new_quote:
            ui.print_success("每日一言刷新成功！")
        else:
            ui.print_info("每日一言未发生变化（可能是随机选择了相同内容）")
        
        ui.pause()

    def handle_process_status(self):
        """处理进程状态查看，支持自动刷新和交互式命令（最终优化版）。"""
        import msvcrt
        from rich.live import Live
        from rich.panel import Panel
        from rich.text import Text
        from rich.layout import Layout
        from rich.table import Table

        # 调整刷新节奏，减少空转 CPU 占用；支持在程序设置中配置
        monitor_cfg = p_config_manager.get("monitor", {}) or {}
        DATA_REFRESH_INTERVAL = float(monitor_cfg.get("data_refresh_interval", 2.0) or 2.0)
        UI_REFRESH_INTERVAL = float(monitor_cfg.get("ui_refresh_interval", 0.3) or 0.3)
        INPUT_POLL_INTERVAL = float(monitor_cfg.get("input_poll_interval", 0.05) or 0.05)

        # 合理下限保护，避免配置过小导致高占用
        DATA_REFRESH_INTERVAL = max(0.5, DATA_REFRESH_INTERVAL)
        UI_REFRESH_INTERVAL = max(0.1, UI_REFRESH_INTERVAL)
        INPUT_POLL_INTERVAL = max(0.01, INPUT_POLL_INTERVAL)

        # 预先构造不会变化的表格，避免循环内重复生成
        base_command_table = Table.grid(padding=(0, 1))
        base_command_table.add_column(style="bold yellow", width=15); base_command_table.add_column()
        base_command_table.add_row("stop <PID>", "终止指定PID的进程"); base_command_table.add_row("restart <PID>", "重启指定PID的进程")
        base_command_table.add_row("details <PID>", "查看指定PID的进程详情"); base_command_table.add_row("stopall", "终止所有受管进程")
        base_command_table.add_row("q / quit", "退出状态监控")
        base_command_table.add_row("Tab键", "补全指令或PID")

        should_quit_monitor = False
        while not should_quit_monitor:
            command_result = None
            # 每次处理完一个命令（如查看详情）后，重新创建一个Live实例
            with Live(auto_refresh=False, screen=True, transient=True) as live:
                input_buffer = ""
                last_data_refresh = 0
                last_ui_refresh = 0
                COMMANDS = ["stop", "restart", "details", "stopall", "quit", "q"]
                # 初始数据获取
                process_table = launcher.show_running_processes()

                while True: # Live 渲染循环
                    now = time.time()
                    
                    # --- 1. 处理输入 (非阻塞) ---
                    input_changed = False
                    if msvcrt.kbhit():
                        while msvcrt.kbhit():
                            char = msvcrt.getwch()
                        input_changed = True
                        
                        if char == '\r':  # Enter
                            command_result = self._handle_process_command(input_buffer.strip())
                            if command_result:
                                break
                            input_buffer = ""
                        elif char == '\t':  # Tab
                            parts = input_buffer.split(" ", 1)
                            # 场景1: 补全指令
                            if len(parts) == 1:
                                suggestion = next((cmd for cmd in COMMANDS if cmd.startswith(parts[0].lower()) and parts[0]), None)
                                if suggestion:
                                    input_buffer = suggestion + " " if suggestion in ["stop", "restart", "details"] else suggestion
                            # 场景2: 补全PID
                            elif len(parts) == 2 and parts[0] in ["stop", "restart", "details"]:
                                pid_prefix = parts[1]
                                if pid_prefix.isdigit() or pid_prefix == "":
                                    all_pids = launcher.get_managed_pids()
                                    matching_pid = next((str(p) for p in all_pids if str(p).startswith(pid_prefix)), None)
                                    if matching_pid:
                                        input_buffer = f"{parts[0]} {matching_pid}"

                        elif char == '\x08':  # Backspace
                            input_buffer = input_buffer[:-1]
                        elif char not in ('\x00', '\xe0'):  # 忽略功能键
                            input_buffer += char
                    
                    if command_result:
                        break

                    # --- 2. 刷新进程数据 (定时) ---
                    data_changed = False
                    if now - last_data_refresh > DATA_REFRESH_INTERVAL:
                        last_data_refresh = now
                        process_table = launcher.show_running_processes()
                        data_changed = True

                    # --- 3. 刷新UI (按需) ---
                    if input_changed or data_changed or (now - last_ui_refresh > UI_REFRESH_INTERVAL):
                        last_ui_refresh = now

                        suggestion = ""
                        parts = input_buffer.split(" ", 1)
                        if len(parts) == 1 and parts[0]:
                             suggestion = next((cmd for cmd in COMMANDS if cmd.startswith(parts[0].lower()) and cmd != parts[0].lower()), "")

                        input_text = Text(f"> {input_buffer}", no_wrap=True)
                        if suggestion:
                            input_text.append(suggestion[len(input_buffer):], style="italic dim")
                        
                        if int(now * 2) % 2 == 0:
                           input_text.append("_") # ▋

                        layout = Layout()
                        layout.split_column(
                            Panel(base_command_table, title="[bold]可用命令[/bold]", border_style="dim"),
                            process_table,
                            Panel(input_text, border_style="cyan", title="输入命令", height=3)
                        )
                        live.update(layout)
                        live.refresh()

                    # --- 4. 自适应休眠，减少空转 ---
                    next_data_due = last_data_refresh + DATA_REFRESH_INTERVAL
                    next_ui_due = last_ui_refresh + UI_REFRESH_INTERVAL
                    next_tick = min(next_data_due, next_ui_due)
                    sleep_for = max(0.0, min(INPUT_POLL_INTERVAL, next_tick - time.time()))
                    time.sleep(sleep_for)

            # --- 4. Live循环结束后，处理命令结果 ---
            if isinstance(command_result, dict):
                self._show_process_details(command_result)
            elif command_result == "quit":
                should_quit_monitor = True

        ui.print_info("\n已退出进程状态监控。")
        logger.info("用户退出进程状态监控")

    def _show_process_details(self, details: dict):
        """在一个专用的屏幕上显示进程详情。"""
        from rich.panel import Panel
        from rich.text import Text
        detail_text = ""
        pid = details.get("PID", "N/A")
        for key, value in details.items():
            detail_text += f"[bold cyan]{key}:[/bold cyan] {str(value)}\n"
        
        ui.clear_screen()
        ui.console.print(Panel(Text(detail_text.strip()), title=f"进程 {pid} 详细信息", border_style="yellow", subtitle="按任意键返回监控..."))
        ui.pause("") # 传入空字符串以避免默认提示

    def _handle_process_command(self, command: str) -> Any:
        """解析并执行进程管理命令，返回结果用于主循环处理。"""
        parts = command.strip().lower().split()
        if not parts: return None
        cmd, args = parts[0], parts[1:]

        if cmd in ("q", "quit"): return "quit"
        
        if cmd == "stop":
            if not args or not args[0].isdigit(): return ("message", "用法: stop <PID>", "yellow")
            pid = int(args[0])
            if launcher.stop_process(pid): return ("message", f"已发送停止命令到 PID {pid}", "green")
            return ("message", f"无法停止 PID {pid}，可能不是受管进程。", "red")

        elif cmd == "restart":
            if not args or not args[0].isdigit(): return ("message", "用法: restart <PID>", "yellow")
            pid = int(args[0])
            if launcher.restart_process(pid): return ("message", f"成功重启进程 (原PID: {pid})", "green")
            return ("message", f"无法重启 PID {pid}", "red")

        elif cmd == "stopall":
            launcher.stop_all_processes()
            return ("message", "所有受管进程已停止。", "green")

        elif cmd == "details":
            if not args or not args[0].isdigit(): return ("message", "用法: details <PID>", "yellow")
            pid = int(args[0])
            details = launcher.get_process_details(pid)
            if details: return details
            return ("message", f"无法获取 PID {pid} 的详细信息。", "red")
        
        return ("message", f"未知命令: '{cmd}'", "red")

    def _try_minimize_to_tray(self) -> bool:
        """Attempt to minimize the launcher to the system tray when enabled."""
        if not p_config_manager.get("ui.minimize_to_tray", False):
            return False

        if not self.tray_manager.is_supported():
            ui.print_warning("当前环境不支持最小化到系统托盘功能。")
            return False

        ui.print_info("正在最小化到系统托盘，可通过托盘图标恢复或退出。")
        logger.info("用户启用了最小化到托盘功能")

        self._tray_restore_event.clear()
        self._tray_exit_event.clear()

        if not self.tray_manager.minimize(
            on_restore=lambda: self._tray_restore_event.set(),
            on_exit=lambda: self._tray_exit_event.set(),
        ):
            ui.print_error("最小化到托盘失败，请检查 output.ico 是否存在。")
            return False

        while True:
            if self._tray_exit_event.wait(timeout=0.2):
                self._tray_exit_event.clear()
                logger.info("托盘菜单请求退出程序")
                self._handle_exit_request()
                return True

            if self._tray_restore_event.is_set():
                self._tray_restore_event.clear()
                ui.print_info("已从系统托盘恢复。")
                logger.info("用户从托盘恢复窗口")
                return True

    def _handle_exit_request(self) -> bool:
        """统一处理退出逻辑，返回是否完成退出。"""
        has_child_processes = len(launcher.get_managed_pids()) > 1
        action = p_config_manager.get("on_exit.process_action", "ask")

        do_exit = False
        if not has_child_processes:
            do_exit = True
        elif action == "terminate":
            ui.print_info("根据设置，将关闭所有托管进程...")
            launcher.stop_all_processes()
            do_exit = True
        elif action == "keep":
            ui.print_info("根据设置，将保留所有托管进程...")
            self._keep_processes_on_exit = True
            do_exit = True
        else:
            ui.print_warning("检测到有正在运行的机器人进程。")
            while True:
                choice_exit = ui.get_input("退出启动器时要如何处理这些进程？[K]保留 [T]关闭 [C]取消退出: ").upper()
                if choice_exit == 'K':
                    ui.print_info("将保留所有托管进程...")
                    self._keep_processes_on_exit = True
                    do_exit = True
                    logger.info("用户选择保留进程并退出")
                    break
                elif choice_exit == 'T':
                    ui.print_info("将关闭所有托管进程...")
                    launcher.stop_all_processes()
                    do_exit = True
                    logger.info("用户选择关闭进程并退出")
                    break
                elif choice_exit == 'C':
                    logger.info("用户取消退出程序")
                    break
                else:
                    ui.print_error("无效输入。")

        if do_exit:
            self.running = False
            ui.print_info("感谢使用MCStart！")
            logger.info("用户退出程序")
        return do_exit

    def _has_active_instance(self) -> bool:
        """检查是否有活跃的实例"""
        try:
            # 检查是否有正在运行的进程
            managed_pids = launcher.get_managed_pids()
            # 如果有超过1个PID（除了启动器本身），说明有活跃实例
            return len(managed_pids) > 1
        except Exception:
            return False
    
    def run(self):
        """运行主程序"""
        try:
            logger.info("启动器主循环开始")
            
            # 新手引导检测
            if p_config_manager.get("first_run", False):
                try:
                    from src.modules.onboarding import run_onboarding
                    run_onboarding()
                except Exception as e:
                    logger.error("新手引导运行失败", error=str(e))
                    ui.print_error(f"新手引导运行失败: {str(e)}")
                    ui.pause()

            while self.running:
                # 检查是否有活跃实例来决定菜单显示
                has_active = self._has_active_instance()
                ui.show_main_menu(has_active)
                choice = ui.get_input("请输入选项").upper()
                
                logger.debug("用户选择", choice=choice)
                
                if choice == "Q":
                    if self._try_minimize_to_tray():
                        continue
                    self._handle_exit_request()
                elif choice == "A":
                    if has_active:
                        # 有活跃实例时，显示实例多开菜单
                        self.handle_multi_instance_menu()
                    else:
                        # 没有活跃实例时，运行正常实例
                        self.handle_launch_mai()
                elif choice == "B":
                    self.handle_config_menu()
                elif choice == "C":
                    self.handle_knowledge_menu()
                elif choice == "D":
                    self.handle_migration()
                elif choice == "E":
                    # 插件管理
                    ui.show_plugin_menu()
                elif choice == "F":
                    self.handle_deployment_menu()
                elif choice == "G":
                    self.handle_process_status()
                elif choice == "H":
                    self.handle_misc_menu()
                elif choice == "R":
                    # 直接在主菜单刷新每日一言
                    old_quote = ui.menus.daily_quote
                    new_quote = ui.menus.refresh_daily_quote()
                    
                    if old_quote != new_quote:
                        ui.print_success("每日一言已刷新！")
                    else:
                        ui.print_info("每日一言未发生变化")
                    
                    # 短暂暂停后重新显示主菜单
                    time.sleep(1)
                    continue
                else:
                    ui.print_error("无效选项")
                    ui.countdown(1)
                    
        except KeyboardInterrupt:
            ui.print_info("\n程序被用户中断")
            logger.info("程序被用户中断")
        except Exception as e:
            ui.print_error(f"程序运行出错：{str(e)}")
            logger.error("程序运行异常", error=str(e))
        finally:
            self.tray_manager.stop()
            # 停止WebUI后端服务器
            self._stop_webui_server()
            # 除非明确指示，否则停止所有进程
            if not self._keep_processes_on_exit:
                launcher.stop_all_processes()
            logger.info("启动器程序结束")
    
    def handle_multi_instance_menu(self):
        """处理实例多开菜单"""
        try:
            from src.modules.instance_multi_launcher import instance_multi_launcher
            instance_multi_launcher.show_multi_instance_menu()
        except ImportError as e:
            ui.print_error(f"实例多开模块导入失败：{str(e)}")
            logger.error("实例多开模块导入失败", error=str(e))
            ui.pause()
        except Exception as e:
            ui.print_error(f"实例多开菜单出错：{str(e)}")
            logger.error("实例多开菜单异常", error=str(e))
            ui.pause()


def _build_cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=True)
    action_group = parser.add_mutually_exclusive_group()
    action_group.add_argument(
        "-d",
        dest="deploy_template",
        default="",
        metavar="PATH",
        help="执行完整模板部署，可传模板目录或 DeploymentMOD.toml 文件路径。",
    )
    action_group.add_argument(
        "-l",
        dest="launch_template",
        default="",
        metavar="PATH",
        help="针对已部署实例执行模板启动阶段，可传模板目录或 DeploymentMOD.toml 文件路径。",
    )
    action_group.add_argument(
        "-c",
        dest="config_template",
        default="",
        metavar="PATH",
        help="针对已部署实例执行模板配置阶段，可传模板目录或 DeploymentMOD.toml 文件路径。",
    )
    action_group.add_argument(
        "-com",
        dest="component_template",
        default="",
        metavar="PATH",
        help="执行模板组件阶段，可传模板目录或 DeploymentMOD.toml 文件路径。",
    )
    action_group.add_argument(
        "-u",
        dest="uninstall_template",
        default="",
        metavar="PATH",
        help="针对已部署实例执行模板卸载阶段，可传模板目录或 DeploymentMOD.toml 文件路径。",
    )
    action_group.add_argument(
        "-t",
        dest="test_template",
        default="",
        metavar="PATH",
        help="执行模板语法检测，可传模板目录或 DeploymentMOD.toml 文件路径。",
    )
    action_group.add_argument(
        "--open-package",
        dest="open_package",
        default="",
        metavar="PATH",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=["deploy", "launch", "config", "component", "uninstall", "test", "login"],
        help="模板命令别名，或 login 登录命令。",
    )
    parser.add_argument(
        "command_template",
        nargs="?",
        default="",
        help="command 模式下的模板路径，或 login 模式下的登录提供商。",
    )
    return parser


def _coerce_positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def _prompt_yes_no(prompt: str) -> bool | None:
    while True:
        try:
            answer = input(f"{prompt} [y/N]: ").strip().lower()
        except EOFError:
            return None
        if answer in {"", "n", "no"}:
            return False
        if answer in {"y", "yes"}:
            return True
        print("请输入 y 或 n。")


def _prompt_secret(prompt: str) -> str:
    if sys.stdin.isatty():
        try:
            import getpass
            return getpass.getpass(prompt)
        except Exception:
            pass
    try:
        return input(prompt)
    except EOFError:
        return ""


def _handle_github_admin_transfer(user_id: str) -> int:
    from src.webui_api.auth_core import account_store

    print("")
    print("当前 GitHub 账号是除系统管理员外第一个注册的账号。")
    choice = _prompt_yes_no("是否将管理员权限移交至该账户？")
    if choice is None:
        print("当前终端无法读取确认输入，本次暂不处理管理员权限移交。")
        print("之后可以登录管理员账户，在 [设置]->[账号与成员管理] 中转让。")
        return 0

    if not choice:
        result = account_store.replace_admin_with_github_user(user_id, False, "")
        print(result.get("message") or "已保留当前管理员。")
        print("之后可以登录管理员账户，在 [设置]->[账号与成员管理] 中转让。")
        return 0

    for attempt in range(1, 4):
        token = _prompt_secret("请输入系统初始化时生成的 Token: ").strip()
        if not token:
            print("Token 不能为空。")
            continue
        result = account_store.replace_admin_with_github_user(user_id, True, token)
        print(result.get("message") or ("管理员权限已移交。" if result.get("success") else "管理员权限移交失败。"))
        if result.get("success"):
            return 0
        if attempt < 3:
            print("请重新输入 Token。")

    return 1


def _run_github_login() -> int:
    import urllib.parse

    from src.webui_api.auth_api import (
        GITHUB_EMAILS_URL,
        GITHUB_USER_URL,
        _github_api_json,
        _github_client_id,
        _github_config,
        _github_status_payload,
        _poll_access_token,
        _request_device_code,
        _select_github_email,
    )
    from src.webui_api.auth_core import account_store

    config = _github_config()
    status = _github_status_payload()
    if not status.get("enabled"):
        print("GitHub Device Flow 未启用。")
        return 1

    try:
        device_response = _request_device_code(_github_client_id(config), str(status.get("scope") or "read:user user:email"))
    except Exception as exc:
        print(f"GitHub Device Flow 启动失败：{exc}")
        return 1

    device_code = str(device_response.get("device_code") or "").strip()
    user_code = str(device_response.get("user_code") or "").strip()
    verification_uri = str(device_response.get("verification_uri") or "https://github.com/login/device").strip()
    authorization_url = str(device_response.get("verification_uri_complete") or "").strip()
    if not authorization_url and user_code:
        authorization_url = f"{verification_uri}?user_code={urllib.parse.quote(user_code)}"
    interval = _coerce_positive_int(device_response.get("interval"), 5)
    expires_in = _coerce_positive_int(device_response.get("expires_in"), 900)

    if not device_code or not user_code or not verification_uri:
        print("GitHub 未返回完整授权信息，请稍后重试。")
        return 1

    print("请在浏览器中打开下面的 GitHub 授权链接，并输入授权代码。")
    print(f"授权链接：{authorization_url or verification_uri}")
    print(f"授权代码：{user_code}")
    print("已开始在后台静默轮询授权状态，请保持此窗口打开。")

    access_token = ""
    deadline = time.monotonic() + expires_in
    client_id = _github_client_id(config)
    while time.monotonic() < deadline:
        time.sleep(interval)
        try:
            token_response = _poll_access_token(client_id, device_code)
        except Exception:
            continue

        error = str(token_response.get("error") or "").strip()
        if error == "authorization_pending":
            continue
        if error == "slowdown":
            interval = max(interval + 5, _coerce_positive_int(token_response.get("interval"), interval + 5))
            continue
        if error == "expired_token":
            print("GitHub 授权已过期，请重新执行 mcsb login github.com。")
            return 1
        if error == "access_denied":
            print("GitHub 授权已被取消。")
            return 1
        if error:
            print(f"GitHub 授权失败：{error}")
            return 1

        access_token = str(token_response.get("access_token") or "").strip()
        if access_token:
            break

    if not access_token:
        print("等待 GitHub 授权超时，请重新执行 mcsb login github.com。")
        return 1

    try:
        github_user = _github_api_json(GITHUB_USER_URL, access_token)
        github_emails = _github_api_json(GITHUB_EMAILS_URL, access_token)
    except Exception as exc:
        print(f"GitHub 用户信息请求失败：{exc}")
        return 1

    primary_email, email_verified = _select_github_email(github_user, github_emails)
    result = account_store.upsert_github_user(github_user, primary_email, email_verified)
    if not result.get("success"):
        print(result.get("message") or "GitHub 登录失败。")
        return 1

    user = result.get("user") or {}
    print("")
    print(f"GitHub 登录成功：{user.get('name') or user.get('email')}")
    print(f"系统账号：{user.get('email', '')}")
    print("账号已注册到系统。" if result.get("created") else "已登录现有系统账号。")
    if user.get("password_managed_by_github"):
        print("该 GitHub 账号默认不展示随机本地密码；之后可在 [设置]->[账号与成员管理] 中首次设置本地密码。")

    if user.get("github_admin_transfer_pending"):
        return _handle_github_admin_transfer(str(user.get("id") or ""))

    return 0


def _run_login_cli(provider: str) -> int:
    normalized_provider = provider.strip().lower()
    if not normalized_provider:
        print("缺少登录提供商。用法：mcsb login github.com")
        return 1
    if normalized_provider != "github.com":
        print(f"暂不支持登录提供商：{provider}")
        print("当前支持：mcsb login github.com")
        return 1
    return _run_github_login()


def _prompt_text_with_default(prompt: str, default: str) -> str:
    suffix = f" [{default}]" if default else ""
    try:
        value = input(f"{prompt}{suffix}: ").strip().strip('"')
    except EOFError:
        value = ""
    return value or default


def _http_detail_to_text(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    if isinstance(detail, dict):
        message = detail.get("message")
        if message:
            return str(message)
        return str(detail)
    if detail:
        return str(detail)
    return str(exc)


def _run_open_package_cli(package_path: str) -> int:
    raw_path = str(package_path or "").strip().strip('"')
    if not raw_path:
        print("缺少要打开的包文件路径。")
        return 1

    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    path = path.resolve()
    if not path.is_file():
        print(f"包文件不存在：{path}")
        return 1

    suffix = path.suffix.lower()
    default_dest = str(path.parent)
    print(f"正在打开包文件：{path}")

    if suffix == ".mcsins":
        from src.cli.pack import import_instance

        dest_dir = _prompt_text_with_default("请输入实例导入目标目录", default_dest)
        try:
            extract_dir = import_instance(str(path), dest_dir, confirm=True, setup_venv=None)
        except RuntimeError as exc:
            print(str(exc))
            return 0
        print(f"实例导入完成：{extract_dir}")
        return 0

    if suffix == ".mcsmod":
        from fastapi import HTTPException
        from webui.backend.api.workbench_files import import_workbench_archive_bytes

        dest_dir = _prompt_text_with_default("请输入工作台模板导入目标目录", default_dest)
        try:
            result = import_workbench_archive_bytes(path.name, path.read_bytes(), dest_dir)
        except HTTPException as exc:
            print(f"模板包导入失败：{_http_detail_to_text(exc)}")
            return 1

        project = result.get("project") if isinstance(result, dict) else None
        if isinstance(project, dict):
            print(f"模板包导入完成：{project.get('mod_name') or project.get('mod_id') or path.stem}")
            print(f"项目目录：{project.get('path') or dest_dir}")
        else:
            print("模板包导入完成。")
        return 0

    print(f"不支持的包文件类型：{suffix or '(无扩展名)'}")
    return 1


def _run_cli_mode(args: argparse.Namespace) -> int | None:
    open_package = str(getattr(args, "open_package", "") or "").strip()
    if open_package:
        return _run_open_package_cli(open_package)

    cli_actions = [
        ("deploy", str(getattr(args, "deploy_template", "") or "").strip()),
        ("launch", str(getattr(args, "launch_template", "") or "").strip()),
        ("config", str(getattr(args, "config_template", "") or "").strip()),
        ("component", str(getattr(args, "component_template", "") or "").strip()),
        ("uninstall", str(getattr(args, "uninstall_template", "") or "").strip()),
        ("test", str(getattr(args, "test_template", "") or "").strip()),
    ]

    command = str(getattr(args, "command", "") or "").strip().lower()
    command_template = str(getattr(args, "command_template", "") or "").strip()
    if command == "login":
        return _run_login_cli(command_template)

    from src.modules.deployment_mod import deployment_mod_cli_runner, deployment_mod_test_cli_runner

    for mode, template_path in cli_actions:
        if not template_path:
            continue
        logger.info("进入命令行模板模式", mode=mode, template_path=template_path)
        if mode == "test":
            return deployment_mod_test_cli_runner.run(template_path)
        return deployment_mod_cli_runner.run(template_path, mode=mode)

    if command:
        if not command_template:
            raise ValueError(f"命令 {command} 需要提供部署模板路径")
        logger.info("进入命令行模板模式", mode=command, template_path=command_template)
        if command == "test":
            return deployment_mod_test_cli_runner.run(command_template)
        return deployment_mod_cli_runner.run(command_template, mode=command)

    return None


def main(argv: list[str] | None = None) -> int:
    """主函数"""
    try:
        parser = _build_cli_parser()
        args = parser.parse_args(argv if argv is not None else sys.argv[1:])
        cli_result = _run_cli_mode(args)
        if cli_result is not None:
            return cli_result

        app = MaiMaiLauncher()
        app.run()
        return 0
    except Exception as e:
        print(f"启动失败：{str(e)}")
        logger.error("启动失败", error=str(e))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
