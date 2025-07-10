"""
版本检测工具模块
用于检测MaiBot版本并确定兼容性配置
"""

import re
import os
from typing import Tuple, Optional, Dict, Any
from ..core.logging import logger


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


def needs_mongodb(version: str) -> bool:
    """
    检测版本是否需要MongoDB（0.7以下版本需要）
    
    Args:
        version: 版本号
        
    Returns:
        是否需要MongoDB
    """
    if not version:
        return False
    
    version = version.lower().strip()
    
    # classical版本需要MongoDB
    if version == "classical":
        return True
    
    # 分支版本判断
    if "main" in version or "dev" in version:
        # 主分支和开发分支默认不需要MongoDB（假设是0.7+）
        return False
    
    # 检查是否小于0.7.0
    try:
        # 移除v前缀
        if version.startswith("v"):
            version = version[1:]
        
        # 提取主版本号（去掉-fix等后缀和括号说明）
        main_version = version.split('-')[0].split('(')[0].strip()
        version_parts = main_version.split('.')
        
        # 确保至少有两个版本号部分
        if len(version_parts) >= 2:
            major = int(version_parts[0])
            minor = int(version_parts[1])
            
            # 检查是否小于0.7.0
            if major < 0 or (major == 0 and minor < 7):
                return True
    except (ValueError, IndexError):
        logger.warning("版本号格式无法解析，默认需要MongoDB", version=version)
        return True  # 无法解析时，保守地假设需要MongoDB
    
    return False


def needs_adapter(version: str) -> bool:
    """
    检测版本是否需要适配器（0.6.0+版本需要）
    
    Args:
        version: 版本号
        
    Returns:
        是否需要适配器
    """
    return not is_legacy_version(version)


def get_adapter_version(version: str) -> str:
    """
    根据MaiBot版本确定适配器版本
    
    Args:
        version: MaiBot版本号
        
    Returns:
        适配器版本号或分支名
    """
    if is_legacy_version(version):
        return "无需适配器"
    
    version_clean = version.lower().strip()
    
    # 处理分支版本
    if "main" in version_clean:
        return "main"
    elif "dev" in version_clean:
        return "dev"
    
    try:
        # 移除v前缀
        if version_clean.startswith("v"):
            version_clean = version_clean[1:]
        
        # 移除可能的括号和说明文字
        version_clean = re.sub(r'\s*\([^)]*\)', '', version_clean).strip()
        
        # 分离版本号和可能的后缀
        version_parts = version_clean.split('-')[0].split('.')
        
        if not version_parts or not version_parts[0].isdigit():
            return "未知版本"
        
        major = int(version_parts[0]) if len(version_parts) > 0 and version_parts[0].isdigit() else 0
        minor = int(version_parts[1]) if len(version_parts) > 1 and version_parts[1].isdigit() else 0
        
        if major == 0:
            if minor == 6:
                return "0.2.3"  # 0.6.x 使用 0.2.3
            elif 7 <= minor <= 8:
                return "0.4.2"  # 0.7.x-0.8.x 使用 0.4.2
            elif minor >= 9:
                return "main"   # 0.9.x+ 使用 main
        else:
            return "main"  # 1.x+ 使用 main
        
        return "main"  # 默认使用main
        
    except (ValueError, IndexError):
        logger.warning("版本号解析失败，使用main分支适配器", version=version)
        return "main"


def parse_version(version: str) -> Tuple[int, int, int]:
    """
    解析版本号为数字元组
    
    Args:
        version: 版本号字符串
        
    Returns:
        (主版本号, 次版本号, 修订版本号)
    """
    if not version:
        return (0, 0, 0)
    
    version_clean = version.lower().strip()
    
    # 移除v前缀
    if version_clean.startswith("v"):
        version_clean = version_clean[1:]
    
    # 移除可能的括号和说明文字
    version_clean = re.sub(r'\s*\([^)]*\)', '', version_clean).strip()
    
    # 分离版本号和可能的后缀
    version_parts = version_clean.split('-')[0].split('.')
    
    try:
        major = int(version_parts[0]) if len(version_parts) > 0 and version_parts[0].isdigit() else 0
        minor = int(version_parts[1]) if len(version_parts) > 1 and version_parts[1].isdigit() else 0
        patch = int(version_parts[2]) if len(version_parts) > 2 and version_parts[2].isdigit() else 0
        
        return (major, minor, patch)
    except (ValueError, IndexError):
        return (0, 0, 0)


def detect_maibot_version_from_files(maibot_path: str) -> Optional[str]:
    """
    从MaiBot文件中检测版本号
    
    Args:
        maibot_path: MaiBot安装路径
        
    Returns:
        检测到的版本号，如果检测失败则返回None
    """
    try:
        # 检查多个可能的版本文件
        version_files = [
            os.path.join(maibot_path, "version.txt"),
            os.path.join(maibot_path, "VERSION"),
            os.path.join(maibot_path, "pyproject.toml"),
            os.path.join(maibot_path, "setup.py"),
            os.path.join(maibot_path, "bot.py")
        ]
        
        # 首先尝试从version.txt或VERSION文件读取
        for version_file in version_files[:2]:
            if os.path.exists(version_file):
                with open(version_file, 'r', encoding='utf-8') as f:
                    version = f.read().strip()
                    if version:
                        logger.info("从版本文件检测到版本", file=version_file, version=version)
                        return version
        
        # 尝试从pyproject.toml读取
        pyproject_path = os.path.join(maibot_path, "pyproject.toml")
        if os.path.exists(pyproject_path):
            with open(pyproject_path, 'r', encoding='utf-8') as f:
                content = f.read()
                match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
                if match:
                    version = match.group(1)
                    logger.info("从pyproject.toml检测到版本", version=version)
                    return version
        
        # 尝试从bot.py文件中提取版本信息
        bot_py_path = os.path.join(maibot_path, "bot.py")
        if os.path.exists(bot_py_path):
            with open(bot_py_path, 'r', encoding='utf-8') as f:
                content = f.read()
                # 查找常见的版本定义模式
                patterns = [
                    r'__version__\s*=\s*["\']([^"\']+)["\']',
                    r'VERSION\s*=\s*["\']([^"\']+)["\']',
                    r'version\s*=\s*["\']([^"\']+)["\']'
                ]
                for pattern in patterns:
                    match = re.search(pattern, content, re.IGNORECASE)
                    if match:
                        version = match.group(1)
                        logger.info("从bot.py检测到版本", version=version)
                        return version
        
        return None
        
    except Exception as e:
        logger.warning("版本检测失败", error=str(e))
        return None


def get_version_requirements(version: str) -> Dict[str, Any]:
    """
    根据版本获取完整的需求配置
    
    Args:
        version: 版本号
        
    Returns:
        包含所有需求的配置字典
    """
    return {
        "is_legacy": is_legacy_version(version),
        "needs_mongodb": needs_mongodb(version),
        "needs_adapter": needs_adapter(version),
        "adapter_version": get_adapter_version(version),
        "parsed_version": parse_version(version),
        "version_display": version
    }


def compare_versions(version1: str, version2: str) -> int:
    """
    比较两个版本号
    
    Args:
        version1: 第一个版本号
        version2: 第二个版本号
        
    Returns:
        -1: version1 < version2
         0: version1 == version2
         1: version1 > version2
    """
    v1_parsed = parse_version(version1)
    v2_parsed = parse_version(version2)
    
    if v1_parsed < v2_parsed:
        return -1
    elif v1_parsed > v2_parsed:
        return 1
    else:
        return 0
