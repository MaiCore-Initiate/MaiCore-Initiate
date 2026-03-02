# -*- coding: utf-8 -*-
"""
NapCat下载器
与deployment.py中的逻辑保持一致
"""

import os
import tempfile
from pathlib import Path
from typing import Optional, Dict, List
import structlog

from ...ui.interface import ui
from .base_downloader import BaseDownloader
from ...modules.deployment_core.napcat_deployer import NapCatDeployer

logger = structlog.get_logger(__name__)


class NapCatDownloader(BaseDownloader):
    """NapCat下载器"""
    
    def __init__(self):
        super().__init__("NapCat")
        self.napcat_deployer = NapCatDeployer()
    
    def get_napcat_versions(self) -> List[Dict]:
        """获取NapCat版本列表"""
        import time
        
        # 重试配置
        max_retries = 3
        retry_delay = 5  # 秒
        
        for attempt in range(max_retries):
            try:
                # 使用deployment_manager的方法
                if attempt > 0:
                    ui.print_info(f"重试获取NapCat版本列表... (尝试 {attempt + 1}/{max_retries})")
                
                versions = self.napcat_deployer.get_napcat_versions()
                return versions
                
            except Exception as e:
                error_msg = str(e)
                if attempt < max_retries - 1:
                    # 还有重试机会
                    ui.print_warning(f"获取版本列表失败: {error_msg}，等待 {retry_delay} 秒后重试...")
                    logger.warning("获取NapCat版本列表失败，准备重试", 
                                 error=error_msg,
                                 attempt=attempt + 1,
                                 max_retries=max_retries)
                    time.sleep(retry_delay)
                    retry_delay *= 1.5  # 指数退避
                else:
                    # 最后一次尝试失败
                    ui.print_error(f"获取NapCat版本列表失败（已重试{max_retries}次）：{error_msg}")
                    logger.error("获取NapCat版本列表失败，重试耗尽", 
                               error=error_msg,
                               total_attempts=max_retries)
                    ui.print_info("将使用默认版本列表")
                    # 返回默认版本
                    return self._get_default_versions()
        
        # 理论上不会到这里，但作为保险返回默认版本
        return self._get_default_versions()
    
    def _get_default_versions(self) -> List[Dict]:
        """获取默认版本列表"""
        return [
            {
                "name": "v4.8.90-shell",
                "display_name": "v4.8.90 基础版 (推荐)",
                "description": "最推荐的版本，适合大多数用户",
                "download_url": "https://github.com/NapNeko/NapCatQQ/releases/download/v4.8.90/NapCat.Shell.zip",
                "asset_name": "NapCat.Shell.zip",
                "version": "v4.8.90"
            },
            {
                "name": "v4.8.90-framework-onekey",
                "display_name": "v4.8.90 有头一键包",
                "description": "带QQ界面的一键包版本，适合挂机器人的同时附体发消息",
                "download_url": "https://github.com/NapNeko/NapCatQQ/releases/download/v4.8.90/NapCat.Framework.Windows.OneKey.zip",
                "asset_name": "NapCat.Framework.Windows.OneKey.zip",
                "version": "v4.8.90"
            },
            {
                "name": "v4.8.90-shell-onekey",
                "display_name": "v4.8.90 无头一键包",
                "description": "无界面的一键包版本",
                "download_url": "https://github.com/NapNeko/NapCatQQ/releases/download/v4.8.90/NapCat.Shell.Windows.OneKey.zip",
                "asset_name": "NapCat.Shell.Windows.OneKey.zip",
                "version": "v4.8.90"
            }
        ]
    
    def select_version(self) -> Optional[Dict]:
        """选择NapCat版本"""
        # 是否使用默认版本（重试耗尽的标记）
        using_fallback = False
        
        while True:  # 外层循环，支持重新获取
            try:
                # 获取版本列表
                versions = self.get_napcat_versions()
                
                if not versions:
                    ui.print_error("未找到可用的NapCat版本")
                    return None
                
                # 检查是否是默认版本（表示获取失败）
                # 默认版本的特征：只有3个版本且都是 v4.8.90，且都是拼接的URL
                if (len(versions) == 3 and 
                    all(v.get("version") == "v4.8.90" for v in versions) and
                    all("github.com/NapNeko/NapCatQQ/releases/download/v4.8.90" in v.get("download_url", "") for v in versions)):
                    using_fallback = True
                else:
                    using_fallback = False
                
                # 显示版本选择菜单
                ui.clear_screen()
                ui.components.show_title("选择NapCat版本", symbol="🐱")
                
                # 创建版本表格
                from rich.table import Table
                table = Table(
                    show_header=True,
                    header_style=ui.colors["table_header"],
                    title="[bold]NapCat 可用版本[/bold]",
                    title_style=ui.colors["primary"],
                    border_style=ui.colors["border"],
                    show_lines=True
                )
                table.add_column("选项", style="cyan", width=6, justify="center")
                table.add_column("版本", style=ui.colors["primary"], width=20)
                table.add_column("类型", style="yellow", width=15, justify="center")
                table.add_column("说明", style="green")
                
                # 显示版本信息
                for i, version in enumerate(versions, 1):
                    # 提取版本类型
                    version_type = "基础版" if "shell" in version["name"] and "onekey" not in version["name"] else \
                                   "有头一键包" if "framework" in version["name"] else \
                                   "无头一键包" if "shell" in version["name"] and "onekey" in version["name"] else "未知"
                    
                    table.add_row(
                        f"[{i}]",
                        version["display_name"],
                        version_type,
                        version["description"]
                    )
                
                ui.console.print(table)
                
                # 根据是否使用默认版本显示不同提示
                if using_fallback:
                    ui.console.print("\n[yellow]⚠ 由于网络问题，当前显示的是默认版本列表[/yellow]", style=ui.colors["warning"])
                    ui.console.print("[Enter] 使用默认版本(第一个选项)  [R] 重新获取版本列表  [Q] 跳过NapCat下载", style=ui.colors["info"])
                else:
                    ui.console.print("\n[Enter] 使用默认版本(第一个选项)  [Q] 跳过NapCat下载", style=ui.colors["info"])
                
                ui.console.print("提示：推荐使用基础版，适合大多数用户", style=ui.colors["success"])
                
                while True:  # 内层循环，处理用户选择
                    choice = ui.get_input("请选择NapCat版本(直接回车使用默认版本)：").strip()
                    
                    # 如果用户直接按回车，使用默认版本(第一个选项)
                    if choice == "":
                        ui.print_info("使用默认版本: " + versions[0]["display_name"])
                        return versions[0]
                    
                    if choice.upper() == 'Q':
                        return None
                    
                    # 如果是默认版本列表，允许重新获取
                    if choice.upper() == 'R' and using_fallback:
                        ui.print_info("正在重新获取版本列表...")
                        # 清除缓存，强制刷新
                        self.napcat_deployer.clear_napcat_versions_cache()
                        break  # 跳出内层循环，重新获取版本
                    elif choice.upper() == 'R' and not using_fallback:
                        ui.print_warning("当前版本列表是最新的，无需刷新")
                        continue
                    
                    try:
                        choice_num = int(choice)
                        if 1 <= choice_num <= len(versions):
                            selected_version = versions[choice_num - 1]
                            ui.print_info("已选择版本: " + selected_version["display_name"])
                            return selected_version
                        else:
                            ui.print_error("无效选项，请重新选择")
                    except ValueError:
                        if using_fallback:
                            ui.print_error("请输入有效的数字、直接回车使用默认版本、或输入 R 重新获取")
                        else:
                            ui.print_error("请输入有效的数字或直接回车使用默认版本")
                        
            except Exception as e:
                ui.print_error(f"选择NapCat版本时发生错误：{str(e)}")
                logger.error("NapCat版本选择失败", error=str(e))
                return None
    
    def download_and_install(self, temp_dir: Path, auto_select_latest: bool = False, task_id: str | None = None, progress_cb=None, non_interactive: bool = False, is_canceled_callback=None) -> bool:
        """下载并安装NapCat
        auto_select_latest/non_interactive: 非交互模式（WebUI使用），自动选最新版并使用默认路径
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
                versions = self.get_napcat_versions()
                selected_version = versions[0] if versions else None
                if not selected_version:
                    ui.print_error("未找到可用的NapCat版本")
                    if progress_cb:
                        progress_cb({"status": "failed", "phase": "failed", "message": "未找到版本"})
                    return False
                if progress_cb:
                    progress_cb({"phase": "preparing", "status": "running", "percent": 5, "message": "准备中"})
            else:
                selected_version = self.select_version()
                if not selected_version:
                    ui.print_info("已跳过NapCat下载")
                    if progress_cb:
                        progress_cb({"status": "done", "phase": "skipped", "percent": 100, "message": "已跳过"})
                    return True

            # 让用户指定下载目标路径
            import os
            user_downloads = Path.home() / "Downloads" / "NapCat"

            if non_interactive:
                target_dir = user_downloads
                target_dir.mkdir(parents=True, exist_ok=True)
            else:
                ui.print_info("\n请指定NapCat的下载目标路径")
                ui.print_info("提示：建议使用绝对路径，例如: D:\\NapCat")
                ui.print_info(f"默认路径: {user_downloads}")

                while True:
                    target_path_str = ui.get_input(f"请输入目标路径（留空使用默认路径）：").strip()

                    if not target_path_str:
                        target_dir = user_downloads
                        ui.print_info(f"使用默认路径: {target_dir}")
                    else:
                        target_dir = Path(target_path_str)

                    # 检查路径是否有效
                    try:
                        target_dir.parent.mkdir(parents=True, exist_ok=True)
                        target_dir.mkdir(parents=True, exist_ok=True)
                        break
                    except Exception as e:
                        ui.print_error(f"无效的路径或无法创建目录: {str(e)}")
                        ui.print_info("请重新输入有效的路径")

            # 获取下载链接
            download_url = selected_version["download_url"]
            asset_name = selected_version.get("asset_name", "NapCat.zip")

            # 在目标目录下创建NapCat子文件夹，处理同名冲突
            base_folder_name = "NapCat"
            napcat_folder = target_dir / base_folder_name
            counter = 1

            # 如果文件夹已存在，添加序号
            while napcat_folder.exists():
                napcat_folder = target_dir / f"{base_folder_name}({counter})"
                counter += 1

            # 创建NapCat子文件夹
            napcat_folder.mkdir(parents=True, exist_ok=True)
            ui.print_info(f"将解压到: {napcat_folder}")

            # 创建临时文件
            with tempfile.TemporaryDirectory() as temp_download_dir:
                temp_file = Path(temp_download_dir) / asset_name

                ui.print_info(f"开始下载NapCat {selected_version['display_name']}...")
                if progress_cb:
                    progress_cb({"phase": "downloading", "status": "running", "percent": 10, "filename": asset_name})

                # 下载文件
                if not self.download_file(download_url, str(temp_file), progress_callback=progress_cb, is_canceled_callback=is_canceled_callback):
                    if progress_cb:
                        progress_cb({"status": "failed", "phase": "failed", "message": "下载失败"})
                    return False

                # 检查是否已取消
                if is_canceled_callback and is_canceled_callback():
                    ui.print_warning("安装已取消")
                    if progress_cb:
                        progress_cb({"status": "canceled", "phase": "canceled", "message": "已取消"})
                    return False

                ui.print_info("正在解压NapCat到目标目录...")
                if progress_cb:
                    progress_cb({"phase": "installing", "status": "running", "percent": 90, "message": "解压中"})

                if asset_name.endswith('.zip'):
                    import zipfile
                    with zipfile.ZipFile(temp_file, 'r') as zip_ref:
                        zip_ref.extractall(napcat_folder)
                else:
                    # 如果不是zip文件，直接复制
                    import shutil
                    shutil.copy2(temp_file, napcat_folder)
                
                ui.print_success(f"NapCat下载完成！文件位置: {napcat_folder}")
                logger.info("NapCat下载成功", version=selected_version['display_name'], path=str(napcat_folder))

                # 查找NapCat安装程序
                installer_exe = None

                for root, dirs, files in os.walk(napcat_folder):
                    for file in files:
                        # 查找安装程序
                        if file.lower() == 'napcatinstaller.exe':
                            installer_exe = os.path.join(root, file)
                            break
                    if installer_exe:
                        break

                # 如果找到安装程序，询问是否自动安装
                if installer_exe and os.path.exists(installer_exe):
                    ui.print_info(f"\n找到NapCat安装程序: {installer_exe}")

                    if non_interactive or ui.confirm("是否自动运行NapCat安装程序？"):
                        installer_success = self._run_installer(installer_exe, napcat_folder)
                        if installer_success:
                            ui.print_success("NapCat安装程序已成功启动")
                            if progress_cb:
                                progress_cb({"status": "done", "phase": "done", "percent": 100, "message": "完成"})
                            return True
                        else:
                            ui.print_error("NapCat安装程序启动失败")
                            if progress_cb:
                                progress_cb({"status": "failed", "phase": "failed", "message": "安装程序启动失败"})
                            return False
                    else:
                        ui.print_info("您可以稍后手动运行安装程序")
                        ui.print_info(f"安装程序位置: {installer_exe}")
                        if progress_cb:
                            progress_cb({"status": "done", "phase": "done", "percent": 100, "message": "完成"})
                        return True
                else:
                    ui.print_info("\n文件已解压完成")
                    ui.print_info(f"文件位置: {napcat_folder}")
                    if progress_cb:
                        progress_cb({"status": "done", "phase": "done", "percent": 100, "message": "完成"})
                    return True

        except Exception as e:
            ui.print_error(f"下载NapCat时发生错误：{str(e)}")
            logger.error("NapCat下载安装失败", error=str(e))
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": str(e)})
            return False
    
    def _run_installer(self, installer_path: str, extract_dir: Path) -> bool:
        """运行NapCat安装程序"""
        try:
            ui.print_info("正在启动NapCat安装程序...")
            
            # 使用napcat_deployer的方法
            return self.napcat_deployer.run_napcat_installer(installer_path)
            
        except Exception as e:
            ui.print_error(f"运行NapCat安装程序失败：{str(e)}")
            logger.error("NapCat安装程序运行失败", error=str(e))
            return False
    
    def check_installation(self) -> tuple[bool, str]:
        """检查NapCat是否已安装"""
        try:
            # 使用napcat_deployer的方法
            napcat_path = self.napcat_deployer.find_installed_napcat("")
            if napcat_path:
                return True, f"NapCat 已安装，位置: {napcat_path}"
            else:
                return False, "NapCat 未安装"
        except Exception as e:
            ui.print_error(f"检查NapCat安装状态时发生错误：{str(e)}")
            logger.error("NapCat安装状态检查失败", error=str(e))
            return False, f"检查安装状态时发生错误: {str(e)}"
    
    def download_and_install_to_directory(self, target_dir: Path) -> bool:
        """下载并安装NapCat到指定目录"""
        try:
            # 获取版本列表
            versions = self.get_napcat_versions()
            if not versions:
                ui.print_error("未找到可用的NapCat版本")
                return False
            
            # 让用户选择版本
            selected_version = self.select_version()
            if not selected_version:
                ui.print_info("用户取消了版本选择")
                return True
            
            # 下载并安装
            return self._download_and_install_version(selected_version, target_dir)
            
        except Exception as e:
            ui.print_error(f"下载并安装NapCat到目录失败：{str(e)}")
            logger.error("NapCat目录安装失败", error=str(e))
            return False
    
    def _download_and_install_version(self, version: Dict, target_dir: Path) -> bool:
        """下载并安装指定版本的NapCat"""
        try:
            download_url = version["download_url"]
            asset_name = version.get("asset_name", "NapCat.zip")
            
            # 创建临时目录
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_file = Path(temp_dir) / asset_name
                
                ui.print_info(f"正在下载NapCat {version['display_name']}...")
                
                # 下载文件
                if not self.download_file(download_url, str(temp_file)):
                    return False
                
                # 解压到目标目录
                ui.print_info("正在解压NapCat文件...")
                
                if asset_name.endswith('.zip'):
                    import zipfile
                    with zipfile.ZipFile(temp_file, 'r') as zip_ref:
                        zip_ref.extractall(target_dir)
                else:
                    # 如果不是zip文件，直接复制
                    import shutil
                    shutil.copy2(temp_file, target_dir / asset_name)
                
                ui.print_success(f"NapCat {version['display_name']} 已下载到: {target_dir}")
                logger.info("NapCat版本下载成功", version=version['display_name'], path=str(target_dir))
                
                return True
                
        except Exception as e:
            ui.print_error(f"下载NapCat版本失败：{str(e)}")
            logger.error("NapCat版本下载失败", error=str(e))
            return False