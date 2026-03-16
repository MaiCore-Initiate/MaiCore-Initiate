# -*- coding: utf-8 -*-
"""
WebUI下载器
负责下载和安装MaiBot WebUI组件
"""

import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Optional
import structlog

from ...ui.interface import ui
from .base_downloader import BaseDownloader

logger = structlog.get_logger(__name__)


class WebUIDownloader(BaseDownloader):
    """WebUI下载器"""
    
    def __init__(self):
        super().__init__("WebUI")
        self.repo = "Mai-with-u/MaiBot-Dashboard"
        self.component_name = "MaiBot WebUI"
        
    def get_download_url(self, branch: str = "main") -> str:
        """获取下载URL"""
        return f"https://codeload.github.com/{self.repo}/zip/refs/heads/{branch}"
    
    def get_available_branches(self) -> list:
        """获取可用的分支列表"""
        try:
            import requests
            url = f"https://api.github.com/repos/{self.repo}/branches"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            branches = response.json()
            return [branch["name"] for branch in branches]
        except Exception as e:
            logger.warning("获取分支列表失败，使用默认分支", error=str(e))
            return ["main", "dev"]
    
    def select_branch(self) -> str:
        """选择分支"""
        branches = self.get_available_branches()
        
        ui.console.print("\n[🌐 选择WebUI分支]", style=ui.colors["primary"])
        ui.console.print("请选择要下载的WebUI分支：")
        
        for i, branch in enumerate(branches, 1):
            description = "主分支（推荐）" if branch == "main" else f"{branch}分支"
            ui.console.print(f" [{i}] {branch} - {description}")
        
        ui.console.print(" [Q] 返回", style=ui.colors["exit"])
        
        while True:
            choice = ui.get_input("请选择分支: ").strip().upper()
            
            if choice == 'Q':
                return "main"  # 默认返回main
            
            try:
                index = int(choice) - 1
                if 0 <= index < len(branches):
                    return branches[index]
                else:
                    ui.print_error("无效选项，请重新选择")
            except ValueError:
                ui.print_error("请输入有效数字")
    
    def download_and_install(self, temp_dir: Path, auto_select_latest: bool = False, task_id: str | None = None, progress_cb=None, non_interactive: bool = False, is_canceled_callback=None) -> bool:
        """下载并安装WebUI
        auto_select_latest/non_interactive: 非交互模式（WebUI使用），自动选 main 分支
        is_canceled_callback: 可选回调，返回 True 表示任务已取消
        """
        try:
            # 检查是否已取消
            if is_canceled_callback and is_canceled_callback():
                ui.print_warning("下载已取消")
                if progress_cb:
                    progress_cb({"status": "canceled", "phase": "canceled", "message": "已取消"})
                return False

            # 选择分支
            if non_interactive or auto_select_latest:
                branch = "main"  # 非交互模式默认 main 分支
                if progress_cb:
                    progress_cb({"phase": "preparing", "status": "running", "percent": 5, "message": "准备中"})
            else:
                branch = self.select_branch()
                if not branch:
                    return False

            ui.print_info(f"正在下载WebUI {branch}分支...")

            # 下载文件
            download_url = self.get_download_url(branch)
            archive_path = temp_dir / f"webui_{branch}.zip"

            if progress_cb:
                progress_cb({"phase": "downloading", "status": "running", "percent": 10, "filename": f"webui_{branch}.zip"})

            if not self.download_file(download_url, str(archive_path), progress_callback=progress_cb, is_canceled_callback=is_canceled_callback):
                ui.print_error("WebUI下载失败")
                if progress_cb:
                    progress_cb({"status": "failed", "phase": "failed", "message": "下载失败"})
                return False

            # 检查是否已取消
            if is_canceled_callback and is_canceled_callback():
                ui.print_warning("安装已取消")
                if progress_cb:
                    progress_cb({"status": "canceled", "phase": "canceled", "message": "已取消"})
                return False

            # 解压文件
            extract_dir = temp_dir / f"webui_extract_{branch}"
            extract_dir.mkdir(exist_ok=True)

            ui.print_info("正在解压WebUI...")
            if progress_cb:
                progress_cb({"phase": "installing", "status": "running", "percent": 80, "message": "解压中"})

            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)

            # 查找解压后的目录
            extracted_dirs = [
                d for d in extract_dir.iterdir()
                if d.is_dir() and "MaiBot-Dashboard" in d.name
            ]

            if not extracted_dirs:
                ui.print_error("解压后未找到WebUI目录")
                if progress_cb:
                    progress_cb({"status": "failed", "phase": "failed", "message": "解压失败"})
                return False

            source_dir = extracted_dirs[0]

            # 选择安装目录
            default_dir = Path.cwd() / "webui_components" / f"MaiBot-Dashboard-{branch}"
            if non_interactive:
                install_dir = default_dir
            else:
                ui.console.print("\n[📁 选择安装目录]", style=ui.colors["primary"])
                ui.print_info(f"默认安装目录: {default_dir}")
                install_dir_input = ui.get_input("请输入安装目录（回车使用默认）: ").strip()
                install_dir = Path(install_dir_input) if install_dir_input else default_dir

            # 创建安装目录
            if install_dir.exists():
                if non_interactive or ui.confirm(f"目录已存在，是否覆盖？{install_dir}"):
                    shutil.rmtree(install_dir)
                else:
                    ui.print_info("已取消安装")
                    if progress_cb:
                        progress_cb({"status": "canceled", "phase": "canceled", "message": "用户取消"})
                    return False

            install_dir.parent.mkdir(parents=True, exist_ok=True)

            # 复制文件
            ui.print_info("正在安装WebUI文件...")
            if progress_cb:
                progress_cb({"phase": "installing", "status": "running", "percent": 90, "message": "安装中"})

            shutil.copytree(source_dir, install_dir)

            ui.print_success(f"✅ WebUI安装完成")
            ui.console.print(f"安装路径: {install_dir}", style=ui.colors["info"])

            # 安装依赖
            if self._install_dependencies(install_dir):
                ui.print_success("✅ WebUI依赖安装完成")
            else:
                ui.print_warning("⚠️ WebUI依赖安装失败，但文件已安装")
                ui.print_info("可以稍后手动在WebUI目录中执行: npm install bun && bun install")

            if progress_cb:
                progress_cb({"status": "done", "phase": "done", "percent": 100, "message": "完成"})

            return True

        except Exception as e:
            ui.print_error(f"WebUI安装失败: {str(e)}")
            logger.error("WebUI安装失败", error=str(e))
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": str(e)})
            return False
    
    def _install_dependencies(self, webui_dir: Path) -> bool:
        """安装WebUI依赖"""
        try:
            ui.print_info("正在检查Node.js环境...")
            
            # 检查Node.js
            import subprocess
            try:
                result = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=10)
                if result.returncode != 0:
                    ui.print_warning("未检测到Node.js，跳过依赖安装")
                    return False
                node_version = result.stdout.strip()
                ui.print_success(f"Node.js版本: {node_version}")
            except (subprocess.TimeoutExpired, FileNotFoundError):
                ui.print_warning("Node.js不可用，跳过依赖安装")
                return False
            
            # 检查npm
            try:
                result = subprocess.run(["npm", "--version"], capture_output=True, text=True, timeout=10)
                if result.returncode != 0:
                    ui.print_warning("未检测到npm，跳过依赖安装")
                    return False
                npm_version = result.stdout.strip()
                ui.print_success(f"npm版本: {npm_version}")
            except (subprocess.TimeoutExpired, FileNotFoundError):
                ui.print_warning("npm不可用，跳过依赖安装")
                return False
            
            # 安装bun
            ui.print_info("正在安装bun运行时...")
            result = subprocess.run(
                ["npm", "install", "bun"],
                cwd=webui_dir,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode != 0:
                ui.print_warning("bun安装失败，尝试直接使用bun install")
                # 继续尝试bun install，即使npm install bun失败
            
            # 使用bun安装依赖
            ui.print_info("正在安装WebUI依赖...")
            result = subprocess.run(
                ["npx", "--yes", "bun", "install"],
                cwd=webui_dir,
                capture_output=True,
                text=True,
                timeout=600
            )
            
            if result.returncode == 0:
                return True
            else:
                ui.print_warning(f"依赖安装输出: {result.stdout}")
                ui.print_warning(f"依赖安装错误: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            ui.print_warning("依赖安装超时")
            return False
        except Exception as e:
            ui.print_warning(f"依赖安装失败: {str(e)}")
            return False
    
    def get_component_info(self) -> dict:
        """获取组件信息"""
        return {
            "name": "MaiBot WebUI",
            "description": "MaiBot控制面板Web界面",
            "version": "最新",
            "size": "约50MB",
            "requirements": ["Node.js", "npm"],
            "repository": f"https://github.com/{self.repo}",
            "default_port": 7999,
            "access_url": "http://localhost:7999"
        }