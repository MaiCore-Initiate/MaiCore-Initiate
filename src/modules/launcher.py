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
            # 构建在新CMD窗口中运行的命令
            cmd_command = f'start "{title}" cmd /k "cd /d "{cwd}" && {command}"'
            
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
        
        # 检查适配器（仅新版本需要）
        version = config.get("version_path", "")
        if not is_legacy_version(version):
            # 新版本需要检查适配器
            adapter_path = config.get("adapter_path", "")
            if adapter_path and adapter_path != "当前配置集的对象实例版本较低，无适配器":
                valid, msg = validate_path(adapter_path, check_file="main.py")
                if not valid:
                    errors.append(f"适配器路径：{msg}")
            else:
                errors.append("适配器路径：路径未配置或无效")
        else:
            # 旧版本需要检查run.bat文件
            valid, msg = validate_path(mai_path, check_file="run.bat")
            if not valid:
                errors.append(f"麦麦本体路径缺少run.bat文件：{msg}")
        
        # 检查NapCat路径（可选）
        napcat_path = config.get("napcat_path", "")
        if napcat_path:
            if not os.path.exists(napcat_path):
                errors.append("NapCatQQ路径：文件不存在")
            elif not napcat_path.lower().endswith('.exe'):
                errors.append("NapCatQQ路径：不是可执行文件")
        
        return errors
    
    def launch_mai_only(self, config: Dict[str, Any]) -> bool:
        """
        仅启动麦麦本体
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            version = config.get("version_path", "")
            mai_path = config.get("mai_path", "")
            
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
                # 新版本启动逻辑
                logger.info("检测到新版本，使用标准启动模式", version=version)
                
                # 启动适配器
                adapter_path = config.get("adapter_path", "")
                if adapter_path and adapter_path != "当前配置集的对象实例版本较低，无适配器":
                    adapter_process = self.start_in_new_cmd(
                        "python main.py",
                        adapter_path,
                        f"麦麦适配器 - {version}"
                    )
                    if adapter_process:
                        ui.print_success("适配器启动成功！")
                        logger.info("适配器启动成功", path=adapter_path)
                        time.sleep(2)  # 等待适配器启动
                    else:
                        ui.print_warning("适配器启动失败")
                
                # 启动麦麦本体
                mai_process = self.start_in_new_cmd(
                    "python bot.py",
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
    
    def launch_full_stack(self, config: Dict[str, Any]) -> bool:
        """
        启动完整技术栈（麦麦+适配器+NapCat+MongoDB）
        
        Args:
            config: 配置字典
            
        Returns:
            启动是否成功
        """
        try:
            version = config.get("version_path", "")
            ui.print_info("开始启动完整技术栈...")
            
            # 检查并启动NapCat
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
                        ui.print_warning("NapCat启动失败")
                else:
                    ui.print_warning("未配置NapCat路径或文件不存在，跳过启动")
                    logger.warning("未配置NapCat路径或文件不存在")
            else:
                ui.print_info("NapCat已经在运行")
                logger.info("NapCat已经在运行")
            
            # 检查并启动MongoDB（如果需要）
            mongodb_running = check_process("mongod.exe")
            if not mongodb_running:
                mongodb_path = config.get("mongodb_path", "")
                if mongodb_path and os.path.exists(mongodb_path):
                    # 尝试从配置的MongoDB路径启动
                    try:
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
                            else:
                                ui.print_warning("MongoDB启动失败")
                        else:
                            ui.print_warning("在MongoDB路径中未找到mongod.exe")
                            logger.warning("MongoDB可执行文件未找到", path=mongodb_path)
                    except Exception as e:
                        ui.print_warning(f"MongoDB启动失败：{str(e)}")
                        logger.warning("MongoDB启动失败", error=str(e))
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
                    except subprocess.CalledProcessError as e:
                        ui.print_warning("MongoDB服务启动失败，请检查是否已安装MongoDB服务")
                        logger.warning("MongoDB服务启动失败", error=str(e))
            else:
                ui.print_info("MongoDB已经在运行")
                logger.info("MongoDB已经在运行")
            
            # 启动麦麦
            ui.print_info("启动麦麦本体和适配器...")
            return self.launch_mai_only(config)
            
        except Exception as e:
            ui.print_error(f"完整启动失败：{str(e)}")
            logger.error("完整启动失败", error=str(e), config=config)
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
