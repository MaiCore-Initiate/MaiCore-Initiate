# -*- coding: utf-8 -*-
"""
Node.js下载器
"""

import platform
import os
import subprocess
import ctypes
from pathlib import Path
from typing import Optional
import structlog

from ...ui.interface import ui
from .base_downloader import BaseDownloader

logger = structlog.get_logger(__name__)


class NodeJSDownloader(BaseDownloader):
    """Node.js下载器"""
    
    def __init__(self):
        super().__init__("Node.js")
        self.system = platform.system().lower()
        self.arch = platform.machine().lower()
        
        # 标准化架构名称
        if self.arch in ['x86_64', 'amd64']:
            self.arch = 'x64'
        elif self.arch in ['arm64', 'aarch64']:
            self.arch = 'arm64'
        else:
            self.arch = 'x64'  # 默认使用x64
    
    def get_download_url(self) -> str:
        """获取Node.js下载链接"""
        # 使用Node.js官方LTS版本
        if self.system == 'windows':
            return f"https://nodejs.org/dist/v20.11.0/node-v20.11.0-{self.arch}.msi"
        elif self.system == 'darwin':  # macOS
            return f"https://nodejs.org/dist/v20.11.0/node-v20.11.0-{self.arch}.pkg"
        else:  # Linux
            return f"https://nodejs.org/dist/v20.11.0/node-v20.11.0-{self.arch}.tar.gz"
    
    def get_filename(self) -> str:
        """获取下载文件名"""
        if self.system == 'windows':
            return f"nodejs-v20.11.0-{self.arch}.msi"
        elif self.system == 'darwin':
            return f"nodejs-v20.11.0-{self.arch}.pkg"
        else:
            return f"nodejs-v20.11.0-{self.arch}.tar.gz"
    
    def download_and_install(self, temp_dir: Path, auto_select_latest: bool = False, task_id: str | None = None, progress_cb=None, non_interactive: bool = False, is_canceled_callback=None) -> bool:
        """下载并安装Node.js
        auto_select_latest/non_interactive: 非交互模式（WebUI使用）
        is_canceled_callback: 可选回调，返回 True 表示任务已取消
        """
        try:
            # 检查是否已取消
            if is_canceled_callback and is_canceled_callback():
                ui.print_warning("下载已取消")
                if progress_cb:
                    progress_cb({"status": "canceled", "phase": "canceled", "message": "已取消"})
                return False

            # 获取下载链接和文件名
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

            ui.print_info(f"正在安装 {self.name}...")
            if progress_cb:
                progress_cb({"phase": "installing", "status": "running", "percent": 90, "filename": filename, "message": "安装中"})

            # 根据系统执行安装
            if self.system == 'windows':
                success = self._install_nodejs_windows(str(file_path))
            elif self.system == 'darwin':
                success = self.run_installer(str(file_path))
            else:
                success = self._install_from_source(file_path, temp_dir)

            if success and progress_cb:
                progress_cb({"status": "done", "phase": "done", "percent": 100, "filename": filename, "message": "完成"})

            return success

        except Exception as e:
            ui.print_error(f"下载 {self.name} 时发生错误：{str(e)}")
            logger.error("Node.js下载安装失败", error=str(e))
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": str(e)})
            return False
    
    def _install_from_source(self, file_path: Path, temp_dir: Path) -> bool:
        """从源码安装Node.js（Linux）"""
        try:
            ui.print_info("正在解压Node.js源码...")
            
            # 解压源码
            extract_dir = temp_dir / "nodejs_source"
            if not self.extract_archive(str(file_path), str(extract_dir)):
                return False
            
            # 查找解压后的目录
            node_dirs = list(extract_dir.glob("node-v*"))
            if not node_dirs:
                ui.print_error("未找到Node.js源码目录")
                return False
            
            source_dir = node_dirs[0]
            
            ui.print_info(f"正在编译安装Node.js到 {source_dir}...")
            
            # 配置、编译和安装
            configure_cmd = ["./configure", f"--prefix=/usr/local"]
            make_cmd = ["make", "-j", str(os.cpu_count() or 4)]
            install_cmd = ["sudo", "make", "install"]
            
            # 运行配置
            ui.print_info("运行 ./configure...")
            result = subprocess.run(configure_cmd, cwd=source_dir, capture_output=True, text=True)
            if result.returncode != 0:
                ui.print_error(f"配置失败: {result.stderr}")
                return False
            
            # 编译
            ui.print_info("编译Node.js...")
            result = subprocess.run(make_cmd, cwd=source_dir, capture_output=True, text=True)
            if result.returncode != 0:
                ui.print_error(f"编译失败: {result.stderr}")
                return False
            
            # 安装
            ui.print_info("安装Node.js...")
            result = subprocess.run(install_cmd, cwd=source_dir, capture_output=True, text=True)
            if result.returncode != 0:
                ui.print_error(f"安装失败: {result.stderr}")
                return False
            
            ui.print_success(f"{self.name} 安装完成")
            return True
            
        except Exception as e:
            ui.print_error(f"从源码安装 {self.name} 失败：{str(e)}")
            logger.error("Node.js源码安装失败", error=str(e))
            return False
    
    def check_installation(self) -> tuple[bool, str]:
        """检查Node.js是否已安装"""
        try:
            result = subprocess.run(
                ["node", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                version = result.stdout.strip()
                return True, f"Node.js 已安装，版本: {version}"
            else:
                return False, "Node.js 未安装"
                
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False, "Node.js 未安装"
        except Exception as e:
            return False, f"检查安装状态时发生错误: {str(e)}"
    
    def _install_nodejs_windows(self, msi_path: str) -> bool:
        """在Windows上安装Node.js（使用msiexec）"""
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
