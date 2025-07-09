"""
用户界面模块
负责界面显示和用户交互
"""
import time
import os
import structlog
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.table import Table
from rich.prompt import Prompt, Confirm
from typing import Dict, Any, Optional

logger = structlog.get_logger(__name__)


class UI:
    """用户界面类"""
    
    def __init__(self):
        self.console = Console()
        
        # 颜色定义
        self.colors = {
            "primary": "#BADFFA",
            "success": "#4AF933", 
            "warning": "#F2FF5D",
            "error": "#FF6B6B",
            "info": "#6DA0FD",
            "secondary": "#00FFBB"
        }
    
    def clear_screen(self):
        """清屏"""
        os.system('cls' if os.name == 'nt' else 'clear')
    
    def print_header(self):
        """打印程序头部"""
        header_text = """
███╗   ███╗ █████╗ ██╗██████╗  ██████╗ ████████╗    ██████╗██╗  ██╗ █████╗ ████████╗
████╗ ████║██╔══██╗██║██╔══██╗██╔═══██╗╚══██╔══╝   ██╔════╝██║  ██║██╔══██╗╚══██╔══╝
██╔████╔██║███████║██║██████╔╝██║   ██║   ██║      ██║     ███████║███████║   ██║   
██║╚██╔╝██║██╔══██║██║██╔══██╗██║   ██║   ██║      ██║     ██╔══██║██╔══██║   ██║   
██║ ╚═╝ ██║██║  ██║██║██████╔╝╚██████╔╝   ██║      ╚██████╗██║  ██║██║  ██║   ██║   
╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝    ╚═╝       ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   
        """
        
        self.console.print(header_text, style=self.colors["primary"])
        self.console.print("促进多元化艺术创作发展普及", style=self.colors["primary"])
        self.console.print("\n🌈麦麦启动器控制台", style=self.colors["primary"])
        self.console.print("——————————", style="bright_black")
        self.console.print("选择选项", style="bright_black")
    
    def show_main_menu(self):
        """显示主菜单"""
        self.clear_screen()
        self.print_header()
        
        self.console.print("====>>启动类<<====")
        self.console.print(" [A] 🚀 运行麦麦", style=self.colors["success"])
        
        self.console.print("====>>配置类<<====")
        self.console.print(" [C] 配置管理（新建/修改/检查配置）", style=self.colors["warning"])
        
        self.console.print("====>>功能类<<====")
        self.console.print(" [D] 知识库构建", style=self.colors["secondary"])
        self.console.print(" [E] 知识库迁移（MongoDB → SQLite）", style="#28DCF0")
        
        self.console.print("====>>部署类<<====")
        self.console.print(" [F] 实例部署辅助系统", style=self.colors["error"])
        
        self.console.print("====>>进程管理<<====")
        self.console.print(" [H] 📊 查看运行状态", style=self.colors["info"])
        
        self.console.print("====>>关于类<<====")
        self.console.print(" [G] 关于本程序", style=self.colors["info"])
        
        self.console.print("====>>退出类<<====")
        self.console.print(" [Q] 👋退出程序", style="#7E1DE4")
    
    def show_config_menu(self):
        """显示配置菜单"""
        self.clear_screen()
        panel = Panel(
            "[🔧 配置模式]",
            style=self.colors["warning"],
            title="配置管理"
        )
        self.console.print(panel)
        
        self.console.print(" [A] 自动检索麦麦", style=self.colors["success"])
        self.console.print(" [B] 手动配置", style=self.colors["success"])
        self.console.print(" [C] 管理配置集(新建/删除)", style=self.colors["info"])
        self.console.print(" [D] 检查现有配置", style=self.colors["info"])
        self.console.print(" [Q] 返回上级", style="#7E1DE4")
    
    def show_instance_list(self, configurations: Dict[str, Any]):
        """显示实例列表"""
        self.console.print("请选择您要使用的实例：", style=self.colors["info"])
        
        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("序号", style="cyan")
        table.add_column("序列号", style="#005CFA")
        table.add_column("昵称", style="#005CFA")
        table.add_column("版本", style="white")
        table.add_column("状态", style="green")
        
        for idx, (cfg_name, cfg) in enumerate(configurations.items(), 1):
            serial_number = cfg.get('serial_number', 'N/A')
            absolute_serial = cfg.get('absolute_serial_number', 'N/A')
            nickname = cfg.get('nickname_path', '未命名')
            version = cfg.get('version_path', 'N/A')
            
            # 简单状态检查
            mai_path = cfg.get('mai_path', '')
            status = "✅ 已配置" if mai_path and os.path.exists(mai_path) else "❌ 未配置"
            
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
        table.add_column("项目", style="cyan")
        table.add_column("值", style="white")
        table.add_column("状态", style="green")
        
        # 基本配置
        items = [
            ("用户序列号", config.get('serial_number', '未配置')),
            ("绝对序列号", str(config.get('absolute_serial_number', '未配置'))),
            ("昵称", config.get('nickname_path', '未配置')),
            ("版本", config.get('version_path', '未配置')),
            ("麦麦本体路径", config.get('mai_path', '未配置')),
        ]
        
        # 获取安装选项
        install_options = config.get('install_options', {})
        
        # 添加组件配置
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
            # 检查路径状态
            if "路径" in name and value not in ["未配置", "已跳过安装"]:
                status = "✅ 存在" if os.path.exists(value) else "❌ 不存在"
            elif value == "已跳过安装":
                status = "⏭️ 跳过"
            else:
                status = "✅ 已设置" if value != "未配置" else "⚠️ 未设置"
            
            table.add_row(name, value, status)
        
        # 显示安装选项
        if install_options:
            self.console.print(table)
            self.console.print("\n[🔧 安装选项]", style=self.colors["info"])
            option_table = Table(show_header=True, header_style="bold magenta")
            option_table.add_column("组件", style="cyan")
            option_table.add_column("安装状态", style="white")
            
            component_names = {
                'install_adapter': '适配器',
                'install_napcat': 'NapCat',
                'install_mongodb': 'MongoDB',
                'install_webui': 'WebUI'
            }
            
            for key, name in component_names.items():
                status = "✅ 已选择" if install_options.get(key, False) else "❌ 已跳过"
                option_table.add_row(name, status)
            
            self.console.print(option_table)
        else:
            self.console.print(table)
    
    def print_success(self, message: str):
        """打印成功消息"""
        self.console.print(f"✅ {message}", style=self.colors["success"])
    
    def print_error(self, message: str):
        """打印错误消息"""
        self.console.print(f"❌ {message}", style=self.colors["error"])
    
    def print_warning(self, message: str):
        """打印警告消息"""
        self.console.print(f"⚠️ {message}", style=self.colors["warning"])
    
    def print_info(self, message: str):
        """打印信息消息"""
        self.console.print(f"ℹ️ {message}", style=self.colors["info"])
    
    def get_input(self, prompt: str, default: str = "") -> str:
        """获取用户输入"""
        return Prompt.ask(prompt, default=default).strip().strip('"')
    
    def get_choice(self, prompt: str, choices: list) -> str:
        """获取用户选择"""
        return ui.get_input(prompt).upper()
    
    def confirm(self, prompt: str) -> bool:
        """获取用户确认"""
        return Confirm.ask(prompt)
    
    def get_confirmation(self, prompt: str) -> bool:
        """获取用户确认（别名方法）"""
        return self.confirm(prompt)
    
    def countdown(self, seconds: int, message: str = "返回主菜单倒计时"):
        """倒计时显示"""
        for i in range(seconds, 0, -1):
            self.console.print(f"\r{message}: {i}秒...", style=self.colors["warning"], end="")
            time.sleep(1)
        self.console.print()
    
    def pause(self, message: str = "按回车键继续..."):
        """暂停等待用户输入"""
        input(message)


# 全局UI实例
ui = UI()
