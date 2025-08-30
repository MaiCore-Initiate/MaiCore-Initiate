"""
日志配置模块
使用 structlog 提供结构化日志
"""
import sys
import structlog
from rich.console import Console
from rich.logging import RichHandler
import logging
from datetime import datetime


def custom_timestamper(logger, method_name, event_dict):
    """自定义时间戳格式器"""
    now = datetime.now()
    # 格式化为 YYYY.M.DD
    formatted_time = f"{now.year}.{now.month}.{now.day}"
    event_dict["timestamp"] = formatted_time
    return event_dict


def custom_formatter(logger, method_name, event_dict):
    """自定义日志格式器 - 格式: 2024.5.11[xxx][info]xxxxx"""
    timestamp = event_dict.pop("timestamp", "")
    logger_name = event_dict.pop("logger", "system")
    level = event_dict.pop("level", "info")
    event = event_dict.pop("event", "")
    
    # 构建日志消息
    formatted_message = f"{timestamp}[{logger_name}][{level}]{event}"
    
    # 如果有额外的字段，追加到消息后面
    if event_dict:
        extra_info = " ".join([f"{k}={v}" for k, v in event_dict.items()])
        formatted_message += f" {extra_info}"
    
    return formatted_message


def setup_logging(level: str = "INFO") -> None:
    """
    设置结构化日志
    
    Args:
        level: 日志级别 (DEBUG, INFO, WARNING, ERROR)
    """
    # 设置标准日志级别
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(rich_tracebacks=True, show_time=False, show_level=False, show_path=False)]
    )
    
    # 配置 structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            custom_timestamper,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            custom_formatter
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """
    获取结构化日志器
    
    Args:
        name: 日志器名称
        
    Returns:
        结构化日志器实例
    """
    return structlog.get_logger(name)


# 初始化日志系统
setup_logging()
