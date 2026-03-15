# -*- coding: utf-8 -*-
"""
桌宠下载器
下载并安装 MCStart Desktop Pet
"""

import os
import requests
import subprocess
from pathlib import Path
from typing import Dict, Optional
import structlog

from ...ui.interface import ui
from .base_downloader import BaseDownloader

logger = structlog.get_logger(__name__)


class DesktopPetDownloader(BaseDownloader):
    """桌宠下载器"""

    def __init__(self):
        super().__init__("MCStart Desktop Pet")
        self.github_api_base = "https://api.github.com"
        self.repo_owner = "MaiCore-Start"
        self.repo_name = "MCStart_Desktop_Pet"
        self.fallback_version = "v5.0.0"
        self.fallback_asset_name = "MCStart.Desktop.Pet.Setup.5.0.0.exe"
        self.fallback_download_url = (
            "https://github.com/MaiCore-Start/MCStart_Desktop_Pet/releases/download/"
            "v5.0.0/MCStart.Desktop.Pet.Setup.5.0.0.exe"
        )
        self.version = self.fallback_version
        self.download_url = self.fallback_download_url
        self.asset_name = self.fallback_asset_name
        self._release_resolved = False

    def _get_default_release_info(self) -> Dict[str, str]:
        """获取默认的桌宠发布信息"""
        return {
            "version": self.fallback_version,
            "download_url": self.fallback_download_url,
            "asset_name": self.fallback_asset_name,
        }

    def _update_release_info(self, release_info: Dict[str, str]) -> Dict[str, str]:
        """同步当前下载器使用的发布信息"""
        self.version = release_info["version"]
        self.download_url = release_info["download_url"]
        self.asset_name = release_info["asset_name"]
        return release_info

    def _select_installer_asset(self, assets: list[dict]) -> Optional[dict]:
        """从 GitHub release 资产中挑选 Windows 安装包"""
        if not assets:
            return None

        exe_assets = [
            asset for asset in assets
            if str(asset.get("name", "")).lower().endswith(".exe")
        ]
        if not exe_assets:
            return None

        preferred_predicates = [
            lambda name: "mcs" in name and "desktop" in name and "pet" in name and "setup" in name,
            lambda name: "desktop" in name and "pet" in name and "setup" in name,
            lambda name: "setup" in name,
            lambda name: "installer" in name,
        ]
        excluded_keywords = ("portable", "debug", "symbols", "blockmap")

        for predicate in preferred_predicates:
            for asset in exe_assets:
                asset_name = str(asset.get("name", "")).lower()
                if any(keyword in asset_name for keyword in excluded_keywords):
                    continue
                if predicate(asset_name):
                    return asset

        return exe_assets[0]

    def resolve_latest_release_info(self, force_refresh: bool = False) -> Dict[str, str]:
        """解析 GitHub 最新 release，失败时回退到内置版本"""
        if self._release_resolved and not force_refresh:
            return {
                "version": self.version,
                "download_url": self.download_url,
                "asset_name": self.asset_name,
            }

        default_info = self._get_default_release_info()

        try:
            ui.print_info("正在获取桌宠最新发布版本信息...")
            response = requests.get(
                f"{self.github_api_base}/repos/{self.repo_owner}/{self.repo_name}/releases/latest",
                headers={"Accept": "application/vnd.github+json"},
                timeout=15,
                verify=False,
            )
            response.raise_for_status()

            release_data = response.json()
            asset = self._select_installer_asset(release_data.get("assets", []))
            if not asset:
                ui.print_warning("最新 release 中未找到可用的桌宠安装包，将使用内置版本")
                logger.warning(
                    "桌宠最新 release 未找到可用安装包",
                    repo=f"{self.repo_owner}/{self.repo_name}",
                    tag_name=release_data.get("tag_name"),
                )
                self._release_resolved = True
                return self._update_release_info(default_info)

            release_info = {
                "version": release_data.get("tag_name") or default_info["version"],
                "download_url": asset.get("browser_download_url") or default_info["download_url"],
                "asset_name": asset.get("name") or default_info["asset_name"],
            }
            self._release_resolved = True
            logger.info(
                "桌宠最新 release 解析成功",
                version=release_info["version"],
                asset_name=release_info["asset_name"],
            )
            return self._update_release_info(release_info)

        except requests.RequestException as e:
            ui.print_warning(f"获取桌宠最新版本失败，将使用内置版本: {e}")
            logger.warning("获取桌宠最新 release 失败，回退内置版本", error=str(e))
        except Exception as e:
            ui.print_warning(f"解析桌宠最新版本信息失败，将使用内置版本: {e}")
            logger.warning("解析桌宠最新 release 失败，回退内置版本", error=str(e))

        self._release_resolved = True
        return self._update_release_info(default_info)

    def check_installed(self) -> bool:
        """检查桌宠是否已安装"""
        # 检查常见的安装路径
        possible_paths = [
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "MCStart Desktop Pet",
            Path(os.environ.get("PROGRAMFILES", "")) / "MCStart Desktop Pet",
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "MCStart Desktop Pet",
        ]

        for path in possible_paths:
            if path.exists() and (path / "MCStart Desktop Pet.exe").exists():
                logger.info(f"检测到桌宠已安装: {path}")
                return True

        return False

    def download(self, progress_callback=None, is_canceled_callback=None) -> bool:
        """下载桌宠安装包

        Args:
            progress_callback: 进度回调函数，接收字典参数
            is_canceled_callback: 取消检查回调函数

        Returns:
            bool: 下载是否成功
        """
        try:
            # 检查是否已安装
            if self.check_installed():
                ui.print_info("检测到桌宠已安装")
                if progress_callback:
                    progress_callback({
                        "phase": "completed",
                        "status": "success",
                        "message": "桌宠已安装"
                    })
                return True

            # 显示提示信息
            release_info = self.resolve_latest_release_info(force_refresh=True)
            ui.print_warning("=" * 60)
            ui.print_warning("桌宠模块需要额外安装")
            ui.print_warning(f"版本: {release_info['version']}")
            ui.print_warning("下载地址: " + release_info["download_url"])
            ui.print_warning("国内网络下载可能较慢，建议:")
            ui.print_warning("  1. 使用代理加速下载")
            ui.print_warning("  2. 从其他渠道获取安装包后手动安装")
            ui.print_warning("  3. 联系开发者获取国内镜像地址")
            ui.print_warning("=" * 60)

            if progress_callback:
                progress_callback({
                    "phase": "preparing",
                    "status": "running",
                    "message": "准备下载桌宠安装包",
                    "download_url": release_info["download_url"],
                    "version": release_info["version"]
                })

            # 使用项目的 Temporary 目录
            temp_dir = Path.cwd() / "Temporary"
            temp_dir.mkdir(exist_ok=True)
            installer_path = temp_dir / "MCStart.Desktop.Pet.Setup.exe"

            # 下载安装包
            ui.print_info(f"正在下载桌宠安装包 {release_info['version']}...")
            success = self.download_file(
                release_info["download_url"],
                str(installer_path),
                max_retries=3,
                progress_callback=progress_callback,
                is_canceled_callback=is_canceled_callback
            )

            if not success:
                ui.print_error("下载失败")
                if progress_callback:
                    progress_callback({
                        "phase": "failed",
                        "status": "error",
                        "message": "下载失败，请检查网络连接或使用其他下载方式"
                    })
                return False

            # 检查是否取消
            if is_canceled_callback and is_canceled_callback():
                ui.print_warning("安装已取消")
                return False

            # 运行安装程序
            ui.print_info("正在启动安装程序...")
            if progress_callback:
                progress_callback({
                    "phase": "installing",
                    "status": "running",
                    "message": "正在启动安装程序，请按照向导完成安装"
                })

            try:
                # 启动安装程序（非阻塞）
                subprocess.Popen([str(installer_path)], shell=True)
                ui.print_success("安装程序已启动，请按照向导完成安装")
                ui.print_info(f"安装包位置: {installer_path}")
                ui.print_info("提示：安装完成后可在组件下载页清理临时文件")

                if progress_callback:
                    progress_callback({
                        "phase": "completed",
                        "status": "success",
                        "message": "安装程序已启动，请按照向导完成安装"
                    })

                logger.info("桌宠安装程序已启动", installer_path=str(installer_path))
                return True

            except Exception as e:
                ui.print_error(f"启动安装程序失败: {e}")
                if progress_callback:
                    progress_callback({
                        "phase": "failed",
                        "status": "error",
                        "message": f"启动安装程序失败: {e}"
                    })
                logger.error("启动桌宠安装程序失败", error=str(e))
                return False

        except Exception as e:
            ui.print_error(f"下载桌宠失败: {e}")
            if progress_callback:
                progress_callback({
                    "phase": "failed",
                    "status": "error",
                    "message": f"下载失败: {e}"
                })
            logger.error("下载桌宠失败", error=str(e))
            return False

    def download_and_install(self, temp_dir, progress_cb=None, is_canceled_callback=None, non_interactive=False, **kwargs) -> bool:
        """下载并安装桌宠

        Args:
            temp_dir: 临时目录（未使用，桌宠使用自己的临时目录）
            progress_cb: 进度回调函数
            is_canceled_callback: 取消检查回调
            non_interactive: 是否非交互模式

        Returns:
            bool: 是否成功
        """
        return self.download(progress_callback=progress_cb, is_canceled_callback=is_canceled_callback)

    def get_download_info(self) -> dict:
        """获取下载信息"""
        release_info = self.resolve_latest_release_info()
        return {
            "name": "MCStart Desktop Pet",
            "version": release_info["version"],
            "download_url": release_info["download_url"],
            "installed": self.check_installed(),
            "description": "MCStart 桌面宠物，提供AI助手、日程管理、待办事项等功能"
        }
