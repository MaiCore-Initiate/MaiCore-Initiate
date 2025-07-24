"""
部署系统模块
负责实例的部署、更新和删除操作
支持从官方GitHub获取版本列表和更新日志
"""
import fnmatch
import glob
import json
import os
import platform
import re
import shutil
import subprocess
import tempfile
import time
import venv
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
import structlog
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table
from tqdm import tqdm

from ..core.config import config_manager
from ..ui.interface import ui
from ..utils.common import validate_path
from .mongodb_installer import mongodb_installer
from .webui_installer import webui_installer

logger = structlog.get_logger(__name__)


class DeploymentManager:
    """部署管理器类"""
    
    def __init__(self):
        # 官方GitHub仓库信息
        self.official_repo = "MaiM-with-u/MaiBot"
        self.github_api_base = "https://api.github.com"
        self.napcat_repo = "NapNeko/NapCatQQ"
        
        # 缓存
        self._versions_cache = None
        self._napcat_versions_cache = None
        self._cache_timestamp = None
        self._cache_duration = 300  # 5分钟缓存
        
        # 支持的分支
        self.supported_branches = ["main", "dev"]
        
        # 离线模式标志
        self._offline_mode = False
        
    def create_virtual_environment(self, target_dir: str) -> Tuple[bool, str]:
        """
        在目标目录创建Python虚拟环境
        
        Args:
            target_dir: 目标目录路径
            
        Returns:
            (是否成功, 虚拟环境路径或错误信息)
        """
        try:
            venv_path = os.path.join(target_dir, "venv")
            
            # 如果虚拟环境已存在，先删除
            if os.path.exists(venv_path):
                ui.print_info("检测到已存在的虚拟环境，正在重新创建...")
                shutil.rmtree(venv_path)
            
            # 创建虚拟环境
            ui.print_info("正在创建Python虚拟环境...")
            logger.info("开始创建虚拟环境", venv_path=venv_path)
            
            venv.create(venv_path, with_pip=True)
            
            # 验证虚拟环境是否创建成功
            if platform.system() == "Windows":
                python_exe = os.path.join(venv_path, "Scripts", "python.exe")
                pip_exe = os.path.join(venv_path, "Scripts", "pip.exe")
            else:
                python_exe = os.path.join(venv_path, "bin", "python")
                pip_exe = os.path.join(venv_path, "bin", "pip")
            
            if not os.path.exists(python_exe):
                raise Exception("虚拟环境Python解释器未找到")
                
            ui.print_success(f"虚拟环境创建成功: {venv_path}")
            logger.info("虚拟环境创建成功", venv_path=venv_path)
            
            return True, venv_path
            
        except Exception as e:
            error_msg = f"虚拟环境创建失败: {str(e)}"
            ui.print_error(error_msg)
            logger.error("虚拟环境创建失败", error=str(e))
            return False, error_msg
    
    def install_dependencies_in_venv(self, venv_path: str, requirements_path: str) -> bool:
        """
        在虚拟环境中安装依赖
        
        Args:
            venv_path: 虚拟环境路径
            requirements_path: requirements.txt文件路径
            
        Returns:
            是否安装成功
        """
        pypi_mirrors = [
            "https://pypi.tuna.tsinghua.edu.cn/simple",
            "https://pypi.org/simple",
            "https://mirrors.aliyun.com/pypi/simple",
            "https://pypi.douban.com/simple"
        ]
        try:
            if not os.path.exists(requirements_path):
                ui.print_warning("未找到requirements.txt文件，跳过依赖安装")
                return True

            # 确定pip可执行文件路径
            if platform.system() == "Windows":
                pip_exe = os.path.join(venv_path, "Scripts", "pip.exe")
            else:
                pip_exe = os.path.join(venv_path, "bin", "pip")

            if not os.path.exists(pip_exe):
                ui.print_error("虚拟环境中未找到pip")
                return False

            ui.print_info("正在虚拟环境中安装Python依赖...")
            logger.info("开始在虚拟环境中安装依赖", venv_path=venv_path, requirements=requirements_path)

            # 先升级pip，自动切换源
            pip_upgraded = False
            for mirror in pypi_mirrors:
                upgrade_cmd = [pip_exe, "install", "--upgrade", "pip", "-i", mirror]
                try:
                    subprocess.run(upgrade_cmd, check=True, capture_output=True, text=True)
                    pip_upgraded = True
                    ui.print_info(f"pip升级成功，使用源：{mirror}")
                    break
                except subprocess.CalledProcessError as e:
                    ui.print_warning(f"pip升级失败，尝试下一个源：{mirror}")
            if not pip_upgraded:
                ui.print_error("所有pip源升级均失败")
                return False

            # 安装依赖，自动切换源
            deps_installed = False
            for mirror in pypi_mirrors:
                install_cmd = [
                    pip_exe, "install", "-r", requirements_path,
                    "-i", mirror
                ]
                try:
                    subprocess.run(install_cmd, check=True, capture_output=True, text=True)
                    deps_installed = True
                    ui.print_info(f"依赖安装成功，使用源：{mirror}")
                    break
                except subprocess.CalledProcessError as e:
                    ui.print_warning(f"依赖安装失败，尝试下一个源：{mirror}")
            if not deps_installed:
                ui.print_error("所有pip源依赖安装均失败")
                return False

            ui.print_success("依赖安装完成")
            logger.info("依赖安装成功", venv_path=venv_path)
            return True
            
        except subprocess.CalledProcessError as e:
            error_msg = f"依赖安装失败: {e.stderr if e.stderr else str(e)}"
            ui.print_error(error_msg)
            logger.error("依赖安装失败", error=str(e), stderr=e.stderr if e.stderr else None)
            ui.print_warning("请手动安装依赖或检查requirements.txt文件")
            return False
        except Exception as e:
            error_msg = f"依赖安装过程中发生错误: {str(e)}"
            ui.print_error(error_msg)
            logger.error("依赖安装异常", error=str(e))
            return False
    
    def get_venv_python_path(self, venv_path: str) -> Optional[str]:
        """
        获取虚拟环境中的Python解释器路径
        
        Args:
            venv_path: 虚拟环境路径
            
        Returns:
            Python解释器路径，如果不存在则返回None
        """
        if platform.system() == "Windows":
            python_exe = os.path.join(venv_path, "Scripts", "python.exe")
        else:
            python_exe = os.path.join(venv_path, "bin", "python")
        
        return python_exe if os.path.exists(python_exe) else None

    def check_network_connection(self) -> Tuple[bool, str]:
        """
        检查网络连接
        返回：(是否连接成功, 错误消息)
        """
        endpoints = [
            ("https://api.github.com", "GitHub API"),
            ("https://github.com", "GitHub"),
            ("https://pypi.tuna.tsinghua.edu.cn", "清华PyPI镜像")
        ]
        
        for url, name in endpoints:
            try:
                response = requests.get(url, timeout=5, verify=False)
                if response.status_code < 400:  # 2xx 或 3xx 响应码表示连接成功
                    logger.info(f"网络连接检查成功", endpoint=name)
                    return True, ""
            except requests.RequestException as e:
                logger.warning(f"网络连接失败", endpoint=name, error=str(e))
                continue
        
        # 尝试ping一下常见DNS
        try:
            if platform.system() == "Windows":
                ping_cmd = ["ping", "-n", "1", "-w", "1000", "8.8.8.8"]
            else:
                ping_cmd = ["ping", "-c", "1", "-W", "1", "8.8.8.8"]
            
            result = subprocess.run(ping_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode == 0:
                return False, "DNS可达但GitHub不可访问，可能需要代理"
        except Exception:
            pass
            
        return False, "网络连接不可用，请检查网络设置或代理配置"
        
    def _is_cache_valid(self) -> bool:
        """检查缓存是否有效"""
        if self._cache_timestamp is None:
            return False
        import time
        return (time.time() - self._cache_timestamp) < self._cache_duration
    
    def get_github_releases(self, repo: str, include_prerelease: bool = True) -> List[Dict]:
        """从GitHub API获取releases信息"""
        try:
            url = f"{self.github_api_base}/repos/{repo}/releases"
            headers = {"Accept": "application/vnd.github.v3+json"}
            
            ui.print_info(f"正在获取 {repo} 的版本信息...")
            response = requests.get(url, headers=headers, timeout=30,verify=False)
            response.raise_for_status()
            
            releases = response.json()
            
            if include_prerelease:
                return releases
            else:
                return [r for r in releases if not r.get("prerelease", False)]
                
        except requests.RequestException as e:
            ui.print_error(f"获取GitHub releases失败: {str(e)}")
            logger.error("GitHub API请求失败", error=str(e), repo=repo)
            return []
        except Exception as e:
            ui.print_error(f"解析版本信息失败: {str(e)}")
            logger.error("版本信息解析失败", error=str(e))
            return []
    
    def get_github_branches(self, repo: str) -> List[Dict]:
        """获取GitHub分支信息"""
        try:
            url = f"{self.github_api_base}/repos/{repo}/branches"
            headers = {"Accept": "application/vnd.github.v3+json"}

            response = requests.get(url, headers=headers, timeout=30, verify=False)
            response.raise_for_status()
            
            branches = response.json()
            # 只返回支持的分支
            return [b for b in branches if b["name"] in self.supported_branches]
            
        except requests.RequestException as e:
            ui.print_error(f"获取分支信息失败: {str(e)}")
            logger.error("GitHub分支API请求失败", error=str(e))
            return []
    
    def get_maimai_versions(self, force_refresh: bool = False) -> List[Dict]:
        """获取MaiMai版本列表"""
        if not force_refresh and self._is_cache_valid() and self._versions_cache:
            return self._versions_cache
        
        versions = []
        
        # 离线模式下返回默认分支
        if hasattr(self, '_offline_mode') and self._offline_mode:
            # 提供主要分支的基本信息作为备选
            ui.print_warning("正在离线模式下运行，使用默认版本信息")
            for branch in self.supported_branches:
                versions.append({
                    "type": "branch",
                    "name": branch,
                    "display_name": f"{branch} (分支)",
                    "description": f"{branch} 分支 - 离线模式",
                    "published_at": None,
                    "prerelease": True,
                    "download_url": f"https://github.com/{self.official_repo}/archive/refs/heads/{branch}.zip",
                    "changelog": f"离线模式无法获取详细更新日志"
                })
            
            # 更新缓存
            self._versions_cache = versions
            import time
            self._cache_timestamp = time.time()
            
            return versions
        
        # 在线模式正常获取版本信息
        try:
            # 获取releases
            releases = self.get_github_releases(self.official_repo)
            for release in releases:
                versions.append({
                    "type": "release",
                    "name": release["tag_name"],
                    "display_name": release["name"] or release["tag_name"],
                    "description": release["body"][:100] + "..." if len(release["body"]) > 100 else release["body"],
                    "published_at": release["published_at"],
                    "prerelease": release.get("prerelease", False),
                    "download_url": release["zipball_url"],
                    "changelog": release["body"]
                })
            
            # 获取分支
            branches = self.get_github_branches(self.official_repo)
            for branch in branches:
                versions.append({
                    "type": "branch",
                    "name": branch["name"],
                    "display_name": f"{branch['name']} (分支)",
                    "description": f"{branch['name']} 分支 - 开发版本",
                    "published_at": None,
                    "prerelease": True,
                    "download_url": f"https://github.com/{self.official_repo}/archive/refs/heads/{branch['name']}.zip",
                    "changelog": f"来自 {branch['name']} 分支的最新代码"
                })
            
            # 按发布时间排序，分支版本置顶
            versions.sort(key=lambda x: (
                x["type"] != "branch",  # 分支优先
                x["published_at"] is None,  # 有发布时间的优先
                x["published_at"] if x["published_at"] else ""
            ), reverse=True)
            
        except Exception as e:
            # 出错时提供基本分支作为备选
            ui.print_error(f"获取版本信息失败: {str(e)}")
            ui.print_info("提供默认版本信息作为备选")
            self._offline_mode = True
            
            for branch in self.supported_branches:
                versions.append({
                    "type": "branch",
                    "name": branch,
                    "display_name": f"{branch} (分支)",
                    "description": f"{branch} 分支 - 离线模式",
                    "published_at": None,
                    "prerelease": True,
                    "download_url": f"https://github.com/{self.official_repo}/archive/refs/heads/{branch}.zip",
                    "changelog": f"离线模式无法获取详细更新日志"
                })
        
        # 更新缓存
        self._versions_cache = versions
        import time
        self._cache_timestamp = time.time()
        
        return versions
    
    def get_napcat_versions(self) -> List[Dict]:
        """获取NapCat版本列表 - 固定使用v4.8.90版本"""
        # 固定返回v4.8.90版本的两个选项
        napcat_versions = [
            {
                "name": "v4.8.90-framework",
                "display_name": "v4.8.90 有头版本",
                "description": "带界面的NapCat版本，适合调试和查看日志",
                "published_at": "2024-12-01T00:00:00Z",
                "download_url": "https://github.com/NapNeko/NapCatQQ/releases/download/v4.8.90/NapCat.Framework.Windows.OneKey.zip",
                "size": 50 * 1024 * 1024,  # 估算大小
                "changelog": "v4.8.90 稳定版本",
                "asset_name": "NapCat.Framework.Windows.OneKey.zip"
            },
            {
                "name": "v4.8.90-shell",
                "display_name": "v4.8.90 无头版本",
                "description": "无界面的NapCat版本，适合服务器部署",
                "published_at": "2024-12-01T00:00:00Z",
                "download_url": "https://github.com/NapNeko/NapCatQQ/releases/download/v4.8.90/NapCat.Shell.Windows.OneKey.zip",
                "size": 45 * 1024 * 1024,  # 估算大小
                "changelog": "v4.8.90 稳定版本",
                "asset_name": "NapCat.Shell.Windows.OneKey.zip"
            }
        ]
        
        self._napcat_versions_cache = napcat_versions
        return napcat_versions
    
    def delete_instance(self) -> bool:
        """删除实例"""
        try:
            ui.clear_screen()
            ui.console.print("[🗑️ 实例删除]", style=ui.colors["error"])
            ui.console.print("="*30)
            
            ui.print_warning("⚠️ 危险操作警告 ⚠️")
            ui.console.print("此操作将：")
            ui.console.print("  • 删除实例的所有文件")
            ui.console.print("  • 删除相关配置")
            ui.console.print("  • 此操作不可撤销")
            
            # 选择要删除的实例
            from ..modules.config_manager import config_mgr
            config = config_mgr.select_configuration()
            if not config:
                return False
            
            nickname = config.get("nickname_path", "未知")
            serial_number = config.get("serial_number", "未知")
            mai_path = config.get("mai_path", "")
            
            ui.console.print(f"\n[要删除的实例信息]", style=ui.colors["error"])
            ui.console.print(f"昵称：{nickname}")
            ui.console.print(f"序列号：{serial_number}")
            ui.console.print(f"路径：{mai_path}")
            
            # 三次确认
            ui.print_warning("\n请进行三次确认以防误操作：")
            
            if not ui.confirm("第一次确认：是否删除此实例？"):
                ui.print_info("操作已取消")
                return False
            
            if not ui.confirm("第二次确认：此操作将永久删除所有文件，确定继续？"):
                ui.print_info("操作已取消")
                return False
            
            confirm_text = f"delete-{serial_number}"
            user_input = ui.get_input(f"第三次确认：请输入 '{confirm_text}' 以确认删除：")
            if user_input != confirm_text:
                ui.print_error("确认文本不匹配，操作已取消")
                return False
            
            # 开始删除
            ui.print_info("正在删除实例...")
            logger.info("开始删除实例", serial=serial_number, nickname=nickname)
            
            # 删除文件
            if mai_path and os.path.exists(mai_path):
                try:
                    # 检查是否是MaiBot目录
                    if os.path.basename(mai_path) == "MaiBot" or "MaiBot" in mai_path:
                        # 删除整个项目目录的父目录
                        project_root = os.path.dirname(mai_path)
                        if os.path.exists(project_root):
                            shutil.rmtree(project_root)
                            ui.print_success("实例文件删除完成")
                            logger.info("实例文件删除成功", path=project_root)
                    else:
                        ui.print_warning("路径格式异常，跳过文件删除")
                except Exception as e:
                    ui.print_error(f"删除文件失败：{str(e)}")
                    logger.error("删除文件失败", error=str(e))
                    return False
            
            # 删除配置
            configurations = config_manager.get_all_configurations()
            config_name = None
            for name, cfg in configurations.items():
                if cfg.get("serial_number") == serial_number:
                    config_name = name
                    break
            
            if config_name:
                if config_manager.delete_configuration(config_name):
                    config_manager.save()
                    ui.print_success("配置删除完成")
                    logger.info("配置删除成功", config_name=config_name)
                else:
                    ui.print_error("配置删除失败")
                    return False
            
            ui.print_success(f"🗑️ 实例 '{nickname}' 删除完成")
            logger.info("实例删除完成", serial=serial_number)
            return True
            
        except Exception as e:
            ui.print_error(f"删除失败：{str(e)}")
            logger.error("实例删除失败", error=str(e))
            return False


    def show_version_menu(self) -> Optional[Dict]:
        """显示版本选择菜单，返回选中的版本信息"""
        ui.clear_screen()
        ui.components.show_title("选择部署版本", symbol="🚀")

        # 获取版本列表
        ui.print_info("正在获取最新版本信息...")
        versions = self.get_maimai_versions()

        if not versions:
            ui.print_error("无法获取版本信息，请检查网络连接")
            return None

        # 创建版本表格
        from rich.table import Table
        table = Table(
            show_header=True,
            header_style=ui.colors["table_header"],
            title="[bold]MaiBot 可用版本[/bold]",
            title_style=ui.colors["primary"],
            border_style=ui.colors["border"],
            show_lines=True
        )
        table.add_column("选项", style="cyan", width=6, justify="center")
        table.add_column("版本", style=ui.colors["primary"], width=20)
        table.add_column("类型", style="yellow", width=10, justify="center")
        table.add_column("说明", style="green", width=40)
        table.add_column("发布时间", style=ui.colors["blue"], width=12, justify="center")

        # 显示前20个版本
        display_versions = versions[:20]

        for i, version in enumerate(display_versions, 1):
            if version["type"] == "branch":
                version_type = f"{ui.symbols['new']} 分支"
            elif version["prerelease"]:
                version_type = f"{ui.symbols['warning']} 预览"
            else:
                version_type = f"{ui.symbols['success']} 正式"

            published_date = ""
            if version["published_at"]:
                try:
                    dt = datetime.fromisoformat(version["published_at"].replace('Z', '+00:00'))
                    published_date = dt.strftime("%Y-%m-%d")
                except:
                    published_date = "未知"
            else:
                published_date = "[bold]最新[/bold]"

            table.add_row(
                f"[{i}]",
                version["display_name"],
                version_type,
                version["description"],
                published_date
            )

        ui.console.print(table)
        ui.console.print("\n[C] 查看版本更新日志  [R] 刷新版本列表  [Q] 返回上级菜单", style=ui.colors["info"])
        
        while True:
            choice = ui.get_input("请选择版本所对应的选项或操作：").strip()
            
            if choice.upper() == 'Q':
                return None
            elif choice.upper() == 'R':
                # 刷新版本列表
                return self.show_version_menu()
            elif choice.upper() == 'C':
                # 查看更新日志
                self.show_changelog_menu(display_versions)
                # 返回后重新显示菜单
                return self.show_version_menu()
            
            try:
                choice_num = int(choice)
                if 1 <= choice_num <= len(display_versions):
                    selected_version = display_versions[choice_num - 1]
                    
                    ui.console.print(f"\n已选择版本: {selected_version['display_name']}")
                    return selected_version
                else:
                    ui.print_error("无效选项，请重新选择")
            except ValueError:
                ui.print_error("请输入有效的数字")
    
    def show_changelog_menu(self, versions: List[Dict]):
        """显示版本更新日志菜单"""
        ui.clear_screen()
        ui.components.show_title("版本更新日志", symbol="📋")

        # 显示版本列表供选择
        from rich.table import Table
        table = Table(
            show_header=True,
            header_style=ui.colors["table_header"],
            title="[bold]选择要查看更新日志的版本[/bold]",
            title_style=ui.colors["primary"],
            border_style=ui.colors["border"]
        )
        table.add_column("选项", style="cyan", width=6, justify="center")
        table.add_column("版本", style=ui.colors["primary"], width=25)
        table.add_column("类型", style="yellow", width=12, justify="center")

        for i, version in enumerate(versions, 1):
            if version["type"] == "branch":
                version_type = f"{ui.symbols['new']} 分支"
            elif version["prerelease"]:
                version_type = f"{ui.symbols['warning']} 预览"
            else:
                version_type = f"{ui.symbols['success']} 正式"
            table.add_row(f"[{i}]", version["display_name"], version_type)

        ui.console.print(table)
        ui.console.print("\n[Q] 返回版本选择", style=ui.colors["info"])
        
        while True:
            choice = ui.get_input("请选择要查看更新日志的版本：").strip()
            
            if choice.upper() == 'Q':
                return
            
            try:
                choice_num = int(choice)
                if 1 <= choice_num <= len(versions):
                    selected_version = versions[choice_num - 1]
                    self.show_version_changelog(selected_version)
                    break
                else:
                    ui.print_error("无效选项，请重新选择")
            except ValueError:
                ui.print_error("请输入有效的数字")
    
    def show_version_changelog(self, version: Dict):
        """显示特定版本的更新日志"""
        ui.clear_screen()
        from rich.panel import Panel
        from rich.markdown import Markdown

        title = f"{ui.symbols['info']} {version['display_name']} - 更新日志"
        
        info_text = f"[bold]版本:[/bold] {version['display_name']}\n"
        info_text += f"[bold]类型:[/bold] {'分支版本' if version['type'] == 'branch' else '发布版本'}\n"
        if version["published_at"]:
            try:
                dt = datetime.fromisoformat(version["published_at"].replace('Z', '+00:00'))
                info_text += f"[bold]发布时间:[/bold] {dt.strftime('%Y年%m月%d日 %H:%M')}"
            except:
                info_text += "[bold]发布时间:[/bold] 未知"

        changelog_content = version.get("changelog", "暂无详细更新日志")
        if not changelog_content.strip():
            changelog_content = "暂无详细更新日志"

        # 使用Markdown组件渲染更新日志
        changelog_markdown = Markdown(changelog_content)

        # 将所有内容放入一个Panel
        full_content = f"{info_text}\n\n---\n\n"
        
        panel_content = Panel(
            changelog_markdown,
            title=title,
            title_align="left",
            border_style=ui.colors["primary"],
            subtitle="按回车键返回",
            subtitle_align="right"
        )
        
        ui.console.print(panel_content)
        ui.pause("")
    
    def select_napcat_version(self) -> Optional[Dict]:
        """选择NapCat版本"""
        ui.clear_screen()
        ui.components.show_title("选择NapCat版本", symbol="🐱")
        
        ui.print_info("当前仅支持 NapCat v4.8.90 稳定版本")
        napcat_versions = self.get_napcat_versions()
        
        if not napcat_versions:
            ui.print_error("无法获取NapCat版本信息")
            return None
        
        # 创建简化的版本表格
        from rich.table import Table
        table = Table(
            show_header=True,
            header_style=ui.colors["table_header"],
            title="[bold]NapCat 可用版本[/bold]",
            title_style=ui.colors["primary"],
            border_style=ui.colors["border"]
        )
        table.add_column("选项", style="cyan", width=6, justify="center")
        table.add_column("版本类型", style=ui.colors["primary"], width=20)
        table.add_column("大小", style="yellow", width=12, justify="center")
        table.add_column("说明", style="green")
        
        for i, version in enumerate(napcat_versions, 1):
            size_mb = f"{version['size'] / 1024 / 1024:.1f} MB" if version['size'] else "未知"
            
            table.add_row(
                f"[{i}]",
                version["display_name"],
                size_mb,
                version["description"]
            )
        
        ui.console.print(table)
        ui.console.print("\n[Q] 跳过NapCat下载", style=ui.colors["info"])
        
        while True:
            choice = ui.get_input("请选择NapCat版本类型：").strip()
            
            if choice.upper() == 'Q':
                return None
            
            try:
                choice_num = int(choice)
                if 1 <= choice_num <= len(napcat_versions):
                    return napcat_versions[choice_num - 1]
                else:
                    ui.print_error("无效选项，请重新选择")
            except ValueError:
                ui.print_error("请输入有效的数字")
    
    def download_napcat(self, napcat_version: Dict, install_dir: str) -> Optional[str]:
        """下载并解压NapCat"""
        try:
            ui.print_info(f"开始下载NapCat {napcat_version['display_name']}...")
            
            # 创建临时目录
            with tempfile.TemporaryDirectory() as temp_dir:
                download_url = napcat_version["download_url"]
                filename = napcat_version.get("asset_name", os.path.basename(download_url))
                temp_file = os.path.join(temp_dir, filename)
                
                if not self.download_file(download_url, temp_file):
                    return None
                
                # 解压到NapCat目录
                napcat_dir = os.path.join(install_dir, "NapCat")
                os.makedirs(napcat_dir, exist_ok=True)
                
                ui.print_info("正在解压NapCat...")
                
                if filename.endswith('.zip'):
                    with zipfile.ZipFile(temp_file, 'r') as zip_ref:
                        zip_ref.extractall(napcat_dir)
                else:
                    # 如果是其他格式，直接复制
                    shutil.copy2(temp_file, napcat_dir)
                
                ui.print_success("NapCat下载完成")
                logger.info("NapCat下载成功", version=napcat_version['display_name'], path=napcat_dir)
                
                # 查找NapCat安装程序
                installer_exe = None
                napcat_exe = None
                
                for root, dirs, files in os.walk(napcat_dir):
                    for file in files:
                        # 查找安装程序
                        if file.lower() == 'napcatinstaller.exe':
                            installer_exe = os.path.join(root, file)
                        # 查找NapCat可执行文件
                        elif file.lower().endswith('.exe') and 'napcat' in file.lower():
                            napcat_exe = os.path.join(root, file)
                
                # 如果找到安装程序，询问是否自动安装
                if installer_exe and os.path.exists(installer_exe):
                    ui.print_info(f"找到NapCat安装程序: {installer_exe}")
                    
                    if ui.confirm("是否自动运行NapCat安装程序？"):
                        installer_success = self.run_napcat_installer(installer_exe)
                        if installer_success:
                            ui.print_success("NapCat安装程序已成功启动")
                            return napcat_exe or napcat_dir
                        else:
                            ui.print_error("NapCat安装程序启动失败")
                            return None
                    else:
                        ui.print_info("您可以稍后手动运行安装程序")
                        ui.print_info(f"安装程序位置: {installer_exe}")
                        ui.print_info("安装完成后，系统将自动检测NapCat位置")
                else:
                    ui.print_warning("未找到NapCatInstaller.exe，跳过自动安装")
                
                # 如果没有安装程序或用户选择不安装，尝试查找现有的NapCat
                existing_napcat = self.find_installed_napcat(install_dir)
                if existing_napcat:
                    return existing_napcat
                    
                return napcat_exe or napcat_dir
                
        except Exception as e:
            ui.print_error(f"NapCat下载失败：{str(e)}")
            logger.error("NapCat下载失败", error=str(e))
            return None
    
    def find_installed_napcat(self, install_dir: str) -> Optional[str]:
        """
        查找已安装的NapCat主程序
        优先查找无头版本(Shell)，其次查找有头版本(Framework)
        
        Args:
            install_dir: 安装目录
            
        Returns:
            NapCat主程序路径(NapCatWinBootMain.exe)，如果未找到则返回None
        """
        try:
            # 优先查找无头版本 NapCat.34740.Shell\NapCatWinBootMain.exe
            shell_pattern = "NapCat.*.Shell"
            shell_exe_name = "NapCatWinBootMain.exe"
            install_dir = os.path.join(install_dir, "NapCat")  # 确保安装目录正确
            # 遍历安装目录，查找匹配的Shell目录
            for item in os.listdir(install_dir):
                item_path = os.path.join(install_dir, item)
                if os.path.isdir(item_path) and fnmatch.fnmatch(item, shell_pattern):
                    shell_exe_path = os.path.join(item_path, shell_exe_name)
                    if os.path.exists(shell_exe_path):
                        ui.print_success(f"找到NapCat无头版本: {shell_exe_path}")
                        logger.info("发现NapCat Shell版本", path=shell_exe_path)
                        return shell_exe_path
            
            # 如果没找到Shell版本，查找有头版本 NapCat.34740.Framework\NapCatWinBootMain.exe
            framework_pattern = "NapCat.*.Framework"
            
            for item in os.listdir(install_dir):
                item_path = os.path.join(install_dir, item)
                if os.path.isdir(item_path) and fnmatch.fnmatch(item, framework_pattern):
                    framework_exe_path = os.path.join(item_path, shell_exe_name)
                    if os.path.exists(framework_exe_path):
                        ui.print_success(f"找到NapCat有头版本: {framework_exe_path}")
                        logger.info("发现NapCat Framework版本", path=framework_exe_path)
                        return framework_exe_path
            
            ui.print_warning("未找到已安装的NapCat主程序")
            logger.warning("未找到NapCat主程序", search_dir=install_dir)
            return None
            
        except Exception as e:
            ui.print_warning(f"查找NapCat安装时出错: {str(e)}")
            logger.error("查找NapCat安装异常", error=str(e))
            return None
    

    def run_napcat_installer(self, installer_path: str) -> bool:
        """
        运行NapCat安装程序
        
        Args:
            installer_path: 安装程序路径
            
        Returns:
            是否成功启动安装程序
        """
        try:
            if not os.path.exists(installer_path):
                ui.print_error("安装程序文件不存在")
                return False
            
            installer_dir = os.path.dirname(installer_path)
            installer_name = os.path.basename(installer_path)
            
            ui.print_info("正在启动NapCat安装程序...")
            logger.info("启动NapCat安装程序", installer_path=installer_path)
            
            # 在Windows上使用cmd打开并切换到安装目录运行安装程序
            if platform.system() == "Windows":
                # 创建批处理文件来自动执行安装
                batch_content = f"""@echo off
chcp 65001
echo 正在启动NapCat安装程序...
echo 安装目录: {installer_dir}
echo 安装程序: {installer_name}
echo.
cd /d "{installer_dir}"
echo 当前目录: %CD%
echo.
echo 开始运行安装程序...
"{installer_name}"
echo.
echo 安装程序已启动，请按照提示完成安装
pause
"""
                
                # 创建临时批处理文件
                temp_batch = os.path.join(tempfile.gettempdir(), "napcat_installer.bat")
                with open(temp_batch, 'w', encoding='gbk') as f:
                    f.write(batch_content)
                
                # 启动批处理文件
                subprocess.Popen(['cmd', '/c', 'start', 'cmd', '/k', temp_batch], shell=True)
                
                ui.print_success("NapCat安装程序已启动")
                ui.print_info("请在弹出的命令行窗口中按照提示完成安装")
                
            else:
                # 在Linux或macOS上无法运行windows安装程序
                ui.print_error("当前操作系统不支持自动运行NapCat安装程序")
                logger.error("不支持的操作系统", system=platform.system())
                return False

            logger.info("NapCat安装程序启动成功")
            return True
            
        except Exception as e:
            error_msg = f"启动安装程序失败: {str(e)}"
            ui.print_error(error_msg)
            logger.error("启动NapCat安装程序失败", error=str(e))
            return False

    def download_file(self, url: str, filename: str, max_retries: int = 3) -> bool:
        """下载文件并显示进度，支持重试"""
        if hasattr(self, '_offline_mode') and self._offline_mode:
            ui.print_error("当前处于离线模式，无法下载文件")
            return False
            
        # 检查是否有代理设置
        proxies = {}
        # 从环境变量获取代理设置
        http_proxy = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
        https_proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
        if http_proxy:
            proxies['http'] = http_proxy
        if https_proxy:
            proxies['https'] = https_proxy
            
        if proxies:
            ui.print_info(f"使用代理设置: {proxies}")
        
        # 重试逻辑
        for retry in range(max_retries):
            try:
                ui.print_info(f"正在下载 {os.path.basename(filename)}... (尝试 {retry + 1}/{max_retries})")
                logger.info("开始下载文件", url=url, filename=filename, retry=retry+1)
                
                response = requests.get(url, stream=True, proxies=proxies, timeout=30, verify=False)
                response.raise_for_status()
                
                total_size = int(response.headers.get('content-length', 0))
                
                with open(filename, 'wb') as file, tqdm(
                    desc=os.path.basename(filename),
                    total=total_size,
                    unit='iB',
                    unit_scale=True,
                    unit_divisor=1024,
                ) as progress_bar:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            file.write(chunk)
                            progress_bar.update(len(chunk))
                
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
                
                ui.print_success(f"{os.path.basename(filename)} 下载完成")
                logger.info("文件下载完成", filename=filename)
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
    
    def deploy_instance(self) -> bool:
        """部署新实例 - 重构版本"""
        try:
            ui.clear_screen()
            ui.components.show_title("实例部署助手", symbol="🚀")

            if not self._check_network_for_deployment():
                return False

            deploy_config = self._get_deployment_config()
            if not deploy_config:
                return False

            if not self._confirm_deployment(deploy_config):
                return False

            ui.print_info("🚀 开始部署流程...")
            logger.info("开始部署实例", config=deploy_config)

            # 部署流程
            paths = self._run_deployment_steps(deploy_config)

            # 完成部署
            if not self._finalize_deployment(deploy_config, **paths):
                return False

            ui.print_success(f"🎉 实例 '{deploy_config['nickname']}' 部署完成！")
            self._show_post_deployment_info()

            logger.info("实例部署完成", serial=deploy_config['serial_number'])
            return True

        except Exception as e:
            ui.print_error(f"部署失败：{str(e)}")
            logger.error("实例部署失败", error=str(e))
            return False
    
    def _check_network_for_deployment(self) -> bool:
        """检查网络连接用于部署"""
        ui.print_info("检查网络连接...")
        network_status, message = self.check_network_connection()
        if not network_status:
            ui.print_error(f"网络连接失败: {message}")
            ui.print_info("您可以选择继续部署，但可能无法从GitHub获取版本信息")
            if not ui.confirm("是否继续部署（将使用本地缓存或默认版本）？"):
                ui.pause()
                return False
            self._offline_mode = True
        else:
            ui.print_success("网络连接正常")
            self._offline_mode = False
        return True
    
    def _get_deployment_config(self) -> Optional[Dict]:
        """获取部署配置信息"""
        # 选择版本
        selected_version = self.show_version_menu()
        if not selected_version:
            return None
        
        # 重新询问用户是否需要安装各个组件
        ui.clear_screen()
        ui.console.print("[🔧 组件安装选择]", style=ui.colors["primary"])
        ui.console.print("="*50)
        ui.console.print("请选择需要安装的组件：\n")
        
        # 根据版本智能推荐组件
        version_name = selected_version.get("name", "").lower()
        from ..utils.version_detector import get_version_requirements
        version_reqs = get_version_requirements(version_name)
        is_legacy = version_reqs["is_legacy"]
        
        # 显示版本信息和建议
        ui.console.print(f"选择的版本：{selected_version['display_name']}")
        ui.console.print(f"版本类型：{'旧版本 (classical/0.5.x)' if is_legacy else '新版本 (0.6.0+)'}")
        
        if is_legacy:
            ui.print_info("旧版本建议配置：MaiBot主体 + MongoDB")
        else:
            ui.print_info("新版本建议配置：MaiBot + 适配器 + NapCat")

        ui.console.print()
        
        # 询问适配器安装（新版本默认推荐）
        if is_legacy:
            install_adapter = False
            ui.print_info("旧版本无需适配器，已自动跳过")
            install_napcat = ui.confirm("是否需要安装NapCat？（QQ连接组件）")
        else:
            install_adapter = ui.confirm("是否需要安装适配器？（新版本推荐安装）")
            if install_adapter == False:
                ui.print_info("已跳过适配器安装")
                install_napcat = False
            else:
                install_napcat = True  # 新版本默认需要NapCat
        
        # 询问是否需要安装NapCat
        
        # 选择NapCat版本（如果需要）
        napcat_version = None
        if install_napcat:
            napcat_version = self.select_napcat_version()
            if napcat_version is None:
                ui.print_info("已跳过NapCat下载")
                install_napcat = False
        
        # 询问是否需要安装MongoDB - 修正逻辑：0.7以下版本需要
        install_mongodb = False
        mongodb_path = ""
        needs_mongo = version_reqs["needs_mongodb"]
        
        if needs_mongo:
            # 0.7以下版本需要检查是否安装MongoDB
                ui.print_info("正在检查MongoDB安装状态...")
                try:
                    # 直接在这里进行MongoDB检查和安装
                    success, mongodb_path = mongodb_installer.check_and_install_mongodb(
                        selected_version.get("name", ""), "", force_install=False
                    )
                    if success:
                        install_mongodb = True
                        ui.print_success("✅ MongoDB检查完成")
                        if mongodb_path:
                            ui.print_info(f"MongoDB路径: {mongodb_path}")
                    else:
                        ui.print_warning("⚠️ MongoDB检查失败，将跳过MongoDB安装")
                        install_mongodb = False
                except Exception as e:
                    ui.print_error(f"MongoDB检查异常: {str(e)}")
                    install_mongodb = False
        else:
            # 0.7及以上版本默认不需要MongoDB
            ui.print_info("0.7及以上版本无需MongoDB，已自动跳过")

        # 询问是否需要安装WebUI
        install_webui = ui.confirm("是否需要安装WebUI？（Web聊天室界面）(目前处于预览版, 可能不稳定)")

        # 获取基本信息
        existing_configs = config_manager.get_all_configurations()
        existing_serials = {cfg["serial_number"] for cfg in existing_configs.values()}

        while True:
            serial_number = ui.get_input("请输入实例序列号（用于识别）：")
            if not serial_number:
                ui.print_error("序列号不能为空")
                continue
            if serial_number in existing_serials:
                ui.print_error("该序列号已存在，请使用其他序列号")
                continue
            break

        while True:
            nickname = ui.get_input("请输入实例昵称（将作为文件夹名称）：")
            if nickname:
                break
            ui.print_error("昵称不能为空")

        while True:
            qq_account = ui.get_input("请输入机器人QQ号：")
            if qq_account.isdigit():
                break
            ui.print_error("QQ号必须为纯数字")

        while True:
            base_dir = ui.get_input("请输入基础安装目录：")
            if not base_dir:
                ui.print_error("基础安装目录不能为空")
                continue
            
            # 使用昵称作为文件夹名
            install_dir = os.path.join(base_dir, nickname)
            
            if os.path.exists(install_dir):
                ui.print_warning(f"目录 '{install_dir}' 已存在。")
                if not ui.confirm("是否继续在此目录中安装？"):
                    continue
            
            # 验证路径有效性
            if not validate_path(install_dir):
                ui.print_error("安装路径无效，请重新输入。")
                continue

            break
        
        return {
            "selected_version": selected_version,
            "napcat_version": napcat_version,
            "serial_number": serial_number,
            "install_dir": install_dir,
            "nickname": nickname,
            "qq_account": qq_account,
            "install_adapter": install_adapter,
            "install_napcat": install_napcat,
            "install_mongodb": install_mongodb,
            "mongodb_path": mongodb_path,  # 直接保存MongoDB路径
            "install_webui": install_webui
        }
    
    def _confirm_deployment(self, deploy_config: Dict) -> bool:
        """确认部署信息"""
        ui.clear_screen()
        ui.console.print(f"[🚀 部署版本: {deploy_config['selected_version']['display_name']}]", style=ui.colors["primary"])
        ui.console.print("="*50)
        
        ui.console.print("\n[📋 部署信息确认]", style=ui.colors["warning"])
        ui.console.print(f"版本：{deploy_config['selected_version']['display_name']}")
        ui.console.print(f"序列号：{deploy_config['serial_number']}")
        ui.console.print(f"昵称：{deploy_config['nickname']}")
        ui.console.print(f"机器人QQ号：{deploy_config['qq_account']}")
        ui.console.print(f"安装目录：{deploy_config['install_dir']}")
        
        # 显示组件安装选择
        ui.console.print("\n[🔧 组件安装选择]", style=ui.colors["info"])
        
        # MaiBot主体（必装）
        ui.console.print(f"MaiBot主体：✅ 安装")
        
        # 适配器
        adapter_status = "✅ 安装" if deploy_config.get("install_adapter") else "❌ 跳过"
        ui.console.print(f"适配器：{adapter_status}")
        
        # NapCat
        napcat_status = "✅ 安装" if deploy_config.get("install_napcat") else "❌ 跳过"
        ui.console.print(f"NapCat：{napcat_status}")
        if deploy_config.get("napcat_version"):
            ui.console.print(f"  └─ NapCat版本：{deploy_config['napcat_version']['display_name']}")
        
        # MongoDB
        mongodb_status = "✅ 已检查" if deploy_config.get("install_mongodb") else "❌ 跳过"
        ui.console.print(f"MongoDB：{mongodb_status}")
        if deploy_config.get("mongodb_path"):
            ui.console.print(f"  └─ MongoDB路径：{deploy_config['mongodb_path']}")
        
        # WebUI
        webui_status = "✅ 安装" if deploy_config.get("install_webui") else "❌ 跳过"
        ui.console.print(f"WebUI：{webui_status}")
        
        # 显示预计安装时间
        ui.console.print("\n[⏱️ 预计安装时间]", style=ui.colors["info"])
        install_components = sum([
            1,  # MaiBot主体
            deploy_config.get("install_adapter", False),
            deploy_config.get("install_napcat", False),
            deploy_config.get("install_mongodb", False),
            deploy_config.get("install_webui", False)
        ])
        estimated_time = install_components * 2  # 每个组件约2分钟
        ui.console.print(f"预计耗时：{estimated_time}-{estimated_time + 5} 分钟")
        
        return ui.confirm("确认开始部署吗？")
    
    def _install_maibot(self, deploy_config: Dict) -> Optional[str]:
        """第一步：安装MaiBot"""
        ui.console.print("\n[📦 第一步：安装MaiBot]", style=ui.colors["primary"])
        
        selected_version = deploy_config["selected_version"]
        install_dir = deploy_config["install_dir"]
        
        with tempfile.TemporaryDirectory() as temp_dir:
            # 下载MaiBot源码
            ui.print_info("正在下载MaiBot源码...")
            download_url = selected_version["download_url"]
            archive_path = os.path.join(temp_dir, f"{selected_version['name']}.zip")
            
            if not self.download_file(download_url, archive_path):
                ui.print_error("MaiBot下载失败")
                return None
            
            # 解压到临时目录
            ui.print_info("正在解压MaiBot...")
            if not self.extract_archive(archive_path, temp_dir):
                ui.print_error("MaiBot解压失败")
                return None
            
            # 查找解压后的目录
            extracted_dirs = [d for d in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, d)) and d != "__MACOSX"]
            if not extracted_dirs:
                ui.print_error("解压后未找到项目目录")
                return None
            
            source_dir = os.path.join(temp_dir, extracted_dirs[0])
            
            # 创建目标目录并复制文件
            os.makedirs(install_dir, exist_ok=True)
            target_dir = os.path.join(install_dir, "MaiBot")
            
            ui.print_info("正在安装MaiBot文件...")
            shutil.copytree(source_dir, target_dir)
            
            ui.print_success("✅ MaiBot安装完成")
            logger.info("MaiBot安装成功", path=target_dir)
            return target_dir
    
    def _install_adapter_if_needed(self, deploy_config: Dict, maibot_path: str) -> str:
        """第二步：检测版本并安装适配器"""
        ui.console.print("\n[🔌 第二步：检测版本并安装适配器]", style=ui.colors["primary"])
        
        # 使用配置版本信息进行判断
        selected_version = deploy_config["selected_version"]
        version_name = selected_version.get("name", "")
        display_name = selected_version.get("display_name", "")
        
        ui.print_info(f"版本名称：{version_name}")
        ui.print_info(f"显示名称：{display_name}")
        
        # 优先使用display_name进行版本判断
        version_to_check = display_name if display_name else version_name
        
        ui.print_info("适配器选择规则：")
        ui.console.print("  • 0.5.x及以下：无需适配器")
        ui.console.print("  • 0.6.x 版本：使用0.2.3版本适配器")
        ui.console.print("  • 0.7.x-0.8.x 版本：使用0.4.2版本适配器")
        ui.console.print("  • main分支：使用main分支适配器")
        ui.console.print("  • dev分支：使用dev分支适配器")
        
        # 判断是否需要适配器
        adapter_path = self._determine_adapter_requirements(version_to_check, maibot_path)
        
        if adapter_path == "无需适配器":
            ui.print_success("✅ 当前版本无需适配器")
            return adapter_path
        elif "版本较低" in adapter_path or "未定义" in adapter_path or "失败" in adapter_path:
            ui.print_warning(f"⚠️ {adapter_path}")
            return adapter_path
        else:
            ui.print_success("✅ 适配器安装完成")
            return adapter_path
    
    def _determine_adapter_requirements(self, version: str, maibot_path: str) -> str:
        """确定适配器需求并安装"""
        try:
            # 检查是否已有适配器目录
            potential_adapter_paths = [
                os.path.join(maibot_path, "adapter"),
                os.path.join(maibot_path, "MaiBot-Napcat-Adapter"),
                os.path.join(maibot_path, "napcat-adapter")
            ]
            
            for path in potential_adapter_paths:
                if os.path.exists(path):
                    ui.print_info(f"发现已存在的适配器：{path}")
                    return path
            
            # 使用新的版本检测模块
            from ..utils.version_detector import get_version_requirements
            version_reqs = get_version_requirements(version)
            
            ui.print_info(f"版本分析结果：")
            ui.print_info(f"  版本号：{version}")
            ui.print_info(f"  是否旧版本：{version_reqs['is_legacy']}")
            ui.print_info(f"  需要适配器：{version_reqs['needs_adapter']}")
            ui.print_info(f"  适配器版本：{version_reqs['adapter_version']}")
            
            # 检查是否需要适配器
            if not version_reqs["needs_adapter"]:
                return "无需适配器"
            
            adapter_version = version_reqs["adapter_version"]
            
            # 根据适配器版本下载
            return self._download_specific_adapter_version(adapter_version, maibot_path)
                
        except Exception as e:
            ui.print_error(f"适配器处理失败：{str(e)}")
            logger.error("适配器处理异常", error=str(e))
            return "适配器处理失败"
    
    def _download_specific_adapter_version(self, adapter_version: str, maibot_path: str) -> str:
        """下载特定版本的适配器"""
        ui.print_info(f"正在下载v{adapter_version}版本的适配器...")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            if adapter_version == "main" or adapter_version == "dev":
                adapter_url = f"https://github.com/MaiM-with-u/MaiBot-Napcat-Adapter/releases/download/{adapter_version}/MaiBot-Napcat-Adapter-{adapter_version}.zip"
            else:
                adapter_url = f"https://codeload.github.com/MaiM-with-u/MaiBot-Napcat-Adapter/zip/refs/tags/{adapter_version}"
            adapter_zip = os.path.join(temp_dir, f"adapter_v{adapter_version}.zip")
            
            if not self.download_file(adapter_url, adapter_zip):
                ui.print_warning(f"v{adapter_version}适配器下载失败")
                return f"v{adapter_version}适配器下载失败"
            
            # 解压到临时目录
            temp_extract = os.path.join(temp_dir, f"adapter_extract_v{adapter_version}")
            if not self.extract_archive(adapter_zip, temp_extract):
                ui.print_warning("适配器解压失败")
                return "适配器解压失败"
            
            # 查找解压后的目录并复制到正确位置
            extracted_dirs = [d for d in os.listdir(temp_extract) if os.path.isdir(os.path.join(temp_extract, d))]
            adapter_extract_path = os.path.join(maibot_path, "adapter")
            
            if extracted_dirs:
                # 找到解压后的根目录（通常是 MaiBot-Napcat-Adapter-版本号）
                source_adapter_dir = os.path.join(temp_extract, extracted_dirs[0])
                
                # 确保目标目录不存在，然后复制
                if os.path.exists(adapter_extract_path):
                    shutil.rmtree(adapter_extract_path)
                shutil.copytree(source_adapter_dir, adapter_extract_path)
                
                ui.print_success(f"v{adapter_version}适配器安装完成")
                logger.info("适配器安装成功", version=adapter_version, path=adapter_extract_path)
                return adapter_extract_path
            else:
                # 如果没有找到子目录，可能是直接解压的文件
                # 尝试直接移动整个解压目录的内容
                if os.path.exists(adapter_extract_path):
                    shutil.rmtree(adapter_extract_path)
                os.makedirs(adapter_extract_path)
                
                # 移动所有内容到目标目录
                for item in os.listdir(temp_extract):
                    src = os.path.join(temp_extract, item)
                    dst = os.path.join(adapter_extract_path, item)
                    if os.path.isdir(src):
                        shutil.copytree(src, dst)
                    else:
                        shutil.copy2(src, dst)
                
                ui.print_success(f"v{adapter_version}适配器安装完成")
                logger.info("适配器安装成功", version=adapter_version, path=adapter_extract_path)
                return adapter_extract_path
    
    def _install_napcat(self, deploy_config: Dict, maibot_path: str) -> str:
        """第三步：安装NapCat"""
        ui.console.print("\n[🐱 第三步：安装NapCat]", style=ui.colors["primary"])
        
        napcat_version = deploy_config["napcat_version"]
        install_dir = deploy_config["install_dir"]
        
        ui.print_info(f"开始安装NapCat {napcat_version['display_name']}...")
        
        napcat_exe = self.download_napcat(napcat_version, install_dir)
        if napcat_exe:
            # 等待用户完成安装并进行3次检测
            napcat_path = self._wait_for_napcat_installation(install_dir)
            if napcat_path:
                ui.print_success("✅ NapCat安装并检测完成")
                logger.info("NapCat安装成功", path=napcat_path)
                return napcat_path
            else:
                ui.print_error("❌ NapCat路径检测失败")
                ui.print_warning("⚠️ 您可以稍后手动配置NapCat路径")
                logger.warning("NapCat路径检测失败，用户需手动配置")
                return ""
        else:
            ui.print_error("❌ NapCat下载失败")
            ui.print_warning("⚠️ 请稍后手动下载和配置NapCat")
            logger.error("NapCat下载失败")
            return ""
    
    def _wait_for_napcat_installation(self, install_dir: str) -> Optional[str]:
        """等待NapCat安装完成并检测路径"""
        ui.print_info("等待NapCat安装完成...")
        ui.print_warning("请在弹出的安装窗口中完成NapCat安装")
        ui.print_info("安装完成后，按回车键开始检测NapCat路径")
        
        # 等待用户确认安装完成
        ui.pause("NapCat安装完成后按回车继续...")
        
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            ui.print_info(f"正在进行第 {attempt}/{max_attempts} 次NapCat路径检测...")
            
            # 检测是否有新的NapCat安装
            napcat_path = self.find_installed_napcat(install_dir)
            if napcat_path:
                ui.print_success(f"✅ 检测到NapCat安装：{napcat_path}")
                logger.info("NapCat路径检测成功", path=napcat_path, attempt=attempt)
                return napcat_path
            
            if attempt < max_attempts:
                ui.print_warning(f"❌ 第 {attempt} 次检测未找到NapCat，等待5秒后进行下一次检测...")
                time.sleep(5)  # 等待5秒后再进行下一次检测
            else:
                ui.print_error(f"❌ 已完成 {max_attempts} 次检测，均未找到NapCat安装")
        
        ui.print_error("NapCat路径检测失败，请检查以下可能的原因：")
        ui.console.print("  • NapCat安装程序未正常完成安装")
        ui.console.print("  • 安装目录与预期不符")
        ui.console.print("  • 需要手动配置NapCat路径")
        logger.error("NapCat路径检测失败", install_dir=install_dir, max_attempts=max_attempts)
        return None

    def _setup_python_environment(self, maibot_path: str, adapter_path: str) -> str:
        """第四步：设置Python环境"""
        ui.console.print("\n[🐍 第四步：设置Python环境]", style=ui.colors["primary"])
        
        ui.print_info("正在创建Python虚拟环境...")
        venv_success, venv_path = self.create_virtual_environment(maibot_path)
        
        if venv_success:           
            requirements_path = os.path.join(maibot_path, "requirements.txt")
            
            ui.print_info("正在安装Python依赖...")
            deps_success = self.install_dependencies_in_venv(venv_path, requirements_path)
            
            # 安装适配器依赖（如果适配器存在且有requirements.txt）
            adapter_deps_success = True
            if adapter_path and adapter_path != "无需适配器" and not ("失败" in adapter_path or "版本较低" in adapter_path):
                adapter_requirements_path = os.path.join(adapter_path, "requirements.txt")
                if os.path.exists(adapter_requirements_path):
                    ui.print_info("正在安装适配器依赖...")
                    adapter_deps_success = self.install_dependencies_in_venv(venv_path, adapter_requirements_path)
                else:
                    ui.print_info("适配器无requirements.txt文件，跳过适配器依赖安装")

            if deps_success and adapter_deps_success:
                ui.print_success("✅ Python环境设置完成")
            else:
                ui.print_warning("⚠️ 依赖安装失败，但继续部署过程")
            
            return venv_path
        else:
            ui.print_warning("⚠️ 虚拟环境创建失败，将使用系统Python")
            return ""
    
    def _setup_config_files(self, deploy_config: Dict, **paths: str) -> bool:
        """第六步：配置文件设置"""
        ui.console.print("\n[⚙️ 第六步：配置文件设置]", style=ui.colors["primary"])
        maibot_path = paths["maibot_path"]
        adapter_path = paths["adapter_path"]
        napcat_path = paths["napcat_path"]
        mongodb_path = paths["mongodb_path"]
        webui_path = paths["webui_path"]
        
        try:
            # 创建config目录
            config_dir = os.path.join(maibot_path, "config")
            adapter_config_dir = os.path.join(maibot_path, "adapter") if adapter_path and adapter_path != "无需适配器" else None
            os.makedirs(config_dir, exist_ok=True)
            ui.print_info(f"创建config目录: {config_dir}")
            
            # 1. 处理MaiBot主程序配置文件
            ui.print_info("正在设置MaiBot配置文件...")
            
            # 复制bot_config_template.toml到config目录并重命名
            template_dir = os.path.join(maibot_path, "template")
            bot_config_template = os.path.join(template_dir, "bot_config_template.toml")
            bot_config_target = os.path.join(config_dir, "bot_config.toml")
            
            if os.path.exists(bot_config_template):
                shutil.copy2(bot_config_template, bot_config_target)
                ui.print_success(f"✅ bot_config.toml 配置完成")
                logger.info("bot_config.toml复制成功", source=bot_config_template, target=bot_config_target)
            else:
                ui.print_warning(f"⚠️ 未找到模板文件: {bot_config_template}")
                logger.warning("bot_config模板文件不存在", path=bot_config_template)
            
            # 复制template.env到根目录并重命名为.env
            env_template = os.path.join(template_dir, "template.env")
            env_target = os.path.join(maibot_path, ".env")
            
            if os.path.exists(env_template):
                shutil.copy2(env_template, env_target)
                
                # 修改.env文件中的PORT为8000
                try:
                    with open(env_target, 'r', encoding='utf-8') as f:
                        env_content = f.read()
                    
                    # 修改PORT配置
                    if 'PORT=' in env_content:
                        env_content = re.sub(r'PORT=\d+', 'PORT=8000', env_content)
                    else:
                        # 如果没有PORT配置，添加一个
                        env_content += '\nPORT=8000\n'
                    
                    with open(env_target, 'w', encoding='utf-8') as f:
                        f.write(env_content)
                    
                    ui.print_success(f"✅ .env 配置完成 (PORT=8000)")
                    logger.info(".env文件配置成功", target=env_target)
                    
                except Exception as e:
                    ui.print_warning(f"⚠️ .env文件PORT修改失败: {str(e)}")
                    logger.warning(".env文件修改失败", error=str(e))
                    
            else:
                ui.print_warning(f"⚠️ 未找到环境变量模板文件: {env_template}")
                logger.warning("env模板文件不存在", path=env_template)
            
            # 2. 处理适配器配置文件
            if adapter_path and adapter_path != "无需适配器" and not ("失败" in adapter_path or "版本较低" in adapter_path):
                ui.print_info("正在设置适配器配置文件...")
                
                # 检查适配器目录中的配置文件
                adapter_config_files = []
                adapter_template_dir = os.path.join(adapter_path, "template")
                
                if os.path.exists(adapter_template_dir):
                    # 查找适配器模板文件
                    for file in os.listdir(adapter_template_dir):
                        if file.endswith('.toml') or file.endswith('.json') or file.endswith('.yaml'):
                            adapter_config_files.append(file)
                
                if adapter_config_files:
                    for config_file in adapter_config_files:
                        source_file = os.path.join(adapter_template_dir, config_file)
                        
                        # 确定目标文件名（移除template前缀）
                        target_filename = config_file.replace('template_', '').replace('_template', '')
                        if target_filename.startswith('template.'):
                            target_filename = target_filename[9:]  # 移除 'template.'
                        
                        target_file = os.path.join(adapter_config_dir, target_filename)
                        
                        try:
                            shutil.copy2(source_file, target_file)
                            ui.print_success(f"✅ 适配器配置文件: {target_filename}")
                            logger.info("适配器配置文件复制成功", source=source_file, target=target_file)
                        except Exception as e:
                            ui.print_warning(f"⚠️ 适配器配置文件复制失败: {config_file} - {str(e)}")
                            logger.warning("适配器配置文件复制失败", error=str(e), file=config_file)
                else:
                    ui.print_info("适配器无需额外配置文件")
            
            # 3. 创建NapCat相关配置提示
            if napcat_path:
                ui.print_info("NapCat配置提醒:")
                ui.console.print("  • 请参考 https://docs.mai-mai.org/manual/adapters/napcat.html")
                ui.console.print("  • 配置QQ登录信息")
                ui.console.print("  • 设置WebSocket连接参数")
            
            # 4. MongoDB配置提示
            if mongodb_path:
                ui.print_info("MongoDB配置完成:")
                ui.console.print(f"  • MongoDB路径: {mongodb_path}")
                ui.console.print("  • 如需修改数据库配置，请编辑相关配置文件")
            
            # 5. WebUI配置提示
            if webui_path:
                ui.print_info("WebUI配置完成:")
                ui.console.print(f"  • WebUI路径: {webui_path}")
            
            ui.print_success("✅ 配置文件设置完成")
            logger.info("配置文件设置完成", maibot_path=maibot_path)
            return True
            
        except Exception as e:
            ui.print_error(f"配置文件设置失败: {str(e)}")
            logger.error("配置文件设置失败", error=str(e))
            return False

    def _run_deployment_steps(self, deploy_config: Dict) -> Dict[str, str]:
        """执行所有部署步骤"""
        paths = {
            "maibot_path": "",
            "adapter_path": "",
            "napcat_path": "",
            "venv_path": "",
            "webui_path": "",
            "mongodb_path": deploy_config.get("mongodb_path", ""),
        }

        # 步骤1：安装MaiBot
        paths["maibot_path"] = self._install_maibot(deploy_config)
        if not paths["maibot_path"]:
            raise Exception("MaiBot安装失败")

        # 步骤2：安装适配器
        if deploy_config.get("install_adapter"):
            paths["adapter_path"] = self._install_adapter_if_needed(deploy_config, paths["maibot_path"])

        # 步骤3：安装NapCat
        if deploy_config.get("install_napcat") and deploy_config.get("napcat_version"):
            paths["napcat_path"] = self._install_napcat(deploy_config, paths["maibot_path"])

        # 步骤4：安装WebUI
        if deploy_config.get("install_webui"):
            success, paths["webui_path"] = self._check_and_install_webui(deploy_config, paths["maibot_path"])
            if not success:
                ui.print_warning("WebUI安装检查失败，但部署将继续...")

        # 步骤5：设置Python环境
        paths["venv_path"] = self._setup_python_environment(paths["maibot_path"], paths["adapter_path"])
        
        if paths["webui_path"] and paths["venv_path"]:
            ui.console.print("\n[🔄 在虚拟环境中安装WebUI后端依赖]", style=ui.colors["primary"])
            webui_installer.install_webui_backend_dependencies(paths["webui_path"], paths["venv_path"])

        # 步骤6：配置文件设置
        if not self._setup_config_files(deploy_config, **paths):
            ui.print_warning("配置文件设置失败，但部署将继续...")

        return paths

    def _finalize_deployment(self, deploy_config: Dict, **paths: str) -> bool:
        """第七步：完成部署配置"""
        ui.console.print("\n[⚙️ 第七步：完成部署配置]", style=ui.colors["primary"])
        maibot_path = paths["maibot_path"]
        adapter_path = paths["adapter_path"]
        napcat_path = paths["napcat_path"]
        venv_path = paths["venv_path"]
        webui_path = paths["webui_path"]
        mongodb_path = paths["mongodb_path"]
        
        # 创建配置
        ui.print_info("正在创建实例配置...")
        
        # 根据部署选项创建安装选项配置
        install_options = {
            "install_adapter": bool(adapter_path and adapter_path not in ["无需适配器", "跳过适配器安装"]),
            "install_napcat": deploy_config.get("install_napcat", False),
            "install_mongodb": bool(deploy_config.get("mongodb_path", "")),
            "install_webui": deploy_config.get("install_webui", False)
        }
        
        new_config = {
            "serial_number": deploy_config["serial_number"],
            "absolute_serial_number": config_manager.generate_unique_serial(),
            "version_path": deploy_config["selected_version"]["name"],
            "nickname_path": deploy_config["nickname"],
            "qq_account": deploy_config.get("qq_account", ""),
            "mai_path": maibot_path,
            "adapter_path": adapter_path,
            "napcat_path": napcat_path,
            "venv_path": venv_path,
            "mongodb_path": mongodb_path,
            "webui_path": webui_path,
            "install_options": install_options
        }
        
        # 保存配置
        config_name = f"instance_{deploy_config['serial_number']}"
        if not config_manager.add_configuration(config_name, new_config):
            ui.print_error("配置保存失败")
            return False
        
        config_manager.set("current_config", config_name)
        config_manager.save()
        ui.print_success("实例配置创建完成")
        
        # 显示配置摘要
        ui.console.print("\n[📋 部署摘要]", style=ui.colors["info"])
        ui.console.print(f"实例名称：{deploy_config['nickname']}")
        ui.console.print(f"序列号：{deploy_config['serial_number']}")
        ui.console.print(f"版本：{deploy_config['selected_version']['name']}")
        ui.console.print(f"安装路径：{maibot_path}")
        
        ui.console.print("\n[🔧 已安装组件]", style=ui.colors["success"])
        ui.console.print(f"  • MaiBot主体：✅")
        ui.console.print(f"  • 适配器：{'✅' if install_options['install_adapter'] else '❌'}")
        ui.console.print(f"  • NapCat：{'✅' if install_options['install_napcat'] else '❌'}")
        ui.console.print(f"  • MongoDB：{'✅' if install_options['install_mongodb'] else '❌'}")
        ui.console.print(f"  • WebUI：{'✅' if install_options['install_webui'] else '❌'}")
        
        ui.print_success("✅ 部署配置完成")
        logger.info("配置创建成功", config=new_config)
        return True
    
    def _show_post_deployment_info(self):
        """显示部署后的信息"""
        ui.console.print("\n[📝 后续配置提醒]", style=ui.colors["info"])
        ui.console.print("1. 配置 .env 文件中的API密钥")
        ui.console.print("2. 修改 config.toml 中的机器人配置")
        ui.console.print("3. 如需要知识库功能，配置相关设置")
        ui.console.print("4. 如安装了NapCat，请配置QQ登录信息")
        ui.console.print("\n您现在可以通过主菜单的启动选项来运行该实例")
    
    def update_instance(self) -> bool:
        """更新实例"""
        try:
            ui.clear_screen()
            ui.console.print("[🔄 实例更新]", style=ui.colors["warning"])
            ui.console.print("="*30)
            
            # 网络连接检查
            ui.print_info("检查网络连接...")
            network_status, message = self.check_network_connection()
            if not network_status:
                ui.print_error(f"网络连接失败: {message}")
                ui.print_warning("由于需要从GitHub下载最新版本，更新功能必须在网络正常时使用")
                ui.print_info("建议：")
                ui.console.print("  • 检查您的网络连接")
                ui.console.print("  • 确认是否需要设置代理")
                ui.console.print("  • 尝试使用VPN连接")
                ui.pause()
                return False
            else:
                ui.print_success("网络连接正常")
                self._offline_mode = False
            
            # 选择要更新的实例
            from ..modules.config_manager import config_mgr
            config = config_mgr.select_configuration()
            if not config:
                return False
            
            mai_path = config.get("mai_path", "")
            if not mai_path or not os.path.exists(mai_path):
                ui.print_error("实例路径无效")
                return False
            
            # 获取当前版本
            current_version = config.get("version_path", "unknown")
            ui.print_info(f"当前版本：{current_version}")
            
            # 选择新版本
            new_version_data = self.show_version_menu()
            if not new_version_data:
                return False
            
            new_version = new_version_data["name"]
            
            if new_version == current_version:
                ui.print_warning("选择的版本与当前版本相同")
                if not ui.confirm("是否强制重新安装？"):
                    return False
            
            # 备份提醒
            ui.print_warning("更新前建议备份重要文件：")
            ui.console.print("  • .env 文件（API密钥）")
            ui.console.print("  • config.toml（配置文件）")
            ui.console.print("  • data/ 目录（数据文件）")
            ui.console.print("  • *.db 文件（数据库文件）")
            
            if not ui.confirm("是否已完成备份并继续更新？"):
                ui.print_info("更新已取消")
                return False
            
            # 开始更新
            ui.print_info("开始更新实例...")
            logger.info("开始更新实例", current_version=current_version, new_version=new_version)
            
            # 创建备份
            backup_dir = f"{mai_path}_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            ui.print_info("创建备份...")
            shutil.copytree(mai_path, backup_dir)
            ui.print_success(f"备份创建完成：{backup_dir}")
            
            try:
                # 创建临时目录下载新版本
                with tempfile.TemporaryDirectory() as temp_dir:
                    # 下载新版本
                    download_url = new_version_data["download_url"]
                    archive_path = os.path.join(temp_dir, f"{new_version}.zip")
                    
                    if not self.download_file(download_url, archive_path):
                        raise Exception("下载新版本失败")
                    
                   
                    # 解压新版本
                    if not self.extract_archive(archive_path, temp_dir):
                        raise Exception("解压新版本失败")
                    
                    # 查找解压后的目录
                    extracted_dirs = [d for d in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, d)) and d != "__MACOSX"]
                    if not extracted_dirs:
                        raise Exception("解压后未找到项目目录")
                    
                    source_dir = os.path.join(temp_dir, extracted_dirs[0])
                    
                    # 保护重要文件
                    protected_files = [".env", "config.toml", "bot_config.toml", "data", "*.db"]
                    protected_data = {}
                    
                    for pattern in protected_files:
                        if '*' in pattern:
                            matching_files = glob.glob(os.path.join(mai_path, pattern))
                            for file_path in matching_files:
                                if os.path.exists(file_path):
                                    rel_path = os.path.relpath(file_path, mai_path)
                                    if os.path.isfile(file_path):
                                        with open(file_path, 'rb') as f:
                                            protected_data[rel_path] = f.read()
                                    elif os.path.isdir(file_path):
                                        temp_backup = os.path.join(temp_dir, f"backup_{rel_path}")
                                        shutil.copytree(file_path, temp_backup)
                                        protected_data[rel_path] = temp_backup
                        else:
                            file_path = os.path.join(mai_path, pattern)
                            if os.path.exists(file_path):
                                if os.path.isfile(file_path):
                                    with open(file_path, 'rb') as f:
                                        protected_data[pattern] = f.read()
                                elif os.path.isdir(file_path):
                                    temp_backup = os.path.join(temp_dir, f"backup_{pattern}")
                                    shutil.copytree(file_path, temp_backup)
                                    protected_data[pattern] = temp_backup
                    
                    # 删除旧版本文件（保留protected_files）
                    ui.print_info("删除旧版本文件...")
                    for item in os.listdir(mai_path):
                        item_path = os.path.join(mai_path, item)
                        if item not in protected_files and not any(item.endswith(ext) for ext in ['.db']):
                            if os.path.isfile(item_path):
                                os.remove(item_path)
                            elif os.path.isdir(item_path) and item != 'data':
                                shutil.rmtree(item_path)
                    
                    # 复制新版本文件
                    ui.print_info("复制新版本文件...")
                    for item in os.listdir(source_dir):
                        src_path = os.path.join(source_dir, item)
                        dst_path = os.path.join(mai_path, item)
                        
                        if item in protected_data:
                            continue  # 跳过受保护的文件
                        
                        if os.path.isfile(src_path):
                            shutil.copy2(src_path, dst_path)
                        elif os.path.isdir(src_path):
                            if os.path.exists(dst_path):
                                shutil.rmtree(dst_path)
                            shutil.copytree(src_path, dst_path)
                    
                    # 恢复保护的文件
                    ui.print_info("恢复配置文件...")
                    for rel_path, data in protected_data.items():
                        target_path = os.path.join(mai_path, rel_path)
                        
                        if isinstance(data, bytes):
                            # 文件数据
                            os.makedirs(os.path.dirname(target_path), exist_ok=True)
                            with open(target_path, 'wb') as f:
                                f.write(data)
                        elif isinstance(data, str) and os.path.isdir(data):
                            # 目录备份
                            if os.path.exists(target_path):
                                shutil.rmtree(target_path)
                            shutil.copytree(data, target_path)
                
                # 更新依赖
                requirements_path = os.path.join(mai_path, "requirements.txt")
                if os.path.exists(requirements_path):
                    # 检查是否有虚拟环境
                    venv_path = config.get("venv_path", "")
                    if venv_path and os.path.exists(venv_path):
                        # 使用虚拟环境更新依赖
                        ui.print_info("正在虚拟环境中更新依赖...")
                        if platform.system() == "Windows":
                            pip_exe = os.path.join(venv_path, "Scripts", "pip.exe")
                        else:
                            pip_exe = os.path.join(venv_path, "bin", "pip")
                        
                        if os.path.exists(pip_exe):
                            try:
                                subprocess.run([
                                    pip_exe, "install", "-r", requirements_path, "--upgrade", 
                                    "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"
                                ], check=True)
                                ui.print_success("依赖更新完成")
                            except subprocess.CalledProcessError:
                                ui.print_warning("依赖更新失败，请手动更新")
                        else:
                            ui.print_warning("虚拟环境中的pip未找到，尝试重新创建虚拟环境")
                            # 重新创建虚拟环境并安装依赖
                            venv_success, new_venv_path = self.create_virtual_environment(mai_path)
                            if venv_success:
                                deps_success = self.install_dependencies_in_venv(new_venv_path, requirements_path)
                                if deps_success:
                                    # 更新配置中的虚拟环境路径
                                    config["venv_path"] = new_venv_path
                    else:
                        # 没有虚拟环境，创建一个新的
                        ui.print_info("创建虚拟环境并安装依赖...")
                        venv_success, new_venv_path = self.create_virtual_environment(mai_path)
                        if venv_success:
                            deps_success = self.install_dependencies_in_venv(new_venv_path, requirements_path)
                            if deps_success:
                                # 更新配置中的虚拟环境路径
                                config["venv_path"] = new_venv_path
                        else:
                            ui.print_warning("虚拟环境创建失败，使用系统Python安装依赖")
                            try:
                                subprocess.run([
                                    "pip", "install", "-r", requirements_path, "--upgrade", 
                                    "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"
                                ], check=True)
                                ui.print_success("依赖更新完成")
                            except subprocess.CalledProcessError:
                                ui.print_warning("依赖更新失败，请手动更新")
                
                # 更新配置中的版本号
                config["version_path"] = new_version
                
                # 找到配置名称并保存
                configurations = config_manager.get_all_configurations()
                for name, cfg in configurations.items():
                    if cfg.get("serial_number") == config.get("serial_number"):
                        config_manager.add_configuration(name, config)
                        config_manager.save()
                        break
                
                ui.print_success(f"🎉 实例更新完成！新版本：{new_version_data['display_name']}")
                ui.print_info(f"备份文件位置：{backup_dir}")
                ui.print_info("如果更新后出现问题，可以从备份恢复")
                logger.info("实例更新成功", new_version=new_version)
                return True
                
            except Exception as e:
                # 更新失败，尝试从备份恢复
                ui.print_error(f"更新失败：{str(e)}")
                ui.print_warning("正在从备份恢复...")
                
                try:
                    if os.path.exists(mai_path):
                        shutil.rmtree(mai_path)
                    shutil.copytree(backup_dir, mai_path)
                    ui.print_success("已从备份恢复")
                except Exception as restore_error:
                    ui.print_error(f"备份恢复失败：{str(restore_error)}")
                    ui.print_error(f"请手动从 {backup_dir} 恢复文件")
                
                logger.error("实例更新失败", error=str(e))
                return False
            
        except Exception as e:
            ui.print_error(f"更新过程出错：{str(e)}")
            logger.error("更新过程异常", error=str(e))
            return False
    
    def delete_instance(self) -> bool:
        """删除实例"""
        try:
            ui.clear_screen()
            ui.console.print("[🗑️ 实例删除]", style=ui.colors["error"])
            ui.console.print("="*20)
            
            ui.print_warning("⚠️ 危险操作警告 ⚠️")
            ui.console.print("此操作将：")
            ui.console.print("  • 删除实例的所有文件")
            ui.console.print("  • 删除相关配置")
            ui.console.print("  • 此操作不可撤销")
            
            # 选择要删除的实例
            from ..modules.config_manager import config_mgr
            config = config_mgr.select_configuration()
            if not config:
                return False
            
            nickname = config.get("nickname_path", "未知")
            serial_number = config.get("serial_number", "未知")
            mai_path = config.get("mai_path", "")
            
            ui.console.print(f"\n[要删除的实例信息]", style=ui.colors["error"])
            ui.console.print(f"昵称：{nickname}")
            ui.console.print(f"序列号：{serial_number}")
            ui.console.print(f"路径：{mai_path}")
            
            # 三次确认
            ui.print_warning("\n请进行三次确认以防误操作：")
            
            if not ui.confirm("第一次确认：是否删除此实例？"):
                ui.print_info("操作已取消")
                return False
            
            if not ui.confirm("第二次确认：此操作将永久删除所有文件，确定继续？"):
                ui.print_info("操作已取消")
                return False
            
            confirm_text = f"delete-{serial_number}"
            user_input = ui.get_input(f"第三次确认：请输入 '{confirm_text}' 以确认删除：")
            if user_input != confirm_text:
                ui.print_error("确认文本不匹配，操作已取消")
                return False
            
            # 开始删除
            ui.print_info("正在删除实例...")
            logger.info("开始删除实例", serial=serial_number, nickname=nickname)
            
                # 删除文件
            if mai_path and os.path.exists(mai_path):
                try:
                    # 检查是否是MaiBot目录
                    if os.path.basename(mai_path) == "MaiBot" or "MaiBot" in mai_path:
                        # 删除整个项目目录的父目录
                        project_root = os.path.dirname(mai_path)
                        if os.path.exists(project_root):
                            shutil.rmtree(project_root)
                            ui.print_success("实例文件删除完成")
                            logger.info("实例文件删除成功", path=project_root)
                    else:
                        ui.print_warning("路径格式异常，跳过文件删除")
                except Exception as e:
                    ui.print_error(f"删除文件失败：{str(e)}")
                    logger.error("删除文件失败", error=str(e))
                    return False
            
            # 删除配置
            configurations = config_manager.get_all_configurations()
            config_name = None
            for name, cfg in configurations.items():
                if cfg.get("serial_number") == serial_number:
                    config_name = name
                    break
            
            if config_name:
                if config_manager.delete_configuration(config_name):
                    config_manager.save()
                    ui.print_success("配置删除完成")
                    logger.info("配置删除成功", config_name=config_name)
                else:
                    ui.print_error("配置删除失败")
                    return False
            
            ui.print_success(f"🗑️ 实例 '{nickname}' 删除完成")
            logger.info("实例删除完成", serial=serial_number)
            return True
            
        except Exception as e:
            ui.print_error(f"删除失败：{str(e)}")
            logger.error("实例删除失败", error=str(e))
            return False
    
    def _check_and_install_webui(self, deploy_config: Dict, maibot_path: str, venv_path: str = "") -> Tuple[bool, str]:
        """检查并安装WebUI（如果需要）"""
        try:
            ui.console.print("\n[🌐 WebUI安装检查]", style=ui.colors["primary"])
            
            # 获取安装目录
            install_dir = deploy_config.get("install_dir", "")
            
            logger.info("开始WebUI安装检查", install_dir=install_dir, maibot_path=maibot_path)
            
            # 调用WebUI安装器进行直接安装，传入虚拟环境路径
            success, webui_path = webui_installer.install_webui_directly(install_dir, venv_path)
            
            if success:
                ui.print_success("✅ WebUI安装检查完成")
                if webui_path:
                    ui.print_info(f"WebUI安装路径: {webui_path}")
            else:
                ui.print_warning("⚠️ WebUI安装检查出现问题")
            
            return success, webui_path
            
        except Exception as e:
            ui.print_error(f"WebUI安装检查失败：{str(e)}")
            logger.error("WebUI安装检查失败", error=str(e))
            return False, ""
    

# 全局部署管理器实例
deployment_manager = DeploymentManager()
