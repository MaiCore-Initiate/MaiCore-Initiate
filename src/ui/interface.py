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

    def show_plugin_menu(self):
        """显示插件管理菜单"""
        self.clear_screen()
        # 这是一个示例流程，后续会替换为真实的逻辑
        self.components.show_title("插件管理", symbol="plugin")
        
        # 1. 选择实例
        # 假设我们有一个函数来获取实例，这里我们用假数据
        all_configs = {"instance1": {}, "instance2": {}} # 替换为 config_manager.get_all_configs()
        self.show_instance_list(all_configs)
        instance_name = self.get_input("请输入要管理插件的实例名称: ")

        if not instance_name:
            self.print_warning("没有输入实例名称，操作取消。")
            self.countdown(3)
            return

        # 2. 显示插件管理菜单
        while True:
            self.clear_screen()
            
            # 假设的已安装插件列表
            installed_plugins = [
                {"name": "maimai-help", "version": "1.2.0", "author": "Alice", "description": "一个帮助插件"},
                {"name": "maimai-stats", "version": "0.5.0", "author": "Bob", "description": "统计B50和单曲数据"}
            ]
            self.components.show_installed_plugins(instance_name, installed_plugins)
            
            self.menus.show_instance_plugin_menu(instance_name)
            
            choice = self.get_choice("请选择操作: ", ["A", "B", "C", "Q"])
            
            if choice == 'A':
                # 假设的可安装插件列表
                available_plugins = [
                    {"name": "maimai-themes", "version": "1.0.0", "author": "Charlie", "description": "为MaiMbot更换主题"},
                    {"name": "maimai-gacha", "version": "2.1.0", "author": "David", "description": "模拟抽卡"}
                ]
                self.components.show_available_plugins(available_plugins)
                plugin_choice = self.get_input("请输入要安装的插件序号 (或 Q 取消): ")
                if plugin_choice.upper() == 'Q':
                    continue
                self.print_success(f"插件 '{plugin_choice}' 已成功安装到 '{instance_name}' (模拟)。")
                self.pause()

            elif choice == 'B':
                plugin_to_uninstall = self.get_input("请输入要卸载的插件名称 (或 Q 取消): ")
                if plugin_to_uninstall.upper() == 'Q':
                    continue
                self.print_success(f"插件 '{plugin_to_uninstall}' 已从 '{instance_name}' 卸载 (模拟)。")
                self.pause()

            elif choice == 'C':
                # 刷新列表，循环开始时已执行
                self.print_info("已刷新插件列表。")
                self.pause()
                
            elif choice == 'Q':
                break

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
