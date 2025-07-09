"""
麦麦启动器模块
负责启动和管理麦麦实例
"""
import os
import subprocess
import time
import structlog
from typing import Dict, Any, Optional, List
from ..utils.common import check_process, is_legacy_version, validate_path
from ..ui.interface import ui

logger = structlog.get_logger(__name__)


class MaiLauncher:
    """麦麦启动器类"""
    
    def __init__(self):
        self.running_processes = []
        self.process_info = []  # 存储进程信息，包括名称和窗口句柄
    
    def start_in_new_cmd(self, command: str, cwd: str, title: str) -> Optional[subprocess.Popen]:
        """
        在新的CMD窗口中启动命令
        
        Args:
            command: 要执行的命令
            cwd: 工作目录
            title: 窗口标题
            
        Returns:
            进程对象或None
        """
        try:
            # 构建在新CMD窗口中运行的命令，设置UTF-8编码
            cmd_command = f'start "{title}" cmd /k "chcp 65001 && cd /d "{cwd}" && {command}"'
            
            logger.info("在新CMD窗口启动进程", title=title, command=command, cwd=cwd)
            
            process = subprocess.Popen(
                cmd_command,
                shell=True,
                cwd=cwd
            )
            
            # 记录进程信息
            process_info = {
                "process": process,
                "title": title,
                "command": command,
                "cwd": cwd,
                "start_time": time.time()
            }
            
            self.running_processes.append(process)
            self.process_info.append(process_info)
            
            ui.print_success(f"{title} 在新窗口中启动成功！")
            logger.info("进程启动成功", title=title)
            
            return process
            
        except Exception as e:
            ui.print_error(f"{title} 启动失败：{str(e)}")
            logger.error("进程启动失败", title=title, error=str(e))
            return None
    
    def _get_python_command(self, config: Dict[str, Any], work_dir: str) -> str:
        """
        获取Python命令，优先使用虚拟环境
        
        Args:
            config: 配置字典
            work_dir: 工作目录
            
        Returns:
            Python命令
        """
        try:
            # 检查是否有虚拟环境
            venv_paths = [
                os.path.join(work_dir, "venv", "Scripts", "python.exe"),
                os.path.join(work_dir, ".venv", "Scripts", "python.exe"),
                os.path.join(work_dir, "env", "Scripts", "python.exe")
            ]
            
            for venv_path in venv_paths:
                if os.path.exists(venv_path):
                    ui.print_info(f"检测到虚拟环境：{venv_path}")
                    logger.info("使用虚拟环境Python", venv_path=venv_path)
                    return f'"{venv_path}"'
            
            # 没有虚拟环境，使用系统Python
            ui.print_info("未检测到虚拟环境，使用系统Python")
            logger.info("使用系统Python")
            return "python"
            
        except Exception as e:
            ui.print_warning(f"检测Python环境失败：{str(e)}")
            logger.warning("检测Python环境失败", error=str(e))
            return "python"
    
    def _ensure_mongodb_running(self, config: Dict[str, Any]) -> bool:
        """
        确保MongoDB运行（如果配置了）
        
        Args:
            config: 配置字典
            
        Returns:
            是否成功启动或已运行
        """
        try:
            install_options = config.get("install_options", {})
            
            # 如果配置了MongoDB，确保其运行
            if install_options.get("install_mongodb", False):
                ui.print_info("检查MongoDB状态...")
                if self._start_mongodb(config):
                    ui.print_success("MongoDB准备就绪")
                    return True
                else:
                    ui.print_warning("MongoDB启动失败，但将继续启动其他组件")
                    return False
            else:
                ui.print_info("MongoDB未配置，跳过检查")
                return True
                
        except Exception as e:
            ui.print_warning(f"MongoDB检查失败：{str(e)}")
            logger.warning("MongoDB检查失败", error=str(e))
            return False
    
    def start_executable_in_new_cmd(self, exe_path: str, args: List[str] = None, title: str = "") -> Optional[subprocess.Popen]:
        """
        在新的CMD窗口中启动可执行文件
        
        Args:
            exe_path: 可执行文件路径
            args: 命令行参数列表
            title: 窗口标题
            
        Returns:
            进程对象或None
        """
        try:
            if not title:
                title = os.path.basename(exe_path)
            
            # 构建命令
            command_parts = [f'"{exe_path}"']
            if args:
                command_parts.extend(args)
            command = ' '.join(command_parts)
            
            # 获取可执行文件所在目录
            cwd = os.path.dirname(exe_path)
            
            return self.start_in_new_cmd(command, cwd, title)
            
        except Exception as e:
            ui.print_error(f"{title} 启动失败：{str(e)}")
            logger.error("可执行文件启动失败", exe_path=exe_path, error=str(e))
            return None
    
    def validate_configuration(self, config: Dict[str, Any]) -> list:
        """
        验证配置有效性
        
        Args:
            config: 配置字典
            
        Returns:
            错误列表
        """
        errors = []
        
        # 检查麦麦本体
        mai_path = config.get("mai_path", "")
        valid, msg = validate_path(mai_path, check_file="bot.py")
        if not valid:
            errors.append(f"麦麦本体路径：{msg}")
        
        # 获取安装选项
        install_options = config.get("install_options", {})
        version = config.get("version_path", "")
        
        # 检查适配器（仅新版本且选择安装时需要）
        if not is_legacy_version(version) and install_options.get("install_adapter", False):
            adapter_path = config.get("adapter_path", "")
            if adapter_path and adapter_path not in ["当前配置集的对象实例版本较低，无适配器", "跳过适配器安装"]:
                valid, msg = validate_path(adapter_path, check_file="main.py")
                if not valid:
                    errors.append(f"适配器路径：{msg}")
            elif not adapter_path:
                errors.append("适配器路径：路径未配置")
        elif is_legacy_version(version):
            # 旧版本需要检查run.bat文件
            valid, msg = validate_path(mai_path, check_file="run.bat")
            if not valid:
                errors.append(f"麦麦本体路径缺少run.bat文件：{msg}")
        
        # 检查NapCat路径（如果选择安装）
        if install_options.get("install_napcat", False):
            napcat_path = config.get("napcat_path", "")
            if napcat_path:
                if not os.path.exists(napcat_path):
                    errors.append("NapCatQQ路径：文件不存在")
                elif not napcat_path.lower().endswith('.exe'):
                    errors.append("NapCatQQ路径：不是可执行文件")
        
        return errors
    
    def _get_python_command(self, config: Dict[str, Any], cwd: str) -> str:
        """
        获取Python命令，优先使用虚拟环境
        
        Args:
            config: 配置字典
            cwd: 工作目录
            
        Returns:
            Python命令字符串
        """
        venv_path = config.get("venv_path", "")
        
        # 如果有虚拟环境，使用虚拟环境的Python
        if venv_path and os.path.exists(venv_path):
            if os.name == 'nt':  # Windows
                python_exe = os.path.join(venv_path, "Scripts", "python.exe")
            else:  # Linux/Mac
                python_exe = os.path.join(venv_path, "bin", "python")
            
            if os.path.exists(python_exe):
                ui.print_info(f"使用虚拟环境Python: {python_exe}")
                return f'"{python_exe}"'
        
        # 如果没有虚拟环境或虚拟环境不存在，使用系统Python
        ui.print_info("使用系统Python")
        return "python"
    
    def _ensure_mongodb_running(self, config: Dict[str, Any]) -> bool:
        """
        确保MongoDB正在运行（如果配置了MongoDB）
        
        Args:
            config: 配置字典
            
        Returns:
            是否成功启动或已经在运行
        """
        install_options = config.get("install_options", {})
        
        # 如果没有安装MongoDB，跳过
        if not install_options.get("install_mongodb", False):
            return True
        
        ui.print_info("检查MongoDB状态...")
        
        # 检查MongoDB是否已在运行
        mongodb_running = check_process("mongod.exe")
        if mongodb_running:
            ui.print_info("MongoDB已经在运行")
            return True
        
        # 尝试启动MongoDB
        ui.print_info("启动MongoDB...")
        return self._start_mongodb(config)
    
    def show_launch_menu(self, config: Dict[str, Any]) -> bool:
        """
        显示启动选择菜单
        
        Args:
            config: 配置字典
            
        Returns:
            是否成功选择启动
        """
        ui.clear_screen()
        ui.console.print("[🚀 启动选择菜单]", style=ui.colors["primary"])
        ui.console.print("="*50)
        
        # 获取配置信息
        version = config.get("version_path", "")
        install_options = config.get("install_options", {})
        
        # 显示配置信息
        ui.console.print(f"实例版本：{version}")
        ui.console.print(f"实例昵称：{config.get('nickname_path', '未知')}")
        ui.console.print()
        
        # 显示可用组件
        ui.console.print("[可用组件]", style=ui.colors["info"])
        ui.console.print(f"  • 麦麦本体：✅ 可用")
        ui.console.print(f"  • 适配器：{'✅ 可用' if install_options.get('install_adapter', False) else '❌ 未安装'}")
        ui.console.print(f"  • NapCat：{'✅ 可用' if install_options.get('install_napcat', False) else '❌ 未安装'}")
        ui.console.print(f"  • MongoDB：{'✅ 可用' if install_options.get('install_mongodb', False) else '❌ 未安装'}")
        ui.console.print(f"  • WebUI：{'✅ 可用' if install_options.get('install_webui', False) else '❌ 未安装'}")
        ui.console.print()
        
        # 显示启动选项
        ui.console.print("[启动选项]", style=ui.colors["success"])
        ui.console.print(" [1] 仅启动麦麦本体")
        
        if install_options.get('install_adapter', False):
            ui.console.print(" [2] 启动麦麦 + 适配器")
        
        if install_options.get('install_napcat', False):
            ui.console.print(" [3] 启动麦麦 + 适配器 + NapCat")
        
        if install_options.get('install_webui', False):
            ui.console.print(" [4] 启动麦麦 + WebUI")
        
        if install_options.get('install_mongodb', False):
            ui.console.print(" [5] 启动麦麦 + MongoDB")
        
        # 全栈启动（如果多个组件可用）
        available_components = sum([
            install_options.get('install_adapter', False),
            install_options.get('install_napcat', False),
            install_options.get('install_mongodb', False),
            install_options.get('install_webui', False)
        ])
        
        if available_components >= 2:
            ui.console.print(" [6] 全栈启动（所有已安装组件）")
        
        ui.console.print(" [Q] 返回上级菜单", style="#7E1DE4")
        
        while True:
            choice = ui.get_input("请选择启动方式：").strip().upper()
            
            if choice == 'Q':
                return False
            elif choice == '1':
                return self.launch_mai_only(config)
            elif choice == '2' and install_options.get('install_adapter', False):
                return self.launch_mai_with_adapter(config)
            elif choice == '3' and install_options.get('install_napcat', False):
                return self.launch_mai_with_napcat(config)
            elif choice == '4' and install_options.get('install_webui', False):
                return self.launch_mai_with_webui(config)
            elif choice == '5' and install_options.get('install_mongodb', False):
                return self.launch_mai_with_mongodb(config)
            elif choice == '6' and available_components >= 2:
                return self.launch_full_stack(config)
            else:
                ui.print_error("无效选项或该组件未安装，请重新选择")
    
    def launch_mai_only(self, config: Dict[str, Any]) -> bool:
        """
        仅启动麦麦本体
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            ui.print_info("🚀 启动模式：仅麦麦本体")
            version = config.get("version_path", "")
            mai_path = config.get("mai_path", "")
            
            # 首先确保MongoDB运行（如果配置了）
            self._ensure_mongodb_running(config)
            
            if is_legacy_version(version):
                # 旧版本启动逻辑：直接运行run.bat
                logger.info("检测到旧版本，使用兼容启动模式", version=version)
                
                run_bat_path = os.path.join(mai_path, "run.bat")
                if os.path.exists(run_bat_path):
                    process = self.start_in_new_cmd(
                        f'"{run_bat_path}"',
                        mai_path,
                        f"麦麦本体 - {version}"
                    )
                    if process:
                        ui.print_success("麦麦启动成功！")
                        logger.info("旧版本麦麦启动成功", path=run_bat_path)
                        return True
                    else:
                        return False
                else:
                    ui.print_error("未找到run.bat文件")
                    logger.error("run.bat文件不存在", path=run_bat_path)
                    return False
            else:
                # 新版本启动逻辑：使用虚拟环境启动麦麦本体
                logger.info("检测到新版本，启动麦麦本体", version=version)
                
                # 获取Python命令（优先使用虚拟环境）
                python_cmd = self._get_python_command(config, mai_path)
                
                # 启动麦麦本体
                mai_process = self.start_in_new_cmd(
                    f"{python_cmd} bot.py",
                    mai_path,
                    f"麦麦本体 - {version}"
                )
                if mai_process:
                    ui.print_success("麦麦启动成功！")
                    logger.info("麦麦本体启动成功", path=mai_path)
                    return True
                else:
                    return False
                
        except Exception as e:
            ui.print_error(f"启动失败：{str(e)}")
            logger.error("启动麦麦失败", error=str(e), config=config)
            return False
    
    def launch_mai_with_adapter(self, config: Dict[str, Any]) -> bool:
        """
        启动麦麦 + 适配器
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            ui.print_info("🚀 启动模式：麦麦本体 + 适配器")
            version = config.get("version_path", "")
            mai_path = config.get("mai_path", "")
            adapter_path = config.get("adapter_path", "")
            
            # 首先确保MongoDB运行（如果配置了）
            self._ensure_mongodb_running(config)
            
            if is_legacy_version(version):
                ui.print_warning("旧版本无需适配器，将仅启动麦麦本体")
                return self.launch_mai_only(config)
            
            # 获取Python命令（优先使用虚拟环境）
            python_cmd = self._get_python_command(config, mai_path)
            
            # 启动适配器
            if (adapter_path and 
                adapter_path not in ["当前配置集的对象实例版本较低，无适配器", "跳过适配器安装"]):
                adapter_process = self.start_in_new_cmd(
                    f"{python_cmd} main.py",
                    adapter_path,
                    f"麦麦适配器 - {version}"
                )
                if adapter_process:
                    ui.print_success("适配器启动成功！")
                    logger.info("适配器启动成功", path=adapter_path)
                    time.sleep(2)  # 等待适配器启动
                else:
                    ui.print_error("适配器启动失败")
                    return False
            else:
                ui.print_error("适配器路径无效")
                return False
            
            # 启动麦麦本体
            mai_process = self.start_in_new_cmd(
                f"{python_cmd} bot.py",
                mai_path,
                f"麦麦本体 - {version}"
            )
            if mai_process:
                ui.print_success("麦麦启动成功！")
                logger.info("麦麦本体启动成功", path=mai_path)
                return True
            else:
                return False
                
        except Exception as e:
            ui.print_error(f"启动失败：{str(e)}")
            logger.error("启动麦麦+适配器失败", error=str(e), config=config)
            return False
    
    def launch_mai_with_napcat(self, config: Dict[str, Any]) -> bool:
        """
        启动麦麦 + 适配器 + NapCat
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            ui.print_info("🚀 启动模式：麦麦 + 适配器 + NapCat")
            version = config.get("version_path", "")
            
            # 首先确保MongoDB运行（如果配置了）
            self._ensure_mongodb_running(config)
            
            # 先启动NapCat
            napcat_running = check_process("NapCatWinBootMain.exe")
            if not napcat_running:
                napcat_path = config.get("napcat_path", "")
                if napcat_path and os.path.exists(napcat_path):
                    napcat_process = self.start_executable_in_new_cmd(
                        napcat_path,
                        title=f"NapCatQQ - {version}"
                    )
                    if napcat_process:
                        ui.print_success("NapCat启动成功！")
                        logger.info("NapCat启动成功", path=napcat_path)
                        time.sleep(3)  # 等待NapCat启动
                    else:
                        ui.print_error("NapCat启动失败")
                        return False
                else:
                    ui.print_error("NapCat路径无效或文件不存在")
                    return False
            else:
                ui.print_info("NapCat已经在运行")
                logger.info("NapCat已经在运行")
            
            # 启动麦麦和适配器
            return self.launch_mai_with_adapter(config)
            
        except Exception as e:
            ui.print_error(f"启动失败：{str(e)}")
            logger.error("启动麦麦+NapCat失败", error=str(e), config=config)
            return False
    
    def launch_mai_with_webui(self, config: Dict[str, Any]) -> bool:
        """
        启动麦麦 + WebUI
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            ui.print_info("🚀 启动模式：麦麦 + WebUI")
            version = config.get("version_path", "")
            webui_path = config.get("webui_path", "")

            # 首先确保MongoDB运行（如果配置了）
            self._ensure_mongodb_running(config)

            # 启动WebUI
            if webui_path and os.path.exists(webui_path):
                # 启动 http_server/main.py
                http_server_path = os.path.join(webui_path, "http_server", "main.py")
                if os.path.exists(http_server_path):
                    python_cmd_http = self._get_python_command(config, os.path.dirname(http_server_path))
                    http_server_process = self.start_in_new_cmd(
                        f"{python_cmd_http} main.py",
                        os.path.dirname(http_server_path),
                        f"WebUI-HTTPServer - {version}"
                    )
                    if http_server_process:
                        ui.print_success("WebUI HTTP Server 启动成功！")
                        logger.info("WebUI HTTP Server 启动成功", path=http_server_path)
                    else:
                        ui.print_error("WebUI HTTP Server 启动失败")
                        return False
                else:
                    ui.print_error("未找到 http_server/main.py，WebUI 启动失败")
                    return False
            else:
                ui.print_error("WebUI路径无效或不存在")
                return False

            # 只启动 adapter/maimai_http_adapter.py
            adapter_path = os.path.join(webui_path, "adapter", "maimai_http_adapter.py")
            if os.path.exists(adapter_path):
                python_cmd_adapter = self._get_python_command(config, os.path.dirname(adapter_path))
                adapter_process = self.start_in_new_cmd(
                    f"{python_cmd_adapter} maimai_http_adapter.py",
                    os.path.dirname(adapter_path),
                    f"WebUI-Adapter - {version}"
                )
                if adapter_process:
                    ui.print_success("WebUI Adapter 启动成功！")
                    logger.info("WebUI Adapter 启动成功", path=adapter_path)
                else:
                    ui.print_error("WebUI Adapter 启动失败")
                    return False
            else:
                ui.print_error("未找到 adapter/maimai_http_adapter.py，WebUI 启动失败")
                return False

            return self.launch_mai_only(config)
        except Exception as e:
            ui.print_error(f"启动失败：{str(e)}")
            logger.error("启动麦麦+WebUI失败", error=str(e), config=config)
            return False
    
    def launch_mai_with_mongodb(self, config: Dict[str, Any]) -> bool:
        """
        启动麦麦 + MongoDB
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            ui.print_info("🚀 启动模式：麦麦 + MongoDB")
            version = config.get("version_path", "")
            
            # 启动MongoDB
            if not self._start_mongodb(config):
                ui.print_error("MongoDB启动失败")
                return False
            
            # 启动麦麦本体
            return self.launch_mai_only(config)
            
        except Exception as e:
            ui.print_error(f"启动失败：{str(e)}")
            logger.error("启动麦麦+MongoDB失败", error=str(e), config=config)
            return False
    
    def _start_mongodb(self, config: Dict[str, Any]) -> bool:
        """
        启动MongoDB的内部方法
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            version = config.get("version_path", "")
            mongodb_running = check_process("mongod.exe")
            
            if not mongodb_running:
                mongodb_path = config.get("mongodb_path", "")
                if mongodb_path and os.path.exists(mongodb_path):
                    # 查找mongod.exe
                    mongod_exe = None
                    for root, dirs, files in os.walk(mongodb_path):
                        if "mongod.exe" in files:
                            mongod_exe = os.path.join(root, "mongod.exe")
                            break
                    
                    if mongod_exe:
                        # 创建数据目录
                        data_dir = os.path.join(mongodb_path, "data")
                        os.makedirs(data_dir, exist_ok=True)
                        
                        # 启动MongoDB
                        mongodb_process = self.start_in_new_cmd(
                            f'"{mongod_exe}" --dbpath "{data_dir}"',
                            mongodb_path,
                            f"MongoDB - {version}"
                        )
                        if mongodb_process:
                            ui.print_success("MongoDB启动成功！")
                            logger.info("MongoDB启动成功", path=mongod_exe)
                            time.sleep(2)  # 等待MongoDB启动
                            return True
                        else:
                            return False
                    else:
                        ui.print_warning("在MongoDB路径中未找到mongod.exe")
                        return False
                else:
                    # 尝试启动系统服务
                    try:
                        ui.print_info("尝试启动MongoDB系统服务...")
                        result = subprocess.run(
                            ["net", "start", "MongoDB"], 
                            check=True, 
                            shell=True,
                            capture_output=True,
                            text=True
                        )
                        ui.print_success("MongoDB服务启动成功！")
                        logger.info("MongoDB服务启动成功")
                        return True
                    except subprocess.CalledProcessError as e:
                        ui.print_warning("MongoDB服务启动失败，请检查是否已安装MongoDB服务")
                        logger.warning("MongoDB服务启动失败", error=str(e))
                        return False
            else:
                ui.print_info("MongoDB已经在运行")
                logger.info("MongoDB已经在运行")
                return True
                
        except Exception as e:
            ui.print_error(f"MongoDB启动失败：{str(e)}")
            logger.error("MongoDB启动失败", error=str(e))
            return False
    
    def launch_full_stack(self, config: Dict[str, Any]) -> bool:
        """
        启动完整技术栈（所有已安装的组件）
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            ui.print_info("🚀 启动模式：全栈启动（所有已安装组件）")
            version = config.get("version_path", "")
            install_options = config.get("install_options", {})
            
            success_count = 0
            total_count = 0
            
            # 启动MongoDB（如果安装）
            if install_options.get("install_mongodb", False):
                total_count += 1
                ui.print_info("启动MongoDB...")
                if self._start_mongodb(config):
                    success_count += 1
                else:
                    ui.print_warning("MongoDB启动失败，但继续启动其他组件")
            
            # 启动NapCat（如果安装）
            if install_options.get("install_napcat", False):
                total_count += 1
                ui.print_info("启动NapCat...")
                napcat_running = check_process("NapCatWinBootMain.exe")
                if not napcat_running:
                    napcat_path = config.get("napcat_path", "")
                    if napcat_path and os.path.exists(napcat_path):
                        napcat_process = self.start_executable_in_new_cmd(
                            napcat_path,
                            title=f"NapCatQQ - {version}"
                        )
                        if napcat_process:
                            ui.print_success("NapCat启动成功！")
                            logger.info("NapCat启动成功", path=napcat_path)
                            time.sleep(3)  # 等待NapCat启动
                            success_count += 1
                        else:
                            ui.print_warning("NapCat启动失败")
                    else:
                        ui.print_warning("NapCat路径无效，跳过启动")
                else:
                    ui.print_info("NapCat已经在运行")
                    success_count += 1
            
            # 启动WebUI（如果安装）
            if install_options.get("install_webui", False):
                total_count += 1
                ui.print_info("启动WebUI...")
                webui_path = config.get("webui_path", "")
                if webui_path and os.path.exists(webui_path):
                    # 检查是否有package.json（Node.js项目）
                    package_json = os.path.join(webui_path, "package.json")
                    if os.path.exists(package_json):
                        webui_process = self.start_in_new_cmd(
                            "npm start",
                            webui_path,
                            f"WebUI - {version}"
                        )
                    else:
                        # 尝试Python方式启动
                        python_cmd = self._get_python_command(config, webui_path)
                        webui_process = self.start_in_new_cmd(
                            f"{python_cmd} app.py",
                            webui_path,
                            f"WebUI - {version}"
                        )
                    
                    if webui_process:
                        ui.print_success("WebUI启动成功！")
                        logger.info("WebUI启动成功", path=webui_path)
                        time.sleep(2)  # 等待WebUI启动
                        success_count += 1
                    else:
                        ui.print_warning("WebUI启动失败")
                else:
                    ui.print_warning("WebUI路径无效，跳过启动")
            
            # 启动适配器（如果安装且不是旧版本）
            if install_options.get("install_adapter", False) and not is_legacy_version(version):
                total_count += 1
                ui.print_info("启动适配器...")
                adapter_path = config.get("adapter_path", "")
                if (adapter_path and 
                    adapter_path not in ["当前配置集的对象实例版本较低，无适配器", "跳过适配器安装"]):
                    python_cmd = self._get_python_command(config, adapter_path)
                    adapter_process = self.start_in_new_cmd(
                        f"{python_cmd} main.py",
                        adapter_path,
                        f"麦麦适配器 - {version}"
                    )
                    if adapter_process:
                        ui.print_success("适配器启动成功！")
                        logger.info("适配器启动成功", path=adapter_path)
                        time.sleep(2)  # 等待适配器启动
                        success_count += 1
                    else:
                        ui.print_warning("适配器启动失败")
                else:
                    ui.print_warning("适配器路径无效，跳过启动")
            
            # 最后启动麦麦本体（必须成功）
            total_count += 1
            ui.print_info("启动麦麦本体...")
            mai_path = config.get("mai_path", "")
            
            if is_legacy_version(version):
                # 旧版本启动逻辑
                run_bat_path = os.path.join(mai_path, "run.bat")
                if os.path.exists(run_bat_path):
                    mai_process = self.start_in_new_cmd(
                        f'"{run_bat_path}"',
                        mai_path,
                        f"麦麦本体 - {version}"
                    )
                    if mai_process:
                        ui.print_success("麦麦本体启动成功！")
                        success_count += 1
                    else:
                        ui.print_error("麦麦本体启动失败")
                        return False
                else:
                    ui.print_error("未找到run.bat文件")
                    return False
            else:
                # 新版本启动逻辑
                python_cmd = self._get_python_command(config, mai_path)
                mai_process = self.start_in_new_cmd(
                    f"{python_cmd} bot.py",
                    mai_path,
                    f"麦麦本体 - {version}"
                )
                if mai_process:
                    ui.print_success("麦麦本体启动成功！")
                    success_count += 1
                else:
                    ui.print_error("麦麦本体启动失败")
                    return False
            
            # 显示启动结果
            ui.console.print(f"\n[启动结果] {success_count}/{total_count} 组件启动成功", 
                           style=ui.colors["success"] if success_count == total_count else ui.colors["warning"])
            
            if success_count == total_count:
                ui.print_success("🎉 全栈启动完成！所有组件均启动成功")
                logger.info("全栈启动成功", success=success_count, total=total_count)
                return True
            else:
                ui.print_warning(f"⚠️ 部分组件启动失败，但核心功能正常")
                logger.warning("部分组件启动失败", success=success_count, total=total_count)
                return True  # 只要麦麦本体启动成功就算成功
                
        except Exception as e:
            ui.print_error(f"全栈启动失败：{str(e)}")
            logger.error("全栈启动失败", error=str(e), config=config)
            return False
    
    def stop_all_processes(self):
        """停止所有启动的进程"""
        try:
            stopped_count = 0
            for process in self.running_processes:
                if process.poll() is None:  # 进程仍在运行
                    process.terminate()
                    stopped_count += 1
                    logger.info("终止进程", pid=process.pid)
            
            # 清空进程列表
            self.running_processes.clear()
            self.process_info.clear()
            
            if stopped_count > 0:
                ui.print_info(f"已停止 {stopped_count} 个相关进程")
            else:
                ui.print_info("没有需要停止的进程")
                
        except Exception as e:
            ui.print_warning(f"停止进程时出错：{str(e)}")
            logger.warning("停止进程失败", error=str(e))
    
    def get_running_processes_info(self) -> List[Dict]:
        """获取正在运行的进程信息"""
        active_processes = []
        for info in self.process_info:
            process = info["process"]
            if process.poll() is None:  # 进程仍在运行
                info["running_time"] = time.time() - info["start_time"]
                active_processes.append(info)
        return active_processes
    
    def show_running_processes(self):
        """显示正在运行的进程状态"""
        active_processes = self.get_running_processes_info()
        
        if not active_processes:
            ui.print_info("当前没有正在运行的进程")
            return
        
        ui.console.print("\n[正在运行的进程]", style=ui.colors["primary"])
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
