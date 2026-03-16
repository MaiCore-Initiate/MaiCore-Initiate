# -*- coding: utf-8 -*-
"""
UI菜单模块
负责定义和显示各种菜单
"""
import json
import random
from pathlib import Path
from rich.console import Console
from rich.panel import Panel

from .theme import COLORS, SYMBOLS


class Menus:
    """菜单类"""

    def __init__(self, console: Console):
        self.console = console
        self.colors = COLORS
        self.symbols = SYMBOLS
        self.daily_quote = self._load_daily_quote()

    def _load_daily_quote(self):
        """从JSON文件加载随机每日一言"""
        try:
            # 获取项目根目录路径
            project_root = Path(__file__).parent.parent.parent
            quote_file = project_root / "data" / "Golden_sentence.json"
            
            with open(quote_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                quotes = data.get("goldenQuotes", [])
                if quotes:
                    return random.choice(quotes)["content"]
                else:
                    return "促进多元化艺术创作发展普及"
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            # 如果文件不存在或解析失败，返回默认文字
            return "促进多元化艺术创作发展普及"

    def refresh_daily_quote(self):
        """刷新每日一言"""
        self.daily_quote = self._load_daily_quote()
        return self.daily_quote

    def print_header(self):
        """打印程序头部"""
        header_text = (
 """
ooo        ooooo  .oooooo.           .oooooo..o     .                          .   
 &&.       .&&&` d&P`  `Y&b         d&P`    `Y&   .o&                        .o&  
 &&&b     d'&&& &&&                 Y&&bo.      .o&&&oo  .oooo.   ooo  q&b .o&&&oo
 & Y&&. .P  &&& &&&         &&&&&&&  `*Y&&&&o.    &&&   `P  )&&   `&&&``&P   &&&  
 &  `&&&'   &&& &&&         *******      `“Y&&b   &&&    .oP&&&    &&&       &&&  
 &    Y     &&& `&&b    ooo         oo     .d&P   &&& . d&(  &&&   &&&       &&& .
o&o        o&&&o `Y&bood&P'         &*`&&&&&P'    `&&&` `Y&&&``qo d&&&b      `&&&`
"""
        )
        self.console.print(header_text, style=self.colors["header"])
        # 每日一言和刷新选项在同一行显示,用 | 分割,使用斜体
        self.console.print(f"[italic]{self.daily_quote} | [R] {self.symbols['refresh']} 刷新[/italic]", style=self.colors["header"])
        self.console.print(f"\n{self.symbols['rocket']} 麦麦核心启动器控制台", style=self.colors["header"])
        self.console.print("——————————", style=self.colors["border"])

    def show_main_menu(self, has_active_instance: bool = False):
        """显示主菜单
        
        Args:
            has_active_instance: 是否有活跃实例，用于决定显示"运行实例"还是"实例多开"
        """
        self.print_header()
        
        self.console.print("====>>启动类<<====")
        if has_active_instance:
            self.console.print(f" [A] {self.symbols['rocket']} 实例多开", style=self.colors["success"])
        else:
            self.console.print(f" [A] {self.symbols['rocket']} 运行实例", style=self.colors["success"])
        
        self.console.print("====>>配置类<<====")
        self.console.print(f" [B] {self.symbols['config']} 配置管理（新建/修改/检查配置）", style=self.colors["warning"])
        
        self.console.print("====>>功能类<<====")
        self.console.print(f" [C] {self.symbols['knowledge']} 知识库构建", style=self.colors["secondary"])
        self.console.print(f" [D] {self.symbols['database']} 数据库迁移（MongoDB → SQLite）", style=self.colors["secondary"])
        self.console.print(f" [E] {self.symbols['plugin']} 插件管理（目前只支持MaiBot）", style=self.colors["primary"])
        
        self.console.print("====>>部署类<<====")
        self.console.print(f" [F] {self.symbols['deployment']} 实例部署辅助系统", style=self.colors["error"])
        
        self.console.print("====>>进程管理<<====")
        self.console.print(f" [G] {self.symbols['status']} 查看运行状态", style=self.colors["info"])
        
        self.console.print("====>>杂项类<<====")
        self.console.print(f" [H] {self.symbols['config']} 杂项（关于/程序设置）", style=self.colors["info"])
        
        self.console.print("====>>退出类<<====")
        self.console.print(f" [Q] {self.symbols['quit']} 退出程序", style=self.colors["exit"])

    def show_config_menu(self):
        """显示配置菜单"""
        panel = Panel(
            f"[{self.symbols['config']} 配置管理]",
            style=self.colors["warning"],
            title="配置管理"
        )
        self.console.print(panel)
        
        self.console.print("====>>配置新建<<====")
        self.console.print(f" [A] {self.symbols['new']} 自动检索实例", style=self.colors["success"])
        self.console.print(f" [B] {self.symbols['edit']} 手动配置", style=self.colors["success"])
        
        self.console.print("====>>配置管理<<====")
        self.console.print(f" [C] {self.symbols['config']} 配置管理（查看/编辑/删除配置）", style=self.colors["info"])
        
        self.console.print("====>>返回<<====")
        self.console.print(f" [Q] {self.symbols['back']} 返回上级", style=self.colors["exit"])

    def show_config_management_menu(self):
        """显示统一的配置管理菜单"""
        panel = Panel(
            f"[{self.symbols['config']} 配置管理]",
            style=self.colors["info"],
            title="配置管理"
        )
        self.console.print(panel)
        
        self.console.print("====>>配置操作<<====")
        self.console.print(f" [A] {self.symbols['view']} 查看配置详情", style=self.colors["info"])
        self.console.print(f" [B] {self.symbols['edit']} 直接编辑配置", style=self.colors["warning"])
        self.console.print(f" [C] {self.symbols['view']} 可视化编辑配置", style=self.colors["success"])
        self.console.print(f" [D] {self.symbols['validate']} 验证配置", style=self.colors["success"])
        self.console.print(f" [E] {self.symbols['new']} 新建配置集", style=self.colors["success"])
        self.console.print(f" [F] {self.symbols['delete']} 删除配置集", style=self.colors["error"])
        self.console.print(f" [G] {self.symbols['edit']} 打开实例配置文件", style=self.colors["info"])
        self.console.print(f" [H] {self.symbols['folder']} 打开实例所在目录", style=self.colors["info"])
        
        self.console.print("====>>返回<<====")
        self.console.print(f" [Q] {self.symbols['back']} 返回上级", style=self.colors["exit"])

    def show_instance_plugin_menu(self, instance_name: str):
        """显示实例的插件管理菜单"""
        panel = Panel(
            f"[{self.symbols['plugin']} 插件管理: {instance_name}]",
            style=self.colors["primary"],
            title="插件管理"
        )
        self.console.print(panel)
        
        self.console.print("====>> 插件操作 <<====")
        self.console.print(f" [A] {self.symbols['new']} 安装新插件", style=self.colors["success"])
        self.console.print(f" [B] {self.symbols['delete']} 卸载已安装的插件", style=self.colors["error"])
        self.console.print(f" [C] {self.symbols['view']} 查看已安装插件列表", style=self.colors["info"])
        
        self.console.print("====>> 返回 <<====")
        self.console.print(f" [Q] {self.symbols['back']} 返回主菜单", style=self.colors["exit"])

    def show_misc_menu(self):
        """显示杂项菜单"""
        panel = Panel(
            f"[{self.symbols['config']} 杂项]",
            style=self.colors["info"],
            title="杂项"
        )
        self.console.print(panel)

        self.console.print("====>>功能<<====")
        self.console.print(f" [A] {self.symbols['about']} 关于本程序", style=self.colors["info"])
        self.console.print(f" [B] {self.symbols['edit']} 程序设置", style=self.colors["warning"])
        self.console.print(f" [C] {self.symbols['download']} 组件下载", style=self.colors["success"])
        self.console.print(f" [D] {self.symbols['status']} 查看实例运行数据", style=self.colors["secondary"])
        self.console.print(f" [E] {self.symbols['key']} 查看WebUI Token", style=self.colors["primary"])
        self.console.print(f" [F] 🔄 重启WebUI服务器", style="#FFA500")

        self.console.print("====>>返回<<====")
        self.console.print(f" [Q] {self.symbols['back']} 返回上级", style=self.colors["exit"])

    def show_program_settings_menu(
        self,
        current_colors: dict,
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
        from rich.table import Table
        panel = Panel(
            f"[{self.symbols['edit']} 程序设置]",
            style=self.colors["warning"],
            title="程序设置"
        )
        self.console.print(panel)
        
        self.console.print("在这里，你可以自定义启动器的外观主题、日志设置和网络代理。")

        # 显示日志保留天数
        self.console.print("\n[bold]日志设置[/bold]")
        self.console.print(f"  日志文件保留天数: [bold yellow]{current_log_days}[/bold yellow] 天")
        
        # 显示退出设置
        self.console.print("\n[bold]退出设置[/bold]")
        action_map = {"ask": "询问", "terminate": "一律关闭", "keep": "一律保留"}
        self.console.print(f"  退出时对机器人进程的操作: [bold yellow]{action_map.get(on_exit_action, '未知')}[/bold yellow]")

        # 显示托盘设置
        self.console.print("\n[bold]托盘设置[/bold]")
        tray_status = "开启" if minimize_to_tray_enabled else "关闭"
        self.console.print(f"  最小化到系统托盘: [bold yellow]{tray_status}[/bold yellow]")

        # 显示通知设置
        self.console.print("\n[bold]通知设置[/bold]")
        notify_status = "开启" if notifications_enabled else "关闭"
        self.console.print(f"  Windows 通知中心推送: [bold yellow]{notify_status}[/bold yellow]")

        # 显示监控刷新设置
        self.console.print("\n[bold]进程监控刷新设置[/bold]")
        self.console.print(f"  数据刷新间隔: [bold yellow]{monitor_data_interval:.2f}[/bold yellow] 秒")
        self.console.print(f"  UI刷新间隔: [bold yellow]{monitor_ui_interval:.2f}[/bold yellow] 秒")
        self.console.print(f"  输入轮询间隔: [bold yellow]{monitor_input_interval:.2f}[/bold yellow] 秒")

        # 显示代理设置
        self.console.print("\n[bold]网络代理设置[/bold]")
        proxy_status = "已启用" if proxy_enabled else "未启用"
        proxy_color = "green" if proxy_enabled else "red"
        self.console.print(f"  代理状态: [bold {proxy_color}]{proxy_status}[/bold {proxy_color}]")
        if proxy_enabled and proxy_host and proxy_port:
            self.console.print(f"  代理类型: [bold cyan]{proxy_type.upper()}[/bold cyan]")
            self.console.print(f"  代理地址: [bold cyan]{proxy_host}:{proxy_port}[/bold cyan]")
        elif proxy_enabled:
            self.console.print(f"  [bold red]⚠ 代理已启用但配置不完整[/bold red]")

        # 显示当前颜色设置
        table = Table(title="当前主题颜色", show_header=True, header_style="bold magenta")
        table.add_column("选项", style="dim", width=6)
        table.add_column("颜色名称", style="cyan")
        table.add_column("颜色值", style="yellow")

        color_keys = list(current_colors.keys())
        for i, key in enumerate(color_keys):
            value = current_colors[key]
            table.add_row(str(i + 1), key, f"[{value}]{value}[/]")
        self.console.print(table)

        self.console.print("\n====>>操作<<====")
        self.console.print(f" [L] {self.symbols['edit']} 修改日志保留天数", style=self.colors["success"])
        self.console.print(f" [E] {self.symbols['edit']} 修改退出时操作", style=self.colors["success"])
        self.console.print(f" [C] {self.symbols['edit']} 修改颜色 (输入选项数字)", style=self.colors["success"])
        self.console.print(f" [T] {self.symbols['edit']} 切换最小化到托盘", style=self.colors["secondary"])
        self.console.print(f" [N] {self.symbols['edit']} 切换Windows通知", style=self.colors["primary"])
        self.console.print(f" [M] {self.symbols['edit']} 设置进程监控刷新间隔", style=self.colors["info"])
        self.console.print(f" [P] {self.symbols['config']} 配置网络代理", style=self.colors["info"])
        self.console.print(f" [R] {self.symbols['back']} 恢复默认设置", style=self.colors["error"])
        
        self.console.print("====>>返回<<====")
        self.console.print(f" [Q] {self.symbols['back']} 返回上级", style=self.colors["exit"])

    def show_proxy_config_menu(
        self,
        proxy_enabled: bool = False,
        proxy_type: str = "http",
        proxy_host: str = "",
        proxy_port: str = "",
        proxy_username: str = "",
        has_password: bool = False,
        exclude_hosts: str = "",
    ):
        """显示代理配置菜单"""
        panel = Panel(
            f"[{self.symbols['config']} 网络代理配置]",
            style=self.colors["info"],
            title="网络代理配置"
        )
        self.console.print(panel)
        
        # 显示当前配置
        self.console.print("\n[bold]当前代理配置[/bold]")
        proxy_status = "✓ 已启用" if proxy_enabled else "✗ 未启用"
        proxy_color = "green" if proxy_enabled else "red"
        self.console.print(f"  状态: [bold {proxy_color}]{proxy_status}[/bold {proxy_color}]")
        self.console.print(f"  类型: [cyan]{proxy_type.upper() if proxy_type else '(未设置)'}[/cyan]")
        self.console.print(f"  主机: [cyan]{proxy_host if proxy_host else '(未设置)'}[/cyan]")
        self.console.print(f"  端口: [cyan]{proxy_port if proxy_port else '(未设置)'}[/cyan]")
        self.console.print(f"  用户名: [cyan]{proxy_username if proxy_username else '(未设置)'}[/cyan]")
        self.console.print(f"  密码: [cyan]{'已设置' if has_password else '(未设置)'}[/cyan]")
        self.console.print(f"  排除主机: [cyan]{exclude_hosts if exclude_hosts else 'localhost,127.0.0.1'}[/cyan]")
        
        # 常见配置示例
        self.console.print("\n[bold]💡 常见代理软件配置参考[/bold]")
        self.console.print("  • Clash:       HTTP    127.0.0.1:7890")
        self.console.print("  • V2rayN:      SOCKS5  127.0.0.1:10808")
        self.console.print("  • Shadowsocks: SOCKS5  127.0.0.1:1080")
        
        self.console.print("\n====>>代理操作<<====")
        if proxy_enabled:
            self.console.print(f" [D] {self.symbols['delete']} 禁用代理", style=self.colors["error"])
        else:
            self.console.print(f" [E] {self.symbols['new']} 启用代理", style=self.colors["success"])
        
        self.console.print(f" [1] {self.symbols['edit']} 设置代理类型 (HTTP/HTTPS/SOCKS5/SOCKS4)", style=self.colors["warning"])
        self.console.print(f" [2] {self.symbols['edit']} 设置代理主机", style=self.colors["warning"])
        self.console.print(f" [3] {self.symbols['edit']} 设置代理端口", style=self.colors["warning"])
        self.console.print(f" [4] {self.symbols['edit']} 设置用户名 (可选)", style=self.colors["secondary"])
        self.console.print(f" [5] {self.symbols['edit']} 设置密码 (可选)", style=self.colors["secondary"])
        self.console.print(f" [6] {self.symbols['edit']} 设置排除主机", style=self.colors["secondary"])
        self.console.print(f" [T] {self.symbols['status']} 测试代理连接", style=self.colors["info"])
        
        self.console.print("\n====>>快速配置<<====")
        self.console.print(f" [C] {self.symbols['rocket']} 快速配置 Clash 代理 (127.0.0.1:7890)", style=self.colors["primary"])
        self.console.print(f" [V] {self.symbols['rocket']} 快速配置 V2rayN 代理 (127.0.0.1:10808)", style=self.colors["primary"])
        self.console.print(f" [S] {self.symbols['rocket']} 快速配置 Shadowsocks 代理 (127.0.0.1:1080)", style=self.colors["primary"])
        
        self.console.print("\n====>>返回<<====")
        self.console.print(f" [Q] {self.symbols['back']} 返回上级", style=self.colors["exit"])
