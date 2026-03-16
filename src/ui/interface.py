# -*- coding: utf-8 -*-
"""
用户界面模块
负责界面显示和用户交互
"""
import time
import os
import sys
import structlog
from rich.console import Console
from rich.table import Table
from rich.prompt import Prompt, Confirm
from typing import Dict, Any

# 从新模块导入
from .theme import COLORS, SYMBOLS
from .menus import Menus
from .components import Components

logger = structlog.get_logger(__name__)


class UI:
    """用户界面类，作为UI的主控制器"""

    def __init__(self):
        self.console = Console()
        self.colors = COLORS
        self.symbols = SYMBOLS
        self.menus = Menus(self.console)
        self.components = Components(self.console)

    def _get_console_encoding(self) -> str:
        """获取当前控制台编码，默认回退到 utf-8。"""
        return getattr(sys.stdout, "encoding", None) or "utf-8"

    def _sanitize_console_text(self, text: str) -> str:
        """在非 UTF-8 控制台中降级不可编码字符，避免生产版输出异常。"""
        if not isinstance(text, str):
            text = str(text)

        replacements = {
            "✅": "[OK]",
            "❌": "[ERR]",
            "⚠️": "[WARN]",
            "⚠": "[WARN]",
            "ℹ️": "[INFO]",
            "ℹ": "[INFO]",
            "⏭️": "[SKIP]",
            "⏭": "[SKIP]",
            "🚀": "[RUN]",
            "🔧": "[CFG]",
            "📊": "[STAT]",
            "👋": "[BYE]",
            "📦": "[DEPLOY]",
            "🧠": "[MEM]",
            "↩️": "[BACK]",
            "↩": "[BACK]",
            "📝": "[EDIT]",
            "👁️": "[VIEW]",
            "👁": "[VIEW]",
            "🗑️": "[DEL]",
            "🗑": "[DEL]",
            "🔍": "[CHK]",
            "✨": "[NEW]",
            "🧩": "[PLUGIN]",
            "🚨": "[ATTN]",
            "📥": "[DL]",
            "📁": "[DIR]",
            "🔐": "[KEY]",
        }

        normalized = text
        for src, dst in replacements.items():
            normalized = normalized.replace(src, dst)

        encoding = self._get_console_encoding()
        try:
            normalized.encode(encoding)
            return normalized
        except UnicodeEncodeError:
            return normalized.encode(encoding, errors="replace").decode(encoding)

    def _safe_symbol(self, key: str) -> str:
        return self._sanitize_console_text(self.symbols.get(key, ""))

    def _safe_print(self, text: str, style: str):
        self.console.print(self._sanitize_console_text(text), style=style)

    def clear_screen(self):
        """清屏"""
        os.system('cls' if os.name == 'nt' else 'clear')

    def show_main_menu(self, has_active_instance: bool = False):
        """显示主菜单
        
        Args:
            has_active_instance: 是否有活跃实例，用于决定显示"运行实例"还是"实例多开"
        """
        self.clear_screen()
        logger.info("显示主菜单")
        self.menus.show_main_menu(has_active_instance)

    def show_config_menu(self):
        """显示配置菜单"""
        self.clear_screen()
        logger.info("显示配置菜单")
        self.menus.show_config_menu()

    def show_config_management_menu(self):
        """显示统一的配置管理菜单"""
        self.clear_screen()
        logger.info("显示统一配置管理菜单")
        self.menus.show_config_management_menu()

    def show_misc_menu(self):
        """显示杂项菜单"""
        self.clear_screen()
        logger.info("显示杂项菜单")
        self.menus.show_misc_menu()

    def show_config_check_menu(self):
        """显示配置检查菜单（保持兼容性）"""
        self.show_config_management_menu()

    def show_program_settings_menu(
        self,
        current_colors: Dict[str, Any],
        current_log_days: int,
        on_exit_action: str,
        minimize_to_tray_enabled: bool,
        notifications_enabled: bool,
        monitor_data_interval: float,
        monitor_ui_interval: float,
        monitor_input_interval: float,
        proxy_enabled: bool = False,
        proxy_type: str = "http",
        proxy_host: str = "",
        proxy_port: str = "",
    ):
        """显示程序设置菜单"""
        self.clear_screen()
        logger.info("显示程序设置菜单")
        self.menus.show_program_settings_menu(
            current_colors,
            current_log_days,
            on_exit_action,
            minimize_to_tray_enabled,
            notifications_enabled,
            monitor_data_interval,
            monitor_ui_interval,
            monitor_input_interval,
            proxy_enabled,
            proxy_type,
            proxy_host,
            proxy_port,
        )

    def show_plugin_menu(self):
        """显示插件管理菜单"""
        try:
            from .plugin_manager import PluginManager
            pm = PluginManager(self)
            pm.show_plugin_menu()
        except Exception as e:
            logger.error("插件管理器启动失败", error=str(e))
            self.print_error(f"插件管理器启动失败: {e}")
            self.pause()

    def show_instance_list(self, configurations: Dict[str, Any]):
        """显示实例列表"""
        self.components.show_instance_list(configurations)

    def show_config_details(self, config_name: str, config: Dict[str, Any]):
        """显示配置详情"""
        self.components.show_config_details(config_name, config)

    def print_success(self, message: str):
        logger.info(f"输出成功信息: {message}")
        self._safe_print(f"{self._safe_symbol('success')} {message}", self.colors["success"])
    
    def print_error(self, message: str):
        logger.error(f"输出错误信息: {message}")
        self._safe_print(f"{self._safe_symbol('error')} {message}", self.colors["error"])
    
    def print_warning(self, message: str):
        # 仅在日志中记录完整警告信息，控制台输出保持简洁
        logger.warning(f"警告: {message}")
        self._safe_print(f"{self._safe_symbol('warning')} {message}", self.colors["warning"])
    
    def print_info(self, message: str):
        logger.info(f"输出提示信息: {message}")
        self._safe_print(f"{self._safe_symbol('info')} {message}", self.colors["info"])

    def print_attention(self, message: str):
        logger.warning(f"输出注意信息: {message}")
        self._safe_print(f"{self._safe_symbol('attention')} {message}", self.colors["attention"])
    
    def get_input(self, prompt_text: str, default: str = "") -> str:
        logger.info(f"请求用户输入: {prompt_text}", default=default)
        user_input = Prompt.ask(prompt_text, default=default, console=self.console).strip().strip('"')
        logger.info(f"用户输入: {user_input}")
        return user_input
    
    def get_choice(self, prompt_text: str, choices: list) -> str:
        # get_input 已经被日志记录，这里不再重复
        return self.get_input(prompt_text).upper()
    
    def confirm(self, prompt_text: str) -> bool:
        logger.info(f"请求用户确认: {prompt_text}")
        user_confirmation = Confirm.ask(prompt_text, console=self.console)
        logger.info(f"用户确认结果: {'是' if user_confirmation else '否'}")
        return user_confirmation
    
    def get_confirmation(self, prompt_text: str) -> bool:
        return self.confirm(prompt_text)
    
    def countdown(self, seconds: int, message: str = "返回主菜单倒计时"):
        for i in range(seconds, 0, -1):
            self.console.print(f"\r{message}: {i}秒...", style=self.colors["warning"], end="")
            time.sleep(1)
        self.console.print()
    
    def pause(self, message: str = "按回车键继续..."):
        input(message)

# 全局UI实例
ui = UI()
