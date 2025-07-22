# -*- coding: utf-8 -*-
"""
用户界面模块
负责界面显示和用户交互
"""
import time
import os
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

    def clear_screen(self):
        """清屏"""
        os.system('cls' if os.name == 'nt' else 'clear')

    def show_main_menu(self):
        """显示主菜单"""
        self.clear_screen()
        self.menus.show_main_menu()

    def show_config_menu(self):
        """显示配置菜单"""
        self.clear_screen()
        self.menus.show_config_menu()

    def show_config_management_menu(self):
        """显示统一的配置管理菜单"""
        self.clear_screen()
        self.menus.show_config_management_menu()

    def show_config_check_menu(self):
        """显示配置检查菜单（保持兼容性）"""
        self.show_config_management_menu()

    def show_instance_list(self, configurations: Dict[str, Any]):
        """显示实例列表"""
        self.components.show_instance_list(configurations)

    def show_config_details(self, config_name: str, config: Dict[str, Any]):
        """显示配置详情"""
        self.components.show_config_details(config_name, config)

    def print_success(self, message: str):
        self.console.print(f"{self.symbols['success']} {message}", style=self.colors["success"])
    
    def print_error(self, message: str):
        self.console.print(f"{self.symbols['error']} {message}", style=self.colors["error"])
    
    def print_warning(self, message: str):
        self.console.print(f"{self.symbols['warning']} {message}", style=self.colors["warning"])
    
    def print_info(self, message: str):
        self.console.print(f"{self.symbols['info']} {message}", style=self.colors["info"])
    
    def get_input(self, prompt_text: str, default: str = "") -> str:
        return Prompt.ask(prompt_text, default=default, console=self.console).strip().strip('"')
    
    def get_choice(self, prompt_text: str, choices: list) -> str:
        return self.get_input(prompt_text).upper()
    
    def confirm(self, prompt_text: str) -> bool:
        return Confirm.ask(prompt_text, console=self.console)
    
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
