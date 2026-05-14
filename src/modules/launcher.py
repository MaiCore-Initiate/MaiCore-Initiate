"""
麦麦启动器模块
负责启动和管理麦麦实例及其相关组件。
"""
import os
import shutil
import subprocess
import time
import webbrowser
import structlog
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
import psutil
from rich.table import Table

from ..ui.interface import ui
from ..utils.common import check_process, validate_path
from ..utils.version_detector import is_legacy_version, is_legacy_version_with_bot_type, has_builtin_webui, is_plugin_adapter_version

logger = structlog.get_logger(__name__)


_LEGACY_MOFOX_TYPE = "MoFox_bot"
_SUPPORTED_MODERN_TYPES = {"MaiBot", "MoFox-Core", "Neo-MoFox", _LEGACY_MOFOX_TYPE}


def _normalize_bot_type(bot_type: str) -> str:
    if bot_type in {"MoFox-Core", _LEGACY_MOFOX_TYPE}:
        return "MoFox-Core"
    if bot_type == "Neo-MoFox":
        return "Neo-MoFox"
    return "MaiBot"


def _get_bot_path_key(bot_type: str) -> str:
    normalized = _normalize_bot_type(bot_type)
    if normalized == "MoFox-Core":
        return "mofox_path"
    if normalized == "Neo-MoFox":
        return "neo_mofox_path"
    return "mai_path"


def _get_main_entry_file(bot_type: str) -> str:
    return "main.py" if _normalize_bot_type(bot_type) == "Neo-MoFox" else "bot.py"


def _is_plugin_adapter_config(config: Dict[str, Any]) -> bool:
    opts = config.get("install_options", {})
    if opts.get("adapter_mode") == "plugin" or config.get("adapter_mode") == "plugin":
        return True

    bot_type = _normalize_bot_type(config.get("bot_type", "MaiBot"))
    version = config.get("version_path", "")
    return is_plugin_adapter_version(version, bot_type)


# --- 内部辅助类 ---

class _ProcessManager:
    """
    内部进程管理器。
    负责在新CMD窗口中启动、跟踪和停止进程。
    """
    def __init__(self):
        self.running_processes: List[Dict[str, Any]] = []

    def _record_stop_stats(self, process_info: Dict[str, Any], detail: Optional[str] = None) -> None:
        """为已结束的托管进程补记 stop 统计，避免异常退出丢失使用时长。"""
        if process_info.get("_stats_stop_recorded"):
            return

        try:
            from ..core.stats import stats_db

            duration = max(0, time.time() - process_info.get("start_time", time.time()))
            stats_db.record_event(
                instance_id=process_info.get("_instance_id", "unknown"),
                event_type="stop",
                component=process_info.get("_component", process_info.get("title", "unknown")),
                duration_s=round(duration, 1),
                detail=detail,
            )
            process_info["_stats_stop_recorded"] = True
        except Exception:
            pass

    def _finalize_exited_processes(self) -> None:
        """
        回收已经退出的托管进程。

        对于异常退出的进程，这里补写 stop 统计，避免首页和实例统计丢失本次使用时长。
        """
        alive_processes: List[Dict[str, Any]] = []
        for process_info in self.running_processes:
            pid = process_info.get("pid") or getattr(process_info.get("process"), "pid", 0)
            if pid and self._is_process_alive(pid):
                alive_processes.append(process_info)
                continue

            self._record_stop_stats(process_info, detail="进程异常退出")

        self.running_processes = alive_processes

    def _is_process_alive(self, pid: int) -> bool:
        """检查进程是否仍在运行且不是僵尸进程"""
        try:
            p = psutil.Process(pid)
            return p.is_running() and p.status() != psutil.STATUS_ZOMBIE
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return False

    def _kill_process_tree_recursive(self, pid: int) -> bool:
        """
        递归终止进程树，包括所有层级的子进程和孙进程。
        使用psutil的递归方式，比taskkill /T更彻底。
        """
        try:
            parent = psutil.Process(pid)
            if not parent.is_running():
                return True
            
            # 递归终止所有子进程
            for child in parent.children(recursive=True):
                self._kill_process_tree_recursive(child.pid)
            
            # 终止父进程
            parent.terminate()
            
            # 等待进程结束，最多3秒
            try:
                parent.wait(timeout=3)
            except psutil.TimeoutExpired:
                # 如果超时，强制杀死
                parent.kill()
                parent.wait(timeout=1)
            
            return True
        except psutil.NoSuchProcess:
            # 进程已不存在，视为成功
            return True
        except psutil.AccessDenied:
            # 权限不足，尝试使用taskkill
            return self._kill_with_taskkill(pid)
        except Exception as e:
            logger.error("递归终止进程树失败", pid=pid, error=str(e))
            return False

    def _kill_with_taskkill(self, pid: int, title: str = "") -> bool:
        """使用taskkill强制终止进程树"""
        try:
            # 使用 /T 终止进程树，/F 强制终止
            kill_command = ["taskkill", "/F", "/T", "/PID", str(pid)]
            result = subprocess.run(
                kill_command,
                capture_output=True,
                text=True,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            
            if result.returncode == 0:
                logger.info("taskkill成功终止进程树", pid=pid, title=title)
                return True
            elif "not found" in result.stderr.lower() or "not found" in result.stdout.lower():
                logger.info("进程已不存在", pid=pid, title=title)
                return True
            else:
                logger.warning("taskkill失败", pid=pid, title=title, stderr=result.stderr)
                return False
        except subprocess.TimeoutExpired:
            logger.error("taskkill超时", pid=pid, title=title)
            return False
        except Exception as e:
            logger.error("taskkill异常", pid=pid, title=title, error=str(e))
            return False

    def start_in_new_cmd(self, command: str, cwd: str, title: str) -> Optional[subprocess.Popen]:
        """在新的CMD窗口中启动命令。"""
        try:
            # 构造在新控制台中执行的命令
            full_command = f'cmd /k "chcp 65001 && title {title} && cd /d "{cwd}" && {command}"'
            logger.info("在新控制台启动进程", title=title, command=full_command, cwd=cwd)

            creationflags = 0
            if os.name == 'nt':
                creationflags = subprocess.CREATE_NEW_CONSOLE

            process = subprocess.Popen(
                full_command,
                cwd=cwd,
                shell=False,  # shell=False更安全，且CREATE_NEW_CONSOLE需要它
                creationflags=creationflags
            )
            
            process_info = {
                "process": process,
                "title": title,
                "command": command,
                "cwd": cwd,
                "start_time": time.time(),
                "pid": process.pid
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
        # 首先清理已结束的进程
        self._finalize_exited_processes()
        
        if not self.running_processes:
            ui.print_info("当前没有正在运行的进程。")
            return

        stopped_count = 0
        failed_count = 0
        
        # 复制列表以避免迭代时修改
        processes_to_stop = self.running_processes.copy()
        
        for process_info in processes_to_stop:
            pid = process_info.get("pid") or process_info["process"].pid
            title = process_info["title"]
            
            # 检查进程是否还在运行
            if not self._is_process_alive(pid):
                self._record_stop_stats(process_info, detail="停止前进程已退出")
                if process_info in self.running_processes:
                    self.running_processes.remove(process_info)
                continue
            
            ui.print_info(f"正在停止进程 '{title}' (PID: {pid})...")
            
            if self.stop_process(pid):
                stopped_count += 1
            else:
                failed_count += 1
                # 再次检查，如果进程已结束则移除
                if not self._is_process_alive(pid):
                    self._record_stop_stats(process_info, detail="停止过程中进程已退出")
                    if process_info in self.running_processes:
                        self.running_processes.remove(process_info)
        
        # 再次清理已结束的进程
        self._finalize_exited_processes()
        
        if stopped_count > 0:
            ui.print_success(f"已成功停止 {stopped_count} 个进程。")
        if failed_count > 0:
            ui.print_warning(f"有 {failed_count} 个进程停止失败，可能需要手动处理。")
        if not self.running_processes:
            ui.print_info("所有进程已停止。")

    def get_running_processes_info(self) -> List[Dict]:
        """获取当前仍在运行的进程信息，包括资源占用。"""
        active_processes = []
        stale_processes: List[Dict[str, Any]] = []
        # 过滤掉已经结束的进程
        self._finalize_exited_processes()
        for info in self.running_processes:
            try:
                pid = info.get("pid") or info["process"].pid
                if not self._is_process_alive(pid):
                    self._record_stop_stats(info, detail="探测过程中进程已退出")
                    stale_processes.append(info)
                    continue
                p = psutil.Process(pid)
                info["pid"] = p.pid
                # CPU percent is now calculated in show_running_processes to avoid conflicts
                info["memory_mb"] = p.memory_info().rss / (1024 * 1024)
                info["running_time"] = time.time() - info["start_time"]
                active_processes.append(info)
            except psutil.NoSuchProcess:
                # 获取pid用于日志记录，如果process对象不存在则返回None
                pid = getattr(info.get("process"), 'pid', None)
                self._record_stop_stats(info, detail="探测过程中进程消失")
                stale_processes.append(info)
                logger.warning("进程已消失，无法获取信息", pid=pid)
            except Exception as e:
                logger.error("获取进程信息失败", error=str(e))
        if stale_processes:
            self.running_processes = [info for info in self.running_processes if info not in stale_processes]
        return active_processes

    def stop_process(self, pid: int) -> bool:
        """通过PID停止单个进程及其所有子进程。"""
        process_info = next((info for info in self.running_processes if info.get("process") and (info.get("pid") or info["process"].pid) == pid), None)
        # 首先验证进程是否存在
        if not self._is_process_alive(pid):
            logger.info("进程已不存在，跳过停止", pid=pid)
            if process_info:
                self._record_stop_stats(process_info, detail="停止请求到达前进程已退出")
                if process_info in self.running_processes:
                    self.running_processes.remove(process_info)
            return True

        if not process_info:
            logger.warning("尝试停止一个非托管进程", pid=pid)
            return False

        title = process_info["title"]
        
        try:
            # 优先使用递归方式终止进程树（更彻底）
            if os.name == 'nt':
                # Windows系统优先使用递归方式
                success = self._kill_process_tree_recursive(pid)
                if not success:
                    # 如果递归方式失败，尝试taskkill
                    logger.warning("递归终止失败，尝试taskkill", pid=pid)
                    success = self._kill_with_taskkill(pid, title)
            else:
                # 非Windows系统使用psutil
                success = self._kill_process_tree_recursive(pid)
            
            if success:
                logger.info("成功终止进程树", pid=pid, title=title)
                # 等待进程完全结束
                time.sleep(0.5)
                # 验证进程是否真的结束了
                if self._is_process_alive(pid):
                    logger.warning("进程仍然运行，尝试强制杀死", pid=pid)
                    if os.name == 'nt':
                        self._kill_with_taskkill(pid, title)
                    else:
                        try:
                            p = psutil.Process(pid)
                            p.kill()
                        except:
                            pass
            else:
                logger.error("终止进程树失败", pid=pid, title=title)
                return False
            
            ui.print_success(f"进程 '{title}' (PID: {pid}) 已成功停止。")
            self._record_stop_stats(process_info)

        except psutil.NoSuchProcess:
            logger.info("进程已不存在", pid=pid, title=title)
            self._record_stop_stats(process_info, detail="停止完成前进程已消失")
            # 进程已不存在，视为成功
        except Exception as e:
            logger.error("终止进程时发生未知错误", pid=pid, title=title, error=str(e))
            ui.print_error(f"停止进程 '{title}' (PID: {pid}) 失败: {e}")
            return False
        finally:
            # 无论成功与否，都从管理列表中移除
            if process_info in self.running_processes:
                self.running_processes.remove(process_info)
        
        return True

    def restart_process(self, pid: int) -> bool:
        """通过PID重启单个进程。"""
        process_info = next((info for info in self.running_processes if info.get("process") and (info.get("pid") or info["process"].pid) == pid), None)
            
        if process_info:
            command = process_info["command"]
            cwd = process_info["cwd"]
            title = process_info["title"]
            
            ui.print_info(f"正在重启进程 '{title}' (PID: {pid})...")
            
            if self.stop_process(pid):
                time.sleep(1)  # 等待端口释放等
                new_process = self.start_in_new_cmd(command, cwd, title)
                if new_process:
                    ui.print_success(f"进程 '{title}' 重启成功。")
                    return True
            
            ui.print_error(f"进程 '{title}' (PID: {pid}) 重启失败。")
            return False
        else:
            ui.print_warning(f"未找到PID为 {pid} 的进程，无法重启。")
            return False


class _LaunchComponent:
    """
    可启动组件的基类。
    """
    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self.is_enabled = False
        self._skip_browser = False

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
            return True  # 如果没配置，也算作"成功"
        
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
                    ui.print_info('在服务列表中找到"MongoDB Server(MongoDB)"服务，右键点击并选择\'启动\'。')
                
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
    """NapCat组件，通过自动检测支持OneKey和Shell版本。"""
    def __init__(self, config: Dict[str, Any]):
        super().__init__("NapCat", config)
        self._webui_napcat_shell: Optional[bool] = None  # WebUI传入的快捷登录选择
        self.check_enabled()

    def check_enabled(self):
        self.is_enabled = self.config.get("install_options", {}).get("install_napcat", False)

    def _is_shell_version(self) -> bool:
        """通过检测特征启动脚本文件来判断是否为NapCat.Shell版本。"""
        napcat_path = self.config.get("napcat_path", "")
        if not napcat_path:
            return False
        
        napcat_dir = os.path.dirname(napcat_path)
        if not os.path.isdir(napcat_dir):
            return False
            
        shell_scripts = [
            "launcher.bat", "launcher-user.bat",
            "launcher-win10.bat", "launcher-win10-user.bat"
        ]
        
        return any(os.path.exists(os.path.join(napcat_dir, script)) for script in shell_scripts)

    def get_launch_details(self) -> Optional[Tuple[str, str, str]]:
        """
        获取OneKey版本的启动详情。
        Shell版本有独立的启动逻辑，不使用此方法。
        """
        napcat_path = self.config.get("napcat_path", "")
        if not (napcat_path and os.path.exists(napcat_path) and napcat_path.lower().endswith('.exe')):
            logger.error("NapCat路径无效", path=napcat_path)
            return None
        
        # 如果是Shell版本，则此方法不适用
        if self._is_shell_version():
            return None
            
        # OneKey版本的启动命令
        command = f'"{napcat_path}"'
        if qq_account := self.config.get("qq_account"):
            command += f" {qq_account}"
        cwd = os.path.dirname(napcat_path)
        title = f"NapCatQQ - {self.config.get('version_path', 'N/A')}"
        return command, cwd, title

    def _try_launch_shell_script(
        self, script_path: str, napcat_dir: str, process_manager: _ProcessManager, qq_account: Optional[str] = None
    ) -> Optional[bool]:
        """
        尝试启动单个NapCat.Shell脚本，并与用户确认结果。
        """
        if not os.path.exists(script_path):
            logger.warning("NapCat.Shell 启动脚本不存在", path=script_path)
            return None

        script_name = os.path.basename(script_path)
        command = f'"{script_name}"'
        if qq_account:
            command += f" {qq_account}"
        
        title = f"NapCatQQ - {self.config.get('version_path', 'N/A')} (Shell)"
        
        process = process_manager.start_in_new_cmd(command, napcat_dir, title)
        if not process:
            return False

        time.sleep(3)

        # WebUI模式下跳过终端确认，直接视为启动成功
        if self._webui_napcat_shell is not None:
            logger.info("[WebUI] 跳过NapCat启动确认，视为成功")
            return True

        ui.print_warning("NapCat可能启动失败，这应该不是您或我们的问题，我们可以换一种方式启动...")
        if ui.confirm("您的NapCat启动成功了吗？"):
            return True
        else:
            ui.print_info(f"正在停止可能失败的 NapCat 进程 (PID: {process.pid})...")
            process_manager.stop_process(process.pid)
            time.sleep(1)
            return False

    def start(self, process_manager: _ProcessManager) -> bool:
        if not self.is_enabled:
            return True
            
        if check_process("NapCatWinBootMain.exe"):
            ui.print_info("NapCat 已经在运行。")
            logger.info("NapCat已经在运行")
            return True
            
        if not self._is_shell_version():
            # OneKey版本的默认启动方式
            ui.print_info("检测到 NapCat (OneKey) 版本，正在尝试启动...")
            if super().start(process_manager):
                time.sleep(3)
                return True
            return False

        # --- NapCat.Shell版本的特殊启动逻辑 ---
        ui.print_info("检测到 NapCat (Shell) 版本，正在尝试启动...")
        napcat_path = self.config.get("napcat_path", "")
        if not napcat_path or not os.path.exists(os.path.dirname(napcat_path)):
            ui.print_error(f"NapCat路径配置错误或目录不存在: {napcat_path}")
            return False
            
        napcat_dir = os.path.dirname(napcat_path)
        
        import platform
        is_win10 = platform.release() == "10"
        
        preferred_script, fallback_script = (
            ("launcher-win10-user.bat", "launcher-win10.bat") if is_win10
            else ("launcher-user.bat", "launcher.bat")
        )

        qq_for_login = None
        if self._webui_napcat_shell is not None:
            # WebUI模式：使用前端传来的选择，不阻塞终端
            if self._webui_napcat_shell:
                qq_for_login = self.config.get("qq_account")
                if qq_for_login:
                    ui.print_info(f"[WebUI] 将使用QQ号 {qq_for_login} 进行快速登录。")
                else:
                    ui.print_warning("[WebUI] 配置中未找到有效的QQ号 (qq_account)，将不使用快速登录。")
        elif ui.confirm("是否为 NapCat.Shell 启用快速登录？"):
            qq_for_login = self.config.get("qq_account")
            if qq_for_login:
                ui.print_info(f"将使用QQ号 {qq_for_login} 进行快速登录。")
            else:
                ui.print_warning("配置中未找到有效的QQ号 (qq_account)，将不使用快速登录。")

        preferred_path = os.path.join(napcat_dir, preferred_script)
        fallback_path = os.path.join(napcat_dir, fallback_script)

        ui.print_info(f"步骤 1/2: 尝试使用首选脚本 '{preferred_script}'")
        result = self._try_launch_shell_script(preferred_path, napcat_dir, process_manager, qq_for_login)

        if result is True:
            return True

        if result is False or result is None:
            ui.print_info(f"步骤 2/2: 尝试使用备用脚本 '{fallback_script}'")
            if self._try_launch_shell_script(fallback_path, napcat_dir, process_manager, qq_for_login):
                return True

        ui.print_error("所有 NapCat (Shell) 启动方式均已尝试失败。")
        return False


class _AdapterComponent(_LaunchComponent):
    def __init__(self, config: Dict[str, Any]):
        super().__init__("适配器", config)
        self.check_enabled()

    def check_enabled(self):
        opts = self.config.get("install_options", {})
        version = self.config.get("version_path", "")
        bot_type = _normalize_bot_type(self.config.get("bot_type", "MaiBot"))
        # MoFox-Core 与 Neo-MoFox 均内置适配器，不应作为独立进程启动。
        self.is_enabled = (
            bot_type == "MaiBot"
            and opts.get("install_adapter", False)
            and not _is_plugin_adapter_config(self.config)
            and not is_legacy_version_with_bot_type(version, bot_type)
        )

    def get_launch_details(self) -> Optional[Tuple[str, str, str]]:
        adapter_path = self.config.get("adapter_path", "")
        valid, _ = validate_path(adapter_path, check_file="main.py")
        if not valid:
            logger.error("适配器路径无效", path=adapter_path)
            return None
        
        python_cmd = MaiLauncher._get_python_command(self.config, adapter_path)
        command = f"{python_cmd} main.py"
        bot_nickname = self.config.get('nickname_path', '适配器')
        version = self.config.get('version_path', 'N/A')
        title = f"{bot_nickname} - 适配器 v{version}"
        return command, adapter_path, title
    
    def start(self, process_manager: _ProcessManager) -> bool:
        if not self.is_enabled:
            return True

        ui.print_info("尝试启动适配器...")
        if super().start(process_manager):
            time.sleep(2)  # 等待适配器启动
            return True
        return False


class _WebUIComponent(_LaunchComponent):
    def __init__(self, config: Dict[str, Any]):
        super().__init__("WebUI", config)
        self.check_enabled()

    def check_enabled(self):
        bot_type = _normalize_bot_type(self.config.get("bot_type", "MaiBot"))
        has_external_webui = self.config.get("install_options", {}).get("install_webui", False)
        version = self.config.get("version_path", "")
        has_builtin = has_builtin_webui(version)

        if bot_type in {"MoFox-Core", "Neo-MoFox"}:
            self.is_enabled = True
        elif bot_type == "MaiBot" and has_builtin:
            self.is_enabled = True
        else:
            self.is_enabled = has_external_webui

    def _resolve_bun_command(self, webui_path: str) -> Optional[str]:
        """Try to find a bun executable either globally or within the project."""
        candidates = [
            "bun.exe",
            "bun.cmd",
            "bun"
        ] if os.name == "nt" else ["bun"]

        for candidate in candidates:
            resolved = shutil.which(candidate)
            if resolved:
                return resolved

        local_bin = os.path.join(
            webui_path,
            "node_modules",
            ".bin",
            "bun.cmd" if os.name == "nt" else "bun"
        )
        if os.path.exists(local_bin):
            return local_bin

        return None

    def start(self, process_manager: _ProcessManager) -> bool:
        if not self.is_enabled:
            return True

        version = self.config.get('version_path', 'N/A')
        bot_type = _normalize_bot_type(self.config.get("bot_type", "MaiBot"))

        if bot_type in {"MoFox-Core", "Neo-MoFox"}:
            ui.print_info(f"检测到 {bot_type} 内置 WebUI，随主程序启动后即可使用。")
            return True

        if bot_type == "MaiBot" and has_builtin_webui(version):
            ui.print_info("检测到内置WebUI版本，主程序将代理控制面板")
            ui.print_info("请在浏览器中访问: http://localhost:8001")
            
            # 询问是否自动打开浏览器
            if not self._skip_browser and ui.confirm("是否自动打开浏览器访问控制面板？"):
                try:
                    webbrowser.open("http://localhost:8001")
                    ui.print_success("已打开浏览器访问控制面板")
                except Exception as exc:
                    ui.print_warning(f"自动打开浏览器失败，请手动访问 http://localhost:8001 ({exc})")
            
            return True
        
        # 非内置版本，启动独立WebUI
        ui.print_info("尝试启动 MaiBot 控制面板...")
        webui_path = self.config.get("webui_path", "")
        if not (webui_path and os.path.exists(webui_path)):
            ui.print_error("WebUI路径无效或不存在")
            ui.print_info("请前往组件下载中心下载并安装WebUI")
            return False

        bun_cmd = self._resolve_bun_command(webui_path)
        if bun_cmd:
            bun_exec = f'"{bun_cmd}"'
        else:
            bun_exec = "bun"
            ui.print_warning("未在系统中找到bun，将尝试直接执行 'bun run dev'。")

        # 控制面板使用bun dev服务器，统一监听7999端口
        command = f"{bun_exec} run dev -- --port 7999"
        title = f"MaiBot 控制面板 - {version}"
        process = process_manager.start_in_new_cmd(command, webui_path, title)
        if not process:
            return False

        if not self._skip_browser:
            url = "http://localhost:7999"
            ui.print_info(f"正在打开浏览器访问 {url} ...")
            try:
                webbrowser.open(url)
            except Exception as exc:
                ui.print_warning(f"自动打开浏览器失败，请手动访问 {url} ({exc})")

        return True


class _MaiComponent(_LaunchComponent):
    def __init__(self, config: Dict[str, Any]):
        bot_type = _normalize_bot_type(config.get("bot_type", "MaiBot"))
        component_name = {
            "MaiBot": "麦麦本体",
            "MoFox-Core": "MoFox-Core本体",
            "Neo-MoFox": "Neo-MoFox本体",
        }.get(bot_type, "麦麦本体")
        super().__init__(component_name, config)
        self.is_enabled = True  # 本体总是启用

    def get_launch_details(self) -> Optional[Tuple[str, str, str]]:
        bot_type = _normalize_bot_type(self.config.get("bot_type", "MaiBot"))
        bot_path = self.config.get(_get_bot_path_key(bot_type), "")
        version = self.config.get("version_path", "")

        if is_legacy_version_with_bot_type(version, bot_type):
            run_bat = os.path.join(bot_path, "run.bat")
            if not os.path.exists(run_bat):
                logger.error("旧版本麦麦缺少run.bat", path=run_bat)
                return None
            command = f'"{run_bat}"'
        else:
            python_cmd = MaiLauncher._get_python_command(self.config, bot_path)
            start_file = _get_main_entry_file(bot_type)
            command = f"{python_cmd} {start_file}"

        bot_nickname = self.config.get('nickname_path', bot_type)
        title = f"{bot_nickname} - {self.name} v{version}"
        return command, bot_path, title

    def start(self, process_manager: _ProcessManager) -> bool:
        ui.print_info(f"尝试启动{self.name}...")
        success = super().start(process_manager)

        if success and _normalize_bot_type(self.config.get("bot_type")) == "MoFox-Core":
            has_webui = self.config.get("install_options", {}).get("install_mofox_webui", False)
            if has_webui and not self._skip_browser:
                ui.print_info("检测到MoFox WebUI已安装，WebUI将随主程序自动启动")
                ui.print_info("正在打开浏览器访问 http://localhost:12138 ...")
                try:
                    webbrowser.open("http://localhost:12138")
                except Exception as exc:
                    ui.print_warning(f"自动打开浏览器失败，请手动访问 http://localhost:12138 ({exc})")
        
        return success


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
        self._process_cache: Dict[int, psutil.Process] = {}

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

    def validate_configuration(self, config: Dict[str, Any], components_to_validate: Optional[List[str]] = None) -> list:
        """验证配置的有效性。"""
        errors = []

        bot_type = _normalize_bot_type(config.get("bot_type", "MaiBot"))
        selected_components = set(components_to_validate or self._components.keys() or ["mai", "adapter", "napcat", "mongodb", "webui"])
        bot_path = config.get(_get_bot_path_key(bot_type), "")
        main_entry = _get_main_entry_file(bot_type)

        if "mai" in selected_components:
            valid, msg = validate_path(bot_path, check_file=main_entry)
            if not valid:
                errors.append(f"{bot_type}本体路径: {msg}")

        version = config.get("version_path", "")
        if "mai" in selected_components and is_legacy_version_with_bot_type(version, bot_type):
            valid, msg = validate_path(bot_path, check_file="run.bat")
            if not valid:
                errors.append(f"旧版麦麦本体路径缺少run.bat: {msg}")

        # 注册组件以进行后续检查
        self._register_components(config)

        if "adapter" in selected_components and self._components['adapter'].is_enabled:
            adapter_path = config.get("adapter_path", "")
            valid, msg = validate_path(adapter_path, check_file="main.py")
            if not valid:
                errors.append(f"适配器路径: {msg}")
        elif "adapter" in selected_components and _is_plugin_adapter_config(config):
            errors.append("当前适配器以插件形式加载，不能作为独立组件启动")

        if "napcat" in selected_components and self._components['napcat'].is_enabled:
            napcat_path = config.get("napcat_path", "")
            if not (napcat_path and os.path.exists(napcat_path) and napcat_path.lower().endswith('.exe')):
                errors.append("NapCat路径: 无效或文件不存在。")
        
        return errors

    def show_launch_menu(self, config: Dict[str, Any]) -> bool:
        """根据bot类型显示不同的启动菜单并处理用户选择。"""
        self._register_components(config)
        bot_type = _normalize_bot_type(config.get("bot_type", "MaiBot"))

        ui.clear_screen()
        ui.console.print("[🚀 启动选择菜单]", style=ui.colors["primary"])
        ui.console.print("="*50)
        ui.console.print(f"实例版本: {config.get('version_path', '未知')}")
        ui.console.print(f"实例昵称: {config.get('nickname_path', '未知')}")
        ui.console.print(f"Bot 类型: {bot_type}")
        ui.console.print("\n[可用组件]", style=ui.colors["info"])
        
        # 打印组件状态
        for comp in self._components.values():
            if "本体" not in comp.name:
                ui.console.print(f"  • {comp.name}: {'✅ 可用' if comp.is_enabled else '❌ 未配置'}")
        # Find and print the main component last
        main_comp = next((c for c in self._components.values() if "本体" in c.name), None)
        if main_comp:
            ui.console.print(f"  • {main_comp.name}: ✅ 可用")

        # 根据 bot_type 定义菜单
        if bot_type == "MaiBot":
            # 检查是否为内置WebUI版本
            version = config.get("version_path", "")
            has_builtin = has_builtin_webui(version)
            plugin_adapter = _is_plugin_adapter_config(config)

            if plugin_adapter:
                menu_options = {
                    "1": ("主程序", ["mai"]),
                    "2": ("主程序+NapCatQQ", ["mai", "napcat"]),
                }
            else:
                menu_options = {
                    "1": ("主程序+适配器", ["mai", "adapter"]),
                    "2": ("主程序+适配器+NapCatQQ", ["mai", "adapter", "napcat"]),
                    "3": ("主程序+适配器+检查MongoDB", ["mai", "adapter", "mongodb"]),
                    "4": ("主程序+适配器+NapCatQQ+检查MongoDB", ["mai", "adapter", "napcat", "mongodb"]),
                }
            
            # 如果控制面板可用，添加包含控制面板的启动选项
            if self._components['webui'].is_enabled:
                if has_builtin:
                    # 内置版本显示为"控制面板(内置)"
                    if plugin_adapter:
                        menu_options["5"] = ("主程序+控制面板(内置)", ["mai", "webui"])
                        menu_options["6"] = ("主程序+NapCat+控制面板(内置)", ["mai", "napcat", "webui"])
                    else:
                        menu_options["5"] = ("主程序+适配器+控制面板(内置)", ["mai", "adapter", "webui"])
                        menu_options["6"] = ("主程序+适配器+NapCat+控制面板(内置)", ["mai", "adapter", "napcat", "webui"])
                else:
                    # 独立版本显示为"控制面板"
                    if plugin_adapter:
                        menu_options["5"] = ("主程序+控制面板", ["mai", "webui"])
                        menu_options["6"] = ("主程序+NapCat+控制面板", ["mai", "napcat", "webui"])
                    else:
                        menu_options["5"] = ("主程序+适配器+控制面板", ["mai", "adapter", "webui"])
                        menu_options["6"] = ("主程序+适配器+NapCat+控制面板", ["mai", "adapter", "napcat", "webui"])
        elif bot_type in {"MoFox-Core", "Neo-MoFox"}:
            menu_options = {
                "1": ("主程序（内置适配器）+WebUI", ["mai"]),
                "2": ("主程序（内置适配器）+NapCatQQ+WebUI", ["mai", "napcat"]),
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
        }

        if not (self._config and _is_plugin_adapter_config(self._config)):
            advanced_options["2"] = ("适配器", "adapter")

        advanced_options["3"] = ("NapCatQQ", "napcat")
        advanced_options["4"] = ("检查MongoDB", "mongodb")
        
        # 对于MaiBot内置WebUI版本，添加控制面板选项
        if self._config:
            bot_type = self._config.get("bot_type", "MaiBot")
            version = self._config.get("version_path", "")
            if bot_type == "MaiBot" and has_builtin_webui(version):
                advanced_options["5"] = ("控制面板(内置)", "webui")
            elif self._components['webui'].is_enabled:
                advanced_options["5"] = ("控制面板", "webui")
        
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
                return self.launch(list(dict.fromkeys(components_to_start)))  # 去重并保持顺序
            elif valid_choices and not components_to_start:
                ui.print_warning("未选择任何有效组件。")

    def launch(self, components_to_start: List[str], from_webui: bool = False, use_napcat_shell: bool = False) -> bool:
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
                comp = self._components[comp_name]
                if from_webui:
                    comp._skip_browser = True
                    # 将WebUI的NapCat.Shell选择传递给NapCat组件
                    if comp_name == "napcat" and isinstance(comp, _NapCatComponent):
                        comp._webui_napcat_shell = use_napcat_shell
                success = comp.start(self._process_manager)
                try:
                    from ..core.stats import stats_db
                    inst_id = self._config.get("serial_number", "unknown")
                    if success:
                        stats_db.record_event(inst_id, "start", comp_name)
                        for p in self._process_manager.running_processes:
                            if "_instance_id" not in p:
                                p["_instance_id"] = inst_id
                                p["_component"] = comp_name
                    else:
                        stats_db.record_event(inst_id, "error", comp_name, detail="启动失败")
                except Exception:
                    pass
                if not success:
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
    
    def stop_process(self, pid: int) -> bool:
        """停止单个托管进程。"""
        return self._process_manager.stop_process(pid)

    def restart_process(self, pid: int) -> bool:
        """重启单个托管进程。"""
        return self._process_manager.restart_process(pid)

    def get_managed_pids(self) -> List[int]:
        """获取所有当前受管进程的PID列表。"""
        # 添加启动器自身的PID
        pids = [os.getpid()]
        # 添加所有由_process_manager管理的子进程PID
        pids.extend([info.get("pid") or info["process"].pid for info in self._process_manager.running_processes if info.get("process") and self._process_manager._is_process_alive(info.get("pid") or info["process"].pid)])
        return pids

    def show_running_processes(self):
        """以表格形式显示当前正在运行的进程状态，并使用缓存计算CPU。"""
        managed_procs_info = self._process_manager.get_running_processes_info()
        
        table = Table(title="[📊 进程状态管理]", show_header=True, header_style="bold magenta")
        table.add_column("PID", style="dim", width=8)
        table.add_column("进程名称", style="cyan", no_wrap=True)
        table.add_column("CPU %", style="green", justify="right")
        table.add_column("内存 (MB)", style="yellow", justify="right")
        table.add_column("运行时间 (s)", style="blue", justify="right")

        current_pids = {info.get("pid") or info["process"].pid for info in managed_procs_info}
        current_pids.add(os.getpid())

        # 清理已结束进程的缓存
        for pid in list(self._process_cache.keys()):
            if pid not in current_pids:
                del self._process_cache[pid]
        
        all_process_meta = [{"pid": os.getpid(), "title": "麦麦启动器 (主程序)"}]
        for info in managed_procs_info:
            all_process_meta.append({"pid": info.get("pid") or info["process"].pid, "title": info["title"], "start_time": info["start_time"]})

        if not all_process_meta:
            ui.print_info("当前没有由本启动器启动的正在运行的进程。")
            return table

        for meta in all_process_meta:
            pid = meta["pid"]
            try:
                p = self._process_cache.get(pid)
                if p is None:
                    p = psutil.Process(pid)
                    p.cpu_percent()  # 第一次调用返回0，但会初始化计时器
                    self._process_cache[pid] = p
                    cpu_percent = 0.0
                else:
                    cpu_percent = p.cpu_percent()  # 后续调用将返回有意义的值
                
                memory_mb = p.memory_info().rss / (1024 * 1024)
                running_time = time.time() - (meta.get("start_time") or p.create_time())

                table.add_row(
                    str(pid),
                    meta['title'],
                    f"{cpu_percent:.2f}",
                    f"{memory_mb:.2f}",
                    f"{int(running_time)}"
                )
            except (psutil.NoSuchProcess, Exception) as e:
                logger.warning("获取进程信息失败", pid=pid, error=str(e))
                if pid in self._process_cache:
                    del self._process_cache[pid]
        
        return table

    def get_process_details(self, pid: int) -> Optional[Dict[str, Any]]:
        """获取单个进程的详细信息（不包括冲突的CPU数据）。"""
        try:
            p = psutil.Process(pid)
            managed_info = next((info for info in self._process_manager.running_processes if info.get("process") and (info.get("pid") or info["process"].pid) == pid), None)
            
            details = {
                "PID": p.pid,
                "名称": p.name(),
                "状态": p.status(),
                "内存 (MB)": f"{p.memory_info().rss / (1024 * 1024):.2f}",
                "启动时间": datetime.fromtimestamp(p.create_time()).strftime("%Y-%m-%d %H:%M:%S"),
                "命令行": " ".join(p.cmdline()),
                "工作目录": p.cwd(),
                "父进程ID": p.ppid(),
            }
            if managed_info:
                details["托管标题"] = managed_info["title"]

            return details
        except (psutil.NoSuchProcess, Exception) as e:
            logger.warning("获取进程详细信息失败", pid=pid, error=str(e))
            return None


# 全局启动器实例
launcher = MaiLauncher()
