# -*- coding: utf-8 -*-
"""
UI组件模块
负责定义和显示可复用的UI组件，如表格、面板等
"""
import os
from rich.console import Console
from rich.table import Table
from typing import Dict, Any

from .theme import COLORS, SYMBOLS


class Components:
    """UI组件类"""

    def __init__(self, console: Console):
        self.console = console
        self.colors = COLORS
        self.symbols = SYMBOLS

    def show_title(self, title: str, symbol: str = ""):
        """显示一个带有样式的标题"""
        symbol_text = f"[{self.colors['primary']}]{self.symbols.get(symbol, '')}[/{self.colors['primary']}] " if symbol else ""
        self.console.print(f"\n{symbol_text}[bold {self.colors['header']}]{title}[/bold {self.colors['header']}]")
        self.console.print(f"[{self.colors['border']}] {'-' * (len(title) + 4)} [/{self.colors['border']}]")

    def show_instance_list(self, configurations: Dict[str, Any]):
        """显示实例列表"""
        self.console.print("请选择您要使用的实例：", style=self.colors["info"])
        
        table = Table(show_header=True, header_style=self.colors["table_header"])
        table.add_column("序号", style=self.colors["cyan"])
        table.add_column("序列号", style=self.colors["blue"])
        table.add_column("昵称", style=self.colors["blue"])
        table.add_column("版本", style=self.colors["white"])
        table.add_column("状态", style=self.colors["green"])
        
        for idx, (cfg_name, cfg) in enumerate(configurations.items(), 1):
            serial_number = cfg.get('serial_number', 'N/A')
            absolute_serial = cfg.get('absolute_serial_number', 'N/A')
            nickname = cfg.get('nickname_path', '未命名')
            version = cfg.get('version_path', 'N/A')
            
            mai_path = cfg.get('mai_path', '')
            status = f"{self.symbols['success']} 已配置" if mai_path and os.path.exists(mai_path) else f"{self.symbols['error']} 未配置"
            
            table.add_row(
                f"实例{idx}",
                f"{serial_number} (绝对: {absolute_serial})",
                nickname,
                version,
                status
            )
        
        self.console.print(table)

    def show_config_details(self, config_name: str, config: Dict[str, Any]):
        """显示配置详情"""
        table = Table(title=f"配置详情: {config_name}")
        table.add_column("项目", style=self.colors["cyan"])
        table.add_column("值", style=self.colors["white"])
        table.add_column("状态", style=self.colors["green"])
        
        items = [
            ("用户序列号", config.get('serial_number', '未配置')),
            ("绝对序列号", str(config.get('absolute_serial_number', '未配置'))),
            ("昵称", config.get('nickname_path', '未配置')),
            ("版本", config.get('version_path', '未配置')),
            ("QQ", config.get('qq_account', '未配置')),
            ("麦麦本体路径", config.get('mai_path', '未配置')),
        ]
        
        install_options = config.get('install_options', {})
        
        if install_options.get('install_adapter', False):
            items.append(("适配器路径", config.get('adapter_path', '未配置')))
        else:
            items.append(("适配器路径", "已跳过安装"))
        
        if install_options.get('install_napcat', False):
            items.append(("NapCat路径", config.get('napcat_path', '未配置') or '未配置'))
        else:
            items.append(("NapCat路径", "已跳过安装"))
        
        if install_options.get('install_mongodb', False):
            items.append(("MongoDB路径", config.get('mongodb_path', '未配置') or '未配置'))
        else:
            items.append(("MongoDB路径", "已跳过安装"))
        
        if install_options.get('install_webui', False):
            items.append(("WebUI路径", config.get('webui_path', '未配置') or '未配置'))
        else:
            items.append(("WebUI路径", "已跳过安装"))
        
        for name, value in items:
            if "路径" in name and value not in ["未配置", "已跳过安装"]:
                status = f"{self.symbols['success']} 存在" if os.path.exists(value) else f"{self.symbols['error']} 不存在"
            elif value == "已跳过安装":
                status = f"{self.symbols['skipped']} 跳过"
            else:
                status = f"{self.symbols['success']} 已设置" if value != "未配置" else f"{self.symbols['warning']} 未设置"
            
            table.add_row(name, value, status)
        
        self.console.print(table)
        
        if install_options:
            self.console.print(f"\n[{self.symbols['config']} 安装选项]", style=self.colors["info"])
            option_table = Table(show_header=True, header_style=self.colors["table_header"])
            option_table.add_column("组件", style=self.colors["cyan"])
            option_table.add_column("安装状态", style=self.colors["white"])
            
            component_names = {
                'install_adapter': '适配器',
                'install_napcat': 'NapCat',
                'install_mongodb': 'MongoDB',
                'install_webui': 'WebUI'
            }
            
            for key, name in component_names.items():
                status = f"{self.symbols['success']} 已选择" if install_options.get(key, False) else f"{self.symbols['skipped']} 已跳过"
                option_table.add_row(name, status)
            
            self.console.print(option_table)
