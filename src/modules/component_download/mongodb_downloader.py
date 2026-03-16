# -*- coding: utf-8 -*-
"""
MongoDB下载器
"""

import platform
import os
import subprocess
import ctypes
import requests
import re
from pathlib import Path
from typing import Optional, List
import structlog

from ...ui.interface import ui
from .base_downloader import BaseDownloader

logger = structlog.get_logger(__name__)


class MongoDBDownloader(BaseDownloader):
    """MongoDB下载器"""
    
    def __init__(self):
        super().__init__("MongoDB")
        self.system = platform.system().lower()
        self.arch = platform.machine().lower()
        
        # 标准化架构名称
        if self.arch in ['x86_64', 'amd64']:
            self.arch = 'x86_64'
        elif self.arch in ['arm64', 'aarch64']:
            self.arch = 'arm64'
        else:
            self.arch = 'x86_64'
        
        self.selected_version = None

    def _get_default_versions(self) -> List[str]:
        """获取默认版本列表"""
        return [
            "8.0.4",
            "7.0.15",
            "7.0.4",
            "6.0.19",
            "5.0.30"
        ]

    def fetch_versions(self) -> List[str]:
        """从GitHub API获取版本列表，带重试机制"""
        import time
        
        url = "https://api.github.com/repos/mongodb/mongo/tags"
        max_retries = 3
        retry_delay = 5  # 秒
        
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    ui.print_info(f"重试获取MongoDB版本列表... (尝试 {attempt + 1}/{max_retries})")
                else:
                    ui.print_info("正在从GitHub获取版本列表...")
                
                response = requests.get(url, timeout=10)
                response.raise_for_status()
                tags = response.json()
                versions = []
                for tag in tags:
                    name = tag.get("name", "")
                    # 匹配 rX.Y.Z 格式
                    match = re.match(r"^r(\d+\.\d+\.\d+)$", name)
                    if match:
                        versions.append(match.group(1))
                
                # 简单的版本排序 (倒序)
                try:
                    versions.sort(key=lambda v: [int(x) for x in v.split('.')], reverse=True)
                except Exception:
                    pass # 如果排序失败，保持原样
                    
                return versions
                
            except Exception as e:
                error_msg = str(e)
                if attempt < max_retries - 1:
                    # 还有重试机会
                    ui.print_warning(f"获取版本列表失败: {error_msg}，等待 {retry_delay} 秒后重试...")
                    logger.warning("获取MongoDB版本列表失败，准备重试", 
                                 error=error_msg,
                                 attempt=attempt + 1,
                                 max_retries=max_retries)
                    time.sleep(retry_delay)
                    retry_delay *= 1.5  # 指数退避
                else:
                    # 最后一次尝试失败
                    ui.print_error(f"获取MongoDB版本列表失败（已重试{max_retries}次）：{error_msg}")
                    logger.error("获取MongoDB版本列表失败，重试耗尽", 
                               error=error_msg,
                               total_attempts=max_retries)
                    ui.print_info("将使用默认版本列表")
                    return self._get_default_versions()
        
        # 理论上不会到这里，但作为保险返回默认版本
        return self._get_default_versions()

    def select_version(self) -> Optional[str]:
        """让用户选择版本"""
        using_fallback = False
        
        while True:  # 外层循环，支持重新获取
            versions = self.fetch_versions()
            
            if not versions:
                ui.print_warning("无法获取版本列表，将使用默认版本 7.0.4")
                return "7.0.4"

            # 检查是否是默认版本列表
            default_versions = self._get_default_versions()
            using_fallback = (versions == default_versions)
            
            # 显示版本选择菜单
            ui.clear_screen()
            ui.components.show_title("选择MongoDB版本", symbol="🍃")
            
            # 创建版本表格
            from rich.table import Table
            table = Table(
                show_header=True,
                header_style=ui.colors["table_header"],
                title="[bold]MongoDB 可用版本[/bold]",
                title_style=ui.colors["primary"],
                border_style=ui.colors["border"],
                show_lines=True
            )
            table.add_column("选项", style="cyan", width=6, justify="center")
            table.add_column("版本", style=ui.colors["primary"], width=15)
            table.add_column("推荐度", style="yellow", width=12, justify="center")
            table.add_column("说明", style="green")
            
            # 只显示前10个版本
            display_versions = versions[:10]
            
            # 显示版本信息
            for i, version in enumerate(display_versions):
                # 判断推荐度
                version_parts = [int(x) for x in version.split('.')]
                major = version_parts[0]
                
                if i == 0:
                    recommend = "⭐⭐⭐"
                    desc = "最新稳定版"
                elif major >= 7:
                    recommend = "⭐⭐"
                    desc = "推荐版本"
                elif major >= 6:
                    recommend = "⭐"
                    desc = "稳定版本"
                else:
                    recommend = ""
                    desc = "旧版本"
                
                table.add_row(
                    f"[{i + 1}]",
                    version,
                    recommend,
                    desc
                )
            
            ui.console.print(table)
            
            # 根据是否使用默认版本显示不同提示
            if using_fallback:
                ui.console.print("\n[yellow]⚠ 由于网络问题，当前显示的是默认版本列表[/yellow]", style=ui.colors["warning"])
                ui.console.print("[Enter] 使用默认版本(第一个选项)  [R] 重新获取版本列表  [Q] 取消下载", style=ui.colors["info"])
            else:
                ui.console.print("\n[Enter] 使用默认版本(第一个选项)  [Q] 取消下载", style=ui.colors["info"])
            
            ui.console.print("提示：推荐使用最新稳定版，兼容性更好", style=ui.colors["success"])
            
            while True:  # 内层循环，处理用户选择
                choice = ui.get_input(f"请选择版本序号 (1-{len(display_versions)}，直接回车使用默认): ").strip()
                
                # 如果用户直接按回车，使用默认版本(第一个选项)
                if choice == "":
                    ui.print_info(f"使用默认版本: {display_versions[0]}")
                    return display_versions[0]
                
                if choice.upper() == 'Q':
                    ui.print_info("用户取消MongoDB下载")
                    return None
                
                # 如果是默认版本列表，允许重新获取
                if choice.upper() == 'R' and using_fallback:
                    ui.print_info("正在重新获取版本列表...")
                    break  # 跳出内层循环，重新获取版本
                elif choice.upper() == 'R' and not using_fallback:
                    ui.print_warning("当前版本列表是最新的，无需刷新")
                    continue
                
                try:
                    idx = int(choice) - 1
                    if 0 <= idx < len(display_versions):
                        selected = display_versions[idx]
                        ui.print_info(f"已选择版本: {selected}")
                        return selected
                    else:
                        ui.print_error(f"无效的序号，请输入 1-{len(display_versions)} 之间的数字")
                except ValueError:
                    if using_fallback:
                        ui.print_error("请输入有效的数字、直接回车使用默认版本、或输入 R 重新获取")
                    else:
                        ui.print_error("请输入有效的数字或直接回车使用默认版本")
    
    def get_download_url(self, version: Optional[str] = None) -> str:
        """获取MongoDB下载链接"""
        if not version:
            version = self.selected_version or "7.0.4"
        
        if self.system == 'windows':
            # MongoDB 7.0+ MSI on Windows usually requires -signed suffix
            return f"https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-{version}-signed.msi"
        elif self.system == 'darwin':  # macOS
            return f"https://fastdl.mongodb.org/macos/mongodb-macos-{self.arch}-{version}.dmg"
        else:  # Linux
            return f"https://fastdl.mongodb.org/linux/mongodb-linux-{self.arch}-{version}.tgz"
    
    def get_filename(self, version: Optional[str] = None) -> str:
        """获取下载文件名"""
        if not version:
            version = self.selected_version or "7.0.4"
        
        if self.system == 'windows':
            return f"mongodb-windows-x86_64-{version}-signed.msi"
        elif self.system == 'darwin':
            return f"mongodb-macos-{self.arch}-{version}.dmg"
        else:
            return f"mongodb-linux-{self.arch}-{version}.tgz"
    
    def download_and_install(self, temp_dir: Path, auto_select_latest: bool = False, task_id: str | None = None, progress_cb=None, non_interactive: bool = False, is_canceled_callback=None) -> bool:
        """下载并安装MongoDB
        auto_select_latest/non_interactive: 非交互模式（WebUI使用），自动选最新版
        is_canceled_callback: 可选回调，返回 True 表示任务已取消
        """
        try:
            # 检查是否已取消
            if is_canceled_callback and is_canceled_callback():
                ui.print_warning("下载已取消")
                if progress_cb:
                    progress_cb({"status": "canceled", "phase": "canceled", "message": "已取消"})
                return False

            # 选择版本
            if non_interactive or auto_select_latest:
                # 非交互模式，自动选最新版
                versions = self.get_mongodb_versions()
                self.selected_version = versions[0] if versions else self.DEFAULT_VERSION
                if progress_cb:
                    progress_cb({"phase": "preparing", "status": "running", "percent": 5, "message": "准备中"})
            else:
                self.selected_version = self.select_version()

            # 如果用户取消选择，返回True表示跳过
            if self.selected_version is None:
                ui.print_info("已跳过MongoDB下载")
                if progress_cb:
                    progress_cb({"status": "done", "phase": "skipped", "percent": 100, "message": "已跳过"})
                return True

            ui.print_info(f"已选择版本: {self.selected_version}")

            # 获取下载链接和文件名
            download_url = self.get_download_url(self.selected_version)
            filename = self.get_filename(self.selected_version)
            file_path = temp_dir / filename

            ui.print_info(f"正在下载 {self.name}...")
            if progress_cb:
                progress_cb({"phase": "downloading", "status": "running", "percent": 10, "filename": filename})

            # 下载文件
            if not self.download_file(download_url, str(file_path), progress_callback=progress_cb, is_canceled_callback=is_canceled_callback):
                if progress_cb:
                    progress_cb({"status": "failed", "phase": "failed", "message": "下载失败"})
                return False

            # 检查是否已取消
            if is_canceled_callback and is_canceled_callback():
                ui.print_warning("安装已取消")
                if progress_cb:
                    progress_cb({"status": "canceled", "phase": "canceled", "message": "已取消"})
                return False

            ui.print_info(f"正在安装 {self.name}...")
            if progress_cb:
                progress_cb({"phase": "installing", "status": "running", "percent": 90, "filename": filename, "message": "安装中"})

            # 根据系统执行安装
            if self.system == 'windows':
                success = self._install_mongodb_windows(str(file_path))
            elif self.system == 'darwin':
                # macOS - 提示用户手动安装
                ui.print_info("MongoDB for macOS 需要手动安装")
                ui.print_info(f"请打开下载的文件: {file_path}")
                if not non_interactive and ui.confirm("是否打开MongoDB安装包？"):
                    try:
                        import os
                        os.system(f"open '{file_path}'")
                        ui.print_info("已尝试打开安装包，请按照提示完成安装")
                        success = True
                    except Exception as e:
                        ui.print_error(f"打开安装包失败: {str(e)}")
                        success = False
                else:
                    success = True
            else:
                # Linux - 提示使用包管理器
                ui.print_info("MongoDB for Linux 推荐使用包管理器安装")
                ui.print_info("例如: sudo apt install mongodb (Ubuntu/Debian)")
                ui.print_info("或者: sudo yum install mongodb (CentOS/RHEL)")
                ui.print_info("或者从官方仓库安装最新版本")
                success = True

            if success and progress_cb:
                progress_cb({"status": "done", "phase": "done", "percent": 100, "filename": filename, "message": "完成"})

            return success

        except Exception as e:
            ui.print_error(f"下载 {self.name} 时发生错误：{str(e)}")
            logger.error("MongoDB下载安装失败", error=str(e))
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": str(e)})
            return False
    
    def _install_mongodb_windows(self, msi_path: str) -> bool:
        """在Windows上安装MongoDB（使用msiexec）"""
        try:
            ui.print_info(f"正在运行安装程序: {os.path.basename(msi_path)}")
            
            # 检查文件是否存在
            if not os.path.exists(msi_path):
                ui.print_error(f"安装文件不存在: {msi_path}")
                return False
            
            # 检查是否有管理员权限
            is_admin = ctypes.windll.shell32.IsUserAnAdmin()
            
            if is_admin:
                # 已有管理员权限，直接使用 msiexec 安装
                ui.print_info("正在以管理员权限安装...")
                result = subprocess.run(
                    ["msiexec", "/i", msi_path, "/passive", "/norestart"],
                    capture_output=True,
                    text=True,
                    timeout=300  # 5分钟超时
                )
                
                if result.returncode == 0:
                    ui.print_success(f"{self.name} 安装完成")
                    
                    # 等待安装完成并清理安装包
                    ui.print_info("等待安装程序完全退出...")
                    import time
                    time.sleep(3)  # 等待3秒确保安装程序完全退出
                    
                    return True
                else:
                    ui.print_error(f"安装失败，返回码: {result.returncode}")
                    if result.stderr:
                        ui.print_error(f"错误信息: {result.stderr}")
                    return False
            else:
                # 没有管理员权限，使用 ShellExecute 请求提权
                ui.print_info("正在请求管理员权限...")
                
                # 使用 ShellExecuteW 以管理员身份运行 msiexec
                ret = ctypes.windll.shell32.ShellExecuteW(
                    None,
                    "runas",  # 请求管理员权限
                    "msiexec",
                    f'/i "{msi_path}" /passive /norestart',
                    None,
                    1  # SW_SHOWNORMAL
                )
                
                # 返回值 > 32 表示成功启动
                if ret > 32:
                    ui.print_success(f"{self.name} 安装程序已启动，请等待安装完成")
                    ui.print_info("注意：安装在后台进行，完成后请重新打开终端验证")
                    
                    # 等待一段时间让安装程序启动
                    import time
                    time.sleep(2)
                    
                    return True
                else:
                    error_messages = {
                        0: "系统内存不足",
                        2: "找不到文件",
                        3: "找不到路径",
                        5: "拒绝访问",
                        8: "内存不足",
                        26: "共享错误",
                        27: "文件关联不完整",
                        28: "DDE超时",
                        29: "DDE失败",
                        30: "DDE忙",
                        31: "没有关联的应用程序",
                        32: "DLL未找到",
                    }
                    error_msg = error_messages.get(ret, f"未知错误 (代码: {ret})")
                    ui.print_error(f"启动安装程序失败: {error_msg}")
                    return False
                    
        except subprocess.TimeoutExpired:
            ui.print_error("安装超时")
            return False
        except Exception as e:
            ui.print_error(f"运行安装程序时发生错误：{str(e)}")
            logger.error("安装程序运行异常", installer=msi_path, error=str(e))
            return False
    
    def check_installation(self) -> tuple[bool, str]:
        """检查MongoDB是否已安装"""
        try:
            import subprocess
            result = subprocess.run(
                ["mongod", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                # 解析版本信息
                version_line = result.stdout.split('\n')[0]
                return True, f"MongoDB 已安装，版本: {version_line}"
            else:
                return False, "MongoDB 未安装"
                
        except Exception as e:
            return False, f"检查MongoDB安装状态时发生错误: {str(e)}"