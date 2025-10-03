"""
实用工具模块
包含通用的工具函数
"""
import os
import sys
import ctypes
import subprocess
import re
import structlog
from typing import Optional, Tuple

logger = structlog.get_logger(__name__)


def setup_console():
    """设置控制台支持彩色输出"""
    if sys.platform == 'win32':
        try:
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
            logger.debug("Windows控制台彩色输出已启用")
        except Exception as e:
            logger.warning("设置Windows控制台失败", error=str(e))


def clear_screen():
    """清屏"""
    os.system('cls' if os.name == 'nt' else 'clear')


def is_admin() -> bool:
    """检查是否以管理员权限运行"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False


def run_as_admin():
    """以管理员权限重新运行程序"""
    try:
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)
        sys.exit(0)
    except Exception as e:
        logger.error("无法以管理员权限运行", error=str(e))


def validate_path(path: str, check_file: Optional[str] = None) -> Tuple[bool, str]:
    """
    验证路径有效性
    
    Args:
        path: 要验证的路径
        check_file: 可选，检查指定文件是否存在
        
    Returns:
        (是否有效, 错误信息)
    """
    if not path:
        return False, "路径为空"
    
    # 检查路径中是否包含中文
    if re.search(r'[\u4e00-\u9fff]', path):
        return False, "路径包含中文字符，可能导致问题"
    
    # 检查路径是否存在
    if not os.path.exists(path):
        return False, "路径不存在"
    
    # 如果指定了文件，检查文件是否存在
    if check_file:
        file_path = os.path.join(path, check_file)
        if not os.path.exists(file_path):
            return False, f"缺少必需文件: {check_file}"
    
    return True, ""


def validate_exe_path(path: str) -> Tuple[bool, str]:
    """
    验证可执行文件路径
    
    Args:
        path: 可执行文件路径
        
    Returns:
        (是否有效, 错误信息)
    """
    if not path:
        return False, "路径为空"
    
    # 检查路径中是否包含中文
    if re.search(r'[\u4e00-\u9fff]', path):
        return False, "路径包含中文字符，可能导致问题"
    
    # 检查文件是否存在
    if not os.path.exists(path):
        return False, "可执行文件不存在"
    
    # 检查是否为可执行文件
    if not path.lower().endswith('.exe'):
        return False, "不是可执行文件(.exe)"
    
    return True, ""


def check_process(process_name: str) -> bool:
    """
    检查进程是否正在运行
    
    Args:
        process_name: 进程名称
        
    Returns:
        进程是否正在运行
    """
    try:
        result = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {process_name}"],
            capture_output=True,
            text=True,
            check=True
        )
        return process_name.lower() in result.stdout.lower()
    except Exception as e:
        logger.warning("检查进程失败", process=process_name, error=str(e))
        return False


def get_input_with_validation(prompt: str, validator=None, allow_empty: bool = False, is_exe: bool = False) -> str:
    """
    获取并验证用户输入
    
    Args:
        prompt: 提示信息
        validator: 验证函数
        allow_empty: 是否允许为空
        is_exe: 是否为可执行文件路径
        
    Returns:
        验证通过的输入
    """
    while True:
        user_input = input(prompt).strip().strip('"')
        
        if not user_input:
            if allow_empty:
                return ""
            else:
                logger.warning("输入不能为空")
                continue
        
        # 使用指定的验证器
        if validator:
            valid, msg = validator(user_input)
            if not valid:
                logger.error("输入验证失败", error=msg)
                continue
        
        # 可执行文件验证
        if is_exe:
            valid, msg = validate_exe_path(user_input)
            if not valid:
                logger.error("可执行文件验证失败", error=msg)
                continue
        
        return user_input


def is_vscode_installed() -> bool:
    """检查VSCode是否安装并可用"""
    try:
        # 尝试运行 'code --version' 命令来检测VSCode
        result = subprocess.run(["code", "--version"], capture_output=True, text=True, shell=True, check=True)
        return result.returncode == 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def open_files_in_editor(files_to_open: list):
    """在合适的编辑器中打开文件列表"""
    from ..ui.interface import ui # 延迟导入以避免循环依赖
    
    if not files_to_open:
        ui.print_warning("没有找到可供打开的配置文件。")
        return

    use_vscode = is_vscode_installed()
    editor_name = "VSCode" if use_vscode else "记事本"
    
    ui.print_info(f"正在尝试使用 {editor_name} 打开配置文件...")

    try:
        if use_vscode:
            # VSCode可以一次性打开多个文件
            command = ["code"] + [f'"{f}"' for f in files_to_open]
            subprocess.Popen(" ".join(command), shell=True)
        else:
            # Notepad需要为每个文件单独启动进程
            for file_path in files_to_open:
                subprocess.Popen(["notepad", file_path])
        
        ui.print_success(f"已发送打开命令到 {editor_name}。")

    except Exception as e:
        ui.print_error(f"无法使用 {editor_name} 打开文件: {e}")
        if use_vscode:
            ui.print_info("尝试使用记事本作为备选...")
            try:
                for file_path in files_to_open:
                    subprocess.Popen(["notepad", file_path])
                ui.print_success("已在记事本中打开。")
            except Exception as ne:
                ui.print_error(f"无法使用记事本打开文件: {ne}")
