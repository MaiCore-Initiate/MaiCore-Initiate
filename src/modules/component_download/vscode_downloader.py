# -*- coding: utf-8 -*-
"""
Visual Studio Code下载器
"""

import platform
import os
import subprocess
import ctypes
import requests
from pathlib import Path
from typing import Optional, List, Dict
import structlog

from ...ui.interface import ui
from .base_downloader import BaseDownloader

logger = structlog.get_logger(__name__)


class VSCODEDownloader(BaseDownloader):
    """Visual Studio Code下载器"""
    
    def __init__(self):
        super().__init__("VSCode")
        self.system = platform.system().lower()
        self.arch = platform.machine().lower()
        
        # 标准化架构名称
        if self.arch in ['x86_64', 'amd64']:
            self.arch = 'x64'
        elif self.arch in ['arm64', 'aarch64']:
            self.arch = 'arm64'
        else:
            self.arch = 'x64'
    
    def get_vscode_versions(self) -> List[Dict]:
        """获取VSCode版本列表"""
        try:
            ui.print_info("正在获取VSCode最新版本信息...")
            
            # GitHub API获取releases - VSCode不在GitHub发布资产，只获取版本信息
            response = requests.get(
                "https://api.github.com/repos/microsoft/vscode/releases",
                timeout=10
            )
            response.raise_for_status()
            
            releases = response.json()
            ui.print_info(f"获取到 {len(releases)} 个发布版本")
            versions = []
            
            # 处理前10个版本
            for i, release in enumerate(releases[:10]):
                tag_name = release['tag_name']
                version_name = release['name']
                published_at = release['published_at']
                prerelease = release['prerelease']
                
                ui.print_info(f"处理版本 {i+1}: {tag_name} (预发布: {prerelease})")
                
                # 跳过预发布版本
                if prerelease:
                    ui.print_info(f"跳过预发布版本: {tag_name}")
                    continue
                
                # VSCode使用官方下载服务器，不依赖GitHub assets
                # 构建官方下载URL
                if self.system == 'windows':
                    download_url = f"https://update.code.visualstudio.com/{tag_name}/win32-x64/stable"
                    asset_name = f"VSCode-win32-x64-{tag_name}.exe"
                elif self.system == 'darwin':
                    download_url = f"https://update.code.visualstudio.com/{tag_name}/darwin-{self.arch}/stable"
                    asset_name = f"VSCode-darwin-{self.arch}-{tag_name}.zip"
                else:
                    download_url = f"https://update.code.visualstudio.com/{tag_name}/linux-x64/stable"
                    asset_name = f"vscode-linux-x64-{tag_name}.tar.gz"
                
                versions.append({
                    "name": tag_name,
                    "display_name": f"{version_name} ({tag_name})",
                    "description": f"发布于 {published_at[:10]}",
                    "download_url": download_url,
                    "asset_name": asset_name,
                    "version": tag_name,
                    "size": 0  # VSCode官方下载不提供size信息
                })
                ui.print_info(f"添加版本: {tag_name} -> {download_url}")
            
            ui.print_info(f"最终找到 {len(versions)} 个可用版本")
            if not versions:
                # 如果没有找到版本，返回默认版本
                ui.print_warning("未找到任何版本，使用默认版本")
                return self._get_default_versions()
            
            return versions
            
        except requests.exceptions.RequestException as e:
            ui.print_warning(f"网络请求失败: {str(e)}")
            logger.error("GitHub API请求失败", error=str(e))
            return self._get_default_versions()
        except Exception as e:
            ui.print_warning(f"获取VSCode版本列表失败: {str(e)}")
            logger.error("获取VSCode版本列表失败", error=str(e))
            return self._get_default_versions()
    
    def _get_default_versions(self) -> List[Dict]:
        """获取默认版本列表"""
        return [
            {
                "name": "1.106.3",
                "display_name": "VSCode 1.106.3 (推荐)",
                "description": "稳定版本，适合大多数用户",
                "download_url": "https://update.code.visualstudio.com/1.106.3/win32-x64/stable",
                "asset_name": "VSCode-win32-x64-1.106.3.exe",
                "version": "1.106.3"
            }
        ]
    
    def select_version(self) -> Optional[Dict]:
        """选择VSCode版本（非交互，默认最新可用版本）"""
        try:
            versions = self.get_vscode_versions()
            if not versions:
                ui.print_error("未找到可用的VSCode版本")
                return None

            # 直接选择第一个版本（最新稳定），避免交互阻塞
            selected = versions[0]
            ui.print_info("自动选择版本: " + selected["display_name"])
            return selected

        except Exception as e:
            ui.print_error(f"选择VSCode版本时发生错误：{str(e)}")
            logger.error("VSCode版本选择失败", error=str(e))
            return None
    
    def get_download_url(self) -> str:
        """获取VSCode下载链接（兼容性方法）"""
        version = "1.106.3"
        
        if self.system == 'windows':
            return f"https://update.code.visualstudio.com/{version}/win32-x64/stable"
        elif self.system == 'darwin':  # macOS
            return f"https://update.code.visualstudio.com/{version}/darwin-{self.arch}/stable"
        else:  # Linux
            return f"https://update.code.visualstudio.com/{version}/linux-x64/stable"
    
    def get_filename(self) -> str:
        """获取下载文件名（兼容性方法）"""
        if self.system == 'windows':
            return "VSCodeSetup-x64.exe"
        elif self.system == 'darwin':
            return f"VSCode-darwin-{self.arch}.zip"
        else:
            return "vscode-x64.tar.gz"
    
    def download_and_install(self, temp_dir: Path, auto_select_latest: bool = False, task_id: str | None = None, progress_cb=None, non_interactive: bool = False, is_canceled_callback=None) -> bool:
        """下载并安装VSCode
        auto_select_latest=True 时跳过交互，直接选择最新可用版本（用于 WebUI/API 非交互场景）
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
            if auto_select_latest:
                versions = self.get_vscode_versions()
                if not versions:
                    ui.print_info("未找到可用版本，使用默认列表")
                    versions = self._get_default_versions()
                selected_version = versions[0] if versions else None
            else:
                selected_version = self.select_version()

            if not selected_version:
                ui.print_info("已跳过VSCode下载")
                if progress_cb:
                    progress_cb({"status": "done", "phase": "skipped", "percent": 100, "message": "已跳过"})
                return True

            # 获取下载链接和文件名
            download_url = selected_version["download_url"]
            filename = selected_version.get("asset_name", self.get_filename())
            file_path = temp_dir / filename

            ui.print_info(f"正在下载 {self.name} {selected_version['display_name']}...")
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
                progress_cb({"phase": "installing", "status": "running", "percent": 90, "filename": filename, "message": "安装中"})

            ui.print_info(f"正在安装 {self.name}...")

            # 根据系统执行安装
            if self.system == 'windows':
                success = self.run_installer(str(file_path))
            elif self.system == 'darwin':
                extract_dir = temp_dir / "vscode_extract"
                if self.extract_archive(str(file_path), str(extract_dir)):
                    app_files = list(extract_dir.glob("*.app"))
                    success = True if app_files else False
                else:
                    success = False
            else:
                extract_dir = temp_dir / "vscode_extract"
                if self.extract_archive(str(file_path), str(extract_dir)):
                    success = True
                else:
                    success = False

            if success and progress_cb:
                progress_cb({"status": "done", "phase": "done", "percent": 100, "filename": filename, "message": "完成"})

            return success

        except Exception as e:
            ui.print_error(f"下载 {self.name} 时发生错误：{str(e)}")
            logger.error("VSCode下载安装失败", error=str(e))
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": str(e)})
            return False
    
    def check_installation(self) -> tuple[bool, str]:
        """检查VSCode是否已安装"""
        try:
            if self.system == 'windows':
                # 1. 检查注册表 (HKCU 和 HKLM)
                import winreg
                registry_paths = [
                    (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft VSCode"),
                    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft VSCode"),
                    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft VSCode"),
                    # 系统级安装通常使用 UUID，这里尝试几个常见的，但主要依赖路径检测
                    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EA457B21-F73E-4941-80D5-9755D09D5609}_is1")
                ]
                
                for hkey, path in registry_paths:
                    try:
                        with winreg.OpenKey(hkey, path) as key:
                            version, _ = winreg.QueryValueEx(key, "DisplayVersion")
                            return True, f"VSCode 已安装 (注册表), 版本: {version}"
                    except:
                        continue
                
                # 2. 检查可执行文件 (PATH)
                try:
                    import subprocess
                    # 使用 CREATE_NO_WINDOW 避免闪烁
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    
                    # 尝试 shell=True 以支持 cmd/bat 别名
                    result = subprocess.run(
                        "code --version",
                        shell=True,
                        capture_output=True,
                        text=True,
                        timeout=5,
                        startupinfo=startupinfo
                    )
                    
                    if result.returncode == 0:
                        version = result.stdout.strip().split('\n')[0]
                        return True, f"VSCode 已安装 (命令行), 版本: {version}"
                except Exception as e:
                    logger.debug(f"VSCode 命令行检测失败: {e}")
                
                # 3. 检查常见安装路径
                common_paths = [
                    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Programs\Microsoft VS Code\Code.exe'),
                    os.path.join(os.environ.get('PROGRAMFILES', ''), r'Microsoft VS Code\Code.exe'),
                    os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), r'Microsoft VS Code\Code.exe'),
                ]
                
                for path in common_paths:
                    if os.path.exists(path):
                         return True, f"VSCode 已安装 (路径检测)"

                return False, "VSCode 未安装"
            
            else:
                # Linux/macOS - 检查code命令
                import subprocess
                result = subprocess.run(
                    ["code", "--version"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0:
                    version = result.stdout.strip()
                    return True, f"VSCode 已安装，版本: {version}"
                else:
                    return False, "VSCode 未安装"
                    
        except Exception as e:
            return False, f"检查VSCode安装状态时发生错误: {str(e)}"