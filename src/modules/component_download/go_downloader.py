# -*- coding: utf-8 -*-
"""
Go下载器
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


class GoDownloader(BaseDownloader):
    """Go下载器"""
    
    # ✅ 统一版本号
    GO_VERSION = "1.23.5"
    
    def __init__(self):
        super().__init__("Go")
        self.system = platform.system().lower()
        self.arch = platform.machine().lower()
        
        # 标准化架构名称
        if self.arch in ['x86_64', 'amd64']:
            self.arch = 'amd64'
        elif self.arch in ['arm64', 'aarch64']:
            self.arch = 'arm64'
        else:
            self.arch = 'amd64'
    
    def get_download_url(self) -> str:
        """获取Go下载链接"""
        if self.system == 'windows':
            return f"https://go.dev/dl/go{self.GO_VERSION}.windows-{self.arch}.msi"
        elif self.system == 'darwin':  # macOS
            return f"https://go.dev/dl/go{self.GO_VERSION}.darwin-{self.arch}.pkg"
        else:  # Linux
            return f"https://go.dev/dl/go{self.GO_VERSION}.linux-{self.arch}.tar.gz"
    
    def get_filename(self) -> str:
        """获取下载文件名"""
        if self.system == 'windows':
            return f"go{self.GO_VERSION}.windows-{self.arch}.msi"
        elif self.system == 'darwin':
            return f"go{self.GO_VERSION}.darwin-{self.arch}.pkg"
        else:
            return f"go{self.GO_VERSION}.linux-{self.arch}.tar.gz"
    
    def download_and_install(self, temp_dir: Path, auto_select_latest: bool = False, task_id: str | None = None, progress_cb=None, non_interactive: bool = False, is_canceled_callback=None) -> bool:
        """下载并安装Go
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
                success = self._install_go_windows(str(file_path))
            elif self.system == 'darwin':
                success = self.run_installer(str(file_path))
            else:
                success = self._install_go_linux(file_path, temp_dir)

            if success and progress_cb:
                progress_cb({"status": "done", "phase": "done", "percent": 100, "filename": filename, "message": "完成"})

            return success

        except Exception as e:
            ui.print_error(f"下载 {self.name} 时发生错误：{str(e)}")
            logger.error("Go下载安装失败", error=str(e))
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": str(e)})
            return False
    
    def _install_go_windows(self, msi_path: str) -> bool:
        """在Windows上安装Go（使用msiexec）"""
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
    
    def _install_go_linux(self, file_path: Path, temp_dir: Path) -> bool:
        """在Linux上安装Go"""
        try:
            ui.print_info("正在解压Go安装包...")
            
            # 解压到临时目录
            extract_dir = temp_dir / "go_extract"
            if not self.extract_archive(str(file_path), str(extract_dir)):
                return False
            
            # 查找Go目录
            go_dirs = list(extract_dir.glob("go"))
            if not go_dirs:
                ui.print_error("未找到Go目录")
                return False
            
            go_dir = go_dirs[0]
            
            # 移动到系统位置
            target_dir = Path("/usr/local/go")
            
            ui.print_info(f"正在安装Go到 {target_dir}...")
            
            # 需要sudo权限
            # 在某些平台（如Windows）os.geteuid 可能不存在，使用安全检查
            geteuid = getattr(os, "geteuid", None)
            if callable(geteuid):
                is_root = (geteuid() == 0)
            else:
                # 在不支持 geteuid 的平台上（如 Windows），假定不是 root
                is_root = False

            if not is_root:
                ui.print_info("需要sudo权限来安装Go")
                ui.print_info("请手动执行以下命令：")
                ui.print_info(f"sudo rm -rf {target_dir}")
                ui.print_info(f"sudo mv {go_dir} {target_dir}")
                ui.print_info("然后设置环境变量：")
                ui.print_info("export PATH=$PATH:/usr/local/go/bin")
                return True
            else:
                # 移除旧版本
                if target_dir.exists():
                    ui.print_info("移除旧版本Go...")
                    try:
                        import shutil
                        shutil.rmtree(target_dir)
                    except Exception as e:
                        ui.print_error(f"移除旧版本失败: {str(e)}")
                        return False
                
                # 移动新版本
                try:
                    import shutil
                    shutil.move(str(go_dir), str(target_dir))
                except Exception as e:
                    ui.print_error(f"移动Go目录失败: {str(e)}")
                    return False
                
                # 设置环境变量
                ui.print_info("正在设置Go环境变量...")
                self._set_go_environment()
                
                ui.print_success(f"{self.name} 安装完成")
                return True
            
        except Exception as e:
            ui.print_error(f"安装Go失败：{str(e)}")
            logger.error("Go Linux安装失败", error=str(e))
            return False
    
    def _set_go_environment(self):
        """设置Go环境变量"""
        go_home = "/usr/local/go"
        
        # 检查Go安装目录是否存在
        if not Path(go_home).exists():
            ui.print_warning(f"Go安装目录不存在: {go_home}")
            return
        
        # 检查环境变量是否已正确设置
        current_goroot = os.environ.get("GOROOT", "")
        current_gopath = os.environ.get("GOPATH", "")
        current_path = os.environ.get("PATH", "")
        
        needs_update = False
        
        # 检查GOROOT
        if current_goroot != go_home:
            os.environ["GOROOT"] = go_home
            needs_update = True
        
        # 设置GOPATH（如果未设置或需要更新）
        gopath = os.path.expanduser("~/go")
        if current_gopath != gopath:
            os.environ["GOPATH"] = gopath
            needs_update = True
        
        # 创建GOPATH目录
        Path(gopath).mkdir(exist_ok=True)
        
        # 检查PATH是否包含Go bin目录
        go_bin_path = f"{go_home}/bin"
        if go_bin_path not in current_path:
            os.environ["PATH"] = f"{go_bin_path}:{current_path}"
            needs_update = True
        
        if needs_update:
            ui.print_info("正在更新Go环境变量...")
            ui.print_info(f"Go安装路径: {go_home}")
            ui.print_info(f"Go工作目录: {gopath}")
            ui.print_info("请将以下内容添加到您的shell配置文件（如 ~/.bashrc 或 ~/.zshrc）：")
            ui.print_info(f"export GOROOT={go_home}")
            ui.print_info(f"export GOPATH={gopath}")
            ui.print_info(f"export PATH=$PATH:$GOROOT/bin:$GOPATH/bin")
        else:
            ui.print_info("Go环境变量已正确设置")
    
    def check_installation(self) -> tuple[bool, str]:
        """检查Go是否已安装"""
        try:
            result = subprocess.run(
                ["go", "version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                version = result.stdout.strip()
                return True, f"Go 已安装，版本: {version}"
            else:
                return False, "Go 未安装"
                
        except Exception as e:
            return False, f"检查Go安装状态时发生错误: {str(e)}"