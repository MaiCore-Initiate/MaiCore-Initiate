"""
麦麦启动器主程序
重构版本，使用结构化日志和模块化设计
"""
import sys
import os
import time
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

# 设置日志
setup_logging()
logger = get_logger(__name__)


class MaiMaiLauncher:
    """麦麦启动器主程序类"""
    
    def __init__(self):
        self.running = True
        setup_console()
        logger.info("麦麦启动器已启动")
    
    def handle_launch_mai(self):
        """处理启动麦麦"""
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
            logger.error("启动麦麦异常", error=str(e))
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
                # 自动检索麦麦
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
            
            
            choice = ui.get_choice("请选择操作", ["A", "B", "C", "D", "E", "F", "G", "Q"])
            
            if choice == "Q":
                break
            elif choice in ["A", "B", "D", "G"]:
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
            elif choice == "G":
                # 打开配置文件
                config = config_mgr.select_configuration()
                if config:
                    config_mgr.open_config_files(config)
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
        ui.console.print("===关于本程序===", style=ui.colors["primary"])
        ui.console.print("麦麦启动器控制台 - 重构版", style=ui.colors["primary"])
        ui.console.print("=================")
        
        ui.console.print("版本：V4.0.0-重构版", style=ui.colors["info"])
        ui.console.print("重构特性：", style=ui.colors["success"])
        ui.console.print("  • 模块化设计", style="white")
        ui.console.print("  • 结构化日志（structlog）", style="white")
        ui.console.print("  • 丰富的UI界面（rich）", style="white")
        ui.console.print("  • 改进的错误处理", style="white")
        ui.console.print("  • 更好的代码组织", style="white")
        
        ui.console.print("\n技术栈：", style=ui.colors["info"])
        ui.console.print("  • Python 3.12.8", style="white")
        ui.console.print("  • structlog - 结构化日志", style="white")
        ui.console.print("  • rich - 终端UI", style="white")
        ui.console.print("  • toml - 配置管理", style="white")        
        
        ui.console.print("\n开源许可：Apache License 2.0", style=ui.colors["secondary"])
        ui.console.print("GitHub：https://github.com/xiaoCZX/MaiMbot-initiate", style="#46AEF8")
        ui.console.print("你喜欢的话，请给个Star支持一下哦~", style="white")
        ui.console.print("欢迎加入我们的社区！（我们的QQ群聊：1025509724）", style="white")

        ui.console.print("\n感谢以下为此项目做出贡献的开发者：", style=ui.colors["header"])
        ui.console.print("  • 小城之雪 - 整个项目的提出者和主要开发者", style="white")
        ui.console.print("  • 一闪 - 为此项目的重构提供了大量支持，以及webui安装支持", style="white")
        ui.console.print("  • 其他贡献者", style="white")

        ui.pause()

    def handle_process_status(self):
        """处理进程状态查看，支持自动刷新和交互式命令。"""
        import msvcrt
        from rich.live import Live
        from rich.panel import Panel
        from rich.text import Text
        from rich.layout import Layout
        from rich.table import Table

        while True:
            input_buffer = ""
            last_refresh = 0
            process_table = Table()
            status_message = Text()
            message_timestamp = 0
            
            COMMANDS = ["stop", "restart", "details", "stopall", "quit", "q"]
            command_result = None

            try:
                with Live(auto_refresh=False, screen=True, transient=True) as live:
                    should_exit_live = False
                    while not should_exit_live:
                        now = time.time()
                        input_changed = False

                        while msvcrt.kbhit():
                            char = msvcrt.getwch()
                            if char in ('\r', '\n'):
                                command_to_run = input_buffer.strip()
                                input_buffer = ""
                                command_result = self._handle_process_command(command_to_run)
                                if command_result:
                                    should_exit_live = True
                                    break
                            elif char == '\x08':
                                input_buffer = input_buffer[:-1]
                            else:
                                input_buffer += char
                            input_changed = True
                        
                        if should_exit_live: continue

                        data_changed = False
                        if now - last_refresh > 2:
                            process_table = launcher.show_running_processes()
                            last_refresh = now
                            data_changed = True
                        
                        if isinstance(command_result, tuple) and command_result[0] == "message":
                            status_message = Text(command_result[1], style=command_result[2])
                            message_timestamp = now
                            command_result = None
                        
                        if status_message.plain and now - message_timestamp > 3:
                            status_message = Text()
                            data_changed = True

                        if input_changed or data_changed:
                            command_table = Table.grid(padding=(0, 1)); command_table.add_column(style="bold yellow", width=15); command_table.add_column()
                            command_table.add_row("stop <PID>", "终止指定PID的进程"); command_table.add_row("restart <PID>", "重启指定PID的进程")
                            command_table.add_row("details <PID>", "查看指定PID的进程详情"); command_table.add_row("stopall", "终止所有受管进程")
                            command_table.add_row("q / quit", "退出状态监控")
                            
                            suggestion = next((cmd for cmd in COMMANDS if cmd.startswith(input_buffer.lower()) and cmd != input_buffer.lower()), "")
                            input_text = Text(f"> {input_buffer}", no_wrap=True)
                            if suggestion: input_text.append(suggestion[len(input_buffer):], style="dim")

                            input_layout = Layout(Panel(input_text, border_style="cyan", title="输入命令", height=3), name="input")
                            status_layout = Layout(Panel(status_message, border_style="dim", title="状态", height=3), name="status")
                            footer = Layout(); footer.split_row(input_layout, status_layout)

                            layout = Layout(); layout.split_column(Panel(command_table, title="[bold]可用命令[/bold]", border_style="dim"), process_table, footer)
                            live.update(layout); live.refresh()

                        time.sleep(0.05)

            except KeyboardInterrupt:
                break

            if isinstance(command_result, dict):
                self._show_process_details(command_result)
                command_result = None  # 重置command_result
                continue
            elif command_result == "quit":
                break
            
        ui.print_info("\n已退出进程状态监控。")
        logger.info("用户退出进程状态监控")
        ui.pause()

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

    def run(self):
        """运行主程序"""
        try:
            logger.info("启动器主循环开始")
            
            while self.running:
                ui.show_main_menu()
                choice = ui.get_input("请输入选项").upper()
                
                logger.debug("用户选择", choice=choice)
                
                if choice == "Q":
                    self.running = False
                    ui.print_info("感谢使用麦麦启动器！")
                    logger.info("用户退出程序")
                elif choice == "A":
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
                    self.handle_about_menu()
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
            # 停止所有进程
            launcher.stop_all_processes()
            logger.info("启动器程序结束")


def main():
    """主函数"""
    try:
        app = MaiMaiLauncher()
        app.run()
    except Exception as e:
        print(f"启动失败：{str(e)}")
        logger.error("启动失败", error=str(e))


if __name__ == "__main__":
    main()
