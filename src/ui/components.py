# -*- coding: utf-8 -*-
"""
UI组件模块
负责定义和显示可复用的UI组件，如表格、面板等
"""
import os
from rich.console import Console
from rich.table import Table
from typing import Dict, Any, List

from .theme import COLORS, SYMBOLS
import subprocess


class Components:
    """UI组件类"""

    def __init__(self, console: Console):
        self.console = console
        self.colors = COLORS
        self.symbols = SYMBOLS
    def check_mongodb_service_status(self) -> str:
        """
        检查MongoDB服务状态
        
        Returns:
            MongoDB服务状态字符串
        """
        try:
            # 使用sc query命令检查MongoDB服务状态
            result = subprocess.run(["sc", "query", "MongoDB"], capture_output=True, text=True, timeout=10)
            
            if "RUNNING" in result.stdout:
                return "已启动"
            elif "STOPPED" in result.stdout:
                return "已安装，未启动"
            else:
                return "未安装"
                
        except subprocess.TimeoutExpired:
            return "检查超时"
        except Exception as e:
            return "检查失败"

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
        table.add_column("Bot类型", style=self.colors["white"])
        table.add_column("状态", style=self.colors["green"])
        
        for idx, (cfg_name, cfg) in enumerate(configurations.items(), 1):
            serial_number = cfg.get('serial_number', 'N/A')
            absolute_serial = cfg.get('absolute_serial_number', 'N/A')
            nickname = cfg.get('nickname_path', '未命名')
            version = cfg.get('version_path', 'N/A')
            bot_type = cfg.get('bot_type', 'MaiBot')  # 获取bot类型，默认为MaiBot
            
            # 根据bot_type字段选择正确的路径字段
            if bot_type == "MoFox_bot":
                mai_path = cfg.get('mofox_path', '')
            else:
                mai_path = cfg.get('mai_path', '')
            
            status = f"{self.symbols['success']} 已配置" if mai_path and os.path.exists(mai_path) else f"{self.symbols['error']} 未配置"
            
            table.add_row(
                f"实例{idx}",
                f"{serial_number} (绝对: {absolute_serial})",
                nickname,
                version,
                bot_type,
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
        ]
        
        # 根据bot_type字段选择正确的路径字段
        bot_type = config.get('bot_type', 'MaiBot')  # 获取bot类型，默认为MaiBot
        if bot_type == "MoFox_bot":
            items.append(("墨狐本体路径", config.get('mofox_path', '未配置')))
        else:
            items.append(("麦麦本体路径", config.get('mai_path', '未配置')))
        
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
            # 检查MongoDB服务状态
            mongodb_status = self.check_mongodb_service_status()
            items.append(("MongoDB状态", mongodb_status))
        else:
            items.append(("MongoDB状态", "已跳过安装"))
        
        if install_options.get('install_webui', False):
            items.append(("WebUI路径", config.get('webui_path', '未配置') or '未配置'))
        else:
            items.append(("WebUI路径", "已跳过安装"))
        
        for name, value in items:
            if "路径" in name and value not in ["未配置", "已跳过安装"]:
                status = f"{self.symbols['success']} 存在" if os.path.exists(value) else f"{self.symbols['error']} 不存在"
            elif "状态" in name:
                # 处理MongoDB状态显示
                if value == "已启动":
                    status = f"{self.symbols['success']} {value}"
                elif value == "已安装，未启动":
                    status = f"{self.symbols['warning']} {value}"
                elif value == "未安装":
                    status = f"{self.symbols['error']} {value}"
                else:
                    status = f"{self.symbols['error']} {value}"
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

    def show_installed_plugins(self, instance_name: str, installed_plugins: List[Dict[str, str]]):
        """显示已安装的插件列表"""
        self.show_title(f"实例 '{instance_name}' 的已安装插件", symbol="plugin")
        
        if not installed_plugins:
            self.console.print("  没有找到已安装的插件。", style=self.colors["warning"])
            return

        table = Table(show_header=True, header_style=self.colors["table_header"])
        table.add_column("插件名称", style=self.colors["primary"])
        table.add_column("版本", style=self.colors["white"])
        table.add_column("作者", style=self.colors["info"])
        table.add_column("描述", style=self.colors["secondary"])
        
        for plugin in installed_plugins:
            table.add_row(
                plugin.get("name", "N/A"),
                plugin.get("version", "N/A"),
                plugin.get("author", "N/A"),
                plugin.get("description", "N/A")
            )
        
        self.console.print(table)

    def show_available_plugins(self, available_plugins: List[Dict[str, str]]):
        """显示可供安装的插件列表"""
        self.show_title("可用的新插件", symbol="new")

        if not available_plugins:
            self.console.print("  没有找到可用的新插件。", style=self.colors["info"])
            return

        table = Table(show_header=True, header_style=self.colors["table_header"])
        table.add_column("序号", style=self.colors["cyan"])
        table.add_column("插件名称", style=self.colors["primary"])
        table.add_column("版本", style=self.colors["white"])
        table.add_column("作者", style=self.colors["info"])
        table.add_column("描述", style=self.colors["secondary"])
        
        for idx, plugin in enumerate(available_plugins, 1):
            table.add_row(
                str(idx),
                plugin.get("name", "N/A"),
                plugin.get("version", "N/A"),
                plugin.get("author", "N/A"),
                plugin.get("description", "N/A")
            )
        
        self.console.print(table)
        self.console.print("请输入您想安装的插件序号，或输入 'Q' 取消。", style=self.colors["info"])
