"""
麦麦启动器模块
负责启动和管理麦麦实例及其相关组件。
"""
import os
import subprocess
import time
import structlog
from typing import Dict, Any, Optional, List, Tuple

from ..ui.interface import ui
from ..utils.common import check_process, validate_path
from ..utils.version_detector import is_legacy_version

logger = structlog.get_logger(__name__)

# --- 内部辅助类 ---

class _ProcessManager:
    """
    内部进程管理器。
    负责在新CMD窗口中启动、跟踪和停止进程。
    """
    def __init__(self):
        self.running_processes: List[Dict[str, Any]] = []

    def start_in_new_cmd(self, command: str, cwd: str, title: str) -> Optional[subprocess.Popen]:
        """在新的CMD窗口中启动命令。"""
        try:
            cmd_command = f'start "{title}" cmd /k "chcp 65001 && cd /d "{cwd}" && {command}"'
            logger.info("在新CMD窗口启动进程", title=title, command=command, cwd=cwd)
            
            process = subprocess.Popen(cmd_command, shell=True, cwd=cwd)
            
            process_info = {
                "process": process,
                "title": title,
                "command": command,
                "cwd": cwd,
                "start_time": time.time()
            }
            self.running_processes.append(process_info)
            ui.print_success(f"组件 '{title}' 启动成功！")
            return process
        except Exception as e:
            ui.print_error(f"组件 '{title}' 启动失败: {e}")
            logger.error("进程启动失败", title=title, error=str(e))
            return None

    def stop_all(self):
        """停止所有由该管理器启动的进程。"""
        stopped_count = 0
        for info in self.running_processes:
            process = info["process"]
            if process.poll() is None:  # 如果进程仍在运行
                try:
                    process.terminate()
                    stopped_count += 1
                    logger.info("终止进程", pid=process.pid, title=info['title'])
                except Exception as e:
                    logger.warning("终止进程失败", pid=process.pid, title=info['title'], error=str(e))
        
        if stopped_count > 0:
            ui.print_info(f"已成功停止 {stopped_count} 个相关进程。")
        
        self.running_processes.clear()

    def get_running_processes_info(self) -> List[Dict]:
        """获取当前仍在运行的进程信息。"""
        active_processes = []
        # 过滤掉已经结束的进程
        self.running_processes = [p for p in self.running_processes if p["process"].poll() is None]
        for info in self.running_processes:
            info["running_time"] = time.time() - info["start_time"]
            active_processes.append(info)
        return active_processes


class _LaunchComponent:
    """
    可启动组件的基类。
    """
    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self.is_enabled = False

    def check_enabled(self):
        """检查该组件是否根据配置启用。"""
        raise NotImplementedError

    def get_launch_details(self) -> Optional[Tuple[str, str, str]]:
        """获取启动所需的命令、工作目录和窗口标题。"""
        raise NotImplementedError

    def start(self, process_manager: _ProcessManager) -> bool:
        """启动组件。"""
        if not self.is_enabled:
            ui.print_warning(f"组件 '{self.name}' 未启用或配置无效，跳过启动。")
            return False
        
        details = self.get_launch_details()
        if not details:
            ui.print_error(f"无法获取组件 '{self.name}' 的启动详情。")
            return False
            
        command, cwd, title = details
        return process_manager.start_in_new_cmd(command, cwd, title) is not None


# --- 具体组件实现 ---

class _MongoDbComponent(_LaunchComponent):
    """MongoDB组件。"""
    def __init__(self, config: Dict[str, Any]):
        super().__init__("MongoDB", config)
        self.check_enabled()

    def check_enabled(self):
        self.is_enabled = self.config.get("install_options", {}).get("install_mongodb", False)

    def get_launch_details(self) -> Optional[Tuple[str, str, str]]:
        # 不再需要启动详情，因为我们将检测系统服务
        return None

    def start(self, process_manager: _ProcessManager) -> bool:
        if not self.is_enabled:
            return True # 如果没配置，也算作"成功"
        
        # 检查系统服务中的MongoDB服务是否启动
        try:
            # 使用sc query命令检查MongoDB服务状态
            result = subprocess.run(["sc", "query", "MongoDB"], capture_output=True, text=True, timeout=10)
            
            if "RUNNING" in result.stdout:
                ui.print_info("MongoDB服务已经在运行。")
                logger.info("MongoDB服务已经在运行")
                return True
            elif "STOPPED" in result.stdout:
                ui.print_warning("MongoDB服务未启动。")
                ui.print_info("请前往系统服务管理页面手动启动MongoDB服务。")
                
                # 尝试打开系统服务管理程序
                services_lnk = r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Administrative Tools\services.lnk"
                if os.path.exists(services_lnk):
                    try:
                        os.startfile(services_lnk)
                        ui.print_success("已打开系统服务管理程序，请找到MongoDB服务并手动启动。")
                    except Exception as e:
                        ui.print_warning(f"无法自动打开系统服务管理程序: {e}")
                        ui.print_info("请手动打开'运行'对话框(win+R)，输入'services.msc'来打开系统服务管理程序。")
                else:
                    ui.print_info("请手动打开'运行'对话框(win+R)，输入'services.msc'来打开系统服务管理程序。")
                    ui.print_info("在服务列表中找到“MongoDB Server(MongoDB)”服务，右键点击并选择'启动'。")
                
                return False
            else:
                ui.print_warning("未找到MongoDB服务。")
                ui.print_info("请确认MongoDB是否已正确安装为系统服务。")
                return False
                
        except subprocess.TimeoutExpired:
            ui.print_error("检查MongoDB服务状态超时。")
            logger.error("检查MongoDB服务状态超时")
            return False
        except Exception as e:
            ui.print_error(f"检查MongoDB服务状态时发生错误: {e}")
            logger.error("检查MongoDB服务状态时发生错误", error=str(e))
            return False


class _NapCatComponent(_LaunchComponent):
    def __init__(self, config: Dict[str, Any]):
        super().__init__("NapCat", config)
        self.check_enabled()

    def check_enabled(self):
        self.is_enabled = self.config.get("install_options", {}).get("install_napcat", False)

    def get_launch_details(self) -> Optional[Tuple[str, str, str]]:
        napcat_path = self.config.get("napcat_path", "")
        if not (napcat_path and os.path.exists(napcat_path) and napcat_path.lower().endswith('.exe')):
            logger.error("NapCat路径无效", path=napcat_path)
            return None
        
        # 获取NapCat版本
        napcat_version = self.config.get("napcat_version", "")
        
        # 检查是否有QQ号配置
        qq_account = self.config.get("qq_account")
        
        # 根据NapCat版本确定启动命令
        if napcat_version == "NapCat.Shell":
            # NapCat.Shell版本的启动方式
            # 获取NapCat根目录
            napcat_dir = os.path.dirname(napcat_path)
            
            # 检测操作系统版本
            import platform
            is_win10 = platform.release() == "10"
            
            # 确定启动脚本名称
            if is_win10:
                preferred_script = "launcher-win10-user.bat"
                fallback_script = "launcher-win10.bat"
            else:
                preferred_script = "launcher-user.bat"
                fallback_script = "launcher.bat"
            
            # 检查首选脚本是否存在
            preferred_script_path = os.path.join(napcat_dir, preferred_script)
            if os.path.exists(preferred_script_path):
                command = f'"{preferred_script_path}"'
                if qq_account:
                    command += f" {qq_account}"
                cwd = napcat_dir
                title = f"NapCatQQ - {self.config.get('version_path', 'N/A')} (Shell)"
                return command, cwd, title
            
            # 检查备选脚本是否存在
            fallback_script_path = os.path.join(napcat_dir, fallback_script)
            if os.path.exists(fallback_script_path):
                command = f'"{fallback_script_path}"'
                if qq_account:
                    command += f" {qq_account}"
                cwd = napcat_dir
                title = f"NapCatQQ - {self.config.get('version_path', 'N/A')} (Shell)"
                return command, cwd, title
            
            # 如果都没有找到，返回None
            logger.error("未找到NapCat.Shell启动脚本", preferred=preferred_script_path, fallback=fallback_script_path)
            return None
        else:
            # 默认启动方式（OneKey版本）
            command = f'"{napcat_path}"'
            if qq_account:
                command += f" {qq_account}"
            cwd = os.path.dirname(napcat_path)
            title = f"NapCatQQ - {self.config.get('version_path', 'N/A')}"
            return command, cwd, title

    def start(self, process_manager: _ProcessManager) -> bool:
        if not self.is_enabled:
            return True
            
        if check_process("NapCatWinBootMain.exe"):
            ui.print_info("NapCat 已经在运行。")
            logger.info("NapCat已经在运行")
            return True
            
        # 获取NapCat版本
        napcat_version = self.config.get("napcat_version", "")
        
        # 如果是NapCat.Shell版本，需要特殊处理
        if napcat_version == "NapCat.Shell":
            napcat_path = self.config.get("napcat_path", "")
            napcat_dir = os.path.dirname(napcat_path)
            
            # 检测操作系统版本
            import platform
            is_win10 = platform.release() == "10"
            
            # 确定启动脚本名称
            if is_win10:
                preferred_script = "launcher-win10-user.bat"
                fallback_script = "launcher-win10.bat"
            else:
                preferred_script = "launcher-user.bat"
                fallback_script = "launcher.bat"
            
            # 尝试启动首选脚本
            ui.print_info("尝试启动 NapCat (Shell)...")
            preferred_script_path = os.path.join(napcat_dir, preferred_script)
            if os.path.exists(preferred_script_path):
                command = f'"{preferred_script_path}"'
                qq_account = self.config.get("qq_account")
                if qq_account:
                    command += f" {qq_account}"
                
                process = process_manager.start_in_new_cmd(command, napcat_dir, f"NapCatQQ - {self.config.get('version_path', 'N/A')} (Shell)")
                if process:
                    time.sleep(3)  # 等待NapCat启动
                    # 询问用户是否启动成功
                    ui.print_warning("NapCat可能启动失败，这应该不是您或我们的问题，我们可以换一种方式启动...")
                    if ui.confirm("您的NapCat启动成功了吗？"):
                        return True
                    else:
                        # 尝试启动备选脚本
                        ui.print_info("尝试使用备选启动脚本...")
                        fallback_script_path = os.path.join(napcat_dir, fallback_script)
                        if os.path.exists(fallback_script_path):
                            command = f'"{fallback_script_path}"'
                            if qq_account:
                                command += f" {qq_account}"
                            process = process_manager.start_in_new_cmd(command, napcat_dir, f"NapCatQQ - {self.config.get('version_path', 'N/A')} (Shell)")
                            if process:
                                time.sleep(3)  # 等待NapCat启动
                                return True
            else:
                # 首选脚本不存在，直接尝试备选脚本
                fallback_script_path = os.path.join(napcat_dir, fallback_script)
                if os.path.exists(fallback_script_path):
                    ui.print_info("尝试启动 NapCat (Shell)...")
                    command = f'"{fallback_script_path}"'
                    qq_account = self.config.get("qq_account")
                    if qq_account:
                        command += f" {qq_account}"
                    process = process_manager.start_in_new_cmd(command, napcat_dir, f"NapCatQQ - {self.config.get('version_path', 'N/A')} (Shell)")
                    if process:
                        time.sleep(3)  # 等待NapCat启动
                        return True
            return False
        else:
            # 默认启动方式（OneKey版本）
            ui.print_info("尝试启动 NapCat...")
            if super().start(process_manager):
                time.sleep(3)  # 等待NapCat启动
                return True
            return False


class _AdapterComponent(_LaunchComponent):
    def __init__(self, config: Dict[str, Any]):
        super().__init__("适配器", config)
        self.check_enabled()

    def check_enabled(self):
        opts = self.config.get("install_options", {})
        version = self.config.get("version_path", "")
        self.is_enabled = opts.get("install_adapter", False) and not is_legacy_version(version)

    def get_launch_details(self) -> Optional[Tuple[str, str, str]]:
        adapter_path = self.config.get("adapter_path", "")
        valid, _ = validate_path(adapter_path, check_file="main.py")
        if not valid:
            logger.error("适配器路径无效", path=adapter_path)
            return None
        
        python_cmd = MaiLauncher._get_python_command(self.config, adapter_path)
        command = f"{python_cmd} main.py"
        title = f"麦麦适配器 - {self.config.get('version_path', 'N/A')}"
        return command, adapter_path, title
    
    def start(self, process_manager: _ProcessManager) -> bool:
        if not self.is_enabled:
            return True
        ui.print_info("尝试启动适配器...")
        if super().start(process_manager):
            time.sleep(2) # 等待适配器启动
            return True
        return False


class _WebUIComponent(_LaunchComponent):
    def __init__(self, config: Dict[str, Any]):
        super().__init__("WebUI", config)
        self.check_enabled()

    def check_enabled(self):
        self.is_enabled = self.config.get("install_options", {}).get("install_webui", False)

    def start(self, process_manager: _ProcessManager) -> bool:
        if not self.is_enabled:
            return True
        
        ui.print_info("尝试启动 WebUI...")
        webui_path = self.config.get("webui_path", "")
        if not (webui_path and os.path.exists(webui_path)):
            ui.print_error("WebUI路径无效或不存在")
            return False

        version = self.config.get('version_path', 'N/A')
        
        # 1. 启动HTTP服务器
        http_server_dir = os.path.join(webui_path, "http_server")
        http_server_main = os.path.join(http_server_dir, "main.py")
        if not os.path.exists(http_server_main):
            ui.print_error("未找到 http_server/main.py，WebUI 启动失败")
            return False
        
        python_cmd_http = MaiLauncher._get_python_command(self.config, http_server_dir)
        if not process_manager.start_in_new_cmd(f"{python_cmd_http} main.py", http_server_dir, f"WebUI-HTTPServer - {version}"):
            return False

        # 2. 启动Adapter
        adapter_dir = os.path.join(webui_path, "adapter")
        adapter_main = os.path.join(adapter_dir, "maimai_http_adapter.py")
        if not os.path.exists(adapter_main):
            ui.print_error("未找到 adapter/maimai_http_adapter.py，WebUI 启动失败")
            return False
            
        python_cmd_adapter = MaiLauncher._get_python_command(self.config, adapter_dir)
        if not process_manager.start_in_new_cmd(f"{python_cmd_adapter} maimai_http_adapter.py", adapter_dir, f"WebUI-Adapter - {version}"):
            return False
            
        return True


class _MaiComponent(_LaunchComponent):
    def __init__(self, config: Dict[str, Any]):
        super().__init__("麦麦本体", config)
        self.is_enabled = True # 本体总是启用

    def get_launch_details(self) -> Optional[Tuple[str, str, str]]:
        # 根据bot_type字段选择正确的路径字段
        bot_type = self.config.get("bot_type", "MaiBot")  # 获取bot类型，默认为MaiBot
        if bot_type == "MoFox_bot":
            mai_path = self.config.get("mofox_path", "")
        else:
            mai_path = self.config.get("mai_path", "")
        
        version = self.config.get("version_path", "")
        
        if is_legacy_version(version):
            run_bat = os.path.join(mai_path, "run.bat")
            if not os.path.exists(run_bat):
                logger.error("旧版本麦麦缺少run.bat", path=run_bat)
                return None
            command = f'"{run_bat}"'
        else:
            python_cmd = MaiLauncher._get_python_command(self.config, mai_path)
            # 根据bot类型确定启动文件
            if bot_type == "MoFox_bot":
                start_file = "bot.py"
            else:
                start_file = "bot.py"
            command = f"{python_cmd} {start_file}"
            
        title = f"麦麦本体 - {version}"
        return command, mai_path, title
    
    def start(self, process_manager: _ProcessManager) -> bool:
        ui.print_info("尝试启动麦麦本体...")
        return super().start(process_manager)


# --- 主启动器类 ---

class MaiLauncher:
    """
    麦麦启动器。
    负责验证配置、展示菜单和协调各个组件的启动。
    """
    def __init__(self):
        self._process_manager = _ProcessManager()
        self._components: Dict[str, _LaunchComponent] = {}
        self._config: Optional[Dict[str, Any]] = None

    @staticmethod
    def _get_python_command(config: Dict[str, Any], cwd: str) -> str:
        """获取Python命令，优先使用虚拟环境。"""
        venv_path = config.get("venv_path", "")
        if venv_path and os.path.exists(venv_path):
            py_exe = os.path.join(venv_path, "Scripts" if os.name == 'nt' else "bin", "python.exe" if os.name == 'nt' else "python")
            if os.path.exists(py_exe):
                logger.info("使用虚拟环境Python", path=py_exe)
                return f'"{py_exe}"'
        
        # 检查工作目录下的常见虚拟环境
        for venv_dir in ["venv", ".venv", "env"]:
            py_exe = os.path.join(cwd, venv_dir, "Scripts" if os.name == 'nt' else "bin", "python.exe" if os.name == 'nt' else "python")
            if os.path.exists(py_exe):
                logger.info("使用项目内虚拟环境Python", path=py_exe)
                return f'"{py_exe}"'

        logger.info("使用系统Python")
        return "python"

    def _register_components(self, config: Dict[str, Any]):
        """根据配置注册所有可用的组件。"""
        self._config = config
        self._components = {
            "mongodb": _MongoDbComponent(config),
            "napcat": _NapCatComponent(config),
            "adapter": _AdapterComponent(config),
            "webui": _WebUIComponent(config),
            "mai": _MaiComponent(config),
        }

    def validate_configuration(self, config: Dict[str, Any]) -> list:
        """验证配置的有效性。"""
        errors = []
        
        # 根据bot_type字段选择正确的路径字段
        bot_type = config.get("bot_type", "MaiBot")  # 获取bot类型，默认为MaiBot
        if bot_type == "MoFox_bot":
            mai_path = config.get("mofox_path", "")
        else:
            mai_path = config.get("mai_path", "")
        
        valid, msg = validate_path(mai_path, check_file="bot.py")
        if not valid:
            errors.append(f"麦麦本体路径: {msg}")

        version = config.get("version_path", "")
        if is_legacy_version(version):
            valid, msg = validate_path(mai_path, check_file="run.bat")
            if not valid:
                errors.append(f"旧版麦麦本体路径缺少run.bat: {msg}")

        # 注册组件以进行后续检查
        self._register_components(config)

        if self._components['adapter'].is_enabled:
            adapter_path = config.get("adapter_path", "")
            valid, msg = validate_path(adapter_path, check_file="main.py")
            if not valid:
                errors.append(f"适配器路径: {msg}")

        if self._components['napcat'].is_enabled:
            napcat_path = config.get("napcat_path", "")
            if not (napcat_path and os.path.exists(napcat_path) and napcat_path.lower().endswith('.exe')):
                errors.append("NapCat路径: 无效或文件不存在。")
        
        return errors

    def show_launch_menu(self, config: Dict[str, Any]) -> bool:
        """根据bot类型显示不同的启动菜单并处理用户选择。"""
        self._register_components(config)
        bot_type = config.get("bot_type", "MaiBot")

        ui.clear_screen()
        ui.console.print("[🚀 启动选择菜单]", style=ui.colors["primary"])
        ui.console.print("="*50)
        ui.console.print(f"实例版本: {config.get('version_path', '未知')}")
        ui.console.print(f"实例昵称: {config.get('nickname_path', '未知')}")
        ui.console.print(f"Bot 类型: {bot_type}")
        ui.console.print("\n[可用组件]", style=ui.colors["info"])
        
        # 打印组件状态
        for comp in self._components.values():
            if comp.name != "麦麦本体":
                ui.console.print(f"  • {comp.name}: {'✅ 可用' if comp.is_enabled else '❌ 未配置'}")
        ui.console.print(f"  • 麦麦本体: ✅ 可用")

        # 根据 bot_type 定义菜单
        if bot_type == "MaiBot":
            menu_options = {
                "1": ("主程序+适配器", ["mai", "adapter"]),
                "2": ("主程序+适配器+NapCatQQ", ["mai", "adapter", "napcat"]),
                "3": ("主程序+适配器+检查MongoDB", ["mai", "adapter", "mongodb"]),
                "4": ("主程序+适配器+NapCatQQ+检查MongoDB", ["mai", "adapter", "napcat", "mongodb"]),
            }
        elif bot_type == "MoFox_bot":
            menu_options = {
                "1": ("主程序", ["mai"]),
                "2": ("主程序+适配器", ["mai", "adapter"]),
                "3": ("主程序+NapCatQQ", ["mai", "napcat"]),
                "4": ("主程序+适配器+NapCatQQ", ["mai", "adapter", "napcat"]),
            }
        else:
            # 默认或未知bot类型的菜单
            menu_options = {
                "1": ("仅启动主程序", ["mai"]),
            }

        ui.console.print("\n[预设启动项]", style=ui.colors["success"])
        for key, (text, _) in menu_options.items():
            ui.console.print(f" [{key}] {text}")
        
        ui.console.print(f" [H] 高级启动项", style=ui.colors["warning"])
        ui.console.print(f" [Q] 返回", style=ui.colors["exit"])

        while True:
            choice = ui.get_input("请选择启动方式: ").strip().upper()
            if choice == 'Q':
                return False
            if choice == 'H':
                return self._show_advanced_launch_menu()
            if choice in menu_options:
                # 检查所选选项中的组件是否都已启用
                _, components_to_start = menu_options[choice]
                all_enabled = True
                for comp_name in components_to_start:
                    if not self._components[comp_name].is_enabled:
                        ui.print_error(f"组件 '{self._components[comp_name].name}' 未配置或未启用，无法使用该启动项。")
                        all_enabled = False
                        break
                if all_enabled:
                    return self.launch(components_to_start)
            else:
                ui.print_error("无效选项，请重新选择。")

    def _show_advanced_launch_menu(self) -> bool:
        """显示高级启动菜单，支持多选。"""
        ui.clear_screen()
        ui.console.print("[🛠️ 高级启动项]", style=ui.colors["warning"])
        ui.console.print("="*50)
        ui.console.print("可多选，请使用英文逗号','分隔选项（例如: 1,3）")

        advanced_options = {
            "1": ("主程序", "mai"),
            "2": ("适配器", "adapter"),
            "3": ("NapCatQQ", "napcat"),
            "4": ("检查MongoDB", "mongodb"),
        }
        
        for key, (text, comp_name) in advanced_options.items():
            is_enabled = self._components[comp_name].is_enabled
            status = '✅ 可用' if is_enabled else '❌ 未配置'
            ui.console.print(f" [{key}] {text} - {status}")

        ui.console.print(f" [Q] 返回", style=ui.colors["exit"])

        while True:
            choices_str = ui.get_input("请选择要启动的组件: ").strip().upper()
            if choices_str == 'Q':
                return False

            choices = [c.strip() for c in choices_str.split(',')]
            components_to_start = []
            valid_choices = True

            for choice in choices:
                if choice in advanced_options:
                    _, comp_name = advanced_options[choice]
                    if self._components[comp_name].is_enabled:
                        components_to_start.append(comp_name)
                    else:
                        ui.print_error(f"组件 '{self._components[comp_name].name}' 未配置，无法启动。")
                        valid_choices = False
                        break
                else:
                    ui.print_error(f"无效选项 '{choice}'。")
                    valid_choices = False
                    break
            
            if valid_choices and components_to_start:
                return self.launch(list(dict.fromkeys(components_to_start))) # 去重并保持顺序
            elif valid_choices and not components_to_start:
                ui.print_warning("未选择任何有效组件。")

    def launch(self, components_to_start: List[str]) -> bool:
        """根据给定的组件列表启动。"""
        if not self._config:
            ui.print_error("配置未加载，无法启动。")
            return False

        # 确保MongoDB总是最先启动
        if self._components['mongodb'].is_enabled:
            if not self._components['mongodb'].start(self._process_manager):
                ui.print_warning("MongoDB启动失败，但将继续尝试启动其他组件。")
        
        # 处理全栈启动
        if "full_stack" in components_to_start:
            components_to_start = [name for name, comp in self._components.items() if comp.is_enabled and name != "mongodb"]

        # 按顺序启动组件
        launch_order = ["napcat", "webui", "adapter", "mai"]
        final_success = True
        
        for comp_name in launch_order:
            if comp_name in components_to_start:
                if not self._components[comp_name].start(self._process_manager):
                    # 麦麦本体是核心，如果它失败了，整个启动就算失败
                    if comp_name == "mai":
                        final_success = False
                        break
        
        if final_success:
            ui.print_success("🎉 启动流程完成！")
        else:
            ui.print_error("核心组件'麦麦本体'启动失败，请检查日志。")

        return final_success

    def stop_all_processes(self):
        """停止所有由启动器启动的进程。"""
        ui.print_info("正在停止所有相关进程...")
        self._process_manager.stop_all()

    def show_running_processes(self):
        """显示当前正在运行的进程状态。"""
        active_processes = self._process_manager.get_running_processes_info()
        
        if not active_processes:
            ui.print_info("当前没有由本启动器启动的正在运行的进程。")
            return
        
        ui.console.print("\n[📊 正在运行的进程]", style=ui.colors["primary"])
        for info in active_processes:
            running_time = int(info["running_time"])
            ui.console.print(
                f"• {info['title']} - 运行时间: {running_time}秒",
                style=ui.colors["success"]
            )
            ui.console.print(f"  路径: {info['cwd']}", style="dim")
            ui.console.print(f"  命令: {info['command']}", style="dim")


# 全局启动器实例
launcher = MaiLauncher()
