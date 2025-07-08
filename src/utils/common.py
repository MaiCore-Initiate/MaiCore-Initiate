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


def is_legacy_version(version: str) -> bool:
    """
    检测是否为旧版本（小于0.6.0或为classical）
    
    Args:
        version: 版本号
        
    Returns:
        是否为旧版本
    """
    if not version:
        return False
    
    version = version.lower().strip()
    
    # 检查是否为classical版本
    if version == "classical":
        return True
    
    # 检查是否小于0.6.0
    try:
        # 提取主版本号（去掉-fix等后缀）
        main_version = version.split('-')[0]
        version_parts = main_version.split('.')
        
        # 确保至少有两个版本号部分
        if len(version_parts) >= 2:
            major = int(version_parts[0])
            minor = int(version_parts[1])
            
            # 检查是否小于0.6.0
            if major < 0 or (major == 0 and minor < 6):
                return True
    except (ValueError, IndexError):
        logger.warning("版本号格式无法解析，默认为新版本", version=version)
        return False
    
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
