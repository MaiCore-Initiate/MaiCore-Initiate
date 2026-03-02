# -*- coding: utf-8 -*-
"""
Python下载器
使用本地安装包
"""

import os
import platform
import shutil
import subprocess
import ctypes
from pathlib import Path
from typing import Optional
import structlog

from ...ui.interface import ui
from .base_downloader import BaseDownloader

logger = structlog.get_logger(__name__)


class PythonDownloader(BaseDownloader):
    """Python下载器"""
    
    def __init__(self):
        super().__init__("Python")
        self.system = platform.system().lower()
        self.arch = platform.machine().lower()
        
        # 标准化架构名称
        if self.arch in ['x86_64', 'amd64']:
            self.arch = 'amd64'
        elif self.arch in ['arm64', 'aarch64']:
            self.arch = 'arm64'
        else:
            self.arch = 'amd64'  # 默认使用amd64
    
    def get_local_installer_path(self) -> Optional[Path]:
        """获取本地安装包路径"""
        # 查找install文件夹中的Python安装包
        install_dir = Path.cwd() / "install"

        if not install_dir.exists():
            ui.print_warning("未找到install目录")
            return None

        # 查找Python安装包（优先 3.13.0）
        python_patterns = [
            "python-3.13.0-amd64.exe",
            "python-3.13.*.exe",
            "python-3.12.*.exe",
            "python-3.*.exe",
            "python*.exe"
        ]

        for pattern in python_patterns:
            matches = list(install_dir.glob(pattern))
            if matches:
                # 选择最新的版本
                matches.sort(key=lambda x: x.stat().st_mtime, reverse=True)
                return matches[0]

        ui.print_error("未找到Python安装包")
        logger.error("Python本地安装包未找到", install_dir=str(install_dir))
        return None

    def get_download_url(self) -> str:
        """获取Python下载链接（备用）"""
        # 如果本地没有安装包，使用官方下载链接
        version = "3.13.0"

        if self.system == 'windows':
            return f"https://www.python.org/ftp/python/{version}/python-{version}-{self.arch}.exe"
        elif self.system == 'darwin':  # macOS
            return f"https://www.python.org/ftp/python/{version}/python-{version}-{self.arch}.pkg"
        else:  # Linux
            return f"https://www.python.org/ftp/python/{version}/Python-{version}.tar.xz"

    def get_filename(self) -> str:
        """获取下载文件名"""
        if self.system == 'windows':
            return f"python-3.13.0-{self.arch}.exe"
        elif self.system == 'darwin':
            return f"python-3.13.0-{self.arch}.pkg"
        else:
            return "python-3.13.0.tar.xz"
    
    def download_and_install(self, temp_dir: Path) -> bool:
        """下载并安装Python"""
        try:
            # 首先尝试使用本地安装包
            local_installer = self.get_local_installer_path()
            
            if local_installer and local_installer.exists():
                ui.print_info(f"发现本地Python安装包: {local_installer}")
                return self._install_from_local(temp_dir, local_installer)
            else:
                ui.print_info("未找到本地安装包，将从官方下载...")
                return self._download_and_install(temp_dir)
            
        except Exception as e:
            ui.print_error(f"安装Python时发生错误：{str(e)}")
            logger.error("Python安装失败", error=str(e))
            return False
    
    def _install_from_local(self, temp_dir: Path, local_installer: Path) -> bool:
        """从本地安装包安装Python"""
        try:
            ui.print_info(f"正在复制本地Python安装包到临时目录...")
            
            # 复制本地安装包到临时目录
            installer_name = f"python_installer_{self.arch}.exe"
            temp_installer = temp_dir / installer_name
            
            # 如果是Windows系统，直接复制安装包
            if self.system == 'windows':
                shutil.copy2(local_installer, temp_installer)
                ui.print_info(f"已复制安装包到: {temp_installer}")
                
                # ✅ 运行安装程序 - 使用专门的方法
                return self._install_python_windows(str(temp_installer))
            
            else:
                # 非Windows系统，提示用户手动安装
                ui.print_info("当前系统不支持自动安装Python")
                ui.print_info(f"请手动安装Python 3.12.8")
                ui.print_info(f"安装包位置: {local_installer}")
                
                # 询问是否打开安装包
                if ui.confirm("是否打开Python安装包？"):
                    try:
                        if self.system == 'darwin':  # macOS
                            os.system(f"open '{local_installer}'")
                        elif self.system == 'linux':
                            os.system(f"xdg-open '{local_installer}'")
                        else:
                            os.startfile(str(local_installer))
                        
                        ui.print_info("已尝试打开安装包，请按照提示完成安装")
                        return True
                    except Exception as e:
                        ui.print_error(f"打开安装包失败: {str(e)}")
                        return False
                
                return True  # 假设用户会手动安装
            
        except Exception as e:
            ui.print_error(f"从本地安装Python失败：{str(e)}")
            logger.error("Python本地安装失败", error=str(e))
            return False
    
    def _download_and_install(self, temp_dir: Path) -> bool:
        """从官方下载并安装Python"""
        try:
            # 获取下载链接和文件名
            download_url = self.get_download_url()
            filename = self.get_filename()
            file_path = temp_dir / filename
            
            ui.print_info(f"正在下载Python安装包...")
            
            # 下载文件
            if not self.download_file(download_url, str(file_path)):
                return False
            
            ui.print_info(f"正在安装Python...")
            
            # 运行安装程序
            return self.run_installer(str(file_path))
            
        except Exception as e:
            ui.print_error(f"下载Python失败：{str(e)}")
            logger.error("Python下载失败", error=str(e))
            return False
    
    def check_installation(self) -> tuple[bool, str]:
        """检查Python是否已安装"""
        try:
            # 检查Python命令
            result = subprocess.run(
                ["python", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                version = result.stdout.strip()
                return True, f"Python 已安装，版本: {version}"
            
            # 检查python3命令
            result = subprocess.run(
                ["python3", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                version = result.stdout.strip()
                return True, f"Python 已安装，版本: {version}"
            
            # 检查py命令（Windows）
            if self.system == 'windows':
                result = subprocess.run(
                    ["py", "--version"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0:
                    version = result.stdout.strip()
                    return True, f"Python 已安装，版本: {version}"
            
            return False, "Python 未安装"
            
        except Exception as e:
            return False, f"检查Python安装状态时发生错误: {str(e)}"
    
    def _install_python_windows(self, installer_path: str) -> bool:
        """在Windows上安装Python（使用msiexec或直接运行exe）"""
        try:
            ui.print_info(f"正在运行安装程序: {os.path.basename(installer_path)}")
            
            # 检查文件是否存在
            if not os.path.exists(installer_path):
                ui.print_error(f"安装文件不存在: {installer_path}")
                return False
            
            # 检查是否有管理员权限
            is_admin = ctypes.windll.shell32.IsUserAnAdmin()
            
            if is_admin:
                # 已有管理员权限，直接安装
                ui.print_info("正在以管理员权限安装...")
                
                # 根据文件类型选择安装方式
                if installer_path.endswith('.msi'):
                    # MSI文件使用msiexec
                    result = subprocess.run(
                        ["msiexec", "/i", installer_path, "/passive", "/norestart"],
                        capture_output=True,
                        text=True,
                        timeout=300  # 5分钟超时
                    )
                else:
                    # EXE文件直接运行
                    result = subprocess.run(
                        [installer_path, "/S"],  # 静默安装参数
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
                
                # 使用 ShellExecuteW 以管理员身份运行安装程序
                ret = ctypes.windll.shell32.ShellExecuteW(
                    None,
                    "runas",  # 请求管理员权限
                    installer_path,
                    "/S" if installer_path.endswith('.exe') else f'/i "{installer_path}" /passive /norestart',
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
            logger.error("安装程序运行异常", installer=installer_path, error=str(e))
            return False