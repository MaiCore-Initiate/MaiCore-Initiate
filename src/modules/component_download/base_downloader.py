# -*- coding: utf-8 -*-
"""
基础下载器类
为所有组件下载器提供通用功能
"""

import os
import requests
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Optional, Tuple
import structlog
from tqdm import tqdm

from ...ui.interface import ui

logger = structlog.get_logger(__name__)


class BaseDownloader:
    """基础下载器类"""
    
    def __init__(self, name: str):
        self.name = name
        self.temp_dir = None
    
    def __enter__(self):
        """上下文管理器入口"""
        self.temp_dir = tempfile.TemporaryDirectory()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        if self.temp_dir:
            self.temp_dir.cleanup()
    
    def download_file(self, url: str, filename: str, max_retries: int = 3, progress_callback=None, is_canceled_callback=None) -> bool:
        """下载文件并显示进度，支持重试
        progress_callback: 可选回调，接收 dict，如 {bytes_downloaded, total_bytes, percent, phase, filename, status}
        is_canceled_callback: 可选回调，返回 True 表示任务已取消，应立即停止下载
        """
        try:
            # 检查网络连接
            response = requests.head(url, timeout=10, verify=False)
            if response.status_code >= 400:
                ui.print_error(f"URL无效或文件不存在: {url}")
                return False
        except requests.RequestException as e:
            ui.print_error(f"网络连接失败: {str(e)}")
            return False

        # 重试逻辑
        for retry in range(max_retries):
            try:
                # 检查是否已取消
                if is_canceled_callback and is_canceled_callback():
                    ui.print_warning("下载已取消")
                    logger.info("下载被用户取消", url=url)
                    return False

                ui.print_info(f"正在下载 {filename}... (尝试 {retry + 1}/{max_retries})")
                logger.info("开始下载文件", url=url, filename=filename, retry=retry+1)

                response = requests.get(url, stream=True, timeout=30, verify=False)
                response.raise_for_status()

                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                if progress_callback:
                    progress_callback({
                        "phase": "downloading",
                        "status": "running",
                        "bytes_downloaded": downloaded,
                        "total_bytes": total_size or None,
                        "percent": 0,
                        "filename": os.path.basename(filename),
                    })

                with open(filename, 'wb') as file, tqdm(
                    desc=filename,
                    total=total_size,
                    unit='iB',
                    unit_scale=True,
                    unit_divisor=1024,
                ) as progress_bar:
                    for chunk in response.iter_content(chunk_size=8192):
                        # 检查是否已取消
                        if is_canceled_callback and is_canceled_callback():
                            ui.print_warning("下载已取消")
                            logger.info("下载被用户取消", url=url)
                            return False

                        if chunk:
                            file.write(chunk)
                            progress_bar.update(len(chunk))
                            downloaded += len(chunk)
                            if progress_callback:
                                percent = 0
                                if total_size:
                                    percent = min(99, int(downloaded / total_size * 100))
                                progress_callback({
                                    "phase": "downloading",
                                    "status": "running",
                                    "bytes_downloaded": downloaded,
                                    "total_bytes": total_size or None,
                                    "percent": percent,
                                    "filename": os.path.basename(filename),
                                })

                # 验证文件大小
                if total_size > 0:
                    actual_size = os.path.getsize(filename)
                    if actual_size < total_size * 0.98:  # 允许2%的误差
                        ui.print_warning(f"文件下载不完整: 预期 {total_size} 字节, 实际 {actual_size} 字节")
                        if retry < max_retries - 1:
                            ui.print_info("将重试下载...")
                            continue
                        else:
                            ui.print_error("达到最大重试次数，文件可能不完整")
                            return False

                ui.print_success(f"{filename} 下载完成")
                logger.info("文件下载完成", filename=filename)
                if progress_callback:
                    progress_callback({
                        "phase": "downloaded",
                        "status": "running",
                        "bytes_downloaded": downloaded,
                        "total_bytes": total_size or None,
                        "percent": 100,
                        "filename": os.path.basename(filename),
                    })
                return True

            except requests.RequestException as e:
                ui.print_warning(f"下载失败 (尝试 {retry + 1}/{max_retries}): {str(e)}")
                logger.warning("文件下载失败", error=str(e), url=url, retry=retry+1)

                if retry < max_retries - 1:
                    ui.print_info("3秒后重试...")
                    import time
                    time.sleep(3)
                    continue
                else:
                    ui.print_error("达到最大重试次数，下载失败")
                    return False

        ui.print_error(f"下载失败：达到最大重试次数 {max_retries}")
        logger.error("文件下载失败", url=url)
        return False
    
    def extract_archive(self, archive_path: str, extract_to: str) -> bool:
        """解压文件"""
        try:
            ui.print_info("正在解压文件...")
            logger.info("开始解压文件", archive=archive_path, target=extract_to)
            
            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                zip_ref.extractall(extract_to)
            
            ui.print_success("解压完成")
            logger.info("文件解压完成")
            return True
            
        except Exception as e:
            ui.print_error(f"解压失败：{str(e)}")
            logger.error("文件解压失败", error=str(e))
            return False
    
    def run_installer(self, installer_path: str, install_args: Optional[list] = None) -> bool:
        """运行安装程序"""
        try:
            ui.print_info(f"正在运行安装程序: {os.path.basename(installer_path)}")
            logger.info("开始运行安装程序", installer=installer_path, args=install_args)
            
            cmd = [installer_path]
            if install_args:
                cmd.extend(install_args)
            
            # 在Windows上静默安装
            if os.name == 'nt':
                if install_args is None:
                    install_args = ['/S']  # 静默安装参数
                cmd = [installer_path] + install_args
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5分钟超时
            )
            
            if result.returncode == 0:
                ui.print_success(f"{self.name} 安装完成")
                logger.info("安装程序运行成功", installer=installer_path)
                return True
            else:
                ui.print_error(f"{self.name} 安装失败")
                if result.stderr:
                    ui.print_error(f"错误信息: {result.stderr}")
                logger.error("安装程序运行失败", installer=installer_path, error=result.stderr)
                return False
                
        except subprocess.TimeoutExpired:
            ui.print_error(f"{self.name} 安装超时")
            logger.error("安装程序超时", installer=installer_path)
            return False
        except Exception as e:
            ui.print_error(f"运行 {self.name} 安装程序时发生错误：{str(e)}")
            logger.error("安装程序运行异常", installer=installer_path, error=str(e))
            return False
    
    def get_download_url(self) -> str:
        """获取下载链接 - 子类必须实现"""
        raise NotImplementedError("子类必须实现 get_download_url 方法")
    
    def get_filename(self) -> str:
        """获取下载文件名 - 子类可以重写"""
        return f"{self.name.lower()}_installer"
    
    def download_and_install(self, temp_dir: Path) -> bool:
        """下载并安装组件 - 子类必须实现"""
        raise NotImplementedError("子类必须实现 download_and_install 方法")
    
    def check_installation(self) -> Tuple[bool, str]:
        """检查组件是否已安装 - 子类可以重写"""
        return False, "检查安装状态的方法未实现"