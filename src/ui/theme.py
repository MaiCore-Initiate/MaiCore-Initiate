# -*- coding: utf-8 -*-
"""
UI主题模块
负责定义颜色、样式等视觉元素
"""
from src.core.p_config import p_config_manager

# 默认颜色定义 (作为备用)
DEFAULT_COLORS = {
    "primary": "#BADFFA",
    "success": "#4AF933",
    "warning": "#F2FF5D",
    "error": "#FF6B6B",
    "info": "#6DA0FD",
    "secondary": "#00FFBB",
    "danger": "#FF6B6B",  # 别名 for error
    "exit": "#7E1DE4",
    "header": "#BADFFA",
    "title": "bold magenta",
    "border": "bright_black",
    "table_header": "bold magenta",
    "cyan": "cyan",
    "white": "white",
    "green": "green",
    "blue": "#005CFA",
    "attention":"#FF45F6"
}

# 从配置文件加载颜色，如果失败则使用默认值
COLORS = p_config_manager.get_theme_colors() or DEFAULT_COLORS

# 符号定义
SYMBOLS = {
    "success": "✅",
    "error": "❌",
    "warning": "⚠️",
    "info": "ℹ️",
    "skipped": "⏭️",
    "rocket": "🚀",
    "config": "🔧",
    "database": "📊",
    "quit": "👋",
    "about": "ℹ️",
    "deployment": "📦",
    "knowledge": "🧠",
    "status": "📊",
    "back": "↩️",
    "edit": "📝",
    "view": "👁️",
    "delete": "🗑️",
    "validate": "🔍",
    "new": "✨",
    "plugin": "🧩",
    "attention": "🚨",
    "download": "📥",
    "folder": "📁",
    "key": "🔐",
    "refresh": ""
}
