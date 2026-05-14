"""
版本检测工具模块
用于检测MaiBot版本并确定兼容性配置
"""

import re
import os
from typing import Tuple, Optional, Dict, Any
import structlog
logger = structlog.get_logger(__name__)


def has_builtin_webui(version: str) -> bool:
    """
    检测版本是否内置WebUI（版本>=0.12.2及所有main，dev分支）
    
    Args:
        version: 版本号
        
    Returns:
        是否内置WebUI
    """
    if not version:
        return False
    
    version = version.lower().strip()
    
    # main和dev分支都内置WebUI
    if "main" in version or "dev" in version:
        return True
    
    # 检查是否大于等于0.12.2
    try:
        # 移除v前缀
        if version.startswith("v"):
            version = version[1:]
        
        # 提取主版本号（去掉-fix等后缀和括号说明）
        main_version = version.split('-')[0].split('(')[0].strip()
        version_parts = main_version.split('.')
        
        # 确保至少有三个版本号部分
        if len(version_parts) >= 3:
            major = int(version_parts[0])
            minor = int(version_parts[1])
            patch = int(version_parts[2])
            
            # 检查是否大于等于0.12.2
            if major > 0 or (major == 0 and minor > 12) or (major == 0 and minor == 12 and patch >= 2):
                return True
    except (ValueError, IndexError):
        logger.warning("版本号格式无法解析，无法判断WebUI内置状态", version=version)
        return False
    
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


def is_legacy_version_with_bot_type(version: str, bot_type: str) -> bool:
    """
    根据版本和bot类型检测是否为旧版本
    
    Args:
        version: 版本号
        bot_type: bot类型 ("MaiBot" 或 "MoFox_bot")
        
    Returns:
        是否为旧版本
    """
    if not version:
        return False
    
    version = version.lower().strip()
    
    # MoFox的classical版本实际上不是旧版本，使用与master相同的启动方式
    if version == "classical" and bot_type == "MoFox_bot":
        return False
    
    # 其他情况使用原有的旧版本检测逻辑
    return is_legacy_version(version)


def needs_mongodb(version: str, bot_type: str = "MaiBot") -> bool:
    """
    检测版本是否需要MongoDB（0.7以下版本需要）
    
    Args:
        version: 版本号
        bot_type: bot类型
        
    Returns:
        是否需要MongoDB
    """
    if not version:
        return False
    
    version = version.lower().strip()
    
    # MoFox的classical版本实际上不需要MongoDB（与master分支相同）
    if version == "classical" and bot_type == "MoFox_bot":
        return False
    
    # classical版本需要MongoDB（默认情况）
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


def needs_adapter(version: str, bot_type: str = "MaiBot") -> bool:
    """
    检测版本是否需要适配器（0.6.0+版本需要）
    
    Args:
        version: 版本号
        bot_type: bot类型
        
    Returns:
        是否需要适配器
    """
    return not is_legacy_version_with_bot_type(version, bot_type)


def get_adapter_version(version: str, bot_type: str = "MaiBot") -> str:
    """
    根据MaiBot版本确定适配器版本
    MaiBot 1.0.0 之前使用 0.7.0 适配器；1.0.0 及之后使用 main 分支插件适配器。
    
    Args:
        version: MaiBot版本号
        bot_type: bot类型
        
    Returns:
        适配器版本号或分支名
    """
    if is_legacy_version_with_bot_type(version, bot_type):
        return "无需适配器"

    if is_plugin_adapter_version(version, bot_type):
        logger.info("使用插件适配器", version=version, adapter_version="main")
        return "main"

    logger.info("使用旧版外置适配器", version=version, adapter_version="0.7.0")
    return "0.7.0"


def is_plugin_adapter_version(version: str, bot_type: str = "MaiBot") -> bool:
    """检测当前版本是否应使用插件形式的 NapCat 适配器。"""
    if bot_type != "MaiBot" or not version:
        return False

    version_clean = version.lower().strip()
    if version_clean in {"main", "dev", "master"}:
        return True
    if version_clean.startswith(("main ", "dev ", "master ")):
        return True

    return compare_versions(version_clean, "1.0.0") >= 0


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

def get_version_requirements(version: str, bot_type: str = "MaiBot") -> Dict[str, Any]:
    """
    根据版本获取完整的需求配置
    
    Args:
        version: 版本号
        bot_type: bot类型
        
    Returns:
        包含所有需求的配置字典
    """
    return {
        "is_legacy": is_legacy_version_with_bot_type(version, bot_type),
        "needs_mongodb": needs_mongodb(version, bot_type),
        "needs_adapter": needs_adapter(version, bot_type),
        "adapter_version": get_adapter_version(version, bot_type),
        "adapter_mode": "plugin" if is_plugin_adapter_version(version, bot_type) else ("external" if needs_adapter(version, bot_type) else "none"),
        "has_builtin_webui": has_builtin_webui(version),
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
