# -*- coding: utf-8 -*-
"""
UI菜单模块
负责定义和显示各种菜单
"""
from rich.console import Console
from rich.panel import Panel

from .theme import COLORS, SYMBOLS


class Menus:
    """菜单类"""

    def __init__(self, console: Console):
        self.console = console
        self.colors = COLORS
        self.symbols = SYMBOLS

    def print_header(self):
        """打印程序头部"""
        header_text = (
            "&&b         d&&           && 888888ba                                ,ad&&ba,  &&\n"
            "&&&         &&&              &&     8b             &&              d8       8b &&                     &&\n"
            "888b       d888              &&    ,8P             &&             d8'          &&                     &&\n"
            "&& 8b     d8'&& ,adPYYba, && &&aaaa8P    ,adPYba,  &&MMM          &&           &&,dPPYba,  ,adPPYba,  &&MMM\n"
            "&&  8b   d8' &&        && && 8b,   a8   da      ab &&    aaaaaaaa &&           &&P      8a         Y8 &&\n"
            "&&   8b d8'  && ,adPPPP&& && &&     8b  &&      && &&    ******** Y8,          &&       && ,adPPPP&&  &&\n"
            "&&    &&&'   && &&,   ,&& && &&     a8  qa,    ,ap &&,              Y8a.  .a8P &&       && &&,   ,&&  &&,\n"
            "&&           &&  *8bdP Y8 && 888888P'    *q&aa&P*   *Y888             *Y&&Y*   &&       &&  *8bdP Y8   *Y888\n"
        )
        self.console.print(header_text, style=self.colors["header"])
        self.console.print("促进多元化艺术创作发展普及", style=self.colors["header"])
        self.console.print(f"\n{self.symbols['rocket']} 麦麦启动器控制台", style=self.colors["header"])
        self.console.print("——————————", style=self.colors["border"])
        self.console.print("选择选项", style=self.colors["border"])

    def show_main_menu(self):
        """显示主菜单"""
        self.print_header()
        
        self.console.print("====>>启动类<<====")
        self.console.print(f" [A] {self.symbols['rocket']} 运行麦麦", style=self.colors["success"])
        
        self.console.print("====>>配置类<<====")
        self.console.print(f" [C] {self.symbols['config']} 配置管理（新建/修改/检查配置）", style=self.colors["warning"])
        
        self.console.print("====>>功能类<<====")
        self.console.print(f" [D] {self.symbols['knowledge']} 知识库构建", style=self.colors["secondary"])
        self.console.print(f" [E] {self.symbols['database']} 数据库迁移（MongoDB → SQLite）", style=self.colors["secondary"])
        
        self.console.print("====>>部署类<<====")
        self.console.print(f" [F] {self.symbols['deployment']} 实例部署辅助系统", style=self.colors["error"])
        
        self.console.print("====>>进程管理<<====")
        self.console.print(f" [H] {self.symbols['status']} 查看运行状态", style=self.colors["info"])
        
        self.console.print("====>>关于类<<====")
        self.console.print(f" [G] {self.symbols['about']} 关于本程序", style=self.colors["info"])
        
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
        self.console.print(f" [A] {self.symbols['new']} 自动检索麦麦", style=self.colors["success"])
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
        self.console.print(f" [C] {self.symbols['edit']} 可视化编辑配置", style=self.colors["success"])
        self.console.print(f" [D] {self.symbols['validate']} 验证配置", style=self.colors["success"])
        self.console.print(f" [E] {self.symbols['new']} 新建配置集", style=self.colors["success"])
        self.console.print(f" [F] {self.symbols['delete']} 删除配置集", style=self.colors["error"])
        
        self.console.print("====>>返回<<====")
        self.console.print(f" [Q] {self.symbols['back']} 返回上级", style=self.colors["exit"])
