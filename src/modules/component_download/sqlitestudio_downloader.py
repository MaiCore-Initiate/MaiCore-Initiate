# -*- coding: utf-8 -*-
"""
SQLiteStudio下载器
"""

import os
import platform
from pathlib import Path
from typing import Optional
import structlog

from ...ui.interface import ui
from .base_downloader import BaseDownloader

logger = structlog.get_logger(__name__)


class SQLiteStudioDownloader(BaseDownloader):
    """SQLiteStudio下载器"""
    
    def __init__(self):
        super().__init__("SQLiteStudio")
        self.system = platform.system().lower()
        self.arch = platform.machine().lower()
        
        # 标准化架构名称
        if self.arch in ['x86_64', 'amd64']:
            self.arch = 'x86_64'
        elif self.arch in ['arm64', 'aarch64']:
            self.arch = 'arm64'
        else:
            self.arch = 'x86_64'
    
    def get_download_url(self) -> str:
        """获取SQLiteStudio下载链接"""
        # SQLiteStudio是跨平台的，通常提供zip包
        version = "3.4.21"

        # 统一使用正确的GitHub用户名
        github_user = "pawelsalawa"

        if self.system == 'windows':
            # 使用小写的zip包名
            return f"https://github.com/{github_user}/sqlitestudio/releases/download/{version}/sqlitestudio-{version}-windows-x64.zip"
        elif self.system == 'darwin':  # macOS
            return f"https://github.com/{github_user}/sqlitestudio/releases/download/{version}/sqlitestudio-{version}-osx.dmg"
        else:  # Linux
            return f"https://github.com/{github_user}/sqlitestudio/releases/download/{version}/sqlitestudio-{version}-linux-x64.tar.xz"

    def get_filename(self) -> str:
        """获取下载文件名"""
        version = "3.4.21"

        if self.system == 'windows':
            return f"sqlitestudio-{version}-windows-x64.zip"
        elif self.system == 'darwin':
            return f"sqlitestudio-{version}-osx.dmg"
        else:
            return f"sqlitestudio-{version}-linux-x64.tar.xz"
    
    def download_and_install(self, temp_dir: Path, auto_select_latest: bool = False, task_id: str | None = None, progress_cb=None, non_interactive: bool = False, is_canceled_callback=None, install_path: str | None = None) -> bool:
        """下载并安装SQLiteStudio（非交互，默认指定版本）
        is_canceled_callback: 可选回调，返回 True 表示任务已取消
        install_path: 用户指定的安装目录
        """
        try:
            # 检查是否已取消
            if is_canceled_callback and is_canceled_callback():
                ui.print_warning("下载已取消")
                if progress_cb:
                    progress_cb({"status": "canceled", "phase": "canceled", "message": "已取消"})
                return False

            # 获取下载链接和文件名（固定最新/指定版本）
            download_url = self.get_download_url()
            filename = self.get_filename()
            file_path = temp_dir / filename

            ui.print_info(f"正在下载 {self.name}...")
            if progress_cb:
                progress_cb({"phase": "preparing", "status": "running", "percent": 5, "filename": filename})

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

            if progress_cb:
                progress_cb({"phase": "installing", "status": "running", "percent": 80, "filename": filename, "message": "解压中"})

            ui.print_info(f"正在解压 {self.name}...")

            # 确定解压目标目录
            if install_path:
                extract_dir = Path(install_path)
                extract_dir.mkdir(parents=True, exist_ok=True)
            else:
                extract_dir = temp_dir / "SQLiteStudio_extract"

            # 解压文件
            if self.extract_archive(str(file_path), str(extract_dir)):
                ui.print_success(f"SQLiteStudio已解压到: {extract_dir}")
                if progress_cb:
                    progress_cb({"status": "done", "phase": "done", "percent": 100, "filename": filename, "message": f"已解压到 {extract_dir}"})
                return True
            else:
                ui.print_error("解压失败")
                if progress_cb:
                    progress_cb({"status": "failed", "phase": "failed", "percent": 90, "filename": filename, "message": "解压失败"})
                return False

        except Exception as e:
            ui.print_error(f"下载 {self.name} 时发生错误：{str(e)}")
            logger.error("SQLiteStudio下载安装失败", error=str(e))
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": str(e)})
            return False
    
    def _create_desktop_shortcut(self, exe_path: Path):
        """创建桌面快捷方式"""
        try:
            import os
            from pathlib import Path
            
            # 获取桌面路径
            desktop = Path.home() / "Desktop"
            if not desktop.exists():
                desktop = Path.home() / "桌面"  # 中文Windows
            
            if not desktop.exists():
                ui.print_warning("未找到桌面目录")
                return
            
            # 创建快捷方式文件
            shortcut_content = f"""[Desktop Entry]
Version=1.0
Type=Application
Name=SQLiteStudio
Comment=SQLite Database Manager
Exec="{exe_path}"
Icon={exe_path.parent / "SQLiteStudio.png" if (exe_path.parent / "SQLiteStudio.png").exists() else ""}
Terminal=false
Categories=Development;Database;
"""
            
            shortcut_file = desktop / "SQLiteStudio.desktop"
            
            with open(shortcut_file, 'w', encoding='utf-8') as f:
                f.write(shortcut_content)
            
            # 在Linux上需要设置执行权限
            if self.system == 'linux':
                os.chmod(shortcut_file, 0o755)
            
            ui.print_success("桌面快捷方式已创建")
            
        except Exception as e:
            ui.print_warning(f"创建桌面快捷方式失败: {str(e)}")
    
    def check_installation(self) -> tuple[bool, str]:
        """检查SQLiteStudio是否已安装"""
        try:
            import subprocess
            
            # 检查常见安装位置
            possible_paths = [
                "sqlitestudio",
                "SQLiteStudio",
                "/usr/bin/sqlitestudio",
                "/usr/local/bin/sqlitestudio",
                os.path.expanduser("~/SQLiteStudio/sqlitestudio"),
                os.path.expanduser("~/Desktop/SQLiteStudio.desktop")
            ]
            
            for path in possible_paths:
                if os.path.exists(path):
                    return True, f"SQLiteStudio 已安装，位置: {path}"
            
            # 尝试运行命令
            try:
                result = subprocess.run(
                    ["sqlitestudio", "--version"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0:
                    version = result.stdout.strip()
                    return True, f"SQLiteStudio 已安装，版本: {version}"
                    
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass
            
            return False, "SQLiteStudio 未安装"
            
        except Exception as e:
            return False, f"检查SQLiteStudio安装状态时发生错误: {str(e)}"